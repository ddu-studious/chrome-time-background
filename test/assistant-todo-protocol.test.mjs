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
  // A bare echo leaves no step to run. The Contract used to say “一次最多执行三个步骤” here, which is false for an empty list
  // and misled the model's repair; it now names the real problem and the way out.
  assert.throws(() => Contract.validatePlan(Todo.executionPlan({ todoTips: value.items }, value)), error => /没有可执行步骤/.test(error.message) && /不要复述待办清单/.test(error.message) && !/最多执行三个步骤/.test(error.message));
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

// 2026-10-12：“推荐一些歌曲，加入歌单，随机播放”曾在分析阶段被返回空清单并重复失败。
const recommend = { app: 'music', text: '帮我推荐一些歌曲，加入歌单，随机播放。' };
const recommendOutline = { todoTips: [
  { text: '推荐歌曲并加入本地播放队列', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放队列', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }
] };
const personalMemory = { artistDefaultAction: 'play', artistQueueMode: 'append' };
const recalledMemory = [{ kind: 'note', app: 'music', key: 'like-rock', value: '我喜欢摇滚', updatedAt: 1 }];
const planFailure = { tool: 'assistant.plan', status: 'failed', message: '请先规划覆盖完整需求的 Todo（1至12项）；不能返回空清单',
  data: { operation: 'assistant.plan', error: { code: 'ASSISTANT_PLAN_INVALID', planIssue: 'todo-missing' }, args: {}, recovery: { attempt: 1, remaining: 2, sideEffectState: 'none' } } };
function recommendedGoals() {
  const value = Todo.create(recommend);
  Todo.install(value, recommendOutline.todoTips, 'music');
  return value;
}
// Full Engine + Tools + Gateway replay with doubles for the cloud search and the player.
function recommendReplay(outlineModel) {
  const effects = { searches: 0, applies: 0, plays: 0, clicks: 0 };
  let version = 1;
  let state = { status: 'empty', revision: 'v1', count: 0, mode: 'sequence', isPlaying: false, currentSong: null, songs: [], readAt: Date.now() };
  const update = patch => state = { ...state, ...patch, revision: `v${++version}`, readAt: Date.now() };
  const latest = (observations, pick) => [...observations].reverse().map(pick).find(Boolean);
  const f = fixture((request, count) => {
    assert.ok(count <= 14, '模型调用次数失控');
    if (request.input.planningPhase === 'outline') return outlineModel(request);
    const observations = request.input.observations || [];
    const active = Todo.current(request.input.todoTips);
    if (!active) return { done: true };
    if (!observations.some(row => row.tool === 'music.state')) return step('music.state');
    const revision = latest(observations, row => row.data?.revision);
    if (active.tool === 'music.queue.apply') {
      const collection = latest(observations, row => row.tool === 'music.collection.get' && row.data?.ref);
      if (collection) return step('music.queue.apply', { ref: collection, mode: 'append', startPlayback: false, expectedRevision: revision });
      const selected = latest(observations, row => row.data?.selectedRef);
      if (selected) return step('music.collection.get', { ref: selected });
      return step('music.search', { kind: 'playlist', query: '热门歌曲' });
    }
    return step('music.queue.play', { mode: 'shuffle', expectedRevision: revision });
  }, {
    memory: async () => ({ ok: true, revision: 1, enabled: true, preferences: [], artists: [], notes: [{ key: 'like-rock', app: 'music', value: '我喜欢摇滚', updatedAt: 1 }] }),
    readMusicState: async () => structuredClone(state),
    netease: async (path, params) => {
      if (path.includes('search')) { effects.searches++; assert.equal(params.type, 1000); return { code: 200, result: { playlists: [{ id: 501, name: '热门歌曲精选', trackCount: 3, creator: { nickname: '测试' } }], playlistCount: 1 } }; }
      assert.equal(path, '/api/v6/playlist/detail');
      return { code: 200, playlist: { trackCount: 3, trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }], tracks: [1, 2, 3].map(id => ({ id, name: `推荐${id}`, ar: [{ name: '歌手' }], dt: 180000 })) } };
    },
    applyMusicQueue: async (songs, args) => { effects.applies++; assert.equal(args.expectedRevision, state.revision); return update({ status: 'ready', songs, count: songs.length }); },
    playCurrentQueue: async (revision, ref, ctx, mode) => { effects.plays++; assert.equal(revision, state.revision); return update({ mode, isPlaying: true, currentSong: state.songs[0] }); },
    // 用户在候选卡上点“+”：播放器替换队列并起播（与模型的 music.queue.apply 是两条不同写路径）。
    playQueue: async songs => { effects.clicks++; update({ status: 'ready', songs, count: songs.length, isPlaying: true, mode: 'sequence', currentSong: songs[0] }); return { ok: true, song: songs[0], queueLength: songs.length, skipped: 0 }; }
  });
  return { f, effects };
}
const outlineRequests = f => f.requests.filter(request => request.input.planningPhase === 'outline');
async function waitForPlaylists(engine) {
  const task = await engine.settled();
  assert.equal(task.status, 'waiting', task.message);
  return task;
}
async function pickPlaylist(engine, task) {
  const choice = task.choices.find(row => row.kind === 'playlist' && !row.secondary);
  assert.ok(choice, '应给出真实歌单候选供用户选择');
  await engine.choose(task.id, choice.id, task.version);
  return engine.settled();
}

