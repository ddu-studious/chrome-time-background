const test = require('node:test');
const assert = require('node:assert/strict');
const Confirmation = require('../js/assistant-confirmation.js');
const Desktop = require('../js/alarm-desktop.js');
const Engine = require('../js/assistant-engine.js');
const nativeDesktop = require('./fixtures/native-desktop.js');

function native(version = 4) {
  const host = nativeDesktop(version);
  const desktop = new Desktop(host.runtime, async () => ({ ok: true }));
  return { desktop, get port() { return host.port; }, ports: host.ports, sent: host.sent, emit: host.emit };
}
async function fixture({ hostVersion = 4, choose, stored } = {}) {
  const f = native(hostVersion), values = stored || {};
  let coordinator, writes = 0, seq = 0;
  const storage = { get: async () => structuredClone(values), set: async v => Object.assign(values, structuredClone(v)), remove: async key => { delete values[key]; } };
  const engine = Engine.create({ storage, id: () => `task-${++seq}`, onChange: t => coordinator?.sync(t),
    compact: async ctx => { ctx.task.contextNotice = '上下文已整理'; },
    plan: async () => ({ steps: [{ tool: 'alarm.prepare', args: { text: '提醒' } }] }),
    execute: async () => ({ status: 'review', message: '确认创建明天上午九点的提醒？', choices: [{ id: 'confirm', title: '明天09:00 · 开会', label: '确认创建', action: 'alarm.create', data: { private: 'must-not-leak' } }] }),
    choose: async () => { writes++; return choose ? choose() : { message: '已保存' }; } });
  coordinator = Confirmation.create({ desktop: f.desktop, engine });
  if (stored) await coordinator.sync(await engine.snapshot());
  else { await engine.submit({ text: '提醒我开会', app: 'alarm' }); await engine.settled(); await coordinator.settled(); }
  const task = await engine.snapshot();
  const action = extra => ({ type: 'confirmationAction', confirmationId: `${task.id}:${task.version}`, taskId: task.id, version: task.version, choiceId: 'confirm', action: 'confirm', actionId: 'native-click', ...extra });
  return { ...f, engine, coordinator, values, task, action, writes: () => writes,
    close() { coordinator.dispose(); clearTimeout(f.desktop.idleTimer); f.port.disconnect(); } };
}

test('只投影待确认卡，不导出业务参数，不把待选择候选弹成确认', () => {
  const task = { id: 't', version: 1, status: 'review', message: '待确认', choices: [{ id: 'c', title: '对象', data: { secret: true } }], memorySummary: { expiresAt: 2000 } };
  assert.equal(Confirmation.card({ ...task, status: 'waiting' }, 1000), null);
  assert.equal(Confirmation.card(task, 2000), null);
  assert.equal(Confirmation.card({ ...task, choices: [] }, 1000), null);
  assert.ok(!JSON.stringify(Confirmation.card(task, 1000)).includes('secret'));
});

test('外部确认复用 Engine，工作台同步完成，重复事件与双端点击仅执行一次', async () => {
  const f = await fixture();
  try {
    const card = f.sent.find(message => message.card)?.card;
    assert.equal(card.id, `${f.task.id}:${f.task.version}`); assert.ok(!JSON.stringify(card).includes('must-not-leak'));
    const event = f.action();
    await f.desktop.handleConfirmationAction(f.port, event);
    await f.desktop.handleConfirmationAction(f.port, event);
    await assert.rejects(f.engine.choose(f.task.id, 'confirm', f.task.version));
    const task = await f.engine.settled(); await f.coordinator.settled();
    assert.equal(task.status, 'completed'); assert.equal(f.writes(), 1);
    assert.equal(f.sent.filter(message => message.command === 'confirmation').at(-1).card, null);
  } finally { f.close(); }
});

test('工作台先确认时外部旧确认/取消不能改变运行中或已完成任务', async () => {
  let release;
  const f = await fixture({ choose: () => new Promise(resolve => { release = () => resolve({ message: '已保存' }); }) });
  try {
    await f.engine.choose(f.task.id, 'confirm', f.task.version);
    await f.coordinator.settled();
    await f.desktop.handleConfirmationAction(f.port, f.action({ action: 'cancel' }));
    assert.equal(f.sent.at(-1).ok, false);
    await assert.rejects(f.engine.cancel(f.task.id, f.task.version), /失效/);
    release(); assert.equal((await f.engine.settled()).status, 'completed'); assert.equal(f.writes(), 1);
  } finally { f.close(); }
});

test('外部取消使同一工作台任务取消；隐藏浮层只隐藏，不执行也不取消', async () => {
  const f = await fixture();
  try {
    f.emit({ type: 'confirmationHidden', confirmationId: 'old' }); assert.ok(f.desktop.confirmationId);
    f.emit({ type: 'confirmationHidden', confirmationId: `${f.task.id}:${f.task.version}` });
    await f.coordinator.settled(); assert.equal((await f.engine.snapshot()).status, 'review'); assert.equal(f.writes(), 0);
    await f.coordinator.sync(f.task); assert.equal(f.sent.filter(m => m.command === 'confirmation').at(-1).card, null);
    // A new version may display again; the old hidden version is not revived.
    const newer = { ...f.task, version: f.task.version + 1, interaction: { ...f.task.interaction, id: `${f.task.id}:${f.task.version + 1}`, version: f.task.version + 1 } };
    await f.coordinator.sync(newer); assert.equal(f.desktop.confirmationId, `${newer.id}:${newer.version}`);
  } finally { f.close(); }
  const g = await fixture();
  try {
    await g.desktop.handleConfirmationAction(g.port, g.action({ action: 'cancel' }));
    assert.equal((await g.engine.snapshot()).status, 'cancelled'); assert.equal(g.writes(), 0);
  } finally { g.close(); }
});

