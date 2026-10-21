const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/background-provider.js'), 'utf8');
const MEMO_KEY = 'bgMergedResultV1';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const flush = async (times = 6) => { for (let i = 0; i < times; i++) await new Promise(resolve => setImmediate(resolve)); };

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function commonsPage(url, generation) {
    const slug = new URL(url).searchParams.get('gcmtitle').replace(/\W+/g, '_');
    const pages = {};
    for (let i = 1; i <= 2; i++) {
        pages[String(i)] = {
            title: `File:${slug}_${generation}_${i}.jpg`,
            imageinfo: [{
                thumburl: `https://thumb.example.org/${slug}_g${generation}_${i}.jpg`,
                url: `https://upload.example.org/${slug}_g${generation}_${i}.jpg`,
                width: 3000, height: 2000, mime: 'image/jpeg',
                extmetadata: {
                    LicenseShortName: { value: 'CC BY-SA 4.0' },
                    LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
                    ImageDescription: { value: `Scenery ${i}` },
                    Artist: { value: 'Tester' },
                },
            }],
        };
    }
    return { query: { pages } };
}

// 真实的 background-provider.js + 内存版 chrome.storage + 可控时钟 + 可挂起/可失败的 fetch。
function world({ settings = { enabledSources: ['wikimedia'], mediaMode: 'image' } } = {}) {
    const clock = { now: Date.parse('2026-10-14T08:00:00Z') };
    const sync = { backgroundProviderSettings: settings };
    const local = new Map();
    const net = { calls: [], hold: null, fail: false, generation: 1 };
    class FakeDate extends Date {
        constructor(...args) { if (args.length) super(...args); else super(clock.now); }
        static now() { return clock.now; }
    }
    const read = (store, key) => {
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.filter(name => store.has(name)).map(name => [name, store.get(name)]));
    };
    const syncStore = new Map(Object.entries(sync));
    // 虚拟定时器：与可控时钟一起推进，用来验证“最多等多久”的上限，不依赖真实等待。
    const timers = new Map();
    let timerSeq = 0;
    const context = {
        self: {}, console: { warn() {} }, URL, TextEncoder, crypto: webcrypto, Date: FakeDate,
        setTimeout: (fn, ms = 0) => { const id = ++timerSeq; timers.set(id, { at: clock.now + ms, fn }); return id; },
        clearTimeout: id => { timers.delete(id); },
        fetch: async url => {
            net.calls.push(String(url));
            if (net.hold) await net.hold.promise;
            if (net.fail) throw new Error('offline');
            return { ok: true, json: async () => commonsPage(String(url), net.generation) };
        },
        chrome: {
            storage: {
                sync: { get: async key => structuredClone(read(syncStore, key)) },
                local: {
                    get: async key => structuredClone(read(local, key)),
                    set: async values => { for (const [key, value] of Object.entries(values)) local.set(key, structuredClone(value)); },
                },
            },
        },
    };
    vm.runInNewContext(source, context, { filename: 'background-provider.js' });
    const manager = context.self.BackgroundProviderManager;
    return {
        clock, net, local, syncStore,
        get: () => manager.getBackgrounds(),
        memo: () => local.get(MEMO_KEY),
        // VM 里创建的数组与测试所在 realm 的原型不同，严格比较前先转成本 realm 的数组。
        urls: result => Array.from(result.backgrounds, item => item.url),
        advance(ms) {
            clock.now += ms;
            for (const [id, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
                if (timer.at <= clock.now) { timers.delete(id); timer.fn(); }
            }
        },
        pendingTimers: () => timers.size,
    };
}

test('首次没有可用结果时同步拉取，并把合并结果和设置指纹存下来（不含 API Key）', async () => {
    const w = world({ settings: { enabledSources: ['wikimedia', 'unsplash'], mediaMode: 'image', apiKeys: { unsplash: 'SECRET-KEY-123' } } });
    w.net.fail = true; // 先让它失败，确认兜底结果不会被当成好结果存下来
    const fallback = await w.get();
    assert.equal(fallback.source, 'fallback');
    assert.equal(w.memo(), undefined, '兜底结果不写入');

    const w2 = world();
    const result = await w2.get();
    assert.equal(result.source, 'multi');
    assert.equal(result.mediaMode, 'image');
    assert.equal(w2.net.calls.length, 3, 'Wikimedia 按 3 个分类拉取');
    const memo = w2.memo();
    assert.equal(memo.v, 1);
    assert.equal(memo.backgrounds.length, result.backgrounds.length);
    assert.match(memo.signature, /^[0-9a-f]{32}$/);

    const w3 = world({ settings: { enabledSources: ['wikimedia'], mediaMode: 'image', apiKeys: { wikimedia: 'SECRET-KEY-123' } } });
    await w3.get();
    assert.ok(!JSON.stringify(w3.memo()).includes('SECRET-KEY-123'), '密钥只参与摘要，不写入缓存');
});

