// 侧视大个子转身的伪 3D 投影（js/aquarium-yaw.js）：
// 数据与映射是纯几何，这里守住：θ = 0 时与原画面一致（转身开始/结束不跳变）、θ = 90° 时是左右对称的圆身体加横锤头、
// 轮廓与“椭圆剖面并集”的独立判定一致、体表背面被裁掉、远侧体表只在接近正对时出现、不改输入、坏数据返回 null。
// 画面好不好看靠 three.js 参照渲染与真实 Chromium 截图判断（见 docs/research/research-aquarium-physical-realism-libs-20261020.md）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Yaw = require('../js/aquarium-yaw.js');
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');
const Core = require('../js/aquarium-core.js');

const SPECIES = ['hammer', 'whaleshark'];
const HALF_PI = Math.PI / 2;

const restOps = (species, pose) => Rig.evaluate(Data.rig(species), Object.assign({ phase: 0, amp: 0, turn: 0, lod: 2 }, pose)).ops;
const opOf = (ops, id) => ops.find(op => op.id === id);
const clone = value => JSON.parse(JSON.stringify(value));
const bbox = polys => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const poly of polys) for (let i = 0; i < poly.pts.length; i += 2) {
        x0 = Math.min(x0, poly.pts[i]); x1 = Math.max(x1, poly.pts[i]);
        y0 = Math.min(y0, poly.pts[i + 1]); y1 = Math.max(y1, poly.pts[i + 1]);
    }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0 };
};
const centroid = op => {
    const pts = op.polys[0].pts;
    let sx = 0, sy = 0;
    for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; }
    return [sx / (pts.length / 2), sy / (pts.length / 2)];
};
const meanX = op => { let s = 0, n = 0; for (const p of op.polys) for (let i = 0; i < p.pts.length; i += 2) { s += p.pts[i]; n++; } return s / n; };
const brief = (value, digits = 3) => (typeof value === 'number' ? Number(value.toFixed(digits)) : value);

// ---------- 独立的参照：站位与“核心薄片 ∪ 椭圆剖面”的成员判定（与被测代码各写一份） ----------
function refStations(poly, tau, n = 96) {
    const pts = poly.pts;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i += 2) { lo = Math.min(lo, pts[i]); hi = Math.max(hi, pts[i]); }
    const out = [];
    for (let k = 0; k <= n; k++) {
        const x = lo + (hi - lo) * k / n;
        let a = Infinity, b = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
            const j = (i + 2) % pts.length;
            const xa = pts[i], ya = pts[i + 1], xb = pts[j], yb = pts[j + 1];
            if ((xa <= x && x <= xb) || (xb <= x && x <= xa)) {
                const t = xb === xa ? 0 : (x - xa) / (xb - xa);
                const y = ya + (yb - ya) * t;
                a = Math.min(a, y); b = Math.max(b, y);
            }
        }
        const ry = Math.max((b - a) / 2, 0.15);
        let t = 0;
        for (let i = 1; i < tau.length; i++) if (x <= tau[i][0]) { const p = tau[i - 1], q = tau[i]; t = p[1] + (q[1] - p[1]) * (x - p[0]) / (q[0] - p[0]); break; }
        if (x > tau[tau.length - 1][0]) t = tau[tau.length - 1][1];
        if (x <= tau[0][0]) t = tau[0][1];
        out.push({ x, yc: (a + b) / 2, ry, rz: ry * t });
    }
    return out;
}

function refInside(stations, hammer, c, s) {
    const dx = stations[1].x - stations[0].x;
    const hs = [];
    if (hammer) for (let k = 0; k <= 8; k++) {
        const u = k / 8, prof = Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.45) / 0.62, 2)));
        hs.push({ x: hammer.x0 + (hammer.x1 - hammer.x0) * u, yc: hammer.yc, ry: hammer.ry * (0.4 + 0.6 * prof), rz: hammer.half * prof });
    }
    const hdx = hammer ? (hammer.x1 - hammer.x0) / 8 : 0;
    return (u, v) => {
        if (c > 1e-4) {
            const f = (u / c - stations[0].x) / dx;
            if (f >= 0 && f <= stations.length - 1) {
                const k = Math.min(Math.floor(f), stations.length - 2), t = f - k;
                const a = stations[k], b = stations[k + 1];
                const top = (a.yc - a.ry) * (1 - t) + (b.yc - b.ry) * t, bottom = (a.yc + a.ry) * (1 - t) + (b.yc + b.ry) * t;
                if (v >= top && v <= bottom) return true;
            }
        }
        for (const st of stations) {
            const a = st.rz * s;
            if (a <= 1e-9) continue;
            const du = (u - st.x * c) / a, dv = (v - st.yc) / st.ry;
            if (du * du + dv * dv <= 1) return true;
        }
        for (const st of hs) {
            const a = st.rz * s + 0.65 * hdx * c;
            if (a <= 1e-9) continue;
            const du = (u - st.x * c) / a, dv = (v - st.yc) / st.ry;
            if (du * du + dv * dv <= 1) return true;
        }
        return false;
    };
}

function polyInside(pts) {
    return (u, v) => {
        let inside = false;
        for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
            const xi = pts[i], yi = pts[i + 1], xj = pts[j], yj = pts[j + 1];
            if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    };
}

// ---------- 注册表与状态 ----------

test('物种表：只有核心里“侧视的大个子”（非俯视且体长超过 AGILE_LEN）才有转身投影，且每个都有可用的骨架数据', () => {
    assert.deepEqual(Yaw.ids(), SPECIES);
    const heavySide = Core.SPECIES.filter(spec => !spec.top && spec.len > Core.PARAMS.AGILE_LEN).map(spec => spec.id).sort();
    assert.deepEqual(Yaw.ids().slice().sort(), heavySide, '核心里转身用“缩短—换面—伸长”的物种集合 = 有投影数据的物种集合');
    for (const id of Yaw.ids()) {
        assert.equal(Yaw.has(id), true);
        assert.ok(Data.rig(id), `${id} 有骨架数据`);
        assert.equal(Data.rig(id).view, 'side');
    }
    for (const bad of ['manta', 'turtle', 'neon', '', 'toString', '__proto__', 'constructor', null, undefined, 3, {}]) assert.equal(Yaw.has(bad), false, String(bad));
    assert.ok(Object.isFrozen(Yaw.PROFILES) && Object.isFrozen(Yaw.PROFILES.hammer) && Object.isFrozen(Yaw.PROFILES.hammer.plates[0]), '数据冻结');
});

