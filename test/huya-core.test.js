const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/huya-core.js');

// 以下数据只保留公开接口的字段形状，主播名称等均为虚构，不保存真实直播间资料。
function liveRow(overrides = {}) {
    return {
        lUid: 1000001,
        lYyid: 2000001,
        sNick: '测试主播',
        sAvatar180: 'http://huyaimg.msstatic.com/avatar/1000/aa/avatar.jpg?1692469066',
        lProfileRoom: 520001,
        sPrivateHost: '520001',
        sGameFullName: '英雄联盟',
        lUserCount: 123456,
        lTotalCount: 120000,
        sIntroduction: '今天一起上分',
        sRoomName: '',
        sScreenshot: 'http://live-cover.msstatic.com/huyalive/1000-1000-0-0-1/20261011/cover.jpg',
        iIsSecret: 0,
        iIsRoomPay: 0,
        iScreenType: 1,
        ...overrides,
    };
}

test('房间域名规则与虎牙页面 createRoomHost 一致', () => {
    assert.equal(Core.createRoomHost('abc123', 520001, 1), 'abc123');
    assert.equal(Core.createRoomHost('520001', 520001, 1), '520001');
    assert.equal(Core.createRoomHost('', 0, 777), 'yy/777');
    assert.equal(Core.createRoomHost('9999', '0', 777), 'yy/9999');
    assert.equal(Core.createRoomHost('', '0', ''), '');
    assert.equal(Core.createRoomHost('../evil', 1, 1), '', '含路径字符的私有域名不能进入链接');
    assert.equal(Core.createRoomHost('a b', 1, 1), '');
});

test('只接受虎牙自身房间、yy 和视频页链接，并判断能否使用官方嵌入', () => {
    assert.deepEqual(Core.parseRoomHref('https://www.huya.com/520001'), { kind: 'room', host: '520001', path: '520001' });
    assert.deepEqual(Core.parseRoomHref('//www.huya.com/abcDEF/'), { kind: 'room', host: 'abcDEF', path: 'abcDEF' });
    assert.deepEqual(Core.parseRoomHref('/yy/123456'), { kind: 'yy', host: 'yy/123456', path: 'yy/123456' });
    assert.deepEqual(Core.parseRoomHref('https://www.huya.com/video/u/123'), { kind: 'video', host: '', path: 'video/u/123' });
    for (const bad of [
        'https://evil.example/520001', 'https://www.huya.com.evil.example/520001', 'https://user@www.huya.com/520001',
        'https://www.huya.com:8443/520001', 'javascript:alert(1)', 'https://www.huya.com/a/b/c', 'https://www.huya.com/',
        'https://www.huya.com/yy/abc', 'https://www.huya.com/%2e%2e', '',
    ]) assert.equal(Core.parseRoomHref(bad), null, bad);
    assert.equal(Core.roomUrl('yy/42'), 'https://www.huya.com/yy/42');
    assert.equal(Core.roomUrl('../x'), '');
    assert.equal(Core.embedUrl('520001'), 'https://liveshare.huya.com/iframe/520001');
    assert.equal(Core.embedUrl('abc123'), 'https://liveshare.huya.com/iframe/abc123');
    for (const host of ['yy/42', 'a_b', '', 'x'.repeat(65), 'a/b', '../x']) assert.equal(Core.embedUrl(host), '', host);
});

test('封面只允许虎牙图片域名并升级为 HTTPS，可缩放域名带宽度参数', () => {
    const cover = Core.thumbnail('http://live-cover.msstatic.com/huyalive/a/b.jpg');
    assert.equal(cover, 'https://live-cover.msstatic.com/huyalive/a/b.jpg?x-oss-process=image/resize,limit_0,m_fill,w_320,h_180/sharpen,80/format,jpg/interlace,1/quality,q_85');
    const kept = 'https://live-cover.msstatic.com/huyalive/a/b.jpg?x-oss-process=image/resize,w_338,h_190';
    assert.equal(Core.thumbnail(kept), kept, '已有缩放参数时不重复追加');
    assert.equal(Core.thumbnail('//a.msstatic.com/huya/main/assets/img/default_screenshot.jpg'), 'https://a.msstatic.com/huya/main/assets/img/default_screenshot.jpg');
    assert.equal(Core.safeImage('http://huyaimg.msstatic.com/avatar/a.jpg?1692469066'), 'https://huyaimg.msstatic.com/avatar/a.jpg?1692469066');
    for (const bad of ['https://evil.example/a.jpg', 'https://huya.com.evil.example/a.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://user:pw@live-cover.msstatic.com/a.jpg', 'https://live-cover.msstatic.com:8443/a.jpg', 'ftp://live-cover.msstatic.com/a.jpg', '']) {
        assert.equal(Core.safeImage(bad), '', bad);
        assert.equal(Core.thumbnail(bad), '', bad);
    }
});

test('人数文本按中文单位解析，展示统一为万/亿', () => {
    assert.equal(Core.parseCount('123'), 123);
    assert.equal(Core.parseCount('1,234'), 1234);
    assert.equal(Core.parseCount('12.3万'), 123000);
    assert.equal(Core.parseCount('1.5亿'), 150000000);
    assert.equal(Core.parseCount('2w'), 20000);
    assert.equal(Core.parseCount('5.6万人'), 56000);
    for (const bad of ['', '热度', '12.3万+', '-1', 'NaN', null, undefined]) assert.equal(Core.parseCount(bad), null, String(bad));
    assert.equal(Core.formatCount(999), '999');
    assert.equal(Core.formatCount(10000), '1万');
    assert.equal(Core.formatCount(123456), '12.3万');
    assert.equal(Core.formatCount(100000000), '1亿');
    assert.equal(Core.formatCount(-1), '');
    assert.equal(Core.formatCount(Number.NaN), '');
});

test('推荐接口地址只由受控整数拼接，分类 ID 与页码越界立即拒绝', () => {
    assert.equal(Core.buildLiveListUrl({ gid: 0, page: 1 }), 'https://live.cdn.huya.com/liveHttpUI/getLiveList?iGid=0&iPageNo=1&iPageSize=120');
    assert.equal(Core.buildLiveListUrl({ gid: 2336, page: 3 }), 'https://live.cdn.huya.com/liveHttpUI/getLiveList?iGid=2336&iPageNo=3&iPageSize=120');
    for (const gid of [-1, 1.5, '1&x=1', Number.NaN, 1e12]) assert.throws(() => Core.buildLiveListUrl({ gid, page: 1 }), { code: 'huya-invalid-category' }, String(gid));
    for (const page of [0, -1, 1.2, 9, '2;', Number.NaN]) assert.throws(() => Core.buildLiveListUrl({ gid: 0, page }), { code: 'huya-invalid-page' }, String(page));
    assert.equal(Core.categoryById('wzry').gid, 2336);
    assert.equal(Core.categoryById('unknown').id, 'hot');
    assert.ok(Object.isFrozen(Core.CATEGORIES));
    assert.equal(new Set(Core.CATEGORIES.map(category => category.id)).size, Core.CATEGORIES.length);
});

