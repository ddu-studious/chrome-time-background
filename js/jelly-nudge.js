(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyNudge = api;
})(globalThis, function () {
  'use strict';

  // 水母关怀：喝水 / 起身活动的定时小提示。后台只用 chrome.alarms 与 chrome.notifications（manifest 已有权限），不新增权限、不联网。
  //  · 默认全关；用户在设置页的“水母关怀”里自己打开。每种提示一个周期闹钟（chrome.alarms 的 periodInMinutes），
  //    触发时只在“每天几点到几点”的时段内、并按“只在工作日”过滤才弹通知，其余时间静默跳过（闹钟本身照常走）。
  //  · 通知上有两个按钮：“喝了/动了”只给今天的计数 +1（只保留今天的数字，不留历史），“10 分钟后再提醒”再约一次性的闹钟。
  //  · 呈现可以委托给桌面水母（presenter，见 js/jelly-desktop.js）：水母在 3 秒内确认显示就不再弹系统通知，
  //    水母不在、组件过旧、没确认时退回上面的系统通知；气泡上的按钮经 act() 回到这里，计数与稍后提醒仍由本模块独占。
  //  · 不读取任何活动/空闲状态（没有 idle 权限）：它只是定时提醒，不知道你到底有没有坐着。
  // 设计与限制见 docs/technical/jellyfish-pomodoro-water-music-grow-20261015.md 与 jellyfish-resident-companion-20261016.md。

  const CONFIG_KEY = 'jellyNudgeV1';          // 设置（chrome.storage.sync）
  const STATS_KEY = 'jellyNudgeStatsV1';      // 今天的计数（chrome.storage.local，只保留当天）
  const PREFIX = 'jelly-nudge-';              // 闹钟名与通知 id 的共同前缀
  const SNOOZE_MIN = 10;
  const JELLY_TTL_SEC = 90;                   // 水母气泡无人理睬时自行收起的秒数（原生不计时不计数，只负责收起）
  const PRESENT_TIMEOUT_MS = 4000;            // 兜底：presenter 迟迟不返回也要退回通知，不能堵住串行队列
  const MAX_LINES = 3;                        // 水母上显示的“今天的记录”最多几行
  const MAX_LOOKAHEAD = 400;                  // 找“下一次提醒”最多向后看几个周期（30 分钟一档时约 8 天，够跨周末）

  const KINDS = Object.freeze({
    water: Object.freeze({
      label: '喝水', done: '喝了', defaultEvery: 60, choices: Object.freeze([30, 45, 60, 90, 120]), title: '水母口渴了 💧',
      lines: Object.freeze(['喝口水吧，水母陪你喝一杯', '该补水啦，慢慢喝几口', '放下手里的事，喝点水再继续']),
    }),
    stretch: Object.freeze({
      label: '起身活动', done: '动了', defaultEvery: 50, choices: Object.freeze([30, 45, 50, 60, 90]), title: '水母想游一圈 🌊',
      lines: Object.freeze(['坐久了，起来活动一下脖子和肩膀', '站起来走两步，看看远处', '伸个懒腰，让身体也漂一漂']),
    }),
  });
  const KIND_IDS = Object.freeze(Object.keys(KINDS));

  const DEFAULTS = Object.freeze({ water: Object.freeze({ on: false, everyMin: 60 }), stretch: Object.freeze({ on: false, everyMin: 50 }), from: '09:00', to: '18:00', weekdaysOnly: true });

  const minutesOf = text => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(text));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };

  /** 设置规范化：未知键丢弃；everyMin 只认该类提示的可选档位；时段必须“开始早于结束”，否则回默认；只有明确的 true 才开启。 */
  function normalize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const config = { weekdaysOnly: source.weekdaysOnly !== false };
    for (const id of KIND_IDS) {
      const part = source[id] && typeof source[id] === 'object' ? source[id] : {};
      config[id] = { on: part.on === true, everyMin: KINDS[id].choices.includes(part.everyMin) ? part.everyMin : DEFAULTS[id].everyMin };
    }
    const from = minutesOf(source.from), to = minutesOf(source.to);
    const valid = from !== null && to !== null && from < to;
    config.from = valid ? source.from : DEFAULTS.from;
    config.to = valid ? source.to : DEFAULTS.to;
    return config;
  }

  /** date（本地时间）是否在设置的时段内：from ≤ 时刻 < to；只在工作日时周末不提醒。 */
  function inWindow(config, date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (config.weekdaysOnly && (date.getDay() === 0 || date.getDay() === 6)) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    return now >= minutesOf(config.from) && now < minutesOf(config.to);
  }

  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  /** 通知文案：按“第几个周期”轮换，同一个周期内稳定；water 带上今天已喝几次。 */
  function messageFor(kind, date, everyMin, count) {
    const lines = KINDS[kind].lines;
    const slot = Math.floor(date.getTime() / (Math.max(1, everyMin) * 60000));
    const line = lines[((slot % lines.length) + lines.length) % lines.length];
    return count > 0 ? `${line}（今天已${KINDS[kind].done} ${count} 次）` : line;
  }

  const alarmName = (kind, snooze = false) => `${PREFIX}${snooze ? 'snooze-' : ''}${kind}`;

  /** 闹钟名 → { kind, snooze }；不是本模块的闹钟返回 null。 */
  function parseAlarm(name) {
    const match = /^jelly-nudge-(snooze-)?(water|stretch)$/.exec(String(name));
    return match ? { kind: match[2], snooze: !!match[1] } : null;
  }

  /** 通知 id → kind；id 形如 jelly-nudge-<kind>-<毫秒时间戳>。 */
  function parseNotification(id) {
    const match = /^jelly-nudge-(water|stretch)-\d+$/.exec(String(id));
    return match ? match[1] : null;
  }

  const hhmm = ms => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const nextMidnight = date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const isTime = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

  /**
   * 下一次会提醒的是哪一类、几点。scheduled = { water, stretch, snooze:{ water, stretch } }，值是 chrome.alarms 的 scheduledTime（毫秒）。
   * 周期闹钟已过期（浏览器休眠错过）时按周期向后对齐；落在时段外或周末（只在工作日）时继续往后找，最多 MAX_LOOKAHEAD 个周期。
   * 稍后提醒是一次性的：只在它还没过期且落在时段内时才算。关着的类别一律不算。没有可用的返回 null。
   */
  function nextDue(config, scheduled, nowMs) {
    const source = scheduled && typeof scheduled === 'object' ? scheduled : {};
    const snooze = source.snooze && typeof source.snooze === 'object' ? source.snooze : {};
    let best = null;
    const offer = (kind, at) => { if (!best || at < best.at) best = { kind, at }; };
    for (const id of KIND_IDS) {
      if (!config[id].on) continue;
      const later = snooze[id];
      if (isTime(later) && later >= nowMs && inWindow(config, new Date(later))) offer(id, later);
      const first = source[id];
      if (!isTime(first)) continue;
      const every = config[id].everyMin * 60000;
      let at = first < nowMs ? first + Math.ceil((nowMs - first) / every) * every : first;
      for (let i = 0; i < MAX_LOOKAHEAD; i++, at += every) {
        if (inWindow(config, new Date(at))) { offer(id, at); break; }
      }
    }
    return best;
  }

  /**
   * 水母上显示的“今天的记录”：只列开着的类别（或关掉了但今天已有计数的），计数为 0 写“还没…”，最后一行是下一次提醒。
   * validUntil：这些文字有效到下一次提醒或本地午夜，取早者；过期后原生不再显示，避免挂着过时的数字。
   */
  function describe(config, stats, date, scheduled) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return { lines: [], validUntil: 0 };
    const count = id => (Number.isInteger(stats?.[id]) && stats[id] > 0 ? Math.min(999, stats[id]) : 0);
    const lines = [];
    if (config.water.on || count('water') > 0) lines.push(count('water') > 0 ? `今天喝了 ${count('water')} 次水` : '今天还没喝水');
    if (config.stretch.on || count('stretch') > 0) lines.push(count('stretch') > 0 ? `今天起身 ${count('stretch')} 次` : '今天还没起身');
    const due = nextDue(config, scheduled, date.getTime());
    if (due) lines.push(`下次${KINDS[due.kind].label}提醒 ${hhmm(due.at)}`);
    return { lines: lines.slice(0, MAX_LINES), validUntil: Math.min(nextMidnight(date), due ? due.at : Infinity) };
  }

  function create({ syncStorage, localStorage, alarms, notifications, getURL = path => path, now = () => new Date(), presenter = null, presentTimeoutMs = PRESENT_TIMEOUT_MS, onChange = null, onSent = null }) {
    let queue = Promise.resolve();
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    // 数据（设置、计数、稍后提醒）变化后通知外部（例如让水母刷新“今天的记录”）；外部失败不影响这里的结果，也不等待它。
    const changed = () => { try { Promise.resolve(onChange?.()).catch(() => {}); } catch (_) { /* 外部回调失败不影响业务 */ } };
    // 一条提醒真的发出去之后（水母气泡或系统通知）通知外部，参数是发出时刻（毫秒）；水母差事据此让出最小间隔，免得两边同时开口。
    const sent = at => { try { Promise.resolve(onSent?.(at)).catch(() => {}); } catch (_) { /* 外部回调失败不影响业务 */ } };
    const bounded = (promise, ms) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('presenter timeout')), ms);
      promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
    const readAlarm = async name => { try { return alarms.get ? await alarms.get(name) : undefined; } catch (_) { return undefined; } };

    const readConfig = async () => normalize((await syncStorage.get(CONFIG_KEY))[CONFIG_KEY]);
    async function readStats(date) {
      const stored = (await localStorage.get(STATS_KEY))[STATS_KEY];
      const day = dayKey(date);
      const valid = stored && typeof stored === 'object' && stored.day === day;
      const count = id => (valid && Number.isInteger(stored[id]) && stored[id] > 0 && stored[id] < 1000 ? stored[id] : 0);
      return { day, water: count('water'), stretch: count('stretch') };
    }

    /** 让闹钟与设置一致：开着的类别按周期建（已有同周期的不重建，避免每次唤醒都把计时重置），关着的类别连同 10 分钟后再提醒一起清掉。 */
    async function applyAlarms(config) {
      for (const id of KIND_IDS) {
        const name = alarmName(id);
        if (!config[id].on) {
          await alarms.clear(name);
          await alarms.clear(alarmName(id, true));
          continue;
        }
        const existing = alarms.get ? await alarms.get(name) : null;
        if (existing && existing.periodInMinutes === config[id].everyMin) continue;
        await alarms.create(name, { delayInMinutes: config[id].everyMin, periodInMinutes: config[id].everyMin });
      }
    }

    async function notify(kind, config, date) {
      const stats = await readStats(date);
      const id = `${PREFIX}${kind}-${date.getTime()}`;
      const message = messageFor(kind, date, config[kind].everyMin, stats[kind]);
      if (presenter) {
        // 先请桌面水母接手：只有在限定时间内收到严格的 shown === true 才算，其余（未显示、抛错、超时、返回值不对）都退回系统通知
        let accepted = false;
        try {
          const reply = await bounded((async () => presenter.present({
            id, kind, title: KINDS[kind].title, text: message,
            buttons: [{ id: 'done', title: KINDS[kind].done }, { id: 'snooze', title: `${SNOOZE_MIN} 分钟后` }],
            ttl: JELLY_TTL_SEC,
          }))(), presentTimeoutMs);
          accepted = !!reply && reply.shown === true;
        } catch (_) { accepted = false; }
        if (accepted) { sent(now().getTime()); return { sent: true, id, via: 'jelly' }; }
        // 没确认显示：让可能迟到的气泡撤掉，避免它和下面的系统通知同时出现
        try { await presenter.cancel?.(id); } catch (_) { /* 撤销失败不影响退回通知 */ }
      }
      if (notifications.getPermissionLevel) {
        const level = await notifications.getPermissionLevel();
        if (level !== 'granted') return { sent: false, reason: 'permission' };
      }
      // 同类的旧通知先清掉：错过了没处理的提示不堆叠
      if (notifications.getAll) {
        const all = await notifications.getAll();
        for (const oldId of Object.keys(all || {})) if (parseNotification(oldId) === kind) await notifications.clear(oldId);
      }
      await notifications.create(id, {
        type: 'basic', iconUrl: getURL('icons/icon128.png'), title: KINDS[kind].title,
        message, priority: 0,
        buttons: [{ title: KINDS[kind].done }, { title: `${SNOOZE_MIN} 分钟后再提醒` }],
      });
      sent(now().getTime());
      return { sent: true, id };
    }

    /** 通知按钮与水母气泡共用的动作：done = 今天的计数 +1；snooze = 再约一次性的闹钟（该类已关则不约）；none 什么都不改。 */
    async function applyAction(kind, action) {
      if (action === 'done') {
        const stats = await readStats(now());
        stats[kind] = Math.min(999, stats[kind] + 1);
        await localStorage.set({ [STATS_KEY]: stats });
        return { changed: true, count: stats[kind] };
      }
      if (action === 'snooze') {
        const config = await readConfig();
        if (config[kind].on) {
          await alarms.create(alarmName(kind, true), { delayInMinutes: SNOOZE_MIN });
          return { changed: true };
        }
      }
      return { changed: false };
    }

    return {
      /** 设置与今天的计数。 */
      get: () => serial(async () => ({ ok: true, config: await readConfig(), stats: await readStats(now()) })),
      /** 保存设置（规范化后）并让闹钟与之一致；闹钟创建失败时抛出，设置已保存，下次启动会再对一遍。 */
      set: raw => serial(async () => {
        const config = normalize(raw);
        await syncStorage.set({ [CONFIG_KEY]: config });
        await applyAlarms(config);
        changed();
        return { ok: true, config, stats: await readStats(now()) };
      }),
      /** 启动时调用：浏览器重启后闹钟可能没了，按设置补上。 */
      restore: () => serial(async () => applyAlarms(await readConfig())),
      /** 闹钟触发。不是本模块的闹钟返回 undefined；在时段外、该类已关、没有通知权限都是静默跳过。 */
      fire: name => {
        const parsed = parseAlarm(name);
        if (!parsed) return Promise.resolve(undefined);
        return serial(async () => {
          const config = await readConfig();
          const date = now();
          if (!config[parsed.kind].on) return { sent: false, reason: 'off' };
          if (!inWindow(config, date)) return { sent: false, reason: 'window' };
          return notify(parsed.kind, config, date);
        });
      },
      /** 通知按钮：0 = 做了（今天的计数 +1），1 = 稍后再提醒。不是本模块的通知返回 false。 */
      button: (id, index) => {
        const kind = parseNotification(id);
        if (!kind) return Promise.resolve(false);
        return serial(async () => {
          const result = await applyAction(kind, index === 0 ? 'done' : index === 1 ? 'snooze' : 'none');
          await notifications.clear(id);
          if (result.changed) changed();
          return true;
        });
      },
      /**
       * 水母气泡上的按钮（经原生 → AlarmDesktop → 这里）：done / snooze，与通知按钮同一套动作。
       * 返回 { ok, text|error }，text 由这里决定，原生只负责显示；不是本模块的 id 或未知动作 ok:false 且不改任何数据。
       */
      act: (id, action) => {
        const kind = parseNotification(id);
        if (!kind || (action !== 'done' && action !== 'snooze')) return Promise.resolve({ ok: false, error: '这条提醒已失效' });
        return serial(async () => {
          const result = await applyAction(kind, action);
          // 同 id 的系统通知（先弹了通知、气泡才晚到的极端情况）一并关掉
          try { await notifications.clear(id); } catch (_) { /* 清除失败不影响动作结果 */ }
          if (result.changed) changed();
          const text = action === 'done' ? `记下啦，今天第 ${result.count} 次` : result.changed ? `好，${SNOOZE_MIN} 分钟后再来` : '好的';
          return { ok: true, text };
        });
      },
      /** 水母上显示的“今天的记录”与下一次提醒：只读，不写存储、不动闹钟。 */
      summary: () => serial(async () => {
        const date = now();
        const config = await readConfig();
        const stats = await readStats(date);
        const scheduled = { snooze: {} };
        for (const id of KIND_IDS) {
          const periodic = await readAlarm(alarmName(id));
          if (periodic && typeof periodic.scheduledTime === 'number') scheduled[id] = periodic.scheduledTime;
          const later = await readAlarm(alarmName(id, true));
          if (later && typeof later.scheduledTime === 'number') scheduled.snooze[id] = later.scheduledTime;
        }
        return describe(config, stats, date, scheduled);
      }),
      /** 点通知本身：只关掉它。不是本模块的通知返回 false。 */
      dismiss: id => {
        if (!parseNotification(id)) return Promise.resolve(false);
        return Promise.resolve(notifications.clear(id)).then(() => true);
      },
    };
  }

  return { create, normalize, inWindow, messageFor, nextDue, describe, parseAlarm, parseNotification, alarmName, KINDS, DEFAULTS, CONFIG_KEY, STATS_KEY, PREFIX, SNOOZE_MIN, JELLY_TTL_SEC };
});
