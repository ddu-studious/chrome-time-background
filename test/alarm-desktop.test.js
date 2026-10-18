const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const AlarmDesktop = require('../js/alarm-desktop.js');
const nativeDesktop = require('./fixtures/native-desktop.js');
function fixture(onAction = async () => ({ ok: true }), version = 2) {
  const native = nativeDesktop(version);
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
test('show 附带响铃气泡用的可选字段：clock、labels（空白名字不收）、more；旧字段保持不变', async () => {
  const f = fixture();
  const at = new Date(2026, 9, 16, 9, 5).getTime();
  const occurrence = label => ({ label, snoozeMinutes: 7, snoozeLimit: 3, snoozeCount: 0 });
  await f.bridge.show({ id: 'ring-fields', scheduledAt: at, occurrences: [occurrence('开会'), occurrence('  '), occurrence('喝水')] });
  const sent = f.sent[0];
  assert.equal(sent.clock, '09:05');
  assert.deepEqual(sent.labels, ['开会', '喝水'], '空白名字不进 labels');
  assert.equal(sent.more, 0);
  assert.equal(sent.title, '开会；  ；喝水', '旧字段 title 沿用原拼接');
  assert.equal(typeof sent.timeText, 'string'); assert.equal(sent.canSnooze, true); assert.equal(sent.snoozeMinutes, 7);
  f.port.disconnect();
});

test('show 的 labels 最多 3 个、每个最多 40 字符，其余计入 more（上限 99）', async () => {
  const f = fixture();
  const many = Array.from({ length: 120 }, (_, i) => ({ label: i === 0 ? '长'.repeat(60) : `闹钟${i}`, snoozeMinutes: 10, snoozeLimit: 0, snoozeCount: 0 }));
  await f.bridge.show({ id: 'ring-many', scheduledAt: Date.now(), occurrences: many });
  const sent = f.sent[0];
  assert.equal(sent.labels.length, 3); assert.equal(sent.labels[0].length, 40); assert.deepEqual(sent.labels.slice(1), ['闹钟1', '闹钟2']);
  assert.equal(sent.more, 99); assert.equal(sent.canSnooze, false);
  await f.bridge.show({ id: 'ring-five', scheduledAt: Date.now(), occurrences: many.slice(0, 5) });
  assert.equal(f.sent[1].labels.length, 3); assert.equal(f.sent[1].more, 2);
  f.port.disconnect();
});

test('show 的 clock：午夜是 00:xx（不是 24:xx）；时间无效不带 clock；没有可用名字不带 labels 与 more', async () => {
  const f = fixture();
  await f.bridge.show({ id: 'ring-midnight', scheduledAt: new Date(2026, 9, 17, 0, 7).getTime(), occurrences: [{ label: '', snoozeMinutes: 10 }] });
  assert.equal(f.sent[0].clock, '00:07'); assert.equal('labels' in f.sent[0], false); assert.equal('more' in f.sent[0], false);
  await f.bridge.show({ id: 'ring-bad-time', scheduledAt: 'not-a-time', occurrences: [{ label: '开会', snoozeMinutes: 10 }] });
  assert.equal('clock' in f.sent[1], false); assert.deepEqual(f.sent[1].labels, ['开会']); assert.equal(f.sent[1].more, 0);
  assert.equal(AlarmDesktop.clockText(new Date(2026, 9, 16, 23, 59)), '23:59'); assert.equal(AlarmDesktop.clockText(NaN), '');
  f.port.disconnect();
});

test('clockText 只接受 H:mm / HH:mm：区域设置把结果变成 12 小时制文字时不当作时间；snoozeMinutes 夹在 1…60，缺省 10', async () => {
  const original = Date.prototype.toLocaleTimeString;
  try {
    Date.prototype.toLocaleTimeString = function () { return '上午09:30'; };
    assert.equal(AlarmDesktop.clockText(new Date(2026, 9, 16, 9, 30)), '', '非 HH:mm 的格式化结果不当作时间');
    Date.prototype.toLocaleTimeString = function () { return '9:30'; };
    assert.equal(AlarmDesktop.clockText(new Date(2026, 9, 16, 9, 30)), '9:30', '单位数小时也接受（原生端会规整成 09:30）');
  } finally { Date.prototype.toLocaleTimeString = original; }
  const f = fixture();
  const minutesSent = async (id, value) => {
    await f.bridge.show({ id, scheduledAt: Date.now(), occurrences: [{ label: '开会', snoozeMinutes: value, snoozeLimit: 3, snoozeCount: 0 }] });
    return f.sent.at(-1).snoozeMinutes;
  };
  assert.equal(await minutesSent('minutes-big', 99), 60); assert.equal(await minutesSent('minutes-zero', 0), 10);
  assert.equal(await minutesSent('minutes-negative', -5), 1); assert.equal(await minutesSent('minutes-text', 'abc'), 10);
  f.port.disconnect();
});

test('响铃会话结束后至少再保持连接 5 秒（水母要显示确认并游走），别处触发的空闲释放不能缩短；没有响铃会话的 hide 仍是 2 秒', async () => {
  const delays = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => { delays.push(ms); return realSetTimeout(fn, ms, ...rest); };
  const f = fixture(); const g = fixture();
  try {
    await f.bridge.show(session);
    delays.length = 0;
    f.bridge.hide(session.id);
    assert.equal(delays.length, 1, 'hide 只登记一个空闲计时器');
    assert.ok(delays[0] >= 4900 && delays[0] <= 5000, `响铃刚结束：至少保持 5 秒（实际 ${delays[0]}）`);
    delays.length = 0;
    f.bridge.releaseWhenIdle();      // 例如倒计时同步完成后的空闲释放
    assert.ok(delays[0] >= 4900, `别处触发的空闲释放不能把保持期缩短（实际 ${delays[0]}）`);
    f.bridge.holdUntil = Date.now() - 1;      // 保持期过后恢复原来的 2 秒
    delays.length = 0; f.bridge.releaseWhenIdle();
    assert.equal(delays[0], 2000);
    // 没有响铃会话的 hide（status() 的收尾）不产生保持期
    await g.bridge.status();
    assert.equal(g.bridge.holdUntil, 0); assert.equal(delays.at(-1), 2000, '没有响铃会话：仍是 2 秒');
  } finally {
    globalThis.setTimeout = realSetTimeout;
    clearTimeout(f.bridge.idleTimer); clearTimeout(g.bridge.idleTimer);
    f.port.disconnect(); g.port.disconnect();
  }
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

test('倒计时动作按连接与当前 occurrence 校验，actionId 幂等，成功才回 ok 与说明', async () => {
  const f = fixture(); let calls = 0;
  f.bridge.onCountdownAction = async message => { calls++; return { ok: true, text: `done:${message.action}` }; };
  await f.bridge.setCountdown({ id: 'a:1', title: '休息', fireAt: Date.now() + 600000 });
  const action = { type: 'countdownAction', id: 'a:1', alarmId: 'a', actionId: 'x1', action: 'delay', minutes: 5 };
  f.emit({ ...action, id: 'stale', actionId: 'x0' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 0); assert.equal(f.sent.at(-1).command, 'countdownActionResult'); assert.equal(f.sent.at(-1).ok, false);
  await f.bridge.handleCountdownAction(f.port, action);
  assert.equal(calls, 1); assert.deepEqual([f.sent.at(-1).ok, f.sent.at(-1).text, f.sent.at(-1).actionId], [true, 'done:delay', 'x1']);
  // 回执丢失后原生重发同一个 actionId：只重复回执，不再改闹钟，也不依赖已经变化的 occurrence。
  await f.bridge.setCountdown({ id: 'a:2', title: '休息', fireAt: Date.now() + 900000 });
  await f.bridge.handleCountdownAction(f.port, action);
  assert.equal(calls, 1); assert.equal(f.sent.at(-1).ok, true);
  await f.bridge.handleCountdownAction(f.port, { ...action, id: 'a:2', actionId: 'x2', action: 'format' });
  assert.equal(calls, 1); assert.equal(f.sent.at(-1).ok, false);
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('倒计时动作的幂等缓存有界（最多 100 条，先进先出）：最旧的被淘汰后重发会重新处理，仍在缓存里的不会', async () => {
  const f = fixture(undefined, 6); let calls = 0;
  f.bridge.onCountdownAction = async () => { calls++; return { ok: true, text: `run-${calls}` }; };
  await f.bridge.setCountdown({ id: 'a:1', title: '休息', fireAt: Date.now() + 600000 });
  const action = index => ({ type: 'countdownAction', id: 'a:1', alarmId: 'a', actionId: `c${index}`, action: 'delay', minutes: 5 });
  for (let index = 0; index <= 100; index++) { f.emit(action(index)); await tick(); }
  assert.equal(calls, 101); assert.equal(f.bridge.countdownHandled.size, 100, '缓存被限制在 100 条');
  f.emit(action(100)); await tick();
  assert.equal(calls, 101, '最新的仍在缓存里：重发只补回执'); assert.equal(f.sent.at(-1).text, 'run-101');
  f.emit(action(0)); await tick();
  assert.equal(calls, 102, '最旧的已被淘汰：重发会重新处理（缓存不能无限增长）');
  shutdown(f);
});

test('倒计时动作失败如实回报，旧端口与无倒计时时的动作被忽略', async () => {
  const f = fixture();
  f.bridge.onCountdownAction = async () => ({ ok: false, error: '提醒已被修改' });
  await f.bridge.setCountdown({ id: 'a:1', title: '休息', fireAt: Date.now() + 600000 });
  await f.bridge.handleCountdownAction(f.port, { id: 'a:1', alarmId: 'a', actionId: 'f', action: 'skip' });
  assert.equal(f.sent.at(-1).ok, false); assert.match(f.sent.at(-1).error, /已被修改/);
  const before = f.sent.length;
  await f.bridge.handleCountdownAction({}, { id: 'a:1', actionId: 'g', action: 'skip' });
  assert.equal(f.sent.length, before);
  await f.bridge.setCountdown(null);
  await f.bridge.handleCountdownAction(f.port, { id: 'a:1', alarmId: 'a', actionId: 'h', action: 'skip' });
  assert.equal(f.sent.at(-1).ok, false);
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('胶囊已取消：样式切换事件不再有任何处理（旧组件发来的也被忽略），也没有样式回调', async () => {
  const f = fixture();
  assert.equal('onCountdownStyle' in f.bridge, false);
  await f.bridge.setCountdown({ id: 'a:1', title: '休息', fireAt: Date.now() + 600000 });
  const before = f.sent.length;
  assert.doesNotThrow(() => f.emit({ type: 'countdownStyle', id: 'a:1', style: 'companion' }));
  assert.equal(f.sent.length, before);
  assert.equal(f.bridge.countdownId, 'a:1');
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

// ---------- 桌面水母（协议 v6）：常驻、状态下发、喝水提醒气泡 ----------

const tick = () => new Promise(resolve => setImmediate(resolve));
// 测试收尾：清掉空闲与气泡兜底计时器再断开，避免计时器拖住测试进程
const shutdown = f => { clearTimeout(f.bridge.idleTimer); clearTimeout(f.bridge.nudgeTimer); f.port.disconnect(); };
const nudgeOf = (id = 'jelly-nudge-water-1760000000000') => ({ id, kind: 'water', title: '水母口渴了', text: '喝口水吧', buttons: [{ id: 'done', title: '喝了' }, { id: 'snooze', title: '10 分钟后' }], ttl: 90 });

test('常驻：连接不因空闲断开；取消常驻后才开始 2 秒空闲计时；空闲计时回调同样尊重常驻', async () => {
  const f = fixture(undefined, 6);
  f.bridge.setResident(true);
  await f.bridge.setCountdown({ id: 'a:1', fireAt: Date.now() + 60000 });
  await f.bridge.setCountdown(null);
  assert.equal(f.bridge.resident, true);
  assert.equal(f.bridge.idleTimer, null);
  f.bridge.setResident(false);
  assert.notEqual(f.bridge.idleTimer, null);
  // 计时器已经排好，之后才变成常驻：回调里再检查一次，不会断开
  f.bridge.resident = true;
  await new Promise(resolve => setTimeout(resolve, 2150));
  assert.equal(f.port.closed, false);
  assert.equal(f.bridge.port, f.port);
  f.bridge.setResident(false);
  shutdown(f);
});

test('setResident 只接受布尔：非布尔按“不常驻”处理；已有空闲计时的连接被常驻取消计时', async () => {
  const f = fixture(undefined, 6);
  await f.bridge.status();
  assert.notEqual(f.bridge.idleTimer, null);
  f.bridge.setResident(true);
  assert.equal(f.bridge.idleTimer, null, '开启常驻立即取消待执行的断开');
  for (const junk of ['true', 1, {}, null, undefined]) { f.bridge.setResident(junk); assert.equal(f.bridge.resident, false, String(junk)); f.bridge.setResident(true); }
  shutdown(f);
});

test('setJelly：下发水母状态，要求组件 v6 以上；旧组件得到可行动的提示且连接仍可用于其他功能', async () => {
  const old = fixture(undefined, 5);
  await assert.rejects(old.bridge.setJelly({ resident: true, night: true, lines: [], linesUntil: 0 }), /更新桌面组件/);
  assert.equal(old.bridge.port, old.port, '版本不够只拒绝水母，不切断连接');
  shutdown(old);
  const f = fixture(undefined, 6);
  const jelly = { resident: true, night: false, lines: ['今天喝了 2 次水'], linesUntil: 1760000000000 };
  const result = await f.bridge.setJelly(jelly);
  assert.equal(result.version, 6);
  const message = f.sent.at(-1);
  assert.equal(message.command, 'jelly');
  assert.deepEqual(message.jelly, jelly);
  shutdown(f);
});

test('showNudge：发出 nudge 命令并返回回执；旧组件、拒绝与无响应都拒绝（Chrome 据此退回系统通知）且清理等待请求', async () => {
  const f = fixture(undefined, 6);
  const nudge = nudgeOf();
  const ok = await f.bridge.showNudge(nudge);
  assert.equal(ok.ok, true);
  assert.deepEqual(f.sent.find(m => m.command === 'nudge').nudge, nudge);
  assert.equal(f.bridge.nudgeId, nudge.id);
  // 无回执：按给定的上限拒绝
  const post = f.port.postMessage;
  f.port.postMessage = message => { if (message.command === 'nudge') f.sent.push(message); else post(message); };
  await assert.rejects(f.bridge.showNudge(nudgeOf('jelly-nudge-water-2'), { timeoutMs: 30 }), /未响应/);
  assert.equal(f.bridge.pending.size, 0);
  assert.equal(f.bridge.nudgeId, null, '失败后不再认为有气泡');
  // 组件明确拒绝（响铃中、校验失败）
  f.port.postMessage = message => {
    if (message.command === 'nudge') queueMicrotask(() => f.port.emit({ type: 'response', requestId: message.requestId, ok: false, error: '正在响铃' }));
    else post(message);
  };
  await assert.rejects(f.bridge.showNudge(nudgeOf('jelly-nudge-water-3')), /响铃/);
  f.port.postMessage = post;
  shutdown(f);
  const old = fixture(undefined, 5);
  await assert.rejects(old.bridge.showNudge(nudgeOf()), /更新桌面组件/);
  assert.equal(old.bridge.nudgeId, null);
  shutdown(old);
});

test('showNudge 的默认上限是 3 秒（Chrome 退回系统通知的窗口），其他请求仍是 5 秒——按真正登记的计时器核对', async () => {
  const f = fixture(undefined, 6);
  const delays = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...rest) => { delays.push(ms); return realSetTimeout(fn, ms, ...rest); };
  try {
    await f.bridge.showNudge(nudgeOf('jelly-nudge-water-1'));
    const nudgeWait = delays[0];
    delays.length = 0;
    await f.bridge.setJelly({ resident: true, night: true, lines: [], linesUntil: 0 });
    assert.equal(nudgeWait, 3000, '气泡确认的等待上限必须是 3 秒：再长，Chrome 退回系统通知就太晚');
    assert.equal(delays[0], 5000, '其他请求仍是 5 秒');
  } finally { globalThis.setTimeout = realSetTimeout; }
  shutdown(f);
});

test('气泡兜底过期默认比 ttl 多 8 秒，ttl 限制在 10–180 秒；缺省按 90 秒', async () => {
  const f = fixture(undefined, 6); const armed = [];
  f.bridge.armNudgeExpiry = (id, ms) => { armed.push(ms); };
  for (const [index, ttl] of [90, 5, 500, undefined].entries()) await f.bridge.showNudge({ ...nudgeOf(`jelly-nudge-water-${index}`), ttl });
  assert.deepEqual(armed, [98000, 18000, 188000, 98000]);
  shutdown(f);
});

test('clearNudge：向原生发 nudgeClear 撤掉迟到的气泡；没有连接时不会为了清除而去启动组件', async () => {
  const f = fixture(undefined, 6);
  const idle = new AlarmDesktop({ connectNative() { throw new Error('must not connect'); } }, async () => {});
  assert.doesNotThrow(() => idle.clearNudge('jelly-nudge-water-1'));
  await f.bridge.showNudge(nudgeOf('jelly-nudge-water-1'));
  f.bridge.clearNudge('jelly-nudge-water-1');
  assert.deepEqual([f.sent.at(-1).command, f.sent.at(-1).id], ['nudgeClear', 'jelly-nudge-water-1']);
  assert.equal(f.bridge.nudgeId, null);
  f.bridge.clearNudge('jelly-nudge-water-9');
  assert.equal(f.sent.at(-1).id, 'jelly-nudge-water-9', '别的 id 也转给原生（原生自己核对），但不动当前状态');
  shutdown(f);
});

test('nudgeAction：绑定当前连接与当前气泡，actionId 幂等，只有 Chrome 成功才回 ok 与说明；未知动作与失效 id 被拒', async () => {
  const f = fixture(undefined, 6); const calls = [];
  f.bridge.onNudgeAction = async message => { calls.push([message.id, message.action]); return { ok: true, text: `done:${message.action}` }; };
  const nudge = nudgeOf();
  await f.bridge.showNudge(nudge);
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'n1', action: 'done' });
  await tick();
  assert.deepEqual(calls, [[nudge.id, 'done']]);
  const last = () => f.sent.at(-1);
  assert.deepEqual([last().command, last().ok, last().text, last().actionId, last().id], ['nudgeActionResult', true, 'done:done', 'n1', nudge.id]);
  // 回执丢失后原生重发同一个 actionId：只补回执，不再计数
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'n1', action: 'done' });
  await tick();
  assert.equal(calls.length, 1); assert.equal(last().ok, true);
  // 其他动作、旧气泡、坏 actionId
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'n2', action: 'dismiss' });
  await tick();
  assert.equal(calls.length, 1); assert.equal(last().ok, false); assert.match(last().error, /失效/);
  f.emit({ type: 'nudgeAction', id: 'jelly-nudge-water-1', actionId: 'n3', action: 'done' });
  await tick();
  assert.equal(calls.length, 1); assert.equal(last().ok, false);
  const before = f.sent.length;
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: '', action: 'done' });
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'x'.repeat(101), action: 'done' });
  await f.bridge.handleNudgeAction({}, { id: nudge.id, actionId: 'n4', action: 'done' });
  await tick();
  assert.equal(f.sent.length, before, '空/超长 actionId 与旧端口的事件不回复');
  assert.equal(calls.length, 1);
  shutdown(f);
});

