// 海洋动物“骨架求值器”（js/marine-rig.js）：压平、编译校验、镜像、脊柱行波、部件拍动、拉尾、求值输出的结构与确定性。
// 水族馆（Canvas）与桌面（CoreGraphics）画的是同一份求值结果，所以这里钉死的是“数值合同”：公式、取整、一个图层一个 op、非法输入的处理。
// 画面好不好看靠真实 Chromium / 原生截图判断，不在这里。
const test = require('node:test');
const assert = require('node:assert/strict');
const Rig = require('../js/marine-rig.js');

const close = (a, b, eps = 1e-9, label = '') => assert.ok(Math.abs(a - b) <= eps, `${label} ${a} ≠ ${b}`);
const TAU = Math.PI * 2;

/** 一个最小的侧视骨架：身体 + 一片鳍（带 flap），长度 100，吻端 +50、尾尖 −50。 */
function tiny(over = {}) {
    return Object.assign({
        view: 'side', length: 100, tail: -50, snout: 50,
        bend: { amp: [0.01, 0.08], pow: 2, waves: 1, turn: 0.1 },
        parts: { fin: { pivot: [10, 5], deg: 20, lag: 0.5, phase: 0.3, freq: 1, squash: 0.2, squashPhase: 0.4 } },
        layers: [
            { id: 'body', d: 'M 50 0 C 30 -10 -20 -8 -50 0 C -20 8 30 10 50 0 Z', fill: '#778899' },
            { id: 'fin', part: 'fin', mirror: true, d: 'M 10 5 L 4 20 L 16 8 Z', fill: { a: [10, 5], b: [4, 20], stops: [[0, '#112233', 0], [1, '#445566', 1]] }, alpha: 0.8 },
            { id: 'line', d: 'M 40 0 L -40 0', stroke: { color: '#ffffff', width: 1, alpha: 0.5 }, lod: 1 },
            { id: 'fine', d: 'M 0 0 L 3 0 L 3 3 Z', fill: '#000000', lod: 2 },
        ],
    }, over);
}

test('roundOps：取整到 1e-4，远离零的一侧进位（正负对称），-0 归一为 0', () => {
    assert.equal(Rig.roundOps(0.00005), 0.0001);
    assert.equal(Rig.roundOps(-0.00005), -0.0001, '负的恰好一半也远离零（JS Math.round 会向 +∞，镜像就差 1e-4）');
    assert.equal(Rig.roundOps(1.23456), 1.2346);
    assert.equal(Rig.roundOps(-1.23454), -1.2345);
    assert.ok(Object.is(Rig.roundOps(-0.00001), 0), '-0 归一');
    assert.ok(Object.is(Rig.roundOps(-0), 0));
    for (const v of [0.12345, 3.00005, 17.77775, 0.99995]) assert.equal(Rig.roundOps(-v), -Rig.roundOps(v), String(v));
});

test('parseColor：#rgb 与 #rrggbb 得到 0…1 的分量；其他写法返回 null', () => {
    assert.deepEqual(Rig.parseColor('#fff'), [1, 1, 1]);
    assert.deepEqual(Rig.parseColor('#000000'), [0, 0, 0]);
    const c = Rig.parseColor('#336699');
    close(c[0], 0x33 / 255); close(c[1], 0x66 / 255); close(c[2], 0x99 / 255);
    for (const bad of ['', '#12', '#12345', '#1234567', 'red', 'rgb(1,2,3)', '#gggggg', null, undefined, 12]) assert.equal(Rig.parseColor(bad), null, String(bad));
});

