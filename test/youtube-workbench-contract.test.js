const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest 只增加 YouTube 官方身份、API 和播放器权限', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.permissions.includes('identity'));
  for (const host of [
    'https://www.googleapis.com/*',
    'https://www.youtube.com/*',
    'https://www.youtube-nocookie.com/*',
  ]) assert.ok(manifest.host_permissions.includes(host), `缺少 host permission: ${host}`);
  assert.equal(manifest.content_scripts.some(entry => entry.matches.some(pattern => pattern.includes('youtube'))), false);
  assert.equal(manifest.oauth2.client_id, '1007025986012-gsr45foqj45aueagb35osdi3hqmp38lg.apps.googleusercontent.com');
  assert.deepEqual(manifest.oauth2.scopes, ['https://www.googleapis.com/auth/youtube.readonly']);
});

test('工作台接入 Dock、启动流程、设置和 v5 页面注册表', () => {
  const index = read('index.html');
  const main = read('js/main.js');
  const settings = read('js/settings.js');
  const settingsPage = read('js/settings-page.js');
  const settingsHtml = read('settings.html');
  assert.ok(index.includes('id="youtube-dock-btn"'));
  assert.ok(index.includes('css/youtube-workbench.css?v=4'));
  assert.ok(index.includes('js/youtube-controller.js?v=12'));
  assert.ok(main.includes("getSetting('enableYouTube')"));
  assert.ok(main.includes('await window.youtubeController.init()'));
  assert.ok(settings.includes('enableYouTube: true'));
  assert.ok(settingsPage.includes('enableYouTube: true'));
  assert.ok(settingsHtml.includes('id="set-enableYouTube"'));

  const context = { window: {}, console };
  vm.runInNewContext(read('js/product-pages-v5.js'), context);
  assert.deepEqual(
    Array.from(context.window.ProductPagesV5.list('youtube'), page => page.id),
    ['connect', 'recommended', 'trending', 'player', 'subscriptions', 'library', 'local-queue', 'search', 'error']
  );
});

test('YouTube 默认展示订阅推荐，并明确区别于官方首页算法', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    "const VIEWS = new Set(['recommended', 'trending'",
    "this.activeView = 'recommended'",
    'data-youtube-view="recommended"',
    '<span>为你推荐</span>',
    'RECOMMENDATION_CHANNEL_LIMIT = 12',
    'async _loadRecommendations(requestId = this.remoteRequestId)',
    "resource: 'subscriptions'",
    "resource: 'channels'",
    "resource: 'playlistItems'",
    'maxResults: 2',
    '非 YouTube 首页算法',
  ]) assert.ok(source.includes(contract), `缺少订阅推荐契约: ${contract}`);
  assert.equal(source.includes('YouTube 官方为你推荐'), false, '不能把扩展整理结果冒充 YouTube 官方首页推荐');
});

test('左侧观看历史只记录扩展播放器内真正开始播放的视频', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    "history: 'youtubeWatchHistory'",
    "data-youtube-view=\"history\"",
    '<span>观看历史</span>',
    'previousPlayerState !== 1',
    "this.playerBridge.playerState === 1",
    'this._recordWatchHistory(this.currentVideo)',
    "localType: 'history'",
    '不同步 YouTube 官方历史',
  ]) assert.ok(source.includes(contract), `缺少本地观看历史契约: ${contract}`);
  assert.equal(source.includes("resource: 'watchHistory'"), false, '不能把本地观看历史伪装成 YouTube Data API 能力');

  const context = { window: {}, URL, console };
  vm.runInNewContext(source, context);
  const merge = context.window.YouTubeWorkbench.mergeWatchHistory;
  const first = { id: 'AAA00000001', title: '第一次观看', kind: 'video' };
  const second = { id: 'AAA00000002', title: '第二个视频', kind: 'video' };
  let history = merge([], first, '2026-09-09T08:00:00.000Z');
  history = merge(history, second, '2026-09-09T09:00:00.000Z');
  history = merge(history, { ...first, title: '再次观看' }, '2026-09-09T10:00:00.000Z');
  assert.deepEqual(Array.from(history, item => item.id), ['AAA00000001', 'AAA00000002']);
  assert.equal(history[0].title, '再次观看');
  assert.equal(history[0].watchedAt, '2026-09-09T10:00:00.000Z');
  assert.equal(merge(history, { id: 'invalid' }).length, 2);
  const oversized = Array.from({ length: 100 }, (_, index) => ({ id: `AAA${String(index).padStart(8, '0')}` }));
  assert.equal(merge(oversized, { id: 'ZZZ00000000' }).length, 100);
});

