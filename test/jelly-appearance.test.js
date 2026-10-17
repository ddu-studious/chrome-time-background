// 桌面水母形象：设置规范化、解析成具体值（含按日期稳定的“每天换一只”）、reroll、串行存储控制器。
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/jelly-appearance.js');
const Core = require('../js/jellyfish-core.js');

function area(initial = {}) {
  const data = { ...initial }; const writes = [];
  return {
    data, writes,
    get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
    set: async items => { writes.push(items); Object.assign(data, JSON.parse(JSON.stringify(items))); },
  };
}
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('常量与首页水母一致：色位数与花纹种类', () => {
  assert.equal(A.COLORS, Core.PARAMS.COLORS);
  assert.deepEqual([...A.LOOKS], [...Core.PARAMS.LOOKS]);
  assert.equal(A.KEY, 'desktopJellyAppearanceV1');
});

test('默认值：玻璃、冰蓝（色位 5）、纯色、中号，节日与每天换都关', () => {
  assert.deepEqual(A.normalize(undefined), { color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false, species: 'jelly' });
  assert.deepEqual(A.normalize(null), A.normalize({}));
  assert.deepEqual(A.normalize('x'), A.normalize({}));
});

test('normalize：非法字段各自回到默认，不影响其他字段', () => {
  const s = A.normalize({ color: 8, look: 'stripe', material: 'gummy', size: 'huge', seasonal: 'yes', daily: 1 });
  assert.equal(s.color, 5); assert.equal(s.look, 'solid'); assert.equal(s.material, 'gummy'); assert.equal(s.size, 'medium');
  assert.equal(s.seasonal, false); assert.equal(s.daily, false);
  assert.equal(A.normalize({ color: 2.5 }).color, 5);
  assert.equal(A.normalize({ color: true }).color, 5);
  assert.equal(A.normalize({ color: -1 }).color, 5);
  assert.equal(A.normalize({ color: 0 }).color, 0);
  assert.equal(A.normalize({ seasonal: true, daily: true }).seasonal, true);
});

test('resolve：纯色只有主色；duo/blend 第二色相隔 DUO/BLEND 偏移；rainbow 三色相隔 2 个色位', () => {
  const date = new Date(2026, 9, 17);
  assert.deepEqual(A.resolve({ color: 3, look: 'solid' }, { date }).colors, [3]);
  const duo = A.resolve({ color: 3, look: 'duo' }, { date }).colors;
  assert.equal(duo.length, 2); assert.equal(duo[0], 3);
  assert.ok([2, 3, 4].includes(Math.min((duo[1] - 3 + 8) % 8, (3 - duo[1] + 8) % 8)));
  const blend = A.resolve({ color: 6, look: 'blend' }, { date }).colors;
  assert.equal(Math.min((blend[1] - 6 + 8) % 8, (6 - blend[1] + 8) % 8), 2);
  const rainbow = A.resolve({ color: 1, look: 'rainbow' }, { date }).colors;
  assert.equal(rainbow.length, 3); assert.equal(rainbow[0], 1);
  const step = (rainbow[1] - 1 + 8) % 8;
  assert.ok(step === 2 || step === 6);
  assert.equal((rainbow[2] - rainbow[1] + 8) % 8, step);
  for (const c of [...duo, ...blend, ...rainbow]) assert.ok(Number.isInteger(c) && c >= 0 && c < 8);
});

test('resolve：同样的设置总得到同样的结果（重启、重连后外观稳定，不靠存储第二色）', () => {
  const date = new Date(2026, 9, 17);
  for (const look of A.LOOKS) for (let color = 0; color < 8; color++) {
    assert.deepEqual(A.resolve({ color, look }, { date }), A.resolve({ color, look }, { date: new Date(2030, 0, 1) }));
  }
});

test('resolve：负载只有下发字段，season 本轮恒为 null，material/size 原样带上', () => {
  const out = A.resolve({ color: 4, look: 'solid', material: 'wire', size: 'large', seasonal: true }, { date: new Date(2026, 9, 17) });
  assert.deepEqual(Object.keys(out).sort(), ['color', 'colors', 'look', 'material', 'season', 'size', 'species']);
  assert.equal(out.season, null); assert.equal(out.material, 'wire'); assert.equal(out.size, 'large');
});

