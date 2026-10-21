// 水族馆里的写实动物（js/aquarium-real.js + js/marine-rig-canvas.js + aquarium.js 的接线）：
// 姿态映射、景深雾、画布调用的顺序与还原、写实/卡通的选择、出错后的退路。
// 画面好不好看靠真实 Chromium 截图判断；这里守住不会悄悄变坏的结构。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../js/aquarium-core.js');
const Real = require('../js/aquarium-real.js');
const Painter = require('../js/marine-rig-canvas.js');
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');
const Aquarium = require('../js/aquarium.js');
const Yaw = require('../js/aquarium-yaw.js');

const PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];

function recorder({ throwOn, once = false } = {}) {
    const calls = [];
    const state = { globalCompositeOperation: 'screen' };
    let thrown = false;
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => {
                if (throwOn === String(key) && !(once && thrown)) { thrown = true; throw new Error(`${String(key)} 被拒绝`); }
                calls.push([String(key), args]);
                return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop(o, c) { calls.push(['addColorStop', [o, c]]); } } : undefined;
            };
        },
        set(target, key, value) { calls.push(['set:' + String(key), [value]]); target[key] = value; return true; },
    });
}
const names = ctx => ctx._calls.map(([n]) => n);
const count = (ctx, name) => names(ctx).filter(n => n === name).length;
const fishOf = (species, extra = {}) => Object.assign({ species, x: 200, y: 150, ang: 0.3, len: Core.speciesById(species).len * 2, z: 0.95, alpha: 1, phase: 1.1, turn: 0.2, flip: 1, vx: 20, vy: 0 }, extra);
const baseOpts = (len, extra = {}) => Object.assign({ len, flip: 1, fed: 0, far: false, night: 0, amount: 0.9, lowPower: false, speed: 30, pull: null, color: [112, 205, 255], alpha: 1 }, extra);

test('登记：四种动物有写实数据，其余种类没有；ids() 只列可用的', () => {
    assert.deepEqual(Real.ids().sort(), ['hammer', 'manta', 'turtle', 'whaleshark']);
    for (const id of Real.ids()) assert.equal(Real.has(id), true, id);
    for (const id of ['neon', 'tang', 'clown', 'puffer', 'angel', 'constructor', '__proto__', '', null, undefined, 3]) assert.equal(Real.has(id), false, String(id));
    for (const id of Real.ids()) assert.ok(Core.speciesById(id), `${id} 在核心物种表里`);
    assert.ok(Object.isFrozen(Real) && Object.isFrozen(Real.FREQ));
});

test('poseOf：相位按种缩放（大型动物拍得慢）、幅度随速度、转弯夹在 ±1、细节档随大小与省流量', () => {
    const f = fishOf('whaleshark', { phase: 10, turn: 3, vx: 28, vy: 0 });
    const pose = Real.poseOf(f, { len: 130, flip: 1, far: false, lowPower: false, speed: 28, pull: null });
    assert.equal(pose.phase, 10 * Real.FREQ.whaleshark);
    assert.equal(pose.turn, 1, '转弯夹到 1');
    assert.equal(pose.lod, 2);
    assert.equal(pose.amp, 1, '巡航速度以上摆满');
    assert.ok(!('pull' in pose), '没有拉尾就没有 pull 键');
    const slow = Real.poseOf(fishOf('whaleshark', { vx: 0, vy: 0 }), { len: 130, flip: 1, speed: 28 });
    assert.equal(slow.amp, 0.5, '静止时仍摆一半（不是僵住）');
    assert.ok(Real.poseOf(fishOf('manta', { vx: 1e6, vy: 0 }), { len: 96, flip: 1, speed: 36 }).amp <= 1);
    for (const species of Real.ids()) assert.ok(Real.FREQ[species] > 0 && Real.FREQ[species] <= 1, `${species} 频率系数`);
    assert.ok(Real.FREQ.whaleshark < Real.FREQ.hammer, '鲸鲨比小锤头鲨慢');
    assert.equal(Real.poseOf(f, { len: 130, flip: 1, speed: 28, lowPower: true }).lod, 0, '省流量只画主要图层');
    assert.equal(Real.poseOf(f, { len: 130, flip: 1, speed: 28, far: true }).lod, 1, '远处少画最细的');
    assert.equal(Real.poseOf(f, { len: 40, flip: 1, speed: 28 }).lod, 1, '小个头少画最细的');
    for (const bad of [NaN, undefined, 'x', Infinity]) {
        const p = Real.poseOf(fishOf('hammer', { phase: bad, turn: bad }), { len: 56, flip: 1, speed: 58 });
        assert.equal(p.phase, 0, String(bad));
        assert.equal(p.turn, 0, String(bad));
    }
});

test('poseOf：拉尾位移从鱼本地像素换算成骨架单位（除以每单位像素数），翻面时 y 取反；非法拉尾被丢弃', () => {
    const base = { len: 50, speed: 30 };
    const up = Real.poseOf(fishOf('hammer'), { ...base, flip: 1, pull: { x: -4, y: 2 } });
    assert.deepEqual(up.pull, [-8, 4], 'len 50 → 每单位 0.5 像素');
    const down = Real.poseOf(fishOf('hammer'), { ...base, flip: -0.4, pull: { x: -4, y: 2 } });
    assert.deepEqual(down.pull, [-8, -4], '翻面后本地 y 轴是反的');
    for (const bad of [{ x: NaN, y: 1 }, { x: 1 }, { x: 'a', y: 2 }, null, undefined]) assert.ok(!('pull' in Real.poseOf(fishOf('hammer'), { ...base, flip: 1, pull: bad })), JSON.stringify(bad));
});

test('poseOf：翻面（flip < 0）时弯身方向跟着反过来——核心的 turn > 0 表示向鱼本地 +y 转，翻面后本地 y 轴是镜像的，否则朝左游的鱼会往转弯的反方向弯', () => {
    const f = fishOf('hammer', { turn: 0.5 });
    const base = { len: 100, speed: 30 };
    assert.equal(Real.poseOf(f, { ...base, flip: 1 }).turn, 0.5);
    assert.equal(Real.poseOf(f, { ...base, flip: -1 }).turn, -0.5);
    assert.equal(Real.poseOf(f, { ...base, flip: -0.2 }).turn, -0.5, '翻面过渡中的负值也算翻过去');
    assert.equal(Real.poseOf(f, { ...base, flip: 0.2 }).turn, 0.5);
    assert.equal(Real.poseOf(fishOf('hammer', { turn: -3 }), { ...base, flip: -1 }).turn, 1, '先夹到 ±1 再按面取反');
});