test('stateOf：转身进度 yaw 取 π·min(yaw, 1−yaw) 为转角，换面后镜像，俯仰换算成“鼻朝右”的等价角；不在转身或数据不全返回 null', () => {
    const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}：${a} vs ${b}`);
    let st = Yaw.stateOf({ yaw: 0.25, face: 1, ang: 0.1 });
    near(st.theta, Math.PI / 4, '前半段'); assert.equal(st.mirror, false); near(st.pitch, 0.1, '俯仰');
    st = Yaw.stateOf({ yaw: 0.75, face: -1, ang: Math.PI - 0.1 });
    near(st.theta, Math.PI / 4, '后半段与前半段同一转角'); assert.equal(st.mirror, true); near(st.pitch, 0.1, '换面后核心把 ang 镜像，这里换算回来');
    st = Yaw.stateOf({ yaw: 0.75, face: -1, ang: -Math.PI + 0.2 });
    near(st.pitch, -0.2, '朝左且低头：ang = −π + 0.2 → 鼻朝右的等价角 −0.2');
    near(Yaw.stateOf({ yaw: 0.5, face: 1, ang: 0 }).theta, HALF_PI, '正中间正对观众');
    near(Yaw.stateOf({ yaw: 1e-6, face: 1, ang: 0 }).theta, Math.PI * 1e-6, '刚开始');
    for (const bad of [null, undefined, {}, { yaw: 0, face: 1, ang: 0 }, { yaw: 1, face: 1, ang: 0 }, { yaw: -0.1, face: 1, ang: 0 }, { yaw: 1.2, face: 1, ang: 0 },
        { yaw: NaN, face: 1, ang: 0 }, { yaw: '0.3', face: 1, ang: 0 }, { yaw: 0.3, face: 0, ang: 0 }, { yaw: 0.3, ang: 0 }, { yaw: 0.3, face: 2, ang: 0 },
        { yaw: 0.3, face: 1, ang: NaN }, { yaw: 0.3, face: 1 }, { yaw: 0.3, face: 1, ang: Infinity }]) {
        assert.equal(Yaw.stateOf(bad), null, JSON.stringify(bad));
    }
    for (const a of [-3.1, -1, 0, 0.7, 3.1]) {                                  // 镜像等价：朝左的 (face −1, ang) 与朝右的 (face 1, π − ang) 给出同一个俯仰
        const right = Yaw.stateOf({ yaw: 0.3, face: 1, ang: a });
        const left = Yaw.stateOf({ yaw: 0.3, face: -1, ang: Yaw.wrapPi(Math.PI - a) });
        near(right.pitch, left.pitch, `ang ${a}`);
        assert.equal(right.mirror, false); assert.equal(left.mirror, true);
    }
});

test('wrapPi：落在 [−π, π)，2π 的整数倍等价，已知值精确（π 绕回 −π）', () => {
    for (const a of [-100, -7, -Math.PI - 1e-9, -Math.PI, -3.1, -3, -2.5, -1, 0, 1, 3, Math.PI - 1e-9, Math.PI, 3.2, 7, 100, 2 * Math.PI, -2 * Math.PI, 5 * Math.PI]) {
        const w = Yaw.wrapPi(a);
        assert.ok(w >= -Math.PI && w < Math.PI, `${a} → ${w} 落在 [−π, π)`);
        assert.ok(Math.abs(Math.cos(w) - Math.cos(a)) < 1e-9 && Math.abs(Math.sin(w) - Math.sin(a)) < 1e-9, String(a));
    }
    assert.equal(Yaw.wrapPi(0), 0);
    assert.ok(Math.abs(Yaw.wrapPi(3.5) - (3.5 - 2 * Math.PI)) < 1e-12 && Math.abs(Yaw.wrapPi(-3.5) - (2 * Math.PI - 3.5)) < 1e-12, '越过 ±π 绕回另一侧');
    assert.equal(Yaw.wrapPi(-Math.PI), -Math.PI, '−π 本身留在 −π（半开区间的左端）');
    assert.equal(Yaw.wrapPi(Math.PI), -Math.PI, 'π 绕回 −π');
});

// ---------- 站位、体表深度与朝向 ----------

test('stationsOf：站位覆盖整条躯干，竖向范围取多边形与竖线的交点，横向半宽 = 竖向半高 × 该处的 tau', () => {
    for (const species of SPECIES) {
        const body = opOf(restOps(species), 'body');
        const prof = Yaw.PROFILES[species];
        const st = Yaw.stationsOf(body.polys[0], prof.tau);
        const ref = refStations(body.polys[0], prof.tau);
        assert.equal(st.n, Yaw.STATIONS);
        assert.equal(st.yc.length, st.n + 1);
        let maxErr = 0;
        for (let k = 0; k <= st.n; k++) {
            maxErr = Math.max(maxErr, Math.abs(st.yc[k] - ref[k].yc), Math.abs(st.ry[k] - ref[k].ry), Math.abs(st.rz[k] - ref[k].rz));
            assert.ok(Math.abs(st.x0 + k * st.dx - ref[k].x) < 1e-9, `站位 ${k} 的 x`);
        }
        assert.ok(maxErr < 1e-9, `${species}：与独立实现一致 ${maxErr}`);
        assert.ok(st.rz.every(Number.isFinite) && st.dyc.every(Number.isFinite) && st.dry.every(Number.isFinite) && st.drz.every(Number.isFinite));
    }
    // 鲸鲨的头扁而宽（头部 tau > 1），锤头鲨的躯干横向半宽 < 竖向半高
    const whale = Yaw.stationsOf(opOf(restOps('whaleshark'), 'body').polys[0], Yaw.PROFILES.whaleshark.tau);
    assert.ok(whale.rz[whale.n - 4] > whale.ry[whale.n - 4] * 1.8, '鲸鲨头部横向半宽约为竖向半高的 2 倍');
    const hammer = Yaw.stationsOf(opOf(restOps('hammer'), 'body').polys[0], Yaw.PROFILES.hammer.tau);
    assert.ok(hammer.rz.every((rz, k) => rz < hammer.ry[k]), '锤头鲨躯干剖面是竖向略长的椭圆');
});

test('stationsOf：坏多边形返回 null（缺 pts、点数不足、非有限值、横向不足 1 个单位）；最小的合规躯干（三角形）也能出站位', () => {
    const tau = Yaw.PROFILES.hammer.tau;
    const good = opOf(restOps('hammer'), 'body').polys[0];
    for (const bad of [null, undefined, {}, { pts: [] }, { pts: 'abc' }, { pts: [0, 0, 1, 1] }, { pts: [0, 0, NaN, 1, 2, 2] }, { pts: [0, 0, 1, Infinity, 2, 2] }, { pts: [0, 0, 0, 0, 0, 0] }, { pts: [0, 0, 0.5, 1, 1, 0] }]) {
        assert.equal(Yaw.stationsOf(bad, tau), null, JSON.stringify(bad));
    }
    assert.ok(Yaw.stationsOf(good, tau), '好的躯干通过');
    const tri = Yaw.stationsOf({ pts: [0, 0, 1, 1, 2, 0] }, tau);
    assert.ok(tri && tri.n === Yaw.STATIONS && tri.ry.every(v => v >= 0.15), '三角形：站位竖向半高不低于下限');
    assert.ok(Math.abs(tri.x0) < 1e-12 && Math.abs(tri.x0 + tri.n * tri.dx - 2) < 1e-9, '站位铺满 0…2');
});

test('depthAt：椭圆剖面上高度 y 处的横向半宽——剖面正中最大，上下沿为 0，越界夹取', () => {
    for (const species of SPECIES) {
        const body = opOf(restOps(species), 'body');
        const st = Yaw.stationsOf(body.polys[0], Yaw.PROFILES[species].tau);
        const k = Math.round(st.n * 0.55), x = st.x0 + k * st.dx;
        assert.ok(Math.abs(Yaw.depthAt(st, x, st.yc[k]) - st.rz[k]) < 1e-12, '正中 = rz');
        assert.ok(Math.abs(Yaw.depthAt(st, x, st.yc[k] - st.ry[k])) < 1e-9, '上沿 0');
        assert.ok(Math.abs(Yaw.depthAt(st, x, st.yc[k] + st.ry[k])) < 1e-9, '下沿 0');
        assert.ok(Math.abs(Yaw.depthAt(st, x, st.yc[k] + 5 * st.ry[k])) < 1e-9, '越界夹到下沿');
        const half = Yaw.depthAt(st, x, st.yc[k] + st.ry[k] * 0.5);
        assert.ok(Math.abs(half - st.rz[k] * Math.sqrt(0.75)) < 1e-9, '半高处 = rz·√(1−0.25)');
        assert.ok(Math.abs(Yaw.depthAt(st, st.x0 - 100, st.yc[0]) - st.rz[0]) < 1e-12, 'x 越界夹到端点站位');
    }
});

test('facing：θ = 0 时整片近侧朝向观众（= ry·cosα）、远侧背向；θ = 90° 时只有躯干在变窄的那一段（鼻端一侧）朝向观众，近侧与远侧的法线 x 分量相同', () => {
    for (const species of SPECIES) {
        const st = Yaw.stationsOf(opOf(restOps(species), 'body').polys[0], Yaw.PROFILES[species].tau);
        for (const x of [-25, -10, 0, 15, 30, 35]) {
            const k = Math.round((x - st.x0) / st.dx);
            assert.ok(Math.abs(Yaw.facing(st, x, st.yc[k], 1, 0, 1) - st.ry[k]) < 1e-9, `${species} 近侧正中 ${x}`);
            assert.ok(Yaw.facing(st, x, st.yc[k], 1, 0, -1) < 0, `${species} 远侧背向 ${x}`);
            assert.ok(Yaw.facing(st, x, st.yc[k] - st.ry[k] * 0.5, 1, 0, 1) > 0, `${species} 近侧偏上 ${x}`);
        }
    }
    // 正对时：躯干往后越来越粗（后半段）背向观众，往鼻端越来越细（前半段）朝向观众——取剖面变化率明确的位置，不取变化率接近 0 的最粗处
    const hammer = Yaw.stationsOf(opOf(restOps('hammer'), 'body').polys[0], Yaw.PROFILES.hammer.tau);
    const whale = Yaw.stationsOf(opOf(restOps('whaleshark'), 'body').polys[0], Yaw.PROFILES.whaleshark.tau);
    const at = (st, x) => { const k = Math.round((x - st.x0) / st.dx); return { k, y: st.yc[k] }; };
    for (const [name, st, front, rear] of [['hammer', hammer, [20, 30, 35], [-30, -20, -10]], ['whaleshark', whale, [35, 45], [-30, -20, -10]]]) {
        for (const x of front) assert.ok(Yaw.facing(st, x, at(st, x).y, 0, 1, 1) > 0, `${name} 正对时 x = ${x}（变细的一段）朝向观众`);
        for (const x of rear) assert.ok(Yaw.facing(st, x, at(st, x).y, 0, 1, 1) < 0, `${name} 正对时 x = ${x}（变粗的一段）背向观众`);
        for (const x of [...front, ...rear]) assert.equal(Yaw.facing(st, x, at(st, x).y, 0, 1, 1), Yaw.facing(st, x, at(st, x).y, 0, 1, -1), `${name} 正对时左右两侧法线 x 分量相同 x = ${x}`);
    }
    const f = Yaw.facing(hammer, 30, at(hammer, 30).y, 6e-17, 1, 1);
    assert.ok(f > 0 && Math.abs(f - Yaw.facing(hammer, 30, at(hammer, 30).y, 0, 1, 1)) < 1e-9, 'cos(π/2) 的浮点残差不改变符号');
    // 分量按公式组合：n.x·sinθ ± ry·cosα·cosθ
    const k = at(hammer, 20).k, y = hammer.yc[k] - hammer.ry[k] * 0.6;
    const t = -0.6, cos2 = 1 - t * t;
    const nx = -hammer.rz[k] * t * (hammer.dyc[k] + hammer.dry[k] * t) - hammer.drz[k] * hammer.ry[k] * cos2;
    const th = 0.7;
    assert.ok(Math.abs(Yaw.facing(hammer, 20, y, Math.cos(th), Math.sin(th), 1) - (nx * Math.sin(th) + hammer.ry[k] * Math.sqrt(cos2) * Math.cos(th))) < 1e-9, '近侧');
    assert.ok(Math.abs(Yaw.facing(hammer, 20, y, Math.cos(th), Math.sin(th), -1) - (nx * Math.sin(th) - hammer.ry[k] * Math.sqrt(cos2) * Math.cos(th))) < 1e-9, '远侧');
});

// ---------- 裁剪 ----------

test('clipClosed / clipRuns：按标量场 f ≥ 0 裁剪，交点按 f 线性插值；全在内返回原数组、全在外返回 null / 空', () => {
    const f = (x) => x;                                   // 保留 x ≥ 0
    const square = [-2, -1, 2, -1, 2, 1, -2, 1];
    const half = Yaw.clipClosed(square, f);
    assert.deepEqual(half.length, 8);
    const b = bbox([{ pts: half }]);
    assert.ok(b.x0 === 0 && b.x1 === 2 && b.y0 === -1 && b.y1 === 1, JSON.stringify(b));
    const inside = [1, 0, 3, 0, 2, 2];
    assert.equal(Yaw.clipClosed(inside, f), inside, '全在内：原样返回同一个数组');
    assert.equal(Yaw.clipClosed([-3, 0, -1, 0, -2, 2], f), null, '全在外');
    assert.equal(Yaw.clipClosed([-1, 0, 1, 0], f), null, '不足 3 个点');
    const tri = Yaw.clipClosed([-1, -1, 3, 0, -1, 1], f);                  // 三角形尖端伸进 x ≥ 0
    assert.ok(tri && bbox([{ pts: tri }]).x0 >= 0 && bbox([{ pts: tri }]).x1 === 3);
    const skew = Yaw.clipClosed([0, 0, 2, 0, 1, 2], x => x - 1);            // 以 x = 1 为界：f 的线性插值把交点放在边与 x = 1 的相交处
    assert.ok(skew.every((v, i) => i % 2 || v >= 1 - 1e-12), '裁剪后所有点 x ≥ 1');
    // 折线
    assert.deepEqual(Yaw.clipRuns([-1, 0, 1, 0, 3, 0], f), [[0, 0, 1, 0, 3, 0]], '一头在外：从交点开始');
    assert.deepEqual(Yaw.clipRuns([1, 0, 3, 0], f), [[1, 0, 3, 0]], '全在内');
    assert.deepEqual(Yaw.clipRuns([-3, 0, -1, 0], f), [], '全在外');
    assert.deepEqual(Yaw.clipRuns([1, 0, -1, 0, 1, 1, 3, 1], f), [[1, 0, 0, 0], [0, 0.5, 1, 1, 3, 1]], '穿出再穿回：两段，交点按 f 线性插值');
    assert.deepEqual(Yaw.clipRuns([5, 5], f), [], '单个点不成段');
});

// ---------- 投影 ----------

test('project：θ = 0 时除了躯干轮廓和藏在身后的远侧鳍，所有图层与输入逐点一致（转身开始/结束的那一帧没有跳变）', () => {
    for (const species of SPECIES) {
        const ops = restOps(species);
        const before = clone(ops);
        const out = Yaw.project(ops, species, 0);
        assert.ok(Array.isArray(out), species);
        assert.deepEqual(ops, before, '不改输入');
        const byId = new Map(out.map(op => [op.id, op]));
        for (const op of ops) {
            if (op.id === 'body') continue;
            const projected = byId.get(op.id);
            assert.ok(projected, `${species}：${op.id} 还在`);
            assert.equal(projected.k, op.k);
            assert.equal(projected.polys.length, op.polys.length, `${op.id} 的子路径数不变`);
            for (let p = 0; p < op.polys.length; p++) {
                assert.equal(projected.polys[p].pts.length, op.polys[p].pts.length, `${op.id} 的点数不变`);
                for (let i = 0; i < op.polys[p].pts.length; i++) assert.ok(Math.abs(projected.polys[p].pts[i] - op.polys[p].pts[i]) < 1e-9, `${species}.${op.id} 点 ${i}`);
            }
        }
        // 轮廓 = 原躯干，锤头鲨再加上锤头厚度那一块（美术里锤头是单独的“杆”图层，躯干多边形不含它，杆右端比锤头剖面短不到 1 个单位）
        const inBody = bbox(opOf(ops, 'body').polys), outBody = bbox(opOf(out, 'body').polys);
        const want = species === 'hammer' ? bbox([].concat(opOf(ops, 'body').polys, opOf(ops, 'bar').polys)) : inBody;
        assert.ok(Math.abs(outBody.x0 - inBody.x0) < 0.4, `${species}：轮廓左端 ${brief(outBody.x0)} vs ${brief(inBody.x0)}`);
        assert.ok(outBody.x1 >= inBody.x1 - 0.4 && outBody.x1 <= want.x1 + 0.8, `${species}：轮廓右端 ${brief(outBody.x1)} 在 ${brief(inBody.x1)}…${brief(want.x1 + 0.8)}`);
        assert.ok(Math.abs(outBody.y0 - inBody.y0) < 0.4 && Math.abs(outBody.y1 - inBody.y1) < 0.4, `${species}：轮廓上下沿 ${brief(outBody.y0)}…${brief(outBody.y1)} vs ${brief(inBody.y0)}…${brief(inBody.y1)}`);
        assert.equal(out.some(op => op.id === 'volume'), false, 'θ = 0 没有体积感暗层');
        assert.ok(out.length >= ops.length, '多出来的只有远侧的鳍');
        const extra = out.filter(op => !ops.some(o => o.id === op.id));
        assert.deepEqual(extra.map(op => op.id).sort(), species === 'hammer' ? ['pecFar', 'pelvicFar'] : ['pelvicFar'], `${species}：多出的图层`);
        for (const op of extra) assert.ok(out.indexOf(op) < out.indexOf(opOf(out, 'body')), `${op.id} 画在躯干之前（身体后面）`);
    }
});

test('project：θ = 90° 时正对观众——矢状面的鳍压成一条线，轮廓左右对称，宽度 = 最大剖面半宽的 2 倍（锤头鲨 = 锤头 29），高度 = 躯干最大高度', () => {
    for (const species of SPECIES) {
        const prof = Yaw.PROFILES[species];
        const ops = restOps(species);
        const out = Yaw.project(ops, species, HALF_PI);
        for (const id of prof.sagittal) {
            const op = opOf(out, id);
            for (const poly of op.polys) for (let i = 0; i < poly.pts.length; i += 2) assert.ok(Math.abs(poly.pts[i]) < 1e-9, `${species}.${id} 只剩一条竖线`);
        }
        const sil = bbox(opOf(out, 'body').polys);
        assert.ok(Math.abs(sil.x0 + sil.x1) < 1e-6, `${species}：左右对称 ${brief(sil.x0)} / ${brief(sil.x1)}`);
        const stations = refStations(opOf(ops, 'body').polys[0], prof.tau);
        let maxRz = Math.max(...stations.map(st => st.rz));
        if (prof.hammer) {                                                       // 锤头的 9 个离散站位（宽度像透镜）：最大值略小于 half，是站位取样的结果，不是误差
            for (let k = 0; k <= 8; k++) maxRz = Math.max(maxRz, prof.hammer.half * Math.sqrt(Math.max(0, 1 - Math.pow((k / 8 - 0.45) / 0.62, 2))));
        }
        assert.ok(Math.abs(sil.w - 2 * maxRz) < 1e-6, `${species}：宽 ${brief(sil.w)} vs ${brief(2 * maxRz)}`);
        const own = bbox(opOf(ops, 'body').polys);
        assert.ok(Math.abs(sil.h - own.h) < 0.5, `${species}：高 ${brief(sil.h)} vs 躯干 ${brief(own.h)}`);
        assert.ok(opOf(out, 'volume'), '有体积感暗层');
    }
});

test('project：轮廓与独立实现的“核心薄片 ∪ 椭圆剖面”成员判定一致（格点 IoU ≥ 0.99，实测最低 0.995），多个转角、含游动弯曲的姿态', () => {
    for (const species of SPECIES) {
        for (const pose of [{}, { phase: 1.1, amp: 0.8, turn: 0.4 }]) {
            const prof = Yaw.PROFILES[species];
            const ops = restOps(species, pose);
            const stations = refStations(opOf(ops, 'body').polys[0], prof.tau);
            for (const theta of [0.25, 0.7, 1.15, HALF_PI]) {
                const c = Math.cos(theta), s = Math.sin(theta);
                const out = Yaw.project(ops, species, theta);
                const sil = opOf(out, 'body').polys[0].pts;
                const inRef = refInside(stations, prof.hammer, c, s), inPoly = polyInside(sil);
                const b = bbox([{ pts: sil }]);
                let both = 0, either = 0;
                for (let u = b.x0 - 3; u <= b.x1 + 3; u += 0.2) for (let v = b.y0 - 3; v <= b.y1 + 3; v += 0.2) {
                    const a = inRef(u, v), p = inPoly(u, v);
                    if (a && p) both++;
                    if (a || p) either++;
                }
                const iou = both / either;
                assert.ok(iou >= 0.99, `${species} amp ${pose.amp || 0} θ ${brief(theta, 2)}：IoU ${brief(iou)}`);
            }
        }
    }
});

test('project：近侧体表按深度向尾侧移（x\' = x·cosθ − z·sinθ），远侧鳍与近侧鳍在身体两侧，鳍根部之外张开得更多', () => {
    const species = 'hammer';
    const theta = 1.0;
    const c = Math.cos(theta), s = Math.sin(theta);
    const ops = restOps(species);
    const out = Yaw.project(ops, species, theta);
    const body = opOf(ops, 'body');
    const st = Yaw.stationsOf(body.polys[0], Yaw.PROFILES[species].tau);
    // 体表：鳃裂（折线）里朝向观众的每个顶点都按所在剖面的深度位移到 x·cosθ − z·sinθ，y 不变
    const gills = opOf(out, 'gills');
    const inGills = opOf(ops, 'gills');
    assert.equal(inGills.polys.length, 5);
    assert.ok(gills.polys.length >= 1 && gills.polys.length <= 10);
    const outPts = gills.polys.flatMap(poly => poly.pts.reduce((acc, v, i) => (i % 2 ? acc : acc.concat([[v, poly.pts[i + 1]]])), []));
    let checked = 0;
    for (const poly of inGills.polys) for (let i = 0; i < poly.pts.length; i += 2) {
        const x = poly.pts[i], y = poly.pts[i + 1];
        if (!(Yaw.facing(st, x, y, c, s, 1) >= 0)) continue;
        const want = [x * c - Yaw.depthAt(st, x, y) * s, y];
        assert.ok(outPts.some(p => Math.abs(p[0] - want[0]) < 1e-9 && Math.abs(p[1] - want[1]) < 1e-9), `鳃裂顶点 (${brief(x)}, ${brief(y)}) → (${brief(want[0])}, ${brief(want[1])})`);
        checked++;
    }
    assert.ok(checked >= 5, `朝向观众的鳃裂顶点 ${checked} 个`);
    assert.ok(outPts.every(p => p[0] < 100 && p[0] > -100));
    // 鳍：远侧在近侧的右边（近侧向尾侧移，远侧向鼻侧移）
    const pec = opOf(out, 'pec'), pecFar = opOf(out, 'pecFar');
    assert.ok(meanX(pec) < meanX(pecFar), `近侧胸鳍 ${brief(meanX(pec))} 在远侧 ${brief(meanX(pecFar))} 的左边`);
    assert.ok(out.indexOf(pecFar) < out.indexOf(opOf(out, 'body')) && out.indexOf(pec) > out.indexOf(opOf(out, 'body')), '远侧鳍在躯干之前、近侧鳍在躯干之后');
    // 远侧鳍的颜色比近侧暗
    const dark = opOf(out, 'pelvicFar'), light = opOf(out, 'pelvic');
    const rgbOf = op => (op.paint.rgba ? op.paint.rgba.slice(0, 3) : op.paint.grad.stops[op.paint.grad.stops.length - 1].slice(1, 4));
    const near = rgbOf(light), far = rgbOf(dark);
    assert.ok(far.every((v, i) => Math.abs(v - near[i] * Yaw.FAR_SHADE) < 1e-9), '远侧鳍 = 近侧颜色 × FAR_SHADE');
    assert.equal(dark.paint.rgba[3], light.paint.rgba[3], '不透明度不变');
    // 原图里的鳍不被改色
    assert.deepEqual(opOf(restOps(species), 'pelvic').paint, light.paint);
});

test('project（锤头鲨）：美术里竖着的锤头杆随转身滚成横杆，眼睛是球——中心按滚动投影、形状不变，正对时左右各一只', () => {
    const ops = restOps('hammer');
    const centre0 = { eyeNear: centroid(opOf(ops, 'eyeNear')), eyeFar: centroid(opOf(ops, 'eyeFar')) };
    const rimWidth = id => bbox(opOf(ops, id).polys).w;
    const side = Yaw.project(ops, 'hammer', 0);
    for (const id of ['eyeNear', 'eyeFar']) {
        const [cx, cy] = centroid(opOf(side, id));
        assert.ok(Math.abs(cx - centre0[id][0]) < 1e-9 && Math.abs(cy - centre0[id][1]) < 1e-9, `${id} θ = 0 不动`);
    }
    const head = Yaw.project(ops, 'hammer', HALF_PI);
    const near = centroid(opOf(head, 'eyeNear')), far = centroid(opOf(head, 'eyeFar'));
    assert.ok(Math.abs(near[0] - (-(centre0.eyeNear[1] - 0.5))) < 1e-6 && Math.abs(near[1] - 0.5) < 1e-6, `近侧眼睛正对时在锤头左端 ${near}`);
    assert.ok(Math.abs(far[0] - (-(centre0.eyeFar[1] - 0.5))) < 1e-6 && Math.abs(far[1] - 0.5) < 1e-6, `远侧眼睛正对时在锤头右端 ${far}`);
    assert.ok(near[0] < 0 && far[0] > 0, '一左一右');
    for (const id of ['eyeNear', 'eyeFar']) assert.ok(Math.abs(bbox(opOf(head, id).polys).w - rimWidth(id)) < 1e-9 && Math.abs(bbox(opOf(head, id).polys).h - bbox(opOf(ops, id).polys).h) < 1e-9, `${id} 形状不变（球）`);
    // 杆本身滚平：正对时高度收成一条线，侧视时是竖杆
    const barSide = bbox(opOf(side, 'bar').polys), barHead = bbox(opOf(head, 'bar').polys);
    assert.ok(barSide.h > 20 && barHead.h < 1e-6, `杆的高度 ${brief(barSide.h)} → ${brief(barHead.h)}`);
    assert.ok(barHead.w > 20, `杆的宽度 ${brief(barHead.w)}（横着的）`);
    // 中间转角单调：杆的高度随转角下降
    let last = Infinity;
    for (const theta of [0, 0.3, 0.6, 0.9, 1.2, HALF_PI]) {
        const h = bbox(opOf(Yaw.project(ops, 'hammer', theta).slice(), 'bar').polys).h;
        assert.ok(h <= last + 1e-9, `θ ${brief(theta, 2)} 杆高 ${brief(h)} ≤ ${brief(last)}`);
        last = h;
    }
});

test('project：体表背面被裁掉——转到正对时躯干后半段（变宽的部分）的近侧图案不再出现，远侧体表在 θ 超过阈值后才出现', () => {
    const ops = restOps('whaleshark');
    const idsAt = theta => Yaw.project(ops, 'whaleshark', theta).map(op => op.id);
    const count = (list, id) => list.filter(x => x === id).length;
    for (const theta of [0, 0.4, 0.8]) assert.equal(count(idsAt(theta), 'spotsFlank'), 1, `θ ${theta}：远侧体表还没有出现`);
    assert.equal(count(idsAt(HALF_PI), 'spotsFlank'), 2, '正对时远侧体表出现（左右各一份）');
    assert.equal(count(idsAt(1.2), 'belly3'), 2);
    // 斑点：近侧在 θ = 0 时全部保留；正对时只留下前半段的（x > 躯干最粗处）
    const spotsAt = theta => opOf(Yaw.project(ops, 'whaleshark', theta), 'spotsFlank').polys.length;
    assert.equal(spotsAt(0), opOf(ops, 'spotsFlank').polys.length, 'θ = 0 一个不少');
    assert.ok(spotsAt(HALF_PI) < spotsAt(0) * 0.8, `正对时背向观众的斑点被裁掉 ${spotsAt(HALF_PI)} < ${spotsAt(0)}`);
    // 左右对称：正对时近侧与远侧的斑点数一样多
    const out = Yaw.project(ops, 'whaleshark', HALF_PI);
    const flanks = out.filter(op => op.id === 'spotsFlank');
    assert.equal(flanks.length, 2);
    assert.equal(flanks[0].polys.length, flanks[1].polys.length, '正对时近侧与远侧斑点一样多');
    const near = flanks[1], far = flanks[0];
    assert.ok(meanX(near) < 0 && meanX(far) > 0, `近侧在屏幕左半边 ${brief(meanX(near))}，远侧在右半边 ${brief(meanX(far))}`);
    assert.ok(out.indexOf(far) < out.indexOf(opOf(out, 'volume')) && out.indexOf(opOf(out, 'volume')) < out.indexOf(near), '顺序：远侧图案 → 体积感 → 近侧图案');
});

test('project：体积感暗层——θ 越大越深（∝ sinθ），从近侧（屏幕左）到远侧（右）渐深，颜色取躯干色的暗色', () => {
    const ops = restOps('hammer');
    const bodyRgb = opOf(ops, 'body').paint.rgba;
    let last = -1;
    for (const theta of [0.2, 0.6, 1.0, 1.4, HALF_PI]) {
        const out = Yaw.project(ops, 'hammer', theta);
        const volume = opOf(out, 'volume');
        assert.equal(volume.k, 'fill');
        const g = volume.paint.grad;
        assert.equal(g.stops.length, 3);
        assert.equal(g.stops[0][4], 0); assert.equal(g.stops[1][4], 0);
        assert.ok(Math.abs(g.stops[2][4] - 0.42 * Math.sin(theta)) < 1e-12, `θ ${theta}：最深处 α = 0.42·sinθ`);
        assert.ok(g.stops[2][4] > last, '单调变深'); last = g.stops[2][4];
        for (let i = 0; i < 3; i++) assert.ok(Math.abs(g.stops[2][1 + i] - bodyRgb[i] * 0.4) < 1e-12, '暗色 = 躯干色 × 0.4');
        assert.ok(g.a[0] < g.b[0] && g.a[1] === 0 && g.b[1] === 0, '横向渐变，左近右远');
        const sil = opOf(out, 'body').polys[0].pts, b = bbox([{ pts: sil }]);
        assert.ok(Math.abs(g.a[0] - b.x0) < 1e-9 && Math.abs(g.b[0] - b.x1) < 1e-9, '渐变范围 = 轮廓的横向范围');
    }
});

test('project：游动弯曲与拉尾的姿态也能投影（输入是求值后的图层），结果有限、不改输入、结果可重复', () => {
    for (const species of SPECIES) {
        for (const pose of [{ phase: 2.3, amp: 1, turn: 1 }, { phase: -1, amp: 0.4, turn: -1 }, { phase: 0.5, amp: 0.8, turn: 0.2, pull: [-8, 6] }, { phase: 0, amp: 0, turn: 0, lod: 0 }, { lod: 1, amp: 0.6, phase: 1 }]) {
            const ops = restOps(species, pose);
            const before = clone(ops);
            for (const theta of [0.01, 0.5, 1.0, 1.5, HALF_PI - 1e-9]) {
                const out = Yaw.project(ops, species, theta);
                assert.ok(Array.isArray(out), `${species} ${JSON.stringify(pose)} θ ${theta}`);
                for (const op of out) for (const poly of op.polys) assert.ok(poly.pts.every(Number.isFinite), `${op.id} 有限`);
                assert.deepEqual(clone(Yaw.project(ops, species, theta)), clone(out), '确定性');
            }
            assert.deepEqual(ops, before, '不改输入');
        }
    }
});

test('project：转角越界夹取、非有限转角返回 null；不支持的物种、没有躯干、坏图层、坏躯干都返回 null 而不是抛异常', () => {
    const ops = restOps('hammer');
    assert.deepEqual(clone(Yaw.project(ops, 'hammer', -3)), clone(Yaw.project(ops, 'hammer', 0)), '负转角夹到 0');
    assert.deepEqual(clone(Yaw.project(ops, 'hammer', 9)), clone(Yaw.project(ops, 'hammer', HALF_PI)), '过大的转角夹到 π/2');
    for (const bad of [NaN, Infinity, -Infinity, '0.5', null, undefined, {}]) assert.equal(Yaw.project(ops, 'hammer', bad), null, String(bad));
    for (const species of ['manta', 'turtle', 'neon', '', null, undefined, 7, 'toString']) assert.equal(Yaw.project(ops, species, 0.5), null, String(species));
    for (const bad of [null, undefined, {}, 'ops', 3, []]) assert.equal(Yaw.project(bad, 'hammer', 0.5), null, JSON.stringify(bad));
    assert.equal(Yaw.project(ops.filter(op => op.id !== 'body'), 'hammer', 0.5), null, '没有躯干');
    assert.equal(Yaw.project(ops.map(op => (op.id === 'body' ? Object.assign({}, op, { polys: [] }) : op)), 'hammer', 0.5), null, '躯干没有多边形');
    assert.equal(Yaw.project(ops.map(op => (op.id === 'body' ? Object.assign({}, op, { polys: [{ pts: [0, 0, 0.5, 1, 1, 0], closed: true }] }) : op)), 'hammer', 0.5), null, '躯干横向不足 1 个单位');
    assert.equal(Yaw.project(ops.concat([null]), 'hammer', 0.5), null, '图层表里有 null');
    assert.equal(Yaw.project(ops.concat([{ id: 'x', k: 'fill' }]), 'hammer', 0.5), null, '图层没有 polys');
    const nan = clone(ops);
    opOf(nan, 'gills').polys[0].pts[0] = NaN;
    assert.equal(Yaw.project(nan, 'hammer', 0.5), null, '图层里有非有限坐标');
    const nanBody = clone(ops);
    opOf(nanBody, 'body').polys[0].pts[4] = Infinity;
    assert.equal(Yaw.project(nanBody, 'hammer', 0.5), null, '躯干里有非有限坐标');
});

test('project：未登记的图层一律当体表图层处理（按深度位移，背面被裁掉），不会被丢掉、也不会被当成矢状面压扁', () => {
    const tri = [8, -2, 18, -2, 13, 4];                                          // 躯干内部的一个小三角形：近侧朝向观众
    const ops = restOps('hammer').concat([{ id: 'mystery', k: 'fill', rule: 'nonzero', paint: { rgba: [1, 0, 0, 1] }, polys: [{ pts: tri, closed: true }] }]);
    const out = Yaw.project(ops, 'hammer', 1.0);
    const mystery = opOf(out, 'mystery');
    assert.ok(mystery, '没有被丢掉');
    assert.equal(mystery.polys.length, 1);
    const st = Yaw.stationsOf(opOf(ops, 'body').polys[0], Yaw.PROFILES.hammer.tau);
    for (let i = 0; i < 6; i += 2) {
        const want = tri[i] * Math.cos(1.0) - Yaw.depthAt(st, tri[i], tri[i + 1]) * Math.sin(1.0);
        assert.ok(mystery.polys[0].pts.some((v, j) => j % 2 === 0 && Math.abs(v - want) < 1e-6), `顶点 ${i / 2} 按深度位移到 ${brief(want)}`);
    }
    assert.ok(mystery.polys[0].pts.every(Number.isFinite));
    assert.equal(opOf(Yaw.project(ops, 'hammer', 0), 'mystery').polys[0].pts.join(), tri.join(), 'θ = 0 原样');
});

test('project：成本——游动姿态下单次投影在宽松上限内（平均 < 10 ms，实测约 0.2–0.6 ms，上限只防数量级退化）', () => {
    for (const species of SPECIES) {
        const ops = restOps(species, { phase: 1.1, amp: 0.8, turn: 0.2 });
        for (let i = 0; i < 5; i++) Yaw.project(ops, species, 0.9);
        const t0 = process.hrtime.bigint();
        const n = 40;
        for (let i = 0; i < n; i++) Yaw.project(ops, species, 0.3 + (i % 8) * 0.15);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
        assert.ok(ms < 10, `${species} 平均 ${brief(ms)} ms`);
    }
});

// ---------- 精确值与独立参照 ----------
// 下面这批用例来自对本模块的变异检查（956 个变异；过程与剩余存活者的分类见 docs/technical/aquarium-yaw-20261020.md §4.5）：第一轮 240 个存活，
// 逐个用差分探针（同一批输入分别喂原模块与变异体，比公开接口的输出）核对后，126 个在公开接口上可以观察到区别，说明原来的断言只看了少数几个图层/几个转角、
// 没有看这些位置。这里用解析形状（输入的正确答案能手算）、独立写的参照（放样面法线用切向量叉乘）和美术数据钉子把它们补上；
// 之后又有 7 个差分探针看得出来的、8 个要手工构造输入才看得出来的存活者（“坏数据与退化输入”一节），也补成了用例。
// 美术取值（剖面表、锤头尺寸、阴影系数）钉死在这里：参照渲染与真实 Chrome 的核对是按这些数做的，要改须重做核对并同步这里。

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}：${brief(a, 6)} vs ${brief(b, 6)}`);
const closeList = (got, want, tol, msg) => {
    assert.equal(got.length, want.length, `${msg}：长度 ${got.length} vs ${want.length}`);
    for (let i = 0; i < want.length; i++) close(got[i], want[i], tol, `${msg}[${i}]`);
};
const closePolys = (got, want, tol, msg) => {
    assert.equal(got.length, want.length, `${msg}：子路径数 ${got.length} vs ${want.length}`);
    for (let p = 0; p < want.length; p++) {
        assert.equal(got[p].closed, want[p].closed, `${msg}：子路径 ${p} 的 closed`);
        closeList(got[p].pts, want[p].pts, tol, `${msg}：子路径 ${p}`);
    }
};
const FLAT_TAU = [[-100, 1], [100, 1]];
// 合成纺锤躯干：x ∈ [−48, 48] 每 1 个单位一个顶点（站位间距正好是 1，没有浮点误差），中心线 y = 1，半高 8·√(1 − (x/48)²)
const spindlePoly = () => {
    const top = [], bottom = [];
    for (let x = -48; x <= 48; x++) { const r = 8 * Math.sqrt(Math.max(0, 1 - (x / 48) ** 2)); top.push(x, 1 - r); bottom.push(x, 1 + r); }
    const pts = top.slice();
    for (let i = bottom.length - 4; i >= 2; i -= 2) pts.push(bottom[i], bottom[i + 1]);
    return { pts, closed: true };
};
const shoelace = pts => { let a = 0; for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) a += pts[j] * pts[i + 1] - pts[i] * pts[j + 1]; return Math.abs(a) / 2; };
// 斜截梯形躯干：上沿 y = −3 + 0.02x、下沿 y = 5 + 0.05x（x ∈ [−48, 48]）→ yc = 1 + 0.035x、ry = 4 + 0.015x；tau 线性 1…2 → rz = ry·tau（二次）
const TRAPEZOID = { pts: [-48, -3.96, 48, -2.04, 48, 7.4, -48, 2.6], closed: true };
const TRAPEZOID_TAU = [[-48, 1], [48, 2]];
const trapezoid = { yc: x => 1 + 0.035 * x, ry: x => 4 + 0.015 * x, tau: x => 1 + (x + 48) / 96 };

