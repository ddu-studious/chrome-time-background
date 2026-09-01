const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const createBilibiliController = () => {
  const sandbox = { window: {}, console: { warn() {} } };
  vm.runInNewContext(read('js/bilibili-controller.js'), sandbox);
  return sandbox.window.bilibiliController;
};

test('B站七个设计页面映射到唯一控制器', () => {
  const source = read('js/bilibili-controller.js');
  assert.ok(source.includes("setBusinessPage?.('bilibili', page)"));
  for (const page of ['recommend', 'player', 'course', 'library', 'history-ranking', 'search', 'login-error']) {
    assert.ok(source.includes(`'${page}'`), `missing bilibili/${page}`);
  }
  assert.ok(source.includes("if (tab === 'favorite' || tab === 'watchlater') return 'library'"));
  assert.ok(source.includes("if (tab === 'history' || tab === 'ranking') return 'history-ranking'"));
});

test('播放器继续复用真实嵌入播放器与观看记忆', () => {
  const source = read('js/bilibili-controller.js');
  assert.ok(source.includes("this._setProductPage('player')"));
  assert.ok(source.includes('this._getWatchMemory(item.bvid)'));
  assert.ok(source.includes('this._saveWatchMemory'));
  assert.ok(source.includes('bilibili.com/video/${item.bvid}'));
});

test('登录异常页提供重登、重试和本地进度保护说明', () => {
  const source = read('js/bilibili-controller.js');
  assert.ok(source.includes('_renderLoginError(tab)'));
  assert.ok(source.includes('本地观看进度不会被清除'));
  assert.ok(source.includes('data-bili-login="retry"'));
  assert.ok(source.includes('扩展只读取浏览器登录态，不会保存你的密码'));
  assert.ok(source.includes('frame.innerHTML = this._emptyPlayerMarkup()'));
  assert.ok(source.includes("this._setProductPage(this._pageForTab(tab))"));
});

test('B站工作台隔离背景并管理初始与返回焦点', () => {
  const source = read('js/bilibili-controller.js');
  const index = read('index.html');
  assert.ok(source.includes("el.setAttribute('role', 'dialog')"));
  assert.ok(source.includes("el.setAttribute('aria-modal', 'true')"));
  assert.ok(source.includes('this._setBackgroundInert(true)'));
  assert.ok(source.includes("searchInput?.focus({ preventScroll: true })"));
  assert.ok(source.includes('this._returnFocus?.focus?.({ preventScroll: true })'));
  assert.ok(source.includes("if (e.key === 'Tab') this._trapFocus(e)"));
  assert.ok(index.includes('js/bilibili-controller.js?v=29'));
});

test('B站工作台同步真实视口高度并提供可操作播放器空态', () => {
  const source = read('js/bilibili-controller.js');
  const style = read('css/style.css');
  assert.ok(source.includes("window.addEventListener('resize', this._handleViewportResize"));
  assert.ok(source.includes("this._el.style.setProperty('--bili-viewport-height'"));
  assert.ok(source.includes('data-bili-empty-tab="recommend"'));
  assert.ok(source.includes('data-bili-empty-tab="history"'));
  assert.ok(source.includes('data-bili-empty-tab="course"'));
  assert.ok(style.includes('height: var(--bili-viewport-height, 100dvh)'));
  assert.ok(style.includes('.bili-empty-actions'));
});

test('B站视图与视频列表支持键盘和可读状态', () => {
  const source = read('js/bilibili-controller.js');
  assert.ok(source.includes('aria-pressed="true"'));
  assert.ok(source.includes('role="button" tabindex="0" aria-label="播放 '));
  assert.ok(source.includes("event.key !== 'Enter' && event.key !== ' '"));
  assert.ok(source.includes("p.setAttribute('aria-pressed', String(active))"));
});

test('B站画质切换失败会保留真实画质并停止重复失败', () => {
  const source = read('js/bilibili-controller.js');
  const style = read('css/style.css');
  assert.ok(source.includes('id="bili-quality-status"'));
  assert.ok(source.includes('未能切换到 ${requestedLabel}，已保留 ${fallbackLabel}'));
  assert.ok(source.includes('this._preferredQuality = this._currentQuality || 0'));
  assert.ok(source.includes("this._setQualityStatus(`未切换 · 保留 ${fallbackLabel}`, 'fallback')"));
  assert.ok(style.includes('.bili-quality-status[data-tone="fallback"]'));
});

