// 隔离验收：桌面 AI 助手面板（协议 v7）——全局快捷键注册 / 被占用 / 注销、面板状态机（提交 / 停止 / 回执 / 8 秒无回执 / 重试幂等）、
// Chrome 推来的任务状态渲染、焦点核对与重试、真实合成热键与键盘输入、面板位置、水母右键菜单入口。
// 用独立构建的原生组件（--app，独立 Bundle ID，不改写真实组件保存的位置），不连接 Chrome，不读写任何闹钟、任务或设置。
//   node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
//   node desktop-reminder/assistant-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-keyboard] [--shots=/tmp/tk/shots] [--only=名称[,名称…]]
// 面板操作经隔离测试钩子 assistantHook 触发（环境变量 TIMEKEEPER_TEST_HOOKS=1，只有本脚本设置；正式组件恒回 ok:false），走与用户操作相同的入口。
// 键盘阶段用 mouse-helper.swift 合成真实按键：全局热键只用 ⌃⌥⇧⌘+F19/F20 这种在任何应用里都不做事的组合，文字与回车 / Esc 只在确认面板
// 已是键窗口之后才发送。键盘与鼠标阶段运行期间不要碰键盘和鼠标。截图只用 `screencapture -l <窗口号>` 取面板自己，不截整屏或区域。
// --no-keyboard 跳过合成键盘与鼠标移动的阶段；--only 取场景名（config conflict presets protocol no-ack focus hooks-off lifecycle menu keyboard placement shots）。
// 礼让用户（desktop-reminder/user-quiet.mjs）：开始前等用户至少安静 --quiet=秒（默认 20）；运行中发现真实键盘 / 鼠标输入就立刻撤掉测试面板、
// 等用户重新安静后重跑这个场景（场景互相独立），连续被打断 6 次才以退出码 75 结束（不算验收失败，稍后重跑即可），避免把用户正在打的字抢进测试面板。
// --quiet=0 关闭（只在无人值守时用）。
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Quiet, EXIT_USER_ACTIVE } from './user-quiet.mjs';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg('extension-id');
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = arg('app');
if (!app) throw new Error('必须用 --app 指向隔离构建，避免改写真实组件的窗口记忆');
const shots = arg('shots');
const only = arg('only')?.split(',').filter(Boolean) || null;      // 可写成 --only=focus,hooks-off
const withKeys = !process.argv.includes('--no-keyboard');
const SCENARIOS = ['config', 'conflict', 'presets', 'protocol', 'no-ack', 'focus', 'hooks-off', 'lifecycle', 'menu', 'keyboard', 'placement', 'shots'];
for (const name of only || []) {
  if (!SCENARIOS.includes(name)) throw new Error(`--only 目前只支持 ${SCENARIOS.join('、')}`);
  if (['keyboard', 'placement'].includes(name) && !withKeys) throw new Error(`--only=${name} 需要真实键盘或鼠标，不能带 --no-keyboard`);
}
if (shots) mkdirSync(shots, { recursive: true });
const JellyDesktop = createRequire(import.meta.url)('../js/jelly-desktop.js');

const helper = resolve('/tmp', `tk-assistant-helper-${process.pid}`);
execFileSync('/usr/bin/xcrun', ['swiftc', resolve(root, 'desktop-reminder/mouse-helper.swift'), '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', helper], { stdio: 'inherit' });
const quiet = new Quiet(Number(arg('quiet') ?? 20));
const helperRun = (...a) => { try { return execFileSync(helper, a.map(String), { encoding: 'utf8' }); } finally { quiet.touch(); } };   // 合成输入会重置系统空闲时间，记下来才分得清哪些是真实用户
const key = combo => helperRun('key', combo);
const typeText = text => helperRun('text', text);
// 各屏可见区（Cocoa 坐标，原点在主屏左下角）：x y w h，一行一块
const screens = () => helperRun('screens').trim().split('\n').map(line => { const [x, y, w, h] = line.split(' ').map(Number); return { x, y, w, h }; });
// 面板中心所在的那块屏幕（鼠标可能在任何一块屏幕上）
const screenOf = frame => screens().find(s => frame.x + frame.w / 2 >= s.x && frame.x + frame.w / 2 <= s.x + s.w && frame.y + frame.h / 2 >= s.y && frame.y + frame.h / 2 <= s.y + s.h) || screens()[0];

