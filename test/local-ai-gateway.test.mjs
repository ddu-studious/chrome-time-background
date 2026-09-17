import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../local-ai/gateway.mjs';
import { createServer } from '../local-ai/server.mjs';

const input = { text: '明天提醒我开会', now: Date.parse('2026-09-12T10:00:00+08:00'), timeZone: 'Asia/Shanghai' };
test('未登记场景和非法输入不调用供应商；输入只保留场景允许的字段', async () => {
  let calls = 0;
  const gateway = createGateway({ provider: { model: 'fixture', async generateObject({ input: sent }) {
    calls++;
    assert.equal(sent.apiKey, undefined); assert.equal(sent.system_prompt, undefined);
    assert.deepEqual(sent.turns, [{ role: 'user', content: '几点' }]);
    return { status: 'needs_clarification', question: '几点提醒？' };
  } } });
  await assert.rejects(gateway.run('toString', input), /未登记/);
  await assert.rejects(gateway.run('alarm.interpret', { ...input, text: '' }));
  assert.equal(calls, 0);
  const result = await gateway.run('alarm.interpret', { ...input, apiKey: 'secret', system_prompt: 'override', turns: [{ role: 'user', content: '几点', secret: 'secret' }] });
  assert.equal(result.status, 'needs_clarification'); assert.match(result.requestId, /^[a-f0-9]{32}$/);
  assert.equal(calls, 1);
  assert.equal(result.execution.model, 'fixture'); assert.equal(result.execution.source, 'model');
  assert.equal(result.execution.requestId, result.requestId); assert.ok(Number.isFinite(result.execution.elapsedMs));
  assert.ok(!JSON.stringify(gateway.describe()).includes('secret'));
});
test('全局和场景模型开关同时约束调用，但不破坏离线规则', async () => {
  for (const policy of [{ modelEnabled: false }, { disabledScenes: ['alarm.interpret'] }]) {
    const gateway = createGateway({ ...policy, provider: { generateObject() { assert.fail('模型不应被调用'); } } });
    await assert.rejects(gateway.run('alarm.interpret', input), /已关闭/);
    assert.equal((await gateway.run('alarm.interpret', { ...input, text: '20分钟后提醒我休息' })).source, 'rules');
  }
});
test('非法模型结果被拦截；记录有界且不包含原始异常或正文', async () => {
  const gateway = createGateway({ provider: { async generateObject() { return { kind: 'once', label: '开会', hour: 99, minute: 0, dayOffset: 1 }; } } });
  await assert.rejects(gateway.run('alarm.interpret', input));
  for (let i = 0; i < 105; i++) await gateway.run('alarm.interpret', { ...input, text: '20分钟后提醒我休息' });
  const snapshot = gateway.describe();
  assert.equal(snapshot.records.length, 100);
  snapshot.records[0].status = 'tampered';
  assert.notEqual(gateway.describe().records[0].status, 'tampered');
  assert.ok(!JSON.stringify(snapshot).includes('开会'));
});
test('失败的模型调用仍返回当次实际模型元数据，不包含请求正文', async () => {
  const gateway = createGateway({ provider: { model:'failure-model', async generateObject() { throw new Error('fixture failure'); } } });
  await assert.rejects(gateway.run('alarm.interpret', input), error => {
    assert.equal(error.execution.model,'failure-model'); assert.equal(error.execution.status,'failed');
    assert.doesNotMatch(JSON.stringify(error.execution), /开会/); return true;
  });
});
test('统一接口与旧闹钟接口均通过策略门禁，控制记录需要鉴权', async t => {
  const token = 'a'.repeat(64);
  const server = createServer({ token, modelEnabled: false, provider: {} });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/v1/control')).status, 401);
  for (const [path, body] of [['/v1/alarms/interpret', input], ['/v1/ai/interpret', { scene: 'alarm.interpret', input }]]) {
    const submitted = await fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(submitted.status, 202);
    const { jobId } = await submitted.json();
    const result = await (await fetch(base + '/v1/ai/jobs/' + jobId, { headers })).json();
    assert.equal(result.ok, false); assert.match(result.error, /已关闭/);
  }
  const control = await (await fetch(base + '/v1/control', { headers })).json();
  assert.equal(control.records.length, 2); assert.equal(control.modelEnabled, false);
});
