const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/huya-core.js');
const { HuyaFollowService, isFollowPage, markerCreatedAt } = require('../js/huya-follow.js');

const UID = '9876543210123';
const EXTENSION_ID = 'extension-id-fixture';
const HOME_URL = `chrome-extension://${EXTENSION_ID}/index.html`;

function domRow(overrides = {}) {
    return {
        uid: '1000001', href: 'https://www.huya.com/520001', cover: '//live-cover.msstatic.com/huyalive/x.jpg', avatar: '//huyaimg.msstatic.com/a.jpg',
        nick: '关注主播', title: '正在直播', live: true, replay: false, viewers: '1.2万', followers: '', schedule: '', ...overrides,
    };
}

function readyPage(items = [domRow(), domRow({ uid: '1000002', href: '/abc123', nick: '另一位', live: false, viewers: '', followers: '3.4万' })]) {
    return { state: 'ready', items, pages: 1, complete: true };
}

function sender(overrides = {}) {
    return { id: EXTENSION_ID, url: HOME_URL, documentId: 'document-1', tab: { id: 1, windowId: 7, incognito: false }, ...overrides };
}

function createEnv(options = {}) {
    const clock = { value: options.start ?? Date.now() };
    const env = {
        clock,
        tabs: new Map(),
        created: [],
        removed: [],
        executed: [],
        cookieQueries: [],
        storage: new Map(),
        storageWrites: 0,
        nextTabId: 100,
        cookie: { value: UID },
    };
    env.cookie = 'cookie' in options ? options.cookie : { value: UID };
    const chrome = {
        runtime: {
            id: EXTENSION_ID,
            getContexts: async ({ documentIds }) => (options.contexts ?? [{ documentId: documentIds[0], tabId: 1 }]),
        },
        tabs: {
            create: async details => {
                if (options.createError) throw new Error('boom raw message');
                const tab = {
                    id: env.nextTabId++, url: '', pendingUrl: details.url, active: Boolean(details.active), windowId: details.windowId,
                    incognito: false, lastAccessed: clock.value, status: 'loading',
                };
                env.created.push({ ...details, id: tab.id });
                env.tabs.set(tab.id, tab);
                env.polls = 0;
                if (!options.neverCommit) setTimeout(() => { if (env.tabs.has(tab.id)) { tab.url = options.commitUrl ? options.commitUrl(details.url) : details.url; } }, options.commitDelay ?? 3);
                return { ...tab };
            },
            get: async id => {
                if (id === 1) return { id: 1, windowId: 7, incognito: Boolean(options.incognito) };
                if (!env.tabs.has(id)) throw new Error('No tab with id');
                return { ...env.tabs.get(id) };
            },
            remove: async id => { env.removed.push(id); env.tabs.delete(id); },
            query: async ({ url }) => {
                const prefix = url.replace(/\*$/, '');
                return [...env.tabs.values()].filter(tab => String(tab.url).startsWith(prefix)).map(tab => ({ ...tab }));
            },
        },
        cookies: {
            getAllCookieStores: async () => (options.stores ?? [{ id: '0', tabIds: [1] }, { id: '1', tabIds: [2] }]),
            get: async details => { env.cookieQueries.push(details); return env.cookie; },
        },
        scripting: {
            executeScript: async injection => {
                env.executed.push(injection);
                if (options.execute) return options.execute(injection, env);
                return [{ result: readyPage() }];
            },
        },
        storage: {
            local: {
                get: async key => ({ [key]: env.storage.get(key) }),
                set: async values => {
                    if (options.storageError) throw new Error('quota');
                    env.storageWrites += 1;
                    for (const [key, value] of Object.entries(values)) env.storage.set(key, structuredClone(value));
                },
                remove: async key => { env.storage.delete(key); },
            },
        },
    };
    const service = new HuyaFollowService(chrome, {
        now: options.fakeClock ? () => clock.value : undefined,
        timing: { poll: 1, commit: 400, operation: 3000, page: 300, minPage: 10, grace: 30, ...(options.timing || {}) },
    });
    return { env, chrome, service };
}