test('daily：同一天稳定、不同天会变；忽略存储的 color/look，保留 material/size', () => {
  const a = A.resolve({ daily: true, color: 0, look: 'solid', material: 'plush', size: 'small' }, { date: new Date(2026, 9, 17, 3) });
  const b = A.resolve({ daily: true, color: 7, look: 'rainbow', material: 'plush', size: 'small' }, { date: new Date(2026, 9, 17, 23) });
  assert.deepEqual(a, b, '同一天（不论几点、存了什么颜色）结果相同');
  assert.equal(a.material, 'plush'); assert.equal(a.size, 'small');
  const seen = new Set();
  for (let day = 1; day <= 60; day++) { const r = A.resolve({ daily: true }, { date: new Date(2026, 9, day) }); seen.add(`${r.color}/${r.look}`); }
  assert.ok(seen.size >= 10, `60 天里应有足够多样的组合，实际 ${seen.size}`);
});

test('reroll：总换成不同的颜色，花纹随机，关闭 daily，保留 material/size/seasonal', () => {
  const base = { color: 5, look: 'solid', material: 'gummy', size: 'large', seasonal: true, daily: true };
  for (let i = 0; i < 8; i++) {
    const r = A.reroll(base, seq(i / 8, 0.5));
    assert.notEqual(r.color, 5, `第 ${i} 次抽到了相同颜色`);
    assert.ok(r.color >= 0 && r.color < 8); assert.ok(A.LOOKS.includes(r.look));
    assert.equal(r.daily, false); assert.equal(r.material, 'gummy'); assert.equal(r.size, 'large'); assert.equal(r.seasonal, true);
  }
  assert.notEqual(A.reroll({ color: 5 }, () => 0.999999).color, 5);
});

test('控制器 get：缺失键给默认，同时给出解析后的具体值', async () => {
  const storage = area();
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  const got = await c.get();
  assert.equal(got.ok, true);
  assert.deepEqual(got.settings, A.normalize({}));
  assert.deepEqual(got.resolved, A.resolve({}, { date: new Date(2026, 9, 17) }));
  assert.equal(storage.writes.length, 0, '读取不写存储');
});

test('控制器 set：只认已知字段并校验取值，未知键丢弃，非法值整体拒绝且不写', async () => {
  const storage = area(); const changes = [];
  const c = A.create({ storage, onChange: () => changes.push(1), now: () => new Date(2026, 9, 17) });
  const ok = await c.set({ color: 2, look: 'duo', bogus: 1 });
  assert.equal(ok.ok, true); assert.equal(ok.settings.color, 2); assert.equal(ok.settings.look, 'duo');
  assert.deepEqual(storage.data[A.KEY], { color: 2, look: 'duo', material: 'glass', size: 'medium', seasonal: false, daily: false, species: 'jelly' });
  assert.equal(changes.length, 1);
  for (const bad of [{ color: 9 }, { color: '1' }, { look: 'x' }, { material: 'metal' }, { size: 'xl' }, { seasonal: 'true' }, { daily: 0 }, { species: 'shark' }, null, [], 'x']) {
    const writes = storage.writes.length;
    const r = await c.set(bad);
    assert.equal(r.ok, false, JSON.stringify(bad)); assert.equal(storage.writes.length, writes, '非法输入不写存储');
  }
  assert.equal(changes.length, 1, '失败不触发 onChange');
});

test('控制器 rerollNow：写入具体值并触发 onChange；payload 与 resolve 一致', async () => {
  const storage = area({ [A.KEY]: { color: 5, look: 'solid', daily: true } }); const changes = [];
  const c = A.create({ storage, onChange: () => changes.push(1), now: () => new Date(2026, 9, 17), random: seq(0.1, 0.9) });
  const r = await c.rerollNow();
  assert.equal(r.ok, true); assert.notEqual(r.settings.color, 5); assert.equal(r.settings.daily, false);
  assert.equal(changes.length, 1);
  assert.deepEqual(await c.payload(), A.resolve(storage.data[A.KEY], { date: new Date(2026, 9, 17) }));
});

test('控制器：并发的 set 串行执行，后一个在前一个结果上合并（不丢更新）', async () => {
  const storage = area();
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  await Promise.all([c.set({ color: 1 }), c.set({ look: 'blend' }), c.set({ daily: true })]);
  assert.deepEqual(storage.data[A.KEY], { color: 1, look: 'blend', material: 'glass', size: 'medium', seasonal: false, daily: true, species: 'jelly' });
});

