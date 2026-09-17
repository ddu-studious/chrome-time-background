(function () {
  'use strict';
  const root = document.getElementById('page-ai-control');
  if (!root) return;
  const $ = id => root.querySelector('#' + id);
  let state = null;
  const send = async (action, values = {}) => {
    if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('请在扩展的设置页面打开 AI 控制台');
    const result = await chrome.runtime.sendMessage({ action, ...values });
    if (!result?.ok) throw new Error(result?.error || '服务未响应，请检查本地 AI 服务');
    return result;
  };
  function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  const names = { pending: '处理中', ready: '解析完成', needs_clarification: '等待补充', failed: '失败', complete: '完成', cancelled: '已取消' };
  function render(data) {
    state = data;
    $('policy-fields').disabled = false;
    $('revision').textContent = `版本 ${data.revision}`;
    $('daily-limit').value=data.policy.dailyRequestLimit||200;
    $('failure-limit').value=data.policy.failureThreshold||3;
    $('cooldown').value=(data.policy.cooldownMs||60000)/1000;
    $('ai-usage').textContent=`${data.usage?.day||''} 已受理 ${data.usage?.admitted||0} / ${data.policy.dailyRequestLimit||200} 次（已接入场景，含失败和取消，按本机日期统计；不是费用）`;
    $('ai-scenes-usage').replaceChildren();
    for(const [scene,row] of Object.entries(data.usage?.scenes||{})){const line=document.createElement('p');line.textContent=`${scene}：${row.calls} 次，失败 ${row.failures} 次；最近 ${row.latency?.sampleCount||0} 个已结束尝试 P50 ${row.latency?.p50==null?'—':row.latency.p50+'ms'} / P95 ${row.latency?.p95==null?'—':row.latency.p95+'ms'}${row.blockedUntil>Date.now()?' · 冷却至 '+new Date(row.blockedUntil).toLocaleTimeString('zh-CN'):''}`;$('ai-scenes-usage').append(line);}
    $('model-enabled').checked = data.policy.modelEnabled;
    $('embedding-model').value = data.policy.embeddingModel || 'text-embedding-nomic-embed-text-v1.5';
    $('reasoning').value = data.policy.reasoning || 'off';
    $('timeout').value = (data.policy.timeoutMs || 90000) / 1000;
    $('budget').value = data.policy.maxOutputTokens || 4096;
    $('model').replaceChildren();
    const defaultModel = document.createElement('option'); defaultModel.value = ''; defaultModel.textContent = '服务默认模型'; $('model').append(defaultModel);
    if (data.policy.model) { const option = document.createElement('option'); option.value = data.policy.model; option.textContent = data.policy.model; $('model').append(option); }
    $('model').value = data.policy.model || '';
    $('scenes').replaceChildren();
    for (const scene of data.scenes) {
      const label = document.createElement('label'); label.className = 'toggle';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = scene.id; input.checked = !data.policy.disabledScenes.includes(scene.id);
      label.append(input, document.createTextNode(scene.name)); $('scenes').append(label);
    }
    $('history').replaceChildren();
    if (!data.history.length) $('history').textContent = '暂无历史版本';
    for (const version of [...data.history].reverse()) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `恢复版本 ${version.revision}`;
      button.addEventListener('click', () => perform(async () => { render(await send('ai_control_rollback', { revision: version.revision, expectedRevision: state.revision })); notice('已恢复配置，并创建新版本'); }));
      $('history').append(button);
    }
    $('jobs').replaceChildren();
    if (!data.jobs?.length) $('jobs').textContent = '暂无任务';
    for (const job of data.jobs || []) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `取消 ${new Date(job.startedAt).toLocaleTimeString('zh-CN')} 的请求`;
      button.addEventListener('click', () => perform(async () => { await send('ai_job_cancel', { jobId: job.jobId }); await refresh(); notice('请求已取消'); }));
      $('jobs').append(button);
    }
    $('records').replaceChildren();
    for (const record of [...data.records].sort((a,b) => b.startedAt-a.startedAt)) {
      const row = document.createElement('tr');
      for (const value of [new Date(record.startedAt).toLocaleTimeString('zh-CN'), record.scene, names[record.status] || record.status, record.elapsedMs == null ? '—' : `${record.elapsedMs} ms`]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      $('records').append(row);
    }
    if (!data.records.length) { const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 4; cell.textContent = '暂无调用记录'; row.append(cell); $('records').append(row); }
  }
  async function refresh() {
    render(await send('ai_control_get'));
    try { const health = await send('local_ai_status');
      for (const model of health.models || []) { if ([...$('model').options].some(option => option.value === model.id)) continue; const option = document.createElement('option'); option.value = model.id; option.textContent = model.name || model.id; $('model').append(option); }
       $('health').textContent = `模型：${health.model} · 状态：${({ ready: '就绪', busy: '忙碌', not_loaded: '尚未加载', model_missing: '未找到模型' })[health.state] || health.state}`; }
    catch (error) { $('health').textContent = error.message; }
    try {
      const result = await send('music_sleep_get');
      $('music-timer').textContent = result.timer ? `${({pending:'等待定时停止',stopped:'后台已确认定时停止',failed:'定时停止失败'})[result.timer.status] || '状态未知'} · 截止时间 ${new Date(result.timer.fireAt).toLocaleString('zh-CN')}` : '没有音乐定时任务';
    } catch { $('music-timer').textContent = '音乐定时状态暂不可用，请确认扩展已更新'; }
    notice('控制策略已刷新');
  }
  let busy = false;
  async function perform(fn) {
    if (busy) return; busy = true;
    root.querySelectorAll('button').forEach(button => { if (!button.closest('#ai-history')) button.disabled = true; });
    try { await fn(); } catch (error) { notice(error.message, true); }
    finally { busy = false; root.querySelectorAll('button').forEach(button => { if (!button.closest('#ai-history')) button.disabled = false; }); }
  }
  $('connection').addEventListener('submit', event => { event.preventDefault(); void perform(async () => { await send('local_ai_configure', { token: $('token').value }); $('token').value = ''; await refresh(); }); });
  $('refresh').addEventListener('click', () => perform(refresh));
  $('policy').addEventListener('submit', event => { event.preventDefault(); if (!state) return; void perform(async () => {
    const disabledScenes = [...$('scenes').querySelectorAll('input')].filter(input => !input.checked).map(input => input.value);
    render(await send('ai_control_save', { expectedRevision: state.revision, policy: { dailyRequestLimit:Number($('daily-limit').value),failureThreshold:Number($('failure-limit').value),cooldownMs:Number($('cooldown').value)*1000, modelEnabled: $('model-enabled').checked, disabledScenes, model: $('model').value || null, embeddingModel: $('embedding-model').value.trim(), reasoning: $('reasoning').value, timeoutMs: Number($('timeout').value) * 1000, maxOutputTokens: Number($('budget').value) } })); notice('策略已保存，重启后继续生效');
  }); });
  void perform(refresh);
})();
