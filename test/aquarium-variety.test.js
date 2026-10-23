// 水族馆“个体大小差异 + 6 种新小鱼”（设计稿 docs/superpowers/specs/2026-10-23-aquarium-variety-design.md）。
// 本文件只放这次新增行为的测试；旧测试里被有意更新的三处（物种数量、v:2 不再是“未来版本”、黄金哈希遍历固定的原 8 种）在各自文件里写明了原因。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/aquarium-core.js');
const Aquarium = require('../js/aquarium.js');

const P = Core.PARAMS;
const W = 1280;
const H = 720;
const KEY = 'aquariumV1';
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };

function seeded(seed = 7) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let seq = 0;
const entry = (species, patch = {}) => Object.assign({ id: `v${++seq}`, species, addedAt: 1000 + seq }, patch);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: W, height: H, random: seeded(), lowPower: false }, extra));
const run = (w, seconds, input = {}, stepMs = 50) => {
    for (let t = 0; t < seconds * 1000; t += stepMs) Core.step(w, stepMs, input);
};

const ORIGINAL_SMALL = ['neon', 'tang', 'clown', 'puffer', 'angel'];
const BIG = ['hammer', 'turtle', 'manta', 'whaleshark'];

// ---------- Task 1：个体大小 ----------

test('个体大小：同一条目同一序号永远得到同一个值，不依赖随机数与调用次数', () => {
    const spec = Core.speciesById('clown');
    const first = Core.sizeOf('abc-1', 0, spec);
    for (let i = 0; i < 5; i++) assert.equal(Core.sizeOf('abc-1', 0, spec), first);
    assert.notEqual(Core.sizeOf('abc-1', 1, spec), first, '同一条目的不同序号应不同');
    assert.notEqual(Core.sizeOf('abc-2', 0, spec), first, '不同条目应不同');
    assert.equal(Core.SIZE_RANGE.length, 2);
    assert.deepEqual([...Core.SIZE_RANGE], [0.75, 1.25]);
    assert.ok(Object.isFrozen(Core.SIZE_RANGE));
});

test('个体大小：4000 个条目全落在 [0.75, 1.25]，均值≈1，两头都取得到，分布是以 1 为中心的三角形（不是均匀分布）', () => {
    const spec = Core.speciesById('neon');
    const values = Array.from({ length: 4000 }, (_, i) => Core.sizeOf(`id-${i}`, 0, spec));
    for (const v of values) assert.ok(v >= 0.75 && v <= 1.25 && Number.isFinite(v), `越界或非有限：${v}`);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    assert.ok(Math.abs(mean - 1) < 0.01, `均值 ${mean}`);
    assert.ok(Math.min(...values) < 0.8, '应取得到偏小的个体');
    assert.ok(Math.max(...values) > 1.2, '应取得到偏大的个体');
    const near = values.filter(v => Math.abs(v - 1) < 0.0625).length;
    const far = values.filter(v => Math.abs(v - 1) > 0.1875).length;
    assert.ok(near > far * 3, `三角分布中间应远多于两头（理论比约 7）：中间 ${near}，两头 ${far}`);
});

test('个体大小：同一条目的 5 条鱼至少 4 个不同的大小；大鱼、没有 size 的种与空种恒为 1', () => {
    const spec = Core.speciesById('tang');
    const five = Array.from({ length: 5 }, (_, i) => Core.sizeOf('school-9', i, spec));
    assert.ok(new Set(five).size >= 4, `5 条里只有 ${new Set(five).size} 种大小`);
    for (const id of BIG) assert.equal(Core.sizeOf('any', 0, Core.speciesById(id)), 1, `${id} 按真实比例，大小恒为 1`);
    assert.equal(Core.sizeOf('any', 0, null), 1);
    assert.equal(Core.sizeOf('any', 0, undefined), 1);
    assert.equal(Core.sizeOf('any', 0, {}), 1);
});

test('个体大小：只有原有 5 种小鱼带 size 范围，4 种大动物没有（保持真实比例）', () => {
    for (const id of ORIGINAL_SMALL) assert.deepEqual([...Core.speciesById(id).size], [0.75, 1.25], `${id} 应带 size 范围`);
    for (const id of BIG) assert.equal(Core.speciesById(id).size, undefined, `${id} 不应有 size`);
});

test('世界：sizes 默认关，关着时每条鱼 size 恒为 1', () => {
    const w = world();
    assert.equal(w.sizes, false);
    Core.reconcile(w, ORIGINAL_SMALL.concat(BIG).map(s => entry(s)), { instant: true });
    assert.ok(w.fish.length > 0);
    for (const f of w.fish) assert.equal(f.size, 1, `${f.species} 关着时 size 应为 1`);
    assert.equal(world({ sizes: false }).sizes, false);
    assert.equal(world({ sizes: true }).sizes, true);
    assert.equal(world({ sizes: 1 }).sizes, true, 'createWorld 内部转成布尔');
});

