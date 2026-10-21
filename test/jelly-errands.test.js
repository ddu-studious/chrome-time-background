// 水母差事（控制器）：设置与闹钟、评估与放行、发气泡与降级、按钮动作、当天状态、离开与刚回来。
// 用替身 storage / alarms / presenter / 数据源驱动真实模块代码；不使用真实通知、网络或页面。
const test = require('node:test');
const assert = require('node:assert/strict');
const Errands = require('../js/jelly-errands.js');
const Core = require('../js/jelly-errands-core.js');

const at = (day, h, m = 0) => new Date(2026, 9, day, h, m, 0, 0);   // 2026-10-15 星期四
const MIN = 60000;

function area(initial = {}, { failGet = false } = {}) {
  const data = { ...initial };
  const writes = [];
  return {
    data, writes,
    get: async key => { if (failGet) throw new Error('storage broken'); return typeof key === 'string' ? { [key]: data[key] } : { ...data }; },
    set: async items => { writes.push(items); Object.assign(data, JSON.parse(JSON.stringify(items))); },
  };
}

const overdueMemos = [{ title: '写周报', dueDate: '2026-10-13' }, { title: '回邮件', dueDate: '2026-10-15' }];
const tips = [{ text: '先开始，才有灵感', type: 'quote', author: '某人' }, { text: '多喝水', type: 'health' }, { text: '慢慢来', type: 'quote' }];

function env(options = {}) {
  const sync = area({ [Errands.CONFIG_KEY]: options.config === undefined ? { enabled: true } : options.config });
  const local = area(options.local, { failGet: options.failLocalGet });
  const alarmLog = [];
  const alarmTable = new Map();
  const alarms = {
    create: async (name, info) => { alarmLog.push(['create', name, info]); alarmTable.set(name, info); },
    clear: async name => { alarmLog.push(['clear', name]); alarmTable.delete(name); },
    get: async name => alarmTable.get(name),
  };
  const presented = [];
  const cancelled = [];
  const clock = { date: options.date || at(15, 10, 0) };
  const opened = [];
  const logs = [];
  const presenter = options.presenter === null ? null : (options.presenter || {
    present: async nudge => { presented.push(nudge); if (options.presentError) throw new Error('boom'); return { shown: options.shown !== false }; },
    cancel: async id => { cancelled.push(id); },
  });
  let seq = 0;
  const errands = Errands.create({
    syncStorage: sync, localStorage: local, alarms, presenter,
    readMemos: options.readMemos || (async () => overdueMemos),
    readWorklog: options.readWorklog || (async () => []),
    tips: options.tips || (() => tips),
    readLark: options.readLark,
    readTabs: options.readTabs,
    readWatch: options.readWatch,
    readBookmarks: options.readBookmarks,
    openPage: async (kind, target) => { if (options.openError) throw new Error('no tab'); opened.push(target !== undefined ? [kind, target] : kind); },
    now: () => clock.date,
    random: () => { seq += 1; return options.random ? options.random(seq) : 0; },
    presentTimeoutMs: options.presentTimeoutMs,
    isBusy: options.isBusy,
    isAvailable: options.available,
    songs: options.songs, isPlaying: options.isPlaying, playSong: options.playSong, onChange: options.onChange,
    songFetchMs: options.songFetchMs, playingCheckMs: options.playingCheckMs, playMs: options.playMs,
    log: (...args) => logs.push(args),
  });
  return { errands, sync, local, alarmLog, alarmTable, presented, cancelled, clock, opened, logs };
}

const advance = (e, minutes) => { e.clock.date = new Date(e.clock.date.getTime() + minutes * MIN); };
const stateOf = e => e.local.data[Errands.STATE_KEY];

// ---------- set / get / restore ----------

test('set：保存规范化后的设置；开启建 5 分钟周期闹钟，关闭清掉；已有同周期的闹钟不重建', async () => {
  const e = env({ config: undefined });
  const result = await e.errands.set({ enabled: true, level: 'busy', junk: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.config.level, 'busy');
  assert.equal('junk' in result.config, false);
  assert.deepEqual(e.sync.data[Errands.CONFIG_KEY], result.config);
  assert.deepEqual(e.alarmLog.map(item => item.slice(0, 2)), [['create', Errands.ALARM]]);
  assert.equal(e.alarmTable.get(Errands.ALARM).periodInMinutes, 5);
  await e.errands.set({ enabled: true });
  assert.equal(e.alarmLog.filter(item => item[0] === 'create').length, 1);
  await e.errands.set({ enabled: false });
  assert.equal(e.alarmTable.has(Errands.ALARM), false);
});

test('set：不是对象返回 ok:false，不写存储也不动闹钟', async () => {
  const e = env();
  for (const bad of [null, undefined, 'x', 5, []]) assert.equal((await e.errands.set(bad)).ok, false);
  assert.equal(e.sync.writes.length, 0);
  assert.equal(e.alarmLog.length, 0);
});

test('get：返回规范化的设置与今天的状态；restore 按设置补闹钟', async () => {
  const e = env();
  const info = await e.errands.get();
  assert.equal(info.ok, true);
  assert.equal(info.config.enabled, true);
  assert.deepEqual(info.state, Core.emptyState('2026-10-15'));
  await e.errands.restore();
  assert.equal(e.alarmTable.has(Errands.ALARM), true);
  const off = env({ config: {} });
  await off.errands.restore();
  assert.equal(off.alarmTable.has(Errands.ALARM), false);
});

// ---------- fire ----------

test('fire：不是本模块的闹钟返回 undefined', async () => {
  const e = env();
  assert.equal(await e.errands.fire('jelly-nudge-water'), undefined);
  assert.equal(e.presented.length, 0);
});

test('fire：总开关关闭、窗口外、没有候选都不发气泡', async () => {
  const off = env({ config: {} });
  assert.equal((await off.errands.fire(Errands.ALARM)).reason, 'off');
  const night = env({ date: at(15, 22, 0) });
  assert.equal((await night.errands.fire(Errands.ALARM)).reason, 'window');
  const empty = env({ readMemos: async () => [], tips: () => [], config: { enabled: true, kinds: { tidbit: false } } });
  assert.equal((await empty.errands.fire(Errands.ALARM)).reason, 'idle');
  for (const item of [off, night, empty]) assert.equal(item.presented.length, 0);
});

test('fire：通过时恰好一次 present；挑过期任务；id 带类别前缀；按钮来自 KINDS；文字不含任务名（默认）', async () => {
  const e = env();
  const result = await e.errands.fire(Errands.ALARM);
  assert.equal(result.sent, true);
  assert.equal(e.presented.length, 1);
  const nudge = e.presented[0];
  assert.match(nudge.id, /^jelly-errand-task-\d+$/);
  assert.equal(nudge.kind, 'task');
  assert.deepEqual(nudge.buttons, Core.KINDS.task.buttons);
  assert.equal(nudge.text, '1 个任务已过期，处理一下吧');
  assert.equal(nudge.text.includes('写周报'), false);
  assert.equal(nudge.ttl, Errands.TTL_SEC);
  assert.equal(Errands.parseId(nudge.id), 'task');
  assert.equal(Errands.parseId('jelly-nudge-water-1'), null);
  assert.equal(Errands.parseId('jelly-errand-song-1'), 'song');
  assert.equal(Errands.parseId('jelly-errand-radio-1'), null);
});

test('fire：开启 showTitles 才带任务名', async () => {
  const e = env({ config: { enabled: true, showTitles: true } });
  await e.errands.fire(Errands.ALARM);
  assert.match(e.presented[0].text, /「写周报」/);
});

test('fire：展示后写入当天状态；15 分钟内不再发；之后按紧急度依次发概览、小乐子，同一内容当天不重复', async () => {
  const e = env();
  await e.errands.fire(Errands.ALARM);
  assert.equal(stateOf(e).shown.length, 1);
  assert.equal(stateOf(e).lastAt, e.clock.date.getTime());
  advance(e, 5);
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'gap');
  advance(e, 11);
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
  assert.equal(e.presented[1].kind, 'brief');
  advance(e, 16);
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
  assert.equal(e.presented[2].kind, 'tidbit');
  const texts = new Set();
  for (let i = 0; i < 2; i++) {
    advance(e, 16);
    await e.errands.fire(Errands.ALARM);
  }
  for (const nudge of e.presented.filter(item => item.kind === 'tidbit')) texts.add(nudge.text);
  assert.equal(texts.size, e.presented.filter(item => item.kind === 'tidbit').length);
});

