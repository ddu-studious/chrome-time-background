const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const C = require('../js/assistant-contract.js');
test('应用切换后提示对应实际用途，未选应用时不默认音乐', () => {
  assert.match(C.inputHint('alarm'), /提醒/);
  assert.doesNotMatch(C.inputHint('alarm'), /歌曲|歌手|歌单|搜索音乐/);
  assert.match(C.inputHint('music'), /张杰/);
  assert.match(C.inputHint('bilibili'), /B 站/);
  assert.match(C.inputHint('youtube'), /YouTube/);
  assert.match(C.inputHint(null), /选择应用/);
});
test('动作提示只对兼容应用生效，删除动作或应用后恢复对应默认', () => {
  assert.match(C.inputHint('alarm', 'alarms'), /查看已有提醒/);
  assert.match(C.inputHint('music', 'sleep'), /停止音乐/);
  assert.match(C.inputHint('alarm', 'music-song'), /提醒/);
  assert.equal(C.inputHint('alarm', null), C.inputHint('alarm'));
  assert.match(C.inputHint(null, null), /选择应用/);
});
test('首页提前加载宿主，输入栏默认文案不再写死搜歌', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  assert.ok(html.indexOf('js/assistant-overlay.js') < html.indexOf('js/assistant-launcher.js'));
  const assistant = fs.readFileSync(require.resolve('../assistant.html'), 'utf8');
  assert.match(assistant, /placeholder="输入 @ 选择应用/);
  assert.match(assistant, /id="request"[^>]*autofocus/);
  assert.match(assistant, /id="assistant-model"/);assert.match(assistant, /id="assistant-reasoning"/);
});
test('嵌入输入条收到宿主聚焦请求后把光标放到草稿末尾', () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  assert.match(source, /event\.data\.type === 'assistant_focus'\) focusInput\(\)/);
  assert.match(source, /input\.setSelectionRange\(input\.value\.length, input\.value\.length\)/);
});
test('助手从本地 AI 状态读取模型能力，提交时仅携带受控选择', () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  assert.match(source,/send\('local_ai_status'\)/);assert.match(source,/reasoningOptions/);assert.match(source,/ai:chosenAI/);
});
