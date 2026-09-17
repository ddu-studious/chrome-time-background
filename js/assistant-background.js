(function (root) {
  'use strict';
  const COMMAND = 'toggle-quick-assistant';
  function install(deps) {
    const handlers = root.AssistantTools.create({ ...deps, memory: (action, body) => root.LocalAIBridge.request({ action: action === 'get' ? 'ai_memory_get' : 'ai_memory_write', body }) });
    const engine = root.AssistantEngine.create({ storage: chrome.storage.local, ...handlers, history: event => root.LocalAIBridge.request({ action: 'ai_history_write', body: { operation: 'event', event } }), cancelJob: jobId => root.LocalAIBridge.request({ action: 'ai_job_cancel', jobId }) });
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
    async function sendHome(tabId, message) {
      let timeout;
      try {
        return await Promise.race([
          chrome.runtime.sendMessage({ ...message, action: message.action.replace('assistant_overlay_', 'assistant_home_overlay_'), targetTabId: tabId }),
          new Promise(resolve => { timeout = setTimeout(() => resolve(null), message.action.endsWith('_status') ? 750 : 5000); })
        ]);
      } finally { clearTimeout(timeout); }
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
    async function open(toggle = false, preferredTab) {
      if (opening) return opening;
      opening = (async () => {
        const tab = preferredTab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (tab?.id != null && isHomeTab(tab)) {
          let status;
          try { status = await sendHome(tab.id, { action: 'assistant_overlay_status' }); } catch {}
          if (status?.home === true) {
            const all = await bindings();
            const record = all[tab.id]?.home && status.visible && status.nonce === all[tab.id].nonce ? all[tab.id] : { nonce: crypto.randomUUID(), origin: extensionOrigin, home: true };
            all[tab.id] = record; await chrome.storage.session.set({ [BINDINGS]: all });
            const url = new URL(chrome.runtime.getURL('assistant.html'));
            url.search = new URLSearchParams({ embedded: '1', nonce: record.nonce, hostOrigin: extensionOrigin }).toString();
            const result = await sendHome(tab.id, { action: 'assistant_overlay_show', url: url.href, nonce: record.nonce, toggle });
            if (result?.ok) return;
            const latest = await bindings(); if (latest[tab.id]?.nonce === record.nonce) { delete latest[tab.id]; await chrome.storage.session.set({ [BINDINGS]: latest }); }
          }
        }
        if (tab?.id != null && /^https?:\/\//.test(tab.url || '')) {
          const all = await bindings(), origin = new URL(tab.url).origin;
          let status = null;
          try { status = await chrome.tabs.sendMessage(tab.id, { action: 'assistant_overlay_status' }, { frameId: 0 }); } catch {}
          const record = all[tab.id]?.origin === origin && status?.visible && status.nonce === all[tab.id].nonce ? all[tab.id] : { nonce: crypto.randomUUID(), origin };
          all[tab.id] = record; await chrome.storage.session.set({ [BINDINGS]: all });
          const url = new URL(chrome.runtime.getURL('assistant.html'));
          url.search = new URLSearchParams({ embedded: '1', nonce: record.nonce, hostOrigin: origin }).toString();
          try {
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['js/assistant-overlay.js'] });
            const result = await chrome.tabs.sendMessage(tab.id, { action: 'assistant_overlay_show', url: url.href, nonce: record.nonce, toggle }, { frameId: 0 });
            if (result?.ok) return;
          } catch { /* Restricted frames and missing gesture grants use the extension window. */ }
          const latest = await bindings(); if (latest[tab.id]?.nonce === record.nonce) { delete latest[tab.id]; await chrome.storage.session.set({ [BINDINGS]: latest }); }
        }
        const url = chrome.runtime.getURL('assistant.html');
        const existing = (await chrome.tabs.query({ url })).find(item => item.windowId != null);
        if (existing) {
          const win = await chrome.windows.get(existing.windowId);
          if (toggle && win.focused && win.type === 'popup') { await chrome.windows.remove(win.id); return; }
          await chrome.windows.update(win.id, { focused: true }); await chrome.tabs.update(existing.id, { active: true }); return;
        }
        const origin = await chrome.windows.getLastFocused().catch(() => null);
        const width = Math.min(1060, origin?.width || 1060), height = 250;
        await chrome.windows.create({ url, type: 'popup', focused: true, width, height,
          ...(origin && Number.isInteger(origin.left) && Number.isInteger(origin.top) ? { left: origin.left + Math.max(0, Math.floor((origin.width - width) / 2)), top: origin.top + 70 } : {}) });
      })();
      try { return await opening; } finally { opening = null; }
    }
    const actions = new Set(['assistant_open', 'assistant_snapshot', 'assistant_submit', 'assistant_choose', 'assistant_cancel', 'assistant_clear', 'assistant_shortcuts', 'assistant_hide', 'assistant_resize']);
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.action === 'assistant_overlay_closed' && sender.id === chrome.runtime.id && (sender.frameId === 0 || isHomeDocument(sender.url))) {
        bindings().then(async all => {
          const tabId = sender.tab?.id ?? (isHomeDocument(sender.url) ? message.hostTabId : null);
          if (all[tabId]?.nonce === message.nonce) { delete all[tabId]; await chrome.storage.session.set({ [BINDINGS]: all }); }
          respond({ ok: true });
        }).catch(() => respond({ ok: false })); return true;
      }
      if (!actions.has(message?.action)) return;
      (async () => {
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) throw new Error('仅扩展页面可使用快捷助手');
        sender = await resolveSender(sender);
        const embedded = await authorize(sender);
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
          return { task: await engine.snapshot(), shortcut: commands.find(c => c.name === COMMAND)?.shortcut || '' };
        }
        if (message.action === 'assistant_submit') {
          return { task: await engine.submit(message.input) };
        }
        if (message.action === 'assistant_choose') return { task: await engine.choose(message.taskId, message.choiceId, message.version) };
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