test('清理/替换任务收起外部卡，旧卡不能确认新任务', async () => {
  const f = await fixture();
  try {
    await f.engine.clear(); await f.coordinator.settled();
    assert.equal(f.sent.filter(m => m.command === 'confirmation').at(-1).card, null);
    await f.desktop.handleConfirmationAction(f.port, f.action()); assert.equal(f.writes(), 0);
    await f.engine.submit({ text: '另一项提醒', app: 'alarm' }); await f.engine.settled(); await f.coordinator.settled();
    await f.desktop.handleConfirmationAction(f.port, f.action({ actionId: 'other-click' })); assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('整理上下文后仍展示原操作详情，以新版本重开，旧卡不可确认', async () => {
  const f = await fixture();
  try {
    const next = await f.engine.compact(f.task.id); await f.coordinator.settled();
    assert.equal(next.status, 'review'); assert.equal(next.message, f.task.message); assert.ok(next.version > f.task.version);
    const card = f.sent.filter(m => m.command === 'confirmation').at(-1).card;
    assert.equal(card.message, f.task.message); assert.equal(card.version, next.version);
    await f.desktop.handleConfirmationAction(f.port, f.action()); assert.equal(f.writes(), 0);
  } finally { f.close(); }
});

test('旧桌面组件失败不影响工作台确认，重启从 Engine 快照恢复待确认状态', async () => {
  const f = await fixture({ hostVersion: 2 });
  let saved;
  try {
    assert.equal((await f.engine.snapshot()).status, 'review'); assert.match(f.coordinator.notice(), /更新桌面组件/);
    saved = structuredClone(f.values);
    await f.engine.choose(f.task.id, 'confirm', f.task.version); await f.engine.settled(); assert.equal(f.writes(), 1);
  } finally { f.close(); }
  const g = await fixture({ stored: saved });
  try { assert.ok(g.desktop.confirmationId); assert.equal(g.writes(), 0); } finally { g.close(); }
});

test('确认、倒计时和响铃共享连接，分别关闭不会断开其他仍活动的浮层', async () => {
  const f = await fixture();
  try {
    await f.desktop.setCountdown({ id: 'timer', title: '休息', fireAt: Date.now() + 10000 });
    await f.desktop.show({ id: 'ring', scheduledAt: Date.now(), occurrences: [{ label: '响铃' }] });
    await f.desktop.setConfirmation(null); assert.equal(f.desktop.idleTimer, null);
    await f.desktop.setConfirmation(Confirmation.card(f.task));
    f.desktop.hide('ring'); await f.desktop.setCountdown(null); assert.equal(f.desktop.idleTimer, null);
    assert.ok(f.desktop.confirmationId);
  } finally { f.close(); }
});

test('显示失败后退出待确认状态，即使空投影重复也立即清除旧提示', async () => {
  for (const status of ['completed', 'cancelled', 'running', 'waiting', null]) {
    let sends = 0;
    const desktop = { async setConfirmation(value) { sends++; if (value) throw new Error('Attempting to use a disconnected port object'); } };
    const coordinator = Confirmation.create({ desktop, engine: {} });
    const task = { id: 't', version: 1, status: 'review', choices: [{ id: 'confirm' }], memorySummary: { expiresAt: Date.now() + 60000 } };
    try {
      await coordinator.sync(null);
      await coordinator.sync(task); assert.match(coordinator.notice(), /disconnected port/);
      const sync = coordinator.sync(status ? { ...task, status } : null);
      assert.equal(coordinator.notice(), ''); await sync;
      assert.equal(coordinator.notice(), ''); assert.equal(sends, 2);
    } finally { coordinator.dispose(); }
  }
});

test('旧显示请求晚到失败不会给已完成或新版本任务添加错误提示', async () => {
  for (const replace of [false, true]) {
    let rejectOld;
    const desktop = { async setConfirmation(value) {
      if (value?.version === 1) return new Promise((_, reject) => { rejectOld = reject; });
    } };
    const coordinator = Confirmation.create({ desktop, engine: {} });
    const task = { id: 't', version: 1, status: 'review', choices: [{ id: 'confirm' }], memorySummary: { expiresAt: Date.now() + 60000 } };
    try {
      const old = coordinator.sync(task); await Promise.resolve();
      const next = coordinator.sync({ ...task, version: 2, status: replace ? 'review' : 'completed' });
      rejectOld(new Error('旧连接失败')); await old;
      assert.equal(coordinator.notice(), ''); await next;
      assert.equal(coordinator.notice(), '');
    } finally { coordinator.dispose(); }
  }
});

test('隐藏或过期的确认卡不再显示错误，重新同步有效卡可恢复桌面展示', async () => {
  let now = 1000, fail = true;
  const sent = [];
  const desktop = { async setConfirmation(value) { if (value && fail) throw new Error('连接失败'); sent.push(value); } };
  const coordinator = Confirmation.create({ desktop, engine: {}, now: () => now });
  const task = { id: 't', version: 1, status: 'review', choices: [{ id: 'confirm' }], memorySummary: { expiresAt: 10000 } };
  try {
    await coordinator.sync(task); assert.match(coordinator.notice(), /连接失败/);
    now = 10001; assert.equal(coordinator.notice(), '');
    const next = { ...task, version: 2, memorySummary: { expiresAt: 20000 } };
    await coordinator.sync(next); assert.match(coordinator.notice(), /连接失败/);
    desktop.onConfirmationHidden('t:2'); assert.equal(coordinator.notice(), ''); await coordinator.settled();
    fail = false; await coordinator.sync({ ...next, version: 3 });
    assert.equal(sent.at(-1).id, 't:3'); assert.equal(coordinator.notice(), '');
  } finally { coordinator.dispose(); }
});
