import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import { createRemoteConfig, REMOTE_MODELS } from '../local-ai/remote-config.mjs';
import { RemoteProvider } from '../local-ai/remote-provider.mjs';
import { createModelRoute, sampleMachine, DEEPSEEK_SELECTION } from '../local-ai/model-routing.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createServer } from '../local-ai/server.mjs';
import { prepareModelContext } from '../local-ai/assistant-context.mjs';
import Todo from '../js/assistant-todo.js';
import Tools from '../js/assistant-tools.js';
import Engine from '../js/assistant-engine.js';

const canary = 'fixture-key-do-not-return';
const explanation = { text: '解释什么是闭包' };
const body = { ...explanation, todoTips: Todo.create(explanation), planningPhase: 'outline' };
const options = { instructions: '只返回 JSON', input: { text: '测试' }, timeoutMs: 3000, maxOutputTokens: 1200 };
test('机器采样要求两段持续高 CPU，瞬时尖峰不触发，取消会结束采样', async t => {
  let index = 0;
  t.mock.method(os, 'cpus', () => [{ times: [{ idle: 0, user: 0 }, { idle: 0, user: 100 }, { idle: 100, user: 100 }][Math.min(index++, 2)] }]);
  t.mock.method(os, 'freemem', () => 2000 * 1024 * 1024);
  assert.deepEqual(await sampleMachine(), { cpuPercent: 0, freeMemoryMb: 2000 });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(sampleMachine({ signal: controller.signal }), { name: 'AbortError' });
});
function config(values = {}) { const value = createRemoteConfig(); value.update({ mode: 'auto', apiKey: canary, ...values }, 1); return value; }
function sse(text = '{"answer":"外部回答"}', { finish = 'stop', tools = false, usage = true } = {}) {
  return new Response('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 0, model: 'deepseek-flash',
    choices: [{ index: 0, delta: tools ? { tool_calls: [{ index: 0, id: 'call1', type: 'function', function: { name: 'write', arguments: '{}' } }] } : { role: 'assistant', content: text }, finish_reason: finish }],
    ...(usage ? { usage: { prompt_tokens: 25, completion_tokens: 12, total_tokens: 37 } } : {}) }) + '\n\ndata: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
}
function fixture({ remote = config(), sample = { cpuPercent: 0, freeMemoryMb: 20000 }, localError, counted = 1000, length = 32768, remoteResult } = {}) {
  const counts = { local: 0, remote: 0, sample: 0 }, sent = [];
  const local = { model: 'local/model',
    async planningContext() { if (localError) throw localError; return { contextLength: length, contextSource: 'loaded-model' }; },
    async countContextTokens() { return { inputTokens: counted, contextLength: length }; },
    async generateObject(value) { counts.local++; sent.push(value); return { answer: '本地回答' }; } };
  const gateway = createGateway({ provider: local, remoteConfig: remote,
    sampleMachine: async () => { counts.sample++; return sample; },
    remoteFactory: settings => new RemoteProvider({ ...settings, fetchImpl: async (url, init) => {
      counts.remote++; sent.push(JSON.parse(init.body)); return remoteResult ? remoteResult() : sse();
    } }) });
  return { gateway, counts, local, remote, sent };
}

