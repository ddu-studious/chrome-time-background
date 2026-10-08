const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI 设置提供规划思考起步策略：默认严格按设置，并随策略一起读写', () => {
  const html = read('settings.html'), control = read('js/ai-control.js');
  assert.match(html, /<select id="planning-strategy"><option value="follow">[^<]+<\/option><option value="adaptive">[^<]+<\/option><\/select>/);
  assert.match(html, /所选等级仍是上限，不修改默认设置/);
  assert.match(html, /js\/ai-control\.js\?v=5/);
  assert.match(control, /\$\('planning-strategy'\)\.value = data\.policy\.planningStrategy \|\| 'follow'/);
  assert.match(control, /planningStrategy: \$\('planning-strategy'\)\?\.value \|\| state\.policy\.planningStrategy \|\| 'follow'/);
});

test('时间线与历史详情把自适应起步和超时恢复分开展示', () => {
  const timeline = read('js/assistant-timeline.js'), history = read('js/ai-history.js');
  assert.match(timeline, /model\?\.startReason === 'adaptive-receipts'/);
  assert.match(timeline, /已有执行回执，本轮从关闭思考开始/);
  assert.match(timeline, /model\.startReason === 'adaptive-receipts' \? ' → 关闭（已有回执，自适应）'/);
  assert.match(timeline, /沿用本轮恢复/);
  assert.match(history, /startReason: row\.startReason/);
  assert.match(read('assistant.html'), /js\/assistant-timeline\.js\?v=20260929-speed/);
});
