const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/music-controller.js'), 'utf8');
const offscreenSource = fs.readFileSync(path.join(root, 'js/offscreen.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(root, 'js/background.js'), 'utf8');

function loadController(localStorageState = {}, chromeOverrides = {}) {
    const instrumented = source.replace(
        'window.musicController = new MusicController();',
        'window.MusicController = MusicController;'
    );
    const document = {
        createElement() {
            return {
                textContent: '',
                innerHTML: '',
                style: {},
                classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
                appendChild() {},
                addEventListener() {},
                querySelector() { return null; },
                querySelectorAll() { return []; },
            };
        },
        querySelector() { return null; },
        getElementById() { return null; },
        body: { append() {}, appendChild() {}, classList: { add() {}, remove() {} } },
        addEventListener() {},
        removeEventListener() {},
    };
    const chrome = {
        runtime: { onMessage: { addListener() {} }, sendMessage() {} },
        storage: {
            local: { get: async () => localStorageState, set: async () => {}, remove: async () => {} },
            session: { get: async () => ({}), set: async () => {} },
        },
    };
    Object.assign(chrome, chromeOverrides);
    const context = {
        window: {}, document, chrome, console, MusicQueuePolicy: require('../js/music-queue-policy.js'),
        setTimeout, clearTimeout, setInterval, clearInterval,
        requestAnimationFrame: fn => fn(),
    };
    vm.runInNewContext(instrumented, context);
    return new context.window.MusicController();
}

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

test('助手队列更新刷新真实列表和计数，并更新正确名称字段', async () => {
    const cache={source:'quick-assistant',assistantRevision:'r1',savedAt:100,playlistName:'张杰热门',playlistId:null,playlist:[{songId:'1',title:'逆战'},{songId:'2',title:'这，就是爱'}]};
    const controller=loadController({musicPlaylistCache:cache});let rendered=[],updates=0,staleWrite=false;
    const count={textContent:''};controller._el={querySelector:selector=>selector==='#mc-queue-count'?count:null};
    controller._renderQueueWithApi=songs=>{rendered=Array.from(songs,s=>s.songId);};controller._updateUI=()=>updates++;
    controller._offscreenCommand=async()=>({ok:true,data:{songId:'2',isPlaying:true}});
    controller._savePlaylistTimer=setTimeout(()=>{staleWrite=true;},0);
    await controller._applyAssistantQueue(cache);await new Promise(resolve=>setTimeout(resolve,5));
    assert.deepEqual(rendered,['1','2']);assert.equal(count.textContent,' 2');assert.equal(controller._currentPlaylistName,'张杰热门');
    assert.equal(controller._playlist[1].isActive,true);assert.equal(staleWrite,false);assert.equal(updates,1);
});
test('旧助手队列事件不覆盖新队列，也不取消新的本地保存',async()=>{
    const current={source:'quick-assistant',assistantRevision:'new',savedAt:200,playlist:[]};
    const controller=loadController({musicPlaylistCache:current});let saved=false;
    controller._playlist=[{songId:'keep'}];controller._refreshPlaylist=()=>assert.fail('不能刷新旧队列');
    controller._savePlaylistTimer=setTimeout(()=>{saved=true;},0);
    await controller._applyAssistantQueue({...current,assistantRevision:'old',savedAt:100});await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(saved,true);assert.equal(controller._playlist[0].songId,'keep');
});

test('FM 的底部上一首和下一首只推进 FM 索引', () => {
    const controller = loadController();
    let fmNext = 0;
    let fmPrev = 0;
    let queueNext = 0;
    controller._fmMode = true;
    controller._fmNext = () => { fmNext++; };
    controller._fmPrevious = () => { fmPrev++; };
    controller._playAdjacentTrack = () => { queueNext++; };

    controller._nextTrack();
    controller._prevTrack();

    assert.equal(fmNext, 1);
    assert.equal(fmPrev, 1);
    assert.equal(queueNext, 0);
});

test('乱序 offscreen 状态不能覆盖当前歌曲身份', () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._currentSongId = 202;
    controller._lastOffscreenVersion = 20;
    controller.state.title = '新歌';
    controller.state.artist = '新歌手';
    controller._updateUI = () => {};
    controller._show = () => {};
    controller._hideMetaGuide = () => {};
    controller._showMetaGuide = () => {};
    controller._throttleSaveState = () => {};

    controller._handleOffscreenState({
        stateVersion: 19,
        songId: 101,
        title: '旧歌',
        artist: '旧歌手',
        currentTime: 18,
        isPlaying: true,
    });

    assert.equal(controller.state.title, '新歌');
    assert.equal(controller.state.artist, '新歌手');
    assert.equal(controller.state.currentTime, 0);
});

test('播放错误和结束事件携带 songId，切歌中止不会误跳下一首', () => {
    assert.match(offscreenSource, /offscreen_track_ended', songId: currentState\.songId/);
    assert.match(offscreenSource, /if \(code === 1\) return/);
    assert.match(offscreenSource, /generation !== playGeneration/);
    assert.match(backgroundSource, /music_track_ended', songId: message\.songId/);
    assert.match(backgroundSource, /songId: message\.songId/);
    assert.match(source, /_handlePlaybackError\(msg\.error, msg\.code, msg\.songId\)/);
});

test('连续切歌时只有最后一次异步请求可以提交播放', async () => {
    const controller = loadController();
    const url1 = deferred();
    const url2 = deferred();
    const detail1 = deferred();
    const detail2 = deferred();
    const played = [];

    controller._offscreenMode = true;
    controller.platform = 'netease';
    controller._playlist = [
        { songId: 1, title: '第一首', artist: '甲', index: 0 },
        { songId: 2, title: '第二首', artist: '乙', index: 1 },
    ];
    controller._getSongUrl = id => (id === 1 ? url1.promise : url2.promise);
    controller._neteaseApi = (_endpoint, params) => {
        const id = JSON.parse(params.c)[0].id;
        return id === 1 ? detail1.promise : detail2.promise;
    };
    controller._offscreenPlay = async (_url, id, title) => { played.push({ id, title }); return { ok: true }; };
    controller._updateUI = () => {};
    controller._show = () => {};
    controller._hideMetaGuide = () => {};
    controller._tryFetchLyricsForCurrentSong = () => {};
    controller._recordLocalPlayHistory = () => {};
    controller._setRowLoading = () => {};

    const first = controller._playSongById(1);
    const second = controller._playSongById(2);

    url2.resolve('https://audio.test/2.mp3');
    detail2.resolve({ ok: true, data: { songs: [{ name: '第二首', ar: [{ id: 22, name: '乙' }], al: { id: 222, name: '乙专辑', picUrl: 'cover2' } }] } });
    await second;

    url1.resolve('https://audio.test/1.mp3');
    detail1.resolve({ ok: true, data: { songs: [{ name: '第一首', ar: [{ id: 11, name: '甲' }], al: { id: 111, name: '甲专辑', picUrl: 'cover1' } }] } });
    await first;

    assert.equal(controller._currentSongId, 2);
    assert.equal(controller.state.title, '第二首');
    assert.equal(controller.state.artist, '乙');
    assert.deepEqual(played, [{ id: 2, title: '第二首' }]);
    assert.equal(controller._playlist.filter(song => song.isActive).length, 1);
    assert.equal(controller._playlist.find(song => song.isActive).songId, 2);
});

test('艺人、专辑和相似内容使用重新设计的工作台语义', () => {
    assert.match(source, /mc-artist-workspace/);
    assert.match(source, /label: '<i class="fas fa-fire"><\/i> 热门歌曲'/);
    assert.match(source, /label: '<i class="fas fa-users"><\/i> 相似艺人'/);
    assert.match(source, /mc-similar-workspace/);
    assert.match(source, /底部播放条与队列高亮会保持同一首歌/);
});

test('过期播放状态不会继续把缓存队列标成正在播放', async () => {
    const controller = loadController({
        lastMusicState: {
            songId: 9,
            title: '过期歌曲',
            artist: '旧歌手',
            savedAt: Date.now() - 31 * 60 * 1000,
        },
        musicPlaylistCache: {
            playlist: [{ songId: 9, title: '过期歌曲', artist: '旧歌手', isActive: true }],
            savedAt: Date.now(),
        },
    });

    await controller._restoreMusicState();

    assert.equal(controller._currentSongId, null);
    assert.equal(controller.state.title, '');
    assert.equal(controller._playlist[0].isActive, false);
});

test('默认空态只覆盖正在播放页，不遮挡队列和发现页', () => {
    const controller = loadController();
    const guide = {
        dataset: { guideReason: 'default', surfaceError: 'false' },
        classList: { contains: () => false },
    };
    controller._el = { querySelector: selector => selector === '#mc-meta-guide' ? guide : null };
    controller.state.title = '';
    let hidden = 0;
    let shown = 0;
    controller._hideMetaGuide = () => { hidden++; };
    controller._showMetaGuide = reason => { if (reason === 'default') shown++; };

    controller._syncMetaGuideForTab('queue');
    controller._syncMetaGuideForTab('discover');
    controller._syncMetaGuideForTab('now-playing');

    assert.equal(hidden, 2);
    assert.equal(shown, 0, '已有正在播放空态时不应重复创建');
});

test('图标右键菜单按音乐、网站工作区和主页设置分组', () => {
    assert.match(backgroundSource, /const MUSIC_MENU_ID = 'music-quick-play'/);
    assert.match(backgroundSource, /title: '网易云音乐'/);
    assert.match(backgroundSource, /title: '播放私人 FM'/);
    assert.match(backgroundSource, /title: '播放每日推荐'/);
    assert.match(backgroundSource, /title: '播放 \/ 暂停'/);
    assert.match(backgroundSource, /title: '上一首'/);
    assert.match(backgroundSource, /title: '下一首'/);
    assert.match(backgroundSource, /title: '打开音乐工作台'/);
    assert.match(backgroundSource, /title: '主页与设置'/);
    assert.match(backgroundSource, /startSilentNeteaseQuickPlay\('personal-fm', tab\)/);
    assert.match(backgroundSource, /startSilentNeteaseQuickPlay\('daily-recommend', tab\)/);
    assert.match(backgroundSource, /async function startSilentNeteaseQuickPlay\(mode, tab\)/);
    assert.match(backgroundSource, /cookieStr\.includes\('MUSIC_U'\)/);
    assert.match(backgroundSource, /await openNeteaseLogin\(tab\)/);
    assert.match(backgroundSource, /url: 'https:\/\/music\.163\.com\/'/);
    assert.match(backgroundSource, /command: 'play',[\s\S]*?songId: song\.songId/);
    assert.match(backgroundSource, /async function advanceSilentMusicPlayback\(direction = 1, ended = false, attempts = 0\)/);
    assert.match(backgroundSource, /async function controlNeteaseMusic\(action, tab\)/);
    assert.match(backgroundSource, /async function restoreSilentMusicPlayback\(songId\)/);
    assert.match(backgroundSource, /musicCommands\[command\]/);
    assert.match(backgroundSource, /command: 'togglePlay'/);
    assert.match(backgroundSource, /command: 'getState'/);
    assert.match(backgroundSource, /if \(silentMusicPlayback\)[\s\S]*?String\(message\.songId\) === String\(activeSongId\)/);
    assert.match(backgroundSource, /身份不一致必须直接忽略/);
    assert.match(backgroundSource, /await chrome\.contextMenus\.removeAll\(\)/);
    const silentQuickPlaySource = backgroundSource.slice(
        backgroundSource.indexOf('async function startSilentNeteaseQuickPlay'),
        backgroundSource.indexOf('async function _sendMusicControl')
    );
    assert.doesNotMatch(silentQuickPlaySource, /chrome\.tabs\.(?:create|update)/);
    assert.match(backgroundSource, /musicPlaylistCache/);
    assert.match(backgroundSource, /lastMusicState/);
});

test('助手播放在入口检查代次，使用已验证资源且等待播放回执', async () => {
    const controller = loadController();
    controller._currentSongId = 99;
    assert.equal((await controller._playSongById(1, { assistantGuard: () => false })).ok, false);
    assert.equal(controller._currentSongId, 99);
    controller._offscreenMode = true;
    controller._playlist = [{ songId: 1, title: '歌曲', artist: '歌手', index: 0 }];
    controller._getSongUrl = () => assert.fail('不能重复获取已准备的链接');
    controller._neteaseApi = () => assert.fail('不能重复获取已准备的详情');
    controller._updateUI = () => {};
    controller._setRowLoading = () => {};
    controller._tryFetchLyricsForCurrentSong = () => {};
    controller._recordLocalPlayHistory = () => {};
    controller._offscreenPlay = async () => ({ ok: false });
    const options = { resolvedUrl: 'https://audio.test/1.mp3', resolvedDetail: { ok: false }, assistantGuard: () => true };
    assert.equal((await controller._playSongById(1, options)).ok, false);
    controller._offscreenPlay = async () => ({ ok: true });
    assert.equal((await controller._playSongById(1, options)).ok, true);
});

test('音乐搜索对空结果使用真实候选兜底，传统搜索与助手复用', async () => {
    const controller = loadController(); const calls = [];
    controller._neteaseApi = async (endpoint, params, method) => {
        calls.push({ endpoint, params, method });
        return { ok: true, data: { result: { songs: endpoint.includes('suggest') ? [{ id: 123, name: '歌曲' }] : [] } } };
    };
    const result = await controller._searchSongCandidates('歌曲');
    assert.equal(result.data.result.songs[0].id, 123);
    assert.equal(calls.length, 3); assert.ok(calls.every(call => call.method === 'POST'));
});

test('后台切歌同步歌曲身份、首页展示和队列，旧快照不能回滚', () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._currentSongId = 101;
    controller.state.title = 'Always Online';
    controller.state.artists = [{ id: 1, name: '旧歌手' }];
    controller._playlist = [{ songId: 101, isActive: true }, { songId: 202, isActive: false }];
    let displayed;
    controller._updateUI = () => { displayed = { ...controller.state }; };
    controller._show = controller._hideMetaGuide = controller._throttleSaveState = controller._onSongChange = () => {};
    controller._handleOffscreenState({ stateVersion: 20, songId: 202, title: '萤火星', artist: '那吾克热-NW/花小皮', cover: 'new-cover', currentTime: 42, isPlaying: true });
    assert.equal(controller._currentSongId, 202);
    assert.equal(displayed.title, '萤火星');
    assert.equal(displayed.currentTime, 42);
    assert.equal(displayed.artists.length, 0);
    assert.equal(controller._playlist[1].isActive, true);
    assert.equal(controller._playlist[0].isActive, false);
    controller._handleOffscreenState({ stateVersion: 19, songId: 101, title: 'Always Online', currentTime: 9 });
    assert.equal(displayed.title, '萤火星');
    assert.equal(controller.state.currentTime, 42);
});

test('切歌请求进行期间忽略旧音频广播，完成后接受后台切歌', () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._currentSongId = 202;
    controller._pendingPlayRequest = 1;
    controller.state.title = '用户刚选择的歌';
    controller._updateUI = controller._show = controller._hideMetaGuide = controller._throttleSaveState = controller._onSongChange = () => {};
    controller._handleOffscreenState({ stateVersion: 20, songId: 101, title: '旧音频', isPlaying: true });
    assert.equal(controller.state.title, '用户刚选择的歌');
    controller._pendingPlayRequest = null;
    controller._handleOffscreenState({ stateVersion: 21, songId: 303, title: '后台下一首', isPlaying: true });
    assert.equal(controller.state.title, '后台下一首');
    assert.equal(controller._currentSongId, 303);
});

test('启动立即读取真实播放器快照，恢复页面时不依赖历史缓存', async () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._offscreenCommand = async command => {
        assert.equal(command, 'getState');
        return { ok: true, data: { songId: 202, title: '真实歌曲' } };
    };
    let snapshot;
    controller._handleOffscreenState = data => { snapshot = data; };
    controller._startPolling();
    try {
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(snapshot.title, '真实歌曲');
    } finally { clearInterval(controller._pollTimer); }
});

