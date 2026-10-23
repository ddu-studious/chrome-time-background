// 回滚演练：用 git HEAD（本次改动之前）的真实 js/aquarium.js 与 js/aquarium-core.js，读取新版本写下的 v:2 名单。
// 期望：旧代码把它当“看不懂的版本”——名单读成空、放入/捞出都拒绝、一次存储写入都没有、存储里的数据原样保留（回到新版本即可恢复）。
const assert = require('node:assert/strict');
const OLD = process.argv[2];
const Aquarium = require(`${OLD}/js/aquarium.js`);
const KEY = 'aquariumV1';
const PALETTE = [[255, 0, 0], [255, 150, 50], [240, 220, 70], [90, 230, 100], [80, 240, 190], [110, 200, 255], [170, 110, 255], [245, 105, 225]];
const tick = () => new Promise(r => setImmediate(r));
(async () => {
    const stored = { v: 2, fish: [{ id: 'g1', species: 'gramma', addedAt: 1 }, { id: 'n1', species: 'neon', addedAt: 2 }, { id: 'i1', species: 'idol', addedAt: 3 }] };
    const state = { data: { [KEY]: JSON.parse(JSON.stringify(stored)) }, sets: 0 };
    const chrome = { storage: { local: {
        async get(key) { return key in state.data ? { [key]: JSON.parse(JSON.stringify(state.data[key])) } : {}; },
        async set(obj) { state.sets++; Object.assign(state.data, JSON.parse(JSON.stringify(obj))); },
    }, onChanged: { addListener() {}, removeListener() {} } } };
    const aq = Aquarium.create({ chrome, document: null, window: {}, random: () => 0.5, wall: () => 1700000000000, warn() {}, now: () => 0, palette: PALETTE });
    aq.start();
    for (let i = 0; i < 8; i++) await tick();
    const report = {};
    report.oldCodeHasNewSpecies = require(`${OLD}/js/aquarium-core.js`).SPECIES.some(s => s.id === 'gramma');
    report.entriesReadByOldCode = aq.entries().map(e => e.species);
    report.addResult = await aq.add('clown');
    report.removeResult = await aq.remove('n1');
    report.storageWrites = state.sets;
    report.storedIntact = JSON.stringify(state.data[KEY]) === JSON.stringify(stored);
    console.log(JSON.stringify(report, null, 1));
    assert.equal(report.oldCodeHasNewSpecies, false, '这确实是旧代码（没有新种）');
    assert.deepEqual(report.entriesReadByOldCode, [], '旧代码读不懂 v:2，当空');
    assert.deepEqual(report.addResult, { ok: false, reason: 'storage' });
    assert.deepEqual(report.removeResult, { ok: false, reason: 'storage' });
    assert.equal(report.storageWrites, 0, '旧代码一次都没写');
    assert.equal(report.storedIntact, true, 'v:2 名单原样保留');
    console.log('ROLLBACK_CHECK_OK');
})().catch(e => { console.error('ROLLBACK_CHECK_FAILED', e.message); process.exit(1); });
