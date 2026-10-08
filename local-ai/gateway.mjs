import { compactHistory, validateCompaction } from './assistant-compaction.mjs';
import { summarize as summarizeActivity, validateInput as validateActivity } from './activity-service.mjs';
import { summarize, rerank, validateSummary, validateRanking } from './bookmark-service.mjs';
import { embed, validateInput as validateEmbedding } from './embedding-service.mjs';
import { assist, validateInput as validateWriting } from './writing-service.mjs';
import { draft, validateInput as validateTask } from './task-service.mjs';
import { draftSchedule, validateInput as validateSchedule } from './schedule-service.mjs';
import { answer, validateInput as validateKnowledge } from './knowledge-service.mjs';
import { createAdmission } from './admission.mjs';
import { recommend, validateInput as validateRecommendation } from './music-recommend-service.mjs';
import { matchWorkspace, validateInput as validateWorkspace } from './workspace-service.mjs';
import { digest, validateInput as validateDigest } from './content-digest-service.mjs';
import { cluster, validateInput as validateTrending } from './trending-service.mjs';
import { randomBytes } from 'node:crypto';
import { interpret, validateInput } from './alarm-service.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { interpret as interpretSpeech, validateInput as validateSpeech } from './speech-service.mjs';
import { interpret as synthesizeSpeech, validateInput as validateSynthesis } from './speech-synthesis-service.mjs';
import { interpret as interpretMusic, validateInput as validateMusic } from './music-service.mjs';
import { plan as planAssistant, validateInput as validateAssistant } from './assistant-service.mjs';
import contract from '../js/assistant-contract.js';

const SCENES = Object.freeze({
  'assistant.compact': Object.freeze({ name: '上下文整理（pi SDK）', version: 1, validate: validateCompaction, run: compactHistory }),
  'assistant.plan': Object.freeze({ name: '快捷助手工具规划', version: 3, validate: validateAssistant, run: planAssistant }),
  'trending.cluster': Object.freeze({ name: '热榜主题聚合', version: 1, validate: validateTrending, run: cluster }),
  'content.digest': Object.freeze({ name: '正文与字幕提要', version: 1, validate: validateDigest, run: digest }),
  'workspace.match': Object.freeze({ name: '工作区语义匹配', version: 1, validate: validateWorkspace, run: matchWorkspace }),
  'music.recommend': Object.freeze({ name: '场景歌单推荐', version: 1, validate: validateRecommendation, run: recommend }),
  'knowledge.answer': Object.freeze({ name: '带来源知识问答', version: 1, validate: validateKnowledge, run: answer }),
  'schedule.draft': Object.freeze({ name: '日程草稿', version: 1, validate: validateSchedule, run: draftSchedule }),
  'task.draft': Object.freeze({ name: '任务草稿', version: 1, validate: validateTask, run: draft }),
  'writing.embed': Object.freeze({ name: '写作引用向量', version: 1, validate: validateEmbedding, run: embed }),
  'writing.assist': Object.freeze({ name: '写作辅助', version: 1, validate: validateWriting, run: assist }),
  'bookmark.embed': Object.freeze({ name: '书签向量', version: 1, validate: validateEmbedding, run: embed }),
  'activity.summary': Object.freeze({ name: '活动复盘', version: 1, validate: validateActivity, run: summarizeActivity }),
  'bookmark.summary': Object.freeze({ name: '书签摘要', version: 1, validate: validateSummary, run: summarize }),
  'bookmark.rerank': Object.freeze({ name: '书签精排', version: 1, validate: validateRanking, run: rerank }),
  'speech.transcribe': Object.freeze({ name: '本地语音识别', version: 1, validate: validateSpeech, run: interpretSpeech }),
  'speech.synthesize': Object.freeze({ name: '助手回答朗读（StepAudio）', version: 1, validate: validateSynthesis, run: synthesizeSpeech }),
  'music.intent': Object.freeze({ name: '音乐意图', version: 1, validate: validateMusic, run: interpretMusic }),
  'alarm.interpret': Object.freeze({ name: '智能闹钟', version: 1, validate: validateInput, run: interpret })
});
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const selectableScenes = new Set(['assistant.compact', 'assistant.plan', 'music.intent', 'alarm.interpret']);
function resolveSelection(value, sceneId, policy, fallbackModel) {
  if (value == null) return { model: policy.model || fallbackModel, reasoning: policy.reasoning };
  if (!selectableScenes.has(sceneId) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['model', 'reasoning'].includes(key))) throw fail('AI 选择不适用于当前场景', 400);
  const model = value.model ?? policy.model ?? fallbackModel, reasoning = value.reasoning ?? policy.reasoning;
  if (model != null && (typeof model !== 'string' || model.includes('://') || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(model))) throw fail('模型标识无效', 400);
  if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw fail('思考强度无效', 400);
  return { model, reasoning };
}

