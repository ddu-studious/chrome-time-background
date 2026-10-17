(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ClockLiquidCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 液态时钟的纯模拟与渲染（无 DOM 依赖，Node 可测）。设计见
    // docs/technical/touch-feel-weave-liquid-clock-20261014.md。
    //
    // 两个场叠加在时钟文字上：
    //   1. 高度场 h：阻尼波动方程 v += k·(Σ邻居 − 4h)；v *= damping；h += v，边界渐进吸收，产生涟漪与折射。
    //   2. 涂抹场 (sx, sy)：鼠标划过时把文字推着走，每步指数衰减并轻微扩散，这是“划坏”的主要来源。
    // 两者都会自己衰减到 0，所以“停手后自动恢复”不需要任何额外的复位动作。

    const PARAMS = Object.freeze({
        k: 0.2,              // 波速平方（≤0.5 时二维显式格式稳定）
        damping: 0.986,      // 速度每步保留比例
        leak: 0.004,         // 回复力：把整体下陷的“平台”也拉回水平（均匀下陷没有梯度，光靠扩散要十几秒）；对 10 格以内的波长影响 < 5%
        tailPeak: 0.2,       // 能量低于它时涟漪已经几乎看不见：改用更大的阻尼尽快收尾，省掉整块画布逐帧重绘的长尾
        tailDamping: 0.95,
        smearDecay: 0.952,   // 涂抹每步保留比例（60fps 下约 1.3 秒衰减到 1/10）
        smearDiffuse: 0.1,   // 涂抹向邻格扩散的比例（小一些，相邻区域位移差别大，才有“撕开”的感觉）
        smearRadius: 4.5,    // 一次推动影响的半径（格，1 格 = 3 CSS px）：与笔画粗细相当，字形会被撕扯而不是整体平移
        splashRadius: 4,
        brushGrowth: 0.85,   // 快速划动时半径最多再放大这么多倍（0.85 → 最大 1.85 倍）
        border: 7,           // 边界吸收带宽度（格）
        maxHeight: 3,
        maxSmear: 64,        // CSS px
        settleEps: 0.025,    // 低于它时高光不到 3% 白，已经分辨不出
    });

    const BLOCKING_BODY_CLASSES = Object.freeze([
        'bili-panel-open', 'youtube-workbench-open', 'huya-workbench-open', 'v5-focus-open',
    ]);

    function createField(cols, rows) {
        const columns = Math.max(3, Math.floor(cols));
        const lines = Math.max(3, Math.floor(rows));
        const size = columns * lines;
        const absorb = new Float32Array(size);
        for (let y = 0; y < lines; y++) {
            for (let x = 0; x < columns; x++) {
                const edge = Math.min(x, y, columns - 1 - x, lines - 1 - y);
                const t = Math.min(1, edge / PARAMS.border);
                // 越靠边阻尼越大：0.82（贴边）→ 1（带内）。
                absorb[y * columns + x] = 0.82 + 0.18 * t * t;
            }
        }
        return {
            cols: columns, rows: lines,
            h: new Float32Array(size), v: new Float32Array(size),
            sx: new Float32Array(size), sy: new Float32Array(size),
            tx: new Float32Array(size), ty: new Float32Array(size),
            absorb, peak: 0,
        };
    }

    function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }

    function bump(field, cx, cy, radius, apply) {
        const { cols, rows } = field;
        const x0 = Math.max(1, Math.floor(cx - radius));
        const x1 = Math.min(cols - 2, Math.ceil(cx + radius));
        const y0 = Math.max(1, Math.floor(cy - radius));
        const y1 = Math.min(rows - 2, Math.ceil(cy + radius));
        const r2 = radius * radius;
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const dx = x - cx, dy = y - cy;
                const d2 = dx * dx + dy * dy;
                if (d2 >= r2) continue;
                const w = 1 - d2 / r2;
                apply(y * cols + x, w * w);
            }
        }
    }

    // 在 (cx, cy)（格坐标）压下一个水坑；amount 为负是凹陷。
    function splash(field, cx, cy, radius, amount) {
        const h = field.h;
        bump(field, cx, cy, radius, (i, w) => {
            h[i] = clamp(h[i] + amount * w, -PARAMS.maxHeight, PARAMS.maxHeight);
        });
    }

    // 以 (px, py)（CSS px）推动文字。
    function smear(field, cx, cy, radius, px, py) {
        const { sx, sy } = field;
        bump(field, cx, cy, radius, (i, w) => {
            sx[i] = clamp(sx[i] + px * w, -PARAMS.maxSmear, PARAMS.maxSmear);
            sy[i] = clamp(sy[i] + py * w, -PARAMS.maxSmear, PARAMS.maxSmear);
        });
    }

    // 前进一步，返回当前峰值（用于判定是否已恢复）。
    function step(field, params = PARAMS) {
        const { cols, rows, h, v, absorb } = field;
        const k = params.k, leak = params.leak;
        // 上一步的峰值已经很小就用更大的阻尼（初始 peak 为 0 时第一步也走尾部阻尼，影响可以忽略）。
        const damping = field.peak < params.tailPeak ? params.tailDamping : params.damping;
        let peak = 0;
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const i = y * cols + x;
                const lap = h[i - 1] + h[i + 1] + h[i - cols] + h[i + cols] - 4 * h[i];
                v[i] = (v[i] + k * lap - leak * h[i]) * damping * absorb[i];
            }
        }
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const i = y * cols + x;
                h[i] += v[i];
                const a = Math.abs(h[i]) + Math.abs(v[i]) * 4;
                if (a > peak) peak = a;
            }
        }
        const { sx, sy, tx, ty } = field;
        const d = params.smearDiffuse, decay = params.smearDecay;
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const i = y * cols + x;
                const ax = (sx[i - 1] + sx[i + 1] + sx[i - cols] + sx[i + cols]) * 0.25;
                const ay = (sy[i - 1] + sy[i + 1] + sy[i - cols] + sy[i + cols]) * 0.25;
                tx[i] = (sx[i] + d * (ax - sx[i])) * decay;
                ty[i] = (sy[i] + d * (ay - sy[i])) * decay;
                const s = (Math.abs(tx[i]) + Math.abs(ty[i])) * 0.04;
                if (s > peak) peak = s;
            }
        }
        field.sx = tx; field.tx = sx;
        field.sy = ty; field.ty = sy;
        field.peak = peak;
        return peak;
    }

    function isSettled(field, eps = PARAMS.settleEps) {
        return field.peak < eps;
    }

    // 鼠标是否落在文字区域（可外扩 margin）。
    function insideRect(rect, x, y, margin = 0) {
        return !!rect && x >= rect.left - margin && x <= rect.right + margin
            && y >= rect.top - margin && y <= rect.bottom + margin;
    }

    // 鼠标是否落在文字块所在的横带里：只看纵向（可外扩 margin），横向不限。
    // 液态时钟的画布横向铺满整个视口，所以在时钟那一行的任何横向位置划过都算“划到了”。
    function insideBand(rect, y, margin = 0) {
        return !!rect && y >= rect.top - margin && y <= rect.bottom + margin;
    }

    // 启动门槛：过慢的悬停不应把时钟弄坏。
    function shouldWake(distance, elapsedMs) {
        if (!(elapsedMs > 0)) return false;
        return distance >= 4 && distance / elapsedMs >= 0.22;
    }

    function blockedByBody(classList) {
        return BLOCKING_BODY_CLASSES.some(name => classList?.contains?.(name));
    }

    // 笔刷半径随划动速度变大：慢慢划只是一道细痕，快速甩过去会搅动一大片（1 px/ms ≈ 1000 px/s）。
    function brushFor(speed) {
        const grow = clamp(speed / 2.4, 0, 1);
        return {
            smear: PARAMS.smearRadius * (1 + PARAMS.brushGrowth * grow),
            splash: PARAMS.splashRadius * (1 + PARAMS.brushGrowth * grow),
        };
    }

    // 由一次鼠标移动得到“推力”“水坑深度”和笔刷半径。dt 限制在 8–48 ms，避免长间隔产生巨大推力。
    function impulseFromMove(dx, dy, elapsedMs) {
        const dt = clamp(elapsedMs, 8, 48);
        const speed = Math.hypot(dx, dy) / dt;           // px / ms
        const gain = clamp(16 / dt, 0.35, 2);            // 事件越密，每次推力越小
        const brush = brushFor(speed);
        return {
            px: clamp(dx * 1.1 * gain, -PARAMS.maxSmear, PARAMS.maxSmear),
            py: clamp(dy * 1.1 * gain, -PARAMS.maxSmear, PARAMS.maxSmear),
            depth: -clamp(0.32 + speed * 0.6, 0.32, 1.4) * Math.min(1, gain),
            speed,
            smearRadius: brush.smear,
            splashRadius: brush.splash,
        };
    }

    // 每格的位移 (ox, oy)、高光 hi、暗边 lo 与“是否活跃”标记，以及活跃格的包围盒和本帧最大位移。render 与 renderLayers 共用。
    // 偏移 = 涂抹 + 折射（由高度梯度）；高光与暗边也来自梯度。
    // act：位移或高光任一可见；actD：只看位移（文字层只关心文字被推到哪里，高光由涟漪层负责）。
    // 每帧都分配这些场大小的数组会制造大量垃圾（60 fps 下约 30 MB/s），所以挂在 field 上复用。
    // 边界一圈从不写入，始终是 0；内部每帧完整重写，不需要清零。
    function prepare(field, scale, opts) {
        const refract = (opts.refract ?? 20) * scale;
        const specGain = opts.spec ?? 7;
        const rimGain = opts.rim ?? 2.8;
        const { cols, rows, h, sx, sy } = field;
        const cell = cols * rows;
        const m = field.scratch && field.scratch.cell === cell ? field.scratch : (field.scratch = {
            cell,
            ox: new Float32Array(cell), oy: new Float32Array(cell),
            hi: new Float32Array(cell), lo: new Float32Array(cell),
            act: new Uint8Array(cell), actD: new Uint8Array(cell),
            // 逐像素行把相邻两行格先混合成一行，像素循环只剩横向两点插值
            rOx: new Float32Array(cols), rOy: new Float32Array(cols),
            rHi: new Float32Array(cols), rLo: new Float32Array(cols),
            rAct: new Uint8Array(cols), rActD: new Uint8Array(cols),
            colWidth: 0, colX0: null, colFx: null,
            minCx: 0, maxCx: -1, minCy: 0, maxCy: -1,          // act 的包围盒
            dMinCx: 0, dMaxCx: -1, dMinCy: 0, dMaxCy: -1,      // actD 的包围盒
            maxOx: 0, maxOy: 0, anyH: false,
            layers: { rect: null, ripple: false }, rect: { x0: 0, y0: 0, x1: 0, y1: 0 },
        });
        const { ox, oy, hi, lo, act, actD } = m;
        const lx = -0.62, ly = -0.78;
        let minCx = cols, maxCx = -1, minCy = rows, maxCy = -1;
        let dMinCx = cols, dMaxCx = -1, dMinCy = rows, dMaxCy = -1;
        let maxOx = 0, maxOy = 0, anyH = false;
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1; x < cols - 1; x++) {
                const i = y * cols + x;
                const gx = (h[i + 1] - h[i - 1]) * 0.5;
                const gy = (h[i + cols] - h[i - cols]) * 0.5;
                const mag = Math.hypot(gx, gy);
                const light = gx * lx + gy * ly;
                const dx = sx[i] * scale + gx * refract;
                const dy = sy[i] * scale + gy * refract;
                const hi_ = clamp(light * specGain, 0, 1) + clamp(mag * rimGain, 0, 0.5) * 0.5;
                const lo_ = clamp(-light * specGain, 0, 1);
                ox[i] = dx; oy[i] = dy; hi[i] = Math.min(1, hi_); lo[i] = lo_;
                const adx = dx < 0 ? -dx : dx, ady = dy < 0 ? -dy : dy;
                if (adx > maxOx) maxOx = adx;
                if (ady > maxOy) maxOy = ady;
                const moved = adx + ady > 0.12;
                const lit = hi_ > 0.012 || lo_ > 0.012;
                if (lit) anyH = true;
                if (moved) {
                    actD[i] = 1;
                    if (x < dMinCx) dMinCx = x;
                    if (x > dMaxCx) dMaxCx = x;
                    if (y < dMinCy) dMinCy = y;
                    if (y > dMaxCy) dMaxCy = y;
                } else {
                    actD[i] = 0;
                }
                if (moved || lit) {
                    act[i] = 1;
                    if (x < minCx) minCx = x;
                    if (x > maxCx) maxCx = x;
                    if (y < minCy) minCy = y;
                    if (y > maxCy) maxCy = y;
                } else {
                    act[i] = 0;
                }
            }
        }
        m.minCx = minCx; m.maxCx = maxCx; m.minCy = minCy; m.maxCy = maxCy;
        m.dMinCx = dMinCx; m.dMaxCx = dMaxCx; m.dMinCy = dMinCy; m.dMaxCy = dMaxCy;
        m.maxOx = maxOx; m.maxOy = maxOy; m.anyH = anyH;
        return m;
    }

    // 像素列 → 格列与横向权重（f = (x + .5) / cw − .5）；只与宽度和列数有关，按场缓存。
    function columns(m, width, cols) {
        if (m.colWidth !== width) {
            const cw = width / cols;
            const colX0 = new Int32Array(width), colFx = new Float32Array(width);
            for (let x = 0; x < width; x++) {
                const f = clamp((x + 0.5) / cw - 0.5, 0, cols - 1.0001);
                colX0[x] = Math.floor(f); colFx[x] = f - colX0[x];
            }
            m.colX0 = colX0; m.colFx = colFx; m.colWidth = width;
        }
        return m;
    }

    /**
     * 渲染一帧（单层参考实现）。src / dst 是同尺寸（width×height，设备像素）的 RGBA 字节数组（非预乘），
     * 场铺满整幅图。opts.scale = 设备像素 / CSS 像素。
     * 静止的格直接复制，活跃的才做双线性取样；文字与高光暗边在同一个循环里算完。
     * 控制器用的是下面的 renderLayers（文字与涟漪分两层，整幅铺满时快得多）；这个实现保留为逐像素的参照，测试用它核对分层结果。
     */
    function render(field, src, dst, width, height, opts = {}) {
        const scale = opts.scale || 1;
        const { cols, rows } = field;
        const m = prepare(field, scale, opts);
        const { ox, oy, hi, lo, act, rOx, rOy, rHi, rLo, rAct, minCx, maxCx, minCy, maxCy } = m;

        const src32 = new Uint32Array(src.buffer, src.byteOffset, width * height);
        const dst32 = new Uint32Array(dst.buffer, dst.byteOffset, width * height);
        dst32.set(src32);
        if (maxCx < 0) return;                       // 整个场都静止：就是源图
        const cw = width / cols, ch = height / rows;
        const { colX0, colFx } = columns(m, width, cols);
        // 像素 x 的取样用到格 floor(f) 与 floor(f)+1，其中 f = (x + .5) / cw − .5；反推受活跃格影响的像素范围，再外扩 2 px。
        const xStart = Math.max(0, Math.floor((minCx - 1 + 0.5) * cw - 0.5) - 2);
        const xEnd = Math.min(width - 1, Math.ceil((maxCx + 1 + 0.5) * cw - 0.5) + 2);
        const yStart = Math.max(0, Math.floor((minCy - 1 + 0.5) * ch - 0.5) - 2);
        const yEnd = Math.min(height - 1, Math.ceil((maxCy + 1 + 0.5) * ch - 0.5) + 2);

        const cxLo = colX0[xStart], cxHi = Math.min(cols - 1, colX0[xEnd] + 1);
        const maxU = width - 1.001, maxV = height - 1.001;
        const rowBytes = width * 4;
        for (let y = yStart; y <= yEnd; y++) {
            const fy = clamp((y + 0.5) / ch - 0.5, 0, rows - 1.0001);
            const y0 = Math.floor(fy), wy = fy - y0, iy = 1 - wy;
            const row0 = y0 * cols, row1 = row0 + cols;
            for (let cx = cxLo; cx <= cxHi; cx++) {
                const a = row0 + cx, b = row1 + cx;
                rOx[cx] = ox[a] * iy + ox[b] * wy;
                rOy[cx] = oy[a] * iy + oy[b] * wy;
                rHi[cx] = hi[a] * iy + hi[b] * wy;
                rLo[cx] = lo[a] * iy + lo[b] * wy;
                rAct[cx] = act[a] | act[b];
            }
            for (let x = xStart; x <= xEnd; x++) {
                const c0 = colX0[x], c1 = c0 + 1;
                if ((rAct[c0] | rAct[c1]) === 0) continue;                  // 已经是源像素
                const wx = colFx[x], ix = 1 - wx;
                const dX = rOx[c0] * ix + rOx[c1] * wx;
                const dY = rOy[c0] * ix + rOy[c1] * wx;
                const hiv = rHi[c0] * ix + rHi[c1] * wx;
                const lov = rLo[c0] * ix + rLo[c1] * wx;

                // 在 (x - dX, y - dY) 处按预乘 alpha 做双线性取样。
                const u = clamp(x - dX, 0, maxU), vv = clamp(y - dY, 0, maxV);
                const u0 = u | 0, v0 = vv | 0;
                const p00 = v0 * rowBytes + u0 * 4, p10 = p00 + 4, p01 = p00 + rowBytes, p11 = p01 + 4;
                const wa = hiv * 0.62, ba = lov * 0.38;
                const o = (y * width + x) * 4;

                if ((src[p00 + 3] | src[p10 + 3] | src[p01 + 3] | src[p11 + 3]) === 0) {
                    // 四个取样点都完全透明（字外的大片区域）：只剩白色高光与黑色暗边，三个通道相同。
                    const C = wa * (1 - ba);
                    const A = wa * (1 - ba) + ba;
                    if (A <= 0.002) {
                        dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 0;
                    } else {
                        const v = Math.min(255, (C / A) * 255 + 0.5);
                        dst[o] = v; dst[o + 1] = v; dst[o + 2] = v;
                        dst[o + 3] = Math.min(255, A * 255 + 0.5);
                    }
                    continue;
                }

                const fu = u - u0, fv = vv - v0;
                const s00 = (1 - fu) * (1 - fv), s10 = fu * (1 - fv), s01 = (1 - fu) * fv, s11 = fu * fv;
                const a00 = src[p00 + 3] * s00, a10 = src[p10 + 3] * s10, a01 = src[p01 + 3] * s01, a11 = src[p11 + 3] * s11;
                let A = (a00 + a10 + a01 + a11) / 255;
                let R = (src[p00] * a00 + src[p10] * a10 + src[p01] * a01 + src[p11] * a11) / 255 / 255;
                let G = (src[p00 + 1] * a00 + src[p10 + 1] * a10 + src[p01 + 1] * a01 + src[p11 + 1] * a11) / 255 / 255;
                let B = (src[p00 + 2] * a00 + src[p10 + 2] * a10 + src[p01 + 2] * a01 + src[p11 + 2] * a11) / 255 / 255;

                // 先叠白色高光，再叠黑色暗边（均为预乘合成）。
                R = R * (1 - wa) + wa; G = G * (1 - wa) + wa; B = B * (1 - wa) + wa; A = A * (1 - wa) + wa;
                R *= 1 - ba; G *= 1 - ba; B *= 1 - ba; A = A * (1 - ba) + ba;

                if (A <= 0.002) {
                    dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; dst[o + 3] = 0;
                } else {
                    const k = 255 / A;
                    dst[o] = Math.min(255, R * k + 0.5);
                    dst[o + 1] = Math.min(255, G * k + 0.5);
                    dst[o + 2] = Math.min(255, B * k + 0.5);
                    dst[o + 3] = Math.min(255, A * 255 + 0.5);
                }
            }
        }
    }

    // ---- 分层渲染 ------------------------------------------------------------------------------------
    // 画布横向铺满视口后，单层 render() 在 2 倍屏上每帧约 20 ms（旧的窄画布约 6 ms）：整幅逐像素取样，其中约 80% 是
    // 远离文字、只有高光与暗边的像素。高光与暗边本来就是 3 CSS px 一格的平滑场，没必要按设备像素逐点算，所以拆成两层：
    //   · 文字层：只在“文字包围盒 + 本帧最大位移”这块近区里逐像素取样（成本与旧的窄画布相当，与视口宽度无关）；
    //   · 涟漪层：一格一个像素（cols×rows），由调用方用 drawImage 双线性放大铺满画布（浏览器里由 GPU 做）。
    // 涟漪层按“白色高光再叠黑色暗边”的预乘合成直接存成非预乘 RGBA；放大后盖在文字层上，与 render() 的“先叠高光再叠暗边”等价
    // （预乘 over 满足结合律），差别只来自 8 位量化和“位移不足 0.12 px 的格子文字层不取样”。

    // 整幅图里 alpha>0 像素的外接矩形（设备像素，right / bottom 为开区间），没有任何文字返回 null。
    // 文字层只在它附近取样：文字（重新）绘制后扫一次，不逐帧做。
    // 2 倍屏整幅扫描热身后不到 1 ms；真实 Chromium 里第一次调用约 3–5 ms 是代码尚未优化，不是循环本身
    // （实测改成按 32 位字读取只快约 15%，不值得为此引入端序判断）。
    function textBounds(src, width, height) {
        let top = -1, bottom = -1, left = width, right = -1;
        const stride = width * 4;
        for (let y = 0; y < height; y++) {
            const row = y * stride + 3;
            let first = -1;
            for (let x = 0; x < width; x++) {
                if (src[row + x * 4] !== 0) { first = x; break; }
            }
            if (first < 0) continue;
            let last = first;
            for (let x = width - 1; x > first; x--) {
                if (src[row + x * 4] !== 0) { last = x; break; }
            }
            if (top < 0) top = y;
            bottom = y;
            if (first < left) left = first;
            if (last > right) right = last;
        }
        return top < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
    }

    // 涟漪层：每格一个像素（非预乘 RGBA，cols×rows），公式与 render() 在透明源上的高光/暗边完全相同。
    // 没有任何格子的高光/暗边可见时返回 false 且不碰缓冲区；否则整幅重写（包括最外一圈，不依赖缓冲区原有内容）。
    function buildRipple(field, m, ripple) {
        if (!m.anyH) return false;
        const { cols, rows } = field;
        const { hi, lo } = m;
        const out32 = new Uint32Array(ripple.buffer, ripple.byteOffset, cols * rows);
        out32.fill(0, 0, cols);
        out32.fill(0, (rows - 1) * cols, rows * cols);
        for (let y = 1; y < rows - 1; y++) {
            const row = y * cols;
            out32[row] = 0;
            out32[row + cols - 1] = 0;
            for (let x = 1; x < cols - 1; x++) {
                const i = row + x;
                const a = hi[i], b = lo[i];
                if (!(a > 0.012 || b > 0.012)) { out32[i] = 0; continue; }
                const wa = a * 0.62, ba = b * 0.38;
                const C = wa * (1 - ba);
                const A = wa * (1 - ba) + ba;
                if (A <= 0.002) { out32[i] = 0; continue; }
                const v = Math.min(255, (C / A) * 255 + 0.5);
                const o = i * 4;
                ripple[o] = v; ripple[o + 1] = v; ripple[o + 2] = v;
                ripple[o + 3] = Math.min(255, A * 255 + 0.5);
            }
        }
        return true;
    }

    // 文字层：只含被位移推过的文字，不含高光/暗边。返回写入的近区矩形（含端点），没有文字时返回 null。
    // bounds === undefined：不限范围，近区就是整幅（测试里当参照用）；bounds 为 null 或空矩形：没有文字。
    function buildText(field, m, src, text, width, height, bounds) {
        const { cols, rows } = field;
        const moving = m.dMaxCx >= 0;
        let nx0 = 0, ny0 = 0, nx1 = width - 1, ny1 = height - 1;
        if (bounds !== undefined) {
            if (!bounds || !(bounds.right > bounds.left && bounds.bottom > bounds.top)) return null;
            // 取样点离目标像素最远 maxOx / maxOy，双线性再多取 1 px，外加 1 px 余量：近区之外的像素取样不到任何文字。
            const mx = moving ? Math.ceil(m.maxOx) + 2 : 0;
            const my = moving ? Math.ceil(m.maxOy) + 2 : 0;
            nx0 = Math.max(0, Math.floor(bounds.left) - mx);
            nx1 = Math.min(width - 1, Math.ceil(bounds.right) - 1 + mx);
            ny0 = Math.max(0, Math.floor(bounds.top) - my);
            ny1 = Math.min(height - 1, Math.ceil(bounds.bottom) - 1 + my);
            if (nx0 > nx1 || ny0 > ny1) return null;
        }

        // 近区先整块复制源图：没被推动的像素就是源像素。
        const src32 = new Uint32Array(src.buffer, src.byteOffset, width * height);
        const text32 = new Uint32Array(text.buffer, text.byteOffset, width * height);
        const span = nx1 - nx0 + 1;
        for (let y = ny0; y <= ny1; y++) {
            const a = y * width + nx0;
            text32.set(src32.subarray(a, a + span), a);
        }

        if (moving) {
            const cw = width / cols, ch = height / rows;
            const { colX0, colFx } = columns(m, width, cols);
            const { ox, oy, actD, rOx, rOy, rActD } = m;
            // 像素 x 的取样用到格 floor(f) 与 floor(f)+1，其中 f = (x + .5) / cw − .5；反推受位移格影响的像素范围，再外扩 2 px。
            const xStart = Math.max(nx0, Math.floor((m.dMinCx - 1 + 0.5) * cw - 0.5) - 2);
            const xEnd = Math.min(nx1, Math.ceil((m.dMaxCx + 1 + 0.5) * cw - 0.5) + 2);
            const yStart = Math.max(ny0, Math.floor((m.dMinCy - 1 + 0.5) * ch - 0.5) - 2);
            const yEnd = Math.min(ny1, Math.ceil((m.dMaxCy + 1 + 0.5) * ch - 0.5) + 2);
            if (xStart <= xEnd && yStart <= yEnd) {
                const cxLo = colX0[xStart], cxHi = Math.min(cols - 1, colX0[xEnd] + 1);
                const maxU = width - 1.001, maxV = height - 1.001;
                const rowBytes = width * 4;
                for (let y = yStart; y <= yEnd; y++) {
                    const fy = clamp((y + 0.5) / ch - 0.5, 0, rows - 1.0001);
                    const y0 = Math.floor(fy), wy = fy - y0, iy = 1 - wy;
                    const row0 = y0 * cols, row1 = row0 + cols;
                    for (let cx = cxLo; cx <= cxHi; cx++) {
                        const a = row0 + cx, b = row1 + cx;
                        rOx[cx] = ox[a] * iy + ox[b] * wy;
                        rOy[cx] = oy[a] * iy + oy[b] * wy;
                        rActD[cx] = actD[a] | actD[b];
                    }
                    for (let x = xStart; x <= xEnd; x++) {
                        const c0 = colX0[x], c1 = c0 + 1;
                        if ((rActD[c0] | rActD[c1]) === 0) continue;                  // 没被推动：就是已复制的源像素
                        const wx = colFx[x], ix = 1 - wx;
                        const dX = rOx[c0] * ix + rOx[c1] * wx;
                        const dY = rOy[c0] * ix + rOy[c1] * wx;

                        // 在 (x - dX, y - dY) 处按预乘 alpha 做双线性取样。
                        const u = clamp(x - dX, 0, maxU), vv = clamp(y - dY, 0, maxV);
                        const u0 = u | 0, v0 = vv | 0;
                        const p00 = v0 * rowBytes + u0 * 4, p10 = p00 + 4, p01 = p00 + rowBytes, p11 = p01 + 4;
                        const o = (y * width + x) * 4;
                        if ((src[p00 + 3] | src[p10 + 3] | src[p01 + 3] | src[p11 + 3]) === 0) {
                            text32[y * width + x] = 0;                                // 四个取样点都完全透明：这里没有文字了
                            continue;
                        }
                        const fu = u - u0, fv = vv - v0;
                        const s00 = (1 - fu) * (1 - fv), s10 = fu * (1 - fv), s01 = (1 - fu) * fv, s11 = fu * fv;
                        const a00 = src[p00 + 3] * s00, a10 = src[p10 + 3] * s10, a01 = src[p01 + 3] * s01, a11 = src[p11 + 3] * s11;
                        const A = (a00 + a10 + a01 + a11) / 255;
                        if (A <= 0.002) {
                            text[o] = 0; text[o + 1] = 0; text[o + 2] = 0; text[o + 3] = 0;
                        } else {
                            const R = (src[p00] * a00 + src[p10] * a10 + src[p01] * a01 + src[p11] * a11) / 255 / 255;
                            const G = (src[p00 + 1] * a00 + src[p10 + 1] * a10 + src[p01 + 1] * a01 + src[p11 + 1] * a11) / 255 / 255;
                            const B = (src[p00 + 2] * a00 + src[p10 + 2] * a10 + src[p01 + 2] * a01 + src[p11 + 2] * a11) / 255 / 255;
                            const k = 255 / A;
                            text[o] = Math.min(255, R * k + 0.5);
                            text[o + 1] = Math.min(255, G * k + 0.5);
                            text[o + 2] = Math.min(255, B * k + 0.5);
                            text[o + 3] = Math.min(255, A * 255 + 0.5);
                        }
                    }
                }
            }
        }

        const rect = m.rect;
        rect.x0 = nx0; rect.y0 = ny0; rect.x1 = nx1; rect.y1 = ny1;
        return rect;
    }

    /**
     * 分层渲染一帧（控制器用）。
     *   src：源文字（width×height，设备像素，非预乘 RGBA），text：文字层缓冲区（同尺寸），ripple：涟漪层缓冲区（cols×rows，非预乘 RGBA）。
     *   opts.scale = 设备像素 / CSS 像素；opts.textBounds = textBounds(src, …) 的结果（null = 没有文字；省略 = 不限范围，整幅都算）。
     * 返回 { rect, ripple }：
     *   rect：文字层写入的矩形 {x0, y0, x1, y1}（含端点，设备像素），缓冲区里这块之外的内容无效（不要上传）；没有文字时为 null；
     *   ripple：涟漪层是否有可见内容（false 时缓冲区内容无效，不要画）。
     * 返回的对象与 rect 都是复用的，下一次调用会被改写，调用方应当即读取。
     */
    function renderLayers(field, src, text, ripple, width, height, opts = {}) {
        const m = prepare(field, opts.scale || 1, opts);
        const layers = m.layers;
        layers.ripple = buildRipple(field, m, ripple);
        layers.rect = buildText(field, m, src, text, width, height, opts.textBounds);
        return layers;
    }

    return {
        PARAMS, BLOCKING_BODY_CLASSES,
        createField, splash, smear, step, isSettled, insideRect, insideBand, shouldWake,
        blockedByBody, brushFor, impulseFromMove, render, textBounds, renderLayers,
    };
});
