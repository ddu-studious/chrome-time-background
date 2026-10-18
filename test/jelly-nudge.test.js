// 水母关怀（喝水 / 起身活动提醒）：设置规范化、时段过滤、闹钟与设置一致、通知与按钮、今天的计数。
// 用替身 storage / alarms / notifications 驱动真实模块代码；不使用真实通知。
const test = require('node:test');
const assert = require('node:assert/strict');
const Nudge = require('../js/jelly-nudge.js');

// 2026-10-15 是星期四；2026-10-17 星期六
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m, 0, 0);

function area(initial = {}) {
  const data = { ...initial };
  const writes = [];
  return {
    data, writes,
    get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
    set: async items => { writes.push(items); Object.assign(data, JSON.parse(JSON.stringify(items))); },
    remove: async key => { delete data[key]; },
  };
}

function env(options = {}) {
  const sync = area(options.sync);
  const local = area(options.local);
  const scheduled = new Map();
  const alarmLog = [];
  const shown = new Map();
  const notifyLog = [];
  const clock = { date: options.date || at(15, 10, 0) };
  const createdAt = new Map();
  const alarms = {
    create: async (name, info) => { alarmLog.push(['create', name, info]); if (options.failAlarm) throw new Error('alarm failed'); scheduled.set(name, { name, ...info }); createdAt.set(name, clock.date.getTime()); },
    clear: async name => { alarmLog.push(['clear', name]); return scheduled.delete(name); },
  };
  // 真实 chrome.alarms.get 会带 scheduledTime：由创建时刻 + delayInMinutes 推出（不写进 scheduled，保持原有断言不变）
  if (options.alarmGet !== false) alarms.get = async name => {
    const entry = scheduled.get(name);
    return entry && { ...entry, scheduledTime: createdAt.get(name) + (entry.delayInMinutes || 0) * 60000 };
  };
  const notifications = {
    create: async (id, info) => { notifyLog.push(['create', id, info]); shown.set(id, info); },
    clear: async id => { notifyLog.push(['clear', id]); return shown.delete(id); },
  };
  if (options.permission !== null) notifications.getPermissionLevel = async () => options.permission || 'granted';
  if (options.getAll !== false) notifications.getAll = async () => Object.fromEntries([...shown.keys()].map(id => [id, true]));
  const changes = { count: 0 };
  const sentAt = [];
  const nudge = Nudge.create({
    syncStorage: sync, localStorage: local, alarms, notifications, getURL: p => `chrome-extension://abc/${p}`, now: () => clock.date,
    presenter: options.presenter, presentTimeoutMs: options.presentTimeoutMs, onChange: () => { changes.count++; },
    onSent: options.onSent === undefined ? at => { sentAt.push(at); } : options.onSent,
  });
  return { nudge, sync, local, scheduled, alarmLog, shown, notifyLog, clock, changes, sentAt };
}

const on = (patch = {}) => ({ water: { on: true, everyMin: 60 }, stretch: { on: false, everyMin: 50 }, from: '09:00', to: '18:00', weekdaysOnly: true, ...patch });

// ---------- normalize ----------

test('normalize：默认全关、工作日、09:00–18:00；喝水 60 分钟、起身 50 分钟', () => {
  assert.deepEqual(Nudge.normalize(undefined), { weekdaysOnly: true, water: { on: false, everyMin: 60 }, stretch: { on: false, everyMin: 50 }, from: '09:00', to: '18:00' });
  assert.deepEqual(Nudge.normalize({}), Nudge.normalize(null));
  for (const bad of ['x', 5, [], true]) assert.deepEqual(Nudge.normalize(bad), Nudge.normalize(undefined));
});

test('normalize：只有明确的 true 才开启；只有明确的 false 才取消“只在工作日”', () => {
  for (const v of [1, 'true', 'yes', {}, [], null, undefined, 0]) assert.equal(Nudge.normalize({ water: { on: v } }).water.on, false, String(v));
  assert.equal(Nudge.normalize({ water: { on: true } }).water.on, true);
  for (const v of [0, null, 'no', undefined, '']) assert.equal(Nudge.normalize({ weekdaysOnly: v }).weekdaysOnly, true, String(v));
  assert.equal(Nudge.normalize({ weekdaysOnly: false }).weekdaysOnly, false);
});

test('normalize：周期只认各自的可选档位，其余回默认', () => {
  assert.equal(Nudge.normalize({ water: { everyMin: 45 } }).water.everyMin, 45);
  assert.equal(Nudge.normalize({ water: { everyMin: 50 } }).water.everyMin, 60, '喝水没有 50 分钟这一档');
  assert.equal(Nudge.normalize({ stretch: { everyMin: 50 } }).stretch.everyMin, 50);
  assert.equal(Nudge.normalize({ stretch: { everyMin: 120 } }).stretch.everyMin, 50, '起身没有 120 分钟这一档');
  for (const v of ['60', 0, -5, 1, 1e9, NaN, null, 45.5]) assert.equal(Nudge.normalize({ water: { everyMin: v } }).water.everyMin, 60, String(v));
  for (const id of Object.keys(Nudge.KINDS)) assert.ok(Nudge.KINDS[id].choices.includes(Nudge.DEFAULTS[id].everyMin), `${id} 的默认周期在可选档位里`);
});