test('结果还新时直接返回，不请求网络', async () => {
    const w = world();
    const first = await w.get();
    const requests = w.net.calls.length;
    w.advance(10 * MINUTE);
    const second = await w.get();
    assert.equal(w.net.calls.length, requests);
    assert.deepEqual(w.urls(second), w.urls(first));
    assert.equal(second.source, 'multi');
});

test('超过 30 分钟且源缓存已过期：立刻返回旧结果，页面不等网络；后台刷新后下次用新结果', async () => {
    const w = world();
    const first = await w.get();
    w.advance(13 * HOUR); // Wikimedia 12 小时缓存与合并结果都已过期
    w.net.generation = 2;
    w.net.hold = deferred(); // 网络卡住：以前页面会在这里一直等
    const before = w.net.calls.length;

    const answered = await Promise.race([w.get(), new Promise(resolve => setTimeout(() => resolve('timeout'), 500))]);
    assert.notEqual(answered, 'timeout', '网络卡住时 getBackgrounds 仍立即返回');
    assert.deepEqual(w.urls(answered), w.urls(first), '返回的是上次的结果');
    await flush();
    assert.ok(w.net.calls.length > before, '同时已在后台开始刷新');

    w.net.hold.resolve();
    await flush(20);
    assert.ok(w.memo().ts >= w.clock.now, '后台刷新完成后合并结果被更新');
    const next = await w.get();
    assert.ok(w.urls(next).every(url => url.includes('_g2_')), '下次拿到的是新一代结果');
});

test('后台刷新同一时刻只进行一次，并发请求不会重复拉取', async () => {
    const w = world();
    await w.get();
    w.advance(13 * HOUR);
    w.net.hold = deferred();
    const before = w.net.calls.length;
    await Promise.all([w.get(), w.get(), w.get()]);
    await flush();
    assert.equal(w.net.calls.length - before, 1, '三个页面同时打开只触发一次刷新（串行拉取的第一个请求）');
    w.net.hold.resolve();
    await flush(20);
    assert.equal(w.net.calls.length - before, 3, '一次刷新共 3 个分类请求');
});

test('后台刷新失败时保留旧结果，5 分钟内不重复尝试，之后再试', async () => {
    const w = world();
    const first = await w.get();
    const originalTs = w.memo().ts;
    w.advance(13 * HOUR);
    w.net.fail = true;
    const before = w.net.calls.length;
    const answer = await w.get();
    await flush(20);
    assert.deepEqual(w.urls(answer), w.urls(first));
    assert.equal(w.memo().ts, originalTs, '失败的刷新不会用兜底结果覆盖好结果');
    const afterFirstTry = w.net.calls.length;
    assert.ok(afterFirstTry > before);

    w.advance(2 * MINUTE);
    await w.get();
    await flush(20);
    assert.equal(w.net.calls.length, afterFirstTry, '5 分钟内不重复请求');

    w.advance(4 * MINUTE);
    w.net.fail = false;
    await w.get();
    await flush(20);
    assert.ok(w.net.calls.length > afterFirstTry, '超过 5 分钟后再次尝试');
    assert.ok(w.memo().ts > originalTs);
});

test('结果超过 7 天不再沿用，改为同步等待重新拉取', async () => {
    const w = world();
    await w.get();
    w.advance(8 * DAY);
    w.net.generation = 3;
    w.net.hold = deferred();
    const pending = w.get();
    const early = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve('waiting'), 100))]);
    assert.equal(early, 'waiting', '没有可用旧结果时和以前一样等待网络');
    w.net.hold.resolve();
    const result = await pending;
    assert.ok(w.urls(result).every(url => url.includes('_g3_')));
});

test('来源、媒体模式或 API Key 变化后旧结果不再适用', async () => {
    const base = { enabledSources: ['wikimedia', 'pexels'], mediaMode: 'image', apiKeys: { pexels: 'key-one' } };
    const SENTINEL = 'https://sentinel.example.org/old-result.jpg';
    const w = world({ settings: base });
    await w.get();

    // 对照：设置没变时，旧结果（这里替换成可识别的哨兵条目）会被直接使用。
    const original = w.memo();
    const signature = original.signature;
    const staleMemo = { ...original, backgrounds: [{ ...original.backgrounds[0], url: SENTINEL }] };
    w.local.set(MEMO_KEY, staleMemo);
    assert.deepEqual(w.urls(await w.get()), [SENTINEL], '设置不变时命中旧结果');

    for (const next of [
        { ...base, enabledSources: ['wikimedia'] },
        { ...base, mediaMode: 'mixed' },
        { ...base, apiKeys: { pexels: 'key-two' } },
    ]) {
        w.local.set(MEMO_KEY, staleMemo);
        w.syncStore.set('backgroundProviderSettings', next);
        const result = await w.get();
        assert.ok(!w.urls(result).includes(SENTINEL), `设置变化后不能再用旧结果：${JSON.stringify(next)}`);
        assert.ok(result.backgrounds.length > 0);
        assert.notEqual(w.memo().signature, signature, '指纹随设置变化');
    }
});

