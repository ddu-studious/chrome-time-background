(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MarineRigCanvas = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 把 MarineRig.evaluate 的 ops 画进 Canvas 2D（水族馆用）。桌面端在 desktop-reminder/marine-rig-painter.swift 里用 CoreGraphics 画同一份 ops。
    // 画笔只做“数据 → 绘制调用”，不做任何形状/颜色/姿态决定；渐变、描边、填充规则都在 op 里。设计见 docs/technical/marine-realism-20261019.md。

    const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
    const channel = value => Math.round(clamp(value, 0, 1) * 255);

    /** rgba（各分量 0…1）→ CSS 颜色串；scale 乘到不透明度上；tint 是 { rgb:[0…1 ×3], amount:0…1 }，把颜色向水色混合（景深/夜晚的雾）。 */
    function css(rgba, scale, tint) {
        let r = rgba[0], g = rgba[1], b = rgba[2];
        if (tint && tint.amount > 0) {
            const k = clamp(tint.amount, 0, 1);
            r += (tint.rgb[0] - r) * k; g += (tint.rgb[1] - g) * k; b += (tint.rgb[2] - b) * k;
        }
        return `rgba(${channel(r)}, ${channel(g)}, ${channel(b)}, ${clamp(rgba[3] * scale, 0, 1).toFixed(3)})`;
    }

    function tracePolys(ctx, polys) {
        for (const poly of polys) {
            const pts = poly.pts;
            const n = pts.length;
            if (n < 4) continue;
            ctx.moveTo(pts[0], pts[1]);
            for (let i = 2; i < n; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
            if (poly.closed) ctx.closePath();
        }
    }

    function fillStyleOf(ctx, paint, scale, tint) {
        if (paint.rgba) return css(paint.rgba, scale, tint);
        const g = paint.grad;
        const gradient = ctx.createLinearGradient(g.a[0], g.a[1], g.b[0], g.b[1]);
        for (const stop of g.stops) gradient.addColorStop(clamp(stop[0], 0, 1), css([stop[1], stop[2], stop[3], stop[4]], scale, tint));
        return gradient;
    }

    /**
     * ops：MarineRig.evaluate 的结果。options.alpha（0…1，默认 1）整体乘到所有颜色的不透明度上；
     * options.tint（{ rgb, amount }）把所有颜色（含渐变色标）向水色混合，远处的、夜里的动物更蓝更暗，细节与明暗关系不变。
     * 调用方负责 save/restore 与坐标变换；这里只设置自己用到的线宽/线帽/线连接，并把它们留在画布上（外层 restore 会还原）。
     */
    function drawOps(ctx, ops, options) {
        const scale = options && Number.isFinite(options.alpha) ? clamp(options.alpha, 0, 1) : 1;
        const tint = options && options.tint && Array.isArray(options.tint.rgb) && options.tint.amount > 0 ? options.tint : null;
        if (scale <= 0) return;
        for (const op of ops) {
            ctx.beginPath();
            tracePolys(ctx, op.polys);
            if (op.k === 'fill') {
                ctx.fillStyle = fillStyleOf(ctx, op.paint, scale, tint);
                ctx.fill(op.rule === 'evenodd' ? 'evenodd' : 'nonzero');
            } else {
                ctx.lineWidth = op.width;
                ctx.lineCap = op.cap === 'butt' ? 'butt' : 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = css(op.rgba, scale, tint);
                ctx.stroke();
            }
        }
    }

    return Object.freeze({ drawOps, css });
});
