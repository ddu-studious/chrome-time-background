// 水族馆水下环境音的纯逻辑（js/aquarium-sound-core.js）：粉红噪声有界、主音量、气泡时刻表、确定性。
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-sound-core.js');

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

test('pinkNoise：同一种子逐样本相同；峰值有限且大致在 ±1 内', () => {
    const a = Core.pinkNoise(2048, seeded(3));
    const b = Core.pinkNoise(2048, seeded(3));
    assert.equal(a.length, 2048);
    assert.deepEqual(Array.from(a), Array.from(b));
    let peak = 0;
    for (let i = 0; i < a.length; i++) {
        assert.ok(Number.isFinite(a[i]));
        peak = Math.max(peak, Math.abs(a[i]));
    }
    assert.ok(peak > 0.01 && peak < 2);
});

test('masterGain：随 amount 单调、夜里更轻、夹到合法范围', () => {
    assert.equal(Core.masterGain(0, 0), 0);
    assert.ok(Core.masterGain(1, 0) > Core.masterGain(0.5, 0));
    assert.ok(Core.masterGain(1, 1) < Core.masterGain(1, 0));
    assert.ok(Core.masterGain(1, 0) <= Core.PARAMS.MASTER + 1e-12);
    assert.equal(Core.masterGain(9, -1), Core.PARAMS.MASTER);
});

test('bubbleSchedule：时刻递增、频率与增益在表内；同一种子相同', () => {
    const a = Core.bubbleSchedule(10, 5, seeded(9));
    const b = Core.bubbleSchedule(10, 5, seeded(9));
    assert.deepEqual(a, b);
    assert.equal(a.length, 5);
    let prev = 10;
    for (const bbl of a) {
        assert.ok(bbl.at > prev);
        prev = bbl.at;
        assert.ok(bbl.freq >= Core.PARAMS.BUBBLE_HZ0 && bbl.freq <= Core.PARAMS.BUBBLE_HZ1);
        assert.ok(bbl.gain > 0 && bbl.gain <= Core.PARAMS.BUBBLE_GAIN);
    }
});
