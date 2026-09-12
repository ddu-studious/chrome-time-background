const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadCore() {
  const context = { self: {}, Date, Math, Set, Object, Number, String, Array };
  vm.runInNewContext(read('js/alarm-core.js'), context);
  return context.self.AlarmCore;
}

test('一次性闹钟只返回未来触发时间', () => {
  const core = loadCore();
  const now = new Date(2026, 8, 9, 9, 0, 0).getTime();
  const future = now + 10 * 60000;
  const alarm = core.normalizeAlarm({ id: 'once', repeat: 'once', fireAt: future, label: '喝水' }, now);
  assert.equal(core.getNextOccurrence(alarm, now), future);
  assert.equal(core.getNextOccurrence(alarm, future), null);
  assert.equal(core.getPreviousOccurrence(alarm, future), future);
});

test('工作日闹钟跨过周末并按本地时间计算', () => {
  const core = loadCore();
  const fridayEvening = new Date(2026, 8, 11, 18, 0, 0).getTime();
  const next = core.getNextOccurrence({ id: 'weekday', repeat: 'weekdays', time: '08:30', enabled: true }, fridayEvening);
  const date = new Date(next);
  assert.equal(date.getDay(), 1);
  assert.equal(date.getHours(), 8);
  assert.equal(date.getMinutes(), 30);
});

test('自定义星期去重排序且至少能计算下一次', () => {
  const core = loadCore();
  const now = new Date(2026, 8, 9, 10, 0, 0).getTime();
  const alarm = core.normalizeAlarm({ id: 'custom', repeat: 'custom', time: '21:15', days: [5, 3, 3], enabled: true }, now);
  assert.deepEqual(Array.from(alarm.days), [3, 5]);
  assert.ok(core.getNextOccurrence(alarm, now) > now);
});

test('dispatcher 合并同一秒闹钟并让更早的贪睡优先', () => {
  const core = loadCore();
  const now = Date.now();
  const fireAt = now + 20 * 60000;
  const alarms = [
    core.normalizeAlarm({ id: 'a', repeat: 'once', fireAt, enabled: true }),
    core.normalizeAlarm({ id: 'b', repeat: 'once', fireAt, enabled: true }),
  ];
  let dispatch = core.nextDispatch(alarms, { handled: {}, pendingSnoozes: [] }, now);
  assert.equal(dispatch.refs.length, 2);
  const snoozeAt = now + 5 * 60000;
  dispatch = core.nextDispatch(alarms, {
    handled: {},
    pendingSnoozes: [{ alarmId: 'a', occurrenceId: 'a:s1', scheduledAt: snoozeAt, snoozeCount: 1 }],
  }, now);
  assert.equal(dispatch.fireAt, snoozeAt);
  assert.equal(dispatch.refs[0].kind, 'snooze');
});

test('闹钟清理按命名空间执行，不再使用 clearAll', () => {
  const background = read('js/background.js');
  assert.doesNotMatch(background, /chrome\.alarms\.clearAll\s*\(/);
  assert.match(background, /AlarmCore\.DISPATCH_NAME/);
  assert.match(background, /managedSystemAlarmNames/);
  assert.match(background, /reconcileUserAlarmSchedule\(\{ recoverDue: true \}\)/);
  assert.match(background, /runtime\.dispatch\?\.fireAt <= now/);
  assert.match(background, /if \(userAlarmDispatchPromise\) return userAlarmDispatchPromise/);
  assert.match(background, /action: 'user_alarm_open_center'/);
});

test('Offscreen 使用独立闹钟音频状态并在响铃时压低音乐', () => {
  const offscreen = read('js/offscreen.js');
  for (const contract of ['ALARM_TONES', 'startAlarmTone', 'stopAlarmTone', "case 'alarmPlay'", "case 'alarmStop'"]) {
    assert.ok(offscreen.includes(contract), `缺少 Offscreen 闹钟契约: ${contract}`);
  }
  assert.match(offscreen, /alarmMusicDucked \? 0\.2 : 1/);
  assert.match(offscreen, /requestedSessionId !== alarmSessionId/);
});

test('闹钟界面、启动台与重要提醒窗口完整接入', () => {
  const html = read('index.html');
  const registrySource = read('js/app-registry.js');
  const center = read('js/alarm-center.js');
  assert.ok(html.includes('css/alarm-center.css?v=1'));
  assert.ok(html.includes('id="alarm-dock-btn"'));
  assert.ok(html.indexOf('js/alarm-core.js?v=1') < html.indexOf('js/alarm-center.js?v=4'));
  assert.match(registrySource, /id: 'alarm'.*defaultInDock: true/);
  for (const contract of ['data-alarm-quick="10"', 'user_alarm_snooze', 'user_alarm_dismiss', 'prefers-reduced-motion']) {
    const sources = `${center}\n${read('css/alarm-center.css')}`;
    assert.ok(sources.includes(contract), `缺少闹钟 UI 契约: ${contract}`);
  }
  assert.match(center, /element\.inert = true/);
  assert.match(center, /_trapFocus\(container, event\)/);
  assert.ok(read('alarm-ring.html').includes('alarm-popup-dismiss'));
});

test('闹钟弹层退场时先释放焦点和启用 inert 再写入 aria-hidden', () => {
  const center = read('js/alarm-center.js');
  const closeBlock = center.slice(center.indexOf('    close() {'), center.indexOf('    toggle() {'));
  const hideRingingBlock = center.slice(center.indexOf('    hideRinging() {'), center.indexOf('    _trapFocus('));
  const closeEditorBlock = center.slice(center.indexOf('    closeEditor() {'), center.indexOf('    _syncEditorVisibility()'));

  for (const [name, block, surface] of [
    ['闹钟中心', closeBlock, 'this.root'],
    ['响铃遮罩', hideRingingBlock, 'this.ringRoot'],
  ]) {
    const blurIndex = block.indexOf('activeElement.blur()');
    const inertIndex = block.indexOf(`${surface}.inert = true`);
    const ariaHiddenIndex = block.indexOf(`${surface}.setAttribute('aria-hidden', 'true')`);
    assert.ok(blurIndex >= 0, `${name}退场前必须释放内部焦点`);
    assert.ok(inertIndex > blurIndex, `${name}必须在释放焦点后启用 inert`);
    assert.ok(ariaHiddenIndex > inertIndex, `${name}必须最后再写 aria-hidden`);
  }
  assert.match(closeEditorBlock, /form\.contains\(document\.activeElement\)[\s\S]*?#alarm-new-button'[\s\S]*?form\.hidden = true/);
  assert.match(center, /this\.ringReturnFocus = document\.activeElement/);
  assert.match(hideRingingBlock, /this\.ringReturnFocus\?\.focus\?\.\(\{ preventScroll: true \}\)/);
});