test('外部配置默认关闭，密钥不回显，私有持久化，冲突/未知目标/清除校验', t => {
  const dir = mkdtempSync(join(tmpdir(), 'remote-model-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'remote.json'), store = createRemoteConfig({ file });
  assert.equal(store.snapshot().mode, 'off'); assert.equal(store.snapshot().keyConfigured, false);
  assert.deepEqual(store.snapshot().models.map(model => model.id), ['deepseek-flash', 'deepseek-v4-pro']);
  const detached = store.snapshot(); detached.models[0].id = 'tampered';
  assert.equal(store.snapshot().models[0].id, REMOTE_MODELS[0].id);
  store.update({ mode: 'auto', apiKey: canary }, 1);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(createRemoteConfig({ file }).credentials().apiKey, canary);
  assert.doesNotMatch(JSON.stringify(store.snapshot()), /fixture-key/);
  assert.match(readFileSync(file, 'utf8'), /fixture-key/);
  assert.throws(() => store.update({ mode: 'off' }, 1), /已更新/);
  assert.throws(() => store.update({ baseUrl: 'https://evil.test' }, 2), /无效字段/);
  assert.throws(() => store.update({ provider: 'evil' }, 2), /模式无效/);
  assert.throws(() => store.update({ clearKey: true }, 2), /填写 API Key/);
  store.update({ apiKey: '', model: 'deepseek-v4-pro' }, 2);
  assert.equal(store.credentials().apiKey, canary);
  store.update({ mode: 'off', clearKey: true }, 3);
  assert.equal(store.snapshot().keyConfigured, false);
});

test('真实 pi SDK 请求：固定官方目标、关闭思考、JSON 合同、禁止重定向、实际 usage', async () => {
  let captured, usage;
  const provider = new RemoteProvider({ apiKey: canary, model: 'deepseek-flash', contextLength: 32768,
    fetchImpl: async (url, init) => { captured = { url, ...init, body: JSON.parse(init.body) }; return sse(); } });
  assert.deepEqual(await provider.generateObject({ ...options, onUsage: value => usage = value }), { answer: '外部回答' });
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured.redirect, 'error'); assert.equal(captured.body.model, 'deepseek-flash');
  assert.deepEqual(captured.body.thinking, { type: 'disabled' }); assert.deepEqual(captured.body.response_format, { type: 'json_object' });
  assert.equal(captured.body.max_tokens, 1200); assert.equal(captured.body.tools, undefined);
  assert.deepEqual(usage, { inputTokens: 25, outputTokens: 12 });
  const text = await provider.generateText(options); assert.equal(text.stopReason, 'stop');
  let outgoing = 0;
  const guarded = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => { outgoing++; return sse(); } });
  await assert.rejects(guarded.generateObject({ ...options, beforeRequest: () => { throw Object.assign(new Error('控制策略已更新'), { statusCode: 409 }); } }), { statusCode: 409 });
  assert.equal(outgoing, 0, 'SDK 延迟加载后、真正出站前仍须检查当前策略');
});

test('真实 SDK 对 429/401/500 不自行重试，错误不回显密钥/正文/供应商异常', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const provider = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => { calls++; return new Response(canary, { status }); } });
    await assert.rejects(provider.generateObject(options), error => error.code === 'REMOTE_REQUEST_FAILED' && !error.message.includes(canary));
    assert.equal(calls, 1);
  }
});

test('真实 SDK 未报告 usage 时保留未知；超时与超长响应有界失败', async () => {
  let usage;
  const provider = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => sse(undefined, { usage: false }) });
  await provider.generateObject({ ...options, onUsage: value => usage = value }); assert.equal(usage, undefined);
  const slow = new RemoteProvider({ ...config().credentials(), fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
  }) });
  const keepAlive = setInterval(() => {}, 50);
  try { await assert.rejects(slow.generateObject({ ...options, timeoutMs: 20 }), { code: 'MODEL_RESPONSE_TIMEOUT' }); }
  finally { clearInterval(keepAlive); }
  const long = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => sse('a'.repeat(2 * 1024 * 1024)) });
  await assert.rejects(long.generateObject(options));
});

test('真实 SDK 拒绝截断、空输出、工具调用和无效 JSON，不接受迟到或取消的结果', async () => {
  for (const reply of [() => sse('{}', { finish: 'length' }), () => sse(''), () => sse('', { tools: true }), () => sse('invalid')]) {
    const provider = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => reply() });
    await assert.rejects(provider.generateObject(options));
  }
  let entered, release;
  const started = new Promise(resolve => entered = resolve), controller = new AbortController();
  const provider = new RemoteProvider({ ...config().credentials(), fetchImpl: async () => { entered(); await new Promise(resolve => release = resolve); return sse(); } });
  const pending = provider.generateObject({ ...options, signal: controller.signal });
  await started; controller.abort(); release(); await assert.rejects(pending, { name: 'AbortError' });
});

test('兜底关闭不采样、不联网；资源充足沿用所选本地模型', async () => {
  const off = fixture({ remote: createRemoteConfig() });
  await off.gateway.run('assistant.plan', body);
  assert.deepEqual(off.counts, { local: 1, remote: 0, sample: 0 });
  const normal = fixture();
  const result = await normal.gateway.run('assistant.plan', body, { selection: { model: 'selected/local' } });
  assert.equal(normal.sent[0].model, 'selected/local'); assert.equal(result.execution.routing, undefined);
  assert.deepEqual(normal.counts, { local: 1, remote: 0, sample: 1 });
});

