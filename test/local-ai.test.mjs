import test from 'node:test';
import assert from 'node:assert/strict';
import intent from '../js/alarm-intent.js';
import { interpret } from '../local-ai/alarm-service.mjs';
import { LMStudioProvider } from '../local-ai/provider.mjs';
import { createServer } from '../local-ai/server.mjs';
const context = { now: Date.parse('2026-09-12T23:55:20+08:00'), timeZone: 'Asia/Shanghai' };

test('截图中的指令解析为改名，保留逗号，允许定位过去时间，不生成新闹钟', () => {
  const result = intent.resolve(intent.parseLocal('2026-09-12 16:26 的闹钟名称修改为： 你好，闹钟'), context);
  assert.equal(result.intent, 'rename'); assert.equal(result.label, '你好，闹钟');
  assert.deepEqual(result.selector, { date: '2026-09-12', time: '16:26' });
  assert.equal(result.alarm, undefined);
  assert.throws(() => intent.resolve(intent.parseLocal('2026-02-30 16:26 的闹钟名称修改为：你好'), context), /日期/);
  assert.equal(intent.parseLocal('把我的闹钟取消').status, 'needs_clarification');
});

test('离线倒计时保持提交时刻的秒数，跨午夜', () => {
  const result = intent.resolve(intent.parseLocal('20分钟后提醒我休息'), context);
  assert.equal(result.alarm.fireAt, context.now + 1200000);
  assert.equal(result.alarm.date, '2026-09-13'); assert.equal(result.alarm.time, '00:15');
});
test('中文数字、半小时、明确日期与每日重复', () => {
  assert.equal(intent.parseLocal('半小时后提醒我取外卖').delayMinutes, 30);
  assert.equal(intent.parseLocal('二十五分钟后提醒我休息').delayMinutes, 25);
  assert.equal(intent.resolve(intent.parseLocal('明天下午三点半提醒我开会'), context).alarm.time, '15:30');
  assert.equal(intent.resolve(intent.parseLocal('每天早上九点提醒我喝水'), context).alarm.repeat, 'daily');
});
test('上午下午不明确、时间已过、缺少时间必须追问', () => {
  assert.equal(intent.parseLocal('明天七点叫我起床').status, 'needs_clarification');
  assert.equal(intent.parseLocal('明天晚上十二点提醒我休息').status, 'needs_clarification');
  assert.equal(intent.resolve(intent.parseLocal('今天下午三点提醒我开会'), context).status, 'needs_clarification');
  assert.equal(intent.resolve({ kind: 'once', label: '开会', dayOffset: 1 }, context).status, 'needs_clarification');
});
test('本地规则不吞掉复杂时间和多个提醒', () => {
  assert.equal(intent.parseLocal('明天下午三点提醒我开会，提前十分钟'), null);
  assert.equal(intent.parseLocal('明天下午三点提醒我开会然后再提醒我喝水'), null);
});
test('程序计算下周和提前提醒，重复提醒跨天调整星期', () => {
  const result = intent.resolve({ kind: 'once', label: '评审', hour: 14, minute: 0, weekday: 3, weekOffset: 1, advanceMinutes: 30 }, context);
  assert.equal(result.alarm.date, '2026-09-16'); assert.equal(result.alarm.time, '13:30');
  const weekly = intent.resolve({ kind: 'weekly', label: '准备', hour: 0, minute: 10, days: [1, 3, 5], advanceMinutes: 30 }, context);
  assert.deepEqual(weekly.alarm.days, [0, 2, 4]); assert.equal(weekly.alarm.time, '23:40');
});
test('拒绝不合法日期、时间、星期和冲突日期字段', () => {
  for (const raw of [
    { date: '2027-02-30' }, { dayOffset: 1, hour: 99 }, { dayOffset: 1, date: '2027-01-01' }, { weekday: 9, weekOffset: 0 }
  ]) assert.throws(() => intent.resolve({ kind: 'once', label: '开会', hour: 15, minute: 0, ...raw }, context));
  assert.throws(() => intent.resolve({ kind: 'weekly', label: '开会', hour: 15, minute: 0, days: [8] }, context));
});
test('时区独立于服务器，夏令时不存在或重复的时间拒绝自动创建', () => {
  assert.equal(intent.wallTime('2026-09-13', 15, 0, 'Asia/Shanghai'), Date.parse('2026-09-13T15:00:00+08:00'));
  assert.throws(() => intent.wallTime('2027-03-14', 2, 30, 'America/New_York'));
  assert.throws(() => intent.wallTime('2026-11-01', 1, 30, 'America/New_York'));
});
test('简单输入不调用模型；澄清带原始时间及上下文调用模型', async () => {
  let calls = 0;
  const provider = { model: 'fixture', async generateObject({ input }) { calls++; assert.equal(input.now, context.now); assert.equal(input.turns[0].content, '明天提醒我开会'); return { kind: 'once', label: '开会', dayOffset: 1, hour: 15, minute: 0 }; } };
  const local = await interpret({ ...context, text: '20分钟后提醒我休息' }, provider);
  assert.equal(local.source, 'rules'); assert.equal(calls, 0);
  const result = await interpret({ ...context, text: '下午三点', turns: [{ role: 'user', content: '明天提醒我开会' }] }, provider);
  assert.equal(calls, 1); assert.equal(result.alarm.time, '15:00');
});
test('推理失败不产生闹钟，输入边界先校验', async () => {
  const provider = { async generateObject() { throw new Error('模型离线'); } };
  await assert.rejects(interpret({ ...context, text: '明天提醒我开会' }, provider), /模型离线/);
  await assert.rejects(interpret({ ...context, text: 'a'.repeat(501) }, provider), /500/);
});
test('供应商只允许本机连接并限制同时推理', async () => {
  assert.throws(() => new LMStudioProvider({ baseUrl: 'https://example.com' }));
  const provider = new LMStudioProvider(); provider.busy = true;
  await assert.rejects(provider.generateObject({ instructions: '', input: {} }), /另一条请求/);
});
test('推理默认 off，按请求选择，不支持的等级拒绝发送，思考预算不挤掉 JSON', async () => {
  const provider = new LMStudioProvider();
  provider.models = async () => [{ id: provider.model, reasoningOptions: ['off', 'low', 'medium'] }];
  const sent = [];
  provider.request = async (path, body) => { sent.push(body); return { output: [{ type: 'message', content: '{"kind":"once"}' }] }; };
  await provider.generateObject({ instructions: 'test', input: {} });
  await provider.generateObject({ instructions: 'test', input: {}, reasoning: 'off' });
  await provider.generateObject({ instructions: 'test', input: {}, reasoning: 'medium' });
  assert.deepEqual(sent.map(body => body.reasoning), ['off', 'off', 'medium']);
  assert.ok(sent[2].max_output_tokens > sent[1].max_output_tokens);
  assert.equal(provider.reasoning, 'off');
  await assert.rejects(provider.generateObject({ instructions: '', input: {}, reasoning: 'xhigh' }), /不支持/);
  assert.equal(sent.length, 3); assert.equal(provider.busy, false);
});
test('等级经过闹钟接口传入供应商并在响应中回显；非法等级拒绝', async () => {
  let received;
  const provider = { model: 'fixture', reasoning: 'low', async generateObject({ reasoning }) { received = reasoning; return { status: 'needs_clarification', question: '几点？' }; } };
  const r = await interpret({ ...context, text: '明天提醒我开会', reasoning: 'medium' }, provider);
  assert.equal(received, 'medium'); assert.equal(r.reasoning, 'medium');
  await assert.rejects(interpret({ ...context, text: '明天提醒我开会', reasoning: 'invalid' }, provider), /等级无效/);
});
test('本地 HTTP 入口验证认证、来源、异步任务和模型状态', async t => {
  const token = 'a'.repeat(64);
  const provider = { model: 'fixture', models: async () => [{ id: 'fixture', loaded: false }] };
  const server = createServer({ token, provider });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/health')).status, 401);
  assert.equal((await fetch(base + '/health', { headers: { ...headers, Origin: 'https://example.com' } })).status, 403);
  assert.equal((await (await fetch(base + '/health', { headers })).json()).state, 'not_loaded');
  const created = await fetch(base + '/v1/alarms/interpret', { method: 'POST', headers, body: JSON.stringify({ ...context, text: '20分钟后提醒我休息' }) });
  assert.equal(created.status, 202);
  const pending = await created.json();
  const result = await (await fetch(base + `/v1/alarms/jobs/${pending.jobId}`, { headers })).json();
  assert.equal(result.status, 'ready'); assert.equal(result.alarm.fireAt, context.now + 1200000);
});
