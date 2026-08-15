const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('写作空间提供可操作的第三栏创作上下文', () => {
  const source = read('js/blog.js');
  assert.ok(source.includes('class="blog-assistant"'));
  assert.ok(source.includes("case 'assistant-knowledge'"));
  assert.ok(source.includes("case 'assistant-prompt'"));
});

test('今日阅读未配置时给出可恢复状态而非静默不显示', () => {
  const source = read('js/memo.js');
  assert.ok(source.includes('class="reco-setup-state"'));
  assert.ok(source.includes('id="reco-setup-btn"'));
  assert.ok(source.includes('this.showBookmarkWizard()'));
});

test('诗词迷你条优先显示题目与作者', () => {
  const source = read('js/main.js');
  assert.ok(source.includes('`《${poem.title}》 · ${currentLine}`'));
  assert.ok(source.includes('`${poem.dynasty} · ${poem.author}`'));
  assert.ok(source.includes('`第 ${state.currentLineIndex + 1} / ${lineCount} 句`'));
});

test('主应用初始化兼容 DOM 已完成的动态恢复场景且只执行一次', () => {
  const source = read('js/main.js');
  assert.ok(source.includes('window.__chromeTimeAppInitialized'));
  assert.ok(source.includes("document.readyState === 'loading'"));
  assert.ok(source.includes('void initApp()'));
});

test('B站一级导航只保留设计规定的四个入口', () => {
  const css = read('css/product-ui-v4.css');
  for (const tab of ['popular', 'history', 'watchlater', 'ranking']) {
    assert.ok(css.includes(`.bili-pill[data-tab="${tab}"]`));
  }
});

test('Prompt 管理右栏提供随输入更新的实时预览', () => {
  const source = read('js/prompt-manager.js');
  assert.ok(source.includes('id="pm-live-preview"'));
  assert.ok(source.includes("el.addEventListener('input', () =>"));
  assert.ok(source.includes('updateLivePreview();'));
  assert.ok(source.includes('preview.textContent = prompt'));
});

test('知识、媒体、AI和游戏均具有 v4 模块样式', () => {
  const css = read('css/product-ui-v4.css');
  for (const selector of ['.kw-panel', '.blog-assistant', '.reading-reco-container', '.poetry-radio', '.cb-panel', '.chatbot-panel', '.pm-panel', '.snake-game-panel']) {
    assert.ok(css.includes(selector), `缺少 ${selector}`);
  }
});
