// 水族馆世界层里“被吃与补回”要用到的原语（2026-10-19）：物种的饮食表、consume（吞下一条鱼并登记空缺）、
// 空缺到期后从屏幕边缘补回一条、reconcile/dismiss 与空缺的配合、捕食者的目标点 goal（追击、放慢、加速）。
// 谁追谁、什么时候冲刺、命中概率这些规则在 aquarium-predation-core.test.js；这里只守住核心提供的零件，
// 以及“没有目标点、没有空缺时核心与改动之前逐位一致”（黄金轨迹由 aquarium-core.test.js 守住，这里再加两条对照）。
// 数字取自这台机器上的种子化模拟（脚本在 /tmp，不入库）。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');

const P = Core.PARAMS;
const W = 1280;
const H = 720;
const FPS = 60;
const DT = 1000 / FPS;

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
const entry = (species, patch = {}) => Object.assign({ id: `p${++seq}`, species, addedAt: 1000 + seq }, patch);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: W, height: H, random: seeded(), lowPower: false }, extra));
const run = (w, seconds, input = {}, fps = FPS) => {
    const n = Math.round(seconds * fps);
    for (let i = 0; i < n; i++) Core.step(w, 1000 / fps, input);
};
const mates = (w, e) => w.fish.filter(f => f.entry === e.id && f.state !== 'leaving');
const setup = (species, seed = 3, settle = 0.5) => {
    const e = entry(species);
    const w = world({ random: seeded(seed) });
    Core.reconcile(w, [e], { instant: true });
    run(w, settle);
    return { w, e, f: w.fish[0] };
};

// ---------- 物种表 ----------

test('物种表的饮食：只有小锤头鲨是捕食者（gape 0.3），霓虹灯鱼、蓝吊、小丑鱼、神仙鱼是猎物，河豚、海龟、蝠鲼、鲸鲨与 6 种新小鱼什么都不是', () => {
    const expected = { neon: 'prey', tang: 'prey', clown: 'prey', angel: 'prey', hammer: 'predator' };      // 独立的字面量：不从被测表里推
    assert.equal(Core.SPECIES.length, 15, '2026-10-23 有意更新：9 → 15（新种没有 diet，expected 里查不到就必须是 undefined）');
    for (const s of Core.SPECIES) {
        assert.equal(s.diet, expected[s.id], `${s.id}.diet`);
        if (s.id === 'hammer') assert.equal(s.gape, 0.3, '小锤头鲨只吃自己体长三成以内的鱼');
        else assert.equal(s.gape, undefined, `${s.id} 不该有 gape`);
    }
});

test('新建的世界没有空缺，而且每个世界各有一份', () => {
    const a = world();
    const b = world();
    assert.ok(Array.isArray(a.vacancies) && a.vacancies.length === 0);
    assert.notEqual(a.vacancies, b.vacancies);
});

// ---------- consume ----------

test('consume：存活的鱼被吞下——进入 leaving、被标记为 eaten、落点是传入点的副本、登记一个到期时间 = 现在 + 延迟的空缺', () => {
    const { w, f, e } = setup('clown');
    const to = { x: 400, y: 300 };
    const t0 = w.time;
    assert.equal(Core.consume(w, f, to, 75), true);
    assert.equal(f.state, 'leaving');
    assert.equal(f.eaten, true);
    assert.equal(f.held, null);
    assert.equal(f.scoopT, 0);
    assert.equal(f.leaveS, P.EAT_S);
    assert.deepEqual(f.leaveTo, to);
    assert.notEqual(f.leaveTo, to, '落点是副本，传入的对象之后被改动不会影响这条鱼');
    assert.equal(w.vacancies.length, 1);
    assert.deepEqual(w.vacancies[0], { entry: e.id, species: 'clown', due: t0 + 75 });
});

test('consume：不是存活的鱼、落点或延迟不合法、空缺已满时什么都不改，返回 false', () => {
    const { w, f } = setup('clown');
    const other = setup('clown', 9).f;
    const snap = () => JSON.stringify({ fish: w.fish, vacancies: w.vacancies });
    const before = snap();
    const to = { x: 400, y: 300 };
    for (const [label, args] of [
        ['没有这条鱼', [null, to, 5]],
        ['不是这个世界里的鱼', [other, to, 5]],
        ['落点缺失', [f, null, 5]],
        ['落点不是有限数', [f, { x: NaN, y: 1 }, 5]],
        ['落点缺 y', [f, { x: 1 }, 5]],
        ['落点无穷', [f, { x: Infinity, y: 1 }, 5]],
        ['延迟为 0', [f, to, 0]],
        ['延迟为负', [f, to, -3]],
        ['延迟不是数', [f, to, NaN]],
        ['延迟无穷', [f, to, Infinity]],
        ['延迟是字符串', [f, to, '5']],
        ['延迟缺失', [f, to, undefined]],
    ]) {
        assert.equal(Core.consume(w, ...args), false, label);
        assert.equal(snap(), before, `${label}：不能改任何东西`);
    }
    for (const state of ['entering', 'leaving', 'held']) {        // 刚放进来的、已经在被捞起或吞下的、被抓着的都不能吃
        f.state = state;
        assert.equal(Core.consume(w, f, to, 5), false, `${state} 的鱼不会被吃`);
        assert.equal(w.vacancies.length, 0);
    }
});

