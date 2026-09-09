(function () {
  'use strict';

  function send(action, payload = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action, ...payload }, response => resolve(response || { ok: false }));
      } catch (error) {
        resolve({ ok: false, error: error?.message || '扩展 API 不可用' });
      }
    });
  }

  function render(session) {
    document.querySelector('#alarm-popup-time').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    if (!session?.occurrences?.length) {
      document.querySelector('#alarm-popup-label').textContent = '闹钟已停止';
      document.querySelector('#alarm-popup-meta').textContent = '这个窗口可以关闭了';
      document.querySelector('.alarm-ringing-actions').hidden = true;
      return;
    }
    const primary = session.occurrences[0];
    const labels = session.occurrences.map(item => item.label);
    document.querySelector('#alarm-popup-label').textContent = labels.length > 1 ? `${labels[0]}，另有 ${labels.length - 1} 个闹钟` : labels[0];
    document.querySelector('#alarm-popup-snooze-minutes').textContent = primary.snoozeMinutes || 10;
    document.querySelector('#alarm-popup-snooze').hidden = Number(primary.snoozeCount || 0) >= Number(primary.snoozeLimit || 0);
    document.querySelector('#alarm-popup-dismiss').focus();
  }

  async function load() {
    const state = await send('user_alarm_list');
    if (state.ok) render(state.runtime?.activeSession || null);
  }

  document.querySelector('#alarm-popup-dismiss').addEventListener('click', async () => {
    await send('user_alarm_dismiss');
    window.close();
  });
  document.querySelector('#alarm-popup-snooze').addEventListener('click', async () => {
    const minutes = Number(document.querySelector('#alarm-popup-snooze-minutes').textContent) || 10;
    await send('user_alarm_snooze', { minutes });
    window.close();
  });
  document.querySelector('#alarm-popup-time').textContent = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  globalThis.chrome?.runtime?.onMessage?.addListener?.(message => {
    if (message.action !== 'user_alarm_state_changed') return;
    if (!message.session) window.close();
    else render(message.session);
  });
  void load();
})();