// ---------- 物种（species）：水母或某种动物；每次只显示一种，每天换/随机一只只换颜色与花纹，不换物种 ----------
const ALL_SPECIES = ['jelly', 'hammer', 'manta', 'turtle', 'whaleshark'];

test('物种：常量、默认值与冻结（原生端的 JellySpecies 与它逐项对照在 desktop-companion-logic 测试里）', () => {
  assert.deepEqual([...A.SPECIES], ALL_SPECIES);
  assert.equal(A.DEFAULTS.species, 'jelly');
  assert.ok(Object.isFrozen(A.SPECIES), '物种列表不可被改写');
  assert.equal(A.normalize({}).species, 'jelly');
});

test('物种 normalize：只认列表里的字符串（区分大小写、不做转换），其余回到水母，且不影响其他字段', () => {
  for (const species of ALL_SPECIES) assert.equal(A.normalize({ species }).species, species);
  for (const bad of ['Hammer', 'HAMMER', ' hammer', 'hammer ', 'shark', '', 'dolphin', 3, 0, true, false, null, undefined, {}, [], ['hammer'], { toString: () => 'hammer' }]) {
    assert.equal(A.normalize({ species: bad }).species, 'jelly', `非法物种 ${JSON.stringify(bad)} 应回到水母`);
  }
  const mixed = A.normalize({ color: 2, look: 'rainbow', material: 'wire', size: 'large', species: 'x' });
  assert.deepEqual([mixed.color, mixed.look, mixed.material, mixed.size, mixed.species], [2, 'rainbow', 'wire', 'large', 'jelly'], '物种非法只影响自己');
  const keep = A.normalize({ color: 9, species: 'manta' });
  assert.equal(keep.color, 5); assert.equal(keep.species, 'manta', '别的字段非法不影响物种');
});

test('物种 resolve：带上物种；颜色与花纹的展开与物种无关（同一设置在五个物种下颜色完全一样）', () => {
  const date = new Date(2026, 9, 17);
  for (const look of A.LOOKS) for (let color = 0; color < 8; color++) {
    const jelly = A.resolve({ color, look }, { date });
    for (const species of ALL_SPECIES) {
      const got = A.resolve({ color, look, species }, { date });
      assert.equal(got.species, species);
      assert.deepEqual({ ...got, species: 'jelly' }, jelly, `${look}/${color}/${species}：除物种外应与水母一致`);
    }
  }
  assert.equal(A.resolve({ species: 'bogus' }, { date }).species, 'jelly', '非法物种按水母');
});

test('物种与“每天换一只”：物种由用户选定，换日不变；颜色花纹照常按日期换', () => {
  const seen = new Set();
  for (const species of ALL_SPECIES) {
    for (let day = 1; day <= 40; day++) {
      const r = A.resolve({ daily: true, species }, { date: new Date(2026, 9, day) });
      assert.equal(r.species, species, `${species} 第 ${day} 天`);
      seen.add(`${r.color}/${r.look}`);
    }
  }
  assert.ok(seen.size >= 10, '物种固定时颜色花纹仍随日期变化');
  const dayA = A.resolve({ daily: true, species: 'hammer' }, { date: new Date(2026, 9, 5) });
  const dayAjelly = A.resolve({ daily: true }, { date: new Date(2026, 9, 5) });
  assert.deepEqual({ ...dayA, species: 'jelly' }, dayAjelly, '同一天换物种，颜色花纹不变');
});

test('物种 reroll：只换颜色与花纹，物种保持不变（五个物种逐个验证）', () => {
  for (const species of ALL_SPECIES) {
    for (let i = 0; i < 8; i++) {
      const r = A.reroll({ color: 3, look: 'duo', species, daily: true }, seq(i / 8, 0.37, 0.9));
      assert.equal(r.species, species, `${species} 第 ${i} 次随机`);
      assert.equal(r.daily, false);
    }
  }
  assert.equal(A.reroll({}, seq(0.2, 0.6)).species, 'jelly');
});

