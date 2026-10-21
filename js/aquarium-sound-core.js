(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumSoundCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水族馆水下环境音的纯逻辑：粉红噪声缓冲、低频嗡鸣参数、气泡到达时刻表。
    // 不碰 Web Audio、DOM、时钟、存储；真正发声在 aquarium-sound.js。默认关、须用户手势，见 docs/technical/aquarium-ambient-20261020.md。

    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));

    const PARAMS = Object.freeze({
        SAMPLE_RATE: 44100,
        NOISE_SECONDS: 2,                 // 循环噪声长度（秒）
        MASTER: 0.045,                    // 总音量上限（很轻，当背景）
        NOISE_GAIN: 0.55,                 // 噪声相对主音量
        DRONE_GAIN: 0.35,                 // 低频嗡鸣相对主音量
        DRONE_HZ: 55,                     // 嗡鸣基频（Hz）
        FILTER_HZ: 780,                   // 低通：水下闷闷的
        FILTER_Q: 0.7,
        NIGHT_KEEP: 0.55,                 // 夜里音量保留
        BUBBLE_MIN_S: 2.4,                // 气泡最短间隔（秒）
        BUBBLE_MAX_S: 7.5,
        BUBBLE_GAIN: 0.28,
        BUBBLE_HZ0: 620, BUBBLE_HZ1: 1400,
        BUBBLE_MS: 90,                    // 气泡时长（毫秒）
        FADE_IN_S: 1.2,
        FADE_OUT_S: 0.8,
    });

    /** 独立的随机流（mulberry32）。 */
    function seeded(seed) {
        let a = (Number.isFinite(seed) ? seed : 0) >>> 0;
        return function next() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * 生成一段循环用的“粉红噪声”样本（Voss-McCartney 简化）。
     * random 是 () => [0,1)；返回 Float32Array，峰值约在 ±1 内。
     */
    function pinkNoise(samples, random = Math.random) {
        const n = Math.max(1, samples | 0);
        const out = new Float32Array(n);
        const r = typeof random === 'function' ? random : Math.random;
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < n; i++) {
            const white = r() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            b6 = white * 0.115926;
            out[i] = pink * 0.11;
        }
        return out;
    }

    /** 主音量：amount 0…1 × 夜晚折减 × MASTER。 */
    function masterGain(amount = 1, night = 0) {
        const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
        const n = clamp(Number.isFinite(night) ? night : 0, 0, 1);
        return PARAMS.MASTER * a * (1 - (1 - PARAMS.NIGHT_KEEP) * n);
    }

    /**
     * 接下来若干个气泡的到达时刻与参数（相对 now 的秒数）。
     * 返回 [{ at, freq, gain }]，长度 = count。
     */
    function bubbleSchedule(now, count, random = Math.random) {
        const r = typeof random === 'function' ? random : Math.random;
        const n = Math.max(0, count | 0);
        const out = [];
        let t = Number.isFinite(now) ? now : 0;
        for (let i = 0; i < n; i++) {
            t += PARAMS.BUBBLE_MIN_S + (PARAMS.BUBBLE_MAX_S - PARAMS.BUBBLE_MIN_S) * r();
            out.push({
                at: t,
                freq: PARAMS.BUBBLE_HZ0 + (PARAMS.BUBBLE_HZ1 - PARAMS.BUBBLE_HZ0) * r(),
                gain: PARAMS.BUBBLE_GAIN * (0.55 + 0.45 * r()),
            });
        }
        return out;
    }

    return Object.freeze({ PARAMS, seeded, pinkNoise, masterGain, bubbleSchedule });
});