function loadShortcutBackground(chrome, sendToOffscreen, neteaseApiCall = async () => ({})) {
    const context = { chrome, sendToOffscreen, neteaseApiCall, logExtEvent() {}, console, MusicQueuePolicy: require('../js/music-queue-policy.js') };
    chrome.storage ||= { local: {} };
    if (!chrome.storage.local.get) chrome.storage.local.get = async () => ({});
    vm.createContext(context);
    const start = backgroundSource.indexOf('    function normalizeSilentMusicSong');
    const end = backgroundSource.indexOf('    // ==================== 温情提示', start);
    vm.runInContext(`let silentMusicPlayback = null; ${backgroundSource.slice(start, end)}
        globalThis.control = controlNeteaseMusic; globalThis.advance = advanceNeteaseMusic;
        globalThis.setPlayback = value => { silentMusicPlayback = value; };`, context);
    return context;
}

test('快捷键下一首只交给一个主页执行，其他主页只接收播放状态', async () => {
    const listeners = [];
    const controllers = [1, 2].map(id => {
        const controller = loadController({}, {
            tabs: { getCurrent: async () => ({ id }) },
            runtime: { onMessage: { addListener: fn => listeners.push(fn) } },
        });
        controller.nextCount = 0;
        controller._nextTrack = () => { controller.nextCount++; };
        controller._listenMessages();
        return controller;
    });
    const context = loadShortcutBackground({
        tabs: { query: async () => [
            { id: 1, url: 'extension://index.html', active: false },
            { id: 2, url: 'extension://index.html', active: true },
        ] },
        runtime: { getURL: () => 'extension://index.html', sendMessage: async msg => { listeners.forEach(fn => fn(msg)); } },
    }, async () => ({ ok: true, data: { songId: 101 } }));
    await context.control('next');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(controllers[0].nextCount, 0);
    assert.equal(controllers[1].nextCount, 1);
});