test('B站画质状态以运行时播放器和可见控制栏校准初始化数据', () => {
    const inject = read('js/bilibili-player-inject.js');
    const playInfoIndex = inject.indexOf('const pi = window.__playinfo__');
    const playerIndex = inject.indexOf('if (player?.getQuality) info.current = player.getQuality() || info.current');
    const domIndex = inject.indexOf('if (domInfo.current) info.current = domInfo.current');

    assert.ok(playInfoIndex >= 0, '应保留初始化画质作为兜底');
    assert.ok(playerIndex > playInfoIndex, '运行时播放器画质应覆盖初始化值');
    assert.ok(domIndex > playerIndex, '可见控制栏应作为最终实际画质校准');
});

test('B站短提示消失后不会把旧失败文案留在无障碍树', () => {
    const controller = read('js/bilibili-controller.js');
    assert.match(controller, /toast\.setAttribute\('role', 'status'\)/);
    assert.match(controller, /toast\.setAttribute\('aria-hidden', 'true'\)/);
    assert.match(controller, /toast\.textContent = ''/);
});

test('B站九项内容能力全部常驻可见且不再使用更多折叠菜单', () => {
  const source = read('js/bilibili-controller.js');
  for (const tab of ['recommend', 'course', 'favorite', 'history', 'popular', 'live', 'ranking', 'watchlater', 'following']) {
    assert.match(source, new RegExp(`class="bili-pill[^\"]*" data-tab="${tab}"`));
  }
  assert.doesNotMatch(source, /class="bili-stabs"/);
  assert.match(source, /class="bili-nav-scroll"/);
  assert.doesNotMatch(source, /bili-more-(?:btn|menu|item)/);
  assert.doesNotMatch(source, /_setMoreMenuOpen/);
});

