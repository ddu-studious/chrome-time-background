// Opt-in real model comparison of the starting thinking level for the Todo analysis (outline) request.
// Only the analysis request is sent: the real Engine/Tools build it once per scenario, a double captures it,
// then the captured request is replayed through an in-process Gateway (memory-only policy and history, no
// production token, no production records). No business tool runs and no music, alarm or account state is touched.
// Note: the Gateway now starts every analysis request with thinking off (`startReason: 'outline-off'`), whatever
// level is requested. A non-off level is therefore replayed as off and flagged in the report; a real low-thinking
// arm needs a scratch copy of gateway.mjs without `outlineStart`.
import { mkdirSync, writeFileSync } from 'node:fs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Todo from '../js/assistant-todo.js';
import { createGateway } from './gateway.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { LMStudioProvider } from './provider.mjs';

const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const runs = Number(option('runs', 5));
const levels = (option('levels', 'low,off')).split(',');
const only = option('scenario', '');
const which = option('cases', 'all');
if (!['base', 'variant', 'all'].includes(which)) { console.error('--cases 只能是 base / variant / all'); process.exit(2); }
if (!Number.isInteger(runs) || runs < 1 || runs > 50) { console.error('--runs 必须是 1 至 50 的整数'); process.exit(2); }
if (levels.some(level => !['off', 'low', 'medium', 'high'].includes(level)) || new Set(levels).size !== levels.length) { console.error('--levels 只能是不重复的 off,low,medium,high'); process.exit(2); }

const apply = { mode: 'append', startPlayback: false };
// Expected completion tools per case; "correct" additionally pins the fixed acceptance arguments.
// The model answers the same prompt deterministically, so repeating one wording mostly measures stability;
// the paraphrased cases are what shows whether the result survives different wording.
const shuffle = ['music.queue.play', { mode: 'shuffle' }];
const scenarios = {
  recommend: [
    { kind: 'base', text: '帮我推荐一些歌曲，加入歌单，随机播放。', expected: [['music.queue.apply', apply], shuffle] },
    { kind: 'variant', text: '来几首好听的歌，加到队列里，然后随机放', expected: [['music.queue.apply', apply], shuffle] },
    { kind: 'variant', text: '随便推荐点歌，加入播放队列并随机播放', expected: [['music.queue.apply', apply], shuffle] }
  ],
  queue4: [
    { kind: 'base', text: '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲',
      expected: [['music.queue.clear', {}], ['music.queue.apply', apply], ['music.queue.apply', apply], shuffle] },
    { kind: 'variant', text: '清空队列（如果有歌的话）\n搜索周杰伦热歌，添加到队列\n搜索林俊杰热歌，添加到队列\n随机播放队列里的歌曲',
      expected: [['music.queue.clear', {}], ['music.queue.apply', apply], ['music.queue.apply', apply], shuffle] },
    { kind: 'variant', text: '先看看队列有没有歌，有就清空。\n搜索陈奕迅的热门歌曲加入队列。\n搜索五月天的热门歌曲加入队列。\n最后随机播放添加的歌曲。',
      expected: [['music.queue.clear', {}], ['music.queue.apply', apply], ['music.queue.apply', apply], shuffle] }
  ],
  removeArtist: [
    { kind: 'base', text: '清除队里中许嵩的歌曲', expected: [['music.queue.removeArtist', { artist: '许嵩' }]] },
    { kind: 'variant', text: '把队列里周杰伦的歌都删掉', expected: [['music.queue.removeArtist', { artist: '周杰伦' }]] },
    { kind: 'variant', text: '移除播放队列中陈奕迅的歌曲', expected: [['music.queue.removeArtist', { artist: '陈奕迅' }]] }
  ]
};
const selected = Object.entries(scenarios).filter(([name]) => !only || name === only)
  .map(([name, cases]) => [name, cases.filter(row => which === 'all' || row.kind === which)]).filter(([, cases]) => cases.length);
if (!selected.length) { console.error(`--scenario 只能是 ${Object.keys(scenarios).join(' / ')}`); process.exit(2); }

// Build the real outline request once per scenario. The double ends the task right after capturing it.
async function capture(text) {
  let captured = null;
  const values = {};
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  const handlers = Tools.create({ storage, memory: async () => ({ ok: true, enabled: false }),
    ai: async message => {
      if (message.action !== 'ai_scene_submit' || message.scene !== 'assistant.plan') throw new Error(`采集阶段不允许调用 ${message.action}/${message.scene}`);
      if (message.input?.planningPhase !== 'outline') throw new Error('采集阶段只应出现清单分析请求');
      captured = structuredClone(message.input);
      return { ok: true, status: 'ready', source: 'capture', data: { question: '仅采集请求，不执行' } };
    } });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text, ai: { reasoning: 'low' } });
  await engine.settled();
  if (!captured) throw new Error('没有采集到清单分析请求');
  return captured;
}

