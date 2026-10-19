(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const Rig = cjs ? require('./marine-rig.js') : root && root.MarineRig;
    const Painter = cjs ? require('./marine-rig-canvas.js') : root && root.MarineRigCanvas;
    const Data = cjs ? require('./marine-rig-data.js') : root && root.MarineRigData;
    const api = factory(Rig, Painter, Data);
    if (cjs) module.exports = api;
    if (root) root.AquariumReal = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function (Rig, Painter, Data) {
    'use strict';

    // 水族馆里“写实动物”的画法：把核心推进出来的鱼状态（位置、朝向、游动相位、转弯、深度）变成 MarineRig 的姿态，求值后交给 Canvas 画笔。
    // 形状/颜色/运动学都在 js/marine-rig-data.js 与 js/marine-rig.js（桌面端用同一份数据画同一种动物），本文件只决定
    // “这一帧用什么姿态、多清楚、多淡”：深度越远越淡越蓝（景深雾）、夜里更暗、省流量/远处只画主要图层。
    // 不读也不写任何存储或任务数据；任何异常由调用方（aquarium.js 的 frame）统一接住并停掉鱼层。

    const TAU = Math.PI * 2;
    const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
    const lerp = (a, b, t) => a + (b - a) * t;

    // 核心的 phase 以每秒约 0.7–1.6 圈推进（为小鱼的快速摆尾定的）；大型动物的真实节奏慢得多，按种缩放（相位 = phase × 此值）
    const FREQ = Object.freeze({ hammer: 0.7, manta: 0.55, turtle: 0.5, whaleshark: 0.42 });
    const WATER_DAY = Object.freeze([0.04, 0.27, 0.40]);       // 景深雾的颜色：白天的水色
    const WATER_NIGHT = Object.freeze([0.02, 0.07, 0.16]);
    const HAZE_FAR = 0.5;                                      // 最远的鱼混进水色的比例
    const HAZE_NIGHT = 0.22;                                   // 夜里再加多少
    const FALLBACK_GLOW = Object.freeze([150, 220, 255]);

    /** 这个物种有没有可用的写实数据（编译失败的数据按没有处理，调用方退回原画法）。 */
    function has(id) {
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FREQ, id) && !!Data.rig(id);
    }

    function ids() {
        return Object.keys(FREQ).filter(has);
    }

    /**
     * 把鱼的状态翻成姿态。fish：{ species, phase, turn, vx, vy, z }；ctx：{ len, flip, far, lowPower, speed（该种巡航速度，px/s，已乘视口缩放）, pull（鱼本地 px，未翻面）}。
     * 拉尾位移要换算成骨架坐标：除以每单位的像素数，再乘当前面（翻面后本地 y 轴是反的）。
     */
    function poseOf(fish, o) {
        const unit = o.len / 100;
        const speed = Math.hypot(fish.vx || 0, fish.vy || 0);
        const amp = clamp(0.5 + 0.5 * speed / Math.max(1, o.speed || 1), 0.4, 1);
        const pose = {
            phase: (Number.isFinite(fish.phase) ? fish.phase : 0) * (FREQ[fish.species] || 0.5),
            amp,
            turn: clamp(Number.isFinite(fish.turn) ? fish.turn : 0, -1, 1),
            lod: o.lowPower ? 0 : (o.far || o.len < 50 ? 1 : 2),
        };
        if (o.pull && Number.isFinite(o.pull.x) && Number.isFinite(o.pull.y) && unit > 0) pose.pull = [o.pull.x / unit, o.pull.y * (o.flip < 0 ? -1 : 1) / unit];
        return pose;
    }

    /** 景深雾：{ rgb, amount }。越远（z 小）越混进水色，夜里更重；刚吃到饲料的鱼亮一点。 */
    function hazeOf(z, night, fed) {
        const amount = clamp((1 - z) * HAZE_FAR + night * HAZE_NIGHT - fed * 0.12, 0, 0.7);
        const rgb = [lerp(WATER_DAY[0], WATER_NIGHT[0], night), lerp(WATER_DAY[1], WATER_NIGHT[1], night), lerp(WATER_DAY[2], WATER_NIGHT[2], night)];
        return { rgb, amount };
    }

    /**
     * 画一条写实的鱼。o：{ len（已含缩放与被捞起时的缩小）, flip（−1…1 的当前面）, fed, night, amount（背景强度 0…1）, lowPower, far, speed, pull, color（光晕色，[r,g,b] 0…255）, alpha（鱼自己的淡入淡出）}。
     * 返回是否画了（数据不可用时 false，调用方走原画法）。画布状态由本函数 save/restore。
     */
    function draw(ctx, fish, o) {
        const rig = Data.rig(fish.species);
        if (!rig) return false;
        const alpha = clamp(o.alpha * lerp(0.6, 1, clamp(fish.z, 0, 1)) * lerp(0.6, 1, clamp(o.amount, 0, 1)) * (1 + 0.2 * (o.fed || 0)), 0, 1);
        if (alpha <= 0.01) return true;
        const { ops } = Rig.evaluate(rig, poseOf(fish, o));
        const k = o.len / (rig.snout - rig.tail);
        ctx.save();
        try {
            ctx.translate(fish.x, fish.y);
            ctx.rotate(fish.ang);
            const glow = clamp((o.night || 0) + (o.fed || 0) * 0.9, 0, 1);
            if (glow > 0.05 && !o.lowPower) {
                const c = o.color || FALLBACK_GLOW;
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.len * 0.95);
                g.addColorStop(0, `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${(0.2 * glow * alpha).toFixed(3)})`);
                g.addColorStop(1, `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, 0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(0, 0, o.len * 0.95, 0, TAU);
                ctx.fill();
            }
            ctx.scale(k, k * o.flip);
            // 宿主整张画布平时在 screen 下画（只会变亮）；写实动物有深色，必须用 source-over
            ctx.globalCompositeOperation = 'source-over';
            Painter.drawOps(ctx, ops, { alpha, tint: hazeOf(fish.z, o.night || 0, o.fed || 0) });
        } finally {
            ctx.restore();
        }
        return true;
    }

    return Object.freeze({ FREQ, WATER_DAY, WATER_NIGHT, has, ids, poseOf, hazeOf, draw });
});
