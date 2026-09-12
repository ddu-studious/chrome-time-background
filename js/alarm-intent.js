(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const ask = question => ({ status: 'needs_clarification', question });
  function parts(ms, zone) {
    return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(ms).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  }
  function dateKey(p) { return `${p.year}-${pad(p.month)}-${pad(p.day)}`; }
  function shiftDate(key, offset) {
    const d = new Date(`${key}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  }
  function wallTime(key, hour, minute, zone) {
    const target = Date.parse(`${key}T${pad(hour)}:${pad(minute)}:00Z`);
    if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== key) throw new Error('日期无效');
    let candidate = target;
    for (let i = 0; i < 4; i++) {
      const p = parts(candidate, zone);
      candidate += target - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    }
    const matches = ms => {
      const p = parts(ms, zone);
      return dateKey(p) === key && p.hour === hour && p.minute === minute;
    };
    if (!matches(candidate)) throw new Error('该时间在当前时区不存在，请换一个时间');
    if ([-120, -90, -60, -30, 30, 60, 90, 120].some(m => matches(candidate + m * 60000))) {
      throw new Error('该时间遇到夏令时回拨，存在两个时刻，请手动设置');
    }
    return candidate;
  }
  function number(text) {
    if (/^\d+$/.test(text)) return Number(text);
    const digits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (text === '十') return 10;
    if (text.includes('十')) {
      const [a, b] = text.split('十');
      return (a ? digits[a] : 1) * 10 + (b ? digits[b] : 0);
    }
    return digits[text];
  }
  const numeral = '[0-9零一二两三四五六七八九十]+';
  // Only exact, single-schedule phrases take the offline fast path.
  function parseLocal(text) {
    text = String(text).trim().replace(/[。！!]+$/, '');
    const rename = /^(?:把\s*)?(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*的?闹钟(?:名称|名字)?\s*(?:修改为|改为|改成|改名为|重命名为)\s*[:：]?\s*(.+)$/.exec(text);
    if (rename) return { intent: 'rename', selector: { date: rename[1], time: rename[2].padStart(5, '0') }, label: rename[3].trim() };
    // Do not misinterpret an unsupported edit/cancel instruction as creation.
    if (/(?:闹钟.*(?:修改|改名|改为|改成|重命名|取消|删除)|(?:修改|取消|删除|重命名).*闹钟)/.test(text)) return ask('改名可以这样说：2026-09-12 16:26 的闹钟名称修改为：你好，闹钟。修改时间或取消请使用列表中的编辑或删除按钮。');
    let m = new RegExp(`^(${numeral}|半)\\s*(分钟|小时|个小时)后(?:提醒我|叫我|叫醒我)([^，,；;]+)$`).exec(text);
    if (m && !/提前|然后|再提醒|每隔|取消|改成|[0-9一二三四五六七八九十]点/.test(m[3])) {
      return { kind: 'relative', label: m[3], delayMinutes: (m[1] === '半' ? .5 : number(m[1])) * (m[2] === '分钟' ? 1 : 60) };
    }
    m = new RegExp(`^(今天|明天|后天|每天|每个工作日|工作日)(早上|上午|中午|下午|晚上|凌晨)?\\s*(${numeral})(?:[:：]([0-9]{2})|点(?:(半)|(${numeral})分?)?)(?:提醒我|叫我|叫醒我)([^，,；;]+)$`).exec(text);
    if (!m || /提前|然后|再提醒|每隔|取消|改成|节假日|调休|[0-9一二三四五六七八九十]点/.test(m[7])) return null;
    let hour = number(m[3]);
    if (hour === 12 && ['早上', '上午', '晚上'].includes(m[2])) return ask('你指的是中午 12:00 还是午夜 00:00？午夜请同时说明日期。');
    if (!m[2] && !m[4] && hour >= 1 && hour <= 12) return ask(`你说的是早上还是晚上 ${hour} 点？请补充“早上 ${hour} 点”或“晚上 ${hour} 点”。`);
    if (m[2] && hour > 12) return null;
    if (['下午', '晚上'].includes(m[2]) && hour < 12) hour += 12;
    if (m[2] === '中午' && hour < 11) hour += 12;
    if (['凌晨', '早上', '上午'].includes(m[2]) && hour === 12) hour = 0;
    return {
      kind: m[1] === '每天' ? 'daily' : m[1].includes('工作日') ? 'weekly' : 'once',
      label: m[7], hour, minute: m[4] ? Number(m[4]) : m[5] ? 30 : m[6] ? number(m[6]) : 0,
      dayOffset: ({ 今天: 0, 明天: 1, 后天: 2 })[m[1]] ?? null,
      days: m[1].includes('工作日') ? [1, 2, 3, 4, 5] : []
    };
  }
  function resolve(raw, { now, timeZone }) {
    if (!Number.isFinite(now)) throw new Error('缺少提交时间');
    const today = dateKey(parts(now, timeZone));
    if (raw?.intent === 'rename') {
      const selector = raw.selector;
      if (!selector || !/^\d{4}-\d{2}-\d{2}$/.test(selector.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(selector.time)) throw new Error('请提供有效的闹钟日期和时间');
      wallTime(selector.date, Number(selector.time.slice(0, 2)), Number(selector.time.slice(3)), timeZone);
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label || label.length > 80) throw new Error('新名称应为 1 至 80 字');
      return { status: 'ready', intent: 'rename', selector: { date: selector.date, time: selector.time }, label, timeZone };
    }
    if (raw?.status === 'needs_clarification') return ask(String(raw.question || '请补充具体日期和时间。').slice(0, 200));
    if (!raw || !['relative', 'once', 'daily', 'weekly'].includes(raw.kind)) return ask('目前支持创建一个闹钟，请说明提醒事项、日期和时间；修改已有闹钟请使用编辑按钮。');
    const label = typeof raw.label === 'string' ? raw.label.trim() : '';
    if (!label || label.length > 80) return ask('请用 80 字以内说明提醒事项。');
    const advance = raw.advanceMinutes ?? 0;
    if (!Number.isInteger(advance) || advance < 0 || advance > 10080) throw new Error('提前提醒分钟数无效');
    let fireAt, time, date, days = [];
    if (raw.kind === 'relative') {
      if (typeof raw.delayMinutes !== 'number' || raw.delayMinutes < 1 || raw.delayMinutes > 525600 || advance) throw new Error('倒计时应为 1 分钟至 1 年，且不能再叠加提前提醒');
      fireAt = now + raw.delayMinutes * 60000;
      const p = parts(fireAt, timeZone);
      date = dateKey(p); time = `${pad(p.hour)}:${pad(p.minute)}`;
    } else {
      if (raw.hour == null || raw.minute == null) return ask('具体几点提醒你？请注明上午或下午。');
      if (!Number.isInteger(raw.hour) || raw.hour < 0 || raw.hour > 23 || !Number.isInteger(raw.minute) || raw.minute < 0 || raw.minute > 59) throw new Error('时间无效，请使用 00:00 至 23:59');
      if (raw.kind === 'once') {
        const selectors = [raw.dayOffset != null, raw.date != null, raw.weekday != null].filter(Boolean).length;
        if (!selectors) return ask('在哪一天提醒你？');
        if (selectors !== 1) throw new Error('日期有冲突，请重新说明');
        if (raw.dayOffset != null) {
          if (!Number.isInteger(raw.dayOffset) || raw.dayOffset < 0 || raw.dayOffset > 366) throw new Error('日期偏移无效');
          date = shiftDate(today, raw.dayOffset);
        } else if (raw.date != null) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error('日期格式无效');
          date = raw.date;
        } else {
          if (!Number.isInteger(raw.weekday) || raw.weekday < 0 || raw.weekday > 6 || !Number.isInteger(raw.weekOffset) || raw.weekOffset < 0 || raw.weekOffset > 52) throw new Error('星期无效');
          const currentDay = new Date(`${today}T12:00:00Z`).getUTCDay();
          date = shiftDate(today, (raw.weekday + 6) % 7 - (currentDay + 6) % 7 + raw.weekOffset * 7);
        }
        fireAt = wallTime(date, raw.hour, raw.minute, timeZone) - advance * 60000;
        if (fireAt <= now) return ask('这个提醒时间已经过了。请说明新的日期和时间，我不会自动顺延。');
        const p = parts(fireAt, timeZone); date = dateKey(p); time = `${pad(p.hour)}:${pad(p.minute)}`;
      } else {
        if (raw.dayOffset != null || raw.date != null || raw.weekday != null) return ask('第一版的重复闹钟从下一次符合条件的时间开始；指定开始日期请先手动创建一次性提醒。');
        if (raw.kind === 'weekly') {
          if (!Array.isArray(raw.days) || !raw.days.length || raw.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error('请选择有效的重复星期');
          days = [...new Set(raw.days)].sort();
        }
        const total = raw.hour * 60 + raw.minute - advance;
        const dayShift = Math.floor(total / 1440);
        const minuteOfDay = ((total % 1440) + 1440) % 1440;
        time = `${pad(Math.floor(minuteOfDay / 60))}:${pad(minuteOfDay % 60)}`;
        days = [...new Set(days.map(d => ((d + dayShift) % 7 + 7) % 7))].sort();
        date = null; fireAt = null;
      }
    }
    const alarm = { label, time, date, fireAt, repeat: ['relative', 'once'].includes(raw.kind) ? 'once' : raw.kind === 'daily' ? 'daily' : 'custom', days, enabled: true, intensity: raw.important === true ? 'important' : 'standard' };
    const when = alarm.repeat === 'once' ? date : alarm.repeat === 'daily' ? '每天' : days.map(d => `周${'日一二三四五六'[d]}`).join('、');
    return { status: 'ready', alarm, timeZone, displayText: `${when} ${time} · ${label}${advance ? `（提前 ${advance} 分钟）` : ''}` };
  }
  const api = { parseLocal, resolve, parts, wallTime, shiftDate, dateKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AlarmIntent = api;
})(typeof self !== 'undefined' ? self : globalThis);
