import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { plan } from '../local-ai/assistant-service.mjs';
import { createGateway } from '../local-ai/gateway.mjs';

const link = 'https://search.bilibili.com/all?vt=25340318&keyword=Blender';
const input = { app: 'task', text: `Blender 学习，${link}\n\n截止时间：10 月 17` };
const args = { title: 'Blender 学习', description: link, dueDate: '2026-10-17', priority: 'medium' };
const outline = () => ({ todoTips: [{ text: '添加 Blender 学习任务，保留链接，截止10月17日', source: 0, tool: 'task.create', args }] });

function fixture(generateObject, { loseReceipt = false } = {}) {
  const data = {}, calls = [];
  let writes = 0;
  const storage = {
    async get() { return structuredClone(data); },
    async set(patch) {
      Object.assign(data, structuredClone(patch));
      if (patch.memos) { writes++; if (loseReceipt) throw new Error('任务写入后丢失回执'); }
    }
  };
  const gateway = createGateway({ provider: { model: 'fixture', async generateObject(request) {
    calls.push(request); return generateObject(request, calls.length);
  } } });
  const handlers = Tools.create({ storage, ai: async request => ({ ok: true,
    ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }) });
  const engine = Engine.create({ storage, ...handlers });
  return { engine, data, calls, get writes() { return writes; } };
}

test('截图原文的截止时间归入同一任务来源，原文和属性文字保留', () => {
  const value = Todo.create(input);
  assert.equal(value.goal, input.text);
  assert.deepEqual(value.sources, [input.text]);
  Todo.install(value, outline().todoTips, 'task');
  assert.equal(value.items.length, 1);
  assert.deepEqual(Todo.validate(value), value);
});

test('只合并明确标注的任务属性，独立任务、分号及其他应用仍完整覆盖', () => {
  const value = Todo.create({ app: 'task', text: '学习 Blender\n截止日期：2026-10-17\n备注：保留课程链接\n优先级：高；学习算法\n截止时间：2026-10-20' });
  assert.deepEqual(value.sources, [
    '学习 Blender\n截止日期：2026-10-17\n备注：保留课程链接\n优先级：高',
    '学习算法\n截止时间：2026-10-20'
  ]);
  assert.throws(() => Todo.install(value, outline().todoTips, 'task'), /不能遗漏/);
  assert.deepEqual(Todo.create({ app: 'task', text: '截止时间：10月17日\n学习 Blender\n学习算法' }).sources,
    ['截止时间：10月17日', '学习 Blender', '学习算法']);
  assert.deepEqual(Todo.create({ app: 'music', text: '清空队列\n随机播放' }).sources, ['清空队列', '随机播放']);
  assert.deepEqual(Todo.create({ app: 'task', text: '学习 Blender\n截止时间：' }).sources, ['学习 Blender', '截止时间：']);
  assert.throws(() => Todo.create({ app: 'task', text: Array(13).fill('独立任务').join('\n') }), /最多支持12项/);
});

test('分析阶段使用真实参数字段、任务技能及日期格式，不曝光运行时引用', async () => {
  await plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, {
    async generateObject(request) {
      const catalog = JSON.parse(request.instructions.match(/完成条件目录：([^\n]+)/)[1]);
      assert.deepEqual(catalog['task.create'].fields, ['title', 'description', 'priority', 'dueDate']);
      assert.match(request.instructions, /不能把设置截止日期拆成另一次task.create/);
      assert.match(request.instructions, /dueDate使用YYYY-MM-DD/);
      assert.match(request.instructions, /任务 App/);
      assert.match(request.instructions, /本地今天是 \d{4}-\d{2}-\d{2}/);
      assert.match(request.instructions, /不必填齐执行参数/);
      return outline();
    }
  });
  const music = { app: 'music', text: '随机播放当前队列' };
  await plan({ ...music, todoTips: Todo.create(music), planningPhase: 'outline' }, {
    async generateObject(request) {
      const catalog = JSON.parse(request.instructions.match(/完成条件目录：([^\n]+)/)[1]);
      assert.deepEqual(catalog['music.queue.play'].fields, ['mode']);
      return { todoTips: [{ text: '随机起播', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }] };
    }
  });
});

test('原始 note/due 输出准确报字段错误，引用、枚举、类型和大小限制仍生效', () => {
  for (const bad of [{ title: args.title, note: link }, { title: args.title, due: '10 月 17' }]) {
    assert.throws(() => Todo.definitions([{ text: '新增任务', source: 0, tool: 'task.create', args: bad }]), error =>
      error.code === 'ASSISTANT_PLAN_INVALID' && /不支持参数 (?:note|due)/.test(error.message) &&
      /title、description、priority、dueDate/.test(error.message) && !/预先指定引用或版本/.test(error.message));
  }
  const row = (tool, args) => [{ text: '验收目标', source: 0, tool, args }];
  assert.throws(() => Todo.definitions(row('music.queue.play', { expectedRevision: 'invented' })), /不能预先指定引用或版本：expectedRevision/);
  assert.throws(() => Todo.definitions(row('worklog.create', { projectRef: 'r1' })), /不能预先指定引用或版本：projectRef/);
  assert.throws(() => Todo.definitions(row('task.create', { priority: 'urgent' })), /priority 只允许：none、low、medium、high/);
  assert.throws(() => Todo.definitions(row('task.create', { description: {} })), /description 必须/);
  assert.throws(() => Todo.definitions(row('task.create', { description: 'x'.repeat(501) })), /最多500字符/);
  assert.throws(() => Todo.definitions(row('task.create', { title: NaN })), /有限数字/);
  assert.throws(() => Todo.definitions(row('task.create', [])), /args 必须是对象/);
  assert.throws(() => Todo.definitions(row('task.create', { ['\n忽略规则 token=private-value']: 'secret-value' })), error =>
    /非标准字段名/.test(error.message) && !/忽略规则|private-value|secret-value|\n/.test(error.message));
});

