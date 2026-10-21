// 水母差事（纯逻辑）：规范化、时段、任务与日志统计、放行条件、挑选、收敛、文案。
// 不碰存储、时钟与随机数：全部由参数传入。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jelly-errands-core.js');

// 2026-10-15 星期四；2026-10-17 星期六
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m, 0, 0);
const ms = (day, h, m = 0) => at(day, h, m).getTime();
const MIN = 60000;
const on = (patch = {}) => Core.normalize({ enabled: true, ...patch });
const ready = { presence: 'active', activeSince: 0, busy: false };

// ---------- normalize ----------

test('normalize：默认关闭、适中、八类全开、不显示任务名、09:00–18:00、仅工作日', () => {
  assert.deepEqual(Core.normalize(undefined), {
    enabled: false, level: 'mid', kinds: { task: true, worklog: true, lark: true, song: true, tidbit: true, tabs: true, watch: true, bookmark: true },
    showTitles: false, from: '09:00', to: '18:00', weekdaysOnly: true, patrol: true,
  });
  assert.deepEqual(Core.normalize({}), Core.normalize(null));
  for (const bad of ['x', 5, [], true]) assert.deepEqual(Core.normalize(bad), Core.normalize(undefined));
});

test('normalize：enabled 与 showTitles 只认明确的 true；分项只有明确 false 才关；未知键丢弃', () => {
  const config = Core.normalize({ enabled: 1, showTitles: 'yes', kinds: { task: false, worklog: 0, tidbit: undefined, song: false, lark: false }, extra: 1 });
  assert.equal(config.enabled, false);
  assert.equal(config.showTitles, false);
  assert.deepEqual(config.kinds, { task: false, worklog: true, lark: false, song: false, tidbit: true, tabs: true, watch: true, bookmark: true });
  assert.equal('extra' in config, false);
  assert.equal(Core.normalize({ enabled: true, showTitles: true }).showTitles, true);
});

test('normalize：patrol（活动行为，协议 v10）缺省为开，只有明确的 false 才关；旧版本存下的配置没有这个键时按开；其余假值与字符串都不能把它关掉', () => {
  assert.equal(Core.normalize({}).patrol, true);
  assert.equal(Core.normalize({ enabled: true, level: 'busy', kinds: { song: false }, showTitles: true, from: '08:00', to: '19:00', weekdaysOnly: false }).patrol, true, '旧配置（没有 patrol 键）');
  assert.equal(Core.normalize({ patrol: true }).patrol, true);
  assert.equal(Core.normalize({ patrol: false }).patrol, false);
  for (const value of [0, null, 'false', 'no', undefined, '', {}, []]) assert.equal(Core.normalize({ patrol: value }).patrol, true, String(value));
  const saved = Core.normalize({ enabled: true, patrol: false });
  assert.equal(saved.patrol, false);
  assert.deepEqual(Core.normalize(saved), saved, '规范化是幂等的：存下来再读出来不变');
});

test('normalize：非法活跃度回到适中；时段必须开始早于结束，否则回默认', () => {
  assert.equal(Core.normalize({ level: 'busy' }).level, 'busy');
  assert.equal(Core.normalize({ level: 'quiet' }).level, 'quiet');
  assert.equal(Core.normalize({ level: 'crazy' }).level, 'mid');
  const bad = Core.normalize({ from: '18:00', to: '09:00' });
  assert.deepEqual([bad.from, bad.to], ['09:00', '18:00']);
  const good = Core.normalize({ from: '08:30', to: '20:15', weekdaysOnly: false });
  assert.deepEqual([good.from, good.to, good.weekdaysOnly], ['08:30', '20:15', false]);
});

// ---------- inWindow ----------

test('inWindow：工作日时段内含开始、不含结束；周末按 weekdaysOnly 决定', () => {
  const config = on();
  assert.equal(Core.inWindow(config, at(15, 9, 0)), true);
  assert.equal(Core.inWindow(config, at(15, 17, 59)), true);
  assert.equal(Core.inWindow(config, at(15, 18, 0)), false);
  assert.equal(Core.inWindow(config, at(15, 8, 59)), false);
  assert.equal(Core.inWindow(config, at(17, 10, 0)), false);
  assert.equal(Core.inWindow(on({ weekdaysOnly: false }), at(17, 10, 0)), true);
  assert.equal(Core.inWindow(config, new Date('x')), false);
  assert.equal(Core.inWindow(config, null), false);
});