test(`consume：同时等着补回的空缺最多 ${P.MAX_VACANCIES} 个，满了之后第 ${P.MAX_VACANCIES + 1} 条吃不了、鱼保持原样`, () => {
    const w = world({ random: seeded(5) });
    const entries = [entry('neon'), entry('neon'), entry('neon'), entry('tang')];
    Core.reconcile(w, entries, { instant: true });
    run(w, 0.5);
    const fish = w.fish.filter(f => f.state === 'alive');
    assert.ok(fish.length > P.MAX_VACANCIES + 1);
    for (let i = 0; i < P.MAX_VACANCIES; i++) assert.equal(Core.consume(w, fish[i], { x: 10, y: 10 }, 25), true, `第 ${i + 1} 条`);
    const next = fish[P.MAX_VACANCIES];
    assert.equal(Core.consume(w, next, { x: 10, y: 10 }, 25), false);
    assert.equal(next.state, 'alive');
    assert.equal(w.vacancies.length, P.MAX_VACANCIES);
});

test('被吃的鱼：EAT_S 内被收向落点并淡出，之后从世界里清掉；被网兜捞起仍然是 SCOOP_S（吞下与捞起共用同一条路径，只有时长不同）', () => {
    const { w, f } = setup('clown');
    f.x = 200; f.y = 300; f.vx = 0; f.vy = 0;
    const to = { x: 500, y: 320 };
    const d0 = Math.hypot(to.x - f.x, to.y - f.y);
    assert.equal(Core.consume(w, f, to, 75), true);
    let gone = null;
    let lastAlpha = f.alpha;
    for (let i = 1; i <= Math.round(FPS * 0.6); i++) {
        Core.step(w, DT);
        const t = i / FPS;
        if (!w.fish.includes(f)) { gone = t; break; }
        assert.ok(f.alpha <= lastAlpha + 1e-9, `淡出时 alpha 不会回升（${t.toFixed(2)} s）`);
        lastAlpha = f.alpha;
        if (t <= 0.1) assert.equal(f.alpha, 1, '前三分之一时间保持清晰');
    }
    assert.ok(gone !== null && gone > P.EAT_S * 0.8 && gone < P.EAT_S + 0.1, `被吃的鱼约在 ${P.EAT_S} 秒后消失，实际 ${gone}`);
    assert.ok(Math.hypot(to.x - f.x, to.y - f.y) < d0 * 0.4, '消失之前已经被收到落点附近');
    assert.equal(f.alpha, 0);

    const net = setup('clown', 4);
    net.f.x = 200; net.f.y = 300;
    Core.dismiss(net.w, net.e.id, { to: { x: 500, y: 320 } });
    run(net.w, 0.5);
    assert.ok(net.w.fish.includes(net.f), `网兜捞起仍要约 ${P.SCOOP_S} 秒：0.5 秒时还没消失`);
    run(net.w, 0.2);
    assert.ok(!net.w.fish.includes(net.f), '0.7 秒时已经消失');
});

// ---------- 补回 ----------

test('补回：成群的鱼到期后从屏幕边缘游进来一条（同条目、同种类、淡入、高度在群的家附近），不早也不晚，空缺随之清掉', () => {
    const { w, e } = setup('neon', 11);
    const group = Core.speciesById('neon').group;
    assert.equal(mates(w, e).length, group);
    const victim = w.fish[0];
    const t0 = w.time;
    assert.equal(Core.consume(w, victim, { x: victim.x, y: victim.y }, 25), true);
    run(w, 24.5);
    assert.equal(w.vacancies.length, 1, '还没到期');
    assert.equal(mates(w, e).length, group - 1);
    let born = null;
    for (let i = 0; i < FPS * 1.5 && !born; i++) {
        const before = w.fish.length;
        Core.step(w, DT);
        if (w.fish.length > before) born = w.fish[w.fish.length - 1];
    }
    assert.ok(born, '到期后补回一条');
    assert.ok(Math.abs(w.time - (t0 + 25)) < 0.1, `在 25 秒左右补回，实际 ${(w.time - t0).toFixed(2)}`);
    assert.equal(born.entry, e.id);
    assert.equal(born.species, 'neon');
    assert.equal(born.state, 'entering');
    assert.equal(born.alpha, 0);
    assert.ok(born.x < 0 || born.x > W, `从屏幕外游进来：x=${born.x.toFixed(1)}`);
    assert.ok(Math.abs(born.y - w.groups[e.id].hy) <= P.REFILL_Y_SPREAD * w.scale / 2 + 1e-6 || born.y === 0 || born.y === H, '高度在群的家附近');
    assert.equal(w.vacancies.length, 0);
    assert.equal(new Set(w.fish.map(f => f.id)).size, w.fish.length, 'id 不重复');
    run(w, P.ENTER_S + 0.2);
    assert.equal(born.state, 'alive');
    run(w, 20);
    assert.equal(mates(w, e).length, group, '群又齐了');
    assert.ok(born.x >= 0 && born.x <= W && born.y >= 0 && born.y <= H, `补回的鱼游进了画面：(${born.x.toFixed(0)}, ${born.y.toFixed(0)})`);
});

