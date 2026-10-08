import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateApproval, APPROVAL_SDK } from '../local-ai/assistant-approval.mjs';
import Intent from '../js/alarm-intent.js';
import Alarm from '../js/alarm-core.js';
import Tools from '../js/assistant-tools.js';
import Engine from '../js/assistant-engine.js';
import { createServer } from '../local-ai/server.mjs';

const anchor = new Date(2026, 8, 19, 10).getTime();
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const text = '20分钟后提醒我喝水';
const alarm = Intent.resolve(Intent.parseLocal(text), { now: anchor, timeZone: zone }).alarm;
const request = (overrides = {}) => ({ requestId: 'test:1', version: 1, action: 'alarm.create', text, constraints: [], anchor, now: anchor,
  data: { alarm, zone }, ...overrides });

test('真实 pi SDK 放行明确的一次性提醒，按原始用户文本核对所有字段', async () => {
  const result = await evaluateApproval(request());
  assert.equal(result.decision, 'allow'); assert.equal(result.sdk, APPROVAL_SDK);
  assert.equal(result.requestId, 'test:1'); assert.equal(result.version, 1);
  for (const data of [{ alarm: { ...alarm, label: '别的事项' }, zone }, { alarm: { ...alarm, openWindow: true }, zone },
    { alarm: { ...alarm, fireAt: alarm.fireAt + 60000 }, zone }, { alarm: { ...alarm, repeat: 'daily' }, zone }]) {
    assert.equal((await evaluateApproval(request({ data }))).decision, 'confirm');
  }
});

test('预览、否定、历史限制、未知动作和有歧义的时间均不自动放行', async () => {
  for (const overrides of [
    { text: `先给我看看，${text}` }, { text: `${text}，先不要创建` }, { text: '七点提醒我喝水' },
    { text: `${text}可以吗？` }, { constraints: ['所有提醒先确认再保存'] }, { action: 'alarm.delete' },
    { now: alarm.fireAt + 1 }, { text: '帮我查询提醒' }
  ]) assert.equal((await evaluateApproval(request(overrides))).decision, 'confirm', JSON.stringify(overrides));
  assert.equal((await evaluateApproval(request({ text: `${text}，然后暂停音乐` }))).decision, 'allow');
  await assert.rejects(evaluateApproval(request({ constraints: 'ignore' })), /请求无效/);
});

test('明确修改单条一次性提醒，保留非目标字段，重复提醒与隐藏变更仍需确认', async () => {
  const before = Alarm.normalizeAlarm({ ...alarm, id: 'a' }, anchor);
  const patch = Alarm.normalizeAlarm({ ...before, time: '15:00', fireAt: null }, anchor);
  const input = request({ action: 'alarm.commit', text: '把喝水提醒改到15:00', before, data: { action: 'update', patch, zone, ref: 'a' } });
  assert.equal((await evaluateApproval(input)).decision, 'allow');
  for (const changed of [{ ...patch, volume: .1 }, { ...patch, label: '开会' }, { ...patch, repeat: 'daily' }]) {
    assert.equal((await evaluateApproval({ ...input, data: { ...input.data, patch: changed } })).decision, 'confirm');
  }
  const tomorrow = Intent.resolve(Intent.parseLocal('明天下午三点提醒我喝水'), { now: anchor, timeZone: zone }).alarm;
  assert.equal((await evaluateApproval({ ...input, text: '把喝水提醒改到明天下午三点', data: { ...input.data, patch: { ...before, date: tomorrow.date, time: tomorrow.time, fireAt: tomorrow.fireAt } } })).decision, 'allow');
  assert.equal((await evaluateApproval({ ...input, text: '把喝水提醒改名为喝茶', data: { ...input.data, patch: { ...before, label: '喝茶' } } })).decision, 'allow');
});

