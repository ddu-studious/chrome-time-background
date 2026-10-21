import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelTokenCounter } from '../local-ai/model-token-counter.mjs';
import { LMStudioProvider } from '../local-ai/provider.mjs';
import { prepareModelContext } from '../local-ai/assistant-context.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';

const capacity = { contextLength: 12288, contextSource: 'loaded-model', maxOutputTokens: 1200 };
const options = { instructions: '规则'.repeat(3000), input: { text: '查询状态', turns: [], observations: [] }, ...capacity };
const modelInput = { text: '给我推荐音乐', app: 'music', observations: [{ tool: 'music.state', status: 'done', message: '已读状态', data: { count: 0 } }] };
function counter(handle) {
  const value = new ModelTokenCounter({ baseUrl: 'http://127.0.0.1:1234', token: '' });
  value.client = { llm: { createDynamicHandle(query) { assert.deepEqual(query, { identifier: 'fixture', deviceIdentifier: null }); return handle; } } };
  return value;
}

test('官方 API 适配：仅用已加载本机模型模板与分词，保留精确输入字节', async () => {
  const calls = [];
  const value = counter({ async getContextLength() { calls.push('capacity'); return 12288; },
    async applyPromptTemplate(history) { calls.push(history); return '模型模板'; },
    async countTokens(text) { assert.equal(text, '模型模板'); calls.push('count'); return 4000; } });
  const result = await value.count({ instructions: '规则', input: { text: '不要播放', ref: 'r19' }, model: 'fixture' });
  assert.equal(result.inputTokens, 4000); assert.equal(result.contextLength, 12288);
  assert.deepEqual(calls, ['capacity', [{ role: 'system', content: '规则' }, { role: 'user', content: '{"text":"不要播放","ref":"r19"}' }], 'count']);
});

test('分词取消后不再启动后续 RPC，未结束 RPC 占住有界槽位', async () => {
  let release, entered;
  const start = new Promise(resolve => entered = resolve);
  const value = counter({ async getContextLength() { entered(); return new Promise(resolve => release = resolve); },
    applyPromptTemplate() { assert.fail('取消后不能继续'); } });
  const controller = new AbortController();
  const running = value.count({ model: 'fixture', signal: controller.signal });
  await start; controller.abort();
  await assert.rejects(running, { name: 'AbortError' });
  await assert.rejects(value.count({ model: 'fixture' }), { code: 'MODEL_TOKENIZATION_BUSY' });
  release(12288); await value.pending.catch(() => {});
  assert.equal(value.pending, null);
});

test('分词超时与 SDK 故障明确失败，不把 SDK 文本或秘密带入错误', async () => {
  let release;
  const value = counter({ getContextLength: () => new Promise(resolve => release = resolve) });
  await assert.rejects(value.count({ model: 'fixture', timeoutMs: 10 }), { code: 'MODEL_TOKENIZATION_TIMEOUT' });
  release(12288); await value.pending.catch(() => {});
  const failed = counter({ async getContextLength() { throw new Error('secret-input-body'); } });
  await assert.rejects(failed.count({ model: 'fixture' }), error => error.code === 'MODEL_TOKENIZATION_FAILED' && !error.message.includes('secret-input-body'));
});

test('实际计数足够时不因中文粗估过高截短数据，估算与计数分开记录', async () => {
  const input = { ...options.input, observations: [{ message: '已查询', data: { title: '展示'.repeat(400), selectedRef: 'r19' } }] };
  let calls = 0;
  const result = await prepareModelContext({ ...options, input }, { countContextTokens: async () => { calls++; return { inputTokens: 3811, contextLength: 12288 }; } });
  assert.equal(calls, 1); assert.equal(result.budget.compacted, false);
  assert.ok(result.budget.estimatedInputTokens > result.budget.inputBudget);
  assert.equal(result.budget.measuredInputTokens, 3811);
  assert.deepEqual(result.modelInput.observations, input.observations);
});

