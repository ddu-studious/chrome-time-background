const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/cursor-bridge.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');

test('Agent 矩阵七个设计页面映射现有 Bridge 能力', () => {
  for (const page of ['overview', 'active', 'create', 'flow-canvas', 'run-logs', 'collaboration', 'connection-error']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /setBusinessPage\?\.\('agent', page\)/);
  assert.match(html, /js\/cursor-bridge\.js\?v=4/);
  assert.match(html, /css\/cursor-bridge\.css\?v=3/);
});

test('总览与运行中页面由真实 Agent 状态计算', () => {
  assert.match(source, /agent\.status === 'running' \|\| agent\.status === 'streaming'/);
  assert.match(source, /\? 'active' : 'overview'/);
});

test('创建、流程、日志和协作保留原有能力并接入产品工作台', () => {
  for (const marker of ['cb-create-modal', 'cb-wf-modal', 'cb-obs-panel', 'cb-collab-modal', 'cb-v6-workspace']) {
    assert.match(source, new RegExp(marker));
  }
});

test('七个页面共享同一条竞品研究周报运行主线', () => {
  for (const marker of ['竞品研究周报', 'RUN-0822', 'Researcher', 'Analyst', 'Writer', 'Reviewer', '本地工作区']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /_workspaceChrome/);
  assert.match(source, /showProductPage\(page\)/);
});

test('运行控制明确区分暂停、取消、失败步骤重试与整流重跑', () => {
  assert.match(source, /暂停运行/);
  assert.match(source, /取消与暂停是独立操作/);
  assert.match(source, /仅重试 compare_evidence 步骤/);
  assert.match(source, /重新运行整条工作流/);
});

test('人工确认是正常协作节点并保留最小权限边界', () => {
  assert.match(source, /审批是正常协作节点，不等同于错误或失败/);
  assert.match(source, /只读 · 本次运行/);
  assert.match(source, /等待你的确认/);
  assert.match(source, /已批准只读访问/);
});

test('断线页面声明运行记录与本地产物保留并提供恢复入口', () => {
  assert.match(source, /Bridge 连接中断/);
  assert.match(source, /连接中断不会清空进度/);
  assert.match(source, /重新连接/);
  assert.match(source, /查看离线日志/);
});

test('创建 Agent 覆盖模板、目标、模型工具、权限和测试五个步骤', () => {
  for (const marker of ['选择模板', '角色与目标', '模型与工具', '权限范围', '测试并创建']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /_runProductAgentTest/);
});

test('Agent 主面板与二级工作台具备模态隔离和焦点闭环', () => {
  assert.match(source, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /panel\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(source, /this\._setBackgroundInert\(true\)/);
  assert.match(source, /_handlePanelKeydown\(event\)/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /#cb-create-modal\.open/);
  assert.match(source, /#cb-collab-modal\.open/);
  assert.match(source, /#cb-wf-modal/);
  assert.match(source, /this\._panelReturnFocus/);
});

test('Agent 窄屏覆盖旧版产品层间距且主操作保持在视口内', () => {
  assert.match(css, /@media\(max-width:520px\)\{\s*\.cb-panel\{padding:18px 10px 26px\}/);
  assert.match(fs.readFileSync(path.join(root, 'css/cursor-bridge.css'), 'utf8'), /\.cb-v6-section-title > button \{ margin-left:auto; max-width:46%/);
});
