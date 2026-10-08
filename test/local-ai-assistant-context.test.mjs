import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareContext, estimateTokens } from '../local-ai/assistant-context.mjs';
import { plan } from '../local-ai/assistant-service.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { LMStudioProvider } from '../local-ai/provider.mjs';
import Tools from '../js/assistant-tools.js';

const text = '首先清空播放列表，搜索《杨和苏》的热歌，添加到队列，随机播放。';
const state = { tool: 'music.state', status: 'done', message: '当前队列101首，未在播放。', data: { status: 'ready', revision: 'd07dd282a3bbfac663278855759ef1d44f2a5d44d32d5c2c614f564e5f02edb4', mode: 'sequence', isPlaying: false, count: 101, currentTime: 0, duration: 0, volume: 1, currentSong: null, source: 'cache', readAt: 1789723263990, timer: null } };
const input = { app: 'music', text, personalMemory: { artistDefaultAction: 'play', artistQueueMode: 'append' }, observations: [state], turns: [{ role: 'user', content: text }, { role: 'assistant', content: state.message }], toolGroups: [] };
const clear = { steps: [{ tool: 'music.queue.clear', args: { expectedRevision: state.data.revision } }], continue: true };

test('截图第二轮真实输入不再被6200拦截，保留原始需求与101首队列版本', async () => {
  let sent;
  const result = await plan(input, { reasoning: 'low', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), generateObject: async options => { sent = options; return clear; } });
  assert.deepEqual(result.data, clear);
  assert.equal(sent.input.text, text);
  assert.deepEqual(sent.input.observations, [state]);
  assert.equal(sent.input.turns.length, 0);
  assert.equal(result.toolContext.contextLength, 40960);
  assert.equal(result.toolContext.outputBudget, 4096);
  assert.equal(result.toolContext.inputBudget, 32768 - 4096 - 512);
  assert.ok(result.toolContext.estimatedInputTokens < result.toolContext.inputBudget);
  assert.doesNotMatch(sent.instructions, /alarm工具先list|video.search可选/);
  assert.match(sent.instructions, /expectedRevision|最新.*revision/);
});

test('加载更多工具组和多轮较长输入仍能规划，较晚候选ref不因只取前五项丢失', async () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ ref: `item-${i}`, title: '真实候选标题'.repeat(12), durationSeconds: 300 + i }));
  const body = { ...input, toolGroups: ['music.queue', 'music.playback', 'music.edit', 'music.library', 'app.connection'],
    turns: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `第${i}轮：` + '保留队列里已存在的歌曲，不要重复添加；'.repeat(12) })),
    observations: [state, { tool: 'music.queue.list', status: 'done', message: '队列候选', data: { items, nextOffset: 20, revision: state.data.revision } }],
    completedSteps: [{ tool: 'music.queue.clear', message: '已停止播放并清空本地队列，剩余0首。' }] };
  let sent;
  const result = await plan(body, { reasoning: 'low', planningContext: async () => ({ contextLength: 40960 }), generateObject: async options => { sent = options; return { steps: [{ tool: 'music.state', args: {} }], continue: true }; } });
  assert.ok(result.toolContext.estimatedInputTokens > 6200);
  assert.equal(sent.input.observations[1].data.items[19].ref, 'item-19');
  assert.equal(sent.input.observations[1].data.nextOffset, 20);
  assert.deepEqual(sent.input.completedSteps, body.completedSteps);
  assert.equal(sent.input.turns.length, 12);
});