test('补回：每一步最多补一条，几个空缺同时到期也是逐帧一条', () => {
    const { w, e } = setup('neon', 12);
    for (let i = 0; i < 3; i++) w.vacancies.push({ entry: e.id, species: 'neon', due: 0 });
    const counts = [w.fish.length];
    for (let i = 0; i < 4; i++) { Core.step(w, DT); counts.push(w.fish.length); }
    assert.deepEqual(counts, [5, 6, 7, 8, 8]);
    assert.equal(w.vacancies.length, 0);
});

test('补回：群的家已经不在（条目被捞出）、种类不认识的空缺直接丢弃，什么都不生成', () => {
    const { w, e } = setup('neon', 13);
    const n = w.fish.length;
    w.vacancies.push({ entry: 'nobody', species: 'neon', due: 0 }, { entry: e.id, species: 'dragon', due: 0 });
    run(w, 0.1);
    assert.equal(w.fish.length, n);
    assert.equal(w.vacancies.length, 0);
    assert.equal(Core.enterOne(w, 'nobody', 'neon'), false);
    assert.equal(Core.enterOne(w, e.id, 'dragon'), false);
});

test('被吃光的单条鱼：补员之前反复 reconcile 不会把它当成新条目立刻重新生成（空缺算数），到期才回来一条，之后也不会重复', () => {
    const { w, e, f } = setup('clown', 14);
    const entries = [e];
    assert.equal(Core.consume(w, f, { x: f.x, y: f.y }, 75), true);
    for (let second = 0; second < 74; second++) {
        Core.reconcile(w, entries);
        run(w, 1);
        assert.equal(mates(w, e).length, 0, `${second + 1} 秒时不该有鱼`);
    }
    run(w, 1.2);
    assert.equal(mates(w, e).length, 1, '到期补回一条');
    Core.reconcile(w, entries);
    Core.reconcile(w, entries);
    assert.equal(mates(w, e).length, 1, '再 reconcile 不会多出一条');
    assert.equal(w.vacancies.length, 0);
});

test('条目被捞出：它的空缺一并作废，群的家也不留；有活鱼的条目走 dismiss，没有活鱼只剩空缺的条目走 reconcile，二者都不会再补回', () => {
    const a = setup('neon', 15);
    assert.equal(Core.consume(a.w, a.f, { x: a.f.x, y: a.f.y }, 25), true);
    Core.dismiss(a.w, a.e.id);
    assert.equal(a.w.vacancies.length, 0);
    assert.equal(a.w.groups[a.e.id], undefined);
    run(a.w, 40);
    assert.equal(a.w.fish.length, 0, '捞出的条目不会被补回');

    const b = setup('clown', 16);
    assert.equal(Core.consume(b.w, b.f, { x: b.f.x, y: b.f.y }, 75), true);
    run(b.w, 1);
    Core.reconcile(b.w, []);
    assert.equal(b.w.vacancies.length, 0);
    assert.equal(b.w.groups[b.e.id], undefined, '没有活鱼的条目被移除时，群的家也被丢掉');
    run(b.w, 80);
    assert.equal(b.w.fish.length, 0);

    const c = setup('clown', 17);                               // 条目还在名单里：空缺保留
    assert.equal(Core.consume(c.w, c.f, { x: c.f.x, y: c.f.y }, 75), true);
    Core.reconcile(c.w, [c.e]);
    assert.equal(c.w.vacancies.length, 1);
    assert.ok(c.w.groups[c.e.id]);
});

// ---------- 目标点 goal ----------

const simulate = (seed, goalOf, seconds, { species = 'clown', setupFish = null, input = {} } = {}) => {
    const { w, f } = setup(species, seed, 0);
    if (setupFish) setupFish(f, w);
    const trace = [];
    for (let i = 0; i < Math.round(seconds * FPS); i++) {
        if (goalOf) f.goal = goalOf(f, w, i / FPS);
        Core.step(w, DT, input);
        trace.push({ x: f.x, y: f.y, vx: f.vx, vy: f.vy, sp: Math.hypot(f.vx, f.vy) });
    }
    return { w, f, trace };
};
const placeLeft = (f, w) => { f.x = W * 0.2; f.y = H * 0.6; f.vx = 0; f.vy = 0; f.ang = 0; f.flip = 1; f.flipTo = 1; };

test('目标点缺失或不合法时，核心与没有目标点逐位一致（捕食关闭 = 与改动之前同一条轨迹）', () => {
    const base = simulate(21, null, 6);
    for (const bad of [
        { x: NaN, y: 100, w: 2, boost: 1 }, { x: 100, y: Infinity, w: 2, boost: 1 }, { x: 100, y: 100, w: '2', boost: 1 },
        { x: 100, y: 100, w: 2 }, { x: 100, y: 100, boost: 1 }, { x: 100, y: 100, w: 2, boost: NaN }, 'goal', 7,
    ]) {
        const got = simulate(21, () => (typeof bad === 'object' ? Object.assign({}, bad) : bad), 6);
        assert.deepEqual(got.trace[got.trace.length - 1], base.trace[base.trace.length - 1], `${JSON.stringify(bad)} 被忽略`);
        assert.ok(got.trace.every((p, i) => p.x === base.trace[i].x && p.y === base.trace[i].y), `${JSON.stringify(bad)}：逐帧一致`);
    }
});

