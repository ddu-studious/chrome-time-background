(function (root) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  function validateTurns(turns = []) {
    if (!Array.isArray(turns) || turns.length > 40 || turns.some(t => !t || !['user', 'assistant'].includes(t.role) || typeof t.content !== 'string' || t.content.length > 500)) throw new Error('本次对话较长，请查看当前草稿后点击新建另一条；原对话未被自动清空');
    return turns.map(({ role, content }) => ({ role, content }));
  }
  function create(scene, storage, { history } = {}) {
    const key = `assistant-session-v1:${scene}`;
    const fresh = () => ({ id: root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, startedAt: Date.now(), eventSequence: 0, state: 'idle', turns: [], draft: null, anchor: null, timeZone: null, pendingText: '', editingText: '' });
    let data = fresh();
    try {
      const saved = JSON.parse(storage?.getItem(key) || 'null');
      if (saved?.id && ['active', 'waiting', 'review', 'error'].includes(saved.state)) { validateTurns(saved.turns); data = { ...fresh(), ...saved, state: saved.state === 'active' ? 'error' : saved.state }; }
    } catch {}
    function persist() { try { storage?.setItem(key, JSON.stringify(data)); } catch {} }
    function record(role, content) {
      if (!history) return;
      const conversation = data;
      const event = { id: `${data.id}:${++data.eventSequence}`, conversationId: data.id, startedAt: data.startedAt, scene: scene === 'alarm' ? 'alarm.interpret' : 'music.intent', role, content, status: data.state, source: role === 'assistant' ? data.currentSource : null };
      persist();
      Promise.resolve().then(() => history(event)).then(result => { if (result?.ok === false) throw new Error('未留存'); }).catch(() => { if (conversation === data) { data.historyWarning = '部分对话未留存，请检查本机 AI 服务'; persist(); } });
    }
    return {
      get data() { return data; },
      get open() { return ['active', 'waiting', 'review', 'error'].includes(data.state); },
      start() { data = fresh(); persist(); },
      set(patch) { Object.assign(data, copy(patch)); persist(); },
      request(text) {
        // No silent truncation: keep the transcript visible when reaching the bound.
        const history = data.pendingText && data.pendingText !== text ? [...data.turns, { role: 'user', content: data.pendingText }] : data.turns;
        validateTurns([...history, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
        data.turns = history;
        data.pendingText = text; data.editingText = text; data.state = 'active'; data.currentSource = null; data.recordedInput = text; persist(); record('user', text);
        return { turns: copy(data.turns), draft: copy(data.draft), sessionId: data.id, ...(history ? { trace: { conversationId: data.id, turnId: `${data.id}:${data.eventSequence}`, startedAt: data.startedAt, userManaged: true } } : {}) };
      },
      reply(text, answer, state = 'waiting', draft = data.draft) {
        if (data.recordedInput !== text) record('user', text);
        data.recordedInput = null;
        data.turns.push({ role: 'user', content: text }, { role: 'assistant', content: String(answer).slice(0, 500) });
        if (data.editingText === text) data.editingText = '';
        data.pendingText = ''; data.state = state; data.draft = copy(draft); persist(); record('assistant', String(answer));
      },
      end(state = 'completed') { data.state = state; data.pendingText = ''; data.editingText = ''; persist(); record('status', state === 'completed' ? '本次会话已完成' : '本次会话已结束'); }
    };
  }
  const api = { create, validateTurns };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AssistantSession = api;
})(typeof globalThis === 'object' ? globalThis : this);
