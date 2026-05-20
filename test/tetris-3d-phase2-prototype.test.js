const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createTetris3DWellPrototype,
    estimatePhase2Complexity
} = require('../js/tetris-3d-phase2-prototype.js');

function emptyLayer(rows, cols) {
    const layer = [];
    for (let y = 0; y < rows; y += 1) {
        layer.push(new Array(cols).fill(0));
    }
    return layer;
}

function filledLayer(rows, cols, value) {
    const layer = [];
    for (let y = 0; y < rows; y += 1) {
        layer.push(new Array(cols).fill(value));
    }
    return layer;
}

test('tetris-3d-phase2-prototype：初始化与 3D 碰撞', async t => {
    await t.test('reset 后井尺寸 4×4×8', () => {
        const well = createTetris3DWellPrototype({ depth: 8 });
        const s = well.reset();
        assert.equal(s.cols, 4);
        assert.equal(s.rows, 4);
        assert.equal(s.depth, 8);
        assert.equal(s.board.length, 8);
        assert.ok(s.current);
    });

    await t.test('moveZ 向井内移动，越界碰撞', () => {
        const well = createTetris3DWellPrototype({ depth: 4 });
        well.reset();
        well.__setCurrentForTest({ type: 'O', rotation: 0, x: 1, y: 0, z: 0 });
        assert.equal(well.moveZ(1), true);
        assert.equal(well.getState().current.z, 1);
        well.__setCurrentForTest({ type: 'O', rotation: 0, x: 1, y: 0, z: 3 });
        assert.equal(well.moveZ(1), false);
    });

    await t.test('顶面出界 y<0 碰撞', () => {
        const well = createTetris3DWellPrototype();
        well.reset();
        well.__setCurrentForTest({ type: 'O', rotation: 0, x: 1, y: 0, z: 0 });
        assert.equal(well.moveY(-1), false);
    });
});

test('tetris-3d-phase2-prototype：Z 层消除', async t => {
    await t.test('满层清除并计分', () => {
        const well = createTetris3DWellPrototype({ depth: 4 });
        well.reset();
        const layers = [
            filledLayer(4, 4, 1),
            emptyLayer(4, 4),
            emptyLayer(4, 4),
            emptyLayer(4, 4)
        ];
        well.__setBoardForTest(layers);
        const cleared = well.__clearLayersForTest();
        assert.equal(cleared, 1);
        const s = well.getState();
        assert.equal(s.layersCleared, 1);
        assert.equal(s.score, 200);
        assert.equal(s.board[0].every(row => row.every(c => c === 0)), true);
    });

    await t.test('双层同时满清除', () => {
        const well = createTetris3DWellPrototype({ depth: 4 });
        well.reset();
        well.__setBoardForTest([
            filledLayer(4, 4, 2),
            filledLayer(4, 4, 3),
            emptyLayer(4, 4),
            emptyLayer(4, 4)
        ]);
        const cleared = well.__clearLayersForTest();
        assert.equal(cleared, 2);
        assert.equal(well.getState().score, 600);
    });
});

test('tetris-3d-phase2-prototype：XY 旋转与重力步', async t => {
    await t.test('rotateCWInXY 在空井中成功', () => {
        const well = createTetris3DWellPrototype();
        well.reset();
        well.__setCurrentForTest({ type: 'T', rotation: 0, x: 1, y: 1, z: 0 });
        assert.equal(well.rotateCWInXY(), true);
        assert.equal(well.getState().current.rotation, 1);
    });

    await t.test('stepGravity 触底锁定并生成下一块', () => {
        const well = createTetris3DWellPrototype({ depth: 6 });
        well.reset();
        well.__setCurrentForTest({ type: 'O', rotation: 0, x: 1, y: 2, z: 1 });
        const after = well.stepGravity();
        assert.ok(after.current);
        assert.notEqual(after.current.type, 'O');
    });
});

test('tetris-3d-phase2-prototype：复杂度估算', async t => {
    await t.test('estimatePhase2Complexity 返回区间与 blockers', () => {
        const est = estimatePhase2Complexity({ targetDepth: 16, hasSrsDebt: true });
        assert.ok(est.relativeComplexity >= 3);
        assert.ok(est.estimatedWeeks[0] <= est.estimatedWeeks[1]);
        assert.ok(est.blockers.includes('90-day MVP retention KPI gate pending'));
    });
});
