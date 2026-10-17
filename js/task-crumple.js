(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./task-crumple-core.js')
        : root && root.TaskCrumpleCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof document !== 'undefined') {
        root.TaskCrumple = api.create();
        root.TaskCrumple.init();
    }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 任务完成“揉纸入篓”：用户点任务条目的勾选框时，那张卡片的视觉副本揉成纸团、划一道抛物线扔进右下角的纸篓。
    // 这是纯视觉层：只读 DOM（位置、样式、克隆），不读写任何任务数据、不改 memo.js 的完成流程，
    // 完成与否仍由 memo.js 自己决定；这里只用列表重绘后的 .completed 条目确认“确实完成了”，没确认就撤掉动效。
    // 几何与时间线在 task-crumple-core.js。设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const P = Core.PARAMS;

    // 纸篓分前后两层：后层是篓口里面的暗色椭圆，前层是篓身。纸团夹在两层之间，下落时就像掉进了篓里。
    // 只用纯色填充：多组同时出现时 SVG 渐变 id 会重名。
    const BIN_BACK = '<svg viewBox="0 0 46 52" aria-hidden="true" focusable="false"><ellipse cx="23" cy="11" rx="18" ry="4.6" fill="#10141b"/></svg>';
    const BIN_FRONT = '<svg viewBox="0 0 46 52" aria-hidden="true" focusable="false">'
        + '<path d="M5.5 11 L40.5 11 L36.6 47 Q36.3 50 33 50 L13 50 Q9.7 50 9.4 47 Z" fill="#7b869b"/>'
        + '<path d="M5.5 11 L40.5 11 L39.7 18 L6.3 18 Z" fill="rgba(255,255,255,0.14)"/>'
        + '<path d="M16 21 L17.2 45 M23 21 L23 45 M30 21 L28.8 45" stroke="rgba(255,255,255,0.3)" stroke-width="1.8" stroke-linecap="round" fill="none"/>'
        + '<path d="M4.2 11 L41.8 11" stroke="#cdd4e1" stroke-width="2.4" stroke-linecap="round"/>'
        + '</svg>';

    function create(env = {}) {
        const doc = env.document || (typeof document !== 'undefined' ? document : null);
        const win = env.window || (typeof window !== 'undefined' ? window : null);
        const setTimer = env.setTimeout || setTimeout;
        const clearTimer = env.clearTimeout || clearTimeout;
        const clock = env.now || (() => (win && win.performance ? win.performance.now() : Date.now()));
        const random = env.random || Math.random;

        const runs = new Set();
        let layer = null;
        let attached = false;

        function liveSettings() {
            return (win && win.backgroundExperience && win.backgroundExperience.settings) || null;
        }

        function gate() {
            const settings = liveSettings();
            return Core.decide({
                supported: !!(doc && win && doc.body && typeof doc.createElement === 'function'),
                enabled: !(settings && (settings.enabled === false || settings.taskCrumple === false)),
                reduceMotion: !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches),
                saveData: !!(win && win.navigator && win.navigator.connection && win.navigator.connection.saveData === true),
                hidden: !!(doc && doc.hidden),
                active: runs.size,
            });
        }

        function make(className, parent) {
            const node = doc.createElement('div');
            node.className = className;
            if (parent) parent.appendChild(node);
            return node;
        }

        function ensureLayer() {
            if (layer && layer.isConnected !== false && layer.parentNode) return layer;
            layer = make('task-crumple-layer');
            layer.setAttribute('aria-hidden', 'true');
            layer.setAttribute('inert', '');
            doc.body.appendChild(layer);
            return layer;
        }

        function place(node, left, top, width, height) {
            node.style.left = `${left}px`;
            node.style.top = `${top}px`;
            if (width !== undefined) node.style.width = `${width}px`;
            if (height !== undefined) node.style.height = `${height}px`;
        }

        function childrenOf(node) {
            return Array.prototype.slice.call(node.children || []);
        }

        // 悬停才出现的内容（任务操作按钮、勾选框放大）在克隆里没有 :hover，所以把当前真实的显隐/变换固定下来。
        function mirrorState(source, copy) {
            const own = childrenOf(source), twin = childrenOf(copy);
            for (let index = 0; index < own.length && index < twin.length; index++) {
                const style = win.getComputedStyle(own[index]);
                if (style.opacity !== '1') twin[index].style.opacity = style.opacity;
                if (style.visibility !== 'visible') twin[index].style.visibility = style.visibility;
                if (style.transform && style.transform !== 'none') twin[index].style.transform = style.transform;
                mirrorState(own[index], twin[index]);
            }
        }

        // 克隆 = 完成后的样子：套 .completed（划线、绿勾），与列表重绘后的真实条目一致，不会在交接瞬间闪回“未完成”。
        // 去掉 id / data-id：克隆不能被页面当成真实条目查到，也不能和真实 DOM 重复 id。
        function buildClone(item, rect, visible, view) {
            const clone = item.cloneNode(true);
            clone.removeAttribute('id');
            clone.removeAttribute('data-id');
            clone.removeAttribute('data-index');
            clone.removeAttribute('draggable');
            clone.setAttribute('aria-hidden', 'true');
            clone.setAttribute('inert', '');
            clone.classList.add(Core.CLONE_CLASS, 'completed');
            for (const node of Array.prototype.slice.call(clone.querySelectorAll('[id]'))) node.removeAttribute('id');
            const icon = clone.querySelector('.task-checkbox i');
            if (icon) icon.className = 'fas fa-check-circle';
            const box = clone.querySelector('.task-checkbox');
            if (box) box.setAttribute('title', '标记为未完成');
            mirrorState(item, clone);

            const style = win.getComputedStyle(item);
            const layoutW = item.offsetWidth || rect.width;
            const layoutH = item.offsetHeight || rect.height;
            const kx = rect.width / layoutW, ky = rect.height / layoutH;
            clone.style.position = 'absolute';
            clone.style.margin = '0';
            clone.style.opacity = '1';
            clone.style.color = style.color;
            clone.style.fontFamily = style.fontFamily;
            clone.style.fontSize = style.fontSize;
            clone.style.lineHeight = style.lineHeight;
            clone.style.letterSpacing = style.letterSpacing;
            place(clone, rect.left - visible.left, rect.top - visible.top, layoutW, layoutH);
            // 祖先带缩放时（面板入场过渡），用同样的缩放还原看到的尺寸。
            clone.style.transformOrigin = '0px 0px';
            clone.style.transform = (Math.abs(kx - 1) > 0.02 || Math.abs(ky - 1) > 0.02) ? `scale(${kx}, ${ky})` : '';
            return { clone, radius: style.borderRadius };
        }

        function animate(run, node, frames, options) {
            if (!node || typeof node.animate !== 'function') return null;
            const animation = node.animate(frames, options);
            run.animations.push(animation);
            return animation;
        }

        function springEasing() {
            try {
                if (win && win.SpringFeel && typeof win.SpringFeel.easing === 'function') return win.SpringFeel.easing('bouncy', win);
            } catch { /* 退回普通缓动 */ }
            return 'ease-out';
        }

        function finish(run) {
            if (run.done) return;
            run.done = true;
            for (const timer of run.timers) clearTimer(timer);
            run.timers.length = 0;
            try { if (run.root && run.root.parentNode) run.root.parentNode.removeChild(run.root); } catch { /* 已被移除 */ }
            runs.delete(run);
            if (!runs.size && layer) {
                try { if (layer.parentNode) layer.parentNode.removeChild(layer); } catch { /* 已被移除 */ }
                layer = null;
            }
        }

        // 没等到列表重绘出“已完成”：说明这次点击没有真的完成任务，淡出并撤掉，不假装发生过。
        function abort(run) {
            if (run.done || run.aborted) return;
            run.aborted = true;
            try {
                if (run.root && typeof run.root.animate === 'function') {
                    run.root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
                }
            } catch { /* 动画失败就直接移除 */ }
            run.timers.push(setTimer(() => finish(run), 160));
        }

        // 真实条目落定时给一次轻微的绿色光圈，让人看到“完成记录”落在了哪里（任务完成后会排到分组末尾，位置会变）。
        function pulse(run, found) {
            if (!found || typeof found.animate !== 'function') return;
            const plan = run.plan.pulse;
            const delay = Math.max(0, plan.delay - (clock() - run.startedAt));
            try {
                found.animate(
                    [{ boxShadow: '0 0 0 0 rgba(94, 234, 170, 0.55)' }, { boxShadow: '0 0 0 12px rgba(94, 234, 170, 0)' }],
                    { duration: plan.duration, delay, easing: 'ease-out', fill: 'none' }
                );
            } catch { /* 光圈只是装饰 */ }
        }

        function poll(run) {
            if (run.done || run.aborted) return;
            let found = null;
            let confirmed = false;
            try {
                found = doc.querySelector(Core.doneSelector(run.id));
                confirmed = !!found;
                // 列表已经重绘、旧节点被换掉，而且新列表里没有这一条（例如筛选“未完成”）：同样说明任务已经被处理。
                if (!confirmed && run.item.isConnected === false && !doc.querySelector(Core.anySelector(run.id))) confirmed = true;
            } catch { /* 查询失败按未确认处理 */ }
            if (confirmed) {
                run.confirmed = true;
                pulse(run, found);
                return;
            }
            if (clock() - run.startedAt >= P.CONFIRM_MS) { abort(run); return; }
            run.timers.push(setTimer(() => poll(run), P.CONFIRM_POLL_MS));
        }

        function start(item, box, id) {
            const view = { width: win.innerWidth, height: win.innerHeight };
            const rect = item.getBoundingClientRect();
            const listEl = item.closest(Core.LIST_SELECTOR);
            const listRect = listEl ? listEl.getBoundingClientRect() : null;
            const visible = Core.visibleRect(rect, listRect, view);
            if (!visible) return null;
            const used = new Set();
            for (const other of runs) used.add(other.slot);
            const slot = Core.freeSlot(used);
            if (slot < 0) return null;

            const origin = Core.originOf(visible, box.getBoundingClientRect());
            const bin = Core.binPlacement(listRect, view, slot);
            const plan = Core.timeline({ visible, origin, mouth: { x: bin.mouthX, y: bin.mouthY } }, random);
            const run = { id, item, slot, plan, startedAt: clock(), done: false, aborted: false, confirmed: false, animations: [], timers: [], root: null };
            runs.add(run);
            try {
                const host = ensureLayer();
                const root = make('tc-run', host);
                run.root = root;

                const binBack = make('tc-bin tc-bin-back', root);
                binBack.innerHTML = BIN_BACK;
                place(binBack, bin.left, bin.top, bin.width, bin.height);

                const paper = make('tc-paper', root);
                place(paper, visible.left, visible.top, visible.width, visible.height);
                paper.style.transformOrigin = `${origin.x}px ${origin.y}px`;
                const built = buildClone(item, rect, visible, view);
                if (built.radius) paper.style.borderRadius = built.radius;
                paper.appendChild(built.clone);
                const shade = make('tc-shade', paper);

                const ball = make('tc-ball', root);
                place(ball, plan.ballStart.x - P.BALL / 2, plan.ballStart.y - P.BALL / 2, P.BALL, P.BALL);

                const binFront = make('tc-bin tc-bin-front', root);
                binFront.innerHTML = BIN_FRONT;
                place(binFront, bin.left, bin.top, bin.width, bin.height);

                const options = { duration: plan.total, fill: 'both', iterations: 1 };
                animate(run, paper, plan.paper, options);
                animate(run, shade, plan.shade, options);
                animate(run, ball, plan.ball, options);
                animate(run, binBack, plan.bin, options);
                animate(run, binFront, plan.bin, options);
                const easing = springEasing();
                for (const part of [binBack, binFront]) {
                    animate(run, part, [{ rotate: `${plan.wobble.from}deg` }, { rotate: '0deg' }],
                        { duration: plan.wobble.duration, delay: plan.wobble.delay, easing, fill: 'none' });
                }

                const settle = () => finish(run);
                for (const animation of run.animations) {
                    if (animation && animation.finished && typeof animation.finished.then === 'function') {
                        animation.finished.then(settle, settle);
                        break;   // 所有动画同一时刻结束，等任意一个就够了；被取消时同样走清理
                    }
                }
                run.timers.push(setTimer(settle, plan.total + 700));   // 兜底：页面隐藏、动画被取消等情况下也不留残影
                run.timers.push(setTimer(() => poll(run), P.CONFIRM_POLL_MS));
            } catch (error) {
                finish(run);
                throw error;
            }
            return run;
        }

        function onClick(event) {
            try {
                const target = event && event.target;
                if (!target || typeof target.closest !== 'function') return;
                const box = target.closest('.task-checkbox');
                if (!box) return;
                const item = box.closest(Core.ITEM_SELECTOR);
                if (!item || !item.classList) return;
                // 只在“未完成 → 完成”时播放；再点一下取消完成、失败态任务（memo.js 里直接忽略点击）都不播。
                if (item.classList.contains('completed') || item.classList.contains('failed')) return;
                const id = item.dataset && item.dataset.id;
                if (!id) return;
                if (!gate().ok) return;
                start(item, box, id);
            } catch { /* 装饰层任何异常都不能影响任务本身的完成流程 */ }
        }

        // 抓着水母时的纸篓：水母皮肤把水母抓起来拖向它。同样是纯视觉——升起、对准时放大发光、吞下时晃一下、收起；
        // 不读写任何数据，落没落进去、任务完不完成由调用方决定。复用同一个动效层、同一套槽位与几何（binPlacement），
        // 所以抓着水母时若恰好有揉纸动效，两个纸篓会向左错开而不是叠在一起。
        // 与揉纸不同，它不看“任务完成揉纸”开关（那是另一个效果；这里是抓取完成的落点，是否启用由调用方的开关决定），
        // 但仍受背景体验总开关、减少动态效果（动效层整层隐藏，纸篓没有意义）、页面隐藏限制。
        // 返回句柄 { mouth, rect, contains, setNear, gulp, release, isActive }；不能用（被限制、槽位满、构建失败）时返回 null，调用方不应开始抓取。
        function holdBin() {
            const settings = liveSettings();
            let others = 0;
            for (const other of runs) if (other.kind !== 'hold') others++;
            const verdict = Core.decide({
                supported: !!(doc && win && doc.body && typeof doc.createElement === 'function'),
                enabled: !(settings && settings.enabled === false),
                reduceMotion: !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches),
                saveData: false,
                hidden: !!(doc && doc.hidden),
                active: others,
            });
            if (!verdict.ok) return null;
            for (const old of Array.from(runs)) if (old.kind === 'hold') finish(old);        // 同一时刻只留一个
            const used = new Set();
            for (const other of runs) used.add(other.slot);
            const slot = Core.freeSlot(used);
            if (slot < 0) return null;

            const bin = Core.binPlacement(null, { width: win.innerWidth, height: win.innerHeight }, slot);
            const run = { id: null, kind: 'hold', item: null, slot, plan: null, startedAt: clock(), done: false, aborted: false, confirmed: false, ending: false, near: false, animations: [], timers: [], root: null };
            runs.add(run);
            let parts;
            try {
                const host = ensureLayer();
                const root = make('tc-run tc-hold', host);
                run.root = root;
                const back = make('tc-bin tc-bin-back', root);
                back.innerHTML = BIN_BACK;
                const front = make('tc-bin tc-bin-front', root);
                front.innerHTML = BIN_FRONT;
                parts = [back, front];
                for (const part of parts) place(part, bin.left, bin.top, bin.width, bin.height);
                for (const part of parts) {
                    animate(run, part, [
                        { opacity: 0, transform: 'translateY(16px) scale(0.86)' },
                        { opacity: 1, transform: 'translateY(0px) scale(1)' },
                    ], { duration: P.HOLD_FADE_MS, easing: 'ease-out', fill: 'forwards' });
                }
            } catch {
                finish(run);
                return null;                      // 装饰层构建失败：不抛，调用方据此放弃这次抓取
            }

            function fadeOut() {
                for (const part of parts) {
                    animate(run, part, [
                        { opacity: 1, transform: 'translateY(0px) scale(1)' },
                        { opacity: 0, transform: 'translateY(8px) scale(0.96)' },
                    ], { duration: P.HOLD_FADE_MS, easing: 'ease-in', fill: 'forwards' });
                }
                run.timers.push(setTimer(() => finish(run), P.HOLD_FADE_MS + 40));
            }

            // delayMs 之后淡出收起；只收一次，收起后句柄上的其余操作都是空操作
            function close(delayMs) {
                if (run.done || run.ending) return;
                run.ending = true;
                if (delayMs > 0) run.timers.push(setTimer(() => { if (!run.done) fadeOut(); }, delayMs));
                else fadeOut();
            }

            run.timers.push(setTimer(() => close(0), P.HOLD_MAX_MS));
            return {
                mouth: () => ({ x: bin.mouthX, y: bin.mouthY }),
                rect: () => ({ left: bin.left, top: bin.top, width: bin.width, height: bin.height }),
                contains: (x, y) => !run.done && !run.ending && Core.inBinZone(bin, x, y),
                isActive: () => !run.done && !run.ending,
                setNear(on) {
                    const next = !!on;
                    if (run.done || run.ending || next === run.near) return;
                    run.near = next;
                    const from = next ? '1' : String(P.NEAR_SCALE);
                    const to = next ? String(P.NEAR_SCALE) : '1';
                    const calm = 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35))';
                    const glow = `${calm} drop-shadow(0 0 12px rgba(110, 235, 190, 0.9))`;
                    const [back, front] = parts;
                    animate(run, back, [{ scale: from }, { scale: to }], { duration: 160, easing: 'ease-out', fill: 'forwards' });
                    animate(run, front, [{ scale: from, filter: next ? calm : glow }, { scale: to, filter: next ? glow : calm }],
                        { duration: 160, easing: 'ease-out', fill: 'forwards' });
                },
                gulp() {
                    if (run.done || run.ending) return;
                    const easing = springEasing();
                    for (const part of parts) {
                        animate(run, part, [{ rotate: `${P.WOBBLE_DEG}deg` }, { rotate: '0deg' }],
                            { duration: P.DROP_MS + P.SETTLE_MS, easing, fill: 'none' });
                    }
                    close(P.DROP_MS + P.SETTLE_MS);
                },
                release() { close(0); },
            };
        }

        function attach() {
            if (attached || !doc || typeof doc.addEventListener !== 'function') return;
            attached = true;
            // 捕获阶段：赶在 memo.js 的点击处理与列表重绘之前量到原始条目。
            doc.addEventListener('click', onClick, true);
        }

        function detach() {
            if (!attached) return;
            attached = false;
            doc.removeEventListener('click', onClick, true);
            for (const run of Array.from(runs)) finish(run);
        }

        return {
            init: attach, attach, detach, onClick, holdBin,
            activeCount: () => runs.size,
            _runs: runs,
        };
    }

    return { create };
});
