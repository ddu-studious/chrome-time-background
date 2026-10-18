// 水族馆的画法：各种鱼的辨识特征（登记表 + 几何辅助 + 绘制调用）与“远处/省流量不画细节”的成本规则。
// 画面好不好看靠真实 Chromium 截图判断；这里只守住不会悄悄丢失的结构：特征登记、几何落在身体上、远处不做昂贵操作、坏数据不抛错。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');
const Aquarium = require('../js/aquarium.js');

const { SHAPES, geometry, drawFish } = Aquarium;
const SPECIES = Core.SPECIES.map(s => s.id);
const PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];

function recorder() {
    const calls = [];
    const state = {};
    const ctx = new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => {
                calls.push([String(key), args]);
                return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop() {} } : undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
    return ctx;
}
const count = (ctx, name) => ctx._calls.filter(([n]) => n === name).length;

function fishOf(species, extra = {}) {
    const spec = Core.speciesById(species);
    return Object.assign({ species, x: 200, y: 150, ang: 0, len: spec.len * 3, z: 0.95, alpha: 1, phase: 1.1, turn: 0, flip: 1 }, extra);
}
const draw = (species, { extra = {}, lowPower = false, night = 0 } = {}) => {
    const ctx = recorder();
    drawFish(ctx, fishOf(species, extra), PALETTE, { amount: 0.9, night, lowPower });
    return ctx;
};

test('登记表：每种鱼有 5 个站位的正半宽，尾型合法；辨识特征已登记（小丑鱼 3 条白带、河豚有刺和胸鳍、神仙鱼高鳍有条纹和腹鳍丝、蝠鲼有头鳍）', () => {
    assert.deepEqual(Object.keys(SHAPES).sort(), [...SPECIES].sort());
    for (const [id, shape] of Object.entries(SHAPES)) {
        assert.equal(shape.half.length, 5, id);
        assert.ok(shape.half.every(v => Number.isFinite(v) && v > 0 && v < 0.5), `${id} 半宽`);
        assert.ok(['fork', 'round', 'shark', 'whip'].includes(shape.tail), `${id} 尾型`);
        assert.ok(shape.tailLen > 0 && shape.tailLen < 0.8, `${id} 尾长`);
    }
    assert.equal(SHAPES.clown.bands, 3);
    assert.equal(SHAPES.clown.pectoral, true);
    assert.ok(SHAPES.puffer.spines >= 10 && SHAPES.puffer.spines <= 24);
    assert.equal(SHAPES.puffer.pectoral, true);
    assert.ok(SHAPES.puffer.half[2] / 0.5 > 0.7, '河豚身体接近圆形：最厚处至少是体长一半的 70%');
    assert.ok(SHAPES.angel.stripes >= 3);
    assert.equal(SHAPES.angel.filament, true);
    assert.ok(SHAPES.angel.dorsal >= 0.45 && SHAPES.angel.anal >= 0.38, '神仙鱼的背鳍与臀鳍要高，才有三角形的轮廓');
    assert.ok(SHAPES.angel.sweep < 0, '神仙鱼的鳍向后掠');
    assert.equal(SHAPES.manta.cephalic, true);
    assert.equal(SHAPES.manta.wings, true);
});

test('几何：bandCenters 在身体中段等距排开；spineAt 在站位上取站位、站位之间线性插值、越界夹住', () => {
    assert.deepEqual(geometry.bandCenters(0), []);
    assert.deepEqual(geometry.bandCenters(1), [0.5]);
    const three = geometry.bandCenters(3);
    assert.equal(three.length, 3);
    assert.ok(Math.abs(three[0] - 0.2) < 1e-9 && Math.abs(three[1] - 0.5) < 1e-9 && Math.abs(three[2] - 0.8) < 1e-9);
    for (let i = 1; i < three.length; i++) assert.ok(three[i] > three[i - 1]);
    assert.deepEqual(geometry.bandCenters(-2), []);
    assert.deepEqual(geometry.bandCenters(NaN), []);

    const spine = [{ x: 50, y: 0 }, { x: 25, y: 4 }, { x: 0, y: 8 }, { x: -25, y: 12 }, { x: -50, y: 16 }];
    assert.deepEqual(geometry.spineAt(spine, 0), { x: 50, y: 0 });
    assert.deepEqual(geometry.spineAt(spine, 0.5), { x: 0, y: 8 });
    assert.deepEqual(geometry.spineAt(spine, 1), { x: -50, y: 16 });
    const mid = geometry.spineAt(spine, 0.125);
    assert.ok(Math.abs(mid.x - 37.5) < 1e-9 && Math.abs(mid.y - 2) < 1e-9);
    assert.deepEqual(geometry.spineAt(spine, -3), { x: 50, y: 0 });
    assert.deepEqual(geometry.spineAt(spine, 9), { x: -50, y: 16 });
    assert.deepEqual(geometry.spineAt(spine, NaN), { x: 50, y: 0 });
});

