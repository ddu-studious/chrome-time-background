(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyErrandsCore = api;
})(globalThis, function () {
  'use strict';

  // 水母差事（纯逻辑）：桌面水母主动开口的“差事簿”。
  //  · 只做判断与文案：规范化设置、是否在活动时段、任务与工作日志的统计、此刻能不能开口（预算/间隔/离开/刚回来）、挑哪一条、
  //    被拒绝几次后当天静默。不碰存储、时钟、随机数、DOM 与网络，时间一律由参数传入，所以可以逐条用例验证。
  //  · 读数据、发气泡、处理按钮动作在 js/jelly-errands.js；原生端只显示（见 desktop-reminder/jelly-model.swift 的白名单）。
  //  · 按钮 id 与类别白名单在 Swift 一侧有同一份（JellyModel.nudgeButtonRules），test/desktop-companion-logic.test.mjs 逐项对照，改一边必须改另一边。
  // 设计与边界见 docs/superpowers/specs/2026-10-17-jelly-errands-design.md。

  const LEVELS = Object.freeze({ quiet: Object.freeze({ perHour: 2 }), mid: Object.freeze({ perHour: 4 }), busy: Object.freeze({ perHour: 8 }) });
  const MIN_GAP_MS = 15 * 60000;            // 两条差事气泡之间至少隔这么久
  const HOUR_MS = 60 * 60000;
  const AWAY_RETURN_MS = 20000;             // 用户回到电脑前，等这么久再开口
  const STRIKE_LIMIT = 2;                   // 同一类连续被拒绝这么多次，当天不再提
  const SEEN_MAX = 50;
  const SHOWN_MAX = 100;
  const TITLE_MAX = 24, TEXT_MAX = 120, TASK_TITLE_MAX = 12;
  const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

  // urgency：数字越大越先被挑中。过期任务 > 日志缺口 > 晨间概览 > 推荐歌曲 = 小乐子；同级的由 pick 按“最久没展示”轮换（歌曲与小乐子交替出现，
  // 不会因为歌曲候选多就把小乐子饿死，也不会反过来）。
  // buttons：第一个是主按钮；id 只能来自白名单（open / later / dismiss / more / play / another），title ≤ 12 个字符；song 是唯一 3 个按钮的类别。
  // since：能显示这一类气泡的桌面组件最低协议版本（差事 v8；推荐歌曲 v9：3 个按钮的气泡与 song 类别是 v9 才认得的）。
  const KINDS = Object.freeze({
    // “知道了”/“明天再说”/“晚点再说”都对应 later：概览当天只说一次，过期任务点了当天静默，日志要等下一个检查点才会再提
    brief: Object.freeze({ since: 8, urgency: 2, buttons: Object.freeze([Object.freeze({ id: 'open', title: '看看' }), Object.freeze({ id: 'later', title: '知道了' })]) }),
    task: Object.freeze({ since: 8, urgency: 4, buttons: Object.freeze([Object.freeze({ id: 'open', title: '去处理' }), Object.freeze({ id: 'later', title: '明天再说' })]) }),
    worklog: Object.freeze({ since: 8, urgency: 3, buttons: Object.freeze([Object.freeze({ id: 'open', title: '记一条' }), Object.freeze({ id: 'later', title: '晚点再说' })]) }),
    // 点“播放”才放；“换一首”只换候选；“不听”记一次拒绝
    song: Object.freeze({ since: 9, urgency: 1, buttons: Object.freeze([Object.freeze({ id: 'play', title: '播放' }), Object.freeze({ id: 'another', title: '换一首' }), Object.freeze({ id: 'dismiss', title: '不听' })]) }),
    tidbit: Object.freeze({ since: 8, urgency: 1, buttons: Object.freeze([Object.freeze({ id: 'more', title: '再来一条' }), Object.freeze({ id: 'dismiss', title: '够了' })]) }),
  });
  const KIND_IDS = Object.freeze(Object.keys(KINDS));
  // 设置里能单独开关的四类（晨间概览跟“任务”走）
  const SWITCHABLE = Object.freeze(['task', 'worklog', 'song', 'tidbit']);
  // 水母右键菜单“水母，给我…”能主动要的四类（过期任务不在里面）；组件协议 v9 起才有这个菜单。Swift 一侧有同一份（JellyModel.errandRequestItems）。
  const REQUEST_KINDS = Object.freeze(['brief', 'song', 'tidbit', 'worklog']);
  const MIN_VERSION = 8;
  const REQUEST_SINCE = 9;

  // 日志缺口的检查点与现有系统通知（js/background.js 的 checkWorklogProgress）一致：12 点 ≥1 小时、15 点 ≥3 小时、17 点 ≥6 小时
  const CHECKPOINTS = Object.freeze([
    Object.freeze({ hour: 12, expect: 60, label: '上午' }),
    Object.freeze({ hour: 15, expect: 180, label: '下午' }),
    Object.freeze({ hour: 17, expect: 360, label: '今天' }),
  ]);

  const DEFAULTS = Object.freeze({ from: '09:00', to: '18:00', weekdaysOnly: true, level: 'mid' });

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const minutesOf = text => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(text));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };

  /**
   * 设置规范化：只有明确的 true 才开启 / 显示任务名；分项只有明确的 false 才关；未知键丢弃；时段必须“开始早于结束”。
   * patrol（“活动行为”，协议 v10：白天清醒、巡游、小动作）与分项一样缺省为开、只有明确的 false 才关——旧版本存下的配置没有这个键，升级后应当得到新行为；
   * 它只在差事总开关打开且水母常驻时才会下发到原生端（js/jelly-desktop.js），所以总开关关着时这个默认值不起任何作用。
   */
  function normalize(raw) {
    const source = isObject(raw) ? raw : {};
    const kinds = isObject(source.kinds) ? source.kinds : {};
    const from = minutesOf(source.from), to = minutesOf(source.to);
    const valid = from !== null && to !== null && from < to;
    return {
      enabled: source.enabled === true,
      level: Object.prototype.hasOwnProperty.call(LEVELS, source.level) ? source.level : DEFAULTS.level,
      kinds: { task: kinds.task !== false, worklog: kinds.worklog !== false, song: kinds.song !== false, tidbit: kinds.tidbit !== false },
      showTitles: source.showTitles === true,
      from: valid ? source.from : DEFAULTS.from,
      to: valid ? source.to : DEFAULTS.to,
      weekdaysOnly: source.weekdaysOnly !== false,
      patrol: source.patrol !== false,
    };
  }

  /** date（本地时间）是否在活动时段内：from ≤ 时刻 < to；只在工作日时周末不开口。 */
  function inWindow(config, date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    if (config.weekdaysOnly && (date.getDay() === 0 || date.getDay() === 6)) return false;
    const now = date.getHours() * 60 + date.getMinutes();
    return now >= minutesOf(config.from) && now < minutesOf(config.to);
  }

  // ---------- 当天状态（只存今天，换日清零，无历史） ----------

  const emptyState = day => ({ day, shown: [], lastAt: 0, strikes: {}, muted: {}, seen: [], briefDone: false });

  const finite = value => typeof value === 'number' && Number.isFinite(value);

  /** 从存储读出的值恢复成合法状态：形状损坏、不是今天、字段非法的部分都按空处理（逐字段丢弃，不信任存储）。 */
  function sanitizeState(raw, day) {
    if (!isObject(raw) || raw.day !== day) return emptyState(day);
    const state = emptyState(day);
    if (Array.isArray(raw.shown)) {
      for (const item of raw.shown) {
        if (isObject(item) && finite(item.at) && typeof item.kind === 'string' && item.kind.length <= 20) state.shown.push({ at: item.at, kind: item.kind });
      }
      state.shown = state.shown.slice(-SHOWN_MAX);
    }
    state.lastAt = finite(raw.lastAt) && raw.lastAt > 0 ? raw.lastAt : 0;
    if (isObject(raw.strikes)) for (const id of KIND_IDS) if (Number.isInteger(raw.strikes[id]) && raw.strikes[id] > 0 && raw.strikes[id] < 100) state.strikes[id] = raw.strikes[id];
    if (isObject(raw.muted)) for (const id of KIND_IDS) if (raw.muted[id] === true) state.muted[id] = true;
    if (Array.isArray(raw.seen)) state.seen = raw.seen.filter(value => typeof value === 'string' && value.length <= 200).slice(-SEEN_MAX);
    state.briefDone = raw.briefDone === true;
    return state;
  }

  /** 换日：不是今天就整个清零（包括静默与指纹）。同一天原样返回同一个对象。 */
  function rollover(state, day) {
    return state && state.day === day ? state : emptyState(day);
  }

  // ---------- 数据统计（只读） ----------

  /** 任务统计：排除已完成与失败的；今天到期、已过期分别计数；topTitle 是已过期中（没有则今天到期中）最早到期的一个。 */
  function taskStats(memos, todayStr) {
    const stats = { today: 0, overdue: 0, open: 0, topTitle: '' };
    if (!Array.isArray(memos)) return stats;
    let best = null;
    for (const task of memos) {
      if (!isObject(task) || task.completed || task.status === 'failed') continue;
      stats.open += 1;
      if (typeof task.dueDate !== 'string' || !task.dueDate) continue;
      const overdue = task.dueDate < todayStr;
      if (task.dueDate === todayStr) stats.today += 1;
      else if (overdue) stats.overdue += 1;
      else continue;
      const key = `${overdue ? 0 : 1}|${task.dueDate}|${typeof task.dueTime === 'string' ? task.dueTime : '99:99'}`;
      if (!best || key < best.key) best = { key, title: typeof task.title === 'string' ? task.title : '' };
    }
    stats.topTitle = best ? best.title : '';
    return stats;
  }

  /** 今天已记录的工时（分钟）：只累加日期等于今天、工时为有限正数的记录。 */
  function loggedToday(entries, todayStr) {
    let logged = 0;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (isObject(entry) && entry.date === todayStr && finite(entry.duration) && entry.duration > 0) logged += entry.duration;
      }
    }
    return logged;
  }

  /**
   * 工作日志缺口：取当前时刻已经过了的最近一个检查点（12/15/17 点），今天记录的工时不足就返回 { label, logged, expect, hour }，够了返回 null。
   * 与系统通知不同的是不限于检查点那一个钟头：水母每隔几分钟评估一次，由预算与当天指纹控制不重复。
   */
  function worklogGap(entries, date, todayStr) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    let current = null;
    for (const point of CHECKPOINTS) if (date.getHours() >= point.hour) current = point;
    if (!current) return null;
    const logged = loggedToday(entries, todayStr);
    return logged >= current.expect ? null : { label: current.label, logged, expect: current.expect, hour: current.hour };
  }

  // ---------- 放行与挑选 ----------

  /**
   * 此刻能不能开口。依次判断：总开关 → 活动时段 → 用户是否离开 → 刚回来 → 有别的气泡/响铃 → 与上一条的间隔 → 本小时条数。
   * ctx = { presence:'active'|'away', activeSince, busy }：presence 或 activeSince 未知按“已活跃”处理（旧组件不上报）。
   */
  function gate(config, state, ctx, nowMs) {
    if (!config || config.enabled !== true) return { ok: false, reason: 'off' };
    if (!inWindow(config, new Date(nowMs))) return { ok: false, reason: 'window' };
    const context = isObject(ctx) ? ctx : {};
    if (context.presence === 'away') return { ok: false, reason: 'away' };
    if (finite(context.activeSince) && context.activeSince > 0 && nowMs - context.activeSince < AWAY_RETURN_MS) return { ok: false, reason: 'returning' };
    if (context.busy === true) return { ok: false, reason: 'busy' };
    if (state.lastAt > 0 && nowMs - state.lastAt < MIN_GAP_MS) return { ok: false, reason: 'gap' };
    const recent = state.shown.filter(item => item.at > nowMs - HOUR_MS && item.at <= nowMs).length;
    if (recent >= LEVELS[config.level].perHour) return { ok: false, reason: 'budget' };
    return { ok: true };
  }

  /**
   * 从候选里挑一条：先剔除已静默的类别、已展示过的内容指纹、当天已做过的晨间概览；再按紧急度降序，同级取“最久没展示”的（group 优先，缺省用 kind）。
   * candidate = { kind, fp, urgency, group?, payload }。
   */
  function pick(candidates, state, nowMs) {
    if (!Array.isArray(candidates)) return null;
    const lastShown = new Map();
    for (const item of state.shown) lastShown.set(item.kind, Math.max(lastShown.get(item.kind) || 0, item.at));
    const usable = candidates.filter(item => isObject(item) && KINDS[item.kind]
      && !state.muted[item.kind] && !state.seen.includes(item.fp) && !(item.kind === 'brief' && state.briefDone));
    if (!usable.length) return null;
    const when = item => lastShown.get(item.group || item.kind) || 0;
    usable.sort((a, b) => (b.urgency - a.urgency) || (when(a) - when(b)));
    return usable[0];
  }

  // ---------- 记录（不修改入参，返回新状态） ----------

  /** 记一次展示：写展示记录、最近时间、内容指纹（最多 50 条，淘汰最旧）；晨间概览置当天已做过。 */
  function recordShown(state, candidate, nowMs) {
    return {
      ...state,
      shown: [...state.shown, { at: nowMs, kind: candidate.group || candidate.kind }].slice(-SHOWN_MAX),
      lastAt: nowMs,
      seen: [...state.seen, candidate.fp].slice(-SEEN_MAX),
      briefDone: state.briefDone || candidate.kind === 'brief',
    };
  }

  /** 用户主动要的内容（“再来一条”）：只记内容指纹避免重复，不占最小间隔与每小时条数。 */
  function recordSeen(state, fp) {
    return { ...state, seen: [...state.seen, fp].slice(-SEEN_MAX) };
  }

  /** 外部提醒（喝水/起身）刚发过：占用最小间隔与每小时条数，但不进入内容指纹。 */
  function recordExternal(state, nowMs) {
    return { ...state, shown: [...state.shown, { at: nowMs, kind: 'external' }].slice(-SHOWN_MAX), lastAt: nowMs };
  }

  /** 记一次结果：接受（点了主按钮）清零该类连续拒绝；拒绝（稍后/够了/自行消失）累计，达到上限当天静默该类。 */
  function recordOutcome(state, kind, accepted) {
    if (!KINDS[kind]) return state;
    const strikes = { ...state.strikes };
    const muted = { ...state.muted };
    if (accepted) delete strikes[kind];
    else {
      strikes[kind] = (strikes[kind] || 0) + 1;
      if (strikes[kind] >= STRIKE_LIMIT) muted[kind] = true;
    }
    return { ...state, strikes, muted };
  }

  // ---------- 文案 ----------

  /** 去控制字符与方向控制符，按字符（不是字节）截断；不是字符串返回空串。 */
  function clean(value, max) {
    if (typeof value !== 'string') return '';
    return [...value.replace(CONTROL, '')].slice(0, max).join('').trim();
  }

  const short = (title, max = TASK_TITLE_MAX) => {
    const text = clean(title, 200);
    const chars = [...text];
    return chars.length > max ? `${chars.slice(0, max).join('')}…` : text;
  };
  const make = (title, text) => ({ title: clean(title, TITLE_MAX), text: clean(text, TEXT_MAX) });
  const duration = minutes => {
    const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
    return h > 0 ? `${h}小时${m > 0 ? `${m}分钟` : ''}` : `${m}分钟`;
  };

  const copy = {
    /** 晨间概览：今天几个任务、几个已过期；没有任何要说的返回 null。showTitles 为 true 才带最紧的任务名。 */
    brief(stats, showTitles) {
      const { today = 0, overdue = 0, topTitle = '' } = stats || {};
      if (today <= 0 && overdue <= 0) return null;
      let text = today > 0 && overdue > 0 ? `今天 ${today} 个任务，另有 ${overdue} 个已过期`
        : today > 0 ? `今天有 ${today} 个任务` : `有 ${overdue} 个任务已过期`;
      const name = showTitles === true ? short(topTitle) : '';
      if (name) text += `；最紧的是「${name}」`;
      return make('今天的任务', text);
    },
    /** 过期任务：没有过期返回 null。 */
    task(stats, showTitles) {
      const overdue = stats?.overdue || 0;
      if (overdue <= 0) return null;
      const name = showTitles === true ? short(stats.topTitle) : '';
      return make('有任务过期了', name ? `最久的是「${name}」，共 ${overdue} 个已过期` : `${overdue} 个任务已过期，处理一下吧`);
    },
    /** 工作日志缺口：措辞沿用现有系统通知。 */
    worklog(gap) {
      if (!gap) return null;
      const text = gap.logged <= 0 ? `${gap.label}还没有更新工作日志，抽空记录一下`
        : `${gap.label}已记录 ${duration(gap.logged)}，建议至少 ${Math.floor(gap.expect / 60)} 小时`;
      return make('工作日志', text);
    },
    /** 手动“记工时”：不看检查点，只说今天记了多少（没有或不是正数按没记）。 */
    worklogNow(logged) {
      const minutes = finite(logged) && logged > 0 ? logged : 0;
      return make('工作日志', minutes > 0 ? `今天已记录 ${duration(minutes)}，再记一条？` : '今天还没有记录工作日志，现在记一条？');
    },
    /** 推荐歌曲：歌名与歌手当作不可信输入（去控制字符、超长截断）；没有歌名返回 null。 */
    song(song) {
      if (!isObject(song)) return null;
      const name = short(song.title, 24);
      if (!name) return null;
      const artist = short(song.artist, 16);
      return make('来首歌？', `《${name}》${artist ? ` · ${artist}` : ''}`);
    },
    /** 小乐子：名言带作者；没有可用文字返回 null。 */
    tidbit(tip) {
      if (!isObject(tip)) return null;
      const body = clean(tip.text, 200);
      if (!body) return null;
      const author = clean(tip.author, 30);
      return make('水母想说', author ? `「${body}」—— ${author}` : body);
    },
  };

  return {
    KINDS, KIND_IDS, SWITCHABLE, REQUEST_KINDS, MIN_VERSION, REQUEST_SINCE, LEVELS, CHECKPOINTS, DEFAULTS, MIN_GAP_MS, AWAY_RETURN_MS, STRIKE_LIMIT, SEEN_MAX,
    normalize, inWindow, emptyState, sanitizeState, rollover, taskStats, loggedToday, worklogGap,
    gate, pick, recordShown, recordSeen, recordExternal, recordOutcome, copy, clean,
  };
});