test('B站直播 TAB 聚合关注与热门、关注优先去重并支持工作台内观看', async () => {
  const source = read('js/bilibili-controller.js');
  const background = read('js/background.js');
  const style = read('css/product-ui-v5.css');
  const controller = createBilibiliController();
  controller._loggedIn = true;
  controller._biliApi = async endpoint => {
    if (endpoint === '/xlive/web-ucenter/v1/xfetter/GetWebList') {
      return { code: 0, data: { rooms: [{ room_id: 100, uid: 1, uname: '关注主播', title: '关注直播', online: 20 }] } };
    }
    if (endpoint === '/room/v1/room/get_user_recommend') {
      return { code: 0, data: [
        { roomid: 100, uid: 1, uname: '热门重复项', title: '重复直播', online: 999 },
        { roomid: 545007, uid: 4856007, uname: '热门重复放映厅', title: '热门中的神剧', online: 100 },
        { roomid: 200, uid: 2, uname: '热门主播', title: '热门直播', online: 80 },
      ] };
    }
    if (endpoint === '/room/v3/area/getRoomList') {
      return { code: 0, data: { list: [
        { roomid: 545007, uid: 4856007, uname: '迷影社', title: '高分神剧直播间', online: 120, area_name: '电子榨菜', verify: { type: 1, role: 3, desc: '放映厅迷影社账号' } },
        { roomid: 999, uid: 9, uname: '未认证轮播', title: '电视剧全天播', online: 9999, area_name: '电子榨菜', verify: { type: -1, role: 0, desc: '' } },
      ] } };
    }
    if (endpoint === '/x/web-interface/search/type') {
      return { code: 0, data: { result: [
        { roomid: 300, uid: 3, uname: '电影观察员', title: '边看边聊影评', tags: '电影,影评,观影', cate_name: '电子榨菜', live_status: 1, online: 50, user_cover: '//i0.hdslb.com/review.jpg' },
        { roomid: 301, uid: 4, uname: '游戏主播', title: '电影解说后打游戏', tags: '游戏', cate_name: '单机游戏', live_status: 1, online: 9999, user_cover: '//i0.hdslb.com/game.jpg' },
      ] } };
    }
    throw new Error(`unexpected ${endpoint}`);
  };

  const rooms = await controller._fetchLive();
  assert.equal(JSON.stringify(rooms.map(room => [room.roomId, room.source, room.isDrama])), JSON.stringify([
    [100, 'following', false], [545007, 'drama', true], [300, 'drama', true], [200, 'popular', false],
  ]));
  assert.match(source, /data-tab="live"/);
  assert.match(source, /data-bili-live-filter="\$\{value\}"/);
  assert.match(source, /\['drama', '影视', dramaLiveCount\]/);
  assert.match(source, /trustedRoomIds = new Set\(\[545007\]\)/);
  assert.match(source, /Number\(room\?\.verify\?\.type\) === 1/);
  assert.match(source, /data-bili-drama-destination="cinema"/);
  assert.match(source, /data-bili-drama-destination="review"/);
  assert.match(source, /item\.isDrama \? '' : `<button type="button" class="bili-live-open"/);
  assert.match(source, /item\.isDrama \? '' : '<button type="button" data-bili-current-live-open>/);
  assert.match(source, /_fetchScreeningLiveRooms\(\)/);
  assert.match(source, /const keywords = \['影评', '电影解说', '放映厅'\]/);
  assert.match(source, /Number\(room\.live_status\) !== 1/);
  assert.match(source, /gameCategory/);
  assert.doesNotMatch(source, /_fetchDramaCatalog/);
  assert.doesNotMatch(source, /data-bili-drama-series-index/);
  assert.doesNotMatch(source, /item\.type === 'drama-series'/);
  assert.match(source, /https:\/\/www\.bilibili\.com\/blackboard\/live\/live-activity-player\.html\?cid=\$\{item\.roomId\}&quality=0&autoplay=1/);
  assert.doesNotMatch(source, /live\.bilibili\.com\/blanc\/\$\{item\.roomId\}/);
  assert.match(background, /www\.bilibili\.com\/blackboard\/live\/live-activity-player\.html/);
  assert.match(source, /data-bili-live-open/);
  assert.match(source, /_checkLiveBackend\(\)/);
  assert.match(source, /id="bili-live-apply-update"/);
  assert.match(source, /chrome\.runtime\.reload\(\)/);
  assert.match(background, /message\.action === 'bilibili_runtime_info'/);
  assert.match(source, /resp\?\.apiRevision === 'bilibili-live-v5'/);
  assert.match(background, /apiRevision: 'bilibili-live-v5'/);
  assert.match(background, /features: \{ bilibiliLive: true \}/);
  assert.match(background, /'\/room\/v1\/room\/get_user_recommend'/);
  assert.match(background, /'\/room\/v3\/area\/getRoomList'/);
  assert.match(background, /'\/x\/web-interface\/search\/type'/);
  assert.match(background, /'\/room\/v1\/Room\/playUrl'/);
  assert.match(background, /'\/xlive\/web-room\/v2\/index\/getRoomPlayInfo'/);
  assert.doesNotMatch(background, /'\/pgc\/season\/index\/result'/);
  assert.match(background, /'\/xlive\/web-ucenter\/v1\/xfetter\/GetWebList'/);
  assert.match(background, /api\.live\.bilibili\.com/);
  assert.match(style, /\.bili-live-toolbar/);
  assert.match(style, /\.bili-live-recovery/);
  assert.match(style, /\.bili-live-player-shell/);
  assert.match(style, /\.bili-drama-guide/);
  assert.match(style, /\.bili-drama-overview/);
  assert.doesNotMatch(style, /\.bili-drama-catalog/);
  assert.doesNotMatch(style, /\.bili-drama-series/);
});

test('B站直播在新版流为空或官方播放器超时时使用本地 FLV 降级', () => {
  const source = read('js/bilibili-controller.js');
  const index = read('index.html');
  const manifest = read('manifest.json');
  const style = read('css/product-ui-v5.css');
  const vendorLock = read('vendor/VENDOR.lock.md');

  assert.ok(fs.existsSync(path.join(root, 'vendor/flv.min.js')));
  assert.ok(fs.existsSync(path.join(root, 'vendor/flv.js.LICENSE')));
  assert.ok(index.indexOf('vendor/flv.min.js') < index.indexOf('js/bilibili-controller.js?v=29'));
  assert.match(manifest, /\*:\/\/\*\.bilivideo\.com\/\*/);
  assert.match(source, /_resolveLivePlaybackMode\(item\.roomId\)/);
  assert.match(source, /return resp\?\.code === 0 && Array\.isArray\(streams\) && streams\.length \? 'activity' : 'flv'/);
  assert.match(source, /_startLiveFlvFallback/);
  assert.match(source, /_fetchLiveFlvUrls/);
  assert.match(source, /window\.flvjs\.createPlayer/);
  assert.match(source, /enableWorker: false/);
  assert.match(source, /index \+ 1 < urls\.length/);
  assert.match(source, /playerOperation-/);
  assert.match(source, /10000/);
  assert.match(style, /\.bili-live-flv-wrap/);
  assert.match(style, /\.bili-live-fallback-retry/);
  assert.match(vendorLock, /flv\.js@1\.6\.2/);
  assert.doesNotMatch(index, /<script src="https:\/\//);
});

test('B站直播播放模式以真实流结果选择官方播放器或 FLV', async () => {
  const controller = createBilibiliController();
  controller._biliApi = async endpoint => {
    if (endpoint === '/xlive/web-room/v2/index/getRoomPlayInfo') {
      return { code: 0, data: { playurl_info: { playurl: { stream: [] } } } };
    }
    if (endpoint === '/room/v1/Room/playUrl') {
      return { code: 0, data: { durl: [
        { url: 'https://cdn.example/live.flv?token=one' },
        { url: 'http://insecure.example/live.flv' },
      ] } };
    }
    throw new Error(`unexpected ${endpoint}`);
  };
  assert.equal(await controller._resolveLivePlaybackMode(545007), 'flv');
  assert.equal(JSON.stringify(await controller._fetchLiveFlvUrls(545007)), JSON.stringify(['https://cdn.example/live.flv?token=one']));

  controller._biliApi = async () => ({ code: 0, data: { playurl_info: { playurl: { stream: [{}] } } } });
  assert.equal(await controller._resolveLivePlaybackMode(21686237), 'activity');
});

test('B站关注页区分总数与已加载数并提供分组搜索和分页', () => {
  const source = read('js/bilibili-controller.js');
  assert.match(source, /this\._followPageSize = 50/);
  assert.match(source, /pn: this\._followPage/);
  assert.match(source, /this\._followTotal = Math\.max\(total, items\.length\)/);
  assert.match(source, /id="bili-follow-search"/);
  assert.match(source, /id="bili-follow-match-count"/);
  assert.match(source, /已加载 <b>\$\{items\.length\}<\/b> \/ \$\{this\._followTotal\}/);
  assert.match(source, /id="bili-follow-load-more"/);
  assert.match(source, /aria-selected=/);
});

test('B站关注页把主页和最新视频拆成明确动作并使用真实头像建设主工作台', () => {
  const source = read('js/bilibili-controller.js');
  const background = read('js/background.js');
  const style = read('css/product-ui-v5.css');
  assert.match(source, /class="bili-follow-profile-btn"/);
  assert.match(source, /class="bili-follow-latest-btn"/);
  assert.match(source, /_playLatestForUser/);
  assert.match(source, /\/x\/polymer\/web-dynamic\/v1\/feed\/space/);
  assert.match(source, /module_dynamic\?\.major\?\.archive/);
  assert.match(source, /_showBiliToast\(`获取最新视频失败/);
  assert.doesNotMatch(source, /this\._showToast/);
  assert.match(background, /'\/x\/polymer\/web-dynamic\/v1\/feed\/space'/);
  assert.match(source, /class="bili-follow-workbench"/);
  assert.match(source, /data-bili-follow-action="profile"/);
  assert.match(source, /data-bili-follow-action="latest"/);
  assert.match(source, /src="\$\{this\._esc\(user\.face\)\}"/);
  assert.match(source, /assets\/bilibili\/follow-empty-v1\.png/);
  assert.match(source, /id="bili-follow-search-empty" hidden/);
  assert.match(source, /id="bili-follow-clear-search"/);
  assert.match(style, /\.bili-follow-empty/);
  assert.ok(fs.existsSync(path.join(root, 'assets/bilibili/follow-empty-v1.png')));
  assert.match(style, /\.bili-follow-work-grid/);
  assert.match(style, /\.bili-follow-work-portraits/);
});