test('normalize：时段必须“开始早于结束”且是合法 HH:MM，否则整体回默认；未知键丢弃', () => {
  assert.deepEqual([Nudge.normalize({ from: '10:30', to: '17:45' }).from, Nudge.normalize({ from: '10:30', to: '17:45' }).to], ['10:30', '17:45']);
  for (const [from, to] of [['18:00', '09:00'], ['09:00', '09:00'], ['9:00', '18:00'], ['24:00', '23:00'], ['09:60', '18:00'], ['09:00', ''], [null, null], ['09:00', 'x']]) {
    const config = Nudge.normalize({ from, to });
    assert.deepEqual([config.from, config.to], ['09:00', '18:00'], `${from}-${to}`);
  }
  const config = Nudge.normalize({ water: { on: true, extra: 1 }, evil: '<script>', __proto__: { x: 1 } });
  assert.deepEqual(Object.keys(config).sort(), ['from', 'stretch', 'to', 'water', 'weekdaysOnly']);
  assert.deepEqual(Object.keys(config.water).sort(), ['everyMin', 'on']);
});

// ---------- inWindow / 文案 ----------

test('inWindow：开始时刻含、结束时刻不含；周末按设置；非法日期为假', () => {
  const config = Nudge.normalize({ from: '09:00', to: '18:00' });
  assert.equal(Nudge.inWindow(config, at(15, 8, 59)), false);
  assert.equal(Nudge.inWindow(config, at(15, 9, 0)), true);
  assert.equal(Nudge.inWindow(config, at(15, 17, 59)), true);
  assert.equal(Nudge.inWindow(config, at(15, 18, 0)), false);
  assert.equal(Nudge.inWindow(config, at(17, 12)), false, '周六：只在工作日');
  assert.equal(Nudge.inWindow(config, at(18, 12)), false, '周日');
  assert.equal(Nudge.inWindow({ ...config, weekdaysOnly: false }, at(17, 12)), true);
  for (const bad of [new Date(NaN), null, undefined, 'x', 5]) assert.equal(Nudge.inWindow(config, bad), false);
});

test('messageFor：同一周期内稳定、换周期轮换；有计数才带“今天已…”；两类文案不同', () => {
  const t = at(15, 10, 0);
  const a = Nudge.messageFor('water', t, 60, 0);
  assert.equal(Nudge.messageFor('water', new Date(t.getTime() + 59 * 1000), 60, 0), a);
  const seen = new Set();
  for (let i = 0; i < 6; i++) seen.add(Nudge.messageFor('water', new Date(t.getTime() + i * 3600000), 60, 0));
  assert.equal(seen.size, Nudge.KINDS.water.lines.length, '三条文案轮换');
  assert.ok(!/今天已/.test(a));
  assert.match(Nudge.messageFor('water', t, 60, 3), /（今天已喝了 3 次）$/);
  assert.match(Nudge.messageFor('stretch', t, 50, 2), /（今天已动了 2 次）$/);
  assert.notEqual(Nudge.messageFor('water', t, 60, 0), Nudge.messageFor('stretch', t, 60, 0));
  assert.doesNotThrow(() => Nudge.messageFor('water', new Date(-5e12), 0, 0));
});

test('parseAlarm / parseNotification 严格匹配，不吃别人的闹钟与通知', () => {
  assert.deepEqual(Nudge.parseAlarm('jelly-nudge-water'), { kind: 'water', snooze: false });
  assert.deepEqual(Nudge.parseAlarm('jelly-nudge-snooze-stretch'), { kind: 'stretch', snooze: true });
  for (const bad of ['jelly-nudge-', 'jelly-nudge-tea', 'x-jelly-nudge-water', 'jelly-nudge-water-1', 'warm-tip', 'music-sleep-stop', '', null, undefined]) assert.equal(Nudge.parseAlarm(bad), null, String(bad));
  assert.equal(Nudge.parseNotification('jelly-nudge-water-1760000000000'), 'water');
  assert.equal(Nudge.parseNotification('jelly-nudge-stretch-1'), 'stretch');
  for (const bad of ['jelly-nudge-water', 'jelly-nudge-water-abc', 'jelly-nudge-tea-1', 'task-1', 'warm-tip-1', 'jelly-nudge-water-1x', '', null]) assert.equal(Nudge.parseNotification(bad), null, String(bad));
  assert.equal(Nudge.alarmName('water'), 'jelly-nudge-water');
  assert.equal(Nudge.alarmName('stretch', true), 'jelly-nudge-snooze-stretch');
});

// ---------- 设置与闹钟 ----------

test('get：没有设置时返回默认与今天的计数 0', async () => {
  const e = env();
  const result = await e.nudge.get();
  assert.equal(result.ok, true);
  assert.deepEqual(result.config, Nudge.normalize(undefined));
  assert.deepEqual(result.stats, { day: '2026-10-15', water: 0, stretch: 0 });
  assert.equal(e.alarmLog.length, 0, '读取不动闹钟');
  assert.equal(e.sync.writes.length, 0, '读取不写存储');
});

