(function () {
  'use strict';
  const root = document.getElementById('ai-history');
  if (!root) return;
  root.innerHTML = `<h2 class="sp-card-title">对话与调用历史</h2>
    <p>仅保存在本机。从启用此版本开始累计；旧对话无法补回。快捷助手、闹钟和音乐按会话查看，其他场景按调用查看。</p>
    <p>正文默认不留存。开启后保存输入、回复和结构化调用内容，可能包含个人资料；排除原始音频和凭证字段，手动输入的敏感内容仍可能保留。关闭仅影响后续内容，已有正文可删除。历史用于回看，不会自动加入模型上下文。</p>
    <form data-h="settings"><label class="toggle"><input type="checkbox" data-h="capture">留存对话正文</label><label>保留时间<select data-h="retention"><option value="7">7 天</option><option value="30">30 天</option><option value="90">90 天</option><option value="365">365 天</option></select></label><button>保存留存设置</button></form>
    <p>最多保存 2,000 次模型/场景调用、4,000 条消息、4,000 个执行步骤，并设文件容量上限；到期或超限会清理最早记录。参数与结果过长会标注截断，凭证、音频和播放链接不留存。服务未连接时无法留存，统计不包含缺失记录。</p>
    <div class="history-toolbar"><button type="button" data-h="refresh">刷新历史</button><button type="button" data-h="json">导出筛选结果 JSON</button><button type="button" data-h="markdown">导出筛选结果 Markdown</button><button type="button" data-h="clear">清空全部历史</button></div>
    <p data-h="notice" role="status" aria-live="polite"></p>
    <div class="parameters"><label>开始日期<input type="date" data-h="from"></label><label>结束日期<input type="date" data-h="to"></label><label>场景<select data-h="scene"><option value="">全部</option></select></label><label>模型<select data-h="model"><option value="">全部</option></select></label><label>状态<select data-h="status"><option value="">全部</option></select></label><label>搜索已留存正文<input type="search" data-h="query" placeholder="输入关键词"></label></div>
    <p data-h="stats"></p><div data-h="metrics"></div><div data-h="groups" class="history-groups"></div>
    <div class="history-toolbar"><button type="button" data-h="previous">上一页</button><span data-h="page"></span><button type="button" data-h="next">下一页</button></div>
    <section data-h="detail" class="history-detail" hidden aria-label="历史详情"></section>`;
  const $ = id => root.querySelector(`[data-h="${id}"]`);
  const names = { pending: '处理中', running: '执行中', succeeded: '成功', ready: '解析完成', completed: '已完成', complete: '已完成', needs_clarification: '待补充', clarify: '待补充', waiting: '待选择或补充', review: '待确认', failed: '失败', cancelled: '已取消', interrupted: '已中断', planning: '理解中' };
  const label = status => names[status] || status || '已记录';
  const date = at => new Date(at).toLocaleString('zh-CN');
  let state, filtered = [], page = 0, busy = false;
  async function send(body) {
    const result = await chrome.runtime.sendMessage({ action: body ? 'ai_history_write' : 'ai_history_get', ...(body ? { body } : {}) });
    if (!result?.ok) throw new Error(result?.error || '历史服务未响应，请更新并启动本地 AI 服务');
    return result;
  }
  async function perform(fn) {
    if (busy) return; busy = true;
    root.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await fn(); } catch (error) { $('notice').textContent = error.message; }
    finally { busy = false; root.querySelectorAll('button').forEach(button => { button.disabled = false; }); if (state) render(); }
  }
  function optionValues(id, values) {
    const selected = $(id).value; $(id).replaceChildren(new Option('全部', ''));
    for (const value of [...new Set(values.filter(Boolean))].sort()) $(id).append(new Option(id === 'status' ? label(value) : value, value));
    $(id).value = selected;
  }
  function accept(data) {
    state = { ...data, tools: data.tools || [] }; $('capture').checked = data.settings.captureContent; $('retention').value = data.settings.retentionDays;
    optionValues('scene', [...data.calls.map(r => r.scene), ...data.events.map(r => r.scene), ...state.tools.map(r => r.scene)]);
    optionValues('model', data.calls.map(r => r.model)); optionValues('status', [...data.calls.map(r => r.status), ...data.events.map(r => r.status), ...state.tools.map(r => r.status)]);
    $('notice').textContent = data.error || '历史已刷新。下方统计仅涵盖保留范围内、符合筛选条件的记录。';
    $('detail').hidden = true; render();
  }
  function groups() {
    const map = new Map();
    function group(key, conversationId) { if (!map.has(key)) map.set(key, { key, conversationId, calls: [], events: [], tools: [] }); return map.get(key); }
    for (const row of state.calls) group(row.conversationId || row.requestId, row.conversationId).calls.push(row);
    for (const row of state.events) group(row.conversationId, row.conversationId).events.push(row);
    for (const row of state.tools) group(row.conversationId, row.conversationId).tools.push(row);
    const start = $('from').value ? new Date($('from').value + 'T00:00:00').getTime() : -Infinity;
    const end = $('to').value ? new Date($('to').value + 'T23:59:59.999').getTime() : Infinity;
    const scene = $('scene').value, model = $('model').value, status = $('status').value, query = $('query').value.trim().toLowerCase();
    return [...map.values()].map(g => ({ ...g, at: Math.max(...g.calls.map(r => r.startedAt), ...g.events.map(r => r.at), ...g.tools.map(r => r.endedAt || r.startedAt)) })).filter(g => {
      const rows = [...g.calls, ...g.events, ...g.tools];
      return g.at >= start && g.at <= end && (!scene || rows.some(r => r.scene === scene)) && (!model || g.calls.some(r => r.model === model)) && (!status || rows.some(r => r.status === status)) && (!query || rows.some(r => JSON.stringify([r.content, r.input, r.output, r.title, r.tool, r.error]).toLowerCase().includes(query)));
    }).sort((a, b) => b.at - a.at);
  }
  function element(tag, value, parent) { const el = document.createElement(tag); el.textContent = value; parent.append(el); return el; }
  function render() {
    filtered = groups(); page = Math.min(page, Math.max(0, Math.ceil(filtered.length / 30) - 1));
    const calls = filtered.flatMap(g => g.calls), events = filtered.flatMap(g => g.events), tools = filtered.flatMap(g => g.tools);
    const rules = events.filter(r => r.role === 'assistant' && r.source === 'rules').length;
    $('stats').textContent = `${filtered.filter(g => g.conversationId).length} 个会话 · ${events.filter(r => r.role === 'user').length} 条用户消息（含候选选择） · ${calls.filter(r => r.source === 'model').length} 次模型受理 · ${calls.filter(r => r.source === 'speech').length} 次语音受理 · ${tools.filter(r => ['tool', 'action'].includes(r.kind)).length} 次工具动作 · ${tools.filter(r => ['operation', 'request'].includes(r.kind)).length} 次内部操作/请求 · ${tools.filter(r => r.kind === 'plan').length} 次规划 · ${rules} 次未再次调用模型的回复。按会话最近活动筛选，详情和导出包含匹配会话的全部留存记录。`;
    $('metrics').replaceChildren();
    const counts = new Map();
    for (const row of calls.filter(r => r.source === 'model')) { const key = `${row.model || '未记录模型'} · 思考 ${row.reasoning ?? '不适用'}`; counts.set(key, (counts.get(key) || 0) + 1); }
    for (const [key, count] of counts) element('p', `${key}：${count} 次`, $('metrics'));
    $('groups').replaceChildren();
    if (!filtered.length) element('p', '暂无符合条件的历史。新请求会在这里出现。', $('groups'));
    for (const g of filtered.slice(page * 30, page * 30 + 30)) {
      const button = element('button', '', $('groups')); button.type = 'button';
      const first = g.events.find(r => r.role === 'user' && r.content)?.content;
      element('strong', first?.slice(0, 100) || `${g.conversationId ? '会话' : '调用'} · ${g.events[0]?.scene || g.calls[0]?.scene}`, button);
      element('small', `${date(g.at)} · ${g.events.filter(r => r.role === 'user').length} 条输入 · ${g.calls.length} 次场景调用 · ${g.tools.length} 个执行步骤 · ${[...new Set(g.calls.map(r => r.model).filter(Boolean))].join('、') || '无模型记录'}`, button);
      button.addEventListener('click', () => detail(g));
    }
    $('page').textContent = `${page + 1} / ${Math.max(1, Math.ceil(filtered.length / 30))}`;
    $('previous').disabled = page === 0; $('next').disabled = (page + 1) * 30 >= filtered.length;
  }
  function detail(g) {
    const panel = $('detail'); panel.hidden = false; panel.replaceChildren();
    element('h3', g.conversationId ? '会话详情' : '调用详情', panel);
    element('p', `编号：${g.key}`, panel);
    const remove = element('button', '删除这条历史', panel); remove.type = 'button';
    remove.onclick = () => { if (confirm('删除本机留存的这条历史及关联调用？此操作不可撤销。')) void perform(async () => accept(await send({ operation: 'delete', ...(g.conversationId ? { conversationId: g.conversationId } : { requestId: g.key }) }))); };
    if (!g.tools.length) element('p', '本会话没有留存工具步骤。旧版本记录无法补回；不能据此认定没有使用工具。', panel);
    element('p', '按开始时间排列。展开步骤查看参数和回执；子步骤通过父步骤编号关联。取消或中断不代表已提交的动作被撤销。', panel);
    const order = [...g.events.map(row => ({ type: 'message', at: row.at, row })), ...g.tools.map(row => ({ type: 'tool', at: row.startedAt, row })), ...g.calls.map(row => ({ type: 'model', at: row.startedAt, row }))].sort((a, b) => a.at - b.at);
    const toolNumbers = new Map(order.filter(item => item.type === 'tool').map(({ row }, i) => [row.id, i + 1]));
    for (const { row, type } of order) {
      if (type === 'message') {
        element('h4', `${row.role === 'user' ? '你' : row.role === 'assistant' ? '助手' : '状态'} · ${date(row.at)} · ${label(row.status)}`, panel);
        element('pre', row.contentSaved ? row.content || '（空消息）' : '当时未开启正文留存，仅保存消息元数据。', panel);
        continue;
      }
      const box = document.createElement('details'); panel.append(box);
      box.dataset.status = row.status;
      if (type === 'tool') {
        box.className = 'history-tool';
        if (row.parentId) box.classList.add('history-tool-child');
        const kind = { plan: '规划', tool: '工具', action: '所选动作', operation: '内部操作', request: '接口请求' }[row.kind];
        element('summary', `步骤 ${toolNumbers.get(row.id)} · ${kind} · ${row.title} · ${label(row.status)} · ${row.elapsedMs == null ? '耗时未确认' : row.elapsedMs + ' ms'}`, box);
        element('p', `${row.tool} · 开始 ${date(row.startedAt)}${row.endedAt ? ' · 结束 ' + date(row.endedAt) : ''}`, box);
        if (row.parentId) element('p', toolNumbers.has(row.parentId) ? `属于步骤 ${toolNumbers.get(row.parentId)}：${g.tools.find(t => t.id === row.parentId).title}` : '父步骤已不在留存范围内', box);
        element('pre', JSON.stringify({ id: row.id, parentId: row.parentId, turnId: row.turnId, input: row.contentSaved ? row.input : '当时未开启正文留存', output: row.output ?? '尚无留存回执', error: row.error, interruption: row.interruption }, null, 2), box);
        continue;
      }
      element('summary', `${row.scene} · ${label(row.status)} · ${row.model || (row.source === 'rules' ? '本地规则' : '未进入模型')} · 思考 ${row.reasoning ?? '不适用'} · ${row.elapsedMs ?? '—'} ms`, box);
      if (toolNumbers.has(row.toolCallId)) element('p', `本次模型调用由步骤 ${toolNumbers.get(row.toolCallId)} 发起`, box);
      element('pre', JSON.stringify({ requestId: row.requestId, toolCallId: row.toolCallId, time: date(row.startedAt), source: row.source, model: row.model ?? null, reasoning: row.reasoning ?? null, policyRevision: row.policyRevision, maxOutputTokens: row.maxOutputTokens, usage: row.usage || '服务未返回 token 用量', errorCode: row.errorCode, input: row.contentSaved ? row.input : '未留存正文', output: row.output ?? '未留存输出（正文关闭、处理中或失败）' }, null, 2), box);
    }
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function download(format) {
    if (!state) return;
    const result = { exportedAt: new Date().toISOString(), scope: '筛选匹配会话及其全部留存记录', groups: filtered };
    const body = format === 'json' ? JSON.stringify(result, null, 2) : '# AI 对话与调用历史\n\n' + filtered.map(g => `## ${date(g.at)} · ${g.key}\n\n` + g.events.map(r => `### ${r.role === 'user' ? '你' : r.role === 'assistant' ? '助手' : '状态'} · ${date(r.at)}\n\n${r.contentSaved ? r.content : '未留存正文'}\n`).join('\n') + g.tools.map(r => `### 执行步骤：${r.title} · ${label(r.status)}\n\n${JSON.stringify(r, null, 2)}\n`).join('\n') + g.calls.map(r => `### ${r.scene} · ${label(r.status)}\n\n模型：${r.model || '无'}；思考等级：${r.reasoning ?? '不适用'}；耗时：${r.elapsedMs ?? '—'} ms\n\n${JSON.stringify(r, null, 2)}\n`).join('\n')).join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: format === 'json' ? 'application/json' : 'text/markdown' }));
    const a = document.createElement('a'); a.href = url; a.download = `ai-history-${new Date().toISOString().slice(0, 10)}.${format === 'json' ? 'json' : 'md'}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (const id of ['from', 'to', 'scene', 'model', 'status', 'query']) $(id).addEventListener('input', () => { page = 0; $('detail').hidden = true; if (state) render(); });
  $('previous').onclick = () => { page--; render(); }; $('next').onclick = () => { page++; render(); };
  $('refresh').onclick = () => perform(async () => accept(await send()));
  $('settings').onsubmit = event => { event.preventDefault(); if (state) void perform(async () => accept(await send({ operation: 'configure', revision: state.revision, settings: { captureContent: $('capture').checked, retentionDays: Number($('retention').value) } }))); };
  $('clear').onclick = () => { if (state && confirm('清空全部本机对话和调用历史？此操作不可撤销，不会清空今日请求预算计数。')) void perform(async () => accept(await send({ operation: 'clear', confirm: true }))); };
  $('json').onclick = () => download('json'); $('markdown').onclick = () => download('markdown');
  void perform(async () => accept(await send()));
})();
