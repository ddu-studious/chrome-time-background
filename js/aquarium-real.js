(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const Rig = cjs ? require('./marine-rig.js') : root && root.MarineRig;
    const Painter = cjs ? require('./marine-rig-canvas.js') : root && root.MarineRigCanvas;
    const Data = cjs ? require('./marine-rig-data.js') : root && root.MarineRigData;
    const Yaw = cjs ? require('./aquarium-yaw.js') : root && root.AquariumYaw;
    const api = factory(Rig, Painter, Data, Yaw);
    if (cjs) module.exports = api;
    if (root) root.AquariumReal = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function (Rig, Painter, Data, Yaw) {
    'use strict';

    // 水族馆里“写实动物”的画法：把核心推进出来的鱼状态（位置、朝向、游动相位、转弯、深度）变成 MarineRig 的姿态，求值后交给 Canvas 画笔。
    // 形状/颜色/运动学都在 js/marine-rig-data.js 与 js/marine-rig.js（桌面端用同一份数据画同一种动物），本文件只决定
    // “这一帧用什么姿态、多清楚、多淡”：深度越远越淡越蓝（景深雾）、夜里更暗、省流量/远处只画主要图层。
    // 侧视大个子（小锤头鲨、鲸鲨）转身时，近处且不省流量的那一帧用 js/aquarium-yaw.js 把图层按“椭圆剖面”投影成转了一个角度的样子（正对观众时是圆身体加横锤头，
    // 不是一条细线）；远处、省流量、投影失败时仍用原来的“沿屏幕横向压扁”画法。
    // 不读也不写任何存储或任务数据；任何异常由调用方（aquarium.js 的 frame）统一接住并停掉鱼层（投影的异常在本文件内接住，只退回压扁画法并警告一次）。

    const TAU = Math.PI * 2;
    const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
    const lerp = (a, b, t) => a + (b - a) * t;

    // 核心的 phase 以每秒约 0.7–1.6 圈推进（为小鱼的快速摆尾定的）；大型动物的真实节奏慢得多，按种缩放（相位 = phase × 此值）
    const FREQ = Object.freeze({ hammer: 0.7, manta: 0.55, turtle: 0.5, whaleshark: 0.42 });
    const WATER_DAY = Object.freeze([0.04, 0.27, 0.40]);       // 景深雾的颜色：白天的水色
    const WATER_NIGHT = Object.freeze([0.02, 0.07, 0.16]);
    const HAZE_FAR = 0.5;                                      // 最远的鱼混进水色的比例
    const HAZE_NIGHT = 0.22;                                   // 夜里再加多少
    // 水按通道吸收光（Beer–Lambert：透过比例 = exp(−a·深度)）：红最快、绿次之、蓝最慢，所以远处的东西先失去红色、变青蓝。
    // 吸收系数（每米）取清澈海水的量级，不是实测拟合值；“深度”是把 z（0 远…1 近）映射到的虚拟水深 ABSORB_DEPTH_M（米）。
    // 只用它决定三个通道之间的比例，总量仍是上面的 HAZE_FAR / HAZE_NIGHT（平均混合量与此前一致，整体明暗不变，变的是色偏）。
    const ABSORB = Object.freeze([0.22, 0.065, 0.02]);
    const ABSORB_DEPTH_M = 7;
    const ABSORB_MAX = 0.92;                                   // 单通道混合比例的上限：最远处红色也留一点点
    const FALLBACK_GLOW = Object.freeze([150, 220, 255]);
    const XS_MIN = 0.04;                                       // 转身中身体沿屏幕横向缩短的下限：留一条细身体而不缩到 0，免得画布矩阵退化
    let yawBroken = false;                                     // 投影抛过异常：本页面不再试，转身退回压扁画法（只警告一次）

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
            // 核心的 turn > 0 表示向 +y（鱼本地，未翻面）转弯；翻面后本地 y 轴被镜像，弯身的方向要跟着反过来，否则朝左游的鱼会往转弯的反方向弯
            turn: clamp(Number.isFinite(fish.turn) ? fish.turn : 0, -1, 1) * (o.flip < 0 ? -1 : 1),
            lod: o.lowPower ? 0 : (o.far || o.len < 50 ? 1 : 2),
        };
        if (o.pull && Number.isFinite(o.pull.x) && Number.isFinite(o.pull.y) && unit > 0) pose.pull = [o.pull.x / unit, o.pull.y * (o.flip < 0 ? -1 : 1) / unit];
        return pose;
    }

    /**
     * 景深雾：{ rgb, amount }。越远（z 小）越混进水色，夜里更重；刚吃到饲料的鱼亮一点。
     * absorb 为 true 时多一个 amounts（红绿蓝各一个混合比例）：按 Beer–Lambert 吸收分配三个通道，平均值仍等于 amount（未触顶时），所以只改色偏、不改整体明暗；z = 1（最近）时三个相等。
     */
    function hazeOf(z, night, fed, absorb) {
        const amount = clamp((1 - z) * HAZE_FAR + night * HAZE_NIGHT - fed * 0.12, 0, 0.7);
        const rgb = [lerp(WATER_DAY[0], WATER_NIGHT[0], night), lerp(WATER_DAY[1], WATER_NIGHT[1], night), lerp(WATER_DAY[2], WATER_NIGHT[2], night)];
        if (absorb !== true) return { rgb, amount };
        const depth = (1 - clamp(Number.isFinite(z) ? z : 0, 0, 1)) * ABSORB_DEPTH_M;
        const loss = ABSORB.map(a => 1 - Math.exp(-a * depth));
        const mean = (loss[0] + loss[1] + loss[2]) / 3;
        const amounts = mean > 1e-9 ? loss.map(l => clamp(amount * l / mean, 0, ABSORB_MAX)) : [amount, amount, amount];
        return { rgb, amount, amounts };
    }

    /**
     * 画一条写实的鱼。o：{ len（已含缩放与被捞起时的缩小）, flip（−1…1 的当前面）, fed, night, amount（背景强度 0…1）, lowPower, far, speed, pull, color（光晕色，[r,g,b] 0…255）, alpha（鱼自己的淡入淡出）, absorb（可选，明确为 true 时远处按通道被水吸收）}。
     * 返回是否画了（数据不可用时 false，调用方走原画法）。画布状态由本函数 save/restore。
     */
    function draw(ctx, fish, o) {
        const rig = Data.rig(fish.species);
        if (!rig) return false;
        const alpha = clamp(o.alpha * lerp(0.6, 1, clamp(fish.z, 0, 1)) * lerp(0.6, 1, clamp(o.amount, 0, 1)) * (1 + 0.2 * (o.fed || 0)), 0, 1);
        if (alpha <= 0.01) return true;
        const { ops } = Rig.evaluate(rig, poseOf(fish, o));
        const k = o.len / (rig.snout - rig.tail);
        // 转身（核心的 yaw 在 0…1 之间）：近处且不省流量时投影成“转了一个角度”的样子；不在转身、数据不全、远处/省流量、投影失败都走原来的路径
        let turn = null;
        let projected = null;
        if (Yaw && !yawBroken && !o.far && !o.lowPower && Yaw.has(fish.species)) {
            turn = Yaw.stateOf(fish);
            if (turn) {
                try { projected = Yaw.project(ops, fish.species, turn.theta); } catch (error) {
                    yawBroken = true;
                    if (typeof console !== 'undefined') console.warn(`写实动物转身投影出错，退回压扁画法：${error && error.message}`);
                }
            }
        }
        ctx.save();
        try {
            ctx.translate(fish.x, fish.y);
            // 侧视的大个子转身（水平面里转半圈）：投影失败时沿屏幕横向先缩短、再伸长（核心的 xs，1 或缺失表示不缩）
            if (!projected && Number.isFinite(fish.xs) && fish.xs < 1) ctx.scale(Math.max(fish.xs, XS_MIN), 1);
            if (!projected) ctx.rotate(fish.ang);
            const glow = clamp((o.night || 0) + (o.fed || 0) * 0.9, 0, 1);
            if (glow > 0.05 && !o.lowPower) {
                const c = o.color || FALLBACK_GLOW;
                if (projected) { ctx.save(); ctx.scale(clamp(0.3 + 0.7 * Math.abs(Math.cos(turn.theta)), 0.3, 1), 1); }        // 正对观众时身体窄，光晕也跟着收窄
                const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.len * 0.95);
                g.addColorStop(0, `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${(0.2 * glow * alpha).toFixed(3)})`);
                g.addColorStop(1, `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, 0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(0, 0, o.len * 0.95, 0, TAU);
                ctx.fill();
                if (projected) ctx.restore();
            }
            if (projected) {
                // 投影出来的图层是“鼻朝右”的等价画面：换面之后（face < 0）整体水平镜像，再按鼻朝右的等价俯仰角转；不看 o.flip（缓动中的翻面在这里没有意义）
                if (turn.mirror) ctx.scale(-1, 1);
                ctx.rotate(turn.pitch);
                ctx.scale(k, k);
            } else {
                ctx.scale(k, k * o.flip);
            }
            // 宿主整张画布平时在 screen 下画（只会变亮）；写实动物有深色，必须用 source-over
            ctx.globalCompositeOperation = 'source-over';
            Painter.drawOps(ctx, projected || ops, { alpha, tint: hazeOf(fish.z, o.night || 0, o.fed || 0, o.absorb === true) });
        } finally {
            ctx.restore();
        }
        return true;
    }

    return Object.freeze({ FREQ, WATER_DAY, WATER_NIGHT, has, ids, poseOf, hazeOf, draw });
});
