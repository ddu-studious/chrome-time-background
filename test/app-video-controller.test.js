const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const AppVideo = require('../js/app-video.js');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const quietConsole = { log() {}, warn() {}, error() {} };
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function mainFixture(request, { disabled = false, initialization = Promise.resolve() } = {}) {
  const calls = [];
  const elements = [];
  const createElement = tag => ({
    tag, style: {}, attributes: {}, children: [], listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, listener) { this.listeners[key] = listener; },
    append(...children) { this.children.push(...children); },
    remove() { elements.splice(elements.indexOf(this), 1); },
  });
  const location = { href: AppVideo.buildURL(request, 'chrome-extension://test/index.html?keep=yes') };
  const context = {
    console: quietConsole,
    document: {
      getElementById: id => elements.find(element => element.id === id) || null,
      createElement,
      body: { appendChild: element => elements.push(element) },
    },
    history: { replaceState: (_state, _title, href) => { location.href = href; } },
    setupKeyboardShortcuts: () => calls.push(['shortcuts', location.href]),
    clockManager: { init() {} }, holidayManager: { init() {} }, weatherManager: { async init() {} },
    zenMode: { async init() {} },
    window: {
      AppVideo, location,
      settingsManager: { async init() {}, getSetting: key => !disabled && key === (request.platform === 'bilibili' ? 'enableBilibili' : 'enableYouTube') },
      i18nManager: { init() {} },
      bilibiliController: {
        init: () => { calls.push(['bili-init']); return initialization; },
        openVideo: async value => calls.push(['bili-video', value]),
      },
      youtubeController: {
        init: options => { calls.push(['youtube-init', options]); return initialization; },
        openVideo: async value => calls.push(['youtube-video', value]),
        openSearch: async query => calls.push(['youtube-search', query]),
      },
    },
  };
  const source = read('js/main.js');
  vm.runInNewContext(source.slice(source.indexOf('function showAppVideoError('), source.indexOf('// ===================== v3.0.0: 系统监控')), context);
  return { context, calls, location, elements };
}

test('B 站深链等待自身初始化，主页不被阻塞，清参后刷新不会重放', async () => {
  const initialization = deferred();
  const fixture = mainFixture({ platform: 'bilibili', id: 'BV1xx411c7mD', seconds: 32, page: 2 }, { initialization: initialization.promise });
  await fixture.context.initApp();
  assert.equal(fixture.calls.some(([action]) => action === 'bili-video'), false);
  assert.equal(fixture.location.href, 'chrome-extension://test/index.html?keep=yes');
  assert.equal(fixture.calls[0][1], fixture.location.href, '必须在其他初始化消费 URL 之前读取并清理视频入口');
  initialization.resolve();
  await flush();
  const opened = fixture.calls.filter(([action]) => action === 'bili-video');
  assert.equal(opened.length, 1);
  assert.equal(opened[0][1].page, 2);
  assert.equal(opened[0][1].seconds, 32);
  await fixture.context.initApp();
  assert.equal(fixture.calls.filter(([action]) => action === 'bili-video').length, 1);
});

test('YouTube 深链等待初始化并跳过初始推荐，搜索候选仍留在 App', async () => {
  const initialization = deferred();
  const fixture = mainFixture({ platform: 'youtube', id: 'AAA00000001' }, { initialization: initialization.promise });
  const pending = fixture.context.initApp();
  await flush();
  assert.equal(fixture.calls.find(([action]) => action === 'youtube-init')[1].skipInitialView, true);
  assert.equal(fixture.calls.some(([action]) => action === 'youtube-video'), false);
  initialization.resolve();
  await pending;
  assert.equal(fixture.calls.filter(([action]) => action === 'youtube-video').length, 1);

  const search = mainFixture({ platform: 'youtube', query: '爵士乐现场' });
  await search.context.initApp();
  assert.deepEqual(search.calls.find(([action]) => action === 'youtube-search'), ['youtube-search', '爵士乐现场']);
});

test('视频模块禁用或深链无效时不会阻断主页或开启播放器', async () => {
  for (const platform of ['bilibili', 'youtube']) {
    const fixture = mainFixture({ platform, id: platform === 'bilibili' ? 'BV1xx411c7mD' : 'AAA00000001' }, { disabled: true });
    await fixture.context.initApp();
    assert.deepEqual(fixture.calls.map(([action]) => action), ['shortcuts']);
    assert.equal(fixture.elements[0].attributes.role, 'status');
    assert.match(fixture.elements[0].children[0].textContent, /模块已关闭/);
    assert.equal(fixture.elements[0].children[1].href, 'settings.html');
  }
  const fixture = mainFixture({ platform: 'youtube', id: 'AAA00000001' });
  fixture.location.href = 'chrome-extension://test/index.html?videoPlatform=youtube&videoId=invalid';
  await fixture.context.initApp();
  assert.equal(fixture.calls.some(([action]) => action === 'youtube-video'), false);
  assert.equal(fixture.calls.find(([action]) => action === 'youtube-init')[1].skipInitialView, false);
  assert.match(fixture.elements[0].children[0].textContent, /参数无效/);
});