test('nudgeAction 的幂等缓存有界（最多 100 条，先进先出）：最旧的被淘汰后重发会重新处理，仍在缓存里的不会', async () => {
  const f = fixture(undefined, 6); let calls = 0;
  f.bridge.onNudgeAction = async () => { calls++; return { ok: true, text: `run-${calls}` }; };
  const nudge = nudgeOf();
  await f.bridge.showNudge(nudge);
  const action = index => ({ type: 'nudgeAction', id: nudge.id, actionId: `c${index}`, action: 'done' });
  for (let index = 0; index <= 100; index++) { f.emit(action(index)); await tick(); }
  assert.equal(calls, 101); assert.equal(f.bridge.nudgeHandled.size, 100, '缓存被限制在 100 条');
  f.emit(action(100)); await tick();
  assert.equal(calls, 101, '最新的仍在缓存里：重发只补回执'); assert.equal(f.sent.at(-1).text, 'run-101');
  f.emit(action(0)); await tick();
  assert.equal(calls, 102, '最旧的已被淘汰：重发会重新处理（缓存不能无限增长）');
  shutdown(f);
});

test('nudgeAction：Chrome 拒绝或抛错如实回报失败（可重试），并截断过长的错误文字；处理中的重复事件被忽略', async () => {
  const f = fixture(undefined, 6);
  f.bridge.onNudgeAction = async () => ({ ok: false, error: '计数写入失败' });
  const nudge = nudgeOf();
  await f.bridge.showNudge(nudge);
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'f1', action: 'done' });
  await tick();
  assert.deepEqual([f.sent.at(-1).ok, f.sent.at(-1).error], [false, '计数写入失败']);
  // 没有明确的 ok:true（空对象、undefined、ok 为真值但不是 true）一律按失败回报，不能让原生显示“记下啦”
  for (const [index, weak] of [{}, undefined, { text: '好' }, { ok: 1 }, { ok: 'true' }].entries()) {
    f.bridge.onNudgeAction = async () => weak;
    f.emit({ type: 'nudgeAction', id: nudge.id, actionId: `w${index}`, action: 'done' });
    await tick();
    assert.equal(f.sent.at(-1).ok, false, `weak#${index}`);
    assert.equal(f.sent.at(-1).actionId, `w${index}`);
  }
  f.bridge.onNudgeAction = async () => { throw new Error('E'.repeat(500)); };
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'f2', action: 'snooze' });
  await tick();
  assert.equal(f.sent.at(-1).ok, false); assert.ok(f.sent.at(-1).error.length <= 120);
  // 失败不进入幂等缓存：同一个 actionId 重发会再次尝试
  let attempts = 0;
  f.bridge.onNudgeAction = async () => { attempts++; return attempts === 1 ? { ok: false, error: '稍后' } : { ok: true, text: 'ok' }; };
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'f3', action: 'done' });
  await tick();
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'f3', action: 'done' });
  await tick();
  assert.equal(attempts, 2); assert.equal(f.sent.at(-1).ok, true);
  // 处理中的同一个事件只执行一次
  let release; let runs = 0;
  f.bridge.onNudgeAction = () => { runs++; return new Promise(resolve => { release = () => resolve({ ok: true, text: '好' }); }); };
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'slow', action: 'done' });
  f.emit({ type: 'nudgeAction', id: nudge.id, actionId: 'slow', action: 'done' });
  await tick();
  release(); await tick();
  assert.equal(runs, 1);
  shutdown(f);
});

