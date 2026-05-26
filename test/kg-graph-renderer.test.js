const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateGraphSnapshot } = require('../js/kg-graph-core.js');
const { computeLayout } = require('../js/kg-graph-layout.js');
const {
    resolveKgRenderMode,
    hexToThreeColor,
    buildLayoutNodeMap,
    computeOrbitCameraPosition,
    buildNodeDescriptors,
    buildEdgeLineData,
    pickNodeAtScreen,
    getTierPreset,
    KgGraph3DRenderer
} = require('../js/kg-graph-3d-renderer.js');
const { clearProbeCache } = require('../js/webgl-capability-probe.js');
const { layoutToCanvas, canvasToLayout, KgGraph2DRenderer } = require('../js/kg-graph-2d-renderer.js');
const { selectEffectTier, layoutIterationsForTier, KnowledgeGraphDemoHost } = require('../js/kg-graph-host.js');
const { createMockThree } = require('./fixtures/mock-three.js');

const FIXTURE_A = path.join(__dirname, 'fixtures/graphsphere/scenario-a-chrome-bridge.json');
const FIXTURE_B = path.join(__dirname, 'fixtures/graphsphere/minimal-valid.json');
const FIXTURE_SCENARIO_B = path.join(__dirname, 'fixtures/graphsphere/scenario-b-ai-stack.json');

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

function createMockCanvas() {
    return {
        width: 800,
        height: 600,
        style: {},
        addEventListener() {},
        removeEventListener() {},
        getBoundingClientRect() {
            return { left: 0, top: 0, width: 800, height: 600 };
        },
        getContext(type) {
            if (type === '2d') {
                return {
                    fillRect() {},
                    beginPath() {},
                    arc() {},
                    moveTo() {},
                    lineTo() {},
                    stroke() {},
                    fill() {},
                    fillText() {}
                };
            }
            return null;
        }
    };
}

function createMockContainer() {
    return {
        innerHTML: '',
        appendChild(el) {
            this.lastChild = el;
        },
        getBoundingClientRect() {
            return { width: 800, height: 600 };
        },
        addEventListener() {},
        removeEventListener() {}
    };
}

/** @param {string} fixturePath */
function loadGraph(fixturePath) {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const result = validateGraphSnapshot(raw, { presetPackage: true });
    assert.equal(result.status, 'ok');
    assert.ok(result.graph);
    return result.graph;
}

test('KgGraph3D：Probe 集成与纯函数', async (t) => {
    await t.test('resolveKgRenderMode 委托 probe', () => {
        clearProbeCache();
        const storage = createMockSessionStorage();
        const result = resolveKgRenderMode(
            { forceCanvas2d: true },
            { sessionStorage: storage, createCanvas: () => createMockCanvas() }
        );
        assert.equal(result.mode, 'canvas2d');
        assert.equal(result.reason, 'force_canvas2d');
    });

    await t.test('hexToThreeColor 解析 #RRGGBB', () => {
        assert.equal(hexToThreeColor('#4F46E5'), 0x4f46e5);
        assert.equal(hexToThreeColor('invalid'), 0x94a3b8);
    });

    await t.test('computeOrbitCameraPosition 距离守恒', () => {
        const pos = computeOrbitCameraPosition(0.5, 0.3, 200);
        const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        assert.ok(Math.abs(dist - 200) < 1e-6);
    });

    await t.test('buildNodeDescriptors 邻域高亮降透明度', () => {
        const graph = loadGraph(FIXTURE_B);
        const layout = computeLayout(graph, { seed: 42, iterations: 40 });
        const dimmed = buildNodeDescriptors(layout, graph, {
            selectedNodeId: 'rag-pipeline',
            highlightedNodeIds: ['rag-pipeline', 'llm-core'],
            dimUnhighlighted: true
        });
        const ai = dimmed.find((d) => d.id === 'ai-landscape');
        const rag = dimmed.find((d) => d.id === 'rag-pipeline');
        assert.ok(ai && rag);
        assert.equal(ai.opacity, 0.22);
        assert.equal(rag.opacity, 1);
    });

    await t.test('buildEdgeLineData 输出 segment 顶点', () => {
        const graph = loadGraph(FIXTURE_B);
        const layout = computeLayout(graph, { seed: 42, iterations: 40 });
        const edgeData = buildEdgeLineData(layout, layout.edges, {});
        assert.equal(edgeData.segmentCount, layout.edges.length);
        assert.equal(edgeData.positions.length, layout.edges.length * 6);
    });

    await t.test('pickNodeAtScreen 命中最近节点', () => {
        const graph = loadGraph(FIXTURE_B);
        const layout = computeLayout(graph, { seed: 42, iterations: 40 });
        const screenNodes = layout.nodes.map((n, i) => ({
            id: n.id,
            x: 100 + i * 40,
            y: 200,
            radius: 12
        }));
        const hit = pickNodeAtScreen(layout, screenNodes, 142, 205, 16);
        assert.equal(hit, layout.nodes[1].id);
    });
});

