(function attachKgGraph2DRenderer(global) {
    'use strict';

    const coreRef =
        typeof require !== 'undefined'
            ? require('./kg-graph-3d-renderer.js')
            : global.KgGraph3DRenderer || {};

    const {
        buildNodeDescriptors,
        buildEdgeLineData,
        pickNodeAtScreen,
        getTierPreset,
        TIER_PRESETS
    } = coreRef;

    const DEFAULT_VIEW = Object.freeze({ panX: 0, panY: 0, scale: 1.8 });
    const BG_COLOR = '#020617';
    const EDGE_COLOR = 'rgba(148, 163, 184, 0.35)';
    const EDGE_HIGHLIGHT = 'rgba(56, 189, 248, 0.85)';

    /**
     * @param {string} hex
     * @returns {string}
     */
    function hexToRgba(hex, alpha) {
        if (typeof hex !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            return `rgba(148, 163, 184, ${alpha})`;
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    /**
     * @param {number} layoutX
     * @param {number} layoutY
     * @param {{ panX: number, panY: number, scale: number }} view
     * @param {number} cx
     * @param {number} cy
     */
    function layoutToCanvas(layoutX, layoutY, view, cx, cy) {
        return {
            x: cx + (layoutX + view.panX) * view.scale,
            y: cy - (layoutY + view.panY) * view.scale
        };
    }

    /**
     * @param {number} canvasX
     * @param {number} canvasY
     * @param {{ panX: number, panY: number, scale: number }} view
     * @param {number} cx
     * @param {number} cy
     */
    function canvasToLayout(canvasX, canvasY, view, cx, cy) {
        return {
            x: (canvasX - cx) / view.scale - view.panX,
            y: -(canvasY - cy) / view.scale - view.panY
        };
    }

    class KgGraph2DRenderer {
        /**
         * @param {object} options
         * @param {HTMLElement} options.container
         * @param {string} [options.effectTierId]
         * @param {number} [options.logicalWidth]
         * @param {number} [options.logicalHeight]
         */
        constructor(options) {
            if (!options || !options.container) {
                throw new TypeError('KgGraph2DRenderer: container is required');
            }
            this.container = options.container;
            this.effectTier = getTierPreset(options.effectTierId || 'medium');
            this.logicalWidth = Math.max(1, options.logicalWidth || 960);
            this.logicalHeight = Math.max(1, options.logicalHeight || 640);
            this.view = { ...DEFAULT_VIEW };

            this._initialized = false;
            this._disposed = false;
            /** @type {HTMLCanvasElement|null} */
            this.canvas = null;
            /** @type {CanvasRenderingContext2D|null} */
            this.ctx = null;
            /** @type {import('./kg-graph-layout').LayoutSnapshot|null} */
            this._lastLayout = null;
            /** @type {import('./kg-graph-core').NormalizedGraph|null} */
            this._lastGraph = null;
            /** @type {Map<string, { x: number, y: number, radius: number }>} */
            this._screenNodes = new Map();
        }

        init() {
            if (this._initialized || this._disposed) return;
            this.container.innerHTML = '';

            const canvas = document.createElement('canvas');
            canvas.className = 'kg-graph-canvas kg-graph-canvas--2d';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvas.width = this.logicalWidth;
            canvas.height = this.logicalHeight;
            this.container.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('KgGraph2DRenderer: Canvas 2D unavailable');
            }

            this.canvas = canvas;
            this.ctx = ctx;
            this._initialized = true;
        }

        /**
         * @param {{ panX?: number, panY?: number, scale?: number }} view
         */
        setView(view) {
            if (typeof view.panX === 'number') this.view.panX = view.panX;
            if (typeof view.panY === 'number') this.view.panY = view.panY;
            if (typeof view.scale === 'number') {
                this.view.scale = Math.max(0.4, Math.min(6, view.scale));
            }
        }

        /** @returns {{ panX: number, panY: number, scale: number }} */
        getView() {
            return { ...this.view };
        }

        /**
         * @param {import('./kg-graph-layout').LayoutSnapshot} layout
         * @param {import('./kg-graph-core').NormalizedGraph} graph
         * @param {object} [highlight]
         */
        render(layout, graph, highlight) {
            if (!this._initialized || this._disposed || !this.ctx || !this.canvas) return;

            this._lastLayout = layout;
            this._lastGraph = graph;
            this._screenNodes.clear();

            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            const cx = w / 2;
            const cy = h / 2;

            ctx.fillStyle = BG_COLOR;
            ctx.fillRect(0, 0, w, h);

            const typeColor = new Map();
            for (const nt of graph.schema.nodeTypes) {
                typeColor.set(nt.id, nt.color);
            }

            const posMap = new Map(layout.nodes.map((n) => [n.id, n]));
            const hState = highlight || {};
            const highlighted = new Set(hState.highlightedNodeIds || []);
            if (hState.selectedNodeId) highlighted.add(hState.selectedNodeId);
            const dimOthers = hState.dimUnhighlighted === true && highlighted.size > 0;
            const highlightedEdges = new Set(hState.highlightedEdgeIds || []);

            const edgeIdByKey = new Map();
            for (const edge of graph.edges) {
                edgeIdByKey.set(`${edge.source}|${edge.target}|${edge.type}`, edge.id);
            }

            ctx.lineWidth = 1;
            for (const edge of layout.edges) {
                const a = posMap.get(edge.sourceId);
                const b = posMap.get(edge.targetId);
                if (!a || !b) continue;
                const pa = layoutToCanvas(a.x, a.y, this.view, cx, cy);
                const pb = layoutToCanvas(b.x, b.y, this.view, cx, cy);
                const edgeId = edgeIdByKey.get(`${edge.sourceId}|${edge.targetId}|${edge.type}`);
                const isHi = highlightedEdges.has(edgeId);
                ctx.strokeStyle = isHi ? EDGE_HIGHLIGHT : (dimOthers ? 'rgba(100,116,139,0.15)' : EDGE_COLOR);
                ctx.beginPath();
                ctx.moveTo(pa.x, pa.y);
                ctx.lineTo(pb.x, pb.y);
                ctx.stroke();
            }

            const showAllLabels = layout.nodes.length <= 80;
            const labelBudget = this.effectTier.maxLabels || TIER_PRESETS.medium.maxLabels;
            let labelsDrawn = 0;

            for (const node of layout.nodes) {
                const meta = graph.nodeById.get(node.id);
                const screen = layoutToCanvas(node.x, node.y, this.view, cx, cy);
                const weight = meta && meta.weight ? meta.weight : 1;
                const radius = 5 + Math.min(weight, 3) * 1.2;
                this._screenNodes.set(node.id, { x: screen.x, y: screen.y, radius });

                const baseHex = typeColor.get(meta && meta.type) || '#64748b';
                let alpha = 0.9;
                if (dimOthers && !highlighted.has(node.id)) {
                    alpha = 0.25;
                } else if (hState.selectedNodeId === node.id) {
                    alpha = 1;
                } else if (highlighted.has(node.id)) {
                    alpha = 0.95;
                }

                ctx.beginPath();
                ctx.fillStyle = hexToRgba(baseHex, alpha);
                ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
                ctx.fill();

                if (hState.selectedNodeId === node.id) {
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.95)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    ctx.lineWidth = 1;
                }

                const shouldLabel =
                    showAllLabels ||
                    hState.selectedNodeId === node.id ||
                    highlighted.has(node.id) ||
                    labelsDrawn < labelBudget;
                if (shouldLabel && meta) {
                    ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
                    ctx.font = '11px -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(meta.label, screen.x, screen.y - radius - 4);
                    labelsDrawn += 1;
                }
            }
        }

        /**
         * @param {number} clientX
         * @param {number} clientY
         * @returns {string|null}
         */
        hitTest(clientX, clientY) {
            if (!this._lastLayout || !this.canvas) return null;
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            const screenNodes = [...this._screenNodes.entries()].map(([id, pos]) => ({
                id,
                x: pos.x,
                y: pos.y,
                radius: pos.radius
            }));

            return pickNodeAtScreen(this._lastLayout, screenNodes, x, y, 12);
        }

        /**
         * @param {number} width
         * @param {number} height
         */
        resize(width, height) {
            this.logicalWidth = Math.max(1, width);
            this.logicalHeight = Math.max(1, height);
            if (!this.canvas) return;
            this.canvas.width = this.logicalWidth;
            this.canvas.height = this.logicalHeight;
        }

        /**
         * @param {boolean} [clearContainer=true]
         */
        dispose(clearContainer) {
            if (this._disposed) return;
            this._disposed = true;
            this.canvas = null;
            this.ctx = null;
            this._lastLayout = null;
            this._lastGraph = null;
            this._screenNodes.clear();
            if (clearContainer !== false && this.container) {
                this.container.innerHTML = '';
            }
            this._initialized = false;
        }
    }

    const api = {
        KgGraph2DRenderer,
        DEFAULT_VIEW,
        hexToRgba,
        layoutToCanvas,
        canvasToLayout
    };

    global.KgGraph2DRenderer = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