test('fire：晨间概览只在 6–11 点，且当天只一次；下午不出概览', async () => {
  const afternoon = env({ date: at(15, 14, 0), config: { enabled: true, kinds: { task: true, worklog: false, tidbit: false } } });
  await afternoon.errands.fire(Errands.ALARM);
  assert.deepEqual(afternoon.presented.map(item => item.kind), ['task']);
  advance(afternoon, 16);
  assert.equal((await afternoon.errands.fire(Errands.ALARM)).reason, 'idle');
});

test('fire：工作日志缺口产生日志气泡；够了不产生', async () => {
  const gap = env({ date: at(15, 15, 30), readMemos: async () => [], config: { enabled: true, kinds: { task: false, tidbit: false } } });
  await gap.errands.fire(Errands.ALARM);
  assert.equal(gap.presented[0].kind, 'worklog');
  assert.equal(gap.presented[0].text, '下午还没有更新工作日志，抽空记录一下');
  const enough = env({ date: at(15, 15, 30), readMemos: async () => [], readWorklog: async () => [{ date: '2026-10-15', duration: 200 }], config: { enabled: true, kinds: { task: false, tidbit: false } } });
  assert.equal((await enough.errands.fire(Errands.ALARM)).reason, 'idle');
});

test('fire：数据源读取失败只跳过该类候选，其余照常', async () => {
  const e = env({ readMemos: async () => { throw new Error('read failed'); } });
  const result = await e.errands.fire(Errands.ALARM);
  assert.equal(result.sent, true);
  assert.equal(e.presented[0].kind, 'tidbit');
});

test('fire：存储读取失败时本次跳过，且不写存储（不覆盖原数据）', async () => {
  const e = env({ failLocalGet: true });
  const result = await e.errands.fire(Errands.ALARM);
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'storage');
  assert.equal(e.presented.length, 0);
  assert.equal(e.local.writes.length, 0);
});

test('fire：损坏的当天状态按空处理，换日后清零', async () => {
  const e = env({ local: { [Errands.STATE_KEY]: { day: '2026-10-15', shown: 'x', seen: 5 } } });
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
  const old = env({ local: { [Errands.STATE_KEY]: { ...Core.recordShown(Core.emptyState('2026-10-14'), { kind: 'task', fp: 'task:2026-10-14:am' }, 1) } } });
  assert.equal((await old.errands.fire(Errands.ALARM)).sent, true);
  assert.equal(stateOf(old).day, '2026-10-15');
  assert.equal(stateOf(old).shown.length, 1);
});

// ---------- present 失败与降级 ----------

test('present：没有确认、抛错、超时、没有 presenter 都不计入展示次数', async () => {
  const declined = env({ shown: false });
  const r1 = await declined.errands.fire(Errands.ALARM);
  assert.equal(r1.sent, false);
  assert.equal(r1.reason, 'declined');
  assert.equal(r1.fallback, true);
  assert.equal(declined.cancelled.length, 1);
  assert.equal(stateOf(declined), undefined);
  const thrown = env({ presentError: true });
  assert.equal((await thrown.errands.fire(Errands.ALARM)).reason, 'declined');
  const slow = env({ presenter: { present: () => new Promise(() => {}), cancel: async () => {} }, presentTimeoutMs: 20 });
  assert.equal((await slow.errands.fire(Errands.ALARM)).reason, 'declined');
  const none = env({ presenter: null });
  assert.equal((await none.errands.fire(Errands.ALARM)).reason, 'declined');
  for (const item of [thrown, slow, none]) assert.equal(stateOf(item), undefined);
});

test('present：只有过期任务与日志缺口建议退回系统通知，概览与小乐子静默', async () => {
  const quiet = env({ shown: false, readMemos: async () => [], config: { enabled: true, kinds: { task: false, worklog: false, tidbit: true } } });
  const r = await quiet.errands.fire(Errands.ALARM);
  assert.equal(r.reason, 'declined');
  assert.equal(r.fallback, false);
  const worklog = env({ shown: false, date: at(15, 15, 30), readMemos: async () => [], config: { enabled: true, kinds: { task: false, tidbit: false } } });
  assert.equal((await worklog.errands.fire(Errands.ALARM)).fallback, true);
});

// ---------- presence / noteExternal / busy ----------

test('presence：离开后不发；回来不足 20 秒不发；之后恢复；旧组件不上报时按已活跃处理', async () => {
  const e = env();
  e.errands.onPresence('away');
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'away');
  e.errands.onPresence('active');
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'returning');
  e.clock.date = new Date(e.clock.date.getTime() + 20000);
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
  const fresh = env();
  fresh.errands.onPresence('active');   // 首次报告：不是“刚回来”
  assert.equal((await fresh.errands.fire(Errands.ALARM)).sent, true);
  fresh.errands.onPresence('bogus');    // 非法值忽略
});

test('noteExternal：喝水/起身刚发过，15 分钟内不再发差事', async () => {
  const e = env();
  await e.errands.noteExternal(e.clock.date.getTime());
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'gap');
  const off = env({ config: {} });
  await off.errands.noteExternal(off.clock.date.getTime());
  assert.equal(off.local.writes.length, 0);
});

test('isBusy：有别的气泡或响铃时不发', async () => {
  const e = env({ isBusy: () => true });
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'busy');
});

test('并发：同时两次 fire 只发一条', async () => {
  const e = env();
  const [a, b] = await Promise.all([e.errands.fire(Errands.ALARM), e.errands.fire(Errands.ALARM)]);
  assert.equal(e.presented.length, 1);
  assert.deepEqual([a.sent, b.sent].sort(), [false, true]);
});

// ---------- act / onHidden ----------

