const test = require('node:test');
const assert = require('node:assert/strict');

const { createTetrisGameCore, getPieceCells } = require('../js/tetris-game.js');
const {
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
} = require('../js/tetris-3d-voxel-mapper.js');
const { TETRIS_EFFECT_TIER_PRESETS } = require('../js/tetris-effect-tiers.js');

function emptyBoard(rows, cols) {
    const b = [];
    for (let y = 0; y < rows; y += 1) {
        b.push(new Array(cols).fill(0));
    }
    return b;
}

function makeState(overrides) {
    return Object.assign(
        {
            cols: 10,
            rows: 20,
            board: emptyBoard(20, 10),
            current: null,
            score: 0,
            lines: 0,
            level: 0,
            gameOver: false
        },
        overrides || {}
    );
}

test('Voxel Mapper：常量与预算', async t => {
    await t.test('getMaxInstanceCount = cols*rows + 4', () => {
        assert.equal(getMaxInstanceCount(10, 20), 204);
        assert.equal(MAX_ACTIVE_CELLS, 4);
    });

    await t.test('默认 10×20 场景不超过 effect tier 低端实例上限', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        const scene = mapSnapshotToVoxelScene(game.getState());
        const lowCap = TETRIS_EFFECT_TIER_PRESETS.low.maxDrawableInstances;
        assert.ok(isWithinInstanceBudget(scene, lowCap));
        assert.ok(countSceneInstances(scene) <= getMaxInstanceCount(10, 20));
    });
});

test('Voxel Mapper：gridToWorldPosition（2.5D 单层，Y 轴翻转）', async t => {
    await t.test('左下角格 (0, rows-1) → 世界原点侧 cell center', () => {
        const rows = 20;
        const bottomLeft = gridToWorldPosition(0, rows - 1, rows);
        assert.equal(bottomLeft.x, 0.5);
        assert.equal(bottomLeft.y, 0.5);
        assert.equal(bottomLeft.z, 0.5);
    });

    await t.test('顶行 gy=0 → 世界 Y 最高', () => {
        const rows = 20;
        const top = gridToWorldPosition(5, 0, rows);
        assert.equal(top.y, 19.5);
        assert.equal(top.x, 5.5);
    });

    await t.test('gy 与内核 board[y][x] 索引一一对应，无 Z 轴玩法偏移', () => {
        const rows = 20;
        const a = gridToWorldPosition(3, 7, rows);
        const b = gridToWorldPosition(3, 7, rows);
        assert.deepEqual(a, b);
        assert.equal(a.z, b.z);
        assert.equal(VOXEL_SIZE, 1);
        assert.deepEqual(BOARD_ORIGIN, { x: 0, y: 0, z: 0 });
    });
});

test('Voxel Mapper：mapSnapshotToVoxelScene 结构契约', async t => {
    await t.test('空盘面 + 当前块 → playing，分池输出', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        const state = game.getState();
        const scene = mapSnapshotToVoxelScene(state);

        assert.equal(scene.cols, 10);
        assert.equal(scene.rows, 20);
        assert.equal(scene.phase, 'playing');
        assert.equal(scene.voxels.length, 0);
        assert.ok(scene.activePieceVoxels.length >= 1);
        assert.ok(scene.activePieceVoxels.length <= MAX_ACTIVE_CELLS);
        assert.ok(Object.isFrozen(scene));
        assert.ok(Object.isFrozen(scene.voxels));
        assert.ok(Object.isFrozen(scene.activePieceVoxels));
    });

    await t.test('gameOver → phase=game_over', () => {
        const scene = mapSnapshotToVoxelScene(makeState({ gameOver: true }));
        assert.equal(scene.phase, 'game_over');
    });

    await t.test('缺少 state 抛出 TypeError', () => {
        assert.throws(() => mapSnapshotToVoxelScene(null), TypeError);
    });
});

test('Voxel Mapper：锁定格映射', async t => {
    await t.test('board 非零格全部映射为 locked，gy 与行索引一致', () => {
        const board = emptyBoard(20, 10);
        board[18][2] = 3;
        board[18][3] = 3;
        board[19][5] = 7;

        const locked = mapLockedBoardVoxels(makeState({ board }));
        assert.equal(locked.length, 3);
        assert.ok(locked.every(v => v.kind === 'locked'));
        assert.deepEqual(
            locked.map(v => [v.gx, v.gy, v.colorIndex]).sort((a, b) => a[1] - b[1] || a[0] - b[0]),
            [
                [2, 18, 3],
                [3, 18, 3],
                [5, 19, 7]
            ]
        );
    });

    await t.test('满行 10×20 盘面 → 200 个 locked 体素', () => {
        const board = emptyBoard(20, 10);
        for (let y = 0; y < 20; y += 1) {
            for (let x = 0; x < 10; x += 1) {
                board[y][x] = 1;
            }
        }
        const scene = mapSnapshotToVoxelScene(makeState({ board, current: null }));
        assert.equal(scene.voxels.length, 200);
        assert.equal(scene.activePieceVoxels.length, 0);
        assert.equal(countSceneInstances(scene), 200);
    });
});

