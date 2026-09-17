(function (root) {
  'use strict';
  const labels = { planning:'理解中', running:'执行中', succeeded:'成功', completed:'已完成', waiting:'等待选择', review:'待确认', clarify:'待补充', failed:'失败', cancelled:'已停止', interrupted:'中断' };
  const duration = ms => !Number.isFinite(ms) ? '耗时未确认' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} 秒`;
  function create() {
    const $ = id => document.getElementById(id);
    let conversationId, turnId, status, expanded = true, timer, traceSignature = '', messageSignature = '', task, followMessages = false;
    let scrollFrame = 0, sweepPending = false, restoreTop = false;
    let standby = false;
    const scroller = $('task');
    function stopSweep() {
      cancelAnimationFrame(scrollFrame); scrollFrame = 0; sweepPending = false;
    }
    function sweepResults() {
      stopSweep(); scroller.scrollTop = 0;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || scroller.scrollHeight <= scroller.clientHeight) return;
      // One bounded reveal, then leave the result at its beginning for reading.
      const down = 720, pause = 160, up = 620, start = performance.now();
      const ease = progress => (1 - Math.cos(Math.PI * progress)) / 2;
      const tick = time => {
        const elapsed = time - start, bottom = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
        if (elapsed >= down + pause + up) { scroller.scrollTop = 0; scrollFrame = 0; return; }
        const position = elapsed < down ? ease(elapsed / down) : elapsed < down + pause ? 1 : 1 - ease((elapsed - down - pause) / up);
        scroller.scrollTop = bottom * position;
        scrollFrame = requestAnimationFrame(tick);
      };
      scrollFrame = requestAnimationFrame(tick);
    }
    for (const event of ['wheel', 'touchstart', 'pointerdown']) scroller.addEventListener(event, stopSweep, { passive:true });
    document.addEventListener('keydown', event => { if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End','Tab','Escape',' '].includes(event.key)) stopSweep(); });
    window.addEventListener('pagehide', stopSweep);
    const opened = new Set();
    const element = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
    function expansion(value) {
      expanded = value; $('trace-body').hidden = !value;
      $('trace-toggle').setAttribute('aria-expanded', String(value));
      $('trace-toggle-label').textContent = value ? '收起过程 ⌃' : '展开过程 ⌄';
      $('session-workspace').classList.toggle('trace-collapsed', !value);
      try { sessionStorage.setItem('assistant-trace:' + conversationId, String(value)); } catch {}
    }
    function rest(value) {
      standby = value;
      $('session-workspace').hidden = !task || standby;
      document.querySelector('main').classList.toggle('is-standby', standby);
      $('session-label').textContent = standby ? '待命' : '本次对话';
      $('receipt-toggle').setAttribute('aria-expanded', String(!standby));
      $('receipt-label').textContent = standby ? '查看本次对话 ⌄' : '收起本次对话 ⌃';
      if (conversationId) try { sessionStorage.setItem('assistant-standby:' + conversationId, String(value)); } catch {}
    }
    $('receipt-toggle').addEventListener('click', () => { clearTimeout(timer); rest(!standby); });
    $('trace-toggle').addEventListener('click', () => { clearTimeout(timer); expansion(!expanded); });
    function renderMessages(value) {
      const messages = value.messages?.length ? value.messages : [{ role:'user', content: value.input.text }];
      const signature = JSON.stringify(messages); if (signature === messageSignature) return;
      messageSignature = signature;
      const scroller = $('task'), follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
      followMessages = follow || scroller.hidden;
      const fragment = document.createDocumentFragment();
      if (value.messagesTruncated) fragment.append(element('p', '这里只保留最近 100 条对话，更多内容可在留存记录中查看。', 'session-note'));
      for (const message of messages) {
        const row = element('article', null, 'conversation-message message-' + message.role);
        row.append(element('span', message.role === 'user' ? '你' : '助手', 'message-role'), element('p', message.content));
        fragment.append(row);
      }
      $('conversation-messages').replaceChildren(fragment);
    }
    function renderTrace(value) {
      const signature = JSON.stringify([value.turnId, value.trace, value.modelCalls]); if (signature === traceSignature) return;
      traceSignature = signature;
      const list = $('trace-list'), follow = list.scrollHeight - list.scrollTop - list.clientHeight < 48, scroll = list.scrollTop;
      const focusId = document.activeElement?.closest('[data-trace-id]')?.dataset.traceId;
      const fragment = document.createDocumentFragment(), rows = value.trace || [], byId = new Map(rows.map(row => [row.id, row]));
      let previousTurn;
      rows.forEach((row, index) => {
        if (row.turnId !== previousTurn) { fragment.append(element('p', row.turnId === value.turnId ? '本轮执行' : '之前的执行', 'trace-turn')); previousTurn = row.turnId; }
        const box = element('details', null, 'trace-row'); box.dataset.traceId = row.id; box.dataset.state = row.status; box.open = opened.has(row.id);
        let parent = byId.get(row.parentId), depth = 0;
        while (parent && depth < 3) { depth++; parent = byId.get(parent.parentId); }
        box.style.setProperty('--trace-depth', depth);
        const summary = element('summary'), dot = element('span', row.status === 'running' ? '◌' : row.status === 'succeeded' ? '✓' : row.status === 'failed' ? '!' : '·', 'trace-status');
        const copy = element('span', null, 'trace-copy'); copy.append(element('strong', row.title), element('small', `${labels[row.status] || row.status} · ${row.tool}`));
        const resultText = row.error?.message || row.output?.message || row.output?.question;
        if (typeof resultText === 'string') copy.append(element('small', resultText.slice(0, 120), 'trace-result'));
        summary.append(dot, copy, element('span', row.status === 'running' ? '进行中' : duration(row.elapsedMs), 'trace-duration')); box.append(summary);
        const detail = element('div', null, 'trace-detail');
        detail.append(element('code', row.tool));
        if (row.parentId) detail.append(element('p', `属于：${byId.get(row.parentId)?.title || '已超出显示范围的步骤'}`));
        const model = (value.modelCalls || []).find(call => call.toolCallId === row.id);
        if (model) detail.append(element('p', model.model ? `${model.model} · 思考：${model.reasoning ?? '未返回'} · ${duration(model.elapsedMs)}` : model.source === 'rules' ? '本地规则处理，未调用模型' : '未返回模型信息'));
        for (const [key, title] of [['input','输入参数'], ['output','返回结果'], ['error','错误信息']]) {
          if (row[key] === undefined) continue;
          detail.append(element('h3', title), element('pre', JSON.stringify(row[key], null, 2)));
        }
        if (!('input' in row) && !('output' in row)) detail.append(element('p', '本次恢复仅包含步骤元数据；正文是否留存请查看完整记录。'));
        if (model?.model) detail.append(element('p', model.usage ? '用量：' + JSON.stringify(model.usage) : '服务未返回 token 用量'));
        box.append(detail); box.addEventListener('toggle', () => { if (!box.isConnected) return; if (box.open) opened.add(row.id); else opened.delete(row.id); }); fragment.append(box);
      });
      if (!rows.length) fragment.append(element('p', '等待执行事件。旧版本未记录的步骤无法补回。', 'session-note'));
      list.replaceChildren(fragment); list.scrollTop = follow ? list.scrollHeight : scroll;
      if (focusId) [...list.querySelectorAll('[data-trace-id]')].find(el => el.dataset.traceId === focusId)?.querySelector('summary').focus({ preventScroll:true });
    }
    return { afterRender() {
      if (sweepPending) sweepResults();
      else if (restoreTop) scroller.scrollTop = 0;
      else if (followMessages && ['planning','running'].includes(task?.status) && !scrollFrame) scroller.scrollTop = scroller.scrollHeight;
      followMessages = restoreTop = false;
    }, render(value) {
      task = value; $('session-workspace').hidden = !value || standby; document.querySelector('main').classList.toggle('has-conversation', Boolean(value));
      $('session-receipt').hidden = value?.status !== 'completed';
      if (!value) { rest(false); stopSweep(); restoreTop = followMessages = false; clearTimeout(timer); conversationId = turnId = status = null; traceSignature = messageSignature = ''; opened.clear(); $('session-label').textContent = ''; $('session-memory').textContent = ''; return; }
      const restoring = conversationId !== value.conversationId;
      if (restoring) {
        stopSweep(); restoreTop = true;
        conversationId = value.conversationId; traceSignature = messageSignature = ''; opened.clear();
        let saved; try { saved = sessionStorage.getItem('assistant-trace:' + conversationId); } catch {}
        expansion(saved == null ? value.status !== 'completed' : saved === 'true');
        let savedRest; try { savedRest = sessionStorage.getItem('assistant-standby:' + conversationId); } catch {}
        rest(value.status === 'completed' && savedRest !== 'false');
      }
      if (turnId !== value.turnId) { stopSweep(); clearTimeout(timer); if (!restoring) { rest(false); if (turnId) expansion(true); } turnId = value.turnId; }
      if (status !== value.status) {
        if (!restoring && ['planning','running'].includes(status) && ['waiting','review','clarify','completed'].includes(value.status)) sweepPending = true;
        else if (['planning','running','failed','cancelled','interrupted'].includes(value.status)) stopSweep();
        clearTimeout(timer); status = value.status;
        if (status === 'completed' && !restoring) timer = setTimeout(() => {
          if (task?.status === 'completed' && !$('execution-panel').matches(':hover, :focus-within') && !$('task').matches(':hover, :focus-within')) { expansion(false); rest(true); }
        }, 1800);
        else if (['planning','running','waiting','review','clarify','failed','cancelled','interrupted'].includes(status)) { rest(false); expansion(true); }
      }
      $('receipt-title').textContent = (value.conversationTitle || value.input.text || '本次需求').slice(0, 48) + ' · 已完成';
      $('receipt-title').title = value.message;
      $('session-label').textContent = standby ? '待命' : value.startMode === 'new' ? '新需求' : '本次对话';
      const count = value.memorySummary?.candidateCount || 0, expired = value.memorySummary?.expiresAt < Date.now();
      $('session-memory').textContent = count ? expired ? '候选已过期，可直接输入新需求' : `本次 ${count} 个候选 · 可继续追问` : '独立需求自动新开，追问保留上下文';
      const rows = (value.trace || []).filter(row => row.turnId === value.turnId), elapsed = value.endedAt ? duration(Math.max(0, value.endedAt - value.startedAt)) : '';
      $('trace-title').textContent = `${labels[value.status] || '执行过程'} · ${rows.length} 个动作${elapsed ? ' · ' + elapsed : ''}`;
      $('execution-panel').dataset.state = value.status;
      const calls = (value.modelCalls || []).filter(call => call.turnId === value.turnId), model = calls.findLast(call => call.model);
      $('trace-meta').textContent = model ? `本机 · ${model.model} · 思考：${model.reasoning ?? '未返回'} · ${calls.filter(c => c.model).length} 次模型调用` : calls.length && calls.every(c => c.source === 'rules') ? '本轮由本地规则处理' : '实时动作 · 展开步骤查看详情';
      $('trace-note').textContent = (value.traceTruncated ? '仅显示最近 400 个动作。' : '') + (value.historyWarning || '正文留存遵循 AI 设置；工具详情已脱敏。');
      renderMessages(value); renderTrace(value);
    } };
  }
  root.AssistantTimeline = { create };
})(globalThis);
