(function (root) {
  'use strict';
  const COMMAND = 'toggle-quick-assistant';
  function install(deps) {
    let confirmation, voice;
    const handlers = root.AssistantTools.create({ ...deps, memory: (action, body) => root.LocalAIBridge.request({ action: action === 'get' ? 'ai_memory_get' : 'ai_memory_write', body }) });
    const engine = root.AssistantEngine.create({ storage: chrome.storage.local, ...handlers, onChange: task => { confirmation?.sync(task); void voice?.onChange(task).catch(() => {}); }, history: event => root.LocalAIBridge.request({ action: 'ai_history_write', body: { operation: 'event', event } }), cancelJob: jobId => root.LocalAIBridge.request({ action: 'ai_job_cancel', jobId }) });
    voice = root.AssistantVoiceBackground?.create({ snapshot: () => engine.snapshot(), request: message => root.LocalAIBridge.request(message), storage: chrome.storage.session });
    void voice?.onChange().catch(() => {});
    if (deps.desktop && root.AssistantConfirmation) {
      confirmation = root.AssistantConfirmation.create({ desktop: deps.desktop, engine, openWorkspace: () => open(false) });
      void engine.snapshot().then(task => confirmation.sync(task)).catch(() => {});
    }
    const BINDINGS = 'quickAssistantOverlaysV1';
    let opening = null;
    async function bindings() { return (await chrome.storage.session.get(BINDINGS))[BINDINGS] || {}; }
    const homeURL = new URL(chrome.runtime.getURL('index.html'));
    const extensionOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
    function isHomeDocument(value) {
      try { const url = new URL(value); return url.protocol === homeURL.protocol && url.host === homeURL.host && url.pathname === homeURL.pathname; }
      catch { return false; }
    }
    const isHomeTab = tab => isHomeDocument(tab?.url) || tab?.url === 'chrome://newtab/';
    // 就绪的首页几毫秒内就会回应状态探测。仍在加载、主线程正忙的首页会晚到；扩展刚重载后遗留的旧页面
    // 永远不回应。只有“确实存在本扩展首页文档”时才多等，其余情况（别家新标签页、已失效页面）立即兜底。
    // 系统负载高（磁盘、安全代理、内存换页）时扩展文件读取会慢数秒，所以“慢但仍在推进”的等待要给足：
    // 状态探测最多 10 秒；展示回包最多 20 秒，必须长于宿主脚本自己的 15 秒就绪上限（宿主总是先给出带原因的回包，
    // 否则后台先放弃会出现“浮层稍后才出现、小窗已经弹出”的双重界面）。
    const HOME_STATUS_MS = 750, HOME_BUSY_STATUS_MS = 10000, HOME_SHOW_MS = 20000, HOME_HIDE_MS = 5000, HOME_RETRY_MS = 120, SLOW_OPEN_MS = 1500;
    const homeMessage = (tabId, message) => chrome.runtime.sendMessage({ ...message, action: message.action.replace('assistant_overlay_', 'assistant_home_overlay_'), targetTabId: tabId });
    function after(ms) {
      let timer;
      const promise = new Promise(resolve => { timer = setTimeout(() => resolve(null), Math.max(0, ms)); });
      return { promise, cancel: () => clearTimeout(timer) };
    }
    async function sendHome(tabId, message) {
      const wait = after(message.action.endsWith('_status') ? HOME_STATUS_MS : message.action.endsWith('_show') ? HOME_SHOW_MS : HOME_HIDE_MS);
      try { return await Promise.race([homeMessage(tabId, message), wait.promise]); } finally { wait.cancel(); }
    }
    // 宿主回包里的诊断只收固定格式（时长与状态位），其余整条丢弃，不能让页面侧的内容进入扩展日志。
    const DIAG_FORMAT = /^wait=\d{1,6};load=(?:none|\+\d{1,6});vis=[a-z]{1,10};focus=[01]$/;
    const diagOf = result => (typeof result?.diag === 'string' && DIAG_FORMAT.test(result.diag) ? result.diag : '');
    const record = (action, detail) => { try { deps.log?.('system', action, detail); } catch { /* 日志不能影响助手入口 */ } };
    // 只在输入条真的就绪、且耗时明显偏长时记录：这类“慢但成功”的打开平时看不见，却是判断环境负载的直接证据。
    // error 字段带宿主就绪时的诊断（wait 是展示到就绪、load 是 iframe 加载），能区分“文件读得慢”和“页面脚本慢”。
    const noteOpened = (result, kind, startedAt) => {
      const durationMs = Date.now() - startedAt;
      if (result?.ready === true && durationMs >= SLOW_OPEN_MS) record('assistant-slow-open', { ok: true, durationMs, context: kind, ...(diagOf(result) ? { error: diagOf(result) } : {}) });
    };
    // 把 Chrome 抛出的报错归入固定类别再写日志：原文含网址与标签页编号，不能原样进日志；类别已足以区分“页面不让注入”和“我们自己出错”。
    // 文案来自真实 Chromium 151 逐类页面实测与 Chromium 源码里的固定报错；认不出的归为 other（按失败记录）。
    const ERROR_KINDS = [
      ['error-page', /showing error page|chrome-error:/i],
      ['webstore', /extensions gallery|chrome web store/i],
      ['policy', /ExtensionsSettings policy|blocked by (the )?(administrator|enterprise|policy)/i],
      ['no-access', /cannot access (contents of|a [a-z-]+:)|must request permission|missing host permission|cannot be scripted|not allowed to access/i],
      ['frame-gone', /no frame with id|frame with id \d+ was removed|no tab with id|tab was closed|tabs cannot be edited/i],
      ['no-receiver', /receiving end does not exist|could not establish connection/i],
      ['port-closed', /message port closed/i],
      ['host-error', /^uncaught /i]
    ];
    // 页面本身不允许或已不存在：预期兜底，不算异常。其余（接收端缺失、宿主脚本报错、认不出的错误）按失败记录。
    const EXPECTED_KINDS = new Set(['error-page', 'webstore', 'policy', 'no-access', 'frame-gone']);
    const EXPECTED_FALLBACKS = new Set(['page-unsupported-document', 'page-opaque-origin']);
    const PAGE_REASONS = { 'ready-timeout': 'page-ready-timeout', 'unsupported-document': 'page-unsupported-document', 'opaque-origin': 'page-opaque-origin' };
    const kindOf = error => { const text = String(error?.message ?? error ?? ''); return ERROR_KINDS.find(([, pattern]) => pattern.test(text))?.[0] || 'other'; };
    // 标签页与窗口状态只取固定白名单内的值（加载中、被丢弃、应用窗口等会改变注入是否可行），窗口查询最多等 1 秒。
    const TAB_STATES = new Set(['loading', 'complete', 'unloaded']), WINDOW_TYPES = new Set(['normal', 'popup', 'app', 'devtools', 'app_popup']), WINDOW_LOOKUP_MS = 1000;
    async function describe(stage, kind, tab) {
      let windowType = '';
      if (tab?.windowId != null) {
        const wait = after(WINDOW_LOOKUP_MS);
        try { windowType = (await Promise.race([chrome.windows.get(tab.windowId), wait.promise]))?.type; } catch { /* 只是诊断，拿不到就留空 */ } finally { wait.cancel(); }
      }
      return `${stage}:${kind};tab=${TAB_STATES.has(tab?.status) ? tab.status : 'unknown'};disc=${tab?.discarded === true ? 1 : 0};win=${WINDOW_TYPES.has(windowType) ? windowType : 'unknown'}`;
    }
    async function hasHomeDocument(tabId) {
      try {
        const contexts = await chrome.runtime.getContexts({ tabIds: [tabId], contextTypes: ['TAB'] });
        return contexts.some(item => (item.frameId ?? 0) === 0 && isHomeDocument(item.documentUrl));
      } catch { return false; }
    }
    async function probeHome(tabId) {
      const started = Date.now();
      let live = false;
      for (;;) {
        const wait = after(started + (live ? HOME_BUSY_STATUS_MS : HOME_STATUS_MS) - Date.now());
        let status = null;
        // 没有接收者时 sendMessage 会立刻拒绝：页面还没跑到注册监听的那一行，或根本不是我们的页面。
        try { status = await Promise.race([homeMessage(tabId, { action: 'assistant_overlay_status' }), wait.promise]); } catch { /* 暂无接收者 */ } finally { wait.cancel(); }
        if (status?.home === true) return { status };
        if (!live) live = await hasHomeDocument(tabId);
        const waitedMs = Date.now() - started;
        if (!live || waitedMs >= HOME_BUSY_STATUS_MS) return { status: null, reason: live ? 'home-no-reply' : 'home-no-document', waitedMs };
        await new Promise(resolve => setTimeout(resolve, HOME_RETRY_MS));
      }
    }
    async function resolveSender(sender) {
      // Extension iframe messages do not always include sender.tab. Resolve only this
      // authenticated extension document, rather than guessing the currently active tab.
      if (sender.tab?.id != null || !sender.documentId || !chrome.runtime.getContexts) return sender;
      const contexts = await chrome.runtime.getContexts({ documentIds: [sender.documentId] });
      const context = contexts.find(item => item.documentId === sender.documentId);
      if (context?.tabId == null || context.tabId < 0) return sender;
      return { ...sender, tab: await chrome.tabs.get(context.tabId), frameId: context.frameId ?? sender.frameId };
    }
    async function authorize(sender) {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('仅扩展页面可使用快捷助手');
      const url = new URL(sender.url);
      if (url.searchParams.get('embedded') === '1' || sender.frameId > 0) {
        const record = (await bindings())[sender.tab?.id];
        const validHost = record && (record.home ? isHomeTab(sender.tab) : new URL(sender.tab.url).origin === record.origin);
        if (url.pathname !== '/assistant.html' || url.searchParams.get('embedded') !== '1' || !record || !Number.isInteger(sender.frameId) || sender.frameId <= 0 || record.nonce !== url.searchParams.get('nonce') || !validHost) throw new Error('输入条未由当前页面的快捷键唤出');
        if (record.frameId != null && record.frameId !== sender.frameId) throw new Error('输入条来源已失效');
        if (record.frameId == null) { const all = await bindings(); all[sender.tab.id] = { ...record, frameId: sender.frameId }; await chrome.storage.session.set({ [BINDINGS]: all }); }
        return record;
      }
      return null;
    }
    // 首页：经消息通道让首页自己的宿主脚本展示。成功返回 true；失败把原因写进 state 并清除绑定。
    async function tryHome(tab, toggle, startedAt, state) {
      const probe = await probeHome(tab.id), status = probe.status;
      if (status?.home !== true) { state.fallback = probe.reason || 'home-no-reply'; return false; }
      const all = await bindings();
      const record = all[tab.id]?.home && status.visible && status.nonce === all[tab.id].nonce ? all[tab.id] : { nonce: crypto.randomUUID(), origin: extensionOrigin, home: true };
      all[tab.id] = record; await chrome.storage.session.set({ [BINDINGS]: all });
      const url = new URL(chrome.runtime.getURL('assistant.html'));
      url.search = new URLSearchParams({ embedded: '1', nonce: record.nonce, hostOrigin: extensionOrigin }).toString();
      // 被拒绝（页面刚失效、上下文失效等）与无回应一样要兜底，不能让异常逃出入口、什么界面都没有。
      let result = null;
      try { result = await sendHome(tab.id, { action: 'assistant_overlay_show', url: url.href, nonce: record.nonce, toggle }); } catch { /* 按无回应处理 */ }
      if (result?.ok) { noteOpened(result, 'home', startedAt); return true; }
      state.fallback = result?.reason === 'ready-timeout' ? 'home-ready-timeout' : result == null ? 'home-show-no-reply' : 'home-show-refused'; state.diag = diagOf(result);
      const latest = await bindings(); if (latest[tab.id]?.nonce === record.nonce) { delete latest[tab.id]; await chrome.storage.session.set({ [BINDINGS]: latest }); }
      return false;
    }
    // 普通网页：顶层注入宿主脚本，再展示绑定了来源与令牌的扩展 iframe。
    async function tryPage(tab, toggle, startedAt, state) {
      const all = await bindings(), origin = new URL(tab.url).origin;
      let status = null;
      try { status = await chrome.tabs.sendMessage(tab.id, { action: 'assistant_overlay_status' }, { frameId: 0 }); } catch {}
      const record = all[tab.id]?.origin === origin && status?.visible && status.nonce === all[tab.id].nonce ? all[tab.id] : { nonce: crypto.randomUUID(), origin };
      all[tab.id] = record; await chrome.storage.session.set({ [BINDINGS]: all });
      const url = new URL(chrome.runtime.getURL('assistant.html'));
      url.search = new URLSearchParams({ embedded: '1', nonce: record.nonce, hostOrigin: origin }).toString();
      let stage = 'inject';
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/assistant-overlay.js'] });
        stage = 'show';
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'assistant_overlay_show', url: url.href, nonce: record.nonce, toggle }, { frameId: 0 });
        if (result?.ok) { noteOpened(result, 'page', startedAt); return true; }
        state.fallback = PAGE_REASONS[result?.reason] || 'page-show-refused'; state.diag = diagOf(result);
      } catch (error) {
        // 受限页面、错误页、缺少手势授权、宿主脚本报错都会落到这里。只记固定类别，不记报错原文（含网址）。
        const kind = kindOf(error);
        state.fallback = 'page-overlay-unavailable'; state.expected = EXPECTED_KINDS.has(kind); state.diag = await describe(stage, kind, tab);
      }
      const latest = await bindings(); if (latest[tab.id]?.nonce === record.nonce) { delete latest[tab.id]; await chrome.storage.session.set({ [BINDINGS]: latest }); }
      return false;
    }
    async function open(toggle = false, preferredTab) {
      if (opening) return opening;
      opening = (async () => {
        const tab = preferredTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        // 记录为什么没能用页内浮层而改开独立小窗，方便事后核对；受限页面本来就走小窗，不算异常。
        const startedAt = Date.now(), state = { fallback: '', diag: '', expected: false };
        try {
          if (tab?.id != null && isHomeTab(tab) && await tryHome(tab, toggle, startedAt, state)) return;
          if (tab?.id != null && /^https?:\/\//.test(tab.url || '') && await tryPage(tab, toggle, startedAt, state)) return;
        } catch (error) {
          // 意料之外的异常（会话存储拒绝写入、标签页突然消失……）也必须有界面可用：宁可开小窗，也不能让快捷键什么都不发生。
          // 已经有明确失败原因时保留原因，只补记不了的那一步。
          if (!state.fallback) { state.fallback = 'overlay-error'; state.diag = await describe('open', kindOf(error), tab); }
        }
        const { fallback, diag } = state;
        const url = chrome.runtime.getURL('assistant.html');
        const existing = (await chrome.tabs.query({ url })).find(item => item.windowId != null);
        if (existing) {
          const win = await chrome.windows.get(existing.windowId);
          if (toggle && win.focused && win.type === 'popup') { await chrome.windows.remove(win.id); return; }
          await chrome.windows.update(win.id, { focused: true }); await chrome.tabs.update(existing.id, { active: true }); return;
        }
        // 页内浮层本该可用却改开了小窗（首页无回应、就绪超时等）记为失败；受限页面的预期兜底记为成功。
        // error 字段带宿主诊断（wait/load/vis/focus），下次再出现就能直接区分“文件没读到”与“页面脚本卡住”。
        record('assistant-popup', { ok: !fallback || EXPECTED_FALLBACKS.has(fallback) || (fallback === 'page-overlay-unavailable' && state.expected), durationMs: Date.now() - startedAt, context: fallback || 'unsupported-page', ...(diag ? { error: diag } : {}) });
        const origin = await chrome.windows.getLastFocused().catch(() => null);
        const width = Math.min(1060, origin?.width || 1060), height = 250;
        await chrome.windows.create({ url, type: 'popup', focused: true, width, height,
          ...(origin && Number.isInteger(origin.left) && Number.isInteger(origin.top) ? { left: origin.left + Math.max(0, Math.floor((origin.width - width) / 2)), top: origin.top + 70 } : {}) });
      })();
      try { return await opening; } finally { opening = null; }
    }
    const actions = new Set(['assistant_open', 'assistant_snapshot', 'assistant_submit', 'assistant_choose', 'assistant_cancel', 'assistant_compact', 'assistant_clear', 'assistant_shortcuts', 'assistant_hide', 'assistant_resize', 'assistant_voice_synthesize', 'assistant_voice_result', 'assistant_voice_cancel']);
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.action === 'assistant_overlay_closed' && sender.id === chrome.runtime.id && (sender.frameId === 0 || isHomeDocument(sender.url))) {
        bindings().then(async all => {
          const tabId = sender.tab?.id ?? (isHomeDocument(sender.url) ? message.hostTabId : null);
          if (all[tabId]?.nonce === message.nonce) { await voice?.cancelOwner(`overlay:${tabId}:${message.nonce}`); delete all[tabId]; await chrome.storage.session.set({ [BINDINGS]: all }); }
          respond({ ok: true });
        }).catch(() => respond({ ok: false })); return true;
      }
      if (!actions.has(message?.action)) return;
      (async () => {
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('仅扩展页面可使用快捷助手');
        sender = await resolveSender(sender);
        const embedded = await authorize(sender);
        if (message.action.startsWith('assistant_voice_') && !embedded && !sender.documentId && sender.tab?.id == null) throw new Error('语音页面来源无法核验，请重新打开工作台');
        const voiceOwner = embedded ? `overlay:${sender.tab.id}:${embedded.nonce}` : sender.documentId ? `document:${sender.documentId}` : `page:${sender.tab?.id ?? 'none'}:${sender.frameId ?? 0}:${sender.url}`;
        if (message.action.startsWith('assistant_voice_')) {
          if (new URL(sender.url).pathname !== '/assistant.html' || !voice) throw new Error('请在 AI 工作台使用回答朗读');
          return voice.handle(message, voiceOwner);
        }
        if (message.action === 'assistant_open') { await open(false, sender.tab); return {}; }
        if (message.action === 'assistant_shortcuts') { await chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }); return {}; }
        if (message.action === 'assistant_resize') {
          if (embedded) return {};
          if (new URL(sender.url).pathname !== '/assistant.html' || sender.tab?.windowId == null || !Number.isFinite(message.height)) throw new Error('输入窗口尺寸无效');
          const win = await chrome.windows.get(sender.tab.windowId);
          if (win.type === 'popup') await chrome.windows.update(win.id, { height: Math.max(160, Math.min(650, Math.ceil(message.height))) });
          return {};
        }
        if (message.action === 'assistant_hide') {
          await voice?.cancelOwner(voiceOwner);
          if (embedded) {
            const message = { action: 'assistant_overlay_hide', nonce: embedded.nonce };
            if (embedded.home) await sendHome(sender.tab.id, message);
            else await chrome.tabs.sendMessage(sender.tab.id, message, { frameId: 0 });
            return {};
          }
          if (sender.tab?.id == null || sender.url !== chrome.runtime.getURL('assistant.html')) throw new Error('输入窗口无效');
          const win = await chrome.windows.get(sender.tab.windowId);
          if (win.type === 'popup') await chrome.windows.remove(win.id); else await chrome.tabs.remove(sender.tab.id);
          return {};
        }
        if (message.action === 'assistant_snapshot') {
          const commands = await chrome.commands.getAll();
          const task = await engine.snapshot();
          return { task: task ? { ...task, desktopNotice: confirmation?.notice() || '' } : null, shortcut: commands.find(c => c.name === COMMAND)?.shortcut || '' };
        }
        if (message.action === 'assistant_submit') {
          return { task: await engine.submit(message.input) };
        }
        if (message.action === 'assistant_choose') return { task: await engine.choose(message.taskId, message.choiceId, message.version) };
        if (message.action === 'assistant_compact') return { task: await engine.compact(message.taskId) };
        if (message.action === 'assistant_cancel') return { task: await engine.cancel(message.taskId) };
        return { task: await engine.clear() };
      })().then(result => respond({ ok: true, ...result })).catch(error => respond({ ok: false, error: error.message }));
      return true;
    });
    // A lightweight status request also keeps active UI sessions connected to the worker.
    return { open, engine };
  }
  root.QuickAssistant = { install, COMMAND };
})(globalThis);