test('后台连续快捷键切歌，旧 URL 迟到不回播、不覆盖存储', async () => {
    const first = deferred();
    const second = deferred();
    const played = [];
    const saved = [];
    const context = loadShortcutBackground({ storage: { local: { set: async value => saved.push(value) } } }, async msg => {
        if (msg.command === 'getState') return { ok: true, data: { songId: 101 } };
        played.push(msg.songId);
        return { ok: true };
    }, async (_endpoint, params) => JSON.parse(params.ids)[0] === 202 ? first.promise : second.promise);
    context.setPlayback({ id: 1, index: 0, name: '队列', songs: [
        { songId: 101, title: '初始' }, { songId: 202, title: '第一下' }, { songId: 303, title: '第二下' },
    ] });
    // 两次命令均在真实音频仍是 101 时发起。
    const one = context.control('next');
    const two = context.control('next');
    second.resolve({ data: [{ url: 'https://audio.test/303' }] });
    await two;
    first.resolve({ data: [{ url: 'https://audio.test/202' }] });
    await one;
    assert.deepEqual(played, [303]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].lastMusicState.songId, 303);
});

function recoveryBackground({ songId = null, open = false, failToggle = false } = {}) {
    const messages = [];
    const requests = [];
    const saved = { lastMusicState: { songId: 202, currentTime: 47, savedAt: Date.now() },
        musicPlaylistCache: { savedAt: Date.now(), playlistName: '原队列', playlist: [
            { songId: 101 }, { songId: 202 }, { songId: 303 },
        ] } };
    const context = loadShortcutBackground({
        tabs: { query: async () => open ? [{ id: 7, url: 'chrome://newtab/', active: true }] : [] },
        runtime: { getURL: () => 'extension://index.html', sendMessage: async msg => messages.push(msg) },
        storage: { local: { get: async () => saved, set: async () => {} } },
    }, async msg => {
        if (msg.command === 'getState') return { ok: true, data: { songId, currentTime: 47 } };
        messages.push(msg);
        return { ok: !(failToggle && msg.command === 'togglePlay') };
    }, async (endpoint) => { requests.push(endpoint); return { data: [{ url: 'https://audio.test/song' }] }; });
    return { context, messages, requests, saved };
}

