(function () {
  'use strict';
  const KEY = 'localAIConnectionV1';
  const BASE = 'http://127.0.0.1:19841';
  const actions = new Set(['local_ai_status', 'local_ai_configure', 'local_ai_preferences', 'smart_alarm_interpret', 'smart_alarm_result']);
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!actions.has(message.action)) return;
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
      respond({ ok: false, error: '仅扩展页面可调用本地 AI' }); return;
    }
    (async () => {
      const config = (await chrome.storage.local.get(KEY))[KEY] || {};
      if (message.action === 'local_ai_preferences') return { ok: true, configured: Boolean(config.token), reasoning: config.reasoning || 'off' };
      if (message.action === 'local_ai_configure') {
        const token = String(message.token || '').trim() || config.token || '';
        if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('请粘贴本地服务生成的 64 位连接令牌');
        const reasoning = message.reasoning ?? config.reasoning ?? 'off';
        if (!['off', 'low', 'medium', 'high', 'xhigh', 'on'].includes(reasoning)) throw new Error('推理等级无效');
        await chrome.storage.local.set({ [KEY]: { token, reasoning } });
        return { ok: true };
      }
      const now = Number(message.now);
      if (message.action === 'smart_alarm_interpret') {
        if (typeof message.text !== 'string' || message.text.length > 500 || !Number.isFinite(now)) throw new Error('提醒输入无效');
        const local = AlarmIntent.parseLocal(message.text);
        if (local && (!message.turns?.length || local.intent === 'rename')) return { ok: true, ...AlarmIntent.resolve(local, { now, timeZone: message.timeZone }), source: 'rules' };
      }
      if (!config.token) throw new Error('简单时间可直接创建；复杂口语请先展开“本地 AI”，填写连接令牌');
      const isStatus = message.action === 'local_ai_status';
      const isPoll = message.action === 'smart_alarm_result';
      if (isPoll && !/^[a-f0-9]{32}$/.test(message.jobId)) throw new Error('解析任务无效');
      let response;
      try {
        response = await fetch(BASE + (isStatus ? '/health' : isPoll ? `/v1/alarms/jobs/${message.jobId}` : '/v1/alarms/interpret'), {
          method: isStatus || isPoll ? 'GET' : 'POST', redirect: 'error',
          signal: AbortSignal.timeout(7000),
          headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
          ...(isStatus || isPoll ? {} : { body: JSON.stringify({ text: message.text, now, timeZone: message.timeZone, turns: message.turns || [], reasoning: config.reasoning || 'off' }) })
        });
      } catch (error) {
        if (error.name === 'TimeoutError') throw new Error('本地模型准备或响应超时，尚未创建闹钟；可重试或手动设置');
        throw new Error('本地 AI 服务未连接，请先运行 local-ai 的启动命令；简单时间仍可直接创建');
      }
      const data = await response.json();
      if (!response.ok || data.ok === false) throw new Error(data.error || '本地 AI 请求失败');
      return isStatus ? { ...data, selectedReasoning: config.reasoning || 'off' } : data;
    })().then(respond).catch(error => respond({ ok: false, error: error.message }));
    return true;
  });
})();
