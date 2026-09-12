const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
function setup() {
  const context = { window: {}, document: { body: { dataset: {} }, dispatchEvent() {}, readyState: 'loading', addEventListener() {} }, CustomEvent: class {}, console };
  vm.createContext(context);
  vm.runInContext(read('product-ui-v5.js'), context);
  return context;
}

test('缓存播放标志不能证明正在播放，实时暂停及清空不能被旧缓存覆盖', () => {
  const { window } = setup();
  const ui = window.ProductUIV5;
  const cache = { title: '旧歌', isPlaying: true, savedAt: Date.now() };
  assert.equal(ui.getDisplayPlayer(cache).isPlaying, false);
  ui.updatePlayer({ title: '新歌', isPlaying: true });
  assert.equal(ui.getDisplayPlayer(cache).title, '新歌');
  ui.updatePlayer({ isPlaying: false });
  assert.equal(ui.getDisplayPlayer(cache).isPlaying, false);
  ui.updatePlayer({ title: '', artist: '', cover: '' });
  assert.equal(ui.getDisplayPlayer(cache).title, '');
});

test('异步存储读取期间切歌，首页和今日概览都采用最新实时歌曲', async () => {
  const context = setup();
  let resolveRead;
  context.chrome = { storage: { local: { get: () => new Promise(resolve => { resolveRead = resolve; }) } } };
  vm.runInContext(read('product-shell-v5.js').replace('const shell = new ProductShellV5();', 'window.TestShell = ProductShellV5; const shell = new ProductShellV5();'), context);
  vm.runInContext(read('today-overview.js'), context);
  const nodes = new Map();
  const panel = { querySelector(key) { if (!nodes.has(key)) nodes.set(key, {}); return nodes.get(key); } };
  const shell = new context.window.TestShell();
  shell.home = panel; shell.focus = panel;
  let displayed;
  shell._renderMusic = player => { displayed = player; };
  const pending = shell.refresh();
  context.window.ProductUIV5.updatePlayer({ title: '新歌', artist: '歌手', isPlaying: false });
  resolveRead({ lastMusicState: { title: '旧歌', isPlaying: true, savedAt: Date.now() } });
  await pending;
  assert.equal(displayed.title, '新歌');
  assert.equal(displayed.isPlaying, false);
  const overview = context.window.todayOverview;
  overview.panel = panel;
  const pendingOverview = overview.refresh();
  context.window.ProductUIV5.updatePlayer({ title: '再下一首', isPlaying: true });
  resolveRead({ lastMusicState: { title: '旧歌', isPlaying: true, savedAt: Date.now() } });
  await pendingOverview;
  assert.match(nodes.get('#today-overview-body').innerHTML, /再下一首/);
  assert.doesNotMatch(nodes.get('#today-overview-body').innerHTML, /旧歌/);
});

test('第一次收到空播放器也通知订阅者，清除首页曾显示的缓存歌曲', () => {
  const { window } = setup();
  let notifications = 0;
  window.ProductUIV5.subscribe((state, reason) => { if (reason === 'player') notifications++; });
  window.ProductUIV5.updatePlayer({ title: '', isPlaying: false });
  assert.equal(notifications, 1);
  assert.equal(window.ProductUIV5.getDisplayPlayer({ title: '旧歌', savedAt: Date.now() }).title, '');
});
