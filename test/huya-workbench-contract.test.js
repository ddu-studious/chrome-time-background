const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadWorkbench(extra = {}) {
  const context = {
    window: {}, URL, AbortSignal, DOMException, setTimeout, clearTimeout, console, Date, JSON, Promise,
    ...extra,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('js/huya-core.js'), context);
  vm.runInContext(read('js/huya-controller.js'), context);
  return { context, Workbench: context.window.HuyaWorkbench, Core: context.window.HuyaCore, controller: context.window.huyaController };
}

const { Workbench, Core } = loadWorkbench();

// 只检查真实标签里的属性名；被转义进属性值或文本里的 onerror= 只是普通文字。
function hasInlineHandler(markup) {
  return [...markup.matchAll(/<[a-zA-Z][^>]*>/g)].some(match => /\son[a-z]+\s*=/i.test(match[0].replace(/"[^"]*"/g, '""')));
}

function item(overrides = {}) {
  return {
    id: 'u1000001', uid: '1000001', source: 'recommend', nick: '测试主播', title: '今天一起上分', game: '英雄联盟',
    avatar: 'https://huyaimg.msstatic.com/avatar/a.jpg', cover: 'https://live-cover.msstatic.com/huyalive/a.jpg?x-oss-process=image/resize,w_320',
    status: 'live', viewers: 123456, viewersLabel: '12.3万', followersLabel: '', schedule: '', host: '520001',
    url: 'https://www.huya.com/520001', embedHost: '520001', locked: false, ...overrides,
  };
}

test('manifest 只为虎牙主站增加站点权限，推荐接口与嵌入页不新增权限，也没有网络改写规则', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(manifest.host_permissions.includes('https://www.huya.com/*'));
  assert.equal(manifest.host_permissions.filter(host => host.includes('huya')).length, 1);
  assert.equal(manifest.content_scripts.some(entry => entry.matches.some(pattern => pattern.includes('huya'))), false, '不得向虎牙网页注入常驻内容脚本');
  assert.equal(JSON.stringify(manifest).includes('liveshare'), false);
  assert.equal(JSON.stringify(manifest).includes('live.cdn.huya.com'), false);
  for (const permission of ['cookies', 'tabs', 'scripting']) assert.ok(manifest.permissions.includes(permission), permission);
  assert.ok(manifest.permissions.includes('declarativeNetRequest'), '既有权限保持不变');
  const background = read('js/background.js');
  assert.equal(/updateDynamicRules|updateSessionRules/.test(read('js/huya-follow.js') + read('js/huya-controller.js') + read('js/huya-core.js')), false, '虎牙集成不修改请求头或 Referer');
  assert.ok(background.length > 0);
});

test('工作台接入应用注册表、Dock、启动流程、设置和省电状态', () => {
  const index = read('index.html');
  const main = read('js/main.js');
  assert.ok(index.includes('id="huya-dock-btn"'));
  assert.ok(index.includes('css/huya-workbench.css?v=3'));
  assert.ok(index.includes('css/huya-icon.css?v=1'));
  assert.ok(index.includes('js/youtube-controller.js?v=17'), '保留与本任务无关的既有版本号');
  const scripts = [...index.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1].split('?')[0]);
  const position = name => scripts.indexOf(name);
  assert.ok(position('js/huya-core.js') >= 0 && position('js/huya-core.js') < position('js/huya-controller.js'));
  assert.ok(position('js/huya-controller.js') < position('js/main.js'));
  assert.ok(main.includes("getSetting('enableHuya')"));
  assert.ok(main.includes('window.huyaController.init()'));
  assert.ok(main.includes("document.getElementById('huya-dock-btn')"));
  assert.ok(/_isBackgroundSuspended\(\)[\s\S]{0,260}huya-workbench-open/.test(main), '虎牙工作台打开时暂停首页背景绘制');
  assert.ok(read('js/settings.js').includes('enableHuya: true'));
  assert.ok(read('js/settings-page.js').includes('enableHuya: true'));
  assert.ok(read('settings.html').includes('id="set-enableHuya"'));

  const registryContext = { window: {} };
  vm.runInNewContext(read('js/app-registry.js'), registryContext);
  const app = registryContext.window.ProductAppRegistry.apps.find(entry => entry.id === 'huya');
  assert.equal(app.dockBtnId, 'huya-dock-btn');
  assert.equal(app.category, 'media');
  assert.equal(app.defaultInDock, undefined, '新应用只出现在启动台，不改变既有 Dock 固定项');
  assert.ok(app.name && app.summary && app.icon);
  assert.equal(app.icon, 'hy-tiger-icon', '启动台、Dock 和设置页都渲染 <i class="${app.icon}">，所以注册表里就是小老虎图标类名');
  assert.ok(index.includes(`id="${app.dockBtnId}"`));
});

test('小老虎图标：自绘 SVG 由 Dock、启动台、设置页和工作台共用，且不含脚本或外部引用', () => {
  const svg = read('assets/huya/tiger.svg');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 96"/);
  assert.ok(svg.trim().endsWith('</svg>'));
  assert.equal(/[^\x00-\x7f]/.test(svg), false, 'SVG 保持纯 ASCII，避免写入时中文注释被损坏成无效 XML');
  for (const forbidden of ['<script', '<image', '<foreignobject', '<style', 'href=', 'xlink', 'javascript:', 'url(', '@import', '<!entity']) {
    assert.equal(svg.toLowerCase().includes(forbidden), false, forbidden);
  }
  assert.equal(/\son[a-z]+\s*=/i.test(svg), false, '没有事件属性');
  assert.equal([...svg.matchAll(/<path\b[^>]*\/>/g)].length, (svg.match(/<path\b/g) || []).length, '每个 path 都是自闭合标签');
  assert.ok((svg.match(/<path\b/g) || []).length >= 8, '头部、耳朵、白色屏幕、播放三角与条纹都在');
  assert.ok(/#FFD12B/i.test(svg) && /#774224/i.test(svg), '虎牙的黄色与棕色基调');

  const iconCss = read('css/huya-icon.css');
  assert.match(iconCss, /\.hy-tiger-icon \{[^}]*url\("\.\.\/assets\/huya\/tiger\.svg"\)/);
  for (const selector of ['.dock-btn .hy-tiger-icon', '.dock-launchpad-app-icon .hy-tiger-icon', '.settings-v5-app-choice > .hy-tiger-icon']) {
    assert.ok(iconCss.includes(selector), selector);
  }
  assert.equal(iconCss.includes('!important'), false);

  const index = read('index.html');
  const settings = read('settings.html');
  assert.ok(index.indexOf('css/huya-icon.css') > 0 && index.indexOf('css/huya-icon.css') < index.indexOf('css/huya-workbench.css'), '图标样式先于工作台样式加载');
  assert.ok(settings.includes('css/huya-icon.css?v=1'), '设置页的应用选择也要加载图标样式');
  assert.match(index, /id="huya-dock-btn"[^>]*>\s*<i class="hy-tiger-icon"><\/i>/);
  assert.equal(/id="huya-dock-btn"[^>]*>\s*<i class="[^"]*fa-/.test(index), false, 'Dock 不再使用 Font Awesome 图标');

  const controller = read('js/huya-controller.js');
  assert.match(controller, /<span class="hy-logo" aria-hidden="true"><i class="hy-tiger-icon"><\/i><\/span>/);
  assert.ok(read('css/huya-workbench.css').includes('../assets/huya/tiger.svg'), '卡片封面占位复用同一资源');
  // 本地预览、扩展页面都是同源加载 CSS 背景图，不需要 web_accessible_resources。
  assert.equal(JSON.stringify(JSON.parse(read('manifest.json')).web_accessible_resources || []).includes('tiger.svg'), false);
});

test('产品页面设计矩阵不登记虎牙：它不是 ProductPagesV5 的业务线', () => {
  const context = { window: {}, console };
  vm.runInNewContext(read('js/product-pages-v5.js'), context);
  assert.deepEqual(Array.from(context.window.ProductPagesV5.list('huya') || []), []);
  assert.equal(read('js/huya-controller.js').includes('ProductUIV5'), false);
});

