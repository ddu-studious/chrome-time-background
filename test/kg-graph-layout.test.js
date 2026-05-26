const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateGraphSnapshot } = require('../js/kg-graph-core.js');
const { computeLayout, createRng } = require('../js/kg-graph-layout.js');

const FIXTURE_PATH = path.join(__dirname, 'fixtures/graphsphere/minimal-valid.json');
const EPSILON = 1e-6;

/** minimal-valid.json · seed=42 · iterations=80 坐标快照（PR-2 回归门禁） */
const MINIMAL_LAYOUT_GOLDEN = Object.freeze([
    { id: 'ai-landscape', x: 0, y: 55, z: 0 },
    { id: 'rag-pipeline', x: 7.931, y: 11.583, z: 3.928 },
    { id: 'llm-core', x: -8.438, y: -26.086, z: -4.066 }
]);

/** @returns {import('../js/kg-graph-core.js').NormalizedGraph} */
function loadValidatedGraph() {
    const raw = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const result = validateGraphSnapshot(raw, { presetPackage: true });
    assert.equal(result.status, 'ok');
    assert.ok(result.graph);
    return result.graph;
}

/**
 * @param {import('../js/kg-graph-layout.js').LayoutSnapshot} layout
 * @param {string} nodeId
 */
function getLayoutNode(layout, nodeId) {
    return layout.nodes.find((n) => n.id === nodeId);
}

test('布局引擎：确定性 seed 可复现', async (t) => {
    await t.test('同 seed + 同图 → 坐标完全一致', () => {
        const graph = loadValidatedGraph();
        const options = { seed: 42, iterations: 80 };

        const a = computeLayout(graph, options);
        const b = computeLayout(graph, options);

        assert.equal(a.seed, 42);
        assert.equal(a.iterationCount, 80);
        assert.equal(a.sceneId, graph.meta.id);
        assert.equal(a.nodes.length, graph.nodes.length);
        assert.equal(a.edges.length, graph.edges.length);

        for (let i = 0; i < a.nodes.length; i += 1) {
            assert.equal(a.nodes[i].id, b.nodes[i].id);
            assert.ok(Math.abs(a.nodes[i].x - b.nodes[i].x) < EPSILON);
            assert.ok(Math.abs(a.nodes[i].y - b.nodes[i].y) < EPSILON);
            assert.ok(Math.abs(a.nodes[i].z - b.nodes[i].z) < EPSILON);
        }
    });

    await t.test('不同 seed → 坐标不同', () => {
        const graph = loadValidatedGraph();
        const layoutA = computeLayout(graph, { seed: 42, iterations: 80 });
        const layoutB = computeLayout(graph, { seed: 99, iterations: 80 });

        const nodeA = getLayoutNode(layoutA, 'rag-pipeline');
        const nodeB = getLayoutNode(layoutB, 'rag-pipeline');
        assert.ok(nodeA && nodeB);

        const samePosition =
            Math.abs(nodeA.x - nodeB.x) < EPSILON &&
            Math.abs(nodeA.y - nodeB.y) < EPSILON &&
            Math.abs(nodeA.z - nodeB.z) < EPSILON;
        assert.equal(samePosition, false);
    });

    await t.test('默认 seed 取自 graph.meta.layoutSeed', () => {
        const graph = loadValidatedGraph();
        const layout = computeLayout(graph, { iterations: 50 });
        assert.equal(layout.seed, graph.meta.layoutSeed);
        assert.equal(layout.iterationCount, 50);
    });

    await t.test('minimal fixture 坐标快照与 golden 一致', () => {
        const graph = loadValidatedGraph();
        const layout = computeLayout(graph, { seed: 42, iterations: 80 });

        assert.equal(layout.nodes.length, MINIMAL_LAYOUT_GOLDEN.length);
        for (const expected of MINIMAL_LAYOUT_GOLDEN) {
            const actual = getLayoutNode(layout, expected.id);
            assert.ok(actual, `missing node ${expected.id}`);
            assert.ok(Math.abs(actual.x - expected.x) < EPSILON, `${expected.id}.x`);
            assert.ok(Math.abs(actual.y - expected.y) < EPSILON, `${expected.id}.y`);
            assert.ok(Math.abs(actual.z - expected.z) < EPSILON, `${expected.id}.z`);
        }
    });
});

test('布局引擎：拓扑约束', async (t) => {
    await t.test('相连节点距离小于孤立节点对', () => {
        const graph = loadValidatedGraph();
        const layout = computeLayout(graph, { seed: 42, iterations: 120 });

        const rag = getLayoutNode(layout, 'rag-pipeline');
        const llm = getLayoutNode(layout, 'llm-core');
        const ai = getLayoutNode(layout, 'ai-landscape');
        assert.ok(rag && llm && ai);

        const connectedDist = distance(rag, llm);
        const unrelatedDist = distance(ai, llm);
        assert.ok(connectedDist < unrelatedDist * 1.5);
    });

    await t.test('pinned 节点在 1 与 80 次迭代后坐标不变', () => {
        const graph = loadValidatedGraph();
        const early = computeLayout(graph, { seed: 7, iterations: 1 });
        const late = computeLayout(graph, { seed: 7, iterations: 80 });

        const hubEarly = getLayoutNode(early, 'ai-landscape');
        const hubLate = getLayoutNode(late, 'ai-landscape');
        assert.ok(hubEarly && hubLate);
        assert.equal(hubEarly.x, hubLate.x);
        assert.equal(hubEarly.y, hubLate.y);
        assert.equal(hubEarly.z, hubLate.z);
    });

    await t.test('所有节点坐标在 bounds 半径内', () => {
        const graph = loadValidatedGraph();
        const radius = 100;
        const layout = computeLayout(graph, { seed: 42, iterations: 80, bounds: { radius } });

        for (const node of layout.nodes) {
            const dist = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
            assert.ok(dist <= radius + 1e-3, `node ${node.id} out of bounds: ${dist}`);
        }
    });
});

test('布局引擎：PRNG 辅助', async (t) => {
    await t.test('createRng 同 seed 序列可复现', () => {
        const a = createRng(12345);
        const b = createRng(12345);
        const seqA = [a(), a(), a()];
        const seqB = [b(), b(), b()];
        assert.deepEqual(seqA, seqB);
    });
});

/**
 * @param {{ x: number, y: number, z: number }} a
 * @param {{ x: number, y: number, z: number }} b
 */
function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
