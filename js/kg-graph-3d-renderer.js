(function attachKgGraph3DRenderer(global) {
    'use strict';

    const probeRef =
        typeof require !== 'undefined'
            ? require('./webgl-capability-probe.js')
            : global.TetrisWebGLCapabilityProbe || {};

    const { probeWebGLCapability } = probeRef;

    const DEFAULT_FOV = 50;
    const DEFAULT_ORBIT = Object.freeze({ yaw: 0.65, pitch: 0.35, distance: 220 });
    const LOOK_AT = Object.freeze({ x: 0, y: 0, z: 0 });
    const NODE_BASE_RADIUS = 2.4;
    const PICK_RADIUS_PX = 14;

    const TIER_PRESETS = Object.freeze({
        low: Object.freeze({ id: 'low', maxNodes: 80, maxLabels: 8, canvasResolutionScale: 0.85 }),
        medium: Object.freeze({ id: 'medium', maxNodes: 150, maxLabels: 24, canvasResolutionScale: 1 }),
        high: Object.freeze({ id: 'high', maxNodes: 200, maxLabels: 40, canvasResolutionScale: 1 })
    });

    /**
     * @param {string} [tierId]
     */
    function getTierPreset(tierId) {
        return TIER_PRESETS[tierId] || TIER_PRESETS.medium;
    }

    /**
     * @param {object} [hints]
     * @param {boolean} [hints.forceCanvas2d]
     * @param {'webgl'|'canvas2d'} [hints.renderModeOverride]
     * @param {object} [probeDeps]
     * @returns {{ mode: 'webgl'|'canvas2d', reason: string, glVersion?: 1|2 }}
     */
    function resolveKgRenderMode(hints, probeDeps) {
        const h = hints || {};
        if (h.renderModeOverride === 'webgl' || h.renderModeOverride === 'canvas2d') {
            return { mode: h.renderModeOverride, reason: 'render_mode_override' };
        }
        return probeWebGLCapability(h, probeDeps);
    }

    /**
     * @param {string} hex
     * @returns {number}
     */
    function hexToThreeColor(hex) {
        if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            return 0x94a3b8;
        }
        return parseInt(hex.slice(1), 16);
    }

    /**
     * @param {import('./kg-graph-layout').LayoutSnapshot} layout
     * @returns {Map<string, { x: number, y: number, z: number }>}
     */
    function buildLayoutNodeMap(layout) {
        const map = new Map();
        for (const node of layout.nodes) {
            map.set(node.id, { x: node.x, y: node.y, z: node.z });
        }
        return map;
    }

    /**
     * @param {number} yaw
     * @param {number} pitch
     * @param {number} distance
     * @param {{ x: number, y: number, z: number }} [lookAt]
     */
    function computeOrbitCameraPosition(yaw, pitch, distance, lookAt) {
        const target = lookAt || LOOK_AT;
        const cosPitch = Math.cos(pitch);
        return {
            x: target.x + distance * cosPitch * Math.sin(yaw),
            y: target.y + distance * Math.sin(pitch),
            z: target.z + distance * cosPitch * Math.cos(yaw)
        };
    }

    /**
     * @param {object} camera
     * @param {{ x: number, y: number, z: number }} point
     * @param {number} width
     * @param {number} height
     * @returns {{ x: number, y: number, visible: boolean }}
     */
    function projectWorldToScreen(camera, point, width, height) {
        if (!camera || typeof camera.project !== 'function') {
            return { x: 0, y: 0, visible: false };
        }
        const THREE = camera._threeRef;
        if (!THREE || !THREE.Vector3) {
            return { x: 0, y: 0, visible: false };
        }
        const vector = new THREE.Vector3(point.x, point.y, point.z);
        vector.project(camera);
        return {
            x: (vector.x * 0.5 + 0.5) * width,
            y: (-vector.y * 0.5 + 0.5) * height,
            visible: vector.z >= -1 && vector.z <= 1
        };
    }

    /**
     * @param {import('./kg-graph-layout').LayoutSnapshot} layout
     * @param {import('./kg-graph-core').NormalizedGraph} graph
     * @param {{ selectedNodeId?: string|null, highlightedNodeIds?: Set<string>|string[], dimUnhighlighted?: boolean }} [highlight]
     * @param {{ maxNodes?: number }} [tier]
     */
    function buildNodeDescriptors(layout, graph, highlight, tier) {
        const h = highlight || {};
        const highlighted = new Set(h.highlightedNodeIds || []);
        if (h.selectedNodeId) highlighted.add(h.selectedNodeId);
        const dimOthers = h.dimUnhighlighted === true && highlighted.size > 0;
        const typeColor = new Map();
        for (const nt of graph.schema.nodeTypes) {
            typeColor.set(nt.id, nt.color);
        }
        const nodeById = graph.nodeById;
        const maxNodes = (tier && tier.maxNodes) || TIER_PRESETS.medium.maxNodes;
        const capped = layout.nodes.slice(0, maxNodes);

        return capped.map((pos) => {
            const meta = nodeById.get(pos.id);
            const baseColor = hexToThreeColor(typeColor.get(meta && meta.type) || '#64748b');
            const weight = meta && meta.weight ? meta.weight : 1;
            let opacity = 1;
            let emissiveBoost = 0;
            if (dimOthers && !highlighted.has(pos.id)) {
                opacity = 0.22;
            } else if (h.selectedNodeId === pos.id) {
                emissiveBoost = 0.35;
                opacity = 1;
            } else if (highlighted.has(pos.id)) {
                emissiveBoost = 0.18;
                opacity = 0.95;
            }
            return {
                id: pos.id,
                x: pos.x,
                y: pos.y,
                z: pos.z,
                radius: NODE_BASE_RADIUS * (0.85 + Math.min(weight, 3) * 0.12),
                color: baseColor,
                opacity,
                emissiveBoost
            };
        });
    }

    /**
     * @param {import('./kg-graph-layout').LayoutSnapshot} layout
     * @param {ReadonlyArray<{ sourceId: string, targetId: string, type: string }>} edges
     * @param {{ highlightedEdgeIds?: Set<string>|string[], dimUnhighlighted?: boolean, selectedNodeId?: string|null }} [highlight]
     * @param {Map<string, string>} [edgeIdByKey]
     */
    function buildEdgeLineData(layout, edges, highlight, edgeIdByKey) {
        const posMap = buildLayoutNodeMap(layout);
        const h = highlight || {};
        const highlightedEdges = new Set(h.highlightedEdgeIds || []);
        const dimOthers = h.dimUnhighlighted === true && (highlightedEdges.size > 0 || h.selectedNodeId);

        /** @type {number[]} */
        const positions = [];
        /** @type {number[]} */
        const colors = [];

        edges.forEach((edge, index) => {
            const a = posMap.get(edge.sourceId);
            const b = posMap.get(edge.targetId);
            if (!a || !b) return;

            const edgeKey = `${edge.sourceId}|${edge.targetId}|${edge.type}`;
            const edgeId = edgeIdByKey ? edgeIdByKey.get(edgeKey) : `edge-${index}`;
            let opacity = 0.45;
            if (highlightedEdges.has(edgeId)) {
                opacity = 0.95;
            } else if (dimOthers) {
                opacity = 0.12;
            }

            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
            for (let i = 0; i < 2; i += 1) {
                colors.push(0.55 * opacity, 0.65 * opacity, 0.82 * opacity);
            }
        });

        return {
            positions: new Float32Array(positions),
            colors: new Float32Array(colors),
            segmentCount: positions.length / 6
        };
    }

    /**
     * @param {import('./kg-graph-layout').LayoutSnapshot} layout
     * @param {ReadonlyArray<{ id: string, x: number, y: number, radius?: number }>} screenNodes
     * @param {number} clientX
     * @param {number} clientY
     * @param {number} [radiusPx]
     * @returns {string|null}
     */
    function pickNodeAtScreen(layout, screenNodes, clientX, clientY, radiusPx) {
        const pickR = radiusPx !== undefined ? radiusPx : PICK_RADIUS_PX;
        let bestId = null;
        let bestDist = pickR * pickR;

        for (const node of screenNodes) {
            const dx = node.x - clientX;
            const dy = node.y - clientY;
            const dist = dx * dx + dy * dy;
            const hitR = (node.radius || PICK_RADIUS_PX) + 4;
            if (dist <= hitR * hitR && dist < bestDist) {
                bestDist = dist;
                bestId = node.id;
            }
        }

        if (bestId) return bestId;

        for (const node of layout.nodes) {
            const projected = screenNodes.find((n) => n.id === node.id);
            if (!projected) continue;
            const dx = projected.x - clientX;
            const dy = projected.y - clientY;
            const dist = dx * dx + dy * dy;
            if (dist <= pickR * pickR && dist < bestDist) {
                bestDist = dist;
                bestId = node.id;
            }
        }

        return bestId;
    }

    async function loadThreeModule() {
        if (typeof globalThis.__KG_GRAPH_THREE__ !== 'undefined') {
            return globalThis.__KG_GRAPH_THREE__;
        }
        const mod = await import('../vendor/three/three.module.min.js');
        return mod;
    }

    class KgGraph3DRenderer {
        /**
         * @param {object} options
         * @param {HTMLElement} options.container
         * @param {'webgl'|'canvas2d'} options.renderMode
         * @param {string} [options.effectTierId]
         * @param {number} [options.logicalWidth]
         * @param {number} [options.logicalHeight]
         * @param {object} [options.three]
         */
        constructor(options) {
            if (!options || !options.container) {
                throw new TypeError('KgGraph3DRenderer: container is required');
            }
            this.container = options.container;
            this.renderMode = options.renderMode === 'canvas2d' ? 'canvas2d' : 'webgl';
            this.effectTier = getTierPreset(options.effectTierId || 'medium');
            this.logicalWidth = Math.max(1, options.logicalWidth || 960);
            this.logicalHeight = Math.max(1, options.logicalHeight || 640);
            this.three = options.three || null;

            this._initialized = false;
            this._disposed = false;
            this._orbit = { ...DEFAULT_ORBIT };
            this._autoRotateSpeed = 0.08;
            this._autoRotateEnabled = false;

            /** @type {HTMLCanvasElement|null} */
            this.canvas = null;
            /** @type {object|null} */
            this.webglRenderer = null;
            /** @type {object|null} */
            this.scene = null;
            /** @type {object|null} */
            this.camera = null;
            /** @type {object|null} */
            this.nodeMesh = null;
            /** @type {object|null} */
            this.edgeLines = null;
            /** @type {object|null} */
            this._matrixScratch = null;
            /** @type {object|null} */
            this._colorScratch = null;
            /** @type {object|null} */
            this._hiddenMatrix = null;
            /** @type {Map<string, string>} */
            this._edgeIdByKey = new Map();
            /** @type {import('./kg-graph-layout').LayoutSnapshot|null} */
            this._lastLayout = null;
            /** @type {import('./kg-graph-core').NormalizedGraph|null} */
            this._lastGraph = null;
        }

        get activeRenderMode() {
            return this.renderMode;
        }

        /**
         * @param {object} [loadOptions]
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

        async init() {
            if (this._initialized || this._disposed) return;
            if (this.renderMode !== 'webgl') {
                throw new Error('KgGraph3DRenderer: init() requires renderMode webgl');
            }
            if (!this.three) {
                throw new Error('KgGraph3DRenderer: call ensureThree() before init()');
            }
            this._initWebGL();
            this._initialized = true;
        }

        _initWebGL() {
            const THREE = this.three;
            this.container.innerHTML = '';

            const canvas = document.createElement('canvas');
            canvas.className = 'kg-graph-canvas kg-graph-canvas--webgl';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';

            const scale = this.effectTier.canvasResolutionScale;
            const pixelW = Math.max(1, Math.round(this.logicalWidth * scale));
            const pixelH = Math.max(1, Math.round(this.logicalHeight * scale));
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
            renderer.setPixelRatio(Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2));
            renderer.setSize(pixelW, pixelH, false);
            if (THREE.SRGBColorSpace) {
                renderer.outputColorSpace = THREE.SRGBColorSpace;
            }
            renderer.setClearColor(0x020617, 1);

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x020617);
            scene.fog = new THREE.FogExp2(0x020617, 0.0045);

            const aspect = pixelW / pixelH;
            const camera = new THREE.PerspectiveCamera(DEFAULT_FOV, aspect, 0.5, 800);
            camera._threeRef = THREE;
            this._applyOrbitToCamera(camera);

            scene.add(new THREE.AmbientLight(0xffffff, 0.5));
            const key = new THREE.DirectionalLight(0xffffff, 0.9);
            key.position.set(40, 80, 60);
            scene.add(key);
            const fill = new THREE.DirectionalLight(0x7dd3fc, 0.25);
            fill.position.set(-60, -20, 40);
            scene.add(fill);

            const maxInstances = this.effectTier.maxNodes;
            const geometry = new THREE.SphereGeometry(1, 12, 10);
            const material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.42,
                metalness: 0.12,
                transparent: true,
                opacity: 1
            });
            const nodeMesh = new THREE.InstancedMesh(geometry, material, maxInstances);
            nodeMesh.count = 0;
            scene.add(nodeMesh);

            const edgeGeometry = new THREE.BufferGeometry();
            const edgeMaterial = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.75
            });
            const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
            scene.add(edgeLines);

            this._matrixScratch = new THREE.Matrix4();
            this._colorScratch = new THREE.Color();
            this._hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

            this.webglRenderer = renderer;
            this.scene = scene;
            this.camera = camera;
            this.nodeMesh = nodeMesh;
            this.edgeLines = edgeLines;
        }

        /**
         * @param {object} camera
         */
        _applyOrbitToCamera(camera) {
            const pos = computeOrbitCameraPosition(
                this._orbit.yaw,
                this._orbit.pitch,
                this._orbit.distance,
                LOOK_AT
            );
            camera.position.set(pos.x, pos.y, pos.z);
            camera.lookAt(LOOK_AT.x, LOOK_AT.y, LOOK_AT.z);
        }

        /**
         * @param {number} yaw
         * @param {number} pitch
         * @param {number} distance
         */
        setCameraOrbit(yaw, pitch, distance) {
            this._orbit.yaw = yaw;
            this._orbit.pitch = Math.max(-1.2, Math.min(1.2, pitch));
            this._orbit.distance = Math.max(80, Math.min(420, distance));
            if (this.camera) {
                this._applyOrbitToCamera(this.camera);
            }
        }

        /** @returns {{ yaw: number, pitch: number, distance: number }} */
        getOrbitState() {
            return { ...this._orbit };
        }

        /**
         * @param {boolean} enabled
         * @param {number} [speed]
         */
        setAutoRotate(enabled, speed) {
            this._autoRotateEnabled = enabled === true;
            if (typeof speed === 'number') {
                this._autoRotateSpeed = speed;
            }
        }

        /**
         * @param {import('./kg-graph-layout').LayoutSnapshot} layout
         * @param {import('./kg-graph-core').NormalizedGraph} graph
         * @param {object} [highlight]
         */
        render(layout, graph, highlight) {
            if (!this._initialized || this._disposed || !this.webglRenderer) return;

            if (this._autoRotateEnabled) {
                this._orbit.yaw += this._autoRotateSpeed * 0.016;
                this._applyOrbitToCamera(this.camera);
            }

            this._lastLayout = layout;
            this._lastGraph = graph;
            this._edgeIdByKey.clear();
            for (const edge of graph.edges) {
                this._edgeIdByKey.set(`${edge.source}|${edge.target}|${edge.type}`, edge.id);
            }

            const descriptors = buildNodeDescriptors(layout, graph, highlight, this.effectTier);
            const edgeData = buildEdgeLineData(layout, layout.edges, highlight, this._edgeIdByKey);

            const THREE = this.three;
            const mesh = this.nodeMesh;
            const matrix = this._matrixScratch;
            const color = this._colorScratch;

            for (let i = 0; i < this.effectTier.maxNodes; i += 1) {
                if (i < descriptors.length) {
                    const d = descriptors[i];
                    matrix.identity();
                    matrix.makeScale(d.radius, d.radius, d.radius);
                    matrix.elements[12] = d.x;
                    matrix.elements[13] = d.y;
                    matrix.elements[14] = d.z;
                    mesh.setMatrixAt(i, matrix);
                    color.setHex(d.color);
                    if (d.emissiveBoost > 0 && typeof color.offsetHSL === 'function') {
                        color.offsetHSL(0, 0, d.emissiveBoost);
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
            if (mesh.material) {
                mesh.material.opacity = highlight && highlight.dimUnhighlighted ? 0.92 : 1;
            }

            if (this.edgeLines) {
                this.edgeLines.geometry.setAttribute(
                    'position',
                    new THREE.BufferAttribute(edgeData.positions, 3)
                );
                this.edgeLines.geometry.setAttribute(
                    'color',
                    new THREE.BufferAttribute(edgeData.colors, 3)
                );
                this.edgeLines.geometry.computeBoundingSphere();
            }

            this.webglRenderer.render(this.scene, this.camera);
        }

        /**
         * @param {string} nodeId
         * @returns {{ x: number, y: number, visible: boolean }|null}
         */
        projectNodeToScreen(nodeId) {
            if (!this._lastLayout || !this.camera || !this.canvas) return null;
            const pos = buildLayoutNodeMap(this._lastLayout).get(nodeId);
            if (!pos) return null;
            return projectWorldToScreen(this.camera, pos, this.canvas.width, this.canvas.height);
        }

        /**
         * @param {number} clientX
         * @param {number} clientY
         * @returns {string|null}
         */
        pickNode(clientX, clientY) {
            if (!this._lastLayout || !this.camera || !this.canvas) return null;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            const screenNodes = this._lastLayout.nodes.map((node) => {
                const projected = projectWorldToScreen(
                    this.camera,
                    node,
                    this.canvas.width,
                    this.canvas.height
                );
                return { id: node.id, x: projected.x, y: projected.y, radius: PICK_RADIUS_PX };
            });

            return pickNodeAtScreen(this._lastLayout, screenNodes, x, y, PICK_RADIUS_PX);
        }

        /**
         * @param {number} width
         * @param {number} height
         */
        resize(width, height) {
            this.logicalWidth = Math.max(1, width);
            this.logicalHeight = Math.max(1, height);
            if (!this._initialized || this._disposed || !this.canvas || !this.webglRenderer || !this.camera) {
                return;
            }
            const scale = this.effectTier.canvasResolutionScale;
            const pixelW = Math.max(1, Math.round(this.logicalWidth * scale));
            const pixelH = Math.max(1, Math.round(this.logicalHeight * scale));
            this.canvas.width = pixelW;
            this.canvas.height = pixelH;
            this.webglRenderer.setSize(pixelW, pixelH, false);
            this.camera.aspect = pixelW / pixelH;
            this.camera.updateProjectionMatrix();
        }

        /**
         * @param {boolean} [clearContainer=true]
         */
        dispose(clearContainer) {
            if (this._disposed) return;
            this._disposed = true;

            if (this.nodeMesh) {
                this.nodeMesh.geometry.dispose();
                this.nodeMesh.material.dispose();
                this.nodeMesh.dispose();
            }
            if (this.edgeLines) {
                this.edgeLines.geometry.dispose();
                this.edgeLines.material.dispose();
            }
            if (this.webglRenderer) {
                this.webglRenderer.dispose();
            }

            this.webglRenderer = null;
            this.scene = null;
            this.camera = null;
            this.nodeMesh = null;
            this.edgeLines = null;
            this.canvas = null;
            this._lastLayout = null;
            this._lastGraph = null;

            if (clearContainer !== false && this.container) {
                this.container.innerHTML = '';
            }
            this._initialized = false;
        }
    }

    const api = {
        KgGraph3DRenderer,
        DEFAULT_FOV,
        DEFAULT_ORBIT,
        LOOK_AT,
        NODE_BASE_RADIUS,
        PICK_RADIUS_PX,
        TIER_PRESETS,
        getTierPreset,
        resolveKgRenderMode,
        hexToThreeColor,
        buildLayoutNodeMap,
        computeOrbitCameraPosition,
        projectWorldToScreen,
        buildNodeDescriptors,
        buildEdgeLineData,
        pickNodeAtScreen,
        loadThreeModule
    };

    global.KgGraph3DRenderer = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