test('播放器只有收到 playing 状态才写入本地观看历史', async () => {
  const writes = [];
  const frameWindow = {};
  const context = {
    URL,
    console,
    chrome: {
      runtime: {},
      storage: {
        local: {
          set(values, callback) {
            writes.push(values);
            callback();
          },
        },
      },
    },
    window: {},
  };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const controller = context.window.youtubeController;
  controller.currentVideo = { id: 'AAA00000001', title: '真实播放', channel: '测试频道', kind: 'video' };
  controller.playerBridge = {
    frame: { contentWindow: frameWindow },
    ready: false,
    autoRatePending: false,
    playerState: -1,
  };
  controller._syncNav = () => {};
  controller._schedulePlayerControlUpdate = () => {};

  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'onStateChange', info: 2 }),
  });
  assert.equal(controller.history.length, 0, '暂停状态不能写入观看历史');

  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'onStateChange', info: 1 }),
  });
  await Promise.resolve();
  assert.equal(controller.history.length, 1);
  assert.equal(writes.length, 1);

  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'onStateChange', info: 1 }),
  });
  await Promise.resolve();
  assert.equal(writes.length, 1, '同一次播放会话不能重复写入');
});

test('播放器通过 infoDelivery 上报 playing 时也会写入观看历史', async () => {
  const writes = [];
  const frameWindow = {};
  const context = {
    URL,
    console,
    chrome: {
      runtime: {},
      storage: {
        local: {
          set(values, callback) {
            writes.push(values);
            callback();
          },
        },
      },
    },
    window: {},
  };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const controller = context.window.youtubeController;
  controller.currentVideo = { id: 'AAA00000002', title: 'infoDelivery 播放', channel: '测试频道', kind: 'video' };
  controller.playerBridge = {
    frame: { contentWindow: frameWindow },
    ready: true,
    autoRatePending: false,
    playerState: -1,
    availableRates: [1, 2],
  };
  controller._syncNav = () => {};
  controller._schedulePlayerControlUpdate = () => {};

  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 0.5, duration: 300 } }),
  });
  await Promise.resolve();
  assert.equal(controller.history.length, 1);
  assert.equal(controller.history[0].id, 'AAA00000002');
  assert.equal(writes.length, 1);

  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 1, duration: 300 } }),
  });
  await Promise.resolve();
  assert.equal(writes.length, 1, '连续状态推送不能重复写入');
});