test('用户主动选择 DeepSeek 即使资源充足也直接走外部，不采样且不更改全局模式', async () => {
  const f = fixture(), before = f.remote.snapshot();
  const result = await f.gateway.run('assistant.plan', body, { selection: { model: DEEPSEEK_SELECTION, reasoning: 'high' } });
  assert.deepEqual(f.counts, { local: 0, remote: 1, sample: 0 });
  assert.equal(result.execution.routing.reason, 'manual'); assert.equal(result.execution.model, 'deepseek-flash');
  assert.equal(result.execution.requestedModel, DEEPSEEK_SELECTION); assert.equal(result.execution.reasoning, 'off');
  assert.deepEqual(f.remote.snapshot(), before);
});

for (const [selection, expected] of [['deepseek:flash', 'deepseek-flash'], ['deepseek:pro', 'deepseek-v4-pro']]) {
  test(`主动选择 ${selection} 使用实际指定模型，保留外部默认与密钥`, async () => {
    const f = fixture(), before = f.remote.snapshot();
    const result = await f.gateway.run('assistant.plan', body, { selection: { model: selection, reasoning: 'high' } });
    assert.deepEqual(f.counts, { local: 0, remote: 1, sample: 0 });
    assert.equal(f.sent[0].model, expected); assert.equal(result.execution.model, expected);
    assert.equal(result.execution.routing.model, expected); assert.equal(result.execution.reasoning, 'off');
    assert.deepEqual(f.remote.snapshot(), before); assert.equal(f.remote.credentials().apiKey, canary);
  });
}

test('配置为 Pro 后默认外部选择及自动兜底都使用 Pro，非法选项拒绝', async () => {
  for (const selection of [undefined, { model: DEEPSEEK_SELECTION }]) {
    const f = fixture({ remote: config({ model: 'deepseek-v4-pro' }), sample: { cpuPercent: 99, freeMemoryMb: 20000 } });
    const result = await f.gateway.run('assistant.plan', body, { selection });
    assert.equal(f.sent[0].model, 'deepseek-v4-pro'); assert.equal(result.execution.model, 'deepseek-v4-pro');
    assert.equal(result.execution.routing.reason, selection ? 'manual' : 'cpu');
  }
  const f = fixture();
  await assert.rejects(f.gateway.run('assistant.plan', body, { selection: { model: 'deepseek:arbitrary' } }), { code: 'REMOTE_MODEL_INVALID' });
  assert.deepEqual(f.counts, { local: 0, remote: 0, sample: 0 });
});

