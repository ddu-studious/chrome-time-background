// 水族馆的水流与海洋雪（js/aquarium-flow-core.js）：网格尺寸、尾迹发射条件、染色有界、爆发、
// 海洋雪落到底线后回到顶部、尺寸变化按比例挪、自愈、确定性。画面观感不在这里。
const test = require('node:test');
const assert = require('node:assert/strict');
const Flow = require('../js/aquarium-flow-core.js');

const P = Flow.PARAMS;

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

const alive = (patch = {}) => Object.assign({
    x: 400, y: 300, vx: 80, vy: 0, len: 140, phase: 0, z: 0.8, alpha: 1, state: 'alive',
}, patch);

test('非法尺寸返回 null；合法尺寸给出有限网格与海洋雪', () => {
    assert.equal(Flow.create({ width: 63, height: 700 }), null);
    assert.equal(Flow.create({ width: 700, height: 63 }), null);
    assert.equal(Flow.create({ width: NaN, height: 700 }), null);
    const s = Flow.create({ width: 1440, height: 900, random: seeded(1) });
    assert.ok(s);
    assert.equal(s.gw, Flow.gridOf(1440, 900).gw);
    assert.equal(s.gh, Flow.gridOf(1440, 900).gh);
    assert.equal(s.snow.count, Flow.snowCountFor(1440, 900));
    assert.ok(s.snow.count >= P.SNOW_MIN && s.snow.count <= P.SNOW_MAX);
    const st = Flow.stats(s);
    assert.equal(st.finite, true);
    assert.equal(st.resets, 0);
    assert.equal(st.maxSpeed, 0);
});

test('同一种子给出同一串海洋雪与同一尾迹统计', () => {
    const run = seed => {
        const s = Flow.create({ width: 960, height: 540, random: seeded(seed) });
        const fish = [alive({ len: 200, vx: 120 }), alive({ x: 200, y: 400, len: 160, vx: -90 })];
        for (let i = 0; i < 90; i++) Flow.step(s, 1 / 30, { fish, floorY: 500, scale: 1 });
        return {
            snow0: [s.snow.x[0], s.snow.y[0], s.snow.z[0]],
            stats: Flow.stats(s),
            dyeMid: s.dye[Math.floor(s.gw / 2) + (s.gw + 2) * Math.floor(s.gh / 2)],
        };
    };
    const a = run(42), b = run(42), c = run(43);
    assert.deepEqual(a, b);
    assert.notDeepEqual(a.snow0, c.snow0);
});

test('只有够大、够快、活着的鱼才留尾迹；小鱼/停下/被抓着都不发', () => {
    const mk = fish => {
        const s = Flow.create({ width: 720, height: 480, random: seeded(3) });
        const n = Flow.step(s, 1 / 30, { fish });
        return { n, dye: Flow.stats(s).dye };
    };
    assert.equal(mk([alive({ len: P.WAKE_MIN_LEN - 1, vx: 100 })]).n, 0);
    assert.equal(mk([alive({ len: 200, vx: P.WAKE_MIN_SPEED - 1 })]).n, 0);
    assert.equal(mk([alive({ len: 200, vx: 100, state: 'held' })]).n, 0);
    assert.equal(mk([alive({ len: 200, vx: 100, state: 'entering' })]).n, 0);
    const big = mk([alive({ len: 200, vx: 100 })]);
    assert.equal(big.n, 1);
    assert.ok(big.dye > 0);
});

test('每步最多取 MAX_EMITTERS 条，体长大的优先', () => {
    const s = Flow.create({ width: 1280, height: 720, random: seeded(5) });
    const fish = [];
    for (let i = 0; i < P.MAX_EMITTERS + 8; i++) {
        fish.push(alive({ x: 100 + i * 40, y: 200 + (i % 5) * 30, len: 50 + i, vx: 60 }));
    }
    const n = Flow.step(s, 1 / 30, { fish });
    assert.equal(n, P.MAX_EMITTERS);
});

test('染色与速度始终有界；非有限 dt 不推进', () => {
    const s = Flow.create({ width: 640, height: 360, random: seeded(9) });
    const fish = [alive({ len: 300, vx: 400, vy: 200 })];
    assert.equal(Flow.step(s, 0), 0);
    assert.equal(Flow.step(s, NaN), 0);
    assert.equal(s.steps, 0);
    for (let i = 0; i < 300; i++) Flow.step(s, 1 / 30, { fish });
    const st = Flow.stats(s);
    assert.ok(st.maxSpeed <= P.UMAX + 1e-6);
    assert.ok(st.dye <= P.DYE_MAX * s.gw * s.gh + 1e-6);
    assert.equal(st.finite, true);
    assert.equal(st.resets, 0);
});