const shownTask = async (options = {}) => {
  const e = env(options);
  await e.errands.fire(Errands.ALARM);
  return { e, id: e.presented[0].id };
};

test('act open：打开对应页面并回 ok；记为接受（清零连续拒绝）', async () => {
  const { e, id } = await shownTask();
  const reply = await e.errands.act(id, 'open');
  assert.equal(reply.ok, true);
  assert.deepEqual(e.opened, ['task']);
  assert.equal(stateOf(e).strikes.task, undefined);
});

test('act open：打不开页面返回 ok:false，不记结果', async () => {
  const { e, id } = await shownTask({ openError: true });
  const reply = await e.errands.act(id, 'open');
  assert.equal(reply.ok, false);
  assert.ok(reply.error);
  assert.deepEqual(e.opened, []);
});

test('act later：过期任务点“明天再说”当天静默这一类；日志点“晚点再说”只记一次拒绝', async () => {
  const { e, id } = await shownTask();
  const reply = await e.errands.act(id, 'later');
  assert.equal(reply.ok, true);
  assert.equal(stateOf(e).muted.task, true);
  const w = env({ date: at(15, 15, 30), readMemos: async () => [], config: { enabled: true, kinds: { task: false, tidbit: false } } });
  await w.errands.fire(Errands.ALARM);
  await w.errands.act(w.presented[0].id, 'later');
  assert.equal(stateOf(w).strikes.worklog, 1);
  assert.equal(stateOf(w).muted.worklog, undefined);
});

test('act dismiss：连续两次小乐子被拒绝后当天静默', async () => {
  const e = env({ readMemos: async () => [] });
  await e.errands.fire(Errands.ALARM);
  await e.errands.act(e.presented[0].id, 'dismiss');
  advance(e, 16);
  await e.errands.fire(Errands.ALARM);
  await e.errands.act(e.presented[1].id, 'dismiss');
  assert.equal(stateOf(e).muted.tidbit, true);
  advance(e, 16);
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'idle');
});

test('act more：立刻再来一条新的小乐子，不占间隔与每小时条数，同样去重；没有了回 ok:false', async () => {
  const e = env({ readMemos: async () => [] });
  await e.errands.fire(Errands.ALARM);
  const shownBefore = stateOf(e).shown.length;
  const first = e.presented[0];
  const reply = await e.errands.act(first.id, 'more');
  assert.equal(reply.ok, true);
  assert.equal(e.presented.length, 2);
  assert.notEqual(e.presented[1].text, first.text);
  assert.equal(stateOf(e).shown.length, shownBefore);
  await e.errands.act(e.presented[1].id, 'more');
  const last = await e.errands.act(e.presented[2].id, 'more');
  assert.equal(last.ok, false);
  assert.equal(e.presented.length, 3);
});

test('act：未知 id、未知动作、不属于该类别的动作 ok:false 且不改状态', async () => {
  const { e, id } = await shownTask();
  const before = JSON.stringify(stateOf(e));
  for (const [badId, action] of [['jelly-nudge-water-1', 'done'], ['x', 'open'], [id, 'done'], [id, 'more'], [id, 'snooze'], [id, undefined], [undefined, 'open']]) {
    assert.equal((await e.errands.act(badId, action)).ok, false);
  }
  assert.equal(JSON.stringify(stateOf(e)), before);
  assert.deepEqual(e.opened, []);
});

test('onHidden：气泡自行消失（没点按钮）算一次拒绝；点过按钮的不重复计；别的 id 忽略', async () => {
  const { e, id } = await shownTask();
  await e.errands.onHidden(id);
  assert.equal(stateOf(e).strikes.task, 1);
  advance(e, 16);
  await e.errands.fire(Errands.ALARM);
  const second = e.presented[1].id;
  await e.errands.act(second, 'open');
  await e.errands.onHidden(second);
  assert.equal(e.presented[1].kind, 'brief');
  assert.equal(stateOf(e).strikes.brief, undefined);
  assert.equal(stateOf(e).strikes.task, 1);
  await e.errands.onHidden('jelly-nudge-water-1');
  await e.errands.onHidden(undefined);
});

test('日志：只记固定类别与结果，不含任何文字', async () => {
  const { e, id } = await shownTask();
  await e.errands.act(id, 'open');
  assert.ok(e.logs.length >= 1);
  assert.equal(JSON.stringify(e.logs).includes('写周报'), false);
  assert.equal(JSON.stringify(e.logs).includes('已过期'), false);
});

// ---------- offer：已有的系统通知发送器先问水母 ----------

test('offer：开着、有内容、你在电脑前、水母接手 → handled:true，调用方不再发系统通知；占用间隔并记内容指纹', async () => {
  const e = env();
  const result = await e.errands.offer('task');
  assert.deepEqual(result, { handled: true, kind: 'task' });
  assert.equal(e.presented.length, 1);
  assert.equal(e.presented[0].kind, 'task');
  assert.match(e.presented[0].id, /^jelly-errand-task-\d+$/);
  assert.equal(stateOf(e).lastAt, e.clock.date.getTime(), '展示后占用间隔');
  assert.ok(stateOf(e).seen.some(fp => fp.startsWith('task:')), '记内容指纹');
  advance(e, 1);
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'gap', '紧接着的定时评估不会再发一条');
});

test('offer：总开关关闭、该类开关关闭、未知类别 → handled:false，不发气泡不写存储', async () => {
  for (const [config, kind] of [[{ enabled: false }, 'task'], [{ enabled: true, kinds: { task: false } }, 'task'], [{ enabled: true, kinds: { worklog: false } }, 'worklog'],
    [{ enabled: true, kinds: { tidbit: false } }, 'tidbit'], [{ enabled: true }, 'song'], [{ enabled: true }, undefined]]) {
    const e = env({ config });
    const result = await e.errands.offer(kind);
    assert.equal(result.handled, false, JSON.stringify([config, kind]));
    assert.equal(e.presented.length, 0);
    assert.equal(e.local.writes.length, 0);
  }
});

test('offer：你不在电脑前、被其他东西占着、该类今天已被静默 → handled:false（调用方照旧发系统通知）', async () => {
  let e = env();
  e.errands.onPresence('away');
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.presented.length, 0);

  e = env({ isBusy: () => true });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.presented.length, 0);

  const day = '2026-10-15';
  e = env({ local: { [Errands.STATE_KEY]: { ...Core.emptyState(day), muted: { task: true } } } });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.presented.length, 0);
});

test('offer：水母没接手（shown:false）、抛错、超时 → handled:false，撤掉可能迟到的气泡，不写状态', async () => {
  let e = env({ shown: false });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.cancelled.length, 1);
  assert.equal(e.local.writes.length, 0);

  e = env({ presentError: true });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.local.writes.length, 0);

  e = env({ presenter: { present: () => new Promise(() => {}), cancel: async () => {} }, presentTimeoutMs: 20 });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.local.writes.length, 0);

  e = env({ presenter: null });
  assert.equal((await e.errands.offer('task')).handled, false);
});