test('数据钉子：站位数、采样数、朝向、远侧变暗系数与两个物种的剖面/锤头数据 = 评审过的数值', () => {
    assert.deepEqual([Yaw.STATIONS, Yaw.SAMPLES, Yaw.TOWARD, Yaw.FAR_SHADE], [96, 112, -1, 0.72]);
    assert.deepEqual(clone(Yaw.PROFILES), {
        hammer: {
            tau: [[-50, 0.85], [50, 0.85]],
            sagittal: ['dorsal1', 'dorsal2', 'anal', 'caudal'],
            plates: [{ id: 'pec', root: [22, 4.4], spread: 0.5, farId: null }, { id: 'pelvic', root: [-3, 7.6], spread: 0.35, farId: null }],
            roll: { ids: ['bar', 'barEdge', 'nostril', 'eyeNear', 'eyeNearGlint', 'eyeFar'], balls: ['eyeNear', 'eyeNearGlint', 'eyeFar'], yc: 0.5 },
            hammer: { x0: 41, x1: 50.2, half: 14.5, ry: 3.6, yc: 1.2 },
        },
        whaleshark: {
            tau: [[-50, 1], [-9, 1], [20, 1.05], [36, 1.35], [41.5, 1.6], [45, 2], [47.6, 2.3], [50.4, 2.6]],
            sagittal: ['dorsal1', 'dorsal2', 'anal', 'caudal'],
            plates: [{ id: 'pec', root: [26, 4], spread: 0.5, farId: 'pecFar' }, { id: 'pelvic', root: [-5, 7.3], spread: 0.35, farId: null }],
            roll: null,
            hammer: null,
        },
    });
});