test('draw：转身中（核心的 xs < 1）沿屏幕横向缩短身体——平移之后、旋转之前缩放 (xs, 1)；xs 缺失、不小于 1 或不是有限数时不缩；下限 XS_MIN（0.04），画布状态成对还原', () => {
    const calls = ctx => ctx._calls.map(([name]) => name);
    const ctx = recorder();
    assert.equal(Real.draw(ctx, fishOf('whaleshark', { xs: 0.5 }), baseOpts(200)), true);
    const seq = calls(ctx);
    const iT = seq.indexOf('translate');
    const iS = seq.indexOf('scale');
    const iR = seq.indexOf('rotate');
    assert.ok(iT >= 0 && iT < iS && iS < iR, `顺序应当是 translate → scale(xs, 1) → rotate：${seq.slice(0, 6).join(',')}`);
    assert.deepEqual(ctx._calls[iS][1], [0.5, 1]);
    assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
    for (const [xs, expected] of [[0, 0.04], [-0.3, 0.04], [0.01, 0.04], [0.04, 0.04], [0.9, 0.9]]) {
        const c = recorder();
        Real.draw(c, fishOf('hammer', { xs }), baseOpts(100));
        const names2 = calls(c);
        assert.deepEqual(c._calls[names2.indexOf('scale')][1], [expected, 1], `xs ${xs}`);
    }
    for (const xs of [undefined, 1, 1.5, NaN, Infinity, 'x', null]) {
        const c = recorder();
        Real.draw(c, fishOf('hammer', { xs }), baseOpts(100));
        const names2 = calls(c);
        const firstRotate = names2.indexOf('rotate');
        assert.ok(!names2.slice(0, firstRotate).includes('scale'), `xs ${String(xs)}：旋转之前不应该有缩放`);
    }
});

test('hazeOf：越远越混进水色，夜里更重，刚吃到饲料的亮一点；颜色与比例都在合法范围', () => {
    const near = Real.hazeOf(1, 0, 0), far = Real.hazeOf(0.35, 0, 0);
    assert.equal(near.amount, 0);
    assert.ok(far.amount > near.amount && far.amount <= 0.7);
    assert.ok(Real.hazeOf(0.6, 1, 0).amount > Real.hazeOf(0.6, 0, 0).amount, '夜里更重');
    assert.ok(Real.hazeOf(0.6, 0, 1).amount < Real.hazeOf(0.6, 0, 0).amount, '吃到饲料的雾更薄');
    for (const z of [0, 0.35, 0.7, 1]) for (const night of [0, 0.5, 1]) for (const fed of [0, 1]) {
        const h = Real.hazeOf(z, night, fed);
        assert.ok(h.amount >= 0 && h.amount <= 0.7);
        assert.ok(h.rgb.length === 3 && h.rgb.every(v => v >= 0 && v <= 1));
    }
    assert.ok(Real.hazeOf(0.5, 1, 0).rgb[1] < Real.hazeOf(0.5, 0, 0).rgb[1], '夜里的水色更暗');
});

test('hazeOf absorb：红 ≥ 绿 ≥ 蓝；平均值等于 amount（未触顶）；z=1 为零；未开 absorb 时没有 amounts', () => {
    assert.equal(Real.hazeOf(0.3, 0, 0).amounts, undefined);
    const near = Real.hazeOf(1, 0, 0, true);
    assert.deepEqual(near.amounts, [0, 0, 0]);
    assert.equal(near.amount, 0);
    for (const z of [0, 0.25, 0.5, 0.75]) {
        const h = Real.hazeOf(z, 0, 0, true);
        assert.ok(h.amounts[0] + 1e-9 >= h.amounts[1] && h.amounts[1] + 1e-9 >= h.amounts[2], `z=${z} 红≥绿≥蓝`);
        const mean = (h.amounts[0] + h.amounts[1] + h.amounts[2]) / 3;
        assert.ok(Math.abs(mean - h.amount) < 1e-9 || h.amounts[0] >= 0.919, `z=${z} 均值≈amount 或红触顶`);
        assert.equal(h.amount, Real.hazeOf(z, 0, 0).amount, `z=${z} 总量与不开 absorb 一致`);
    }
});

test('draw：先平移旋转，再按 体长/100 缩放并翻面，在 source-over 下画骨架，最后还原；返回 true', () => {
    const ctx = recorder();
    const fish = fishOf('manta', { x: 300, y: 120, ang: -0.5 });
    assert.equal(Real.draw(ctx, fish, baseOpts(96, { flip: -1 })), true);
    const n = names(ctx);
    assert.equal(n[0], 'save');
    assert.equal(n.at(-1), 'restore');
    assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
    const translate = ctx._calls.find(([name]) => name === 'translate');
    assert.deepEqual(translate[1], [300, 120]);
    assert.deepEqual(ctx._calls.find(([name]) => name === 'rotate')[1], [-0.5]);
    const scale = ctx._calls.find(([name]) => name === 'scale')[1];
    const rig = Data.rig('manta');
    const k = 96 / (rig.snout - rig.tail);
    assert.ok(Math.abs(scale[0] - k) < 1e-12 && Math.abs(scale[1] + k) < 1e-12, `scale ${scale}`);
    assert.ok(n.indexOf('translate') < n.indexOf('rotate') && n.indexOf('rotate') < n.indexOf('scale'));
    const composite = ctx._calls.filter(([name, a]) => name === 'set:globalCompositeOperation');
    assert.deepEqual(composite.map(c => c[1][0]), ['source-over'], '写实动物有深色，要在 source-over 下画');
    assert.ok(n.indexOf('scale') < n.indexOf('set:globalCompositeOperation'));
    assert.ok(count(ctx, 'fill') >= 10 && count(ctx, 'stroke') >= 1);
    const ops = Rig.evaluate(rig, Real.poseOf(fish, baseOpts(96, { flip: -1 }))).ops;
    assert.equal(count(ctx, 'fill'), ops.filter(o => o.k === 'fill').length, '每个填充 op 恰好填一次');
    assert.equal(count(ctx, 'stroke'), ops.filter(o => o.k === 'stroke').length, '每个描边 op 恰好描一次');
    assert.equal(count(ctx, 'createLinearGradient'), ops.filter(o => o.paint && o.paint.grad).length, '渐变数与 op 里的渐变一致');
});

test('draw：夜里或刚吃到饲料时先画一圈光晕（省流量没有）；光晕在缩放之前画，大小按体长', () => {
    const night = recorder();
    Real.draw(night, fishOf('hammer'), baseOpts(112, { night: 0.8 }));
    const radial = night._calls.findIndex(([name]) => name === 'createRadialGradient');
    assert.ok(radial >= 0);
    assert.ok(radial < names(night).indexOf('scale'), '光晕在缩放之前，半径按像素');
    assert.equal(night._calls[radial][1][5], 112 * 0.95);
    const day = recorder();
    Real.draw(day, fishOf('hammer'), baseOpts(112));
    assert.equal(count(day, 'createRadialGradient'), 0, '白天没吃东西没有光晕');
    const fed = recorder();
    Real.draw(fed, fishOf('hammer'), baseOpts(112, { fed: 1 }));
    assert.equal(count(fed, 'createRadialGradient'), 1, '吃到饲料有光晕');
    const low = recorder();
    Real.draw(low, fishOf('hammer'), baseOpts(112, { night: 1, fed: 1, lowPower: true }));
    assert.equal(count(low, 'createRadialGradient'), 0, '省流量没有光晕');
});

