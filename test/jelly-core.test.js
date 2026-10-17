// 解压果冻的软体物理（js/jelly-core.js）：几何、静止与睡眠、落下的挤压与余颤、戳、抓取与拖拽、
// 橡皮筋与指针限速、折叠自恢复、滚动阻力、固定子步、边界与数值安全、缩放、减少动态效果、确定性。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/jelly-core.js');

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
    return Core.createWorld({ width: 640, height: 420, ...options });
}

/** 以 fps 帧率推进 seconds 秒；each(i, 已过去的秒数) 在每帧之后调用。 */
function run(w, seconds, fps = 60, each) {
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) {
        Core.step(w, 1000 / fps);
        if (each) each(i, (i + 1) / fps);
    }
}

/** 坐在地上、已经安静下来的果冻。 */
function sitting(options = {}) {
    const w = world(options);
    run(w, 5);
    return w;
}

const signedRatio = w => Core.signedArea(w.points) / w.restArea;

function allFinite(w) {
    return w.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.px) && Number.isFinite(p.py));
}

function inBounds(w, eps = 0.01) {
    return w.points.every(p => p.x >= w.left - eps && p.x <= w.right + eps && p.y >= w.top - eps && p.y <= w.floor + eps);
}

function segmentsCross(a, b, c, d) {
    const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

/** 轮廓是否自交（O(n²)，n 只有 28）。 */
function selfIntersects(points) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
        }
    }
    return false;
}

function peaks(series, min) {
    const out = [];
    for (let i = 1; i < series.length - 1; i++) {
        if (series[i] > series[i - 1] && series[i] >= series[i + 1] && series[i] > min) out.push(series[i]);
    }
    return out;
}

// ---------- 常量 ----------

test('PARAMS 冻结且互相自洽', () => {
    assert.ok(Object.isFrozen(P));
    assert.ok(Math.abs(P.STEP_S * 120 - 1) < 1e-12, '固定子步是 1/120 秒');
    assert.ok(P.MAX_STEPS >= 2 && Number.isInteger(P.MAX_STEPS));
    assert.ok(P.FOLD_RATIO < P.FOLD_RECOVER, '折叠与恢复之间要有滞回，否则会在阈值附近来回抖');
    assert.ok(P.FOLD_RECOVER < 1);
    assert.ok(P.MATCH_STIFFNESS > 0 && P.MATCH_STIFFNESS * P.FOLD_BOOST <= 0.5, '折叠时的刚度仍在稳定范围内（匹配上限 0.5）');
    assert.ok(P.POKE_DEPTH > 0 && P.POKE_DEPTH < 1);
    assert.ok(P.RADIUS_MIN < P.RADIUS_MAX);
    assert.ok(P.REDUCE_DAMPING < P.DAMPING, '减少动态效果时阻尼更大');
    assert.ok(P.GRAB_REACH > 1 && P.GRAB_SIGMA > 0 && P.POINTER_SPEED > 0);
    assert.ok(P.POINTS >= 12 && P.POINTS % 2 === 0, '轮廓点数足够，且是偶数（上下左右对称）');
});

// ---------- 几何 ----------

test('polygonArea / signedArea：单位正方形、顺序翻转、领结形', () => {
    const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    assert.equal(Core.polygonArea(square), 1);
    assert.equal(Core.signedArea(square), 1);
    const reversed = square.slice().reverse();
    assert.equal(Core.polygonArea(reversed), 1, '绝对面积与顺序无关');
    assert.equal(Core.signedArea(reversed), -1, '带符号面积随绕向变号');
    const bowtie = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    assert.equal(Core.signedArea(bowtie), 0, '领结形（折叠）两半互相抵消');
    assert.equal(Core.polygonArea([]), 0);
    assert.equal(Core.polygonArea([{ x: 1, y: 1 }]), 0);
});

test('insidePolygon：里面、外面、各个方向', () => {
    const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    assert.equal(Core.insidePolygon(square, 5, 5), true);
    assert.equal(Core.insidePolygon(square, 1, 9), true);
    for (const [x, y] of [[-1, 5], [11, 5], [5, -1], [5, 11], [-5, -5], [20, 20]]) {
        assert.equal(Core.insidePolygon(square, x, y), false, `${x},${y}`);
    }
});

test('bestRotation：恢复已知的旋转角，与缩放无关，退化输入不产生 NaN', () => {
    const rest = Array.from({ length: 12 }, (_, i) => ({ x: Math.cos(i * 0.9) * (30 + i), y: Math.sin(i * 0.9) * (30 + i) }));
    for (const theta of [0, 0.3, -0.3, 1.2, -1.2, 2.5, -2.5, 3.1]) {
        for (const scale of [1, 0.5, 3]) {
            const c = Math.cos(theta);
            const s = Math.sin(theta);
            const rotated = rest.map(q => ({ x: (c * q.x - s * q.y) * scale, y: (s * q.x + c * q.y) * scale }));
            assert.ok(Math.abs(Core.bestRotation(rest, rotated) - theta) < 1e-9, `θ=${theta} 缩放 ${scale}`);
        }
    }
    const zeros = rest.map(() => ({ x: 0, y: 0 }));
    assert.equal(Core.bestRotation(rest, zeros), 0, '全部重合时返回 0');
    assert.ok(Number.isFinite(Core.bestRotation([], [])));
});

test('clamp：夹在范围内，边界取值保持不变', () => {
    assert.equal(Core.clamp(5, 0, 10), 5);
    assert.equal(Core.clamp(-1, 0, 10), 0);
    assert.equal(Core.clamp(11, 0, 10), 10);
    assert.equal(Core.clamp(0, 0, 10), 0);
    assert.equal(Core.clamp(10, 0, 10), 10);
});

// ---------- 创建、半径、静止 ----------

test('createWorld：点数、半径按舞台短边取并夹在上下限内、坐在地面上', () => {
    const w = world();
    assert.equal(w.points.length, P.POINTS);
    assert.ok(P.MARGIN >= 8 && P.MARGIN <= 24, '四周留白要容得下阴影与边缘高光，又不能大到挤占舞台');
    assert.deepEqual([w.left, w.right, w.top, w.floor], [P.MARGIN, 640 - P.MARGIN, P.MARGIN, 420 - P.MARGIN], '可活动范围 = 舞台减去四周留白');
    assert.equal(w.radius, 420 * P.RADIUS_RATIO, '640×420 的舞台半径取短边的 0.2');
    assert.equal(world({ width: 100, height: 60 }).radius, P.RADIUS_MIN, '小舞台取下限');
    assert.equal(world({ width: 4000, height: 3000 }).radius, P.RADIUS_MAX, '大舞台取上限');
    const m = Core.metrics(w);
    assert.ok(Math.abs(m.maxY - w.floor) < 1e-6, `开局最低点恰好贴地（${m.maxY} vs ${w.floor}），不陷进地面也不悬空`);
    assert.ok(Math.abs(m.cx - 320) < 1e-6, '水平居中');
    assert.ok(Math.abs(m.areaRatio - 1) < 0.01);
    assert.equal(w.folded, false);
    assert.ok(signedRatio(w) > 0.99, '静止轮廓是逆时针，带符号面积为正且等于静止面积');
});