function start(env = {}) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', ...env } });
  const host = { child, events: [], pending: new Map(), seq: 0, buffer: Buffer.alloc(0), exited: new Promise(done => child.once('exit', done)) };
  child.stdin.on('error', () => {});                                          // 进程已退出后再写会触发 EPIPE，场景里有意让进程退出
  child.stdout.on('data', chunk => {
    host.buffer = Buffer.concat([host.buffer, chunk]);
    while (host.buffer.length >= 4 && host.buffer.length >= host.buffer.readUInt32LE(0) + 4) {
      const size = host.buffer.readUInt32LE(0);
      const message = JSON.parse(host.buffer.subarray(4, size + 4)); host.buffer = host.buffer.subarray(size + 4);
      if (host.pending.has(message.requestId)) { host.pending.get(message.requestId)(message); host.pending.delete(message.requestId); }
      else host.events.push(message);
    }
  });
  host.request = (command, payload = {}) => new Promise((ok, fail) => {
    const requestId = String(++host.seq);
    const timeout = setTimeout(() => { host.pending.delete(requestId); fail(new Error(`原生组件超时: ${command}`)); }, 5000);
    host.pending.set(requestId, value => { clearTimeout(timeout); ok(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
  host.waitEvent = async (type, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const index = host.events.findIndex(e => e.type === type); if (index >= 0) return host.events.splice(index, 1)[0]; await delay(40); }
    // 失败时带上面板当时的状态和已收到的其他事件，下次出现间歇失败时能直接判断是按键没送到、焦点不对，还是状态不对
    const snapshot = await host.request('ping').then(r => JSON.stringify(view(r)), () => '读取失败');
    throw new Error(`没有收到 ${type}；当时的面板 ${snapshot}；已收到的其他事件 ${host.events.map(e => e.type).join(',') || '无'}`);
  };
  host.noEvent = async (type, message, ms = 400) => { await delay(ms); assert.equal(host.events.some(e => e.type === type), false, message); };
  host.stop = async () => {
    if (host.child.exitCode !== null || host.child.signalCode !== null) return;      // 场景里已经让它退出了（或被中止时杀掉了）
    await host.request('jelly', { jelly: { resident: false } }).catch(() => {});
    host.child.stdin.end();
    await Promise.race([host.exited, delay(2000)]);
    if (host.child.exitCode === null) host.child.kill('SIGTERM');
  };
  return host;
}
// 面板相关的回执字段（失败信息里用）
const view = r => ({
  enabled: r.assistantEnabled, visible: r.assistantVisible, key: r.assistantKey, keyWindow: r.assistantKeyWindow, active: r.assistantActive, editing: r.assistantEditing, focusFailed: r.assistantFocusFailed,
  hotkey: r.assistantHotkey, hotkeyStatus: r.assistantHotkeyStatus, pending: r.assistantPending, status: r.assistantStatus, tone: r.assistantTone,
  input: r.assistantInput, task: r.assistantTask, taskStatus: r.assistantTaskStatus, frame: r.assistantFrame, mouse: r.mouse, screens: r.screenCount,
});
const ping = h => h.request('ping');
const until = async (h, predicate, ms = 3000, label = '条件') => {
  const end = Date.now() + ms; let reply;
  while (Date.now() < end) { reply = await ping(h); if (predicate(reply)) return reply; await delay(60); }
  throw new Error(`等待超时：${label}\n${JSON.stringify(view(reply), null, 1)}${withKeys ? `\n当前前台应用 ${front()}（唤出前是 ${startFront}）` : ''}`);   // 前台应用能区分“我们的焦点逻辑有问题”和“外部把前台抢走了”
};
const hook = (h, op, extra = {}) => h.request('assistantHook', { op, ...extra });
const CHORD = 'ctrl+option+shift+cmd+f20';
const CHORD_B = 'ctrl+option+shift+cmd+f19';
const chordGlyph = '⌃⌥⇧⌘F20';
const applyConfig = (h, assistant, resident = true) => h.request('jelly', { jelly: { resident, night: true, ...(assistant ? { assistant } : {}) } });
const enable = (h, hotkey = CHORD) => applyConfig(h, { enabled: true, hotkey });
const task = (status, extra = {}) => ({ taskId: 'task-1', version: 2, status, input: '提醒我明天上午九点开会', message: '', at: Date.now(), ...extra });
const pushState = (h, state) => h.request('assistantState', { state });
const front = () => execFileSync('/usr/bin/lsappinfo', ['front'], { encoding: 'utf8' }).trim();
const startFront = withKeys ? front() : '';
const frameOf = text => { const m = text.match(/\{\{(-?[\d.]+), (-?[\d.]+)\}, \{([\d.]+), ([\d.]+)\}\}/); return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] }; };
const scenarioNames = [];
const MAX_INTERRUPTIONS = 6;
async function scenario(name, env, body) {
  if (only && !only.includes(name)) return;
  scenarioNames.push(name);
  // 每个场景都用全新的原生进程、互不依赖，所以被用户打断后可以直接重跑这个场景：等他重新安静，再来一遍。
  for (let attempt = 1; ; attempt++) {
    await quiet.waitIfActive();                  // 第一次等到用户安静；之后只有用户回来了才再等
    const h = start(env);
    const stopWatching = quiet.watch(reason => { h.interrupted = reason; h.child.kill('SIGKILL'); });      // 用户回来了：立刻撤掉测试面板，不再占着键盘
    let interrupted = null;
    try { await body(h); console.log(`  ✓ ${name}${attempt > 1 ? `（第 ${attempt} 次运行，前几次被用户的真实输入打断）` : ''}`); return; }
    catch (error) { if (!h.interrupted) throw error; interrupted = h.interrupted; }
    finally { stopWatching(); await h.stop(); }
    console.log(`  （场景 ${name} 被打断：${interrupted}；等用户重新安静后重跑）`);
    if (attempt >= MAX_INTERRUPTIONS) { console.error(`USER_ACTIVE：场景 ${name} 连续 ${attempt} 次被用户的真实输入打断。这不是验收失败，等用户安静后重跑即可。`); process.exit(EXIT_USER_ACTIVE); }
  }
}
function capture(file, windowNumber) {
  for (let attempt = 0; attempt < 3; attempt++) {
    rmSync(file, { force: true });
    try { execFileSync('/usr/sbin/screencapture', ['-x', '-o', `-l${windowNumber}`, file], { stdio: 'pipe' }); } catch { /* 下面按文件大小判断并重试 */ }
    try { if (readFileSync(file).readUInt32BE(16) > 16) return; } catch { /* 没有文件 */ }
    execFileSync('/bin/sleep', ['0.5']);
  }
  throw new Error(`screencapture 没有取到窗口 ${windowNumber} 的有效图像`);
}

console.log('桌面 AI 助手隔离验收（协议 v7）：键盘与鼠标阶段运行期间请不要碰键盘和鼠标');

// ---------- 配置：默认关闭、启用、非法、停用 ----------
await scenario('config', {}, async h => {
  let r = await ping(h);
  assert.equal(r.version, 10); assert.equal(r.assistantEnabled, false, '默认关闭');
  assert.equal(r.assistantHotkeyStatus, 'off'); assert.equal(r.assistantMenu, null); assert.equal(r.assistantVisible, false);
  assert.equal((await hook(h, 'show')).ok, false, '未启用时不能唤出面板');
  assert.equal((await pushState(h, task('running'))).ok, true, '未启用时也接受状态（只存不显示）');
  assert.equal((await ping(h)).assistantVisible, false);
  r = await applyConfig(h);                                                    // 没带 assistant：保持关闭，也没有回报
  assert.equal(r.ok, true); assert.equal(r.assistant, undefined, '没带 assistant 就没有回报'); assert.equal(r.assistantEnabled, false);

  r = await enable(h);
  assert.equal(r.ok, true); assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD }, '启用后回报注册结果与规范热键');
  assert.equal(r.assistantEnabled, true); assert.equal(r.assistantHotkey, CHORD); assert.equal(r.assistantHotkeyStatus, 'ok');
  assert.equal(r.assistantMenu, `问 AI…（${chordGlyph}）`); assert.equal(r.assistantFooter, `Esc 收起 · ${chordGlyph} 再按一次也可收起`);
  r = await enable(h);                                                         // 重复下发同一配置：仍然 ok，不重复注册、不报占用
  assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD }, '同一配置重复下发仍然 ok');

  r = await h.request('jelly', { jelly: { resident: true, night: true, assistant: { enabled: true, hotkey: ` ${CHORD.toUpperCase()}\n` } } });
  assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD }, '大小写与首尾空白被规范化');
  r = await enable(h, 'shift+b');                                              // 非法热键：面板仍启用（菜单入口可用），只报告 invalid
  assert.deepEqual(r.assistant, { status: 'invalid' }, '非法热键只回报 invalid、不带 hotkey');
  assert.equal(r.assistantEnabled, true); assert.equal(r.assistantHotkey, null); assert.equal(r.assistantMenu, '问 AI…');
  assert.match(r.assistantFooter, /快捷键没有生效/); assert.equal((await hook(h, 'show')).ok, true, '热键无效时菜单入口仍可唤出面板');
  assert.equal((await ping(h)).assistantVisible, true);
  r = await enable(h);                                                         // 改回有效热键
  assert.equal(r.assistant.status, 'ok'); assert.equal(r.assistantHotkey, CHORD);

  r = await h.request('jelly', { jelly: { resident: true, night: true, assistant: { enabled: 'true', hotkey: CHORD } } });   // enabled 不是明确的 true：按关闭
  assert.equal(r.assistant, undefined); assert.equal(r.assistantEnabled, false, '只有明确的 true 才启用'); assert.equal(r.assistantVisible, false, '关闭时面板收起');
  assert.equal(r.assistantMenu, null); assert.equal(r.assistantHotkeyStatus, 'off'); assert.equal(r.assistantHotkey, null);
  r = await enable(h);
  r = await h.request('jelly', { jelly: { resident: true, night: true, assistant: { enabled: false, hotkey: CHORD } } });
  assert.equal(r.assistantEnabled, false); assert.equal(r.assistantHotkeyStatus, 'off');
  r = await enable(h);
  r = await h.request('jelly', { jelly: 'not-an-object' });                    // 非法负载：被拒绝，助手配置保持原样
  assert.equal(r.ok, false); assert.equal(r.assistantEnabled, true, '被拒绝的 jelly 命令不改助手配置'); assert.equal(r.assistantHotkey, CHORD);
  r = await applyConfig(h);                                                    // 再不带 assistant：关闭并清掉面板状态
  assert.equal(r.assistantEnabled, false); assert.equal(r.assistantTask, null, '停用后状态清掉');
  r = await ping(h);
  assert.equal(r.assistantMenu, null);
  assert.ok(!r.countdownMenu.some(title => title.startsWith('问 AI')), '停用后水母右键菜单里没有“问 AI…”');
});

