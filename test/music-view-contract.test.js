const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const viewSource = fs.readFileSync(path.join(root, 'js/music-view.js'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'js/music-controller.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const v5StyleSource = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');

const requiredIds = [
    'mc-panel',
    'mc-strip',
    'mc-cover-img',
    'mc-title',
    'mc-sub',
    'mc-prev',
    'mc-play',
    'mc-next',
    'mc-close-panel',
    'mc-prg-input',
    'mc-tabs',
    'mc-search-tab',
    'mc-pane-queue',
    'mc-pane-playlists',
    'mc-pane-lyrics',
    'mc-pane-discover',
    'mc-pane-search',
    'mc-mode-cycle',
    'mc-mode-icon',
    'mc-mode-label',
    'mc-vol-toggle',
    'mc-sleep-toggle',
    'mc-more-toggle',
    'mc-disconnect',
];

test('音乐视图脚本先于控制器加载', () => {
    const viewIndex = indexSource.indexOf('js/music-view.js');
    const controllerIndex = indexSource.indexOf('js/music-controller.js');
    assert.ok(viewIndex >= 0, 'index.html 必须加载 music-view.js');
    assert.ok(controllerIndex > viewIndex, 'music-view.js 必须先于 music-controller.js 加载');
});

test('MusicView 保留控制器所需的稳定 DOM 契约', () => {
    assert.match(viewSource, /container\.id = 'music-island'/);
    for (const id of requiredIds) {
        const matches = viewSource.match(new RegExp(`id=["']${id}["']`, 'g')) || [];
        assert.equal(matches.length, 1, `${id} 应且只应出现一次`);
    }
});

test('播放器交互已收敛为单个模式按钮和独立搜索动作', () => {
    assert.doesNotMatch(viewSource, /class="mc-mode-btn"/);
    assert.match(viewSource, /id="mc-mode-cycle"/);
    assert.match(viewSource, /id="mc-search-tab"/);
    assert.doesNotMatch(viewSource, /data-mc-tab="search"/);
    assert.match(controllerSource, /_cyclePlayMode\(\)/);
});

test('关闭面板与断开连接是两个不同动作', () => {
    assert.match(viewSource, /id="mc-close-panel"[^>]+音乐继续播放/);
    assert.match(viewSource, /id="mc-disconnect"[^>]*>[\s\S]*断开网易云连接/);
    assert.match(controllerSource, /#mc-close-panel/);
    assert.match(controllerSource, /#mc-disconnect/);
});

test('私人 FM 不再复制正在播放的歌曲卡', () => {
    const renderStart = controllerSource.indexOf('_renderFMUI()');
    const renderEnd = controllerSource.indexOf('// ===================== 心动模式', renderStart);
    const renderSource = controllerSource.slice(renderStart, renderEnd);
    assert.doesNotMatch(renderSource, /mc-fm-card/);
    assert.doesNotMatch(renderSource, /mc-fm-title/);
    assert.match(renderSource, /mc-fm-reason/);
    assert.match(renderSource, />喜欢</);
    assert.match(renderSource, />不喜欢</);
    assert.match(renderSource, />下一首</);
});

test('非激活音乐页面不会残留在无障碍树或键盘焦点中', () => {
  assert.match(styleSource, /\.mc-pane\s*\{[^}]*visibility:\s*hidden[^}]*pointer-events:\s*none/s);
  assert.match(styleSource, /\.mc-pane\.active\s*\{[^}]*visibility:\s*visible[^}]*pointer-events:\s*auto/s);
  assert.ok(indexSource.includes('css/style.css?v=14'));
});

test('歌手专辑工作区具备模态背景、初始焦点、Esc 关闭与焦点恢复', () => {
  assert.match(controllerSource, /_setActionSheetBackgroundInert\(true\)/);
  assert.match(controllerSource, /child\.inert = true/);
  assert.match(controllerSource, /child\.inert = false/);
  assert.match(controllerSource, /#mc-as-close, \.mc-as-tab/);
  assert.match(controllerSource, /e\.key === 'Escape'[\s\S]*?_closeActionSheet\(\)/);
  assert.match(controllerSource, /_actionSheetReturnFocus\?\.focus\?\.\(\)/);
  assert.ok(indexSource.includes('js/music-controller.js?v=12'));
});

test('睡眠定时和更多操作使用可键盘操作的标准菜单语义', () => {
  assert.match(viewSource, /id="mc-sleep-toggle"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"[^>]+aria-controls="mc-sleep-menu"/);
  assert.match(viewSource, /id="mc-more-toggle"[^>]+aria-haspopup="menu"[^>]+aria-expanded="false"[^>]+aria-controls="mc-more-menu"/);
  assert.match(controllerSource, /menu\.setAttribute\('role', 'menu'\)/);
  assert.match(controllerSource, /role="menuitemradio" aria-checked=/);
  assert.match(controllerSource, /\.mc-sleep-active, \.mc-sleep-option/);
  assert.match(controllerSource, /ev\.key === 'ArrowDown'/);
  assert.match(controllerSource, /_closeSleepTimerMenu\(true\)/);
  assert.match(controllerSource, /_closeMoreMenu\(true\)/);
  assert.ok(indexSource.includes('js/music-view.js?v=6'));
});

test('连接异常在 v5 工作台中是可见、聚焦且会隔离背景的状态页', () => {
  assert.match(v5StyleSource, /\.music-workbench-v5 \.mc-meta-guide\s*\{[^}]*position:\s*absolute[^}]*place-items:\s*center/s);
  assert.match(v5StyleSource, /\.mc-meta-guide\[data-surface-error="true"\]\s*\{[^}]*inset:\s*64px 0 76px/s);
  assert.match(controllerSource, /guide\.setAttribute\('role', isErrorSurface \? 'alert' : 'status'\)/);
  assert.match(controllerSource, /_setMetaGuideBackgroundDisabled\(isErrorSurface\)/);
  assert.match(controllerSource, /el\.inert = active/);
  assert.match(controllerSource, /const safeInitialAction = guide\.querySelector\('#mc-guide-retry'\)/);
  assert.match(controllerSource, /\|\| guide\.querySelector\('#mc-guide-refetch'\)/);
  assert.match(controllerSource, /safeInitialAction\?\.focus\(\)/);
  assert.match(controllerSource, /guide\.dataset\.guideReason = reason/);
  assert.match(controllerSource, /automatic && \['no-cookie', 'api-error'\]\.includes\(guide\.dataset\.guideReason\)/);
  assert.match(controllerSource, /if \(this\.state\.title\) this\._hideMetaGuide\(true\)/);
  assert.ok(indexSource.includes('css/product-ui-v5.css?v=24'));
});
