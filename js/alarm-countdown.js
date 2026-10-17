(function (root) {
  'use strict';
  const SETTINGS_KEY = 'userAlarmCountdownV1';
  const UPCOMING_LIMIT = 5;
  const DEFAULT_DELAY_MINUTES = 5;
  const MAX_DELAY_MINUTES = 60;
  // 到点前这么久之内不再接受“延后/跳过”：原生端也隐藏按钮，避免与调度器抢同一个 occurrence。
  const ACTION_LOCK_MS = 3000;

  function pad(value) { return String(value).padStart(2, '0'); }

  // 每条启用的闹钟最多出现一次（它最近的一次），再加上待触发的贪睡/延后，与调度器同一套规则。
  function upcomingItems(core, alarms, runtime, now, limit = UPCOMING_LIMIT) {
    const seen = new Set();
    const items = [];
    for (let round = 0; round < limit && items.length < limit; round += 1) {
      const next = core.nextDispatch(
        alarms.filter(alarm => !seen.has(alarm.id)),
        { ...runtime, pendingSnoozes: (runtime.pendingSnoozes || []).filter(item => !seen.has(item.alarmId)) },
        now
      );
      if (!next?.refs?.length) break;
      for (const ref of next.refs) {
        const alarm = alarms.find(item => item.id === ref.alarmId);
        if (!alarm || seen.has(alarm.id) || items.length >= limit) continue;
        seen.add(alarm.id);
        items.push({
          id: ref.occurrenceId,
          alarmId: alarm.id,
          title: String(alarm.label || '闹钟').slice(0, 40),
          fireAt: ref.scheduledAt
        });
      }
    }
    return items;
  }

  function nextTimer(core, alarms, runtime, now = Date.now()) {
    if (runtime.activeSession) return null;
    // Use the same occurrence selection as the dispatcher, including snoozes.
    const next = core.nextDispatch(alarms, runtime, now);
    if (!next?.refs?.length) return null;
    const first = next.refs[0];
    const alarm = alarms.find(item => item.id === first.alarmId);
    if (!alarm) return null;
    return {
      id: first.occurrenceId,
      title: String(alarm.label || '闹钟').slice(0, 80),
      fireAt: next.fireAt,
      count: next.refs.length,
      snoozed: first.kind === 'snooze',
      // 协议 v5 起的附加字段；旧原生组件会忽略它们。胶囊与进度环已取消（v6），不再下发 style / night / startAt。
      alarmId: alarm.id,
      revision: alarm.revision,
      delayed: /:d\d+$/.test(String(first.occurrenceId)),
      canAct: next.refs.length === 1,
      items: upcomingItems(core, alarms, runtime, now)
    };
  }

  function clampMinutes(value) {
    const minutes = Math.round(Number(value));
    return Math.max(1, Math.min(MAX_DELAY_MINUTES, Number.isFinite(minutes) ? minutes : DEFAULT_DELAY_MINUTES));
  }

  // 倒计时上的“延后 / 跳过本次”。纯函数：校验与 nextDispatch 的当前最近项完全一致、闹钟版本未变，
  // 然后只改闹钟/运行时数据，由调用方串行保存并重新调度。不新建闹钟，也不碰正在响铃的会话。
  function applyAction(core, alarms, runtime, request, now = Date.now()) {
    const action = request?.action;
    if (!['delay', 'skip'].includes(action)) throw new Error('不支持的倒计时操作');
    if (runtime.activeSession) throw new Error('闹钟正在响铃，请先处理');
    runtime.handled = runtime.handled || {};
    runtime.pendingSnoozes = Array.isArray(runtime.pendingSnoozes) ? runtime.pendingSnoozes : [];
    runtime.recent = Array.isArray(runtime.recent) ? runtime.recent : [];
    const next = core.nextDispatch(alarms, runtime, now);
    if (!next?.refs?.length) throw new Error('这条提醒已变化，请查看最新倒计时');
    if (next.refs.length > 1) throw new Error('同时有多条提醒，请在闹钟中心逐条处理');
    const ref = next.refs[0];
    if (ref.occurrenceId !== request.id || ref.alarmId !== request.alarmId) throw new Error('这条提醒已变化，请查看最新倒计时');
    if (next.fireAt - now <= ACTION_LOCK_MS) throw new Error('马上就要响了，来不及改了');
    const alarm = alarms.find(item => item.id === ref.alarmId);
    if (!alarm) throw new Error('闹钟已被删除');
    if (Number(request.revision) !== alarm.revision) throw new Error('提醒已被修改，请查看最新倒计时');
    const snoozeEntry = ref.kind === 'snooze'
      ? runtime.pendingSnoozes.find(item => item.occurrenceId === ref.occurrenceId)
      : null;
    if (ref.kind === 'snooze' && !snoozeEntry) throw new Error('这条提醒已变化，请查看最新倒计时');

    if (action === 'delay') {
      const minutes = clampMinutes(request.minutes);
      const to = ref.scheduledAt + minutes * 60000;
      if (snoozeEntry) {
        const suffix = String(snoozeEntry.occurrenceId).match(/^.*:\d+:(\w+)$/)?.[1] || 'd1';
        snoozeEntry.scheduledAt = to;
        snoozeEntry.occurrenceId = core.occurrenceId(alarm.id, to, suffix);
        snoozeEntry.startedAt = now;
      } else if (alarm.repeat === 'once') {
        const date = new Date(to);
        alarm.fireAt = to;
        alarm.date = core.localDateKey(date);
        alarm.time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
        alarm.updatedAt = now;
        alarm.revision = Number(alarm.revision || 0) + 1;
      } else {
        // 重复闹钟只挪这一次：原次标记已处理，另挂一个延后项；之后的重复不受影响。
        runtime.handled[ref.occurrenceId] = { state: 'delayed', updatedAt: now };
        runtime.pendingSnoozes.push({
          kind: 'snooze', alarmId: alarm.id, scheduledAt: to, startedAt: now,
          occurrenceId: core.occurrenceId(alarm.id, to, 'd1'), snoozeCount: 0
        });
      }
      const clock = new Date(to);
      return { ok: true, action, minutes, fireAt: to, text: `已延后 ${minutes} 分钟，改为 ${pad(clock.getHours())}:${pad(clock.getMinutes())}` };
    }

    // skip
    runtime.handled[ref.occurrenceId] = { state: 'skipped', updatedAt: now };
    runtime.recent.push({ alarmId: alarm.id, label: alarm.label, occurrenceId: ref.occurrenceId, scheduledAt: ref.scheduledAt, state: 'skipped', updatedAt: now });
    let text = '已跳过这一次，之后的重复不受影响';
    if (snoozeEntry) {
      runtime.pendingSnoozes = runtime.pendingSnoozes.filter(item => item !== snoozeEntry);
      text = '已取消这次稍后提醒';
    } else if (alarm.repeat === 'once') {
      alarm.enabled = false;
      alarm.updatedAt = now;
      alarm.revision = Number(alarm.revision || 0) + 1;
      text = '已跳过，这个一次性闹钟已关闭';
    }
    return { ok: true, action, text };
  }

  class AlarmCountdown {
    constructor(storage, desktop, core) {
      this.storage = storage; this.desktop = desktop; this.core = core;
      this.queue = Promise.resolve(); this.debounce = null;
      this.state = { enabled: true, available: null, error: null, version: null };
      this.current = null;
      // 由后台注入：串行读取最新闹钟数据、调用 applyAction、保存并重新调度。
      this.runAction = null;
      // 由后台注入：打开（或聚焦）扩展首页并展开闹钟中心。
      this.openCenter = null;
      desktop.onCountdownHidden = () => this.setEnabled(false);
      desktop.onCountdownAction = message => this.handleAction(message);
      storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || ![SETTINGS_KEY, core.STORAGE_KEY, core.RUNTIME_KEY].some(key => changes[key])) return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { void this.sync(); }, 100);
      });
    }
    async update(patch) {
      const data = await this.storage.local.get(SETTINGS_KEY);
      const previous = data[SETTINGS_KEY] || {};
      const next = { ...previous };
      // 只管“是否把倒计时交给水母”；旧版本留下的 style / night 原样保留（桌面水母设置迁移时读取 night），这里不再使用也不改写
      if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
      await this.storage.local.set({ [SETTINGS_KEY]: next });
      return this.sync();
    }
    setEnabled(enabled) { return this.update({ enabled }); }
    async handleAction(message) {
      const current = this.current;
      if (!current || message?.id !== current.id || message?.alarmId !== current.alarmId) {
        return { ok: false, error: '这条提醒已变化，请查看最新倒计时' };
      }
      if (message.action === 'open') {
        if (typeof this.openCenter !== 'function') return { ok: false, error: '当前版本不能从倒计时打开闹钟中心' };
        await this.openCenter();
        return { ok: true, text: '已在 Chrome 中打开闹钟中心' };
      }
      if (typeof this.runAction !== 'function') return { ok: false, error: '当前版本不支持从倒计时修改提醒' };
      return this.runAction(message);
    }
    sync() {
      const operation = this.queue.then(async () => {
        const data = await this.storage.local.get([SETTINGS_KEY, this.core.STORAGE_KEY, this.core.RUNTIME_KEY]);
        const settings = data[SETTINGS_KEY] || {};
        const enabled = settings.enabled !== false;
        const timer = enabled ? nextTimer(this.core, data[this.core.STORAGE_KEY] || [], data[this.core.RUNTIME_KEY] || {}) : null;
        this.current = timer ? { id: timer.id, alarmId: timer.alarmId } : null;
        this.state.enabled = enabled;
        try {
          const result = await this.desktop.setCountdown(timer);
          const version = Number(result?.version) || this.state.version;
          this.state = { enabled, available: timer ? true : this.state.available, error: null, version };
        } catch (error) {
          // A missing optional host must never fail alarm creation or scheduling.
          this.state = { enabled, available: false, error: error.message, version: this.state.version };
        }
        return { ...this.state };
      });
      this.queue = operation.catch(() => {});
      return operation;
    }
  }
  AlarmCountdown.nextTimer = nextTimer;
  AlarmCountdown.upcomingItems = upcomingItems;
  AlarmCountdown.applyAction = applyAction;
  AlarmCountdown.SETTINGS_KEY = SETTINGS_KEY;
  root.AlarmCountdown = AlarmCountdown;
  if (typeof module !== 'undefined') module.exports = AlarmCountdown;
})(typeof self !== 'undefined' ? self : globalThis);
