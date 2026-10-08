(function (root) {
  'use strict';
  const MAX_TEXT = 2000, SEGMENT_LENGTH = 200;

  // Keep every segment a literal substring of the executor-owned message.
  function splitText(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('这条答复没有可朗读的文字');
    if (text.length > MAX_TEXT) throw new Error('这条答复超过 2000 字，暂不支持整条朗读，请让助手提供简短答复');
    const parts = [];
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + SEGMENT_LENGTH, text.length);
      if (end < text.length) {
        const chunk = text.slice(offset, end), breaks = [...chunk.matchAll(/[。！？!?；;\n]/g)];
        const last = breaks.at(-1);
        if (last && last.index >= SEGMENT_LENGTH / 3) end = offset + last.index + 1;
        else if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      }
      const part = text.slice(offset, end); if (part.trim()) parts.push(part);
      offset = end;
    }
    return parts;
  }

  function create(options) {
    const { send, notify = () => {}, onState = () => {}, onStart = () => {} } = options;
    const now = options.now || Date.now;
    const setTimer = options.setTimeout || setTimeout, clearTimer = options.clearTimeout || clearTimeout;
    const createURL = options.createObjectURL || (blob => URL.createObjectURL(blob));
    const revokeURL = options.revokeObjectURL || (url => URL.revokeObjectURL(url));
    const makeAudio = options.makeAudio || (() => new Audio());
    const makeBlob = options.makeBlob || ((bytes, type) => new Blob([bytes], { type }));
    const decode = options.decodeBase64 || (value => Uint8Array.from(atob(value), character => character.charCodeAt(0)));
    const newId = options.newId || (() => root.crypto?.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    let currentTask = null, active = null, generation = 0, disposed = false;
    const state = () => active ? { status: active.status, taskId: active.taskId, version: active.version, messageId: active.messageId, segment: active.segment, total: active.parts.length } : { status: 'idle' };
    const emit = () => onState(state());
    const valid = operation => !disposed && active === operation && operation.generation === generation && currentTask?.id === operation.taskId && currentTask.version === operation.version && currentTask.messages?.some(message => message.id === operation.messageId && message.role === 'assistant' && message.content === operation.text);
    const cancelJob = (jobId, requestId) => { if (jobId || requestId) void Promise.resolve().then(() => send('assistant_voice_cancel', { ...(jobId ? { jobId } : {}), ...(requestId ? { requestId } : {}) })).catch(() => {}); };
    function releaseAudio(operation) {
      if (operation.audio) {
        operation.audio.onended = operation.audio.onerror = null;
        operation.audio.pause(); operation.audio.removeAttribute?.('src'); operation.audio.load?.(); operation.audio = null;
      }
      if (operation.url) { revokeURL(operation.url); operation.url = null; }
      operation.finishAudio?.(); operation.finishAudio = null;
    }
    function stop(message = '') {
      generation++;
      const operation = active; active = null;
      if (operation) {
        cancelJob(operation.jobId, operation.requestId); operation.jobId = operation.requestId = null;
        clearTimer(operation.timer); operation.wake?.(); operation.wake = null;
        releaseAudio(operation);
      }
      emit(); if (message && operation) notify(message);
    }
    function updateTask(task) {
      currentTask = task;
      if (active && !valid(active)) stop('对话已更新，已停止朗读');
    }
    function delay(operation) {
      return new Promise(resolve => {
        operation.wake = resolve;
        operation.timer = setTimer(() => { operation.timer = null; operation.wake = null; resolve(); }, options.pollMs ?? 700);
      });
    }
    async function play(operation, result) {
      if (!valid(operation)) return;
      if (result.mimeType !== 'audio/wav' || typeof result.audio !== 'string' || !result.audio || result.audio.length > 12000000) throw new Error('本机返回的语音无效');
      const bytes = decode(result.audio);
      if (bytes.length < 44 || String.fromCharCode(...bytes.slice(0, 4)) !== 'RIFF' || String.fromCharCode(...bytes.slice(8, 12)) !== 'WAVE') throw new Error('本机返回的 WAV 语音无效');
      operation.url = createURL(makeBlob(bytes, 'audio/wav'));
      const audio = operation.audio = makeAudio(); audio.src = operation.url;
      let cancelled;
      const stopped = new Promise(resolve => { cancelled = resolve; });
      const ended = new Promise((resolve, reject) => {
        operation.finishAudio = cancelled;
        audio.onended = resolve;
        audio.onerror = () => reject(new Error('语音播放失败，请重试朗读'));
      });
      // Attach rejection handling before play(), which itself can reject on autoplay policy.
      const playback = Promise.all([Promise.resolve().then(() => { if (valid(operation) && operation.audio === audio) return audio.play(); }), ended]);
      operation.status = 'playing'; emit(); notify(`正在朗读 ${operation.segment}/${operation.parts.length}，可随时停止`);
      try { await Promise.race([playback, stopped]); }
      catch (error) { if (error.name === 'NotAllowedError') throw new Error('浏览器阻止了语音播放，请再次点击朗读'); throw error; }
      finally { releaseAudio(operation); }
    }
    async function start(task, message) {
      if (disposed) return;
      if (active?.taskId === task?.id && active?.messageId === message?.id && active?.version === task?.version) { stop('已停止朗读'); return; }
      stop(); currentTask = task;
      let parts;
      try {
        if (!task?.id || !Number.isSafeInteger(task.version) || !message?.id || message.role !== 'assistant' || !task.messages?.some(row => row.id === message.id && row.role === 'assistant' && row.content === message.content)) throw new Error('这条答复已更新，请刷新后重试');
        parts = splitText(message.content);
      } catch (error) { notify(error.message, 'error'); return; }
      const operation = active = { taskId: task.id, version: task.version, messageId: message.id, text: message.content, parts, generation, segment: 0, status: 'preparing' };
      onStart(); emit(); notify('正在准备本机朗读…');
      try {
        const policy = await send('ai_control_get'); if (!valid(operation)) return;
        if (!policy?.ok) throw new Error(policy?.error || '无法读取 AI 设置');
        if (!policy.modelEnabled || !policy.scenes?.some(scene => scene.id === 'speech.synthesize' && scene.modelEnabled)) throw new Error('语音朗读未启用，请到 AI 设置开启模型总开关和语音朗读');
        if (!policy.synthesis?.configured) throw new Error('本机朗读模型尚未配置，请到 AI 设置查看语音朗读配置');
        for (let index = 0; index < parts.length && valid(operation); index++) {
          operation.segment = index + 1; operation.status = 'preparing'; emit(); notify(`正在本机合成 ${operation.segment}/${parts.length}，完成后自动播放；可能需要数十秒…`);
          const binding = { taskId: operation.taskId, version: operation.version, messageId: operation.messageId };
          const requestId = operation.requestId = newId();
          let result = await send('assistant_voice_synthesize', { ...binding, requestId, text: parts[index] });
          if (!valid(operation)) { cancelJob(result?.jobId, requestId); return; }
          operation.jobId = result?.jobId;
          const deadline = now() + (options.timeoutMs ?? 180000);
          while (result?.ok && result.status === 'pending') {
            if (!operation.jobId) throw new Error('本机朗读任务缺少回执');
            if (now() >= deadline) throw new Error('本机语音合成超时，请重试');
            await delay(operation); if (!valid(operation)) return;
            result = await send('assistant_voice_result', { ...binding, jobId: operation.jobId });
            if (!valid(operation)) { cancelJob(result?.jobId, requestId); return; }
          }
          if (!result?.ok || result.status !== 'ready') throw new Error(result?.error || '本机语音合成未完成');
          await play(operation, result); if (!valid(operation)) return;
          // Cancel also releases a completed job's transient audio from the local service.
          cancelJob(operation.jobId, operation.requestId); operation.jobId = operation.requestId = null;
        }
        if (valid(operation)) { active = null; emit(); notify('朗读完成'); }
      } catch (error) {
        if (valid(operation)) { stop(); notify(error.message || '朗读失败，请重试', 'error'); }
      }
    }
    return { start, stop, updateTask, state, destroy() { stop(); disposed = true; currentTask = null; } };
  }
  const api = { create, splitText, MAX_TEXT, SEGMENT_LENGTH };
  root.AssistantVoice = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
