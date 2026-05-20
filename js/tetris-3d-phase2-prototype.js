(function attachTetris3DPhase2Prototype(global) {
    'use strict';

    const tetrisRef =
        typeof require !== 'undefined'
            ? require('./tetris-game.js')
            : global.TetrisGame || {};

    const getPieceCells = tetrisRef.getPieceCells;

    const PIECE_INDEX = Object.freeze({ I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 });

    /**
     * Phase 2 预研：4×4×N 立体井原型（非 MVP 运行时路径）。
     *
     * 坐标约定（OQ-P2-1 默认）：
     * - x: 列（0..cols-1）
     * - y: 行（0..rows-1，向下为正）
     * - z: 深度（0=近端玩家侧，+z 向井内）
     *
     * @param {{ cols?: number, rows?: number, depth?: number, randomFn?: () => number }} [options]
     */
    function createTetris3DWellPrototype(options) {
        const config = Object.assign({
            cols: 4,
            rows: 4,
            depth: 8,
            randomFn: Math.random
        }, options || {});

        const state = {
            cols: config.cols,
            rows: config.rows,
            depth: config.depth,
            /** @type {number[][][]} board[z][y][x] */
            board: [],
            current: null,
            score: 0,
            layersCleared: 0,
            gameOver: false
        };

        function emptyBoard() {
            const layers = [];
            for (let z = 0; z < state.depth; z += 1) {
                const plane = [];
                for (let y = 0; y < state.rows; y += 1) {
                    plane.push(new Array(state.cols).fill(0));
                }
                layers.push(plane);
            }
            return layers;
        }

        /**
         * @param {{ type: string, rotation: number, x: number, y: number, z: number }} piece
         * @returns {{ x: number, y: number, z: number }[]}
         */
        function getOccupiedCells3D(piece) {
            const cells2D = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
            return cells2D.map(c => ({ x: c.x, y: c.y, z: piece.z }));
        }

        function collides(piece) {
            if (!piece) return false;
            const cells = getOccupiedCells3D(piece);
            for (let i = 0; i < cells.length; i += 1) {
                const { x, y, z } = cells[i];
                if (x < 0 || x >= state.cols || y < 0 || y >= state.rows) return true;
                if (z < 0 || z >= state.depth) return true;
                if (state.board[z][y][x]) return true;
            }
            return false;
        }

        function getState() {
            return {
                cols: state.cols,
                rows: state.rows,
                depth: state.depth,
                board: state.board.map(layer => layer.map(row => row.slice())),
                current: state.current
                    ? Object.assign({}, state.current)
                    : null,
                score: state.score,
                layersCleared: state.layersCleared,
                gameOver: state.gameOver
            };
        }

        function reset() {
            state.board = emptyBoard();
            state.score = 0;
            state.layersCleared = 0;
            state.gameOver = false;
            state.current = {
                type: 'T',
                rotation: 0,
                x: 1,
                y: 0,
                z: 0
            };
            if (collides(state.current)) {
                state.gameOver = true;
                state.current = null;
            }
            return getState();
        }

        /**
         * @param {'x'|'y'|'z'} axis
         * @param {number} delta
         */
        function move(axis, delta) {
            if (state.gameOver || !state.current) return false;
            const next = Object.assign({}, state.current);
            next[axis] += delta;
            if (collides(next)) return false;
            state.current = next;
            return true;
        }

        function rotateCWInXY() {
            if (state.gameOver || !state.current) return false;
            const base = state.current;
            const nextRot = (base.rotation + 1) % 4;
            const offsets = [[0, 0], [-1, 0], [1, 0], [0, -1]];
            for (let i = 0; i < offsets.length; i += 1) {
                const [dx, dy] = offsets[i];
                const test = {
                    type: base.type,
                    rotation: nextRot,
                    x: base.x + dx,
                    y: base.y + dy,
                    z: base.z
                };
                if (!collides(test)) {
                    state.current = test;
                    return true;
                }
            }
            return false;
        }

        function lockPiece(piece) {
            const idx = PIECE_INDEX[piece.type];
            const cells = getOccupiedCells3D(piece);
            for (let i = 0; i < cells.length; i += 1) {
                const { x, y, z } = cells[i];
                if (
                    z >= 0 && z < state.depth
                    && y >= 0 && y < state.rows
                    && x >= 0 && x < state.cols
                ) {
                    state.board[z][y][x] = idx;
                }
            }
        }

        function isLayerFull(z) {
            const plane = state.board[z];
            for (let y = 0; y < state.rows; y += 1) {
                for (let x = 0; x < state.cols; x += 1) {
                    if (!plane[y][x]) return false;
                }
            }
            return true;
        }

        function clearFullLayers() {
            let cleared = 0;
            let z = 0;
            while (z < state.depth) {
                if (isLayerFull(z)) {
                    cleared += 1;
                    state.board.splice(z, 1);
                    const emptyPlane = [];
                    for (let y = 0; y < state.rows; y += 1) {
                        emptyPlane.push(new Array(state.cols).fill(0));
                    }
                    state.board.push(emptyPlane);
                } else {
                    z += 1;
                }
            }
            if (cleared > 0) {
                const points = [0, 200, 600, 1200, 2000];
                state.score += points[cleared] || cleared * 500;
                state.layersCleared += cleared;
            }
            return cleared;
        }

        function stepGravity() {
            if (state.gameOver || !state.current) return getState();
            const below = Object.assign({}, state.current, { y: state.current.y + 1 });
            if (collides(below)) {
                lockPiece(state.current);
                clearFullLayers();
                state.current = {
                    type: 'I',
                    rotation: 0,
                    x: 0,
                    y: 0,
                    z: 0
                };
                if (collides(state.current)) {
                    state.gameOver = true;
                    state.current = null;
                }
            } else {
                state.current = below;
            }
            return getState();
        }

        /** @param {number[][][]} layers */
        function __setBoardForTest(layers) {
            state.board = layers.map(layer => layer.map(row => row.slice()));
        }

        /** @param {{ type: string, rotation: number, x: number, y: number, z: number }} piece */
        function __setCurrentForTest(piece) {
            state.current = Object.assign({}, piece);
        }

        function __clearLayersForTest() {
            return clearFullLayers();
        }

        return {
            getState,
            reset,
            move,
            moveX: delta => move('x', delta),
            moveY: delta => move('y', delta),
            moveZ: delta => move('z', delta),
            rotateCWInXY,
            stepGravity,
            collides,
            getOccupiedCells3D,
            isLayerFull,
            __setBoardForTest,
            __setCurrentForTest,
            __clearLayersForTest
        };
    }

    /**
     * 供 PM/架构 Phase 2 Go/No-Go 量化参考（非精确工时）。
     *
     * @param {{ hasSrsDebt?: boolean, targetDepth?: number }} [inputs]
     * @returns {{ relativeComplexity: number, estimatedWeeks: [number, number], blockers: string[] }}
     */
    function estimatePhase2Complexity(inputs) {
        const opts = inputs || {};
        const depthFactor = Math.max(1, (opts.targetDepth || 16) / 8);
        const srsFactor = opts.hasSrsDebt === false ? 1 : 1.15;
        const base = 3.5 * depthFactor * srsFactor;
        const blockers = [];
        if (opts.hasSrsDebt !== false) {
            blockers.push('guideline SRS + lock delay not merged into Core');
        }
        blockers.push('multi-axis rotation UX undefined');
        blockers.push('90-day MVP retention KPI gate pending');
        return {
            relativeComplexity: Math.round(base * 10) / 10,
            estimatedWeeks: [Math.ceil(base * 2), Math.ceil(base * 3.5)],
            blockers
        };
    }

    const api = {
        PIECE_INDEX,
        createTetris3DWellPrototype,
        estimatePhase2Complexity
    };

    global.Tetris3DPhase2Prototype = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
