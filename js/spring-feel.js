// 弹簧手感：阻尼弹簧曲线（CSS linear()）+ 元素重排时的 FLIP 回弹。
// CSS 里的 --spring-* 变量由这里的公式生成，test/spring-feel-css.test.js 保证两边一致。
// 说明见 docs/technical/touch-feel-weave-liquid-clock-20261014.md 的“弹簧手感”。
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.SpringFeel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // 阻尼弹簧的单位阶跃响应：x(t) = 1 − e^(−ζωt)·(cos ωd·t + ζω/ωd · sin ωd·t)，ωd = ω·√(1−ζ²)。
    // settle 是曲线总时长（秒）：到这一刻包络衰减到 ENVELOPE_END，末点取 1（最大跳变 0.4%，肉眼不可见）。
    // 阻尼比 zeta 越小回弹越多：snappy 约 3.8% 过冲，soft 约 12.6%，bouncy 约 27.5%。
    const ENVELOPE_END = 0.004;
    const POINTS = 56;
    const PRESETS = Object.freeze({
        snappy: Object.freeze({ zeta: 0.72, settle: 0.42 }),
        soft: Object.freeze({ zeta: 0.56, settle: 0.6 }),
        bouncy: Object.freeze({ zeta: 0.38, settle: 0.75 }),
    });
    // 浏览器不支持 linear()（Chrome < 113）时的近似：单次过冲的 cubic-bezier。
    const FALLBACKS = Object.freeze({
        snappy: 'cubic-bezier(0.3, 1.25, 0.5, 1)',
        soft: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
        bouncy: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    const PRESET_NAMES = Object.freeze(Object.keys(PRESETS));

    function preset(name) {
        const found = PRESETS[name];
        if (!found) throw new RangeError('未知的弹簧预设：' + name);
        return found;
    }

    // 预设在 t 秒时的位置（0 → 1，过冲时 > 1）。t <= 0 为 0，t >= settle 为 1。
    function value(name, t) {
        const { zeta, settle } = preset(name);
        if (!(t > 0)) return 0;
        if (t >= settle) return 1;
        const omega = -Math.log(ENVELOPE_END) / (zeta * settle);
        const damped = omega * Math.sqrt(1 - zeta * zeta);
        const decay = Math.exp(-zeta * omega * t);
        return 1 - decay * (Math.cos(damped * t) + (zeta * omega / damped) * Math.sin(damped * t));
    }

    function samples(name, points = POINTS) {
        const { settle } = preset(name);
        const out = [];
        for (let i = 0; i <= points; i += 1) {
            if (i === 0) out.push(0);
            else if (i === points) out.push(1);
            else out.push(Number(value(name, (settle * i) / points).toFixed(4)));
        }
        return out;
    }

    // 过冲峰值（>= 1），用于测试与文档。
    function peak(name) {
        return Math.max(...samples(name, 400));
    }

    // linear(0, 0.0123, …, 1)：采样点等距分布。
    function linear(name, points = POINTS) {
        return 'linear(' + samples(name, points).join(', ') + ')';
    }

    function durationMs(name) {
        return Math.round(preset(name).settle * 1000);
    }

    function reducedMotion(win) {
        try { return !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { return false; }
    }

    function supportsLinear(win) {
        try { return !!win?.CSS?.supports?.('animation-timing-function', 'linear(0, 1)'); } catch { return false; }
    }

    // 当前浏览器能用的缓动：优先真弹簧，否则退回单次过冲。
    function easing(name, win) {
        preset(name);
        return supportsLinear(win) ? linear(name) : FALLBACKS[name];
    }

    // ---- FLIP 回弹：重排前记位置，重排后让元素从旧位置弹回新位置 ----
    // 用独立的 translate 属性而不是 transform：Dock 的放大/果冻效果会在元素上写内联 transform，
    // translate 与 transform 相互叠加，不会互相覆盖。
    const ANIMATION_ID = 'spring-feel-settle';
    const MIN_MOVE = 0.75;        // 位移小于它不值得动画
    const MAX_MOVE = 720;         // 位移大于它多半是窗口缩放/布局切换，不做回弹
    const MAX_ANIMATED = 40;
    // 过冲量与位移成正比（bouncy 为 27%：移 400px 会冲出 110px），所以位移越长越降级。
    // options.preset 是上限；短距离保持它，超过 LONG_MOVE 至多 soft，超过 VERY_LONG_MOVE 至多 snappy。
    const LONG_MOVE = 140;
    const VERY_LONG_MOVE = 320;
    const STIFFNESS_ORDER = Object.freeze(['bouncy', 'soft', 'snappy']);   // 由弹到稳

    function currentWindow(options) {
        if (options && options.win) return options.win;
        return typeof window !== 'undefined' ? window : null;
    }

    function itemsOf(container, options) {
        if (!container || typeof container.querySelectorAll !== 'function') return [];
        return Array.from(container.querySelectorAll(options.selector || '[data-spring-key]'));
    }

    function keyOf(element, options) {
        try {
            const key = options.key ? options.key(element) : element.dataset?.springKey;
            return typeof key === 'string' && key ? key : '';
        } catch { return ''; }
    }

    function cancelRunning(element) {
        try {
            if (typeof element.getAnimations !== 'function') return;
            for (const animation of element.getAnimations()) {
                if (animation.id === ANIMATION_ID) animation.cancel();
            }
        } catch { /* 取消失败只是旧动画自己跑完 */ }
    }

    // 记下每个元素“此刻肉眼所见”的位置（包含还在进行的回弹），并取消旧回弹，新的从这里开始。
    function capture(container, options = {}) {
        const positions = new Map();
        for (const element of itemsOf(container, options)) {
            const key = keyOf(element, options);
            if (!key) continue;
            let rect;
            try { rect = element.getBoundingClientRect(); } catch { continue; }
            if (!(rect.width > 0 && rect.height > 0)) continue;
            positions.set(key, { left: rect.left, top: rect.top });
            cancelRunning(element);
        }
        return positions;
    }

    // 按位移选预设：不超过上限预设的弹性，长距离只降不升。
    function presetForDistance(top, distance) {
        const start = Math.max(0, STIFFNESS_ORDER.indexOf(top));
        const floor = distance > VERY_LONG_MOVE ? 2 : distance > LONG_MOVE ? 1 : 0;
        return STIFFNESS_ORDER[Math.max(start, floor)];
    }

    // 重排后调用：位置变了的元素从旧位置弹回来。返回实际启动的动画数，永不抛错。
    function settle(container, before, options = {}) {
        const result = { animated: 0, skipped: 0 };
        if (!before || !before.size) return result;
        const win = currentWindow(options);
        if (reducedMotion(win)) return result;
        const top = options.preset || 'bouncy';
        try { preset(top); } catch { return result; }
        for (const element of itemsOf(container, options)) {
            if (result.animated >= MAX_ANIMATED) break;
            const key = keyOf(element, options);
            const from = key ? before.get(key) : null;
            if (!from || typeof element.animate !== 'function') continue;
            let rect;
            try { rect = element.getBoundingClientRect(); } catch { continue; }
            if (!(rect.width > 0 && rect.height > 0)) continue;
            const dx = from.left - rect.left;
            const dy = from.top - rect.top;
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            if (distance < MIN_MOVE || distance > MAX_MOVE) { result.skipped += 1; continue; }
            try {
                const name = presetForDistance(top, distance);
                const animation = element.animate(
                    [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
                    { duration: options.duration || durationMs(name), easing: easing(name, win), fill: 'none' },
                );
                animation.id = ANIMATION_ID;
                result.animated += 1;
            } catch { /* 浏览器不认 translate 关键帧：保持原来的瞬间重排 */ }
        }
        return result;
    }

    return {
        PRESETS, PRESET_NAMES, FALLBACKS, ANIMATION_ID, MIN_MOVE, MAX_MOVE, MAX_ANIMATED, POINTS,
        LONG_MOVE, VERY_LONG_MOVE,
        value, samples, peak, linear, durationMs, easing, supportsLinear, reducedMotion, presetForDistance,
        capture, settle,
    };
});
