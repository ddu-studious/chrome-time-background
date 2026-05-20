const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LINE_CLEAR_ANIM_MS,
    findFullRowIndices,
    snapshotClearedRows,
    detectLineClearForAnim,
    computeLineClearT01,
    computeLineClearTransform,
    buildLineClearOverlayVoxels,
    createTetris3DSound
} = require('../js/tetris-3d-fx.js');

test('Tetris3D FX：消行检测与插值', async t => {
    await t.test('findFullRowIndices 识别满行', () => {
        const board = [
            [0, 0, 0],
            [1, 2, 3],
            [4, 5, 6]
        ];
        assert.deepEqual(findFullRowIndices(board), [1, 2]);
    });

    await t.test('snapshotClearedRows 保留消行前颜色', () => {
        const board = [
            [0, 0],
            [3, 5]
        ];
        const snaps = snapshotClearedRows(board, [1]);
        assert.equal(snaps.length, 1);
        assert.deepEqual(snaps[0].cells, [3, 5]);
    });

    await t.test('detectLineClearForAnim 仅在 lines 增加时触发', () => {
        const board = [
            [1, 1, 1],
            [0, 0, 0]
        ];
        const before = { lines: 0, board };
        const after = { lines: 1 };
        const anim = detectLineClearForAnim(before, after, 1000);
        assert.ok(anim);
        assert.deepEqual(anim.rows, [0]);
        assert.equal(anim.durationMs, LINE_CLEAR_ANIM_MS);

        const noAnim = detectLineClearForAnim(before, { lines: 0 }, 1000);
        assert.equal(noAnim, null);
    });

    await t.test('computeLineClearT01 进度与完成', () => {
        assert.equal(computeLineClearT01(0, 160, 320), 0.5);
        assert.equal(computeLineClearT01(0, 320, 320), null);
    });

    await t.test('computeLineClearTransform 先膨胀后收缩', () => {
        const start = computeLineClearTransform(0);
        const mid = computeLineClearTransform(0.1);
        const end = computeLineClearTransform(1);
        assert.equal(start.scale, 1);
        assert.ok(mid.scale > 1);
        assert.equal(end.scale, 0);
        assert.ok(start.brightness >= end.brightness);
    });

    await t.test('buildLineClearOverlayVoxels 跳过空格', () => {
        const voxels = buildLineClearOverlayVoxels([
            { row: 2, cells: [0, 4, 0] }
        ]);
        assert.equal(voxels.length, 1);
        assert.deepEqual(voxels[0], { gx: 1, gy: 2, colorIndex: 4 });
    });
});

test('Tetris3D FX：音效合成器', async t => {
    await t.test('createTetris3DSound 无 AudioContext 时静默', () => {
        const sound = createTetris3DSound({
            createAudioContext: () => null
        });
        assert.doesNotThrow(() => sound.playLineClear(2));
        sound.dispose();
    });

    await t.test('createTetris3DSound 可调用 Web Audio API', () => {
        const calls = [];
        const sound = createTetris3DSound({
            createAudioContext: () => ({
                state: 'running',
                currentTime: 0,
                createOscillator() {
                    return {
                        type: 'sine',
                        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
                        connect() {},
                        start() {
                            calls.push('start');
                        },
                        stop() {}
                    };
                },
                createGain() {
                    return {
                        gain: {
                            setValueAtTime() {},
                            exponentialRampToValueAtTime() {}
                        },
                        connect() {}
                    };
                },
                destination: {}
            })
        });
        sound.playLineClear(3);
        assert.deepEqual(calls, ['start']);
        sound.dispose();
    });
});
