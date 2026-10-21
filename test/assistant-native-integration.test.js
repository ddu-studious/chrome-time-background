// 桌面 AI 助手接线与联调：后台加载顺序与依赖注入、沙箱片段不受影响、不新增权限/网络；
// 真实 AlarmDesktop（v7 协议）+ 真实 AssistantEngine + 真实 AssistantNative，原生一端用主机替身驱动。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../js/assistant-engine.js');
const AssistantNative = require('../js/assistant-native.js');
const AlarmDesktop = require('../js/alarm-desktop.js');
const nativeDesktop = require('./fixtures/native-desktop.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const background = read('js/background.js');
const quick = read('js/assistant-background.js');
const nativeSource = read('js/assistant-native.js');

// ---------- 接线（源码扫描） ----------

test('后台 importScripts：assistant-native.js 在 assistant-confirmation.js 之后、assistant-background.js 之前', () => {
  const line = background.split('\n').find(row => row.includes('importScripts('));
  const at = name => line.indexOf(`'${name}'`);
  assert.ok(at('assistant-native.js') > at('assistant-confirmation.js') && at('assistant-native.js') < at('assistant-background.js'));
  assert.ok(at('jelly-desktop.js') >= 0 && at('alarm-desktop.js') >= 0);
});

test('QuickAssistant.install：把 jellyDesktop 作为 jelly 传入；适配层与确认卡共用同一个 desktop、engine，并随 engine.onChange 同步', () => {
  const install = background.slice(background.indexOf('QuickAssistant.install({'), background.indexOf('QuickAssistant.install({') + 400);
  assert.match(install, /desktop: desktopAlarm/);
  assert.match(install, /jelly: jellyDesktop/);
  assert.match(quick, /root\.AssistantNative\.create\(\{[^}]*desktop: deps\.desktop[^}]*engine[^}]*jelly: deps\.jelly[^}]*openWorkspace: \(\) => open\(false\)/s);
  assert.match(quick, /onChange: task => \{[^}]*native\?\.sync\(task\)/);
  assert.match(quick, /deps\.desktop && deps\.jelly && root\.AssistantNative/);
});

test('截取沙箱执行的片段（userAlarmSaveQueue 到 getUserAlarmViewState）不引用助手原生接线', () => {
  const from = background.indexOf('    let userAlarmSaveQueue');
  const to = background.indexOf('getUserAlarmViewState');
  assert.ok(from > 0 && to > from);
  assert.doesNotMatch(background.slice(from, to), /AssistantNative|assistantNative|assistantEnabled|hotkey/i);
});

test('适配层没有存储、网络、动态代码或页面注入：只依赖传入的 desktop / engine / jelly / openWorkspace / log', () => {
  const code = nativeSource.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /chrome\.|fetch\(|XMLHttpRequest|WebSocket|eval\(|new Function|innerHTML|importScripts|localStorage/);
  assert.match(code, /origin: 'desktop'/);
});

test('不新增权限：没有 idle、麦克风、摄像头；manifest 仍只有既有的 nativeMessaging', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const permission of ['idle', 'videoCapture', 'audioCapture', 'desktopCapture', 'pageCapture', 'tabCapture']) assert.ok(!manifest.permissions.includes(permission), permission);
  assert.ok(manifest.permissions.includes('nativeMessaging'));
});

// ---------- 联调：原生事件 → AlarmDesktop → AssistantNative → 真实 Engine → 状态回到原生 ----------

const wait = (ms = 15) => new Promise(resolve => setTimeout(resolve, ms));
async function fixture({ execute, enabled = true } = {}) {
  const values = {}; let count = 0, opened = 0, native;
  const host = nativeDesktop(7), desktop = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const step = { tool: 'music.intent', args: { text: '搜索歌手' } };
  const engine = Engine.create({ storage, now: () => Date.now(), id: () => `n-${++count}`, onChange: task => { void native?.sync(task); },
    plan: async () => ({ steps: [step] }), execute: execute || (async () => ({ status: 'completed', message: '已为你找到林俊杰的歌曲' })), choose: async () => ({ message: '好了' }) });
  const jelly = { enabled, assistantEnabled: async () => jelly.enabled, onAssistantApplied: null };
  const logs = [];
  native = AssistantNative.create({ desktop, engine, jelly, openWorkspace: async () => { opened++; }, log: (...args) => logs.push(args) });
  await desktop.status();               // 建立连接
  return { host, desktop, engine, native, jelly, logs, values, opened: () => opened, close() { native.dispose(); clearTimeout(desktop.idleTimer); host.port?.disconnect(); },
    states: () => host.sent.filter(m => m.command === 'assistantState').map(m => m.state),
    results: () => host.sent.filter(m => m.command === 'assistantResult') };
}