test('深链打开失败显示可关闭状态条，错误正文按纯文本写入', async () => {
  const fixture = mainFixture({ platform: 'youtube', id: 'AAA00000001' });
  fixture.context.window.youtubeController.openVideo = async () => { throw new Error('<img src=x onerror=alert(1)>'); };
  await fixture.context.initApp();
  const notice = fixture.elements[0];
  assert.equal(notice.attributes.role, 'status');
  assert.match(notice.children[0].textContent, /<img src=x onerror=alert\(1\)>/);
  assert.equal(notice.children[0].innerHTML, undefined);
  notice.children[2].listeners.click();
  assert.equal(fixture.elements.length, 0);
});

function bilibiliFixture() {
  const context = { window: {}, console: quietConsole, clearTimeout() {}, setTimeout() { return 1; } };
  vm.runInNewContext(read('js/bilibili-controller.js'), context);
  const controller = context.window.bilibiliController;
  const nodes = new Map();
  controller._el = {
    classList: { remove() {} },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, { innerHTML: '', classList: { remove() {}, add() {} } });
      return nodes.get(selector);
    },
  };
  const shown = [];
  controller.show = () => shown.push(true);
  for (const method of ['_flushCurrentWatchMemory', '_destroyLiveFallback', '_setCreatorMode', '_updateSpeedUI', '_setProductPage', '_closePlayerDrawers', '_hideComments', '_renderPlayerMetadata', '_loadPlayerRecent', '_setQualityStatus']) {
    controller[method] = () => {};
  }
  return { controller, shown, nodes };
}

test('B 站公开入口复用真实播放器，传递分 P 和续播秒数并保留较新本地进度', async () => {
  const fixture = bilibiliFixture();
  const request = { id: 'BV1xx411c7mD', title: '测试视频', author: '测试作者', page: 2, seconds: 38 };
  await fixture.controller.openVideo(request);
  assert.equal(fixture.shown.length, 1);
  assert.match(fixture.nodes.get('#bili-player-frame').innerHTML, /bilibili\.com\/video\/BV1xx411c7mD\/\?p=2&t=38/);
  assert.equal(fixture.controller._pendingSeek, 38);
  fixture.controller._watchMemory[request.id] = { page: 3, time: 57, duration: 300 };
  await fixture.controller.openVideo(request);
  assert.match(fixture.nodes.get('#bili-player-frame').innerHTML, /\?p=3&t=57/);
  assert.equal(request.page, 2, '入口不能修改来源候选');
  await assert.rejects(fixture.controller.openVideo({ id: '"><script>' }), /无效/);
  assert.equal(fixture.shown.length, 2);
});

function youtubeFixture() {
  const messages = [];
  const writes = [];
  const nodes = new Map();
  const context = {
    URL, console: quietConsole, location: { origin: 'chrome-extension://test' },
    setTimeout() { return 1; }, clearTimeout() {},
    window: {},
    chrome: {
      runtime: { sendMessage(message, callback) { messages.push(message); callback({ ok: true, data: { items: [] } }); } },
      storage: { local: {
        get(defaults, callback) { callback(defaults); },
        set(values, callback) { writes.push(values); callback(); },
      } },
    },
  };
  vm.runInNewContext(read('js/youtube-controller.js'), context);
  const controller = context.window.youtubeController;
  controller.panel = { querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, { textContent: '', value: '' });
    return nodes.get(selector);
  } };
  controller.stage = { innerHTML: '', querySelector: () => ({ addEventListener() {} }) };
  const shown = [];
  controller.open = options => shown.push(options);
  for (const method of ['_detachPlayerBridge', '_renderLoading', '_loadPlayerRecentVideos', '_setStatus', '_injectPanel', '_bindEvents', '_syncNav']) controller[method] = () => {};
  for (const method of ['_playerContextControls', '_playerRecentMarkup', '_playerControlsMarkup']) controller[method] = () => '';
  controller._hydrateVideoDetails = async item => item;
  controller._refreshAuthStatus = async () => {};
  controller._attachPlayerBridge = (_frame, seconds) => { controller.attachedSeconds = seconds; };
  return { controller, messages, writes, shown, nodes, context };
}

