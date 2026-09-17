const test = require('node:test');
const assert = require('node:assert/strict');
const Contract = require('../js/assistant-contract.js');
const Engine = require('../js/assistant-engine.js');
const Tools = require('../js/assistant-tools.js');
const Policy = require('../js/music-queue-policy.js');
const step = (tool, args = {}, again = true) => ({ steps: [{ tool, args }], ...(again ? { continue: true } : {}) });
function storage() { const data = {}; return { async get() { return structuredClone(data); }, async set(p) { Object.assign(data, structuredClone(p)); }, async remove(k) { delete data[k]; } }; }
function ctx() { return { guard() {}, progress: async () => {}, task: { id: 't1', memory: {}, input: { app: 'music' }, turns: [], adaptive: true } }; }

test('条件和队列命令绕过单动作路由，普通点歌仍使用原路径', () => {
  for (const text of ['如果有队列就随机播放否则找张杰歌单', '查看队列', '单曲循环', '当前正在播放什么']) assert.equal(Contract.localPlan({ app: 'music', text }), null);
  assert.equal(Contract.localPlan({ app: 'music', text: '播放张杰' }).steps[0].tool, 'music.intent');
  assert.throws(() => Contract.validatePlan(step('tools.load', { group: 'music.queue' }), 'alarm'), /范围/);
  assert.throws(() => Contract.validatePlan(step('music.playback.setMode', { mode: 'invalid', expectedRevision: 'r' })), /枚举/);
  assert.throws(() => Contract.validatePlan({ ...step('music.state'), steps: [{ tool: 'music.state', args: {} }, { tool: 'music.queue.play', args: { expectedRevision: 'r' } }] }), /一个工具/);
});

test('模型仅看到当前应用常用工具，工具组加载后才开放对应执行合同', async () => {
  const { plan } = await import('../local-ai/assistant-service.mjs');
  let captured;
  const provider = { async generateObject(request) { captured = request; return step('music.state'); } };
  await plan({ app: 'music', text: '如果有队列就播放' }, provider);
  assert.doesNotMatch(captured.instructions, /"video.search":|"alarm.prepare":|"music.queue.apply":/);
  assert.match(captured.instructions, /"music.state":/);
  assert.match(captured.instructions, /music.queue/); // Only group discovery description.
  await plan({ app: 'music', text: '如果有队列就播放', toolGroups: ['music.queue'] }, provider);
  assert.match(captured.instructions, /"music.queue.apply":/);
  assert.doesNotMatch(captured.instructions, /"music.playback.setMode":/);
  await assert.rejects(plan({ app: 'music', text: '查看队列' }, { generateObject: async () => step('music.queue.play', { expectedRevision: 'r' }) }), /尚未加载/);
  await assert.rejects(plan({ app: 'music', text: '随机播放', toolGroups: ['shell'] }, provider), /范围/);
  await assert.rejects(plan({ app: 'music', text: '随机播放', observations: Array(7).fill({}) }, provider), /上限/);
});

test('模型文本工具调用可转换为受控计划，未知工具仍被拒绝', async () => {
  const { plan } = await import('../local-ai/assistant-service.mjs');
  const converted = await plan({ app: 'music', text: '播放热门歌曲', observations: [{ tool: 'music.intent', status: 'waiting', message: '已加载歌手热门歌曲', data: null }] }, {
    async generateObject({ instructions }) {
      assert.match(instructions, /不要输出<tool_call>标签/);
      return { 'tools.load': { group: 'music.queue' } };
    }
  });
  assert.deepEqual(converted.data, step('tools.load', { group: 'music.queue' }));
  await assert.rejects(plan({ app: 'music', text: '播放热门歌曲', observations: [{ tool: 'music.intent', status: 'waiting', message: '已加载', data: null }] }, {
    async generateObject() { return { shell: { command: 'open' } }; }
  }), /计划格式/);
});

