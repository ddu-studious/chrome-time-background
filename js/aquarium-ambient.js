(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumAmbient = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水族馆“水流、海洋雪与光束”的画法。状态与规则在 aquarium-flow-core.js 与 aquarium-light-core.js，本文件只读它们的状态来画。
    // 画在背景体验的共享画布上，宿主的合成方式是 screen（只会变亮）：这些效果本来就是“加一点光”，不会盖住壁纸；每个函数自己 save/restore，不改宿主的画布状态。
    // 染色与光束都先写进一张很小的离屏纹理（一格一个像素），再带平滑地放大画上去——放大时的双线性插值就是柔化，不需要逐像素在主画布上算。
    // 不读写存储、不请求网络、不建任何 DOM（离屏画布由调用方注入的 makeCanvas 创建）。

    const TAU = Math.PI * 2;
    const SNOW_FRONT_Z = 0.78;                 // 深度 z 不小于它的海洋雪画在鱼前面（最近的一层），其余画在后面
    const SNOW_BUCKETS = 6;                    // 海洋雪按不透明度分桶，每桶一次填充（几百粒只要十来次 fill）
    const SNOW_RGB = '220, 240, 255';
    const dot = { x: 0, y: 0, z: 0, size: 0, alpha: 0 };

    /** 独立的随机流（mulberry32）：同一个种子给出同一串数。控制器从世界的随机源取一次种子后给两个氛围核心用，之后它们不再碰世界的随机源（与捕食层同一做法，开关不改变鱼的随机序列）。 */
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

    /** 建一张离屏纹理：{ canvas, ctx, image, w, h }；任何一步拿不到（没有 2D 上下文等）返回 null。 */
    function makePad(makeCanvas, w, h) {
        if (typeof makeCanvas !== 'function' || !(w >= 1) || !(h >= 1)) return null;
        let canvas = null;
        try { canvas = makeCanvas(w, h); } catch { return null; }
        if (!canvas) return null;
        let ctx = null;
        try { ctx = canvas.getContext('2d'); } catch { return null; }
        if (!ctx || typeof ctx.createImageData !== 'function' || typeof ctx.putImageData !== 'function') return null;
        let image = null;
        try { image = ctx.createImageData(w, h); } catch { return null; }
        if (!image || !image.data || image.data.length < w * h * 4) return null;
        return { canvas, ctx, image, w, h };
    }

    function smoothOn(ctx) {
        ctx.imageSmoothingEnabled = true;
        if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
    }

    /**
     * 画染色尾迹。pad 的尺寸必须等于流场网格（gw × gh）。返回是否画了（没有可见内容时什么都不画）。
     * view：{ alpha?: 染色最亮处的不透明度上限（缺省 0.34） }。
     */
    function drawDye(ctx, flowCore, flow, pad, view) {
        if (!flow || !pad || pad.w !== flow.gw || pad.h !== flow.gh) return false;
        const box = flowCore.dyeImage(flow, pad.image.data, view && Number.isFinite(view.alpha) ? view.alpha : 0.34);
        if (!box) return false;
        pad.ctx.putImageData(pad.image, 0, 0);
        // 包围盒各向外扩一格（那一圈是全透明的）：放大时的双线性插值才会渐隐到 0，不在盒子边上切出一条硬边
        const i0 = Math.max(0, box.i0 - 1), j0 = Math.max(0, box.j0 - 1);
        const i1 = Math.min(flow.gw - 1, box.i1 + 1), j1 = Math.min(flow.gh - 1, box.j1 + 1);
        const sw = i1 - i0 + 1, sh = j1 - j0 + 1;
        ctx.save();
        try {
            ctx.globalCompositeOperation = 'screen';
            smoothOn(ctx);
            ctx.drawImage(pad.canvas, i0, j0, sw, sh, i0 * flow.cw, j0 * flow.ch, sw * flow.cw, sh * flow.ch);
        } finally {
            ctx.restore();
        }
        return true;
    }

    /**
     * 画海洋雪的一层：layer 为 'back'（z < SNOW_FRONT_Z，画在鱼后面）或 'front'（画在鱼前面）。
     * view：{ scale, night }。返回画了几粒。
     */
    function drawSnow(ctx, flowCore, flow, view, layer) {
        if (!flow || !flow.snow || !flow.snow.count) return 0;
        const front = layer === 'front';
        const scale = view && Number.isFinite(view.scale) ? view.scale : 1;
        const night = view && Number.isFinite(view.night) ? view.night : 0;
        const count = flow.snow.count;
        const buckets = [];
        for (let b = 0; b < SNOW_BUCKETS; b++) buckets.push([]);
        let drawn = 0;
        for (let n = 0; n < count; n++) {
            flowCore.snowDot(flow, n, scale, night, dot);
            if ((dot.z >= SNOW_FRONT_Z) !== front) continue;
            if (!(dot.alpha > 0.02) || !Number.isFinite(dot.x) || !Number.isFinite(dot.y)) continue;
            const b = Math.min(SNOW_BUCKETS - 1, Math.floor(dot.alpha * (SNOW_BUCKETS / 0.5)));
            buckets[b].push(dot.x, dot.y, dot.size * 0.5);
            drawn++;
        }
        if (!drawn) return 0;
        ctx.save();
        try {
            ctx.globalCompositeOperation = 'screen';
            for (let b = 0; b < SNOW_BUCKETS; b++) {
                const list = buckets[b];
                if (!list.length) continue;
                ctx.fillStyle = `rgba(${SNOW_RGB}, ${(((b + 0.5) / SNOW_BUCKETS) * 0.62).toFixed(3)})`;
                ctx.beginPath();
                for (let i = 0; i < list.length; i += 3) {
                    ctx.moveTo(list[i] + list[i + 2], list[i + 1]);
                    ctx.arc(list[i], list[i + 1], list[i + 2], 0, TAU);
                }
                ctx.fill();
            }
        } finally {
            ctx.restore();
        }
        return drawn;
    }

    /** 画光束：先按需重算纹理（lightCore.update 到点才算），再把整张纹理放大铺满画布。pad 的尺寸必须等于 lightCore.PARAMS.TEX_W × TEX_H。 */
    function drawRays(ctx, lightCore, light, pad, view) {
        if (!light || !pad) return false;
        const P = lightCore.PARAMS;
        if (pad.w !== P.TEX_W || pad.h !== P.TEX_H) return false;
        const dt = view && Number.isFinite(view.dt) ? view.dt : 0;
        const night = view && Number.isFinite(view.night) ? view.night : 0;
        if (lightCore.update(light, dt, pad.image.data, night)) pad.ctx.putImageData(pad.image, 0, 0);
        if (!light.filled || !(view && view.width > 0 && view.height > 0)) return false;
        ctx.save();
        try {
            ctx.globalCompositeOperation = 'screen';
            smoothOn(ctx);
            ctx.drawImage(pad.canvas, 0, 0, P.TEX_W, P.TEX_H, 0, 0, view.width, view.height);
        } finally {
            ctx.restore();
        }
        return true;
    }

    return Object.freeze({ SNOW_FRONT_Z, SNOW_BUCKETS, seeded, makePad, drawDye, drawSnow, drawRays });
});