test('几何：spineMarks（河豚的刺）从身体轮廓上伸出、朝外且略向后、长度固定，上下交替，数量与登记一致', () => {
    const len = 100;
    const half = SHAPES.puffer.half;
    const straight = [0, 0.25, 0.5, 0.75, 1].map(u => ({ x: len * (0.5 - u), y: 0 }));
    const marks = geometry.spineMarks(straight, half, len, 12);
    assert.equal(marks.length, 12);
    let top = 0; let bottom = 0;
    for (const m of marks) {
        assert.ok([m.x1, m.y1, m.x2, m.y2].every(Number.isFinite));
        const u = (0.5 - m.x1 / len);
        assert.ok(u > 0.1 && u < 0.9, `刺在身体中段：u=${u}`);
        const h = geometry.halfAt(half, u) * len;
        assert.ok(Math.abs(Math.abs(m.y1) - h) < 1e-6, `刺的根在轮廓上：|y1|=${Math.abs(m.y1)}，半宽 ${h}`);
        assert.ok(Math.abs(m.y2) > Math.abs(m.y1), '朝外');
        assert.equal(Math.sign(m.y2), Math.sign(m.y1), '与根在身体同一侧');
        assert.ok(m.x2 <= m.x1 + 1e-9, '略向后');
        assert.ok(Math.abs(Math.hypot(m.x2 - m.x1, m.y2 - m.y1) - len * 0.07) < 1e-6, '长度固定');
        if (m.y1 < 0) top++; else bottom++;
    }
    assert.equal(top, 6);
    assert.equal(bottom, 6);
    assert.deepEqual(geometry.spineMarks(straight, half, len, 0), []);
    assert.deepEqual(geometry.spineMarks(straight, half, len, NaN), []);
});

test('几何：halfAt 在站位上取站位半宽，之间线性插值，越界夹住', () => {
    const half = [0.02, 0.2, 0.33, 0.22, 0.04];
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    assert.ok(near(geometry.halfAt(half, 0), 0.02));
    assert.ok(near(geometry.halfAt(half, 0.5), 0.33));
    assert.ok(near(geometry.halfAt(half, 1), 0.04));
    assert.ok(near(geometry.halfAt(half, 0.375), 0.265));
    assert.ok(near(geometry.halfAt(half, -1), 0.02));
    assert.ok(near(geometry.halfAt(half, 5), 0.04));
    assert.ok(near(geometry.halfAt(half, NaN), 0.02), '非法 u 当作 0');
});

test('绘制：所有种类 × 远近 × 省流量 × 翻面 × 被捞起，不抛错、save/restore 配对、所有数值有限', () => {
    for (const species of SPECIES) {
        for (const z of [0.35, 0.55, 0.95]) {
            for (const lowPower of [false, true]) {
                for (const flip of [1, -1, 0.3, 0]) {
                    for (const scoopT of [0, 0.6, 1]) {
                        const ctx = draw(species, { extra: { z, flip, scoopT, turn: 0.7 }, lowPower, night: 0.6 });
                        assert.equal(count(ctx, 'save'), count(ctx, 'restore'), `${species} z=${z} lowPower=${lowPower}`);
                        for (const [name, args] of ctx._calls) {
                            for (const a of args) assert.ok(typeof a !== 'number' || Number.isFinite(a), `${species} ${name}(${args.join(',')}) 含非有限数值`);
                        }
                    }
                }
            }
        }
    }
});

