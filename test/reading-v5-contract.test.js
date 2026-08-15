const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const memo = fs.readFileSync(path.join(root, 'js/memo.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/product-ui-v5.css'), 'utf8');
const fixture = fs.readFileSync(path.join(root, 'test/fixtures/reading-preview.html'), 'utf8');

test('今日阅读五个设计页面映射真实书签复习状态', () => {
  for (const page of ['review-queue', 'detail', 'permission', 'complete-feedback', 'history-stats']) {
    assert.match(memo, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(memo, /setBusinessPage\?\.\('reading', page\)/);
  assert.match(html, /js\/memo\.js\?v=10/);
});

test('阅读详情不会在未点击时自动打开外部网址', () => {
  assert.match(memo, /reading-open-source/);
  assert.match(memo, /window\.open\(bm\.url, '_blank', 'noopener'\)/);
  assert.doesNotMatch(memo, /_renderReadingDetail\([\s\S]{0,300}window\.open/);
});

test('复习反馈与历史统计复用 BookmarkRAG 和 BookmarkSRS', () => {
  assert.match(memo, /rag\.reviewBookmark\(bookmarkId, quality\)/);
  assert.match(memo, /getReviewStats/);
  assert.match(memo, /BookmarkSRS\.formatNextReview/);
  assert.match(css, /reading-v5-history/);
  assert.match(css, /reading-v5-permission/);
});

test('今日阅读目录选择不再强制经过 AI 服务和 API Key', () => {
  assert.match(memo, /_showReadingSourcePicker\(\)/);
  assert.match(memo, /rag\.hasBookmarkPermission\(\)/);
  assert.match(memo, /rag\.requestBookmarkPermission\(\)/);
  assert.match(memo, /rag\.getBookmarkFolders\(\)/);
  assert.match(memo, /saveSettings\(\{ enabled: true, folderIds: selectedIds, folderNames: selectedNames \}\)/);
  assert.match(memo, /AI 服务与正文摘要均为可选项/);
  assert.match(memo, /readingContainer\.inert = true/);
  assert.doesNotMatch(memo, /id="reco-setup-btn"[^\n]+showBookmarkWizard/);
  assert.match(fixture, /noPermission/);
  assert.match(fixture, /requestBookmarkPermission/);
  assert.match(fixture, /readingPreview=\$\{Date\.now\(\)\}/);
});

test('阅读首页采用队列、当前文章与统计三栏，并保留真实数据语义', () => {
  assert.match(memo, /reading-v5-focus/);
  assert.match(memo, /reading-v5-heatmap/);
  assert.match(memo, /const current = queue\[0\] \|\| null/);
  assert.match(memo, /sourceCounts = new Map/);
  assert.match(memo, /const completedToday =/);
  assert.match(css, /grid-template-columns: minmax\(300px, 34%\) minmax\(360px, 1fr\) minmax\(230px, 270px\)/);
  assert.match(css, /@media\(max-width:900px\)[\s\S]*\.reading-v5-layout \{ display: flex/);
});

test('阅读工作台具备 dialog、背景 inert、焦点闭环和键盘卡片', () => {
  assert.match(html, /id="reading-reco" role="dialog" aria-modal="true"/);
  assert.match(html, /id="reading-reco-wrapper"[^>]+aria-hidden="true"/);
  assert.match(memo, /_setReadingBackgroundInert\(true\)/);
  assert.match(memo, /const tracked = new Set\(this\._readingBackgroundInertSiblings\)/);
  assert.match(memo, /requestAnimationFrame\(\(\) => \{[\s\S]*?_setReadingBackgroundInert\(true\)/);
  assert.match(memo, /_handleReadingKeydown\(event\)/);
  assert.match(memo, /event\.key === 'Escape'/);
  assert.match(memo, /event\.key !== 'Tab'/);
  assert.match(memo, /class="reco-card-open" type="button"/);
  assert.match(memo, /aria-current="page"/);
  assert.match(memo, /insideLaunchpad/);
  assert.match(memo, /document\.getElementById\('dock-launchpad-btn'\)/);
  assert.match(css, /\.reading-reco-wrapper :where\(button, a, \[tabindex\]\):focus-visible/);
});

test('没有到期书签时仍渲染完整工作台而不是旧式全屏空态', () => {
  assert.match(memo, /reading-v5-inline-empty/);
  assert.match(memo, /reading-v5-focus-empty/);
  assert.doesNotMatch(memo, /if \(reviewQueue\.length === 0 && unreviewed\.length === 0\) \{\s*body\.innerHTML/);
});