test('flatten：M/L 端点原样，C/Q 每段取 CURVE_STEPS 个点且终点精确；Z 去掉与起点重合的末点；坏路径返回 null', () => {
    const square = Rig.flatten('M 0 0 L 10 0 L 10 10 L 0 10 Z');
    assert.equal(square.length, 1);
    assert.deepEqual(square[0], { pts: [0, 0, 10, 0, 10, 10, 0, 10], closed: true });
    const cubic = Rig.flatten('M 0 0 C 0 10 10 10 10 0');
    assert.equal(cubic[0].closed, false);
    assert.equal(cubic[0].pts.length, (1 + Rig.CURVE_STEPS) * 2);
    assert.deepEqual(cubic[0].pts.slice(-2), [10, 0], '三次曲线终点精确');
    close(cubic[0].pts[2 * (Rig.CURVE_STEPS / 2) + 1], 7.5, 1e-9, '中点 t=0.5 的 y = 3/4 × 10');
    const quad = Rig.flatten('M 0 0 Q 5 10 10 0');
    assert.equal(quad[0].pts.length, (1 + Rig.CURVE_STEPS) * 2);
    close(quad[0].pts[2 * (Rig.CURVE_STEPS / 2) + 1], 5, 1e-9, '二次曲线中点');
    const dup = Rig.flatten('M 0 0 L 4 0 L 4 4 L 0 0 Z');
    assert.deepEqual(dup[0].pts, [0, 0, 4, 0, 4, 4], '闭合时末点与起点重合就去掉');
    const near = Rig.flatten('M 0 0 L 4 0 L 4 4 L 0.5 0 Z');
    assert.deepEqual(near[0].pts, [0, 0, 4, 0, 4, 4, 0.5, 0], '末点离起点很近但不重合，不能当成重复点去掉');
    assert.equal(Rig.flatten('M 0 0 L 1 1 M 5 5 L 6 6').length, 2, '多个子路径各自成线');
    assert.equal(Rig.flatten('M 0 0 C 0 10 10 10 10 0', 4)[0].pts.length, 10, 'steps 可调（测试用）');
    for (const bad of ['', 'M 0', 'M 0 0 L 1,1', 'M 0 0 l 1 1', 'M 0 0 A 1 1 0 0 0 1 1', 'L 1 1', null, 5]) assert.equal(Rig.flatten(bad), null, String(bad));
});

test('flatten：不对称的 C/Q 曲线逐点等于 de Casteljau 的结果（与实现用的伯恩斯坦展开是两种算法）', () => {
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const casteljau = (points, t) => {
        let level = points;
        while (level.length > 1) level = level.slice(1).map((p, i) => lerp(level[i], p, t));
        return level[0];
    };
    const curves = [
        ['M 3 -2 C 12 4 2 18 20 6', [[3, -2], [12, 4], [2, 18], [20, 6]]],
        ['M -5 7 C -9 -3 6 15 1 -8', [[-5, 7], [-9, -3], [6, 15], [1, -8]]],
        ['M 3 -2 Q 14 9 -6 5', [[3, -2], [14, 9], [-6, 5]]],
        ['M 0 0 Q 2 11 13 -4', [[0, 0], [2, 11], [13, -4]]],
    ];
    for (const [d, control] of curves) {
        const pts = Rig.flatten(d)[0].pts;
        assert.equal(pts.length, (1 + Rig.CURVE_STEPS) * 2, d);
        assert.deepEqual(pts.slice(0, 2), control[0], `${d} 起点原样`);
        for (let i = 1; i <= Rig.CURVE_STEPS; i++) {
            const expected = casteljau(control, i / Rig.CURVE_STEPS);
            close(pts[i * 2], expected[0], 1e-9, `${d} 第 ${i} 点 x`);
            close(pts[i * 2 + 1], expected[1], 1e-9, `${d} 第 ${i} 点 y`);
        }
    }
});

