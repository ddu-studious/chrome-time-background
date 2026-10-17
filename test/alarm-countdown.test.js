const test = require('node:test');
const assert = require('node:assert/strict');
const Countdown = require('../js/alarm-countdown.js');
const Core = require('../js/alarm-core.js');
const now = Date.now();
const alarm = (id, offset = 600000) => Core.normalizeAlarm({ id, label: id, repeat: 'once', fireAt: now + offset }, now);

test('浮窗跟随最近提醒、改时、关闭和删除，不改变原始闹钟', () => {
  const alarms = [alarm('稍后', 1200000), alarm('最近')];
  const snapshot = JSON.stringify(alarms);
  assert.equal(Countdown.nextTimer(Core, alarms, {}, now).title, '最近');
  assert.equal(JSON.stringify(alarms), snapshot);
  alarms[1].fireAt = now + 1800000;
  assert.equal(Countdown.nextTimer(Core, alarms, {}, now).title, '稍后');
  alarms[0].enabled = false;
  assert.equal(Countdown.nextTimer(Core, alarms, {}, now).title, '最近');
  assert.equal(Countdown.nextTimer(Core, [alarms[0]], {}, now), null);
});

test('同秒提醒合并，响铃优先，贪睡显示真实下次时间', () => {
  const alarms = [alarm('a'), alarm('b')];
  assert.equal(Countdown.nextTimer(Core, alarms, {}, now).count, 2);
  assert.equal(Countdown.nextTimer(Core, alarms, { activeSession: { id: 'ring' } }, now), null);
  alarms.forEach(a => { a.enabled = false; });
  const snooze = { alarmId: 'a', occurrenceId: 'a:s1', scheduledAt: now + 300000 };
  const timer = Countdown.nextTimer(Core, alarms, { pendingSnoozes: [snooze] }, now);
  assert.equal(timer.fireAt, snooze.scheduledAt);
  assert.equal(timer.snoozed, true);
  assert.equal(Countdown.nextTimer(Core, alarms, { pendingSnoozes: [snooze], handled: { 'a:s1': {} } }, now), null);
});

test('工作日倒计时与调度器一致，到期未响铃不会变成下一天', () => {
  const monday = new Date(2026, 8, 14, 8, 0).getTime();
  const a = Core.normalizeAlarm({ id: 'daily', repeat: 'weekdays', time: '09:00' }, monday);
  const timer = Countdown.nextTimer(Core, [a], {}, monday);
  assert.equal(timer.fireAt, new Date(2026, 8, 14, 9, 0).getTime());
  assert.equal(Countdown.nextTimer(Core, [a], {}, timer.fireAt + 1000).fireAt, timer.fireAt);
});

function fixture(setCountdown = async () => {}) {
  const data = { [Core.STORAGE_KEY]: [alarm('a')] };
  const shown = [];
  let changed;
  const storage = {
    local: { get: async () => structuredClone(data), set: async update => Object.assign(data, update) },
    onChanged: { addListener: fn => { changed = fn; } }
  };
  const desktop = { setCountdown: async value => { shown.push(value); return setCountdown(value); } };
  return { controller: new Countdown(storage, desktop, Core), data, shown, desktop, changed: (...args) => changed(...args) };
}

test('浮窗关闭只持久化显示开关；重开与后台重建保留偏好', async () => {
  const f = fixture();
  await f.controller.sync();
  assert.equal(f.shown.at(-1).title, 'a');
  const snapshot = structuredClone(f.data[Core.STORAGE_KEY]);
  await f.desktop.onCountdownHidden();
  assert.equal(f.shown.at(-1), null);
  assert.deepEqual(f.data[Core.STORAGE_KEY], snapshot);
  await f.controller.sync();
  assert.equal(f.shown.at(-1), null);
  await f.controller.setEnabled(true);
  assert.equal(f.shown.at(-1).title, 'a');
});

test('可选原生组件未安装不会使闹钟保存失败，并提供可见失败状态', async () => {
  const f = fixture(async () => { throw new Error('未安装'); });
  const state = await f.controller.sync();
  assert.equal(state.available, false);
  assert.match(state.error, /未安装/);
  assert.equal(f.data[Core.STORAGE_KEY].length, 1);
});

