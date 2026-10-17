// 水母皮肤的纯物理（js/jellyfish-core.js）：数量、拍点同步、触须约束、淡入淡出、指针惊动、数值安全。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jellyfish-core.js');

const P = Core.PARAMS;

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function world(options = {}) {
    return Core.createWorld({ width: 1440, height: 900, random: seeded(7), ...options });
}

function populated(count, options = {}) {
    const w = world(options);
    Core.reconcile(w, count, { instant: true });
    return w;
}

const alive = w => w.jellies.filter(j => j.state !== 'leaving' && j.state !== 'eating');
function run(w, seconds, input = {}, frameMs = 16) {
    const frames = Math.round(seconds * 1000 / frameMs);
    for (let i = 0; i < frames; i++) Core.step(w, frameMs, typeof input === 'function' ? input(i) : input);
}
function allFinite(w) {
    const bad = [];
    const check = (label, ...values) => values.forEach(v => { if (!Number.isFinite(v)) bad.push(label); });
    for (const j of w.jellies) {
        check('jelly', j.x, j.y, j.vx, j.vy, j.heading, j.tilt, j.alpha, j.pulseT, j.r, j.hot);
        for (const t of j.tentacles) for (const p of t.pts) check('tentacle', p.x, p.y, p.vx, p.vy);
    }
    for (const p of w.plankton) check('plankton', p.x, p.y);
    return bad;
}

// ---------- 常量与数量 ----------

test('PARAMS 冻结且互相自洽', () => {
    assert.ok(Object.isFrozen(P));
    assert.ok(P.MAX_COUNT_LOW < P.MAX_COUNT);
    assert.ok(P.PERIODS.every(n => Number.isInteger(n) && n >= 2), '每只至少隔一拍才收缩，才不会整屏同时收缩');
    assert.ok(P.TENTACLES_LOW < P.TENTACLES && P.SEGMENTS_LOW < P.SEGMENTS && P.PLANKTON_LOW < P.PLANKTON);
    assert.ok(P.BELL_MIN < P.BELL_MAX && P.SCALE_MIN < P.SCALE_MAX);
    assert.ok(P.TILT_LIMIT < Math.PI / 2, '钟罩倾斜上限必须小于直角，保证不会翻过来');
    assert.ok(P.HOVER_SPAN > 0 && P.HOVER_SPAN < 1, '深度调节的范围是屏幕高度的一部分');
    assert.ok(0 < P.HOVER_MIN && P.HOVER_MIN < P.HOVER_THRUST && P.HOVER_THRUST < 1, '推力系数：最小 < 漫游点高度 < 满格');
    // 稳态：每次收缩推 THRUST/DRAG，两次收缩之间下沉 SINK/DRAG × 周期，所以“刚好抵消下沉”的推力系数 = 周期 × SINK / THRUST（周期 2 拍 0.23，3 拍 0.35）。
    // 漫游点高度的推力系数要落在这个范围内：低于它水母在漫游点会一直被压低，高于它会一直往上飘，都停不住
    const needs = P.PERIODS.map(period => period * P.SINK / P.THRUST);
    assert.ok(P.HOVER_THRUST >= Math.min(...needs) && P.HOVER_THRUST <= Math.max(...needs), `HOVER_THRUST ${P.HOVER_THRUST} 在抵消下沉所需 ${needs.map(n => n.toFixed(2))} 之间`);
});

test('targetCount：数量等于待办数，夹在上限内；省流量更少；非法输入一律收敛为 0', () => {
    assert.deepEqual([0, 1, 5, 8, 9, 100].map(n => Core.targetCount(n)), [0, 1, 5, 8, 8, 8]);
    assert.deepEqual([0, 1, 4, 5, 100].map(n => Core.targetCount(n, true)), [0, 1, 4, 4, 4]);
    assert.equal(Core.targetCount(2.9), 2, '小数向下取整');
    assert.equal(Core.targetCount('3'), 3, '数字字符串可接受');
    for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, undefined, null, 'abc', {}, []]) {
        assert.equal(Core.targetCount(bad), 0, String(bad));
    }
});

test('pendingCount：与首页任务滚动条同一规则——未完成且不是失败；读不到数据返回 null 而不是 0', () => {
    const memos = [
        { id: 'a', completed: false },
        { id: 'b', completed: true },
        { id: 'c', completed: false, status: 'failed' },
        { id: 'd' },
        { id: 'e', completed: false, status: 'pending', dueDate: '2000-01-01' },   // 过期的也算待办
        { id: 'f', completed: false, dueDate: null },                              // 没有截止日期的也算
        { id: 'g', completed: false, habit: { streak: 3 } },                       // 习惯任务与滚动条一致，同样计入
    ];
    assert.equal(Core.pendingCount(memos), 5);
    assert.equal(Core.pendingCount([]), 0);
    for (const bad of [undefined, null, 'x', 3, {}, { length: 2 }]) assert.equal(Core.pendingCount(bad), null, String(bad));
    assert.equal(Core.pendingCount([null, undefined, 7, 'a', { completed: true }, { completed: false }]), 1, '混入的脏数据不计数也不抛错');
    assert.equal(Core.pendingCount(Array.from({ length: 1000 }, () => ({}))), 1000, '不在这里封顶；封顶是 targetCount 的事');
});

// ---------- 收缩节律与形状 ----------

test('pulseEnvelope：先快速挤到 1，再缓慢回到 0，连续单调，之后恒为 0', () => {
    for (const t of [-1, NaN, undefined, -0.001]) assert.equal(Core.pulseEnvelope(t), 0, String(t));
    assert.equal(Core.pulseEnvelope(0), 0);
    assert.ok(Math.abs(Core.pulseEnvelope(P.SQUEEZE_S) - 1) < 1e-9);
    // 用整数步数取样，避免浮点累加让最后一个取样点落在峰值之前
    const steps = 200;
    let last = 0;
    for (let i = 0; i <= steps; i++) { const v = Core.pulseEnvelope(P.SQUEEZE_S * i / steps); assert.ok(v >= last - 1e-12, `上升段 ${i}`); last = v; }
    assert.ok(Math.abs(last - 1) < 1e-9, '上升段末尾正好是峰值 1');
    for (let i = 0; i <= steps; i++) { const v = Core.pulseEnvelope(P.SQUEEZE_S + P.RELAX_S * i / steps); assert.ok(v <= last + 1e-12, `下降段 ${i}`); last = v; }
    assert.ok(Core.pulseEnvelope(P.SQUEEZE_S + P.RELAX_S) < 1e-9);
    assert.equal(Core.pulseEnvelope(P.SQUEEZE_S + P.RELAX_S + 5), 0);
    assert.ok(P.SQUEEZE_S < P.RELAX_S, '收缩快、舒张慢');
    // 连接处连续
    assert.ok(Math.abs(Core.pulseEnvelope(P.SQUEEZE_S - 1e-6) - Core.pulseEnvelope(P.SQUEEZE_S + 1e-6)) < 1e-3);
});

test('bellShape：收缩时变窄变高，舒张时扁而宽，体积大致守恒', () => {
    const relaxed = Core.bellShape({ r: 40, pulseT: 99 });
    const squeezed = Core.bellShape({ r: 40, pulseT: P.SQUEEZE_S });
    assert.equal(relaxed.p, 0);
    assert.ok(Math.abs(squeezed.p - 1) < 1e-9);
    assert.ok(squeezed.w < relaxed.w && squeezed.h > relaxed.h);
    assert.ok(relaxed.w > relaxed.h, '舒张时是扁的半椭圆');
    const ratio = (squeezed.w * squeezed.h) / (relaxed.w * relaxed.h);
    assert.ok(ratio > 0.9 && ratio < 1.1, `面积比 ${ratio}`);
});

// ---------- 拍点时钟 ----------

test('拍点时钟：默认用整秒墙钟；时钟数字每秒都在变时才改用数字的真实变化；停变或不是每秒变就退回墙钟', () => {
    const clock = Core.createBeatClock();
    const wall = 1_700_000_123_456;
    assert.deepEqual(clock.index(5000, wall), { index: Math.floor(wall / 1000), source: 'wall' });

    clock.beat(5100);   // 只有一次变化：还不能证明“每秒都在变”
    assert.equal(clock.index(5200, wall).source, 'wall');

    clock.beat(6100);   // 与上一次相隔 1 秒：确认是每秒在变
    assert.deepEqual(clock.index(6200, wall), { index: 2, source: 'clock' });
    clock.beat(7100);
    assert.deepEqual(clock.index(7150, wall), { index: 3, source: 'clock' });

    assert.equal(clock.index(7100 + P.BEAT_FRESH_MS, wall).source, 'wall', '数字不再变化（例如隐藏了秒）：退回墙钟');
    assert.equal(clock.index(7100 + P.BEAT_FRESH_MS - 1, wall).source, 'clock');

    const slow = Core.createBeatClock();   // 没显示秒：数字每分钟才变一次
    slow.beat(1000);
    slow.beat(61_000);
    assert.equal(slow.index(61_100, wall).source, 'wall', '间隔 60 秒的变化不是秒针，不能当拍点');
});

// ---------- 世界与数量 ----------

test('createWorld：缩放夹在范围内，浮游光点数量随省流量变化，同一种子结果相同', () => {
    assert.equal(Core.createWorld({ width: 300, height: 200 }).scale, P.SCALE_MIN);
    assert.equal(Core.createWorld({ width: 5000, height: 4000 }).scale, P.SCALE_MAX);
    assert.equal(Core.createWorld({ width: 1640, height: 820 }).scale, 1);
    assert.equal(world().plankton.length, P.PLANKTON);
    assert.equal(world({ lowPower: true }).plankton.length, P.PLANKTON_LOW);
    const a = JSON.stringify(world().plankton);
    const b = JSON.stringify(world().plankton);
    assert.equal(a, b);
    for (const p of world().plankton) assert.ok(p.x >= 0 && p.x <= 1440 && p.y >= 0 && p.y <= 900);
});

test('reconcile：数量跟上待办；重复调用幂等；超过上限只画上限只；省流量更少', () => {
    const w = world();
    assert.equal(Core.reconcile(w, 0), 0);
    assert.equal(w.jellies.length, 0, '没有待办就没有水母（只剩浮游光点）');
    assert.equal(Core.reconcile(w, 3), 3);
    assert.equal(alive(w).length, 3);
    const ids = w.jellies.map(j => j.id);
    Core.reconcile(w, 3);
    assert.deepEqual(w.jellies.map(j => j.id), ids, '重复调用不改变任何水母');
    Core.reconcile(w, 5);
    assert.equal(alive(w).length, 5);
    assert.deepEqual(w.jellies.slice(0, 3).map(j => j.id), ids, '原有的水母保持身份');
    Core.reconcile(w, 99);
    assert.equal(alive(w).length, P.MAX_COUNT);
    assert.equal(Core.reconcile(world({ lowPower: true }), 99), P.MAX_COUNT_LOW);
    assert.equal(Core.reconcile(w, NaN), 0);
});

test('reconcile：少了就随机挑还没离开的游走（不会重复挑，也不会复活）；再多了就新来一只', () => {
    const w = populated(5);
    Core.reconcile(w, 2);
    assert.equal(alive(w).length, 2);
    assert.equal(w.jellies.filter(j => j.state === 'leaving').length, 3);
    const leavingIds = w.jellies.filter(j => j.state === 'leaving').map(j => j.id);
    Core.reconcile(w, 1);
    assert.equal(w.jellies.filter(j => j.state === 'leaving').length, 4, '只多挑一只，已在离开的不重复处理');
    Core.reconcile(w, 3);
    assert.equal(alive(w).length, 3);
    const nowLeaving = w.jellies.filter(j => j.state === 'leaving').map(j => j.id);
    for (const id of leavingIds) assert.ok(nowLeaving.includes(id), '离开中的水母不会被复活');
    for (const j of w.jellies.filter(j => j.state === 'leaving')) {
        assert.equal(j.period, 1, '离开的水母每拍都收缩，游得更快');
        assert.ok(j.home.y < 0, '目标在屏幕上方之外');
    }
});

test('spawn：首次填充直接出现在屏幕内（只淡入）；之后新增的从屏幕下方游进来', () => {
    const first = populated(4);
    for (const j of first.jellies) assert.ok(j.y < first.height && j.y > 0 && j.x > 0 && j.x < first.width, '首次填充在屏幕内');
    const later = world();
    Core.reconcile(later, 3);
    for (const j of later.jellies) {
        assert.ok(j.y > later.height, '从下方进入');
        assert.ok(j.vy < 0, '向上游');
        assert.equal(j.alpha, 0);
        assert.equal(j.state, 'entering');
    }
});

test('同时存在的水母收缩错开：周期来自 PERIODS，偏移 = 序号 % 周期', () => {
    const w = populated(P.MAX_COUNT);
    for (const j of w.jellies) {
        assert.ok(P.PERIODS.includes(j.period));
        assert.equal(j.offset, j.slot % j.period);
    }
    const phases = new Set(w.jellies.map(j => `${j.period}:${j.offset}`));
    assert.ok(phases.size >= 3, '不会全部在同一拍收缩');
});

