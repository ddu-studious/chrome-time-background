(function (root) {
  'use strict';
  // A display projection only. The Engine owns authorization, versions and writes.
  function card(task, now = Date.now()) {
    const interaction = task?.interaction || (task?.status === 'review' && task.choices?.length === 1
      ? { id: `${task.id}:${task.version}`, kind: 'confirm', status: 'review', allowText: true, expiresAt: task.memorySummary?.expiresAt } : null);
    if (!interaction || !['review', 'waiting', 'clarify', 'failed', 'interrupted'].includes(task.status) ||
        interaction.status !== task.status || !Number.isSafeInteger(task.version) ||
        !Number.isFinite(interaction.expiresAt) || interaction.expiresAt <= now) return null;
    const choices = ['confirm', 'select'].includes(interaction.kind) ? (task.choices || []).map(choice => ({
      id: choice.id, title: String(choice.title || '').slice(0, 160), subtitle: String(choice.subtitle || '').slice(0, 180),
      label: String(choice.label || '选择').slice(0, 60), kind: choice.kind || '', secondary: Boolean(choice.secondary)
    })) : [];
    return { protocolVersion: 4, id: interaction.id, taskId: task.id, version: task.version, expiresAt: interaction.expiresAt,
      kind: interaction.kind, status: interaction.status, allowText: interaction.allowText,
      title: ({ confirm: '需要你确认', select: '需要你选择', input: '需要你补充', inspect: '需要你处理' })[interaction.kind],
      message: String(task.message || '').slice(0, 1500), choices,
      inputPlaceholder: interaction.kind === 'confirm' ? '也可以输入修改要求…' : '输入回答或补充说明…' };
  }
  function create({ desktop, engine, openWorkspace, now = Date.now }) {
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
          if (value && visible()?.id === value.id) notice = `桌面交互暂不可用，请在工作台处理：${error.message}`;
        }
      });
      queue = run.catch(() => {}); return run;
    }
    desktop.onConfirmationHidden = id => { hidden = id; void flush(); };
    desktop.onConfirmationDisconnect = () => { sent = ''; if (visible() && !notice) notice = '桌面组件已断开，请在工作台处理。'; };
    desktop.onConfirmationAction = async message => {
      const current = latest;
      if (!current || message.confirmationId !== current.id || message.taskId !== current.taskId ||
          message.version !== current.version || now() >= current.expiresAt) throw new Error('确认卡已过期，请以工作台最新状态为准');
      try {
        const interaction = { id: current.id, status: current.status };
        if (message.action === 'open') {
          const task = await engine.snapshot();
          if (task?.id !== current.taskId || task.version !== current.version || task.status !== current.status || !openWorkspace) throw new Error('交互卡已失效');
          await openWorkspace(); hidden = current.id;
        } else {
          const action = message.action === 'confirm' ? 'select' : message.action;
          if (action === 'select' && !current.choices.some(choice => choice.id === message.choiceId)) throw new Error('候选无效');
          await engine.respond(current.taskId, current.version, { interaction, action, choiceId: message.choiceId, text: message.text });
        }
        return { ok: true };
      } finally { void engine.snapshot().then(sync).catch(() => {}); }
    };
    return { sync, notice: () => visible() ? notice : '', settled: () => queue, dispose: () => clearTimeout(expiry) };
  }
  root.AssistantConfirmation = { create, card };
  if (typeof module === 'object' && module.exports) module.exports = root.AssistantConfirmation;
})(globalThis);
