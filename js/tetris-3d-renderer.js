(function attachTetris3DRenderer(global) {
    'use strict';

    const tetrisRef =
        typeof require !== 'undefined'
            ? require('./tetris-game.js')
            : global.TetrisGame || {};

    const mapperRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-voxel-mapper.js')
            : global.Tetris3DVoxelMapper || {};

    const tiersRef =
        typeof require !== 'undefined'
            ? require('./tetris-effect-tiers.js')
            : global.TetrisEffectTiers || {};

    const probeRef =
        typeof require !== 'undefined'
            ? require('./webgl-capability-probe.js')
            : global.TetrisWebGLCapabilityProbe || {};

    const fxRef =
        typeof require !== 'undefined'
            ? require('./tetris-3d-fx.js')
            : global.Tetris3DFx || {};

    const { drawTetrisFrame, COLORS } = tetrisRef;
    const { gridToWorldPosition, getMaxInstanceCount } = mapperRef;
    const { buildLineClearOverlayVoxels, computeLineClearTransform } = fxRef;
    const { getTierPreset, applyResolutionScaleToCanvas } = tiersRef;
    const { probeWebGLCapability } = probeRef;

    /** ADR §7.6 相机与场景缺省 */
    const CAMERA_FOV = 45;
    const CAMERA_POSITION = Object.freeze({ x: 12, y: 18, z: 12 });
    const LOOK_AT = Object.freeze({ x: 4.5, y: 10, z: 0 });
    const VOXEL_MESH_SCALE = 0.92;

    /** 盘面索引 1–7 → Three.js 十六进制色（与 COLORS 对齐） */
    const COLOR_INDEX_TO_HEX = Object.freeze([
        0x000000,
        0x22d3ee,
        0xfacc15,
        0xa855f7,
        0x22c55e,
        0xef4444,
        0x3b82f6,
        0xf97316
    ]);

    /** @typedef {'webgl'|'canvas2d'} RenderMode */

    /**
     * @param {number} colorIndex
     * @returns {number}
     */
    function colorIndexToHex(colorIndex) {
        const idx = Math.floor(colorIndex);
        if (idx >= 1 && idx < COLOR_INDEX_TO_HEX.length) {
            return COLOR_INDEX_TO_HEX[idx];
        }
        return 0x94a3b8;
    }

    /**
     * 合并 locked + active 体素为渲染序列（顺序稳定：先 locked 后 active）。
     *
     * @param {{ voxels?: ReadonlyArray<{ gx: number, gy: number, colorIndex: number }>, activePieceVoxels?: ReadonlyArray<{ gx: number, gy: number, colorIndex: number }> }} scene
     * @returns {ReadonlyArray<{ gx: number, gy: number, colorIndex: number }>}
     */
    function collectRenderableVoxels(scene) {
        const locked = scene && scene.voxels ? scene.voxels : [];
        const active =
            scene && scene.activePieceVoxels ? scene.activePieceVoxels : [];
        return locked.concat(active);
    }

    /**
     * 将体素列表转为世界坐标实例槽（纯函数，供单测与 WebGL 路径共用）。
     *
     * @param {ReadonlyArray<{ gx: number, gy: number, colorIndex: number }>} voxels
     * @param {number} rows
     * @returns {ReadonlyArray<{ x: number, y: number, z: number, colorIndex: number }>}
     */
    function buildInstanceDescriptors(voxels, rows) {
        const out = [];
        for (let i = 0; i < voxels.length; i += 1) {
            const d = voxelToInstanceDescriptor(voxels[i], rows);
            if (d) out.push(d);
        }
        return Object.freeze(out);
    }

    /**
     * @param {{ gx: number, gy: number, colorIndex: number }} voxel
     * @param {number} rows
     * @param {{ scale?: number, brightness?: number }} [transform]
     * @returns {{ x: number, y: number, z: number, colorIndex: number, scale: number, brightness: number }|null}
     */
    function voxelToInstanceDescriptor(voxel, rows, transform) {
        if (!voxel || !voxel.colorIndex) return null;
        const pos = gridToWorldPosition(voxel.gx, voxel.gy, rows);
        const tr = transform || {};
        return {
            x: pos.x,
            y: pos.y,
            z: pos.z,
            colorIndex: voxel.colorIndex,
            scale: tr.scale ?? 1,
            brightness: tr.brightness ?? 1
        };
    }

    /**
     * 合并消行 overlay 体素（内核已消行，仅渲染插值）。
     *
     * @param {ReadonlyArray<{ gx: number, gy: number, colorIndex: number, scale?: number, brightness?: number }>} base
     * @param {{ snapshots?: ReadonlyArray<{ row: number, cells: ReadonlyArray<number> }>, t01?: number }} [lineClearAnim]
     * @param {number} rows
     * @returns {ReadonlyArray<{ gx: number, gy: number, colorIndex: number, scale: number, brightness: number }>}
     */
    function mergeLineClearOverlayDescriptors(base, lineClearAnim, rows) {
        if (
            !lineClearAnim ||
            typeof lineClearAnim.t01 !== 'number' ||
            lineClearAnim.t01 >= 1 ||
            !lineClearAnim.snapshots
        ) {
            return base;
        }

        const transform = computeLineClearTransform(lineClearAnim.t01);
        const overlay = buildLineClearOverlayVoxels(lineClearAnim.snapshots);
        const merged = base.slice();

        for (let i = 0; i < overlay.length; i += 1) {
            const d = voxelToInstanceDescriptor(overlay[i], rows, transform);
            if (d) merged.push(d);
        }

        return Object.freeze(merged);
    }

    /**
     * @param {object} [hints]
     * @param {boolean} [hints.forceCanvas2d]
     * @param {RenderMode} [hints.renderModeOverride]
     * @param {object} [probeDeps]
     * @returns {{ mode: RenderMode, reason: string, glVersion?: 1|2 }}
     */
    function resolveRenderMode(hints, probeDeps) {
        const h = hints || {};
        if (h.renderModeOverride === 'webgl' || h.renderModeOverride === 'canvas2d') {
            return {
                mode: h.renderModeOverride,
                reason: 'render_mode_override'
            };
        }
        return probeWebGLCapability(h, probeDeps);
    }

    /**
     * 生产环境懒加载 Three.js ESM bundle（仅 WebGL 路径）。
     *
     * @returns {Promise<object>}
     */
    async function loadThreeModule() {
        if (typeof globalThis.__TETRIS3D_THREE__ !== 'undefined') {
            return globalThis.__TETRIS3D_THREE__;
        }
        const mod = await import('../vendor/three/three.module.min.js');
        return mod;
    }

    class Tetris3DRenderer {
        /**
         * @param {object} options
         * @param {HTMLElement} options.container
         * @param {number} options.logicalWidth
         * @param {number} options.logicalHeight
         * @param {'low'|'medium'|'high'} [options.effectTierId]
         * @param {RenderMode} options.renderMode
         * @param {object} [options.three] 测试或预注入 THREE 命名空间
         * @param {typeof drawTetrisFrame} [options.drawFrameFn] Canvas 路径绘制函数
         */
        constructor(options) {
            if (!options || !options.container) {
                throw new TypeError('Tetris3DRenderer: container is required');
            }

            this.container = options.container;
            this.logicalWidth = Math.max(1, options.logicalWidth || 300);
            this.logicalHeight = Math.max(1, options.logicalHeight || 600);
            this.effectTier = getTierPreset(options.effectTierId || 'medium');
            this.renderMode = options.renderMode === 'canvas2d' ? 'canvas2d' : 'webgl';
            this.three = options.three || null;
            this.drawFrameFn = options.drawFrameFn || drawTetrisFrame;

            this._initialized = false;
            this._disposed = false;

            /** @type {HTMLCanvasElement|null} */
            this.canvas = null;
            /** @type {CanvasRenderingContext2D|null} */
            this.ctx2d = null;

            /** @type {object|null} WebGLRenderer */
            this.webglRenderer = null;
            /** @type {object|null} */
            this.scene = null;
            /** @type {object|null} */
            this.camera = null;
            /** @type {object|null} InstancedMesh */
            this.instancedMesh = null;
            /** @type {object|null} Matrix4 */
            this._matrixScratch = null;
            /** @type {object|null} Color */
            this._colorScratch = null;
            /** @type {object|null} Matrix4 */
            this._hiddenMatrix = null;

            this._maxInstances = getMaxInstanceCount(10, 20);
            this._boardRows = 20;
            this._boardCols = 10;

            /** @type {(event: Event) => void|null} */
            this._onContextLost = null;
        }

        /** @returns {RenderMode} */
        get activeRenderMode() {
            return this.renderMode;
        }

        /**
         * @param {object} [loadOptions]
         * @param {object} [loadOptions.three]
         */
        async ensureThree(loadOptions) {
            if (this.three) return this.three;
            const injected = loadOptions && loadOptions.three;
            if (injected) {
                this.three = injected;
                return this.three;
            }
            this.three = await loadThreeModule();
            return this.three;
        }

        init() {
            if (this._initialized || this._disposed) return;
            this.container.innerHTML = '';

            if (this.renderMode === 'canvas2d') {
                this._initCanvas2d();
            } else {
                if (!this.three) {
                    throw new Error(
                        'Tetris3DRenderer: WebGL mode requires THREE — call ensureThree() before init() or pass options.three'
                    );
                }
                this._initWebGL();
            }

            this._initialized = true;
        }

        _initCanvas2d() {
            const canvas = document.createElement('canvas');
            canvas.className = 'tetris-3d-canvas tetris-3d-canvas--2d';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            this.container.appendChild(canvas);

            applyResolutionScaleToCanvas(
                canvas,
                this.logicalWidth,
                this.logicalHeight,
                this.effectTier.canvasResolutionScale
            );

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Tetris3DRenderer: Canvas 2D context unavailable');
            }

            this.canvas = canvas;
            this.ctx2d = ctx;
        }

        _initWebGL() {
            const THREE = this.three;
            const canvas = document.createElement('canvas');
            canvas.className = 'tetris-3d-canvas tetris-3d-canvas--webgl';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';

            const backingScale = this.effectTier.canvasResolutionScale;
            const pixelW = Math.max(
                1,
                Math.round(this.logicalWidth * backingScale)
            );
            const pixelH = Math.max(
                1,
                Math.round(this.logicalHeight * backingScale)
            );
            canvas.width = pixelW;
            canvas.height = pixelH;

            this.container.appendChild(canvas);
            this.canvas = canvas;

            const renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: this.effectTier.id !== 'low',
                alpha: false,
                powerPreference: 'high-performance'
            });
            renderer.setPixelRatio(
                Math.min(
                    (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
                    2
                )
            );
            renderer.setSize(pixelW, pixelH, false);
            if (THREE.SRGBColorSpace) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            renderer.setClearColor(0x020617, 1);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x020617);

            const aspect = pixelW / pixelH;
            const camera = new THREE.PerspectiveCamera(
                CAMERA_FOV,
                aspect,
                0.1,
                200
            );
            camera.position.set(
                CAMERA_POSITION.x,
                CAMERA_POSITION.y,
                CAMERA_POSITION.z
            );
            camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);

            scene.add(new THREE.AmbientLight(0xffffff, 0.55));
            const dir = new THREE.DirectionalLight(0xffffff, 0.85);
            dir.position.set(8, 24, 12);
            scene.add(dir);

            const geometry = new THREE.BoxGeometry(
                VOXEL_MESH_SCALE,
                VOXEL_MESH_SCALE,
                VOXEL_MESH_SCALE
            );
            const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.45,
                metalness: 0.08
            });
            const mesh = new THREE.InstancedMesh(
                geometry,
                material,
                this._maxInstances
            );
            mesh.count = 0;
            scene.add(mesh);

            this._matrixScratch = new THREE.Matrix4();
            this._colorScratch = new THREE.Color();
            this._hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

            this.webglRenderer = renderer;
            this.scene = scene;
            this.camera = camera;
            this.instancedMesh = mesh;

            this._onContextLost = event => {
                event.preventDefault();
                this._fallbackToCanvas2d('webgl_context_lost');
            };
            canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        }

        /**
         * WebGL 上下文丢失时降级 Canvas 2D（ADR §10 A3）。
         *
         * @param {string} reason
         */
        _fallbackToCanvas2d(reason) {
            if (this.renderMode === 'canvas2d' || this._disposed) return;
            this.dispose(false);
            this.renderMode = 'canvas2d';
            this._initialized = false;
            this.init();
            this._fallbackReason = reason;
        }

        /**
         * @param {{ cols?: number, rows?: number, voxels?: ReadonlyArray<unknown>, activePieceVoxels?: ReadonlyArray<unknown>, phase?: string }} scene
         * @param {{ lineClearAnim?: { rows: number[], t01: number }, coreState?: import('./tetris-game.js').TetrisCoreState }} [fx]
         */
        render(scene, fx) {
            if (!this._initialized || this._disposed) return;

            if (scene && typeof scene.rows === 'number') {
                this._boardRows = scene.rows;
            }
            if (scene && typeof scene.cols === 'number') {
                this._boardCols = scene.cols;
                this._maxInstances = getMaxInstanceCount(scene.cols, this._boardRows);
            }

            if (this.renderMode === 'canvas2d') {
                this._renderCanvas2d(scene, fx);
            } else {
                this._renderWebGL(scene, fx);
            }
        }

        /**
         * @param {object} scene
         * @param {object} [fx]
         */
        _renderCanvas2d(scene, fx) {
            if (!this.ctx2d || !this.canvas) return;
            const coreState = fx && fx.coreState;
            if (!coreState) {
                return;
            }
            this.drawFrameFn(
                this.ctx2d,
                this.canvas.width,
                this.canvas.height,
                coreState,
                COLORS
            );
        }

        /**
         * @param {object} scene
         * @param {{ lineClearAnim?: { snapshots?: ReadonlyArray<{ row: number, cells: ReadonlyArray<number> }>, t01?: number }, coreState?: object }} [fx]
         */
        _renderWebGL(scene, fx) {
            if (!this.webglRenderer || !this.scene || !this.camera || !this.instancedMesh) {
                return;
            }

            const THREE = this.three;
            const voxels = collectRenderableVoxels(scene || {});
            const capped = voxels.slice(
                0,
                Math.min(voxels.length, this.effectTier.maxDrawableInstances)
            );
            let descriptors = buildInstanceDescriptors(capped, this._boardRows);
            descriptors = mergeLineClearOverlayDescriptors(
                descriptors,
                fx && fx.lineClearAnim,
                this._boardRows
            );
            if (descriptors.length > this.effectTier.maxDrawableInstances) {
                descriptors = descriptors.slice(0, this.effectTier.maxDrawableInstances);
            }

            const mesh = this.instancedMesh;
            const matrix = this._matrixScratch;
            const color = this._colorScratch;

            for (let i = 0; i < this._maxInstances; i += 1) {
                if (i < descriptors.length) {
                    const d = descriptors[i];
                    const s = d.scale ?? 1;
                    matrix.identity();
                    matrix.makeScale(s, s, s);
                    matrix.elements[12] = d.x;
                    matrix.elements[13] = d.y;
                    matrix.elements[14] = d.z;
                    mesh.setMatrixAt(i, matrix);
                    color.setHex(colorIndexToHex(d.colorIndex));
                    const bright = d.brightness ?? 1;
                    if (bright > 1 && typeof color.multiplyScalar === 'function') {
                        color.multiplyScalar(Math.min(bright, 1.8));
                    }
                    mesh.setColorAt(i, color);
                } else {
                    mesh.setMatrixAt(i, this._hiddenMatrix);
                }
            }

            mesh.count = descriptors.length;
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) {
                mesh.instanceColor.needsUpdate = true;
            }

            this.webglRenderer.render(this.scene, this.camera);
        }

        /**
         * @param {number} width
         * @param {number} height
         */
        resize(width, height) {
            this.logicalWidth = Math.max(1, width);
            this.logicalHeight = Math.max(1, height);

            if (!this._initialized || this._disposed || !this.canvas) return;

            if (this.renderMode === 'canvas2d') {
                applyResolutionScaleToCanvas(
                    this.canvas,
                    this.logicalWidth,
                    this.logicalHeight,
                    this.effectTier.canvasResolutionScale
                );
                return;
            }

            if (this.webglRenderer && this.camera) {
                const scale = this.effectTier.canvasResolutionScale;
                const pixelW = Math.max(
                    1,
                    Math.round(this.logicalWidth * scale)
                );
                const pixelH = Math.max(
                    1,
                    Math.round(this.logicalHeight * scale)
                );
                this.canvas.width = pixelW;
                this.canvas.height = pixelH;
                this.webglRenderer.setSize(pixelW, pixelH, false);
                this.camera.aspect = pixelW / pixelH;
                this.camera.updateProjectionMatrix();
            }
        }

        /**
         * @param {boolean} [clearContainer=true]
         */
        dispose(clearContainer) {
            if (this._disposed) return;
            this._disposed = true;

            if (this.canvas && this._onContextLost) {
                this.canvas.removeEventListener(
                    'webglcontextlost',
                    this._onContextLost,
                    false
                );
            }

            if (this.instancedMesh) {
                this.instancedMesh.geometry.dispose();
                this.instancedMesh.material.dispose();
                this.instancedMesh.dispose();
            }
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
            }

            this.webglRenderer = null;
            this.scene = null;
            this.camera = null;
            this.instancedMesh = null;
            this.ctx2d = null;
            this.canvas = null;
            this._matrixScratch = null;
            this._colorScratch = null;
            this._hiddenMatrix = null;
            this._onContextLost = null;

            if (clearContainer !== false && this.container) {
                this.container.innerHTML = '';
            }

            this._initialized = false;
        }
    }

    const api = {
        Tetris3DRenderer,
        CAMERA_FOV,
        CAMERA_POSITION,
        LOOK_AT,
        VOXEL_MESH_SCALE,
        COLOR_INDEX_TO_HEX,
        colorIndexToHex,
        collectRenderableVoxels,
        buildInstanceDescriptors,
        voxelToInstanceDescriptor,
        mergeLineClearOverlayDescriptors,
        resolveRenderMode,
        loadThreeModule
    };

    global.Tetris3DRenderer = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
