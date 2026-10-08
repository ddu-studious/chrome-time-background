(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./assistant-contract.js') : root.AssistantContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantTodo = api;
})(globalThis, function (Contract) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = message => Object.assign(new Error(message), { code: 'ASSISTANT_PLAN_INVALID' });
  const runtimeFields = ['ref', 'expectedRevision', 'projectRef'];
  const completionFields = tool => Contract.tools[tool].fields.filter(key => !runtimeFields.includes(key));
  function create(input) {
    const goal = input.text || Contract.skills.find(row => row.id === input.skill)?.name || '执行所选操作';
    const sources = [];
    const taskInput = input.app === 'task' || input.skill === 'task-add';
    // Explicitly labelled task attributes belong to the preceding requirement.
    // Preserve their text and separator; ordinary lines remain separate sources.
    const parts = goal.split(/(\n+|[；;]+)/);
    for (let index = 0; index < parts.length; index += 2) {
      const text = parts[index].trim();
      if (!text) continue;
      if (taskInput && sources.length && /^(?:截止(?:时间|日期)?|优先级|备注|描述|(?:参考|资源)?链接)\s*[:：]\s*\S/.test(text)) sources[sources.length - 1] += `${parts[index - 1]}${text}`;
      else sources.push(text);
    }
    if (sources.length > 12) throw fail('Todo 最多支持12项要求，请缩小本次任务范围');
    return { version: 1, goal, sources, items: [] };
  }
  function definitions(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 12) throw fail('请先规划覆盖完整需求的 Todo（1至12项）');
    return rows.map((row, index) => {
      if (!row || Object.keys(row).some(key => !['text', 'source', 'tool', 'args'].includes(key)) ||
        typeof row.text !== 'string' || !row.text.trim() || row.text.length > 200 ||
        !Number.isInteger(row.source) || row.source < 0 || row.source > 11 || !Object.hasOwn(Contract.tools, row.tool)) throw fail('Todo 项目格式无效');
      const args = row.args ?? {};
      const where = `Todo 第${index + 1}项 ${row.tool}`;
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail(`${where} 的 args 必须是对象`);
      const unknown = Object.keys(args).filter(key => !Contract.tools[row.tool].fields.includes(key));
      // Model-authored keys and values must not become arbitrary recovery text.
      if (unknown.length) throw fail(`${where} 不支持参数 ${unknown.slice(0, 12).map(key => /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) ? key : '[非标准字段名]').join('、')}；允许的验收参数：${completionFields(row.tool).join('、') || '无（args 必须为空对象）'}`);
      for (const [key, value] of Object.entries(args)) {
        if (runtimeFields.includes(key)) throw fail(`${where} 不能预先指定引用或版本：${key}；请在执行阶段读取真实工具回执`);
        if (!['string', 'boolean', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw fail(`${where}.${key} 必须是字符串、布尔值或有限数字`);
        if (typeof value === 'string' && value.length > 500) throw fail(`${where}.${key} 最多500字符`);
        const values = Contract.tools[row.tool].enums?.[key];
        if (values && !values.includes(value)) throw fail(`${where}.${key} 只允许：${values.join('、')}`);
      }
      return { text: row.text.trim(), source: row.source, tool: row.tool, args: copy(args) };
    });
  }
  function validate(value) {
    if (!value || value.version !== 1 || typeof value.goal !== 'string' || value.goal.length > 6000 ||
      !Array.isArray(value.sources) || !value.sources.length || value.sources.length > 12 || value.sources.some(text => typeof text !== 'string' || !text || text.length > 6000) ||
      !Array.isArray(value.items) || value.items.length > 12 || JSON.stringify(value).length > 16000) throw fail('Todo 状态无效');
    if (value.items.length) definitions(value.items.map(({ text, source, tool, args }) => ({ text, source, tool, args })));
    if (value.items.some((row, index) => row.id !== `todo-${index + 1}` || !['pending', 'running', 'completed'].includes(row.status) ||
      (row.receiptId != null && (typeof row.receiptId !== 'string' || row.receiptId.length > 160)))) throw fail('Todo 进度无效');
    return copy(value);
  }
  function current(state) { return state?.items.find(row => row.status !== 'completed'); }
  function requestsAppend(text) {
    // “播放添加到队列里的歌曲” refers to the previous result; it is not
    // another append request. Do not treat this relative clause as a command.
    const commands = text.replace(/(?:已|刚刚?)?(?:加入|添加|追加)(?:到)?队列(?:里|中)?的(?:歌曲|曲目|音乐|歌)/g, '队列曲目');
    return /(?:加入|添加|追加).{0,8}队列/.test(commands);
  }
  function install(state, rows, app) {
    const items = definitions(rows);
    if (items.some(row => row.source >= state.sources.length) || state.sources.some((_, index) => !items.some(row => row.source === index)) ||
      items.some((row, index) => index && row.source < items[index - 1].source)) throw fail('Todo 必须按顺序覆盖每项原始要求，不能遗漏或重排');
    for (const row of items) {
      const tool = Contract.tools[row.tool];
      if (app && tool.app && tool.app !== app) throw fail('Todo 超出了已选择应用的范围');
      if (['tools.load', 'context.read'].includes(row.tool)) throw fail('加载工具和读取上下文不能作为业务目标的完成条件');
    }
    // These are completion checks, never authorization or generated actions.
    // Keep the common queue workflow from accepting a search/state receipt as
    // evidence for an explicitly requested mutation or playback.
    if (app === 'music') for (const [source, text] of state.sources.entries()) {
      const group = items.filter(row => row.source === source);
      if (/不要|先不|先别|只查|只看|是否清空/.test(text)) continue;
      if (/清空/.test(text) && !group.some(row => row.tool === 'music.queue.clear' || (row.tool === 'music.queue.reconcile' && row.args.action === 'clear'))) throw fail('清空队列的 Todo 必须以清空回执验收');
      if (requestsAppend(text) && !group.some(row => row.tool === 'music.queue.apply' && row.args.mode === 'append')) throw fail(`第${source + 1}项“${text}”：加入队列的 Todo 必须以追加回执验收`);
      if (/随机播放/.test(text) && !group.some(row => row.tool === 'music.queue.play' && row.args.mode === 'shuffle')) throw fail('随机播放的 Todo 必须以随机起播回执验收');
    }
    state.items = items.map((row, index) => ({ ...row, id: `todo-${index + 1}`, status: 'pending' }));
  }
  function local(input, plan) {
    if (plan.question) return plan;
    const state = create(input);
    // Deterministic local plans already consist of executable primitive steps.
    // Their existing parser, scope and tool validation remain authoritative.
    if (state.sources.length !== 1) return null;
    return { ...plan, todoTips: plan.steps.map(step => ({ text: Contract.tools[step.tool].title, source: 0, tool: step.tool,
      args: Object.fromEntries(Object.entries(step.args).filter(([key]) => !['ref', 'expectedRevision', 'projectRef'].includes(key))) })) };
  }
  function prepare(task, plan) {
    if (plan.todoTips && !task.todoTips) task.todoTips = create(task.input);
    const state = task.todoTips;
    if (!state) return; // Legacy snapshots acquire Todo through Tools.plan on their next planning pass.
    if (plan.todoTips) {
      if (state.items.length) throw fail('已有 Todo 不能被模型覆盖、删除或重新勾选，请继续当前未完成项');
      install(state, plan.todoTips, task.input.app);
    }
    if (plan.question) return;
    if (!state.items.length) throw fail('必须先建立完整 Todo，再执行工具');
    const active = current(state);
    if (plan.done && active) throw fail(`Todo 尚未完成：${active.text}。请继续当前事项，不能结束整个任务`);
    if (plan.steps.length && !active) throw fail('Todo 已全部完成，不能追加原计划之外的动作');
    if (plan.todoId && plan.todoId !== active?.id) throw fail(`必须按 Todo 顺序执行当前事项 ${active?.id}`);
    if (plan.steps.length > 1 && task.usedModel) throw fail('Todo 模式每轮只执行一个工具，再依据真实回执继续');
  }
  function observe(task, step, observation, receipt) {
    const active = current(task.todoTips);
    if (!active || step?.todoId !== active.id) return;
    active.status = 'running';
    if (observation.status !== 'done' || !receipt || receipt.status !== 'done') return;
    const args = step.args || {}, data = observation.data || {};
    const emptyClear = ['music.queue.clear', 'music.queue.reconcile'].includes(active.tool) &&
      (active.tool !== 'music.queue.reconcile' || active.args.action === 'clear') &&
      ['music.state', 'music.queue.list'].includes(step.tool) && data.status === 'empty' && data.count === 0;
    const clearEquivalent = active.tool === 'music.queue.clear' && step.tool === 'music.queue.reconcile' && args.action === 'clear';
    if (!emptyClear && !clearEquivalent && (active.tool !== step.tool || Object.entries(active.args).some(([key, value]) => args[key] !== value))) return;
    if (active.tool === 'music.queue.removeArtist' && (!Number.isInteger(data.removedCount) || data.removedCount < 0)) return;
    if (active.tool === 'music.queue.play' && (data.isPlaying !== true || (active.args.mode && data.mode !== active.args.mode))) return;
    if (active.tool === 'music.queue.apply' && (!Number.isInteger(data.count) || data.count < 1 || (args.startPlayback && data.isPlaying !== true))) return;
    if (['music.queue.clear', 'music.queue.reconcile'].includes(active.tool) && (active.tool === 'music.queue.clear' || active.args.action === 'clear') && data.count !== 0) return;
    active.status = 'completed'; active.receiptId = receipt.id;
  }
  function before(task, step) {
    const active = current(task.todoTips);
    if (!active) return;
    const prerequisites = {
      'music.queue.removeArtist': ['music.state', 'music.queue.removeArtist'],
      'music.queue.clear': ['music.state', 'music.queue.list', 'music.queue.clear', 'music.queue.reconcile'],
      'music.queue.apply': ['music.state', 'music.queue.list', 'music.search', 'music.collection.get', 'music.queue.apply'],
      'music.queue.play': ['music.state', 'music.queue.list', 'music.playback.setMode', 'music.queue.play']
    }[active.tool];
    if (prerequisites && !['tools.load', 'context.read', 'memory.recall', ...prerequisites].includes(step.tool)) throw fail(`当前 Todo 是“${active.text}”，不能提前执行其他事项`);
    if (step.tool === active.tool && Object.entries(active.args).some(([key, value]) => step.args[key] !== value)) throw fail('执行参数不符合当前 Todo 的验收目标，请重新规划');
    if (active.tool === 'music.queue.clear' && step.tool === 'music.queue.reconcile' && step.args.action !== 'clear') throw fail('当前 Todo 要求清空，不能改为保留队列');
  }
  function view(task) {
    if (!task.todoTips) return null;
    const value = copy(task.todoTips), active = current(value);
    if (active && ['waiting', 'review', 'clarify', 'failed', 'interrupted', 'cancelled'].includes(task.status)) active.status = task.status;
    return value;
  }
  return Object.freeze({ create, completionFields, definitions, validate, current, install, local, prepare, observe, before, view });
});