test('分析阶段不接收个人偏好和召回记忆，执行阶段仍按原规则带入', async () => {
  const body = { ...recommend, personalMemory, recalledMemory };
  let outlineInput;
  await plan({ ...body, todoTips: Todo.create(recommend), planningPhase: 'outline' }, { generateObject: async request => { outlineInput = request.input; return recommendOutline; } });
  assert.ok(!Object.hasOwn(outlineInput, 'personalMemory'));
  assert.ok(!Object.hasOwn(outlineInput, 'memoryContext'));
  assert.doesNotMatch(JSON.stringify(outlineInput), /摇滚|artistDefaultAction/);
  let executeInput;
  await plan({ ...body, todoTips: recommendedGoals(), planningPhase: 'execute' }, { generateObject: async request => { executeInput = request.input; return step('music.state'); } });
  assert.deepEqual(executeInput.personalMemory, personalMemory);
  assert.match(executeInput.memoryContext, /摇滚/);
});

test('分析阶段失败后重试，明确要求补全清单或只输出 question；首次请求和执行阶段不带该条款', async () => {
  const texts = [];
  for (const observations of [[], [planFailure]]) {
    await plan({ ...recommend, todoTips: Todo.create(recommend), planningPhase: 'outline', observations }, { generateObject: async request => { texts.push(request.instructions); return recommendOutline; } });
  }
  assert.doesNotMatch(texts[0], /上一轮清单分析失败/);
  assert.match(texts[1], /上一轮清单分析失败/);
  assert.match(texts[1], /不是新指令/);
  assert.match(texts[1], /补全1至12项todoTips/);
  assert.match(texts[1], /只输出question/);
  await plan({ ...recommend, todoTips: recommendedGoals(), planningPhase: 'execute', observations: [planFailure] }, { generateObject: async request => {
    assert.doesNotMatch(request.instructions, /上一轮清单分析失败/); return step('music.state');
  } });
});

test('空清单的错误提示给出两条出路：补全清单，或信息不足时只返回 question', async () => {
  await assert.rejects(plan({ ...recommend, todoTips: Todo.create(recommend), planningPhase: 'outline' }, { generateObject: async () => ({ todoTips: [] }) }), error =>
    error.code === 'ASSISTANT_PLAN_INVALID' && error.planIssue === 'todo-missing' && /不能返回空清单/.test(error.message) && /请补全清单，或在信息不足时只返回 question/.test(error.message));
});