test('世界：开着 sizes 与关着相比，位置、速度、朝向、深度、相位、种子逐位相同（没有消耗随机数），只有体长按 size 变', () => {
    const entries = ORIGINAL_SMALL.concat(BIG).map((s, i) => ({ id: `fix-${i}`, species: s, addedAt: 1 + i }));
    const off = world({ random: seeded(31) });
    const on = world({ random: seeded(31), sizes: true });
    Core.reconcile(off, entries, { instant: true });
    Core.reconcile(on, entries, { instant: true });
    assert.equal(on.fish.length, off.fish.length);
    let varied = 0;
    for (let i = 0; i < off.fish.length; i++) {
        const a = off.fish[i]; const b = on.fish[i];
        assert.equal(a.species, b.species);
        for (const key of ['x', 'y', 'vx', 'vy', 'ang', 'z', 'phase', 'seed', 't', 'alpha']) assert.equal(b[key], a[key], `${a.species}#${i}.${key}`);
        assert.equal(a.size, 1);
        assert.equal(b.len, a.len * b.size, `${a.species}#${i}：开着时 len = 关着的 len × size`);
        if (BIG.includes(b.species)) { assert.equal(b.size, 1, `${b.species} 不参与`); assert.equal(b.len, a.len); }
        else {
            const spec = Core.speciesById(b.species);
            assert.ok(b.size >= spec.size[0] && b.size <= spec.size[1]);
            assert.equal(b.size, Core.sizeOf(entries.find(e => e.species === b.species).id, off.fish.slice(0, i).filter(f => f.entry === a.entry).length, spec), '大小来自 sizeOf(条目 id, 序号)');
            if (b.size !== 1) varied++;
        }
    }
    assert.ok(varied >= 8, `应有多条鱼大小不同于标准，实际 ${varied}`);
    // 随机序列也没被动过：两个世界的下一个随机数相同
    assert.equal(on.random(), off.random());
});

test('世界：同一个群（5 条霓虹灯鱼）开着 sizes 时彼此大小不同，关着时全一样', () => {
    const on = world({ sizes: true });
    const off = world();
    const one = { id: 'school-a', species: 'neon', addedAt: 1 };
    Core.reconcile(on, [one], { instant: true });
    Core.reconcile(off, [one], { instant: true });
    assert.equal(on.fish.length, 5);
    assert.ok(new Set(on.fish.map(f => f.size)).size >= 4);
    assert.equal(new Set(off.fish.map(f => f.size)).size, 1);
});

test('世界：resize 之后体长与大小的比值不变（f.len 本来就是唯一的体长来源）', () => {
    const w = world({ sizes: true });
    Core.reconcile(w, [{ id: 'rz', species: 'clown', addedAt: 1 }], { instant: true });
    const before = w.fish.map(f => ({ size: f.size, base: f.len / f.size / w.scale }));
    Core.resize(w, 1920, 1080);
    w.fish.forEach((f, i) => {
        assert.equal(f.size, before[i].size);
        assert.ok(Math.abs(f.len / f.size / w.scale - before[i].base) < 1e-9);
    });
});

test('补员：开着 sizes，被吃掉的鱼补回来时大小不变；空缺多出 size 字段，关着时空缺形状仍是 {entry, species, due}', () => {
    // 找一个大小明显偏离 1 的小丑鱼条目 id，免得断言碰巧测在 1 附近
    const clown = Core.speciesById('clown');
    let id = null;
    for (let i = 0; i < 200 && !id; i++) if (Math.abs(Core.sizeOf(`pick-${i}`, 0, clown) - 1) > 0.1) id = `pick-${i}`;
    assert.ok(id, '应能找到偏离 1 超过 0.1 的 id');
    for (const sizes of [true, false]) {
        const w = world({ sizes });
        Core.reconcile(w, [{ id, species: 'clown', addedAt: 1 }], { instant: true });
        const victim = w.fish[0];
        const originalSize = victim.size;
        assert.equal(Core.consume(w, victim, { x: victim.x, y: victim.y }, 0.5), true);
        const vacancy = w.vacancies[0];
        if (sizes) assert.deepEqual(vacancy, { entry: id, species: 'clown', due: vacancy.due, size: originalSize });
        else assert.deepEqual(vacancy, { entry: id, species: 'clown', due: vacancy.due }, '关着时空缺形状与改动之前逐字段相同');
        run(w, 4);
        const replacement = w.fish.find(f => f.entry === id && f.state !== 'leaving');
        assert.ok(replacement, '应补回一条');
        assert.notEqual(replacement.id, victim.id);
        if (sizes) {
            assert.equal(replacement.size, originalSize, '补回的鱼与被吃的同样大');
            const base = replacement.len / replacement.size;
            assert.ok(base >= 0.7725 * clown.len * w.scale - 1e-9 && base <= clown.len * w.scale + 1e-9, `标准体长 ${base} 应在 [0.7725, 1] × 种类体长 × 缩放 内`);
        } else {
            assert.equal(replacement.size, 1);
        }
    }
});

test('enterOne：第四个参数是个体大小；缺省、非有限与非正数一律按 1', () => {
    const w = world({ sizes: true });
    Core.reconcile(w, [{ id: 'eo', species: 'neon', addedAt: 1 }], { instant: true });
    const enter = (size) => { const before = w.fish.length; assert.equal(Core.enterOne(w, 'eo', 'neon', size), true); assert.equal(w.fish.length, before + 1); return w.fish[w.fish.length - 1]; };
    const a = enter(1.2);
    assert.equal(a.size, 1.2);
    assert.ok(Math.abs(a.len / 1.2 - a.len / a.size) < 1e-12);
    for (const bad of [undefined, NaN, Infinity, 0, -1, '2', null]) assert.equal(enter(bad).size, 1, `${String(bad)} 按 1`);
});

// ---------- Task 2：控制器、宿主与设置页 ----------
// 替身与 test/aquarium.test.js 同一做法（替身 chrome.storage + 记录型画布 + 没有 DOM）；这是业务替身层，不等同于真实 Chrome 验证。