test('draw：不透明度由鱼的淡入淡出、深度、背景强度共同决定；几乎透明时一笔不画但仍返回 true；未知种类返回 false', () => {
    const alphas = (opts, fishExtra) => {
        const ctx = recorder();
        Real.draw(ctx, fishOf('whaleshark', fishExtra), baseOpts(130, opts));
        const fills = ctx._calls.filter(([n]) => n === 'set:fillStyle').map(([, a]) => a[0]).filter(v => typeof v === 'string');
        return Math.max(...fills.map(c => Number(/, ([\d.]+)\)$/.exec(c)[1])));
    };
    const full = alphas({ amount: 1 }, { z: 1 });
    assert.ok(full <= 1 && full > 0.5, `近处满强度：${full}`);
    assert.ok(alphas({ amount: 1 }, { z: 0.35 }) < full, '远处更淡');
    assert.ok(alphas({ amount: 0.2 }, { z: 1 }) < full, '背景强度低更淡');
    assert.ok(alphas({ amount: 1, alpha: 0.4 }, { z: 1 }) < full, '淡入中更淡');
    const gone = recorder();
    assert.equal(Real.draw(gone, fishOf('whaleshark'), baseOpts(130, { alpha: 0 })), true);
    assert.equal(gone._calls.length, 0, '透明度为 0 时不碰画布');
    assert.equal(Real.draw(recorder(), fishOf('neon'), baseOpts(16)), false, '没有写实数据的种类');
});

test('draw：画布抛异常时 save/restore 仍配对（画布状态不被污染），异常向上抛给调用方', () => {
    for (const throwOn of ['fill', 'createLinearGradient', 'stroke', 'scale', 'rotate']) {
        const ctx = recorder({ throwOn });
        assert.throws(() => Real.draw(ctx, fishOf('hammer'), baseOpts(112)), new RegExp(throwOn), throwOn);
        assert.equal(count(ctx, 'save'), count(ctx, 'restore'), `${throwOn}：配对`);
        assert.ok(count(ctx, 'save') === 1);
    }
});

test('draw：非有限的鱼状态不会抛错也不污染画布（NaN 位置/朝向/相位）', () => {
    const ctx = recorder();
    assert.doesNotThrow(() => Real.draw(ctx, fishOf('turtle', { x: NaN, y: Infinity, ang: NaN, phase: NaN, turn: NaN, vx: NaN }), baseOpts(70)));
    assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
});

// ---------- 画笔（js/marine-rig-canvas.js） ----------

test('画笔 css：把 0…1 的分量转成 rgba，alpha 乘缩放；tint 把颜色向水色混合，不透明度不变', () => {
    assert.equal(Painter.css([1, 0.5, 0, 1], 1), 'rgba(255, 128, 0, 1.000)');
    assert.equal(Painter.css([1, 0.5, 0, 0.5], 0.5), 'rgba(255, 128, 0, 0.250)');
    assert.equal(Painter.css([2, -1, 0.5, 9], 1), 'rgba(255, 0, 128, 1.000)', '越界夹住');
    assert.equal(Painter.css([1, 1, 1, 1], 1, { rgb: [0, 0, 0], amount: 0.5 }), 'rgba(128, 128, 128, 1.000)');
    assert.equal(Painter.css([1, 1, 1, 0.6], 1, { rgb: [0, 0, 0], amount: 0 }), 'rgba(255, 255, 255, 0.600)');
    assert.equal(Painter.css([1, 1, 1, 1], 1, { rgb: [0, 0, 0], amount: 5 }), 'rgba(0, 0, 0, 1.000)', '比例夹到 1');
    // amounts：三通道各自混合；红混得多、蓝混得少（水吸收红最快）
    assert.equal(Painter.css([1, 1, 1, 1], 1, { rgb: [0, 0, 0], amount: 0.5, amounts: [0.8, 0.4, 0.1] }), 'rgba(51, 153, 230, 1.000)');
    assert.equal(Painter.css([1, 1, 1, 1], 1, { rgb: [0, 0, 0], amount: 0.5, amounts: [0.5, 0.5, 0.5] }), 'rgba(128, 128, 128, 1.000)', 'amounts 全等时与 amount 一致');
});

test('画笔 drawOps：填充按规则、描边带线宽线帽、渐变用求值后的端点与色标；alpha 缩放所有颜色；alpha 为 0 不画', () => {
    const ops = [
        { k: 'fill', id: 'a', polys: [{ pts: [0, 0, 10, 0, 10, 10], closed: true }], rule: 'evenodd', paint: { rgba: [1, 0, 0, 1] } },
        { k: 'fill', id: 'b', polys: [{ pts: [0, 0, 5, 0, 5, 5], closed: true }], rule: 'nonzero', paint: { grad: { a: [0, 1], b: [2, 3], stops: [[0, 0, 0, 0, 1], [1, 1, 1, 1, 0.5]] } } },
        { k: 'stroke', id: 'c', polys: [{ pts: [0, 0, 4, 4], closed: false }, { pts: [1, 1, 3, 1, 3, 3], closed: true }], width: 1.5, rgba: [0, 0, 1, 0.8], cap: 'butt' },
    ];
    const ctx = recorder();
    Painter.drawOps(ctx, ops, { alpha: 0.5 });
    const fills = ctx._calls.filter(([n]) => n === 'fill');
    assert.deepEqual(fills.map(([, a]) => a[0]), ['evenodd', 'nonzero']);
    assert.deepEqual(ctx._calls.find(([n]) => n === 'createLinearGradient')[1], [0, 1, 2, 3]);
    const stops = ctx._calls.filter(([n]) => n === 'addColorStop');
    assert.equal(stops.length, 2);
    assert.match(stops[1][1][1], /, 0\.250\)$/, '色标不透明度 0.5 × alpha 0.5');
    const sets = Object.fromEntries(ctx._calls.filter(([n]) => n.startsWith('set:')).map(([n, a]) => [n.slice(4), a[0]]));
    assert.equal(sets.lineWidth, 1.5);
    assert.equal(sets.lineCap, 'butt');
    assert.equal(sets.lineJoin, 'round');
    assert.match(sets.strokeStyle, /, 0\.400\)$/, '描边不透明度 0.8 × 0.5');
    assert.equal(count(ctx, 'closePath'), 3, '两条闭合路径的填充 + 描边里那条闭合子路径；开放线不闭合');
    assert.equal(count(ctx, 'beginPath'), 3, '一个 op 一次 beginPath');
    const none = recorder();
    Painter.drawOps(none, ops, { alpha: 0 });
    assert.equal(none._calls.length, 0);
    const tinted = recorder();
    Painter.drawOps(tinted, ops, { alpha: 1, tint: { rgb: [0, 0, 0], amount: 1 } });
    assert.ok(tinted._calls.filter(([n]) => n === 'set:fillStyle').every(([, a]) => typeof a[0] !== 'string' || /^rgba\(0, 0, 0,/.test(a[0])), 'tint=1 时颜色全部变成水色');
});

