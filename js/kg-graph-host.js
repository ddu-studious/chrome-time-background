(function attachKgGraphHost(global) {
    'use strict';

    const coreRef =
        typeof require !== 'undefined' ? require('./kg-graph-core.js') : global.KgGraphCore || {};
    const layoutRef =
        typeof require !== 'undefined' ? require('./kg-graph-layout.js') : global.KgGraphLayout || {};
    const renderer3dRef =
        typeof require !== 'undefined'
            ? require('./kg-graph-3d-renderer.js')
            : global.KgGraph3DRenderer || {};
    const renderer2dRef =
        typeof require !== 'undefined'
            ? require('./kg-graph-2d-renderer.js')
            : global.KgGraph2DRenderer || {};
    const probeRef =
        typeof require !== 'undefined'
            ? require('./webgl-capability-probe.js')
            : global.TetrisWebGLCapabilityProbe || {};

    const { validateGraphSnapshot, getNeighborhood1Hop } = coreRef;
    const { computeLayout } = layoutRef;
    const {
        KgGraph3DRenderer,
        resolveKgRenderMode,
        getTierPreset,
        computeOrbitCameraPosition,
        TIER_PRESETS
    } = renderer3dRef;
    const { KgGraph2DRenderer } = renderer2dRef;
    const { clearProbeCache } = probeRef;

    const RENDER_MODE_STORAGE_KEY = 'graphsphere.renderMode';
    const TOUR_DWELL_MS = 2800;

    /**
     * @param {string} text
     */
    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @param {number} nodeCount
     * @param {1|2|undefined} glVersion
     */
    function selectEffectTier(nodeCount, glVersion) {
        if (nodeCount <= TIER_PRESETS.low.maxNodes) return getTierPreset('low');
        if (nodeCount <= TIER_PRESETS.medium.maxNodes) return getTierPreset('medium');
        if (nodeCount <= TIER_PRESETS.high.maxNodes && glVersion !== 1) {
            return getTierPreset('high');
        }
        return getTierPreset('medium');
    }

    /**
     * @param {number} nodeCount
     */
    function layoutIterationsForTier(nodeCount) {
        if (nodeCount <= TIER_PRESETS.low.maxNodes) return 50;
        if (nodeCount <= TIER_PRESETS.medium.maxNodes) return 80;
        return 100;
    }

    class KnowledgeGraphDemoHost {
        /**
         * @param {object} options
         * @param {HTMLElement} options.viewport
         * @param {HTMLElement} [options.sidebar]
         * @param {HTMLElement} [options.statusEl]
         * @param {HTMLElement} [options.badgeEl]
         * @param {ReadonlyArray<{ id: string, title: string, url: string }>} options.scenarioCatalog
         * @param {string} [options.initialScenarioId]
         * @param {boolean} [options.forceCanvas2d]
         * @param {boolean} [options.forceWebGL]
         * @param {(state: object) => void} [options.onStateChange]
         */
        constructor(options) {
            if (!options || !options.viewport) {
                throw new TypeError('KnowledgeGraphDemoHost: viewport is required');
            }

            this.viewport = options.viewport;
            this.sidebar = options.sidebar || null;
            this.statusEl = options.statusEl || null;
            this.badgeEl = options.badgeEl || null;
            this.scenarioCatalog = options.scenarioCatalog || [];
            this.onStateChange = options.onStateChange || null;

            this._initialScenarioId =
                options.initialScenarioId ||
                (this.scenarioCatalog[0] && this.scenarioCatalog[0].id) ||
                null;

            this._forceCanvas2d = options.forceCanvas2d === true;
            this._forceWebGL = options.forceWebGL === true;

            /** @type {'webgl'|'canvas2d'} */
            this.renderMode = 'webgl';
            this._renderer = null;
            /** @type {import('./kg-graph-core').NormalizedGraph|null} */
            this._graph = null;
            /** @type {import('./kg-graph-layout').LayoutSnapshot|null} */
            this._layout = null;
            this._selectedNodeId = null;
            this._highlight = { highlightedNodeIds: [], highlightedEdgeIds: [], dimUnhighlighted: false };
            this._tourRunning = false;
            this._tourIndex = 0;
            this._tourTimer = null;
            this._rafId = 0;
            this._orbitDragging = false;
            this._lastPointer = null;
            this._disposed = false;
            this._fpsFrames = 0;
            this._fpsLast = 0;
            this._fpsValue = 0;
            /** @type {ResizeObserver|null} */
            this._resizeObserver = null;
        }

        /**
         * @param {object} [loadOptions]
         * @param {object} [loadOptions.three]
         */
        async init(loadOptions) {
            if (this._disposed) return;

            const urlParams =
                typeof URLSearchParams !== 'undefined' && typeof location !== 'undefined'
                    ? new URLSearchParams(location.search)
                    : null;

            if (this._forceWebGL || (urlParams && urlParams.has('force3d'))) {
                clearProbeCache();
            }

            let storedMode = null;
            try {
                storedMode =
                    typeof sessionStorage !== 'undefined'
                        ? sessionStorage.getItem(RENDER_MODE_STORAGE_KEY)
                        : null;
            } catch (_err) {
                /* private mode */
            }

            const force2d =
                this._forceCanvas2d ||
                storedMode === '2d' ||
                (urlParams && urlParams.has('force2d'));

            const probe = resolveKgRenderMode({
                forceCanvas2d: force2d,
                renderModeOverride: this._forceWebGL ? 'webgl' : undefined
            });

            this.renderMode = probe.mode === 'canvas2d' ? 'canvas2d' : 'webgl';
            this._probeResult = probe;
            this._threeModule = loadOptions && loadOptions.three ? loadOptions.three : null;

            this._bindViewportEvents();
            this._bindResizeObserver();

            if (this._initialScenarioId) {
                await this.loadScenario(this._initialScenarioId);
            }

            this._startRenderLoop();
            this._emitState();
            this._setStatus('就绪');
            this._updateBadge();
        }

        _bindViewportEvents() {
            this._onPointerDown = (event) => {
                if (event.button !== 0) return;
                this._orbitDragging = true;
                this._lastPointer = { x: event.clientX, y: event.clientY };
            };
            this._onPointerMove = (event) => {
                if (!this._orbitDragging || !this._lastPointer) return;
                const dx = event.clientX - this._lastPointer.x;
                const dy = event.clientY - this._lastPointer.y;
                this._lastPointer = { x: event.clientX, y: event.clientY };

                if (this.renderMode === 'webgl' && this._renderer && this._renderer.setCameraOrbit) {
                    const orbit = this._renderer.getOrbitState();
                    this._renderer.setCameraOrbit(
                        orbit.yaw - dx * 0.005,
                        orbit.pitch + dy * 0.004,
                        orbit.distance
                    );
                } else if (this.renderMode === 'canvas2d' && this._renderer && this._renderer.setView) {
                    const view = this._renderer.getView();
                    this._renderer.setView({
                        panX: view.panX + dx / view.scale,
                        panY: view.panY - dy / view.scale
                    });
                    this._renderFrame();
                }
            };
            this._onPointerUp = () => {
                this._orbitDragging = false;
                this._lastPointer = null;
            };
            this._onClick = (event) => {
                if (!this._renderer) return;
                const nodeId =
                    this.renderMode === 'canvas2d'
                        ? this._renderer.hitTest(event.clientX, event.clientY)
                        : this._renderer.pickNode(event.clientX, event.clientY);
                if (nodeId) {
                    this.setSelectedNode(nodeId);
                }
            };
            this._onWheel = (event) => {
                event.preventDefault();
                if (this.renderMode === 'webgl' && this._renderer && this._renderer.setCameraOrbit) {
                    const orbit = this._renderer.getOrbitState();
                    const delta = event.deltaY > 0 ? 1.08 : 0.92;
                    this._renderer.setCameraOrbit(orbit.yaw, orbit.pitch, orbit.distance * delta);
                } else if (this.renderMode === 'canvas2d' && this._renderer && this._renderer.setView) {
                    const view = this._renderer.getView();
                    const factor = event.deltaY > 0 ? 0.92 : 1.08;
                    this._renderer.setView({ scale: view.scale * factor });
                    this._renderFrame();
                }
            };

            this.viewport.addEventListener('pointerdown', this._onPointerDown);
            this.viewport.addEventListener('pointermove', this._onPointerMove);
            window.addEventListener('pointerup', this._onPointerUp);
            this.viewport.addEventListener('click', this._onClick);
            this.viewport.addEventListener('wheel', this._onWheel, { passive: false });
        }

        _bindResizeObserver() {
            if (typeof ResizeObserver === 'undefined') return;

            this._onViewportResize = () => {
                if (this._disposed || !this._renderer) return;
                const rect = this.viewport.getBoundingClientRect();
                const width = Math.max(320, Math.round(rect.width));
                const height = Math.max(240, Math.round(rect.height));
                if (this._renderer.resize) {
                    this._renderer.resize(width, height);
                }
                this._renderFrame();
            };

            this._resizeObserver = new ResizeObserver(() => {
                this._onViewportResize();
            });
            this._resizeObserver.observe(this.viewport);
        }

        /**
         * @param {string} metaId
         */
        async loadScenario(metaId) {
            const entry = this.scenarioCatalog.find((s) => s.id === metaId);
            if (!entry) {
                throw new Error(`Unknown scenario "${metaId}"`);
            }

            this.pauseTour();
            this._setStatus(`加载场景：${entry.title}…`);

            const response = await fetch(entry.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch scenario (${response.status})`);
            }
            const raw = await response.json();
            const validated = validateGraphSnapshot(raw, { presetPackage: true });
            if (validated.status !== 'ok' || !validated.graph) {
                const msg = validated.issues.map((i) => i.message).join('; ');
                throw new Error(`GraphSnapshot invalid: ${msg}`);
            }

            this._graph = validated.graph;
            const tier = selectEffectTier(this._graph.nodes.length, this._probeResult && this._probeResult.glVersion);
            const iterations = layoutIterationsForTier(this._graph.nodes.length);
            this._layout = computeLayout(this._graph, {
                seed: this._graph.meta.layoutSeed,
                iterations
            });

            await this._ensureRenderer(tier.id);
            this._selectedNodeId = null;
            this._highlight = { highlightedNodeIds: [], highlightedEdgeIds: [], dimUnhighlighted: false };
            this._renderFrame();
            this._updateSidebar(null);
            this._setStatus(`${entry.title} · ${this._graph.nodes.length} 节点`);
            this._emitState({ scenarioId: metaId });
        }

        /**
         * @param {string} tierId
         */
        async _ensureRenderer(tierId) {
            if (this._renderer) {
                this._renderer.dispose();
                this._renderer = null;
            }

            const rect = this.viewport.getBoundingClientRect();
            const width = Math.max(320, Math.round(rect.width));
            const height = Math.max(240, Math.round(rect.height));

            if (this.renderMode === 'canvas2d') {
                this._renderer = new KgGraph2DRenderer({
                    container: this.viewport,
                    effectTierId: tierId,
                    logicalWidth: width,
                    logicalHeight: height
                });
                this._renderer.init();
                return;
            }

            this._renderer = new KgGraph3DRenderer({
                container: this.viewport,
                renderMode: 'webgl',
                effectTierId: tierId,
                logicalWidth: width,
                logicalHeight: height,
                three: this._threeModule || undefined
            });
            if (!this._threeModule) {
                await this._renderer.ensureThree();
            } else {
                await this._renderer.ensureThree({ three: this._threeModule });
            }
            await this._renderer.init();
            this._renderer.setAutoRotate(true, 0.06);
        }

        /**
         * @param {string|null} nodeId
         */
        setSelectedNode(nodeId) {
            if (!this._graph) return;
            if (!nodeId) {
                this._selectedNodeId = null;
                this._highlight = { highlightedNodeIds: [], highlightedEdgeIds: [], dimUnhighlighted: false };
            } else if (!this._graph.nodeById.has(nodeId)) {
                return;
            } else {
                this._selectedNodeId = nodeId;
                const hood = getNeighborhood1Hop(this._graph, nodeId);
                this._highlight = {
                    selectedNodeId: nodeId,
                    highlightedNodeIds: hood.nodeIds,
                    highlightedEdgeIds: hood.edgeIds,
                    dimUnhighlighted: true
                };
            }
            this._renderFrame();
            this._updateSidebar(this._selectedNodeId);
            this._emitState();
        }

        startTour() {
            if (!this._graph || !this._graph.demo || !this._graph.demo.tourNodeIds) {
                this._setStatus('当前场景未配置演示路径');
                return;
            }
            this._tourNodeIds = [...this._graph.demo.tourNodeIds];
            if (this._tourNodeIds.length < 3) {
                this._setStatus('演示路径至少需要 3 个节点');
                return;
            }
            this._tourRunning = true;
            this._tourIndex = 0;
            if (this._renderer && this._renderer.setAutoRotate) {
                this._renderer.setAutoRotate(false);
            }
            this._runTourStep();
            this._emitState();
        }

        _runTourStep() {
            if (!this._tourRunning || !this._tourNodeIds) return;
            const nodeId = this._tourNodeIds[this._tourIndex];
            this.setSelectedNode(nodeId);
            this._focusNodeForTour(nodeId);

            this._tourTimer = setTimeout(() => {
                if (!this._tourRunning) return;
                this._tourIndex = (this._tourIndex + 1) % this._tourNodeIds.length;
                this._runTourStep();
            }, TOUR_DWELL_MS);
        }

        /**
         * @param {string} nodeId
         */
        _focusNodeForTour(nodeId) {
            if (!this._layout || !this._renderer) return;
            const pos = this._layout.nodes.find((n) => n.id === nodeId);
            if (!pos) return;

            if (this.renderMode === 'webgl' && this._renderer.setCameraOrbit) {
                const yaw = Math.atan2(pos.x, pos.z);
                const dist = Math.max(120, Math.min(260, this._renderer.getOrbitState().distance));
                this._renderer.setCameraOrbit(yaw + 0.4, 0.28, dist);
            } else if (this.renderMode === 'canvas2d' && this._renderer.setView) {
                this._renderer.setView({ panX: -pos.x, panY: -pos.y, scale: 2.2 });
            }
        }

        pauseTour() {
            this._tourRunning = false;
            if (this._tourTimer) {
                clearTimeout(this._tourTimer);
                this._tourTimer = null;
            }
            if (this._renderer && this._renderer.setAutoRotate) {
                this._renderer.setAutoRotate(true, 0.06);
            }
            this._emitState();
        }

        resetTour() {
            this.pauseTour();
            this._tourIndex = 0;
            this.setSelectedNode(null);
            if (this.renderMode === 'webgl' && this._renderer && this._renderer.setCameraOrbit) {
                this._renderer.setCameraOrbit(0.65, 0.35, 220);
            } else if (this.renderMode === 'canvas2d' && this._renderer && this._renderer.setView) {
                this._renderer.setView({ panX: 0, panY: 0, scale: 1.8 });
            }
            this._emitState();
        }

        /**
         * @param {'3d'|'2d'} mode
         */
        async switchRenderMode(mode) {
            const next = mode === '2d' ? 'canvas2d' : 'webgl';
            if (next === this.renderMode) return;

            const scenarioId = this._graph && this._graph.meta ? this._graph.meta.id : this._initialScenarioId;
            this.renderMode = next;

            try {
                sessionStorage.setItem(RENDER_MODE_STORAGE_KEY, mode === '2d' ? '2d' : '3d');
            } catch (_err) {
                /* ignore */
            }

            if (scenarioId) {
                await this.loadScenario(scenarioId);
            }
            this._updateBadge();
            this._emitState();
        }

        _renderFrame() {
            if (!this._renderer || !this._layout || !this._graph) return;
            this._renderer.render(this._layout, this._graph, this._highlight);
        }

        _startRenderLoop() {
            const tick = (now) => {
                if (this._disposed) return;
                this._fpsFrames += 1;
                if (!this._fpsLast) this._fpsLast = now;
                if (now - this._fpsLast >= 1000) {
                    this._fpsValue = this._fpsFrames;
                    this._fpsFrames = 0;
                    this._fpsLast = now;
                    this._emitState({ fps: this._fpsValue });
                }

                if (this._renderer && this._layout && this._graph) {
                    if (this.renderMode === 'webgl' && this._renderer.setAutoRotate) {
                        this._renderer.render(this._layout, this._graph, this._highlight);
                    }
                }

                this._rafId = requestAnimationFrame(tick);
            };
            this._rafId = requestAnimationFrame(tick);
        }

        /**
         * @param {string|null} nodeId
         */
        _updateSidebar(nodeId) {
            if (!this.sidebar) return;
            if (!nodeId || !this._graph) {
                this.sidebar.innerHTML =
                    '<p class="kg-sidebar-empty">点击节点查看详情与邻域高亮</p>';
                return;
            }
            const node = this._graph.nodeById.get(nodeId);
            if (!node) return;
            const typeDef = this._graph.schema.nodeTypes.find((t) => t.id === node.type);
            const hood = getNeighborhood1Hop(this._graph, nodeId);
            const neighbors = hood.nodeIds
                .filter((id) => id !== nodeId)
                .map((id) => this._graph.nodeById.get(id))
                .filter(Boolean);

            const typeLabel = typeDef ? typeDef.label : node.type;
            const typeColor = typeDef ? typeDef.color : '#64748b';

            this.sidebar.innerHTML = `
                <div class="kg-node-detail">
                    <span class="kg-type-chip" style="--chip-color:${typeColor}">${typeLabel}</span>
                    <h3>${escapeHtml(node.label)}</h3>
                    ${node.summary ? `<p class="kg-summary">${escapeHtml(node.summary)}</p>` : ''}
                    <dl class="kg-meta">
                        <dt>节点 ID</dt><dd><code>${escapeHtml(node.id)}</code></dd>
                        <dt>邻接数</dt><dd>${hood.nodeIds.length - 1}</dd>
                    </dl>
                    ${
                        neighbors.length
                            ? `<div class="kg-neighbors"><h4>邻域 (${neighbors.length})</h4><ul>${neighbors
                                  .map((n) => `<li>${escapeHtml(n.label)}</li>`)
                                  .join('')}</ul></div>`
                            : ''
                    }
                </div>
            `;
        }

        _setStatus(text) {
            if (this.statusEl) {
                this.statusEl.textContent = text;
            }
        }

        _updateBadge() {
            if (!this.badgeEl) return;
            this.badgeEl.textContent = this.renderMode === 'webgl' ? 'WebGL 3D' : 'Canvas 2D';
            this.badgeEl.dataset.mode = this.renderMode;
        }

        /**
         * @param {object} [patch]
         */
        _emitState(patch) {
            if (!this.onStateChange) return;
            this.onStateChange({
                renderMode: this.renderMode,
                scenarioId: this._graph && this._graph.meta ? this._graph.meta.id : null,
                scenarioTitle: this._graph && this._graph.meta ? this._graph.meta.title : null,
                nodeCount: this._graph ? this._graph.nodes.length : 0,
                selectedNodeId: this._selectedNodeId,
                tourRunning: this._tourRunning,
                fps: this._fpsValue,
                ...patch
            });
        }

        destroy() {
            if (this._disposed) return;
            this._disposed = true;
            this.pauseTour();

            if (this._rafId) cancelAnimationFrame(this._rafId);

            this.viewport.removeEventListener('pointerdown', this._onPointerDown);
            this.viewport.removeEventListener('pointermove', this._onPointerMove);
            window.removeEventListener('pointerup', this._onPointerUp);
            this.viewport.removeEventListener('click', this._onClick);
            this.viewport.removeEventListener('wheel', this._onWheel);

            if (this._resizeObserver) {
                this._resizeObserver.disconnect();
                this._resizeObserver = null;
            }

            if (this._renderer) {
                this._renderer.dispose();
                this._renderer = null;
            }
        }
    }

    const api = {
        KnowledgeGraphDemoHost,
        selectEffectTier,
        layoutIterationsForTier,
        RENDER_MODE_STORAGE_KEY,
        TIER_PRESETS
    };

    global.KnowledgeGraphDemoHost = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