test('静止：坐着会微微压扁、面积守恒，并在几秒内睡着，睡着后不再漂移', () => {
    const w = world();
    let sleepAt = null;
    run(w, 5, 60, (i, t) => { if (w.asleep && sleepAt === null) sleepAt = t; });
    const m = Core.metrics(w);
    const diameter = 2 * w.radius;
    assert.ok(m.height / diameter > 0.86 && m.height / diameter < 0.96, `坐姿高度比 ${m.height / diameter}：被重力压扁一点，但不是一摊`);
    assert.ok(m.width / diameter > 1.0 && m.width / diameter < 1.1, `坐姿宽度比 ${m.width / diameter}：向两侧鼓一点`);
    assert.ok(m.areaRatio > 0.97 && m.areaRatio < 1.01, `面积比 ${m.areaRatio}`);
    assert.ok(sleepAt !== null && sleepAt < 5, `睡着于 ${sleepAt}`);
    assert.equal(m.asleep, true);
    assert.ok(Math.abs(m.maxY - w.floor) < 0.01, '底部贴地');
    assert.ok(Math.abs(m.cx - 320) < 0.5 && Math.abs(m.rotation) < 0.01, `左右对称的开局不该偏向一侧（偏 ${m.cx - 320}px，倾 ${m.rotation}rad）`);
    // 控制器在 asleep 时就停止步进；这里继续步进，只要求“冻结在睡着那一刻”造成的误差看不出来
    const before = w.points.map(p => [p.x, p.y]);
    run(w, 2);
    const drift = Math.max(...w.points.map((p, i) => Math.hypot(p.x - before[i][0], p.y - before[i][1])));
    assert.ok(drift < 2, `睡着后继续步进 2 秒也只漂移 ${drift}px`);
});

test('对称：左右对称的输入（坐下、落下、戳顶部）得到左右对称的结果，不向任何一侧滚或倾斜', () => {
    for (const label of ['sit', 'drop', 'poke']) {
        const w = world();
        if (label === 'drop') Core.spawn(w, { drop: true });
        run(w, label === 'poke' ? 4 : 5);
        if (label === 'poke') {
            const top = w.points[0];
            Core.poke(w, top.x, top.y - 2);
            run(w, 4);
        }
        const m = Core.metrics(w);
        assert.ok(Math.abs(m.cx - 320) < 0.5, `${label}：质心偏离中线 ${m.cx - 320}px`);
        assert.ok(Math.abs(m.rotation) < 0.01, `${label}：倾斜 ${m.rotation}rad`);
    }
    // 每个点都有镜像点：x 对称、y 相同
    const w = sitting();
    const n = P.POINTS;
    for (let i = 1; i < n / 2; i++) {
        const a = w.points[i];
        const b = w.points[n - i];
        assert.ok(Math.abs((a.x - w.cx) + (b.x - w.cx)) < 0.01 && Math.abs(a.y - b.y) < 0.01, `点 ${i} 与 ${n - i} 镜像对称`);
    }
});

// ---------- 落下 ----------

test('落下：落地压扁并向两侧鼓出，余颤几下后安静，面积基本守恒，轮廓不自交', () => {
    const rest = sitting();
    const restRatio = Core.metrics(rest).height / (2 * rest.radius);
    const w = world();
    Core.spawn(w, { drop: true });
    assert.ok(Core.metrics(w).cy < w.floor - 2 * w.radius - 20, '从高处开始');
    let minH = Infinity; let maxW = 0; let minArea = Infinity; let maxArea = 0; let sleepAt = null; let crossed = 0;
    let frozen = null;
    const cy = [];
    run(w, 8, 60, (i, t) => {
        const m = Core.metrics(w);
        minH = Math.min(minH, m.height / (2 * w.radius));
        maxW = Math.max(maxW, m.width / (2 * w.radius));
        minArea = Math.min(minArea, m.areaRatio);
        maxArea = Math.max(maxArea, m.areaRatio);
        if (w.asleep && sleepAt === null) { sleepAt = t; frozen = w.points.map(p => [p.x, p.y]); }
        if (selfIntersects(w.points)) crossed++;
        cy.push(m.cy);
    });
    const frozenDeviation = Math.max(...w.points.map((p, i) => Math.hypot(p.x - frozen[i][0], p.y - frozen[i][1])));
    assert.ok(frozenDeviation < 2, `睡着那一刻形状已经基本定型：之后只再动 ${frozenDeviation}px（控制器此时停止步进）`);
    assert.ok(minH > 0.55 && minH < 0.85, `最低高度比 ${minH}：明显压扁，但不是一张饼`);
    assert.ok(maxW > 1.15 && maxW < 1.6, `最宽宽度比 ${maxW}：向两侧鼓出`);
    assert.ok(minArea > 0.92 && maxArea < 1.03, `面积比范围 [${minArea}, ${maxArea}]：压扁时面积守恒`);
    assert.equal(crossed, 0, '落下过程轮廓从不自交');
    assert.ok(sleepAt !== null && sleepAt < 6.5, `睡着于 ${sleepAt}`);
    const finalCy = cy[cy.length - 1];
    const landing = cy.findIndex((v, i) => i > 10 && Math.abs(v - finalCy) < 25 && v > cy[i - 1]);
    assert.ok(landing > 0, '找到落地时刻');
    const wobble = peaks(cy.slice(landing).map(v => Math.abs(v - finalCy)), 3);
    assert.ok(wobble.length >= 3, `落地后质心至少晃 3 个来回，实际 ${wobble.length}：不能一落地就僵住`);
    const settled = Core.metrics(w);
    assert.ok(Math.abs(settled.height / (2 * w.radius) - restRatio) < 0.01, '终态与直接坐下的形状一致');
});

// ---------- 戳 ----------