test('nudgeHidden：当前气泡消失后释放连接（未常驻时 2 秒后断开）；旧气泡与旧端口的事件被忽略；有常驻则保持连接', async () => {
  const f = fixture(undefined, 6);
  await f.bridge.showNudge(nudgeOf('jelly-nudge-water-5'));
  assert.equal(f.bridge.idleTimer, null, '有气泡时不会空闲断开');
  f.emit({ type: 'nudgeHidden', id: 'jelly-nudge-water-4' });
  assert.equal(f.bridge.nudgeId, 'jelly-nudge-water-5');
  f.emit({ type: 'nudgeHidden', id: 'jelly-nudge-water-5' });
  assert.equal(f.bridge.nudgeId, null);
  assert.notEqual(f.bridge.idleTimer, null);
  clearTimeout(f.bridge.idleTimer); f.bridge.idleTimer = null;
  f.bridge.setResident(true);
  await f.bridge.showNudge(nudgeOf('jelly-nudge-water-6'));
  f.emit({ type: 'nudgeHidden', id: 'jelly-nudge-water-6' });
  assert.equal(f.bridge.idleTimer, null, '常驻时不排断开');
  f.bridge.setResident(false); shutdown(f);
});

test('气泡有兜底过期：原生没有回报 nudgeHidden 时 Chrome 也会在 ttl 之后放开连接', async () => {
  const f = fixture(undefined, 6);
  await f.bridge.showNudge(nudgeOf('jelly-nudge-water-7'), { expireMs: 30 });
  assert.equal(f.bridge.nudgeId, 'jelly-nudge-water-7');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(f.bridge.nudgeId, null);
  assert.notEqual(f.bridge.idleTimer, null);
  shutdown(f);
});