// ---------- 站位：解析形状 ----------

test('stationsOf：解析形状逐站位核对——三角形、U 形（凹多边形）；各数组等长；横向范围只看“最大 − 最小”，单个坐标非有限也拒绝', () => {
    // ① 三角形（宽 96，站位间距正好 1）：竖线上下界 0 与 min(x, 96 − x)，中心 = 下界/2，半高下限 0.15
    const tri = Yaw.stationsOf({ pts: [0, 0, 48, 48, 96, 0], closed: true }, FLAT_TAU);
    assert.equal(tri.n, 96); assert.equal(tri.x0, 0); assert.equal(tri.dx, 1);
    for (let k = 0; k <= 96; k++) {
        const bottom = Math.min(k, 96 - k);
        close(tri.yc[k], bottom / 2, 1e-12, `三角形 yc ${k}`);
        close(tri.ry[k], Math.max(bottom / 2, 0.15), 1e-12, `三角形 ry ${k}`);
        close(tri.rz[k], tri.ry[k], 1e-12, `三角形 rz ${k}`);
    }
    // ② U 形（中间一段被“挖”下去）：取竖线与轮廓所有交点的最小、最大值——x 在 30…66 之间（不含端点）是 0…4，其余（含两处竖直边上）是 0…10
    const u = Yaw.stationsOf({ pts: [0, 0, 96, 0, 96, 10, 66, 10, 66, 4, 30, 4, 30, 10, 0, 10], closed: true }, FLAT_TAU);
    for (let k = 0; k <= 96; k++) {
        const deep = k > 30 && k < 66;
        close(u.yc[k], deep ? 2 : 5, 1e-12, `U 形 yc ${k}`);
        close(u.ry[k], deep ? 2 : 5, 1e-12, `U 形 ry ${k}`);
    }
    // ③ 六个数组都是 n + 1 项
    const tz = Yaw.stationsOf(TRAPEZOID, TRAPEZOID_TAU);
    for (const key of ['yc', 'ry', 'rz', 'dyc', 'dry', 'drz']) assert.equal(tz[key].length, tz.n + 1, `${key} 长度`);
    // ④ 范围判断与位置无关：远离原点的窄多边形（宽 0.5）被拒绝，负坐标的宽多边形（宽 2）通过
    assert.equal(Yaw.stationsOf({ pts: [10, 0, 10.5, 1, 10.2, 2], closed: true }, FLAT_TAU), null);
    assert.ok(Yaw.stationsOf({ pts: [-30, 0, -28, 0, -29, 3], closed: true }, FLAT_TAU), '负坐标、宽 2 通过');
    // ⑤ 只有一个坐标非有限也拒绝（x 或 y，NaN 或 ±Infinity）
    for (const bad of [[0, 0, 10, NaN, 10, 5, 0, 5], [0, 0, NaN, 3, 10, 5, 0, 5], [0, 0, Infinity, 3, 10, 5, 0, 5], [0, 0, 10, -Infinity, 10, 5, 0, 5]]) {
        assert.equal(Yaw.stationsOf({ pts: bad, closed: true }, FLAT_TAU), null, JSON.stringify(bad));
    }
});