test('画笔：少于两个点的子路径被跳过；未知描边线帽按 round', () => {
    const ctx = recorder();
    Painter.drawOps(ctx, [{ k: 'stroke', id: 's', polys: [{ pts: [1, 1], closed: false }, { pts: [0, 0, 1, 1], closed: false }], width: 1, rgba: [0, 0, 0, 1], cap: 'weird' }], {});
    assert.equal(count(ctx, 'moveTo'), 1);
    assert.equal(ctx._calls.find(([n]) => n === 'set:lineCap')[1][0], 'round');
});

// ---------- aquarium.js 接线 ----------

test('drawFish：view.real 为真时用写实画法；为假时有卡通形状的种类仍是卡通，海龟（没有卡通形状）永远写实', () => {
    const draw = (species, view) => {
        const ctx = recorder();
        Aquarium.drawFish(ctx, fishOf(species), PALETTE, Object.assign({ amount: 0.9, night: 0, lowPower: false, scale: 1 }, view));
        return ctx;
    };
    const realHammer = draw('hammer', { real: true });
    const rig = Data.rig('hammer');
    const scale = realHammer._calls.find(([n]) => n === 'scale')[1];
    assert.ok(Math.abs(scale[0] - (Core.speciesById('hammer').len * 2 / (rig.snout - rig.tail))) < 1e-9, '写实：按 体长/骨架长度 缩放');
    const cartoonHammer = draw('hammer', { real: false });
    assert.deepEqual(cartoonHammer._calls.find(([n]) => n === 'scale')[1], [1, 1], '卡通：只翻面，不缩放');
    const noFlag = draw('hammer', {});
    assert.deepEqual(noFlag._calls.find(([n]) => n === 'scale')[1], [1, 1], '没有 real 标记时保持原来的卡通画法（旧调用方不受影响）');
    for (const real of [true, false, undefined]) {
        const turtle = draw('turtle', { real });
        assert.ok(turtle._calls.length > 20, `海龟 real=${real} 也要画出来`);
        const turtleRig = Data.rig('turtle');
        const sc = turtle._calls.find(([n]) => n === 'scale')[1];
        assert.ok(Math.abs(sc[0] - Core.speciesById('turtle').len * 2 / (turtleRig.snout - turtleRig.tail)) < 1e-9, '海龟走写实缩放（体长 / 骨架长度）');
    }
    for (const species of ['neon', 'tang', 'clown', 'puffer', 'angel']) {
        assert.deepEqual(draw(species, { real: true })._calls.find(([n]) => n === 'scale')[1], [1, 1], `${species} 没有写实数据，仍是卡通`);
    }
});

test('drawFish：翻面（含缓动中间值）、被捞起缩小、拉尾都传给写实画法；save/restore 配对', () => {
    const ctx = recorder();
    Aquarium.drawFish(ctx, fishOf('whaleshark', { flip: -0.5, scoopT: 1 }), PALETTE, { amount: 0.9, night: 0, lowPower: false, scale: 1, real: true });
    const [kx, ky] = ctx._calls.find(([n]) => n === 'scale')[1];
    const rig = Data.rig('whaleshark');
    const expectedLen = Core.speciesById('whaleshark').len * 2 * (1 - Core.PARAMS.SCOOP_SHRINK);
    assert.ok(Math.abs(kx - expectedLen / (rig.snout - rig.tail)) < 1e-9, '被捞到最后缩小');
    assert.ok(Math.abs(ky / kx + 0.5) < 1e-9, '翻面用当前面（缓动值）');
    assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
    const plain = recorder();
    const pulled = recorder();
    const f = fishOf('hammer');
    const view = { amount: 0.9, night: 0, lowPower: false, scale: 1, real: true };
    Aquarium.drawFish(plain, f, PALETTE, view, { pull: null, fed: 0 });
    Aquarium.drawFish(pulled, f, PALETTE, view, { pull: { x: -6, y: 3 }, fed: 0 });
    assert.notEqual(JSON.stringify(plain._calls), JSON.stringify(pulled._calls), '拉尾改变了画出来的形状');
    const zero = recorder();
    Aquarium.drawFish(zero, f, PALETTE, view, { pull: { x: 0, y: 0 }, fed: 0 });
    assert.equal(JSON.stringify(zero._calls), JSON.stringify(plain._calls), '零位移的拉尾与没有拉尾完全一样');
});

test('drawFish：A 太小（几乎透明）直接不画，写实与卡通一样', () => {
    const ctx = recorder();
    Aquarium.drawFish(ctx, fishOf('whaleshark', { alpha: 0 }), PALETTE, { amount: 0.9, night: 0, lowPower: false, scale: 1, real: true });
    assert.equal(ctx._calls.length, 0);
});

test('出错退路：写实画法抛异常后，本页面不再用它——有卡通形状的退回卡通，海龟不画；回调收到错误；画布配对', () => {
    const file = require.resolve('../js/aquarium.js');
    const saved = require.cache[file];
    delete require.cache[file];
    try {
        const Fresh = require('../js/aquarium.js');       // 全新实例：realBroken 是模块级状态，不能污染其他测试
        const errors = [];
        const view = { amount: 0.9, night: 0, lowPower: false, scale: 1, real: true, onRealError: error => errors.push(String(error.message)) };
        const bad = recorder({ throwOn: 'createLinearGradient', once: true });     // 只抛一次：随后卡通画法自己的渐变要能正常画
        Fresh.drawFish(bad, fishOf('hammer'), PALETTE, view);
        assert.equal(errors.length, 1);
        assert.match(errors[0], /createLinearGradient/);
        assert.equal(count(bad, 'save'), count(bad, 'restore'), '出错时画布状态已还原（卡通画法随后的 save/restore 也配对）');
        assert.ok(bad._calls.some(([n, a]) => n === 'scale' && a[0] === 1 && a[1] === 1), '同一帧里这条鱼退回了卡通画法');
        const good = recorder();
        Fresh.drawFish(good, fishOf('hammer'), PALETTE, view);
        assert.equal(errors.length, 1, '之后不再尝试写实画法');
        assert.deepEqual(good._calls.find(([n]) => n === 'scale')[1], [1, 1]);
        const turtle = recorder();
        Fresh.drawFish(turtle, fishOf('turtle'), PALETTE, view);
        assert.equal(turtle._calls.length, 0, '海龟没有卡通画法：不画，也不抛错');
        const whale = recorder();
        Fresh.drawFish(whale, fishOf('whaleshark'), PALETTE, view);
        assert.deepEqual(whale._calls.find(([n]) => n === 'scale')[1], [1, 1], '其余写实种类也退回卡通');
    } finally {
        delete require.cache[file];
        if (saved) require.cache[file] = saved;
    }
});