function fakeChrome(initial) {
    const state = { data: initial === undefined ? {} : { [KEY]: initial }, sets: [], listeners: [] };
    const chrome = {
        storage: {
            local: {
                async get(key) { return key in state.data ? { [key]: JSON.parse(JSON.stringify(state.data[key])) } : {}; },
                async set(obj) { state.sets.push(JSON.parse(JSON.stringify(obj))); Object.assign(state.data, JSON.parse(JSON.stringify(obj))); },
            },
            onChanged: {
                addListener: fn => state.listeners.push(fn),
                removeListener: fn => { state.listeners = state.listeners.filter(x => x !== fn); },
            },
        },
    };
    return { chrome, state };
}

const ctxProxy = () => {
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key in target) return target[key];
            return (...args) => {
                if (key === 'createLinearGradient' || key === 'createRadialGradient') return { addColorStop() {} };
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
};

const PALETTE = [[255, 0, 0], [255, 150, 50], [240, 220, 70], [90, 230, 100], [80, 240, 190], [110, 200, 255], [170, 110, 255], [245, 105, 225]];

async function make({ stored, lowPower = false, random = seeded() } = {}) {
    const fc = fakeChrome(stored);
    const aq = Aquarium.create({ chrome: fc.chrome, document: null, window: {}, random, wall: () => 1700000000000, warn() {}, now: () => 0, palette: PALETTE });
    aq.start();
    await settle();
    const ctx = ctxProxy();
    const frame = (extra = {}) => aq.frame(Object.assign({ ctx, width: W, height: H, dt: 16, pointer: null, lowPower, amount: 0.65, bells: [] }, extra));
    return { aq, fc, frame };
}

const STORED = { v: 1, fish: [{ id: 'n1', species: 'neon', addedAt: 1 }, { id: 'c1', species: 'clown', addedAt: 2 }, { id: 'h1', species: 'hammer', addedAt: 3 }] };

/** 世界里每个条目的每条鱼，按出场顺序核对：开着时 size 取自 sizeOf(条目 id, 序号)，关着时全是 1。 */
function assertSizes(w, entries, on) {
    for (const item of entries) {
        const spec = Core.speciesById(item.species);
        const fish = w.fish.filter(f => f.entry === item.id);
        assert.equal(fish.length, spec.group, `${item.id} 的条数`);
        fish.forEach((f, i) => assert.equal(f.size, on ? Core.sizeOf(item.id, i, spec) : 1, `${item.id}#${i}`));
    }
}

test('控制器：frame({ sizes: true }) 建出开着个体大小的世界，鱼的大小取自 sizeOf；没传、false 与任何怪值都是关着（只认明确的 true）', async () => {
    const on = await make({ stored: STORED });
    assert.equal(on.frame({ sizes: true }), true);
    assert.equal(on.aq._world().sizes, true);
    assertSizes(on.aq._world(), STORED.fish, true);
    assert.equal(on.aq.state().sizes, true, 'state() 报告（验收诊断）');
    for (const options of [{}, { sizes: false }, { sizes: 1 }, { sizes: 'true' }, { sizes: null }, { sizes: undefined }]) {
        const t = await make({ stored: STORED });
        assert.equal(t.frame(options), true);
        assert.equal(t.aq._world().sizes, false, JSON.stringify(options));
        assertSizes(t.aq._world(), STORED.fish, false);
        assert.equal(t.aq.state().sizes, false);
    }
});

test('控制器：sizes 在帧之间切换会重建世界（与省流量切换同一做法）；没变不重建；同一条鱼的大小稳定，名单与存储一字不动', async () => {
    const t = await make({ stored: STORED });
    t.frame({ sizes: false });
    const w1 = t.aq._world();
    t.frame({ sizes: true });
    const w2 = t.aq._world();
    assert.notEqual(w2, w1, '切换要重建');
    assertSizes(w2, STORED.fish, true);
    t.frame({ sizes: true });
    assert.equal(t.aq._world(), w2, '没变不重建');
    t.frame({ sizes: false });
    const w3 = t.aq._world();
    assert.notEqual(w3, w2);
    assertSizes(w3, STORED.fish, false);
    t.frame({ sizes: true });
    assertSizes(t.aq._world(), STORED.fish, true);                        // 再打开，同一条鱼还是同样的大小（由条目 id 决定，不靠存储）
    assert.equal(t.fc.state.sets.length, 0, '切换个体大小从不写存储');
    assert.deepEqual(t.aq.entries().map(e => e.id), ['n1', 'c1', 'h1']);
    assert.deepEqual(t.fc.state.data[KEY], STORED, '存储原样');
});

test('控制器：省流量与 sizes 同时切换只重建一次；世界重建后条目、群与家重新按名单生成', async () => {
    const t = await make({ stored: STORED });
    t.frame({ sizes: true, lowPower: false });
    const w1 = t.aq._world();
    t.frame({ sizes: false, lowPower: true });
    const w2 = t.aq._world();
    assert.notEqual(w2, w1);
    assert.equal(w2.lowPower, true);
    assert.equal(w2.sizes, false);
    assert.equal(w2.fish.length, w1.fish.length);
});