test('compile：合规数据通过，每类错误都抛出带位置说明的 Error', () => {
    const rig = Rig.compile(tiny());
    assert.equal(rig.view, 'side');
    assert.deepEqual(rig.layers.map(l => l.id), ['body', 'fin', 'fin~', 'line', 'fine'], '镜像图层紧跟原图层，id 加 ~');
    const bad = (patch, pattern) => assert.throws(() => Rig.compile(patch), pattern);
    bad(null, /不是对象/);
    bad(tiny({ view: 'front' }), /view/);
    bad(tiny({ length: NaN }), /length\/tail\/snout/);
    bad(tiny({ tail: 50, snout: 50 }), /length\/tail\/snout/);
    bad(tiny({ bend: { amp: [0, 0.5] } }), /bend\.amp/);
    bad(tiny({ bend: { amp: [0, 0.1], pow: 0.1 } }), /bend/);
    bad(tiny({ bend: { amp: [0, 0.1], waves: 9 } }), /bend/);
    bad(tiny({ layers: [] }), /layers/);
    bad(tiny({ layers: new Array(Rig.MAX_LAYERS + 1).fill(0).map((_, i) => ({ id: `l${i}`, d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000' })) }), /layers/);
    bad(tiny({ layers: [{ id: 'a', d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000' }, { id: 'a', d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000' }] }), /id/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: 'blue' }] }), /颜色不合规/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z' }] }), /既没有填充也没有描边/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0', stroke: { color: '#000', width: 0 } }] }), /stroke/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000', alpha: 2 }] }), /alpha/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000', lod: 3 }] }), /lod/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: '#000', part: 'ghost' }] }), /part ghost 没有登记/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Q', fill: '#000' }] }), /路径不合规/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: { a: [0, 0], b: [1, NaN], stops: [[0, '#000'], [1, '#fff']] } }] }), /渐变端点/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: { a: [0, 0], b: [1, 1], stops: [[0, '#000']] } }] }), /色标数量/);
    bad(tiny({ layers: [{ id: 'x', d: 'M 0 0 L 1 0 L 1 1 Z', fill: { a: [0, 0], b: [1, 1], stops: [[0.6, '#000'], [0.2, '#fff']] } }] }), /色标不合规/);
    bad(tiny({ parts: { fin: { pivot: [0], deg: 1 } } }), /pivot/);
    bad(tiny({ parts: { fin: { pivot: [0, 0], deg: 120 } } }), /deg/);
    bad(tiny({ parts: { fin: { pivot: [0, 0], deg: 5, squash: 0.9 } } }), /squash/);
    bad(tiny({ parts: { fin: { pivot: [0, 0], deg: 5, lag: 5 } } }), /lag/);
    bad(tiny({ parts: { fin: { pivot: [0, 0], deg: 5, freq: 0 } } }), /freq/);
});

test('compile：单个图层压平后的点数超过 MAX_POINTS 被拒绝（防坏数据）', () => {
    let d = 'M 0 0';
    for (let i = 0; i < 700; i++) d += ' L 1 1';        // 700 条命令（解析器上限 800）× 压平不增点，只是占位
    const ok = Rig.compile(tiny({ layers: [{ id: 'many', d: `${d} Z`, fill: '#000' }] }));
    assert.ok(ok.layers[0].polys[0].pts.length / 2 <= Rig.MAX_POINTS);
    let curves = 'M 0 0';
    for (let i = 0; i < 790; i++) curves += ' C 1 1 2 2 3 3';   // 790 × CURVE_STEPS 个点 > MAX_POINTS
    assert.throws(() => Rig.compile(tiny({ layers: [{ id: 'many', d: `${curves} Z`, fill: '#000' }] })), /压平后 \d+ 个点，超过上限/);
});

test('镜像：路径 y 取反，部件 pivot.y 取反、转角取反，渐变端点 y 取反；原图层不受影响', () => {
    const rig = Rig.compile(tiny());
    const fin = rig.layers.find(l => l.id === 'fin');
    const mirrored = rig.layers.find(l => l.id === 'fin~');
    assert.equal(mirrored.part, 'fin~');
    assert.equal(fin.part, 'fin');
    assert.deepEqual(rig.parts['fin~'].pivot, [10, -5]);
    assert.equal(rig.parts['fin~'].deg, -rig.parts.fin.deg);
    for (let i = 0; i < fin.polys[0].pts.length; i += 2) {
        assert.equal(mirrored.polys[0].pts[i], fin.polys[0].pts[i]);
        assert.equal(mirrored.polys[0].pts[i + 1], -fin.polys[0].pts[i + 1] || 0);
    }
    assert.deepEqual(fin.fill.a, [10, 5]);
    assert.deepEqual(mirrored.fill.a, [10, -5]);
    assert.deepEqual(mirrored.fill.b, [4, -20]);
    assert.equal(rig.parts.fin.reach, rig.parts['fin~'].reach, '镜像部件的作用半径相同');
    assert.ok(rig.parts.fin.reach > 1);
});