test('性能护栏（确定性，不计时）：求值走站位表——一次求值调用的三角函数/幂次数有上限，且远少于逐点精确公式', () => {
    const counters = { sin: 0, cos: 0, pow: 0 };
    const saved = { sin: Math.sin, cos: Math.cos, pow: Math.pow };
    const wrap = name => { Math[name] = (...args) => { counters[name]++; return saved[name](...args); }; };
    const measure = fn => {
        for (const k of Object.keys(counters)) counters[k] = 0;
        wrap('sin'); wrap('cos'); wrap('pow');
        try { fn(); } finally { Object.assign(Math, saved); }
        return counters.sin + counters.cos + counters.pow;
    };
    for (const id of Real.ids()) {
        const rig = Data.rig(id);
        const pose = { phase: 1.1, amp: 0.8, turn: 0.2, lod: 2 };
        const table = measure(() => Rig.evaluate(rig, pose));
        const exact = measure(() => Rig.evaluateExact(rig, pose));
        assert.ok(table < 3000, `${id}：一次求值 ${table} 次 sin/cos/pow（站位表约 1400–2100），不得退回逐点精确公式`);
        assert.ok(exact > table * 2.5, `${id}：精确公式 ${exact} 次对站位表 ${table} 次，站位表应当省掉大部分`);
    }
});

test('源码合同：写实画法模块不碰 DOM/存储/网络/时钟/随机数/定时器，不自建画布；水族馆控制器只通过 AquariumReal 接入', () => {
    for (const file of ['js/aquarium-real.js', 'js/marine-rig-canvas.js']) {
        const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8').replace(/\/\/.*$/gm, '');
        assert.doesNotMatch(text, /\bdocument\b|\bwindow\b|chrome\.|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|requestAnimationFrame|setTimeout|setInterval|Math\.random|Date\.now|new Date|innerHTML|eval\(|new Function|createElement/, file);
    }
    const aq = fs.readFileSync(path.join(__dirname, '../js/aquarium.js'), 'utf8');
    assert.match(aq, /root\.AquariumReal/);
    assert.doesNotMatch(aq, /MarineRig|marine-rig/, '控制器不直接依赖骨架模块，只认 AquariumReal');
    for (const file of ['js/jellyfish.js', 'js/jellyfish-core.js']) assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), /AquariumReal|MarineRig/, `${file}：水母不认识写实动物`);
});

test('验收诊断：state().realFailed 在写实画法抛异常之后为 true，realDrawn 回到 0（全新模块实例，不污染其他测试）', () => {
    const file = require.resolve('../js/aquarium.js');
    const saved = require.cache[file];
    delete require.cache[file];
    try {
        const Fresh = require('../js/aquarium.js');
        const store = { aquariumV1: { v: 1, fish: [{ id: 'h1', species: 'hammer', addedAt: 1 }] } };
        const chrome = { storage: { local: { get: async key => (key in store ? { [key]: store[key] } : {}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } };
        const aq = Fresh.create({ chrome, document: null, window: {}, random: () => 0.5, wall: () => 1, warn: () => {}, now: () => 0, palette: PALETTE });
        aq.start();
        return new Promise(resolve => setImmediate(resolve)).then(async () => {
            for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
            assert.deepEqual([aq.state().realDrawn, aq.state().realFailed], [0, false], '开始时');
            const good = recorder();
            aq.frame({ ctx: good, width: 1280, height: 720, dt: 16, pointer: null, lowPower: false, amount: 0.65, bells: [], realistic: true });
            assert.deepEqual([aq.state().realDrawn, aq.state().realFailed], [1, false], '正常画出一条写实鱼');
            const bad = recorder({ throwOn: 'createLinearGradient', once: true });
            aq.frame({ ctx: bad, width: 1280, height: 720, dt: 16, pointer: null, lowPower: false, amount: 0.65, bells: [], realistic: true });
            assert.equal(aq.state().realFailed, true, '写实画法出错之后本页面不再用它');
            assert.equal(aq.state().realDrawn, 0, '出错那一帧这条鱼退回了卡通，不算写实');
            aq.frame({ ctx: recorder(), width: 1280, height: 720, dt: 16, pointer: null, lowPower: false, amount: 0.65, bells: [], realistic: true });
            assert.deepEqual([aq.state().realDrawn, aq.state().realFailed], [0, true], '之后一直是卡通');
        }).finally(() => {
            delete require.cache[file];
            if (saved) require.cache[file] = saved;
        });
    } catch (error) {
        delete require.cache[file];
        if (saved) require.cache[file] = saved;
        throw error;
    }
});

// ---------- 接线合同与退路（变异检查补的缺口） ----------

/** 全新加载一个模块，并临时用替身顶掉它依赖的模块（stubs: { 相对路径: exports }）；加载完立刻还原 require 缓存，不污染别的测试。 */
function loadFresh(file, stubs = {}) {
    const target = require.resolve(file);
    const saved = new Map();
    for (const f of [target, ...Object.keys(stubs).map(key => require.resolve(key))]) saved.set(f, require.cache[f]);
    delete require.cache[target];
    for (const [key, exports] of Object.entries(stubs)) {
        const f = require.resolve(key);
        require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] };
    }
    try { return require(file); } finally {
        for (const [f, cached] of saved) { if (cached) require.cache[f] = cached; else delete require.cache[f]; }
    }
}

function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function aquariumWith(mod, fish, env = {}) {
    const store = { aquariumV1: { v: 1, fish } };
    const chrome = { storage: { local: { get: async key => (key in store ? { [key]: store[key] } : {}), set: async () => {} }, onChanged: { addListener() {}, removeListener() {} } } };
    const aq = mod.create(Object.assign({ chrome, document: null, window: {}, random: seeded(7), wall: () => 1, warn: () => {}, now: () => 0, palette: PALETTE }, env));
    aq.start();
    for (let i = 0; i < 9; i++) await new Promise(resolve => setImmediate(resolve));
    return aq;
}
const frameOf = (aq, ctx, extra = {}) => aq.frame(Object.assign({ ctx, width: 1280, height: 720, dt: 16, pointer: null, lowPower: false, amount: 0.65, bells: [], realistic: true }, extra));