// ---------- 与其他应用的热键冲突：系统检测不到 ----------
// macOS 26.5 实测：RegisterEventHotKey 并不独占——另一个进程注册同一组合照样返回成功，按下时两个进程都会收到（只有同一进程重复注册才返回 -9878，
// 系统保留的组合如 ⌘Space、⇧⌘3 也照样返回成功）。所以与其他应用的冲突无法检测，设置页只承诺“已向系统注册”，不承诺“没有冲突”。
// 这里把观察到的系统行为记录成断言：哪天系统改成独占，本场景会失败，提醒同步改设置页文字与技术文档。
await scenario('conflict', {}, async a => {
  const b = start();
  try {
    let r = await enable(a, CHORD_B);
    assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD_B });
    r = await enable(b, CHORD_B);
    assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD_B }, '另一个进程注册同一组合，系统照样返回成功（不会报告占用）');
    assert.equal(r.assistantMenu, '问 AI…（⌃⌥⇧⌘F19）');
    if (withKeys) {
      key(CHORD_B);
      const seen = [];
      for (const [name, host] of [['A', a], ['B', b]]) {
        const state = await until(host, x => x.assistantVisible, 2500, `进程 ${name} 收到热键`).catch(() => null);
        seen.push(state ? name : null);
      }
      console.log(`    两个进程注册同一热键后按下：收到的进程 ${seen.filter(Boolean).join('、') || '无'}`);
      assert.deepEqual(seen, ['A', 'B'], '同一组合按下时两个进程都收到（系统不独占）');
      await hook(a, 'hide'); await hook(b, 'hide');
    }
    await applyConfig(a);                                                      // A 停用后 B 的注册不受影响
    r = await enable(b, CHORD_B);
    assert.deepEqual(r.assistant, { status: 'ok', hotkey: CHORD_B });
  } finally { await b.stop(); }
});

// ---------- 预设热键：系统是否接受（被别的应用占用只报告，不算失败；只注册不按键） ----------
await scenario('presets', {}, async h => {
  for (const preset of JellyDesktop.HOTKEY_PRESETS) {
    const r = await enable(h, preset);
    assert.ok(['ok', 'taken'].includes(r.assistant.status), `${preset}：期望 ok 或 taken，实际 ${r.assistant.status}`);
    assert.equal(r.assistantHotkeyStatus, r.assistant.status);
    console.log(`    预设 ${preset}：${r.assistant.status === 'ok' ? '注册成功' : '已被本机其他应用占用（环境相关，非缺陷）'}`);
    await applyConfig(h);                                                      // 马上注销，不让测试进程长期占着用户的热键
    assert.equal((await ping(h)).assistantHotkeyStatus, 'off');
  }
});

