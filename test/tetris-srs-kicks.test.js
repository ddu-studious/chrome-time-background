const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { loadRulesParameterBundle } = require('../js/tetris-rules-profile.js');
const {
    getKickTableGroup,
    getRotationStep,
    tryRotateWithProfile,
    createSrsKickResolver,
    collides2D
} = require('../js/tetris-srs-kicks.js');
const { getPieceCells } = require('../js/tetris-game.js');

const bundle = loadRulesParameterBundle({
    bundlePath: path.join(__dirname, '../docs/tetris-rules-v1-parameter-bundle.json')
});
const guideline = bundle.profiles.guideline_subset_v1;
const classic = bundle.profiles.classic_subset_v1;

function emptyBoard(rows, cols) {
    const b = [];
    for (let y = 0; y < rows; y += 1) {
        b.push(new Array(cols).fill(0));
    }
    return b;
}

test('tetris-srs-kicks：踢墙表分组', async t => {
    await t.test('JLSTZ 归并 J/L/S/T/Z', () => {
        assert.equal(getKickTableGroup('T'), 'JLSTZ');
        assert.equal(getKickTableGroup('J'), 'JLSTZ');
        assert.equal(getKickTableGroup('I'), 'I');
        assert.equal(getKickTableGroup('O'), 'O');
    });
});

test('tetris-srs-kicks：Guideline CW 向量', async t => {
    await t.test('T 0→1 首测为 [0,0]', () => {
        const step = getRotationStep(guideline, 'T', 0, 'cw');
        assert.equal(step.toRot, 1);
        assert.deepEqual(step.tests[0], [0, 0]);
        assert.deepEqual(step.tests[1], [-1, 0]);
    });

    await t.test('I 0→1 含 [-2,0] 长距踢墙', () => {
        const step = getRotationStep(guideline, 'I', 0, 'cw');
        assert.equal(step.toRot, 1);
        assert.ok(step.tests.some(([dx]) => dx === -2));
    });

    await t.test('O 旋转 no-op', () => {
        const step = getRotationStep(guideline, 'O', 0, 'cw');
        assert.equal(step.toRot, 0);
        assert.deepEqual(step.tests, [[0, 0]]);
    });

    await t.test('JLSTZ 四套 CW 过渡均可解析', () => {
        for (let r = 0; r < 4; r += 1) {
            const step = getRotationStep(guideline, 'J', r, 'cw');
            assert.equal(step.toRot, (r + 1) % 4);
            assert.ok(step.tests.length >= 1);
        }
    });
});

test('tetris-srs-kicks：墙边踢墙成功', async t => {
    await t.test('首测 [0,0] 被挡时后续 kick 偏移可成功', () => {
        const board = emptyBoard(20, 10);
        const piece = { type: 'L', rotation: 0, x: 4, y: 15 };
        assert.equal(collides2D(board, 10, 20, piece), false);

        const naive = { type: 'L', rotation: 1, x: 4, y: 15 };
        const blocked = getPieceCells(naive.type, naive.rotation, naive.x, naive.y);
        for (let i = 0; i < blocked.length; i += 1) {
            const { x, y } = blocked[i];
            if (y >= 0 && y < 20 && x >= 0 && x < 10) board[y][x] = 1;
        }
        assert.equal(collides2D(board, 10, 20, naive), true);

        const result = tryRotateWithProfile(piece, board, 10, 20, guideline, 'cw');
        assert.equal(result.success, true);
        assert.ok(result.piece);
        assert.ok(result.testsTried > 1);
        assert.equal(collides2D(board, 10, 20, result.piece), false);
    });

    await t.test('generic profile 与现内核 KICKS 顺序一致', () => {
        const step = getRotationStep(classic, 'T', 0, 'cw');
        assert.deepEqual(step.tests.slice(0, 3), [[0, 0], [-1, 0], [1, 0]]);
    });
});

test('tetris-srs-kicks：createSrsKickResolver 工厂', async t => {
    await t.test('resolver 绑定 profile 并可旋转', () => {
        const resolver = createSrsKickResolver(bundle, 'guideline_subset_v1');
        assert.ok(resolver);
        assert.equal(resolver.profileId, 'guideline_subset_v1');

        const board = emptyBoard(20, 10);
        const piece = { type: 'S', rotation: 1, x: 5, y: 10 };
        const step = resolver.getRotationStep('S', 1, 'cw');
        assert.equal(step.toRot, 2);

        const result = resolver.tryRotate(piece, board, 10, 20, 'cw');
        assert.equal(result.success, true);
    });
});
