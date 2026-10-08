import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { readHomeFeed } from '../integrations/youtube-home/feed.mjs';
import serviceModule from '../js/youtube-home.js';
const { YouTubeHomeService } = serviceModule;

// Synthetic response bodies go through the actual pinned SDK parser and request builder.
function video(id, title = '测试视频') {
    return { richItemRenderer: { content: { videoRenderer: {
        videoId: id, title: { simpleText: title }, thumbnail: { thumbnails: [] },
        ownerText: { runs: [{ text: '测试频道', navigationEndpoint: { browseEndpoint: { browseId: 'UCfixture' } } }] },
        lengthText: { simpleText: '12:34' }, viewCountText: { simpleText: '100 次观看' },
    } } } };
}
const more = token => ({ continuationItemRenderer: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN', continuationEndpoint: { continuationCommand: { token, request: 'CONTINUATION_REQUEST_TYPE_BROWSE' } } } });
function firstPage() {
    return { contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { selected: true, content: { richGridRenderer: { contents: [video('AAA00000001'), more('fixture-next')] } } } }] } } };
}
function bootstrap() {
    const device = [];
    device[0] = 'zh-CN'; device[1] = 'US'; device[16] = '2.20260922.00.00'; device[61] = ['fixture-config'];
    return ")]}'" + JSON.stringify([[null, null, [[device], 'fixture-key']]]);
}
function environment(overrides = {}) {
    const config = { LOGGED_IN: true, SESSION_INDEX: '1', DELEGATED_SESSION_ID: 'fixture-channel' };
    const calls = [];
    return {
        config, calls,
        getConfig: key => config[key], getCookie: () => 'SAPISID=fixture-secret',
        fetch: async (request, init) => {
            calls.push({ request, init });
            if (new URL(request.url).pathname === '/sw.js_data') return new Response(bootstrap());
            const body = await request.clone().json();
            return Response.json(body.continuation
                ? { onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [video('AAA00000002')] } }] }
                : firstPage());
        }, ...overrides,
    };
}

test('真实 SDK 获取首页并通过 getContinuation 请求下一页；不请求播放器或其他接口', async () => {
    const env = environment();
    const first = await readHomeFeed({}, env);
    assert.equal(first.items[0].id, 'AAA00000001');
    assert.equal(first.items[0].channel, '测试频道');
    assert.equal(first.items[0].durationLabel, '12:34');
    assert.equal(first.hasMore, true);
    const second = await readHomeFeed({ previous: first.raw, expectedAccount: first.account }, env);
    assert.equal(second.items[0].id, 'AAA00000002');
    assert.equal(second.hasMore, false);
    assert.equal(env.calls.length, 4);
    const request = env.calls[1].request;
    assert.equal((await request.clone().json()).browseId, 'FEwhat_to_watch');
    assert.equal(request.headers.get('x-goog-authuser'), '1');
    assert.equal(request.headers.get('x-goog-pageid'), 'fixture-channel');
    assert.match(request.headers.get('authorization'), /^SAPISIDHASH /);
    for (const call of env.calls) {
        assert.equal(call.init.credentials, 'include');
        assert.equal(call.init.headers.has('cookie'), false);
        assert.equal(call.init.headers.has('origin'), false);
        assert.ok(call.init.signal);
    }
    assert.equal(JSON.stringify(first).includes('fixture-secret'), false);
});

test('未登录或账号切换必须停止，不降级成游客推荐', async () => {
    const env = environment();
    env.config.LOGGED_IN = false;
    await assert.rejects(readHomeFeed({}, env), { code: 'home-login-required' });
    assert.equal(env.calls.length, 0);
    env.config.LOGGED_IN = true;
    await assert.rejects(readHomeFeed({ expectedAccount: 'different' }, env), { code: 'home-account-changed' });
    assert.equal(env.calls.length, 0);
});

test('SDK bootstrap 失败不自研 fallback；超时会终止真实 fetch', async () => {
    let calls = 0;
    await assert.rejects(readHomeFeed({}, environment({ fetch: async () => { calls++; return new Response('bad', { status: 500 }); } })), { code: 'home-network-error' });
    assert.equal(calls, 1);
    const env = environment({ timeoutMs: 10, fetch: (_input, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))) });
    await assert.rejects(readHomeFeed({}, env), { code: 'home-timeout' });
});