// ---------- 面板协议：提交 / 停止 / 回执 / 状态渲染 / 非法负载（不依赖键盘） ----------
await scenario('protocol', {}, async h => {
  await enable(h);
  assert.equal((await hook(h, 'show')).ok, true);
  let r = await until(h, x => x.assistantVisible, 2000, '面板可见');
  assert.equal(r.assistantStatus, '输入需求，按回车发送'); assert.equal(r.assistantStopVisible, false); assert.equal(r.assistantYou, '');
  assert.deepEqual(Object.keys(r.assistantButtons).sort(), ['close', 'input', 'open', 'send'], '空闲时没有“停止”按钮');

  // 空输入与超长输入：不发事件，给出本地提示
  assert.equal((await hook(h, 'submit')).ok, true);
  r = await ping(h); assert.equal(r.assistantStatus, '请先输入需求'); assert.equal(r.assistantPending, 'none');
  await hook(h, 'type', { text: ' \n\t ' }); await hook(h, 'submit'); assert.equal((await ping(h)).assistantStatus, '请先输入需求', '纯空白不发送');
  await hook(h, 'type', { text: '字'.repeat(501) }); r = await ping(h);
  assert.equal(r.assistantStatus, '超过 500 字（现在 501 字），请精简后再发送'); assert.equal(r.assistantTone, 'bad');
  await hook(h, 'submit'); await h.noEvent('assistantAction', '超长文字不能发出');
  await hook(h, 'type', { text: '字'.repeat(500) }); r = await ping(h);
  assert.notEqual(r.assistantTone, 'bad', '正好 500 字不报超长'); assert.equal(r.assistantStatus, '输入需求，按回车发送', '超长提示在改短后消失');

  // 提交：文字清洗（换行与制表当空格、首尾去空白）、回执前锁定、不匹配的回执忽略、匹配回执后清空输入
  await hook(h, 'type', { text: '  提醒我\n明天\t九点开会 ' });
  assert.equal((await hook(h, 'submit')).ok, true);
  const submit = await h.waitEvent('assistantAction');
  assert.equal(submit.action, 'submit'); assert.equal(submit.text, '提醒我 明天 九点开会'); assert.match(submit.actionId, /^[0-9A-F-]{36}$/);
  assert.equal(submit.taskId, undefined, '没有任务时不带 taskId'); assert.equal(submit.version, undefined);
  r = await ping(h);
  assert.equal(r.assistantPending, 'submit'); assert.equal(r.assistantSendEnabled, false, '等回执时发送按钮锁定'); assert.equal(r.assistantStatus, '正在交给 Chrome…');
  assert.equal((await hook(h, 'submit')).ok, true); await h.noEvent('assistantAction', '等回执时再点发送不能重复发出');
  await h.request('assistantResult', { actionId: 'someone-else', ok: true });
  assert.equal((await ping(h)).assistantPending, 'submit', '不匹配的回执不能解除等待');
  await h.request('assistantResult', { actionId: submit.actionId, ok: true });
  r = await ping(h);
  assert.equal(r.assistantPending, 'none'); assert.equal(r.assistantStatus, '已交给 Chrome，等待助手…'); assert.equal(r.assistantInput, '', '提交被接受后清空输入'); assert.equal(r.assistantSendEnabled, true);
  await h.request('assistantResult', { actionId: submit.actionId, ok: false, error: '晚到的重复回执' });
  assert.equal((await ping(h)).assistantStatus, '已交给 Chrome，等待助手…', '已处理动作的重复回执不再生效');

  // 提交失败：显示 Chrome 给的原因，保留输入，可重试（新的 actionId）
  await hook(h, 'type', { text: '再来一次' }); await hook(h, 'submit');
  const failed = await h.waitEvent('assistantAction');
  await h.request('assistantResult', { actionId: failed.actionId, ok: false, error: '已有任务在执行，请先停止或等它结束' });
  r = await ping(h);
  assert.equal(r.assistantStatus, '已有任务在执行，请先停止或等它结束'); assert.equal(r.assistantTone, 'bad'); assert.equal(r.assistantInput, '再来一次', '失败时保留输入'); assert.equal(r.assistantPending, 'none');
  await hook(h, 'submit'); const retried = await h.waitEvent('assistantAction');
  assert.notEqual(retried.actionId, failed.actionId, '被明确拒绝后的重试是新动作');
  await h.request('assistantResult', { actionId: retried.actionId, ok: false });
  assert.equal((await ping(h)).assistantStatus, 'Chrome 没有接受这次操作，请重试', '没有原因时的兜底说明');
  await hook(h, 'type', { text: '' });

  // 状态渲染：只复述引擎的状态；completed 写“助手已回复”，不改写成“已播放 / 已设置”
  const cases = [
    ['planning', '正在规划…', 'normal', true], ['running', '正在执行…', 'normal', true],
    ['waiting', /^需要你选择：.*确认卡/, 'attention', false], ['review', /^需要你确认：.*确认卡/, 'attention', false], ['clarify', /^需要你补充：/, 'attention', false],
    ['completed', /^助手已回复 · 刚刚$/, 'normal', false], ['failed', /^没有完成 · 刚刚$/, 'bad', false],
    ['interrupted', /^已中断，请到 Chrome 里核对实际结果，不要直接重做 · 刚刚$/, 'bad', false], ['cancelled', /^已取消 · 刚刚$/, 'normal', false],
  ];
  let version = 2;
  for (const [status, text, tone, stoppable] of cases) {
    r = await pushState(h, task(status, { version: ++version, message: status === 'completed' ? '已创建提醒：明天 09:00“开会”。\n第二行' : '' }));
    assert.equal(r.ok, true, status);
    assert.ok(typeof text === 'string' ? r.assistantStatus === text : text.test(r.assistantStatus), `${status}：${r.assistantStatus}`);
    assert.equal(r.assistantTone, tone, `${status} 语气`); assert.equal(r.assistantStopVisible, stoppable, `${status}：只有规划 / 执行中才有“停止”`);
    assert.equal(r.assistantTaskStatus, status); assert.equal(r.assistantTaskVersion, version); assert.equal(r.assistantYou, '你：提醒我明天上午九点开会');
    assert.doesNotMatch(r.assistantStatus, /已播放|已设置|已完成|已创建/, '状态文字不得改写成业务结果');
  }
  r = await pushState(h, task('completed', { version: ++version, message: '已创建提醒：明天 09:00“开会”。\n第二行' }));
  assert.equal(r.assistantBody, '已创建提醒：明天 09:00“开会”。\n第二行', '助手原文保留换行');
  const frameBefore = frameOf(r.assistantFrame);
  r = await pushState(h, task('completed', { version: ++version, message: '很长的回复。'.repeat(400) }));
  assert.ok(r.assistantBody.length <= 1200 && r.assistantBody.endsWith('…'), '助手原文最多 1200 字符并以 … 结尾');
  const frameLong = frameOf(r.assistantFrame);
  assert.ok(frameLong.h > frameBefore.h, '回复变长面板变高');
  assert.ok(frameLong.h <= 440, `回复区最高 240 点，再长面板也不会无限增高（实际 ${frameLong.h}）`);
  assert.ok(Math.abs((frameLong.y + frameLong.h) - (frameBefore.y + frameBefore.h)) < 1, '面板高度变化时顶边不动');
  const screen = screenOf(frameLong);
  assert.ok(frameLong.y >= screen.y - 0.5 && frameLong.y + frameLong.h <= screen.y + screen.h + 0.5, '长回复的面板仍在可见区内');

  // 非法负载：被拒绝，状态保持
  const before = (await ping(h)).assistantTaskVersion;
  for (const bad of [task('running', { taskId: 'bad id' }), task('running', { taskId: '' }), task('running', { taskId: 'x'.repeat(101) }), task('running', { version: -1 }),
    task('running', { version: 1.5 }), task('running', { version: '2' }), task('weird'), { taskId: 'a', version: 1 }, 'running', 5, [], {}]) {
    r = await pushState(h, bad);
    assert.equal(r.ok, false, `应拒绝：${JSON.stringify(bad)}`); assert.equal(r.assistantTaskVersion, before, '非法负载不改变状态');
  }
  r = await pushState(h, task('running', { input: '带\u0007控制字符\u202e的需求\n换行', message: '执行\u0000中' }));
  assert.equal(r.assistantYou, '你：带控制字符的需求 换行', '控制字符与方向控制符被去掉、换行折成空格'); assert.equal(r.assistantBody, '执行中');

  // 停止：带上面板所见的任务与版本；失败回执显示原因；成功回执只写“已请求停止”
  version = (await ping(h)).assistantTaskVersion;
  assert.equal((await hook(h, 'stop')).ok, true);
  const stop = await h.waitEvent('assistantAction');
  assert.equal(stop.action, 'cancel'); assert.equal(stop.taskId, 'task-1'); assert.equal(stop.version, version); assert.equal(stop.text, undefined);
  r = await ping(h); assert.equal(r.assistantPending, 'stop'); assert.equal(r.assistantStatus, '正在请求停止…'); assert.equal(r.assistantStopVisible, true);
  await h.request('assistantResult', { actionId: stop.actionId, ok: false, error: '任务已经变化，请重新查看' });
  r = await ping(h); assert.equal(r.assistantStatus, '任务已经变化，请重新查看'); assert.equal(r.assistantTone, 'bad'); assert.equal(r.assistantPending, 'none');
  await hook(h, 'stop'); const stop2 = await h.waitEvent('assistantAction');
  await h.request('assistantResult', { actionId: stop2.actionId, ok: true });
  assert.equal((await ping(h)).assistantStatus, '已请求停止，等 Chrome 更新任务状态…');
  await pushState(h, task('cancelled', { version: version + 1 }));
  assert.equal((await ping(h)).assistantStatus.startsWith('已取消'), true, '新状态盖过本地提示');
  assert.equal((await hook(h, 'stop')).ok, false, '没有可停止的任务时停止不可用'); await h.noEvent('assistantAction', '没有可停止任务时不能发出停止');

  // 等回执期间用户在输入框里又写了别的内容：回执到达时不能把新内容清掉（只有输入框仍是发出时的原文才清空）
  await hook(h, 'type', { text: '第一句' }); await hook(h, 'submit'); const typed = await h.waitEvent('assistantAction');
  await hook(h, 'type', { text: '等回执时写的第二句' });
  await h.request('assistantResult', { actionId: typed.actionId, ok: true });
  r = await ping(h);
  assert.equal(r.assistantInput, '等回执时写的第二句', '输入框已不是发出时的原文：保留用户新写的内容'); assert.equal(r.assistantPending, 'none');
  await hook(h, 'type', { text: '' });

  // 回执晚于状态：Chrome 先推状态、后回执时，不能用过时的“已交给 Chrome”盖掉真实进度
  await hook(h, 'type', { text: '先推状态' }); await hook(h, 'submit'); const racing = await h.waitEvent('assistantAction');
  await pushState(h, task('running', { version: 20, input: '先推状态' }));
  await h.request('assistantResult', { actionId: racing.actionId, ok: true });
  r = await ping(h); assert.equal(r.assistantStatus, '正在执行…', '状态已经推来时回执不再覆盖'); assert.equal(r.assistantInput, '');

  // 带着任务提交：附上所见任务与版本（Chrome 用来走“第 2 个”之类引用与过期检查）
  await hook(h, 'type', { text: '第二个' }); await hook(h, 'submit'); const withTask = await h.waitEvent('assistantAction');
  assert.equal(withTask.taskId, 'task-1'); assert.equal(withTask.version, 20);
  await h.request('assistantResult', { actionId: withTask.actionId, ok: true });

  // 在 Chrome 中查看：不带任务与版本、不带文字
  assert.equal((await hook(h, 'open')).ok, true);
  const open = await h.waitEvent('assistantAction');
  assert.equal(open.action, 'open'); assert.equal(open.taskId, undefined); assert.equal(open.version, undefined); assert.equal(open.text, undefined);
  assert.equal((await ping(h)).assistantStatus, '正在请求 Chrome 打开工作台…');
  await h.request('assistantResult', { actionId: open.actionId, ok: true });
  assert.equal((await ping(h)).assistantStatus, '已请求 Chrome 打开工作台');
  await pushState(h, null);                                                    // null：没有任务
  r = await ping(h); assert.equal(r.assistantTask, null); assert.equal(r.assistantYou, ''); assert.equal(r.assistantBody, ''); assert.equal(r.assistantStatus, '输入需求，按回车发送');
  assert.equal((await hook(h, 'close')).ok, true); assert.equal((await ping(h)).assistantVisible, false, '收起按钮只隐藏面板');
});

