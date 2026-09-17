(function () {
  'use strict';
  if (parent !== window && parent.__assistantHomeTest) { window.chrome = parent.__assistantHomeTest.forFrame(location.href); return; }
  const homeTest = location.pathname === '/index.html';
  const base = homeTest ? location.origin + '/' : `chrome-extension://${'a'.repeat(32)}/`;
  const listeners = [], changes = [], appId = 'a'.repeat(32), storeKey = homeTest ? 'assistant-home-isolated-fixture' : 'assistant-mvp-isolated-fixture';
  let values = JSON.parse(localStorage.getItem(storeKey) || '{}');
  const effect = text => { document.getElementById('preview-effect').textContent = '隔离效果：' + text; };
  const storage = {
    async get() { return structuredClone(values); },
    async set(patch) { const changed = {}; for (const key of Object.keys(patch)) changed[key] = { oldValue: values[key], newValue: structuredClone(patch[key]) }; Object.assign(values, structuredClone(patch)); localStorage.setItem(storeKey, JSON.stringify(values)); for (const callback of changes) callback(changed, 'local'); },
    async remove(key) { const oldValue = values[key]; delete values[key]; localStorage.setItem(storeKey, JSON.stringify(values)); for (const callback of changes) callback({ [key]: { oldValue } }, 'local'); }
  };
  function dispatch(message, sender, callback) {
    let resolve = callback; const promise = callback ? undefined : new Promise(done => { resolve = done; });
    for (const listener of listeners) if (listener(message, sender, resolve)) return promise;
    resolve({ ok: false, error: '测试请求未接入' }); return promise;
  }
  const tab = { id: 1, windowId: 1, url: base + (homeTest ? 'index.html' : 'assistant.html') };
  window.chrome = {
    storage: { local: storage, session: storage, onChanged: { addListener(fn) { changes.push(fn); } } },
    commands: { async getAll() { return [{ name: 'toggle-quick-assistant', shortcut: 'Ctrl+Shift+K（隔离示例）' }]; } },
    runtime: { id: appId, getURL: path => base + path, onMessage: { addListener(fn) { listeners.push(fn); } }, sendMessage(message, callback) {
      const url = message.action?.startsWith('assistant_home_overlay_') ? base + 'js/background.js' : tab.url;
      return dispatch(message, { id: appId, url, frameId: 0, tab }, callback);
    } },
    tabs: { async create({ url }) { effect('打开 ' + url); return { id: 2 }; }, async remove() { effect('输入条已收起，刷新后恢复任务'); document.querySelector('main').hidden = true; } },
    windows: { async update() {}, async get() { return { id: 1, type: 'popup' }; }, async remove() { effect('输入条已收起，刷新后恢复任务'); document.querySelector('main').hidden = true; } }
  };
  if (homeTest) {
    Object.assign(chrome.tabs, { getCurrent: async () => tab, get: async () => tab, query: async options => options.url ? [] : [tab] });
    Object.assign(chrome.windows, { getLastFocused: async () => ({ left: 0, top: 0, width: innerWidth, height: innerHeight }), create: async () => { effect('错误：走到了独立窗口兜底'); } });
    window.__assistantHomeTest = { forFrame(url) { return { ...chrome, runtime: { ...chrome.runtime, sendMessage(message, callback) { return dispatch(message, { id: appId, url, frameId: 1, tab }, callback); } } }; } };
  }
  const ai = async message => {
    if (message.action === 'ai_memory_get' || message.action === 'ai_memory_write') {
      const memory = structuredClone(values.fixtureMemory || { revision: 1, enabled: true, rememberArtists: true, preferences: [], artists: [] });
      if (message.action === 'ai_memory_write') {
        const body = message.body;
        if (body.expectedRevision !== memory.revision) throw new Error('记忆已变化');
        if (body.operation === 'preference') memory.preferences = [...memory.preferences.filter(row => row.key !== body.key), { key: body.key, value: body.value, source: body.source }];
        else if (body.operation === 'artist') memory.artists = [...memory.artists.filter(row => row.key !== AssistantMemory.normalize(body.query)), { key: AssistantMemory.normalize(body.query), name: body.name, artistId: body.artistId }];
        else throw new Error('隔离操作未接入');
        memory.revision++; await storage.set({ fixtureMemory: memory });
      }
      return { ok: true, ...memory };
    }
    if (message.action === 'ai_history_write') return { ok: true };
    if (message.action === 'ai_job_cancel') return { ok: true };
    if (message.action === 'music_ai_interpret') return { ok: true, source:'rules', intent: MusicIntent.parseLocal(message.text) || { action: 'search', kind:'artist', query:message.text.replace(/[，,].*$/, '') } };
    if (message.action === 'smart_alarm_interpret') {
      const draft = AlarmIntent.parseDraft(message.text, message.draft, { now: message.now, timeZone: message.timeZone, currentNow: Date.now() });
      return { ok: true, ...(draft ? AlarmIntent.resolveDraft(draft, { now: message.now, timeZone: message.timeZone, currentNow: Date.now() }) : { status: 'needs_clarification', question: '请补充具体日期和时间' }) };
    }
    const input = message.input;
    return { ok: true, source:'rules', data: AssistantContract.localPlan(input) || (input.app === 'music' ? {steps:[{tool:'music.intent',args:{text:input.text}}]} : { steps: [{ tool: 'video.history', args: { platform: input.app || 'bilibili', query: /mysql/i.test(input.text) ? 'MySQL' : '', ...(/昨天/.test(input.text) ? { dayOffset: 1 } : {}), ...(/没看完/.test(input.text) ? { unfinishedOnly: true } : {}) } }] }) };
  };
  window.LocalAIBridge = { request: ai };
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  window.assistantFixture = QuickAssistant.install({ storage, ai,
    readMusicState: async () => ({ status: 'ready', revision: 'fixture-queue', count: values.musicPlaylistCache?.playlist?.length || 0 }),
    applyMusicQueue: async (songs, options) => {
      const queue = [...new Map([...(options.mode === 'append' ? values.musicPlaylistCache?.playlist || [] : []), ...songs].map(song => [song.songId, song])).values()];
      await storage.set({ musicPlaylistCache: { playlist: queue } }); effect('模拟热门歌曲播放：' + songs[0].title);
      return { isPlaying: true, currentSong: songs[0], count: queue.length, status: 'ready', revision: 'fixture-played' };
    },
    netease: async (endpoint, params) => {
      await new Promise(resolve => setTimeout(resolve, 240));
      const songs = [{ id: 90001, name: '逆战', ar: [{ name: '张杰' }], dt: 241000 }, { id: 90002, name: '这，就是爱', ar: [{ name: '张杰' }], dt: 252000 }];
      if (endpoint.includes('playlist/detail')) return { code: 200, playlist: { name: '张杰精选', tracks: songs, trackIds: songs.map(s => ({ id:s.id })), trackCount: 2 } };
      if (endpoint.includes('/api/v1/album/')) return {code:200,album:{size:2},songs};
      if (endpoint.includes('artist/albums')) return {code:200,hotAlbums:[{id:90005,name:'这，就是爱',artist:{name:'张杰'}}]};
      if (endpoint.includes('artist/top/song')) return { code:200, songs };
      if (params.type === 100) return { code:200, result: { artists:[{ id:90003, name:'张杰' },{ id:90006, name:'张杰（同名歌手）' }] } };
      if (params.type === 10) return {code:200,result:{albums:[{id:90005,name:'这，就是爱',artist:{name:'张杰'}}]}};
      if (params.type === 1000) return { code:200, result: { playlists:[{ id:90004, name:'张杰精选', trackCount:2, creator:{nickname:'隔离示例'} }] } };
      return { code:200, result:{songs} };
    },
    bilibili: async () => ({ code: 0, data: { list: [{ bvid: 'BV1xx411c7mD', title: 'MySQL 索引原理', author_name: '测试课程', view_at: yesterday.getTime() / 1000, progress: 1104, duration: 3130 }, { bvid: 'BV1xx411c7mE', title: 'MySQL 事务与 MVCC', author_name: '测试课程', view_at: yesterday.getTime() / 1000, progress: 516, duration: 2180 }] } }),
    youtube: async () => { throw Object.assign(new Error('未连接'), { code: 'auth-required' }); },
    playMusic: async song => { await new Promise(resolve=>setTimeout(resolve,600)); const queue=[...(values.musicPlaylistCache?.playlist || [])]; if(!queue.some(item=>item.songId===song.songId))queue.push(song); await storage.set({musicPlaylistCache:{playlist:queue}}); effect('模拟加入并播放 ' + song.title); return { ok: true, song, queueLength:queue.length }; },
    playQueue: async songs => { await new Promise(resolve=>setTimeout(resolve,600)); await storage.set({musicPlaylistCache:{playlist:songs}}); effect('模拟替换队列并播放 '+songs.length+' 首'); return {ok:true,song:songs[0],queueLength:songs.length}; },
    enqueueMusic: async () => { effect('模拟加入队列，当前音乐保持不变'); return { message:'已加入队列' }; },
    controlMusic: async () => ({ ok: true, message: '模拟播放器已确认操作' }),
    sleepMusic: async minutes => { effect('模拟设置 ' + minutes + ' 分钟定时'); return { ok: true }; },
    listAlarms: async () => ({ alarms: values.fixtureAlarms || [] }),
    saveAlarm: async alarm => { await storage.set({ fixtureAlarms: [...(values.fixtureAlarms || []), alarm] }); effect('只写入隔离测试提醒'); return { alarm }; },
    openURL: async url => effect('模拟打开 ' + url)
  });
})();