// ---------- 颜色：七彩，每只不同（2026-10-15） ----------

const circularGap = (a, b) => Math.min(Math.abs(a - b), P.COLORS - Math.abs(a - b));
const minGap = colors => {
    let gap = Infinity;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) gap = Math.min(gap, circularGap(colors[i], colors[j]));
    return gap;
};

test('颜色：色位数不少于同屏上限，每只水母的颜色编号是色位范围内的整数', () => {
    assert.ok(Number.isInteger(P.COLORS) && P.COLORS >= P.MAX_COUNT, '色位至少和同屏最多的水母一样多，存活的才有可能各不相同');
    const w = populated(P.MAX_COUNT);
    for (const j of w.jellies) assert.ok(Number.isInteger(j.color) && j.color >= 0 && j.color < P.COLORS, `color=${j.color}`);
});

test('颜色：同屏的水母各不相同（1 到 8 只；省流量 1 到 4 只；换多种随机起点）', () => {
    for (let seed = 1; seed <= 20; seed++) {
        for (let n = 1; n <= P.MAX_COUNT; n++) {
            const w = populated(n, { random: seeded(seed) });
            assert.equal(new Set(w.jellies.map(j => j.color)).size, n, `seed ${seed}，${n} 只`);
        }
        for (let n = 1; n <= P.MAX_COUNT_LOW; n++) {
            const w = populated(n, { random: seeded(seed), lowPower: true });
            assert.equal(new Set(w.jellies.map(j => j.color)).size, n, `seed ${seed}，省流量 ${n} 只`);
        }
    }
});

test('颜色：只有两三四只时在色相环上拉得最开（两只相距半圈，三四只相邻色位之间至少隔一个）', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const colors = n => populated(n, { random: seeded(seed) }).jellies.map(j => j.color);
        assert.equal(minGap(colors(2)), P.COLORS / 2, `seed ${seed}：两只`);
        assert.ok(minGap(colors(3)) >= 2, `seed ${seed}：三只 ${colors(3)}`);
        assert.ok(minGap(colors(4)) >= 2, `seed ${seed}：四只 ${colors(4)}`);
    }
});

test('颜色：一只水母活着的整个期间颜色不变（新增、完成、改尺寸、步进之后都一样），不会因别的水母来去而闪色', () => {
    const w = populated(3, { random: seeded(3) });
    const known = new Map(w.jellies.map(j => [j.id, j.color]));
    for (const target of [5, 2, 8, 1, 6, 0, 4, 7, 3, 8, 2]) {
        Core.reconcile(w, target);
        run(w, 0.4);
        Core.resize(w, 1200 + target * 10, 800);
        for (const j of w.jellies) {
            if (known.has(j.id)) assert.equal(j.color, known.get(j.id), `#${j.id}`);
            else known.set(j.id, j.color);
        }
    }
    assert.ok(known.size > 10, `确实经历了多次新增（共 ${known.size} 只）`);
});

test('颜色：随机增减 400 轮，任何时候存活的水母（不含正在淡出的）都互不相同', () => {
    for (const seed of [1, 2, 3]) {
        const random = seeded(seed);
        const w = populated(0, { random: seeded(seed + 100) });
        for (let round = 0; round < 400; round++) {
            Core.reconcile(w, Math.floor(random() * (P.MAX_COUNT + 1)));
            run(w, random() * 0.6);
            const colors = alive(w).map(j => j.color);
            assert.equal(new Set(colors).size, colors.length, `seed ${seed} 第 ${round} 轮：${colors}`);
        }
    }
});

test('颜色：有空闲颜色时，新来的水母不借用正在淡出的那只的颜色，也不撞存活的', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const w = populated(4, { random: seeded(seed) });
        Core.reconcile(w, 3);                                   // 一只开始淡出
        const going = w.jellies.find(j => j.state === 'leaving');
        Core.reconcile(w, 4);                                   // 马上又来一只
        const fresh = w.jellies[w.jellies.length - 1];
        assert.notEqual(fresh, going);
        const others = w.jellies.filter(j => j !== fresh).map(j => j.color);
        assert.ok(!others.includes(fresh.color), `seed ${seed}：新来的 ${fresh.color} 撞了 ${others}`);
    }
});

test('颜色：新来的水母与正在淡出的也拉开（淡出要持续约两秒，同屏可见）：两只相对的，一只淡出，再来一只 → 与两只都隔至少一个色位', () => {
    for (let seed = 1; seed <= 30; seed++) {
        const w = populated(2, { random: seeded(seed) });
        Core.reconcile(w, 1);
        const going = w.jellies.find(j => j.state === 'leaving');
        const staying = w.jellies.find(j => j.state !== 'leaving');
        Core.reconcile(w, 2);
        const fresh = w.jellies[w.jellies.length - 1];
        assert.ok(circularGap(fresh.color, staying.color) >= 2, `seed ${seed}：与留下的 ${staying.color} 太近（${fresh.color}）`);
        assert.ok(circularGap(fresh.color, going.color) >= 2, `seed ${seed}：与淡出的 ${going.color} 太近（${fresh.color}）`);
    }
});

test('颜色：存活 7 只又有 1 只在淡出时再来一只，只能借淡出那只的颜色，存活的仍然互不相同', () => {
    const w = populated(P.MAX_COUNT, { random: seeded(9) });
    Core.reconcile(w, P.MAX_COUNT - 1);
    const going = w.jellies.find(j => j.state === 'leaving');
    Core.reconcile(w, P.MAX_COUNT);
    const fresh = w.jellies[w.jellies.length - 1];
    assert.equal(fresh.color, going.color, '八种颜色已被占满，淡出的那只马上就没了');
    assert.equal(new Set(alive(w).map(j => j.color)).size, P.MAX_COUNT);
});

test('颜色：起点随机（不同随机数起点不同），同一随机数结果相同', () => {
    const first = seed => populated(1, { random: seeded(seed) }).jellies[0].color;
    assert.equal(first(5), first(5));
    assert.ok(new Set(Array.from({ length: 40 }, (_, i) => first(i + 1))).size >= 5, '起点分布在多个色位');
});

// ---------- 外观：纯色与多色（2026-10-15） ----------
// 一只水母可以只有一种颜色（solid），也可以有好几种：duo 钟罩与触须不同色，blend 钟罩由边缘渐变到中心、触须由根到尖渐变，
// rainbow 三种颜色沿钟罩横向铺开。外观在出生时决定、一生不变；同屏总有纯色也有多色。

const MULTI = ['duo', 'blend', 'rainbow'];
const looksOf = w => w.jellies.map(j => j.look);
const isSolid = j => j.look.kind === 'solid';
const KIND_SIZE = { solid: 1, duo: 2, blend: 2, rainbow: 3 };

test('外观参数：冻结，纯色 + 三种多色；色位差在色相环上足够大且三种颜色互不重复', () => {
    assert.deepEqual(Array.from(P.LOOKS), ['solid', 'duo', 'blend', 'rainbow']);
    assert.ok(Object.isFrozen(P.LOOKS) && Object.isFrozen(P.DUO_OFFSETS) && Object.isFrozen(P.BLEND_OFFSETS));
    for (const d of P.DUO_OFFSETS) assert.ok(Number.isInteger(d) && d >= 2 && d <= P.COLORS / 2, `duo 色位差 ${d}：至少隔一个色位，才一眼看出是两种颜色`);
    for (const d of P.BLEND_OFFSETS) assert.ok(Number.isInteger(d) && d >= 2 && d <= 3, `blend 色位差 ${d}：至少 90° 才看得出在渐变（只隔 1 位几乎看不出），也不能太远，否则中段发灰`);
    assert.ok(Number.isInteger(P.RAINBOW_STEP) && P.RAINBOW_STEP * 2 < P.COLORS, '彩带的三种颜色在色相环上互不重复');
});

test('外观：每只水母都有外观，样式合法，颜色个数与样式对应，颜色编号在色位范围内且互不重复，第一种就是它的主色', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const w = populated(P.MAX_COUNT, { random: seeded(seed) });
        for (const j of w.jellies) {
            assert.ok(P.LOOKS.includes(j.look.kind), `样式 ${j.look.kind}`);
            assert.equal(j.look.colors.length, KIND_SIZE[j.look.kind]);
            for (const c of j.look.colors) assert.ok(Number.isInteger(c) && c >= 0 && c < P.COLORS, `色位 ${c}`);
            assert.equal(new Set(j.look.colors).size, j.look.colors.length, `${j.look.kind} 的颜色重复：${j.look.colors}`);
            assert.equal(j.look.colors[0], j.color, '外观的第一种颜色就是主色（同屏互不相同的那个）');
        }
    }
});

test('外观：多色的颜色搭配——duo 与主色隔 2–4 个色位，blend 隔 2 个，rainbow 是主色 ± 每步 2 个色位的三连', () => {
    const seen = { duo: new Set(), blend: new Set(), rainbow: new Set() };
    for (let seed = 1; seed <= 80; seed++) {
        const w = populated(P.MAX_COUNT, { random: seeded(seed) });
        for (const j of w.jellies) {
            const [a, b, c] = j.look.colors;
            if (j.look.kind === 'duo') {
                assert.ok(P.DUO_OFFSETS.includes(circularGap(a, b)), `duo ${a}→${b}`);
                seen.duo.add(circularGap(a, b));
            } else if (j.look.kind === 'blend') {
                assert.ok(P.BLEND_OFFSETS.includes(circularGap(a, b)), `blend ${a}→${b}`);
                seen.blend.add(circularGap(a, b));
            } else if (j.look.kind === 'rainbow') {
                const forward = (b - a + P.COLORS) % P.COLORS === P.RAINBOW_STEP && (c - b + P.COLORS) % P.COLORS === P.RAINBOW_STEP;
                const backward = (a - b + P.COLORS) % P.COLORS === P.RAINBOW_STEP && (b - c + P.COLORS) % P.COLORS === P.RAINBOW_STEP;
                assert.ok(forward || backward, `rainbow ${a},${b},${c}`);
                seen.rainbow.add(forward ? 'forward' : 'backward');
            }
        }
    }
    assert.deepEqual([...seen.duo].sort(), Array.from(new Set(P.DUO_OFFSETS)).sort(), 'duo 的各档色位差都出现过');
    assert.deepEqual([...seen.blend].sort(), Array.from(new Set(P.BLEND_OFFSETS)).sort(), 'blend 的各档色位差都出现过');
    assert.deepEqual([...seen.rainbow].sort(), ['backward', 'forward'], 'rainbow 两个方向都出现过');
});

test('外观：纯色与多色都有——任何随机起点下，凑满 n 只（n ≥ 2）时两类都出现，数量相差不超过 1', () => {
    for (let seed = 1; seed <= 40; seed++) {
        for (let n = 1; n <= P.MAX_COUNT; n++) {
            const w = populated(n, { random: seeded(seed) });
            const solids = w.jellies.filter(isSolid).length;
            const multis = n - solids;
            assert.ok(Math.abs(solids - multis) <= 1, `seed ${seed}，${n} 只：纯色 ${solids} 多色 ${multis}`);
            if (n >= 2) assert.ok(solids >= 1 && multis >= 1, `seed ${seed}，${n} 只：两类都要有`);
        }
        for (let n = 2; n <= P.MAX_COUNT_LOW; n++) {
            const w = populated(n, { random: seeded(seed), lowPower: true });
            assert.ok(w.jellies.some(isSolid) && w.jellies.some(j => !isSolid(j)), `seed ${seed}，省流量 ${n} 只`);
        }
    }
});

test('外观：多色里三种样式轮着用——多色有 3 只时三种样式各一只，8 只时每种至少一只', () => {
    for (let seed = 1; seed <= 40; seed++) {
        const six = populated(6, { random: seeded(seed) });           // 3 纯色 + 3 多色
        assert.deepEqual(six.jellies.filter(j => !isSolid(j)).map(j => j.look.kind).sort(), [...MULTI].sort(), `seed ${seed}`);
        const eight = populated(8, { random: seeded(seed) });         // 4 纯色 + 4 多色
        const kinds = eight.jellies.map(j => j.look.kind);
        for (const kind of MULTI) assert.ok(kinds.includes(kind), `seed ${seed}：8 只里没有 ${kind}`);
    }
});

test('外观：一两只时纯色和多色都可能出现（不是总以同一类开头），样式分布在多种上', () => {
    const firsts = new Set();
    const kinds = new Set();
    for (let seed = 1; seed <= 60; seed++) {
        const j = populated(1, { random: seeded(seed) }).jellies[0];
        firsts.add(isSolid(j) ? 'solid' : 'multi');
        kinds.add(j.look.kind);
    }
    assert.deepEqual([...firsts].sort(), ['multi', 'solid']);
    assert.ok(kinds.size >= 3, `出现过的样式 ${[...kinds]}`);
});

