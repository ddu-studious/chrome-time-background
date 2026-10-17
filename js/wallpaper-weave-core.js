(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.WallpaperWeaveCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 壁纸转场的纯逻辑：是否适用、风格注册表与随机选择、cover 铺放换算、分带错开延迟、缓动。
    // 没有 DOM / WebGL 依赖，Node 可测；绘制见 js/wallpaper-weave.js。设计与取舍见
    // docs/technical/touch-feel-weave-liquid-clock-20261014.md。

    // 风格注册表：id 是设置里保存的值与着色器的键，顺序即下拉框顺序；weave 排第一（也是着色器失败时的回退）。
    const STYLES = Object.freeze([
        Object.freeze({ id: 'weave', label: '编织', duration: 1600 }),
        Object.freeze({ id: 'ripple', label: '水波', duration: 1500 }),
        Object.freeze({ id: 'swirl', label: '旋涡', duration: 1500 }),
        Object.freeze({ id: 'mosaic', label: '马赛克', duration: 1400 }),
        Object.freeze({ id: 'ink', label: '水墨', duration: 1800 }),
        Object.freeze({ id: 'zoom', label: '穿越', duration: 1300 }),
        Object.freeze({ id: 'blinds', label: '百叶窗', duration: 1300 }),
        Object.freeze({ id: 'flip', label: '方块翻转', duration: 1600 }),
    ]);
    const STYLE_IDS = Object.freeze(STYLES.map(style => style.id));
    const FALLBACK_STYLE = 'weave';
    const RANDOM = 'random';

    const DURATION_MS = 1600;
    const BANDS = 28;
    const MAX_DELAY = 0.34;
    const LOAD_TIMEOUT_MS = 6000;
    const MAX_TEXTURE_SIZE = 2048;
    const MAX_BLOCKED = 50;

    function isStaticImage(item) {
        if (!item || item.mediaType === 'video' || typeof item.url !== 'string') return false;
        try {
            const protocol = new URL(item.url).protocol;
            return protocol === 'https:' || protocol === 'http:';
        } catch {
            return false;
        }
    }

    // 总开关与两个子开关：关闭“背景体验”时只保留原始壁纸，所以转场同样不生效。
    // wallpaperTransition 只有 'none' 表示关闭；旧版保存的 'weave' 与新值 'on' 都视为开启。
    function transitionEnabled(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        return source.enabled !== false && source.wallpaperTransition !== 'none';
    }

    // ---- 风格：设置、随机选择、每次播放的参数 -----------------------------------------------

    function isStyle(value) { return STYLE_IDS.includes(value); }

    // 'random'（默认，每次随机）或某个具体风格；未知值一律当作 random（升级后旧设置、被手改的值都安全）。
    function normalizeStyle(value) { return isStyle(value) ? value : RANDOM; }

    function durationFor(style) {
        const entry = STYLES.find(item => item.id === style);
        return entry ? entry.duration : DURATION_MS;
    }

    /**
     * 选这一次用的风格。
     * preference：设置里的值，具体风格就固定使用；random（或未知值）时从可用风格里随机，
     * 不与 previous 连续重复，排除 exclude（本页已确认编译失败的风格）。
     * random 可注入，便于测试。可用风格只剩一个时直接用它；一个都没有就回退 weave。
     */
    function pickStyle({ preference, previous, exclude, random = Math.random } = {}) {
        const wanted = normalizeStyle(preference);
        const skip = exclude instanceof Set ? exclude : new Set(exclude || []);
        if (wanted !== RANDOM) return skip.has(wanted) ? FALLBACK_STYLE : wanted;
        let pool = STYLE_IDS.filter(id => !skip.has(id));
        if (pool.length > 1 && previous) pool = pool.filter(id => id !== previous);
        if (!pool.length) return FALLBACK_STYLE;
        const draw = Number(random());
        const index = Math.min(pool.length - 1, Math.floor((Number.isFinite(draw) ? Math.max(0, draw) : 0) * pool.length));
        return pool[index];
    }

    // 设置页只有一个下拉框，取值 = none | random | 某个风格；落到两个设置字段上。
    function choiceFromSettings(settings) {
        const source = settings && typeof settings === 'object' ? settings : {};
        if (source.wallpaperTransition === 'none') return 'none';
        return normalizeStyle(source.wallpaperTransitionStyle);
    }

    function settingsFromChoice(choice) {
        if (choice === 'none') return { wallpaperTransition: 'none', wallpaperTransitionStyle: RANDOM };
        return { wallpaperTransition: 'on', wallpaperTransitionStyle: normalizeStyle(choice) };
    }

    // 每次播放的随机参数（由种子决定，着色器只读）：随机的中心点、斜向方向、窗叶朝向。
    function styleParams(seed) {
        const next = seeded(((Number(seed) || 0) >>> 0) ^ 0x9e3779b9);
        const seed01 = next();
        return {
            seed01,
            center: [0.2 + next() * 0.6, 0.2 + next() * 0.6],
            dir: [next() < 0.5 ? -1 : 1, next() < 0.5 ? -1 : 1],
            vertical: next() < 0.5 ? 1 : 0,
        };
    }

    /**
     * 判断这一次换壁纸能否播放转场。返回 { ok, reason }，reason 只用于测试与诊断。
     * blocked：此前加载失败（多半是不允许跨域读取）的 URL 集合，命中则直接瞬间切换。
     */
    function decide({ settings, from, to, reduceMotion, saveData, hidden, suspended, blocked } = {}) {
        if (!transitionEnabled(settings)) return { ok: false, reason: 'disabled' };
        if (reduceMotion) return { ok: false, reason: 'reduced-motion' };
        if (saveData) return { ok: false, reason: 'save-data' };
        if (hidden) return { ok: false, reason: 'hidden' };
        if (suspended) return { ok: false, reason: 'suspended' };
        if (!from) return { ok: false, reason: 'no-source' };
        if (!isStaticImage(from) || !isStaticImage(to)) return { ok: false, reason: 'not-image' };
        if (from.url === to.url) return { ok: false, reason: 'same' };
        if (blocked && (blocked.has(from.url) || blocked.has(to.url))) return { ok: false, reason: 'blocked' };
        return { ok: true, reason: 'ok' };
    }

    // 与 CSS `background-size: cover; background-position: center` 一致：视口 uv → 图片 uv = uv * s + o。
    function coverTransform(imageWidth, imageHeight, viewWidth, viewHeight) {
        if (!(imageWidth > 0 && imageHeight > 0 && viewWidth > 0 && viewHeight > 0)) {
            return { sx: 1, sy: 1, ox: 0, oy: 0 };
        }
        const scale = Math.max(viewWidth / imageWidth, viewHeight / imageHeight);
        const sx = viewWidth / (imageWidth * scale);
        const sy = viewHeight / (imageHeight * scale);
        return { sx, sy, ox: 0.5 - 0.5 * sx, oy: 0.5 - 0.5 * sy };
    }

    // 超出纹理上限的图先等比缩小（只缩不放）。
    function fitTexture(width, height, max = MAX_TEXTURE_SIZE) {
        const scale = Math.min(1, max / Math.max(width, height, 1));
        return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
    }

    // 可复现的伪随机（mulberry32），转场每次换种子，测试里固定种子。
    function seeded(seed) {
        let state = (seed >>> 0) || 1;
        return function next() {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // 每一条“丝带”的错开延迟，范围 [0, MAX_DELAY]，写进 1×BANDS 的数据纹理（fragment 里不能保证用变量下标取 uniform 数组）。
    function bandDelays(count = BANDS, seed = 1) {
        const next = seeded(seed);
        return Array.from({ length: count }, () => next() * MAX_DELAY);
    }

    function easeInOut(t) {
        const x = Math.max(0, Math.min(1, Number(t) || 0));
        return x * x * (3 - 2 * x);
    }

    function progressAt(elapsedMs, durationMs = DURATION_MS) {
        if (!(durationMs > 0)) return 1;
        return easeInOut(elapsedMs / durationMs);
    }

    function remember(set, url) {
        if (!set || typeof url !== 'string') return;
        set.add(url);
        // 只留最近的一批，避免长期运行无限增长。
        while (set.size > MAX_BLOCKED) set.delete(set.values().next().value);
    }

    return {
        DURATION_MS, BANDS, MAX_DELAY, LOAD_TIMEOUT_MS, MAX_TEXTURE_SIZE, MAX_BLOCKED,
        STYLES, STYLE_IDS, FALLBACK_STYLE, RANDOM,
        isStaticImage, transitionEnabled, decide, coverTransform, fitTexture,
        isStyle, normalizeStyle, durationFor, pickStyle, choiceFromSettings, settingsFromChoice, styleParams,
        seeded, bandDelays, easeInOut, progressAt, remember,
    };
});