async function rejectsWith(promise, code) {
    await assert.rejects(promise, error => { assert.equal(error.code, code); assert.equal(error.message, code, '错误消息只能是错误码'); return true; });
}

test('读取关注：后台标签页打开虎牙自己的页面，读完关闭，只返回白名单字段', async () => {
    const { env, service } = createEnv();
    const result = await service.read({}, sender());
    assert.equal(result.cached, false);
    assert.equal(result.stale, false);
    assert.equal(result.empty, false);
    assert.equal(result.complete, true);
    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].nick, '关注主播');
    assert.equal(result.items[0].status, 'live');
    assert.equal(result.items[1].followersLabel, '3.4万');

    assert.equal(env.created.length, 1);
    const [created] = env.created;
    assert.equal(created.active, false, '不得抢占当前标签页焦点');
    assert.equal(created.windowId, 7);
    assert.match(created.url, /^https:\/\/www\.huya\.com\/myfollow#tk-follow-\d{10,16}-[0-9a-f-]{36}$/);
    assert.equal(isFollowPage(created.url), true);

    assert.equal(env.executed.length, 1);
    const [injection] = env.executed;
    assert.deepEqual(injection.target, { tabId: created.id });
    assert.equal(injection.world, 'ISOLATED');
    assert.equal(injection.injectImmediately, true);
    assert.equal(injection.func, Core.readFollowPage);
    assert.deepEqual(Object.keys(injection.args[0]).sort(), ['maxItems', 'maxPages', 'timeoutMs']);
    assert.ok(injection.args[0].timeoutMs >= 10 && injection.args[0].timeoutMs <= 300, '页内读取时限受服务配置约束');
    assert.equal(injection.args[0].maxItems, Core.FOLLOW_MAX_ITEMS);
    assert.equal(injection.args[0].maxPages, Core.FOLLOW_MAX_PAGES);

    assert.deepEqual(env.removed, [created.id], '读取完成后关闭自己创建的后台标签页');
    const serialized = JSON.stringify({ result, storage: [...env.storage.entries()] });
    assert.equal(serialized.includes(UID), false, '登录 UID 不得进入返回值或存储');
    assert.equal(/"account":"[0-9a-f]{64}"/.test(serialized), true);
    assert.equal(service.running.size, 0);
});

test('登录判断只查询 udb_uid 这一个 Cookie，并按标签页所属 Cookie 存储区查询', async () => {
    const normal = createEnv();
    await normal.service.read({ mode: 'cache' }, sender());
    assert.deepEqual(normal.env.cookieQueries, [{ url: 'https://www.huya.com/', name: 'udb_uid', storeId: '0' }]);

    const incognito = createEnv({ incognito: true, stores: [{ id: '0', tabIds: [4] }, { id: '1', tabIds: [1] }] });
    await incognito.service.read({ mode: 'cache' }, sender({ tab: { id: 1, windowId: 7, incognito: true } }));
    assert.equal(incognito.env.cookieQueries[0].storeId, '1');
});

test('未登录时不打开任何标签页，直接返回 huya-login-required', async () => {
    for (const cookie of [null, undefined, { value: '' }, { value: '0' }, { value: 'abc' }]) {
        const { env, service } = createEnv({ cookie });
        await rejectsWith(service.read({}, sender()), 'huya-login-required');
        await rejectsWith(service.read({ mode: 'cache' }, sender()), 'huya-login-required');
        assert.equal(env.created.length, 0);
        assert.equal(env.executed.length, 0);
    }
});

test('Cookie API 失败只返回错误码，不泄漏异常原文', async () => {
    const { env, service, chrome } = createEnv();
    chrome.cookies.get = async () => { throw new Error('secret cookie internals'); };
    await rejectsWith(service.read({}, sender()), 'huya-cookie-unavailable');
    assert.equal(env.created.length, 0);
});

