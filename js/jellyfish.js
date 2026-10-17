(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./jellyfish-core.js')
        : root && root.JellyfishCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    // 只创建实例，不自动启动：是否运行由背景体验的设置决定（applySettings 里 start/stop），皮肤没选中时没有任何观察者或监听。
    if (root && typeof document !== 'undefined') root.JellyfishSkin = api.create();
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // “水母”背景皮肤的画法与控制器。物理在 jellyfish-core.js；这里负责：
    //  1) 画：Canvas 2D，画在背景体验的共享画布上（宿主已设 screen 混合，所以发光会叠加）；
    //  2) 数据：只读 chrome.storage.local 的任务表，筛选与排序规则与首页任务滚动条一致（未完成且非失败）；
    //     一只水母绑定一个任务并在上方隐约显示任务名；任务一变（storage.onChanged 自带新值）就让水母跟上（完成哪个，走的就是哪只），
    //     本文件不写任何数据（抓取完成走 memo 层的统一入口，见后面的“抓取”）；
    //  3) 节拍：监听首页时钟数字的真实变化做“秒针”拍点，数字不是每秒变就用整秒墙钟。
    // 不自建 RAF 与画布：调度、隐藏即停、被工作台遮挡即停、省流量降帧都沿用宿主 background-experience.js。
    // 设计与限制见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    const P = Core.PARAMS;
    const TAU = Math.PI * 2;
    const WHITE = [238, 249, 255];
    const PLANKTON = [200, 238, 255];
    const PLANKTON_NIGHT = [150, 255, 232];     // 夜晚的浮游生物偏青绿（生物荧光的颜色）
    const NIGHT_TINT = [96, 132, 255];          // 夜晚把水母的颜色略微推向深海蓝紫（只推一点，七彩仍要分得开）
    // 七彩调色板，**必须按色相环顺序排列**：核心（jellyfish-core.js 的 pickColor）用“色位编号的环形距离”近似色相距离，
    // 让同屏的水母颜色尽量拉开；色位数必须等于 PARAMS.COLORS（测试守住）。每只水母的颜色编号在出生时决定、一生不变。
    // 冰蓝、紫、薄荷是原来的三种颜色（保留），其余五种在 screen 混合下的亮度与它们接近，不会有哪只特别暗或刺眼。
    const PALETTE = Object.freeze([
        Object.freeze([255, 100, 92]),    // 红（略提亮：纯红在深色底上发闷）
        Object.freeze([255, 150, 56]),    // 橙
        Object.freeze([240, 222, 70]),    // 黄
        Object.freeze([88, 228, 100]),    // 绿
        Object.freeze([79, 239, 194]),    // 薄荷（原）
        Object.freeze([112, 205, 255]),   // 冰蓝（原）
        Object.freeze([170, 111, 255]),   // 紫（原）
        Object.freeze([245, 105, 225]),   // 洋红（偏紫，别和红混成一团：第一版玫红/粉只差 33°，深色底上分不清）
    ]);

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
    function mix(a, b, t) { return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)]; }
    function rgba(color, alpha) {
        const a = alpha < 0 ? 0 : (alpha > 1 ? 1 : alpha);
        return `rgba(${color[0]},${color[1]},${color[2]},${a.toFixed(3)})`;
    }

    // ---------- 画 ----------

    function glow(ctx, x, y, radius, color, alpha) {
        if (!(alpha >= 0.004)) return;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, rgba(color, alpha));
        gradient.addColorStop(0.4, rgba(color, alpha * 0.4));
        gradient.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
    }

    /** 沿节点画一条平滑曲线（相邻节点的中点作为二次曲线的端点）。需要 to - from ≥ 1。 */
    function tracePath(ctx, pts, from, to) {
        ctx.moveTo(pts[from].x, pts[from].y);
        for (let i = from + 1; i < to; i++) {
            ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        }
        ctx.lineTo(pts[to].x, pts[to].y);
    }

    function drawPlankton(ctx, world, amount, night = 0) {
        const color = night > 0 ? mix(PLANKTON, PLANKTON_NIGHT, night) : PLANKTON;
        for (const p of world.plankton) {
            const twinkle = 0.55 + 0.45 * Math.sin(world.time * 1.3 + p.tw);
            const alpha = (0.1 + 0.2 * p.z) * twinkle * amount * (1 + 0.9 * night);
            if (alpha < 0.01) continue;
            ctx.fillStyle = rgba(color, alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 0.7 + p.z * 1.1, 0, TAU);
            ctx.fill();
        }
    }

    /**
     * 把水母的外观（核心给的 look = { kind, colors }）解析成画法要用的颜色 { kind, a, b, c, halo }（RGB 数组）。
     * 颜色编号对调色板长度取模；外观缺失、样式未知、颜色数不够（duo/blend 要 2 种、rainbow 要 3 种）时一律退回纯色，
     * 纯色取外观的第一种颜色，没有外观时取 jelly.color。
     */
    function paintOf(jelly, palette) {
        const look = jelly.look;
        const list = look && Array.isArray(look.colors) ? look.colors : [];
        const pick = index => {
            const slot = Number.isInteger(index) ? ((index % palette.length) + palette.length) % palette.length : 0;
            return palette[slot] || palette[0];
        };
        const kind = look && look.kind;
        if ((kind === 'duo' || kind === 'blend') && list.length >= 2) {
            const a = pick(list[0]);
            const b = pick(list[1]);
            return { kind, a, b, c: b, halo: kind === 'blend' ? mix(a, b, 0.4) : a };
        }
        if (kind === 'rainbow' && list.length >= 3) {
            const a = pick(list[0]);
            const b = pick(list[1]);
            return { kind, a, b, c: pick(list[2]), halo: b };
        }
        const a = pick(list.length ? list[0] : jelly.color);
        return { kind: 'solid', a, b: a, c: a, halo: a };
    }

    /**
     * 触须在 u（钟罩上的横向位置，-1 左 .. 1 右）、f（0 根部 .. 1 尖端）处的颜色：
     * 纯色一个色；双色一律第二种；渐变顺着钟罩的竖向渐变继续往下（根部已偏向第二种，尖端是第二种）；
     * 彩带按横向位置在三色之间取色（与钟罩上的色带对齐）。
     */
    function tentacleTone(paint, u, f) {
        if (paint.kind === 'duo') return paint.b;
        if (paint.kind === 'blend') return mix(paint.a, paint.b, 0.45 + 0.55 * f);
        if (paint.kind === 'rainbow') {
            const t = clamp((u + 1) / 2, 0, 1);
            return t < 0.5 ? mix(paint.a, paint.b, t * 2) : mix(paint.b, paint.c, (t - 0.5) * 2);
        }
        return paint.a;
    }

    function drawTentacles(ctx, jelly, paint, A) {
        const fade = [1, 0.62, 0.3];
        // 触须的颜色混多少白：纯色混一半（原来的样子）；多色少混一点，颜色才看得出来（真机截图：混一半时第二种颜色几乎是白的）
        const whiten = paint.kind === 'solid' ? 0.5 : 0.32;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const t of jelly.tentacles) {
            const pts = t.pts;
            const last = pts.length - 1;
            if (t.kind === 'arm') {
                ctx.beginPath();
                tracePath(ctx, pts, 0, last);
                ctx.lineWidth = t.width;
                ctx.strokeStyle = rgba(mix(tentacleTone(paint, t.u, 0.5), WHITE, whiten), 0.2 * A);
                ctx.stroke();
                ctx.lineWidth = 1.1;
                ctx.strokeStyle = rgba(WHITE, 0.3 * A);
                ctx.stroke();
                continue;
            }
            // 细触须分三段画，越靠近尖端越淡
            const cuts = [0, Math.round(last / 3), Math.round(2 * last / 3), last];
            ctx.lineWidth = t.width;
            for (let k = 0; k < 3; k++) {
                if (cuts[k + 1] - cuts[k] < 1) continue;
                ctx.beginPath();
                tracePath(ctx, pts, cuts[k], cuts[k + 1]);
                ctx.strokeStyle = rgba(mix(tentacleTone(paint, t.u, k / 2), WHITE, whiten), 0.4 * A * fade[k]);
                ctx.stroke();
            }
        }
    }

    function drawBell(ctx, jelly, paint, A, lowPower, night = 0) {
        const { w, h, p } = Core.bellShape(jelly);
        const edge = mix(paint.a, WHITE, 0.5);                       // 钟罩的边线颜色
        const inner = mix(paint.kind === 'solid' ? paint.a : paint.b, WHITE, 0.5);   // 体内发光的颜色：多色时用第二种
        ctx.save();
        ctx.translate(jelly.x, jelly.y);
        ctx.rotate(jelly.tilt);

        // 钟罩轮廓：上半个椭圆 + 一圈起伏的裙边（舒张时裙边更深更舒展）
        ctx.beginPath();
        ctx.ellipse(0, 0, w, h, 0, Math.PI, TAU);
        const scallops = 7;
        const depth = h * (0.3 - 0.14 * p);
        for (let s = 0; s < scallops; s++) {
            const x0 = w - 2 * w * s / scallops;
            const x1 = w - 2 * w * (s + 1) / scallops;
            ctx.quadraticCurveTo((x0 + x1) / 2, depth * (s % 2 ? 1 : 1.35), x1, 0);
        }
        ctx.closePath();

        // 玻璃感：中心几乎透明，越靠边缘越亮
        // 多色时底色只做发白（或两色之间的）玻璃，颜色全交给下面那一层竖向/横向渐变，免得某一种颜色盖住别的
        const body = ctx.createRadialGradient(0, -h * 0.25, 0, 0, -h * 0.25, Math.max(w, h) * 1.15);
        const glass = paint.kind === 'blend' ? mix(paint.a, paint.b, 0.5) : (paint.kind === 'rainbow' ? mix(paint.b, WHITE, 0.4) : paint.a);
        const multi = paint.kind === 'blend' || paint.kind === 'rainbow';
        body.addColorStop(0, rgba(glass, 0.05 * A));
        body.addColorStop(0.55, rgba(glass, (multi ? 0.1 : 0.12) * A));
        body.addColorStop(1, rgba(glass, (multi ? 0.26 : 0.46) * A));
        ctx.fillStyle = body;
        ctx.fill();
        const rimA = Math.min(0.5 * (1 + 0.4 * night), 0.8);          // 夜里钟罩边线更亮：像生物荧光的描边
        let rim = rgba(edge, rimA * A);
        if (paint.kind === 'blend') {
            // 渐变：钟顶是主色，往裙边渐变到第二种颜色（竖向，一眼就能看出颜色在变）
            const ombre = ctx.createLinearGradient(0, -h, 0, h * 0.4);
            ombre.addColorStop(0, rgba(paint.a, 0.42 * A));
            ombre.addColorStop(1, rgba(paint.b, 0.42 * A));
            ctx.fillStyle = ombre;
            ctx.fill();
            rim = ctx.createLinearGradient(0, -h, 0, h * 0.4);
            rim.addColorStop(0, rgba(edge, rimA * A));
            rim.addColorStop(1, rgba(mix(paint.b, WHITE, 0.5), rimA * A));
        } else if (paint.kind === 'rainbow') {
            // 彩带：同一条钟罩路径上铺一层横向三色色带（左 a、中 b、右 c）
            const band = ctx.createLinearGradient(-w, 0, w, 0);
            band.addColorStop(0, rgba(paint.a, 0.5 * A));
            band.addColorStop(0.5, rgba(paint.b, 0.34 * A));
            band.addColorStop(1, rgba(paint.c, 0.5 * A));
            ctx.fillStyle = band;
            ctx.fill();
            rim = ctx.createLinearGradient(-w, 0, w, 0);
            rim.addColorStop(0, rgba(edge, rimA * A));
            rim.addColorStop(0.5, rgba(mix(paint.b, WHITE, 0.5), rimA * A));
            rim.addColorStop(1, rgba(mix(paint.c, WHITE, 0.5), rimA * A));
        }
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rim;
        ctx.stroke();

        if (!lowPower) {
            // 放射状的水管：很淡的几根线，增加细节
            ctx.lineWidth = 0.8;
            ctx.strokeStyle = rgba(WHITE, 0.1 * A);
            ctx.beginPath();
            for (let k = 0; k < 7; k++) {
                const angle = Math.PI + (k + 0.5) / 7 * Math.PI;
                ctx.moveTo(Math.cos(angle) * w * 0.14, Math.sin(angle) * h * 0.14);
                ctx.lineTo(Math.cos(angle) * w * 0.92, Math.sin(angle) * h * 0.92);
            }
            ctx.stroke();
            // 高光
            ctx.fillStyle = rgba(WHITE, 0.2 * A);
            ctx.beginPath();
            ctx.ellipse(-w * 0.32, -h * 0.62, w * 0.2, h * 0.09, -0.55, 0, TAU);
            ctx.fill();
        }

        // 体内发光的“胃”
        const core = ctx.createRadialGradient(0, -h * 0.32, 0, 0, -h * 0.32, w * 0.5);
        core.addColorStop(0, rgba(inner, Math.min(0.36 * (1 + 1.1 * night), 0.72) * A));
        core.addColorStop(1, rgba(inner, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(0, -h * 0.32, w * 0.5, 0, TAU);
        ctx.fill();

        ctx.restore();
    }

    // 任务名：画在钟罩上方。平时很淡（隐约知道是哪件事），指针靠近（jelly.hot → 1）时变清楚。
    const LABEL_FONT = 'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    const LABEL_BASE = 0.34;      // 平时的亮度（相对 amount × alpha）
    const LABEL_HOT = 1.15;       // 指针靠近时的亮度

    function drawLabel(ctx, jelly, paint, amount) {
        if (!jelly.label) return;
        const hot = Number.isFinite(jelly.hot) ? clamp(jelly.hot, 0, 1) : 0;
        const brightness = amount * jelly.alpha * (LABEL_BASE + (LABEL_HOT - LABEL_BASE) * hot);
        if (brightness < 0.03) return;
        const { h } = Core.bellShape(jelly);
        const size = Math.round(clamp(jelly.r * 0.3, 11, 15));
        ctx.save();
        ctx.font = `500 ${size}px ${LABEL_FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = rgba(mix(paint.a, WHITE, 0.72), Math.min(brightness, 0.95));
        ctx.fillText(jelly.label, jelly.x, Math.max(size + 4, jelly.y - h - 9));   // 水母贴着屏幕顶边时任务名压在钟罩上，也别被切掉
        ctx.restore();
    }

    /** 夜晚把外观里的每种颜色略微推向深海蓝紫（night 为 0 时原样返回同一个对象）。 */
    function nightPaint(paint, night) {
        if (!(night > 0)) return paint;
        const k = 0.16 * night;
        const shift = color => mix(color, NIGHT_TINT, k);
        return { kind: paint.kind, a: shift(paint.a), b: shift(paint.b), c: shift(paint.c), halo: shift(paint.halo) };
    }

    // 完成庆祝：从纸篓口升起的气泡 + 一圈光涟漪，颜色取自被吃掉的那只水母；没有气泡和涟漪时一笔不画。
    function drawFx(ctx, world, palette, amount) {
        const fx = world.fx;
        if (!fx || (!fx.bubbles.length && !fx.rings.length)) return;
        const tone = slot => {
            const index = Number.isInteger(slot) ? ((slot % palette.length) + palette.length) % palette.length : 0;
            return mix(palette[index] || palette[0], WHITE, 0.45);
        };
        for (const ring of fx.rings) {
            if (ring.t <= 0) continue;
            const k = clamp(ring.t / P.BURST_RING_S, 0, 1);
            const ease = 1 - (1 - k) * (1 - k);
            const alpha = 0.95 * (1 - k) * (1 - k) * amount;
            if (alpha < 0.01) continue;
            const radius = (10 + 125 * ease) * world.scale;
            ctx.lineWidth = 3 * (1 - k) + 0.8;
            ctx.strokeStyle = rgba(tone(ring.color), alpha);
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, radius, 0, TAU);
            ctx.stroke();
            glow(ctx, ring.x, ring.y, radius * 0.9, tone(ring.color), 0.38 * (1 - k) * amount);
        }
        for (const b of fx.bubbles) {
            if (b.t <= 0) continue;
            const k = clamp(b.t / b.life, 0, 1);
            const alpha = Math.pow(1 - k, 1.2) * 0.95 * amount;
            if (alpha < 0.01) continue;
            const color = tone(b.color);
            ctx.lineWidth = 1.4;
            ctx.strokeStyle = rgba(color, alpha);
            ctx.fillStyle = rgba(color, alpha * 0.2);
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, TAU);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = rgba(WHITE, alpha * 0.8);                       // 高光点
            ctx.beginPath();
            ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.22), 0, TAU);
            ctx.fill();
        }
    }

    // 情绪对光晕的影响：专注时所有水母一起缓慢“呼吸”（周期 BREATH_S，光晕忽明忽暗）；起舞时光晕随每次收缩一起鼓一下
    const BREATH_S = 8;
    function moodHalo(mood, time, pulse, dz) {
        if (!mood) return { size: 1, alpha: 1 };
        const breath = Math.sin(time * TAU / BREATH_S);                      // -1..1，所有水母同相
        // 精神状态（jelly.dz，缓动中的当前值）：bump 让光晕随收缩鼓得多大、glow 让它整体多亮；起舞程度为 0 时回到平常
        const bump = dz && Number.isFinite(dz.bump) ? dz.bump : 1;
        const glow = dz && Number.isFinite(dz.glow) ? dz.glow : 1;
        return {
            size: 1 + 0.35 * mood.dance * bump * pulse,
            alpha: (1 + 0.3 * mood.focus * breath) * (1 + 0.5 * mood.dance * bump * pulse) * (1 + (glow - 1) * mood.dance),
        };
    }

    function drawJelly(ctx, jelly, palette, amount, lowPower, scale, labels, night = 0, mood = null, time = 0) {
        const range = P.BELL_MAX - P.BELL_MIN;
        const near = clamp((jelly.r / scale - P.BELL_MIN) / range, 0, 1);   // 越大越近，越亮
        // 起舞时犯困的水母整体暗一点（jelly.dz.alpha，随起舞程度渐入）
        const dim = mood && jelly.dz && Number.isFinite(jelly.dz.alpha) ? 1 + (jelly.dz.alpha - 1) * mood.dance : 1;
        const A = amount * jelly.alpha * (0.72 + 0.28 * near) * dim;
        if (A < 0.01) return;
        const paint = nightPaint(paintOf(jelly, palette), night);
        const { h, p: squeeze } = Core.bellShape(jelly);
        const halo = moodHalo(mood, time, squeeze, jelly.dz);
        // 夜晚：光晕更大更亮（生物荧光）；省流量模式不画光晕，仍有体内发光的增强
        if (!lowPower) glow(ctx, jelly.x, jelly.y - h * 0.2, jelly.r * 3.2 * (1 + 0.45 * night) * halo.size, paint.halo, 0.15 * (1 + 1.9 * night) * halo.alpha * A);
        drawTentacles(ctx, jelly, paint, A);
        drawBell(ctx, jelly, paint, A, lowPower, night);
        if (labels) drawLabel(ctx, jelly, paint, amount);
    }

    /** options.labels（默认 true）：是否在水母上方画任务名；options.night（0～1，默认 0）：夜晚荧光的程度。 */
    function draw(ctx, world, palette, amount, options = {}) {
        const labels = options.labels !== false;
        const night = Number.isFinite(options.night) ? clamp(options.night, 0, 1) : 0;
        drawPlankton(ctx, world, amount, night);
        // 小的（远的）先画，大的（近的）盖在上面
        const order = world.jellies.slice().sort((a, b) => a.r - b.r);
        for (const jelly of order) drawJelly(ctx, jelly, palette, amount, world.lowPower, world.scale, labels, night, world.mood, world.time);
        drawFx(ctx, world, palette, amount);
    }

    // ---------- 控制器 ----------

    /**
     * 默认的“完成任务”出口：只调用 memo 层的统一入口 completeTaskById（走任务列表自己的完成流程：保存、日志、重绘都一致）。
     * 皮肤自己不写任何数据；页面上没有这个入口时按失败处理（水母被放回去）。
     */
    function defaultComplete(win) {
        return id => {
            const manager = win && win.memoManager;
            if (!manager || typeof manager.completeTaskById !== 'function') return Promise.resolve({ ok: false, reason: 'unavailable' });
            return manager.completeTaskById(id);
        };
    }

    const DRAG_PX = 6;            // 按下后移动超过这么多像素才算“拖”（之前只是点了一下）
    const BUSY_MAX_MS = 6000;     // 停在纸篓口等完成回执的最长时间：超时放回去（任务若稍后真的完成了，名单变化会让它自己离开）

    function create(env = {}) {
        const doc = env.document || (typeof document !== 'undefined' ? document : null);
        const win = env.window || (typeof window !== 'undefined' ? window : null);
        const chromeApi = env.chrome || (typeof chrome !== 'undefined' ? chrome : null);
        const now = env.now || (() => (win && win.performance ? win.performance.now() : Date.now()));
        const wall = env.wall || (() => Date.now());
        const random = env.random || Math.random;
        const MO = env.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
        const warn = env.warn || (message => { if (typeof console !== 'undefined') console.warn(message); });
        const complete = typeof env.complete === 'function' ? env.complete : defaultComplete(win);
        const getCrumple = () => (env.crumple !== undefined ? env.crumple : (win && win.TaskCrumple)) || null;

        const beatClock = Core.createBeatClock();
        let started = false;
        let failed = false;
        let generation = 0;
        let world = null;
        let growth = 0;           // 最近一次读到的成长级别（由任务完成记录的连续天数得出）
        let pending = null;       // 最近一次读到的待办名单（Core.pendingTasks 的结果）；null = 还没读到（读不到不等于没有任务）
        let populated = false;    // 首次填充之后新增的水母才从屏幕下方游进来
        let observer = null;
        let storageListener = null;
        let dataVersion = 0;      // 每次拿到新数据（发起读取、收到事件）就自增；更早发起、事件之后才返回的读取结果已过时，不采用
        let session = null;       // 正在进行的抓取：{ jelly, down, dragging, bin, state: 'held' | 'busy', busyAt, mouth, generation }；同时只有一个

        /**
         * 只读 chrome.storage.local 的任务表（持久化的事实）。不用 memoManager 的内存副本：它只在页面初始化时加载，
         * AI 浮层、任务页或别的标签页写入存储后不会刷新，数量会落后。读不到返回 null。
         */
        async function readPending() {
            try {
                const storage = chromeApi && chromeApi.storage && chromeApi.storage.local;
                if (!storage || typeof storage.get !== 'function') return null;
                const result = await storage.get('memos');
                const memos = result && result.memos !== undefined ? result.memos : [];
                const list = Core.pendingTasks(memos, today());
                return list === null ? null : { list, level: growthOf(memos) };
            } catch {
                return null;
            }
        }

        /** 本地时间的小时（带小数，19.5 = 19:30），夜晚荧光按它渐变；时间不可用时返回 NaN（按白天处理）。 */
        function localHour() {
            const date = new Date(wall());
            return Number.isNaN(date.getTime()) ? NaN : date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
        }

        /** 本地日期 'YYYY-MM-DD'（判断任务是否过期、决定谁排在前面）；时间不可用时返回空串（不判断过期）。 */
        function today() {
            const date = new Date(wall());
            if (Number.isNaN(date.getTime())) return '';
            const pad = n => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        }

        /** 本地日期 'YYYY-MM-DD'（用时间戳）：完成记录按本地日归天，与首页任务里“今天”的口径一致。 */
        function dayOfStamp(stamp) {
            const date = new Date(stamp);
            if (Number.isNaN(date.getTime())) return '';
            const pad = n => String(n).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        }

        /** 连续完成任务的天数对应的成长级别；今天的日期不可用时按 0。 */
        function growthOf(memos) {
            return Core.growthLevel(Core.completionStreak(memos, today(), dayOfStamp));
        }

        function apply(value, level) {
            if (value === null) return;                     // 读不到/算不出：保持上一次的名单，不当作没有任务
            if (Number.isInteger(level)) growth = level;
            pending = value;
            if (world) {
                Core.reconcile(world, pending, { instant: !populated });
                populated = true;
            }
        }

        async function refresh() {
            const mine = generation;
            const version = ++dataVersion;
            const value = await readPending();
            if (!started || mine !== generation || version !== dataVersion) return;   // 停止、重启或已有更新的数据之后才返回的结果不采用
            apply(value === null ? null : value.list, value === null ? undefined : value.level);
        }

        function watchTasks() {
            const area = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
            if (!area || typeof area.addListener !== 'function') return;
            storageListener = (changes, areaName) => {
                if (areaName !== 'local' || !changes || !changes.memos) return;
                // 事件自带完整的新值，直接整理成名单，不再读一次存储（任务可能带图片）。键被删除时没有 newValue，按“没有任务”处理；
                // 形状不对（算不出）则保持上一次的名单。
                const change = changes.memos;
                const memos = change.newValue === undefined ? [] : change.newValue;
                const value = Core.pendingTasks(memos, today());
                if (value === null) return;
                dataVersion++;
                apply(value, growthOf(memos));
            };
            area.addListener(storageListener);
        }

        function observeClock() {
            const element = doc && typeof doc.getElementById === 'function' ? doc.getElementById('time') : null;
            if (!element || !MO) return;
            let last = element.textContent;
            observer = new MO(() => {
                const text = element.textContent;
                if (text === last) return;
                last = text;
                beatClock.beat(now());
            });
            observer.observe(element, { childList: true, characterData: true, subtree: true });
        }

        // ---------- 抓取：抓住水母、拖进纸篓、完成任务 ----------
        // 物理在核心（Core.grab / setBusy / release / consume），纸篓是 TaskCrumple.holdBin 的视觉落点，
        // 任务真正完成只经由注入的 complete（默认 memoManager.completeTaskById）。这里只负责把它们按顺序接起来：
        //   按下抓住 → 拖过 DRAG_PX 才出纸篓（出不来就放回去，绝不在没有落点时去完成任务）→ 松手在纸篓里才发出完成请求，
        //   水母停在篓口等回执 → 回执 ok 才被吃掉，失败/超时/抛错就放回去。取消、停止、世界重建一律收起纸篓并丢弃抓取。

        function endSession(s) {
            if (session === s) session = null;
            if (s && s.bin) s.bin.release();
        }

        /** 水母放开之后按最新的任务名单重新整理一次（抓着/等回执期间它不会被赶走，名单可能已经变了）。 */
        function reapply() {
            if (pending !== null) apply(pending);
        }

        function present(s) {
            return !!(started && world && s.generation === generation && world.jellies.includes(s.jelly));
        }

        /** 指针下面有没有一只可抓的水母（绑定了任务的）。宿主用它决定光标样式。 */
        function hoverAt(x, y) {
            if (!started || failed || !world || session) return false;
            const jelly = Core.hitTest(world, x, y);
            return !!jelly && jelly.taskId !== null;
        }

        /** 在 (x, y) 按下：抓住那里的水母并开始一次抓取。返回是否抓住（宿主据此决定要不要拦下这次按下）。 */
        function grabAt(x, y) {
            if (!started || failed || !world || session) return false;
            const jelly = Core.hitTest(world, x, y);
            if (!jelly || jelly.taskId === null || !Core.grab(world, jelly, x, y)) return false;
            session = { jelly, down: { x, y }, dragging: false, bin: null, state: 'held', busyAt: 0, mouth: null, generation };
            return true;
        }

        /** 每帧推进抓取：判定拖动开始（出纸篓）、告诉纸篓是否对准、检查等回执是否超时。 */
        function tickSession(point, frameTime) {
            const s = session;
            if (!s) return;
            if (!world.jellies.includes(s.jelly)) { endSession(s); return; }
            if (s.state === 'busy') {
                if (frameTime - s.busyAt > BUSY_MAX_MS) {
                    Core.release(world, s.jelly, { vx: 0, vy: 0 });
                    endSession(s);
                    reapply();
                }
                return;
            }
            if (!point) return;
            if (!s.dragging) {
                if (Math.hypot(point.x - s.down.x, point.y - s.down.y) < DRAG_PX) return;
                s.dragging = true;
                const crumple = getCrumple();
                try { s.bin = crumple && typeof crumple.holdBin === 'function' ? crumple.holdBin() : null; } catch { s.bin = null; }
                if (!s.bin) {                       // 没有落点（被限制、槽位满、没加载）：这次不抓了，水母原样放回去
                    Core.release(world, s.jelly);
                    session = null;
                    reapply();
                    return;
                }
            }
            s.bin.setNear(s.bin.contains(point.x, point.y));
        }

        /** 回执到了：ok 才被吃掉，其余一律放回去。已被超时、取消、停止收走的抓取不再动画。 */
        function settle(s, result) {
            if (session !== s || s.state !== 'busy') return;
            if (!present(s)) { endSession(s); return; }
            if (result && result.ok === true) {
                Core.consume(world, s.jelly, s.mouth.x, s.mouth.y);
                s.bin.gulp();
                Core.celebrate(world, s.mouth.x, s.mouth.y, { color: s.jelly.color });    // 只有回执 ok 才庆祝；纯视觉
                session = null;
                // 乐观更新：这个任务已经完成，名单里先去掉它——存储事件稍后到达时会确认；否则被吃掉的水母移除后，
                // 下一次整理会按旧名单给同一个任务再生出一只。（读取只在 start 时发生一次，抓取要等世界建好之后才可能，所以不用另外作废旧读取。）
                if (pending !== null) pending = pending.filter(task => task.key !== s.jelly.taskKey);
            } else {
                Core.release(world, s.jelly, { vx: 0, vy: 0 });
                endSession(s);
            }
            reapply();
        }

        /**
         * 在 (x, y) 抬起：返回这次是不是真的“拖过”（宿主据此吞掉随后的 click）。
         * 没拖过只是点了一下——放开；拖过但抬起时不在纸篓里——放开并收起纸篓；在纸篓里——停在篓口并发出完成请求。
         */
        function drop(x, y) {
            const s = session;
            if (!s || s.state !== 'held') return false;
            if (!present(s)) { endSession(s); return s.dragging; }
            if (!s.dragging) {
                Core.release(world, s.jelly);
                endSession(s);
                reapply();
                return false;
            }
            if (!(s.bin && s.bin.contains(x, y))) {
                Core.release(world, s.jelly);
                endSession(s);
                reapply();
                return true;
            }
            const mouth = s.bin.mouth();
            if (!Core.setBusy(world, s.jelly, mouth.x, mouth.y)) {
                Core.release(world, s.jelly);
                endSession(s);
                reapply();
                return true;
            }
            s.state = 'busy';
            s.busyAt = now();
            s.mouth = mouth;
            let outcome;
            try { outcome = Promise.resolve(complete(s.jelly.taskId)); } catch (error) { outcome = Promise.reject(error); }
            outcome.then(result => settle(s, result), () => settle(s, null));
            return true;
        }

        /** 被打断（失焦、页面隐藏、指针取消）：放开被抓着的水母并收起纸篓。等回执时请求已发出，不打断。返回是否取消了。 */
        function cancel() {
            const s = session;
            if (!s || s.state !== 'held') return false;
            if (present(s)) Core.release(world, s.jelly);
            endSession(s);
            reapply();
            return true;
        }

        function start() {
            if (started) return;
            started = true;
            failed = false;
            generation++;
            world = null;
            pending = null;
            populated = false;
            observeClock();
            watchTasks();
            void refresh();
        }

        function stop() {
            if (!started) return;
            started = false;
            generation++;
            if (session) endSession(session);
            if (observer) { observer.disconnect(); observer = null; }
            const area = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
            if (storageListener && area && typeof area.removeListener === 'function') area.removeListener(storageListener);
            storageListener = null;
            world = null;
            pending = null;
            populated = false;
        }

        /**
         * 由宿主在它自己的 RAF 里每帧调用：推进一步并画出来。返回是否画了。
         * 画法出任何异常都只停掉本次会话的水母皮肤（并留一条警告），不让宿主的帧循环断掉。
         */
        function frame(options = {}) {
            const { ctx, width, height, dt, pointer = null, colors, lowPower = false, labels = true, night = true } = options;
            // 情绪与成长（宿主按设置决定是否传）：focus 专注、dance 起舞、grow 是否按连续完成天数长大；都只是视觉，缺省全关
            if (!started || failed || !ctx || !(width > 0) || !(height > 0)) return false;
            try {
                const palette = Array.isArray(colors) && colors.length ? colors : PALETTE;
                const low = !!lowPower;
                if (!world || world.lowPower !== low) {
                    world = Core.createWorld({ width, height, random, lowPower: low });
                    populated = false;
                    if (pending !== null) { Core.reconcile(world, pending, { instant: true }); populated = true; }
                } else if (world.width !== width || world.height !== height) {
                    Core.resize(world, width, height);
                }
                const frameTime = Number.isFinite(options.now) ? options.now : now();
                const beat = beatClock.index(frameTime, wall()).index;
                const point = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) ? { x: pointer.x, y: pointer.y } : null;
                Core.setMood(world, { focus: options.focus === true || options.focus > 0 ? options.focus : 0, dance: options.dance === true || options.dance > 0 ? options.dance : 0 });
                Core.setGrowth(world, options.grow === true ? growth : 0);
                Core.step(world, dt, { beat, pointer: point });
                tickSession(point, frameTime);        // 世界被重建后抓着的水母已不在世界里：tickSession 会结束这次抓取
                draw(ctx, world, palette, clamp(Number.isFinite(options.amount) ? options.amount : 0.65, 0, 1),
                    { labels: labels !== false, night: night === false ? 0 : Core.nightAmount(Number.isFinite(options.nightHour) ? options.nightHour : localHour()) });
                return true;
            } catch (error) {
                failed = true;
                world = null;
                if (session) endSession(session);
                warn(`[JellyfishSkin] 绘制出错，本次会话停用水母皮肤：${error && error.message ? error.message : error}`);
                return false;
            }
        }

        return {
            start, stop, frame, hoverAt, grabAt, drop, cancel,
            isActive: () => started && !failed,
            growth: () => growth,
            draw, PALETTE,                // 番茄钟面板里的陪伴水母（pomodoro-jelly.js）复用同一套画法
            isGrabbing: () => !!session,
            state: () => ({ started, failed, pending: pending === null ? null : pending.length, populated, jellies: world ? world.jellies.length : 0 }),
            _world: () => world,
        };
    }

    return { create, draw, PALETTE };
});