test('offer：没有内容（没有过期任务）→ handled:false；数据源抛错也不抛出', async () => {
  let e = env({ readMemos: async () => [{ title: '今天的', dueDate: '2026-10-15' }] });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.presented.length, 0);

  e = env({ readMemos: async () => { throw new Error('read'); } });
  assert.equal((await e.errands.offer('task')).handled, false);
});

test('offer：存储读不出来 → handled:false，不抛出，不覆盖原数据', async () => {
  const e = env({ failLocalGet: true });
  assert.equal((await e.errands.offer('task')).handled, false);
  assert.equal(e.presented.length, 0);
  assert.equal(e.local.writes.length, 0);
});

test('offer：不检查时段、间隔与每小时条数（那是系统通知自己的触发时机），但晨间概览仍只在 6–11 点、一天一次', async () => {
  let e = env({ date: at(15, 21, 30) });
  assert.equal((await e.errands.offer('task')).handled, true, '时段外也可以');

  e = env({ date: at(15, 10, 0) });
  assert.equal((await e.errands.offer('brief')).handled, true);
  assert.equal(stateOf(e).briefDone, true);
  advance(e, 1);
  assert.equal((await e.errands.offer('brief')).handled, false, '一天一次');

  e = env({ date: at(15, 14, 0) });
  assert.equal((await e.errands.offer('brief')).handled, false, '午后不出概览，调用方照旧发系统通知');
  assert.equal(e.presented.length, 0);
});

test('offer：工作日志缺口与小乐子同样可用；没有缺口 → handled:false', async () => {
  let e = env({ date: at(15, 15, 30), readWorklog: async () => [] });
  assert.equal((await e.errands.offer('worklog')).handled, true);
  assert.equal(e.presented[0].kind, 'worklog');

  e = env({ date: at(15, 15, 30), readWorklog: async () => [{ date: '2026-10-15', duration: 400 }] });
  assert.equal((await e.errands.offer('worklog')).handled, false);

  e = env();
  assert.equal((await e.errands.offer('tidbit')).handled, true);
  assert.equal(e.presented[0].kind, 'tidbit');
  assert.ok(stateOf(e).seen.some(fp => fp.startsWith('tidbit:')));
});

test('offer：不改变定时评估之外的东西——不动闹钟、不写设置', async () => {
  const e = env();
  await e.errands.offer('task');
  assert.equal(e.alarmLog.length, 0);
  assert.equal(e.sync.writes.length, 0);
});

// ---------- isAvailable：水母常驻、已连接、组件版本够新才开口（否则不会为了发气泡去拉起组件） ----------

test('isAvailable 为 false（或抛错、返回非 true）：定时评估、再来一条、offer 都不发气泡不写状态', async () => {
  for (const available of [() => false, async () => false, () => { throw new Error('x'); }, async () => { throw new Error('x'); }, () => 'yes', () => undefined]) {
    const e = env({ available });
    const fired = await e.errands.fire(Errands.ALARM);
    assert.deepEqual([fired.sent, fired.reason], [false, 'unavailable']);
    assert.equal((await e.errands.offer('task')).handled, false);
    assert.equal(e.presented.length, 0);
    assert.equal(e.local.writes.length, 0);
  }
  const e = env({ available: () => false });
  const more = await e.errands.act('jelly-errand-tidbit-1', 'more');
  assert.equal(more.ok, false);
  assert.equal(e.presented.length, 0);
});

test('isAvailable 为 true 或不提供：行为与以前一致', async () => {
  let e = env({ available: async () => true });
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
  e = env();
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
});

// ---------- 第二期：推荐歌曲 ----------

const tick = () => new Promise(resolve => setTimeout(resolve, 5));
const songList = [
  { songId: '101', title: '晴天', artist: '周杰伦' },
  { songId: '102', title: '七里香', artist: '周杰伦' },
  { songId: '103', title: '稻香', artist: '周杰伦' },
];
/** 替身歌曲来源：list 可以是 Error（suggest 抛出）；calls 记录取了几次。 */
const songSource = (list = songList) => {
  const source = { calls: 0, suggest: async () => { source.calls += 1; if (list instanceof Error) throw list; return list.map(item => ({ ...item })); } };
  return source;
};
const kindsOnly = kinds => ({
  enabled: true,
  kinds: { task: false, worklog: false, lark: false, song: false, tidbit: false, tabs: false, watch: false, bookmark: false, ...kinds },
});
const notPlaying = async () => false;
/** 只开歌曲：其余分项关、没有任务，别的类别不会抢先。 */
const songEnv = (options = {}) => env({ readMemos: async () => [], config: kindsOnly({ song: true }), songs: songSource(), isPlaying: notPlaying, ...options });
/** 替身播放器：outcome 可以是对象，或 (第几次调用) => 对象/Promise。 */
const player = (outcome = { ok: true }) => {
  const record = { calls: [], songs: [], signals: [] };
  record.playSong = async (song, signal) => {
    record.calls.push(song.songId); record.songs.push(song); record.signals.push(signal);
    return typeof outcome === 'function' ? outcome(record.calls.length) : outcome;
  };
  return record;
};
const shownSong = async (options = {}) => { const e = songEnv(options); await e.errands.fire(Errands.ALARM); return { e, id: e.presented[0].id }; };

test('歌曲提议：开启且没有在播放 → 发 jelly-errand-song 气泡（3 个按钮、歌名与歌手），记展示与内容指纹', async () => {
  const source = songSource();
  const e = songEnv({ songs: source });
  const result = await e.errands.fire(Errands.ALARM);
  assert.equal(result.sent, true);
  assert.equal(result.kind, 'song');
  const nudge = e.presented[0];
  assert.match(nudge.id, /^jelly-errand-song-\d+$/);
  assert.equal(nudge.kind, 'song');
  assert.deepEqual(nudge.buttons, Core.KINDS.song.buttons);
  assert.equal(nudge.title, '来首歌？');
  assert.equal(nudge.text, '《晴天》 · 周杰伦');
  assert.equal(nudge.ttl, Errands.TTL_SEC);
  assert.equal(Errands.parseId(nudge.id), 'song');
  const state = stateOf(e);
  assert.deepEqual(state.shown.map(item => item.kind), ['song']);
  assert.deepEqual(state.seen, ['song:101']);
  assert.equal(source.calls, 1);
});

test('歌曲提议：正在播放、读不出播放状态（非严格 false）、来源为空/抛错/超时、没有来源、分项关闭、候选都看过，都不提议也不写状态', async () => {
  const never = () => new Promise(() => {});
  const allSeen = { [Errands.STATE_KEY]: { day: '2026-10-15', seen: ['song:101', 'song:102', 'song:103'] } };
  const cases = [
    ['正在播放', { isPlaying: async () => true }],
    ['读不出（null）', { isPlaying: async () => null }],
    ['读取抛错', { isPlaying: async () => { throw new Error('offscreen'); } }],
    ['读取超时', { isPlaying: never, playingCheckMs: 20 }],
    ['非严格 false（0）', { isPlaying: async () => 0 }],
    ['没有 isPlaying', { isPlaying: undefined }],
    ['来源为空', { songs: songSource([]) }],
    ['来源抛错', { songs: songSource(new Error('net')) }],
    ['来源超时', { songs: { suggest: never }, songFetchMs: 20 }],
    ['没有来源', { songs: null }],
    ['分项关闭', { config: kindsOnly({ song: false }) }],
    ['候选都看过', { local: allSeen }],
  ];
  for (const [name, options] of cases) {
    const e = songEnv(options);
    const result = await e.errands.fire(Errands.ALARM);
    assert.deepEqual([result.sent, result.reason], [false, 'idle'], name);
    assert.equal(e.presented.length, 0, name);
    assert.equal(e.local.writes.length, 0, name);
  }
});

