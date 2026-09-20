const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const AlarmDesktop = require('../js/alarm-desktop.js');
const nativeDesktop = require('./fixtures/native-desktop.js');
function fixture(onAction = async () => ({ ok: true })) {
  const native = nativeDesktop(2);
  return { bridge: new AlarmDesktop(native.runtime, onAction), sent: native.sent, get port() { return native.port; }, emit: native.emit };
}
const session = { id: 'ring-test', scheduledAt: Date.now(), occurrences: [{ label: '开会', snoozeMinutes: 10, snoozeLimit: 3, snoozeCount: 0 }] };
test('原生展示传递当前会话与可用操作，旧会话隐藏不影响新卡片', async () => {
  const f = fixture(); await f.bridge.show(session);
  assert.equal(f.sent[0].sessionId, session.id); assert.equal(f.sent[0].canSnooze, true);
  f.bridge.hide('old'); assert.equal(f.sent.length, 1);
  f.bridge.hide(session.id); assert.equal(f.sent[1].command, 'hide');
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});
test('原生动作按会话校验且重复 actionId 只处理一次，收到成功才确认', async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return { ok: true }; });
  await f.bridge.show(session);
  const action = { type: 'action', action: 'snooze', actionId: 'a', sessionId: session.id, minutes: 10 };
  f.emit({ ...action, sessionId: 'stale' });
  await f.bridge.handleAction(f.port, action); await f.bridge.handleAction(f.port, action);
  assert.equal(calls, 1); assert.equal(f.sent.at(-1).command, 'actionResult'); assert.equal(f.sent.at(-1).ok, true);
  f.port.disconnect();
});
test('操作失败不当成成功，原生端获得可重试的错误', async () => {
  const f = fixture(async () => ({ ok: false, error: '会话已过期' })); await f.bridge.show(session);
  await f.bridge.handleAction(f.port, { type: 'action', action: 'dismiss', actionId: 'b', sessionId: session.id });
  assert.equal(f.sent.at(-1).ok, false); assert.match(f.sent.at(-1).error, /过期/);
  f.port.disconnect();
});
test('未安装组件会拒绝展示，供原有通知和重要窗口降级', async () => {
  const bridge = new AlarmDesktop({ connectNative() { throw new Error('not installed'); } }, async () => {});
  await assert.rejects(bridge.show(session), /not installed/);
  assert.equal(bridge.pending.size, 0); assert.equal(bridge.sessionId, null);
});
test('桌面按钮复用真实停止/稍后调度，旧会话操作不能停止新闹钟', async () => {
  const source = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  const snippet = source.slice(source.indexOf('    async function stopUserAlarmSession'), source.indexOf('    let userAlarmSaveQueue'));
  let runtime = { activeSession: { id: 'ring', occurrences: [{ alarmId: 'a', occurrenceId: 'a:1', snoozeCount: 0, snoozeLimit: 3, snoozeMinutes: 10 }] }, handled: {}, pendingSnoozes: [], recent: [] };
  const hidden = [];
  const context = { Date, Number, Math, Promise, AlarmCore: { occurrenceId: (id, at, suffix) => `${id}:${at}:${suffix}` },
    loadUserAlarmState: async () => ({ alarms: [], runtime }), saveUserAlarmState: async (_, value) => { runtime = value; },
    sendToOffscreen: async () => {}, setUserAlarmBadge: async () => {}, broadcastUserAlarmState: async () => {}, reconcileUserAlarmSchedule: async () => {},
    desktopAlarm: { hide(id) { hidden.push(id); } }, chrome: { notifications: { clear: async () => {} } }, USER_ALARM_NOTIFICATION_PREFIX: 'alarm:' };
  vm.runInNewContext(snippet, context);
  assert.equal((await context.stopUserAlarmSession('dismiss', null, 'old')).ok, false);
  assert.equal(runtime.activeSession.id, 'ring');
  assert.equal((await context.stopUserAlarmSession('snooze', 10, 'ring')).ok, true);
  assert.equal(runtime.activeSession, null); assert.equal(runtime.pendingSnoozes.length, 1);
  assert.equal(runtime.handled['a:1'].state, 'snoozed'); assert.deepEqual(hidden, ['ring']);
});