test('aquarium.js：侧视大个子转身时——卡通画法沿屏幕横向缩短身体（缩放量就是核心给的 xs）；写实画法改用伪 3D 投影（不再压扁，鼻朝右的等价画面 + 换面镜像 + 俯仰角）', async () => {
    const mod = loadFresh('../js/aquarium.js');
    for (const realistic of [true, false]) {
        const aq = await aquariumWith(mod, [{ id: 'w1', species: 'whaleshark', addedAt: 1 }]);
        frameOf(aq, recorder(), { realistic, night: false });               // 建立世界
        const fish = aq._world().fish[0];
        fish.yaw = 0.3;                                                     // 转到一半：沿屏幕横向的投影 |cos(0.3π)| ≈ 0.59
        const turning = recorder();
        frameOf(aq, turning, { realistic, night: false });
        assert.ok(fish.xs > 0.5 && fish.xs < 0.7, `xs ${fish.xs}`);
        const moves = turning._calls.filter(([name]) => name === 'translate' || name === 'scale' || name === 'rotate');
        if (!realistic) {
            const seq = turning._calls.map(([name]) => name);
            const iS = seq.indexOf('scale');
            assert.ok(iS >= 0 && iS < seq.indexOf('rotate'), '卡通：转身中，旋转之前缩放');
            assert.deepEqual(turning._calls[iS][1], [fish.xs, 1], '缩放量就是核心给的 xs');
            continue;
        }
        const state = Yaw.stateOf(fish);
        assert.ok(state && Math.abs(state.theta - Math.PI * 0.3) < 0.05, `前置条件：转到约 0.3π：${state && state.theta}`);
        assert.deepEqual(moves[0], ['translate', [fish.x, fish.y]]);
        let i = 1;
        if (state.mirror) { assert.deepEqual(moves[i], ['scale', [-1, 1]], '换面之后整体水平镜像'); i++; }
        assert.equal(moves[i][0], 'rotate');
        assert.equal(moves[i][1][0], state.pitch, '按鼻朝右的等价俯仰角转，不是 fish.ang');
        assert.equal(moves[i + 1][0], 'scale');
        assert.ok(moves[i + 1][1][0] > 0 && moves[i + 1][1][0] === moves[i + 1][1][1], '体长换算：x、y 等比、都为正（翻面已经在投影里处理）');
        assert.ok(!moves.some(([name, args]) => name === 'scale' && args[1] === 1 && Math.abs(args[0] - fish.xs) < 1e-9), '写实画法转身不再沿屏幕横向压扁');
        assert.equal(moves.length, i + 2, '没有别的变换（夜晚光晕关了）');
    }
});

test('FREQ：相位倍率是登记的调参值（越大的动物拍得越慢），改动要同步技术文档的表', () => {
    assert.deepEqual({ ...Real.FREQ }, { hammer: 0.7, manta: 0.55, turtle: 0.5, whaleshark: 0.42 });
    assert.ok(Real.FREQ.hammer > Real.FREQ.manta && Real.FREQ.manta > Real.FREQ.turtle && Real.FREQ.turtle > Real.FREQ.whaleshark);
});

test('夜里与吃饲料的光晕：用传入的光晕色，强度随夜晚与饲料；白天、省流量没有', () => {
    const night = recorder();
    assert.equal(Real.draw(night, fishOf('hammer'), baseOpts(100, { night: 1, color: [10, 20, 30] })), true);
    const first = night._calls.findIndex(([name]) => name === 'createRadialGradient');
    assert.ok(first >= 0, '夜里有光晕');
    const stops = night._calls.slice(first).filter(([name]) => name === 'addColorStop').slice(0, 2).map(([, [, color]]) => color);   // 光晕是第一条径向渐变，其后两个色标
    assert.equal(stops.length, 2);
    assert.match(stops[0], /^rgba\(10, 20, 30, 0\.\d+\)$/, '光晕色取传入的颜色');
    const centre = Number(/, ([0-9.]+)\)$/.exec(stops[0])[1]);
    assert.ok(centre > 0.1 && centre <= 0.2, `夜里光晕中心不透明度 ${centre}`);
    assert.equal(stops[1], 'rgba(10, 20, 30, 0)', '边缘完全透明');
    for (const options of [{ night: 0 }, { night: 1, lowPower: true }]) {
        const ctx = recorder();
        Real.draw(ctx, fishOf('hammer'), baseOpts(100, options));
        assert.equal(count(ctx, 'createRadialGradient'), 0, `${JSON.stringify(options)} 没有光晕`);
    }
    const fed = recorder();
    Real.draw(fed, fishOf('hammer'), baseOpts(100, { night: 0, fed: 1 }));
    assert.equal(count(fed, 'createRadialGradient'), 1, '刚吃到饲料的鱼白天也有光晕');
});

test('has()/ids()/draw()：骨架数据编译失败的种类按“没有写实数据”处理——调用方退回原画法', () => {
    const stubData = Object.assign({}, Data, { rig: id => (id === 'turtle' ? null : Data.rig(id)) });
    const Fresh = loadFresh('../js/aquarium-real.js', { '../js/marine-rig-data.js': stubData });
    assert.equal(Fresh.has('turtle'), false, '数据不可用');
    assert.equal(Fresh.has('hammer'), true);
    assert.deepEqual(Fresh.ids().sort(), ['hammer', 'manta', 'whaleshark']);
    const ctx = recorder();
    assert.equal(Fresh.draw(ctx, fishOf('turtle'), baseOpts(100)), false, '数据不可用：不画、返回 false');
    assert.deepEqual(names(ctx), [], '没有任何画布调用');
});