test('set：保存规范化后的设置到 sync；开着的类别建周期闹钟（延迟一个周期再响，不立刻弹）；关着的清掉', async () => {
  const e = env();
  const result = await e.nudge.set({ water: { on: true, everyMin: 45 }, stretch: { on: false, everyMin: 30 }, evil: 1 });
  assert.equal(result.ok, true);
  assert.deepEqual(e.sync.data[Nudge.CONFIG_KEY], result.config);
  assert.equal(e.sync.data[Nudge.CONFIG_KEY].evil, undefined);
  assert.deepEqual(e.scheduled.get('jelly-nudge-water'), { name: 'jelly-nudge-water', delayInMinutes: 45, periodInMinutes: 45 });
  assert.equal(e.scheduled.has('jelly-nudge-stretch'), false);
  assert.ok(e.alarmLog.some(c => c[0] === 'clear' && c[1] === 'jelly-nudge-stretch'));
  assert.ok(e.alarmLog.some(c => c[0] === 'clear' && c[1] === 'jelly-nudge-snooze-stretch'), '关着的类别连“稍后再提醒”一起清');
  const again = await e.nudge.get();
  assert.deepEqual(again.config, result.config);
});

test('set：关掉某一类会清除它的周期闹钟与稍后提醒，另一类不受影响', async () => {
  const e = env();
  await e.nudge.set(on({ stretch: { on: true, everyMin: 50 } }));
  assert.ok(e.scheduled.has('jelly-nudge-water') && e.scheduled.has('jelly-nudge-stretch'));
  e.scheduled.set('jelly-nudge-snooze-water', { name: 'jelly-nudge-snooze-water', delayInMinutes: 10 });
  await e.nudge.set(on({ water: { on: false, everyMin: 60 }, stretch: { on: true, everyMin: 50 } }));
  assert.equal(e.scheduled.has('jelly-nudge-water'), false);
  assert.equal(e.scheduled.has('jelly-nudge-snooze-water'), false);
  assert.ok(e.scheduled.has('jelly-nudge-stretch'));
});

test('restore：浏览器重启后闹钟没了就按设置补上；已有同周期的闹钟不重建（避免每次唤醒都把计时重置）；周期变了才重建', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  await e.nudge.restore();
  assert.equal(e.scheduled.get('jelly-nudge-water').periodInMinutes, 60);
  const creates = () => e.alarmLog.filter(c => c[0] === 'create').length;
  assert.equal(creates(), 1);
  await e.nudge.restore();
  await e.nudge.restore();
  assert.equal(creates(), 1, '同周期已存在：不重建');
  await e.nudge.set(on({ water: { on: true, everyMin: 90 } }));
  assert.equal(creates(), 2);
  assert.equal(e.scheduled.get('jelly-nudge-water').periodInMinutes, 90);
});

test('restore：没有 alarms.get 的环境退化为每次都建（不抛错）；全关时什么都不建', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, alarmGet: false });
  await e.nudge.restore();
  assert.equal(e.scheduled.has('jelly-nudge-water'), true);
  const off = env();
  await off.nudge.restore();
  assert.equal(off.alarmLog.filter(c => c[0] === 'create').length, 0);
});

test('set：闹钟创建失败时抛出，但设置已经保存（下次启动 restore 会再对一遍）', async () => {
  const e = env({ failAlarm: true });
  await assert.rejects(() => e.nudge.set(on()), /alarm failed/);
  assert.equal(e.sync.data[Nudge.CONFIG_KEY].water.on, true);
  const next = await e.nudge.get();
  assert.equal(next.config.water.on, true, '失败不会毒化后续操作');
});

// ---------- 触发 ----------

test('fire：不是本模块的闹钟什么都不做；该类关着时静默跳过', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  assert.equal(await e.nudge.fire('warm-tip'), undefined);
  assert.equal(await e.nudge.fire('music-sleep-stop'), undefined);
  assert.equal(await e.nudge.fire(undefined), undefined);
  assert.deepEqual(await e.nudge.fire('jelly-nudge-stretch'), { sent: false, reason: 'off' });
  assert.equal(e.notifyLog.length, 0);
});

test('fire：时段内弹一条通知（喝水），带两个按钮、扩展图标、轮换文案；通知 id 带时间戳', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30) });
  const result = await e.nudge.fire('jelly-nudge-water');
  assert.equal(result.sent, true);
  const [, id, info] = e.notifyLog.find(c => c[0] === 'create');
  assert.equal(id, `jelly-nudge-water-${at(15, 10, 30).getTime()}`);
  assert.equal(Nudge.parseNotification(id), 'water');
  assert.equal(info.type, 'basic');
  assert.equal(info.iconUrl, 'chrome-extension://abc/icons/icon128.png');
  assert.equal(info.title, Nudge.KINDS.water.title);
  assert.deepEqual(info.buttons.map(b => b.title), ['喝了', '10 分钟后再提醒']);
  assert.ok(Nudge.KINDS.water.lines.some(line => info.message.startsWith(line)));
});

test('fire：时段外、周末（只在工作日）、结束时刻整点都静默跳过；改成周末也提醒后就发', async () => {
  const check = async (date, config = on()) => {
    const e = env({ sync: { [Nudge.CONFIG_KEY]: config }, date });
    const result = await e.nudge.fire('jelly-nudge-water');
    return [result.sent, e.notifyLog.filter(c => c[0] === 'create').length];
  };
  assert.deepEqual(await check(at(15, 8, 59)), [false, 0]);
  assert.deepEqual(await check(at(15, 18, 0)), [false, 0]);
  assert.deepEqual(await check(at(17, 12)), [false, 0]);
  assert.deepEqual(await check(at(17, 12), on({ weekdaysOnly: false })), [true, 1]);
});

