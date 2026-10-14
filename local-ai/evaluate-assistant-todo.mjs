// Opt-in real Gateway/model evaluation. Every music operation is a test double.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Queue from '../js/music-queue-policy.js';
import { createGateway } from './gateway.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { LMStudioProvider } from './provider.mjs';

const removeArtist = process.argv.includes('--remove-artist');
const recommend = process.argv.includes('--recommend');
const followUp = process.argv.includes('--follow-up');
if ([removeArtist, recommend, followUp].filter(Boolean).length > 1) { console.error('--remove-artist、--recommend、--follow-up 只能选择一个'); process.exit(2); }
const inProcess = process.argv.includes('--in-process');
if (followUp && !inProcess) { console.error('--follow-up 需要同时使用 --in-process'); process.exit(2); }
const strategy = process.argv.find(arg => arg.startsWith('--strategy='))?.slice('--strategy='.length) || 'follow';
if (!['follow', 'adaptive'].includes(strategy)) { console.error('--strategy 只能是 follow 或 adaptive'); process.exit(2); }

if (!process.argv.includes('--live') && !inProcess) {
  console.log('使用 --live 经鉴权网关验证真实模型与 Todo 全流程；音乐查询、清空、追加和播放全部使用测试替身。');
  console.log('使用 --in-process [--strategy=follow|adaptive] 在进程内创建独立网关（内存策略与历史，不读取生产令牌、不写生产记录），比较规划思考起步策略。');
  console.log('追加 --recommend 验证“帮我推荐一些歌曲，加入歌单，随机播放”：模拟已启用个人记忆（偏好与召回背景都会随请求发送），歌单搜索、队列与播放均为替身，点击由脚本代选第一个歌单。');
  console.log('追加 --follow-up（需 --in-process）验证分析阶段追问后的补充答复：第一次分析的追问由脚本给出（不是模型输出），答复“许嵩”后的第二次分析与后续规划由真实本机模型完成；音乐依赖与点击均为替身。');
} else {
  // In-process mode never reads the production token and never writes production policy, usage or history.
  const token = inProcess ? null : readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || data.error || '网关请求失败');
    return data;
  };
  const gateway = inProcess ? (() => {
    const control = createControlStore();
    control.update({ ...control.snapshot().policy, reasoning: 'low', planningStrategy: strategy }, 1);
    return createGateway({ control, history: createHistoryStore(), provider: new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN }) });
  })() : null;
  if (!inProcess) {
    const control = await request('/v1/control');
    assert.equal(control.jobs.length, 0, '有运行中的任务，稍后再验证');
  }
  const started = Date.now(), values = {}, effects = [], plans = [], jobs = new Set();
  let sequence = 0, revision = 1, questionScripted = false;
  const askedQuestion = '要搜索哪位歌手的热歌？';
  let state = recommend || followUp ? { status: 'empty', revision: 'fixture-1', count: 0, songs: [], mode: 'sequence', isPlaying: false }
    : { status: 'ready', revision: 'fixture-1', count: 50, songs: [], mode: 'sequence', isPlaying: false };
  if (removeArtist) state = { ...state, songs: Array.from({ length: 150 }, (_, i) => ({ songId: String(i + 1), title: `测试曲目${i + 1}`, artist: i < 50 ? i % 2 ? '许嵩 / 合唱者' : '许嵩' : '法老' })), count: 150, currentSongId: '80', isPlaying: true, mode: 'shuffle' };
  const update = patch => state = { ...state, ...patch, revision: `fixture-${++revision}` };
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  const handlers = Tools.create({ storage,
    // Recommendation runs reproduce the production input: enabled memory sends both default preferences and a recalled background.
    memory: async () => recommend ? ({ ok: true, revision: 1, enabled: true, preferences: [], artists: [],
      notes: [{ key: 'like-rock', app: 'music', value: '我喜欢摇滚', updatedAt: started }],
      experiences: [{ key: 'music:searched:热门摇滚歌单', app: 'music', action: 'searched', searched: true, query: '摇滚', title: '热门摇滚歌单', message: '已搜索歌单', at: started, updatedAt: started }] }) : ({ ok: true, enabled: false }),
    ai: async message => {
      if (inProcess) {
        if (message.action !== 'ai_scene_submit') throw new Error(`验证不允许调用 ${message.action}`);
        // Deterministic stand-in for an outline that cannot decide the artist. Only this first question is scripted;
        // the model is still evaluated on everything after the user's answer.
        if (followUp && !questionScripted && message.scene === 'assistant.plan' && message.input?.planningPhase === 'outline') {
          questionScripted = true;
          const data = { question: askedQuestion, steps: [] };
          plans.push({ data, scripted: true });
          console.log(JSON.stringify({ plan: data, scripted: true }));
          return { ok: true, status: 'ready', source: 'script', data };
        }
        try {
          const result = await gateway.run(message.scene, message.input, { selection: message.selection, trace: message.trace });
          plans.push({ data: result.data, execution: result.execution });
          console.log(JSON.stringify({ plan: result.data, elapsedMs: result.execution?.elapsedMs, reasoning: result.execution?.effectiveReasoning, startReason: result.execution?.startReason }));
          return { ok: true, ...result };
        } catch (error) {
          plans.push({ error: { code: error.code, message: error.message }, execution: error.execution });
          console.log(JSON.stringify({ error: error.message, code: error.code, elapsedMs: error.execution?.elapsedMs }));
          throw error;
        }
      }
      let result;
      if (message.action === 'ai_scene_submit') result = await request('/v1/ai/interpret', { scene: message.scene, input: message.input, selection: message.selection, trace: message.trace });
      else if (message.action === 'ai_scene_result') result = await request(`/v1/ai/jobs/${message.jobId}`);
      else if (message.action === 'ai_job_cancel') return request(`/v1/ai/jobs/${message.jobId}/cancel`, {});
      else throw new Error(`验证不允许调用 ${message.action}`);
      if (result.jobId) jobs.add(result.jobId);
      if (result.status !== 'pending') {
        jobs.delete(message.jobId);
        plans.push({ data: result.data, error: result.error, execution: result.execution });
        console.log(JSON.stringify({ plan: result.data, error: result.error, elapsedMs: result.execution?.elapsedMs }));
      }
      return result;
    },
    readMusicState: async () => structuredClone(state),
    editMusicQueue: async (action, song, expected) => {
      if (removeArtist) {
        assert.equal(action, 'remove-many'); assert.equal(expected, state.revision); assert.equal(song.length, 50); assert.equal(effects.length, 0);
        effects.push('remove:50');
        const songs = Queue.removeSongs(state.songs, song);
        return update({ songs, count: songs.length });
      }
      assert.equal(action, 'clear'); assert.equal(expected, state.revision); assert.ok(!effects.includes('clear'));
      effects.push('clear'); return update({ status: 'empty', count: 0, songs: [] });
    },
    netease: async (path, params) => {
      assert.ok(!removeArtist, '批量移除不能调用云端搜索');
      if (recommend) {
        if (path.includes('search')) {
          assert.equal(params.type, 1000, '推荐只能搜索真实歌单');
          effects.push(`search:${params.s}`);
          return { code: 200, result: { playlists: [{ id: 501, name: '热门歌曲精选', trackCount: 3, creator: { nickname: '测试' } }, { id: 502, name: '轻松歌单', trackCount: 3, creator: { nickname: '测试' } }], playlistCount: 2 } };
        }
        assert.equal(path, '/api/v6/playlist/detail');
        return { code: 200, playlist: { trackCount: 3, trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }], tracks: [1, 2, 3].map(id => ({ id, name: `推荐${id}`, ar: [{ name: '测试歌手' }], dt: 180000 })) } };
      }
      if (path.includes('search')) {
        assert.equal(params.type, 100); assert.ok(['许嵩', '法老'].includes(params.s));
        effects.push(`search:${params.s}`);
        return { code: 200, result: { artists: [{ id: params.s === '许嵩' ? 101 : 102, name: params.s }] } };
      }
      assert.ok(['/api/artist/top/song', '/api/v1/artist'].includes(path));
      return { code: 200, songs: [{ id: Number(params.id) + 1000, name: '测试热歌', ar: [{ name: '测试歌手' }], dt: 180000 }] };
    },
    applyMusicQueue: async (songs, args) => {
      assert.equal(args.expectedRevision, state.revision); assert.equal(args.mode, 'append'); assert.equal(args.startPlayback, false);
      effects.push('append'); return update({ status: 'ready', count: state.count + songs.length, songs: [...state.songs, ...songs] });
    },
    playCurrentQueue: async (expected, ref, ctx, mode) => {
      assert.equal(expected, state.revision); assert.equal(state.count, followUp ? 1 : recommend ? 3 : 2); assert.equal(mode, 'shuffle');
      effects.push('shuffle'); return update({ isPlaying: true, mode, currentSong: state.songs[0] });
    }
  });
  const engine = Engine.create({ storage, ...handlers, id: () => `todo-evaluation-${started}-${++sequence}` });
  const report = { at: new Date(started).toISOString(), passed: false,
    boundary: inProcess ? `进程内 Gateway（内存策略与历史，不读生产令牌、不写生产记录）、真实 LM Studio 本机模型和生产 Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号${followUp ? '；第一次分析的追问由脚本给出，不是模型输出' : ''}`
      : '真实鉴权HTTP/Gateway/本机模型和生产Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号',
    ...(inProcess ? { strategy, reasoning: 'low' } : {}) };
  try {
    const original = removeArtist ? '清除队里中许嵩的歌曲' : recommend ? '帮我推荐一些歌曲，加入歌单，随机播放。' : followUp ? '搜索歌手热歌加入队列\n随机播放添加到队列里的歌曲' : '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲';
    await engine.submit({ app: 'music', text: original, ai: { reasoning: 'low' } });
    let task = await engine.settled();
    if (followUp) {
      assert.equal(task.status, 'clarify', task.message);
      assert.equal(task.message, askedQuestion);
      await engine.submit({ app: 'music', text: '许嵩', ai: { reasoning: 'low' } });
      task = await engine.settled();
    }
    for (let i = 0; i < 3 && ['review', 'waiting'].includes(task.status); i++) {
      const choice = task.status === 'review' ? task.choices.find(row => row.id === (removeArtist ? 'queue-artist-confirm' : 'queue-edit-confirm'))
        : task.choices.find(row => row.kind === (recommend ? 'playlist' : 'artist') && !row.secondary);
      assert.ok(choice, recommend ? '只能自动选择测试歌单' : '只能自动选择测试清空确认或测试歌手');
      await engine.choose(task.id, choice.id, task.version); task = await engine.settled();
    }
    report.task = task;
    // Existing scenarios require the very first request to be a complete outline. A recommendation run may recover
    // from a failed outline; that is still reported through the planning-failure metrics below.
    const outline = recommend || followUp ? plans.find(row => row.data?.todoTips?.length) : plans[0];
    assert.ok(outline, '必须得到完整清单');
    if (!recommend && !followUp) assert.equal(outline.data?.todoTips?.length, removeArtist ? 1 : 4, '首先独立分析完整清单');
    assert.deepEqual(outline.data?.steps, [], '分析阶段不执行任何工具');
    assert.equal(task.status, 'completed', task.message);
    assert.ok(task.todoTips.items.every(row => row.status === 'completed' && row.receiptId));
    if (recommend) {
      report.outline = task.todoTips.items.map(row => ({ text: row.text, tool: row.tool, args: row.args }));
      assert.equal(effects.length, 3, `写入与查询次数异常：${effects.join(',')}`);
      assert.ok(effects[0].startsWith('search:') && effects[0] !== 'search:推荐歌曲', `歌单搜索词不应是“推荐歌曲”：${effects[0]}`);
      assert.deepEqual(effects.slice(1), ['append', 'shuffle']);
    } else if (followUp) {
      // The answer must not replace the request: both original lines stay in the Todo and each is completed once.
      assert.equal(task.todoTips.goal, original);
      assert.deepEqual(task.todoTips.sources, original.split('\n'));
      assert.deepEqual(task.todoTips.items.map(row => [row.source, row.tool]), [[0, 'music.queue.apply'], [1, 'music.queue.play']]);
      assert.deepEqual(effects, ['search:许嵩', 'append', 'shuffle']);
      report.outline = task.todoTips.items.map(row => ({ text: row.text, tool: row.tool, args: row.args }));
      // Informational only: the prompt asks the model to carry the answer into the goal text, which is model quality, not safety.
      report.outlineMentionsAnswer = task.todoTips.items.some(row => row.text.includes('许嵩'));
    } else assert.deepEqual(effects, removeArtist ? ['remove:50'] : ['clear', 'search:许嵩', 'append', 'search:法老', 'append', 'shuffle']);
    if (removeArtist) { assert.equal(state.count, 100); assert.equal(state.currentSongId, '80'); assert.equal(state.isPlaying, true); }
    report.passed = true;
  } catch (error) { report.error = error.message; process.exitCode = 1; }
  finally { for (const id of jobs) await request(`/v1/ai/jobs/${id}/cancel`, {}).catch(() => {}); }
  const executions = plans.map(row => row.execution).filter(row => row?.scene === 'assistant.plan');
  report.metrics = {
    planningCalls: executions.length,
    planningMs: executions.reduce((sum, row) => sum + (row.elapsedMs || 0), 0),
    firstAttemptTimeouts: executions.filter(row => row.attempts?.[0]?.errorCode === 'MODEL_RESPONSE_TIMEOUT').length,
    offRetries: executions.filter(row => row.attempts?.length > 1).length,
    adaptiveStarts: executions.filter(row => row.startReason === 'adaptive-receipts').length,
    planningFailures: (report.task?.trace || []).filter(row => row.tool === 'assistant.plan' && row.status === 'failed').length,
    invalidPlans: (report.task?.trace || []).filter(row => row.tool === 'assistant.plan' && row.error?.code === 'ASSISTANT_PLAN_INVALID').length
  };
  Object.assign(report, { elapsedMs: Date.now() - started, effects, plans });
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-${removeArtist ? 'remove-artist' : recommend ? 'recommend' : followUp ? 'follow-up' : 'todo'}${inProcess ? `-${strategy}` : ''}-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, ...(inProcess ? { strategy } : {}), effects, elapsedMs: report.elapsedMs, metrics: report.metrics, report: output.pathname }));
}
