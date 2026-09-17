const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/assistant-engine.js');
const Tools = require('../js/assistant-tools.js');

function fixture({ saveAlarm, prepare } = {}) {
  let clock = Date.parse('2026-09-17T08:21:00Z'), sequence = 0;
  const values = {}, aiCalls = [], saves = [], events = [];
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const alarm = { fireAt: clock + 40 * 60000, date: '2026-09-17', time: '17:01', label: '开会' };
  const storage = {
    async get() { return structuredClone(values); },
    async set(patch) { Object.assign(values, structuredClone(patch)); },
    async remove(key) { delete values[key]; }
  };
  const handlers = Tools.create({ storage, now: () => clock,
    ai: async request => {
      aiCalls.push(structuredClone(request));
      if (request.action === 'ai_scene_submit') return { ok: true, data: { steps: [{ tool: 'alarm.prepare', args: { text: request.input.text } }] } };
      assert.equal(request.action, 'smart_alarm_interpret');
      return { ok: true, status: 'ready', displayText: '2026-09-17 17:01 · 开会', timeZone: zone, alarm, ...prepare };
    },
    saveAlarm: async value => {
      saves.push(structuredClone(value));
      if (saveAlarm) return saveAlarm(value);
      await storage.set({ userAlarmsV1: [value] });
      return { alarm: value };
    }
  });
  const deps = { storage, ...handlers, now: () => clock, id: () => `task-${++sequence}`, history: async event => events.push(event) };
  const engine = Engine.create(deps);
  return { engine, deps, values, aiCalls, saves, events, alarm,
    advance(ms) { clock += ms; },
    async ready() { await engine.submit({ text: '40分钟之后提醒我开会' }); return engine.settled(); }
  };
}
const reply = (task, text = '创建吧', extra = {}) => ({ text, taskId: task.id, version: task.version, app: 'alarm', inheritedScope: true, ...extra });

test('创建吧复用当前确认卡调用保存，保持原时间、会话、用户原文及真实执行轨迹', async () => {
  const f = fixture(), before = await f.ready();
  assert.equal(before.status, 'review'); assert.equal(f.saves.length, 0);
  const calls = f.aiCalls.length;
  f.advance(60000);
  await f.engine.submit(reply(before)); const after = await f.engine.settled();
  assert.equal(after.status, 'completed'); assert.match(after.message, /已设置提醒/);
  assert.equal(f.aiCalls.length, calls, '确认不能重新调用模型或重算40分钟');
  assert.equal(f.saves.length, 1); assert.equal(f.saves[0].fireAt, f.alarm.fireAt);
  assert.equal(f.values.userAlarmsV1[0].id, `assistant_${before.id}`);
  assert.equal(after.id, before.id); assert.equal(after.conversationId, before.conversationId);
  assert.equal(after.messages.filter(row => row.role === 'user').at(-1).content, '创建吧');
  assert.ok(after.trace.some(row => row.tool === 'alarm.create' && row.status === 'succeeded'));
  assert.ok(after.trace.some(row => row.tool === 'service.saveAlarm' && row.status === 'succeeded'));
  assert.equal(after.choices.length, 0);
});

test('明确肯定的常见说法可以确认', async t => {
  for (const text of ['确认', '确认创建', '直接创建吧', '请创建', '帮我创建一下', '设置吧', '保存吧', '就这样创建吧', '就按这个创建', '好的', '可以', '行', ' 创建吧！ ']) {
    await t.test(text, async () => {
      const f = fixture(), task = await f.ready();
      await f.engine.submit(reply(task, text)); await f.engine.settled();
      assert.equal(f.saves.length, 1);
    });
  }
});

test('修改、否定、疑问和附带条件不提交当前草稿', async t => {
  for (const text of ['先别创建', '不要创建吧', '创建吧，改成明天', '好的，但是改成18点', '确认前改成18点', '创建吧？', '创建了吗', '可以吗', '如果没重复就创建吧']) {
    await t.test(text, async () => {
      const f = fixture(), task = await f.ready(), calls = f.aiCalls.length;
      await f.engine.submit(reply(task, text)); await f.engine.settled();
      assert.equal(f.saves.length, 0); assert.ok(f.aiCalls.length > calls);
    });
  }
});

test('新需求、切换应用、未补齐或多个候选不会使用旧确认卡', async t => {
  for (const scenario of ['new', 'scope', 'clarify', 'multiple', 'delete']) {
    await t.test(scenario, async () => {
      const f = fixture(), task = await f.ready();
      const saved = f.values[Engine.KEY];
      if (scenario === 'clarify') saved.status = 'clarify';
      if (scenario === 'multiple') saved.choices.push({ ...saved.choices[0], id: 'another' });
      if (scenario === 'delete') saved.choices[0].action = 'alarm.delete';
      const engine = Engine.create(f.deps);
      await engine.submit(reply(task, '创建吧', scenario === 'new' ? { newConversation: true } : scenario === 'scope' ? { app: 'music', inheritedScope: false } : {}));
      await engine.settled(); assert.equal(f.saves.length, 0);
    });
  }
});

test('版本失效、旧会话及过期卡片拒绝文字确认', async () => {
  const f = fixture(), task = await f.ready();
  await assert.rejects(f.engine.submit(reply(task, '创建吧', { version: task.version + 1 })), /页面已变化/);
  await assert.rejects(f.engine.submit(reply(task, '创建吧', { taskId: 'old' })), /过期/);
  f.advance(600001);
  await assert.rejects(f.engine.submit(reply(task)), /十分钟/);
  assert.equal(f.saves.length, 0);
});

test('已过去的提醒时间仍由保存前校验阻断', async () => {
  const f = fixture({ prepare: { alarm: { fireAt: 1 } } }), task = await f.ready();
  await f.engine.submit(reply(task)); const result = await f.engine.settled();
  assert.equal(result.status, 'failed'); assert.match(result.message, /时间已过/); assert.equal(f.saves.length, 0);
});

test('后台恢复后可以文字确认，文字与按钮并发只保存一次', async () => {
  const f = fixture(), task = await f.ready(), engine = Engine.create(f.deps);
  const results = await Promise.allSettled([engine.submit(reply(task)), engine.choose(task.id, 'confirm-alarm', task.version)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  const result = await engine.settled(); assert.equal(result.status, 'completed'); assert.equal(f.saves.length, 1);
  await assert.rejects(engine.submit(reply(task)));
  assert.equal(f.saves.length, 1);
});

test('保存失败或缺少回执不能显示创建成功', async t => {
  for (const saveAlarm of [async () => { throw new Error('保存失败'); }, async () => ({})]) {
    await t.test('保存失败', async () => {
      const f = fixture({ saveAlarm }), task = await f.ready();
      await f.engine.submit(reply(task)); const result = await f.engine.settled();
      assert.equal(result.status, 'failed'); assert.doesNotMatch(result.message, /已设置提醒/);
      assert.ok(result.trace.some(row => row.tool === 'alarm.create' && row.status === 'failed'));
    });
  }
});