test('stationsOf：tau 表两端取端值（站位超出表的范围时不外推），表内线性插值', () => {
    const rect = Yaw.stationsOf({ pts: [-60, -1, 60, -1, 60, 1, -60, 1], closed: true }, [[-30, 0.5], [30, 1.5]]);   // 宽 120，站位间距 1.25
    assert.equal(rect.dx, 1.25);
    for (let k = 0; k <= rect.n; k++) {
        const x = -60 + 1.25 * k;
        const want = x <= -30 ? 0.5 : (x >= 30 ? 1.5 : 1 + x / 60);
        close(rect.rz[k] / rect.ry[k], want, 1e-12, `x = ${x}`);
    }
    const whale = Yaw.PROFILES.whaleshark.tau;                                  // 多段表：每个拐点上取值 = 表值
    const body = Yaw.stationsOf({ pts: [-50, -1, 52, -1, 52, 1, -50, 1], closed: true }, whale);
    for (let k = 0; k <= body.n; k++) {
        const x = body.x0 + k * body.dx;
        let want = whale[whale.length - 1][1];
        if (x <= whale[0][0]) want = whale[0][1];
        else for (let i = 1; i < whale.length; i++) if (x <= whale[i][0]) { const a = whale[i - 1], b = whale[i]; want = a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); break; }
        close(body.rz[k] / body.ry[k], want, 1e-9, `鲸鲨表 x = ${brief(x)}`);
    }
});

test('stationsOf：沿体轴的变化率——线性数据内部站位精确、两端 5 个站位因滑动平均被截断而偏小（0.5、0.5、0.75 倍）；二次数据（rz）内部同样精确', () => {
    const st = Yaw.stationsOf(TRAPEZOID, TRAPEZOID_TAU);
    assert.equal(st.n, 96); assert.equal(st.x0, -48); assert.equal(st.dx, 1);
    const factor = k => (k <= 1 ? 0.5 : (k === 2 ? 0.75 : (k >= st.n - 1 ? 0.5 : (k === st.n - 2 ? 0.75 : 1))));
    for (let k = 0; k <= st.n; k++) {
        const x = -48 + k;
        close(st.yc[k], trapezoid.yc(x), 1e-9, `yc ${k}`);
        close(st.ry[k], trapezoid.ry(x), 1e-9, `ry ${k}`);
        close(st.rz[k], trapezoid.ry(x) * trapezoid.tau(x), 1e-9, `rz ${k}`);
        close(st.dyc[k], 0.035 * factor(k), 1e-9, `dyc ${k}`);
        close(st.dry[k], 0.015 * factor(k), 1e-9, `dry ${k}`);
        if (k >= 3 && k <= st.n - 3) close(st.drz[k], 0.015 * trapezoid.tau(x) + trapezoid.ry(x) / 96, 1e-9, `drz ${k}`);
    }
});

test('facing：与放样面的解析法线一致（梯形躯干：由曲面两个切向量叉乘数值求得），站位序号在两端夹取', () => {
    const st = Yaw.stationsOf(TRAPEZOID, TRAPEZOID_TAU);
    const rz = x => trapezoid.ry(x) * trapezoid.tau(x);
    const surface = (x, alpha) => [x, trapezoid.yc(x) + trapezoid.ry(x) * Math.sin(alpha), rz(x) * Math.cos(alpha)];
    const sub = (a, b) => a.map((v, i) => v - b[i]);
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const h = 1e-5;
    for (const k of [5, 20, 48, 70, 91]) {
        const x = st.x0 + k * st.dx;
        for (const t of [-0.8, -0.3, 0.2, 0.7]) {
            const alpha = Math.asin(t), y = trapezoid.yc(x) + trapezoid.ry(x) * t;
            const tx = sub(surface(x + h, alpha), surface(x - h, alpha)).map(v => v / (2 * h));
            const ta = sub(surface(x, alpha + h), surface(x, alpha - h)).map(v => v / (2 * h));
            const n = cross(ta, tx).map(v => -v);                                // 外法线：近侧体表 z 分量为正
            for (const th of [0.3, 0.9, 1.4]) {
                const c = Math.cos(th), s = Math.sin(th);
                close(Yaw.facing(st, x, y, c, s, 1), n[0] * s + n[2] * c, 1e-6, `近侧 k ${k} t ${t} θ ${th}`);
                close(Yaw.facing(st, x, y, c, s, -1), n[0] * s - n[2] * c, 1e-6, `远侧 k ${k} t ${t} θ ${th}`);
            }
        }
    }
    // 站位序号两端夹取：x 在躯干之外时用端点站位（0 与 n）的数据
    const last = st.x0 + st.n * st.dx;
    for (const [x, k, t] of [[st.x0 - 50, 0, 0.3], [st.x0, 0, 0.3], [last, st.n, -0.2], [last + 50, st.n, -0.2]]) {
        const y = st.yc[k] + t * st.ry[k], cos2 = 1 - t * t;
        const nx = -st.rz[k] * t * (st.dyc[k] + st.dry[k] * t) - st.drz[k] * st.ry[k] * cos2;
        for (const side of [1, -1]) close(Yaw.facing(st, x, y, 0.6, 0.8, side), nx * 0.8 + side * st.ry[k] * Math.sqrt(cos2) * 0.6, 1e-12, `x = ${brief(x)} 夹到站位 ${k}`);
    }
});

test('stationsOf：最后一个站位因浮点舍入略超出多边形右端时（没有任何边覆盖它），取上一个站位的值——不隔一个站位去取，也不外推', () => {
    // 左 −40、右 −15.9：lo + 96·((hi − lo)/96) 比 hi 大 1.8e-15，最后一条竖线落在轮廓外一个舍入误差，没有任何交点（真实游动姿态里也会遇到）
    const lo = -40, hi = -15.9, n = 96;
    assert.ok(lo + n * ((hi - lo) / n) > hi, '前提：最后一个站位的位置确实略超出右端');
    const st = Yaw.stationsOf({ pts: [lo, -3, hi, -1, hi, 5, lo, 1], closed: true }, FLAT_TAU);   // 上、下沿都是斜线：yc = −1 + 3·r、ry = 2 + r，r = (x − lo)/(hi − lo)
    assert.ok(st, '96/97 个站位有效，不拒绝');
    for (let k = 0; k < n; k++) {
        const r = (st.x0 + k * st.dx - lo) / (hi - lo);
        close(st.yc[k], -1 + 3 * r, 1e-9, `yc ${k}`); close(st.ry[k], 2 + r, 1e-9, `ry ${k}`); close(st.rz[k], 2 + r, 1e-9, `rz ${k}`);
    }
    for (const key of ['yc', 'ry', 'rz']) assert.equal(st[key][n], st[key][n - 1], `最后一个站位的 ${key} 就是上一个站位的值`);
    assert.ok(Math.abs(st.yc[n - 1] - st.yc[n - 2]) > 0.03, '前提：数据是斜的，隔一个站位取会得到明显不同的值');
    assert.ok(Math.abs(st.yc[n] - 2) > 0.03, '前提：外推（在线性趋势上再走一步）也会得到不同的值');
});

// ---------- 裁剪：精确交点、顺序与格点成员判定 ----------

