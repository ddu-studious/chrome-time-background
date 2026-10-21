(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumWaterCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水体层的纯逻辑（不碰 DOM、WebGL、Date 与存储，随机数没有）：内部画布尺寸、帧率节流、着色器时间、潮汐与浪的时间线、uniform 取值。
    // 着色器源码在 aquarium-water-shader.js，控制器与 WebGL 在 aquarium-water.js。设计与取舍见 docs/technical/aquarium-water-20261019.md 与 aquarium-shore-20261020.md。

    const PARAMS = Object.freeze({
        SCALE: 0.5,             // 内部画布边长 / 页面边长：水光全是低频内容，半分辨率放大看不出差别，像素数只有四分之一
        SCALE_LOW: 0.3,         // 省流量
        MAX_PIXELS: 300000,     // 内部画布像素上限：超大屏（5K/8K）按它再缩，GPU 成本不随屏幕无限增长（只有一条带子，约为整页的三分之一）
        MIN_SIDE: 48,
        FPS: 30,                // 浪的运动缓慢，30 帧足够；宿主循环更快时隔帧跳过，画布保持上一帧
        FPS_LOW: 15,
        TIME_WRAP: 21600,       // 着色器时间（秒）每 6 小时回绕一次，保住 float32 精度；潮汐、浪、一组浪与横向起伏的周期都是它的约数，回绕那一刻水线连续（泡沫纹理的滚动没有这个保证：每 6 小时会跳一下，纯装饰）
        AMOUNT_BASE: 0.25,      // 设置里的“强度”10–100% 映射到着色器总亮度：0.25 + 0.75 × 强度
        AMOUNT_SPAN: 0.75,
        // 岸线冲刷（2026-10-20，用户选的“底部岸线冲刷”：像站在水里看海浪拍沙滩；取代 2026-10-19 顶部的“水线潮汐”）。
        // 全是时间的确定函数，没有随机数；着色器与鱼的避让共用同一份数字。高度都是页面高度的比例，从页面底边往上量。
        //  海水层只占页面底部一条 BAND 高的带子（画布也只有这么大，带子之外没有任何像素，壁纸不会被遮）；
        //  潮位：水线“退得最远”时的高度 TOP = TOP_MID ± TIDE_AMP，一个来回 TIDE_PERIOD 秒（真实潮汐 12.4 小时、人看不出来，这里压缩成一分钟左右的可感知涨落，快涨慢落）；
        //  涨潮时水线低（水漫上沙滩）、浪冲得更深；落潮时水线高、沙滩露得多；
        //  浪：每 WAVE_PERIOD 秒一个，冲上沙滩占一周期的 RISE（先快后慢），其余时间退回（先慢后快）；一组 SET_AMPS.length 个，大小依次是 SET_AMPS，每个浪沿横向再有 ±AMP_WOBBLE 的强弱；
        //  浪是斜着来的（右边比左边晚 SHEAR 个周期）；下一个浪在上一个退水的后半段就从海里推过来（APPROACH 占周期的比例，起点在水线上方 APPROACH_DIST 处），与退水在水线附近相撞；
        //  水线沿横向的缓慢起伏幅度 LAT_A、LAT_B，指状水舌（只在着色器里，噪声）幅度 RILL。
        BAND: 0.34,             // 带子高度 / 页面高度；样式里 .aq-water 的 height 必须是同一个百分比（单测核对）
        TOP_MID: 0.15,
        TIDE_AMP: 0.035,
        TIDE_PERIOD: 60,
        REACH: 0.085,           // 一个大小为 1 的浪冲下去的深度（水线从最高处往页面底边方向走的距离）
        REACH_TIDE: 0.10,       // 涨潮时浪冲得更深：REACH × (1 + REACH_TIDE × high)
        WAVE_PERIOD: 9,
        RISE: 0.26,
        SHEAR: 0.22,
        APPROACH: 0.55,
        APPROACH_DIST: 0.14,
        SET_AMPS: Object.freeze([0.55, 0.80, 1.00, 0.68]),
        AMP_WOBBLE: 0.22,
        LAT_A: 0.0065,
        LAT_B: 0.0040,
        LAT_PERIOD_A: 36,       // 横向起伏两项各自随时间漂移的周期（秒）；同样必须整除 TIME_WRAP，否则回绕那一刻水线会跳一下
        LAT_PERIOD_B: 27,
        RILL: 0.020,
        // 帧率自监控（看宿主每帧调用之间的间隔，不依赖 GPU 计时）。三个阶段：
        //  ① 预热 GOV_WARMUP_MS：刚启动的头几秒不计——首页自己在加载、着色器在编译和上传，这段时间的卡顿不是海水层造成的
        //     （真实 Chrome 156 里关掉海水层、页面刚打开，前 20 帧的间隔中位数就有 183 ms，整个启动期都在卡）；
        //  ② 等页面“流畅过”：某个窗口（GOV_MIN_SAMPLES 个间隔）的中位数不超过 GOV_SLOW_MS（约 25 fps）才开始监护，
        //     最晚等到启动后 GOV_SETTLE_MAX_MS——机器本身很忙、页面一直不流畅时，不拿启动期的卡顿去怪海水层；
        //  ③ 监护：每个窗口取中位数，超过 GOV_SLOW_MS 就降一级（0 → 1 省流量画法，1 → 2 关闭）。
        // 大于 GOV_MAX_GAP 的间隔是页面被切走又回来，不计入。只降不升：避免在临界处来回切换。
        GOV_MIN_SAMPLES: 20,
        GOV_SLOW_MS: 40,
        GOV_WARMUP_MS: 4000,
        GOV_SETTLE_MAX_MS: 30000,
        GOV_MAX_GAP: 1000,
    });

    function clamp(value, min, max) { return value < min ? min : (value > max ? max : value); }
    function finite(value, fallback) { return Number.isFinite(value) ? value : fallback; }

    /**
     * 内部画布尺寸 { w, h }（整数）；页面尺寸不是有限的正数时返回 null（调用方不画）。
     * 先按比例缩，像素数超过上限再整体缩小，边长不低于 MIN_SIDE。
     */
    function renderSize(options) {
        const { width, height, lowPower } = options || {};
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
        const scale = lowPower ? PARAMS.SCALE_LOW : PARAMS.SCALE;
        let w = width * scale;
        let h = height * scale;
        const pixels = w * h;
        if (pixels > PARAMS.MAX_PIXELS) {
            const k = Math.sqrt(PARAMS.MAX_PIXELS / pixels);
            w *= k;
            h *= k;
        }
        return { w: Math.max(PARAMS.MIN_SIDE, Math.round(w)), h: Math.max(PARAMS.MIN_SIDE, Math.round(h)) };
    }

    /**
     * 这一帧要不要重画：距上次画的时间不小于帧间隔（留 1 毫秒余量，60 Hz 屏上 30 帧恰好隔一帧）。
     * 第一次（last 不是有限数）或时钟倒退（now < last）一律画；now 不是有限数不画。
     */
    function frameDue(options) {
        const { now, last, lowPower } = options || {};
        if (!Number.isFinite(now)) return false;
        if (!Number.isFinite(last) || now < last) return true;
        return now - last >= 1000 / (lowPower ? PARAMS.FPS_LOW : PARAMS.FPS) - 1;
    }

    /** 着色器时间（秒）：毫秒时间戳按 TIME_WRAP 回绕；非有限或负数当 0。 */
    function shaderTime(nowMs) {
        if (!Number.isFinite(nowMs) || nowMs < 0) return 0;
        return (nowMs / 1000) % PARAMS.TIME_WRAP;
    }

    const TAU = Math.PI * 2;

    /**
     * 内部画布尺寸 { w, h }（整数）：画布只有页面底部的一条带子，宽 = 页面宽度，高 = 页面高度 × BAND，再按比例缩；
     * 页面尺寸不是有限的正数时返回 null。先按比例缩，像素数超过上限再整体缩小，边长不低于 MIN_SIDE。
     */
    function bandSize(options) {
        const { width, height, lowPower } = options || {};
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
        return renderSize({ width, height: height * PARAMS.BAND, lowPower });
    }

    /**
     * 某一刻的潮汐状态（time 是着色器时间，秒）：
     *  high   潮位在 -1（落潮最低）…1（涨潮最高）之间的位置，快涨慢落；
     *  tideV  涨落方向 -1（正在落）…1（正在涨），按最大速度归一；
     *  top    浪“退得最远”时水线离页面底边的高度（占页面高度的比例；涨潮时水漫上沙滩、水线更低）；
     *  reach  一个大小为 1 的浪此刻冲下去的深度（涨潮时更深）。
     * 非有限输入按 0 秒算。
     */
    function tideOf(time) {
        const t = Number.isFinite(time) ? time : 0;
        const th = (TAU * t) / PARAMS.TIDE_PERIOD;
        const raw = Math.sin(th) + 0.2 * Math.sin(2 * th + 0.8);                 // 倍频分量让波形不对称，峰值约 1.17（除以 1.2 后不超过 0.98，下面的夹取只是保险）
        const high = clamp(raw / 1.2, -1, 1);
        const dRaw = Math.cos(th) + 0.4 * Math.cos(2 * th + 0.8);
        const tideV = clamp(dRaw / 1.4, -1, 1);
        return {
            high,
            tideV,
            top: PARAMS.TOP_MID - PARAMS.TIDE_AMP * high,
            reach: PARAMS.REACH * (1 + PARAMS.REACH_TIDE * high),
        };
    }

    /** 一组里第 k 个浪（k 取整后按 SET_AMPS 的长度取模，负数也行）的大小。 */
    function waveAmp(k) {
        const n = PARAMS.SET_AMPS.length;
        const i = ((Math.floor(finite(k, 0)) % n) + n) % n;
        return PARAMS.SET_AMPS[i];
    }

    /**
     * 一个浪冲上沙滩的一生（phi 是它周期里的位置 0…1）：0 = 退得最远（水线在最高处），1 = 冲得最深。
     * 冲上去占前 RISE，先快后慢；退回占其余部分，先慢后快（指数 1.6）。phi 夹在 0…1；非有限当 0。两端接上 0，整个周期首尾连续。
     */
    function rush(phi) {
        const x = clamp(finite(phi, 0), 0, 1);
        if (x < PARAMS.RISE) { const u = x / PARAMS.RISE; return 1 - (1 - u) * (1 - u); }
        const v = (x - PARAMS.RISE) / (1 - PARAMS.RISE);
        return 1 - Math.pow(v, 1.6);
    }

    /** rush 对 phi 的变化率：冲上去为正、退下去为负（着色器用来决定冲水/退水的泡沫）。 */
    function rushVel(phi) {
        const x = clamp(finite(phi, 0), 0, 1);
        if (x < PARAMS.RISE) { const u = x / PARAMS.RISE; return 2 * (1 - u) / PARAMS.RISE; }
        const v = (x - PARAMS.RISE) / (1 - PARAMS.RISE);
        return -1.6 * Math.pow(Math.max(v, 0.0001), 0.6) / (1 - PARAMS.RISE);
    }

    /**
     * 水线离页面底边的高度（占页面高度的比例；不含着色器里只做装饰的水舌噪声，它的幅度有上界 RILL × 0.5 × (0.3 + rush)）：
     *  xn    横向位置 0…1（页面左→右）；aspect 页面宽高比（决定横向起伏的空间频率，缺省 16/9）；time 着色器时间（秒）；
     *  top / reach 来自 tideOf（缺省取平均潮位）。
     * 公式与着色器逐项一致：相位 = time / WAVE_PERIOD - SHEAR × xn（浪是斜着来的），取整数部分当第几个浪、小数部分当周期位置，
     * 水线 = top - reach × 浪的大小 × (1 + AMP_WOBBLE × sin(xp × 3.1 + k × 1.9)) × rush + 横向起伏。
     */
    function frontAt(options) {
        const o = options || {};
        const xn = clamp(finite(o.xn, 0.5), 0, 1);
        const aspectIn = finite(o.aspect, 16 / 9);
        const aspect = aspectIn > 0 ? aspectIn : 16 / 9;
        const time = finite(o.time, 0);
        const top = finite(o.top, PARAMS.TOP_MID);
        const reach = finite(o.reach, PARAMS.REACH);
        const xp = xn * aspect;
        const ph = time / PARAMS.WAVE_PERIOD - PARAMS.SHEAR * xn;
        const n = Math.floor(ph);
        const phi = ph - n;
        const k = ((n % PARAMS.SET_AMPS.length) + PARAMS.SET_AMPS.length) % PARAMS.SET_AMPS.length;
        const amp = waveAmp(k) * (1 + PARAMS.AMP_WOBBLE * Math.sin(xp * 3.1 + k * 1.9));
        const lat = PARAMS.LAT_A * Math.sin(xp * 2.3 + (TAU / PARAMS.LAT_PERIOD_A) * time)
            + PARAMS.LAT_B * Math.sin(xp * 5.9 - (TAU / PARAMS.LAT_PERIOD_B) * time + 1.7);
        return top - reach * amp * rush(phi) + lat;
    }

    // 水线最高能比 “top” 再高多少：横向起伏的两项加上水舌噪声在 rush = 0 时的上界（噪声是 [0,1) 的值减 0.5，乘 RILL × 0.3）
    const SHORE_PAD = PARAMS.LAT_A + PARAMS.LAT_B + PARAMS.RILL * 0.5 * 0.3;

    /**
     * 这一刻水线能到的最高处（占页面高度的比例，从页面底边往上量）：鱼的身体下沿要保持在它之上，不然会游进沙滩里。
     * 取“浪退得最远、横向起伏与水舌都在最高”的情形，是任何横向位置、任何相位的上界；跟着潮汐走。
     */
    function shoreTopAt(time) {
        return tideOf(time).top + SHORE_PAD;
    }

    /** 整个潮汐周期里水线最高处的常数上界（涨落、浪、起伏全取最大）：单测核对它不小于任何时刻的 shoreTopAt。 */
    function shoreTopMax() {
        return PARAMS.TOP_MID + PARAMS.TIDE_AMP + SHORE_PAD;
    }

    /**
     * 一帧的 uniform 取值：time 秒、amount 总亮度（0.25…1）、night 0…1、quality（1 完整 / 0 省流量：少水下光斑与水面碎光）、
     * band（带子高度占页面高度的比例）、aspect（页面宽高比）、top / reach / tideV（见 tideOf）。
     * amount 是设置里的“强度”（0…1，缺失按 0.65）；width / height 是页面尺寸（缺失或不合法时 aspect 取 16:9）；
     * 任何非有限的输入都落到安全值，不会把 NaN 送进着色器。
     */
    function uniformsFor(options) {
        const { now, amount, night, lowPower, width, height } = options || {};
        const strength = clamp(finite(amount, 0.65), 0, 1);
        const time = shaderTime(now);
        const tide = tideOf(time);
        const aspect = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? width / height : 16 / 9;
        return {
            time,
            amount: PARAMS.AMOUNT_BASE + PARAMS.AMOUNT_SPAN * strength,
            night: clamp(finite(night, 0), 0, 1),
            quality: lowPower ? 0 : 1,
            band: PARAMS.BAND,
            aspect,
            top: tide.top,
            reach: tide.reach,
            tideV: tide.tideV,
        };
    }

    /**
     * 渲染器名称（WEBGL_debug_renderer_info 的 UNMASKED_RENDERER）是不是 CPU 软件渲染：SwiftShader、llvmpipe、softpipe、各种 “Software”、
     * Windows 的 Basic Render Driver。全屏着色器放在 CPU 上会把整个页面拖到每帧几百毫秒，所以软件渲染时宁可不画。
     * failIfMajorPerformanceCaveat 不够用：实测在 ANGLE + SwiftShader 的配置里它并不拒绝软件渲染的上下文。
     */
    function isSoftwareRenderer(name) {
        return typeof name === 'string' && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    }

    /**
     * 帧率自监控：observe(now) 在宿主每次调用 frame 时调用，返回当前降级等级——0 正常、1 降到省流量画法、2 关闭。
     * 阶段与参数见 PARAMS 里 GOV_* 的说明：预热不计、等页面流畅过（或等到上限）才监护、监护中每个窗口的中位数偏大就降一级。
     * 等级只升不降；now 非有限、时间倒退、或间隔超过 GOV_MAX_GAP 的都当作“页面被暂停过”，不计入。
     * 时间都取宿主传来的 now（毫秒），预热与等待从第一次观察算起。
     */
    function createGovernor() {
        let gaps = [];
        let previous = NaN;
        let origin = NaN;
        let level = 0;
        let armed = false;
        return {
            observe(now) {
                if (!Number.isFinite(now)) return level;
                if (!Number.isFinite(origin)) origin = now;
                const counting = now - origin >= PARAMS.GOV_WARMUP_MS;
                if (counting && Number.isFinite(previous) && now > previous) {
                    const gap = now - previous;
                    if (gap <= PARAMS.GOV_MAX_GAP) gaps.push(gap);
                }
                previous = now;
                if (level < 2 && gaps.length >= PARAMS.GOV_MIN_SAMPLES) {
                    const sorted = gaps.slice().sort((a, b) => a - b);
                    const median = sorted[Math.floor(sorted.length / 2)];
                    gaps = [];
                    if (!armed) {
                        // 页面流畅过，或已等到上限：从下一个窗口起监护（这个窗口本身不扣分）
                        if (median <= PARAMS.GOV_SLOW_MS || now - origin >= PARAMS.GOV_SETTLE_MAX_MS) armed = true;
                    } else if (median > PARAMS.GOV_SLOW_MS) {
                        level = level >= 1 ? 2 : 1;
                    }
                }
                return level;
            },
            level: () => level,
            armed: () => armed,
        };
    }

    return Object.freeze({
        PARAMS, renderSize, bandSize, frameDue, shaderTime,
        tideOf, waveAmp, rush, rushVel, frontAt, shoreTopAt, shoreTopMax,
        uniformsFor, isSoftwareRenderer, createGovernor,
    });
});