test('fire：没有通知权限时不弹；没有权限接口的环境照常弹', async () => {
  const denied = env({ sync: { [Nudge.CONFIG_KEY]: on() }, permission: 'denied' });
  assert.deepEqual(await denied.nudge.fire('jelly-nudge-water'), { sent: false, reason: 'permission' });
  assert.equal(denied.notifyLog.length, 0);
  const noApi = env({ sync: { [Nudge.CONFIG_KEY]: on() }, permission: null });
  assert.equal((await noApi.nudge.fire('jelly-nudge-water')).sent, true);
});

test('fire：同类的旧通知先清掉（不堆叠），另一类的通知不动', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on({ stretch: { on: true, everyMin: 50 } }) } });
  e.shown.set('jelly-nudge-water-1', {});
  e.shown.set('jelly-nudge-stretch-1', {});
  e.shown.set('task-9', {});
  await e.nudge.fire('jelly-nudge-water');
  assert.equal(e.shown.has('jelly-nudge-water-1'), false);
  assert.equal(e.shown.has('jelly-nudge-stretch-1'), true);
  assert.equal(e.shown.has('task-9'), true, '别的通知不碰');
  assert.equal([...e.shown.keys()].filter(id => id.startsWith('jelly-nudge-water-')).length, 1);
});

test('fire：稍后提醒的一次性闹钟同样按设置与时段处理', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 11) });
  assert.equal((await e.nudge.fire('jelly-nudge-snooze-water')).sent, true);
  const late = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 19) });
  assert.equal((await late.nudge.fire('jelly-nudge-snooze-water')).sent, false);
});

// ---------- 按钮与计数 ----------

async function shown(e, kind = 'water') {
  await e.nudge.fire(`jelly-nudge-${kind}`);
  return [...e.shown.keys()].find(id => id.startsWith(`jelly-nudge-${kind}-`));
}

test('按钮 0（喝了）：今天的计数 +1 并关掉通知；下一条通知文案带上计数', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10) });
  const id = await shown(e);
  assert.equal(await e.nudge.button(id, 0), true);
  assert.equal(e.shown.has(id), false);
  assert.deepEqual(e.local.data[Nudge.STATS_KEY], { day: '2026-10-15', water: 1, stretch: 0 });
  e.clock.date = at(15, 11);
  const next = await shown(e);
  assert.match(e.shown.get(next).message, /（今天已喝了 1 次）$/);
  await e.nudge.button(next, 0);
  assert.equal(e.local.data[Nudge.STATS_KEY].water, 2);
});

test('计数只保留今天：换了一天从 0 开始，旧数字不留历史、也不延续', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, local: { [Nudge.STATS_KEY]: { day: '2026-10-14', water: 7, stretch: 3 } }, date: at(15, 10) });
  assert.deepEqual((await e.nudge.get()).stats, { day: '2026-10-15', water: 0, stretch: 0 });
  const id = await shown(e);
  await e.nudge.button(id, 0);
  assert.deepEqual(e.local.data[Nudge.STATS_KEY], { day: '2026-10-15', water: 1, stretch: 0 });
  assert.deepEqual(Object.keys(e.local.data), [Nudge.STATS_KEY], '只有一个计数键，没有历史');
});

test('计数读取对损坏数据稳健：负数、字符串、超大、小数都按 0；计数封顶 999', async () => {
  for (const bad of [-3, '5', 1e9, 2.5, null, NaN, {}]) {
    const e = env({ local: { [Nudge.STATS_KEY]: { day: '2026-10-15', water: bad, stretch: bad } } });
    assert.deepEqual((await e.nudge.get()).stats, { day: '2026-10-15', water: 0, stretch: 0 }, String(bad));
  }
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, local: { [Nudge.STATS_KEY]: { day: '2026-10-15', water: 999, stretch: 0 } } });
  const id = await shown(e);
  await e.nudge.button(id, 0);
  assert.equal(e.local.data[Nudge.STATS_KEY].water, 999);
  for (const garbage of ['x', 5, [], null]) {
    const g = env({ local: { [Nudge.STATS_KEY]: garbage } });
    assert.equal((await g.nudge.get()).stats.water, 0);
  }
});

test('起身活动的“动了”只增加起身的计数，不动喝水的', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on({ stretch: { on: true, everyMin: 50 } }) } });
  const id = await shown(e, 'stretch');
  await e.nudge.button(id, 0);
  assert.deepEqual(e.local.data[Nudge.STATS_KEY], { day: '2026-10-15', water: 0, stretch: 1 });
});

test('按钮 1（10 分钟后再提醒）：建一次性闹钟（不带 period）、关掉通知、不计数；该类已被关掉就不再约', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = await shown(e);
  assert.equal(await e.nudge.button(id, 1), true);
  assert.deepEqual(e.scheduled.get('jelly-nudge-snooze-water'), { name: 'jelly-nudge-snooze-water', delayInMinutes: 10 });
  assert.equal(e.shown.has(id), false);
  assert.equal(e.local.data[Nudge.STATS_KEY], undefined, '稍后不计数');
  const off = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const offId = await shown(off);
  await off.nudge.set(on({ water: { on: false, everyMin: 60 } }));
  await off.nudge.button(offId, 1);
  assert.equal(off.scheduled.has('jelly-nudge-snooze-water'), false);
});

