const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('独立任务页同时提供页头和空状态新建入口', () => {
  const html = read('tasks.html');
  assert.equal((html.match(/id="task-create-btn"/g) || []).length, 1);
  assert.equal((html.match(/id="task-empty-create"/g) || []).length, 1);
  assert.ok(html.includes('集中查看、筛选与推进所有事项'));
});

test('任务工作台提供列表、看板、日历、分析和周期习惯五个主视图', () => {
  const html = read('tasks.html');
  for (const [view, label] of [['list', '列表'], ['kanban', '看板'], ['calendar', '日历'], ['analytics', '分析'], ['recurring-habits', '周期与习惯']]) {
    assert.match(html, new RegExp(`data-task-view="${view}"[\\s\\S]*?<span>${label}<\\/span>`));
    assert.ok(html.includes(`data-task-panel="${view}"`));
  }
});

test('新建任务在当前工作台完成并写回真实任务存储', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.ok(html.includes('id="task-create-form"'));
  assert.ok(html.includes('id="task-create-recurrence"'));
  assert.ok(tasks.includes("this._setProductPage('create')"));
  assert.ok(tasks.includes('async createTask(event)'));
  assert.ok(tasks.includes('await this.saveData()'));
});

test('任务八个设计页面均绑定 v5 页面状态与真实渲染入口', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.ok(html.includes('js/product-pages-v5.js?v=6'));
  assert.ok(html.includes('js/product-ui-v5.js?v=6'));
  assert.ok(tasks.includes("setBusinessPage?.('tasks', page)"));
  for (const method of ['renderKanban()', 'renderCalendar()', 'renderAnalytics()', 'renderRecurring()', 'openDetail(taskId)', 'openCreateTask(recurring = false)']) {
    assert.ok(tasks.includes(method), `missing ${method}`);
  }
  assert.ok(tasks.includes("this._setProductPage('search-empty')"));
  assert.ok(tasks.includes("emptyState.classList.toggle('hidden', !searching && this.currentView !== 'list')"));
});

test('任务详情和新建弹层提供焦点陷阱、背景 inert 与关闭后焦点返回', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(html, /id="detail-panel"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="detail-title"/);
  assert.match(html, /id="task-create-sheet"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.ok(tasks.includes('this._setBackgroundInert(true, [panel, overlay])'));
  assert.ok(tasks.includes('this._setBackgroundInert(true, [sheet, overlay])'));
  assert.ok(tasks.includes('this._trapFocus(surface, e)'));
  assert.ok(tasks.includes('this._detailReturnFocus'));
  assert.ok(tasks.includes('this._createReturnFocus'));
  assert.ok(tasks.includes('data-kanban-detail'));
  assert.ok(tasks.includes('data-recurring-detail'));
  assert.ok(tasks.includes('item.count ? Math.max(8, item.count / maxDaily * 100) : 0'));
});

