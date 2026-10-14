import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import { createServer } from '../local-ai/server.mjs';
import { ComputeProvider } from '../local-ai/compute-provider.mjs';

const ENGINE = { name: 'quickjs-emscripten-core', version: '0.32.0', runtime: 'v25.9.0' };
const outcome = (output = { total: 10 }) => ({ output, outputBytes: Buffer.byteLength(JSON.stringify(output)), codeHash: 'a1b2c3d4e5f60718', inputDigest: '0f1e2d3c4b5a6978', elapsedMs: 12, engine: ENGINE });
const stub = (run = async () => outcome()) => ({ describe: () => ({ configured: true, localOnly: true, engine: ENGINE, running: 0 }), run });
const guestError = (code = 'COMPUTE_RUNTIME_ERROR') => Object.assign(new Error('代码运行出错：TypeError: x（第2行）'), { name: 'ComputeError', code, guest: true, statusCode: 422 });
const infraError = () => Object.assign(new Error('代码计算沙箱返回了无法识别的结果'), { name: 'ComputeError', code: 'COMPUTE_SANDBOX_FAILED', statusCode: 502 });
const enable = (control, changes = {}) => { const state = control.snapshot(); return control.update({ ...state.policy, computeEnabled: true, ...changes }, state.revision); };
const REQUEST = { code: 'return { total: input.values.reduce((a, b) => a + b, 0) };', input: { values: [1, 2, 3, 4] } };
const SCENE = 'assistant.compute';
const sceneRow = gateway => gateway.describe().scenes.find(scene => scene.id === SCENE);
const tick = (ms = 10) => new Promise(resolve => setTimeout(resolve, ms));

test('旧策略默认关闭代码计算；总开关、专属开关及场景禁用均阻止沙箱调用', async () => {
  let calls = 0;
  const control = createControlStore();
  const gateway = createGateway({ provider: {}, control, computeProvider: stub(async () => { calls++; return outcome(); }) });
  assert.equal(control.snapshot().policy.computeEnabled, false);
  assert.equal(sceneRow(gateway).modelEnabled, false);
  const disabled = error => error.statusCode === 403 && error.code === 'COMPUTE_DISABLED' && /关闭/.test(error.message);
  await assert.rejects(gateway.run(SCENE, REQUEST), disabled);
  enable(control, { modelEnabled: false });
  await assert.rejects(gateway.run(SCENE, REQUEST), disabled);
  enable(control, { modelEnabled: true, disabledScenes: [SCENE] });
  assert.equal(sceneRow(gateway).modelEnabled, false);
  await assert.rejects(gateway.run(SCENE, REQUEST), disabled);
  assert.equal(calls, 0);
  assert.throws(() => enable(control, { computeEnabled: 'true' }), /开关/);
  enable(control, { disabledScenes: [] });
  assert.equal(sceneRow(gateway).modelEnabled, true);
  assert.equal((await gateway.run(SCENE, REQUEST)).status, 'ready');
  assert.equal(calls, 1);
});

test('结果带有指纹与只读来源，且不暴露模型、思考或提示词', async () => {
  const control = createControlStore(); enable(control);
  const gateway = createGateway({ provider: { model: 'planner-model' }, control, computeProvider: stub() });
  const result = await gateway.run(SCENE, REQUEST);
  assert.equal(result.status, 'ready'); assert.equal(result.source, 'compute'); assert.deepEqual(result.output, { total: 10 });
  assert.equal(result.outputBytes, 12);
  assert.equal(result.execution.source, 'compute'); assert.equal(result.execution.model, null); assert.equal(result.execution.reasoning, null);
  assert.deepEqual(result.execution.compute, { engine: 'quickjs-emscripten-core@0.32.0', codeHash: 'a1b2c3d4e5f60718', inputDigest: '0f1e2d3c4b5a6978', outputBytes: 12, elapsedMs: 12 });
});

test('计算计入每日预算；代码错误不触发冷却，沙箱基础设施错误才触发冷却', async () => {
  const control = createControlStore(); enable(control, { failureThreshold: 1, cooldownMs: 60000, dailyRequestLimit: 10 });
  const behaviours = [() => { throw guestError(); }, () => { throw guestError('COMPUTE_TIMEOUT'); }, () => outcome(), () => { throw infraError(); }];
  let calls = 0;
  const gateway = createGateway({ provider: {}, control, computeProvider: stub(async () => behaviours[calls++]()) });
  await assert.rejects(gateway.run(SCENE, REQUEST), error => error.code === 'COMPUTE_RUNTIME_ERROR' && error.guest === true && error.execution.status === 'failed');
  await assert.rejects(gateway.run(SCENE, REQUEST), error => error.code === 'COMPUTE_TIMEOUT');
  assert.equal((await gateway.run(SCENE, REQUEST)).status, 'ready');
  await assert.rejects(gateway.run(SCENE, REQUEST), error => error.code === 'COMPUTE_SANDBOX_FAILED');
  await assert.rejects(gateway.run(SCENE, REQUEST), /冷却/);
  assert.equal(calls, 4, '冷却期间不应再启动沙箱');
  const row = gateway.describe().usage.scenes[SCENE];
  assert.equal(row.calls, 4); assert.equal(row.failures, 1); assert.equal(row.consecutiveFailures, 1);
  assert.equal(gateway.describe().usage.admitted, 4);
});

