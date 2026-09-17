(function () {
  'use strict';
  const open = () => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action: 'assistant_open' }, response => {
    if (chrome.runtime.lastError || !response?.ok) reject(new Error(response?.error || '输入窗口未打开')); else resolve();
  }));
  window.quickAssistantLauncher = Object.freeze({ open });
  function bind() {
    const button = document.getElementById('assistant-dock-btn');
    if (!button || button.dataset.assistantBound) return;
    button.dataset.assistantBound = 'true';
    button.addEventListener('click', event => { event.stopPropagation(); open().catch(error => console.warn('[QuickAssistant]', error.message)); });
  }
  bind(); new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
})();