test('后台在服务之前加载虎牙核心，并只响应三条消息', () => {
  const background = read('js/background.js');
  let loaded;
  vm.runInNewContext(background.split('\n')[0], { importScripts: (...scripts) => { loaded = scripts; } });
  assert.ok(loaded.indexOf('huya-core.js') >= 0 && loaded.indexOf('huya-core.js') < loaded.indexOf('huya-follow.js'));
  for (const action of ['huya_follow', 'huya_follow_release', 'huya_follow_clear']) assert.ok(background.includes(`message.action === '${action}'`), action);
  assert.ok(background.includes('new self.HuyaFollowService(chrome)'));
  const handlers = background.slice(background.indexOf("message.action === 'huya_follow'"), background.indexOf("message.action === 'youtube_auth_status'"));
  assert.equal(/error\.message|JSON\.stringify\(error|String\(error\)/.test(handlers), false, '只返回错误码，不转发异常原文');
});

test('卡片：全部文本转义，直播可嵌入时播放，其余在虎牙打开，没有内联事件', () => {
  const payload = '<img src=x onerror=alert(1)>"\'&';
  const markup = Workbench.cardMarkup(item({ nick: payload, title: payload, game: payload, viewersLabel: payload }));
  assert.equal(markup.includes('<img src=x'), false);
  assert.equal(hasInlineHandler(markup), false);
  assert.equal(hasInlineHandler('<img src="x" onerror="alert(1)">'), true, '检测函数本身必须能发现真实内联事件');
  assert.match(markup, /data-hy-play="u1000001"/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(markup, /<a class="hy-card-link" data-hy-link="u1000001" href="https:\/\/www\.huya\.com\/520001" target="_blank" rel="noopener noreferrer"/);

  const external = Workbench.cardMarkup(item({ id: 'u2', embedHost: '', url: 'https://www.huya.com/yy/42' }));
  assert.match(external, /data-hy-open="u2"/);
  assert.equal(external.includes('data-hy-play'), false);
  assert.match(external, /is-external/);

  const offline = Workbench.cardMarkup(item({ id: 'u3', status: 'offline', embedHost: '', schedule: '周六 20:00 开播', viewersLabel: '' }));
  assert.match(offline, /hy-badge-offline/);
  assert.match(offline, /周六 20:00 开播/);
  assert.equal(offline.includes('data-hy-play'), false, '未开播不嵌入');

  const locked = Workbench.cardMarkup(item({ id: 'u4', locked: true }));
  assert.match(locked, /需在虎牙观看/);
  assert.equal(locked.includes('data-hy-play'), false);

  const hostile = Workbench.cardMarkup(item({ id: 'u5', url: 'https://evil.example/x', cover: 'https://evil.example/c.jpg', avatar: 'javascript:alert(1)', embedHost: '' }));
  assert.equal(hostile.includes('evil.example'), false, '外域链接和图片不进入标记');
  assert.equal(hostile.includes('javascript:'), false);
  assert.match(hostile, /disabled/);
  assert.match(hostile, /hy-card-placeholder/);
});

test('关注页：分组、人数、更新时间、缓存提示与未开播折叠', () => {
  const items = [
    item(),
    item({ id: 'u2', nick: '重播', status: 'replay', viewersLabel: '' }),
    item({ id: 'u3', nick: '未开播', status: 'offline', embedHost: '', url: 'https://www.huya.com/video/u/3', viewersLabel: '', followersLabel: '8.5万' }),
  ];
  const now = 1_800_000_000_000;
  const markup = Workbench.followMarkup({ items, complete: true, fetchedAt: now - 5 * 60_000 }, { now });
  assert.match(markup, /<strong>1<\/strong> 位直播中 · 共 3 位/);
  assert.match(markup, /更新于5 分钟前/);
  assert.match(markup, /hy-group is-live/);
  assert.match(markup, /hy-group is-replay/);
  assert.match(markup, /<details class="hy-group is-offline" data-hy-offline><summary>/, '有直播时未开播默认折叠');
  assert.match(markup, /8\.5万 关注/);
  assert.equal(markup.includes('data-hy-action="refresh-follow"'), true);
  assert.equal(markup.includes('data-hy-action="clear-follow"'), true);

  const onlyOffline = Workbench.followMarkup({ items: [items[2]], complete: true, fetchedAt: now }, { now });
  assert.match(onlyOffline, /data-hy-offline open>/, '没有直播时默认展开未开播');
  assert.match(Workbench.followMarkup({ items, fetchedAt: now }, { now, offlineOpen: true }), /data-hy-offline open>/);
  assert.match(Workbench.followMarkup({ items, fetchedAt: now }, { now, refreshing: true }), /正在后台刷新直播状态/);
  assert.match(Workbench.followMarkup({ items, fetchedAt: now }, { now, notice: '读取失败（显示的是缓存内容）' }), /显示的是缓存内容/);
  assert.match(Workbench.followMarkup({ items, fetchedAt: now, complete: false }, { now }), /仅读取了前面一部分/);
  assert.match(Workbench.followMarkup({ items, fetchedAt: now }, { now, clearArmed: true }), /再次点击确认清除/);
  assert.match(Workbench.followMarkup({ items, fetchedAt: now }, { now, busy: true }), /data-hy-action="refresh-follow" disabled/);
});

test('推荐页：加载更多受页数限制，错误与空状态不吞内容', () => {
  const category = Core.categoryById('lol');
  const entry = { items: [item(), item({ id: 'u2' })], page: 1, totalPages: 5, fetchedAt: 1_800_000_000_000 };
  const markup = Workbench.recommendMarkup(category, entry, { now: entry.fetchedAt + 120_000 });
  assert.match(markup, /英雄联盟 · 2 个直播间 · 更新于2 分钟前/);
  assert.match(markup, /data-hy-action="recommend-more"/);
  assert.equal(Workbench.recommendMarkup(category, { ...entry, page: 5 }, {}).includes('recommend-more'), false);
  assert.equal(Workbench.recommendMarkup(category, { ...entry, page: 8, totalPages: 63 }, {}).includes('recommend-more'), false, '受 RECOMMEND_MAX_PAGES 限制');
  assert.match(Workbench.recommendMarkup(category, { ...entry, page: 8, totalPages: 63 }, {}), /已经到底了/);
  assert.match(Workbench.recommendMarkup(category, entry, { moreBusy: true }), /正在加载…/);
  assert.match(Workbench.recommendMarkup(category, entry, { moreError: '连接虎牙失败' }), /连接虎牙失败/);
  assert.match(Workbench.recommendMarkup(category, entry, { refreshing: true }), /正在更新推荐/);
  assert.match(Workbench.recommendMarkup(category, { items: [], page: 1, totalPages: 1, fetchedAt: 1 }, {}), /这个分类暂时没有直播/);
});

test('播放器：官方嵌入页、受限 sandbox、无顶层跳转、遮罩与继续浏览', () => {
  const current = item();
  const rail = [current, item({ id: 'u2', nick: '甲' }), item({ id: 'u3', nick: '乙', embedHost: '' }), item({ id: 'u4', nick: '丙', status: 'offline' }), item({ id: 'u5', nick: '丁', locked: true }), item({ id: 'u6', nick: '戊' })];
  const markup = Workbench.playerMarkup(current, { fromLabel: '我的关注', rail });
  assert.match(markup, /<iframe class="hy-player-frame" src="https:\/\/liveshare\.huya\.com\/iframe\/520001"/);
  const sandbox = markup.match(/sandbox="([^"]+)"/)[1].split(/\s+/);
  assert.deepEqual(sandbox.sort(), ['allow-forms', 'allow-popups', 'allow-popups-to-escape-sandbox', 'allow-presentation', 'allow-same-origin', 'allow-scripts']);
  for (const forbidden of ['allow-top-navigation', 'allow-top-navigation-by-user-activation', 'allow-modals', 'allow-downloads', 'allow-pointer-lock', 'allow-orientation-lock']) {
    assert.equal(sandbox.includes(forbidden), false, forbidden);
  }
  assert.match(markup, /allow="autoplay; fullscreen; picture-in-picture; encrypted-media"/);
  assert.match(markup, /allowfullscreen referrerpolicy="strict-origin-when-cross-origin"/);
  assert.equal(/allow="[^"]*(camera|microphone|geolocation|payment|usb)/.test(markup), false);
  assert.match(markup, /返回我的关注/);
  assert.match(markup, /hy-frame-loading/);
  assert.match(markup, /data-hy-action="copy-link"/);
  const railPart = markup.slice(markup.indexOf('hy-rail'));
  assert.deepEqual([...railPart.matchAll(/data-hy-play="([^"]+)"/g)].map(match => match[1]), ['u2', 'u6'], '继续浏览只含可嵌入的在播直播间，排除当前、外部、未开播和付费房');
  assert.equal(Workbench.railMarkup([current], current), '');
});

test('播放器操作栏：宽屏、网页全屏、弹窗观看、在虎牙打开、复制链接，状态写在标记里', () => {
  const current = item();
  const defaults = Workbench.playerMarkup(current, { fromLabel: '我的关注' });
  assert.match(defaults, /data-hy-action="toggle-wide" aria-pressed="true"/, '默认宽屏');
  assert.match(defaults, /class="hy-ctx-button is-on" data-hy-action="toggle-wide"/);
  assert.match(defaults, /data-hy-action="toggle-immersive" aria-pressed="false" title="[^"]*不是浏览器全屏）" aria-label="网页全屏"><i class="fas fa-expand"/);
  assert.match(defaults, /<span>网页全屏<\/span>/, '可见文字是“网页全屏”，避免与浏览器全屏混淆');
  assert.match(defaults, /data-hy-action="pop-out"(?! disabled)/);
  assert.match(defaults, /<a class="hy-ctx-link" href="https:\/\/www\.huya\.com\/520001" target="_blank" rel="noopener noreferrer"/);
  assert.match(defaults, /data-hy-current-title/);
  assert.match(defaults, /测试主播 · 英雄联盟 · 12\.3万 人气/, '标题下方显示主播、游戏和人气');

  // 开关按钮的名称不随状态变化，状态只由 aria-pressed 表达；提示文字提示如何退出。
  const immersive = Workbench.playerMarkup(current, { fromLabel: '热门推荐', wide: false, immersive: true });
  assert.match(immersive, /data-hy-action="toggle-wide" aria-pressed="false"/);
  assert.equal(/class="hy-ctx-button is-on" data-hy-action="toggle-wide"/.test(immersive), false);
  assert.match(immersive, /class="hy-ctx-button is-on" data-hy-action="toggle-immersive" aria-pressed="true" title="退出网页全屏（Esc）" aria-label="网页全屏"><i class="fas fa-compress"/);
  assert.match(immersive, /返回热门推荐/);

  // 没有可信的虎牙直播间地址时：弹窗观看与复制链接禁用，也不渲染外链。
  const hostile = Workbench.playerMarkup(item({ url: 'https://evil.example/x' }), { fromLabel: '我的关注' });
  assert.equal(hostile.includes('evil.example'), false);
  assert.equal(hostile.includes('hy-ctx-link'), false);
  assert.match(hostile, /data-hy-action="pop-out" disabled/);
  assert.match(hostile, /data-hy-action="copy-link" disabled/);

  assert.equal(hasInlineHandler(defaults) || hasInlineHandler(immersive) || hasInlineHandler(hostile), false);
});

test('试看限制说明：常驻在画面下方，写明站外限制与两条合规出路，且不暗示可以绕过', () => {
  const markup = Workbench.playerMarkup(item(), { fromLabel: '我的关注', rail: [item({ id: 'u2' })] });
  assert.match(markup, /<p class="hy-trial-note" role="note">/);
  assert.ok(markup.includes(Workbench.TRIAL_NOTE), '说明文字来自同一个常量');
  for (const phrase of ['站外播放有试看限制', '每天累计约 5 分钟', '时长由虎牙决定', '换房间不重置', '次日恢复', '立即前往', '弹窗观看', '在虎牙打开']) {
    assert.ok(Workbench.TRIAL_NOTE.includes(phrase), phrase);
  }
  assert.equal(/清晰度较低|不受限制|无限|绕过|破解|去除|屏蔽/.test(Workbench.TRIAL_NOTE), false, '不夸大画质结论，也不承诺任何绕过');
  const iframeAt = markup.indexOf('<iframe');
  const noteAt = markup.indexOf('hy-trial-note');
  const railAt = markup.indexOf('hy-rail');
  assert.ok(iframeAt >= 0 && iframeAt < noteAt && noteAt < railAt, '顺序：画面 → 试看说明 → 继续浏览');
  assert.equal(markup.slice(noteAt, railAt).includes('data-hy-play'), false, '说明区域没有播放入口');
});

test('接力提示：弹窗观看后原位置显示，提供回到这里与返回列表，昵称被转义', () => {
  const markup = Workbench.handoffMarkup(item({ nick: '<img src=x onerror=alert(1)>' }), '我的关注');
  assert.match(markup, /<div class="hy-handoff" role="status">/);
  assert.match(markup, /已在独立窗口打开/);
  assert.match(markup, /data-hy-action="resume-embed">回到这里观看</);
  assert.match(markup, /data-hy-action="back">返回我的关注</);
  assert.equal(markup.includes('<img src=x'), false);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(markup.includes('<iframe'), false, '接力提示里没有第二个播放器，避免两路声音');
  assert.equal(hasInlineHandler(markup), false);
  assert.match(Workbench.handoffMarkup(item()), /返回列表/, '没有来源名称时回退为“列表”');
});

test('弹窗观看：窗口尺寸受屏幕可用区域限制，优先用扩展窗口 API，失败有明确结果', async () => {
  assert.deepEqual({ ...Workbench.popupSize({ availWidth: 2560, availHeight: 1440 }) }, { width: 1280, height: 820 });
  assert.deepEqual({ ...Workbench.popupSize({ availWidth: 1440, availHeight: 900 }) }, { width: 1280, height: 820 });
  assert.deepEqual({ ...Workbench.popupSize({ availWidth: 1000, availHeight: 700 }) }, { width: 920, height: 620 });
  assert.deepEqual({ ...Workbench.popupSize({ availWidth: 500, availHeight: 300 }) }, { width: 640, height: 420 }, '极小屏幕保留可用的最小窗口');
  assert.deepEqual({ ...Workbench.popupSize({}) }, { width: 1280, height: 820 });
  assert.deepEqual({ ...Workbench.popupSize({ availWidth: 'x', availHeight: -5 }) }, { width: 1280, height: 820 }, '非法值回退默认');
  assert.deepEqual({ ...Workbench.popupSize() }, { width: 1280, height: 820 });

  const size = { width: 1000, height: 600 };
  const created = [];
  const api = { windows: { create(options, callback) { created.push(JSON.parse(JSON.stringify(options))); callback({ id: 7 }); } }, runtime: {} };
  assert.equal(await loadWorkbench({ chrome: api }).Workbench.openPopupWindow('https://www.huya.com/520001', size), true);
  assert.deepEqual(created, [{ url: 'https://www.huya.com/520001', type: 'popup', width: 1000, height: 600, focused: true }]);

  const blockedApi = { windows: { create(options, callback) { blockedApi.runtime.lastError = { message: 'blocked' }; callback(undefined); } }, runtime: {} };
  assert.equal(await loadWorkbench({ chrome: blockedApi }).Workbench.openPopupWindow('https://www.huya.com/1', size), false, '有 lastError 视为失败');
  const emptyApi = { windows: { create(options, callback) { callback(undefined); } }, runtime: {} };
  assert.equal(await loadWorkbench({ chrome: emptyApi }).Workbench.openPopupWindow('https://www.huya.com/1', size), false, '没有返回窗口视为失败');
  const throwingApi = { windows: { create() { throw new Error('boom'); } }, runtime: {} };
  assert.equal(await loadWorkbench({ chrome: throwingApi }).Workbench.openPopupWindow('https://www.huya.com/1', size), false, '同步异常视为失败而不是抛出');

  // 本地预览没有扩展窗口 API：退回受限的 window.open（noopener 使其恒返回 null，只能视为已发起）。
  const opened = [];
  const preview = loadWorkbench({ window: { open: (...args) => { opened.push(args); return null; } } }).Workbench;
  assert.equal(await preview.openPopupWindow('https://www.huya.com/2', size), true);
  assert.deepEqual(opened, [['https://www.huya.com/2', '_blank', 'popup=yes,width=1000,height=600,noopener,noreferrer']]);
});

test('关注页搜索与排序：标记、转义、命中统计、空状态，且不改动原列表', () => {
  const now = 1_800_000_000_000;
  const items = [
    item({ id: 'u1', nick: '阿狸', title: '排位赛', game: '英雄联盟', viewers: 500, viewersLabel: '500' }),
    item({ id: 'u2', nick: '小明', title: '<img src=x onerror=alert(1)>', game: '王者荣耀', viewers: 9000, viewersLabel: '9000' }),
    item({ id: 'u3', nick: '大熊', title: '闲聊', game: '英雄联盟', viewers: 70000, viewersLabel: '7万' }),
    item({ id: 'u4', nick: '离线的猫', title: '', game: '', status: 'offline', embedHost: '', url: 'https://www.huya.com/video/u/4', viewers: 0, viewersLabel: '' }),
  ];
  const snapshot = items.map(entry => entry.id);
  const order = markup => [...new Set([...markup.matchAll(/data-hy-(?:play|open)="([^"]+)"/g)].map(match => match[1]))];

  const plain = Workbench.followMarkup({ items, fetchedAt: now }, { now });
  assert.match(plain, /<input type="search" data-hy-search value="" placeholder="搜索主播、标题或游戏" aria-label="搜索关注的主播" maxlength="40" autocomplete="off" spellcheck="false">/);
  assert.match(plain, /data-hy-action="toggle-sort" aria-pressed="false"/);
  assert.deepEqual(order(plain), ['u1', 'u2', 'u3', 'u4'], '默认保持虎牙原有顺序');
  assert.match(plain, /<strong>3<\/strong> 位直播中 · 共 4 位/);

  const sorted = Workbench.followMarkup({ items, fetchedAt: now }, { now, sort: 'viewers' });
  assert.match(sorted, /data-hy-action="toggle-sort" aria-pressed="true"/);
  assert.deepEqual(order(sorted), ['u3', 'u2', 'u1', 'u4'], '直播中按人气从高到低，未开播分组不参与排序');

  const filtered = Workbench.followMarkup({ items, fetchedAt: now }, { now, query: '英雄联盟' });
  assert.deepEqual(order(filtered), ['u1', 'u3']);
  assert.match(filtered, /匹配 <strong>2<\/strong> \/ 4 位 · 其中 2 位直播中/);
  assert.match(filtered, /value="英雄联盟"/);
  const both = Workbench.followGroupsMarkup(items, { query: '英雄联盟', sort: 'viewers' });
  assert.deepEqual(order(both), ['u3', 'u1'], '搜索与排序可以叠加');

  // 搜索时未开播分组一定展开，不能让折叠的分组藏住用户正在找的人。
  const offlineHit = Workbench.followGroupsMarkup(items, { query: '离线' });
  assert.match(offlineHit, /<details class="hy-group is-offline" data-hy-offline open>/);
  assert.deepEqual(order(offlineHit), ['u4']);

  const none = Workbench.followGroupsMarkup(items, { query: '没有这个人' });
  assert.match(none, /没有匹配的主播/);
  assert.match(none, /data-hy-action="clear-search"/);
  assert.equal(order(none).length, 0);

  // 搜索词只作为文字：属性值与空状态文案都被转义。
  const hostileQuery = '"><b>x</b><script>alert(1)</script>';
  const hostileBar = Workbench.followMarkup({ items, fetchedAt: now }, { now, query: hostileQuery });
  assert.equal(hostileBar.includes('<script>'), false);
  assert.equal(hostileBar.includes('<b>x</b>'), false);
  const hostileEmpty = Workbench.followGroupsMarkup(items, { query: hostileQuery });
  assert.equal(hostileEmpty.includes('<script>'), false);
  assert.match(hostileEmpty, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.equal(hasInlineHandler(plain) || hasInlineHandler(sorted) || hasInlineHandler(hostileBar) || hasInlineHandler(hostileEmpty), false);

  assert.deepEqual(items.map(entry => entry.id), snapshot, '渲染不改动原列表顺序');
  assert.match(Workbench.followInfoMarkup({ items, fetchedAt: now }, { now, query: '   ' }), /位直播中 · 共 4 位/, '只有空白的搜索词视为没有搜索');
  assert.match(Workbench.followInfoMarkup({ items: [], fetchedAt: 0 }, {}), /<strong>0<\/strong> 位直播中 · 共 0 位/);
});

test('登录、失败与空状态的文案和动作', () => {
  const login = Workbench.loginMarkup();
  assert.match(login, /还没有检测到虎牙登录/);
  assert.match(login, /只检查虎牙的登录标记（udb_uid）/);
  assert.match(login, /不读取或保存密码和登录票据/);
  assert.equal(/不会读取或保存你的 Cookie/.test(login), false, '文案不得声称完全不读取 Cookie：判断登录需要读取 udb_uid');
  assert.match(login, /href="https:\/\/www\.huya\.com\/" target="_blank" rel="noopener noreferrer"/);
  assert.match(login, /data-hy-action="refresh-follow"/);
  for (const code of ['huya-timeout', 'huya-redirected', 'huya-format-changed', 'huya-network', 'huya-cookie-unavailable', 'huya-busy', 'background-unavailable', 'request-timeout']) {
    const markup = Workbench.failureMarkup(code);
    assert.match(markup, new RegExp(code));
    assert.match(markup, /data-hy-action="retry"/);
    assert.ok(Workbench.errorMessage(code).length > 8, code);
    assert.equal(markup.includes('undefined'), false);
  }
  assert.match(Workbench.errorMessage('unknown-code'), /请稍后重试/);
  assert.match(Workbench.failureMarkup('<script>x</script>'), /&lt;script&gt;/);
  assert.match(Workbench.emptyFollowMarkup(), /虎牙页面没有返回关注的主播/);
});

test('相对时间与转义工具', () => {
  const now = 1_800_000_000_000;
  assert.equal(Workbench.relativeTime(now - 5_000, now), '刚刚');
  assert.equal(Workbench.relativeTime(now - 5 * 60_000, now), '5 分钟前');
  assert.equal(Workbench.relativeTime(now - 3 * 3_600_000, now), '3 小时前');
  assert.equal(Workbench.relativeTime(now - 2 * 86_400_000, now), '2 天前');
  assert.equal(Workbench.relativeTime(0, now), '');
  assert.equal(Workbench.relativeTime('x', now), '');
  assert.equal(Workbench.escapeHtml(`<a href="x">'&</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&lt;/a&gt;');
  assert.deepEqual({ ...Workbench.summarize([{ status: 'live' }, { status: 'live' }, { status: 'replay' }, { status: 'offline' }, { status: 'weird' }, null]) },
    { total: 6, live: 2, replay: 1, offline: 3 });
});

test('推荐请求：公开接口、不带 Cookie 与 Referer，网络失败重试一次，结构错误不重试', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) throw new TypeError('Failed to fetch');
    return { ok: true, text: async () => JSON.stringify({ vList: [], iPageNo: 1, iTotalPage: 1 }) };
  };
  const payload = await Workbench.fetchLiveList(2336, 2, undefined, fetchImpl);
  assert.deepEqual(payload.vList, []);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://live.cdn.huya.com/liveHttpUI/getLiveList?iGid=2336&iPageNo=2&iPageSize=120');
  for (const call of calls) {
    assert.equal(call.init.credentials, 'omit');
    assert.equal(call.init.referrerPolicy, 'no-referrer');
    assert.ok(call.init.signal);
  }

  let formatCalls = 0;
  await assert.rejects(Workbench.fetchLiveList(0, 1, undefined, async () => { formatCalls++; return { ok: true, text: async () => '<html>' }; }), { code: 'huya-format-changed' });
  assert.equal(formatCalls, 1);

  await assert.rejects(Workbench.fetchLiveList(0, 1, undefined, async () => { throw new TypeError('Failed to fetch'); }), { code: 'huya-network' });
  await assert.rejects(Workbench.fetchLiveList(0, 1, undefined, async () => ({ ok: false, status: 503 })), { code: 'huya-http' });
  await assert.rejects(Workbench.fetchLiveList(0, 1, undefined, async () => ({ ok: true, text: async () => 'x'.repeat(3_000_001) })), { code: 'huya-format-changed' });
  await assert.rejects(Workbench.fetchLiveList('1&x=1', 1, undefined, async () => { throw new Error('不应发起请求'); }), { code: 'huya-invalid-category' });
});

test('推荐请求：取消立即停止且不重试', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const pending = Workbench.fetchLiveList(0, 1, controller.signal, (url, init) => {
    attempts += 1;
    return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending);
  assert.equal(attempts, 1);
  controller.abort();
  await assert.rejects(Workbench.fetchLiveList(0, 1, controller.signal, async () => { throw new Error('已取消的请求不应发出'); }));
});

test('控制器源码遵守边界：不读 Cookie/存储凭据，不用内联脚本，不改写网络', () => {
  const controller = read('js/huya-controller.js');
  const follow = read('js/huya-follow.js');
  const core = read('js/huya-core.js');
  for (const [name, source] of [['controller', controller], ['follow', follow], ['core', core]]) {
    for (const forbidden of ['document.cookie', 'localStorage', 'sessionStorage', 'eval(', 'new Function(', 'SESSDATA', 'udb_passdata', 'passport']) {
      assert.equal(source.includes(forbidden), false, `${name} 不应包含 ${forbidden}`);
    }
    assert.equal(/headers\s*:|setRequestHeader|['"]referer['"]\s*:/i.test(source), false, `${name} 不应自行设置请求头`);
  }
  assert.equal(/\bon(click|error|load)\s*=/.test(controller), false, '扩展 CSP 不允许内联事件');
  assert.equal(/chrome\.cookies/.test(controller + core), false, 'Cookie 只在后台服务中查询，用于判断是否登录');
  assert.equal(/cookie\??\.value/.test(follow.replace(/Core\.parseLoginCookie\(cookie\?\.value\)/, '')), false, '后台不得使用 Cookie 值（除解析 UID 派生摘要外）');
  assert.ok(controller.includes("action: 'huya_follow'"));
  assert.ok(controller.includes("action: 'huya_follow_release'"));
  assert.ok(controller.includes("credentials: 'omit'"));
  assert.ok(controller.includes('PLAYER_SANDBOX'));
  assert.ok(controller.includes('aria-modal'));
  assert.ok(controller.includes("document.body.classList.add('huya-workbench-open')"));
  assert.ok(controller.includes("document.body.classList.remove('huya-workbench-open')"));
  assert.ok(controller.includes('this.requestId'), '异步结果须经请求序号防止晚到覆盖');
  assert.ok(controller.includes("this.panel.setAttribute('inert', '')"));
});

test('弹窗观看与试看限制：只打开虎牙官方房间页，不伪造来源、不改写网络、不触碰试看计数', () => {
  const controller = read('js/huya-controller.js');
  const core = read('js/huya-core.js');
  const follow = read('js/huya-follow.js');
  const background = read('js/background.js');
  const manifest = JSON.parse(read('manifest.json'));
  // 弹窗只用 safeLink 得到的虎牙直播间地址；扩展窗口 API 不需要新增权限（tabs 为既有权限）。
  assert.match(controller, /const url = player \? safeLink\(player\.item\) : '';\s*if \(!url \|\| player\.poppedOut \|\| this\.popupBusy\) return;/);
  // “弹窗优先”同样只打开 safeLink 得到的虎牙房间页，没有合法地址时退回内嵌，不拼接任何其他地址。
  assert.match(controller, /async _playInPopup\(item\) \{\s*const url = safeLink\(item\);\s*if \(!url\) \{\s*this\._playEmbedded\(item\);\s*return;\s*\}/);
  assert.match(controller, /this\.popupWatcher\.open\(url, popupSize\(globalThis\.screen\)\)/);
  assert.ok(controller.includes("chrome.windows.create({ url, type: 'popup'"));
  assert.ok(controller.includes('noopener,noreferrer'), '回退的 window.open 也不传递 opener 与 Referer');
  assert.ok(manifest.permissions.includes('tabs'));
  // 试看限制来自虎牙自己的播放器脚本与服务端配置；扩展不得伪装来源、清除计数或改写请求。
  for (const [name, source] of [['controller', controller], ['core', core], ['follow', follow]]) {
    for (const forbidden of ['liveLimit', 'wangba', 'inPc', 'UserInfoReq', 'UserInfoRsp', 'Object.defineProperty(document, \'referrer\'', 'declarativeNetRequest', 'webRequest']) {
      assert.equal(source.includes(forbidden), false, `${name} 不应包含 ${forbidden}`);
    }
  }
  assert.equal(/虎牙/.test(background) && /huya-embed|liveshare/.test(background), false, '后台不处理嵌入页请求');
  // 不监听嵌入页发来的 postMessage（试看结束没有可依赖的消息，也不回应它的用户信息请求）。
  assert.equal(/addEventListener\(\s*['"]message['"]/.test(controller), false);
  assert.ok(controller.includes("referrerpolicy=\"strict-origin-when-cross-origin\""));
  // 说明文字里的数字来自真实实测，改动前必须重新验证并更新技术文档。
  assert.ok(read('docs/technical/huya-app-20261011.md').includes('300 秒'));
});

test('样式覆盖状态、响应式与减少动画，遮罩不吞点击', () => {
  const css = read('css/huya-workbench.css');
  for (const selector of ['.hy-panel[hidden]', '.hy-frame-loading[hidden]', '.hy-card-media img.is-broken', '@media (max-width: 620px)', '@media (prefers-reduced-motion: reduce)', '.huya-workbench-open']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /\.hy-frame-loading \{[^}]*pointer-events: none/);
  assert.equal(css.includes('!important') && /z-index:\s*(?!10020)\d{5,}/.test(css), false);
});

test('样式：播放器按可视高度放大，宽屏收起侧栏，网页全屏铺满且纯黑底，小屏不撑破', () => {
  const css = read('css/huya-workbench.css');
  for (const selector of [
    '.hy-panel.is-player .hy-page-heading', '.hy-panel.is-player.is-wide .hy-body', '.hy-panel.is-player.is-wide .hy-nav',
    '.hy-player-layout', '.hy-player-context', '.hy-frame-wrap', '.hy-trial-note', '.hy-handoff',
    '.hy-panel.is-immersive', '.hy-panel.is-immersive .hy-player-layout', '.hy-search', '.hy-ctx-button.is-on',
  ]) assert.ok(css.includes(selector), selector);
  // 播放器宽度 = min(可用宽度, (可视高度 − 其余占用) × 16/9)：操作栏与完整画面同屏可见。
  assert.match(css, /\.hy-player-layout \{[^}]*width: min\(100%, max\(480px, calc\(\(100vh - var\(--hy-chrome-y\)\) \* 16 \/ 9\)\)\)/);
  assert.match(css, /\.hy-frame-wrap \{[^}]*aspect-ratio: 16\/9/);
  assert.match(css, /\.hy-panel\.is-immersive \{[^}]*inset: 0[^}]*background: #000/, '网页全屏用纯黑底，不透出下层页面');
  assert.match(css, /\.hy-panel\.is-immersive \.hy-player-layout \{[^}]*--hy-chrome-y: 52px/);
  assert.equal(/\.hy-panel \{[^}]*rgba\(13, 15, 21, \.98\)/.test(css), false, '面板背景不透明，Dock 与下层文字不会隐约透出');
  // 工具栏按钮不换行、不被压成竖排。
  assert.match(css, /\.hy-toolbar \.hy-secondary[^{]*\{[^}]*white-space: nowrap/);
  assert.match(css, /\.hy-toolbar-main \{[^}]*flex-wrap: wrap/);
  // 窄屏：返回按钮只留图标且不被拉成长条。
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hy-player-context \.hy-ctx-back \{ justify-self: start; \}/);
  // 窄屏导航：人数角标定位在按钮右上角，不再靠静态位置加外边距压住图标。
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.hy-nav button \{ position: relative;/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.hy-nav button em \{ position: absolute; top: 1px; right: 0;/);
  // 播放器不得在样式里偷偷放宽沙箱或改变嵌入页（只允许布局属性）。
  assert.equal(/\.hy-player-frame \{[^}]*(transform|filter|pointer-events|zoom)/.test(css), false);
});

// ---- 第三轮：最近观看、关注分组、弹窗优先 ----

const HOUR = 3_600_000;
// 控制器运行在 vm 上下文里，数组/对象的原型与测试所在的上下文不同：比较前先转成普通 JSON。
const plain = value => JSON.parse(JSON.stringify(value));

function recentItems(specs, now) {
  let list = [];
  for (const [overrides, ago] of specs) list = Core.mergeRecent(list, item(overrides), now - ago);
  return Core.enrichRecent(list, []);
}

test('卡片：弹窗优先改变按钮名称与图标；分组按钮只出现在关注卡片；外链型卡片不受影响', () => {
  const groupMap = new Map([['u9', ['游戏', '音乐']]]);
  const live = Workbench.cardMarkup(item({ id: 'u9', source: 'follow' }), { popup: true, membership: groupMap });
  assert.match(live, /aria-label="弹窗观看 测试主播/);
  assert.match(live, /fa-window-restore/);
  assert.match(live, /data-hy-play="u9"/, '弹窗优先与内嵌共用同一个入口，由控制器按模式分流');
  assert.match(live, /data-hy-action="group-assign" data-hy-id="u9"/);
  assert.match(live, /title="分组：游戏、音乐"/);
  assert.match(live, /hy-card-tool is-on/);
  assert.match(live, /has-tool/);
  assert.equal(hasInlineHandler(live), false);

  const normal = Workbench.cardMarkup(item({ id: 'u9', source: 'follow' }), { membership: new Map() });
  assert.match(normal, /aria-label="观看 测试主播/);
  assert.match(normal, /fa-play/);
  assert.match(normal, /title="加入分组"/);
  assert.equal(normal.includes('is-on'), false, '没有分组时按钮不高亮');

  assert.equal(Workbench.cardMarkup(item({ source: 'recommend' }), { membership: groupMap }).includes('group-assign'), false, '推荐卡片没有分组按钮');
  assert.equal(Workbench.cardMarkup(item({ source: 'follow' })).includes('group-assign'), false, '没有分组数据时不显示按钮');

  const external = Workbench.cardMarkup(item({ embedHost: '', url: 'https://www.huya.com/yy/42' }), { popup: true });
  assert.match(external, /在虎牙打开/);
  assert.equal(external.includes('fa-window-restore'), false, '不能内嵌的卡片没有弹窗图标');
});

test('卡片：状态未知的最近观看不冒充直播中，带上次观看时间与单条移除，名称转义', () => {
  const now = 1_800_000_000_000;
  const [unknown] = recentItems([[{ nick: '<b>坏</b>', title: '<img src=x onerror=alert(1)>' }, 3 * HOUR]], now);
  const markup = Workbench.cardMarkup(unknown, { now, removable: true });
  assert.match(markup, /hy-badge-unknown/);
  assert.match(markup, /状态未知/);
  assert.equal(markup.includes('hy-badge-live'), false);
  assert.equal(markup.includes('直播中'), false);
  assert.match(markup, /上次观看 3 小时前/);
  assert.match(markup, /data-hy-play="u1000001"/, '只要有房间标识就允许尝试内嵌；状态由播放页自己呈现');
  assert.match(markup, /data-hy-action="recent-remove" data-hy-id="u1000001"/);
  assert.equal(markup.includes('group-assign'), false);
  assert.equal(markup.includes('<b>坏</b>'), false);
  assert.equal(markup.includes('<img src=x'), false);
  assert.equal(hasInlineHandler(markup), false);

  // 有足够新的直播数据补全后显示真实状态，仍保留上次观看时间。
  const [enriched] = Core.enrichRecent(Core.mergeRecent([], item(), now - HOUR), [item({ status: 'offline', embedHost: '' })]);
  const offline = Workbench.cardMarkup(enriched, { now, removable: true });
  assert.match(offline, /hy-badge-offline/);
  assert.equal(offline.includes('状态未知'), false);
  assert.equal(offline.includes('data-hy-play'), false, '确认未开播时不再尝试内嵌');
  assert.match(offline, /上次观看 1 小时前/);
});

test('继续观看提示：只引用最近一次观看，可内嵌与否决定按钮，名称转义，可以关闭', () => {
  const now = 1_800_000_000_000;
  const [resumable] = recentItems([[{ nick: '<i>x</i>', title: '"标题"' }, 40 * 60_000]], now);
  const markup = Workbench.resumeMarkup(resumable, { now });
  assert.match(markup, /role="region" aria-label="继续观看"/);
  assert.match(markup, /40 分钟前看过/);
  assert.match(markup, /data-hy-play="u1000001"/);
  assert.match(markup, />\s*继续观看<\/button>/);
  assert.match(markup, /data-hy-action="resume-dismiss"/);
  assert.equal(markup.includes('<i>x</i>'), false);
  assert.equal(hasInlineHandler(markup), false);
  assert.match(Workbench.resumeMarkup(resumable, { now, popup: true }), /弹窗继续观看/);

  const [locked] = recentItems([[{ locked: true }, HOUR]], now);
  const lockedMarkup = Workbench.resumeMarkup(locked, { now });
  assert.match(lockedMarkup, /data-hy-open="u1000001"/);
  assert.equal(lockedMarkup.includes('data-hy-play'), false);

  assert.equal(Workbench.resumeMarkup(null), '');
  assert.equal(Workbench.resumeMarkup({ ...resumable, url: 'https://evil.example/x', embedHost: '' }), '', '没有合法的虎牙地址就没有提示');
});

test('关注分组：筛选条、按分组过滤与统计、空分组和搜索组合的提示、名称转义', () => {
  const now = 1_800_000_000_000;
  const items = [
    item({ id: 'u1', source: 'follow', nick: '甲' }),
    item({ id: 'u2', source: 'follow', nick: '乙', status: 'offline', embedHost: '', url: 'https://www.huya.com/video/u/2', viewersLabel: '' }),
    item({ id: 'u3', source: 'follow', nick: '丙', game: '闲聊' }),
  ];
  const groups = Core.sanitizeGroups({ groups: [
    { id: 'ggame001', name: '游戏', members: ['u1', 'u2', 'u404'] },
    { id: 'gempty01', name: '空', members: [] },
  ] });
  const [group, emptyGroup] = groups.groups;
  const membership = Core.membershipIndex(groups);

  const chips = Workbench.groupChipsMarkup(groups, items, { group });
  assert.match(chips, /data-hy-group="" aria-pressed="false">全部 <em>3<\/em>/);
  assert.match(chips, /data-hy-group="ggame001" aria-pressed="true">游戏 <em>2<\/em>/, '已不在关注列表里的成员不计入');
  assert.match(chips, /data-hy-group="gempty01" aria-pressed="false">空 <em>0<\/em>/);
  assert.match(chips, /data-hy-action="group-manage"/);
  assert.match(Workbench.groupChipsMarkup(groups, items, {}), /data-hy-group="" aria-pressed="true">全部/, '没有选中分组时“全部”是按下状态');
  const guide = Workbench.groupChipsMarkup({ groups: [] }, items, {});
  assert.match(guide, /新建分组/);
  assert.equal(guide.includes('data-hy-action="group-filter"'), false, '没有分组时只有引导，没有筛选项');

  const data = { items, complete: true, fetchedAt: now };
  const filtered = Workbench.followMarkup(data, { now, groups, group, membership });
  assert.match(filtered, /分组「游戏」· <strong>1<\/strong> 位直播中 · 共 2 位/);
  assert.match(filtered, /data-hy-id="u1"/);
  assert.match(filtered, /data-hy-id="u2"/);
  assert.equal(filtered.includes('data-hy-id="u3"'), false, '不在分组里的主播被过滤');
  assert.match(filtered, /<details class="hy-group is-offline" data-hy-offline>/, '分组范围内有直播时，未开播列表默认折叠');
  const onlyOffline = Core.sanitizeGroups({ groups: [{ id: 'goffline1', name: '休息', members: ['u2'] }] });
  assert.match(Workbench.followMarkup(data, { now, groups: onlyOffline, group: onlyOffline.groups[0], membership: Core.membershipIndex(onlyOffline) }), /data-hy-offline open>/, '分组范围内没有直播时，未开播列表默认展开');
  assert.equal(Workbench.followMarkup(data, { now, groups, membership }).includes('data-hy-id="u3"'), true, '不选分组时显示全部');

  const emptyMarkup = Workbench.followMarkup(data, { now, groups, group: emptyGroup, membership });
  assert.match(emptyMarkup, /分组「空」里还没有主播/);
  assert.match(emptyMarkup, /data-hy-action="group-filter" data-hy-group=""/);

  const searching = Workbench.followGroupsMarkup(items, { group, query: '丙', membership });
  assert.match(searching, /分组「游戏」里没有昵称、标题或游戏包含“丙”的主播/, '分组与搜索叠加时提示指出范围');
  assert.match(Workbench.followInfoMarkup(data, { group, query: '甲', now }), /分组「游戏」· 匹配 <strong>1<\/strong> \/ 2 位/);

  const hostile = Core.addGroup({ groups: [] }, '<u onx=1>');
  assert.equal(hostile.ok, true);
  const hostileChips = Workbench.groupChipsMarkup(hostile.state, items, {});
  assert.equal(hostileChips.includes('<u onx'), false);
  assert.match(hostileChips, /&lt;u onx=1&gt;/);
  assert.equal(hasInlineHandler(hostileChips), false);
  assert.equal(hasInlineHandler(Workbench.followMarkup(data, { now, groups: hostile.state, group: hostile.state.groups[0], membership: new Map() })), false);
});

test('分组面板：对话框语义、转义、勾选状态与删除二次确认，输入限制与核心一致', () => {
  const groups = Core.sanitizeGroups({ groups: [
    { id: 'ggame001', name: '<u onx=1>', members: ['u1000001'] },
    { id: 'gmusic01', name: '音乐', members: [] },
  ] });
  const assign = Workbench.assignSheetMarkup(item({ nick: '<b>坏</b>' }), groups, { error: '错误<script>x</script>' });
  assert.match(assign, /role="dialog" aria-modal="true" aria-labelledby="hy-sheet-title"/);
  assert.match(assign, /data-hy-group-toggle="ggame001" checked/);
  assert.match(assign, /data-hy-group-toggle="gmusic01">/);
  assert.match(assign, new RegExp(`maxlength="${Core.GROUP_NAME_MAX}"`));
  assert.match(assign, /data-hy-sheet-form="create-join"/);
  assert.match(assign, /role="alert" data-hy-sheet-error>错误&lt;script&gt;/);
  for (const raw of ['<b>坏</b>', '<script>', '<u onx']) assert.equal(assign.includes(raw), false, raw);
  assert.equal(hasInlineHandler(assign), false);
  assert.match(Workbench.assignSheetMarkup(item(), { groups: [] }), /还没有分组，先在下面新建一个/);

  const manage = Workbench.manageSheetMarkup(groups, {});
  assert.match(manage, /data-hy-group-name="ggame001"/);
  assert.match(manage, /data-hy-action="group-delete" data-hy-group="gmusic01"[^>]*>删除</);
  assert.match(manage, /data-hy-sheet-form="create"/);
  assert.equal(manage.includes('<u onx'), false);
  assert.equal(hasInlineHandler(manage), false);
  const armed = Workbench.manageSheetMarkup(groups, { armedId: 'gmusic01' });
  assert.match(armed, /hy-secondary is-armed" type="button" data-hy-action="group-delete" data-hy-group="gmusic01" aria-label="确认删除分组 音乐">确认删除</);
  assert.match(Workbench.manageSheetMarkup({ groups: [] }, {}), /还没有分组/);

  for (const code of ['group-name-empty', 'group-name-long', 'group-name-duplicate', 'group-limit', 'group-missing', 'group-member-invalid', 'group-member-limit']) {
    assert.notEqual(Workbench.groupErrorMessage(code), Workbench.groupErrorMessage('unknown-code'), code);
  }
  assert.match(Workbench.groupErrorMessage('group-name-long'), new RegExp(String(Core.GROUP_NAME_MAX)));
});

test('分组人数口径一致：筛选条与分组面板都只统计仍在关注列表里的主播', () => {
  const groups = Core.sanitizeGroups({ groups: [{ id: 'ggame001', name: '游戏', members: ['u1000001', 'u1000002', 'u1000003'] }] });
  const present = new Set(['u1000001', 'u1000003']);
  const followed = [item({ id: 'u1000001' }), item({ id: 'u1000003' })];
  assert.match(Workbench.groupChipsMarkup(groups, followed, {}), /游戏 <em>2<\/em>/);
  assert.match(Workbench.assignSheetMarkup(item({ id: 'u1000001' }), groups, { present }), /hy-sheet-count">2 位/);
  assert.match(Workbench.manageSheetMarkup(groups, { present }), /hy-sheet-count">2 位/);
  assert.match(Workbench.manageSheetMarkup(groups, {}), /hy-sheet-count">3 位/, '没有传入关注列表时显示已保存的成员数');
});

test('分组面板重绘会同时清掉“待确认删除”：显示与逻辑状态不能分叉', () => {
  const controller = read('js/huya-controller.js');
  assert.match(controller, /_renderSheet\(\{[\s\S]*?this\.groupDeleteArmed = null;\s*clearTimeout\(this\.deleteArmTimer\);[\s\S]*?backdrop\.innerHTML = markup;/);
});

test('卡片外链：照常在新标签页打开，只把这次打开记入最近观看；未开播的房间不记录', async () => {
  assert.match(Workbench.cardMarkup(item({ id: 'u1' })), /<a class="hy-card-link" data-hy-link="u1" href="https:\/\/www\.huya\.com\//);
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const recorded = [];
  controller._recordRecent = entry => recorded.push(entry.id);
  controller._findItem = id => ({ u1: item({ id: 'u1' }), u2: item({ id: 'u2', status: 'offline' }) })[id] || null;
  const click = async id => {
    let prevented = false;
    const link = { dataset: { hyLink: id } };
    const event = {
      target: { matches: () => false, closest: selector => (selector === 'a[data-hy-link]' ? link : null) },
      preventDefault() { prevented = true; },
    };
    await controller._handleClick(event);
    return prevented;
  };
  assert.equal(await click('u1'), false, '不拦截链接本身的跳转');
  assert.equal(await click('u2'), false);
  assert.equal(await click('u9'), false, '找不到条目也不拦截');
  assert.deepEqual(recorded, ['u1']);
});

test('最近观看页：数量与保留说明、清除二次确认、空状态引导，每张卡片可移除', () => {
  const now = 1_800_000_000_000;
  const items = recentItems([[{ id: 'u1', nick: '甲' }, 2 * HOUR], [{ id: 'u2', nick: '乙' }, HOUR]], now);
  assert.deepEqual(plain(items.map(entry => entry.id)), ['u2', 'u1'], '最近的在前');
  const markup = Workbench.recentMarkup(items, { now });
  assert.match(markup, /<strong>2<\/strong> 个直播间 · 只保存在本机浏览器，最多 30 个、保留 30 天/);
  assert.equal((markup.match(/data-hy-action="recent-remove"/g) || []).length, 2);
  assert.match(markup, /data-hy-action="clear-recent">清除记录</);
  assert.match(Workbench.recentMarkup(items, { clearArmed: true, now }), /再次点击确认清除/);
  assert.match(Workbench.recentMarkup(items, { popup: true, now }), /aria-label="弹窗观看 乙/);

  const empty = Workbench.recentMarkup([], {});
  assert.match(empty, /还没有观看记录/);
  assert.match(empty, /data-hy-action="clear-recent" disabled/);
  assert.match(empty, /data-huya-view="follow"/);
  assert.match(empty, /data-huya-view="recommend"/);
  assert.equal(hasInlineHandler(markup + empty), false);
});

function popupApi() {
  const calls = [];
  const windows = new Map();
  let nextId = 40;
  const api = {
    runtime: {},
    windows: {
      create(options, callback) {
        const id = nextId++;
        windows.set(id, { id, type: 'popup', tabs: [{ id: id * 10, url: options.url }] });
        calls.push(['create', options.url]);
        callback({ id });
      },
      get(id, info, callback) {
        calls.push(['get', id, info.populate]);
        const found = windows.get(id);
        if (!found) api.runtime.lastError = { message: 'No window with id' };
        callback(found);
        delete api.runtime.lastError;
      },
      update(id, info, callback) {
        calls.push(['focus', id, info.focused]);
        callback({ id });
      },
    },
    tabs: {
      update(tabId, props, callback) {
        calls.push(['navigate', tabId, props.url, props.active]);
        if (api.failNavigate) api.runtime.lastError = { message: 'Tabs cannot be edited right now' };
        callback(api.failNavigate ? undefined : { id: tabId });
        delete api.runtime.lastError;
      },
    },
  };
  return { api, calls, windows };
}

test('弹窗观看窗口复用：再次打开时在原窗口换房间并聚焦，窗口失效或无法导航时才新建', async () => {
  const size = { width: 1000, height: 600 };
  const { api, calls, windows } = popupApi();
  const watcher = loadWorkbench({ chrome: api }).Workbench.createPopupWatcher();

  assert.deepEqual({ ...await watcher.open('https://www.huya.com/1', size) }, { ok: true, reused: false });
  assert.deepEqual({ ...await watcher.open('https://www.huya.com/2', size) }, { ok: true, reused: true });
  assert.deepEqual(calls, [
    ['create', 'https://www.huya.com/1'],
    ['get', 40, true], ['navigate', 400, 'https://www.huya.com/2', true], ['focus', 40, true],
  ], '复用时不新建窗口：读取窗口、导航到新房间、聚焦');

  windows.delete(40);
  calls.length = 0;
  assert.deepEqual({ ...await watcher.open('https://www.huya.com/3', size) }, { ok: true, reused: false }, '窗口已被用户关闭');
  assert.deepEqual(calls, [['get', 40, true], ['create', 'https://www.huya.com/3']]);

  api.failNavigate = true;
  calls.length = 0;
  assert.equal((await watcher.open('https://www.huya.com/4', size)).reused, false, '无法导航时新建窗口');
  assert.deepEqual(calls.map(call => call[0]), ['get', 'navigate', 'create']);
  api.failNavigate = false;

  windows.get(42).type = 'normal';
  calls.length = 0;
  assert.equal((await watcher.open('https://www.huya.com/5', size)).reused, false, '不是弹窗类型的窗口不接管');
  assert.deepEqual(calls.map(call => call[0]), ['get', 'create']);

  windows.get(43).tabs.push({ id: 999, url: 'https://example.com/' });
  calls.length = 0;
  assert.equal((await watcher.open('https://www.huya.com/6', size)).reused, false, '窗口里不止一个标签页时不接管');

  const failing = loadWorkbench({ chrome: { runtime: {}, windows: { create(options, callback) { api.runtime.lastError = { message: 'blocked' }; callback(undefined); } } } }).Workbench.createPopupWatcher();
  assert.deepEqual({ ...await failing.open('https://www.huya.com/8', size) }, { ok: false, reused: false });
  const preview = loadWorkbench({ window: { open: () => null } }).Workbench.createPopupWatcher();
  assert.deepEqual({ ...await preview.open('https://www.huya.com/9', size) }, { ok: true, reused: false }, '本地预览没有窗口 API：只能视为已发起，也不会复用');
});

// ---- 弹窗里自动进入虎牙“剧场模式” ----
// 替身只实现 createTheaterAssist / createPopupWatcher 用到的 windows、tabs、webNavigation、scripting。
// 与真实 Chrome 一致：创建或导航后，旧文档在新文档提交前仍是当前文档；新的导航会取消尚未提交的上一次导航；注入时文档已被替换会失败。
function theaterWorld({ commitDelay = 8 } = {}) {
  const world = { windows: new Map(), tabs: new Map(), injections: [], injectionOutcomes: [], nextWindow: 70, nextDocument: 1, commitDelay };
  const api = { runtime: {} };
  const fail = (callback, message) => { api.runtime.lastError = { message }; callback(undefined); delete api.runtime.lastError; };
  const documentOf = (url, extra = {}) => ({ url, documentId: `doc-${world.nextDocument++}`, documentLifecycle: 'active', errorOccurred: false, ...extra });
  world.commit = (tabId, url, extra = {}) => { const tab = world.tabs.get(tabId); if (tab) tab.frame = documentOf(url, extra); };
  const navigate = (tabId, url) => {
    const tab = world.tabs.get(tabId);
    clearTimeout(tab.pending);
    tab.pending = setTimeout(() => world.commit(tabId, url), world.commitDelay);
  };
  api.windows = {
    create(options, callback) {
      const windowId = world.nextWindow++;
      const tabId = windowId * 10;
      world.tabs.set(tabId, { id: tabId, frame: documentOf('about:blank'), pending: 0 });
      world.windows.set(windowId, { id: windowId, type: 'popup', tabs: [{ id: tabId }] });
      navigate(tabId, options.url);
      callback({ id: windowId, type: 'popup', tabs: [{ id: tabId, url: '', pendingUrl: options.url, status: 'loading' }] });
    },
    get(id, info, callback) {
      const found = world.windows.get(id);
      if (!found) { fail(callback, 'No window with id'); return; }
      callback({ ...found });
    },
    update(id, info, callback) { callback({ id }); },
  };
  api.tabs = {
    update(tabId, props, callback) {
      if (!world.tabs.has(tabId)) { fail(callback, 'No tab with id'); return; }
      navigate(tabId, props.url);
      callback({ id: tabId });
    },
    get(tabId, callback) {
      const tab = world.tabs.get(tabId);
      if (!tab) { fail(callback, 'No tab with id'); return; }
      callback({ id: tabId, url: tab.frame.url });
    },
  };
  api.webNavigation = {
    getFrame(details, callback) {
      const tab = world.tabs.get(details.tabId);
      if (!tab || details.frameId !== 0) { fail(callback, 'No frame found'); return; }
      callback({ ...tab.frame });
    },
  };
  api.scripting = {
    executeScript(injection, callback) {
      world.injections.push(injection);
      const tab = world.tabs.get(injection.target.tabId);
      const outcome = world.injectionOutcomes.shift() || 'ok';
      if (outcome === 'throw') throw new Error('boom');
      if (!tab || tab.frame.documentId !== injection.target.documentIds?.[0] || outcome === 'fail') { fail(callback, 'The frame was removed.'); return; }
      callback([{ frameId: 0, documentId: tab.frame.documentId, result: { state: 'entered', clicks: 1 } }]);
    },
  };
  world.api = api;
  return world;
}

const THEATER_SIZE = { width: 1000, height: 600 };
const FAST_ASSIST = { pollMs: 2, commitMs: 600 };

function theaterWatcher(world, timing = FAST_ASSIST) {
  const loaded = loadWorkbench({ chrome: world.api });
  return { loaded, watcher: loaded.Workbench.createPopupWatcher({ theater: loaded.Workbench.createTheaterAssist(timing) }) };
}

test('弹窗新建后进入剧场模式：等虎牙房间页提交，再只对这一份文档注入一次页内函数，open 的返回值不变也不等它', async () => {
  const world = theaterWorld();
  const { loaded, watcher } = theaterWatcher(world);

  const result = await watcher.open('https://www.huya.com/1995', THEATER_SIZE);
  assert.deepEqual({ ...result }, { ok: true, reused: false });
  assert.equal(world.injections.length, 0, 'open 返回时房间页还没有提交；about:blank 不是虎牙页面，不能提前注入');

  assert.deepEqual([...await watcher.settle()], ['entered']);
  assert.equal(world.injections.length, 1);
  const [injection] = world.injections;
  const tab = world.tabs.get(700);
  assert.equal(tab.frame.url, 'https://www.huya.com/1995');
  assert.deepEqual(plain(injection.target), { tabId: 700, documentIds: [tab.frame.documentId] }, '按文档标识绑定，不是按整个标签页');
  assert.equal(injection.world, 'ISOLATED');
  assert.equal(injection.injectImmediately, true);
  assert.equal(injection.func, loaded.Core.enterTheaterPage, '只注入固定的页内函数');
  assert.deepEqual(plain(injection.args), [{ timeoutMs: 45000 }]);
});

test('弹窗复用换房间：不向导航前的旧文档注入，只在新文档提交后注入；同一地址再次打开也靠文档标识区分', async () => {
  const world = theaterWorld({ commitDelay: 20 });
  const { watcher } = theaterWatcher(world);
  await watcher.open('https://www.huya.com/1', THEATER_SIZE);
  await watcher.settle();
  const firstDocument = world.tabs.get(700).frame.documentId;
  world.injections.length = 0;

  const reuse = await watcher.open('https://www.huya.com/2', THEATER_SIZE);
  assert.deepEqual({ ...reuse }, { ok: true, reused: true });
  assert.equal(world.tabs.get(700).frame.documentId, firstDocument, '导航刚发起，旧文档仍是当前文档');
  await new Promise(resolve => setTimeout(resolve, 8));
  assert.equal(world.injections.length, 0, '旧文档（上一个房间的页面）即将被替换，不能注入');
  assert.deepEqual([...await watcher.settle()], ['entered']);
  const secondDocument = world.tabs.get(700).frame.documentId;
  assert.notEqual(secondDocument, firstDocument);
  assert.equal(world.tabs.get(700).frame.url, 'https://www.huya.com/2');
  assert.equal(world.injections.length, 1);
  assert.deepEqual(plain(world.injections[0].target.documentIds), [secondDocument]);

  await watcher.open('https://www.huya.com/2', THEATER_SIZE);
  await watcher.settle();
  assert.equal(world.injections.length, 2, '同一地址再次打开也是新文档，同样进入剧场模式');
  assert.notEqual(world.injections[1].target.documentIds[0], secondDocument);
});

test('只注入已核对为 www.huya.com 的活动文档：空白页、错误页、他站、同名子域、http、加载出错与非活动文档一律不注入', async () => {
  const cases = [
    ['about:blank', {}],
    ['chrome-error://chromewebdata/', {}],
    ['https://example.com/1', {}],
    ['https://www.huya.com.evil.example/1', {}],
    ['https://evil.example/https://www.huya.com/1', {}],
    ['http://www.huya.com/1', {}],
    ['https://huya.com/1', {}],
    ['https://www.huya.com/1', { errorOccurred: true }],
    ['https://www.huya.com/1', { documentLifecycle: 'prerender' }],
    ['https://www.huya.com/1', { documentLifecycle: 'cached' }],
    ['https://www.huya.com/1', { documentId: '' }],
    ['not a url', {}],
  ];
  for (const [url, extra] of cases) {
    const world = theaterWorld();
    world.tabs.set(5, { id: 5, frame: { url, documentId: 'x1', documentLifecycle: 'active', errorOccurred: false, ...extra }, pending: 0 });
    const { Workbench } = loadWorkbench({ chrome: world.api });
    assert.equal(await Workbench.createTheaterAssist({ pollMs: 2, commitMs: 40 }).enter(5, null), 'timeout', `${url} ${JSON.stringify(extra)}`);
    assert.equal(world.injections.length, 0, `${url} ${JSON.stringify(extra)} 不得注入`);
  }
});

test('剧场模式是尽力而为：标签页关闭、接口缺失、注入失败或抛异常都不影响弹窗打开，也不产生未处理的拒绝', async () => {
  const unhandled = [];
  const onUnhandled = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    // 标签页不存在 / 等待期间被关闭
    const gone = theaterWorld();
    const goneAssist = loadWorkbench({ chrome: gone.api }).Workbench.createTheaterAssist(FAST_ASSIST);
    assert.equal(await goneAssist.enter(404, null), 'closed');
    assert.equal(await goneAssist.currentDocument(404), null);

    const closing = theaterWorld({ commitDelay: 60 });
    const closingWatcher = theaterWatcher(closing).watcher;
    await closingWatcher.open('https://www.huya.com/1', THEATER_SIZE);
    closing.tabs.delete(700);
    assert.deepEqual([...await closingWatcher.settle()], ['closed']);
    assert.equal(closing.injections.length, 0);

    // 没有 webNavigation / scripting 接口（本地预览或权限缺失）：弹窗照常打开
    const bare = { runtime: {}, windows: { create(options, callback) { callback({ id: 9, tabs: [{ id: 90 }] }); } }, tabs: {} };
    const bareWatcher = loadWorkbench({ chrome: bare }).Workbench.createPopupWatcher();
    assert.deepEqual({ ...await bareWatcher.open('https://www.huya.com/1', THEATER_SIZE) }, { ok: true, reused: false });
    assert.deepEqual([...await bareWatcher.settle()], ['closed']);

    // 创建结果没有唯一的标签页：不猜标签页，也不注入
    const noTab = theaterWorld();
    noTab.api.windows.create = (options, callback) => callback({ id: 9, type: 'popup', tabs: [{ id: 1 }, { id: 2 }] });
    const noTabWatcher = theaterWatcher(noTab).watcher;
    assert.deepEqual({ ...await noTabWatcher.open('https://www.huya.com/1', THEATER_SIZE) }, { ok: true, reused: false });
    assert.deepEqual([...await noTabWatcher.settle()], []);

    // 注入失败 / 同步抛异常：该文档只试一次，之后等到时限放弃，open 的结果不受影响
    for (const outcome of ['fail', 'throw']) {
      const broken = theaterWorld();
      broken.injectionOutcomes.push(outcome);
      const { watcher } = theaterWatcher(broken, { pollMs: 2, commitMs: 80 });
      assert.deepEqual({ ...await watcher.open('https://www.huya.com/1', THEATER_SIZE) }, { ok: true, reused: false });
      assert.deepEqual([...await watcher.settle()], ['timeout'], outcome);
      assert.equal(broken.injections.length, 1, `${outcome}：同一份文档不重复注入`);
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled, []);
});

test('页面自己跳转替换了文档：对新文档重新注入；注入次数、等待时间都有上限', async () => {
  const replaced = theaterWorld({ commitDelay: 5 });
  replaced.injectionOutcomes.push('fail', 'ok');
  const { watcher } = theaterWatcher(replaced);
  await watcher.open('https://www.huya.com/1', THEATER_SIZE);
  // 第一份文档注入失败后，页面跳转到别名地址，换成新文档。
  setTimeout(() => replaced.commit(700, 'https://www.huya.com/alias'), 25);
  assert.deepEqual([...await watcher.settle()], ['entered']);
  assert.equal(replaced.injections.length, 2);
  assert.notEqual(replaced.injections[0].target.documentIds[0], replaced.injections[1].target.documentIds[0]);
  assert.equal(replaced.tabs.get(700).frame.url, 'https://www.huya.com/alias');

  const churning = theaterWorld({ commitDelay: 5 });
  churning.injectionOutcomes.push('fail', 'fail', 'fail', 'fail', 'fail');
  const churn = theaterWatcher(churning, { pollMs: 2, commitMs: 400 });
  await churn.watcher.open('https://www.huya.com/1', THEATER_SIZE);
  const timer = setInterval(() => churning.commit(700, 'https://www.huya.com/again'), 8);
  try {
    assert.deepEqual([...await churn.watcher.settle()], ['timeout']);
  } finally { clearInterval(timer); }
  assert.equal(churning.injections.length, 3, '最多注入 3 次');
});

test('同一个弹窗连续换房间：前一次等待立即作废，不会对已被取消的导航注入', async () => {
  const world = theaterWorld({ commitDelay: 30 });
  const { watcher } = theaterWatcher(world);
  await watcher.open('https://www.huya.com/1', THEATER_SIZE);
  const second = await watcher.open('https://www.huya.com/2', THEATER_SIZE);
  assert.equal(second.reused, true);
  assert.deepEqual([...await watcher.settle()], ['superseded', 'entered']);
  assert.equal(world.tabs.get(700).frame.url, 'https://www.huya.com/2', '第二次导航取代了尚未提交的第一次');
  assert.equal(world.injections.length, 1);
  assert.deepEqual(plain(world.injections[0].target.documentIds), [world.tabs.get(700).frame.documentId]);
});

test('剧场模式只注入固定的页内函数：绑定文档、隔离世界、立即注入；不新增权限，没有常驻脚本、样式或页面世界注入', () => {
  const controller = read('js/huya-controller.js');
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(controller.includes('func: Core.enterTheaterPage'));
  assert.ok(controller.includes('documentIds: [frame.documentId]'));
  assert.ok(controller.includes("world: 'ISOLATED'"));
  assert.ok(controller.includes('injectImmediately: true'));
  assert.equal([...controller.matchAll(/'executeScript'/g)].length, 1, '控制器里只有这一处注入');
  for (const forbidden of ["world: 'MAIN'", 'registerContentScripts', 'insertCSS', 'tabs.executeScript', 'eval(', 'new Function(']) {
    assert.equal(controller.includes(forbidden), false, `控制器不应包含 ${forbidden}`);
  }
  for (const permission of ['scripting', 'webNavigation', 'tabs']) assert.ok(manifest.permissions.includes(permission), `${permission} 为既有权限`);
  assert.deepEqual(manifest.host_permissions.filter(host => host.includes('huya')), ['https://www.huya.com/*']);
  assert.equal(manifest.content_scripts.some(entry => entry.matches.some(pattern => pattern.includes('huya'))), false);
  // 弹窗打开的入口仍然只有 popupWatcher.open，没有第二条绕过剧场处理的路径。
  assert.equal([...controller.matchAll(/chrome\.windows\.create\(/g)].length, 1);
});

function fakeStorage(initial = {}) {
  const data = { ...initial };
  let calls = 0;
  return {
    data,
    runtime: {},
    storage: {
      local: {
        get(defaults, callback) {
          const delay = Math.max(0, 6 - calls++);
          const result = { ...defaults };
          for (const key of Object.keys(defaults)) if (key in data) result[key] = structuredClone(data[key]);
          setTimeout(() => callback(result), delay);
        },
        set(values, callback) {
          setTimeout(() => { for (const [key, value] of Object.entries(values)) data[key] = structuredClone(value); callback(); }, 1);
        },
      },
    },
  };
}

test('本机数据读写串行：并发的观看记录与分组修改不会互相覆盖，失败不写存储，损坏数据不抛错', async () => {
  const api = fakeStorage();
  const { controller, Core: LoadedCore } = loadWorkbench({ chrome: api, CSS: { escape: value => value } });

  controller._recordRecent(item({ id: 'u1', nick: '甲' }));
  controller._recordRecent(item({ id: 'u2', nick: '乙' }));
  controller._recordRecent(item({ id: 'u1', nick: '甲' }));
  await controller.storageQueue;
  assert.deepEqual(api.data[LoadedCore.RECENT_KEY].items.map(entry => entry.id), ['u1', 'u2'], '重复观看移到最前，不产生重复记录');
  assert.equal(api.data[LoadedCore.RECENT_KEY].version, 1);
  assert.equal(controller.sessionWatched, true);

  const created = await controller._mutateGroups(state => LoadedCore.addGroup(state, '游戏'));
  assert.equal(created.ok, true);
  const groupId = created.group.id;
  const [first, second] = await Promise.all([
    controller._mutateGroups(state => LoadedCore.setGroupMember(state, groupId, 'u1', true)),
    controller._mutateGroups(state => LoadedCore.setGroupMember(state, groupId, 'u2', true)),
  ]);
  assert.equal(first.ok && second.ok, true);
  assert.deepEqual(api.data[LoadedCore.GROUPS_KEY].groups[0].members, ['u1', 'u2'], '并发修改按顺序叠加');

  const before = JSON.stringify(api.data[LoadedCore.GROUPS_KEY]);
  const missing = await controller._mutateGroups(state => LoadedCore.deleteGroup(state, 'gnone0001'));
  assert.equal(missing.code, 'group-missing');
  assert.equal(JSON.stringify(api.data[LoadedCore.GROUPS_KEY]), before, '失败的修改不写存储');
  assert.equal((await controller._mutateGroups(() => { throw new Error('boom'); })), null, '修改函数抛错按失败返回，队列继续可用');
  assert.equal((await controller._mutateGroups(state => LoadedCore.renameGroup(state, groupId, '手游'))).ok, true);

  // 另一个新标签页（另一个控制器实例）写入的内容在下一次修改时被读到，不会被旧的内存状态覆盖。
  const other = loadWorkbench({ chrome: api, CSS: { escape: value => value } });
  await other.controller._mutateGroups(state => other.Core.addGroup(state, '音乐'));
  await controller._mutateGroups(state => LoadedCore.setGroupMember(state, groupId, 'u3', true));
  assert.deepEqual(api.data[LoadedCore.GROUPS_KEY].groups.map(group => group.name), ['手游', '音乐']);
  assert.deepEqual(api.data[LoadedCore.GROUPS_KEY].groups[0].members, ['u1', 'u2', 'u3']);

  const corrupted = fakeStorage({ huyaRecent: 'oops', huyaGroups: [{ id: 5 }, null, { id: 'bad id', name: 'x', members: 1 }] });
  const fresh = loadWorkbench({ chrome: corrupted, CSS: { escape: value => value } }).controller;
  await fresh._refreshLocalState();
  assert.deepEqual(plain(fresh.recent), []);
  assert.deepEqual(plain(fresh.groups), { groups: [] });
});

test('点击直播间的分流：弹窗优先只对可内嵌、且不在播放器里的直播间生效', () => {
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const calls = [];
  controller._playEmbedded = entry => calls.push(['embed', entry.id]);
  controller._playInPopup = entry => { calls.push(['popup', entry.id]); return Promise.resolve(); };
  controller._openExternal = entry => calls.push(['external', entry.id]);
  const live = item({ id: 'u1' });

  controller.openMode = 'embed';
  controller._play(live);
  controller.openMode = 'popup';
  controller._play(live);
  controller._play(item({ id: 'u2', locked: true }));
  controller._play(item({ id: 'u4', status: 'offline', embedHost: '' }));
  controller.player = { item: live };
  controller._play(item({ id: 'u3' }));
  assert.deepEqual(calls, [['embed', 'u1'], ['popup', 'u1'], ['external', 'u2'], ['external', 'u4'], ['embed', 'u3']]);
});

test('弹窗优先默认开启：构造时默认弹窗；点击开关才算明确选择，随设置保存，之后的视图偏好保存不会丢掉或改写它', async () => {
  // 旧版本在每次保存视图偏好时都会自动写入 openMode:'embed'，没有 openModeChosen；它不是用户的选择。
  const api = fakeStorage({ huyaSettings: { view: 'follow', openMode: 'embed', playerWide: false } });
  const { controller, Core: LoadedCore } = loadWorkbench({ chrome: api, CSS: { escape: value => value } });
  assert.equal(controller.openMode, 'popup', '默认弹窗');
  assert.equal(controller.openModeChosen, false);
  assert.equal(LoadedCore.resolveOpenMode(api.data.huyaSettings), 'popup', '旧版本自动写入的 embed 按默认处理');

  const controllerSource = read('js/huya-controller.js');
  assert.match(controllerSource, /this\.openMode = Core\.resolveOpenMode\(this\.settings\);\s*this\.openModeChosen = Core\.isOpenModeChosen\(this\.settings\);/, '初始化用同一组解析函数，损坏的取值不会被保存成“明确选择”');
  assert.equal(/this\.openMode = this\.settings\.openMode/.test(controllerSource), false, '不能绕过 resolveOpenMode 直接信任保存的取值');

  const statuses = [];
  controller._setStatus = message => statuses.push(message);
  controller._renderCurrentList = () => statuses.push('render');
  // 没点过开关时，保存其他偏好只写出默认值，不能把默认写成“明确选择”。
  controller.settings = { ...api.data.huyaSettings };
  controller.playerMode.wide = false; // init() 会按已保存的设置还原这个状态；这里直接模拟
  controller._persist();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(api.data.huyaSettings.openModeChosen, false);
  assert.equal(LoadedCore.resolveOpenMode(api.data.huyaSettings), 'popup');

  // 点击开关：关闭弹窗优先，成为明确选择，重新加载后仍是内嵌。
  controller._setOpenMode('embed');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(controller.openMode, 'embed');
  assert.equal(controller.openModeChosen, true);
  assert.deepEqual(plain(api.data.huyaSettings), { view: 'follow', openMode: 'embed', playerWide: false, openModeChosen: true, category: 'hot', followSort: 'default' }, '保留既有偏好，只新增选择标记');
  assert.equal(LoadedCore.resolveOpenMode(api.data.huyaSettings), 'embed');
  assert.ok(statuses.some(message => /已关闭弹窗优先/.test(message) && /试看限制/.test(message)));

  // 明确选择后，其他偏好的保存继续带着这个选择。
  controller._persist();
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(LoadedCore.resolveOpenMode(api.data.huyaSettings), 'embed');

  // 再次打开：同样是明确选择，不会被默认覆盖。
  controller._setOpenMode('popup');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(api.data.huyaSettings.openModeChosen, true);
  assert.equal(LoadedCore.resolveOpenMode(api.data.huyaSettings), 'popup');
  assert.ok(statuses.some(message => /已开启弹窗优先/.test(message)));
});

test('弹窗成功后的提示：默认开启时说明在哪里关闭，用户明确选择过之后不再重复', async () => {
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const statuses = [];
  controller.isOpen = true;
  controller._setStatus = message => statuses.push(message);
  controller._recordRecent = () => {};
  controller.popupWatcher = { open: async () => ({ ok: true, reused: false }) };
  const live = item({ id: 'u1' });

  await controller._playInPopup(live);
  assert.match(statuses.at(-1), /已在独立窗口打开 测试主播/);
  assert.match(statuses.at(-1), /弹窗优先默认开启，可在右上角关闭/);

  controller.openModeChosen = true;
  await controller._playInPopup(live);
  assert.match(statuses.at(-1), /已在独立窗口打开 测试主播/);
  assert.equal(/默认开启/.test(statuses.at(-1)), false, '用户明确选择后不再解释默认值');
});

test('弹窗优先的结果处理：成功记入最近观看且不内嵌；失败退回内嵌并提示；忙碌时忽略重复点击；没有地址时内嵌', async () => {
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const calls = [];
  controller.isOpen = true;
  controller._setStatus = message => calls.push(['status', message]);
  controller._recordRecent = entry => calls.push(['record', entry.id]);
  controller._playEmbedded = (entry, options) => calls.push(['embed', entry.id, options?.toast || '']);
  const live = item({ id: 'u1' });

  controller.popupWatcher = { open: async url => { calls.push(['open', url]); return { ok: true, reused: false }; } };
  await controller._playInPopup(live);
  assert.deepEqual(calls.map(call => call[0]), ['open', 'record', 'status']);
  assert.equal(calls[0][1], 'https://www.huya.com/520001');
  assert.match(calls[2][1], /已在独立窗口打开 测试主播/);

  calls.length = 0;
  controller.popupWatcher = { open: async () => ({ ok: true, reused: true }) };
  await controller._playInPopup(live);
  assert.match(calls.find(call => call[0] === 'status')[1], /已有的独立窗口切换到/);

  calls.length = 0;
  controller.popupWatcher = { open: async () => ({ ok: false, reused: false }) };
  await controller._playInPopup(live);
  assert.deepEqual(calls.map(call => call[0]), ['embed'], '失败不记录观看，直接退回内嵌');
  assert.match(calls[0][2], /已改为在这里内嵌播放/);

  calls.length = 0;
  let release;
  controller.popupWatcher = { open: () => new Promise(resolve => { release = () => resolve({ ok: true, reused: false }); }) };
  const pending = controller._playInPopup(live);
  await controller._playInPopup(item({ id: 'u2' }));
  assert.deepEqual(calls, [], '上一次弹窗还没返回时，重复点击被忽略');
  release();
  await pending;
  assert.equal(controller.popupBusy, false);

  calls.length = 0;
  await controller._playInPopup(item({ id: 'u5', url: 'https://evil.example/x' }));
  assert.deepEqual(calls.map(call => call[0]), ['embed'], '没有合法的虎牙地址时不弹窗');
});

test('继续观看的显示条件：12 小时内、本次打开还没看过、没有被关闭、对应主播没有已知下播', () => {
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const now = Date.now();
  controller.recent = Core.mergeRecent([], item(), now - HOUR);
  controller.view = 'follow';
  controller.follow.data = { items: [], fetchedAt: now };
  assert.ok(controller._resumeEntry());
  assert.match(controller._resumeMarkup(), /1 小时前看过/);

  controller.sessionWatched = true;
  assert.equal(controller._resumeEntry(), null, '本次打开期间已经看过东西就不再提示');
  controller.sessionWatched = false;

  controller.settings = { resumeDismissed: `${controller.recent[0].id}:${controller.recent[0].watchedAt}` };
  assert.equal(controller._resumeEntry(), null, '用户关闭过这一条');
  controller.recent = Core.mergeRecent(controller.recent, item(), now - 60_000);
  assert.ok(controller._resumeEntry(), '再次观看产生新记录后提示重新出现');

  controller.settings = {};
  controller.recent = Core.mergeRecent([], item(), now - 13 * HOUR);
  assert.equal(controller._resumeEntry(), null, '超过 12 小时不再提示');

  controller.recent = Core.mergeRecent([], item(), now - HOUR);
  controller.follow.data = { items: [item({ source: 'follow', status: 'offline', embedHost: '' })], fetchedAt: now };
  assert.equal(controller._resumeMarkup(), '', '已知未开播时没有可继续的内容');
  controller.follow.data = { items: [item({ source: 'follow', status: 'live' })], fetchedAt: now };
  assert.match(controller._resumeMarkup(), /data-hy-play="u1000001"/, '列表里已有这位主播时，按钮与卡片使用同一份数据');
});

test('最近观看的状态补全：只采用 10 分钟内读取的数据，更早的数据保持“状态未知”', () => {
  const { controller } = loadWorkbench({ CSS: { escape: value => value } });
  const now = Date.now();
  controller.recent = Core.mergeRecent([], item({ id: 'u1' }), now - 30 * 60_000);
  controller.follow.data = { items: [item({ id: 'u1', source: 'follow', status: 'offline', embedHost: '' })], fetchedAt: now - 11 * 60_000 };
  assert.equal(controller._recentItems()[0].status, 'unknown', '11 分钟前的关注数据太旧');
  controller.follow.data.fetchedAt = now - 2 * 60_000;
  assert.equal(controller._recentItems()[0].status, 'offline');

  controller.follow.data = null;
  controller.recommend.set('hot', { items: [item({ id: 'u1', status: 'live', viewers: 4200 })], page: 1, totalPages: 1, fetchedAt: now - 30_000 });
  const live = controller._recentItems()[0];
  assert.equal(live.status, 'live');
  assert.equal(live.source, 'recent', '补全后仍是最近观看条目，不会长出分组按钮');
  controller.recommend.get('hot').fetchedAt = now + 5 * 60_000;
  assert.equal(controller._recentItems()[0].status, 'unknown', '来自未来的时间戳不可信');
});

test('第三轮边界：本机数据只走 chrome.storage.local，不入网络、不进 AI，入口与面板标记完整', () => {
  const controller = read('js/huya-controller.js');
  assert.equal(/localStorage|sessionStorage|indexedDB/.test(controller), false);
  assert.equal(/sendMessage\([^)]*(recent|group)/i.test(controller), false, '观看记录与分组不发给后台');
  assert.equal(/fetch\([^)]*(recent|group)/i.test(controller), false);
  assert.equal(/RECENT_KEY|GROUPS_KEY/.test(read('js/background.js')), false, '后台不读写这两份数据');
  assert.equal(/huyaRecent|huyaGroups/.test(read('js/app-video.js') + read('js/assistant-tools.js')), false, '不接入 AI 助手与视频深链');
  // 面板里的入口：最近观看导航、弹窗优先开关（带 aria-pressed）、分组与记录动作只用 data 属性委托。
  assert.match(controller, /data-huya-view="recent"[^>]*>[\s\S]{0,120}最近观看/);
  assert.match(controller, /data-hy-action="toggle-open-mode" aria-pressed="true" aria-label="弹窗优先"/, '默认开启，初始标记与默认一致，初始化后再按保存的选择同步');
  assert.equal(/\sonclick=|\sonchange=|\sonsubmit=/.test(controller), false);
  assert.match(controller, /_closeSheet\(\{ restoreFocus: false \}\);\s*this\._removeFrame\(\);/, '关闭工作台时同时收起分组面板');
  // 弹窗优先只在设置里保存开关，不保存任何直播间或窗口信息。
  assert.match(controller, /playerWide: this\.playerMode\.wide, openMode: this\.openMode, openModeChosen: this\.openModeChosen \}/);
  assert.equal(/windowId[\s\S]{0,40}storageSet|storageSet[\s\S]{0,80}windowId/.test(controller), false);
  assert.ok(read('docs/technical/huya-app-20261011.md').includes('最近观看'));
});

test('第三轮样式：分组面板、筛选条、继续观看与弹窗开关都有样式，提示不拦截点击，窄屏保留功能按钮', () => {
  const css = read('css/huya-workbench.css');
  for (const selector of ['.hy-mode-toggle', '.hy-chips', '.hy-chip[aria-pressed="true"]', '.hy-card-tool', '.hy-resume', '.hy-sheet-backdrop', '.hy-sheet', '.hy-sheet-input', '.hy-toast', '.hy-badge-unknown']) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(css, /\.hy-mode-toggle\[aria-pressed="true"\]/);
  assert.match(css, /\.hy-toast \{[^}]*pointer-events: none/, '自动消失的提示不拦截画面点击');
  assert.match(css, /\.hy-sheet-backdrop \{[^}]*position: absolute[^}]*inset: 0/, '遮罩只覆盖工作台面板');
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hy-card-actions \.hy-card-link \{ display: none; \}/, '窄屏只隐藏外链图标');
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hy-card\.has-tool \.hy-card-copy \{ padding-right: 40px; \}/);
  assert.equal(/@media \(max-width: 620px\)[\s\S]*?\.hy-card-actions \{ display: none; \}/.test(css), false, '窄屏不能再整体隐藏卡片按钮，否则分组与移除不可用');
});
