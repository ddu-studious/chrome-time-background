const test = require('node:test');
const assert = require('node:assert/strict');

const { createTetrisGameCore, getPieceCells } = require('../js/tetris-game.js');

function emptyBoard(rows, cols) {
    const b = [];
    for (let y = 0; y < rows; y += 1) {
        b.push(new Array(cols).fill(0));
    }
    return b;
}

test('规则层：初始化、消行得分、贴墙移动', async t => {
    await t.test('reset 后盘面尺寸与当前块有效', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        const s = game.getState();
        assert.equal(s.gameOver, false);
        assert.equal(s.board.length, 20);
        assert.equal(s.board[0].length, 10);
        assert.ok(s.current);
        assert.ok(['I', 'O', 'T', 'S', 'Z', 'J', 'L'].includes(s.current.type));
    });

    await t.test('满行消除与得分（四联消 800 分）', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        const rows = emptyBoard(20, 10);
        for (let y = 16; y < 19; y += 1) {
            for (let x = 0; x < 10; x += 1) rows[y][x] = 1;
        }
        for (let x = 0; x < 10; x += 1) rows[19][x] = 1;
        game.__setBoardForTest(rows);
        const after = game.__sweepLinesForTest();
        assert.equal(after.lines, 4);
        assert.equal(after.score, 800);
        assert.ok(after.board.every(row => row.every(c => c === 0)));
    });

    await t.test('靠右墙时无法继续右移（O 型最大 x=7）', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.reset();
        game.__setBoardForTest(emptyBoard(20, 10));
        game.__setCurrentForTest({ type: 'O', rotation: 0, x: 6, y: 10 });
        assert.equal(game.moveHorizontal(1), true);
        assert.equal(game.getState().current.x, 7);
        assert.equal(game.moveHorizontal(1), false);
    });
});

test('几何：getPieceCells', async t => {
    await t.test('T 型在 rotation=0、px=3、py=0 产生 4 格', () => {
        const cells = getPieceCells('T', 0, 3, 0);
        assert.equal(cells.length, 4);
        assert.ok(cells.some(c => c.x === 4 && c.y === 0));
    });
});

test('端到端链路：软降触底 → 写入锁定格 → 满行消除 → 计分（MVP spike）', async t => {
    await t.test('竖直 I 补最后一格后单次 softDrop 触发 1 行消除（100 分）', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.__setNextTypesForTest(['O', 'O', 'O']);
        game.reset();

        const rows = emptyBoard(20, 10);
        for (let x = 0; x < 9; x += 1) rows[19][x] = 1;
        for (let y = 16; y <= 18; y += 1) rows[y][9] = 1;
        game.__setBoardForTest(rows);
        /** rotation=1：四格竖列落在 piece.x+2 */
        game.__setCurrentForTest({ type: 'I', rotation: 1, x: 7, y: 16 });

        const after = game.softDrop();
        assert.equal(after.gameOver, false);
        assert.equal(after.lines, 1);
        assert.equal(after.score, 100);
        assert.ok(after.current);
    });

    await t.test('宿主 tick() 与 softDrop 同源重力步（触底同样锁定）', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.__setNextTypesForTest(['O', 'O', 'O']);
        game.reset();

        const rows = emptyBoard(20, 10);
        for (let x = 0; x < 9; x += 1) rows[19][x] = 1;
        for (let y = 16; y <= 18; y += 1) rows[y][9] = 1;
        game.__setBoardForTest(rows);
        game.__setCurrentForTest({ type: 'I', rotation: 1, x: 7, y: 16 });

        const after = game.tick();
        assert.equal(after.lines, 1);
        assert.equal(after.score, 100);
    });
});

test('规则层：锁定后生成下一块，栈顶阻塞时 gameOver', async t => {
    await t.test('hardDrop 锁块后仍有当前块（场地未满）', () => {
        const game = createTetrisGameCore({ randomFn: () => 0 });
        game.__setNextTypesForTest(['O', 'O', 'O']);
        game.reset();
        game.__setBoardForTest(emptyBoard(20, 10));
        game.__setCurrentForTest({ type: 'O', rotation: 0, x: 3, y: 15 });
        const after = game.hardDrop();
        assert.equal(after.gameOver, false);
        assert.ok(after.current);
    });

    await t.test('spawn 不可放置时 gameOver', () => {
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
        assert.equal(after.gameOver, true);
    });
});
