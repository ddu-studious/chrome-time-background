(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantVoiceBackground = api;
})(globalThis, function () {
  'use strict';
  const KEY = 'assistantVoiceJobsV1';
  const LIMIT = 32;
  const TTL = 5 * 60 * 1000;
  const error = (message, code = 'VOICE_BINDING_INVALID') => Object.assign(new Error(message), { code });
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
  const validOwner = value => typeof value === 'string' && value.length > 0 && value.length <= 2048;
  async function digest(text) {
    const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  function storedRow(row) {
    if (!row || !validOwner(row.owner) || !validId(row.requestId) || !validId(row.taskId) || !validId(row.messageId)
      || !Number.isSafeInteger(row.version) || row.version < 1 || !/^[a-f0-9]{64}$/.test(row.contentDigest || '')
      || !Number.isFinite(row.createdAt) || !Number.isFinite(row.expiresAt) || row.expiresAt <= row.createdAt || row.expiresAt - row.createdAt > TTL
      || (row.jobId !== null && !validId(row.jobId))) return null;
    // Restore only this receipt index, never arbitrary stored fields or an audio body.
    return { owner: row.owner, requestId: row.requestId, taskId: row.taskId, version: row.version,
      messageId: row.messageId, contentDigest: row.contentDigest, createdAt: row.createdAt, expiresAt: row.expiresAt, jobId: row.jobId };
  }
  function storedCancellation(row) {
    if (!row || !validOwner(row.owner) || !validId(row.requestId) || !Number.isFinite(row.createdAt)
      || !Number.isFinite(row.expiresAt) || row.expiresAt <= row.createdAt || row.expiresAt - row.createdAt > TTL) return null;
    return { owner: row.owner, requestId: row.requestId, createdAt: row.createdAt, expiresAt: row.expiresAt };
  }
  function create({ snapshot, request, storage, now = Date.now }) {
    if (typeof snapshot !== 'function' || typeof request !== 'function' || !storage?.get || !storage?.set) throw new TypeError('语音后台依赖不完整');
    let rows = [], cancellations = [], serial = Promise.resolve(), timer;
    // Match AssistantEngine's serialized state transitions. Network jobs run outside
    // this queue so cancel can invalidate a submission before its receipt arrives.
    const lock = fn => { const pending = serial.then(fn); serial = pending.catch(() => {}); return pending; };
    async function cancelJobs(ids) {
      const unique = [...new Set(ids.filter(Boolean))];
      const results = await Promise.allSettled(unique.map(jobId => request({ action: 'ai_job_cancel', jobId })));
      return results.some(item => item.status === 'rejected' || item.value?.ok === false);
    }
    function schedule() {
      clearTimeout(timer);
      const expiring = [...rows, ...cancellations];
      if (!expiring.length) return;
      timer = setTimeout(() => { void run(() => {}).catch(() => {}); }, Math.max(1, Math.min(...expiring.map(row => row.expiresAt)) - now()));
      timer.unref?.();
    }
    function rememberCancellation(owner, requestId) {
      if (cancellations.some(row => row.owner === owner && row.requestId === requestId)) return;
      const createdAt = now();
      cancellations.push({ owner, requestId, createdAt, expiresAt: createdAt + TTL });
      cancellations = cancellations.slice(-LIMIT);
    }
    const save = () => storage.set({ [KEY]: { version: 1, entries: rows, cancellations } });
    const ready = (async () => {
      const saved = (await storage.get(KEY))[KEY];
      const candidates = (Array.isArray(saved?.entries) ? saved.entries : []).map(storedRow).filter(Boolean);
      cancellations = (Array.isArray(saved?.cancellations) ? saved.cancellations : []).map(storedCancellation)
        .filter(row => row && row.createdAt <= now() && row.expiresAt > now()).slice(-LIMIT);
      const stale = [], requests = new Set(), jobs = new Set();
      for (const row of candidates) {
        const key = JSON.stringify([row.owner, row.requestId]);
        if (!row.jobId) { if (row.expiresAt > now()) rememberCancellation(row.owner, row.requestId); continue; }
        if (row.expiresAt <= now() || row.createdAt > now() || rows.length >= LIMIT) { stale.push(row.jobId); continue; }
        if (cancellations.some(item => item.owner === row.owner && item.requestId === row.requestId)) { stale.push(row.jobId); continue; }
        if (requests.has(key) || jobs.has(row.jobId)) continue;
        requests.add(key); jobs.add(row.jobId); rows.push(row);
      }
      await save();
      schedule();
      await cancelJobs(stale);
    })();
    ready.catch(() => {});

    async function run(fn) {
      const outcome = await lock(async () => {
        await ready;
        const cancel = [];
        rows = rows.filter(row => {
          if (row.expiresAt > now()) return true;
          if (row.jobId) cancel.push(row.jobId);
          return false;
        });
        cancellations = cancellations.filter(row => row.expiresAt > now());
        let value, failure;
        try { value = await fn(cancel); } catch (cause) { failure = cause; }
        try { await save(); }
        catch (cause) {
          cancel.push(...rows.map(row => row.jobId)); rows = [];
          failure = error(cause.message || '语音回执索引保存失败', 'VOICE_STORAGE_FAILED');
        }
        schedule();
        return { value, failure, cancel };
      });
      const cancelFailed = await cancelJobs(outcome.cancel);
      if (outcome.failure) throw outcome.failure;
      return { value: outcome.value, cancelFailed };
    }
    function remove(row, cancel) {
      rows = rows.filter(item => item !== row);
      if (row.jobId) cancel.push(row.jobId);
    }
    function source(task, binding) {
      if (!task || task.id !== binding.taskId || task.version !== binding.version || task.status === 'cancelled') return null;
      const message = task.messages?.find(item => item.id === binding.messageId && item.role === 'assistant');
      return typeof message?.content === 'string' ? message.content : null;
    }
    async function current(row) {
      const content = source(await snapshot(), row);
      if (content === null || await digest(content) !== row.contentDigest) return false;
      // Hashing yields; verify that the source did not change during that await.
      return source(await snapshot(), row) === content;
    }
    function matches(row, message, owner) {
      return row && row.owner === owner && row.taskId === message.taskId && row.version === message.version
        && row.messageId === message.messageId && (message.requestId == null || row.requestId === message.requestId);
    }
    async function validate(row, cancel) {
      if (row && await current(row)) return;
      if (row) remove(row, cancel);
      throw error('朗读内容已变化或任务已停止，请重新选择回答');
    }
    async function synthesize(message, owner) {
      if (!validId(message.requestId) || !validId(message.taskId) || !validId(message.messageId)
        || !Number.isSafeInteger(message.version) || message.version < 1
        || typeof message.text !== 'string' || !message.text.trim() || message.text.length > 300) {
        throw error('朗读请求无效，每段最多 300 字', 'VOICE_INPUT_INVALID');
      }
      const { value: binding } = await run(async () => {
        if (cancellations.some(row => row.owner === owner && row.requestId === message.requestId)) throw error('朗读已停止', 'VOICE_CANCELLED');
        if (rows.some(row => row.owner === owner && row.requestId === message.requestId)) throw error('此朗读请求已提交，请勿重复发送');
        if (rows.length >= LIMIT) throw error('进行中的朗读过多，请停止后重试', 'VOICE_BUSY');
        const content = source(await snapshot(), message);
        if (content === null || !content.includes(message.text)) throw error('只能朗读当前任务中助手已生成的回答');
        const createdAt = now();
        const row = { owner, requestId: message.requestId, taskId: message.taskId, version: message.version,
          messageId: message.messageId, contentDigest: await digest(content), createdAt, expiresAt: createdAt + TTL, jobId: null };
        if (!await current(row)) throw error('朗读内容已变化，请重新选择回答');
        rows.push(row);
        return row;
      });
      let receipt;
      try {
        if (!rows.includes(binding)) throw error('朗读已停止', 'VOICE_CANCELLED');
        receipt = await request({ action: 'speech_ai_synthesize', text: message.text,
          trace: { taskId: binding.taskId, taskVersion: binding.version, messageId: binding.messageId, requestId: binding.requestId } });
      } catch (cause) {
        await run(cancel => { remove(binding, cancel); });
        throw cause;
      }
      if (!validId(receipt?.jobId) || receipt?.ok === false) {
        await run(cancel => { remove(binding, cancel); });
        throw error(receipt?.error || '本机语音服务未返回有效任务回执', 'VOICE_SERVICE_FAILED');
      }
      await run(async cancel => {
        if (!rows.includes(binding)) { cancel.push(receipt.jobId); throw error('朗读已停止', 'VOICE_CANCELLED'); }
        binding.jobId = receipt.jobId;
        await validate(binding, cancel);
      });
      return { ...receipt, requestId: binding.requestId };
    }
    async function result(message, owner) {
      if (!validId(message.jobId)) throw error('语音任务回执无效');
      const { value: binding } = await run(async cancel => {
        const row = rows.find(item => item.jobId === message.jobId);
        if (!matches(row, message, owner)) throw error('语音任务不属于当前页面或回答');
        await validate(row, cancel);
        return row;
      });
      const response = await request({ action: 'speech_ai_result', jobId: binding.jobId });
      await run(async cancel => {
        if (!rows.includes(binding)) throw error('朗读已停止', 'VOICE_CANCELLED');
        await validate(binding, cancel);
        // The audio is returned once, never saved to storage or the Engine task.
        if (['ready', 'succeeded', 'failed', 'cancelled', 'expired'].includes(response?.status)) remove(binding, cancel);
      });
      return response;
    }
    async function cancel(message, owner) {
      if (!validId(message.jobId) && !validId(message.requestId)) throw error('缺少待停止的朗读请求');
      if ((message.jobId != null && !validId(message.jobId)) || (message.requestId != null && !validId(message.requestId))) throw error('待停止的朗读回执无效');
      const { value: count, cancelFailed } = await run(jobs => {
        const selected = rows.filter(row => (message.jobId ? row.jobId === message.jobId : row.requestId === message.requestId));
        if (message.jobId && selected.some(row => row.owner !== owner) && !selected.some(row => row.owner === owner)) throw error('不能停止其他页面的朗读');
        const owned = selected.filter(row => row.owner === owner);
        for (const row of owned) {
          if ((message.requestId != null && row.requestId !== message.requestId)
            || (message.taskId != null && row.taskId !== message.taskId)
            || (message.version != null && row.version !== message.version)
            || (message.messageId != null && row.messageId !== message.messageId)) throw error('待停止的朗读回执不匹配');
        }
        for (const row of owned) { rememberCancellation(owner, row.requestId); remove(row, jobs); }
        if (validId(message.requestId)) rememberCancellation(owner, message.requestId);
        return owned.length;
      });
      return { status: 'cancelled', cancelled: count, ...(cancelFailed ? { cancelFailed: true } : {}) };
    }
    return {
      async handle(message, owner) {
        if (!validOwner(owner)) throw error('语音请求缺少可信页面来源');
        if (message?.action === 'assistant_voice_synthesize') return synthesize(message, owner);
        if (message?.action === 'assistant_voice_result') return result(message, owner);
        if (message?.action === 'assistant_voice_cancel') return cancel(message, owner);
        throw error('未知语音操作', 'VOICE_ACTION_INVALID');
      },
      async onChange() {
        await run(async cancel => { for (const row of [...rows]) if (!await current(row)) remove(row, cancel); });
      },
      async cancelOwner(owner) {
        if (!validOwner(owner)) return;
        await run(cancel => { for (const row of [...rows]) if (row.owner === owner) { rememberCancellation(owner, row.requestId); remove(row, cancel); } });
      },
    };
  }
  return { create, KEY, LIMIT, TTL };
});
