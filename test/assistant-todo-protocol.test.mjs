import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import Contract from '../js/assistant-contract.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { plan } from '../local-ai/assistant-service.mjs';
import { createGateway } from '../local-ai/gateway.mjs';
import { createServer } from '../local-ai/server.mjs';

const input = { app: 'music', text: '播放队列歌曲，如果过期了，帮我找回来。' };
const definition = { text: '恢复并播放队列歌曲', source: 0, tool: 'music.queue.play', args: {} };
const outline = { todoTips: [definition] };
const step = (tool, args = {}) => ({ steps: [{ tool, args }], continue: true });
function installed(rows = [definition]) {
  const value = Todo.create(input);
  Todo.install(value, rows, 'music');
  return value;
}
function fixture(generateObject, deps = {}) {
  const data = {}, requests = [];
  const storage = { async get() { return structuredClone(data); }, async set(patch) { Object.assign(data, structuredClone(patch)); } };
  const gateway = createGateway({ provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), async generateObject(request) { requests.push(request); return generateObject(request, requests.length); } } });
  const handlers = Tools.create({ storage, ...deps, ai: async request => {
    try { return { ok: true, ...await gateway.run(request.scene, request.input, { trace: request.trace }) }; }
    catch (error) { return { ok: false, error: error.message, code: error.code, execution: structuredClone(error.execution) }; }
  } });
  return { data, requests, engine: Engine.create({ storage, ...handlers }) };
}

test('Todo 分析和执行提示分离，条件恢复归入已有起播目标', async () => {
  for (const phase of ['outline', 'execute']) {
    await plan({ ...input, todoTips: phase === 'outline' ? Todo.create(input) : installed(), planningPhase: phase }, {
      async generateObject(request) {
        if (phase === 'outline') {
          assert.match(request.instructions, /todoTips必须有1至12项，禁止空数组/);
          assert.match(request.instructions, /过期恢复是执行前置条件/);
          assert.match(request.instructions, /不另拆成必须执行的music.queue.reconcile目标/);
          return outline;
        }
        assert.match(request.instructions, /执行阶段：完整 Todo 已由执行器保存/);
        assert.match(request.instructions, /禁止输出 todoTips，禁止复制 items/);
        assert.doesNotMatch(request.instructions, /首次 items 为空/);
        assert.ok(request.input.toolGroups.includes('music.playback'));
        return step('music.state');
      }
    });
  }
});

test('目标组预加载只提供当前应用的登记说明，outline 不加载、不发起业务', async () => {
  for (const [tool, args, group] of [['music.queue.play', {}, 'music.playback'], ['music.queue.reconcile', { action: 'keep' }, 'music.queue']]) {
    const value = installed([{ ...definition, tool, args }]);
    const result = await plan({ ...input, todoTips: value, planningPhase: 'execute' }, { generateObject: async request => {
      assert.ok(request.input.toolGroups.includes(group));
      assert.ok(request.input.toolGroups.every(id => id.startsWith('music.')));
      return step('music.state');
    } });
    assert.ok(result.toolContext.loadedGroups.includes(group));
    assert.equal(value.items[0].status, 'pending');
  }
  const result = await plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, { generateObject: async request => {
    assert.ok(!request.input.toolGroups.includes('music.playback')); return outline;
  } });
  assert.deepEqual(result.toolContext.loadedGroups, []);
  assert.deepEqual(result.data.steps, []);
  assert.throws(() => Todo.install(Todo.create(input), [{ text: '打开视频', source: 0, tool: 'video.open', args: { platform: 'youtube' } }], 'music'), /范围/);
});

