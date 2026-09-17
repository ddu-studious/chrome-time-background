import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createControlStore } from '../local-ai/control-store.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createServer } from '../local-ai/server.mjs';

test('策略原子持久化、重启恢复、冲突拒绝与回滚生成新版本', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-policy-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'control.json');
  const control = createControlStore({ file });
  control.update({ modelEnabled: false, disabledScenes: [] }, 1);
  assert.throws(() => control.update({ modelEnabled: true, disabledScenes: [] }, 1), /其他页面/);
  assert.throws(() => control.update({ modelEnabled: true, disabledScenes: ['unknown'] }, 2), /无效/);
  const restored = createControlStore({ file });
  assert.equal(restored.snapshot().policy.modelEnabled, false);
  assert.equal(restored.rollback(1, 2).revision, 3);
  assert.equal(createControlStore({ file }).snapshot().policy.modelEnabled, true);
});

const input = { text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' };
test('模型参数持久化校验且业务请求不能覆盖统一推理策略', async () => {
  const control = createControlStore();
  const policy = { ...control.snapshot().policy, model: 'test/model', reasoning: 'low', timeoutMs: 15000, maxOutputTokens: 800 };
  control.update(policy, 1);
  assert.throws(() => control.update({ ...policy, timeoutMs: 999999 }, 2), /超时/);
  assert.throws(() => control.update({ ...policy, maxOutputTokens: -1 }, 2), /预算/);
  let sent;
  const gateway = createGateway({ control, provider: { model: 'original', async generateObject(options) { sent = options; return { status: 'needs_clarification', question: '几点？' }; } } });
  const result = await gateway.run('alarm.interpret', { ...input, reasoning: 'xhigh' });
  assert.equal(sent.model, 'test/model'); assert.equal(sent.reasoning, 'low');
  assert.equal(sent.timeoutMs, 15000); assert.equal(sent.maxOutputTokens, 800);
  assert.equal(result.model, 'test/model'); assert.equal(result.reasoning, 'low');
});
test('快捷助手可通过独立受控字段覆盖本次模型和思考强度', async () => {
  let sent;
  const gateway=createGateway({provider:{model:'default/model',async generateObject(options){sent=options;return {status:'needs_clarification',question:'几点？'};}}});
  const result=await gateway.run('alarm.interpret',input,{selection:{model:'qwen/selected',reasoning:'high'}});
  assert.equal(sent.model,'qwen/selected');assert.equal(sent.reasoning,'high');assert.equal(result.execution.model,'qwen/selected');assert.equal(result.execution.reasoning,'high');
  await assert.rejects(gateway.run('alarm.interpret',input,{selection:{model:'https://evil.test'}}),/模型/);
  await assert.rejects(gateway.run('task.draft',{text:'写周报',today:'2026-09-16'},{selection:{reasoning:'low'}}),/不适用/);
});
test('等待中的模型返回遇到策略变更必须作废', async () => {
  let finish;
  const control = createControlStore();
  const gateway = createGateway({ control, provider: { generateObject() { return new Promise(resolve => { finish = resolve; }); } } });
  const pending = gateway.run('alarm.interpret', input);
  control.update({ modelEnabled: false, disabledScenes: [] }, 1);
  finish({ status: 'needs_clarification', question: '几点？' });
  await assert.rejects(pending, /策略已更新/);
});

test('HTTP 取消不会被迟到结果覆盖，策略更新撤销已生成的未消费结果', async t => {
  let finish;
  const token = 'b'.repeat(64);
  const server = createServer({ token, provider: { generateObject() { return new Promise(resolve => { finish = resolve; }); } } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const request = async (path, body) => (await fetch(base + path, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) })).json();
  const job = await request('/v1/ai/interpret', { scene: 'alarm.interpret', input });
  assert.equal((await request(`/v1/ai/jobs/${job.jobId}/cancel`, {})).status, 'cancelled');
  finish({ status: 'needs_clarification', question: '几点？' });
  assert.equal((await request(`/v1/ai/jobs/${job.jobId}`)).status, 'cancelled');
  const localJob = await request('/v1/alarms/interpret', { ...input, text: '20分钟后提醒我休息' });
  assert.equal((await request(`/v1/ai/jobs/${localJob.jobId}`)).status, 'ready');
  assert.equal((await request('/v1/control', { expectedRevision: 1, policy: { modelEnabled: false, disabledScenes: [] } })).revision, 2);
  assert.equal((await request(`/v1/ai/jobs/${localJob.jobId}`)).status, 'cancelled');
});