test('推荐列表投影为白名单字段，去重并拒绝不可识别条目', () => {
    const result = Core.normalizeLiveList({
        iPageNo: 2, iTotalPage: 9,
        vList: [
            liveRow(),
            liveRow(),
            liveRow({ lUid: 1000002, sNick: '字母房间', sPrivateHost: 'abc123', lProfileRoom: 520002 }),
            liveRow({ lUid: 1000003, sNick: '纯 YY', sPrivateHost: '', lProfileRoom: 0, lYyid: 888 }),
            liveRow({ lUid: 1000004, sNick: '付费房', iIsRoomPay: 1 }),
            liveRow({ lUid: 1000005, sNick: '下划线', sPrivateHost: 'a_b', lProfileRoom: 1 }),
            liveRow({ lUid: 1000006, sNick: '' }),
            liveRow({ lUid: 'x', sNick: '坏 UID', sPrivateHost: '', lProfileRoom: 0, lYyid: 0 }),
            null,
            'bad',
        ],
    });
    assert.equal(result.page, 2);
    assert.equal(result.totalPages, 9);
    const byId = Object.fromEntries(result.items.map(item => [item.id, item]));
    assert.deepEqual(Object.keys(byId).sort(), ['u1000001', 'u1000002', 'u1000003', 'u1000004', 'u1000005']);
    const first = byId.u1000001;
    assert.equal(first.nick, '测试主播');
    assert.equal(first.title, '今天一起上分');
    assert.equal(first.game, '英雄联盟');
    assert.equal(first.viewers, 123456);
    assert.equal(first.viewersLabel, '12.3万');
    assert.equal(first.status, 'live');
    assert.equal(first.url, 'https://www.huya.com/520001');
    assert.equal(first.embedHost, '520001');
    assert.equal(first.avatar, 'https://huyaimg.msstatic.com/avatar/1000/aa/avatar.jpg?1692469066');
    assert.match(first.cover, /^https:\/\/live-cover\.msstatic\.com\/.+x-oss-process=image\/resize/);
    assert.equal(byId.u1000002.url, 'https://www.huya.com/abc123');
    assert.equal(byId.u1000002.embedHost, 'abc123');
    assert.equal(byId.u1000003.url, 'https://www.huya.com/yy/888');
    assert.equal(byId.u1000003.embedHost, '', 'yy 路径没有官方嵌入入口，只能在虎牙打开');
    assert.equal(byId.u1000004.locked, true);
    assert.equal(byId.u1000004.embedHost, '', '付费或加密房间不嵌入');
    assert.equal(byId.u1000005.url, 'https://www.huya.com/a_b');
    assert.equal(byId.u1000005.embedHost, '', '含下划线的域名不匹配官方嵌入路径');
    assert.equal(JSON.stringify(result).includes('sScreenshot'), false, '不得透传原始字段');
});

test('推荐接口返回异常结构时给出格式变化错误，不冒充空列表', () => {
    for (const payload of [null, undefined, 'x', {}, { vList: 'x' }, []]) assert.throws(() => Core.normalizeLiveList(payload), { code: 'huya-format-changed' });
    assert.deepEqual(Core.normalizeLiveList({ vList: [] }).items, []);
});

test('文本清理会去掉控制字符与双向覆盖字符并限制长度', () => {
    assert.equal(Core.text('  a\u202eb\u0000 c\n\td  '), 'a b c d');
    assert.equal(Core.text('x'.repeat(500), 10), 'xxxxxxxxxx');
    assert.equal(Core.text(null), '');
    const result = Core.normalizeLiveList({ vList: [liveRow({ sNick: '主播\u202e反转', sIntroduction: '标题\u200b隐藏' })] });
    assert.equal(result.items[0].nick, '主播 反转');
    assert.equal(result.items[0].title, '标题 隐藏');
});

test('mergeUnique 保持先后顺序、跨页去重并限制总量', () => {
    const merged = Core.mergeUnique([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }, null, { id: 'd' }], 3);
    assert.deepEqual(merged.map(item => item.id), ['a', 'b', 'c']);
});

function domRow(overrides = {}) {
    return {
        uid: '1000001', href: 'https://www.huya.com/520001', cover: '//live-cover.msstatic.com/huyalive/x.jpg?x-oss-process=image/resize,w_338,h_190',
        avatar: 'http://huyaimg.msstatic.com/avatar/x.jpg', nick: '关注主播', title: '正在直播', live: true, replay: false,
        viewers: '12.3万', followers: '', schedule: '', ...overrides,
    };
}

test('关注快照按页面状态投影：直播、重播、未开播及人数标签', () => {
    const snapshot = Core.normalizeFollowSnapshot({
        items: [
            domRow(),
            domRow({ uid: '1000002', href: '/abc123', nick: '重播主播', live: false, replay: true, viewers: '', followers: '8.5万' }),
            domRow({ uid: '1000003', href: 'https://www.huya.com/video/u/1000003', nick: '未开播', live: false, viewers: '', followers: '1234', schedule: '周六 20:00 开播',
                cover: '//a.msstatic.com/huya/main/assets/img/default_screenshot.jpg' }),
            domRow({ uid: '1000001' }),
        ],
        complete: true,
    });
    assert.equal(snapshot.complete, true);
    assert.equal(snapshot.items.length, 3);
    const [live, replay, offline] = snapshot.items;
    assert.equal(live.status, 'live');
    assert.equal(live.viewersLabel, '12.3万');
    assert.equal(live.embedHost, '520001');
    assert.equal(live.cover.startsWith('https://live-cover.msstatic.com/'), true);
    assert.equal(replay.status, 'replay');
    assert.equal(replay.followersLabel, '8.5万');
    assert.equal(replay.embedHost, 'abc123');
    assert.equal(replay.viewersLabel, '');
    assert.equal(offline.status, 'offline');
    assert.equal(offline.followersLabel, '1234');
    assert.equal(offline.embedHost, '', '未开播主播不嵌入');
    assert.equal(offline.url, 'https://www.huya.com/video/u/1000003');
    assert.equal(offline.cover, '', '占位截图不是真实封面');
    assert.equal(offline.schedule, '周六 20:00 开播');
    const groups = Core.groupFollowItems(snapshot.items);
    assert.deepEqual([groups.live.length, groups.replay.length, groups.offline.length], [1, 1, 1]);
});

test('关注快照拒绝外域链接与伪造图片，页面结构变化不显示为“没有关注”', () => {
    const snapshot = Core.normalizeFollowSnapshot({
        items: [
            domRow({ href: 'https://evil.example/phish', nick: '外链' }),
            domRow({ uid: '1000009', nick: '外图', cover: 'https://evil.example/c.jpg', avatar: 'javascript:alert(1)' }),
        ],
    });
    assert.equal(snapshot.items.length, 2);
    assert.equal(snapshot.items[0].url, '', '外域链接被丢弃，界面不提供跳转');
    assert.equal(snapshot.items[1].cover, '');
    assert.equal(snapshot.items[1].avatar, '');
    assert.throws(() => Core.normalizeFollowSnapshot({ items: [{ nick: '', href: '' }] }), { code: 'huya-format-changed' });
    assert.throws(() => Core.normalizeFollowSnapshot({ items: Array.from({ length: 400 }, (_, index) => domRow({ uid: String(index + 1) })) }), { code: 'huya-format-changed' });
    for (const bad of [null, {}, { items: 'x' }]) assert.throws(() => Core.normalizeFollowSnapshot(bad), { code: 'huya-format-changed' });
    assert.deepEqual(Core.normalizeFollowSnapshot({ items: [] }).items, []);
});

test('关注缓存按账号隔离，并重新校验存储内容', () => {
    const now = 1_800_000_000_000;
    const account = 'a'.repeat(64);
    const items = Core.normalizeFollowSnapshot({ items: [domRow()] }).items;
    const entry = { account, fetchedAt: now - 1000, items, complete: true };
    const restored = Core.sanitizeFollowCache(entry, account, now);
    assert.equal(restored.items.length, 1);
    assert.equal(restored.items[0].nick, '关注主播');
    assert.equal(restored.items[0].viewersLabel, '12.3万');
    assert.equal(restored.items[0].url, 'https://www.huya.com/520001');
    assert.equal(Core.sanitizeFollowCache(entry, 'b'.repeat(64), now), null, '换账号不得读取旧缓存');
    assert.equal(Core.sanitizeFollowCache({ ...entry, fetchedAt: now + 3_600_000 }, account, now), null, '未来时间视为损坏');
    assert.equal(Core.sanitizeFollowCache({ ...entry, fetchedAt: 'x' }, account, now), null);
    assert.equal(Core.sanitizeFollowCache({ ...entry, items: 'x' }, account, now), null);
    assert.equal(Core.sanitizeFollowCache({ ...entry, items: Array.from({ length: 301 }, () => items[0]) }, account, now), null);
    assert.equal(Core.sanitizeFollowCache(null, account, now), null);
    const tampered = Core.sanitizeFollowCache({ ...entry, items: [{ ...items[0], url: 'https://evil.example/x', cover: 'https://evil.example/c.jpg', avatar: 'data:text/html,x' }] }, account, now);
    assert.equal(tampered.items[0].url, '');
    assert.equal(tampered.items[0].cover, '');
    assert.equal(tampered.items[0].avatar, '');
});

