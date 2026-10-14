import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import intent from '../js/alarm-intent.js';
import musicIntent from '../js/music-intent.js';

const TOKEN = 'a'.repeat(64);
const EXTENSION = `chrome-extension://${'a'.repeat(32)}/`;
const BODY = { code: 'return input.refs["context:3"].items.length;', input: { now: 1, today: '2026-10-12', utcOffsetMinutes: 480, refs: { 'context:3': { items: [1, 2] } } } };

function bridge(fetchImpl, { connected = true } = {}) {
  let listener;
  const values = connected ? { localAIConnectionV1: { token: TOKEN, reasoning: 'off' } } : {};
  const chrome = { runtime: { id: 'a'.repeat(32), getURL: () => EXTENSION, onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: { async get() { return values; }, async set(value) { Object.assign(values, value); } } } };
  const context = { chrome, AlarmIntent: intent, MusicIntent: musicIntent, fetch: fetchImpl, AbortSignal };
  vm.runInNewContext(readFileSync(new URL('../js/local-ai-client.js', import.meta.url), 'utf8'), context);
  return {
    // Worker-owned code calls the bridge object directly; pages can only use runtime messages.
    internal: message => context.LocalAIBridge.request(message),
    page: (message, url = `${EXTENSION}index.html`) => new Promise(resolve => {
      const returned = listener(message, { id: chrome.runtime.id, url }, resolve);
      if (!returned) resolve({ ignored: true });
    })
  };
}
const fetchOK = (seen, payload = { ok: true, status: 'pending', jobId: 'b'.repeat(32) }) => async (url, options) => { seen.push({ url, options }); return { ok: true, json: async () => payload }; };

test('ai_compute_submit 只发送固定场景、代码和输入，使用鉴权的本机接口且不跟随重定向', async () => {
  const seen = [];
  const b = bridge(fetchOK(seen));
  const trace = { conversationId: 'c1', turnId: 't1', toolCallId: 's1', startedAt: 1, userManaged: true };
  const result = await b.internal({ action: 'ai_compute_submit', input: BODY, trace });
  assert.deepEqual(result, { ok: true, status: 'pending', jobId: 'b'.repeat(32) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'http://127.0.0.1:19841/v1/ai/interpret');
  assert.equal(seen[0].options.method, 'POST'); assert.equal(seen[0].options.redirect, 'error');
  assert.equal(seen[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(seen[0].options.body), { scene: 'assistant.compute', input: BODY, trace });
});

test('页面不能通过扩展消息提交代码：该动作只对后台工具内部开放', async () => {
  const seen = [];
  const b = bridge(fetchOK(seen));
  const response = await b.page({ action: 'ai_compute_submit', input: BODY });
  assert.deepEqual(response, { ignored: true });
  assert.equal(seen.length, 0);
});

test('通用场景入口不接受 assistant.compute，轮询和取消沿用既有作业动作', async () => {
  const seen = [];
  const b = bridge(fetchOK(seen, { ok: true, status: 'pending' }));
  const refused = await b.page({ action: 'ai_scene_submit', scene: 'assistant.compute', input: BODY });
  assert.equal(refused.ok, false); assert.match(refused.error, /AI 场景或任务无效/);
  assert.equal(seen.length, 0);
  assert.equal((await b.page({ action: 'ai_scene_result', jobId: 'b'.repeat(32) })).ok, true);
  assert.equal(seen[0].url, `http://127.0.0.1:19841/v1/ai/jobs/${'b'.repeat(32)}`);
});

test('请求在联网前被拒绝：缺少连接令牌、结构不对、代码过长或夹带其他字段', async () => {
  const seen = [];
  await assert.rejects(bridge(fetchOK(seen), { connected: false }).internal({ action: 'ai_compute_submit', input: BODY }), /本地连接/);
  const b = bridge(fetchOK(seen));
  const invalid = [
    undefined, null, [], 'return 1;', {},
    { code: 'return 1;' }, { input: BODY.input },
    { code: '', input: BODY.input }, { code: 7, input: BODY.input },
    { code: 'x'.repeat(4001), input: BODY.input },
    { code: 'return 1;', input: [] }, { code: 'return 1;', input: 'x' }, { code: 'return 1;', input: null },
    { ...BODY, scene: 'assistant.plan' }, { ...BODY, selection: { model: 'other' } }
  ];
  for (const input of invalid) await assert.rejects(b.internal({ action: 'ai_compute_submit', input }), /代码计算请求无效/, JSON.stringify(input)?.slice(0, 60));
  assert.equal(seen.length, 0);
});

test('服务端拒绝时保留错误码和执行元数据，便于执行器区分“需要用户处理”和“需要改代码”', async () => {
  const b = bridge(async () => ({ ok: false, json: async () => ({ ok: false, error: '代码计算已关闭，请在 AI 控制台启用', code: 'COMPUTE_DISABLED', execution: { scene: 'assistant.compute', status: 'failed' } }) }));
  await assert.rejects(b.internal({ action: 'ai_compute_submit', input: BODY }), error => error.code === 'COMPUTE_DISABLED' && /关闭/.test(error.message) && error.execution.scene === 'assistant.compute');
});
