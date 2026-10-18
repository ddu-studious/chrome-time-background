// 联调验收：Chrome 一侧的真实模块（AlarmDesktop / JellyDesktop / JellyNudge / AlarmCountdown / AlarmCore / AssistantNative / AssistantEngine，源码原样加载）经 connectNative 替身，
// 连接真实的原生组件进程，走完“常驻 → 喝水提醒 → 点按钮 → 计数与记录刷新 → 倒计时委托与菜单动作 → 到点响铃 → 桌面 AI 助手 → 断线重连 → 菜单退出 → 临时出现”整条链路。
// 这是介于“各自用替身的单元测试”与“真实 Chrome”之间的一层：协议字段、回执与生命周期由两端真实代码互相检验。
// 仍然不是真实 Chrome：没有 Service Worker 休眠、没有真实 Native Messaging 宿主清单、存储/闹钟/通知都是内存替身。
//   node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
//   node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-mouse] [--quiet=秒]
// 不读写真实闹钟、喝水记录或设置；原生组件用独立 Bundle ID；点击只发生在水母自己的窗口上。
// 礼让用户（desktop-reminder/user-quiet.mjs）：4d（桌面 AI 助手）的面板会拿走键盘焦点，进入前先等用户至少安静 --quiet=秒（默认 20），
// 运行中发现真实键盘 / 鼠标输入就立刻撤掉面板，并以退出码 75（稍后重试，不算验收失败）结束。
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { Quiet, EXIT_USER_ACTIVE } from './user-quiet.mjs';

const require = createRequire(import.meta.url);
const AlarmDesktop = require('../js/alarm-desktop.js');
const JellyDesktop = require('../js/jelly-desktop.js');
const JellyNudge = require('../js/jelly-nudge.js');
const JellyErrandsCore = require('../js/jelly-errands-core.js');
const JellyErrands = require('../js/jelly-errands.js');
const AlarmCountdown = require('../js/alarm-countdown.js');
const AlarmCore = require('../js/alarm-core.js');
const AssistantEngine = require('../js/assistant-engine.js');
const AssistantNative = require('../js/assistant-native.js');

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg('extension-id');
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = arg('app');
if (!app) throw new Error('必须用 --app 指向隔离构建，避免改写真实组件的窗口记忆');
const withMouse = !process.argv.includes('--no-mouse');
const quiet = new Quiet(Number(arg('quiet') ?? 20));
let interrupted = null;      // 4d 期间发现真实输入的原因（见顶部说明）；有值时不把后续断言失败当作验收失败
let helper = null;
if (withMouse) {
  helper = resolve('/tmp', `tk-mouse-helper-${process.pid}`);
  execFileSync('/usr/bin/xcrun', ['swiftc', resolve(root, 'desktop-reminder/mouse-helper.swift'), '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', helper], { stdio: 'inherit' });
}
const mouse = (...a) => { try { return execFileSync(helper, a.map(String)); } finally { quiet.touch(); } };   // 合成输入会重置系统空闲时间，记下来才分得清哪些是真实用户
const frameOf = text => { const m = text.match(/\{\{(-?[\d.]+), (-?[\d.]+)\}, \{([\d.]+), ([\d.]+)\}\}/); return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] }; };
const center = text => { const f = frameOf(text); return { x: f.x + f.w / 2, y: f.y + f.h / 2 }; };

// ---------- 替身：内存存储、闹钟、通知；connectNative 启动真实原生进程 ----------
function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(data);
      return Object.fromEntries(list.filter(key => key in data).map(key => [key, structuredClone(data[key])]));
    },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}
function fakeAlarms() {
  const map = new Map();
  return {
    map,
    async create(name, info) { map.set(name, { name, scheduledTime: Date.now() + (info.delayInMinutes || 0) * 60000, periodInMinutes: info.periodInMinutes }); },
    async clear(name) { return map.delete(name); },
    async get(name) { return map.get(name); },
  };
}
function fakeNotifications() {
  const created = [];
  return { created, async create(notificationId, options) { created.push({ id: notificationId, ...options }); }, async clear() { return true; }, async getAll() { return {}; }, async getPermissionLevel() { return 'granted'; } };
}
const frame = value => { const body = Buffer.from(JSON.stringify(value)); const header = Buffer.alloc(4); header.writeUInt32LE(body.length); return Buffer.concat([header, body]); };

function nativeRuntime(env = {}) {
  const runtime = { lastError: null, ports: [] };
  let probeSeq = 0;
  runtime.connectNative = name => {
    assert.equal(name, 'com.timekeeper.desktop', '宿主名称');
    const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', ...env } });
    const listeners = { message: [], disconnect: [] };
    const probes = new Map();
    let local = false, buffer = Buffer.alloc(0);
    const port = {
      child, exited: false, received: [],
      onMessage: { addListener: fn => listeners.message.push(fn) },
      onDisconnect: { addListener: fn => listeners.disconnect.push(fn) },
      postMessage(message) { if (port.exited) throw new Error('Attempting to use a disconnected port object'); child.stdin.write(frame(message)); },
      disconnect() { local = true; child.stdin.end(); },
      // 验收用：绕过 AlarmDesktop 直接 ping，读取原生当前状态
      probe() {
        return new Promise((ok, fail) => {
          if (port.exited) return fail(new Error('原生进程已退出'));
          const requestId = `probe_${++probeSeq}`;
          const timeout = setTimeout(() => { probes.delete(requestId); fail(new Error('probe 超时')); }, 4000);
          probes.set(requestId, value => { clearTimeout(timeout); ok(value); });
          child.stdin.write(frame({ command: 'ping', requestId }));
        });
      },
      sendRaw(message) { child.stdin.write(frame(message)); },
    };
    child.stdout.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4 && buffer.length >= buffer.readUInt32LE(0) + 4) {
        const size = buffer.readUInt32LE(0);
        const message = JSON.parse(buffer.subarray(4, size + 4)); buffer = buffer.subarray(size + 4);
        port.received.push(message);
        if (probes.has(message.requestId)) { probes.get(message.requestId)(message); probes.delete(message.requestId); continue; }
        for (const fn of listeners.message) fn(message);
      }
    });
    child.on('exit', () => {
      port.exited = true; port.exitedAt = Date.now();
      if (local) return;    // 本端主动断开时 Chrome 不会触发 onDisconnect
      runtime.lastError = { message: 'Native host has exited.' };
      for (const fn of listeners.disconnect) fn();
      runtime.lastError = null;
    });
    runtime.ports.push(port);
    return port;
  };
  runtime.current = () => runtime.ports.at(-1);
  runtime.probe = () => runtime.current().probe();
  runtime.killAll = () => { for (const port of runtime.ports) if (!port.exited) { port.exited = true; try { port.child.kill('SIGKILL'); } catch {} } };
  return runtime;
}
async function until(check, ms = 4000, what = '条件') {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { last = await check(); if (last) return last; await delay(60); }
  throw new Error(`等待超时：${what}`);
}

