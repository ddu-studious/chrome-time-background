(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports)
        ? require('./jellyfish-core.js')
        : root && root.JellyfishCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && typeof document !== 'undefined') root.PomodoroJelly = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 番茄钟面板里的陪伴水母：面板打开时在计时器上方放一只小水母。
    //  · 专注计时中：放慢动作，像深呼吸一样安静地漂（Core 的 focus 情绪：推力减弱、两次收缩间隔拉长一倍）；
    //  · 休息计时中：活泼起来（Core 的 dance 情绪：每拍都收缩并摇摆）；暂停/未开始：平常的样子；
    //  · 一个专注“自然走完”时放一串庆祝气泡（由 memo.js 的 complete(natural) 路径调用 finish；跳过/重置/切标签不算）。
    // 纯视觉：不读写任何任务或番茄钟数据；画法、物理全部复用水母皮肤（jellyfish.js 的 draw、jellyfish-core.js 的世界）。
    // 只在面板可见、页面可见时占用一条 RAF；面板移除、页面隐藏、减少动态效果时没有动画。设置键 pomodoroJelly（默认开）。
    // 设计与限制见 docs/technical/jellyfish-pomodoro-water-music-grow-20261015.md。

    const HEIGHT = 150;               // 画布高度（CSS px）：要容得下钟罩、光晕和下垂的触须，否则会在画布边缘被硬切
    const HOME_Y = 0.42;              // 漫游中心的纵向位置（占画布高度的比例）：偏上，让触须有下垂的空间
    const MAX_DPR = 2;
    const FOCUS_BEAT_S = 2;           // 专注时一拍的时长（秒）：平时是 1 秒，慢一倍
    const SETTINGS_KEY = 'backgroundExperienceSettings';

    /** 计时状态 → 情绪目标。mode 是 'work' / 'short-break' / 'long-break'；只有在计时中才有情绪。 */
    function moodFor(state) {
        const running = !!state && state.running === true;
        const work = !state || state.mode === 'work';
        return { focus: running && work ? 1 : 0, dance: running && !work ? 0.8 : 0 };
    }

    function attach(host, env = {}) {
        const doc = env.document || (typeof document !== 'undefined' ? document : null);
        const win = env.window || (typeof window !== 'undefined' ? window : null);
        const chromeApi = env.chrome || (typeof chrome !== 'undefined' ? chrome : null);
        const Skin = env.skin || (win && win.JellyfishSkin) || null;
        const random = env.random || Math.random;
        const raf = env.requestAnimationFrame || (win && win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : null);
        const caf = env.cancelAnimationFrame || (win && win.cancelAnimationFrame ? win.cancelAnimationFrame.bind(win) : null);
        const nowMs = env.now || (() => (win && win.performance ? win.performance.now() : Date.now()));
        const reduceMotion = env.reduceMotion !== undefined
            ? !!env.reduceMotion
            : !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

        let canvas = null, ctx = null, world = null, jelly = null;
        let width = 0, dpr = 1;
        let destroyed = false, mounted = false;
        let frameRequest = null, lastTime = 0, beatAcc = 0;
        let state = { mode: 'work', running: false };
        let cheerPending = false;
        let visibilityListener = null;

        const usable = !!(host && doc && Skin && typeof Skin.draw === 'function' && raf && caf && !reduceMotion);

        async function enabled() {
            try {
                const area = chromeApi && chromeApi.storage && chromeApi.storage.sync;
                if (!area || typeof area.get !== 'function') return true;
                const result = await area.get(SETTINGS_KEY);
                const stored = result && result[SETTINGS_KEY];
                return !(stored && typeof stored === 'object' && stored.pomodoroJelly === false);
            } catch {
                return true;
            }
        }

        function measure() {
            // 用 clientWidth：面板入场时带 scale，getBoundingClientRect 是缩放后的尺寸
            const w = Math.max(0, Math.floor(host.clientWidth || 0));
            return w;
        }

        function build() {
            width = measure() || 292;
            dpr = Math.min(MAX_DPR, Math.max(1, Number(win && win.devicePixelRatio) || 1));
            canvas = doc.createElement('canvas');
            canvas.className = 'pomodoro-jelly';
            canvas.setAttribute('aria-hidden', 'true');
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(HEIGHT * dpr);
            // 椭圆遮罩让画布四边柔和淡出到完全透明：光晕和触须即使伸到画布边缘也不会露出矩形或被硬切（透明小窗/画布边缘截断是这类绘制最常见的毛病）
            const fade = 'radial-gradient(ellipse closest-side at 50% 50%, #000 55%, transparent 100%)';
            canvas.style.cssText = `display:block;width:100%;height:${HEIGHT}px;margin:-24px 0 -4px;pointer-events:none;-webkit-mask-image:${fade};mask-image:${fade};`;
            ctx = canvas.getContext('2d');
            if (!ctx) { canvas = null; return false; }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (typeof host.insertBefore === 'function' && host.firstChild) host.insertBefore(canvas, host.firstChild);
            else host.appendChild(canvas);
            world = Core.createWorld({ width, height: HEIGHT, random, spirit: 'hype' });   // 休息时固定“嗨”，不随起舞轮换精神状态
            Core.reconcile(world, [{ key: 'pomodoro', id: null, label: '' }], { instant: true });
            jelly = world.jellies[0] || null;
            if (jelly) {
                jelly.home = { x: width / 2, y: HEIGHT * HOME_Y };      // 一直待在中间附近，不去别处漫游
                jelly.homeAt = Infinity;
                jelly.alpha = 1; jelly.state = 'alive';
            }
            return true;
        }

        function visible() {
            return !doc.hidden && !!canvas && canvas.isConnected !== false;
        }

        function schedule() {
            if (destroyed || !mounted || frameRequest !== null || !visible()) return;
            lastTime = nowMs();
            frameRequest = raf(frame);
        }

        function frame(time) {
            frameRequest = null;
            if (destroyed || !mounted) return;
            if (canvas.isConnected === false) { destroy(); return; }       // 面板被移除了：自己收拾干净
            if (!visible()) return;                                        // 页面隐藏：停，可见时 schedule 再启动
            const current = Number.isFinite(time) ? time : nowMs();
            const dtMs = Math.min(50, Math.max(0, current - lastTime));
            lastTime = current;
            const mood = moodFor(state);
            Core.setMood(world, mood);
            // 拍点：专注时一拍两秒（收缩间隔拉长一倍），平时一秒
            beatAcc += (dtMs / 1000) / (mood.focus > 0.5 ? FOCUS_BEAT_S : 1);
            Core.step(world, dtMs, { beat: Math.floor(beatAcc), pointer: null });
            if (cheerPending && jelly) {
                cheerPending = false;
                Core.celebrate(world, width / 2, HEIGHT * HOME_Y, { color: jelly.color, delay: 0 });
            }
            ctx.clearRect(0, 0, width, HEIGHT);
            ctx.globalCompositeOperation = 'screen';
            Skin.draw(ctx, world, Skin.PALETTE, 0.95, { labels: false, night: 0 });
            ctx.globalCompositeOperation = 'source-over';
            frameRequest = raf(frame);
        }

        function destroy() {
            if (destroyed) return;
            destroyed = true;
            if (frameRequest !== null && caf) caf(frameRequest);
            frameRequest = null;
            if (visibilityListener && doc) doc.removeEventListener('visibilitychange', visibilityListener);
            visibilityListener = null;
            if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
            canvas = ctx = world = jelly = null;
        }

        if (usable) {
            void enabled().then(on => {
                if (destroyed || !on || host.isConnected === false) return;
                if (!build()) return;
                mounted = true;
                visibilityListener = () => { if (!doc.hidden) schedule(); };
                doc.addEventListener('visibilitychange', visibilityListener);
                schedule();
            });
        }

        return {
            /** { mode, running }：计时状态变了就告诉它（只改情绪目标，当前情绪平滑过渡）。 */
            setState(next) {
                if (next && typeof next === 'object') state = { mode: typeof next.mode === 'string' ? next.mode : 'work', running: next.running === true };
            },
            /** 一个专注自然走完：下一帧放一串庆祝气泡（没挂上去就什么都不做）。 */
            finish() { if (mounted && !destroyed) cheerPending = true; },
            destroy,
            isMounted: () => mounted && !destroyed,
            _world: () => world,
        };
    }

    return { attach, moodFor, HEIGHT, HOME_Y, FOCUS_BEAT_S };
});