test('设置页：有“个体大小差异”开关，默认开，保存键 aquariumSizes，文案如实写明范围与不参与的动物；宿主与设置页各处都接上；水母不认识它', () => {
    const html = read('settings.html');
    assert.match(html, /id="set-bgAquariumSizes" checked/);
    const found = /<span class="sp-field-label">个体大小差异<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html);
    assert.ok(found, '开关的标签是“个体大小差异”');
    const hint = found[1];
    assert.ok(hint.includes('75%') && hint.includes('125%'), '写明范围');
    assert.ok(hint.includes('小锤头鲨、海龟、蝠鲼、鲸鲨保持真实比例'), '写明不参与的动物');
    assert.ok(hint.includes('不读也不写任何数据'), '写明只是画面效果');
    assert.match(hint, /关闭/, '写明关掉会怎样');
    const page = read('js/settings-page.js');
    assert.match(page, /aquariumSizes: true,/);
    assert.match(page, /aquariumSizes: stored\.aquariumSizes !== false/);
    assert.match(page, /\['set-bgAquariumSizes', 'aquariumSizes', element => element\.checked\]/);
    assert.match(page, /aquariumSizes\.checked = bgExperienceSettings\.aquariumSizes/);
    const host = read('js/background-experience.js');
    assert.match(host, /aquariumSizes: source\.aquariumSizes !== false/);
    assert.match(host, /aquariumSizes: true,/);
    assert.match(host, /sizes: this\.settings\.aquariumSizes/);
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(read(file), /aquariumSizes|AquariumSizes|sizeOf/, `${file} 不认识个体大小`);
});

// ---------- Task 4：六种新小鱼与三个画法特征 ----------

const NEW_SPECIES = ['chromis', 'anthias', 'gramma', 'idol', 'butterfly', 'cardinal'];
const NEW_NAMES = { chromis: '青绿光鳃鱼', anthias: '金花鲈', gramma: '皇家伽玛', idol: '镰鱼', butterfly: '蝴蝶鱼', cardinal: '天竺鲷' };
const ORIGINAL_ORDER = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'turtle', 'manta', 'whaleshark'];
// 独立写出的字面量（不取自被测的物种表）：托盘按钮的顺序——群居小鱼、单条小鱼、大动物
const EXPECTED_IDS = ['neon', 'tang', 'chromis', 'anthias', 'clown', 'puffer', 'angel', 'gramma', 'idol', 'butterfly', 'cardinal', 'hammer', 'turtle', 'manta', 'whaleshark'];

test('物种表：共 15 种、id 唯一、顺序固定；原有 9 种之间的相对顺序不变，大动物排在最后', () => {
    const ids = Core.SPECIES.map(s => s.id);
    assert.deepEqual(ids, EXPECTED_IDS);
    assert.equal(new Set(ids).size, 15);
    assert.deepEqual(ids.filter(id => ORIGINAL_ORDER.includes(id)), ORIGINAL_ORDER);
    assert.deepEqual(ids.slice(-4), ['hammer', 'turtle', 'manta', 'whaleshark']);
});

test('新种：名称、群居/单条、存储版本、没有捕食关系与俯视标记、带 size 范围、体长不小于按比例换算、纵向带与色位合法', () => {
    for (const id of NEW_SPECIES) {
        const s = Core.speciesById(id);
        assert.ok(s, `${id} 在物种表里`);
        assert.equal(s.name, NEW_NAMES[id]);
        assert.equal(s.kind, id === 'chromis' || id === 'anthias' ? 'school' : 'solo', `${id} 的类别`);
        assert.equal(s.group, id === 'chromis' || id === 'anthias' ? 5 : 1, `${id} 的条数`);
        assert.equal(s.since, 2, `${id} 随存储版本 2 加入`);
        for (const key of ['diet', 'gape', 'top', 'hit']) assert.equal(s[key], undefined, `${id} 不应有 ${key}（新种不参与捕食，命中沿用默认椭圆）`);
        assert.deepEqual([...s.size], [0.75, 1.25]);
        assert.ok(s.len > 0 && s.speed > 0 && s.meters > 0 && s.half > 0 && s.half < 0.7, `${id} 数值合法`);
        assert.ok(s.len >= Math.round(s.meters * Core.PX_PER_M) - 1, `${id} 体长不小于按真实体长换算的像素`);
        assert.ok(s.band[0] >= 0 && s.band[1] <= 1 && s.band[0] < s.band[1], `${id} 纵向带`);
        assert.ok(s.colors.length === 2 && s.colors.every(c => Number.isInteger(c) && c >= 0 && c <= 7), `${id} 色位 0..7`);
        assert.ok(Object.isFrozen(s) && Object.isFrozen(s.band) && Object.isFrozen(s.colors), `${id} 冻结`);
    }
    for (const id of ORIGINAL_ORDER) assert.equal(Core.speciesById(id).since, undefined, `${id} 是最初的 9 种，没有 since`);
});

test('新种：不参与捕食（既不是猎物也不是捕食者），小锤头鲨登记的猎物仍只有原来的四种', () => {
    const Pred = require('../js/aquarium-predation-core.js');
    const prey = Core.SPECIES.filter(s => s.diet === 'prey').map(s => s.id);
    assert.deepEqual(prey, ['neon', 'tang', 'clown', 'angel']);
    assert.deepEqual(Core.SPECIES.filter(s => s.diet === 'predator').map(s => s.id), ['hammer']);
    const shark = Core.speciesById('hammer');
    for (const id of NEW_SPECIES) {
        assert.equal(Pred.canEat(shark, Core.speciesById(id)), false, `${id} 不会被小锤头鲨吃`);
        assert.equal(Pred.canEat(Core.speciesById(id), Core.speciesById('neon')), false, `${id} 也不吃别的鱼`);
    }
    for (const id of ['neon', 'tang', 'clown', 'angel']) assert.equal(Pred.canEat(shark, Core.speciesById(id)), true, `${id} 仍是猎物`);
    // 世界里新种的鱼真的出现了（不是空循环）：6 个条目 = 2 群 × 5 + 4 条单条
    const w = Core.createWorld({ width: W, height: H, random: seeded(), lowPower: false });
    Core.reconcile(w, [{ id: 'hh', species: 'hammer', addedAt: 1 }].concat(NEW_SPECIES.map((s, i) => ({ id: `n${i}`, species: s, addedAt: 2 + i }))), { instant: true });
    assert.equal(w.fish.filter(f => NEW_SPECIES.includes(f.species)).length, 14);
    assert.equal(w.fish.length, 15);
});