// ---------- taskStats ----------

test('taskStats：排除已完成与失败；今天到期与已过期分别计数；topTitle 是最早到期的一个', () => {
  const memos = [
    { title: 'A', dueDate: '2026-10-15' },
    { title: 'B', dueDate: '2026-10-15', completed: true },
    { title: 'C', dueDate: '2026-10-13', dueTime: '10:00' },
    { title: 'D', dueDate: '2026-10-12', status: 'failed' },
    { title: 'E', dueDate: '2026-10-14' },
    { title: 'F' },
    { title: 'G', dueDate: '2026-10-20' },
    null, 'x',
  ];
  assert.deepEqual(Core.taskStats(memos, '2026-10-15'), { today: 1, overdue: 2, open: 5, topTitle: 'C' });
});

test('taskStats：不是数组或没有任务时全 0', () => {
  for (const bad of [undefined, null, {}, 'x', []]) assert.deepEqual(Core.taskStats(bad, '2026-10-15'), { today: 0, overdue: 0, open: 0, topTitle: '' });
});

// ---------- worklogGap ----------

test('worklogGap：12 点前不产生；12/15/17 点按最近的检查点判断；够了返回 null；只看当天', () => {
  const none = [];
  assert.equal(Core.worklogGap(none, at(15, 11, 59), '2026-10-15'), null);
  assert.deepEqual(Core.worklogGap(none, at(15, 12, 0), '2026-10-15'), { label: '上午', logged: 0, expect: 60, hour: 12 });
  assert.deepEqual(Core.worklogGap([{ date: '2026-10-15', duration: 30 }], at(15, 14, 30), '2026-10-15'), { label: '上午', logged: 30, expect: 60, hour: 12 });
  assert.equal(Core.worklogGap([{ date: '2026-10-15', duration: 60 }], at(15, 14, 30), '2026-10-15'), null);
  assert.deepEqual(Core.worklogGap([{ date: '2026-10-15', duration: 100 }], at(15, 15, 5), '2026-10-15'), { label: '下午', logged: 100, expect: 180, hour: 15 });
  assert.deepEqual(Core.worklogGap([{ date: '2026-10-15', duration: 200 }], at(15, 17, 20), '2026-10-15'), { label: '今天', logged: 200, expect: 360, hour: 17 });
  assert.equal(Core.worklogGap([{ date: '2026-10-14', duration: 600 }], at(15, 12, 0), '2026-10-15').logged, 0);
});

test('worklogGap：条目不是数组或工时非法时按 0 处理，不抛错', () => {
  assert.equal(Core.worklogGap(undefined, at(15, 12, 0), '2026-10-15').logged, 0);
  assert.equal(Core.worklogGap([{ date: '2026-10-15', duration: 'x' }, null, { date: '2026-10-15', duration: -5 }], at(15, 12, 0), '2026-10-15').logged, 0);
});

// ---------- gate ----------

test('gate：关闭、窗口外、离开、刚回来、忙碌、间隔不足、本小时满档，各自给出原因', () => {
  const state = Core.emptyState('2026-10-15');
  const now = ms(15, 10, 0);
  assert.deepEqual(Core.gate(Core.normalize({}), state, ready, now), { ok: false, reason: 'off' });
  assert.deepEqual(Core.gate(on(), state, ready, ms(15, 20, 0)), { ok: false, reason: 'window' });
  assert.deepEqual(Core.gate(on(), state, { ...ready, presence: 'away' }, now), { ok: false, reason: 'away' });
  assert.deepEqual(Core.gate(on(), state, { ...ready, activeSince: now - 19000 }, now), { ok: false, reason: 'returning' });
  assert.deepEqual(Core.gate(on(), state, { ...ready, activeSince: now - 20000 }, now), { ok: true });
  assert.deepEqual(Core.gate(on(), state, { ...ready, busy: true }, now), { ok: false, reason: 'busy' });
  const recent = { ...state, lastAt: now - 14 * MIN, shown: [{ at: now - 14 * MIN, kind: 'task' }] };
  assert.deepEqual(Core.gate(on(), recent, ready, now), { ok: false, reason: 'gap' });
  assert.deepEqual(Core.gate(on(), { ...recent, lastAt: now - 15 * MIN, shown: [{ at: now - 15 * MIN, kind: 'task' }] }, ready, now), { ok: true });
});