test('真实 SDK 解析新版 LockupView 卡片、过滤无视频 ID 的条目', async () => {
    const env = environment();
    const original = env.fetch;
    env.fetch = async (request, init) => {
        if (new URL(request.url).pathname === '/sw.js_data') return original(request, init);
        const data = firstPage();
        data.contents.twoColumnBrowseResultsRenderer.tabs[0].tabRenderer.content.richGridRenderer.contents = [{ richItemRenderer: { content: { lockupViewModel: {
            contentId: 'AAA00000003', contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            contentImage: { thumbnailViewModel: { image: { sources: [] }, overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: '8:45', badgeStyle: 'BADGE_STYLE' } }] } }] } },
            metadata: { lockupMetadataViewModel: { title: { content: '新版首页卡片' }, metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '新版频道' } }] }, { metadataParts: [{ text: { content: '10 万次观看' } }, { text: { content: '2 天前' } }] }] } } } },
            rendererContext: {},
        } } } }];
        return Response.json(data);
    };
    const result = await readHomeFeed({}, env);
    assert.equal(result.items[0].title, '新版首页卡片');
    assert.equal(result.items[0].channel, '新版频道');
    assert.equal(result.items[0].durationLabel, '8:45');
    assert.equal(result.items[0].publishedLabel, '2 天前');
});

const sender = { id: 'fixture', url: 'chrome-extension://fixture/index.html', documentId: 'doc1', tab: { id: 10, windowId: 1 } };
function chromeFixture({ existing = true, read = null } = {}) {
    const removed = [], opened = [], scripts = [];
    const tab = { id: 20, windowId: 1, active: false, status: 'complete', url: 'https://www.youtube.com/', lastAccessed: 10 };
    let calls = 0;
    const api = {
        runtime: { id: 'fixture' },
        tabs: {
            query: async () => existing ? [tab] : [], get: async () => tab,
            create: async options => { opened.push(options); return tab; },
            remove: async id => { removed.push(id); },
        },
        scripting: { executeScript: async options => {
            scripts.push(options);
            if (options.files) return [{}];
            calls++;
            return [{ result: read ? await read(calls) : { ok: true, data: { items: [{ id: 'AAA00000001', title: 'test' }], account: 'a'.repeat(64), hasMore: true, raw: firstPage() } } }];
        } },
    };
    return { api, removed, opened, scripts, tab };
}

test('后台只向工作台返回卡片和不透明游标；已有网页不导航、不关闭', async () => {
    const f = chromeFixture(); const service = new YouTubeHomeService(f.api);
    const first = await service.read({}, sender);
    assert.equal(first.items[0].thumbnail, 'https://i.ytimg.com/vi/AAA00000001/hqdefault.jpg');
    assert.ok(first.cursor);
    assert.equal('raw' in first, false); assert.equal('account' in first, false);
    const second = await service.read({ cursor: first.cursor }, sender);
    assert.notEqual(second.cursor, first.cursor);
    assert.equal(service.sessions.has(first.cursor), false);
    assert.deepEqual(f.removed, []); assert.deepEqual(f.opened, []);
    assert.equal(f.scripts[3].args[0].expectedAccount, 'a'.repeat(64));
});

test('临时标签不激活、完成即关闭；用户激活后保留', async () => {
    const f = chromeFixture({ existing: false });
    await new YouTubeHomeService(f.api).read({}, sender);
    assert.equal(f.opened[0].active, false); assert.deepEqual(f.removed, [20]);
    f.tab.active = true; f.removed.length = 0;
    await new YouTubeHomeService(f.api).read({}, sender);
    assert.deepEqual(f.removed, []);
});

test('游标绑定来源页面和期限，刷新不混合账号或不同工作台', async () => {
    const f = chromeFixture(); const service = new YouTubeHomeService(f.api);
    const first = await service.read({}, sender);
    await assert.rejects(service.read({ cursor: first.cursor }, { ...sender, documentId: 'other' }), { code: 'home-expired' });
    service.sessions.get(first.cursor).expires = 0;
    await assert.rejects(service.read({ cursor: first.cursor }, sender), { code: 'home-expired' });
    await assert.rejects(service.read({}, { ...sender, url: 'https://www.youtube.com/' }), { code: 'home-forbidden' });
});

