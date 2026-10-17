(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./wallpaper-weave-core.js')
        : root && root.WallpaperWeaveCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof document !== 'undefined') root.WallpaperWeave = api.create();
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 壁纸转场：编织、水波、旋涡、马赛克、水墨、穿越、百叶窗、方块翻转，每次随机挑一种（不与上一次连续重复），也可在设置里固定。
    // 原生 WebGL（一个全屏四边形 + 每种风格一段片元着色器），不加载 three.js。风格注册表、随机选择与参数见
    // wallpaper-weave-core.js，与 main.js 的接入、取消与回退规则见 docs/technical/touch-feel-weave-liquid-clock-20261014.md。
    //
    // 失败一律“不播放”：加载超时、跨域不可读、没有 WebGL、上下文丢失，调用方都会直接用原来的方式换壁纸。
    // 某一种风格的着色器在这台机器上编不过：同一次播放里改用编织重试，并在本页内不再抽到它。
    //
    // 每种风格必须满足两条（全部由共用的 main() 与着色器内部保证，真实浏览器逐风格实测）：
    //   1. 进度恰为 0 / 1 时直接输出旧图 / 新图的 cover 取样，与 CSS background-size: cover 的 body 背景交接无缝；
    //   2. 进度靠近 0 / 1 时连续地趋近这两张图，没有残留的纹路、变暗或位移（所有“特效强度”都乘以 4·p·(1−p) 或自带有限支撑）。

    const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
    vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
    gl_Position = vec4(aPos, 0.0, 1.0);
}`;

    // 所有风格共用：采样器、cover 取样、哈希与噪声。
    const PRELUDE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uDelay;
uniform vec4 uCoverFrom;
uniform vec4 uCoverTo;
uniform float uProgress;
uniform float uBands;
uniform float uMaxDelay;
uniform float uHeight;
uniform float uAspect;
uniform float uSeed;
uniform float uVertical;
uniform vec2 uCenter;
uniform vec2 uDir;

vec4 texFrom(vec2 uv) { return texture2D(uFrom, clamp(uv, 0.0, 1.0) * uCoverFrom.xy + uCoverFrom.zw); }
vec4 texTo(vec2 uv) { return texture2D(uTo, clamp(uv, 0.0, 1.0) * uCoverTo.xy + uCoverTo.zw); }

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        a *= 0.5;
    }
    return v / 0.9375;
}

// 以 c 为中心，到画面四角的最远距离（x 按宽高比放大成“正圆”空间）。
float farthest(vec2 c, vec2 asp) {
    float d0 = length(c * asp);
    float d1 = length((vec2(1.0, 0.0) - c) * asp);
    float d2 = length((vec2(0.0, 1.0) - c) * asp);
    float d3 = length((vec2(1.0) - c) * asp);
    return max(max(d0, d1), max(d2, d3));
}

vec2 rot(vec2 v, float a) {
    float s = sin(a);
    float c = cos(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}
`;

    // 共用入口：端点直接输出原图，其余交给风格的 transition()。
    const MAIN = `
void main() {
    if (uProgress <= 0.0) { gl_FragColor = vec4(texFrom(vUv).rgb, 1.0); return; }
    if (uProgress >= 1.0) { gl_FragColor = vec4(texTo(vUv).rgb, 1.0); return; }
    gl_FragColor = vec4(clamp(transition(vUv, uProgress), 0.0, 1.0), 1.0);
}`;

    const BODIES = {
        // 编织：横向丝带错开抽走旧图、织回新图，相邻丝带方向相反。
        weave: `
// 沿水平方向把图“抽”成丝：amount 越大，取样越往 dir 的反方向拉长，边缘像素被拖成线。
vec4 pull(sampler2D tex, vec4 cover, vec2 uv, float amount, float dir) {
    vec4 sum = vec4(0.0);
    float len = amount * amount * 0.62 + amount * 0.08;
    for (int i = 0; i < 10; i++) {
        float k = float(i) / 9.0;
        float x = clamp(uv.x - dir * len * k, 0.0, 1.0);
        sum += texture2D(tex, vec2(x, uv.y) * cover.xy + cover.zw);
    }
    return sum / 10.0;
}

vec3 transition(vec2 uv, float p) {
    float band = floor(uv.y * uBands);
    // 数据纹理里存的是“占 MAX_DELAY 的比例”；进度放大到 1+MAX_DELAY，保证最晚的一条丝带也恰好在进度 1 时到位。
    float delay = texture2D(uDelay, vec2((band + 0.5) / uBands, 0.5)).r * uMaxDelay;
    float t = clamp(p * (1.0 + uMaxDelay) - delay, 0.0, 1.0);
    float dir = mod(band, 2.0) < 1.0 ? 1.0 : -1.0;

    float leave = smoothstep(0.0, 0.62, t);
    float arrive = 1.0 - smoothstep(0.38, 1.0, t);
    vec4 a = pull(uFrom, uCoverFrom, uv, leave, dir);
    vec4 b = pull(uTo, uCoverTo, uv, arrive, -dir);
    float swap = smoothstep(0.42, 0.58, t);
    vec3 color = mix(a.rgb, b.rgb, swap);

    // 丝线的明暗：只在拉扯最强时出现，起止两端回到 0，所以不会残留纹路。
    float strain = leave * (1.0 - leave) + arrive * (1.0 - arrive);
    float thread = 0.5 + 0.5 * sin(uv.y * uHeight * 0.85 + band * 1.7);
    return color * (1.0 + (thread - 0.5) * strain * 0.55);
}`,

        // 水波：从随机一点扩散出一圈波纹，圈内是新图；波前附近折射扭曲并带亮纹。
        ripple: `
vec3 transition(vec2 uv, float p) {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 v = (uv - uCenter) * asp;
    float d = length(v);
    float w = 0.06;
    float front = mix(-w, farthest(uCenter, asp) + w, p);
    float inside = 1.0 - smoothstep(front - w, front + w, d);
    float env = 4.0 * p * (1.0 - p);
    float ring = 1.0 - smoothstep(0.0, 0.18, abs(d - front));
    float phase = (d - front) * 64.0;
    vec2 dir = d > 0.0001 ? v / d : vec2(0.0);
    vec2 shift = dir / asp * sin(phase) * ring * env * 0.03;
    vec3 a = texFrom(uv + shift).rgb;
    vec3 b = texTo(uv + shift).rgb;
    vec3 color = mix(a, b, inside);
    return color + ring * env * 0.07 * (0.5 + 0.5 * cos(phase));
}`,

        // 旋涡：旧图绕随机中心越拧越紧，到一半时换成同样拧紧的新图，再慢慢松开。
        swirl: `
vec3 transition(vec2 uv, float p) {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 v = (uv - uCenter) * asp;
    float fall = 1.0 - smoothstep(0.0, 1.0, length(v));
    fall = fall * fall;
    float angleA = p * 6.0 * fall;
    float angleB = -(1.0 - p) * 6.0 * fall;
    vec3 a = texFrom(uCenter + rot(v, angleA) / asp).rgb;
    vec3 b = texTo(uCenter + rot(v, angleB) / asp).rgb;
    return mix(a, b, smoothstep(0.4, 0.62, p));
}`,

        // 马赛克：画面切成方块，随机错开翻成新图；翻动的方块先粗化成像素块再细化回来，并微微泛亮。
        mosaic: `
vec3 transition(vec2 uv, float p) {
    float rows = 12.0;
    vec2 g = vec2(rows * uAspect, rows);
    vec2 id = floor(uv * g);
    float r = hash12(id + vec2(uSeed * 61.0, uSeed * 37.0));
    float spread = 0.5;
    float local = clamp(p * (1.0 + spread) - r * spread, 0.0, 1.0);
    float phase = 4.0 * local * (1.0 - local);
    vec2 sampleUv = uv;
    if (phase > 0.002) {
        float blocks = mix(40.0, 5.0, phase);
        vec2 inTile = fract(uv * g);
        vec2 snapped = (id + (floor(inTile * blocks) + 0.5) / blocks) / g;
        sampleUv = mix(uv, snapped, smoothstep(0.0, 0.25, phase));
    }
    vec3 a = texFrom(sampleUv).rgb;
    vec3 b = texTo(sampleUv).rgb;
    return mix(a, b, smoothstep(0.42, 0.58, local)) + phase * 0.1;
}`,

        // 水墨：不规则的墨迹从随机一点晕开，边缘压暗并略去色。
        ink: `
vec3 transition(vec2 uv, float p) {
    vec2 asp = vec2(uAspect, 1.0);
    float dist = length((uv - uCenter) * asp) / farthest(uCenter, asp);
    float n = fbm(uv * asp * 3.2 + vec2(uSeed * 17.0, uSeed * 9.0));
    float field = clamp(dist * 0.55 + n * 0.45, 0.0, 1.0);
    float w = 0.07;
    float e = w * 1.4;
    float thr = mix(-e - 0.01, 1.0 + e + 0.01, p);
    float inside = 1.0 - smoothstep(thr - w, thr + w, field);
    float edge = 1.0 - smoothstep(0.0, e, abs(field - thr));
    vec3 color = mix(texFrom(uv).rgb, texTo(uv).rgb, inside);
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(gray), edge * 0.35);
    return color * (1.0 - edge * 0.38);
}`,

        // 穿越：旧图向镜头放大飞过并模糊，新图从放大状态落回原位。
        zoom: `
vec3 transition(vec2 uv, float p) {
    float e = p * p * (3.0 - 2.0 * p);
    float zoomA = 1.0 + 0.55 * e;
    float zoomB = 1.0 + 0.45 * (1.0 - e) * (1.0 - e);
    float env = 4.0 * p * (1.0 - p);
    float blur = env * 0.05;
    vec3 a = vec3(0.0);
    vec3 b = vec3(0.0);
    for (int i = 0; i < 8; i++) {
        float s = 1.0 - blur * (float(i) / 7.0);
        a += texFrom(uCenter + (uv - uCenter) / zoomA * s).rgb;
        b += texTo(uCenter + (uv - uCenter) / zoomB * s).rgb;
    }
    a /= 8.0;
    b /= 8.0;
    return mix(a, b, smoothstep(0.3, 0.7, p)) + env * 0.08;
}`,

        // 百叶窗：一排窗叶依次翻转（横条或竖条随机），翻转的分界线带一道暗边。
        blinds: `
vec3 transition(vec2 uv, float p) {
    float count = uVertical > 0.5 ? 16.0 : 11.0;
    float pos = (uVertical > 0.5 ? uv.x : uv.y) * count;
    float idx = floor(pos);
    float f = fract(pos);
    float order = idx / (count - 1.0);
    if (uDir.y < 0.0) order = 1.0 - order;
    float spread = 0.55;
    float local = clamp(p * (1.0 + spread) - order * spread, 0.0, 1.0);
    float w = 0.08;
    float x = mix(-w, 1.0 + w, local);
    float inside = smoothstep(f - w, f + w, x);
    float edge = 1.0 - smoothstep(0.0, w, abs(f - x));
    float env = 4.0 * local * (1.0 - local);
    vec3 color = mix(texFrom(uv).rgb, texTo(uv).rgb, inside);
    return color * (1.0 - edge * 0.34 - env * 0.08 * (0.5 + 0.5 * sin(f * 6.28318)));
}`,

        // 方块翻转：画面切成方块，沿随机一个斜角依次像卡片一样翻面（正面旧图、背面新图），翻到一半时只剩一条边。
        flip: `
vec3 transition(vec2 uv, float p) {
    float rows = 8.0;
    vec2 g = vec2(rows * uAspect, rows);
    vec2 id = floor(uv * g);
    vec2 t = fract(uv * g);
    vec2 q = id / max(g - 1.0, vec2(1.0));
    q = vec2(uDir.x < 0.0 ? 1.0 - q.x : q.x, uDir.y < 0.0 ? 1.0 - q.y : q.y);
    float order = clamp((q.x + q.y) * 0.5 * 0.85 + hash12(id + vec2(uSeed * 53.0, uSeed * 29.0)) * 0.15, 0.0, 1.0);
    float spread = 0.55;
    float local = clamp(p * (1.0 + spread) - order * spread, 0.0, 1.0);
    if (local <= 0.0) return texFrom(uv).rgb;
    if (local >= 1.0) return texTo(uv).rgb;
    float c = cos(local * 3.14159265);
    // env：0 = 卡片正对屏幕，1 = 侧立。卡片最窄留 20% 宽，背后是两张图的暗淡重影（不会整屏发黑）。
    // 所有明暗、窄边都乘 env，所以翻转开始与结束时与原图连续，没有残留的格线。
    float env = 1.0 - abs(c);
    float width = 1.0 - 0.8 * env;
    float x = (t.x - 0.5) / width + 0.5;
    vec3 ghost = mix(texFrom(uv).rgb, texTo(uv).rgb, local) * 0.3;
    if (x < 0.0 || x > 1.0) return ghost;
    vec2 cardUv = (id + vec2(x, t.y)) / g;
    vec3 face = c > 0.0 ? texFrom(cardUv).rgb : texTo(cardUv).rgb;
    float rim = smoothstep(0.0, 0.06, min(x, 1.0 - x));
    return mix(ghost, face * (1.0 - 0.45 * env), mix(1.0, rim, env));
}`,
    };

    // 每种风格一份完整的片元着色器；缺少某种风格的实现会在测试里直接失败。
    const FRAGMENTS = {};
    for (const id of Core.STYLE_IDS) FRAGMENTS[id] = PRELUDE + (BODIES[id] || '') + MAIN;

    function create(env = {}) {
        const doc = env.document || (typeof document !== 'undefined' ? document : null);
        const win = env.window || (typeof window !== 'undefined' ? window : null);
        const ImageCtor = env.Image || (win && win.Image);
        const raf = env.requestAnimationFrame || (win && win.requestAnimationFrame && win.requestAnimationFrame.bind(win));
        const caf = env.cancelAnimationFrame || (win && win.cancelAnimationFrame && win.cancelAnimationFrame.bind(win));
        const now = env.now || (() => (win && win.performance ? win.performance.now() : Date.now()));
        const setTimer = env.setTimeout || setTimeout;
        const clearTimer = env.clearTimeout || clearTimeout;
        const makeRenderer = env.createRenderer || createRenderer;
        const random = env.random || Math.random;

        const blocked = new Set();
        const broken = new Set();     // 本页内着色器编不过的风格，之后不再抽到
        let run = 0;
        let active = null;            // 正在播放的转场：{ canvas, renderer, finish(reason) }
        let shown = null;             // 上一次转场结束后保留的图（下次当作“旧图”，省一次下载）
        let lastStyle = null;         // 上一次实际用的风格，随机时避开它

        function loadImage(url) {
            return new Promise(resolve => {
                if (!ImageCtor) { resolve(null); return; }
                const image = new ImageCtor();
                let done = false;
                const finish = value => {
                    if (done) return;
                    done = true;
                    image.onload = null; image.onerror = null;
                    resolve(value);
                };
                const timer = setTimer(() => finish(null), Core.LOAD_TIMEOUT_MS);
                const settle = value => { clearTimer(timer); finish(value); };
                image.crossOrigin = 'anonymous';
                image.decoding = 'async';
                image.onload = () => settle(image);
                image.onerror = () => settle(null);
                image.src = url;
            });
        }

        function canPlay(options) {
            return Core.decide({ ...options, blocked });
        }

        function cancel(reason = 'cancelled') {
            run++;
            if (active) active.finish(reason);
        }

        function makeCanvas(width, height) {
            const canvas = doc.createElement('canvas');
            canvas.className = 'wallpaper-weave-canvas';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }

        // style：'random'（默认，每次随机）或某个具体风格；duration 缺省时按风格自己的时长。
        async function play({ from, to, duration, style } = {}) {
            cancel('superseded');
            const token = run;
            if (!doc || !raf || !from || !to) return { played: false, reason: 'unavailable' };

            const [fromImage, toImage] = await Promise.all([
                shown && shown.url === from.url ? Promise.resolve(shown.image) : loadImage(from.url),
                loadImage(to.url),
            ]);
            if (token !== run) return { played: false, reason: 'superseded' };
            if (!fromImage || !toImage) {
                // 多半是图床不允许跨域读取：记住，之后对这两个地址不再尝试。
                if (!fromImage) Core.remember(blocked, from.url);
                if (!toImage) Core.remember(blocked, to.url);
                return { played: false, reason: 'load-failed' };
            }

            const dpr = Math.min((win && win.devicePixelRatio) || 1, 2);
            const width = Math.max(1, Math.round(((win && win.innerWidth) || 1280) * dpr));
            const height = Math.max(1, Math.round(((win && win.innerHeight) || 720) * dpr));
            const seed = Math.floor(random() * 0x7fffffff);

            // 选风格；编译失败时用一块全新的画布改用编织重试（失败的 WebGL 上下文不能复用）。
            const chosen = Core.pickStyle({ preference: style, previous: lastStyle, exclude: broken, random });
            const candidates = chosen === Core.FALLBACK_STYLE ? [chosen] : [chosen, Core.FALLBACK_STYLE];
            let canvas = null, renderer = null, used = chosen;
            for (const candidate of candidates) {
                const attempt = makeCanvas(width, height);
                const made = makeRenderer(attempt, { fromImage, toImage, width, height, seed, style: candidate });
                if (made) { canvas = attempt; renderer = made; used = candidate; break; }
            }
            if (!renderer) return { played: false, reason: 'no-webgl', style: chosen };
            if (used !== chosen) broken.add(chosen);
            lastStyle = used;
            doc.body.appendChild(canvas);
            const total = duration > 0 ? duration : Core.durationFor(used);

            return new Promise(resolve => {
                let frame = 0;
                let ended = false;
                const started = now();
                const entry = {
                    canvas, renderer,
                    finish(reason) {
                        if (ended) return;
                        ended = true;
                        if (frame && caf) caf(frame);
                        if (active === entry) active = null;
                        dispose();
                        resolve({ played: false, reason, style: used });
                    },
                };
                let disposed = false;
                function dispose() {
                    if (disposed) return;
                    disposed = true;
                    try { renderer.dispose(); } catch { /* 已丢失的上下文 */ }
                    canvas.remove();
                }
                canvas.addEventListener('webglcontextlost', event => {
                    event.preventDefault?.();
                    entry.finish('context-lost');
                });
                active = entry;
                const tick = () => {
                    frame = 0;
                    if (ended) return;
                    const elapsed = now() - started;
                    const progress = Core.progressAt(elapsed, total);
                    try {
                        renderer.draw(progress);
                    } catch {
                        entry.finish('draw-failed');
                        return;
                    }
                    if (elapsed >= total) {
                        ended = true;
                        if (active === entry) active = null;
                        shown = { url: to.url, image: toImage };
                        // 画布保持在最后一帧（等于新图），由调用方先换好 body 背景再 release。
                        resolve({
                            played: true,
                            reason: 'ok',
                            style: used,
                            release() {
                                if (disposed) return;
                                canvas.classList.add('is-releasing');
                                setTimer(dispose, 260);
                            },
                        });
                        return;
                    }
                    frame = raf(tick);
                };
                frame = raf(tick);
            });
        }

        return { play, cancel, canPlay, blocked, broken, _loadImage: loadImage, _createRenderer: createRenderer };
    }

    // ---- WebGL 渲染器 --------------------------------------------------------------------

    function compile(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`shader: ${log}`);
        }
        return shader;
    }

    function uploadImage(gl, unit, image, maxSize) {
        let source = image;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        const fit = Core.fitTexture(width, height, Math.min(maxSize, Core.MAX_TEXTURE_SIZE));
        if (fit.scale < 1) {
            const scaled = document.createElement('canvas');
            scaled.width = fit.width;
            scaled.height = fit.height;
            scaled.getContext('2d').drawImage(image, 0, 0, fit.width, fit.height);
            source = scaled;
        }
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        return { texture, width, height };
    }

    // style 不是已注册的风格时用编织。返回 null 表示这块画布上建不起来（没有 WebGL 或这种风格的着色器编译/链接失败）。
    function createRenderer(canvas, { fromImage, toImage, width, height, seed, style }) {
        let gl = null;
        try {
            gl = canvas.getContext('webgl', {
                alpha: false, antialias: false, depth: false, stencil: false,
                preserveDrawingBuffer: false, powerPreference: 'low-power',
            });
        } catch { gl = null; }
        if (!gl) return null;

        const styleId = Core.isStyle(style) ? style : Core.FALLBACK_STYLE;
        let program = null, vs = null, fs = null, buffer = null;
        const textures = [];
        try {
            vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
            fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENTS[styleId]);
            program = gl.createProgram();
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
            gl.useProgram(program);

            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const pos = gl.getAttribLocation(program, 'aPos');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || Core.MAX_TEXTURE_SIZE;
            const from = uploadImage(gl, 0, fromImage, maxSize);
            const to = uploadImage(gl, 1, toImage, maxSize);
            textures.push(from.texture, to.texture);

            // 1×BANDS 的延迟数据纹理（LUMINANCE，最近邻）；只有编织会读它，其余风格忽略。
            const delays = Core.bandDelays(Core.BANDS, seed);
            const bytes = new Uint8Array(delays.map(value => Math.round((value / Core.MAX_DELAY) * 255)));
            const delayTexture = gl.createTexture();
            textures.push(delayTexture);
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, delayTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, Core.BANDS, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);

            const cf = Core.coverTransform(from.width, from.height, width, height);
            const ct = Core.coverTransform(to.width, to.height, width, height);
            const params = Core.styleParams(seed);
            const at = name => gl.getUniformLocation(program, name);
            gl.uniform1i(at('uFrom'), 0);
            gl.uniform1i(at('uTo'), 1);
            gl.uniform1i(at('uDelay'), 2);
            gl.uniform4f(at('uCoverFrom'), cf.sx, cf.sy, cf.ox, cf.oy);
            gl.uniform4f(at('uCoverTo'), ct.sx, ct.sy, ct.ox, ct.oy);
            gl.uniform1f(at('uBands'), Core.BANDS);
            gl.uniform1f(at('uMaxDelay'), Core.MAX_DELAY);
            gl.uniform1f(at('uHeight'), height);
            gl.uniform1f(at('uAspect'), width / height);
            gl.uniform1f(at('uSeed'), params.seed01);
            gl.uniform1f(at('uVertical'), params.vertical);
            gl.uniform2f(at('uCenter'), params.center[0], params.center[1]);
            gl.uniform2f(at('uDir'), params.dir[0], params.dir[1]);
            gl.viewport(0, 0, width, height);
        } catch {
            try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* 忽略 */ }
            return null;
        }

        const progressLocation = gl.getUniformLocation(program, 'uProgress');
        return {
            style: styleId,
            draw(progress) {
                gl.uniform1f(progressLocation, progress);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            },
            dispose() {
                textures.forEach(texture => gl.deleteTexture(texture));
                if (buffer) gl.deleteBuffer(buffer);
                if (program) gl.deleteProgram(program);
                if (vs) gl.deleteShader(vs);
                if (fs) gl.deleteShader(fs);
                gl.getExtension('WEBGL_lose_context')?.loseContext();
            },
        };
    }

    return { create, createRenderer, FRAGMENTS, FRAGMENT: FRAGMENTS.weave, VERTEX, PRELUDE, MAIN, BODIES };
});