test('gate：每小时上限按滑动 60 分钟计数，档位决定上限', () => {
  const now = ms(15, 11, 0);
  const shown = n => Array.from({ length: n }, (_, i) => ({ at: now - (16 + i * 10) * MIN, kind: 'tidbit' }));
  const withShown = list => ({ ...Core.emptyState('2026-10-15'), shown: list, lastAt: Math.max(...list.map(item => item.at)) });
  // 适中 4 条：最近 60 分钟内 4 条 → 满档；3 条 → 放行
  assert.deepEqual(Core.gate(on(), withShown(shown(4)), ready, now), { ok: false, reason: 'budget' });
  assert.deepEqual(Core.gate(on(), withShown(shown(3)), ready, now), { ok: true });
  assert.deepEqual(Core.gate(on({ level: 'quiet' }), withShown(shown(2)), ready, now), { ok: false, reason: 'budget' });
  assert.deepEqual(Core.gate(on({ level: 'busy' }), withShown(shown(7)), ready, now), { ok: true });
  // 超过 60 分钟的不计
  assert.deepEqual(Core.gate(on(), withShown([{ at: now - 61 * MIN, kind: 'task' }, { at: now - 62 * MIN, kind: 'task' }, { at: now - 63 * MIN, kind: 'task' }, { at: now - 64 * MIN, kind: 'task' }]), ready, now), { ok: true });
});

test('gate：presence 未知（activeSince 缺失）按已活跃处理', () => {
  assert.deepEqual(Core.gate(on(), Core.emptyState('2026-10-15'), { presence: 'active', busy: false }, ms(15, 10, 0)), { ok: true });
  assert.deepEqual(Core.gate(on(), Core.emptyState('2026-10-15'), undefined, ms(15, 10, 0)), { ok: true });
});

// ---------- pick ----------

const cand = (kind, fp, extra = {}) => ({ kind, fp, urgency: Core.KINDS[kind].urgency, payload: {}, ...extra });

test('pick：按紧急度降序；同级取该类最久没展示的；已静默、已展示过的内容与当天已做过的概览不入选', () => {
  const state = Core.emptyState('2026-10-15');
  const list = [cand('tidbit', 't1'), cand('brief', 'b1'), cand('worklog', 'w1'), cand('task', 'k1')];
  assert.equal(Core.pick(list, state, ms(15, 10)).kind, 'task');
  assert.equal(Core.pick(list, { ...state, muted: { task: true } }, ms(15, 10)).kind, 'worklog');
  assert.equal(Core.pick(list, { ...state, seen: ['k1', 'w1'] }, ms(15, 10)).kind, 'brief');
  assert.equal(Core.pick(list, { ...state, briefDone: true, seen: ['k1', 'w1'] }, ms(15, 10)).kind, 'tidbit');
  assert.equal(Core.pick(list, { ...state, muted: { task: true, worklog: true, brief: true, tidbit: true } }, ms(15, 10)), null);
  assert.equal(Core.pick([], state, ms(15, 10)), null);
});

test('pick：同一紧急度时挑最久没展示过的类别（两个小乐子来源不会老是同一个）', () => {
  const state = { ...Core.emptyState('2026-10-15'), shown: [{ at: 5, kind: 'a' }, { at: 9, kind: 'b' }] };
  const list = [cand('tidbit', 'x', { urgency: 1, group: 'b' }), cand('tidbit', 'y', { urgency: 1, group: 'a' })];
  assert.equal(Core.pick(list, state, 100).fp, 'y');
});

// ---------- record ----------

test('recordShown：写入展示记录与指纹；概览置 briefDone；指纹最多 50 条淘汰最旧；不改入参', () => {
  const state = Core.emptyState('2026-10-15');
  const next = Core.recordShown(state, cand('brief', 'b1'), 1000);
  assert.deepEqual(next.shown, [{ at: 1000, kind: 'brief' }]);
  assert.equal(next.lastAt, 1000);
  assert.equal(next.briefDone, true);
  assert.deepEqual(next.seen, ['b1']);
  assert.deepEqual(state, Core.emptyState('2026-10-15'));
  let long = state;
  for (let i = 0; i < 60; i++) long = Core.recordShown(long, cand('tidbit', `f${i}`), 2000 + i);
  assert.equal(long.seen.length, 50);
  assert.equal(long.seen[0], 'f10');
  assert.equal(long.seen[49], 'f59');
});

