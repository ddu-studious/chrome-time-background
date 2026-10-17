(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./clock-liquid-core.js')
        : root && root.ClockLiquidCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof document !== 'undefined') {
        root.ClockLiquid = api.create();
        root.ClockLiquid.init();
    }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 液态时钟：鼠标划过首页时钟那一行（时间、日期、农历、节日所在的横带）时，这一整块文字像压在同一层液态玻璃下被涂抹、泛起涟漪，停手后自动恢复。
    // 画布与触发带横向铺满整个视口（2026-10-15），纵向仍是文字块上下外扩 PAD：从屏幕任意位置划过时钟那一行都会起效，
    // 涟漪与水痕也会留在整条横带上；文字被推走的距离仍受 PARAMS.maxSmear 限制。
    // 绘制分两层：文字层只处理并上传“文字附近”的脏矩形，涟漪层是每格一个像素的小画布、由 drawImage 放大铺满整幅，
    // 这样每帧成本只与文字块大小有关、不随视口宽度增长（见 draw()）。
    // 模拟与渲染在 clock-liquid-core.js；这里只负责 DOM：量每一行文字的位置、盖一块 canvas、把原文字临时设为透明、
    // 静止后淡出并还原。空闲时没有 RAF 和定时器，只有一个被动的 pointermove 监听。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const TARGET_IDS = Object.freeze(['time', 'date', 'lunar', 'holiday']);
    const PAD = 64;               // 文字块上下外扩（CSS px），给涟漪留空间；横向不外扩，画布直接铺满视口
    const TRIGGER_MARGIN = 14;    // 指针离文字块上下边缘这么近就算“划到了”（横向不限）
    const CELL = 3;               // 场格大小（CSS px）
    // 画布总像素上限：内存与每次上传量与它成正比。整行铺满后，14/16 寸 MacBook 的 2 倍屏约 2.0–2.4M 像素，
    // 上限不能低于它，否则一唤醒文字就从原生分辨率掉到约 1.4 倍而发糊；超宽屏才会降分辨率。
    const MAX_PIXELS = 2400000;
    const MAX_RUN_MS = 25000;
    const QUIET_FRAMES = 24;
    const FADE_MS = 160;
    const BOX_TTL_MS = 400;
    const STEP_MS = 1000 / 60;
    const SLOW_RENDER_MS = 11;    // 单帧渲染（含上传）平滑耗时超过它：隔帧绘制，物理仍按真实时间推进
    const FAST_RENDER_MS = 7;     // 降到它以下再恢复每帧绘制（留出迟滞，避免来回切）
    const ACTIVE_CLASS = 'clock-liquid-active';

    function create(env = {}) {
        const doc = env.document || (typeof document !== 'undefined' ? document : null);
        const win = env.window || (typeof window !== 'undefined' ? window : null);
        const raf = env.requestAnimationFrame || (win && win.requestAnimationFrame && win.requestAnimationFrame.bind(win));
        const caf = env.cancelAnimationFrame || (win && win.cancelAnimationFrame && win.cancelAnimationFrame.bind(win));
        const setTimer = env.setTimeout || setTimeout;
        const clearTimer = env.clearTimeout || clearTimeout;
        const MutationObserverCtor = env.MutationObserver || (win && win.MutationObserver);
        const idle = env.requestIdleCallback || (win && win.requestIdleCallback && win.requestIdleCallback.bind(win));
        const clock = env.now || (() => (win && win.performance ? win.performance.now() : Date.now()));

        let state = null;                 // 运行中的实例
        let fading = null;                // 正在淡出的上一块画布
        let last = null;                  // 上一次指针位置
        let box = { rect: null, at: -Infinity };
        let attached = false;
        let warmed = false;

        function liveSettings() {
            return (win && win.backgroundExperience && win.backgroundExperience.settings) || null;
        }

        function enabled() {
            const settings = liveSettings();
            if (settings && (settings.enabled === false || settings.clockLiquid === false)) return false;
            if (win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
            if (win && win.navigator && win.navigator.connection && win.navigator.connection.saveData === true) return false;
            return true;
        }

        function blocked() {
            if (!doc || doc.hidden) return true;
            if (Core.blockedByBody(doc.body && doc.body.classList)) return true;
            return !!(win && win.backgroundExperience && win.backgroundExperience.active === true);
        }

        function timeElement() { return doc ? doc.getElementById('time') : null; }

        // 视口宽度（CSS px）：优先 documentElement.clientWidth（不含滚动条，铺满后不会盖住滚动条），取不到再用 innerWidth。
        function viewportWidth() {
            const root = doc && doc.documentElement;
            const width = (root && root.clientWidth) || (win && win.innerWidth) || 0;
            return Number.isFinite(width) && width > 0 ? Math.ceil(width) : 0;
        }

        // 指针必须真的落在页面上，而不是被某个浮层盖住：时钟容器（.time-wrapper）里，或容器外面那层页面本身
        // （真实页面里是 main.main-content：横带里文字块两侧、容器边距处命中的就是它）。取不到容器时不额外限制。
        function overPage(event, anchor) {
            const wrapper = anchor && anchor.closest ? anchor.closest('.time-wrapper') : null;
            if (!wrapper || !event.target) return true;
            return wrapper.contains(event.target) || event.target === wrapper.parentElement;
        }

        function targetElements() {
            if (!doc) return [];
            const list = [];
            for (const id of TARGET_IDS) {
                const element = doc.getElementById(id);
                if (element) list.push(element);
            }
            return list;
        }

        // 一行文字的紧致范围（用 Range 量，不是元素那一整条宽度）。隐藏的行（display:none）量出来宽度为 0，自然被跳过。
        function lineRect(element) {
            const node = element.firstChild;
            if (!node || node.nodeType !== 3 || !String(node.nodeValue || '').trim() || !doc.createRange) return null;
            const range = doc.createRange();
            range.selectNodeContents(element);
            const rect = range.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 ? rect : null;
        }

        // 整块文字（所有可见行的并集），带短缓存，避免每次移动都强制布局。
        function groupBox(force) {
            const stamp = (env.now || (() => Date.now()))();
            if (!force && box.rect && stamp - box.at < BOX_TTL_MS) return box.rect;
            box = { rect: null, at: stamp };
            const lines = [];
            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
            for (const element of targetElements()) {
                const rect = lineRect(element);
                if (!rect) continue;
                lines.push({ element, rect });
                left = Math.min(left, rect.left);
                top = Math.min(top, rect.top);
                right = Math.max(right, rect.right);
                bottom = Math.max(bottom, rect.bottom);
            }
            if (!lines.length) return null;
            box.rect = { left, top, right, bottom, width: right - left, height: bottom - top, lines };
            return box.rect;
        }

        function parseShadow(value) {
            // 例如 "rgba(0, 0, 0, 0.2) 2px 2px 20px 0px"；解析不了就不画阴影。
            const match = /^(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(-?[\d.]+)?px?/i.exec(value || '');
            if (!match || match[1] === 'none') return null;
            return { color: match[1], x: Number(match[2]), y: Number(match[3]), blur: Number(match[4] || 0) };
        }

        // 元素自己与祖先的不透明度连乘：日期/农历是 .95/.9，画布自己画文字时要乘上，否则起止瞬间会亮一档。
        function effectiveOpacity(element) {
            let value = 1;
            for (let node = element; node && node !== doc.body; node = node.parentElement) {
                const own = parseFloat(win.getComputedStyle(node).opacity);
                if (Number.isFinite(own)) value *= own;
            }
            return Math.max(0, Math.min(1, value));
        }

        // 逐字符量 DOM 里真实的字符格（含字距、tabular-nums、居中），再把每个字符居中画在格子中心。
        // 不能按“笔位”左对齐：canvas 无法设置 font-variant-numeric，等宽数字（尤其“1”）在 DOM 里居中于固定宽度的格子，
        // 而 canvas 用的是比例数字字形，左对齐会让它偏离约 8 px（真实 Chromium 对比实测）。
        // 字距加在字符之后，所以字形的视觉中心 = 格子左边 + (格宽 − 字距) / 2。
        function measureChars(element, ascent, letterSpacing) {
            const node = element.firstChild;
            if (!node || node.nodeType !== 3) return [];
            const text = node.nodeValue || '';
            const range = doc.createRange();
            const chars = [];
            for (let index = 0; index < text.length; index++) {
                const ch = text[index];
                if (ch === ' ') continue;
                range.setStart(node, index);
                range.setEnd(node, index + 1);
                const rect = range.getBoundingClientRect();
                if (!(rect.width > 0)) continue;
                chars.push({ ch, x: rect.left + (rect.width - letterSpacing) / 2, baseline: rect.top + ascent });
            }
            return chars;
        }

        // 把每一行的文字画进源画布。只有真正画出了字的行才会被设为透明，量不到的行保持原样可见。
        function paintSource(s) {
            const ctx = s.srcCtx;
            ctx.clearRect(0, 0, s.width, s.height);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
            let painted = 0;
            for (const item of s.items) {
                const chars = measureChars(item.element, item.ascent, item.letterSpacing);
                item.painted = chars.length > 0;
                if (!item.painted) continue;
                painted++;
                ctx.font = item.font;
                ctx.fillStyle = item.color;
                ctx.globalAlpha = item.opacity;
                if (item.shadow) {
                    ctx.shadowColor = item.shadow.color;
                    ctx.shadowOffsetX = item.shadow.x * s.dpr;
                    ctx.shadowOffsetY = item.shadow.y * s.dpr;
                    ctx.shadowBlur = item.shadow.blur * s.dpr;
                } else {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    ctx.shadowBlur = 0;
                }
                for (const char of chars) {
                    ctx.fillText(char.ch, (char.x - s.left) * s.dpr, (char.baseline - s.top) * s.dpr);
                }
            }
            ctx.globalAlpha = 1;
            if (!painted) return false;
            s.src = ctx.getImageData(0, 0, s.width, s.height).data;
            s.bounds = Core.textBounds(s.src, s.width, s.height);     // 文字所在的包围盒：每一帧只处理、上传它附近
            return true;
        }

        // 一帧的绘制（静止的首帧与每个运动帧共用）。文字层只把“文字附近”的脏矩形上传；涟漪层是 cols×rows 的小画布，
        // 由 drawImage 放大铺满整幅（GPU 双线性插值）。横向铺满视口之后整幅 putImageData 在 2 倍屏上要写 2M+ 像素，
        // 实测约 22 ms/帧；分层后与改成全屏之前的窄画布相当（约 6 ms）。renderLayers 返回的对象是复用的，只能当场读取。
        function draw(s) {
            const layers = Core.renderLayers(s.field, s.src, s.text.data, s.ripple.data, s.width, s.height, { scale: s.dpr, textBounds: s.bounds });
            const ctx = s.ctx;
            ctx.clearRect(0, 0, s.width, s.height);
            const rect = layers.rect;
            if (rect) ctx.putImageData(s.text, 0, 0, rect.x0, rect.y0, rect.x1 - rect.x0 + 1, rect.y1 - rect.y0 + 1);
            if (layers.ripple) {
                s.rippleCtx.putImageData(s.ripple, 0, 0);
                ctx.drawImage(s.rippleCanvas, 0, 0, s.field.cols, s.field.rows, 0, 0, s.width, s.height);
            }
        }

        function syncClasses(s) {
            for (const item of s.items) {
                if (item.painted) item.element.classList.add(ACTIVE_CLASS);
                else item.element.classList.remove(ACTIVE_CLASS);
            }
        }

        function start() {
            const group = groupBox(true);
            const viewport = viewportWidth();
            if (!group || !raf || !viewport) return false;       // 量不到视口就不启动：绝不能留下透明的时钟
            if (fading) { fading.canvas.remove(); clearTimer(fading.timer); fading = null; }

            const cssWidth = viewport;                           // 横向铺满整个视口
            const cssHeight = Math.ceil(group.height + PAD * 2); // 纵向仍是文字块上下各外扩 PAD
            let dpr = Math.min(win.devicePixelRatio || 1, 2);
            dpr = Math.max(1, Math.min(dpr, Math.sqrt(MAX_PIXELS / Math.max(1, cssWidth * cssHeight))));
            const width = Math.round(cssWidth * dpr);
            const height = Math.round(cssHeight * dpr);

            const canvas = doc.createElement('canvas');
            canvas.className = 'clock-liquid-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.width = width;
            canvas.height = height;
            const left = 0;
            const top = Math.round(group.top - PAD);
            canvas.style.left = `${left}px`;
            canvas.style.top = `${top}px`;
            canvas.style.width = `${cssWidth}px`;
            canvas.style.height = `${cssHeight}px`;
            const ctx = canvas.getContext('2d');
            const srcCanvas = doc.createElement('canvas');
            srcCanvas.width = width;
            srcCanvas.height = height;
            const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
            // 涟漪层：每格一个像素的小画布（不进 DOM），由 draw() 放大铺满整幅。
            const field = Core.createField(Math.ceil(cssWidth / CELL), Math.ceil(cssHeight / CELL));
            const rippleCanvas = doc.createElement('canvas');
            rippleCanvas.width = field.cols;
            rippleCanvas.height = field.rows;
            const rippleCtx = rippleCanvas.getContext('2d');
            if (!ctx || !srcCtx || !rippleCtx) return false;

            // 每一行各自的字体、颜色、字距、阴影和不透明度；字体上沿到基线的距离 = ascent（Range 的矩形是字体内容区，基线 = 顶 + ascent）。
            const items = group.lines.map(({ element }) => {
                const style = win.getComputedStyle(element);
                const fontPx = parseFloat(style.fontSize) || 16;
                const font = `${style.fontStyle === 'italic' ? 'italic ' : ''}${style.fontWeight} ${fontPx * dpr}px ${style.fontFamily}`;
                srcCtx.font = font;
                const metrics = srcCtx.measureText('0');
                return {
                    element, font,
                    ascent: (metrics.fontBoundingBoxAscent || fontPx * 0.95 * dpr) / dpr,
                    color: style.color,
                    letterSpacing: parseFloat(style.letterSpacing) || 0,   // "normal" → NaN → 0
                    shadow: parseShadow(style.textShadow),
                    opacity: effectiveOpacity(element),
                    painted: false,
                };
            });

            const s = state = {
                canvas, ctx, srcCtx, width, height, dpr, left, top, items, field, rippleCanvas, rippleCtx,
                text: null, ripple: null, src: null, bounds: null,
                raf: 0, started: 0, lastTs: 0, acc: 0, quiet: 0,
                cost: 0, slow: false, drawn: 0,
                observer: null,
            };
            if (!paintSource(s)) { state = null; return false; }
            // 先画一帧静止状态（场全 0 时就是原样复制源文字，只上传文字块），同一任务内再把原文字设为透明，不会闪。
            s.text = ctx.createImageData(width, height);
            s.ripple = rippleCtx.createImageData(field.cols, field.rows);
            draw(s);

            doc.body.appendChild(canvas);
            syncClasses(s);
            if (MutationObserverCtor) {
                s.observer = new MutationObserverCtor(() => {
                    if (state !== s) return;
                    if (!paintSource(s)) { stop(); return; }
                    syncClasses(s);
                });
                for (const item of items) s.observer.observe(item.element, { characterData: true, childList: true, subtree: true });
            }
            s.started = clock();
            s.raf = raf(frame);
            return true;
        }

        function stop() {
            if (!state) return;
            const s = state;
            state = null;
            if (s.raf && caf) caf(s.raf);
            if (s.observer) s.observer.disconnect();
            for (const item of s.items) item.element.classList.remove(ACTIVE_CLASS);
            s.canvas.classList.add('is-fading');
            fading = {
                canvas: s.canvas,
                timer: setTimer(() => {
                    s.canvas.remove();
                    if (fading && fading.canvas === s.canvas) fading = null;
                }, FADE_MS + 60),
            };
        }

        function frame(ts) {
            const s = state;
            if (!s) return;
            s.raf = 0;
            if (!enabled() || blocked() || ts - s.started > MAX_RUN_MS) { stop(); return; }
            const dt = s.lastTs ? Math.min(48, ts - s.lastTs) : STEP_MS;
            s.lastTs = ts;
            s.acc += dt;
            let steps = 0;
            while (s.acc >= STEP_MS && steps < 3) {
                Core.step(s.field);
                s.acc -= STEP_MS;
                steps++;
            }
            if (s.acc > 50) s.acc = 0;
            // 高刷屏（120 Hz）上每个渲染帧不一定凑够一个模拟步：没有前进就不重绘，也不计入“静止”帧数。
            if (steps > 0) {
                // 慢机器 / 大画布：渲染平滑耗时超过 SLOW_RENDER_MS 时隔帧绘制，别把主线程占满（模拟步数不受影响）。
                s.drawn = s.slow ? s.drawn + 1 : 0;
                if (!s.slow || s.drawn % 2 === 1) {
                    const t0 = clock();
                    draw(s);
                    const spent = Math.max(0, clock() - t0);
                    s.cost = s.cost ? s.cost * 0.75 + spent * 0.25 : spent;
                    if (!s.slow && s.cost > SLOW_RENDER_MS) s.slow = true;
                    else if (s.slow && s.cost < FAST_RENDER_MS) s.slow = false;
                }
                if (Core.isSettled(s.field)) {
                    if (++s.quiet >= QUIET_FRAMES) { stop(); return; }
                } else {
                    s.quiet = 0;
                }
            }
            s.raf = raf(frame);
        }

        function push(event, previous, stamp) {
            const s = state;
            if (!s) return;
            const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
            const cx = (event.clientX - s.left) / CELL, cy = (event.clientY - s.top) / CELL;
            if (cx < 2 || cy < 2 || cx > s.field.cols - 3 || cy > s.field.rows - 3) return;
            const impulse = Core.impulseFromMove(dx, dy, stamp - previous.t);
            Core.smear(s.field, cx, cy, impulse.smearRadius, impulse.px, impulse.py);
            Core.splash(s.field, cx, cy, impulse.splashRadius, impulse.depth);
            s.quiet = 0;
        }

        function onPointerMove(event) {
            const stamp = typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
            const previous = last;
            last = { x: event.clientX, y: event.clientY, t: stamp };
            if (!previous) return;
            if (state) {
                if (!enabled() || blocked()) { stop(); return; }
                push(event, previous, stamp);
                return;
            }
            if (event.buttons) return;
            const rect = groupBox(false);
            // 横向不限：时钟那一行的任何横向位置划过都算（画布横向铺满视口）；纵向只认文字块上下各 TRIGGER_MARGIN。
            if (!rect || !Core.insideBand(rect, event.clientY, TRIGGER_MARGIN)) return;
            // 指针必须真的落在页面上，而不是被某个浮层盖住。
            if (!overPage(event, timeElement() || rect.lines[0].element)) return;
            if (!enabled() || blocked()) return;
            const distance = Math.hypot(event.clientX - previous.x, event.clientY - previous.y);
            if (!Core.shouldWake(distance, stamp - previous.t)) return;
            if (start()) push(event, previous, stamp);
        }

        // 整页第一次使用 2D 画布要付一次性初始化（真实 Chromium 实测约 60 ms，与画布大小无关）。
        // 不预热的话，这笔账会落在第一次划到时钟的那一刻，造成肉眼可见的卡一下；改在页面空闲时用一块 8×8 小画布提前付掉。
        function warm() {
            if (warmed || !doc || !enabled()) return;
            warmed = true;
            try {
                const canvas = doc.createElement('canvas');
                canvas.width = 8;
                canvas.height = 8;
                const c = canvas.getContext('2d', { willReadFrequently: true });
                if (!c) return;
                c.clearRect(0, 0, 8, 8);
                c.font = '16px sans-serif';
                c.fillText('0', 0, 8);
                c.getImageData(0, 0, 8, 8);
            } catch (error) { /* 预热失败不影响功能：第一次划动时照常创建 */ }
        }

        function init() {
            if (attached || !doc) return;
            attached = true;
            doc.addEventListener('pointermove', onPointerMove, { passive: true });
            if (idle) idle(warm, { timeout: 5000 });
            if (win && win.addEventListener) {
                win.addEventListener('resize', () => { box.at = -Infinity; stop(); });
            }
        }

        return { init, onPointerMove, stop, isRunning: () => !!state, _state: () => state };
    }

    return { create, ACTIVE_CLASS, TARGET_IDS, PAD, MAX_PIXELS, TRIGGER_MARGIN, CELL };
});
