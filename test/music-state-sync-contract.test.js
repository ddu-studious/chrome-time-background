const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/music-controller.js'), 'utf8');
const offscreenSource = fs.readFileSync(path.join(root, 'js/offscreen.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(root, 'js/background.js'), 'utf8');

function loadController(localStorageState = {}) {
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
    const context = {
        window: {}, document, chrome, console,
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
    controller.state.title = '新歌';
    controller.state.artist = '新歌手';
    controller._updateUI = () => {};
    controller._show = () => {};
    controller._hideMetaGuide = () => {};
    controller._showMetaGuide = () => {};
    controller._throttleSaveState = () => {};

    controller._handleOffscreenState({
        songId: 101,
        title: '旧歌',
        artist: '旧歌手',
        currentTime: 18,
        isPlaying: true,
    });

    assert.equal(controller.state.title, '新歌');
    assert.equal(controller.state.artist, '新歌手');
    assert.equal(controller.state.currentTime, 18);
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
    assert.match(backgroundSource, /async function advanceSilentMusicPlayback\(direction = 1\)/);
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
