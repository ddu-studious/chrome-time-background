import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { RemoteProvider } from './remote-provider.mjs';
import { estimateTokens } from './assistant-context.mjs';
import { REMOTE_MODELS } from './remote-config.mjs';

const cpuTime = () => os.cpus().reduce((total, cpu) => ({ idle: total.idle + cpu.times.idle,
  all: total.all + Object.values(cpu.times).reduce((sum, value) => sum + value, 0) }), { idle: 0, all: 0 });
// Two consecutive 500 ms intervals must both be hot. No polling/timers when fallback is off.
export async function sampleMachine({ signal } = {}) {
  let previous = cpuTime();
  const samples = [];
  for (let index = 0; index < 2; index++) {
    await delay(500, undefined, { signal });
    const current = cpuTime(), total = current.all - previous.all;
    samples.push(total > 0 ? Math.max(0, Math.min(100, 100 * (1 - (current.idle - previous.idle) / total))) : 0);
    previous = current;
  }
  return { cpuPercent: Math.round(Math.min(...samples)), freeMemoryMb: Math.floor(os.freemem() / 1024 / 1024) };
}
const availabilityErrors = new Set(['MODEL_UNAVAILABLE', 'MODEL_NOT_FOUND', 'MODEL_RESPONSE_TIMEOUT']);
export const DEEPSEEK_SELECTION = 'deepseek:configured';
export function createModelRoute({ local, config, scene, requestedModel, signal, sample = sampleMachine, remoteFactory = value => new RemoteProvider(value), onRoute }) {
  const explicitModel = REMOTE_MODELS.find(model => model.selection === requestedModel);
  const explicitRemote = requestedModel === DEEPSEEK_SELECTION || Boolean(explicitModel);
  if (requestedModel?.startsWith('deepseek:') && !explicitRemote) throw Object.assign(new Error('DeepSeek 模型选项无效，请刷新工作台后重新选择'), { statusCode: 400, code: 'REMOTE_MODEL_INVALID' });
  const configured = config?.credentials();
  const settings = configured && { ...configured, ...(explicitModel ? { model: explicitModel.id } : {}) };
  const eligible = ['assistant.plan', 'assistant.compact'].includes(scene) && settings?.mode !== 'off' && Boolean(settings?.apiKey);
  if (explicitRemote && !eligible) throw Object.assign(new Error('请先在 AI 控制台保存 DeepSeek 密钥并启用外部模型，再主动选择 DeepSeek'), { statusCode: 403, code: 'REMOTE_DISABLED' });
  if (!eligible) return null;
  let active = local, decided = false, resource, outputBudget = 4096, capacity = {}, used = false;
  function switchRemote(reason) {
    active = remoteFactory(settings);
    onRoute?.({ provider: 'deepseek', model: settings.model, reason, configRevision: settings.revision, ...(resource ? { resource } : {}) });
  }
  const ensure = async () => {
    signal?.throwIfAborted();
    if (decided) return;
    decided = true;
    if (!eligible) return;
    if (explicitRemote || settings.mode === 'remote') return switchRemote('manual');
    resource = await sample({ signal });
    signal?.throwIfAborted();
    if (resource.freeMemoryMb < settings.minFreeMemoryMb) switchRemote('memory');
    else if (resource.cpuPercent >= settings.cpuPercent) switchRemote('cpu');
    else if (local.busy) switchRemote('local-busy');
  };
  const route = {
    get model() { return active.model; },
    get remote() { return active !== local; },
    get used() { return used; },
    get revision() { return settings?.revision; },
    get currentRevision() { return config?.snapshot().revision; },
    async planningContext(options) {
      outputBudget = options.maxOutputTokens ?? 4096;
      await ensure();
      try { capacity = await active.planningContext?.({ ...options, ...(active !== local ? { model: active.model } : {}) }) || {}; return capacity; }
      catch (error) {
        if (signal?.aborted || !eligible || active !== local || !availabilityErrors.has(error.code)) throw error;
        switchRemote('local-unavailable');
        return active.planningContext(options);
      }
    },
    async countContextTokens(options) {
      await ensure();
      const counted = await active.countContextTokens?.(options) ?? null;
      const tokens = counted?.inputTokens ?? estimateTokens(options.instructions) + estimateTokens(options.input);
      const length = counted?.contextLength ?? capacity.contextLength;
      if (active === local && settings.contextFallback && Number.isSafeInteger(length) &&
          tokens > Math.min(length, 32768) - outputBudget - 512) {
        switchRemote('context');
        return active.countContextTokens(options);
      }
      return counted;
    },
    async generateObject(options) { return generate('generateObject', options); },
    async generateText(options) { return generate('generateText', options); }
  };
  // Preserve the exact local test/provider contract when tokenization is absent.
  if (!local.countContextTokens && !eligible) delete route.countContextTokens;
  async function generate(method, options) {
    await ensure(); used = true;
    if (active === local) return local[method](options);
    return active[method]({ ...options, model: active.model, reasoning: 'off' });
  }
  return route;
}