test('缓存：期限内直接返回，强制刷新、过期与换账号都重新读取', async () => {
    const start = 1_800_000_000_000;
    const { env, service } = createEnv({ fakeClock: true, start });
    const first = await service.read({}, sender());
    assert.equal(first.cached, false);
    assert.equal(env.created.length, 1);

    env.clock.value = start + 60_000;
    const hit = await service.read({}, sender());
    assert.equal(hit.cached, true);
    assert.equal(hit.stale, false);
    assert.equal(hit.fetchedAt, start);
    assert.equal(env.created.length, 1, '期限内不再打开标签页');

    const forced = await service.read({ force: true }, sender());
    assert.equal(forced.cached, false);
    assert.equal(env.created.length, 2);

    env.clock.value = start + 60_000 + Core.FOLLOW_CACHE_TTL_MS + 1000;
    const stale = await service.read({ mode: 'cache' }, sender());
    assert.equal(stale.cached, true);
    assert.equal(stale.stale, true, '过期缓存仅作为先显示的旧数据');
    assert.equal(env.created.length, 2, 'cache 模式从不打开标签页');
    const refreshed = await service.read({}, sender());
    assert.equal(refreshed.cached, false);
    assert.equal(env.created.length, 3);

    env.cookie = { value: '1234567890' };
    assert.equal(await service.read({ mode: 'cache' }, sender()), null, '换账号不得看到上一账号的关注');
    assert.equal(env.created.length, 3);
});

test('缓存内容被篡改时重新校验，不信任存储中的链接', async () => {
    const { env, service } = createEnv({ fakeClock: true, start: 1_800_000_000_000 });
    await service.read({}, sender());
    const entry = env.storage.get(Core.FOLLOW_CACHE_KEY);
    entry.items[0].url = 'https://evil.example/phish';
    entry.items[0].cover = 'javascript:alert(1)';
    const cached = await service.read({ mode: 'cache' }, sender());
    assert.equal(cached.items[0].url, '');
    assert.equal(cached.items[0].cover, '');
    env.storage.set(Core.FOLLOW_CACHE_KEY, 'corrupt');
    assert.equal(await service.read({ mode: 'cache' }, sender()), null);
});

test('清除缓存只允许新标签页发起', async () => {
    const { env, service } = createEnv();
    await service.read({}, sender());
    assert.ok(env.storage.has(Core.FOLLOW_CACHE_KEY));
    await assert.rejects(service.clear(sender({ id: 'other' })), { code: 'huya-forbidden' });
    assert.ok(env.storage.has(Core.FOLLOW_CACHE_KEY));
    assert.deepEqual(await service.clear(sender()), { ok: true });
    assert.equal(env.storage.has(Core.FOLLOW_CACHE_KEY), false);
});

test('发送方必须是本扩展新标签页', async () => {
    const { env, service } = createEnv();
    const bad = [
        sender({ id: 'other-extension' }),
        sender({ url: `chrome-extension://${EXTENSION_ID}/settings.html` }),
        sender({ url: `chrome-extension://other/index.html` }),
        sender({ url: 'https://www.huya.com/index.html' }),
        sender({ url: 'not a url' }),
        sender({ documentId: undefined, tab: undefined }),
        { id: EXTENSION_ID },
    ];
    for (const item of bad) {
        await rejectsWith(service.read({}, item), 'huya-forbidden');
        assert.throws(() => service.release(item), { code: 'huya-forbidden' });
    }
    assert.equal(env.created.length, 0);
    assert.equal(env.cookieQueries.length, 0);
    assert.deepEqual(service.release(sender()), { ok: true });
});

test('没有 sender.tab 的扩展文档通过受信 documentId 解析来源窗口', async () => {
    const { env, service } = createEnv();
    await service.read({}, sender({ tab: undefined }));
    assert.equal(env.created[0].windowId, 7, '窗口来自受信 documentId 对应的真实标签页');
    const missing = createEnv({ contexts: [] });
    await rejectsWith(missing.service.read({}, sender({ tab: undefined })), 'huya-forbidden');
});

