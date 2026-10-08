import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import Engine from '../js/assistant-engine.js';
import Context from '../js/assistant-context-state.js';
import Contract from '../js/assistant-contract.js';
import Tools from '../js/assistant-tools.js';
import Music from '../js/music-intent.js';
import { plan } from '../local-ai/assistant-service.mjs';
import { prepareContext } from '../local-ai/assistant-context.mjs';

const input = { app: 'music', text: '检查队列，有则清空\n搜索许巍热歌加入队列\n搜索法老热歌加入队列\n随机播放' };
const definitions = [
  { text: '检查并清空队列', source: 0, tool: 'music.queue.clear' },
  { text: '追加许巍热歌', source: 1, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '追加法老热歌', source: 2, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放', source: 3, tool: 'music.queue.play', args: { mode: 'shuffle' } }
];
const step = (tool, args = {}) => ({ steps: [{ tool, args }] });
const task = () => ({ input, todoTips: Todo.create(input) });
function store() {
  const data = {};
  return { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); }, async remove(key) { delete data[key]; }, data };
}

test('队列播放短语优先于歌手搜索，复合和歌手请求仍走完整规划', () => {
  for (const text of ['随机播放队里的歌曲', '请随机播放当前队列', '播放队列里的歌曲']) {
    assert.ok(Music.queuePlayRequest(text));
    assert.equal(Music.artistRequest(text), null);
    assert.equal(Contract.localPlan({ app: 'music', text }), null);
  }
  assert.equal(Contract.routeRequest({ text: '随机播放队列' }, null).input.app, 'music');
  assert.equal(Contract.routeRequest({ text: '随机播放队里的歌曲' }, { scope: 'music', status: 'completed' }).mode, 'new');
  assert.deepEqual(Music.artistRequest('播放周杰伦的歌曲')?.query, '周杰伦');
  for (const text of ['随机播放添加到队列里的歌曲', '随机播放周杰伦的歌曲', '如果队列有歌就随机播放']) {
    assert.equal(Music.queuePlayRequest(text), null);
    assert.equal(Music.artistRequest(text), null);
    assert.equal(Contract.localPlan({ app: 'music', text }), null);
  }
});

test('明确播放已有队列走 Todo 与真实版本快路，确认一次起播且无需模型', async () => {
  for (const [text, expectedMode] of [['随机播放队里的歌曲', 'shuffle'], ['播放队列里的歌曲', 'loop']]) {
    const storage = store(); let reads = 0, plays = 0, modelCalls = 0;
    const handlers = Tools.create({ storage,
      readMusicState: async () => { reads++; return { status: 'ready', revision: 'queue-v1', count: 3, mode: 'loop', isPlaying: false, songs: [] }; },
      playCurrentQueue: async (revision, songId, _ctx, mode) => {
        assert.equal(revision, 'queue-v1'); assert.equal(songId, undefined);
        assert.equal(mode, expectedMode === 'shuffle' ? 'shuffle' : undefined);
        plays++;
        return { status: 'ready', revision: 'queue-v2', count: 3, mode: expectedMode, isPlaying: true,
          currentSong: { title: '测试歌曲', artist: '测试歌手' } };
      },
      ai: async () => { modelCalls++; throw new Error('明确队列播放不应调用模型'); }
    });
    const engine = Engine.create({ storage, ...handlers });
    await engine.submit({ app: 'music', text });
    const result = await engine.settled();
    assert.equal(result.status, 'completed', result.message);
    assert.equal(result.recoveryCount, 0); assert.equal(modelCalls, 0);
    assert.equal(reads, 1); assert.equal(plays, 1);
    assert.equal(result.todoTips.items[0].tool, 'music.queue.play');
    assert.equal(result.todoTips.items[0].status, 'completed');
    assert.ok(result.todoTips.items[0].receiptId);
    assert.equal(result.log.filter(row => row.tool === 'music.queue.play' && row.status === 'done').length, 1);
  }
});

test('队列为空或状态不一致时快路只读核对，不提交播放', async () => {
  for (const [status, count] of [['empty', 0], ['unavailable', 3]]) {
    const storage = store(); let plays = 0;
    const handlers = Tools.create({ storage,
      readMusicState: async () => ({ status, count, revision: 'queue-v1', mode: 'shuffle', isPlaying: false, songs: [] }),
      playCurrentQueue: async () => { plays++; throw new Error('不应播放'); },
      ai: async () => { throw new Error('明确状态应直接提示'); }
    });
    const engine = Engine.create({ storage, ...handlers });
    await engine.submit({ app: 'music', text: '随机播放队里的歌曲' });
    const result = await engine.settled();
    assert.equal(result.status, 'clarify', result.message);
    assert.equal(result.recoveryCount, 0); assert.equal(plays, 0);
    assert.equal(result.todoTips.items[0].status, 'clarify');
  }
});