test('真实超限只精简展示，再计数；用户限制、回执、所选引用完整保留', async () => {
  const input = { ...options.input, context: { constraints: [{ text: '不要播放' }], receipts: [{ status: 'unknown', message: '等待核对' }] },
    observations: [{ data: { title: '展示'.repeat(400), selectedRef: 'r19', revision: 'rev9', nextRef: 'page2' } }] };
  let calls = 0;
  const result = await prepareModelContext({ ...options, input }, { countContextTokens: async () => ({ inputTokens: ++calls === 1 ? 12000 : 6000, contextLength: 12288 }) });
  assert.equal(calls, 2); assert.equal(result.budget.compacted, true);
  assert.deepEqual(result.modelInput.context, input.context);
  for (const k of ['selectedRef', 'revision', 'nextRef']) assert.equal(result.modelInput.observations[0].data[k], input.observations[0].data[k]);
  await assert.rejects(prepareModelContext(options, { countContextTokens: async () => ({ inputTokens: 12000, contextLength: 12288 }) }), error => error.code === 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED' && error.contextBudget.measuredInputTokens === 12000);
});

test('分词故障不退回估算继续生成；冷模型显式估算且不加载模型', async () => {
  await assert.rejects(prepareModelContext(options, { countContextTokens: async () => { throw Object.assign(new Error('SDK unavailable'), { code: 'MODEL_TOKENIZATION_FAILED' }); } }), { code: 'MODEL_TOKENIZATION_FAILED' });
  const provider = new LMStudioProvider();
  assert.equal(await provider.countContextTokens({ contextSource: 'cold-load-default' }), null);
  assert.equal(provider.tokenCounter, undefined);
});

test('真实 Provider 与 Gateway 复用本次分词，不重复计算；恢复换思考重新计数', async () => {
  const provider = new LMStudioProvider(); let counts = 0, generations = 0;
  provider.models = async () => [{ id: provider.model, loaded: true, loadedContextLength: 12288, reasoningOptions: ['low', 'off'] }];
  provider.tokenCounter = { async count() { counts++; return { inputTokens: 4000, contextLength: 12288 }; } };
  provider.request = async () => {
    generations++;
    return generations === 1 ? { output: [{ type: 'reasoning' }], stats: { total_output_tokens: 1199, reasoning_output_tokens: 1199 } }
      : { output: [{ type: 'message', content: '{"question":"请选择歌曲"}' }], stats: { input_tokens: 4000, total_output_tokens: 10 } };
  };
  const gateway = createGateway({ provider });
  const result = await gateway.run('assistant.plan', modelInput, { selection: { reasoning: 'low' } });
  assert.equal(result.data.question, '请选择歌曲'); assert.equal(generations, 2); assert.equal(counts, 2);
  assert.equal(result.execution.contextBudget.measuredInputTokens, 4000);
});

test('分词受模型开关、场景、策略版本和取消约束，取消不消耗生成额度', async () => {
  for (const mode of ['disabled', 'scene', 'policy', 'cancel']) {
    const control = createControlStore(), controller = new AbortController(); let count = 0;
    if (mode === 'disabled') control.update({ ...control.snapshot().policy, modelEnabled: false }, 1);
    if (mode === 'scene') control.update({ ...control.snapshot().policy, disabledScenes: ['assistant.plan'] }, 1);
    const gateway = createGateway({ control, provider: { planningContext: async () => capacity,
      async countContextTokens() { count++; if (mode === 'policy') control.update({ ...control.snapshot().policy, modelEnabled: false }, 1); else controller.abort(); return { inputTokens: 2000, contextLength: 12288 }; },
      generateObject() { assert.fail('不可生成'); } } });
    await assert.rejects(gateway.run('assistant.plan', modelInput, { signal: controller.signal }));
    assert.equal(count, ['disabled', 'scene'].includes(mode) ? 0 : 1);
    assert.equal(gateway.describe().usage.admitted, 0);
  }
});