test('同一窗口并发读取返回 huya-busy，不同窗口互不影响', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const { env, service } = createEnv({ execute: async () => { await gate; return [{ result: readyPage() }]; } });
    const first = service.read({}, sender());
    await new Promise(resolve => setTimeout(resolve, 30));
    await rejectsWith(service.read({}, sender()), 'huya-busy');
    const other = service.read({ force: true }, sender({ documentId: 'document-2', tab: { id: 1, windowId: 7, incognito: false } }));
    await new Promise(resolve => setTimeout(resolve, 30));
    release();
    const [one, two] = await Promise.all([first, other]);
    assert.equal(one.items.length, 2);
    assert.equal(two.items.length, 2);
    assert.equal(env.created.length, 2);
    assert.equal(service.running.size, 0);
});

test('页面跳转到其他地址时报告 huya-redirected，并关闭没人看得到的后台标签页', async () => {
    const { env, service } = createEnv({ commitUrl: () => 'https://passport.huya.com/login?from=myfollow' });
    await rejectsWith(service.read({}, sender()), 'huya-redirected');
    assert.equal(env.executed.length, 0, '没有到达关注页就不注入读取脚本');
    assert.deepEqual(env.removed, [env.created[0].id], '重定向后的登录页也是我们创建的后台页，重试不能越攒越多');
    assert.equal(env.tabs.size, 0);

    const late = createEnv({
        execute: async (injection, state) => {
            state.tabs.get(injection.target.tabId).url = 'https://www.huya.com/';
            return [{ result: readyPage() }];
        },
    });
    await rejectsWith(late.service.read({}, sender()), 'huya-redirected');
    assert.equal(late.env.storage.size, 0, '跳转后读到的数据不进入缓存');
    assert.equal(late.env.removed.length, 1);

    const taken = createEnv({
        commitUrl: () => 'https://passport.huya.com/login',
        execute: async () => { throw new Error('不应注入'); },
    });
    const pending = taken.service.read({}, sender());
    pending.catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2));
    taken.env.tabs.get(taken.env.created[0].id).active = true;
    await rejectsWith(pending, 'huya-redirected');
    assert.deepEqual(taken.env.removed, [], '用户已经切换到该页面登录时不能关闭');
});

test('加载失败页与迟迟不提交都有明确错误码并在期限内结束', async () => {
    const failed = createEnv({ commitUrl: () => 'chrome-error://chromewebdata/' });
    await rejectsWith(failed.service.read({}, sender()), 'huya-load-failed');
    assert.deepEqual(failed.env.removed, [failed.env.created[0].id], '错误页同样关闭，不遗留“无法访问此网站”的后台标签页');
    const stuck = createEnv({ neverCommit: true, timing: { commit: 40, operation: 500 } });
    const started = Date.now();
    await rejectsWith(stuck.service.read({}, sender()), 'huya-timeout');
    assert.ok(Date.now() - started < 1500);
    assert.deepEqual(stuck.env.removed.length, 1, '超时后仍关闭未提交的后台标签页');
    assert.equal(stuck.service.running.size, 0);
});

test('页内读取超时、结构变化、异常结果分别映射为受控错误码', async () => {
    const timeout = createEnv({ execute: async () => [{ result: { state: 'timeout', items: [] } }] });
    await rejectsWith(timeout.service.read({}, sender()), 'huya-timeout');
    assert.equal(timeout.env.removed.length, 1);

    const changed = createEnv({ execute: async () => [{ result: readyPage([{ nick: '', href: '' }]) }] });
    await rejectsWith(changed.service.read({}, sender()), 'huya-format-changed');

    const unknownState = createEnv({ execute: async () => [{ result: { state: 'mystery', items: [] } }] });
    await rejectsWith(unknownState.service.read({}, sender()), 'huya-format-changed');

    for (const value of [[], [{}], [{ result: null }], [{ result: 'x' }], null]) {
        const bad = createEnv({ execute: async () => value });
        await rejectsWith(bad.service.read({}, sender()), 'huya-read-failed');
    }

    const leaked = createEnv({ execute: async () => { throw new Error('页面内部：secret-token-xyz'); } });
    await assert.rejects(leaked.service.read({}, sender()), error => {
        assert.equal(error.code, 'huya-read-failed');
        assert.equal(String(error.message).includes('secret'), false);
        return true;
    });
    assert.equal(leaked.env.removed.length, 1);

    const create = createEnv({ createError: true });
    await rejectsWith(create.service.read({}, sender()), 'huya-read-failed');

    const closed = createEnv({ execute: async (injection, state) => { state.tabs.delete(injection.target.tabId); throw new Error('Frame was removed'); } });
    await rejectsWith(closed.service.read({}, sender()), 'huya-tab-closed');
});

