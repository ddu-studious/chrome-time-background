const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('计划日视图使用主计划与侧栏摘要的双栏工作台', () => {
  const source = read('js/schedule.js');
  assert.ok(source.includes('class="sch-day-layout"'));
  assert.ok(source.includes('class="sch-day-main"'));
  assert.ok(source.includes('class="sch-day-aside"'));
  assert.ok(source.includes('class="sch-summary-card"'));
});

test('计划完成率在摘要圆环和底部进度中保持同一来源', () => {
  const source = read('js/schedule.js');
  assert.match(source, /const completionPercent = summary\.totalItems > 0/);
  assert.ok(source.includes('--sch-progress:${completionPercent * 3.6}deg'));
  assert.ok(source.includes('style="width:${completionPercent}%"'));
});

test('计划工作台在窄窗口回落为单栏', () => {
  const css = read('css/product-ui-v4.css');
  assert.match(css, /\.sch-day-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.55fr\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.sch-day-layout\s*\{\s*grid-template-columns:\s*1fr/);
});

test('计划管理六个设计页面都绑定真实业务状态', () => {
  const source = read('js/schedule.js');
  for (const page of ['day-view', 'week-view', 'create-edit', 'routines', 'conflict', 'completed-day']) {
    assert.ok(source.includes(`'${page}'`), `缺少计划页面状态: ${page}`);
  }
  assert.ok(source.includes("setBusinessPage?.('schedule', pageId)"));
  assert.ok(source.includes("setAttribute('data-schedule-page', pageId)"));
});

test('计划创建遇到重叠时进入冲突页并提供建议、返回和强制保存', () => {
  const source = read('js/schedule.js');
  assert.ok(source.includes('_findPlanConflicts(data, isEdit ? editPlan.id : null)'));
  assert.ok(source.includes('_showConflictResolution(overlay, data, conflicts, commit)'));
  assert.ok(source.includes('data-conflict-action="suggest"'));
  assert.ok(source.includes('data-conflict-action="back"'));
  assert.ok(source.includes('data-conflict-action="force"'));
});

test('全部完成的日期提供可持久化的一句话复盘', () => {
  const source = read('js/schedule.js');
  assert.ok(source.includes('class="sch-completed-day"'));
  assert.ok(source.includes('id="sch-daily-reflection"'));
  assert.ok(source.includes('scheduleDailyReflections'));
  assert.ok(source.includes("action === 'save-reflection'"));
  const css = read('css/product-ui-v5.css');
  assert.ok(css.includes('.sch-completed-day'));
  assert.ok(css.includes('.sch-conflict-dialog'));
});

test('计划主面板和二级表单提供完整的模态焦点语义', () => {
  const source = read('js/schedule.js');
  assert.ok(source.includes("panel.setAttribute('role', 'dialog')"));
  assert.ok(source.includes("panel.setAttribute('aria-modal', 'true')"));
  assert.ok(source.includes("panel.setAttribute('aria-labelledby', 'schedule-panel-title')"));
  assert.ok(source.includes('_setBackgroundInert(true)'));
  assert.ok(source.includes('_trapFocus(this._activeFocusSurface(), e)'));
  assert.ok(source.includes('formReturnFocus?.isConnected'));
  assert.ok(source.includes("const insideLaunchpad = this._returnFocus?.closest?.('#dock-launchpad')"));
  assert.ok(source.includes('const focusableReturn = this._returnFocus?.matches?.'));
  assert.ok(source.includes('const visibleDockBtn = dockBtn?.getClientRects?.().length ? dockBtn : null'));
  assert.ok(source.includes("document.getElementById('dock-launchpad-btn')"));
  assert.ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="sch-plan-form-title"'));
  assert.ok(source.includes('role="dialog" aria-modal="true" aria-labelledby="sch-routine-manager-title"'));
  const closeStart = source.indexOf('closePanel() {');
  const closeSource = source.slice(closeStart, source.indexOf('\n    _switchView(', closeStart));
  assert.ok(!closeSource.includes("this._panelEl.setAttribute('aria-hidden', 'true')"));
  assert.ok(closeSource.includes('if (!this._panelOpen) returnTarget?.focus?.({ preventScroll: true })'));
  assert.ok(closeSource.indexOf("setShellPage?.('home')") < closeSource.indexOf('returnTarget?.focus?.'));
});

test('计划面板刷新时会撤销旧事件，避免一次操作被重复处理', () => {
  const source = read('js/schedule.js');
  assert.ok(source.includes('this._panelEventsAbort?.abort()'));
  assert.ok(source.includes('this._panelEventsAbort = new AbortController()'));
  assert.ok(source.includes('const eventOptions = { signal: this._panelEventsAbort.signal }'));
  assert.ok(source.includes('const focusKey = active && this._panelEl.contains(active)'));
  assert.ok(source.includes('focusTarget?.focus?.({ preventScroll: true })'));
});
