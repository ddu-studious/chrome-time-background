import test from 'node:test';
import assert from 'node:assert/strict';
import { compactHistory, COMPACTION_SDK } from '../local-ai/assistant-compaction.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { LMStudioProvider } from '../local-ai/provider.mjs';
import Context from '../js/assistant-context-state.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Contract from '../js/assistant-contract.js';
import { runContextScenario } from './fixtures/assistant-context-scenario.mjs';

const entries = () => Array.from({ length: 14 }, (_, i) => ({ seq: i + 1, role: i % 2 ? 'assistant' : 'user', content: `${i}：` + '已检索歌手候选，先不要播放，等待明确选择。'.repeat(12) }));
const request = () => ({ entries: entries(), revision: 14, force: true });
const provider = extra => ({ model: 'fixture', reasoning: 'off', planningContext: async () => ({ contextLength: 32768, contextSource: 'loaded-model' }),
  generateText: async () => ({ text: '## Goal\n选择歌手；先不要播放。\n## Progress\n候选已经检索，尚未执行播放。', usage: { inputTokens: 1200, outputTokens: 40 }, stopReason: 'stop' }), ...extra });
const task = () => ({ id: 'task', turnId: 'turn', input: { text: '继续' }, turns: [], log: [], startedAt: Date.now() });
function storage() { const values = {}; return { values, async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } }; }

test('真实 pi SDK 产生结构化及增量摘要提示词，旧摘要进入上游更新路径', async () => {
  let calls = 0;
  const p = provider({ generateText: async options => {
    calls++; assert.match(options.instructions, /summar/i); assert.match(options.input, /<conversation>/);
    assert.match(options.input, /<previous-summary>/); assert.match(options.input, /旧摘要：别播放/);
    assert.ok(options.contextBudget.estimatedInputTokens < options.contextBudget.inputBudget);
    return { text: '目标：选择歌手，不播放。已检索，待选择。', stopReason: 'stop' };
  } });
  const result = await compactHistory({ ...request(), summary: '旧摘要：别播放' }, p);
  assert.equal(calls, 1); assert.equal(result.data.sdk, COMPACTION_SDK);
  assert.equal(result.data.firstRetainedSeq, 14); assert.equal(result.data.throughSeq, 13);
  assert.equal(result.data.usage, null, '没有 usage 不冒充零用量');
});

test('pi SDK 拒绝截断摘要，项目拒绝空摘要和不收缩摘要', async () => {
  await assert.rejects(compactHistory(request(), provider({ generateText: async () => ({ text: '部分', stopReason: 'length' }) })), /incomplete/);
  await assert.rejects(compactHistory(request(), provider({ generateText: async () => ({ text: '' }) })), { code: 'COMPACTION_NO_GAIN' });
  await assert.rejects(compactHistory(request(), provider({ generateText: async () => ({ text: '大'.repeat(6001) }) })), { code: 'COMPACTION_NO_GAIN' });
});

test('摘要通过独立 Gateway 计费，off 思考、全局额度及取消仍生效', async () => {
  const control = createControlStore();
  control.update({ ...control.snapshot().policy, dailyRequestLimit: 1, maxOutputTokens: 800 }, 1);
  let count = 0;
  const gateway = createGateway({ control, provider: provider({ generateText: async options => {
    count++; assert.equal(options.reasoning, 'off'); assert.ok(options.maxOutputTokens <= 800);
    options.onUsage({ inputTokens: 1200, outputTokens: 50 });
    return { text: '已查询候选；尚未播放。', usage: { inputTokens: 1200, outputTokens: 50 } };
  } }) });
  const result = await gateway.run('assistant.compact', request(), { selection: { reasoning: 'low' } });
  assert.equal(result.execution.usage.inputTokens, 1200);
  assert.equal(result.execution.attempts.length, 1); assert.equal(result.execution.effectiveReasoning, 'off');
  assert.equal(gateway.describe().usage.admitted, 1);
  await assert.rejects(gateway.run('assistant.compact', request()), /今日/);
  assert.equal(count, 1);
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(gateway.run('assistant.compact', request(), { signal: aborted.signal }), { name: 'AbortError' });
});

