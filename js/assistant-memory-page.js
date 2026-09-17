(function () {
  'use strict';
  const $ = id => document.getElementById(id), policy = window.AssistantMemory;
  let state = null, busy = false;
  const labels = { artistDefaultAction: { play: '找到明确歌手后播放', browse: '先展示，由我选择播放' }, artistQueueMode: { append: '保留原队列，加入热门歌曲并播放', replace: '替换为热门歌曲并播放' } };
  const send = (action, body) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ action, body }, result => {
    if (chrome.runtime.lastError || !result?.ok) reject(new Error(result?.error || '无法连接记忆服务，请检查本机 AI 连接并更新服务')); else resolve(result);
  }));
  function notice(text, error = false) { $('notice').textContent = text; $('notice').dataset.error = String(error); }
  function button(text, fn) { const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.addEventListener('click', fn); return el; }
  function render() {
    if (busy) { document.querySelectorAll('button,select,input').forEach(el => { el.disabled = true; }); return; }
    $('preferences').replaceChildren(); $('artists').replaceChildren();
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
      $('enabled').checked = state.enabled; $('remember-artists').checked = state.rememberArtists;
    }
    document.querySelectorAll('button,select,input').forEach(el => { el.disabled = busy || (!state && el.id !== 'refresh'); });
  }
  async function refresh() {
    if (busy) return; busy = true; render();
    try { state = await send('ai_memory_get'); notice(state.enabled ? '已连接本机记忆。修改会影响下一次请求。' : '已暂停使用个人记忆，当前按默认规则处理。'); }
    catch (error) { state = null; notice(error.message, true); }
    finally { busy = false; render(); }
  }
  async function mutate(body, message) {
    if (busy || !state) return; busy = true; render();
    try { state = await send('ai_memory_write', { ...body, expectedRevision: state.revision }); notice(message); }
    catch (error) { notice(error.message + '；请刷新后重试，未自动覆盖。', true); }
    finally { busy = false; render(); }
  }
  $('enabled').addEventListener('change', () => mutate({ operation: 'configure', enabled: $('enabled').checked, rememberArtists: state.rememberArtists }, '记忆使用设置已保存。'));
  $('remember-artists').addEventListener('change', () => mutate({ operation: 'configure', enabled: state.enabled, rememberArtists: $('remember-artists').checked }, '歌手记忆设置已保存。'));
  $('refresh').addEventListener('click', refresh);
  $('clear').addEventListener('click', () => { if (confirm('清空所有已保存的偏好和歌手选择？将恢复默认规则。')) void mutate({ operation: 'clear', confirm: true }, '已清空保存的记忆，恢复默认规则。'); });
  $('export').addEventListener('click', () => {
    if (!state || busy) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'assistant-memory.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  void refresh();
})();
