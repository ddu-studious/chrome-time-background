(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumWaterCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 水体层的纯逻辑（不碰 DOM、WebGL、Date 与存储，随机数没有）：内部画布尺寸、帧率节流、着色器时间与 uniform 取值。
    // 着色器源码在 aquarium-water-shader.js，控制器与 WebGL 在 aquarium-water.js。设计与取舍见 docs/technical/aquarium-water-20261019.md。

    const PARAMS = Object.freeze({
        SCALE: 0.5,             // 内部画布边长 / 页面边长：水光全是低频内容，半分辨率放大看不出差别，像素数只有四分之一
        SCALE_LOW: 0.3,         // 省流量
        MAX_PIXELS: 560000,     // 内部画布像素上限：超大屏（5K/8K）按它再缩，GPU 成本不随屏幕无限增长
        MIN_SIDE: 48,
        FPS: 30,                // 水光运动缓慢，30 帧足够；宿主循环更快时隔帧跳过，画布保持上一帧
        FPS_LOW: 15,
        TIME_WRAP: 21600,       // 着色器时间（秒）每 6 小时回绕一次，保住 float32 精度（回绕那一刻花纹会变一下）
        SUN_X: 0.66,            // 太阳（眩光与光束的圆心）在水平方向的位置，占页面宽度的比例；着色器里还会缓慢漂移
        AMOUNT_BASE: 0.25,      // 设置里的“强度”10–100% 映射到着色器总亮度：0.25 + 0.75 × 强度
        AMOUNT_SPAN: 0.75,
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

    /**
     * 一帧的 uniform 取值：time 秒、amount 总亮度（0.25…1）、night 0…1、quality（1 完整 / 0 省流量：少一层焦散、没有颗粒与气泡）、sunX。
     * amount 是设置里的“强度”（0…1，缺失按 0.65）；任何非有限的输入都落到安全值，不会把 NaN 送进着色器。
     */
    function uniformsFor(options) {
        const { now, amount, night, lowPower } = options || {};
        const strength = clamp(finite(amount, 0.65), 0, 1);
        return {
            time: shaderTime(now),
            amount: PARAMS.AMOUNT_BASE + PARAMS.AMOUNT_SPAN * strength,
            night: clamp(finite(night, 0), 0, 1),
            quality: lowPower ? 0 : 1,
            sunX: PARAMS.SUN_X,
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

    return Object.freeze({ PARAMS, renderSize, frameDue, shaderTime, uniformsFor, isSoftwareRenderer, createGovernor });
});