test('有队列：真实观察驱动加载→随机模式→播放→定时，结果不暴露URL或内部曲目ID', async () => {
  const { createGateway } = await import('../local-ai/gateway.mjs');
  let state = { status: 'ready', revision: 'v1', count: 2, mode: 'sequence', isPlaying: false, songs: [{ songId: '9', url: 'secret' }] };
  const operations = []; let round = 0;
  const gateway = createGateway({ provider: { generateObject: async ({ input }) => {
    const last = input.observations.at(-1);
    const plans = [step('music.state'), step('tools.load', { group: 'music.playback' }), step('music.playback.setMode', { mode: 'shuffle', expectedRevision: 'v1' }), step('music.queue.play', { expectedRevision: 'v2' }), step('music.sleep', { minutes: 30 }, false)];
    if (round === 1) { assert.equal(last.data.count, 2); assert.equal(last.data.songs, undefined); assert.doesNotMatch(JSON.stringify(input), /secret/); }
    if (round === 3) assert.equal(last.data.revision, 'v2');
    if (round === 4) assert.equal(last.data.isPlaying, true);
    return plans[round++];
  } } });
  const store = storage();
  const handlers = Tools.create({ storage: store, ai: async request => ({ ok: true, ...await gateway.run(request.scene, request.input) }),
    readMusicState: async () => state,
    setMusicMode: async (mode, revision) => { assert.equal(revision, state.revision); operations.push('mode'); return state = { ...state, mode, revision: 'v2' }; },
    playCurrentQueue: async revision => { assert.equal(revision, state.revision); operations.push('play'); return state = { ...state, revision: 'v3', isPlaying: true, currentSong: { title: '逆战' } }; },
    sleepMusic: async minutes => { assert.equal(minutes, 30); assert.equal(state.isPlaying, true); operations.push('sleep'); return { ok: true }; }
  });
  const engine = Engine.create({ storage: store, ...handlers, id: () => 'task' });
  await engine.submit({ app: 'music', text: '如果有队列就随机播放，30分钟后停止' });
  const result = await engine.settled();
  assert.equal(result.status, 'completed', result.message); assert.deepEqual(operations, ['mode', 'play', 'sleep']); assert.equal(round, 5);
});

test('空队列：暂停选择真实歌单，读取后仅追加；不会自动播放或重复应用', async () => {
  const { createGateway } = await import('../local-ai/gateway.mjs');
  let round = 0, selected, loaded, writes = 0;
  const gateway = createGateway({ provider: { generateObject: async ({ input }) => {
    const last = input.observations.at(-1);
    switch (round++) {
      case 0: return step('music.state');
      case 1: assert.equal(last.data.status, 'empty'); return step('music.search', { kind: 'playlist', query: '张杰' });
      case 2: selected = last.data.selectedRef; assert.ok(selected); return step('tools.load', { group: 'music.queue' });
      case 3: return step('music.collection.get', { ref: selected });
      case 4: loaded = last.data.ref; return step('music.state');
      case 5: return step('music.queue.apply', { ref: loaded, mode: 'append', startPlayback: false, expectedRevision: 'empty' });
      default: return { done: true };
    }
  } } });
  const store = storage(); const handlers = Tools.create({ storage: store,
    ai: async r => ({ ok: true, ...await gateway.run(r.scene, r.input) }),
    readMusicState: async () => ({ status: 'empty', revision: 'empty', count: 0, songs: [] }),
    netease: async path => path.includes('search') ? { code: 200, result: { playlists: [{ id: 21, name: '张杰精选' }] } } : { code: 200, playlist: { trackIds: [{ id: 3 }], tracks: [{ id: 3, name: '逆战' }], trackCount: 1 } },
    applyMusicQueue: async (songs, args) => { assert.equal(songs[0].songId, '3'); assert.equal(args.startPlayback, false); writes++; return { status: 'ready', revision: 'applied', count: 1 }; }
  });
  const engine = Engine.create({ storage: store, ...handlers, id: () => 'task' });
  await engine.submit({ app: 'music', text: '如果没有队列就添加张杰歌单' });
  const waiting = await engine.settled(); assert.equal(waiting.status, 'waiting'); assert.equal(writes, 0);
  await engine.choose(waiting.id, waiting.choices.find(c => !c.secondary).id, waiting.version);
  const done = await engine.settled(); assert.equal(done.status, 'completed', done.message); assert.equal(writes, 1);
  await assert.rejects(engine.choose(waiting.id, waiting.choices[0].id, waiting.version), /变化|过期/);
});