test('clipClosed / clipRuns：交点位置与顶点顺序精确（斜边、f 不是恒等式）；f = 0 的顶点算在内；结果与“多边形 ∩ f ≥ 0”的格点成员判定一致', () => {
    const exact = (got, want, msg) => closeList(got, want, 1e-12, msg);
    exact(Yaw.clipClosed([-2, 0, 4, 2, 4, 6, -2, 4], x => x), [0, 2 / 3, 4, 2, 4, 6, 0, 14 / 3], '斜四边形，保留 x ≥ 0');
    exact(Yaw.clipClosed([-2, 0, 4, 0, -2, 6], x => x), [0, 0, 4, 0, 0, 4], '三角形只有一个顶点在内');
    exact(Yaw.clipClosed([0, 0, 4, 0, 4, 4, 0, 4], (x, y) => y - 1), [0, 1, 4, 1, 4, 4, 0, 4], '正方形，保留 y ≥ 1（f 取决于 y）');
    exact(Yaw.clipClosed([0, 0, 4, 0, 4, 4, 0, 4], (x, y) => 3 - y), [0, 3, 0, 0, 4, 0, 4, 3], '正方形，保留 y ≤ 3（从第一条穿出的边的交点开始）');
    // 全部 f ≥ 0（含恰好 = 0 的顶点、含 0 < f < 1 的小值）：原样返回同一个数组
    const diamond = [0, -3, 3, 0, 0, 3, -3, 0], tiny = [0.1, 0.1, 0.4, 0.1, 0.4, 0.4, 0.1, 0.4];
    assert.equal(Yaw.clipClosed(diamond, x => x + 3), diamond, '顶点正好在边界上算在内');
    assert.equal(Yaw.clipClosed(tiny, x => 0.01 * x + 0.5), tiny, '0 < f < 1 的小值也算在内');
    assert.equal(Yaw.clipClosed(diamond, () => -1), null, '全在外');
    assert.equal(Yaw.clipClosed(diamond, () => NaN), null, 'f 不是数视为在外');
    // 折线
    assert.deepEqual(Yaw.clipRuns([-1, 0, 1, 2, 3, 0, 5, 2], (x, y) => y - 1), [[0, 1, 1, 2, 2, 1], [4, 1, 5, 2]], '穿出再穿回：两段，交点在 f = 0 处');
    assert.deepEqual(Yaw.clipRuns([0, -1, 1, 0, 2, 1], (x, y) => y), [[1, 0, 1, 0, 2, 1]], 'f 恰为 0 的点既是交点又是顶点：段首重复一次');
    assert.deepEqual(Yaw.clipRuns([0, 0, 1, 1, 2, 0], (x, y) => y), [[0, 0, 1, 1, 2, 0]], '全部 f ≥ 0（含 = 0）：一整段');
    assert.deepEqual(Yaw.clipRuns([0, 1, 1, 0, 2, -1], (x, y) => y), [[0, 1, 1, 0, 1, 0]], 'f 恰为 0 的点之后穿出：段尾重复一次');
    // 格点成员判定：多边形 ∩ {f ≥ 0}
    const polys = {
        quad: [-2, 0, 4, 2, 4, 6, -2, 4], tri: [-2, 0, 4, 0, -2, 6], diamond,
        ell: [0, 0, 6, 0, 6, 2, 2, 2, 2, 6, 0, 6],                              // L 形（凹）
        tiny,
    };
    const fields = {
        x: x => x, tilt: (x, y) => 0.1 * x + 0.05 * y - 0.2, half: x => 0.5 * x - 0.3, small: x => 0.01 * x + 0.5, up: (x, y) => y - 1, down: (x, y) => 2.5 - y,
    };
    for (const [pn, pts] of Object.entries(polys)) {
        const inPoly = polyInside(pts);
        for (const [fn, f] of Object.entries(fields)) {
            const out = Yaw.clipClosed(pts, f);
            const inOut = out ? polyInside(out) : () => false;
            const b = bbox([{ pts }]);
            let bad = 0, inside = 0;
            for (let u = b.x0 - 0.5; u <= b.x1 + 0.5; u += 0.05) for (let v = b.y0 - 0.5; v <= b.y1 + 0.5; v += 0.05) {
                const uu = u + 0.0137, vv = v + 0.0071;
                const want = inPoly(uu, vv) && f(uu, vv) >= 0;
                if (want) inside++;
                if (want !== inOut(uu, vv)) bad++;
            }
            assert.ok(bad <= 2, `${pn}/${fn}：格点不一致 ${bad}（其中应在内的 ${inside}）`);
            if (out && out !== pts) {                                            // 新点都落在 f = 0 上，其余点是原顶点
                for (let i = 0; i < out.length; i += 2) {
                    const isVertex = pts.some((v, j) => j % 2 === 0 && v === out[i] && pts[j + 1] === out[i + 1]);
                    assert.ok(isVertex || Math.abs(f(out[i], out[i + 1])) < 1e-9, `${pn}/${fn}：点 ${i / 2} 既不是原顶点也不在 f = 0 上`);
                }
            }
        }
    }
});

test('clipClosed：顶点恰好落在 f = 0 上算在内——进入处与退出处各带一个与该顶点重合的交点（零长度边，几何上不改变形状），点序固定', () => {
    const exact = (got, want, msg) => closeList(got, want, 1e-12, msg);
    exact(Yaw.clipClosed([0, -3, 3, 0, 0, 3, -3, 0], x => x), [0, -3, 0, -3, 3, 0, 0, 3, 0, 3], '菱形保留 x ≥ 0：两个在边界上的顶点各带一个重合的交点');
    exact(Yaw.clipClosed([-1, 0, 0, 1, 1, 2, 0, 3, -1, 2], x => -x), [-1, 0, 0, 1, 0, 1, 0, 3, 0, 3, -1, 2], '五边形保留 x ≤ 0：边界上的两个顶点同样各带一个');
    exact(Yaw.clipClosed([-1, 0, 0, 1, 1, 2, 0, 3, -1, 2], x => 0.25 * x), [0, 1, 0, 1, 1, 2, 0, 3, 0, 3], '五边形保留 x ≥ 0（f = 0.25x，缩放不改变交点位置）');
});

// ---------- 轮廓：合成纺锤躯干的精确值 ----------

test('silhouetteOf：合成纺锤躯干（可手算）——正对时宽 = 2·最大剖面半宽、θ = 0 时与躯干同宽同高；各转角的点数、范围、面积钉死', () => {
    const st = Yaw.stationsOf(spindlePoly(), [[-50, 0.85], [50, 0.85]]);
    const hammer = { x0: 41, x1: 50.2, half: 14.5, ry: 3.6, yc: 1.2 };
    // 手算的几处：无锤头时 θ = 0 是整条躯干（x ±48，y = 1 ± 8），θ = 90° 是最粗处的椭圆（x ±8·0.85 = ±6.8，y 同）
    const sil = (h, th) => Yaw.silhouetteOf(st, h, Math.cos(th), Math.sin(th));
    const plain0 = bbox([{ pts: sil(null, 0) }]), plain90 = bbox([{ pts: sil(null, HALF_PI) }]);
    close(plain0.x0, -48, 1e-9, 'θ = 0 左端'); close(plain0.x1, 48, 1e-9, 'θ = 0 右端'); close(plain0.y0, -7, 1e-9, 'θ = 0 上沿'); close(plain0.y1, 9, 1e-9, 'θ = 0 下沿');
    close(plain90.x0, -6.8, 1e-9, '正对左端'); close(plain90.x1, 6.8, 1e-9, '正对右端'); close(plain90.y0, -7, 1e-9, '正对上沿'); close(plain90.y1, 9, 1e-9, '正对下沿');
    // 锤头的最宽站位（u = 0.5：1 − ((0.5 − 0.45)/0.62)² 的平方根 × half）决定正对时的宽度
    const half = 14.5 * Math.sqrt(1 - Math.pow(0.05 / 0.62, 2));
    const head90 = bbox([{ pts: sil(hammer, HALF_PI) }]);
    close(head90.x1, half, 1e-9, '锤头鲨正对右端'); close(head90.x0, -half, 1e-9, '锤头鲨正对左端');
    // 钉死的数值（这套输入在当前实现下的结果；独立参照的 IoU 另有用例把正确性守住）
    const golden = [
        ['锤头', hammer, 0, 224, -48, 50.06404, -6.999491, 8.999491, 1225.28629],
        ['锤头', hammer, 0.6, 222, -38.911283, 46.538738, -6.999852, 8.999852, 1044.63999],
        ['锤头', hammer, 1.1, 224, -22.091728, 33.94174, -6.999542, 8.999542, 633.03496],
        ['锤头', hammer, HALF_PI, 226, -14.452772, 14.452772, -7, 9, 242.34476],
        ['无锤头', null, 0, 226, -48, 48, -7, 9, 1204.96711],
        ['无锤头', null, 0.6, 222, -38.979385, 38.979385, -7, 9, 994.9477],
        ['无锤头', null, 1.1, 222, -22.193025, 22.193025, -7, 9, 566.01125],
        ['无锤头', null, HALF_PI, 226, -6.8, 6.8, -7, 9, 170.75007],
    ];
    for (const [name, h, th, count, x0, x1, y0, y1, area] of golden) {
        const pts = sil(h, th), b = bbox([{ pts }]), tag = `${name} θ ${brief(th, 2)}`;
        assert.equal(pts.length / 2, count, `${tag} 点数`);
        close(b.x0, x0, 1e-5, `${tag} x0`); close(b.x1, x1, 1e-5, `${tag} x1`); close(b.y0, y0, 1e-5, `${tag} y0`); close(b.y1, y1, 1e-5, `${tag} y1`);
        close(shoelace(pts), area, 1e-3, `${tag} 面积`);
    }
    // 退化输入：没有任何覆盖返回 null
    const flat = { x0: 0, dx: 1, n: 2, yc: [0, 0, 0], ry: [1, 1, 1], rz: [0, 0, 0] };
    assert.equal(Yaw.silhouetteOf(flat, null, 0, 1), null, '正对且剖面都没有宽度：没有覆盖');
});

// 把轮廓点列 [上沿 m 个点…, 下沿 m 个点（反序）…] 拆成上、下两条同序的链
const splitSilhouette = sil => {
    const m = sil.length / 4, upper = [], lower = [];
    for (let i = 0; i < m; i++) upper.push([sil[2 * i], sil[2 * i + 1]]);
    for (let i = 0; i < m; i++) { const j = sil.length - 2 - 2 * i; lower.push([sil[j], sil[j + 1]]); }
    return { upper, lower };
};

test('silhouetteOf：锤头透镜的根部站位（k = 0）在身体很短时决定左缘——取值范围、轮廓左缘和左缘附近的上下沿都由它给出', () => {
    // 身体只是一小段（x 43…47，半高 0.5），锤头在 x 41…50.2：小角度时根部的椭圆比其他所有站位和身体都更靠左，只有它覆盖那一段
    const st = Yaw.stationsOf({ pts: [43, -0.5, 47, -0.5, 47, 0.5, 43, 0.5], closed: true }, [[43, 1], [47, 1]]);
    const spec = { x0: 41, x1: 50.2, half: 14.5, ry: 3.6, yc: 1.2 };
    const theta = 0.2, c = Math.cos(theta), s = Math.sin(theta);
    const lens = [];                                                             // 独立写一份透镜站位（与被测代码各写一份）
    for (let k = 0; k <= 8; k++) {
        const u = k / 8, prof = Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.45) / 0.62, 2)));
        lens.push({ x: 41 + 9.2 * u, a: 14.5 * prof * s + 0.65 * (9.2 / 8) * c, ry: 3.6 * (0.4 + 0.6 * prof) });
    }
    let lo = Infinity, hi = -Infinity;
    for (const l of lens) { lo = Math.min(lo, l.x * c - l.a); hi = Math.max(hi, l.x * c + l.a); }
    const bodyLo = 43 * c - 0.5 * s, bodyHi = 47 * c + 0.5 * s;
    assert.ok(bodyLo > lo && bodyHi < hi, '前提：身体整个落在锤头的范围里');
    const others = Math.min(bodyLo, ...lens.slice(1).map(l => l.x * c - l.a));  // 根部之外的一切的最左缘
    const step = (hi - lo) / Yaw.SAMPLES;
    assert.ok((others - lo) / step > 5, `前提：只有根部覆盖的那一段至少有 5 个采样间隔宽（${brief((others - lo) / step)}）`);
    const sil = Yaw.silhouetteOf(st, spec, c, s);
    const b = bbox([{ pts: sil }]);
    assert.ok(b.x0 >= lo - 1e-9 && b.x0 <= lo + 1.5 * step, `轮廓左缘 = 根部椭圆的左端 ${brief(lo, 4)}（最多晚一个采样间隔），实际 ${brief(b.x0, 4)}`);
    assert.ok(b.x1 <= hi + 1e-9 && b.x1 >= hi - 1.5 * step, `轮廓右缘 ${brief(hi, 4)}，实际 ${brief(b.x1, 4)}`);
    const { upper, lower } = splitSilhouette(sil);
    const onlyRoot = upper.map((p, i) => i).filter(i => upper[i][0] < others - 1e-9);
    assert.ok(onlyRoot.length >= 4, `只有根部覆盖的采样点 ${onlyRoot.length} 个`);
    for (const i of onlyRoot) {                                                  // 这些点的上、下沿 = 根部椭圆在该处的高度
        const d = upper[i][0] - lens[0].x * c, h = lens[0].ry * Math.sqrt(Math.max(0, 1 - (d * d) / (lens[0].a * lens[0].a)));
        close(upper[i][1], 1.2 - h, 1e-9, `上沿 ${i}`); close(lower[i][1], 1.2 + h, 1e-9, `下沿 ${i}`);
    }
});

