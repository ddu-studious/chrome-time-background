(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./assistant-contract.js') : root.AssistantContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantEngine = api;
})(globalThis, function (Contract) {
  'use strict';
  const Context = typeof module === 'object' && module.exports ? require('./assistant-context-state.js') : globalThis.AssistantContextState;
  const Todo = typeof module === 'object' && module.exports ? require('./assistant-todo.js') : globalThis.AssistantTodo;
  const KEY = 'quickAssistantTaskV1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const abort = () => Object.assign(new Error('任务已停止'), { name: 'AbortError' });
  function alarmConfirmationChoice(task, input) {
    if (!task || task.scope !== 'alarm' || task.status !== 'review' || (input.app && input.app !== 'alarm') || input.skill) return null;
    // Only a complete affirmative reply can consume the current confirmation card.
    // Questions, negations and edits must still go through normal interpretation.
    const text = input.text.replace(/\s/g, '').replace(/[。！!，,]+$/, '');
    if (!/^(?:(?:好的?|可以|行|确认)(?:吧|了)?|(?:请|帮我)?(?:直接|就这样|就按这个)?(?:确认)?(?:创建|设置|保存)(?:吧|一下)?)$/.test(text)) return null;
    const choices = task.choices || [];
    return choices.length === 1 && choices[0].action === 'alarm.create' ? choices[0] : null;
  }
  function directContinuationChoice(task, input) {
    if (!task || task.scope !== 'music' || (input.app && input.app !== 'music') || !['waiting', 'completed', 'failed'].includes(task.status)) return null;
    const text = input.text.replace(/[\s，。！？、,.!?]/g, '');
    if (!/^(?:请|帮我)?(?:直接)?(?:播放|放|听)(?:这个歌手的|该歌手的|他的|她的)?(?:热门歌曲|热门歌|代表作)(?:吧|一下)?$/.test(text) || task.musicView?.kind !== 'artist') return null;
    const choices = (task.choices || []).filter(choice => ['music.enqueue-collection', 'music.play-artist'].includes(choice.action) && /热门歌曲/.test(choice.title || ''));
    return choices.length === 1 ? choices[0] : null;
  }
  // Canonical identity of a read-only proposal. Oversized arguments are never
  // treated as duplicates, so this cannot hide a genuinely different request.
  function readFingerprint(step) {
    if (!step || !Contract.tools[step.tool]?.readOnly) return null;
    const canonical = value => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const args = JSON.stringify(canonical(step.args || {}));
    return args.length > 2000 ? null : `${step.tool}\n${args}`;
  }
  function traceValue(value) {
    const seen = new WeakSet();
    function visit(v, depth = 0) {
      if (typeof v === 'string') return (v.length > 2000 ? v.slice(0, 1960) + '\n[文本已截断]' : v).replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]').replace(/https?:\/\/[^\s"<>]+/g, '[链接已省略]');
      if (v == null || typeof v === 'number' || typeof v === 'boolean') return v ?? null;
      if (typeof v !== 'object') return undefined;
      if (depth > 6 || seen.has(v)) return '[深层或重复内容省略]';
      seen.add(v);
      if (Array.isArray(v)) return v.length > 50 ? { total: v.length, truncated: true, items: v.slice(0, 50).map(item => visit(item, depth + 1)) } : v.map(item => visit(item, depth + 1));
      return Object.fromEntries(Object.entries(v).filter(([key, val]) => !/token|password|secret|authorization|cookie|audio|api.?key|url|headers|^cover$|^task$|^memory$|^browseStack$|^selectionView$/i.test(key) && typeof val !== 'function').map(([key, val]) => [key, visit(val, depth + 1)]));
    }
    const result = visit(value), json = JSON.stringify(result ?? null);
    return json.length > 8000 ? { truncated: true, preview: json.slice(0, 8000) } : result;
  }
  function create({ storage, plan, compact, execute, choose, onChange = () => {}, history = async () => {}, cancelJob = async () => {}, now = Date.now, id = () => crypto.randomUUID() }) {
    let current = null, serial = Promise.resolve(), work = null;
    const lock = fn => { const result = serial.then(fn); serial = result.catch(() => {}); return result; };
    const interactionKinds = { review: 'confirm', waiting: 'select', clarify: 'input', failed: 'inspect', interrupted: 'inspect' };
    function interaction(t) {
      const kind = interactionKinds[t?.status];
      if (!kind) return null;
      const previous = t.interaction;
      const expiresAt = previous?.version === t.version && previous.status === t.status ? previous.expiresAt
        : (['waiting', 'review'].includes(t.status) && t.candidateSet?.expiresAt) || (t.updatedAt || now()) + 600000;
      return { id: `${t.id}:${t.version}`, version: t.version, status: t.status, kind, expiresAt, allowText: kind !== 'inspect' };
    }
    function checkInteraction(expected) {
      const active = interaction(current);
      if (!expected || !active || expected.id !== active.id || expected.status !== active.status || now() >= active.expiresAt) throw new Error('交互卡已失效，请查看工作台最新状态');
      return active;
    }
    const save = async () => {
      current.interaction = interaction(current);
      current.updatedAt = now();
      const saved = clone(current);
      // Live tool bodies are ephemeral; opt-in archival remains owned by history-store.
      saved.trace = (saved.trace || []).map(({ input, output, error, ...row }) => row);
      try { await storage.set({ [KEY]: saved }); }
      catch (error) { throw Object.assign(new Error(error.message || '任务进度保存失败'), { code: 'ASSISTANT_STORAGE_FAILED' }); }
      // Optional displays cannot delay execution or turn a saved write into failure.
      try { Promise.resolve(onChange(view())).catch(() => {}); } catch (_) {}
    };
    async function emit(t, event) {
      t.trace ||= [];
      if (event.phase === 'start') t.trace.push({ ...event, status: 'running' });
      else {
        const index = t.trace.findIndex(row => row.id === event.id);
        if (index >= 0 && t.trace[index].status === 'running') t.trace[index] = { ...t.trace[index], ...event, elapsedMs: event.endedAt - event.startedAt };
      }
      if (t.trace.length > 400) { t.trace = t.trace.slice(-400); t.traceTruncated = true; }
      t.traceRevision = (t.traceRevision || 0) + 1;
      try { const result = await history(event); if (result?.ok === false) throw new Error('历史写入失败'); if (result?.memoryWarning) t.memoryNotice = result.memoryWarning; }
      catch { t.historyWarning = '本机历史服务不可用，部分执行记录未留存'; }
    }
    async function finishTool(t, span, status, output, error) {
      if (!t.activeTools?.[span.id]) return;
      delete t.activeTools[span.id];
      await emit(t, { ...span, phase: 'end', status, endedAt: Math.max(span.startedAt, now()), output: traceValue(output), ...(error ? { error: traceValue({ message: error.message, code: error.code, name: error.name }) } : {}) });
    }
    async function interruptTools(t, status) {
      for (const span of Object.values(t.activeTools || {})) await finishTool(t, span, status, { message: status === 'cancelled' ? '已停止后续执行，已提交操作可能已生效，请核对结果' : '浏览器后台重启，未收到完成回执' });
    }
    async function record(t, role, content, suffix = role) {
      const eventId = `${t.turnId || t.id}:${suffix}`;
      t.messages ||= [];
      if (!t.messages.some(row => row.id === eventId)) t.messages.push({ id: eventId, turnId: t.turnId || t.id, role, content: String(content).slice(0, 1500), at: now() });
      if (t.messages.length > 100) { t.messages = t.messages.slice(-100); t.messagesTruncated = true; }
      try { const result = await history({ id: eventId, conversationId: t.conversationId || t.id, startedAt: t.startedAt, scene: 'assistant', role, content, status: t.status, source: !t.usedModel && role === 'assistant' && !['failed', 'cancelled', 'interrupted'].includes(t.status) ? 'rules' : null }); if (result?.ok === false) throw new Error('未留存'); }
      catch { t.historyWarning = '本机历史服务不可用，部分对话未留存'; }
    }
    const ready = (async () => {
      const saved = (await storage.get(KEY))[KEY];
      if (saved?.id && Array.isArray(saved.log) && Array.isArray(saved.turns)) current = saved;
      if (current && ['planning', 'running'].includes(current.status)) {
        Context.uncertain(current);
        current.status = 'interrupted'; current.version++;
        current.message = '上次处理被浏览器中断。已提交的动作可能已经生效，请核对结果后继续；不会自动重复执行。';
        current.endedAt = now();
        if (current.jobId) await cancelJob(current.jobId).catch(() => {});
        current.jobId = null; await save();
        await interruptTools(current, 'interrupted'); await record(current, 'assistant', current.message, `interrupted:${current.version}`); await save();
      }
    })();
    function view() {
      if (!current) return null;
      const { id, version, status, input = {text:''}, message, log, updatedAt, result, scope, musicView, playback, operation } = current;
      const choices = (current.choices || []).filter(c => c.action !== 'music.play-collection' || !(current.choices || []).some(other => other.action === 'music.enqueue-collection' && other.data?.id === c.data?.id && other.data?.kind === c.data?.kind))
        .map(({ id, title, subtitle, label, kind, cover, detail, secondary, parentId, action }) => {
          if (action === 'music.enqueue') title = title.replace('加入队列', '加入并播放');
          if (action === 'music.enqueue-collection') { title = title.replace('加入队列', '替换并播放').replace(/^加入/, '替换队列并播放'); if (!secondary) label = '替换并播放'; }
          return { id, title, subtitle, label, kind, cover, detail, secondary, parentId, action };
        });
      return clone({ id, version, status, input, message, log, updatedAt, result, scope, musicView, playback, operation, choices, todoTips: Todo.view(current), interaction: interaction(current), historyWarning: current.historyWarning, memoryNotice: current.memoryNotice, contextNotice: current.contextNotice, contextSummary: current.contextState ? { count: current.contextState.count, checkpoint: current.contextState.checkpoint ? { sdk: current.contextState.checkpoint.sdk, beforeEstimatedTokens: current.contextState.checkpoint.beforeEstimatedTokens, afterEstimatedTokens: current.contextState.checkpoint.afterEstimatedTokens } : null } : null,
        conversationId: current.conversationId || id, turnId: current.turnId || id, startedAt: current.runStartedAt || current.startedAt, endedAt: current.endedAt,
        conversationTitle: current.conversationTitle || input.text, startMode: current.startMode, routeReason: current.routeReason,
        messages: current.messages || [], trace: current.trace || [], traceRevision: current.traceRevision || 0,
        traceTruncated: current.traceTruncated, messagesTruncated: current.messagesTruncated, modelCalls: current.modelCalls || [], recoveryCount: current.recovery?.count || 0,
        memorySummary: { candidateCount: (current.candidateSet?.choices || []).filter(c => !c.secondary && !['navigation', 'collection-action'].includes(c.kind)).length, expiresAt: current.candidateSet?.expiresAt } });
    }
    function guard(t, version) { if (current !== t || t.version !== version || !['planning', 'running'].includes(t.status)) throw abort(); }
    function context(t, version, parentId = null) {
      return {
        spanId: parentId,
        async saveContext() { await lock(async () => { guard(t, version); await save(); }); },
        async reserveAction() { await lock(async () => {
          guard(t, version);
          if ((t.toolCalls || 0) >= 12 || now() - (t.runStartedAt || t.startedAt) > 300000) throw Object.assign(new Error('已达到本次任务执行上限，未自动提交操作'), { code: 'ASSISTANT_USER_INPUT_REQUIRED' });
          t.toolCalls = (t.toolCalls || 0) + 1; await save();
        }); },
        async effectStarted() { await lock(async () => { guard(t, version); if (t.log.at(-1)) t.log.at(-1).sideEffectStarted = true; await save(); }); },
        guard: () => guard(t, version), task: t,
        async trace(tool, title, input, fn, kind = 'operation') {
          guard(t, version);
          const span = { id: `${t.turnId || t.id}:tool:${t.traceSequence = (t.traceSequence || 0) + 1}`, role: 'tool', tool, title, kind, conversationId: t.conversationId || t.id, turnId: t.turnId || t.id, parentId, sourceStartedAt: t.conversationStartedAt || t.startedAt, startedAt: now() };
          t.activeTools ||= {}; t.activeTools[span.id] = span;
          await emit(t, { ...span, phase: 'start', input: traceValue(input) });
          await lock(async () => { if (current === t) await save(); });
          try {
            guard(t, version);
            const output = await fn(context(t, version, span.id));
            guard(t, version);
            const failed = output?.ok === false || (kind === 'request' && output?.code != null && ![0, 200].includes(output.code));
            const status = failed ? 'failed' : ['waiting', 'review', 'clarify', 'needs_clarification'].includes(output?.status) || output?.question ? 'waiting' : 'succeeded';
            await finishTool(t, span, status, output, failed ? new Error(typeof output.error === 'string' ? output.error : '操作未成功') : null);
            return output;
          } catch (error) {
            const stopped = current !== t || t.version !== version || error.name === 'AbortError';
            await finishTool(t, span, stopped ? 'cancelled' : 'failed', null, error); throw error;
          } finally { await lock(async () => { if (current === t) await save(); }); }
        },
        async trackJob(jobId) { await lock(async () => { guard(t, version); t.jobId = jobId; await save(); }); },
        async modelCall(metadata) { await lock(async () => { guard(t, version); t.modelCalls ||= []; t.modelCalls.push({ ...metadata, turnId: t.turnId || t.id, toolCallId: parentId }); t.modelCalls = t.modelCalls.slice(-80); await save(); }); },
        async progress(message) { await lock(async () => { guard(t, version); t.message = String(message).slice(0, 400); if (t.operation?.status === 'pending') t.operation.message = t.message; await save(); }); }
      };
    }
    async function accept(t, version, outcome, step) {
      await lock(async () => {
        guard(t, version);
        if (!outcome || typeof outcome.message !== 'string') throw new Error('工具没有返回可核对的结果');
        t.jobId = null; t.message = outcome.message.slice(0, 1500);
        if (outcome.memory) t.memory = { ...t.memory, ...outcome.memory };
        if (outcome.choices) {
          t.choices = outcome.choices.slice(0, 96);
          t.keepChoices = Boolean(outcome.keepChoices);
          const before = t.candidateSet;
          const identity = rows => rows.filter(c => !c.secondary && !['navigation', 'collection-action'].includes(c.kind)).map(c => c.id).join('|');
          const same = before && identity(before.choices) === identity(t.choices);
          t.candidateSet = { choices: clone(t.choices), expiresAt: same ? before.expiresAt : now() + 600000, musicView: outcome.musicView || t.musicView || null };
        } else if (!t.keepChoices) t.choices = [];
        if (outcome.playback) t.playback = outcome.playback;
        if (t.operation?.status === 'pending') t.operation = { ...t.operation, status: 'succeeded', message: t.message };
        if (outcome.choices?.length && t.plan[t.index]) t.choiceStep = clone(t.plan[t.index]);
        if (outcome.musicView) t.musicView = outcome.musicView;
        if (outcome.browseStack) t.browseStack = outcome.browseStack;
        t.result = outcome.result || null;
        Context.state(t);
        t.turns.push({ role: 'assistant', content: t.message.slice(0, 500) }); t.turns = t.turns.slice(-16);
        const waiting = ['waiting', 'review', 'clarify'].includes(outcome.status);
        t.log.at(-1).status = waiting ? 'waiting' : 'done';
        t.log.at(-1).message = t.message;
        // Successful read-only calls since the last write, choice or recovery. Anything
        // else changes the world (or the plan), so an identical read may return new data.
        if (step && Contract.tools[step.tool]?.readOnly) {
          const fingerprint = readFingerprint(step);
          if (fingerprint && !waiting) t.readSeen = [...(t.readSeen || []).filter(item => item !== fingerprint), fingerprint].slice(-24);
        } else t.readSeen = [];
        let observation;
        try { observation = Context.observe(t, { tool: t.log.at(-1).tool, status: waiting ? 'waiting' : 'done', message: t.message.slice(0, 500), data: outcome.observation || null }, t.log.at(-1)); }
        catch (error) { await save(); throw error; }
        Todo.observe(t, t.log.at(-1), observation, Context.state(t).receipts.at(-1));
        t.observations = [...(t.observations || []), observation].slice(-6);
        while (JSON.stringify(t.observations).length > 12000 && t.observations.length > 1) t.observations.shift();
        if (waiting) t.status = outcome.status;
        else t.index++;
        await save();
      });
    }
    async function recover(t, version, error, step, phase) {
      guard(t, version);
      const stopped = error.name === 'AbortError' || [401, 403, 429].includes(error.statusCode) ||
        ['ASSISTANT_STORAGE_FAILED', 'ASSISTANT_USER_INPUT_REQUIRED', 'CONTROL_POLICY_CHANGED', 'auth-required', 'auth-expired', 'not-connected', 'oauth-not-configured'].includes(error.code);
      const modelRepair = phase === 'plan' && ['MODEL_OUTPUT_FORMAT_INVALID', 'ASSISTANT_PLAN_INVALID'].includes(error.code);
      const safeTool = phase !== 'plan' && (error.sideEffectState === 'none' || Contract.tools[step.tool]?.readOnly);
      const unknown = phase !== 'plan' && error.sideEffectState === 'unknown';
      if (stopped || (!modelRepair && !safeTool && !unknown)) return false;
      const message = String(error.message || '操作失败').replace(/(?:Bearer\s+\S+|(?:token|password|secret|cookie|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+)/gi, '[凭证已隐藏]').replace(/https?:\/\/[^\s"<>]+/g, '[链接已省略]').slice(0, 400);
      const code = /^[a-zA-Z0-9_.-]{1,80}$/.test(error.code || '') ? error.code : 'TOOL_EXECUTION_FAILED';
      const args = traceValue(step.args || {});
      const issue = modelRepair ? Contract.planIssue(error.planIssue || error.execution?.planIssue) : null;
      const phaseKey = modelRepair ? (t.todoTips?.items.length ? 'execute' : 'outline') : null;
      const fingerprint = JSON.stringify([step.tool, args, code, ...(modelRepair ? [phaseKey, issue] : [])]);
      const recovery = t.recovery ||= { count: 0, failures: [] };
      const repeats = recovery.failures.filter(value => value === fingerprint).length;
      if (recovery.count >= 3 || repeats >= 1 || (t.planRounds || 0) >= 12 || (t.toolCalls || 0) >= 12 || now() - (t.runStartedAt || t.startedAt) >= 300000) {
        if (safeTool && !unknown && t.log.at(-1)?.status === 'running') { t.log.at(-1).status = 'failed'; t.log.at(-1).message = message; }
        throw Object.assign(new Error(`${repeats >= 1 ? '同一操作重复失败' : '已达到本次任务的恢复或执行上限'}，已停止自动恢复。最近错误：${message}`), { code: 'ASSISTANT_RECOVERY_LIMIT' });
      }
      await lock(async () => {
        guard(t, version);
        if (unknown) { Context.uncertain(t); recovery.unknown = true; }
        if (phase !== 'plan' && t.log.at(-1)?.status === 'running') {
          t.log.at(-1).status = 'failed'; t.log.at(-1).message = message;
        }
        recovery.count++; recovery.failures.push(fingerprint);
        // A failed or unknown tool run may have changed state: verification reads are legitimate again.
        if (phase !== 'plan') t.readSeen = [];
        const observation = Context.observe(t, { tool: phase === 'action' ? 'assistant.action' : step.tool, status: unknown ? 'unknown' : 'failed', message,
          data: { operation: step.tool, error: { code, message, ...(issue ? { planIssue: issue } : {}) }, args, recovery: { attempt: recovery.count, remaining: 3 - recovery.count, sideEffectState: unknown ? 'unknown' : 'none' } } });
        Todo.observe(t, t.log.at(-1), observation, Context.state(t).receipts.at(-1));
        t.observations = [...(t.observations || []), observation].slice(-6);
        while (JSON.stringify(t.observations).length > 12000 && t.observations.length > 1) t.observations.shift();
        if (phase !== 'plan') t.remainingSteps = clone(t.plan.slice(t.index));
        t.plan = []; t.index = 0; t.adaptive = true; t.status = 'planning'; t.jobId = null;
        t.choices = []; t.keepChoices = false; t.candidateSet = null;
        if (t.operation?.status === 'pending') t.operation = { ...t.operation, status: 'failed', message };
        t.message = `步骤失败，正在根据错误重新规划（${recovery.count}/3）${unknown ? '；仅允许查询核对，未确认的操作不会重做' : ''}…`;
        await record(t, 'status', t.message, `recovery:${recovery.count}`);
        await save();
      });
      return true;
    }
    async function nextPlan(t, version, ctx) {
      guard(t, version);
      if ((t.planRounds || 0) >= 12) throw new Error('已达到本次任务的12轮规划上限，请核对已完成操作');
      if (now() - (t.runStartedAt || t.startedAt) > 300000) throw new Error('处理已超过五分钟，请核对已完成步骤');
      t.planRounds = (t.planRounds || 0) + 1;
      let planned;
      try {
        planned = await ctx.trace('assistant.plan', t.todoTips?.items.length ? '规划当前待办的下一步' : '分析完整待办清单', t.input, async child => {
          const value = await plan(t.input, child);
          try {
            guard(t, version);
            const validated = Contract.validatePlan(Todo.executionPlan(value, t.todoTips), t.input.app);
            Todo.prepare(t, validated);
            if (validated.steps.length === 1) Todo.before(t, validated.steps[0]);
            const repeated = readFingerprint(validated.steps[0]);
            if (repeated && (t.readSeen || []).includes(repeated)) throw Contract.planFailure(`已读取过完全相同的「${Contract.tools[validated.steps[0].tool].title}」，且之后没有写入、选择或失败恢复，重复读取不会有新信息。请依据已有回执给出下一步、用 question 说明需要用户提供什么，或在原始要求已满足时输出 done。`, 'plan-no-progress');
            return validated;
          }
          catch (error) { error.code = 'ASSISTANT_PLAN_INVALID'; throw error; }
        }, 'plan');
      } catch (error) {
        if (await recover(t, version, error, { tool: 'assistant.plan', args: {} }, 'plan')) return;
        throw error;
      }
      await lock(async () => {
        guard(t, version); t.jobId = null;
        if (planned.done && Context.state(t).uncertain) planned = { question: '已有操作的结果尚未确认。请核对实际状态后再继续，助手不会自动重做可能已生效的操作。', steps: [] };
        if (planned.done && (!t.observations?.some(row => row.status === 'done') || ['failed', 'unknown'].includes(t.observations.at(-1)?.status))) throw new Error('尚无成功恢复回执，不能声称完成');
        if (planned.question) { t.status = 'clarify'; t.message = planned.question; t.turns.push({ role: 'assistant', content: planned.question }); Context.append(t, 'assistant', planned.question); }
        else if (planned.todoTips && !planned.steps.length) {
          t.plan = []; t.index = 0; t.adaptive = true; t.status = 'planning';
          t.message = `已分析完整计划，共${t.todoTips.items.length}项，准备逐项执行。`;
        }
        else {
          t.plan = planned.steps; t.index = 0; t.adaptive = Boolean(planned.continue) || Boolean(!Context.state(t).uncertain && Todo.current(t.todoTips) && (
            Todo.current(t.todoTips).tool !== planned.steps[0]?.tool || t.todoTips.items.filter(row => row.status !== 'completed').length > planned.steps.length)); t.status = 'running';
          t.remainingSteps = [];
          if (t.plan.length) t.scope = t.input.app || Contract.tools[t.plan[0].tool].app || t.plan[0].args.platform || t.scope;
        }
        await save();
      });
    }
    async function pump(t, version, selectedChoice) {
      try {
        const ctx = context(t, version);
        const run = async (step, title, fn, kind = 'tool') => {
          try { return await ctx.trace(step.tool, title, step.args, fn, kind); }
          catch (error) { if (await recover(t, version, error, step, kind)) return null; throw error; }
        };
        if (selectedChoice) {
          const outcome = await run({ tool: selectedChoice.action, args: { title: selectedChoice.title, data: selectedChoice.data } }, selectedChoice.title || '执行所选操作', child => choose(selectedChoice, child), 'action');
          if (outcome) await accept(t, version, outcome);
        }
        while (current === t && t.version === version && ['planning', 'running'].includes(t.status)) {
          if (t.status === 'planning') {
            await nextPlan(t, version, ctx);
            if (t.status === 'planning') continue;
            if (t.status !== 'running') break;
          }
          if (t.index >= t.plan.length && (t.adaptive || (Todo.current(t.todoTips) && !Context.state(t).uncertain))) {
            await nextPlan(t, version, ctx);
            if (t.status === 'planning') continue;
            if (t.status !== 'running') break;
            if (t.index < t.plan.length) continue;
          }
          if (t.index >= t.plan.length) {
            await lock(async () => {
              if (Context.state(t).uncertain && (!selectedChoice || t.recovery?.unknown)) {
                guard(t, version); t.status = 'clarify'; t.choices = [];
                t.message = '已有操作的结果尚未确认，请核对实际状态后再继续；不会自动重做可能已生效的操作。';
                await save(); return;
              }
              guard(t, version); t.status = 'completed'; if (!t.keepChoices) t.choices = [];
              if (t.log.length > 1) t.message = t.log.filter(step => step.status === 'done' && step.tool !== 'tools.load').map(step => step.message).join('\n').slice(0, 1500);
              await save();
            }); break;
          }
          if (now() - (t.runStartedAt || t.startedAt) > 300000) throw new Error('处理已超过五分钟，请核对已完成步骤后重新发起');
          if ((t.toolCalls || 0) >= 12) throw new Error('已达到本次任务的12次工具调用上限，请核对已完成操作');
          t.toolCalls = (t.toolCalls || 0) + 1;
          const step = t.plan[t.index];
          if (Context.state(t).uncertain && !Contract.tools[step.tool].readOnly) throw new Error('上次操作结果未确认，请先查询并核对实际状态，再新建需求；不会自动重做可能已生效的操作');
          const actionKey = Context.actionKey(t, step);
          await lock(async () => {
            guard(t, version); t.message = `正在${Contract.tools[step.tool].title}…`;
            const todo = Todo.current(t.todoTips);
            if (todo) todo.status = 'running';
            t.log.push({ tool: step.tool, ...(todo ? { todoId: todo.id, args: clone(step.args) } : {}), title: Contract.tools[step.tool].title, status: 'running', ...(actionKey ? { key: actionKey } : {}) }); await save();
          });
          const outcome = await run(step, Contract.tools[step.tool].title, child => {
            if (actionKey && Context.state(t).receipts.some(row => row.key === actionKey)) throw Object.assign(new Error('该操作已有成功回执，已阻止重复执行，请继续尚未完成的步骤'), { code: 'ASSISTANT_DUPLICATE_ACTION', sideEffectState: 'none' });
            return execute(step, child);
          });
          if (!outcome) continue;
          await accept(t, version, outcome, step);
          // Only an explicit direct-play request and a single real candidate can skip disambiguation.
          if (t.status === 'waiting' && t.musicView?.kind === 'search' && !t.memory?.artistRequest && /直接播放/.test(t.input.text) && !/不要|不想|别|先不|不要直接|不用|如果/.test(t.input.text)) {
            const primary = t.choices.filter(c => !c.secondary && ['song', 'artist', 'album', 'playlist'].includes(c.kind));
            const chosen = primary.length === 1 ? primary[0].action === 'music.browse' ? t.choices.find(c => c.parentId === primary[0].id && c.action === 'music.enqueue-collection') : primary[0].action === 'music.play' ? primary[0] : null : null;
            if (chosen) {
              await lock(async () => {
                if (current !== t || t.version !== version || t.status !== 'waiting') throw abort();
                t.selectionView = clone({ choices:t.choices, musicView:t.musicView, message:t.message });
                t.status = 'running'; t.message = `已找到唯一候选：${primary[0].title}，正在准备播放…`;
                t.operation = { choiceId:chosen.id, action:chosen.action, title:chosen.title, status:'pending', message:t.message }; await save();
              });
              const outcome = await run({ tool: chosen.action, args: { reason:'用户要求直接播放，搜索仅返回一个候选', data:chosen.data } }, chosen.title, child => choose(chosen, child), 'action');
              if (outcome) await accept(t, version, outcome);
            }
          }
        }
      } catch (error) {
        await lock(async () => {
          if (current !== t || t.version !== version) return;
          if (t.jobId) void cancelJob(t.jobId).catch(() => {});
          Context.uncertain(t);
          t.jobId = null; t.status = 'failed'; t.message = error.message || '执行失败，请重试';
          if (t.operation) t.operation = { ...t.operation, status: 'failed', message: t.message };
          if (t.log.at(-1)?.status === 'running') t.log.at(-1).status = 'failed';
          await save();
        });
      } finally {
        await lock(async () => { if (t.version !== version) return; t.endedAt = now(); await record(t, 'assistant', t.message, `reply:${version}`); if (current === t) await save(); });
      }
    }
    function launch(t, choice) { const promise = pump(t, t.version, choice); work = promise; promise.finally(() => { if (work === promise) work = null; }).catch(() => {}); }
    return {
      async snapshot() { await ready; return view(); },
      async respond(taskId, version, response) {
        await ready;
        if (current?.id !== taskId || current.version !== version) throw new Error('交互卡已失效');
        const expected = checkInteraction(response?.interaction);
        if (response.action === 'cancel') return this.cancel(taskId, version, expected);
        if (response.action === 'select' && ['select', 'confirm'].includes(expected.kind)) return this.choose(taskId, response.choiceId, version, undefined, false, expected);
        if (response.action === 'reply' && expected.allowText) {
          if (typeof response.text !== 'string' || !response.text.trim() || response.text.length > 500) throw new Error('请输入1至500字的补充内容');
          return this.submit({ text: response.text, app: current.scope, taskId, version }, expected);
        }
        throw new Error('当前交互不支持该操作');
      },
      async submit(raw, expectedInteraction) {
        await ready;
        if (expectedInteraction) checkInteraction(expectedInteraction);
        const route = expectedInteraction
          ? { input: Contract.input(raw), mode: 'continue', reason: '回答当前问题' }
          : Contract.routeRequest(raw, current);
        const input = route.input;
        const utterance = input.text || Contract.skills.find(skill => skill.id === input.skill)?.name || '新需求';
        const ordinal = Contract.ordinal(input.text);
        if (ordinal && (!expectedInteraction || current.status === 'waiting')) {
          if (route.mode === 'new') throw new Error('新需求没有上轮候选，请输入完整需求，或按 Enter 接着上次选择');
          return this.selectOrdinal({ ...raw, app:input.app, text:input.text }, ordinal, expectedInteraction);
        }
        const directChoice = route.mode === 'continue' && (alarmConfirmationChoice(current, input) || directContinuationChoice(current, input));
        if (directChoice) return this.choose(raw.taskId || current.id, directChoice.id, raw.version, input.text, false, expectedInteraction);
        return lock(async () => {
          if (expectedInteraction) checkInteraction(expectedInteraction);
          if (current && ['planning', 'running'].includes(current.status)) throw new Error('当前任务正在执行，请先停止或等待完成');
          const continuing = Boolean(current) && route.mode === 'continue';
          const replacing = Boolean(current) && route.mode === 'replace';
          if (raw.taskId && raw.taskId !== current?.id) throw new Error('会话已变化，请刷新后重试');
          if (raw.version != null && raw.version !== current?.version) throw new Error('会话已变化，请刷新后重试');
          const previous = continuing || replacing ? current : null;
          if (current && !continuing && !replacing) await record(current, 'status', '已开始下一项需求，本次会话结束；已有播放和已保存提醒继续生效。', `closed:${current.version}`);
          const sameScope = previous && (!input.app || input.app === previous.scope);
          const inheritedAI = Object.hasOwn(input, 'ai') ? input.ai : previous?.input?.ai || null;
          const { ai: _requestedAI, ...taskInput } = input;
          const task = { id: id(), version: 1, status: 'planning', input: { ...taskInput, app: input.app || previous?.scope || null, ...(inheritedAI ? { ai:clone(inheritedAI) } : {}) },
            scope: input.app || previous?.scope || null, plan: [], index: 0, choices: [], log: [], memory: continuing ? clone(previous?.memory || {}) : {}, observations: continuing ? clone(previous?.observations || []) : [],
            remainingSteps: continuing && sameScope && ['waiting', 'review', 'clarify'].includes(previous.status) ? previous.plan?.slice(previous.index + 1) || previous.remainingSteps || [] : [],
            turns: [...(previous?.turns || []), { role: 'user', content: utterance }].slice(-16), message: '正在理解需求…', startedAt: now(), jobId: null };
          if (continuing && previous) task.contextState = clone(Context.state(previous));
          if (continuing && sameScope && Todo.current(previous?.todoTips)) task.todoTips = clone(previous.todoTips);
          // Migrate the surviving legacy window once; no claim of recovering
          // already discarded history. New contexts store inputs before slicing.
          if (!task.contextState) { Context.state(task); }
          else Context.append(task, 'user', utterance);
          task.turnId = task.id;
          task.conversationTitle = previous?.conversationTitle || previous?.input?.text || utterance;
          task.startMode = route.mode; task.routeReason = route.reason;
          Object.assign(task, { messages: clone(previous?.messages || []), trace: clone(previous?.trace || []), modelCalls: clone(previous?.modelCalls || []), traceRevision: previous?.traceRevision || 0, traceTruncated: previous?.traceTruncated, messagesTruncated: previous?.messagesTruncated });
          if (sameScope && continuing) {
            task.candidateSet = clone(previous.candidateSet || null);
            task.choices = clone(previous.candidateSet?.choices || []); task.keepChoices = Boolean(task.choices.length);
            task.musicView = previous.musicView; task.browseStack = clone(previous.browseStack || []); task.choiceStep = clone(previous.choiceStep || null);
          }
          // Stable object references survive turns; authority is still checked on use.
          for (const record of Object.values(task.memory.musicRefs || {})) record.taskId = task.id;
          task.conversationId = previous?.conversationId || previous?.id || task.id;
          task.conversationStartedAt = previous?.conversationStartedAt || previous?.startedAt || task.startedAt;
          current = task; await record(task, 'user', utterance); await save(); launch(task); return view();
        });
      },
      async selectOrdinal(raw, ordinal = Contract.ordinal(raw.text), expectedInteraction) {
        await ready;
        if (!current || !ordinal || raw.taskId !== current.id || (raw.app && raw.app !== current.scope)) throw new Error('当前没有可引用的候选，请先搜索');
        const source = current.candidateSet?.choices || current.choices || [];
        const primary = source.filter(c => !c.secondary && !['navigation', 'collection-action'].includes(c.kind));
        let selected = primary[ordinal.index - 1];
        // A filtered UI sends the exact rendered IDs, never labels or tool arguments.
        if (raw.candidateIds !== undefined) {
          if (!Array.isArray(raw.candidateIds) || raw.candidateIds.length > 96 || new Set(raw.candidateIds).size !== raw.candidateIds.length || raw.candidateIds.some(id => !primary.some(c => c.id === id))) throw new Error('候选页面已变化，请重新选择');
          selected = primary.find(c => c.id === raw.candidateIds[ordinal.index - 1]);
        }
        if (!selected) throw new Error('当前列表没有这个候选，请重新选择');
        if (ordinal.play && selected.action === 'music.browse' && !(selected.kind === 'artist' && current.memory?.artistRequest?.goal === 'play')) {
          selected = source.find(c => c.parentId === selected.id && ['music.enqueue-collection', 'music.play-collection'].includes(c.action));
          if (!selected) throw new Error('这个候选暂不能直接播放');
        }
        return this.choose(current.id, selected.id, raw.version, raw.text, false, expectedInteraction);
      },
      async choose(taskId, choiceId, expectedVersion, userText, reviewOnly = false, expectedInteraction) {
        await ready;
        return lock(async () => {
          if (expectedInteraction) checkInteraction(expectedInteraction);
          if (current?.id !== taskId || !['waiting', 'review', 'completed', 'failed'].includes(current.status)) throw new Error('候选已过期，请重新查询');
          if (reviewOnly && current.status !== 'review') throw new Error('该确认卡已失效');
          if (expectedVersion != null && expectedVersion !== current.version) throw new Error('候选页面已变化，请重新选择');
          const choice = current.choices.find(item => item.id === choiceId);
          if (!choice) throw new Error('候选无效');
          if (current.contextState?.receipts.some(row => row.status === 'unknown' && (!row.choiceId || row.choiceId === choice.id))) throw new Error('该操作的上次结果未确认，请先核对实际状态后新建需求');
          if (now() > (current.candidateSet?.expiresAt ?? current.updatedAt + 600000)) throw new Error('候选已超过十分钟，请重新查询');
          Context.append(current, 'user', userText || `选择：${choice.title}`);
          if (current.status === 'completed') {
            if (!current.choiceStep) throw new Error('请重新搜索');
            current.plan = [clone(current.choiceStep)]; current.index = 0; current.adaptive = false;
            current.log = [{ tool: current.choiceStep.tool, title: Contract.tools[current.choiceStep.tool].title, status: 'running' }];
          }
          current.selectionView = clone({ choices: current.choices, musicView: current.musicView || null, message: current.message, result: current.result || null });
          current.status = 'running'; current.version++; current.runStartedAt = now(); current.usedModel = false;
          current.turnId = id(); current.endedAt = null;
          current.toolCalls = 0; current.planRounds = 0; current.readSeen = [];
          current.recovery = { count: 0, failures: [] };
          current.turns.push({ role: 'user', content: userText || `选择：${choice.title}` }); current.turns = current.turns.slice(-16);
          current.operation = { choiceId, action: choice.action, title: choice.title, status: 'pending', message: '正在准备所选操作…' };
          if (!current.log.length) current.log.push({ tool: choice.action, title: choice.title });
          current.log.at(-1).status = 'running'; current.message = '正在执行所选操作…';
          await record(current, 'user', userText || `选择：${choice.title}`, `choice:${current.version}`);
          await save(); launch(current, choice); return view();
        });
      },
      async cancel(taskId, expectedVersion, expectedInteraction) {
        await ready;
        return lock(async () => {
          if (expectedInteraction) checkInteraction(expectedInteraction);
          if (current?.id !== taskId) throw new Error('会话已变化');
          if (expectedVersion != null && (current.version !== expectedVersion || (!expectedInteraction && current.status !== 'review'))) throw new Error('该确认卡已失效');
          if (current.jobId) void cancelJob(current.jobId).catch(() => {});
          Context.uncertain(current);
          current.version++; current.status = 'cancelled'; current.choices = []; current.jobId = null;
          current.endedAt = now(); current.candidateSet = null;
          await interruptTools(current, 'cancelled');
          if (current.operation) current.operation = { ...current.operation, status: 'cancelled', message: '已停止后续操作，已提交的播放不会撤销。' };
          current.message = '已停止后续执行。已经提交的播放、开页或提醒操作不会撤销，可根据步骤记录核对。';
          await record(current, 'assistant', current.message, `cancelled:${current.version}`); await save(); return view();
        });
      },
      async compact(taskId) {
        await ready;
        let t, version, previousStatus, previousMessage;
        await lock(async () => {
          if (!compact || !current || current.id !== taskId || ['planning', 'running'].includes(current.status)) throw new Error('请等待当前步骤结束后整理上下文');
          t = current; previousStatus = t.status; previousMessage = t.message; t.runStartedAt = now(); t.status = 'planning'; version = ++t.version; t.message = '正在整理上下文…'; await save();
        });
        try { await compact(context(t, version), true); }
        finally { await lock(async () => { if (current === t && t.version === version) { t.status = previousStatus; t.message = ['review', 'waiting', 'clarify'].includes(previousStatus) ? previousMessage : t.contextNotice || '本次没有需要整理的旧记录'; t.jobId = null; await save(); } }); }
        return view();
      },
      async clear() { await ready; return lock(async () => { if (current && ['running', 'planning'].includes(current.status)) throw new Error('请先停止当前任务'); current = null; await storage.remove(KEY); try { Promise.resolve(onChange(null)).catch(() => {}); } catch (_) {} return null; }); },
      async settled() { await ready; await work; await serial; return view(); }
    };
  }
  return { create, KEY };
});