test('recordSeen：只记内容指纹，不占间隔与条数；不改入参', () => {
  const state = Core.emptyState('2026-10-15');
  const next = Core.recordSeen(state, 'x');
  assert.deepEqual(next.seen, ['x']);
  assert.deepEqual(next.shown, []);
  assert.equal(next.lastAt, 0);
  assert.deepEqual(state.seen, []);
});

test('recordExternal：喝水/起身等外部提醒也占预算与间隔', () => {
  const next = Core.recordExternal(Core.emptyState('2026-10-15'), 5000);
  assert.deepEqual(next.shown, [{ at: 5000, kind: 'external' }]);
  assert.equal(next.lastAt, 5000);
});

test('recordOutcome：连续 2 次拒绝当天静默该类；接受后清零；中间接受会打断连续', () => {
  let state = Core.emptyState('2026-10-15');
  state = Core.recordOutcome(state, 'tidbit', false);
  assert.equal(state.muted.tidbit, undefined);
  state = Core.recordOutcome(state, 'tidbit', true);
  state = Core.recordOutcome(state, 'tidbit', false);
  assert.equal(state.muted.tidbit, undefined);
  state = Core.recordOutcome(state, 'tidbit', false);
  assert.equal(state.muted.tidbit, true);
  assert.equal(state.muted.task, undefined);
});

test('rollover 与 sanitizeState：换日清零；同日原样；损坏的状态按空处理', () => {
  const state = Core.recordShown(Core.emptyState('2026-10-15'), cand('task', 'k'), 1);
  assert.equal(Core.rollover(state, '2026-10-15'), state);
  assert.deepEqual(Core.rollover(state, '2026-10-16'), Core.emptyState('2026-10-16'));
  for (const bad of [undefined, null, 5, 'x', [], { day: '2026-10-14' }, { day: '2026-10-15', shown: 'x' }]) {
    assert.deepEqual(Core.sanitizeState(bad, '2026-10-15'), Core.emptyState('2026-10-15'));
  }
  assert.deepEqual(Core.sanitizeState(state, '2026-10-15'), state);
  const dirty = Core.sanitizeState({ day: '2026-10-15', shown: [{ at: 1, kind: 'task' }, { at: 'x' }, null], lastAt: 1, strikes: { task: 1, bogus: 'x' }, muted: { task: true, bogus: 1 }, seen: ['a', 5, 'b'], briefDone: 1 }, '2026-10-15');
  assert.deepEqual(dirty.shown, [{ at: 1, kind: 'task' }]);
  assert.deepEqual(dirty.seen, ['a', 'b']);
  assert.deepEqual(dirty.strikes, { task: 1 });
  assert.deepEqual(dirty.muted, { task: true });
  assert.equal(dirty.briefDone, false);
});

// ---------- copy ----------

test('copy.brief：只有今天、只有过期、两者都有三种写法；默认不带任务名', () => {
  assert.equal(Core.copy.brief({ today: 3, overdue: 1, topTitle: '写周报' }, false).text, '今天 3 个任务，另有 1 个已过期');
  assert.equal(Core.copy.brief({ today: 2, overdue: 0, topTitle: '写周报' }, false).text, '今天有 2 个任务');
  assert.equal(Core.copy.brief({ today: 0, overdue: 4, topTitle: '写周报' }, false).text, '有 4 个任务已过期');
  assert.equal(Core.copy.brief({ today: 3, overdue: 1, topTitle: '写周报' }, false).title, '今天的任务');
  assert.equal(Core.copy.brief({ today: 0, overdue: 0, topTitle: '' }, false), null);
});

