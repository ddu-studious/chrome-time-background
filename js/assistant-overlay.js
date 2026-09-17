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
  let host, frame, nonce, previous, ready, timeout;
  const assistantOrigin = chrome.runtime.getURL('').replace(/\/$/, '');
  function focusAssistant() {
    if (!frame) return;
    frame.focus();
    frame.contentWindow?.postMessage({ type: 'assistant_focus', nonce }, assistantOrigin);
  }
  function hide(restore = true, dismissed = true) {
    if (!host) return;
    const token = nonce;
    host.remove(); host = frame = null; clearTimeout(timeout);
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
    host.style.cssText = 'position:fixed;top:min(10vh,72px);left:50%;transform:translateX(-50%);width:min(760px,calc(100vw - 24px));z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    target.searchParams.set('maxResultsHeight', String(Math.max(80, Math.min(420, innerHeight - 260))));
    frame = document.createElement('iframe'); frame.src = target.href; frame.title = '快捷助手'; frame.referrerPolicy = 'no-referrer';
    frame.style.cssText = 'display:block;width:100%;height:160px;max-height:calc(100vh - 130px);border:0;border-radius:16px;background:transparent;box-shadow:0 12px 36px #0005;';
    shadow.append(frame); document.documentElement.append(host);
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
      host.style.width = `min(${event.data.expanded === true ? 1060 : 760}px,calc(100vw - 24px))`;
    }
  });
  window.addEventListener('resize', () => { if (frame) frame.contentWindow.postMessage({ type: 'assistant_host_size', nonce, height: Math.max(80, Math.min(420, innerHeight - 260)) }, assistantOrigin); });
  document.addEventListener('pointerdown', event => { if (host && !event.composedPath().includes(host)) hide(false); }, true);
  document.addEventListener('keydown', event => { if (host && event.key === 'Escape' && !event.isComposing) { event.preventDefault(); hide(); } }, true);
})();
