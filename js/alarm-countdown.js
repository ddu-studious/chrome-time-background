(function (root) {
  'use strict';
  const SETTINGS_KEY = 'userAlarmCountdownV1';

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
      snoozed: first.kind === 'snooze'
    };
  }

  class AlarmCountdown {
    constructor(storage, desktop, core) {
      this.storage = storage; this.desktop = desktop; this.core = core;
      this.queue = Promise.resolve(); this.debounce = null;
      this.state = { enabled: true, available: null, error: null };
      desktop.onCountdownHidden = () => this.setEnabled(false);
      storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || ![SETTINGS_KEY, core.STORAGE_KEY, core.RUNTIME_KEY].some(key => changes[key])) return;
        clearTimeout(this.debounce);
        this.debounce = setTimeout(() => { void this.sync(); }, 100);
      });
    }
    async setEnabled(enabled) {
      await this.storage.local.set({ [SETTINGS_KEY]: { enabled: enabled === true } });
      return this.sync();
    }
    sync() {
      const operation = this.queue.then(async () => {
        const data = await this.storage.local.get([SETTINGS_KEY, this.core.STORAGE_KEY, this.core.RUNTIME_KEY]);
        const enabled = data[SETTINGS_KEY]?.enabled !== false;
        const timer = enabled ? nextTimer(this.core, data[this.core.STORAGE_KEY] || [], data[this.core.RUNTIME_KEY] || {}) : null;
        this.state.enabled = enabled;
        try {
          await this.desktop.setCountdown(timer);
          this.state = { enabled, available: timer ? true : this.state.available, error: null };
        } catch (error) {
          // A missing optional host must never fail alarm creation or scheduling.
          this.state = { enabled, available: false, error: error.message };
        }
        return { ...this.state };
      });
      this.queue = operation.catch(() => {});
      return operation;
    }
  }
  AlarmCountdown.nextTimer = nextTimer;
  AlarmCountdown.SETTINGS_KEY = SETTINGS_KEY;
  root.AlarmCountdown = AlarmCountdown;
  if (typeof module !== 'undefined') module.exports = AlarmCountdown;
})(typeof self !== 'undefined' ? self : globalThis);