test('copy：showTitles 为 true 才带任务名；任务名去控制字符并截到 12 字', () => {
  const stats = { today: 1, overdue: 2, topTitle: '\u202e写\n季度总结报告的第一章第二节内容' };
  const withTitle = Core.copy.task(stats, true);
  assert.match(withTitle.text, /「写季度总结报告的第一章第…」/);
  assert.equal(/[\u202e\n]/.test(withTitle.text), false);
  assert.equal(Core.copy.task(stats, false).text, '2 个任务已过期，处理一下吧');
  assert.equal(Core.copy.task({ today: 0, overdue: 0, topTitle: '' }, true), null);
  assert.match(Core.copy.brief(stats, true).text, /最紧的是「/);
});

test('copy.worklog 与 copy.tidbit：沿用现有系统通知的措辞；文字长度受限', () => {
  assert.equal(Core.copy.worklog({ label: '下午', logged: 0, expect: 180 }).text, '下午还没有更新工作日志，抽空记录一下');
  assert.equal(Core.copy.worklog({ label: '下午', logged: 100, expect: 180 }).text, '下午已记录 1小时40分钟，建议至少 3 小时');
  assert.equal(Core.copy.worklog({ label: '上午', logged: 30, expect: 60 }).text, '上午已记录 30分钟，建议至少 1 小时');
  assert.equal(Core.copy.tidbit({ text: '先开始，才有灵感', author: '某人' }).text, '「先开始，才有灵感」—— 某人');
  assert.equal(Core.copy.tidbit({ text: '多喝水' }).text, '多喝水');
  assert.equal(Core.copy.tidbit({ text: '' }), null);
  assert.equal(Core.copy.tidbit(null), null);
  const long = Core.copy.tidbit({ text: '长'.repeat(300) });
  assert.ok([...long.text].length <= 120);
  for (const kind of Core.KIND_IDS) {
    for (const button of Core.KINDS[kind].buttons) assert.ok([...button.title].length <= 12, `${kind}:${button.id}`);
  }
});

test('KINDS：按钮 id 只来自白名单；每类至少一个主按钮在第一位', () => {
  const allowed = {
    brief: ['open', 'later'],
    task: ['open', 'later'],
    worklog: ['open', 'later'],
    lark: ['open', 'later'],
    song: ['play', 'another', 'dismiss'],
    tidbit: ['more', 'dismiss'],
    tabs: ['open', 'later'],
    watch: ['open', 'dismiss'],
    bookmark: ['open', 'later'],
  };
  assert.deepEqual(Object.keys(Core.KINDS).sort(), Object.keys(allowed).sort());
  for (const [kind, ids] of Object.entries(allowed)) assert.deepEqual(Core.KINDS[kind].buttons.map(b => b.id), ids);
  assert.ok(Core.KINDS.task.urgency > Core.KINDS.worklog.urgency);
  assert.equal(Core.KINDS.lark.urgency, Core.KINDS.worklog.urgency);
  assert.ok(Core.KINDS.worklog.urgency > Core.KINDS.brief.urgency);
  assert.ok(Core.KINDS.brief.urgency > Core.KINDS.tidbit.urgency);
  for (const kind of ['tabs', 'watch', 'bookmark']) assert.equal(Core.KINDS[kind].urgency, Core.KINDS.tidbit.urgency);
});

// ---------- 第二期：推荐歌曲与手动请求 ----------

test('KINDS.song：按钮 播放/换一首/不听、紧急度与小乐子同级（交替轮换）且低于概览；组件版本门槛 song 9、一期四类 8、后续新能力 10', () => {
  assert.deepEqual(Core.KINDS.song.buttons, [{ id: 'play', title: '播放' }, { id: 'another', title: '换一首' }, { id: 'dismiss', title: '不听' }]);
  assert.equal(Core.KINDS.song.urgency, Core.KINDS.tidbit.urgency);
  assert.ok(Core.KINDS.song.urgency < Core.KINDS.brief.urgency);
  assert.equal(Core.KINDS.song.since, 9);
  for (const kind of ['brief', 'task', 'worklog', 'tidbit']) assert.equal(Core.KINDS[kind].since, 8, kind);
  for (const kind of ['lark', 'tabs', 'watch', 'bookmark']) assert.equal(Core.KINDS[kind].since, 10, kind);
  assert.deepEqual(Core.KIND_IDS.slice().sort(), ['bookmark', 'brief', 'lark', 'song', 'tabs', 'task', 'tidbit', 'watch', 'worklog']);
  assert.deepEqual(Core.SWITCHABLE.slice().sort(), ['bookmark', 'lark', 'song', 'tabs', 'task', 'tidbit', 'watch', 'worklog']);
  assert.equal(Core.MIN_VERSION, 8);
  assert.equal(Core.REQUEST_SINCE, 9);
  assert.deepEqual(Core.REQUEST_KINDS, ['brief', 'lark', 'song', 'tidbit', 'worklog', 'tabs', 'watch', 'bookmark']);
  assert.equal(Core.REQUEST_KINDS.includes('task'), false);
});