test('明确播放过期保存队列仍可用真实 stale 版本受控恢复', async () => {
  const storage = store(); let plays = 0;
  const handlers = Tools.create({ storage,
    readMusicState: async () => ({ status: 'stale', count: 3, revision: 'stale-v1', mode: 'sequence', isPlaying: false, songs: [] }),
    playCurrentQueue: async (revision, _songId, _ctx, mode) => {
      assert.equal(revision, 'stale-v1'); assert.equal(mode, 'shuffle'); plays++;
      return { status: 'ready', revision: 'restored-v2', count: 3, mode: 'shuffle', isPlaying: true,
        currentSong: { title: '恢复曲目', artist: '测试歌手' } };
    },
    ai: async () => { throw new Error('明确恢复不应调用模型'); }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '随机播放已有队列' });
  const result = await engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.equal(plays, 1); assert.equal(result.todoTips.items[0].status, 'completed');
});

test('快路播放写入回执丢失时只转入核对，不重放起播', async () => {
  const storage = store(); let plays = 0, modelCalls = 0;
  const handlers = Tools.create({ storage,
    readMusicState: async () => ({ status: 'ready', count: 3, revision: 'queue-v1', mode: 'shuffle', isPlaying: false, songs: [] }),
    playCurrentQueue: async () => { plays++; throw new Error('播放回执丢失'); },
    ai: async request => {
      modelCalls++;
      assert.equal(request.input.planningPhase, 'execute');
      return { ok: true, data: { question: '播放结果尚未确认，请核对播放器。' } };
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '随机播放队里的歌曲' });
  const result = await engine.settled();
  assert.equal(result.status, 'clarify', result.message);
  assert.equal(result.recoveryCount, 1); assert.equal(plays, 1); assert.equal(modelCalls, 1);
  assert.equal(result.todoTips.items[0].status, 'clarify');
  assert.ok(Context.state(storage.data[Engine.KEY]).uncertain);
});

test('快路读取队列期间取消，迟到状态不能继续起播', async () => {
  const storage = store(); let releaseState, plays = 0;
  const handlers = Tools.create({ storage,
    readMusicState: () => new Promise(resolve => { releaseState = resolve; }),
    playCurrentQueue: async () => { plays++; throw new Error('取消后不能起播'); },
    ai: async () => { throw new Error('取消后不能规划'); }
  });
  const engine = Engine.create({ storage, ...handlers });
  const started = await engine.submit({ app: 'music', text: '随机播放队里的歌曲' });
  while (!releaseState) await new Promise(resolve => setImmediate(resolve));
  await engine.cancel(started.id);
  releaseState({ status: 'ready', count: 3, revision: 'queue-v1', mode: 'shuffle', isPlaying: false, songs: [] });
  const result = await engine.settled();
  assert.equal(result.status, 'cancelled'); assert.equal(plays, 0);
  assert.equal(result.todoTips.items[0].status, 'cancelled');
});

test('未执行的本地候选未通过 Todo 校验时转完整规划，不消耗错误恢复', async () => {
  const next = { app: 'music', text: '播放周杰伦的歌曲' };
  const taskState = { id: 'local-miss', input: next, todoTips: Todo.create({ app: 'music', text: '随机播放' }),
    observations: [], turns: [], log: [], memory: {}, startedAt: Date.now() };
  const traces = []; let modelCalls = 0;
  const handlers = Tools.create({ ai: async request => {
    modelCalls++;
    assert.equal(request.input.planningPhase, 'outline');
    return { ok: true, data: { question: '交给完整规划处理' } };
  } });
  const ctx = { task: taskState, guard() {}, async progress() {},
    async trace(tool, _title, _input, fn) { traces.push(tool); return fn(ctx); } };
  const result = await handlers.plan(next, ctx);
  assert.equal(result.question, '交给完整规划处理');
  assert.deepEqual(traces, ['assistant.localPlan', 'assistant.model']);
  assert.equal(modelCalls, 1); assert.equal(taskState.recovery, undefined);
  assert.deepEqual(taskState.todoTips.items, []);
});

test('截图原文：播放添加到队列里的歌曲是引用结果，不要求第四项再次追加', () => {
  const exact = { app: 'music', text: '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲' };
  const state = Todo.create(exact);
  Todo.install(state, definitions.map(row => ({ ...row, text: row.text.replace('许巍', '许嵩') })), 'music');
  assert.equal(state.items.length, 4);
  for (const reference of ['随机播放已添加到队列里的歌曲', '播放加入队列中的曲目', '播放刚刚追加到队列的歌曲']) {
    const single = Todo.create({ text: reference });
    Todo.install(single, [{ text: reference, source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }], 'music');
  }
  const imperative = Todo.create({ text: '添加歌曲到队列，然后随机播放' });
  assert.throws(() => Todo.install(imperative, [{ text: '随机播放', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }], 'music'), /追加回执/);
});

test('独立清单分析接受超过三项目标；模型夹带的执行步骤不保存、不执行', async () => {
  let request;
  const result = await plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, {
    async generateObject(value) {
      request = value;
      return { todoTips: definitions, steps: Array(5).fill({ tool: 'shell', args: { command: 'must never run' } }) };
    }
  });
  assert.equal(request.input.planningPhase, 'outline');
  assert.match(request.instructions, /本轮不规划或执行工具调用/);
  assert.equal(result.data.todoTips.length, 4); assert.deepEqual(result.data.steps, []);
  assert.equal(result.toolContext.toolCount, 0);
  await assert.rejects(plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, {
    generateObject: async () => step('music.state')
  }), /尚未返回完整 todoTips/);
  assert.deepEqual(Contract.validatePlan({ todoTips: definitions }).steps, []);
  await assert.rejects(plan({ ...input, todoTips: Todo.create(input), planningPhase: 'execute' }, {}), /阶段不匹配/);
});