test('绘制成本：远处（z < 0.55）与省流量不做裁剪、不建渐变；近处才有细节，调用数明显更多', () => {
    for (const species of SPECIES) {
        const far = draw(species, { extra: { z: 0.3 } });
        const low = draw(species, { extra: { z: 1 }, lowPower: true });
        for (const [label, ctx] of [['远处', far], ['省流量', low]]) {
            assert.equal(count(ctx, 'clip'), 0, `${species} ${label}不裁剪`);
            assert.equal(count(ctx, 'createLinearGradient'), 0, `${species} ${label}不建线性渐变`);
            assert.equal(count(ctx, 'createRadialGradient'), 0, `${species} ${label}不建径向渐变`);
        }
        const near = draw(species, { extra: { z: 0.95 } });
        assert.ok(near._calls.length > far._calls.length, `${species} 近处比远处细节多（${near._calls.length} 对 ${far._calls.length}）`);
    }
});

test('绘制：近处的特征真的画出来——小丑鱼白带按身体裁剪、神仙鱼条纹裁剪且有腹鳍丝、河豚的刺与胸鳍、蝠鲼的头鳍', () => {
    const clown = draw('clown');
    assert.equal(count(clown, 'clip'), 1, '白带只画在身体里');
    assert.ok(count(clown, 'fillRect') >= SHAPES.clown.bands, '每条白带至少一次矩形填充');

    const angel = draw('angel');
    assert.equal(count(angel, 'clip'), 1, '条纹只画在身体里');
    assert.ok(count(angel, 'stroke') >= SHAPES.angel.stripes + 2, '条纹 + 腹鳍丝 + 轮廓');

    const puffer = draw('puffer');
    assert.ok(count(puffer, 'moveTo') >= SHAPES.puffer.spines + 3, '每根刺一次 moveTo，加上身体、尾、背鳍');
    assert.ok(count(puffer, 'ellipse') >= 1, '胸鳍');

    const manta = draw('manta');
    const flat = draw('manta', { extra: { z: 0.3 } });
    assert.ok(count(manta, 'quadraticCurveTo') > count(flat, 'quadraticCurveTo'), '近处多画头鳍');

    // 同样的鱼远处/省流量不画这些
    for (const species of ['clown', 'angel', 'puffer']) {
        assert.equal(count(draw(species, { extra: { z: 0.3 } }), 'clip'), 0);
    }
});

test('绘制：垂直翻面接近 0 时仍然只用一次 scale（不叠加），被捞起缩到最小时仍有有限的体长', () => {
    const ctx = draw('clown', { extra: { flip: 0, scoopT: 1 } });
    const scales = ctx._calls.filter(([n]) => n === 'scale');
    assert.equal(scales.length, 1);
    assert.ok(Math.abs(scales[0][1][1]) > 0);
    assert.ok(ctx._calls.length > 5);
});

// 宿主（background-experience.js）整张背景画布都在 globalCompositeOperation = 'screen' 下画：screen 只会变亮，
// 深色（眼睛、白带的黑边、神仙鱼的深色竖纹）在 screen 下什么也加不上——整条鱼没有眼睛，纹路发灰。
// 所以这些暗色细节必须临时切到 source-over 才看得见，画完还原，否则会污染后面画的水母。
function tracer(initial = 'screen') {
    const trace = [];
    const stack = [];
    const state = { globalCompositeOperation: initial };
    return new Proxy(state, {
        get(target, key) {
            if (key === '_trace') return trace;
            if (key in target) return target[key];
            return (...args) => {
                const name = String(key);
                if (name === 'save') stack.push(target.globalCompositeOperation);
                else if (name === 'restore') { if (stack.length) target.globalCompositeOperation = stack.pop(); }
                else if (/^create(Linear|Radial)Gradient$/.test(name)) return { addColorStop() {} };
                else if (name === 'fill' || name === 'stroke' || name === 'fillRect') {
                    trace.push({ name, style: name === 'stroke' ? target.strokeStyle : target.fillStyle, composite: target.globalCompositeOperation });
                }
                return undefined;
            };
        },
        set(target, key, value) { target[key] = value; return true; },
    });
}
const isDarkStyle = style => {
    const m = typeof style === 'string' && /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style);
    return !!m && Number(m[1]) < 80 && Number(m[2]) < 80 && Number(m[3]) < 80;
};

