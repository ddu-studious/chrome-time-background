(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./jelly-core.js')
        : root && root.JellyCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    // 浏览器里只创建实例、不自动挂载：果冻视图打开时才建画布、监听与动画帧，关闭即全部释放。
    if (root && typeof document !== 'undefined') root.JellyGame = api.create();
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (DefaultCore) {
    'use strict';

    // “解压果冻”的画法与控制器。物理在 jelly-core.js；这里负责：
    //  1) 画：Canvas 2D。轮廓用 Catmull-Rom 曲线平滑成封闭路径，渐变填充 + 边缘高光 + 固定在左上的高光 + 地面投影；
    //     脸贴在质心上，贴地时保持端正，在空中或被抓着时跟着身体转；睡着（静止）时闭眼微笑；
    //  2) 输入：Pointer Events（鼠标/触摸/笔统一，抓住后用指针捕获，拖出画布也能松手）；
    //     键盘：画布聚焦后空格/回车戳一下，也有“戳一下”“重新掉落”按钮，不依赖指针；
    //  3) 节拍：只在醒着、页面可见时用一条 requestAnimationFrame；果冻睡着就停，被碰到再醒，空闲零开销；
    //  4) 本机数据：颜色、累计时长、“番茄钟结束时提醒我歇一会儿”开关，只存 localStorage，不上传；
    //  5) 休息模式：番茄钟入口传入秒数后显示倒计时（按墙钟计算，不累计误差），结束给出“回去继续”。
    // 不碰网络、不读写业务数据；所有环境依赖经 create(env) 注入，加载时不访问 DOM。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const TAU = Math.PI * 2;
    const STORAGE = Object.freeze({ color: 'jellyColor', seconds: 'jellyPlaySeconds', restOffer: 'jellyRestOffer' });
    const MAX_SEGMENT_SECONDS = 30 * 60;      // 页面一直开着不管，一段最多计 30 分钟
    const MAX_TOTAL_SECONDS = 10000 * 3600;   // 防止存储里被写入离谱的数字
    const MAX_REST_SECONDS = 600;
    const MAX_DPR = 2;
    const MIN_STAGE = 40;                     // 舞台比这更小就当作还没布局好

    const PALETTE = Object.freeze([
        Object.freeze({ id: 'strawberry', name: '草莓', base: [255, 111, 159], light: [255, 192, 215], dark: [212, 50, 110] }),
        Object.freeze({ id: 'lemon', name: '柠檬', base: [255, 205, 80], light: [255, 239, 170], dark: [224, 148, 26] }),
        Object.freeze({ id: 'mint', name: '薄荷', base: [72, 222, 160], light: [172, 248, 216], dark: [20, 158, 110] }),
        Object.freeze({ id: 'grape', name: '葡萄', base: [150, 112, 255], light: [206, 186, 255], dark: [94, 56, 204] }),
        Object.freeze({ id: 'ocean', name: '海盐', base: [66, 190, 245], light: [170, 232, 253], dark: [22, 126, 206] }),
        Object.freeze({ id: 'peach', name: '蜜桃', base: [255, 150, 112], light: [255, 208, 180], dark: [218, 94, 54] }),
    ]);
    const DEFAULT_COLOR = PALETTE[0].id;

    // ---------- 纯函数（可在 Node 里直接测试） ----------

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }

    function paletteById(id) { return PALETTE.find(item => item.id === id) || PALETTE[0]; }

    function rgba(color, alpha) {
        return `rgba(${color[0]},${color[1]},${color[2]},${clamp(alpha, 0, 1).toFixed(3)})`;
    }

    /** 角度归到 (−π, π]。 */
    function wrapAngle(angle) {
        let value = angle % TAU;
        if (value > Math.PI) value -= TAU;
        else if (value <= -Math.PI) value += TAU;
        return value;
    }

    /** 朝目标角度走最短的一边，指数逼近（与帧率无关）。 */
    function easeAngle(current, target, dtMs, tauMs) {
        if (!(dtMs > 0) || !(tauMs > 0)) return current;
        return wrapAngle(current + wrapAngle(target - current) * (1 - Math.exp(-dtMs / tauMs)));
    }

    /** 累计时长的展示：不足一分钟写秒，不足一小时写分钟，其余写小时和分钟。 */
    function formatDuration(totalSeconds) {
        const seconds = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
        if (seconds < 60) return `${seconds} 秒`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} 分钟`;
        const hours = Math.floor(minutes / 60);
        const rest = minutes % 60;
        return rest ? `${hours} 小时 ${rest} 分` : `${hours} 小时`;
    }

    function formatCountdown(seconds) {
        const total = Math.max(0, Math.ceil(seconds));
        return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }

    /** 表情：被拉得很长、在空中或被挤得折叠 → 惊讶；睡着 → 开心；其余平静。 */
    function expression(m) {
        if (m.folded || m.airborne || (m.grabbed && m.stretch > 1.35)) return 'surprised';
        if (m.asleep && !m.grabbed) return 'happy';
        return 'calm';
    }

    /** 脸的位置与比例：贴在质心稍偏上，随身体压扁/拉长而变形；除 x/y 外都是脸自己的坐标（像素）。 */
    function faceLayout(m, radius, angle) {
        const sx = clamp(m.width / (2 * radius), 0.7, 1.35);
        const sy = clamp(m.height / (2 * radius), 0.7, 1.35);
        return {
            x: m.cx, y: m.cy - radius * 0.06 * sy, angle, sx, sy, radius,
            eyeDx: radius * 0.3, eyeY: -radius * 0.08, eyeRx: radius * 0.075, eyeRy: radius * 0.105,
            mouthY: radius * 0.2, mouthW: radius * 0.2, cheekDx: radius * 0.44, cheekY: radius * 0.14,
            lookRange: radius * 0.04,
        };
    }

    /** 地面投影：越高越小越淡。 */
    function shadowFor(m, floor, radius) {
        const height = Math.max(0, floor - m.maxY);
        const rx = Math.max(radius * 0.2, m.width * 0.5 * (1 - Math.min(0.45, height / (radius * 4))));
        return { x: m.cx, y: floor + 2, rx, ry: rx * 0.14, alpha: 0.42 * (1 - Math.min(0.85, height / (radius * 3))) };
    }

    /** 沿一圈点画封闭的平滑曲线（Catmull-Rom 转三次贝塞尔），曲线经过每一个点。 */
    function traceBody(ctx, pts) {
        const n = pts.length;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n];
            const p1 = pts[i];
            const p2 = pts[(i + 1) % n];
            const p3 = pts[(i + 2) % n];
            ctx.bezierCurveTo(
                p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                p2.x, p2.y,
            );
        }
        ctx.closePath();
    }

    // ---------- 画 ----------

    function drawFloor(ctx, world) {
        const y = world.floor + 1;
        const gradient = ctx.createLinearGradient(0, y, 0, world.height);
        gradient.addColorStop(0, 'rgba(255,255,255,0.07)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, y, world.width, Math.max(0, world.height - y));
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(world.width, y);
        ctx.stroke();
    }

    function drawShadow(ctx, shadow) {
        if (!(shadow.alpha > 0.01)) return;
        ctx.save();
        ctx.translate(shadow.x, shadow.y);
        ctx.scale(1, shadow.ry / shadow.rx);
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadow.rx);
        gradient.addColorStop(0, `rgba(0,0,0,${shadow.alpha.toFixed(3)})`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, shadow.rx, 0, TAU);
        ctx.fill();
        ctx.restore();
    }

    function drawBody(ctx, world, m, color) {
        const pts = world.points;
        const w = Math.max(1, m.width);
        const h = Math.max(1, m.height);
        traceBody(ctx, pts);
        const base = ctx.createLinearGradient(0, m.minY, 0, m.maxY);
        base.addColorStop(0, rgba(color.light, 0.97));
        base.addColorStop(0.55, rgba(color.base, 0.95));
        base.addColorStop(1, rgba(color.dark, 0.97));
        ctx.fillStyle = base;
        ctx.fill();

        ctx.save();
        traceBody(ctx, pts);
        ctx.clip();
        // 内部的透光感：左上亮、向外渐暗，底部再压一层深色
        const glow = ctx.createRadialGradient(m.cx - w * 0.18, m.cy - h * 0.22, 0, m.cx, m.cy, Math.max(w, h) * 0.78);
        glow.addColorStop(0, 'rgba(255,255,255,0.38)');
        glow.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        glow.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(m.minX - 2, m.minY - 2, w + 4, h + 4);
        const depth = ctx.createLinearGradient(0, m.cy, 0, m.maxY);
        depth.addColorStop(0, rgba(color.dark, 0));
        depth.addColorStop(1, rgba(color.dark, 0.38));
        ctx.fillStyle = depth;
        ctx.fillRect(m.minX - 2, m.cy, w + 4, h);
        // 固定在屏幕左上方的高光（光源不随果冻转）
        ctx.save();
        ctx.translate(m.minX + w * 0.3, m.minY + h * 0.2);
        ctx.rotate(-0.65);
        ctx.scale(1, 0.5);
        const spec = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.2);
        spec.addColorStop(0, 'rgba(255,255,255,0.8)');
        spec.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = spec;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.2, 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.restore();

        traceBody(ctx, pts);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.stroke();
    }

    function drawFace(ctx, layout, state, look) {
        const dark = '#2a2140';
        const r = layout.radius;
        ctx.save();
        ctx.translate(layout.x, layout.y);
        ctx.rotate(layout.angle);
        ctx.scale(layout.sx, layout.sy);

        // 腮红
        ctx.fillStyle = 'rgba(255,92,128,0.26)';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * layout.cheekDx, layout.cheekY, r * 0.09, r * 0.055, 0, 0, TAU);
            ctx.fill();
        }

        // 眼睛：看向指针（屏幕坐标换算到脸的坐标）
        let lookX = 0;
        let lookY = 0;
        if (look) {
            const len = Math.hypot(look.x, look.y);
            if (len > 1e-6) {
                const k = Math.min(1, len / (r * 1.5)) * layout.lookRange;
                const cos = Math.cos(-layout.angle);
                const sin = Math.sin(-layout.angle);
                const ux = look.x / len;
                const uy = look.y / len;
                lookX = (ux * cos - uy * sin) * k / layout.sx;
                lookY = (ux * sin + uy * cos) * k / layout.sy;
            }
        }
        ctx.strokeStyle = dark;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.6, r * 0.03);
        for (const side of [-1, 1]) {
            const ex = side * layout.eyeDx;
            if (state === 'happy') {
                ctx.beginPath();
                ctx.arc(ex, layout.eyeY + layout.eyeRy * 0.4, layout.eyeRx * 1.2, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
                continue;
            }
            const big = state === 'surprised' ? 1.18 : 1;
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.ellipse(ex + lookX, layout.eyeY + lookY, layout.eyeRx * big, layout.eyeRy * big, 0, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(ex + lookX - layout.eyeRx * 0.28, layout.eyeY + lookY - layout.eyeRy * 0.34, layout.eyeRx * 0.3, 0, TAU);
            ctx.fill();
        }

        // 嘴
        if (state === 'surprised') {
            ctx.fillStyle = dark;
            ctx.beginPath();
            ctx.ellipse(0, layout.mouthY + r * 0.03, r * 0.05, r * 0.07, 0, 0, TAU);
            ctx.fill();
        } else {
            ctx.beginPath();
            const open = state === 'happy' ? 1.25 : 0.8;
            ctx.arc(0, layout.mouthY - layout.mouthW * 0.35, layout.mouthW * 0.55 * open, Math.PI * 0.18, Math.PI * 0.82);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawScene(ctx, world, m, color, faceAngle, look) {
        ctx.clearRect(0, 0, world.width, world.height);
        drawFloor(ctx, world);
        drawShadow(ctx, shadowFor(m, world.floor, world.radius));
        drawBody(ctx, world, m, color);
        drawFace(ctx, faceLayout(m, world.radius, faceAngle), expression(m), look);
    }

    // ---------- 控制器 ----------

    function create(env = {}) {
        let session = null;

        const getWin = () => env.window || (typeof window !== 'undefined' ? window : null);
        const getDoc = () => env.document || (typeof document !== 'undefined' ? document : null);
        const getCore = () => ('core' in env ? env.core : DefaultCore);
        const getStorage = () => {
            if (env.storage) return env.storage;
            try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (error) { return null; }
        };
        const now = () => (env.now ? env.now() : Date.now());
        const warn = message => { try { (env.warn || console.warn)(message); } catch (error) { /* 日志失败不影响界面 */ } };

        function readItem(key) {
            try { return getStorage()?.getItem(key) ?? null; } catch (error) { return null; }
        }
        function writeItem(key, value) {
            try { getStorage()?.setItem(key, value); return true; } catch (error) { return false; }
        }

        function readColor() { return paletteById(readItem(STORAGE.color)).id; }

        function readSeconds() {
            const value = Number(readItem(STORAGE.seconds));
            return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), MAX_TOTAL_SECONDS) : 0;
        }
        function addSeconds(seconds) {
            const whole = Math.floor(seconds);
            if (!(whole > 0)) return;
            writeItem(STORAGE.seconds, String(Math.min(MAX_TOTAL_SECONDS, readSeconds() + whole)));
        }

        function statText() {
            const seconds = readSeconds();
            return seconds >= 1 ? formatDuration(seconds) : '—';
        }

        function restOfferEnabled() { return readItem(STORAGE.restOffer) !== 'off'; }
        function setRestOfferEnabled(enabled) { return writeItem(STORAGE.restOffer, enabled ? 'on' : 'off'); }

        /** 与项目里其他动效一致：只看系统的“减少动态效果”偏好。 */
        function prefersReducedMotion() {
            try { return !!getWin()?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch (error) { return false; }
        }

        function timers() {
            const win = getWin();
            return {
                set: env.setInterval || (win && win.setInterval ? win.setInterval.bind(win) : null),
                clear: env.clearInterval || (win && win.clearInterval ? win.clearInterval.bind(win) : null),
            };
        }

        // ---------- DOM ----------

        function el(doc, tag, props = {}, children = []) {
            const node = doc.createElement(tag);
            for (const [key, value] of Object.entries(props)) {
                if (value == null || value === false) continue;
                if (key === 'class') node.className = value;
                else if (key === 'text') node.textContent = value;
                else node.setAttribute(key, String(value));
            }
            for (const child of children) node.appendChild(child);
            return node;
        }

        function icon(doc, name) { return el(doc, 'i', { class: name, 'aria-hidden': 'true' }); }

        function button(doc, props, iconName, label) {
            const children = iconName ? [icon(doc, iconName)] : [];
            if (label) children.push(el(doc, 'span', { text: label }));
            return el(doc, 'button', { type: 'button', ...props }, children);
        }

        function buildView(doc, s, options) {
            const stage = el(doc, 'div', { class: 'jelly-stage' });
            const canvas = el(doc, 'canvas', {
                class: 'jelly-canvas', tabindex: '0', role: 'img',
                'aria-label': '一只果冻。拖动、甩出或点按它；聚焦后按空格或回车可以戳一下',
            });
            stage.appendChild(canvas);
            stage.appendChild(el(doc, 'div', { class: 'jelly-hint', text: '拖一拖 · 戳一戳 · 甩出去', 'aria-hidden': 'true' }));

            const swatches = el(doc, 'div', { class: 'jelly-swatches', role: 'group', 'aria-label': '果冻颜色' });
            s.swatches = PALETTE.map(color => {
                const swatch = button(doc, {
                    class: 'jelly-swatch', 'data-jelly-color': color.id, 'aria-label': `${color.name}色`, title: `${color.name}色`,
                    'aria-pressed': color.id === s.colorId ? 'true' : 'false',
                });
                swatch.style.setProperty('--jelly-swatch', `rgb(${color.base[0]},${color.base[1]},${color.base[2]})`);
                swatches.appendChild(swatch);
                return swatch;
            });
            const actions = el(doc, 'div', { class: 'jelly-actions' }, [
                (s.pokeButton = button(doc, { class: 'jelly-btn', 'data-jelly-poke': '' }, 'fas fa-hand-pointer', '戳一下')),
                (s.dropButton = button(doc, { class: 'jelly-btn', 'data-jelly-drop': '' }, 'fas fa-arrow-down', '重新掉落')),
            ]);
            const bar = el(doc, 'div', { class: 'jelly-bar' }, [swatches, actions]);

            s.totalEl = el(doc, 'span', { class: 'jelly-total' });
            s.offerButton = button(doc, { class: 'jelly-offer-toggle', 'data-jelly-offer': '' });
            const foot = el(doc, 'div', { class: 'jelly-foot' }, [s.totalEl, s.offerButton]);

            const game = el(doc, 'div', { class: 'jelly-game' });
            if (options.rest > 0) {
                s.restText = el(doc, 'span', { class: 'jelly-rest-text' });
                s.restFill = el(doc, 'i', { class: 'jelly-rest-fill' });
                s.restDone = button(doc, { class: 'jelly-btn jelly-rest-done', 'data-jelly-done': '', hidden: '' }, 'fas fa-check', '回去继续');
                game.appendChild(el(doc, 'div', { class: 'jelly-rest', role: 'timer' }, [
                    s.restText, el(doc, 'span', { class: 'jelly-rest-bar' }, [s.restFill]), s.restDone,
                ]));
            }
            s.live = el(doc, 'span', { class: 'jelly-live', role: 'status', 'aria-live': 'polite' });
            for (const child of [stage, bar, foot, s.live]) game.appendChild(child);
            s.game = game;
            s.stage = stage;
            s.canvas = canvas;
            return game;
        }

        function refreshFoot(s) {
            s.totalEl.textContent = `累计放松 ${statText()}`;
            const on = restOfferEnabled();
            s.offerButton.textContent = `番茄钟结束时提醒我歇一会儿：${on ? '开' : '关'}`;
            s.offerButton.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

        // ---------- 事件登记 ----------

        function listen(s, target, type, handler, options) {
            if (!target?.addEventListener) return;
            target.addEventListener(type, handler, options);
            s.listeners.push([target, type, handler, options]);
        }

        function unlistenAll(s) {
            for (const [target, type, handler, options] of s.listeners) {
                try { target.removeEventListener(type, handler, options); } catch (error) { /* 目标已销毁 */ }
            }
            s.listeners = [];
        }

        // ---------- 时长统计 ----------

        function segmentStart(s) { if (s.segmentAt == null) s.segmentAt = now(); }
        function segmentEnd(s) {
            if (s.segmentAt == null) return;
            s.pending += clamp((now() - s.segmentAt) / 1000, 0, MAX_SEGMENT_SECONDS);
            s.segmentAt = null;
        }
        function flushStats(s) {
            const whole = Math.floor(s.pending);
            if (whole > 0) { addSeconds(whole); s.pending -= whole; }
        }

        // ---------- 绘制与节拍 ----------

        function applySize(s, width, height) {
            const core = s.core;
            const win = getWin();
            const dpr = clamp(Number(win?.devicePixelRatio) || 1, 1, MAX_DPR);
            const first = !s.world;
            if (first) {
                s.world = core.createWorld({ width, height, reduceMotion: s.reduce });
                core.spawn(s.world, { drop: !s.reduce });
            } else {
                core.resize(s.world, width, height);
                // 核心缩放时会放开抓取：界面上的抓取状态（样式、指针捕获、指针编号）跟着清掉，
                // 否则按住果冻时舞台尺寸变化，会留下“抓取中”的光标，且逐帧循环要等到抬手才能停。
                if (!s.world.grab) clearGrab(s);
            }
            const pixelW = Math.round(width * dpr);
            const pixelH = Math.round(height * dpr);
            if (s.canvas.width !== pixelW) s.canvas.width = pixelW;       // 改画布尺寸会重置状态且较贵：没变就不动
            if (s.canvas.height !== pixelH) s.canvas.height = pixelH;     // 显示尺寸由样式表撑满舞台，这里只管像素缓冲
            s.dpr = dpr;
            s.cssW = width;
            s.cssH = height;
            s.last = 0;
            requestFrame(s);
        }

        function measure(s) {
            // 取布局尺寸（clientWidth/Height，浏览器已取整），不用 getBoundingClientRect：游戏中心面板打开时祖先带 scale 过渡，
            // 外接矩形是被缩放后的尺寸，而 ResizeObserver 只在布局尺寸变化时触发，过渡结束后不会再来纠正，果冻的世界就会小一圈。
            // 指针换算（toWorld）相反，需要含 transform 的外接矩形，才能把屏幕坐标映射回画布坐标。
            const width = s.stage.clientWidth || 0;
            const height = s.stage.clientHeight || 0;
            if (width < MIN_STAGE || height < MIN_STAGE) return;
            if (width === s.cssW && height === s.cssH) return;
            applySize(s, width, height);
        }

        function requestFrame(s) {
            if (s.disposed || s.failed || s.scheduled || !s.visible || !s.world) return;
            s.scheduled = true;
            s.rafId = s.raf(t => frame(s, t));
        }

        function healthy(m) {
            return Number.isFinite(m.cx) && Number.isFinite(m.cy) && Number.isFinite(m.areaRatio)
                && Number.isFinite(m.width) && Number.isFinite(m.height) && Number.isFinite(m.rotation);
        }

        function lookTarget(s, m) {
            const pointer = s.world.pointer;
            const target = m.grabbed ? { x: pointer.sx, y: pointer.sy } : s.hover;
            return target ? { x: target.x - m.cx, y: target.y - m.cy } : null;
        }

        function render(s, m, dt) {
            const follow = m.grabbed || m.airborne;
            const target = follow ? m.rotation : 0;
            // 睡着时直接到位：动画循环马上就停，不能让脸停在半路上
            s.faceAngle = s.world.asleep ? target : easeAngle(s.faceAngle, target, dt, follow ? 90 : 220);
            drawScene(s.ctx, s.world, m, paletteById(s.colorId), s.faceAngle, s.world.asleep ? null : lookTarget(s, m));
        }

        function fail(s, error) {
            s.failed = true;
            warn(`果冻绘制失败：${error && error.message ? error.message : error}`);
            s.stage.setAttribute('data-jelly-failed', 'true');
            s.live.textContent = '果冻暂时无法绘制';
        }

        function frame(s, t) {
            s.scheduled = false;
            s.rafId = 0;
            if (s.disposed || s.failed || !s.visible || !s.world) return;
            const dt = s.last > 0 ? Math.max(0, t - s.last) : 1000 / 60;
            s.last = t;
            try {
                // 核心的 step 不会因为 asleep 自己跳过（继续推会有约 1px 的漂移）：睡着时只补画，不推物理。
                // 抓取、戳、重置、缩放都会让核心把 asleep 清掉，所以醒来不需要额外通知。
                if (!s.world.asleep) s.core.step(s.world, dt);
                let m = s.core.metrics(s.world);
                if (!healthy(m)) {
                    // 数值异常（理论上核心不会给出）：整个重置，而不是画出一团 NaN
                    warn('果冻数值异常，已重置');
                    clearGrab(s);
                    s.core.spawn(s.world, { drop: false });
                    m = s.core.metrics(s.world);
                    if (!healthy(m)) throw new Error('重置后数值仍然异常');
                }
                render(s, m, dt);
            } catch (error) {
                fail(s, error);
                return;
            }
            if (s.world.asleep && s.pointerId == null) { s.last = 0; return; }   // 睡着：停掉逐帧，被碰到再醒
            requestFrame(s);
        }

        // ---------- 输入 ----------

        function toWorld(s, event) {
            const rect = s.canvas.getBoundingClientRect?.() || { left: 0, top: 0, width: s.cssW, height: s.cssH };
            const scaleX = rect.width ? s.world.width / rect.width : 1;
            const scaleY = rect.height ? s.world.height / rect.height : 1;
            return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
        }

        function markPlayed(s) { s.game.classList.add('is-quiet'); }

        /** 放开抓取在界面上的痕迹（样式类、指针捕获、指针编号）；是否让核心松手由调用者决定。 */
        function clearGrab(s) {
            const id = s.pointerId;
            s.pointerId = null;
            s.canvas.classList.remove('is-grabbing');
            try { if (id != null && s.canvas.hasPointerCapture?.(id)) s.canvas.releasePointerCapture?.(id); } catch (error) { /* 已释放 */ }
        }

        function onPointerDown(s, event) {
            if (!s.world || s.pointerId != null) return;
            if (event.button != null && event.button !== 0) return;
            const point = toWorld(s, event);
            if (!s.core.grab(s.world, point.x, point.y)) return;
            s.pointerId = event.pointerId;
            try { s.canvas.setPointerCapture?.(event.pointerId); } catch (error) { /* 指针已失效 */ }
            try { s.canvas.focus?.({ preventScroll: true }); } catch (error) { /* 不能聚焦也不影响拖动 */ }   // 取消 pointerdown 会让浏览器不再聚焦画布
            s.canvas.classList.add('is-grabbing');
            markPlayed(s);
            event.preventDefault?.();
            requestFrame(s);
        }

        function onPointerMove(s, event) {
            if (!s.world) return;
            const point = toWorld(s, event);
            s.hover = point;
            if (s.pointerId != null && event.pointerId === s.pointerId) {
                s.core.drag(s.world, point.x, point.y);
                requestFrame(s);
            }
        }

        function endGrab(s, event) {
            if (s.pointerId == null || (event && event.pointerId !== s.pointerId)) return;
            clearGrab(s);
            if (s.world) s.core.release(s.world);
            requestFrame(s);
        }

        function pokeTop(s) {
            if (!s.world) return;
            s.core.poke(s.world, s.world.cx, s.world.cy - s.world.radius);
            markPlayed(s);
            requestFrame(s);
        }

        function dropAgain(s) {
            if (!s.world) return;
            clearGrab(s);
            s.core.spawn(s.world, { drop: true });
            s.last = 0;
            markPlayed(s);
            requestFrame(s);
        }

        function setColor(s, id) {
            const color = paletteById(id);
            s.colorId = color.id;
            writeItem(STORAGE.color, color.id);
            for (const swatch of s.swatches) swatch.setAttribute('aria-pressed', swatch.getAttribute('data-jelly-color') === color.id ? 'true' : 'false');
            requestFrame(s);       // 睡着时也补画一帧（frame 不会推物理）
        }

        // ---------- 休息倒计时 ----------

        function updateRest(s) {
            const rest = s.rest;
            if (!rest) return;
            const remaining = Math.max(0, (rest.endsAt - now()) / 1000);
            s.restText.textContent = remaining > 0 ? `歇一会儿 · ${formatCountdown(remaining)}` : '歇好了，回去继续吧';
            s.restFill.style.width = `${(clamp(1 - remaining / rest.total, 0, 1) * 100).toFixed(1)}%`;
            if (remaining > 0 || rest.done) return;
            rest.done = true;
            stopRestTimer(s);
            s.restDone.removeAttribute('hidden');
            s.live.textContent = '休息时间到，回去继续吧';
        }

        function stopRestTimer(s) {
            if (s.restTimer == null) return;
            const { clear } = timers();
            if (clear) clear(s.restTimer);
            s.restTimer = null;
        }

        function startRest(s, seconds) {
            s.rest = { total: seconds, endsAt: now() + seconds * 1000, done: false };
            updateRest(s);
            const { set } = timers();
            if (set) s.restTimer = set(() => updateRest(s), 250);
        }

        // ---------- 挂载 / 卸载 ----------

        function unmount() {
            const s = session;
            if (!s) return;
            session = null;
            s.disposed = true;
            if (s.scheduled && s.rafId) { try { s.caf(s.rafId); } catch (error) { /* 已执行 */ } }
            s.scheduled = false;
            stopRestTimer(s);
            try { s.observer?.disconnect(); } catch (error) { /* 已断开 */ }
            unlistenAll(s);
            segmentEnd(s);
            flushStats(s);
            try { s.root.textContent = ''; } catch (error) { /* 容器已被替换 */ }
        }

        function mount(rootEl, options = {}) {
            unmount();
            const doc = getDoc();
            const core = getCore();
            if (!doc || !rootEl || !core) return null;
            const win = getWin();
            const rawRest = Math.floor(Number(options.rest));
            const rest = Number.isFinite(rawRest) && rawRest > 0 ? Math.min(rawRest, MAX_REST_SECONDS) : 0;

            const s = {
                root: rootEl, core, world: null, colorId: readColor(), dpr: 1, cssW: 0, cssH: 0,
                raf: env.raf || (win?.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (cb => setTimeout(() => cb(now()), 16))),
                caf: env.caf || (win?.cancelAnimationFrame ? win.cancelAnimationFrame.bind(win) : clearTimeout),
                scheduled: false, rafId: 0, last: 0, visible: !doc.hidden,
                pointerId: null, hover: null, faceAngle: 0, disposed: false, failed: false,
                reduce: prefersReducedMotion(), listeners: [], pending: 0, segmentAt: null,
                rest: null, restTimer: null, observer: null, onDone: typeof options.onDone === 'function' ? options.onDone : null,
            };
            session = s;

            rootEl.textContent = '';
            rootEl.appendChild(buildView(doc, s, { rest }));
            s.ctx = s.canvas.getContext?.('2d') || null;
            refreshFoot(s);
            if (!s.ctx) {
                s.failed = true;
                s.live.textContent = '当前环境不支持绘制，果冻无法显示';
                s.stage.setAttribute('data-jelly-failed', 'true');
            }

            listen(s, s.canvas, 'pointerdown', event => onPointerDown(s, event));
            listen(s, s.canvas, 'pointermove', event => onPointerMove(s, event));
            listen(s, s.canvas, 'pointerup', event => endGrab(s, event));
            listen(s, s.canvas, 'pointercancel', event => endGrab(s, event));
            listen(s, s.canvas, 'lostpointercapture', event => endGrab(s, event));
            listen(s, s.canvas, 'pointerleave', () => { s.hover = null; });      // 醒着时下一帧自然不再看向指针；睡着时是闭眼，不需要补画
            listen(s, s.canvas, 'keydown', event => {
                if (event.key === ' ' || event.key === 'Enter' || event.code === 'Space') {
                    event.preventDefault?.();
                    pokeTop(s);
                }
            });
            listen(s, s.pokeButton, 'click', () => pokeTop(s));
            listen(s, s.dropButton, 'click', () => dropAgain(s));
            s.swatches.forEach(swatch => listen(s, swatch, 'click', () => setColor(s, swatch.getAttribute('data-jelly-color'))));
            listen(s, s.offerButton, 'click', () => { setRestOfferEnabled(!restOfferEnabled()); refreshFoot(s); });
            if (s.restDone) listen(s, s.restDone, 'click', () => { if (s.onDone) s.onDone(); });
            listen(s, doc, 'visibilitychange', () => {
                if (doc.hidden) {
                    s.visible = false;
                    segmentEnd(s);
                    flushStats(s);
                } else {
                    s.visible = true;
                    s.last = 0;
                    segmentStart(s);
                    requestFrame(s);
                }
            });

            const ResizeObs = env.ResizeObserver || win?.ResizeObserver;
            if (ResizeObs) {
                s.observer = new ResizeObs(() => { if (!s.disposed) measure(s); });
                s.observer.observe(s.stage);
            }
            if (s.visible) segmentStart(s);
            if (rest > 0) startRest(s, rest);
            measure(s);

            return {
                get world() { return s.world; },
                get colorId() { return s.colorId; },
                get running() { return s.scheduled; },
                poke: () => pokeTop(s),
                drop: () => dropAgain(s),
                setColor: id => setColor(s, id),
                unmount,
            };
        }

        return {
            mount, unmount, statText, restOfferEnabled, setRestOfferEnabled,
            isMounted: () => !!session,
        };
    }

    return {
        create, PALETTE, DEFAULT_COLOR, STORAGE,
        formatDuration, formatCountdown, wrapAngle, easeAngle, expression, faceLayout, shadowFor, traceBody, paletteById,
    };
});