test('登录 Cookie 只接受正整数 UID', () => {
    assert.equal(Core.parseLoginCookie('1234567890'), '1234567890');
    for (const bad of ['', '0', '-1', 'abc', '12 34', undefined, null, '1'.repeat(30), '012']) assert.equal(Core.parseLoginCookie(bad), '', String(bad));
});

// ---- readFollowPage：页内读取函数，用与虎牙 React 页面同结构的替身 DOM 验证 ----

function fakeElement(attributes = {}, text = '', children = {}) {
    return {
        textContent: text,
        classList: { contains: name => (attributes.class || '').split(/\s+/).includes(name) },
        getAttribute: name => (name in attributes ? attributes[name] : null),
        querySelector: selector => children[selector] || null,
    };
}

function fakeRow(data) {
    const children = {
        'a.video-info': fakeElement({ href: data.href }),
        'a.nick': fakeElement({ href: data.href }, data.nick),
        'a.intro': fakeElement({}, data.title || ''),
        'img.pic': fakeElement({ src: data.cover || '' }),
        'a.avatar img': fakeElement({ src: data.avatar || '' }),
    };
    if (data.live) children['.tag-living'] = fakeElement({}, '直播中');
    if (data.replay) children['.tag-replay'] = fakeElement({}, '重播中');
    if (data.live) children['.num.total'] = fakeElement({}, data.count || '');
    else children['.num.activity'] = fakeElement({}, data.count || '');
    if (data.schedule) children['.schedule-msg'] = fakeElement({}, data.schedule);
    return { ...fakeElement({ 'data-lp': String(data.uid) }, '', children) };
}

function installDocument({ pages = [], emptyAfter = null, readyAfterPolls = 0, clickDelay = 5, stuck = false, header = true }) {
    const state = { loaded: [], pageIndex: 0, polls: 0, clicks: 0, headerClicks: 0, empty: false };
    const more = fakeElement({ class: 'btn-more' });
    const moreState = { all: false };
    more.classList = { contains: name => name === 'all' && moreState.all };
    more.click = () => {
        state.clicks += 1;
        if (stuck || state.pageIndex >= pages.length) return;
        const index = state.pageIndex;
        state.pageIndex += 1;
        setTimeout(() => {
            state.loaded.push(...pages[index]);
            if (state.pageIndex >= pages.length) moreState.all = true;
        }, clickDelay);
    };
    const headerMore = { click: () => { state.headerClicks += 1; } };
    const root = {
        querySelectorAll: selector => {
            if (selector !== 'li.subscribe-live-item') return [];
            state.polls += 1;
            if (state.polls <= readyAfterPolls) return [];
            if (!state.loaded.length && pages.length && !state.started) {
                state.started = true;
                state.loaded.push(...pages[0]);
                state.pageIndex = 1;
                if (pages.length === 1) moreState.all = true;
            }
            return state.loaded.map(fakeRow);
        },
        querySelector: selector => {
            if (selector === '.btn-more') return pages.length > 1 ? more : null;
            if (selector === '.subscribe-list-none') return emptyAfter !== null && state.polls >= emptyAfter ? { textContent: '还没有关注' } : null;
            return null;
        },
    };
    const previous = globalThis.document;
    globalThis.document = {
        getElementById: id => (id === 'J_MOD_LIST' ? root : null),
        querySelectorAll: () => [],
        querySelector: selector => (selector === '.btn-more' && header ? headerMore : null),
    };
    return { state, restore: () => { globalThis.document = previous; } };
}

function rowsFor(start, count, extra = {}) {
    return Array.from({ length: count }, (_, index) => ({
        uid: start + index, href: `https://www.huya.com/${start + index}`, nick: `主播${start + index}`, title: '标题',
        cover: '//live-cover.msstatic.com/x.jpg', avatar: '//huyaimg.msstatic.com/a.jpg', live: index % 2 === 0, count: '1.2万', ...extra,
    }));
}

test('readFollowPage 分页点击页面自己的“加载更多”，直到“已加载完”并只读取列表容器', async () => {
    const env = installDocument({ pages: [rowsFor(1, 3), rowsFor(10, 3), rowsFor(20, 2)] });
    try {
        const result = await Core.readFollowPage({ pollMs: 2, timeoutMs: 2000 });
        assert.equal(result.state, 'ready');
        assert.equal(result.items.length, 8);
        assert.equal(result.pages, 3);
        assert.equal(result.complete, true);
        assert.equal(env.state.clicks, 2);
        assert.equal(env.state.headerClicks, 0, '不得误点页面其他区域的同名按钮');
        assert.deepEqual(result.items[0], {
            uid: '1', href: 'https://www.huya.com/1', cover: '//live-cover.msstatic.com/x.jpg', avatar: '//huyaimg.msstatic.com/a.jpg',
            nick: '主播1', title: '标题', live: true, replay: false, viewers: '1.2万', followers: '', schedule: '',
        });
        assert.equal(result.items[1].live, false);
        assert.equal(result.items[1].followers, '1.2万');
        Core.normalizeFollowSnapshot(result);
    } finally { env.restore(); }
});

test('readFollowPage 在页面延迟渲染后读取，空列表提示立即返回 empty', async () => {
    const delayed = installDocument({ pages: [rowsFor(1, 2)], readyAfterPolls: 4 });
    try {
        const result = await Core.readFollowPage({ pollMs: 2, timeoutMs: 2000 });
        assert.equal(result.state, 'ready');
        assert.equal(result.items.length, 2);
        assert.equal(result.complete, true);
        assert.equal(delayed.state.clicks, 0);
    } finally { delayed.restore(); }
    const empty = installDocument({ pages: [], emptyAfter: 3 });
    try {
        const result = await Core.readFollowPage({ pollMs: 2, timeoutMs: 2000 });
        assert.deepEqual(result, { state: 'empty', items: [], pages: 0, complete: true });
    } finally { empty.restore(); }
});

test('readFollowPage 页面一直没有列表或空提示时按时限返回 timeout', async () => {
    const env = installDocument({ pages: [] });
    try {
        const started = Date.now();
        const result = await Core.readFollowPage({ pollMs: 5, timeoutMs: 60 });
        assert.equal(result.state, 'timeout');
        assert.equal(result.complete, false);
        assert.ok(Date.now() - started < 1000);
    } finally { env.restore(); }
});

test('readFollowPage 受条目数、页数与点击无响应限制，不会无限点击', async () => {
    const capped = installDocument({ pages: [rowsFor(1, 5), rowsFor(10, 5), rowsFor(20, 5), rowsFor(30, 5)] });
    try {
        const result = await Core.readFollowPage({ pollMs: 2, timeoutMs: 2000, maxItems: 8 });
        assert.equal(result.items.length, 8, '截断到条目上限');
        assert.equal(result.complete, false);
        assert.ok(capped.state.clicks <= 2);
    } finally { capped.restore(); }
    const paged = installDocument({ pages: [rowsFor(1, 2), rowsFor(10, 2), rowsFor(20, 2), rowsFor(30, 2)] });
    try {
        const result = await Core.readFollowPage({ pollMs: 2, timeoutMs: 2000, maxPages: 2 });
        assert.equal(result.pages, 2);
        assert.equal(result.items.length, 4);
        assert.equal(result.complete, false);
        assert.equal(paged.state.clicks, 1);
    } finally { paged.restore(); }
    const stuck = installDocument({ pages: [rowsFor(1, 2), rowsFor(10, 2)], stuck: true });
    try {
        const started = Date.now();
        const result = await Core.readFollowPage({ pollMs: 5, timeoutMs: 120 });
        assert.equal(result.state, 'ready');
        assert.equal(result.items.length, 2);
        assert.equal(result.complete, false, '点击无响应不能宣称已读完');
        assert.equal(stuck.state.clicks, 1);
        assert.ok(Date.now() - started < 1500);
    } finally { stuck.restore(); }
});

