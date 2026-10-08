import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import { createServer } from '../local-ai/server.mjs';

function audioResult() {
  const b = Buffer.alloc(4844); b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24);
  b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(b.length - 44, 40);
  return { audio: b.toString('base64'), mimeType: 'audio/wav', sampleRate: 24000, durationSeconds: .1,
    provider: 'mlx-speech', model: 'appautomaton/step-audio-editx-8bit-mlx', revision: '3890eb13396c8bb791ff982987e9d3bbdecfab25', runtime: 'mlx-speech@0.5.2', voice: 'upstream-zh' };
}
function synthesis(run = async () => audioResult()) {
  return { describe: () => ({ configured: true, ...Object.fromEntries(Object.entries(audioResult()).filter(([key]) => !['audio', 'mimeType', 'sampleRate', 'durationSeconds'].includes(key))) }), synthesize: run };
}
function enable(control, changes = {}) { const state = control.snapshot(); return control.update({ ...state.policy, speechSynthesisEnabled: true, ...changes }, state.revision); }

test('旧策略默认关闭朗读；总开关、专属开关及场景禁用均阻止SDK调用', async () => {
  let calls = 0;
  const control = createControlStore();
  const gateway = createGateway({ provider: {}, control, synthesisProvider: synthesis(async () => { calls++; return audioResult(); }) });
  assert.equal(control.snapshot().policy.speechSynthesisEnabled, false);
  assert.equal(gateway.describe().scenes.find(s => s.id === 'speech.synthesize').modelEnabled, false);
  await assert.rejects(gateway.run('speech.synthesize', { text: '你好。' }), /关闭/);
  enable(control, { modelEnabled: false });
  await assert.rejects(gateway.run('speech.synthesize', { text: '你好。' }), /关闭/);
  enable(control, { modelEnabled: true, disabledScenes: ['speech.synthesize'] });
  await assert.rejects(gateway.run('speech.synthesize', { text: '你好。' }), /关闭/);
  assert.equal(calls, 0);
  assert.throws(() => enable(control, { speechSynthesisEnabled: 'true' }), /开关/);
});

test('合成使用独立真实模型、控制面时限和预算，音频不进入历史', async () => {
  const control = createControlStore(); enable(control, { timeoutMs: 8000, dailyRequestLimit: 1 });
  const history = createHistoryStore(); history.configure({ captureContent: true, retentionDays: 7 }, 1);
  let calls = 0;
  const gateway = createGateway({ provider: { model: 'text-only-model' }, control, history, synthesisProvider: synthesis(async (text, options) => {
    calls++; assert.equal(text, '你好。'); assert.equal(options.timeoutMs, 8000); return audioResult();
  }) });
  const result = await gateway.run('speech.synthesize', { text: '你好。' });
  assert.equal(result.status, 'ready'); assert.equal(result.execution.model, audioResult().model);
  assert.equal(result.execution.reasoning, null); assert.equal(result.execution.requestedModel, audioResult().model);
  assert.equal(result.execution.speech.durationSeconds, .1);
  assert.equal(gateway.describe().usage.admitted, 1);
  assert.ok(!JSON.stringify(history.snapshot()).includes(audioResult().audio));
  await assert.rejects(gateway.run('speech.synthesize', { text: '你好。' }), /预算/);
  assert.equal(calls, 1);
});

test('合成拒绝超长输入和不适用的模型选择；策略变化后拒绝迟到音频', async () => {
  const control = createControlStore(); enable(control);
  let finish, calls = 0;
  const gateway = createGateway({ provider: {}, control, synthesisProvider: synthesis(() => { calls++; return new Promise(resolve => { finish = resolve; }); }) });
  await assert.rejects(gateway.run('speech.synthesize', { text: '长'.repeat(301) }));
  await assert.rejects(gateway.run('speech.synthesize', { text: '你好' }, { selection: { model: 'some-other-model' } }), /不适用/);
  assert.equal(calls, 0);
  const pending = gateway.run('speech.synthesize', { text: '你好。' });
  enable(control, { speechSynthesisEnabled: false }); finish(audioResult());
  await assert.rejects(pending, /策略已更新/);
  assert.equal(gateway.describe().records.at(-1).status, 'failed');
});

async function api(t, options = {}) {
  const token = 'c'.repeat(64);
  const server = createServer({ token, provider: {}, synthesisProvider: synthesis(), ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, extraHeaders) => {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const state = (await request('/v1/control')).body;
  await request('/v1/control', { expectedRevision: state.revision, policy: { ...state.policy, speechSynthesisEnabled: true } });
  return request;
}

test('HTTP语音端点鉴权；取消会传递AbortSignal且迟到结果不能恢复音频', async t => {
  let finish, signal, calls = 0;
  const request = await api(t, { synthesisProvider: synthesis((text, options) => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); }) });
  assert.equal((await request('/v1/speech/synthesize', { text: '你好。' }, { Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await request('/v1/speech/synthesize', { text: '你好。' }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal(calls, 0);
  const job = (await request('/v1/speech/synthesize', { text: '你好。' })).body;
  assert.equal(job.status, 'pending');
  await request(`/v1/ai/jobs/${job.jobId}/cancel`, {});
  assert.equal(signal.aborted, true); finish(audioResult());
  const result = (await request(`/v1/ai/jobs/${job.jobId}`)).body;
  assert.equal(result.status, 'cancelled'); assert.equal(result.audio, undefined);
});

test('HTTP音频结果有界保留，过期后不能再次获取；策略更新使已生成结果失效', async t => {
  const request = await api(t, { speechRetentionMs: 150 });
  const job = (await request('/v1/speech/synthesize', { text: '你好。' })).body;
  assert.equal((await request(`/v1/ai/jobs/${job.jobId}`)).body.audio, audioResult().audio);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal((await request(`/v1/ai/jobs/${job.jobId}`)).status, 404);
  const next = (await request('/v1/speech/synthesize', { text: '再见。' })).body;
  const state = (await request('/v1/control')).body;
  await request('/v1/control', { expectedRevision: state.revision, policy: { ...state.policy, speechSynthesisEnabled: false } });
  const cancelled = (await request(`/v1/ai/jobs/${next.jobId}`)).body;
  assert.equal(cancelled.status, 'cancelled'); assert.equal(cancelled.audio, undefined);
});
