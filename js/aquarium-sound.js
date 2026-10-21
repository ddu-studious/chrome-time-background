(function (root, factory) {
    'use strict';
    const cjs = typeof module === 'object' && module.exports;
    const core = cjs ? require('./aquarium-sound-core.js') : root && root.AquariumSoundCore;
    const api = factory(core);
    if (cjs) module.exports = api;
    if (root) root.AquariumSound = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 水族馆水下环境音：粉红噪声 + 低频嗡鸣 + 偶尔的气泡“啵”。默认关，须用户手势才能响（浏览器自动播放策略）。
    // 规则在 aquarium-sound-core.js；本文件只接线 Web Audio。不联网、不读文件、不写存储。

    const P = Core.PARAMS;

    /**
     * 新建控制器。
     * env：{ AudioContext, random, now, warn } 均可注入（测试用假上下文）。
     */
    function create(env = {}) {
        const AudioCtx = env.AudioContext || (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;
        const random = typeof env.random === 'function' ? env.random : Math.random;
        const now = typeof env.now === 'function' ? env.now : (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000);
        const warn = env.warn || (message => { if (typeof console !== 'undefined') console.warn(message); });

        let ctx = null;
        let master = null;
        let filter = null;
        let noiseGain = null;
        let droneGain = null;
        let noiseSrc = null;
        let drone = null;
        let wanted = false;           // 设置想开
        let running = false;          // 节点在跑
        let failed = false;
        let amount = 1;
        let night = 0;
        let nextBubbles = [];
        let bubbleTimer = null;
        let startCount = 0;
        let stopCount = 0;
        let bubbleCount = 0;
        let lastError = null;

        function teardown() {
            if (bubbleTimer && typeof clearTimeout === 'function') { clearTimeout(bubbleTimer); bubbleTimer = null; }
            try { if (noiseSrc) noiseSrc.stop(); } catch { /* already stopped */ }
            try { if (drone) drone.stop(); } catch { /* already stopped */ }
            noiseSrc = null; drone = null;
            noiseGain = null; droneGain = null; filter = null; master = null;
            if (ctx && typeof ctx.close === 'function') {
                try { const p = ctx.close(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* ignore */ }
            }
            ctx = null;
            running = false;
            nextBubbles = [];
        }

        function applyGain() {
            if (!master || !ctx) return;
            const g = Core.masterGain(amount, night);
            try {
                master.gain.cancelScheduledValues(ctx.currentTime);
                master.gain.setTargetAtTime(g, ctx.currentTime, 0.15);
            } catch {
                master.gain.value = g;
            }
        }

        function scheduleBubbles() {
            if (!running || !ctx || failed) return;
            if (bubbleTimer && typeof clearTimeout === 'function') { clearTimeout(bubbleTimer); bubbleTimer = null; }
            if (!nextBubbles.length) nextBubbles = Core.bubbleSchedule(ctx.currentTime, 4, random);
            const next = nextBubbles.shift();
            if (!next) return;
            const delayMs = Math.max(0, (next.at - ctx.currentTime) * 1000);
            bubbleTimer = setTimeout(() => {
                bubbleTimer = null;
                if (!running || !ctx || failed) return;
                try { fireBubble(next); bubbleCount++; } catch (error) { disable(error); return; }
                scheduleBubbles();
            }, delayMs);
        }

        function fireBubble(spec) {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = spec.freq;
            const t0 = ctx.currentTime;
            const dur = P.BUBBLE_MS / 1000;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(Math.max(0.001, spec.gain), t0 + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.connect(g); g.connect(master);
            osc.start(t0); osc.stop(t0 + dur + 0.02);
        }

        function disable(error) {
            if (failed) return;
            failed = true;
            lastError = error && error.message ? error.message : String(error);
            warn(`[AquariumSound] 出错，本次会话停用：${lastError}`);
            teardown();
        }

        function build() {
            if (!AudioCtx) throw new Error('没有 AudioContext');
            ctx = typeof env.context === 'object' && env.context ? env.context : new AudioCtx();
            master = ctx.createGain();
            master.gain.value = 0;
            master.connect(ctx.destination);
            filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = P.FILTER_HZ;
            filter.Q.value = P.FILTER_Q;
            filter.connect(master);
            noiseGain = ctx.createGain();
            noiseGain.gain.value = P.NOISE_GAIN;
            noiseGain.connect(filter);
            const samples = Core.pinkNoise(Math.round(P.SAMPLE_RATE * P.NOISE_SECONDS), random);
            const buffer = ctx.createBuffer(1, samples.length, P.SAMPLE_RATE);
            buffer.copyToChannel(samples, 0);
            noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = buffer;
            noiseSrc.loop = true;
            noiseSrc.connect(noiseGain);
            droneGain = ctx.createGain();
            droneGain.gain.value = P.DRONE_GAIN;
            droneGain.connect(filter);
            drone = ctx.createOscillator();
            drone.type = 'sine';
            drone.frequency.value = P.DRONE_HZ;
            drone.connect(droneGain);
            noiseSrc.start();
            drone.start();
            running = true;
            applyGain();
            // 淡入
            try {
                const g = Core.masterGain(amount, night);
                master.gain.setValueAtTime(0.0001, ctx.currentTime);
                master.gain.exponentialRampToValueAtTime(Math.max(0.001, g), ctx.currentTime + P.FADE_IN_S);
            } catch { /* 假上下文可能没有这些方法 */ }
            scheduleBubbles();
        }

        async function resumeIfNeeded() {
            if (!ctx || typeof ctx.resume !== 'function') return true;
            if (ctx.state === 'running') return true;
            try { await ctx.resume(); return ctx.state === 'running' || ctx.state === undefined; } catch (error) { disable(error); return false; }
        }

        /**
         * 打开。options：{ amount, night }。返回是否开始发声（被浏览器挡住自动播放时 running 仍为 true，但可能 suspended，须 gesture 后再 resume）。
         * 已经失败过、或没有 AudioContext、或 Core 缺失时返回 false。
         */
        async function start(options = {}) {
            if (failed || !Core) return false;
            wanted = true;
            if (Number.isFinite(options.amount)) amount = options.amount;
            if (Number.isFinite(options.night)) night = options.night;
            if (running) { applyGain(); return resumeIfNeeded(); }
            try {
                build();
                startCount++;
                return resumeIfNeeded();
            } catch (error) {
                disable(error);
                return false;
            }
        }

        /** 关闭并释放节点。 */
        function stop() {
            wanted = false;
            if (!running && !ctx) return;
            stopCount++;
            if (master && ctx) {
                try {
                    const t = ctx.currentTime;
                    master.gain.cancelScheduledValues(t);
                    master.gain.setTargetAtTime(0.0001, t, P.FADE_OUT_S / 3);
                } catch { /* ignore */ }
            }
            // 短延迟后拆掉，免得淡出被掐断；测试里没有 setTimeout 就立刻拆
            if (typeof setTimeout === 'function') {
                const dying = ctx;
                setTimeout(() => { if (ctx === dying) teardown(); }, Math.round(P.FADE_OUT_S * 1000) + 50);
                // 立刻标成不在跑，避免 stop 后又被 tick 继续排气泡
                if (bubbleTimer && typeof clearTimeout === 'function') { clearTimeout(bubbleTimer); bubbleTimer = null; }
                running = false;
            } else {
                teardown();
            }
        }

        /** 每帧/定时刷新：amount、night；页面隐藏时挂起，可见时若 wanted 则恢复。 */
        function tick(options = {}) {
            if (failed || !wanted) return;
            if (Number.isFinite(options.amount)) amount = options.amount;
            if (Number.isFinite(options.night)) night = options.night;
            if (options.hidden === true) {
                if (ctx && typeof ctx.suspend === 'function' && ctx.state === 'running') {
                    try { const p = ctx.suspend(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* ignore */ }
                }
                return;
            }
            if (!running) { void start({ amount, night }); return; }
            applyGain();
            void resumeIfNeeded();
        }

        function state() {
            return {
                wanted, running, failed, amount, night,
                ctxState: ctx ? ctx.state : 'none',
                startCount, stopCount, bubbleCount, lastError,
            };
        }

        return { start, stop, tick, state, _ctx: () => ctx };
    }

    return Object.freeze({ create, PARAMS: P });
});