test('物种控制器 set：接受列表里的物种并写入；非法值整体拒绝，不写存储、不触发 onChange', async () => {
  const storage = area(); const changes = [];
  const c = A.create({ storage, onChange: () => changes.push(1), now: () => new Date(2026, 9, 17) });
  const ok = await c.set({ species: 'hammer' });
  assert.equal(ok.ok, true); assert.equal(ok.settings.species, 'hammer'); assert.equal(ok.resolved.species, 'hammer');
  assert.equal(storage.data[A.KEY].species, 'hammer'); assert.equal(changes.length, 1);
  for (const bad of ['shark', 'Hammer', '', 7, null, true, {}, []]) {
    const writes = storage.writes.length;
    const r = await c.set({ species: bad });
    assert.equal(r.ok, false, JSON.stringify(bad)); assert.match(r.error, /species/); assert.equal(storage.writes.length, writes);
  }
  assert.equal(changes.length, 1, '失败不触发 onChange');
  assert.equal(storage.data[A.KEY].species, 'hammer', '失败不改已保存的物种');
  // 同一次 set 里物种合法而别的字段非法：整体拒绝，物种也不会被写进去
  const writes = storage.writes.length;
  assert.equal((await c.set({ species: 'turtle', color: 99 })).ok, false);
  assert.equal(storage.writes.length, writes); assert.equal(storage.data[A.KEY].species, 'hammer');
});

test('物种控制器：payload 带物种；随机一只与设置颜色都保留物种；并发 set 不丢更新', async () => {
  const storage = area({ [A.KEY]: { color: 5, look: 'solid', species: 'whaleshark', daily: true } });
  const c = A.create({ storage, now: () => new Date(2026, 9, 17), random: seq(0.1, 0.9) });
  assert.equal((await c.payload()).species, 'whaleshark');
  const r = await c.rerollNow();
  assert.equal(r.settings.species, 'whaleshark'); assert.equal(storage.data[A.KEY].species, 'whaleshark');
  await Promise.all([c.set({ species: 'manta' }), c.set({ color: 1 }), c.set({ look: 'rainbow' })]);
  assert.equal(storage.data[A.KEY].species, 'manta'); assert.equal(storage.data[A.KEY].color, 1); assert.equal(storage.data[A.KEY].look, 'rainbow');
  assert.equal((await c.payload()).species, 'manta');
});

test('物种迁移：S1a 保存的设置没有 species 字段，读取为水母，读取不写回，原有字段不变', async () => {
  const legacy = { color: 2, look: 'duo', material: 'wire', size: 'large', seasonal: false, daily: false };
  const storage = area({ [A.KEY]: { ...legacy } });
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  const got = await c.get();
  assert.deepEqual(got.settings, { ...legacy, species: 'jelly' });
  assert.equal(got.resolved.species, 'jelly');
  assert.equal(storage.writes.length, 0, '读取旧数据不写存储');
  assert.deepEqual(storage.data[A.KEY], legacy, '存储里的旧值原样保留（回滚到 S1a 也读得懂）');
});

test('控制器：onChange 抛错或返回被拒绝的 Promise 都不影响保存', async () => {
  const storage = area();
  const c1 = A.create({ storage, onChange: () => { throw new Error('boom'); } });
  assert.equal((await c1.set({ color: 3 })).ok, true);
  const c2 = A.create({ storage, onChange: () => Promise.reject(new Error('boom')) });
  assert.equal((await c2.set({ color: 4 })).ok, true);
  assert.equal(storage.data[A.KEY].color, 4);
});

// ---------- “每天换一只”过午夜主动重新下发 ----------

// 可控的定时器替身：list 记录每次预约，fire 模拟到点，cleared/fired 的不算“活着”
function fakeTimers() {
  const list = [], clearCalls = [];
  return {
    list, clearCalls,
    setTimer: (fn, ms) => { const timer = { fn, ms, cleared: false, fired: false }; list.push(timer); return timer; },
    clearTimer: timer => { clearCalls.push(timer); if (timer) timer.cleared = true; },
    live: () => list.filter(timer => !timer.cleared && !timer.fired),
    fire: timer => { timer.fired = true; timer.fn(); },
  };
}
const withDaily = (clock, date, extra = {}, onChange = null) => A.create({
  storage: area({ [A.KEY]: { daily: true } }), onChange, now: () => date, setTimer: clock.setTimer, clearTimer: clock.clearTimer, ...extra,
});

