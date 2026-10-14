// Opt-in real-model evaluation of the read-only computation tool (compute.run).
//
// Real: the extension's own Engine/Tools/Contract/Todo, an in-process Gateway with memory-only control and history,
// the local LM Studio model, and the QuickJS sandbox child process.
// Doubles: the music queue, the alarm list, and every business write (a write throws and is reported, never performed).
// No production token, control file, history, queue, alarm or account is read or changed.
//
//   node local-ai/evaluate-compute.mjs [--runs=1] [--cases=id,id] [--compute=on|off] [--reasoning=low] [--trace] [--list]
//
// Cases are of four kinds. "analysis": the answer only exists after a computation over data the registered read tools return.
// "derive": a computed value must feed a registered action (the action stops at its confirmation card; nothing is written).
// "control": a registered tool already answers it, so compute.run must not be used. "control-outline": the Todo analysis
// of the existing queue scenarios must not turn into compute.run when the tool is on.
import { mkdirSync, writeFileSync } from 'node:fs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { createGateway } from './gateway.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { LMStudioProvider } from './provider.mjs';
import { ComputeProvider } from './compute-provider.mjs';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(option('runs', 1));
const reasoning = option('reasoning', 'low');
const computeMode = option('compute', 'on');
const only = option('cases', '').split(',').filter(Boolean);
const traceOn = process.argv.includes('--trace'); // adds each planner/compute call (clipped) to the printed rows, for diagnosing failures
if (!Number.isInteger(runs) || runs < 1 || runs > 10) { console.error('--runs 必须是 1 至 10 的整数'); process.exit(2); }
if (!['off', 'low', 'medium', 'high'].includes(reasoning)) { console.error('--reasoning 只能是 off / low / medium / high'); process.exit(2); }
if (!['on', 'off'].includes(computeMode)) { console.error('--compute 只能是 on / off'); process.exit(2); }

// ---- worlds (deterministic fixtures) ----
const ROSTER = [
  ['周杰伦', ['七里香', '晴天', '稻香', '夜曲', '告白气球', '青花瓷', '晴天']],
  ['林俊杰', ['江南', '背对背拥抱', '她说', '不为谁而作的歌', '可惜没如果']],
  ['邓紫棋', ['光年之外', '泡沫', '倒数', '来自天堂的魔鬼', '光年之外']],
  ['陈奕迅', ['十年', '富士山下', '浮夸']],
  ['五月天', ['倔强', '突然好想你', '知足']],
  ['薛之谦', ['演员', '丑八怪']]
];
function queueWorld() {
  const rows = ROSTER.flatMap(([artist, titles]) => titles.map(title => ({ title, artist })));
  let seed = 20261012; // deterministic order, so the most frequent artist is not simply first
  const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const songs = rows.map((row, index) => ({ songId: String(index + 1), ...row }));
  const counts = {}, seen = {};
  for (const song of songs) { counts[song.artist] = (counts[song.artist] || 0) + 1; seen[`${song.artist}|${song.title}`] = (seen[`${song.artist}|${song.title}`] || 0) + 1; }
  const duplicates = Object.entries(seen).filter(([, n]) => n > 1).map(([key]) => key.split('|')[1]);
  const once = songs.map(song => song.title).filter(title => !duplicates.includes(title));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { songs, counts, duplicates, once, topArtist: top[0][0], topCount: top[0][1], tied: top[1]?.[1] === top[0][1] };
}
const dayKey = offset => { const date = new Date(); date.setDate(date.getDate() + offset); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };
const alarm = (id, label, date, time = '09:00') => ({ id, label, date, time, repeat: 'once', days: [], enabled: true, revision: 1 });
function weekendAlarms() {
  const labels = ['交水电费', '取快递', '周会', '牙医复诊', '爬山', '家庭聚餐', '交报告', '给妈妈打电话'], offsets = [1, 2, 3, 5, 6, 8, 10, 12];
  const alarms = labels.map((label, index) => alarm(`a${index + 1}`, label, dayKey(offsets[index])));
  const weekday = a => new Date(`${a.date}T00:00:00`).getDay();
  return { alarms, weekend: alarms.filter(a => [0, 6].includes(weekday(a))).map(a => a.label), weekdays: alarms.filter(a => ![0, 6].includes(weekday(a))).map(a => a.label) };
}
function nextAlarms() {
  const alarms = [alarm('n1', '昨日的项目会议', dayKey(-2)), alarm('n2', '车辆年检', dayKey(20)), alarm('n3', '续费会员', dayKey(3)), alarm('n4', '年度体检', dayKey(9))];
  return { alarms, label: '续费会员', days: 3, past: '昨日的项目会议' };
}
const daysUntil = (y, m, d) => { const now = new Date(); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000); };