test('readFollowPage 可序列化注入：不引用模块作用域变量', () => {
    const source = Core.readFollowPage.toString();
    const isolated = new Function(`return (${source});`)();
    assert.equal(typeof isolated, 'function');
    for (const forbidden of ['HuyaCore', 'ORIGIN', 'FOLLOW_', 'require(', 'module.', 'chrome.', 'fetch(', 'XMLHttpRequest', 'cookie', 'localStorage']) {
        assert.equal(source.includes(forbidden), false, `页内函数不应包含 ${forbidden}`);
    }
});

// ---- enterTheaterPage：弹窗里的房间页点虎牙自己的“剧场模式”按钮。替身 DOM 复现真实页面实测的时序：
// 按钮 DOM 先出现，行内 display 被设为 block 时点击处理函数才绑定；点击后按钮变成 player-narrowpage、body 带 mode-page-theater，再点一次则退出。 ----

function classTracker(initial = []) {
    const set = new Set(initial);
    return { set, classList: { contains: name => set.has(name) } };
}

function installTheaterDocument({ buttonAfterMs = 0, displayAfterMs = 0, bindAfterMs = 0, bodyClasses = [], buttonClasses = ['player-fullpage-btn'], ignoreClicks = false, bodyAfterMs = 0 } = {}) {
    const started = Date.now();
    const bodyState = classTracker(bodyClasses);
    const button = { ...classTracker(buttonClasses), style: { display: '' }, clicks: 0, clickTimes: [] };
    button.click = () => {
        button.clicks += 1;
        button.clickTimes.push(Date.now() - started);
        if (ignoreClicks || Date.now() - started < bindAfterMs) return;
        // 与虎牙播放器脚本一致：已在剧场模式则退出，否则进入。
        if (button.set.has('player-narrowpage')) {
            button.set.delete('player-narrowpage');
            button.set.add('player-fullpage-btn');
            bodyState.set.delete('mode-page-theater');
        } else {
            button.set.delete('player-fullpage-btn');
            button.set.add('player-narrowpage');
            bodyState.set.add('mode-page-theater');
        }
    };
    const lookups = [];
    const previous = globalThis.document;
    globalThis.document = {
        // 页面刚开始解析时 body 还不存在；注入发生在文档开始阶段，函数不能因此抛错。
        get body() { return Date.now() - started < bodyAfterMs ? null : bodyState; },
        getElementById: id => {
            lookups.push(id);
            if (id !== 'player-fullpage-btn' || Date.now() - started < buttonAfterMs) return null;
            if (Date.now() - started >= displayAfterMs && !button.style.display) button.style.display = 'block';
            return button;
        },
        querySelector: () => { throw new Error('只应通过 id 找按钮'); },
        querySelectorAll: () => { throw new Error('只应通过 id 找按钮'); },
    };
    return { button, bodyState, lookups, started, restore: () => { globalThis.document = previous; } };
}

const FAST_THEATER = { timeoutMs: 1500, pollMs: 4, retryMs: 40, maxClicks: 3 };

test('enterTheaterPage 等播放器把按钮显示出来（行内 display 被设置）后才点，只点一次并核对已进入剧场', async () => {
    const env = installTheaterDocument({ buttonAfterMs: 10, displayAfterMs: 60, bindAfterMs: 60 });
    try {
        const result = await Core.enterTheaterPage(FAST_THEATER);
        assert.deepEqual(result, { state: 'entered', clicks: 1 });
        assert.equal(env.button.clicks, 1);
        assert.ok(env.button.clickTimes[0] >= 55, `按钮尚未显示时不得点击：首次点击在 ${env.button.clickTimes[0]} ms`);
        assert.ok(env.button.set.has('player-narrowpage'));
        assert.ok(env.bodyState.set.has('mode-page-theater'));
        assert.deepEqual([...new Set(env.lookups)], ['player-fullpage-btn'], '只查找这一个按钮');
        await new Promise(resolve => setTimeout(resolve, 120));
        assert.equal(env.button.clicks, 1, '成功后不得再点（再点会退出剧场模式）');
    } finally { env.restore(); }
});

test('enterTheaterPage 已在剧场模式（用户自己先点了，或聊天叠在画面上的 mode-page-full）时不点击', async () => {
    const byButton = installTheaterDocument({ displayAfterMs: 0, buttonClasses: ['player-narrowpage'] });
    try {
        assert.deepEqual(await Core.enterTheaterPage(FAST_THEATER), { state: 'already', clicks: 0 });
        assert.equal(byButton.button.clicks, 0);
    } finally { byButton.restore(); }
    const byBody = installTheaterDocument({ bodyClasses: ['mode-page-full'] });
    try {
        assert.deepEqual(await Core.enterTheaterPage(FAST_THEATER), { state: 'already', clicks: 0 });
        assert.equal(byBody.button.clicks, 0);
    } finally { byBody.restore(); }
    const byTheaterClass = installTheaterDocument({ bodyClasses: ['mode-page-theater'], buttonAfterMs: 5000 });
    try {
        assert.deepEqual(await Core.enterTheaterPage(FAST_THEATER), { state: 'already', clicks: 0 }, '按钮还没出现，页面已经是剧场布局');
    } finally { byTheaterClass.restore(); }
});

test('enterTheaterPage 点击后没生效（处理函数尚未绑定）才在间隔后重试，生效后立即停止', async () => {
    const env = installTheaterDocument({ displayAfterMs: 0, bindAfterMs: 90 });
    try {
        const result = await Core.enterTheaterPage({ ...FAST_THEATER, maxClicks: 5 });
        assert.equal(result.state, 'entered');
        assert.equal(result.clicks, env.button.clicks);
        assert.ok(result.clicks >= 2 && result.clicks <= 5, `点击 ${result.clicks} 次`);
        const times = env.button.clickTimes;
        assert.ok(times.slice(0, -1).every(time => time < 90), '处理函数绑定之前的点击都不生效');
        assert.ok(times[times.length - 1] >= 90, '最后一次点击发生在绑定之后，也是唯一生效的一次');
        for (let index = 1; index < env.button.clickTimes.length; index += 1) {
            assert.ok(env.button.clickTimes[index] - env.button.clickTimes[index - 1] >= 35, '两次点击之间必须留出核对时间');
        }
        assert.ok(env.button.set.has('player-narrowpage'));
        const clicks = env.button.clicks;
        await new Promise(resolve => setTimeout(resolve, 120));
        assert.equal(env.button.clicks, clicks, '生效后不再点击');
    } finally { env.restore(); }
});

test('enterTheaterPage 点击次数有上限：始终不生效时返回 unconfirmed，不会无限点击或来回切换', async () => {
    const env = installTheaterDocument({ ignoreClicks: true });
    try {
        const started = Date.now();
        const result = await Core.enterTheaterPage({ ...FAST_THEATER, timeoutMs: 5000 });
        assert.deepEqual(result, { state: 'unconfirmed', clicks: 3 });
        assert.equal(env.button.clicks, 3);
        assert.ok(Date.now() - started < 1000, '最后一次点击留足核对时间后就返回，不等满超时');
    } finally { env.restore(); }
});