// ---- 画法 ----

const { SHAPES, drawFish } = Aquarium;
const FISH_PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];

/** 记录每一次调用、渐变及其色标、以及 fill/stroke/fillRect 当时的颜色与混合模式（与 aquarium-shapes.test.js 的 tracer 同一口径，多记渐变）。 */
function recorder(initial = 'screen') {
    const calls = []; const gradients = []; const trace = []; const stack = [];
    const state = { globalCompositeOperation: initial };
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key === '_gradients') return gradients;
            if (key === '_trace') return trace;
            if (key in target) return target[key];
            return (...args) => {
                const name = String(key);
                calls.push([name, args]);
                if (name === 'save') stack.push(target.globalCompositeOperation);
                else if (name === 'restore') { if (stack.length) target.globalCompositeOperation = stack.pop(); }
                else if (/^create(Linear|Radial)Gradient$/.test(name)) {
                    const g = { kind: name, args, stops: [], addColorStop(offset, color) { g.stops.push([offset, color]); } };
                    gradients.push(g);
                    return g;
                } else if (name === 'fill' || name === 'stroke' || name === 'fillRect') {
                    trace.push({ name, style: name === 'stroke' ? target.strokeStyle : target.fillStyle, composite: target.globalCompositeOperation, args, index: calls.length - 1 });
                }
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}
const countOf = (ctx, name) => ctx._calls.filter(([n]) => n === name).length;
const fishFor = (species, extra = {}) => Object.assign({ species, x: 200, y: 150, ang: 0, len: Core.speciesById(species).len * 3, z: 0.95, alpha: 1, phase: 1.1, turn: 0, flip: 1 }, extra);
const paint = (species, { extra = {}, lowPower = false, night = 0 } = {}) => {
    const ctx = recorder();
    drawFish(ctx, fishFor(species, extra), FISH_PALETTE, { amount: 0.9, night, lowPower });
    return ctx;
};
const rgbOf = style => { const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; };
const isDark = style => { const rgb = rgbOf(style); return !!rgb && rgb.every(v => v < 80); };

test('画法登记：14 种有卡通形状（15 减海龟）；新形状的站位半宽、尾型、特征字段合法', () => {
    assert.equal(Object.keys(SHAPES).length, 14);
    assert.equal(SHAPES.turtle, undefined);
    for (const id of NEW_SPECIES) {
        const shape = SHAPES[id];
        assert.ok(shape, `${id} 有卡通形状`);
        assert.equal(shape.half.length, 5);
        assert.ok(shape.half.every(v => Number.isFinite(v) && v > 0 && v < 0.5), `${id} 半宽`);
        assert.ok(['fork', 'round'].includes(shape.tail), `${id} 尾型（小鱼只用叉尾或圆尾）`);
        assert.ok(shape.tailLen > 0.1 && shape.tailLen < 0.5, `${id} 尾长`);
        assert.ok(Number.isFinite(shape.dorsal) && shape.dorsal >= 0 && shape.dorsal < 0.6, `${id} 背鳍高`);
    }
    assert.ok(typeof SHAPES.gramma.twoTone === 'number' && SHAPES.gramma.twoTone >= 0.2 && SHAPES.gramma.twoTone <= 0.8, '皇家伽玛的前后分界在 0.2–0.8');
    assert.equal(SHAPES.idol.bars.length, 2, '镰鱼两条黑带');
    assert.equal(SHAPES.butterfly.bars.length, 1, '蝴蝶鱼一条穿眼黑带');
    assert.equal(SHAPES.cardinal.bars.length, 1, '天竺鲷尾柄一道窄黑带');
    for (const id of ['idol', 'butterfly', 'cardinal']) {
        for (const [u, w] of SHAPES[id].bars) assert.ok(u > 0 && u < 1 && w > 0 && w < 0.3, `${id} 黑带 [${u}, ${w}]`);
        const us = SHAPES[id].bars.map(b => b[0]);
        assert.deepEqual([...us].sort((a, b) => a - b), us, `${id} 的黑带从头到尾排列`);
    }
    assert.equal(SHAPES.idol.sail, true, '镰鱼有背鳍长丝');
    for (const id of ORIGINAL_ORDER.filter(x => SHAPES[x])) for (const key of ['twoTone', 'bars', 'sail']) assert.equal(SHAPES[id][key], undefined, `原有的 ${id} 没有新特征 ${key}（旧种的每一笔不变）`);
});