test('jellySetting：只接受当前连接发来的“收起”（resident:false），打开、非布尔、缺字段与旧端口一律忽略', async () => {
  const f = fixture(undefined, 6); const seen = [];
  f.bridge.onJellySetting = value => { seen.push(value); };
  await f.bridge.status();
  const old = f.port;
  f.emit({ type: 'jellySetting', resident: true });
  f.emit({ type: 'jellySetting', resident: 'false' });
  f.emit({ type: 'jellySetting', resident: 0 });
  f.emit({ type: 'jellySetting' });
  assert.deepEqual(seen, []);
  f.emit({ type: 'jellySetting', resident: false });
  assert.deepEqual(seen, [{ resident: false }]);
  old.remoteDisconnect();
  await f.bridge.status();
  old.emit({ type: 'jellySetting', resident: false });
  assert.equal(seen.length, 1, '旧端口迟到的事件不算');
  shutdown(f);
});

test('onPortLost：对端关闭才通知；本端主动断开不通知；收到 componentQuit 后的断开带 quit；旧端口迟到的断开不通知', async () => {
  const host = nativeDesktop(6);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  const lost = []; bridge.onPortLost = info => { lost.push(info); };
  try {
    await bridge.status();
    host.port.remoteDisconnect();
    assert.deepEqual(lost, [{ quit: false }]); assert.equal(bridge.port, null);
    await bridge.status();
    host.port.emit({ type: 'componentQuit' });
    host.port.remoteDisconnect();
    assert.deepEqual(lost, [{ quit: false }, { quit: true }]);
    await bridge.status();
    const stale = host.port;
    bridge.releasePort(bridge.port, null, { disconnect: true, notify: false });
    assert.equal(lost.length, 2, '本端主动断开不是“丢失”');
    await bridge.status();
    stale.remoteDisconnect();
    assert.equal(lost.length, 2, '旧端口迟到的断开不算');
    // quit 只属于它所在的那条连接，下一条新连接掉线不会带上它
    host.port.remoteDisconnect();
    assert.deepEqual(lost.at(-1), { quit: false });
    // 另一个端口的 componentQuit 不能给当前连接打标
    await bridge.status();
    stale.emit({ type: 'componentQuit' });
    host.port.remoteDisconnect();
    assert.deepEqual(lost.at(-1), { quit: false });
  } finally { clearTimeout(bridge.idleTimer); clearTimeout(bridge.nudgeTimer); host.port?.disconnect(); }
});

test('onPortLost 回调抛错不影响清理；连接丢失会清掉气泡与倒计时状态', async () => {
  const host = nativeDesktop(6);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  bridge.onPortLost = () => { throw new Error('boom'); };
  try {
    await bridge.showNudge(nudgeOf());
    await bridge.setCountdown({ id: 'a:1', fireAt: Date.now() + 60000 });
    assert.doesNotThrow(() => host.port.remoteDisconnect());
    assert.equal(bridge.port, null); assert.equal(bridge.nudgeId, null); assert.equal(bridge.countdownId, null);
  } finally { clearTimeout(bridge.idleTimer); clearTimeout(bridge.nudgeTimer); host.port?.disconnect(); }
});

test('onConnected：每条新连接触发一次，且早于该连接上的第一条消息；已有连接上的请求不再触发；回调抛错不影响请求', async () => {
  const host = nativeDesktop(6);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  const seen = [];
  bridge.onConnected = () => { seen.push(host.sent.length); };
  try {
    await bridge.status(); await bridge.status();
    assert.deepEqual(seen, [0]);
    host.port.remoteDisconnect();
    await bridge.status();
    assert.equal(seen.length, 2);
    host.port.remoteDisconnect();
    bridge.onConnected = () => { throw new Error('boom'); };
    assert.equal((await bridge.status()).ok, true);
    // 回调里立即发请求（水母状态下发）不会递归地再建连接
    host.port.remoteDisconnect();
    let nested = 0;
    bridge.onConnected = () => { nested++; void bridge.request('jelly', { jelly: { resident: true } }); };
    await bridge.status();
    assert.equal(nested, 1); assert.equal(host.ports.length, 4);
    assert.deepEqual(host.sent.slice(-3).map(m => m.command).slice(0, 2), ['jelly', 'ping'], '回调里的消息排在触发它的请求之前');
  } finally { clearTimeout(bridge.idleTimer); clearTimeout(bridge.nudgeTimer); host.port?.disconnect(); }
});