test('B站 UP 主主页留在 App 内并形成身份、投稿、返回与原站入口闭环', () => {
  const source = read('js/bilibili-controller.js');
  const background = read('js/background.js');
  const style = read('css/product-ui-v5.css');

  assert.match(source, /async _loadUserSpace\(mid, uname = '', profileHint = null\)/);
  assert.doesNotMatch(source, /frame\.innerHTML = `<iframe src="https:\/\/space\.bilibili\.com\/\$\{mid\}"/);
  assert.match(source, /class="bili-creator-home/);
  assert.match(source, /class="bili-creator-hero"/);
  assert.match(source, /this\._fetchCreatorVideos\(creatorMid, this\._creatorView\.uname, 24\)/);
  assert.match(source, /ps: pageSize,[\s\S]*pn: 1,[\s\S]*order: 'pubdate'/);
  assert.match(source, /data-bili-creator-action="back"/);
  assert.match(source, /data-bili-creator-action="play-latest"/);
  assert.match(source, /data-bili-creator-action="open-space"/);
  assert.match(source, /data-bili-creator-action="layout-grid"/);
  assert.match(source, /data-bili-creator-action="layout-list"/);
  assert.match(source, /class="bili-creator-video-play-button"/);
  assert.match(source, /id="bili-act-creator"/);
  assert.match(source, /class="bili-item-creator-btn"/);
  assert.match(source, /mid: v\.mid \|\| v\.author_mid \|\| 0/);

  assert.match(background, /'\/x\/space\/wbi\/acc\/info'/);
  assert.match(background, /'\/x\/relation\/stat'/);
  assert.match(style, /\.bili-creator-home/);
  assert.match(style, /\.bili-creator-grid/);
  assert.match(style, /\.bili-creator-home\.is-list/);
  assert.match(style, /\.bili-panel\.bili-creator-view \.bili-sidebar/);
  assert.match(style, /\.bili-panel:not\(\.bili-creator-view\) \.bili-main:has\(\.bili-sidebar\.visible\)/);
});

test('B站 UP 主投稿接口失败时从动态流恢复视频并去重', async () => {
  const controller = createBilibiliController();
  const calls = [];
  controller._biliApi = async endpoint => {
    calls.push(endpoint);
    if (endpoint === '/x/space/wbi/arc/search') {
      throw new Error('B站 API 请求失败: 412');
    }
    return {
      code: 0,
      data: {
        items: [
          {
            modules: {
              module_author: { pub_ts: 1710000000 },
              module_dynamic: { major: { archive: {
                bvid: 'BV1fallback', title: '恢复的视频', cover: '//i0.hdslb.com/demo.jpg',
                duration_text: '12:34', stat: { play: 12345, danmaku: 67 },
              } } },
            },
          },
          {
            modules: {
              module_dynamic: { major: { archive: {
                bvid: 'BV1fallback', title: '重复视频', cover: '', duration_text: '12:34', stat: {},
              } } },
            },
          },
        ],
      },
    };
  };

  const result = await controller._fetchCreatorVideos(10086, '环球直达', 24);

  assert.deepEqual(calls, ['/x/space/wbi/arc/search', '/x/polymer/web-dynamic/v1/feed/space']);
  assert.equal(result.source, 'dynamic');
  assert.equal(result.videos.length, 1);
  assert.equal(result.videos[0].bvid, 'BV1fallback');
  assert.equal(result.videos[0].author, '环球直达');
  assert.equal(result.videos[0].duration, '12:34');
  assert.equal(result.videos[0].views, '1.2万');
});

test('B站浏览工作台同时使用真实封面和四项能力配图', () => {
  const source = read('js/bilibili-controller.js');
  const style = read('css/product-ui-v5.css');
  const assets = [
    'assets/bilibili/capability-recommend-v1.png',
    'assets/bilibili/capability-course-v1.png',
    'assets/bilibili/capability-library-v1.png',
    'assets/bilibili/capability-history-v1.png',
  ];
  for (const asset of assets) {
    assert.ok(fs.existsSync(path.join(root, asset)), `missing ${asset}`);
    assert.ok(source.includes(asset), `controller missing ${asset}`);
  }
  assert.match(source, /hero\.cover \|\| this\._assetUrl\(meta\.asset\)/);
  assert.match(source, /data-bili-overview-index/);
  assert.match(source, /_bindImageFallbacks/);
  assert.match(style, /\.bili-overview-capabilities/);
  assert.match(style, /\.bili-overview-video-grid/);
});

test('B站搜索结果提供可解释指标、选择信号与多维排序', () => {
  const controller = createBilibiliController();
  const source = read('js/bilibili-controller.js');
  const style = read('css/product-ui-v5.css');
  const recent = Math.floor(Date.now() / 1000) - 86400;
  const items = [
    { sourceRank: 1, viewsCount: 1000, favoritesCount: 50, danmakuCount: 5, durationSec: 500, pubdate: recent },
    { sourceRank: 2, viewsCount: 100000, favoritesCount: 1000, danmakuCount: 50, durationSec: 2400, pubdate: recent - 86400 },
  ];
  assert.deepEqual(Array.from(controller._sortSearchItems(items, 'hot'), item => item.sourceRank), [2, 1]);
  assert.deepEqual(Array.from(controller._sortSearchItems(items, 'favorite'), item => item.sourceRank), [1, 2]);
  assert.equal(controller._searchFavoriteRate(items[0]), 5);
  assert.equal(controller._searchDiscussionDensity(items[0]), 5);
  const signals = Array.from(controller._searchSignals(items[0]), signal => signal[1]);
  assert.ok(signals.includes('快速看'));
  assert.ok(signals.includes('高收藏'));
  assert.ok(source.includes('data-bili-search-sort="${value}"'));
  assert.ok(source.includes('收藏率 = 收藏 / 播放'));
  assert.ok(source.includes('讨论度 = 每千次播放弹幕'));
  assert.match(style, /\.bili-search-guide/);
  assert.match(style, /\.bili-search-metrics/);
  assert.match(style, /\.bili-search-signal\[data-tone="save"\]/);
});

test('B站课程默认进入有图的发现工作台且保留我的课程入口', () => {
  const source = read('js/bilibili-controller.js');
  assert.match(source, /data-csrc="mine"[^>]*>[^<]*<i[^>]*><\/i> 我的课程/);
  assert.match(source, /data-csrc="discover"[^>]*active|bili-course-tab active" data-csrc="discover"/);
  assert.match(source, /await this\._loadCourseContent\('discover', listEl\)/);
  assert.match(source, /_renderBrowseOverview\('course', items, true\)/);
  assert.match(source, /keyword: 'AI'/);
  assert.match(source, /_renderCourseDiscoveryFallback/);
  assert.match(source, /data-bili-course-source="mine"/);
});

test('B站播放器底部按播放状态、偏好和操作三层组织并支持直接控制', () => {
  const source = read('js/bilibili-controller.js');
  const style = read('css/product-ui-v5.css');
  for (const id of [
    'bili-np-cover', 'bili-progress-time', 'bili-progress-duration',
    'bili-play-toggle', 'bili-progress-range', 'bili-speed-status',
    'bili-quality-status', 'bili-act-copy', 'bili-act-open',
  ]) {
    assert.ok(source.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.match(source, /type: 'bili-ext-toggle-play'/);
  assert.match(source, /type: 'bili-ext-seek', time: target/);
  assert.match(source, /navigator\.clipboard\.writeText\(bvid\)/);
  assert.match(style, /\.bili-playback-console/);
  assert.match(style, /\.bili-transport/);
  assert.match(style, /\.bili-progress-control/);
  for (const id of ['bili-speed-cycle', 'bili-recent-toggle', 'bili-settings-toggle', 'bili-details-toggle']) {
    assert.ok(source.includes(`id="${id}"`), `missing compact drawer trigger ${id}`);
  }
  assert.match(source, /const speeds = \[1, 1\.25, 1\.5, 2, 3\]/);
  assert.match(source, /_cycleSpeed\(\)/);
  assert.match(source, /_togglePlayerDrawer\(sectionId, buttonId\)/);
  assert.match(style, /\.bili-player-recent\[data-collapsed="true"\]/);
  assert.match(style, /\.bili-nav-scroll/);
  assert.match(style, /\.bili-playback-console \.bili-now-playing \{[\s\S]*?position: relative/);
  assert.match(style, /@container bili-player-area \(max-width:1180px\)/);
  assert.match(style, /width: min\(100%,calc\(100cqh \* 1\.77778\)\)/);
  assert.match(style, /grid-template-columns: minmax\(0,1fr\) 0/);
  assert.match(style, /\.bili-main:has\(\.bili-sidebar\.visible\)/);
  assert.match(style, /@media\(max-width:640px\)[\s\S]*?\.bili-panel:not\(\.bili-creator-view\) \.bili-main:has\(\.bili-sidebar\.visible\) \{ grid-template-columns: minmax\(0,1fr\) 0; \}/);
});

test('B站播放器展示当前 UP 主最近发布并可在工作台内即时切换', () => {
  const source = read('js/bilibili-controller.js');
  const style = read('css/product-ui-v5.css');
  const index = read('index.html');
  for (const contract of [
    'id="bili-player-recent"',
    'data-bili-recent-index',
    'data-bili-recent-action="refresh"',
    'data-bili-recent-action="creator"',
    'async _loadPlayerRecent(item, force = false)',
    'this._fetchCreatorVideos(mid, item.author, 8)',
    'this._loadPlayerRecent(item)',
  ]) assert.ok(source.includes(contract), `缺少最近发布契约: ${contract}`);
  for (const contract of ['.bili-player-recent', '.bili-recent-track', '.bili-recent-card.active']) {
    assert.ok(style.includes(contract), `缺少最近发布样式: ${contract}`);
  }
  assert.ok(index.includes('css/product-ui-v5.css?v=40'));
});

test('B站播放器进入和自动连播新视频时都会自动应用 2 倍速', () => {
  const source = read('js/bilibili-controller.js');
  for (const contract of [
    'this._currentSpeed = 2',
    'this._autoSpeedPending = true',
    '_applyAutoSpeed()',
    "this._sendPlayerMsg({ type: 'bili-ext-set-speed', speed: 2 })",
    'if (videoChanged) this._autoSpeedPending = true',
  ]) assert.ok(source.includes(contract), `缺少 B站自动 2 倍速契约: ${contract}`);
});

test('B站播放器未保存画质偏好时默认请求 1080P 并保留降级能力', () => {
  const source = read('js/bilibili-controller.js');
  assert.match(source, /this\._preferredQuality = 80/);
  assert.match(source, /if \(biliPlayerPrefs\.quality > 0\) this\._preferredQuality = biliPlayerPrefs\.quality/);
  assert.match(source, /available\.find\(q => q <= this\._preferredQuality\)/);
});

test('B站播放器仅在对应列表呈现危险操作并为状态按钮提供可读状态', () => {
  const source = read('js/bilibili-controller.js');
  assert.match(source, /id="bili-act-rm-later"[^>]*hidden/);
  assert.match(source, /id="bili-act-rm-fav"[^>]*hidden/);
  assert.match(source, /const inWatchlater = this\._currentTab === 'watchlater'/);
  assert.match(source, /const inFavorite = this\._currentTab === 'favorite'/);
  assert.match(source, /removeLater\.hidden = !hasVideo \|\| !inWatchlater/);
  assert.match(source, /removeFavorite\.hidden = !hasVideo \|\| !inFavorite/);
  assert.match(source, /playButton\.setAttribute\('aria-pressed', String\(!paused\)\)/);
  assert.match(source, /btn\.setAttribute\('aria-pressed', String\(active\)\)/);
});

test('B站播放器用真实 iframe 消息同步自动连播身份并兼容冒号时长', () => {
  const source = read('js/bilibili-controller.js');
  const inject = read('js/bilibili-player-inject.js');
  const background = read('js/background.js');
  assert.match(source, /e\.source !== iframe\.contentWindow/);
  assert.ok(source.includes("/^https:\\/\\/(?:www|player)\\.bilibili\\.com$/.test(e.origin)"));
  assert.match(source, /state\.bvid !== this\._currentVideo\.bvid/);
  assert.match(source, /_biliApi\('\/x\/web-interface\/view', \{ bvid \}\)/);
  assert.match(source, /this\._renderPlayerMetadata\(item\)/);
  assert.match(source, /raw\.split\(':'\)\.map\(Number\)/);
  assert.match(source, /return parts\.reduce\(\(total, part\) => total \* 60 \+ part, 0\)/);
  assert.match(inject, /const bvid = getBvidFromUrl\(\)/);
  assert.match(inject, /type: MSG_PREFIX \+ 'title-info',[\s\S]*?bvid,/);
  assert.match(background, /'\/x\/web-interface\/view'/);
});
