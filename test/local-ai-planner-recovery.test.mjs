import test from 'node:test';
import assert from 'node:assert/strict';
import { LMStudioProvider } from '../local-ai/provider.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Todo from '../js/assistant-todo.js';

const input = { app: 'music', text: '首先清空播放列表，搜索杨和苏的热歌，添加到队列，随机播放。' };
const selection = { reasoning: 'medium' };
const plan = { steps: [{ tool: 'music.state', args: {} }], continue: true };
const answer = value => ({ output: [{ type: 'message', content: JSON.stringify(value) }], stats: { input_tokens: 2000, total_output_tokens: 50, reasoning_output_tokens: 0 } });
const reasoningOnly = { output: [{ type: 'reasoning', content: 'private reasoning must never be saved' }], stats: { input_tokens: 2132, total_output_tokens: 1199, reasoning_output_tokens: 1199 } };
function fixture(responses, policy = {}) {
  const sent = [], provider = new LMStudioProvider();
  provider.models = async () => [{ id: provider.model, loaded: true, loadedContextLength: 40960, reasoningOptions: ['off', 'medium', 'low'] }];
  provider.request = async (path, body, timeoutMs) => {
    sent.push({ ...body, timeoutMs });
    const value = responses.shift();
    if (typeof value === 'function') return value(body);
    if (value instanceof Error) throw value;
    assert.ok(value, 'unexpected extra attempt'); return value;
  };
  const control = createControlStore();
  control.update({ ...control.snapshot().policy, ...policy }, 1);
  const history = createHistoryStore();
  return { sent, provider, control, history, gateway: createGateway({ provider, control, history }) };
}

test('截图场景：思考耗尽后仅重试当前规划，预算、上下文和用量可审计', async () => {
  const f = fixture([reasoningOnly, answer(plan)], { maxOutputTokens: 1200 });
  const result = await f.gateway.run('assistant.plan', input, { selection });
  assert.deepEqual(result.data.steps, plan.steps);
  assert.deepEqual(f.sent.map(r => r.reasoning), ['medium', 'off']);
  assert.ok(f.sent[0].timeoutMs <= 30000);
  assert.ok(f.sent[1].timeoutMs <= 90000);
  assert.ok(f.sent.every(r => !Object.hasOwn(r, 'context_length')));
  assert.equal(JSON.parse(f.sent[1].input).reasoning, 'off');
  const calls = result.execution.attempts;
  assert.equal(calls[0].errorCode, 'MODEL_REASONING_BUDGET_EXHAUSTED');
  assert.equal(calls[1].retryReason, calls[0].errorCode);
  assert.equal(calls[0].contextLength, 40960);
  assert.equal(result.execution.reasoning, 'medium');
  assert.equal(result.execution.effectiveReasoning, 'off');
  assert.equal(result.execution.usageComplete, true);
  assert.deepEqual(result.execution.usage, { inputTokens: 4132, outputTokens: 1249, reasoningTokens: 1199 });
  assert.equal(f.gateway.describe().usage.admitted, 2);
  assert.equal(f.history.snapshot().calls[0].attempts.length, 2);
  assert.doesNotMatch(JSON.stringify(f.history.snapshot()), /private reasoning/);
  const snapshot = f.gateway.describe(); snapshot.records[0].attempts[0].status = 'tampered';
  assert.equal(f.gateway.describe().records[0].attempts[0].status, 'failed');
});

test('思考开启预算为4096，关闭为1200，继续遵守全局较小上限', async () => {
  for (const [reasoning, policy, expected] of [['medium', {}, 4096], ['off', {}, 1200], ['medium', { maxOutputTokens: 800 }, 800]]) {
    const f = fixture([answer(plan)], policy);
    await f.gateway.run('assistant.plan', input, { selection: { reasoning } });
    assert.equal(f.sent[0].max_output_tokens, expected);
    assert.equal(f.sent.length, 1);
  }
});