// ---- 协议 v7：桌面 AI 助手（原生面板 ↔ Chrome 的同一个 Engine） ----
const assistantEvent = (extra = {}) => ({ type: 'assistantAction', actionId: 'a1', action: 'submit', text: '播放音乐', ...extra });

test('setAssistantState：只向已连接的 v7 组件下发状态；没有连接时不启动组件；旧组件被拒且不切断连接、也不发送未知命令', async () => {
  const f = fixture(undefined, 7);
  const state = { taskId: 'task-1', version: 2, status: 'running', message: '正在执行…', input: '播放音乐', updatedAt: 1 };
  assert.equal(await f.bridge.setAssistantState(state), null, '没有连接时不为了推送状态去启动组件');
  assert.equal(f.sent.length, 0);
  await f.bridge.status();
  const result = await f.bridge.setAssistantState(state);
  assert.equal(result.version, 7);
  const sent = f.sent.filter(m => m.command === 'assistantState');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].state, state);
  await f.bridge.setAssistantState(null);
  assert.equal(f.sent.filter(m => m.command === 'assistantState').at(-1).state, null);
  shutdown(f);
  const old = fixture(undefined, 6);
  await old.bridge.status();
  await assert.rejects(old.bridge.setAssistantState(state), /更新桌面组件/);
  assert.equal(old.sent.filter(m => m.command === 'assistantState').length, 0, '已知是旧组件就不发它不认识的命令');
  assert.equal(old.bridge.port, old.port, '版本不够只拒绝助手，不切断连接');
  shutdown(old);
});

test('setAssistantState：连接已建立但还不知道组件版本时，旧组件对未知命令的回执也要核对版本，不能当成“已显示”', async () => {
  // 旧组件（v6）对不认识的命令同样回 ok:true，只是 version 低于 7：只看 ok 会把一条没有被显示的状态当成成功
  const old = fixture(undefined, 6);
  old.bridge.connect();                                   // 只建连接，没有任何回执，bridge.version 仍是 0
  assert.equal(old.bridge.version, 0);
  await assert.rejects(old.bridge.setAssistantState({ taskId: 'task-1', version: 1, status: 'running', message: '', input: '', updatedAt: 1 }), /更新桌面组件/);
  assert.equal(old.bridge.version, 6, '这次回执顺便让 bridge 知道了真实版本');
  await assert.rejects(old.bridge.setAssistantState(null), /更新桌面组件/);
  assert.equal(old.sent.filter(m => m.command === 'assistantState').length, 1, '知道是旧组件之后不再发送');
  shutdown(old);
  const current = fixture(undefined, 7);
  current.bridge.connect();
  assert.equal((await current.bridge.setAssistantState(null)).version, 7, 'v7 组件的回执通过核对');
  shutdown(current);
});

test('setJelly 原样下发 assistant 设置；回执里的热键状态原样交给调用方', async () => {
  const f = fixture(undefined, 7);
  const jelly = { resident: true, night: true, lines: [], linesUntil: 0, assistant: { enabled: true, hotkey: 'ctrl+shift+b' } };
  const result = await f.bridge.setJelly(jelly);
  assert.equal(result.version, 7);
  assert.deepEqual(f.sent.find(m => m.command === 'jelly').jelly, jelly);
  shutdown(f);
  const host = nativeDesktop(7);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  const post = bridge.connect().postMessage;
  host.port.postMessage = message => {
    if (message.command === 'jelly') { host.sent.push(message); queueMicrotask(() => host.port.emit({ type: 'response', requestId: message.requestId, ok: true, version: 7, assistant: { status: 'taken', hotkey: 'ctrl+shift+b' } })); }
    else post(message);
  };
  const reply = await bridge.setJelly(jelly);
  assert.deepEqual(reply.assistant, { status: 'taken', hotkey: 'ctrl+shift+b' });
  clearTimeout(bridge.idleTimer); host.port.disconnect();
});

test('assistantAction：交给 Chrome 并回执（带 taskId/version）；actionId 幂等，回执丢失后重发只补回执', async () => {
  const f = fixture(undefined, 7); const calls = [];
  f.bridge.onAssistantAction = async message => { calls.push([message.action, message.text]); return { ok: true, taskId: 't1', version: 3 }; };
  await f.bridge.status();
  f.emit(assistantEvent()); await tick();
  const last = () => f.sent.at(-1);
  assert.deepEqual([last().command, last().ok, last().actionId, last().taskId, last().version], ['assistantResult', true, 'a1', 't1', 3]);
  assert.deepEqual(calls, [['submit', '播放音乐']]);
  f.emit(assistantEvent()); await tick();
  assert.equal(calls.length, 1, '重复事件不再提交'); assert.equal(last().ok, true); assert.equal(last().taskId, 't1');
  f.emit(assistantEvent({ actionId: 'a2', action: 'cancel', taskId: 't1', version: 3 })); await tick();
  f.emit(assistantEvent({ actionId: 'a3', action: 'open' })); await tick();
  assert.deepEqual(calls.map(c => c[0]), ['submit', 'cancel', 'open']);
  shutdown(f);
});

test('assistantAction：没有明确 ok:true、未知动作、没有处理器、抛错都如实回报失败（可重试），失败不进幂等缓存，错误文字有界', async () => {
  const f = fixture(undefined, 7);
  await f.bridge.status();
  const last = () => f.sent.at(-1);
  f.emit(assistantEvent({ actionId: 'n0' })); await tick();
  assert.equal(last().ok, false, '没有处理器');
  f.bridge.onAssistantAction = async () => ({ ok: false, error: '当前任务正在执行，请先停止或等待完成' });
  f.emit(assistantEvent({ actionId: 'f1' })); await tick();
  assert.deepEqual([last().ok, last().error], [false, '当前任务正在执行，请先停止或等待完成']);
  for (const [index, weak] of [{}, undefined, { taskId: 't' }, { ok: 1 }, { ok: 'true' }].entries()) {
    f.bridge.onAssistantAction = async () => weak;
    f.emit(assistantEvent({ actionId: `w${index}` })); await tick();
    assert.equal(last().ok, false, `weak#${index}`); assert.equal(last().actionId, `w${index}`);
  }
  f.bridge.onAssistantAction = async () => { throw new Error('E'.repeat(500)); };
  f.emit(assistantEvent({ actionId: 'f2' })); await tick();
  assert.equal(last().ok, false); assert.ok(last().error.length <= 200);
  f.bridge.onAssistantAction = async () => ({ ok: true });
  for (const action of ['edit', 'delete', '', undefined, 5]) { f.emit(assistantEvent({ actionId: `u-${String(action)}`, action })); await tick(); assert.equal(last().ok, false, String(action)); }
  let attempts = 0;
  f.bridge.onAssistantAction = async () => { attempts++; return attempts === 1 ? { ok: false, error: '稍后' } : { ok: true }; };
  f.emit(assistantEvent({ actionId: 'f3' })); await tick();
  f.emit(assistantEvent({ actionId: 'f3' })); await tick();
  assert.equal(attempts, 2, '失败的 actionId 重发会再次尝试'); assert.equal(last().ok, true);
  shutdown(f);
});

