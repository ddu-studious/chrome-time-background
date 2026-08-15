const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/chatbot.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');
const chatbotCss = fs.readFileSync(path.join(root, 'css/chatbot.css'), 'utf8');

test('AI 对话六个设计页面绑定同一会话状态', () => {
  for (const page of ['default', 'code-answer', 'multi-agent', 'config-drawer', 'history', 'error-recovery']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /setBusinessPage\?\.\('ai-chat', page\)/);
  assert.match(html, /js\/chatbot\.js\?v=6/);
});

test('代码回答由真实消息中的代码块推导', () => {
  assert.match(source, /content\.includes\('```'\)/);
  assert.match(source, /return latest\?\.content\?\.includes\('```'\) \? 'code-answer' : 'default'/);
});

test('多 Agent 页面不会自动并发外发消息', () => {
  assert.match(source, /不会自动并发外发消息/);
  assert.match(source, /真正发送仍由输入框和当前 Agent 的明确操作触发/);
  assert.match(css, /chatbot-v5-agent-grid/);
});

test('AI 对话关闭态不会残留在无障碍树或键盘焦点中', () => {
  assert.match(chatbotCss, /\.chatbot-panel\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(chatbotCss, /\.chatbot-panel\.open\s*\{[\s\S]*?visibility:\s*visible/);
  assert.match(chatbotCss, /\.chatbot-config-overlay\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(html, /css\/chatbot\.css\?v=4/);
  assert.match(source, /aria-labelledby', 'chatbot-dialog-title'/);
  assert.match(source, /getElementById\('chatbot-dock-btn'\)/);
  assert.match(source, /document\.getElementById\('dock-launchpad-btn'\)/);
  assert.match(html, /js\/chatbot\.js\?v=6/);
});

test('六页共享固定评审会话模型工作区与两个代码附件', () => {
  for (const value of ['网易云 UI 评审', 'GPT-5.6', 'chrome-time-background', 'music-controller.js', 'music-view.js']) {
    assert.match(source, new RegExp(value.replace('.', '\\.')));
  }
  assert.match(source, /chatbot-contextbar/);
  assert.match(source, /chatbot-context-used/);
  assert.match(source, /data-chatbot-suggest/);
});

test('停止生成保留已输出内容且工具请求先呈现权限范围', () => {
  assert.match(source, /已停止生成，已输出内容会保留/);
  assert.match(source, /setStreamingUI/);
  assert.match(source, /lastPartialResponse/);
  assert.match(source, /showToolPermission/);
  assert.match(source, /toolWriteMode/);
});

test('代码块分别提供复制与应用前检查且不伪造文件写入', () => {
  assert.match(source, /data-chatbot-copy-code/);
  assert.match(source, /data-chatbot-apply-code/);
  assert.match(source, /应用补丁前检查/);
  assert.match(source, /已阻止写入/);
  assert.match(source, /当前页面不会伪造成功/);
});

test('多 Agent 保留独立证据再由人工选择合并结论', () => {
  assert.match(source, /selectedEvidenceIds/);
  assert.match(source, /data-chatbot-evidence/);
  assert.match(source, /独立证据先保留/);
  assert.match(source, /mergeEvidenceConclusion/);
});

test('配置历史与错误恢复覆盖设计页的完整操作合同', () => {
  for (const token of ['温度', '系统提示', '工具权限', '即时预览', '搜索历史会话', '归档', '导出', '从失败处重试', '切换模型', '诊断配置']) {
    assert.match(source, new RegExp(token));
  }
  assert.match(source, /HISTORY_ARCHIVE_KEY/);
  assert.match(source, /exportHistoryGroup/);
});

test('AI 对话验收夹具支持窄屏并在离页时恢复本地存储', () => {
  const fixture = fs.readFileSync(path.join(root, 'test/fixtures/ai-chat-preview.html'), 'utf8');
  assert.match(fixture, /get\('width'\)/);
  assert.match(fixture, /beforeunload/);
  assert.match(fixture, /chatbotHistoryArchived/);
});

test('AI 对话主面板与二级页面具备背景隔离和键盘焦点闭环', () => {
  assert.match(source, /setBackgroundInert\(true\)/);
  assert.match(source, /panel\.setAttribute\('aria-hidden', 'false'\)/);
  assert.match(source, /handlePanelKeydown/);
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /activeFocusSurface/);
  assert.match(source, /viewOverlay\.setAttribute\('aria-hidden', 'false'\)/);
  assert.match(source, /configOverlay\.setAttribute\('aria-hidden', 'false'\)/);
  assert.match(source, /returnFocus/);
  assert.match(source, /aria-selected/);
});
