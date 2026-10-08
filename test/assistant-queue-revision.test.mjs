import test from 'node:test';
import assert from 'node:assert/strict';
import Contract from '../js/assistant-contract.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { plan } from '../local-ai/assistant-service.mjs';
import { createGateway } from '../local-ai/gateway.mjs';

const step = (tool, args = {}) => ({ steps: [{ tool, args }], continue: true });
const apply = revision => step('music.queue.apply', { ref: 'r10', mode: 'append', startPlayback: false, expectedRevision: revision });
const state = revision => ({ tool: 'music.state', status: 'done', message: '已读取队列', data: { status: 'ready', revision, count: 2 } });
const input = { app: 'music', text: '林俊杰热歌，添加队列，随机播放。', toolGroups: ['music.queue', 'music.playback'],
  context: { version: 1, revision: 5, summary: '', constraints: [], receipts: [] },
  observations: [{ tool: 'music.collection.get', status: 'done', message: '已读取50首曲目', data: { ref: 'r10', count: 50 } }] };
const run = (raw, observations = input.observations) => plan({ ...input, observations }, { generateObject: async () => raw });

test('真实失败计划：数字上下文版本不能写队列，先只读查询再重新规划', async () => {
  assert.throws(() => Contract.validatePlan(apply(5)), /音乐队列版本无效.*music.state/);
  const result = await run(apply(5));
  assert.deepEqual(result.data, step('music.state'));
  assert.equal(result.toolContext.revisionRecovery, 'music.state');
  const real = 'a'.repeat(64);
  assert.deepEqual((await run(apply(real), [...input.observations, state(real)])).data, apply(real));
});

test('缺失、伪造、旧版、失败和不可用状态均不能提供写入版本', async () => {
  for (const revision of [undefined, null, 5, '5', 'guessed']) {
    const raw = apply(revision); if (revision === undefined) delete raw.steps[0].args.expectedRevision;
    assert.deepEqual((await run(raw)).data, step('music.state'));
  }
  for (const receipt of [state('new'), { ...state('old'), status: 'failed' }, { ...state('old'), data: { status: 'stale', revision: 'old' } }]) {
    assert.deepEqual((await run(apply('old'), [state('old'), receipt])).data, step('music.state'));
  }
  const written = { tool: 'music.queue.apply', status: 'done', message: '已追加', data: { status: 'ready', revision: 'new' } };
  const play = step('music.queue.play', { expectedRevision: 'new', mode: 'shuffle' });
  assert.deepEqual((await run(play, [state('old'), written])).data, play);
});

test('过期缓存版本只允许明确播放保存队列，不允许其他队列写入', async () => {
  const revision = 's'.repeat(64);
  const stale = { ...state(revision), data: { status: 'stale', revision, count: 2 } };
  const play = step('music.queue.play', { expectedRevision: revision, mode: 'shuffle' });
  assert.deepEqual((await run(play, [stale])).data, play);
  const keep = step('music.queue.reconcile', { action: 'keep', expectedRevision: revision });
  assert.deepEqual((await run(keep, [stale])).data, keep);
  const unavailable = { ...stale, data: { ...stale.data, status: 'unavailable' } };
  const clear = step('music.queue.reconcile', { action: 'clear', expectedRevision: revision });
  assert.deepEqual((await run(clear, [unavailable])).data, clear);
  assert.deepEqual((await run(keep, [unavailable])).data, step('music.state'));
  assert.deepEqual((await run(apply(revision), [stale])).data, step('music.state'));
});

test('只读修复仍校验其他参数、工具可用性和应用范围，不吞掉unknown写入', async () => {
  const invalid = apply(5); invalid.steps[0].args.startPlayback = 'false';
  await assert.rejects(run(invalid), /播放标记/);
  await assert.rejects(run({ ...apply(5), extra: true }), /计划格式/);
  await assert.rejects(plan({ ...input, toolGroups: [], text: '查看队列' }, { generateObject: async () => apply(5) }), /尚未加载/);
  await assert.rejects(plan({ app: 'alarm', text: '复杂请求', observations: [{ tool: 'alarm.list', status: 'done', message: '已查询', data: null }] }, { generateObject: async () => apply(5) }), /范围/);
  const raw = apply('old');
  const result = await run(raw, [state('old'), { tool: 'music.queue.apply', status: 'unknown', message: '回执丢失', data: null }]);
  assert.deepEqual(result.data, raw, '未知态写入留给Engine拒绝，不能改写成已完成');
});

test('真实Engine/Tools：坏版本改为读取，追加一次，使用新版本随机播放一次', async () => {
  let round = 0, selected, collection, revision = 'before';
  const effects = [], values = {};
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const gateway = createGateway({ provider: { planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), async generateObject({ input }) {
    const last = input.observations.at(-1);
    if (input.planningPhase === 'outline') return { todoTips: [
        { text: '追加林俊杰歌单', source: 0, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
        { text: '随机播放', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }
      ] };
    switch (round++) {
      case 0: return step('music.search', { kind: 'playlist', query: '林俊杰' });
      case 1: selected = last.data.selectedRef; return step('music.collection.get', { ref: selected });
      case 2: collection = last.data.ref; return step('music.queue.apply', { ...apply(5).steps[0].args, ref: collection });
      case 3: assert.equal(last.tool, 'music.state'); return step('music.queue.apply', { ...apply(last.data.revision).steps[0].args, ref: collection });
      case 4: return step('music.queue.play', { expectedRevision: last.data.revision, mode: 'shuffle' });
      case 5: return { done: true };
      default: assert.fail('不能额外重放业务动作');
    }
  } } });
  const handlers = Tools.create({ storage,
    ai: async r => ({ ok: true, ...await gateway.run(r.scene, r.input, { trace: r.trace, selection: r.selection }) }),
    readMusicState: async () => ({ status: 'ready', revision, count: 2, songs: [] }),
    netease: async path => path.includes('search') ? { code: 200, result: { playlists: [{ id: 21, name: '林俊杰精选' }] } } : { code: 200, playlist: { trackIds: [{ id: 3 }], tracks: [{ id: 3, name: '测试曲目' }], trackCount: 1 } },
    applyMusicQueue: async (songs, args) => {
      assert.equal(args.expectedRevision, 'before'); assert.equal(args.startPlayback, false); assert.equal(args.mode, 'append');
      effects.push('append'); revision = 'after'; return { status: 'ready', revision, count: 3 };
    },
    playCurrentQueue: async (expected, song, ctx, mode) => {
      assert.equal(expected, 'after'); assert.equal(mode, 'shuffle'); effects.push('shuffle');
      return { status: 'ready', revision: 'playing', count: 3, isPlaying: true, mode };
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '林俊杰歌单，添加队列，随机播放。' });
  const waiting = await engine.settled(); assert.equal(waiting.status, 'waiting');
  await engine.choose(waiting.id, waiting.choices.find(c => !c.secondary).id, waiting.version);
  const done = await engine.settled();
  assert.equal(done.status, 'completed', done.message); assert.deepEqual(effects, ['append', 'shuffle']);
  assert.equal(round, 6);
});
