import assert from 'node:assert/strict';
import { createGateway } from '../../local-ai/gateway.mjs';
import Engine from '../../js/assistant-engine.js';
import Tools from '../../js/assistant-tools.js';

export const requestText = '首先清空播放列表，搜索《杨和苏》的热歌，添加到队列，随机播放。';
// Production planner/engine/tools; every external business dependency is isolated.
export async function runContextScenario({ provider, reasoning = 'low', onPlan = () => {} }) {
  const values = {}, effects = { clears: 0, applies: 0, plays: 0, searches: 0 }, plans = [];
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  let version = 1;
  let state = { status: 'ready', revision: 'fixture-version-1', count: 101, mode: 'sequence', isPlaying: false, currentSong: null, currentSongId: null,
    songs: Array.from({ length: 101 }, (_, i) => ({ songId: String(i + 1), title: `原队列歌曲${i + 1}`, artist: '原歌手' })), source: 'fixture', readAt: Date.now(), timer: null };
  const update = patch => state = { ...state, ...patch, revision: 'fixture-version-' + ++version, readAt: Date.now() };
  const checkRevision = revision => assert.equal(revision, state.revision, '写入必须使用最新状态版本');
  const gateway = createGateway({ provider });
  const handlers = Tools.create({ storage,
    memory: async () => ({ ok: true, revision: 1, enabled: true, preferences: [], artists: [] }),
    ai: async message => {
      assert.equal(message.action, 'ai_scene_submit', '复合需求不能退回单动作音乐解析');
      const result = await gateway.run(message.scene, message.input, { selection: message.selection });
      const entry = { scene: message.scene, data: result.data, budget: result.toolContext, execution: result.execution };
      plans.push(entry); onPlan(entry); return { ok: true, ...result };
    },
    readMusicState: async () => structuredClone(state),
    editMusicQueue: async (action, songId, revision) => {
      assert.equal(action, 'clear'); checkRevision(revision); effects.clears++;
      assert.equal(effects.clears, 1, '不能重复清空');
      return update({ status: 'empty', count: 0, songs: [], isPlaying: false, currentSong: null });
    },
    netease: async (path, params) => {
      if (path.includes('search')) {
        effects.searches++;
        assert.equal(params.type, 100, '热门歌曲应先定位歌手');
        return { code: 200, result: { artists: [{ id: 999, name: '杨和苏' }] } };
      }
      assert.ok(['/api/artist/top/song', '/api/v1/artist'].includes(path), '仅使用测试歌手曲目接口');
      return { code: 200, songs: Array.from({ length: 100 }, (_, i) => ({ id: 9000 + i, name: `热门歌曲${i + 1}`, ar: [{ name: '杨和苏' }], dt: 180000 })) };
    },
    applyMusicQueue: async (songs, args) => {
      checkRevision(args.expectedRevision); effects.applies++;
      assert.equal(effects.clears, 1); assert.equal(effects.applies, 1, '不能重复追加'); assert.equal(args.startPlayback, false, '随机播放之前只追加');
      assert.equal(songs.length, 100);
      return update({ songs, count: songs.length, status: 'ready' });
    },
    playCurrentQueue: async (revision, ref, ctx, mode) => {
      checkRevision(revision); effects.plays++;
      assert.equal(effects.applies, 1); assert.equal(effects.plays, 1, '不能重复起播'); assert.equal(mode, 'shuffle');
      return update({ mode, isPlaying: true, currentSong: state.songs[0], currentSongId: state.songs[0].songId });
    }
  });
  let seq = 0;
  const engine = Engine.create({ storage, ...handlers, id: () => `context-fixture-${++seq}` });
  await engine.submit({ app: 'music', text: requestText, ai: { reasoning } });
  let task = await engine.settled();
  // Simulate only the existing confirmation and selection cards, never call a
  // real account API or mutate the user's player while validating the model.
  for (let i = 0; i < 4 && ['waiting', 'review'].includes(task.status); i++) {
    const choice = task.status === 'review' ? task.choices.find(c => c.id === 'queue-edit-confirm') : task.choices.find(c => c.kind === 'artist' && !c.secondary);
    if (!choice) break;
    await engine.choose(task.id, choice.id, task.version);
    task = await engine.settled();
  }
  const passed = task.status === 'completed' && effects.clears === 1 && effects.applies === 1 && effects.plays === 1 && state.mode === 'shuffle' && state.isPlaying;
  return { passed, task, effects, plans, state: { count: state.count, mode: state.mode, isPlaying: state.isPlaying } };
}