test('外观：一只水母活着的整个期间外观不变（别的水母来去、步进、改尺寸之后都一样）', () => {
    const w = populated(3, { random: seeded(4) });
    const known = new Map(w.jellies.map(j => [j.id, JSON.stringify(j.look)]));
    for (const target of [5, 2, 8, 1, 6, 0, 4, 7, 3, 8, 2]) {
        Core.reconcile(w, target);
        run(w, 0.4);
        Core.resize(w, 1200 + target * 10, 800);
        for (const j of w.jellies) {
            assert.ok(j.look && j.look.kind, `#${j.id} 没有外观`);
            if (known.has(j.id)) assert.equal(JSON.stringify(j.look), known.get(j.id), `#${j.id}`);
            else known.set(j.id, JSON.stringify(j.look));
        }
    }
    assert.ok(known.size > 10);
    assert.ok([...known.values()].every(value => value !== undefined), '最初的三只也有外观');
});

test('外观：新来的水母补上人数较少的那一类（正在淡出的不算在场），随机增减 400 轮都成立', () => {
    for (const seed of [1, 2, 3]) {
        const random = seeded(seed);
        const w = populated(0, { random: seeded(seed + 200) });
        let checked = 0;
        for (let round = 0; round < 400; round++) {
            const before = new Set(w.jellies);
            const solids = alive(w).filter(isSolid).length;
            const multis = alive(w).length - solids;
            Core.reconcile(w, Math.min(alive(w).length + 1, P.MAX_COUNT));          // 恰好新来一只
            const fresh = w.jellies.filter(j => !before.has(j));
            if (fresh.length === 1 && solids !== multis) {
                assert.equal(isSolid(fresh[0]), solids < multis, `seed ${seed} 第 ${round} 轮：纯色 ${solids} 多色 ${multis}，新来的是 ${fresh[0].look.kind}`);
                checked++;
            }
            run(w, random() * 0.5);
            if (random() < 0.45) Core.reconcile(w, Math.floor(random() * (alive(w).length + 1)));     // 随机走掉几只
        }
        assert.ok(checked > 50, `seed ${seed}：真正检查了 ${checked} 次`);
    }
});

test('外观：主色的“同屏互不相同”不受外观影响（外观只在主色之后挑，不改主色的选择与别的随机序列）', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const w = populated(P.MAX_COUNT, { random: seeded(seed) });
        assert.equal(new Set(w.jellies.map(j => j.color)).size, P.MAX_COUNT);
    }
});

test('外观：同一随机数结果相同；起点随机（不同随机数的第一只外观不同）', () => {
    const a = populated(5, { random: seeded(8) });
    const b = populated(5, { random: seeded(8) });
    assert.deepEqual(looksOf(a), looksOf(b));
    assert.equal(JSON.stringify(a.jellies.map(j => [j.x, j.y, j.r])), JSON.stringify(b.jellies.map(j => [j.x, j.y, j.r])));
    const variety = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(populated(1, { random: seeded(i + 1) }).jellies[0].look)));
    assert.ok(variety.size >= 8, `30 个起点里出现了 ${variety.size} 种不同的外观`);
});

// ---------- 任务绑定：一只水母 = 一个待办（2026-10-15） ----------
// pendingTasks 把任务表整理成“该有水母的任务”（与 pendingCount 同一规则、与首页任务滚动条同一排序）；
// reconcile 收到数组时按任务 key 对应：完成哪个，走的就是哪只，而不是随机一只；水母带着任务名（label）出生、一生绑定同一个任务。

let taskSeq = 0;
const memoOf = (patch = {}) => ({ id: `t${++taskSeq}`, title: `任务 ${taskSeq}`, completed: false, ...patch });
const entries = (...memos) => Core.pendingTasks(memos);
const keysOf = w => alive(w).map(j => j.taskKey);

test('pendingTasks：不是数组返回 null；非对象、已完成、失败的任务不算；数量与 pendingCount 完全一致', () => {
    assert.equal(Core.pendingTasks(undefined), null);
    assert.equal(Core.pendingTasks('x'), null);
    assert.equal(Core.pendingTasks({}), null);
    assert.deepEqual(Core.pendingTasks([]), []);
    const list = [memoOf(), null, 5, 'x', memoOf({ completed: true }), memoOf({ status: 'failed' }), memoOf({ status: 'running' }), memoOf({ completed: false, priority: 'high' })];
    assert.equal(Core.pendingTasks(list).length, 3);
    const random = seeded(3);
    for (let round = 0; round < 200; round++) {
        const memos = Array.from({ length: Math.floor(random() * 12) }, () => {
            const roll = random();
            if (roll < 0.1) return null;
            return memoOf({ completed: random() < 0.3, status: random() < 0.2 ? 'failed' : undefined, id: random() < 0.15 ? undefined : `r${round}-${Math.floor(random() * 5)}` });
        });
        assert.equal(Core.pendingTasks(memos).length, Core.pendingCount(memos), `第 ${round} 轮`);
    }
});

test('pendingTasks：排序与首页任务滚动条一致——过期优先，再按优先级高/中/低/无，再按截止日期（有日期的在前），其余保持原顺序', () => {
    const memos = [
        memoOf({ id: 'plain-1' }),
        memoOf({ id: 'low', priority: 'low' }),
        memoOf({ id: 'high-late', priority: 'high', dueDate: '2026-12-01' }),
        memoOf({ id: 'medium', priority: 'medium' }),
        memoOf({ id: 'overdue-low', priority: 'low', dueDate: '2026-10-01' }),
        memoOf({ id: 'high-soon', priority: 'high', dueDate: '2026-10-20' }),
        memoOf({ id: 'plain-2' }),
        memoOf({ id: 'overdue-high', priority: 'high', dueDate: '2026-09-30' }),
        memoOf({ id: 'none-dated', dueDate: '2026-11-01' }),
    ];
    const order = Core.pendingTasks(memos, '2026-10-15').map(entry => entry.id);
    assert.deepEqual(order, ['overdue-high', 'overdue-low', 'high-soon', 'high-late', 'medium', 'low', 'none-dated', 'plain-1', 'plain-2']);
    // 没有传“今天”时不判断过期（也不抛错）：只按优先级与日期排，同优先级里有日期的在前
    assert.doesNotThrow(() => Core.pendingTasks(memos));
    assert.deepEqual(Core.pendingTasks(memos).map(entry => entry.id),
        ['overdue-high', 'high-soon', 'high-late', 'medium', 'overdue-low', 'low', 'none-dated', 'plain-1', 'plain-2']);
});

test('pendingTasks：条目是 { key, id, label }；key 唯一；id 保留原值（字符串或数字），没有可靠 id 的任务 id 为 null 并用位置当 key', () => {
    const list = Core.pendingTasks([
        memoOf({ id: 'a', title: 'A' }),
        memoOf({ id: 7, title: 'B' }),
        memoOf({ id: 'a', title: 'C' }),            // 重复 id
        memoOf({ id: undefined, title: 'D' }),
        memoOf({ id: {}, title: 'E' }),
        memoOf({ id: '', title: 'F' }),
    ]);
    assert.equal(list.length, 6);
    assert.equal(new Set(list.map(entry => entry.key)).size, 6, 'key 互不相同');
    assert.deepEqual(list.map(entry => entry.id), ['a', 7, 'a', null, null, null], '重复的 id 照原样保留（完成时由 memo 层按 id 找第一个）');
    for (const entry of list) assert.deepEqual(Object.keys(entry).sort(), ['id', 'key', 'label']);
    assert.ok(list.every(entry => typeof entry.key === 'string' && entry.key.length > 0));
});

test('pendingTasks：任务名整理——取标题（缺则取正文），去掉换行与多余空白和控制字符，过长截断加省略号且不拆开 emoji', () => {
    const label = patch => Core.pendingTasks([memoOf(patch)])[0].label;
    assert.equal(label({ title: '  写  周报\n\t完成  ' }), '写 周报 完成');
    assert.equal(label({ title: '', text: '正文当标题' }), '正文当标题');
    assert.equal(label({ title: '   ', text: '   ' }), '无标题');
    assert.equal(label({ title: undefined, text: undefined }), '无标题');
    assert.equal(label({ title: 12345 }), '12345');
    assert.equal(label({ title: { a: 1 }, text: '用正文' }), '用正文');
    assert.equal(label({ title: 'a\u0000b\u0007c\u202ed' }), 'abcd', '控制字符与双向控制符被去掉');
    const long = label({ title: '一二三四五六七八九十一二三四五六七八九十' });
    assert.ok(long.endsWith('…') && long.length <= P.LABEL_EM + 1, long);
    assert.ok(label({ title: 'abcdefghijklmnopqrstuvwxyz0123456789' }).length > long.length, '拉丁字母窄，能放更多个');
    const emoji = label({ title: '🙂'.repeat(30) });
    assert.ok(emoji.endsWith('…'));
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(emoji), '没有被拆开的代理对');
    assert.equal(label({ title: '短' }), '短');
});

test('pendingTasks：不修改传入的任务表', () => {
    const memos = [memoOf({ priority: 'low' }), memoOf({ priority: 'high' }), memoOf({ title: '  x  ' })];
    const before = JSON.stringify(memos);
    Core.pendingTasks(memos, '2026-10-15');
    assert.equal(JSON.stringify(memos), before);
});

test('reconcile（任务名单）：每个任务一只水母，带着 key、id、任务名；重复调用幂等', () => {
    const w = world();
    const list = entries(memoOf({ id: 'A', title: '写周报' }), memoOf({ id: 'B', title: '买牛奶' }), memoOf({ id: 'C', title: '约牙医' }));
    assert.equal(Core.reconcile(w, list, { instant: true }), 3);
    assert.deepEqual(w.jellies.map(j => j.taskId), ['A', 'B', 'C']);
    assert.deepEqual(w.jellies.map(j => j.label), ['写周报', '买牛奶', '约牙医']);
    assert.deepEqual(keysOf(w), list.map(entry => entry.key));
    const ids = w.jellies.map(j => j.id);
    Core.reconcile(w, list);
    assert.deepEqual(w.jellies.map(j => j.id), ids);
    for (const j of w.jellies) assert.equal(j.hot, 0, '刚出生时标签是隐约的');
});

test('reconcile（任务名单）：完成哪个，走的就是哪只（不是随机一只）；其余原地不动、不换色、不换外观', () => {
    for (let seed = 1; seed <= 20; seed++) {
        const w = world({ random: seeded(seed) });
        const memos = ['A', 'B', 'C', 'D', 'E'].map(id => memoOf({ id, title: `任务${id}` }));
        Core.reconcile(w, Core.pendingTasks(memos), { instant: true });
        const snapshot = new Map(w.jellies.map(j => [j.taskId, [j.id, j.color, JSON.stringify(j.look)]]));
        const target = ['A', 'B', 'C', 'D', 'E'][seed % 5];
        Core.reconcile(w, Core.pendingTasks(memos.filter(m => m.id !== target)));
        const leaving = w.jellies.filter(j => j.state === 'leaving');
        assert.deepEqual(leaving.map(j => j.taskId), [target], `seed ${seed}`);
        for (const j of alive(w)) assert.deepEqual([j.id, j.color, JSON.stringify(j.look)], snapshot.get(j.taskId));
    }
});

test('reconcile（任务名单）：任务表顺序变化不换水母；任务改名只更新任务名；新任务游进来一只新的', () => {
    const w = world();
    const A = memoOf({ id: 'A', title: '甲' });
    const B = memoOf({ id: 'B', title: '乙' });
    Core.reconcile(w, Core.pendingTasks([A, B]), { instant: true });
    const ids = w.jellies.map(j => j.id);
    Core.reconcile(w, Core.pendingTasks([B, A]));
    assert.deepEqual(w.jellies.map(j => j.id), ids, '顺序变了，水母还是原来那两只');
    Core.reconcile(w, Core.pendingTasks([B, { ...A, title: '甲改名' }]));
    assert.deepEqual(w.jellies.map(j => j.id), ids);
    assert.equal(w.jellies.find(j => j.taskId === 'A').label, '甲改名');
    Core.reconcile(w, Core.pendingTasks([B, A, memoOf({ id: 'C', title: '丙' })]));
    assert.equal(alive(w).length, 3);
    const fresh = w.jellies.find(j => j.taskId === 'C');
    assert.ok(fresh && fresh.state === 'entering' && fresh.y > w.height, '新任务的水母从屏幕下方游进来');
});

test('reconcile（任务名单）：离开中的水母不会被复活；同一个任务又出现时（取消完成）新来一只', () => {
    const w = world();
    const A = memoOf({ id: 'A' });
    const B = memoOf({ id: 'B' });
    Core.reconcile(w, Core.pendingTasks([A, B]), { instant: true });
    const first = w.jellies.find(j => j.taskId === 'A');
    Core.reconcile(w, Core.pendingTasks([B]));
    assert.equal(first.state, 'leaving');
    Core.reconcile(w, Core.pendingTasks([A, B]));
    assert.equal(first.state, 'leaving', '正在离开的那只不复活');
    const again = w.jellies.filter(j => j.taskId === 'A' && j.state !== 'leaving');
    assert.equal(again.length, 1);
    assert.notEqual(again[0].id, first.id);
});

