// 水族馆的水下光束（js/aquarium-light-core.js）：纹理尺寸、亮度曲线、夜晚折减、重算频率、确定性。
// 画面观感靠真实浏览器截图判断，不在这里。
const test = require('node:test');
const assert = require('node:assert/strict');
const Light = require('../js/aquarium-light-core.js');

const P = Light.PARAMS;

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

test('create 给出 BEAMS 条光带；同一种子同一种排布', () => {
    const a = Light.create({ random: seeded(3) });
    const b = Light.create({ random: seeded(3) });
    const c = Light.create({ random: seeded(4) });
    assert.equal(a.beams.length, P.BEAMS);
    assert.deepEqual(a.beams.map(x => x.x0), b.beams.map(x => x.x0));
    assert.notDeepEqual(a.beams.map(x => x.x0), c.beams.map(x => x.x0));
});

test('intensityAt：顶端接近 0、深处衰减到 0、中间有光', () => {
    const s = Light.create({ random: seeded(5) });
    const t = 1.7;
    let mid = 0;
    for (let i = 0; i < 40; i++) mid = Math.max(mid, Light.intensityAt(s, (i + 0.5) / 40, 0.2, t));
    assert.ok(mid > 0.05, `中间应有光，实际 ${mid}`);
    assert.ok(Light.intensityAt(s, 0.5, 0, t) < 0.05, '顶端渐入');
    assert.equal(Light.intensityAt(s, 0.5, P.FADE_Y, t), 0);
    assert.equal(Light.intensityAt(s, 0.5, 1, t), 0);
});

test('update：第一次立刻写；之后按 UPDATE_HZ 节流；alpha 不超过 MAX_ALPHA；非法输入不动', () => {
    const s = Light.create({ random: seeded(8) });
    const data = new Uint8ClampedArray(P.TEX_W * P.TEX_H * 4);
    assert.equal(Light.update(s, NaN, data, 0), false);
    assert.equal(Light.update(null, 0.1, data, 0), false);
    assert.equal(Light.update(s, 0.1, new Uint8ClampedArray(4), 0), false);
    assert.equal(Light.update(s, 0.1, data, 0), true);
    assert.equal(s.filled, true);
    const peakDay = Light.peakAlpha(data);
    assert.ok(peakDay > 0);
    assert.ok(peakDay <= Math.round(P.MAX_ALPHA * 255) + 1);
    // 紧接着再写一次（间隔不够）应跳过
    assert.equal(Light.update(s, 0.001, data, 0), false);
    // 夜里更暗
    s.accum = 1;
    assert.equal(Light.update(s, 0, data, 1), true);
    const peakNight = Light.peakAlpha(data);
    assert.ok(peakNight < peakDay);
    assert.ok(peakNight <= Math.round(P.MAX_ALPHA * P.NIGHT_KEEP * 255) + 1);
});

test('同一种子、同一段时间写出的纹理逐字节相同', () => {
    const run = seed => {
        const s = Light.create({ random: seeded(seed) });
        const data = new Uint8ClampedArray(P.TEX_W * P.TEX_H * 4);
        Light.update(s, 0.5, data, 0.2);
        return Array.from(data);
    };
    assert.deepEqual(run(11), run(11));
    assert.notDeepEqual(run(11), run(12));
});