test('混合模式：暗色细节（眼睛、白带黑边、深色竖纹）在 source-over 下画，身体与鳍仍在宿主的 screen 下画，画完还原', () => {
    for (const species of SPECIES) {
        const ctx = tracer('screen');
        drawFish(ctx, fishOf(species), PALETTE, { amount: 0.9, night: 0.4, lowPower: false });
        const dark = ctx._trace.filter(t => isDarkStyle(t.style));
        assert.ok(dark.length >= 1, `${species} 近处至少有一处暗色细节（眼睛）`);
        for (const t of dark) assert.equal(t.composite, 'source-over', `${species} 的暗色 ${t.name}(${t.style}) 在 ${t.composite} 下画，会隐形`);
        const light = ctx._trace.filter(t => typeof t.style === 'string' && !isDarkStyle(t.style));
        assert.ok(light.some(t => t.composite === 'screen'), `${species} 身体与鳍沿用宿主的 screen`);
        assert.equal(ctx.globalCompositeOperation, 'screen', `${species} 画完要还原宿主的混合模式`);
    }
    // 远处与省流量不画眼睛等细节，也不能改动混合模式
    for (const opts of [{ extra: { z: 0.3 } }, { extra: { z: 0.95 }, lowPower: true }]) {
        const ctx = tracer('screen');
        drawFish(ctx, fishOf('clown', opts.extra), PALETTE, { amount: 0.9, night: 0, lowPower: !!opts.lowPower });
        assert.ok(ctx._trace.every(t => t.composite === 'screen'));
        assert.equal(ctx.globalCompositeOperation, 'screen');
    }
});

test('几何：bodyOutline 的鼻子是圆的（头部按四分之一椭圆收到近 0），其余按站位平滑过渡；上下对称、沿体长单调、没有明显过冲', () => {
    const len = 100;
    for (const species of SPECIES) {
        const half = SHAPES[species].half;
        const straight = [0, 0.25, 0.5, 0.75, 1].map(u => ({ x: len * (0.5 - u), y: 0 }));
        const { top, bottom, us } = geometry.bodyOutline(straight, half, len);
        assert.equal(top.length, bottom.length, species);
        assert.equal(us.length, top.length, species);
        assert.ok(top.length >= 9, `${species} 取样点够密：${top.length}`);
        const peak = Math.max(...half) * len;
        for (let i = 0; i < top.length; i++) {
            assert.ok([top[i].x, top[i].y, bottom[i].x, bottom[i].y].every(Number.isFinite), species);
            assert.ok(Math.abs(top[i].y + bottom[i].y) < 1e-9, `${species} 直身时上下对称`);
            assert.equal(top[i].x, bottom[i].x, species);
            assert.ok(bottom[i].y - top[i].y <= 2 * peak * 1.12, `${species} 第 ${i} 点半宽 ${(bottom[i].y - top[i].y) / 2} 不应明显超过最宽站位 ${peak}`);
            if (i > 0) assert.ok(top[i].x < top[i - 1].x, `${species} 沿体长从头到尾单调`);
        }
        assert.ok(bottom[0].y - top[0].y <= len * 0.01 + 1e-9, `${species} 鼻尖上下几乎重合`);
        assert.ok(Math.abs(top[0].x - len * 0.5) < 1e-9 && Math.abs(top[top.length - 1].x + len * 0.5) < 1e-9, `${species} 从鼻尖到尾端`);
    }
    // 河豚这类胖鱼最明显：靠近鼻尖（u=0.02）的半宽不到最宽处的三成，否则鼻子像被竖着切平
    const puffer = SHAPES.puffer.half;
    const straight = [0, 0.25, 0.5, 0.75, 1].map(u => ({ x: len * (0.5 - u), y: 0 }));
    const { top, bottom, us } = geometry.bodyOutline(straight, puffer, len);
    const hAt = u => { const i = us.findIndex(v => Math.abs(v - u) < 1e-9); assert.ok(i >= 0, `取样点含 u=${u}`); return (bottom[i].y - top[i].y) / 2; };
    assert.ok(hAt(0.02) < 0.3 * hAt(0.5), `鼻子是圆的：${hAt(0.02)} 对 ${hAt(0.5)}`);
    assert.ok(hAt(0.2) > 0.6 * hAt(0.5), '过了头部立刻鼓起来');
    // 过了头部（u ≥ 0.16）不受鼻帽影响：与站位插值一致
    assert.ok(Math.abs(hAt(0.5) - puffer[2] * len) < 1e-6, '最宽站位处等于登记半宽');
});