// ---- judges: a case passes only when the final task state and the user-visible answer are right ----
const near = (text, name, value) => new RegExp(`${name}[^\\n]{0,16}?(?<!\\d)${value}(?!\\d)`).test(text);
const lacks = (text, words) => words.filter(word => text.includes(word));
const used = task => (task.log || []).some(row => row.tool === 'compute.run');
const finished = task => task.status === 'completed';
const cases = [
  { id: 'queue-artist-count', kind: 'analysis', app: 'music', text: '统计队列里每个歌手有几首歌', world: queueWorld,
    judge: (task, w) => !finished(task) ? `任务未完成：${task.status} ${task.message}` : Object.entries(w.counts).filter(([artist, n]) => !near(task.message, artist, n)).map(([artist, n]) => `缺少 ${artist}=${n}`).join('；') || null },
  { id: 'queue-top-artist', kind: 'analysis', app: 'music', text: '队列里哪位歌手的歌最多？', world: queueWorld,
    judge: (task, w) => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !task.message.includes(w.topArtist) ? `答案里没有 ${w.topArtist}` : null },
  { id: 'queue-duplicates', kind: 'analysis', app: 'music', text: '队列里有没有重复的歌曲？有的话列出来', world: queueWorld,
    judge: (task, w) => { if (!finished(task)) return `任务未完成：${task.status} ${task.message}`; const missing = w.duplicates.filter(title => !task.message.includes(title)), extra = lacks(task.message, w.once); return missing.length ? `漏掉重复歌曲 ${missing.join('、')}` : extra.length ? `误列了不重复的歌曲 ${extra.slice(0, 3).join('、')}` : null; } },
  { id: 'alarm-weekend', kind: 'analysis', app: 'alarm', text: '我的提醒里有哪些是在周六或周日响的？', world: weekendAlarms,
    judge: (task, w) => { if (!finished(task)) return `任务未完成：${task.status} ${task.message}`; const missing = w.weekend.filter(label => !task.message.includes(label)), extra = lacks(task.message, w.weekdays); return missing.length ? `漏掉周末提醒 ${missing.join('、')}` : extra.length ? `误列了工作日提醒 ${extra.join('、')}` : null; } },
  { id: 'alarm-next', kind: 'analysis', app: 'alarm', text: '哪个提醒是下一个要响的？还有几天？', world: nextAlarms,
    judge: (task, w) => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !task.message.includes(w.label) ? `答案里没有 ${w.label}` : task.message.includes(w.past) ? `误选了已过期提醒 ${w.past}` : !new RegExp(`(?<!\\d)${w.days}\\s*天`).test(task.message) ? `答案里没有“${w.days}天”` : null },
  { id: 'date-countdown', kind: 'analysis', app: 'task', text: '距离2026年12月25日还有多少天？', world: () => ({ days: daysUntil(2026, 12, 25) }),
    judge: (task, w) => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !new RegExp(`(?<!\\d)${w.days}(?!\\d)`).test(task.message) ? `答案里没有 ${w.days}` : null },
  { id: 'sum-minutes', kind: 'analysis', app: 'worklog', text: '我今天做了：写周报2小时、改bug 90分钟、开会45分钟、整理文档1.5小时，一共是多少小时多少分钟？', world: () => ({}),
    judge: task => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !/5\s*小时\s*45\s*分|345\s*分钟|5\.75/.test(task.message) ? '答案不是 5 小时 45 分（345 分钟）' : null },
  { id: 'remove-top-artist', kind: 'derive', app: 'music', text: '把队列里歌最多的那位歌手的歌全部删掉', world: queueWorld,
    judge: (task, w) => task.status !== 'review' ? `没有停在确认卡：${task.status} ${task.message}` : !task.message.includes(w.topArtist) ? `确认卡不是 ${w.topArtist}：${task.message.slice(0, 80)}` : !new RegExp(`(?<!\\d)${w.topCount}\\s*首`).test(task.message) ? `确认卡数量不是 ${w.topCount} 首` : null },
  // Held-out: written after the prompt and guard tuning that the cases above drove, and never used to diagnose or tune
  // anything. Different phrasing and different computations (range, ratio, date span, weekday, derive-the-minimum)
  // over the same fixtures. Only the first run of each counts as held-out: once a failure here is fixed, the case is
  // no longer independent.
  { id: 'heldout-queue-range', kind: 'held-out', app: 'music', text: '队列里歌手的歌曲数量，最多的和最少的相差几首？', world: queueWorld,
    judge: (task, w) => { const counts = Object.values(w.counts), gap = Math.max(...counts) - Math.min(...counts); return !finished(task) ? `任务未完成：${task.status} ${task.message}` : !new RegExp(`(?<!\\d)${gap}\\s*首`).test(task.message) ? `答案里没有“${gap}首”` : null; } },
  { id: 'heldout-queue-share', kind: 'held-out', app: 'music', text: '队列里歌最多的那位歌手，占整个队列的百分之几？', world: queueWorld,
    judge: (task, w) => { const pct = Math.round(100 * w.topCount / w.songs.length); return !finished(task) ? `任务未完成：${task.status} ${task.message}` : !new RegExp(`(?<!\\d)${pct}(\\.0+)?\\s*[%％]`).test(task.message) ? `答案里没有 ${pct}%` : null; } },
  { id: 'heldout-alarm-span', kind: 'held-out', app: 'alarm', text: '我的提醒里，最早的和最晚的相差多少天？', world: weekendAlarms,
    judge: task => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !/(?<!\d)11\s*天/.test(task.message) ? '答案里没有“11天”' : null },
  { id: 'heldout-weekday', kind: 'held-out', app: 'task', text: '2026年12月25日是星期几？', world: () => ({}),
    judge: task => !finished(task) ? `任务未完成：${task.status} ${task.message}` : !/星期五|周五/.test(task.message) ? '答案不是星期五' : null },
  { id: 'heldout-remove-least-artist', kind: 'held-out', app: 'music', text: '把队列里歌最少的那位歌手的歌全部删掉', world: queueWorld,
    judge: (task, w) => { const [artist, count] = Object.entries(w.counts).sort((a, b) => a[1] - b[1])[0]; return task.status !== 'review' ? `没有停在确认卡：${task.status} ${task.message}` : !task.message.includes(artist) ? `确认卡不是 ${artist}：${task.message.slice(0, 80)}` : !new RegExp(`(?<!\\d)${count}\\s*首`).test(task.message) ? `确认卡数量不是 ${count} 首` : null; } },
  { id: 'control-count', kind: 'control', app: 'music', text: '现在队列里有多少首歌？', world: queueWorld,
    judge: (task, w) => !finished(task) ? `任务未完成：${task.status} ${task.message}` : used(task) ? '已有 music.state 能回答，不应使用 compute.run' : !task.message.includes(String(w.songs.length)) ? `答案里没有 ${w.songs.length}` : null },
  ...[['recommend', '帮我推荐一些歌曲，加入歌单，随机播放。', ['music.queue.apply', 'music.queue.play']],
    ['queue4', '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲', ['music.queue.clear', 'music.queue.apply', 'music.queue.apply', 'music.queue.play']],
    ['remove', '清除队里中许嵩的歌曲', ['music.queue.removeArtist']]].map(([name, text, expected]) => ({
    id: `control-outline-${name}`, kind: 'control-outline', app: 'music', text, world: queueWorld, outlineOnly: true,
    judge: task => { const tools = (task.todoTips?.items || []).map(row => row.tool); return !tools.length ? `没有清单：${task.status} ${task.message}` : tools.includes('compute.run') ? `清单混入 compute.run：${tools.join(',')}` : JSON.stringify(tools) !== JSON.stringify(expected) ? `完成条件不符：${tools.join(',')}` : null; } }))
];
const selected = cases.filter(row => !only.length || only.includes(row.id));
if (process.argv.includes('--list')) { for (const row of cases) console.log(`${row.id}\t${row.kind}\t${row.app}\t${row.text.split('\n')[0]}`); process.exit(0); }
if (!selected.length) { console.error(`--cases 只能是：${cases.map(row => row.id).join(', ')}`); process.exit(2); }

