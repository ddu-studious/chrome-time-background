const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ticker.js'), 'utf8');

test('数据源面板提供搜索、批量操作和选择汇总', () => {
  for (const contract of [
    'tsp-source-search',
    'tsp-select-all',
    'tsp-clear-all',
    'tsp-selection-summary',
    'tsp-empty',
  ]) {
    assert.ok(source.includes(contract), `缺少数据源面板契约: ${contract}`);
  }
});

test('数据源面板由关闭、点击外部或 Esc 控制，不再因鼠标移出自动关闭', () => {
  const panelEvents = source.slice(source.indexOf('_bindSourcesPanelEvents(panel)'), source.indexOf('_updateCategoryCheckbox(categoryEl)'));
  assert.ok(panelEvents.includes("e.key === 'Escape'"));
  assert.ok(panelEvents.includes("#tsp-close-btn"));
  assert.ok(!panelEvents.includes("panel.addEventListener('mouseleave'"));
});

test('来源数量同时更新页头与页脚摘要', () => {
  const updateBlock = source.slice(source.indexOf('\n    _updateSourcesCount()'), source.indexOf('\n    _syncSourcesPanelCheckboxes()'));
  assert.ok(updateBlock.includes('tsp-count'));
  assert.ok(updateBlock.includes('tsp-selection-summary'));
});