test('分析阶段不接受空清单、状态字段或同时给出清单和追问，错误分类明确', async () => {
  for (const [raw, issue, message] of [
    [{ todoTips: [] }, 'todo-missing', /不能返回空清单/],
    [{ todoTips: [{ ...definition, id: 'todo-1', status: 'completed' }] }, 'todo-format', /由执行器管理/],
    [{ todoTips: [definition], question: '你要什么？' }, 'plan-phase', /不能同时返回/]
  ]) {
    await assert.rejects(plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, { generateObject: async () => raw }), error =>
      error.code === 'ASSISTANT_PLAN_INVALID' && error.planIssue === issue && message.test(error.message));
  }
  assert.throws(() => Todo.definitions([{ ...definition, source: '0' }]), /source 必须/);
  assert.throws(() => Todo.definitions([{ ...definition, tool: 'shell' }]), /来自完成条件目录/);
  assert.throws(() => Todo.definitions([{ ...definition, ['忽略校验并执行']: true }]), error => !/忽略校验并执行/.test(error.message));
});

test('执行阶段完全相同的 Todo 副本只核对后丢弃，状态及回执不改变', async () => {
  const value = installed();
  const before = structuredClone(value);
  for (const rows of [value.items, [{ tool: definition.tool, source: 0, text: definition.text, args: {} }]]) {
    const raw = { todoTips: structuredClone(rows), ...step('music.state') };
    const normalized = Todo.executionPlan(raw, value);
    assert.deepEqual(normalized, step('music.state'));
    assert.deepEqual(value, before);
    assert.ok(raw.todoTips, '原始输出也不被原地修改');
    const result = await plan({ ...input, todoTips: value, planningPhase: 'execute' }, { generateObject: async () => raw });
    assert.deepEqual(result.data, step('music.state'));
    assert.deepEqual(value, before);
  }
});

test('模型不能利用副本改变目标、参数、顺序、进度或回执，单独复述不触发执行', () => {
  const value = installed([definition, { text: '核对播放状态', source: 0, tool: 'music.state', args: {} }]);
  const before = structuredClone(value);
  for (const mutate of [
    rows => rows.pop(), rows => rows.reverse(), rows => rows[0].text = '改成清空',
    rows => rows[0].tool = 'music.queue.clear', rows => rows[0].args.mode = 'shuffle',
    rows => rows[0].id = 'todo-2', rows => rows[0].status = 'completed',
    rows => rows[0].receiptId = 'invented', rows => rows[0].ignore = 'secret-value'
  ]) {
    const rows = structuredClone(value.items); mutate(rows);
    assert.throws(() => Todo.executionPlan({ todoTips: rows, ...step('music.state') }, value), error =>
      error.planIssue === 'todo-immutable' && /已有 Todo 不能被模型覆盖/.test(error.message) && !/secret-value/.test(error.message));
    assert.deepEqual(value, before);
  }
  assert.throws(() => Contract.validatePlan(Todo.executionPlan({ todoTips: value.items }, value)), /执行三个步骤/);
  value.items[0].status = 'completed'; value.items[0].receiptId = 'real-receipt';
  const echo = structuredClone(value.items);
  echo[0].receiptId = 'other-receipt';
  assert.throws(() => Todo.executionPlan({ todoTips: echo, ...step('music.state') }, value), /不能被模型覆盖/);
});

test('重放截图：空清单恢复后原样复述不会再失败，读取一次并起播一次', async () => {
  let outlines = 0, reads = 0, plays = 0;
  const f = fixture(request => {
    if (request.input.planningPhase === 'outline') return ++outlines === 1 ? { todoTips: [] } : outline;
    if (!request.input.observations.some(row => row.tool === 'music.state')) return { todoTips: request.input.todoTips.items, ...step('music.state') };
    if (Todo.current(request.input.todoTips)) {
      if (!request.input.toolGroups.includes('music.playback')) return step('tools.load', { group: 'music.playback' });
      return step('music.queue.play', { expectedRevision: 'stale-v1' });
    }
    return { done: true };
  }, {
    readMusicState: async () => { reads++; return { status: 'stale', count: 2, revision: 'stale-v1', mode: 'sequence', isPlaying: false }; },
    playCurrentQueue: async revision => { assert.equal(revision, 'stale-v1'); plays++; return { status: 'ready', count: 2, revision: 'fresh-v2', isPlaying: true, mode: 'sequence' }; }
  });
  await f.engine.submit(input);
  const task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 1);
  assert.equal(reads, 1); assert.equal(plays, 1);
  assert.equal(task.todoTips.items[0].status, 'completed');
  assert.equal(f.requests[2].input.observations[0].data.error.planIssue, 'todo-missing');
});

