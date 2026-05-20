const test = require('node:test');
const assert = require('node:assert/strict');

const { createTetrisGameCore } = require('../js/tetris-game.js');
const { mapSnapshotToVoxelScene, gridToWorldPosition } = require('../js/tetris-3d-voxel-mapper.js');
const {
    probeWebGLCapability,
    clearProbeCache,
    probeCanvasWebGL,
    PROBE_CACHE_KEY
} = require('../js/webgl-capability-probe.js');
const {
    Tetris3DRenderer,
    CAMERA_FOV,
    CAMERA_POSITION,
    LOOK_AT,
    COLOR_INDEX_TO_HEX,
    colorIndexToHex,
    collectRenderableVoxels,
    buildInstanceDescriptors,
    mergeLineClearOverlayDescriptors,
    resolveRenderMode
} = require('../js/tetris-3d-renderer.js');
const { createMockThree } = require('./fixtures/mock-three.js');

function createMockSessionStorage() {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        },
        removeItem(key) {
            map.delete(key);
        }
    };
}

function createMockWebGLContext(version) {
    return {
        getExtension(name) {
            if (name === 'WEBGL_lose_context') {
                return { loseContext() {} };
            }
            return null;
        },
        _version: version
    };
}

function createMockCanvas(contextFactory) {
    return {
        width: 0,
        height: 0,
        style: {},
        addEventListener() {},
        removeEventListener() {},
        getContext(type, _opts) {
            return contextFactory(type);
        }
    };
}

function createMockContainer() {
    const children = [];
    return {
        innerHTML: '',
        appendChild(el) {
            children.push(el);
            this.lastChild = el;
        },
        get childrenList() {
            return children;
        }
    };
}

function installMockDocument(contextFactory) {
    const prev = global.document;
    global.document = {
        createElement(tag) {
            if (tag === 'canvas') {
                return createMockCanvas(contextFactory);
            }
            throw new Error('unexpected tag: ' + tag);
        }
    };
    return () => {
        global.document = prev;
    };
}

test('WebGL Probe：降级顺序与会话缓存', async t => {
    await t.test('forceCanvas2d → canvas2d，且不写缓存', () => {
        clearProbeCache();
        const storage = createMockSessionStorage();
        const result = probeWebGLCapability(
            { forceCanvas2d: true },
            { sessionStorage: storage, createCanvas: () => createMockCanvas(() => null) }
        );
        assert.equal(result.mode, 'canvas2d');
        assert.equal(result.reason, 'force_canvas2d');
        assert.equal(storage.getItem(PROBE_CACHE_KEY), null);
    });

    await t.test('WebGL2 可用 → webgl glVersion=2', () => {
        clearProbeCache();
        const storage = createMockSessionStorage();
        const result = probeWebGLCapability(
            {},
            {
                sessionStorage: storage,
                createCanvas: () =>
                    createMockCanvas(type => {
                        if (type === 'webgl2') return createMockWebGLContext(2);
                        return null;
                    })
            }
        );
        assert.equal(result.mode, 'webgl');
        assert.equal(result.glVersion, 2);
        assert.ok(storage.getItem(PROBE_CACHE_KEY));
    });

    await t.test('仅 WebGL1 → webgl glVersion=1', () => {
        clearProbeCache();
        const result = probeWebGLCapability(
            {},
            {
                sessionStorage: createMockSessionStorage(),
                createCanvas: () =>
                    createMockCanvas(type => {
                        if (type === 'webgl2') return null;
                        if (type === 'webgl' || type === 'experimental-webgl') {
                            return createMockWebGLContext(1);
                        }
                        return null;
                    })
            }
        );
        assert.equal(result.mode, 'webgl');
        assert.equal(result.glVersion, 1);
    });

    await t.test('无法创建上下文 → canvas2d', () => {
        clearProbeCache();
        const result = probeWebGLCapability(
            {},
            {
                sessionStorage: createMockSessionStorage(),
                createCanvas: () => createMockCanvas(() => null)
            }
        );
        assert.equal(result.mode, 'canvas2d');
        assert.equal(result.reason, 'no_webgl_context');
    });

    await t.test('会话缓存命中后不再调用 createCanvas', () => {
        clearProbeCache();
        const storage = createMockSessionStorage();
        const deps = {
            sessionStorage: storage,
            createCanvas: () => {
                throw new Error('should not probe twice');
            }
        };
        storage.setItem(
            PROBE_CACHE_KEY,
            JSON.stringify({ mode: 'webgl', reason: 'cached', glVersion: 2 })
        );
        const result = probeWebGLCapability({}, deps);
        assert.equal(result.reason, 'cached');
        assert.equal(result.mode, 'webgl');
    });

    await t.test('resolveRenderMode 支持 override', () => {
        assert.equal(resolveRenderMode({ renderModeOverride: 'canvas2d' }).mode, 'canvas2d');
        assert.equal(resolveRenderMode({ renderModeOverride: 'webgl' }).mode, 'webgl');
    });
});

