const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('工作记录面板拆分为记录、日志、洞察三个区域', () => {
  const source = read('js/worklog.js');
  assert.ok(source.includes('class="wl-workbench-grid"'));
  assert.ok(source.includes('class="wl-capture-pane"'));
  assert.ok(source.includes('class="wl-log-pane"'));
  assert.ok(source.includes('class="wl-insight-pane"'));
});

test('洞察区复用每日汇总而不新增数据模型', () => {
  const source = read('js/worklog.js');
  assert.ok(source.includes('Object.entries(summary.byProject)'));
  assert.ok(source.includes('${this._formatDuration(summary.totalMinutes)}'));
  assert.ok(source.includes('${progress.percentage}%'));
  assert.ok(source.includes("querySelectorAll('.wl-insight-metrics strong')"));
  assert.ok(source.includes("querySelector('.wl-insight-project-list')"));
});

test('工作记录工作台在中小窗口逐级降为双栏和单栏', () => {
  const css = read('css/product-ui-v4.css');
  assert.match(css, /\.wl-workbench-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(260px, \.78fr\)/);
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.wl-workbench-grid/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?\.wl-workbench-grid\s*\{\s*display:\s*block/);
});

test('工作日志六个设计页面均绑定真实控制器状态', () => {
  const source = read('js/worklog.js');
  assert.ok(source.includes("setBusinessPage?.('worklog', page)"));
  for (const page of ['daily-list', 'active-timer', 'manual-entry', 'quadrant', 'weekly-report', 'projects']) {
    assert.ok(source.includes(`'${page}'`), `missing worklog/${page}`);
  }
  assert.ok(source.includes("this._setProductPage('active-timer')"));
  assert.ok(source.includes("this._setProductPage('manual-entry')"));
  assert.ok(source.includes("this._setProductPage('weekly-report')"));
  assert.ok(source.includes("this._setProductPage('projects')"));
});

test('计时、表单和二级页面关闭后恢复到日志基础页', () => {
  const source = read('js/worklog.js');
  assert.ok(source.includes('_baseProductPage()'));
  assert.ok(source.includes("return this._viewMode === 'quadrant' ? 'quadrant' : 'daily-list'"));
  assert.ok((source.match(/this\._restoreProductPage\(\)/g) || []).length >= 7);
});

test('工作日志主面板与二级页面提供模态焦点闭环', () => {
  const source = read('js/worklog.js');
  assert.ok(source.includes("panel.setAttribute('role', 'dialog')"));
  assert.ok(source.includes("panel.setAttribute('aria-modal', 'true')"));
  assert.ok(source.includes("panel.setAttribute('aria-labelledby', 'worklog-panel-title')"));
  assert.ok(source.includes('_setBackgroundInert(true)'));
  assert.ok(source.includes('_trapFocus(this._activeFocusSurface(), e)'));
  assert.ok(source.includes('const visibleDockBtn = dockBtn?.getClientRects?.().length ? dockBtn : null'));
  assert.ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="wl-manual-title"'));
  assert.ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="wl-week-title"'));
  assert.ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="wl-project-title"'));
  assert.ok(source.includes('this._panelEventsAbort = new AbortController()'));
});
