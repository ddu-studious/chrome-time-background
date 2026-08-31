const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'test/fixtures/poetry-preview.html'), 'utf8');

test('诗词电台五个页面复用同一播放状态', () => {
  for (const page of ['mini-player', 'full-text', 'annotation', 'favorites', 'voice-settings']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /window\.PoetryRadioV5 = \{ state, toggleMini, showPage: renderWorkspace/);
  assert.match(html, /js\/main\.js\?v=10/);
});

test('注释缺少来源时显示明确空态而不编造解释', () => {
  assert.match(source, /本地诗词源暂未提供该句译文或词语注释/);
  assert.match(source, /不生成无来源解读/);
});

test('收藏与声音设置继续写入原有本地存储', () => {
  for (const key of ['poetry_favorites', 'poetry_line_favorites', 'poetry_index', 'poetry_mode', 'poetry_speed', 'poetry_pitch', 'poetry_voice', 'poetry_pause_style', 'poetry_background_sound', 'poetry_sleep_minutes']) {
    assert.match(source, new RegExp(key));
  }
  assert.match(css, /poetry-v5-panel/);
  assert.match(css, /poetry-v5-settings/);
});

test('单曲循环在自动续播时保持当前诗词', () => {
  assert.match(source, /if \(state\.mode === 'single' && autoAdvance\)/);
  assert.match(source, /renderCurrent\(\);\s*saveState\(\);\s*play\(\);\s*return;/);
});

test('诗词工作台提供 dialog、背景 inert、Tab 闭环与 Esc 分层返回', () => {
  assert.match(source, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /panel\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /setPoetryBackgroundInert\(true\)/);
  assert.match(source, /handlePoetryWorkspaceKeydown/);
  assert.match(source, /poetryWorkspacePage !== 'full-text'/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /insideLaunchpad/);
  assert.match(source, /aria-current="page"/);
  assert.match(css, /\.poetry-v5-panel :where\(button, select, input, \[tabindex\]\):focus-visible/);
});

test('迷你条正文与播放收藏状态均可由键盘和辅助技术操作', () => {
  assert.match(html, /class="pr-display" id="pr-open-workspace" type="button"/);
  assert.match(html, /id="pr-play"[^>]+aria-pressed="false"/);
  assert.match(html, /id="pr-fav"[^>]+aria-pressed="false"/);
  assert.match(source, /els\.playBtn\.setAttribute\('aria-pressed'/);
  assert.match(source, /els\.favBtn\.setAttribute\('aria-pressed'/);
  assert.match(source, /播放模式：/);
  assert.match(css, /width: calc\(100vw - 20px\); min-width: 0; box-sizing: border-box/);
});

test('全文页共享朗读进度、当前句和真实播放队列', () => {
  assert.match(html, /id="pr-progress-bar"/);
  assert.match(html, /id="pr-progress-text"/);
  assert.match(source, /currentLineIndex: 0/);
  assert.match(source, /class="poetry-v5-line-progress"/);
  assert.match(source, /data-poetry-line=/);
  assert.match(source, /data-poetry-index=/);
  assert.match(source, /class="poetry-v5-queue"/);
  assert.match(source, /onboundary/);
  assert.match(css, /\.poetry-v5-lines>button\.active/);
});

test('译注赏析和作者页对缺失来源保持明确空态', () => {
  assert.match(source, /poetryAnnotationTab = 'translation'/);
  assert.match(source, /role="tablist" aria-label="译注内容"/);
  assert.match(source, /不生成无来源解读/);
  assert.match(source, /本地数据未包含作者生平与作品出处/);
  assert.match(source, /原文可用 · 扩展内容缺失/);
});

test('整首收藏和诗句收藏使用独立本地状态', () => {
  assert.match(source, /lineFavorites: \[\]/);
  assert.match(source, /function poetryLineKey/);
  assert.match(source, /data-poetry-line-favorite=/);
  assert.match(source, /poetry_line_favorites: state\.lineFavorites/);
  assert.match(source, /aria-label="\$\{lineFavorite \? '取消收藏' : '收藏'\}诗句/);
});

test('收藏页提供搜索、朝代筛选和筛选结果计数', () => {
  assert.match(source, /id="poetry-favorites-search"/);
  assert.match(source, /data-poetry-dynasty=/);
  assert.match(source, /显示 \$\{filteredFavorites\.length\} \/ \$\{favorites\.length\} 首/);
  assert.match(source, /id="poetry-play-favorites"/);
  assert.match(css, /\.poetry-v5-fav-toolbar/);
});

test('朗读设置使用草稿、试听和显式应用边界', () => {
  assert.match(source, /poetrySettingsDraft/);
  assert.match(source, /修改只进入本页草稿/);
  assert.match(source, /试听不会写入设置/);
  assert.match(source, /id="poetry-settings-apply"/);
  assert.match(source, /state\.speed = draft\.speed/);
  assert.match(source, /saveState\(\);\s*schedulePoetrySleepTimer\(\);\s*announcePoetry\('朗读设置已应用'\)/);
  assert.match(css, /#poetry-settings-status\.dirty/);
});

test('朗读草稿覆盖停顿背景声和睡眠定时且应用后才持久化', () => {
  assert.match(source, /id="poetry-pause-select"/);
  assert.match(source, /id="poetry-background-select"/);
  assert.match(source, /id="poetry-sleep-select"/);
  assert.match(source, /startPoetryAmbient/);
  assert.match(source, /schedulePoetrySleepTimer/);
  assert.match(source, /state\.pauseStyle = draft\.pauseStyle/);
  assert.match(css, /\.poetry-v5-setting-selects/);
});

test('窄屏保留四个页面入口而不是隐藏导航', () => {
  assert.match(css, /@media\(max-width:800px\)[\s\S]*?\.poetry-v5-panel nav\{position:absolute;[\s\S]*?display:grid/);
  assert.match(css, /grid-template-columns:repeat\(4,1fr\)/);
  assert.match(css, /@media\(max-width:520px\)[\s\S]*?\.poetry-v5-panel\{inset:8px 8px 64px/);
});

test('诗词验收夹具离页恢复本地预览存储', () => {
  assert.match(fixture, /const storageKey = '__chrome_storage__'/);
  assert.match(fixture, /previousStorage/);
  assert.match(fixture, /beforeunload/);
});