test('隐藏响铃保留仍在使用的倒计时连接，隐藏倒计时不影响响铃', async () => {
  const f = fixture();
  await f.bridge.setCountdown({ id: 'a:1', title: '休息', fireAt: Date.now() + 60000 });
  await f.bridge.show(session);
  f.bridge.hide(session.id);
  assert.equal(f.bridge.idleTimer, null);
  await f.bridge.show(session);
  await f.bridge.setCountdown(null);
  assert.equal(f.bridge.sessionId, session.id);
  assert.equal(f.bridge.idleTimer, null);
  f.port.disconnect();
});
test('浮窗关闭事件绑定连接和当前 occurrence，不接受过期关闭', async () => {
  const f = fixture(); let calls = 0;
  f.bridge.onCountdownHidden = () => { calls++; };
  await f.bridge.setCountdown({ id: 'new', fireAt: Date.now() + 60000 });
  f.emit({ type: 'countdownHidden', id: 'old' });
  assert.equal(calls, 0);
  f.emit({ type: 'countdownHidden', id: 'new' });
  assert.equal(calls, 1);
  assert.equal(f.bridge.countdownId, null);
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('主动空闲断连无需本端事件，下次确认、倒计时和响铃使用新连接', async () => {
  const host = nativeDesktop();
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  let notices = 0; bridge.onConfirmationDisconnect = () => { notices++; };
  try {
    await bridge.status();
    const old = host.port;
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal(old.closed, true); assert.equal(bridge.port, null);
    assert.equal(notices, 0);
    await bridge.setConfirmation({ id: 'review:1' });
    assert.equal(host.ports.length, 2); assert.notEqual(bridge.port, old);
    await bridge.setCountdown({ id: 'timer', fireAt: Date.now() + 60000 });
    await bridge.show(session);
    await bridge.setConfirmation(null);
    bridge.hide(session.id);
    assert.equal(bridge.countdownId, 'timer'); assert.equal(bridge.idleTimer, null);
    // A delayed event from the previous port cannot clear current display state.
    old.remoteDisconnect(); old.emit({ type: 'countdownHidden', id: 'timer' });
    assert.equal(bridge.port, host.port); assert.equal(bridge.countdownId, 'timer');
    assert.equal(notices, 0);
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});

test('失效端口发送失败会清理所有等待请求，后续重连但不重放请求', async () => {
  const host = nativeDesktop();
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  try {
    await bridge.setConfirmation({ id: 'review:1' });
    const old = host.port;
    // Keep one request in flight, then fail a second send before onDisconnect arrives.
    const post = old.postMessage; old.postMessage = () => {};
    const pending = assert.rejects(bridge.request('ping'), /disconnected port/);
    old.postMessage = post; old.disconnect();
    await assert.rejects(bridge.setCountdown({ id: 'timer' }), /disconnected port/);
    await pending;
    assert.equal(bridge.pending.size, 0); assert.equal(bridge.port, null);
    assert.equal(bridge.confirmationId, null); assert.equal(bridge.countdownId, null);
    await bridge.setConfirmation({ id: 'review:2' });
    assert.equal(host.ports.length, 2);
    assert.deepEqual(host.sent.filter(m => m.card).map(m => m.card.id), ['review:1', 'review:2']);
    const ping = bridge.request('ping');
    const requestId = host.sent.at(-1).requestId;
    old.emit({ type: 'response', requestId, ok: false, error: 'stale response' });
    assert.equal((await ping).ok, true);
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});

test('原生端断线会提示并允许重新连接，响铃业务拒绝不切断其他面板', async () => {
  const host = nativeDesktop();
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  let notices = 0; bridge.onConfirmationDisconnect = () => { notices++; };
  try {
    await bridge.setConfirmation({ id: 'review:1' });
    host.port.remoteDisconnect();
    assert.equal(bridge.port, null); assert.equal(notices, 1);
    await bridge.setConfirmation({ id: 'review:1' });
    const port = host.port, post = port.postMessage;
    port.postMessage = message => {
      if (message.command === 'show') queueMicrotask(() => port.emit({ type: 'response', requestId: message.requestId, ok: false, error: 'invalid session' }));
      else post(message);
    };
    await assert.rejects(bridge.show(session), /invalid session/);
    assert.equal(bridge.port, port); assert.equal(port.closed, false);
    assert.equal(bridge.confirmationId, 'review:1'); assert.equal(bridge.idleTimer, null);
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});
