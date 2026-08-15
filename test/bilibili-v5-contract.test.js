const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

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
  assert.ok(index.includes('js/bilibili-controller.js?v=10'));
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
