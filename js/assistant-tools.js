(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantTools = api;
})(globalThis, function (root) {
  'use strict';
  const Contract = typeof module === 'object' && module.exports ? require('./assistant-contract.js') : root.AssistantContract;
  const Music = typeof module === 'object' && module.exports ? require('./music-intent.js') : root.MusicIntent;
  const Management = typeof module === 'object' && module.exports ? require('./assistant-management.js') : root.AssistantManagement;
  const MusicObjects = typeof module === 'object' && module.exports ? require('./assistant-music.js') : root.AssistantMusic;
  const Memory = typeof module === 'object' && module.exports ? require('./assistant-memory.js') : root.AssistantMemory;
  const safeText = text => String(text || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").slice(0, 200);
  const time = value => { const s = Math.max(0, Math.floor(Number(value) || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const videoId = (platform, id) => (platform === 'youtube' ? /^[A-Za-z0-9_-]{11}$/ : /^BV[A-Za-z0-9]{10}$/).test(id || '');
  function videoURL(platform, id, seconds = 0, page = 1) {
    if (!['bilibili', 'youtube'].includes(platform) || !videoId(platform, id)) throw new Error('视频编号无效');
    const url = new URL(platform === 'youtube' ? 'https://www.youtube.com/watch' : `https://www.bilibili.com/video/${id}/`);
    if (platform === 'youtube') url.searchParams.set('v', id);
    if (platform === 'bilibili' && Number.isInteger(page) && page > 1 && page <= 10000) url.searchParams.set('p', String(page));
    if (Number.isFinite(seconds) && seconds > 0) url.searchParams.set('t', String(Math.floor(seconds)) + (platform === 'youtube' ? 's' : ''));
    return url.href;
  }
  function create(deps) {
    const labels = { netease: '请求网易云音乐', bilibili: '请求哔哩哔哩', youtube: '请求 YouTube', controlMusic: '控制播放器', playMusic: '准备并播放单曲', playQueue: '替换队列并播放', enqueueMusic: '追加音乐队列', sleepMusic: '设置音乐停止时间', listAlarms: '读取提醒列表', saveAlarm: '保存提醒', mutateAlarm: '修改提醒', openURL: '打开页面', readMusicState: '读取播放器状态', setMusicMode: '设置播放模式', playCurrentQueue: '播放当前队列', applyMusicQueue: '应用音乐队列', editMusicQueue: '编辑音乐队列', seekMusic: '调整播放进度', connectionStatus: '检查应用连接' };
    function runtime(ctx) {
      if (!ctx.trace) return createRuntime(deps);
      const scoped = { ...deps };
      for (const [name, title] of Object.entries(labels)) if (typeof deps[name] === 'function') scoped[name] = (...args) => {
        const path = name === 'netease' ? String(args[0]) : '';
        const requestTitle = /artist\/top\/song|\/api\/v1\/artist$/.test(path) ? '读取歌手热门歌曲' : /search/.test(path) ? `搜索${({ 1: '歌曲', 100: '歌手', 10: '专辑', 1000: '歌单' })[args[1]?.type] || '音乐'}` : /playlist\/detail/.test(path) ? '读取歌单曲目' : /song\/detail/.test(path) ? '补全歌曲详情' : /\/album\//.test(path) ? '读取专辑曲目' : title;
        return ctx.trace(`service.${name}`, requestTitle, args.filter(arg => arg !== ctx), async child => {
        const result = await deps[name](...args.map(arg => arg === ctx ? { ...ctx, ...child } : arg));
        return result;
        }, ['netease', 'bilibili', 'youtube'].includes(name) ? 'request' : 'operation');
      };
      if (deps.storage) {
        scoped.storage = {};
        for (const method of ['get', 'set', 'remove']) if (deps.storage[method]) scoped.storage[method] = (...args) => ctx.trace(`storage.${method}`, ({ get: '读取本地资料', set: '保存本地资料', remove: '移除本地资料' })[method], args, () => deps.storage[method](...args), 'operation');
      }
      return createRuntime(scoped);
    }
    return Object.fromEntries(['plan', 'execute', 'choose'].map(method => [method, (input, ctx) => runtime(ctx)[method](input, ctx)]));
  }
  function createRuntime(deps) {
    const { ai, netease, bilibili, youtube, storage, controlMusic, playMusic, sleepMusic, listAlarms, saveAlarm, openURL, now = Date.now } = deps;
    const musicObjects = MusicObjects.create(deps);
    async function memoryCall(action, body, ctx) {
      ctx.guard();
      if (!deps.memory) throw new Error('长期记忆未连接');
      const run = async () => {
        const result = await deps.memory(action, body); ctx.guard();
        if (!result?.ok || !Number.isSafeInteger(result.revision)) throw new Error(result?.error || '记忆服务不可用');
        return result;
      };
      return ctx.trace ? ctx.trace(`memory.${action}`, action === 'get' ? '读取个人记忆' : '保存个人记忆', body || {}, run, 'operation') : run();
    }
    async function readMemory(ctx) {
      if (!deps.memory) return null;
      try { const result = await memoryCall('get', null, ctx); ctx.task.memoryNotice = ''; return result; }
      catch (error) { ctx.guard(); ctx.task.memoryNotice = '长期记忆暂不可用，本次按默认规则处理；未保存新的记忆。'; return null; }
    }
    async function rememberArtist(choice, query, snapshot, ctx) {
      if (!snapshot?.enabled || !snapshot.rememberArtists) return;
      try {
        await memoryCall('write', { operation: 'artist', query, artistId: choice.data.id, name: choice.title,
          source: `用户选择歌手：${safeText(choice.title)}`, sourceId: ctx.task.conversationId || ctx.task.id, sourceStartedAt: ctx.task.conversationStartedAt || ctx.task.startedAt, expectedRevision: snapshot.revision }, ctx);
        ctx.task.memoryNotice = `已记住你选择的歌手：${choice.title}。可在“我的记忆”中删除。`;
      } catch (error) { ctx.guard(); ctx.task.memoryNotice = `本次操作已完成，歌手记忆未保存：${error.message}`; }
    }
    async function playArtist(choice, snapshot, ctx) {
      const loaded = await musicObjects.tracks(choice.data, ctx); ctx.guard();
      if (!loaded.songs.length) throw new Error('没有可播放的热门歌曲，原队列未更改');
      const state = await deps.readMusicState(ctx); ctx.guard();
      if (!['ready', 'empty'].includes(state.status)) throw new Error('当前队列状态不可确认，未修改播放');
      const mode = ctx.task.memory?.artistRequest?.queueMode || Memory.effective(snapshot).artistQueueMode;
      const result = await deps.applyMusicQueue(loaded.songs, { mode, startPlayback: true, expectedRevision: state.revision, title: `${choice.title} · 热门歌曲` }, ctx);
      ctx.guard();
      if (!result?.isPlaying) throw new Error('播放器未确认开始播放');
      const message = `已${mode === 'append' ? '保留原队列并加入' : '替换队列为'}${choice.title}的热门歌曲，正在播放《${result.currentSong?.title || '热门歌曲'}》。`;
      return { message, musicView: { ...choice.data, kind: 'artist' }, keepChoices: true,
        choices: [{ id: `replay-artist-${choice.data.id}`, kind: 'collection-action', title: '重新播放热门歌曲', label: '重新播放', action: 'music.play-artist', data: choice.data }],
        playback: { mode, title: result.currentSong?.title, artist: choice.title, count: result.count, source: choice.title }, observation: publicState(result) };
    }
    async function awaitAI(action, body, ctx) {
      if (ctx.trace && !ctx.inModelCall) return ctx.trace('assistant.model', '理解需求与生成执行计划', { scene: body.scene || action }, async child => {
        try { return await awaitAI(action, body, { ...child, inModelCall: true }); }
        catch (error) { if (error.execution && child.modelCall) await child.modelCall(error.execution); throw error; }
      }, 'operation');
      ctx.guard(); const selection = ctx.task.input?.ai;
      let response = await ai({ action, ...body, ...(selection ? { selection } : {}), trace: { conversationId: ctx.task.conversationId || ctx.task.id, turnId: ctx.task.turnId || ctx.task.id, toolCallId: ctx.spanId, startedAt: ctx.task.startedAt, userManaged: true } });
      const jobId = response?.jobId;
      if (jobId) {
        ctx.task.usedModel = true;
        try { await ctx.trackJob(jobId); } catch (error) { await ai({ action: 'ai_job_cancel', jobId }).catch(() => {}); throw error; }
      }
      const deadline = now() + 105000;
      const poll = action === 'music_ai_interpret' ? 'music_ai_result' : action === 'smart_alarm_interpret' ? 'smart_alarm_result' : 'ai_scene_result';
      while (response?.ok && response.status === 'pending') {
        ctx.guard(); if (now() > deadline) throw new Error('本地 AI 处理超时，请重试');
        await new Promise(resolve => setTimeout(resolve, 900)); ctx.guard();
        response = await ai({ action: poll, jobId });
      }
      ctx.guard();
      if (response?.execution && ctx.modelCall) await ctx.modelCall(response.execution);
      else if (ctx.modelCall && response?.source === 'rules') await ctx.modelCall({ source: 'rules', scene: body.scene || action });
      if (!response?.ok) throw new Error(response?.error?.message || response?.error || '本地 AI 请求失败'); return response;
    }
    async function plan(input, ctx) {
      let local = ctx.task.remainingSteps?.length || ctx.task.observations?.length ? null : Contract.localPlan(input);
      if (!local && !ctx.task.observations?.length && !/如果|否则|队列|随机|循环|登录|连接|权限|授权|下一页|翻页|继续搜索/.test(input.text) && !input.app && !input.skill) {
        const intent = Music.parseLocal(input.text);
        if (intent && (intent.action !== 'search' || /歌曲|音乐|歌手|歌单|听|首|^播放.+的/.test(input.text))) local = { steps: [{ tool: 'music.intent', args: { text: input.text } }] };
      }
      if (local) return local;
      const { ai: _selection, ...modelInput } = input;
      const snapshot = (!input.app || input.app === 'music') ? await readMemory(ctx) : null;
      const response = await awaitAI('ai_scene_submit', { scene: 'assistant.plan', input: { ...modelInput, ...(snapshot?.enabled ? { personalMemory: Memory.effective(snapshot) } : {}), turns: ctx.task.turns.slice(-12), observations: ctx.task.observations || [], toolGroups: ctx.task.memory?.toolGroups || [], ...(ctx.task.remainingSteps?.length ? { remainingSteps: ctx.task.remainingSteps } : {}) } }, ctx);
      return response.data;
    }
    async function musicIntent(text, ctx) {
      const memory = ctx.task.memory || {};
      const resetSearchContext = ctx.task.startMode === 'replace';
      const latin = text.replace(/^(?:搜索音乐|搜索|搜|找|播放)\s*/, '').trim();
      if (/^[a-z][a-z\s.'-]{0,60}$/i.test(latin)) return searchMusic({ action: 'search', kind: 'auto', query: latin }, ctx);
      const explicit = Music.artistRequest(text);
      const response = explicit ? { intent: explicit } : await awaitAI('music_ai_interpret', { text, turns: resetSearchContext ? [] : ctx.task.turns.slice(0, -1), ...(!resetSearchContext && memory.musicDraft ? { draft: memory.musicDraft } : {}) }, ctx);
      const intent = Music.validate(response.intent);
      const saved = { musicDraft: intent };
      if (intent.action === 'clarify') return { status: 'clarify', message: intent.question, memory: saved };
      if (intent.action === 'sleep') { ctx.guard(); const res = await sleepMusic(intent.minutes); if (!res?.ok) throw new Error(res?.error || '定时失败'); return { message: intent.minutes ? `已设置 ${intent.minutes} 分钟后暂停音乐` : '已取消音乐定时', memory: saved }; }
      if (['search', 'recommend'].includes(intent.action)) return { ...(await searchMusic(intent, ctx)), memory: saved };
      ctx.guard(); const result = await controlMusic(intent, ctx);
      if (!result?.ok) throw new Error(result?.error || '播放器没有确认操作成功');
      return { message: result.message, memory: saved };
    }
    async function alarmPrepare(text, ctx) {
      const memory = ctx.task.memory || {}, zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (memory.alarmZone && zone !== memory.alarmZone) throw new Error('时区已变化，请新建需求');
      const anchor = memory.alarmAnchor || now();
      const response = await awaitAI('smart_alarm_interpret', { text, now: anchor, currentNow: now(), timeZone: zone, conversation: true, turns: ctx.task.turns.slice(0, -1), ...(memory.alarmDraft ? { draft: memory.alarmDraft } : {}) }, ctx);
      const saved = { alarmDraft: response.draft || memory.alarmDraft || null, alarmAnchor: anchor, alarmZone: zone };
      if (response.status === 'needs_clarification') return { status: 'clarify', message: response.question, memory: saved };
      if (response.status !== 'ready' || !response.alarm || response.timeZone !== zone) throw new Error('快捷入口仅支持新建提醒和查看列表，其他操作请进入闹钟中心');
      return { status: 'review', message: `待确认：${response.displayText}（${zone}）。确认后创建，也可以继续补充修改。`, memory: saved,
        choices: [{ id: 'confirm-alarm', title: response.displayText, subtitle: zone, label: '确认创建', action: 'alarm.create', data: { alarm: response.alarm, zone } }] };
    }
    async function videos(tool, args, ctx) {
      const { platform, query } = args, history = tool === 'video.history'; let rows = [];
      if (platform === 'youtube' && history) {
        const values = await storage.get(['youtubeWatchHistory', 'youtubeWatchProgress']);
        rows = (values.youtubeWatchHistory || []).slice(0, 100).map(v => {
          const progress = values.youtubeWatchProgress?.[v.id];
          return { id: v.id, title: v.title, author: v.channel, seconds: progress?.time || 0, watchedAt: progress?.updatedAt || Date.parse(v.watchedAt), unfinished: Boolean(progress?.time > 0) };
        });
      } else if (platform === 'youtube') {
        try { const response = await youtube('search', { part: 'snippet', q: query, type: 'video', maxResults: 8 }); rows = (response.items || []).map(v => ({ id: v.id?.videoId, title: v.snippet?.title, author: v.snippet?.channelTitle, seconds: 0 })); }
        catch (error) {
          if (!['auth-required', 'auth-expired', 'not-connected', 'oauth-not-configured'].includes(error.code)) throw error;
          return { status: 'waiting', message: 'YouTube 账号尚未连接。可以先在原站搜索，或在 YouTube 工作台连接账号。', choices: [{ id: 'youtube-search', title: `在 YouTube 搜索：${query}`, subtitle: '打开原站搜索结果', label: '打开', action: 'video.search-site', data: { platform, query } }] };
        }
      } else {
        const response = await bilibili(history ? '/x/web-interface/history/cursor' : '/x/web-interface/search/type', history ? { ps: 30, business: 'archive' } : { search_type: 'video', keyword: query, page: 1 });
        if (response.code !== 0) throw new Error(response.message || 'B 站请求失败，请检查登录');
        rows = (history ? response.data?.list || [] : response.data?.result || []).map(v => ({ id: v.bvid || v.history?.bvid, title: v.title, author: v.author || v.author_name, seconds: history ? Math.max(0, Number(v.progress) || 0) : 0, page: history ? Number(v.history?.page) || 1 : 1, watchedAt: Number(v.view_at) * 1000, unfinished: Number(v.progress) > 0 && (!Number(v.duration) || Number(v.progress) < Number(v.duration) - 5) }));
      }
      ctx.guard();
      if (history && args.dayOffset != null) {
        const target = new Date(ctx.task.startedAt || now()); target.setDate(target.getDate() - args.dayOffset);
        const day = date => [date.getFullYear(), date.getMonth(), date.getDate()].join('-');
        rows = rows.filter(v => Number.isFinite(v.watchedAt) && day(new Date(v.watchedAt)) === day(target));
      }
      if (history && args.unfinishedOnly) rows = rows.filter(v => v.unfinished);
      if (history && query) rows = rows.filter(v => safeText(v.title).toLowerCase().includes(query.toLowerCase()));
      rows = rows.filter(v => videoId(platform, v.id)).slice(0, 8);
      const source = history ? (platform === 'youtube' ? '扩展本地观看记录' : 'B 站最近一页观看记录') : '搜索结果';
      if (!rows.length) return { status: 'clarify', message: `${source}中没有找到匹配视频。可以换一个标题关键词，或使用 /找视频。` };
      return { status: 'waiting', message: `${source}：选择后将在原站打开${history ? '，并携带已知观看进度' : ''}。`, observation: { items: rows.map(v => ({ ref: remember({ type: 'video', platform, video: v }, ctx), title: safeText(v.title), seconds: v.seconds })), platform }, choices: rows.map((v, i) => ({ id: `video-${i}`, title: safeText(v.title), subtitle: `${safeText(v.author)}${v.seconds > 0 ? ` · 观看至 ${time(v.seconds)}` : ''}`, label: history ? '继续看' : '打开视频', action: 'video.open', data: { platform, id: v.id, seconds: v.seconds, page: v.page || 1, title: safeText(v.title) } })) };
    }
    const publicState = state => ({ status: state.status, revision: state.revision, mode: state.mode, isPlaying: state.isPlaying, count: state.count,
      currentTime: state.currentTime, duration: state.duration, volume: state.volume, currentSong: state.currentSong, source: state.source, readAt: state.readAt, timer: state.timer });
    function remember(value, ctx, selected = false) {
      ctx.guard();
      const memory = ctx.task.memory || (ctx.task.memory = {});
      const refs = memory.musicRefs || (memory.musicRefs = {});
      const seq = memory.musicRefSeq = (memory.musicRefSeq || 0) + 1;
      if (seq > 500) throw new Error('本次资源引用过多，请新建需求');
      const ref = `r${seq}`;
      refs[ref] = { value, selected, taskId: ctx.task.id, expires: now() + 600000 };
      return ref;
    }
    function resolve(ref, ctx, selected = false) {
      ctx.guard(); const entry = ctx.task.memory?.musicRefs?.[ref];
      if (!entry || entry.taskId !== ctx.task.id || entry.expires < now()) throw new Error('资源引用无效或已过期，请重新查询');
      if (selected && !entry.selected) throw new Error('请先选择真实候选，再应用到队列');
      if (entry.consumed) throw new Error('该选择已经应用，不能重复执行');
      return entry;
    }
    async function searchMusic(args, ctx) {
      const result = await musicObjects.search({ action: 'search', ...args }, ctx);
      const request = Music.artistRequest(ctx.task.input?.text) || (args.collection === 'top' ? args : null);
      ctx.task.memory ||= {};
      delete ctx.task.memory.artistRequest;
      if (args.kind === 'artist' && request?.collection === 'top') {
        const snapshot = await readMemory(ctx);
        const goal = /先别.*播|先不.*播|不要.*播|不播放|只看看/.test(ctx.task.input?.text || '') ? 'browse' : request.goal === 'auto' ? Memory.effective(snapshot).artistDefaultAction : request.goal;
        ctx.task.memory.artistRequest = { query: args.query, goal, ...(request.queueMode ? { queueMode: request.queueMode } : {}) };
        if (goal === 'play' && result.choices?.length) {
          // Automatic decisions use fresh provider results, never the local search cache.
          const matched = result.musicView?.local ? null : Memory.candidate(result.choices, args.query, snapshot);
          if (matched) {
            await ctx.progress(`${matched.reason}：${matched.choice.title}，正在读取热门歌曲…`);
            ctx.task.memoryNotice = (ctx.task.memoryNotice ? ctx.task.memoryNotice + '\n' : '') + `${matched.reason}；${snapshot?.preferences?.some(p => p.key === 'artistDefaultAction') && request.goal === 'auto' ? '使用了已保存的播放偏好。' : '按本次播放目标继续。'}`;
            return playArtist(matched.choice, snapshot, ctx);
          }
          result.message = '需要确认是哪位歌手。选择后将继续播放热门歌曲。' + (snapshot?.enabled && snapshot.rememberArtists ? '本次选择会保存在“我的记忆”。' : '');
          result.choices = result.choices.map(choice => choice.kind === 'artist' && !choice.secondary ? { ...choice, label: '播放热门歌曲' } : choice);
        }
      }
      const nextRef = result.nextPage == null ? null : remember({ type: 'music-page', args: { ...args, page: result.nextPage } }, ctx);
      if (nextRef) result.choices.push({ id: 'music-search-next', kind: 'navigation', title: '下一页音乐', label: '下一页', action: 'music.search.next', data: { ref: nextRef } });
      if (!ctx.task.adaptive || !result.choices?.length) { if (nextRef) result.observation = { nextRef }; return result; }
      const items = [];
      result.choices = result.choices.map(choice => {
        if (choice.secondary || choice.kind === 'navigation') return choice;
        const ref = remember(choice.data, ctx);
        items.push({ ref, kind: choice.kind, title: choice.title.slice(0, 80) });
        return { ...choice, data: { ...choice.data, assistantRef: ref } };
      });
      result.observation = { items: items.slice(0, 20), requiresSelection: true, nextRef };
      return result;
    }
    async function queueTool(step, ctx) {
      const args = step.args;
      if (step.tool === 'music.collection.get') {
        const entry = resolve(args.ref, ctx);
        const loaded = await musicObjects.tracks(entry.value, ctx);
        const ref = remember({ songs: loaded.songs, title: entry.value.title }, ctx, entry.selected);
        return { message: `已读取${entry.value.title}的${loaded.songs.length}首曲目。`, observation: { ref, count: loaded.songs.length, total: loaded.total, truncated: loaded.total > loaded.songs.length } };
      }
      if (step.tool === 'music.queue.apply') {
        const entry = resolve(args.ref, ctx, true);
        if (!Array.isArray(entry.value.songs)) throw new Error('请先读取集合曲目');
        const state = await deps.applyMusicQueue(entry.value.songs, { ...args, title: entry.value.title }, ctx);
        entry.consumed = true;
        return { message: `已${args.mode === 'append' ? '追加到' : '替换'}本地队列，共${state.count}首${args.startPlayback ? '，并已确认开始播放' : '；未发起播放'}。`, observation: publicState(state) };
      }
      if (step.tool === 'music.playback.setMode') {
        const state = await deps.setMusicMode(args.mode, args.expectedRevision, ctx);
        return { message: `播放模式已设为${({ sequence: '顺序播放', loop: '列表循环', single: '单曲循环', shuffle: '随机播放' })[state.mode]}。`, observation: publicState(state) };
      }
      if (step.tool === 'music.queue.play') {
        const selected = args.ref ? resolve(args.ref, ctx).value : null;
        if (selected && !selected.songId) throw new Error('请选择队列中的歌曲引用');
        const state = await deps.playCurrentQueue(args.expectedRevision, selected?.songId, ctx, args.mode);
        return { message: `已确认播放《${state.currentSong?.title || '当前歌曲'}》，队列共${state.count}首。`, observation: publicState(state) };
      }
      const state = await deps.readMusicState(ctx);
      if (step.tool === 'music.state') return { message: `当前队列${state.count}首，${state.isPlaying ? '正在播放' : '未在播放'}${state.currentSong?.title ? `《${state.currentSong.title}》` : ''}。${['stale', 'unavailable'].includes(state.status) ? '队列已过期或与播放器不一致，需先核对。' : ''}`, observation: publicState(state) };
      const offset = args.offset || 0, rows = state.songs.slice(offset, offset + (args.limit || 20));
      const items = rows.map(song => ({ ref: remember(song, ctx, true), title: safeText(song.title).slice(0, 80), artist: safeText(song.artist).slice(0, 80) }));
      return { message: `当前队列共${state.count}首，本页${items.length}首。`, result: items.map(item => ({ title: item.title, subtitle: item.artist })),
        observation: { ...publicState(state), items, truncated: state.count > state.songs.length, nextOffset: offset + rows.length < state.songs.length ? offset + rows.length : null } };
    }

    const management = Management.create(deps, { remember, resolve, publicState, videoURL, safeText, now });
    async function execute(step, ctx) {
      if (step.tool === 'memory.manage') {
        const request = Memory.command(ctx.task.input?.text);
        if (!request || step.args.text !== ctx.task.input.text) throw new Error('只能保存你本次明确表达的偏好');
        const snapshot = await memoryCall('get', null, ctx);
        if (request.operation === 'list') {
          const effective = Memory.effective(snapshot);
          return { message: `音乐默认：歌手热门歌曲${effective.artistDefaultAction === 'play' ? '直接播放' : '先展示'}；${effective.artistQueueMode === 'append' ? '保留原队列' : '替换队列'}。已记住 ${snapshot.artists.length} 个歌手选择。可在“我的记忆”中修改、删除或暂停使用。` };
        }
        await memoryCall('write', { ...request, source: ctx.task.input.text, sourceId: ctx.task.conversationId || ctx.task.id, sourceStartedAt: ctx.task.conversationStartedAt || ctx.task.startedAt, expectedRevision: snapshot.revision }, ctx);
        return { message: `已保存音乐偏好：${ctx.task.input.text}${snapshot.enabled ? '。' : '。当前已暂停使用记忆，可在“我的记忆”中重新启用。'}` };
      }
      Contract.validatePlan({ steps: [step], ...(step.tool === 'tools.load' ? { continue: true } : {}) }, ctx.task.input.app); ctx.guard();
      if (step.tool === 'app.status') {
        const status = await deps.connectionStatus(step.args.platform, ctx);
        return { message: status.local ? `通知权限：${({ granted: '已允许', denied: '已关闭', unknown: '暂不可确认' })[status.notificationPermission] || '暂不可确认'}。` : status.connected ? '账号已连接。' : ({ 'oauth-not-configured': '尚未配置Google连接，请打开YouTube工作台设置。', 'authorization-required': '需要在YouTube工作台完成账号授权。', 'login-required': '账号尚未登录，请在对应原站登录。' })[status.status] || '暂时无法确认账号连接状态。', observation: status };
      }
      if (step.tool === 'tools.load') {
        const groups = ctx.task.memory?.toolGroups || [];
        if (groups.includes(step.args.group)) throw new Error('工具组已加载，无需重复加载');
        return { message: '已准备好后续操作。', memory: { toolGroups: [...groups, step.args.group] }, observation: { group: step.args.group } };
      }
      if (step.tool === 'music.search.next') { const entry = resolve(step.args.ref, ctx); if (entry.value.type !== 'music-page') throw new Error('翻页引用无效'); return searchMusic(entry.value.args, ctx); }
      if (['music.playback.control', 'music.playback.seek', 'music.queue.remove', 'music.queue.clear'].includes(step.tool)) return management.music(step.tool, step.args, ctx);
      if (['music.state', 'music.queue.list', 'music.playback.setMode', 'music.queue.play', 'music.collection.get', 'music.queue.apply'].includes(step.tool)) return queueTool(step, ctx);
      if (step.tool === 'music.search') return searchMusic(step.args, ctx);
      if (step.tool === 'music.intent') return musicIntent(step.args.text, ctx);
      if (step.tool === 'music.sleep') { const res = await sleepMusic(step.args.minutes); if (!res?.ok) throw new Error(res?.error || '设置失败'); return { message: step.args.minutes ? `已设置 ${step.args.minutes} 分钟后暂停音乐` : '已取消音乐定时' }; }
      if (step.tool === 'alarm.prepare') return alarmPrepare(step.args.text, ctx);
      if (step.tool.startsWith('alarm.')) return management.alarms(step.tool, step.args, ctx);
      if (step.tool === 'video.history') return videos(step.tool, step.args, ctx);
      if (step.tool.startsWith('video.')) return management.videos(step.tool, step.args, ctx);
      throw new Error('工具未接入');
    }
    async function choose(choice, ctx) {
      ctx.guard(); const data = choice.data;
      if (choice.action === 'music.play-artist' && data?.kind === 'artist') return playArtist({ ...choice, title: data.title }, await readMemory(ctx), ctx);
      if (data?.kind === 'artist' && ['music.browse', 'music.enqueue-collection', 'music.play-collection'].includes(choice.action)) {
        const request = ctx.task.memory?.artistRequest;
        const snapshot = await readMemory(ctx);
        const query = ctx.task.musicView?.kind === 'search' ? ctx.task.musicView.title : data.title;
        if (choice.action === 'music.browse' && request?.goal === 'play') {
          const outcome = await playArtist(choice, snapshot, ctx);
          await rememberArtist(choice, query, snapshot, ctx);
          return outcome;
        }
        if (!ctx.task.adaptive || !data.assistantRef || choice.action !== 'music.browse') {
          const outcome = await musicObjects.choose(choice, ctx);
          await rememberArtist({ ...choice, title: data.title }, query, snapshot, ctx);
          return outcome;
        }
      }
      if (choice.action === 'music.search.next') { const entry = resolve(data.ref, ctx); if (entry.value.type !== 'music-page') throw new Error('翻页引用无效'); return searchMusic(entry.value.args, ctx); }
      const managed = await management.choose(choice, ctx); if (managed) return managed;
      if (ctx.task.adaptive && choice.action === 'music.browse' && data.assistantRef) {
        const entry = resolve(data.assistantRef, ctx); entry.selected = true;
        return { message: `已选择${entry.value.title}，继续处理原需求。`, observation: { selectedRef: data.assistantRef, title: entry.value.title } };
      }
      if (choice.action.startsWith('music.')) return musicObjects.choose(choice, ctx);
      if (choice.action === 'alarm.create') {
        if (data.zone !== Intl.DateTimeFormat().resolvedOptions().timeZone || (data.alarm.fireAt && data.alarm.fireAt <= now())) throw new Error('提醒时间已过或时区已变化，请重新输入');
        ctx.guard(); const result = await saveAlarm({ ...data.alarm, id: `assistant_${ctx.task.id}`, smartInput: true });
        if (!result?.alarm) throw new Error('未收到提醒保存结果');
        return { message: `${result.duplicate ? '已有相同提醒' : '已设置提醒'}：${result.alarm.date || '重复提醒'} ${result.alarm.time} · ${result.alarm.label}` };
      }
      if (choice.action === 'video.open') { const url = videoURL(data.platform, data.id, data.seconds, data.page); ctx.guard(); await openURL(url); return { message: `已在原站打开《${data.title}》${data.page > 1 ? `第 ${data.page} P` : ''}${data.seconds > 0 ? `，链接定位到 ${time(data.seconds)}` : ''}。请以播放器的实际状态为准。` }; }
      if (choice.action === 'video.search-site' && data.platform === 'youtube') { const url = new URL('https://www.youtube.com/results'); url.searchParams.set('search_query', data.query); ctx.guard(); await openURL(url.href); return { message: '已打开 YouTube 原站搜索结果。' }; }
      throw new Error('候选动作无效');
    }
    return { plan, execute, choose };
  }
  return { create, videoURL, safeText };
});
