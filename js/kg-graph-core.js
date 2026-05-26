(function attachKgGraphCore(global) {
    'use strict';

    /** @typedef {'ok'|'error'} ValidateStatus */
    /** @typedef {{ code: string, message: string, path?: string }} ValidateIssue */

    const SCHEMA_VERSION = '1.0.0';
    const MAX_NODES_RUNTIME = 200;
    const MAX_NODES_PRESET = 150;
    const MAX_EDGES = 800;
    const MAX_ISOLATED_RATIO = 0.05;
    const MIN_MAIN_COMPONENT_RATIO = 0.9;

    const TOP_LEVEL_KEYS = new Set(['schemaVersion', 'meta', 'schema', 'nodes', 'edges', 'demo']);
    const META_KEYS = new Set(['id', 'title', 'description', 'locale', 'layoutSeed', 'author', 'updatedAt', 'tags']);
    const TYPE_SCHEMA_KEYS = new Set(['nodeTypes', 'edgeTypes']);
    const NODE_TYPE_KEYS = new Set(['id', 'label', 'color', 'icon']);
    const EDGE_TYPE_KEYS = new Set(['id', 'label', 'color', 'directed']);
    const NODE_KEYS = new Set(['id', 'label', 'type', 'summary', 'weight', 'pinned', 'attrs']);
    const EDGE_KEYS = new Set(['id', 'source', 'target', 'type', 'label', 'weight']);
    const DEMO_KEYS = new Set(['defaultScene', 'tourNodeIds', 'hubNodeIds', 'camera']);
    const CAMERA_KEYS = new Set(['initialDistance', 'autoOrbitSpeed']);
    const FORBIDDEN_PERSISTED_KEYS = new Set([
        'x', 'y', 'z', 'position', 'layout', 'coordinates', 'vx', 'vy', 'vz', 'fz'
    ]);

    const PATTERNS = {
        metaId: /^[a-z][a-z0-9-]{2,63}$/,
        nodeId: /^[a-z][a-z0-9-]{1,63}$/,
        edgeId: /^[a-z][a-z0-9-]{1,80}$/,
        typeId: /^[a-z][a-z0-9_]{1,31}$/,
        hexColor: /^#[0-9A-Fa-f]{6}$/,
        isoDate: /^\d{4}-\d{2}-\d{2}$/
    };

    const SENSITIVE_PATTERNS = [
        { re: /\bsk-[A-Za-z0-9]{8,}\b/, label: 'API Key (sk-*)' },
        { re: /\bapi[_-]?key\s*[:=]\s*\S+/i, label: 'api_key assignment' },
        { re: /^(\/|[A-Za-z]:\\)/, label: 'absolute path' },
        { re: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/, label: 'internal IP' }
    ];

    /**
     * @param {string} code
     * @param {string} message
     * @param {string} [path]
     * @returns {ValidateIssue}
     */
    function issue(code, message, path) {
        const item = { code, message };
        if (path) item.path = path;
        return item;
    }

    /**
     * @param {unknown} value
     * @returns {value is Record<string, unknown>}
     */
    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    /**
     * @param {string} text
     * @returns {ValidateIssue[]}
     */
    function scanSensitiveText(text) {
        if (typeof text !== 'string' || !text) return [];
        const hits = [];
        for (const { re, label } of SENSITIVE_PATTERNS) {
            if (re.test(text)) {
                hits.push(issue('E_RKG_STATS', `Sensitive content detected (${label})`, undefined));
                break;
            }
        }
        return hits;
    }

    /**
     * @param {unknown} obj
     * @param {string} basePath
     * @param {ValidateIssue[]} issues
     */
    function rejectForbiddenLayoutKeys(obj, basePath, issues) {
        if (!isPlainObject(obj)) return;
        for (const key of Object.keys(obj)) {
            if (FORBIDDEN_PERSISTED_KEYS.has(key)) {
                issues.push(issue('E_SCHEMA', `Forbidden persisted layout field "${key}"`, `${basePath}.${key}`));
            }
        }
    }

    /**
     * @param {unknown} obj
     * @param {Set<string>} allowedKeys
     * @param {string} basePath
     * @param {ValidateIssue[]} issues
     */
    function rejectUnknownKeys(obj, allowedKeys, basePath, issues) {
        if (!isPlainObject(obj)) return;
        for (const key of Object.keys(obj)) {
            if (!allowedKeys.has(key)) {
                issues.push(issue('E_SCHEMA', `Unknown field "${key}"`, `${basePath}.${key}`));
            }
        }
    }

    /**
     * @param {unknown} raw
     * @param {{ presetPackage?: boolean, scanSensitive?: boolean }} [options]
     * @returns {{ status: ValidateStatus, issues: ValidateIssue[], graph?: import('./kg-graph-core').NormalizedGraph }}
     */
    function validateGraphSnapshot(raw, options) {
        const opts = options || {};
        const issues = [];

        if (!isPlainObject(raw)) {
            return { status: 'error', issues: [issue('E_SCHEMA', 'GraphSnapshot must be a JSON object')] };
        }

        rejectForbiddenLayoutKeys(raw, '$', issues);
        for (const key of Object.keys(raw)) {
            if (!TOP_LEVEL_KEYS.has(key)) {
                issues.push(issue('E_SCHEMA', `Unknown top-level field "${key}"`, `$.${key}`));
            }
        }

        if (raw.schemaVersion !== SCHEMA_VERSION) {
            issues.push(issue('E_SCHEMA', `schemaVersion must be "${SCHEMA_VERSION}"`, '$.schemaVersion'));
        }

        validateMeta(raw.meta, issues);
        const typeSchema = validateTypeSchema(raw.schema, issues);
        const nodes = validateNodes(raw.nodes, typeSchema.nodeTypeIds, issues);
        validateEdges(raw.edges, nodes.idSet, typeSchema.edgeTypeIds, issues);

        if (raw.demo !== undefined) {
            validateDemo(raw.demo, nodes.idSet, issues);
        }

        if (opts.scanSensitive) {
            for (const node of nodes.list) {
                issues.push(...scanSensitiveText(node.label).map((i) => ({ ...i, path: `$.nodes[id=${node.id}].label` })));
                if (node.summary) {
                    issues.push(...scanSensitiveText(node.summary).map((i) => ({ ...i, path: `$.nodes[id=${node.id}].summary` })));
                }
                if (node.attrs) {
                    for (const [k, v] of Object.entries(node.attrs)) {
                        if (typeof v === 'string') {
                            issues.push(...scanSensitiveText(v).map((i) => ({ ...i, path: `$.nodes[id=${node.id}].attrs.${k}` })));
                        }
                    }
                }
            }
        }

        if (issues.some((i) => i.code === 'E_SCHEMA' || i.code === 'E_GRAPH_REF' || i.code === 'E_DEMO_REF')) {
            return { status: 'error', issues };
        }

        validateL2Stats(nodes.list, raw.edges, raw.demo, opts, issues);

        if (issues.length > 0) {
            return { status: 'error', issues };
        }

        return {
            status: 'ok',
            issues: [],
            graph: normalizeGraph(raw, nodes.list)
        };
    }

    /**
     * @param {unknown} meta
     * @param {ValidateIssue[]} issues
     */
    function validateMeta(meta, issues) {
        if (!isPlainObject(meta)) {
            issues.push(issue('E_SCHEMA', 'meta is required and must be an object', '$.meta'));
            return;
        }
        rejectForbiddenLayoutKeys(meta, '$.meta', issues);
        rejectUnknownKeys(meta, META_KEYS, '$.meta', issues);

        if (typeof meta.id !== 'string' || !PATTERNS.metaId.test(meta.id)) {
            issues.push(issue('E_SCHEMA', 'meta.id must match kebab-case pattern', '$.meta.id'));
        }
        if (typeof meta.title !== 'string' || meta.title.length < 1 || meta.title.length > 80) {
            issues.push(issue('E_SCHEMA', 'meta.title must be 1-80 characters', '$.meta.title'));
        }
        if (meta.description !== undefined && (typeof meta.description !== 'string' || meta.description.length > 240)) {
            issues.push(issue('E_SCHEMA', 'meta.description max 240 characters', '$.meta.description'));
        }
        if (meta.locale !== undefined && meta.locale !== 'zh-CN' && meta.locale !== 'en-US') {
            issues.push(issue('E_SCHEMA', 'meta.locale must be zh-CN or en-US', '$.meta.locale'));
        }
        if (typeof meta.layoutSeed !== 'number' || !Number.isInteger(meta.layoutSeed) || meta.layoutSeed < 0 || meta.layoutSeed > 2147483647) {
            issues.push(issue('E_SCHEMA', 'meta.layoutSeed must be integer 0..2147483647', '$.meta.layoutSeed'));
        }
        if (meta.updatedAt !== undefined && (typeof meta.updatedAt !== 'string' || !PATTERNS.isoDate.test(meta.updatedAt))) {
            issues.push(issue('E_SCHEMA', 'meta.updatedAt must be YYYY-MM-DD', '$.meta.updatedAt'));
        }
    }

    /**
     * @param {unknown} schema
     * @param {ValidateIssue[]} issues
     */
    function validateTypeSchema(schema, issues) {
        const nodeTypeIds = new Set();
        const edgeTypeIds = new Set();

        if (!isPlainObject(schema)) {
            issues.push(issue('E_SCHEMA', 'schema is required and must be an object', '$.schema'));
            return { nodeTypeIds, edgeTypeIds };
        }
        rejectUnknownKeys(schema, TYPE_SCHEMA_KEYS, '$.schema', issues);

        if (!Array.isArray(schema.nodeTypes) || schema.nodeTypes.length < 1) {
            issues.push(issue('E_SCHEMA', 'schema.nodeTypes must be a non-empty array', '$.schema.nodeTypes'));
        } else {
            schema.nodeTypes.forEach((nt, idx) => {
                const path = `$.schema.nodeTypes[${idx}]`;
                if (!isPlainObject(nt)) {
                    issues.push(issue('E_SCHEMA', 'nodeType must be object', path));
                    return;
                }
                rejectUnknownKeys(nt, NODE_TYPE_KEYS, path, issues);
                if (typeof nt.id !== 'string' || !PATTERNS.typeId.test(nt.id)) {
                    issues.push(issue('E_SCHEMA', 'nodeType.id invalid', `${path}.id`));
                } else if (nodeTypeIds.has(nt.id)) {
                    issues.push(issue('E_SCHEMA', `duplicate nodeType id "${nt.id}"`, `${path}.id`));
                } else {
                    nodeTypeIds.add(nt.id);
                }
                if (typeof nt.label !== 'string' || nt.label.length < 1 || nt.label.length > 40) {
                    issues.push(issue('E_SCHEMA', 'nodeType.label must be 1-40 chars', `${path}.label`));
                }
                if (typeof nt.color !== 'string' || !PATTERNS.hexColor.test(nt.color)) {
                    issues.push(issue('E_SCHEMA', 'nodeType.color must be #RRGGBB', `${path}.color`));
                }
            });
        }

        if (!Array.isArray(schema.edgeTypes) || schema.edgeTypes.length < 1) {
            issues.push(issue('E_SCHEMA', 'schema.edgeTypes must be a non-empty array', '$.schema.edgeTypes'));
        } else {
            schema.edgeTypes.forEach((et, idx) => {
                const path = `$.schema.edgeTypes[${idx}]`;
                if (!isPlainObject(et)) {
                    issues.push(issue('E_SCHEMA', 'edgeType must be object', path));
                    return;
                }
                rejectUnknownKeys(et, EDGE_TYPE_KEYS, path, issues);
                if (typeof et.id !== 'string' || !PATTERNS.typeId.test(et.id)) {
                    issues.push(issue('E_SCHEMA', 'edgeType.id invalid', `${path}.id`));
                } else if (edgeTypeIds.has(et.id)) {
                    issues.push(issue('E_SCHEMA', `duplicate edgeType id "${et.id}"`, `${path}.id`));
                } else {
                    edgeTypeIds.add(et.id);
                }
                if (typeof et.label !== 'string' || et.label.length < 1 || et.label.length > 40) {
                    issues.push(issue('E_SCHEMA', 'edgeType.label must be 1-40 chars', `${path}.label`));
                }
                if (et.color !== undefined && (typeof et.color !== 'string' || !PATTERNS.hexColor.test(et.color))) {
                    issues.push(issue('E_SCHEMA', 'edgeType.color must be #RRGGBB', `${path}.color`));
                }
            });
        }

        return { nodeTypeIds, edgeTypeIds };
    }

    /**
     * @param {unknown} nodesRaw
     * @param {Set<string>} nodeTypeIds
     * @param {ValidateIssue[]} issues
     */
    function validateNodes(nodesRaw, nodeTypeIds, issues) {
        const list = [];
        const idSet = new Set();

        if (!Array.isArray(nodesRaw) || nodesRaw.length < 1) {
            issues.push(issue('E_SCHEMA', 'nodes must be a non-empty array', '$.nodes'));
            return { list, idSet };
        }

        nodesRaw.forEach((node, idx) => {
            const path = `$.nodes[${idx}]`;
            if (!isPlainObject(node)) {
                issues.push(issue('E_SCHEMA', 'node must be object', path));
                return;
            }
            rejectForbiddenLayoutKeys(node, path, issues);
            rejectUnknownKeys(node, NODE_KEYS, path, issues);

            if (typeof node.id !== 'string' || !PATTERNS.nodeId.test(node.id)) {
                issues.push(issue('E_SCHEMA', 'node.id invalid kebab-case', `${path}.id`));
            } else if (idSet.has(node.id)) {
                issues.push(issue('E_GRAPH_REF', `duplicate node id "${node.id}"`, `${path}.id`));
            } else {
                idSet.add(node.id);
            }

            if (typeof node.label !== 'string' || node.label.length < 1 || node.label.length > 80) {
                issues.push(issue('E_SCHEMA', 'node.label must be 1-80 chars', `${path}.label`));
            }
            if (typeof node.type !== 'string' || !PATTERNS.typeId.test(node.type)) {
                issues.push(issue('E_SCHEMA', 'node.type invalid', `${path}.type`));
            } else if (nodeTypeIds.size > 0 && !nodeTypeIds.has(node.type)) {
                issues.push(issue('E_SCHEMA', `node.type "${node.type}" not declared in schema.nodeTypes`, `${path}.type`));
            }
            if (node.summary !== undefined && (typeof node.summary !== 'string' || node.summary.length > 320)) {
                issues.push(issue('E_SCHEMA', 'node.summary max 320 chars', `${path}.summary`));
            }
            if (node.weight !== undefined && (typeof node.weight !== 'number' || node.weight < 0.1 || node.weight > 10)) {
                issues.push(issue('E_SCHEMA', 'node.weight must be 0.1..10', `${path}.weight`));
            }
            if (node.attrs !== undefined) {
                if (!isPlainObject(node.attrs)) {
                    issues.push(issue('E_SCHEMA', 'node.attrs must be an object', `${path}.attrs`));
                } else if (Object.keys(node.attrs).length > 8) {
                    issues.push(issue('E_SCHEMA', 'node.attrs max 8 properties', `${path}.attrs`));
                } else {
                    for (const [attrKey, attrVal] of Object.entries(node.attrs)) {
                        const attrPath = `${path}.attrs.${attrKey}`;
                        if (typeof attrVal === 'string' && attrVal.length > 128) {
                            issues.push(issue('E_SCHEMA', 'node.attrs string max 128 chars', attrPath));
                        } else if (typeof attrVal !== 'string' && typeof attrVal !== 'number' && typeof attrVal !== 'boolean') {
                            issues.push(issue('E_SCHEMA', 'node.attrs value must be string, number, or boolean', attrPath));
                        }
                    }
                }
            }

            list.push({
                id: node.id,
                label: node.label,
                type: node.type,
                summary: node.summary,
                weight: node.weight !== undefined ? node.weight : 1,
                pinned: node.pinned === true,
                attrs: node.attrs
            });
        });

        return { list, idSet };
    }

    /**
     * @param {unknown} edgesRaw
     * @param {Set<string>} nodeIds
     * @param {Set<string>} edgeTypeIds
     * @param {ValidateIssue[]} issues
     */
    function validateEdges(edgesRaw, nodeIds, edgeTypeIds, issues) {
        if (edgesRaw === undefined) return;
        if (!Array.isArray(edgesRaw)) {
            issues.push(issue('E_SCHEMA', 'edges must be an array', '$.edges'));
            return;
        }
        if (edgesRaw.length > MAX_EDGES) {
            issues.push(issue('E_RKG_STATS', `edges count ${edgesRaw.length} exceeds max ${MAX_EDGES}`, '$.edges'));
        }

        const edgeKeys = new Set();
        const edgeIds = new Set();

        edgesRaw.forEach((edge, idx) => {
            const path = `$.edges[${idx}]`;
            if (!isPlainObject(edge)) {
                issues.push(issue('E_SCHEMA', 'edge must be object', path));
                return;
            }
            rejectForbiddenLayoutKeys(edge, path, issues);
            rejectUnknownKeys(edge, EDGE_KEYS, path, issues);

            if (typeof edge.id !== 'string' || !PATTERNS.edgeId.test(edge.id)) {
                issues.push(issue('E_SCHEMA', 'edge.id invalid', `${path}.id`));
            } else if (edgeIds.has(edge.id)) {
                issues.push(issue('E_GRAPH_REF', `duplicate edge id "${edge.id}"`, `${path}.id`));
            } else {
                edgeIds.add(edge.id);
            }

            if (typeof edge.source !== 'string' || !PATTERNS.nodeId.test(edge.source)) {
                issues.push(issue('E_SCHEMA', 'edge.source invalid', `${path}.source`));
            } else if (nodeIds.size > 0 && !nodeIds.has(edge.source)) {
                issues.push(issue('E_GRAPH_REF', `edge source "${edge.source}" not found`, `${path}.source`));
            }

            if (typeof edge.target !== 'string' || !PATTERNS.nodeId.test(edge.target)) {
                issues.push(issue('E_SCHEMA', 'edge.target invalid', `${path}.target`));
            } else if (nodeIds.size > 0 && !nodeIds.has(edge.target)) {
                issues.push(issue('E_GRAPH_REF', `edge target "${edge.target}" not found`, `${path}.target`));
            }

            if (edge.source === edge.target) {
                issues.push(issue('E_GRAPH_REF', 'self-loop edge is not allowed', path));
            }

            if (typeof edge.type !== 'string' || !PATTERNS.typeId.test(edge.type)) {
                issues.push(issue('E_SCHEMA', 'edge.type invalid', `${path}.type`));
            } else if (edgeTypeIds.size > 0 && !edgeTypeIds.has(edge.type)) {
                issues.push(issue('E_SCHEMA', `edge.type "${edge.type}" not declared in schema.edgeTypes`, `${path}.type`));
            }

            const dedupeKey = `${edge.source}|${edge.target}|${edge.type}`;
            if (edgeKeys.has(dedupeKey)) {
                issues.push(issue('E_GRAPH_REF', `duplicate edge (${edge.source} → ${edge.target}, type=${edge.type})`, path));
            } else {
                edgeKeys.add(dedupeKey);
            }
        });
    }

    /**
     * @param {unknown} demo
     * @param {Set<string>} nodeIds
     * @param {ValidateIssue[]} issues
     */
    function validateDemo(demo, nodeIds, issues) {
        if (!isPlainObject(demo)) {
            issues.push(issue('E_SCHEMA', 'demo must be an object', '$.demo'));
            return;
        }
        rejectUnknownKeys(demo, DEMO_KEYS, '$.demo', issues);

        if (demo.camera !== undefined) {
            if (!isPlainObject(demo.camera)) {
                issues.push(issue('E_SCHEMA', 'demo.camera must be an object', '$.demo.camera'));
            } else {
                rejectUnknownKeys(demo.camera, CAMERA_KEYS, '$.demo.camera', issues);
            }
        }

        if (demo.tourNodeIds !== undefined) {
            if (!Array.isArray(demo.tourNodeIds) || demo.tourNodeIds.length < 3 || demo.tourNodeIds.length > 12) {
                issues.push(issue('E_SCHEMA', 'demo.tourNodeIds must contain 3-12 items', '$.demo.tourNodeIds'));
            } else {
                demo.tourNodeIds.forEach((id, idx) => {
                    if (typeof id !== 'string' || !PATTERNS.nodeId.test(id)) {
                        issues.push(issue('E_SCHEMA', 'demo.tourNodeIds item invalid', `$.demo.tourNodeIds[${idx}]`));
                    } else if (nodeIds.size > 0 && !nodeIds.has(id)) {
                        issues.push(issue('E_DEMO_REF', `demo.tourNodeIds references missing node "${id}"`, `$.demo.tourNodeIds[${idx}]`));
                    }
                });
            }
        }

        if (demo.hubNodeIds !== undefined) {
            if (!Array.isArray(demo.hubNodeIds) || demo.hubNodeIds.length > 8) {
                issues.push(issue('E_SCHEMA', 'demo.hubNodeIds max 8 items', '$.demo.hubNodeIds'));
            } else {
                demo.hubNodeIds.forEach((id, idx) => {
                    if (typeof id !== 'string' || !PATTERNS.nodeId.test(id)) {
                        issues.push(issue('E_SCHEMA', 'demo.hubNodeIds item invalid', `$.demo.hubNodeIds[${idx}]`));
                    } else if (nodeIds.size > 0 && !nodeIds.has(id)) {
                        issues.push(issue('E_DEMO_REF', `demo.hubNodeIds references missing node "${id}"`, `$.demo.hubNodeIds[${idx}]`));
                    }
                });
            }
        }
    }

    /**
     * @param {Array<{ id: string }>} nodes
     * @param {unknown} edgesRaw
     * @param {unknown} demo
     * @param {{ presetPackage?: boolean }} opts
     * @param {ValidateIssue[]} issues
     */
    function validateL2Stats(nodes, edgesRaw, demo, opts, issues) {
        const nodeCount = nodes.length;
        const maxNodes = opts.presetPackage ? MAX_NODES_PRESET : MAX_NODES_RUNTIME;

        if (nodeCount > maxNodes) {
            issues.push(issue(
                'E_RKG_STATS',
                `node count ${nodeCount} exceeds limit ${maxNodes}`,
                '$.nodes'
            ));
        }

        const stats = computeGraphStatsFromRaw(nodes, edgesRaw);
        if (stats.isolatedRatio > MAX_ISOLATED_RATIO) {
            issues.push(issue(
                'E_RKG_STATS',
                `isolated node ratio ${(stats.isolatedRatio * 100).toFixed(1)}% exceeds ${MAX_ISOLATED_RATIO * 100}%`,
                '$.nodes'
            ));
        }
        if (stats.mainComponentRatio < MIN_MAIN_COMPONENT_RATIO) {
            issues.push(issue(
                'E_RKG_STATS',
                `main connected component ${(stats.mainComponentRatio * 100).toFixed(1)}% below ${MIN_MAIN_COMPONENT_RATIO * 100}%`,
                '$.edges'
            ));
        }

        if (isPlainObject(demo) && demo.tourNodeIds !== undefined) {
            for (let i = 0; i < demo.tourNodeIds.length; i += 1) {
                const id = demo.tourNodeIds[i];
                if (typeof id === 'string' && !nodes.some((n) => n.id === id)) {
                    issues.push(issue('E_DEMO_REF', `demo.tourNodeIds missing node "${id}"`, `$.demo.tourNodeIds[${i}]`));
                }
            }
        }
    }

    /**
     * @param {Array<{ id: string }>} nodes
     * @param {unknown} edgesRaw
     */
    function computeGraphStatsFromRaw(nodes, edgesRaw) {
        const adjacency = buildAdjacency(nodes, edgesRaw);
        return computeGraphStats(nodes.map((n) => n.id), adjacency);
    }

    /**
     * @param {string[]} nodeIds
     * @param {Map<string, Set<string>>} adjacency
     */
    function computeGraphStats(nodeIds, adjacency) {
        let isolatedCount = 0;
        for (const id of nodeIds) {
            const neighbors = adjacency.get(id);
            if (!neighbors || neighbors.size === 0) isolatedCount += 1;
        }

        const visited = new Set();
        let largestComponent = 0;

        for (const startId of nodeIds) {
            if (visited.has(startId)) continue;
            const stack = [startId];
            let size = 0;
            while (stack.length > 0) {
                const current = stack.pop();
                if (visited.has(current)) continue;
                visited.add(current);
                size += 1;
                const neighbors = adjacency.get(current);
                if (neighbors) {
                    for (const next of neighbors) {
                        if (!visited.has(next)) stack.push(next);
                    }
                }
            }
            if (size > largestComponent) largestComponent = size;
        }

        const total = nodeIds.length || 1;
        return {
            nodeCount: total,
            isolatedCount,
            isolatedRatio: isolatedCount / total,
            mainComponentSize: largestComponent,
            mainComponentRatio: largestComponent / total,
            componentCount: countComponents(nodeIds, adjacency)
        };
    }

    /**
     * @param {string[]} nodeIds
     * @param {Map<string, Set<string>>} adjacency
     */
    function countComponents(nodeIds, adjacency) {
        const visited = new Set();
        let components = 0;
        for (const startId of nodeIds) {
            if (visited.has(startId)) continue;
            components += 1;
            const stack = [startId];
            while (stack.length > 0) {
                const current = stack.pop();
                if (visited.has(current)) continue;
                visited.add(current);
                const neighbors = adjacency.get(current);
                if (neighbors) {
                    for (const next of neighbors) {
                        if (!visited.has(next)) stack.push(next);
                    }
                }
            }
        }
        return components;
    }

    /**
     * @param {Array<{ id: string }>} nodes
     * @param {unknown} edgesRaw
     * @returns {Map<string, Set<string>>}
     */
    function buildAdjacency(nodes, edgesRaw) {
        /** @type {Map<string, Set<string>>} */
        const adjacency = new Map();
        for (const node of nodes) {
            adjacency.set(node.id, new Set());
        }
        if (!Array.isArray(edgesRaw)) return adjacency;

        for (const edge of edgesRaw) {
            if (!isPlainObject(edge)) continue;
            if (typeof edge.source !== 'string' || typeof edge.target !== 'string') continue;
            if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
            adjacency.get(edge.source).add(edge.target);
            adjacency.get(edge.target).add(edge.source);
        }
        return adjacency;
    }

    /**
     * @param {Record<string, unknown>} raw
     * @param {Array<{ id: string, label: string, type: string, summary?: string, weight: number, pinned: boolean, attrs?: Record<string, unknown> }>} nodes
     * @returns {import('./kg-graph-core').NormalizedGraph}
     */
    function normalizeGraph(raw, nodes) {
        /** @type {Map<string, import('./kg-graph-core').GraphNode>} */
        const nodeById = new Map();
        for (const node of nodes) {
            nodeById.set(node.id, Object.freeze({
                id: node.id,
                label: node.label,
                type: node.type,
                summary: node.summary,
                weight: node.weight,
                pinned: node.pinned,
                attrs: node.attrs ? Object.freeze({ ...node.attrs }) : undefined
            }));
        }

        const edges = (Array.isArray(raw.edges) ? raw.edges : []).map((edge) => Object.freeze({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            type: edge.type,
            label: edge.label,
            weight: edge.weight !== undefined ? edge.weight : 1
        }));

        const adjacency = buildAdjacency(nodes, raw.edges);

        return Object.freeze({
            schemaVersion: SCHEMA_VERSION,
            meta: Object.freeze({ .../** @type {Record<string, unknown>} */ (raw.meta) }),
            schema: Object.freeze({
                nodeTypes: Object.freeze((/** @type {{ nodeTypes: unknown[] }} */ (raw.schema)).nodeTypes.map((t) => Object.freeze({ ...t }))),
                edgeTypes: Object.freeze((/** @type {{ edgeTypes: unknown[] }} */ (raw.schema)).edgeTypes.map((t) => Object.freeze({ ...t })))
            }),
            nodes: Object.freeze(nodes.map((n) => nodeById.get(n.id))),
            edges: Object.freeze(edges),
            nodeById,
            adjacency: Object.freeze(adjacency),
            demo: raw.demo ? Object.freeze({ .../** @type {Record<string, unknown>} */ (raw.demo) }) : undefined
        });
    }

    /**
     * @param {import('./kg-graph-core').NormalizedGraph} graph
     * @returns {{ nodeCount: number, isolatedCount: number, isolatedRatio: number, mainComponentSize: number, mainComponentRatio: number, componentCount: number }}
     */
    function getGraphStats(graph) {
        const nodeIds = graph.nodes.map((n) => n.id);
        return computeGraphStats(nodeIds, graph.adjacency);
    }

    /**
     * @param {import('./kg-graph-core').NormalizedGraph} graph
     * @param {string} nodeId
     * @returns {number}
     */
    function getNodeDegree(graph, nodeId) {
        const neighbors = graph.adjacency.get(nodeId);
        return neighbors ? neighbors.size : 0;
    }

    /**
     * @param {import('./kg-graph-core').NormalizedGraph} graph
     * @param {string} nodeId
     * @returns {{ nodeIds: string[], edgeIds: string[] }}
     */
    function getNeighborhood1Hop(graph, nodeId) {
        if (!graph.nodeById.has(nodeId)) {
            return { nodeIds: [], edgeIds: [] };
        }

        /** @type {Set<string>} */
        const nodeIds = new Set([nodeId]);
        /** @type {string[]} */
        const edgeIds = [];

        for (const edge of graph.edges) {
            if (edge.source === nodeId || edge.target === nodeId) {
                edgeIds.push(edge.id);
                nodeIds.add(edge.source);
                nodeIds.add(edge.target);
            }
        }

        return {
            nodeIds: [...nodeIds],
            edgeIds
        };
    }

    const api = {
        SCHEMA_VERSION,
        MAX_NODES_RUNTIME,
        MAX_NODES_PRESET,
        MAX_EDGES,
        validateGraphSnapshot,
        getGraphStats,
        getNodeDegree,
        getNeighborhood1Hop
    };

    global.KgGraphCore = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