test('assistantAction：旧端口、空/超长 actionId 一律不回复；处理中的重复事件只执行一次；换端口后同一个 actionId 重新处理', async () => {
  const f = fixture(undefined, 7); let release, runs = 0;
  f.bridge.onAssistantAction = () => { runs++; return new Promise(resolve => { release = () => resolve({ ok: true, taskId: 'slow' }); }); };
  await f.bridge.status();
  const before = f.sent.length;
  f.emit(assistantEvent({ actionId: '' }));
  f.emit(assistantEvent({ actionId: 'x'.repeat(101) }));
  f.emit(assistantEvent({ actionId: 7 }));
  await f.bridge.handleAssistantAction({}, assistantEvent({ actionId: 'old-port' }));
  await tick();
  assert.equal(f.sent.length, before, '空/超长/非字符串 actionId 与旧端口的事件不回复');
  assert.equal(runs, 0);
  f.emit(assistantEvent({ actionId: 'slow' })); f.emit(assistantEvent({ actionId: 'slow' }));
  await tick(); release(); await tick();
  assert.equal(runs, 1);
  assert.equal(f.sent.filter(m => m.command === 'assistantResult' && m.actionId === 'slow').length, 1);
  // 对端重启后，新进程的 actionId 计数可能重复：旧连接的幂等缓存不能把新动作误当成已处理
  f.port.remoteDisconnect();
  f.bridge.onAssistantAction = async () => { runs++; return { ok: true, taskId: 'again' }; };
  await f.bridge.status();
  f.emit(assistantEvent({ actionId: 'slow' })); await tick();
  assert.equal(runs, 2); assert.equal(f.sent.at(-1).taskId, 'again');
  shutdown(f);
});

test('assistantAction：在已断开的旧连接上迟到完成的动作，结果不写进新连接的幂等缓存（新进程碰巧用了同一个 actionId 时照常处理）', async () => {
  const f = fixture(undefined, 7); let release, runs = 0;
  f.bridge.onAssistantAction = () => {
    runs++;
    return runs === 1 ? new Promise(resolve => { release = () => resolve({ ok: true, taskId: 'from-old-connection' }); }) : Promise.resolve({ ok: true, taskId: 'from-new-connection' });
  };
  await f.bridge.status();
  f.emit(assistantEvent({ actionId: 'reused-id' })); await tick();
  assert.equal(runs, 1, '旧连接上的动作还在处理中');
  f.port.remoteDisconnect();                              // 对端重启：旧连接作废，幂等缓存随之清空
  await f.bridge.status();                                // 新连接
  release(); await tick();                                // 旧连接上的动作此刻才完成：回执发不出去，也不能留下“已处理”的记录
  f.emit(assistantEvent({ actionId: 'reused-id' })); await tick();
  assert.equal(runs, 2, '新连接上的同一个 actionId 必须重新处理');
  assert.equal(f.sent.at(-1).taskId, 'from-new-connection');
  shutdown(f);
});

test('assistantAction：幂等缓存有界（最多 100 条，先进先出）：最旧的被淘汰后重发会重新处理，仍在缓存里的不会', async () => {
  const f = fixture(undefined, 7); let runs = 0;
  f.bridge.onAssistantAction = async () => { runs++; return { ok: true, taskId: `run-${runs}` }; };
  await f.bridge.status();
  for (let index = 0; index <= 100; index++) { f.emit(assistantEvent({ actionId: `c${index}` })); await tick(); }
  assert.equal(runs, 101);
  assert.equal(f.bridge.assistantHandled.size, 100, '缓存被限制在 100 条');
  f.emit(assistantEvent({ actionId: 'c100' })); await tick();
  assert.equal(runs, 101, '最新的仍在缓存里：重发只补回执');
  assert.equal(f.sent.at(-1).taskId, 'run-101');
  f.emit(assistantEvent({ actionId: 'c0' })); await tick();
  assert.equal(runs, 102, '最旧的已被淘汰：重发会重新处理（缓存不能无限增长）');
  shutdown(f);
});

test('onAssistantConnected：每条新连接一次，晚于 onConnected、早于该连接上的第一条消息；回调抛错不影响请求', async () => {
  const host = nativeDesktop(7);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true }));
  const seen = [];
  bridge.onConnected = () => { seen.push(['connected', host.sent.length]); };
  bridge.onAssistantConnected = () => { seen.push(['assistant', host.sent.length]); };
  try {
    await bridge.status(); await bridge.status();
    assert.deepEqual(seen, [['connected', 0], ['assistant', 0]]);
    host.port.remoteDisconnect();
    bridge.onAssistantConnected = () => { throw new Error('boom'); };
    assert.equal((await bridge.status()).ok, true);
    assert.equal(host.ports.length, 2);
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});

// ---------- 水母差事（协议 v8）：复用 nudge 气泡管线，按 id 前缀分流动作；presence 与气泡自行消失的信号 ----------

const errandOf = (id = 'jelly-errand-task-1760000000000') => ({ id, kind: 'task', title: '有任务过期了', text: '2 个任务已过期，处理一下吧', buttons: [{ id: 'open', title: '去处理' }, { id: 'later', title: '明天再说' }], ttl: 90 });

test('差事气泡复用 nudge 命令：发出原样负载并占用当前气泡 id', async () => {
  const f = fixture(undefined, 8);
  const errand = errandOf();
  await f.bridge.showNudge(errand);
  assert.deepEqual(f.sent.find(m => m.command === 'nudge').nudge, errand);
  assert.equal(f.bridge.nudgeId, errand.id);
  shutdown(f);
});

test('差事动作按 id 前缀分流到 onErrandAction：喝水动作（done/snooze）落不到差事气泡上，差事动作落不到喝水气泡上，幂等，不会误入喝水提醒的处理器', async () => {
  const f = fixture(undefined, 8); const errandCalls = [], nudgeCalls = [];
  f.bridge.onErrandAction = async message => { errandCalls.push([message.id, message.action]); return { ok: true, text: `errand:${message.action}` }; };
  f.bridge.onNudgeAction = async message => { nudgeCalls.push([message.id, message.action]); return { ok: true, text: 'nudge' }; };
  const errand = errandOf();
  await f.bridge.showNudge(errand);
  const last = () => f.sent.at(-1);
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'e1', action: 'open' });
  await tick();
  assert.deepEqual(errandCalls, [[errand.id, 'open']]);
  assert.deepEqual([last().command, last().ok, last().text, last().actionId, last().id], ['nudgeActionResult', true, 'errand:open', 'e1', errand.id]);
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'e1', action: 'open' });
  await tick();
  assert.equal(errandCalls.length, 1, '同一个 actionId 重发只补回执');
  // 喝水动作不能落在差事气泡上，差事动作也不能落在喝水气泡上
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'e2', action: 'done' });
  await tick();
  assert.equal(last().ok, false); assert.match(last().error, /失效/);
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'e3', action: 'snooze' });
  await tick();
  assert.equal(last().ok, false);
  const water = nudgeOf();
  await f.bridge.showNudge(water);
  f.emit({ type: 'nudgeAction', id: water.id, actionId: 'w1', action: 'open' });
  await tick();
  assert.equal(last().ok, false);
  f.emit({ type: 'nudgeAction', id: water.id, actionId: 'w2', action: 'done' });
  await tick();
  assert.equal(last().ok, true);
  assert.deepEqual(nudgeCalls, [[water.id, 'done']]);
  assert.equal(errandCalls.length, 1);
  shutdown(f);
});