test('画法：皇家伽玛近处用一条沿体长的水平渐变（头段一种颜色、尾段另一种、分界处过渡），远处与省流量平涂不建渐变', () => {
    const near = paint('gramma');
    const linear = near._gradients.filter(g => g.kind === 'createLinearGradient');
    assert.equal(linear.length, 1, '身体只有这一条线性渐变（没有竖向那条）');
    const [x0, y0, x1, y1] = linear[0].args;
    assert.ok(x0 > 0 && x1 < 0 && x0 === -x1 && y0 === 0 && y1 === 0, `水平、头→尾：${linear[0].args}`);
    const stops = linear[0].stops;
    assert.ok(stops.length >= 4, '头、前分界、后分界、尾');
    for (let i = 1; i < stops.length; i++) assert.ok(stops[i][0] >= stops[i - 1][0], '色标位置不递减');
    assert.ok(stops[0][0] === 0 && stops[stops.length - 1][0] === 1);
    const head = rgbOf(stops[0][1]); const tail = rgbOf(stops[stops.length - 1][1]);
    assert.ok(head[2] > tail[2] + 60 && tail[1] > head[1] + 60, `前半身偏冷（洋红）、后半身偏黄：${head} → ${tail}`);
    const cut = SHAPES.gramma.twoTone;
    assert.ok(stops.some(([o]) => Math.abs(o - (cut - 0.06)) < 1e-9) && stops.some(([o]) => Math.abs(o - (cut + 0.06)) < 1e-9), '分界两侧各 6% 的过渡');
    for (const ctx of [paint('gramma', { extra: { z: 0.3 } }), paint('gramma', { lowPower: true })]) {
        assert.equal(ctx._gradients.length, 0, '远处与省流量不建渐变');
        assert.equal(countOf(ctx, 'clip'), 0);
    }
    // 其他鱼的身体仍是竖向渐变（x 不变）
    const clown = paint('clown')._gradients.filter(g => g.kind === 'createLinearGradient');
    assert.equal(clown.length, 1);
    assert.equal(clown[0].args[0], 0);
});

test('画法：镰鱼、蝴蝶鱼与天竺鲷的黑带只画在身体里（一次裁剪）、深色在 source-over 下画；远处与省流量不画', () => {
    for (const id of ['idol', 'butterfly', 'cardinal']) {
        const ctx = paint(id);
        assert.equal(countOf(ctx, 'clip'), 1, `${id} 黑带按身体裁剪`);
        const dark = ctx._trace.filter(t => isDark(t.style));
        assert.ok(dark.length >= SHAPES[id].bars.length + 1, `${id}：每条黑带至少一次深色填充，再加眼睛（实际 ${dark.length}）`);
        for (const t of dark) assert.equal(t.composite, 'source-over', `${id} 的深色 ${t.name}(${t.style}) 在 ${t.composite} 下画会隐形`);
        const clipAt = ctx._calls.findIndex(([n]) => n === 'clip');
        const darkBand = ctx._calls.findIndex(([n], i) => i > clipAt && (n === 'fillRect' || n === 'fill'));
        assert.ok(clipAt >= 0 && darkBand > clipAt, `${id} 先裁剪再画黑带`);
        for (const far of [paint(id, { extra: { z: 0.3 } }), paint(id, { lowPower: true })]) {
            assert.equal(countOf(far, 'clip'), 0);
            assert.ok(far._trace.every(t => t.composite === 'screen'), `${id} 远处不画黑带与眼睛，也不改混合模式`);
        }
    }
    assert.equal(countOf(paint('gramma'), 'clip'), 0, '没有 bars 的新种不裁剪');
    assert.equal(countOf(paint('chromis'), 'clip'), 0);
    assert.equal(countOf(paint('anthias'), 'clip'), 0);
});