test('silhouetteOf：躯干两端的站位（k = 0 与 k = n）也参与轮廓——正对时上、下沿取各站位椭圆的最高、最低点，斜截梯形的两端正好是最值', () => {
    const st = Yaw.stationsOf(TRAPEZOID, TRAPEZOID_TAU);                       // 站位 0：yc − ry = −3.96；站位 96：yc + ry = 7.4（相邻站位只差 0.02 / 0.05）
    const sil = Yaw.silhouetteOf(st, null, Math.cos(HALF_PI), Math.sin(HALF_PI));
    const b = bbox([{ pts: sil }]);
    close(b.y0, -3.96, 1e-9, '上沿 = 站位 0 的椭圆顶'); close(b.y1, 7.4, 1e-9, '下沿 = 站位 96 的椭圆底');
    close(b.x0, -9.44, 1e-9, '左端 = 最后一个站位的横向半宽 4.72·2'); close(b.x1, 9.44, 1e-9, '右端');
    assert.equal(sil.length / 2, 2 * (Yaw.SAMPLES + 1), '每个采样位置都有上、下两个点');
});

test('project：轮廓与独立实现的成员判定在合成纺锤躯干上也一致（格点 IoU ≥ 0.995），含锤头', () => {
    const poly = spindlePoly(), tau = [[-50, 0.85], [50, 0.85]];
    const hammer = { x0: 41, x1: 50.2, half: 14.5, ry: 3.6, yc: 1.2 };
    const st = Yaw.stationsOf(poly, tau), stations = refStations(poly, tau);
    for (const h of [null, hammer]) {
        for (const theta of [0.2, 0.7, 1.15, HALF_PI]) {
            const c = Math.cos(theta), s = Math.sin(theta);
            const sil = Yaw.silhouetteOf(st, h, c, s);
            const inRef = refInside(stations, h, c, s), inPoly = polyInside(sil), b = bbox([{ pts: sil }]);
            let both = 0, either = 0;
            for (let u = b.x0 - 2; u <= b.x1 + 2; u += 0.2) for (let v = b.y0 - 2; v <= b.y1 + 2; v += 0.2) {
                const a = inRef(u, v), p = inPoly(u, v);
                if (a && p) both++;
                if (a || p) either++;
            }
            assert.ok(both / either >= 0.995, `${h ? '锤头' : '无锤头'} θ ${brief(theta, 2)}：IoU ${brief(both / either)}`);
        }
    }
});

// ---------- 投影：体表、鳍片、滚动、体积感 ----------

const SURFACE_SKIP = prof => new Set(['body', ...prof.sagittal, ...prof.plates.map(p => p.id), ...prof.plates.map(p => p.farId).filter(Boolean), ...(prof.roll ? prof.roll.ids : [])]);

test('project（体表）：近侧 = 按“朝向观众”裁剪再按深度位移（x\' = x·cosθ − side·depth·sinθ）；填充走多边形裁剪（闭合）、描边走折线裁剪（开放）；远侧同法、位移反向；顺序 远侧 → 体积感 → 近侧', () => {
    for (const species of SPECIES) {
        const prof = Yaw.PROFILES[species];
        for (const pose of [{}, { phase: 0.9, amp: 0.7, turn: 0.3 }]) {
            const ops = restOps(species, pose);
            const st = Yaw.stationsOf(opOf(ops, 'body').polys[0], prof.tau);
            const skip = SURFACE_SKIP(prof);
            const surfaceOps = ops.filter(op => !skip.has(op.id));
            assert.ok(surfaceOps.length >= 12, `${species}：体表图层 ${surfaceOps.length} 个`);
            for (const theta of [0.5, 1.0, 1.4]) {
                const c = Math.cos(theta), s = Math.sin(theta);
                const out = Yaw.project(ops, species, theta);
                const volumeAt = out.indexOf(opOf(out, 'volume')), bodyAt = out.indexOf(opOf(out, 'body'));
                for (const src of surfaceOps) {
                    const expected = side => {
                        const f = (x, y) => Yaw.facing(st, x, y, c, s, side);
                        const polys = [];
                        for (const poly of src.polys) {
                            if (poly.pts.length < 4) continue;
                            if (src.k === 'fill') { const pts = Yaw.clipClosed(poly.pts, f); if (pts) polys.push({ pts, closed: true }); }
                            else for (const pts of Yaw.clipRuns(poly.pts, f)) polys.push({ pts, closed: false });
                        }
                        return polys.map(poly => ({ closed: poly.closed, pts: poly.pts.map((v, i) => (i % 2 ? v : v * c - side * Yaw.depthAt(st, v, poly.pts[i + 1]) * s)) }));
                    };
                    const got = out.filter(op => op.id === src.id);
                    const near = expected(1), far = theta > 0.85 ? expected(-1) : [];
                    const tag = `${species} ${src.id} θ ${theta}`;
                    assert.equal(got.length, (near.length ? 1 : 0) + (far.length ? 1 : 0), `${tag}：图层个数`);
                    if (far.length) { closePolys(got[0].polys, far, 1e-9, `${tag} 远侧`); assert.ok(out.indexOf(got[0]) > bodyAt && out.indexOf(got[0]) < volumeAt, `${tag}：远侧在躯干之后、体积感之前`); }
                    if (near.length) {
                        const mine = got[got.length - 1];
                        closePolys(mine.polys, near, 1e-9, `${tag} 近侧`);
                        assert.ok(out.indexOf(mine) > volumeAt, `${tag}：近侧在体积感之后`);
                        assert.equal(mine.k, src.k); assert.deepEqual(mine.paint, src.paint); assert.deepEqual(mine.rgba, src.rgba); assert.equal(mine.width, src.width);
                    }
                    for (const op of got) assert.ok(op !== src, '不是输入对象本身');
                }
            }
        }
    }
});

test('project（体表）：转角不超过 FAR_FLANK_FROM（≈ 0.85 rad，含恰好等于）时没有任何远侧体表；超过之后才有', () => {
    for (const species of SPECIES) {
        const prof = Yaw.PROFILES[species];
        const ops = restOps(species);
        const skip = SURFACE_SKIP(prof);
        const surfaceIds = ops.filter(op => !skip.has(op.id)).map(op => op.id);
        const dupes = theta => { const out = Yaw.project(ops, species, theta); return surfaceIds.filter(id => out.filter(op => op.id === id).length > 1); };
        for (const theta of [0.05, 0.4, 0.8, 0.85]) assert.deepEqual(dupes(theta), [], `${species} θ ${theta}：远侧体表还没有出现`);
        for (const theta of [0.9, 1.2, HALF_PI]) assert.ok(dupes(theta).length >= 6, `${species} θ ${brief(theta, 2)}：远侧体表出现（${dupes(theta).length} 个图层有两份）`);
    }
});

test('project（体表）：整片背向观众的图层不输出（不抛异常、不留空图层）；转角小时同一图层完整保留', () => {
    for (const species of SPECIES) {
        const base = restOps(species);
        const st = Yaw.stationsOf(opOf(base, 'body').polys[0], Yaw.PROFILES[species].tau);
        const x0 = st.x0 + 3 * st.dx, x1 = st.x0 + 7 * st.dx, yc = st.yc[5], ry = st.ry[5];
        const tailMark = { id: 'tailMark', k: 'fill', rule: 'nonzero', paint: { rgba: [1, 0, 0, 1] }, polys: [{ pts: [x0, yc - 0.3 * ry, x1, yc - 0.3 * ry, x1, yc + 0.3 * ry, x0, yc + 0.3 * ry], closed: true }] };
        const tailLine = { id: 'tailLine', k: 'stroke', rgba: [1, 0, 0, 1], width: 1, polys: [{ pts: [x0, yc - 0.3 * ry, x1, yc, x0, yc + 0.3 * ry], closed: false }] };
        for (const op of [tailMark, tailLine]) {                                  // 前提：正对时尾部这一段躯干在变粗，体表法线朝后，整片背向观众
            for (let i = 0; i < op.polys[0].pts.length; i += 2) assert.ok(Yaw.facing(st, op.polys[0].pts[i], op.polys[0].pts[i + 1], 0, 1, 1) < 0, `${species}.${op.id} 顶点 ${i / 2} 背向观众`);
        }
        const ops = base.concat([tailMark, tailLine]);
        let out;
        assert.doesNotThrow(() => { out = Yaw.project(ops, species, HALF_PI); }, `${species} 正对时`);
        assert.ok(Array.isArray(out), `${species}：不是 null`);
        assert.equal(opOf(out, 'tailMark'), undefined, `${species}：背向观众的填充整个裁掉`);
        assert.equal(opOf(out, 'tailLine'), undefined, `${species}：背向观众的描边整个裁掉`);
        for (const op of out) assert.ok(op.polys.length > 0 && op.polys.every(poly => poly.pts.length >= 4), `${species}.${op.id} 没有空子路径`);
        const small = Yaw.project(ops, species, 0.3);
        assert.ok(opOf(small, 'tailMark') && opOf(small, 'tailLine'), `${species}：转角小时还在`);
    }
});

test('project（鳍片）：近侧/远侧胸鳍、腹鳍的位移 = x·cosθ − sign·(z0 + spread·离根部距离)·sinθ（z0 = 根部剖面深度 + 0.3）；克隆的远侧鳍颜色逐通道 × FAR_SHADE，渐变只动 rgb', () => {
    const shade = (paint, k) => (paint.rgba ? { rgba: [paint.rgba[0] * k, paint.rgba[1] * k, paint.rgba[2] * k, paint.rgba[3]] }
        : { grad: { a: paint.grad.a, b: paint.grad.b, stops: paint.grad.stops.map(st => [st[0], st[1] * k, st[2] * k, st[3] * k, st[4]]) } });
    for (const species of SPECIES) {
        const prof = Yaw.PROFILES[species];
        const ops = restOps(species, { phase: 0.8, amp: 0.6, turn: 0.2 });
        const st = Yaw.stationsOf(opOf(ops, 'body').polys[0], prof.tau);
        for (const theta of [0.4, 1.1, HALF_PI]) {
            const c = Math.cos(theta), s = Math.sin(theta);
            const out = Yaw.project(ops, species, theta);
            for (const plate of prof.plates) {
                const z0 = Yaw.depthAt(st, plate.root[0], plate.root[1]) + 0.3;
                const expected = (op, sign) => op.polys.map(poly => ({ closed: poly.closed, pts: poly.pts.map((v, i) => {
                    if (i % 2) return v;
                    const z = sign * (z0 + plate.spread * Math.hypot(v - plate.root[0], poly.pts[i + 1] - plate.root[1]));
                    return v * c - z * s;
                }) }));
                const tag = `${species} ${plate.id} θ ${brief(theta, 2)}`;
                closePolys(opOf(out, plate.id).polys, expected(opOf(ops, plate.id), 1), 1e-9, `${tag} 近侧`);
                assert.deepEqual(opOf(out, plate.id).paint, opOf(ops, plate.id).paint, `${tag} 近侧颜色不变`);
                const farId = plate.farId || plate.id + 'Far';
                const farSource = opOf(ops, farId) || opOf(ops, plate.id);
                closePolys(opOf(out, farId).polys, expected(farSource, -1), 1e-9, `${tag} 远侧`);
                if (plate.farId) assert.deepEqual(opOf(out, farId).paint, opOf(ops, farId).paint, `${tag}：骨架里自带的远侧图层颜色不变`);
                else {
                    const want = shade(opOf(ops, plate.id).paint, 0.72), got = opOf(out, farId).paint;
                    if (want.rgba) closeList(got.rgba, want.rgba, 1e-12, `${tag} 远侧颜色`);
                    else {
                        assert.deepEqual(got.grad.a, want.grad.a); assert.deepEqual(got.grad.b, want.grad.b);
                        assert.equal(got.grad.stops.length, want.grad.stops.length);
                        got.grad.stops.forEach((stop, i) => closeList(stop, want.grad.stops[i], 1e-12, `${tag} 渐变停靠点 ${i}`));
                    }
                }
            }
        }
    }
    // 描边型的鳍（颜色写在 op.rgba 上）：克隆的颜色同样逐通道变暗，近侧不变
    const marked = restOps('hammer').map(op => (op.id === 'pelvic' ? Object.assign({}, op, { rgba: [0.5, 0.6, 0.7, 0.8] }) : op));
    const out = Yaw.project(marked, 'hammer', 1.0);
    closeList(opOf(out, 'pelvicFar').rgba, [0.36, 0.432, 0.504, 0.8], 1e-12, '描边鳍的远侧颜色');
    assert.deepEqual(opOf(out, 'pelvic').rgba, [0.5, 0.6, 0.7, 0.8]);
});