test('关闭模型或摘要场景时不调用模型；deterministic 模式不会偷偷自研摘要', async () => {
  let calls = 0;
  const p = provider({ generateText: async () => { calls++; throw new Error('不得调用'); } });
  await assert.rejects(createGateway({ provider: p, modelEnabled: false }).run('assistant.compact', request()), /关闭/);
  await assert.rejects(createGateway({ provider: p, disabledScenes: ['assistant.compact'] }).run('assistant.compact', request()), /关闭/);
  const control = createControlStore(); control.update({ ...control.snapshot().policy, contextCompaction: 'deterministic' }, 1);
  const result = await createGateway({ provider: p, control }).run('assistant.compact', request());
  assert.equal(result.data.changed, false); assert.equal(calls, 0);
});

test('摘要自身过大在生成前停止；SDK 不自行重试错误', async () => {
  let count = 0;
  await assert.rejects(compactHistory(request(), provider({ planningContext: async () => ({ contextLength: 1024 }), generateText: async () => { count++; } })), { code: 'COMPACTION_SOURCE_LIMIT' });
  assert.equal(count, 0);
  await assert.rejects(compactHistory(request(), provider({ generateText: async () => { count++; throw Object.assign(new Error('terminated'), { code: 'MODEL_RESPONSE_TIMEOUT' }); } })), /terminated/);
  assert.equal(count, 1);
});

test('大工具结果外置后仍可回读中间命中，引用和版本不丢失', () => {
  const t = task(); Context.append(t, 'user', '查找中间命中，先别播放');
  const details = '甲'.repeat(9000) + '中间命中' + '乙'.repeat(9000);
  const value = Context.observe(t, { tool: 'music.state', status: 'done', message: '读取成功', data: { revision: 'real-version', selectedRef: 'r20', total: 100, nextRef: 'r21', details, headers: { Cookie: 'SECRET' } } });
  assert.equal(value.data.revision, 'real-version'); assert.equal(value.data.selectedRef, 'r20');
  assert.ok(JSON.stringify(value).length < 12000);
  let recovered = '', offset = 0;
  do { const result = Context.read(t, value.data.contextRef, offset); recovered += result.observation.excerpt; offset = result.observation.nextOffset; } while (offset != null);
  assert.match(recovered, /中间命中/); assert.doesNotMatch(recovered, /SECRET/);
  assert.deepEqual(Contract.validatePlan({ steps: [{ tool: 'context.read', args: { ref: value.data.contextRef, offset: 1600 } }] }, 'music').steps[0].args.offset, 1600);
  assert.throws(() => Context.read(task(), value.data.contextRef), { code: 'CONTEXT_REF_EXPIRED' });
});

test('检查点不覆盖用户原文和回执，重复压缩可回读，来源变化拒绝提交', async () => {
  const t = task(); for (const row of entries()) Context.append(t, row.role, row.content);
  Context.observe(t, { tool: 'music.queue.clear', status: 'done', message: '已清空', data: { revision: 'v2' } });
  const before = Context.envelope(t);
  for (let i = 0; i < 5; i++) {
    const req = Context.batch(t, true), result = await compactHistory(req, provider());
    assert.equal(Context.commit(t, req, result.data), true);
    Context.append(t, 'assistant', `检索过程${i}。` + '候选信息'.repeat(200));
  }
  assert.deepEqual(Context.envelope(t).constraints, before.constraints);
  assert.deepEqual(Context.envelope(t).receipts, before.receipts);
  assert.equal(Context.state(t).count, 5);
  const req = Context.batch(t, true), result = await compactHistory(req, provider());
  Context.append(t, 'user', '改成别的歌手');
  assert.throws(() => Context.commit(t, req, result.data), { code: 'COMPACTION_STALE' });
  assert.equal(Context.state(t).count, 5);
});

test('较早同文用户要求不会因当前输入去重而丢失', () => {
  const t = task(); t.input.text = '不要播放';
  Context.append(t, 'user', '不要播放'); Context.append(t, 'assistant', '好'); Context.append(t, 'user', '不要播放');
  assert.equal(Context.envelope(t).constraints.length, 1);
});

test('较小模型窗口分块整理，成功检查点只覆盖实际摘要来源', async () => {
  const body = { revision: 28, force: true, entries: Array.from({ length: 28 }, (_, i) => ({ seq: i + 1, role: i % 2 ? 'assistant' : 'user', content: '过程信息'.repeat(90) })) };
  const result = await compactHistory(body, provider({ planningContext: async () => ({ contextLength: 8192, maxOutputTokens: 800 }) }));
  assert.ok(result.data.throughSeq < 27);
  assert.equal(result.data.firstRetainedSeq, result.data.throughSeq + 1);
});