test('enterTheaterPage 按钮一直没被显示、或页面标记认不出来时不盲点，按时限返回 timeout', async () => {
    const hidden = installTheaterDocument({ displayAfterMs: 99999 });
    try {
        const started = Date.now();
        const result = await Core.enterTheaterPage({ ...FAST_THEATER, timeoutMs: 80 });
        assert.deepEqual(result, { state: 'timeout', clicks: 0 });
        assert.equal(hidden.button.clicks, 0);
        assert.ok(Date.now() - started < 1000);
    } finally { hidden.restore(); }
    const none = installTheaterDocument({ buttonAfterMs: 99999 });
    try {
        assert.deepEqual(await Core.enterTheaterPage({ ...FAST_THEATER, timeoutMs: 60 }), { state: 'timeout', clicks: 0 }, '没有播放器的房间（如未开播）静默放弃');
    } finally { none.restore(); }
    const renamed = installTheaterDocument({ buttonClasses: ['some-new-class'] });
    try {
        assert.deepEqual(await Core.enterTheaterPage({ ...FAST_THEATER, timeoutMs: 60 }), { state: 'timeout', clicks: 0 }, '虎牙改版后认不出按钮：宁可不点');
        assert.equal(renamed.button.clicks, 0);
    } finally { renamed.restore(); }
    const hiddenByPage = installTheaterDocument({});
    hiddenByPage.button.style.display = 'none';
    try {
        assert.deepEqual(await Core.enterTheaterPage({ ...FAST_THEATER, timeoutMs: 60 }), { state: 'timeout', clicks: 0 }, '页面主动隐藏了这个按钮（该房间类型不支持）时不强行点击');
        assert.equal(hiddenByPage.button.clicks, 0);
    } finally { hiddenByPage.restore(); }
});

test('enterTheaterPage 在文档刚开始、body 还不存在时不会抛错，之后正常进入', async () => {
    const env = installTheaterDocument({ bodyAfterMs: 40, displayAfterMs: 20, buttonAfterMs: 5 });
    try {
        const result = await Core.enterTheaterPage(FAST_THEATER);
        assert.equal(result.state, 'entered');
    } finally { env.restore(); }
});

test('enterTheaterPage 可序列化注入：不引用模块作用域变量，只用 id 找一个按钮并返回可序列化的状态', async () => {
    const source = Core.enterTheaterPage.toString();
    const isolated = new Function(`return (${source});`)();
    assert.equal(typeof isolated, 'function');
    for (const forbidden of ['HuyaCore', 'ORIGIN', 'FOLLOW_', 'THEATER_', 'require(', 'module.', 'chrome.', 'fetch(', 'XMLHttpRequest', 'cookie', 'Storage', 'postMessage', 'dispatchEvent', 'querySelector', 'eval(', 'innerHTML', 'location', 'window.open']) {
        assert.equal(source.includes(forbidden), false, `页内函数不应包含 ${forbidden}`);
    }
    assert.equal(source.includes("getElementById('player-fullpage-btn')"), true);
    const env = installTheaterDocument({});
    try {
        const result = await isolated(FAST_THEATER);
        assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
        assert.equal(Core.THEATER_PAGE_TIMEOUT_MS, 45_000);
    } finally { env.restore(); }
});

test('关注列表检索词归一化：全半角、大小写、控制字符与长度上限', () => {
    assert.equal(Core.normalizeQuery('  Ｌ Ｏ　Ｌ \n'), 'l o l', 'NFKC 全角转半角、小写、空白折叠');
    assert.equal(Core.normalizeQuery('a\u0000b\u0007c'), 'a b c', '控制字符当作分隔，不进入检索词');
    assert.equal(Core.normalizeQuery('x\u202ey'), 'x y', '双向控制符不能改变显示顺序');
    assert.equal(Core.normalizeQuery(undefined), '');
    assert.equal(Core.normalizeQuery(null), '');
    assert.equal(Core.normalizeQuery(12345), '12345');
    assert.equal(Core.normalizeQuery('A'.repeat(200)).length, 80);
});

test('关注列表检索：昵称、标题、游戏中的每个词都要命中，空词返回副本', () => {
    const items = [
        { nick: '阿狸', title: '排位赛', game: '英雄联盟', viewers: 500 },
        { nick: '小明', title: '闲聊', game: '王者荣耀', viewers: 9000 },
        { nick: '大熊', title: 'LOL 双排', game: '英雄联盟', viewers: 70000 },
        { nick: '无人气', title: '', game: '', viewers: Number.NaN },
        { nick: '同分', title: '', game: '', viewers: 500 },
    ];
    assert.deepEqual(Core.filterItems(items, '英雄联盟').map(item => item.nick), ['阿狸', '大熊']);
    assert.deepEqual(Core.filterItems(items, '英雄联盟 lol').map(item => item.nick), ['大熊'], '多个词必须同时命中');
    assert.deepEqual(Core.filterItems(items, 'ｌｏｌ').map(item => item.nick), ['大熊'], '全角输入也能命中');
    assert.deepEqual(Core.filterItems(items, '排位 闲聊').map(item => item.nick), [], '同一主播不满足所有词则不命中');
    assert.deepEqual(Core.filterItems(items, '不存在的词'), []);
    for (const empty of ['', '   ', '\n', undefined, null]) {
        const result = Core.filterItems(items, empty);
        assert.equal(result.length, items.length);
        assert.notEqual(result, items, '返回副本，调用方改动不影响原列表');
    }
    for (const bad of [null, undefined, 'abc', {}, 42]) assert.deepEqual(Core.filterItems(bad, 'x'), [], '非数组输入不抛异常');
    assert.deepEqual(Core.filterItems([null, undefined, { nick: '甲' }], '甲').map(item => item.nick), ['甲'], '列表里的空项被忽略');
});

test('按人气排序：从高到低，并列保持原顺序，没有人气数据的排最后，不改动原数组', () => {
    const items = [
        { nick: '阿狸', viewers: 500 },
        { nick: '小明', viewers: 9000 },
        { nick: '大熊', viewers: 70000 },
        { nick: '无人气', viewers: Number.NaN },
        { nick: '同分', viewers: 500 },
        { nick: '缺字段' },
    ];
    const snapshot = items.map(item => item.nick);
    assert.deepEqual(Core.sortByViewers(items).map(item => item.nick), ['大熊', '小明', '阿狸', '同分', '无人气', '缺字段']);
    assert.deepEqual(items.map(item => item.nick), snapshot, '原数组顺序不变');
    for (const bad of [null, undefined, {}, 'abc']) assert.deepEqual(Core.sortByViewers(bad), [], '非数组输入不抛异常');
});

// ---- 最近观看 ----

function watched(overrides = {}) {
    return {
        id: 'u1000001', uid: '1000001', nick: '测试主播', title: '今天一起上分', game: '英雄联盟',
        avatar: 'https://huyaimg.msstatic.com/avatar/a.jpg',
        cover: 'https://live-cover.msstatic.com/huyalive/a.jpg?x-oss-process=image/resize,w_320',
        url: 'https://www.huya.com/520001', locked: false, ...overrides,
    };
}

test('条目 id 只接受 u<uid> 与 h<房间路径>', () => {
    for (const valid of ['u1', 'u1000001', 'h520001', 'habcDEF', 'hyy/123456', 'hvideo/u/123']) assert.equal(Core.isItemId(valid), true, valid);
    for (const invalid of ['', 'u0', 'u01', 'u12a', 'h', 'x123', 'h../evil', 'h a', 'hyy/0', `u${'9'.repeat(21)}`, '<img>', null, undefined, 123, {}]) {
        assert.equal(Core.isItemId(invalid), false, String(invalid));
    }
});