test('串行同步读取最新状态，迟到的请求不能覆盖删除结果', async () => {
  let release;
  let first = true;
  const f = fixture(() => first ? (first = false, new Promise(resolve => { release = resolve; })) : undefined);
  const pending = f.controller.sync();
  await new Promise(resolve => setImmediate(resolve));
  f.data[Core.STORAGE_KEY] = [];
  const latest = f.controller.sync();
  release();
  await Promise.all([pending, latest]);
  assert.equal(f.shown[0].title, 'a');
  assert.equal(f.shown.at(-1), null);
});

test('存储变化涵盖所有创建入口和重命名，其他存储不会唤起浮窗', async () => {
  const f = fixture();
  f.changed({ unrelated: {} }, 'local');
  assert.equal(f.controller.debounce, null);
  f.data[Core.STORAGE_KEY][0].label = '已改名';
  f.changed({ [Core.STORAGE_KEY]: {} }, 'local');
  await new Promise(resolve => setTimeout(resolve, 130));
  await f.controller.queue;
  assert.equal(f.shown.at(-1).title, '已改名');
});

// ---- 接下来列表、延后/跳过本次（协议 v6：胶囊与进度环已取消，倒计时一律交给桌面水母） ----
const minute = 60000;
function once(id, offset, extra = {}) {
  return Core.normalizeAlarm({ id, label: id, repeat: 'once', fireAt: now + offset, updatedAt: now - 2 * minute, ...extra }, now);
}
function head(alarms, runtime = {}) { return Countdown.nextTimer(Core, alarms, runtime, now); }