test('bendPoint：y=0 的点落在脊柱上；偏离脊柱的点沿脊柱法线移动，距离不变（解析斜率与数值导数一致）', () => {
    const rig = Rig.compile(tiny());
    const pose = Rig.normalizePose({ phase: 0.9, amp: 1, turn: 0.4 });
    const spine = x => Rig.bendPoint(rig, x, 0, pose);
    for (const x of [-48, -30, -10, 0, 12, 30, 48]) {
        const [sx, sy] = spine(x);
        assert.equal(sx, x, '脊柱上的点 x 不变（按 x 参数化，不是弧长）');
        const h = 1e-5;
        const slope = (spine(x + h)[1] - spine(x - h)[1]) / (2 * h);
        for (const y of [-6, 3, 9]) {
            const [bx, by] = Rig.bendPoint(rig, x, y, pose);
            const norm = 1 / Math.sqrt(1 + slope * slope);
            close(bx, x - y * slope * norm, 1e-5, `x=${x} y=${y} 法线 x`);
            close(by, sy + y * norm, 1e-5, `x=${x} y=${y} 法线 y`);
            close(Math.hypot(bx - sx, by - sy), Math.abs(y), 1e-9, '离脊柱的距离等于休止时的 |y|');
            close((bx - sx) * 1 + (by - sy) * slope, 0, 1e-5, '位移与切线垂直');
        }
    }
});

test('bendPoint：幅度包络头小尾大；行波沿头→尾方向传播；amp=0 且 turn=0 是恒等变换；越界的 x 夹在两端', () => {
    const rig = Rig.compile(tiny({ bend: { amp: [0.01, 0.1], pow: 2, waves: 1, turn: 0.1 } }));
    const span = 100;
    let head = 0, tail = 0;
    for (let i = 0; i < 64; i++) {
        const pose = Rig.normalizePose({ phase: TAU * i / 64, amp: 1 });
        head = Math.max(head, Math.abs(Rig.bendPoint(rig, 50, 0, pose)[1]));
        tail = Math.max(tail, Math.abs(Rig.bendPoint(rig, -50, 0, pose)[1]));
    }
    close(head, 0.01 * span, 1e-3, '头端振幅 = amp[0] × 体长');
    close(tail, 0.1 * span, 1e-3, '尾端振幅 = amp[1] × 体长');
    // 行波：同一站位在相位 p 的位移 = env × sin(p − k(1−s))，所以尾端比头端晚 k 弧度
    const k = TAU * 1;
    for (const [x, s] of [[-50, 0], [0, 0.5], [50, 1]]) {
        const env = 0.01 + (0.1 - 0.01) * Math.pow(1 - s, 2);
        for (const p of [0, 0.7, 2.1]) {
            close(Rig.bendPoint(rig, x, 0, Rig.normalizePose({ phase: p, amp: 1 }))[1], env * span * Math.sin(p - k * (1 - s)), 1e-9, `s=${s} p=${p}`);
        }
    }
    for (const [x, y] of [[-50, 0], [0, 7], [49, -3]]) {
        assert.deepEqual(Rig.bendPoint(rig, x, y, Rig.normalizePose({ phase: 1.3, amp: 0, turn: 0 })), [x, y]);
    }
    assert.deepEqual(Rig.bendPoint(rig, 500, 0, Rig.normalizePose({ phase: 0.2, amp: 1 })), Rig.bendPoint(rig, 50, 0, Rig.normalizePose({ phase: 0.2, amp: 1 })).map((v, i) => (i === 0 ? 500 : v)), '越界按端点站位计算，x 保持');
});

test('bendPoint：turn 给尾部一个整体偏向（头不动），方向随符号', () => {
    const rig = Rig.compile(tiny({ bend: { amp: [0, 0], pow: 2, waves: 1, turn: 0.1 } }));
    const left = Rig.bendPoint(rig, -50, 0, Rig.normalizePose({ turn: -1 }));
    const right = Rig.bendPoint(rig, -50, 0, Rig.normalizePose({ turn: 1 }));
    close(right[1], 0.1 * 100, 1e-9);
    close(left[1], -0.1 * 100, 1e-9);
    close(Rig.bendPoint(rig, 50, 0, Rig.normalizePose({ turn: 1 }))[1], 0, 1e-12, '吻端不动');
});