test('所有 YouTube 视频入口共享本地观影进度并过滤片头与已看完状态', () => {
  const source = read('js/youtube-controller.js');
  const css = read('css/youtube-workbench.css');
  for (const contract of [
    "progress: 'youtubeWatchProgress'",
    'mergeWatchProgress(this.watchProgress, videoId, bridge.currentTime, bridge.duration)',
    'this._getWatchResumeTime(item.id)',
    'startSeconds: resumeTime',
    '`&start=${resumeTime}`',
    '看到 ${formatPlaybackTime(watchState.time)}',
    'yt-watch-progress',
  ]) assert.ok(source.includes(contract), `缺少 YouTube 续播契约: ${contract}`);
  assert.ok(css.includes('.yt-watch-progress'));

  const context = { window: {}, URL, console };
  vm.runInNewContext(source, context);
  const { mergeWatchProgress, getWatchResumeTime, isWatchProgressComplete } = context.window.YouTubeWorkbench;
  let progress = mergeWatchProgress({}, 'AAA00000001', 4, 300, 1000);
  assert.equal(getWatchResumeTime(progress, 'AAA00000001'), 0, '片头几秒不应形成续播点');
  progress = mergeWatchProgress(progress, 'AAA00000001', 42.9, 300, 2000);
  assert.equal(progress.AAA00000001.time, 42);
  assert.equal(progress.AAA00000001.duration, 300);
  assert.equal(getWatchResumeTime(progress, 'AAA00000001'), 42);
  assert.equal(isWatchProgressComplete(285, 300), true);
  progress = mergeWatchProgress(progress, 'AAA00000001', 285, 300, 3000);
  assert.equal(getWatchResumeTime(progress, 'AAA00000001'), 0, '已看完视频下次应从头播放');
});

test('YouTube 播放状态上报会落盘进度，移除历史时同步清除观影状态', async () => {
  const writes = [];
  const frameWindow = {};
  const context = {
    URL,
    console,
    chrome: {
      runtime: {},
      storage: { local: { set(values, callback) { writes.push(values); callback(); } } },
    },
    window: {},
  };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const controller = context.window.youtubeController;
  controller.currentVideo = { id: 'AAA00000001', title: '续播测试', channel: '测试频道', kind: 'video' };
  controller.playerBridge = {
    frame: { contentWindow: frameWindow }, ready: true, autoRatePending: false,
    playerState: 1, availableRates: [1, 2], currentTime: 0, duration: 0,
  };
  controller._syncNav = () => {};
  controller._schedulePlayerControlUpdate = () => {};
  controller._handlePlayerMessage({
    origin: 'https://www.youtube.com',
    source: frameWindow,
    data: JSON.stringify({ event: 'infoDelivery', info: { playerState: 1, currentTime: 42, duration: 300 } }),
  });
  await Promise.resolve();
  assert.equal(controller.watchProgress.AAA00000001.time, 42);
  assert.ok(writes.some(write => write.youtubeWatchProgress?.AAA00000001?.time === 42));

  controller.playerBridge.currentTime = 0;
  controller._captureWatchProgress(true, true);
  await Promise.resolve();
  assert.equal(controller.watchProgress.AAA00000001, undefined, '明确拖回片头后应清除旧续播点');
  controller.playerBridge.currentTime = 42;
  controller._captureWatchProgress(true);
  await Promise.resolve();

  controller.history = [{ ...controller.currentVideo }];
  controller._renderActiveView = () => {};
  controller._setStatus = () => {};
  await controller._removeLocal('history', 'AAA00000001');
  assert.equal(controller.watchProgress.AAA00000001, undefined);
  assert.ok(writes.some(write => write.youtubeWatchHistory?.length === 0 && Object.keys(write.youtubeWatchProgress || {}).length === 0));
});

