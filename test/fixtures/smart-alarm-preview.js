const previewAlarms = [];
const previewJobs = new Map();
const delayedPreview = new URLSearchParams(location.search).has('delayed');
window.chrome = { runtime: {
  onMessage: { addListener() {} },
  sendMessage(message, callback) {
    let result = { ok: true };
    if (message.action === 'user_alarm_list') result = { ok: true, alarms: previewAlarms, runtime: {}, notificationPermission: 'unknown', nextFireAt: previewAlarms.filter(a => a.enabled).map(a => AlarmCore.getNextOccurrence(a)).filter(Boolean).sort((a, b) => a - b)[0] || null };
    if (message.action === 'smart_alarm_interpret') {
      const draft = message.conversation && AlarmIntent.parseDraft(message.text, message.draft, message);
      const raw = AlarmIntent.parseLocal(message.text) || { status: 'needs_clarification', question: '具体几点提醒你？（此预览不调用真实模型）' };
      result = { ok: true, ...(draft ? AlarmIntent.resolveDraft(draft, message) : AlarmIntent.resolve(raw, message)) };
    }
    if (delayedPreview && message.action === 'smart_alarm_interpret') {
      const jobId = 'a'.repeat(32);
      previewJobs.set(jobId, { started: Date.now(), message, cancelled: false });
      result = { ok: true, status: 'pending', jobId };
    }
    if (message.action === 'ai_job_cancel') { const job = previewJobs.get(message.jobId); if (job) job.cancelled = true; }
    if (message.action === 'smart_alarm_result') {
      const job = previewJobs.get(message.jobId);
      result = job?.cancelled ? { ok: false, status: 'cancelled', error: '已取消' } : Date.now() - job.started < 5000 ? { ok: true, status: 'pending', jobId: message.jobId } : { ok: true, ...AlarmIntent.resolve(AlarmIntent.parseLocal(job.message.text), job.message) };
    }
    if (message.action === 'user_alarm_save') {
      const alarm = AlarmCore.normalizeAlarm(message.alarm);
      const existing = previewAlarms.find(a => a.enabled && a.time === alarm.time && a.label === alarm.label && a.date === alarm.date);
      if (existing && message.alarm.smartInput) result = { ok: true, alarm: existing, duplicate: true };
      else {
        const index = previewAlarms.findIndex(a => a.id === alarm.id);
        if (index >= 0) previewAlarms[index] = alarm; else previewAlarms.push(alarm);
        result = { ok: true, alarm };
      }
    }
    if (message.action === 'user_alarm_delete') { const index = previewAlarms.findIndex(a => a.id === message.alarmId); if (index >= 0) previewAlarms.splice(index, 1); }
    if (message.action === 'local_ai_status') result = { ok: false, error: '隔离预览：未连接真实本地服务' };
    setTimeout(() => callback(result), 30);
  }
} };