test('戳：被戳处先凹进去、回弹过头再慢慢回到原位；远处的点一点不受影响', () => {
    const w = sitting();
    const top = w.points[0];
    const bottom = w.points[P.POINTS / 2];
    const before = top.y;
    const bottomBefore = { px: bottom.px, py: bottom.py };
    Core.poke(w, top.x, top.y - 2);
    assert.equal(bottom.px, bottomBefore.px, '离得很远的点速度不变');
    assert.equal(bottom.py, bottomBefore.py);
    let maxDent = 0; let minDent = 0; let crossed = 0;
    run(w, 5, 60, (i, t) => {
        const d = top.y - before;
        maxDent = Math.max(maxDent, d);
        if (t > 0.1) minDent = Math.min(minDent, d);
        if (selfIntersects(w.points)) crossed++;
    });
    // 实测 0.357R；POKE_DEPTH 0.15 → 0.195R，0.9 → 0.53R（超过 0.2R/子步的部分被速度限幅吃掉，所以上界不会再高）
    assert.ok(maxDent > w.radius * 0.25 && maxDent < w.radius * 0.45, `最大凹陷 ${maxDent / w.radius}R`);
    assert.ok(minDent < -3, `回弹到原位之上 ${minDent}px：有弹性，不是单向凹陷`);
    assert.ok(Math.abs(top.y - before) < 3, `5 秒后回到原位附近（差 ${top.y - before}px）`);
    assert.equal(crossed, 0);
});

test('戳：冲量随距离快速衰减、方向指向质心（右侧被戳向内凹，而不是向外鼓）', () => {
    const w = sitting();
    const top = w.points[0];
    Core.poke(w, top.x, top.y - 2);
    const speed = i => Math.hypot(w.points[i].x - w.points[i].px, w.points[i].y - w.points[i].py);
    const ratio = speed(3) / speed(0);
    assert.ok(ratio > 0.05 && ratio < 0.35, `离被戳点 0.66R 的点只得到 ${ratio} 倍的冲量（二次衰减）`);
    assert.ok(w.points[0].y - w.points[0].py > 0, '顶部被戳：速度向下（朝质心）');

    for (const sign of [1, -1]) {
        const s = sitting();
        const side = s.points[sign === 1 ? P.POINTS / 4 : (3 * P.POINTS) / 4];     // 3 点钟 / 9 点钟
        Core.poke(s, side.x + sign * 2, side.y);
        const vx = side.x - side.px;
        const vy = side.y - side.py;
        assert.ok(vx * sign < 0, `${sign === 1 ? '右' : '左'}侧被戳：水平速度朝向质心（${vx}）`);
        assert.ok(Math.abs(vy) < Math.abs(vx) * 0.2, '几乎没有竖直分量');
    }
});

test('戳：非法坐标、离得太远都不改变状态；戳只取决于位置，没有“力度”参数（多余的参数被忽略）', () => {
    const snapshot = w => w.points.map(p => [p.x, p.y, p.px, p.py]);
    const top = sitting().points[0];
    for (const [x, y] of [[NaN, 5], [5, Infinity], [undefined, 1], [-5000, -5000]]) {
        const w = sitting();
        const before = snapshot(w);
        Core.poke(w, x, y);
        assert.deepEqual(snapshot(w), before, `poke(${x}, ${y}) 不应有任何作用`);
    }
    const a = sitting();
    const b = sitting();
    Core.poke(a, top.x, top.y - 2);
    Core.poke(b, top.x, top.y - 2, 1000);
    assert.deepEqual(snapshot(a), snapshot(b), '没有力度参数：第三个参数不起作用，也不会让果冻炸开');
});

// ---------- 抓取、拖拽、松手 ----------

test('grab：点在果冻里、贴着轮廓外抓得到；远处、非法坐标抓不到', () => {
    const w = sitting();
    const m = Core.metrics(w);
    assert.equal(Core.grab(w, m.cx, m.cy), true, '果冻里面');
    Core.release(w);
    const top = w.points[0];
    assert.equal(Core.grab(w, top.x, top.y - 20), true, '轮廓外 20px 仍算抓到');
    Core.release(w);
    assert.equal(w.grab, null);
    for (const [x, y] of [[top.x, top.y - 120], [20, 20], [NaN, 5], [5, NaN], [Infinity, 0]]) {
        assert.equal(Core.grab(w, x, y), false, `${x},${y}`);
        assert.equal(w.grab, null, '没抓到就不能留下抓取状态');
    }
});

test('拖拽：被抓的点紧跟指针，整个果冻被提起来，面积守恒，不自交，抓着时不睡着', () => {
    const w = sitting();
    const top = w.points[0];
    const startY = top.y;
    const cyBefore = Core.metrics(w).cy;
    assert.equal(Core.grab(w, top.x, top.y - 2), true);
    let maxLag = 0; let minArea = Infinity; let crossed = 0;
    for (let i = 0; i < 40; i++) {
        Core.drag(w, top.x, startY - 2 - (i + 1) * 4);
        Core.step(w, 1000 / 60);
        maxLag = Math.max(maxLag, Math.abs(top.y - w.pointer.y));
        minArea = Math.min(minArea, Core.metrics(w).areaRatio);
        if (selfIntersects(w.points)) crossed++;
    }
    const m = Core.metrics(w);
    assert.ok(maxLag < 8, `顶点离指针最远 ${maxLag}px`);
    assert.ok(cyBefore - m.cy > 100, `质心被提起 ${cyBefore - m.cy}px`);
    assert.ok(minArea > 0.9 && m.areaRatio < 1.1, `面积比 ${minArea}..${m.areaRatio}`);
    assert.equal(crossed, 0);
    assert.equal(m.airborne, true);
    assert.equal(m.grabbed, true);
    run(w, 1);
    assert.equal(w.asleep, false, '被抓着不能睡着');
    assert.equal(Core.metrics(w).grabbed, true);
    assert.equal(Core.release(w), 'release');
    assert.equal(Core.metrics(w).grabbed, false);
    let sleepAt = null;
    run(w, 6, 60, (i, t) => { if (w.asleep && sleepAt === null) sleepAt = t; });
    assert.ok(sleepAt !== null && sleepAt < 5.5, `松手后落回地面再睡着（${sleepAt}）`);
    assert.ok(Math.abs(Core.metrics(w).cy - cyBefore) < 15, '回到地面上');
});