test('flapPoint：绕 pivot 转动，滞后随离 pivot 的距离增大；pivot 自身不动；squash 只压扁 y', () => {
    const rig = Rig.compile(tiny({ parts: { fin: { pivot: [10, 5], deg: 30, lag: 1, phase: 0, freq: 1, squash: 0, squashPhase: 0 } } }));
    const flap = rig.parts.fin;
    const pose = Rig.normalizePose({ phase: 1.0, amp: 1 });
    assert.deepEqual(Rig.flapPoint(flap, 10, 5, pose), [10, 5], 'pivot 不动');
    const reach = flap.reach;
    for (const [x, y] of [[4, 20], [16, 8], [10, 15]]) {
        const r = Math.hypot(x - 10, y - 5);
        const angle = 30 * Math.PI / 180 * Math.sin(1.0 - 1 * r / reach);
        const dx = x - 10, dy = y - 5;
        const [fx, fy] = Rig.flapPoint(flap, x, y, pose);
        close(fx, 10 + dx * Math.cos(angle) - dy * Math.sin(angle), 1e-9, 'x');
        close(fy, 5 + dx * Math.sin(angle) + dy * Math.cos(angle), 1e-9, 'y');
        close(Math.hypot(fx - 10, fy - 5), r, 1e-9, '转动不改变到 pivot 的距离');
    }
    assert.deepEqual(Rig.flapPoint(flap, 4, 20, Rig.normalizePose({ phase: 1.0, amp: 0 })), [4, 20], 'amp=0 不动');
    const squash = Rig.compile(tiny({ parts: { fin: { pivot: [10, 5], deg: 0, lag: 0, freq: 2, squash: 0.2, squashPhase: 0.5 } } })).parts.fin;
    const [qx, qy] = Rig.flapPoint(squash, 4, 20, Rig.normalizePose({ phase: 0.7, amp: 1 }));
    assert.equal(qx, 4, 'deg=0 时只压扁 y');
    close(qy, 5 + 15 * (1 - 0.2 * Math.sin(2 * 0.7 + 0.5)), 1e-9, 'y 向 pivot 压缩');
});

test('normalizePose：非有限与越界值被夹住或回到默认；pull 只接受两个有限数且夹在 ±MAX_PULL', () => {
    const p = Rig.normalizePose({ phase: NaN, amp: 5, turn: -9, lod: 7.4, pull: [1, 2] });
    assert.deepEqual(p, { phase: 0, amp: 1, turn: -1, lod: 2, pull: [1, 2] });
    assert.deepEqual(Rig.normalizePose(null), { phase: 0, amp: 1, turn: 0, lod: 2, pull: null });
    assert.equal(Rig.normalizePose({ amp: -2 }).amp, 0);
    assert.equal(Rig.normalizePose({ lod: -3 }).lod, 0);
    for (const bad of [[1], [NaN, 1], [1, Infinity], 'x', [0, 0], null, [1, 2, 3], ['1', '2']]) assert.equal(Rig.normalizePose({ pull: bad }).pull, null, JSON.stringify(bad));
    assert.deepEqual(Rig.normalizePose({ pull: [1e6, -1e6] }).pull, [Rig.MAX_PULL, -Rig.MAX_PULL]);
    assert.deepEqual(Rig.normalizePose({ pull: [-10, 0] }).pull, [-10, 0], '只沿 x 拉也算有效拉力');
    assert.deepEqual(Rig.normalizePose({ pull: [0, 6] }).pull, [0, 6], '只沿 y 拉也算有效拉力');
});

