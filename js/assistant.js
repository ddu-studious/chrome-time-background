(function () {
  'use strict';
  const C = window.AssistantContract, M = window.AssistantMatch, $ = id => document.getElementById(id), DRAFT = 'quickAssistantDraftV1';
  const input = $('request');
  const timeline = window.AssistantTimeline.create();
  let scopeExplicit = false, newConversationOnSubmit = false;
  const newRequestKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ Enter' : 'Ctrl Enter';
  $('new-request-shortcut').textContent = newRequestKey + ' 新需求';
  $('new-request-shortcut').title = '直接开始新会话并发送当前输入；不停止正在播放的音乐';
  let app = null, skill = null, task = null, menu = null, items = [], selected = 0, sending = false, draftTimer, rendering = '', renderingMenu = '';
  let modelCatalog = [], defaultModel = '', defaultReasoning = 'off', aiModel = '', aiReasoning = '', capabilitiesReady = false, reasoningAvailable = false;
  let resultType = 'all', resultQuery = '', resultSelection = -1, visibleChoices = [], viewKey = '';
  const viewStates = new Map();
  function focusInput() {
    if (busy() || input.disabled) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  }
  function highlight(element, text, query) {
    element.replaceChildren(); const range = M.match(text, query)?.range;
    if (!range) { element.textContent = text; return; }
    element.append(document.createTextNode(text.slice(0, range[0])));
    const mark = document.createElement('mark'); mark.textContent = text.slice(range[0], range[1] + 1); element.append(mark, document.createTextNode(text.slice(range[1] + 1)));
  }
  function highlightResult() {
    document.querySelectorAll('.choice[data-choice]').forEach(el => el.classList.toggle('is-selected', visibleChoices[resultSelection]?.id === el.dataset.choice));
  }
  async function chooseResult(id, taskId, version) {
    if (busy()) return;
    viewStates.set(viewKey, { type: resultType, query: resultQuery, scroll: $('task').scrollTop });
    const picked = task?.choices?.find(c => c.id === id);
    task.operation = { choiceId: id, action: picked?.action, title: picked?.title, status: 'pending', message: picked?.kind === 'song' ? '正在准备歌曲，加入队列并立即播放…' : ['music.enqueue-collection', 'music.play-collection'].includes(picked?.action) ? '正在读取曲目，准备替换队列并播放…' : '正在执行所选操作…' };
    sending = true; renderTask(); error('');
    try { task = (await send('assistant_choose', { taskId, choiceId: id, version })).task; menu = null; resultSelection = -1; }
    catch (e) { if (task?.operation?.choiceId === id) task.operation = { ...task.operation, status: 'failed', message: e.message }; error(e.message); }
    finally { sending = false; rendering = ''; renderTask(); renderMenu(); }
  }
  function renderChoices(editingReview) {
    const music = Boolean(task.musicView && task.choices?.length);
    const key = music ? `${task.conversationId || task.id}:${task.musicView.kind}:${task.musicView.title}` : task.id;
    let restore = null;
    if (key !== viewKey) { viewKey = key; restore = viewStates.get(key); resultType = restore?.type || 'all'; resultQuery = restore?.query || ''; resultSelection = -1; }
    $('task').classList.toggle('music-results', music);
    $('message').hidden = Boolean(music && task.musicView.kind === 'search' && /^(选择歌手或歌单|匹配到本地音乐索引)/.test(task.message));
    $('music-filters').hidden = !music;
    $('music-view').hidden = !music;
    if (music) $('music-view').textContent = task.musicView.title + (task.musicView.kind === 'search' ? (task.musicView.local ? ' · 本地音乐索引' : ' · 搜索结果') : task.musicView.kind === 'queue' ? '' : task.musicView.kind === 'artist' ? ' · 热门歌曲' : task.musicView.kind === 'artist-albums' ? ' · 专辑列表' : task.musicView.kind === 'album' ? ' · 专辑曲目' : ' · 歌单曲目');
    if ($('result-filter').value !== resultQuery) $('result-filter').value = resultQuery;
    $('music-types').replaceChildren();
    if (music && task.musicView.kind === 'search') {
      for (const [value, label] of [['all','综合'],['song','歌曲'],['artist','歌手'],['album','专辑'],['playlist','歌单']]) {
        const tab = button(label, '', () => { resultType = value; resultSelection = -1; rendering = ''; renderTask(); });
        tab.setAttribute('aria-pressed', String(resultType === value)); $('music-types').append(tab);
      }
    }
    const all = task.choices || [];
    visibleChoices = all.filter(c => !c.secondary && (!music || ['navigation','collection-action'].includes(c.kind) || ((resultType === 'all' || c.kind === resultType) && M.rank([c], resultQuery, row => [row.title, row.subtitle]).length)));
    if (music && task.musicView.kind === 'search') visibleChoices.sort((a,b) => ({artist:0,album:1,playlist:2,song:3}[a.kind] ?? 3) - ({artist:0,album:1,playlist:2,song:3}[b.kind] ?? 3));
    $('choices').replaceChildren();
    const taskId = task.id, version = task.version;
    const groups = music && task.musicView.kind === 'search' ? [['collection-action',''],['artist','歌手'],['album','专辑'],['playlist','歌单'],['song','歌曲']] : [[null, '']];
    for (const [kind, title] of groups) {
      const rows = visibleChoices.filter(c => !kind || c.kind === kind); if (!rows.length) continue;
      const group = document.createElement('section'); group.className = 'music-group';
      if (title) { const heading = document.createElement('h3'); heading.textContent = title; group.append(heading); }
      const list = document.createElement('div'); if (['playlist','album'].includes(kind)) list.className = 'playlist-grid';
      for (const choice of rows) {
        const box = document.createElement('div'); box.className = 'choice-box kind-' + (choice.kind || 'generic');
        const row = button('', 'choice', () => chooseResult(choice.id, taskId, version)); row.dataset.choice = choice.id; row.setAttribute('aria-label', (choice.label || '选择') + '：' + choice.title);
        const ordinal = visibleChoices.filter(c => !['navigation', 'collection-action'].includes(c.kind)).findIndex(c => c.id === choice.id);
        if (ordinal >= 0) { const number = document.createElement('span'); number.className = 'candidate-number'; number.textContent = String(ordinal + 1).padStart(2, '0'); row.append(number); }
        row.setAttribute('aria-busy', String(task.operation?.choiceId === choice.id && busy()));
      row.disabled = busy() || editingReview || Boolean(app && task.scope && app !== task.scope);
        if (choice.kind && ['song','artist','album','playlist'].includes(choice.kind)) {
          let cover = document.createElement('span'); cover.className = 'cover'; cover.textContent = choice.kind === 'artist' ? choice.title.slice(0, 1) : '♫';
          if (/^https?:\/\//.test(choice.cover || '')) { const img = document.createElement('img'); img.src = choice.cover; img.alt = ''; img.className = 'cover'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.addEventListener('error', () => img.replaceWith(cover), { once:true }); row.append(img); } else row.append(cover);
        }
        const copy = document.createElement('span'); copy.className = 'choice-copy';
        const strong = document.createElement('strong'), sub = document.createElement('small'); highlight(strong, choice.title, resultQuery); highlight(sub, choice.subtitle || '', resultQuery); copy.append(strong,sub); row.append(copy);
        if (choice.detail) { const detail = document.createElement('span'); detail.className = 'duration'; detail.textContent = choice.detail; row.append(detail); }
        const label = document.createElement('span'); label.className = 'choice-label'; label.textContent = choice.kind === 'song' ? '▷' : choice.label || '选择'; row.append(label); box.append(row);
        const secondary = all.find(c => c.secondary && c.parentId === choice.id);
        if (secondary) { const add = button('+', 'queue-button', () => chooseResult(secondary.id, taskId, version)); add.setAttribute('aria-label', secondary.title); add.title = secondary.title; add.textContent = task.operation?.choiceId === secondary.id && busy() ? '…' : '+ ▷'; add.setAttribute('aria-busy', String(task.operation?.choiceId === secondary.id && busy())); add.disabled = row.disabled; box.append(add); }
        list.append(box);
      }
      group.append(list); $('choices').append(group);
    }
    if (music && !visibleChoices.length && task.status === 'waiting') { const empty = document.createElement('p'); empty.textContent = '当前结果没有匹配项，试试其他拼音或名称。'; $('choices').append(empty); }
    if (restore) $('task').scrollTop = restore.scroll;
    highlightResult();
  }
  const examples = [
    { text: '张杰', app: 'music', skill: 'music-search', description: '搜索歌曲、歌手、专辑和歌单' },
    { text: '30分钟后提醒我休息', app: 'alarm', skill: 'remind', description: '确认具体时间后创建提醒' },
    { text: '', app: 'bilibili', skill: 'history', description: '查看 B 站最近观看记录', name: '@哔哩哔哩 /继续看' },
    { text: 'Transformer 入门', app: 'youtube', skill: 'search', description: '搜索 YouTube 视频' }
  ];
  const busy = () => sending || ['planning', 'running'].includes(task?.status);
  const send = (action, data = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, ...data }, response => {
    if (chrome.runtime.lastError) { reject(new Error('扩展后台暂不可用，请重新打开输入条')); return; }
    if (!response?.ok) reject(new Error(response?.error || '扩展后台未响应')); else resolve(response);
  }));
  const reasoningLabels = { off:'关闭', low:'低', medium:'中', high:'高', xhigh:'极高', on:'开启' };
  function requestAI() {
    const value = {};
    if (aiModel) value.model = aiModel;
    if (aiReasoning) value.reasoning = aiReasoning;
    return Object.keys(value).length ? value : null;
  }
  function renderReasoningOptions() {
    const select = $('assistant-reasoning'), selectedModel = modelCatalog.find(model => model.id === (aiModel || defaultModel));
    const allowed = (selectedModel?.reasoningOptions || []).filter(value => Object.hasOwn(reasoningLabels, value));
    select.replaceChildren();
    const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = `默认 · ${reasoningLabels[defaultReasoning] || defaultReasoning}`;
    if (aiModel && allowed.length && !allowed.includes(defaultReasoning)) defaultOption.disabled = true;
    select.append(defaultOption);
    for (const value of allowed) { const option=document.createElement('option');option.value=value;option.textContent=reasoningLabels[value] || value;select.append(option); }
    if (aiReasoning && !allowed.includes(aiReasoning)) aiReasoning = '';
    if (defaultOption.disabled && !aiReasoning) aiReasoning = allowed[0] || '';
    select.value = aiReasoning;
    reasoningAvailable = Boolean(allowed.length); select.disabled = busy() || !reasoningAvailable;
  }
  function renderModelOptions(data) {
    defaultModel = typeof data.model === 'string' ? data.model : '';
    defaultReasoning = Object.hasOwn(reasoningLabels, data.defaultReasoning) ? data.defaultReasoning : 'off';
    modelCatalog = Array.isArray(data.models) ? data.models.filter(model => model && typeof model.id === 'string' && !model.id.includes('://') && /^[a-zA-Z0-9_./:-]{1,160}$/.test(model.id)) : [];
    const select = $('assistant-model'); select.replaceChildren();
    const option=document.createElement('option');option.value='';option.textContent=defaultModel ? `默认 · ${defaultModel}` : '服务默认模型';select.append(option);
    for (const model of modelCatalog) { const item=document.createElement('option');item.value=model.id;item.textContent=`${model.name || model.id}${model.loaded === false ? ' · 未加载' : ''}`;select.append(item); }
    if (aiModel && !modelCatalog.some(model => model.id === aiModel)) aiModel = '';
    select.value = aiModel; capabilitiesReady = true; select.disabled = busy() || !modelCatalog.length; renderReasoningOptions();
  }
  async function loadAICapabilities() {
    try { renderModelOptions(await send('local_ai_status')); }
    catch { capabilitiesReady = false; aiModel=''; aiReasoning=''; $('assistant-model').disabled=true; $('assistant-model').options[0].textContent='连接 AI 后可选'; $('assistant-reasoning').disabled=true; }
  }
  function error(value) { $('error').hidden = !value; $('error').textContent = value || ''; }
  function persistDraft() { clearTimeout(draftTimer); draftTimer = setTimeout(() => { void chrome.storage.local.set({ [DRAFT]: { text: input.value, app, skill, scopeExplicit, aiModel, aiReasoning } }).catch(() => {}); }, 120); }
  function activeToken() { const before = input.value.slice(0, input.selectionStart ?? input.value.length); const m = before.match(/(?:^|\s)([@/])([^\s]*)$/); return m ? { symbol: m[1], query: m[2].toLowerCase(), start: before.length - m[0].length, end: before.length } : null; }
  function button(text, className, action) { const el = document.createElement('button'); el.type = 'button'; el.className = className; el.textContent = text; el.addEventListener('click', action); return el; }
  function renderTokens() {
    input.placeholder = task && !scopeExplicit ? '说说下一件事，也可以接着追问…' : C.inputHint(app, skill);
    $('tokens').replaceChildren();
    if (app) $('tokens').append(button((scopeExplicit ? '@ ' : '上次 · ') + C.apps.find(a => a.id === app).name + ' ×', 'token', () => { if (busy()) return; scopeExplicit = true; app = null; skill = null; renderTokens(); renderMenu(); renderTask(); persistDraft(); }));
    if (skill) $('tokens').append(button('/ ' + C.skills.find(s => s.id === skill).name + ' ×', 'token', () => { if (busy()) return; scopeExplicit = true; skill = null; renderTokens(); renderMenu(); renderTask(); persistDraft(); }));
  }
  function renderMenu() {
    const token = activeToken(), query = token?.query || '';
    const signature = JSON.stringify([menu, busy(), app, scopeExplicit, query, selected]);
    if (renderingMenu === signature) return;
    renderingMenu = signature;
    const el = $('suggestions'); el.replaceChildren();
    const show = Boolean(menu) && !busy(); $('discovery').hidden = !show; input.setAttribute('aria-expanded', String(show));
    input.removeAttribute('aria-activedescendant'); if (!show) return;
    items = menu === 'apps' ? M.rank(C.apps, query) : menu === 'skills' ? M.rank(C.skills.filter(s => !scopeExplicit || !app || s.apps.includes(app)), query, item => [item.name, item.id]) : examples.filter(item => !scopeExplicit || !app || item.app === app);
    selected = Math.max(0, Math.min(selected, items.length - 1));
    $('menu-title').textContent = menu === 'apps' ? '选择应用' : menu === 'skills' ? '选择动作' : '试试这样说';
    items.forEach((item, i) => {
      const row = button('', 'suggestion', () => select(i)); row.id = `suggestion-${i}`; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(i === selected));
      const text = document.createElement('span'), title = document.createElement('strong'), sub = document.createElement('small');
      highlight(title, menu === 'examples' ? item.name || item.text : (menu === 'apps' ? '@ ' : '/ ') + item.name, query); sub.textContent = item.description; text.append(title, sub); row.append(text); el.append(row);
    });
    if (items.length) input.setAttribute('aria-activedescendant', `suggestion-${selected}`);
    else { const empty = document.createElement('p'); empty.textContent = '没有匹配项，可以继续描述需求。'; el.append(empty); }
  }
  function select(index) {
    const item = items[index]; if (!item || busy()) return;
    if (!scopeExplicit && menu === 'skills') { app = null; skill = null; }
    scopeExplicit = true;
    if (menu === 'examples') { app = item.app; skill = item.skill; input.value = item.text; }
    else {
      const token = activeToken(); if (token) input.value = (input.value.slice(0, token.start) + input.value.slice(token.end)).trim();
      if (menu === 'apps') { app = item.id; if (skill && !C.skills.find(s => s.id === skill).apps.includes(app)) skill = null; }
      else { skill = item.id; if (!app && item.apps.length === 1) app = item.apps[0]; }
    }
    menu = null; error(''); renderTokens(); renderMenu(); renderTask(); persistDraft(); input.focus();
  }
  const states = { planning: '理解中', running: '执行中', waiting: '请选择', review: '待确认', clarify: '待补充', completed: '已完成', failed: '失败', cancelled: '已停止', interrupted: '已中断' };
  function renderPlayback() {
    const operation = task?.operation;
    const musical = /^music\.(?:play|enqueue)(?:$|-)/.test(operation?.action || '');
    const panel = $('playback-feedback');
    panel.hidden = !musical;
    if (!musical) return;
    panel.dataset.state = operation.status;
    panel.setAttribute('aria-busy', String(operation.status === 'pending'));
    $('playback-title').textContent = { pending: '正在准备播放…', succeeded: '已开始播放', failed: '操作未完成', cancelled: '已停止准备' }[operation.status] || '播放状态';
    $('playback-message').textContent = operation.message || task.message || '';
  }
  function renderTask() {
    timeline.render(task);
    input.placeholder = task && !scopeExplicit ? '说说下一件事，也可以接着追问…' : C.inputHint(app, skill);
    $('tokens').hidden = !scopeExplicit && task?.status === 'completed';
    try {
      const mode = input.value.trim() ? C.routeRequest({text:input.value,app,skill,inheritedScope:!scopeExplicit},task).mode : null;
      $('submit-mode').textContent = mode === 'new' ? '新需求' : mode === 'replace' ? '替换搜索' : mode ? '接着上次' : '';
    } catch { $('submit-mode').textContent = ''; }
    renderPlayback();
    $('edit-task').hidden = !task; $('edit-task').disabled = busy();
    $('submit').disabled = busy(); input.disabled = busy(); $('new-task').disabled = busy(); $('apps').disabled = $('skills').disabled = busy();
    $('cancel').hidden = !['planning', 'running'].includes(task?.status); $('cancel').disabled = sending;
    $('assistant-model').disabled = busy() || !capabilitiesReady || !modelCatalog.length;
    $('assistant-reasoning').disabled = busy() || !reasoningAvailable;
    $('task').hidden = !task; if (!task) { rendering = ''; $('music-filters').hidden = true; $('music-view').hidden = true; return; }
    const editingReview = task.status === 'review' && Boolean(input.value.trim());
    const signature = JSON.stringify([task, app, busy(), editingReview, resultType, resultQuery]); if (rendering === signature) return; rendering = signature;
    $('task-title').textContent = '本次对话';
    $('task-state').textContent = states[task.status] || task.status; $('message').textContent = task.message + (task.memoryNotice ? '\n' + task.memoryNotice : '') + (task.historyWarning ? '\n' + task.historyWarning : '') + (editingReview ? '\n有尚未提交的修改，请先执行以更新确认卡。' : '');
    renderChoices(editingReview);
    if (!busy() && !editingReview && task.messages?.at(-1)?.content === task.message && !task.historyWarning && !task.memoryNotice) $('message').hidden = true;
    rendering = JSON.stringify([task, app, busy(), editingReview, resultType, resultQuery]);
    $('records').replaceChildren();
    for (const item of Array.isArray(task.result) ? task.result : []) { const row = document.createElement('div'); row.className = 'record'; const title = document.createElement('strong'), sub = document.createElement('small'); title.textContent = item.title; sub.textContent = item.subtitle; row.append(title, sub); $('records').append(row); }
    $('steps').hidden = Boolean(task.trace?.length) || !task.log?.length; $('step-list').replaceChildren();
    for (const step of task.log || []) { const li = document.createElement('li'); li.dataset.status = step.status; li.textContent = `${step.title} · ${{ running: '执行中', waiting: '等待选择或补充', done: '完成', failed: '失败' }[step.status] || step.status}${step.message ? '：' + step.message : ''}`; $('step-list').append(li); }
    timeline.afterRender();
  }
  $('result-filter').addEventListener('input', event => { if (event.isComposing) return; resultQuery = $('result-filter').value; resultSelection = -1; rendering = ''; renderTask(); });
  input.addEventListener('input', () => { const token = activeToken(); menu = token ? (token.symbol === '@' ? 'apps' : 'skills') : null; selected = 0; resultSelection = -1; highlightResult(); input.style.height = 'auto'; input.style.height = Math.min(110, input.scrollHeight) + 'px'; renderMenu(); renderTask(); persistDraft(); });
  input.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      event.preventDefault(); if (busy()) return;
      newConversationOnSubmit = true; $('compose').requestSubmit(); newConversationOnSubmit = false;
    }
    else if (menu && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(items.length, 1)) % Math.max(items.length, 1); renderMenu(); }
    else if (menu && items.length && ['Tab', 'Enter'].includes(event.key) && !event.shiftKey) { event.preventDefault(); select(selected); }
    else if (!menu && ['ArrowDown', 'ArrowUp'].includes(event.key) && visibleChoices.length) { event.preventDefault(); resultSelection = (resultSelection + (event.key === 'ArrowDown' ? 1 : -1) + visibleChoices.length) % visibleChoices.length; highlightResult(); }
    else if (!menu && event.key === 'Enter' && !event.shiftKey && resultSelection >= 0 && visibleChoices[resultSelection]) { event.preventDefault(); void chooseResult(visibleChoices[resultSelection].id, task.id, task.version); }
    else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('compose').requestSubmit(); }
  });
  for (const [id, value] of [['apps', 'apps'], ['skills', 'skills']]) $(id).addEventListener('click', () => { menu = menu === value ? null : value; selected = 0; renderMenu(); input.focus(); });
  $('compose').addEventListener('submit', async event => {
    event.preventDefault(); if (busy()) return; error('');
    const chosenAI = requestAI();
    const request = { text:input.value, app, skill, inheritedScope:!scopeExplicit, newConversation:newConversationOnSubmit, ai:chosenAI };
    let normalized; try { normalized = C.routeRequest(request, task).input; } catch (e) { error(e.message); return; }
    const ordinal = C.ordinal(normalized.text);
    sending = true; menu = null; resultSelection = -1; renderTask(); renderMenu();
    try { const response = await send('assistant_submit', { input: { ...request, taskId: task?.id, version: task?.version, ...(ordinal ? { candidateIds: visibleChoices.filter(c => !['navigation', 'collection-action'].includes(c.kind)).map(c => c.id) } : {}) } }); task = response.task; app = task.scope || normalized.app; skill = normalized.skill; scopeExplicit = false; input.value = ''; persistDraft(); renderTokens(); }
    catch (e) { error(e.message); }
    finally { sending = false; rendering = ''; renderTask(); renderMenu(); if (!busy()) input.focus(); }
  });
  $('cancel').addEventListener('click', async () => { if (sending || !task) return; try { task = (await send('assistant_cancel', { taskId: task.id })).task; renderTask(); input.focus(); } catch (e) { error(e.message); } });
  $('new-task').addEventListener('click', async () => { if (busy()) return; try { await send('assistant_clear'); task = null; app = null; skill = null; scopeExplicit = false; input.value = ''; menu = null; error(''); renderTokens(); renderTask(); renderMenu(); persistDraft(); input.focus(); } catch (e) { error(e.message); } });
  $('edit-task').addEventListener('click', () => {
    if (busy() || !task?.input) return;
    input.value = task.input.text; app = task.input.app; skill = task.input.skill; scopeExplicit = true; menu = null;
    renderTokens(); renderMenu(); renderTask(); persistDraft(); input.focus();
  });
  const hide = () => { clearTimeout(draftTimer); void chrome.storage.local.set({ [DRAFT]: { text: input.value, app, skill, scopeExplicit, aiModel, aiReasoning } }).then(() => send('assistant_hide')).catch(e => error(e.message)); };
  $('hide').addEventListener('click', hide);
  document.addEventListener('keydown', event => { if (event.key !== 'Escape' || event.isComposing) return; event.preventDefault(); if (menu) { menu = null; renderMenu(); } else hide(); });
  $('shortcut-settings').addEventListener('click', () => send('assistant_shortcuts').catch(e => error(e.message)));
  $('assistant-model').addEventListener('change', () => { aiModel=$('assistant-model').value;aiReasoning='';renderReasoningOptions();persistDraft(); });
  $('assistant-reasoning').addEventListener('change', () => { aiReasoning=$('assistant-reasoning').value;persistDraft(); });
  async function refresh() { try { const wasBusy = busy(); const data = await send('assistant_snapshot'); task = data.task; $('shortcut').textContent = data.shortcut ? '唤出：' + data.shortcut : '首次使用：请绑定“快捷助手”的快捷键'; renderTask(); renderMenu(); if (wasBusy && !busy() && document.activeElement === document.body) focusInput(); } catch (e) { error(e.message); } }
  let snapshotTimer;
  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.quickAssistantTaskV1) { clearTimeout(snapshotTimer); snapshotTimer = setTimeout(refresh, 25); } });
  (async () => {
    try { const saved = (await chrome.storage.local.get(DRAFT))[DRAFT]; if (saved) { input.value = typeof saved.text === 'string' ? saved.text.slice(0, 500) : ''; app = C.apps.some(a => a.id === saved.app) ? saved.app : null; skill = C.skills.some(s => s.id === saved.skill && (!app || s.apps.includes(app))) ? saved.skill : null; scopeExplicit = saved.scopeExplicit === true; aiModel = typeof saved.aiModel === 'string' ? saved.aiModel : ''; aiReasoning = typeof saved.aiReasoning === 'string' ? saved.aiReasoning : ''; if (input.value || app) menu = null; } } catch {}
    await Promise.all([refresh(),loadAICapabilities()]); renderTokens(); renderMenu(); focusInput();
  if (embedded.get('embedded') === '1') parent.postMessage({ type: 'assistant_ready', nonce: embedded.get('nonce') }, embedded.get('hostOrigin'));
  })();
  const embedded = new URLSearchParams(location.search);
  if (embedded.get('embedded') === '1') {
    document.body.classList.add('embedded');
    const resizeResults = height => { if (Number.isFinite(height)) document.documentElement.style.setProperty('--assistant-results-height', Math.max(80, Math.min(420, height)) + 'px'); };
    resizeResults(Number(embedded.get('maxResultsHeight')) || 420);
    window.addEventListener('message', event => {
      if (event.source !== parent || event.origin !== embedded.get('hostOrigin') || event.data?.nonce !== embedded.get('nonce')) return;
      if (event.data.type === 'assistant_host_size') resizeResults(event.data.height);
      if (event.data.type === 'assistant_focus') focusInput();
    });
  }
  let resizeTimer, lastHeight = 0, lastExpanded = false;
  function resize() {
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => {
      const height = Math.ceil(document.querySelector('main').getBoundingClientRect().height);
      const expanded = Boolean(task) && !document.querySelector('main').classList.contains('is-standby');
      if (height === lastHeight && expanded === lastExpanded) return; lastHeight = height; lastExpanded = expanded;
      if (embedded.get('embedded') === '1') parent.postMessage({ type: 'assistant_resize', nonce: embedded.get('nonce'), height, expanded }, embedded.get('hostOrigin'));
      else void send('assistant_resize', { height: height + Math.max(28, window.outerHeight - window.innerHeight) }).catch(() => {});
    }, 80);
  }
  new ResizeObserver(resize).observe(document.querySelector('main'));
  $('examples').addEventListener('click', () => { menu = menu === 'examples' ? null : 'examples'; selected = 0; renderMenu(); input.focus(); });
  const heartbeat = setInterval(refresh, 15000);
  window.addEventListener('pagehide', () => clearInterval(heartbeat), { once: true });
})();
