(function attachTetrisEffectTiers(global) {
    'use strict';

    /**
     * B3 性能 Spike — 方法论摘要（书面基线，供 PM / 测试对齐）
     *
     * 观测维度（本期 Knobs）：
     * - 实例数：等价于 Canvas 2D 下单帧「可区分的绘制主体」数量（盘面格、当前块、Ghost、UI 贴片等；
     *   WebGL 路径下对应 instance/batch 上限）。
     * - 阴影：布尔开关 + 模糊半径 × _passes（Canvas shadowBlur / 离屏模糊 PASS 的抽象）。
     * - 粒子：_simBudget（存活上限）与每帧发射预算（CPU/GPU 粒子更新的抽象）。
     * - 分辨率缩放：逻辑分辨率 × canvasResolutionScale → 实际 backing-store 像素量 ∝ 1/scale²。
     *
     * 「低端档」代理假设（Spike 结论写入默认值，真实设备需 Chrome Performance + fps 曲线复核）：
     * - 720p 级、4×A53/A55、内存 ≤4GB、集成 GPU：像素填充与每像素混合为首要瓶颈；
     * - Canvas2D 阴影会引发额外状态切换与大面积混合 → 低端默认关闭；
     * - 粒子预算与实例数次之；先把 backing-store 降到 ~0.45×～0.56× 逻辑像素面积可显著稳住帧时间。
     *
     * 预设档位：low / medium / high —— 工程默认由 pickTierFromHints 结合 Device Memory API 等与用户可见「画质」联动。
     */
    const B3_SPIKE_META = Object.freeze({
        version: '2026-05-b3-v1',
        targetLowEndProfile: '720p-class 4-core ≤4GB integrated GPU (proxy)',
        notes:
            'Defaults are conservative for Opera funnel / extension host; replace hints.profile with lab telemetry when available.'
    });

    /** @typedef {'low' | 'medium' | 'high'} TetrisEffectTierId */

    /**
     * 特效分级默认值（Spike 产出物）。
     * 数值可与 docs 参数表同步；此处为运行时单一真相源。
     */
    const TETRIS_EFFECT_TIER_PRESETS = Object.freeze({
        low: Object.freeze({
            id: 'low',
            label: '省电 / 低端默认',
            canvasResolutionScale: 0.67,
            maxDrawableInstances: 260,
            shadowEnabled: false,
            shadowPasses: 0,
            shadowBlurPx: 0,
            particlesMaxAlive: 0,
            particlesEmitBudgetPerFrame: 0,
            particleSimSubsteps: 1
        }),
        medium: Object.freeze({
            id: 'medium',
            label: '均衡',
            canvasResolutionScale: 0.83,
            maxDrawableInstances: 320,
            shadowEnabled: true,
            shadowPasses: 1,
            shadowBlurPx: 6,
            particlesMaxAlive: 28,
            particlesEmitBudgetPerFrame: 5,
            particleSimSubsteps: 1
        }),
        high: Object.freeze({
            id: 'high',
            label: '高品质',
            canvasResolutionScale: 1,
            maxDrawableInstances: 400,
            shadowEnabled: true,
            shadowPasses: 2,
            shadowBlurPx: 12,
            particlesMaxAlive: 96,
            particlesEmitBudgetPerFrame: 14,
            particleSimSubsteps: 2
        })
    });

    const TIER_ORDER = Object.freeze(['low', 'medium', 'high']);

    function clamp(n, lo, hi) {
        return Math.min(hi, Math.max(lo, n));
    }

    /**
     * @param {string} tierId
     * @returns {Readonly<typeof TETRIS_EFFECT_TIER_PRESETS.low>}
     */
    function getTierPreset(tierId) {
        const id = String(tierId || '').toLowerCase();
        const preset = TETRIS_EFFECT_TIER_PRESETS[id];
        if (!preset) {
            return TETRIS_EFFECT_TIER_PRESETS.medium;
        }
        return preset;
    }

    /**
     * @param {{
     *   hardwareConcurrency?: number,
     *   deviceMemory?: number,
     *   saveData?: boolean,
     *   lowPowerMode?: boolean,
     *   prefersReducedMotion?: boolean,
     *   forcedTier?: TetrisEffectTierId
     * }} hints
     * @returns {TetrisEffectTierId}
     */
    function pickTierFromHints(hints) {
        const h = hints || {};
        if (h.forcedTier && TETRIS_EFFECT_TIER_PRESETS[String(h.forcedTier).toLowerCase()]) {
            return /** @type {TetrisEffectTierId} */ (String(h.forcedTier).toLowerCase());
        }
        if (h.prefersReducedMotion || h.saveData || h.lowPowerMode) {
            return 'low';
        }
        const mem = typeof h.deviceMemory === 'number' ? h.deviceMemory : null;
        const cores = typeof h.hardwareConcurrency === 'number' ? h.hardwareConcurrency : 4;
        if (mem !== null && mem <= 2) return 'low';
        if (mem !== null && mem <= 4 && cores <= 4) return 'low';
        if (cores <= 4 || (mem !== null && mem <= 6)) return 'medium';
        return 'high';
    }

    /**
     * 抽象「帧成本单位」，用于跨 Knob 比较（非毫秒）；单调性在测试中校验。
     *
     * @param {Readonly<typeof TETRIS_EFFECT_TIER_PRESETS.low>} profile
     * @param {{ instanceCount: number, activeParticles: number }} scene
     */
    function estimateFrameCostUnits(profile, scene) {
        const scale = clamp(profile.canvasResolutionScale, 0.5, 1);
        /** 与 backing-store 像素量成正比（低端降分辨率 → 成本下降） */
        const pixelPressure = scale * scale;

        const inst = clamp(scene.instanceCount, 0, profile.maxDrawableInstances);
        let instancePressure = inst;
        if (profile.shadowEnabled && profile.shadowPasses > 0) {
            const blurWeight = 1 + profile.shadowPasses * profile.shadowBlurPx * 0.034;
            instancePressure *= blurWeight;
        }

        const aliveCap = profile.particlesMaxAlive;
        const effectiveParticles =
            aliveCap <= 0 ? 0 : Math.min(scene.activeParticles, aliveCap);
        const particlePressure =
            effectiveParticles * (0.14 + profile.particlesEmitBudgetPerFrame * 0.022);

        return pixelPressure * instancePressure + particlePressure;
    }

    /**
     * CPU 代理基准：纯算术近似 GPU/Canvas 合成复杂度，用于 CI 回归与同场景档位对比。
     *
     * @param {Readonly<typeof TETRIS_EFFECT_TIER_PRESETS.low>} profile
     * @param {{ instanceCount: number, activeParticles: number, logicalPixelCount?: number }} scene
     * @param {number} iterations Repeat inner workload for measurable Node timing if needed.
     */
    function runCpuProxySpike(profile, scene, iterations) {
        const iter = Math.max(1, Math.floor(iterations || 1));
        const scale = clamp(profile.canvasResolutionScale, 0.5, 1);
        const logicalPx = scene.logicalPixelCount ?? 300 * 600;
        const backingPixels = Math.round(logicalPx * scale * scale);

        let workUnits = 0;
        const inst = Math.min(scene.instanceCount, profile.maxDrawableInstances);
        const parts = Math.min(scene.activeParticles, profile.particlesMaxAlive);

        for (let r = 0; r < iter; r += 1) {
            workUnits += Math.floor(backingPixels / 800);
            for (let i = 0; i < inst; i += 1) {
                workUnits += 6;
                if (profile.shadowEnabled && profile.shadowPasses > 0) {
                    workUnits += profile.shadowPasses * profile.shadowBlurPx * 2;
                }
            }
            workUnits += parts * profile.particlesEmitBudgetPerFrame * 7 * profile.particleSimSubsteps;
        }

        return {
            workUnits,
            backingPixels,
            iterations: iter,
            profileId: profile.id
        };
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {number} logicalW
     * @param {number} logicalH
     * @param {number} scale
     */
    function applyResolutionScaleToCanvas(canvas, logicalW, logicalH, scale) {
        if (!canvas || typeof canvas !== 'object') return;
        const s = clamp(scale, 0.5, 1);
        const w = Math.max(1, Math.round(logicalW * s));
        const h = Math.max(1, Math.round(logicalH * s));
        canvas.width = w;
        canvas.height = h;
    }

    const api = {
        B3_SPIKE_META,
        TETRIS_EFFECT_TIER_PRESETS,
        TIER_ORDER,
        getTierPreset,
        pickTierFromHints,
        estimateFrameCostUnits,
        runCpuProxySpike,
        applyResolutionScaleToCanvas
    };

    global.TetrisEffectTiers = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
