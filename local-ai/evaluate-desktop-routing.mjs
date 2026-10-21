// Opt-in isolated live-model acceptance. Real Gateway/SDK/Engine, memory-only
// task/policy/history; all business dependencies are doubles. No real playback,
// account or desktop setting changes. Does not unload/force-reside a model.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createGateway } from './gateway.mjs';
import { createControlStore } from './control-store.mjs';
import { LMStudioProvider } from './provider.mjs';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
const control = createControlStore();
const production = JSON.parse(readFileSync(new URL('./.local/control.json', import.meta.url), 'utf8'));
control.update(production.policy, control.snapshot().revision);
const provider = new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN });
const gateway = createGateway({ control, provider });
const report = { startedAt: new Date().toISOString(), modelState: await provider.planningContext(), computeEnabled: control.snapshot().policy.computeEnabled, cases: [] };
const selected = process.argv.find(arg => arg.startsWith('--cases='))?.slice(8)?.split(',');
const suffix = selected ? '-selected' : '';
const output = new URL(`./.local/evaluations/desktop-routing-20261021${suffix}.json`, import.meta.url);
mkdirSync(new URL('./.local/evaluations/', import.meta.url), { recursive: true });
for (const [name, text] of [['rules', '随机播放音乐'], ['answer-1', '解释前缀缓存为什么能减少重复计算，用两句话说明。'], ['answer-2', '解释前缀缓存为什么能减少重复计算，用两句话说明。'], ['model-queue', '@音乐 请用随机顺序开始当前队列里的音乐']]) {
  if (selected && !selected.includes(name)) continue;
  const values = {}, calls = [], effects = { reads: 0, plays: 0 }, started = Date.now();
  const storage = { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } };
  const state = { status: 'ready', revision: 'isolated-queue-v1', count: 2, mode: 'sequence', isPlaying: false, songs: [] };
  const handlers = Tools.create({ storage, readMusicState: async () => { effects.reads++; return structuredClone(state); },
    playCurrentQueue: async (revision, _song, _ctx, mode) => { if (revision !== state.revision) throw new Error('fixture revision mismatch'); effects.plays++; return { ...state, mode: mode || state.mode, isPlaying: true }; },
    ai: async request => {
      if (request.action !== 'ai_scene_submit' || request.scene !== 'assistant.plan') throw new Error('Evaluation only allows assistant.plan');
      const result = await gateway.run(request.scene, request.input, { trace: request.trace, selection: request.selection });
      calls.push({ phase: request.input.planningPhase, outcome: result.data?.answer ? 'answer' : result.data?.question ? 'question' : result.data?.done ? 'done' : result.data?.todoTips ? 'outline' : 'steps', execution: result.execution, toolContext: result.toolContext });
      return { ok: true, ...result };
    } });
  const engine = Engine.create({ storage, ...handlers });
  let result, confirmed = false;
  try {
    await engine.submit({ text, origin: 'desktop' }); result = await engine.settled();
    if (result.status === 'review') {
      if (effects.plays !== 0) throw new Error('write occurred before confirmation');
      confirmed = true; await engine.choose(result.id, result.choices[0].id, result.version); result = await engine.settled();
    }
    const valid = result.status === 'completed' && (name.startsWith('answer') ? result.result?.kind === 'answer' && effects.plays === 0 && calls.length === 1 : confirmed && effects.plays === 1 && result.todoTips.items.every(row => row.status === 'completed'));
    report.cases.push({ name, valid, elapsedMs: Date.now() - started, status: result.status, message: result.message, effects, confirmed, modelCalls: calls.length, calls });
  } catch (error) { report.cases.push({ name, valid: false, error: error.message, effects, calls }); }
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ name, ...report.cases.at(-1), calls: undefined, message: undefined }));
}
report.endedAt = new Date().toISOString(); writeFileSync(output, JSON.stringify(report, null, 2));
process.exitCode = report.cases.every(row => row.valid) ? 0 : 1;
