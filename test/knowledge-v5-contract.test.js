const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('常用信息六个设计页面均绑定真实控制器状态', () => {
  const source = read('js/knowledge-wall.js');
  assert.ok(source.includes("setBusinessPage?.('knowledge', page)"));
  for (const page of ['card-wall', 'search-filter', 'detail-inspector', 'create-edit', 'timeline', 'graph-dashboard']) {
    assert.ok(source.includes(`'${page}'`), `missing knowledge/${page}`);
  }
});

test('详情检查器复用真实卡片内容、元数据和关联标签', () => {
  const source = read('js/knowledge-wall.js');
  assert.ok(source.includes('showDetail(cardId)'));
  assert.ok(source.includes('kw-detail-inspector'));
  assert.ok(source.includes('data-related-card'));
  assert.ok(source.includes('card.viewCount = (card.viewCount || 0) + 1'));
});

test('图谱仪表盘从真实卡片和共享标签计算节点关系', () => {
  const source = read('js/knowledge-wall.js');
  assert.ok(source.includes('_buildKnowledgeGraphHtml()'));
  assert.ok(source.includes('filter(tag => (positions[j].card.tags || []).includes(tag))'));
  assert.ok(source.includes('kw-v5-graph-node'));
});

test('编辑、详情和视图关闭后恢复知识库基础页', () => {
  const source = read('js/knowledge-wall.js');
  assert.ok(source.includes('_restoreProductPage()'));
  assert.ok(source.includes("this._setProductPage('create-edit')"));
  assert.ok(source.includes("this._setProductPage('detail-inspector')"));
});

test('常用信息主工作台具备模态隔离、初始焦点和焦点返回', () => {
  const source = read('js/knowledge-wall.js');
  const html = read('index.html');
  assert.match(source, /overlay\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /overlay\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /overlay\.inert = true/);
  assert.match(source, /_setBackgroundInert\(true\)/);
  assert.match(source, /const searchInput = document\.getElementById\('kw-search-input'\)/);
  assert.match(source, /searchInput\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /this\._returnFocus\?\.focus\?\.\(\)/);
  assert.match(source, /_trapFocus\(activeSurface, e\)/);
  assert.ok(html.includes('js/knowledge-wall.js?v=11'));
});

test('卡片、标签、时间线和相关推荐均可通过键盘操作', () => {
  const source = read('js/knowledge-wall.js');
  assert.match(source, /<button type="button" class="wc-title wc-open-detail"/);
  assert.match(source, /<button type="button" class="kw-tag-chip/);
  assert.match(source, /<button type="button" class="wc-tag-clickable/);
  assert.match(source, /const itemTag = item\.targetId \? 'button' : 'div'/);
  assert.match(source, /<button type="button" class="kw-db-reco-item"/);
});

test('详情与编辑器隔离主工作台并管理初始和返回焦点', () => {
  const source = read('js/knowledge-wall.js');
  assert.match(source, /_setKnowledgeMainInert\(true\)/);
  assert.match(source, /kw-detail-panel" role="dialog" aria-modal="true"/);
  assert.match(source, /kw-detail-back'\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /kw-editor-dialog" role="dialog" aria-modal="true"/);
  assert.match(source, /kw-ed-title'\)\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /this\._editorClose = closeEditor/);
  assert.match(source, /this\._detailClose = \(\) => close\(true\)/);
});

test('卡片总数在每次真实渲染后同步到页签徽标', () => {
  const source = read('js/knowledge-wall.js');
  assert.match(source, /const countBadge = document\.getElementById\('kw-cards-count'\)/);
  assert.match(source, /countBadge\.textContent = this\.cards\.length/);
});

test('小规模知识图谱使用横向或三角布局避免节点挤在中心', () => {
  const source = read('js/knowledge-wall.js');
  assert.match(source, /cards\.length === 2/);
  assert.match(source, /index === 0 \? 275 : 525/);
  assert.match(source, /cards\.length === 3/);
  assert.match(source, /const triangle = \[/);
});