test('按钮：不是本模块的通知返回 false 且无副作用；未知按钮序号只关通知、不计数不约', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  assert.equal(await e.nudge.button('task-1', 0), false);
  assert.equal(await e.nudge.button('warm-tip-1', 1), false);
  assert.equal(await e.nudge.button(undefined, 0), false);
  assert.equal(e.notifyLog.length, 0);
  const id = await shown(e);
  assert.equal(await e.nudge.button(id, 2), true);
  assert.equal(e.shown.has(id), false);
  assert.equal(e.local.data[Nudge.STATS_KEY], undefined);
  assert.equal(e.scheduled.has('jelly-nudge-snooze-water'), false);
});

test('dismiss：点通知本身只关掉它；不是本模块的通知返回 false 且不动', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = await shown(e);
  assert.equal(await e.nudge.dismiss(id), true);
  assert.equal(e.shown.has(id), false);
  e.shown.set('task-3', {});
  assert.equal(await e.nudge.dismiss('task-3'), false);
  assert.equal(e.shown.has('task-3'), true);
});

test('并发操作按顺序执行：连续的 set 与 get 看到的是最后一次设置，两次按钮不会丢计数', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = await shown(e);
  await Promise.all([e.nudge.button(id, 0), e.nudge.button(id, 0), e.nudge.button(id, 0)]);
  assert.equal(e.local.data[Nudge.STATS_KEY].water, 3);
  const results = await Promise.all([e.nudge.set(on({ water: { on: true, everyMin: 30 } })), e.nudge.set(on({ water: { on: true, everyMin: 90 } })), e.nudge.get()]);
  assert.equal(results[2].config.water.everyMin, 90);
  assert.equal(e.scheduled.get('jelly-nudge-water').periodInMinutes, 90);
});

// ---------- 委托水母（presenter） ----------

function presenterStub(behavior = {}) {
  const calls = { present: [], cancel: [] };
  return {
    calls,
    present: async nudge => {
      calls.present.push(nudge);
      if (behavior.throws) throw new Error('presenter down');
      if (behavior.hang) return new Promise(() => {});
      return 'result' in behavior ? behavior.result : { shown: true };
    },
    cancel: async id => { calls.cancel.push(id); if (behavior.cancelThrows) throw new Error('cancel failed'); },
  };
}

test('水母接手：presenter 确认显示后不再弹系统通知，载荷只有校验过的固定字段', async () => {
  const presenter = presenterStub();
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), presenter });
  const result = await e.nudge.fire('jelly-nudge-water');
  assert.equal(result.sent, true);
  assert.equal(result.via, 'jelly');
  assert.equal(e.notifyLog.filter(c => c[0] === 'create').length, 0, '水母接手后没有系统通知');
  assert.equal(presenter.calls.present.length, 1);
  const nudge = presenter.calls.present[0];
  assert.equal(nudge.id, `jelly-nudge-water-${at(15, 10, 30).getTime()}`);
  assert.equal(Nudge.parseNotification(nudge.id), 'water');
  assert.deepEqual(Object.keys(nudge).sort(), ['buttons', 'id', 'kind', 'text', 'title', 'ttl']);
  assert.equal(nudge.kind, 'water');
  assert.equal(nudge.title, Nudge.KINDS.water.title);
  assert.ok(Nudge.KINDS.water.lines.some(line => nudge.text.startsWith(line)));
  assert.deepEqual(nudge.buttons, [{ id: 'done', title: '喝了' }, { id: 'snooze', title: '10 分钟后' }]);
  assert.equal(nudge.ttl, Nudge.JELLY_TTL_SEC);
  assert.equal(Nudge.JELLY_TTL_SEC, 90);
  assert.equal(presenter.calls.cancel.length, 0, '成功接手不需要撤销');
});

test('水母接手：起身活动的按钮文字是“动了”，文案带上今天已动的次数', async () => {
  const presenter = presenterStub();
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on({ stretch: { on: true, everyMin: 50 } }) }, local: { [Nudge.STATS_KEY]: { day: '2026-10-15', water: 0, stretch: 2 } }, presenter });
  await e.nudge.fire('jelly-nudge-stretch');
  const nudge = presenter.calls.present[0];
  assert.equal(nudge.kind, 'stretch');
  assert.equal(nudge.buttons[0].title, '动了');
  assert.match(nudge.text, /（今天已动了 2 次）$/);
});

test('水母没接手（未显示、抛错、超时、返回值不合格）都退回系统通知，并先让迟到的气泡撤掉', async () => {
  const cases = [
    ['未显示', { result: { shown: false, reason: 'not-resident' } }],
    ['抛错', { throws: true }],
    ['超时', { hang: true }, { presentTimeoutMs: 20 }],
    ['返回 null', { result: null }],
    ['shown 不是严格的 true', { result: { shown: 'yes' } }],
    ['返回字符串', { result: 'ok' }],
  ];
  for (const [label, behavior, extra] of cases) {
    const presenter = presenterStub(behavior);
    const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), presenter, ...extra });
    const result = await e.nudge.fire('jelly-nudge-water');
    assert.equal(result.sent, true, label);
    assert.notEqual(result.via, 'jelly', label);
    assert.equal(e.notifyLog.filter(c => c[0] === 'create').length, 1, `${label}：退回一条系统通知`);
    assert.deepEqual(presenter.calls.cancel, [result.id], `${label}：同一个 id 先撤销气泡`);
    assert.equal(result.id, presenter.calls.present[0].id, `${label}：气泡与通知共用同一个 id`);
  }
});

