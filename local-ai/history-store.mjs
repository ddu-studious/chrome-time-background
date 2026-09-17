import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const fail = message => Object.assign(new Error(message), { statusCode: 400 });
const idPattern = /^[a-zA-Z0-9:._-]{1,160}$/;
const text = value => { const result = String(value ?? ''); return result.length > 12000 ? result.slice(0, 11970) + '\n[内容过长，已截断]' : result; };
// Only domain payloads reach this store. Credentials/audio and nested secrets are excluded.
function clean(value, depth = 0, tool = false) {
  if (depth > 8) return '[深层内容省略]';
  if (typeof value === 'string') { const result = text(value).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]'); return tool ? result.replace(/https?:\/\/[^\s"<>]+/g, '[链接已省略]') : result; }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => clean(item, depth + 1, tool));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/token|password|secret|authorization|cookie|audio|api.?key/i.test(key) && (!tool || !/url|headers|^cover$/i.test(key))).slice(0, 100).map(([key, val]) => [key, clean(val, depth + 1, tool)]));
  return null;
}
function payload(value, tool = false) {
  const result = clean(value, 0, tool);
  return JSON.stringify(result).length > 24000 ? { truncated: true, preview: JSON.stringify(result).slice(0, 24000) } : result;
}
export function createHistoryStore({ file, now = Date.now } = {}) {
  let state = { version: 1, revision: 1, epoch: 1, clearedAt: 0, deleted: [], settings: { captureContent: false, retentionDays: 30 }, calls: [], events: [] };
  let lastError = null;
  if (file && existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (saved.version !== 1 || !Array.isArray(saved.calls) || !Array.isArray(saved.events) || !Number.isInteger(saved.epoch) || !Number.isInteger(saved.revision) || typeof saved.settings?.captureContent !== 'boolean' || ![7, 30, 90, 365].includes(saved.settings.retentionDays)) throw new Error('AI 历史文件损坏，未覆盖原文件');
    if (saved.tools !== undefined && !Array.isArray(saved.tools)) throw new Error('AI 工具历史文件损坏，未覆盖原文件');
    state = saved;
  }
  state.tools ||= [];
  const prune = next => {
    const cutoff = now() - next.settings.retentionDays * 86400000;
    next.calls = next.calls.filter(row => row.startedAt >= cutoff).slice(-2000);
    next.events = next.events.filter(row => row.at >= cutoff).slice(-4000);
    next.tools = next.tools.filter(row => row.startedAt >= cutoff).slice(-4000);
    // Bound disk space as well as row count; remove whole oldest records.
    while (Buffer.byteLength(JSON.stringify(next), 'utf8') > 12 * 1024 * 1024) {
      const oldest = [next.calls[0]?.startedAt ?? Infinity, next.events[0]?.at ?? Infinity, next.tools[0]?.startedAt ?? Infinity];
      [next.calls, next.events, next.tools][oldest.indexOf(Math.min(...oldest))].shift();
    }
    return next;
  };
  function commit(next) {
    prune(next);
    if (file) {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file + '.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync(file + '.tmp', file);
    }
    state = next; lastError = null;
  }
  function safe(fn) { try { return fn(); } catch { lastError = '历史写入失败，请检查本机存储空间和文件权限；业务执行继续。'; return null; } }
  // Persist interruption at recovery so unfinished calls never appear successful.
  if (state.calls.some(row => row.status === 'pending') || state.tools.some(row => row.status === 'running')) commit({ ...state, calls: state.calls.map(row => row.status === 'pending' ? { ...row, status: 'interrupted' } : row), tools: state.tools.map(row => row.status === 'running' ? { ...row, status: 'interrupted', interruption: '本机服务重启，未收到完成回执' } : row) });
  return {
    info() { return { settings: { ...state.settings }, revision: state.revision, error: lastError }; },
    begin(record, input, trace = {}) {
      return safe(() => {
        const conversationId = idPattern.test(trace.conversationId || '') ? trace.conversationId : null;
        if (state.deleted?.includes(conversationId) || (trace.startedAt && trace.startedAt <= state.clearedAt)) return null;
        const row = { ...record, conversationId, ...(idPattern.test(trace.turnId || '') ? { turnId: trace.turnId } : {}), contentSaved: state.settings.captureContent };
        if (idPattern.test(trace.toolCallId || '')) row.toolCallId = trace.toolCallId;
        if (row.contentSaved) row.input = payload(input);
        commit({ ...state, calls: [...state.calls, row] });
        return { requestId: row.requestId, epoch: state.epoch, captureContent: state.settings.captureContent };
      });
    },
    finish(ticket, record, result) {
      if (!ticket || ticket.epoch !== state.epoch) return;
      return safe(() => {
        const index = state.calls.findIndex(row => row.requestId === ticket.requestId);
        if (index < 0) return;
        const calls = [...state.calls], row = { ...calls[index], ...record };
        if (ticket.captureContent && state.settings.captureContent && result !== undefined) row.output = payload(result);
        calls[index] = row; commit({ ...state, calls }); return true;
      });
    },
    event(value) {
      if (value?.role === 'tool') {
        if (!idPattern.test(value.id || '') || !idPattern.test(value.conversationId || '') || !idPattern.test(value.turnId || '') || !idPattern.test(value.tool || '') || !['plan', 'tool', 'action', 'operation', 'request'].includes(value.kind) || !Number.isSafeInteger(value.startedAt) || value.startedAt < 0 || !['start', 'end'].includes(value.phase) || (value.parentId != null && !idPattern.test(value.parentId))) throw fail('工具记录无效');
        if (state.deleted?.includes(value.conversationId) || value.startedAt <= state.clearedAt) return;
        const index = state.tools.findIndex(row => row.id === value.id);
        if (value.phase === 'start') {
          if (index >= 0) return;
          const row = { id: value.id, conversationId: value.conversationId, turnId: value.turnId, parentId: value.parentId || null, scene: 'assistant', tool: value.tool, title: String(value.title || value.tool).slice(0, 120), kind: value.kind, startedAt: value.startedAt, status: 'running', contentSaved: state.settings.captureContent };
          if (row.contentSaved) row.input = payload(value.input, true);
          commit({ ...state, tools: [...state.tools, row] });
        } else {
          // An end must match a persisted start; never resurrect a deleted/pruned invocation.
          if (index < 0) return;
          const previous = state.tools[index];
          if (previous.conversationId !== value.conversationId || previous.turnId !== value.turnId || previous.tool !== value.tool || previous.startedAt !== value.startedAt) throw fail('工具回执不匹配');
          if (previous.status !== 'running') return;
          if (!['succeeded', 'waiting', 'failed', 'cancelled', 'interrupted'].includes(value.status) || !Number.isSafeInteger(value.endedAt) || value.endedAt < value.startedAt) throw fail('工具结束状态无效');
          const row = { ...previous, status: value.status, endedAt: value.endedAt, elapsedMs: value.endedAt - value.startedAt };
          if (previous.contentSaved && state.settings.captureContent) { row.output = payload(value.output, true); if (value.error) row.error = payload(value.error, true); }
          const tools = [...state.tools]; tools[index] = row; commit({ ...state, tools });
        }
        return;
      }
      if (!value || !idPattern.test(value.id || '') || !idPattern.test(value.conversationId || '') || !idPattern.test(value.scene || '') || !['user', 'assistant', 'status'].includes(value.role)) throw fail('对话事件无效');
      if (state.events.some(row => row.id === value.id)) return;
      if (state.deleted?.includes(value.conversationId) || (Number.isFinite(value.startedAt) && value.startedAt <= state.clearedAt)) return;
      const row = { id: value.id, conversationId: value.conversationId, scene: value.scene, role: value.role, at: now(), status: String(value.status || '').slice(0, 40), source: value.source === 'rules' ? 'rules' : null, contentSaved: state.settings.captureContent };
      if (row.contentSaved) row.content = clean(text(value.content));
      commit({ ...state, events: [...state.events, row] });
    },
    configure(settings, revision) {
      if (revision !== state.revision) throw Object.assign(new Error('历史设置已变化，请刷新后再保存'), { statusCode: 409 });
      if (typeof settings?.captureContent !== 'boolean' || ![7, 30, 90, 365].includes(settings.retentionDays)) throw fail('留存设置无效');
      commit({ ...state, revision: state.revision + 1, settings: { captureContent: settings.captureContent, retentionDays: settings.retentionDays } });
    },
    remove({ requestId, conversationId, all } = {}) {
      if (!all && !idPattern.test(requestId || '') && !idPattern.test(conversationId || '')) throw fail('删除目标无效');
      // Advancing epoch prevents in-flight completions resurrecting deleted content.
      commit({ ...state, epoch: all ? state.epoch + 1 : state.epoch,
        clearedAt: all ? now() : state.clearedAt,
        deleted: [...new Set([...(state.deleted || []), ...(all ? [...state.events.map(r => r.conversationId), ...state.calls.map(r => r.conversationId).filter(Boolean), ...state.tools.map(r => r.conversationId)] : conversationId ? [conversationId] : [])])].slice(-6000),
        calls: all ? [] : state.calls.filter(row => requestId ? row.requestId !== requestId : row.conversationId !== conversationId),
        tools: all ? [] : state.tools.filter(row => !conversationId || row.conversationId !== conversationId),
        events: all ? [] : state.events.filter(row => !conversationId || row.conversationId !== conversationId) });
    },
    snapshot() {
      const next = prune(structuredClone(state));
      if (next.calls.length !== state.calls.length || next.events.length !== state.events.length || next.tools.length !== state.tools.length) safe(() => commit(next));
      return { ...next, error: lastError };
    }
  };
}