// ---------- 搭建与 background.js 相同的接线 ----------
const runtime = nativeRuntime();
const localStorage = memoryStorage({ desktopJellyV1: { resident: true, night: true } });
const syncStorage = memoryStorage();
const alarms = fakeAlarms();
const notifications = fakeNotifications();
// 响铃动作：与 background.js 的 stopUserAlarmSession 同一个顺序——Chrome 先处理并 hide，之后才由 AlarmDesktop.handleAction 回执；
// 记录 hide 的时刻，用来核对“连接至少保持到 holdUntil”。
const ringActions = [];
const desktop = new AlarmDesktop(runtime, async message => {
  const record = { message, at: Date.now(), hideAt: 0 };
  ringActions.push(record);
  desktop.hide(message.sessionId);
  record.hideAt = Date.now();
  return { ok: true };
});
let restored = 0;
const jellyDesktop = JellyDesktop.create({
  storage: localStorage, desktop,
  summary: () => jellyNudge.summary(),
  act: (nudgeId, action) => jellyNudge.act(nudgeId, action),
  onRestored: () => { restored++; },
  retryMs: [300, 600],
});
const jellyNudge = JellyNudge.create({ syncStorage, localStorage, alarms, notifications, presenter: jellyDesktop.presenter, onChange: () => jellyDesktop.sync(), onSent: at => jellyErrands.noteExternal(at) });
// 水母差事：与 background.js 同一种接法（presenter 与可用性来自 JellyDesktop，动作 / 气泡消失 / presence / 菜单请求回到控制器）。
// 歌曲来源、播放器状态与播放是替身（不联网、不碰真实播放器）：songStub 记下被问了几次、被交给播放了哪几首，outcome 决定播放结果。
const errandOpened = [], presenceSeen = [];
const SONG_TITLES = { 1001: '夜曲', 1002: '晴天', 1003: '七里香', 1004: '稻香', 1005: '告白气球', 1006: '青花瓷', 1007: '简单爱', 1008: '以父之名' };
const songStub = { suggested: 0, playing: false, plays: [], outcome: () => ({ ok: true, dispatched: true }) };
const jellyErrands = JellyErrands.create({
  syncStorage, localStorage, alarms, presenter: jellyDesktop.presenter,
  readMemos: async () => [{ title: '写周报', dueDate: '2000-01-01' }, { title: '回邮件', dueDate: '2000-01-02' }],
  readWorklog: async () => [], tips: () => [{ text: '先开始，才有灵感', type: 'quote', author: '联调' }],
  openPage: async kind => { errandOpened.push(kind); },
  isAvailable: minVersion => jellyDesktop.errandsReady(minVersion),
  songs: { suggest: async () => { songStub.suggested++; return Object.entries(SONG_TITLES).map(([songId, title]) => ({ songId, title, artist: '周杰伦' })); } },
  isPlaying: async () => songStub.playing,
  playSong: async song => { songStub.plays.push(song.songId); return songStub.outcome(); },
  onChange: () => jellyDesktop.sync(),
});
// 与 background.js 同一句：只在差事总开关打开时才给原生端“errands”字段（右键菜单），直接读配置
jellyDesktop.errandsEnabled = async () => JellyErrandsCore.normalize((await syncStorage.get(JellyErrands.CONFIG_KEY))[JellyErrands.CONFIG_KEY]).enabled === true;
// 协议 v10 的“活动行为”：同样直接读配置（缺省为开）；只在上面的总开关打开时才会被问
jellyDesktop.errandsPatrol = async () => JellyErrandsCore.normalize((await syncStorage.get(JellyErrands.CONFIG_KEY))[JellyErrands.CONFIG_KEY]).patrol === true;
desktop.onErrandAction = message => jellyErrands.act(message?.id, message?.action);
desktop.onErrandRequest = message => jellyErrands.request(message?.kind);
desktop.onNudgeHidden = hiddenId => { void jellyErrands.onHidden(hiddenId); };
desktop.onPresence = presence => { presenceSeen.push(presence); jellyErrands.onPresence(presence); };
const stats = () => localStorage.data.jellyNudgeStatsV1;

// 桌面 AI 助手：真实 AssistantEngine（计划与执行是替身，只验证接线与协议）+ 真实 AssistantNative，与 background.js 里 QuickAssistant.install 同一种接法
// （适配层与确认卡共用同一个 desktop、engine，Engine 每次变化都经 native.sync 下发）。
const engineValues = {};
const engineStorage = { async get() { return structuredClone(engineValues); }, async set(values) { Object.assign(engineValues, structuredClone(values)); }, async remove(key) { delete engineValues[key]; } };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let taskSeq = 0, openedWorkspace = 0, gate = null, nativeAssistant = null;
const assistantLogs = [];
const engine = AssistantEngine.create({
  storage: engineStorage, now: () => Date.now(), id: () => `bridge-task-${++taskSeq}`,
  onChange: task => { void nativeAssistant?.sync(task); },
  plan: async () => ({ steps: [{ tool: 'music.intent', args: { text: '搜索歌手' } }] }),
  execute: () => (gate ? gate.promise : Promise.resolve({ status: 'completed', message: '联调：已为你找到歌曲' })),
  choose: async () => ({ message: '好了' }),
});
nativeAssistant = AssistantNative.create({ desktop, engine, jelly: jellyDesktop, openWorkspace: async () => { openedWorkspace++; }, log: (...args) => assistantLogs.push(args) });
let hookSeq = 0;
// 面板操作走验收钩子（与用户操作同一入口，键盘与鼠标的真实路径由 assistant-smoke.mjs 覆盖）；返回原生的回执
async function assistantHook(op, text) {
  const port = runtime.current(), requestId = `ahook_${++hookSeq}`;
  port.sendRaw({ command: 'assistantHook', op, ...(text === undefined ? {} : { text }), requestId });
  return until(() => port.received.find(message => message.requestId === requestId), 3000, `助手钩子 ${op}`);
}
const ASSISTANT_CHORD = 'ctrl+option+shift+cmd+f20';