test('观看记录条目：只保留白名单字段，地址必须是虎牙房间，图片必须是虎牙资源', () => {
    const now = 1_790_000_000_000;
    const entry = Core.recentEntry({ ...watched(), secret: 'token', followersLabel: '9万', status: 'live', embedHost: '520001', onerror: 'x' }, now);
    assert.deepEqual(Object.keys(entry).sort(), ['avatar', 'cover', 'game', 'host', 'id', 'locked', 'nick', 'title', 'uid', 'url', 'watchedAt']);
    assert.equal(entry.watchedAt, now);
    assert.equal(entry.url, 'https://www.huya.com/520001');
    assert.equal(entry.host, '520001');
    assert.equal(Core.recentEntry(watched({ url: 'https://evil.example/520001' }), now), null, '站外地址不能进入记录');
    assert.equal(Core.recentEntry(watched({ url: 'javascript:alert(1)' }), now), null);
    assert.equal(Core.recentEntry(watched({ url: '' }), now), null);
    assert.equal(Core.recentEntry(watched({ id: 'evil' }), now), null);
    assert.equal(Core.recentEntry(watched({ nick: '  ' }), now), null);
    assert.equal(Core.recentEntry(watched(), 0), null, '没有有效观看时间的记录不可信');
    assert.equal(Core.recentEntry(watched(), 1.5), null);
    assert.equal(Core.recentEntry(null, now), null);
    const unsafe = Core.recentEntry(watched({ avatar: 'https://evil.example/a.jpg', cover: 'https://evil.example/c.jpg', title: 'a\u0000b\u202ec', uid: 'abc' }), now);
    assert.equal(unsafe.avatar, '');
    assert.equal(unsafe.cover, '');
    assert.equal(unsafe.title, 'a b c', '控制字符与双向控制符被替换');
    assert.equal(unsafe.uid, '');
    assert.equal(Core.recentEntry(watched({ cover: 'https://live-cover.msstatic.com/default_screenshot.jpg' }), now).cover, '', '虎牙占位截图不是封面');
    assert.equal(Core.recentEntry(watched({ locked: 'yes' }), now).locked, false, '只接受布尔 true');
});

test('读取观看记录：丢弃不合法、过期、来自未来和重复的记录，按时间倒序并限制 30 条', () => {
    const now = 1_790_000_000_000;
    const day = 24 * 60 * 60 * 1000;
    const stored = [
        { ...Core.recentEntry(watched({ id: 'u1', uid: '1', url: 'https://www.huya.com/1', nick: '甲' }), now - 5 * 60_000) },
        { ...Core.recentEntry(watched({ id: 'u2', uid: '2', url: 'https://www.huya.com/2', nick: '乙' }), now - 60_000) },
        { ...Core.recentEntry(watched({ id: 'u1', uid: '1', url: 'https://www.huya.com/1', nick: '甲（旧）' }), now - 9 * 60_000) },
        { ...Core.recentEntry(watched({ id: 'u3', uid: '3', url: 'https://www.huya.com/3', nick: '丙' }), now - 31 * day) },
        { ...Core.recentEntry(watched({ id: 'u4', uid: '4', url: 'https://www.huya.com/4', nick: '丁' }), now + 10 * 60_000) },
        { id: 'u5', nick: '没有时间', url: 'https://www.huya.com/5' },
        { id: 'bad', nick: '坏 id', url: 'https://www.huya.com/6', watchedAt: now - 1000 },
        null, 'text', 42,
    ];
    const result = Core.sanitizeRecent({ version: 1, items: stored }, now);
    assert.deepEqual(result.map(entry => entry.id), ['u2', 'u1']);
    assert.equal(result[1].nick, '甲', '同一主播只保留最新一条');
    assert.deepEqual(Core.sanitizeRecent(stored, now).map(entry => entry.id), ['u2', 'u1'], '数组与 { items } 两种形状都能读');
    for (const bad of [null, undefined, 'abc', 42, {}, { items: 'x' }]) assert.deepEqual(Core.sanitizeRecent(bad, now), [], '形状不对一律视为空');
    const many = Array.from({ length: 80 }, (_, index) => Core.recentEntry(watched({ id: `u${index + 1}`, uid: String(index + 1), url: `https://www.huya.com/${index + 1}` }), now - index * 1000));
    const capped = Core.sanitizeRecent(many, now);
    assert.equal(capped.length, Core.RECENT_LIMIT);
    assert.equal(capped[0].id, 'u1', '最新的在最前');
    const extra = Core.sanitizeRecent([{ ...Core.recentEntry(watched(), now - 1000), password: 'x', embedHost: 'evil' }], now);
    assert.equal('password' in extra[0] || 'embedHost' in extra[0], false, '读取时重新投影，存储里多出来的字段不会进入界面');
});

test('合并新的观看：移到最前、去重、限制 30 条；无法打开的条目不改变记录', () => {
    let now = 1_790_000_000_000;
    let list = [];
    for (let index = 1; index <= 35; index += 1) {
        now += 1000;
        list = Core.mergeRecent(list, watched({ id: `u${index}`, uid: String(index), url: `https://www.huya.com/${index}`, nick: `主播${index}` }), now);
    }
    assert.equal(list.length, Core.RECENT_LIMIT);
    assert.equal(list[0].id, 'u35');
    assert.equal(list.at(-1).id, 'u6', '最旧的 5 条被淘汰');
    now += 1000;
    const again = Core.mergeRecent(list, watched({ id: 'u10', uid: '10', url: 'https://www.huya.com/10', nick: '主播10' }), now);
    assert.equal(again[0].id, 'u10');
    assert.equal(again.filter(entry => entry.id === 'u10').length, 1);
    assert.equal(again.length, Core.RECENT_LIMIT);
    assert.equal(again[0].watchedAt, now, '再次观看刷新时间');
    const unchanged = Core.mergeRecent(again, watched({ url: 'https://evil.example/x' }), now + 1);
    assert.deepEqual(unchanged.map(entry => entry.id), again.map(entry => entry.id));
    assert.deepEqual(Core.mergeRecent(undefined, watched(), now).map(entry => entry.id), ['u1000001']);
    assert.deepEqual(Core.removeRecent(again, 'u10').map(entry => entry.id).includes('u10'), false);
    assert.deepEqual(Core.removeRecent(null, 'u1'), []);
});

test('观看记录转成条目：状态是“未知”，能否内嵌由房间标识和加密状态决定', () => {
    const now = 1_790_000_000_000;
    const room = Core.recentToItem(Core.recentEntry(watched(), now));
    assert.equal(room.status, 'unknown');
    assert.equal(room.source, 'recent');
    assert.equal(room.embedHost, '520001');
    assert.equal(room.viewersLabel, '');
    assert.equal(room.title, '今天一起上分');
    assert.equal(Core.recentToItem(Core.recentEntry(watched({ title: '' }), now)).title, '测试主播的直播间');
    assert.equal(Core.recentToItem(Core.recentEntry(watched({ locked: true }), now)).embedHost, '', '加密或付费房间不内嵌');
    assert.equal(Core.recentToItem(Core.recentEntry(watched({ id: 'hyy/123', uid: '', url: 'https://www.huya.com/yy/123' }), now)).embedHost, '', 'yy 房间不内嵌');
    const video = Core.recentToItem(Core.recentEntry(watched({ id: 'hvideo/u/123', uid: '', url: 'https://www.huya.com/video/u/123' }), now));
    assert.equal(video.embedHost, '');
    assert.equal(video.url, 'https://www.huya.com/video/u/123');
});

