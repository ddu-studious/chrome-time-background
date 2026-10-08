(function () {
  'use strict';
  if (globalThis.__quickAssistantOverlay) return;
  globalThis.__quickAssistantOverlay = true;
  const stale = document.getElementById('quick-assistant-overlay');
  if (stale?.dataset.extension === chrome.runtime.id) stale.remove();
  const resource = new URL(chrome.runtime.getURL('assistant.html'));
  const homeURL = new URL(chrome.runtime.getURL('index.html'));
  const home = Boolean(chrome.tabs?.getCurrent && (document.currentScript?.dataset.assistantHome === 'true'
    || (globalThis.location && location.protocol === homeURL.protocol && location.host === homeURL.host && location.pathname === homeURL.pathname)));
  let homeTabId;
  const homeTab = home ? chrome.tabs.getCurrent().then(tab => { homeTabId = tab?.id; return tab; }) : Promise.resolve(null);
  let host, frame, mainSurface, todoSurface, nonce, previous, ready, timeout;
  const assistantOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  function focusAssistant() {
    if (!frame) return;
    frame.focus();
    frame.contentWindow?.postMessage({ type: 'assistant_focus', nonce }, assistantOrigin);
  }
  function hide(restore = true, dismissed = true) {
    if (!host) return;
    const token = nonce;
    frame?.contentWindow?.postMessage?.({ type: 'assistant_host_hide', nonce }, assistantOrigin);
    host.remove(); host = frame = mainSurface = todoSurface = null; clearTimeout(timeout);
    ready?.({ ok: dismissed }); ready = null;
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
    nonce = message.nonce; previous = document.activeElement;
    host = document.createElement('div'); host.id = 'quick-assistant-overlay'; host.dataset.extension = chrome.runtime.id;
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
    ready = respond;
    timeout = setTimeout(() => hide(false, false), 4000);
    return true;
  }
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
  window.addEventListener('message', event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== assistantOrigin || event.data?.nonce !== nonce) return;
    if (event.data.type === 'assistant_ready') { clearTimeout(timeout); ready?.({ ok: true }); ready = null; focusAssistant(); }
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
})();