test('pull：按站位权重（头 0、尾 1）叠加；头不动；零或非法 pull 与没有 pull 完全一样', () => {
    const rig = Rig.compile(tiny());
    assert.deepEqual([...Rig.PULL_WEIGHT], [0, 0, 0.12, 0.5, 1]);
    for (const [x, w] of [[50, 0], [25, 0], [0, 0.12], [-25, 0.5], [-50, 1], [-37.5, 0.75], [-12.5, 0.31]]) close(Rig.pullWeight(rig, x), w, 1e-9, `x=${x}`);
    const still = Rig.normalizePose({ phase: 0.5, amp: 1 });
    const pulled = Rig.normalizePose({ phase: 0.5, amp: 1, pull: [-10, 4] });
    const base = Rig.movePoint(rig, undefined, -50, 0, still);
    const moved = Rig.movePoint(rig, undefined, -50, 0, pulled);
    close(moved[0] - base[0], -10, 1e-9); close(moved[1] - base[1], 4, 1e-9);
    const headBase = Rig.movePoint(rig, undefined, 40, 0, still);
    assert.deepEqual(Rig.movePoint(rig, undefined, 40, 0, pulled), headBase, '头部不被拉动');
    const a = Rig.evaluate(rig, { phase: 0.5 });
    for (const bad of [undefined, null, [0, 0], [NaN, 1], 'x']) assert.deepEqual(Rig.evaluate(rig, { phase: 0.5, pull: bad }), a, JSON.stringify(bad));
});

test('evaluate：一个图层一个 op，结构与顺序固定；填充只用闭合子路径；渐变端点随同一变形移动；颜色不透明度乘图层 alpha', () => {
    const rig = Rig.compile(tiny());
    const { ops, bounds } = Rig.evaluate(rig, { phase: 0.4, amp: 1, lod: 2 });
    assert.deepEqual(ops.map(o => `${o.k}:${o.id}`), ['fill:body', 'fill:fin', 'fill:fin~', 'stroke:line', 'fill:fine']);
    const body = ops[0];
    assert.deepEqual(Object.keys(body).sort(), ['id', 'k', 'paint', 'polys', 'rule']);
    assert.deepEqual(body.paint.rgba.slice(0, 3), Rig.parseColor('#778899'));
    assert.equal(body.paint.rgba[3], 1);
    assert.equal(body.rule, 'nonzero');
    const fin = ops[1];
    assert.ok(fin.paint.grad && fin.paint.grad.stops.length === 2);
    close(fin.paint.grad.stops[1][4], 1 * 0.8, 1e-12, '色标不透明度乘图层 alpha');
    assert.equal(fin.paint.grad.stops[0][4], 0);
    // 渐变端点 a 与路径第一个顶点是同一个休止点，求值后也必须是同一个点
    close(fin.paint.grad.a[0], fin.polys[0].pts[0], 2e-3, '渐变端点 x');
    close(fin.paint.grad.a[1], fin.polys[0].pts[1], 2e-3, '渐变端点 y');
    const line = ops[3];
    assert.equal(line.width, 1);
    assert.equal(line.cap, 'round');
    assert.equal(line.rgba[3], 0.5);
    assert.equal(line.polys[0].closed, false);
    for (const op of ops) for (const poly of op.polys) for (const v of poly.pts) { assert.ok(Number.isFinite(v)); assert.equal(v, Math.round(v * 10000) / 10000, '坐标取整到 1e-4，两个平台才能逐点对拍'); }
    assert.ok(bounds.minX < bounds.maxX && bounds.minY < bounds.maxY);
    for (const op of ops) for (const poly of op.polys) for (let i = 0; i < poly.pts.length; i += 2) {
        assert.ok(poly.pts[i] >= bounds.minX && poly.pts[i] <= bounds.maxX && poly.pts[i + 1] >= bounds.minY && poly.pts[i + 1] <= bounds.maxY, '所有点都在包围盒里');
    }
});