test('每天换一只：下发外观时预约下一个本地午夜（加 1 秒）；到点只通知一次，下一次下发才再预约', async () => {
  const clock = fakeTimers(); let calls = 0;
  const noon = new Date(2026, 9, 17, 14, 30, 0);
  const a = withDaily(clock, noon, {}, () => { calls++; });
  await a.payload();
  assert.equal(clock.live().length, 1, '开着“每天换”时下发外观要预约一次');
  assert.equal(clock.live()[0].ms, new Date(2026, 9, 18).getTime() - noon.getTime() + 1000);
  clock.fire(clock.live()[0]);
  assert.equal(calls, 1, '到点只通知一次（后台据此重新下发）');
  assert.equal(clock.live().length, 0, '到点后不自行续约：没有下发（比如水母没常驻）就不会一直转');
  await a.payload();
  assert.equal(clock.live().length, 1, '重新下发时再预约下一个午夜');
});

test('每天换一只：反复下发不会堆叠定时器，旧的会被取消', async () => {
  const clock = fakeTimers();
  const a = withDaily(clock, new Date(2026, 9, 17, 9, 0, 0));
  await a.payload(); await a.payload(); await a.payload();
  assert.equal(clock.list.length, 3);
  assert.equal(clock.live().length, 1);
  assert.equal(clock.list.filter(timer => timer.cleared).length, 2);
});

test('每天换一只：临近午夜与跨月跨年都按本地日历算，余量保证不空转', async () => {
  const cases = [
    [new Date(2026, 9, 17, 23, 59, 59, 500), 500 + 1000],                        // 离午夜 0.5 秒：延迟仍不小于 1 秒
    [new Date(2026, 9, 31, 12, 0, 0), new Date(2026, 10, 1).getTime() - new Date(2026, 9, 31, 12, 0, 0).getTime() + 1000], // 跨月
    [new Date(2026, 11, 31, 23, 0, 0), 3600 * 1000 + 1000],                        // 跨年
  ];
  for (const [date, expected] of cases) {
    const clock = fakeTimers();
    await withDaily(clock, date).payload();
    assert.equal(clock.live()[0].ms, expected, date.toString());
    assert.ok(clock.live()[0].ms >= 1000, '延迟不得小于 1 秒，避免在午夜前后空转');
  }
});

