const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
    SCHEMA_VERSION,
    MAX_NODES_RUNTIME,
    validateGraphSnapshot,
    getGraphStats,
    getNodeDegree,
    getNeighborhood1Hop
} = require('../js/kg-graph-core.js');

const FIXTURE_PATH = path.join(__dirname, 'fixtures/graphsphere/minimal-valid.json');

/** @returns {Record<string, unknown>} */
function loadMinimalFixture() {
    return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

/** @param {Record<string, unknown>} base */
function cloneSnapshot(base) {
    return JSON.parse(JSON.stringify(base));
}

test('L0：结构校验', async (t) => {
    await t.test('minimal fixture 通过校验并返回 NormalizedGraph', () => {
        const raw = loadMinimalFixture();
        const result = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(result.status, 'ok');
        assert.equal(result.issues.length, 0);
        assert.ok(result.graph);
        assert.equal(result.graph.schemaVersion, SCHEMA_VERSION);
        assert.equal(result.graph.meta.id, 'scenario-b-ai-stack');
        assert.equal(result.graph.nodes.length, 3);
        assert.equal(result.graph.nodeById.size, 3);
    });

    await t.test('schemaVersion 不匹配 → E_SCHEMA', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.schemaVersion = '0.9.0';
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_SCHEMA' && i.path === '$.schemaVersion'));
    });

    await t.test('禁止持久化布局字段 → E_SCHEMA', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes[0].x = 1;
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_SCHEMA' && i.message.includes('Forbidden')));
    });

    await t.test('未知顶层字段 → E_SCHEMA', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.unknownField = true;
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.path === '$.unknownField'));
    });

    await t.test('meta 未知字段 → E_SCHEMA', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.meta.defaultScene = true;
        const result = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_SCHEMA' && i.path === '$.meta.defaultScene'));
    });

    await t.test('node.type 未在 schema 声明 → E_SCHEMA', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes[1].type = 'unknown_type';
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_SCHEMA' && i.path.includes('.type')));
    });
});

test('L1：引用完整性', async (t) => {
    await t.test('重复 node id → E_GRAPH_REF', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes.push({ ...raw.nodes[1], id: 'rag-pipeline' });
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_GRAPH_REF'));
    });

    await t.test('悬空边端点 → E_GRAPH_REF', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.edges.push({
            id: 'e-dangling',
            source: 'missing-node',
            target: 'rag-pipeline',
            type: 'contains'
        });
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_GRAPH_REF' && i.path.includes('source')));
    });

    await t.test('自环边 → E_GRAPH_REF', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.edges.push({
            id: 'e-self',
            source: 'rag-pipeline',
            target: 'rag-pipeline',
            type: 'contains'
        });
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_GRAPH_REF' && i.message.includes('self-loop')));
    });

    await t.test('重复边 (source,target,type) → E_GRAPH_REF', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.edges.push({
            id: 'e-dup',
            source: 'ai-landscape',
            target: 'rag-pipeline',
            type: 'contains'
        });
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_GRAPH_REF' && i.message.includes('duplicate edge')));
    });
});

test('L2-P0：图统计与 Demo 引用', async (t) => {
    await t.test('预置包节点数 >150 → E_RKG_STATS', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        const extra = [];
        for (let i = 0; i < 151; i += 1) {
            extra.push({
                id: `extra-node-${i}`,
                label: `Extra ${i}`,
                type: 'module'
            });
        }
        raw.nodes.push(...extra);
        for (let i = 0; i < extra.length; i += 1) {
            raw.edges.push({
                id: `e-extra-${i}`,
                source: 'ai-landscape',
                target: extra[i].id,
                type: 'contains'
            });
        }
        const preset = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(preset.status, 'error');
        assert.ok(preset.issues.some((i) => i.code === 'E_RKG_STATS' && i.message.includes('150')));

        const runtime = validateGraphSnapshot(raw, { presetPackage: false });
        assert.equal(runtime.status, 'ok');
    });

    await t.test('运行时节点数 >200 → E_RKG_STATS', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        const extra = [];
        for (let i = 0; i < MAX_NODES_RUNTIME - 2; i += 1) {
            extra.push({
                id: `bulk-node-${i}`,
                label: `Bulk ${i}`,
                type: 'module'
            });
        }
        raw.nodes.push(...extra);
        for (const node of extra) {
            raw.edges.push({
                id: `e-${node.id}`,
                source: 'ai-landscape',
                target: node.id,
                type: 'contains'
            });
        }
        const result = validateGraphSnapshot(raw);
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_RKG_STATS' && i.message.includes('200')));
    });

    await t.test('孤立节点占比 >5% → E_RKG_STATS', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes.push(
            { id: 'lonely-a', label: 'Lonely A', type: 'module' },
            { id: 'lonely-b', label: 'Lonely B', type: 'module' }
        );
        const result = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_RKG_STATS' && i.message.includes('isolated')));
    });

    await t.test('主连通分量 <90% → E_RKG_STATS', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes.push(
            { id: 'island-root', label: 'Island', type: 'product', summary: 'disconnected' },
            { id: 'island-child', label: 'Child', type: 'module' }
        );
        raw.edges.push({
            id: 'e-island',
            source: 'island-root',
            target: 'island-child',
            type: 'contains'
        });
        const result = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_RKG_STATS' && i.message.includes('connected component')));
    });

    await t.test('demo.tourNodeIds 引用缺失 → E_DEMO_REF', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.demo.tourNodeIds = ['ai-landscape', 'missing-anchor', 'rag-pipeline'];
        const result = validateGraphSnapshot(raw, { presetPackage: true });
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_DEMO_REF'));
    });
});