test('normalize：分项 song 缺省为开，只有明确的 false 才关', () => {
  assert.equal(Core.normalize({}).kinds.song, true);
  assert.equal(Core.normalize({ kinds: { song: false } }).kinds.song, false);
  for (const value of [0, null, 'no', undefined]) assert.equal(Core.normalize({ kinds: { song: value } }).kinds.song, true, String(value));
});

test('copy.song：歌名与歌手；没有歌手不带分隔；控制字符与方向控制符去掉；超长截断加省略号', () => {
  assert.deepEqual(Core.copy.song({ title: '晴天', artist: '周杰伦' }), { title: '来首歌？', text: '《晴天》 · 周杰伦' });
  assert.equal(Core.copy.song({ title: '晴天', artist: '' }).text, '《晴天》');
  assert.equal(Core.copy.song({ title: '晴天' }).text, '《晴天》');
  const dirty = Core.copy.song({ title: '晴\u202e天\n', artist: '周\u0007杰伦' });
  assert.equal(dirty.text, '《晴天》 · 周杰伦');
  const long = Core.copy.song({ title: '歌'.repeat(40), artist: '手'.repeat(40) });
  assert.equal(long.text, `《${'歌'.repeat(24)}…》 · ${'手'.repeat(16)}…`);
  assert.ok([...long.text].length <= 120 && [...long.title].length <= 24);
  for (const bad of [null, undefined, 'x', 5, [], {}, { title: '' }, { title: '\u202e\n' }, { title: 7 }]) assert.equal(Core.copy.song(bad), null, JSON.stringify(bad));
});

test('copy.worklogNow 与 loggedToday：手动“记工时”不看检查点，只说今天记了多少', () => {
  assert.deepEqual(Core.copy.worklogNow(0), { title: '工作日志', text: '今天还没有记录工作日志，现在记一条？' });
  assert.equal(Core.copy.worklogNow(90).text, '今天已记录 1小时30分钟，再记一条？');
  assert.equal(Core.copy.worklogNow(45).text, '今天已记录 45分钟，再记一条？');
  for (const bad of [-5, NaN, undefined, null, 'x']) assert.equal(Core.copy.worklogNow(bad).text, '今天还没有记录工作日志，现在记一条？', String(bad));
  const entries = [{ date: '2026-10-15', duration: 30 }, { date: '2026-10-15', duration: 60 }, { date: '2026-10-14', duration: 500 },
    { date: '2026-10-15', duration: -10 }, { date: '2026-10-15', duration: NaN }, { date: '2026-10-15', duration: '60' }, null, 'x'];
  assert.equal(Core.loggedToday(entries, '2026-10-15'), 90);
  assert.equal(Core.loggedToday(undefined, '2026-10-15'), 0);
  assert.equal(Core.loggedToday([], '2026-10-15'), 0);
  // worklogGap 复用同一份统计
  assert.equal(Core.worklogGap(entries, at(15, 13), '2026-10-15'), null);                // 90 分钟 ≥ 上午检查点的 60 分钟
  assert.deepEqual(Core.worklogGap(entries, at(15, 16), '2026-10-15'), { label: '下午', logged: 90, expect: 180, hour: 15 });
});