test('没开“每天换”：下发外观不预约；关掉时取消已有的预约；打开时预约', async () => {
  const clock = fakeTimers();
  const noon = new Date(2026, 9, 17, 12, 0, 0);
  const a = A.create({ storage: area(), now: () => noon, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  await a.payload();
  assert.equal(clock.list.length, 0, '默认关闭，不留定时器');
  assert.equal(clock.clearCalls.length, 0, '没有预约过就不该去取消（不对空句柄调用 clearTimer）');
  await a.set({ daily: true });
  assert.equal(clock.live().length, 1, '打开后预约');
  await a.set({ daily: false });
  assert.equal(clock.live().length, 0, '关掉后取消，不留到明天才发现没用');
});

test('每天换一只：“随机一只”会关闭每天换，同时取消预约', async () => {
  const clock = fakeTimers();
  const a = withDaily(clock, new Date(2026, 9, 17, 12, 0, 0), { random: seq(0.1, 0.1, 0.1) });
  await a.payload();
  assert.equal(clock.live().length, 1);
  await a.rerollNow();
  assert.equal(clock.live().length, 0);
});

test('每天换一只：到点回调里 onChange 抛错不影响，读取存储失败时不预约', async () => {
  const clock = fakeTimers();
  const a = withDaily(clock, new Date(2026, 9, 17, 12, 0, 0), {}, () => { throw new Error('回调失败'); });
  await a.payload();
  assert.doesNotThrow(() => clock.fire(clock.live()[0]));
  const broken = A.create({ storage: { get: async () => { throw new Error('读取失败'); }, set: async () => {} }, now: () => new Date(2026, 9, 17), setTimer: clock.setTimer, clearTimer: clock.clearTimer });
  const before = clock.list.length;
  await assert.rejects(broken.payload());
  assert.equal(clock.list.length, before, '读取失败不预约');
});

test('每天换一只：Node 宿主里的定时器会 unref（不拖住进程退出）；浏览器返回数字时不受影响', async () => {
  let unrefs = 0;
  const handle = { unref() { unrefs++; } };
  const noon = new Date(2026, 9, 17, 12, 0, 0);
  const node = A.create({ storage: area({ [A.KEY]: { daily: true } }), now: () => noon, setTimer: () => handle, clearTimer: () => {} });
  await node.payload();
  assert.equal(unrefs, 1);
  const browser = A.create({ storage: area({ [A.KEY]: { daily: true } }), now: () => noon, setTimer: () => 42, clearTimer: () => {} });
  await assert.doesNotReject(browser.payload());
});

test('读取到损坏的存储值：按默认处理，不抛错也不覆盖原值', async () => {
  const storage = area({ [A.KEY]: 'garbage' });
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  assert.deepEqual((await c.get()).settings, A.normalize({}));
  assert.equal(storage.writes.length, 0);
});

// ---------- 稳定性契约与边界（2026-10-17 第一轮变异检查后补充：原先只测不变量，改常量、种子、边界都发现不了） ----------

test('常量与首页水母一致：花纹偏移（设计稿写的是“偏移常量相同”，之前没有测试守住）', () => {
  assert.deepEqual([...A.DUO_OFFSETS], [...Core.PARAMS.DUO_OFFSETS]);
  assert.deepEqual([...A.BLEND_OFFSETS], [...Core.PARAMS.BLEND_OFFSETS]);
  assert.equal(A.RAINBOW_STEP, Core.PARAMS.RAINBOW_STEP);
});

test('稳定性契约：同一天、同样的设置展开出的颜色在版本之间不变（金样本；有意改算法时更新这里并在文档注明）', () => {
  // [年, 月, 日, 颜色, 花纹, 展开的色位]：2026-10-17 的样本、闰日、跨年、各季度的日期；“今天那只”升级扩展后不应悄悄变掉
  const DAILY = [
    [2026, 1, 1, 2, 'blend', [2, 0]],
    [2026, 2, 28, 0, 'duo', [0, 4]],
    [2026, 3, 8, 5, 'rainbow', [5, 3, 1]],
    [2026, 5, 5, 6, 'solid', [6]],
    [2026, 6, 18, 4, 'solid', [4]],
    [2026, 7, 4, 1, 'duo', [1, 5]],
    [2026, 9, 9, 1, 'solid', [1]],
    [2026, 10, 17, 1, 'duo', [1, 4]],
    [2026, 11, 11, 4, 'rainbow', [4, 2, 0]],
    [2026, 12, 31, 2, 'duo', [2, 5]],
    [2027, 1, 1, 4, 'duo', [4, 2]],
    [2028, 2, 29, 7, 'rainbow', [7, 1, 3]],
  ];
  for (const [year, month, day, color, look, colors] of DAILY) {
    const r = A.resolve({ daily: true }, { date: new Date(year, month - 1, day, 13) });
    assert.deepEqual({ color: r.color, look: r.look, colors: r.colors }, { color, look, colors }, `${year}-${month}-${day}`);
  }
  // 手选（非 daily）：32 种“颜色 × 花纹”各自展开的色位也固定，重启、重连、升级后不变
  const STATIC = {
    solid: [[0], [1], [2], [3], [4], [5], [6], [7]],
    duo: [[0, 6], [1, 4], [2, 6], [3, 1], [4, 6], [5, 1], [6, 4], [7, 2]],
    blend: [[0, 6], [1, 3], [2, 4], [3, 5], [4, 2], [5, 3], [6, 0], [7, 1]],
    rainbow: [[0, 6, 4], [1, 7, 5], [2, 0, 6], [3, 5, 7], [4, 6, 0], [5, 7, 1], [6, 0, 2], [7, 5, 3]],
  };
  for (const look of A.LOOKS) for (let color = 0; color < 8; color++) {
    assert.deepEqual(A.resolve({ color, look }, { date: new Date(2026, 9, 17) }).colors, STATIC[look][color], `${look}/${color}`);
  }
});

test('分布：一年 365 天里每种颜色与花纹都经常出现（伪随机不退化为常数或只走几个值）', () => {
  const colors = new Array(8).fill(0), looks = Object.fromEntries(A.LOOKS.map(look => [look, 0]));
  for (let i = 0; i < 365; i++) {
    const r = A.resolve({ daily: true }, { date: new Date(2026, 0, 1 + i, 12) });
    colors[r.color]++; looks[r.look]++;
  }
  // 期望值 45.6 / 91.3；当前实测最少 33 / 86。阈值取明显低于期望的位置：退化实现（常数、周期很短）一定过不了，正常波动不会误报
  assert.ok(colors.every(count => count >= 25), `颜色分布 ${colors}`);
  assert.ok(Object.values(looks).every(count => count >= 70), `花纹分布 ${JSON.stringify(looks)}`);
});

test('resolve：不合法的设置先规范化（越界颜色、未知花纹、非对象都回到默认，不抛错）', () => {
  const date = new Date(2026, 9, 17), base = A.resolve({}, { date });
  assert.deepEqual(A.resolve({ color: 99, look: 'zig', material: 'x', size: 'y', daily: 'yes', seasonal: 1 }, { date }), base);
  for (const bad of [undefined, null, 'x', 5, []]) assert.deepEqual(A.resolve(bad, { date }), base, String(bad));
});

test('reroll：随机源取边界值（0 与恰好 1）也只给出合法的颜色与花纹', () => {
  for (const edge of [0, 1]) {
    const r = A.reroll({ color: 5 }, () => edge);
    assert.ok(Number.isInteger(r.color) && r.color >= 0 && r.color < 8, `random=${edge} 给出了 ${r.color}`);
    assert.ok(A.LOOKS.includes(r.look), `random=${edge} 给出了花纹 ${r.look}`);
  }
});

test('reroll：第一次抽中旧颜色时必换，且另外 7 种颜色都有机会（逐个旧颜色、扫过整个第二随机区间）', () => {
  // 第二个随机数 → 偏移 0…6：0, 0.15, 0.3, 0.43, 0.6, 0.72, 0.9 分别落在 7 个等宽区间里
  const seconds = [0, 0.15, 0.3, 0.43, 0.6, 0.72, 0.9];
  for (let current = 0; current < 8; current++) {
    const reachable = new Set();
    for (const second of seconds) {
      // 第一次抽到的下标正好是旧颜色，才会走“换一个”的分支；第三次抽花纹
      const r = A.reroll({ color: current }, seq((current + 0.5) / 8, second, 0.1));
      assert.notEqual(r.color, current, `旧颜色 ${current}，第二随机数 ${second}`);
      assert.ok(Number.isInteger(r.color) && r.color >= 0 && r.color < 8);
      reachable.add(r.color);
    }
    assert.deepEqual([...reachable].sort(), [...Array(8).keys()].filter(c => c !== current), `旧颜色 ${current} 重抽后应能到达另外 7 种`);
  }
});

test('控制器：get 与 payload 都用注入的时间（“每天换一只”开着时换一天结果就不同）', async () => {
  const days = [new Date(2026, 9, 17, 12), new Date(2026, 9, 18, 12)];
  const want = days.map(date => A.resolve({ daily: true }, { date }));
  assert.notDeepEqual(want[0], want[1], '前提：这两天的外观不同，否则测不出时间有没有被用上');
  let current = days[0];
  const c = A.create({ storage: area({ [A.KEY]: { daily: true } }), now: () => current, setTimer: () => 0, clearTimer: () => {} });
  for (let i = 0; i < days.length; i++) {
    current = days[i];
    assert.deepEqual((await c.get()).resolved, want[i], `get，第 ${i + 1} 天`);
    assert.deepEqual(await c.payload(), want[i], `payload，第 ${i + 1} 天`);
  }
});

test('控制器：onChange 返回被拒绝的 Promise 时不产生未处理的拒绝（否则 Service Worker 里会报错）', async () => {
  const unhandled = [];
  const listener = reason => unhandled.push(reason);
  process.on('unhandledRejection', listener);
  try {
    const c = A.create({ storage: area(), onChange: () => Promise.reject(new Error('boom')) });
    assert.equal((await c.set({ color: 4 })).ok, true);
    assert.equal((await c.rerollNow()).ok, true);
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
  } finally { process.off('unhandledRejection', listener); }
  assert.deepEqual(unhandled, []);
});

test('UMD：没有 module 的环境（Service Worker、页面）里挂到全局 JellyAppearance；有 module 时只导出、不污染全局', () => {
  const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'jelly-appearance.js'), 'utf8');
  const plain = vm.createContext({});
  vm.runInContext(source, plain);
  assert.equal(typeof plain.JellyAppearance?.resolve, 'function', '没有 module 时应挂到全局');
  assert.equal(plain.JellyAppearance.KEY, A.KEY);
  const withModule = vm.createContext({ module: { exports: {} } });
  vm.runInContext(source, withModule);
  assert.equal(typeof withModule.module.exports.resolve, 'function', '有 module 时应导出');
  assert.equal(withModule.JellyAppearance, undefined, '有 module 时不应再挂全局');
});
