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
import { interpret as interpretMusic, validateInput as validateMusic } from './music-service.mjs';
import { plan as planAssistant, validateInput as validateAssistant } from './assistant-service.mjs';

const SCENES = Object.freeze({
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
  'music.intent': Object.freeze({ name: '音乐意图', version: 1, validate: validateMusic, run: interpretMusic }),
  'alarm.interpret': Object.freeze({ name: '智能闹钟', version: 1, validate: validateInput, run: interpret })
});
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const selectableScenes = new Set(['assistant.plan', 'music.intent', 'alarm.interpret']);
function resolveSelection(value, sceneId, policy, fallbackModel) {
  if (value == null) return { model: policy.model || fallbackModel, reasoning: policy.reasoning };
  if (!selectableScenes.has(sceneId) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['model', 'reasoning'].includes(key))) throw fail('AI 选择不适用于当前场景', 400);
  const model = value.model ?? policy.model ?? fallbackModel, reasoning = value.reasoning ?? policy.reasoning;
  if (model != null && (typeof model !== 'string' || model.includes('://') || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(model))) throw fail('模型标识无效', 400);
  if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw fail('思考强度无效', 400);
  return { model, reasoning };
}

// Business callers choose a registered scene, never a URL, prompt or provider.
export function createGateway({ provider, speechProvider, history = createHistoryStore(), admission = createAdmission(), modelEnabled = true, disabledScenes = [], control = createControlStore({ modelEnabled, disabledScenes }) }) {
  const records = [];
  return {
    describe() {
      const state = control.snapshot();
      return { version: 1, usage: admission.describe(), speech: speechProvider?.describe?.() || { configured: false, localOnly: true, maxSeconds: 30 }, ...state, modelEnabled: state.policy.modelEnabled, localOnly: true,
        scenes: [...Object.entries(SCENES).map(([id, scene]) => ({ id, name: scene.name, version: scene.version, modelEnabled: state.policy.modelEnabled && !state.policy.disabledScenes.includes(id) }))],
        historyInfo: history.info(), records: records.map(record => ({ ...record })) };
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
      const record = { requestId, scene: scene ? sceneId : 'unknown', startedAt: started, status: 'pending', source: null };
      const execution = () => ({ requestId, scene: record.scene, source: record.source, status: record.status, model: record.model || null, reasoning: record.reasoning ?? null, policyRevision: record.policyRevision ?? null, elapsedMs: Date.now() - started, usage: record.usage || null });
      records.push(record);
      if (records.length > 100) records.shift();
      try {
        if (!scene) throw fail('未登记的 AI 场景', 400);
        const selected = resolveSelection(selection, sceneId, state.policy, provider.model);
        // Strip caller-supplied prompts, provider URLs, credentials and unrelated context.
        const input = { ...scene.validate(body), reasoning: selected.reasoning };
        historyTicket = history.begin(record, input, standalone ? { ...trace, conversationId } : trace);
        event('user', input.text);
        const controlledProvider = {
          model: selected.model, reasoning: selected.reasoning,
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
            history.finish(historyTicket, record);
            return speechProvider.transcribe(audio, signal);
          },
          async generateObject(options) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('此场景的模型调用已关闭，仍可使用简单指令或手动设置', 403);
            ticket = admission.start(sceneId, state.policy);
            record.source = 'model';
            record.model = selected.model;
            record.reasoning = selected.reasoning;
            record.policyRevision = state.revision;
            record.maxOutputTokens = Math.min(state.policy.maxOutputTokens, options.maxOutputTokens ?? 4096, sceneId === 'alarm.interpret' && selected.reasoning === 'off' ? 650 : 4096);
            record.timeoutMs = state.policy.timeoutMs;
            history.finish(historyTicket, record);
            return provider.generateObject({ ...options, signal, model: selected.model, reasoning: selected.reasoning,
          onUsage: usage => { record.usage = usage; },
          async embed(input) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('向量调用已被控制面关闭', 403);
            record.source = 'model'; record.model = state.policy.embeddingModel;
            return provider.embed({ ...input, model: state.policy.embeddingModel, signal });
          },
          async transcribe(audio) {
            signal?.throwIfAborted();
            if (!state.policy.modelEnabled || state.policy.disabledScenes.includes(sceneId)) throw fail('语音识别已被控制面关闭', 403);
            if (!speechProvider) throw fail('本地语音识别尚未配置', 503);
            record.source = 'speech'; record.policyRevision = state.revision;
            return speechProvider.transcribe(audio, signal);
          }, timeoutMs: state.policy.timeoutMs, maxOutputTokens: Math.min(state.policy.maxOutputTokens, options.maxOutputTokens ?? 4096, sceneId === 'alarm.interpret' && selected.reasoning === 'off' ? 650 : 4096) });
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