test('邻域查询与图统计 API', async (t) => {
    await t.test('getNeighborhood1Hop 返回 1 跳节点与边', () => {
        const { graph } = validateGraphSnapshot(loadMinimalFixture(), { presetPackage: true });
        assert.ok(graph);

        const center = getNeighborhood1Hop(graph, 'rag-pipeline');
        assert.deepEqual(new Set(center.nodeIds), new Set(['rag-pipeline', 'ai-landscape', 'llm-core']));
        assert.deepEqual(new Set(center.edgeIds), new Set(['e-ai-rag', 'e-rag-llm']));
    });

    await t.test('未知节点邻域为空', () => {
        const { graph } = validateGraphSnapshot(loadMinimalFixture(), { presetPackage: true });
        assert.ok(graph);
        const empty = getNeighborhood1Hop(graph, 'not-exists');
        assert.deepEqual(empty, { nodeIds: [], edgeIds: [] });
    });

    await t.test('getNodeDegree 与 getGraphStats', () => {
        const { graph } = validateGraphSnapshot(loadMinimalFixture(), { presetPackage: true });
        assert.ok(graph);
        assert.equal(getNodeDegree(graph, 'rag-pipeline'), 2);
        assert.equal(getNodeDegree(graph, 'ai-landscape'), 1);

        const stats = getGraphStats(graph);
        assert.equal(stats.nodeCount, 3);
        assert.equal(stats.isolatedCount, 0);
        assert.equal(stats.mainComponentRatio, 1);
        assert.equal(stats.componentCount, 1);
    });
});

test('P1：敏感内容扫描（可选）', async (t) => {
    await t.test('label 含 sk-* → E_RKG_STATS', () => {
        const raw = cloneSnapshot(loadMinimalFixture());
        raw.nodes[1].label = 'key sk-abcdefghijklmnopqrstuvwxyz';
        const result = validateGraphSnapshot(raw, { scanSensitive: true, presetPackage: true });
        assert.equal(result.status, 'error');
        assert.ok(result.issues.some((i) => i.code === 'E_RKG_STATS'));
    });
});

test('场景 Fixture 集成（L0–L2-P0）', async (t) => {
    const FIXTURE_DIR = path.join(__dirname, 'fixtures/graphsphere');
    const cases = [
        { file: 'scenario-a-chrome-bridge.json', preset: true, minNodes: 40 },
        { file: 'scenario-b-ai-stack.json', preset: true, minNodes: 40 },
        { file: 'scenario-a-chrome-bridge-draft.json', preset: true, minNodes: 40 },
        { file: 'scenario-b-ai-stack-draft.json', preset: true, minNodes: 40 }
    ];

    for (const { file, preset, minNodes } of cases) {
        await t.test(`${file} 通过校验`, () => {
            const raw = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
            const result = validateGraphSnapshot(raw, { presetPackage: preset });
            assert.equal(result.status, 'ok', result.issues.map((i) => i.message).join('; '));
            assert.ok(result.graph);
            assert.ok(result.graph.nodes.length >= minNodes);
            assert.ok(result.graph.adjacency instanceof Map);
            assert.equal(getGraphStats(result.graph).mainComponentRatio, 1);
        });
    }
});
