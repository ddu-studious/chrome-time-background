// 联调验收：Chrome 一侧的真实模块（AlarmDesktop / JellyDesktop / JellyNudge / AlarmCountdown / AlarmCore / AssistantNative / AssistantEngine，源码原样加载）经 connectNative 替身，
// 连接真实的原生组件进程，走完“常驻 → 喝水提醒 → 点按钮 → 计数与记录刷新 → 倒计时委托与菜单动作 → 到点响铃 → 桌面 AI 助手 → 断线重连 → 菜单退出 → 临时出现”整条链路。
// 这是介于“各自用替身的单元测试”与“真实 Chrome”之间的一层：协议字段、回执与生命周期由两端真实代码互相检验。
// 仍然不是真实 Chrome：没有 Service Worker 休眠、没有真实 Native Messaging 宿主清单、存储/闹钟/通知都是内存替身。
//   node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
//   node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-mouse]
// 不读写真实闹钟、喝水记录或设置；原生组件用独立 Bundle ID；点击只发生在水母自己的窗口上。
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const AlarmDesktop = require('../js/alarm-desktop.js');
const JellyDesktop = require('../js/jelly-desktop.js');
const JellyNudge = require('../js/jelly-nudge.js');
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
let helper = null;
if (withMouse) {
  helper = resolve('/tmp', `tk-mouse-helper-${process.pid}`);
  execFileSync('/usr/bin/xcrun', ['swiftc', resolve(root, 'desktop-reminder/mouse-helper.swift'), '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', helper], { stdio: 'inherit' });
}
const mouse = (...a) => execFileSync(helper, a.map(String));
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
const jellyNudge = JellyNudge.create({ syncStorage, localStorage, alarms, notifications, presenter: jellyDesktop.presenter, onChange: () => jellyDesktop.sync() });
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
  assert.equal(state.version, 7); assert.equal(state.jellyResident, true); assert.equal(state.focusStayed, true);
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
  console.error(error);
  process.exitCode = 1;
} finally {
  runtime.killAll();
  process.exit(process.exitCode || 0);   // Chrome 一侧模块里还有为生产环境准备的长定时器（提醒有效期等），不等它们
}