test('生产 Tools/Engine 先持久化全部待办，再请求执行计划；分析中取消不产生动作', async () => {
  for (const cancel of [false, true]) {
    const storage = store(), phases = [];
    let release, calls = 0;
    const handlers = Tools.create({ storage, ai: async request => {
      phases.push(request.input.planningPhase);
      if (request.input.planningPhase === 'outline') {
        assert.equal(storage.data[Engine.KEY].todoTips.sources.length, 4, '分析中来源先保存，贴片不会消失');
        await new Promise(resolve => { release = resolve; });
        return { ok: true, data: { todoTips: definitions, steps: [] } };
      }
      assert.ok(storage.data[Engine.KEY].todoTips.items.every(row => row.status === 'pending'));
      assert.equal(calls, 0, '完整清单持久化之前不能调用业务工具');
      return { ok: true, data: { question: '测试暂停，尚未执行任何动作' } };
    } });
    const engine = Engine.create({ storage, ...handlers, execute: async () => { calls++; throw new Error('不应执行'); } });
    const started = await engine.submit(input);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    if (cancel) await engine.cancel(started.id);
    release();
    const result = await engine.settled();
    assert.equal(calls, 0);
    assert.equal(result.status, cancel ? 'cancelled' : 'clarify');
    assert.deepEqual(phases, cancel ? ['outline'] : ['outline', 'execute']);
    assert.equal(result.todoTips.items.length, cancel ? 0 : 4);
  }
});

test('首次规划必须覆盖所有原文分项，不接受勾选状态、删项、改序、错验收条件', async () => {
  for (const rows of [definitions.slice(0, 1), [...definitions].reverse(), definitions.map(row => ({ ...row, status: 'completed' })),
    definitions.map((row, i) => i === 1 ? { ...row, tool: 'music.search', args: {} } : row)]) {
    await assert.rejects(plan({ ...input, todoTips: Todo.create(input) }, { generateObject: async () => ({ ...step('music.state'), todoTips: rows }) }), { code: 'ASSISTANT_PLAN_INVALID' });
  }
  await assert.rejects(plan({ ...input, todoTips: Todo.create(input) }, { generateObject: async () => step('music.state') }), /先建立完整 Todo/);
  assert.throws(() => Contract.validatePlan({ ...step('music.state'), todoId: 'todo-99' }), /Todo 引用/);
});

test('加载工具和坏版本修复保留完整 Todo，不能执行后续事项或改写路线', async () => {
  const first = await plan({ ...input, todoTips: Todo.create(input) }, {
    generateObject: async () => ({ ...step('tools.load', { group: 'music.queue' }), todoTips: definitions })
  });
  assert.equal(first.data.todoTips.length, 4); assert.equal(first.data.continue, true);
  const repair = await plan({ ...input, todoTips: Todo.create(input) }, {
    generateObject: async () => ({ ...step('music.queue.clear', { expectedRevision: 'invented' }), todoTips: definitions })
  });
  assert.equal(repair.data.steps[0].tool, 'music.state'); assert.equal(repair.data.todoTips.length, 4);
  const t = task(); Todo.prepare(t, { ...step('music.state'), todoTips: definitions });
  assert.throws(() => Todo.prepare(t, { ...step('music.state'), todoTips: definitions }), /不能被模型覆盖/);
  assert.throws(() => Todo.prepare(t, { ...step('music.state'), todoId: 'todo-2' }), /按 Todo 顺序/);
  assert.throws(() => Todo.before(t, step('music.queue.play', { mode: 'shuffle', expectedRevision: 'v' }).steps[0]), /不能提前/);
});