test('快速拖着转圈：轮廓不会卷出小环，也不会触发折叠（隔点距离约束抗弯折）', () => {
    for (const [mul, dy] of [[1.6, -40], [1.0, 0], [2.2, -40]]) {
        const w = sitting();
        const m0 = Core.metrics(w);
        assert.equal(Core.grab(w, m0.cx + w.radius * 0.9, m0.cy), true);
        let crossed = 0; let folded = 0; let minArea = Infinity;
        for (let i = 0; i < 120; i++) {
            const a = i * 0.28;                       // 约 2500px/s 的圆周运动
            Core.drag(w, m0.cx + Math.cos(a) * w.radius * mul, m0.cy + dy + Math.sin(a) * w.radius * mul);
            Core.step(w, 1000 / 60);
            if (selfIntersects(w.points)) crossed++;
            if (w.folded) folded++;
            minArea = Math.min(minArea, Core.metrics(w).areaRatio);
        }
        assert.equal(crossed, 0, `圈半径 ${mul}R：${crossed}/120 帧自交`);
        assert.equal(folded, 0);
        assert.ok(minArea > 0.75, `最小面积比 ${minArea}`);
    }
});

test('抓住不动：保持抓取时的相对位置，轮廓不会被吸向指针', () => {
    const w = sitting();
    const before = w.points.map(p => [p.x, p.y]);
    assert.equal(Core.grab(w, w.cx, w.cy), true);
    run(w, 0.3);
    const moved = Math.max(...w.points.map((p, i) => Math.hypot(p.x - before[i][0], p.y - before[i][1])));
    assert.ok(moved < 1, `抓住中心不动，轮廓点最多移动 ${moved}px`);
    assert.ok(Core.metrics(w).areaRatio > 0.97);
    run(w, 1.5);
    assert.equal(w.asleep, false, '手一直按着，哪怕完全静止也不能睡着');
    assert.equal(Core.release(w), 'release');
    run(w, 1.5);
    assert.equal(w.asleep, true, '松手之后静止下来才睡着');
});

test('抓取与戳都会立刻唤醒睡着的果冻（控制器据此重新开始逐帧绘制）', () => {
    const grabbed = sitting();
    assert.equal(grabbed.asleep, true);
    grabbed.calm = 5;
    assert.equal(Core.grab(grabbed, grabbed.cx, grabbed.cy), true);
    assert.equal(grabbed.asleep, false);
    assert.equal(grabbed.calm, 0);

    const poked = sitting();
    assert.equal(poked.asleep, true);
    poked.calm = 5;
    Core.poke(poked, poked.points[0].x, poked.points[0].y - 2);
    assert.equal(poked.asleep, false);
    assert.equal(poked.calm, 0);

    const missed = sitting();
    assert.equal(Core.grab(missed, 5, 5), false);
    assert.equal(missed.asleep, true, '没抓到就不该吵醒它');
});

test('指针拖到几千像素外：被限速的指针带着整个果冻走，不被拉长，面积不塌', () => {
    const w = world({ width: 3000, height: 2000 });
    run(w, 6);
    const m0 = Core.metrics(w);
    const top = w.points[0];
    assert.equal(Core.grab(w, top.x, top.y - 2), true);
    let maxStretch = 0; let minArea = Infinity; let maxReach = 0;
    for (let i = 0; i < 30; i++) {
        Core.drag(w, top.x, top.y - 1000);
        Core.step(w, 1000 / 60);
        const m = Core.metrics(w);
        maxStretch = Math.max(maxStretch, m.stretch);
        minArea = Math.min(minArea, m.areaRatio);
        maxReach = Math.max(maxReach, Math.hypot(top.x - m.cx, top.y - m.cy));
    }
    const m = Core.metrics(w);
    assert.ok(maxReach < 1.6 * w.radius, `被抓的点离质心最远 ${maxReach / w.radius}R：整体被带着走，而不是被扯长（取消指针限速会到 ~1.9R）`);
    assert.ok(maxStretch < 2.2 && minArea > 0.9, `拉伸比 ${maxStretch}，面积比 ${minArea}（实测 1.70 / 0.985；取消指针限速拉伸比会到 3）`);
    assert.ok(m0.cy - m.cy > 300, `0.5 秒内被带起 ${m0.cy - m.cy}px：确实在跟随`);
    assert.ok(allFinite(w));
});

test('速度限幅：任何点一个子步最多移动 MAX_STEP_PX 个半径（防止穿墙与数值爆炸）', () => {
    const w = world({ width: 3000, height: 2000 });
    Core.spawn(w, { drop: true });
    const before = w.points.map(p => [p.x, p.y]);
    for (const p of w.points) p.px = p.x - 500;                    // 每个子步 500px 的速度
    assert.equal(Core.step(w, 1000 / 120), 1);
    const moved = Math.max(...w.points.map((p, i) => Math.hypot(p.x - before[i][0], p.y - before[i][1])));
    const limit = P.MAX_STEP_PX * w.radius;
    assert.ok(moved <= limit * 1.05, `一个子步移动了 ${moved}px，限幅 ${limit}px`);
    assert.ok(moved > limit * 0.5, '确实朝着原来的方向走');
    assert.ok(allFinite(w));
});

test('指针限速：指针一帧瞬移到身体另一侧，抓取点一帧只能走有限的距离', () => {
    const w = sitting();
    const top = w.points[0];
    const y0 = top.y;
    assert.equal(Core.grab(w, top.x, top.y - 2), true);
    Core.drag(w, top.x, w.floor);                 // 瞬移约 2 倍半径
    Core.step(w, 1000 / 60);                      // 一帧 = 2 个子步
    const perFrame = 2 * P.POINTER_SPEED * w.radius * P.STEP_S;
    assert.ok(Math.abs(top.y - y0) <= perFrame + 4, `顶点一帧移动了 ${Math.abs(top.y - y0)}px，上限 ${perFrame}px`);
    assert.ok(Math.abs(top.y - y0) > 5, '但确实在往指针那边走');
});

test('松手：很快、几乎没动 = 戳（并真的戳了一下）；按住不动或拖过 = 松手；没抓着 = null', () => {
    assert.equal(Core.release(sitting()), null, '没抓着');

    const tap = sitting();
    const top = tap.points[0];
    const before = top.y;
    Core.grab(tap, top.x, top.y - 2);
    run(tap, 0.05);
    assert.equal(Core.release(tap), 'poke');
    assert.equal(tap.grab, null);
    assert.equal(Core.release(tap), null, '重复松手');
    let dent = 0;
    run(tap, 0.5, 60, () => { dent = Math.max(dent, top.y - before); });
    assert.ok(dent > tap.radius * 0.15, `轻点之后确实凹了一下（${dent}px）`);

    const hold = sitting();
    Core.grab(hold, hold.points[0].x, hold.points[0].y - 2);
    run(hold, (P.TAP_MS + 120) / 1000);
    assert.equal(Core.release(hold), 'release', '按住超过 TAP_MS 就不是戳');

    const moved = sitting();
    const p = moved.points[0];
    Core.grab(moved, p.x, p.y - 2);
    Core.drag(moved, p.x + P.TAP_PX + 5, p.y - 2);
    run(moved, 0.05);
    assert.equal(Core.release(moved), 'release', '移动超过 TAP_PX 就不是戳');
});

