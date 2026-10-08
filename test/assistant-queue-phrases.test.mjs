import test from 'node:test';
import assert from 'node:assert/strict';
import Music from '../js/music-intent.js';
import Contract from '../js/assistant-contract.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Todo from '../js/assistant-todo.js';

const shuffle = { mode: 'shuffle' };

test('队列播放语法覆盖真实说法，并区分随机与顺序播放', () => {
  for (const text of ['随机播放队里的歌曲', '随机播放队列中的歌曲', '随机播放当前队列', '随机播放已有队列', '随机播放队里中的歌曲', '随机播放队列歌曲',
    '随机播放列表歌曲', '随机播放列表里的歌曲', '随机播放列表', '随机播放当前列表', '随机播放播放列表', '随机播放一下队列', '请随机播放当前队列',
    '把队列随机播放', '列表歌曲随机播放', '队列里的歌曲随机播放', '队列随机播放', '随机播放列表歌曲。', '帮我随机播放队列里面的歌曲吧']) {
    assert.deepEqual(Music.queuePlayRequest(text), shuffle, text);
  }
  for (const text of ['播放队列', '播放队列里的歌曲', '播放列表歌曲', '听队列里的歌', '播放队列吧', '播放一下当前队列', '队列播放', '列表歌曲播放']) {
    assert.deepEqual(Music.queuePlayRequest(text), {}, text);
  }
});

test('含歌手、条件、复合、指代或多余对象的说法一律不命中', () => {
  for (const text of ['随机播放添加到队列里的歌曲', '随机播放周杰伦的歌曲', '如果队列有歌就随机播放', '随机播放歌单', '随机播放歌单里的歌', '播放列表', '听列表',
    '播放当前列表', '播放我的收藏列表', '随机播放队列里的周杰伦', '清空队列后随机播放', '随机播放队列然后30分钟后停止', '播放队列里的下一首',
    '随机播放歌曲', '播放歌曲', '随机播放这些歌曲', '随机播放我的队列', '', '随机', '队列']) {
    assert.equal(Music.queuePlayRequest(text), null, text);
    assert.equal(Music.queuePlayRequest(text, { bare: true }), null, `${text}（允许裸随机播放时）`);
  }
});

test('裸“随机播放”只在调用方允许时命中，且不误伤带对象的说法', () => {
  for (const text of ['随机播放', '随机播放。', '请随机播放', '帮我随机播放一下', '随机播放吧']) {
    assert.equal(Music.queuePlayRequest(text), null, text);
    assert.deepEqual(Music.queuePlayRequest(text, { bare: true }), shuffle, text);
  }
  for (const text of ['随机播放周杰伦', '没问题，可以直接随机播放。', '播放', '听']) {
    assert.equal(Music.queuePlayRequest(text, { bare: true }), null, text);
  }
});

test('歌手识别与本地解析不会把队列说法当成歌曲搜索', () => {
  for (const text of ['随机播放列表歌曲', '列表歌曲随机播放', '随机播放队列歌曲', '播放列表歌曲', '随机播放']) {
    assert.equal(Music.artistRequest(text), null, text);
    assert.equal(Music.parseLocal(text), null, text);
  }
});

function store() {
  const data = {};
  return { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); }, async remove(key) { delete data[key]; }, data };
}
const context = task => {
  const ctx = { task, guard() {}, async progress() {}, async trace(_tool, _title, _input, fn) { return fn(ctx); } };
  return ctx;
};

test('路由：无候选的裸“随机播放”是新的音乐需求；有候选时保持续接', () => {
  for (const current of [null, { scope: 'music', status: 'completed', choices: [] }, { scope: 'alarm', status: 'completed' }]) {
    const routed = Contract.routeRequest({ text: '随机播放。' }, current);
    assert.equal(routed.mode, 'new'); assert.equal(routed.input.app, 'music');
  }
  const waiting = { scope: 'music', status: 'waiting', choices: [{ id: 'song-1' }], candidateSet: { choices: [{ id: 'song-1' }] } };
  const kept = Contract.routeRequest({ text: '随机播放' }, waiting);
  assert.equal(kept.mode, 'continue'); assert.equal(kept.input.app, 'music');
  assert.equal(Contract.routeRequest({ text: '随机播放列表歌曲' }, waiting).mode, 'new', '明确的队列说法不受候选影响');
  assert.equal(Contract.hasCandidates({ candidateSet: { choices: [{ id: 'a' }] } }), true);
  assert.equal(Contract.hasCandidates({ choices: [] }), false);
  assert.equal(Contract.hasCandidates(null), false);
});

test('真实说法走确定性快速路径：读一次状态、播放一次、不调用模型', async () => {
  for (const [text, mode] of [['随机播放列表歌曲', 'shuffle'], ['列表歌曲随机播放', 'shuffle'], ['随机播放队列歌曲', 'shuffle'], ['随机播放队里中的歌曲', 'shuffle'], ['随机播放。', 'shuffle'], ['随机播放', 'shuffle'], ['播放列表歌曲', undefined]]) {
    const storage = store(); let reads = 0, plays = 0, modelCalls = 0;
    const handlers = Tools.create({ storage,
      readMusicState: async () => { reads++; return { status: 'ready', revision: 'queue-v1', count: 3, mode: 'loop', isPlaying: false, songs: [] }; },
      playCurrentQueue: async (revision, _songId, _ctx, playMode) => {
        assert.equal(revision, 'queue-v1'); assert.equal(playMode, mode); plays++;
        return { status: 'ready', revision: 'queue-v2', count: 3, mode: mode || 'loop', isPlaying: true, currentSong: { title: '测试歌曲', artist: '测试歌手' } };
      },
      ai: async () => { modelCalls++; throw new Error(`${text} 不应调用模型`); }
    });
    const engine = Engine.create({ storage, ...handlers });
    await engine.submit({ text });
    const result = await engine.settled();
    assert.equal(result.status, 'completed', `${text}: ${result.message}`);
    assert.equal(modelCalls, 0, text); assert.equal(reads, 1, text); assert.equal(plays, 1, text);
    assert.equal(result.recoveryCount, 0, text);
  }
});

test('有待选候选时裸“随机播放”交给完整规划，无候选时命中快速路径', async () => {
  const input = { app: 'music', text: '随机播放' };
  const task = extra => ({ id: 'bare', input, todoTips: Todo.create(input), observations: [], turns: [], log: [], memory: {}, startedAt: Date.now(), ...extra });
  let modelCalls = 0;
  const handlers = Tools.create({
    readMusicState: async () => { throw new Error('快速路径之外不应读取队列'); },
    ai: async request => { modelCalls++; assert.equal(request.input.planningPhase, 'outline'); return { ok: true, data: { question: '交给完整规划处理' } }; }
  });
  const planned = await handlers.plan(input, context(task({ choices: [{ id: 'song-1', title: '候选歌曲' }] })));
  assert.equal(planned.question, '交给完整规划处理'); assert.equal(modelCalls, 1);
  const quick = await handlers.plan(input, context(task({ choices: [] })));
  assert.equal(quick.todoTips[0].tool, 'music.queue.play'); assert.deepEqual(quick.todoTips[0].args, { mode: 'shuffle' });
  assert.equal(modelCalls, 1, '快速路径不再调用模型');
});
