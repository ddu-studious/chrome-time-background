const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('v5 状态层先于产品外壳和音乐工作台加载', () => {
  const html = read('index.html');
  const stateIndex = html.indexOf('js/product-ui-v5.js?v=6');
  assert.ok(stateIndex >= 0);
  assert.ok(stateIndex < html.indexOf('js/music-view.js?v=6'));
  assert.ok(stateIndex < html.indexOf('js/product-shell-v5.js'));
  assert.ok(html.includes('css/product-ui-v5.css?v=52'));
});

test('首页浮岛按钮统一为毛玻璃材质', () => {
  const style = read('css/product-ui-v5.css');

  assert.match(style, /\.v5-focus-card \.v5-primary-btn,[\s\S]*?\.v5-home-player-action,[\s\S]*?\.v5-home-expand \{[\s\S]*?backdrop-filter: blur\(18px\) saturate\(150%\)/);
  assert.match(style, /background: linear-gradient\(145deg, rgba\(255, 255, 255, \.17\), rgba\(139, 108, 255, \.14\)\)/);
});

test('首页三张信息卡使用 3.5% 到 1.75% 的轻遮罩', () => {
  const style = read('css/product-ui-v5.css');

  assert.match(style, /\.v5-home-card \{[\s\S]*?background: linear-gradient\(135deg, rgba\(255, 255, 255, \.035\), rgba\(255, 255, 255, \.0175\)\)[\s\S]*?backdrop-filter: blur\(1px\) saturate\(110%\)[\s\S]*?text-shadow:/);
  assert.match(style, /\.v5-home-player:hover \{[^}]*background: linear-gradient\(135deg, rgba\(255, 255, 255, \.0325\), rgba\(255, 255, 255, \.0125\)\)/);
});

test('首页左侧浮岛使用安全展开区且右侧提醒形成统一信息胶囊', () => {
  const style = read('css/product-ui-v5.css');
  const shell = read('js/product-shell-v5.js');

  assert.match(style, /body\[data-v5-home-layout="island"\] \.v5-shell-home \{[\s\S]*?top: 50%;[\s\S]*?left: 24px;[\s\S]*?width: min\(330px,[\s\S]*?grid-template-columns: 1fr;[\s\S]*?translateY\(-50%\)/);
  assert.match(style, /body\[data-v5-home-layout="island"\] \.v5-shell-home\.is-expanded \{[\s\S]*?top: clamp\(76px, 14vh, 126px\);[\s\S]*?bottom: 82px;[\s\S]*?overflow-y: auto;/);
  assert.match(style, /body\[data-v5-home-layout="island"\] \.v5-shell-home\.is-expanded \.v5-home-expand \{[\s\S]*?position: sticky;[\s\S]*?order: -1;[\s\S]*?width: 100%;/);
  assert.match(style, /\.v5-shell-home\.is-expanded ~ \.v5-shell-toolbar \{[\s\S]*?opacity: 0;[\s\S]*?pointer-events: none;/);
  assert.match(style, /\.v5-right-floating-rail \{[\s\S]*?top: 50%;[\s\S]*?right: 18px;[\s\S]*?flex-direction: column;[\s\S]*?gap: 12px;/);
  assert.match(style, /\.v5-right-floating-rail::after[\s\S]*?right: calc\(var\(--v5-orb-size\) \/ 2 \+ var\(--v5-rail-orb-inset\)\);[\s\S]*?height: 18px;/);
  assert.match(style, /\.urgent-bubble \{[\s\S]*?position: relative;[\s\S]*?display: flex;[\s\S]*?width: min\(300px,/);
  assert.match(style, /\.urgent-bubble:not\(\.expanded\) \{[\s\S]*?border-radius: 22px;[\s\S]*?backdrop-filter: blur\(12px\)/);
  assert.match(style, /\.urgent-mini-bar \{[\s\S]*?position: relative;[\s\S]*?flex: 1 1 auto;[\s\S]*?background: transparent;/);
  assert.match(read('index.html'), /<button class="urgent-mini-bar"[\s\S]*?<button class="urgent-bubble-dot"/);
  assert.match(style, /--v5-orb-size: 40px/);
  assert.match(style, /\.urgent-bubble-dot::after[\s\S]*?radial-gradient/);
  assert.match(style, /\.urgent-bubble-dot:hover,[\s\S]*?scale\(1\.045\)/);
  assert.match(style, /\.today-overview-trigger \{ display: none !important; \}/);
  assert.match(style, /@media \(max-width: 720px\)[\s\S]*?\.v5-shell-toolbar \{ top: 200px; left: 10px; right: auto; flex-direction: column; \}/);
  assert.match(style, /\.v5-right-floating-rail \{ top: 132px; right: 12px; gap: 10px; transform: none; \}/);
  assert.ok(shell.includes('左侧浮岛'));
  assert.ok(shell.includes('三个功能纵向贴左，背景充分透出'));
});

test('极简模式隐藏新版首页模块并保留左侧操作栈定位', () => {
  const style = read('css/product-ui-v5.css');

  assert.match(style, /\.v5-shell-toolbar \{[\s\S]*?top: calc\(50% - 162px\);[\s\S]*?left: 22px;[\s\S]*?right: auto;/);
  assert.match(style, /body\.zen-mode :is\([\s\S]*?\.v5-shell-home,[\s\S]*?\.v5-shell-toolbar[\s\S]*?\) \{[\s\S]*?opacity: 0 !important;[\s\S]*?animation: zen-stagger-shrink \.62s cubic-bezier\(\.34, 1\.4, \.64, 1\)/);
  assert.match(style, /@keyframes zen-stagger-shrink \{[\s\S]*?58% \{ opacity: \.72; scale: \.86;[\s\S]*?100% \{ opacity: 0; scale: \.56; filter: blur\(3px\); \}/);
  assert.match(style, /body\.zen-mode \.v5-shell-home \{ --zen-stagger-delay: 40ms; \}/);
  assert.match(style, /body\.zen-mode \.v5-shell-toolbar \{ --zen-stagger-delay: 140ms; \}/);
  assert.match(style, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
});

test('共享视图状态严格限定 5 个外壳页面与 10 个音乐页面', () => {
  const source = read('js/product-ui-v5.js');
  const events = [];
  const document = {
    body: { dataset: {} },
    dispatchEvent(event) { events.push(event); },
  };
  class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  }
  const context = { window: {}, document, CustomEvent, console };
  vm.runInNewContext(source, context);
  const api = context.window.ProductUIV5;

  assert.deepEqual(Array.from(api.shellPages), ['home', 'today', 'personalize', 'focus', 'offline']);
  assert.deepEqual(Array.from(api.musicPages), [
    'now-playing', 'queue', 'playlist-library', 'playlist-detail',
    'lyrics-immersive', 'search', 'discover-fm', 'artist-album',
    'connection-error', 'more-sleep-timer'
  ]);
  api.setShellPage('focus');
  api.setMusicPage('queue');
  api.updatePlayer({ title: '失眠了', currentTime: 84, isPlaying: true });
  assert.equal(api.getState().shellPage, 'focus');
  assert.equal(api.getState().musicPage, 'queue');
  assert.equal(api.getState().player.title, '失眠了');
  assert.equal(api.getState().player.currentTime, 84);
  assert.equal(events.at(-1).type, 'product-ui-v5:state');

  api.setShellPage('unknown');
  api.setMusicPage('unknown');
  assert.equal(api.getState().shellPage, 'focus');
  assert.equal(api.getState().musicPage, 'queue');
  api.setMusicPage('lyrics');
  assert.equal(api.getState().musicPage, 'lyrics-immersive');
  assert.equal(api.normalizeMusicPage('playlists'), 'playlist-library');
  assert.equal(api.normalizeMusicPage('artist'), 'artist-album');
  assert.equal(api.setBusinessPage('schedule', 'conflict'), 'schedule/conflict');
  assert.equal(api.getState().activePageKey, 'schedule/conflict');
  assert.equal(document.body.dataset.productPage, 'schedule/conflict');
  assert.equal(api.setBusinessPage('bad space', 'nope'), null);
});

test('产品外壳完整实现首页、概览、个性化、专注与离线五页', () => {
  const shell = read('js/product-shell-v5.js');
  const today = read('js/today-overview.js');
  for (const id of ['v5-shell-home', 'v5-personalize-workspace', 'v5-offline-workspace', 'v5-focus-workspace', 'v5-focus-clock', 'v5-agenda-list', 'v5-home-player-title']) {
    assert.ok(shell.includes(id), `缺少外壳契约: ${id}`);
  }
  for (const action of ['data-shell-open="today"', 'data-shell-open="personalize"', 'data-shell-open="focus"', 'data-shell-open="offline"', 'data-focus-action="toggle"', 'data-focus-action="finish"']) {
    assert.ok(shell.includes(action), `缺少外壳动作: ${action}`);
  }
  assert.ok(today.includes('today-overview-summary'));
  assert.ok(today.includes('开始下一项'));
  assert.ok(today.includes("setShellPage?.('today')"));
  assert.ok(today.includes("setShellPage?.('home')"));
  assert.ok(shell.includes("setShellPage?.('personalize')"));
  assert.ok(shell.includes("setShellPage?.('offline')"));
  assert.ok(shell.includes("chrome.storage.local.set({ v5ShellPreferences"));
  assert.ok(shell.includes("window.addEventListener('offline'"));
  for (const mode of ['island', 'side', 'auto']) {
    assert.ok(shell.includes(`data-home-mode="${mode}"`), `缺少首页呈现模式: ${mode}`);
  }
  assert.ok(shell.includes('data-home-action="toggle-cards"'));
  assert.ok(shell.includes("homeMode: 'island'"));
});

test('v5 页面注册表与设计矩阵保持 19 个业务、121 个唯一页面', () => {
  const source = read('js/product-pages-v5.js');
  const context = { window: {}, console };
  vm.runInNewContext(source, context);
  const registry = context.window.ProductPagesV5;
  assert.equal(registry.totalBusinesses, 19);
  assert.equal(registry.totalPages, 121);
  assert.equal(new Set(registry.pages.map(page => page.key)).size, 121);
  assert.equal(registry.list('shell').length, 5);
  assert.equal(registry.list('music').length, 10);
  assert.equal(registry.list('tasks').length, 8);
  assert.equal(registry.list('youtube').length, 9);
  assert.equal(registry.get('settings/about-diagnostics').name, '关于与诊断');
  assert.equal(registry.get('shell/offline').name, '离线状态');
  assert.ok(read('index.html').includes('js/product-pages-v5.js?v=6'));
});

test('真实 Chrome R4 清单逐页覆盖 121 个页面且不把部分验收计为完成', () => {
  const source = read('js/product-pages-v5.js');
  const context = { window: {}, console };
  vm.runInNewContext(source, context);
  const registry = context.window.ProductPagesV5;
  const checklist = read('docs/design/product-ui-v5-r4-checklist.md');
  const rows = checklist.split('\n').filter(line => /^\| (?:✅|⬜) \|/.test(line));

  assert.equal(rows.length, 121);
  for (const page of registry.pages) {
    assert.equal(rows.filter(line => line.includes(`| \`${page.key}\` |`)).length, 1, `R4 清单缺少或重复页面: ${page.key}`);
  }
  assert.equal(rows.filter(line => line.includes('| R4 |')).length, 52);
  assert.equal(rows.filter(line => line.includes('| R4-partial |')).length, 1);
  assert.equal(rows.filter(line => line.startsWith('| ✅ |')).length, 52);
});

test('网易云工作台把现有真实功能映射为 10 个设计页面且复用唯一播放器控制器', () => {
  const view = read('js/music-view.js');
  const controller = read('js/music-controller.js');
  for (const page of ['now-playing', 'queue', 'playlists', 'search']) {
    assert.ok(view.includes(`data-mc-pane="${page}"`), `缺少音乐页面: ${page}`);
  }
  assert.ok(controller.includes("const pageName = isQueue ? 'queue' : 'playlist-detail'"));
  assert.ok(controller.includes("this._setMusicSurfacePage(pageName)"));
  for (const page of ['artist-album', 'connection-error', 'more-sleep-timer']) {
    assert.ok(controller.includes(`_setMusicSurfacePage('${page}')`), `缺少音乐状态映射: ${page}`);
  }
  assert.ok(controller.includes("normalizeMusicPage?.(pageName)"));
  assert.ok(controller.includes("_renderPlaylistDetail(pane, allSongs, playlistName, coverUrl, totalCount, false)"));
  assert.ok(controller.includes("_renderPlaylistDetail(pane, songs, '播放队列', '', songs.length, true)"));
  assert.equal((controller.match(/new MusicController\(\)/g) || []).length, 1);
  assert.ok(controller.includes('window.ProductUIV5?.updatePlayer?.'));
  assert.ok(controller.includes("this._switchTab('now-playing', true)"));
  assert.ok(controller.includes('if (!chrome.runtime?.onMessage?.addListener) return;'));
  assert.ok(controller.includes('if (data.title !== prevTitle) this._onSongChange(data.title, data.artist)'));
  assert.ok(controller.includes('if (this.state.title) this._hideMetaGuide(true)'));
  assert.ok(controller.includes('this._hideMetaGuide();'));
});

test('播放条和面板操作维持关闭、最小化、断开连接的语义边界', () => {
  const view = read('js/music-view.js');
  const controller = read('js/music-controller.js');
  assert.ok(view.includes('关闭播放器面板（音乐继续播放）'));
  assert.ok(view.includes('id="mc-minimize"'));
  assert.ok(view.includes('id="mc-disconnect"'));
  assert.ok(controller.includes("#mc-minimize"));
  assert.ok(controller.includes("#mc-disconnect"));
  assert.ok(controller.includes("classList.remove('mc-dock-open')"));
});

test('v5 样式提供共享令牌、页面容器和响应式断点', () => {
  const css = read('css/product-ui-v5.css');
  for (const token of ['--v5-surface', '--v5-border', '--v5-accent', '--v5-radius-lg', '--v5-shadow']) {
    assert.ok(css.includes(token), `缺少设计令牌: ${token}`);
  }
  for (const selector of ['.v5-shell-home', '.today-overview.v5-shell-page', '.v5-personalize-workspace', '.v5-offline-workspace', '.v5-focus-workspace', '.music-workbench-v5 .mc-panel-v5', '.mc-now-playing-page']) {
    assert.ok(css.includes(selector), `缺少 v5 样式: ${selector}`);
  }
  assert.ok(css.includes('@media (max-width: 720px)'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('body[data-v5-home-layout="island"]'));
  assert.ok(css.includes('body[data-v5-home-layout="side"]'));
  assert.ok(css.includes('body[data-v5-home-layout="auto"]'));
});