test('水母的 cancel 抛错不影响退回通知；没有 cancel 的 presenter 也能退回', async () => {
  const presenter = presenterStub({ throws: true, cancelThrows: true });
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, presenter });
  assert.equal((await e.nudge.fire('jelly-nudge-water')).sent, true);
  assert.equal(e.notifyLog.filter(c => c[0] === 'create').length, 1);
  const bare = { present: async () => ({ shown: false }) };
  const e2 = env({ sync: { [Nudge.CONFIG_KEY]: on() }, presenter: bare });
  assert.equal((await e2.nudge.fire('jelly-nudge-water')).sent, true);
});

test('水母接手时不需要通知权限；退回通知时仍受权限限制', async () => {
  const accepted = env({ sync: { [Nudge.CONFIG_KEY]: on() }, permission: 'denied', presenter: presenterStub() });
  assert.deepEqual([(await accepted.nudge.fire('jelly-nudge-water')).sent, accepted.notifyLog.length], [true, 0]);
  const declined = env({ sync: { [Nudge.CONFIG_KEY]: on() }, permission: 'denied', presenter: presenterStub({ result: { shown: false } }) });
  assert.deepEqual(await declined.nudge.fire('jelly-nudge-water'), { sent: false, reason: 'permission' });
});

test('时段外、该类已关、周末不会去打扰水母：presenter 一次都不调用', async () => {
  const presenter = presenterStub();
  const outside = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 19), presenter });
  assert.equal((await outside.nudge.fire('jelly-nudge-water')).sent, false);
  const off = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10), presenter });
  assert.equal((await off.nudge.fire('jelly-nudge-stretch')).sent, false);
  const weekend = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(17, 10), presenter });
  assert.equal((await weekend.nudge.fire('jelly-nudge-water')).sent, false);
  assert.equal(presenter.calls.present.length, 0);
});

test('水母卡住时不会堵死后面的操作：超时后同一队列里的 get 照常返回', async () => {
  const presenter = presenterStub({ hang: true });
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, presenter, presentTimeoutMs: 30 });
  const started = Date.now();
  const fired = e.nudge.fire('jelly-nudge-water');
  const read = e.nudge.get();
  const [firedResult, readResult] = await Promise.all([fired, read]);
  assert.equal(firedResult.sent, true);
  assert.equal(readResult.ok, true);
  assert.ok(Date.now() - started < 2000, `等待上限按 presentTimeoutMs 计（实际 ${Date.now() - started} ms）；放宽它会让串行队列被卡住`);
});

// ---------- act：水母气泡上的按钮 ----------

test('act done：今天的计数 +1，返回给气泡的文字由 Chrome 给出；连点两次各算一次', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10) });
  const id = `jelly-nudge-water-${at(15, 10).getTime()}`;
  assert.deepEqual(await e.nudge.act(id, 'done'), { ok: true, text: '记下啦，今天第 1 次' });
  assert.deepEqual(await e.nudge.act(id, 'done'), { ok: true, text: '记下啦，今天第 2 次' });
  assert.deepEqual(e.local.data[Nudge.STATS_KEY], { day: '2026-10-15', water: 2, stretch: 0 });
  const stretchId = `jelly-nudge-stretch-${at(15, 10).getTime()}`;
  assert.equal((await e.nudge.act(stretchId, 'done')).text, '记下啦，今天第 1 次');
  assert.deepEqual(e.local.data[Nudge.STATS_KEY], { day: '2026-10-15', water: 2, stretch: 1 });
});

test('act snooze：只约一次性闹钟、不计数；该类已被关掉就不再约，仍回报成功', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = `jelly-nudge-water-${at(15, 10).getTime()}`;
  const result = await e.nudge.act(id, 'snooze');
  assert.equal(result.ok, true);
  assert.match(result.text, /10 分钟/);
  assert.deepEqual(e.scheduled.get('jelly-nudge-snooze-water'), { name: 'jelly-nudge-snooze-water', delayInMinutes: 10 });
  assert.equal(e.local.data[Nudge.STATS_KEY], undefined);
  const off = env({ sync: { [Nudge.CONFIG_KEY]: on({ water: { on: false, everyMin: 60 } }) } });
  assert.equal((await off.nudge.act(id, 'snooze')).ok, true);
  assert.equal(off.scheduled.has('jelly-nudge-snooze-water'), false);
});

test('act：不是本模块的 id、未知动作、dismiss 一律 ok:false 且没有任何副作用', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = `jelly-nudge-water-${at(15, 10).getTime()}`;
  for (const [badId, action] of [['task-1', 'done'], ['jelly-nudge-water', 'done'], ['jelly-nudge-tea-1', 'done'], [undefined, 'done'], [id, 'format'], [id, 'dismiss'], [id, undefined], [id, '__proto__']]) {
    const result = await e.nudge.act(badId, action);
    assert.equal(result.ok, false, `${badId}/${action}`);
    assert.match(result.error, /失效/);
  }
  assert.equal(e.local.data[Nudge.STATS_KEY], undefined);
  assert.equal(e.alarmLog.length, 0);
  assert.equal(e.changes.count, 0);
});