test('空正式消息加思考也能恢复；未耗尽额度使用准确错误码', async () => {
  const f = fixture([{ ...reasoningOnly, output: [...reasoningOnly.output, { type: 'message', content: '' }] }, answer(plan)]);
  const result = await f.gateway.run('assistant.plan', input, { selection });
  assert.equal(result.execution.attempts[0].errorCode, 'MODEL_NO_FINAL_OUTPUT');
});

test('思考尝试超时可关闭思考重试，未知用量不伪装成零', async () => {
  const f = fixture([Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' }), answer(plan)]);
  const result = await f.gateway.run('assistant.plan', input, { selection });
  assert.equal(result.execution.attempts.length, 2);
  assert.equal(result.execution.usageComplete, false);
  assert.equal(result.execution.attempts[0].usage, undefined);
  assert.equal(result.execution.usage.outputTokens, 50);
});

test('两次尝试共享截止时间，为重试预留60秒；总预算过期不再发请求', async t => {
  const start = Date.now();
  t.mock.method(Date, 'now', () => start);
  const f = fixture([() => { t.mock.method(Date, 'now', () => start + 30000); throw Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' }); }, answer(plan)]);
  await f.gateway.run('assistant.plan', input, { selection });
  assert.deepEqual(f.sent.map(r => r.timeoutMs), [30000, 60000]);
  const g = fixture([() => { t.mock.method(Date, 'now', () => start + 160000); throw Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' }); }]);
  await assert.rejects(g.gateway.run('assistant.plan', input, { selection }), { code: 'MODEL_RESPONSE_TIMEOUT' });
  assert.equal(g.sent.length, 1);
});

test('截图中的30秒输入处理加正式输出能够在恢复预算内完成', async t => {
  const start = Date.now(); t.mock.method(Date, 'now', () => start);
  const f = fixture([
    () => { t.mock.method(Date, 'now', () => start + 30000); throw Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' }); },
    () => {
      assert.ok(f.sent.at(-1).timeoutMs >= 35000, '恢复必须能容纳30秒输入处理及5秒计划输出');
      t.mock.method(Date, 'now', () => start + 65000); return answer(plan);
    }
  ]);
  const result = await f.gateway.run('assistant.plan', input, { selection });
  assert.equal(result.status, 'ready'); assert.equal(result.execution.elapsedMs, 65000);
  assert.equal(f.gateway.describe().usage.admitted, 2);
});

test('同一次执行成功降级后续用off，保留原选择、关联来源和实际输出预算', async () => {
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  const f = fixture([reasoningOnly, answer(plan), answer(plan), answer(plan)]);
  const first = await f.gateway.run('assistant.plan', input, { selection, trace });
  const next = await f.gateway.run('assistant.plan', input, { selection, trace });
  const last = await f.gateway.run('assistant.plan', input, { selection, trace });
  assert.deepEqual(f.sent.map(row => row.reasoning), ['medium', 'off', 'off', 'off']);
  assert.equal(next.execution.recoveryFromRequestId, first.requestId);
  assert.equal(last.execution.recoveryFromRequestId, next.requestId);
  assert.equal(next.execution.requestedReasoning, 'medium');
  assert.equal(next.execution.effectiveReasoning, 'off');
  assert.equal(next.execution.attempts.length, 1);
  assert.equal(next.execution.contextBudget.outputBudget, 1200);
  assert.equal(f.sent[2].max_output_tokens, 1200);
  assert.notEqual(JSON.parse(f.sent[2].input).reasoning, 'medium');
  assert.ok(f.sent[2].timeoutMs > 60000 && f.sent[2].timeoutMs <= 90000);
  assert.equal(f.history.snapshot().calls[1].recoveryFromRequestId, first.requestId);
  assert.equal(f.control.snapshot().policy.reasoning, 'off', '默认设置保持原值');
});

test('降级不跨执行轮、会话、模型、用户选择或控制策略，也不复用失败结果', async () => {
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  for (const change of ['turn', 'conversation', 'model', 'reasoning', 'policy', 'failed', 'unmanaged', 'missing-turn']) {
    const f = fixture([reasoningOnly, answer(plan), answer(plan)]);
    await f.gateway.run('assistant.plan', input, { selection, trace });
    const nextTrace = { ...trace }, nextSelection = { ...selection };
    if (change === 'turn') nextTrace.turnId = 'other';
    if (change === 'conversation') nextTrace.conversationId = 'other';
    if (change === 'unmanaged') nextTrace.userManaged = false;
    if (change === 'missing-turn') delete nextTrace.turnId;
    if (change === 'reasoning') nextSelection.reasoning = 'low';
    if (change === 'model') {
      nextSelection.model = 'other-model';
      f.provider.models = async () => [{ id: 'other-model', loaded: true, loadedContextLength: 40960, reasoningOptions: ['medium', 'off'] }];
    }
    if (change === 'policy') f.control.update({ ...f.control.snapshot().policy, maxOutputTokens: 3000 }, 2);
    if (change === 'failed') {
      f.provider.generateObject = async () => { throw new Error('connection failed'); };
      await assert.rejects(f.gateway.run('assistant.plan', input, { selection, trace }));
      delete f.provider.generateObject;
    }
    const result = await f.gateway.run('assistant.plan', input, { selection: nextSelection, trace: nextTrace });
    assert.equal(result.execution.recoveryFromRequestId, undefined, change);
    assert.equal(f.sent.at(-1).reasoning, nextSelection.reasoning, change);
  }
});

test('真实Engine与Tools逐轮传递恢复范围，读取后只清空一次并保留确认', async () => {
  const revision = 'fixture-revision';
  const clear = { steps: [{ tool: 'music.queue.clear', args: { expectedRevision: revision } }], continue: true };
  const f = fixture([reasoningOnly, answer({ todoTips: [{ text: '清空队列', source: 0, tool: 'music.queue.clear' }] }), answer(plan), answer(clear), answer({ done: true })]);
  const values = {}, effects = [];
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage,
    memory: async () => ({ ok: true, revision: 1, enabled: false, preferences: [] }),
    ai: async request => ({ ok: true, ...await f.gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }),
    readMusicState: async () => ({ status: 'ready', revision, count: 50, isPlaying: false }),
    editMusicQueue: async (action, songId, expectedRevision) => {
      assert.equal(action, 'clear'); assert.equal(expectedRevision, revision); effects.push(action);
      return { status: 'empty', revision: 'fixture-empty', count: 0, isPlaying: false };
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '清空队列', ai: selection });
  let task = await engine.settled();
  assert.equal(task.status, 'review'); assert.deepEqual(effects, []);
  await engine.choose(task.id, task.choices.find(c => c.id === 'queue-edit-confirm').id, task.version);
  task = await engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.deepEqual(effects, ['clear']);
  assert.deepEqual(f.sent.map(row => row.reasoning), ['medium', 'off', 'off', 'off', 'medium']);
  assert.equal(task.input.ai.reasoning, 'medium'); // 用户确认开始新执行轮，重新尊重所选等级。
});

test('无思考、普通格式错误、原生工具调用和连接错误均不自动重试', async () => {
  for (const [response, reasoning] of [
    [reasoningOnly, 'off'],
    [{ output: [{ type: 'message', content: 'not JSON' }] }, 'medium'],
    [{ output: [{ type: 'invalid_tool_call' }, ...answer(plan).output] }, 'medium'],
    [{ output: [{ type: 'tool_call' }, ...reasoningOnly.output] }, 'medium'],
    [new Error('connection failed'), 'medium']
  ]) {
    const f = fixture([response]);
    await assert.rejects(f.gateway.run('assistant.plan', input, { selection: { reasoning } }));
    assert.equal(f.sent.length, 1);
  }
});

test('第二次失败必须停止，错误码和两次元数据均保留', async () => {
  const f = fixture([reasoningOnly, reasoningOnly]);
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection }), e => {
    assert.equal(e.code, 'MODEL_REASONING_BUDGET_EXHAUSTED');
    assert.equal(e.execution.attempts.length, 2);
    return true;
  });
  assert.equal(f.sent.length, 2);
  assert.equal(f.gateway.describe().usage.scenes['assistant.plan'].failures, 2);
  assert.equal(f.gateway.describe().usage.scenes['assistant.plan'].consecutiveFailures, 1);
});

test('接近冷却阈值时首尝试超时仍可恢复，每次调用继续计预算和失败', async () => {
  const f = fixture([new Error('first failure'), new Error('second failure'), reasoningOnly, answer(plan)], { failureThreshold: 3 });
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection }));
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection }));
  const result = await f.gateway.run('assistant.plan', input, { selection });
  assert.equal(result.execution.attempts.length, 2);
  const usage = f.gateway.describe().usage;
  assert.equal(usage.admitted, 4); assert.equal(usage.scenes['assistant.plan'].failures, 3);
  assert.equal(usage.scenes['assistant.plan'].consecutiveFailures, 0);
});