test('任务身份：数字 7 与字符串 \'7\' 是两个任务，名单顺序变了各自的水母也不换主人（不会张冠李戴）', () => {
    const w = world();
    const num = memoOf({ id: 7, title: '数字七' });
    const str = memoOf({ id: '7', title: '字符串七' });
    Core.reconcile(w, Core.pendingTasks([num, str]), { instant: true });
    run(w, 2.2);
    const jn = w.jellies.find(j => j.taskId === 7);
    const js = w.jellies.find(j => j.taskId === '7');
    assert.ok(jn && js && jn !== js);
    Core.reconcile(w, Core.pendingTasks([str, num]));
    assert.strictEqual(w.jellies.find(j => j.taskId === 7), jn);
    assert.strictEqual(w.jellies.find(j => j.taskId === '7'), js);
    assert.equal(jn.label, '数字七');
    assert.equal(js.label, '字符串七');
    assert.equal(w.jellies.filter(j => j.state === 'leaving').length, 0, '谁也没被赶走');
    assert.notEqual(jn.taskKey, js.taskKey);
});

test('reconcile（任务名单）：只给最靠前的 MAX_COUNT（省流量 MAX_COUNT_LOW）个任务配水母；更紧迫的任务插队时挤掉最靠后的那只', () => {
    const memos = Array.from({ length: 12 }, (_, i) => memoOf({ id: `m${i}` }));
    const w = world();
    assert.equal(Core.reconcile(w, Core.pendingTasks(memos), { instant: true }), P.MAX_COUNT);
    assert.deepEqual(keysOf(w).length, P.MAX_COUNT);
    assert.deepEqual(w.jellies.map(j => j.taskId), memos.slice(0, P.MAX_COUNT).map(m => m.id));
    const urgent = memoOf({ id: 'urgent', priority: 'high' });
    Core.reconcile(w, Core.pendingTasks([...memos, urgent]));
    assert.ok(w.jellies.find(j => j.taskId === 'urgent'), '紧迫的任务有了水母');
    const pushedOut = w.jellies.find(j => j.taskId === `m${P.MAX_COUNT - 1}`);
    assert.equal(pushedOut.state, 'leaving', '原来排在最后的那只让位');
    assert.equal(alive(w).length, P.MAX_COUNT);

    const low = world({ lowPower: true });
    assert.equal(Core.reconcile(low, Core.pendingTasks(memos), { instant: true }), P.MAX_COUNT_LOW);
    assert.deepEqual(low.jellies.map(j => j.taskId), memos.slice(0, P.MAX_COUNT_LOW).map(m => m.id));
});

test('reconcile（任务名单）：空名单全部离开；名单里的坏条目与重复 key 被忽略，不抛错', () => {
    const w = world();
    Core.reconcile(w, entries(memoOf({ id: 'A' }), memoOf({ id: 'B' })), { instant: true });
    assert.equal(Core.reconcile(w, []), 0);
    assert.ok(w.jellies.every(j => j.state === 'leaving'));
    const messy = [null, 3, 'x', {}, { key: 5 }, { key: 'k1', label: 'ok', id: 'k1' }, { key: 'k1', label: 'dup', id: 'k1' }, { key: 'k2', label: 7, id: undefined }];
    const w2 = world();
    assert.doesNotThrow(() => Core.reconcile(w2, messy, { instant: true }));
    assert.deepEqual(alive(w2).map(j => j.taskKey), ['k1', 'k2']);
    assert.equal(alive(w2)[0].label, 'ok');
    assert.equal(alive(w2)[1].label, '', '标签不是字符串时按空处理');
    assert.equal(alive(w2)[1].taskId, null);
});

test('reconcile（任务名单）：同屏纯色与多色都有、颜色互不相同的规则对绑定任务的水母同样成立（含 400 轮随机增减）', () => {
    const random = seeded(21);
    const w = world({ random: seeded(5) });
    const pool = Array.from({ length: 14 }, (_, i) => memoOf({ id: `p${i}`, priority: ['high', 'medium', 'low', undefined][i % 4] }));
    for (let round = 0; round < 400; round++) {
        const chosen = pool.filter(() => random() < 0.5);
        Core.reconcile(w, Core.pendingTasks(chosen), { instant: round === 0 });
        run(w, random() * 0.7);
        const colors = alive(w).map(j => j.color);
        assert.equal(new Set(colors).size, colors.length, `第 ${round} 轮：颜色 ${colors}`);
        const keys = alive(w).map(j => j.taskKey);
        assert.equal(new Set(keys).size, keys.length, `第 ${round} 轮：同一个任务只有一只水母`);
    }
});

test('reconcile：仍然兼容旧的“数量”调用（匿名水母）；任务名单模式下匿名水母不在名单里会离开', () => {
    const w = populated(3);
    assert.ok(w.jellies.every(j => j.taskKey == null && j.label === ''), '数量模式的水母没有任务');
    Core.reconcile(w, entries(memoOf({ id: 'A' })));
    assert.equal(alive(w).length, 1);
    assert.equal(alive(w)[0].taskId, 'A');
    assert.equal(w.jellies.filter(j => j.state === 'leaving').length, 3);
});

test('hot：指针靠近（钟罩中心 HOT_REACH × 半径以内）时任务名变清楚，离开或没有指针后退回隐约；走开中的水母不亮', () => {
    assert.ok(P.HOT_REACH > 1.2 && P.HOT_RATE > 0);
    const w = populated(1, { random: seeded(2) });
    const j = w.jellies[0];
    j.homeAt = Infinity;                    // 不让它漫游，位置基本不变
    run(w, 2.2);                            // 淡入完成
    assert.equal(j.hot, 0, '没有指针时是 0');
    // 指针每次都是“重新进入”：先空一帧（has=false，速度清零），否则一下子跳过去会被当成快速划过而惊动水母
    const at = reach => { run(w, 0.05); return { x: j.x + j.r * reach, y: j.y }; };
    const near = at(P.HOT_REACH - 0.4);
    run(w, 0.8, { pointer: near });
    assert.ok(j.hot > 0.95, `靠近后 hot=${j.hot}`);
    run(w, 0.05);
    const far = at(P.HOT_REACH + 0.6);
    run(w, 1.2, { pointer: far });
    assert.ok(j.hot < 0.05, `离远后 hot=${j.hot}`);
    const again = at(P.HOT_REACH - 0.4);
    run(w, 0.8, { pointer: again });
    assert.ok(j.hot > 0.95, `再靠近 hot=${j.hot}`);
    run(w, 1.2);                            // 指针离开窗口（没有指针）
    assert.ok(j.hot < 0.05, `没有指针后 hot=${j.hot}`);
    const last = at(P.HOT_REACH - 0.4);
    run(w, 0.016, { pointer: last });
    assert.ok(j.hot > 0 && j.hot < 0.5, `一帧之内是渐变而不是跳变：${j.hot}`);
    run(w, 1, { pointer: last });
    assert.ok(j.hot > 0.95);
    Core.reconcile(w, 0);
    assert.equal(j.state, 'leaving');
    run(w, 0.5, { pointer: { x: j.x, y: j.y } });
    assert.ok(j.hot < 0.1, `离开中的水母不再亮：${j.hot}`);
    assert.deepEqual(allFinite(w), []);
});

// ---------- 抓取：把水母抓起来、拖到纸篓里完成任务（2026-10-15） ----------
// 核心只管物理与状态：hitTest 命中谁、grab 抓住（水母跟着指针走，像被捏着钟顶）、setBusy 停在纸篓口等回执、
// release 松手（带甩出去的速度）、consume 被纸篓吃掉。谁说了算（是否落进纸篓、任务是否真的完成）由控制器与 memo 层负责。

const stableWorld = (count = 1, options = {}) => {
    const w = populated(count, { random: seeded(2), ...options });
    for (const j of w.jellies) j.homeAt = Infinity;       // 不漫游：位置只由本测试里的操作决定
    run(w, 2.2);                                           // 淡入完成
    for (const j of w.jellies) { j.tilt = 0; j.heading = 0; j.vx = 0; j.vy = 0; j.pulseT = 99; }   // 几何判断从正立、静止开始
    return w;
};
const bellOf = j => Core.bellShape(j);
/** 指针“重新进入”：先空一帧（has=false、速度清零），不然一下子跳过去会被当成快速划过而惊动水母。 */
const reenter = w => run(w, 0.02);

test('抓取参数：冻结在 PARAMS 里，取值自洽（命中区比钟罩略大、弹簧欠阻尼不过头、甩出速度有上限、被吃掉的时间合理）', () => {
    for (const key of ['HIT_SCALE', 'HIT_PAD', 'HIT_DROP', 'HOLD_STIFFNESS', 'HOLD_DAMPING', 'HOLD_OFFSET', 'THROW_MAX', 'EAT_S']) {
        assert.ok(Number.isFinite(P[key]) && P[key] > 0, key);
    }
    assert.ok(P.HIT_SCALE >= 1 && P.HIT_PAD >= 4, '命中区不比看得见的钟罩小，留出手抖的余量');
    assert.ok(P.HOLD_OFFSET > 0 && P.HOLD_OFFSET <= 1);
    const critical = 2 * Math.sqrt(P.HOLD_STIFFNESS);
    assert.ok(P.HOLD_DAMPING < critical && P.HOLD_DAMPING > critical * 0.6, `阻尼 ${P.HOLD_DAMPING} 略低于临界 ${critical.toFixed(1)}：有一点弹性但不会来回晃`);
    assert.ok(Math.sqrt(P.HOLD_STIFFNESS) * P.MAX_DT < 1.2, '半隐式欧拉在最长步长下稳定');
    assert.ok(P.EAT_S >= 0.25 && P.EAT_S <= 1);
});

test('hitTest：钟罩内命中；超出命中区没有；命中区比看得见的钟罩大一圈；裙边下方一小段也算', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    const { w: bw, h: bh } = bellOf(j);
    assert.equal(Core.hitTest(w, j.x, j.y - bh * 0.5), j);
    assert.equal(Core.hitTest(w, j.x, j.y), j);
    assert.equal(Core.hitTest(w, j.x + (bw * P.HIT_SCALE + P.HIT_PAD) * 0.9, j.y - 1), j, '命中区的边缘以内');
    assert.equal(Core.hitTest(w, j.x + bw * 1.1, j.y - 2), j, '看得见的钟罩之外一点点也算（手抖的余量）');
    assert.equal(Core.hitTest(w, j.x + (bw * P.HIT_SCALE + P.HIT_PAD) * 1.3, j.y - 2), null, '再往外就没有了');
    assert.equal(Core.hitTest(w, j.x, j.y - (bh * P.HIT_SCALE + P.HIT_PAD) * 1.3), null, '钟顶上方');
    assert.equal(Core.hitTest(w, j.x, j.y + j.r * P.HIT_DROP * 0.8), j, '裙边下面一小段');
    assert.equal(Core.hitTest(w, j.x, j.y + j.r * P.HIT_DROP + P.HIT_PAD + 20), null, '触须区域不算');
    assert.equal(Core.hitTest(w, j.x + 9999, j.y), null);
});

test('hitTest：钟罩倾斜时命中区跟着转；坏坐标返回 null；没有水母返回 null', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    const { w: bw } = bellOf(j);
    const reach = (bw * P.HIT_SCALE + P.HIT_PAD) * 0.9;
    // 钟罩自己坐标系里的“正右方”一点，换算成屏幕上的点：倾斜 0.5 弧度时它在右下方
    const along = { x: j.x + Math.cos(0.5) * reach, y: j.y + Math.sin(0.5) * reach };
    j.tilt = 0;
    assert.equal(Core.hitTest(w, along.x, along.y), null, '不倾斜时，这个点在命中区之外（右下角）');
    j.tilt = 0.5;
    assert.equal(Core.hitTest(w, along.x, along.y), j, '倾斜之后命中区跟着转，这个点在它里面');
    assert.equal(Core.hitTest(w, j.x + reach, j.y), j, '倾斜后水平方向仍然够得着（命中区是椭圆，不是线）');
    for (const bad of [[NaN, 5], [5, NaN], [Infinity, 0], ['a', 1], [undefined, undefined]]) assert.equal(Core.hitTest(w, ...bad), null);
    assert.equal(Core.hitTest(world(), 10, 10), null);
});

test('hitTest：离开中、被吃中、几乎透明的水母不能被抓；重叠时抓到画在最上面的（半径大的）那只', () => {
    const w = stableWorld(2);
    const [a, b] = w.jellies;
    a.x = b.x = 600; a.y = b.y = 400; a.vx = a.vy = b.vx = b.vy = 0;
    a.r = 40; b.r = 52;
    assert.equal(Core.hitTest(w, 600, 395), b, '大的盖在上面');
    b.state = 'leaving';
    assert.equal(Core.hitTest(w, 600, 395), a, '离开中的不算，轮到下面那只');
    b.state = 'eating';
    assert.equal(Core.hitTest(w, 600, 395), a);
    b.state = 'alive';
    b.alpha = 0.3;
    assert.equal(Core.hitTest(w, 600, 395), a, '还没淡入出来的不算');
    b.alpha = 1;
    a.alpha = 0.3;
    b.state = 'leaving';
    assert.equal(Core.hitTest(w, 600, 395), null);
});