test('甩出：松手时带着速度，继续往前飞一段，最终停下来', () => {
    const w = world({ width: 3000, height: 2000 });
    run(w, 6);
    const side = w.points[P.POINTS / 4];                    // 3 点钟方向
    const startCx = Core.metrics(w).cx;
    assert.equal(Core.grab(w, side.x, side.y), true);
    for (let i = 0; i < 12; i++) {
        Core.drag(w, w.pointer.x + 12, w.pointer.y);
        Core.step(w, 1000 / 60);
    }
    const atRelease = Core.metrics(w).cx;
    assert.equal(Core.release(w), 'release');
    let maxCx = atRelease;
    let sleepAt = null;
    run(w, 10, 60, (i, t) => { maxCx = Math.max(maxCx, Core.metrics(w).cx); if (w.asleep && sleepAt === null) sleepAt = t; });
    assert.ok(maxCx - atRelease > 40, `松手后又往前走了 ${maxCx - atRelease}px`);
    assert.ok(sleepAt !== null, '最终会停下来睡着');
});

// ---------- 折叠自恢复 ----------

test('折叠：领结形（一半轮廓翻到另一侧）被检测到并在几帧内弹回，不自交', () => {
    const w = sitting();
    assert.equal(w.folded, false);
    const cx = w.cx;
    for (let i = 1; i < P.POINTS / 2; i++) { const p = w.points[i]; p.x = 2 * cx - p.x; p.px = p.x; }
    assert.ok(Math.abs(signedRatio(w)) < 0.05, '构造出的折叠形状带符号面积约为 0');
    assert.equal(selfIntersects(w.points), true);
    assert.equal(Core.step(w, 1000 / 120), 1);
    assert.equal(Core.metrics(w).folded, true, '一个子步之内就被检测到');
    let maxRadius = 0;
    for (const p of w.points) maxRadius = Math.max(maxRadius, Math.hypot(p.x - w.cx, p.y - w.cy));
    assert.ok(maxRadius < 1.15 * w.radius, `折叠时跳过面积保持：一个子步后最远点 ${maxRadius / w.radius}R，没有被“撑大”（不跳过会到 1.28R）`);
    let recoveredAt = null;
    run(w, 3, 60, (i, t) => { if (!w.folded && recoveredAt === null) recoveredAt = t; });
    assert.ok(recoveredAt !== null && recoveredAt < 0.5, `折叠状态在 ${recoveredAt}s 内解除`);
    assert.ok(signedRatio(w) > 0.95 && Core.metrics(w).areaRatio > 0.95);
    assert.equal(selfIntersects(w.points), false);
});

test('折叠：整圈镜像翻面（绕向反了）也能恢复成正常的圆', () => {
    const w = sitting();
    const cx = w.cx;
    for (const p of w.points) { p.x = 2 * cx - p.x; p.px = p.x; }
    Core.step(w, 1000 / 60);
    assert.equal(w.folded, true);
    run(w, 6);
    assert.equal(w.folded, false);
    assert.ok(allFinite(w) && signedRatio(w) > 0.95 && !selfIntersects(w.points));
});

test('折叠：判定带滞回——介于两个阈值之间保持原状态，面积恢复才解除', () => {
    const shrink = (w, factor) => {
        for (const p of w.points) { p.x = w.cx + (p.x - w.cx) * factor; p.y = w.cy + (p.y - w.cy) * factor; p.px = p.x; p.py = p.y; }
    };
    const oneSubstep = w => assert.equal(Core.step(w, 1000 / 120), 1, '恰好一个子步');
    // 面积比约 0.70：高于折叠阈值（0.55），没折叠过就不算折叠
    const mild = sitting();
    shrink(mild, Math.sqrt(0.7));
    assert.ok(Math.abs(signedRatio(mild) - 0.7) < 0.02);
    oneSubstep(mild);
    assert.equal(mild.folded, false);

    // 面积比约 0.40：低于折叠阈值，算折叠（判定发生在子步开头，之后约束很快把它拉回来）
    const deep = sitting();
    shrink(deep, Math.sqrt(0.4));
    assert.ok(Math.abs(signedRatio(deep) - 0.4) < 0.02);
    oneSubstep(deep);
    assert.equal(deep.folded, true);

    // 已经在折叠状态、面积比约 0.70（介于两个阈值之间）：保持折叠，直到面积超过恢复阈值
    const stay = sitting();
    stay.folded = true;
    shrink(stay, Math.sqrt(0.7));
    oneSubstep(stay);
    assert.equal(stay.folded, true, '介于两个阈值之间时保持折叠（滞回）');
    run(stay, 1);
    assert.equal(stay.folded, false, '面积恢复到阈值之上后解除');
    assert.ok(signedRatio(stay) > P.FOLD_RECOVER);

    // 状态是折叠、但形状早就是圆：第一步就解除
    const healed = sitting();
    healed.folded = true;
    oneSubstep(healed);
    assert.equal(healed.folded, false);
});

// ---------- 滚动阻力 ----------

test('折叠时放松抓取：抓着左上角一路拖向右下角，轮廓只折叠几帧、按住期间就自己弹回来', () => {
    const w = world();                                          // 640×420
    run(w, 6);
    const corner = w.points[Math.round(P.POINTS * 6 / 7)];       // 顺时针 6/7 圈 = 约 10 点半方向的轮廓点（28 点时是第 24 个）
    assert.equal(Core.grab(w, corner.x, corner.y), true);
    let minSigned = Infinity;
    let foldedFrames = 0;
    for (let i = 0; i < 90; i++) {
        Core.drag(w, 9999, 9999);                               // 夹进舞台后就是右下角
        Core.step(w, 1000 / 60);
        minSigned = Math.min(minSigned, signedRatio(w));
        if (Core.metrics(w).folded) foldedFrames++;
        assert.ok(allFinite(w) && inBounds(w));
    }
    // 实测 最低 0.563、折叠 8 帧；FOLD_RELEASE 取 0（完全放开）0.423，取 1（不放松）0.318 且 79 帧一直折着
    assert.ok(minSigned > 0.5, `按住期间带符号面积比最低 ${minSigned}`);
    assert.ok(foldedFrames > 0 && foldedFrames < 20, `折叠了 ${foldedFrames}/90 帧：折过，但没有一直折着`);
    assert.ok(Core.metrics(w).grabbed, '全程没有松手');
});