test('evaluate：lod 过滤；确定、不改动骨架、不依赖调用顺序', () => {
    const rig = Rig.compile(tiny());
    assert.deepEqual(Rig.evaluate(rig, { lod: 0 }).ops.map(o => o.id), ['body', 'fin', 'fin~']);
    assert.deepEqual(Rig.evaluate(rig, { lod: 1 }).ops.map(o => o.id), ['body', 'fin', 'fin~', 'line']);
    assert.equal(Rig.evaluate(rig, { lod: 2 }).ops.length, 5);
    const before = JSON.stringify(rig);
    const first = JSON.stringify(Rig.evaluate(rig, { phase: 2.2, amp: 0.7, turn: -0.3, pull: [3, -2] }));
    Rig.evaluate(rig, { phase: 9, amp: 1 });
    assert.equal(JSON.stringify(Rig.evaluate(rig, { phase: 2.2, amp: 0.7, turn: -0.3, pull: [3, -2] })), first, '同样的输入得到同样的结果');
    assert.equal(JSON.stringify(rig), before, '求值不改骨架');
    assert.equal(JSON.stringify(Rig.evaluate(rig, { phase: 2.2 + TAU, amp: 0.7, turn: -0.3, pull: [3, -2] })).length, first.length);
});

test('站位表近似：evaluate 与逐点精确公式（evaluateExact）的结构完全一致，坐标差 ≤ 3e-3 个单位；含拍动、转弯与拉尾', () => {
    const noSquash = tiny({ parts: { fin: { pivot: [10, 5], deg: 25, lag: 1.2, phase: 0.7, freq: 2 } } });   // 没有 squash 的部件（压扁表恒为 1）
    for (const source of [tiny(), noSquash]) approximationHolds(Rig.compile(source));
});

function approximationHolds(rig) {
    let rnd = 987654321;
    const random = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
    let worst = 0;
    for (let n = 0; n < 200; n++) {
        const pose = { phase: random() * 30 - 8, amp: random(), turn: random() * 2 - 1, lod: 2, pull: n % 4 === 0 ? [random() * 20 - 10, random() * 20 - 10] : undefined };
        const fast = Rig.evaluate(rig, pose).ops;
        const exact = Rig.evaluateExact(rig, pose).ops;
        assert.deepEqual(fast.map(o => [o.k, o.id, o.polys.length, o.polys.map(p => p.closed)]), exact.map(o => [o.k, o.id, o.polys.length, o.polys.map(p => p.closed)]));
        for (let i = 0; i < fast.length; i++) {
            for (let p = 0; p < fast[i].polys.length; p++) {
                for (let k = 0; k < fast[i].polys[p].pts.length; k++) worst = Math.max(worst, Math.abs(fast[i].polys[p].pts[k] - exact[i].polys[p].pts[k]));
            }
        }
    }
    assert.ok(worst <= 3e-3, `最大偏差 ${worst}`);
    assert.ok(Rig.SPINE_STEPS >= 128 && Rig.FLAP_STEPS >= 48, '表的分辨率是两个平台共同的合同，降低它要重新核对误差');
}

test('站位表近似：x 越出两端、y 很大、部件离 pivot 最远处都不越界取表（不产生 NaN）', () => {
    const rig = Rig.compile(tiny({ layers: [
        { id: 'far', d: 'M 500 300 L -500 -300 L 400 -200 Z', fill: '#123456' },
        { id: 'finFar', part: 'fin', d: 'M 10 5 L 4 20 L -200 80 Z', fill: '#123456' },
    ] }));
    for (const pose of [{ phase: 1 }, { phase: 7, amp: 1, turn: 1 }, { phase: -3, amp: 0.3, turn: -1, pull: [30, 30] }, { phase: 2.2, amp: 0.8, turn: 0.4 }]) {
        const fast = Rig.evaluate(rig, pose).ops;
        const exact = Rig.evaluateExact(rig, pose).ops;
        for (let i = 0; i < fast.length; i++) for (let p = 0; p < fast[i].polys.length; p++) for (let k = 0; k < fast[i].polys[p].pts.length; k++) {
            const v = fast[i].polys[p].pts[k];
            assert.ok(Number.isFinite(v));
            // 越出身体两端的点，脊柱取端点值（精确公式夹取站位）；站位表不夹取就会外推出很大的偏差（实测夹取后偏差 ≤ 6e-4）
            assert.ok(Math.abs(v - exact[i].polys[p].pts[k]) <= 0.01, `${fast[i].id} 点 ${k} 偏差 ${Math.abs(v - exact[i].polys[p].pts[k])}`);
        }
    }
});

