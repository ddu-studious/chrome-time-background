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
  assert.ok(html.includes('css/product-ui-v5.css?v=36'));
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