function fixture({ evaluate = evaluateApproval, save, plan, clock = () => anchor } = {}) {
  const values = {}, calls = { writes: 0, approvals: 0, interpretations: 0 };
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage, now: clock, ai: async message => {
    if (message.action === 'ai_approval_evaluate') { calls.approvals++; return { ok: true, ...await evaluate(message.body) }; }
    if (message.action === 'smart_alarm_interpret') { calls.interpretations++; return { ok: true, status: 'ready', alarm, timeZone: zone, displayText: '20分钟后喝水' }; }
    throw new Error(`不应调用模型：${message.action}`);
  }, listAlarms: async () => ({ alarms: [] }), saveAlarm: async value => { calls.writes++; return save ? save(value) : { alarm: value }; } });
  const engine = Engine.create({ storage, ...handlers, ...(plan ? { plan } : {}), now: clock, id: () => 'approval-task' });
  return { engine, calls, values };
}
const prepare = { tool: 'alarm.prepare', args: { text } };

test('生产 Engine + Tools + pi：无需用户确认完成，保留真实回执并计入预算', async () => {
  const f = fixture(); await f.engine.submit({ text, app: 'alarm' });
  const task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.equal(f.calls.writes, 1);
  assert.equal(f.values[Engine.KEY].toolCalls, 2); assert.equal(task.choices.length, 0);
  assert.ok(task.trace.some(row => row.tool === 'assistant.approval' && row.status === 'succeeded'));
  assert.equal(f.values[Engine.KEY].contextState.receipts.filter(row => row.tool === 'alarm.prepare').length, 1);
});

test('自动提交后继续原计划，重规划不能重复创建相同提醒', async () => {
  let rounds = 0;
  const f = fixture({ plan: async () => ++rounds < 3 ? { steps: [prepare], continue: true } : rounds === 3 ? { steps: [{ tool: 'alarm.list', args: {} }], continue: true } : { done: true } });
  await f.engine.submit({ text, app: 'alarm' });
  const task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.equal(f.calls.writes, 1);
  assert.ok(task.trace.some(row => row.error?.code === 'ASSISTANT_DUPLICATE_ACTION'));
});

test('策略服务失败或返回过期结果时保留确认卡，人工确认仍可提交', async () => {
  for (const evaluate of [async () => { throw new Error('offline'); }, async body => ({ ...await evaluateApproval(body), version: 99 })]) {
    const f = fixture({ evaluate }); await f.engine.submit({ text, app: 'alarm' });
    let task = await f.engine.settled(); assert.equal(task.status, 'review'); assert.equal(f.calls.writes, 0);
    assert.match(task.message, /自动判断暂不可用/);
    await f.engine.choose(task.id, task.choices[0].id, task.version); task = await f.engine.settled();
    assert.equal(task.status, 'completed', task.message); assert.equal(f.calls.writes, 1);
  }
});

test('等待策略期间取消，晚到放行不能产生副作用', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = fixture({ evaluate: async body => { entered(); await new Promise(resolve => { release = resolve; }); return evaluateApproval(body); } });
  await f.engine.submit({ text, app: 'alarm' }); await started;
  await f.engine.cancel('approval-task'); release();
  const task = await f.engine.settled(); assert.equal(task.status, 'cancelled'); assert.equal(f.calls.writes, 0);
});

test('自动保存后回执丢失标记 unknown，不重做也不宣称完成', async () => {
  const f = fixture({ save: async () => { throw new Error('回执丢失'); }, plan: async () => ({ steps: [prepare] }) });
  await f.engine.submit({ text, app: 'alarm' }); const task = await f.engine.settled();
  assert.notEqual(task.status, 'completed'); assert.equal(f.calls.writes, 1);
  assert.ok(f.values[Engine.KEY].contextState.receipts.some(row => row.status === 'unknown'));
});