test('几何：noseCap 是头部 16% 内的四分之一椭圆（鼻尖 0 → 16% 处为 1），之后恒为 1；越界不产生非法数', () => {
    const near = (a, b) => Math.abs(a - b) < 1e-12;
    assert.ok(near(geometry.noseCap(0), 0));
    assert.ok(near(geometry.noseCap(0.16), 1));
    assert.ok(near(geometry.noseCap(0.5), 1));
    assert.ok(near(geometry.noseCap(1), 1));
    assert.ok(near(geometry.noseCap(0.08), Math.sqrt(0.75)), '一半处是 √0.75：四分之一椭圆，而不是直线');
    assert.ok(near(geometry.noseCap(0.04), Math.sqrt(1 - 0.75 * 0.75)));
    let last = -1;
    for (let u = 0; u <= 0.16; u += 0.004) { const v = geometry.noseCap(u); assert.ok(v >= last - 1e-12 && v >= 0 && v <= 1); last = v; }
    assert.equal(geometry.noseCap(-0.3), 0);
});

test('几何：smoothAt（Catmull-Rom）经过每个站位、站位处斜率连续（线性插值在站位处是折角，身体会像六边形）、端点复制、线性数据原样复现', () => {
    const values = SHAPES.puffer.half;
    const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
    values.forEach((v, i) => assert.ok(near(geometry.smoothAt(values, i / (values.length - 1)), v), `站位 ${i}`));
    const d = 1e-5;
    for (const i of [1, 2, 3]) {
        const u = i / (values.length - 1);
        const left = (geometry.smoothAt(values, u) - geometry.smoothAt(values, u - d)) / d;
        const right = (geometry.smoothAt(values, u + d) - geometry.smoothAt(values, u)) / d;
        assert.ok(Math.abs(left - right) < 1e-3, `站位 ${i} 的斜率连续：${left} 对 ${right}`);
        const kink = (geometry.halfAt(values, u + d) - geometry.halfAt(values, u)) / d - (geometry.halfAt(values, u) - geometry.halfAt(values, u - d)) / d;
        assert.ok(Math.abs(kink) > 0.05, `对照：线性插值在站位 ${i} 有折角 ${kink}`);
    }
    assert.ok(near(geometry.smoothAt(values, -1), values[0]) && near(geometry.smoothAt(values, 2), values[4]), '越界夹住');
    // 手算值：线性数据在内部原样复现；两端把端点复制一份（所以第一段的 0.5 处是 0.4375，不是 0.5）
    const line = [0, 1, 2, 3, 4];
    assert.ok(near(geometry.smoothAt(line, 0.375), 1.5), '内部区间复现线性数据');
    assert.ok(near(geometry.smoothAt(line, 0.625), 2.5));
    assert.ok(near(geometry.smoothAt(line, 0.125), 0.4375), '端点复制：第一段');
    assert.ok(near(geometry.smoothAt(line, 0.875), 3.5625), '端点复制：最后一段');
});

test('几何：bodyOutline 过了头部的半宽就是站位的平滑插值（不是折线）', () => {
    const len = 100;
    const half = SHAPES.puffer.half;
    const straight = [0, 0.25, 0.5, 0.75, 1].map(u => ({ x: len * (0.5 - u), y: 0 }));
    const { top, bottom, us } = geometry.bodyOutline(straight, half, len);
    for (const u of [0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1]) {
        const i = us.findIndex(v => Math.abs(v - u) < 1e-9);
        assert.ok(i >= 0, `取样点含 u=${u}`);
        const h = (bottom[i].y - top[i].y) / 2;
        assert.ok(Math.abs(h - Math.max(0.004, geometry.smoothAt(half, u)) * len) < 1e-9, `u=${u} 的半宽 ${h}`);
    }
});

test('几何：bodyOutline 的中线沿脊柱平滑插值——弯身与摆尾时身体是一条弧线，不是折线', () => {
    const len = 100;
    const half = SHAPES.tang.half;
    const spine = [{ x: 50, y: 0 }, { x: 25, y: 6 }, { x: 0, y: 12 }, { x: -25, y: 6 }, { x: -50, y: 0 }];
    const xs = spine.map(p => p.x);
    const ys = spine.map(p => p.y);
    const { top, bottom, us } = geometry.bodyOutline(spine, half, len);
    us.forEach((u, i) => {
        assert.ok(Math.abs(top[i].x - geometry.smoothAt(xs, u)) < 1e-9, `u=${u} 的 x`);
        assert.ok(Math.abs((top[i].y + bottom[i].y) / 2 - geometry.smoothAt(ys, u)) < 1e-9, `u=${u} 的中线 y`);
    });
});
