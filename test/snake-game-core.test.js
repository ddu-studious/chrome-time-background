const test = require('node:test');
const assert = require('node:assert/strict');

const { createSnakeGameCore } = require('../js/snake-game.js');

function createDeterministicGame(gridSize = 10) {
    return createSnakeGameCore({ gridSize, randomFn: () => 0 });
}

test('规则层：移动/碰撞/吃食物/重开一致性', async (t) => {
    await t.test('初始化 reset 状态正确', () => {
        const game = createDeterministicGame();
        const state = game.getState();

        assert.equal(state.snake.length, 3);
        assert.equal(state.gameOver, false);
        assert.equal(state.score, 0);
        assert.equal(state.direction, 'RIGHT');
        assert.deepEqual(state.snake[0], { x: 5, y: 5 });
        assert.ok(!state.snake.some(seg => seg.x === state.food.x && seg.y === state.food.y));
    });

    await t.test('基础移动：未吃食物时，头部前进且长度不变', () => {
        const game = createDeterministicGame();
        const before = game.getState();

        game.__setFoodForTest({ x: 0, y: 0 });
        const after = game.tick();

        assert.deepEqual(after.snake[0], { x: before.snake[0].x + 1, y: before.snake[0].y });
        assert.equal(after.snake.length, before.snake.length);
        assert.equal(after.score, 0);
        assert.equal(after.gameOver, false);
    });

    await t.test('禁止立刻 180° 反向移动', () => {
        const game = createDeterministicGame();
        const accepted = game.setDirection('LEFT');
        const afterTick = game.tick();

        assert.equal(accepted, false);
        assert.equal(afterTick.direction, 'RIGHT');
    });

    await t.test('吃到食物后得分 +1 且蛇身增长', () => {
        const game = createDeterministicGame();
        const before = game.getState();
        const head = before.snake[0];

        game.__setFoodForTest({ x: head.x + 1, y: head.y });
        const after = game.tick();

        assert.equal(after.score, 1);
        assert.equal(after.snake.length, before.snake.length + 1);
        assert.notDeepEqual(after.food, { x: head.x + 1, y: head.y });
    });

    await t.test('撞墙后 gameOver，后续 tick 状态冻结', () => {
        const game = createDeterministicGame(5);

        game.tick();
        game.tick();
        const gameOverState = game.tick();
        const frozenState = game.tick();

        assert.equal(gameOverState.gameOver, true);
        assert.deepEqual(frozenState, gameOverState);
    });

    await t.test('自撞后 gameOver', () => {
        const game = createDeterministicGame();

        game.__setFoodForTest({ x: 6, y: 5 });
        game.tick();
        game.__setFoodForTest({ x: 6, y: 6 });
        game.setDirection('DOWN');
        game.tick();
        game.__setFoodForTest({ x: 5, y: 6 });
        game.setDirection('LEFT');
        game.tick();
        game.setDirection('UP');
        const state = game.tick();

        assert.equal(state.gameOver, true);
    });

    await t.test('重开一致性：reset 后回到初始可玩状态', () => {
        const game = createDeterministicGame(8);
        const fresh = createDeterministicGame(8).getState();

        game.__setFoodForTest({ x: 5, y: 4 });
        game.setDirection('UP');
        game.tick();
        game.tick();
        game.tick();
        const resetState = game.reset();

        assert.deepEqual(resetState, fresh);
        assert.equal(resetState.gameOver, false);
        assert.equal(resetState.score, 0);
        assert.equal(resetState.direction, 'RIGHT');
    });
});
