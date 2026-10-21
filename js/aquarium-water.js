(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const core = cjs ? require('./aquarium-water-core.js') : root && root.AquariumWaterCore;
    const shader = cjs ? require('./aquarium-water-shader.js') : root && root.AquariumWaterShader;
    const api = factory(core, shader, root);
    if (cjs) module.exports = api;
    // 只创建实例，不自动启动：是否运行由背景体验的设置决定（applySettings 里 start/stop）；没选水族馆皮肤或关了海水效果时没有任何 DOM、WebGL 或监听。
    if (root && typeof document !== 'undefined') root.AquariumWater = api.create();
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core, Shader, root) {
    'use strict';

    // 水体层控制器：一张独立的 WebGL 画布（半分辨率），只铺在页面底部的一条带子上（高度 = 页面高度 × Core.PARAMS.BAND，样式里是同一个百分比），
    // 画一道“岸线冲刷”——海浪一波波冲上沙滩又退下去、潮水慢慢涨落：干沙、湿沙与薄水膜、水线上的浪花、浅水里的光斑，以及正从海里推过来的下一道浪。
    // 画布输出的是预乘 alpha 的颜色（alpha:true，不用任何混合模式）：带子之外没有这张画布的任何像素，带子里水线以上是很薄的半透明青色并向上渐隐，壁纸始终透得过来。
    // 2026-10-19 之前是“不透明画布 + mix-blend-mode: screen”，那个设计在真实 Chrome 里不成立：首页壁纸是 body 的背景，被传播到了画布上，
    // 而 body 是 position: fixed（自成堆叠上下文），里面的 screen 看不到壁纸，画布就把壁纸整个盖住了。
    // 尺寸、帧率、潮汐与 uniform 取值的规则在 aquarium-water-core.js，着色器在 aquarium-water-shader.js。
    // 它不自建 RAF 或定时器：调度、页面隐藏即停、被工作台遮挡即停、省流量降帧都沿用宿主 background-experience.js 每帧调用 frame()；
    // 宿主不再调用时画布保持最后一帧（页面不可见时没人看见），工作台遮挡时由样式把它整个隐藏（见 css/aquarium.css）。
    // 画布放在宿主根容器（.bgx-root，自成堆叠上下文）之外、壁纸与它之间；根容器里的深海色调、水族馆的鱼和水母都画在它上面。
    // shore(now) 把岸线（此刻水线能到的最高处，占页面高度的比例，从页面底边往上量）告诉鱼：只有画布真的在显示时才返回数字，否则返回 null（没有岸线就不用躲）。
    // 任何失败（没有 WebGL 或只有软件渲染、着色器编译失败、绘制异常、上下文丢失后无法恢复、页面帧率持续过低）都只关闭水体层并留一条警告，
    // 不影响鱼、水母与宿主的帧循环；没有任何后备画法。读取与写入存储、任务数据：一律没有。
    // 软件渲染的拦截有两道：failIfMajorPerformanceCaveat（部分环境有效）和渲染器名称检查（SwiftShader、llvmpipe 等；实测在 ANGLE + SwiftShader 里前者不拒绝，
    // 页面会被拖到每帧 200 多毫秒）；帧率自监控是第三道，兜住“硬件渲染但仍然太慢”的集成显卡或高分屏（先降到省流量画法，再慢就关）。
    // 自监控不看页面刚打开时的卡顿：预热期不计，页面还没流畅过也不监护（最晚等到 30 秒），否则首页启动期的卡顿会让海水层一打开就被关掉（见 aquarium-water-core.js 的 GOV_* 说明）。

    const CANVAS_CLASS = 'aq-water';
    const ROOT_ID = 'background-experience-root';
    const CONTEXT_OPTIONS = Object.freeze({
        alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: true,       // 只有软件渲染时宁可不画：全屏着色器放在 CPU 上会拖慢整个页面
    });

    function compile(gl, type, source) {
        const item = gl.createShader(type);
        gl.shaderSource(item, source);
        gl.compileShader(item);
        if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(item);
            gl.deleteShader(item);
            throw new Error(`着色器编译失败：${log}`);
        }
        return item;
    }

    function create(env = {}) {
        const doc = env.document !== undefined ? env.document : (typeof document !== 'undefined' ? document : null);
        const warn = env.warn || (message => { if (typeof console !== 'undefined') console.warn(message); });
        const nowMs = env.now || (() => (root && root.performance ? root.performance.now() : Date.now()));
        const hourNow = env.hour || (() => new Date().getHours());
        const nightAmount = hour => {
            const fn = env.nightAmount || (root && root.JellyfishCore && root.JellyfishCore.nightAmount);
            return typeof fn === 'function' ? fn(hour) : 0;
        };

        let started = false;
        let failed = false;
        let reason = '';
        let canvas = null;
        let gl = null;
        let program = null;
        let buffer = null;
        let shaders = [];
        let locations = null;
        const handlers = { lost: null, restored: null };
        let lost = false;
        let last = -Infinity;
        let frames = 0;
        let width = 0;
        let height = 0;
        let governor = Core.createGovernor();

        function release() {
            if (gl) {
                try {
                    if (program) gl.deleteProgram(program);
                    for (const item of shaders) gl.deleteShader(item);
                    if (buffer) gl.deleteBuffer(buffer);
                } catch { /* 上下文已丢失时这些调用没有意义 */ }
            }
            program = null;
            buffer = null;
            shaders = [];
            locations = null;
        }

        function destroy() {
            release();
            if (canvas) {
                // 先摘掉监听再主动丢弃上下文：loseContext() 会让浏览器稍后（异步）在这张旧画布上触发 webglcontextlost，
                // 那时可能已经重新 start 并建好了新画布；处理函数另外按画布身份核对，摘不掉（没有 removeEventListener）时也不会误伤新画布
                try {
                    if (typeof canvas.removeEventListener === 'function') {
                        if (handlers.lost) canvas.removeEventListener('webglcontextlost', handlers.lost);
                        if (handlers.restored) canvas.removeEventListener('webglcontextrestored', handlers.restored);
                    }
                } catch { /* 忽略 */ }
                handlers.lost = null;
                handlers.restored = null;
                try {
                    if (gl) { const ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); }
                } catch { /* 忽略 */ }
                try { if (typeof canvas.remove === 'function') canvas.remove(); else if (canvas.parentNode) canvas.parentNode.removeChild(canvas); } catch { /* 忽略 */ }
            }
            canvas = null;
            gl = null;
            lost = false;
            width = 0;
            height = 0;
        }

        function fail(why, error) {
            if (!failed) warn(`[AquariumWater] ${why}${error && error.message ? `：${error.message}` : ''}，本次会话关闭海水效果`);
            failed = true;
            reason = why;
            destroy();
            return false;
        }

        /** 编译、链接并准备顶点缓冲（建立与上下文恢复后重建共用）；失败抛错。 */
        function setup() {
            const vertex = compile(gl, gl.VERTEX_SHADER, Shader.VERTEX);
            shaders.push(vertex);
            const fragment = compile(gl, gl.FRAGMENT_SHADER, Shader.FRAGMENT);
            shaders.push(fragment);
            program = gl.createProgram();
            gl.attachShader(program, vertex);
            gl.attachShader(program, fragment);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('着色器链接失败');
            gl.useProgram(program);
            buffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const position = gl.getAttribLocation(program, 'aPos');
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            locations = {};
            for (const name of Shader.UNIFORMS) locations[name] = gl.getUniformLocation(program, name);
        }

        function onLost(owner, event) {
            if (owner !== canvas) return;       // 已经销毁的旧画布迟到的事件：与当前画布无关，也不要求浏览器恢复它
            if (event && typeof event.preventDefault === 'function') event.preventDefault();     // 允许浏览器之后恢复上下文
            lost = true;
            program = null;
            buffer = null;
            shaders = [];
            locations = null;
        }

        function onRestored(owner) {
            if (owner !== canvas || !gl) return;
            try {
                setup();
                gl.viewport(0, 0, canvas.width, canvas.height);
                lost = false;
                last = -Infinity;
            } catch (error) {
                fail('上下文恢复后重建失败', error);
            }
        }

        /** 建立画布与上下文；失败返回 false（并已记为 failed）。 */
        function build(size) {
            if (!doc || typeof doc.createElement !== 'function') return fail('没有 document');
            const body = doc.body;
            if (!body) return fail('页面还没有 body');
            const element = doc.createElement('canvas');
            element.className = CANVAS_CLASS;
            if (typeof element.setAttribute === 'function') element.setAttribute('aria-hidden', 'true');
            element.width = size.w;
            element.height = size.h;
            let context = null;
            try { context = element.getContext('webgl', CONTEXT_OPTIONS); } catch { context = null; }
            if (!context) return fail('没有可用的 WebGL（或只有软件渲染）');
            canvas = element;
            gl = context;
            // 只有 CPU 软件渲染（SwiftShader / llvmpipe 等）：全屏着色器会把页面拖到每帧几百毫秒，宁可不画
            let rendererName = '';
            try {
                const info = gl.getExtension('WEBGL_debug_renderer_info');
                if (info) rendererName = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
            } catch { /* 读不到渲染器名称就当作硬件渲染，交给帧率自监控兜底 */ }
            if (Core.isSoftwareRenderer(rendererName)) return fail('只有软件渲染（' + rendererName.slice(0, 60) + '）');
            try {
                setup();
                gl.viewport(0, 0, size.w, size.h);
            } catch (error) {
                return fail('着色器准备失败', error);
            }
            const owner = canvas;
            handlers.lost = event => onLost(owner, event);
            handlers.restored = () => onRestored(owner);
            canvas.addEventListener('webglcontextlost', handlers.lost);
            canvas.addEventListener('webglcontextrestored', handlers.restored);
            // 放在宿主根容器之前（z-index 由样式决定为 1，在壁纸与根容器之间）；找不到根容器就追加到 body
            const host = typeof doc.getElementById === 'function' ? doc.getElementById(ROOT_ID) : null;
            if (host && host.parentNode === body && typeof body.insertBefore === 'function') body.insertBefore(canvas, host);
            else body.appendChild(canvas);
            width = size.w;
            height = size.h;
            return true;
        }

        function start() {
            if (started) return;
            started = true;
            failed = false;
            reason = '';
            last = -Infinity;
            frames = 0;
            governor = Core.createGovernor();
            // 画布与上下文等第一帧（有页面尺寸时）才建：start 本身没有任何副作用
        }

        function stop() {
            if (!started) return;
            started = false;
            destroy();
            last = -Infinity;
        }

        /**
         * 由宿主在它自己的 RAF 里每帧调用（在鱼和水母之前，与它们无关）：该画时推进并画一帧。返回是否在运行（节流跳过的帧也算在运行）。
         * options：{ width, height, now?, amount?, night?, nightHour?, lowPower? }；night === false 表示夜晚效果被设置关掉（按白天算）。
         */
        function frame(options = {}) {
            if (!started || failed) return false;
            const now = Number.isFinite(options.now) ? options.now : nowMs();
            // 帧率自监控：预热期与页面还没流畅过之前不判定（页面启动期的卡顿不是海水层造成的）；监护开始后页面明显变慢就先降到省流量画法，再慢就关掉（装饰效果不能拖累页面）
            const level = governor.observe(now);
            if (level >= 2) return fail('页面帧率过低', new Error('海水层开启后帧率持续过低'));
            const lowPower = !!options.lowPower || level >= 1;
            const size = Core.bandSize({ width: options.width, height: options.height, lowPower });
            if (!size) return false;
            try {
                if (!canvas && !build(size)) return false;
                if (lost) return true;
                if (!Core.frameDue({ now, last, lowPower })) return true;
                if (width !== size.w || height !== size.h) {
                    canvas.width = size.w;
                    canvas.height = size.h;
                    gl.viewport(0, 0, size.w, size.h);
                    width = size.w;
                    height = size.h;
                }
                const night = options.night === false ? 0 : nightAmount(Number.isFinite(options.nightHour) ? options.nightHour : hourNow());
                const u = Core.uniformsFor({ now, amount: options.amount, night, lowPower, width: options.width, height: options.height });
                gl.uniform2f(locations.uRes, width, height);
                gl.uniform1f(locations.uBand, u.band);
                gl.uniform1f(locations.uAspect, u.aspect);
                gl.uniform1f(locations.uTime, u.time);
                gl.uniform1f(locations.uNight, u.night);
                gl.uniform1f(locations.uAmount, u.amount);
                gl.uniform1f(locations.uQuality, u.quality);
                gl.uniform1f(locations.uTop, u.top);
                gl.uniform1f(locations.uReach, u.reach);
                gl.uniform1f(locations.uTideV, u.tideV);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
                last = now;
                frames++;
                if (frames === 1 && canvas.classList && typeof canvas.classList.add === 'function') canvas.classList.add('is-on');    // 第一帧画完才淡入
                return true;
            } catch (error) {
                return fail('绘制出错', error);
            }
        }

        /**
         * 此刻岸线能到的最高处（占页面高度的比例，从页面底边往上量；见 Core.shoreTopAt）。水体层没在运行、还没画出第一帧或已关闭时返回 null。
         * now 取宿主传给 frame 的同一个时间戳，鱼看到的岸线和画面上的岸线才是同一条。
         */
        function shore(now) {
            if (!started || failed || !canvas || frames < 1) return null;
            const at = Number.isFinite(now) ? now : nowMs();
            return Core.shoreTopAt(Core.shaderTime(at));
        }

        return {
            start, stop, frame, shore,
            isActive: () => started && !failed,
            state: () => ({ started, failed, reason, lost, frames, width, height, hasCanvas: !!canvas, level: governor.level(), armed: governor.armed() }),
            _canvas: () => canvas,
        };
    }

    return { create, CANVAS_CLASS, CONTEXT_OPTIONS };
});
