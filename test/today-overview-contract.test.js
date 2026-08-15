const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('首页加载独立今日概览视图模块', () => {
  const html = read('index.html');
  assert.ok(html.includes('js/today-overview.js?v=6'));
  assert.ok(html.includes('js/product-shell-v5.js'));
});

test('今日概览只读聚合五类现有数据', () => {
  const source = read('js/today-overview.js');
  for (const key of ['schedulePlans', 'memos', 'worklogEntries', 'bookmarkCache', 'lastMusicState']) {
    assert.ok(source.includes(`'${key}'`));
  }
  assert.ok(source.includes('chrome.storage.local.get'));
  assert.ok(!source.includes('chrome.storage.local.set'));
});

test('今日概览提供计划任务日志阅读音乐入口及收起恢复状态', () => {
  const source = read('js/today-overview.js');
  for (const app of ['schedule', 'memo', 'worklog', 'reading', 'music']) {
    assert.ok(source.includes(app));
  }
  assert.ok(source.includes('data-action="collapse"'));
  assert.ok(source.includes('today-overview-trigger'));
});