test('画法：镰鱼近处有一条白色背鳍长丝（曲线、向后飘出身体之外、高过身体），远处没有；蝴蝶鱼没有', () => {
    const idol = paint('idol');
    const spec = Core.speciesById('idol');
    const len = spec.len * 3;
    const whites = idol._trace.filter(t => t.name === 'stroke' && /^rgba\(255, 255, 255,/.test(t.style));
    assert.equal(whites.length, 1, '一条白色长丝');
    // 长丝是 moveTo + quadraticCurveTo + stroke：取这次 stroke 之前最近的曲线终点
    let curve = null;
    for (let i = whites[0].index - 1; i >= 0; i--) if (idol._calls[i][0] === 'quadraticCurveTo') { curve = idol._calls[i][1]; break; }
    assert.ok(curve, '用曲线画');
    const [, , endX, endY] = curve;
    assert.ok(endX < 0, `长丝向后飘到身体中点之后：x=${endX}`);
    assert.ok(endY < -SHAPES.idol.half[2] * len, `长丝比身体最宽处的上缘还高：y=${endY}`);
    assert.equal(paint('idol', { extra: { z: 0.3 } })._trace.filter(t => t.name === 'stroke' && /^rgba\(255, 255, 255,/.test(t.style)).length, 0, '远处没有长丝');
    assert.equal(paint('idol', { lowPower: true })._trace.filter(t => t.name === 'stroke' && /^rgba\(255, 255, 255,/.test(t.style)).length, 0, '省流量没有长丝');
    assert.equal(paint('butterfly')._trace.filter(t => t.name === 'stroke' && /^rgba\(255, 255, 255,/.test(t.style)).length, 0, '蝴蝶鱼没有长丝');
});

test('画法：6 个新种逐一画得出来（近处比远处多细节），每种都有眼睛（深色、source-over）', () => {
    for (const id of NEW_SPECIES) {
        const near = paint(id);
        const far = paint(id, { extra: { z: 0.3 } });
        assert.ok(near._calls.length > far._calls.length, `${id} 近处 ${near._calls.length} 对远处 ${far._calls.length}`);
        assert.ok(near._trace.some(t => isDark(t.style) && t.composite === 'source-over'), `${id} 近处有眼睛`);
        assert.ok(near._trace.some(t => t.composite === 'screen' && !isDark(t.style)), `${id} 身体与鳍在宿主的 screen 下画`);
    }
});

// ---------- Task 3：存储版本 2（回滚保护） ----------
// 只在名单里有新种时才写 v:2：这样退回旧版本（只认 v:1，看到别的版本号就“看不懂就不碰”）时，旧代码不会把带新种的名单读成空再覆盖掉。

const sEntry = (species, i = 0) => ({ id: `s${i}`, species, addedAt: 10 + i });

test('存储版本：STORAGE_VERSIONS 冻结为 [1, 2]；storageVersionOf——没有新种得 1，含任何新种得 2，坏条目与未知种不算', () => {
    assert.deepEqual([...Core.STORAGE_VERSIONS], [1, 2]);
    assert.ok(Object.isFrozen(Core.STORAGE_VERSIONS));
    assert.equal(Core.storageVersionOf([]), 1);
    assert.equal(Core.storageVersionOf(ORIGINAL_ORDER.map(sEntry)), 1, '最初的 9 种全在也是 1');
    for (const id of NEW_SPECIES) {
        assert.equal(Core.storageVersionOf([sEntry('neon', 0), sEntry(id, 1)]), 2, `含 ${id} 得 2`);
        assert.equal(Core.storageVersionOf([sEntry(id)]), 2);
    }
    for (const bad of [null, undefined, 'x', 7, {}, [null], [{}], [{ species: 'dragon' }], [5, 'gramma'], [{ species: 7 }]]) {
        assert.equal(Core.storageVersionOf(bad), 1, `${JSON.stringify(bad)} 得 1`);
    }
    assert.equal(Core.storageVersionOf([{ species: 'gramma' }]), 2, '只看物种，缺 id 与时间也算（调用方传的本来就是整理过的名单）');
});

test('存储：只有原有 9 种时写 v:1（键与旧版本完全一样）；放入新种那一下升到 v:2；新种全部捞出后回到 v:1', async () => {
    const t = await make({ stored: STORED });
    assert.deepEqual(await t.aq.add('puffer'), { ok: true });
    assert.deepEqual(Object.keys(t.fc.state.data[KEY]).sort(), ['fish', 'v'], '没有多余的键');
    assert.equal(t.fc.state.data[KEY].v, 1, '只有原有物种：仍是 v:1，旧版本照常读写');
    assert.deepEqual(await t.aq.add('gramma'), { ok: true });
    assert.equal(t.fc.state.data[KEY].v, 2, '名单里有新种：v:2');
    assert.deepEqual(await t.aq.add('idol'), { ok: true });
    assert.equal(t.fc.state.data[KEY].v, 2);
    const ids = t.aq.entries().filter(e => e.species === 'gramma' || e.species === 'idol').map(e => e.id);
    assert.equal(ids.length, 2);
    assert.deepEqual(await t.aq.remove(ids[0]), { ok: true });
    assert.equal(t.fc.state.data[KEY].v, 2, '还剩一种新种，仍是 v:2');
    assert.deepEqual(await t.aq.remove(ids[1]), { ok: true });
    assert.equal(t.fc.state.data[KEY].v, 1, '新种全走了：回到 v:1，旧版本可以再读');
    assert.ok(t.fc.state.data[KEY].fish.every(e => !NEW_SPECIES.includes(e.species)));
    assert.equal(t.fc.state.data[KEY].fish.length, 4, '原有的 3 条 + 河豚，一条没丢');
});

test('存储：v:2 的数据读得出新种且读取阶段不写；版本号只在写入时按名单内容重算（v:1 里夹带新种也认，下次写入升为 v:2）', async () => {
    const stored2 = { v: 2, fish: [{ id: 'g1', species: 'gramma', addedAt: 1 }, { id: 'n1', species: 'neon', addedAt: 2 }] };
    const t = await make({ stored: stored2 });
    assert.deepEqual(t.aq.entries().map(e => e.species), ['gramma', 'neon']);
    assert.equal(t.fc.state.sets.length, 0, '读取阶段绝不写存储');
    t.frame();
    assert.equal(t.aq._world().fish.filter(f => f.species === 'gramma').length, 1, '世界里真的有这条新种的鱼');

    const odd = { v: 1, fish: [{ id: 'k1', species: 'butterfly', addedAt: 1 }] };
    const u = await make({ stored: odd });
    assert.deepEqual(u.aq.entries().map(e => e.species), ['butterfly'], '看物种表，不看版本号');
    assert.equal(u.fc.state.sets.length, 0);
    assert.deepEqual(await u.aq.add('clown'), { ok: true });
    assert.equal(u.fc.state.data[KEY].v, 2, '写入时按内容重算');
    assert.deepEqual(u.fc.state.data[KEY].fish.map(e => e.species), ['butterfly', 'clown']);
});

test('存储：v 是别的数字（3、99、0、-1、1.5）一律是看不懂的版本——放入/捞出都拒绝、不写、原数据原样；v:2 不再算未来版本', async () => {
    for (const v of [3, 99, 0, -1, 1.5]) {
        const future = { v, fish: [{ id: 'c1', species: 'clown', addedAt: 1 }, { id: 'g1', species: 'gramma', addedAt: 2 }], extra: 'x' };
        const t = await make({ stored: future });
        assert.deepEqual(t.aq.entries(), [], `v:${v} 当空`);
        assert.deepEqual(await t.aq.add('neon'), { ok: false, reason: 'storage' }, `v:${v} 拒绝放入`);
        assert.deepEqual(await t.aq.add('gramma'), { ok: false, reason: 'storage' });
        assert.deepEqual(await t.aq.remove('c1'), { ok: false, reason: 'storage' }, `v:${v} 拒绝捞出`);
        assert.equal(t.fc.state.sets.length, 0, `v:${v} 不写存储`);
        assert.deepEqual(t.fc.state.data[KEY], future, `v:${v} 原数据原样`);
    }
    const fine = await make({ stored: { v: 2, fish: [] } });
    assert.deepEqual(await fine.aq.add('neon'), { ok: true }, 'v:2 可以放入');
    assert.equal(fine.fc.state.data[KEY].v, 1, '空名单里只放了霓虹灯鱼：写回 v:1');
});

// ---------- Task 5：托盘高度、设置页文案、版本钉子 ----------

test('托盘：.aq-panel 限高并可滚动——面板底边就是 .aq-ui 的底边（离视口底 130px），再留 24px 余量；15 个按钮在低窗口里不会顶出屏幕', () => {
    const css = read('css/aquarium.css');
    const panel = /\.aq-panel \{([^}]*)\}/.exec(css);
    const ui = /\.aq-ui \{([^}]*)\}/.exec(css);
    assert.ok(panel && ui, '有 .aq-panel 与 .aq-ui 规则');
    assert.match(ui[1], /position: fixed;/);
    assert.match(ui[1], /bottom: 130px;/);
    assert.match(panel[1], /position: absolute;/);
    assert.match(panel[1], /bottom: 0;/, '面板底边贴着 .aq-ui 的底边');
    assert.match(panel[1], /max-height: calc\(100vh - 154px\);/, '154 = 130（.aq-ui 的 bottom）+ 24（上方余量）');
    assert.match(panel[1], /overflow-y: auto;/);
    // 隐藏时仍然不占位（旧规则不变）
    assert.match(css, /\.aq-panel\[hidden\] \{ display: none; \}/);
});

test('设置页：“水族馆小鱼”按托盘顺序写出全部 15 个名字；“大鱼吃小鱼”写明新增的 6 种与河豚、海龟、蝠鲼、鲸鲨一样不参与；都不把美术取值叫“真实体长”', () => {
    const html = read('settings.html');
    const fishHint = /<span class="sp-field-label">水族馆小鱼<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html)[1];
    let at = -1;
    for (const spec of Core.SPECIES) {
        const i = fishHint.indexOf(spec.name);
        assert.ok(i > at, `${spec.name} 要按托盘顺序出现在“水族馆小鱼”的说明里（位置 ${i}，前一个 ${at}）`);
        at = i;
    }
    assert.ok(fishHint.includes(`最多 ${P.MAX_ENTRIES} 个`), '条目上限没变');

    const preyHint = /<span class="sp-field-label">大鱼吃小鱼<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html)[1];
    for (const id of NEW_SPECIES) assert.ok(preyHint.includes(NEW_NAMES[id]), `“大鱼吃小鱼”的说明里要写明 ${NEW_NAMES[id]} 不参与`);
    assert.match(preyHint, /青绿光鳃鱼、金花鲈、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷[^。，；]{0,6}不参与/, '6 个新种与“不参与”在同一句里');
    assert.match(preyHint, /只吃霓虹灯鱼、蓝吊、小丑鱼和神仙鱼/, '被吃的仍只有原来的四种');

    for (const [name, text] of [['水族馆小鱼', fishHint], ['大鱼吃小鱼', preyHint], ['个体大小差异', /<span class="sp-field-label">个体大小差异<\/span><span class="sp-field-hint">([\s\S]*?)<\/span>/.exec(html)[1]]]) {
        assert.doesNotMatch(text, /真实体长|真实大小|按真实体长/, `“${name}”的说明不能把美术取值说成真实体长`);
    }
});

