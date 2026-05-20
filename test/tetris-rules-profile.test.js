const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
    loadRulesParameterBundle,
    getProfileFromBundle,
    resolveProfile,
    getRotationModel,
    getWallKickPolicy
} = require('../js/tetris-rules-profile.js');

const bundlePath = path.join(__dirname, '../docs/tetris-rules-v1-parameter-bundle.json');
const bundle = loadRulesParameterBundle({ bundlePath });

test('tetris-rules-profile：参数包加载与 Profile 解析', async t => {
    await t.test('schemaVersion 与 recommendedProfileForMVP 存在', () => {
        assert.equal(bundle.schemaVersion, 'tetris-rules-params/1.0.0');
        assert.equal(bundle.recommendedProfileForMVP, 'guideline_subset_v1');
    });

    await t.test('resolveProfile 默认返回 guideline_subset_v1', () => {
        const profile = resolveProfile(undefined, bundle);
        assert.ok(profile);
        assert.equal(getWallKickPolicy(profile), 'pieceSpecificTables');
    });

    await t.test('classic_subset_v1 使用 genericOffsets', () => {
        const profile = getProfileFromBundle('classic_subset_v1', bundle);
        assert.ok(profile);
        assert.equal(getWallKickPolicy(profile), 'genericOffsets');
        const model = getRotationModel(profile);
        assert.ok(Array.isArray(model.genericKickOffsets));
        assert.equal(model.genericKickOffsets.length, 9);
    });

    await t.test('guideline_subset_v1 含 JLSTZ / I 踢墙表', () => {
        const profile = getProfileFromBundle('guideline_subset_v1', bundle);
        const tables = getRotationModel(profile).pieceSpecificKickTables;
        assert.ok(tables.JLSTZ);
        assert.ok(tables.I);
        assert.equal(tables.JLSTZ.rotateCwSteps.length, 4);
        assert.equal(tables.I.rotateCwSteps.length, 4);
    });
});
