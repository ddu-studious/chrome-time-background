(function () {
  'use strict';
  const send = (action, data = {}) => new Promise(resolve => chrome.runtime.sendMessage({ action, ...data }, response => resolve(response || { ok: false, error: chrome.runtime.lastError?.message || '后台未响应，请重试' })));
  window.mountSmartAlarm = function (center) {
    const container = document.createElement('section');
    container.className = 'smart-alarm';
    container.innerHTML = `
      <div class="assistant-session-bar"><strong data-session-state>新提醒</strong><button type="button" class="alarm-text-button" data-session-edit>编辑当前需求</button><button type="button" class="alarm-text-button" data-session-end>结束本次</button></div>
      <p data-session-summary></p>
      <details class="assistant-transcript"><summary>本次对话</summary><div data-session-history></div></details>
      <form class="smart-alarm-form">
        <label for="smart-alarm-text">一句话，记住接下来要做的事</label>
        <div class="smart-alarm-input-row">
          <input id="smart-alarm-text" maxlength="500" autocomplete="off" placeholder="明天下午三点提醒我开会" required>
          <button class="alarm-primary-button" type="submit">设置闹钟 ↵</button>
        </div>
      </form>
      <div class="smart-alarm-examples"><span>试着说</span><button type="button" data-example="20分钟后提醒我休息">20 分钟后休息</button><button type="button" data-example="每周一三五晚上八点提醒我运动">每周一三五运动</button></div>
      <div class="smart-alarm-result" role="status" aria-live="polite" hidden></div>
      <div class="smart-alarm-choices" aria-label="补充提醒或选择闹钟"></div>
      <div class="smart-alarm-toolbar">
        <button type="button" class="alarm-text-button" data-smart-confirm hidden>确认设置</button>
        <button type="button" class="alarm-text-button" data-smart-reset hidden>新建另一条</button>
        <div class="smart-alarm-result-actions" hidden>
          <button type="button" class="alarm-text-button" data-smart-edit>修改此闹钟</button>
          <button type="button" class="alarm-text-button" data-smart-undo>撤销创建</button>
        </div>
        <button type="button" class="alarm-text-button" data-smart-cancel hidden>停止解析，保留会话</button>
      </div>
      <details class="smart-alarm-settings">
        <summary>本地 AI <span data-ai-summary>简单时间可离线识别</span></summary>
        <p>复杂口语交给电脑上的 Qwen。先在项目的 local-ai 目录运行 npm start，再粘贴 .local/token 文件内容。</p>
        <label class="smart-alarm-reasoning">推理等级 <select data-ai-reasoning disabled aria-label="推理等级（由 AI 控制台管理）"><option value="off">关闭 · off（默认）</option><option value="low">低 · low</option></select></label>
        <p>推理等级由统一控制台管理。<a href="settings.html#ai-control" target="_blank" rel="noopener">打开 AI 控制台</a> 修改模型、推理等级和调用策略。</p>
        <div class="smart-alarm-input-row"><input type="password" data-ai-token autocomplete="off" aria-label="本地 AI 连接令牌" placeholder="粘贴本地服务连接令牌"><button class="alarm-secondary-button" type="button" data-ai-save>保存设置</button><button class="alarm-secondary-button" type="button" data-ai-check>检查状态</button></div>
        <p data-ai-status role="status">连接仅保存在这台设备上，提醒不会自动转发到云端。</p>
      </details>`;
    center.root.querySelector('.alarm-next-card').before(container);
    const input = container.querySelector('#smart-alarm-text');
    const submit = container.querySelector('[type="submit"]');
    const result = container.querySelector('.smart-alarm-result');
    const actions = container.querySelector('.smart-alarm-result-actions');
    const choices = container.querySelector('.smart-alarm-choices');
    const reset = container.querySelector('[data-smart-reset]');
    const cancel = container.querySelector('[data-smart-cancel]');
    let activeJob = null, ready = null, saving = false;
    let storage; try { storage = window.sessionStorage; } catch {}
    const session = AssistantSession.create('alarm', storage, { history: event => send('ai_history_write', { body: { operation: 'event', event } }) });
    function editing() {
      session.set({ editingText: input.value });
      if (ready) { ready = null; session.set({ ready: null, state: 'waiting' }); feedback('修改尚未发送，请点击“发送补充”更新本次提醒'); renderSession(); }
    }
    input.addEventListener('input', editing);
    const confirm = container.querySelector('[data-smart-confirm]');
    const sessionState = container.querySelector('[data-session-state]');
    function renderSession() {
      const d = session.data;
      const labels = { idle: '新提醒', active: '本次会话 · 正在理解', waiting: '本次会话 · 待补充', review: '本次会话 · 待确认，可继续修改', error: '本次会话 · 可继续补充或重试', completed: '本次会话 · 已设置并结束', cancelled: '本次会话 · 已结束，未保存' };
      sessionState.textContent = labels[d.state] + (d.historyWarning ? ' · ' + d.historyWarning : '');
      container.querySelector('[data-session-summary]').textContent = d.draft ? AlarmIntent.draftSummary(d.draft) : '';
      const history = container.querySelector('[data-session-history]'); history.replaceChildren();
      for (const turn of d.turns) { const row = document.createElement('p'); row.textContent = `${turn.role === 'user' ? '你' : '助手'}：${turn.content}`; history.append(row); }
      submit.textContent = session.open ? '发送补充 ↵' : '设置闹钟 ↵';
      input.placeholder = session.open ? '继续补充，或修正当前提醒' : '明天下午三点提醒我开会';
      reset.hidden = false; reset.disabled = saving;
      container.querySelector('.smart-alarm-examples').hidden = session.open;
      confirm.hidden = !ready;
      container.querySelector('[data-session-edit]').disabled = !session.open || busy;
      container.querySelector('[data-session-end]').disabled = !session.open || saving;
    }
    function endSession() {
      if (saving) return;
      generation++; cancelJob(activeJob); activeJob = null; busy = false; ready = null;
      session.end('cancelled'); choices.replaceChildren(); actions.hidden = true; cancel.hidden = true;
      submit.disabled = input.disabled = reset.disabled = false; input.value = '';
      feedback('本次会话已结束，未保存提醒。下一次输入会开启新会话。'); renderSession();
    }
    container.querySelector('[data-session-end]').addEventListener('click', endSession);
    container.querySelector('[data-session-edit]').addEventListener('click', () => {
      if (busy || !session.open) return;
      const d = session.data.draft;
      input.value = d ? `${d.kind === 'relative' ? `${d.delayMinutes}分钟后` : `${d.date || (d.kind === 'daily' ? '每天' : '')}${d.clockHour != null ? `${d.period || ''}${d.clockHour}点${d.minute || 0}分` : d.hour != null ? `${String(d.hour).padStart(2,'0')}:${String(d.minute || 0).padStart(2,'0')}` : ''}`}提醒我${d.label || ''}` : session.data.turns.filter(t => t.role === 'user').map(t => t.content).join('，');
      editing(); input.focus();
    });
    const cancelJob = jobId => { if (jobId) void send('ai_job_cancel', { jobId }).catch(() => {}); };
    cancel.addEventListener('click', () => {
      generation++; cancelJob(activeJob); activeJob = null; busy = false;
      cancel.hidden = true; submit.disabled = false; input.disabled = false; reset.disabled = false; reset.hidden = false;
      session.set({ state: 'error' }); input.value = session.data.pendingText || input.value; feedback('已停止解析，会话仍保留，可以继续补充或重试'); renderSession(); input.focus();
    });
    const reasoningSelect = container.querySelector('[data-ai-reasoning]');
    const reasoningLabels = { off: '关闭 · off（默认）', low: '低 · low', medium: '中 · medium', high: '高 · high', xhigh: '极高 · xhigh', on: '开启 · on（模型策略）' };
    function renderReasoning(options, selected) {
      reasoningSelect.replaceChildren();
      const available = [...new Set(options)].filter(value => Object.hasOwn(reasoningLabels, value));
      if (!available.includes(selected)) available.push(selected);
      for (const value of available) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = (reasoningLabels[value] || value) + (options.includes(value) ? '' : '（当前模型不支持）');
        option.disabled = !options.includes(value);
        reasoningSelect.append(option);
      }
      reasoningSelect.value = selected;
    }
    void send('local_ai_preferences').then(preferences => {
      if (!preferences.ok) return;
      const selected = preferences.reasoning || 'off';
      renderReasoning([selected, 'off'], selected);
      if (preferences.configured) {
        container.querySelector('[data-ai-token]').placeholder = '已保存，留空保留原令牌';
        void checkConnection();
      }
    });
    let turns = session.data.turns, anchor = session.data.anchor, busy = false, saved = null, generation = 0;
    function feedback(text, error = false) {
      result.hidden = false; result.textContent = text; result.classList.toggle('error', error);
    }
    function startNew() {
      if (saving) return;
      cancelJob(activeJob); activeJob = null; busy = false; ready = null;
      session.start(); turns = []; anchor = null; saved = null; generation++;
      choices.replaceChildren(); actions.hidden = true; result.hidden = true; cancel.hidden = true;
      submit.disabled = input.disabled = reset.disabled = false; input.value = ''; renderSession(); input.focus();
    }
    async function commitRename(draft, candidate) {
      const stored = await send('user_alarm_rename', {
        selector: draft.selector, label: draft.label,
        ...(candidate ? { alarmId: candidate.id, expectedRevision: candidate.revision } : {})
      });
      if (!stored.ok) throw new Error(stored.error || '改名失败');
      choices.replaceChildren();
      if (stored.status === 'choose') {
        feedback('这个时间有多个闹钟，请选择要改名的那一个：'); reset.hidden = false;
        for (const item of stored.candidates) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'alarm-secondary-button';
          button.textContent = `${item.date} ${item.time} · ${item.label}`;
          button.addEventListener('click', async () => {
            if (busy) return;
            busy = saving = true; renderSession(); submit.disabled = true; reset.disabled = true; input.disabled = true;
            try { await commitRename(draft, item); }
            catch (error) { choices.replaceChildren(); feedback(error.message, true); }
            finally { busy = saving = false; renderSession(); submit.disabled = false; reset.disabled = false; input.disabled = false; }
          });
          choices.append(button);
        }
        return;
      }
      if (stored.status !== 'renamed' || !stored.alarm) throw new Error('未收到改名成功回执');
      saved = stored.alarm; turns = []; anchor = null; input.value = ''; session.end(); renderSession();
      feedback(`已修改名称：${saved.date} ${saved.time} · ${saved.label}`);
      actions.hidden = false; container.querySelector('[data-smart-undo]').hidden = true;
      await center.refresh();
    }
    reset.addEventListener('click', startNew);
    container.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { if (!busy) { startNew(); input.value = button.dataset.example; } }));
    container.querySelector('[data-smart-edit]').addEventListener('click', () => { if (saved) center.openEditor(saved.id); });
    container.querySelector('[data-smart-undo]').addEventListener('click', async event => {
      if (!saved) return;
      const target = saved.id, version = generation;
      event.target.disabled = true;
      try {
        const response = await send('user_alarm_delete', { alarmId: target });
        if (!response.ok) throw new Error(response.error || '撤销失败');
        await center.refresh();
        if (version === generation) { saved = null; actions.hidden = true; feedback('已撤销本次创建'); }
      } catch (error) { feedback(error.message, true); }
      finally { event.target.disabled = false; }
    });
    async function checkConnection() {
      const status = container.querySelector('[data-ai-status]');
      const before = reasoningSelect.value;
      status.textContent = '正在检查本地服务…';
      const response = await send('local_ai_status');
      const labels = { ready: '模型已就绪', not_loaded: '模型未加载，首次解析需要准备', busy: '模型繁忙', model_missing: '默认模型未下载' };
      if (response.ok) renderReasoning(response.reasoningOptions || [], reasoningSelect.value !== before ? reasoningSelect.value : response.selectedReasoning || 'off');
      status.textContent = response.ok ? `${response.model} · ${labels[response.state] || response.state} · 已保存推理等级：${response.selectedReasoning || 'off'}` : response.error;
      container.querySelector('[data-ai-summary]').textContent = response.ok ? labels[response.state] : '未连接';
    }
    container.querySelector('[data-ai-check]').addEventListener('click', checkConnection);
    container.querySelector('[data-ai-save]').addEventListener('click', async () => {
      const token = container.querySelector('[data-ai-token]');
      const response = await send('local_ai_configure', { token: token.value, reasoning: reasoningSelect.value });
      if (!response.ok) { container.querySelector('[data-ai-status]').textContent = response.error; return; }
      token.value = ''; token.placeholder = '连接令牌已保存';
      await checkConnection();
    });
    container.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || !input.value.trim()) return;
      busy = true; submit.disabled = true; input.disabled = true; reset.disabled = true;
      const version = ++generation; saved = null; actions.hidden = true; cancel.hidden = false; activeJob = null;
      choices.replaceChildren();
      const text = input.value.trim();
      if (!session.open) { session.start(); anchor = null; turns = []; }
      anchor ??= Date.now();
      ready = null; confirm.hidden = true;
      let request;
      try { request = session.request(text); } catch (error) { busy = false; submit.disabled = input.disabled = reset.disabled = false; cancel.hidden = true; feedback(error.message, true); renderSession(); return; }
      session.set({ anchor }); renderSession();
      feedback('正在理解时间…复杂口语首次使用时可能需要加载本地模型。');
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (session.data.timeZone && session.data.timeZone !== zone) throw new Error('时区已变化，请新建另一条提醒以确认时间；原对话仍保留');
        session.set({ timeZone: zone });
        let response = await send('smart_alarm_interpret', { text, now: anchor, currentNow: Date.now(), timeZone: zone, ...request, conversation: true });
        if (version !== generation) { cancelJob(response.jobId); return; }
        activeJob = response.jobId || null;
        const deadline = Date.now() + 100000;
        while (response.ok && response.status === 'pending') {
          if (Date.now() > deadline) throw new Error('模型响应超时，尚未创建闹钟，请重试或手动设置');
          await new Promise(resolve => setTimeout(resolve, 1200));
          if (version !== generation) return;
          response = await send('smart_alarm_result', { jobId: activeJob });
          if (version !== generation) return;
        }
        if (!response.ok) throw new Error(response.error || '解析失败');
        session.set({ currentSource: response.source || null });
        cancel.hidden = true;
        if (response.status === 'needs_clarification') {
          session.reply(text, response.question, 'waiting', response.draft ?? session.data.draft); turns = session.data.turns;
          feedback(response.question); input.value = ''; renderSession();
          for (const option of response.options || []) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'alarm-secondary-button'; button.textContent = option;
            button.addEventListener('click', () => { if (!busy) { input.value = option; container.querySelector('form').requestSubmit(); } }); choices.append(button);
          }
          return;
        }
        if (response.timeZone !== zone) throw new Error('时区已变化，请重新输入提醒');
        if (response.status === 'ready' && response.intent === 'rename') {
          saving = true; renderSession();
          try { await commitRename(response); if (session.open) session.set({state:'waiting'}); } finally { saving = false; }
          return;
        }
        if (response.status !== 'ready' || !response.alarm) throw new Error('未得到有效时间，请手动设置');
        ready = response;
        session.reply(text, `待确认：${response.displayText}。可继续修改，确认后才会保存。`, 'review', response.draft ?? session.data.draft);
        session.set({ ready }); turns = session.data.turns; input.value = '';
        feedback(`待确认：${response.displayText}。点击“确认设置”，或继续输入修改。`); renderSession();

      } catch (error) { if (version === generation) { cancelJob(activeJob); session.reply(text, error.message || '解析失败，请重试', 'error'); turns = session.data.turns; feedback(error.message || '暂时无法创建，请重试或手动设置', true); renderSession(); } }
      finally { if (version === generation) { activeJob = null; cancel.hidden = true; busy = false; submit.disabled = false; input.disabled = false; reset.disabled = false; renderSession(); if (center.root.classList.contains('open')) input.focus({ preventScroll: true }); } }
    });
    confirm.addEventListener('click', async () => {
      if (!ready || busy || saving) return;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (ready.timeZone !== zone || (ready.alarm.fireAt && ready.alarm.fireAt <= Date.now())) {
        ready = null; session.set({ state: 'waiting', ready: null }); feedback('时间已过或时区已变化，请继续补充新的日期和时间', true); renderSession(); return;
      }
      saving = busy = true; confirm.disabled = submit.disabled = input.disabled = reset.disabled = true; renderSession();
      try {
        const stored = await send('user_alarm_save', { alarm: { ...ready.alarm, id: `smart_${session.data.id}`, smartInput: true } });
        if (!stored.ok || !stored.alarm) throw new Error(stored.error || '保存失败，请重试');
        saved = stored.alarm; ready = null; session.end();
        feedback(`${stored.duplicate ? '已有相同提醒' : '已设置'}：${saved.date || '重复提醒'} ${saved.time} · ${saved.label}`);
        actions.hidden = false; container.querySelector('[data-smart-undo]').hidden = Boolean(stored.duplicate); await center.refresh();
      } catch (error) { feedback(error.message, true); }
      finally { saving = busy = false; confirm.disabled = submit.disabled = input.disabled = reset.disabled = false; renderSession(); }
    });
    if (session.open) {
      ready = session.data.state === 'review' ? session.data.ready || null : null;
      input.value = session.data.editingText || session.data.pendingText || '';
      feedback(ready ? `待确认：${ready.displayText}` : session.data.turns.at(-1)?.content || '已恢复未完成的会话，请继续补充');
    }
    renderSession();
  };
})();