test('目标点只作用于游着的鱼：刚放进来（entering）的鱼忽略它', () => {
    const { w, f } = setup('clown', 22, 0);
    const plain = setup('clown', 22, 0);
    f.state = 'entering'; f.alpha = 0; f.t = 0;
    plain.f.state = 'entering'; plain.f.alpha = 0; plain.f.t = 0;
    for (let i = 0; i < FPS; i++) {
        f.goal = { x: W - 50, y: 50, w: 3, boost: 4 };
        Core.step(w, DT);
        Core.step(plain.w, DT);
    }
    assert.equal(f.x, plain.f.x);
    assert.equal(f.y, plain.f.y);
});

test('目标点 w > 0：把鱼拉向目标，比没有目标点时更快地靠近', () => {
    for (const seed of [31, 32, 33, 34, 35]) {
        const goal = () => ({ x: W * 0.85, y: H * 0.6, w: 2.2, boost: 1.3 });
        const chase = simulate(seed, goal, 4, { setupFish: placeLeft });
        const calm = simulate(seed, null, 4, { setupFish: placeLeft });
        const gain = chase.f.x - W * 0.2;
        assert.ok(gain > 120, `种子 ${seed}：4 秒向目标前进 ${gain.toFixed(0)} px`);
        assert.ok(chase.f.x > calm.f.x + 40, `种子 ${seed}：比没有目标点多走 ${(chase.f.x - calm.f.x).toFixed(0)} px`);
    }
});

test('目标点 boost：期望速度按倍数放大、速度上限同时放宽，超过 GOAL_BOOST_MAX 的夹回去；boost 小于 1 时放慢', () => {
    const speedWith = boost => {
        const { f, trace } = simulate(41, () => ({ x: W * 0.95, y: H * 0.6, w: 2.2, boost }), 2.5, { setupFish: (fish, world) => { placeLeft(fish, world); fish.x = W * 0.1; } });
        const tail = trace.slice(-30);
        return { mean: tail.reduce((s, p) => s + p.sp, 0) / tail.length, max: Math.max(...trace.map(p => p.sp)), cruise: Core.cruiseSpeed(simulate(41, null, 0).w, f) };
    };
    const base = speedWith(1);
    const fast = speedWith(3);
    const crazy = speedWith(50);
    assert.ok(fast.mean > base.mean * 2, `boost 3：${fast.mean.toFixed(0)} px/s 对 ${base.mean.toFixed(0)}`);
    assert.ok(crazy.max <= P.GOAL_BOOST_MAX * crazy.cruise * 1.02, `boost 50 被夹在 ${P.GOAL_BOOST_MAX} 倍巡航速度以内：${crazy.max.toFixed(0)} px/s ≤ ${(P.GOAL_BOOST_MAX * crazy.cruise).toFixed(0)}`);
    const slow = simulate(42, () => ({ x: 0, y: 0, w: 0, boost: 0.6 }), 6);
    const calm = simulate(42, null, 6);
    const mean = t => t.slice(-180).reduce((s, p) => s + p.sp, 0) / 180;
    const ratio = mean(slow.trace) / mean(calm.trace);
    assert.ok(ratio > 0.4 && ratio < 0.85, `w=0、boost 0.6：速度是平时的 ${ratio.toFixed(2)} 倍`);
});

test('目标点 accel：加速度越大，速度越快到位（夹在 GOAL_ACCEL_MAX 以内）', () => {
    const settle = accel => {
        const { trace } = simulate(51, () => ({ x: W * 0.95, y: H * 0.6, w: 2.2, boost: 3, accel }), 4, { setupFish: (f, w) => { placeLeft(f, w); f.x = W * 0.1; } });
        const target = Math.max(...trace.map(p => p.sp)) * 0.5;
        return trace.findIndex(p => p.sp >= target) / FPS;
    };
    const slow = settle(1);
    const quick = settle(3);
    assert.ok(quick < slow * 0.7, `accel 3 到位 ${quick.toFixed(2)} s，accel 1 ${slow.toFixed(2)} s`);
    const capped = settle(100);
    assert.ok(Math.abs(capped - settle(P.GOAL_ACCEL_MAX)) < 1e-9, 'accel 夹在上限');
});

test('正在追击的鱼（w > 0）不被饲料改道；w = 0 只改速度，饲料照样拉它', () => {
    const feed = { x: W * 0.1, y: H * 0.6, reach: 5000, weight: 2, boost: 2 };
    const chase = simulate(61, () => ({ x: W * 0.9, y: H * 0.6, w: 2.2, boost: 1.3 }), 3, { setupFish: (f, w) => { placeLeft(f, w); f.x = W * 0.5; }, input: { attractors: [feed] } });
    assert.ok(chase.f.x > W * 0.5 + 40, `追击中朝目标走：${chase.f.x.toFixed(0)}`);
    const yielding = simulate(61, () => ({ x: W * 0.9, y: H * 0.6, w: 0, boost: 1.3 }), 3, { setupFish: (f, w) => { placeLeft(f, w); f.x = W * 0.5; }, input: { attractors: [feed] } });
    assert.ok(yielding.f.x < W * 0.5 - 40, `w = 0 时还是被饲料拉走：${yielding.f.x.toFixed(0)}`);
});