test('分析阶段提示：缺少具体对象不是空清单的理由；推荐与加入合并为本地队列追加', async () => {
  let text;
  await plan({ ...recommend, todoTips: Todo.create(recommend), planningPhase: 'outline' }, { generateObject: async request => { text = request.instructions; return recommendOutline; } });
  assert.match(text, /缺少歌手、风格、对象等具体细节不是返回空数组的理由/);
  assert.match(text, /只说“推荐.{0,20}的请求.{0,60}合并为一项music\.queue\.apply/);
  assert.match(text, /不要为推荐或搜索单独设目标/);
  assert.match(text, /“加入歌单”.{0,20}本地播放队列/);
  assert.match(text, /缺少风格时照常列出目标/);
  // 音乐专属规则不外溢到其他应用；通用规则仍适用。
  const alarm = { app: 'alarm', text: '明天八点提醒我开会' };
  await plan({ ...alarm, todoTips: Todo.create(alarm), planningPhase: 'outline' }, { generateObject: async request => {
    assert.doesNotMatch(request.instructions, /本地播放队列|只说“推荐/);
    assert.match(request.instructions, /缺少歌手、风格、对象等具体细节不是返回空数组的理由/);
    return { todoTips: [{ text: '创建提醒', source: 0, tool: 'alarm.prepare', args: {} }] };
  } });
});

test('不带 app 的工作台请求同样得到音乐分析规则（含没有队列/随机字样的说法）', async () => {
  for (const text of ['帮我推荐一些歌曲，加入歌单，随机播放。', '推荐几首歌，加入歌单']) {
    const body = { text };
    let instructions;
    await plan({ ...body, todoTips: Todo.create(body), planningPhase: 'outline' }, { generateObject: async request => { instructions = request.instructions; return recommendOutline; } });
    assert.match(instructions, /“加入歌单”.{0,20}本地播放队列/, text);
    assert.match(instructions, /缺少歌手、风格、对象等具体细节不是返回空数组的理由/, text);
  }
});

