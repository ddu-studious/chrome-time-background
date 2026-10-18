(function (root) {
  'use strict';
  class AlarmDesktop {
    constructor(runtime, onAction) {
      this.runtime = runtime; this.onAction = onAction;
      this.port = null; this.pending = new Map(); this.sequence = 0; this.sessionId = null;
      this.handled = new Set(); this.processing = new Set(); this.idleTimer = null;
      this.holdUntil = 0;   // 响铃会话结束后水母还要显示确认并游走：这个时刻之前不因空闲断开连接
      this.countdownId = null; this.onCountdownHidden = null; this.onCountdownAction = null;
      this.countdownHandled = new Map(); this.countdownProcessing = new Set();
      // 桌面水母（协议 v6）：常驻、喝水/起身提醒气泡、连接丢失与新连接的信号。
      this.resident = false; this.nudgeId = null; this.nudgeTimer = null; this.quitPort = null;
      this.onNudgeAction = null; this.onJellySetting = null; this.onPortLost = null; this.onConnected = null;
      this.nudgeHandled = new Map(); this.nudgeProcessing = new Set();
      // 水母差事（协议 v8，复用 nudge 气泡）：id 以 jelly-errand- 开头的气泡，动作交给 onErrandAction；气泡自行消失交给 onNudgeHidden；
      // presence 是原生按系统空闲时间上报的“在 / 不在电脑前”两态（只有 active 与 away）。
      // 第二期（协议 v9）：右键菜单“水母，给我…”的请求（errandRequest）交给 onErrandRequest，按结果回 errandRequestResult。
      // 第三期（协议 v10）：jelly 命令的 errands 多一个可选布尔 patrol（活动行为：白天清醒、巡游、小动作），那是水母自己的动作，这里没有新消息要处理。
      this.onErrandAction = null; this.onNudgeHidden = null; this.onPresence = null;
      this.onErrandRequest = null; this.errandRequestProcessing = new Set();
      this.confirmationId = null; this.onConfirmationAction = null; this.onConfirmationHidden = null; this.onConfirmationDisconnect = null;
      this.confirmationHandled = new Set(); this.confirmationProcessing = new Set();
      // 原生 AI 助手面板（协议 v7）：动作处理器、新连接信号；version 是本连接上最近一次回执里的组件版本（未知为 0）。
      this.onAssistantAction = null; this.onAssistantConnected = null; this.version = 0;
      this.assistantHandled = new Map(); this.assistantProcessing = new Set();
    }
    connect() {
      if (this.port) return this.port;
      const port = this.runtime.connectNative('com.timekeeper.desktop');
      this.port = port;
      port.onMessage.addListener(message => {
        if (port !== this.port) return;
        const pending = this.pending.get(message.requestId);
        if (message.type === 'response' && Number(message.version) > 0) this.version = Number(message.version);
        if (pending && message.type === 'response') {
          clearTimeout(pending.timer); this.pending.delete(message.requestId);
          message.ok ? pending.resolve(message) : pending.reject(new Error(message.error || '桌面组件请求失败'));
        }
        if (message.type === 'action') void this.handleAction(port, message);
        if (message.type === 'confirmationAction') void this.handleConfirmationAction(port, message);
        if (message.type === 'assistantAction') void this.handleAssistantAction(port, message);
        if (port === this.port && message.type === 'confirmationHidden' && message.confirmationId === this.confirmationId) {
          this.confirmationId = null;
          Promise.resolve(this.onConfirmationHidden?.(message.confirmationId)).catch(() => {});
          this.releaseWhenIdle();
        }
        if (message.type === 'countdownAction') void this.handleCountdownAction(port, message);
        if (message.type === 'nudgeAction') void this.handleNudgeAction(port, message);
        if (message.type === 'errandRequest') void this.handleErrandRequest(port, message);
        if (message.type === 'nudgeHidden' && this.nudgeId && message.id === this.nudgeId) { this.clearNudgeState(); this.emit('onNudgeHidden', message.id); this.releaseWhenIdle(); }
        if (port === this.port && message.type === 'presence' && (message.state === 'active' || message.state === 'away')) this.emit('onPresence', message.state);
        // 水母菜单只能“收起”，不能由原生打开常驻；其余取值一律忽略
        if (message.type === 'jellySetting' && message.resident === false) this.emit('onJellySetting', { resident: false });
        if (message.type === 'componentQuit') this.quitPort = port;
        if (port === this.port && message.type === 'countdownHidden' && this.countdownId && message.id === this.countdownId) {
          this.countdownId = null;
          Promise.resolve(this.onCountdownHidden?.()).catch(() => {});
          this.releaseWhenIdle();
        }
      });
      port.onDisconnect.addListener(() => {
        const error = this.runtime.lastError?.message || '桌面提醒组件已断开';
        const current = port === this.port, quit = this.quitPort === port;
        this.releasePort(port, new Error(error));
        // 只有对端关闭（崩溃、被结束、用户退出组件）才算“丢失”；本端主动断开 Chrome 不会触发 onDisconnect
        if (current) { if (quit) this.quitPort = null; this.emit('onPortLost', { quit }); }
      });
      // 新连接建立后、第一条消息发出之前通知一次（用来把水母状态先下发给新启动的组件）
      this.emit('onConnected');
      this.emit('onAssistantConnected');
      return port;
    }
    // 回调失败不影响连接与业务：同步抛错与异步拒绝都吞掉
    emit(name, ...args) { try { Promise.resolve(this[name]?.(...args)).catch(() => {}); } catch (_) { /* 外部回调失败不影响桥接 */ } }
    releasePort(port, error, { disconnect = false, notify = true } = {}) {
      if (!port || this.port !== port) return;
      // Chrome does not emit onDisconnect on the end that calls disconnect().
      this.port = null; this.sessionId = null; this.countdownId = null; this.confirmationId = null; this.clearNudgeState();
      // 新进程的 actionId 计数可能与旧进程重复：幂等缓存与组件版本都只属于一条连接
      this.assistantHandled.clear(); this.version = 0;
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
    // 倒计时上的“延后/跳过”：绑定当前连接与当前 occurrence，actionId 幂等；只有 Chrome 执行成功才回 ok。
    async handleCountdownAction(port, message) {
      if (port !== this.port || typeof message.actionId !== 'string' || !message.actionId || message.actionId.length > 100) return;
      const key = `${message.id}:${message.actionId}`;
      if (this.countdownProcessing.has(key)) return;
      this.countdownProcessing.add(key);
      const reply = payload => { try { port.postMessage({ command: 'countdownActionResult', id: message.id, actionId: message.actionId, ...payload }); } catch (_) {} };
      try {
        // 已成功处理过的 actionId 重发（回执丢失）只重复回执，不再执行；此时 occurrence 往往已因处理而改变。
        let result = this.countdownHandled.get(key);
        if (!result) {
          if (!this.countdownId || message.id !== this.countdownId || !['delay', 'skip', 'open'].includes(message.action) || !this.onCountdownAction) throw new Error('这条提醒已变化，请查看最新倒计时');
          result = await this.onCountdownAction(message);
          if (result?.ok !== true) throw new Error(result?.error || 'Chrome 未接受该操作');
          this.countdownHandled.set(key, result);
          if (this.countdownHandled.size > 100) this.countdownHandled.delete(this.countdownHandled.keys().next().value);   // Map 按键淘汰最旧的一条
        }
        reply({ ok: true, text: String(result?.text || '').slice(0, 80) });
      } catch (error) {
        reply({ ok: false, error: String(error.message).slice(0, 120) });
      } finally { this.countdownProcessing.delete(key); }
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
    // 原生 AI 助手面板的动作（协议 v7）：提交文字、停止当前任务、在 Chrome 工作台查看。绑定当前连接，actionId 幂等；
    // 只有 Chrome 明确成功（ok === true）才回 ok，失败不进缓存（原生可用同一个 actionId 重试）。
    async handleAssistantAction(port, message) {
      if (port !== this.port || typeof message.actionId !== 'string' || !message.actionId || message.actionId.length > 100) return;
      const id = message.actionId;
      if (this.assistantProcessing.has(id)) return;
      this.assistantProcessing.add(id);
      const reply = payload => { try { port.postMessage({ command: 'assistantResult', actionId: id, ...payload }); } catch (_) { /* 端口已失效 */ } };
      try {
        let result = this.assistantHandled.get(id);
        if (!result) {
          if (!['submit', 'cancel', 'open'].includes(message.action) || !this.onAssistantAction) throw new Error('AI 助手暂不可用');
          result = await this.onAssistantAction(message);
          if (result?.ok !== true) throw new Error(result?.error || 'Chrome 未接受该操作');
          if (port === this.port) {
            this.assistantHandled.set(id, result);
            if (this.assistantHandled.size > 100) this.assistantHandled.delete(this.assistantHandled.keys().next().value);   // Map 要按键淘汰最旧的一条（values() 给的是结果对象，删不掉任何东西）
          }
        }
        reply({ ok: true, ...(typeof result.taskId === 'string' ? { taskId: result.taskId.slice(0, 100) } : {}), ...(Number.isSafeInteger(result.version) ? { version: result.version } : {}) });
      } catch (error) {
        reply({ ok: false, error: String(error?.message || error).slice(0, 200) });
      } finally { this.assistantProcessing.delete(id); }
    }
    // 把当前任务的投影推给原生面板（协议 v7）。只对已有连接生效：不为了推送状态去启动组件；已知是旧组件时不发它不认识的命令。
    async setAssistantState(state) {
      if (!this.port) return null;
      if (this.version && this.version < 7) throw new Error('请更新桌面组件以启用桌面 AI 助手');
      clearTimeout(this.idleTimer);
      try {
        const result = await this.request('assistantState', { state });
        if (!(Number(result.version) >= 7)) throw new Error('请更新桌面组件以启用桌面 AI 助手');
        return result;
      } finally { this.releaseWhenIdle(); }
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
    request(command, payload = {}, { timeoutMs = 5000 } = {}) {
      return new Promise((resolve, reject) => {
        const requestId = `desktop_${++this.sequence}`;
        const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('桌面组件未响应，请检查是否已安装')); }, timeoutMs);
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
      const names = session.occurrences.map(item => String(item?.label ?? '').trim()).filter(Boolean);
      const payload = {
        sessionId: session.id,
        title: session.occurrences.map(item => item.label).join('；').slice(0, 320),
        timeText: new Date(session.scheduledAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        canSnooze: session.occurrences.some(item => Number(item.snoozeCount || 0) < Number(item.snoozeLimit || 0)),
        snoozeMinutes: Math.max(1, Math.min(60, Number(first.snoozeMinutes) || 10))
      };
      // 响铃气泡的可选字段（协议仍是 v6，旧组件会忽略；原生端各自有兜底）：计划时间、最多 3 个名字、其余个数
      const clock = AlarmDesktop.clockText(session.scheduledAt);
      if (clock) payload.clock = clock;
      if (names.length) {
        payload.labels = names.slice(0, 3).map(name => name.slice(0, 40));
        payload.more = Math.min(99, Math.max(0, names.length - 3));
      }
      try { return await this.request('show', payload); } catch (error) {
        this.sessionId = null; this.releaseWhenIdle();
        throw error;
      }
    }
    // 计划时间的 HH:mm（本地时间，24 小时制；午夜是 00:xx 而不是 24:xx）；时间无效返回空串，原生端据此不画大时间。
    static clockText(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return '';
      const text = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return /^\d{1,2}:\d{2}$/.test(text) ? text : '';
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
    // 常驻：水母不依赖任何委托方，连接不因空闲断开（由 Chrome 的设置决定）；取消后恢复 2 秒空闲断开。
    setResident(on) {
      this.resident = on === true;
      if (this.resident) { clearTimeout(this.idleTimer); this.idleTimer = null; } else this.releaseWhenIdle();
    }
    // 水母自身状态（常驻、夜晚荧光、今天的记录），每条新连接都应先下发一次；组件需要 v6。
    async setJelly(jelly) {
      clearTimeout(this.idleTimer);
      try {
        const result = await this.request('jelly', { jelly });
        if (!(Number(result.version) >= 6)) throw new Error('请更新桌面组件以启用桌面水母');
        return result;
      } finally { this.releaseWhenIdle(); }
    }
    // 喝水/起身提醒气泡：拒绝（响铃中、校验失败）、旧组件、没有回执都抛错，调用方据此退回系统通知；默认只等 3 秒。
    async showNudge(nudge, { timeoutMs = 3000, expireMs } = {}) {
      clearTimeout(this.idleTimer);
      const id = nudge?.id || null;
      this.nudgeId = id;
      try {
        const result = await this.request('nudge', { nudge }, { timeoutMs });
        if (!(Number(result.version) >= 6)) throw new Error('请更新桌面组件以启用水母提醒');
        // 兜底：原生没回报 nudgeHidden 时，也要在气泡自行收起之后放开连接
        const ttl = Math.max(10, Math.min(180, Number(nudge.ttl) || 90));
        this.armNudgeExpiry(id, expireMs ?? ttl * 1000 + 8000);
        return result;
      } catch (error) { if (this.nudgeId === id) this.clearNudgeState(); throw error; }
      finally { this.releaseWhenIdle(); }
    }
    armNudgeExpiry(id, ms) {
      clearTimeout(this.nudgeTimer);
      this.nudgeTimer = setTimeout(() => {
        if (this.nudgeId !== id) return;
        this.nudgeId = null; this.nudgeTimer = null;
        this.releaseWhenIdle();
      }, ms);
    }
    clearNudgeState() { this.nudgeId = null; clearTimeout(this.nudgeTimer); this.nudgeTimer = null; }
    // 撤掉迟到或被替换的气泡；没有连接时不会为了清除而启动组件。id 不匹配当前气泡时原生自己忽略。
    clearNudge(id) {
      const port = this.port;
      if (this.nudgeId === id) this.clearNudgeState();
      if (!port) return;
      try { port.postMessage({ command: 'nudgeClear', id }); }
      catch (error) { this.releasePort(port, error, { disconnect: true }); return; }
      this.releaseWhenIdle();
    }
    // 气泡上的“喝了 / 10 分钟后”：绑定当前连接与当前气泡，actionId 幂等；只有 Chrome 执行成功才回 ok 与说明。
    async handleNudgeAction(port, message) {
      if (port !== this.port || typeof message.actionId !== 'string' || !message.actionId || message.actionId.length > 100) return;
      const key = `${message.id}:${message.actionId}`;
      if (this.nudgeProcessing.has(key)) return;
      this.nudgeProcessing.add(key);
      const reply = payload => { try { port.postMessage({ command: 'nudgeActionResult', id: message.id, actionId: message.actionId, ...payload }); } catch (_) { /* 端口已失效 */ } };
      try {
        // 已成功处理过的 actionId 重发（回执丢失）只重复回执，不再计数
        let result = this.nudgeHandled.get(key);
        if (!result) {
          // 差事气泡（id 前缀 jelly-errand-）与喝水/起身提醒各用各的动作白名单与处理器，互相不能代替；
          // 差事这一侧只放行各类别按钮的并集（play / another 是歌曲的），哪类气泡认哪些按钮由 JellyErrands.act 按类别再限定一次。
          const errand = typeof message.id === 'string' && message.id.startsWith('jelly-errand-');
          const allowed = errand ? ['open', 'later', 'dismiss', 'more', 'play', 'another'] : ['done', 'snooze'];
          const handler = errand ? this.onErrandAction : this.onNudgeAction;
          if (!this.nudgeId || message.id !== this.nudgeId || !allowed.includes(message.action) || !handler) throw new Error('这条提醒已失效');
          result = await handler.call(this, message);
          if (result?.ok !== true) throw new Error(result?.error || 'Chrome 未接受该操作');
          this.nudgeHandled.set(key, result);
          if (this.nudgeHandled.size > 100) this.nudgeHandled.delete(this.nudgeHandled.keys().next().value);   // Map 按键淘汰最旧的一条
        }
        reply({ ok: true, text: String(result?.text || '').slice(0, 80) });
      } catch (error) {
        reply({ ok: false, error: String(error.message).slice(0, 120) });
      } finally { this.nudgeProcessing.delete(key); }
    }
    // 右键菜单“水母，给我…”（协议 v9）：转给 onErrandRequest，按结果回 errandRequestResult——{ ok:true } 是气泡已交给水母，
    // { ok:true, text } 是没有内容可说，{ ok:false, error } 是失败（都带原因）。同一 errandId 处理中的重发忽略；结果不缓存
    // （每次点菜单都是新的 errandId）；旧连接的消息在 connect() 入口已被丢弃，处理期间连接换了，结果只会发给原来的（已失效的）端口。
    // 请求编号叫 errandId 而不是 requestId：requestId 是“命令 → 回执”的关联键，原生端会把它原样写进回执；
    // 联调（jelly-smoke 的第一次实跑）里正是因为菜单请求的结果命令也带 requestId，原生的回执被标成了别的编号，等回执的一方永远等不到。
    async handleErrandRequest(port, message) {
      if (port !== this.port || typeof message.errandId !== 'string' || !message.errandId || message.errandId.length > 100) return;
      const id = message.errandId;
      if (this.errandRequestProcessing.has(id)) return;
      this.errandRequestProcessing.add(id);
      const cut = (text, max) => [...String(text)].slice(0, max).join('');
      const reply = payload => { try { port.postMessage({ command: 'errandRequestResult', errandId: id, ...payload }); } catch (_) { /* 端口已失效 */ } };
      try {
        const kind = message.kind;
        if (typeof kind !== 'string' || !kind || kind.length > 20) { reply({ ok: false, error: '不认识这个请求' }); return; }
        if (!this.onErrandRequest) { reply({ ok: false, error: '水母差事暂不可用' }); return; }
        const result = await this.onErrandRequest(message);
        if (result?.ok === true) reply({ ok: true, ...(typeof result.text === 'string' && result.text ? { text: cut(result.text, 80) } : {}) });
        else reply({ ok: false, error: cut(result?.error || 'Chrome 未接受该请求', 120) });
      } catch (error) {
        reply({ ok: false, error: cut(error?.message || error, 120) });
      } finally { this.errandRequestProcessing.delete(id); }
    }
    releaseWhenIdle(delayMs = 2000) {
      clearTimeout(this.idleTimer); this.idleTimer = null;
      if (this.sessionId || this.countdownId || this.confirmationId || this.nudgeId || this.resident || !this.port) return;
      const port = this.port;
      // 响铃会话刚结束时，水母还在显示确认语并游走（Chrome 还会在 hide 之后才回执动作）：至少保持到 holdUntil，
      // 别处触发的释放（例如倒计时同步完成）不能把它缩短。
      const wait = Math.max(delayMs, this.holdUntil - Date.now());
      this.idleTimer = setTimeout(() => {
        if (this.port === port && !this.sessionId && !this.countdownId && !this.confirmationId && !this.nudgeId && !this.resident && !this.pending.size) {
          this.releasePort(port, null, { disconnect: true, notify: false });
        }
      }, wait);
    }
    hide(sessionId) {
      if (!this.port || (sessionId && this.sessionId !== sessionId)) return;
      const port = this.port;
      const ringing = this.sessionId != null;
      try { port.postMessage({ command: 'hide', sessionId: this.sessionId }); }
      catch (error) { this.releasePort(port, error, { disconnect: true }); return; }
      this.sessionId = null;
      if (ringing) this.holdUntil = Date.now() + 5000;
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