test('project（锤头鲨）：锤头杆、杆边与鼻孔随转角 θ 绕体轴滚动——φ = (π/2)·smoothstep(θ/(π/2))，(x, y) → (x·cosθ − (y − 0.5)·sinφ·sinθ, 0.5 + (y − 0.5)·cosφ)；眼睛只挪中心、形状不变', () => {
    const ops = restOps('hammer', { phase: 0.7, amp: 0.5, turn: 0.1 });
    for (const theta of [0.35, 0.8, 1.2]) {
        const u = theta / HALF_PI, phi = HALF_PI * u * u * (3 - 2 * u);
        const c = Math.cos(theta), s = Math.sin(theta), cphi = Math.cos(phi), sphi = Math.sin(phi);
        const out = Yaw.project(ops, 'hammer', theta);
        const move = (x, y) => [x * c - (y - 0.5) * sphi * s, 0.5 + (y - 0.5) * cphi];
        for (const id of ['bar', 'barEdge', 'nostril']) {
            const src = opOf(ops, id), got = opOf(out, id);
            const want = src.polys.map(poly => ({ closed: poly.closed, pts: poly.pts.map((v, i) => (i % 2 ? move(poly.pts[i - 1], v)[1] : move(v, poly.pts[i + 1])[0])) }));
            closePolys(got.polys, want, 1e-9, `${id} θ ${theta}`);
        }
        for (const id of ['eyeNear', 'eyeNearGlint', 'eyeFar']) {
            const src = opOf(ops, id), got = opOf(out, id);
            src.polys.forEach((poly, p) => {
                const n = poly.pts.length / 2;
                let cx = 0, cy = 0;
                for (let i = 0; i < poly.pts.length; i += 2) { cx += poly.pts[i]; cy += poly.pts[i + 1]; }
                cx /= n; cy /= n;
                const [mx, my] = move(cx, cy);
                for (let i = 0; i < poly.pts.length; i += 2) {
                    close(got.polys[p].pts[i], mx + poly.pts[i] - cx, 1e-9, `${id} θ ${theta} x ${i}`);
                    close(got.polys[p].pts[i + 1], my + poly.pts[i + 1] - cy, 1e-9, `${id} θ ${theta} y ${i}`);
                }
            });
        }
    }
});

test('project（体积感）：渐变停靠点 0 / 0.4 / 1，三点同色（躯干色 × 0.4），不透明度 0 / 0 / 0.42·sinθ；躯干不是纯色时用后备底色；θ 太小不画', () => {
    const ops = restOps('hammer');
    const [r, g, b] = opOf(ops, 'body').paint.rgba;
    for (const theta of [0.5, 0.9, 1.4]) {
        const volume = opOf(Yaw.project(ops, 'hammer', theta), 'volume');
        assert.equal(volume.k, 'fill'); assert.equal(volume.rule, 'nonzero');
        assert.deepEqual(volume.paint.grad.stops.map(stop => stop[0]), [0, 0.4, 1], '停靠点位置');
        volume.paint.grad.stops.forEach((stop, i) => {
            closeList(stop.slice(1, 4), [r * 0.4, g * 0.4, b * 0.4], 1e-12, `θ ${theta} 停靠点 ${i} 颜色`);
            close(stop[4], [0, 0, 0.42 * Math.sin(theta)][i], 1e-12, `θ ${theta} 停靠点 ${i} 不透明度`);
        });
        assert.equal(volume.polys.length, 1); assert.equal(volume.polys[0].closed, true);
        assert.deepEqual(volume.polys[0].pts, opOf(Yaw.project(ops, 'hammer', theta), 'body').polys[0].pts, '体积感的范围 = 躯干轮廓');
    }
    const gradBody = ops.map(op => (op.id === 'body' ? Object.assign({}, op, { paint: { grad: { a: [0, 0], b: [1, 0], stops: [[0, 1, 1, 1, 1]] } } }) : op));
    const fallback = opOf(Yaw.project(gradBody, 'hammer', 0.9), 'volume');
    closeList(fallback.paint.grad.stops[2].slice(1, 4), [0.3 * 0.4, 0.4 * 0.4, 0.45 * 0.4], 1e-12, '后备底色（躯干不是纯色）');
    const noPaint = ops.map(op => (op.id === 'body' ? Object.assign({}, op, { paint: undefined }) : op));
    closeList(opOf(Yaw.project(noPaint, 'hammer', 0.9), 'volume').paint.grad.stops[2].slice(1, 4), [0.3 * 0.4, 0.4 * 0.4, 0.45 * 0.4], 1e-12, '后备底色（躯干没有颜色）');
    assert.equal(opOf(Yaw.project(ops, 'hammer', 0.0005), 'volume'), undefined, 'sinθ ≤ 0.001 不画体积感');
    assert.ok(opOf(Yaw.project(ops, 'hammer', 0.002), 'volume'), 'sinθ 略大于 0.001 就画');
});

// ---------- 坏数据与退化输入（第二轮变异检查的存活者里，用手工构造的输入确认“可以观察”的那几个） ----------

test('project：任何图层的第 0 个坐标是非有限值也返回 null（输出里不留 NaN / Infinity，检查必须从每条子路径的第 0 个坐标开始）', () => {
    const ops = restOps('hammer');
    assert.ok(Yaw.project(ops, 'hammer', 0.5), '对照：没有坏值时能投影');
    for (const id of ['dorsal1', 'pec', 'bar']) {                                 // 矢状面、鳍片、滚动的图层都是逐点映射，坏坐标会原样带到输出里
        for (const bad of [NaN, Infinity, -Infinity]) {
            for (const index of [0, 1]) {
                const poisoned = ops.map(op => {
                    if (op.id !== id) return op;
                    const pts = op.polys[0].pts.slice();
                    pts[index] = bad;
                    return Object.assign({}, op, { polys: [{ pts, closed: op.polys[0].closed }].concat(op.polys.slice(1)) });
                });
                assert.equal(Yaw.project(poisoned, 'hammer', 0.5), null, `${id} 的第 ${index} 个坐标 = ${bad}`);
            }
        }
    }
});

test('project：躯干的 polys 不是数组（null、undefined、字符串、数字、对象）、是空数组都返回 null，不抛异常', () => {
    const ops = restOps('hammer');
    for (const bad of [null, undefined, 'abc', 5, {}, []]) {
        const broken = ops.map(op => (op.id === 'body' ? Object.assign({}, op, { polys: bad }) : op));
        assert.equal(Yaw.project(broken, 'hammer', 0.5), null, `polys = ${JSON.stringify(bad)}`);
    }
});

test('project（鳍片）：paint 既没有 rgba 也没有渐变（空对象）时，远侧克隆沿用它，不抛异常', () => {
    const ops = restOps('hammer').map(op => (op.id === 'pelvic' ? Object.assign({}, op, { paint: {} }) : op));
    const out = Yaw.project(ops, 'hammer', 0.5);
    assert.ok(out, '能投影');
    const far = out.find(op => op.id === 'pelvicFar');
    assert.ok(far, '腹鳍的远侧克隆在');
    assert.deepEqual(far.paint, {}, '没有可乘的颜色：原样沿用');
    assert.ok(far.polys.length === 1, '几何照常');
});

test('project（体表）：只有两个点的折线（一条线段）保留并按深度位移；只有两个点的填充没有面积，不输出', () => {
    const st = Yaw.stationsOf(opOf(restOps('hammer'), 'body').polys[0], Yaw.PROFILES.hammer.tau);
    const theta = 0.3, c = Math.cos(theta), s = Math.sin(theta);
    const ops = restOps('hammer').concat([
        { id: 'seg', k: 'stroke', rgba: [0.1, 0.2, 0.3, 1], width: 1, polys: [{ pts: [-10, 0, 10, 2], closed: false }] },
        { id: 'segFill', k: 'fill', paint: { rgba: [1, 0, 0, 1] }, polys: [{ pts: [-10, 0, 10, 2], closed: true }] },
    ]);
    const out = Yaw.project(ops, 'hammer', theta);
    const seg = out.find(op => op.id === 'seg');
    assert.ok(seg, '线段保留');
    assert.equal(seg.polys.length, 1); assert.equal(seg.polys[0].closed, false);
    const want = [-10, 0, 10, 2].map((v, i) => (i % 2 === 1 ? v : v * c - Yaw.depthAt(st, [-10, 0, 10, 2][i], [-10, 0, 10, 2][i + 1]) * s));
    closeList(seg.polys[0].pts, want, 1e-9, '线段的两个端点：x′ = x·cosθ − depth·sinθ，y 不变');
    assert.equal(out.some(op => op.id === 'segFill'), false, '两个点的填充没有面积');
});

test('silhouetteOf：覆盖不足 3 个采样点（退化的细条）返回 null，恰好 3 个点保留——互不相连的椭圆（c ≤ 1e-4 时没有矢状面薄片）', () => {
    const c = 1e-5, s = 1;                                                       // 站位间隔 1000·c = 0.01，椭圆半宽 1e-5：每个椭圆正好各占一个采样点
    const two = { x0: 0, dx: 1000, n: 1, yc: [0, 0], ry: [1, 1], rz: [1e-5, 1e-5] };
    assert.equal(Yaw.silhouetteOf(two, null, c, s), null, '2 个采样点不成多边形');
    const three = { x0: 0, dx: 1000, n: 2, yc: [0, 0, 0], ry: [1, 1, 1], rz: [1e-5, 1e-5, 1e-5] };
    const sil = Yaw.silhouetteOf(three, null, c, s);
    assert.ok(sil, '3 个采样点保留');
    assert.equal(sil.length, 12, '上沿 3 个点 + 下沿 3 个点（反序）');
    const xs = sil.filter((v, i) => i % 2 === 0), ys = sil.filter((v, i) => i % 2 === 1);
    closeList(xs, [-1e-5, 0.01, 0.02001, 0.02001, 0.01, -1e-5], 1e-9, '横坐标：左端、中间站位、右端各一个');
    closeList(ys, [0, -1, 0, 0, 1, 0], 1e-5, '纵坐标：只有中间站位的椭圆在正中心，高 ±1（两端在椭圆左右端点上，高度 0）');
});

// ---------- 源码与加载 ----------

test('源码：纯几何——没有 DOM、存储、网络、时钟、随机数、eval；浏览器里挂 AquariumYaw 全局，CommonJS 也可用', () => {
    const file = path.join(__dirname, '..', 'js', 'aquarium-yaw.js');
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    for (const banned of [/\bMath\.random\b/, /\bDate\b/, /\bperformance\b/, /\bdocument\b/, /\bwindow\b/, /\blocalStorage\b/, /\bchrome\b/, /\bfetch\b/, /\bXMLHttpRequest\b/, /\beval\b/, /new Function/, /\bsetTimeout\b/, /\brequestAnimationFrame\b/, /\bconsole\b/, /\bimport\s*\(/]) {
        assert.doesNotMatch(code, banned, String(banned));
    }
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(file, 'utf8'), Object.assign(sandbox, { globalThis: sandbox }));
    assert.equal(typeof sandbox.AquariumYaw, 'object', '全局名 AquariumYaw');
    assert.deepEqual(Object.keys(sandbox.AquariumYaw).sort(), Object.keys(Yaw).sort());
});
