const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/assistant-engine.js');
const Confirmation = require('../js/assistant-confirmation.js');
const Desktop = require('../js/alarm-desktop.js');
const native = require('./fixtures/native-desktop.js');
const step = { tool: 'music.intent', args: { text: '搜索歌手' } };
const choice = (id, extra = {}) => ({ id, title: id, label: '浏览歌手', kind: 'artist', action: 'music.browse', data: { private: true }, ...extra });
async function fixture(overrides = {}) {
  const values = {}; let count = 0, coordinator, opened = 0, writes = 0, clock = Date.now();
  const host = native(overrides.hostVersion || 4), desktop = new Desktop(host.runtime, async () => ({ ok: true }));
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const deps = { storage, now: () => clock, id: () => `i-${++count}`,
    onChange: task => coordinator?.sync(task), plan: async () => ({ steps: [step] }),
    execute: async () => ({ status: 'waiting', message: '需要选择哪位歌手', musicView: { kind: 'search' }, choices: [choice('歌手甲'), choice('林俊杰')] }),
    choose: async selected => { writes++; return { message: `已选择${selected.title}` }; }, ...overrides };
  const engine = Engine.create(deps);
  coordinator = Confirmation.create({ desktop, engine, now: () => clock, openWorkspace: async () => { opened++; } });
  await engine.submit({ app: 'music', text: '林俊杰' }); await engine.settled(); await coordinator.settled();
  return { engine, desktop, host, coordinator, values, deps, writes: () => writes, opened: () => opened,
    tick(ms) { clock += ms; },
    async event(action, extra = {}) {
      const task = await engine.snapshot();
      return { type: 'confirmationAction', confirmationId: task.interaction.id, taskId: task.id, version: task.version, actionId: `event-${++count}`, action, ...extra };
    },
    async click(action, extra) { const event = await this.event(action, extra); await desktop.handleConfirmationAction(host.port, event); await engine.settled(); await coordinator.settled(); return event; },
    close() { coordinator.dispose(); clearTimeout(desktop.idleTimer); host.port?.disconnect(); }
  };
}

test('真实 Engine 待选歌手投影所有候选，原生选择第二位且重复事件只执行一次', async () => {
  const f = await fixture();
  try {
    const card = f.host.sent.find(m => m.card)?.card;
    assert.equal(card.kind, 'select'); assert.deepEqual(card.choices.map(c => c.id), ['歌手甲', '林俊杰']);
    assert.ok(!JSON.stringify(card).includes('private'));
    const event = await f.click('select', { choiceId: '林俊杰' });
    assert.equal((await f.engine.snapshot()).status, 'completed'); assert.equal(f.writes(), 1);
    await f.desktop.handleConfirmationAction(f.host.port, event); assert.equal(f.writes(), 1);
    assert.equal(f.host.sent.at(-1).ok, true);
  } finally { f.close(); }
});

test('无候选追问有独立有效期，回答歌手名沿用会话', async () => {
  const f = await fixture({ plan: async () => ({ question: '需要哪位歌手？', steps: [] }) });
  try {
    const before = await f.engine.snapshot();
    assert.equal(before.interaction.kind, 'input'); assert.equal(before.memorySummary.expiresAt, undefined);
    assert.ok(Confirmation.card(before));
    await f.click('reply', { text: '林俊杰' });
    const after = await f.engine.snapshot();
    assert.equal(after.startMode, 'continue'); assert.equal(after.routeReason, '回答当前问题');
    assert.equal(after.conversationId, before.conversationId); assert.notEqual(after.id, before.id);
    assert.ok(after.messages.some(m => m.role === 'user' && m.content === '林俊杰'));
    assert.equal(f.writes(), 0);
    const restarted = Engine.create({ ...f.deps, onChange: () => {} });
    const restored = await restarted.snapshot(); assert.equal(restored.interaction.expiresAt, after.interaction.expiresAt);
    f.tick(600001);
    await assert.rejects(restarted.respond(restored.id, restored.version, { interaction: restored.interaction, action: 'reply', text: '继续' }), /失效/);
  } finally { f.close(); }
});