test('KgGraph3DRenderer：InstancedMesh smoke', async (t) => {
    const prevDocument = global.document;
    global.document = {
        createElement(tag) {
            if (tag === 'canvas') return createMockCanvas();
            throw new Error('unexpected tag');
        }
    };

    try {
        const graph = loadGraph(FIXTURE_A);
        const layout = computeLayout(graph, { seed: graph.meta.layoutSeed, iterations: 30 });
        const three = createMockThreeExtended();
        const container = createMockContainer();

        const renderer = new KgGraph3DRenderer({
            container,
            renderMode: 'webgl',
            effectTierId: 'medium',
            logicalWidth: 640,
            logicalHeight: 480,
            three
        });

        await renderer.ensureThree({ three });
        await renderer.init();

        renderer.render(layout, graph, {
            selectedNodeId: 'cursor-bridge',
            highlightedNodeIds: ['cursor-bridge', 'agent-pool'],
            highlightedEdgeIds: ['e-bridge-pool'],
            dimUnhighlighted: true
        });

        assert.ok(renderer.nodeMesh || renderer._renderer);
        const mesh = renderer.nodeMesh;
        assert.ok(mesh);
        assert.equal(mesh.count, graph.nodes.length);
        assert.ok(mesh.instanceMatrix.needsUpdate);

        renderer.setCameraOrbit(1.2, 0.4, 180);
        const orbit = renderer.getOrbitState();
        assert.equal(orbit.distance, 180);

        renderer.dispose(false);
    } finally {
        global.document = prevDocument;
    }
});

test('KgGraph2D：坐标变换与 hitTest', async (t) => {
    await t.test('layoutToCanvas / canvasToLayout 互逆', () => {
        const view = { panX: 10, panY: -5, scale: 2 };
        const p = layoutToCanvas(20, 30, view, 400, 300);
        const back = canvasToLayout(p.x, p.y, view, 400, 300);
        assert.ok(Math.abs(back.x - 20) < 1e-6);
        assert.ok(Math.abs(back.y - 30) < 1e-6);
    });

    await t.test('KgGraph2DRenderer 初始化与 render', () => {
        const prevDocument = global.document;
        global.document = {
            createElement(tag) {
                if (tag === 'canvas') return createMockCanvas();
                throw new Error('unexpected tag');
            }
        };

        try {
            const graph = loadGraph(FIXTURE_B);
            const layout = computeLayout(graph, { seed: 42, iterations: 40 });
            const container = createMockContainer();
            const renderer = new KgGraph2DRenderer({
                container,
                logicalWidth: 640,
                logicalHeight: 480
            });
            renderer.init();
            renderer.render(layout, graph, { selectedNodeId: 'ai-landscape', dimUnhighlighted: true });
            assert.ok(renderer.canvas);
            renderer.dispose(false);
        } finally {
            global.document = prevDocument;
        }
    });
});

test('Host 辅助：Effect Tier 选择', async (t) => {
    await t.test('selectEffectTier 按节点数分档', () => {
        assert.equal(selectEffectTier(50, 2).id, 'low');
        assert.equal(selectEffectTier(120, 2).id, 'medium');
        assert.equal(selectEffectTier(180, 2).id, 'high');
    });

    await t.test('layoutIterationsForTier 递增', () => {
        assert.equal(layoutIterationsForTier(50), 50);
        assert.equal(layoutIterationsForTier(120), 80);
        assert.equal(layoutIterationsForTier(180), 100);
    });
});

