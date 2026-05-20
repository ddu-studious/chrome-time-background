globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

const test = require('node:test');
const assert = require('node:assert/strict');

const { createTetrisGameCore } = require('../js/tetris-game.js');
const { mapSnapshotToVoxelScene } = require('../js/tetris-3d-voxel-mapper.js');
const {
    Tetris3DGameManager,
    shouldAcceptKeyboardInput,
    computeGravityTickMs,
    planGravityTick,
    mapKeyCodeToAction,
    applyInputAction,
    formatRenderModeLabel,
    runCoreWithLineClearFx,
    resolveActiveLineClearAnim
} = require('../js/tetris-3d-game.js');
const { createTetris3DPlatform } = require('../js/tetris-3d-platform.js');

function createMockRendererClass() {
    return class MockRenderer {
        constructor(options) {
            this.container = options.container;
            this.logicalWidth = options.logicalWidth;
            this.logicalHeight = options.logicalHeight;
            this.renderMode = options.renderMode;
            this.initCalled = false;
            this.disposeCalled = false;
            this.renderCalls = [];
        }

        get activeRenderMode() {
            return this.renderMode;
        }

        async ensureThree() {
            return {};
        }

        init() {
            this.initCalled = true;
            const canvas = {
                className: 'tetris-3d-canvas tetris-3d-canvas--2d',
                style: {},
                width: 300,
                height: 600,
                getContext() {
                    return {
                        fillRect() {},
                        strokeRect() {},
                        beginPath() {},
                        moveTo() {},
                        lineTo() {},
                        stroke() {},
                        fillStyle: ''
                    };
                }
            };
            this.container.appendChild(canvas);
            this.canvas = canvas;
        }

        render(scene, fx) {
            this.renderCalls.push({ scene, fx });
        }

        resize() {}

        dispose() {
            this.disposeCalled = true;
            if (this.container) {
                this.container.innerHTML = '';
            }
        }
    };
}

function createMockPanel(open) {
    const panel = {
        classList: {
            _open: Boolean(open),
            contains() {
                return true;
            },
            add(name) {
                if (name === 'open') this._open = true;
            },
            remove(name) {
                if (name === 'open') this._open = false;
            },
            toggle(name, force) {
                if (name === 'open') {
                    this._open = typeof force === 'boolean' ? force : !this._open;
                }
            }
        },
        className: 'tetris-3d-game-panel',
        contains() {
            return true;
        },
        focus() {},
        setAttribute() {},
        hasAttribute() {
            return false;
        },
        addEventListener() {},
        getBoundingClientRect() {
            return { width: 320, height: 420, top: 0, left: 0 };
        }
    };
    Object.defineProperty(panel.classList, 'contains', {
        value(name) {
            return name === 'open' ? panel.classList._open : false;
        }
    });
    return panel;
}

function installMockDom(panelOpen) {
    const panel = createMockPanel(panelOpen);
    const viewport = {
        dataset: { logicalWidth: '300', logicalHeight: '600' },
        innerHTML: '',
        appendChild(el) {
            this.lastChild = el;
        },
        getBoundingClientRect() {
            return { width: 320, height: 420 };
        }
    };

    const elements = {
        'tetris-3d-game-panel': panel,
        'tetris-3d-viewport': viewport,
        'tetris-3d-game-score': { textContent: '0' },
        'tetris-3d-game-lines': { textContent: '0' },
        'tetris-3d-game-status': { textContent: '' },
        'tetris-3d-render-mode': { textContent: '—', dataset: {}, title: '' },
        'tetris-3d-game-toggle': { textContent: '开始', addEventListener() {} },
        'tetris-3d-game-restart': { textContent: '重新开始', addEventListener() {} },
        'tetris-3d-sound-toggle': {
            textContent: '音效开',
            dataset: {},
            addEventListener() {},
            setAttribute() {}
        },
        'tetris-3d-dock-btn': { classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} },
        'tetris-3d-game-close': { addEventListener() {} }
    };

    const prevDoc = global.document;
    const prevWin = global.window;
    const prevRaf = global.requestAnimationFrame;
    const prevCancel = global.cancelAnimationFrame;
    const prevPerf = global.performance;

    global.document = {
        activeElement: panel,
        getElementById(id) {
            return elements[id] || null;
        },
        addEventListener() {},
        removeEventListener() {}
    };

    global.window = {
        addEventListener() {},
        removeEventListener() {},
        matchMedia() {
            return { matches: false };
        }
    };

    let rafId = 0;
    global.requestAnimationFrame = () => {
        rafId += 1;
        return rafId;
    };
    global.cancelAnimationFrame = () => {};
    global.performance = { now: () => 1000 };

    return () => {
        global.document = prevDoc;
        global.window = prevWin;
        global.requestAnimationFrame = prevRaf;
        global.cancelAnimationFrame = prevCancel;
        global.performance = prevPerf;
    };
}