// 倒计时：真实的 AlarmCountdown + AlarmCore；存储是内存替身，修改经与后台相同的 applyAction，写回后触发 onChanged
const T0 = Date.now();
const cdData = { [AlarmCore.STORAGE_KEY]: [AlarmCore.normalizeAlarm({ id: 'bridge-a', label: '联调测试闹钟', repeat: 'once', fireAt: T0 + 40 * 60000 }, T0)] };
let cdListener = null;
const cdStorage = {
  local: {
    get: async () => structuredClone(cdData),
    set: async update => { Object.assign(cdData, structuredClone(update)); cdListener?.(Object.fromEntries(Object.keys(update).map(key => [key, {}])), 'local'); },
  },
  onChanged: { addListener: fn => { cdListener = fn; } },
};
const countdown = new AlarmCountdown(cdStorage, desktop, AlarmCore);
let opened = 0;
countdown.openCenter = async () => { opened++; };
countdown.runAction = async message => {
  const data = structuredClone(cdData);
  try {
    const result = AlarmCountdown.applyAction(AlarmCore, data[AlarmCore.STORAGE_KEY], data[AlarmCore.RUNTIME_KEY] || {}, message);
    await cdStorage.local.set({ [AlarmCore.STORAGE_KEY]: data[AlarmCore.STORAGE_KEY], [AlarmCore.RUNTIME_KEY]: data[AlarmCore.RUNTIME_KEY] || {} });
    return result;
  } catch (error) { return { ok: false, error: error.message }; }
};
const menu = title => runtime.current().sendRaw({ command: 'menuItem', title, requestId: `menu_${Date.now()}` });
// 按下响铃气泡的按钮并等 Chrome 一侧收到第 count 个动作：有真实鼠标时点真实的按钮，否则走验收钩子（同一个动作入口）。
// 弹出后 0.5 秒内的点击被原生忽略（防误触），所以先等一等。
async function pressRing(buttons, name, count) {
  const received = () => ringActions.length >= count;
  await delay(700);
  if (withMouse) {
    const at = center(buttons[name]);
    mouse('click', at.x, at.y);
    try { await until(received, 1800, `点“${name}”`); }
    catch { mouse('move', at.x, at.y); await delay(300); mouse('click', at.x, at.y); await until(received, 3000, `重试点“${name}”`); }
  } else {
    const requestId = `hook_${Date.now()}`;
    runtime.current().sendRaw({ command: 'ringButton', id: name, requestId });
    const reply = await until(() => runtime.current().received.find(message => message.requestId === requestId), 3000, '验收钩子回应');
    assert.equal(reply.ok, true, `钩子按下“${name}”应发出动作`);
    await until(received, 3000, `钩子按下“${name}”后 Chrome 收到动作`);
  }
}