test('hitTest：已被抓着、或停在纸篓口等回执的水母不再被命中（重叠时轮到下面那只），放开后又能命中', () => {
    const w = stableWorld(2);
    const [a, b] = w.jellies;
    a.x = b.x = 600; a.y = b.y = 400; a.vx = a.vy = b.vx = b.vy = 0;
    a.r = 40; b.r = 52;
    assert.equal(Core.hitTest(w, 600, 395), b);
    assert.equal(Core.grab(w, b, 600, 395), true);
    assert.equal(Core.hitTest(w, 600, 395), a, '被抓着的不再算，轮到下面那只');
    Core.setBusy(w, b, 600, 400);
    assert.equal(Core.hitTest(w, 600, 395), a, '等回执的也不算');
    Core.release(w, b);
    assert.equal(Core.hitTest(w, 600, 395), b, '放开后又能命中');
});

test('grab：抓住命中的水母（hot=1，一次只能抓一只，也不能在有水母等回执时再抓）；抓不到的返回 false', () => {
    const w = stableWorld(3);
    const [a, b] = w.jellies;
    assert.equal(Core.grab(w, a, a.x + 5, a.y - 5), true);
    assert.ok(a.held && a.hot === 1);
    assert.equal(Core.grab(w, b, b.x, b.y), false, '已经抓着一只');
    assert.equal(Core.grab(w, a, a.x, a.y), false, '同一只不重复抓');
    Core.release(w, a);
    assert.equal(a.held, null);
    assert.equal(Core.grab(w, a, a.x + 3000, a.y), false, '指针不在这只水母身上');
    assert.equal(Core.grab(w, { not: 'a jelly' }, 1, 1), false);
    assert.equal(Core.grab(w, 9999, 1, 1), false, '按编号找不到');
    assert.equal(Core.grab(w, b.id, b.x, b.y), true, '也可以按编号抓');
    Core.setBusy(w, b, 700, 700);
    assert.equal(Core.grab(w, a, a.x, a.y), false, '有水母停在纸篓口等回执时不再抓别的');
    a.state = 'leaving';
    Core.release(w, b);
    assert.equal(Core.grab(w, a, a.x, a.y), false, '离开中的水母不能抓');
});

test('抓着的水母：跟着指针走（带一点弹性），不再漫游、下沉和被惊动；指针停下后稳稳停在它旁边', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    const startX = j.x, startY = j.y;
    assert.equal(Core.grab(w, j, j.x + 12, j.y - 10), true);
    const offsetX = j.x - (startX + 12), offsetY = j.y - (startY - 10);
    // 指针匀速向右下方拖 600px，用 1 秒
    const from = { x: startX + 12, y: startY - 10 };
    const to = { x: from.x + 420, y: from.y + 260 };
    reenter(w);
    let maxLag = 0;
    for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const pointer = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
        Core.step(w, 16.67, { pointer });
        maxLag = Math.max(maxLag, Math.hypot(pointer.x + offsetX * P.HOLD_OFFSET - j.x, pointer.y + offsetY * P.HOLD_OFFSET - j.y));
    }
    assert.ok(maxLag > 4, `有弹性的跟随会落后一点：${maxLag.toFixed(1)}`);
    assert.ok(maxLag < 220, `但不会落后太多：${maxLag.toFixed(1)}`);
    run(w, 1.5, { pointer: to });
    assert.ok(Math.hypot(to.x + offsetX * P.HOLD_OFFSET - j.x, to.y + offsetY * P.HOLD_OFFSET - j.y) < 1.5, '停下后落在指针旁（保持抓取时的相对位置）');
    assert.ok(Math.hypot(j.vx, j.vy) < 1, '速度收敛');
    run(w, 6, { pointer: to });                              // 久抓不动：没有下沉、没有漫游
    assert.ok(Math.hypot(to.x + offsetX * P.HOLD_OFFSET - j.x, to.y + offsetY * P.HOLD_OFFSET - j.y) < 1.5);
    assert.deepEqual(allFinite(w), []);
});

test('抓着的水母不会被快速划过的指针惊跑；指针一下子跳到很远也不会飞出去（速度有上限、数值有限）', () => {
    const w = stableWorld(2);
    const j = w.jellies[0];
    Core.grab(w, j, j.x, j.y);
    reenter(w);
    let pointer = { x: j.x, y: j.y };
    run(w, 0.3, () => { pointer = { x: pointer.x + 30, y: pointer.y }; return { pointer }; });      // 约 1800 px/s 的快速拖动
    const dxToPointer = Math.abs(pointer.x - j.x);
    assert.ok(dxToPointer < 260, `一直跟着，没有被吓跑：${dxToPointer.toFixed(0)}`);
    pointer = { x: pointer.x + 3000, y: pointer.y - 2000 };
    run(w, 0.5, () => ({ pointer }));
    assert.deepEqual(allFinite(w), []);
    assert.ok(Math.hypot(j.vx, j.vy) < 6000, `速度有限：${Math.hypot(j.vx, j.vy).toFixed(0)}`);
    run(w, 3, () => ({ pointer }));
    assert.ok(Math.hypot(pointer.x - j.x, pointer.y - j.y) < 80, '最终追上');
});

test('抓着时指针一下子跳到很远：速度被夹在 HOLD_MAX_SPEED 内（弹簧不会把水母弹飞），最终仍追上', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    Core.grab(w, j, j.x, j.y);
    reenter(w);
    const far = { x: j.x + 5000, y: j.y };
    let peak = 0;
    for (let i = 0; i < 90; i++) {
        Core.step(w, 16.67, { pointer: far });
        peak = Math.max(peak, Math.hypot(j.vx, j.vy));
    }
    assert.ok(peak <= P.HOLD_MAX_SPEED + 1e-6, `速度峰值 ${peak.toFixed(0)} 不超过上限 ${P.HOLD_MAX_SPEED}`);
    assert.ok(peak > P.HOLD_MAX_SPEED * 0.9, `这个场景确实触到了上限：${peak.toFixed(0)}`);
    assert.deepEqual(allFinite(w), []);
    run(w, 6, { pointer: far });
    assert.ok(Math.hypot(far.x - j.x, far.y - j.y) < 120, '最终追上');
});

test('抓着时指针消失（离开窗口）：停在最后的位置，不乱跑；坏的指针值被忽略', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    Core.grab(w, j, j.x, j.y);
    reenter(w);
    const spot = { x: j.x + 100, y: j.y + 50 };
    run(w, 1.5, { pointer: spot });
    const settled = { x: j.x, y: j.y };
    run(w, 2);                                               // 没有指针
    assert.ok(Math.hypot(j.x - settled.x, j.y - settled.y) < 2, '保持在原处');
    run(w, 0.5, { pointer: { x: NaN, y: 3 } });
    assert.ok(Math.hypot(j.x - settled.x, j.y - settled.y) < 2, '坏指针被忽略');
    assert.deepEqual(allFinite(w), []);
});

