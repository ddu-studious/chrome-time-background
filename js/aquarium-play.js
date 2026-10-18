(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports) ? require('./aquarium-play-core.js') : root && root.AquariumPlayCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumPlay = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (PlayCore) {
    'use strict';

    // 水族馆玩法的画法与“喂食”按钮。状态与规则在 aquarium-play-core.js，本文件只读它的状态来画，并管理喂食按钮的指针交互。
    // 画在背景体验的共享画布上，宿主的合成方式是 screen（只会变亮），所以要在亮壁纸上也看得见的东西（饲料、涟漪）
    // 会先用 source-over 垫一层深色细边；每个函数自己 save/restore，不改宿主的画布状态。
    // 不读写存储、不请求网络、不拼 HTML 字符串（只建元素、只设文字与样式）。设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md。

    const P = PlayCore.PARAMS;
    const TAU = Math.PI * 2;
    const DRAG_PX = 6;                 // 与鱼的抓取一样：拖过这么远才算“拖”，之前松手只是点了一下
    const SWALLOW_MS = 450;            // 拖拽松手后这么久内到来的 click 不再撒一次饲料（与宿主吞掉点击的时长一致）
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1).toFixed(3)})`;
    const ok = (...values) => values.every(Number.isFinite);

    // ---------- 画法 ----------

    /** 画在鱼后面的：涟漪。view = { scale, lowPower }。 */
    function drawBack(ctx, play, view) {
        if (!play.ripples.length) return;
        const k = view && Number.isFinite(view.scale) ? view.scale : 1;
        ctx.save();
        for (const r of play.ripples) {
            if (!ok(r.x, r.y, r.t)) continue;
            const u = clamp(r.t / P.RIPPLE_S, 0, 1);
            const radius = P.RIPPLE_R * k * (1 - (1 - u) * (1 - u));
            const fade = Math.pow(1 - u, 1.5);
            const width = (2.4 * (1 - u) + 0.6) * k;
            ctx.globalCompositeOperation = 'source-over';              // 深色细圈垫底：亮壁纸上 screen 的浅色圈看不见
            ctx.strokeStyle = rgba(20, 50, 80, 0.2 * fade);
            ctx.lineWidth = width + 1;
            ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = rgba(170, 225, 255, 0.6 * fade);
            ctx.lineWidth = width;
            ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.stroke();
            if (!(view && view.lowPower)) {
                ctx.strokeStyle = rgba(170, 225, 255, 0.32 * fade);
                ctx.lineWidth = width * 0.6;
                ctx.beginPath(); ctx.arc(r.x, r.y, radius * 0.62, 0, TAU); ctx.stroke();
            }
        }
        ctx.restore();
    }

    /** 画在鱼前面的：饲料与泡。 */
    function drawFront(ctx, play, view) {
        if (!play.pellets.length && !play.bubbles.length) return;
        const k = view && Number.isFinite(view.scale) ? view.scale : 1;
        const low = !!(view && view.lowPower);
        ctx.save();
        for (const p of play.pellets) {
            if (!ok(p.x, p.y, p.t, p.life)) continue;
            const fade = clamp((1 - p.t / p.life) / 0.2, 0, 1);       // 最后 20% 的寿命渐渐淡出
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = rgba(255, 190, 90, 0.95 * fade);
            ctx.strokeStyle = rgba(110, 60, 10, 0.55 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * k, 0, TAU); ctx.fill(); ctx.stroke();
            if (!low) {
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = rgba(255, 170, 70, 0.22 * fade);
                ctx.beginPath(); ctx.arc(p.x, p.y, 7 * k, 0, TAU); ctx.fill();
            }
        }
        ctx.globalCompositeOperation = 'screen';
        for (const b of play.bubbles) {
            if (!ok(b.x, b.y, b.r, b.t, b.life)) continue;
            const fade = clamp((b.life - b.t) / 0.5, 0, 1);
            ctx.strokeStyle = rgba(200, 235, 255, 0.6 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
            if (!low) {
                ctx.fillStyle = rgba(255, 255, 255, 0.5 * fade);
                ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.25), 0, TAU); ctx.fill();
            }
        }
        ctx.restore();
    }

    // ---------- 喂食按钮 ----------

    /**
     * 在 parent 里挂一个“喂食”按钮并管理它的指针交互。hooks：
     * - doc（必需）：document；win（可选）：window，用来在失焦时取消拖拽；now（可选）：毫秒时钟；
     * - feed(point | null)：点一下按钮（或键盘 Enter/空格）时 point 为 null；从按钮拖出去在水里松手时是松手处 { x, y }；
     * - overUi(x, y)：松手处是不是还在托盘上（是则取消，不撒）。
     * 返回 { button, setEnabled(enabled, reason, describedBy), destroy() }。
     * 取消拖拽的方式：松在托盘上、Esc、窗口失焦、pointercancel。
     */
    function mountFeed(parent, hooks) {
        const { doc, win } = hooks;
        const now = hooks.now || (() => Date.now());
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'aq-feed';
        button.textContent = '喂食';
        const label = '喂食：点一下从上面撒饲料，或按住拖到水里松手';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        parent.appendChild(button);

        let drag = null;                 // { x, y, id, dragging, ghost }
        let swallowUntil = 0;
        let enabled = true;

        const makeGhost = () => {
            const ghost = doc.createElement('div');
            ghost.className = 'aq-feed-ghost';
            ghost.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 3; i++) ghost.appendChild(doc.createElement('span'));
            doc.body.appendChild(ghost);
            return ghost;
        };
        const place = (ghost, x, y) => { ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; };

        function detach() {
            if (typeof doc.removeEventListener === 'function') {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onCancel);
                doc.removeEventListener('keydown', onKey);
            }
            if (win && typeof win.removeEventListener === 'function') win.removeEventListener('blur', onCancel);
        }
        function finish() {
            const d = drag;
            drag = null;
            detach();
            if (d && d.ghost) d.ghost.remove();
            return d;
        }
        function onMove(event) {
            if (!drag || !ok(event.clientX, event.clientY)) return;
            if (!drag.dragging) {
                if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_PX) return;
                drag.dragging = true;
                drag.ghost = makeGhost();
            }
            place(drag.ghost, event.clientX, event.clientY);
        }
        function onUp(event) {
            const d = finish();
            if (!d || !d.dragging) return;                                   // 没拖过：随后的 click 负责撒饲料
            swallowUntil = now() + SWALLOW_MS;
            if (!ok(event.clientX, event.clientY) || hooks.overUi(event.clientX, event.clientY)) return;
            hooks.feed({ x: event.clientX, y: event.clientY });
        }
        function onCancel() {
            const d = finish();
            if (d && d.dragging) swallowUntil = now() + SWALLOW_MS;
        }
        function onKey(event) {
            if (event && event.key === 'Escape') onCancel();
        }
        function onDown(event) {
            if (!enabled || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
            if (drag) finish();
            drag = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false, ghost: null };
            doc.addEventListener('pointermove', onMove);
            doc.addEventListener('pointerup', onUp);
            doc.addEventListener('pointercancel', onCancel);
            doc.addEventListener('keydown', onKey);
            if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', onCancel);
        }
        function onClick() {
            if (!enabled || now() < swallowUntil) return;
            hooks.feed(null);
        }
        button.addEventListener('pointerdown', onDown);
        button.addEventListener('click', onClick);

        return {
            button,
            setEnabled(on, reason, describedBy) {
                enabled = !!on;
                button.disabled = !enabled;
                if (!enabled && drag) finish();
                button.setAttribute('title', enabled || !reason ? label : reason);
                if (!enabled && describedBy) button.setAttribute('aria-describedby', describedBy);
                else button.removeAttribute('aria-describedby');
            },
            destroy() {
                finish();
                button.remove();
            },
        };
    }

    return { drawBack, drawFront, mountFeed, DRAG_PX, SWALLOW_MS };
});
