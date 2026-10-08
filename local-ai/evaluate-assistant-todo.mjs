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
const inProcess = process.argv.includes('--in-process');
const strategy = process.argv.find(arg => arg.startsWith('--strategy='))?.slice('--strategy='.length) || 'follow';
if (!['follow', 'adaptive'].includes(strategy)) { console.error('--strategy 只能是 follow 或 adaptive'); process.exit(2); }

if (!process.argv.includes('--live') && !inProcess) {
  console.log('使用 --live 经鉴权网关验证真实模型与 Todo 全流程；音乐查询、清空、追加和播放全部使用测试替身。');
  console.log('使用 --in-process [--strategy=follow|adaptive] 在进程内创建独立网关（内存策略与历史，不读取生产令牌、不写生产记录），比较规划思考起步策略。');
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
  let sequence = 0, revision = 1;
  let state = { status: 'ready', revision: 'fixture-1', count: 50, songs: [], mode: 'sequence', isPlaying: false };
  if (removeArtist) state = { ...state, songs: Array.from({ length: 150 }, (_, i) => ({ songId: String(i + 1), title: `测试曲目${i + 1}`, artist: i < 50 ? i % 2 ? '许嵩 / 合唱者' : '许嵩' : '法老' })), count: 150, currentSongId: '80', isPlaying: true, mode: 'shuffle' };
  const update = patch => state = { ...state, ...patch, revision: `fixture-${++revision}` };
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  const handlers = Tools.create({ storage,
    memory: async () => ({ ok: true, enabled: false }),
    ai: async message => {
      if (inProcess) {
        if (message.action !== 'ai_scene_submit') throw new Error(`验证不允许调用 ${message.action}`);
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
      assert.equal(expected, state.revision); assert.equal(state.count, 2); assert.equal(mode, 'shuffle');
      effects.push('shuffle'); return update({ isPlaying: true, mode, currentSong: state.songs[0] });
    }
  });
  const engine = Engine.create({ storage, ...handlers, id: () => `todo-evaluation-${started}-${++sequence}` });
  const report = { at: new Date(started).toISOString(), passed: false,
    boundary: inProcess ? '进程内 Gateway（内存策略与历史，不读生产令牌、不写生产记录）、真实 LM Studio 本机模型和生产 Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号'
      : '真实鉴权HTTP/Gateway/本机模型和生产Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号',
    ...(inProcess ? { strategy, reasoning: 'low' } : {}) };
  try {
    await engine.submit({ app: 'music', text: removeArtist ? '清除队里中许嵩的歌曲' : '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲', ai: { reasoning: 'low' } });
    let task = await engine.settled();
    for (let i = 0; i < 3 && ['review', 'waiting'].includes(task.status); i++) {
      const choice = task.status === 'review' ? task.choices.find(row => row.id === (removeArtist ? 'queue-artist-confirm' : 'queue-edit-confirm')) : task.choices.find(row => row.kind === 'artist' && !row.secondary);
      assert.ok(choice, '只能自动选择测试清空确认或测试歌手');
      await engine.choose(task.id, choice.id, task.version); task = await engine.settled();
    }
    report.task = task;
    assert.equal(plans[0].data?.todoTips?.length, removeArtist ? 1 : 4, '首先独立分析完整清单');
    assert.deepEqual(plans[0].data.steps, [], '分析阶段不执行任何工具');
    assert.equal(task.status, 'completed', task.message);
    assert.ok(task.todoTips.items.every(row => row.status === 'completed' && row.receiptId));
    assert.deepEqual(effects, removeArtist ? ['remove:50'] : ['clear', 'search:许嵩', 'append', 'search:法老', 'append', 'shuffle']);
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
  const output = new URL(`assistant-${removeArtist ? 'remove-artist' : 'todo'}${inProcess ? `-${strategy}` : ''}-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, ...(inProcess ? { strategy } : {}), effects, elapsedMs: report.elapsedMs, metrics: report.metrics, report: output.pathname }));
}