test('贴地滑行与滚动会很快停下，不会一直滚', () => {
    const w = sitting();
    const startCx = w.cx;
    for (const p of w.points) p.px = p.x - 6;               // 整体向右 6px/子步 = 720px/s
    let sleepAt = null; let maxCx = startCx;
    run(w, 8, 60, (i, t) => { maxCx = Math.max(maxCx, w.cx); if (w.asleep && sleepAt === null) sleepAt = t; });
    assert.ok(maxCx - startCx > 60, `确实滑出去了 ${maxCx - startCx}px`);
    assert.ok(maxCx - startCx < 320, `滑行距离 ${maxCx - startCx}px 有限`);
    // 实测 2.6s；去掉地面摩擦 3.4s，去掉滚动阻力 3.0s，两个都去掉 8.3s
    assert.ok(sleepAt !== null && sleepAt < 2.9, `睡着于 ${sleepAt}s`);
});

test('贴地滚动（无滑动的滚）也会很快停下：滚动阻力同时削弱平移与自转', () => {
    const w = world({ width: 3000, height: 420 });
    run(w, 5);
    const speed = 4;                                         // px/子步
    const omega = speed / w.radius;                          // 无滑动滚动：最低点速度为 0
    for (const p of w.points) {
        const rx = p.x - w.cx;
        const ry = p.y - w.cy;
        p.px = p.x - (speed - omega * ry);
        p.py = p.y - omega * rx;
    }
    const startCx = w.cx;
    let maxCx = startCx; let sleepAt = null;
    run(w, 15, 60, (i, t) => { maxCx = Math.max(maxCx, w.cx); if (w.asleep && sleepAt === null) sleepAt = t; });
    // 实测 340px / 3.8s；没有滚动阻力时会滚 1000px / 9.6s
    assert.ok(maxCx - startCx > 100, `确实滚出去了 ${maxCx - startCx}px`);
    assert.ok(maxCx - startCx < 500, `滚动距离 ${maxCx - startCx}px`);
    assert.ok(sleepAt !== null && sleepAt < 6, `睡着于 ${sleepAt}s`);
});

test('空中的整体平移只受阻尼影响：没有滚动阻力、也不被约束吃掉（贴地才有滚动阻力）', () => {
    const w = world({ width: 3000, height: 2000 });
    Core.spawn(w, { drop: true });
    for (const p of w.points) p.px = p.x - 3;                // 水平 3px/子步
    let substeps = 0;
    for (let i = 0; i < 30; i++) substeps += Core.step(w, 1000 / 120);
    assert.equal(substeps, 30);
    const m = Core.metrics(w);
    assert.equal(m.airborne, true, '全程在空中');
    const expected = 3 * P.DAMPING ** substeps;
    assert.ok(Math.abs(m.vx - expected) < expected * 0.02, `水平速度 ${m.vx}，按阻尼应为 ${expected}`);
    assert.ok(m.vy > 3, '自由落体速度在增长');
});

test('rotation 读数：整体转过多少角度就读到多少（正 = 顺时针，与 canvas.rotate 同向），转动本身不被形状匹配“拧回去”', () => {
    for (const angle of [0.7, -0.7, 2.8, -2.8]) {
        const w = world({ width: 3000, height: 2000 });
        Core.spawn(w, { drop: true });
        const cs = Math.cos(angle);
        const sn = Math.sin(angle);
        const cx = w.cx;
        const cy = w.cy;
        for (const p of w.points) {                           // 位置和上一位置一起转：只是换了个朝向，没有速度
            for (const key of [['x', 'y'], ['px', 'py']]) {
                const dx = p[key[0]] - cx;
                const dy = p[key[1]] - cy;
                p[key[0]] = cx + cs * dx - sn * dy;
                p[key[1]] = cy + sn * dx + cs * dy;
            }
        }
        assert.equal(Core.step(w, 1000 / 120), 1);
        assert.ok(Math.abs(Core.metrics(w).rotation - angle) < 0.03, `转了 ${angle}rad，读数 ${Core.metrics(w).rotation}`);
        run(w, 0.3);
        assert.ok(Math.abs(Core.metrics(w).rotation - angle) < 0.1, `0.3 秒后朝向仍是 ${angle}，读数 ${Core.metrics(w).rotation}`);
    }
});

test('指针夹在舞台内：被拖出舞台也只会把果冻拉到舞台边缘，不会压成一张纸，松手后很快恢复', () => {
    const tiny = world({ width: 100, height: 80 });
    assert.equal(Core.grab(tiny, -10, 40), true, '舞台外一点点也抓得到（夹到边缘后在轮廓附近）');
    assert.equal(tiny.pointer.x, 0, 'grab 的坐标夹进舞台');
    assert.equal(tiny.pointer.sx, 0);
    Core.drag(tiny, 1e9, -1e9);
    assert.equal(tiny.pointer.x, 100);
    assert.equal(tiny.pointer.y, 0);
    Core.drag(tiny, -1e9, 40);
    assert.equal(tiny.pointer.x, 0);
    Core.drag(tiny, 50, 1e9);
    assert.equal(tiny.pointer.y, 80);
    for (const [gx, gy, ex, ey] of [[50, 90, 50, 80], [110, 40, 100, 40]]) {   // 夹紧之后才进入抓取范围：只有夹进舞台才抓得到
        const edge = world({ width: 100, height: 80 });
        assert.equal(Core.grab(edge, gx, gy), true, `grab(${gx}, ${gy}) 夹到 (${ex}, ${ey}) 后在轮廓附近`);
        assert.deepEqual([edge.pointer.x, edge.pointer.y], [ex, ey]);
    }

    for (const [W, H] of [[900, 560], [640, 420], [360, 300]]) {
        const w = world({ width: W, height: H });
        run(w, 6);
        const top = w.points[0];
        assert.equal(Core.grab(w, top.x, top.y - 2), true);
        let minSigned = Infinity;
        for (let i = 0; i < 90; i++) {                          // 抓着顶部，指针一直在舞台左下角之外很远的地方
            Core.drag(w, -5000, 1e7);
            Core.step(w, 1000 / 60);
            minSigned = Math.min(minSigned, signedRatio(w));
            assert.ok(inBounds(w) && allFinite(w));
        }
        assert.ok(minSigned > 0.4, `${W}×${H}：按住期间带符号面积比最低 ${minSigned}（不夹进舞台会到 0.01）`);
        assert.equal(Core.release(w), 'release');
        run(w, 1);
        assert.ok(signedRatio(w) > 0.97 && !selfIntersects(w.points), `${W}×${H}：松手 1 秒后恢复，面积比 ${signedRatio(w)}`);
    }
});