test('页内脚本挂起时由服务端超时兜底，不无限等待', async () => {
    const { env, service } = createEnv({ timing: { operation: 2500, page: 40, minPage: 10, grace: 30 }, execute: () => new Promise(() => {}) });
    const started = Date.now();
    await rejectsWith(service.read({}, sender()), 'huya-timeout');
    assert.ok(Date.now() - started < 1000, `应在 page+grace 内结束，实际 ${Date.now() - started}ms`);
    assert.equal(env.removed.length, 1);
    assert.equal(service.running.size, 0);
});

test('页面没有给出列表：返回空结果但不覆盖已有缓存，也不缓存空结果', async () => {
    let mode = 'ready';
    const { env, service } = createEnv({
        fakeClock: true,
        start: 1_800_000_000_000,
        execute: async () => [{ result: mode === 'ready' ? readyPage() : { state: 'empty', items: [], pages: 0, complete: true } }],
    });
    await service.read({}, sender());
    const before = JSON.stringify(env.storage.get(Core.FOLLOW_CACHE_KEY));
    mode = 'empty';
    const empty = await service.read({ force: true }, sender());
    assert.deepEqual([empty.empty, empty.items.length, empty.cached], [true, 0, false]);
    assert.equal(JSON.stringify(env.storage.get(Core.FOLLOW_CACHE_KEY)), before);
    assert.equal(env.removed.length, 2);

    const fresh = createEnv({ execute: async () => [{ result: { state: 'empty', items: [] } }] });
    const none = await fresh.service.read({}, sender());
    assert.equal(none.empty, true);
    assert.equal(fresh.env.storage.size, 0);
});

test('缓存写入失败不影响本次读取结果', async () => {
    const { service } = createEnv({ storageError: true });
    const result = await service.read({}, sender());
    assert.equal(result.items.length, 2);
});

test('窗口关闭释放读取：立即关闭后台标签页、读取以 cancelled 结束且可马上重新读取', async () => {
    let enter;
    const entered = new Promise(resolve => { enter = resolve; });
    let call = 0;
    const { env, service } = createEnv({
        execute: async (injection, state) => {
            call += 1;
            if (call === 1) {
                enter();
                await new Promise(resolve => setTimeout(resolve, 200));
                if (!state.tabs.has(injection.target.tabId)) throw new Error('tab closed');
            }
            return [{ result: readyPage() }];
        },
    });
    const pending = service.read({}, sender());
    pending.catch(() => {});
    await entered;
    assert.deepEqual(service.release(sender()), { ok: true });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(env.removed.length, 1, '释放后立即关闭后台标签页');
    const next = await service.read({ force: true }, sender());
    assert.equal(next.items.length, 2);
    await rejectsWith(pending, 'huya-cancelled');
    assert.equal(service.running.size, 0);
    assert.equal(env.removed.length, 2, '旧读取不会重复关闭新读取的标签页');
});