test('真正连续三轮失败触发冷却，到期后首尝试失败不会再次堵住off恢复', async t => {
  const start = Date.now(); let now = start; t.mock.method(Date, 'now', () => now);
  const f = fixture([new Error('one'), new Error('two'), reasoningOnly, reasoningOnly, reasoningOnly, answer(plan)], { failureThreshold: 3, cooldownMs: 60000 });
  for (let i = 0; i < 3; i++) await assert.rejects(f.gateway.run('assistant.plan', input, { selection }));
  assert.equal(f.gateway.describe().usage.scenes['assistant.plan'].consecutiveFailures, 3);
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection }), /冷却/);
  assert.equal(f.sent.length, 4);
  now += 60001;
  assert.equal((await f.gateway.run('assistant.plan', input, { selection })).status, 'ready');
  assert.deepEqual(f.sent.slice(-2).map(r => r.reasoning), ['medium', 'off']);
  assert.equal(f.gateway.describe().usage.scenes['assistant.plan'].consecutiveFailures, 0);
});

test('取消、策略变更和当日预算限制均阻止恢复尝试', async () => {
  const controller = new AbortController();
  const f = fixture([() => { controller.abort(); return reasoningOnly; }]);
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection, signal: controller.signal }));
  assert.equal(f.sent.length, 1);
  const g = fixture([() => { g.control.update({ ...g.control.snapshot().policy, modelEnabled: false }, 2); return reasoningOnly; }]);
  await assert.rejects(g.gateway.run('assistant.plan', input, { selection }), /策略已更新/);
  assert.equal(g.sent.length, 1);
  const h = fixture([reasoningOnly], { dailyRequestLimit: 1 });
  await assert.rejects(h.gateway.run('assistant.plan', input, { selection }), /今日 AI 请求预算/);
  assert.equal(h.sent.length, 1);
});

