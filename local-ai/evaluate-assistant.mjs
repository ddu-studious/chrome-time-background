// Live model + production planner/engine/tools; all music/account side effects are fixtures.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
const live = process.argv.includes('--live');
if (!live) { console.log('使用 --live 经本机控制面验证真实模型。音乐状态、搜索和播放均为测试替身，不操作真实账号或播放器。'); process.exit(0); }
const root = new URL('./', import.meta.url);
const token = readFileSync(new URL('.local/token', root), 'utf8').trim();
const request = async (path, body) => {
  const response = await fetch('http://127.0.0.1:19841' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000), ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || 'HTTP ' + response.status); return result;
};
const control = await request('/v1/control');
if (control.jobs?.length) throw new Error('已有本机AI任务，请空闲时再运行评估');
const health = await request('/health');
const report = { at: new Date().toISOString(), model: health.model, policyRevision: control.revision, boundary: '真实模型与控制面；业务工具数据/副作用为测试替身', results: [] };
for (const empty of process.argv.includes('--empty') ? [true] : process.argv.includes('--both') ? [false, true] : [false]) {
  const values = {}; const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(k) { delete values[k]; } };
  let version = 1, played = 0, writes = 0;
  let state = { status: empty ? 'empty' : 'ready', count: empty ? 0 : 2, songs: empty ? [] : [{ songId: '1', title: '江南' }, { songId: '2', title: '曹操' }], mode: 'sequence', isPlaying: false, revision: 'version-1', source: 'fixture', readAt: Date.now(), currentSong: null, timer: null };
  const plans = [], started = Date.now();
  const hooks = Tools.create({ storage,
    ai: async message => {
      if (message.action === 'ai_job_cancel') return request('/v1/ai/jobs/' + message.jobId + '/cancel', {});
      if (message.action === 'ai_scene_result') { const result = await request('/v1/ai/jobs/' + message.jobId); if (result.status !== 'pending') { plans.push({ data: result.data, toolContext: result.toolContext }); console.log(JSON.stringify({ empty, plan: result.data, error: result.error })); } return result; }
      if (message.action !== 'ai_scene_submit') throw new Error('组合需求不应退回单动作解析：' + message.action);
      if ((await request('/v1/control')).revision !== control.revision) throw new Error('控制策略已变化');
      return request('/v1/ai/interpret', { scene: message.scene, input: message.input });
    },
    readMusicState: async () => state,
    setMusicMode: async (mode, revision) => { if (revision !== state.revision) throw new Error('测试状态版本过期'); return state = { ...state, mode, revision: 'version-' + ++version }; },
    playCurrentQueue: async (revision, ref, ctx, mode) => { if (revision !== state.revision || !state.count) throw new Error('无可用测试队列'); played++; return state = { ...state, mode: mode || state.mode, isPlaying: true, currentSong: { title: state.songs[0].title }, revision: 'version-' + ++version }; },
    netease: async path => path.includes('search') ? { code: 200, result: { playlists: [{ id: 21, name: '林俊杰精选', trackCount: 2 }] } } : { code: 200, playlist: { tracks: [{ id: 1, name: '江南' }, { id: 2, name: '曹操' }], trackIds: [{ id: 1 }, { id: 2 }], trackCount: 2 } },
    applyMusicQueue: async (songs, args) => { if (args.expectedRevision !== state.revision) throw new Error('测试版本过期'); writes++; if (args.startPlayback) played++; return state = { ...state, songs, count: songs.length, status: 'ready', isPlaying: args.startPlayback || state.isPlaying, currentSong: args.startPlayback ? { title: songs[0].title } : state.currentSong, revision: 'version-' + ++version }; }
  });
  const engine = Engine.create({ storage, ...hooks, id: () => 'live-fixture', cancelJob: jobId => request('/v1/ai/jobs/' + jobId + '/cancel', {}) });
  await engine.submit({ app: 'music', text: '如果当前播放队列有歌曲，就随机播放当前队列；如果没有，就搜索林俊杰的歌单让我选择，选择后加入队列并随机播放。' });
  let result = await engine.settled();
  if (result.status === 'waiting') {
    const choice = result.choices.find(c => c.kind === 'playlist' && !c.secondary);
    if (choice) { console.log('模拟用户选择真实测试候选：' + choice.title); await engine.choose(result.id, choice.id, result.version); result = await engine.settled(); }
  }
  const passed = result.status === 'completed' && state.mode === 'shuffle' && state.isPlaying && played === 1 && writes === (empty ? 1 : 0);
  report.results.push({ empty, passed, elapsedMs: Date.now() - started, plans, result, effects: { played, writes, mode: state.mode } });
  console.log(JSON.stringify({ empty, passed, elapsedMs: Date.now() - started, status: result.status, message: result.message, effects: { played, writes, mode: state.mode } }));
}
const directory = new URL('.local/evaluations/', root); mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = new URL('assistant-' + report.at.replace(/[:.]/g, '-') + '.json', directory); writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log('报告：' + fileURLToPath(path));
if (report.results.some(r => !r.passed)) process.exitCode = 1;