test('趋势按用户选择的公开视频分类过滤并持久化选择', () => {
  const source = read('js/youtube-controller.js');
  const css = read('css/youtube-workbench.css');
  for (const contract of [
    'TREND_CATEGORIES',
    "DEFAULT_TREND_CATEGORY_ID = 'culture'",
    "id: 'culture', label: '文化'",
    "id: 'travel', label: '旅游'",
    '中国旅游|中國旅遊|中文旅行|旅游攻略|旅遊攻略|城市漫游|城市漫遊|人文地理 -shorts',
    'TREND_PREFERENCE_VERSION = 2',
    'SHORTS_MAX_DURATION_SECONDS = 3 * 60',
    'TREND_CACHE_TTL_MS = 15 * 60 * 1000',
    'async _loadInterestTrend(requestId = this.remoteRequestId)',
    "resource: 'search'",
    "order: 'rating'",
    'publishedAfter',
    "relevanceLanguage: 'zh-Hans'",
    "videoDefinition: 'high'",
    'selectHighQualityTrendVideos(detailItems, circle.target)',
    'TREND_MAX_PER_CHANNEL = 2',
    'liveStreamingDetails',
    'maxResults: 50',
    'data-yt-action="trend-category"',
    'data-category-id="${category.id}"',
    'trendCategoryId: categoryId',
    "await this._showView('trending', true)",
    '已过滤 Shorts',
    '跨圈层兴趣趋势',
  ]) assert.ok(source.includes(contract), `缺少兴趣趋势契约: ${contract}`);
  assert.equal(source.includes("chart: 'mostPopular'"), false, '兴趣分类不能继续请求不受支持的 mostPopular 分类榜');
  assert.equal(source.includes('科技|technology|AI|programming'), false, '中文优先模式不能继续使用欧美宽泛查询词');
  for (const contract of ['.yt-interest-filter', '.yt-interest-chips', '.yt-interest-chips button[aria-pressed="true"]']) {
    assert.ok(css.includes(contract), `缺少兴趣趋势样式: ${contract}`);
  }
});

test('兴趣趋势按 4:3:3 圈层配额逐层加载并标记来源', () => {
  const source = read('js/youtube-controller.js');
  const css = read('css/youtube-workbench.css');
  for (const contract of [
    'const TREND_CIRCLES = Object.freeze([',
    "{ id: 'sinosphere', label: '中华文化圈', target: 8",
    "{ id: 'western', label: '欧美', target: 6",
    "{ id: 'panAsia', label: '泛亚', target: 6",
    'for (let index = 0; index < TREND_CIRCLES.length; index += 1)',
    'await this._loadTrendCircle(category, circle, requestId)',
    'this._showView(viewButton.dataset.youtubeView, true)',
    'if (force) this.busy = false',
    'activeCircleId: nextCircle?.id ||',
    'trendCircleLabel: circle.label',
    'data-circle="${escapeHtml(item.trendCircle)}"',
    '圈层配比 4 : 3 : 3',
    '分层加载，已完成的内容会立即展示',
  ]) assert.ok(source.includes(contract), `缺少圈层渐进加载契约: ${contract}`);
  assert.equal(source.includes('category.query'), false, '每个圈层必须使用独立查询，不能共用单圈层关键词');
  for (const contract of ['.yt-trend-mix', '.yt-trend-mix-grid', '.yt-circle-badge', '[data-circle="sinosphere"]', '[data-circle="western"]', '[data-circle="panAsia"]']) {
    assert.ok(css.includes(contract), `缺少圈层配比样式: ${contract}`);
  }
});

test('兴趣趋势按官方字段分级筛选并限制频道重复', () => {
  const context = { window: {}, URL, console };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const { mergeSearchVideoIds, selectHighQualityTrendVideos } = context.window.YouTubeWorkbench;
  const searchItem = videoId => ({ id: { videoId } });
  assert.deepEqual(Array.from(mergeSearchVideoIds([
    { data: { items: [searchItem('AAA00000001'), searchItem('AAA00000003')] } },
    { data: { items: [searchItem('AAA00000002'), searchItem('AAA00000004')] } },
  ])), ['AAA00000001', 'AAA00000002', 'AAA00000003', 'AAA00000004']);

  const video = (id, channelId, views, likes, extra = {}) => ({
    id,
    snippet: { channelId, liveBroadcastContent: 'none' },
    contentDetails: { duration: 'PT12M' },
    statistics: { viewCount: String(views), likeCount: String(likes) },
    status: { embeddable: true },
    ...extra,
  });
  const selected = selectHighQualityTrendVideos([
    video('AAA00000005', 'relaxed', 1500, 10),
    video('AAA00000006', 'channel-a', 50000, 500),
    video('AAA00000007', 'channel-a', 40000, 400),
    video('AAA00000008', 'channel-a', 30000, 300),
    video('AAA00000009', 'channel-b', 20000, 200),
    video('AAA00000010', 'live', 90000, 900, { liveStreamingDetails: {} }),
  ], 4);
  assert.deepEqual(Array.from(selected, item => item.id), [
    'AAA00000006', 'AAA00000007', 'AAA00000009', 'AAA00000005',
  ]);
});