// ---- one run: real Engine/Tools against the doubles ----
const model = new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN });
const sandbox = new ComputeProvider();
if (computeMode === 'on' && !sandbox.describe().configured) { console.error(sandbox.describe().error); process.exit(2); }

const clip = value => { const text = JSON.stringify(value) ?? ''; return text.length > 700 ? `${text.slice(0, 700)}…` : text; };
let activeCalls = null;
if (traceOn) {
  // Raw model output, before the domain contract validates it: shows why a plan was rejected.
  const generate = model.generateObject.bind(model);
  model.generateObject = async options => {
    const started = Date.now();
    try { const output = await generate(options); activeCalls?.push({ label: 'model-raw', ms: Date.now() - started, output: clip(output) }); return output; }
    catch (error) { activeCalls?.push({ label: 'model-raw', ms: Date.now() - started, error: `${error.code || ''} ${String(error.message).slice(0, 160)}` }); throw error; }
  };
}
async function runCase(spec) {
  const world = spec.world(), values = {}, writes = [], sandboxRuns = [], planRequests = [], calls = [];
  activeCalls = calls;
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  const control = createControlStore();
  // Failures are the measurement: keep the cooldown and the daily budget out of it.
  control.update({ ...control.snapshot().policy, reasoning, computeEnabled: computeMode === 'on', failureThreshold: 20, dailyRequestLimit: 10000 }, 1);
  const counted = { describe: () => sandbox.describe(), run: async (...args) => { sandboxRuns.push({ code: args[0].code, at: Date.now() }); return sandbox.run(...args); } };
  const gateway = createGateway({ control, history: createHistoryStore(), provider: model, computeProvider: counted });
  const queue = world.songs ? { status: 'ready', revision: 'v1', songs: structuredClone(world.songs), count: world.songs.length, currentSongId: null, isPlaying: false, mode: 'sequence' } : { status: 'empty', revision: 'v1', songs: [], count: 0, isPlaying: false, mode: 'sequence' };
  const writeNames = ['playMusic', 'playQueue', 'enqueueMusic', 'sleepMusic', 'saveAlarm', 'mutateAlarm', 'openVideo', 'reconcileMusicQueue', 'setMusicMode', 'playCurrentQueue', 'applyMusicQueue', 'editMusicQueue', 'seekMusic', 'controlMusic'];
  const business = Object.fromEntries(writeNames.map(name => [name, async () => { writes.push(name); throw new Error(`评测不执行业务写入：${name}`); }]));
  const record = (label, started, outcome) => { if (traceOn) calls.push({ label, ms: Date.now() - started, ...outcome }); };
  const ai = async request => {
    const started = Date.now();
    if (request.action === 'ai_compute_submit') {
      try { const result = await gateway.run('assistant.compute', request.input, { trace: request.trace }); record('compute', started, { output: clip(result.data ?? result) }); return { ok: true, ...result }; }
      catch (error) { record('compute', started, { error: `${error.code || ''} ${String(error.message).slice(0, 200)}` }); throw error; }
    }
    if (request.scene === 'assistant.plan') planRequests.push(request.input.planningPhase || 'legacy');
    // The outline cases stop right after the Todo analysis; later rounds would need real business writes.
    if (spec.outlineOnly && request.scene === 'assistant.plan' && request.input.planningPhase !== 'outline') return { ok: true, status: 'needs_clarification', source: 'capture', data: { question: '评测在清单分析后停止' } };
    const label = `${request.scene}:${request.input?.planningPhase || ''}`;
    try { const result = await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }); record(label, started, { status: result.status, output: clip(result.data) }); return { ok: true, ...result }; }
    catch (error) { record(label, started, { error: `${error.code || ''} ${String(error.message).slice(0, 240)}` }); throw error; }
  };
  const handlers = Tools.create({ storage, memory: async () => ({ ok: true, enabled: false }), readMusicState: async () => structuredClone(queue),
    listAlarms: async () => ({ alarms: structuredClone(world.alarms || []) }), ...business, ai });
  let sequence = 0;
  const engine = Engine.create({ storage, ...handlers, id: () => `eval-${spec.id}-${++sequence}`, cancelJob: async () => {} });
  const started = Date.now();
  await engine.submit({ app: spec.app, text: spec.text, ai: { reasoning } });
  const task = await engine.settled();
  const elapsedMs = Date.now() - started;
  const reason = spec.judge(task, world) || (writes.length ? `发生了业务写入尝试：${writes.join(',')}` : null);
  const planCalls = (task.modelCalls || []).filter(call => call.scene === 'assistant.plan');
  return { case: spec.id, kind: spec.kind, status: task.status, ok: !reason, reason, usedCompute: used(task), sandboxRuns: sandboxRuns.length, recoveries: task.recoveryCount || 0,
    plannerCalls: planRequests.length, modelMs: planCalls.reduce((sum, call) => sum + (call.elapsedMs || 0), 0), elapsedMs, tools: (task.log || []).map(row => `${row.tool}:${row.status}`),
    todo: (task.todoTips?.items || []).map(row => `${row.tool}:${row.status}`), message: String(task.message || '').slice(0, 300), code: sandboxRuns.map(row => row.code).slice(0, 3),
    ...(traceOn ? { calls } : {}) };
}

