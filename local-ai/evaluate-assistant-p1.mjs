// Real model and production execution engine; all account/player/alarm effects are isolated fixtures.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Alarm from '../js/alarm-core.js';
if (!process.argv.includes('--live')) { console.log('使用 --live 验证P1真实模型；闹钟、搜索和播放器均使用隔离数据。'); process.exit(0); }
const root = new URL('./', import.meta.url), token = readFileSync(new URL('.local/token', root), 'utf8').trim();
async function request(path, body) {
  const r = await fetch('http://127.0.0.1:19841' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status); return d;
}
const control = await request('/v1/control'); if (control.jobs?.length) throw new Error('AI服务忙，未开始验证');
const report = { at: new Date().toISOString(), model: (await request('/health')).model, boundary: '真实Qwen与控制面；业务副作用为测试替身', results: [] };
const scenarios = [
  { id: 'alarm-update', app: 'alarm', text: '把开会提醒改到明天下午四点半，其他设置不变。' },
  { id: 'video-filter-details', app: 'youtube', text: '搜索MySQL入门视频，只要十分钟以内的，让我选择后告诉我它的真实时长和作者，不要打开。' },
  { id: 'music-seek', app: 'music', text: '把当前音乐进度跳到120秒，保持播放。' }
];
for (const scenario of scenarios.filter(s => !process.argv.includes('--alarm-only') || s.app === 'alarm')) {
  const values = {}; const storage = { get: async () => structuredClone(values), set: async p => Object.assign(values, structuredClone(p)), remove: async k => delete values[k] };
  let writes = 0, opens = 0, sought = 0, details = 0;
  let alarm = Alarm.normalizeAlarm({ id: 'fixture', label: '开会', date: '2099-01-01', time: '10:00', volume: .6, soundId: 'water' });
  let state = { status: 'ready', count: 2, revision: 'v1', isPlaying: true, currentTime: 20, duration: 300, songs: [] };
  const plans = []; const started = Date.now();
  const handlers = Tools.create({ storage,
    ai: async m => {
      if (m.action === 'ai_job_cancel') return request('/v1/ai/jobs/' + m.jobId + '/cancel', {});
      if (m.action === 'ai_scene_result') { const r = await request('/v1/ai/jobs/' + m.jobId); if (r.status !== 'pending') { plans.push({ data: r.data, toolContext: r.toolContext }); console.log(JSON.stringify({ scenario: scenario.id, data: r.data, error: r.error })); } return r; }
      if (m.action !== 'ai_scene_submit') throw new Error('不应退回创建提醒或单动作意图：' + m.action);
      if ((await request('/v1/control')).revision !== control.revision) throw new Error('策略已变化');
      return request('/v1/ai/interpret', { scene: m.scene, input: m.input });
    },
    listAlarms: async () => ({ alarms: [alarm] }),
    mutateAlarm: async args => { if (args.action !== 'update' || args.id !== alarm.id || args.expectedRevision !== alarm.revision) throw new Error('错误的修改目标'); writes++; alarm = { ...args.patch, revision: alarm.revision + 1 }; return { alarm }; },
    readMusicState: async () => state,
    seekMusic: async (seconds, revision) => { if (revision !== state.revision) throw new Error('旧播放器版本'); sought++; return state = { ...state, currentTime: seconds }; },
    youtube: async (resource, args) => {
      if (resource === 'search') return { items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: 'MySQL入门', channelTitle: '测试作者' } }, { id: { videoId: 'bcdefghijkl' }, snippet: { title: 'MySQL长课' } }] };
      if (args.part.includes('snippet')) details++;
      return { items: [{ id: 'abcdefghijk', snippet: { title: 'MySQL入门', channelTitle: '测试作者' }, contentDetails: { duration: 'PT5M' } }, { id: 'bcdefghijkl', contentDetails: { duration: 'PT40M' } }] };
    },
    openURL: async () => { opens++; }
  });
  const engine = Engine.create({ storage, ...handlers, id: () => 'p1-fixture' });
  await engine.submit({ app: scenario.app, text: scenario.text });
  let result = await engine.settled();
  if (['waiting', 'review'].includes(result.status) && result.choices?.length) {
    console.log('模拟用户选择/确认：' + result.choices[0].title);
    await engine.choose(result.id, result.choices[0].id, result.version); result = await engine.settled();
  }
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  const passed = result.status === 'completed' && (scenario.app === 'alarm' ? writes === 1 && alarm.date === date && alarm.time === '16:30' && alarm.soundId === 'water' : scenario.app === 'music' ? sought === 1 && state.currentTime === 120 && state.isPlaying : details === 1 && opens === 0);
  report.results.push({ id: scenario.id, passed, elapsedMs: Date.now() - started, plans, result, effects: { writes, opens, sought, details } });
  console.log(JSON.stringify({ id: scenario.id, passed, status: result.status, message: result.message, elapsedMs: Date.now() - started }));
}
const directory = new URL('.local/evaluations/', root); mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = new URL('assistant-p1-' + report.at.replace(/[:.]/g, '-') + '.json', directory); writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 }); console.log('报告：' + path.pathname);
if (report.results.some(r => !r.passed)) process.exitCode = 1;
