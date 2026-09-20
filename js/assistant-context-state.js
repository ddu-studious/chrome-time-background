(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantContextState = api;
})(globalThis, function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  const error = (text, code = 'CONTEXT_SOURCE_LIMIT') => Object.assign(new Error(text), { code });
  const LIMIT = 512 * 1024;
  function state(task) {
    if (!task.contextState) {
      task.contextState = { version: 1, revision: 0, events: [], receipts: [], artifacts: {}, checkpoint: null, count: 0, historyComplete: !(task.turns?.length) };
      for (const row of task.turns || []) append(task, row.role, row.content);
      for (const [index, row] of (task.log || []).entries()) if (row.status === 'done') task.contextState.receipts.push({ id: `legacy:${index}`, turnId: task.turnId || task.id || 'legacy', tool: row.tool, message: String(row.message || '').slice(0, 500) });
    }
    return task.contextState;
  }
  function append(task, role, content) {
    const s = state(task);
    if (typeof content !== 'string' || content.length > 6000 || s.events.length >= 512) throw error('本次任务来源记录已达上限，已有进度保留，请新建需求');
    const row = { seq: s.revision + 1, role, content };
    if (bytes(s) + bytes(row) > LIMIT) throw error('本次任务上下文存储已满，已有进度保留');
    s.revision++; s.events.push(row);
    return row.seq;
  }
  function clean(value, depth = 0) {
    if (depth > 12) throw error('工具结果嵌套过深，执行回执已保留');
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1));
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(authorization|cookie|headers|password|secret|token|apiKey|playUrl)$/i.test(key)).map(([key, item]) => [key, clean(item, depth + 1)]));
  }
  function project(value, key = '') {
    if (typeof value === 'string') return /^(description|summary|html|raw|details|content|text)$/i.test(key) && value.length > 300 ? value.slice(0, 300) + '…[可回读原文]' : value;
    if (Array.isArray(value)) return value.map(row => project(row));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([name]) => !/^(cover|avatar|thumbnail|url)$/i.test(name)).map(([name, item]) => [name, project(item, name)]));
    return value;
  }
  function observe(task, observation, action) {
    const s = state(task);
    // Store the receipt before any potentially failing large-result operation.
    if (observation.status === 'done') {
      s.receipts.push({ id: `${task.turnId || task.id}:${s.revision + 1}`, turnId: task.turnId || task.id,
        tool: observation.tool, status: 'done', message: observation.message, ...(action?.key ? { key: action.key } : {}) });
    }
    const raw = clean(observation.data), ref = `context:${s.revision + 1}`;
    if (bytes(s) + bytes(raw) > LIMIT) throw error('工具结果超过本次任务存储上限，执行回执已保留，请缩小查询范围');
    const seq = append(task, 'assistant', `${observation.tool} [${observation.status}] ${observation.message}${raw == null ? '' : `（来源 ${ref}）`}`);
    if (raw != null) s.artifacts[ref] = { seq, data: raw };
    let data = project(raw);
    if (bytes(data) > 7000) {
      // Keep all executable identifiers and pagination at the top level. Large
      // arrays remain in the source and are read by offset, not silently lost.
      data = data && typeof data === 'object' && !Array.isArray(data) ? Object.fromEntries(Object.entries(data).map(([key, value]) =>
        [key, bytes(value) > 2000 && !/^(selectedRef|revision|nextRef|ref)$/.test(key) ? { contextRef: ref, field: key, count: Array.isArray(value) ? value.length : null } : value])) : { contextRef: ref };
    }
    if (bytes(data) > 10000) throw error('关键工具状态过大，执行回执已保留，请缩小查询范围');
    if (JSON.stringify(data) !== JSON.stringify(raw)) {
      s.artifacts[ref] = { seq, data: raw };
      data = data && typeof data === 'object' && !Array.isArray(data) ? { ...data, contextRef: ref } : { items: data, contextRef: ref };
    }
    return { ...observation, data };
  }
  function pending(task) { const s = state(task); return s.events.filter(row => row.seq > (s.checkpoint?.throughSeq || 0)); }
  function batch(task, force = false) {
    const s = state(task), entries = [];
    for (const row of pending(task)) {
      if (entries.length >= 32 || bytes({ entries: [...entries, row], summary: s.checkpoint?.summary || '' }) > 40000) break;
      entries.push(copy(row));
    }
    if (entries.length < 2) return null;
    return { revision: s.revision, entries, summary: s.checkpoint?.summary || '', force };
  }
  function commit(task, request, result) {
    const s = state(task);
    if (!result?.changed) return false;
    const index = request.entries.findIndex(row => row.seq === result.throughSeq);
    if (s.revision !== request.revision || result.revision !== request.revision || index < 0 || index >= request.entries.length - 1 || result.firstRetainedSeq !== request.entries[index + 1].seq ||
      typeof result.summary !== 'string' || !result.summary.trim() || result.summary.length > 6000 || result.afterEstimatedTokens >= result.beforeEstimatedTokens) throw error('整理来源已变化或摘要无效，保留原记录', 'COMPACTION_STALE');
    s.checkpoint = { ...copy(result), revision: request.revision }; s.count++;
    task.contextNotice = `已整理上下文 ${s.count} 次 · 估算 ${result.beforeEstimatedTokens} → ${result.afterEstimatedTokens} tokens，用户要求与执行回执已保留。`;
    return true;
  }
  function envelope(task) {
    const s = state(task);
    const current = s.events.findLastIndex(row => row.role === 'user' && row.content === task.input.text);
    const constraints = s.events.filter((row, index) => row.role === 'user' && index !== current).map(row => ({ seq: row.seq, text: row.content }));
    const receipts = s.receipts.map(({ id, turnId, tool, message, status }) => ({ id, turnId, tool, message, status: status || 'done' }));
    const value = { version: 1, revision: s.revision, summary: s.checkpoint?.summary || '', constraints, receipts };
    if (constraints.length > 96 || receipts.length > 96 || bytes(value) > 42000) throw error('必须保留的要求和回执已达到容量上限，进度已保存，请新建需求', 'CONTEXT_IRREDUCIBLE');
    return value;
  }
  function read(task, ref, offset = 0) {
    const record = state(task).artifacts[ref];
    if (!record) throw error('该上下文引用已失效，请重新查询', 'CONTEXT_REF_EXPIRED');
    const text = JSON.stringify(record.data);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= text.length) throw error('上下文读取位置无效');
    const end = Math.min(text.length, offset + 1600);
    return { message: `已读取工具结果 ${offset + 1}–${end}/${text.length} 字符；历史引用使用前须核对当前状态。`,
      observation: { contextRef: ref, excerpt: text.slice(offset, end), nextOffset: end < text.length ? end : null, totalCharacters: text.length, historical: true } };
  }
  function actionKey(task, step) {
    if (!['music.queue.clear', 'music.queue.apply', 'music.queue.play', 'music.queue.remove', 'alarm.toggle', 'alarm.prepare', 'alarm.update.prepare'].includes(step.tool)) return null;
    const args = Object.fromEntries(Object.entries(step.args || {}).filter(([key]) => key !== 'expectedRevision'));
    return JSON.stringify([task.id, step.tool, args]);
  }
  function uncertain(task) {
    const last = task.log?.at(-1);
    if (['alarm.prepare', 'alarm.update.prepare'].includes(last?.tool) && !last.sideEffectStarted) return;
    if (last?.status !== 'running' || (!last.key && !last.sideEffectStarted && task.operation?.status !== 'pending')) return;
    const s = state(task), id = `unknown:${task.turnId || task.id}`;
    if (!s.receipts.some(row => row.id === id)) s.receipts.push({ id, turnId: task.turnId || task.id,
      tool: task.operation?.action || last.tool, ...(task.operation?.choiceId ? { choiceId: task.operation.choiceId } : {}), status: 'unknown', message: '操作已开始但没有收到完成回执，可能已经生效，核对前不可重做。' });
    s.uncertain = true;
  }
  return { state, append, observe, pending, batch, commit, envelope, read, actionKey, uncertain };
});