test('扩展页面没有 sender.tab 时从 Chrome document context 解析来源', async () => {
    const f = chromeFixture();
    f.api.runtime.getContexts = async filter => {
        assert.deepEqual(filter.documentIds, ['doc1']);
        return [{ documentId: 'doc1', tabId: 10 }];
    };
    const result = await new YouTubeHomeService(f.api).read({}, { ...sender, tab: undefined });
    assert.equal(result.items.length, 1);
});

test('关闭工作台后晚到的结果不保留游标，并清理临时标签', async () => {
    let finish; let started;
    const ready = new Promise(resolve => { started = resolve; });
    const f = chromeFixture({ existing: false, read: () => { started(); return new Promise(resolve => { finish = resolve; }); } });
    const service = new YouTubeHomeService(f.api);
    const promise = service.read({}, sender);
    await ready;
    service.release(sender);
    finish({ ok: true, data: { raw: firstPage(), items: [], account: 'a'.repeat(64) } });
    await assert.rejects(promise, { code: 'home-cancelled' });
    assert.equal(service.sessions.size, 0);
    assert.deepEqual(f.removed, [20]);
});

function controllerFixture() {
    const pending = [];
    const context = {
        window: {}, URL, console, setTimeout, clearTimeout,
        chrome: { runtime: { sendMessage: (message, done) => { pending.push({ message, done }); } } },
    };
    vm.runInNewContext(fs.readFileSync(new URL('../js/youtube-controller.js', import.meta.url), 'utf8'), context);
    const controller = context.window.youtubeController;
    const heading = { textContent: '' };
    controller.panel = { querySelector: () => heading };
    controller.stage = { innerHTML: '' };
    controller._syncNav = () => {};
    controller._detachPlayerBridge = () => {};
    controller._setStatus = () => {};
    return { controller, pending, formatDate: context.window.YouTubeWorkbench.compactPublishedDate };
}

test('日期显示月日、跨年短年份；相对日期保留原意，不估算具体日期', () => {
    const { formatDate } = controllerFixture();
    const now = new Date(2026, 8, 22);
    assert.equal(formatDate({ publishedAt: new Date(2026, 8, 21).toISOString() }, now).label, '09-21');
    assert.equal(formatDate({ publishedAt: new Date(2025, 11, 31).toISOString() }, now).label, '25-12-31');
    assert.equal(formatDate({ publishedLabel: '2 天前' }, now).label, '2天前');
    assert.equal(formatDate({ publishedLabel: 'Streamed 3 days ago' }, now).label, '3天前');
    assert.equal(formatDate({ publishedAt: 'invalid', publishedLabel: '1 小時前' }, now).label, '1小時前');
    assert.equal(formatDate({}), null);
});

test('订阅推荐复用紧凑日期布局，批量补齐时长且晚到结果不影响其他页面', async () => {
    const { controller: c, pending } = controllerFixture();
    c.activeView = 'recommended'; c.remoteRequestId = 1;
    c.items = [{ id: 'AAA00000001', kind: 'video', title: '标题', channel: '频道', publishedAt: '2026-09-20T08:00:00Z' }];
    c._renderList(c.items, '为你推荐', false, { compactVideoMeta: true });
    const request = c._enrichRecommendationDurations(1);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].message.params.fields, 'items(id,contentDetails(duration))');
    pending.shift().done({ ok: true, data: { items: [{ id: 'AAA00000001', contentDetails: { duration: 'PT11M11S' } }] } });
    await request;
    assert.ok(c.stage.innerHTML.includes('频道 · 11:11'));
    assert.ok(c.stage.innerHTML.includes('class="yt-card-published"'));
    assert.ok(c.stage.innerHTML.includes('data-yt-play="AAA00000001"'));
    const stale = c._enrichRecommendationDurations(1);
    c.activeView = 'home'; c.remoteRequestId++;
    c.stage.innerHTML = '新的页面';
    pending.shift().done({ ok: true, data: { items: [{ id: 'AAA00000001', contentDetails: { duration: 'PT1H' } }] } });
    await stale;
    assert.equal(c.stage.innerHTML, '新的页面');
});

