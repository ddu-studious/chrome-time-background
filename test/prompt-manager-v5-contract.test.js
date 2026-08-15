const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/prompt-manager.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'test/fixtures/prompt-manager-preview.html'), 'utf8');

test('Prompt 管理六个设计页面绑定同一角色编辑器', () => {
  for (const page of ['role-editor', 'live-preview', 'version-diff', 'save-version', 'import-export', 'offline-error']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /setBusinessPage\?\.\('prompt-manager', page\)/);
  assert.match(html, /js\/prompt-manager\.js\?v=7/);
});

test('Prompt 管理主面板和二级页面提供模态焦点闭环', () => {
  assert.match(source, /panelEl\.setAttribute\('role', 'dialog'\)/);
  assert.match(source, /setBackgroundInert\(true\)/);
  assert.match(source, /handleKeydown/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /activeFocusSurface/);
  assert.match(source, /closeV5Modal/);
  assert.match(source, /closePreviewModal/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /aria-label="对比版本/);
  assert.match(html, /css\/prompt-manager\.css\?v=3/);
});

test('六页共享产品体验评审官版本与变量合同', () => {
  assert.match(source, /产品体验评审官/);
  assert.match(source, /v2\.4\.0-draft/);
  assert.match(source, /v2\.3\.0/);
  for (const variable of ['product_name', 'target_user', 'evidence']) assert.match(source, new RegExp(variable));
  assert.match(source, /保存草稿/);
  assert.match(source, /草稿已本地保存 · 未发布/);
  assert.match(source, /if \(!roles\.some\(role => role\.id === REVIEW_ROLE_ID\)\) roles\.unshift\(createReviewerRole\(\)\)/);
});

test('实时预览包括测试输入编译结果模型输出 Token 与测试记录', () => {
  assert.match(source, /实时编译测试/);
  assert.match(source, /测试输入/);
  assert.match(source, /渲染后的 System Prompt/);
  assert.match(source, /模型输出预览/);
  assert.match(source, /运行测试/);
  assert.match(source, /tokens/);
  assert.match(source, /最近测试/);
});

test('版本差异支持作者时间影响范围与恢复预览且先备份草稿', () => {
  assert.match(source, /版本差异/);
  assert.match(source, /影响：AI 对话、评审任务/);
  assert.match(source, /恢复预览/);
  assert.match(source, /previewRestoreVersion/);
  assert.match(source, /BACKUP_STORAGE_KEY/);
  assert.match(source, /原草稿已备份/);
});

test('发布页区分版本兼容性范围校验与确认', () => {
  assert.match(source, /保存并发布/);
  assert.match(source, /发布范围/);
  assert.match(source, /兼容性/);
  assert.match(source, /结构字段 7\/7/);
  assert.match(source, /pm-v5-release-confirm/);
  assert.match(source, /releaseScope/);
});

test('导入导出包含字段映射冲突策略脱敏和格式选择', () => {
  assert.match(source, /字段映射/);
  assert.match(source, /冲突策略/);
  assert.match(source, /自动脱敏密钥和真实用户数据/);
  assert.match(source, /JSON Schema 2\.1/);
  assert.match(source, /sanitizeImportedSkill/);
  assert.match(source, /REDACTED_API_KEY/);
});

test('离线恢复同时保留本地远端副本并拒绝离线伪合并', () => {
  assert.match(source, /本地草稿/);
  assert.match(source, /远端发布/);
  assert.match(source, /双副本保留/);
  assert.match(source, /不会自动覆盖任一副本/);
  assert.match(source, /服务离线：已保留双副本，连接恢复前不会执行合并/);
});

test('版本保存先展示发布检查点且失败不清空编辑内容', () => {
  assert.match(source, /结构校验、兼容性检查/);
  assert.match(source, /commitSaveVersion/);
  assert.match(source, /当前编辑内容仍保留在页面中/);
});

test('导入只填充当前编辑器并需另行保存', () => {
  assert.match(source, /导入只填充当前编辑器/);
  assert.match(source, /已安全导入当前编辑器，请检查后保存草稿/);
  assert.match(css, /pm-v5-diff/);
  assert.match(css, /pm-v5-offline/);
});

test('Prompt 验收夹具支持窄屏并隔离草稿与备份存储', () => {
  assert.match(fixture, /params\.get\('width'\)/);
  assert.match(fixture, /prompt_manager_product_review_draft_v1/);
  assert.match(fixture, /beforeunload/);
  assert.match(fixture, /frame\.src = '\.\.\/\.\.\/index\.html'/);
});