// ---------- 8 秒没有回执：只提示“尚未确认”，解除锁定；同一段文字重试沿用同一个 actionId；晚到的匹配回执仍然算数 ----------
await scenario('no-ack', {}, async h => {
  await enable(h); await hook(h, 'show');
  await hook(h, 'type', { text: '没有回执的请求' }); await hook(h, 'submit');
  const first = await h.waitEvent('assistantAction');
  let r = await ping(h); assert.equal(r.assistantPending, 'submit'); assert.equal(r.assistantSendEnabled, false);
  await delay(7000);
  r = await ping(h); assert.equal(r.assistantPending, 'submit', '8 秒之前仍在等回执');
  r = await until(h, x => x.assistantPending === 'stale-submit', 2500, '8 秒无回执后解除锁定');
  assert.match(r.assistantStatus, /^Chrome 尚未确认/); assert.equal(r.assistantTone, 'bad'); assert.equal(r.assistantSendEnabled, true); assert.equal(r.assistantInput, '没有回执的请求', '尚未确认时保留输入');
  assert.doesNotMatch(r.assistantStatus, /已提交|已交给|已发送/, '没有回执不能声称已提交');
  await hook(h, 'submit'); const same = await h.waitEvent('assistantAction');
  assert.equal(same.actionId, first.actionId, '同一段文字重试沿用同一个 actionId（Chrome 侧幂等，不会再提交一次）'); assert.equal(same.text, first.text);
  assert.equal((await ping(h)).assistantPending, 'submit');
  await h.request('assistantResult', { actionId: first.actionId, ok: true });
  r = await ping(h); assert.equal(r.assistantPending, 'none'); assert.equal(r.assistantInput, '');
  // 改了文字再发：新的 actionId
  await hook(h, 'type', { text: '另一个请求' }); await hook(h, 'submit'); const a = await h.waitEvent('assistantAction');
  await delay(7000); await until(h, x => x.assistantPending === 'stale-submit', 2500, '另一个请求 8 秒无回执后解除锁定');       // 定时器可能被系统合并推迟，用轮询而不是固定睡眠
  await hook(h, 'type', { text: '改过的请求' }); await hook(h, 'submit'); const b = await h.waitEvent('assistantAction');
  assert.notEqual(b.actionId, a.actionId, '文字变了就是新动作');
  await h.request('assistantResult', { actionId: a.actionId, ok: true });                                     // 旧动作的晚到回执不能解除新动作的等待
  assert.equal((await ping(h)).assistantPending, 'submit', '旧动作的回执不匹配新动作');
  await h.request('assistantResult', { actionId: b.actionId, ok: true });
  assert.equal((await ping(h)).assistantPending, 'none');
  // 停止与打开也有 8 秒门槛，但不会沿用 actionId（重试是新动作）
  await pushState(h, task('running')); await hook(h, 'stop'); const s1 = await h.waitEvent('assistantAction');
  await delay(7000); r = await until(h, x => x.assistantPending === 'stale-stop', 2500, '停止 8 秒无回执后解除锁定'); assert.match(r.assistantStatus, /^Chrome 尚未确认/);
  await hook(h, 'stop'); const s2 = await h.waitEvent('assistantAction');
  assert.notEqual(s2.actionId, s1.actionId, '停止没有回执后的重试是新动作');
  await h.request('assistantResult', { actionId: s2.actionId, ok: true });
  // 已经收到回执的动作，它那条 8 秒定时器到点时不能殃及后来的新动作（定时器按 actionId 核对）
  await hook(h, 'type', { text: '很快有回执' }); await hook(h, 'submit'); const quick = await h.waitEvent('assistantAction');
  const t0 = Date.now();
  await delay(800);
  await h.request('assistantResult', { actionId: quick.actionId, ok: true });                                  // 0.8 秒时收到回执
  await hook(h, 'type', { text: '紧接着的新请求' }); await hook(h, 'submit'); const next = await h.waitEvent('assistantAction');
  await delay(Math.max(0, t0 + 8600 - Date.now()));                                                            // quick 的定时器约在 t0+8.0 秒到点，next 自己的约在 t0+8.9 秒
  assert.equal((await ping(h)).assistantPending, 'submit', '前一个动作的定时器不能把新动作提前标成“尚未确认”');
  await until(h, x => x.assistantPending === 'stale-submit', 3000, '新动作自己的 8 秒到了才解除锁定');
  await h.request('assistantResult', { actionId: next.actionId, ok: true });
});