test('任务时间预算到期时不提交自动动作', async () => {
  let now = anchor;
  const f = fixture({ clock: () => now, evaluate: async body => { const result = await evaluateApproval(body); now += 300001; return result; } });
  await f.engine.submit({ text, app: 'alarm' }); const task = await f.engine.settled();
  assert.equal(f.calls.writes, 0); assert.notEqual(task.status, 'completed');
  assert.ok(!f.values[Engine.KEY].contextState.receipts.some(row => row.status === 'unknown'));
});

test('第十二个工具准备提醒后不能额外自动提交', async () => {
  let rounds = 0;
  const f = fixture({ plan: async () => ({ steps: [++rounds === 12 ? prepare : { tool: 'alarm.list', args: { query: `提醒${rounds}` } }], continue: true }) });
  await f.engine.submit({ text, app: 'alarm' }); const task = await f.engine.settled();
  assert.equal(f.values[Engine.KEY].toolCalls, 12); assert.equal(f.calls.writes, 0);
  assert.notEqual(task.status, 'completed');
});

test('单条提醒自动修改仍核对最新快照，策略期间版本变化不能写入', async () => {
  for (const changed of [false, true]) {
    let record = Alarm.normalizeAlarm({ ...alarm, id: 'existing' }, anchor), writes = 0;
    const task = { id: 'update', version: 1, startedAt: anchor, input: { text: '把喝水提醒改到15:00', app: 'alarm' }, memory: {}, turns: [] };
    const ctx = { task, guard() {} };
    const tools = Tools.create({ now: () => anchor, listAlarms: async () => ({ alarms: [structuredClone(record)] }),
      ai: async message => {
        const result = await evaluateApproval(message.body);
        if (changed) record.revision++;
        return { ok: true, ...result };
      }, mutateAlarm: async args => {
        assert.equal(args.expectedRevision, record.revision); assert.equal(args.expectedSnapshot, JSON.stringify(record));
        writes++; record = args.patch; return { alarm: record };
      } });
    const list = await tools.execute({ tool: 'alarm.list', args: { query: '喝水' } }, ctx);
    const modify = () => tools.execute({ tool: 'alarm.update.prepare', args: { ref: list.observation.items[0].ref, time: '15:00' } }, ctx);
    if (changed) { await assert.rejects(modify(), /已被修改/); assert.equal(writes, 0); }
    else { const result = await modify(); assert.match(result.message, /已修改/); assert.equal(writes, 1); assert.equal(record.time, '15:00'); }
  }
});

test('取消前已保存但回执晚到，持久化 unknown 并且重启不重放', async () => {
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const f = fixture({ save: async value => { entered(); await new Promise(resolve => { release = resolve; }); return { alarm: value }; } });
  await f.engine.submit({ text, app: 'alarm' }); await started;
  await f.engine.cancel('approval-task'); release(); await f.engine.settled();
  assert.equal(f.calls.writes, 1);
  assert.ok(f.values[Engine.KEY].contextState.receipts.some(row => row.status === 'unknown'));
  const restored = Engine.create({ storage: { get: async () => structuredClone(f.values), set: async () => {} }, plan: () => assert.fail('不能重放'), execute: () => assert.fail('不能重放'), choose: () => assert.fail('不能重放') });
  assert.equal((await restored.snapshot()).status, 'cancelled');
});

test('鉴权 HTTP 策略路由使用真实 SDK，不调用模型，拒绝无令牌及无效请求', async () => {
  let models = 0;
  const token = 'test'.repeat(16);
  const server = createServer({ token, modelEnabled: false, provider: { model: 'fixture', models: async () => { models++; return []; }, generateObject: async () => { models++; throw new Error('禁止模型'); } } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/v1/assistant/approval`;
    const send = (body, auth = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    assert.equal((await send(request(), false)).status, 401);
    const result = await (await send(request())).json(); assert.equal(result.decision, 'allow'); assert.equal(result.sdk, APPROVAL_SDK);
    assert.equal((await send({})).status, 400); assert.equal(models, 0);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