test('pick：歌曲排在概览/日志/任务之后；与小乐子同级时按“最久没展示”轮换；当天静默的歌曲被剔除；已看过的歌曲指纹被剔除', () => {
  const song = { kind: 'song', fp: 'song:1', urgency: Core.KINDS.song.urgency, payload: {} };
  const tidbit = { kind: 'tidbit', fp: 'tidbit:a', urgency: Core.KINDS.tidbit.urgency, payload: {} };
  const brief = { kind: 'brief', fp: 'brief:d', urgency: Core.KINDS.brief.urgency, payload: {} };
  const state = Core.emptyState('2026-10-15');
  assert.equal(Core.pick([song, brief], state, 0).kind, 'brief');
  assert.equal(Core.pick([song, tidbit], state, 0).kind, 'song', '都没展示过：保持候选顺序');
  assert.equal(Core.pick([tidbit, song], state, 0).kind, 'tidbit');
  assert.equal(Core.pick([song, tidbit], { ...state, shown: [{ at: 5, kind: 'song' }] }, 9).kind, 'tidbit', '刚放过歌：轮到小乐子');
  assert.equal(Core.pick([tidbit, song], { ...state, shown: [{ at: 5, kind: 'tidbit' }] }, 9).kind, 'song', '刚说过小乐子：轮到歌曲');
  assert.equal(Core.pick([song, tidbit], { ...state, muted: { song: true } }, 0).kind, 'tidbit');
  assert.equal(Core.pick([song], { ...state, seen: ['song:1'] }, 0), null);
});

test('state：sanitizeState 保留 song 的连续拒绝与静默；recordOutcome 对 song 生效，连续两次拒绝当天静默', () => {
  const stored = Core.sanitizeState({ day: '2026-10-15', strikes: { song: 1, junk: 5 }, muted: { song: true, junk: true } }, '2026-10-15');
  assert.deepEqual(stored.strikes, { song: 1 });
  assert.deepEqual(stored.muted, { song: true });
  let state = Core.emptyState('2026-10-15');
  state = Core.recordOutcome(state, 'song', false);
  assert.equal(state.muted.song, undefined);
  state = Core.recordOutcome(state, 'song', false);
  assert.equal(state.muted.song, true);
  assert.deepEqual(Core.recordOutcome(Core.recordOutcome(Core.emptyState('d'), 'song', false), 'song', true).strikes, {});
});

// ---------- 新能力：会议静默闸门、飞书 @我、陈旧标签页、继续看、深海拾贝 ----------

test('gate：开会/通话中（meeting:true 或 presence:meeting）不开口，给出 reason:meeting', () => {
  const state = Core.emptyState('2026-10-15');
  const now = ms(15, 10, 0);
  assert.deepEqual(Core.gate(on(), state, { ...ready, meeting: true }, now), { ok: false, reason: 'meeting' });
  assert.deepEqual(Core.gate(on(), state, { ...ready, presence: 'meeting' }, now), { ok: false, reason: 'meeting' });
  assert.deepEqual(Core.gate(on(), state, { ...ready, meeting: false }, now), { ok: true });
});

test('staleTabStats：排除已固定、有声、当前激活、非 http(s) 与不足 48 小时的标签页；达到门槛返回数量、最久天数与前两个域名', () => {
  const now = ms(15, 10, 0);
  const old3d = now - 75 * 3600000;
  const old2d = now - 50 * 3600000;
  const tabs = [
    { url: 'https://www.github.com/a', lastAccessed: old3d },
    { url: 'https://github.com/b', lastAccessed: old2d },
    { url: 'https://developer.mozilla.org/x', lastAccessed: old2d },
    { url: 'https://developer.mozilla.org/y', lastAccessed: old2d },
    { url: 'https://news.ycombinator.com/item', lastAccessed: old2d },
    { url: 'https://github.com/pinned', lastAccessed: old3d, pinned: true },
    { url: 'https://github.com/audible', lastAccessed: old3d, audible: true },
    { url: 'https://github.com/active', lastAccessed: old3d, active: true },
    { url: 'chrome://extensions/', lastAccessed: old3d },
    { url: 'https://github.com/fresh', lastAccessed: now - 10 * 3600000 },
  ];
  assert.deepEqual(Core.staleTabStats(tabs, now), {
    count: 5,
    oldestDays: 3,
    domains: ['developer.mozilla.org', 'github.com'],
  });
  assert.equal(Core.staleTabStats(tabs.slice(0, 4), now), null, '默认不足 5 个不触发');
  assert.equal(Core.staleTabStats(tabs.slice(0, 1), now, { minCount: 1 }).count, 1, '手动查询 minCount:1 可返回');
  assert.equal(Core.staleTabStats(null, now), null);
});

