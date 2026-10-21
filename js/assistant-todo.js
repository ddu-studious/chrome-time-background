(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./assistant-contract.js') : root.AssistantContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantTodo = api;
})(globalThis, function (Contract) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const fail = (message, issue = 'todo-format') => Contract.planFailure(message, issue);
  const runtimeFields = ['ref', 'expectedRevision', 'projectRef'];
  // Every compute.run field is written at execution time: its code and source refs cannot exist before the data does.
  const hiddenFields = tool => tool === 'compute.run' ? Contract.tools[tool].fields : runtimeFields;
  const completionFields = tool => Contract.tools[tool].fields.filter(key => !hiddenFields(tool).includes(key));
  // Clear action verbs only. Nouns such as 播放次数 or 观看记录 describe data to analyse, not a change to make.
  // "关闭状态的闹钟"、"开启的提醒" describe a state to filter on, not a request to change it.
  const actionText = /加入|添加|追加|新增|新建|创建|删除|删掉|移除|清空|清除|去掉|设置|设为|修改|改成|改为|重命名|(?:关闭|开启|启用|停用)(?!状态|的)|保存|记住|暂停|取消|跳到|快进|随机播放|循环播放|打开|提醒我|播放(?!次数|记录|历史|量|列表|时长|时间|频率|情况)/;
  const goalOf = input => input.text || Contract.skills.find(row => row.id === input.skill)?.name || '执行所选操作';
  function create(input) {
    const goal = goalOf(input);
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
    if (!Array.isArray(rows) || !rows.length || rows.length > 12) throw fail('请先规划覆盖完整需求的 Todo（1至12项）；不能返回空清单。请补全清单，或在信息不足时只返回 question', 'todo-missing');
    return rows.map((row, index) => {
      const item = `Todo 第${index + 1}项`;
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw fail(`${item} 必须是对象`);
      if (Object.keys(row).some(key => !['text', 'source', 'tool', 'args'].includes(key))) throw fail(`${item} 只能包含 text/source/tool/args；id、status 和 receiptId 由执行器管理，不能由模型填写`);
      if (typeof row.text !== 'string' || !row.text.trim() || row.text.length > 200) throw fail(`${item}.text 必须是1至200字符的目标说明`);
      if (!Number.isInteger(row.source) || row.source < 0 || row.source > 11) throw fail(`${item}.source 必须是0至11的原文来源下标`);
      if (!Object.hasOwn(Contract.tools, row.tool)) throw fail(`${item}.tool 必须来自完成条件目录`);
      const args = row.args ?? {};
      const where = `Todo 第${index + 1}项 ${row.tool}`;
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail(`${where} 的 args 必须是对象`, 'todo-arguments');
      const unknown = Object.keys(args).filter(key => !Contract.tools[row.tool].fields.includes(key));
      // Model-authored keys and values must not become arbitrary recovery text.
      if (unknown.length) throw fail(`${where} 不支持参数 ${unknown.slice(0, 12).map(key => /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key) ? key : '[非标准字段名]').join('、')}；允许的验收参数：${completionFields(row.tool).join('、') || '无（args 必须为空对象）'}`, 'todo-arguments');
      for (const [key, value] of Object.entries(args)) {
        if (hiddenFields(row.tool).includes(key)) throw fail(row.tool === 'compute.run'
          ? `${where} 的 args 必须为空对象：purpose、code、inputRefs 在执行阶段给出`
          : `${where} 不能预先指定引用或版本：${key}；请在执行阶段读取真实工具回执`, 'todo-arguments');
        if (!['string', 'boolean', 'number'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw fail(`${where}.${key} 必须是字符串、布尔值或有限数字`, 'todo-arguments');
        if (typeof value === 'string' && value.length > 500) throw fail(`${where}.${key} 最多500字符`, 'todo-arguments');
        const values = Contract.tools[row.tool].enums?.[key];
        if (values && !values.includes(value)) throw fail(`${where}.${key} 只允许：${values.join('、')}`, 'todo-arguments');
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
  // An outline question stops before any item exists. The user's next typed answer
  // belongs to that original request: it keeps the goal and sources instead of
  // starting a Todo from the answer text alone.
  const awaitingAnswer = task => task?.status === 'clarify' && Boolean(task.todoTips) && !task.todoTips.items.length;
  // True when this input is the user's answer to that question: the empty state was carried over
  // (its goal is not this input) and the assistant's question is the turn right before the answer.
  const answers = (task, input) => Boolean(task.todoTips) && !task.todoTips.items.length && Boolean(input.text) &&
    task.todoTips.goal !== goalOf(input) && task.turns?.at(-2)?.role === 'assistant';
  function executionPlan(raw, state) {
    if (!state?.items.length || !raw || typeof raw !== 'object' || raw.todoTips == null) return raw;
    // An identical echo is redundant data, never a new definition or progress.
    // Compare every supplied field, then discard it without updating state.
    const same = (left, right) => left === right || (left && right && typeof left === 'object' && typeof right === 'object' &&
      Array.isArray(left) === Array.isArray(right) && Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(key => Object.hasOwn(right, key) && same(left[key], right[key])));
    const fields = ['text', 'source', 'tool', 'args', 'id', 'status', 'receiptId'];
    const rows = raw.todoTips;
    if (!Array.isArray(rows) || rows.length !== state.items.length || rows.some((row, index) =>
      !row || typeof row !== 'object' || Array.isArray(row) || ['text', 'source', 'tool'].some(key => !Object.hasOwn(row, key)) ||
      Object.keys(row).some(key => !fields.includes(key) || !same(row[key], state.items[index][key])) ||
      !same(row.args ?? {}, state.items[index].args))) throw fail('已有 Todo 不能被模型覆盖、删除或重新勾选；执行阶段只返回 steps/question/done，可用顶层 todoId 指向当前事项，不要返回 todoTips', 'todo-immutable');
    const { todoTips, ...planned } = raw;
    return planned;
  }
  function requestsAppend(text) {
    // “播放添加到队列里的歌曲” refers to the previous result; it is not
    // another append request. Do not treat this relative clause as a command.
    const commands = text.replace(/(?:已|刚刚?)?(?:加入|添加|追加)(?:到)?队列(?:里|中)?的(?:歌曲|曲目|音乐|歌)/g, '队列曲目');
    return /(?:加入|添加|追加).{0,8}队列/.test(commands);
  }
  function install(state, rows, app) {
    const items = definitions(rows);
    const scopes = new Set(items.map(row => Contract.tools[row.tool].app || row.args.platform).filter(Boolean));
    if (!app && scopes.size > 1) throw fail('本次包含多个应用的目标，请先选择一个应用；尚未开放跨应用写流程', 'todo-scope');
    if (items.some(row => row.source >= state.sources.length) || state.sources.some((_, index) => !items.some(row => row.source === index)) ||
      items.some((row, index) => index && row.source < items[index - 1].source)) throw fail('Todo 必须按顺序覆盖每项原始要求，不能遗漏或重排', 'todo-order');
    for (const row of items) {
      const tool = Contract.tools[row.tool];
      if (app && ((tool.app && tool.app !== app) || (tool.apps && !tool.apps.includes(app)))) throw fail('Todo 超出了已选择应用的范围', 'todo-scope');
      if (['tools.load', 'context.read'].includes(row.tool)) throw fail('加载工具和读取上下文不能作为业务目标的完成条件');
    }
    // A computed answer is never evidence that an action happened. A source that asks for a change must keep a
    // goal verified by that action's own receipt; compute.run may only be an extra analysis goal beside it.
    for (const [source, text] of state.sources.entries()) {
      const group = items.filter(row => row.source === source);
      if (group.length && group.every(row => row.tool === 'compute.run') && actionText.test(text)) throw fail(`第${source + 1}项“${text.slice(0, 40)}”含有需要执行的动作，不能只用 compute.run 验收；compute.run 只能作为分析目标，请为动作另设用对应动作工具验收的目标`, 'todo-arguments');
      // After a computation in the same source, free text the user never wrote can only be a guess or a placeholder: its real
      // value is whatever the computation produces. A Todo cannot be edited afterwards, so such a value could never be matched
      // by the real call and the task would only stop after repeated failures. Enums, booleans and numbers stay (acceptance
      // conditions the model may choose); a value written in the source text is the user's own and stays too. Keys here are
      // registered tool fields, and the value is never echoed.
      const first = group.findIndex(row => row.tool === 'compute.run');
      if (first >= 0) for (const row of group.slice(first + 1)) for (const [key, value] of Object.entries(row.args)) {
        if (typeof value !== 'string' || Contract.tools[row.tool].enums?.[key] || text.includes(value)) continue;
        throw fail(`Todo 第${items.indexOf(row) + 1}项 ${row.tool} 的 ${key} 要由前面的 compute.run 分析得出，原文里没有写明，不能在清单里预先填写（占位文字也不行）；args 写成空对象，执行阶段再按分析结果填写真实值`, 'todo-arguments');
      }
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
    if (plan.answer) {
      if (task.todoTips?.items.length || !Contract.canAnswer(task.input)) throw fail('当前需求需要真实工具或补充信息，不能用纯回答替代执行', 'plan-phase');
      return;
    }
    if (plan.todoTips && !task.todoTips) task.todoTips = create(task.input);
    const state = task.todoTips;
    if (!state) return; // Legacy snapshots acquire Todo through Tools.plan on their next planning pass.
    if (plan.todoTips) {
      if (state.items.length) throw fail('已有 Todo 不能被模型覆盖、删除或重新勾选，请继续当前未完成项', 'todo-immutable');
      install(state, plan.todoTips, task.input.app);
    }
    if (plan.question) return;
    if (!state.items.length) throw fail('必须先建立完整 Todo，再执行工具', 'todo-missing');
    const active = current(state);
    if (plan.done && active) throw fail(`Todo 尚未完成：${active.text}。缺少该目标的真实成功回执，历史回执不能验收新目标。${active.tool.startsWith('music.queue.') ? '缺少当前队列状态时先调用 music.state，再按真实 revision 继续；状态查询不代表播放或修改完成。' : '请继续当前事项，不能结束整个任务。'}`, 'todo-incomplete');
    if (plan.steps.length && !active) throw fail('Todo 已全部完成，不能追加原计划之外的动作');
    if (plan.todoId && plan.todoId !== active?.id) throw fail(`必须按 Todo 顺序执行当前事项 ${active?.id}`, 'todo-order');
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
    const readyKeep = active.tool === 'music.queue.reconcile' && active.args.action === 'keep' &&
      ['music.state', 'music.queue.list'].includes(step.tool) && data.status === 'ready' && Number.isInteger(data.count) && data.count > 0 &&
      typeof data.revision === 'string' && Boolean(data.revision.trim());
    if (!emptyClear && !clearEquivalent && !readyKeep && (active.tool !== step.tool || Object.entries(active.args).some(([key, value]) => args[key] !== value))) return;
    if (active.tool === 'music.queue.removeArtist' && (!Number.isInteger(data.removedCount) || data.removedCount < 0)) return;
    if (active.tool === 'music.queue.play' && (data.isPlaying !== true || (active.args.mode && data.mode !== active.args.mode))) return;
    if (active.tool === 'music.queue.apply' && (!Number.isInteger(data.count) || data.count < 1 || (args.startPlayback && data.isPlaying !== true))) return;
    if (['music.queue.clear', 'music.queue.reconcile'].includes(active.tool) && (active.tool === 'music.queue.clear' || active.args.action === 'clear') && data.count !== 0) return;
    active.status = 'completed'; active.receiptId = receipt.id;
  }
  // The user may press a visible “+” / “播放” on a candidate instead of letting the model run
  // `music.queue.apply`. That click is an explicit user decision, executed by the same Engine
  // with a real receipt, but it carries neither a todoId nor the tool the Todo was registered
  // with, so `observe()` can never tick it. Accept it only for a pending local-queue goal, and
  // only on real evidence: a non-waiting choice receipt plus the player-confirmed playback
  // record (the choice handlers throw unless the player confirmed). Never a model claim.
  const choicePlayback = { 'music.enqueue-collection': 'replace', 'music.play-collection': 'replace', 'music.enqueue': 'append', 'music.play': 'append' };
  function observeChoice(task, choice, outcome, receipt) {
    const state = task.todoTips, active = current(state);
    if (!active || !receipt || receipt.status !== 'done' || active.tool !== 'music.queue.apply') return;
    if (!Object.hasOwn(choicePlayback, choice?.action)) return;
    if (['waiting', 'review', 'clarify'].includes(outcome?.status)) return;
    const playback = outcome?.playback;
    if (!playback || playback.mode !== choicePlayback[choice.action] || typeof playback.songId !== 'string' || !playback.songId ||
      !Number.isInteger(playback.count) || playback.count < 1) return;
    // The click replaces the queue and starts playback; refuse when the user's own words ruled that out.
    if (/不要|先不|先别|不替换|保留原|不播放|别播放/.test(state.sources[active.source] || '')) return;
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
    if (prerequisites && !['tools.load', 'context.read', 'memory.recall', 'compute.run', ...prerequisites].includes(step.tool)) throw fail(`当前 Todo 是“${active.text}”，不能提前执行其他事项`);
    if (step.tool === active.tool && Object.entries(active.args).some(([key, value]) => step.args[key] !== value)) throw fail('执行参数不符合当前 Todo 的验收目标，请重新规划');
    if (active.tool === 'music.queue.clear' && step.tool === 'music.queue.reconcile' && step.args.action !== 'clear') throw fail('当前 Todo 要求清空，不能改为保留队列');
  }
  function view(task) {
    if (!task.todoTips) return null;
    const value = copy(task.todoTips), active = current(value);
    if (active && ['waiting', 'review', 'clarify', 'failed', 'interrupted', 'cancelled'].includes(task.status)) active.status = task.status;
    return value;
  }
  return Object.freeze({ create, completionFields, definitions, validate, current, awaitingAnswer, answers, executionPlan, install, local, prepare, observe, observeChoice, before, view });
});
