(function (root) {
  'use strict';
  class AlarmDesktop {
    constructor(runtime, onAction) {
      this.runtime = runtime; this.onAction = onAction;
      this.port = null; this.pending = new Map(); this.sequence = 0; this.sessionId = null;
      this.handled = new Set(); this.processing = new Set(); this.idleTimer = null;
      this.countdownId = null; this.onCountdownHidden = null;
      this.confirmationId = null; this.onConfirmationAction = null; this.onConfirmationHidden = null; this.onConfirmationDisconnect = null;
      this.confirmationHandled = new Set(); this.confirmationProcessing = new Set();
    }
    connect() {
      if (this.port) return this.port;
      const port = this.runtime.connectNative('com.timekeeper.desktop');
      this.port = port;
      port.onMessage.addListener(message => {
        if (port !== this.port) return;
        const pending = this.pending.get(message.requestId);
        if (pending && message.type === 'response') {
          clearTimeout(pending.timer); this.pending.delete(message.requestId);
          message.ok ? pending.resolve(message) : pending.reject(new Error(message.error || '桌面组件请求失败'));
        }
        if (message.type === 'action') void this.handleAction(port, message);
        if (message.type === 'confirmationAction') void this.handleConfirmationAction(port, message);
        if (port === this.port && message.type === 'confirmationHidden' && message.confirmationId === this.confirmationId) {
          this.confirmationId = null;
          Promise.resolve(this.onConfirmationHidden?.(message.confirmationId)).catch(() => {});
          this.releaseWhenIdle();
        }
        if (port === this.port && message.type === 'countdownHidden' && this.countdownId && message.id === this.countdownId) {
          this.countdownId = null;
          Promise.resolve(this.onCountdownHidden?.()).catch(() => {});
          this.releaseWhenIdle();
        }
      });
      port.onDisconnect.addListener(() => {
        const error = this.runtime.lastError?.message || '桌面提醒组件已断开';
        this.releasePort(port, new Error(error));
      });
      return port;
    }
    releasePort(port, error, { disconnect = false, notify = true } = {}) {
      if (!port || this.port !== port) return;
      // Chrome does not emit onDisconnect on the end that calls disconnect().
      this.port = null; this.sessionId = null; this.countdownId = null; this.confirmationId = null;
      clearTimeout(this.idleTimer); this.idleTimer = null;
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error || new Error('桌面提醒组件已断开')); }
      this.pending.clear();
      if (disconnect) { try { port.disconnect(); } catch (_) {} }
      if (notify) { try { this.onConfirmationDisconnect?.(); } catch (_) {} }
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
    async handleConfirmationAction(port, message) {
      if (port !== this.port || typeof message.actionId !== 'string' || !message.actionId || message.actionId.length > 100) return;
      const key = `${message.confirmationId}:${message.actionId}`;
      if (this.confirmationProcessing.has(key)) return;
      this.confirmationProcessing.add(key);
      try {
        if (!this.confirmationHandled.has(key)) {
          if (!this.confirmationId || message.confirmationId !== this.confirmationId || !['confirm', 'select', 'reply', 'cancel', 'open'].includes(message.action) || !this.onConfirmationAction) throw new Error('确认卡已失效，请查看工作台');
          const result = await this.onConfirmationAction(message);
          if (result?.ok !== true) throw new Error(result?.error || 'Chrome 未接受该操作');
          this.confirmationHandled.add(key);
          if (this.confirmationHandled.size > 100) this.confirmationHandled.delete(this.confirmationHandled.values().next().value);
        }
        port.postMessage({ command: 'confirmationResult', confirmationId: message.confirmationId, actionId: message.actionId, ok: true });
      } catch (error) {
        try { port.postMessage({ command: 'confirmationResult', confirmationId: message.confirmationId, actionId: message.actionId, ok: false, error: String(error.message).slice(0, 200) }); } catch (_) {}
      } finally { this.confirmationProcessing.delete(key); }
    }
    async setConfirmation(card) {
      clearTimeout(this.idleTimer);
      if (!card && !this.port) { this.confirmationId = null; return; }
      this.confirmationId = card?.id || null;
      try {
        const minimumVersion = card?.protocolVersion >= 4 ? 4 : 3;
        if (card && minimumVersion === 4) {
          const status = await this.request('ping');
          if (!(Number(status.version) >= minimumVersion)) throw new Error('请更新桌面组件以启用选择与输入');
          if (new TextEncoder().encode(JSON.stringify(card)).length > 240 * 1024) throw new Error('交互内容过大，请在工作台处理');
        }
        const result = await this.request('confirmation', { card });
        if (!(Number(result.version) >= minimumVersion)) throw new Error('请更新桌面组件以启用外部确认');
        return result;
      } catch (error) { this.confirmationId = null; throw error; }
      finally { this.releaseWhenIdle(); }
    }
    request(command, payload = {}) {
      return new Promise((resolve, reject) => {
        const requestId = `desktop_${++this.sequence}`;
        const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('桌面组件未响应，请检查是否已安装')); }, 5000);
        this.pending.set(requestId, { resolve, reject, timer });
        let port;
        try { port = this.connect(); port.postMessage({ command, requestId, ...payload }); }
        catch (error) {
          clearTimeout(timer); this.pending.delete(requestId);
          this.releasePort(port, error, { disconnect: true });
          reject(error);
        }
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
        this.sessionId = null; this.releaseWhenIdle();
        throw error;
      }
    }
    async setCountdown(timer) {
      clearTimeout(this.idleTimer);
      if (!timer && !this.port) return;
      this.countdownId = timer?.id || null;
      try {
        const result = await this.request('countdown', { timer });
        if (Number(result.version) < 2 || !result.version) throw new Error('请更新桌面闹钟组件以启用倒计时');
        return result;
      } catch (error) {
        this.countdownId = null;
        throw error;
      } finally { this.releaseWhenIdle(); }
    }
    releaseWhenIdle() {
      clearTimeout(this.idleTimer);
      if (this.sessionId || this.countdownId || this.confirmationId || !this.port) return;
      const port = this.port;
      this.idleTimer = setTimeout(() => {
        if (this.port === port && !this.sessionId && !this.countdownId && !this.confirmationId && !this.pending.size) {
          this.releasePort(port, null, { disconnect: true, notify: false });
        }
      }, 2000);
    }
    hide(sessionId) {
      if (!this.port || (sessionId && this.sessionId !== sessionId)) return;
      const port = this.port;
      try { port.postMessage({ command: 'hide', sessionId: this.sessionId }); }
      catch (error) { this.releasePort(port, error, { disconnect: true }); return; }
      this.sessionId = null;
      this.releaseWhenIdle();
    }
    async status() {
      try { return await this.request('ping'); }
      finally { if (!this.sessionId) this.hide(); }
    }
  }
  root.AlarmDesktop = AlarmDesktop;
  if (typeof module !== 'undefined') module.exports = AlarmDesktop;
})(typeof self !== 'undefined' ? self : globalThis);
