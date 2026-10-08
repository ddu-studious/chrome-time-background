const test = require('node:test');
const assert = require('node:assert/strict');
const Contract = require('../js/assistant-contract.js');
const Tools = require('../js/assistant-tools.js');
const Capture = require('../js/quick-capture.js');

function fixture(initial = {}) {
  const values = structuredClone(initial);
  let writes = 0, started = 0;
  const storage = {
    async get(key) { return { [key]: structuredClone(values[key]) }; },
    async set(patch) { writes++; Object.assign(values, structuredClone(patch)); }
  };
  const tools = Tools.create({ storage, now: () => Date.parse('2026-09-23T12:00:00+08:00') });
  const ctx = app => ({ task: { id: 'capture', version: 1, index: 0, input: { app }, memory: {} },
    guard() {}, async effectStarted() { started++; } });
  return { values, tools, ctx, get writes() { return writes; }, get started() { return started; } };
}

test('任务和日志应用菜单、严格参数与作用域', () => {
  assert.deepEqual(Contract.input({ text: '@任务 /添加任务 写接口文档' }), { text: '写接口文档', app: 'task', skill: 'task-add' });
  assert.equal(Contract.input({ text: '@工作日志 /添加工作日志 排查故障30分钟' }).app, 'worklog');
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'task.create', args: { title: '工作' } }] }, 'worklog'), /范围/);
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'task.create', args: { title: '工作', dueDate: '2026-02-30' } }] }, 'task'), /日期/);
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'worklog.create', args: { description: '排查', durationMinutes: 0 } }] }, 'worklog'), /耗时/);
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'worklog.create', args: { description: '排查', durationMinutes: 30, projectRef: 'proj_fake' } }] }, 'worklog'), /项目引用/);
  assert.throws(() => Contract.validatePlan({ steps: [
    { tool: 'worklog.projects', args: { query: '支付' } },
    { tool: 'worklog.create', args: { description: '排查', durationMinutes: 30, projectRef: 'r1' } }
  ] }, 'worklog'), /真实项目回执/);
});

test('快速新增复用 App 记录结构，写入回执和同一动作幂等', async () => {
  const f = fixture({ memos: [{ id: 'existing', title: '已有任务' }], worklogEntries: [] });
  const ctx = f.ctx('task');
  const step = { tool: 'task.create', args: { title: '整理接口文档', priority: 'high', dueDate: '2026-09-24' } };
  const first = await f.tools.execute(step, ctx);
  const second = await f.tools.execute(step, ctx);
  assert.equal(first.observation.created, true);
  assert.equal(second.observation.created, false);
  assert.equal(f.values.memos.length, 2);
  assert.equal(f.values.memos[0].priority, 'high');
  assert.equal(f.values.memos[0].completed, false);
  assert.equal(f.values.memos[1].id, 'existing');
  assert.equal(f.writes, 1);
  assert.equal(f.started, 1);

  const log = await f.tools.execute({ tool: 'worklog.create', args: { description: '排查接口超时', durationMinutes: 45 } }, f.ctx('worklog'));
  assert.equal(log.observation.created, true);
  assert.equal(f.values.worklogEntries[0].duration, 45);
  assert.equal(f.values.worklogEntries[0].projectId, 'proj_default');
  assert.equal(f.values.worklogEntries[0].date, '2026-09-23');
  assert.equal(f.started, 2);
});

test('项目只从真实列表引用，归档或伪造引用不写入', async () => {
  const f = fixture({ worklogProjects: [{ id: 'proj_default', name: '未分类' }, { id: 'p1', name: '支付项目' }], worklogEntries: [] });
  const ctx = f.ctx('worklog');
  await assert.rejects(f.tools.execute({ tool: 'worklog.create', args: { description: '排查', durationMinutes: 30, projectRef: 'r2' } }, ctx), /引用/);
  const list = await f.tools.execute({ tool: 'worklog.projects', args: { query: '支付' } }, ctx);
  assert.deepEqual(list.observation.projects.map(row => row.name), ['支付项目']);
  const ref = list.observation.projects[0].ref;
  f.values.worklogProjects[1].archived = true;
  await assert.rejects(f.tools.execute({ tool: 'worklog.create', args: { description: '排查', durationMinutes: 30, projectRef: ref } }, ctx), /变更/);
  assert.equal(f.writes, 0);
});

test('首次使用工作日志时，未分类项目引用仍可保存', async () => {
  const f = fixture({ worklogEntries: [] });
  const ctx = f.ctx('worklog');
  const projects = await f.tools.execute({ tool: 'worklog.projects', args: {} }, ctx);
  assert.equal(projects.observation.projects[0].name, '未分类');
  const saved = await f.tools.execute({ tool: 'worklog.create', args: {
    description: '整理日报', durationMinutes: 20, projectRef: projects.observation.projects[0].ref
  } }, ctx);
  assert.equal(saved.observation.created, true);
  assert.equal(f.values.worklogEntries[0].projectId, 'proj_default');
});

test('写入开始后丢失回执标记 unknown，不能当成未执行', async () => {
  const storage = { async get() { return { memos: [] }; }, async set() { throw new Error('写回执丢失'); } };
  const tools = Tools.create({ storage });
  const ctx = { task: { id: 'x', version: 1, index: 0, input: { app: 'task' }, memory: {} }, guard() {}, async effectStarted() {} };
  await assert.rejects(tools.execute({ tool: 'task.create', args: { title: '核对回执' } }, ctx), error => error.sideEffectState === 'unknown');
});

test('两个 App 共用的记录构造与页面默认字段一致', () => {
  const task = Capture.task({ title: '文档', firstSubtask: '列提纲', recurrence: 'daily' }, 1000);
  const entry = Capture.entry({ description: ' 写文档 ', duration: 61, date: '2026-09-23' }, 1000);
  assert.deepEqual(task.subtasks[0], { id: 'st_1000', title: '列提纲', completed: false });
  assert.deepEqual(task.habit, { type: 'daily', streak: 0 });
  assert.equal(entry.description, '写文档');
  assert.equal(entry.duration, 61);
});

test('受控规划器加载新 App 技能，保持统一模型与合同入口', async () => {
  const { createGateway } = await import('../local-ai/gateway.mjs');
  const gateway = createGateway({ provider: { model: 'fixture', async generateObject({ instructions }) {
    assert.match(instructions, /工作日志 App 快速添加/);
    assert.match(instructions, /本地今天是/);
    return { steps: [{ tool: 'worklog.create', args: { description: '排查接口问题', durationMinutes: 45 } }] };
  } } });
  const result = await gateway.run('assistant.plan', { app: 'worklog', skill: 'worklog-add', text: '今天排查接口问题用了45分钟' });
  assert.equal(result.source, 'model');
  assert.equal(result.data.steps[0].tool, 'worklog.create');
});

test('扩展识别新 App 而本机服务仍是旧版时提示重启服务', async () => {
  const tools = Tools.create({ ai: async () => { throw new Error('请选择已接入的应用'); } });
  const input = { app: 'task', text: '添加任务：检查接口' };
  const ctx = { task: { id: 'stale-service', input, turns: [{ role: 'user', content: input.text }],
    log: [], observations: [], memory: {} }, guard() {} };
  await assert.rejects(tools.plan(input, ctx), error =>
    error.code === 'ASSISTANT_LOCAL_SERVICE_OUTDATED' && /service\.sh restart/.test(error.message));
});
