(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./assistant-contract.js') : root.AssistantContract);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantEngine = api;
})(globalThis, function (Contract) {
  'use strict';
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
  function create({ storage, plan, execute, choose, history = async () => {}, cancelJob = async () => {}, now = Date.now, id = () => crypto.randomUUID() }) {
    let current = null, serial = Promise.resolve(), work = null;
    const lock = fn => { const result = serial.then(fn); serial = result.catch(() => {}); return result; };
    const save = async () => {
      current.updatedAt = now();
      const saved = clone(current);
      // Live tool bodies are ephemeral; opt-in archival remains owned by history-store.
      saved.trace = (saved.trace || []).map(({ input, output, error, ...row }) => row);
      await storage.set({ [KEY]: saved });
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
      try { const result = await history(event); if (result?.ok === false) throw new Error('历史写入失败'); }
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
      return clone({ id, version, status, input, message, log, updatedAt, result, scope, musicView, playback, operation, choices, historyWarning: current.historyWarning, memoryNotice: current.memoryNotice,
        conversationId: current.conversationId || id, turnId: current.turnId || id, startedAt: current.runStartedAt || current.startedAt, endedAt: current.endedAt,
        conversationTitle: current.conversationTitle || input.text, startMode: current.startMode, routeReason: current.routeReason,
        messages: current.messages || [], trace: current.trace || [], traceRevision: current.traceRevision || 0,
        traceTruncated: current.traceTruncated, messagesTruncated: current.messagesTruncated, modelCalls: current.modelCalls || [],
        memorySummary: { candidateCount: (current.candidateSet?.choices || []).filter(c => !c.secondary && !['navigation', 'collection-action'].includes(c.kind)).length, expiresAt: current.candidateSet?.expiresAt } });
    }
    function guard(t, version) { if (current !== t || t.version !== version || !['planning', 'running'].includes(t.status)) throw abort(); }
    function context(t, version, parentId = null) {
      return {
        spanId: parentId,
        guard: () => guard(t, version), task: t,
        async trace(tool, title, input, fn, kind = 'operation') {
          guard(t, version);
          const span = { id: `${t.turnId || t.id}:tool:${t.traceSequence = (t.traceSequence || 0) + 1}`, role: 'tool', tool, title, kind, conversationId: t.conversationId || t.id, turnId: t.turnId || t.id, parentId, startedAt: now() };
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
    async function accept(t, version, outcome) {
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
        t.turns.push({ role: 'assistant', content: t.message.slice(0, 500) }); t.turns = t.turns.slice(-16);
        const waiting = ['waiting', 'review', 'clarify'].includes(outcome.status);
        t.log.at(-1).status = waiting ? 'waiting' : 'done';
        t.log.at(-1).message = t.message;
        t.observations = [...(t.observations || []), { tool: t.log.at(-1).tool, status: waiting ? 'waiting' : 'done', message: t.message.slice(0, 500), data: outcome.observation || null }].slice(-6);
        while (JSON.stringify(t.observations).length > 12000 && t.observations.length > 1) t.observations.shift();
        if (waiting) t.status = outcome.status;
        else t.index++;
        await save();
      });
    }
    async function nextPlan(t, version, ctx) {
      guard(t, version);
      if ((t.planRounds || 0) >= 12) throw new Error('已达到本次任务的12轮规划上限，请核对已完成操作');
      if (now() - (t.runStartedAt || t.startedAt) > 300000) throw new Error('处理已超过五分钟，请核对已完成步骤');
      t.planRounds = (t.planRounds || 0) + 1;
      const planned = await ctx.trace('assistant.plan', '规划执行步骤', t.input, async child => Contract.validatePlan(await plan(t.input, child), t.input.app), 'plan');
      await lock(async () => {
        guard(t, version); t.jobId = null;
        if (planned.done && !t.observations?.length) throw new Error('尚无执行结果，不能完成');
        if (planned.question) { t.status = 'clarify'; t.message = planned.question; t.turns.push({ role: 'assistant', content: planned.question }); }
        else {
          t.plan = planned.steps; t.index = 0; t.adaptive = Boolean(planned.continue); t.status = 'running';
          t.remainingSteps = [];
          if (t.plan.length) t.scope = t.input.app || Contract.tools[t.plan[0].tool].app || t.plan[0].args.platform || t.scope;
        }
        await save();
      });
    }
    async function pump(t, version, selectedChoice) {
      try {
        const ctx = context(t, version);
        if (selectedChoice) await accept(t, version, await ctx.trace(selectedChoice.action, selectedChoice.title || '执行所选操作', { title: selectedChoice.title, data: selectedChoice.data }, child => choose(selectedChoice, child), 'action'));
        else if (t.status === 'planning') await nextPlan(t, version, ctx);
        while (current === t && t.version === version && t.status === 'running') {
          if (t.index >= t.plan.length && t.adaptive) {
            await nextPlan(t, version, ctx);
            if (t.status !== 'running') break;
            if (t.index < t.plan.length) continue;
          }
          if (t.index >= t.plan.length) {
            await lock(async () => {
              guard(t, version); t.status = 'completed'; if (!t.keepChoices) t.choices = [];
              if (t.log.length > 1) t.message = t.log.filter(step => step.status === 'done' && step.tool !== 'tools.load').map(step => step.message).join('\n').slice(0, 1500);
              await save();
            }); break;
          }
          if (now() - (t.runStartedAt || t.startedAt) > 300000) throw new Error('处理已超过五分钟，请核对已完成步骤后重新发起');
          if ((t.toolCalls || 0) >= 12) throw new Error('已达到本次任务的12次工具调用上限，请核对已完成操作');
          t.toolCalls = (t.toolCalls || 0) + 1;
          const step = t.plan[t.index];
          await lock(async () => {
            guard(t, version); t.message = `正在${Contract.tools[step.tool].title}…`;
            t.log.push({ tool: step.tool, title: Contract.tools[step.tool].title, status: 'running' }); await save();
          });
          await accept(t, version, await ctx.trace(step.tool, Contract.tools[step.tool].title, step.args, child => execute(step, child), 'tool'));
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
              await accept(t, version, await ctx.trace(chosen.action, chosen.title, { reason:'用户要求直接播放，搜索仅返回一个候选', data:chosen.data }, child => choose(chosen, child), 'action'));
            }
          }
        }
      } catch (error) {
        await lock(async () => {
          if (current !== t || t.version !== version) return;
          if (t.jobId) void cancelJob(t.jobId).catch(() => {});
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
      async submit(raw) {
        await ready;
        const route = Contract.routeRequest(raw, current), input = route.input;
        const utterance = input.text || Contract.skills.find(skill => skill.id === input.skill)?.name || '新需求';
        const ordinal = Contract.ordinal(input.text);
        if (ordinal) {
          if (route.mode === 'new') throw new Error('新需求没有上轮候选，请输入完整需求，或按 Enter 接着上次选择');
          return this.selectOrdinal({ ...raw, app:input.app, text:input.text }, ordinal);
        }
        const directChoice = route.mode === 'continue' && (alarmConfirmationChoice(current, input) || directContinuationChoice(current, input));
        if (directChoice) return this.choose(raw.taskId || current.id, directChoice.id, raw.version, input.text);
        return lock(async () => {
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
      async selectOrdinal(raw, ordinal = Contract.ordinal(raw.text)) {
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
        return this.choose(current.id, selected.id, raw.version, raw.text);
      },
      async choose(taskId, choiceId, expectedVersion, userText) {
        await ready;
        return lock(async () => {
          if (current?.id !== taskId || !['waiting', 'review', 'completed', 'failed'].includes(current.status)) throw new Error('候选已过期，请重新查询');
          if (expectedVersion != null && expectedVersion !== current.version) throw new Error('候选页面已变化，请重新选择');
          const choice = current.choices.find(item => item.id === choiceId);
          if (!choice) throw new Error('候选无效');
          if (now() > (current.candidateSet?.expiresAt ?? current.updatedAt + 600000)) throw new Error('候选已超过十分钟，请重新查询');
          if (current.status === 'completed') {
            if (!current.choiceStep) throw new Error('请重新搜索');
            current.plan = [clone(current.choiceStep)]; current.index = 0; current.adaptive = false;
            current.log = [{ tool: current.choiceStep.tool, title: Contract.tools[current.choiceStep.tool].title, status: 'running' }];
          }
          current.selectionView = clone({ choices: current.choices, musicView: current.musicView || null, message: current.message, result: current.result || null });
          current.status = 'running'; current.version++; current.runStartedAt = now(); current.usedModel = false;
          current.turnId = id(); current.endedAt = null;
          current.toolCalls = 0; current.planRounds = 0;
          current.turns.push({ role: 'user', content: userText || `选择：${choice.title}` }); current.turns = current.turns.slice(-16);
          current.operation = { choiceId, action: choice.action, title: choice.title, status: 'pending', message: '正在准备所选操作…' };
          if (!current.log.length) current.log.push({ tool: choice.action, title: choice.title });
          current.log.at(-1).status = 'running'; current.message = '正在执行所选操作…';
          await record(current, 'user', userText || `选择：${choice.title}`, `choice:${current.version}`);
          await save(); launch(current, choice); return view();
        });
      },
      async cancel(taskId) {
        await ready;
        return lock(async () => {
          if (current?.id !== taskId) throw new Error('会话已变化');
          if (current.jobId) void cancelJob(current.jobId).catch(() => {});
          current.version++; current.status = 'cancelled'; current.choices = []; current.jobId = null;
          current.endedAt = now(); current.candidateSet = null;
          await interruptTools(current, 'cancelled');
          if (current.operation) current.operation = { ...current.operation, status: 'cancelled', message: '已停止后续操作，已提交的播放不会撤销。' };
          current.message = '已停止后续执行。已经提交的播放、开页或提醒操作不会撤销，可根据步骤记录核对。';
          await record(current, 'assistant', current.message, `cancelled:${current.version}`); await save(); return view();
        });
      },
      async clear() { await ready; return lock(async () => { if (current && ['running', 'planning'].includes(current.status)) throw new Error('请先停止当前任务'); current = null; await storage.remove(KEY); return null; }); },
      async settled() { await ready; await work; await serial; return view(); }
    };
  }
  return { create, KEY };
});