// ---------- 焦点核对：没拿到键盘就重试一次，仍没有就提示（面板保持可见，不吞输入） ----------
await scenario('focus', { TIMEKEEPER_TEST_FOCUS_SKIP: '1' }, async h => {
  await enable(h);
  await hook(h, 'show');
  let r = await until(h, x => x.assistantKey && x.assistantActive && x.assistantEditing, 3000, '第一次激活被跳过，核对后重试一次拿到键盘');
  assert.equal(r.assistantFocusFailed, false, '重试成功就不提示'); assert.equal(r.assistantVisible, true);
  // 再来一轮：上一次唤出用掉的那次重试不能带到下一次（每次唤出从头算，否则第二次一被跳过就直接放弃）
  await hook(h, 'hide');
  await until(h, x => !x.assistantVisible && !x.assistantActive, 3000, '收起后应用交还前台');
  assert.equal((await hook(h, 'skipfocus', { text: '1' })).ok, true);
  await hook(h, 'show');
  r = await until(h, x => x.assistantKey && x.assistantActive && x.assistantEditing, 3000, '这一次的第一次激活又被跳过，仍能核对后重试拿到键盘');
  assert.equal(r.assistantFocusFailed, false, '重试成功就不提示（重试次数没有沿用上一次）');
});
await scenario('focus', {}, async h => {
  await enable(h);
  await hook(h, 'show');
  await until(h, x => x.assistantKey && x.assistantActive, 3000, '唤出后拿到键盘');
  assert.equal((await hook(h, 'deactivate')).ok, true);                        // 用户在 250 毫秒核对之前就切去了别的应用
  await until(h, x => !x.assistantActive && !x.assistantKey, 3000, '切到别的应用后面板不再是键窗口');
  await delay(900);                                                            // 核对（250 毫秒）与可能的重试（再 250 毫秒）都已过去
  const r = await ping(h);
  assert.equal(r.assistantVisible, true, '面板仍可见（浮动）');
  assert.equal(r.assistantActive, false, '用户自己切走的，核对不能把键盘抢回来');
  assert.equal(r.assistantKey, false);
  assert.equal(r.assistantFocusFailed, false, '拿到过键盘后被切走不是激活失败，不提示');
  assert.equal(r.assistantStatus, '输入需求，按回车发送');
});
await scenario('focus', {}, async h => {
  // 上一次唤出拿到过键盘，不能让再次唤出的核对沿用它：这一次激活被跳过时仍要重试，仍没拿到就提示
  await enable(h);
  await hook(h, 'show');
  await until(h, x => x.assistantKey && x.assistantActive, 3000, '第一次唤出拿到键盘');
  await hook(h, 'hide');
  await until(h, x => !x.assistantVisible && !x.assistantActive, 3000, '收起后应用交还前台');
  assert.equal((await hook(h, 'skipfocus', { text: '2' })).ok, true);
  await hook(h, 'show');
  const r = await until(h, x => x.assistantFocusFailed, 3000, '第二次唤出两次都没拿到键盘，给出提示（不沿用第一次的记录）');
  assert.equal(r.assistantVisible, true); assert.equal(r.assistantKey, false);
});
await scenario('focus', { TIMEKEEPER_TEST_FOCUS_SKIP: '2' }, async h => {
  await enable(h);
  await hook(h, 'show');
  let r = await until(h, x => x.assistantFocusFailed, 3000, '两次都没拿到键盘后给出提示');
  assert.equal(r.assistantVisible, true, '没拿到键盘面板仍可见'); assert.equal(r.assistantKey, false);
  assert.equal(r.assistantStatus, '没有拿到键盘焦点，请点一下输入框再输入'); assert.equal(r.assistantTone, 'normal');
  await hook(h, 'type', { text: '仍然可以输入' }); assert.equal((await ping(h)).assistantInput, '仍然可以输入', '提示期间输入不被吞掉');
  assert.equal((await hook(h, 'focus')).ok, true);                             // 用户点了面板：这次不再跳过，拿到键盘后提示消失
  r = await until(h, x => x.assistantKey && x.assistantActive && !x.assistantFocusFailed, 3000, '重新要键盘成功后提示消失');
  assert.equal(r.assistantStatus, '输入需求，按回车发送');
});

// ---------- 测试钩子在正式使用时无效：没有 TIMEKEEPER_TEST_HOOKS=1 时 assistantHook 一律被拒绝，面板不会被弹出 ----------
await scenario('hooks-off', { TIMEKEEPER_TEST_HOOKS: '0' }, async h => {
  await enable(h);
  for (const op of ['show', 'toggle', 'type', 'submit', 'stop', 'open', 'focus', 'skipfocus', 'deactivate', 'move', 'close']) assert.equal((await hook(h, op, { text: '偷偷操作' })).ok, false, `正式使用时钩子 ${op} 必须无效`);
  const r = await ping(h);
  assert.equal(r.assistantVisible, false, '钩子无效时面板不会出现'); assert.equal(r.assistantInput, '');
  assert.equal((await h.request('ringButton', { id: 'dismiss' })).ok, false, '响铃钩子同样无效');
});

// ---------- 生命周期：停用清掉面板状态；Chrome 断开后进程结束（热键与面板随进程消失，没有“Chrome 未连接”的残留面板） ----------
await scenario('lifecycle', {}, async h => {
  let r = await enable(h, CHORD_B);
  assert.equal(r.assistant.status, 'ok');
  await hook(h, 'show'); await hook(h, 'type', { text: '没发出去的草稿' }); await pushState(h, task('running'));
  await applyConfig(h);                                                        // 停用：收起、清状态、清输入
  r = await ping(h);
  assert.equal(r.assistantVisible, false); assert.equal(r.assistantTask, null); assert.equal(r.assistantInput, '');
  r = await enable(h, CHORD_B);
  assert.equal(r.assistantStatus, '输入需求，按回车发送', '重新启用后没有旧任务'); assert.equal(r.assistantInput, '');
  h.child.stdin.end();                                                         // Chrome 断开：原生进程随之结束，热键与面板随进程一起消失
  await Promise.race([h.exited, delay(3000)]);
  assert.notEqual(h.child.exitCode, null, 'Chrome 断开后原生进程应退出');
});