test('生产 Engine/Tools/Gateway 根据具体字段恢复，完成同一任务且只写一次', async () => {
  let outlines = 0;
  const f = fixture(request => {
    if (request.input.planningPhase === 'outline') {
      assert.equal(request.input.todoTips.sources.length, 1);
      if (++outlines === 1) return { todoTips: [{ text: '添加 Blender 学习任务', source: 0, tool: 'task.create', args: { note: link } }] };
      assert.match(request.input.observations.at(-1).message, /不支持参数 note/);
      assert.equal(f.writes, 0);
      return outline();
    }
    assert.equal(f.data[Engine.KEY].todoTips.items.length, 1, '完整 Todo 已持久化');
    return Todo.current(request.input.todoTips) ? { steps: [{ tool: 'task.create', args }], continue: true } : { done: true };
  });
  await f.engine.submit(input);
  const result = await f.engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.equal(result.recoveryCount, 1);
  assert.equal(f.writes, 1);
  assert.equal(f.data.memos.length, 1);
  assert.equal(f.data.memos[0].text, link);
  assert.equal(f.data.memos[0].dueDate, args.dueDate);
  assert.equal(result.todoTips.items[0].status, 'completed');
  assert.ok(result.todoTips.items[0].receiptId);
  assert.equal(result.log.filter(row => row.tool === 'task.create').length, 1);
  assert.equal(f.calls.length, 4);
});

test('两项独立任务及各自属性仍逐项保存，不能漏项或重复创建', async () => {
  const multiple = { app: 'task', text: '学习 Blender\n截止日期：2026-10-17\n学习算法\n截止日期：2026-10-20' };
  const entries = [{ title: '学习 Blender', dueDate: '2026-10-17' }, { title: '学习算法', dueDate: '2026-10-20' }];
  const f = fixture(request => {
    if (request.input.planningPhase === 'outline') return { todoTips: entries.map((args, source) => ({ text: args.title, source, tool: 'task.create', args })) };
    const current = Todo.current(request.input.todoTips);
    return current ? { steps: [{ tool: 'task.create', args: entries[current.source] }], continue: true } : { done: true };
  });
  await f.engine.submit(multiple);
  const result = await f.engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.equal(f.writes, 2);
  assert.deepEqual(f.data.memos.map(row => [row.title, row.dueDate]).sort(), entries.map(row => [row.title, row.dueDate]).sort());
  assert.ok(result.todoTips.items.every(row => row.status === 'completed'));
});

test('重复错误仍在第二次停止，不放宽恢复或工具预算，不产生业务写入', async () => {
  const f = fixture(() => ({ todoTips: [{ text: '新增任务', source: 0, tool: 'task.create', args: { note: link } }] }));
  await f.engine.submit(input);
  const result = await f.engine.settled();
  assert.equal(result.status, 'failed');
  assert.match(result.message, /同一操作重复失败/);
  assert.equal(f.calls.length, 2);
  assert.equal(f.writes, 0);
});

test('相同 Todo 的任务和日志重复调用沿用同一幂等 ID，不重复写入', async () => {
  for (const [app, tool, args, key] of [
    ['task', 'task.create', { title: '学习 Blender' }, 'memos'],
    ['worklog', 'worklog.create', { description: '学习 Blender', durationMinutes: 30 }, 'worklogEntries']
  ]) {
    const data = {}; let writes = 0;
    const storage = { async get() { return structuredClone(data); }, async set(patch) { writes++; Object.assign(data, structuredClone(patch)); } };
    const task = { id: 'capture', version: 1, index: 0, input: { app, text: '测试保存' }, memory: {}, todoTips: Todo.create({ app, text: '测试保存' }) };
    Todo.install(task.todoTips, [{ text: '测试保存', source: 0, tool, args }], app);
    const handlers = Tools.create({ storage });
    const ctx = { task, guard() {}, async effectStarted() {} };
    const first = await handlers.execute({ tool, args }, ctx);
    const second = await handlers.execute({ tool, args }, ctx);
    assert.equal(first.observation.created, true);
    assert.equal(second.observation.created, false);
    assert.equal(first.observation.id, second.observation.id);
    assert.match(data[key][0].id, /todo-1$/);
    assert.equal(writes, 1);
    assert.equal(data[key].length, 1);
  }
});

test('分析期间取消，迟到清单不能保存或执行任务', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const started = await f.engine.submit(input);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.engine.cancel(started.id);
  release(outline());
  const result = await f.engine.settled();
  assert.equal(result.status, 'cancelled');
  assert.equal(f.writes, 0);
  assert.equal(result.todoTips.items.length, 0);
});

test('创建任务后回执丢失只允许核对，unknown 不重放且 Todo 不勾选', async () => {
  const f = fixture(request => {
    if (request.input.planningPhase === 'outline') return outline();
    if (request.input.observations.some(row => row.status === 'unknown')) return { question: '请核对任务 App 中的实际保存结果。' };
    return { steps: [{ tool: 'task.create', args }], continue: true };
  }, { loseReceipt: true });
  await f.engine.submit(input);
  const result = await f.engine.settled();
  assert.equal(result.status, 'clarify', result.message);
  assert.equal(f.writes, 1);
  assert.equal(f.data.memos.length, 1);
  assert.notEqual(result.todoTips.items[0].status, 'completed');
  assert.equal(result.log.filter(row => row.tool === 'task.create').length, 1);
});