test('指针正瞄准水母（落在命中区内）时快速划过不吓它；在命中区外、惊动半径内仍然会惊动', () => {
    // 同一个种子建两个世界：一个有指针来回快速扫（每帧 40px ≈ 2400px/s），一个没有指针；比较水母位置差
    const drift = centreOf => {
        const withPointer = stableWorld(1);
        const control = stableWorld(1);
        const j = withPointer.jellies[0];
        const centre = centreOf(j);
        for (let i = 0; i < 14; i++) {
            Core.step(withPointer, 16.67, { pointer: { x: centre.x - 20 + 40 * (i % 2), y: centre.y } });
            Core.step(control, 16.67, {});
        }
        const a = withPointer.jellies[0];
        const b = control.jellies[0];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const aiming = drift(j => ({ x: j.x, y: j.y - bellOf(j).h * 0.4 }));
    const passing = drift(j => ({ x: j.x + j.r * 2.4, y: j.y }));
    assert.ok(aiming < 1e-9, `瞄准时水母一动不动（相对没有指针）：${aiming}`);
    assert.ok(passing > 1, `命中区外被惊动：${passing.toFixed(2)} px`);
});

test('setBusy：抓着的水母停到纸篓口（弹簧拉过去并停住），等回执期间不再跟指针；别人 reconcile 也不会把它赶走', () => {
    const w = stableWorld(2);
    const [a, b] = w.jellies;
    a.taskKey = 'ka'; a.taskId = 'a'; b.taskKey = 'kb'; b.taskId = 'b';
    Core.grab(w, a, a.x, a.y);
    const mouth = { x: w.width - 60, y: w.height - 90 };
    assert.equal(Core.setBusy(w, a, mouth.x, mouth.y), true);
    assert.equal(a.held, null);
    assert.deepEqual(a.busy, mouth);
    reenter(w);
    run(w, 1.6, { pointer: { x: 10, y: 10 } });               // 指针去了别处也不管
    assert.ok(Math.hypot(a.x - mouth.x, a.y - mouth.y) < 2, `停在纸篓口：${a.x.toFixed(1)},${a.y.toFixed(1)}`);
    assert.ok(Math.hypot(a.vx, a.vy) < 1);
    // 它的任务已经完成（名单里没有了），但它在等回执，不能被当作“该离开”
    Core.reconcile(w, [{ key: 'kb', id: 'b', label: 'B' }]);
    assert.equal(a.state, 'alive');
    assert.equal(b.state, 'alive');
    assert.equal(Core.setBusy(w, b, 1, 1), false, '没被抓住的不能直接设为等待');
    assert.equal(Core.setBusy(w, a, 1, 1), false, '已经在等待的不重复');
    assert.deepEqual(allFinite(w), []);
});

test('release：松手后水母带着甩出的速度继续游（速度有上限），重新开始漫游；没被抓住的返回 false', () => {
    const w = stableWorld(1);
    const j = w.jellies[0];
    assert.equal(Core.release(w, j), false, '没被抓住');
    Core.grab(w, j, j.x, j.y);
    assert.equal(Core.release(w, j, { vx: 300, vy: -400 }), true);
    assert.equal(j.held, null);
    assert.ok(Math.abs(Math.hypot(j.vx, j.vy) - 500) < 1e-6, '带着指针的速度');
    assert.ok(Number.isFinite(j.homeAt) && j.homeAt <= w.time + 0.01, '马上重新挑一个漫游点');
    Core.grab(w, j, j.x, j.y);
    Core.release(w, j, { vx: 1e6, vy: 0 });
    assert.ok(Math.hypot(j.vx, j.vy) <= P.THROW_MAX + 1e-6, '甩出的速度被夹在上限内');
    Core.grab(w, j, j.x, j.y);
    Core.release(w, j, { vx: NaN, vy: Infinity });
    assert.equal(j.vx, 0);
    assert.equal(j.vy, 0);
    Core.grab(w, j, j.x, j.y);
    Core.setBusy(w, j, 500, 500);
    assert.equal(Core.release(w, j), true, '等回执时也可以放回去（完成失败）');
    assert.equal(j.busy, null);
    run(w, 3);
    assert.deepEqual(allFinite(w), []);
});

test('consume：水母被纸篓吃掉——飞向纸篓口、变小、淡出，EAT_S 之后从世界里消失；吃的过程中不可抓、不算在场', () => {
    const w = stableWorld(3);
    const [a] = w.jellies;
    const colour = a.color;
    Core.grab(w, a, a.x, a.y);
    Core.setBusy(w, a, w.width - 60, w.height - 90);
    run(w, 1);
    const r0 = a.r;
    assert.equal(Core.consume(w, a, w.width - 60, w.height - 90), true);
    assert.equal(a.state, 'eating');
    assert.equal(a.busy, null);
    assert.equal(Core.hitTest(w, a.x, a.y), null, '被吃的不可抓');
    assert.equal(alive(w).length, 2, '不再算在场');
    const radii = [];
    for (let i = 0; i < 40 && w.jellies.includes(a); i++) { Core.step(w, 16.67, {}); radii.push(a.r); }
    assert.ok(radii[radii.length - 1] < r0 * 0.6 || !w.jellies.includes(a), '越来越小');
    for (let i = 1; i < radii.length; i++) assert.ok(radii[i] <= radii[i - 1] + 1e-9, '半径单调变小');
    run(w, P.EAT_S + 0.3);
    assert.ok(!w.jellies.includes(a), `过了 EAT_S 就移除（颜色 ${colour}）`);
    assert.equal(w.jellies.length, 2);
    assert.equal(Core.consume(w, 424242, 1, 1), false);
    assert.deepEqual(allFinite(w), []);
});

test('consume：离开中或已经在被吃的水母不能再吃（状态与吃的数据不被改写）；坏坐标不吃', () => {
    const w = stableWorld(3);
    const [a, b, c] = w.jellies;
    a.state = 'leaving';
    assert.equal(Core.consume(w, a, 700, 800), false);
    assert.equal(a.state, 'leaving');
    assert.equal(a.eat, null);
    assert.equal(Core.grab(w, b, b.x, b.y), true);
    assert.equal(Core.consume(w, b, 700, 800), true);
    const eat = b.eat;
    assert.equal(Core.consume(w, b, 100, 100), false, '已经在被吃');
    assert.strictEqual(b.eat, eat);
    assert.deepEqual([b.eat.x, b.eat.y], [700, 800]);
    for (const bad of [[NaN, 5], [5, Infinity], ['x', 1], [undefined, undefined]]) assert.equal(Core.consume(w, c, ...bad), false);
    assert.equal(c.state, 'alive');
});

test('consume：被吃的过程中透明度单调降到接近 0、半径单调变小，到 EAT_S 才移除', () => {
    const w = stableWorld(2);
    const a = w.jellies[0];
    const startAlpha = a.alpha;
    Core.grab(w, a, a.x, a.y);
    Core.consume(w, a, w.width - 60, w.height - 90);
    const alphas = [];
    let elapsed = 0;
    while (w.jellies.includes(a) && elapsed < 2) {
        Core.step(w, 16, {});
        elapsed += 0.016;
        if (w.jellies.includes(a)) alphas.push(a.alpha);
    }
    assert.ok(alphas.length >= 10, '吃的过程有足够多帧可观察');
    for (let i = 1; i < alphas.length; i++) assert.ok(alphas[i] <= alphas[i - 1] + 1e-9, '透明度单调下降');
    assert.ok(alphas[Math.floor(alphas.length / 2)] < startAlpha * 0.8, `过半时已明显变淡：${alphas[Math.floor(alphas.length / 2)].toFixed(2)}`);
    assert.ok(alphas[alphas.length - 1] < 0.15, `快吃完时几乎透明：${alphas[alphas.length - 1].toFixed(2)}`);
    assert.ok(elapsed >= P.EAT_S - 0.05 && elapsed <= P.EAT_S + 0.1, `大约 EAT_S 后移除：${elapsed.toFixed(2)}`);
});

test('consume：被吃中的水母的颜色按“正在淡出”处理——新水母不撞它；它的任务名单变化也不会复活它', () => {
    const w = stableWorld(4, { random: seeded(11) });
    const eaten = w.jellies[0];
    eaten.taskKey = 'k0'; eaten.taskId = 'x';
    Core.grab(w, eaten, eaten.x, eaten.y);
    Core.consume(w, eaten, 700, 800);
    Core.reconcile(w, 4);
    const fresh = w.jellies[w.jellies.length - 1];
    assert.notEqual(fresh, eaten);
    assert.notEqual(fresh.color, eaten.color, '新来的不借用正被吃掉的那只的颜色（还有空闲颜色时）');
    assert.equal(eaten.state, 'eating', '状态不被 reconcile 改动');
});

test('reconcile：抓着或等回执的水母，任务不在名单里也不会被赶走；放手后再对一次名单就会离开', () => {
    const w = world();
    const A = memoOf({ id: 'A' });
    const B = memoOf({ id: 'B' });
    Core.reconcile(w, Core.pendingTasks([A, B]), { instant: true });
    run(w, 2.2);
    const a = w.jellies.find(j => j.taskId === 'A');
    Core.grab(w, a, a.x, a.y);
    Core.reconcile(w, Core.pendingTasks([B]));                       // A 在别处被完成了
    assert.equal(a.state, 'alive', '正被抓着：先不动它');
    assert.ok(a.held);
    Core.release(w, a);
    Core.reconcile(w, Core.pendingTasks([B]));
    assert.equal(a.state, 'leaving', '放手后按名单离开');
    // 数量模式同样不动被抓着的
    const w2 = populated(3);
    run(w2, 2.2);
    const held = w2.jellies[0];
    Core.grab(w2, held, held.x, held.y);
    for (let i = 0; i < 20; i++) { Core.reconcile(w2, 1); }
    assert.equal(held.state, 'alive');
    assert.equal(w2.jellies.filter(j => j.state === 'leaving').length, 2);
});

test('抓取的随机增减：任意次抓、放、等、吃与名单变化之后，世界仍然一致（每个任务至多一只在场水母、数值有限、被吃的最终都会移除）', () => {
    const random = seeded(77);
    const w = world({ random: seeded(9) });
    const pool = Array.from({ length: 12 }, (_, i) => memoOf({ id: `g${i}` }));
    let active = pool.slice(0, 6);
    for (let round = 0; round < 300; round++) {
        Core.reconcile(w, Core.pendingTasks(active), { instant: round === 0 });
        const live = alive(w);
        const roll = random();
        if (roll < 0.25 && live.length) {
            const j = live[Math.floor(random() * live.length)];
            if (Core.grab(w, j, j.x, j.y) && random() < 0.6) {
                Core.setBusy(w, j, w.width - 60, w.height - 90);
                if (random() < 0.6) { active = active.filter(m => m.id !== j.taskId); Core.consume(w, j, w.width - 60, w.height - 90); } else Core.release(w, j, { vx: 100, vy: -100 });
            } else if (j.held) Core.release(w, j, { vx: 50, vy: 0 });
        } else if (roll < 0.5) {
            const m = pool[Math.floor(random() * pool.length)];
            active = active.some(x => x.id === m.id) ? active.filter(x => x.id !== m.id) : [...active, m];
        }
        run(w, random() * 0.4, { pointer: { x: random() * w.width, y: random() * w.height } });
        const keys = alive(w).map(j => j.taskKey);
        assert.equal(new Set(keys).size, keys.length, `第 ${round} 轮：同一个任务出现了两只在场水母`);
        assert.deepEqual(allFinite(w), [], `第 ${round} 轮`);
    }
    run(w, 3);
    assert.ok(w.jellies.every(j => j.state !== 'eating'), '被吃的水母都已移除');
});

// ---------- 步进 ----------

test('淡入：ENTER_S 内 alpha 升到 1 并进入 alive；淡出：LEAVE_S 内降到 0 后从世界移除', () => {
    const w = populated(2);
    run(w, P.ENTER_S + 0.1);
    assert.ok(w.jellies.every(j => j.alpha === 1 && j.state === 'alive'));

    Core.reconcile(w, 1);
    const going = w.jellies.find(j => j.state === 'leaving');
    const startY = going.y;
    // 离开的水母每拍都收缩：给它每秒一拍
    run(w, P.LEAVE_S + 0.2, i => ({ beat: 100 + Math.floor(i * 16 / 1000) }));
    assert.ok(!w.jellies.includes(going), '淡出后移除');
    assert.equal(w.jellies.length, 1);
    assert.ok(going.y < startY, '离开时向上游走');
});

test('dt 防护：0、负数、NaN、Infinity 什么都不做；超大步长按 MAX_DT 算', () => {
    const w = populated(3);
    const snapshot = JSON.stringify(w.jellies);
    for (const dt of [0, -16, NaN, Infinity, -Infinity, undefined, null, 'abc', 1e-9]) {
        Core.step(w, dt, {});
        assert.equal(JSON.stringify(w.jellies), snapshot, `dt=${dt}`);
        assert.equal(w.time, 0);
    }
    Core.step(w, 60_000, {});
    assert.ok(Math.abs(w.time - P.MAX_DT) < 1e-12, '标签页刚恢复时一步只前进 MAX_DT');
    assert.deepEqual(allFinite(w), []);
});

test('拍点：每只水母只在 (拍 % 周期) === 偏移 的那一拍收缩，同一拍内的后续帧不重复触发', () => {
    const w = populated(P.MAX_COUNT);
    run(w, 0.5);
    const pulsedOn = new Map(w.jellies.map(j => [j.id, []]));
    for (let beat = 1; beat <= 12; beat++) {
        for (let frame = 0; frame < 5; frame++) {
            const before = new Map(w.jellies.map(j => [j.id, j.pulseT]));
            Core.step(w, 16, { beat });
            for (const j of w.jellies) if (j.pulseT < before.get(j.id)) pulsedOn.get(j.id).push(beat);
        }
        run(w, 0.4, { beat });   // 同一拍内继续走帧
    }
    for (const j of w.jellies) {
        const expected = [];
        for (let beat = 1; beat <= 12; beat++) if (beat % j.period === j.offset) expected.push(beat);
        assert.deepEqual(pulsedOn.get(j.id), expected, `slot ${j.slot} 周期 ${j.period} 偏移 ${j.offset}`);
    }
});

test('没有拍点（null/undefined）就不会收缩；一次收缩让水母获得沿航向的速度', () => {
    const w = populated(1);
    const j = w.jellies[0];
    run(w, 3, { beat: null });
    assert.equal(j.pulseT, 99, '从未触发过收缩：保持初始的“很久以前”');
    run(w, 3, { beat: undefined });
    assert.equal(j.pulseT, 99);
    j.heading = 0; j.vx = 0; j.vy = 0; j.lastBeat = null;
    j.y = j.home.y + w.height * P.HOVER_SPAN * 2;      // 比漫游点深得多：推力满格（推力随深度调节，见下面的 thrustScale 测试）
    const beat = j.offset;               // 这一拍满足 拍 % 周期 === 偏移
    Core.step(w, 16, { beat });
    assert.ok(j.pulseT < 0.05, '触发了收缩');
    assert.ok(j.vy < -40, `向上获得速度 ${j.vy}`);
    assert.ok(Math.abs(j.vx) < 30);
});

test('thrustScale：比漫游点深就满推力，正好在漫游点是 HOVER_THRUST，比它浅得多是 HOVER_MIN，随深度单调不减；非法输入一律按 1', () => {
    const w = populated(1);
    const j = w.jellies[0];
    const span = w.height * P.HOVER_SPAN;
    const home = { x: 700, y: 450 };
    j.home = home;
    const at = y => { j.y = y; return Core.thrustScale(w, j); };
    assert.equal(at(450), P.HOVER_THRUST);
    assert.ok(Math.abs(at(450 + span) - 1) < 1e-12);
    assert.equal(at(450 + span * 7), 1);
    assert.equal(at(450 - span), P.HOVER_MIN);
    assert.equal(at(450 - span * 7), P.HOVER_MIN);
    assert.ok(Math.abs(at(450 + span * 0.5) - (P.HOVER_THRUST + (1 - P.HOVER_THRUST) * 0.5)) < 1e-12, '之间线性变化');
    let last = 0;
    for (let y = -400; y <= 1500; y += 10) {
        const value = at(y);
        assert.ok(value >= P.HOVER_MIN && value <= 1, `y=${y} → ${value}`);
        assert.ok(value >= last - 1e-12, `随深度单调不减 y=${y}`);
        last = value;
    }
    j.y = 450;
    j.home = undefined;
    assert.equal(Core.thrustScale(w, j), 1, '没有漫游点');
    j.home = { x: 1, y: NaN };
    assert.equal(Core.thrustScale(w, j), 1, '漫游点不是有限数');
    j.home = home;
    j.y = NaN;
    assert.equal(Core.thrustScale(w, j), 1, '水母位置不是有限数');
    j.y = 450;
    assert.equal(Core.thrustScale(null, j), 1);
    assert.equal(Core.thrustScale(w, null), 1);
    assert.equal(Core.thrustScale(w, undefined), 1);
    assert.ok(Number.isFinite(Core.thrustScale({ ...w, height: 0 }, j)), '屏幕高度为 0 也不会算出非有限数');
});

test('收缩的推力随深度调节：深处满格，漫游点高度是 HOVER_THRUST 倍，上方只剩 HOVER_MIN 倍；被惊动的那一下同样调节，被抓着挣扎的收缩不调节', () => {
    const span = 900 * P.HOVER_SPAN;
    const kick = dy => {
        const w = stableWorld(1);
        const j = w.jellies[0];
        j.home = { x: j.x, y: 450 };
        j.y = 450 + dy;
        j.lastBeat = null;
        Core.step(w, 16, { beat: j.offset });
        return j.vy;
    };
    // 位置都取在软边界（距边缘约 2 倍钟罩半径 + 24 px）以内的区域：边界回推也是纵向速度的来源，会混进推力的比较
    const deep = kick(span);
    const home = kick(0);
    const shallow = kick(-span * 0.9);
    assert.ok(deep < -40, `深处推力满格 ${deep}`);
    assert.ok(Math.abs(home / deep - P.HOVER_THRUST) < 0.03, `漫游点高度：${(home / deep).toFixed(3)} 倍`);
    assert.ok(Math.abs(shallow / deep - P.HOVER_MIN) < 0.03, `比漫游点高得多：${(shallow / deep).toFixed(3)} 倍`);

    // 被惊动的那一下收缩：指针快速划过，深处与上方的水母速度差应来自推力差（惊动的推力本身两边相同）
    const flee = dy => {
        const w = stableWorld(1);
        const j = w.jellies[0];
        j.home = { x: 600, y: 450 };
        j.x = 600; j.y = 450 + dy; j.cooldown = 0;
        for (let i = 0; i < 6; i++) {
            Core.step(w, 16, { pointer: { x: 740 - i * 20, y: j.y + 10 } });
            if (j.cooldown > 0) break;
        }
        assert.ok(j.cooldown > 0, '被惊动了');
        return j.vy;
    };
    assert.ok(flee(span * 2) - flee(-span * 2) < -60, '被惊动时的那一下收缩也随深度调节');

    // 被抓着时：拍点的那一下挣扎仍是满格的一脚（抓在漫游点上方很高的地方也一样），不按深度调节
    const w = stableWorld(1);
    const j = w.jellies[0];
    j.home = { x: j.x, y: j.y + span * 3 };
    assert.ok(Math.abs(Core.thrustScale(w, j) - P.HOVER_MIN) < 1e-12, '前提：水母远高于它的漫游点');
    assert.equal(Core.grab(w, j, j.x, j.y), true);
    reenter(w);
    j.vx = 0; j.vy = 0; j.lastBeat = null;
    Core.step(w, 16, { pointer: { x: j.x, y: j.y }, beat: j.offset });
    assert.ok(j.vy < -40, `被抓着时的挣扎推力不被调小 ${j.vy}`);
});

test('水母停在各自漫游点的高度附近，不会一路游到屏幕顶端贴边（顶部有任务滚动条和卡片，贴在那里就抓不到）', () => {
    for (const [seed, count] of [[3, 6], [11, 3], [23, 8]]) {
        const w = populated(count, { random: seeded(seed) });
        const sec = [];
        for (let frame = 0; frame < 180 * 62.5; frame++) {
            const t = frame * 16 / 1000;
            Core.step(w, 16, { beat: Math.floor(t) });
            if (frame % 63 === 0 && t >= 10) for (const j of w.jellies) sec.push(j.y / w.height);
        }
        const mean = sec.reduce((a, b) => a + b, 0) / sec.length;
        const sd = Math.sqrt(sec.reduce((a, b) => a + (b - mean) ** 2, 0) / sec.length);
        const upper = sec.filter(f => f < 0.2).length / sec.length;
        // 修复前（推力恒为满格）：顶部 20% 以内占 84%～93%，平均高度约 0.12
        assert.ok(upper < 0.1, `seed ${seed}：顶部 20% 以内占 ${(upper * 100).toFixed(0)}%`);
        assert.ok(mean > 0.3 && mean < 0.6, `seed ${seed}：平均高度 ${mean.toFixed(2)}`);
        assert.ok(sd > 0.08, `seed ${seed}：仍然分散在不同高度 ${sd.toFixed(2)}`);
        assert.deepEqual(allFinite(w), []);
    }
});

test('水母在整个屏幕里分散游动，不是都挤在中间偏上：横向接近漫游点的均匀分布，下半部也有水母（2026-10-16 用户反馈）', () => {
    // 修复前（横向推力也被 thrustScale 压到约 0.3、漫游点 9–20 秒就换、下沉终速约 10 px/s）：
    // 横向标准差 0.16 倍屏宽、中间 30%–70% 占约 75%，纵向 60% 以下只占 13%——漫游点还没游到就换了，位置成了一串随机目标的“指数加权平均”，必然向中间收拢
    for (const [seed, count] of [[1, 6], [2, 6], [3, 8], [4, 4]]) {
        const w = populated(count, { random: seeded(seed) });
        const xs = [], ys = [];
        for (let frame = 0; frame < 300 * 62.5; frame++) {
            Core.step(w, 16, { beat: Math.floor(frame * 16 / 1000) });
            if (frame % 63 === 0 && frame > 1250) for (const j of w.jellies) { xs.push(j.x / w.width); ys.push(j.y / w.height); }
        }
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        const sd = a => Math.sqrt(mean(a.map(v => (v - mean(a)) ** 2)));
        const middle = xs.filter(x => x > 0.3 && x < 0.7).length / xs.length;
        const edges = xs.filter(x => x < 0.2 || x > 0.8).length / xs.length;
        const lower = ys.filter(y => y > 0.6).length / ys.length;
        assert.ok(sd(xs) > 0.2, `seed ${seed}：横向标准差 ${sd(xs).toFixed(3)}`);
        assert.ok(middle < 0.64, `seed ${seed}：中间 30%–70% 占 ${(middle * 100).toFixed(0)}%`);
        assert.ok(edges > 0.1, `seed ${seed}：左右各 20% 以内共占 ${(edges * 100).toFixed(0)}%`);
        assert.ok(lower > 0.2, `seed ${seed}：屏幕下方 40% 占 ${(lower * 100).toFixed(0)}%`);
        assert.ok(ys.filter(y => y < 0.2).length / ys.length < 0.08, `seed ${seed}：顶部不贴边`);
    }
});

test('收缩的横向推力不被纵向调节压低（至少 SIDE_THRUST 倍），纵向仍按 thrustScale；在漫游点上方下沉更快、在它下方不变', () => {
    const w = populated(1);
    const j = w.jellies[0];
    j.home = { x: j.x, y: j.y };                           // 正好在漫游点：thrustScale = HOVER_THRUST
    j.vx = j.vy = 0; j.heading = Math.PI / 4;
    const full = P.THRUST * (0.8 + 0.4 * j.seed) * (j.r / 40);
    Core.step(w, 16, { beat: j.offset });
    const dx = Math.sin(Math.PI / 4), dy = Math.cos(Math.PI / 4);
    assert.ok(Math.abs(j.vx / (dx * full) - Math.max(P.HOVER_THRUST, P.SIDE_THRUST)) < 0.08, `横向 ${(j.vx / (dx * full)).toFixed(2)} 倍`);
    assert.ok(Math.abs(-j.vy / (dy * full) - P.HOVER_THRUST) < 0.1, `纵向 ${(-j.vy / (dy * full)).toFixed(2)} 倍`);
    const sink = homeY => {
        const w2 = populated(1);
        const k = w2.jellies[0];
        k.home = { x: k.x, y: homeY }; k.homeAt = 1e9; k.vx = k.vy = 0; k.lastBeat = 0;
        const y0 = k.y;
        Core.step(w2, 16, { beat: 0 });          // 同一拍内不收缩，只看下沉
        return k.vy;
    };
    const k0 = populated(1).jellies[0];
    const level = sink(k0.y), above = sink(k0.y + w.height * P.HOVER_SPAN), below = sink(k0.y - 300);
    assert.ok(above > level * (1 + P.DESCENT_BOOST) * 0.8, `在漫游点上方（漫游点更低）下沉加速：${above} 对 ${level}`);
    assert.ok(Math.abs(below - level) < 1e-9, '在漫游点下方时不额外加速');
});

test('新来的水母（从屏幕下方游进来）与离开的水母不受调节影响：照样游到位 / 游出屏幕', () => {
    const w = populated(1);
    Core.reconcile(w, 2);
    assert.equal(w.jellies.length, 2);
    const fresh = w.jellies[1];
    assert.ok(fresh.y > w.height, '新来的在屏幕下方');
    run(w, 14, i => ({ beat: Math.floor(i * 16 / 1000) }));
    assert.ok(fresh.y < w.height * 0.9, `游进了屏幕 ${fresh.y.toFixed(0)}`);
    Core.reconcile(w, 1);
    run(w, 12, i => ({ beat: 20 + Math.floor(i * 16 / 1000) }));
    assert.equal(w.jellies.filter(j => j.state === 'leaving').length, 0, '离开的已经游出屏幕并被移除');
    assert.equal(w.jellies.length, 1);
});

test('触须：首节钉在钟罩边缘，每节长度守恒（容差内），不超出总长，不会变成 NaN', () => {
    const w = populated(4);
    let worst = 0;
    for (let i = 0; i < 900; i++) {
        Core.step(w, 16, { beat: Math.floor(i * 16 / 1000) });
        for (const j of w.jellies) for (const t of j.tentacles) {
            const anchor = Core.rimAnchor(j, t.u);
            assert.ok(Math.hypot(t.pts[0].x - anchor.x, t.pts[0].y - anchor.y) < 1e-9, '首节钉在钟罩边缘');
            for (let k = 1; k < t.pts.length; k++) {
                const d = Math.hypot(t.pts[k].x - t.pts[k - 1].x, t.pts[k].y - t.pts[k - 1].y);
                worst = Math.max(worst, Math.abs(d - t.gap) / t.gap);
            }
            const reach = Math.hypot(t.pts[t.pts.length - 1].x - t.pts[0].x, t.pts[t.pts.length - 1].y - t.pts[0].y);
            // 3 次迭代的位置约束在收缩瞬间（锚点被钟罩带着动）会有短暂的小幅拉伸：实测最坏 1.099 倍，P99 为 1.044 倍。
            assert.ok(reach <= t.len * 1.15, `触须被拉长到 ${(reach / t.len).toFixed(3)} 倍`);
        }
    }
    // 实测最坏单节拉伸 16.3%（收缩瞬间的口腕第一节）；30% 之内说明约束确实在起作用，没有发散
    assert.ok(worst < 0.3, `节长最大偏差 ${(worst * 100).toFixed(1)}%`);
    assert.deepEqual(allFinite(w), []);
});

test('触须：没有拍点时自然下垂（尖端在钟罩下方）；类型分为细触须与口腕，口腕更粗更短', () => {
    const w = populated(1);
    run(w, 6, { beat: null });
    const j = w.jellies[0];
    for (const t of j.tentacles) assert.ok(t.pts[t.pts.length - 1].y > t.pts[0].y, `${t.kind} 下垂`);
    const thin = j.tentacles.filter(t => t.kind === 'thin');
    const arms = j.tentacles.filter(t => t.kind === 'arm');
    assert.equal(thin.length, P.TENTACLES);
    assert.equal(arms.length, P.ARMS);
    assert.ok(Math.min(...arms.map(t => t.width)) > Math.max(...thin.map(t => t.width)));
    assert.ok(Math.max(...arms.map(t => t.len)) < Math.min(...thin.map(t => t.len)));
    assert.ok(thin.every(t => t.pts.length === P.SEGMENTS));
    const low = populated(1, { lowPower: true }).jellies[0];
    assert.equal(low.tentacles.filter(t => t.kind === 'thin').length, P.TENTACLES_LOW);
    assert.equal(low.tentacles[0].pts.length, P.SEGMENTS_LOW);
});

test('触须自愈：某个节点被写成 NaN 后，下一步整条触须恢复有限值', () => {
    const w = populated(1);
    run(w, 1);
    const t = w.jellies[0].tentacles[2];
    t.pts[5].x = NaN; t.pts[6].vy = Infinity;
    Core.step(w, 16, {});
    assert.deepEqual(allFinite(w), []);
});

test('指针惊动：快速划过钟罩附近时躲开并多收缩一次；慢速、静止、刚出现、已离开都不会', () => {
    const make = () => {
        const w = populated(1);
        run(w, 0.3, { beat: null });
        const j = w.jellies[0];
        j.x = 600; j.y = 400; j.vx = 0; j.vy = 0; j.pulseT = 99; j.cooldown = 0;
        return { w, j };
    };
    // 快速：每帧 20px（约 1250 px/s）扫过水母右侧
    {
        const { w, j } = make();
        let pulses = 0;
        let last = j.pulseT;
        // 对照：同样的起点与随机数，没有指针，别的完全一样——只比较“有没有被推开”，不依赖水母当时朝哪个方向收缩
        const control = make();
        // 对照里用拍点触发同样的一次收缩（推力同一个函数），这样差别只剩“被指针推开”的部分
        for (let i = 0; i < 12; i++) Core.step(control.w, 16, { pointer: null, beat: i === 0 ? control.j.offset : null });
        for (let i = 0; i < 12; i++) {
            Core.step(w, 16, { pointer: { x: 740 - i * 5, y: 410 } });     // 约 310 px/s，始终在水母右侧
            if (j.pulseT < last) pulses++;
            last = j.pulseT;
        }
        assert.equal(pulses, 1, '冷却内只多收缩一次');
        assert.ok(control.j.x - j.x > 2, `被推开（向左）：比没有指针时多走 ${(control.j.x - j.x).toFixed(1)}px`);
    }
    // 慢速：每帧 1px（约 60 px/s）
    {
        const { w, j } = make();
        for (let i = 0; i < 60; i++) Core.step(w, 16, { pointer: { x: 640 + i, y: 410 } });
        assert.equal(j.cooldown, 0, '没有被惊动');
    }
    // 静止：宿主的指针速度字段在鼠标停下后不会归零，核心必须自己按帧间位移算
    {
        const { w, j } = make();
        for (let i = 0; i < 6; i++) Core.step(w, 16, { pointer: { x: 640 + i * 30, y: 410 } });   // 先快速划一下
        j.pulseT = 99; j.cooldown = 0;
        for (let i = 0; i < 120; i++) Core.step(w, 16, { pointer: { x: 790, y: 410 } });           // 然后停在那里
        assert.equal(w.pointer.speed < 1, true, `静止后速度归零 ${w.pointer.speed}`);
    }
    // 第一次出现的指针没有“上一帧”，不能算出巨大速度
    {
        const { w, j } = make();
        Core.step(w, 16, { pointer: { x: 610, y: 400 } });
        assert.equal(j.cooldown, 0);
        assert.equal(w.pointer.speed, 0);
    }
    // 指针离开页面（null）：速度清零，下次出现重新算
    {
        const { w } = make();
        for (let i = 0; i < 4; i++) Core.step(w, 16, { pointer: { x: 100 + i * 40, y: 100 } });
        assert.ok(w.pointer.speed > P.FLEE_SPEED);
        Core.step(w, 16, { pointer: null });
        assert.equal(w.pointer.speed, 0);
        assert.equal(w.pointer.has, false);
    }
    // 范围外的快速指针不会惊动
    {
        const { w, j } = make();
        for (let i = 0; i < 12; i++) Core.step(w, 16, { pointer: { x: 1200 + i * 20, y: 800 } });
        assert.equal(j.cooldown, 0);
    }
});

test('长时间运行：水母基本留在屏幕里（软边界），没有数值问题', () => {
    const w = populated(6);
    run(w, 120, i => ({ beat: Math.floor(i * 16 / 1000) }));
    for (const j of w.jellies) {
        assert.ok(j.x > -j.r * 2 && j.x < w.width + j.r * 2, `x ${j.x}`);
        assert.ok(j.y > -j.r * 2 && j.y < w.height + j.r * 2, `y ${j.y}`);
    }
    assert.deepEqual(allFinite(w), []);
});

test('模糊测试：随机步长、非法指针与随机拍点，所有数值始终有限', () => {
    const rand = seeded(99);
    const w = world({ random: seeded(5) });
    Core.reconcile(w, 8, { instant: true });
    const pointers = [null, { x: NaN, y: 1 }, { x: Infinity, y: 0 }, { x: 5, y: -5 }, { x: 700, y: 300 }, { x: -1e9, y: 1e9 }];
    for (let i = 0; i < 4000; i++) {
        const dt = [0, 1, 8, 16, 33, 50, 80, 400, 5000][Math.floor(rand() * 9)];
        const input = {
            beat: rand() < 0.2 ? Math.floor(rand() * 50) : (rand() < 0.5 ? null : undefined),
            pointer: rand() < 0.6 ? { x: rand() * 1440, y: rand() * 900 } : pointers[Math.floor(rand() * pointers.length)],
        };
        Core.step(w, dt, input);
        if (i % 500 === 0) Core.reconcile(w, Math.floor(rand() * 12));
    }
    assert.deepEqual(allFinite(w), []);
});

test('resize：保持身份与相对位置，触须随缩放，浮游光点重新铺满新尺寸', () => {
    const w = populated(4);
    run(w, 2);
    const before = w.jellies.map(j => ({ id: j.id, fx: j.x / w.width, fy: j.y / w.height, r: j.r, len: j.tentacles[0].len }));
    const oldScale = w.scale;
    Core.resize(w, 2880, 1800);
    assert.equal(w.width, 2880);
    assert.ok(w.scale > oldScale);
    w.jellies.forEach((j, i) => {
        assert.equal(j.id, before[i].id);
        assert.ok(Math.abs(j.x / w.width - before[i].fx) < 1e-9);
        assert.ok(Math.abs(j.y / w.height - before[i].fy) < 1e-9);
        assert.ok(Math.abs(j.r / before[i].r - w.scale / oldScale) < 1e-9);
        assert.ok(Math.abs(j.tentacles[0].len / before[i].len - w.scale / oldScale) < 1e-9);
    });
    for (const p of w.plankton) assert.ok(p.x <= 2880 && p.y <= 1800);
    run(w, 1);
    assert.deepEqual(allFinite(w), []);
    // 缩到很小也不炸
    Core.resize(w, 320, 240);
    run(w, 1);
    assert.deepEqual(allFinite(w), []);
});

test('homeFor：漫游目标落在安全区内且分布均匀，不会挤成一团', () => {
    const w = world();
    const homes = Array.from({ length: P.MAX_COUNT }, (_, slot) => Core.homeFor(w, slot));
    for (const h of homes) {
        assert.ok(h.x >= w.width * 0.08 - 1e-9 && h.x <= w.width * 0.92 + 1e-9);
        assert.ok(h.y >= w.height * 0.14 - 1e-9 && h.y <= w.height * 0.82 + 1e-9);
    }
    let nearest = Infinity;
    for (let a = 0; a < homes.length; a++) for (let b = a + 1; b < homes.length; b++) {
        nearest = Math.min(nearest, Math.hypot(homes[a].x - homes[b].x, homes[a].y - homes[b].y));
    }
    assert.ok(nearest > 150, `最近两点距离 ${nearest.toFixed(0)}`);
    // 范围真的被用满：连续很多个槽位里，最左/最右/最上/最下都贴近边界（防止悄悄把范围收窄回去，水母又往中间挤）
    const many = Array.from({ length: 300 }, (_, slot) => Core.homeFor(w, slot));
    assert.ok(Math.min(...many.map(h => h.x)) < w.width * 0.1 && Math.max(...many.map(h => h.x)) > w.width * 0.9);
    assert.ok(Math.min(...many.map(h => h.y)) < w.height * 0.16 && Math.max(...many.map(h => h.y)) > w.height * 0.8);
});

test('确定性：同一种子、同一串输入，得到完全相同的状态', () => {
    const play = () => {
        const w = world({ random: seeded(3) });
        Core.reconcile(w, 5, { instant: true });
        run(w, 20, i => ({ beat: Math.floor(i * 16 / 1000), pointer: { x: 300 + (i % 200), y: 400 } }));
        Core.reconcile(w, 2);
        run(w, 5, i => ({ beat: 100 + Math.floor(i * 16 / 1000) }));
        return JSON.stringify(w);
    };
    assert.equal(play(), play());
});

test('纯函数模块：不依赖 DOM / 计时器 / 存储 / 网络', () => {
    const source = require('node:fs').readFileSync(require.resolve('../js/jellyfish-core.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of [/\bdocument\b/, /\bchrome\b/, /\bfetch\b/, /XMLHttpRequest/, /localStorage/, /\bsetTimeout\b/, /\bsetInterval\b/,
        /requestAnimationFrame/, /\beval\s*\(/, /new Function/, /\bperformance\b/, /Date\.now/]) {
        assert.ok(!forbidden.test(source), String(forbidden));
    }
});

// ---------- 夜晚荧光曲线与完成庆祝（2026-10-15） ----------

test('nightAmount：20 点到次日 6 点为 1，19–20 点与 6–7 点平滑渐变，白天为 0；一天 24 小时循环', () => {
    for (const hour of [20, 21.5, 23, 23.99, 0, 1, 3, 5, 5.99, 6]) assert.equal(Core.nightAmount(hour), 1, `${hour} 点是夜里`);
    for (const hour of [7, 7.5, 9, 12, 15, 18, 19]) assert.equal(Core.nightAmount(hour), 0, `${hour} 点是白天`);
    assert.equal(Core.nightAmount(19.5), 0.5, '渐入的中点');
    assert.equal(Core.nightAmount(6.5), 0.5, '渐出的中点');
    for (const hour of [3, 12, 19.25, 22, 6.75]) {
        assert.ok(Math.abs(Core.nightAmount(hour) - Core.nightAmount(hour + 24)) < 1e-12, `${hour}：加 24 小时不变`);
        assert.ok(Math.abs(Core.nightAmount(hour) - Core.nightAmount(hour - 24)) < 1e-12);
    }
});

test('nightAmount：渐变段单调且连续（相邻 1 分钟变化很小，没有突变），始终在 [0, 1]', () => {
    let previous = Core.nightAmount(0);
    let maxStep = 0;
    for (let minute = 1; minute <= 24 * 60; minute++) {
        const value = Core.nightAmount(minute / 60);
        assert.ok(value >= 0 && value <= 1, `${minute}`);
        maxStep = Math.max(maxStep, Math.abs(value - previous));
        previous = value;
    }
    assert.ok(maxStep < 0.03, `1 分钟最大变化 ${maxStep}`);
    for (let k = 1; k <= 60; k++) assert.ok(Core.nightAmount(19 + k / 60) >= Core.nightAmount(19 + (k - 1) / 60), '渐入单调不降');
    for (let k = 1; k <= 60; k++) assert.ok(Core.nightAmount(6 + k / 60) <= Core.nightAmount(6 + (k - 1) / 60), '渐出单调不升');
});

test('nightAmount：非有限数与非数字按白天（0），不抛错', () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, null, '23', {}, []]) assert.equal(Core.nightAmount(value), 0, String(value));
});