test('兴趣趋势按官方三分钟 Shorts 边界只保留常规长视频', () => {
  const context = { window: {}, URL, console };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const { parseIso8601DurationSeconds, isLongFormTrendVideo } = context.window.YouTubeWorkbench;
  assert.equal(parseIso8601DurationSeconds('PT2M59S'), 179);
  assert.equal(parseIso8601DurationSeconds('PT1H2M3S'), 3723);
  assert.equal(parseIso8601DurationSeconds('invalid'), 0);
  assert.equal(isLongFormTrendVideo({ contentDetails: { duration: 'PT3M' } }), false);
  assert.equal(isLongFormTrendVideo({ contentDetails: { duration: 'PT3M1S' } }), true);
  assert.equal(isLongFormTrendVideo({ contentDetails: { duration: 'PT28M15S' } }), true);
});

test('YouTube URL 解析只接受官方 URL 和 11 位视频 ID', () => {
  const context = { window: {}, URL, console };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const parse = context.window.YouTubeWorkbench.parseYouTubeVideoId;
  assert.equal(parse('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12'), 'dQw4w9WgXcQ');
  assert.equal(parse('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parse('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parse('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(parse('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parse('not-a-video!'), null);
});

test('YouTube 视频 ID 优先取播放列表条目中的真实 videoId', () => {
  const context = { window: {}, URL, console };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const extract = context.window.YouTubeWorkbench.extractYouTubeVideoId;
  assert.equal(extract({
    id: 'VVVEX2d5OERXVl9EaGpKLWJRWEY1ZEdRLll5UmdOZGpVZUdR',
    contentDetails: { videoId: 'YyRgNdjUeGQ' },
  }), 'YyRgNdjUeGQ');
  assert.equal(extract({ id: { videoId: 'dQw4w9WgXcQ' } }), 'dQw4w9WgXcQ');
  assert.equal(extract({ id: 'dQw4w9WgXcQ' }), 'dQw4w9WgXcQ');
  assert.equal(extract({ id: 'playlist-item-id' }), '');
});

test('创作者主页 URL 只接受 YouTube 官方频道路径', () => {
  const context = { window: {}, URL, console };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const normalize = context.window.YouTubeWorkbench.normalizeYouTubeChannelUrl;
  assert.equal(normalize('https://www.youtube.com/@OpenAI'), 'https://www.youtube.com/@OpenAI');
  assert.equal(normalize('https://www.youtube.com/@OpenAI'), normalize(normalize('https://www.youtube.com/@OpenAI')));
  assert.equal(normalize('https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw'), 'https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw');
  assert.equal(normalize('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), '');
  assert.equal(normalize('https://example.com/@OpenAI'), '');
});

test('播放器使用官方 iframe 且不绕开 YouTube 原生控制边界', () => {
  const source = read('js/youtube-controller.js');
  assert.ok(source.includes('https://www.youtube.com/embed/'));
  assert.ok(source.includes('referrerpolicy="strict-origin-when-cross-origin"'));
  assert.ok(source.includes('allowfullscreen'));
  assert.ok(source.includes('youtubeLocalQueue'));
  assert.ok(source.includes('youtubeLearningList'));
  assert.ok(source.includes('aria-label="在 YouTube 打开'));
  assert.ok(source.includes('this._setBackgroundInert(true)'));
  assert.ok(source.includes("document.getElementById('dock-launchpad-btn')"));
  assert.equal(source.includes('官方播放器边界'), false);
  assert.equal(source.includes('yt-player-note'), false);
  for (const forbidden of ['iframe_api', 'setPlaybackQuality', 'chrome.cookies', 'declarativeNetRequest', 'SESSDATA']) {
    assert.equal(source.includes(forbidden), false, `YouTube 工作台不应包含 ${forbidden}`);
  }
});

test('播放器加载前为扩展来源注入官方要求的客户端标识', () => {
  const controller = read('js/youtube-controller.js');
  const background = read('js/background.js');
  assert.ok(controller.includes("sendMessage({ action: 'youtube_prepare_player' }, 5_000)"));
  assert.ok(background.includes("const YOUTUBE_PLAYER_IDENTITY_RULE_ID = 9020"));
  assert.ok(background.includes("urlFilter: '||www.youtube.com/embed/'"));
  assert.ok(background.includes("resourceTypes: ['sub_frame']"));
  assert.ok(background.includes('initiatorDomains: [appId]'));
  assert.ok(background.includes("header: 'Referer', operation: 'set', value: referer"));
  assert.ok(background.includes('const referer = `https://${appId}/`'));
  assert.equal(background.includes("urlFilter: '||youtube.com/'"), false, '不能改写普通 YouTube 页面请求');
});

test('后台只允许 YouTube 只读 API，并区分 OAuth 与配额错误', () => {
  const source = read('js/background.js');
  for (const contract of [
    "const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'",
    "if (!YOUTUBE_API_RESOURCES.has(resource))",
    "message.action === 'youtube_auth_status'",
    "message.action === 'youtube_connect'",
    "message.action === 'youtube_disconnect'",
    "message.action === 'youtube_api'",
    "extensionId: chrome.runtime.id",
    "mode: 'oauth-not-configured'",
    "mode: 'authorization-required'",
    "code = 'quota-exceeded'",
    "code = 'auth-expired'",
  ]) assert.ok(source.includes(contract), `缺少后台契约: ${contract}`);
  assert.equal(source.includes("youtubeApiCall(message.resource, message.params || {}, message.method"), false, 'R1 不开放写方法');
});

test('账号状态区分 OAuth 未配置、待授权和已连接，不把网页登录误报为扩展登录', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    'OAuth 未配置',
    '待授权',
    '已连接 · 只读',
    '你登录 YouTube 网页，只代表浏览器持有 youtube.com Cookie',
    '查看当前配置',
    '清空 YouTube 本地数据',
    '再次点击确认清空',
    '[STORAGE_KEYS.settings]: {}',
    'AUTH_MESSAGE_TIMEOUT_MS = 60_000',
    "code: 'request-timeout'",
    'Google 授权窗口没有完成响应',
    "button.disabled = this.authBusy",
    "window.addEventListener('focus', () => this._recoverAuthAfterWindowFocus())",
    "sendMessage({ action: 'youtube_auth_status' }, 5_000)",
    "this._setStatus('YouTube 已连接')",
  ]) assert.ok(source.includes(contract), `缺少账号状态契约: ${contract}`);
  assert.equal(source.includes("state.textContent = this.auth.connected ? '已连接 · 只读' : (this.auth.configured ? '尚未连接' : '访客模式')"), false);
});

test('YouTube 工作台具备桌面、窄屏和减少动画适配', () => {
  const css = read('css/youtube-workbench.css');
  for (const contract of ['.yt-panel', '.yt-player-frame', '.yt-list-toolbar', '.yt-grid.is-list', '@media (max-width: 620px)', '@media (prefers-reduced-motion: reduce)']) {
    assert.ok(css.includes(contract));
  }
});

test('订阅频道与播放列表可进入内容，并在所有列表页切换方框和列表布局', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    'class="yt-card-open"',
    "data-yt-channel=\"${item.id}\"",
    "data-yt-playlist=\"${item.id}\"",
    "action === 'subscription-updates'",
    "relatedPlaylists?.uploads",
    "maxResults: 1",
    "data-yt-action=\"layout-grid\"",
    "data-yt-action=\"layout-list\"",
    "aria-pressed=\"${this.layout === 'grid'}\"",
    "this.settings = { ...this.settings, layout }",
    "`${item.contentDetails?.totalItemCount || 0} 个视频`",
  ]) assert.ok(source.includes(contract), `缺少订阅/布局契约: ${contract}`);
  assert.ok(read('css/youtube-workbench.css').includes('.yt-card-open:focus-visible'), '整卡入口必须提供键盘焦点反馈');
  assert.equal(source.includes('个新内容'), false, '订阅总视频数不能误标为新内容');
});