test('用户已激活或接管后台标签页时不自动关闭', async () => {
    const active = createEnv({ execute: async (injection, state) => { state.tabs.get(injection.target.tabId).active = true; return [{ result: readyPage() }]; } });
    await active.service.read({}, sender());
    assert.deepEqual(active.env.removed, []);

    const touched = createEnv({ execute: async (injection, state) => { state.tabs.get(injection.target.tabId).lastAccessed += 60_000; return [{ result: readyPage() }]; } });
    await touched.service.read({}, sender());
    assert.deepEqual(touched.env.removed, [], '用户切换到过该标签页后再离开，同样不关闭');
});

test('清理服务线程重启遗留的后台标签页：只清理带标记、从未被激活且已超时的', async () => {
    const start = 1_800_000_000_000;
    const { env, service } = createEnv({ fakeClock: true, start, timing: { operation: 3000 } });
    const old = start - 10 * 60_000;
    const add = (id, url, extra = {}) => env.tabs.set(id, { id, url, active: false, incognito: false, lastAccessed: old, ...extra });
    add(10, `https://www.huya.com/myfollow#tk-follow-${old}-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`);
    add(11, `https://www.huya.com/myfollow#tk-follow-${old}-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`, { active: true });
    add(12, `https://www.huya.com/myfollow#tk-follow-${old}-cccccccc-cccc-cccc-cccc-cccccccccccc`, { lastAccessed: old + 120_000 });
    add(13, 'https://www.huya.com/myfollow');
    add(14, `https://www.huya.com/myfollow#tk-follow-${start - 1000}-dddddddd-dddd-dddd-dddd-dddddddddddd`);
    add(15, `https://www.huya.com/myfollow#tk-follow-${old}-eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee`, { incognito: true });
    add(16, `https://www.huya.com/login#tk-follow-${old}-ffffffff-ffff-ffff-ffff-ffffffffffff`);
    add(17, `https://passport.huya.com/login#tk-follow-${old}-99999999-9999-9999-9999-999999999999`);
    add(18, 'https://www.huya.com/l');
    await service.read({}, sender());
    assert.deepEqual(env.removed.filter(id => id < 100).sort((a, b) => a - b), [10, 16], '仅清理标记匹配、未被用户接触、已超过操作时限、同隐私模式的旧标签页，含被同源重定向到登录页的遗留页');
    assert.ok(env.tabs.has(11) && env.tabs.has(12) && env.tabs.has(13) && env.tabs.has(14) && env.tabs.has(15));
    assert.ok(env.tabs.has(17) && env.tabs.has(18), '跨域页面与不带标记的虎牙页面不属于本扩展');
});

test('已有读取在运行时不执行遗留清理，避免误关其他窗口正在使用的后台标签页', async () => {
    const start = 1_800_000_000_000;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let first = true;
    const { env, service } = createEnv({
        fakeClock: true, start,
        execute: async () => { if (first) { first = false; await gate; } return [{ result: readyPage() }]; },
    });
    const old = start - 10 * 60_000;
    const pending = service.read({}, sender());
    await new Promise(resolve => setTimeout(resolve, 30));
    env.tabs.set(10, { id: 10, url: `https://www.huya.com/myfollow#tk-follow-${old}-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, active: false, incognito: false, lastAccessed: old });
    await service.read({}, sender({ documentId: 'document-2' }));
    assert.equal(env.removed.includes(10), false);
    release();
    await pending;
});

test('标记时间解析与关注页判断', () => {
    assert.equal(markerCreatedAt('https://www.huya.com/myfollow#tk-follow-1800000000000-abc'), 1800000000000);
    assert.equal(markerCreatedAt('https://www.huya.com/myfollow'), 0);
    assert.equal(markerCreatedAt(''), 0);
    assert.equal(isFollowPage('https://www.huya.com/myfollow'), true);
    assert.equal(isFollowPage('https://www.huya.com/myfollow/#x'), true);
    for (const bad of ['https://www.huya.com/', 'https://www.huya.com/myfollow/x', 'https://m.huya.com/myfollow', 'http://www.huya.com/myfollow', 'https://www.huya.com.evil.example/myfollow', '', undefined]) assert.equal(isFollowPage(bad), false, String(bad));
});