test('celebrate：一串向上的气泡与一圈涟漪，延迟之后才出现；颜色编号与位置原样带上', () => {
    const w = world();
    const count = Core.celebrate(w, 800, 600, { color: 3 });
    assert.equal(count, P.BURST_BUBBLES);
    assert.equal(w.fx.bubbles.length, P.BURST_BUBBLES);
    assert.equal(w.fx.rings.length, 1);
    assert.deepEqual([w.fx.rings[0].x, w.fx.rings[0].y, w.fx.rings[0].color], [800, 600, 3]);
    assert.ok(w.fx.bubbles.every(b => b.color === 3 && b.t === -P.BURST_DELAY_S && b.vy < 0 && b.r > 0 && b.life > 0), '都是向上的、带延迟');
    assert.ok(w.fx.bubbles.every(b => Math.abs(b.x - 800) <= 12 * w.scale + 1e-9 && b.y === 600));
    const custom = Core.celebrate(world(), 10, 10, { delay: 0 });
    assert.ok(custom > 0);
    const w2 = world(); Core.celebrate(w2, 10, 10, { delay: 0 });
    assert.ok(w2.fx.bubbles.every(b => b.t === 0), 'delay 0 立即出现');
    const w3 = world(); Core.celebrate(w3, 10, 10, { delay: -5 });
    assert.ok(w3.fx.bubbles.every(b => b.t === -P.BURST_DELAY_S), '非法延迟用默认值');
});

