(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MusicSleep = api;
})(globalThis, function () {
  const KEY = 'musicSleepTimerV1', NAME = 'music-sleep-stop';
  function create({ storage, alarms, pause, now = Date.now }) {
    let queue = Promise.resolve();
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    const read = async () => (await storage.get(KEY))[KEY] || null;
    async function expire() {
      const value = await read();
      if (!value || value.status !== 'pending') return;
      if (value.fireAt > now()) { await alarms.create(NAME, { when: value.fireAt }); return; }
      let response;
      try { response = await pause(); } catch { response = { ok: false }; }
      // Never silently drop a failed pause, and never retry forever after a restart.
      await storage.set({ [KEY]: { ...value, status: response?.ok ? 'stopped' : 'failed' } });
      await alarms.clear(NAME);
    }
    return {
      get: () => serial(read),
      set(minutes) { return serial(async () => {
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 240) throw new Error('音乐定时应为 0 至 240 分钟');
        if (!minutes) { await alarms.clear(NAME); await storage.remove(KEY); return { ok: true, timer: null }; }
        const timer = { fireAt: now() + minutes * 60000, minutes, status: 'pending' };
        await storage.set({ [KEY]: timer });
        try { await alarms.create(NAME, { when: timer.fireAt }); }
        catch (error) { await storage.set({ [KEY]: { ...timer, status: 'failed' } }); throw error; }
        return { ok: true, timer };
      }); },
      finish(expectedFireAt) { return serial(async () => {
        const timer = await read();
        if (!Number.isFinite(expectedFireAt) || timer?.fireAt !== expectedFireAt) return { ok: false, error: '定时已被更新或取消' };
        await expire();
        const latest = await read();
        return { ok: latest?.status === 'stopped', timer: latest, error: latest?.status === 'stopped' ? undefined : '后台尚未确认停止' };
      }); },
      restore: () => serial(expire),
      fire: name => name === NAME ? serial(expire) : Promise.resolve()
    };
  }
  return { create };
});
