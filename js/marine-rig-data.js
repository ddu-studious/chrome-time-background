(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const Rig = cjs ? require('./marine-rig.js') : root && root.MarineRig;
    const api = factory(Rig);
    if (cjs) module.exports = api;
    if (root) root.MarineRigData = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function (Rig) {
    'use strict';

    // 写实风格的动物数据（海洋动物骨架 MarineRig 的输入）。每种动物是：轮廓与细节（SVG 子集路径串，由本文件里的小工具按“站位”生成）
    // + 自然配色（背深腹浅的逆荫蔽、花纹、鳍条、眼睛、鳃裂）+ 脊柱行波与鳍拍动参数。
    // 路径只用 M/L/C/Q/Z 绝对命令，所以与桌面端共用 js/jelly-species-shapes.js 的严格解析器；桌面端的数据由 desktop-reminder/gen-marine.mjs 从本文件生成。
    // 形状与比例来自对公开参考照片/科学插图的测量与目测（只借比例与解剖结构，没有描摹、复制任何受版权保护的图形），
    // 见 docs/research/research-marine-realism-20261019.md；设计与验证见 docs/technical/marine-realism-20261019.md。
    // 单位：体长 100（身体轴沿 x，吻端 +x）；y 向下：侧视动物 y 负为背、正为腹；俯视动物 y 是左右。

    const r2 = value => Math.round(value * 100) / 100;
    const pair = (x, y) => `${r2(x)} ${r2(y)}`;

    // ---------- 种子随机（斑点、鳞甲的位置是数据，必须每次加载都一样） ----------
    function mulberry32(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // ---------- 路径工具 ----------

    /** 折线 → 路径串。 */
    function polyline(points, closed = true) {
        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${pair(p[0], p[1])}`).join(' ') + (closed ? ' Z' : '');
    }

    /**
     * 平滑曲线：经过所有点的三次贝塞尔，每个点的切线方向取前后点连线方向、手柄长度取各自一段弦长的 1/3（站位疏密不均也不会鼓包）。
     * 点写 [x, y] 是光滑点，[x, y, 'c'] 是尖角点（切线为零，曲线在这里拐弯）。closed 为 true 时首尾相连。
     */
    function smooth(points, closed = true) {
        const n = points.length;
        const at = i => (closed ? points[((i % n) + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
        const unit = (i) => {
            const p = at(i);
            if (p[2] === 'c') return null;
            if (!closed && (i === 0 || i === n - 1)) {
                const q = i === 0 ? at(1) : at(n - 2);
                const dx = i === 0 ? q[0] - p[0] : p[0] - q[0], dy = i === 0 ? q[1] - p[1] : p[1] - q[1];
                const d = Math.hypot(dx, dy) || 1;
                return [dx / d, dy / d];
            }
            const a = at(i - 1), b = at(i + 1);
            const dx = b[0] - a[0], dy = b[1] - a[1];
            const d = Math.hypot(dx, dy) || 1;
            return [dx / d, dy / d];
        };
        const segs = closed ? n : n - 1;
        let out = `M ${pair(points[0][0], points[0][1])}`;
        for (let i = 0; i < segs; i++) {
            const p = at(i), q = at(i + 1);
            const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
            const t0 = unit(i), t1 = unit(i + 1);
            const c1 = t0 ? [p[0] + t0[0] * d / 3, p[1] + t0[1] * d / 3] : [p[0], p[1]];
            const c2 = t1 ? [q[0] - t1[0] * d / 3, q[1] - t1[1] * d / 3] : [q[0], q[1]];
            out += ` C ${pair(c1[0], c1[1])} ${pair(c2[0], c2[1])} ${pair(q[0], q[1])}`;
        }
        return out + (closed ? ' Z' : '');
    }

    /** 小斑点：n 边形（n ≥ 5），带旋转；比椭圆省命令数，在不足 2 像素的尺寸上与圆无法区分。 */
    function disc(cx, cy, r, rot = 0, n = 6) {
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = rot + (i / n) * Math.PI * 2;
            pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        return polyline(pts, true);
    }

    /**
     * 叶片（鳍、桨足、翼）：从根 R 到尖 T，沿轴向 t∈[0,1] 取一串 [t, 左宽, 右宽]（轴的左手边是 +n，n = (−uy, ux)），再加弯度 bow（体长的比例，t(1−t) 抛物线）。
     * 返回平滑闭合路径串；叶尖是圆的（宽度收到很小的值，不是尖角）。
     */
    function blade(R, T, profile, bow = 0) {
        const dx = T[0] - R[0], dy = T[1] - R[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const at = (t, off) => {
            const shift = bow * len * 4 * t * (1 - t);
            return [R[0] + ux * len * t + nx * (off + shift), R[1] + uy * len * t + ny * (off + shift)];
        };
        const left = profile.map(([t, a]) => at(t, a));
        const right = profile.map(([t, , b]) => at(t, -b)).reverse();
        return smooth([...left, ...right], true);
    }

    /** 叶片某一侧的边线（开放平滑曲线）：与 blade 同一套参数，用来描前缘的浅色条、鳍条。side=+1 取左宽，−1 取右宽。 */
    function bladeEdge(R, T, profile, bow = 0, side = 1, t0 = 0, t1 = 1) {
        const dx = T[0] - R[0], dy = T[1] - R[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const pts = profile.filter(([t]) => t >= t0 && t <= t1).map(([t, a, b]) => {
            const shift = bow * len * 4 * t * (1 - t);
            const off = side > 0 ? a : -b;
            return [R[0] + ux * len * t + nx * (off + shift), R[1] + uy * len * t + ny * (off + shift)];
        });
        return smooth(pts, false);
    }

    /** 左右对称的轮廓：half 是右半边（y>0）从某一端到另一端的 [x, w, 'c'?]，左半边自动镜像成回来的路径；两端的点是 y=0 的尖点/圆点。 */
    function symOutline(half) {
        const right = half.map(p => (p.length > 2 ? [p[0], p[1], p[2]] : [p[0], p[1]]));
        const left = half.slice(1, -1).map(p => [p[0], -p[1]]).reverse();
        return smooth([...right, ...left], true);
    }

    // ---------- 站位（侧视：[x, 背(负), 腹(正)]，从尾到吻） ----------

    /** 在站位 st 上取 x 处的 y(k)：k=−1 背缘、0 中线、+1 腹缘。 */
    function yAt(st, x, k) {
        let lo = st[0], hi = st[st.length - 1];
        if (x <= lo[0]) return edgeOf(lo, k);
        if (x >= hi[0]) return edgeOf(hi, k);
        for (let i = 0; i < st.length - 1; i++) {
            if (x >= st[i][0] && x <= st[i + 1][0]) {
                const t = (x - st[i][0]) / (st[i + 1][0] - st[i][0]);
                // 站位之间用余弦缓动，保证斑点/脊线落在平滑过渡的轮廓里（线性插值会在站位处出折）
                const e = (1 - Math.cos(Math.PI * t)) / 2;
                return edgeOf(st[i], k) * (1 - e) + edgeOf(st[i + 1], k) * e;
            }
        }
        return 0;
    }
    function edgeOf(station, k) { return k >= 0 ? k * station[2] : -k * station[1]; }

    /** 沿站位的“等 k 线”：x 范围内每个站位一个点（含两端），开放平滑曲线。 */
    function kLine(st, k, x0, x1) {
        const xs = st.map(s => s[0]).filter(x => x > x0 && x < x1);
        const all = [x0, ...xs, x1];
        return smooth(all.map(x => [x, yAt(st, x, k)]), false);
    }

    /** 整只身体的闭合轮廓（背缘从尾到吻、腹缘从吻回尾）；kTop/kBot 缩放可得到嵌套的明暗带。 */
    function outline(st, kTop = -1, kBot = 1, ends = true) {
        const top = st.map(s => [s[0], edgeOf(s, kTop)]);
        const bot = st.map(s => [s[0], edgeOf(s, kBot)]).reverse();
        if (ends) { top[0] = [top[0][0], top[0][1], 'c']; top[top.length - 1] = [top[top.length - 1][0], top[top.length - 1][1], 'c']; }
        return smooth([...top, ...bot], true);
    }

    /** 背缘与腹缘之间 k0…k1 的带（k0 < k1）：用于背深腹浅的逆荫蔽。 */
    function band(st, k0, k1) {
        const top = st.map(s => [s[0], edgeOf(s, k0)]);
        const bot = st.map(s => [s[0], edgeOf(s, k1)]).reverse();
        return smooth([...top, ...bot], true);
    }

    // ---------- 鲸鲨（侧视） ----------

    function whaleShark() {
        const st = [
            [-37, -2.4, 2.6], [-32, -3.6, 4.0], [-26, -5.2, 5.6], [-18, -7.2, 7.6], [-9, -8.6, 8.8], [0, -9.2, 9.2], [10, -9.4, 9.2], [20, -9.2, 8.8],
            [29, -8.5, 8.0], [36, -7.4, 6.8], [41.5, -6.2, 5.6], [45, -5.2, 4.6], [47.6, -4.2, 3.6], [49.2, -3.0, 2.4], [50, -1.7, 1.2], [50.4, -0.4, 0.3],
        ];
        const rand = mulberry32(20261019);
        // 斑点：每行沿 x 排开，带抖动；行 k 是在身高上的位置
        function spotRow(k, x0, x1, step, r0, r1, jitter = 0.9) {
            let out = '';
            for (let x = x0; x > x1; x -= step) {
                const px = x + (rand() - 0.5) * 2 * jitter;
                const py = yAt(st, px, k) + (rand() - 0.5) * 0.8;
                const r = r0 + rand() * (r1 - r0);
                out += (out ? ' ' : '') + disc(px, py, r, rand() * 6.28, r > 0.62 ? 6 : 5);
            }
            return out;
        }
        const spotsBack = [spotRow(-0.82, 38, -31, 3.4, 0.38, 0.6), spotRow(-0.52, 37, -30, 3.1, 0.46, 0.78), spotRow(-0.2, 36, -29, 3.0, 0.5, 0.82)].join(' ');
        const spotsFlank = [spotRow(0.12, 35, -28, 3.0, 0.46, 0.74), spotRow(0.42, 33, -24, 3.4, 0.36, 0.58)].join(' ');
        const spotsHead = [spotRow(-0.72, 49, 36, 2.0, 0.28, 0.46, 0.5), spotRow(-0.32, 48.5, 35, 1.9, 0.28, 0.48, 0.5), spotRow(0.08, 48, 35, 2.0, 0.28, 0.46, 0.5), spotRow(0.46, 46, 36, 2.2, 0.26, 0.4, 0.5)].join(' ');
        // 浅色细线：中身“棋盘”的竖线，细、淡、略弯，不是尺子
        const stripes = [22, 17.4, 12.8, 8.2, 3.6, -1.0, -5.6, -10.2].map((x, i) => {
            const lean = 0.9 + (i % 3) * 0.35;
            const y0 = yAt(st, x, -0.9), y1 = yAt(st, x, 0.16 + (i % 2) * 0.06);
            return `M ${pair(x + lean, y0)} Q ${pair(x + lean * 0.2 - 0.5, (y0 + y1) / 2)} ${pair(x, y1)}`;
        }).join(' ');
        const gills = [32.6, 31.0, 29.4, 27.8, 26.2].map(x => `M ${pair(x + 0.7, yAt(st, x, -0.62))} Q ${pair(x - 0.7, 0.4)} ${pair(x + 0.2, yAt(st, x, 0.7))}`).join(' ');

        return {
            view: 'side', length: 100, tail: -50, snout: 50,
            bend: { amp: [0.006, 0.07], pow: 2.4, waves: 0.7, turn: 0.07 },
            parts: {
                pecFar: { pivot: [24, 5], deg: 6, lag: 0.45, phase: 0.5 },
                pec: { pivot: [24, 5.2], deg: 7, lag: 0.45, phase: 0.2 },
                pelvic: { pivot: [-6, 7.4], deg: 5, lag: 0.3, phase: 1.1 },
                dorsal: { pivot: [0, -7.5], deg: 2.2, lag: 0.5, phase: -0.6 },
            },
            layers: [
                { id: 'pecFar', part: 'pecFar', d: 'M 25 4 C 23.5 8.5, 20 12, 14.5 15.2 C 15.5 12.4, 16.6 9.6, 17.6 6.4 C 20.4 6, 22.8 5, 25 4 Z', fill: '#25394a' },
                { id: 'dorsal2', d: 'M -15 -5.4 C -17 -8.2, -19.6 -10.4, -22.6 -11.4 C -22.9 -9.8, -23.6 -7.6, -25.2 -4.6 Z', fill: '#2c4558' },
                { id: 'dorsal1', part: 'dorsal', d: 'M 6 -7.4 C 4 -12.2, 1 -16.8, -3.4 -19.4 C -5.8 -18.6, -7.4 -14.6, -9.6 -9 L -11 -7.6 C -6.6 -6.8, 0 -6.8, 6 -7.4 Z', fill: '#2a4356' },
                { id: 'anal', d: 'M -23.6 4.6 C -25.6 7.2, -28.2 9.2, -31.2 10 C -30.6 8.2, -30.3 6.4, -30 4.2 Z', fill: '#344f63' },
                { id: 'caudal', d: 'M -35 -2.8 C -39.4 -5.6, -44.4 -10.6, -50.4 -16.6 C -48.4 -11.8, -45.6 -7.2, -44 -2 C -44.8 1.2, -46.4 5.8, -47.6 9.6 C -44 7.6, -39.6 5, -35 3 Z', fill: '#2a4356' },
                { id: 'pelvic', part: 'pelvic', d: 'M -5 7.3 C -7.6 9.8, -10.8 12.4, -14.8 13.6 C -14.4 11.4, -13.8 9.4, -12.8 7 Z', fill: '#3a566a' },
                { id: 'body', d: outline(st), fill: '#4d6a80' },
                { id: 'backDark', d: band(st, -1, 0.14), fill: '#22384a', alpha: 0.5 },
                { id: 'backDark1', d: band(st, -1, 0.0), fill: '#1f3446', alpha: 0.55 },
                { id: 'backDark2', d: band(st, -1, -0.3), fill: '#18293a', alpha: 0.5 },
                { id: 'backDark3', d: band(st, -1, -0.58), fill: '#13222f', alpha: 0.4 },
                { id: 'belly0', d: band(st, 0.04, 1), fill: '#d2dadd', alpha: 0.18 },
                { id: 'belly1', d: band(st, 0.16, 1), fill: '#d2dadd', alpha: 0.25 },
                { id: 'belly2', d: band(st, 0.3, 1), fill: '#d6dee0', alpha: 0.35 },
                { id: 'belly3', d: band(st, 0.44, 1), fill: '#dde4e5', alpha: 0.55 },
                { id: 'belly4', d: band(st, 0.58, 1), fill: '#e4eaeb', alpha: 0.7 },
                { id: 'rim', d: band(st, -1, -0.84), fill: '#a8c2d4', alpha: 0.22, lod: 1 },
                { id: 'ridges', d: [kLine(st, -0.62, 31, -33), kLine(st, 0.02, 31, -34), kLine(st, 0.55, 28, -33)].join(' '), stroke: { color: '#b9cddb', width: 0.45, alpha: 0.2 }, lod: 1 },
                { id: 'stripes', d: stripes, stroke: { color: '#dfe9e6', width: 0.32, alpha: 0.26 }, lod: 1 },
                { id: 'spotsBack', d: spotsBack, fill: '#ecf0dc', alpha: 0.9 },
                { id: 'spotsFlank', d: spotsFlank, fill: '#ecf0dc', alpha: 0.8 },
                { id: 'spotsHead', d: spotsHead, fill: '#ecf0dc', alpha: 0.85, lod: 1 },
                { id: 'gills', d: gills, stroke: { color: '#142330', width: 0.55, alpha: 0.65 }, lod: 1 },
                { id: 'mouth', d: 'M 49.9 0.6 C 48.6 1.9, 46.6 2.4, 43.4 2.3', stroke: { color: '#121d27', width: 0.6, alpha: 0.6 } },
                { id: 'eyeRing', d: disc(44.2, 0.2, 1.05, 0, 8), fill: '#cfdde6', alpha: 0.28, lod: 1 },
                { id: 'eye', d: disc(44.2, 0.2, 0.56, 0, 8), fill: '#0b1218' },
                {
                    id: 'pec', part: 'pec',
                    d: 'M 26 4 C 24.4 9, 19.8 13.6, 13.4 17.4 C 14.2 13.8, 15.6 10.4, 16.6 6.8 C 20.2 6.4, 23.6 5.2, 26 4 Z',
                    fill: { a: [25, 5], b: [14, 16], stops: [[0, '#3f5d73', 0.0], [0.28, '#37546a', 0.95], [1, '#2a4356', 1]] },
                },
            ],
        };
    }

    // ---------- 海龟（俯视，绿海龟：背甲盾片、四只桨足、头上的鳞片镶嵌） ----------

    /** 沿折线 pts（[x, y] 序列）按弧长取 n 个等距点（不含两端）。 */
    function alongPolyline(pts, n) {
        const seg = [];
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); total += d; }
        const out = [];
        for (let k = 1; k <= n; k++) {
            let target = total * k / (n + 1);
            let i = 0;
            while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
            const t = seg[i] > 0 ? target / seg[i] : 0;
            out.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]);
        }
        return out;
    }

    function turtle() {
        const rand = mulberry32(20261020);
        // 背甲右半边（前 → 后）：前缘近乎平直微凹，最宽在前 40% 处，向后收成一个钝尖
        const shellHalf = [[29.2, 0, 'c'], [30.8, 5.2], [30.2, 10], [27.4, 14.4], [22.4, 18.4], [14.4, 21.8], [4, 22.6], [-6, 20.8], [-14, 16.8], [-20, 11.2], [-24, 5.6], [-26.8, 0.8], [-27.6, 0, 'c']];
        const shellPts = shellHalf.map(p => [p[0], p[1]]);
        const scaled = k => symOutline(shellHalf.map(p => (p.length > 2 ? [p[0] * k, p[1] * k, p[2]] : [p[0] * k, p[1] * k])));
        // 头：颈 → 眼 → 喙（右半边，后 → 前）
        const headHalf = [[25, 4.0, 'c'], [30, 4.4], [34.4, 4.6], [38.4, 5.2], [41.6, 5.6], [44.6, 5.0], [47.4, 3.8], [49.8, 2.4], [51.2, 1.0], [51.6, 0, 'c']];

        // 椎盾 5 片（六边形，宽大于长）：中心 x、半宽、前缘半宽、后缘半宽
        const vert = [[24.4, 5.4, 4.6, 6.0], [15.6, 7.6, 5.6, 7.2], [6.4, 8.2, 7.2, 7.2], [-2.8, 7.4, 7.2, 5.6], [-11.2, 5.6, 5.6, 1.2]];
        const hexes = vert.map(([cx, w, f, b]) => polyline([[cx + 4.4, -f], [cx + 4.4, f], [cx, w], [cx - 4.4, b], [cx - 4.4, -b], [cx, -w]]));
        // 肋盾之间的缝：从椎盾的交角向外向后到缘盾内缘
        const costal = [[[20, 6.4], [14.6, 17.4]], [[11, 7.6], [5.6, 19.2]], [[1.6, 7.8], [-4.4, 17.4]], [[-7.4, 6.2], [-12.8, 12.6]]].map(([a, b]) => `M ${pair(a[0], a[1])} Q ${pair((a[0] + b[0]) / 2 + 1.6, (a[1] + b[1]) / 2 + 0.2)} ${pair(b[0], b[1])}`).join(' ');
        // 缘盾：内缘线 + 沿壳缘的 11 道放射刻痕
        const inner = symOutline(shellHalf.map(p => (p.length > 2 ? [p[0] * 0.82, p[1] * 0.82, p[2]] : [p[0] * 0.82, p[1] * 0.82])));
        const ticks = alongPolyline(shellPts, 11).map(p => `M ${pair(p[0], p[1])} L ${pair(p[0] * 0.82, p[1] * 0.82)}`).join(' ');
        // 放射状深色条纹（绿海龟盾片上的生长纹），固定在数据里
        let rays = '';
        for (let i = 0; i < 9; i++) {
            const x0 = 17 - i * 4.8 + (rand() - 0.5);
            const y0 = 9.6 + rand() * 1.2;
            const k = 1.5 + rand() * 0.5;
            const x1 = x0 - 3.2 - rand() * 2, y1 = y0 + 5 + rand() * 1.6;
            const w = 0.8 + rand() * 0.7;
            rays += (rays ? ' ' : '') + polyline([[x0, y0], [x0 + w, y0 + 0.4], [x1 + w * 0.2, y1 * k > 19 ? 19 : y1 * k], [x1, y1]]);
        }

        const frontProf = [[0, 5, 8], [0.15, 6.2, 8.2], [0.4, 5.6, 7], [0.65, 4.2, 4.8], [0.88, 2.4, 2.6], [1, 0.6, 0.6]];
        const rearProf = [[0, 3.4, 5.6], [0.3, 5.2, 6.4], [0.6, 5.4, 5.6], [0.85, 3, 3], [1, 0.7, 0.7]];
        const FR = [18, 20], FT = [3, 56], RR = [-15.5, 11], RT = [-40, 29];
        const frontFlip = blade(FR, FT, frontProf, 0.04);
        const rearFlip = blade(RR, RT, rearProf, 0.02);
        const frontLead = bladeEdge(FR, FT, frontProf, 0.04, -1, 0.1, 1);
        const rearLead = bladeEdge(RR, RT, rearProf, 0.02, -1, 0.1, 1);

        return {
            view: 'top', length: 100, tail: -50, snout: 50,
            bend: { amp: [0.002, 0.012], pow: 2, waves: 0.5, turn: 0.05 },
            parts: {
                front: { pivot: [18, 21], deg: 24, lag: 0.55, phase: 0, squash: 0.2, squashPhase: 1.5 },
                rear: { pivot: [-15.5, 12], deg: 14, lag: 0.4, phase: 1.3, squash: 0.1, squashPhase: 1.2 },
                head: { pivot: [28, 0], deg: 3, lag: 0.2, phase: -0.8 },
            },
            layers: [
                { id: 'rearFlip', part: 'rear', mirror: true, d: rearFlip, fill: '#4f4c30' },
                { id: 'rearScales', part: 'rear', mirror: true, d: 'M -20 12.6 Q -28 17.4 -35 24.2 M -23 14.6 L -26 12 M -27 18.2 L -31 16.2 M -31 21.8 L -35 20.6', stroke: { color: '#cfc79a', width: 0.4, alpha: 0.4 }, lod: 1 },
                { id: 'tail', d: 'M -26 -1.6 L -33 0 L -26 1.6 Z', fill: '#4f4c30' },
                { id: 'frontFlip', part: 'front', mirror: true, d: frontFlip, fill: '#58553a' },
                { id: 'frontLead', part: 'front', mirror: true, d: frontLead, stroke: { color: '#d4cc9e', width: 0.7, alpha: 0.55 } },
                { id: 'rearLead', part: 'rear', mirror: true, d: rearLead, stroke: { color: '#d4cc9e', width: 0.6, alpha: 0.45 }, lod: 1 },
                { id: 'frontScales', part: 'front', mirror: true, d: 'M 17 28 Q 10 32 6 38 M 16 33 Q 11 37 7 43 M 14 38 Q 10 41 8 46 M 13.4 25 L 9 24.4 M 12 30 L 7.6 29.6 M 10.6 35.4 L 6.4 35.2', stroke: { color: '#cfc79a', width: 0.4, alpha: 0.38 }, lod: 1 },
                { id: 'head', part: 'head', d: symOutline(headHalf), fill: '#5d5a3c' },
                { id: 'headShade', part: 'head', d: symOutline(headHalf.map(p => [p[0] - (p[0] - 40) * 0.2, p[1] * 0.7].concat(p.length > 2 ? [p[2]] : []))), fill: '#7a7648', alpha: 0.35, lod: 1 },
                { id: 'headSeams', part: 'head', d: 'M 38.6 -4.8 Q 40.4 0 38.6 4.8 M 43.8 -4.4 Q 45.4 0 43.8 4.4 M 47.8 -2.4 Q 48.8 0 47.8 2.4 M 41.6 -5 L 44.8 -1.2 M 41.6 5 L 44.8 1.2 M 50.4 0 L 45.6 0', stroke: { color: '#d4cc9e', width: 0.4, alpha: 0.5 }, lod: 1 },
                { id: 'eyes', part: 'head', mirror: true, d: disc(42.4, 5.2, 0.85, 0, 9), fill: '#0f120b' },
                { id: 'eyeGlint', part: 'head', mirror: true, d: disc(42.6, 4.9, 0.28, 0, 6), fill: '#f2efdc', alpha: 0.85, lod: 1 },
                { id: 'nostrils', part: 'head', mirror: true, d: disc(49.9, 0.9, 0.26, 0, 6), fill: '#1a1d12', alpha: 0.65, lod: 1 },
                { id: 'shell', d: symOutline(shellHalf), fill: '#5d4f2a' },
                { id: 'shellMid', d: scaled(0.8), fill: '#7d6a3a', alpha: 0.55 },
                { id: 'shellTop', d: scaled(0.56), fill: '#9c8748', alpha: 0.4 },
                { id: 'margin', d: inner, stroke: { color: '#2a2210', width: 0.5, alpha: 0.5 }, lod: 1 },
                { id: 'ticks', d: ticks, stroke: { color: '#2a2210', width: 0.45, alpha: 0.42 }, mirror: true, lod: 1 },
                { id: 'rays', d: rays, fill: '#2b2210', alpha: 0.3, mirror: true, lod: 1 },
                { id: 'costal', d: costal, stroke: { color: '#271f0e', width: 0.5, alpha: 0.5 }, mirror: true, lod: 1 },
                { id: 'hexes', d: hexes.join(' '), stroke: { color: '#271f0e', width: 0.5, alpha: 0.55 }, lod: 1 },
                { id: 'rim', d: symOutline(shellHalf), stroke: { color: '#2a2210', width: 0.7, alpha: 0.6 } },
            ],
        };
    }

    // ---------- 蝠鲼（俯视，从下往上看：白色腹面、鳃裂、黑斑、头鳍与口） ----------

    function manta() {
        const rand = mulberry32(20261021);
        // 中央身体盘（对称）：前（口）→ 后（尾根）
        const bodyHalf = [[35.6, 0, 'c'], [35.2, 5], [33.6, 10.4], [31.5, 13.6], [24, 14.6], [14, 15], [4, 14.4], [-6, 12.6], [-12, 8.4], [-16, 3.4], [-17.2, 0, 'c']];
        // 右翼：镰刀形——前缘从肩部几乎横着外展、再向后弯，尖端明显后掠；后缘在尖端附近向前凹进去，再外凸收回尾根（真实蝠鲼翼尖的“猎鹰翼”轮廓）。
        // 末尾几个内侧点藏在身体盘下面。前缘与后缘各一份点表，下面的深色后缘带与描边共用，改翼形只改这两张表。
        const LE = [[31.5, 13.5], [30.8, 19], [27.5, 26.5], [21, 34], [12, 40.6], [2, 45.2]];
        const TR = [[-9.5, 47.6, 'c'], [-4.6, 40.2], [-4.4, 33], [-8.4, 25], [-12.6, 16], [-15.6, 7]];
        const wing = smooth([...LE, ...TR, [-6, 7.6], [10, 9], [26, 9.6]], true);
        // 后缘与翼尖的深灰：宽淡两层叠出渐变；内缘按后缘点逐点向前内移 inset（尖端不移，让带子在尖端收尖）
        const TRAIL_W = [0, 0.75, 1, 1, 1, 0.9];
        const trail = (inset) => smooth([
            ...TR,
            ...TR.map(([x, y], i) => [x + inset * TRAIL_W[i], y - inset * 0.3 * TRAIL_W[i]]).reverse(),
        ], true);
        const tipDark = smooth([[6, 43.5], [-9.5, 47.6, 'c'], [-4.6, 40.2], [-0.5, 37.6], [3.6, 39.2]], true);
        const rearCenter = smooth([[-2, -11.5], [-10.5, -7], [-17.2, 0, 'c'], [-10.5, 7], [-2, 11.5], [-7.5, 6.2], [-9.4, 0], [-7.5, -6.2]], true);
        // 鳃裂：每侧 5 道短横条，排成一列
        const gills = [0, 1, 2, 3, 4].map(i => `M ${pair(12.4 - i * 3.3, 11.6 + i * 0.25)} L ${pair(11.6 - i * 3.3, 15.6 + i * 0.3)}`).join(' ');
        // 腹面黑斑：几块拉长的大斑 + 若干小点，每只蝠鲼不一样，位置固定在数据里
        let blotch = '';
        for (let i = 0; i < 4; i++) {
            const x = 9 - i * 5.2 + (rand() - 0.5) * 2;
            const y = 3.4 + rand() * 4.4;
            const len = 2.6 + rand() * 2.6, wid = 0.8 + rand() * 0.8, rot = 0.5 + rand() * 1.0;
            const dx = Math.cos(rot) * len / 2, dy = Math.sin(rot) * len / 2, ex = -Math.sin(rot) * wid, ey = Math.cos(rot) * wid;
            blotch += (blotch ? ' ' : '') + smooth([[x - dx, y - dy], [x + ex * 0.5, y + ey * 0.5], [x + dx, y + dy], [x - ex * 0.5, y - ey * 0.5]], true);
        }
        let specks = '';
        for (let i = 0; i < 12; i++) {
            const x = 18 - i * 2.6 + (rand() - 0.5) * 2.4;
            const y = 4 + rand() * 16;
            specks += (specks ? ' ' : '') + disc(x, y, 0.28 + rand() * 0.34, rand() * 6, 5);
        }
        const hornProf = [[0, 3.2, 3.2], [0.3, 2.8, 2.4], [0.75, 1.5, 1.2], [1, 0.4, 0.4]];
        const horn = blade([33.4, 9.2], [50, 13.4], hornProf, 0.06);
        const hornTip = blade([46.4, 12.5], [50, 13.4], [[0, 1.5, 1.2], [0.6, 1.0, 0.8], [1, 0.35, 0.35]], 0.06);
        const tail = blade([-16, 0], [-50, 0], [[0, 1.2, 1.2], [0.3, 0.7, 0.7], [1, 0.12, 0.12]], 0);

        return {
            view: 'top', length: 100, tail: -50, snout: 50,
            bend: { amp: [0, 0.045], pow: 4, waves: 0.6, turn: 0.04 },
            parts: {
                wing: { pivot: [8, 9], deg: 0, lag: 1.0, phase: 0, freq: 2, squash: 0.12, squashPhase: 0.4 },
                horn: { pivot: [33.4, 9], deg: 6, lag: 0.3, phase: 0.9 },
            },
            layers: [
                { id: 'tail', d: tail, fill: '#6f7b85' },
                { id: 'wing', part: 'wing', mirror: true, d: wing, fill: '#dde3e7' },
                { id: 'trailWide', part: 'wing', mirror: true, d: trail(9), fill: '#9ba6b0', alpha: 0.3 },
                { id: 'trail', part: 'wing', mirror: true, d: trail(5), fill: '#8793a0', alpha: 0.45 },
                { id: 'tipDark', part: 'wing', mirror: true, d: tipDark, fill: '#5f6b77', alpha: 0.7 },
                { id: 'wingRim', part: 'wing', mirror: true, d: smooth(LE.concat([TR[0]]), false), stroke: { color: '#66727d', width: 0.9, alpha: 0.5 } },
                { id: 'body', d: symOutline(bodyHalf), fill: '#dde3e7' },
                { id: 'rearCenter', d: rearCenter, fill: '#8793a0', alpha: 0.42 },
                { id: 'gills', d: gills, mirror: true, stroke: { color: '#2b3842', width: 0.65, alpha: 0.72 } },
                { id: 'blotch', d: blotch, mirror: true, fill: '#1f272e', alpha: 0.82 },
                { id: 'specks', d: specks, mirror: true, fill: '#232b32', alpha: 0.7, lod: 1 },
                { id: 'horn', part: 'horn', mirror: true, d: horn, fill: '#d2d9de' },
                { id: 'hornTip', part: 'horn', mirror: true, d: hornTip, fill: '#313c45', alpha: 0.85 },
                { id: 'hornEdge', part: 'horn', mirror: true, d: bladeEdge([33.4, 9.2], [50, 13.4], hornProf, 0.06, -1), stroke: { color: '#5b6772', width: 0.5, alpha: 0.45 }, lod: 1 },
                { id: 'mouth', d: 'M 34.4 -8.2 C 36.4 -3.4, 36.4 3.4, 34.4 8.2 C 32 5.4, 31.6 -5.4, 34.4 -8.2 Z', fill: '#1d252c', alpha: 0.86 },
                { id: 'lip', d: 'M 36.2 -6 C 37.2 -2.4, 37.2 2.4, 36.2 6', stroke: { color: '#eef2f4', width: 0.55, alpha: 0.6 }, lod: 1 },
                { id: 'nostrils', d: 'M 29.6 -4.8 Q 28.6 -3.4 29.8 -2.2 M 29.6 4.8 Q 28.6 3.4 29.8 2.2', stroke: { color: '#46525c', width: 0.45, alpha: 0.55 }, lod: 1 },
            ],
        };
    }

    // ---------- 锤头鲨（侧视，略俯拍：锤头是一根竖着的横杆，近端的眼睛在下端） ----------

    function hammer() {
        const st = [
            [-36, -2.2, 2.4], [-30, -3.4, 3.8], [-22, -5.0, 5.6], [-12, -6.8, 7.4], [-2, -8.0, 8.6], [8, -8.6, 8.8], [18, -8.4, 8.2], [27, -7.4, 7.0], [34, -6.2, 5.8], [39, -5.0, 4.6], [43, -4.0, 3.6], [46, -3.0, 2.6],
        ];
        const gills = [33.6, 32.1, 30.6, 29.1, 27.6].map(x => `M ${pair(x + 0.6, yAt(st, x, -0.6))} Q ${pair(x - 0.5, 0.4)} ${pair(x + 0.1, yAt(st, x, 0.66))}`).join(' ');
        const bar = smooth([[43.4, -12.6], [45.6, -12.2], [46.8, -9.6], [48.8, -4], [50.2, 0.6], [49.6, 5.6], [48.2, 10.4], [46, 13.6], [43.6, 13.2], [42.8, 10.2], [41.6, 4.6], [40.6, 0], [41, -5.4], [41.8, -10]], true);
        return {
            view: 'side', length: 100, tail: -50, snout: 50,
            bend: { amp: [0.01, 0.075], pow: 2.2, waves: 0.85, turn: 0.08 },
            parts: {
                pec: { pivot: [20, 5], deg: 8, lag: 0.4, phase: 0.3 },
                pelvic: { pivot: [-4, 7.6], deg: 5, lag: 0.3, phase: 1 },
                bar: { pivot: [45, 0], deg: 2.5, lag: 0.2, phase: -0.5, squash: 0.12, squashPhase: 0.2 },
            },
            layers: [
                { id: 'dorsal2', d: 'M -20 -4.8 C -22 -7.8, -24.2 -10.2, -26.6 -11.2 C -26.6 -8.8, -27 -6.8, -28.6 -3.8 Z', fill: '#59665f' },
                { id: 'dorsal1', d: 'M 17 -7 C 15 -13.6, 11 -20.6, 6 -27 C 4 -21.6, 2 -15.4, -1.4 -8.6 L -3 -7 C 2.4 -6.2, 10.4 -6.2, 17 -7 Z', fill: '#56635c' },
                { id: 'anal', d: 'M -19 5.6 C -21 8, -23.6 10, -26.4 10.8 C -26.4 8.8, -26.8 7, -27 5 Z', fill: '#8d9a93' },
                { id: 'caudal', d: 'M -34 -2.6 C -38 -6.2, -44 -13.2, -51.6 -23.4 C -49.2 -16.6, -45.8 -10, -42.8 -4 C -43 0.4, -45 4.6, -46.6 7.8 C -42.6 6.2, -38.4 4.4, -34 3 Z', fill: '#5a675f' },
                { id: 'pelvic', part: 'pelvic', d: 'M -3 7.6 C -5.6 10.2, -8.8 12.4, -12.4 13.2 C -12 11, -11.4 9.2, -10.4 7 Z', fill: '#8d9a93' },
                { id: 'body', d: outline(st), fill: '#76847d' },
                { id: 'backDark', d: band(st, -1, 0.1), fill: '#4f5d57', alpha: 0.45 },
                { id: 'backDark1', d: band(st, -1, -0.12), fill: '#4a5852', alpha: 0.5 },
                { id: 'backDark2', d: band(st, -1, -0.34), fill: '#3e4b45', alpha: 0.5 },
                { id: 'backDark3', d: band(st, -1, -0.6), fill: '#33403a', alpha: 0.4 },
                { id: 'belly0', d: band(st, 0.08, 1), fill: '#dde2dd', alpha: 0.2 },
                { id: 'belly1', d: band(st, 0.2, 1), fill: '#e0e5e0', alpha: 0.3 },
                { id: 'belly2', d: band(st, 0.34, 1), fill: '#e8ece8', alpha: 0.42 },
                { id: 'belly3', d: band(st, 0.48, 1), fill: '#eef1ee', alpha: 0.6 },
                { id: 'belly4', d: band(st, 0.6, 1), fill: '#f2f5f2', alpha: 0.75 },
                { id: 'rim', d: band(st, -1, -0.85), fill: '#aebdb5', alpha: 0.2, lod: 1 },
                { id: 'lateral', d: kLine(st, -0.04, 32, -30), stroke: { color: '#c9d6cf', width: 0.4, alpha: 0.2 }, lod: 1 },
                { id: 'gills', d: gills, stroke: { color: '#1b2622', width: 0.55, alpha: 0.6 }, lod: 1 },
                { id: 'mouth', d: 'M 38.4 4.4 Q 41.8 6.4 44.6 5.4', stroke: { color: '#1b2622', width: 0.6, alpha: 0.6 } },
                { id: 'bar', part: 'bar', d: bar, fill: { a: [45, -13], b: [46, 13], stops: [[0, '#4a5852'], [0.5, '#6c7a73'], [1, '#c9d2cc']] } },
                { id: 'barEdge', part: 'bar', d: 'M 45.4 -12 C 47.4 -8, 49.4 -4, 50.1 0.6 C 49.6 5, 48.2 9.4, 46 13', stroke: { color: '#2b3632', width: 0.5, alpha: 0.5 }, lod: 1 },
                { id: 'nostril', part: 'bar', d: 'M 48.8 -4.4 Q 49.8 -2 49.6 0.4', stroke: { color: '#222d29', width: 0.45, alpha: 0.6 }, lod: 1 },
                { id: 'eyeNear', part: 'bar', d: disc(46, 11.2, 1.2, 0, 9), fill: '#0b100e' },
                { id: 'eyeNearGlint', part: 'bar', d: disc(46.3, 10.8, 0.34, 0, 6), fill: '#f2f4ee', alpha: 0.85, lod: 1 },
                { id: 'eyeFar', part: 'bar', d: disc(44.2, -10.6, 0.85, 0, 8), fill: '#0b100e', alpha: 0.8 },
                {
                    id: 'pec', part: 'pec',
                    d: 'M 22 4.4 C 19 10, 12 17.6, 3 24.8 C 4.6 19, 6.8 13, 9 7.4 C 13.5 6.2, 18 5.2, 22 4.4 Z',
                    fill: { a: [20, 6], b: [4, 24], stops: [[0, '#6f7d76', 0.0], [0.25, '#66746d', 0.95], [0.7, '#4d5b54', 1], [1, '#2e3a35', 1]] },
                },
            ],
        };
    }

    const BUILDERS = Object.freeze({ hammer, manta, turtle, whaleshark: whaleShark });
    const IDS = Object.freeze(Object.keys(BUILDERS));
    const cache = new Map();
    const sources = new Map();

    /** 数据源（未编译，已冻结前的纯数据；测试与生成器读它）。 */
    function source(id) {
        if (!Object.prototype.hasOwnProperty.call(BUILDERS, id)) return null;
        if (!sources.has(id)) {
            const built = BUILDERS[id]();
            // 手写路径允许用逗号分隔坐标对（更好读）；严格解析器只认空格，这里统一规范一次
            for (const layer of built.layers) layer.d = layer.d.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
            sources.set(id, built);
        }
        return sources.get(id);
    }

    /** 编译后的骨架（缓存）；数据不合规返回 null（调用方当作“这种动物画不了”，不抛异常）。 */
    function rig(id) {
        if (cache.has(id)) return cache.get(id);
        let out = null;
        const src = source(id);
        if (src) {
            try { out = Rig.compile(src); } catch (error) { out = null; if (typeof console !== 'undefined') console.warn(`写实动物 ${id} 的数据不合规：${error.message}`); }
        }
        cache.set(id, out);
        return out;
    }

    return Object.freeze({ IDS, source, rig, helpers: Object.freeze({ polyline, smooth, disc, yAt, kLine, outline, band, mulberry32 }) });
});