test('执行阶段提示：推荐歌曲先搜索真实歌单并等待选择，不把“推荐歌曲”当搜索词', async () => {
  let text;
  await plan({ ...recommend, todoTips: recommendedGoals(), planningPhase: 'execute' }, { generateObject: async request => { text = request.instructions; return step('music.state'); } });
  assert.match(text, /music\.search\(kind="playlist",query=/);
  assert.match(text, /热门歌曲/);
  assert.match(text, /不要把“推荐歌曲”原样当作搜索词/);
  assert.match(text, /推荐只依据歌单标题与简介/);
});

test('重放截图：分析不受偏好和记忆干扰，选一次歌单后追加、随机起播各一次，无需恢复', async () => {
  // 复现线上现象：带偏好/记忆的分析输入会让模型返回空清单。
  const { f, effects } = recommendReplay(request => request.input.personalMemory || request.input.memoryContext ? { todoTips: [] } : recommendOutline);
  await f.engine.submit(recommend);
  const waiting = await waitForPlaylists(f.engine);
  assert.equal(waiting.recoveryCount ?? 0, 0);
  assert.equal(outlineRequests(f).length, 1, '一次分析即成功，没有靠重试');
  const task = await pickPlaylist(f.engine, waiting);
  assert.equal(task.status, 'completed', task.message);
  assert.deepEqual(effects, { searches: 1, applies: 1, plays: 1, clicks: 0 });
  assert.ok(task.todoTips.items.every(row => row.status === 'completed' && row.receiptId));
  assert.ok(outlineRequests(f).every(request => !request.input.personalMemory && !request.input.memoryContext));
  assert.ok(f.requests.some(request => request.input.planningPhase !== 'outline' && request.input.personalMemory), '执行阶段仍保留偏好');
});

test('重放分析阶段偶发空清单：重试携带失败回执与补全条款，恢复一次后完成且写入只发生一次', async () => {
  let outlines = 0;
  const { f, effects } = recommendReplay(request => {
    if (++outlines === 1) return { todoTips: [] };
    assert.match(request.instructions, /上一轮清单分析失败/);
    assert.equal(request.input.observations.at(-1).data.error.planIssue, 'todo-missing');
    return recommendOutline;
  });
  await f.engine.submit(recommend);
  const waiting = await waitForPlaylists(f.engine);
  assert.equal(waiting.recoveryCount, 1);
  assert.equal(outlineRequests(f).length, 2);
  const task = await pickPlaylist(f.engine, waiting);
  assert.equal(task.status, 'completed', task.message);
  assert.deepEqual(effects, { searches: 1, applies: 1, plays: 1, clicks: 0 });
});

// 2026-10-12 截图：用户在歌单候选上手动点“+”（替换队列并播放），播放已确认，
// 但“加入本地队列”仍被标为未完成，模型回 done 被拒，最终“同一操作重复失败”。
test('重放截图：用户手动点“+”后，真实起播回执勾选“加入队列”，随后只随机播放一次，不重复写队列', async () => {
  const { f, effects } = recommendReplay(() => recommendOutline);
  await f.engine.submit(recommend);
  const waiting = await waitForPlaylists(f.engine);
  const click = waiting.choices.find(row => row.action === 'music.enqueue-collection');
  assert.ok(click, '候选里应有“替换队列并播放”的“+”入口');
  await f.engine.choose(waiting.id, click.id, waiting.version);
  const task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message);
  assert.deepEqual(effects, { searches: 1, applies: 0, plays: 1, clicks: 1 }, '点击只写一次队列，模型不再追加，随机播放一次');
  assert.ok(task.todoTips.items.every(row => row.status === 'completed' && row.receiptId));
  assert.notEqual(task.todoTips.items[0].receiptId, task.todoTips.items[1].receiptId);
  assert.equal(task.recoveryCount ?? 0, 0, '不需要靠错误恢复');
});

function choiceTask(text = recommend.text) {
  const state = Todo.create({ app: 'music', text });
  Todo.install(state, [{ ...recommendOutline.todoTips[0] }, { ...recommendOutline.todoTips[1] }], 'music');
  return { todoTips: state };
}
const clickOutcome = (patch = {}) => ({ message: '已替换', playback: { mode: 'replace', title: 'a', songId: '1', count: 3 }, ...patch });
const clickReceipt = { id: 'turn:9', status: 'done' };
const collectionClick = { action: 'music.enqueue-collection' };

test('手动选择只在真实起播回执齐全时勾选“加入本地队列”，每次最多勾一项', () => {
  const task = choiceTask();
  Todo.observeChoice(task, collectionClick, clickOutcome(), clickReceipt);
  assert.deepEqual(task.todoTips.items.map(row => [row.status, row.receiptId]), [['completed', 'turn:9'], ['pending', undefined]]);
  // 下一项是随机播放，不是加入队列：同样的点击不会再勾它。
  Todo.observeChoice(task, collectionClick, clickOutcome(), { id: 'turn:10', status: 'done' });
  assert.equal(task.todoTips.items[1].status, 'pending');
});