test('检查点持久化失败回滚摘要与成功提示', async () => {
  const t = task(); for (const row of entries()) Context.append(t, row.role, row.content);
  const handlers = Tools.create({ ai: async message => ({ ok: true, ...await compactHistory(message.input, provider()) }) });
  await assert.rejects(handlers.compact({ task: t, guard() {}, async saveContext() { throw new Error('disk full'); } }, true), /disk full/);
  assert.equal(t.contextState.checkpoint, null); assert.equal(t.contextState.count, 0);
  assert.equal(t.contextNotice, undefined);
});

test('执行器拒绝同一任务重复副作用；明确新需求仍可再次操作', async () => {
  const store = storage(); let effects = 0;
  const engine = Engine.create({ storage: store, plan: async () => ({ steps: [{ tool: 'music.queue.play', args: { expectedRevision: 'v1' } }], continue: true }),
    execute: async () => { effects++; return { message: '已播放', observation: { revision: 'v2' } }; }, choose: async () => {} });
  await engine.submit({ text: '播放当前队列', app: 'music' }); const first = await engine.settled();
  assert.equal(first.status, 'failed'); assert.match(first.message, /阻止重复/); assert.equal(effects, 1);
  await engine.submit({ text: '再播放一次', app: 'music', newConversation: true }); await engine.settled();
  assert.equal(effects, 2);
});

test('跨 continue 继承成功回执，独立新需求不继承旧上下文', async () => {
  const store = storage(), sent = [];
  const engine = Engine.create({ storage: store, plan: async (_input, ctx) => { sent.push(Context.envelope(ctx.task)); return { steps: [{ tool: 'music.state', args: {} }] }; }, execute: async () => ({ message: '已读状态' }), choose: async () => {} });
  await engine.submit({ text: '查询队列，先不要播放', app: 'music' }); let t = await engine.settled();
  await engine.submit({ text: '继续查询', app: 'music', mode: 'continue', taskId: t.id }); t = await engine.settled();
  assert.ok(sent[1].constraints.some(row => /不要播放/.test(row.text)));
  assert.equal(sent[1].receipts.length, 1);
  await engine.submit({ text: '新任务', app: 'music', newConversation: true }); await engine.settled();
  assert.equal(sent[2].receipts.length, 0);
});

test('重启时未完成副作用保留 unknown 回执，续接不得自动重放', async () => {
  const store = storage(), t = task();
  Object.assign(t, { status: 'running', version: 1, scope: 'music', choices: [], log: [{ tool: 'music.queue.play', status: 'running', key: 'pending-play' }] });
  Context.append(t, 'user', '播放当前队列');
  await store.set({ [Engine.KEY]: t });
  let effects = 0;
  const engine = Engine.create({ storage: store, plan: async () => ({ steps: [{ tool: 'music.queue.play', args: { expectedRevision: 'v2' } }] }), execute: async () => { effects++; return { message: '已播放' }; }, choose: async () => {} });
  const restored = await engine.snapshot(); assert.equal(restored.status, 'interrupted');
  assert.equal(store.values[Engine.KEY].contextState.receipts.at(-1).status, 'unknown');
  await engine.submit({ text: '继续', app: 'music', taskId: restored.id });
  const result = await engine.settled(); assert.equal(result.status, 'failed'); assert.match(result.message, /结果未确认/); assert.equal(effects, 0);
});