test('从订阅频道视频进入播放器后可返回原频道列表并恢复上下文', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    'this.playerOrigin = null',
    'this._play(item, this._capturePlayerOrigin())',
    "action === 'return-list'",
    '_capturePlayerOrigin()',
    '_returnToPlayerOrigin()',
    'playerReturnLabel: channel.title',
    'scrollTop: this.panel.querySelector',
    'content.scrollTop = origin.scrollTop',
    '返回「${escapeHtml(this.playerOrigin.label)}」的视频列表',
  ]) assert.ok(source.includes(contract), `缺少频道返回链路契约: ${contract}`);
  assert.ok(read('css/youtube-workbench.css').includes('.yt-player-context button span'), '返回频道入口需要处理长频道名');
});

test('播放器从任意来源进入时都提供创作者主页入口', () => {
  const source = read('js/youtube-controller.js');
  const css = read('css/youtube-workbench.css');
  for (const contract of [
    'channelId: item.snippet?.videoOwnerChannelId || item.snippet?.channelId',
    'normalizeYouTubeChannelUrl(data.author_url)',
    'https://www.youtube.com/oembed?',
    'data-yt-creator-home',
    '进入创作者频道主页',
    "action === 'creator-home'",
    '_openCreatorHome()',
    "resource: 'channels'",
    "part: 'snippet,contentDetails,statistics,brandingSettings'",
    'creatorHome: creator',
    'this._playerContextControls()',
  ]) assert.ok(source.includes(contract), `缺少创作者主页入口契约: ${contract}`);
  assert.ok(css.includes('.yt-creator-home'));
  assert.ok(css.includes('.yt-channel-hero'));
  assert.ok(css.includes('.yt-channel-actions'));
  assert.equal(source.includes('data-yt-creator-home href='), false, '播放器创作者入口不得默认外跳');
});