// ---------- 水母右键菜单入口：启用后第一项是“问 AI…”，点选唤出面板；停用后消失 ----------
await scenario('menu', {}, async h => {
  let r = await ping(h);
  assert.ok(!r.countdownMenu.some(title => title.startsWith('问 AI')), '默认没有菜单项');
  await enable(h);
  r = await ping(h);
  assert.equal(r.countdownMenu[0], `问 AI…（${chordGlyph}）`, '“问 AI…”是水母右键菜单的第一项');
  assert.equal((await h.request('menuItem', { title: `问 AI…（${chordGlyph}）` })).ok, true);
  r = await until(h, x => x.assistantVisible, 2000, '点选菜单项后面板出现');
  await hook(h, 'hide');
  r = await enable(h, 'shift+b');
  assert.equal(r.countdownMenu[0], '问 AI…', '热键无效时菜单项不带符号');
  assert.equal((await h.request('menuItem', { title: '问 AI…' })).ok, true);
  await until(h, x => x.assistantVisible, 2000, '热键无效时菜单入口仍可用');
  await applyConfig(h);
  r = await ping(h);
  assert.ok(!r.countdownMenu.some(title => title.startsWith('问 AI')), '停用后菜单项消失');
  assert.equal((await h.request('menuItem', { title: '问 AI…' })).ok, false, '菜单项消失后不能再触发');
});

// ---------- 真实合成热键与键盘：热键唤出并拿到键盘、输入、回车提交、Esc 收起并还焦点、再按一次收起、不在键窗口时再按重新唤出 ----------
if (withKeys) await scenario('keyboard', {}, async h => {
  await enable(h);
  const before = front();
  key(CHORD);
  let r = await until(h, x => x.assistantVisible, 2500, '合成热键唤出面板（热键没有注册上，或没有“辅助功能”权限时合成按键送不到）');
  r = await until(h, x => x.assistantKey && x.assistantActive && x.assistantEditing, 3000, '唤出后拿到键盘并开始编辑');
  assert.equal(r.assistantFocusFailed, false);
  assert.notEqual(front(), before, '面板拿到键盘后前台应用变成助手进程');
  // 键入文字（Unicode 注入）与回车提交
  typeText('你好，AI 助手');
  r = await until(h, x => x.assistantInput === '你好，AI 助手', 2000, '键入的文字出现在输入框');
  key('return');
  const sent = await h.waitEvent('assistantAction', 3000);
  assert.equal(sent.action, 'submit'); assert.equal(sent.text, '你好，AI 助手');
  assert.equal((await ping(h)).assistantPending, 'submit');
  await h.request('assistantResult', { actionId: sent.actionId, ok: true });
  r = await ping(h); assert.equal(r.assistantInput, ''); assert.equal(r.assistantStatus, '已交给 Chrome，等待助手…'); assert.equal(r.assistantEditing, true, '提交后输入框仍可继续输入');
  // 空输入回车：不发事件
  key('return'); await delay(400); r = await ping(h);
  assert.equal(r.assistantStatus, '请先输入需求'); await h.noEvent('assistantAction', '空输入回车不能发出');
  // 面板已经拿着键盘时又被唤出（比如点水母菜单里的“问 AI…”）：不能把“唤出前的应用”记成自己，否则 Esc 收起后前台回不去
  assert.equal((await hook(h, 'show')).ok, true); await delay(300);
  // Esc：收起并把前台还给唤出前的应用
  key('escape');
  await until(h, x => !x.assistantVisible, 2500, 'Esc 收起面板');
  const restoreEnd = Date.now() + 3000; while (Date.now() < restoreEnd && front() !== before) await delay(100);
  assert.equal(front(), before, 'Esc 收起后前台应该回到唤出前的应用');
  // 再按热键唤出；面板拿着键盘时再按一次收起
  key(CHORD);
  await until(h, x => x.assistantVisible && x.assistantKey && x.assistantEditing, 3000, '再次唤出');
  key(CHORD);
  await until(h, x => !x.assistantVisible, 2500, '面板拿着键盘时再按热键收起');
  const restoreEnd2 = Date.now() + 3000; while (Date.now() < restoreEnd2 && front() !== before) await delay(100);
  assert.equal(front(), before, '热键收起后前台回到唤出前的应用');
  // 面板可见但不是键窗口（用户切到了别的应用）：再按热键是重新唤出并拿键盘，不是收起
  key(CHORD);
  await until(h, x => x.assistantVisible && x.assistantKey, 3000, '唤出');
  assert.equal((await hook(h, 'deactivate')).ok, true);
  r = await until(h, x => x.assistantVisible && !x.assistantActive && !x.assistantKey, 3000, '切到别的应用后面板仍可见但不是键窗口');
  await delay(900);                                                            // 越过焦点核对与重试：用户自己切走的，不能被抢回来
  r = await ping(h);
  assert.equal(r.assistantVisible, true); assert.equal(r.assistantActive, false, '切走后不能被抢回键盘'); assert.equal(r.assistantKey, false); assert.equal(r.assistantFocusFailed, false);
  assert.equal(front(), before, '切走后前台仍是唤出前的应用');
  key(CHORD);
  r = await until(h, x => x.assistantVisible && x.assistantKey && x.assistantActive && x.assistantEditing, 3000, '不是键窗口时再按热键应重新拿到键盘');
  key('escape');
  await until(h, x => !x.assistantVisible, 2500, '收起');
  // 用户切到了第三个应用（Finder）再收起面板：键盘不在面板里，收起不能把前台拽回唤出前的应用
  const asn = text => text.match(/ASN:0x[0-9a-f]+-0x[0-9a-f]+/i)?.[0] || '';          // front 与 find 的输出格式不同（find 带应用名），只比较 ASN 本身
  const finder = asn(execFileSync('/usr/bin/lsappinfo', ['find', 'bundleid=com.apple.finder'], { encoding: 'utf8' }));
  if (finder && asn(before) !== finder) {
    const beforeBundle = execFileSync('/usr/bin/lsappinfo', ['info', '-only', 'bundleid', asn(before) + ':'], { encoding: 'utf8' }).match(/=\s*"([^"]+)"\s*$/)?.[1];
    const frontIs = async (target, ms = 3000) => { const end = Date.now() + ms; while (Date.now() < end && asn(front()) !== target) await delay(100); return asn(front()) === target; };
    await frontIs(asn(before));
    key(CHORD);
    await until(h, x => x.assistantVisible && x.assistantKey && x.assistantActive, 3000, '再次唤出');
    execFileSync('/usr/bin/open', ['-b', 'com.apple.finder']);                 // 用户去了别的应用（不是唤出前的那个）
    assert.ok(await frontIs(finder), '测试前提：前台已经是 Finder');
    r = await until(h, x => x.assistantVisible && !x.assistantActive, 3000, '切到 Finder 后面板仍可见但不是键窗口');
    assert.equal((await hook(h, 'hide')).ok, true);
    await until(h, x => !x.assistantVisible, 2500, '收起');
    await delay(800);
    assert.equal(asn(front()), finder, '键盘不在面板里时收起，前台留在用户当前的应用，不被拽回唤出前的应用');
    if (beforeBundle) { execFileSync('/usr/bin/open', ['-b', beforeBundle]); await frontIs(asn(before), 4000); }   // 把前台还给运行脚本的应用
  } else console.log('    （跳过“第三个应用”检查：唤出前的前台已经是 Finder）');
  // 换一个热键：旧组合注销、新组合生效（旧组合不能继续唤出面板，也不会悄悄占着）
  // assistantHotkeyPresses 是系统递给本进程的热键次数：面板可能因为“没启用”而不响应，只有这个数字能证明系统那边的注册真的注销了
  r = await applyConfig(h, { enabled: true, hotkey: CHORD_B });
  assert.equal(r.assistant.status, 'ok'); assert.equal(r.assistant.hotkey, CHORD_B);
  let presses = r.assistantHotkeyPresses;
  key(CHORD); await delay(700);
  r = await ping(h);
  assert.equal(r.assistantVisible, false, '换了热键之后旧组合不再唤出面板');
  assert.equal(r.assistantHotkeyPresses, presses, '旧组合已注销：系统不再把它递给本进程');
  key(CHORD_B);
  await until(h, x => x.assistantVisible && x.assistantKey, 3000, '新组合唤出面板');
  assert.equal((await ping(h)).assistantHotkeyPresses, presses + 1, '新组合被系统递送了一次');
  key('escape');
  await until(h, x => !x.assistantVisible, 2500, '收起');
  // 热键被改成非法：已注册的旧组合也要注销，不能悄悄占着
  r = await enable(h, 'shift+b');
  assert.deepEqual(r.assistant, { status: 'invalid' });
  presses = r.assistantHotkeyPresses;
  key(CHORD_B); await delay(700);
  r = await ping(h);
  assert.equal(r.assistantHotkeyPresses, presses, '热键变成非法后，原来的组合已注销'); assert.equal(r.assistantVisible, false);
  r = await applyConfig(h, { enabled: true, hotkey: CHORD });                 // 换回去，后面的“停用后不再响应”仍以它为准
  assert.equal(r.assistant.status, 'ok');
  // 停用后再按热键不再响应（系统已注销）
  r = await applyConfig(h);
  presses = r.assistantHotkeyPresses;
  key(CHORD); await delay(700);
  r = await ping(h);
  assert.equal(r.assistantVisible, false, '注销后热键不再唤出面板');
  assert.equal(r.assistantHotkeyPresses, presses, '停用后系统不再递送热键（注册真的注销了，没有悄悄占着用户的组合）');
});