test('歌曲提议：组件协议不到 9 不提议歌曲（别的类别仍按 8 放行）；isAvailable 对歌曲收到 9、对其他类别收到 8', async () => {
  const asked = [];
  const source = songSource();
  const old = songEnv({ songs: source, available: version => { asked.push(version); return version <= 8; } });
  const result = await old.errands.fire(Errands.ALARM);
  assert.deepEqual([result.sent, result.reason], [false, 'idle']);
  assert.equal(source.calls, 0);
  assert.deepEqual([...new Set(asked)].sort(), [8, 9]);
  // 同一台“只有 v8”的组件上，过期任务照常发
  const task = env({ config: { enabled: true, kinds: { song: true } }, songs: songSource(), isPlaying: notPlaying, available: version => version <= 8 });
  assert.equal((await task.errands.fire(Errands.ALARM)).kind, 'task');
  const current = songEnv({ available: version => { asked.push(version); return true; } });
  assert.equal((await current.errands.fire(Errands.ALARM)).kind, 'song');
});

test('歌曲提议：有严格更高优先级的候选（过期任务）时先发它，且不为歌曲联网取数；没有时歌曲排在小乐子之前', async () => {
  const source = songSource();
  const task = env({ config: { enabled: true, kinds: { song: true } }, songs: source, isPlaying: notPlaying });
  await task.errands.fire(Errands.ALARM);
  assert.equal(task.presented[0].kind, 'task');
  assert.equal(source.calls, 0);
  const both = env({ readMemos: async () => [], config: { enabled: true, kinds: { task: false, worklog: false } }, songs: songSource(), isPlaying: notPlaying });
  await both.errands.fire(Errands.ALARM);
  assert.equal(both.presented[0].kind, 'song');
});

test('歌曲与小乐子轮换：刚放过歌就轮到小乐子，再之后又是歌曲', async () => {
  const e = env({ readMemos: async () => [], config: { enabled: true, kinds: { task: false, worklog: false } }, songs: songSource(), isPlaying: notPlaying });
  for (let index = 0; index < 4; index += 1) { await e.errands.fire(Errands.ALARM); advance(e, 16); }
  assert.deepEqual(e.presented.map(nudge => nudge.kind), ['song', 'tidbit', 'song', 'tidbit']);
});

test('歌曲候选缓存：30 分钟内连续评估只取一次、过期重取；来源失败后 10 分钟内不再取', async () => {
  const source = songSource();
  const e = songEnv({ songs: source });
  await e.errands.fire(Errands.ALARM);
  advance(e, 16);
  await e.errands.fire(Errands.ALARM);
  assert.equal(source.calls, 1);
  advance(e, 16);
  await e.errands.fire(Errands.ALARM);
  assert.equal(source.calls, 2);
  const failing = songSource(new Error('net'));
  const f = songEnv({ songs: failing });
  await f.errands.fire(Errands.ALARM);
  advance(f, 5);
  await f.errands.fire(Errands.ALARM);
  assert.equal(failing.calls, 1);
  advance(f, 6);
  await f.errands.fire(Errands.ALARM);
  assert.equal(failing.calls, 2);
});

test('歌曲提议：水母没接手（shown:false）→ 不记展示与指纹，也不建议退回系统通知；撤掉可能迟到的气泡', async () => {
  const e = songEnv({ shown: false });
  const result = await e.errands.fire(Errands.ALARM);
  assert.deepEqual([result.sent, result.reason, result.kind, result.fallback], [false, 'declined', 'song', false]);
  assert.deepEqual(e.cancelled, [e.presented[0].id]);
  assert.equal(e.local.writes.length, 0);
});

test('offer：歌曲没有系统通知可兜底，不接受 offer(song)', async () => {
  const e = songEnv();
  assert.deepEqual(await e.errands.offer('song'), { handled: false, reason: 'kind' });
  assert.equal(e.presented.length, 0);
  assert.equal(e.local.writes.length, 0);
});

// ---------- 第二期：歌曲气泡的动作 ----------

test('act play：把整首候选歌曲交给播放器一次；成功写“已开始播放”，记为接受（清零连续拒绝）；之后自行消失不算拒绝', async () => {
  const p = player();
  const { e, id } = await shownSong({ playSong: p.playSong, local: { [Errands.STATE_KEY]: { day: '2026-10-15', strikes: { song: 1 } } } });
  assert.equal(stateOf(e).strikes.song, 1);
  const reply = await e.errands.act(id, 'play');
  assert.deepEqual(reply, { ok: true, text: '已开始播放《晴天》' });
  assert.deepEqual(p.calls, ['101']);
  assert.deepEqual(p.songs[0], songList[0]);
  assert.equal(p.signals[0].cancelled, false);
  assert.equal(stateOf(e).strikes.song, undefined);
  await e.errands.onHidden(id);
  assert.equal(stateOf(e).strikes.song, undefined);
});

test('act play：同一个气泡只会交给播放器一次——进行中再点回“正在交给播放器”，成功后再点回同样的结果', async () => {
  let release;
  const finish = new Promise(resolve => { release = resolve; });
  const p = player(() => finish.then(() => ({ ok: true })));
  const { e, id } = await shownSong({ playSong: p.playSong });
  const first = e.errands.act(id, 'play');
  await tick();
  assert.deepEqual(await e.errands.act(id, 'play'), { ok: false, error: '正在交给播放器，请稍候' });
  release();
  assert.equal((await first).ok, true);
  assert.deepEqual(await e.errands.act(id, 'play'), { ok: true, text: '已开始播放《晴天》' });
  assert.deepEqual(p.calls, ['101']);
});

test('act play：播放期间不堵住串行队列——别的评估照常进行（超时后按未知收尾）', async () => {
  const p = player(() => new Promise(() => {}));
  const { e, id } = await shownSong({ playSong: p.playSong, playMs: 300 });
  const pending = e.errands.act(id, 'play');
  await tick();
  const other = await Promise.race([e.errands.fire(Errands.ALARM), new Promise(resolve => setTimeout(() => resolve('blocked'), 150))]);
  assert.notEqual(other, 'blocked');
  assert.equal((await pending).ok, true);
});

test('act play：明确不可播放（unavailable）→ ok:false 与“换一首”提示，之后再点不再联网', async () => {
  const p = player({ ok: false, dispatched: false, code: 'unavailable', message: '这首歌暂不可播放，请选择其他版本' });
  const { e, id } = await shownSong({ playSong: p.playSong });
  const expected = { ok: false, error: '这首歌暂不可播放，点“换一首”试试' };
  assert.deepEqual(await e.errands.act(id, 'play'), expected);
  assert.deepEqual(await e.errands.act(id, 'play'), expected);
  assert.equal(p.calls.length, 1);
});