// Business callers choose a registered scene, never a URL, prompt or provider.
export function createGateway({ provider, speechProvider, synthesisProvider, layaProvider = null, history = createHistoryStore(), admission = createAdmission(), layaAdmission = createAdmission(), modelEnabled = true, disabledScenes = [], control = createControlStore({ modelEnabled, disabledScenes }) }) {
  const records = [];
  return {
    describe() {
      const state = control.snapshot();
      let layaUsage;
      try { layaUsage = layaAdmission.describe(); }
      catch { layaUsage = { admitted: 0, scenes: {}, error: 'Laya 使用记录不可用' }; }
      return { version: 1, usage: admission.describe(), laya: { mode: state.policy.layaMode, configured: Boolean(layaProvider), usage: layaUsage }, speech: speechProvider?.describe?.() || { configured: false, localOnly: true, maxSeconds: 30 }, synthesis: synthesisProvider?.describe?.() || { configured: false, localOnly: true }, ...state, modelEnabled: state.policy.modelEnabled, localOnly: true,
        scenes: [...Object.entries(SCENES).map(([id, scene]) => ({ id, name: scene.name, version: scene.version, modelEnabled: state.policy.modelEnabled && !state.policy.disabledScenes.includes(id) && (id !== 'speech.synthesize' || state.policy.speechSynthesisEnabled) }))],
        historyInfo: history.info(), records: structuredClone(records) };
    },
    async run(sceneId, body, { signal, trace, selection } = {}) {
      const state = control.snapshot();
      const requestId = randomBytes(16).toString('hex');
      const started = Date.now();
      let ticket;
      let historyTicket, result;
      const standalone = ['alarm.interpret', 'music.intent'].includes(sceneId) && !trace?.userManaged;
      const conversationId = trace?.conversationId || requestId;
      const event = (role, content) => {
        if (!standalone) return;
        try { history.event({ id: `${requestId}:${role}`, conversationId, startedAt: started, scene: sceneId, role, content, status: record.status }); } catch { /* History cannot block business execution. */ }
      };
      const scene = Object.hasOwn(SCENES, sceneId) ? SCENES[sceneId] : null;
      const record = { requestId, scene: scene ? sceneId : 'unknown', startedAt: started, status: 'pending', source: null,
        ...(trace?.userManaged && trace.conversationId && trace.turnId ? { conversationId: trace.conversationId, turnId: trace.turnId } : {}) };
      const execution = () => ({ requestId, scene: record.scene, source: record.source, status: record.status, model: record.model || null, reasoning: record.reasoning ?? null, requestedModel: record.requestedModel || null, requestedReasoning: record.requestedReasoning ?? null, contextBudget: record.contextBudget || null, policyRevision: record.policyRevision ?? null, elapsedMs: Date.now() - started, usage: record.usage || null, ...(record.layaPrefetch ? { layaPrefetch: { ...record.layaPrefetch } } : {}), ...(record.speech ? { speech: { ...record.speech } } : {}), ...(record.recoveryFromRequestId ? { recoveryFromRequestId: record.recoveryFromRequestId } : {}), ...(record.startReason ? { startReason: record.startReason } : {}), ...(record.planIssue ? { planIssue: record.planIssue } : {}), ...(record.attempts ? { attempts: structuredClone(record.attempts), effectiveReasoning: record.effectiveReasoning, usageComplete: record.attempts.every(attempt => Boolean(attempt.usage)) } : {}) });
      records.push(record);
      if (records.length > 100) records.shift();
      try {
        if (!scene) throw fail('未登记的 AI 场景', 400);
        const selected = resolveSelection(selection, sceneId, state.policy, provider.model);
        record.requestedModel = selected.model;
        record.requestedReasoning = selected.reasoning;
        // Reuse a successful recovery only within this executor turn and policy.
        // Operational records are bounded; no persistent preference is changed.
        const previous = sceneId === 'assistant.plan' && record.turnId && selected.reasoning !== 'off'
          ? records.findLast(row => row !== record && row.scene === sceneId && row.conversationId === record.conversationId && row.turnId === record.turnId) : null;
        const recovered = previous?.status === 'ready' && previous.policyRevision === state.revision &&
          previous.requestedModel === selected.model && previous.requestedReasoning === selected.reasoning &&
          previous.effectiveReasoning === 'off' && previous.attempts?.at(-1)?.status === 'succeeded' &&
          previous.startReason !== 'adaptive-receipts';
        if (recovered) record.recoveryFromRequestId = previous.requestId;
        // Strip caller-supplied prompts, provider URLs, credentials and unrelated context.
        const validated = scene.validate(body);
        // Opt-in policy: a planning round that already holds executor receipts starts with
        // thinking off. The selected level stays the ceiling and no setting is changed.
        const adaptiveStart = sceneId === 'assistant.plan' && !recovered && selected.reasoning !== 'off' && state.policy.planningStrategy === 'adaptive' &&
          validated.planningPhase !== 'outline' && Array.isArray(validated.observations) && validated.observations.some(row => row.tool !== 'assistant.plan');
        if (adaptiveStart) record.startReason = 'adaptive-receipts';
        const planningReasoning = recovered || adaptiveStart ? 'off' : selected.reasoning;
        const input = sceneId.startsWith('speech.') ? validated : { ...validated, reasoning: planningReasoning };
        historyTicket = history.begin(record, input, standalone ? { ...trace, conversationId } : trace);
        event('user', input.text);
        const controlledProvider = {
          model: selected.model, reasoning: planningReasoning, prefetchMode: state.policy.layaMode, compactionEnabled: state.policy.contextCompaction === 'hybrid' && (sceneId === 'assistant.compact' || !state.policy.disabledScenes.includes('assistant.compact')),
          async prefetchToolGroups({ text, app, groups }) {
            const mode = state.policy.layaMode;
            if (mode === 'off' || !state.policy.modelEnabled || !layaProvider) {
              record.layaPrefetch = { mode, status: 'disabled', groupCount: 0 };
              return { mode, status: 'disabled', groups: [] };
            }
            record.layaPrefetch = { mode, status: mode === 'shadow' ? 'observing' : 'pending', groupCount: 0 };
            const startedAt = Date.now();
            let prefetchTicket, timer;
            const controller = new AbortController();
            const onAbort = () => controller.abort(signal?.reason);
            if (signal?.aborted) onAbort();
            else signal?.addEventListener('abort', onAbort, { once: true });
            try {
              signal?.throwIfAborted();
              if (control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
              prefetchTicket = layaAdmission.start('assistant.prefetch', state.policy);
              timer = setTimeout(() => controller.abort(Object.assign(new Error('Laya 判断超时'), { code: 'LAYA_TIMEOUT' })), 2000);
              const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }));
              const suggested = await Promise.race([layaProvider.predict({ text, app, groups, signal: controller.signal }), aborted]);
              signal?.throwIfAborted();
              if (control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
              if (!Array.isArray(suggested) || suggested.length > groups.length || suggested.some(id => !groups.some(group => group.id === id))) throw Object.assign(new Error('Laya 返回了目录外工具组'), { code: 'LAYA_RESPONSE_INVALID' });
              try { layaAdmission.finish(prefetchTicket, true, state.policy); }
              catch { throw Object.assign(new Error('Laya 使用记录不可用'), { code: 'LAYA_USAGE_UNAVAILABLE' }); }
              // Broad answers increase Qwen's tool surface and are not useful
              // prefetch advice. Keep the baseline directory in that case.
              const status = mode === 'shadow' ? 'observed' : suggested.length > 2 ? 'abstained' : 'applied';
              const info = { mode, status, groupCount: suggested.length, elapsedMs: Date.now() - startedAt };
              record.layaPrefetch = info;
              return { ...info, groups: status === 'applied' ? suggested : [] };
            } catch (error) {
              if (prefetchTicket) {
                try { layaAdmission.finish(prefetchTicket, signal?.aborted || error.statusCode === 409 ? null : false, state.policy); }
                catch { error = Object.assign(new Error('Laya 使用记录不可用'), { code: 'LAYA_USAGE_UNAVAILABLE' }); }
              }
              if (signal?.aborted) throw error;
              if (control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
              record.layaPrefetch = { mode, status: 'fallback', groupCount: 0, elapsedMs: Date.now() - startedAt, code: error.code || (error.statusCode === 429 ? 'LAYA_LIMITED' : 'LAYA_UNAVAILABLE') };
              return { mode, status: 'fallback', groups: [] };
            } finally {
              if (timer) clearTimeout(timer);
              signal?.removeEventListener('abort', onAbort);
            }
          },
          async planningContext({ maxOutputTokens }) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('此场景的模型调用已关闭，仍可使用简单指令或手动设置', 403);
            const capacity = await provider.planningContext?.({ model: selected.model, signal }) || {};
            signal?.throwIfAborted();
            if (control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
            return { ...capacity, maxOutputTokens: Math.min(state.policy.maxOutputTokens, maxOutputTokens) };
          },
          async embed(input) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('向量调用已被控制面关闭', 403);
            ticket = admission.start(sceneId, state.policy);
            record.source = 'model'; record.model = state.policy.embeddingModel;
            history.finish(historyTicket, record);
            return provider.embed({ ...input, model: state.policy.embeddingModel, signal });
          },
          async transcribe(audio) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('语音识别已被控制面关闭', 403);
            if (!speechProvider) throw fail('本地语音识别尚未配置', 503);
            ticket = admission.start(sceneId, state.policy);
            record.source = 'speech'; record.policyRevision = state.revision;
            record.model = speechProvider.describe?.().model || 'whisper.cpp'; record.requestedModel = record.model; record.requestedReasoning = null; record.reasoning = null; record.timeoutMs = state.policy.timeoutMs;
            history.finish(historyTicket, record);
            return speechProvider.transcribe(audio, signal, { timeoutMs: state.policy.timeoutMs });
          },
          async synthesize(text) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || !state.policy.speechSynthesisEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('回答朗读已关闭，请在 AI 控制台启用', 403);
            if (!synthesisProvider) throw fail('本地语音合成尚未配置', 503);
            ticket = admission.start(sceneId, state.policy);
            const info = synthesisProvider.describe?.() || {};
            record.source = 'speech'; record.policyRevision = state.revision; record.timeoutMs = state.policy.timeoutMs;
            record.model = info.model || 'step-audio-editx'; record.requestedModel = record.model; record.requestedReasoning = null; record.reasoning = null;
            record.speech = { provider: info.provider, modelRevision: info.revision, runtime: info.runtime, voice: info.voice };
            history.finish(historyTicket, record);
            const audio = await synthesisProvider.synthesize(text, { signal, timeoutMs: state.policy.timeoutMs });
            signal?.throwIfAborted();
            record.speech.durationSeconds = audio.durationSeconds;
            record.speech.sampleRate = audio.sampleRate;
            return audio;
          },
          async generateText(options) { return this.generateObject(options); },
          async generateObject(options) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('此场景的模型调用已关闭，仍可使用简单指令或手动设置', 403);
            record.source = 'model';
            record.model = selected.model;
            record.reasoning = sceneId === 'assistant.compact' ? 'off' : selected.reasoning;
            record.policyRevision = state.revision;
            record.maxOutputTokens = Math.min(state.policy.maxOutputTokens, options.maxOutputTokens ?? 4096, sceneId === 'alarm.interpret' && selected.reasoning === 'off' ? 650 : 4096);
            record.timeoutMs = state.policy.timeoutMs;
            if (options.contextBudget) record.contextBudget = options.contextBudget;
            record.attempts = [];
            const deadline = Date.now() + state.policy.timeoutMs;
            const canRetry = sceneId === 'assistant.plan' && planningReasoning !== 'off';
            const retryCodes = new Set(['MODEL_REASONING_BUDGET_EXHAUSTED', 'MODEL_NO_FINAL_OUTPUT', 'MODEL_RESPONSE_TIMEOUT']);
            let retryReason;
            for (let index = 0; index < (canRetry ? 2 : 1); index++) {
              signal?.throwIfAborted();
              if (control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
              const remaining = deadline - Date.now();
              if (remaining <= 0) throw Object.assign(new Error('本地模型响应超时，请关闭思考后重试'), { code: 'MODEL_RESPONSE_TIMEOUT' });
              const reasoning = sceneId === 'assistant.compact' || index ? 'off' : planningReasoning;
              // Prefill alone can take 30s on the local 27B model. Give recovery
              // the larger share, keeping both attempts inside the same deadline.
              const timeoutMs = index === 0 && canRetry ? Math.max(1, Math.min(remaining, Math.floor(state.policy.timeoutMs / 3))) : remaining;
              const maxOutputTokens = index ? Math.min(record.maxOutputTokens, 1200) : record.maxOutputTokens;
              ticket = admission.start(sceneId, state.policy);
              const attempt = { index: index + 1, reasoning, maxOutputTokens, timeoutMs, startedAt: Date.now(), status: 'pending', ...(retryReason ? { retryReason } : {}), ...(index === 0 && record.startReason ? { startReason: record.startReason } : {}) };
              record.attempts.push(attempt);
              record.effectiveReasoning = reasoning;
              history.finish(historyTicket, record);
              try {
                const generate = sceneId === 'assistant.compact' ? provider.generateText : provider.generateObject;
                if (!generate) throw fail('模型入口不支持文本摘要', 503);
                const value = await generate.call(provider, { ...options, signal, model: selected.model, reasoning, timeoutMs, maxOutputTokens,
                  input: index ? { ...options.input, reasoning: 'off' } : options.input,
                  onMetadata: metadata => { attempt.contextLength = metadata.contextLength; attempt.contextSource = metadata.contextSource; if (metadata.contextBudget) record.contextBudget = metadata.contextBudget; },
                  onUsage: usage => {
                    attempt.usage = usage;
                    record.usage = {};
                    for (const row of record.attempts) for (const [key, count] of Object.entries(row.usage || {})) record.usage[key] = (record.usage[key] || 0) + count;
                  }
                });
                signal?.throwIfAborted();
                attempt.status = 'succeeded';
                return value;
              } catch (error) {
                attempt.status = signal?.aborted ? 'cancelled' : 'failed';
                attempt.errorCode = error.code || null;
                if (index || !canRetry || signal?.aborted || !retryCodes.has(error.code) || deadline - Date.now() < 1000) throw error;
                // Only retry generation. No executor, queue mutation or prior
                // business step is replayed, and the domain validates the result.
                // Count every failed attempt, but trip cooldown on the final
                // planning outcome. Otherwise this timeout blocks its own retry.
                admission.finish(ticket, false, state.policy, { intermediate: true });
                ticket = null;
                retryReason = error.code;
              } finally {
                attempt.elapsedMs = Date.now() - attempt.startedAt;
                history.finish(historyTicket, record);
              }
            }
          }
        };
        // The scene resolver validates model output before it leaves the gateway.
        result = await scene.run(input, controlledProvider);
        signal?.throwIfAborted();
        if (['model', 'speech'].includes(record.source) && control.snapshot().revision !== state.revision) throw fail('控制策略已更新，请重新提交请求', 409);
        if (ticket) admission.finish(ticket, true, state.policy);
        record.source = result.source;
        record.status = result.status;
        return { ...result, requestId, scene: sceneId, execution: execution() };
      } catch (error) {
        if (ticket) admission.finish(ticket, signal?.aborted || error.statusCode === 429 ? null : false, state.policy);
        record.status = signal?.aborted ? 'cancelled' : 'failed';
        record.errorCode = error.statusCode || 502;
        record.modelErrorCode = error.code || null;
        if (sceneId === 'assistant.plan' && error.code === 'ASSISTANT_PLAN_INVALID' && contract.planIssue(error.planIssue)) record.planIssue = error.planIssue;
        if (error.contextBudget) record.contextBudget = error.contextBudget;
        error.execution = execution();
        throw error;
      } finally {
        record.elapsedMs = Date.now() - started;
        const retained = history.finish(historyTicket, record, result);
        if (retained && standalone) event('assistant', result?.question || result?.displayText || (result ? JSON.stringify(result.intent || result) : `处理${record.status === 'cancelled' ? '已取消' : '失败'}`));
        // The in-memory operational record never includes bodies; opt-in content lives in history.
      }
    }
  };
}
