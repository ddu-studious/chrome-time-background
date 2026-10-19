(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const core = cjs ? require('./aquarium-core.js') : root && root.AquariumCore;
    // 玩法（戳、喂食、拉尾）是可选层：少了或没加载成功只是没有这些玩法，鱼与存储照常
    const playCore = cjs ? require('./aquarium-play-core.js') : root && root.AquariumPlayCore;
    const playUi = cjs ? require('./aquarium-play.js') : root && root.AquariumPlay;
    // 写实动物画法（骨架数据 + 求值器）也是可选层：缺席或数据不可用时，已有卡通画法照常；只有海龟没有卡通画法，缺席时不画
    const real = cjs ? require('./aquarium-real.js') : root && root.AquariumReal;
    const api = factory(core, root, playCore || null, playUi || null, real || null);
    if (cjs) module.exports = api;
    // 只创建实例，不自动启动：是否运行由背景体验的设置决定（applySettings 里 start/stop）；没选水母皮肤或关了水族馆时没有任何 DOM、监听或存储读取。
    if (root && typeof document !== 'undefined') root.Aquarium = api.create();
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core, root, DefaultPlayCore, DefaultPlayUi, Real) {
    'use strict';

    // 水族馆控制器：存储（chrome.storage.local 的 aquariumV1）、托盘与居民列表、网兜、抓取状态机、画鱼。
    // 群游与命中等逻辑在 aquarium-core.js；鱼画在背景体验的共享画布上、先于水母画（鱼在水母后面），
    // 不自建 RAF 与画布：调度、隐藏即停、被工作台遮挡即停、省流量降帧都沿用宿主 background-experience.js。
    // 水母（主线）与任务完全无关于鱼：本文件不读也不写任务数据；唯一写入的是 aquariumV1，且只在用户放入或捞出时。
    // 玩法（戳、喂食、拉尾）：规则在 aquarium-play-core.js，画法与喂食按钮在 aquarium-play.js，本文件只接线；玩法状态只在内存里、从不存储。
    // 设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-design.md 与 2026-10-17-aquarium-interaction-design.md。

    const P = Core.PARAMS;
    const TAU = Math.PI * 2;
    const STORAGE_KEY = 'aquariumV1';
    const DRAG_PX = 6;                        // 拖过这么远才算“拖”：之前松手只是点了一下，放回去
    const FLIP_MIN = 0.06;                    // 翻面到正中间时身体最薄的比例
    let realBroken = false;                   // 写实画法抛过异常：之后整个页面生命周期都不再用它（见 drawFish）
    let realDrawn = 0;                        // 上一帧用写实画法画出的鱼数：只给验收诊断（state() 报告），业务路径不读
    const FED_GLOW = 0.25;                    // 刚吃到饲料时，鱼的不透明度与光晕额外加亮的比例（乘 0…1 的变亮程度）
    const FALLBACK_PALETTE = Object.freeze([
        [255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225],
    ]);

    /** 放不进去 / 失败的原因，给托盘的原因行与状态栏用（上限数字取当前真实值：省流量时是 6，不是 12）。 */
    function reasonText(reason, cap) {
        const low = cap && cap.lowPower ? '，省流量模式' : '';
        switch (reason) {
            case 'full': return `水族馆已满（最多 ${cap.maxEntries} 个${low}），先捞出一条再放`;
            case 'large': return `大型鱼最多 ${cap.maxLarge} 条，先捞出一条再放`;
            case 'render': return `画面里的鱼已有 ${cap.fish} 条（最多 ${cap.maxFish} 条${low}），先捞出一些再放`;
            case 'unknown': return '没有这种鱼';
            case 'missing': return '这条鱼已经不在了';
            default: return '保存失败，没有改动';
        }
    }

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function rgba(color, alpha) {
        return `rgba(${color[0] | 0}, ${color[1] | 0}, ${color[2] | 0}, ${clamp(alpha, 0, 1).toFixed(3)})`;
    }
    function mixColor(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

    // ---------- 画法 ----------
    // 每种鱼：half 是 5 个站位（头 → 尾）的半宽（占体长的比例）；tail 是尾鳍形状与长度；dorsal 是背鳍高度；其余是各种的特征。
    const SHAPES = Object.freeze({
        neon: { half: [0.02, 0.11, 0.13, 0.08, 0.03], tail: 'fork', tailLen: 0.3, dorsal: 0.06, stripe: true },
        tang: { half: [0.03, 0.16, 0.2, 0.12, 0.04], tail: 'fork', tailLen: 0.32, dorsal: 0.2 },
        // 小丑鱼：圆胖的橙色身体 + 3 条带黑边的白带（只画在身体里）+ 圆尾与胸鳍
        clown: { half: [0.06, 0.22, 0.26, 0.18, 0.07], tail: 'round', tailLen: 0.3, dorsal: 0.36, bands: 3, pectoral: true, eye: 0.04 },
        // 河豚：接近圆球、浅色肚皮、短刺一圈、小圆尾与胸鳍
        puffer: { half: [0.12, 0.37, 0.42, 0.33, 0.13], tail: 'round', tailLen: 0.16, dorsal: 0.08, round: true, belly: true, spines: 12, pectoral: true, eye: 0.045 },
        // 神仙鱼：高而向后掠的背鳍与臀鳍围成三角形轮廓、身上 3 道竖纹、腹鳍拖两根长丝
        angel: { half: [0.02, 0.2, 0.33, 0.22, 0.04], tail: 'round', tailLen: 0.2, dorsal: 0.5, anal: 0.42, sweep: -0.1, stripes: 3, filament: true, eye: 0.03 },
        hammer: { half: [0.03, 0.09, 0.11, 0.07, 0.02], tail: 'shark', tailLen: 0.34, dorsal: 0.2, hammer: true },
        // 蝠鲼：前缘圆润外展到翼尖、后缘内凹的大翅膀，头前两片头鳍，细长的尾
        manta: { half: [0.02, 0.07, 0.09, 0.05, 0.01], tail: 'whip', tailLen: 0.5, dorsal: 0, wings: true, cephalic: true, amp: 0.05 },
        whaleshark: { half: [0.05, 0.1, 0.12, 0.09, 0.04], tail: 'shark', tailLen: 0.24, dorsal: 0.12, spots: true, amp: 0.08 },
    });
    const STATIONS = [0, 0.25, 0.5, 0.75, 1];
    const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);    // 拉尾的位移落在各站位上的比例：越靠尾越多，头与前身不动

    // ---- 几何辅助（纯函数，u 沿体长：0 头 → 1 尾）----

    /** 沿 5 个站位的半宽线性插值；u 越界夹住。 */
    function halfAt(half, u) {
        const t = clamp(Number.isFinite(u) ? u : 0, 0, 1) * (half.length - 1);
        const i = Math.min(half.length - 2, Math.floor(t));
        return lerp(half[i], half[i + 1], t - i);
    }

    /** 沿脊柱站位线性插值出 u 处的点（带摆尾与弯身）；u 越界夹住。 */
    function spineAt(spine, u) {
        const t = clamp(Number.isFinite(u) ? u : 0, 0, 1) * (spine.length - 1);
        const i = Math.min(spine.length - 2, Math.floor(t));
        const f = t - i;
        return { x: lerp(spine[i].x, spine[i + 1].x, f), y: lerp(spine[i].y, spine[i + 1].y, f) };
    }

    /** n 条带/纹在身体中段 0.2…0.8 之间等距排开（n 为 1 时在正中）。 */
    function bandCenters(n) {
        if (!Number.isFinite(n) || n < 1) return [];
        const count = Math.floor(n);
        if (count === 1) return [0.5];
        return Array.from({ length: count }, (_, i) => 0.2 + 0.6 * i / (count - 1));
    }

    /** 河豚的刺：n 根，上下交替排在身体中段的轮廓上，朝外且略向后，长度为体长的 7%。 */
    function spineMarks(spine, half, len, n) {
        if (!Number.isFinite(n) || n < 1) return [];
        const count = Math.floor(n);
        const perSide = Math.ceil(count / 2);
        const dirX = -0.35 / Math.hypot(0.35, 0.94);
        const dirY = 0.94 / Math.hypot(0.35, 0.94);
        const marks = [];
        for (let i = 0; i < count; i++) {
            const side = i % 2 === 0 ? -1 : 1;
            const k = Math.floor(i / 2);
            const u = 0.14 + 0.72 * (k + (side < 0 ? 0 : 0.5)) / perSide;
            const p = spineAt(spine, u);
            const root = { x: p.x, y: p.y + side * halfAt(half, u) * len };
            marks.push({ x1: root.x, y1: root.y, x2: root.x + dirX * len * 0.07, y2: root.y + side * dirY * len * 0.07 });
        }
        return marks;
    }
    const geometry = Object.freeze({ halfAt, spineAt, bandCenters, spineMarks, bodyOutline, noseCap, smoothAt, spineOf });

    /**
     * 沿体长 5 个站位的脊柱：横向偏移 = 摆尾正弦（越靠尾越大）+ 转弯时的弯身。
     * pull（可选，{ x, y }，鱼本地 px）是拉尾的位移：按 PULL_WEIGHT 叠到各站位上，尾端拉得最多；缺失或非有限时没有影响。
     */
    function spineOf(fish, shape, len, pull) {
        const amp = (shape.amp || 0.12) * len;
        const bend = clamp(fish.turn || 0, -1, 1) * len * 0.12;
        const pulled = !!pull && Number.isFinite(pull.x) && Number.isFinite(pull.y);
        return STATIONS.map((u, i) => ({
            x: len * (0.5 - u) + (pulled ? pull.x * PULL_WEIGHT[i] : 0),
            y: Math.sin(fish.phase - u * 2.4) * amp * Math.pow(u, 1.4) + bend * Math.pow(u, 1.5) + (pulled ? pull.y * PULL_WEIGHT[i] : 0),
        }));
    }

    /** Catmull-Rom 插值（端点复制）：u 在 0…1，沿数组均匀取值。 */
    function smoothAt(values, u) {
        const n = values.length - 1;
        const t = clamp(u, 0, 1) * n;
        const i = Math.min(n - 1, Math.floor(t));
        const f = t - i;
        const p0 = values[Math.max(0, i - 1)]; const p1 = values[i]; const p2 = values[i + 1]; const p3 = values[Math.min(n, i + 2)];
        return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
    }
    // 沿体长取点：两头密、中间疏；头部 16% 内半宽按四分之一椭圆收到 0，鼻子是圆的而不是被竖着切平
    const BODY_SAMPLES = Object.freeze([0, 0.02, 0.06, 0.12, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1]);
    const NOSE_CAP = 0.16;
    function noseCap(u) {
        if (u >= NOSE_CAP) return 1;
        const k = 1 - u / NOSE_CAP;
        return Math.sqrt(Math.max(0, 1 - k * k));
    }

    /** 身体上下轮廓的取样点（纯函数）：5 个站位直接连会得到“六边形”的身体（胖鱼最明显），按两头密的取样点平滑插值后轮廓圆润。 */
    function bodyOutline(spine, half, len) {
        const xs = spine.map(p => p.x);
        const ys = spine.map(p => p.y);
        const top = [];
        const bottom = [];
        for (const u of BODY_SAMPLES) {
            const x = smoothAt(xs, u);
            const y = smoothAt(ys, u);
            const h = Math.max(0.004, smoothAt(half, u) * noseCap(u)) * len;
            top.push({ x, y: y - h });
            bottom.push({ x, y: y + h });
        }
        return { top, bottom, us: BODY_SAMPLES };
    }

    function bodyPath(ctx, spine, half, len) {
        const { top, bottom } = bodyOutline(spine, half, len);
        ctx.beginPath();
        ctx.moveTo(top[0].x, top[0].y);
        for (let i = 1; i < top.length; i++) {
            const mx = (top[i - 1].x + top[i].x) / 2;
            const my = (top[i - 1].y + top[i].y) / 2;
            ctx.quadraticCurveTo(top[i - 1].x, top[i - 1].y, mx, my);
        }
        ctx.lineTo(top[top.length - 1].x, top[top.length - 1].y);
        ctx.lineTo(bottom[bottom.length - 1].x, bottom[bottom.length - 1].y);
        for (let i = bottom.length - 1; i >= 1; i--) {
            const mx = (bottom[i - 1].x + bottom[i].x) / 2;
            const my = (bottom[i - 1].y + bottom[i].y) / 2;
            ctx.quadraticCurveTo(bottom[i].x, bottom[i].y, mx, my);
        }
        ctx.lineTo(bottom[0].x, bottom[0].y);
        ctx.closePath();
    }

    function drawTail(ctx, shape, tip, len) {
        const t = len * shape.tailLen;
        ctx.beginPath();
        if (shape.tail === 'whip') {
            ctx.moveTo(tip.x, tip.y - len * 0.01);
            ctx.lineTo(tip.x - t, tip.y);
            ctx.lineTo(tip.x, tip.y + len * 0.01);
        } else if (shape.tail === 'shark') {
            ctx.moveTo(tip.x + len * 0.02, tip.y);
            ctx.lineTo(tip.x - t * 0.9, tip.y - t * 0.8);
            ctx.lineTo(tip.x - t * 0.5, tip.y);
            ctx.lineTo(tip.x - t * 0.5, tip.y + t * 0.1);
            ctx.lineTo(tip.x - t * 0.8, tip.y + t * 0.4);
        } else if (shape.tail === 'round') {
            ctx.moveTo(tip.x + len * 0.02, tip.y);
            ctx.quadraticCurveTo(tip.x - t * 0.6, tip.y - t * 0.75, tip.x - t, tip.y);
            ctx.quadraticCurveTo(tip.x - t * 0.6, tip.y + t * 0.75, tip.x + len * 0.02, tip.y);
        } else {
            ctx.moveTo(tip.x + len * 0.02, tip.y);
            ctx.lineTo(tip.x - t, tip.y - t * 0.7);
            ctx.lineTo(tip.x - t * 0.55, tip.y);
            ctx.lineTo(tip.x - t, tip.y + t * 0.7);
        }
        ctx.closePath();
    }

    function drawFin(ctx, spine, half, len, height, side, sweep = 0.08) {
        // 背鳍（side=-1）或臀鳍（side=1）：站位 1 到 3 之间的三角；sweep 是鳍尖相对身体正中的前后位置（负数向尾部掠）
        const a = spine[1]; const b = spine[3]; const m = spine[2];
        const ya = a.y + side * half[1] * len;
        const yb = b.y + side * half[3] * len;
        ctx.beginPath();
        ctx.moveTo(a.x, ya);
        ctx.quadraticCurveTo(m.x + len * sweep, m.y + side * (half[2] * len + height * len), b.x, yb);
        ctx.closePath();
    }

    /** extras（可选，来自 AquariumPlayCore.extrasOf）：{ pull: {x, y} | null 拉尾位移, fed: 0…1 变亮程度 }；缺失、非法时与没有玩法时完全一样。 */
    function drawFish(ctx, fish, palette, view, extras) {
        const spec = Core.speciesById(fish.species);
        const shape = SHAPES[fish.species];
        // 写实画法：view.real 为真（设置开着）且该种有可用的骨架数据时用它；没有卡通形状的物种（海龟）不管设置如何都只有写实画法
        const useReal = !!Real && !realBroken && Real.has(fish.species) && (view.real === true || !shape);
        if (!spec || (!shape && !useReal)) return;
        // 被网兜捞起时按进度缩小（先慢后快），其余时候 scoopT 不存在或为 0，按原大小
        const scoop = Number.isFinite(fish.scoopT) ? clamp(fish.scoopT, 0, 1) : 0;
        const len = fish.len * (1 - P.SCOOP_SHRINK * scoop * scoop * (3 - 2 * scoop));
        const main = palette[spec.colors[0] % palette.length] || FALLBACK_PALETTE[0];
        const accent = palette[spec.colors[1] % palette.length] || FALLBACK_PALETTE[1];
        // 主次：鱼比水母淡，越远越淡；夜里略亮
        const fed = extras && Number.isFinite(extras.fed) ? clamp(extras.fed, 0, 1) : 0;
        const A = clamp(fish.alpha * view.amount * lerp(0.5, 1.0, fish.z) * (1 + 0.3 * view.night + FED_GLOW * fed), 0, 1);
        if (A <= 0.003) return;
        const far = fish.z < 0.55 || view.lowPower;       // 远处与省流量：不画渐变、眼睛、鳍的细节
        // 朝左游时身体翻过来（背鳍始终朝上）：用核心维护的当前面（缓动的 −1…1，换面时身体先收窄再展开，像打了个滚）；
        // 缺失或非法（旧数据）才按朝向取正负。正中间留一条细身体而不缩到 0，免得画布矩阵退化。
        let flip = Number.isFinite(fish.flip) ? clamp(fish.flip, -1, 1) : (Math.cos(fish.ang) < 0 ? -1 : 1);
        if (Math.abs(flip) < FLIP_MIN) flip = flip < 0 ? -FLIP_MIN : FLIP_MIN;
        if (useReal) {
            // 速度参照用“该种巡航速度 × 视口缩放”：姿态据此决定摆动幅度（慢了摆得小）
            try {
                if (Real.draw(ctx, fish, {
                    len, flip, fed, far, night: view.night, amount: view.amount, lowPower: view.lowPower,
                    speed: spec.speed * (view.scale || 1), pull: extras && extras.pull, color: main, alpha: fish.alpha,
                })) { realDrawn++; return; }
            } catch (error) {
                // 写实画法出错（Canvas 拒绝了某个值等）：本页面不再用它，有卡通画法的退回卡通，海龟这类没有的不画；画布状态已由 Real.draw 还原
                realBroken = true;
                if (typeof view.onRealError === 'function') view.onRealError(error);
            }
            if (!shape) return;                           // 海龟没有卡通画法：写实数据不可用时就不画（居民列表与存储不受影响）
        }
        const spine = spineOf(fish, shape, len, extras && extras.pull);
        const half = shape.half;

        ctx.save();
        ctx.translate(fish.x, fish.y);
        ctx.rotate(fish.ang);
        ctx.scale(1, flip);

        const glow = clamp(view.night + fed * 0.9, 0, 1);              // 夜里的荧光与刚吃到饲料的光晕共用同一圈渐变
        if (glow > 0.05 && !view.lowPower) {
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.95);
            g.addColorStop(0, rgba(main, 0.2 * glow * A));
            g.addColorStop(1, rgba(main, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(0, 0, len * 0.95, 0, TAU);
            ctx.fill();
        }

        // 鳍与尾（比身体更透明）
        ctx.fillStyle = rgba(accent, A * 0.55);
        const nose = spine[0].x - len * 0.04;
        if (shape.wings) {
            // 蝠鲼的翅膀：前缘圆润地外展到翼尖，后缘内凹收回；两翼同时向中间拍
            const flap = Math.sin(fish.phase * 0.5) * len * 0.1;
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(nose, 0);
                ctx.quadraticCurveTo(spine[1].x + len * 0.16, side * len * 0.2 - side * flap * 0.4, spine[2].x - len * 0.1, side * (len * 0.56 - flap));
                ctx.quadraticCurveTo(spine[2].x - len * 0.14, side * len * 0.2, spine[3].x + len * 0.04, side * len * 0.04);
                ctx.lineTo(spine[3].x, 0);
                ctx.closePath();
                ctx.fill();
            }
        }
        if (shape.dorsal > 0 && !far) { drawFin(ctx, spine, half, len, shape.dorsal, -1, shape.sweep); ctx.fill(); }
        if (shape.anal && !far) { drawFin(ctx, spine, half, len, shape.anal, 1, shape.sweep); ctx.fill(); }
        drawTail(ctx, shape, spine[4], len);
        ctx.fill();

        // 身体
        if (far) {
            ctx.fillStyle = rgba(main, A * 0.8);
        } else {
            const w = half[2] * len;
            const g = ctx.createLinearGradient(0, -w, 0, w);
            g.addColorStop(0, rgba(mixColor(main, [255, 255, 255], 0.25), A * 0.85));
            g.addColorStop(1, shape.belly ? rgba(mixColor(main, [255, 250, 235], 0.65), A * 0.8) : rgba(mixColor(main, accent, 0.5), A * 0.6));
            ctx.fillStyle = g;
        }
        bodyPath(ctx, spine, half, len);
        ctx.fill();

        if (!far) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = rgba([235, 248, 255], A * 0.45);
            ctx.stroke();
        }

        // 各种的特征
        if (shape.hammer) {
            ctx.fillStyle = rgba(main, A * 0.85);
            ctx.beginPath();
            ctx.ellipse(spine[0].x - len * 0.02, spine[0].y, len * 0.06, len * 0.2, 0, 0, TAU);
            ctx.fill();
        }
        if (shape.stripe) {
            ctx.strokeStyle = rgba(accent, A * 0.9);
            ctx.lineWidth = Math.max(1, len * 0.06);
            ctx.beginPath();
            ctx.moveTo(spine[1].x, spine[1].y);
            ctx.lineTo(spine[3].x, spine[3].y);
            ctx.stroke();
        }
        if (shape.bands && !far) {
            // 白带只画在身体里（按身体轮廓裁剪），两侧各一道细黑边；黑边在宿主的 screen 下加不上任何东西，须用 source-over
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            bodyPath(ctx, spine, half, len);
            ctx.clip();
            const edge = Math.max(1, len * 0.012);
            for (const u of bandCenters(shape.bands)) {
                const p = spineAt(spine, u);
                const h = halfAt(half, u) * len * 1.2;
                const w = len * (u < 0.7 ? 0.1 : 0.06);
                ctx.fillStyle = rgba([255, 255, 255], A * 0.92);
                ctx.fillRect(p.x - w / 2, p.y - h, w, h * 2);
                ctx.fillStyle = rgba([40, 20, 20], A * 0.45);
                ctx.fillRect(p.x - w / 2 - edge, p.y - h, edge, h * 2);
                ctx.fillRect(p.x + w / 2, p.y - h, edge, h * 2);
            }
            ctx.restore();
        }
        if (shape.stripes && !far) {
            // 神仙鱼的竖纹：同样只画在身体里，深色须用 source-over 才看得见
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            bodyPath(ctx, spine, half, len);
            ctx.clip();
            ctx.strokeStyle = rgba([20, 12, 60], A * 0.75);
            ctx.lineWidth = Math.max(1, len * 0.03);
            for (const u of bandCenters(shape.stripes)) {
                const p = spineAt(spine, u);
                const h = halfAt(half, u) * len * 1.1;
                ctx.beginPath();
                ctx.moveTo(p.x - len * 0.02, p.y - h);
                ctx.lineTo(p.x + len * 0.02, p.y + h);
                ctx.stroke();
            }
            ctx.restore();
        }
        if (shape.filament && !far) {
            // 腹鳍的两根长丝，随摆动轻轻荡
            const p = spineAt(spine, 0.28);
            const h = halfAt(half, 0.28) * len;
            const sway = Math.sin(fish.phase * 0.8) * len * 0.04;
            ctx.strokeStyle = rgba(accent, A * 0.65);
            ctx.lineWidth = Math.max(0.8, len * 0.013);
            ctx.lineCap = 'round';
            for (const k of [0, 1]) {
                ctx.beginPath();
                ctx.moveTo(p.x - k * len * 0.04, p.y + h * 0.9);
                ctx.quadraticCurveTo(p.x - len * (0.1 + k * 0.05), p.y + h + len * 0.16, p.x - len * (0.2 + k * 0.08) + sway, p.y + h + len * (0.34 + k * 0.08));
                ctx.stroke();
            }
        }
        if (shape.pectoral && !far) {
            const p = spineAt(spine, 0.3);
            const h = halfAt(half, 0.3) * len;
            ctx.fillStyle = rgba(accent, A * 0.7);
            ctx.beginPath();
            ctx.ellipse(p.x - len * 0.03, p.y + h * 0.35, len * 0.1, len * 0.045, 0.5 + Math.sin(fish.phase * 1.6) * 0.35, 0, TAU);
            ctx.fill();
        }
        if (shape.spines && !far) {
            ctx.strokeStyle = rgba([255, 255, 240], A * 0.55);
            ctx.lineWidth = Math.max(0.8, len * 0.014);
            ctx.lineCap = 'round';
            for (const m of spineMarks(spine, half, len, shape.spines)) {
                ctx.beginPath();
                ctx.moveTo(m.x1, m.y1);
                ctx.lineTo(m.x2, m.y2);
                ctx.stroke();
            }
        }
        if (shape.cephalic && !far) {
            // 蝠鲼头前的两片头鳍
            ctx.fillStyle = rgba(accent, A * 0.75);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(nose, side * len * 0.03);
                ctx.quadraticCurveTo(nose + len * 0.12, side * len * 0.1, nose + len * 0.17, side * len * 0.05);
                ctx.quadraticCurveTo(nose + len * 0.1, side * len * 0.03, nose, 0);
                ctx.fill();
            }
        }
        if (shape.spots && !far) {
            ctx.fillStyle = rgba([235, 248, 255], A * 0.5);
            for (let i = 0; i < 6; i++) {
                const p = spine[1 + (i % 3)];
                const dy = ((i * 7) % 5 - 2) * half[2] * len * 0.3;
                ctx.beginPath();
                ctx.arc(p.x + (i % 2) * len * 0.05, p.y + dy, Math.max(1, len * 0.012), 0, TAU);
                ctx.fill();
            }
        }
        if (!far) {
            // 眼睛是深色：宿主整张画布在 screen 下画（只会变亮），深色加不上任何东西，鱼就没有眼睛；这里切到 source-over（外层 restore 会还原）
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = rgba([10, 20, 40], A * 0.9);
            const eyeR = Math.max(1, len * (shape.eye || 0.025));
            const eyes = shape.wings
                ? [-1, 1].map(side => ({ x: nose - len * 0.02, y: side * len * 0.07 }))
                : [{ x: spine[0].x - len * 0.1, y: spine[0].y - half[1] * len * 0.25 }];
            for (const e of eyes) {
                ctx.beginPath();
                ctx.arc(e.x, e.y, eyeR, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // ---------- 托盘文字（纯函数，便于测试） ----------

    /**
     * 居民列表的条目说明：同一种出现多个时按先后编号（小丑鱼 #1、#2…），只有一个时不编号；群居种带条数；未知种类与坏条目跳过。
     */
    function describeEntries(entries) {
        if (!Array.isArray(entries)) return [];
        const known = [];
        for (const item of entries) {
            const spec = item && typeof item.id === 'string' ? Core.speciesById(item.species) : null;
            if (spec) known.push({ item, spec });
        }
        const totals = new Map();
        for (const { spec } of known) totals.set(spec.id, (totals.get(spec.id) || 0) + 1);
        const seen = new Map();
        return known.map(({ item, spec }) => {
            const number = (seen.get(spec.id) || 0) + 1;
            seen.set(spec.id, number);
            const total = totals.get(spec.id);
            return { id: item.id, species: spec.id, name: spec.name, group: spec.group, number, total, label: total > 1 ? `${spec.name} #${number}` : spec.name };
        });
    }

    /**
     * 现在有哪些种类放不进去、为什么：返回 { text, reasons, blocked }，没有限制时 text 为空。
     * 所有种类都放不进（满了）时只说原因；只有部分种类放不进时点名，例如“蝠鲼、鲸鲨放不下：大型鱼最多 2 条”。
     */
    function describeBlock(entries, lowPower) {
        const low = !!lowPower;
        const list = Array.isArray(entries) ? entries : [];
        const cap = Core.capacity(list, low);
        const byReason = new Map();
        const blocked = [];
        for (const spec of Core.SPECIES) {
            const check = Core.canAdd(list, spec.id, low);
            if (check.ok) continue;
            blocked.push(spec.id);
            if (!byReason.has(check.reason)) byReason.set(check.reason, []);
            byReason.get(check.reason).push(spec);
        }
        const reasons = [];
        const parts = [];
        for (const reason of ['full', 'large', 'render']) {
            const specs = byReason.get(reason);
            if (!specs || !specs.length) continue;
            reasons.push(reason);
            const base = reasonText(reason, cap);
            parts.push(specs.length === Core.SPECIES.length ? base : `${specs.map(spec => spec.name).join('、')}放不下：${base}`);
        }
        return { text: parts.join('；'), reasons, blocked };
    }

    // ---------- 控制器 ----------

    function create(env = {}) {
        const doc = env.document !== undefined ? env.document : (typeof document !== 'undefined' ? document : null);
        const chromeApi = env.chrome || (typeof chrome !== 'undefined' ? chrome : null);
        const random = env.random || Math.random;
        const wall = env.wall || (() => Date.now());
        const warn = env.warn || (message => { if (typeof console !== 'undefined') console.warn(message); });
        const now = env.now || (() => (root && root.performance ? root.performance.now() : Date.now()));
        const hourNow = env.hour || (() => new Date().getHours());
        const palette = () => env.palette || (root && root.JellyfishSkin && root.JellyfishSkin.PALETTE) || FALLBACK_PALETTE;
        const nightAmount = hour => {
            const fn = env.nightAmount || (root && root.JellyfishCore && root.JellyfishCore.nightAmount);
            return typeof fn === 'function' ? fn(hour) : 0;
        };
        // 玩法层可注入（测试里传 null 即关闭）；缺了就没有戳、喂食和拉尾，其余照常
        const PlayCore = env.playCore !== undefined ? env.playCore : DefaultPlayCore;
        const PlayUi = env.play !== undefined ? env.play : DefaultPlayUi;
        const win = env.window !== undefined ? env.window : root;

        let started = false;
        let failed = false;
        let loaded = false;
        let generation = 0;
        let world = null;
        let entries = [];              // 用户放入的鱼（存储里的事实，按正常上限整理；省流量只限制绘制，不丢条目）
        let queue = Promise.resolve();
        let session = null;            // 正在进行的抓取：{ fish, down, dragging, generation, tail }（tail：按住的是后半身，在拉尾）
        let ui = null;
        let netHold = null;            // 捞起动画期间网兜保持显示：{ world, until }（until 是 world.time）
        let storageListener = null;
        let counter = 0;
        let play = null;               // 玩法状态（涟漪、饲料、泡、拉尾弹簧）：首次用到才建，与 world 同生命周期，换 world、停止、出错时丢弃；从不存储
        let playFailed = false;        // 玩法出过错：本次会话停用玩法（鱼与存储照常），下次 start 再试

        // ----- 存储 -----

        const storage = () => (chromeApi && chromeApi.storage && chromeApi.storage.local) || null;

        /**
         * 读取并整理。返回 { ok, entries }：读取抛错或是未来版本的数据（v 不是 1）时 ok:false，这时不得写入，免得覆盖看不懂的原数据；
         * 没有数据或明显不是我们写的东西当空（写入会替换它）。读取阶段从不写存储。
         */
        async function readStored() {
            const area = storage();
            if (!area) return { ok: false, entries: [] };
            let value;
            try {
                const result = await area.get(STORAGE_KEY);
                value = result ? result[STORAGE_KEY] : undefined;
            } catch { return { ok: false, entries: [] }; }
            return parseValue(value);
        }

        function parseValue(value) {
            if (value === undefined || value === null) return { ok: true, entries: [] };
            if (typeof value === 'object' && !Array.isArray(value) && typeof value.v === 'number' && value.v !== 1) return { ok: false, entries: [] };
            if (typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.fish)) return { ok: true, entries: [] };
            return { ok: true, entries: Core.normalizeEntries(value.fish, false).entries };
        }

        function applyEntries(next, options) {
            entries = next;
            if (world) Core.reconcile(world, entries, options || {});
            refreshUi();
        }

        /** 串行事务：先读最新值，再由 fn 算出新名单，写入成功才生效。fn 返回 { entries } 或 { reason }。 */
        function mutate(fn, options) {
            const run = queue.then(async () => {
                const gen = generation;
                const stored = await readStored();
                if (!stored.ok) return { ok: false, reason: 'storage' };
                const outcome = fn(stored.entries);
                if (outcome.reason) return { ok: false, reason: outcome.reason };
                const area = storage();
                try { await area.set({ [STORAGE_KEY]: { v: 1, fish: outcome.entries } }); } catch { return { ok: false, reason: 'storage' }; }
                if (gen === generation) applyEntries(outcome.entries, options);
                return { ok: true };
            });
            queue = run.catch(() => {});
            return run;
        }

        function makeId(species, taken) {
            for (;;) {
                const id = `${species}-${Math.floor(wall()).toString(36)}-${(++counter).toString(36)}`;
                if (!taken.some(item => item.id === id)) return id;
            }
        }

        function trayPoint() {
            const rect = ui && ui.toggle && typeof ui.toggle.getBoundingClientRect === 'function' ? ui.toggle.getBoundingClientRect() : null;
            return rect && rect.width > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
        }

        /** 放入一种鱼：返回 { ok } 或 { ok:false, reason }（unknown / full / large / render / storage）。 */
        function add(speciesId) {
            const from = trayPoint();
            return mutate(current => {
                const check = Core.canAdd(current, speciesId, world ? world.lowPower : false);
                if (!check.ok) return { reason: check.reason };
                const item = { id: makeId(speciesId, current), species: speciesId, addedAt: Math.max(0, Math.floor(wall())) };
                return { entries: current.concat(item) };
            }, { from }).then(result => {
                if (result.ok) setStatus(`已放入${Core.speciesById(speciesId).name}`);
                else setStatus(reasonText(result.reason, Core.capacity(entries, world ? world.lowPower : false)));
                return result;
            });
        }

        /**
         * 捞出一个条目：先让它离开（options.to 是网兜中心时游向网兜、缩小再淡出，否则原地淡出），写入失败就把鱼放回来。
         */
        function remove(entryId, options) {
            if (world && entries.some(item => item.id === entryId)) Core.dismiss(world, entryId, options);
            return mutate(current => {
                if (!current.some(item => item.id === entryId)) return { reason: 'missing' };
                return { entries: current.filter(item => item.id !== entryId) };
            }).then(result => {
                if (result.ok) setStatus('已捞出');
                else {
                    if (world) Core.reconcile(world, entries, {});      // 没有写进去：鱼放回来
                    setStatus(result.reason === 'storage' ? '保存失败，鱼已放回' : reasonText(result.reason, Core.capacity(entries, world ? world.lowPower : false)));
                }
                return result;
            });
        }

        // ----- 玩法接线（戳、喂食、拉尾）：任何一步出错都只停玩法 -----

        const playOn = () => !!(PlayCore && PlayUi && !playFailed && world);       // world 只在运行中且没出过错时才有

        function ensurePlay() {
            if (!play) play = PlayCore.create();
            return play;
        }

        function disablePlay(error) {
            if (playFailed) return;
            playFailed = true;
            play = null;
            warn(`[Aquarium] 玩法出错，本次会话停用戳、喂食和拉尾：${error && error.message ? error.message : error}`);
            if (ui && ui.feed) { ui.feed.destroy(); ui.feed = null; }
            if (ui && ui.feedRow) ui.feedRow.hidden = true;
        }

        /** 玩法里的任何调用都走这里：抛错就只停玩法（鱼、存储与宿主的帧循环不受影响），并返回 fallback。 */
        function playGuard(fn, fallback) {
            try { return fn(); } catch (error) { disablePlay(error); return fallback; }
        }

        function pokeFish(fish, at) {
            if (!playOn()) return;
            playGuard(() => PlayCore.poke(ensurePlay(), world, fish, at));
        }

        /** 收起拉尾记录。quiet：没有回弹、冲刺与泡（没拖就松手、被捞起）；否则尾巴弹回、鱼向前冲一下。调用前鱼应已 Core.release。 */
        function endTail(s, quiet) {
            if (!s.tail) return;
            s.tail = false;
            if (!play || !playOn()) return;
            playGuard(() => PlayCore.endHold(play, world, s.fish, quiet ? { quiet: true } : undefined));
        }

        /** 喂食：按钮点击时 point 为 null（从上面落下），从按钮拖到水里松手时是松手处。结果同时写进状态栏。 */
        function feedAt(point) {
            if (!playOn()) return { ok: false, reason: 'inactive' };
            const at = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : undefined;
            const result = playGuard(() => PlayCore.sprinkle(ensurePlay(), world, at), { ok: false, reason: 'failed' });
            if (result.ok) setStatus(`落下了 ${result.count} 粒饲料`);
            else if (result.reason === 'busy') setStatus('饲料还没吃完');
            else if (result.reason === 'failed') setStatus('喂食出错，已停用戳、喂食和拉尾');
            return result;
        }

        // ----- 界面（托盘、居民列表、网兜）：只用 createElement 与 textContent -----

        function el(tag, className, text) {
            const node = doc.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        }

        function setStatus(text) {
            if (ui && ui.status) ui.status.textContent = text;
        }

        function buildUi() {
            if (!doc || !doc.body || typeof doc.createElement !== 'function') return null;
            const rootEl = el('div', 'aq-ui');
            const toggle = el('button', 'aq-toggle');
            toggle.type = 'button';
            toggle.setAttribute('aria-label', '水族馆：放入或捞出鱼');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.setAttribute('title', '水族馆：放入或捞出鱼');
            const icon = el('i', 'fa-solid fa-fish');
            icon.setAttribute('aria-hidden', 'true');
            toggle.appendChild(icon);

            const panel = el('div', 'aq-panel');
            panel.hidden = true;
            panel.setAttribute('role', 'group');
            panel.setAttribute('aria-label', '水族馆');
            panel.appendChild(el('div', 'aq-title', '水族馆'));
            const row = el('div', 'aq-species-row');
            const speciesButtons = new Map();
            for (const spec of Core.SPECIES) {
                const button = el('button', 'aq-species', spec.name);
                button.type = 'button';
                button.setAttribute('aria-label', `放入${spec.name}`);
                button.addEventListener('click', () => { void add(spec.id); });
                row.appendChild(button);
                speciesButtons.set(spec.id, button);
            }
            panel.appendChild(row);
            // 喂食：玩法层可用时才有（缺了或出错都不显示，也不影响放入与捞出）
            let feed = null;
            let feedRow = null;
            if (PlayCore && PlayUi && !playFailed) {
                feedRow = el('div', 'aq-feed-row');
                feed = PlayUi.mountFeed(feedRow, { doc, win, now, feed: point => feedAt(point), overUi: (x, y) => overUi(x, y) });
                feedRow.appendChild(el('span', 'aq-feed-hint', '点一下撒饲料，也可以拖到水里'));
                panel.appendChild(feedRow);
            }
            const capacityLine = el('div', 'aq-capacity', '');
            panel.appendChild(capacityLine);
            const reasonLine = el('div', 'aq-reason', '');
            reasonLine.setAttribute('id', 'aq-reason');
            reasonLine.setAttribute('role', 'note');
            reasonLine.hidden = true;
            panel.appendChild(reasonLine);
            const list = el('ul', 'aq-list');
            panel.appendChild(list);
            const status = el('div', 'aq-status', '');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            panel.appendChild(status);
            rootEl.appendChild(toggle);
            rootEl.appendChild(panel);

            const net = el('div', 'aq-net');
            net.setAttribute('aria-hidden', 'true');
            net.appendChild(el('span', 'aq-net-label', '拖到这里捞出'));

            const onToggle = () => {
                panel.hidden = !panel.hidden;
                toggle.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
            };
            toggle.addEventListener('click', onToggle);
            const onKey = event => {
                if (event && event.key === 'Escape' && !panel.hidden) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
            };
            if (typeof doc.addEventListener === 'function') doc.addEventListener('keydown', onKey);

            doc.body.appendChild(rootEl);
            doc.body.appendChild(net);
            return { root: rootEl, toggle, panel, list, status, net, speciesButtons, capacityLine, reasonLine, onKey, feed, feedRow };
        }

        function destroyUi() {
            if (!ui) return;
            if (typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', ui.onKey);
            if (ui.feed) ui.feed.destroy();
            ui.root.remove();
            ui.net.remove();
            ui = null;
        }

        function refreshUi() {
            if (!ui) return;
            const low = world ? world.lowPower : false;
            const block = describeBlock(entries, low);
            const blockedSet = new Set(block.blocked);
            const cap = Core.capacity(entries, low);
            const reasonId = ui.reasonLine.getAttribute('id');
            for (const spec of Core.SPECIES) {
                const button = ui.speciesButtons.get(spec.id);
                const blockedNow = blockedSet.has(spec.id);
                button.disabled = blockedNow;
                button.setAttribute('title', blockedNow ? block.text : `放入${spec.name}`);
                if (blockedNow && block.text) button.setAttribute('aria-describedby', reasonId);
                else button.removeAttribute('aria-describedby');
            }
            if (ui.feed) {
                const hasFish = entries.length > 0;
                ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');
            }
            ui.capacityLine.textContent = `已放 ${cap.entries}/${cap.maxEntries} 个${low ? '（省流量）' : ''} · 大型鱼 ${cap.large}/${cap.maxLarge}`;
            ui.reasonLine.textContent = block.text;
            ui.reasonLine.hidden = !block.text;
            const items = [];
            if (!entries.length) {
                const empty = el('li', 'aq-empty', '还没有鱼，点上面的鱼种放入');
                empty.setAttribute('id', 'aq-empty');
                items.push(empty);
            }
            for (const info of describeEntries(entries)) {
                const li = el('li', 'aq-item');
                li.appendChild(el('span', 'aq-item-name', info.label));
                if (info.group > 1) li.appendChild(el('span', 'aq-item-meta', `${info.group} 条`));
                const out = el('button', 'aq-catch', '捞出');
                out.type = 'button';
                out.setAttribute('aria-label', `捞出${info.label}`);
                out.addEventListener('click', () => { void remove(info.id); });
                li.appendChild(out);
                items.push(li);
            }
            ui.list.replaceChildren(...items);
        }

        // ----- 抓取 -----

        const inRect = (node, x, y) => {
            if (!node || typeof node.getBoundingClientRect !== 'function') return false;
            const r = node.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
        };
        const netContains = (x, y) => inRect(ui && ui.net, x, y);
        /** (x, y) 是不是在托盘上（开关按钮或展开的面板）：喂食拖出去时松在这里算取消。 */
        const overUi = (x, y) => !!ui && (inRect(ui.toggle, x, y) || inRect(ui.panel, x, y));

        const netCenter = () => {
            if (!ui || !ui.net || typeof ui.net.getBoundingClientRect !== 'function') return null;
            const r = ui.net.getBoundingClientRect();
            return r.width > 0 && r.height > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
        };

        function hideNet() {
            netHold = null;
            if (!ui) return;
            ui.net.classList.remove('aq-net-on');
            ui.net.classList.remove('aq-net-near');
        }

        /** keepNet：捞起时网兜多留一会儿（到捞起动画结束，见 frame），免得鱼游向一个已经消失的网兜。 */
        function endSession(keepNet) {
            session = null;
            if (!keepNet) hideNet();
        }

        const present = s => !!(started && world && s.generation === generation && world.fish.includes(s.fish) && s.fish.state === 'held');

        function hoverAt(x, y) {
            if (!started || failed || !world || session) return false;
            return !!Core.hitTest(world, x, y);
        }

        function grabAt(x, y) {
            if (!started || failed || !world || session) return false;
            const fish = Core.hitTest(world, x, y);
            if (!fish) return false;
            const tail = playOn() && playGuard(() => PlayCore.isTailZone(fish, x, y), false);
            if (!Core.grab(world, fish, x, y, tail ? { tail: true } : undefined)) return false;
            session = { fish, down: { x, y }, dragging: false, generation, tail };
            if (tail) playGuard(() => PlayCore.beginHold(ensurePlay(), world, fish));        // 出错时玩法停用，endTail 随之什么都不做
            return true;
        }

        function tick(point) {
            const s = session;
            if (!s) return;
            if (!present(s)) { endSession(); return; }
            if (!point) return;
            if (!s.dragging) {
                if (Math.hypot(point.x - s.down.x, point.y - s.down.y) < DRAG_PX) return;
                s.dragging = true;
                if (!ui) {                         // 没有落点（受限环境）：这次不抓了，鱼原样放回，绝不在没有网兜时捞出
                    Core.release(world, s.fish);
                    endTail(s, true);
                    endSession();
                    return;
                }
                ui.net.classList.add('aq-net-on');
            }
            ui.net.classList.toggle('aq-net-near', netContains(point.x, point.y));
        }

        /**
         * 抬起：返回这次是不是真的“拖过”（宿主据此吞掉随后的 click）。
         * 没拖过 = 放回并“戳”一下（点一下鱼，不吞 click）；拖过但不在网兜里 = 放回（拉着尾巴的：尾巴弹回、鱼向前冲）；在网兜里 = 捞出。
         */
        function drop(x, y) {
            const s = session;
            if (!s) return false;
            if (!present(s)) { endSession(); return false; }
            const fish = s.fish;
            if (!s.dragging) {
                Core.release(world, fish);
                endTail(s, true);
                endSession();
                pokeFish(fish, s.down);
                return false;
            }
            const inNet = netContains(x, y);
            const to = inNet ? netCenter() : null;
            if (!inNet) { endSession(); Core.release(world, fish); endTail(s, false); return true; }
            endTail(s, true);
            endSession(true);
            netHold = { world, until: world.time + P.SCOOP_S + 0.1 };
            void remove(fish.entry, to ? { to } : undefined);
            return true;
        }

        function cancel() {
            const s = session;
            if (!s) return false;
            if (present(s)) {
                Core.release(world, s.fish);
                endTail(s, !s.dragging);
            }
            endSession();
            return true;
        }

        // ----- 生命周期 -----

        function watchStorage() {
            const area = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
            if (!area || typeof area.addListener !== 'function') return;
            storageListener = (changes, areaName) => {
                if (areaName !== 'local' || !changes || !changes[STORAGE_KEY]) return;
                const parsed = parseValue(changes[STORAGE_KEY].newValue);
                if (parsed.ok) applyEntries(parsed.entries, {});
            };
            area.addListener(storageListener);
        }

        async function load(gen) {
            const stored = await readStored();
            if (gen !== generation) return;
            entries = stored.entries;
            loaded = true;
            if (world) Core.reconcile(world, entries, { instant: true });
            refreshUi();
        }

        function start() {
            if (started) return;
            started = true;
            failed = false;
            playFailed = false;
            loaded = false;
            generation++;
            world = null;
            entries = [];
            ui = buildUi();
            refreshUi();
            watchStorage();
            void load(generation);
        }

        function stop() {
            if (!started) return;
            started = false;
            generation++;
            session = null;
            const area = chromeApi && chromeApi.storage && chromeApi.storage.onChanged;
            if (storageListener && area && typeof area.removeListener === 'function') area.removeListener(storageListener);
            storageListener = null;
            destroyUi();
            world = null;
            play = null;
            entries = [];
            loaded = false;
        }

        /**
         * 由宿主在它自己的 RAF 里每帧调用（先于水母）：推进一步并画出来。返回是否画了。
         * 没有鱼时一笔不画；画法出任何异常都只停掉鱼层（并留一条警告、收起托盘），不让宿主的帧循环断掉，也不影响存储里的数据。
         */
        function frame(options = {}) {
            const { ctx, width, height, dt, pointer = null, lowPower = false } = options;
            if (!started || failed || !ctx || !(width > 0) || !(height > 0)) return false;
            try {
                if (!loaded) return true;
                const low = !!lowPower;
                if (!world || world.lowPower !== low) {
                    world = Core.createWorld({ width, height, random, lowPower: low });
                    play = null;
                    Core.reconcile(world, entries, { instant: true });
                    refreshUi();
                } else if (world.width !== width || world.height !== height) {
                    const ratioX = width / world.width;
                    const ratioY = height / world.height;
                    Core.resize(world, width, height);
                    if (play) playGuard(() => PlayCore.resize(play, ratioX, ratioY));
                }
                const point = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) ? { x: pointer.x, y: pointer.y } : null;
                const attractors = play && playOn() ? playGuard(() => PlayCore.attractors(play, world), undefined) : undefined;
                Core.step(world, dt, { pointer: point, bells: options.bells, attractors });
                if (play) playGuard(() => PlayCore.step(play, world, dt));
                tick(point);
                if (netHold && !session && (netHold.world !== world || world.time >= netHold.until)) hideNet();
                if (!world.fish.length) { play = null; return true; }
                const night = options.night === false ? 0 : nightAmount(Number.isFinite(options.nightHour) ? options.nightHour : hourNow());
                const view = { amount: clamp(Number.isFinite(options.amount) ? options.amount : 0.65, 0, 1), night: clamp(night || 0, 0, 1), lowPower: low, scale: world.scale, real: options.realistic !== false,
                    onRealError: error => warn(`[Aquarium] 写实画法出错，本页面改用卡通画法：${error && error.message ? error.message : error}`) };
                const colors = palette();
                const order = world.fish.slice().sort((a, b) => a.z - b.z);       // 先画远的
                realDrawn = 0;
                if (play) playGuard(() => PlayUi.drawBack(ctx, play, view));
                for (const fish of order) drawFish(ctx, fish, colors, view, play ? playGuard(() => PlayCore.extrasOf(play, fish), undefined) : undefined);
                if (play) playGuard(() => PlayUi.drawFront(ctx, play, view));
                return true;
            } catch (error) {
                failed = true;
                session = null;
                world = null;
                play = null;
                destroyUi();
                warn(`[Aquarium] 绘制出错，本次会话停用水族馆：${error && error.message ? error.message : error}`);
                return false;
            }
        }

        return {
            start, stop, frame, hoverAt, grabAt, drop, cancel, add, remove,
            isActive: () => started && !failed,
            isGrabbing: () => !!session,
            entries: () => entries.map(item => ({ id: item.id, species: item.species, addedAt: item.addedAt })),
            // realDrawn：上一帧用写实画法画出的鱼数；realFailed：写实画法抛过异常、本页面已改用卡通（验收诊断，业务路径不读）
            state: () => ({ started, failed, loaded, entries: entries.length, fish: world ? world.fish.length : 0, grabbing: !!session, playFailed, realDrawn, realFailed: realBroken }),
            _world: () => world,
            _play: () => play,
        };
    }

    return { create, SHAPES, STORAGE_KEY, DRAG_PX, geometry, drawFish, describeEntries, describeBlock, reasonText };
});
