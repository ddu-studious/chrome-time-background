(function attachTetris3DVoxelMapper(global) {
    'use strict';

    const tetrisRef =
        typeof require !== 'undefined'
            ? require('./tetris-game.js')
            : global.TetrisGame || {};

    const getPieceCells = tetrisRef.getPieceCells;

    /** 与 {@link tetris-game.js} 中 PIECE_INDEX 一致：种类字母 → 盘面索引 1–7 */
    const PIECE_TYPE_TO_INDEX = Object.freeze({
        I: 1,
        O: 2,
        T: 3,
        S: 4,
        Z: 5,
        J: 6,
        L: 7
    });

    /** 单格世界尺寸（1 格 = 1 unit，ADR §7.6） */
    const VOXEL_SIZE = 1;

    /** 棋盘左下角锚点（世界坐标） */
    const BOARD_ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });

    /** 活动骨牌最多占用格数 */
    const MAX_ACTIVE_CELLS = 4;

    /**
     * @param {number} cols
     * @param {number} rows
     * @returns {number}
     */
    function getMaxInstanceCount(cols, rows) {
        return cols * rows + MAX_ACTIVE_CELLS;
    }

    /**
     * 内核 gy（向下为正）→ 世界 Y（向上为正，左下角为原点）。
     *
     * @param {number} gx
     * @param {number} gy
     * @param {number} rows
     * @param {{ voxelSize?: number, origin?: { x: number, y: number, z: number }, center?: boolean }} [options]
     * @returns {{ x: number, y: number, z: number }}
     */
    function gridToWorldPosition(gx, gy, rows, options) {
        const opts = options || {};
        const size = opts.voxelSize ?? VOXEL_SIZE;
        const origin = opts.origin || BOARD_ORIGIN;
        const center = opts.center !== false;
        const half = center ? size * 0.5 : 0;

        return {
            x: origin.x + gx * size + half,
            y: origin.y + (rows - 1 - gy) * size + half,
            z: origin.z + half
        };
    }

    /**
     * @param {number} gx
     * @param {number} gy
     * @param {number} colorIndex
     * @param {'locked'|'active'} kind
     * @returns {Readonly<{ gx: number, gy: number, colorIndex: number, kind: 'locked'|'active' }>}
     */
    function makeVoxel(gx, gy, colorIndex, kind) {
        return Object.freeze({
            gx,
            gy,
            colorIndex,
            kind
        });
    }

    /**
     * @param {import('./tetris-game.js').TetrisCoreState} state
     * @returns {ReadonlyArray<ReturnType<typeof makeVoxel>>}
     */
    function mapLockedBoardVoxels(state) {
        const voxels = [];
        for (let gy = 0; gy < state.rows; gy += 1) {
            const row = state.board[gy];
            if (!row) continue;
            for (let gx = 0; gx < state.cols; gx += 1) {
                const colorIndex = row[gx];
                if (colorIndex) {
                    voxels.push(makeVoxel(gx, gy, colorIndex, 'locked'));
                }
            }
        }
        return Object.freeze(voxels);
    }

    /**
     * @param {import('./tetris-game.js').TetrisCoreState} state
     * @returns {ReadonlyArray<ReturnType<typeof makeVoxel>>}
     */
    function mapActivePieceVoxels(state) {
        const piece = state.current;
        if (!piece || typeof getPieceCells !== 'function') {
            return Object.freeze([]);
        }

        const colorIndex = PIECE_TYPE_TO_INDEX[piece.type];
        if (!colorIndex) {
            return Object.freeze([]);
        }

        const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
        const voxels = [];
        for (let i = 0; i < cells.length; i += 1) {
            const { x, y } = cells[i];
            if (y >= 0) {
                voxels.push(makeVoxel(x, y, colorIndex, 'active'));
            }
        }
        return Object.freeze(voxels);
    }

    /**
     * 将内核快照映射为渲染器无关的场景描述（世界坐标单位：1 格 = 1 unit）。
     *
     * @param {import('./tetris-game.js').TetrisCoreState} state
     * @param {Record<string, string>} [_palette] 预留：与 COLORS 对齐，MVP 仍输出 colorIndex
     * @returns {import('./tetris-3d-voxel-mapper.js').VoxelSceneDescriptor}
     */
    function mapSnapshotToVoxelScene(state, _palette) {
        if (!state || typeof state !== 'object') {
            throw new TypeError('mapSnapshotToVoxelScene: state is required');
        }

        const lockedVoxels = mapLockedBoardVoxels(state);
        const activePieceVoxels = mapActivePieceVoxels(state);

        return Object.freeze({
            cols: state.cols,
            rows: state.rows,
            voxels: lockedVoxels,
            activePieceVoxels,
            phase: state.gameOver ? 'game_over' : 'playing'
        });
    }

    /**
     * @param {{ voxels?: ReadonlyArray<{ kind: string }>, activePieceVoxels?: ReadonlyArray<{ kind: string }> }} scene
     * @returns {number}
     */
    function countSceneInstances(scene) {
        const locked = scene && scene.voxels ? scene.voxels.length : 0;
        const active =
            scene && scene.activePieceVoxels ? scene.activePieceVoxels.length : 0;
        return locked + active;
    }

    /**
     * @param {{ cols: number, rows: number, voxels: ReadonlyArray<unknown>, activePieceVoxels: ReadonlyArray<unknown> }} scene
     * @param {number} maxInstances
     * @returns {boolean}
     */
    function isWithinInstanceBudget(scene, maxInstances) {
        return countSceneInstances(scene) <= maxInstances;
    }

    const api = {
        VOXEL_SIZE,
        BOARD_ORIGIN,
        MAX_ACTIVE_CELLS,
        PIECE_TYPE_TO_INDEX,
        getMaxInstanceCount,
        gridToWorldPosition,
        mapSnapshotToVoxelScene,
        mapLockedBoardVoxels,
        mapActivePieceVoxels,
        countSceneInstances,
        isWithinInstanceBudget
    };

    global.Tetris3DVoxelMapper = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