// ---------- 变异检查补强（2026-10-20）：出生状态、边界、渐隐与目标点的量化 ----------
// 前一轮系统变异检查里这些地方的变异体存活：补回时鱼的位置/方向/深度/速度没有逐项钉死、时间边界没有踩在等号上、
// 被吞下去的渐隐只看了“有没有”、目标点的权重/下限/上限只看了方向。这里按规则逐项写出期望值（独立于被测代码的算式）。

/** 按顺序给出预设的随机数：取多了立刻失败，每个用例末尾核对“恰好取了这么多个”（取数顺序也是合同的一部分）。 */
const scripted = values => {
    let i = 0;
    const next = () => { assert.ok(i < values.length, `随机数只准备了 ${values.length} 个，被多取了`); return values[i++]; };
    next.used = () => i;
    return next;
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}：${a} ≠ ${b}`);

test('补回的出生状态（右侧入场、没有同伴）：位置在右边缘外 0.3 倍体长、高度在群的家附近、朝左游、速度按视口缩放、深度取随机基准加抖动，状态是 entering 且完全透明', () => {
    const rnd = scripted([0.25, 0.9, 0.2, 0.75, 0.9, 0.3, 0.6]);           // 深度基准、深度抖动、左右、高度抖动、角度抖动、相位、种子
    const w = Core.createWorld({ width: W, height: H, random: rnd });
    w.scale = 1.5;
    w.nextId = 40;
    w.groups.g1 = { hx: 600, hy: 300, next: 0, wp: 0 };
    assert.equal(Core.enterOne(w, 'g1', 'clown'), true);
    assert.equal(rnd.used(), 7);
    const spec = Core.speciesById('clown');
    const z = P.Z_MIN + (P.Z_MAX - P.Z_MIN) * 0.25 + (0.9 - 0.5) * 0.2;
    const len = spec.len * 1.5 * (1 - P.Z_SIZE + P.Z_SIZE * z);
    const angle = Math.PI + (0.9 - 0.5) * 0.5;
    const speed = spec.speed * 1.5;
    assert.equal(w.fish.length, 1);
    assert.equal(w.nextId, 41);
    const f = w.fish[0];
    // 2026-10-23 有意更新：鱼多了个体大小字段 size（世界没开 sizes 时恒为 1，与其余字段的值一字不变，见 aquarium-variety.test.js）
    assert.deepEqual(Object.keys(f).sort(), ['alpha', 'ang', 'cooldown', 'entry', 'flip', 'flipTo', 'glide', 'held', 'id', 'len', 'phase', 'seed', 'size', 'species', 'state', 't', 'turn', 'vx', 'vy', 'x', 'y', 'z']);
    assert.equal(f.size, 1);
    near(f.x, W + len * 0.3, 'x');
    near(f.y, 300 + (0.75 - 0.5) * P.REFILL_Y_SPREAD * 1.5, 'y');
    near(f.vx, Math.cos(angle) * speed, 'vx');
    near(f.vy, Math.sin(angle) * speed, 'vy');
    near(f.ang, angle, 'ang');
    near(f.z, z, 'z');
    near(f.len, len, 'len');
    near(f.phase, 0.3 * 2 * Math.PI, 'phase');
    near(f.seed, 0.6, 'seed');
    assert.deepEqual([f.id, f.entry, f.species, f.t, f.alpha, f.state, f.held, f.cooldown, f.turn, f.glide, f.flip, f.flipTo], [40, 'g1', 'clown', 0, 0, 'entering', null, 0, 0, 0, -1, -1]);
});

test('补回的出生状态（左侧入场、边界）：随机数恰好 0.5 算左边；位置在左边缘外 0.3 倍体长、朝右游；高度夹在 0…画面高度之内', () => {
    const left = (hy, yDraw) => {
        const rnd = scripted([0.8, 0.5, 0.5, yDraw, 0.1, 0.5, 0.5]);
        const w = Core.createWorld({ width: W, height: H, random: rnd });
        w.scale = 1.5;
        w.groups.g1 = { hx: 600, hy, next: 0, wp: 0 };
        assert.equal(Core.enterOne(w, 'g1', 'clown'), true);
        assert.equal(rnd.used(), 7);
        return w.fish[0];
    };
    const f = left(300, 0.5);
    near(f.x, -f.len * 0.3, '左边缘外 0.3 倍体长');
    near(f.ang, (0.1 - 0.5) * 0.5, '角度 = 0 + 抖动');
    assert.equal(f.flip, 1);
    assert.equal(f.flipTo, 1);
    assert.ok(f.vx > 0, '朝右游');
    near(f.y, 300, '抖动为 0 时正好在群的家的高度');
    assert.equal(left(5, 0).y, 0, '上沿夹到 0（不是 1）');
    assert.equal(left(H - 3, 1).y, H, '下沿夹到画面高度');
    near(left(300, 0).y, 300 - 0.5 * P.REFILL_Y_SPREAD * 1.5, '没夹到时按“−0.5×幅度×缩放”');
});

test('补回的出生状态（深度）：同群还活着的鱼的深度取平均（离开中的、别的条目的不算），再加 ±0.1 抖动，夹在深度范围内；此时少取一个随机数', () => {
    const rnd = scripted([0.9, 0.3, 0.5, 0.5, 0.5, 0.5]);                   // 深度抖动、左右、高度抖动、角度抖动、相位、种子（有同伴时不取深度基准）
    const w = Core.createWorld({ width: W, height: H, random: rnd });
    w.groups.g1 = { hx: 600, hy: 300, next: 0, wp: 0 };
    const mate = (id, entry, z, state = 'alive') => ({ id, entry, species: 'clown', z, state, x: 100, y: 100, vx: 0, vy: 0, ang: 0, len: 30, alpha: 1 });
    w.fish.push(mate(1, 'g1', 0.5), mate(2, 'g1', 0.7), mate(3, 'g1', 0.99, 'leaving'), mate(4, 'other', 0.4));
    w.nextId = 10;
    assert.equal(Core.enterOne(w, 'g1', 'clown'), true);
    assert.equal(rnd.used(), 6);
    near(w.fish[4].z, 0.6 + (0.9 - 0.5) * 0.2, '同群活着的两条的平均 0.6 + 抖动');
    const high = Core.createWorld({ width: W, height: H, random: scripted([1, 0.9, 0.5, 0.5, 0.5, 0.5]) });
    high.groups.g1 = { hx: 600, hy: 300, next: 0, wp: 0 };
    high.fish.push(mate(1, 'g1', 0.98));
    Core.enterOne(high, 'g1', 'clown');
    assert.equal(high.fish[1].z, P.Z_MAX, '上限夹到 Z_MAX');
    const low = Core.createWorld({ width: W, height: H, random: scripted([0, 0.9, 0.5, 0.5, 0.5, 0.5]) });
    low.groups.g1 = { hx: 600, hy: 300, next: 0, wp: 0 };
    low.fish.push(mate(1, 'g1', P.Z_MIN + 0.01));
    Core.enterOne(low, 'g1', 'clown');
    assert.equal(low.fish[1].z, P.Z_MIN, '下限夹到 Z_MIN');
});

test('consume：很短的正延迟（0.5 秒）也接受，空缺的到期时间就是现在 + 0.5', () => {
    const { w, f } = setup('clown', 5);
    const t0 = w.time;
    assert.equal(Core.consume(w, f, { x: f.x, y: f.y }, 0.5), true);
    near(w.vacancies[0].due, t0 + 0.5, '到期时间');
});

test('补回的时刻：世界时间恰好等于到期时间的那一步就补（不是下一步）；差一步就还没有', () => {
    for (const [offset, expectBack] of [[0.02, true], [0.04, false]]) {
        const { w, f } = setup('clown', 9);
        assert.equal(Core.consume(w, f, { x: f.x, y: f.y }, 500), true);
        w.vacancies[0].due = w.time + offset;                               // step 里 world.time += 0.02：与这里同一个浮点加法，时间恰好相等
        Core.step(w, 20);
        const back = w.fish.filter(x => x.state === 'entering');
        assert.equal(back.length, expectBack ? 1 : 0, `到期偏移 ${offset}`);
        assert.equal(w.vacancies.length, expectBack ? 0 : 1);
    }
});

test('渲染条数上限把“等着补回的空缺”算进去：满员时即使有鱼被吃了，新条目也进不来；被吃的离开中的鱼不重复计数', () => {
    const entries = [entry('neon'), entry('neon'), entry('neon'), entry('clown')];       // 5 + 5 + 5 + 1 = 16 = MAX_FISH_LOW
    const w = world({ lowPower: true, random: seeded(77) });
    Core.reconcile(w, entries, { instant: true });
    assert.equal(w.fish.length, P.MAX_FISH_LOW);
    run(w, 0.5);
    const victim = w.fish.find(f => f.species === 'neon');
    assert.equal(Core.consume(w, victim, { x: victim.x, y: victim.y }, 25), true);
    const extra = entry('angel');
    Core.reconcile(w, entries.concat([extra]));
    assert.equal(w.fish.some(f => f.entry === extra.id), false, '15 条活着 + 1 个空缺 = 16，已满：新条目不进');
    assert.equal(w.vacancies.length, 1);
    const freed = world({ lowPower: true, random: seeded(78) });                        // 对照：没有被吃的，同样的名单在满员前能进
    Core.reconcile(freed, entries, { instant: true });
    assert.equal(Core.renderCount(entries), P.MAX_FISH_LOW);
});

test('被吞下的渐隐：EAT_S 内 scoopT 按 dt/EAT_S 递增，到 SCOOP_FADE_AT 之后每步透明度减 dt / (EAT_S × (1 − SCOOP_FADE_AT))，scoopT 到 1 时透明度为 0 并被清掉', () => {
    const { w, f } = setup('clown', 6);
    f.alpha = 1;
    assert.equal(Core.consume(w, f, { x: f.x, y: f.y }, 100), true);
    const dt = 0.05;
    const total = P.EAT_S;
    const fade = dt / (total * (1 - P.SCOOP_FADE_AT));
    let alpha = 1;
    let t = 0;
    for (let step = 1; step <= 6; step++) {
        Core.step(w, dt * 1000);
        t = Math.min(1, t + dt / total);
        if (t >= P.SCOOP_FADE_AT) alpha = Math.max(0, alpha - fade);
        if (t >= 1) alpha = 0;
        if (alpha > 0) {
            assert.ok(w.fish.includes(f), `第 ${step} 步还在世界里`);
            near(f.scoopT, t, `第 ${step} 步 scoopT`);
            near(f.alpha, alpha, `第 ${step} 步透明度`);
        } else {
            assert.ok(!w.fish.includes(f), `第 ${step} 步透明度到 0，被清掉`);
        }
    }
});

test('被吞下的渐隐：scoopT 恰好等于 SCOOP_FADE_AT 的那一步就开始淡出（不是下一步）；没有 leaveS 的被捞起的鱼按 SCOOP_S 走', () => {
    const { w, f } = setup('clown', 6);
    f.alpha = 1;
    f.state = 'leaving'; f.leaveTo = { x: f.x, y: f.y }; f.leaveS = 0.5;
    f.scoopT = P.SCOOP_FADE_AT - 0.0625;
    assert.equal(f.scoopT + 0.0625, P.SCOOP_FADE_AT, '前提：这个加法在浮点里正好得到 SCOOP_FADE_AT');
    Core.step(w, 31.25);                                                    // dt = 0.03125，除以 0.5 = 0.0625：加法精确
    assert.equal(f.scoopT, P.SCOOP_FADE_AT);
    assert.ok(f.alpha < 1, `恰好到点就淡出：${f.alpha}`);
    near(f.alpha, 1 - 0.03125 / (0.5 * (1 - P.SCOOP_FADE_AT)), '一步的减量');
    const scoop = setup('clown', 7);
    scoop.f.alpha = 1;
    scoop.f.state = 'leaving'; scoop.f.leaveTo = { x: scoop.f.x, y: scoop.f.y }; scoop.f.scoopT = 0;
    Core.step(scoop.w, 30);
    near(scoop.f.scoopT, 0.03 / P.SCOOP_S, '没有 leaveS：总时长是 SCOOP_S');
});

test('目标点：追击中的鱼（w 在 0…1 之间也算）整条轨迹与有没有饲料无关；没有目标点或 w = 0 时饲料照样改道', () => {
    const feed = { x: W * 0.1, y: H * 0.6, reach: 5000, weight: 2, boost: 2 };
    const setupFish = (f, w) => { placeLeft(f, w); f.x = W * 0.5; };
    const goalOf = wgt => () => ({ x: W * 0.9, y: H * 0.6, w: wgt, boost: 1.3 });
    for (const wgt of [0.4, 1, 2.2]) {
        const withFeed = simulate(71, goalOf(wgt), 2, { setupFish, input: { attractors: [feed] } });
        const without = simulate(71, goalOf(wgt), 2, { setupFish, input: {} });
        assert.ok(withFeed.trace.every((p, i) => p.x === without.trace[i].x && p.y === without.trace[i].y), `w = ${wgt}：追击中饲料不起作用，逐帧一致`);
    }
    const idleWith = simulate(71, goalOf(0), 3, { setupFish, input: { attractors: [feed] } });
    const idleWithout = simulate(71, goalOf(0), 3, { setupFish, input: {} });
    assert.ok(idleWith.f.x < W * 0.5 - 40 && idleWith.f.x < idleWithout.f.x - 10, `w = 0：饲料把鱼拉向左边 ${idleWith.f.x.toFixed(0)}（没有饲料时 ${idleWithout.f.x.toFixed(0)}）`);
});

test('目标点 w：权重越大拉得越狠（目标在身后：0.4 的转得最慢、1 居中、2.2 最快），小于 1 的权重按原值生效、大于 GOAL_W_MAX 的夹到上限', () => {
    const behind = wgt => {
        let sum = 0;
        for (const seed of [81, 82, 83, 84, 85]) {
            const r = simulate(seed, () => ({ x: W * 0.1, y: H * 0.6, w: wgt, boost: 1 }), 3, { setupFish: (f, w) => { placeLeft(f, w); f.x = W * 0.5; } });
            sum += r.f.x;
        }
        return sum / 5;
    };
    const low = behind(0.4), mid = behind(1), high = behind(2.2);
    assert.ok(low > mid + 20 && mid > high + 12, `3 秒后平均横坐标 ${low.toFixed(0)} > ${mid.toFixed(0)} > ${high.toFixed(0)}（越小说明朝左边的目标转得越快）`);
    assert.equal(behind(P.GOAL_W_MAX), behind(100), 'w 夹在 GOAL_W_MAX');
});

test('目标点 boost 与 accel 的边界：boost 小于 0.3 按 0.3；boost 大了放宽速度上限（超过 FLEE_CAP 倍巡航也能到）；没有 accel 与 accel = 1 完全一致', () => {
    const speedOf = boost => {
        const r = simulate(91, () => ({ x: W * 0.95, y: H * 0.6, w: 0, boost }), 6, { setupFish: placeLeft });
        return { trace: r.trace, max: Math.max(...r.trace.map(p => p.sp)), mean: r.trace.slice(-120).reduce((s, p) => s + p.sp, 0) / 120 };
    };
    const tiny = speedOf(0.1), floor = speedOf(0.3), mid = speedOf(0.6);
    assert.ok(tiny.trace.every((p, i) => p.x === floor.trace[i].x && p.y === floor.trace[i].y), 'boost 0.1 与 0.3 逐帧一致（下限 0.3）');
    assert.ok(floor.mean < mid.mean * 0.8, `0.3 比 0.6 慢：${floor.mean.toFixed(0)} < ${mid.mean.toFixed(0)}`);
    const base = simulate(91, null, 6, { setupFish: placeLeft });
    const cruise = base.trace.slice(-120).reduce((s, p) => s + p.sp, 0) / 120;
    const crazy = simulate(92, () => ({ x: W * 0.95, y: H * 0.6, w: 3, boost: P.GOAL_BOOST_MAX }), 6, { setupFish: placeLeft });
    const top = Math.max(...crazy.trace.map(p => p.sp));
    assert.ok(top > cruise * 3.2, `boost ${P.GOAL_BOOST_MAX}：最高速度 ${top.toFixed(0)} px/s 超过 3.2 倍巡航 ${(cruise * 3.2).toFixed(0)}（上限被放宽到 boost 倍，而不是停在 ${Core.PARAMS.FLEE_CAP} 倍）`);
    const goal = accel => () => ({ x: W * 0.95, y: H * 0.6, w: 2.2, boost: 3, accel });
    const a1 = simulate(93, goal(1), 3, { setupFish: placeLeft });
    const none = simulate(93, goal(undefined), 3, { setupFish: placeLeft });
    assert.ok(a1.trace.every((p, i) => p.x === none.trace[i].x && p.y === none.trace[i].y), '没有 accel 就是 1');
    const half = simulate(93, goal(0.2), 3, { setupFish: placeLeft });
    assert.ok(half.trace.every((p, i) => p.x === a1.trace[i].x), 'accel 小于 1 按 1');
});

// ---------- 变异检查补强（第二轮，2026-10-20）：目标点的退化情形、被捞起/被吞下的收尾 ----------

test('目标点 goal 的退化情形：目标正好在鱼身上（距离 0，没有方向）时不产生 NaN，也不为它转向——与 w = 0 逐帧一致', () => {
    const finiteTrace = trace => trace.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vx) && Number.isFinite(p.vy));
    const idle = simulate(61, f => ({ x: f.x, y: f.y, w: 0, boost: 1 }), 2, { setupFish: placeLeft });
    assert.ok(finiteTrace(idle.trace), 'w = 0、距离 0：位置与速度都有限');
    for (const weight of [P.GOAL_W_MAX, 2.2, 0.4]) {
        const on = simulate(61, f => ({ x: f.x, y: f.y, w: weight, boost: 1 }), 2, { setupFish: placeLeft });
        assert.ok(finiteTrace(on.trace), `w = ${weight}、距离 0：位置与速度都有限`);
        assert.ok(Number.isFinite(on.f.ang) && Number.isFinite(on.f.turn) && Number.isFinite(on.f.phase), `w = ${weight}：朝向与相位也有限`);
        assert.ok(on.trace.every((p, i) => p.x === idle.trace[i].x && p.y === idle.trace[i].y), `w = ${weight}：没有方向就不拉，与 w = 0 逐帧一致`);
    }
});

test('目标点 goal 的方向下限：目标离鱼正好 1e-6（方向已经没有意义）时不拉，与 w = 0 一致；稍远一点（2e-6）就开始拉', () => {
    assert.equal(Math.hypot(1e-6, 0), 1e-6, '前置条件：水平相距 d 时 hypot 就是 d');
    // 鱼钉在 x = 0：只有在 0 附近，“目标 x − 鱼 x”才能正好是 1e-6（离 0 远了，两个浮点数的差凑不出这个数）；只比第一步
    const first = (d, weight) => simulate(62, f => {
        assert.equal(d - f.x, d, '前置条件：目标与鱼正好相距 d');
        return { x: d, y: f.y, w: weight, boost: 1 };
    }, 1 / FPS, { setupFish: (f, w) => { placeLeft(f, w); f.x = 0; } }).trace[0];
    const same = (a, b) => a.x === b.x && a.y === b.y && a.vx === b.vx && a.vy === b.vy;
    assert.ok(same(first(1e-6, P.GOAL_W_MAX), first(1e-6, 0)), '正好 1e-6：不拉');
    assert.ok(!same(first(2e-6, P.GOAL_W_MAX), first(2e-6, 0)), '2e-6：已经按方向拉了（w = 3 与 w = 0 不同）');
});

test('被捞起 / 被吞下的收尾：leaveS 为 0 或缺失时按默认的捞起时长（不是瞬间结束）；进度到 1 就停在 1', () => {
    const progress = leaveS => {
        const { w, f } = setup('clown', 41, 0);
        f.state = 'leaving'; f.leaveTo = { x: 100, y: 100 }; f.scoopT = 0; f.leaveS = leaveS;
        Core.step(w, 50);
        return f.scoopT;
    };
    near(progress(0), 0.05 / P.SCOOP_S, 'leaveS = 0：按 SCOOP_S，而不是一步就结束');
    near(progress(undefined), 0.05 / P.SCOOP_S, '没有 leaveS：按 SCOOP_S');
    near(progress(P.EAT_S), 0.05 / P.EAT_S, 'leaveS > 0：按它（被吞下比被捞起快得多）');
    const { w, f } = setup('clown', 42, 0);
    f.state = 'leaving'; f.leaveTo = { x: 100, y: 100 }; f.scoopT = 0; f.leaveS = 0.35;          // 0.05 / 0.35 不是整数倍：最后一步会越过 1
    let steps = 0;
    while (w.fish.includes(f) && steps++ < 40) Core.step(w, 50);
    assert.ok(!w.fish.includes(f), '进度到 1 之后这一步里被移除');
    assert.equal(f.scoopT, 1, '进度夹在 1，不会越过');
});

