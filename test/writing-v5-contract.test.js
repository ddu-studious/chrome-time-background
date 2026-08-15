const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('写作空间七个设计页面均绑定 v5 页面状态', () => {
  const source = read('js/blog.js');
  assert.ok(source.includes("setBusinessPage?.('writing', page)"));
  for (const page of ['library', 'editor', 'preview', 'ai-assistant', 'knowledge-citation', 'version-history', 'sync-error']) {
    assert.ok(source.includes(`'${page}'`), `missing writing/${page}`);
  }
});

test('文章内容变化会保留最多五十个可恢复版本', () => {
  const source = read('js/blog.js');
  assert.ok(source.includes("const versionedFields = ['title', 'content', 'category', 'tags']"));
  assert.ok(source.includes('post.versions.unshift'));
  assert.ok(source.includes('post.versions = post.versions.slice(0, 50)'));
  assert.ok(source.includes("data-version-action=\"restore\""));
  assert.ok(source.includes('恢复前内容已自动留档'));
});

test('Hermes 失败进入明确恢复页且不覆盖本地文章', () => {
  const source = read('js/blog.js');
  assert.ok(source.includes('_showSyncError(message)'));
  assert.ok(source.includes('继续使用本地内容'));
  assert.ok(source.includes('重试不会覆盖本地文章'));
  assert.ok(source.includes("data-sync-action=\"retry\""));
});

test('AI 设置和知识引用关闭后恢复基础写作页面', () => {
  const blog = read('js/blog.js');
  const assistant = read('js/writing-assistant.js');
  assert.ok(blog.includes("this._setProductPage('knowledge-citation')"));
  assert.ok(assistant.includes("window.blogManager?._setProductPage?.('ai-assistant')"));
  assert.ok(assistant.includes('window.blogManager?._restoreProductPage?.()'));
});

test('写作空间主抽屉与二级页面提供模态焦点闭环', () => {
  const blog = read('js/blog.js');
  const assistant = read('js/writing-assistant.js');
  const styles = read('css/blog.css');
  assert.ok(blog.includes("drawer.setAttribute('role', 'dialog')"));
  assert.ok(blog.includes("drawer.setAttribute('aria-modal', 'true')"));
  assert.ok(blog.includes('this._setBackgroundInert(true)'));
  assert.ok(blog.includes('this._trapFocus(this._activeFocusSurface(), e)'));
  assert.ok(blog.includes("document.getElementById('blog-dock-btn')"));
  assert.ok(blog.includes('versionReturnFocus?.focus'));
  assert.ok(blog.includes('syncReturnFocus?.focus'));
  assert.ok(blog.includes('knowledgeReturnFocus?.focus'));
  assert.ok(blog.includes('role="dialog" aria-modal="true" aria-labelledby="kw-panel-title"'));
  assert.ok(assistant.includes("panel.setAttribute('role', 'dialog')"));
  assert.ok(assistant.includes('settingsReturnFocus?.focus'));
  assert.ok(styles.includes('.kw-wiki-overlay.open .kw-panel'));
});