test('aquarium.js 传给写实画法的参数：各自按来源传（长度、翻面、饲料、远近、夜晚、强度、省流量、速度参照随视口缩放、光晕色、鱼自己的淡入淡出）', async () => {
    const calls = [];
    const stub = {
        has: id => id === 'hammer' || id === 'turtle', ids: () => ['hammer', 'turtle'],
        draw: (ctx, fish, o) => { calls.push({ species: fish.species, z: fish.z, alpha: fish.alpha, len: fish.len, o }); return true; },
    };
    const mod = loadFresh('../js/aquarium.js', { '../js/aquarium-real.js': stub });
    const fish = ['hammer', 'turtle', 'hammer', 'turtle', 'hammer', 'turtle'].map((species, i) => ({ id: `f${i}`, species, addedAt: i + 1 }));
    const aq = await aquariumWith(mod, fish, { nightAmount: () => 0.8 });
    for (let i = 0; i < 4; i++) frameOf(aq, recorder(), { width: 640, height: 360, dt: 50 });           // 先让世界建立
    assert.equal((await aq.add('hammer')).ok, true);                                                       // 新放入的鱼才有淡入（读存储的鱼立即可见）
    for (let i = 0; i < 12; i++) frameOf(aq, recorder(), { width: 640, height: 360, dt: 50 });
    const world = aq._world();
    assert.notEqual(world.scale, 1, '视口缩放不是 1，才分得出速度参照乘没乘缩放');
    assert.ok(calls.length > 0, '写实画法被调用');
    for (const call of calls) {
        const spec = Core.speciesById(call.species);
        assert.equal(call.o.speed, spec.speed * world.scale, '速度参照 = 该种巡航速度 × 视口缩放');
        assert.equal(call.o.alpha, call.alpha, '鱼自己的淡入淡出原样传');
        assert.equal(call.o.far, call.z < 0.55, '远处（z < 0.55）才是 far');
        assert.equal(call.o.night, 0.8, '夜晚程度取自注入的曲线');
        assert.equal(call.o.amount, 0.65);
        assert.equal(call.o.lowPower, false);
        assert.equal(call.o.fed, 0);
        assert.equal(call.o.len, call.len, '没有被捞起：按原大小');
        assert.ok(Array.isArray(call.o.color) && call.o.color.length === 3, '光晕色是该种的主色');
        assert.ok(Math.abs(call.o.flip) >= 0.06 && Math.abs(call.o.flip) <= 1);
    }
    assert.ok(calls.some(call => call.alpha > 0 && call.alpha < 1), '淡入期里 alpha 在 0 与 1 之间（否则“原样传 alpha”看不出来）');
    assert.ok(calls.some(call => call.o.far === true) && calls.some(call => call.o.far === false), '远与近两种都出现过');

    const before = calls.length;
    for (let i = 0; i < 3; i++) frameOf(aq, recorder(), { width: 640, height: 360, dt: 50, lowPower: true });
    const low = calls.slice(before);
    assert.ok(low.length > 0);
    assert.ok(low.every(call => call.o.lowPower === true && call.o.far === true), '省流量：lowPower 传下去，且都按远处处理');
});

test('写实画法出错之后：海龟没有卡通画法，不画，也不拖垮整个鱼层（居民与存储不变）', async () => {
    const mod = loadFresh('../js/aquarium.js');
    const aq = await aquariumWith(mod, [{ id: 't1', species: 'turtle', addedAt: 1 }]);
    for (let i = 0; i < 14; i++) frameOf(aq, recorder(), { dt: 50 });
    assert.equal(aq.state().realDrawn, 1, '先正常画出海龟');
    const bad = recorder({ throwOn: 'fill', once: true });
    frameOf(aq, bad, { dt: 16 });
    assert.equal(aq.state().realFailed, true, '写实画法出错，本页面不再用它');
    assert.equal(aq.state().failed, false, '鱼层没有被拖垮');
    assert.equal(aq.state().entries, 1, '居民不变');
    assert.equal(aq.state().realDrawn, 0);
    const next = recorder();
    assert.ok(frameOf(aq, next, { dt: 16 }), '之后的帧照常');
    assert.equal(aq.state().failed, false);
    assert.equal(count(next, 'fill') + count(next, 'stroke'), 0, '海龟没有卡通画法：之后不画');
});


// ---------- 侧视大个子转身的伪 3D 投影接线（js/aquarium-yaw.js；模块本身的几何见 test/aquarium-yaw.test.js） ----------

/** 全新的 aquarium-real.js，顶掉投影模块与画笔：返回 { Fresh, yawCalls, painted, warns }。 */
function realWith({ yaw, painter } = {}) {
    const yawCalls = { has: [], stateOf: [], project: [] };
    const painted = [];
    const spyYaw = Object.assign({}, Yaw, {
        has: id => { yawCalls.has.push(id); return Yaw.has(id); },
        stateOf: fish => { yawCalls.stateOf.push(fish); return Yaw.stateOf(fish); },
        project: (ops, id, theta) => { yawCalls.project.push({ ops, id, theta }); return Yaw.project(ops, id, theta); },
    }, yaw || {});
    const spyPainter = Object.assign({}, Painter, { drawOps: (ctx, ops, opts) => { painted.push({ ops, opts }); return Painter.drawOps(ctx, ops, opts); } }, painter || {});
    const Fresh = loadFresh('../js/aquarium-real.js', { '../js/aquarium-yaw.js': spyYaw, '../js/marine-rig-canvas.js': spyPainter });
    return { Fresh, yawCalls, painted };
}
const turningFish = (species, extra = {}) => fishOf(species, Object.assign({ yaw: 0.3, face: 1, ang: 0.2, xs: Math.abs(Math.cos(Math.PI * 0.3)) }, extra));
const movesOf = ctx => ctx._calls.filter(([name]) => name === 'translate' || name === 'scale' || name === 'rotate' || name === 'save' || name === 'restore');

test('转身投影：近处、不省流量、在转身的侧视大个子——投影结果就是交给画笔的图层；变换是 平移 → [镜像] → 俯仰角 → 体长缩放，不再压扁、不再转 fish.ang', () => {
    for (const species of ['hammer', 'whaleshark']) {
        const { Fresh, yawCalls, painted } = realWith();
        const ctx = recorder();
        const fish = turningFish(species);
        const len = Core.speciesById(species).len * 2;
        assert.equal(Fresh.draw(ctx, fish, baseOpts(len)), true);
        assert.equal(yawCalls.project.length, 1, `${species}：投影了一次`);
        const state = Yaw.stateOf(fish);
        assert.equal(yawCalls.project[0].id, species);
        assert.equal(yawCalls.project[0].theta, state.theta);
        assert.ok(Array.isArray(yawCalls.project[0].ops) && yawCalls.project[0].ops.length > 10, '输入是骨架求值出的图层');
        assert.equal(painted.length, 1);
        assert.notEqual(painted[0].ops, yawCalls.project[0].ops, '画笔拿到的是投影之后的新图层，不是求值结果');
        assert.deepEqual(painted[0].ops, Yaw.project(yawCalls.project[0].ops, species, state.theta), '内容就是投影的结果');
        const moves = movesOf(ctx);
        assert.deepEqual(moves.map(([name]) => name), ['save', 'translate', 'rotate', 'scale', 'restore']);
        assert.deepEqual(moves[1][1], [fish.x, fish.y]);
        assert.equal(moves[2][1][0], state.pitch);
        const rig = Data.rig(species);
        const k = len / (rig.snout - rig.tail);
        assert.ok(Math.abs(moves[3][1][0] - k) < 1e-12 && moves[3][1][0] === moves[3][1][1]);
    }
});