test('联调：原生提交 → 同一个 Engine 执行（任务输入带桌面来源）→ 进度与结果以投影回到原生；回执带 taskId/version', async () => {
  const f = await fixture();
  try {
    f.host.emit({ type: 'assistantAction', actionId: 'a1', action: 'submit', text: '  林俊杰  ' });
    await f.engine.settled(); await wait();
    const [result] = f.results();
    assert.equal(result.ok, true); assert.equal(result.actionId, 'a1'); assert.ok(result.taskId); assert.ok(Number.isSafeInteger(result.version));
    const task = await f.engine.snapshot();
    assert.equal(task.input.origin, 'desktop'); assert.equal(task.input.text, '林俊杰'); assert.equal(task.status, 'completed');
    assert.equal(f.states()[0], null, '连接建立时先告诉新原生进程“当前没有任务”');
    const states = f.states().filter(Boolean);
    assert.ok(states.length >= 1);
    const last = states.at(-1);
    assert.deepEqual([last.taskId, last.status, last.input, last.message], [task.id, 'completed', '林俊杰', '已为你找到林俊杰的歌曲']);
    assert.equal(Object.keys(last).sort().join(), 'at,input,message,scopeLabel,status,taskId,version');
    assert.ok(states.every(state => state.taskId === task.id), '没有串到别的任务');
    // 重复事件（回执丢失后重发）不会再提交一次
    f.host.emit({ type: 'assistantAction', actionId: 'a1', action: 'submit', text: '  林俊杰  ' });
    await wait();
    assert.equal(f.results().length, 2); assert.equal(f.results()[1].ok, true);
    assert.equal((await f.engine.snapshot()).id, task.id);
  } finally { f.close(); }
});

test('联调：执行中的任务按面板所见的 taskId/version 停止；停止后状态为 cancelled 并回到原生；已变化的版本被拒绝', async () => {
  let release;
  const f = await fixture({ execute: () => new Promise(resolve => { release = () => resolve({ status: 'completed', message: '不该出现' }); }) });
  try {
    f.host.emit({ type: 'assistantAction', actionId: 's1', action: 'submit', text: '搜索歌手' });
    await wait(30);
    const running = f.states().at(-1);
    assert.equal(running.status, 'running');
    f.host.emit({ type: 'assistantAction', actionId: 'c0', action: 'cancel', taskId: running.taskId, version: running.version + 5 });
    await wait();
    assert.equal(f.results().find(m => m.actionId === 'c0').ok, false);
    assert.equal((await f.engine.snapshot()).status, 'running');
    f.host.emit({ type: 'assistantAction', actionId: 'c1', action: 'cancel', taskId: running.taskId, version: running.version });
    await wait(30);
    assert.equal(f.results().find(m => m.actionId === 'c1').ok, true);
    assert.equal((await f.engine.snapshot()).status, 'cancelled');
    release(); await f.engine.settled(); await wait();
    assert.equal((await f.engine.snapshot()).status, 'cancelled', '晚到的执行结果不能复活已停止的任务');
    assert.equal(f.states().at(-1).status, 'cancelled');
  } finally { f.close(); }
});

test('联调：任务正在执行时再次提交被引擎拒绝并如实回报，不会产生第二个任务', async () => {
  let release;
  const f = await fixture({ execute: () => new Promise(resolve => { release = () => resolve({ status: 'completed', message: '好了' }); }) });
  try {
    f.host.emit({ type: 'assistantAction', actionId: 'b1', action: 'submit', text: '搜索歌手' });
    await wait(30);
    const first = f.states().at(-1).taskId;
    f.host.emit({ type: 'assistantAction', actionId: 'b2', action: 'submit', text: '再来一个需求' });
    await wait();
    const second = f.results().find(m => m.actionId === 'b2');
    assert.equal(second.ok, false); assert.match(second.error, /正在执行|会话已变化/);
    assert.equal((await f.engine.snapshot()).id, first);
    release(); await f.engine.settled();
  } finally { f.close(); }
});

test('联调：打开工作台走传入的 openWorkspace；助手未开启时提交与打开都被拒绝且 Engine 不动', async () => {
  const f = await fixture();
  try {
    f.host.emit({ type: 'assistantAction', actionId: 'o1', action: 'open' });
    await wait();
    assert.equal(f.results().find(m => m.actionId === 'o1').ok, true); assert.equal(f.opened(), 1);
    f.jelly.enabled = false;
    f.host.emit({ type: 'assistantAction', actionId: 'o2', action: 'open' });
    f.host.emit({ type: 'assistantAction', actionId: 'o3', action: 'submit', text: '搜索歌手' });
    await wait();
    assert.equal(f.results().find(m => m.actionId === 'o2').ok, false);
    assert.equal(f.results().find(m => m.actionId === 'o3').ok, false);
    assert.equal(f.opened(), 1); assert.equal(await f.engine.snapshot(), null);
  } finally { f.close(); }
});

test('联调：重连后补发 Engine 当前任务；断线期间的变化不丢；日志不含输入与助手正文', async () => {
  const f = await fixture();
  try {
    f.host.emit({ type: 'assistantAction', actionId: 'r1', action: 'submit', text: '搜索我的私人歌单密码本' });
    await f.engine.settled(); await wait();
    const before = f.host.sent.length;
    f.host.port.remoteDisconnect();
    await f.desktop.status();            // 新连接
    await wait();
    const resent = f.host.sent.slice(before).filter(m => m.command === 'assistantState');
    assert.equal(resent.length, 1, '新连接上只补发一次');
    assert.equal(resent[0].state.status, 'completed');
    const text = JSON.stringify(f.logs);
    assert.doesNotMatch(text, /私人歌单密码本|林俊杰|已为你找到/);
  } finally { f.close(); }
});
