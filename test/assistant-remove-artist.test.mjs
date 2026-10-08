import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import Queue from '../js/music-queue-policy.js';
import Contract from '../js/assistant-contract.js';
import Tools from '../js/assistant-tools.js';
import Engine from '../js/assistant-engine.js';
import { createGateway } from '../local-ai/gateway.mjs';

const text = '清除队里中许嵩的歌曲';
const songs = () => Array.from({ length: 150 }, (_, i) => ({ songId: String(i + 1), title: `曲目${i + 1}`, artist: i < 50 ? i % 2 ? '许嵩 / 何曼婷' : '许嵩' : i < 100 ? '法老' : '许巍' }));
function fixture({ current = '80', loseReceipt = false, artist = '许嵩' } = {}) {
  let state = { status: 'ready', revision: 'v1', songs: songs(), count: 150, currentSongId: current, isPlaying: true, mode: 'shuffle' };
  const values = {}, effects = [], phases = [];
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const gateway = createGateway({ provider: { planningContext: async () => ({ contextLength: 40960 }), async generateObject({ input, instructions }) {
    phases.push(input.planningPhase);
    if (input.planningPhase === 'outline') return { todoTips: [{ text: `移除${artist}的队列歌曲`, source: 0, tool: 'music.queue.removeArtist', args: { artist } }] };
    assert.match(instructions, /music.queue.removeArtist/);
    if (input.observations.some(row => row.status === 'unknown')) return { question: '写入结果未知，请核对实际队列，不会自动重做。' };
    if (input.todoTips.items.every(row => row.status === 'completed')) return { done: true };
    const latest = input.observations.findLast(row => row.status === 'done' && row.data?.revision);
    return latest ? { steps: [{ tool: 'music.queue.removeArtist', args: { artist, expectedRevision: latest.data.revision } }], continue: true }
      : { steps: [{ tool: 'music.state', args: {} }], continue: true };
  } } });
  const handlers = Tools.create({ storage,
    netease: async () => assert.fail('队列移除不能发起云端搜索'),
    ai: async message => ({ ok: true, ...await gateway.run(message.scene, message.input) }),
    readMusicState: async () => structuredClone(state),
    editMusicQueue: async (action, ids, revision) => {
      assert.equal(action, 'remove-many'); assert.equal(revision, state.revision);
      effects.push([...ids]);
      const next = Queue.removeSongs(state.songs, ids), stops = ids.includes(state.currentSongId);
      state = { ...state, songs: next, count: next.length, revision: 'v2', ...(stops ? { isPlaying: false, currentSongId: null } : {}) };
      if (loseReceipt) throw new Error('写入已发生但回执丢失');
      return structuredClone(state);
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  return { engine, handlers, effects, values, phases, state: () => state, change: patch => { state = { ...state, ...patch }; } };
}

test('口语清除队里请求不再进入单动作搜索，并成为独立需求', () => {
  for (const value of [text, '移除队列中许嵩的歌', '删除播放列表里的许嵩歌曲']) assert.equal(Contract.localPlan({ app: 'music', text: value }), null);
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'music.queue.removeArtist', args: { artist: '长'.repeat(81), expectedRevision: 'v1' } }] }), /完整歌手名/);
  const route = Contract.routeRequest({ text, app: 'music' }, { id: 'old', status: 'cancelled', scope: 'music' });
  assert.equal(route.mode, 'new');
  assert.throws(() => Contract.validatePlan({ steps: [{ tool: 'music.queue.removeArtist', args: { artist: '许嵩', expectedRevision: 'v1' } }] }, 'alarm'), /范围/);
});

test('匹配完整歌手名及合唱，不匹配相似名字；队列或元数据不完整时拒绝', () => {
  const list = [...songs(), { songId: '151', artist: '许嵩翻唱', title: '不能误删' }];
  assert.equal(Queue.songsByArtist(list, '许嵩').length, 50);
  assert.equal(Queue.songsByArtist([{ songId: '1', artist: 'AC/DC / Brian' }], 'AC/DC').length, 1);
  assert.equal(Queue.songsByArtist([{ songId: '1', artists: [{ name: '许嵩' }, { name: '合唱者' }] }], '许嵩').length, 1);
  assert.equal(Queue.songsByArtist([{ songId: '1', artist: '许嵩', artists: [{ name: '许巍' }] }], '许嵩').length, 0);
  assert.throws(() => Queue.songsByArtist([{ songId: '1' }], '许嵩'), /缺少歌手信息/);
  assert.throws(() => Queue.songsByArtist(Array(301).fill(list[0]), '许嵩'), /范围/);
  for (const ids of [['1', '1'], ['999'], [], Array(301).fill('1')]) assert.throws(() => Queue.removeSongs(list, ids));
});

test('150首队列：一次确认一次删除50首，保留其余100首及当前播放，不逐页规划', async () => {
  const f = fixture(); await f.engine.submit({ app: 'music', text });
  const review = await f.engine.settled(); assert.equal(review.status, 'review', review.message);
  assert.match(review.message, /50首/); assert.equal(f.effects.length, 0);
  assert.equal(review.todoTips.items[0].status, 'review');
  await f.engine.choose(review.id, review.choices[0].id, review.version);
  const done = await f.engine.settled(); assert.equal(done.status, 'completed', done.message);
  assert.equal(f.effects.length, 1); assert.equal(f.effects[0].length, 50);
  assert.equal(f.state().count, 100); assert.equal(f.state().currentSongId, '80'); assert.equal(f.state().isPlaying, true);
  assert.equal(done.todoTips.items[0].status, 'completed'); assert.equal(f.phases.length, 4);
  assert.ok(!done.log.some(row => ['music.intent', 'music.queue.list', 'music.search'].includes(row.tool)));
  await assert.rejects(f.engine.choose(review.id, review.choices[0].id, review.version));
});