test('主动选择不能越过外部开关或把 DeepSeek 标识传给其他业务场景', async () => {
  for (const remote of [createRemoteConfig(), config({ mode: 'off' })]) for (const model of [DEEPSEEK_SELECTION, 'deepseek:flash', 'deepseek:pro']) {
      const f = fixture({ remote });
      await assert.rejects(f.gateway.run('assistant.plan', body, { selection: { model } }), { code: 'REMOTE_DISABLED' });
      assert.deepEqual(f.counts, { local: 0, remote: 0, sample: 0 });
    }
  const f = fixture();
  await assert.rejects(f.gateway.run('alarm.interpret', { text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' }, { selection: { model: DEEPSEEK_SELECTION } }), /仅适用于/);
  assert.deepEqual(f.counts, { local: 0, remote: 0, sample: 0 });
});

for (const [reason, values] of [
  ['cpu', { sample: { cpuPercent: 90, freeMemoryMb: 20000 } }],
  ['memory', { sample: { cpuPercent: 0, freeMemoryMb: 500 } }],
  ['manual', { remote: config({ mode: 'remote' }) }],
  ['local-unavailable', { localError: Object.assign(new Error('offline'), { code: 'MODEL_UNAVAILABLE' }) }],
  ['context', { counted: 8000, length: 8192 }]
]) test(`网关 ${reason} 路由使用真实 SDK，记录实际模型、用量、原因并计入预算`, async () => {
  const f = fixture(values), result = await f.gateway.run('assistant.plan', body, { selection: { reasoning: 'high' } });
  assert.equal(f.counts.local, 0); assert.equal(f.counts.remote, 1); assert.equal(result.data.answer, '外部回答');
  assert.equal(result.execution.routing.reason, reason); assert.equal(result.execution.model, 'deepseek-flash');
  assert.equal(result.execution.reasoning, 'off'); assert.equal(result.execution.attempts.length, 1);
  assert.equal(result.execution.contextBudget.measuredInputTokens, undefined);
  assert.equal(result.execution.contextBudget.tokenCountSource, 'remote-conservative-estimate');
  assert.equal(f.gateway.describe().usage.admitted, 1);
  assert.doesNotMatch(JSON.stringify(f.gateway.describe()), /fixture-key/);
});

test('容量不足也可显式禁止外发；分词 SDK 故障不会被当作容量不足', async () => {
  const f = fixture({ remote: config({ contextFallback: false }), counted: 8000, length: 8192 });
  await assert.rejects(f.gateway.run('assistant.plan', body), { code: 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED' });
  assert.equal(f.counts.remote, 0);
  const error = fixture(); error.local.countContextTokens = async () => { throw Object.assign(new Error('SDK fault'), { code: 'MODEL_TOKENIZATION_FAILED' }); };
  await assert.rejects(error.gateway.run('assistant.plan', body), { code: 'MODEL_TOKENIZATION_FAILED' });
  assert.equal(error.counts.remote, 0);
});

test('外部仍超预算时停止，保守估算不伪装成实际分词', async () => {
  const provider = new RemoteProvider(config().credentials());
  await assert.rejects(prepareModelContext({ instructions: '规则'.repeat(20000), input: '完整原文', contextLength: 32768, maxOutputTokens: 1200 }, provider), error => {
    assert.equal(error.contextBudget.measuredInputTokens, undefined);
    assert.equal(error.contextBudget.tokenCountSource, 'remote-conservative-estimate'); return error.code === 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED';
  });
});

test('全局/场景开关和每日预算在外部调用前生效，其他场景不外发', async () => {
  for (const policy of [{ modelEnabled: false }, { disabledScenes: ['assistant.plan'] }]) {
    const f = fixture({ remote: config({ mode: 'remote' }) });
    const control = createControlStore(); control.update({ ...control.snapshot().policy, ...policy }, 1);
    const gateway = createGateway({ provider: f.local, remoteConfig: f.remote, control, remoteFactory: () => { assert.fail('开关关闭不能构造外部模型'); } });
    await assert.rejects(gateway.run('assistant.plan', body)); assert.equal(f.counts.remote, 0);
  }
  const f = fixture({ remote: config({ mode: 'remote' }) });
  const control = createControlStore(); control.update({ ...control.snapshot().policy, dailyRequestLimit: 1 }, 1);
  const gateway = createGateway({ provider: f.local, remoteConfig: f.remote, control,
    remoteFactory: settings => new RemoteProvider({ ...settings, fetchImpl: async () => { f.counts.remote++; return sse(); } }) });
  await gateway.run('assistant.plan', body);
  await assert.rejects(gateway.run('assistant.plan', body), /预算/); assert.equal(f.counts.remote, 1);
  assert.equal(createModelRoute({ local: f.local, config: f.remote, scene: 'writing.assist' }), null);
});

test('配置更改或取消后迟到外部结果作废；供应商失败不回退重放业务', async () => {
  let release, entered;
  const start = new Promise(resolve => entered = resolve), store = config({ mode: 'remote' });
  const f = fixture({ remote: store, remoteResult: async () => { entered(); await new Promise(resolve => release = resolve); return sse(); } });
  const pending = f.gateway.run('assistant.plan', body); await start;
  store.update({ mode: 'off' }, store.snapshot().revision); release();
  await assert.rejects(pending, /控制策略已更新/);
  const failed = fixture({ remote: config({ mode: 'remote' }), remoteResult: () => new Response('{}', { status: 500 }) });
  await assert.rejects(failed.gateway.run('assistant.plan', body));
  assert.deepEqual(failed.counts, { local: 0, remote: 1, sample: 0 });
});

test('外部关闭思考的成功结果不会改变后续本地规划的思考设置', async () => {
  const resource = { cpuPercent: 99, freeMemoryMb: 20000 }, sent = [];
  const gateway = createGateway({ remoteConfig: config(), sampleMachine: async () => resource,
    provider: { model: 'local', planningContext: async () => ({ contextLength: 32768 }), countContextTokens: async () => ({ inputTokens: 1000, contextLength: 32768 }),
      generateObject: async value => { sent.push(value); return { question: '需要哪一首？' }; } },
    remoteFactory: settings => new RemoteProvider({ ...settings, fetchImpl: async () => sse('{"question":"需要哪一首？"}') }) });
  const trace = { userManaged: true, conversationId: 'routing:conversation', turnId: 'routing:turn' };
  await gateway.run('assistant.plan', { text: '比较两种数据库的适用场景' }, { trace, selection: { reasoning: 'high' } });
  resource.cpuPercent = 0;
  const result = await gateway.run('assistant.plan', { text: '比较两种数据库的适用场景' }, { trace, selection: { reasoning: 'high' } });
  assert.equal(sent[0].reasoning, 'high'); assert.equal(result.execution.recoveryFromRequestId, undefined);
});

test('外部摘要继续复用 pi 摘要 API、独立场景预算和结构化检查点', async () => {
  const gateway = createGateway({ remoteConfig: config({ mode: 'remote' }), provider: { model: 'local' },
    remoteFactory: settings => new RemoteProvider({ ...settings, fetchImpl: async () => sse('## 目标\n保留所有用户限制，已查询状态，等待用户确认。') }) });
  const result = await gateway.run('assistant.compact', { revision: 1, force: true, entries: [
    { seq: 1, role: 'user', content: '保留限制和已有回执。'.repeat(200) },
    { seq: 2, role: 'assistant', content: '已查询，尚未执行。'.repeat(200) },
    { seq: 3, role: 'user', content: '继续等待确认' }
  ] });
  assert.equal(result.data.changed, true); assert.equal(result.data.model, 'deepseek-flash');
  assert.equal(result.execution.routing.reason, 'manual'); assert.equal(gateway.describe().usage.admitted, 1);
});

test('真实 Engine + Tools + 外部 SDK：清空队列先确认，确认后只写一次', async () => {
  const revision = 'remote-fixture-revision', effects = [], values = {};
  const plans = [
    { todoTips: [{ text: '清空队列', source: 0, tool: 'music.queue.clear' }] },
    { steps: [{ tool: 'music.state', args: {} }], continue: true },
    { steps: [{ tool: 'music.queue.clear', args: { expectedRevision: revision } }], continue: true },
    { done: true }
  ];
  const gateway = createGateway({ provider: { model: 'local' }, remoteConfig: config({ mode: 'remote' }),
    remoteFactory: settings => new RemoteProvider({ ...settings, fetchImpl: async () => {
      assert.ok(plans.length, '禁止额外模型调用'); return sse(JSON.stringify(plans.shift()));
    } }) });
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const handlers = Tools.create({ storage, memory: async () => ({ ok: true, revision: 1, enabled: false, preferences: [] }),
    ai: async request => ({ ok: true, ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }),
    readMusicState: async () => ({ status: 'ready', revision, count: 50, isPlaying: false }),
    editMusicQueue: async (action, _song, expectedRevision) => { assert.equal(expectedRevision, revision); effects.push(action); return { status: 'empty', revision: 'remote-fixture-empty', count: 0, isPlaying: false }; }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '清空队列', ai: { reasoning: 'high' } });
  let task = await engine.settled();
  assert.equal(task.status, 'review', task.message); assert.deepEqual(effects, []);
  await engine.choose(task.id, task.choices.find(choice => choice.id === 'queue-edit-confirm').id, task.version);
  task = await engine.settled(); assert.equal(task.status, 'completed', task.message); assert.deepEqual(effects, ['clear']);
  assert.equal(plans.length, 0); assert.equal(gateway.describe().usage.admitted, 4);
  assert.ok(task.modelCalls.every(call => call.routing?.provider === 'deepseek'));
});

test('HTTP 外部配置复用鉴权、冲突检查、取消旧任务与密钥脱敏', async t => {
  const token = 'b'.repeat(64), store = createRemoteConfig();
  const server = createServer({ token, remoteConfig: store, provider: { model: 'local', models: async () => [] } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, value, auth = true) => fetch(base + path, { headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + token } : {}) },
    ...(value ? { method: 'POST', body: JSON.stringify(value) } : {}) });
  assert.equal((await request('/v1/control/remote', { config: { apiKey: canary }, expectedRevision: 1 }, false)).status, 401);
  const response = await request('/v1/control/remote', { config: { mode: 'auto', apiKey: canary }, expectedRevision: 1 });
  assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /fixture-key/);
  assert.equal((await request('/v1/control/remote', { config: { mode: 'off' }, expectedRevision: 1 })).status, 409);
  const job = await (await request('/v1/alarms/interpret', { text: '20分钟后提醒我休息', now: Date.now(), timeZone: 'Asia/Shanghai' })).json();
  assert.equal((await (await request(`/v1/ai/jobs/${job.jobId}`)).json()).status, 'ready');
  await request('/v1/control/remote', { config: { mode: 'off' }, expectedRevision: 2 });
  assert.equal((await (await request(`/v1/ai/jobs/${job.jobId}`)).json()).status, 'cancelled');
  await request('/v1/control/remote', { config: { mode: 'remote' }, expectedRevision: 3 });
  const health = await (await request('/health')).json(); assert.equal(health.state, 'remote_ready');
  assert.doesNotMatch(JSON.stringify(health), /fixture-key/);
});
