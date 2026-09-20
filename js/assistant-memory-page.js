(function () {
  'use strict';
  const $ = id => document.getElementById(id), policy = window.AssistantMemory;
  let state = null, busy = false, shownExperiences = 20;
  const labels = { artistDefaultAction: { play: '找到明确歌手后播放', browse: '先展示，由我选择播放' }, artistQueueMode: { append: '保留原队列，加入热门歌曲并播放', replace: '替换为热门歌曲并播放' } };
  const send = (action, body) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, body }, result => {
    if (chrome.runtime.lastError || !result?.ok) reject(new Error(result?.error || '无法连接记忆服务，请检查本机 AI 连接并更新服务')); else resolve(result);
  }));
  function notice(text, error = false) { $('notice').textContent = text; $('notice').dataset.error = String(error); }
  function button(text, fn) { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.addEventListener('click', fn); return el; }
  function render() {
    if (busy) { document.querySelectorAll('button,select,input').forEach(el => { el.disabled = true; }); return; }
    $('preferences').replaceChildren(); $('artists').replaceChildren(); $('notes').replaceChildren(); $('experiences').replaceChildren();
    if (state) {
      const effective = policy.effective(state);
      for (const [key, spec] of Object.entries(policy.preferences)) {
        const saved = state.preferences.find(row => row.key === key), box = document.createElement('div'); box.className = 'entry';
        const row = document.createElement('div'); row.className = 'row';
        const label = document.createElement('label'); label.htmlFor = `pref-${key}`; label.textContent = spec.label;
        const select = document.createElement('select'); select.id = label.htmlFor;
        for (const value of spec.values) { const option = document.createElement('option'); option.value = value; option.textContent = labels[key][value]; select.append(option); }
        select.value = saved?.value || effective[key];
        select.addEventListener('change', () => mutate({ operation: 'preference', key, value: select.value, source: '在我的记忆页面明确设置' }, '偏好已保存，下次请求生效。'));
        row.append(label, select); box.append(row);
        const source = document.createElement('small'); source.textContent = saved ? `来源：${saved.source} · ${new Date(saved.updatedAt).toLocaleString('zh-CN')}` : '当前为默认规则，尚未保存个人偏好。'; box.append(source);
        if (saved) box.append(button('删除偏好，恢复默认', () => mutate({ operation: 'delete', kind: 'preference', key }, '已删除偏好，恢复默认规则。')));
        $('preferences').append(box);
      }
      $('artist-count').textContent = `（${state.artists.length}）`;
      if (!state.artists.length) { const p = document.createElement('p'); p.textContent = '还没有歌手记忆。你主动选择歌手后，会出现在这里。'; $('artists').append(p); }
      for (const artist of state.artists) {
        const box = document.createElement('div'); box.className = 'entry';
        const row = document.createElement('div'); row.className = 'row';
        const title = document.createElement('strong'); title.textContent = `${artist.key} → ${artist.name}`;
        row.append(title, button('忘记这位歌手', () => mutate({ operation: 'delete', kind: 'artist', key: artist.key }, '已忘记该歌手，下次重新识别。')));
        const source = document.createElement('small'); source.textContent = `${artist.source} · ${new Date(artist.updatedAt).toLocaleString('zh-CN')}`;
        box.append(row, source); $('artists').append(box);
      }
      const notes = state.notes || [], experiences = state.experiences || [];
      const actionLabels = { searched: '搜索过', played: '播放过', applied: '加入队列', selected: '选择过', opened: '打开过页面', created: '创建提醒', updated: '修改提醒', deleted: '删除提醒' };
      const apps = { all: '通用', music: '音乐', alarm: '提醒', bilibili: '哔哩哔哩', youtube: 'YouTube' };
      for (const [kind, rows, target] of [['note', notes, 'notes'], ['experience', experiences.slice(0, shownExperiences), 'experiences']]) {
        if (!rows.length) { const p = document.createElement('p'); p.textContent = kind === 'note' ? '还没有额外的明确偏好。' : '还没有经历。开启正文留存后，新操作会自动记录；也可以补充已有历史。'; $(target).append(p); }
        for (const entry of rows) {
          const box = document.createElement('div'); box.className = 'entry';
          const row = document.createElement('div'); row.className = 'row';
          const title = document.createElement('strong'); title.textContent = kind === 'note' ? entry.value : `${actionLabels[entry.action]} · ${entry.title || entry.query}`;
          row.append(title, button('删除', () => mutate({ operation: 'delete', kind, key: entry.key }, '已删除该记忆。')));
          const source = document.createElement('small'); source.textContent = `${apps[entry.app]} · ${new Date(entry.at || entry.updatedAt).toLocaleString('zh-CN')} · ${kind === 'experience' ? '来源：AI 工作台执行记录' : entry.source}`;
          box.append(row, source);
          if (kind === 'experience') { const detail = document.createElement('p'); detail.textContent = entry.message; box.append(detail); }
          $(target).append(box);
        }
      }
      $('experience-count').textContent = `（${experiences.length}）`;
      $('more-experiences').hidden = experiences.length <= shownExperiences;
      $('remember-experiences').checked = state.rememberExperiences === true;
      $('enabled').checked = state.enabled; $('remember-artists').checked = state.rememberArtists;
    }
    document.querySelectorAll('button,select,input').forEach(el => { el.disabled = busy || (!state && el.id !== 'refresh'); });
    $('learn-history').disabled = busy || !state?.enabled || !state?.rememberExperiences;
  }
  async function refresh() {
    if (busy) return; busy = true; render();
    try { state = await send('ai_memory_get'); notice(state.enabled ? '已连接本机记忆。修改会影响下一次请求。' : '已暂停使用个人记忆，当前按默认规则处理。'); }
    catch (error) { state = null; notice(error.message, true); }
    finally { busy = false; render(); }
  }
  async function mutate(body, message) {
    if (busy || !state) return; busy = true; render();
    try { state = await send('ai_memory_write', { ...body, expectedRevision: state.revision }); notice(body.operation === 'learn-history' ? `已补充 ${state.added || 0} 条经历。重复、已删除、已过期及无正文的记录不会重新加入。` : message); }
    catch (error) { notice(error.message + '；请刷新后重试，未自动覆盖。', true); }
    finally { busy = false; render(); }
  }
  $('enabled').addEventListener('change', () => mutate({ operation: 'configure', enabled: $('enabled').checked, rememberArtists: state.rememberArtists }, '记忆使用设置已保存。'));
  $('remember-artists').addEventListener('change', () => mutate({ operation: 'configure', enabled: state.enabled, rememberArtists: $('remember-artists').checked }, '歌手记忆设置已保存。'));
  $('remember-experiences').addEventListener('change', () => mutate({ operation: 'configure', enabled: state.enabled, rememberArtists: state.rememberArtists, rememberExperiences: $('remember-experiences').checked }, '经历记忆设置已保存。'));
  $('learn-history').addEventListener('click', () => mutate({ operation: 'learn-history' }, '历史经历已补充。'));
  $('more-experiences').addEventListener('click', () => { shownExperiences += 20; render(); });
  $('refresh').addEventListener('click', refresh);
  $('clear').addEventListener('click', () => { if (confirm('清空所有已保存的偏好、歌手选择和经历？将恢复默认规则。')) void mutate({ operation: 'clear', confirm: true }, '已清空保存的记忆，恢复默认规则。'); });
  $('export').addEventListener('click', () => {
    if (!state || busy) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'assistant-memory.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  void refresh();
})();