test('只有当前项真实终态回执可勾选，等待/未知/过期缓存不算完成；空队列可满足条件清空', () => {
  const t = task(); Todo.prepare(t, { ...step('music.state'), todoTips: definitions });
  const s = { todoId: 'todo-1', tool: 'music.state', args: {} };
  for (const status of ['waiting', 'unknown', 'failed']) Todo.observe(t, s, { status, data: { count: 0, status: 'empty' } }, { id: 'x', status });
  Todo.observe(t, s, { status: 'done', data: { count: 0, status: 'stale' } }, { id: 'old', status: 'done' });
  assert.notEqual(t.todoTips.items[0].status, 'completed');
  Todo.observe(t, s, { status: 'done', data: { count: 0, status: 'empty' } }, { id: 'current', status: 'done' });
  assert.equal(t.todoTips.items[0].receiptId, 'current');
  assert.throws(() => Todo.prepare(t, { done: true, steps: [] }), /尚未完成/);
  Todo.observe(t, s, { status: 'done', data: {} }, { id: 'replay', status: 'done' });
  assert.equal(t.todoTips.items[1].status, 'pending');
});

test('播放提交和只改模式不能满足随机起播，模型不能跳过参数验收', () => {
  const t = { input: { app: 'music', text: '随机播放' }, todoTips: Todo.create({ text: '随机播放' }) };
  Todo.install(t.todoTips, [{ text: '随机播放', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }], 'music');
  const s = { todoId: 'todo-1', tool: 'music.queue.play', args: { mode: 'shuffle' } };
  for (const data of [{ isPlaying: false, mode: 'shuffle' }, { isPlaying: true, mode: 'sequence' }]) Todo.observe(t, s, { status: 'done', data }, { id: 'no', status: 'done' });
  assert.equal(Todo.current(t.todoTips).id, 'todo-1');
  assert.throws(() => Todo.before(t, { tool: 'music.queue.play', args: { mode: 'sequence' } }), /验收目标/);
  Todo.observe(t, s, { status: 'done', data: { isPlaying: true, mode: 'shuffle' } }, { id: 'yes', status: 'done' });
  assert.equal(Todo.current(t.todoTips), undefined);
});

test('Todo 独立于六条观察窗口和摘要，压缩及恢复不丢进度或复活已完成动作', async () => {
  const storage = store(); let release;
  const engine = Engine.create({ storage, plan: async () => ({ ...step('music.state'), todoTips: definitions }),
    execute: () => new Promise(resolve => { release = resolve; }) });
  const started = await engine.submit(input);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const before = await engine.snapshot(); assert.equal(before.todoTips.items.length, 4);
  const restored = Engine.create({ storage });
  const interrupted = await restored.snapshot();
  assert.equal(interrupted.status, 'interrupted'); assert.equal(interrupted.todoTips.items[0].status, 'interrupted');
  await engine.cancel(started.id); release({ message: '迟到空队列回执', observation: { status: 'empty', count: 0 } });
  const cancelled = await engine.settled();
  assert.equal(cancelled.todoTips.items[0].status, 'cancelled'); assert.ok(!cancelled.todoTips.items.some(row => row.receiptId));
  const saved = storage.data[Engine.KEY], todoBefore = structuredClone(saved.todoTips);
  const request = Context.batch(saved, true);
  if (request?.entries.length > 1) Context.commit(saved, request, { changed: true, revision: request.revision,
    throughSeq: request.entries[0].seq, firstRetainedSeq: request.entries[1].seq, summary: '测试摘要', beforeEstimatedTokens: 10, afterEstimatedTokens: 2 });
  assert.deepEqual(saved.todoTips, todoBefore);
  const model = prepareContext({ instructions: '规则', input: { text: '继续', todoTips: saved.todoTips }, contextLength: 32768, maxOutputTokens: 1200 });
  assert.deepEqual(model.modelInput.todoTips, todoBefore);
});

test('模型连续提前结束有恢复上限，保持未完成和阻塞状态', async () => {
  const storage = store(); let calls = 0, reads = 0;
  const engine = Engine.create({ storage,
    plan: async () => calls++ === 0 ? { ...step('music.state'), todoTips: definitions } : { done: true },
    execute: async () => { reads++; return { message: '非空队列', observation: { status: 'ready', count: 50 } }; } });
  await engine.submit(input); const result = await engine.settled();
  assert.equal(result.status, 'failed'); assert.equal(calls, 3); assert.equal(reads, 1);
  assert.equal(result.todoTips.items[0].status, 'failed');
  assert.ok(result.todoTips.items.slice(1).every(row => row.status === 'pending'));
});