test('act play：其他“明确没发出去”的失败显示适配器给的中文提示（没有就用通用提示），可以再点一次重试', async () => {
  const p = player(count => (count === 1 ? { ok: false, dispatched: false, code: 'other', message: '播放器已被手动操作，请重新选择歌曲' } : { ok: true }));
  const { e, id } = await shownSong({ playSong: p.playSong });
  assert.deepEqual(await e.errands.act(id, 'play'), { ok: false, error: '播放器已被手动操作，请重新选择歌曲' });
  assert.equal((await e.errands.act(id, 'play')).ok, true);
  assert.equal(p.calls.length, 2);
  const generic = player({ ok: false, dispatched: false });
  const second = await shownSong({ playSong: generic.playSong });
  assert.deepEqual(await second.e.errands.act(second.id, 'play'), { ok: false, error: '没能开始播放，请稍后再试' });
  const long = player({ ok: false, dispatched: false, message: '长'.repeat(100) });
  const third = await shownSong({ playSong: long.playSong });
  assert.equal([...(await third.e.errands.act(third.id, 'play')).error].length, 40);
});

test('act play：已发给播放器却没有确认（dispatched）→ 按“未知”处理：ok:true 的谨慎文字，不重放，不声称已播放', async () => {
  const p = player({ ok: false, dispatched: true, code: 'other', message: '播放器未确认目标状态，请检查登录或歌曲是否可播放' });
  const { e, id } = await shownSong({ playSong: p.playSong });
  const expected = { ok: true, text: '已交给播放器，还没确认开始播放，请在播放器里看看' };
  assert.deepEqual(await e.errands.act(id, 'play'), expected);
  assert.deepEqual(await e.errands.act(id, 'play'), expected);
  assert.equal(p.calls.length, 1);
  assert.equal(e.logs.some(entry => entry[1] === 'play-unknown'), true);
  assert.equal(JSON.stringify(e.logs).includes('晴天'), false);
});

test('act play：适配器抛错或超时也按“未知”处理（不知道发出去没有，所以不说“已交给播放器”）；超时会置 signal.cancelled 让迟到的流程在下一个检查点停下', async () => {
  const lost = { ok: true, text: '播放器没有及时回应，请在播放器里看看有没有开始播放' };
  const boom = { playSong: async () => { throw new Error('boom'); } };
  const a = await shownSong({ playSong: boom.playSong });
  assert.deepEqual(await a.e.errands.act(a.id, 'play'), lost);
  const hang = player(() => new Promise(() => {}));
  const b = await shownSong({ playSong: hang.playSong, playMs: 20 });
  assert.deepEqual(await b.e.errands.act(b.id, 'play'), lost);
  assert.equal(hang.signals[0].cancelled, true);
  assert.deepEqual(await b.e.errands.act(b.id, 'play'), lost);
  assert.equal(hang.calls.length, 1, '未知之后不重放');
});

test('act play：适配器返回说不清的结果（没有对象、缺 dispatched 标记）也按“未知”处理，不当作没发出去', async () => {
  const lost = { ok: true, text: '播放器没有及时回应，请在播放器里看看有没有开始播放' };
  for (const reply of [undefined, null, 'ok', { ok: false }, { ok: false, message: '失败了' }, { ok: 'yes' }]) {
    const p = player(() => reply);          // 函数形式：player(undefined) 会落到默认的成功结果
    const { e, id } = await shownSong({ playSong: p.playSong });
    assert.deepEqual(await e.errands.act(id, 'play'), lost, JSON.stringify(reply));
    assert.deepEqual(await e.errands.act(id, 'play'), lost);
    assert.equal(p.calls.length, 1);
  }
});

test('act play：没有 playSong、未知或已被淘汰的气泡 → ok:false，不改状态', async () => {
  const { e, id } = await shownSong({ playSong: undefined });
  assert.deepEqual(await e.errands.act(id, 'play'), { ok: false, error: '播放功能不可用' });
  const before = JSON.stringify(stateOf(e));
  assert.deepEqual(await e.errands.act('jelly-errand-song-999', 'play'), { ok: false, error: '这条提示已失效' });
  assert.equal(JSON.stringify(stateOf(e)), before);
  // 只记最近 20 条：更早的气泡被淘汰后点“播放”按已失效处理
  const p = player();
  const many = songEnv({ playSong: p.playSong, songs: songSource(Array.from({ length: 30 }, (_, index) => ({ songId: String(500 + index), title: `歌${index}`, artist: '' }))) });
  await many.errands.fire(Errands.ALARM);
  const first = many.presented[0].id;
  for (let index = 0; index < 21; index += 1) await many.errands.act(many.presented.at(-1).id, 'another');
  assert.deepEqual(await many.errands.act(first, 'play'), { ok: false, error: '这条提示已失效' });
  assert.equal(p.calls.length, 0);
});

test('act another：换一首——当作手动评估：不占间隔与每小时条数、不记拒绝，旧指纹仍在；没有更多了回 ok:false', async () => {
  const { e, id } = await shownSong();
  const before = { shown: stateOf(e).shown.length, lastAt: stateOf(e).lastAt };
  assert.deepEqual(await e.errands.act(id, 'another'), { ok: true, text: '换一首～' });
  assert.equal(e.presented.length, 2);
  assert.equal(e.presented[1].text, '《七里香》 · 周杰伦');
  assert.deepEqual({ shown: stateOf(e).shown.length, lastAt: stateOf(e).lastAt }, before);
  assert.deepEqual(stateOf(e).seen, ['song:101', 'song:102']);
  assert.equal(stateOf(e).strikes.song, undefined);
  await e.errands.onHidden(id);
  assert.equal(stateOf(e).strikes.song, undefined);
  assert.equal((await e.errands.act(e.presented[1].id, 'another')).ok, true);
  assert.deepEqual(await e.errands.act(e.presented[2].id, 'another'), { ok: false, error: '今天的推荐都看完啦' });
  assert.equal(e.presented.length, 3);
});

test('act another：换一首是用户明确要的，不再询问播放状态（哪怕这时已经在放别的歌）', async () => {
  let asked = 0;
  const e = songEnv({ isPlaying: async () => { asked += 1; return false; } });
  await e.errands.fire(Errands.ALARM);
  assert.equal(asked, 1);
  assert.equal((await e.errands.act(e.presented[0].id, 'another')).ok, true);
  assert.equal(asked, 1);
});

test('act dismiss：连续两次“不听”后当天不再提议歌曲', async () => {
  const e = songEnv();
  await e.errands.fire(Errands.ALARM);
  assert.equal((await e.errands.act(e.presented[0].id, 'dismiss')).ok, true);
  assert.equal(stateOf(e).strikes.song, 1);
  advance(e, 16);
  await e.errands.fire(Errands.ALARM);
  await e.errands.act(e.presented[1].id, 'dismiss');
  assert.equal(stateOf(e).muted.song, true);
  advance(e, 16);
  assert.equal((await e.errands.fire(Errands.ALARM)).reason, 'idle');
});

