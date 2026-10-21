(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumFlowCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水族馆的“水流与海洋雪”：大鱼游过留下的水流与染色尾迹（粗网格上的稳定流体），以及随流缓缓下沉、闪烁的海洋雪。
    // 纯逻辑：不碰 DOM、时钟、存储，随机数由调用方注入（node 里确定性地测试）；画法在 aquarium-ambient.js，接线在 aquarium.js。
    // 算法是 Jos Stam《Real-Time Fluid Dynamics for Games》（2003）里公开的稳定流体：外力 → 半拉格朗日对流 → 投影（Gauss–Seidel 解压力）；
    // 这里只借这个公开算法的思路、自己写了一份（没有任何第三方代码，也没有新依赖）。参考与取舍见
    // docs/research/research-aquarium-visual-tech-survey-20261020.md §6.3–6.4；海洋雪的“闪烁、慢漂、近大远小”来自对 Aurelia（MIT）演示画面的观察，没有照搬代码。
    //
    // 单位：画布像素（已含视口缩放）与秒。流场内部用“格子/秒”，格子宽 cw、高 ch（px）。
    // 对鱼只读不写（不改位置、速度）：它是纯视觉层，鱼的运动仍归 aquarium-core.js。

    const TAU = Math.PI * 2;
    const clamp = (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const finite = (...values) => values.every(Number.isFinite);

    // 下面的数字全部是初值，在真实浏览器里看画面校准后写回技术文档（见 docs/technical/aquarium-ambient-20261020.md）。
    const PARAMS = Object.freeze({
        MIN_SIZE: 64,             // 画布边长（px）不到这个值不建流场（返回 null）：没有画面意义，格子也凑不够
        // 流场网格
        CELL_PX: 18,              // 格子边长的目标值（px）；格子数 = 画布边长 / 它，夹在下面的上下限之间
        GRID_MIN_W: 16, GRID_MIN_H: 9,
        GRID_MAX_W: 96, GRID_MAX_H: 54,     // 上限：96×54 在 Node 里每步约 0.5 ms（含 1500 粒子，只算计算），再大就不划算了
        ITER: 10,                 // 压力迭代次数
        VEL_TAU_S: 1.3,           // 速度衰减的时间常数（秒）：水流在这么久里掉到 1/e
        DYE_TAU_S: 3.0,           // 染色衰减的时间常数（秒）
        UMAX: 38,                 // 速度上限（格子/秒），防止外力叠加后一步跨出很多格
        DYE_MAX: 1.5,             // 染色浓度上限
        MAX_DT: 0.05,
        MIN_DT: 0.0001,
        // 鱼的尾迹
        WAKE_MIN_LEN: 36,         // 体长（px）不到这个值的鱼不留尾迹：小鱼的尾迹比一个格子还小，看不见，却要花算力
        WAKE_MIN_SPEED: 6,        // 速度（px/s）不到这个值不留尾迹（停下的、被抓着不动的鱼）
        MAX_EMITTERS: 14,         // 每步最多取多少条鱼（体长大的优先）
        WAKE_BACK: 0.46,          // 尾迹的发射点在鱼心后面多少个体长处（尾柄附近）
        JET: 0.34,                // 尾流的向后速度 = 鱼速 × 它（尾迹是一股向后的射流，反作用力是推力）
        SWAY: 0.26,               // 尾流的横向摆动 = 鱼速 × 它 × sin(拍尾相位)（尾摆交替脱落涡）
        SWAY_RATE: 0.55,          // 拍尾相位 = fish.phase × 它（弧度/弧度；与画法里各物种的相位倍率无关，只求有节奏地左右交替）
        RADIUS_LEN: 0.16,         // 发射半径 = 体长 × 它（px），再夹在 [1.4, 4.5] 个格子之间
        DYE_LEVEL: 0.72,           // 尾迹染色的目标浓度：发射量 = 它 × π × 半径 × 速度（单位时间扫过的面积），所以尾迹的浓度与鱼的大小、快慢基本无关
        FORCE_TAU_S: 0.12,        // 尾流速度向“目标射流速度”靠拢的时间常数（秒）：当作持续的力而不是每步叠加冲量，否则速度会涨到上限
        BURST_SPEED: 0.9,         // 捕食爆发：中心处向外的速度 = 它 × 体长参考（格子/秒），越远越弱
        BURST_DYE: 0.9,           // 捕食爆发时在中心灌入的染色浓度
        MAX_BURSTS: 6,            // 待处理的爆发最多排几个（一帧里吃掉多条小鱼时）
        // 海洋雪
        SNOW_DENSITY: 1 / 3200,   // 粒子数 = 画布面积 × 它
        SNOW_MIN: 120, SNOW_MAX: 520,
        SNOW_SINK: 9,             // 下沉速度（px/s，视口缩放 1 时）：海洋雪真实下沉极慢，这里只求“缓缓地往下飘”
        SNOW_DRIFT: 5,            // 横向的慢漂幅度（px/s）
        SNOW_COUPLING: 0.55,      // 被水流带走的比例
        SNOW_FLICKER: 0.5,        // 闪烁深度（0 = 不闪）
        SNOW_MARGIN: 24,
        // 抽样自检
        SELF_CHECK_EVERY: 120,    // 每多少步检查一次场里有没有非有限数；有就清零（自愈，不抛错）
    });

    function gridOf(width, height) {
        const gw = clamp(Math.round(width / PARAMS.CELL_PX), PARAMS.GRID_MIN_W, PARAMS.GRID_MAX_W);
        const gh = clamp(Math.round(height / PARAMS.CELL_PX), PARAMS.GRID_MIN_H, PARAMS.GRID_MAX_H);
        return { gw, gh };
    }

    function snowCountFor(width, height) {
        return clamp(Math.round(width * height * PARAMS.SNOW_DENSITY), PARAMS.SNOW_MIN, PARAMS.SNOW_MAX);
    }

    function spawnSnow(s, n, anywhere) {
        const sn = s.snow;
        const r = s.random;
        sn.x[n] = r() * s.w;
        sn.y[n] = anywhere ? r() * s.h : -r() * s.h * 0.08;
        sn.z[n] = r();
        sn.phase[n] = r() * TAU;
        sn.rate[n] = 0.6 + r() * 1.4;           // 闪烁的快慢（弧度/秒）
    }

    function build(s, width, height) {
        s.w = width;
        s.h = height;
        const { gw, gh } = gridOf(width, height);
        s.gw = gw; s.gh = gh;
        s.cw = width / gw; s.ch = height / gh;
        const size = (gw + 2) * (gh + 2);
        s.u = new Float32Array(size); s.v = new Float32Array(size);
        s.u0 = new Float32Array(size); s.v0 = new Float32Array(size);
        s.p = new Float32Array(size); s.div = new Float32Array(size);
        s.dye = new Float32Array(size); s.dye0 = new Float32Array(size);
        const count = snowCountFor(width, height);
        s.snow = {
            count,
            x: new Float32Array(count), y: new Float32Array(count), z: new Float32Array(count),
            phase: new Float32Array(count), rate: new Float32Array(count),
        };
        for (let n = 0; n < count; n++) spawnSnow(s, n, true);
    }

    /** 新建状态。width/height 是画布像素；random 是 () => [0,1) 的随机数（缺省 Math.random）。非法尺寸返回 null。 */
    function create({ width = 1280, height = 720, random = Math.random } = {}) {
        if (!finite(width, height) || !(width >= PARAMS.MIN_SIZE) || !(height >= PARAMS.MIN_SIZE)) return null;
        const s = { random: typeof random === 'function' ? random : Math.random, time: 0, steps: 0, resets: 0, bursts: [], emitted: 0 };
        build(s, width, height);
        return s;
    }

    /** 画布尺寸变了：流场清零重建（染色与水流本来就只活几秒），海洋雪按比例挪到新位置，不重新随机（不闪一下）。 */
    function resize(s, width, height) {
        if (!s || !finite(width, height) || !(width >= PARAMS.MIN_SIZE) || !(height >= PARAMS.MIN_SIZE)) return false;
        if (width === s.w && height === s.h) return true;
        const kx = width / s.w, ky = height / s.h;
        const old = s.snow;
        build(s, width, height);
        const keep = Math.min(old.count, s.snow.count);
        for (let n = 0; n < keep; n++) {
            s.snow.x[n] = old.x[n] * kx; s.snow.y[n] = old.y[n] * ky;
            s.snow.z[n] = old.z[n]; s.snow.phase[n] = old.phase[n]; s.snow.rate[n] = old.rate[n];
        }
        s.bursts.length = 0;
        return true;
    }

    // ---------- 流体（Stam） ----------

    const at = (s, i, j) => i + (s.gw + 2) * j;

    /** 边界：b = 1 左右墙上的 u 取反，b = 2 上下墙上的 v 取反，b = 0 取邻居（压力与染色）。 */
    function setBnd(s, b, x) {
        const W = s.gw, H = s.gh, S = W + 2;
        for (let i = 1; i <= W; i++) {
            x[i] = b === 2 ? -x[i + S] : x[i + S];
            x[i + (H + 1) * S] = b === 2 ? -x[i + H * S] : x[i + H * S];
        }
        for (let j = 1; j <= H; j++) {
            x[j * S] = b === 1 ? -x[1 + j * S] : x[1 + j * S];
            x[W + 1 + j * S] = b === 1 ? -x[W + j * S] : x[W + j * S];
        }
        x[0] = 0.5 * (x[1] + x[S]);
        x[W + 1] = 0.5 * (x[W] + x[W + 1 + S]);
        x[(H + 1) * S] = 0.5 * (x[1 + (H + 1) * S] + x[H * S]);
        x[W + 1 + (H + 1) * S] = 0.5 * (x[W + (H + 1) * S] + x[W + 1 + H * S]);
    }

    /** 半拉格朗日对流：d[ij] 取自“沿速度倒推 dt 之前”的位置（双线性）。速度单位是格子/秒。 */
    function advect(s, b, d, d0, u, v, dt) {
        const W = s.gw, H = s.gh, S = W + 2;
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                let x = i - dt * u[k];
                let y = j - dt * v[k];
                x = x < 0.5 ? 0.5 : (x > W + 0.5 ? W + 0.5 : x);
                y = y < 0.5 ? 0.5 : (y > H + 0.5 ? H + 0.5 : y);
                const i0 = x | 0, j0 = y | 0;
                const sx = x - i0, sy = y - j0;
                const a = i0 + S * j0;
                d[k] = (1 - sx) * ((1 - sy) * d0[a] + sy * d0[a + S]) + sx * ((1 - sy) * d0[a + 1] + sy * d0[a + 1 + S]);
            }
        }
        setBnd(s, b, d);
    }

    /** 投影：把速度场改成无散度的（水不可压缩），否则水流会无故聚拢或散开。格子间距取 1。 */
    function project(s, u, v, p, div, iterations) {
        const W = s.gw, H = s.gh, S = W + 2;
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + S] - v[k - S]);
                p[k] = 0;
            }
        }
        setBnd(s, 0, div);
        setBnd(s, 0, p);
        for (let it = 0; it < iterations; it++) {
            for (let j = 1; j <= H; j++) {
                for (let i = 1; i <= W; i++) {
                    const k = i + S * j;
                    p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - S] + p[k + S]) * 0.25;
                }
            }
            setBnd(s, 0, p);
        }
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                u[k] -= 0.5 * (p[k + 1] - p[k - 1]);
                v[k] -= 0.5 * (p[k + S] - p[k - S]);
            }
        }
        setBnd(s, 1, u);
        setBnd(s, 2, v);
    }

    /**
     * 在 (cx, cy)（px）加一团高斯：速度向 (vx, vy)（px/s）靠拢 kf（0…1，本步的靠拢比例）、染色加 dyeAmount（积分量，会除以面积）。半径单位是格子。
     * 速度是“靠拢”而不是“叠加”：同一处被连续发射时稳定在目标值，不会逐步累积到上限。
     */
    function splat(s, cx, cy, radiusCells, vx, vy, dyeAmount, kf) {
        const gx = cx / s.cw + 0.5, gy = cy / s.ch + 0.5;       // 格子坐标：第 i 格（1…gw）的中心在 i
        const R = Math.max(0.6, radiusCells);
        const reach = Math.ceil(R * 2.2);
        const i0 = Math.max(1, Math.floor(gx - reach)), i1 = Math.min(s.gw, Math.ceil(gx + reach));
        const j0 = Math.max(1, Math.floor(gy - reach)), j1 = Math.min(s.gh, Math.ceil(gy + reach));
        if (i0 > i1 || j0 > j1) return;
        const ux = vx / s.cw, uy = vy / s.ch;
        const norm = 1 / (Math.PI * R * R);
        const S = s.gw + 2;
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const d2 = ((i - gx) * (i - gx) + (j - gy) * (j - gy)) / (R * R);
                if (d2 > 4.84) continue;
                const w = Math.exp(-d2);
                const k = i + S * j;
                s.u[k] += (ux - s.u[k]) * w * kf;
                s.v[k] += (uy - s.v[k]) * w * kf;
                s.dye[k] += dyeAmount * norm * w;
            }
        }
    }

    function validFish(f) {
        return !!f && finite(f.x, f.y, f.vx, f.vy, f.len) && f.len > 0 && (f.state === undefined || f.state === 'alive');
    }

    /** 本步的发射：大鱼的尾迹。返回发射了几条。 */
    function emitWakes(s, fish, dt) {
        if (!Array.isArray(fish) || !fish.length) return 0;
        const picks = [];
        for (const f of fish) {
            if (!validFish(f) || f.len < PARAMS.WAKE_MIN_LEN) continue;
            const speed = Math.hypot(f.vx, f.vy);
            if (!(speed >= PARAMS.WAKE_MIN_SPEED)) continue;
            picks.push({ f, speed });
        }
        picks.sort((a, b) => b.f.len - a.f.len);
        if (picks.length > PARAMS.MAX_EMITTERS) picks.length = PARAMS.MAX_EMITTERS;
        const cell = Math.min(s.cw, s.ch);
        const kf = 1 - Math.exp(-dt / PARAMS.FORCE_TAU_S);
        for (const { f, speed } of picks) {
            const hx = f.vx / speed, hy = f.vy / speed;
            const nx = -hy, ny = hx;
            const sway = Math.sin((Number.isFinite(f.phase) ? f.phase : 0) * PARAMS.SWAY_RATE * TAU);
            const alpha = Number.isFinite(f.alpha) ? clamp(f.alpha, 0, 1) : 1;
            const depth = lerp(0.35, 1, clamp(Number.isFinite(f.z) ? f.z : 1, 0, 1));
            const jet = PARAMS.JET * speed * alpha;
            const lat = PARAMS.SWAY * speed * sway * alpha;
            const radius = clamp(f.len * PARAMS.RADIUS_LEN / cell, 1.4, 4.5);
            const dye = PARAMS.DYE_LEVEL * Math.PI * radius * (speed / cell) * depth * alpha * dt;
            const tx = f.x - hx * f.len * PARAMS.WAKE_BACK;
            const ty = f.y - hy * f.len * PARAMS.WAKE_BACK;
            splat(s, tx, ty, radius, -hx * jet + nx * lat, -hy * jet + ny * lat, dye, kf);
        }
        return picks.length;
    }

    /** 捕食爆发（大鱼咬到小鱼的那一下）：中心向外推一圈、灌一团染色。排队到下一步处理；非法坐标忽略，排满了丢弃最旧的。 */
    function burst(s, x, y, strength = 1) {
        if (!s || !finite(x, y, strength) || strength <= 0) return false;
        if (s.bursts.length >= PARAMS.MAX_BURSTS) s.bursts.shift();
        s.bursts.push({ x, y, k: clamp(strength, 0.1, 3) });
        return true;
    }

    function applyBursts(s) {
        for (const b of s.bursts) {
            const R = 2.2;
            const gx = b.x / s.cw + 0.5, gy = b.y / s.ch + 0.5;
            const reach = Math.ceil(R * 2.4);
            const i0 = Math.max(1, Math.floor(gx - reach)), i1 = Math.min(s.gw, Math.ceil(gx + reach));
            const j0 = Math.max(1, Math.floor(gy - reach)), j1 = Math.min(s.gh, Math.ceil(gy + reach));
            const S = s.gw + 2;
            for (let j = j0; j <= j1; j++) {
                for (let i = i0; i <= i1; i++) {
                    const dx = i - gx, dy = j - gy;
                    const d2 = (dx * dx + dy * dy) / (R * R);
                    if (d2 > 5.76) continue;
                    const w = Math.exp(-d2);
                    const d = Math.sqrt(dx * dx + dy * dy) || 1;
                    const k = i + S * j;
                    s.u[k] += (dx / d) * PARAMS.BURST_SPEED * 6 * b.k * w;
                    s.v[k] += (dy / d) * PARAMS.BURST_SPEED * 6 * b.k * w;
                    s.dye[k] += PARAMS.BURST_DYE * b.k * w;
                }
            }
        }
        s.bursts.length = 0;
    }

    function selfCheck(s) {
        const arrays = [s.u, s.v, s.dye];
        for (const a of arrays) {
            for (let i = 0; i < a.length; i++) {
                if (!Number.isFinite(a[i])) {
                    s.u.fill(0); s.v.fill(0); s.dye.fill(0); s.p.fill(0); s.div.fill(0);
                    s.resets++;
                    return false;
                }
            }
        }
        return true;
    }

    /** 双线性取样（格子坐标 gx, gy：第 i 格中心在 i）。 */
    function sample(s, field, gx, gy) {
        const W = s.gw, H = s.gh, S = W + 2;
        const x = gx < 0.5 ? 0.5 : (gx > W + 0.5 ? W + 0.5 : gx);
        const y = gy < 0.5 ? 0.5 : (gy > H + 0.5 ? H + 0.5 : gy);
        const i0 = x | 0, j0 = y | 0;
        const sx = x - i0, sy = y - j0;
        const a = i0 + S * j0;
        return (1 - sx) * ((1 - sy) * field[a] + sy * field[a + S]) + sx * ((1 - sy) * field[a + 1] + sy * field[a + 1 + S]);
    }

    function parallax(z) { return lerp(0.55, 1.25, clamp(z, 0, 1)); }

    function stepSnow(s, dt, floorY, scale) {
        const sn = s.snow;
        const W = s.w;
        const bottom = Number.isFinite(floorY) ? clamp(floorY, s.h * 0.5, s.h) : s.h;
        const margin = PARAMS.SNOW_MARGIN * scale;
        for (let n = 0; n < sn.count; n++) {
            const par = parallax(sn.z[n]);
            const gx = sn.x[n] / s.cw + 0.5, gy = sn.y[n] / s.ch + 0.5;
            const inside = gx >= 0.5 && gx <= s.gw + 0.5 && gy >= 0.5 && gy <= s.gh + 0.5;
            const ux = inside ? sample(s, s.u, gx, gy) * s.cw : 0;
            const uy = inside ? sample(s, s.v, gx, gy) * s.ch : 0;
            const drift = Math.sin(s.time * 0.21 + sn.phase[n] * 3.1) * PARAMS.SNOW_DRIFT * scale * par;
            sn.x[n] += (ux * PARAMS.SNOW_COUPLING + drift) * dt;
            sn.y[n] += (PARAMS.SNOW_SINK * scale * par + uy * PARAMS.SNOW_COUPLING) * dt;
            if (sn.x[n] < -margin) sn.x[n] += W + 2 * margin;
            else if (sn.x[n] > W + margin) sn.x[n] -= W + 2 * margin;
            if (sn.y[n] > bottom) { spawnSnow(s, n, false); }
            else if (sn.y[n] < -margin * 2) sn.y[n] = bottom - 1;
        }
    }

    /**
     * 推进一步。dt 是秒（非有限或接近 0 时什么都不做；单步最长 50 ms）。
     * input = { fish?: [{ x, y, vx, vy, len, phase, z, alpha, state }], floorY?: number | null（水底的纵坐标 px，海洋雪沉到这里就回到顶部）, scale?: 视口缩放 }。
     * 返回这一步发射尾迹的鱼数（诊断用）。
     */
    function step(s, dt, input = {}) {
        if (!s || !Number.isFinite(dt) || dt < PARAMS.MIN_DT) return 0;
        const d = Math.min(dt, PARAMS.MAX_DT);
        const scale = input && Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1;
        s.time += d;
        s.steps++;
        if (s.bursts.length) applyBursts(s);
        const emitted = emitWakes(s, input && input.fish, d);
        s.emitted = emitted;
        // 水流：衰减 → 投影 → 对流 → 再投影（Stam 的顺序）；染色只对流与衰减
        const damp = Math.exp(-d / PARAMS.VEL_TAU_S);
        const W = s.gw, H = s.gh, S = W + 2;
        const umax = PARAMS.UMAX;
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                const uu = s.u[k] * damp, vv = s.v[k] * damp;
                s.u[k] = uu > umax ? umax : (uu < -umax ? -umax : uu);
                s.v[k] = vv > umax ? umax : (vv < -umax ? -umax : vv);
            }
        }
        project(s, s.u, s.v, s.p, s.div, PARAMS.ITER);
        s.u0.set(s.u); s.v0.set(s.v);
        advect(s, 1, s.u, s.u0, s.u0, s.v0, d);
        advect(s, 2, s.v, s.v0, s.u0, s.v0, d);
        project(s, s.u, s.v, s.p, s.div, PARAMS.ITER);
        s.dye0.set(s.dye);
        advect(s, 0, s.dye, s.dye0, s.u, s.v, d);
        const fade = Math.exp(-d / PARAMS.DYE_TAU_S);
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                const q = s.dye[k] * fade;
                s.dye[k] = q > PARAMS.DYE_MAX ? PARAMS.DYE_MAX : (q < 0.002 ? 0 : q);
            }
        }
        stepSnow(s, d, input && input.floorY, scale);
        if (s.steps % PARAMS.SELF_CHECK_EVERY === 0) selfCheck(s);
        return emitted;
    }

    /**
     * 把染色浓度写成 RGBA 纹理（gw × gh，一格一个像素）：浅青白色，alpha = 浓度映射（上限 maxAlpha，0…1）。
     * 返回有内容的格子包围盒 { i0, j0, i1, j1 }（0 起、含端点）；没有任何可见内容返回 null（调用方什么都不画）。
     * data 长度须至少 gw × gh × 4（Uint8ClampedArray 或同形数组）。
     */
    function dyeImage(s, data, maxAlpha = 0.34) {
        const W = s.gw, H = s.gh, S = W + 2;
        if (!data || data.length < W * H * 4) return null;
        const cap = clamp(maxAlpha, 0, 1);
        let i0 = W, j0 = H, i1 = -1, j1 = -1;
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const q = s.dye[(i + 1) + S * (j + 1)];
                const o = (i + W * j) * 4;
                if (q < 0.01) { data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 0; continue; }
                const a = cap * (1 - Math.exp(-q * 1.6));
                data[o] = 200; data[o + 1] = 232; data[o + 2] = 255; data[o + 3] = Math.round(a * 255);
                if (data[o + 3] === 0) continue;
                if (i < i0) i0 = i;
                if (i > i1) i1 = i;
                if (j < j0) j0 = j;
                if (j > j1) j1 = j;
            }
        }
        return i1 < 0 ? null : { i0, j0, i1, j1 };
    }

    /**
     * 海洋雪某一粒当前的画法参数：{ x, y, z, size, alpha }（size 单位 px，已乘缩放；alpha 0…1，闪烁已算入）。night 0…1：夜里略暗。
     * out 可传一个复用的对象（每帧几百粒，免得逐粒分配）；缺省时新建。
     */
    function snowDot(s, n, scale = 1, night = 0, out) {
        const sn = s.snow;
        const z = sn.z[n];
        const flicker = 1 - PARAMS.SNOW_FLICKER * (0.5 - 0.5 * Math.sin(s.time * sn.rate[n] + sn.phase[n]));
        const base = lerp(0.10, 0.46, z) * flicker * lerp(1, 0.7, clamp(night, 0, 1));
        const o = out || {};
        o.x = sn.x[n]; o.y = sn.y[n]; o.z = z; o.size = lerp(0.7, 1.8, z) * scale; o.alpha = clamp(base, 0, 1);
        return o;
    }

    /** 诊断：{ gw, gh, maxSpeed（格子/秒）, dye（总浓度）, snow, finite }。 */
    function stats(s) {
        let maxSpeed = 0, dye = 0, ok = true;
        const W = s.gw, H = s.gh, S = W + 2;
        for (let j = 1; j <= H; j++) {
            for (let i = 1; i <= W; i++) {
                const k = i + S * j;
                const sp = Math.hypot(s.u[k], s.v[k]);
                if (!Number.isFinite(sp) || !Number.isFinite(s.dye[k])) { ok = false; continue; }
                if (sp > maxSpeed) maxSpeed = sp;
                dye += s.dye[k];
            }
        }
        return { gw: s.gw, gh: s.gh, maxSpeed, dye, snow: s.snow.count, finite: ok, resets: s.resets, steps: s.steps };
    }

    return Object.freeze({ PARAMS, create, resize, step, burst, dyeImage, snowDot, stats, gridOf, snowCountFor, sample });
});
