(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantNative = api;
})(globalThis, function () {
  'use strict';

  // 桌面 AI 助手（macOS 原生面板）在 Chrome 一侧的薄适配层：
  //  · 原生面板 → Chrome：提交文字、停止当前任务、在工作台查看。三者都经 AlarmDesktop.handleAssistantAction（绑定当前连接、
  //    actionId 幂等）进到这里，再交给**同一个** AssistantEngine（engine.submit / engine.cancel / 打开工作台）。
  //    提交带 origin:'desktop'：来自桌面输入的任务一律保留确认卡，不经 pi 自动确认（见 assistant-contract / assistant-tools）。
  //  · Chrome → 原生面板：把 Engine 当前任务投影成有界纯文本（状态白名单、清洗后的输入与助手原文），经 setAssistantState 推送；
  //    只在已连接且助手生效时推送（不为了推送去启动组件），内容没变不重发，新连接与设置生效后补发。
  // 任务、版本、预算、取消、恢复与确认全部仍由 Engine 拥有，这里不保存任何任务状态。日志只写固定类别，不写输入与助手正文。
  // 设计与边界见 docs/technical/native-assistant-workbench-20261016.md。

  const STATUSES = new Set(['planning', 'running', 'waiting', 'review', 'clarify', 'completed', 'failed', 'interrupted', 'cancelled']);
  const MAX_INPUT = 500;            // 与 Contract.clean / Engine.respond 的输入上限一致
  const MAX_SHOWN_INPUT = 120;
  const MAX_SHOWN_MESSAGE = 1200;
  const ID = /^[\w.:-]{1,100}$/;
  // 控制字符与方向控制符；制表/换行/回车另行处理
  const CONTROL = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

  const validId = value => typeof value === 'string' && ID.test(value);

  function clip(value, max) {
    const chars = [...value];
    return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : value;
  }
  const oneLine = (value, max) => (typeof value === 'string' ? clip(value.replace(CONTROL, '').replace(/\s+/g, ' ').trim(), max) : '');
  const multiline = (value, max) => (typeof value === 'string'
    ? clip(value.replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/[\t\u000b\u000c]/g, ' ').replace(/ +\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), max) : '');

  /** Engine 任务视图 → 原生面板状态；认不出的状态/标识/版本不猜测，一律当没有任务。 */
  function project(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) return null;
    if (!validId(task.id) || !Number.isSafeInteger(task.version) || !STATUSES.has(task.status)) return null;
    return {
      taskId: task.id, version: task.version, status: task.status,
      input: oneLine(task.input?.text, MAX_SHOWN_INPUT),
      message: multiline(task.message, MAX_SHOWN_MESSAGE),
      at: Number.isFinite(task.updatedAt) && task.updatedAt > 0 ? Math.floor(task.updatedAt) : 0,
    };
  }
  // 去重只看内容：updatedAt 变化不算新状态
  const signatureOf = state => JSON.stringify(state ? { ...state, at: 0 } : null);

  /**
   * desktop：AlarmDesktop（本函数设置它的 onAssistantAction / onAssistantConnected）；engine：AssistantEngine；
   * jelly：JellyDesktop（assistantEnabled 判定，onAssistantApplied 由本函数接入）；openWorkspace：打开 Chrome 里的工作台；
   * log：(category, action, detail) => void，只收固定类别。
   */
  function create({ desktop, engine, jelly, openWorkspace, log = () => {} }) {
    let latest = null, sentSignature, chain = Promise.resolve(), submitting = false;
    const enabled = async () => { try { return (await jelly.assistantEnabled()) === true; } catch (_) { return false; } };
    const record = (context, ok, error) => { try { log('system', 'assistant-native', { ok, context, ...(error ? { error } : {}) }); } catch (_) { /* 日志不能影响助手 */ } };
    const fail = (context, category, text) => { record(context, false, category); return { ok: false, error: text }; };

    function flush() {
      const run = chain.then(async () => {
        const value = latest, signature = signatureOf(value);
        if (signature === sentSignature) return false;
        if (!desktop.port) return false;                 // 不为了推送状态去启动组件
        if (!(await enabled())) return false;
        try { await desktop.setAssistantState(value); sentSignature = signature; return true; }
        catch (_) { record('state', false, 'unavailable'); return false; }
      });
      chain = run.catch(() => {});
      return run;
    }
    /** Engine 每次变化都调用；返回的 Promise 在本次下发结束后兑现（失败不抛出）。 */
    function sync(task) { latest = project(task); return flush(); }
    // 新连接（原生进程是新的）或设置刚生效：内容没变也要重发；以 Engine 当前任务为准，不用旧缓存
    const resend = () => { sentSignature = undefined; void engine.snapshot().then(task => sync(task)).catch(() => {}); };

    async function submit(message) {
      const raw = message.text;
      if (typeof raw !== 'string') return fail('submit', 'invalid', '请输入需求');
      const text = raw.trim();
      if (!text || [...text].length > MAX_INPUT) return fail('submit', 'invalid', `请输入 1 至 ${MAX_INPUT} 字的内容`);
      if (submitting) return fail('submit', 'busy', '上一条需求还在提交，请稍候');
      submitting = true;
      try {
        // 与浏览器工作台一致：带上面板所见的任务与版本，让“第 2 个”之类的引用与过期检查走原有路径；半截绑定不传。
        const bound = validId(message.taskId) && Number.isSafeInteger(message.version);
        // 原生只能提交文字：应用、动作、候选、来源都不接受调用方给的
        const view = await engine.submit({ text, origin: 'desktop', ...(bound ? { taskId: message.taskId, version: message.version } : {}) });
        record('submit', true);
        return { ok: true, ...(view ? { taskId: view.id, version: view.version } : {}) };
      } finally { submitting = false; }
    }

    async function cancel(message) {
      if (!validId(message.taskId) || !Number.isSafeInteger(message.version)) return fail('cancel', 'invalid', '任务信息无效');
      const current = await engine.snapshot();
      if (!current || current.id !== message.taskId || current.version !== message.version) return fail('cancel', 'stale', '任务已变化，请查看最新状态');
      if (!['planning', 'running'].includes(current.status)) return fail('cancel', 'stale', '当前任务不在执行中');
      const view = await engine.cancel(message.taskId);
      record('cancel', true);
      return { ok: true, taskId: view?.id ?? message.taskId, ...(Number.isSafeInteger(view?.version) ? { version: view.version } : {}) };
    }

    /** AlarmDesktop 的 onAssistantAction：只有明确 ok:true 才会被当作成功回给原生。 */
    async function handle(message) {
      const action = message?.action;
      if (!['submit', 'cancel', 'open'].includes(action)) return fail(String(action).slice(0, 20), 'invalid', '不支持的操作');
      if (!(await enabled())) return fail(action, 'disabled', '桌面 AI 助手未开启');
      try {
        if (action === 'submit') return await submit(message);
        if (action === 'cancel') return await cancel(message);
        await openWorkspace();
        record('open', true);
        return { ok: true };
      } catch (error) { return fail(action, 'rejected', String(error?.message || error).slice(0, 200)); }
    }

    desktop.onAssistantAction = handle;
    desktop.onAssistantConnected = resend;
    if (jelly) jelly.onAssistantApplied = resend;
    return {
      sync, handle,
      dispose() {
        if (desktop.onAssistantAction === handle) desktop.onAssistantAction = null;
        if (desktop.onAssistantConnected === resend) desktop.onAssistantConnected = null;
        if (jelly?.onAssistantApplied === resend) jelly.onAssistantApplied = null;
      },
    };
  }

  return { create, project, STATUSES: [...STATUSES], MAX_INPUT };
});
