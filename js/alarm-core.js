(function (root) {
  'use strict';

  const STORAGE_KEY = 'userAlarmsV1';
  const RUNTIME_KEY = 'userAlarmRuntimeV1';
  const DISPATCH_NAME = 'user-alarm-dispatch';
  const MISSED_GRACE_MS = 15 * 60 * 1000;
  const WEEKDAY_SET = new Set([1, 2, 3, 4, 5]);

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseTime(time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || ''));
    if (!match) return { hour: 9, minute: 0 };
    return {
      hour: Math.max(0, Math.min(23, Number(match[1]))),
      minute: Math.max(0, Math.min(59, Number(match[2]))),
    };
  }

  function makeLocalDate(dateKey, time) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (!dateMatch) return null;
    const { hour, minute } = parseTime(time);
    const date = new Date(
      Number(dateMatch[1]),
      Number(dateMatch[2]) - 1,
      Number(dateMatch[3]),
      hour,
      minute,
      0,
      0
    );
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function normalizeDays(days) {
    return [...new Set((Array.isArray(days) ? days : [])
      .map(Number)
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
      .sort((a, b) => a - b);
  }

  function normalizeAlarm(raw, now = Date.now()) {
    const repeat = ['once', 'daily', 'weekdays', 'custom'].includes(raw?.repeat)
      ? raw.repeat
      : 'once';
    const volume = Number(raw?.volume);
    const fadeSeconds = Number(raw?.fadeSeconds);
    const snoozeMinutes = Number(raw?.snoozeMinutes);
    const snoozeLimit = Number(raw?.snoozeLimit);
    const createdAt = Number(raw?.createdAt) || now;
    const time = `${pad(parseTime(raw?.time).hour)}:${pad(parseTime(raw?.time).minute)}`;
    let fireAt = Number(raw?.fireAt) || null;
    let date = raw?.date || null;

    if (repeat === 'once' && !fireAt && date) {
      fireAt = makeLocalDate(date, time)?.getTime() || null;
    }
    if (repeat === 'once' && fireAt && !date) {
      date = localDateKey(new Date(fireAt));
    }

    return {
      id: String(raw?.id || `alarm_${now}_${Math.random().toString(36).slice(2, 8)}`),
      label: String(raw?.label || '时间到了').trim().slice(0, 80) || '时间到了',
      time,
      date,
      fireAt,
      repeat,
      days: normalizeDays(raw?.days),
      enabled: raw?.enabled !== false,
      soundId: ['chime', 'rise', 'urgent', 'water'].includes(raw?.soundId) ? raw.soundId : 'chime',
      volume: Number.isFinite(volume) ? Math.max(0.05, Math.min(1, volume)) : 0.8,
      fadeSeconds: Number.isFinite(fadeSeconds) ? Math.max(0, Math.min(60, fadeSeconds)) : 12,
      snoozeMinutes: Number.isFinite(snoozeMinutes) ? Math.max(1, Math.min(60, Math.round(snoozeMinutes))) : 10,
      snoozeLimit: Number.isFinite(snoozeLimit) ? Math.max(0, Math.min(10, Math.round(snoozeLimit))) : 3,
      intensity: raw?.intensity === 'important' ? 'important' : 'standard',
      openWindow: raw?.openWindow === true,
      createdAt,
      updatedAt: Number(raw?.updatedAt) || now,
      revision: Math.max(1, Number(raw?.revision) || 1),
    };
  }

  function isRepeatDay(alarm, day) {
    if (alarm.repeat === 'daily') return true;
    if (alarm.repeat === 'weekdays') return WEEKDAY_SET.has(day);
    if (alarm.repeat === 'custom') return normalizeDays(alarm.days).includes(day);
    return false;
  }

  function getNextOccurrence(rawAlarm, afterMs = Date.now()) {
    const alarm = normalizeAlarm(rawAlarm, afterMs);
    if (!alarm.enabled) return null;
    if (alarm.repeat === 'once') {
      return alarm.fireAt && alarm.fireAt > afterMs ? alarm.fireAt : null;
    }

    const after = new Date(afterMs);
    const { hour, minute } = parseTime(alarm.time);
    for (let offset = 0; offset <= 370; offset += 1) {
      const candidate = new Date(
        after.getFullYear(),
        after.getMonth(),
        after.getDate() + offset,
        hour,
        minute,
        0,
        0
      );
      if (candidate.getTime() > afterMs && isRepeatDay(alarm, candidate.getDay())) {
        return candidate.getTime();
      }
    }
    return null;
  }

  function getPreviousOccurrence(rawAlarm, beforeMs = Date.now()) {
    const alarm = normalizeAlarm(rawAlarm, beforeMs);
    if (!alarm.enabled) return null;
    if (alarm.repeat === 'once') {
      return alarm.fireAt && alarm.fireAt <= beforeMs ? alarm.fireAt : null;
    }

    const before = new Date(beforeMs);
    const { hour, minute } = parseTime(alarm.time);
    for (let offset = 0; offset <= 370; offset += 1) {
      const candidate = new Date(
        before.getFullYear(),
        before.getMonth(),
        before.getDate() - offset,
        hour,
        minute,
        0,
        0
      );
      if (candidate.getTime() <= beforeMs && isRepeatDay(alarm, candidate.getDay())) {
        return candidate.getTime();
      }
    }
    return null;
  }

  function occurrenceId(alarmId, scheduledAt, suffix = '') {
    return `${alarmId}:${Math.round(Number(scheduledAt) || 0)}${suffix ? `:${suffix}` : ''}`;
  }

  function nextCandidate(alarm, afterMs) {
    const scheduledAt = getNextOccurrence(alarm, afterMs);
    if (!scheduledAt) return null;
    return {
      kind: 'base',
      alarmId: alarm.id,
      scheduledAt,
      occurrenceId: occurrenceId(alarm.id, scheduledAt),
      snoozeCount: 0,
    };
  }

  function nextDispatch(alarms, runtime, afterMs = Date.now()) {
    const handled = runtime?.handled || {};
    const candidates = [];
    for (const rawAlarm of Array.isArray(alarms) ? alarms : []) {
      const alarm = normalizeAlarm(rawAlarm, afterMs);
      if (!alarm.enabled) continue;
      let candidate = null;
      if (alarm.repeat !== 'once') {
        const previous = getPreviousOccurrence(alarm, afterMs);
        const previousId = previous ? occurrenceId(alarm.id, previous) : null;
        if (previous && afterMs - previous <= MISSED_GRACE_MS && !handled[previousId]) {
          candidate = {
            kind: 'base',
            alarmId: alarm.id,
            scheduledAt: previous,
            occurrenceId: previousId,
            snoozeCount: 0,
          };
        }
      }
      candidate ||= nextCandidate(alarm, afterMs);
      if (!candidate && alarm.repeat === 'once' && alarm.fireAt && !handled[occurrenceId(alarm.id, alarm.fireAt)]) {
        candidate = {
          kind: 'base',
          alarmId: alarm.id,
          scheduledAt: alarm.fireAt,
          occurrenceId: occurrenceId(alarm.id, alarm.fireAt),
          snoozeCount: 0,
        };
      }
      if (candidate && !handled[candidate.occurrenceId]) candidates.push(candidate);
    }

    for (const snooze of Array.isArray(runtime?.pendingSnoozes) ? runtime.pendingSnoozes : []) {
      if (!handled[snooze.occurrenceId]) candidates.push({ ...snooze, kind: 'snooze' });
    }
    if (!candidates.length) return null;

    candidates.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const fireAt = candidates[0].scheduledAt;
    return {
      fireAt,
      refs: candidates.filter(candidate => Math.abs(candidate.scheduledAt - fireAt) < 1000),
    };
  }

  function formatNext(ms, now = Date.now()) {
    if (!ms) return '暂无已开启闹钟';
    const date = new Date(ms);
    const today = localDateKey(new Date(now));
    const tomorrowDate = new Date(now);
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const dateKey = localDateKey(date);
    const prefix = dateKey === today ? '今天' : dateKey === localDateKey(tomorrowDate) ? '明天' : `${date.getMonth() + 1}月${date.getDate()}日`;
    return `${prefix} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  root.AlarmCore = Object.freeze({
    STORAGE_KEY,
    RUNTIME_KEY,
    DISPATCH_NAME,
    MISSED_GRACE_MS,
    localDateKey,
    makeLocalDate,
    normalizeAlarm,
    getNextOccurrence,
    getPreviousOccurrence,
    occurrenceId,
    nextDispatch,
    formatNext,
  });
})(typeof self !== 'undefined' ? self : globalThis);