test('命中当前曲目时停止，不自动切歌；零匹配直接给出真实零条回执', async () => {
  const f = fixture({ current: '1' }); await f.engine.submit({ app: 'music', text });
  const review = await f.engine.settled(); assert.match(review.message, /将停止播放/);
  await f.engine.choose(review.id, review.choices[0].id, review.version);
  assert.equal((await f.engine.settled()).status, 'completed'); assert.equal(f.state().isPlaying, false); assert.equal(f.state().currentSongId, null);
  const none = fixture({ artist: '周杰伦' }); await none.engine.submit({ app: 'music', text: '清除队列中周杰伦的歌曲' });
  const result = await none.engine.settled(); assert.equal(result.status, 'completed', result.message); assert.equal(none.effects.length, 0);
  assert.match(result.message, /没有歌手/); assert.equal(result.todoTips.items[0].status, 'completed');
});

test('取消确认、确认后队列变化和元数据变化均不能提交旧的删除集合', async () => {
  for (const change of ['cancel', 'revision', 'metadata', 'fm']) {
    const f = fixture(); await f.engine.submit({ app: 'music', text }); const review = await f.engine.settled();
    if (change === 'cancel') {
      await f.engine.cancel(review.id); await assert.rejects(f.engine.choose(review.id, review.choices[0].id, review.version));
    } else {
      f.change(change === 'revision' ? { revision: 'changed' } : change === 'fm' ? { queueType: 'personal-fm' } : { songs: f.state().songs.map((song, i) => i === 0 ? { ...song, artist: '其他歌手' } : song) });
      const ctx = { task: f.values[Engine.KEY], guard() {} };
      await assert.rejects(f.handlers.choose(f.values[Engine.KEY].choices[0], ctx), /确认已失效/);
    }
    assert.equal(f.effects.length, 0);
  }
});

test('批量写回执丢失保持unknown，不重新删除或勾选完成', async () => {
  const f = fixture({ loseReceipt: true }); await f.engine.submit({ app: 'music', text }); const review = await f.engine.settled();
  await f.engine.choose(review.id, review.choices[0].id, review.version); const result = await f.engine.settled();
  assert.equal(result.status, 'clarify'); assert.equal(f.effects.length, 1);
  assert.notEqual(result.todoTips.items[0].status, 'completed'); assert.equal(f.values[Engine.KEY].contextState.uncertain, true);
});

test('真实后台编辑函数：批量移除一次写入，当前曲目在集合内才停止', async () => {
  const source = readFileSync(new URL('../js/background.js', import.meta.url), 'utf8');
  const start = source.indexOf('    async function editAssistantMusicQueue('), end = source.indexOf('\n    const quickAssistant', start);
  for (const current of ['1', '80']) {
    let writes = 0, stops = 0;
    const initial = songs(), cache = { playlist: initial, savedAt: 1, assistantRevision: 'v1' };
    const audio = { songId: current, isPlaying: true };
    const before = { songs: initial, count: 150, currentSongId: current, cacheStamp: JSON.stringify([cache.savedAt, cache.assistantRevision, cache.playlist]) };
    const scope = { MusicQueuePolicy: Queue, assistantMusicRevision: 0, silentMusicPlayback: { songs: initial, index: Number(current) - 1 }, crypto: { randomUUID: () => 'v2' },
      assertAssistantMusicRevision: async expected => { assert.equal(expected, 'v1'); return before; },
      sendToOffscreen: async (request, guard) => { guard(); assert.equal(request.command, 'stop'); stops++; audio.songId = null; audio.isPlaying = false; return { ok: true }; },
      waitAssistantPlayback: async check => assert.ok(check(audio)),
      readAssistantMusicState: async () => ({ songs: cache.playlist, count: cache.playlist.length, currentSongId: audio.songId, isPlaying: audio.isPlaying }),
      chrome: { storage: { local: { get: async () => ({ musicPlaylistCache: cache }), remove: async () => {}, set: async value => { writes++; Object.assign(cache, value.musicPlaylistCache); } } } } };
    vm.runInNewContext(source.slice(start, end) + '\nglobalThis.edit = editAssistantMusicQueue;', scope);
    const result = await scope.edit('remove-many', initial.slice(0, 50).map(song => song.songId), 'v1', { guard() {} });
    assert.equal(writes, 1); assert.equal(stops, current === '1' ? 1 : 0); assert.equal(result.count, 100);
    if (current === '80') assert.equal(scope.silentMusicPlayback.index, 29);
    else assert.equal(scope.silentMusicPlayback, null);
    scope.silentMusicPlayback = { mode: 'personal-fm' };
    await assert.rejects(scope.edit('remove-many', ['51'], 'v1', { guard() {} }), /私人FM/);
    assert.equal(writes, 1);
  }
});
