const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const AlarmDesktop = require('../js/alarm-desktop.js');
function fixture(onAction = async () => ({ ok: true })) {
  let onMessage, onDisconnect;
  const sent = [];
  const port = { onMessage: { addListener(fn) { onMessage = fn; } }, onDisconnect: { addListener(fn) { onDisconnect = fn; } }, postMessage(message) {
    sent.push(message);
    if (message.requestId) queueMicrotask(() => onMessage({ type: 'response', requestId: message.requestId, ok: true }));
  }, disconnect() { onDisconnect?.(); } };
  const runtime = { connectNative(name) { assert.equal(name, 'com.timekeeper.desktop'); return port; } };
  return { bridge: new AlarmDesktop(runtime, onAction), sent, port, emit: message => onMessage(message) };
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
