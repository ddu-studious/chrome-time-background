const test = require('node:test');
const assert = require('node:assert/strict');

const {
    TETRIS_EFFECT_TIER_PRESETS,
    TIER_ORDER,
    getTierPreset,
    pickTierFromHints,
    estimateFrameCostUnits,
    runCpuProxySpike,
    applyResolutionScaleToCanvas,
    B3_SPIKE_META
} = require('../js/tetris-effect-tiers.js');

const HEAVY_SCENE = Object.freeze({
    instanceCount: 220,
    activeParticles: 80,
    logicalPixelCount: 300 * 600
});

test('B3：预设结构与 Spike 元数据', async t => {
    await t.test('三档 id 固定且可枚举', () => {
        assert.deepEqual(TIER_ORDER, ['low', 'medium', 'high']);
        for (const id of TIER_ORDER) {
            assert.equal(TETRIS_EFFECT_TIER_PRESETS[id].id, id);
        }
        assert.match(B3_SPIKE_META.version, /^[\w.-]+$/);
    });

    await t.test('未知档位回落到 medium', () => {
        assert.equal(getTierPreset(' extraneous ').id, 'medium');
        assert.equal(getTierPreset(undefined).id, 'medium');
    });
});

test('B3：档位选择策略（低端档友好）', async t => {
    await t.test('节省流量 / 低电量 / 减少动效 → low', () => {
        assert.equal(pickTierFromHints({ saveData: true }), 'low');
        assert.equal(pickTierFromHints({ lowPowerMode: true }), 'low');
        assert.equal(pickTierFromHints({ prefersReducedMotion: true }), 'low');
    });

    await t.test('deviceMemory ≤4 且弱并发 → low', () => {
        assert.equal(
            pickTierFromHints({ deviceMemory: 4, hardwareConcurrency: 4 }),
            'low'
        );
    });

    await t.test('forcedTier 优先', () => {
        assert.equal(pickTierFromHints({ forcedTier: 'high', saveData: true }), 'high');
    });

    await t.test('内存未知但核心数较少 → medium', () => {
        assert.equal(pickTierFromHints({ hardwareConcurrency: 4 }), 'medium');
    });

    await t.test('高配 → high', () => {
        assert.equal(
            pickTierFromHints({ deviceMemory: 8, hardwareConcurrency: 8 }),
            'high'
        );
    });
});

test('B3：成本模型单调性（同一场景）', async t => {
    await t.test('estimateFrameCostUnits：low ≤ medium ≤ high', () => {
        const low = estimateFrameCostUnits(TETRIS_EFFECT_TIER_PRESETS.low, HEAVY_SCENE);
        const mid = estimateFrameCostUnits(TETRIS_EFFECT_TIER_PRESETS.medium, HEAVY_SCENE);
        const hi = estimateFrameCostUnits(TETRIS_EFFECT_TIER_PRESETS.high, HEAVY_SCENE);
        assert.ok(low <= mid);
        assert.ok(mid <= hi);
    });

    await t.test('runCpuProxySpike：workUnits 同序', () => {
        const low = runCpuProxySpike(TETRIS_EFFECT_TIER_PRESETS.low, HEAVY_SCENE, 3).workUnits;
        const mid = runCpuProxySpike(TETRIS_EFFECT_TIER_PRESETS.medium, HEAVY_SCENE, 3).workUnits;
        const hi = runCpuProxySpike(TETRIS_EFFECT_TIER_PRESETS.high, HEAVY_SCENE, 3).workUnits;
        assert.ok(low <= mid);
        assert.ok(mid <= hi);
    });

    await t.test('分辨率缩放降低 backing 像素（相对 high）', () => {
        const hiPx = runCpuProxySpike(TETRIS_EFFECT_TIER_PRESETS.high, HEAVY_SCENE, 1).backingPixels;
        const lowPx = runCpuProxySpike(TETRIS_EFFECT_TIER_PRESETS.low, HEAVY_SCENE, 1).backingPixels;
        assert.ok(lowPx < hiPx);
    });
});

test('B3：Canvas 分辨率应用', async t => {
    await t.test('applyResolutionScaleToCanvas 设置宽高', () => {
        const canvas = { width: 0, height: 0 };
        applyResolutionScaleToCanvas(canvas, 300, 600, 0.67);
        assert.equal(canvas.width, 201);
        assert.equal(canvas.height, 402);
    });

    await t.test('scale 钳制在 [0.5, 1]', () => {
        const canvas = { width: 0, height: 0 };
        applyResolutionScaleToCanvas(canvas, 100, 100, 0.1);
        assert.equal(canvas.width, 50);
        applyResolutionScaleToCanvas(canvas, 100, 100, 2);
        assert.equal(canvas.width, 100);
    });
});