test('watchCandidates：筛出最近 7 天内进度在 5%～90% 的 B 站、YouTube 与马士兵条目，按最近观看降序', () => {
  const now = ms(15, 10, 0);
  const raw = {
    biliWatchMemory: {
      BV1xx411c7mD: { title: 'Rust 异步编程', page: 2, time: 600, duration: 1000, ts: now - 3600000 },
      BV1yy411c7mE: { title: '几乎看完的', page: 1, time: 960, duration: 1000, ts: now - 1000 },
      BV1zz411c7mF: { title: '太久以前的', page: 1, time: 500, duration: 1000, ts: now - 9 * 24 * 3600000 },
    },
    youtubeWatchHistory: [
      { id: 'dQw4w9WgXcQ', title: 'System Design Interview', watchedAt: new Date(now - 7200000).toISOString() },
    ],
    youtubeWatchProgress: {
      dQw4w9WgXcQ: { time: 450, duration: 1000, updatedAt: now - 1800000 },
    },
    mashibingStudyTrackerV1: {
      courseNo: '2699', sectionNo: '107', courseName: '架构师', sectionName: '分布式锁实战',
      url: 'https://www.mashibing.com/study?courseNo=2699', progress: 35, updatedAt: now - 600000,
    },
  };
  const list = Core.watchCandidates(raw, now);
  assert.deepEqual(list.map(item => [item.platform, item.percent, item.title]), [
    ['mashibing', 35, '分布式锁实战'],
    ['youtube', 45, 'System Design Interview'],
    ['bilibili', 60, 'Rust 异步编程'],
  ]);
  assert.deepEqual(list[2].target, { platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 600, page: 2, title: 'Rust 异步编程' });
});

test('dueBookmarks：筛出 active、未归档且 nextReview <= nowMs 的 http(s) 书签，按逾期最久排序', () => {
  const now = ms(15, 10, 0);
  const items = [
    { id: 'bm1', status: 'active', title: 'WebGPU 规范', url: 'https://gpuweb.github.io/', dateAdded: now - 10 * 24 * 3600000, srs: { nextReview: now - 1000 } },
    { id: 'bm2', status: 'active', title: 'V8 垃圾回收', url: 'https://v8.dev/blog/trash-talk', dateAdded: now - 30 * 24 * 3600000, srs: { nextReview: now - 50000 } },
    { id: 'bm3', status: 'active', title: '已归档', url: 'https://example.com/a', srs: { status: 'archived', nextReview: now - 99999 } },
    { id: 'bm4', status: 'active', title: '未到期', url: 'https://example.com/b', srs: { nextReview: now + 60000 } },
    { id: 'bm5', status: 'dead', title: '失效链接', url: 'https://example.com/c', srs: { nextReview: now - 99999 } },
  ];
  const due = Core.dueBookmarks({ items }, now);
  assert.deepEqual(due.map(item => [item.id, item.daysSaved]), [['bm2', 30], ['bm1', 10]]);
});

test('copy.lark / copy.tabs / copy.watch / copy.bookmark：清洗不可信文本、控制长度，非法输入返回 null', () => {
  assert.deepEqual(
    Core.copy.lark({ count: 3, chats: [{ name: '架构讨论群' }], senders: ['张三', '李四'] }),
    { title: '飞书有人 @你', text: '3 条新 @我（来自「架构讨论群」 · 张三、李四）' }
  );
  assert.equal(Core.copy.lark({ count: 0 }), null);
  assert.deepEqual(
    Core.copy.tabs({ count: 6, oldestDays: 4, domains: ['github.com', 'v8.dev'] }),
    { title: '标签页有点挤', text: '有 6 个标签页超过 4 天没打开了（github.com、v8.dev 等），去整理一下？' }
  );
  assert.deepEqual(
    Core.copy.watch({ platformLabel: 'B 站', title: 'Rust 异步编程', percent: 62 }),
    { title: '上次没看完', text: 'B 站《Rust 异步编程》看到 62%，接着看吗？' }
  );
  assert.deepEqual(
    Core.copy.bookmark({ title: 'V8 垃圾回收', daysSaved: 30 }, 3),
    { title: '深海拾贝', text: '「V8 垃圾回收」收藏 30 天了（共 3 条到期），打捞起来看看？' }
  );
});
