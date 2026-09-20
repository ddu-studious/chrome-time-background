(function (root) {
  'use strict';
  // A display projection only. The Engine owns authorization, versions and writes.
  function card(task, now = Date.now()) {
    if (task?.status !== 'review' || task.choices?.length !== 1 || !Number.isSafeInteger(task.version)) return null;
    const expiresAt = task.memorySummary?.expiresAt;
    if (!Number.isFinite(expiresAt) || expiresAt <= now) return null;
    const choice = task.choices[0];
    return { id: `${task.id}:${task.version}`, taskId: task.id, version: task.version, expiresAt,
      title: '需要你确认', message: task.message, choiceId: choice.id, choiceTitle: choice.title,
      label: choice.label || '确认执行' };
  }
  function create({ desktop, engine, now = Date.now }) {
    let latest = null, hidden = null, sent = '', queue = Promise.resolve(), expiry = null, notice = '';
    const visible = () => latest && latest.id !== hidden && latest.expiresAt > now() ? latest : null;
    function sync(task) {
      const next = card(task, now());
      if (!next || next.id !== latest?.id) notice = '';
      latest = next; clearTimeout(expiry);
      if (latest) expiry = setTimeout(() => { latest = null; void flush(); }, Math.min(2147483647, Math.max(1, latest.expiresAt - now())));
      return flush();
    }
    function flush() {
      const run = queue.then(async () => {
        const value = visible();
        if (!value) notice = '';
        const signature = JSON.stringify(value);
        if (signature === sent) return;
        try { await desktop.setConfirmation(value); sent = signature; notice = ''; }
        catch (error) {
          if (value && visible()?.id === value.id) notice = `桌面确认暂不可用，请在工作台确认：${error.message}`;
        }
      });
      queue = run.catch(() => {}); return run;
    }
    desktop.onConfirmationHidden = id => { hidden = id; void flush(); };
    desktop.onConfirmationDisconnect = () => { sent = ''; if (visible() && !notice) notice = '桌面组件已断开，请在工作台确认。'; };
    desktop.onConfirmationAction = async message => {
      const current = latest;
      if (!current || message.confirmationId !== current.id || message.taskId !== current.taskId ||
          message.version !== current.version || now() >= current.expiresAt) throw new Error('确认卡已过期，请以工作台最新状态为准');
      try {
        if (message.action === 'confirm' && message.choiceId === current.choiceId) {
          await engine.choose(current.taskId, current.choiceId, current.version, undefined, true);
        } else if (message.action === 'cancel') await engine.cancel(current.taskId, current.version);
        else throw new Error('确认操作无效');
        return { ok: true };
      } finally { void engine.snapshot().then(sync).catch(() => {}); }
    };
    return { sync, notice: () => visible() ? notice : '', settled: () => queue, dispose: () => clearTimeout(expiry) };
  }
  root.AssistantConfirmation = { create, card };
  if (typeof module === 'object' && module.exports) module.exports = root.AssistantConfirmation;
})(globalThis);
