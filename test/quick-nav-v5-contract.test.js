const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('快捷导航四个设计页面均绑定真实导航数据', () => {
  const source = read('js/quick-nav.js');
  assert.ok(source.includes("setBusinessPage?.('quick-nav', page)"));
  for (const page of ['default', 'command-search', 'create-edit', 'import-empty']) {
    assert.ok(source.includes(`'${page}'`), `missing quick-nav/${page}`);
  }
  assert.ok(source.includes("localStorage.setItem(STORAGE_KEY, JSON.stringify(this.links))"));
});

test('快捷导航支持新建、编辑、导入和空库恢复入口', () => {
  const source = read('js/quick-nav.js');
  for (const marker of ['quick-nav-item-edit', 'quick-nav-import-form', 'quick-nav-empty-add', 'quick-nav-empty-import']) {
    assert.ok(source.includes(marker), `missing ${marker}`);
  }
  assert.ok(source.includes('_showAddForm(linkId = null)'));
  assert.ok(source.includes('_importLinks()'));
  assert.ok(source.includes('JSON.parse'));
  assert.match(source, /const rawUrl = item\.url\.trim\(\)/);
  assert.match(source, /existing\.add\(key\)/);
  assert.match(source, /_normalizeHttpUrl\(rawUrl\)/);
});

test('快捷导航实例可用于浏览器交互验收', () => {
  const source = read('js/quick-nav.js');
  assert.ok(source.includes('window.quickNavManager = new QuickNavManager()'));
});

test('快捷导航关闭态不会残留在无障碍树或键盘焦点中', () => {
  const source = read('js/quick-nav.js');
  const css = read('css/style.css');
  const html = read('index.html');
  assert.match(css, /\.quick-nav-panel\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.quick-nav-panel\.open\s*\{[\s\S]*?visibility:\s*visible/);
  assert.match(html, /css\/style\.css\?v=14/);
  assert.match(source, /aria-labelledby="quick-nav-dialog-title"/);
  assert.match(source, /setAttribute\('aria-hidden', 'false'\)/);
  assert.match(source, /_setBackgroundInert\(true\)/);
  assert.match(source, /_trapFocus\(this\._activeFocusSurface\(\), e\)/);
  assert.match(source, /this\._returnFocus = document\.activeElement/);
  assert.match(source, /class="quick-nav-item-open"/);
  assert.doesNotMatch(source, /<a class="quick-nav-item"[\s\S]*?<button class="quick-nav-item-edit"/);
  assert.match(source, /getElementById\('quick-nav-dock-btn'\)/);
  assert.match(source, /document\.getElementById\('dock-launchpad-btn'\)/);
  assert.match(html, /js\/quick-nav\.js\?v=13/);
});

test('快捷导航二级页独占内容区并精确恢复触发焦点', () => {
  const source = read('js/quick-nav.js');
  const css = read('css/style.css');
  assert.match(source, /quick-nav-subview-open/);
  assert.match(source, /_restoreSubviewFocus/);
  assert.match(source, /restoreFocus: true/);
  assert.match(source, /aria-controls="quick-nav-import-form"/);
  assert.match(source, /aria-controls="quick-nav-add-form"/);
  assert.match(css, /\.quick-nav-content\.quick-nav-subview-open \.quick-nav-grid \{ display: none; \}/);
});

test('快捷导航 Chrome 验收夹具明确样例边界并恢复本地预览存储', () => {
  const fixture = read('test/fixtures/quick-nav-preview.html');
  assert.match(fixture, /6 个明确网址/);
  assert.match(fixture, /不会打开外链/);
  assert.match(fixture, /emptyMode/);
  assert.match(fixture, /空库模式/);
  assert.match(fixture, /beforeunload/);
  assert.match(fixture, /js\/quick-nav\.js\?v=13/);
});

test('快捷导航校验输入并限制导入字段进入安全的 URL、图标和颜色范围', () => {
  const source = read('js/quick-nav.js');
  assert.match(source, /aria-label="搜索快捷方式或输入网址"/);
  assert.match(source, /const safeFilter = this\._escapeHtml\(filter\)/);
  assert.match(source, /请输入有效的 HTTP 或 HTTPS 网址/);
  assert.match(source, /_safeIcon\(item\.icon\)/);
  assert.match(source, /_safeColor\(item\.color/);
  assert.match(source, /_claimId\(item\.id, fallbackId, usedIds\)/);
  assert.match(source, /\^#\[0-9a-f\]\{3,8\}\$/i);
});

test('快捷导航删除后提供可聚焦的撤销反馈', () => {
  const source = read('js/quick-nav.js');
  const css = read('css/style.css');
  assert.match(source, /class="quick-nav-toast-undo"/);
  assert.match(source, /_undoRemove\(\)/);
  assert.match(source, /已移除“\$\{this\._pendingRemoval\.link\.name\}”/);
  assert.match(source, /quick-nav-toast-undo'\)\?\.focus\(\)/);
  assert.match(css, /\.quick-nav-toast\s*\{/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
