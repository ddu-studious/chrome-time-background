(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyDesktop = api;
})(globalThis, function () {
  'use strict';

  // 桌面水母：macOS 原生组件里的水母，独立于闹钟的桌面伙伴。
  //  · 它自己的设置只有两个布尔：resident（常驻，默认关）与 night（夜晚荧光，默认开），存在 desktopJellyV1；
  //    倒计时、喝水/起身提醒只是“委托方”，把内容放到水母身上，水母的存在不由它们决定。
  //  · 常驻时由 Chrome 保持与组件的连接（AlarmDesktop.setResident），连接被对端关闭（崩溃、被结束）按有界退避重连，
  //    用完次数就停并在设置页显示原因；用户从状态栏菜单“退出桌面组件”则视为“不再常驻”，不自动拉起。
  //  · 每条新连接建立后先下发水母状态与“今天的记录”（由 JellyNudge.summary 算好，原生不保存业务状态）。
  //  · 喝水/起身提醒的气泡经 presenter 交给原生；按钮动作回到 JellyNudge.act，计数与稍后提醒仍只由 Chrome 一侧拥有。
  //  · 桌面 AI 助手（协议 v7）：设置在独立的 desktopAssistantV1（{ enabled, hotkey }，旧版本回滚不会把它抹掉）。只有“常驻且已启用”
  //    才在 jelly 下发里带 assistant:{ enabled:true, hotkey }；不带就是关闭（原生据此注销全局快捷键）。热键注册结果随回执返回，
  //    显示在设置页；任务、提交与取消不在这里，见 js/assistant-native.js。
  //  · 水母差事的右键菜单“水母，给我…”（协议 v9）：只有“常驻且 errandsEnabled() 严格返回 true（差事总开关打开）”才在 jelly 下发里带 errands:{ enabled:true }；
  //    不带就是没有这个菜单项。菜单请求（errandRequest）由 js/alarm-desktop.js 转给 JellyErrands.request，气泡与歌曲推荐都不在这里，见 js/jelly-errands.js。
  //  · 水母的“活动行为”（协议 v10：白天清醒、定时巡游、小动作）：errands 里多一个严格布尔 patrol，由可选回调 errandsPatrol() 严格返回 true 才为 true（缺省 false）。
  //    这只是水母自己的动作，不涉及任何业务数据，也不回报给 Chrome；原生端各自忽略/兜底，旧组件认不得这个字段就仍是老样子。
  // 本模块自己不联网（推荐歌曲读网易云在后台的 jellyErrandSongs 里，经 neteaseApiCall 发出）、Chrome 这一侧不读空闲/活动状态（没有 chrome.idle）、不碰摄像头。设计与边界见 docs/technical/jellyfish-resident-companion-20261016.md。
  // 例外在原生端：2026-10-17 起原生组件常驻时读系统空闲秒数、只上报 active/away 两态（presence 事件，协议 v8），供水母差事使用；见 docs/technical/jelly-errands-20261017.md。

  const KEY = 'desktopJellyV1';
  const ASSISTANT_KEY = 'desktopAssistantV1';
  const DEFAULT_HOTKEY = 'ctrl+shift+b';
  const HOTKEY_PRESETS = Object.freeze(['ctrl+shift+b', 'ctrl+shift+space', 'ctrl+option+a', 'ctrl+option+b']);
  const HOTKEY_MODIFIERS = Object.freeze(['ctrl', 'option', 'shift', 'cmd']);   // 规范顺序；原生端 AssistantModel 必须同一套语法
  const HOTKEY_KEY = /^(?:[a-z0-9]|space|f(?:[1-9]|1[0-9]|20))$/;
  const HOTKEY_STATUSES = Object.freeze(['ok', 'invalid', 'taken', 'failed']);
  const LEGACY_KEY = 'userAlarmCountdownV1';           // 只读：迁移旧的夜晚荧光偏好，旧 style 字段不再使用
  const RETRY_MS = Object.freeze([2000, 5000, 15000, 60000, 300000]);
  const MAX_LINES = 3;
  const MAX_LINE_CHARS = 40;
  const CONTROL = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  /** 设置规范化：只有明确的 true 才常驻；只有明确的 false 才关闭夜晚荧光（缺省开）；新键没有 night 时沿用旧闹钟倒计时设置里的 night。 */
  function normalize(raw, legacy) {
    const source = isObject(raw) ? raw : {};
    const old = isObject(legacy) ? legacy : {};
    return { resident: source.resident === true, night: has(source, 'night') ? source.night !== false : old.night !== false };
  }

  /**
   * 全局快捷键语法：小写、`+` 分隔、末尾一个按键；修饰键按 ctrl/option/shift/cmd 的固定顺序规范化，至少两个且至少一个属于
   * ctrl/option/cmd（只有 Shift 太容易与普通输入冲突）；按键只允许 a–z、0–9、space、f1–f20。非法返回 null。
   */
  function normalizeHotkey(value) {
    if (typeof value !== 'string' || value.length > 64) return null;
    const parts = value.trim().toLowerCase().split('+');
    if (parts.length < 3) return null;
    const key = parts.pop();
    if (!HOTKEY_KEY.test(key)) return null;
    const seen = new Set();
    for (const part of parts) {
      if (!HOTKEY_MODIFIERS.includes(part) || seen.has(part)) return null;
      seen.add(part);
    }
    if (seen.size < 2 || !(seen.has('ctrl') || seen.has('option') || seen.has('cmd'))) return null;
    return [...HOTKEY_MODIFIERS.filter(modifier => seen.has(modifier)), key].join('+');
  }

  /** 助手设置规范化：只有明确的 true 才启用；热键非法时回到默认。 */
  function normalizeAssistant(raw) {
    const source = isObject(raw) ? raw : {};
    return { enabled: source.enabled === true, hotkey: normalizeHotkey(source.hotkey) || DEFAULT_HOTKEY };
  }

  /** “今天的记录”清洗：只收字符串，去控制字符与方向控制符，最多 3 行、每行 40 个字符。 */
  function cleanLines(lines) {
    if (!Array.isArray(lines)) return [];
    const out = [];
    for (const line of lines) {
      if (typeof line !== 'string') continue;
      const text = [...line.replace(CONTROL, '')].slice(0, MAX_LINE_CHARS).join('').trim();
      if (text) out.push(text);
      if (out.length >= MAX_LINES) break;
    }
    return out;
  }

  /**
   * 组件有没有按下发的外观应用：回执 appearance.status 必须是 ok，且回报的物种（组件实际画出来的那一种）与下发的一致。
   * S1a 组件不认识物种、回执里没有 species、永远画水母，所以缺省按水母算：下发水母时它仍是 ok，下发动物时就是不支持；
   * 组件认得这种动物但还画不出来（回退成水母）同样不算——设置页据此提示“需要更新组件”，不会说成已经应用。
   */
  function appearanceApplied(payload, reported) {
    if (reported?.status !== 'ok') return false;
    const wanted = payload.species === undefined ? 'jelly' : payload.species;
    const actual = reported.species === undefined ? 'jelly' : reported.species;
    return actual === wanted;
  }

  /**
   * storage：chrome.storage.local；desktop：AlarmDesktop（本函数会设置它的 onConnected / onPortLost / onJellySetting / onNudgeAction 回调）。
   * summary：() => Promise<{ lines, validUntil }>，act：(id, action) => Promise<{ ok, text|error }>（均来自 JellyNudge）。
   * onRestored：重连成功后调用（外部据此重新下发倒计时）。setTimer / clearTimer / retryMs 供测试替换。
   */
  function create({ storage, desktop, summary = null, act = null, onRestored = null, appearance = null, speciesNames = null, setTimer = setTimeout, clearTimer = clearTimeout, retryMs = RETRY_MS }) {
    let queue = Promise.resolve();
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    const status = { ok: false, version: 0, error: '', exhausted: false };
    let attempt = 0, timer = null, wasLost = false;
    // 最近一次下发里助手那部分的结果：off（没有带 assistant）、unsupported（组件太旧）、unknown（还没有回报）或原生回报的 ok/invalid/taken/failed
    let assistantInfo = { status: 'unknown' };
    // 最近一次下发里外观那部分的结果：off（没有外观数据源或本次没取到）、ok（回执 appearance.status==='ok'，且回报的物种与下发的一致）、
    // unsupported（带了外观但回执没有它、status 不是 ok，或回报的物种与下发的不同：旧组件，或组件还画不出这一种动物）、
    // unknown（连接失败或还没有下发）。协议版本不变，靠回执探测能力。
    let appearanceInfo = 'off';
    // 组件确认正在桌面上画的物种（回执与下发一致才算）：提醒气泡据此称呼。没确认过、连接失败或断开时按水母。
    let shownSpecies = 'jelly';

    const snapshot = () => ({
      connected: status.ok && !!desktop.port,
      version: status.version,
      error: status.error && status.exhausted ? `${status.error}（已停止自动重连）` : status.error,
    });
    const read = async () => {
      const stored = await storage.get([KEY, LEGACY_KEY]);
      return normalize(stored[KEY], stored[LEGACY_KEY]);
    };
    const readAssistant = async () => normalizeAssistant((await storage.get(ASSISTANT_KEY))[ASSISTANT_KEY]);
    const assistantView = (settings, assistant) => ({
      enabled: assistant.enabled, hotkey: assistant.hotkey,
      hotkeyStatus: assistant.enabled && settings.resident ? assistantInfo.status : 'off',
      needsResident: assistant.enabled && !settings.resident,
    });
    const stopRetry = () => { if (timer) { clearTimer(timer); timer = null; } };
    /**
     * 提醒气泡里的称呼：桌面上确认是别的动物时，把标题与正文里的“水母”按字面换成它的名字；认不出名字就原样。
     * 返回副本，不改调用方的对象，也不动 id、按钮等其余字段。只影响桌面气泡；退回系统通知时桌面上没有这只动物说话，仍叫水母。
     */
    const named = nudge => {
      const name = shownSpecies !== 'jelly' && isObject(speciesNames) && has(speciesNames, shownSpecies) ? speciesNames[shownSpecies] : null;
      if (typeof name !== 'string' || !name.trim() || !isObject(nudge)) return nudge;
      const out = { ...nudge };
      for (const key of ['title', 'text']) if (typeof out[key] === 'string') out[key] = out[key].split('水母').join(name);
      return out;
    };

    // 有界退避：每次失败安排下一次，用完 retryMs 就停下（不无限重试），之后由设置变化、重载扩展或新连接重新触发
    function scheduleRetry() {
      if (timer) return;
      if (attempt >= retryMs.length) { status.exhausted = true; return; }
      const delay = retryMs[attempt++];
      timer = setTimer(() => {
        timer = null;
        return serial(async () => {
          const settings = await read();
          desktop.setResident(settings.resident);
          if (settings.resident) await push(settings);
        }).catch(() => {});
      }, delay);
    }

    /** 下发水母状态与今天的记录；失败时记录原因，常驻则安排重连。 */
    async function push(settings) {
      let lines = [], linesUntil = 0;
      if (summary) {
        try {
          const info = await summary();
          lines = cleanLines(info?.lines);
          linesUntil = Number.isFinite(info?.validUntil) ? info.validUntil : 0;
        } catch (_) { /* 记录读取失败只影响气泡里的文字，不影响水母本身 */ }
      }
      // 只有常驻且已启用才带 assistant；不带就是关闭，原生据此注销全局快捷键。读取失败按关闭，不影响水母本身。
      let assistant = null;
      try { const stored = await readAssistant(); if (settings.resident && stored.enabled) assistant = stored; } catch (_) { /* 按关闭处理 */ }
      // 外观读取失败只影响外观：本次不带该字段（原生端保持上一次），水母照常下发
      let appearancePayload = null;
      if (appearance) {
        try { const value = await appearance(); if (value && typeof value === 'object') appearancePayload = value; } catch (_) { /* 按没有外观处理 */ }
      }
      // 水母差事（协议 v9 的右键菜单“水母，给我…”）同理：只有常驻且 errandsEnabled() 严格返回 true 才带 errands；不带就是没有这个菜单项。
      // 协议 v10 的“活动行为”（白天清醒、巡游、小动作）是 errands 里的可选布尔 patrol：只有 errandsPatrol() 严格返回 true 才为 true，其余（没接回调、
      // 假值、字符串、抛错）一律 false；差事没开时不问。原生端同样只认严格的 true，旧组件忽略这个字段。
      let errands = false, patrol = false;
      try { errands = settings.resident && (await api.errandsEnabled?.()) === true; } catch (_) { errands = false; }
      if (errands) { try { patrol = (await api.errandsPatrol?.()) === true; } catch (_) { patrol = false; } }
      try {
        const result = await desktop.setJelly({ resident: settings.resident, night: settings.night, lines, linesUntil,
          ...(assistant ? { assistant: { enabled: true, hotkey: assistant.hotkey } } : {}),
          ...(errands ? { errands: { enabled: true, patrol } } : {}),
          ...(appearancePayload ? { appearance: appearancePayload } : {}) });
        status.ok = true; status.version = Number(result?.version) || 0; status.error = ''; status.exhausted = false;
        attempt = 0; stopRetry();
        appearanceInfo = appearancePayload ? (appearanceApplied(appearancePayload, result?.appearance) ? 'ok' : 'unsupported') : 'off';
        // 本次没带外观（读取失败）时原生保持上一次的外观，所以称呼也保持上一次确认的；带了但组件没有确认同一种，就按水母
        if (appearancePayload) shownSpecies = appearanceInfo === 'ok' && typeof appearancePayload.species === 'string' ? appearancePayload.species : 'jelly';
        if (assistant) {
          const reported = result?.assistant?.status;
          assistantInfo = { status: status.version < 7 ? 'unsupported' : HOTKEY_STATUSES.includes(reported) ? reported : 'unknown' };
          if (status.version >= 7) { try { Promise.resolve(api.onAssistantApplied?.()).catch(() => {}); } catch (_) { /* 外部回调失败不影响水母 */ } }
        } else assistantInfo = { status: 'off' };
        if (wasLost) {
          wasLost = false;
          try { Promise.resolve(onRestored?.()).catch(() => {}); } catch (_) { /* 外部回调失败不影响水母 */ }
        }
        return true;
      } catch (error) {
        status.ok = false; status.version = 0; status.error = String(error?.message || error).slice(0, 120);
        assistantInfo = { status: 'unknown' };
        appearanceInfo = 'unknown';
        shownSpecies = 'jelly';
        if (settings.resident) { wasLost = true; scheduleRetry(); }
        return false;
      }
    }

    /** 让组件与设置一致：常驻时连接并下发；没有常驻也没有连接时不会为了推送去启动组件。 */
    const sync = () => serial(async () => {
      const settings = await read();
      desktop.setResident(settings.resident);
      if (!settings.resident && !desktop.port) return snapshot();
      await push(settings);
      return snapshot();
    });

    /** 保存设置（只认两个布尔字段，未知键丢弃）并让组件与之一致；组件没装或太旧时设置照样保存，原因放在 status 里。 */
    const set = patch => {
      if (!isObject(patch)) return Promise.resolve({ ok: false, error: '设置格式不正确' });
      const next = {};
      for (const key of ['resident', 'night']) {
        if (!has(patch, key)) continue;
        if (typeof patch[key] !== 'boolean') return Promise.resolve({ ok: false, error: `${key} 必须是 true 或 false` });
        next[key] = patch[key];
      }
      let assistantPatch = null;
      if (has(patch, 'assistant')) {
        if (!isObject(patch.assistant)) return Promise.resolve({ ok: false, error: '助手设置格式不正确' });
        assistantPatch = {};
        if (has(patch.assistant, 'enabled')) {
          if (typeof patch.assistant.enabled !== 'boolean') return Promise.resolve({ ok: false, error: 'assistant.enabled 必须是 true 或 false' });
          assistantPatch.enabled = patch.assistant.enabled;
        }
        if (has(patch.assistant, 'hotkey')) {
          const hotkey = normalizeHotkey(patch.assistant.hotkey);
          if (!hotkey) return Promise.resolve({ ok: false, error: '快捷键无效：需要至少两个修饰键（⌃ ⌥ ⇧ ⌘，不能只有 ⇧），再加一个字母、数字、空格或 F1–F20' });
          assistantPatch.hotkey = hotkey;
        }
      }
      return serial(async () => {
        const settings = { ...(await read()), ...next };
        // 只改助手设置时不重写水母外观键
        if (!assistantPatch || Object.keys(next).length) await storage.set({ [KEY]: settings });
        if (assistantPatch) await storage.set({ [ASSISTANT_KEY]: { ...(await readAssistant()), ...assistantPatch } });
        attempt = 0; stopRetry(); status.exhausted = false;
        desktop.setResident(settings.resident);
        if (settings.resident || desktop.port) await push(settings);
        return { ok: true, settings, assistant: assistantView(settings, await readAssistant()), status: snapshot() };
      });
    };

    /** 用户从状态栏退出了桌面组件：视为“不再常驻”并保存，不自动重连，也不为了通知它而重新启动。 */
    const quit = () => serial(async () => {
      const settings = await read();
      stopRetry(); status.ok = false;
      if (!settings.resident) return;
      await storage.set({ [KEY]: { ...settings, resident: false } });
      desktop.setResident(false);
      status.error = '你从菜单退出了桌面组件，已取消常驻';
    });

    // ---- 与 AlarmDesktop 的接线 ----
    desktop.onConnected = () => { void sync().catch(() => {}); };
    desktop.onPortLost = info => {
      status.ok = false; assistantInfo = { status: 'unknown' }; appearanceInfo = 'unknown'; shownSpecies = 'jelly';
      if (info?.quit) { void quit().catch(() => {}); return; }
      void serial(async () => {
        const settings = await read();
        if (!settings.resident) return;
        status.error = '桌面组件连接已断开';
        wasLost = true;
        scheduleRetry();
      }).catch(() => {});
    };
    // 水母右键菜单只能“收起”；原生不能把常驻打开
    desktop.onJellySetting = value => { if (value && value.resident === false) void set({ resident: false }).catch(() => {}); };
    desktop.onNudgeAction = message => (act ? act(message?.id, message?.action) : Promise.resolve({ ok: false, error: '提醒功能不可用' }));

    const api = {
      /** 设置与最近一次连接状态（只读，不连接组件）。assistant 是桌面 AI 助手的设置与热键状态。 */
      get: async () => {
        const [settings, assistant] = await Promise.all([read(), readAssistant()]);
        return { ok: true, settings, assistant: assistantView(settings, assistant), status: snapshot() };
      },
      set,
      /** 桌面 AI 助手是否生效：必须同时常驻且已启用；读取失败按关闭。 */
      assistantEnabled: async () => {
        try { const [settings, assistant] = await Promise.all([read(), readAssistant()]); return settings.resident && assistant.enabled; }
        catch (_) { return false; }
      },
      /**
       * 水母差事能不能开口：设置常驻、端口还在、最近一次下发成功且组件版本 ≥ minVersion（默认 8：旧组件认不得差事类别；
       * 推荐歌曲与右键菜单请求要 9）。minVersion 只能抬高门槛，不能放宽到 8 以下；不是有限数字（写错了）一律按不能；读取失败按不能。
       */
      errandsReady: async (minVersion = 8) => {
        if (typeof minVersion !== 'number' || !Number.isFinite(minVersion)) return false;
        const need = Math.max(8, minVersion);
        try { const settings = await read(); return settings.resident && status.ok && !!desktop.port && status.version >= need; }
        catch (_) { return false; }
      },
      /** 外部回调（可选）：带 assistant 的下发被 v7 组件接受后调用，用来补发当前任务状态。 */
      onAssistantApplied: null,
      /** 外部回调（可选）：() => Promise<boolean>，水母差事总开关是否开着；只有严格返回 true 且常驻，下发才带 errands（右键菜单项）。 */
      errandsEnabled: null,
      /** 外部回调（可选）：() => Promise<boolean>，“活动行为”（协议 v10）是否开着；只在 errands 下发时才被问，严格返回 true 才带 patrol:true，否则 patrol:false。 */
      errandsPatrol: null,
      sync,
      /** 启动时调用：常驻就建立连接并下发，否则什么都不做。 */
      restore: sync,
      status: snapshot,
      /** 外观是否被组件接受（见 appearanceInfo）；设置页据此提示“需要更新组件”。 */
      appearanceStatus: () => appearanceInfo,
      /** 交给 JellyNudge 的 presenter：原生确认显示才算 shown，失败抛出由它退回系统通知。 */
      presenter: {
        async present(nudge) {
          const result = await desktop.showNudge(named(nudge));
          return { shown: result?.ok === true };
        },
        async cancel(id) { try { desktop.clearNudge(id); } catch (_) { /* 端口已失效，气泡会随连接一起消失 */ } },
      },
    };
    return api;
  }

  return { create, normalize, normalizeAssistant, normalizeHotkey, cleanLines, KEY, ASSISTANT_KEY, LEGACY_KEY, DEFAULT_HOTKEY, HOTKEY_PRESETS, RETRY_MS };
});