test('evaluate：纯色填充的不透明度 = 图层 alpha，颜色分量原样（快路径与精确公式一致）', () => {
    const rig = Rig.compile(tiny({ layers: [{ id: 'tint', d: 'M 0 0 L 10 0 L 10 10 Z', fill: '#336699', alpha: 0.6 }] }));
    for (const [name, evaluate] of [['evaluate', Rig.evaluate], ['evaluateExact', Rig.evaluateExact]]) {
        const fill = evaluate(rig, {}).ops.find(op => op.k === 'fill');
        close(fill.paint.rgba[3], 0.6, 1e-12, `${name} 不透明度`);
        close(fill.paint.rgba[0], 0x33 / 255, 1e-12, `${name} r`);
        close(fill.paint.rgba[1], 0x66 / 255, 1e-12, `${name} g`);
        close(fill.paint.rgba[2], 0x99 / 255, 1e-12, `${name} b`);
    }
});

test('evaluate：描边的不透明度 = 描边 alpha × 图层 alpha，颜色分量原样（快路径与精确公式一致）', () => {
    const rig = Rig.compile(tiny({ layers: [{ id: 'edge', d: 'M 0 0 L 10 0 L 10 10 Z', stroke: { color: '#336699', width: 2, alpha: 0.5 }, alpha: 0.4 }] }));
    for (const [name, evaluate] of [['evaluate', Rig.evaluate], ['evaluateExact', Rig.evaluateExact]]) {
        const stroke = evaluate(rig, {}).ops.find(op => op.k === 'stroke');
        close(stroke.rgba[3], 0.2, 1e-12, `${name} 不透明度`);
        close(stroke.rgba[0], 0x33 / 255, 1e-12, `${name} r`);
        close(stroke.rgba[1], 0x66 / 255, 1e-12, `${name} g`);
        close(stroke.rgba[2], 0x99 / 255, 1e-12, `${name} b`);
        assert.equal(stroke.width, 2);
    }
});

test('evaluate：描边图层按子路径各自的闭合状态输出；开放线不参与填充', () => {
    const rig = Rig.compile(tiny({ layers: [{ id: 'mix', d: 'M 0 0 L 10 0 L 10 10 Z M 20 0 L 30 0', fill: '#123456', stroke: { color: '#ffffff', width: 2 } }] }));
    const { ops } = Rig.evaluate(rig, {});
    assert.deepEqual(ops.map(o => o.k), ['fill', 'stroke']);
    assert.equal(ops[0].polys.length, 1, '填充只含闭合子路径');
    assert.equal(ops[1].polys.length, 2);
    assert.deepEqual(ops[1].polys.map(p => p.closed), [true, false]);
});

test('unionBounds：覆盖任何相位与转弯下的包围盒；有限且包含原点附近', () => {
    const rig = Rig.compile(tiny());
    const union = Rig.unionBounds(rig, 12);
    for (let i = 0; i < 24; i++) {
        for (const turn of [-1, 0, 1]) {
            const { bounds } = Rig.evaluate(rig, { phase: TAU * i / 24 + 0.01, amp: 1, turn, lod: 0 });
            assert.ok(bounds.minX >= union.minX - 0.5 && bounds.maxX <= union.maxX + 0.5 && bounds.minY >= union.minY - 0.5 && bounds.maxY <= union.maxY + 0.5, `相位 ${i} turn ${turn}`);
        }
    }
    assert.ok(union.minX < 0 && union.maxX > 0 && union.minY < 0 && union.maxY > 0);
});

test('源码合同：求值器是纯计算——不碰 DOM、时钟、随机数、存储与网络', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const text = fs.readFileSync(path.join(__dirname, '../js/marine-rig.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(text, /\bdocument\b|\bwindow\b|\bDate\b|Math\.random|chrome\.|localStorage|fetch\(|XMLHttpRequest|requestAnimationFrame|setTimeout|setInterval|performance\./);
    const canvas = fs.readFileSync(path.join(__dirname, '../js/marine-rig-canvas.js'), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(canvas, /\bdocument\b|\bwindow\b|\bDate\b|Math\.random|chrome\.|localStorage|fetch\(|requestAnimationFrame|setTimeout|setInterval|innerHTML|eval\(/);
});