test('首页日期复用官方批量视频接口，失败保留相对日期，切页后不写回', async () => {
    const { controller: c, pending } = controllerFixture();
    c.auth.connected = true; c.activeView = 'home'; c.remoteRequestId = 1;
    c.items = Array.from({ length: 51 }, (_, i) => ({ id: `AAA00000${String(i).padStart(3, '0')}`, kind: 'video', source: 'youtube-home', publishedLabel: '2天前' }));
    const result = c._enrichHomeDates(c.items, 1);
    assert.equal(pending.length, 2);
    assert.equal(pending[0].message.params.id.split(',').length, 50);
    assert.equal(pending[0].message.resource, 'videos');
    assert.equal(pending[0].message.params.fields, 'items(id,snippet(publishedAt))');
    pending.shift().done({ ok: true, data: { items: [{ id: c.items[0].id, snippet: { publishedAt: '2026-09-20T08:00:00Z' } }] } });
    pending.shift().done({ ok: false, error: { code: 'quota-exceeded' } });
    await result;
    assert.equal(c.items[0].publishedAt, '2026-09-20T08:00:00Z');
    assert.equal(c.items[50].publishedAt, undefined);
    assert.ok(c.stage.innerHTML.includes('class="yt-card-published"'));
    assert.ok(c.stage.innerHTML.includes('>2天前</time>'));
    const stale = c._enrichHomeDates([c.items[50]], 1);
    c.remoteRequestId++;
    pending.shift().done({ ok: true, data: { items: [{ id: c.items[50].id, snippet: { publishedAt: '2026-09-20T08:00:00Z' } }] } });
    await stale;
    assert.equal(c.items[50].publishedAt, undefined);
});

test('首页 TAB 不依赖 OAuth；追加去重、失败保留卡片且可重试', async () => {
    const { controller: c, pending } = controllerFixture();
    const first = c._showView('home', true);
    assert.equal(pending[0].message.action, 'youtube_home_feed');
    assert.equal(c.auth.connected, false);
    pending.shift().done({ ok: true, data: { items: [{ id: 'AAA00000001', kind: 'video', title: '<x>' }], cursor: 'first' } });
    await first;
    assert.ok(c.stage.innerHTML.includes('&lt;x&gt;'));
    const next = c._loadHome(++c.remoteRequestId, true);
    assert.equal(pending[0].message.cursor, 'first');
    pending.shift().done({ ok: true, data: { items: [{ id: 'AAA00000001', kind: 'video' }, { id: 'AAA00000002', kind: 'video' }], cursor: 'second' } });
    await next;
    assert.equal(c.items.length, 2);
    const failed = c._loadHome(++c.remoteRequestId, true);
    pending.shift().done({ ok: false, error: { code: 'home-timeout' } });
    await failed;
    assert.equal(c.items.length, 2);
    assert.equal(c.homeCursor, 'second');
    assert.ok(c.stage.innerHTML.includes('响应超时'));
    assert.ok(c.stage.innerHTML.includes('加载更多'));
});

test('切走后首页晚到结果不能覆盖新页面；账号变更清除旧卡片', async () => {
    const { controller: c, pending } = controllerFixture();
    const first = c._showView('home', true);
    c.remoteRequestId++;
    c.activeView = 'history';
    c.stage.innerHTML = '新页面';
    pending.shift().done({ ok: true, data: { items: [{ id: 'AAA00000001' }], cursor: 'late' } });
    await first;
    assert.equal(c.stage.innerHTML, '新页面');
    assert.equal(c.homeCursor, '');
    c.activeView = 'home'; c.items = [{ id: 'AAA00000001' }]; c.homeCursor = 'old';
    const changed = c._loadHome(++c.remoteRequestId, true);
    pending.shift().done({ ok: false, error: { code: 'home-account-changed' } });
    await changed;
    assert.equal(c.items.length, 0); assert.equal(c.homeCursor, '');
    assert.ok(c.stage.innerHTML.includes('账号已变化'));
});
