(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumLightCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水族馆的“光束”：从水面斜着打下来、越深越淡的几道光（丁达尔光束 / 上帝之光），以及鱼身上“按颜色分别衰减”的水下吸收。
    // 纯逻辑：不碰 DOM、时钟、存储，随机数由调用方注入；画法在 aquarium-ambient.js，接线在 aquarium.js 与 aquarium-real.js。
    //
    // 为什么是这样做：真实的光束是水面波浪把阳光聚成亮暗相间的条（和焦散同源），沿着折射后的阳光方向一路向下，被水散射才看得见，越深越淡。
    // 这里不做体渲染，只在一张很小的纹理（几十 × 几十像素）上按“若干条斜的高斯光带”算亮度，放大时的双线性插值把它自然地糊开；
    // 光带的位置随时间缓慢摆动、亮度缓慢起伏（波面在动），夜里几乎没有（没有太阳）。画布合成方式是 screen，只会变亮，壁纸始终透得过来，
    // 并且不透明度有硬上限（MAX_ALPHA）——第一版设计就是“绝不盖住背景”（用户 2026-10-19 的第一条要求）。
    // 参考：Aurelia（MIT）演示里垂直光柱的观感与 Sea of Thieves（SIGGRAPH 2018）的水下光，只借创意，没有借代码。

    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const smooth01 = t => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

    const PARAMS = Object.freeze({
        BEAMS: 5,                 // 光带条数
        TEX_W: 80, TEX_H: 45,     // 纹理尺寸（一格一个像素，放大后双线性插值）
        MAX_ALPHA: 0.10,         // 最亮处的不透明度上限（screen 合成：叠在壁纸上最多提亮这么多）
        FADE_Y: 0.8,              // 光束消失的深度（占画布高度）
        FADE_POW: 1.5,            // 越深越淡的曲线指数
        TOP_SOFT: 0.05,           // 顶端这么高以内渐入，避免在画布上沿切出一条硬边（占高度）
        SLOPE: 0.11,              // 光束的倾斜（水平位移 / 高度）：阳光进水后折射，更接近竖直
        SLOPE_JITTER: 0.02,       // 各条之间倾斜的微小差别（它们本该互相平行）
        WIDTH_MIN: 0.035, WIDTH_MAX: 0.075,   // 光带半宽（占画布宽度）
        WIDEN: 0.9,               // 越深越宽（散射）：半宽 × (1 + WIDEN × 深度)
        SWAY: 0.012,              // 水平摆动幅度（占宽度）
        UPDATE_HZ: 14,            // 纹理重算频率：光束变化很慢，不必每帧算
        NIGHT_KEEP: 0.12,         // 夜里剩下多少（0…1）
    });

    /** 新建光束状态。random 缺省 Math.random。 */
    function create({ random = Math.random } = {}) {
        const r = typeof random === 'function' ? random : Math.random;
        const dir = r() < 0.5 ? -1 : 1;
        const beams = [];
        const n = PARAMS.BEAMS;
        for (let i = 0; i < n; i++) {
            // 把画布宽度平均分成 n 段，每条在自己那段里随机落位，免得几条光挤在一起或全落在一侧
            const x0 = (i + 0.15 + 0.7 * r()) / n;
            beams.push({
                x0,
                w: PARAMS.WIDTH_MIN + (PARAMS.WIDTH_MAX - PARAMS.WIDTH_MIN) * r(),
                slope: dir * (PARAMS.SLOPE + (r() - 0.5) * 2 * PARAMS.SLOPE_JITTER),
                swayRate: 0.12 + 0.2 * r(),
                flickerRate: 0.18 + 0.3 * r(),
                phase: r() * Math.PI * 2,
                phase2: r() * Math.PI * 2,
                strength: 0.55 + 0.45 * r(),
            });
        }
        return { beams, time: 0, accum: 0, filled: false };
    }

    /** 某一点（u, v 都是 0…1，v 向下）此刻的光亮度 0…1（不含夜晚折减）。 */
    function intensityAt(state, u, v, t) {
        let sum = 0;
        for (const b of state.beams) {
            const cx = b.x0 + b.slope * v + PARAMS.SWAY * Math.sin(t * b.swayRate + b.phase);
            const half = b.w * (1 + PARAMS.WIDEN * v);
            const d = (u - cx) / half;
            if (d > 3 || d < -3) continue;
            const flicker = 0.68 + 0.32 * Math.sin(t * b.flickerRate + b.phase2);
            sum += Math.exp(-d * d) * b.strength * flicker;
        }
        const fade = v >= PARAMS.FADE_Y ? 0 : Math.pow(1 - v / PARAMS.FADE_Y, PARAMS.FADE_POW);
        const top = smooth01(v / PARAMS.TOP_SOFT);
        return clamp(sum, 0, 1) * fade * top;
    }

    /**
     * 到点就把光束写进纹理（RGBA，TEX_W × TEX_H）：浅青白色，alpha = 亮度 × MAX_ALPHA × 夜晚折减。
     * dt 是秒；没到重算间隔时返回 false（纹理沿用上一次的），写了返回 true。night 0…1。非法输入返回 false，不动纹理。
     */
    function update(state, dt, data, night = 0) {
        if (!state || !data || data.length < PARAMS.TEX_W * PARAMS.TEX_H * 4 || !Number.isFinite(dt) || dt < 0) return false;
        state.time += Math.min(dt, 0.25);
        state.accum += dt;
        if (state.filled && state.accum < 1 / PARAMS.UPDATE_HZ) return false;
        state.accum = 0;
        const keep = lerpNight(clamp(Number.isFinite(night) ? night : 0, 0, 1));
        const W = PARAMS.TEX_W, H = PARAMS.TEX_H;
        for (let j = 0; j < H; j++) {
            const v = (j + 0.5) / H;
            for (let i = 0; i < W; i++) {
                const u = (i + 0.5) / W;
                const a = intensityAt(state, u, v, state.time) * PARAMS.MAX_ALPHA * keep;
                const o = (i + W * j) * 4;
                data[o] = 190; data[o + 1] = 232; data[o + 2] = 255; data[o + 3] = Math.round(a * 255);
            }
        }
        state.filled = true;
        return true;
    }

    function lerpNight(night) { return 1 - (1 - PARAMS.NIGHT_KEEP) * night; }

    /** 纹理里 alpha 的最大值（0…255），测试与诊断用。 */
    function peakAlpha(data) {
        let peak = 0;
        for (let o = 3; o < data.length; o += 4) if (data[o] > peak) peak = data[o];
        return peak;
    }

    return Object.freeze({ PARAMS, create, intensityAt, update, peakAlpha });
});
