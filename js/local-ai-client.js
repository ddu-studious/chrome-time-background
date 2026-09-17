(function () {
  'use strict';
  const KEY = 'localAIConnectionV1';
  const BASE = 'http://127.0.0.1:19841';
  const actions = new Set(['local_ai_status', 'local_ai_configure', 'local_ai_preferences', 'smart_alarm_interpret', 'smart_alarm_result', 'ai_control_get', 'ai_control_save', 'ai_control_rollback', 'ai_job_cancel', 'music_ai_interpret', 'music_ai_result', 'speech_ai_transcribe', 'speech_ai_result', 'ai_scene_submit', 'ai_scene_result']);
  actions.add('ai_history_get'); actions.add('ai_history_write');
  actions.add('ai_memory_get'); actions.add('ai_memory_write');
  function selection(value) {
    if (value == null) return null;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['model', 'reasoning'].includes(key))) throw new Error('AI 选择无效');
    const result = {};
    if (value.model != null) { if (typeof value.model !== 'string' || value.model.includes('://') || !/^[a-zA-Z0-9_./:-]{1,160}$/.test(value.model)) throw new Error('模型标识无效'); result.model = value.model; }
    if (value.reasoning != null) { if (!['off','low','medium','high','xhigh','on'].includes(value.reasoning)) throw new Error('思考强度无效'); result.reasoning = value.reasoning; }
    return Object.keys(result).length ? result : null;
  }
  async function request(message) {
      if (!actions.has(message.action)) throw new Error('未登记的本地 AI 请求');
      const config = (await chrome.storage.local.get(KEY))[KEY] || {};
      if (message.action === 'ai_memory_get' || message.action === 'ai_memory_write') {
        if (!config.token) throw new Error('请先配置本机连接后使用长期记忆');
        const read = message.action === 'ai_memory_get';
        const response = await fetch(BASE + '/v1/memory', { method: read ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(1500), headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, ...(read ? {} : { body: JSON.stringify(message.body) }) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || '记忆服务不可用，请更新本地 AI 服务');
        return data;
      }
      if (message.action === 'ai_history_get' || message.action === 'ai_history_write') {
        if (!config.token) throw new Error('请先配置本机连接后使用历史记录');
        const read = message.action === 'ai_history_get';
        const response = await fetch(BASE + '/v1/history', { method: read ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, ...(read ? {} : { body: JSON.stringify(message.body) }) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || '历史记录不可用，请更新本地 AI 服务');
        return data;
      }
      if (message.action === 'local_ai_preferences') return { ok: true, configured: Boolean(config.token), reasoning: config.reasoning || 'off' };
      if (message.action === 'local_ai_configure') {
        const token = String(message.token || '').trim() || config.token || '';
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('请粘贴本地服务生成的 64 位连接令牌');
        const reasoning = message.reasoning ?? config.reasoning ?? 'off';
        if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw new Error('推理等级无效');
        await chrome.storage.local.set({ [KEY]: { token, reasoning } });
        return { ok: true };
      }
      if (['ai_control_get', 'ai_control_save', 'ai_control_rollback', 'ai_job_cancel'].includes(message.action)) {
        if (!config.token) throw new Error('请先保存本地 AI 连接令牌');
        const cancel = message.action === 'ai_job_cancel';
        if (cancel && !/^[a-f0-9]{32}$/.test(message.jobId)) throw new Error('任务编号无效');
        const read = message.action === 'ai_control_get';
        const path = cancel ? `/v1/ai/jobs/${message.jobId}/cancel` : message.action === 'ai_control_rollback' ? '/v1/control/rollback' : '/v1/control';
        const response = await fetch(BASE + path, {
          method: read ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(read ? {} : { body: JSON.stringify(cancel ? {} : { policy: message.policy, revision: message.revision, expectedRevision: message.expectedRevision }) })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || '控制面请求失败');
        return data;
      }
      if (message.action === 'ai_scene_submit' || message.action === 'ai_scene_result') {
        if (!config.token) throw new Error('请先在 AI 控制台配置本地连接');
        const poll = message.action === 'ai_scene_result';
        if (poll ? !/^[a-f0-9]{32}$/.test(message.jobId) : !['assistant.plan', 'bookmark.summary', 'bookmark.rerank', 'activity.summary', 'bookmark.embed', 'task.draft', 'schedule.draft', 'knowledge.answer', 'music.recommend', 'workspace.match', 'content.digest', 'trending.cluster'].includes(message.scene)) throw new Error('AI 场景或任务无效');
        const selected = poll ? null : selection(message.selection);
        const response = await fetch(BASE + (poll ? `/v1/ai/jobs/${message.jobId}` : '/v1/ai/interpret'), {
          method: poll ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(poll ? {} : { body: JSON.stringify({ scene: message.scene, input: message.input, trace: message.trace, ...(selected ? { selection:selected } : {}) }) })
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw Object.assign(new Error(result.error || 'AI 请求失败'), { execution: result.execution });
        return result;
      }
      if (message.action === 'speech_ai_transcribe' || message.action === 'speech_ai_result') {
        if (!config.token) throw new Error('请先配置本地 AI 连接');
        const poll = message.action === 'speech_ai_result';
        if (poll ? !/^[a-f0-9]{32}$/.test(message.jobId) : typeof message.audio !== 'string' || message.audio.length > 1280064) throw new Error('语音请求无效');
        const response = await fetch(BASE + (poll ? `/v1/ai/jobs/${message.jobId}` : '/v1/speech/transcribe'), {
          method: poll ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(poll ? {} : { body: JSON.stringify({ audio: message.audio }) })
        });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.error || '语音请求失败');
        return data;
      }
      if (message.action === 'music_ai_interpret' || message.action === 'music_ai_result') {
        const poll = message.action === 'music_ai_result';
        if (!poll) {
          const local = MusicIntent.parseLocal(message.text);
          if (local && ((!message.turns?.length && !message.draft) || !['search','recommend','clarify'].includes(local.action))) return { ok: true, status: 'ready', intent: local, source: 'rules' };
        }
        if (!config.token) throw new Error('复杂音乐需求请先在 AI 控制台配置本地连接');
        if (poll && !/^[a-f0-9]{32}$/.test(message.jobId)) throw new Error('任务编号无效');
        const selected = poll ? null : selection(message.selection);
        const response = await fetch(BASE + (poll ? `/v1/ai/jobs/${message.jobId}` : '/v1/ai/interpret'), {
          method: poll ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(poll ? {} : { body: JSON.stringify({ scene: 'music.intent', trace: message.trace, input: { text: message.text, ...(message.turns ? { turns: message.turns } : {}), ...(message.draft ? { draft: message.draft } : {}) }, ...(selected ? { selection:selected } : {}) }) })
        });
        const data = await response.json();
        if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || '音乐解析失败'), { execution: data.execution });
        return data;
      }
      const now = Number(message.now);
      if (message.action === 'smart_alarm_interpret') {
        if (typeof message.text !== 'string' || message.text.length > 500 || !Number.isFinite(now)) throw new Error('提醒输入无效');
        if (message.conversation === true) {
          const draft = AlarmIntent.parseDraft(message.text, message.draft, { now, timeZone: message.timeZone, currentNow: message.currentNow });
          if (draft) return { ok: true, ...AlarmIntent.resolveDraft(draft, { now, timeZone: message.timeZone, currentNow: message.currentNow }), source: 'rules' };
        }
        const local = AlarmIntent.parseLocal(message.text);
        if (local && ((!message.conversation && !message.turns?.length) || local.intent === 'rename')) return { ok: true, ...AlarmIntent.resolve(local, { now, timeZone: message.timeZone }), source: 'rules' };
      }
      if (!config.token) throw new Error('简单时间可直接创建；复杂口语请先展开“本地 AI”，填写连接令牌');
      const isStatus = message.action === 'local_ai_status';
      const isPoll = message.action === 'smart_alarm_result';
      if (isPoll && !/^[a-f0-9]{32}$/.test(message.jobId)) throw new Error('解析任务无效');
      let response; const selected = isStatus || isPoll ? null : selection(message.selection);
      try {
        response = await fetch(BASE + (isStatus ? '/health' : isPoll ? `/v1/alarms/jobs/${message.jobId}` : '/v1/alarms/interpret'), {
          method: isStatus || isPoll ? 'GET' : 'POST', redirect: 'error',
          signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(isStatus || isPoll ? {} : { body: JSON.stringify({ text: message.text, now, timeZone: message.timeZone, turns: message.turns || [], trace: message.trace, ...(message.conversation ? { conversation: true, draft: message.draft, currentNow: message.currentNow } : {}), reasoning: config.reasoning || 'off', ...(selected ? { selection:selected } : {}) }) })
        });
      } catch (error) {
        if (error.name === 'TimeoutError') throw new Error('本地模型准备或响应超时，尚未创建闹钟；可重试或手动设置');
        throw new Error('本地 AI 服务未连接，请先运行 local-ai 的启动命令；简单时间仍可直接创建');
      }
      const data = await response.json();
      if (!response.ok || data.ok === false) throw Object.assign(new Error(data.error || '本地 AI 请求失败'), { execution: data.execution });
      return isStatus ? { ...data, selectedReasoning: data.defaultReasoning || 'off' } : data;
  }
  // Worker-owned tools reuse the authenticated gateway; no token is sent to the input window.
  async function auditedRequest(message) {
    const standalone = ['smart_alarm_interpret', 'music_ai_interpret'].includes(message.action) && !message.trace;
    if (!standalone) return request(message);
    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const scene = message.action === 'smart_alarm_interpret' ? 'alarm.interpret' : 'music.intent';
    const trace = { conversationId: message.sessionId || turnId, turnId, startedAt: Date.now() };
    const result = await request({ ...message, trace });
    if (result.source === 'rules') {
      try {
        for (const [role, content] of [['user', message.text], ['assistant', result.question || result.displayText || JSON.stringify(result.intent || result.draft || {})]]) await request({ action: 'ai_history_write', body: { operation: 'event', event: { id: `${turnId}:${role}`, ...trace, scene, role, content, source: role === 'assistant' ? 'rules' : null, status: result.status } } });
      } catch { result.historyWarning = '本机历史服务不可用，本次离线对话未留存'; }
    }
    return result;
  }
  globalThis.LocalAIBridge = Object.freeze({ request: auditedRequest });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!actions.has(message.action)) return;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
      respond({ ok: false, error: '仅扩展页面可调用本地 AI' }); return;
    }
    auditedRequest(message).then(respond).catch(error => respond({ ok: false, error: error.message }));
    return true;
  });
})();