test('每日预算耗尽后不再启动沙箱', async () => {
  const control = createControlStore(); enable(control, { dailyRequestLimit: 2 });
  let calls = 0;
  const gateway = createGateway({ provider: {}, control, computeProvider: stub(async () => { calls++; return outcome(); }) });
  await gateway.run(SCENE, REQUEST); await gateway.run(SCENE, REQUEST);
  await assert.rejects(gateway.run(SCENE, REQUEST), /预算/);
  assert.equal(calls, 2);
});

test('运行记录只含指纹与元数据；历史正文仅在用户开启留存后才保存代码与输入', async () => {
  const secret = '独特歌手名-秘密-7731', marker = 'MARKER_CODE_5521';
  const control = createControlStore(); enable(control);
  const history = createHistoryStore();
  const gateway = createGateway({ provider: {}, control, history, computeProvider: stub(async () => outcome({ answer: secret })) });
  const body = { code: `return { who: input.who }; // ${marker}`, input: { who: secret } };
  const result = await gateway.run(SCENE, body);
  assert.deepEqual(result.output, { answer: secret });
  const stored = JSON.stringify({ records: gateway.describe().records, history: history.snapshot() });
  assert.ok(!stored.includes(secret) && !stored.includes(marker), '默认不得保存代码、输入或输出正文');
  assert.match(gateway.describe().records.at(-1).compute.codeHash, /^[a-f0-9]{16}$/);
  history.configure({ captureContent: true, retentionDays: 7 }, history.info().revision);
  await gateway.run(SCENE, body);
  assert.ok(JSON.stringify(history.snapshot()).includes(marker), '用户明确开启正文留存后才保存');
  assert.ok(!JSON.stringify(gateway.describe().records).includes(marker), '内存运行记录始终不含正文');
});

test('网关拒绝多余字段、空代码、超长数据和模型选择，且不启动沙箱', async () => {
  const control = createControlStore(); enable(control);
  let calls = 0;
  const gateway = createGateway({ provider: {}, control, computeProvider: stub(async () => { calls++; return outcome(); }) });
  const bodies = [{ code: '', input: {} }, { code: 'return 1', input: [] }, { code: 'return 1', input: {}, reasoning: 'high' }, { code: 'x'.repeat(4001), input: {} },
    { code: 'return 1', input: { big: 'x'.repeat(41000) } }, { code: 'return 1', input: { n: 10n } }, null, 'return 1', { input: {} }];
  for (const [index, body] of bodies.entries()) await assert.rejects(gateway.run(SCENE, body), error => [400, 413].includes(error.statusCode), `第 ${index + 1} 个非法请求`);
  await assert.rejects(gateway.run(SCENE, REQUEST, { selection: { model: 'other-model' } }), /不适用/);
  assert.equal(calls, 0);
});

test('取消把 AbortSignal 传给沙箱；策略变化后丢弃迟到结果', async () => {
  const control = createControlStore(); enable(control);
  let signal, finish;
  const gateway = createGateway({ provider: {}, control, computeProvider: stub((request, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); }) });
  const controller = new AbortController();
  const cancelled = gateway.run(SCENE, REQUEST, { signal: controller.signal });
  await tick();
  controller.abort(Object.assign(new Error('已取消'), { name: 'AbortError' }));
  finish(outcome());
  await assert.rejects(cancelled);
  assert.equal(signal.aborted, true);
  assert.equal(gateway.describe().records.at(-1).status, 'cancelled');
  const stale = gateway.run(SCENE, REQUEST);
  await tick();
  enable(control, { cooldownMs: 120000 });
  finish(outcome());
  await assert.rejects(stale, /策略已更新/);
  assert.equal(gateway.describe().records.at(-1).status, 'failed');
  const usage = gateway.describe().usage.scenes[SCENE];
  assert.equal(usage.failures, 1, '策略变化导致的丢弃按失败记账，取消不计失败');
});

test('描述接口给出沙箱状态与限额，不含路径或代码；未配置时明确说明', () => {
  const control = createControlStore();
  const described = createGateway({ provider: {}, control, computeProvider: new ComputeProvider() }).describe();
  assert.equal(described.compute.configured, true); assert.equal(described.compute.localOnly, true); assert.equal(described.compute.engine.version, '0.32.0');
  assert.equal(described.compute.limits.wallMs, 2000);
  assert.ok(!JSON.stringify(described.compute).includes('/Users/') && !JSON.stringify(described.compute).includes('node_modules'));
  assert.deepEqual(createGateway({ provider: {}, control }).describe().compute, { configured: false, localOnly: true });
  assert.equal(createGateway({ provider: {}, control, computeProvider: stub() }).describe().compute.engine.name, 'quickjs-emscripten-core');
});