test('读出旧结果时按当前规则重新过滤地区内容，全被过滤则当作没有结果', async () => {
    const w = world();
    await w.get();
    const memo = w.memo();
    memo.backgrounds = [
        { ...memo.backgrounds[0], location: 'Kyoto', description: '京都 古寺', url: 'https://thumb.example.org/kyoto_old.jpg' },
        memo.backgrounds[1],
    ];
    w.local.set(MEMO_KEY, memo);
    const filtered = await w.get();
    assert.ok(!w.urls(filtered).includes('https://thumb.example.org/kyoto_old.jpg'));
    assert.equal(filtered.backgrounds.length, 1);

    memo.backgrounds = [{ ...memo.backgrounds[0], location: 'Tokyo', description: 'Tokyo night', url: 'https://thumb.example.org/tokyo_old.jpg' }];
    w.local.set(MEMO_KEY, memo);
    w.advance(13 * HOUR); // 源缓存也过期，重建要走网络，才能分辨出结果来自重建
    w.net.generation = 4;
    const rebuilt = await w.get();
    assert.ok(w.urls(rebuilt).every(url => url.includes('_g4_')), '旧结果全被过滤时同步重建');
});

test('首次同时打开多个首页只重建一次', async () => {
    const w = world();
    w.net.hold = deferred();
    const all = [w.get(), w.get(), w.get()];
    await flush();
    w.net.hold.resolve();
    const results = await Promise.all(all);
    assert.equal(w.net.calls.length, 3, '三个页面共用同一次重建（3 个分类请求）');
    assert.deepEqual(w.urls(results[0]), w.urls(results[2]));
});

test('没有旧结果且网络卡住：页面最多等 1.2 秒后拿到兜底图，重建继续并在完成后写入缓存', async () => {
    const w = world();
    w.net.hold = deferred();
    const pending = w.get();
    let settled = false;
    pending.then(() => { settled = true; });
    await flush();
    w.advance(1_000);
    await flush();
    assert.equal(settled, false, '1.2 秒预算内仍在等待真实结果');

    w.advance(250);
    const result = await pending;
    assert.equal(result.source, 'fallback');
    assert.equal(result.mediaMode, 'image');
    assert.ok(result.backgrounds.length > 0);
    assert.equal(w.memo(), undefined, '兜底结果不写入');
    assert.equal(w.pendingTimers(), 0, '等待用的定时器已清理');

    w.net.hold.resolve(); // 网络恢复：后台那次重建完成并写入
    await flush(20);
    assert.ok(w.memo().backgrounds.length > 0);
    const next = await w.get();
    assert.equal(next.source, 'multi');
    assert.ok(w.urls(next).every(url => url.includes('_g1_')));
    assert.equal(w.net.calls.length, 3, '超时没有导致重复发请求');
});

test('进行中的重建超过 60 秒视为卡住：新请求另起一次，不一直陪着卡', async () => {
    const w = world();
    w.net.hold = deferred();
    const first = w.get();
    await flush();
    const afterFirst = w.net.calls.length;
    w.advance(11_000);
    await first;

    const second = w.get();
    await flush();
    assert.equal(w.net.calls.length, afterFirst, '60 秒内共用同一次进行中的重建');
    w.advance(11_000);
    await second;

    w.advance(61_000);
    const third = w.get();
    await flush();
    assert.ok(w.net.calls.length > afterFirst, '卡死超过上限后，新请求另起了一次重建');
    w.advance(11_000);
    assert.equal((await third).source, 'fallback');
    w.net.hold.resolve();
    await flush(30);
});

test('没有启用任何来源时仍返回内置兜底，不写缓存', async () => {
    const w = world({ settings: { enabledSources: [], mediaMode: 'image' } });
    const result = await w.get();
    assert.equal(result.source, 'fallback');
    assert.ok(result.backgrounds.length > 0);
    assert.equal(w.memo(), undefined);
    assert.equal(w.net.calls.length, 0);
});

test('损坏的旧结果被忽略并重建，不抛错', async () => {
    const w = world();
    for (const bad of ['text', { v: 2 }, { v: 1, ts: 'x', signature: 'y', backgrounds: [] }, { v: 1, ts: Date.now(), signature: 'other', backgrounds: [{}] }]) {
        w.local.set(MEMO_KEY, bad);
        const result = await w.get();
        assert.equal(result.source, 'multi');
        assert.ok(result.backgrounds.length > 0);
    }
});
