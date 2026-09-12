const previewAlarms = [];
window.chrome = { runtime: {
  onMessage: { addListener() {} },
  sendMessage(message, callback) {
    let result = { ok: true };
    if (message.action === 'user_alarm_list') result = { ok: true, alarms: previewAlarms, runtime: {}, notificationPermission: 'unknown', nextFireAt: previewAlarms.filter(a => a.enabled).map(a => AlarmCore.getNextOccurrence(a)).filter(Boolean).sort((a, b) => a - b)[0] || null };
    if (message.action === 'smart_alarm_interpret') {
      const raw = AlarmIntent.parseLocal(message.text) || { status: 'needs_clarification', question: '具体几点提醒你？（此预览不调用真实模型）' };
      result = { ok: true, ...AlarmIntent.resolve(raw, message) };
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