test('未配置沙箱时，即使已开启开关也明确失败，而不是回退到别的执行方式', async () => {
  const control = createControlStore(); enable(control);
  const gateway = createGateway({ provider: {}, control });
  await assert.rejects(gateway.run(SCENE, REQUEST), error => error.statusCode === 503 && error.code === 'COMPUTE_UNCONFIGURED' && /沙箱/.test(error.message));
});

async function api(t, { enabled = true, ...options } = {}) {
  const token = 'c'.repeat(64);
  const server = createServer({ token, provider: {}, computeProvider: stub(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, extraHeaders) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const state = (await request('/v1/control')).body;
  if (enabled) await request('/v1/control', { expectedRevision: state.revision, policy: { ...state.policy, computeEnabled: true } });
  return request;
}
async function finished(request, jobId) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const { body } = await request(`/v1/ai/jobs/${jobId}`);
    if (body.status !== 'pending') return body;
    await tick(50);
  }
  assert.fail('作业没有在 6 秒内完成');
}
const submit = (request, input, extra = {}) => request('/v1/ai/interpret', { scene: SCENE, input, ...extra });

test('HTTP：默认关闭；鉴权、来源和请求体大小受保护', async t => {
  let calls = 0;
  const request = await api(t, { enabled: false, computeProvider: stub(async () => { calls++; return outcome(); }) });
  const job = (await submit(request, REQUEST)).body;
  assert.equal(job.status, 'pending');
  const refused = await finished(request, job.jobId);
  assert.equal(refused.ok, false); assert.match(refused.error, /关闭/);
  assert.equal((await request('/v1/ai/interpret', { scene: SCENE, input: REQUEST }, { Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await request('/v1/ai/interpret', { scene: SCENE, input: REQUEST }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await request('/v1/ai/interpret', { scene: SCENE, input: { code: 'return 1', input: { pad: 'x'.repeat(70000) } } })).status, 413);
  assert.equal(calls, 0);
});

test('HTTP：开启后真实沙箱经异步作业完成计算，代码错误以明确错误码返回', async t => {
  const request = await api(t, { computeProvider: new ComputeProvider({ limits: { wallMs: 500, killAfterMs: 1500 } }) });
  const done = await finished(request, (await submit(request, REQUEST)).body.jobId);
  assert.equal(done.ok, true); assert.equal(done.status, 'ready'); assert.deepEqual(done.output, { total: 10 }); assert.equal(done.source, 'compute');
  assert.equal(done.execution.compute.engine, 'quickjs-emscripten-core@0.32.0');
  const broken = await finished(request, (await submit(request, { code: 'return input.missing.value;', input: {} })).body.jobId);
  assert.equal(broken.ok, false); assert.equal(broken.code, 'COMPUTE_RUNTIME_ERROR'); assert.match(broken.error, /第1行/);
  const looping = await finished(request, (await submit(request, { code: 'while (true) {}', input: {} })).body.jobId);
  assert.equal(looping.ok, false); assert.equal(looping.code, 'COMPUTE_TIMEOUT');
  const again = await finished(request, (await submit(request, { code: 'return 2 + 2;', input: {} })).body.jobId);
  assert.equal(again.output, 4);
  const control = (await request('/v1/control')).body;
  assert.equal(control.compute.configured, true); assert.equal(control.policy.computeEnabled, true);
});

test('HTTP：取消作业会终止沙箱调用，迟到结果不能恢复', async t => {
  let finish, signal;
  const request = await api(t, { computeProvider: stub((body, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); }) });
  const job = (await submit(request, REQUEST)).body;
  await tick(30);
  await request(`/v1/ai/jobs/${job.jobId}/cancel`, {});
  assert.equal(signal.aborted, true); finish(outcome());
  const result = (await request(`/v1/ai/jobs/${job.jobId}`)).body;
  assert.equal(result.status, 'cancelled'); assert.equal(result.output, undefined);
});

test('HTTP：关闭开关会取消正在运行的计算作业', async t => {
  let finish;
  const request = await api(t, { computeProvider: stub(() => new Promise(resolve => { finish = resolve; })) });
  const job = (await submit(request, REQUEST)).body;
  await tick(30);
  const state = (await request('/v1/control')).body;
  await request('/v1/control', { expectedRevision: state.revision, policy: { ...state.policy, computeEnabled: false } });
  finish(outcome());
  const result = (await request(`/v1/ai/jobs/${job.jobId}`)).body;
  assert.equal(result.status, 'cancelled'); assert.equal(result.output, undefined);
});
