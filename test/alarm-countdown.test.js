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
