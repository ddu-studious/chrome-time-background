(function () {
  'use strict';
  const send = (action, data = {}) => new Promise(resolve => chrome.runtime.sendMessage({ action, ...data }, response => resolve(response || { ok: false, error: chrome.runtime.lastError?.message || '后台未响应，请重试' })));
  window.mountSmartAlarm = function (center) {
    const container = document.createElement('section');
    container.className = 'smart-alarm';
    container.innerHTML = `
      <form class="smart-alarm-form">
        <label for="smart-alarm-text">一句话，记住接下来要做的事</label>
        <div class="smart-alarm-input-row">
          <input id="smart-alarm-text" maxlength="500" autocomplete="off" placeholder="明天下午三点提醒我开会" required>
          <button class="alarm-primary-button" type="submit">设置闹钟 ↵</button>
        </div>
      </form>
      <div class="smart-alarm-examples"><span>试着说</span><button type="button" data-example="20分钟后提醒我休息">20 分钟后休息</button><button type="button" data-example="每周一三五晚上八点提醒我运动">每周一三五运动</button></div>
      <div class="smart-alarm-result" role="status" aria-live="polite" hidden></div>
      <div class="smart-alarm-choices" aria-label="选择要改名的闹钟"></div>
      <div class="smart-alarm-result-actions" hidden>
        <button type="button" class="alarm-text-button" data-smart-edit>修改</button>
        <button type="button" class="alarm-text-button" data-smart-undo>撤销创建</button>
      </div>
      <button type="button" class="alarm-text-button" data-smart-reset hidden>重新输入一条提醒</button>
      <details class="smart-alarm-settings">
        <summary>本地 AI <span data-ai-summary>简单时间可离线识别</span></summary>
        <p>复杂口语交给电脑上的 Qwen。先在项目的 local-ai 目录运行 npm start，再粘贴 .local/token 文件内容。</p>
        <label class="smart-alarm-reasoning">推理等级 <select data-ai-reasoning aria-label="推理等级"><option value="off">关闭 · off（默认）</option><option value="low">低 · low</option></select></label>
        <p>检查状态后显示当前模型支持的等级。修改后点击“保存设置”，从下一条复杂口语请求生效；等级越高，通常等待越久。</p>
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
    let turns = [], anchor = null, busy = false, saved = null, generation = 0;
    function feedback(text, error = false) {
      result.hidden = false; result.textContent = text; result.classList.toggle('error', error);
    }
    function startNew() { turns = []; anchor = null; saved = null; generation++; choices.replaceChildren(); actions.hidden = true; reset.hidden = true; result.hidden = true; input.value = ''; input.placeholder = '明天下午三点提醒我开会'; input.focus(); }
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
            busy = true; submit.disabled = true; reset.disabled = true; input.disabled = true;
            try { await commitRename(draft, item); }
            catch (error) { choices.replaceChildren(); feedback(error.message, true); }
            finally { busy = false; submit.disabled = false; reset.disabled = false; input.disabled = false; }
          });
          choices.append(button);
        }
        return;
      }
      if (stored.status !== 'renamed' || !stored.alarm) throw new Error('未收到改名成功回执');
      saved = stored.alarm; turns = []; anchor = null; input.value = ''; reset.hidden = true;
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
      generation++; saved = null; actions.hidden = true;
      choices.replaceChildren();
      const text = input.value.trim(); anchor ??= Date.now();
      feedback('正在理解时间…复杂口语首次使用时可能需要加载本地模型。');
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let response = await send('smart_alarm_interpret', { text, now: anchor, timeZone: zone, turns });
        const deadline = Date.now() + 100000;
        while (response.ok && response.status === 'pending') {
          if (Date.now() > deadline) throw new Error('模型响应超时，尚未创建闹钟，请重试或手动设置');
          await new Promise(resolve => setTimeout(resolve, 1200));
          response = await send('smart_alarm_result', { jobId: response.jobId });
        }
        if (!response.ok) throw new Error(response.error || '解析失败');
        if (response.status === 'needs_clarification') {
          if (turns.length >= 8) { turns = []; anchor = null; throw new Error('请重新输入完整的提醒事项、日期和时间'); }
          turns.push({ role: 'user', content: text }, { role: 'assistant', content: response.question });
          feedback(response.question); input.value = ''; input.placeholder = '补充时间，例如：明天下午三点'; reset.hidden = false;
          return;
        }
        if (response.timeZone !== zone) throw new Error('时区已变化，请重新输入提醒');
        if (response.status === 'ready' && response.intent === 'rename') {
          await commitRename(response);
          return;
        }
        if (response.status !== 'ready' || !response.alarm) throw new Error('未得到有效时间，请手动设置');
        const stored = await send('user_alarm_save', { alarm: { ...response.alarm, id: `smart_${crypto.randomUUID()}`, smartInput: true } });
        if (!stored.ok || !stored.alarm) throw new Error(stored.error || '保存失败，尚未创建闹钟');
        saved = stored.alarm; turns = []; anchor = null; input.value = ''; reset.hidden = true;
        feedback(`${stored.duplicate ? '已有相同提醒' : '已设置'}：${response.displayText}`);
        actions.hidden = false; container.querySelector('[data-smart-undo]').hidden = Boolean(stored.duplicate);
        await center.refresh();
      } catch (error) { feedback(error.message || '暂时无法创建，请重试或手动设置', true); reset.hidden = false; }
      finally { busy = false; submit.disabled = false; input.disabled = false; reset.disabled = false; if (center.root.classList.contains('open')) input.focus({ preventScroll: true }); }
    });
  };
})();