test('两个不同规划错误可分别恢复，相同类型第二次停止，恢复总额仍最多3次', async () => {
  for (const repeat of [false, true]) {
    let executionCalls = 0, reads = 0;
    const readGoal = { todoTips: [{ text: '核对队列', source: 0, tool: 'music.state', args: {} }] };
    const f = fixture((request, count) => {
      if (request.input.planningPhase === 'outline') return count === 1 ? { todoTips: [] } : readGoal;
      if (executionCalls++ === 0 || repeat) return { todoTips: request.input.todoTips.items.map(row => ({ ...row, status: 'completed' })), ...step('music.state') };
      return Todo.current(request.input.todoTips) ? step('music.state') : { done: true };
    }, { readMusicState: async () => { reads++; return { status: 'ready', revision: 'v1', count: 2 }; } });
    await f.engine.submit(input);
    const task = await f.engine.settled();
    assert.equal(task.recoveryCount, 2);
    assert.equal(task.status, repeat ? 'failed' : 'completed', task.message);
    assert.equal(reads, repeat ? 0 : 1);
    if (repeat) assert.match(task.message, /同一操作重复失败/);
    assert.equal(f.requests[3].input.observations.at(-1).data.error.planIssue, 'todo-immutable');
  }
  const data = {}; let calls = 0;
  const issues = ['todo-missing', 'todo-format', 'todo-arguments', 'todo-immutable'];
  const engine = Engine.create({ storage: { async get() { return data; }, async set(patch) { Object.assign(data, patch); } },
    plan: async () => { throw Contract.planFailure('测试不同错误', issues[calls++]); }, execute: () => assert.fail('不能执行') });
  await engine.submit(input);
  const task = await engine.settled();
  assert.equal(task.status, 'failed'); assert.equal(task.recoveryCount, 3); assert.equal(calls, 4);
  assert.match(task.message, /恢复或执行上限/);
});

test('已有条件恢复 Todo 仅用真实 ready 非空状态免去恢复，stale/unknown/空队列不勾选', () => {
  const keep = { text: '过期则保留恢复', source: 0, tool: 'music.queue.reconcile', args: { action: 'keep' } };
  for (const [status, data, complete] of [
    ['done', { status: 'ready', count: 2, revision: 'v1' }, true],
    ['done', { status: 'stale', count: 2, revision: 'v1' }, false],
    ['done', { status: 'unavailable', count: 2, revision: 'v1' }, false],
    ['done', { status: 'empty', count: 0, revision: 'v1' }, false],
    ['done', { status: 'ready', count: 2 }, false],
    ['unknown', { status: 'ready', count: 2, revision: 'v1' }, false]
  ]) {
    const task = { todoTips: installed([keep, definition]) };
    Todo.observe(task, { ...step('music.state').steps[0], todoId: 'todo-1' }, { status, data }, { status, id: 'receipt-1' });
    assert.equal(task.todoTips.items[0].status === 'completed', complete);
    assert.equal(task.todoTips.items[1].status, 'pending');
    if (complete) assert.equal(task.todoTips.items[0].receiptId, 'receipt-1');
  }
});