const median = values => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
const startedAt = Date.now(), rows = [];
for (const spec of selected) {
  for (let run = 1; run <= runs; run++) {
    let row;
    try { row = { run, ...await runCase(spec) }; }
    catch (error) { row = { run, case: spec.id, kind: spec.kind, ok: false, reason: `评测异常：${error.code || ''} ${String(error.message).slice(0, 160)}` }; }
    rows.push(row);
    console.log(JSON.stringify({ ...row, code: traceOn ? row.code : undefined }));
  }
}
const group = (kind, list) => ({ runs: list.length, passed: list.filter(row => row.ok).length, usedCompute: list.filter(row => row.usedCompute).length, medianSec: Math.round((median(list.map(row => row.elapsedMs)) || 0) / 1000), medianModelSec: Math.round((median(list.map(row => row.modelMs)) || 0) / 1000), medianPlanner: median(list.map(row => row.plannerCalls)), failures: list.filter(row => !row.ok).map(row => `${row.case}: ${row.reason}`) });
const summary = Object.fromEntries(['analysis', 'derive', 'held-out', 'control', 'control-outline'].map(kind => [kind, group(kind, rows.filter(row => row.kind === kind))]).filter(([, value]) => value.runs));
const report = { at: new Date(startedAt).toISOString(), computeMode, reasoning, runs, model: process.env.LOCAL_AI_MODEL || 'service default', boundary: '真实 Engine/Tools + 进程内 Gateway（内存策略与历史）+ 本机 LM Studio + QuickJS 沙箱子进程；音乐队列/提醒为替身，业务写入会抛错，不触碰生产数据', elapsedMs: Date.now() - startedAt, summary, rows };
const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
const output = new URL(`assistant-compute-${startedAt}.json`, directory);
writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ summary, report: output.pathname }, null, 2));