test('手动选择：缺少回执、起播证据、等待态、非候选动作或用户明确排除播放/替换时都不勾选', () => {
  const none = task => task.todoTips.items.map(row => row.status).join();
  const attempts = [
    [collectionClick, clickOutcome(), null],
    [collectionClick, clickOutcome(), { id: 'x', status: 'failed' }],
    [collectionClick, clickOutcome({ playback: undefined }), clickReceipt],
    [collectionClick, clickOutcome({ playback: { mode: 'replace', title: 'a', songId: '', count: 3 } }), clickReceipt],
    [collectionClick, clickOutcome({ playback: { mode: 'replace', title: 'a', songId: '1', count: 0 } }), clickReceipt],
    [collectionClick, clickOutcome({ playback: { mode: 'append', title: 'a', songId: '1', count: 3 } }), clickReceipt],
    [collectionClick, clickOutcome({ status: 'waiting' }), clickReceipt],
    [{ action: 'music.browse' }, clickOutcome(), clickReceipt],
    [{ action: 'music.queue' }, clickOutcome(), clickReceipt],
    [undefined, clickOutcome(), clickReceipt]
  ];
  for (const [choice, outcome, receipt] of attempts) {
    const task = choiceTask();
    Todo.observeChoice(task, choice, outcome, receipt);
    assert.equal(none(task), 'pending,pending');
  }
  for (const text of ['推荐歌曲加入歌单，先不要播放', '推荐歌曲加入歌单，不要替换原队列']) {
    const task = choiceTask(text); Todo.observeChoice(task, collectionClick, clickOutcome(), clickReceipt);
    assert.equal(none(task), 'pending,pending');
  }
  // 当前项不是“加入本地队列”（例如随机播放）时，点击不能提前勾选。
  const play = { todoTips: Todo.create(recommend) };
  Todo.install(play.todoTips, [recommendOutline.todoTips[1]], 'music');
  Todo.observeChoice(play, collectionClick, clickOutcome(), clickReceipt);
  assert.equal(play.todoTips.items[0].status, 'pending');
});

test('单曲“播放”按追加语义匹配，且不会勾选已完成的任务', () => {
  const task = choiceTask();
  Todo.observeChoice(task, { action: 'music.play' }, clickOutcome({ playback: { mode: 'append', title: 'a', songId: '9', count: 4 } }), clickReceipt);
  assert.equal(task.todoTips.items[0].status, 'completed');
  const done = choiceTask(); done.todoTips.items.forEach(row => row.status = 'completed');
  Todo.observeChoice(done, collectionClick, clickOutcome(), { id: 'again', status: 'done' });
  assert.ok(done.todoTips.items.every(row => !row.receiptId));
});