test('转身投影：换面之后（face < 0）整体水平镜像再转等价俯仰角；不看 o.flip', () => {
    const { Fresh, yawCalls } = realWith();
    const ctx = recorder();
    const fish = turningFish('hammer', { face: -1, ang: Math.PI - 0.4, yaw: 0.8 });
    Fresh.draw(ctx, fish, baseOpts(140, { flip: -1 }));
    const state = Yaw.stateOf(fish);
    assert.equal(state.mirror, true);
    assert.ok(Math.abs(yawCalls.project[0].theta - Math.PI * 0.2) < 1e-12, 'yaw 0.8 → θ = π × (1 − 0.8)');
    const moves = movesOf(ctx);
    assert.deepEqual(moves.map(([name]) => name), ['save', 'translate', 'scale', 'rotate', 'scale', 'restore']);
    assert.deepEqual(moves[2][1], [-1, 1]);
    assert.equal(moves[3][1][0], state.pitch);
    const rig = Data.rig('hammer');
    assert.ok(moves[4][1][1] > 0 && Math.abs(moves[4][1][1] - 140 / (rig.snout - rig.tail)) < 1e-12, '翻面不再乘到体长缩放上');
});

test('转身投影：夜里或吃饲料的光晕随身体收窄——画在缩放之前，宽度 clamp(0.3 + 0.7|cosθ|, 0.3, 1)，用独立的 save/restore 包起来', () => {
    const { Fresh, yawCalls } = realWith();
    const ctx = recorder();
    Fresh.draw(ctx, turningFish('whaleshark', { yaw: 0.5 }), baseOpts(180, { night: 0.8 }));         // yaw 0.5 → θ = π/2，正对观众
    const moves = movesOf(ctx);
    assert.deepEqual(moves.map(([name]) => name), ['save', 'translate', 'save', 'scale', 'restore', 'rotate', 'scale', 'restore']);
    assert.ok(Math.abs(moves[3][1][0] - 0.3) < 1e-12 && moves[3][1][1] === 1, `正对时光晕收到 0.3：${moves[3][1]}`);
    assert.ok(names(ctx).indexOf('createRadialGradient') < names(ctx).indexOf('restore'));
    const side = recorder();
    Fresh.draw(side, turningFish('whaleshark', { yaw: 0.02 }), baseOpts(180, { night: 0.8 }));
    const sideScale = movesOf(side).find(([name]) => name === 'scale');
    assert.ok(sideScale[1][0] > 0.95 && sideScale[1][0] <= 1, `几乎是侧面时光晕几乎不收：${sideScale[1]}`);
    assert.equal(yawCalls.project.length, 2);
});

test('转身投影：不在转身、远处、省流量、没有投影数据的物种（蝠鲼、海龟）、模块缺席——都走原来的路径，一次投影都不做', () => {
    const run = (species, fish, opts, env) => {
        const w = realWith(env);
        const ctx = recorder();
        w.Fresh.draw(ctx, fish, opts);
        return { w, ctx };
    };
    const still = run('hammer', fishOf('hammer', { yaw: 0, face: 1, xs: 1 }), baseOpts(140));
    assert.equal(still.w.yawCalls.project.length, 0, '没在转身');
    assert.deepEqual(movesOf(still.ctx).map(([name]) => name), ['save', 'translate', 'rotate', 'scale', 'restore']);
    assert.deepEqual(still.ctx._calls.find(([name]) => name === 'rotate')[1], [0.3], '原路径转 fish.ang');
    const far = run('hammer', turningFish('hammer'), baseOpts(140, { far: true }));
    assert.equal(far.w.yawCalls.project.length, 0, '远处');
    assert.deepEqual(far.ctx._calls.find(([name]) => name === 'scale')[1], [turningFish('hammer').xs, 1], '远处仍然沿屏幕横向压扁');
    assert.equal(run('hammer', turningFish('hammer'), baseOpts(140, { lowPower: true })).w.yawCalls.project.length, 0, '省流量');
    for (const species of ['manta', 'turtle']) {
        const r = run(species, turningFish(species), baseOpts(96));
        assert.equal(r.w.yawCalls.project.length, 0, `${species}：俯视/不在登记表里`);
        assert.equal(r.w.yawCalls.stateOf.length, 0, `${species}：连转身状态都不去算`);
    }
    // 模块缺席（浏览器里脚本没加载成功）：整套转身退回压扁画法
    const none = loadFresh('../js/aquarium-real.js', { '../js/aquarium-yaw.js': null });
    const ctx = recorder();
    assert.equal(none.draw(ctx, turningFish('hammer'), baseOpts(140)), true);
    assert.deepEqual(ctx._calls.find(([name]) => name === 'scale')[1], [turningFish('hammer').xs, 1]);
});

test('转身投影出错：只退回压扁画法并警告一次，本页面之后不再投影（异常不向上抛，不拖垮鱼层）；画布状态成对', () => {
    const warns = [];
    const savedWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    try {
        let attempts = 0;
        const { Fresh } = realWith({ yaw: { project: () => { attempts++; throw new Error('投影坏了'); } } });
        for (let i = 0; i < 3; i++) {
            const ctx = recorder();
            assert.equal(Fresh.draw(ctx, turningFish('hammer'), baseOpts(140)), true);
            assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
            assert.deepEqual(ctx._calls.find(([name]) => name === 'scale')[1], [turningFish('hammer').xs, 1], `第 ${i + 1} 次：压扁画法`);
            assert.deepEqual(ctx._calls.find(([name]) => name === 'rotate')[1], [0.2]);
        }
        assert.equal(attempts, 1, '出错之后不再试');
        assert.equal(warns.length, 1);
        assert.ok(warns[0].includes('投影坏了') && warns[0].includes('退回压扁画法'), warns[0]);
    } finally { console.warn = savedWarn; }
});

test('转身投影：画笔抛异常时 save/restore 仍配对，异常照旧向上抛（由鱼层统一接住）', () => {
    const { Fresh } = realWith({ painter: { drawOps: () => { throw new Error('画笔坏了'); } } });
    const ctx = recorder();
    assert.throws(() => Fresh.draw(ctx, turningFish('whaleshark'), baseOpts(180)), /画笔坏了/);
    assert.equal(count(ctx, 'save'), count(ctx, 'restore'));
});

test('转身投影：源码合同——投影模块是纯几何，不碰 DOM/存储/网络/时钟/随机数/定时器；写实画法只通过它的公开接口调用', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'aquarium-yaw.js'), 'utf8');
    for (const banned of [/\bdocument\b/, /\bwindow\./, /\blocalStorage\b/, /\bchrome\./, /\bfetch\(/, /\bDate\b/, /Math\.random/, /\bsetTimeout\b/, /\bsetInterval\b/, /requestAnimationFrame/, /\beval\(/, /\bnew Function\b/]) {
        assert.ok(!banned.test(src.replace(/\/\/.*$/gm, '')), `不应出现 ${banned}`);
    }
    const real = fs.readFileSync(path.join(__dirname, '..', 'js', 'aquarium-real.js'), 'utf8');
    const used = Array.from(real.matchAll(/Yaw\.(\w+)/g), m => m[1]);
    for (const name of used) assert.ok(typeof Yaw[name] === 'function', `Yaw.${name} 是公开函数`);
    assert.ok(new Set(used).has('project') && new Set(used).has('stateOf') && new Set(used).has('has'));
});