test('act 会顺手清掉同 id 的系统通知（先弹了通知、水母的气泡才晚到的极端情况）', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const id = `jelly-nudge-water-${at(15, 10).getTime()}`;
  e.shown.set(id, {});
  await e.nudge.act(id, 'done');
  assert.equal(e.shown.has(id), false);
});

test('onChange：设置、按钮、act 之后各通知一次，读取/触发/点通知本身不通知', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10) });
  await e.nudge.get();
  assert.equal(e.changes.count, 0);
  await e.nudge.set(on({ water: { on: true, everyMin: 45 } }));
  assert.equal(e.changes.count, 1);
  const id = await shown(e);
  assert.equal(e.changes.count, 1, '触发不是“数据变化”');
  await e.nudge.dismiss(id);
  assert.equal(e.changes.count, 1);
  await e.nudge.button(id, 0);
  assert.equal(e.changes.count, 2);
  await e.nudge.act(id, 'snooze');
  assert.equal(e.changes.count, 3);
});

test('onChange 抛错或返回拒绝的 Promise 不影响业务结果', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() } });
  const throwing = Nudge.create({
    syncStorage: e.sync, localStorage: e.local,
    alarms: { create: async () => {}, clear: async () => {}, get: async () => undefined },
    notifications: { create: async () => {}, clear: async () => {} },
    onChange: () => { throw new Error('sync failed'); },
  });
  const id = `jelly-nudge-water-${at(15, 10).getTime()}`;
  assert.equal((await throwing.act(id, 'done')).ok, true);
  const rejecting = Nudge.create({
    syncStorage: e.sync, localStorage: e.local,
    alarms: { create: async () => {}, clear: async () => {}, get: async () => undefined },
    notifications: { create: async () => {}, clear: async () => {} },
    onChange: () => Promise.reject(new Error('later')),
  });
  assert.equal((await rejecting.act(id, 'done')).ok, true);
  await new Promise(resolve => setImmediate(resolve));
});

// ---------- 水母上显示的“今天的记录”与下一次提醒 ----------

test('nextDue：取各类下一次周期闹钟与稍后提醒里最早、且落在时段内的一次；过期的向后对齐，周末按设置跳过', () => {
  const config = Nudge.normalize(on({ stretch: { on: true, everyMin: 50 } }));
  const now = at(15, 10, 0).getTime();
  assert.deepEqual(Nudge.nextDue(config, { water: at(15, 10, 40).getTime(), stretch: at(15, 10, 50).getTime() }, now), { kind: 'water', at: at(15, 10, 40).getTime() });
  assert.deepEqual(Nudge.nextDue(config, { water: at(15, 12, 0).getTime(), stretch: at(15, 10, 50).getTime() }, now), { kind: 'stretch', at: at(15, 10, 50).getTime() });
  // 稍后提醒比周期闹钟更早
  assert.deepEqual(Nudge.nextDue(config, { water: at(15, 10, 40).getTime(), snooze: { water: at(15, 10, 10).getTime() } }, now), { kind: 'water', at: at(15, 10, 10).getTime() });
  // 周期闹钟已过期（浏览器休眠错过）：按周期向后对齐到现在之后
  assert.deepEqual(Nudge.nextDue(config, { water: at(15, 8, 20).getTime() }, now), { kind: 'water', at: at(15, 10, 20).getTime() });
  // 时段外：滚到第二天的时段内（周四 18:20 之后的下一次整周期落在周五 09:20）
  assert.deepEqual(Nudge.nextDue(config, { water: at(15, 18, 20).getTime() }, at(15, 18, 5).getTime()), { kind: 'water', at: at(16, 9, 20).getTime() });
  // 周五晚上：只在工作日时滚到下周一
  assert.deepEqual(Nudge.nextDue(config, { water: at(16, 18, 30).getTime() }, at(16, 18, 10).getTime()), { kind: 'water', at: at(19, 9, 30).getTime() });
  // 允许周末提醒时周六也算
  const weekend = Nudge.normalize(on({ weekdaysOnly: false }));
  assert.deepEqual(Nudge.nextDue(weekend, { water: at(16, 18, 30).getTime() }, at(16, 18, 10).getTime()), { kind: 'water', at: at(17, 9, 30).getTime() });
});

test('nextDue：关着的类别、缺失或非法的时间、没有可用时段都返回 null，不抛错也不死循环', () => {
  const config = Nudge.normalize(on());
  const now = at(15, 10, 0).getTime();
  assert.equal(Nudge.nextDue(config, {}, now), null);
  assert.equal(Nudge.nextDue(config, undefined, now), null);
  for (const bad of [NaN, -5, 0, '12', null, Infinity, {}]) assert.equal(Nudge.nextDue(config, { water: bad }, now), null, String(bad));
  assert.equal(Nudge.nextDue(config, { stretch: at(15, 10, 50).getTime() }, now), null, '起身没开');
  assert.equal(Nudge.nextDue(config, { water: at(15, 10, 40).getTime(), snooze: { stretch: at(15, 10, 5).getTime() } }, now).kind, 'water', '关着的类别的稍后提醒不算');
});