test('burst 在下一步灌入向外的速度与染色', () => {
    const s = Flow.create({ width: 640, height: 360, random: seeded(11) });
    Flow.burst(s, 320, 180, 1);
    assert.equal(s.bursts.length, 1);
    Flow.step(s, 1 / 30, { fish: [] });
    assert.equal(s.bursts.length, 0);
    const st = Flow.stats(s);
    assert.ok(st.maxSpeed > 0, '爆发后有速度');
    assert.ok(st.dye > 0, '爆发后有染色');
});

test('待处理的爆发超过上限时丢掉最旧的', () => {
    const s = Flow.create({ width: 640, height: 360, random: seeded(12) });
    for (let i = 0; i < P.MAX_BURSTS + 3; i++) Flow.burst(s, 100 + i, 100, 1);
    assert.equal(s.bursts.length, P.MAX_BURSTS);
    assert.equal(s.bursts[0].x, 100 + 3);
});

test('resize 按比例挪海洋雪、清零流场；非法尺寸失败', () => {
    const s = Flow.create({ width: 800, height: 400, random: seeded(13) });
    Flow.step(s, 1 / 30, { fish: [alive({ len: 200, vx: 100 })] });
    assert.ok(Flow.stats(s).dye > 0);
    const x0 = s.snow.x[0], y0 = s.snow.y[0], z0 = s.snow.z[0];
    assert.equal(Flow.resize(s, 63, 400), false);
    assert.equal(Flow.resize(s, 1600, 800), true);
    assert.equal(s.w, 1600);
    assert.equal(s.h, 800);
    assert.ok(Math.abs(s.snow.x[0] - x0 * 2) < 1e-6);
    assert.ok(Math.abs(s.snow.y[0] - y0 * 2) < 1e-6);
    assert.equal(s.snow.z[0], z0);
    assert.equal(Flow.stats(s).dye, 0);
});

test('海洋雪不会掉到 floorY 以下；缺省时用画布底边', () => {
    const s = Flow.create({ width: 400, height: 300, random: seeded(15) });
    for (let n = 0; n < s.snow.count; n++) { s.snow.y[n] = 290; s.snow.z[n] = 1; }
    const floor = 250;
    for (let i = 0; i < 120; i++) Flow.step(s, 1 / 30, { fish: [], floorY: floor, scale: 1 });
    for (let n = 0; n < s.snow.count; n++) {
        assert.ok(s.snow.y[n] < floor + 1e-6, `粒 ${n} 在 ${s.snow.y[n]}，底线 ${floor}`);
    }
});

test('dyeImage：无内容返回 null；有内容给出包围盒且 alpha 不超过上限', () => {
    const s = Flow.create({ width: 320, height: 180, random: seeded(17) });
    const data = new Uint8ClampedArray(s.gw * s.gh * 4);
    assert.equal(Flow.dyeImage(s, data, 0.34), null);
    Flow.burst(s, 160, 90, 1);
    Flow.step(s, 1 / 30, { fish: [] });
    const box = Flow.dyeImage(s, data, 0.34);
    assert.ok(box);
    assert.ok(box.i1 >= box.i0 && box.j1 >= box.j0);
    let peak = 0;
    for (let o = 3; o < data.length; o += 4) if (data[o] > peak) peak = data[o];
    assert.ok(peak > 0 && peak <= Math.round(0.34 * 255) + 1);
});

test('snowDot 复用 out、夜里更暗；非法下标不炸', () => {
    const s = Flow.create({ width: 400, height: 300, random: seeded(19) });
    const out = {};
    const a = Flow.snowDot(s, 0, 1, 0, out);
    assert.equal(a, out);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && a.size > 0 && a.alpha > 0);
    const day = Flow.snowDot(s, 0, 1, 0).alpha;
    const night = Flow.snowDot(s, 0, 1, 1).alpha;
    assert.ok(night < day);
});

test('自愈：场里被灌入非有限数后，SELF_CHECK 那一步会清零并记一次 resets', () => {
    const s = Flow.create({ width: 320, height: 180, random: seeded(21) });
    // 先推到检查点前一步，再往内部格子灌 NaN（边界格会被 setBnd 改写）
    for (let i = 0; i < P.SELF_CHECK_EVERY - 1; i++) Flow.step(s, 1 / 30, { fish: [] });
    const mid = 2 + (s.gw + 2) * 2;       // i=2,j=2 的内部格
    s.u[mid] = NaN;
    assert.equal(Flow.stats(s).finite, false);
    Flow.step(s, 1 / 30, { fish: [] });
    assert.ok(s.resets >= 1);
    assert.equal(Flow.stats(s).finite, true);
    assert.ok(Number.isFinite(s.u[mid]));
});