const control = createControlStore();
// Failures are the measurement here: keep the failure cooldown and the budget out of the comparison.
control.update({ ...control.snapshot().policy, reasoning: 'low', planningStrategy: 'follow', failureThreshold: 20, dailyRequestLimit: 10000 }, 1);
const gateway = createGateway({ control, history: createHistoryStore(), provider: new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN }) });

function judge(input, data, expected) {
  const rows = data?.todoTips;
  if (!Array.isArray(rows)) return { valid: false, correct: false, reason: data?.question ? '返回追问而不是清单' : '没有清单' };
  let items;
  try {
    const state = structuredClone(input.todoTips);
    Todo.install(state, structuredClone(rows), input.app);
    items = state.items;
  } catch (error) { return { valid: false, correct: false, reason: String(error.message).slice(0, 120) }; }
  const sameArgs = (args, fixed) => Object.entries(fixed).every(([key, value]) => args?.[key] === value);
  const correct = items.length === expected.length && items.every((row, index) => row.tool === expected[index][0] && sameArgs(row.args, expected[index][1]));
  return { valid: true, correct, tools: items.map(row => row.tool), ...(correct ? {} : { reason: '工具或固定参数与预期不符' }) };
}

const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null; };
const started = Date.now(), results = {};
for (const [name, cases] of selected) {
  results[name] = Object.fromEntries(levels.map(level => [level, []]));
  for (const [caseIndex, scenario] of cases.entries()) {
    const input = await capture(scenario.text);
    for (let run = 0; run < runs; run++) {
      // Alternate the order so a warm prompt cache does not always favour the same level.
      for (const level of (run + caseIndex) % 2 ? [...levels].reverse() : levels) {
        const row = { case: scenario.text.split('\n')[0].slice(0, 24), run: run + 1, level };
        try {
          const result = await gateway.run('assistant.plan', structuredClone(input), { selection: { reasoning: level } });
          Object.assign(row, judge(input, result.data, scenario.expected), { elapsedMs: result.execution?.elapsedMs, attempts: result.execution?.attempts?.length,
            firstAttemptTimeout: result.execution?.attempts?.[0]?.errorCode === 'MODEL_RESPONSE_TIMEOUT', effectiveReasoning: result.execution?.effectiveReasoning, startReason: result.execution?.startReason, outputTokens: result.execution?.usage?.outputTokens });
        } catch (error) { Object.assign(row, { valid: false, correct: false, reason: `${error.code || 'ERROR'}: ${String(error.message).slice(0, 100)}`, elapsedMs: error.execution?.elapsedMs, attempts: error.execution?.attempts?.length }); }
        results[name][level].push(row);
        console.log(JSON.stringify({ scenario: name, ...row }));
      }
    }
  }
}

const summary = Object.fromEntries(Object.entries(results).map(([name, byLevel]) => [name, Object.fromEntries(Object.entries(byLevel).map(([level, rows]) => [level, {
  runs: rows.length, valid: rows.filter(row => row.valid).length, correct: rows.filter(row => row.correct).length,
  medianMs: median(rows.map(row => row.elapsedMs).filter(Number.isFinite)), maxMs: Math.max(0, ...rows.map(row => row.elapsedMs || 0)),
  firstAttemptTimeouts: rows.filter(row => row.firstAttemptTimeout).length, retried: rows.filter(row => row.attempts > 1).length,
  forcedOff: rows.filter(row => row.level !== 'off' && row.startReason === 'outline-off').length,
  failures: rows.filter(row => !row.correct).map(row => row.reason).filter(Boolean)
}]))]));
const forced = Object.values(summary).flatMap(byLevel => Object.values(byLevel)).reduce((sum, row) => sum + row.forcedOff, 0);
const notes = forced ? [`当前 Gateway 让清单分析固定从 off 起步：${forced} 次非 off 等级的回放实际按 off 执行，不是低思考对照；要比较旧行为，请在去掉 gateway.mjs 中 outlineStart 的临时副本里运行。`] : [];
if (notes.length) console.error(`警告：${notes.join(' ')}`);
const report = { at: new Date(started).toISOString(), runs, levels, cases: which, notes, boundary: '进程内 Gateway（内存策略与历史，不读生产令牌、不写生产记录）、真实 LM Studio 本机模型；请求由生产 Engine/Tools 生成并回放，只发送清单分析请求，不执行任何业务工具', elapsedMs: Date.now() - started, summary, results };
const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
const output = new URL(`assistant-outline-start-${started}.json`, directory);
writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ summary, report: output.pathname }, null, 2));