test('describe：只列开着或今天已有计数的类别，计数 0 写“还没…”；下一次提醒写在最后；有效期到下一次提醒或本地午夜，取早者', () => {
  const config = Nudge.normalize(on({ stretch: { on: true, everyMin: 50 } }));
  const date = at(15, 10, 0);
  const scheduled = { water: at(15, 10, 40).getTime(), stretch: at(15, 10, 50).getTime() };
  const out = Nudge.describe(config, { day: '2026-10-15', water: 2, stretch: 0 }, date, scheduled);
  assert.deepEqual(out.lines, ['今天喝了 2 次水', '今天还没起身', '下次喝水提醒 10:40']);
  assert.equal(out.validUntil, at(15, 10, 40).getTime());
  const quiet = Nudge.describe(config, { day: '2026-10-15', water: 0, stretch: 0 }, date, {});
  assert.deepEqual(quiet.lines, ['今天还没喝水', '今天还没起身']);
  assert.equal(quiet.validUntil, new Date(2026, 9, 16).getTime(), '没有下一次提醒时有效到本地午夜');
  const nothing = Nudge.describe(Nudge.normalize(undefined), { day: '2026-10-15', water: 0, stretch: 0 }, date, {});
  assert.deepEqual(nothing.lines, []);
  const kept = Nudge.describe(Nudge.normalize(undefined), { day: '2026-10-15', water: 3, stretch: 0 }, date, {});
  assert.deepEqual(kept.lines, ['今天喝了 3 次水'], '关掉以后今天的计数仍显示');
});

test('describe：行数不超过 3、每行不超过 40 个字符，文案里没有控制字符', () => {
  const config = Nudge.normalize(on({ stretch: { on: true, everyMin: 50 } }));
  const out = Nudge.describe(config, { day: '2026-10-15', water: 999, stretch: 999 }, at(15, 10), { water: at(15, 11).getTime(), stretch: at(15, 10, 50).getTime() });
  assert.ok(out.lines.length <= 3);
  for (const line of out.lines) { assert.ok([...line].length <= 40, line); assert.doesNotMatch(line, /[\u0000-\u001f\u007f]/); }
});

test('summary：由设置、今天的计数和 chrome.alarms 里真实的下一次时间算出；读取不写存储、不动闹钟', async () => {
  const e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 0) });
  await e.nudge.restore();
  const writes = e.sync.writes.length + e.local.writes.length, alarmCalls = e.alarmLog.length;
  const out = await e.nudge.summary();
  assert.deepEqual(out.lines, ['今天还没喝水', '下次喝水提醒 11:00']);
  assert.equal(out.validUntil, at(15, 11, 0).getTime());
  assert.equal(e.sync.writes.length + e.local.writes.length, writes);
  assert.equal(e.alarmLog.length, alarmCalls);
  await e.nudge.act(`jelly-nudge-water-${at(15, 10, 0).getTime()}`, 'snooze');
  const snoozed = await e.nudge.summary();
  assert.equal(snoozed.lines.at(-1), '下次喝水提醒 10:10');
  const noGet = env({ sync: { [Nudge.CONFIG_KEY]: on() }, alarmGet: false });
  assert.deepEqual((await noGet.nudge.summary()).lines, ['今天还没喝水'], '没有 alarms.get 的环境只列计数');
});

test('隐私与范围：模块不碰网络、活动/空闲状态，不新增权限所需的接口', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../js/jelly-nudge.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|chrome\.idle|\.idle\b|sendMessage|tabs\.|history|cookies|innerHTML|\beval\(/);
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
  assert.ok(manifest.permissions.includes('alarms') && manifest.permissions.includes('notifications'), '用的都是已有权限');
  assert.ok(!manifest.permissions.includes('idle'), '没有也不需要 idle 权限');
});

// ---------- onSent：真的发出去之后通知外部（水母差事据此让出最小间隔） ----------

test('onSent：水母接手与系统通知两条路径发出后都回调一次，参数是发出时刻', async () => {
  let e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), presenter: presenterStub() });
  await e.nudge.fire('jelly-nudge-water');
  assert.deepEqual(e.sentAt, [e.clock.date.getTime()]);

  e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30) });
  await e.nudge.fire('jelly-nudge-water');
  assert.equal(e.shown.size, 1);
  assert.deepEqual(e.sentAt, [e.clock.date.getTime()]);
});

test('onSent：没有真的发出（权限不足、不在时段）不回调；回调抛错或返回被拒绝的 Promise 不影响提醒', async () => {
  let e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), permission: 'denied' });
  await e.nudge.fire('jelly-nudge-water');
  assert.deepEqual(e.sentAt, []);

  e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 22, 30) });
  await e.nudge.fire('jelly-nudge-water');
  assert.deepEqual(e.sentAt, []);

  for (const onSent of [() => { throw new Error('boom'); }, () => Promise.reject(new Error('boom'))]) {
    e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), onSent });
    const result = await e.nudge.fire('jelly-nudge-water');
    assert.equal(result.sent, true);
    assert.equal(e.shown.size, 1);
  }
  e = env({ sync: { [Nudge.CONFIG_KEY]: on() }, date: at(15, 10, 30), onSent: null });
  assert.equal((await e.nudge.fire('jelly-nudge-water')).sent, true, '不传 onSent 与以前一样');
});