test('搜索页文字回答不会被普通路由当新搜索，保留会话历史', async () => {
  const f = await fixture();
  try {
    const before = await f.engine.snapshot();
    await f.click('reply', { text: '林俊杰本人' });
    const after = await f.engine.snapshot();
    assert.equal(after.startMode, 'continue'); assert.equal(after.conversationId, before.conversationId);
    assert.ok(after.messages.some(m => /需要选择/.test(m.content)));
    assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('工作台选择与原生回答并发只接受一次，旧问题不能取消新执行轮', async () => {
  const f = await fixture();
  try {
    const t = await f.engine.snapshot();
    const results = await Promise.allSettled([
      f.engine.choose(t.id, '林俊杰', t.version),
      f.engine.respond(t.id, t.version, { interaction: t.interaction, action: 'reply', text: '换一个' })
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    await f.engine.settled(); assert.equal(f.writes(), 1);
    await assert.rejects(f.engine.respond(t.id, t.version, { interaction: t.interaction, action: 'cancel' }), /失效/);
  } finally { f.close(); }
});

test('候选可翻页和返回，第二次等待更新卡片；未知候选不能执行', async () => {
  const f = await fixture({ choose: async c => ({ status: 'waiting', message: '第二页', choices: [choice('下一位'), choice('返回', { kind: 'navigation' })] }) });
  try {
    const old = await f.event('select', { choiceId: '林俊杰' });
    await f.desktop.handleConfirmationAction(f.host.port, old); await f.engine.settled(); await f.coordinator.settled();
    const card = f.host.sent.filter(m => m.card).at(-1).card;
    assert.deepEqual(card.choices.map(c => c.id), ['下一位', '返回']); assert.notEqual(card.id, old.confirmationId);
    await f.click('select', { choiceId: '伪造候选' });
    assert.equal(f.host.sent.filter(m => m.command === 'confirmationResult').at(-1).ok, false);
    assert.equal((await f.engine.snapshot()).status, 'waiting');
  } finally { f.close(); }
});

test('等待选择和待补充均可取消；隐藏保持任务和同版本隐藏状态', async () => {
  for (const clarify of [false, true]) {
    const f = await fixture(clarify ? { plan: async () => ({ question: '几点？', steps: [] }) } : {});
    try {
      const t = await f.engine.snapshot();
      f.host.emit({ type: 'confirmationHidden', confirmationId: t.interaction.id }); await f.coordinator.settled();
      await f.coordinator.sync(t); assert.equal(f.host.sent.filter(m => m.command === 'confirmation').at(-1).card, null);
      assert.equal((await f.engine.snapshot()).status, t.status);
      await f.engine.respond(t.id, t.version, { interaction: t.interaction, action: 'cancel' }); await f.coordinator.settled();
      assert.equal((await f.engine.snapshot()).status, 'cancelled'); assert.equal(f.writes(), 0);
    } finally { f.close(); }
  }
});

test('空白、超长回答和过期候选不能执行，失败仍保留输入机会', async () => {
  const f = await fixture();
  try {
    for (const text of [' ', 'a'.repeat(501)]) {
      await f.click('reply', { text });
      assert.equal(f.host.sent.filter(m => m.command === 'confirmationResult').at(-1).ok, false);
      assert.equal((await f.engine.snapshot()).status, 'waiting');
    }
    const t = await f.engine.snapshot(); f.tick(600001);
    assert.equal(Confirmation.card(t, f.deps.now()), null);
    await assert.rejects(f.engine.respond(t.id, t.version, { interaction: t.interaction, action: 'select', choiceId: '林俊杰' }), /失效/);
    assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('失败需要人工核对时只提供工作台入口，不把旧候选或输入作为重试', async () => {
  const f = await fixture({ execute: async () => { throw Object.assign(new Error('账号未连接'), { code: 'not-connected' }); } });
  try {
    const t = await f.engine.snapshot(), card = Confirmation.card(t);
    assert.equal(card.kind, 'inspect'); assert.equal(card.allowText, false); assert.deepEqual(card.choices, []);
    await assert.rejects(f.engine.respond(t.id, t.version, { interaction: t.interaction, action: 'reply', text: '重试' }), /不支持/);
    await f.click('open'); assert.equal(f.opened(), 1); assert.equal(f.writes(), 0);
    assert.equal((await f.engine.snapshot()).status, 'failed');
  } finally { f.close(); }
});

test('完成后保留浏览按钮不会弹窗；v3 组件不会把多候选误显示为单个确认', async () => {
  const f = await fixture({ hostVersion: 3 });
  try {
    const t = await f.engine.snapshot(); assert.match(f.coordinator.notice(), /更新桌面组件/);
    assert.equal(f.host.sent.some(m => m.card), false);
    assert.equal(Confirmation.card({ ...t, status: 'completed', interaction: null }), null);
    await f.engine.choose(t.id, '林俊杰', t.version); await f.engine.settled(); assert.equal(f.writes(), 1);
  } finally { f.close(); }
});

test('96条候选包含末尾与次要动作，不静默截掉用户目标', async () => {
  const f = await fixture({ execute: async () => ({ status: 'waiting', message: '全部候选', choices: Array.from({ length: 96 }, (_, i) => choice(String(i), { secondary: i % 2 === 1 })) }) });
  try {
    const t = await f.engine.snapshot(), card = Confirmation.card(t);
    assert.equal(card.choices.length, 96); assert.equal(card.choices.at(-1).id, '95');
    assert.ok(new TextEncoder().encode(JSON.stringify(card)).length < 240 * 1024);
    await f.click('select', { choiceId: '95' }); assert.equal(f.writes(), 1);
  } finally { f.close(); }
});

test('补充回答保留后续步骤、用户限制和模型设置，未选择前不执行播放', async () => {
  let seen;
  const f = await fixture({
    plan: async (input, ctx) => {
      if (input.text === '林俊杰') return { steps: [step, { tool: 'music.sleep', args: { minutes: 30 } }] };
      seen = { input, task: structuredClone(ctx.task) };
      return { question: '确认保留原来的停止时间？', steps: [] };
    },
    execute: async (_step, ctx) => {
      ctx.task.input.ai = { model: 'local-test', reasoning: 'low' };
      return { status: 'waiting', message: '先选择歌手，之后30分钟停止；不要替换队列', musicView: { kind: 'search' }, choices: [choice('甲'), choice('乙')] };
    }
  });
  try {
    await f.click('reply', { text: '林俊杰本人，不要替换队列' });
    assert.deepEqual(seen.input.ai, { model: 'local-test', reasoning: 'low' });
    assert.deepEqual(seen.task.remainingSteps, [{ tool: 'music.sleep', args: { minutes: 30 } }]);
    assert.ok(seen.task.turns.some(t => t.content.includes('不要替换队列')));
    assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('确认前输入修改要求重新规划；unknown 回执不能通过选择按钮重放', async () => {
  const f = await fixture({ execute: async () => ({ status: 'review', message: '确认播放？', choices: [choice('唯一')] }) });
  try {
    await f.click('reply', { text: '先不要播放，改成只浏览' }); assert.equal(f.writes(), 0);
    const t = await f.engine.snapshot();
    const stored = f.values[Engine.KEY];
    stored.contextState.receipts.push({ status: 'unknown', choiceId: '唯一' });
    const restarted = Engine.create({ ...f.deps, onChange: () => {} });
    const restored = await restarted.snapshot();
    await assert.rejects(restarted.respond(t.id, t.version, { interaction: restored.interaction, action: 'select', choiceId: '唯一' }), /上次结果未确认/);
    assert.equal(f.writes(), 0);
  } finally { f.close(); }
});