test('差事动作：没有处理器、旧气泡 id、Chrome 拒绝都如实回报失败', async () => {
  const f = fixture(undefined, 8);
  const errand = errandOf();
  await f.bridge.showNudge(errand);
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'n1', action: 'open' });
  await tick();
  assert.equal(f.sent.at(-1).ok, false);
  f.bridge.onErrandAction = async () => ({ ok: false, error: '没能打开页面' });
  f.emit({ type: 'nudgeAction', id: errand.id, actionId: 'n2', action: 'open' });
  await tick();
  assert.deepEqual([f.sent.at(-1).ok, f.sent.at(-1).error], [false, '没能打开页面']);
  f.emit({ type: 'nudgeAction', id: 'jelly-errand-task-1', actionId: 'n3', action: 'open' });
  await tick();
  assert.equal(f.sent.at(-1).ok, false);
  shutdown(f);
});

test('nudgeHidden：当前气泡自行消失时通知 onNudgeHidden（用来记一次“被忽略”）；别的 id 不通知', async () => {
  const f = fixture(undefined, 8); const hidden = [];
  f.bridge.onNudgeHidden = id => { hidden.push(id); };
  const errand = errandOf();
  await f.bridge.showNudge(errand);
  f.emit({ type: 'nudgeHidden', id: 'jelly-errand-task-9' });
  await tick();
  assert.deepEqual(hidden, []);
  f.emit({ type: 'nudgeHidden', id: errand.id });
  await tick();
  assert.deepEqual(hidden, [errand.id]);
  assert.equal(f.bridge.nudgeId, null);
  f.bridge.onNudgeHidden = () => { throw new Error('回调失败'); };
  const second = errandOf('jelly-errand-task-2');
  await f.bridge.showNudge(second);
  f.emit({ type: 'nudgeHidden', id: second.id });
  await tick();
  assert.equal(f.bridge.nudgeId, null, '回调抛错不影响连接状态');
  shutdown(f);
});

test('presence：旧连接迟到的上报不转给 onPresence（只认当前连接）', async () => {
  const host = nativeDesktop(8);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true })); const states = [];
  bridge.onPresence = state => { states.push(state); };
  try {
    await bridge.status();
    const old = host.port;
    old.remoteDisconnect();
    await bridge.status();
    assert.notEqual(host.port, old, '已重连到新端口');
    old.emit({ type: 'presence', state: 'away' });
    assert.deepEqual(states, [], '旧连接的 presence 被忽略');
    host.emit({ type: 'presence', state: 'active' });
    assert.deepEqual(states, ['active'], '新连接的照常转发');
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});

test('presence：只认 active / away，来自当前连接才转给 onPresence；回调抛错不影响桥接', async () => {
  const f = fixture(undefined, 8); const states = [];
  f.bridge.onPresence = state => { states.push(state); };
  await f.bridge.showNudge(errandOf());
  f.emit({ type: 'presence', state: 'away' });
  f.emit({ type: 'presence', state: 'active' });
  f.emit({ type: 'presence', state: 'sleeping' });
  f.emit({ type: 'presence' });
  f.emit({ type: 'presence', state: 5 });
  await tick();
  assert.deepEqual(states, ['away', 'active']);
  f.bridge.onPresence = () => { throw new Error('回调失败'); };
  assert.doesNotThrow(() => f.emit({ type: 'presence', state: 'away' }));
  shutdown(f);
});

// ---------- 水母差事第二期（协议 v9）：歌曲气泡的按钮与右键菜单请求 ----------

const songErrandOf = (id = 'jelly-errand-song-1760000000000') => ({ id, kind: 'song', title: '来首歌？', text: '《晴天》 · 周杰伦', buttons: [{ id: 'play', title: '播放' }, { id: 'another', title: '换一首' }, { id: 'dismiss', title: '不听' }], ttl: 90 });

test('歌曲气泡：play / another / dismiss 经 onErrandAction（桥接层认差事动作的并集，各类别的限定由控制器负责）；喝水气泡仍只认 done / snooze', async () => {
  const f = fixture(undefined, 9); const calls = [];
  f.bridge.onErrandAction = async message => { calls.push([message.id, message.action]); return { ok: true, text: `ok:${message.action}` }; };
  f.bridge.onNudgeAction = async message => { calls.push(['nudge', message.action]); return { ok: true, text: 'nudge' }; };
  const song = songErrandOf();
  await f.bridge.showNudge(song);
  assert.deepEqual(f.sent.find(m => m.command === 'nudge').nudge, song, '歌曲气泡复用 nudge 命令，原样发出');
  const last = () => f.sent.at(-1);
  for (const [index, action] of ['play', 'another', 'dismiss'].entries()) {
    f.emit({ type: 'nudgeAction', id: song.id, actionId: `s${index}`, action });
    await tick();
    assert.deepEqual([last().command, last().ok, last().text, last().actionId], ['nudgeActionResult', true, `ok:${action}`, `s${index}`]);
  }
  assert.deepEqual(calls, [[song.id, 'play'], [song.id, 'another'], [song.id, 'dismiss']]);
  f.emit({ type: 'nudgeAction', id: song.id, actionId: 's0', action: 'play' });
  await tick();
  assert.equal(calls.length, 3, '同一个 actionId 重发只补回执，不再交给控制器（播放不会被重放）');
  assert.deepEqual([last().ok, last().text], [true, 'ok:play']);
  for (const [index, action] of ['done', 'snooze', 'fly', undefined].entries()) {
    f.emit({ type: 'nudgeAction', id: song.id, actionId: `x${index}`, action });
    await tick();
    assert.equal(last().ok, false, String(action));
  }
  const water = nudgeOf();
  await f.bridge.showNudge(water);
  for (const [index, action] of ['play', 'another'].entries()) {
    f.emit({ type: 'nudgeAction', id: water.id, actionId: `w${index}`, action });
    await tick();
    assert.equal(last().ok, false, `喝水气泡不认 ${action}`);
  }
  assert.equal(calls.length, 3);
  shutdown(f);
});

