(function attachTetris3DGame(global) {
    'use strict';

    const tetrisRef =
        typeof require !== 'undefined'
            ? require('./tetris-game.js')
            : global.TetrisGame || {};

    const mapperRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-voxel-mapper.js')
            : global.Tetris3DVoxelMapper || {};

    const rendererRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-renderer.js')
            : global.Tetris3DRenderer || {};

    const tiersRef =
        typeof require !== 'undefined'
            ? require('./tetris-effect-tiers.js')
            : global.TetrisEffectTiers || {};

    const fxRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-fx.js')
            : global.Tetris3DFx || {};

    const platformRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-platform.js')
            : global.Tetris3DPlatform || {};

    const { createTetrisGameCore } = tetrisRef;
    const { mapSnapshotToVoxelScene } = mapperRef;
    const { Tetris3DRenderer, resolveRenderMode } = rendererRef;
    const { pickTierFromHints } = tiersRef;
    const {
        detectLineClearForAnim,
        computeLineClearT01,
        createTetris3DSound
    } = fxRef;
    const { createTetris3DPlatform } = platformRef;

    const BASE_INTERVAL_MS = 520;
    const LOGICAL_WIDTH_DEFAULT = 300;
    const LOGICAL_HEIGHT_DEFAULT = 600;

    /** @typedef {'webgl'|'canvas2d'} RenderMode */

    /**
     * 键盘仅在面板打开且面板持有焦点时生效（ADR §6.5 / Spike R4）。
     *
     * @param {HTMLElement|null|undefined} panel
     * @param {Element|null|undefined} activeElement
     * @returns {boolean}
     */
    function shouldAcceptKeyboardInput(panel, activeElement) {
        if (!panel || !panel.classList.contains('open')) {
            return false;
        }
        if (!activeElement) {
            return false;
        }
        return panel === activeElement || panel.contains(activeElement);
    }

    /**
     * @param {number} level
     * @param {number} [baseIntervalMs]
     * @returns {number}
     */
    function computeGravityTickMs(level, baseIntervalMs) {
        const base = baseIntervalMs ?? BASE_INTERVAL_MS;
        const step = Math.min(320, 20 * Math.max(0, level));
        return Math.max(120, base - step);
    }

    /**
     * 重力 tick 调度（纯函数，供 rAF 循环与单测共用）。
     *
     * @param {number} nowMs
     * @param {number} lastGravityAtMs
     * @param {number} tickMs
     * @param {boolean} isPaused
     * @param {boolean} gameOver
     * @returns {{ shouldTick: boolean, nextLastGravityAtMs: number }}
     */
    function planGravityTick(nowMs, lastGravityAtMs, tickMs, isPaused, gameOver) {
        if (isPaused || gameOver) {
            return { shouldTick: false, nextLastGravityAtMs: lastGravityAtMs };
        }
        const elapsed = nowMs - lastGravityAtMs;
        if (elapsed < tickMs) {
            return { shouldTick: false, nextLastGravityAtMs: lastGravityAtMs };
        }
        return { shouldTick: true, nextLastGravityAtMs: nowMs };
    }

    /**
     * @param {string} code KeyboardEvent.code
     * @returns {'moveLeft'|'moveRight'|'rotateCW'|'softDrop'|'hardDrop'|'togglePause'|null}
     */
    function mapKeyCodeToAction(code) {
        const keyMapMove = {
            ArrowLeft: 'moveLeft',
            ArrowRight: 'moveRight',
            KeyA: 'moveLeft',
            KeyD: 'moveRight'
        };
        if (keyMapMove[code]) {
            return keyMapMove[code];
        }
        if (code === 'ArrowUp' || code === 'KeyX' || code === 'KeyK') {
            return 'rotateCW';
        }
        if (code === 'ArrowDown' || code === 'KeyS') {
            return 'softDrop';
        }
        if (code === 'Space') {
            return 'togglePause';
        }
        if (code === 'KeyC' || code === 'ArrowEnd') {
            return 'hardDrop';
        }
        return null;
    }

    /**
     * 对确定性内核执行键盘动作（纯函数）。
     *
     * @param {ReturnType<typeof createTetrisGameCore>} core
     * @param {'moveLeft'|'moveRight'|'rotateCW'|'softDrop'|'hardDrop'|'togglePause'} action
     * @param {{ isPaused?: boolean, togglePause?: () => void }} [ctx]
     * @returns {{ gameOver: boolean, toggledPause?: boolean }}
     */
    function applyInputAction(core, action, ctx) {
        const state = core.getState();
        if (state.gameOver && action !== 'togglePause') {
            return { gameOver: true };
        }

        if (action === 'togglePause') {
            if (state.gameOver) {
                return { gameOver: true };
            }
            ctx?.togglePause?.();
            return { gameOver: false, toggledPause: true };
        }

        if (ctx?.isPaused) {
            return { gameOver: state.gameOver };
        }

        switch (action) {
            case 'moveLeft':
                core.moveHorizontal(-1);
                break;
            case 'moveRight':
                core.moveHorizontal(1);
                break;
            case 'rotateCW':
                core.rotateCW();
                break;
            case 'softDrop': {
                const after = core.softDrop();
                return { gameOver: after.gameOver };
            }
            case 'hardDrop': {
                const after = core.hardDrop();
                return { gameOver: after.gameOver };
            }
            default:
                break;
        }

        return { gameOver: core.getState().gameOver };
    }

    /**
     * @param {RenderMode} mode
     * @returns {string}
     */
    function formatRenderModeLabel(mode) {
        return mode === 'webgl' ? '3D' : '2D 降级';
    }

    /**
     * 对内核 tick/softDrop/hardDrop 包装：检测消行并触发 FX（纯函数）。
     *
     * @param {ReturnType<typeof createTetrisGameCore>} core
     * @param {() => import('./tetris-game.js').TetrisCoreState} runFn
     * @param {number} nowMs
     * @param {object|null} activeAnim
     * @returns {{ state: import('./tetris-game.js').TetrisCoreState, lineClearAnim: object|null, linesCleared: number }}
     */
    function runCoreWithLineClearFx(core, runFn, nowMs, activeAnim) {
        const before = core.getState();
        const state = runFn();
        const anim =
            detectLineClearForAnim(before, state, nowMs) ||
            (activeAnim &&
            computeLineClearT01(
                activeAnim.startMs,
                nowMs,
                activeAnim.durationMs
            ) !== null
                ? activeAnim
                : null);
        const linesCleared = Math.max(0, state.lines - before.lines);
        return { state, lineClearAnim: anim, linesCleared };
    }

    /**
     * @param {object|null} anim
     * @param {number} nowMs
     * @returns {object|null}
     */
    function resolveActiveLineClearAnim(anim, nowMs) {
        if (!anim) return null;
        const t01 = computeLineClearT01(anim.startMs, nowMs, anim.durationMs);
        if (t01 === null) return null;
        return Object.freeze(Object.assign({}, anim, { t01 }));
    }

    class Tetris3DGameManager {
        /**
         * @param {object} [options]
         * @param {'low'|'medium'|'high'|null} [options.effectTierId]
         * @param {RenderMode} [options.renderModeOverride]
         * @param {boolean} [options.forceCanvas2d]
         * @param {typeof createTetrisGameCore} [options.createCoreFn]
         * @param {typeof Tetris3DRenderer} [options.RendererClass]
         * @param {typeof resolveRenderMode} [options.resolveRenderModeFn]
         * @param {ReturnType<typeof createTetris3DPlatform>} [options.platform]
         * @param {ReturnType<typeof createTetris3DSound>} [options.sound]
         */
        constructor(options) {
            const opts = options || {};
            this.createCoreFn = opts.createCoreFn || createTetrisGameCore;
            this.RendererClass = opts.RendererClass || Tetris3DRenderer;
            this.resolveRenderModeFn = opts.resolveRenderModeFn || resolveRenderMode;
            this.platform =
                opts.platform ||
                createTetris3DPlatform({
                    activityLogger:
                        typeof global !== 'undefined' && global.activityLogger
                            ? global.activityLogger
                            : null
                });
            this.sound = opts.sound || createTetris3DSound();
            this.soundEnabled = this.platform.getSoundEnabled();

            this.core = this.createCoreFn({ cols: 10, rows: 20 });
            this.effectTierId = opts.effectTierId ?? null;
            this.renderModeOverride = opts.renderModeOverride ?? null;
            this.forceCanvas2d = Boolean(opts.forceCanvas2d);

            this.baseIntervalMs = BASE_INTERVAL_MS;
            this.logicalWidth = LOGICAL_WIDTH_DEFAULT;
            this.logicalHeight = LOGICAL_HEIGHT_DEFAULT;

            this.isPaused = true;
            /** @type {import('./tetris-3d-renderer.js').Tetris3DRenderer|null} */
            this.renderer = null;
            this.rendererReady = false;
            this.activeRenderMode = null;
            this.probeReason = null;

            this._rafId = null;
            this._lastGravityAtMs = 0;
            this._ensureRendererPromise = null;

            this.panel = null;
            this.viewportEl = null;
            this.scoreEl = null;
            this.linesEl = null;
            this.statusEl = null;
            this.modeBadgeEl = null;
            this.toggleBtn = null;
            this.restartBtn = null;
            this.soundToggleBtn = null;

            /** @type {object|null} */
            this._lineClearAnim = null;
            this._sessionStartedAtMs = null;
            this._sessionStartTracked = false;
            this._gameFinishTracked = false;
            this._probeTracked = false;

            /** @type {(event: KeyboardEvent) => void|null} */
            this._onKeyDown = null;
            /** @type {() => void|null} */
            this._onWindowResize = null;
        }

        init() {
            this.bindElements();
            this.bindEvents();
            this.updateHud();
            this.setStatus('已就绪，点击「开始」启动');
        }

        bindElements() {
            this.panel = document.getElementById('tetris-3d-game-panel');
            this.viewportEl = document.getElementById('tetris-3d-viewport');
            this.scoreEl = document.getElementById('tetris-3d-game-score');
            this.linesEl = document.getElementById('tetris-3d-game-lines');
            this.statusEl = document.getElementById('tetris-3d-game-status');
            this.modeBadgeEl = document.getElementById('tetris-3d-render-mode');
            this.toggleBtn = document.getElementById('tetris-3d-game-toggle');
            this.restartBtn = document.getElementById('tetris-3d-game-restart');
            this.soundToggleBtn = document.getElementById('tetris-3d-sound-toggle');

            if (this.viewportEl) {
                this.logicalWidth =
                    Number(this.viewportEl.dataset.logicalWidth) || LOGICAL_WIDTH_DEFAULT;
                this.logicalHeight =
                    Number(this.viewportEl.dataset.logicalHeight) || LOGICAL_HEIGHT_DEFAULT;
            }

            if (this.panel && !this.panel.hasAttribute('tabindex')) {
                this.panel.setAttribute('tabindex', '-1');
            }
        }

        bindEvents() {
            const dockBtn = document.getElementById('tetris-3d-dock-btn');
            const closeBtn = document.getElementById('tetris-3d-game-close');

            dockBtn?.addEventListener('click', () => {
                void this.togglePanel();
            });
            closeBtn?.addEventListener('click', () => {
                this.hidePanel();
            });
            this.toggleBtn?.addEventListener('click', () => this.togglePause());
            this.restartBtn?.addEventListener('click', () => this.restart());
            this.soundToggleBtn?.addEventListener('click', () => this.toggleSound());
            this.refreshSoundToggle();

            this.panel?.addEventListener('mousedown', () => {
                this.panel?.focus({ preventScroll: true });
            });

            this._onKeyDown = event => {
                if (!shouldAcceptKeyboardInput(this.panel, document.activeElement)) {
                    return;
                }
                const action = mapKeyCodeToAction(event.code);
                if (!action) return;

                event.preventDefault();
                this.handleInputAction(action);
            };
            document.addEventListener('keydown', this._onKeyDown);

            this._onWindowResize = () => {
                if (!this.rendererReady || !this.viewportEl) return;
                const rect = this.viewportEl.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    this.renderer?.resize(rect.width, rect.height);
                    this.renderScene();
                }
            };
            window.addEventListener('resize', this._onWindowResize);
        }

        /**
         * @param {'moveLeft'|'moveRight'|'rotateCW'|'softDrop'|'hardDrop'|'togglePause'} action
         */
        handleInputAction(action) {
            if (action === 'togglePause') {
                const result = applyInputAction(this.core, action, {
                    isPaused: this.isPaused,
                    togglePause: () => this.togglePause()
                });
                if (result.gameOver) return;
                this.updateHud();
                this.renderScene();
                return;
            }

            if (action === 'softDrop' || action === 'hardDrop') {
                const state = this.core.getState();
                if (this.isPaused || state.gameOver) return;

                const nowMs = this._nowMs();
                const runFn =
                    action === 'softDrop'
                        ? () => this.core.softDrop()
                        : () => this.core.hardDrop();
                const fx = runCoreWithLineClearFx(
                    this.core,
                    runFn,
                    nowMs,
                    this._lineClearAnim
                );
                this._applyLineClearFx(fx);
                this.updateHud();
                this.renderScene();
                return;
            }

            const result = applyInputAction(this.core, action, {
                isPaused: this.isPaused,
                togglePause: () => this.togglePause()
            });

            if (result.gameOver) {
                this._onGameOver();
            }

            this.updateHud();
            this.renderScene();
        }

        _nowMs() {
            return typeof performance !== 'undefined' ? performance.now() : Date.now();
        }

        /**
         * @param {{ lineClearAnim: object|null, linesCleared: number, state: object }} fx
         */
        _applyLineClearFx(fx) {
            if (fx.lineClearAnim) {
                this._lineClearAnim = fx.lineClearAnim;
            }
            if (fx.linesCleared > 0 && this.soundEnabled) {
                this.sound.playLineClear(fx.linesCleared);
            }
            if (fx.state.gameOver) {
                this._onGameOver();
            }
        }

        _trackProbeResult(probe) {
            if (this._probeTracked) return;
            this._probeTracked = true;
            this.platform.track('probe_result', {
                renderMode: probe?.mode || this.activeRenderMode,
                probeReason: probe?.reason || this.probeReason,
                glVersion: probe?.glVersion
            });
        }

        _trackGameStart() {
            if (this._sessionStartTracked) return;
            this._sessionStartTracked = true;
            this._sessionStartedAtMs = this._nowMs();
            this.platform.track('game_start', {
                renderMode: this.activeRenderMode,
                probeReason: this.probeReason,
                effectTierId: this.effectTierId || undefined
            });
        }

        _trackGameFinish(state) {
            if (this._gameFinishTracked) return;
            this._gameFinishTracked = true;
            const durationMs =
                this._sessionStartedAtMs !== null
                    ? Math.round(this._nowMs() - this._sessionStartedAtMs)
                    : 0;
            this.platform.track('game_finish', {
                durationMs,
                score: state.score,
                lines: state.lines,
                level: state.level,
                renderMode: this.activeRenderMode,
                completed: true
            });
        }

        _trackPanelAbort() {
            if (!this._sessionStartTracked || this._gameFinishTracked) return;
            const state = this.core.getState();
            const durationMs =
                this._sessionStartedAtMs !== null
                    ? Math.round(this._nowMs() - this._sessionStartedAtMs)
                    : 0;
            this.platform.track('panel_abort', {
                durationMs,
                score: state.score,
                lines: state.lines,
                level: state.level,
                renderMode: this.activeRenderMode,
                completed: false
            });
        }

        _onGameOver() {
            this.pause();
            this.setStatus('游戏结束，按「重新开始」再来一局');
            this._trackGameFinish(this.core.getState());
        }

        _resetSessionTracking() {
            this._sessionStartedAtMs = null;
            this._sessionStartTracked = false;
            this._gameFinishTracked = false;
            this._lineClearAnim = null;
        }

        toggleSound() {
            this.soundEnabled = !this.soundEnabled;
            this.platform.setSoundEnabled(this.soundEnabled);
            this.refreshSoundToggle();
        }

        refreshSoundToggle() {
            if (!this.soundToggleBtn) return;
            this.soundToggleBtn.textContent = this.soundEnabled ? '音效开' : '音效关';
            this.soundToggleBtn.setAttribute(
                'aria-pressed',
                this.soundEnabled ? 'true' : 'false'
            );
        }

        buildRenderFx(nowMs) {
            const state = this.core.getState();
            const lineClearAnim = resolveActiveLineClearAnim(
                this._lineClearAnim,
                nowMs ?? this._nowMs()
            );
            if (!lineClearAnim && this._lineClearAnim) {
                this._lineClearAnim = null;
            } else if (lineClearAnim) {
                this._lineClearAnim = lineClearAnim;
            }
            return {
                coreState: state,
                lineClearAnim: lineClearAnim || undefined
            };
        }

        isPanelOpen() {
            return Boolean(this.panel && this.panel.classList.contains('open'));
        }

        async togglePanel() {
            if (!this.panel) return;
            const willOpen = !this.isPanelOpen();
            this.panel.classList.toggle('open', willOpen);
            const dockBtn = document.getElementById('tetris-3d-dock-btn');
            dockBtn?.classList.toggle('active', willOpen);

            if (willOpen) {
                this.panel.focus({ preventScroll: true });
                await this.ensureRenderer();
                this._lastGravityAtMs =
                    typeof performance !== 'undefined' ? performance.now() : Date.now();
                this.startRenderLoop();
                this.renderScene();
            } else {
                this.hidePanel();
            }
        }

        hidePanel() {
            if (!this.panel) return;
            this._trackPanelAbort();
            this.panel.classList.remove('open');
            document.getElementById('tetris-3d-dock-btn')?.classList.remove('active');
            this.pause();
            this.stopRenderLoop();
            this.destroyRenderer();
        }

        /**
         * 懒加载渲染器：Probe → Three（WebGL）或 Canvas 2D。
         *
         * @returns {Promise<void>}
         */
        async ensureRenderer() {
            if (this.rendererReady) {
                return;
            }
            if (this._ensureRendererPromise) {
                return this._ensureRendererPromise;
            }

            this._ensureRendererPromise = this._initRendererInternal();
            try {
                await this._ensureRendererPromise;
            } finally {
                this._ensureRendererPromise = null;
            }
        }

        async _initRendererInternal() {
            if (!this.viewportEl) {
                throw new Error('Tetris3DGameManager: viewport element missing');
            }

            const probe = this.resolveRenderModeFn({
                forceCanvas2d: this.forceCanvas2d,
                renderModeOverride: this.renderModeOverride
            });

            const tierId =
                this.effectTierId ||
                (typeof pickTierFromHints === 'function'
                    ? pickTierFromHints({
                          hardwareConcurrency:
                              typeof navigator !== 'undefined'
                                  ? navigator.hardwareConcurrency
                                  : undefined,
                          deviceMemory:
                              typeof navigator !== 'undefined'
                                  ? navigator.deviceMemory
                                  : undefined,
                          saveData:
                              typeof navigator !== 'undefined' &&
                              navigator.connection &&
                              navigator.connection.saveData === true,
                          prefersReducedMotion:
                              typeof window !== 'undefined' &&
                              typeof window.matchMedia === 'function' &&
                              window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      })
                    : 'medium');

            const renderer = new this.RendererClass({
                container: this.viewportEl,
                logicalWidth: this.logicalWidth,
                logicalHeight: this.logicalHeight,
                effectTierId: tierId,
                renderMode: probe.mode
            });

            if (probe.mode === 'webgl') {
                await renderer.ensureThree();
            }

            renderer.init();

            const rect = this.viewportEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                renderer.resize(rect.width, rect.height);
            }

            this.renderer = renderer;
            this.rendererReady = true;
            this.activeRenderMode = renderer.activeRenderMode;
            this.probeReason = probe.reason;
            this.updateRenderModeBadge();
            this._trackProbeResult(probe);
        }

        destroyRenderer() {
            if (this.renderer) {
                this.renderer.dispose();
                this.renderer = null;
            }
            this.rendererReady = false;
            this.activeRenderMode = null;
            this.probeReason = null;
        }

        getTickMs() {
            const st = this.core.getState();
            return computeGravityTickMs(st.level, this.baseIntervalMs);
        }

        start() {
            const state = this.core.getState();
            if (state.gameOver) return;
            this.isPaused = false;
            this._lastGravityAtMs = this._nowMs();
            this._trackGameStart();
            this.refreshButtons();
            this.setStatus('游戏进行中');
            this.startRenderLoop();
        }

        pause() {
            this.isPaused = true;
            this.refreshButtons();
        }

        togglePause() {
            const state = this.core.getState();
            if (state.gameOver) return;
            if (this.isPaused) {
                this.start();
            } else {
                this.pause();
                this.setStatus('游戏已暂停');
            }
        }

        restart() {
            this.core.reset();
            this._resetSessionTracking();
            this.pause();
            this._lastGravityAtMs = this._nowMs();
            this.updateHud();
            this.renderScene();
            this.setStatus('已重置，点击「开始」启动');
        }

        refreshButtons() {
            if (this.toggleBtn) {
                this.toggleBtn.textContent = this.isPaused ? '开始' : '暂停';
            }
        }

        setStatus(text) {
            if (this.statusEl) {
                this.statusEl.textContent = text;
            }
        }

        updateRenderModeBadge() {
            if (!this.modeBadgeEl || !this.activeRenderMode) return;
            this.modeBadgeEl.textContent = formatRenderModeLabel(this.activeRenderMode);
            this.modeBadgeEl.dataset.mode = this.activeRenderMode;
            if (this.probeReason) {
                this.modeBadgeEl.title = '渲染：' + this.probeReason;
            }
        }

        updateHud() {
            const state = this.core.getState();
            if (this.scoreEl) this.scoreEl.textContent = String(state.score);
            if (this.linesEl) this.linesEl.textContent = String(state.lines);
        }

        renderScene() {
            if (!this.rendererReady || !this.renderer) return;
            const state = this.core.getState();
            const scene = mapSnapshotToVoxelScene(state);
            this.renderer.render(scene, this.buildRenderFx());
        }

        /**
         * rAF 帧回调：重力 tick + 渲染（ADR §6.5）。
         *
         * @param {number} nowMs
         */
        onFrame(nowMs) {
            if (!this.isPanelOpen()) return;

            const state = this.core.getState();
            const plan = planGravityTick(
                nowMs,
                this._lastGravityAtMs,
                this.getTickMs(),
                this.isPaused,
                state.gameOver
            );

            if (plan.shouldTick) {
                const fx = runCoreWithLineClearFx(
                    this.core,
                    () => this.core.tick(),
                    nowMs,
                    this._lineClearAnim
                );
                this._lastGravityAtMs = plan.nextLastGravityAtMs;
                this._applyLineClearFx(fx);
                this.updateHud();
            }

            if (this.rendererReady) {
                this.renderScene();
            }
        }

        startRenderLoop() {
            if (this._rafId !== null) return;
            if (typeof requestAnimationFrame !== 'function') return;

            const loop = now => {
                this.onFrame(now);
                if (this.isPanelOpen()) {
                    this._rafId = requestAnimationFrame(loop);
                } else {
                    this._rafId = null;
                }
            };
            this._rafId = requestAnimationFrame(loop);
        }

        stopRenderLoop() {
            if (this._rafId !== null && typeof cancelAnimationFrame === 'function') {
                cancelAnimationFrame(this._rafId);
            }
            this._rafId = null;
        }

        destroy() {
            this.hidePanel();
            if (this._onKeyDown) {
                document.removeEventListener('keydown', this._onKeyDown);
                this._onKeyDown = null;
            }
            if (this._onWindowResize) {
                window.removeEventListener('resize', this._onWindowResize);
                this._onWindowResize = null;
            }
            this.destroyRenderer();
            this.sound?.dispose?.();
        }
    }

    const api = {
        Tetris3DGameManager,
        BASE_INTERVAL_MS,
        LOGICAL_WIDTH_DEFAULT,
        LOGICAL_HEIGHT_DEFAULT,
        shouldAcceptKeyboardInput,
        computeGravityTickMs,
        planGravityTick,
        mapKeyCodeToAction,
        applyInputAction,
        formatRenderModeLabel,
        runCoreWithLineClearFx,
        resolveActiveLineClearAnim
    };

    global.Tetris3DGame = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.Tetris3DGame && !window.tetris3DGameManager) {
            const manager = new window.Tetris3DGame.Tetris3DGameManager();
            manager.init();
            window.tetris3DGameManager = manager;
        }
    });
}
