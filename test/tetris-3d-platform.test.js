const test = require('node:test');
const assert = require('node:assert/strict');

const {
    sanitizePayload,
    createTetris3DPlatform,
    STORAGE_KEY_SOUND
} = require('../js/tetris-3d-platform.js');

function createMockStorage() {
    const map = new Map();
    return {
        getItem(key) {
            return map.has(key) ? map.get(key) : null;
        },
        setItem(key, value) {
            map.set(key, String(value));
        }
    };
}

test('Tetris3D Platform：埋点与偏好', async t => {
    await t.test('sanitizePayload 过滤 PII 与非白名单字段', () => {
        const out = sanitizePayload({
            score: 1200,
            email: 'user@example.com',
            renderMode: 'webgl',
            nested: { bad: true }
        });
        assert.deepEqual(out, { score: 1200, renderMode: 'webgl' });
        assert.equal('email' in out, false);
    });

    await t.test('track 写入 ActivityLogger', () => {
        const logged = [];
        const platform = createTetris3DPlatform({
            activityLogger: {
                log(activity) {
                    logged.push(activity);
                }
            },
            localStorage: createMockStorage()
        });

        platform.track('game_start', {
            renderMode: 'webgl',
            probeReason: 'webgl2_ok',
            userId: 'must-drop'
        });

        assert.equal(logged.length, 1);
        assert.equal(logged[0].type, 'tetris_3d_game_start');
        assert.equal(logged[0].module, 'tetris-3d-game');
        assert.deepEqual(logged[0].meta, {
            renderMode: 'webgl',
            probeReason: 'webgl2_ok'
        });
    });

    await t.test('track 无 logger 时走 debug 回调', () => {
        const debug = [];
        const platform = createTetris3DPlatform({
            activityLogger: null,
            localStorage: createMockStorage(),
            debugFn: (level, args) => debug.push({ level, args })
        });
        platform.track('game_finish', { durationMs: 9000, score: 300, completed: true });
        assert.equal(debug.length, 1);
        assert.equal(debug[0].args[0], 'game_finish');
    });

    await t.test('音效偏好读写 localStorage', () => {
        const storage = createMockStorage();
        const platform = createTetris3DPlatform({ localStorage: storage });

        assert.equal(platform.getSoundEnabled(), true);
        platform.setSoundEnabled(false);
        assert.equal(storage.getItem(STORAGE_KEY_SOUND), '0');
        assert.equal(platform.getSoundEnabled(), false);
    });
});