// ---------- 固定子步 ----------

test('step：固定 1/120 秒子步、余量累计、一帧最多 MAX_STEPS 步、非法 dt 什么都不做', () => {
    const w = world();
    assert.equal(Core.step(w, 10), 1);
    assert.ok(Math.abs(w.acc * 1000 - (10 - 1000 / 120)) < 1e-9, '余量留到下一帧');
    assert.equal(Core.step(w, 16), 2);
    assert.equal(Core.step(w, 16), 2);
    const huge = world();
    assert.equal(Core.step(huge, 1e6), P.MAX_STEPS, '超长一帧只算 MAX_STEPS 步');
    assert.equal(huge.acc, 0, '多出来的时间丢掉，不追赶');
    for (const bad of [0, -5, NaN, undefined, null, 'x']) {
        const w2 = world();
        const before = w2.points.map(p => [p.x, p.y]);
        assert.equal(Core.step(w2, bad), 0, String(bad));
        assert.deepEqual(w2.points.map(p => [p.x, p.y]), before);
        assert.equal(w2.acc, 0);
    }
    const timed = world();
    assert.equal(Core.step(timed, 16), 1, '16ms 只够一个子步（8.33ms），余下 7.67ms 留着');
    assert.ok(Math.abs(timed.time - 1 / 120) < 1e-12, '模拟时间只在子步里前进');
    assert.equal(Core.step(timed, 16), 2, '余量 + 16ms 够两个子步');
    assert.ok(Math.abs(timed.time - 3 / 120) < 1e-12);
});

test('帧率无关：20 / 60 / 144 fps 落下后得到同样的终态', () => {
    const results = [20, 60, 144].map(fps => {
        const w = world();
        Core.spawn(w, { drop: true });
        run(w, 8, fps);
        const m = Core.metrics(w);
        return { fps, h: m.height / (2 * w.radius), cy: m.cy, asleep: w.asleep, area: m.areaRatio };
    });
    for (const r of results) assert.equal(r.asleep, true, `${r.fps}fps 睡着`);
    for (const r of results.slice(1)) {
        assert.ok(Math.abs(r.h - results[0].h) < 0.005, `高度比 ${r.h} vs ${results[0].h}`);
        assert.ok(Math.abs(r.cy - results[0].cy) < 1.5, `质心 ${r.cy} vs ${results[0].cy}`);
        assert.ok(Math.abs(r.area - results[0].area) < 0.005);
    }
});

// ---------- 边界与数值安全 ----------

test('乱来也不会出界、不会 NaN、面积不塌：随机抓取/拖拽/戳/不规则 dt（多个种子）', () => {
    for (const seed of [1, 7, 42, 2026, 99999]) {
        const rand = seeded(seed);
        const w = world();
        let minArea = Infinity; let maxArea = 0; let bad = 0;
        for (let round = 0; round < 50; round++) {
            const m = Core.metrics(w);
            const action = rand();
            if (action < 0.6) {
                if (Core.grab(w, m.cx + (rand() - 0.5) * w.radius * 3, m.cy + (rand() - 0.5) * w.radius * 3)) {
                    const frames = 5 + Math.floor(rand() * 30);
                    for (let i = 0; i < frames; i++) {
                        Core.drag(w, rand() * w.width * 1.4 - w.width * 0.2, rand() * w.height * 1.4 - w.height * 0.2);
                        Core.step(w, 4 + rand() * 60);
                        if (!allFinite(w) || !inBounds(w)) bad++;
                        const mm = Core.metrics(w); minArea = Math.min(minArea, mm.areaRatio); maxArea = Math.max(maxArea, mm.areaRatio);
                    }
                    Core.release(w);
                }
            } else if (action < 0.8) {
                Core.poke(w, rand() * w.width, rand() * w.height);
            } else if (action < 0.85) {
                Core.spawn(w, { drop: rand() < 0.5 });
            }
            for (let i = 0; i < 20; i++) {
                Core.step(w, [0, 1, 8, 16, 33, 100, 5000][Math.floor(rand() * 7)]);
                if (!allFinite(w) || !inBounds(w)) bad++;
                const mm = Core.metrics(w); minArea = Math.min(minArea, mm.areaRatio); maxArea = Math.max(maxArea, mm.areaRatio);
            }
        }
        assert.equal(bad, 0, `种子 ${seed}：出现 NaN 或越界的帧`);
        // 最扁的时刻都是被抓着猛甩、按在墙或天花板上压成薄饼（实测最低约 0.585）；至少留一半面积，不会塌成一条线
        assert.ok(minArea > 0.5 && maxArea < 1.45, `种子 ${seed}：面积比范围 [${minArea}, ${maxArea}]`);
        run(w, 4);
        assert.ok(Core.metrics(w).areaRatio > 0.95 && !selfIntersects(w.points) && !w.folded, `种子 ${seed}：折腾完放着不管会恢复成圆`);
    }
});

test('地面、墙、天花板：任何点都不会越过舞台边界', () => {
    const w = world();
    Core.spawn(w, { drop: true });
    for (const p of w.points) { p.px = p.x - 40; p.py = p.y + 30; }       // 猛地向右下甩
    run(w, 1, 60, () => assert.ok(inBounds(w), '一直在舞台里'));
    for (const p of w.points) { p.px = p.x + 60; p.py = p.y + 60; }       // 再向左上甩
    run(w, 1, 60, () => assert.ok(inBounds(w), '一直在舞台里'));
});

// ---------- 缩放 ----------