test('celebrate：省流量气泡减半；同屏气泡不超过上限（丢最老的）、涟漪不超过上限', () => {
    assert.equal(Core.celebrate(world({ lowPower: true }), 100, 100), P.BURST_BUBBLES_LOW);
    assert.ok(P.BURST_BUBBLES_LOW < P.BURST_BUBBLES);
    const w = world();
    for (let i = 0; i < 12; i++) Core.celebrate(w, 100 + i, 100, { color: i });
    assert.equal(w.fx.bubbles.length, P.BURST_MAX);
    assert.equal(w.fx.rings.length, P.BURST_RINGS_MAX);
    assert.ok(w.fx.bubbles.every(b => b.color >= 11 - 1), '留下的是最新的几次');
    assert.equal(w.fx.rings[w.fx.rings.length - 1].color, 11);
});

test('celebrate：坐标不是有限数、没有世界或没有 fx 时什么都不做（返回 0）；非整数颜色取 0', () => {
    const w = world();
    for (const [x, y] of [[NaN, 1], [1, Infinity], [undefined, 1], ['a', 'b']]) assert.equal(Core.celebrate(w, x, y), 0);
    assert.equal(w.fx.bubbles.length + w.fx.rings.length, 0);
    assert.equal(Core.celebrate(null, 1, 1), 0);
    assert.equal(Core.celebrate({}, 1, 1), 0);
    Core.celebrate(w, 1, 1, { color: 1.5 });
    assert.ok(w.fx.bubbles.every(b => b.color === 0));
});

test('庆祝的步进：延迟期间不动；之后上浮并受阻尼；寿命到了被移除；涟漪按时长结束；气泡整体向上飘', () => {
    const w = world();
    Core.celebrate(w, 700, 500, { color: 1 });
    const before = w.fx.bubbles.map(b => ({ x: b.x, y: b.y }));
    run(w, P.BURST_DELAY_S - 0.05);
    assert.deepEqual(w.fx.bubbles.map(b => ({ x: b.x, y: b.y })), before, '延迟期间位置不变');
    run(w, 0.5);
    const meanY = w.fx.bubbles.reduce((sum, b) => sum + b.y, 0) / w.fx.bubbles.length;
    assert.ok(meanY < 500 - 20, `气泡上升了：${meanY}`);
    assert.ok(w.fx.bubbles.every(b => b.y > 500 - 400), '阻尼让气泡不会飞出很远');
    run(w, P.BURST_LIFE_S * 1.3);
    assert.equal(w.fx.bubbles.length, 0);
    assert.equal(w.fx.rings.length, 0);
});

test('庆祝是纯视觉：不让水母离开或被吃掉，数量不变；同一随机种子可复现；庆祝只增加 fx，不动任务名单', () => {
    const w = populated(3);
    Core.celebrate(w, 700, 500);
    run(w, 3);
    assert.equal(w.jellies.length, 3);
    assert.ok(w.jellies.every(j => j.state !== 'leaving' && j.state !== 'eating'));
    const a = world({ random: seeded(5) }); Core.celebrate(a, 300, 300, { color: 2 }); run(a, 0.8);
    const b = world({ random: seeded(5) }); Core.celebrate(b, 300, 300, { color: 2 }); run(b, 0.8);
    assert.equal(JSON.stringify(a.fx), JSON.stringify(b.fx), '同一随机种子可复现');
});
