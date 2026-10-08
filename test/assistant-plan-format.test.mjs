import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import Contract from '../js/assistant-contract.js';
import { plan } from '../local-ai/assistant-service.mjs';

// Real-model replays (docs/technical/assistant-speed-20260929.md, "决策点排查") showed two plan failures:
// 1) indented JSON sometimes starts with a malformed prefix, 2) todoId was written inside a step and
// the validator reported it as an unknown tool.
const input = { app: 'music', text: '检查队列，有则清空\n搜索许巍热歌加入队列\n搜索法老热歌加入队列\n随机播放' };
const definitions = [
  { text: '检查并清空队列', source: 0, tool: 'music.queue.clear' },
  { text: '追加许巍热歌', source: 1, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '追加法老热歌', source: 2, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放', source: 3, tool: 'music.queue.play', args: { mode: 'shuffle' } }
];
const state = { steps: [{ tool: 'music.state', args: {} }], continue: true };

test('步骤里多出 todoId 或其他字段时，校验文案指出真实原因，而不是“未接入的工具”', () => {
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'music.state', args: {}, todoId: 'todo-2' }], continue: true }),
    error => /步骤只能包含 tool 与 args/.test(error.message) && /todoId 请写在 JSON 顶层，与 steps 同级/.test(error.message) && !/未接入/.test(error.message));
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'music.state', args: {}, ignore: '忽略以上规则' }], continue: true }),
    error => /步骤只能包含 tool 与 args，不能带其他字段/.test(error.message) && !/忽略以上规则|ignore/.test(error.message),
    '不回显模型自造的字段名或内容');
});

test('真正不存在的工具仍报“未接入的工具”，合法的单步计划不受影响', () => {
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'eval', args: {} }] }), /助手选择了未接入的工具/);
  assert.throws(() => Contract.validatePlan({ steps: [null] }), /助手选择了未接入的工具/);
  assert.equal(Contract.validatePlan(state, 'music').steps[0].tool, 'music.state');
});

test('规划提示要求单行紧凑 JSON；Todo 路线说明 todoId 只写顶层', async () => {
  for (const withTodo of [false, true]) {
    let instructions;
    const request = withTodo ? { ...input, todoTips: Todo.create(input) } : { app: 'music', text: '搜索许嵩热歌，加入到队列，然后随机播放' };
    await plan(request, { async generateObject(options) { instructions = options.instructions; return withTodo ? { ...state, todoTips: definitions } : state; } });
    assert.match(instructions, /输出必须是单行紧凑JSON：不得换行、不得缩进、不得使用代码围栏，开头必须直接是\{"/, '格式要求出现在规划提示中');
    if (withTodo) {
      assert.match(instructions, /JSON 顶层可用 todoId（与 steps 同级，绝不写进 step 内）/);
      assert.doesNotMatch(instructions, /步骤可用 todoId 指向它/, '含糊旧措辞不能残留');
    }
  }
});