test('Voxel Mapper：活动骨牌映射', async t => {
    await t.test('T 型 rotation=0 @ (3,0) 产生 4 个 active 体素', () => {
        const state = makeState({
            current: { type: 'T', rotation: 0, x: 3, y: 0 }
        });
        const active = mapActivePieceVoxels(state);
        assert.equal(active.length, 4);
        assert.ok(active.every(v => v.kind === 'active'));
        assert.ok(active.every(v => v.colorIndex === PIECE_TYPE_TO_INDEX.T));

        const cells = getPieceCells('T', 0, 3, 0);
        assert.deepEqual(
            active.map(v => ({ x: v.gx, y: v.gy })).sort((a, b) => a.y - b.y || a.x - b.x),
            cells.sort((a, b) => a.y - b.y || a.x - b.x)
        );
    });

    await t.test('部分格 y<0（顶线以上）不输出', () => {
        const state = makeState({
            current: { type: 'I', rotation: 1, x: 3, y: -2 }
        });
        const active = mapActivePieceVoxels(state);
        assert.ok(active.every(v => v.gy >= 0));
        assert.equal(active.length, 2);
    });

    await t.test('active 与 locked 分池，不重复计入 voxels', () => {
        const board = emptyBoard(20, 10);
        board[10][4] = 2;
        const state = makeState({
            board,
            current: { type: 'O', rotation: 0, x: 3, y: 8 }
        });
        const scene = mapSnapshotToVoxelScene(state);
        assert.equal(scene.voxels.length, 1);
        assert.equal(scene.activePieceVoxels.length, 4);
        assert.ok(scene.voxels.every(v => v.kind === 'locked'));
        assert.ok(scene.activePieceVoxels.every(v => v.kind === 'active'));
    });
});

test('Voxel Mapper：与内核集成（端到端快照）', async t => {
    await t.test('reset 后快照可映射且实例数 ≤ cols*rows+4', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        const scene = mapSnapshotToVoxelScene(game.getState());
        assert.ok(countSceneInstances(scene) <= getMaxInstanceCount(10, 20));
    });

    await t.test('hardDrop 锁定后 active 体素写入 locked 池并生成新块', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.__setNextTypesForTest(['T', 'T', 'T']);
        game.reset();
        game.__setBoardForTest(emptyBoard(20, 10));
        game.__setCurrentForTest({ type: 'O', rotation: 0, x: 3, y: 15 });

        const before = mapSnapshotToVoxelScene(game.getState());
        assert.equal(before.voxels.length, 0);
        assert.equal(before.activePieceVoxels.length, 4);

        game.hardDrop();
        const state = game.getState();
        const after = mapSnapshotToVoxelScene(state);

        assert.equal(after.voxels.length, 4);
        assert.equal(after.activePieceVoxels.length, 4);
        assert.equal(after.phase, 'playing');
        assert.equal(state.score, 0);
    });

    await t.test('TC-B-01 顶线临界：spawn 失败 gameOver 时仍可映射', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.__setNextTypesForTest(['O', 'O']);
        game.reset();
        const rows = emptyBoard(20, 10);
        for (let x = 0; x < 10; x += 1) {
            rows[0][x] = 1;
            rows[1][x] = 1;
        }
        game.__setBoardForTest(rows);
        game.__setCurrentForTest(null);
        const after = game.__callTrySpawnForTest();
        const scene = mapSnapshotToVoxelScene(after);

        assert.equal(after.gameOver, true);
        assert.equal(scene.phase, 'game_over');
        assert.equal(scene.activePieceVoxels.length, 0);
        assert.equal(scene.voxels.length, 20);
    });
});

test('Voxel Mapper：世界坐标与网格一致性', async t => {
    await t.test('每个 active 体素的 world Y 随 gy 减小而升高', () => {
        const state = makeState({
            current: { type: 'O', rotation: 0, x: 3, y: 10 }
        });
        const scene = mapSnapshotToVoxelScene(state);
        const worlds = scene.activePieceVoxels.map(v =>
            gridToWorldPosition(v.gx, v.gy, state.rows)
        );
        const minGy = Math.min(...scene.activePieceVoxels.map(v => v.gy));
        const maxGy = Math.max(...scene.activePieceVoxels.map(v => v.gy));
        const worldAtMinGy = worlds.find((_, i) => scene.activePieceVoxels[i].gy === minGy);
        const worldAtMaxGy = worlds.find((_, i) => scene.activePieceVoxels[i].gy === maxGy);
        assert.ok(worldAtMinGy.y > worldAtMaxGy.y);
    });
});
