(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const Shapes = cjs ? require('./jelly-species-shapes.js') : root && root.JellySpeciesShapes;
    const api = factory(Shapes);
    if (cjs) module.exports = api;
    if (root) root.MarineRig = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function (Shapes) {
    'use strict';

    // 海洋动物“骨架求值器”：写实风格的唯一来源（水族馆的 Canvas 与桌面的 CoreGraphics 画的是同一份求值结果）。
    // 复用 js/jelly-species-shapes.js 已有的 parsePath / ellipsePath / mirrorPath（M/L/C/Q/Z 绝对命令的严格解析器），不另写路径语法；
    // 这里只增加三样东西：
    //   1. 压平：把每段贝塞尔取固定数量的点（CURVE_STEPS），得到多边形——两个平台的求值逐点一致，才有“对齐”可言；
    //   2. 脊柱弯曲（bend）：整只动物的所有顶点沿身体轴 s∈[0,1]（0 尾尖、1 吻端）做行波横向位移，幅度向尾部增大，顶点按脊柱切线旋转
    //      （解析导数，没有数值微分），真实鱼类/鲨鱼的“波长约一个体长、尾幅最大、头几乎不动”；
    //   3. 部件拍动（flap）：鳍/翼/桨足绕 pivot 的转动 + 沿翼展的相位滞后（lag：离 pivot 越远转得越晚，翼尖拖在后面）+ 可选 y 向压扁（squash，俯视拍翼的透视收缩）。
    // 求值只依赖 pose = { phase, amp, turn }：phase 游动相位（弧度）、amp 0…1 幅度（滑行时降到 0）、turn −1…1 转弯弯曲；
    // 不碰 DOM、时钟、随机数。颜色/渐变/描边在 op 里是数据，由各平台的薄画笔画出。设计见 docs/technical/marine-realism-20261019.md。
    //
    // 坐标：身体轴沿 x，吻端朝 +x，原点在身体中央附近；y 向下（SVG 惯例）。俯视动物的 y 是左右，侧视动物的 y 是背（负）腹（正）。单位是“休止长度”的点，
    // 数据里 length=100 表示体长 100 单位，由宿主按显示大小缩放。

    const CURVE_STEPS = 8;           // 每段 C/Q 压平成多少条线段（桌面端同一个值）
    const MAX_POINTS = 6000;         // 一个图层压平后的点数上限（防坏数据；鲸鲨斑点是最大的图层）
    const MAX_LAYERS = 160;
    const MAX_BEND = 0.2;            // amp 上限：体长的 20% 横向位移已经远超任何真实游动
    const MAX_PULL = 60;             // 拉尾位移上限（休止坐标单位）：体长 100 时最多拉歪 60%
    const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);   // 与水族馆旧画法的 PULL_WEIGHT 一致（头 → 尾五个站位）
    const VIEWS = Object.freeze(['side', 'top']);
    const TWO_PI = Math.PI * 2;
    const SPINE_STEPS = 160;         // evaluate 每帧把脊柱离散成这么多段（站位表），逐点线性插值；两个平台用同一个值
    const FLAP_STEPS = 64;           // 每个部件的“距 pivot 的远近 → 转角/压扁”表的段数

    const finite = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
    const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
    const isNum = value => typeof value === 'number' && Number.isFinite(value);

    // ---------- 颜色 ----------

    /** '#rgb' / '#rrggbb' → [r, g, b]（0…1）；不合规返回 null。 */
    function parseColor(text) {
        if (typeof text !== 'string') return null;
        const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(text);
        if (!m) return null;
        let hex = m[1];
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        return [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];
    }

    // ---------- 压平 ----------

    /**
     * 路径串 → 子路径列表 [{ pts: [x0, y0, x1, y1, …], closed }]。每段 C/Q 取 CURVE_STEPS 个点（t = i/CURVE_STEPS，i = 1…CURVE_STEPS），
     * M/L 的端点原样；闭合子路径末点与起点重合时去掉重复点。路径不合规返回 null。
     */
    function flatten(d, steps = CURVE_STEPS) {
        const cmds = Shapes.parsePath(d);
        if (!cmds) return null;
        const out = [];
        let sub = null;
        let current = null;
        let start = null;
        const push = (x, y) => { sub.pts.push(x, y); };
        for (const { cmd, pts } of cmds) {
            if (cmd === 'M') {
                sub = { pts: [], closed: false };
                out.push(sub);
                push(pts[0][0], pts[0][1]);
                current = pts[0];
                start = pts[0];
            } else if (cmd === 'L') {
                push(pts[0][0], pts[0][1]);
                current = pts[0];
            } else if (cmd === 'C') {
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps, s = 1 - t;
                    push(s * s * s * current[0] + 3 * s * s * t * pts[0][0] + 3 * s * t * t * pts[1][0] + t * t * t * pts[2][0],
                        s * s * s * current[1] + 3 * s * s * t * pts[0][1] + 3 * s * t * t * pts[1][1] + t * t * t * pts[2][1]);
                }
                current = pts[2];
            } else if (cmd === 'Q') {
                for (let i = 1; i <= steps; i++) {
                    const t = i / steps, s = 1 - t;
                    push(s * s * current[0] + 2 * s * t * pts[0][0] + t * t * pts[1][0], s * s * current[1] + 2 * s * t * pts[0][1] + t * t * pts[1][1]);
                }
                current = pts[1];
            } else if (cmd === 'Z') {
                sub.closed = true;
                current = start;
                const n = sub.pts.length;
                if (n >= 4 && Math.abs(sub.pts[n - 2] - sub.pts[0]) < 1e-9 && Math.abs(sub.pts[n - 1] - sub.pts[1]) < 1e-9) sub.pts.length = n - 2;
            }
        }
        return out;
    }

    // ---------- 编译（校验 + 压平，一次） ----------

    function compilePaint(fill, where) {
        if (fill === undefined || fill === null) return null;
        if (typeof fill === 'string') {
            const rgb = parseColor(fill);
            if (!rgb) throw new Error(`${where}：颜色不合规 ${fill}`);
            return { rgb };
        }
        if (typeof fill === 'object' && Array.isArray(fill.a) && Array.isArray(fill.b) && Array.isArray(fill.stops)) {
            if (![...fill.a, ...fill.b].every(isNum) || fill.a.length !== 2 || fill.b.length !== 2) throw new Error(`${where}：渐变端点不合规`);
            if (fill.stops.length < 2 || fill.stops.length > 8) throw new Error(`${where}：渐变色标数量必须在 2…8`);
            let previous = -Infinity;
            const stops = fill.stops.map(stop => {
                if (!Array.isArray(stop) || stop.length < 2) throw new Error(`${where}：色标写法不合规`);
                const [t, color, alpha = 1] = stop;
                const rgb = parseColor(color);
                if (!isNum(t) || t < 0 || t > 1 || t < previous || !rgb || !isNum(alpha) || alpha < 0 || alpha > 1) throw new Error(`${where}：色标不合规`);
                previous = t;
                return [t, rgb[0], rgb[1], rgb[2], alpha];
            });
            return { a: [fill.a[0], fill.a[1]], b: [fill.b[0], fill.b[1]], stops };
        }
        throw new Error(`${where}：fill 必须是颜色字符串或 { a, b, stops }`);
    }

    function compileFlap(spec, where) {
        if (spec === undefined || spec === null) return null;
        const pivot = spec.pivot;
        if (!Array.isArray(pivot) || pivot.length !== 2 || !pivot.every(isNum)) throw new Error(`${where}：pivot 不合规`);
        const out = {
            pivot: [pivot[0], pivot[1]],
            deg: finite(spec.deg, NaN), lag: finite(spec.lag, 0), phase: finite(spec.phase, 0), freq: finite(spec.freq, 1),
            squash: finite(spec.squash, 0), squashPhase: finite(spec.squashPhase, 0), reach: 1,
        };
        if (!isNum(out.deg) || Math.abs(out.deg) > 90) throw new Error(`${where}：转动幅度 deg 必须是 ±90 以内的有限数`);
        if (!(out.squash >= 0 && out.squash <= 0.6)) throw new Error(`${where}：squash 必须在 0…0.6`);
        if (!(out.lag >= 0 && out.lag <= 3)) throw new Error(`${where}：lag 必须在 0…3`);
        if (!(out.freq > 0 && out.freq <= 4)) throw new Error(`${where}：freq 必须在 0…4`);
        return out;
    }

    function mirrorFlap(flap) {
        return flap && { ...flap, pivot: [flap.pivot[0], -flap.pivot[1]], deg: -flap.deg };
    }

    /**
     * 展开一种动物的数据（校验 + 镜像展开，还没有压平）：返回的图层带 d（镜像的已经是镜像后的路径串）、part（镜像部件已登记在 parts 里）、
     * 已编译的 fill/stroke。桌面端的生成器（desktop-reminder/gen-marine.mjs）用它的结果生成 Swift 数据：Swift 只需要压平与求值，
     * 不必再实现一遍路径镜像与数据校验，两个平台吃的是同一份展开后的数据。
     */
    function expand(source) {
        if (!source || typeof source !== 'object') throw new Error('骨架数据不是对象');
        if (!VIEWS.includes(source.view)) throw new Error(`view 必须是 ${VIEWS.join('/')}`);
        if (![source.length, source.tail, source.snout].every(isNum) || !(source.snout - source.tail > 1)) throw new Error('length/tail/snout 不合规');
        const bendSource = source.bend || {};
        const amp = Array.isArray(bendSource.amp) ? bendSource.amp : [0, 0];
        if (amp.length !== 2 || !amp.every(isNum) || amp.some(v => v < 0 || v > MAX_BEND)) throw new Error(`bend.amp 必须是两个 0…${MAX_BEND} 的数`);
        const bend = { amp: [amp[0], amp[1]], pow: finite(bendSource.pow, 2), waves: finite(bendSource.waves, 1), turn: finite(bendSource.turn, 0) };
        if (!(bend.pow >= 0.5 && bend.pow <= 6) || !(bend.waves >= 0 && bend.waves <= 3) || !(bend.turn >= 0 && bend.turn <= MAX_BEND)) throw new Error('bend 的 pow/waves/turn 不合规');
        if (!Array.isArray(source.layers) || source.layers.length === 0 || source.layers.length > MAX_LAYERS) throw new Error(`layers 数量必须在 1…${MAX_LAYERS}`);

        const parts = {};
        for (const [name, spec] of Object.entries(source.parts || {})) parts[name] = compileFlap(spec, `parts.${name}`);

        const layers = [];
        const seen = new Set();
        for (const layer of source.layers) {
            const where = `layer ${layer && layer.id}`;
            if (!layer || typeof layer.id !== 'string' || !layer.id || seen.has(layer.id)) throw new Error(`${where}：id 缺失或重复`);
            seen.add(layer.id);
            const fill = compilePaint(layer.fill, `${where}.fill`);
            let stroke = null;
            if (layer.stroke) {
                const rgb = parseColor(layer.stroke.color);
                if (!rgb || !(isNum(layer.stroke.width) && layer.stroke.width > 0 && layer.stroke.width <= 8)) throw new Error(`${where}：stroke 不合规`);
                stroke = { rgb, width: layer.stroke.width, alpha: finite(layer.stroke.alpha, 1), cap: layer.stroke.cap === 'butt' ? 'butt' : 'round' };
                if (!(stroke.alpha >= 0 && stroke.alpha <= 1)) throw new Error(`${where}：stroke.alpha 必须在 0…1`);
            }
            if (!fill && !stroke) throw new Error(`${where}：既没有填充也没有描边`);
            const alpha = finite(layer.alpha, 1);
            if (!(alpha >= 0 && alpha <= 1)) throw new Error(`${where}：alpha 必须在 0…1`);
            const lod = finite(layer.lod, 0);
            if (!(lod === 0 || lod === 1 || lod === 2)) throw new Error(`${where}：lod 必须是 0/1/2`);
            const rule = layer.rule === 'evenodd' ? 'evenodd' : 'nonzero';
            if (layer.part !== undefined && !Object.prototype.hasOwnProperty.call(parts, layer.part)) throw new Error(`${where}：part ${layer.part} 没有登记`);
            const variants = [{ id: layer.id, d: layer.d, part: layer.part, mirrored: false }];
            if (layer.mirror) {
                const d = Shapes.mirrorPath(layer.d);
                if (!d) throw new Error(`${where}：路径不合规（镜像失败）`);
                let part = layer.part;
                if (part !== undefined) {
                    part = `${layer.part}~`;
                    if (!parts[part]) parts[part] = mirrorFlap(parts[layer.part]);
                }
                variants.push({ id: `${layer.id}~`, d, part, mirrored: true });
            }
            for (const variant of variants) {
                let paint = fill;
                if (fill && fill.a && variant.mirrored) paint = { a: [fill.a[0], -fill.a[1]], b: [fill.b[0], -fill.b[1]], stops: fill.stops };
                layers.push({ id: variant.id, where, d: variant.d, part: variant.part, fill: paint, stroke, alpha, rule, lod });
            }
        }
        return { view: source.view, length: source.length, tail: source.tail, snout: source.snout, bend, parts, layers };
    }

    /**
     * 编译一种动物的数据（展开 + 压平 + 作用半径）。数据错误抛出带位置的 Error（由测试与生成器报告）；运行时调用方可以 try/catch 当作“这种动物不可用”。
     * source：{ view, length, tail, snout, bend:{amp:[头, 尾], pow, waves, turn}, parts:{名: flap}, layers:[{ id, d, mirror?, part?, fill?, stroke?, alpha?, rule?, lod? }] }
     */
    function compile(source) {
        const expanded = expand(source);
        const layers = [];
        for (const layer of expanded.layers) {
            const polys = flatten(layer.d);
            if (!polys || polys.length === 0) throw new Error(`${layer.where}：路径不合规`);
            const count = polys.reduce((sum, p) => sum + p.pts.length / 2, 0);
            if (count > MAX_POINTS) throw new Error(`${layer.where}：压平后 ${count} 个点，超过上限 ${MAX_POINTS}`);
            for (const poly of polys) if (!poly.pts.every(isNum)) throw new Error(`${layer.where}：路径里有非有限数`);
            layers.push({ id: layer.id, polys, part: layer.part, fill: layer.fill, stroke: layer.stroke, alpha: layer.alpha, rule: layer.rule, lod: layer.lod });
        }
        const parts = expanded.parts;
        // 每个部件的作用半径：该部件所有顶点到 pivot 的最大距离，lag 按 r / reach 归一
        for (const [name, flap] of Object.entries(parts)) {
            if (!flap) continue;
            let reach = 0;
            for (const layer of layers) {
                if (layer.part !== name) continue;
                for (const poly of layer.polys) for (let i = 0; i < poly.pts.length; i += 2) reach = Math.max(reach, Math.hypot(poly.pts[i] - flap.pivot[0], poly.pts[i + 1] - flap.pivot[1]));
            }
            flap.reach = reach > 1e-9 ? reach : 1;
        }
        return { view: expanded.view, length: expanded.length, tail: expanded.tail, snout: expanded.snout, bend: expanded.bend, parts, layers };
    }

    // ---------- 变形 ----------

    /**
     * 脊柱在站位 x 处的解析量，写进 out：offset（横向位移）、slope（d offset / d x）、norm（1 / √(1 + slope²)）。
     * 弯曲后的点 = (x − y·slope·norm, offset + y·norm)：离脊柱 |y| 远的点沿脊柱法线走同样的距离。
     */
    function spineAt(rig, x, pose, out) {
        const span = rig.snout - rig.tail;
        const s = clamp((x - rig.tail) / span, 0, 1);
        const b = rig.bend;
        const inv = 1 - s;
        const env = b.amp[0] + (b.amp[1] - b.amp[0]) * Math.pow(inv, b.pow);
        const envSlope = -(b.amp[1] - b.amp[0]) * b.pow * Math.pow(inv, b.pow - 1);       // d env / d s
        const k = TWO_PI * b.waves;
        const theta = pose.phase - k * inv;
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        let offset = pose.amp * env * span * sinT;
        let slope = pose.amp * (envSlope * sinT + env * k * cosT);                          // d offset / d x
        if (pose.turn !== 0 && b.turn > 0) {
            offset += pose.turn * b.turn * span * inv * inv;
            slope += -2 * pose.turn * b.turn * inv;
        }
        out.offset = offset;
        out.slope = slope;
        out.norm = 1 / Math.sqrt(1 + slope * slope);
        return out;
    }

    const SCRATCH = { offset: 0, slope: 0, norm: 1 };

    /** 脊柱弯曲（精确公式，参考实现）：休止点 (x, y) → 弯曲后的点。pose 已规范化。evaluate 用站位表近似同一个公式，测试守住两者的差。 */
    function bendPoint(rig, x, y, pose) {
        spineAt(rig, x, pose, SCRATCH);
        return [x - y * SCRATCH.slope * SCRATCH.norm, SCRATCH.offset + y * SCRATCH.norm];
    }

    /**
     * 部件拍动：先绕 pivot 把 y 压扁（拍翼时翼面朝向镜头转动带来的透视收缩），再带相位滞后转动。
     * 滞后同时作用在压扁与转动上：离 pivot 越远（翼尖）相位越晚，整片翼面是一道由根向尖传播的行波。amp 是整体幅度。
     */
    function flapPoint(flap, x, y, pose) {
        const phase = flap.freq * pose.phase + flap.phase;
        const r = Math.hypot(x - flap.pivot[0], y - flap.pivot[1]);
        const lag = flap.lag * r / flap.reach;
        let px = x, py = y;
        if (flap.squash) py = flap.pivot[1] + (y - flap.pivot[1]) * (1 - pose.amp * flap.squash * Math.sin(phase + flap.squashPhase - lag));
        const angle = pose.amp * flap.deg * Math.PI / 180 * Math.sin(phase - lag);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const dx = px - flap.pivot[0], dy = py - flap.pivot[1];
        return [flap.pivot[0] + dx * cos - dy * sin, flap.pivot[1] + dx * sin + dy * cos];
    }

    /**
     * 姿态规范化。pull（可选，[x, y]，休止坐标单位、吻端朝 +x）是外力把尾部拉歪的位移：按 PULL_WEIGHT 叠到各点上，越靠尾越多、头几乎不动；
     * 水族馆的“拉鱼尾”互动用它，桌面端不传。非有限值整个丢弃，量级夹在 ±MAX_PULL。
     */
    function normalizePose(pose) {
        const p = pose || {};
        let pull = null;
        if (Array.isArray(p.pull) && p.pull.length === 2 && isNum(p.pull[0]) && isNum(p.pull[1]) && (p.pull[0] !== 0 || p.pull[1] !== 0)) {
            pull = [clamp(p.pull[0], -MAX_PULL, MAX_PULL), clamp(p.pull[1], -MAX_PULL, MAX_PULL)];
        }
        return { phase: finite(p.phase, 0), amp: clamp(finite(p.amp, 1), 0, 1), turn: clamp(finite(p.turn, 0), -1, 1), lod: clamp(Math.round(finite(p.lod, 2)), 0, 2), pull };
    }

    /** 拉尾权重：沿身体轴从头（0）到尾（1）的五个站位上线性插值。 */
    function pullWeight(rig, x) {
        const s = clamp((x - rig.tail) / (rig.snout - rig.tail), 0, 1);
        const t = (1 - s) * (PULL_WEIGHT.length - 1);
        const i = Math.min(PULL_WEIGHT.length - 2, Math.floor(t));
        return PULL_WEIGHT[i] + (PULL_WEIGHT[i + 1] - PULL_WEIGHT[i]) * (t - i);
    }

    function movePoint(rig, layerPart, x, y, pose) {
        let px = x, py = y;
        if (layerPart !== undefined) {
            const flap = rig.parts[layerPart];
            if (flap) { const moved = flapPoint(flap, px, py, pose); px = moved[0]; py = moved[1]; }
        }
        const bent = bendPoint(rig, px, py, pose);
        if (pose.pull) {
            const w = pullWeight(rig, x);
            bent[0] += pose.pull[0] * w;
            bent[1] += pose.pull[1] * w;
        }
        return bent;
    }

    /**
     * 输出坐标取整到 1e-4。按绝对值四舍五入再还原符号（“远离零的一侧进位”）：JS 的 Math.round 对负的恰好一半会向 +∞ 进位，
     * 镜像出来的左右两份就会差 1e-4；Swift 的 .rounded() 默认也是远离零，这样两个平台一致。-0 归一为 0。
     */
    function roundOps(value) {
        const m = Math.round(Math.abs(value) * 10000) / 10000;
        return value < 0 && m !== 0 ? -m : m;
    }

    function transformPaint(rig, layer, pose) {
        if (!layer.fill) return null;
        if (!layer.fill.a) return { rgba: [layer.fill.rgb[0], layer.fill.rgb[1], layer.fill.rgb[2], layer.alpha] };
        const a = movePoint(rig, layer.part, layer.fill.a[0], layer.fill.a[1], pose);
        const b = movePoint(rig, layer.part, layer.fill.b[0], layer.fill.b[1], pose);
        return { grad: { a: [roundOps(a[0]), roundOps(a[1])], b: [roundOps(b[0]), roundOps(b[1])], stops: layer.fill.stops.map(s => [s[0], s[1], s[2], s[3], s[4] * layer.alpha]) } };
    }

    // ---------- 每帧站位表（evaluate 的快路径） ----------
    // 精确公式（bendPoint / flapPoint）每个点要算 pow、sin、cos、sqrt；一只鲸鲨一帧有近 4000 个点，四只动物每帧就是 1 毫秒以上。
    // 但弯曲只依赖 x（脊柱位移、斜率与法线系数）、拍动只依赖到 pivot 的距离（转角与压扁），所以每帧把它们各算一张小表，
    // 逐点只做查表和线性插值。表的段数固定（SPINE_STEPS / FLAP_STEPS），桌面端用同一套，两个平台的求值逐点一致；
    // 与精确公式的差在 test/marine-rig.test.js 里守住（所有动物、随机姿态下 ≤ 2e-3 个单位）。

    function buildSpine(rig, pose) {
        const n = SPINE_STEPS;
        const off = new Float64Array(n + 1), sn = new Float64Array(n + 1), nm = new Float64Array(n + 1);
        const span = rig.snout - rig.tail;
        for (let i = 0; i <= n; i++) {
            spineAt(rig, rig.tail + span * i / n, pose, SCRATCH);
            off[i] = SCRATCH.offset;
            sn[i] = SCRATCH.slope * SCRATCH.norm;
            nm[i] = SCRATCH.norm;
        }
        return { n, tail: rig.tail, scale: n / span, off, sn, nm };
    }

    function buildFlap(flap, pose) {
        const n = FLAP_STEPS;
        const cosA = new Float64Array(n + 1), sinA = new Float64Array(n + 1), sq = new Float64Array(n + 1);
        const phase = flap.freq * pose.phase + flap.phase;
        for (let i = 0; i <= n; i++) {
            const lag = flap.lag * i / n;
            sq[i] = flap.squash ? 1 - pose.amp * flap.squash * Math.sin(phase + flap.squashPhase - lag) : 1;
            const angle = pose.amp * flap.deg * Math.PI / 180 * Math.sin(phase - lag);
            cosA[i] = Math.cos(angle);
            sinA[i] = Math.sin(angle);
        }
        return { n, px: flap.pivot[0], py: flap.pivot[1], scale: n / flap.reach, cosA, sinA, sq };
    }

    /**
     * 在某个姿态求值：返回 { ops, bounds }。ops 按绘制顺序，坐标是休止坐标系里变形后的点（宿主再缩放/旋转/平移/翻转）。
     * 一个图层一个 op（图层里所有子路径合成一条路径，一次填充/描边——鲸鲨的 60 个斑点只是一次填充）：
     *   { k:'fill', id, polys:[{ pts:[x,y,…], closed:true }], rule, paint } | { k:'stroke', id, polys:[{ pts, closed }], width, rgba, cap }；
     * paint：{ rgba:[r,g,b,a] } 或 { grad:{ a:[x,y], b:[x,y], stops:[[t,r,g,b,a],…] } }（端点随同一变形移动，只有两个点，用精确公式）。
     * 填充只用闭合子路径；描边按子路径各自的闭合状态描（鳃裂、嘴线、鳍条是开放线）。
     * lod：宿主很小时跳过细节图层（图层的 lod 大于 pose.lod 的不画）。
     */
    function evaluate(rig, poseInput) {
        const pose = normalizePose(poseInput);
        const ops = [];
        const spine = buildSpine(rig, pose);
        const { n: sn_, tail, scale: spineScale, off, sn, nm } = spine;
        const flaps = {};
        const pull = pose.pull;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const layer of rig.layers) {
            if (layer.lod > pose.lod) continue;
            const paint = transformPaint(rig, layer, pose);
            let flap = null;
            if (layer.part !== undefined && rig.parts[layer.part]) flap = flaps[layer.part] || (flaps[layer.part] = buildFlap(rig.parts[layer.part], pose));
            const polys = [];
            for (const poly of layer.polys) {
                const src = poly.pts;
                const count = src.length / 2;
                const pts = new Array(count * 2);
                for (let i = 0; i < count; i++) {
                    const x0 = src[i * 2], y0 = src[i * 2 + 1];
                    let px = x0, py = y0;
                    if (flap) {
                        const dx = x0 - flap.px, dy0 = y0 - flap.py;
                        let q = Math.sqrt(dx * dx + dy0 * dy0) * flap.scale;
                        if (q > flap.n) q = flap.n;
                        let j = q | 0;
                        if (j >= flap.n) j = flap.n - 1;
                        const f = q - j;
                        const dy = dy0 * (flap.sq[j] + (flap.sq[j + 1] - flap.sq[j]) * f);
                        const c = flap.cosA[j] + (flap.cosA[j + 1] - flap.cosA[j]) * f;
                        const s = flap.sinA[j] + (flap.sinA[j + 1] - flap.sinA[j]) * f;
                        px = flap.px + dx * c - dy * s;
                        py = flap.py + dx * s + dy * c;
                    }
                    let u = (px - tail) * spineScale;
                    if (u < 0) u = 0; else if (u > sn_) u = sn_;
                    let k = u | 0;
                    if (k >= sn_) k = sn_ - 1;
                    const t = u - k;
                    let x = px - py * (sn[k] + (sn[k + 1] - sn[k]) * t);
                    let y = off[k] + (off[k + 1] - off[k]) * t + py * (nm[k] + (nm[k + 1] - nm[k]) * t);
                    if (pull) {
                        const w = pullWeight(rig, x0);
                        x += pull[0] * w;
                        y += pull[1] * w;
                    }
                    x = roundOps(x);
                    y = roundOps(y);
                    pts[i * 2] = x; pts[i * 2 + 1] = y;
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                }
                polys.push({ pts, closed: poly.closed });
            }
            const closed = polys.filter(poly => poly.closed);
            if (paint && closed.length) ops.push({ k: 'fill', id: layer.id, polys: closed, rule: layer.rule, paint });
            if (layer.stroke) ops.push({ k: 'stroke', id: layer.id, polys, width: layer.stroke.width, rgba: [layer.stroke.rgb[0], layer.stroke.rgb[1], layer.stroke.rgb[2], layer.stroke.alpha * layer.alpha], cap: layer.stroke.cap });
        }
        const bounds = Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
        return { ops, bounds };
    }

    /** 参考实现：逐点用精确公式（movePoint）求值，结构与 evaluate 完全相同。只给测试用，用来量化站位表近似的误差。 */
    function evaluateExact(rig, poseInput) {
        const pose = normalizePose(poseInput);
        const ops = [];
        for (const layer of rig.layers) {
            if (layer.lod > pose.lod) continue;
            const paint = transformPaint(rig, layer, pose);
            const polys = layer.polys.map(poly => {
                const pts = new Array(poly.pts.length);
                for (let i = 0; i < poly.pts.length; i += 2) {
                    const moved = movePoint(rig, layer.part, poly.pts[i], poly.pts[i + 1], pose);
                    pts[i] = roundOps(moved[0]); pts[i + 1] = roundOps(moved[1]);
                }
                return { pts, closed: poly.closed };
            });
            const closed = polys.filter(poly => poly.closed);
            if (paint && closed.length) ops.push({ k: 'fill', id: layer.id, polys: closed, rule: layer.rule, paint });
            if (layer.stroke) ops.push({ k: 'stroke', id: layer.id, polys, width: layer.stroke.width, rgba: [layer.stroke.rgb[0], layer.stroke.rgb[1], layer.stroke.rgb[2], layer.stroke.alpha * layer.alpha], cap: layer.stroke.cap });
        }
        return { ops };
    }

    /** 各相位下包围盒的并集（放置用）：动起来任何一帧都不会越出。 */
    function unionBounds(rig, samples = 12) {
        let out = null;
        for (let i = 0; i < samples; i++) {
            for (const turn of [-1, 0, 1]) {
                const { bounds } = evaluate(rig, { phase: TWO_PI * i / samples, amp: 1, turn, lod: 0 });
                if (!bounds) continue;
                out = out ? { minX: Math.min(out.minX, bounds.minX), minY: Math.min(out.minY, bounds.minY), maxX: Math.max(out.maxX, bounds.maxX), maxY: Math.max(out.maxY, bounds.maxY) } : bounds;
            }
        }
        return out;
    }

    return Object.freeze({ CURVE_STEPS, SPINE_STEPS, FLAP_STEPS, MAX_POINTS, MAX_LAYERS, MAX_BEND, MAX_PULL, PULL_WEIGHT, VIEWS, parseColor, flatten, expand, compile, bendPoint, flapPoint, movePoint, pullWeight, normalizePose, evaluate, evaluateExact, unionBounds, roundOps });
});