test('YouTube 播放器提供桌面快捷进度与倍速且不伪造清晰度切换', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    'enablejsapi=1',
    "event: 'listening'",
    "func: 'seekTo'",
    "func: 'setPlaybackRate'",
    'data-yt-player-progress',
    'data-yt-player-action="back-10"',
    'data-yt-player-action="forward-10"',
    "key === 'j'",
    "key === 'l'",
    "key === 'k'",
    '清晰度在播放器内调整',
    'requestId !== this.remoteRequestId',
  ]) assert.ok(source.includes(contract), `缺少 YouTube 快捷播放契约: ${contract}`);
  assert.equal(source.includes('setPlaybackQuality'), false, 'YouTube 已不支持外部设置清晰度，不能渲染伪控制');
  for (const contract of ['.yt-player-controls', '.yt-player-seek', '.yt-player-rates button[aria-pressed="true"]']) {
    assert.ok(read('css/youtube-workbench.css').includes(contract), `缺少 YouTube 快捷控制样式: ${contract}`);
  }
});

test('YouTube 播放器展示频道最近发布并使用官方命令原位切换', () => {
  const source = read('js/youtube-controller.js');
  const css = read('css/youtube-workbench.css');
  for (const contract of [
    'data-yt-player-recent',
    'data-yt-recent-id',
    "action === 'refresh-player-recent'",
    'async _loadPlayerRecentVideos(force = false)',
    "relatedPlaylists?.uploads",
    "maxResults: 8",
    "func: 'loadVideoById'",
    'this._updatePlayerVideoMeta()',
  ]) assert.ok(source.includes(contract), `缺少播放器最近发布契约: ${contract}`);
  for (const contract of ['.yt-player-recent', '.yt-recent-track', '.yt-recent-card.active']) {
    assert.ok(css.includes(contract), `缺少播放器最近发布样式: ${contract}`);
  }
});