// ---------- 面板位置：出现在鼠标所在屏幕，水平居中，顶边在可见区高度的 22% 处 ----------
if (withKeys) await scenario('placement', {}, async h => {
  await enable(h);
  const list = screens();
  for (const [index, screen] of list.entries()) {
    helperRun('move', screen.x + screen.w / 2, screen.y + screen.h / 2);     // 水母与面板都按鼠标所在屏幕选落点
    await delay(150);
    await hook(h, 'hide'); await hook(h, 'show');
    const r = await until(h, x => x.assistantVisible, 2000, `屏幕 ${index} 上出现面板`);
    const frame = frameOf(r.assistantFrame);
    const top = screen.y + screen.h - screen.h * 0.22;
    assert.ok(Math.abs(frame.x + frame.w / 2 - (screen.x + screen.w / 2)) <= 1, `屏幕 ${index}：水平居中（面板中心 ${frame.x + frame.w / 2}，屏幕中心 ${screen.x + screen.w / 2}；鼠标 ${r.mouse}）`);
    assert.ok(Math.abs(frame.y + frame.h - top) <= 1, `屏幕 ${index}：顶边在 22% 处（顶边 ${frame.y + frame.h}，期望 ${top}；鼠标 ${r.mouse}）`);
    assert.ok(frame.x >= screen.x - 0.5 && frame.x + frame.w <= screen.x + screen.w + 0.5 && frame.y >= screen.y - 0.5 && frame.y + frame.h <= screen.y + screen.h + 0.5, `屏幕 ${index}：面板在可见区内`);
    await hook(h, 'hide');
  }
  // 面板已显示时再次唤出：不能把用户拖动过的面板拽回原位（只有从隐藏到显示才重新定位）
  await hook(h, 'show');
  const original = frameOf((await until(h, x => x.assistantVisible, 2000, '再次显示')).assistantFrame);
  assert.equal((await hook(h, 'move', { text: '-60,-40' })).ok, true);
  const moved = frameOf((await ping(h)).assistantFrame);
  assert.ok(Math.abs(moved.x - (original.x - 60)) <= 0.5 && Math.abs(moved.y - (original.y - 40)) <= 0.5, `测试前提：面板被挪动了（原 ${original.x},${original.y}，后 ${moved.x},${moved.y}）`);
  await hook(h, 'show'); await delay(300);
  const again = frameOf((await ping(h)).assistantFrame);
  assert.ok(Math.abs(again.x - moved.x) <= 0.5 && Math.abs(again.y - moved.y) <= 0.5, `已显示时再次唤出不改变面板位置（拖后 ${moved.x},${moved.y}；再唤出后 ${again.x},${again.y}）`);
  await hook(h, 'hide'); await hook(h, 'show');
  const fresh = frameOf((await until(h, x => x.assistantVisible, 2000, '收起后重新显示')).assistantFrame);
  assert.ok(Math.abs(fresh.x - original.x) <= 0.5 && Math.abs(fresh.y - original.y) <= 0.5, `收起后重新显示回到标准位置（标准 ${original.x},${original.y}；实际 ${fresh.x},${fresh.y}）`);
  await hook(h, 'hide');
  console.log(`    验证了 ${list.length} 块屏幕`);
});

// ---------- 截图（可选）：只截面板自己的窗口，浅色与深色各一套，用来人工核对排版与可读性 ----------
if (shots) {
  for (const appearance of ['light', 'dark']) {
    await scenario('shots', { TIMEKEEPER_APPEARANCE: appearance }, async h => {
      await enable(h); await hook(h, 'show');
      const snap = async name => { await delay(450); const r = await ping(h); capture(resolve(shots, `assistant-${appearance}-${name}.png`), r.assistantWindowNumber); };
      await snap('idle');
      await hook(h, 'type', { text: '提醒我明天上午 9 点开会' }); await pushState(h, task('running', { input: '帮我把明天 9 点的会议设成提醒' })); await snap('running');
      await pushState(h, task('waiting', { version: 3 })); await snap('waiting');
      await pushState(h, task('completed', { version: 4, message: '已创建提醒：明天 09:00“开会”。\n\n快递提醒需要你确认具体时间，我没有替你猜。\n' + '较长的回复用来检查多行与滚动。'.repeat(30) })); await snap('completed');
      await pushState(h, task('interrupted', { version: 5 })); await snap('interrupted');
      await pushState(h, null); await hook(h, 'type', { text: '字'.repeat(520) }); await snap('too-long');
    });
  }
}

console.log(`PASS: assistant 隔离验收（${[...new Set(scenarioNames)].join('、')}）`);