for (const [action, expected] of [['toggle', 202], ['next', 303], ['prev', 101]]) {
    test(`后台回收后 ${action} 沿用持久化原队列`, async () => {
        const { context, messages, requests } = recoveryBackground();
        assert.equal(await context.control(action), true);
        const play = messages.find(msg => msg.command === 'play');
        assert.equal(play.songId, expected);
        if (action === 'toggle') assert.equal(play.startTime, 47);
        assert.ok(requests.every(endpoint => endpoint.includes('/song/')));
    });
    test(`新标签页打开且后台回收后 ${action} 交给当前工作台`, async () => {
        const { context, messages, requests } = recoveryBackground({ open: true });
        assert.equal(await context.control(action), true);
        assert.equal(messages[0].command, action);
        assert.equal(messages[0].targetTabId, 7);
        assert.equal(requests.length, 0);
    });
}

test('原曲恢复失败重新取原曲 URL，不启动 FM', async () => {
    const { context, messages, requests } = recoveryBackground({ songId: 202, failToggle: true });
    await context.control('toggle');
    assert.equal(messages.find(msg => msg.command === 'play').songId, 202);
    assert.ok(requests.every(endpoint => endpoint.includes('/song/')));
});

test('缺失或不匹配的恢复队列不偷偷启动其他播放源', async () => {
    const { context, messages, requests, saved } = recoveryBackground();
    saved.lastMusicState.songId = 999;
    assert.equal(await context.control('toggle'), false);
    assert.equal(messages.length, 0);
    assert.equal(requests.length, 0);
});