test('恢复结果仍受工具合同约束，非法动作不能通过', async () => {
  const f = fixture([reasoningOnly, answer({ steps: [{ tool: 'shell', args: {} }] })]);
  await assert.rejects(f.gateway.run('assistant.plan', input, { selection }), /未接入/);
  assert.equal(f.sent.length, 2);
});

test('其他场景保持一次模型调用，不隐式关闭思考', async () => {
  const f = fixture([reasoningOnly]);
  await assert.rejects(f.gateway.run('alarm.interpret', { text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' }, { selection }));
  assert.equal(f.sent.length, 1);
});

test('未加载模型的上下文容纳规划输入和思考输出，已加载模型不覆盖', async () => {
  const f = fixture([answer(plan)]);
  f.provider.models = async () => [{ id: f.provider.model, loaded: false, reasoningOptions: ['medium'] }];
  await f.gateway.run('assistant.plan', input, { selection });
  assert.equal(f.sent[0].context_length, 12288);
  assert.ok(f.sent[0].context_length >= 6200 + f.sent[0].max_output_tokens);
});

test('引擎多轮恢复不重放前一轮动作，失败恢复后每个业务动作仅执行一次', async () => {
  const f = fixture([answer(plan), reasoningOnly, answer({ done: true })]);
  const values = {}, effects = [];
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const engine = Engine.create({ storage,
    plan: async (body, ctx) => (await f.gateway.run('assistant.plan', { ...body, observations: ctx.task.observations || [] }, { selection })).data,
    execute: async step => { effects.push(step.tool); return { message: '已读取真实状态', observation: { revision: 1 } }; }
  });
  await engine.submit(input);
  const result = await engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.deepEqual(effects, ['music.state']);
  assert.deepEqual(f.sent.map(r => r.reasoning), ['medium', 'medium', 'off']);
  assert.deepEqual(JSON.parse(f.sent[1].input).observations, JSON.parse(f.sent[2].input).observations);
});

test('Provider区分网络超时与用户取消，确保取消不会变成自动恢复', async t => {
  const provider = new LMStudioProvider();
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timed out', 'TimeoutError'); });
  await assert.rejects(provider.request('/api/v1/chat', {}), { code: 'MODEL_RESPONSE_TIMEOUT' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.request('/api/v1/chat', {}, 1000, controller.signal), e => e === controller.signal.reason);
});

const adaptive = { planningStrategy: 'adaptive' };
const receipt = [{ tool: 'music.state', status: 'done', message: '当前队列共3首。', data: { status: 'ready', revision: 'v1', count: 3 } }];
const withReceipts = { ...input, observations: receipt };

test('自适应起步：已有执行回执时直接关闭思考并拿到完整超时，所选等级和默认设置不变', async () => {
  const f = fixture([answer(plan)], adaptive);
  const result = await f.gateway.run('assistant.plan', withReceipts, { selection });
  assert.deepEqual(f.sent.map(row => row.reasoning), ['off']);
  assert.ok(f.sent[0].timeoutMs > 60000 && f.sent[0].timeoutMs <= 90000);
  assert.equal(f.sent[0].max_output_tokens, 1200);
  assert.equal(result.execution.requestedReasoning, 'medium');
  assert.equal(result.execution.effectiveReasoning, 'off');
  assert.equal(result.execution.startReason, 'adaptive-receipts');
  assert.equal(result.execution.recoveryFromRequestId, undefined);
  assert.equal(result.execution.attempts.length, 1);
  assert.equal(result.execution.attempts[0].startReason, 'adaptive-receipts');
  assert.equal(f.gateway.describe().usage.admitted, 1);
  assert.equal(f.history.snapshot().calls[0].startReason, 'adaptive-receipts');
  assert.equal(f.control.snapshot().policy.reasoning, 'off', '默认设置保持原值');
});

test('自适应起步只在有真实工具回执、非清单分析阶段且思考未关闭时生效', async () => {
  const outline = { ...input, todoTips: Todo.create(input), planningPhase: 'outline', observations: receipt };
  const cases = [
    ['默认 follow 仍按所选设置起步', {}, withReceipts, selection, 'medium'],
    ['没有执行回执', adaptive, input, selection, 'medium'],
    ['只有规划失败观察不算执行回执', adaptive, { ...input, observations: [{ tool: 'assistant.plan', status: 'failed', message: '计划格式无效', data: null }] }, selection, 'medium'],
    ['清单分析阶段', adaptive, outline, selection, 'medium'],
    ['所选思考已经是 off', adaptive, withReceipts, { reasoning: 'off' }, 'off']
  ];
  for (const [name, policy, body, chosen, expected] of cases) {
    const f = fixture([answer(plan)], policy);
    await f.gateway.run('assistant.plan', body, { selection: chosen }).catch(() => {});
    assert.equal(f.sent[0].reasoning, expected, name);
    assert.equal(f.history.snapshot().calls[0].startReason, undefined, name);
  }
});

test('自适应起步不是超时恢复：不会让后续无回执规划继续沿用 off，也不记为恢复来源', async () => {
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  const f = fixture([answer(plan), answer(plan), answer(plan)], adaptive);
  const first = await f.gateway.run('assistant.plan', withReceipts, { selection, trace });
  const second = await f.gateway.run('assistant.plan', withReceipts, { selection, trace });
  const third = await f.gateway.run('assistant.plan', input, { selection, trace });
  assert.deepEqual(f.sent.map(row => row.reasoning), ['off', 'off', 'medium']);
  assert.equal(first.execution.startReason, 'adaptive-receipts'); assert.equal(second.execution.startReason, 'adaptive-receipts');
  assert.equal(second.execution.recoveryFromRequestId, undefined);
  assert.equal(third.execution.recoveryFromRequestId, undefined);
  assert.equal(third.execution.startReason, undefined);
});

test('自适应起步失败不再重试，预算只计一次；真实超时恢复的来源仍照常记录', async () => {
  const f = fixture([Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' })], adaptive);
  await assert.rejects(f.gateway.run('assistant.plan', withReceipts, { selection }), { code: 'MODEL_RESPONSE_TIMEOUT' });
  assert.equal(f.sent.length, 1);
  assert.equal(f.gateway.describe().usage.admitted, 1);
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  const g = fixture([reasoningOnly, answer(plan), answer(plan)], adaptive);
  const first = await g.gateway.run('assistant.plan', input, { selection, trace });
  const next = await g.gateway.run('assistant.plan', withReceipts, { selection, trace });
  assert.deepEqual(g.sent.map(row => row.reasoning), ['medium', 'off', 'off']);
  assert.equal(next.execution.recoveryFromRequestId, first.requestId);
  assert.equal(next.execution.startReason, undefined, '真实恢复优先，不重复标记为自适应起步');
});

test('真实 Engine 与 Tools：首轮按所选等级，读取回执后的规划轮从 off 起步，用户确认后仍带回执起步', async () => {
  const revision = 'fixture-revision';
  const clear = { steps: [{ tool: 'music.queue.clear', args: { expectedRevision: revision } }], continue: true };
  const f = fixture([answer({ todoTips: [{ text: '清空队列', source: 0, tool: 'music.queue.clear' }] }), answer(plan), answer(clear), answer({ done: true })], adaptive);
  const values = {}, effects = [];
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage,
    memory: async () => ({ ok: true, revision: 1, enabled: false, preferences: [] }),
    ai: async request => ({ ok: true, ...await f.gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }),
    readMusicState: async () => ({ status: 'ready', revision, count: 50, isPlaying: false }),
    editMusicQueue: async (action, songId, expectedRevision) => {
      assert.equal(action, 'clear'); assert.equal(expectedRevision, revision); effects.push(action);
      return { status: 'empty', revision: 'fixture-empty', count: 0, isPlaying: false };
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '清空队列', ai: selection });
  let task = await engine.settled();
  assert.equal(task.status, 'review'); assert.deepEqual(effects, []);
  await engine.choose(task.id, task.choices.find(c => c.id === 'queue-edit-confirm').id, task.version);
  task = await engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.deepEqual(effects, ['clear']);
  assert.deepEqual(f.sent.map(row => row.reasoning), ['medium', 'medium', 'off', 'off']);
  assert.deepEqual(task.modelCalls.filter(call => call.scene === 'assistant.plan').map(call => call.startReason), [undefined, undefined, 'adaptive-receipts', 'adaptive-receipts']);
  assert.equal(task.input.ai.reasoning, 'medium');
});