test('规划有上限；未知/未选择/跨任务引用不能触发写入', async () => {
  const store = storage(); let calls = 0;
  const engine = Engine.create({ storage: store, id: () => 't', plan: async () => { calls++; return step('music.state'); }, execute: async () => ({ message: '读取完成', observation: { count: 1 } }) });
  await engine.submit({ text: '测试' }); const result = await engine.settled();
  assert.equal(result.status, 'failed'); assert.match(result.message, /上限/); assert.equal(calls, 12);
  const tools = Tools.create({ applyMusicQueue() { assert.fail(); } });
  await assert.rejects(tools.execute(step('music.queue.apply', { ref: 'r999', mode: 'replace', startPlayback: true, expectedRevision: 'v1' }).steps[0], ctx()), /引用/);
});

test('取消后迟到观察不能引起下一轮决策；执行失败不重试写入', async () => {
  const store = storage(); let release, plans = 0;
  const engine = Engine.create({ storage: store, id: () => 't', plan: async () => { plans++; return step('music.state'); }, execute: () => new Promise(r => { release = r; }) });
  const first = await engine.submit({ text: '测试' });
  while (!release) await new Promise(r => setImmediate(r));
  await engine.cancel(first.id); release({ message: '读取完成' });
  assert.equal((await engine.settled()).status, 'cancelled'); assert.equal(plans, 1);
});

test('随机不立即重复且一轮覆盖全部曲目；自然结束单曲循环与手动切歌不同', () => {
  const queue = { songs: ['1', '2', '3'].map(songId => ({ songId })), index: 0, playMode: 'shuffle' };
  const visited = [0];
  for (let i = 0; i < 2; i++) { queue.index = Policy.nextIndex(queue, 1, { random: () => 0 }); visited.push(queue.index); }
  assert.equal(new Set(visited).size, 3);
  assert.equal(Policy.nextIndex({ ...queue, index: 1, playMode: 'single' }, 1, { ended: true }), 1);
  assert.equal(Policy.nextIndex({ ...queue, index: 1, playMode: 'single' }, 1), 2);
  assert.equal(Policy.nextIndex({ ...queue, index: 2, playMode: 'sequence' }), -1);
  assert.equal(Policy.nextIndex({ ...queue, index: 2, playMode: 'loop' }), 0);
});

test('引用必须来自当前任务且经过选择；同一集合成功应用后不能重复提交', async () => {
  let writes = 0; const c = ctx();
  c.task.memory.musicRefs = { r1: { taskId: c.task.id, selected: false, expires: Date.now() + 10000, value: { songs: [{ songId: '1' }], title: '已查询歌单' } } };
  const tools = Tools.create({ applyMusicQueue: async () => { writes++; return { status: 'ready', revision: 'v2', count: 1 }; } });
  const call = step('music.queue.apply', { ref: 'r1', mode: 'append', startPlayback: false, expectedRevision: 'v1' }).steps[0];
  await assert.rejects(tools.execute(call, c), /先选择/); assert.equal(writes, 0);
  c.task.memory.musicRefs.r1.selected = true;
  c.task.memory.musicRefs.r1.taskId = 'another-task';
  await assert.rejects(tools.execute(call, c), /引用/); assert.equal(writes, 0);
  c.task.memory.musicRefs.r1.taskId = c.task.id;
  await tools.execute(call, c); assert.equal(writes, 1);
  await assert.rejects(tools.execute(call, c), /已经应用/); assert.equal(writes, 1);
});

test('模型冗余done标记不能跳过实际动作校验或提前结束', () => {
  assert.deepEqual(Contract.validatePlan({ done: true, continue: false, steps: [] }), { done: true, steps: [] });
  const call = { tool: 'music.queue.play', args: { expectedRevision: 'v1', mode: 'shuffle' } };
  assert.deepEqual(Contract.validatePlan({ done: false, steps: [call] }), { steps: [call], continue: true });
  assert.deepEqual(Contract.validatePlan({ done: true, steps: [call] }), { steps: [call] });
  assert.throws(() => Contract.validatePlan({ done: true, steps: [{ tool: 'shell', args: {} }] }), /未接入/);
  assert.throws(() => Contract.validatePlan({ done: true, steps: [call] }, 'alarm'), /范围/);
});