test('Tetris3D GameManager：纯函数契约', async t => {
    await t.test('shouldAcceptKeyboardInput 仅在面板打开且聚焦时', () => {
        const panel = createMockPanel(false);
        assert.equal(shouldAcceptKeyboardInput(panel, panel), false);

        panel.classList.add('open');
        assert.equal(shouldAcceptKeyboardInput(panel, panel), true);
        assert.equal(shouldAcceptKeyboardInput(panel, null), false);
    });

    await t.test('computeGravityTickMs 随 level 加速', () => {
        assert.equal(computeGravityTickMs(0), 520);
        assert.equal(computeGravityTickMs(5), 420);
        assert.equal(computeGravityTickMs(16), 200);
    });

    await t.test('planGravityTick 暂停/GameOver 不 tick', () => {
        assert.deepEqual(planGravityTick(1000, 0, 520, true, false), {
            shouldTick: false,
            nextLastGravityAtMs: 0
        });
        assert.deepEqual(planGravityTick(1000, 0, 520, false, true), {
            shouldTick: false,
            nextLastGravityAtMs: 0
        });
    });

    await t.test('planGravityTick 间隔不足不 tick', () => {
        assert.deepEqual(planGravityTick(400, 0, 520, false, false), {
            shouldTick: false,
            nextLastGravityAtMs: 0
        });
    });

    await t.test('planGravityTick 到达间隔触发 tick', () => {
        assert.deepEqual(planGravityTick(600, 0, 520, false, false), {
            shouldTick: true,
            nextLastGravityAtMs: 600
        });
    });

    await t.test('mapKeyCodeToAction 映射完整', () => {
        assert.equal(mapKeyCodeToAction('ArrowLeft'), 'moveLeft');
        assert.equal(mapKeyCodeToAction('KeyD'), 'moveRight');
        assert.equal(mapKeyCodeToAction('KeyX'), 'rotateCW');
        assert.equal(mapKeyCodeToAction('KeyS'), 'softDrop');
        assert.equal(mapKeyCodeToAction('Space'), 'togglePause');
        assert.equal(mapKeyCodeToAction('KeyC'), 'hardDrop');
        assert.equal(mapKeyCodeToAction('Escape'), null);
    });

    await t.test('applyInputAction 移动与旋转', () => {
        const core = createTetrisGameCore({ randomFn: () => 0 });
        const beforeX = core.getState().current.x;

        applyInputAction(core, 'moveLeft');
        assert.equal(core.getState().current.x, beforeX - 1);

        applyInputAction(core, 'rotateCW');
        assert.equal(core.getState().current.rotation, 1);
    });

    await t.test('formatRenderModeLabel', () => {
        assert.equal(formatRenderModeLabel('webgl'), '3D');
        assert.equal(formatRenderModeLabel('canvas2d'), '2D 降级');
    });
});

test('Tetris3D GameManager：Host 生命周期与渲染', async t => {
    await t.test('ensureRenderer Canvas2D 路径 + renderScene', async () => {
        const restore = installMockDom(true);
        try {
            const MockRenderer = createMockRendererClass();
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: MockRenderer,
                effectTierId: 'medium'
            });
            manager.init();

            await manager.ensureRenderer();
            assert.equal(manager.rendererReady, true);
            assert.equal(manager.activeRenderMode, 'canvas2d');
            assert.equal(manager.renderer.initCalled, true);

            manager.renderScene();
            assert.equal(manager.renderer.renderCalls.length, 1);
            const payload = manager.renderer.renderCalls[0];
            assert.ok(payload.scene);
            assert.ok(payload.fx.coreState);
            assert.equal(typeof payload.scene.cols, 'number');
        } finally {
            restore();
        }
    });

    await t.test('onFrame 驱动重力 tick 并渲染', async () => {
        const restore = installMockDom(true);
        try {
            const MockRenderer = createMockRendererClass();
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: MockRenderer,
                createCoreFn: () => createTetrisGameCore({ randomFn: () => 0 })
            });
            manager.init();
            await manager.ensureRenderer();

            manager.panel.classList.add('open');
            manager.isPaused = false;
            manager._lastGravityAtMs = 0;

            const yBefore = manager.core.getState().current.y;
            manager.onFrame(600);
            assert.ok(manager.core.getState().current.y >= yBefore);
            assert.ok(manager.renderer.renderCalls.length >= 1);
        } finally {
            restore();
        }
    });

    await t.test('restart / pause / start 状态机', async () => {
        const restore = installMockDom(true);
        try {
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: createMockRendererClass()
            });
            manager.init();
            await manager.ensureRenderer();

            manager.start();
            assert.equal(manager.isPaused, false);
            assert.equal(manager.toggleBtn.textContent, '暂停');

            manager.pause();
            assert.equal(manager.isPaused, true);

            manager.restart();
            assert.equal(manager.isPaused, true);
            assert.equal(manager.core.getState().score, 0);
            assert.match(manager.statusEl.textContent, /已重置/);
        } finally {
            restore();
        }
    });

    await t.test('hidePanel 释放渲染器并停止 rAF', async () => {
        const restore = installMockDom(true);
        try {
            const MockRenderer = createMockRendererClass();
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: MockRenderer
            });
            manager.init();
            await manager.ensureRenderer();
            manager.panel.classList.add('open');
            manager.startRenderLoop();

            manager.hidePanel();
            assert.equal(manager.isPanelOpen(), false);
            assert.equal(manager.rendererReady, false);
            assert.equal(manager.renderer, null);
            assert.equal(manager._rafId, null);
        } finally {
            restore();
        }
    });

    await t.test('handleInputAction 软降后更新 HUD', async () => {
        const restore = installMockDom(true);
        try {
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: createMockRendererClass()
            });
            manager.init();
            await manager.ensureRenderer();
            manager.isPaused = false;

            const yBefore = manager.core.getState().current.y;
            manager.handleInputAction('softDrop');
            assert.ok(manager.core.getState().current.y >= yBefore);
        } finally {
            restore();
        }
    });
});

