(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.TaskCrumpleCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 任务完成“揉纸入篓”动效的纯几何与时间线：不碰 DOM、不读任何任务数据，只回答
    // “这张卡片揉成多大的纸团、沿什么曲线飞向哪个纸篓、每个阶段多久”。DOM 部分在 task-crumple.js。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const PARAMS = Object.freeze({
        BALL: 34,                 // 纸团直径（CSS px）
        CRUMPLE_MS: 300,          // 揉皱：卡片收缩成纸团
        FLIGHT_MIN_MS: 380,       // 抛出：随距离变化，夹在这个范围内
        FLIGHT_MAX_MS: 620,
        FLIGHT_MS_PER_PX: 0.22,
        DROP_MS: 150,             // 落进纸篓口
        SETTLE_MS: 330,           // 纸篓晃动、淡出（晃动总长 = DROP_MS + SETTLE_MS，正好收在时间线末尾）
        MAX_ACTIVE: 3,            // 同时最多几组；再多的完成动作只正常完成，不再播动效
        CONFIRM_MS: 800,          // 等待任务列表重绘出“已完成”的最长时间；超时说明没有真的完成，撤掉动效
        CONFIRM_POLL_MS: 50,
        MIN_VISIBLE_W: 80,        // 条目露出来的部分小于这个尺寸就不播
        MIN_VISIBLE_H: 28,
        BIN_W: 46,
        BIN_H: 52,
        BIN_GAP: 10,              // 同时多组时，纸篓向左排开的间隔
        BIN_INSET_X: 16,
        BIN_INSET_Y: 8,
        BIN_MOUTH_Y: 11,          // 纸篓口中心距纸篓顶的距离
        MARGIN: 8,                // 纸篓离视口边缘的最小距离
        POINTS: 16,               // 揉皱多边形顶点数（四边各 4 个；各阶段必须相同才能插值）
        FLIGHT_STEPS: 12,
        LIFT_MIN: 90,
        LIFT_MAX: 200,
        LIFT_RATIO: 0.22,
        SPIN_DEG: 540,
        PAPER_FINAL_DEG: 14,      // 纸片收成团时的最终旋转角
        DROP_PX: 16,
        WOBBLE_DEG: -10,
        PULSE_MS: 650,
        BIN_HOT: 40,              // 抓着水母时：指针进入纸篓外框向四周放大这么多像素以内，就算“对准了”（容错，不必精确落在篓口）
        HOLD_FADE_MS: 220,        // 抓着水母时纸篓出现 / 收起的时长
        HOLD_MAX_MS: 120000,      // 兜底：调用方忘了收纸篓时，这么久之后它自己收起，不在页面上留残影
        NEAR_SCALE: 1.16,         // 对准时纸篓略微放大
    });

    const ITEM_SELECTOR = '.sidebar-task-item, .panel-task-item';
    const LIST_SELECTOR = '#sidebar-task-list, #panel-task-list';
    const CLONE_CLASS = 'tc-clone';

    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function round(value, digits) {
        const scale = Math.pow(10, digits === undefined ? 2 : digits);
        return Math.round(value * scale) / scale;
    }

    function rectOf(rect) {
        if (!rect) return null;
        const left = Number(rect.left), top = Number(rect.top);
        const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : Number(rect.right) - left;
        const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : Number(rect.bottom) - top;
        if (![left, top, width, height].every(Number.isFinite)) return null;
        return { left, top, width, height, right: left + width, bottom: top + height };
    }

    function intersect(a, b) {
        if (!a || !b) return null;
        const left = Math.max(a.left, b.left), top = Math.max(a.top, b.top);
        const right = Math.min(a.right, b.right), bottom = Math.min(a.bottom, b.bottom);
        if (right <= left || bottom <= top) return null;
        return { left, top, width: right - left, height: bottom - top, right, bottom };
    }

    // 条目真正看得见的那一块：被列表滚动区域或视口裁掉的部分不画，太小就不播。
    function visibleRect(item, clip, viewport) {
        let rect = rectOf(item);
        if (clip) rect = intersect(rect, rectOf(clip));
        if (rect && viewport) {
            rect = intersect(rect, { left: 0, top: 0, width: viewport.width, height: viewport.height, right: viewport.width, bottom: viewport.height });
        }
        if (!rect || rect.width < PARAMS.MIN_VISIBLE_W || rect.height < PARAMS.MIN_VISIBLE_H) return null;
        return rect;
    }

    // 纸团从哪里“长出来”：优先勾选框中心（像是把勾过的那张纸捏在手里），框不在可见范围内就取左侧中线。
    function originOf(visible, box) {
        const rect = rectOf(box);
        if (rect && rect.width > 0 && rect.height > 0) {
            const x = rect.left + rect.width / 2 - visible.left;
            const y = rect.top + rect.height / 2 - visible.top;
            if (x >= 0 && x <= visible.width && y >= 0 && y <= visible.height) return { x, y };
        }
        return { x: Math.min(24, visible.width / 2), y: visible.height / 2 };
    }

    // 纸篓放在任务列表区域的右下角（卡片右侧通常是空的）；同时多组时依次向左排开，避免半透明叠影。
    function binPlacement(list, viewport, slot) {
        const index = Math.max(0, Math.floor(Number(slot) || 0));
        const w = PARAMS.BIN_W, h = PARAMS.BIN_H, margin = PARAMS.MARGIN;
        const rect = rectOf(list);
        let left, top;
        if (rect) {
            left = rect.right - w - PARAMS.BIN_INSET_X - index * (w + PARAMS.BIN_GAP);
            top = rect.bottom - h - PARAMS.BIN_INSET_Y;
        } else {
            left = viewport.width - w - 24 - index * (w + PARAMS.BIN_GAP);
            top = viewport.height - h - 24;
        }
        left = clamp(left, margin, Math.max(margin, viewport.width - w - margin));
        top = clamp(top, margin, Math.max(margin, viewport.height - h - margin));
        return { left, top, width: w, height: h, mouthX: left + w / 2, mouthY: top + PARAMS.BIN_MOUTH_Y };
    }

    // 抓着水母时的“对准”判定：(x, y) 在纸篓外框向四周放大 BIN_HOT 的范围内（边界含）。坏输入一律 false。
    function inBinZone(bin, x, y) {
        if (!bin || !Number.isFinite(x) || !Number.isFinite(y)) return false;
        const pad = PARAMS.BIN_HOT;
        return x >= bin.left - pad && x <= bin.left + bin.width + pad && y >= bin.top - pad && y <= bin.top + bin.height + pad;
    }

    function flightMs(distance) {
        const raw = PARAMS.FLIGHT_MIN_MS + Math.max(0, distance) * PARAMS.FLIGHT_MS_PER_PX;
        return Math.round(clamp(raw, PARAMS.FLIGHT_MIN_MS, PARAMS.FLIGHT_MAX_MS));
    }

    function liftFor(distance) {
        return clamp(Math.max(0, distance) * PARAMS.LIFT_RATIO, PARAMS.LIFT_MIN, PARAMS.LIFT_MAX);
    }

    // 抛物线：水平匀速、竖直带抛起；u=0.5 处比直线高出 lift。点的坐标是相对起点的位移。
    function arc(dx, dy, lift, steps, spin) {
        const count = Math.max(2, Math.floor(steps || PARAMS.FLIGHT_STEPS));
        const points = [];
        for (let index = 0; index <= count; index++) {
            const u = index / count;
            points.push({ u, x: dx * u, y: dy * u - 4 * lift * u * (1 - u), rot: (spin === undefined ? PARAMS.SPIN_DEG : spin) * u });
        }
        return points;
    }

    // 矩形 → 纸团的各阶段剪裁多边形。顶点数固定为 POINTS，浏览器才能在它们之间插值；抖动让边缘像被揉过。
    function perimeterPoint(index, count) {
        const t = (index / count) * 4;
        const side = Math.floor(t), f = (t - side) * 100;
        if (side === 0) return [f, 0];
        if (side === 1) return [100, f];
        if (side === 2) return [100 - f, 100];
        return [0, 100 - f];
    }

    function circlePoint(index, count) {
        const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
        return [50 + 50 * Math.cos(angle), 50 + 50 * Math.sin(angle)];
    }

    function polygon(points) {
        return 'polygon(' + points.map(point => `${round(point[0], 1)}% ${round(point[1], 1)}%`).join(', ') + ')';
    }

    function crumpledPolygons(random) {
        const rnd = typeof random === 'function' ? random : Math.random;
        const count = PARAMS.POINTS;
        const rect = [], ball = [];
        for (let index = 0; index < count; index++) {
            rect.push(perimeterPoint(index, count));
            ball.push(circlePoint(index, count));
        }
        const stage = (k, jitter) => polygon(rect.map((point, index) => [
            clamp(lerp(point[0], ball[index][0], k) + (rnd() - 0.5) * jitter, 0, 100),
            clamp(lerp(point[1], ball[index][1], k) + (rnd() - 0.5) * jitter, 0, 100),
        ]));
        return { rect: polygon(rect), c1: stage(0.18, 16), c2: stage(0.45, 20), c3: stage(0.78, 14), ball: polygon(ball) };
    }

    // 选择器里的 id 只来自 data-id，仍然转义引号和反斜杠，不让任务 id 改变选择器结构。
    function escapeAttr(value) {
        return String(value).replace(/["\\\n\r]/g, ch => '\\' + (ch === '\n' ? 'a ' : ch === '\r' ? 'd ' : ch));
    }

    function anySelector(id) {
        const v = escapeAttr(id);
        return `.sidebar-task-item[data-id="${v}"]:not(.${CLONE_CLASS}), .panel-task-item[data-id="${v}"]:not(.${CLONE_CLASS})`;
    }

    function doneSelector(id) {
        const v = escapeAttr(id);
        return `.sidebar-task-item[data-id="${v}"].completed:not(.${CLONE_CLASS}), .panel-task-item[data-id="${v}"].completed:not(.${CLONE_CLASS})`;
    }

    function freeSlot(used) {
        const taken = used instanceof Set ? used : new Set(used || []);
        for (let slot = 0; slot < PARAMS.MAX_ACTIVE; slot++) if (!taken.has(slot)) return slot;
        return -1;
    }

    // 是否播放的统一判定（顺序即优先级，reason 供测试与排查）。
    function decide(state) {
        const s = state || {};
        if (!s.supported) return { ok: false, reason: 'unsupported' };
        if (s.enabled === false) return { ok: false, reason: 'disabled' };
        if (s.reduceMotion) return { ok: false, reason: 'reduce-motion' };
        if (s.saveData) return { ok: false, reason: 'save-data' };
        if (s.hidden) return { ok: false, reason: 'hidden' };
        if (!(s.active < PARAMS.MAX_ACTIVE)) return { ok: false, reason: 'busy' };
        return { ok: true, reason: '' };
    }

    // 一组动效的完整时间线（全部是描述，不是 DOM）：同一个总时长上的若干关键帧序列，
    // 由控制器分别交给 Web Animations。offset 都在 [0,1] 且单调不减。
    //   paper   卡片克隆：收缩、揉皱、剪裁成不规则形状，在纸团出现时淡出
    //   shade   盖在克隆上的纸张底色与折痕，越缩越浓
    //   ball    纸团：淡入 → 抛物线飞行 → 沉入纸篓口 → 消失
    //   bin     纸篓（前后两层共用）：从下方升起 → 停留 → 淡出
    //   wobble  纸篓被砸中后的晃动（独立的 rotate 动画，用弹簧缓动）
    function timeline(input, random) {
        const visible = input.visible, origin = input.origin, mouth = input.mouth;
        const sx = PARAMS.BALL / visible.width, sy = PARAMS.BALL / visible.height;
        // 纸片以勾选框为原点缩放、旋转，缩到纸团大小后它的中心并不在勾选框上（而是被原点“拉着”偏向原来的中心一侧）。
        // 纸团要接在这个真实的中心上，否则交接瞬间纸片残影与纸团会错开几像素。
        const finalSpin = PARAMS.PAPER_FINAL_DEG * Math.PI / 180;
        const armX = (visible.width / 2 - origin.x) * sx, armY = (visible.height / 2 - origin.y) * sy;
        const cx = visible.left + origin.x + armX * Math.cos(finalSpin) - armY * Math.sin(finalSpin);
        const cy = visible.top + origin.y + armX * Math.sin(finalSpin) + armY * Math.cos(finalSpin);
        const dx = mouth.x - cx, dy = mouth.y - cy;
        const distance = Math.hypot(dx, dy);
        const flight = flightMs(distance);
        const crumple = PARAMS.CRUMPLE_MS, drop = PARAMS.DROP_MS, settle = PARAMS.SETTLE_MS;
        const total = crumple + flight + drop + settle;
        const a = crumple / total;
        const b = (crumple + flight) / total;
        const c = (crumple + flight + drop) / total;
        const off = value => round(value, 4);
        const polys = crumpledPolygons(random);
        // 缩放比保留 6 位小数：卡片可能有上千像素宽，4 位小数会让收成纸团后的宽度差出零点几像素。
        const squash = (px, py) => `scale(${round(lerp(1, sx, px), 6)}, ${round(lerp(1, sy, py), 6)})`;

        // 宽卡片（长宽比常在 10:1 以上）若横纵等比例收缩，中段会是一条细长薄片，最后才突然变成球。
        // 所以横向收得更快、纵向更慢：先向勾选框“拢成一团”，再变成圆，中段的长宽比一直保持在可信范围。
        const paper = [
            { offset: 0, transform: `rotate(0deg) ${squash(0, 0)}`, clipPath: polys.rect, opacity: 1, easing: 'ease-in-out' },
            { offset: off(a * 0.26), transform: `rotate(-3deg) ${squash(0.6, 0.12)}`, clipPath: polys.c1, opacity: 1, easing: 'ease-in-out' },
            { offset: off(a * 0.52), transform: `rotate(5deg) ${squash(0.88, 0.3)}`, clipPath: polys.c2, opacity: 1, easing: 'ease-in-out' },
            { offset: off(a * 0.78), transform: `rotate(-9deg) ${squash(0.97, 0.6)}`, clipPath: polys.c3, opacity: 1, easing: 'ease-in-out' },
            { offset: off(a), transform: `rotate(${PARAMS.PAPER_FINAL_DEG}deg) ${squash(1, 1)}`, clipPath: polys.ball, opacity: 0, easing: 'linear' },
            { offset: 1, transform: `rotate(${PARAMS.PAPER_FINAL_DEG}deg) ${squash(1, 1)}`, clipPath: polys.ball, opacity: 0 },
        ];

        // 纸张底色要尽早变成不透明：列表在点击后几十毫秒就会重绘，下一张卡片会上移到克隆下面，
        // 半透明的克隆会和它叠出重影。
        const shade = [
            { offset: 0, opacity: 0 },
            { offset: off(a * 0.1), opacity: 0.25 },
            { offset: off(a * 0.4), opacity: 1 },
            { offset: 1, opacity: 1 },
        ];

        const ballAt = (x, y, rot, scale) => `translate(${round(x, 2)}px, ${round(y, 2)}px) rotate(${round(rot, 1)}deg) scale(${round(scale, 3)})`;
        const ball = [
            { offset: 0, opacity: 0, transform: ballAt(0, 0, 0, 0.8) },
            { offset: off(a * 0.7), opacity: 0, transform: ballAt(0, 0, 0, 0.8) },
            { offset: off(a * 0.95), opacity: 1, transform: ballAt(0, 0, 0, 1) },
        ];
        for (const point of arc(dx, dy, liftFor(distance), PARAMS.FLIGHT_STEPS, PARAMS.SPIN_DEG)) {
            ball.push({ offset: off(a + (b - a) * point.u), opacity: 1, transform: ballAt(point.x, point.y, point.rot, 1 - 0.1 * point.u) });
        }
        const sunk = ballAt(dx, dy + PARAMS.DROP_PX, PARAMS.SPIN_DEG + 50, 0.66);
        ball.push({ offset: off(c), opacity: 1, transform: sunk });
        ball.push({ offset: off(c + (1 - c) * 0.12), opacity: 0, transform: sunk });
        ball.push({ offset: 1, opacity: 0, transform: sunk });

        const bin = [
            { offset: 0, opacity: 0, transform: 'translateY(16px) scale(0.86)' },
            { offset: off(a * 0.75), opacity: 1, transform: 'translateY(0px) scale(1)' },
            { offset: off(c + (1 - c) * 0.55), opacity: 1, transform: 'translateY(0px) scale(1)' },
            { offset: 1, opacity: 0, transform: 'translateY(8px) scale(0.96)' },
        ];

        return {
            total, a: off(a), b: off(b), c: off(c), flight, distance,
            ballStart: { x: cx, y: cy }, land: { dx, dy },
            paper, shade, ball, bin,
            wobble: { delay: crumple + flight, duration: drop + settle, from: PARAMS.WOBBLE_DEG },
            pulse: { delay: Math.round(crumple + flight + drop * 0.6), duration: PARAMS.PULSE_MS },
        };
    }

    return {
        PARAMS, ITEM_SELECTOR, LIST_SELECTOR, CLONE_CLASS,
        clamp, lerp, rectOf, intersect, visibleRect, originOf, binPlacement, inBinZone,
        flightMs, liftFor, arc, crumpledPolygons, escapeAttr, anySelector, doneSelector,
        freeSlot, decide, timeline,
    };
});