test('用新鲜的直播数据补充观看记录：直播中优先，没有数据就保持未知，不猜测', () => {
    const now = 1_790_000_000_000;
    const entries = Core.sanitizeRecent([
        Core.recentEntry(watched({ id: 'u1', uid: '1', url: 'https://www.huya.com/1', nick: '甲', title: '旧标题' }), now - 1000),
        Core.recentEntry(watched({ id: 'u2', uid: '2', url: 'https://www.huya.com/2', nick: '乙' }), now - 2000),
        Core.recentEntry(watched({ id: 'u3', uid: '3', url: 'https://www.huya.com/3', nick: '丙' }), now - 3000),
        Core.recentEntry(watched({ id: 'u4', uid: '4', url: 'https://www.huya.com/4', nick: '丁' }), now - 4000),
    ], now);
    const live = [
        { id: 'u1', status: 'offline', title: '', viewers: null },
        { id: 'u1', status: 'live', title: '新标题', game: '王者荣耀', viewers: 12345, avatar: 'https://huyaimg.msstatic.com/new.jpg', cover: 'https://live-cover.msstatic.com/new.jpg' },
        { id: 'u2', status: 'offline', title: '', viewers: null },
        { id: 'u3', status: 'weird', title: '不被信任' },
        { id: 'u9', status: 'live' },
        null,
    ];
    const items = Core.enrichRecent(entries, live);
    const byId = Object.fromEntries(items.map(item => [item.id, item]));
    assert.equal(byId.u1.status, 'live', '任一来源在直播就算直播中');
    assert.equal(byId.u1.viewersLabel, '1.2万');
    assert.equal(byId.u1.title, '新标题');
    assert.equal(byId.u1.game, '王者荣耀');
    assert.equal(byId.u1.embedHost, '1');
    assert.equal(byId.u2.status, 'offline');
    assert.equal(byId.u2.embedHost, '', '确认未开播时按“在虎牙打开”处理');
    assert.equal(byId.u3.status, 'unknown', '状态不在白名单就不采信');
    assert.equal(byId.u4.status, 'unknown', '没有数据保持未知');
    assert.equal(byId.u3.title, '今天一起上分');
    assert.deepEqual(Core.enrichRecent(entries, null).map(item => item.status), ['unknown', 'unknown', 'unknown', 'unknown']);
    assert.deepEqual(Core.enrichRecent(null, live), []);
    const unsafe = Core.enrichRecent(entries.slice(0, 1), [{ id: 'u1', status: 'live', avatar: 'https://evil.example/a.jpg', cover: 'javascript:1', viewers: -5 }])[0];
    assert.equal(unsafe.avatar, 'https://huyaimg.msstatic.com/avatar/a.jpg', '不安全的头像沿用记录里的安全值');
    assert.equal(unsafe.viewersLabel, '');
});

// ---- 关注分组 ----

test('新建分组：名称去空白、限制 12 个字符、不区分大小写与全半角重复、最多 12 个', () => {
    let state = { groups: [] };
    const first = Core.addGroup(state, '  游 戏  ', { id: 'gaaa111' });
    assert.equal(first.ok, true);
    assert.equal(first.group.name, '游 戏', '内部空白折叠为一个空格');
    assert.deepEqual(first.group.members, []);
    assert.deepEqual(state, { groups: [] }, '不修改传入的状态');
    state = first.state;
    assert.equal(Core.addGroup(state, '').code, 'group-name-empty');
    assert.equal(Core.addGroup(state, '   ').code, 'group-name-empty');
    assert.equal(Core.addGroup(state, '\u0000\u202e').code, 'group-name-empty', '只有控制字符等同空名称');
    assert.equal(Core.addGroup(state, '一二三四五六七八九十一二三').code, 'group-name-long');
    assert.equal(Core.addGroup(state, '一二三四五六七八九十一二').ok, true, '恰好 12 个字符可以');
    assert.equal(Core.addGroup(state, '😀'.repeat(12)).ok, true, '按字符而不是 UTF-16 单元计数');
    assert.equal(Core.addGroup(state, '😀'.repeat(13)).code, 'group-name-long');
    assert.equal(Core.addGroup(state, '游 戏').code, 'group-name-duplicate');
    assert.equal(Core.addGroup(state, 'ＬＯＬ').ok, true);
    const withLol = Core.addGroup(state, 'ＬＯＬ', { id: 'glol111' }).state;
    assert.equal(Core.addGroup(withLol, 'lol').code, 'group-name-duplicate', '全角与小写视为同名');
    let full = { groups: [] };
    for (let index = 0; index < Core.GROUP_LIMIT; index += 1) {
        const result = Core.addGroup(full, `分组${index}`);
        assert.equal(result.ok, true, `第 ${index + 1} 个`);
        full = result.state;
    }
    assert.equal(full.groups.length, Core.GROUP_LIMIT);
    assert.equal(Core.addGroup(full, '多余的').code, 'group-limit');
    assert.equal(new Set(full.groups.map(group => group.id)).size, Core.GROUP_LIMIT, '自动生成的 id 不重复');
    for (const group of full.groups) assert.match(group.id, /^g[a-z0-9]{3,18}$/);
});

test('分组名称与成员原样保存为文本，HTML 与原型污染字样不会被解释', () => {
    const payload = '<img src=x onerror=1>';
    const created = Core.addGroup({ groups: [] }, payload.slice(0, 12), { id: 'gxss0001' });
    assert.equal(created.ok, true);
    assert.equal(created.group.name, '<img src=x o', '只当文本保存，转义在渲染时完成');
    assert.equal(Core.addGroup({ groups: [] }, '__proto__').ok, true);
    const state = Core.sanitizeGroups({ groups: [{ id: 'gproto01', name: 'constructor', members: ['__proto__', 'u1'] }] });
    assert.deepEqual(state.groups[0].members, ['u1'], '不合法的成员 id 被丢弃');
    assert.equal(Object.getPrototypeOf(state.groups[0]), Object.prototype);
});

test('重命名与删除分组：重名检查排除自己，不存在的分组返回错误码', () => {
    const base = Core.sanitizeGroups({ groups: [
        { id: 'ggame01', name: '游戏', members: ['u1', 'u2'] },
        { id: 'gchat01', name: '陪伴', members: ['u3'] },
    ] });
    const renamed = Core.renameGroup(base, 'ggame01', '电竞');
    assert.equal(renamed.ok, true);
    assert.deepEqual(renamed.state.groups.map(group => group.name), ['电竞', '陪伴']);
    assert.deepEqual(renamed.state.groups[0].members, ['u1', 'u2'], '重命名不改变成员');
    assert.equal(Core.renameGroup(base, 'ggame01', '游戏').ok, true, '改成自己当前的名称不算重名');
    assert.equal(Core.renameGroup(base, 'ggame01', '陪伴').code, 'group-name-duplicate');
    assert.equal(Core.renameGroup(base, 'ggame01', ' ').code, 'group-name-empty');
    assert.equal(Core.renameGroup(base, 'ggame01', '一二三四五六七八九十一二三').code, 'group-name-long');
    assert.equal(Core.renameGroup(base, 'gnone01', '新').code, 'group-missing');
    const removed = Core.deleteGroup(base, 'ggame01');
    assert.deepEqual(removed.state.groups.map(group => group.id), ['gchat01']);
    assert.equal(Core.deleteGroup(base, 'gnone01').code, 'group-missing');
    assert.equal(base.groups.length, 2, '原状态不变');
});

test('分组成员：加入、移出幂等，限制 400 个，非法 id 与不存在的分组返回错误码', () => {
    const base = Core.sanitizeGroups({ groups: [{ id: 'ggame01', name: '游戏', members: [] }, { id: 'gchat01', name: '陪伴', members: [] }] });
    const added = Core.setGroupMember(base, 'ggame01', 'u1', true);
    assert.equal(added.ok, true);
    assert.deepEqual(added.state.groups[0].members, ['u1']);
    assert.deepEqual(Core.setGroupMember(added.state, 'ggame01', 'u1', true).state.groups[0].members, ['u1'], '重复加入不产生重复成员');
    assert.deepEqual(Core.setGroupMember(added.state, 'gchat01', 'u1', true).state.groups.map(group => group.members), [['u1'], ['u1']], '同一主播可以属于多个分组');
    assert.deepEqual(Core.setGroupMember(added.state, 'ggame01', 'u1', false).state.groups[0].members, []);
    assert.deepEqual(Core.setGroupMember(base, 'ggame01', 'u9', false).state.groups[0].members, [], '移出不存在的成员不报错');
    assert.equal(Core.setGroupMember(base, 'ggame01', '<b>', true).code, 'group-member-invalid');
    assert.equal(Core.setGroupMember(base, 'gnone01', 'u1', true).code, 'group-missing');
    assert.deepEqual(base.groups[0].members, [], '原状态不变');
    const crowded = Core.sanitizeGroups({ groups: [{ id: 'gfull001', name: '满', members: Array.from({ length: Core.GROUP_MEMBER_LIMIT + 20 }, (_, index) => `u${index + 1}`) }] });
    assert.equal(crowded.groups[0].members.length, Core.GROUP_MEMBER_LIMIT, '读取时截断到上限');
    assert.equal(Core.setGroupMember(crowded, 'gfull001', 'u999999', true).code, 'group-member-limit');
    assert.equal(Core.setGroupMember(crowded, 'gfull001', 'u1', true).ok, true, '已在分组里的成员不受上限影响');
    assert.deepEqual(Core.groupsOfMember(added.state, 'u1').map(group => group.id), ['ggame01']);
    assert.deepEqual(Core.groupsOfMember(added.state, 'u2'), []);
});