test('act：歌曲气泡只认 play / another / dismiss；别的类别的气泡不认 play / another', async () => {
  const { e, id } = await shownSong({ playSong: player().playSong });
  for (const action of ['open', 'later', 'more', 'done', 'snooze', undefined]) assert.equal((await e.errands.act(id, action)).ok, false, String(action));
  const t = await shownTask();
  for (const action of ['play', 'another']) assert.equal((await t.e.errands.act(t.id, action)).ok, false, action);
  assert.deepEqual(e.opened, []);
});

test('日志：歌曲流程只记固定类别与结果，不含歌名与歌手', async () => {
  const p = player();
  const { e, id } = await shownSong({ playSong: p.playSong });
  await e.errands.act(id, 'play');
  await e.errands.act(id, 'another');
  const text = JSON.stringify(e.logs);
  assert.equal(/晴天|七里香|周杰伦/.test(text), false);
  assert.ok(e.logs.length >= 2);
});

// ---------- 第二期：右键菜单的手动请求 ----------

const manualEnv = (options = {}) => env({ date: at(17, 23, 30), config: kindsOnly({}), songs: songSource(), isPlaying: notPlaying, ...options });   // 星期六深夜、所有分项都关

test('request brief：忽略活动时段与分项开关；发概览气泡；不占间隔与条数、不写 briefDone、不写任何状态', async () => {
  const e = manualEnv();
  assert.deepEqual(await e.errands.request('brief'), { ok: true });
  assert.equal(e.presented.length, 1);
  const nudge = e.presented[0];
  assert.match(nudge.id, /^jelly-errand-brief-\d+$/);
  assert.equal(nudge.kind, 'brief');
  assert.equal(nudge.text, '有 2 个任务已过期');
  assert.deepEqual(nudge.buttons, Core.KINDS.brief.buttons);
  assert.equal(e.local.writes.length, 0);
});

test('request brief：没有任务 → ok:true 带文字、不发气泡；读不到任务 → ok:false', async () => {
  const none = manualEnv({ readMemos: async () => [] });
  assert.deepEqual(await none.errands.request('brief'), { ok: true, text: '今天没有到期或已过期的任务' });
  assert.equal(none.presented.length, 0);
  const broken = manualEnv({ readMemos: async () => { throw new Error('storage'); } });
  assert.deepEqual(await broken.errands.request('brief'), { ok: false, error: '读不到任务，请稍后再试' });
  assert.equal(broken.presented.length, 0);
});

test('request brief：showTitles 为 true 才带任务名', async () => {
  const e = manualEnv({ config: { ...kindsOnly({}), showTitles: true } });
  await e.errands.request('brief');
  assert.match(e.presented[0].text, /最紧的是「/);
});

test('request worklog：不看检查点，直接说今天记了多少；读不到（提醒没开）→ ok:false', async () => {
  const logged = manualEnv({ date: at(17, 9, 0), readWorklog: async () => [{ date: '2026-10-17', duration: 90 }, { date: '2026-10-16', duration: 300 }] });
  assert.deepEqual(await logged.errands.request('worklog'), { ok: true });
  assert.equal(logged.presented[0].kind, 'worklog');
  assert.equal(logged.presented[0].text, '今天已记录 1小时30分钟，再记一条？');
  assert.deepEqual(logged.presented[0].buttons, Core.KINDS.worklog.buttons);
  assert.equal(logged.local.writes.length, 0);
  const empty = manualEnv();
  await empty.errands.request('worklog');
  assert.equal(empty.presented[0].text, '今天还没有记录工作日志，现在记一条？');
  const off = manualEnv({ readWorklog: async () => { throw new Error('worklog-reminder-off'); } });
  assert.deepEqual(await off.errands.request('worklog'), { ok: false, error: '工作日志提醒没开启，或暂时读不到' });
  assert.equal(off.presented.length, 0);
});

test('request tidbit：发小乐子并记内容指纹（不占间隔与条数）；说完了回 ok:true 带文字', async () => {
  const e = manualEnv();
  for (let index = 0; index < 3; index += 1) assert.deepEqual(await e.errands.request('tidbit'), { ok: true });
  assert.equal(new Set(e.presented.map(nudge => nudge.text)).size, 3);
  assert.equal(stateOf(e).seen.length, 3);
  assert.deepEqual([stateOf(e).shown.length, stateOf(e).lastAt], [0, 0]);
  assert.deepEqual(await e.errands.request('tidbit'), { ok: true, text: '今天的小乐子都说完啦' });
  assert.equal(e.presented.length, 3);
});

test('request song：用户明确要的，不看“正在播放”；记内容指纹；没有候选回 ok:true 带文字', async () => {
  const e = manualEnv({ isPlaying: async () => true });
  assert.deepEqual(await e.errands.request('song'), { ok: true });
  assert.equal(e.presented[0].kind, 'song');
  assert.equal(e.presented[0].text, '《晴天》 · 周杰伦');
  assert.deepEqual(stateOf(e).seen, ['song:101']);
  assert.deepEqual([stateOf(e).shown.length, stateOf(e).lastAt], [0, 0]);
  const empty = manualEnv({ songs: songSource([]) });
  assert.deepEqual(await empty.errands.request('song'), { ok: true, text: '这会儿没找到可推荐的歌，稍后再试' });
  assert.equal(empty.presented.length, 0);
  const none = manualEnv({ songs: null });
  assert.deepEqual(await none.errands.request('song'), { ok: true, text: '这会儿没找到可推荐的歌，稍后再试' });
});

test('request：白名单外、总开关关闭、组件不够新、响铃中、读不出状态、水母没接手 → ok:false，不发气泡', async () => {
  const e = manualEnv();
  for (const bad of ['task', 'radio', '', 'song ', undefined, null, 5, {}, []]) assert.deepEqual(await e.errands.request(bad), { ok: false, error: '不认识这个请求' }, String(bad));
  assert.equal(e.presented.length, 0);
  const off = manualEnv({ config: {} });
  assert.deepEqual(await off.errands.request('song'), { ok: false, error: '水母差事没有开启' });
  const asked = [];
  const old = manualEnv({ available: version => { asked.push(version); return version <= 8; } });
  assert.deepEqual(await old.errands.request('song'), { ok: false, error: '桌面组件还不能处理这个请求' });
  assert.deepEqual(asked, [9]);
  const busy = manualEnv({ isBusy: () => true });
  assert.deepEqual(await busy.errands.request('song'), { ok: false, error: '水母正忙着响铃，等一下再叫它' });
  const broken = manualEnv({ failLocalGet: true });
  assert.deepEqual(await broken.errands.request('song'), { ok: false, error: '读不到今天的状态，请稍后再试' });
  const declined = manualEnv({ shown: false });
  assert.deepEqual(await declined.errands.request('song'), { ok: false, error: '水母这会儿没法开口，稍后再试' });
  assert.deepEqual(declined.cancelled, [declined.presented[0].id]);
  assert.equal(declined.local.writes.length, 0);
  for (const each of [off, old, busy, broken]) assert.equal(each.presented.length, 0);
});