test('Tetris3D GameManager：与 Voxel Mapper 集成', async t => {
    await t.test('renderScene 使用 mapSnapshotToVoxelScene 输出', async () => {
        const restore = installMockDom(true);
        try {
            const captured = [];
            class CaptureRenderer extends createMockRendererClass() {
                render(scene, fx) {
                    captured.push({ scene, fx });
                }
            }

            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: CaptureRenderer
            });
            manager.init();
            await manager.ensureRenderer();

            const expected = mapSnapshotToVoxelScene(manager.core.getState());
            manager.renderScene();

            assert.deepEqual(captured[0].scene, expected);
            assert.deepEqual(captured[0].fx.coreState, manager.core.getState());
        } finally {
            restore();
        }
    });
});

test('Tetris3D GameManager：PR-4 消行动画 / 音效 / 埋点', async t => {
    await t.test('runCoreWithLineClearFx 检测消行并保留动画', () => {
        const core = createTetrisGameCore({ randomFn: () => 0 });
        const rows = Array.from({ length: 20 }, () => new Array(10).fill(0));
        rows[19] = new Array(10).fill(1);
        core.__setBoardForTest(rows);
        core.__setCurrentForTest(null);

        const fx = runCoreWithLineClearFx(
            core,
            () => core.__sweepLinesForTest(),
            1000,
            null
        );
        assert.equal(fx.linesCleared, 1);
        assert.ok(fx.lineClearAnim);
        assert.equal(fx.lineClearAnim.startMs, 1000);
    });

    await t.test('resolveActiveLineClearAnim 动画结束后返回 null', () => {
        const anim = {
            rows: [0],
            snapshots: [{ row: 0, cells: [1, 1] }],
            startMs: 0,
            durationMs: 320
        };
        assert.ok(resolveActiveLineClearAnim(anim, 100));
        assert.equal(resolveActiveLineClearAnim(anim, 400), null);
    });

    await t.test('start / game_finish / probe_result 埋点', async () => {
        const restore = installMockDom(true);
        const logged = [];
        try {
            const platform = createTetris3DPlatform({
                activityLogger: { log: a => logged.push(a) },
                localStorage: { getItem: () => null, setItem() {} }
            });
            const soundCalls = [];
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: createMockRendererClass(),
                platform,
                sound: { playLineClear: n => soundCalls.push(n), dispose() {} }
            });
            manager.init();
            await manager.ensureRenderer();

            assert.ok(logged.some(e => e.type === 'tetris_3d_probe_result'));

            manager.start();
            assert.ok(logged.some(e => e.type === 'tetris_3d_game_start'));

            const core = manager.core;
            const rows = Array.from({ length: 20 }, () => new Array(10).fill(0));
            rows[19] = new Array(10).fill(1);
            core.__setBoardForTest(rows);
            core.__setCurrentForTest(null);
            manager.isPaused = false;
            const fx = runCoreWithLineClearFx(
                core,
                () => core.__sweepLinesForTest(),
                1000,
                null
            );
            manager._applyLineClearFx(fx);

            assert.ok(soundCalls.length >= 1);
            assert.ok(manager._lineClearAnim);

            core.__setBoardForTest(Array.from({ length: 20 }, () => new Array(10).fill(1)));
            core.__setCurrentForTest(null);
            core.__callTrySpawnForTest();
            manager._onGameOver();
            assert.equal(core.getState().gameOver, true);
            assert.ok(logged.some(e => e.type === 'tetris_3d_game_finish'));
        } finally {
            restore();
        }
    });

    await t.test('toggleSound 切换偏好与按钮文案', async () => {
        const restore = installMockDom(true);
        const storage = new Map();
        try {
            const platform = createTetris3DPlatform({
                activityLogger: null,
                localStorage: {
                    getItem: k => (storage.has(k) ? storage.get(k) : null),
                    setItem: (k, v) => storage.set(k, v)
                },
                debugFn: () => {}
            });
            const manager = new Tetris3DGameManager({
                renderModeOverride: 'canvas2d',
                RendererClass: createMockRendererClass(),
                platform,
                sound: { playLineClear() {}, dispose() {} }
            });
            manager.init();
            assert.equal(manager.soundEnabled, true);
            manager.toggleSound();
            assert.equal(manager.soundEnabled, false);
            assert.match(manager.soundToggleBtn.textContent, /关/);
        } finally {
            restore();
        }
    });
});
