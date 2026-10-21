(function (root, factory) {
  const api = factory(root.JellyErrandsCore || (typeof require === 'function' ? require('./jelly-errands-core.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyErrands = api;
})(globalThis, function (Core) {
  'use strict';

  // 水母差事（控制器）：让常驻的桌面水母主动开口——今天的任务概览、过期任务、工作日志缺口、推荐歌曲、随机小乐子。
  //  · 每 5 分钟由 chrome.alarms 评估一次：读数据（只读）→ Core.gate 判断此刻能不能开口 → Core.pick 挑一条 → 交给桌面水母的 presenter 发气泡。
  //  · 只在水母 3～4 秒内确认显示才算展示；没确认（水母不在、组件太旧、响铃中、抛错、超时）不记次数。过期任务与日志缺口会标记 fallback，
  //    由调用方决定要不要退回系统通知（评估本身不退回，歌曲、小乐子与概览永远静默）。
  //  · 按钮动作回到这里：open 打开页面并记为接受；later / dismiss 记一次拒绝；more / another 立刻再来一条（用户明确要的，不占预算）；
  //    play（只有歌曲有）才会放歌——定时评估永远只发气泡，放歌只由用户点“播放”触发。水母不写任务、不代写日志。
  //  · 推荐歌曲（第二期）：来源 songs.suggest()（后台注入，已登录每日推荐 → 热歌榜），候选在内存里缓存 30 分钟；提议前先问播放器是不是空闲
  //    （严格 false 才提议，在播放或读不出都不提议）。“播放”交给注入的 playSong（后台的 playAssistantMusic 适配器）：只有播放器真实确认起播才写
  //    “已开始播放”；已发给播放器却没确认按“未知”处理，不重放，不声称成功；明确没发出去的失败才允许再点一次。播放不占串行队列。
  //  · 右键菜单“水母，给我…”（第二期）：request(kind) 现做一条候选并经同一个 presenter 发气泡，忽略时段/间隔/预算/静默/分项开关，
  //    但仍要求总开关开着、组件 ≥ v9、没有响铃；手动出的气泡不占预算，也不计拒绝。
  //  · 当天状态（今天发过什么、被拒绝几次、已展示内容的指纹）只存 chrome.storage.local 一个键，换日清零，无历史；读取失败本次跳过，不覆盖原数据。
  //  · 不调用模型，也不自己联网（歌曲来源由后台注入，复用音乐功能已有的网易云接口）、不读系统空闲：presence（离开/回来）由原生端上报的两态传进来。
  //    日志只写固定类别与结果，不含任何文字。
  // 设计与边界见 docs/superpowers/specs/2026-10-17-jelly-errands-design.md 与 docs/superpowers/plans/2026-10-17-jelly-errands-phase2.md。

  const CONFIG_KEY = 'jellyErrandsV1';          // 设置（chrome.storage.sync）
  const STATE_KEY = 'jellyErrandsStateV1';      // 当天状态（chrome.storage.local）
  const ALARM = 'jelly-errands-tick';
  const PREFIX = 'jelly-errand-';
  const TICK_MIN = 5;
  const TTL_SEC = 90;                           // 气泡无人理睬时自行收起的秒数（原生不计时，只负责收起）
  const PRESENT_TIMEOUT_MS = 4000;              // 兜底：presenter 迟迟不返回也要放弃，不能堵住串行队列
  const SONG_FETCH_MS = 6000;                   // 取候选歌曲最多等这么久
  const PLAYING_CHECK_MS = 3000;                // 问播放器“在不在播放”最多等这么久
  const PLAY_MS = 12000;                        // “播放”从取地址到播放器确认最多等这么久（后台的确认本身最长 10 秒；原生只等 8 秒回执，更慢的结果在用户再点一次时给出）
  const SONG_CACHE_MS = 30 * 60000;             // 候选歌曲在内存里缓存多久
  const SONG_FAIL_MS = 10 * 60000;              // 取歌失败后多久内不再试
  const OFFER_MAX = 20;                         // 记住最近多少个歌曲气泡（点“播放”时要用到那首歌）
  const MANUAL_MAX = 50;                        // 记住最近多少个手动要的气泡
  const BRIEF_FROM_HOUR = 6, BRIEF_TO_HOUR = 11; // 晨间概览只在 6:00–11:59 内出现
  const FALLBACK_KINDS = Object.freeze(['task', 'worklog']);   // 有对应系统通知的两类：没被水母接手时调用方可以退回通知
  const OFFERABLE = Object.freeze(['brief', 'task', 'worklog', 'tidbit']);   // 五个系统通知发送器能先问水母的类别（歌曲没有对应的系统通知）
  const ID_PATTERN = /^jelly-errand-(brief|task|worklog|lark|song|tidbit|tabs|watch|bookmark)-\d+$/;
  const UNKNOWN_PLAY_TEXT = '已交给播放器，还没确认开始播放，请在播放器里看看';      // 适配器明确说已经发给播放器、但没等到确认
  const LOST_PLAY_TEXT = '播放器没有及时回应，请在播放器里看看有没有开始播放';       // 抛错、超时或结果说不清：不知道发出去没有，不能说“已交给”
  const UNAVAILABLE_TEXT = '这首歌暂不可播放，点“换一首”试试';

  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseId = id => { const match = ID_PATTERN.exec(String(id)); return match ? match[1] : null; };

  /** 极简字符串哈希（djb2）：只用来给小乐子生成稳定的内容指纹，不涉及安全。 */
  function hash(text) {
    let value = 5381;
    for (const char of String(text)) value = ((value * 33) ^ char.codePointAt(0)) >>> 0;
    return value.toString(36);
  }

  function create({ syncStorage, localStorage, alarms, presenter = null, readMemos = async () => [], readWorklog = async () => [], tips = () => [],
    readLark = null, readTabs = null, readStaleTabs = null, readWatch = null, readBookmarks = null, readBookmark = null,
    openPage = async () => {}, now = () => new Date(), random = Math.random, presentTimeoutMs = PRESENT_TIMEOUT_MS, isBusy = () => false, isAvailable = () => true,
    songs = null, isPlaying = null, playSong = null, onChange = null,
    songFetchMs = SONG_FETCH_MS, playingCheckMs = PLAYING_CHECK_MS, playMs = PLAY_MS, log = null }) {
    const tabsReader = readTabs || readStaleTabs;
    const bookmarksReader = readBookmarks || readBookmark;
    let queue = Promise.resolve();
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    const note = (action, detail) => { try { log?.('jelly-errands', action, detail); } catch (_) { /* 日志失败不影响业务 */ } };
    const bounded = (promise, ms) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('presenter timeout')), ms);
      promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
    const pickRandom = list => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

    // 内存里的瞬时状态（Service Worker 重启即丢，丢了只是少记一次拒绝、点旧气泡的“播放”按已失效处理，不影响业务）
    const presence = { state: 'unknown', since: 0, meeting: false };
    const acted = new Set();      // 已经点过按钮的气泡 id：之后它自行消失不再算拒绝
    const manualIds = new Set();  // 用户从右键菜单主动要的气泡 id：按钮与自行消失都不计入拒绝
    const offers = new Map();     // 歌曲气泡 id → { song, status: idle | playing | done | unknown | failed, text }
    const targets = new Map();    // 继续看/深海拾贝气泡 id → 打开目标
    const songCache = { at: 0, list: [], failedAt: 0 };
    let requestBusy = false;
    let lastIdNumber = 0;

    const remember = (id, song) => { offers.set(id, { song, status: 'idle', text: '' }); if (offers.size > OFFER_MAX) offers.delete(offers.keys().next().value); };
    const rememberTarget = (id, target) => { if (!target) return; targets.set(id, target); if (targets.size > OFFER_MAX) targets.delete(targets.keys().next().value); };
    const markManual = id => { manualIds.add(id); if (manualIds.size > MANUAL_MAX) manualIds.delete(manualIds.values().next().value); };
    const notifyChange = () => { try { Promise.resolve(onChange?.()).catch(() => {}); } catch (_) { /* 外部回调失败不影响设置 */ } };

    /** 水母此刻能不能开口：常驻、已连接、组件版本不低于 minVersion（由外部判断）。严格要求返回 true；抛错或其他值都当作不能，不会为了发气泡去拉起组件。 */
    const available = async (minVersion = Core.MIN_VERSION) => { try { return (await isAvailable(minVersion)) === true; } catch (_) { return false; } };

    const readConfig = async () => Core.normalize((await syncStorage.get(CONFIG_KEY))[CONFIG_KEY]);
    /** 读当天状态；读取抛错时向上抛（调用方跳过本次，不覆盖原数据）；形状损坏按空处理。 */
    const readState = async date => Core.sanitizeState((await localStorage.get(STATE_KEY))[STATE_KEY], dayKey(date));
    const writeState = state => localStorage.set({ [STATE_KEY]: state });

    async function applyAlarm(config) {
      if (!config.enabled) { await alarms.clear(ALARM); return; }
      const existing = alarms.get ? await alarms.get(ALARM) : null;
      if (existing && existing.periodInMinutes === TICK_MIN) return;      // 已有同周期的不重建，避免每次唤醒都把计时重置
      await alarms.create(ALARM, { delayInMinutes: 1, periodInMinutes: TICK_MIN });
    }

    /** 候选歌曲：先看缓存（30 分钟）；失败（空、抛错、超时）后 10 分钟内不再试，免得来源出问题时每 5 分钟都联网。 */
    async function loadSongs(nowMs) {
      if (!songs || typeof songs.suggest !== 'function') return [];
      if (songCache.list.length && nowMs - songCache.at < SONG_CACHE_MS) return songCache.list;
      if (songCache.failedAt && nowMs - songCache.failedAt < SONG_FAIL_MS) return [];
      let list = [];
      try { list = await bounded(Promise.resolve(songs.suggest()), songFetchMs); } catch (_) { list = []; }
      if (!Array.isArray(list) || !list.length) { songCache.list = []; songCache.failedAt = nowMs; return []; }
      songCache.list = list; songCache.at = nowMs; songCache.failedAt = 0;
      return list;
    }

    /**
     * 一首推荐歌曲的候选。定时评估要求播放器空闲（严格 false；在播放、读不出、抛错、超时都不提议）；用户明确要的（manual）不问。
     * 组件协议不到 KINDS.song.since（v9）也不提议——旧组件认不得 song 类别与 3 个按钮。
     */
    async function songCandidate(state, nowMs, { manual = false } = {}) {
      if (!songs || !(await available(Core.KINDS.song.since))) return null;
      if (!manual) {
        let playing = null;
        try { playing = typeof isPlaying === 'function' ? await bounded(Promise.resolve(isPlaying()), playingCheckMs) : null; } catch (_) { playing = null; }
        if (playing !== false) return null;
      }
      const fresh = (await loadSongs(nowMs)).filter(song => !state.seen.includes(`song:${song.songId}`));
      if (!fresh.length) return null;
      const song = pickRandom(fresh);
      const payload = Core.copy.song(song);
      return payload ? { kind: 'song', fp: `song:${song.songId}`, urgency: Core.KINDS.song.urgency, payload, song } : null;
    }

    /** 候选：每类最多一条；读数据失败只跳过该类。only 只算指定的一类（再来一条、换一首、系统通知先问水母），manual 表示用户明确要的。 */
    async function candidates(config, date, state, { only = null, manual = false } = {}) {
      const want = kind => !only || only === kind;
      const list = [];
      const day = dayKey(date);
      const hour = date.getHours();
      if (config.kinds.task && (want('task') || want('brief'))) {
        let stats = null;
        try { stats = Core.taskStats(await readMemos(), day); } catch (_) { stats = null; }
        if (stats) {
          const text = want('task') ? Core.copy.task(stats, config.showTitles) : null;
          if (text) list.push({ kind: 'task', fp: `task:${day}:${hour < 13 ? 'am' : 'pm'}`, urgency: Core.KINDS.task.urgency, payload: text });
          const brief = want('brief') ? Core.copy.brief(stats, config.showTitles) : null;
          if (brief && hour >= BRIEF_FROM_HOUR && hour <= BRIEF_TO_HOUR && !state.briefDone) {
            list.push({ kind: 'brief', fp: `brief:${day}`, urgency: Core.KINDS.brief.urgency, payload: brief });
          }
        }
      }
      if (config.kinds.worklog && want('worklog')) {
        let gap = null;
        try { gap = Core.worklogGap(await readWorklog(), date, day); } catch (_) { gap = null; }
        const text = Core.copy.worklog(gap);
        if (text) list.push({ kind: 'worklog', fp: `worklog:${day}:${gap.hour}`, urgency: Core.KINDS.worklog.urgency, payload: text });
      }
      if (config.kinds.lark && want('lark') && typeof readLark === 'function' && (only || !list.some(item => item.urgency > Core.KINDS.lark.urgency))) {
        if (await available(Core.KINDS.lark.since)) {
          let meta = null;
          try { meta = await bounded(Promise.resolve(readLark({ manual })), songFetchMs); } catch (_) { meta = null; }
          if (meta && meta.ok === true && Number(meta.count) > 0) {
            const payload = Core.copy.lark(meta);
            const fp = `lark:${day}:${Number(meta.newestAt) || meta.count}`;
            if (payload && !state.seen.includes(fp)) list.push({ kind: 'lark', fp, urgency: Core.KINDS.lark.urgency, payload, target: { kind: 'lark' } });
          }
        }
      }
      // 歌曲排在小乐子之前（同级时第一天先听歌，之后按最久没展示轮换）；已经有严格更高优先级的候选就不为歌曲联网取数
      if (config.kinds.song && want('song') && (only || !list.some(item => item.urgency > Core.KINDS.song.urgency))) {
        const candidate = await songCandidate(state, date.getTime(), { manual });
        if (candidate) list.push(candidate);
      }
      if (config.kinds.tidbit && want('tidbit')) {
        const fresh = tidbits(state);
        if (fresh.length) list.push(pickRandom(fresh));
      }
      if (config.kinds.tabs && want('tabs') && typeof tabsReader === 'function') {
        if (await available(Core.KINDS.tabs.since)) {
          let stats = null;
          try { stats = Core.staleTabStats(await tabsReader(), date.getTime()); } catch (_) { stats = null; }
          const payload = Core.copy.tabs(stats);
          const fp = `tabs:${day}:${hour < 14 ? 'am' : 'pm'}`;
          if (payload && !state.seen.includes(fp)) list.push({ kind: 'tabs', fp, urgency: Core.KINDS.tabs.urgency, payload, target: { kind: 'tabs' } });
        }
      }
      if (config.kinds.watch && want('watch') && typeof readWatch === 'function') {
        if (await available(Core.KINDS.watch.since)) {
          let items = [];
          try { items = Core.watchCandidates(await readWatch(), date.getTime()); } catch (_) { items = []; }
          const fresh = items.find(item => !state.seen.includes(`watch:${item.id}`));
          const payload = fresh ? Core.copy.watch(fresh) : null;
          if (payload) list.push({ kind: 'watch', fp: `watch:${fresh.id}`, urgency: Core.KINDS.watch.urgency, payload, target: fresh.target });
        }
      }
      if (config.kinds.bookmark && want('bookmark') && typeof bookmarksReader === 'function') {
        if (await available(Core.KINDS.bookmark.since)) {
          let due = [];
          try { due = Core.dueBookmarks(await bookmarksReader(), date.getTime()); } catch (_) { due = []; }
          const fresh = due.filter(item => !state.seen.includes(`bookmark:${item.id}`));
          if (fresh.length) {
            const picked = fresh[0];
            const payload = Core.copy.bookmark(picked, due.length);
            if (payload) list.push({ kind: 'bookmark', fp: `bookmark:${picked.id}`, urgency: Core.KINDS.bookmark.urgency, payload, target: { url: picked.url, id: picked.id, title: picked.title } });
          }
        }
      }
      return list;
    }

    /** 还没展示过的小乐子（按内容指纹去重）。tips() 失败按没有处理。 */
    function tidbits(state) {
      let source = [];
      try { source = tips(); } catch (_) { source = []; }
      const out = [];
      for (const tip of Array.isArray(source) ? source : []) {
        const text = Core.copy.tidbit(tip);
        if (!text) continue;
        const fp = `tidbit:${hash(text.text)}`;
        if (!state.seen.includes(fp)) out.push({ kind: 'tidbit', fp, urgency: Core.KINDS.tidbit.urgency, payload: text });
      }
      return out;
    }

    /** 交给水母展示：只有在限定时间内收到严格的 shown === true 才算；其余都当作没展示，并让可能迟到的气泡撤掉。 */
    async function deliver(candidate, nowMs) {
      const number = Math.max(nowMs, lastIdNumber + 1);
      lastIdNumber = number;
      const id = `${PREFIX}${candidate.kind}-${number}`;
      let accepted = false;
      if (presenter) {
        try {
          const reply = await bounded((async () => presenter.present({
            id, kind: candidate.kind, title: candidate.payload.title, text: candidate.payload.text,
            buttons: Core.KINDS[candidate.kind].buttons.map(button => ({ ...button })), ttl: TTL_SEC,
          }))(), presentTimeoutMs);
          accepted = !!reply && reply.shown === true;
        } catch (_) { accepted = false; }
        if (!accepted) { try { await presenter.cancel?.(id); } catch (_) { /* 撤销失败不影响结果 */ } }
      }
      if (accepted && candidate.kind === 'song') remember(id, candidate.song);
      if (accepted && candidate.target) rememberTarget(id, candidate.target);
      return { accepted, id };
    }

    /**
     * 评估一次。manual 用于用户主动要的内容（“再来一条”“换一首”）：跳过放行条件，不占间隔与每小时条数，只限定某一类（only）。
     */
    async function evaluate({ manual = false, only = null } = {}) {
      const config = await readConfig();
      if (!config.enabled) return { sent: false, reason: 'off' };
      if (only && !config.kinds[only]) return { sent: false, reason: 'off' };
      if (!(await available())) return { sent: false, reason: 'unavailable' };
      const date = now();
      const nowMs = date.getTime();
      let state;
      try { state = await readState(date); } catch (_) { return { sent: false, reason: 'storage' }; }
      if (!manual) {
        const verdict = Core.gate(config, state, { presence: presence.state === 'away' ? 'away' : 'active', meeting: presence.meeting, activeSince: presence.since, busy: !!isBusy() }, nowMs);
        if (!verdict.ok) return { sent: false, reason: verdict.reason };
      }
      let list = await candidates(config, date, state, { only, manual });
      if (only) list = list.filter(item => item.kind === only);
      const picked = Core.pick(list, state, nowMs);
      if (!picked) return { sent: false, reason: 'idle' };
      const { accepted, id } = await deliver(picked, nowMs);
      if (!accepted) {
        note('declined', { ok: false, context: picked.kind });
        return { sent: false, reason: 'declined', kind: picked.kind, fallback: FALLBACK_KINDS.includes(picked.kind) };
      }
      await writeState(manual ? Core.recordSeen(state, picked.fp) : Core.recordShown(state, picked, nowMs));
      note('shown', { ok: true, context: picked.kind });
      return { sent: true, id, kind: picked.kind };
    }

    /** 点了“播放”之后记为接受（清零该类连续拒绝）；手动要的气泡不记；读写失败不影响已经发生的播放。 */
    async function recordAccepted(id, kind) {
      if (manualIds.has(id)) return;
      try {
        await serial(async () => {
          const state = await readState(now());
          await writeState(Core.recordOutcome(state, kind, true));
        });
      } catch (_) { /* 结果没记上不影响播放本身 */ }
    }

    /**
     * 歌曲气泡的“播放”：不占串行队列（取地址与等播放器确认最多 12 秒）。同一个气泡只有 idle 才会真的交给播放器：
     * playing 回“正在交给播放器”，done / unknown 回上次的文字，failed 回同样的失败；只有“明确没发出去”的失败才回到 idle 允许再点。
     * 适配器返回 { ok, dispatched, code?, message? }：ok:true 才算开始播放；dispatched:false 才是“明确没发出去”；
     * dispatched:true 是“已发出但没确认”；抛错、超时与说不清的结果都按未知处理（置 signal.cancelled，迟到的流程在下一个检查点自行停下）。
     */
    async function playOffered(id) {
      const offer = offers.get(id);
      if (!offer) return { ok: false, error: '这条提示已失效' };
      if (offer.status === 'playing') return { ok: false, error: '正在交给播放器，请稍候' };
      if (offer.status === 'done' || offer.status === 'unknown') return { ok: true, text: offer.text };
      if (offer.status === 'failed') return { ok: false, error: offer.text };
      if (typeof playSong !== 'function') return { ok: false, error: '播放功能不可用' };
      offer.status = 'playing';
      acted.add(id);
      const signal = { cancelled: false };
      let outcome = null;
      try { outcome = await bounded(Promise.resolve(playSong(offer.song, signal)), playMs); }
      catch (_) { signal.cancelled = true; outcome = null; }       // 抛错或超时：不知道发出去没有，按未知处理
      if (!outcome || typeof outcome !== 'object') outcome = null;
      if (outcome && outcome.ok === true) {
        offer.status = 'done';
        offer.text = `已开始播放《${Core.clean(offer.song.title, 16)}》`;
        note('play', { ok: true, context: 'song' });
        await recordAccepted(id, 'song');
        return { ok: true, text: offer.text };
      }
      if (!outcome || outcome.dispatched !== false) {              // 已发给播放器，或者说不清：未知，不重放，不声称成功
        offer.status = 'unknown';
        offer.text = outcome && outcome.dispatched === true ? UNKNOWN_PLAY_TEXT : LOST_PLAY_TEXT;
        note('play-unknown', { ok: false, context: 'song' });
        return { ok: true, text: offer.text };
      }
      note('play-failed', { ok: false, context: 'song' });
      if (outcome.code === 'unavailable') { offer.status = 'failed'; offer.text = UNAVAILABLE_TEXT; return { ok: false, error: offer.text }; }
      offer.status = 'idle';
      return { ok: false, error: Core.clean(outcome.message, 40) || '没能开始播放，请稍后再试' };
    }

    /** 右键菜单要的那一类：现做一条候选（brief/worklog 不看检查点与时段，tidbit/song 取没展示过的）；没有内容给文字，读不到给错误。 */
    async function manualCandidate(kind, config, date, state) {
      const day = dayKey(date);
      const urgency = Core.KINDS[kind].urgency;
      if (kind === 'brief') {
        let stats;
        try { stats = Core.taskStats(await readMemos(), day); } catch (_) { return { error: '读不到任务，请稍后再试' }; }
        const payload = Core.copy.brief(stats, config.showTitles);
        return payload ? { candidate: { kind, fp: `brief:${day}:manual`, urgency, payload } } : { text: '今天没有到期或已过期的任务' };
      }
      if (kind === 'worklog') {
        let entries;
        try { entries = await readWorklog(); } catch (_) { return { error: '工作日志提醒没开启，或暂时读不到' }; }
        return { candidate: { kind, fp: `worklog:${day}:manual`, urgency, payload: Core.copy.worklogNow(Core.loggedToday(entries, day)) } };
      }
      if (kind === 'tidbit') {
        const fresh = tidbits(state);
        return fresh.length ? { candidate: pickRandom(fresh) } : { text: '今天的小乐子都说完啦' };
      }
      if (kind === 'lark') {
        if (typeof readLark !== 'function') return { error: '飞书哨兵尚未配置' };
        let meta = null;
        try { meta = await bounded(Promise.resolve(readLark({ manual: true })), songFetchMs); } catch (_) { return { error: '飞书哨兵暂时不可用' }; }
        if (!meta || meta.ok !== true) {
          if (meta?.status === 'not_installed') return { error: '未检测到 lark-cli，请先安装' };
          if (meta?.status === 'not_logged_in') return { error: '飞书 CLI 尚未登录，请先执行 lark-cli auth login' };
          return { error: Core.clean(meta?.error, 40) || '飞书状态读取失败，请稍后再试' };
        }
        if (!(Number(meta.count) > 0)) return { text: '最近没有新的飞书 @你 消息' };
        const payload = Core.copy.lark(meta);
        return payload ? { candidate: { kind, fp: `lark:${day}:manual:${Number(meta.newestAt) || meta.count}`, urgency, payload, target: { kind: 'lark' } } } : { text: '最近没有新的飞书 @你 消息' };
      }
      if (kind === 'tabs') {
        if (typeof tabsReader !== 'function') return { error: '标签页读取不可用' };
        let tabs;
        try { tabs = await tabsReader(); } catch (_) { return { error: '读不到标签页，请稍后再试' }; }
        const stats = Core.staleTabStats(tabs, date.getTime(), { minCount: 1 });
        if (!stats) return { text: '标签页很清爽，没有超过 2 天未访问的闲置页面' };
        const payload = Core.copy.tabs(stats);
        return payload ? { candidate: { kind, fp: `tabs:${day}:manual`, urgency, payload, target: { kind: 'tabs' } } } : { text: '标签页很清爽' };
      }
      if (kind === 'watch') {
        if (typeof readWatch !== 'function') return { error: '观看进度读取不可用' };
        let items;
        try { items = Core.watchCandidates(await readWatch(), date.getTime()); } catch (_) { return { error: '读不到观看进度，请稍后再试' }; }
        const picked = items.find(item => !state.seen.includes(`watch:${item.id}`)) || items[0];
        if (!picked) return { text: '最近 7 天没有未看完的视频或课程' };
        const payload = Core.copy.watch(picked);
        return payload ? { candidate: { kind, fp: `watch:${picked.id}`, urgency, payload, target: picked.target } } : { text: '最近 7 天没有未看完的视频或课程' };
      }
      if (kind === 'bookmark') {
        if (typeof bookmarksReader !== 'function') return { error: '书签复习读取不可用' };
        let due;
        try { due = Core.dueBookmarks(await bookmarksReader(), date.getTime()); } catch (_) { return { error: '读不到书签复习队列，请稍后再试' }; }
        const picked = due.find(item => !state.seen.includes(`bookmark:${item.id}`)) || due[0];
        if (!picked) return { text: '今天没有到期的复习书签' };
        const payload = Core.copy.bookmark(picked, due.length);
        return payload ? { candidate: { kind, fp: `bookmark:${picked.id}`, urgency, payload, target: { url: picked.url, id: picked.id, title: picked.title } } } : { text: '今天没有到期的复习书签' };
      }
      const candidate = await songCandidate(state, date.getTime(), { manual: true });
      return candidate ? { candidate } : { text: '这会儿没找到可推荐的歌，稍后再试' };
    }

    /** 处理一次菜单请求（在串行队列里）。不占间隔与条数；歌曲、小乐子、继续看与书签只记内容指纹。 */
    async function handleRequest(kind) {
      const config = await readConfig();
      if (!config.enabled) return { ok: false, error: '水母差事没有开启' };
      const minVer = Math.max(Core.REQUEST_SINCE, Core.KINDS[kind]?.since || Core.REQUEST_SINCE);
      if (!(await available(minVer))) return { ok: false, error: '桌面组件还不能处理这个请求' };
      if (isBusy()) return { ok: false, error: '水母正忙着响铃，等一下再叫它' };
      const date = now();
      const nowMs = date.getTime();
      let state;
      try { state = await readState(date); } catch (_) { return { ok: false, error: '读不到今天的状态，请稍后再试' }; }
      const built = await manualCandidate(kind, config, date, state);
      if (built.error) return { ok: false, error: built.error };
      if (built.text) return { ok: true, text: built.text };
      const { accepted, id } = await deliver(built.candidate, nowMs);
      if (!accepted) { note('declined', { ok: false, context: kind }); return { ok: false, error: '水母这会儿没法开口，稍后再试' }; }
      markManual(id);
      if (kind === 'song' || kind === 'tidbit' || kind === 'watch' || kind === 'bookmark') await writeState(Core.recordSeen(state, built.candidate.fp));
      note('request', { ok: true, context: kind });
      return { ok: true };
    }

    return {
      /** 设置与当天状态（只读）。 */
      get: () => serial(async () => {
        const date = now();
        let state;
        try { state = await readState(date); } catch (_) { state = Core.emptyState(dayKey(date)); }
        return { ok: true, config: await readConfig(), state };
      }),
      /** 保存设置（规范化后）并让闹钟与之一致，然后通知 onChange（让桌面水母的右键菜单跟着开关变化）；闹钟创建失败时抛出，设置已保存，下次启动会再对一遍。 */
      set: raw => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Promise.resolve({ ok: false, error: '设置格式不正确' });
        return serial(async () => {
          const config = Core.normalize(raw);
          await syncStorage.set({ [CONFIG_KEY]: config });
          await applyAlarm(config);
          notifyChange();
          return { ok: true, config };
        });
      },
      /** 启动时调用：浏览器重启后闹钟可能没了，按设置补上。 */
      restore: () => serial(async () => applyAlarm(await readConfig())),
      /** 闹钟触发。不是本模块的闹钟返回 undefined。 */
      fire: name => (name === ALARM ? serial(() => evaluate()) : Promise.resolve(undefined)),
      /**
       * 气泡按钮（经原生 → AlarmDesktop → 这里）：open 打开页面并记为接受；later / dismiss 记一次拒绝（过期任务的“明天再说”当天静默该类）；
       * more（小乐子）/ another（歌曲）立刻再来一条；play（歌曲）交给播放器。手动要的气泡（右键菜单）不计拒绝也不记接受。
       * 返回 { ok, text|error }，不是本模块的 id、不属于该类别的动作 ok:false 且不改任何数据。
       */
      act: (id, action) => {
        const kind = parseId(id);
        const allowed = kind ? Core.KINDS[kind].buttons.map(button => button.id) : [];
        if (!kind || typeof action !== 'string' || !allowed.includes(action)) return Promise.resolve({ ok: false, error: '这条提示已失效' });
        if (action === 'play') return playOffered(id);
        return serial(async () => {
          const date = now();
          if (action === 'more' || action === 'another') {
            acted.add(id);
            const result = await evaluate({ manual: true, only: kind });
            if (result.sent) return { ok: true, text: action === 'more' ? '再来一条～' : '换一首～' };
            if (result.reason === 'idle') return { ok: false, error: action === 'more' ? '今天的都说完啦' : '今天的推荐都看完啦' };
            return { ok: false, error: action === 'more' ? '这会儿没法再来一条' : '这会儿没法再换一首' };
          }
          if (action === 'open') {
            const target = targets.get(id);
            try { await (target !== undefined ? openPage(kind, target) : openPage(kind)); } catch (_) { return { ok: false, error: '没能打开页面，请在浏览器里处理' }; }
          }
          acted.add(id);
          const text = action === 'open' ? '好，帮你打开了' : action === 'later' ? '好，晚点再说' : '好的，少说点';
          if (manualIds.has(id)) { note(action, { ok: true, context: kind }); return { ok: true, text }; }
          let state;
          // 状态读不出来时不覆盖它：动作本身（打开页面 / 不再提醒）对用户已经生效，只是这次的结果不记
          try { state = await readState(date); } catch (_) { return { ok: true, text: action === 'open' ? '好，帮你打开了' : '好的' }; }
          state = Core.recordOutcome(state, kind, action === 'open');
          if (kind === 'task' && action === 'later') state = { ...state, muted: { ...state.muted, task: true } };
          await writeState(state);
          note(action, { ok: true, context: kind });
          return { ok: true, text };
        });
      },
      /**
       * 右键菜单“水母，给我…”：用户主动要一条（brief / song / tidbit / worklog）。串行处理，同一时刻只处理一个；
       * 返回 { ok:true }（气泡已交给水母）、{ ok:true, text }（没有内容可说）或 { ok:false, error }。永不抛出。
       */
      request: async kind => {
        if (typeof kind !== 'string' || !Core.REQUEST_KINDS.includes(kind)) return { ok: false, error: '不认识这个请求' };
        if (requestBusy) return { ok: false, error: '上一个请求还在处理' };
        requestBusy = true;
        try { return await serial(() => handleRequest(kind)); }
        catch (_) { return { ok: false, error: '没能完成这个请求' }; }
        finally { requestBusy = false; }
      },
      /** 气泡自行消失（没点按钮）算一次拒绝；点过按钮的、手动要的、别的 id 都忽略。 */
      onHidden: id => {
        const kind = parseId(id);
        if (!kind || acted.has(id)) return Promise.resolve();
        acted.add(id);
        if (manualIds.has(id)) return Promise.resolve();
        return serial(async () => {
          const date = now();
          const state = await readState(date);
          await writeState(Core.recordOutcome(state, kind, false));
        }).catch(() => {});
      },
      /** 原生上报的状态：只认 active / away（或 { state, meeting }）；从 away 回到 active 开始计“刚回来”，首次报告不算。 */
      onPresence: (next, extra) => {
        const state = typeof next === 'object' && next !== null ? next.state : next;
        const meeting = typeof next === 'object' && next !== null ? next.meeting : extra?.meeting;
        if (typeof meeting === 'boolean') presence.meeting = meeting;
        if (state !== 'active' && state !== 'away') return;
        if (state === 'active' && presence.state === 'away') presence.since = now().getTime();
        if (state === 'away') presence.since = 0;
        presence.state = state;
      },
      /**
       * 已有的系统通知发送器（每日摘要、过期任务、工作日志、温情提示）到点后先问水母：差事总开关开着且该类开着、该类今天没被静默、
       * 你在电脑前（presence 不是 away）、没被别的东西占着、有内容、水母 4 秒内确认显示——才返回 { handled:true }，调用方不再发系统通知。
       * 其他任何情况（含存储/数据源出错、水母不在或太旧、没内容）都返回 { handled:false }，调用方照旧发通知，所以开启差事不会让提醒变少。
       * 不检查时段、间隔与每小时条数（那是系统通知自己的触发时机，不能因为气泡节奏而吞掉它），但展示后占用间隔与条数并记内容指纹，
       * 紧接着的定时评估不会再发同一条。晨间概览仍只在 6–11 点且一天一次。歌曲没有对应的系统通知，不接受。永不抛出。
       */
      offer: kind => serial(async () => {
        try {
          if (typeof kind !== 'string' || !OFFERABLE.includes(kind)) return { handled: false, reason: 'kind' };
          const config = await readConfig();
          if (!config.enabled) return { handled: false, reason: 'off' };
          if (Core.SWITCHABLE.includes(kind) && !config.kinds[kind]) return { handled: false, reason: 'off' };
          if (!(await available())) return { handled: false, reason: 'unavailable' };
          if (presence.state === 'away') return { handled: false, reason: 'away' };
          if (presence.meeting === true) return { handled: false, reason: 'meeting' };
          if (isBusy()) return { handled: false, reason: 'busy' };
          const date = now();
          const nowMs = date.getTime();
          const state = await readState(date);
          const picked = Core.pick((await candidates(config, date, state, { only: kind })).filter(item => item.kind === kind), state, nowMs);
          if (!picked) return { handled: false, reason: 'idle' };
          const { accepted } = await deliver(picked, nowMs);
          if (!accepted) { note('declined', { ok: false, context: kind }); return { handled: false, reason: 'declined' }; }
          await writeState(Core.recordShown(state, picked, nowMs));
          note('shown', { ok: true, context: kind });
          return { handled: true, kind };
        } catch (_) { return { handled: false, reason: 'error' }; }
      }),
      /** 喝水/起身刚发过：占用最小间隔与每小时条数。总开关关闭时不写存储。 */
      noteExternal: nowMs => serial(async () => {
        const config = await readConfig();
        if (!config.enabled) return;
        const date = now();
        const state = await readState(date);
        await writeState(Core.recordExternal(state, Number.isFinite(nowMs) ? nowMs : date.getTime()));
      }),
    };
  }

  return { create, parseId, CONFIG_KEY, STATE_KEY, ALARM, PREFIX, TICK_MIN, TTL_SEC, FALLBACK_KINDS };
});