test('重建的空状态保留原歌曲和进度，显式停止仍清空', () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._currentSongId = 202;
    controller.state = { title: '原曲', currentTime: 47, isPlaying: true };
    controller._updateUI = controller._show = controller._throttleSaveState = () => {};
    controller._handleOffscreenState({ songId: null, title: '', currentTime: 0, isPlaying: false });
    assert.equal(controller._currentSongId, 202);
    assert.equal(controller.state.currentTime, 47);
    assert.equal(controller.state.isPlaying, false);
    controller._handleOffscreenState({ songId: null, title: '', currentTime: 0, stopped: true });
    assert.equal(controller._currentSongId, null);
    assert.equal(controller.state.title, '');
});

test('恢复原曲取不到 URL 时保持原队列并停止，不自动跳歌', async () => {
    const controller = loadController();
    controller._offscreenMode = true;
    controller._currentSongId = 202;
    controller._playlist = [{ songId: 202 }, { songId: 303 }];
    controller._getSongUrl = async () => '';
    controller._neteaseApi = async () => ({ ok: false });
    controller._setRowLoading = controller._updateUI = controller._showToast = () => {};
    controller._autoSkipOnError = () => assert.fail('恢复失败不应切歌');
    assert.equal((await controller._playSongById(202, { resume: true })).ok, false);
    assert.equal(controller._currentSongId, 202);
    assert.equal(controller.state.isPlaying, false);
});