test('resize：按新半径整体缩放、水平位置按比例保留、全部回到边界内、抓取被清除；非法尺寸忽略', () => {
    const w = sitting();
    const hold = w.points[0];
    Core.grab(w, hold.x, hold.y - 2);
    const cxBefore = w.cx;
    Core.resize(w, 400, 300);
    assert.equal(w.radius, 60);
    assert.equal(w.grab, null, '尺寸变化时放开抓取');
    assert.ok(inBounds(w), '缩小后仍在边界内');
    assert.ok(Math.abs(w.cx - cxBefore * 400 / 640) < 1, `水平位置按比例保留（${cxBefore} → ${w.cx}）`);
    const scaled = Core.metrics(w);
    assert.ok(scaled.height / (2 * w.radius) > 0.85 && scaled.height / (2 * w.radius) < 1.05, `缩放后立刻就是新半径下的形状（高度比 ${scaled.height / (2 * w.radius)}）`);
    assert.ok(Math.abs(scaled.areaRatio - 1) < 0.1, `面积比 ${scaled.areaRatio}`);
    run(w, 3);
    assert.ok(Core.metrics(w).areaRatio > 0.95 && Core.metrics(w).areaRatio < 1.03, '缩放后形状仍然是圆');
    assert.ok(Core.metrics(w).maxY <= w.floor + 0.01 && Core.metrics(w).maxY > w.floor - 1, '仍然坐在新的地面上');

    Core.resize(w, 1000, 700);
    assert.equal(w.radius, P.RADIUS_MAX);
    run(w, 3);
    assert.ok(inBounds(w) && allFinite(w));

    Core.resize(w, 100, 80);                                  // 比果冻还小：立刻被挤回边界内，而不是等下一个子步
    assert.equal(w.radius, P.RADIUS_MIN);
    assert.ok(inBounds(w), '缩得比果冻还小时，点也立刻回到边界内');
    assert.ok(allFinite(w));

    const snapshot = JSON.stringify([w.width, w.height, w.radius, w.points.map(p => [p.x, p.y])]);
    for (const [a, b] of [[0, 100], [100, 0], [-5, 100], [NaN, 100], [100, undefined], [Infinity, NaN]]) {
        Core.resize(w, a, b);
        assert.equal(JSON.stringify([w.width, w.height, w.radius, w.points.map(p => [p.x, p.y])]), snapshot, `resize(${a}, ${b}) 应被忽略`);
    }
});

test('极小的舞台：半径取下限，果冻被挤在里面也不 NaN、不出界', () => {
    for (const [width, height] of [[100, 80], [60, 400], [200, 120]]) {
        const w = world({ width, height });
        Core.spawn(w, { drop: true });
        run(w, 4);
        assert.equal(w.radius, P.RADIUS_MIN, `${width}×${height}`);
        assert.ok(allFinite(w) && inBounds(w), `${width}×${height}`);
        assert.ok(Core.metrics(w).areaRatio > 0.4, `${width}×${height} 面积比 ${Core.metrics(w).areaRatio}`);
    }
});

test('spawn：把乱掉的果冻整个重置（折叠、抓取、睡眠状态都清掉），可以坐下也可以从上面掉下来', () => {
    const w = world();
    for (const p of w.points) { p.x += 80; p.px = p.x; }
    w.folded = true; w.asleep = true; w.calm = 5;
    Core.grab(w, w.cx, w.cy);
    Core.spawn(w, { drop: false });
    assert.equal(w.folded, false);
    assert.equal(w.grab, null);
    assert.equal(w.asleep, false);
    assert.equal(w.calm, 0);
    assert.ok(Math.abs(Core.metrics(w).areaRatio - 1) < 0.01);
    assert.ok(Math.abs(w.cx - w.width / 2) < 1e-9);
    assert.ok(Math.abs(Core.metrics(w).cy - (w.floor - w.radius)) < 1e-6, '坐下时最低点恰好贴地');
    Core.spawn(w, { drop: true });
    assert.ok(Core.metrics(w).cy < w.floor - 2 * w.radius, '从上方落下');
});

// ---------- 减少动态效果、确定性、纯度 ----------

test('减少动态效果：阻尼更大，落下后更快安静、晃得更少', () => {
    const measure = reduceMotion => {
        const w = world({ reduceMotion });
        Core.spawn(w, { drop: true });
        let sleepAt = null; const cy = [];
        run(w, 8, 60, (i, t) => { if (w.asleep && sleepAt === null) sleepAt = t; cy.push(Core.metrics(w).cy); });
        const final = cy[cy.length - 1];
        const landing = cy.findIndex((v, i) => i > 10 && Math.abs(v - final) < 25 && v > cy[i - 1]);
        return { sleepAt, wobble: peaks(cy.slice(landing).map(v => Math.abs(v - final)), 3).length };
    };
    const normal = measure(false);
    const calm = measure(true);
    assert.ok(calm.sleepAt !== null && calm.sleepAt + 0.5 < normal.sleepAt, `减少动态：${calm.sleepAt}s，普通：${normal.sleepAt}s`);
    assert.ok(calm.wobble < normal.wobble, `晃动峰数 ${calm.wobble} < ${normal.wobble}`);
    assert.equal(world({ reduceMotion: 'yes' }).reduceMotion, true, '真值收敛为布尔');
    assert.equal(world({}).reduceMotion, false);
});

test('确定性与纯度：相同输入逐点相同；不碰 Math.random / Date.now / performance.now', () => {
    const script = w => {
        Core.spawn(w, { drop: true });
        run(w, 1.5);
        Core.grab(w, w.cx, w.cy);
        for (let i = 0; i < 30; i++) { Core.drag(w, w.pointer.x + 6, w.pointer.y - 3); Core.step(w, 17); }
        Core.release(w);
        Core.poke(w, w.cx, w.cy - w.radius);
        run(w, 3);
        return w.points.map(p => [p.x, p.y, p.px, p.py]);
    };
    const realRandom = Math.random;
    const realNow = Date.now;
    const realPerf = globalThis.performance && globalThis.performance.now;
    let a;
    try {
        const trap = () => { throw new Error('核心不应读取随机数或时钟'); };
        Math.random = trap;
        Date.now = trap;
        if (globalThis.performance) globalThis.performance.now = trap;
        a = script(world());
    } finally {
        Math.random = realRandom;
        Date.now = realNow;
        if (globalThis.performance && realPerf) globalThis.performance.now = realPerf;
    }
    const b = script(world());
    assert.deepEqual(a, b);
});

test('metrics：读数字段齐全，grabbed / airborne / stretch 随状态变化', () => {
    const w = sitting();
    const m = Core.metrics(w);
    for (const key of ['cx', 'cy', 'rotation', 'areaRatio', 'width', 'height', 'minX', 'maxX', 'minY', 'maxY', 'stretch', 'vx', 'vy']) {
        assert.ok(Number.isFinite(m[key]), key);
    }
    assert.equal(m.grabbed, false);
    assert.equal(m.airborne, false);
    assert.equal(m.folded, false);
    assert.equal(m.asleep, true);
    assert.ok(m.stretch >= 1 && m.stretch < 1.3, `坐着时接近圆（${m.stretch}）`);
    assert.equal(m.maxX - m.minX, m.width);
    assert.equal(m.maxY - m.minY, m.height);
    Core.grab(w, w.cx, w.cy);
    for (let i = 0; i < 40; i++) { Core.drag(w, w.pointer.x, w.pointer.y - 5); Core.step(w, 1000 / 60); }
    const held = Core.metrics(w);
    assert.equal(held.grabbed, true);
    assert.equal(held.airborne, true, '被提到空中');
    assert.ok(held.vy < 0, '向上运动时竖直速度为负');
});
