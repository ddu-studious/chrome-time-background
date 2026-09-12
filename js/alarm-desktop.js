(function (root) {
  'use strict';
  class AlarmDesktop {
    constructor(runtime, onAction) {
      this.runtime = runtime; this.onAction = onAction;
      this.port = null; this.pending = new Map(); this.sequence = 0; this.sessionId = null;
      this.handled = new Set(); this.processing = new Set(); this.idleTimer = null;
    }
    connect() {
      if (this.port) return this.port;
      const port = this.runtime.connectNative('com.timekeeper.desktop');
      this.port = port;
      port.onMessage.addListener(message => {
        const pending = this.pending.get(message.requestId);
        if (pending && message.type === 'response') {
          clearTimeout(pending.timer); this.pending.delete(message.requestId);
          message.ok ? pending.resolve(message) : pending.reject(new Error(message.error || '桌面组件请求失败'));
        }
        if (message.type === 'action') void this.handleAction(port, message);
      });
      port.onDisconnect.addListener(() => {
        const error = this.runtime.lastError?.message || '桌面提醒组件已断开';
        if (this.port !== port) return;
        this.port = null; this.sessionId = null;
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(error)); }
        this.pending.clear();
      });
      return port;
    }
    async handleAction(port, message) {
      if (port !== this.port || message.sessionId !== this.sessionId || !['dismiss', 'snooze'].includes(message.action) || typeof message.actionId !== 'string' || message.actionId.length > 100) return;
      if (this.processing.has(message.actionId)) return;
      this.processing.add(message.actionId);
      try {
        if (!this.handled.has(message.actionId)) {
          const result = await this.onAction(message);
          if (result?.ok === false) throw new Error(result.error || '操作未完成');
          this.handled.add(message.actionId);
          if (this.handled.size > 100) this.handled.delete(this.handled.values().next().value);
        }
        port.postMessage({ command: 'actionResult', sessionId: message.sessionId, actionId: message.actionId, ok: true });
      } catch (error) {
        try { port.postMessage({ command: 'actionResult', sessionId: message.sessionId, actionId: message.actionId, ok: false, error: String(error.message).slice(0, 200) }); } catch (_) {}
      } finally { this.processing.delete(message.actionId); }
    }
    request(command, payload = {}) {
      return new Promise((resolve, reject) => {
        const requestId = `desktop_${++this.sequence}`;
        const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('桌面组件未响应，请检查是否已安装')); }, 5000);
        this.pending.set(requestId, { resolve, reject, timer });
        try { this.connect().postMessage({ command, requestId, ...payload }); }
        catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
      });
    }
    async show(session) {
      clearTimeout(this.idleTimer);
      this.sessionId = session.id;
      const first = session.occurrences[0];
      try { return await this.request('show', {
        sessionId: session.id,
        title: session.occurrences.map(item => item.label).join('；').slice(0, 320),
        timeText: new Date(session.scheduledAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        canSnooze: session.occurrences.some(item => Number(item.snoozeCount || 0) < Number(item.snoozeLimit || 0)),
        snoozeMinutes: Math.max(1, Math.min(60, Number(first.snoozeMinutes) || 10))
      }); } catch (error) {
        this.port?.disconnect(); this.port = null; this.sessionId = null;
        throw error;
      }
    }
    hide(sessionId) {
      if (!this.port || (sessionId && this.sessionId !== sessionId)) return;
      const port = this.port;
      try { port.postMessage({ command: 'hide', sessionId: this.sessionId }); }
      catch (_) { this.port = null; this.sessionId = null; return; }
      this.sessionId = null;
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => { if (this.port === port && !this.sessionId) port.disconnect(); }, 2000);
    }
    async status() {
      try { return await this.request('ping'); }
      finally { if (!this.sessionId) this.hide(); }
    }
  }
  root.AlarmDesktop = AlarmDesktop;
  if (typeof module !== 'undefined') module.exports = AlarmDesktop;
})(typeof self !== 'undefined' ? self : globalThis);