test('倒计时附带版本和最多 5 条“接下来”，并只在单条时允许操作；不再带进度环起点', () => {
  const alarms = [once('a', 10 * minute), once('b', 20 * minute), once('c', 30 * minute), once('d', 40 * minute), once('e', 50 * minute), once('f', 60 * minute)];
  const timer = head(alarms);
  assert.equal(timer.alarmId, 'a');
  assert.equal(timer.revision, alarms[0].revision);
  assert.equal('startAt' in timer, false, '胶囊的进度环已取消，起点不再下发');
  assert.equal(timer.canAct, true);
  assert.deepEqual(timer.items.map(item => item.alarmId), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(timer.items[0].id, timer.id);
  const same = head([once('x', 5 * minute), once('y', 5 * minute)]);
  assert.equal(same.count, 2); assert.equal(same.canAct, false);
});

function act(alarms, runtime, request, at = now) {
  const timer = Countdown.nextTimer(Core, alarms, runtime, at);
  return Countdown.applyAction(Core, alarms, runtime, { id: timer.id, alarmId: timer.alarmId, revision: timer.revision, ...request }, at);
}

test('延后：一次性闹钟改 fireAt/date/time 与版本，重复闹钟只挪这一次，贪睡项原地后移', () => {
  const one = once('o', 20 * minute);
  const runtimeOne = { handled: {}, pendingSnoozes: [], recent: [] };
  const result = act([one], runtimeOne, { action: 'delay', minutes: 5 });
  assert.equal(result.ok, true); assert.match(result.text, /已延后 5 分钟/);
  assert.equal(one.fireAt, now + 25 * minute); assert.equal(one.revision, 2); assert.equal(one.updatedAt, now);
  assert.equal(one.time, `${String(new Date(one.fireAt).getHours()).padStart(2, '0')}:${String(new Date(one.fireAt).getMinutes()).padStart(2, '0')}`);
  assert.equal(head([one], runtimeOne).fireAt, now + 25 * minute);

  const monday = new Date(2026, 8, 14, 8, 0).getTime();
  const daily = Core.normalizeAlarm({ id: 'r', label: 'r', repeat: 'daily', time: '09:00', updatedAt: monday - 86400000 }, monday);
  const runtimeRepeat = { handled: {}, pendingSnoozes: [], recent: [] };
  const timer = Countdown.nextTimer(Core, [daily], runtimeRepeat, monday);
  Countdown.applyAction(Core, [daily], runtimeRepeat, { action: 'delay', minutes: 10, id: timer.id, alarmId: 'r', revision: timer.revision }, monday);
  assert.equal(daily.revision, timer.revision);
  const delayed = Countdown.nextTimer(Core, [daily], runtimeRepeat, monday);
  assert.equal(delayed.fireAt, new Date(2026, 8, 14, 9, 10).getTime());
  assert.equal(delayed.delayed, true); assert.equal(delayed.snoozed, true);
  assert.equal(Core.nextDispatch([daily], { ...runtimeRepeat, handled: { ...runtimeRepeat.handled, [delayed.id]: {} } }, monday).fireAt, new Date(2026, 8, 15, 9, 0).getTime());

  const snoozed = once('z', 50 * minute); snoozed.enabled = false;
  const runtimeSnooze = { handled: {}, recent: [], pendingSnoozes: [{ kind: 'snooze', alarmId: 'z', scheduledAt: now + 5 * minute, occurrenceId: Core.occurrenceId('z', now + 5 * minute, 's1'), snoozeCount: 1 }] };
  act([snoozed], runtimeSnooze, { action: 'delay', minutes: 5 });
  assert.equal(runtimeSnooze.pendingSnoozes.length, 1);
  assert.equal(runtimeSnooze.pendingSnoozes[0].scheduledAt, now + 10 * minute);
  assert.equal(runtimeSnooze.pendingSnoozes[0].snoozeCount, 1);
  assert.match(runtimeSnooze.pendingSnoozes[0].occurrenceId, /:s1$/);
});

test('延后分钟数被限制在 1–60，缺省 5 分钟', () => {
  for (const [input, expected] of [[undefined, 5], [0, 1], [-4, 1], [999, 60], [7.4, 7], ['abc', 5]]) {
    const alarm = once('m', 20 * minute);
    const result = act([alarm], { handled: {}, pendingSnoozes: [], recent: [] }, { action: 'delay', minutes: input });
    assert.equal(result.minutes, expected, String(input));
    assert.equal(alarm.fireAt, now + (20 + expected) * minute);
  }
});

test('跳过本次：一次性闹钟关闭，重复闹钟只跳这一次，贪睡项被取消；原闹钟其余字段不变', () => {
  const one = once('o', 20 * minute);
  const runtimeOne = { handled: {}, pendingSnoozes: [], recent: [] };
  const result = act([one], runtimeOne, { action: 'skip' });
  assert.match(result.text, /已关闭/);
  assert.equal(one.enabled, false); assert.equal(one.label, 'o'); assert.equal(one.fireAt, now + 20 * minute);
  assert.equal(runtimeOne.recent.at(-1).state, 'skipped');
  assert.equal(head([one], runtimeOne), null);

  const monday = new Date(2026, 8, 14, 8, 0).getTime();
  const daily = Core.normalizeAlarm({ id: 'r', repeat: 'daily', time: '09:00', updatedAt: monday - 86400000 }, monday);
  const runtimeRepeat = { handled: {}, pendingSnoozes: [], recent: [] };
  const timer = Countdown.nextTimer(Core, [daily], runtimeRepeat, monday);
  Countdown.applyAction(Core, [daily], runtimeRepeat, { action: 'skip', id: timer.id, alarmId: 'r', revision: timer.revision }, monday);
  assert.equal(daily.enabled, true);
  assert.equal(Core.nextDispatch([daily], runtimeRepeat, monday).fireAt, new Date(2026, 8, 15, 9, 0).getTime(), '被跳过的这一次不再出现，调度器立刻顺延到明天，不会断档');

  const snoozed = once('z', 50 * minute); snoozed.enabled = false;
  const runtimeSnooze = { handled: {}, recent: [], pendingSnoozes: [{ kind: 'snooze', alarmId: 'z', scheduledAt: now + 5 * minute, occurrenceId: 'z:1:s1', snoozeCount: 1 }] };
  assert.match(act([snoozed], runtimeSnooze, { action: 'skip' }).text, /取消这次稍后/);
  assert.deepEqual(runtimeSnooze.pendingSnoozes, []);
});

test('操作校验：occurrence/闹钟/版本不一致、多条同秒、响铃中、临近到点、未知动作都被拒绝且不改数据', () => {
  const fresh = () => ({ alarms: [once('a', 20 * minute)], runtime: { handled: {}, pendingSnoozes: [], recent: [] } });
  const reject = (mutate, request, pattern, at = now) => {
    const { alarms, runtime } = fresh();
    mutate?.(alarms, runtime);
    const before = JSON.stringify({ alarms, runtime });
    const timer = Countdown.nextTimer(Core, alarms, runtime, at);
    assert.throws(() => Countdown.applyAction(Core, alarms, runtime, { id: timer?.id, alarmId: timer?.alarmId, revision: timer?.revision, action: 'delay', ...request }, at), pattern);
    assert.equal(JSON.stringify({ alarms, runtime }), before);
  };
  reject(null, { id: 'other' }, /已变化/);
  reject(null, { alarmId: 'other' }, /已变化/);
  reject(null, { revision: 99 }, /已被修改/);
  reject(null, { action: 'format' }, /不支持/);
  reject((alarms) => alarms.push(once('b', 20 * minute)), {}, /多条/);
  reject(null, {}, /马上就要响/, now + 20 * minute - 2000);
  const { alarms, runtime } = fresh();
  runtime.activeSession = { id: 'ring' };
  assert.throws(() => Countdown.applyAction(Core, alarms, runtime, { action: 'skip', id: 'a', alarmId: 'a' }, now), /正在响铃/);
});

test('倒计时动作经串行入口：id 不匹配的旧请求不会进入后台修改，open 只打开闹钟中心', async () => {
  const f = fixture();
  await f.controller.sync();
  const timer = f.shown.at(-1);
  const calls = [];
  f.controller.runAction = async message => { calls.push(message.action); return { ok: true, text: 'done' }; };
  assert.equal((await f.controller.handleAction({ action: 'delay', id: 'stale', alarmId: timer.alarmId })).ok, false);
  assert.equal((await f.controller.handleAction({ action: 'delay', id: timer.id, alarmId: 'stale' })).ok, false);
  assert.equal((await f.controller.handleAction({ action: 'delay', id: timer.id, alarmId: timer.alarmId })).ok, true);
  assert.deepEqual(calls, ['delay']);
  assert.equal((await f.controller.handleAction({ action: 'open', id: timer.id, alarmId: timer.alarmId })).ok, false);
  let opened = 0; f.controller.openCenter = async () => { opened++; };
  assert.equal((await f.controller.handleAction({ action: 'open', id: timer.id, alarmId: timer.alarmId })).ok, true);
  assert.equal(opened, 1); assert.deepEqual(calls, ['delay']);
});

test('胶囊已取消：倒计时负载没有 style / night / startAt，状态只剩“是否交给水母”，旧存储里的 style 与 night 被忽略且不被改写', async () => {
  const f = fixture();
  await f.controller.sync();
  const payload = f.shown.at(-1);
  for (const key of ['style', 'night', 'startAt']) assert.equal(key in payload, false, key);
  assert.deepEqual(Object.keys(f.controller.state).sort(), ['available', 'enabled', 'error', 'version']);
  for (const gone of ['setStyle', 'setNight']) assert.equal(gone in f.controller, false, gone);
  assert.equal(Countdown.normalizeStyle, undefined);
  assert.equal(Countdown.STYLES, undefined);
  assert.equal('onCountdownStyle' in f.desktop, false, '不再接收样式切换事件');
  // 旧版本留下的偏好
  f.data[Countdown.SETTINGS_KEY] = { enabled: true, style: 'companion', night: false };
  await f.controller.sync();
  for (const key of ['style', 'night']) assert.equal(key in f.shown.at(-1), false, key);
  // 开关只改 enabled；旧的 night 原样留着，供桌面水母设置迁移时读取
  await f.controller.setEnabled(false);
  assert.equal(f.shown.at(-1), null);
  assert.equal(f.data[Countdown.SETTINGS_KEY].enabled, false);
  assert.equal(f.data[Countdown.SETTINGS_KEY].night, false);
  await f.controller.setEnabled(true);
  assert.equal(f.shown.at(-1).title, 'a');
});

test('接下来列表每条闹钟只出现一次：重复闹钟不会占满，延后项与其闹钟合并', () => {
  const monday = new Date(2026, 8, 14, 8, 0).getTime();
  const daily = Core.normalizeAlarm({ id: 'd', label: 'daily', repeat: 'daily', time: '09:00', updatedAt: monday - 86400000 }, monday);
  const other = Core.normalizeAlarm({ id: 'o', label: 'once', repeat: 'once', fireAt: monday + 5 * 3600000, updatedAt: monday }, monday);
  const runtime = { handled: {}, pendingSnoozes: [], recent: [] };
  assert.deepEqual(Countdown.upcomingItems(Core, [daily, other], runtime, monday).map(i => i.alarmId), ['d', 'o']);
  const timer = Countdown.nextTimer(Core, [daily, other], runtime, monday);
  Countdown.applyAction(Core, [daily, other], runtime, { action: 'delay', minutes: 10, id: timer.id, alarmId: 'd', revision: timer.revision }, monday);
  const items = Countdown.upcomingItems(Core, [daily, other], runtime, monday);
  assert.deepEqual(items.map(i => i.alarmId), ['d', 'o']);
  assert.equal(items[0].fireAt, new Date(2026, 8, 14, 9, 10).getTime());
});