test('任务表格状态和筛选器可以由键盘与辅助技术操作', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(html, /id="filter-status"[^>]*aria-label="按状态筛选"/);
  assert.match(html, /id="filter-priority"[^>]*aria-label="按优先级筛选"/);
  assert.match(html, /id="sort-select"[^>]*aria-label="任务排序方式"/);
  assert.match(html, /id="page-size"[^>]*aria-label="每页任务数量"/);
  assert.match(tasks, /<button type="button" class="status-icon/);
  assert.match(tasks, /aria-label="查看任务详情：/);
  assert.match(html, /js\/tasks\.js\?v=11/);
});

test('分类管理是可见模态工作流并提供完整键盘与辅助技术语义', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  const css = read('css/tasks-v5.css');
  assert.match(html, /css\/tasks-v5\.css\?v=5/);
  assert.match(html, /css\/tasks\.css\?v=2/);
  assert.ok(tasks.includes("popup.setAttribute('role', 'dialog')"));
  assert.ok(tasks.includes("popup.setAttribute('aria-modal', 'true')"));
  assert.ok(tasks.includes('this._setBackgroundInert(true, [popup])'));
  assert.ok(tasks.includes("categoryManager?.classList.contains('active')"));
  assert.ok(tasks.includes('this._closeCategoryManager()'));
  assert.ok(tasks.includes('focusWithoutOpening'));
  assert.ok(tasks.includes("return categoryManager.querySelector('.task-catmgr-panel')"));
  assert.match(tasks, /aria-label="关闭分类管理"/);
  assert.match(tasks, /aria-label="创建一级分类"/);
  assert.match(tasks, /aria-label="重命名分类：/);
  assert.match(tasks, /aria-label="删除子分类：/);
  assert.match(tasks, /aria-label="按分类筛选"/);
  assert.match(css, /\.task-catmgr-overlay\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(css, /\.task-catmgr-panel\s*\{[\s\S]*?width:\s*min\(560px/);
  assert.match(css, /\.task-catmgr-overlay\.active/);
});

test('任务状态统一包含待处理进行中等待已完成逾期且完成后可撤销', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  for (const state of ['待处理', '进行中', '等待', '已完成', '已逾期']) assert.match(tasks, new RegExp(state));
  assert.match(tasks, /_recentlyCompletedIds/);
  assert.match(tasks, /showUndo\(`已完成/);
  assert.match(html, /id="task-action-toast"[^>]*role="status"/);
  assert.match(html, /id="task-action-undo"/);
});

test('删除归档完成是独立动作且归档支持单项批量和空态入口', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(tasks, /async archiveTask\(taskId\)/);
  assert.match(tasks, /async batchArchive\(\)/);
  assert.match(tasks, /async deleteTask\(taskId\)/);
  assert.match(tasks, /async toggleTaskStatus\(taskId\)/);
  assert.match(html, /id="batch-archive"/);
  assert.match(html, /id="task-empty-archived"/);
});

test('列表分组负责人看板移动与日历无日期区共享同一任务状态', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(tasks, /label: '今天'/);
  assert.match(tasks, /label: '即将到期'/);
  assert.match(tasks, /class="task-assignee"/);
  assert.match(tasks, /data-kanban-move=/);
  assert.match(tasks, /moveTaskToStatus/);
  assert.match(tasks, /limit: 3/);
  assert.match(tasks, /over-limit/);
  assert.match(html, /id="calendar-unscheduled"/);
  assert.match(tasks, /未安排日期/);
  assert.match(tasks, /load-\$\{load\}/);
});

test('主备忘录页保留任务工作台新增状态且各完成入口均支持撤销', () => {
  const memo = read('js/memo.js');
  const tasks = read('js/tasks.js');
  for (const field of ['archived', 'archivedAt', 'recurrencePaused', 'lastSkippedAt', 'assignee']) {
    assert.match(memo, new RegExp(`${field}:`));
  }
  assert.match(tasks, /newlyCompleted/);
  assert.match(tasks, /const snapshots = \[\]/);
  assert.match(tasks, /已完成 \$\{snapshots\.length\} 个任务/);
});

test('新建编辑支持快速保存高级默认附件校验与详情关联活动', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(html, /class="task-create-stage"/);
  assert.match(html, /id="task-create-images"[^>]*multiple/);
  assert.match(html, /id="task-create-subtask"/);
  assert.match(tasks, /openEditTask\(taskId\)/);
  assert.match(tasks, /截止日期不能早于开始日期/);
  assert.match(tasks, /class="detail-related-grid"/);
  assert.match(tasks, /data-detail-edit=/);
});

test('统计覆盖准时率项目投入逾期原因且周期任务可暂停跳过', () => {
  const tasks = read('js/tasks.js');
  assert.match(tasks, /onTimeRate/);
  assert.match(tasks, /项目投入/);
  assert.match(tasks, /逾期与阻塞原因/);
  assert.match(tasks, /data-recurring-pause=/);
  assert.match(tasks, /data-recurring-skip=/);
  assert.match(tasks, /下次实例/);
});

test('搜索空态展示查询筛选拼写建议清除与已归档入口', () => {
  const html = read('tasks.html');
  const tasks = read('js/tasks.js');
  assert.match(html, /id="task-empty-context"/);
  assert.match(html, /id="task-empty-clear"/);
  assert.match(tasks, /检查拼写/);
  assert.match(tasks, /已用条件/);
  assert.match(tasks, /clearAllFilters/);
});

test('任务 Chrome 验收夹具明确标注样例且复用真实任务页', () => {
  const fixture = read('test/fixtures/tasks-preview.html');
  assert.match(fixture, /6 条明确任务/);
  assert.match(fixture, /不会写入 Chrome 扩展数据/);
  assert.match(fixture, /\.\.\/\.\.\/tasks\.html\?fixtureRev=/);
  assert.match(fixture, /new URLSearchParams\(location\.search\)\.get\('width'\)/);
  assert.match(fixture, /beforeunload/);
});
