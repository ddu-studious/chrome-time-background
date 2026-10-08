import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';

const step = (tool, args = {}, more = true) => ({ steps: [{ tool, args }], ...(more ? { continue: true } : {}) });
const state = revision => ({ status: 'ready', revision, count: 3, mode: 'sequence', isPlaying: false, songs: [] });
const playing = mode => ({ status: 'ready', revision: 'v2', count: 3, mode, isPlaying: true, currentSong: { title: '测试歌曲', artist: '测试歌手' } });
const defaultOutline = text => [{ text, source: 0, ...(/随机播放/.test(text) ? { tool: 'music.queue.play', args: { mode: 'shuffle' } } : { tool: 'music.state' }) }];

function fixture(responses, deps = {}, outline = defaultOutline) {
  const values = {}, inputs = [];
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const gateway = createGateway({ control: createControlStore(), provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), async generateObject(request) {
    if (request.input.planningPhase === 'outline') return { todoTips: outline(request.input.text) };
    inputs.push(structuredClone(request.input));
    assert.ok(responses.length, '不应产生额外规划');
    return responses.shift();
  } } });
  const handlers = Tools.create({ storage, readMusicState: async () => state('v1'), ...deps,
    ai: async request => ({ ok: true, ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }) });
  let sequence = 0;
  return { values, inputs, responses, engine: Engine.create({ storage, ...handlers, id: () => `no-progress-${++sequence}` }) };
}
async function submit(f, text, app = 'music') {
  await f.engine.submit({ text, app });
  return f.engine.settled();
}

test('重放 09-23 空转：相同的只读查询只执行一次，模型最多规划三次', async () => {
  let reads = 0;
  const f = fixture([step('music.state'), step('music.state'), step('music.state'), step('music.state')], {
    readMusicState: async () => { reads++; return { ...state('stale-v1'), status: 'stale' }; }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'failed', task.message);
  assert.match(task.message, /同一操作重复失败/);
  assert.match(task.message, /已读取过完全相同/);
  assert.equal(reads, 1);
  assert.equal(f.inputs.length, 3);
  assert.equal(f.responses.length, 1, '第三次重复后不再向模型要第四次规划');
  assert.equal(task.recoveryCount, 1);
  const feedback = f.inputs[2].observations.at(-1);
  assert.equal(feedback.status, 'failed');
  assert.equal(feedback.data.error.code, 'ASSISTANT_PLAN_INVALID');
  assert.match(feedback.message, /已读取过完全相同/);
});

test('重复读取被拒绝一次后，模型改用不同的下一步可以继续', async () => {
  let reads = 0, plays = 0;
  const f = fixture([step('music.state'), step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), { done: true }], {
    readMusicState: async () => { reads++; return state('v1'); },
    playCurrentQueue: async (revision, _songId, _ctx, mode) => { assert.equal(revision, 'v1'); assert.equal(mode, 'shuffle'); plays++; return playing(mode); }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(reads, 1); assert.equal(plays, 1); assert.equal(task.recoveryCount, 1);
});

test('写入之后允许重新读取：读取、播放、再读取都不会被拦截', async () => {
  let reads = 0, plays = 0;
  const outline = () => [{ text: '随机播放队列', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }, { text: '核对播放状态', source: 1, tool: 'music.state' }];
  const f = fixture([step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), step('music.state'), { done: true }], {
    readMusicState: async () => { reads++; return reads === 1 ? state('v1') : playing('shuffle'); },
    playCurrentQueue: async (revision, _songId, _ctx, mode) => { assert.equal(revision, 'v1'); plays++; return playing(mode); }
  }, outline);
  const task = await submit(f, '随机播放队列\n核对播放状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(reads, 2); assert.equal(plays, 1); assert.equal(task.recoveryCount, 0);
});

test('参数不同的只读调用不算重复', async () => {
  const f = fixture([step('tools.load', { group: 'music.queue' }), step('tools.load', { group: 'music.edit' }), step('music.state'), { done: true }]);
  const task = await submit(f, '检查队列状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 0);
  assert.deepEqual(f.values[Engine.KEY].memory.toolGroups.slice(0, 2), ['music.queue', 'music.edit']);
});

test('重复加载同一工具组在规划阶段被拒绝，不进入执行器', async () => {
  const f = fixture([step('tools.load', { group: 'music.queue' }), step('tools.load', { group: 'music.queue' }), step('music.state'), { done: true }]);
  const task = await submit(f, '检查队列状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 1);
  const feedback = f.inputs[2].observations.at(-1);
  assert.equal(feedback.data.error.code, 'ASSISTANT_PLAN_INVALID');
  assert.match(feedback.message, /已读取过完全相同/);
});

test('读取失败或写入回执丢失后允许核对读取', async () => {
  let reads = 0, plays = 0;
  const f = fixture([step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), step('music.state', {}, false)], {
    readMusicState: async () => { reads++; return state('v1'); },
    playCurrentQueue: async () => { plays++; throw new Error('已提交，但回执通道断开'); }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'clarify', task.message);
  assert.equal(reads, 2); assert.equal(plays, 1);
  assert.equal(f.inputs.at(-1).observations.at(-1).status, 'unknown');
  assert.equal(task.recoveryCount, 1);
});

test('选择开始新的执行轮，并清空已读记录', async () => {
  const now = Date.now();
  const values = { [Engine.KEY]: { id: 'seed', version: 1, status: 'waiting', scope: 'music', input: { text: '搜索候选', app: 'music' },
    plan: [{ tool: 'video.search', args: {} }], index: 0, adaptive: false, jobId: null,
    log: [{ tool: 'video.search', title: '搜索视频', status: 'waiting' }], turns: [], messages: [], trace: [], memory: {}, observations: [],
    choices: [{ id: 'c1', title: '候选一', action: 'music.play', data: {} }], keepChoices: true,
    candidateSet: { choices: [{ id: 'c1', title: '候选一', action: 'music.play', data: {} }], expiresAt: now + 60000 },
    readSeen: ['music.state\n{}'], startedAt: now, updatedAt: now } };
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const engine = Engine.create({ storage, plan: async () => ({ done: true, steps: [] }), execute: async () => ({ message: '不应执行' }), choose: async () => ({ message: '已执行所选操作' }) });
  assert.equal((await engine.snapshot()).status, 'waiting');
  await engine.choose('seed', 'c1', 1);
  const result = await engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.deepEqual(values[Engine.KEY].readSeen, []);
});
