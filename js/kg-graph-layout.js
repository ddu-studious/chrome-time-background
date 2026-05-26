(function attachKgGraphLayout(global) {
    'use strict';

    const DEFAULT_ITERATIONS = 80;
    const DEFAULT_BOUNDS_RADIUS = 100;
    const IDEAL_EDGE_LENGTH = 36;
    const REPULSION_STRENGTH = 420;
    const ATTRACTION_STRENGTH = 0.045;
    const CENTER_GRAVITY = 0.012;
    const DAMPING = 0.85;
    const MIN_DISTANCE = 0.001;

    /**
     * Mulberry32 — deterministic PRNG for layout seed reproducibility.
     * @param {number} seed
     */
    function createRng(seed) {
        let state = seed >>> 0;
        return function next() {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * @param {number} index
     * @param {number} total
     * @param {number} radius
     */
    function goldenSpherePoint(index, total, radius) {
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const y = total <= 1 ? 0 : 1 - (index / (total - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = goldenAngle * index;
        return {
            x: radius * Math.cos(theta) * r,
            y: radius * y,
            z: radius * Math.sin(theta) * r
        };
    }

    /**
     * @param {import('./kg-graph-core').NormalizedGraph} graph
     * @param {{ seed?: number, iterations?: number, bounds?: { radius?: number } }} [options]
     * @returns {import('./kg-graph-layout').LayoutSnapshot}
     */
    function computeLayout(graph, options) {
        const opts = options || {};
        const seed = opts.seed !== undefined ? opts.seed : graph.meta.layoutSeed;
        const iterations = opts.iterations !== undefined ? opts.iterations : DEFAULT_ITERATIONS;
        const boundsRadius = (opts.bounds && opts.bounds.radius) || DEFAULT_BOUNDS_RADIUS;

        const rng = createRng(seed);
        const nodes = graph.nodes.map((node, index) => {
            const pinned = node.pinned === true;
            const init = pinned
                ? goldenSpherePoint(index, graph.nodes.length, boundsRadius * 0.55)
                : (() => {
                    const theta = rng() * Math.PI * 2;
                    const phi = Math.acos(2 * rng() - 1);
                    const r = boundsRadius * (0.35 + rng() * 0.45);
                    return {
                        x: r * Math.sin(phi) * Math.cos(theta),
                        y: r * Math.sin(phi) * Math.sin(theta),
                        z: r * Math.cos(phi)
                    };
                })();

            return {
                id: node.id,
                weight: node.weight || 1,
                pinned,
                x: init.x,
                y: init.y,
                z: init.z,
                vx: 0,
                vy: 0,
                vz: 0
            };
        });

        const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
        const edges = graph.edges.map((edge) => ({
            sourceId: edge.source,
            targetId: edge.target,
            type: edge.type,
            weight: edge.weight || 1,
            sourceIdx: nodeIndex.get(edge.source),
            targetIdx: nodeIndex.get(edge.target)
        })).filter((e) => e.sourceIdx !== undefined && e.targetIdx !== undefined);

        for (let iter = 0; iter < iterations; iter += 1) {
            applyForces(nodes, edges, boundsRadius);
            integrate(nodes);
        }

        return Object.freeze({
            sceneId: graph.meta.id,
            seed,
            iterationCount: iterations,
            nodes: Object.freeze(nodes.map((n) => Object.freeze({
                id: n.id,
                x: roundCoord(n.x),
                y: roundCoord(n.y),
                z: roundCoord(n.z)
            }))),
            edges: Object.freeze(graph.edges.map((e) => Object.freeze({
                sourceId: e.source,
                targetId: e.target,
                type: e.type
            })))
        });
    }

    /**
     * @param {Array<{ id: string, weight: number, pinned: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number }>} nodes
     * @param {Array<{ sourceIdx: number, targetIdx: number, weight: number }>} edges
     * @param {number} boundsRadius
     */
    function applyForces(nodes, edges, boundsRadius) {
        for (let i = 0; i < nodes.length; i += 1) {
            for (let j = i + 1; j < nodes.length; j += 1) {
                const a = nodes[i];
                const b = nodes[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let dz = b.z - a.z;
                let distSq = dx * dx + dy * dy + dz * dz;
                if (distSq < MIN_DISTANCE) distSq = MIN_DISTANCE;
                const dist = Math.sqrt(distSq);
                const repulse = (REPULSION_STRENGTH * (a.weight + b.weight)) / distSq;
                const fx = (dx / dist) * repulse;
                const fy = (dy / dist) * repulse;
                const fz = (dz / dist) * repulse;

                if (!a.pinned) {
                    a.vx -= fx;
                    a.vy -= fy;
                    a.vz -= fz;
                }
                if (!b.pinned) {
                    b.vx += fx;
                    b.vy += fy;
                    b.vz += fz;
                }
            }
        }

        for (const edge of edges) {
            const a = nodes[edge.sourceIdx];
            const b = nodes[edge.targetIdx];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let dz = b.z - a.z;
            let dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist < MIN_DISTANCE) dist = MIN_DISTANCE;

            const ideal = IDEAL_EDGE_LENGTH * edge.weight;
            const pull = (dist - ideal) * ATTRACTION_STRENGTH * edge.weight;
            const fx = (dx / dist) * pull;
            const fy = (dy / dist) * pull;
            const fz = (dz / dist) * pull;

            if (!a.pinned) {
                a.vx += fx;
                a.vy += fy;
                a.vz += fz;
            }
            if (!b.pinned) {
                b.vx -= fx;
                b.vy -= fy;
                b.vz -= fz;
            }
        }

        for (const node of nodes) {
            if (node.pinned) continue;
            node.vx -= node.x * CENTER_GRAVITY;
            node.vy -= node.y * CENTER_GRAVITY;
            node.vz -= node.z * CENTER_GRAVITY;

            const distFromOrigin = Math.sqrt(node.x * node.x + node.y * node.y + node.z * node.z);
            if (distFromOrigin > boundsRadius) {
                const scale = boundsRadius / distFromOrigin;
                node.x *= scale;
                node.y *= scale;
                node.z *= scale;
            }
        }
    }

    /**
     * @param {Array<{ pinned: boolean, x: number, y: number, z: number, vx: number, vy: number, vz: number }>} nodes
     */
    function integrate(nodes) {
        for (const node of nodes) {
            if (node.pinned) {
                node.vx = 0;
                node.vy = 0;
                node.vz = 0;
                continue;
            }
            node.vx *= DAMPING;
            node.vy *= DAMPING;
            node.vz *= DAMPING;
            node.x += node.vx;
            node.y += node.vy;
            node.z += node.vz;
        }
    }

    /** @param {number} value */
    function roundCoord(value) {
        return Math.round(value * 1000) / 1000;
    }

    const api = {
        DEFAULT_ITERATIONS,
        DEFAULT_BOUNDS_RADIUS,
        computeLayout,
        createRng
    };

    global.KgGraphLayout = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