test('YouTube 深链初始化不发起默认推荐，普通打开仍渲染原始视图', async () => {
  const fixture = youtubeFixture();
  let renders = 0;
  fixture.controller._renderActiveView = () => { renders += 1; };
  await fixture.controller.init({ skipInitialView: true });
  assert.equal(renders, 0);
  assert.equal(fixture.controller.initialized, true);
  assert.equal(fixture.messages.length, 0);
  const regular = youtubeFixture();
  regular.controller._renderActiveView = () => { renders += 1; };
  await regular.controller.init();
  assert.equal(renders, 1);
});

test('YouTube 公开入口复用官方 iframe，显式续播点进入播放器且不伪写观看记录', async () => {
  const fixture = youtubeFixture();
  fixture.controller.initialized = true;
  fixture.controller.watchProgress = { AAA00000001: { time: 75, duration: 300 } };
  await fixture.controller.openVideo({ id: 'AAA00000001', title: '测试视频', seconds: 42 });
  assert.equal(fixture.shown[0].refreshHome, false);
  assert.match(fixture.controller.stage.innerHTML, /youtube\.com\/embed\/AAA00000001\?autoplay=0/);
  assert.match(fixture.controller.stage.innerHTML, /&start=42/);
  assert.equal(fixture.controller.attachedSeconds, 42);
  assert.equal(fixture.writes.length, 0);
  assert.deepEqual(fixture.messages.map(message => message.action), ['youtube_prepare_player']);
  await fixture.controller.openVideo({ id: 'AAA00000001' });
  assert.equal(fixture.controller.attachedSeconds, 75, '未指定进度仍采用已有本地续播点');
  await assert.rejects(fixture.controller.openVideo({ id: 'invalid' }), /无效/);
  assert.equal(fixture.shown.length, 2);
});

test('YouTube 未连接账号的搜索入口展示 App 内连接提示，不自动跳官网', async () => {
  const fixture = youtubeFixture();
  fixture.controller.initialized = true;
  fixture.controller.auth = { connected: false, configured: true };
  await fixture.controller.openSearch('  爵士乐现场  ');
  assert.equal(fixture.shown[0].refreshHome, false);
  assert.equal(fixture.nodes.get('#yt-search-input').value, '爵士乐现场');
  assert.equal(fixture.nodes.get('.yt-view-title').textContent, '连接账号后在工作台搜索');
  assert.match(fixture.controller.stage.innerHTML, /data-yt-action="connect">连接 YouTube/);
  assert.doesNotMatch(fixture.controller.stage.innerHTML, /youtube\.com\/results/);
  assert.equal(fixture.messages.length, 0);
  assert.equal(fixture.writes.length, 0);
});

test('YouTube 旧深链详情晚到不能覆盖用户切换后的视频', async () => {
  const fixture = youtubeFixture();
  fixture.controller.initialized = true;
  const firstDetails = deferred();
  fixture.controller._hydrateVideoDetails = item => item.id === 'AAA00000001' ? firstDetails.promise : Promise.resolve(item);
  const first = fixture.controller.openVideo({ id: 'AAA00000001', title: '旧视频' });
  await fixture.controller.openVideo({ id: 'AAA00000002', title: '新视频' });
  firstDetails.resolve({ id: 'AAA00000001', title: '迟到的旧标题' });
  await first;
  assert.equal(fixture.controller.currentVideo.id, 'AAA00000002');
  assert.match(fixture.controller.stage.innerHTML, /youtube\.com\/embed\/AAA00000002/);
  assert.doesNotMatch(fixture.controller.stage.innerHTML, /迟到的旧标题/);
  assert.equal(fixture.messages.length, 1, '旧详情失效后不能继续准备播放器');
});

test('YouTube 同视频的旧播放器准备回执不能覆盖更新的续播请求', async () => {
  const fixture = youtubeFixture();
  fixture.controller.initialized = true;
  let firstIdentity;
  fixture.context.chrome.runtime.sendMessage = (_message, callback) => {
    if (!firstIdentity) firstIdentity = callback;
    else callback({ ok: true });
  };
  const first = fixture.controller.openVideo({ id: 'AAA00000001', seconds: 20 });
  await flush();
  await fixture.controller.openVideo({ id: 'AAA00000001', seconds: 80 });
  firstIdentity({ ok: true });
  await first;
  assert.equal(fixture.controller.attachedSeconds, 80);
  assert.match(fixture.controller.stage.innerHTML, /&start=80/);
});