test('紧张预算只压缩展示字段，保留所有引用、最新版本、分页与执行凭据', () => {
  const observations = [state, { tool: 'music.queue.list', status: 'done', message: '已读取', data: {
    items: Array.from({ length: 8 }, (_, i) => ({ ref: `r${i}`, title: '展示'.repeat(400), url: 'https://example.test/image.png' })),
    selectedRef: 'r7', revision: 'latest-version', nextRef: 'page-next', nextOffset: 8, total: 101, truncated: true
  } }];
  const original = { text, observations, completedSteps: [{ tool: 'music.queue.clear', message: '已清空' }], remainingSteps: [{ tool: 'music.sleep', args: { minutes: 30 } }], turns: [{ role: 'user', content: '30分钟后暂停，但不能重复追加。' }] };
  const result = prepareContext({ instructions: 'contract', input: original, contextLength: 8192, maxOutputTokens: 4096 });
  assert.equal(result.budget.compacted, true);
  assert.deepEqual(result.modelInput.observations[0], state);
  const data = result.modelInput.observations[1].data;
  assert.deepEqual(data.items.map(row => row.ref), observations[1].data.items.map(row => row.ref));
  for (const key of ['selectedRef','revision','nextRef','nextOffset','total','truncated']) assert.equal(data[key], observations[1].data[key]);
  assert.deepEqual(result.modelInput.turns, original.turns);
  assert.deepEqual(result.modelInput.remainingSteps, original.remainingSteps);
  assert.deepEqual(result.modelInput.completedSteps, original.completedSteps);
  assert.ok(result.budget.estimatedInputTokens <= result.budget.inputBudget);
  assert.equal(original.observations[1].data.items[0].title.length, 800);
});

