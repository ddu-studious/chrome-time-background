(function () {
  'use strict';
  // “已初始化”标记放在文件末尾、全部监听注册完成之后：初始化中途抛异常时不留下标记，下一次注入会重新来过，
  // 而不是让这一页永远提前返回、永远没有接收端（后台表现为“接收端不存在”，直到用户刷新页面）。
  if (globalThis.__quickAssistantOverlay) return;
  const stale = document.getElementById('quick-assistant-overlay');
  if (stale?.dataset.extension === chrome.runtime.id) stale.remove();
  const resource = new URL(chrome.runtime.getURL('assistant.html'));
  const homeURL = new URL(chrome.runtime.getURL('index.html'));
  const home = Boolean(chrome.tabs?.getCurrent && (document.currentScript?.dataset.assistantHome === 'true'
    || (globalThis.location && location.protocol === homeURL.protocol && location.host === homeURL.host && location.pathname === homeURL.pathname)));
  let homeTabId;
  const homeTab = home ? chrome.tabs.getCurrent().then(tab => { homeTabId = tab?.id; return tab; }) : Promise.resolve(null);
  let host, frame, mainSurface, todoSurface, nonce, previous, ready, timeout, notice, noticeTimer, shownAt = 0, loadedAt = 0;
  // 就绪等待。系统负载高、磁盘或安全代理拖慢扩展文件读取时，iframe 文档会晚到几秒，而页面主线程并没有卡住；
  // 旧的 4 秒上限在这种情况下反复误判为失败并改开独立小窗（真实日志 home-ready-timeout 4008ms/4142ms，
  // 小窗要读的是同一批文件，只会更慢）。所以上限放宽到 15 秒，超过 400ms 先给“正在载入”反馈。
  const READY_MAX_MS = 15000, NOTICE_DELAY_MS = 400;
  const assistantOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  function focusAssistant() {
    if (!frame) return;
    frame.focus();
    frame.contentWindow?.postMessage({ type: 'assistant_focus', nonce }, assistantOrigin);
  }
  // 只含时长与状态位，不含地址、nonce 或页面文字；后台按固定格式校验后才写入日志。
  // load=none 表示 iframe 文档始终没加载完（文件读取慢）；load=+N 表示已加载却没发就绪（页面脚本或存储慢）。
  const diagnose = () => `wait=${Math.max(0, Date.now() - shownAt)};load=${loadedAt ? `+${Math.max(0, loadedAt - shownAt)}` : 'none'};vis=${document.visibilityState === 'hidden' ? 'hidden' : 'visible'};focus=${document.hasFocus?.() ? 1 : 0}`;
  function showNotice(shadow) {
    if (!host?.isConnected || notice) return;
    notice = document.createElement('div');
    notice.textContent = '快捷助手正在载入…';
    notice.style.cssText = 'position:absolute;top:0;left:0;right:0;height:64px;box-sizing:border-box;display:flex;align-items:center;padding:0 24px;border-radius:20px;background:rgba(246,248,255,.78);-webkit-backdrop-filter:blur(28px) saturate(135%);backdrop-filter:blur(28px) saturate(135%);box-shadow:0 10px 32px #141d3d38;color:#42506f;font:600 14px/1 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;pointer-events:none;';
    notice.animate?.([{ opacity: .6 }, { opacity: 1 }], { duration: 900, iterations: Infinity, direction: 'alternate' });
    shadow.append(notice);
  }
  function hide(restore = true, dismissed = true, reason, diag) {
    if (!host) return;
    const token = nonce;
    frame?.contentWindow?.postMessage?.({ type: 'assistant_host_hide', nonce }, assistantOrigin);
    host.remove(); host = frame = mainSurface = todoSurface = notice = null; clearTimeout(timeout); clearTimeout(noticeTimer);
    // reason 只描述“为何没有成功”，让后台日志区分就绪超时与其他拒绝；不影响 ok 语义。
    ready?.({ ok: dismissed, ...(reason ? { reason } : {}), ...(diag ? { diag } : {}) }); ready = null;
    chrome.runtime.sendMessage({ action: 'assistant_overlay_closed', nonce: token, ...(home ? { hostTabId: homeTabId } : {}) }).catch(() => {});
    if (restore && previous?.isConnected) previous.focus({ preventScroll: true });
  }
  function handle(message, respond) {
    if (message.action === 'assistant_overlay_status') { respond({ visible: Boolean(host?.isConnected), nonce, home }); return; }
    if (message.action === 'assistant_overlay_hide' && message.nonce === nonce) { hide(); respond({ ok: true }); return; }
    if (message.action !== 'assistant_overlay_show') return;
    const target = new URL(message.url);
    if ((target.protocol !== resource.protocol || target.host !== resource.host) || target.pathname !== resource.pathname || target.searchParams.get('nonce') !== message.nonce) { respond({ ok: false }); return; }
    if (host?.isConnected) {
      if (message.toggle) hide(); else focusAssistant();
      respond({ ok: true }); return;
    }
    // 页内浮层只能挂在“源可投递消息”的 HTML 文档里。真实 Chromium 151 逐类页面实测：
    //  · CSP sandbox 页面的源是 "null"，iframe 按页面源投递的就绪消息会被浏览器丢弃，用户白等 15 秒才弹小窗；
    //  · XML / SVG 文档里 createElement('div') 得到的不是 HTML 元素（没有 style / dataset），旧代码在这里抛异常，
    //    约 3ms 后表现为后台的“接收端不存在”。
    // 两者都在写入任何状态之前立即给出明确原因，后台直接改开小窗并记录原因。
    if (globalThis.origin === 'null') { respond({ ok: false, reason: 'opaque-origin' }); return; }
    const element = document.createElement('div');
    if (!element.style || !element.dataset) { respond({ ok: false, reason: 'unsupported-document' }); return; }
    nonce = message.nonce; previous = document.activeElement;
    host = element; host.id = 'quick-assistant-overlay'; host.dataset.extension = chrome.runtime.id;
    host.style.cssText = 'position:fixed;top:min(10vh,72px);left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 24px));z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const surface = () => {
      const element = document.createElement('div');
      element.style.cssText = 'position:absolute;display:none;pointer-events:none;-webkit-backdrop-filter:blur(28px) saturate(135%);backdrop-filter:blur(28px) saturate(135%);box-shadow:0 10px 32px #141d3d38;';
      return element;
    };
    mainSurface = surface(); todoSurface = surface();
    target.searchParams.set('maxResultsHeight', String(Math.max(80, Math.min(420, innerHeight - 260))));
    target.searchParams.set('maxPanelHeight', String(Math.max(90, innerHeight - 130)));
    frame = document.createElement('iframe'); frame.src = target.href; frame.title = '快捷助手'; frame.referrerPolicy = 'no-referrer';
    frame.allow = `microphone ${assistantOrigin}; autoplay ${assistantOrigin}`;
    frame.style.cssText = 'position:relative;display:block;width:100%;height:160px;max-height:calc(100vh - 130px);border:0;background:transparent;color-scheme:light;pointer-events:auto;';
    shadow.append(mainSurface, todoSurface, frame); document.documentElement.append(host);
    ready = respond; shownAt = Date.now(); loadedAt = 0;
    frame.addEventListener?.('load', () => { if (!loadedAt) loadedAt = Date.now(); });
    // 提示只在 400ms 后才出现，正常就绪（约 100ms）时用户看不到；不拦截点击，就绪或收起时立即移除。
    noticeTimer = setTimeout(() => showNotice(shadow), NOTICE_DELAY_MS);
    timeout = setTimeout(() => hide(false, false, 'ready-timeout', diagnose()), READY_MAX_MS);
    return true;
  }
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== assistantOrigin || event.data?.nonce !== nonce) return;
    // ready:true 说明输入条真的就绪了（用户主动收起的回包没有它），后台据此才记录“慢打开”。
    // diag 让后台的“慢打开”记录能分出 iframe 加载（load）与页面脚本就绪（wait）各占多少。
    if (event.data.type === 'assistant_ready') { clearTimeout(timeout); clearTimeout(noticeTimer); notice?.remove(); notice = null; ready?.({ ok: true, ready: true, diag: diagnose() }); ready = null; focusAssistant(); }
    if (event.data.type === 'assistant_resize' && Number.isFinite(event.data.height)) {
      frame.style.height = Math.max(90, Math.min(innerHeight - 130, event.data.height)) + 'px';
      // Only fixed presentation states can enlarge the trusted iframe.
      const dockWidth = event.data.todoDock === 'open' ? 262 : event.data.todoDock === 'collapsed' ? 48 : 0;
      host.style.width = `min(${(event.data.expanded === true ? 1060 : 760) + dockWidth}px,calc(100vw - 24px))`;
      const width = frame.clientWidth, height = frame.clientHeight;
      function place(element, rect, radius) {
        if (!rect || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(rect[key])) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) { element.style.display = 'none'; return ''; }
        const x = Math.min(width, Math.round(rect.x)), y = Math.min(height, Math.round(rect.y));
        const right = Math.min(width, Math.round(rect.x + rect.width)), bottom = Math.min(height, Math.round(rect.y + rect.height));
        if (!(right > x && bottom > y)) { element.style.display = 'none'; return ''; }
        Object.assign(element.style, { display: 'block', left: `${x}px`, top: `${y}px`, width: `${right - x}px`, height: `${bottom - y}px`, borderRadius: `${radius}px` });
        return `M ${x} ${y} H ${right} V ${bottom} H ${x} Z`;
      }
      // Frost and hit testing follow the two real cards, never their large
      // bounding rectangle. Only finite, clamped geometry crosses this bridge.
      const surfaces = event.data.surfaces;
      const main = place(mainSurface, surfaces?.main || { x: 0, y: 0, width: width - dockWidth, height }, 20);
      const todo = place(todoSurface, dockWidth ? surfaces?.todo : null, event.data.todoDock === 'collapsed' ? 11 : 14);
      frame.style.clipPath = main ? `path("${[main, todo].filter(Boolean).join(' ')}")` : '';
    }
  });
  window.addEventListener('resize', () => { if (frame) frame.contentWindow.postMessage({ type: 'assistant_host_size', nonce, height: Math.max(80, Math.min(420, innerHeight - 260)), panelHeight: Math.max(90, innerHeight - 130) }, assistantOrigin); });
  document.addEventListener('pointerdown', event => { if (host && !event.composedPath().includes(host)) hide(false); }, true);
  document.addEventListener('keydown', event => { if (host && event.key === 'Escape' && !event.isComposing) { event.preventDefault(); hide(); } }, true);
  // 接收消息的监听最后注册：前面任何一步抛异常都不会遗留一个半初始化的接收端。
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.action?.startsWith('assistant_home_overlay_')) {
      if (!home) return;
      homeTab.then(tab => {
        if (tab?.id === message.targetTabId) handle({ ...message, action: message.action.replace('assistant_home_overlay_', 'assistant_overlay_') }, respond);
      }).catch(() => {});
      return true;
    }
    if (home) return;
    return handle(message, respond);
  });
  globalThis.__quickAssistantOverlay = true;
})();
