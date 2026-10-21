const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI 设置提供规划思考起步策略：默认严格按设置，并随策略一起读写', () => {
  const html = read('settings.html'), control = read('js/ai-control.js');
  assert.match(html, /<select id="planning-strategy"><option value="follow">[^<]+<\/option><option value="adaptive">[^<]+<\/option><\/select>/);
  assert.match(html, /所选等级仍是上限，不修改默认设置/);
  assert.match(html, /无论选哪种起步，助手的清单分析（先拆分完整待办）固定从关闭思考开始/);
  assert.match(html, /同一执行轮内的后续规划沿用关闭思考；选择或确认后的新执行轮，仍按上方设置起步/);
  assert.match(html, /js\/ai-control\.js\?v=6/);
  assert.match(control, /\$\('planning-strategy'\)\.value = data\.policy\.planningStrategy \|\| 'follow'/);
  assert.match(control, /planningStrategy: \$\('planning-strategy'\)\?\.value \|\| state\.policy\.planningStrategy \|\| 'follow'/);
});

test('时间线与历史详情把自适应起步和超时恢复分开展示', () => {
  const timeline = read('js/assistant-timeline.js'), history = read('js/ai-history.js');
  assert.match(timeline, /model\?\.startReason === 'adaptive-receipts'/);
  assert.match(timeline, /已有执行回执，本轮从关闭思考开始/);
  assert.match(timeline, /model\.startReason === 'adaptive-receipts' \? ' → 关闭（已有回执，自适应）'/);
  assert.match(timeline, /沿用本轮恢复/);
  assert.match(timeline, /model\?\.startReason === 'outline-off'/);
  assert.match(timeline, /清单分析只拆分目标，本轮从关闭思考开始/);
  assert.match(timeline, /model\.startReason === 'outline-off' \? ' → 关闭（清单分析起步）'/);
  assert.match(timeline, /清单分析已用关闭思考完成，本执行轮后续规划沿用关闭思考/);
  assert.match(timeline, /' → 关闭（沿用清单分析）'/);
  assert.match(history, /startReason: row\.startReason/);
  assert.match(read('assistant.html'), /js\/assistant-workbench\.bundle\.js\?v=20261020-startup/);
});

test('时间线沿来源链判断沿用的关闭思考来自清单分析还是真实超时恢复', () => {
  const sandbox = {};
  vm.runInNewContext(read('js/assistant-timeline.js'), sandbox);
  const { offOrigin } = sandbox.AssistantTimeline;
  const outline = { requestId: 'a', startReason: 'outline-off' }, first = { requestId: 'b', recoveryFromRequestId: 'a' }, second = { requestId: 'c', recoveryFromRequestId: 'b' };
  assert.equal(offOrigin([outline, first, second], second), outline, '多轮沿用仍追到清单分析');
  assert.equal(offOrigin([outline, first, second], outline), outline);
  const real = { requestId: 'r', attempts: [{ reasoning: 'medium' }, { reasoning: 'off' }] }, after = { requestId: 's', recoveryFromRequestId: 'r' };
  assert.equal(offOrigin([real, after], after), real, '真实超时恢复的来源不是清单分析');
  assert.equal(offOrigin([after], after), undefined, '来源记录缺失时不猜测');
  const loop = [{ requestId: 'x', recoveryFromRequestId: 'y' }, { requestId: 'y', recoveryFromRequestId: 'x' }];
  assert.doesNotThrow(() => offOrigin(loop, loop[0]), '异常循环也会结束');
});