test('真实 SDK 压缩后的溢出恢复仅重试规划，清空/追加/播放各一次', async () => {
  let calls = 0, summaries = 0, overflow = false;
  const step = (tool, args = {}) => ({ steps: [{ tool, args }], continue: true });
  const result = await runContextScenario({ provider: provider({ generateText: async () => { summaries++; return { text: '用户要求清空队列后找杨和苏热门歌曲，追加并随机播放；清空已完成，不要重复清空。' }; }, generateObject: async ({ input: sent }) => {
    if (sent.planningPhase === 'outline') return { todoTips: [
      { text: '清空队列', source: 0, tool: 'music.queue.clear', args: {} },
      { text: '追加杨和苏热门歌曲', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
      { text: '随机起播', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }
    ] };
    const obs = sent.observations, revision = [...obs].reverse().find(row => row.data?.revision)?.data.revision;
    if (calls === 3 && !overflow) { overflow = true; throw Object.assign(new Error('capacity'), { code: 'MODEL_CONTEXT_WINDOW_EXCEEDED' }); }
    switch (calls++) {
      case 0: return step('music.state');
      case 1: return step('music.queue.clear', { expectedRevision: revision });
      case 2: return step('music.search', { kind: 'artist', query: '杨和苏' });
      case 3: assert.ok(sent.context.summary); return step('music.collection.get', { ref: obs.at(-1).data.selectedRef });
      case 4: return step('music.queue.apply', { ref: obs.at(-1).data.ref, mode: 'append', startPlayback: false, expectedRevision: revision });
      case 5: return step('music.queue.play', { mode: 'shuffle', expectedRevision: revision });
      case 6: return { done: true };
      default: assert.fail('重复规划');
    }
  } }) });
  assert.equal(result.passed, true, result.task.message); assert.equal(summaries, 1);
  assert.deepEqual(result.effects, { clears: 1, applies: 1, plays: 1, searches: 1 });
});

test('持续输入超限只进行一次压缩恢复，普通HTTP错误不会触发', async () => {
  for (const code of ['MODEL_CONTEXT_WINDOW_EXCEEDED', undefined]) {
    const t = task(); for (const row of entries()) Context.append(t, row.role, row.content);
    let plans = 0, summaries = 0;
    const gateway = createGateway({ provider: provider({ generateObject: async () => { plans++; throw Object.assign(new Error('provider error'), { code }); }, generateText: async () => { summaries++; return { text: '保留要求，尚未完成。' }; } }) });
    const handlers = Tools.create({ ai: async message => ({ ok: true, ...await gateway.run(message.scene, message.input) }) });
    await assert.rejects(handlers.plan({ text: '查询当前队列', app: 'music' }, { task: t, guard() {}, async saveContext() {} }), /provider error/);
    assert.equal(plans, code ? 2 : 1); assert.equal(summaries, code ? 1 : 0);
  }
});

test('取消期间晚到的摘要不得落盘或触发业务动作', async () => {
  let release, started;
  const start = new Promise(resolve => started = resolve), wait = new Promise(resolve => release = resolve);
  const store = storage();
  const handlers = Tools.create({ ai: async message => { started(); await wait; return { ok: true, ...await compactHistory(message.input, provider()) }; } });
  const engine = Engine.create({ storage: store, ...handlers, plan: async (_input, ctx) => { for (const row of entries()) Context.append(ctx.task, row.role, row.content); return { question: '等待用户' }; }, execute: async () => assert.fail('不能执行') });
  await engine.submit({ text: '等一下', app: 'music' }); const t = await engine.settled();
  const running = engine.compact(t.id); await start; await engine.cancel(t.id); release();
  await assert.rejects(running, { name: 'AbortError' });
  assert.equal((await engine.snapshot()).status, 'cancelled');
  assert.equal(store.values[Engine.KEY].contextState.checkpoint, null);
});

test('Provider 仅识别明确输入超限，摘要不允许工具调用或长度截断', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 'context_length_exceeded', message: 'too long' } }) });
    await assert.rejects(new LMStudioProvider().request('/api/v1/chat', {}), { code: 'MODEL_CONTEXT_WINDOW_EXCEEDED' });
    globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'invalid max_output_tokens' } }) });
    await assert.rejects(new LMStudioProvider().request('/api/v1/chat', {}), e => !e.code);
    const p = new LMStudioProvider(); p.models = async () => [{ id: p.model, loaded: true, loadedContextLength: 32768, reasoningOptions: ['off'] }];
    p.request = async () => ({ output: [{ type: 'tool_call' }], stats: {} });
    await assert.rejects(p.generateText({ instructions: 'summary', input: 'history' }), { code: 'MODEL_OUTPUT_FORMAT_INVALID' });
    p.request = async () => ({ output: [{ type: 'message', content: '摘要' }], stats: { input_tokens: 100, total_output_tokens: 64 } });
    const result = await p.generateText({ instructions: 'summary', input: 'history', maxOutputTokens: 64 });
    assert.equal(result.stopReason, 'length');
  } finally { globalThis.fetch = original; }
});