test('request：同一时刻只处理一个，忙时回“上一个请求还在处理”', async () => {
  let release;
  const finish = new Promise(resolve => { release = resolve; });
  const e = manualEnv({ songs: { suggest: () => finish.then(() => songList) }, songFetchMs: 5000 });
  const first = e.errands.request('song');
  await tick();
  assert.deepEqual(await e.errands.request('brief'), { ok: false, error: '上一个请求还在处理' });
  release();
  assert.deepEqual(await first, { ok: true });
  assert.deepEqual(await e.errands.request('brief'), { ok: true });
});

test('request：手动出的气泡不累计拒绝——稍后再说/不听/自行消失都不改状态；打开页面仍照常', async () => {
  const e = manualEnv();
  await e.errands.request('brief');
  const brief = e.presented[0].id;
  assert.equal((await e.errands.act(brief, 'later')).ok, true);
  await e.errands.onHidden(brief);
  assert.equal(e.local.writes.length, 0);
  await e.errands.request('song');
  const song = e.presented[1].id;
  const writes = e.local.writes.length;
  assert.equal((await e.errands.act(song, 'dismiss')).ok, true);
  assert.equal(e.local.writes.length, writes);
  assert.equal(stateOf(e).strikes.song, undefined);
  await e.errands.request('worklog');
  assert.equal((await e.errands.act(e.presented[2].id, 'open')).ok, true);
  assert.deepEqual(e.opened, ['worklog']);
  assert.equal(stateOf(e).strikes.worklog, undefined);
});

test('request：手动出的歌曲气泡同样可以点播放，且不占间隔与条数；播放成功不记接受（连续拒绝的计数原样保留）', async () => {
  const p = player();
  const e = manualEnv({ playSong: p.playSong, local: { [Errands.STATE_KEY]: { day: '2026-10-17', strikes: { song: 1 } } } });
  await e.errands.request('song');
  const writes = e.local.writes.length;
  assert.deepEqual(await e.errands.act(e.presented[0].id, 'play'), { ok: true, text: '已开始播放《晴天》' });
  assert.deepEqual(p.calls, ['101']);
  assert.deepEqual([stateOf(e).shown.length, stateOf(e).lastAt], [0, 0]);
  assert.equal(stateOf(e).strikes.song, 1, '手动要的气泡不记接受：定时气泡留下的连续拒绝不会被清零');
  assert.equal(e.local.writes.length, writes, '播放成功没有写任何状态');
});

test('set：保存并对齐闹钟之后调用 onChange 一次；onChange 同步抛错或异步拒绝都不影响返回；非法输入不调用', async () => {
  let count = 0;
  const e = env({ config: undefined, onChange: () => { count += 1; } });
  assert.equal((await e.errands.set({ enabled: true })).ok, true);
  assert.equal(count, 1);
  assert.equal((await e.errands.set(null)).ok, false);
  assert.equal(count, 1);
  for (const onChange of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }]) {
    const bad = env({ config: undefined, onChange });
    assert.equal((await bad.errands.set({ enabled: true })).ok, true);
    await tick();
  }
});

// ---------- 新能力：会议静默、飞书 @我、陈旧标签页、继续看、深海拾贝 ----------

test('presence meeting：开会/通话中定时评估返回 meeting，offer 返回 meeting，不发气泡；手动 request 仍可用', async () => {
  const e = env();
  e.errands.onPresence({ state: 'active', meeting: true });
  assert.deepEqual(await e.errands.fire(Errands.ALARM), { sent: false, reason: 'meeting' });
  assert.deepEqual(await e.errands.offer('task'), { handled: false, reason: 'meeting' });
  assert.equal((await e.errands.request('brief')).ok, true);
  e.errands.onPresence('active', { meeting: false });
  assert.equal((await e.errands.fire(Errands.ALARM)).sent, true);
});

test('飞书 @我（lark）：有新 @我 时发送气泡，点“去看看”将 target 传给 openPage；右键手动查询支持未安装/未登录提示', async () => {
  const e = env({
    readMemos: async () => [],
    config: kindsOnly({ lark: true }),
    readLark: async () => ({ ok: true, count: 2, newestAt: 1760850000000, chats: [{ name: '架构群' }], senders: ['王工'] }),
  });
  const fired = await e.errands.fire(Errands.ALARM);
  assert.equal(fired.sent, true);
  assert.equal(fired.kind, 'lark');
  assert.match(e.presented[0].text, /2 条新 @我（来自「架构群」 · 王工）/);
  await e.errands.act(e.presented[0].id, 'open');
  assert.deepEqual(e.opened, [['lark', { kind: 'lark' }]]);

  const notLogged = env({
    config: kindsOnly({ lark: true }),
    readLark: async () => ({ ok: false, status: 'not_logged_in' }),
  });
  assert.deepEqual(await notLogged.errands.request('lark'), { ok: false, error: '飞书 CLI 尚未登录，请先执行 lark-cli auth login' });
});

test('陈旧标签页（tabs）、继续看（watch）、深海拾贝（bookmark）：定时评估与手动请求、点击打开目标', async () => {
  const nowMs = at(15, 10, 0).getTime();
  const old = nowMs - 72 * 3600000;
  const e = env({
    readMemos: async () => [],
    config: kindsOnly({ tabs: true, watch: true, bookmark: true }),
    readTabs: async () => Array.from({ length: 5 }, (_, i) => ({ url: `https://github.com/p${i}`, lastAccessed: old })),
    readWatch: async () => ({
      biliWatchMemory: { BV1xx411c7mD: { title: 'Rust 异步', page: 1, time: 300, duration: 600, ts: nowMs - 3600000 } },
    }),
    readBookmarks: async () => ({
      items: [{ id: 'bm1', status: 'active', title: 'V8 垃圾回收', url: 'https://v8.dev/gc', dateAdded: nowMs - 20 * 86400000, srs: { nextReview: nowMs - 1000 } }],
    }),
  });

  // 第一次：tabs
  let res = await e.errands.fire(Errands.ALARM);
  assert.equal(res.kind, 'tabs');
  await e.errands.act(e.presented[0].id, 'open');
  assert.deepEqual(e.opened.at(-1), ['tabs', { kind: 'tabs' }]);

  // 16 分钟后：watch
  advance(e, 16);
  res = await e.errands.fire(Errands.ALARM);
  assert.equal(res.kind, 'watch');
  await e.errands.act(e.presented[1].id, 'open');
  assert.deepEqual(e.opened.at(-1), ['watch', { platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 300, page: 1, title: 'Rust 异步' }]);

  // 再 16 分钟后：bookmark
  advance(e, 16);
  res = await e.errands.fire(Errands.ALARM);
  assert.equal(res.kind, 'bookmark');
  await e.errands.act(e.presented[2].id, 'open');
  assert.deepEqual(e.opened.at(-1), ['bookmark', { url: 'https://v8.dev/gc', id: 'bm1', title: 'V8 垃圾回收' }]);
});