test('errandRequest（菜单请求）：转给 onErrandRequest 并按结果回 errandRequestResult——气泡已交给水母只回 ok，没有内容回 text，失败回 error；不缓存，每个 errandId 各算各的', async () => {
  const f = fixture(undefined, 9); const seen = [];
  const replies = [{ ok: true }, { ok: true, text: '今天的小乐子都说完啦' }, { ok: false, error: '水母正忙着响铃，等一下再叫它' }];
  f.bridge.onErrandRequest = async message => { seen.push([message.errandId, message.kind]); return replies[seen.length - 1]; };
  await f.bridge.status();
  const last = () => f.sent.at(-1);
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  await tick();
  assert.deepEqual(last(), { command: 'errandRequestResult', errandId: 'r1', ok: true });
  assert.equal('requestId' in last(), false, '结果命令不能带 requestId——那是“命令 → 回执”的关联键，原生会把回执标成这个编号');
  f.emit({ type: 'errandRequest', errandId: 'r2', kind: 'tidbit' });
  await tick();
  assert.deepEqual(last(), { command: 'errandRequestResult', errandId: 'r2', ok: true, text: '今天的小乐子都说完啦' });
  f.emit({ type: 'errandRequest', errandId: 'r3', kind: 'brief' });
  await tick();
  assert.deepEqual(last(), { command: 'errandRequestResult', errandId: 'r3', ok: false, error: '水母正忙着响铃，等一下再叫它' });
  assert.deepEqual(seen, [['r1', 'song'], ['r2', 'tidbit'], ['r3', 'brief']]);
  shutdown(f);
});

test('errandRequest：同一个 errandId 还在处理时的重发被忽略（不重复调用处理器），处理完成只回执一次', async () => {
  const f = fixture(undefined, 9); let release, calls = 0;
  f.bridge.onErrandRequest = () => { calls += 1; return new Promise(resolve => { release = () => resolve({ ok: true }); }); };
  await f.bridge.status();
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  await tick();
  assert.equal(calls, 1);
  const before = f.sent.length;
  release();
  await tick();
  assert.equal(f.sent.length, before + 1);
  assert.deepEqual([f.sent.at(-1).command, f.sent.at(-1).errandId], ['errandRequestResult', 'r1']);
  assert.equal(f.bridge.errandRequestProcessing.size, 0, '处理完成后在途编号被清掉（否则这个集合会无限增长）');
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  await tick();
  assert.equal(calls, 2, '结果不缓存：处理完成后同一个编号再来就是一次新请求');
  release();
  await tick();
  assert.equal(f.sent.length, before + 2);
  shutdown(f);
});

test('errandRequest：没有处理器、处理器抛错、返回异常形状都如实回 ok:false 与原因；kind 不是字符串时不调用处理器', async () => {
  const f = fixture(undefined, 9);
  await f.bridge.status();
  const last = () => f.sent.at(-1);
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  await tick();
  assert.deepEqual([last().command, last().ok, last().errandId], ['errandRequestResult', false, 'r1'], '没有处理器');
  assert.match(last().error, /不可用/);
  f.bridge.onErrandRequest = async () => { throw new Error('boom'); };
  f.emit({ type: 'errandRequest', errandId: 'r2', kind: 'song' });
  await tick();
  assert.deepEqual([last().ok, last().error], [false, 'boom']);
  f.bridge.onErrandRequest = () => { throw new Error('同步抛错'); };
  f.emit({ type: 'errandRequest', errandId: 'r3', kind: 'song' });
  await tick();
  assert.deepEqual([last().ok, last().error], [false, '同步抛错']);
  for (const [index, reply] of [undefined, null, 'ok', 7, { ok: 'yes' }, { ok: false }].entries()) {
    f.bridge.onErrandRequest = async () => reply;
    f.emit({ type: 'errandRequest', errandId: `bad${index}`, kind: 'song' });
    await tick();
    assert.equal(last().ok, false, JSON.stringify(reply));
    assert.equal(last().errandId, `bad${index}`);
    assert.ok(typeof last().error === 'string' && last().error.length > 0, '失败必须带原因');
  }
  let called = 0;
  f.bridge.onErrandRequest = async () => { called += 1; return { ok: true }; };
  for (const [index, kind] of [undefined, 5, null, { x: 1 }, 'x'.repeat(40)].entries()) {
    f.emit({ type: 'errandRequest', errandId: `k${index}`, kind });
    await tick();
    assert.deepEqual([last().ok, last().errandId, last().error], [false, `k${index}`, '不认识这个请求']);
  }
  assert.equal(called, 0);
  shutdown(f);
});

test('errandRequest：没有合法 errandId（空、超长、非字符串、缺失、只带旧字段 requestId）就无处回执，直接忽略；回执文字有长度上限', async () => {
  const f = fixture(undefined, 9); let calls = 0;
  f.bridge.onErrandRequest = async () => { calls += 1; return { ok: true, text: '长'.repeat(200) }; };
  await f.bridge.status();
  const count = f.sent.length;
  for (const bad of [{ errandId: '', kind: 'song' }, { errandId: 'x'.repeat(101), kind: 'song' }, { errandId: 5, kind: 'song' }, { kind: 'song' }, { requestId: 'legacy', kind: 'song' }]) {
    f.emit({ type: 'errandRequest', ...bad });
    await tick();
  }
  assert.equal(f.sent.length, count);
  assert.equal(calls, 0);
  f.emit({ type: 'errandRequest', errandId: 'long', kind: 'tidbit' });
  await tick();
  assert.equal([...f.sent.at(-1).text].length, 80);
  f.bridge.onErrandRequest = async () => ({ ok: false, error: '错'.repeat(300) });
  f.emit({ type: 'errandRequest', errandId: 'long-error', kind: 'tidbit' });
  await tick();
  assert.equal([...f.sent.at(-1).error].length, 120);
  shutdown(f);
});

test('errandRequest：旧连接迟到的请求不处理也不回执；处理期间连接断开，晚到的结果不抛错、不发到新连接', async () => {
  const host = nativeDesktop(9);
  const bridge = new AlarmDesktop(host.runtime, async () => ({ ok: true })); let release, calls = 0;
  bridge.onErrandRequest = () => { calls += 1; return new Promise(resolve => { release = () => resolve({ ok: true }); }); };
  try {
    await bridge.status();
    const old = host.port;
    old.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
    await tick();
    assert.equal(calls, 1);
    old.remoteDisconnect();
    await bridge.status();
    assert.notEqual(host.port, old, '已重连到新端口');
    old.emit({ type: 'errandRequest', errandId: 'r-stale', kind: 'song' });
    await tick();
    assert.equal(calls, 1, '旧连接迟到的请求被忽略');
    release();
    await tick();
    assert.equal(host.sent.some(message => message.command === 'errandRequestResult'), false, '旧连接上的结果没有发出，也没有串到新连接');
  } finally { clearTimeout(bridge.idleTimer); host.port?.disconnect(); }
});

test('errandRequest：处理器回调属于桥接的公开属性，默认为空，不影响既有消息处理', async () => {
  const f = fixture(undefined, 9);
  assert.equal(f.bridge.onErrandRequest, null);
  await f.bridge.status();
  f.emit({ type: 'presence', state: 'away' });
  f.emit({ type: 'errandRequest', errandId: 'r1', kind: 'song' });
  await tick();
  assert.equal(f.sent.at(-1).command, 'errandRequestResult');
  shutdown(f);
});