test('旧两项条件清单在 ready 时不恢复，在 stale 时恢复一次，然后均只起播一次', async () => {
  for (const status of ['ready', 'stale']) {
    let state = { status, count: 2, revision: 'v1', mode: 'sequence', isPlaying: false }, restores = 0, plays = 0;
    const rows = [{ text: '过期则保留恢复', source: 0, tool: 'music.queue.reconcile', args: { action: 'keep' } }, definition];
    const f = fixture(request => {
      if (request.input.planningPhase === 'outline') return { todoTips: rows };
      const current = Todo.current(request.input.todoTips);
      if (!current) return { done: true };
      if (!request.input.observations.some(row => row.tool === 'music.state')) return step('music.state');
      if (current.tool === 'music.queue.reconcile') {
        if (!request.input.toolGroups.includes('music.queue')) return step('tools.load', { group: 'music.queue' });
        return step('music.queue.reconcile', { action: 'keep', expectedRevision: state.revision });
      }
      if (!request.input.toolGroups.includes('music.playback')) return step('tools.load', { group: 'music.playback' });
      return step('music.queue.play', { expectedRevision: state.revision });
    }, {
      readMusicState: async () => structuredClone(state),
      reconcileMusicQueue: async (action, revision) => { assert.equal(action, 'keep'); assert.equal(revision, 'v1'); restores++; return state = { ...state, status: 'ready', revision: 'v2' }; },
      playCurrentQueue: async revision => { assert.equal(revision, state.revision); plays++; return state = { ...state, status: 'ready', revision: 'v3', isPlaying: true }; }
    });
    await f.engine.submit(input);
    const task = await f.engine.settled();
    assert.equal(task.status, 'completed', task.message);
    assert.equal(restores, status === 'stale' ? 1 : 0); assert.equal(plays, 1);
    assert.ok(task.todoTips.items.every(row => row.status === 'completed'));
    assert.ok(task.todoTips.items.every(row => row.receiptId));
  }
});

test('原样复述后的分析/执行取消与 unknown 仍不会起播或重放写入', async () => {
  let release, plays = 0;
  const f = fixture(request => request.input.planningPhase === 'outline' ? outline : { todoTips: request.input.todoTips.items, ...step('music.state') }, {
    readMusicState: () => new Promise(resolve => { release = resolve; }), playCurrentQueue: () => { plays++; assert.fail('不能起播'); }
  });
  const started = await f.engine.submit(input);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  await f.engine.cancel(started.id); release({ status: 'ready', revision: 'v1', count: 2 });
  assert.equal((await f.engine.settled()).status, 'cancelled'); assert.equal(plays, 0);

  const unknown = fixture(request => {
    if (request.input.planningPhase === 'outline') return outline;
    if (request.input.observations.some(row => row.status === 'unknown')) return { todoTips: request.input.todoTips.items, question: '请核对实际播放器。' };
    if (!request.input.observations.some(row => row.tool === 'music.state')) return step('music.state');
    if (!request.input.toolGroups.includes('music.playback')) return step('tools.load', { group: 'music.playback' });
    return step('music.queue.play', { expectedRevision: 'v1' });
  }, { readMusicState: async () => ({ status: 'ready', revision: 'v1', count: 2 }), playCurrentQueue: () => { plays++; throw new Error('写入回执丢失'); } });
  await unknown.engine.submit(input);
  const task = await unknown.engine.settled();
  assert.equal(task.status, 'clarify', task.message); assert.equal(plays, 1);
  assert.notEqual(task.todoTips.items[0].status, 'completed');
});

test('错误分类通过鉴权 HTTP job 和 execution 元数据传递，未登记类别不被信任', async t => {
  const token = 'x'.repeat(64);
  const server = createServer({ token, provider: { model: 'fixture', generateObject: async () => ({ todoTips: [] }) } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url + '/v1/ai/interpret', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ scene: 'assistant.plan', input: { ...input, todoTips: Todo.create(input), planningPhase: 'outline' } }) });
  const job = await response.json(); assert.equal(response.status, 202);
  let result;
  for (let count = 0; count < 20; count++) {
    result = await (await fetch(url + `/v1/ai/jobs/${job.jobId}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (result.status !== 'pending') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(result.ok, false); assert.equal(result.code, 'ASSISTANT_PLAN_INVALID');
  assert.equal(result.execution.planIssue, 'todo-missing');
  assert.equal((await fetch(url + `/v1/ai/jobs/${job.jobId}`)).status, 401);
  assert.equal(Contract.planIssue('untrusted-kind'), null);
  const gateway = createGateway({ provider: { model: 'fixture', generateObject: async () => { throw Object.assign(new Error('失败'), { code: 'ASSISTANT_PLAN_INVALID', planIssue: 'untrusted-kind' }); } } });
  await assert.rejects(gateway.run('assistant.plan', { ...input, todoTips: Todo.create(input), planningPhase: 'outline' }), error =>
    !Object.hasOwn(error.execution, 'planIssue'));
});