test('Tetris3D Renderer：纯函数与颜色映射', async t => {
    await t.test('colorIndexToHex 与 COLORS 索引对齐', () => {
        assert.equal(colorIndexToHex(1), COLOR_INDEX_TO_HEX[1]);
        assert.equal(colorIndexToHex(7), 0xf97316);
        assert.equal(colorIndexToHex(99), 0x94a3b8);
    });

    await t.test('collectRenderableVoxels 先 locked 后 active', () => {
        const scene = {
            voxels: [{ gx: 1, gy: 2, colorIndex: 3 }],
            activePieceVoxels: [{ gx: 4, gy: 5, colorIndex: 2 }]
        };
        const merged = collectRenderableVoxels(scene);
        assert.equal(merged.length, 2);
        assert.deepEqual(merged[0], scene.voxels[0]);
        assert.deepEqual(merged[1], scene.activePieceVoxels[0]);
    });

    await t.test('buildInstanceDescriptors 世界坐标与 gridToWorldPosition 一致', () => {
        const rows = 20;
        const voxels = [{ gx: 0, gy: rows - 1, colorIndex: 1 }];
        const desc = buildInstanceDescriptors(voxels, rows);
        const expected = gridToWorldPosition(0, rows - 1, rows);
        assert.equal(desc.length, 1);
        assert.equal(desc[0].x, expected.x);
        assert.equal(desc[0].y, expected.y);
        assert.equal(desc[0].z, expected.z);
        assert.equal(desc[0].scale, 1);
    });

    await t.test('mergeLineClearOverlayDescriptors 叠加消行动画体素', () => {
        const rows = 20;
        const base = buildInstanceDescriptors(
            [{ gx: 0, gy: 0, colorIndex: 1 }],
            rows
        );
        const merged = mergeLineClearOverlayDescriptors(
            base,
            {
                t01: 0.1,
                snapshots: [{ row: 5, cells: [0, 2, 0] }]
            },
            rows
        );
        assert.equal(merged.length, 2);
        assert.equal(merged[1].colorIndex, 2);
        assert.ok(merged[1].scale > 1);
    });

    await t.test('相机常量符合 ADR §7.6', () => {
        assert.equal(CAMERA_FOV, 45);
        assert.deepEqual(CAMERA_POSITION, { x: 12, y: 18, z: 12 });
        assert.deepEqual(LOOK_AT, { x: 4.5, y: 10, z: 0 });
    });
});