test('读取本机分组：整体校验，丢弃不合法的组、重复 id 与重复名称，最多 12 组', () => {
    const rows = [
        { id: 'ggood001', name: '好', members: ['u1', 'u1', 'h520001', 'bad'] },
        { id: 'ggood001', name: '重复 id', members: [] },
        { id: 'gother01', name: '好', members: [] },
        { id: 'gother02', name: 'Ｈ', members: [] },
        { id: 'gother03', name: 'h', members: [] },
        { id: 'BAD ID', name: '坏 id', members: [] },
        { id: 'gnoname1', name: '   ', members: [] },
        { id: 'glong001', name: '一二三四五六七八九十一二三', members: [] },
        { id: 'gnomem01', name: '没有成员字段' },
        null, 'x', 7,
    ];
    const state = Core.sanitizeGroups({ version: 1, groups: rows });
    assert.deepEqual(state.groups.map(group => group.id), ['ggood001', 'gother02', 'gnomem01']);
    assert.deepEqual(state.groups[0].members, ['u1', 'h520001'], '成员去重并丢弃非法 id');
    assert.deepEqual(state.groups[2].members, []);
    assert.deepEqual(Core.sanitizeGroups(rows).groups.map(group => group.id), ['ggood001', 'gother02', 'gnomem01'], '数组形状也能读');
    for (const bad of [null, undefined, 'abc', 42, {}, { groups: 'x' }]) assert.deepEqual(Core.sanitizeGroups(bad), { groups: [] });
    const many = Core.sanitizeGroups({ groups: Array.from({ length: 40 }, (_, index) => ({ id: `gmany${String(index).padStart(3, '0')}`, name: `组${index}`, members: [] })) });
    assert.equal(many.groups.length, Core.GROUP_LIMIT);
});

test('成员分组索引：一次建立，成员属于多个分组时按顺序列出名称，容忍非法输入', () => {
    const state = Core.sanitizeGroups({ groups: [
        { id: 'ggame001', name: '游戏', members: ['u1', 'u2'] },
        { id: 'gmusic01', name: '音乐', members: ['u2', 'h520001'] },
        { id: 'gempty01', name: '空', members: [] },
    ] });
    const index = Core.membershipIndex(state);
    assert.deepEqual(index.get('u1'), ['游戏']);
    assert.deepEqual(index.get('u2'), ['游戏', '音乐']);
    assert.deepEqual(index.get('h520001'), ['音乐']);
    assert.equal(index.has('u404'), false);
    for (const bad of [null, undefined, 'x', {}, { groups: [null, { members: 'x' }] }]) {
        assert.equal(Core.membershipIndex(bad).size, 0);
    }
});

test('按分组过滤关注列表：只按成员 id，返回副本，空分组得到空列表', () => {
    const items = [{ id: 'u1', nick: '甲' }, { id: 'u2', nick: '乙' }, { id: 'h520001', nick: '丙' }, null];
    const group = { id: 'ggame01', name: '游戏', members: ['u2', 'h520001', 'u404'] };
    assert.deepEqual(Core.filterByGroup(items, group).map(item => item.nick), ['乙', '丙'], '分组里不存在于当前关注列表的成员被忽略');
    assert.deepEqual(Core.filterByGroup(items, { id: 'g', name: 'x', members: [] }), []);
    const all = Core.filterByGroup(items, null);
    assert.equal(all.length, items.length);
    assert.notEqual(all, items, '不选分组时返回副本');
    for (const bad of [null, undefined, 'abc', {}]) assert.deepEqual(Core.filterByGroup(bad, group), []);
    assert.deepEqual(Core.filterByGroup(items, { members: 'x' }).length, items.length, '分组对象不合法时不过滤');
});

test('打开方式：没有明确选择一律弹窗，只有 openModeChosen 为 true 且值为 embed 才内嵌', () => {
    // 没有设置、损坏的设置、数组与非对象：默认弹窗。
    for (const value of [undefined, null, 0, 'embed', true, [], [{ openModeChosen: true, openMode: 'embed' }]]) {
        assert.equal(Core.resolveOpenMode(value), 'popup', JSON.stringify(value));
    }
    // 旧版本每次保存视图偏好都会自动写入 openMode:'embed'，那不是用户的选择，必须按默认处理。
    assert.equal(Core.resolveOpenMode({ view: 'follow', openMode: 'embed' }), 'popup');
    assert.equal(Core.resolveOpenMode({ openMode: 'embed', openModeChosen: false }), 'popup');
    // 只认布尔 true；字符串、数字、对象都不算明确选择。
    for (const chosen of ['true', 1, 'yes', {}, []]) {
        assert.equal(Core.resolveOpenMode({ openMode: 'embed', openModeChosen: chosen }), 'popup', String(chosen));
    }
    // 明确选择后按保存的值；无法识别的取值（损坏、大小写不同、带空白）回到默认，不擅自改成内嵌。
    assert.equal(Core.resolveOpenMode({ openMode: 'embed', openModeChosen: true }), 'embed');
    assert.equal(Core.resolveOpenMode({ openMode: 'popup', openModeChosen: true }), 'popup');
    for (const bad of [undefined, null, 'EMBED', ' embed', 1, {}, 'window']) {
        assert.equal(Core.resolveOpenMode({ openMode: bad, openModeChosen: true }), 'popup', String(bad));
    }
    // 不修改传入的设置对象。
    const frozen = Object.freeze({ openMode: 'embed', openModeChosen: true });
    assert.equal(Core.resolveOpenMode(frozen), 'embed');
    assert.deepEqual({ ...frozen }, { openMode: 'embed', openModeChosen: true });
});

test('“明确选择”的判定：必须是布尔 true 加上合法取值，损坏的取值不会被保存成选择', () => {
    assert.equal(Core.isOpenModeChosen({ openMode: 'embed', openModeChosen: true }), true);
    assert.equal(Core.isOpenModeChosen({ openMode: 'popup', openModeChosen: true }), true);
    // 旧版本自动写入的值、标记不是布尔 true、取值损坏、整体形状异常，都不算选择。
    for (const value of [undefined, null, [], 'x', { openMode: 'embed' }, { openMode: 'popup' }, { openMode: 'embed', openModeChosen: 'true' }, { openMode: 'EMBED', openModeChosen: true }, { openModeChosen: true }, { openMode: {}, openModeChosen: true }]) {
        assert.equal(Core.isOpenModeChosen(value), false, JSON.stringify(value));
    }
    // 两个函数口径一致：没有选择就一定是默认弹窗。
    for (const value of [{ openMode: 'embed' }, { openMode: 'EMBED', openModeChosen: true }, { openMode: 'embed', openModeChosen: 1 }]) {
        assert.equal(Core.isOpenModeChosen(value) || Core.resolveOpenMode(value) === 'popup', true, JSON.stringify(value));
    }
});