test('真正不足时拒绝并报告分项预算，不偷偷删除用户约束或操作回执', () => {
  assert.throws(() => prepareContext({ instructions: '系统'.repeat(800), input, contextLength: 4096, maxOutputTokens: 4096 }), error => {
    assert.equal(error.code, 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED');
    assert.equal(error.contextBudget.inputBudget, 0);
    assert.equal(error.contextBudget.observationCount, 1);
    assert.ok(error.contextBudget.instructionsEstimate > 0);
    assert.match(error.message, /已预留输出/);
    return true;
  });
  assert.equal(input.observations[0].data.revision, state.data.revision);
});

test('只去掉当前输入的重复副本，保留更早同文用户指令', () => {
  const result = prepareContext({ instructions: '', input: { text: '播放', turns: [{ role: 'user', content: '播放' }, { role: 'assistant', content: '已播放' }, { role: 'user', content: '播放' }], observations: [] } });
  assert.deepEqual(result.modelInput.turns, [{ role: 'user', content: '播放' }, { role: 'assistant', content: '已播放' }]);
});

test('网关只用所选模型能力和全局预算，失败准备仍有所选模型和诊断', async () => {
  let model, calls = 0;
  const provider = { model: 'default', planningContext: async options => { model = options.model; return { contextLength: 4096, contextSource: 'loaded-model' }; }, generateObject: async () => { calls++; return clear; } };
  const gateway = createGateway({ provider });
  await assert.rejects(gateway.run('assistant.plan', { ...input, contextLength: 9999999 }, { selection: { model: 'selected/model', reasoning: 'low' } }), error => {
    assert.equal(error.code, 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED');
    assert.equal(error.execution.model, null);
    assert.equal(error.execution.requestedModel, 'selected/model');
    assert.equal(error.execution.contextBudget.contextLength, 4096);
    return true;
  });
  assert.equal(model, 'selected/model'); assert.equal(calls, 0);
  assert.equal(gateway.describe().usage.admitted, 0);
  const control = createControlStore(); control.update({ ...control.snapshot().policy, maxOutputTokens: 800 }, 1);
  const g = createGateway({ provider: { ...provider, planningContext: async () => ({ contextLength: 12288 }) }, control });
  const result = await g.run('assistant.plan', input, { selection: { reasoning: 'low' } });
  assert.equal(result.execution.contextBudget.outputBudget, 800);
});

test('模型在准备后换成更小上下文时重新检查，不能把超限请求发给模型', async () => {
  const provider = new LMStudioProvider();
  provider.models = async () => [{ id: provider.model, loaded: true, loadedContextLength: 4096, reasoningOptions: ['low'] }];
  provider.request = async () => { assert.fail('不应请求生成'); };
  await assert.rejects(provider.generateObject({ instructions: 'system', input, reasoning: 'low', maxOutputTokens: 4096, contextBudget: { contextLength: 40960 } }), { code: 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED' });
  assert.equal(provider.busy, false);
});

test('工具入口带上完整已完成摘要，较早写操作不会随六条观察窗口消失', async () => {
  let sent;
  const handlers = Tools.create({ ai: async request => { sent = request; return { ok: true, data: { ...clear, todoTips: [{ text: '清空队列', source: 0, tool: 'music.queue.clear' }] } }; } });
  const log = [{ tool: 'music.queue.clear', status: 'done', message: '已清空' }, ...Array.from({ length: 7 }, (_, i) => ({ tool: 'music.state', status: 'done', message: `状态${i}` })), { tool: 'music.queue.play', status: 'running' }];
  await handlers.plan({ app: 'music', text }, { task: { id: 'task', input: {}, observations: Array(6).fill(state), log, turns: [], memory: {} }, guard() {} });
  assert.equal(sent.input.completedSteps[0].tool, 'music.queue.clear');
  assert.equal(sent.input.completedSteps.length, 8);
  assert.equal(sent.input.observations.length, 6);
  assert.ok(!sent.input.completedSteps.some(row => row.tool === 'music.queue.play'));
});

test('完整生产引擎链路：101首队列→确认清空→选歌手→读取100首→追加→随机播放', async () => {
  const { runContextScenario } = await import('./fixtures/assistant-context-scenario.mjs');
  let calls = 0;
  const step = (tool, args = {}) => ({ steps: [{ tool, args }], continue: true });
  const result = await runContextScenario({ provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), generateObject: async ({ input: sent }) => {
    assert.equal(sent.text, text);
    const observations = sent.observations;
    const revision = [...observations].reverse().find(row => row.data?.revision)?.data.revision;
    if (sent.planningPhase === 'outline') return { todoTips: [
        { text: '清空队列', source: 0, tool: 'music.queue.clear' },
        { text: '追加杨和苏热歌', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
        { text: '随机播放', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }
      ] };
    switch (calls++) {
      case 0: return step('music.state');
      case 1: assert.equal(observations.at(-1).data.count, 101); return step('music.queue.clear', { expectedRevision: revision });
      case 2: assert.ok(sent.completedSteps.some(row => row.tool === 'music.queue.clear')); return step('music.search', { kind: 'artist', query: '杨和苏' });
      case 3: return step('music.collection.get', { ref: observations.at(-1).data.selectedRef });
      case 4: return step('music.queue.apply', { ref: observations.at(-1).data.ref, mode: 'append', startPlayback: false, expectedRevision: revision });
      case 5: return step('music.queue.play', { mode: 'shuffle', expectedRevision: revision });
      case 6: assert.ok(sent.completedSteps.some(row => row.tool === 'music.queue.clear')); return { done: true };
      default: assert.fail('不应重复规划');
    }
  } } });
  assert.equal(result.passed, true, result.task.message);
  assert.deepEqual(result.effects, { clears: 1, applies: 1, plays: 1, searches: 1 });
  assert.equal(calls, 7);
  assert.ok(result.plans.every(row => row.budget.estimatedInputTokens <= row.budget.inputBudget));
});

test('复合队列任务不暴露单动作意图入口，防止把整个剩余流程再次交给music.intent', async () => {
  let instructions;
  await plan(input, { generateObject: async options => { instructions = options.instructions; return clear; } });
  assert.doesNotMatch(instructions, /"music.intent":/);
  assert.match(instructions, /本次是队列组合任务/);
  await assert.rejects(plan(input, { generateObject: async () => ({ steps: [{ tool: 'music.intent', args: { text: '搜索热歌，添加到队列，随机播放' } }], continue: true }) }), /music.intent 本轮不可用，不能通过加载工具组启用/);
  await plan({ app: 'music', text: '给我找点适合写代码的音乐' }, { generateObject: async options => {
    assert.match(options.instructions, /"music.intent":/);
    return { steps: [{ tool: 'music.intent', args: { text: '搜索钢琴音乐' } }] };
  } });
});