test('KnowledgeGraphDemoHost：场景加载与邻域选中', async () => {
    const prevDocument = global.document;
    const prevFetch = global.fetch;
    const prevRaf = global.requestAnimationFrame;
    const prevCancelRaf = global.cancelAnimationFrame;
    const prevResizeObserver = global.ResizeObserver;
    const prevWindow = global.window;

    const fixtureRaw = fs.readFileSync(FIXTURE_SCENARIO_B, 'utf8');
    global.fetch = async () => ({
        ok: true,
        async json() {
            return JSON.parse(fixtureRaw);
        }
    });

    let rafId = 0;
    global.requestAnimationFrame = (cb) => {
        rafId += 1;
        return rafId;
    };
    global.cancelAnimationFrame = () => {};

    global.ResizeObserver = class MockResizeObserver {
        observe() {}
        disconnect() {}
    };

    global.window = {
        addEventListener() {},
        removeEventListener() {}
    };

    global.document = {
        createElement(tag) {
            if (tag === 'canvas') return createMockCanvas();
            throw new Error('unexpected tag');
        }
    };

    const three = createMockThreeExtended();
    const viewport = createMockContainer();
    const sidebar = { innerHTML: '' };
    const states = [];

    const host = new KnowledgeGraphDemoHost({
        viewport,
        sidebar,
        scenarioCatalog: [
            {
                id: 'scenario-b-ai-stack',
                title: 'AI 技术栈',
                url: FIXTURE_SCENARIO_B
            }
        ],
        initialScenarioId: 'scenario-b-ai-stack',
        forceWebGL: true,
        onStateChange: (state) => states.push(state)
    });

    try {
        await host.init({ three });
        assert.equal(host.renderMode, 'webgl');
        assert.ok(host._graph);
        assert.equal(host._graph.nodes.length, 45);

        host.setSelectedNode('ai-landscape');
        assert.equal(host._selectedNodeId, 'ai-landscape');
        assert.ok(host._highlight.highlightedNodeIds.length >= 2);
        assert.ok(sidebar.innerHTML.includes('AI 产业全景'));

        host.startTour();
        assert.equal(host._tourRunning, true);
        host.pauseTour();
        assert.equal(host._tourRunning, false);
        assert.ok(states.length > 0);
    } finally {
        host.destroy();
        global.document = prevDocument;
        global.fetch = prevFetch;
        global.requestAnimationFrame = prevRaf;
        global.cancelAnimationFrame = prevCancelRaf;
        global.ResizeObserver = prevResizeObserver;
        global.window = prevWindow;
    }
});

test('KgGraph3DRenderer：pickNode 屏幕坐标命中', async () => {
    const prevDocument = global.document;
    global.document = {
        createElement(tag) {
            if (tag === 'canvas') return createMockCanvas();
            throw new Error('unexpected tag');
        }
    };

    try {
        const graph = loadGraph(FIXTURE_B);
        const layout = computeLayout(graph, { seed: 42, iterations: 40 });
        const three = createMockThreeExtended();
        const container = createMockContainer();

        const renderer = new KgGraph3DRenderer({
            container,
            renderMode: 'webgl',
            effectTierId: 'medium',
            logicalWidth: 800,
            logicalHeight: 600,
            three
        });

        await renderer.ensureThree({ three });
        await renderer.init();
        renderer.render(layout, graph, {});

        const first = layout.nodes[0];
        const projected = renderer.projectNodeToScreen(first.id);
        assert.ok(projected);
        assert.equal(typeof projected.x, 'number');
        assert.equal(typeof projected.y, 'number');

        const picked = renderer.pickNode(projected.x, projected.y);
        assert.ok(picked);

        renderer.dispose(false);
    } finally {
        global.document = prevDocument;
    }
});

/**
 * 扩展 mock-three 以支持 KgGraph3DRenderer 初始化。
 */
function createMockThreeExtended() {
    const base = createMockThree();

    class Vector3 {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        project(camera) {
            this.z = 0.2;
            this.x = this.x / 200;
            this.y = this.y / 200;
            return this;
        }
    }

    class SphereGeometry {
        constructor() {}
        dispose() {}
    }

    class BufferGeometry {
        constructor() {
            this.attributes = {};
        }
        setAttribute(name, attr) {
            this.attributes[name] = attr;
        }
        computeBoundingSphere() {}
        dispose() {}
    }

    class BufferAttribute {
        constructor(array, itemSize) {
            this.array = array;
            this.itemSize = itemSize;
        }
    }

    class LineBasicMaterial {
        constructor() {}
        dispose() {}
    }

    class LineSegments {
        constructor(geometry, material) {
            this.geometry = geometry;
            this.material = material;
        }
    }

    class FogExp2 {
        constructor() {}
    }

    class ColorExtended extends base.Color {
        offsetHSL() {
            return this;
        }
    }

    base.PerspectiveCamera.prototype.project = function project() {};

    return {
        ...base,
        Color: ColorExtended,
        Vector3,
        SphereGeometry,
        BufferGeometry,
        BufferAttribute,
        LineBasicMaterial,
        LineSegments,
        FogExp2
    };
}
