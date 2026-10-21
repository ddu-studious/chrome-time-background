(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumYaw = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 侧视大个子（小锤头鲨、鲸鲨）转身时的“伪 3D”投影——纯几何，不碰 DOM、时钟、随机数、存储。
    //
    // 为什么要有它：核心让这两种动物在水面以下的水平面里转半圈（yaw 0→1，θ = π·yaw）。原来的画法只把整只鱼沿屏幕横向压扁成 |cos θ|，
    // 到 θ = 90° 就只剩一条细线，像一张翻面的纸片。真鱼转到正对观众时是一个圆滚滚的身体、两侧伸出胸鳍、锤头鲨还有一根横着的锤头，不会变成线。
    // 这里不是 3D 引擎：用“椭圆剖面”近似身体，把已经求值好的骨架图层（MarineRig.evaluate 的 ops，含游动弯曲与拉尾）逐点投影：
    //   · 躯干轮廓 = 矢状面薄片（沿体轴压缩 cosθ）∪ 每个站位的椭圆剖面（横向半宽 rz，投影后在屏幕横向占 rz·sinθ）——θ = 0 时与原轮廓一致，θ = 90° 是圆身体；
    //   · 体表图层（背腹明暗、鳃裂、斑点、眼睛……）：每个点按所在剖面的深度 z 横向位移，x' = x·cosθ − z·sinθ（鼻端朝观众转，近侧体表向尾侧移）；
    //     背向观众的部分（体表法线在视线方向上的分量 ≤ 0，转到正对时是躯干的后半段）按这个标量场裁掉，免得前后两半的图案叠在同一块屏幕上；
    //   · 矢状面的鳍（背鳍、臀鳍、尾鳍）只压缩 cosθ，转到正对时是一条线；胸鳍/腹鳍是离体表向外张开的片（z 随离根部的距离增大），远侧那一片在身体后面、略暗；
    //   · 锤头鲨的锤头：美术里是竖着的一根杆（略俯拍），转身时绕体轴滚成横杆（roll 0→90°），眼睛始终在杆的两端，正对时是左右各一只眼的 T 形。
    // 参照：同一份剖面数据在 three.js 里建一个真 3D 模型，正交相机在 θ = 0/30/60/80/90°… 与本投影比轮廓重合度（IoU），结果与取舍见
    // docs/research/research-aquarium-physical-realism-libs-20261020.md；本文件不含任何第三方代码，也没有新依赖。
    //
    // 约定：输入输出都是骨架坐标（吻端朝 +x、y 向下、体长 100 单位）；θ 是“相对侧视的转角”，范围 0…π/2——核心在转半圈的后一半换了面（face 取反、画面镜像），
    // 所以后一半用同一套投影加水平镜像（stateOf 给出 mirror）。投影失败（数据不合规）返回 null，调用方退回原来的压扁画法。

    const HALF_PI = Math.PI / 2;
    const TWO_PI = Math.PI * 2;
    const STATIONS = 96;                // 体轴上的剖面站位数（骨架单位下间距约 1，屏幕上 3–5 px）
    const SAMPLES = 112;                // 轮廓包络的采样数
    const TOWARD = -1;                  // x' = x·cosθ + TOWARD·z·sinθ：鼻端朝观众转（-1），近侧体表向尾侧移
    const EPS = 1e-9;
    const MIN_RY = 0.15;                // 站位竖向半高下限（骨架单位）：别让尾端的剖面退化成线
    const FAR_SHADE = 0.72;             // 远侧的鳍：颜色乘此值（在身体后面，略暗）
    const FAR_FLANK_FROM = 0.85;        // 转角超过此值（rad，约 49°）才处理远侧体表：再小的转角远侧体表整片背向观众
    const VOLUME_DARK = 0.42;           // 体积感：躯干远侧（屏幕右侧）最暗处压多深（乘 sinθ，θ = 0 时没有）
    const VOLUME_TINT = 0.4;            // 体积感的暗色 = 躯干颜色乘此值

    // 每个物种的剖面与图层分工。tau：横向半宽 / 竖向半高随体轴 x 的分段线性表（头扁而宽的鲸鲨在头部大于 1）；
    // sagittal：矢状面的片；plates：向外张开的鳍片（root 根部、spread 每离根部 1 个单位向外多张开多少、farId 骨架里已有的远侧图层）；
    // roll：随转身绕体轴滚动的一组图层（锤头；其中 balls 是球形的，只挪中心）；hammer：转到侧面才看得见的锤头厚度剖面（美术里的竖杆之外的横杆）。其余图层都是体表图层。
    const PROFILES = Object.freeze({
        hammer: Object.freeze({
            tau: Object.freeze([[-50, 0.85], [50, 0.85]]),
            sagittal: Object.freeze(['dorsal1', 'dorsal2', 'anal', 'caudal']),
            plates: Object.freeze([
                Object.freeze({ id: 'pec', root: Object.freeze([22, 4.4]), spread: 0.5, farId: null }),
                Object.freeze({ id: 'pelvic', root: Object.freeze([-3, 7.6]), spread: 0.35, farId: null }),
            ]),
            roll: Object.freeze({
                ids: Object.freeze(['bar', 'barEdge', 'nostril', 'eyeNear', 'eyeNearGlint', 'eyeFar']),
                balls: Object.freeze(['eyeNear', 'eyeNearGlint', 'eyeFar']),      // 眼睛是球：只挪中心，形状不跟着滚成一条线
                yc: 0.5,
            }),
            hammer: Object.freeze({ x0: 41, x1: 50.2, half: 14.5, ry: 3.6, yc: 1.2 }),
        }),
        whaleshark: Object.freeze({
            tau: Object.freeze([[-50, 1], [-9, 1], [20, 1.05], [36, 1.35], [41.5, 1.6], [45, 2], [47.6, 2.3], [50.4, 2.6]]),
            sagittal: Object.freeze(['dorsal1', 'dorsal2', 'anal', 'caudal']),
            plates: Object.freeze([
                Object.freeze({ id: 'pec', root: Object.freeze([26, 4]), spread: 0.5, farId: 'pecFar' }),
                Object.freeze({ id: 'pelvic', root: Object.freeze([-5, 7.3]), spread: 0.35, farId: null }),
            ]),
            roll: null,
            hammer: null,
        }),
    });

    const clamp = (value, lo, hi) => (value < lo ? lo : (value > hi ? hi : value));
    const isNum = value => typeof value === 'number' && Number.isFinite(value);
    const smooth01 = t => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

    function has(species) {
        return typeof species === 'string' && Object.prototype.hasOwnProperty.call(PROFILES, species);
    }

    function ids() {
        return Object.keys(PROFILES);
    }

    function wrapPi(angle) {
        let a = (angle + Math.PI) % TWO_PI;
        if (a < 0) a += TWO_PI;
        return a - Math.PI;
    }

    /**
     * 鱼的转身状态 → 画法需要的三个量，不在转身中（或数据不合规）返回 null。
     * theta：相对侧视的转角 0…π/2（核心在转半圈的前一半是 π·yaw，换面之后同一投影加镜像，所以取 π·min(yaw, 1−yaw)）；
     * mirror：换面之后（face < 0）整体水平镜像；pitch：鼻朝右的等价俯仰角（face < 0 时核心已把 ang 镜像，换算回来）。
     */
    function stateOf(fish) {
        if (!fish || !isNum(fish.yaw) || !(fish.yaw > 0 && fish.yaw < 1)) return null;
        if (fish.face !== 1 && fish.face !== -1) return null;
        if (!isNum(fish.ang)) return null;
        return {
            theta: Math.PI * Math.min(fish.yaw, 1 - fish.yaw),
            mirror: fish.face < 0,
            pitch: fish.face < 0 ? wrapPi(Math.PI - fish.ang) : wrapPi(fish.ang),
        };
    }

    /** 分段线性表 [[x, v], …]（x 递增）在 x 处的值，两端取端值。 */
    function tableAt(table, x) {
        if (x <= table[0][0]) return table[0][1];
        for (let i = 1; i < table.length; i++) {
            if (x <= table[i][0]) {
                const a = table[i - 1], b = table[i];
                const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
                return a[1] + (b[1] - a[1]) * t;
            }
        }
        return table[table.length - 1][1];
    }

    /**
     * 躯干多边形 → 体轴上等距站位：{ x0, dx, n, yc[], ry[], rz[] }（n + 1 个站位）。站位 k 的竖向范围是多边形在 x0 + k·dx 处与竖线的交点的上下界。
     * 轮廓没有覆盖到的站位（按理不会有）用相邻站位补；有效站位太少或有非有限值返回 null。
     */
    function stationsOf(poly, tau) {
        if (!poly || !Array.isArray(poly.pts) || poly.pts.length < 6) return null;
        const pts = poly.pts;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < pts.length; i += 2) {
            if (!isNum(pts[i]) || !isNum(pts[i + 1])) return null;
            if (pts[i] < lo) lo = pts[i];
            if (pts[i] > hi) hi = pts[i];
        }
        if (!(hi - lo > 1)) return null;
        const n = STATIONS;
        const dx = (hi - lo) / n;
        const top = new Array(n + 1).fill(NaN), bottom = new Array(n + 1).fill(NaN);
        const count = pts.length / 2;
        for (let k = 0; k <= n; k++) {
            const x = lo + k * dx;
            let a = Infinity, b = -Infinity;
            for (let i = 0; i < count; i++) {
                const j = (i + 1) % count;
                const xa = pts[2 * i], ya = pts[2 * i + 1], xb = pts[2 * j], yb = pts[2 * j + 1];
                if ((xa <= x && x <= xb) || (xb <= x && x <= xa)) {
                    const t = xb === xa ? 0 : (x - xa) / (xb - xa);
                    const y = ya + (yb - ya) * t;
                    if (y < a) a = y;
                    if (y > b) b = y;
                }
            }
            if (a <= b) { top[k] = a; bottom[k] = b; }
        }
        let valid = 0;
        for (let k = 0; k <= n; k++) if (Number.isFinite(top[k])) valid++;
        if (valid < n * 0.8) return null;
        for (let k = 0; k <= n; k++) {                                        // 空站位向相邻有效站位取值
            if (Number.isFinite(top[k])) continue;
            let l = k - 1, r = k + 1;
            while (l >= 0 && !Number.isFinite(top[l])) l--;
            while (r <= n && !Number.isFinite(top[r])) r++;
            const src = l >= 0 && (r > n || k - l <= r - k) ? l : r;
            top[k] = top[src]; bottom[k] = bottom[src];
        }
        const yc = new Array(n + 1), ry = new Array(n + 1), rz = new Array(n + 1);
        for (let k = 0; k <= n; k++) {
            yc[k] = (top[k] + bottom[k]) / 2;
            ry[k] = Math.max((bottom[k] - top[k]) / 2, MIN_RY);
            rz[k] = ry[k] * tableAt(tau, lo + k * dx);
        }
        // 沿体轴的变化率（体表法线用）：5 点滑动平均后的中心差分，端点用单侧差分——站位本身有采样噪声，直接差分会让法线抖
        const diff = arr => {
            const sm = arr.map((v, k) => { let sum = 0, cnt = 0; for (let j = Math.max(0, k - 2); j <= Math.min(n, k + 2); j++) { sum += arr[j]; cnt++; } return sum / cnt; });
            return sm.map((v, k) => (sm[Math.min(n, k + 1)] - sm[Math.max(0, k - 1)]) / (dx * (Math.min(n, k + 1) - Math.max(0, k - 1))));
        };
        return { x0: lo, dx, n, yc, ry, rz, dyc: diff(yc), dry: diff(ry), drz: diff(rz) };
    }

    /** 体表上 (x, y) 处的深度（近侧）：该站位椭圆剖面在高度 y 处的横向半宽。 */
    function depthAt(st, x, y) {
        const k = clamp(Math.round((x - st.x0) / st.dx), 0, st.n);
        const t = clamp((y - st.yc[k]) / st.ry[k], -1, 1);
        return st.rz[k] * Math.sqrt(1 - t * t);
    }

    /** 锤头的横杆剖面（x0…x1 共 9 个站位，宽度像透镜）：{ x[], yc, ry[], rz[] }。 */
    function hammerStations(spec) {
        const out = { x: [], ry: [], rz: [], yc: spec.yc };
        for (let k = 0; k <= 8; k++) {
            const u = k / 8;
            const prof = Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.45) / 0.62, 2)));
            out.x.push(spec.x0 + (spec.x1 - spec.x0) * u);
            out.ry.push(spec.ry * (0.4 + 0.6 * prof));
            out.rz.push(spec.half * prof);
        }
        return out;
    }

    /**
     * 躯干投影后的轮廓多边形：矢状面薄片（站位按 cosθ 压缩，上下界线性插值——θ = 0 时就是原轮廓）与各站位椭圆（半宽 rz·sinθ、半高 ry）的并集。
     * 在 SAMPLES 个横向位置上取并集的上下包络，返回闭合多边形的点列 [x0, y0, x1, y1, …]；没有任何覆盖返回 null。
     */
    function silhouetteOf(st, hammer, c, s) {
        const hs = hammer ? hammerStations(hammer) : null;
        const hdx = hammer ? (hammer.x1 - hammer.x0) / 8 : 0;
        let lo = Infinity, hi = -Infinity;
        const useCore = c > 1e-4;
        if (useCore) { lo = st.x0 * c; hi = (st.x0 + st.n * st.dx) * c; }
        for (let k = 0; k <= st.n; k++) {
            const X = (st.x0 + k * st.dx) * c, a = st.rz[k] * s;
            if (X - a < lo) lo = X - a;
            if (X + a > hi) hi = X + a;
        }
        if (hs) for (let k = 0; k < 9; k++) {
            const X = hs.x[k] * c, a = hs.rz[k] * s + 0.65 * hdx * c;
            if (X - a < lo) lo = X - a;
            if (X + a > hi) hi = X + a;
        }
        if (!(hi > lo)) return null;
        const upper = [], lower = [];
        for (let j = 0; j <= SAMPLES; j++) {
            const u = lo + (hi - lo) * (j / SAMPLES);
            let top = Infinity, bottom = -Infinity;
            if (useCore) {
                const f = (u / c - st.x0) / st.dx;
                if (f >= 0 && f <= st.n) {
                    const k = Math.min(Math.floor(f), st.n - 1), t = f - k;
                    top = (st.yc[k] - st.ry[k]) * (1 - t) + (st.yc[k + 1] - st.ry[k + 1]) * t;
                    bottom = (st.yc[k] + st.ry[k]) * (1 - t) + (st.yc[k + 1] + st.ry[k + 1]) * t;
                }
            }
            for (let k = 0; k <= st.n; k++) {
                const a = st.rz[k] * s;
                if (a <= EPS) continue;
                const d = u - (st.x0 + k * st.dx) * c;
                if (d < -a || d > a) continue;                                   // 恰好落在椭圆左右端点上的采样也算（高度 0），否则最宽处的两端会各缩进一个采样间隔
                const h = st.ry[k] * Math.sqrt(Math.max(0, 1 - (d * d) / (a * a)));
                if (st.yc[k] - h < top) top = st.yc[k] - h;
                if (st.yc[k] + h > bottom) bottom = st.yc[k] + h;
            }
            if (hs) for (let k = 0; k < 9; k++) {
                const a = hs.rz[k] * s + 0.65 * hdx * c;
                if (a <= EPS) continue;
                const d = u - hs.x[k] * c;
                if (d < -a || d > a) continue;
                const h = hs.ry[k] * Math.sqrt(Math.max(0, 1 - (d * d) / (a * a)));
                if (hs.yc - h < top) top = hs.yc - h;
                if (hs.yc + h > bottom) bottom = hs.yc + h;
            }
            if (top <= bottom) { upper.push(u, top); lower.push(u, bottom); }
        }
        if (upper.length < 6) return null;
        const out = upper.slice();
        for (let i = lower.length - 2; i >= 0; i -= 2) out.push(lower[i], lower[i + 1]);
        return out;
    }

    /**
     * 体表上 (x, y) 处的“朝向观众程度”（side = +1 近侧体表、-1 远侧体表）：体表法线（椭圆剖面放样面的解析法线）在转角 θ 后的视线分量，> 0 朝向观众、≤ 0 背向。
     * 法线 n = (−rz·sinα·(yc′ + ry′·sinα) − rz′·ry·cos²α, rz·sinα, ry·cosα)，α 由 y 在剖面里的相对高度定（sinα = t），视线分量 = n.x·sinθ + n.z·cosθ。
     */
    function facing(st, x, y, c, s, side) {
        const k = clamp(Math.round((x - st.x0) / st.dx), 0, st.n);
        const t = clamp((y - st.yc[k]) / st.ry[k], -1, 1);
        const cos2 = 1 - t * t;
        const nx = -st.rz[k] * t * (st.dyc[k] + st.dry[k] * t) - st.drz[k] * st.ry[k] * cos2;
        return nx * s + (side < 0 ? -1 : 1) * st.ry[k] * Math.sqrt(cos2) * c;
    }

    /** 闭合多边形按标量场 f ≥ 0 裁剪（Sutherland–Hodgman，边上的交点按 f 线性插值）；返回点列，不足 3 个点返回 null。 */
    function clipClosed(pts, f) {
        const n = pts.length / 2;
        if (n < 3) return null;
        const vals = new Array(n);
        for (let i = 0; i < n; i++) vals[i] = f(pts[2 * i], pts[2 * i + 1]);
        let allIn = true;
        for (let i = 0; i < n; i++) if (!(vals[i] >= 0)) { allIn = false; break; }
        if (allIn) return pts;
        const out = [];
        let pi = n - 1;
        for (let i = 0; i < n; i++) {
            const px = pts[2 * pi], py = pts[2 * pi + 1], x = pts[2 * i], y = pts[2 * i + 1];
            const pf = vals[pi], cf = vals[i];
            if (cf >= 0) {
                if (!(pf >= 0)) { const t = pf / (pf - cf); out.push(px + (x - px) * t, py + (y - py) * t); }
                out.push(x, y);
            } else if (pf >= 0) {
                const t = pf / (pf - cf);
                out.push(px + (x - px) * t, py + (y - py) * t);
            }
            pi = i;
        }
        return out.length >= 6 ? out : null;
    }

    /** 折线按标量场 f ≥ 0 裁成若干段（每段 ≥ 2 个点）；返回 [[x0, y0, x1, y1, …], …]。 */
    function clipRuns(pts, f) {
        const n = pts.length / 2;
        const runs = [];
        let cur = null;
        let px = 0, py = 0, pf = 0;
        for (let i = 0; i < n; i++) {
            const x = pts[2 * i], y = pts[2 * i + 1], cf = f(x, y);
            if (i > 0) {
                if (cf >= 0 && !(pf >= 0)) { const t = pf / (pf - cf); cur = [px + (x - px) * t, py + (y - py) * t]; }
                else if (!(cf >= 0) && pf >= 0) { const t = pf / (pf - cf); cur.push(px + (x - px) * t, py + (y - py) * t); runs.push(cur); cur = null; }
            }
            if (cf >= 0) { if (!cur) cur = []; cur.push(x, y); }
            px = x; py = y; pf = cf;
        }
        if (cur) runs.push(cur);
        return runs.filter(r => r.length >= 4);
    }

    /**
     * 体积感：近侧体表有美术图层，远侧只是躯干底色，转到 60–90° 时像一个“只画了半边的圆”。在轮廓上叠一层从近侧（屏幕左）到远侧（右）渐深的同色暗层，
     * 强度 ∝ sinθ（θ = 0 时为 0，不改变原来的画面）；画在体表图层之下，近侧的图案不受影响。轮廓为空（点数不足）返回 null。
     */
    function volumeOp(bodyOp, sil, s) {
        if (!(s > 1e-3) || sil.length < 6) return null;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < sil.length; i += 2) { if (sil[i] < lo) lo = sil[i]; if (sil[i] > hi) hi = sil[i]; }
        if (!(hi - lo > 1e-6)) return null;
        const base = bodyOp.paint && Array.isArray(bodyOp.paint.rgba) ? bodyOp.paint.rgba : [0.3, 0.4, 0.45, 1];
        const r = base[0] * VOLUME_TINT, g = base[1] * VOLUME_TINT, b = base[2] * VOLUME_TINT;
        return {
            id: 'volume', k: 'fill', rule: 'nonzero',
            paint: { grad: { a: [lo, 0], b: [hi, 0], stops: [[0, r, g, b, 0], [0.4, r, g, b, 0], [1, r, g, b, VOLUME_DARK * s]] } },
            polys: [{ pts: sil, closed: true }],
        };
    }

    /** 颜色/渐变整体乘 k（只动 rgb，不动不透明度）；返回新对象，不改原来的。 */
    function shadePaint(paint, k) {
        if (paint && Array.isArray(paint.rgba)) return { rgba: [paint.rgba[0] * k, paint.rgba[1] * k, paint.rgba[2] * k, paint.rgba[3]] };
        if (paint && paint.grad) {
            const g = paint.grad;
            return { grad: { a: g.a, b: g.b, stops: g.stops.map(s => [s[0], s[1] * k, s[2] * k, s[3] * k, s[4]]) } };
        }
        return paint;
    }

    function mapPolys(polys, fn) {
        const out = new Array(polys.length);
        for (let p = 0; p < polys.length; p++) {
            const src = polys[p].pts;
            const pts = new Array(src.length);
            for (let i = 0; i < src.length; i += 2) fn(src[i], src[i + 1], pts, i);
            out[p] = { pts, closed: polys[p].closed };
        }
        return out;
    }

    function withPolys(op, polys, extra) {
        return Object.assign({}, op, extra || null, { polys });
    }

    /**
     * 把求值后的骨架图层投影到转角 theta（0…π/2，越界夹取）。返回新的 ops 数组，不改输入；顺序：远侧的鳍 → 躯干轮廓 → 远侧体表图案（只在接近正对时才有）→ 体积感暗层 → 近侧体表图案 → 其余图层原顺序。
     * 数据不合规（没有躯干、站位不够、结果里有非有限值）、物种不支持、theta 不是有限数时返回 null。
     */
    function project(ops, species, theta) {
        if (!has(species) || !Array.isArray(ops) || !isNum(theta)) return null;
        const prof = PROFILES[species];
        const th = clamp(theta, 0, HALF_PI);
        const c = Math.cos(th), s = Math.sin(th);
        const bodyOp = ops.find(op => op && op.id === 'body');
        if (!bodyOp || !Array.isArray(bodyOp.polys) || !bodyOp.polys.length) return null;
        const st = stationsOf(bodyOp.polys[0], prof.tau);
        if (!st) return null;
        const sil = silhouetteOf(st, prof.hammer, c, s);
        if (!sil) return null;

        const sagittal = new Set(prof.sagittal);
        const rollIds = new Set(prof.roll ? prof.roll.ids : []);
        const balls = new Set(prof.roll ? prof.roll.balls : []);
        const plateOf = new Map(prof.plates.map(p => [p.id, p]));
        const farIds = new Map(prof.plates.filter(p => p.farId).map(p => [p.farId, p]));
        const phi = HALF_PI * smooth01(th / HALF_PI);
        const cphi = Math.cos(phi), sphi = Math.sin(phi);

        const plateMap = (plate, sign) => {
            const z0 = depthAt(st, plate.root[0], plate.root[1]) + 0.3;
            return (x, y, out, i) => {
                const z = sign * (z0 + plate.spread * Math.hypot(x - plate.root[0], y - plate.root[1]));
                out[i] = x * c + TOWARD * z * s;
                out[i + 1] = y;
            };
        };
        const sagittalMap = (x, y, out, i) => { out[i] = x * c; out[i + 1] = y; };
        const rollMap = prof.roll ? (x, y, out, i) => {
            const dy = y - prof.roll.yc;
            out[i] = x * c + TOWARD * dy * sphi * s;
            out[i + 1] = prof.roll.yc + dy * cphi;
        } : null;
        // 球形的图层（眼睛）：中心按滚动投影，形状原样跟着中心走
        const ballPolys = polys => polys.map(poly => {
            const n = poly.pts.length / 2;
            let cx = 0, cy = 0;
            for (let i = 0; i < poly.pts.length; i += 2) { cx += poly.pts[i]; cy += poly.pts[i + 1]; }
            cx /= n; cy /= n;
            const centre = [0, 0];
            rollMap(cx, cy, centre, 0);
            const pts = new Array(poly.pts.length);
            for (let i = 0; i < poly.pts.length; i += 2) { pts[i] = centre[0] + poly.pts[i] - cx; pts[i + 1] = centre[1] + poly.pts[i + 1] - cy; }
            return { pts, closed: poly.closed };
        });
        // 体表图层：先按“朝向观众”裁掉背面（θ = 0 时整片都朝向观众，原样通过），再按深度投影。side = +1 近侧体表，-1 远侧体表（左右对称，法线的 z 分量取反、体表的 z 取反）
        const surfaceOps = (op, side) => {
            const f = side > 0 ? (x, y) => facing(st, x, y, c, s, 1) : (x, y) => facing(st, x, y, c, s, -1);
            const map = (x, y, out, i) => { out[i] = x * c + TOWARD * side * depthAt(st, x, y) * s; out[i + 1] = y; };
            const out = [];
            for (const poly of op.polys) {
                if (poly.pts.length < 4) continue;
                if (op.k === 'fill') {
                    const pts = clipClosed(poly.pts, f);
                    if (pts) out.push({ pts, closed: true });
                } else {
                    for (const pts of clipRuns(poly.pts, f)) out.push({ pts, closed: false });
                }
            }
            return out.length ? withPolys(op, mapPolys(out, map)) : null;
        };
        const kindOf = op => {
            if (op.id === 'body') return 'body';
            if (sagittal.has(op.id)) return 'sagittal';
            if (farIds.has(op.id)) return 'farPlate';
            if (plateOf.has(op.id)) return 'plate';
            if (rollMap && balls.has(op.id)) return 'ball';
            if (rollMap && rollIds.has(op.id)) return 'roll';
            return 'surface';
        };

        for (const op of ops) if (!op || !Array.isArray(op.polys)) return null;
        const farClones = [];
        for (const op of ops) {
            const plate = plateOf.get(op.id);
            if (plate && !plate.farId) {                                         // 远侧没有单独图层的鳍：克隆一份放到身体后面
                farClones.push(withPolys(op, mapPolys(op.polys, plateMap(plate, -1)), {
                    id: op.id + 'Far',
                    paint: op.paint ? shadePaint(op.paint, FAR_SHADE) : op.paint,
                    rgba: op.rgba ? [op.rgba[0] * FAR_SHADE, op.rgba[1] * FAR_SHADE, op.rgba[2] * FAR_SHADE, op.rgba[3]] : op.rgba,
                }));
            }
        }
        const result = [];
        for (const op of ops) {
            switch (kindOf(op)) {
            case 'body': {
                for (const clone of farClones) result.push(clone);
                result.push(withPolys(op, [{ pts: sil, closed: true }], { rule: 'nonzero' }));
                if (th > FAR_FLANK_FROM) {                                       // 接近正对时远侧体表的前半段也朝向观众，在屏幕右半边
                    for (const other of ops) {
                        if (kindOf(other) !== 'surface') continue;
                        const far = surfaceOps(other, -1);
                        if (far) result.push(far);
                    }
                }
                const shade = volumeOp(op, sil, s);
                if (shade) result.push(shade);
                break;
            }
            case 'sagittal': result.push(withPolys(op, mapPolys(op.polys, sagittalMap))); break;
            case 'farPlate': result.push(withPolys(op, mapPolys(op.polys, plateMap(farIds.get(op.id), -1)))); break;
            case 'plate': result.push(withPolys(op, mapPolys(op.polys, plateMap(plateOf.get(op.id), 1)))); break;
            case 'ball': result.push(withPolys(op, ballPolys(op.polys))); break;
            case 'roll': result.push(withPolys(op, mapPolys(op.polys, rollMap))); break;
            default: {
                const near = surfaceOps(op, 1);
                if (near) result.push(near);
            }
            }
        }
        for (const op of result) {
            for (const poly of op.polys) for (let i = 0; i < poly.pts.length; i++) if (!Number.isFinite(poly.pts[i])) return null;
        }
        return result;
    }

    return Object.freeze({ PROFILES, STATIONS, SAMPLES, TOWARD, FAR_SHADE, has, ids, stateOf, project, stationsOf, depthAt, facing, silhouetteOf, clipClosed, clipRuns, wrapPi });
});
