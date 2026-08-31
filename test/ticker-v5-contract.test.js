const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ticker.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');

test('热榜六个设计页面映射真实控制器入口', () => {
  for (const page of ['compact', 'expanded', 'sources', 'keywords', 'detail-favorite', 'loading-error']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /setBusinessPage\?\.\('ticker', page\)/);
  assert.match(html, /js\/ticker\.js\?v=4/);
});

test('热榜主工作台和浮动设置面板管理可见语义与键盘焦点', () => {
  assert.match(source, /_openTickerModal/);
  assert.match(source, /_handleTickerModalKeydown/);
  assert.match(source, /setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /_modalBackgroundInert/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /panel\.setAttribute\('aria-hidden', 'false'\)/);
  assert.doesNotMatch(source, /panel\.addEventListener\('mouseleave', \(\) => \{\s*this\._kwPanelHideTimer/);
});

test('详情页把外部跳转保持为明确动作', () => {
  assert.match(source, /ticker-detail-open/);
  assert.match(source, /window\.open\(item\.url, '_blank', 'noopener'\)/);
  assert.match(source, /只有点击“打开原文”才会跳转/);
});

test('收藏和加载失败恢复均保留本地状态', () => {
  assert.match(source, /tickerFavorites/);
  assert.match(source, /已收藏条目和关键词规则仍保存在本地/);
  assert.match(css, /ticker-v5-detail/);
  assert.match(css, /ticker-v5-error/);
});

test('热榜展开页在窄屏把搜索框和关闭动作留在页头内', () => {
  assert.match(css, /\.ticker-expand-panel\{width:calc\(100vw - 16px\)\}/);
  assert.match(css, /\.ticker-expand-panel \.tep-header\{display:grid/);
  assert.match(css, /\.ticker-expand-panel \.tep-search input\{width:min\(92px,22vw\)/);
});
