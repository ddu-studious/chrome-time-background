import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createServer } from '../local-ai/server.mjs';
import { LayaPrefetchProvider } from '../local-ai/laya-prefetch-provider.mjs';

const request = { app: 'music', text: '把队列里的第二首歌去掉' };
function fixture(mode, predict, policy = {}) {
  const control = createControlStore();
  control.update({ ...control.snapshot().policy, layaMode: mode, ...policy }, 1);
  const inputs = [];
  const gateway = createGateway({ control, layaProvider: { predict }, provider: {
    model: 'qwen/test',
    async generateObject({ input }) { inputs.push(input); return { question: '测试规划，不执行工具' }; }
  } });
  return { gateway, control, inputs };
}

test('Laya 开关默认关闭，旧策略恢复仍关闭，关闭时不触发推理', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laya-policy-'));
  try {
    const file = join(dir, 'control.json');
    const control = createControlStore({ file });
    assert.equal(control.snapshot().policy.layaMode, 'off');
    writeFileSync(join(dir, 'legacy.json'), JSON.stringify({ revision: 1, policy: { modelEnabled: true, disabledScenes: [] }, history: [] }));
    assert.equal(createControlStore({ file: join(dir, 'legacy.json') }).snapshot().policy.layaMode, 'off');
    control.update({ ...control.snapshot().policy, layaMode: 'assist' }, 1);
    assert.equal(createControlStore({ file }).snapshot().policy.layaMode, 'assist');
    assert.equal(control.rollback(1, 2).policy.layaMode, 'off');
    assert.throws(() => control.update({ ...control.snapshot().policy, layaMode: 'unsafe' }, 3), /Laya 模式/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const f = fixture('off', () => assert.fail('关闭时不应调用 Laya'));
  const result = await f.gateway.run('assistant.plan', request);
  assert.equal(result.execution.layaPrefetch.status, 'disabled');
  assert.deepEqual(f.inputs[0].toolGroups, ['music.edit']);
  assert.equal(f.gateway.describe().laya.usage.admitted, 0);
});

test('只观察保留原目录；参与模式只增加当前应用的已登记工具组', async () => {
  for (const mode of ['shadow', 'assist']) {
    const f = fixture(mode, async ({ groups, app }) => {
      assert.equal(app, 'music');
      assert.ok(groups.some(row => row.id === 'music.queue'));
      assert.ok(groups.every(row => row.id !== 'alarm.manage'));
      return ['music.queue', 'music.edit'];
    });
    const result = await f.gateway.run('assistant.plan', request);
    assert.deepEqual(f.inputs[0].toolGroups, mode === 'assist' ? ['music.edit', 'music.queue'] : ['music.edit']);
    assert.equal(result.execution.layaPrefetch.status, mode === 'assist' ? 'applied' : 'observed');
    assert.equal(f.gateway.describe().usage.admitted, 1);
    assert.equal(f.gateway.describe().laya.usage.admitted, 1);
  }
});

test('只观察不等待 Laya；过宽建议弃权并保留原规划目录', async () => {
  const shadow = fixture('shadow', () => new Promise(() => {}));
  const started = Date.now();
  const result = await shadow.gateway.run('assistant.plan', request);
  assert.equal(result.execution.layaPrefetch.status, 'observing');
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(shadow.inputs[0].toolGroups, ['music.edit']);

  const broad = fixture('assist', async () => ['music.playback', 'music.edit', 'music.queue']);
  const narrowed = await broad.gateway.run('assistant.plan', request);
  assert.equal(narrowed.execution.layaPrefetch.status, 'abstained');
  assert.deepEqual(broad.inputs[0].toolGroups, ['music.edit']);

  const separated = fixture('assist', async () => ['music.queue'], { dailyRequestLimit: 1 });
  await separated.gateway.run('assistant.plan', request);
  assert.equal(separated.gateway.describe().usage.admitted, 1);
  assert.equal(separated.gateway.describe().laya.usage.admitted, 1);
});

test('服务错误和目录外建议降级，Laya 预算与冷却不阻断 Qwen', async () => {
  let calls = 0;
  const f = fixture('assist', async () => { calls++; throw new Error('service down'); }, { failureThreshold: 2, dailyRequestLimit: 5 });
  for (let i = 0; i < 3; i++) {
    const result = await f.gateway.run('assistant.plan', request);
    assert.equal(result.execution.layaPrefetch.status, 'fallback');
    assert.deepEqual(f.inputs[i].toolGroups, ['music.edit']);
  }
  assert.equal(calls, 2);
  assert.equal(f.gateway.describe().usage.admitted, 3);
  assert.equal(f.gateway.describe().laya.usage.admitted, 2);
  assert.equal(f.gateway.describe().laya.usage.scenes['assistant.prefetch'].failures, 2);

  const invalid = fixture('assist', async () => ['alarm.manage']);
  const result = await invalid.gateway.run('assistant.plan', request);
  assert.equal(result.execution.layaPrefetch.code, 'LAYA_RESPONSE_INVALID');
  assert.deepEqual(invalid.inputs[0].toolGroups, ['music.edit']);
});

test('Laya 独立计数损坏时本机服务仍能启动，Qwen 仍可规划', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laya-usage-'));
  try {
    const usageFile = join(dir, 'usage.json');
    writeFileSync(`${usageFile}.laya`, '{broken');
    const server = createServer({ token: 'x'.repeat(64), usageFile, provider: { model: 'qwen/test', async generateObject() { return { question: '继续使用 Qwen' }; } } });
    assert.equal(server.listening, false);
    server.emit('close');

    const f = createGateway({
      control: (() => { const control = createControlStore(); control.update({ ...control.snapshot().policy, layaMode: 'assist' }, 1); return control; })(),
      layaProvider: { predict: () => assert.fail('计数损坏时不应调用 Laya') },
      layaAdmission: { describe: () => { throw new Error('broken'); }, start: () => { throw Object.assign(new Error('broken'), { code: 'LAYA_USAGE_UNAVAILABLE' }); }, finish: () => {} },
      provider: { model: 'qwen/test', async generateObject() { return { question: '继续使用 Qwen' }; } }
    });
    const result = await f.run('assistant.plan', request);
    assert.equal(result.execution.layaPrefetch.code, 'LAYA_USAGE_UNAVAILABLE');
    assert.equal(f.describe().laya.usage.error, 'Laya 使用记录不可用');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Laya 超时仅降级建议；用户取消和策略切换仍终止本轮规划', async () => {
  const slow = fixture('assist', () => new Promise(() => {}));
  const result = await slow.gateway.run('assistant.plan', request);
  assert.equal(result.execution.layaPrefetch.code, 'LAYA_TIMEOUT');
  assert.equal(slow.inputs.length, 1);

  const cancel = fixture('assist', ({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
  const controller = new AbortController();
  const pending = cancel.gateway.run('assistant.plan', request, { signal: controller.signal });
  controller.abort(new Error('cancelled'));
  await assert.rejects(pending);
  assert.equal(cancel.inputs.length, 0);

  let finish;
  const changed = fixture('assist', () => new Promise(resolve => { finish = resolve; }));
  const active = changed.gateway.run('assistant.plan', request);
  await new Promise(resolve => setImmediate(resolve));
  changed.control.update({ ...changed.control.snapshot().policy, layaMode: 'off' }, 2);
  finish(['music.queue']);
  await assert.rejects(active, /策略已更新/);
  assert.equal(changed.inputs.length, 0);
});

test('官方 HTTP 协议适配固定本机地址、固定检查点并校验完整选择结果', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'laya-token-'));
  try {
    const tokenFile = join(dir, 'token');
    writeFileSync(tokenFile, 'x'.repeat(64), { mode: 0o600 });
    let sent;
    const provider = new LayaPrefetchProvider({ tokenFile, fetchImpl: async (url, options) => {
      sent = { url, options };
      return new Response(JSON.stringify({ routing: { model: 'multilingual' }, answers: { g0: { choice: 'A' }, g1: { choice: 'B' } } }), { status: 200 });
    } });
    const groups = [{ id: 'music.queue', title: '读取播放队列' }, { id: 'music.edit', title: '编辑播放队列' }];
    assert.deepEqual(await provider.predict({ text: request.text, app: 'music', groups }), ['music.queue']);
    assert.equal(sent.url, 'http://127.0.0.1:19085/v1/systemone');
    assert.equal(sent.options.headers.Authorization, `Bearer ${'x'.repeat(64)}`);
    assert.equal(JSON.parse(sent.options.body).model, 'multilingual');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('修改和关闭已有提醒不走新建提醒规则', async () => {
  for (const text of ['把开会提醒延后十分钟', '把开会闹钟关掉']) {
    const f = fixture('off', () => assert.fail('关闭时不应调用 Laya'));
    const result = await f.gateway.run('assistant.plan', { app: 'alarm', text });
    assert.equal(result.source, 'model');
    assert.deepEqual(f.inputs[0].toolGroups, ['alarm.manage']);
  }
});