test('YouTube 播放器初次就绪和原位切换后都会自动应用 2 倍速', () => {
  const source = read('js/youtube-controller.js');
  for (const contract of [
    'const AUTO_PLAYBACK_RATE = 2',
    'autoRatePending: true',
    'this._applyAutoPlaybackRate()',
    "func: 'setPlaybackRate', args: [AUTO_PLAYBACK_RATE]",
    'this.playerBridge.autoRatePending = true',
  ]) assert.ok(source.includes(contract), `缺少 YouTube 自动 2 倍速契约: ${contract}`);
});

test('拖动进度只在松手后跳转且播放器状态合并更新，避免连续缓冲闪屏', () => {
  const source = read('js/youtube-controller.js');
  const inputHandler = source.slice(
    source.indexOf('_handlePlayerProgressInput(event) {'),
    source.indexOf('_handlePlayerProgressChange(event) {')
  );
  const changeHandler = source.slice(
    source.indexOf('_handlePlayerProgressChange(event) {'),
    source.indexOf('_seekPlayerBy(delta) {')
  );
  assert.equal(inputHandler.includes("func: 'seekTo'"), false, '拖动预览不应连续向播放器发送 seekTo');
  assert.ok(changeHandler.includes("func: 'seekTo'"), '松手后必须提交一次最终进度');
  assert.ok(source.includes('this._schedulePlayerControlUpdate()'), '播放器消息应合并到浏览器单帧更新');
  assert.ok(source.includes('window.cancelAnimationFrame(this.playerControlUpdateFrame)'), '离开播放器时应取消待处理的控件刷新');
  assert.ok(source.includes('if (this.playerBridge.ready) {'), '桥接就绪后应停止重复 listening 轮询');
});

test('YouTube iframe 完成导航后才发送定向 postMessage', () => {
  const timers = [];
  const context = {
    URL,
    console,
    window: {
      setInterval(callback) { timers.push(callback); return timers.length; },
      clearInterval() {},
      setTimeout() { return 0; },
      cancelAnimationFrame() {},
    },
  };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const controller = context.window.youtubeController;
  const messages = [];
  let onLoad = null;
  const frame = {
    id: 'yt-player-frame',
    isConnected: true,
    contentWindow: {
      postMessage(payload, origin) { messages.push({ payload, origin }); },
    },
    addEventListener(type, callback) {
      if (type === 'load') onLoad = callback;
    },
  };

  controller._attachPlayerBridge(frame);
  assert.equal(messages.length, 0, 'about:blank/扩展初始文档阶段不能发送 YouTube 定向消息');
  timers[0]();
  assert.equal(messages.length, 0, '轮询也必须等待 iframe load');
  onLoad();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'https://www.youtube.com');
});

test('播放器滚动层避免跨域 iframe 与背景模糊反复合成', () => {
  const css = read('css/youtube-workbench.css');
  const panelBlock = css.slice(css.indexOf('.yt-panel {'), css.indexOf('.yt-panel[hidden]'));
  assert.equal(panelBlock.includes('backdrop-filter'), false, '播放器工作台不能在大尺寸 iframe 外层启用实时背景模糊');
  assert.ok(panelBlock.includes('isolation: isolate'));
  assert.ok(css.includes('overscroll-behavior: contain'));
  assert.ok(css.includes('scrollbar-gutter: stable'));
  assert.ok(css.includes('contain: paint'));
  assert.ok(css.includes('backface-visibility: hidden'));
});