test('Tetris3D Renderer：WebGL InstancedMesh 路径', async t => {
    await t.test('init + render 更新实例矩阵与 count', () => {
        const restoreDoc = installMockDocument(type => {
            if (type === 'webgl2' || type === 'webgl') return createMockWebGLContext(2);
            if (type === '2d') return { fillRect() {}, fillStyle: '', strokeStyle: '', lineWidth: 1, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
            return null;
        });

        try {
            const THREE = createMockThree();
            const container = createMockContainer();
            const renderer = new Tetris3DRenderer({
                container,
                logicalWidth: 300,
                logicalHeight: 600,
                renderMode: 'webgl',
                three: THREE,
                effectTierId: 'medium'
            });

            renderer.init();
            assert.equal(renderer.activeRenderMode, 'webgl');
            assert.ok(renderer.instancedMesh);
            assert.equal(renderer.instancedMesh.count, 0);

            const game = createTetrisGameCore({ randomFn: () => 0 });
            const scene = mapSnapshotToVoxelScene(game.getState());

            renderer.render(scene);
            assert.equal(renderer.instancedMesh.count, scene.activePieceVoxels.length);
            assert.equal(renderer.webglRenderer.renderCalls, 1);
            assert.ok(renderer.instancedMesh.instanceMatrix.needsUpdate);
            assert.ok(renderer.instancedMesh.matrices.length >= 4);

            const first = buildInstanceDescriptors(
                collectRenderableVoxels(scene),
                scene.rows
            )[0];
            assert.equal(renderer.instancedMesh.matrices[0][12], first.x);
            assert.equal(renderer.instancedMesh.matrices[0][13], first.y);

            const webgl = renderer.webglRenderer;
            renderer.dispose();
            assert.equal(container.innerHTML, '');
            assert.equal(webgl.disposed, true);
        } finally {
            restoreDoc();
        }
    });

    await t.test('resize 更新 backing-store 与 camera aspect', () => {
        const restoreDoc = installMockDocument(() => createMockWebGLContext(2));

        try {
            const THREE = createMockThree();
            const container = createMockContainer();
            const renderer = new Tetris3DRenderer({
                container,
                logicalWidth: 200,
                logicalHeight: 400,
                renderMode: 'webgl',
                three: THREE
            });
            renderer.init();
            renderer.resize(400, 800);
            assert.equal(renderer.logicalWidth, 400);
            assert.equal(renderer.camera.aspect, renderer.canvas.width / renderer.canvas.height);
            renderer.dispose();
        } finally {
            restoreDoc();
        }
    });
});

test('Tetris3D Renderer：Canvas 2D 降级路径', async t => {
    await t.test('render 调用 drawFrameFn 且传入 coreState', () => {
        const restoreDoc = installMockDocument(type => {
            if (type === '2d') {
                return {
                    fillRect() {},
                    fillStyle: '',
                    strokeStyle: '',
                    lineWidth: 1,
                    beginPath() {},
                    moveTo() {},
                    lineTo() {},
                    stroke() {}
                };
            }
            return null;
        });

        try {
            const container = createMockContainer();
            let drawCalls = 0;
            const renderer = new Tetris3DRenderer({
                container,
                logicalWidth: 300,
                logicalHeight: 600,
                renderMode: 'canvas2d',
                drawFrameFn(ctx, w, h, state) {
                    drawCalls += 1;
                    assert.ok(ctx);
                    assert.equal(w, renderer.canvas.width);
                    assert.equal(h, renderer.canvas.height);
                    assert.equal(state.cols, 10);
                }
            });

            renderer.init();
            const game = createTetrisGameCore({ randomFn: () => 0 });
            const scene = mapSnapshotToVoxelScene(game.getState());
            renderer.render(scene, { coreState: game.getState() });
            assert.equal(drawCalls, 1);

            renderer.render(scene, {});
            assert.equal(drawCalls, 1);

            renderer.dispose();
        } finally {
            restoreDoc();
        }
    });

    await t.test('Probe 失败场景 resolveRenderMode → canvas2d', () => {
        clearProbeCache();
        const mode = resolveRenderMode(
            {},
            {
                sessionStorage: createMockSessionStorage(),
                createCanvas: () => createMockCanvas(() => null)
            }
        );
        assert.equal(mode.mode, 'canvas2d');
    });
});

test('Tetris3D Renderer：构造与生命周期', async t => {
    await t.test('缺少 container 抛出 TypeError', () => {
        assert.throws(() => new Tetris3DRenderer({}), TypeError);
    });

    await t.test('WebGL init 未注入 THREE 时抛出', () => {
        const restoreDoc = installMockDocument(() => createMockWebGLContext(2));
        try {
            const renderer = new Tetris3DRenderer({
                container: createMockContainer(),
                logicalWidth: 300,
                logicalHeight: 600,
                renderMode: 'webgl'
            });
            assert.throws(() => renderer.init(), /requires THREE/);
        } finally {
            restoreDoc();
        }
    });

    await t.test('probeCanvasWebGL 独立函数可测', () => {
        const canvas = createMockCanvas(type => {
            if (type === 'webgl2') return createMockWebGLContext(2);
            return null;
        });
        const r = probeCanvasWebGL(canvas);
        assert.equal(r.mode, 'webgl');
        assert.equal(r.glVersion, 2);
        assert.equal(canvas.width, 16);
    });
});
