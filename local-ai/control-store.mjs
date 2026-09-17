import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const error = (text, code = 400) => Object.assign(new Error(text), { statusCode: code });
export function createControlStore({ file, modelEnabled = true, disabledScenes = [], sceneIds = ['assistant.plan', 'alarm.interpret', 'music.intent', 'speech.transcribe', 'bookmark.summary', 'bookmark.rerank', 'activity.summary', 'bookmark.embed', 'writing.assist', 'writing.embed', 'task.draft', 'schedule.draft', 'knowledge.answer', 'music.recommend', 'workspace.match', 'content.digest', 'trending.cluster'] } = {}) {
  function validate(value) {
    if (!value || typeof value.modelEnabled !== 'boolean' || !Array.isArray(value.disabledScenes) || value.disabledScenes.some(id => id !== 'agent.cursor' && !sceneIds.includes(id))) throw error('控制策略无效');
    if (Object.keys(value).some(key => !['modelEnabled', 'disabledScenes', 'model', 'reasoning', 'timeoutMs', 'maxOutputTokens', 'embeddingModel', 'allowRemote', 'dailyRequestLimit', 'failureThreshold', 'cooldownMs'].includes(key))) throw error('控制策略包含未知字段');
    const dailyRequestLimit = value.dailyRequestLimit ?? 200;
    const failureThreshold = value.failureThreshold ?? 3;
    const cooldownMs = value.cooldownMs ?? 60000;
    if (!Number.isInteger(dailyRequestLimit) || dailyRequestLimit < 1 || dailyRequestLimit > 10000 || !Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 20 || !Number.isInteger(cooldownMs) || cooldownMs < 1000 || cooldownMs > 3600000) throw error('请求预算或冷却策略无效');
    const model = value.model ?? null;
    const embeddingModel = value.embeddingModel ?? 'text-embedding-nomic-embed-text-v1.5';
    if (typeof embeddingModel !== 'string' || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(embeddingModel)) throw error('向量模型标识无效');
    const reasoning = value.reasoning ?? 'off';
    const timeoutMs = value.timeoutMs ?? 90000;
    const maxOutputTokens = value.maxOutputTokens ?? 4096;
    if (model !== null && (typeof model !== 'string' || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(model))) throw error('模型标识无效');
    if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw error('推理等级无效');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 5000 || timeoutMs > 90000) throw error('超时应为 5 至 90 秒');
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 4096) throw error('输出预算应为 64 至 4096 token');
    return { modelEnabled: value.modelEnabled, disabledScenes: [...new Set(value.disabledScenes)].filter(id => sceneIds.includes(id)), model, reasoning, timeoutMs, maxOutputTokens, embeddingModel, dailyRequestLimit, failureThreshold, cooldownMs };
  }
  let state = { revision: 1, policy: validate({ modelEnabled, disabledScenes }), history: [] };
  if (file && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 1 || !Array.isArray(saved.history) || saved.history.length > 20) throw error('控制策略文件损坏');
    state = { revision: saved.revision, policy: validate(saved.policy), history: saved.history.map(item => {
      if (!Number.isSafeInteger(item.revision) || item.revision < 1 || item.revision >= saved.revision) throw error('控制策略历史无效');
      return { revision: item.revision, policy: validate(item.policy) };
    }) };
  }
  const snapshot = () => structuredClone(state);
  return {
    snapshot,
    update(policy, expectedRevision) {
      if (expectedRevision !== state.revision) throw error('配置已被其他页面更新，请刷新后再试', 409);
      const next = { revision: state.revision + 1, policy: validate(policy), history: [...state.history, { revision: state.revision, policy: state.policy }].slice(-20) };
      if (file) {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
        renameSync(file + '.tmp', file);
      }
      state = next;
      return snapshot();
    },
    rollback(revision, expectedRevision) {
      const previous = state.history.find(item => item.revision === revision);
      if (!previous) throw error('目标版本不存在或已过期', 404);
      return this.update(previous.policy, expectedRevision);
    }
  };
}