// 分析阶段只返回 question 时，用户的补充答复只是在回答这个追问：原始目标和原文分项必须保留，
// 不能被答复文字替换成新的 Todo，也不能被答复触发的本地快捷规划接管。
const askedFirst = '要搜索哪位歌手的热歌？';
const stopHere = { question: '测试到此为止' };
const multiGoal = { app: 'music', text: '搜索歌手热歌加入队列\n随机播放添加到队列里的歌曲' };
const multiGoalOutline = { todoTips: [
  { text: '搜索歌手热歌并加入本地播放队列', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放队列', source: 1, tool: 'music.queue.play', args: { mode: 'shuffle' } }
] };
// 逗号不是分项分隔符，这是只有一个原文分项的多目标请求。
const oneLineGoal = { app: 'music', text: '搜索歌手热歌，加入队列，然后随机播放' };
const oneLineOutline = { todoTips: [
  { text: '搜索歌手热歌并加入本地播放队列', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放队列', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }
] };
// 第一次分析提出追问，第二次分析返回清单；清单之后的执行阶段在此停下，只检查分析结果。
function askThenOutline(outline) {
  let outlines = 0;
  return fixture(request => request.input.planningPhase === 'outline' ? (++outlines === 1 ? { question: askedFirst } : outline) : stopHere);
}
async function askAndAnswer(f, original, answer) {
  await f.engine.submit(original);
  const asked = await f.engine.settled();
  assert.equal(asked.status, 'clarify');
  assert.equal(asked.message, askedFirst);
  await f.engine.submit({ app: original.app, text: answer });
  return f.engine.settled();
}

test('分析阶段追问后的补充答复沿用原始目标和全部原文分项，清单仍覆盖每一项', async () => {
  const f = askThenOutline(multiGoalOutline);
  const task = await askAndAnswer(f, multiGoal, '许嵩');
  const outlines = outlineRequests(f);
  assert.equal(outlines.length, 2);
  assert.equal(outlines[1].input.text, '许嵩', '答复仍作为本次 text 发给模型');
  assert.equal(outlines[1].input.todoTips.goal, multiGoal.text);
  assert.deepEqual(outlines[1].input.todoTips.sources, ['搜索歌手热歌加入队列', '随机播放添加到队列里的歌曲']);
  assert.equal(task.todoTips.goal, multiGoal.text);
  assert.deepEqual(task.todoTips.items.map(row => row.source), [0, 1], '两个原始目标都在清单里');
});

test('只有一个原文分项的多目标需求，追问答复同样沿用原始目标并回到完整清单分析', async () => {
  const f = askThenOutline(oneLineOutline);
  const task = await askAndAnswer(f, oneLineGoal, '许嵩');
  assert.equal(outlineRequests(f).length, 2);
  assert.equal(task.todoTips.goal, oneLineGoal.text);
  assert.deepEqual(task.todoTips.items.map(row => row.tool), ['music.queue.apply', 'music.queue.play']);
  assert.ok(f.requests.every(request => request.input.planningPhase === 'outline' || request.input.todoTips.items.length === 2));
});

// 没有“加入队列”“随机播放”这类 Todo 校验关键词的单行需求：答复“许嵩”能被本地 music.intent 识别，
// 而且单项来源的 Todo 校验不会拒绝它；若不拦截，答复会被当成完整需求，原需求的其余要求被静默丢弃。
const softGoal = { app: 'music', text: '帮我找一首适合下雨天听的歌，如果没有合适的就换一批' };
const softOutline = { todoTips: [{ text: '搜索适合下雨天听的歌曲', source: 0, tool: 'music.search', args: { kind: 'song' } }] };
test('单行需求没有 Todo 校验关键词时，追问答复也不能被本地快捷规划接管成完整需求', async () => {
  const f = askThenOutline(softOutline);
  const task = await askAndAnswer(f, softGoal, '许嵩');
  assert.equal(outlineRequests(f).length, 2, '答复必须回到完整清单分析，不能被本地 music.intent 直接接管');
  assert.equal(outlineRequests(f)[1].input.text, '许嵩');
  assert.equal(task.todoTips.goal, softGoal.text);
  assert.deepEqual(task.todoTips.items.map(row => [row.source, row.tool]), [[0, 'music.search']]);
  assert.ok(!(task.log || []).some(row => row.tool === 'music.intent'), '答复不得被当作完整的音乐检索需求执行');
  assert.ok(JSON.stringify(task.trace).includes('answers-outline-question'), '没有使用本地快捷规划要留下可诊断的决策记录');
});

test('没有追问时，单步本地快捷规划仍先于清单分析直接尝试', async () => {
  // 夹具没有音乐检索模型，music.intent 会失败并进入执行阶段的恢复规划；这里只核对入口顺序。
  const f = fixture(() => stopHere);
  await f.engine.submit({ app: 'music', text: '许嵩' });
  const task = await f.engine.settled();
  assert.equal(outlineRequests(f).length, 0, '没有追问时不先请求清单分析');
  assert.ok((task.log || []).some(row => row.tool === 'music.intent'), '本地 music.intent 路径被执行');
});

test('追问之后用户开始的是新的独立需求时，不沿用上一个未完成的原文分项', async () => {
  const f = askThenOutline(multiGoalOutline);
  await f.engine.submit(multiGoal);
  assert.equal((await f.engine.settled()).status, 'clarify');
  await f.engine.submit({ app: 'music', text: '搜索周杰伦' });
  const task = await f.engine.settled();
  assert.equal(task.todoTips.goal, '搜索周杰伦');
  assert.ok(!JSON.stringify(task.todoTips).includes('随机播放添加到队列里的歌曲'));
});

test('分析提示说明追问答复只补充 sources 缺少的细节，不新增分项', async () => {
  let text;
  await plan({ ...multiGoal, text: '许嵩', todoTips: { version: 1, goal: multiGoal.text, sources: multiGoal.text.split('\n'), items: [] }, planningPhase: 'outline',
    turns: [{ role: 'user', content: multiGoal.text }, { role: 'assistant', content: askedFirst }, { role: 'user', content: '许嵩' }] },
  { generateObject: async request => { text = request.instructions; return multiGoalOutline; } });
  assert.match(text, /针对上一轮清单分析的追问/);
  assert.match(text, /回答只补充todoTips\.sources里缺少的细节/);
  assert.match(text, /不是新增分项/);
  assert.match(text, /覆盖todoTips\.sources的全部分项/);
  // 首次分析（text 就是目标）、没有文字的技能请求和执行阶段都不带这段说明。
  const others = [];
  const record = async request => { others.push(request.instructions); return request.input.planningPhase === 'outline' ? multiGoalOutline : step('music.state'); };
  const skillOnly = { app: 'alarm', skill: 'alarms' };
  await plan({ ...multiGoal, todoTips: Todo.create(multiGoal), planningPhase: 'outline' }, { generateObject: record });
  // 工具不属于闹钟应用，模型结果会被拒绝；请求在校验前已记录，这里只检查发给模型的说明。
  await plan({ ...skillOnly, todoTips: Todo.create(skillOnly), planningPhase: 'outline' }, { generateObject: record }).catch(() => {});
  await plan({ ...multiGoal, todoTips: recommendedGoals(), planningPhase: 'execute' }, { generateObject: record });
  assert.equal(others.length, 3);
  for (const text of others) assert.doesNotMatch(text, /针对上一轮清单分析的追问/);
});

test('连续两次追问后，每次答复都沿用同一份原始目标和原文分项', async () => {
  let outlines = 0;
  const f = fixture(request => request.input.planningPhase === 'outline' ? (++outlines <= 2 ? { question: askedFirst } : multiGoalOutline) : stopHere);
  await f.engine.submit(multiGoal);
  assert.equal((await f.engine.settled()).status, 'clarify');
  await f.engine.submit({ app: 'music', text: '许嵩' });
  assert.equal((await f.engine.settled()).status, 'clarify');
  await f.engine.submit({ app: 'music', text: '热歌' });
  const task = await f.engine.settled();
  const sent = outlineRequests(f);
  assert.equal(sent.length, 3);
  assert.deepEqual(sent.map(request => request.input.text), [multiGoal.text, '许嵩', '热歌']);
  for (const request of sent) {
    assert.equal(request.input.todoTips.goal, multiGoal.text);
    assert.deepEqual(request.input.todoTips.sources, ['搜索歌手热歌加入队列', '随机播放添加到队列里的歌曲']);
  }
  assert.deepEqual(task.todoTips.items.map(row => row.source), [0, 1]);
});

test('通过交互卡文字回答追问，同样沿用原始目标，只多一次分析请求且没有伪造完成回执', async () => {
  const f = fixture(request => request.input.planningPhase === 'outline' ? (outlineRequests({ requests: f.requests }).length === 1 ? { question: askedFirst } : multiGoalOutline) : stopHere);
  await f.engine.submit(multiGoal);
  assert.equal((await f.engine.settled()).status, 'clarify');
  const asked = await f.engine.snapshot();
  assert.equal(asked.interaction.allowText, true);
  await f.engine.respond(asked.id, asked.version, { interaction: asked.interaction, action: 'reply', text: '许嵩' });
  const task = await f.engine.settled();
  const sent = outlineRequests(f);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].input.todoTips.goal, multiGoal.text);
  assert.deepEqual(task.todoTips.items.map(row => row.source), [0, 1]);
  assert.ok(task.todoTips.items.every(row => row.status !== 'completed' && !row.receiptId), '回答追问不产生完成回执');
});