test('迟到的后台恢复 URL 不覆盖随后选择的下一首', async () => {
    const late = deferred();
    const { context, messages } = recoveryBackground();
    let count = 0;
    context.neteaseApiCall = async () => ++count === 1 ? late.promise : { data: [{ url: 'https://audio.test/next' }] };
    const resume = context.control('toggle');
    await new Promise(resolve => setImmediate(resolve));
    await context.control('next');
    late.resolve({ data: [{ url: 'https://audio.test/old' }] });
    await resume;
    assert.deepEqual(messages.filter(msg => msg.command === 'play').map(msg => msg.songId), [303]);
});

test('后台恢复后自然结束遵循列表循环，末尾返回首曲', async () => {
    const f = recoveryBackground({ songId: 303 }); f.saved.musicPlayMode = 'loop';
    await f.context.advance(1, 303, true);
    assert.equal(f.messages.find(m => m.command === 'play').songId, 101);
});
test('后台恢复后单曲循环只作用于自然结束，手动下一首仍前进', async () => {
    const ended = recoveryBackground({ songId: 202 }); ended.saved.musicPlayMode = 'single';
    await ended.context.advance(1, 202, true);
    assert.equal(ended.messages.find(m => m.command === 'play').songId, 202);
    const manual = recoveryBackground({ songId: 202 }); manual.saved.musicPlayMode = 'single';
    await manual.context.control('next');
    assert.equal(manual.messages.find(m => m.command === 'play').songId, 303);
});
test('后台恢复后的随机续播不立即重播当前歌曲', async () => {
    const f = recoveryBackground({ songId: 202 }); f.saved.musicPlayMode = 'shuffle';
    await f.context.advance(1, 202, true);
    const songId = f.messages.find(m => m.command === 'play').songId;
    assert.ok([101, 303].includes(songId));
});