test('版本钉子：index.html 与 settings.html 的脚本与样式版本随改动递增（旧缓存不会让用户看到半新半旧），加载顺序仍是 核心 → 控制器 → 宿主', () => {
    const index = read('index.html');
    const settings = read('settings.html');
    const pins = ['js/aquarium-core.js?v=8', 'js/aquarium.js?v=9', 'css/aquarium.css?v=7', 'js/background-experience.js?v=21'];
    for (const pin of pins) assert.ok(index.includes(pin), `index.html 要有 ${pin}`);
    assert.ok(settings.includes('js/settings-page.js?v=20'), 'settings.html 要有 settings-page.js?v=20');
    for (const old of ['js/aquarium-core.js?v=7', 'js/aquarium.js?v=8', 'css/aquarium.css?v=6', 'js/background-experience.js?v=20']) assert.ok(!index.includes(old), `index.html 不应再有 ${old}`);
    assert.ok(!settings.includes('js/settings-page.js?v=19'), 'settings.html 不应再有 settings-page.js?v=19');
    const pos = pin => index.indexOf(pin);
    assert.ok(pos('js/aquarium-core.js?v=8') < pos('js/aquarium.js?v=9'), '核心先于控制器');
    assert.ok(pos('js/aquarium.js?v=9') < pos('js/background-experience.js?v=21'), '控制器先于宿主');
});