try {
  // ---------- 1. 常驻：设置喝水提醒，水母出现并带着“今天的记录” ----------
  await jellyNudge.set({ water: { on: true, everyMin: 30 }, stretch: { on: false, everyMin: 50 }, from: '00:00', to: '23:59', weekdaysOnly: false });
  await jellyDesktop.restore();
  let state = await until(async () => { const reply = await runtime.probe(); return reply.jellyVisible && reply.jellyLines.length >= 2 ? reply : null; }, 5000, '常驻水母带着记录出现');
  assert.equal(state.version, 10); assert.equal(state.jellyResident, true); assert.equal(state.focusStayed, true);
  assert.equal(state.jellyLines[0], '今天还没喝水'); assert.match(state.jellyLines[1], /^下次喝水提醒 \d\d:\d\d$/);
  assert.equal(jellyDesktop.status().connected, true); assert.equal(runtime.ports.length, 1, '只启动了一个组件进程');
  assert.ok(state.countdownMenu.includes('收起水母') && state.countdownMenu.includes('今天还没喝水'));
  console.log('PASS 1：常驻水母出现，Chrome 一侧算好的记录原样显示', JSON.stringify(state.jellyLines));

  // ---------- 2. 喝水提醒交给水母，不再弹系统通知 ----------
  const fired = await jellyNudge.fire('jelly-nudge-water');
  assert.equal(fired.sent, true); assert.equal(fired.via, 'jelly', '水母确认显示后不再发系统通知'); assert.equal(notifications.created.length, 0);
  state = await runtime.probe();
  assert.equal(state.nudgeId, fired.id); assert.equal(state.jellyBubble, 'nudge'); assert.deepEqual(Object.keys(state.nudgeButtons).sort(), ['done', 'snooze']);
  assert.equal(desktop.nudgeId, fired.id, 'Chrome 一侧记住了当前气泡');
  console.log('PASS 2：提醒由水母气泡承载（无系统通知）');

  if (withMouse) {
    // ---------- 3. 点“喝了”：Chrome 计数 +1，回执驱动水母显示结果，今天的记录刷新 ----------
    const done = center(state.nudgeButtons.done);
    mouse('click', done.x, done.y);
    try { await until(() => stats()?.water === 1, 1800, '第一次点击'); } catch { mouse('move', done.x, done.y); await delay(300); mouse('click', done.x, done.y); await until(() => stats()?.water === 1, 3000, '点“喝了”后计数为 1'); }
    assert.equal(stats().water, 1, '计数只加一次');
    state = await until(async () => { const reply = await runtime.probe(); return reply.jellyLines[0] === '今天喝了 1 次水' ? reply : null; }, 3000, '今天的记录刷新为 1 次');
    assert.equal(state.nudgeBusy, false);
    await until(async () => (await runtime.probe()).nudgeId === null, 4500, '成功回执显示后气泡收起');
    await until(() => desktop.nudgeId === null, 2000, '原生回报 nudgeHidden 后 Chrome 一侧清空');
    assert.ok(desktop.port, '常驻时连接不因提醒结束而释放');
    assert.equal(stats().water, 1, '收起气泡不会再计数');
    console.log('PASS 3：点“喝了” → 计数 +1 → 回执 → 气泡收起 → 记录刷新 1 次');

    // ---------- 4. 点“10 分钟后”：只约一次性闹钟，不改计数 ----------
    const second = await jellyNudge.fire('jelly-nudge-water');
    assert.equal(second.via, 'jelly');
    state = await runtime.probe();
    const snooze = center(state.nudgeButtons.snooze);
    mouse('click', snooze.x, snooze.y);
    try { await until(() => alarms.map.has('jelly-nudge-snooze-water'), 1800, '稍后提醒'); } catch { mouse('move', snooze.x, snooze.y); await delay(300); mouse('click', snooze.x, snooze.y); await until(() => alarms.map.has('jelly-nudge-snooze-water'), 3000, '点“10 分钟后”后约了一次性闹钟'); }
    assert.equal(stats().water, 1, '稍后提醒不计数');
    const when = alarms.map.get('jelly-nudge-snooze-water').scheduledTime - Date.now();
    assert.ok(when > 9 * 60000 && when <= 10 * 60000 + 1000, `约在 10 分钟后：${when}`);
    state = await until(async () => { const reply = await runtime.probe(); return reply.jellyLines.some(line => line.startsWith('下次喝水提醒')) ? reply : null; }, 3000, '记录里仍有下一次提醒');
    await until(async () => (await runtime.probe()).nudgeId === null, 4500, '气泡收起');
    console.log('PASS 4：点“10 分钟后” → 一次性闹钟，计数不变');
  } else {
    console.log('跳过 3、4：--no-mouse（不做真实点击）；改为直接调用 Chrome 一侧的动作，只验证计数与记录刷新');
    assert.equal((await jellyNudge.act(fired.id, 'done')).ok, true);
    await until(async () => (await runtime.probe()).jellyLines[0] === '今天喝了 1 次水', 3000, '记录刷新');
    desktop.clearNudge(fired.id);
  }

  // ---------- 4a. 水母差事：presence 上报 → 定时评估 → 气泡 → 点“去处理” → 只打开页面并记结果；offer 与“再来一条” ----------
  // 按钮经验收钩子 nudgeButton 触发（与点击同一个动作入口，真实鼠标点击由 jelly-smoke 的 nudge-mouse 阶段覆盖气泡按钮）。
  await until(() => presenceSeen.length > 0, 3000, '原生在常驻后上报了 presence');
  assert.equal(presenceSeen[0], 'active', '正在用电脑：presence 为 active（读的是真实系统空闲秒数）');
  assert.equal((await jellyDesktop.errandsReady(9)), true, '常驻、已连接、协议 v9：差事（含歌曲与右键菜单）可以开口');
  const pressNudge = async name => {
    const requestId = `nhook_${Date.now()}_${name}`;
    runtime.current().sendRaw({ command: 'nudgeButton', id: name, requestId });
    return until(() => runtime.current().received.find(message => message.requestId === requestId), 3000, `气泡钩子 ${name}`);
  };
  // 这两段（4a / 4a2）验收的是气泡与菜单，不是巡游：活动行为（patrol）显式关掉，水母的休息行为与 v9 时代的基线一致；活动行为有自己的 4a3
  assert.equal((await jellyErrands.set({ enabled: true, patrol: false, level: 'busy', from: '00:00', to: '23:59', weekdaysOnly: false, kinds: { task: true, worklog: false, tidbit: true } })).ok, true);
  let errand = await jellyErrands.fire('jelly-errands-tick');
  assert.equal(errand.sent, true, `定时评估应发出一条：${JSON.stringify(errand)}`); assert.equal(errand.kind, 'task', '过期任务优先于小乐子');
  assert.equal((await jellyErrands.fire('jelly-nudge-water')), undefined, '不是差事的闹钟忽略');
  state = await until(async () => { const reply = await runtime.probe(); return reply.nudgeId === errand.id && reply.nudgeArriving === false && reply.jellyBubble === 'nudge' ? reply : null; }, 6000, '差事气泡出现（水母先游到你面前）');
  assert.deepEqual(Object.keys(state.nudgeButtons).sort(), ['later', 'open']); assert.equal(state.focusStayed, true);
  assert.equal(desktop.nudgeId, errand.id, 'Chrome 一侧记住了当前气泡');
  assert.equal(notifications.created.length, 0, '差事不弹系统通知');
  assert.equal((await jellyErrands.fire('jelly-errands-tick')).reason, 'gap', '紧接着的评估被最小间隔挡住');
  assert.equal((await pressNudge('open')).ok, true);
  await until(() => errandOpened.length === 1, 3000, '点“去处理”后 Chrome 打开页面');
  assert.deepEqual(errandOpened, ['task']);
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '成功回执显示后气泡收起');
  await until(() => desktop.nudgeId === null, 2000, '原生回报 nudgeHidden 后 Chrome 一侧清空');
  const day = localStorage.data.jellyErrandsStateV1;
  assert.equal(day.strikes.task, undefined, '接受不记拒绝'); assert.ok(day.seen.some(fp => fp.startsWith('task:')) && day.lastAt > 0, 'Chrome 记下了今天说过什么');
  assert.equal(stats().water, 1, '差事不碰喝水计数');
  // offer：已有系统通知发送器先问水母；水母接手 → handled，不再弹系统通知
  assert.deepEqual(await jellyErrands.offer('tidbit'), { handled: true, kind: 'tidbit' });
  state = await until(async () => { const reply = await runtime.probe(); return reply.nudgeArriving === false && reply.jellyBubble === 'nudge' && reply.nudgeButtons.more ? reply : null; }, 4000, '小乐子气泡出现');
  assert.deepEqual(Object.keys(state.nudgeButtons).sort(), ['dismiss', 'more']);
  assert.equal((await pressNudge('more')).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.nudgeBusy === false && reply.nudgeId ? reply : null; }, 3000, '“再来一条”失败（今天的都说完）后按钮恢复');
  assert.equal(state.jellyBubble, 'nudge', '失败不收起气泡，也不声称成功');
  assert.equal((await pressNudge('dismiss')).ok, true);
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '“够了”后气泡收起');
  assert.equal(localStorage.data.jellyErrandsStateV1.strikes.tidbit, 1, '“够了”记一次拒绝');
  // 关闭差事：之后 offer 不再接手，系统通知照旧
  await jellyErrands.set({ enabled: false });
  assert.equal((await jellyErrands.offer('task')).handled, false);
  console.log('PASS 4a：水母差事（presence → 评估 → 气泡 → 去处理 → 只开页面并记结果；offer 接手；再来一条/够了）');

  // ---------- 4a2. 推荐歌曲与右键菜单“水母，给我…”（协议 v9）：菜单 → errandRequest → 真实控制器 → 三按钮歌曲气泡 → 播放（替身播放器）→ 回执 ----------
  assert.equal((await jellyErrands.set({ enabled: true, patrol: false, level: 'busy', from: '00:00', to: '23:59', weekdaysOnly: false, kinds: { task: false, worklog: false, song: true, tidbit: false } })).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.errandsMenu === true ? reply : null; }, 4000, '差事总开关打开后，Chrome 经 onChange → sync 给原生端带上 errands，右键菜单出现');
  assert.ok(state.countdownMenu.includes('水母，给我…'), `菜单：${state.countdownMenu.join(' | ')}`);
  const suggestedBefore = songStub.suggested;
  menu('来首歌');
  state = await until(async () => { const reply = await runtime.probe(); return reply.nudgeId?.startsWith('jelly-errand-song-') && reply.nudgeArriving === false && reply.jellyBubble === 'nudge' ? reply : null; }, 6000, '菜单“来首歌”→ Chrome 取候选 → 水母游到你面前，三按钮歌曲气泡出现');
  assert.deepEqual(Object.keys(state.nudgeButtons).sort(), ['another', 'dismiss', 'play']); assert.equal(state.focusStayed, true);
  assert.equal(songStub.suggested, suggestedBefore + 1, '一次菜单请求只取一次歌曲候选');
  assert.equal(state.errandRequestBusy, false, 'Chrome 回了 ok：只清掉“正在准备”，气泡由 nudge 命令呈现'); assert.equal(state.feedback, '');
  assert.equal(desktop.nudgeId, state.nudgeId, 'Chrome 一侧记住了当前气泡');
  assert.equal(songStub.plays.length, 0, '给出歌曲只是一个气泡：没点“播放”之前什么也不会放');
  assert.equal(notifications.created.length, 0, '没有系统通知');
  // 点“播放”：恰好一次交给播放器，回执成功后气泡收起
  const songBubbleId = state.nudgeId;
  assert.equal((await pressNudge('play')).ok, true);
  await until(() => songStub.plays.length === 1, 3000, '点“播放”后 Chrome 把这一首交给播放器');
  assert.ok(songStub.plays[0] in SONG_TITLES);
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '播放确认后气泡收起');
  await until(() => desktop.nudgeId === null, 2000, '原生回报 nudgeHidden 后 Chrome 一侧清空');
  assert.equal(songStub.plays.length, 1, '收起气泡不会再放一次');
  assert.equal((await jellyErrands.act(songBubbleId, 'play')).text, `已开始播放《${SONG_TITLES[songStub.plays[0]]}》`, '同一个气泡再点只回上次结果');
  assert.equal(songStub.plays.length, 1, '已播放的气泡不会重放');
  // 播放器没确认（已发出但没确认到）：按“未知”处理，Chrome 不重放，也不声称成功
  songStub.outcome = () => ({ ok: false, dispatched: true });
  menu('来首歌');
  state = await until(async () => { const reply = await runtime.probe(); return reply.nudgeId?.startsWith('jelly-errand-song-') && reply.nudgeId !== songBubbleId && reply.nudgeArriving === false && reply.jellyBubble === 'nudge' ? reply : null; }, 6000, '第二次“来首歌”：新的歌曲气泡');
  const unknownId = state.nudgeId;
  assert.equal((await pressNudge('play')).ok, true);
  await until(() => songStub.plays.length === 2, 3000, '第二次点“播放”交给播放器一次');
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '未知结果显示后气泡收起');
  const again = await jellyErrands.act(unknownId, 'play');
  assert.equal(again.text, '已交给播放器，还没确认开始播放，请在播放器里看看', '没确认到：如实说明，不说“已开始播放”');
  assert.equal(songStub.plays.length, 2, 'unknown 不重放');
  // 再来一首：Chrome 立刻换一个新的歌曲气泡（不重复刚给过的）
  songStub.outcome = () => ({ ok: true, dispatched: true });
  menu('来首歌');
  await until(async () => { const reply = await runtime.probe(); return reply.nudgeId?.startsWith('jelly-errand-song-') && reply.nudgeId !== unknownId && reply.nudgeArriving === false && reply.jellyBubble === 'nudge' ? reply : null; }, 6000, '第三次“来首歌”');
  const firstOfThird = desktop.nudgeId;
  assert.equal((await pressNudge('another')).ok, true);
  await until(async () => { const reply = await runtime.probe(); return reply.nudgeId?.startsWith('jelly-errand-song-') && reply.nudgeId !== firstOfThird && reply.nudgeBusy === false ? reply : null; }, 6000, '“换一首”后出现新的歌曲气泡');
  assert.equal(songStub.plays.length, 2, '“换一首”不放歌');
  assert.equal((await pressNudge('dismiss')).ok, true);
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '“不听”后气泡收起');
  // 定时评估只在播放器空闲时推荐歌曲：先放行间隔与条数（测试里直接清掉当天状态的 lastAt / shown），对照“空闲会发”，再验证“在放歌就不发”
  const openGate = () => Object.assign(localStorage.data.jellyErrandsStateV1, { lastAt: 0, shown: [] });
  songStub.playing = false; openGate();
  const idleTick = await jellyErrands.fire('jelly-errands-tick');
  assert.equal(idleTick.sent, true, `对照：播放器空闲时定时评估会发一首歌：${JSON.stringify(idleTick)}`); assert.equal(idleTick.kind, 'song');
  await until(async () => { const reply = await runtime.probe(); return reply.nudgeId === idleTick.id && reply.nudgeArriving === false && reply.jellyBubble === 'nudge' ? reply : null; }, 6000, '定时发出的歌曲气泡出现');
  assert.equal((await pressNudge('dismiss')).ok, true);
  await until(async () => (await runtime.probe()).nudgeId === null, 4500, '“不听”后气泡收起');
  const playsBefore = songStub.plays.length;
  songStub.playing = true; openGate();
  const busyTick = await jellyErrands.fire('jelly-errands-tick');
  assert.deepEqual([busyTick.sent, busyTick.reason], [false, 'idle'], `正在放歌时定时评估不会发歌曲（间隔与条数都放行了，仍没有候选）：${JSON.stringify(busyTick)}`);
  assert.equal(songStub.plays.length, playsBefore, '没有放歌');
  songStub.playing = false;
  // 竞态：菜单还在、差事刚被关掉 → Chrome 如实回“没有开启”，原生显示原因而不是一直“正在准备”
  const realEnabled = jellyDesktop.errandsEnabled;
  jellyDesktop.errandsEnabled = async () => true;
  assert.equal((await jellyErrands.set({ enabled: false })).ok, true);
  await until(async () => (await runtime.probe()).errandsMenu === true, 3000, '模拟菜单仍在');
  menu('来首歌');
  state = await until(async () => { const reply = await runtime.probe(); return reply.feedback === '水母差事没有开启' ? reply : null; }, 4000, '原生显示 Chrome 回的失败原因');
  assert.equal(state.errandRequestBusy, false, '失败回执后不再卡在等待');
  assert.equal(songStub.plays.length, 2, '这一次什么也没放');
  // 恢复：总开关关闭 → 下发不再带 errands → 菜单消失
  jellyDesktop.errandsEnabled = realEnabled;
  await jellyDesktop.sync();
  state = await until(async () => { const reply = await runtime.probe(); return reply.errandsMenu === false ? reply : null; }, 4000, '总开关关闭后菜单消失');
  assert.equal(state.countdownMenu.includes('水母，给我…'), false);
  // 失败原因是 5 秒的反馈气泡（note），盖在倒计时读数之上；等它自己消失，后面的阶段（4b 要看到倒计时读数）才不会撞上它
  await until(async () => { const reply = await runtime.probe(); return reply.feedback === '' && reply.jellyBubble !== 'note' ? reply : null; }, 8000, '失败原因的反馈气泡 5 秒后自行消失');
  console.log('PASS 4a2：右键菜单“水母，给我…”与推荐歌曲（菜单 → 请求 → 三按钮气泡 → 播放 → 回执；unknown 不重放；在放歌时不推荐；关闭后菜单消失）');

  // ---------- 4a3. 活动行为（协议 v10）：真实 JellyDesktop 经 errandsEnabled / errandsPatrol 下发 errands:{ enabled, patrol }，原生据此进入或退出“活动”状态 ----------
  // 巡游、睡觉规则与小动作本身由 jelly-smoke 的 patrol 阶段验收；这里只验收 Chrome 的设置真的传到了原生端（以及关掉后回到老样子）。
  assert.equal(await jellyDesktop.errandsReady(10), true, '常驻、已连接、协议 v10');
  const activity = patch => ({ enabled: true, level: 'busy', from: '00:00', to: '23:59', weekdaysOnly: false, kinds: { task: false, worklog: false, song: false, tidbit: false }, ...patch });
  // 旧版本存下的配置没有 patrol 键：规范化后缺省为开，原生进入活动状态（升级后无需再去设置页点一下）
  assert.equal((await jellyErrands.set(activity({}))).ok, true);
  assert.equal((await syncStorage.get(JellyErrands.CONFIG_KEY))[JellyErrands.CONFIG_KEY].patrol, true, '存下来的是规范化后的配置，patrol 缺省为开');
  state = await until(async () => { const reply = await runtime.probe(); return reply.jellyLively === true ? reply : null; }, 4000, '差事开启且 patrol 缺省（按开启）：Chrome 经 onChange → sync 下发 patrol:true，原生进入活动状态');
  assert.equal(state.errandsMenu, true, '差事菜单仍在');
  // 设置页关掉“让水母活动起来”：差事还开着、菜单还在，但原生回到老样子
  assert.equal((await jellyErrands.set(activity({ patrol: false }))).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.jellyLively === false && reply.errandsMenu === true ? reply : null; }, 4000, 'patrol:false 下发后原生退出活动状态，菜单不受影响');
  assert.equal(state.patrolling, false);
  // 再打开
  assert.equal((await jellyErrands.set(activity({ patrol: true }))).ok, true);
  await until(async () => (await runtime.probe()).jellyLively === true, 4000, 'patrol:true 重新下发');
  // 差事总开关关掉：不再带 errands（连带 patrol），原生退出活动状态、菜单消失
  assert.equal((await jellyErrands.set(activity({ enabled: false }))).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.jellyLively === false && reply.errandsMenu === false ? reply : null; }, 4000, '总开关关闭：errands 整体不再下发');
  assert.equal(state.patrolling, false);
  console.log('PASS 4a3：活动行为（缺省按开启 → 关闭 → 再打开 → 差事总开关关闭，原生端的“活动”状态逐一跟上；Chrome 没有收到任何关于巡游的回报，因为那只是水母自己的动作）');

  // ---------- 4b. 倒计时委托给水母：读数、延后、打开、跳过、隐藏都由 Chrome 执行并回执 ----------
  await countdown.sync();
  state = await until(async () => { const reply = await runtime.probe(); return reply.countdownVisible ? reply : null; }, 3000, '倒计时出现在水母上');
  assert.equal(state.countdownTitle, '联调测试闹钟'); assert.equal(state.jellyBubble, 'clock'); assert.match(state.countdownText, /^(39:[3-5]\d|40:00)$/);
  assert.equal(state.jellyResident, true, '常驻的水母同时承载倒计时');
  assert.ok(state.countdownMenu.includes('延后 5 分钟') && state.countdownMenu.some(item => item.includes('联调测试闹钟')));
  const alarm = () => cdData[AlarmCore.STORAGE_KEY][0];
  const fireBefore = alarm().fireAt, revisionBefore = alarm().revision;
  menu('延后 5 分钟');
  await until(() => alarm().fireAt === fireBefore + 5 * 60000, 3000, '闹钟由 Chrome 延后 5 分钟');
  assert.equal(alarm().revision, revisionBefore + 1, '延后是对闹钟的一次真实修改，版本递增');
  state = await until(async () => { const reply = await runtime.probe(); return /^(44:[3-5]\d|45:00)$/.test(reply.countdownText) ? reply : null; }, 3000, '水母上的倒计时随新时间更新');
  assert.equal(state.jellyBubble, 'note', '回执到达后气泡显示 Chrome 给的结果文字');
  menu('在 Chrome 中打开闹钟中心');
  await until(() => opened === 1, 3000, '打开闹钟中心由 Chrome 执行');
  menu('确认跳过这一次提醒');
  await until(() => alarm().enabled === false, 3000, '跳过一次性闹钟后 Chrome 把它关闭');
  await until(async () => (await runtime.probe()).countdownVisible === false, 3000, '没有下一次提醒后倒计时从水母上撤下');
  assert.equal((await runtime.probe()).jellyVisible, true, '倒计时没了，常驻水母留下');
  // 隐藏倒计时：保存的是“不再把倒计时交给水母”，闹钟本身不变
  const second = AlarmCore.normalizeAlarm({ id: 'bridge-b', label: '联调第二个闹钟', repeat: 'once', fireAt: Date.now() + 30 * 60000 }, Date.now());
  cdData[AlarmCore.STORAGE_KEY].push(second);      // 被跳过的那一次已记为已处理，不会再出现；新增一个闹钟让倒计时回来
  await countdown.sync();
  state = await until(async () => { const reply = await runtime.probe(); return reply.countdownVisible ? reply : null; }, 3000, '新的最近提醒出现在水母上');
  assert.equal(state.countdownTitle, '联调第二个闹钟');
  menu('隐藏倒计时（不取消闹钟）');
  await until(() => cdData[AlarmCountdown.SETTINGS_KEY]?.enabled === false, 3000, '隐藏只保存显示开关');
  assert.equal(cdData[AlarmCore.STORAGE_KEY][1].enabled, true, '隐藏倒计时不取消闹钟');
  await until(async () => (await runtime.probe()).countdownVisible === false, 3000, '倒计时撤下');
  console.log('PASS 4b：倒计时委托（延后/打开/跳过/隐藏经 Chrome 执行，水母读数随之更新）');

  // ---------- 4c. 到点响铃：Chrome 一侧 show → 常驻水母游到底部正中报时 → 点“停止” → Chrome 先 hide、再回执 → 确认语 → 游回原位 ----------
  await until(async () => (await runtime.probe()).jellyBubble === 'none', 6000, '回到没有气泡的平静状态');
  await delay(400);
  state = await runtime.probe();
  const home = frameOf(state.ringFrame);
  const ringSession = {
    id: 'bridge-ring-1', scheduledAt: new Date(2026, 9, 16, 9, 30).getTime(),
    occurrences: [
      { label: '联调开会', snoozeCount: 0, snoozeLimit: 3, snoozeMinutes: 10 },
      { label: '联调喝水', snoozeCount: 0, snoozeLimit: 3, snoozeMinutes: 10 },
    ],
  };
  await desktop.show(ringSession);
  state = await until(async () => { const reply = await runtime.probe(); return reply.ringPhase === 'shown' ? reply : null; }, 6000, '常驻水母游到落点并弹出响铃气泡');
  assert.equal(state.ringId, ringSession.id); assert.equal(state.ringClock, '09:30', 'Chrome 的 clockText 与原生解析一致');
  assert.deepEqual(state.ringLines, ['联调开会', '联调喝水'], 'Chrome 发来的名字原样显示');
  assert.equal(state.jellyBubble, 'ring'); assert.equal(state.jellyResident, true); assert.equal(state.visible, true);
  assert.deepEqual(Object.keys(state.ringButtons).sort(), ['dismiss', 'snooze']);
  assert.equal(desktop.sessionId, ringSession.id, 'Chrome 一侧记住了当前响铃会话');
  const lane = frameOf(state.ringLane), landed = frameOf(state.ringFrame);
  assert.ok(Math.abs(landed.x + landed.w / 2 - (lane.x + lane.w / 2)) <= 2, `落点在所在屏幕可见区横向正中：${state.ringFrame} 对 ${state.ringLane}`);
  await pressRing(state.ringButtons, 'dismiss', 1);
  const stop = ringActions[0];
  assert.deepEqual([stop.message.sessionId, stop.message.action], [ringSession.id, 'dismiss']);
  assert.equal(desktop.sessionId, null, 'Chrome 处理动作时已经 hide——回执是在 hide 之后才发的');
  state = await until(async () => { const reply = await runtime.probe(); return reply.ringStatus === '已停止' ? reply : null; }, 2500, '回执在宽限内到达：水母显示“已停止”');
  assert.equal(state.ringId, ringSession.id, '确认语显示期间响铃仍在');
  await until(async () => (await runtime.probe()).ringId === null, 4000, '确认语显示完，响铃结束');
  state = await until(async () => {
    const reply = await runtime.probe(), frame = frameOf(reply.ringFrame);
    return Math.abs(frame.x - home.x) <= 3 && Math.abs(frame.y - home.y) <= 3 && Math.abs(frame.w - home.w) <= 1 && Math.abs(frame.h - home.h) <= 1 ? reply : null;
  }, 5000, '常驻水母游回响铃前的位置，窗口回到基础尺寸');
  assert.equal(state.jellyVisible, true, '常驻时水母留下'); assert.equal(state.visible, false, '响铃已经结束'); assert.equal(state.jellyBubble, 'none');
  assert.ok(desktop.port, '常驻时连接不因响铃结束而释放');
  console.log('PASS 4c：响铃 → 水母报时 → 点“停止” → Chrome 先 hide 再回执 → “已停止” → 游回原位', JSON.stringify({ realMouse: withMouse }));

  // ---------- 4d. 桌面 AI 助手（协议 v7）：启用并注册热键 → 原生提交 → 同一个 Engine 执行 → 状态投影回原生 → 停止 → 在 Chrome 中查看 ----------
  const applied = await jellyDesktop.set({ assistant: { enabled: true, hotkey: ASSISTANT_CHORD } });
  assert.equal(applied.ok, true); assert.equal(applied.assistant.hotkeyStatus, 'ok', '原生回报热键已向系统注册');
  state = await runtime.probe();
  assert.equal(state.assistantEnabled, true); assert.equal(state.assistantHotkey, ASSISTANT_CHORD); assert.equal(state.assistantHotkeyStatus, 'ok');
  assert.equal(state.countdownMenu[0], '问 AI…（⌃⌥⇧⌘F20）', '启用后水母右键菜单第一项是“问 AI…”');
  assert.equal(await jellyDesktop.assistantEnabled(), true, 'Chrome 一侧的生效判定：常驻且已启用');
  await quiet.waitIfActive();      // 面板要拿走键盘焦点：用户正在打字时先等他安静，否则他的按键会落进测试面板
  const stopWatching = quiet.watch(reason => { interrupted = reason; void assistantHook('hide').catch(() => {}); });      // 用户回来了：立刻撤掉面板
  assert.equal((await assistantHook('show')).ok, true);
  assert.equal((await assistantHook('type', '联调：找一首歌')).ok, true);
  assert.equal((await assistantHook('submit')).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.assistantTaskStatus === 'completed' ? reply : null; }, 5000, '同一个 Engine 执行完成，结果投影回原生面板');
  let task = await engine.snapshot();
  assert.equal(task.input.origin, 'desktop', '来自桌面输入的任务带来源标记（保留确认卡，不经自动确认）');
  assert.equal(task.input.text, '联调：找一首歌'); assert.equal(task.status, 'completed');
  assert.equal(state.assistantTask, task.id); assert.equal(state.assistantTaskVersion, task.version, '面板显示的版本就是 Engine 当前版本');
  assert.match(state.assistantBody, /联调：已为你找到歌曲/); assert.equal(state.assistantPending, 'none', '只有匹配的 assistantResult 到达后才解除等待');
  assert.equal(state.assistantInput, '', '提交成功后输入框清空');
  assert.ok(assistantLogs.some(([category, action, detail]) => category === 'system' && action === 'assistant-native' && detail.ok === true && detail.context === 'submit'), '提交记录了固定类别');
  assert.ok(!JSON.stringify(assistantLogs).includes('联调'), '日志不写输入与助手正文');
  // 第二个需求：执行卡住时从面板停止，晚到的结果不能复活已停止的任务
  gate = deferred();
  assert.equal((await assistantHook('type', '联调：第二个需求')).ok, true);
  assert.equal((await assistantHook('submit')).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.assistantTaskStatus === 'running' && reply.assistantStopVisible ? reply : null; }, 5000, '执行中的任务以 running 回到面板并出现“停止”');
  assert.equal(state.assistantInput, '', '第二个需求提交后清空输入');
  assert.equal((await assistantHook('stop')).ok, true);
  state = await until(async () => { const reply = await runtime.probe(); return reply.assistantTaskStatus === 'cancelled' ? reply : null; }, 5000, '停止经 Engine.cancel，状态为 cancelled 回到面板');
  assert.equal(state.assistantStopVisible, false);
  gate.resolve({ status: 'completed', message: '不该出现' }); gate = null;
  await engine.settled(); await delay(300);
  state = await runtime.probe();
  assert.equal(state.assistantTaskStatus, 'cancelled', '晚到的执行结果不能复活已停止的任务'); assert.doesNotMatch(state.assistantBody || '', /不该出现/);
  assert.equal((await engine.snapshot()).status, 'cancelled');
  // 在 Chrome 中查看：原生只发动作，打开工作台由 Chrome 一侧执行
  assert.equal((await assistantHook('open')).ok, true);
  await until(() => openedWorkspace === 1, 3000, '“在 Chrome 中查看”走 openWorkspace');
  await until(async () => (await runtime.probe()).assistantPending === 'none', 3000, '打开动作的回执到达');
  assert.equal((await assistantHook('hide')).ok, true);
  stopWatching();
  if (interrupted) throw new Error(interrupted);      // 阶段里发生过真实输入：这一段的结论不可信，交给 catch 按“被打断”处理
  console.log('PASS 4d：启用助手 → 热键已注册 → 原生提交 → 同一个 Engine（origin:desktop）→ 状态回到面板 → 停止不被晚到结果复活 → 在 Chrome 中查看');

  // ---------- 5. 断线重连：组件被结束后按有界退避重新启动，并重新下发状态 ----------
  const beforePorts = runtime.ports.length, beforeRestored = restored;
  runtime.current().child.kill('SIGKILL');
  await until(() => runtime.ports.length === beforePorts + 1, 4000, '重连启动了新的组件进程');
  state = await until(async () => { const reply = await runtime.probe().catch(() => null); return reply?.jellyVisible && reply.jellyLines.length ? reply : null; }, 5000, '新进程里水母带着记录出现');
  assert.equal(state.jellyResident, true); assert.equal(state.jellyLines[0], '今天喝了 1 次水', '新连接先下发记录');
  await until(() => restored === beforeRestored + 1, 2000, '重连成功后回调一次（外部据此重新下发倒计时）');
  assert.equal(jellyDesktop.status().connected, true);
  // 助手：新进程里热键重新注册，面板状态以 Engine 当前任务为准（不是旧缓存）
  state = await until(async () => { const reply = await runtime.probe().catch(() => null); return reply?.assistantEnabled && reply.assistantTask ? reply : null; }, 5000, '新进程里助手重新生效并补发当前任务');
  assert.equal(state.assistantHotkeyStatus, 'ok'); assert.equal(state.assistantTaskStatus, 'cancelled'); assert.equal(state.assistantTask, (await engine.snapshot()).id);
  console.log('PASS 5：断线后有界重连，新进程里水母、记录与助手（热键 + 当前任务）恢复');

  // ---------- 6. 菜单退出：Chrome 把它当作“不再常驻”，不自动拉起 ----------
  const beforeQuit = runtime.ports.length;
  runtime.current().sendRaw({ command: 'menuItem', title: '退出桌面组件', requestId: 'quit' });
  await until(() => localStorage.data.desktopJellyV1.resident === false, 4000, '退出后保存 resident:false');
  await delay(1500);   // 比重连间隔（300 ms）长得多：确认没有被重新拉起
  assert.equal(runtime.ports.length, beforeQuit, '用户主动退出后不自动重连');
  assert.match(jellyDesktop.status().error, /你从菜单退出了桌面组件/);
  assert.equal(runtime.ports.at(-1).received.some(message => message.type === 'componentQuit'), true, '原生先发出 componentQuit 再结束');
  console.log('PASS 6：状态栏退出 → componentQuit → 不再常驻、不重连');

  // ---------- 7. 没有常驻：提醒临时叫出水母，结束后连接释放、组件退出 ----------
  const temporary = await jellyNudge.fire('jelly-nudge-water');
  assert.equal(temporary.via, 'jelly', '没有常驻也能由水母承载（临时启动组件）');
  state = await runtime.probe();
  assert.equal(state.jellyVisible, true); assert.equal(state.jellyResident, false); assert.equal(state.jellyBubble, 'nudge');
  const temp = runtime.current();
  desktop.clearNudge(temporary.id);      // 相当于 Chrome 撤销（例如被替换）
  await until(() => temp.exited, 6000, '提醒结束约 2 秒后连接释放、组件退出');
  console.log('PASS 7：没有常驻 → 提醒临时出现 → 结束后组件随连接退出');

  // ---------- 8. 没有常驻：响铃临时叫出水母。Chrome 在 hide 之后才回执，所以连接至少保持到 holdUntil（水母演完确认语、游走之后才放手） ----------
  const beforeTemporaryRing = runtime.ports.length, ringsBefore = ringActions.length;
  await desktop.show({ id: 'bridge-ring-2', scheduledAt: new Date(2026, 9, 16, 23, 5).getTime(), occurrences: [{ label: '联调睡前提醒', snoozeCount: 0, snoozeLimit: 1, snoozeMinutes: 15 }] });
  assert.equal(runtime.ports.length, beforeTemporaryRing + 1, '没有常驻也能为响铃临时启动组件');
  const ringProcess = runtime.current();
  state = await until(async () => { const reply = await runtime.probe(); return reply.ringPhase === 'shown' ? reply : null; }, 8000, '临时启动的水母游进来并弹出响铃气泡');
  assert.equal(state.jellyResident, false); assert.equal(state.ringClock, '23:05'); assert.deepEqual(state.ringLines, ['联调睡前提醒']);
  await pressRing(state.ringButtons, 'snooze', ringsBefore + 1);
  const snoozed = ringActions.at(-1);
  assert.deepEqual([snoozed.message.sessionId, snoozed.message.action, snoozed.message.minutes], ['bridge-ring-2', 'snooze', 15], '稍后的分钟数来自 Chrome 给的 snoozeMinutes');
  assert.equal(desktop.sessionId, null, '回执之前 Chrome 已经 hide');
  await until(async () => (await runtime.probe()).ringStatus === '好的，15 分钟后再叫你', 2500, '回执在宽限内到达：水母显示稍后确认语');
  await until(async () => (await runtime.probe()).jellyVisible === false, 6000, '确认语显示完，水母游走消失');
  assert.equal(ringProcess.exited, false, '水母演完时 Chrome 还没有放手（保持到 holdUntil，没有被 2 秒空闲释放提前断开）');
  await until(() => ringProcess.exited, 8000, 'holdUntil 之后连接释放、组件退出');
  assert.ok(ringProcess.exitedAt - snoozed.hideAt >= 4800, `连接至少保持到 hide 后约 5 秒：${ringProcess.exitedAt - snoozed.hideAt} ms`);
  console.log('PASS 8：没有常驻 → 响铃临时出现 → 点“稍后” → Chrome 先 hide 再回执 → 确认语演完 → 连接保持到 holdUntil 后释放', JSON.stringify({ heldMs: ringProcess.exitedAt - snoozed.hideAt, realMouse: withMouse }));

  console.log('PASS: bridge 全部阶段（真实 Chrome 侧模块 ↔ 真实原生进程）');
} catch (error) {
  if (interrupted) {
    console.error(`被真实输入打断，不算验收失败：${interrupted}\n等用户安静后重跑（退出码 ${EXIT_USER_ACTIVE}）。`);
    process.exitCode = EXIT_USER_ACTIVE;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
} finally {
  runtime.killAll();
  process.exit(process.exitCode || 0);   // Chrome 一侧模块里还有为生产环境准备的长定时器（提醒有效期等），不等它们
}
