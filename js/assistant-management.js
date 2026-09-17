(function (root) {
  'use strict';
  const Alarm = typeof module === 'object' && module.exports ? require('./alarm-core.js') : root.AlarmCore;
  function create(deps, { remember, resolve, publicState, videoURL, safeText, now }) {
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const alarmView = a => ({ label: a.label, date: a.date, time: a.time, repeat: a.repeat, days: a.days, enabled: a.enabled, revision: a.revision });
    const alarmText = a => `${a.label} · ${a.date || a.repeat} ${a.time} · ${a.enabled ? '已开启' : '已关闭'}`;
    function entry(ref, type, ctx, selected = false) {
      const record = resolve(ref, ctx, selected);
      if (record.value.type !== type) throw new Error('资源引用类型不匹配');
      return record;
    }
    async function currentAlarm(ref, ctx, selected = false) {
      const record = entry(ref, 'alarm', ctx, selected);
      const { alarms } = await deps.listAlarms(); ctx.guard();
      const alarm = (alarms || []).find(a => a.id === record.value.alarm.id);
      if (!alarm || JSON.stringify(alarm) !== JSON.stringify(record.value.alarm)) throw new Error('提醒已被修改或删除，请重新查询');
      return { record, alarm };
    }
    async function alarms(tool, args, ctx) {
      if (tool === 'alarm.list') {
        const { alarms = [] } = await deps.listAlarms(); ctx.guard();
        const matches = alarms.filter(a => !args.query || String(a.label).toLowerCase().includes(args.query.toLowerCase()));
        const offset = args.offset || 0, rows = matches.slice(offset, offset + (args.limit || 20));
        const items = rows.map(alarm => ({ ref: remember({ type: 'alarm', alarm }, ctx, matches.length === 1), ...alarmView(alarm) }));
        const choosing = ctx.task.adaptive && matches.length > 1;
        const nextOffset = offset + rows.length < matches.length ? offset + rows.length : null;
        return { message: matches.length ? `找到${matches.length}条提醒${choosing ? '，请选择要操作的目标' : ''}。` : '当前没有匹配提醒。',
          ...(choosing ? { status: 'waiting', choices: items.map(item => ({ id: `alarm-${item.ref}`, title: item.label, subtitle: `${item.date || item.repeat} ${item.time}`, label: '选择', action: 'alarm.select', data: { ref: item.ref } })).concat(nextOffset == null ? [] : [{ id: 'alarm-next-page', kind: 'navigation', title: '下一页提醒', label: '下一页', action: 'alarm.page', data: { ...args, offset: nextOffset } }]) } : {}),
          result: rows.map(a => ({ title: safeText(a.label), subtitle: alarmText(a) })),
          observation: { items, total: matches.length, nextOffset: offset + rows.length < matches.length ? offset + rows.length : null, today: dateKey(new Date(ctx.task.startedAt || now())), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
      }
      const { record, alarm } = await currentAlarm(args.ref, ctx, tool !== 'alarm.get');
      if (tool === 'alarm.get') return { message: alarmText(alarm), result: [{ title: alarm.label, subtitle: alarmText(alarm) }], observation: { ref: args.ref, ...alarmView(alarm), today: dateKey(new Date(ctx.task.startedAt || now())) } };
      if (tool === 'alarm.toggle') {
        const result = await deps.mutateAlarm({ action: 'toggle', id: alarm.id, expectedRevision: alarm.revision, expectedSnapshot: JSON.stringify(alarm), enabled: args.enabled }, ctx);
        if (!result?.ok) throw new Error(result?.error || '没有收到提醒开关回执');
        record.consumed = true;
        return { message: `已${args.enabled ? '开启' : '关闭'}提醒：${alarm.label}。`, observation: { label: alarm.label, enabled: args.enabled } };
      }
      let patch = null;
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tool === 'alarm.update.prepare') {
        patch = { ...alarm };
        for (const key of ['label', 'date', 'time']) if (args[key] != null) patch[key] = args[key];
        if (args.dayOffset != null) { const d = new Date(ctx.task.startedAt || now()); d.setDate(d.getDate() + args.dayOffset); patch.date = dateKey(d); }
        if (alarm.repeat !== 'once' && (args.date || args.dayOffset != null)) throw new Error('这是重复提醒；本期可修改名称和时间，不能把重复规则默认为一次性提醒');
        if (alarm.repeat === 'once' && (args.date || args.time || args.dayOffset != null)) patch.fireAt = null;
        patch = Alarm.normalizeAlarm(patch, now());
        if (patch.repeat === 'once' && (!patch.fireAt || patch.fireAt <= now())) throw new Error('修改后的提醒时间必须在未来');
      }
      const action = patch ? 'update' : 'delete';
      return { status: 'review', message: patch ? `修改前：${alarmText(alarm)}\n修改后：${alarmText(patch)}（${zone}）。确认后保存。` : `确认删除提醒：${alarmText(alarm)}？`,
        choices: [{ id: `alarm-confirm-${args.ref}`, title: patch ? alarmText(patch) : alarmText(alarm), subtitle: zone, label: patch ? '确认修改' : '确认删除', action: 'alarm.commit', data: { ref: args.ref, action, patch, zone } }] };
    }
    async function music(tool, args, ctx) {
      if (tool === 'music.playback.control') {
        const before = await deps.readMusicState(ctx); if (before.revision !== args.expectedRevision) throw new Error('播放器状态已变化');
        const result = await deps.controlMusic({ action: args.action, ...(args.value != null ? { value: args.value } : {}) }, ctx);
        if (!result?.ok) throw new Error(result?.error || '播放器没有确认操作');
        return { message: result.message, observation: publicState(await deps.readMusicState(ctx)) };
      }
      if (tool === 'music.playback.seek') {
        const state = await deps.seekMusic(args.seconds, args.expectedRevision, ctx);
        return { message: `已将音乐定位到${Math.floor(state.currentTime)}秒。`, observation: publicState(state) };
      }
      const state = await deps.readMusicState(ctx);
      if (state.revision !== args.expectedRevision) throw new Error('队列已变化，请重新查询');
      let song = null;
      if (tool === 'music.queue.remove') {
        song = resolve(args.ref, ctx).value;
        if (!song.songId || !state.songs.some(s => s.songId === song.songId)) throw new Error('歌曲已不在当前队列');
      }
      const action = song ? 'remove' : 'clear';
      if (!song || song.songId === state.currentSongId) return { status: 'review', message: song ? `将停止播放并移除《${song.title}》，确认后执行。` : `将停止播放并清空本地队列（${state.count}首），确认后执行。`,
        choices: [{ id: 'queue-edit-confirm', title: song ? `移除《${song.title}》` : `清空${state.count}首本地曲目`, label: '确认', action: 'music.queue.commit', data: { action, songId: song?.songId, expectedRevision: state.revision } }] };
      const next = await deps.editMusicQueue(action, song.songId, state.revision, ctx);
      return { message: `已从队列移除《${song.title}》，剩余${next.count}首。`, observation: publicState(next) };
    }
    async function choose(choice, ctx) {
      const d = choice.data; ctx.guard();
      if (choice.action === 'alarm.page') return alarms('alarm.list', d, ctx);
      if (choice.action === 'alarm.select') { const { record, alarm } = await currentAlarm(d.ref, ctx); record.selected = true; return { message: `已选择${alarmText(alarm)}。`, observation: { selectedRef: d.ref, ...alarmView(alarm) } }; }
      if (choice.action === 'alarm.commit') {
        if (Intl.DateTimeFormat().resolvedOptions().timeZone !== d.zone) throw new Error('时区已变化，请重新准备修改');
        const { record, alarm } = await currentAlarm(d.ref, ctx, true);
        if (d.patch?.repeat === 'once' && d.patch.fireAt <= now()) throw new Error('提醒时间已过，请重新修改');
        const result = await deps.mutateAlarm({ action: d.action, id: alarm.id, expectedRevision: alarm.revision, expectedSnapshot: JSON.stringify(alarm), patch: d.patch }, ctx);
        if (d.action === 'update' ? !result?.alarm : !result?.ok) throw new Error(result?.error || '没有收到提醒操作回执');
        record.consumed = true;
        return { message: d.action === 'update' ? `已修改提醒：${alarmText(result.alarm)}。` : `已删除提醒：${alarm.label}。`, observation: { action: d.action, label: result.alarm?.label || alarm.label } };
      }
      if (choice.action === 'music.queue.commit') {
        const state = await deps.editMusicQueue(d.action, d.songId, d.expectedRevision, ctx);
        return { message: `已停止播放并${d.action === 'clear' ? '清空本地队列' : '移除当前歌曲'}，剩余${state.count}首。`, observation: publicState(state) };
      }
      if (choice.action === 'video.next') return videos('video.search.next', d, ctx);
      if (choice.action === 'video.select') {
        const record = entry(d.ref, 'video', ctx); record.selected = true;
        return { message: `已选择《${record.value.video.title}》。`, observation: { selectedRef: d.ref, platform: record.value.platform } };
      }
      return null;
    }
    const validVideo = (platform, id) => (platform === 'youtube' ? /^[A-Za-z0-9_-]{11}$/ : /^BV[A-Za-z0-9]{10}$/).test(id || '');
    function seconds(value) {
      if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
      if (typeof value !== 'string') return null;
      const iso = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
      if (iso && iso.slice(1).some(Boolean)) return Number(iso[1] || 0) * 3600 + Number(iso[2] || 0) * 60 + Number(iso[3] || 0);
      if (/^\d+(?::\d{1,2}){1,2}$/.test(value)) return value.split(':').reduce((n, part) => n * 60 + Number(part), 0);
      return null;
    }
    async function details(platform, video, ctx) {
      ctx.guard();
      if (platform === 'youtube') {
        const response = await deps.youtube('videos', { part: 'snippet,contentDetails', id: video.id }); ctx.guard();
        const item = response.items?.find(v => v.id === video.id);
        if (!item) throw new Error('该视频不存在或当前账号不可见');
        return { ...video, title: safeText(item.snippet?.title), author: safeText(item.snippet?.channelTitle), durationSeconds: ['live', 'upcoming'].includes(item.snippet?.liveBroadcastContent) ? null : seconds(item.contentDetails?.duration), publishedAt: item.snippet?.publishedAt || null };
      }
      const response = await deps.bilibili('/x/web-interface/view', { bvid: video.id }); ctx.guard();
      if (response.code !== 0 || !response.data || (response.data.bvid && response.data.bvid !== video.id)) throw new Error(response.message || '视频详情不可用');
      const d = response.data;
      return { ...video, title: safeText(d.title), author: safeText(d.owner?.name), durationSeconds: seconds(d.duration), publishedAt: Number.isFinite(d.pubdate) ? new Date(d.pubdate * 1000).toISOString() : null };
    }
    function videoEntry(args, ctx, selected = false) {
      const record = entry(args.ref, 'video', ctx, selected);
      if (record.value.platform !== args.platform) throw new Error('视频引用与平台不一致');
      return record;
    }
    async function videos(tool, args, ctx) {
      if (['video.details', 'video.progress.get', 'video.open'].includes(tool)) {
        const record = videoEntry(args, ctx, tool === 'video.open'), video = record.value.video;
        if (tool === 'video.details') {
          const data = await details(args.platform, video, ctx); record.value.video = data;
          return { message: `《${data.title}》 · ${data.author}${data.durationSeconds == null ? '；没有可用时长' : ` · ${data.durationSeconds}秒`}。`, observation: { ref: args.ref, platform: args.platform, title: data.title, author: data.author, durationSeconds: data.durationSeconds, publishedAt: data.publishedAt } };
        }
        if (tool === 'video.open') {
          if (record.opened) throw new Error('这个选择已经打开，不能重复执行');
          const url = videoURL(args.platform, video.id, video.seconds || 0, video.page || 1); ctx.guard(); await deps.openURL(url);
          record.opened = true;
          return { message: `已在原站打开《${video.title}》${video.seconds > 0 ? `，定位到${Math.floor(video.seconds)}秒` : ''}；是否播放以原站播放器为准。`, observation: { opened: true, playbackConfirmed: false } };
        }
        let progress = null, source;
        if (args.platform === 'youtube') {
          const data = await deps.storage.get('youtubeWatchProgress'); ctx.guard();
          const value = data.youtubeWatchProgress?.[video.id];
          if (Number.isFinite(value?.time) && value.time >= 0) progress = value.time;
          source = '扩展本地观看进度';
        } else {
          const response = await deps.bilibili('/x/web-interface/history/cursor', { ps: 30, business: 'archive' }); ctx.guard();
          if (response.code !== 0) throw new Error(response.message || '观看记录查询失败');
          const row = response.data?.list?.find(v => (v.bvid || v.history?.bvid) === video.id);
          if (row && Number.isFinite(row.progress) && row.progress >= 0) { progress = row.progress; video.page = Number(row.history?.page) || 1; }
          source = 'B站最近一页观看记录';
        }
        if (progress != null) video.seconds = progress;
        return { message: progress == null ? `${source}中没有可用续播秒数，不代表从未观看。` : `${source}：观看至${Math.floor(progress)}秒。`, observation: { ref: args.ref, source, known: progress != null, seconds: progress } };
      }
      let platform = args.platform, queryArgs = args, cursor = null, rows = null, next = null;
      if (tool === 'video.search.next') {
        const record = entry(args.ref, 'video-page', ctx);
        if (record.value.platform !== platform) throw new Error('翻页引用与平台不一致');
        queryArgs = record.value.args; cursor = record.value.next;
        if (record.value.rows?.length) { rows = record.value.rows; next = cursor; }
        else if (!cursor) throw new Error('已经没有下一页');
      }
      if (!rows) {
        if (platform === 'youtube') {
          let response;
          try { response = await deps.youtube('search', { part: 'snippet', q: queryArgs.query, type: 'video', maxResults: 8, ...(cursor?.token ? { pageToken: cursor.token } : {}) }); }
          catch (error) {
            if (!['auth-required', 'auth-expired', 'not-connected', 'oauth-not-configured'].includes(error.code)) throw error;
            return { status: 'waiting', message: 'YouTube账号尚未连接。可打开原站搜索；原站搜索不会自动应用这里的时长筛选。', choices: [{ id: 'youtube-search', title: `在YouTube搜索：${queryArgs.query}`, label: '原站搜索', action: 'video.search-site', data: { platform, query: queryArgs.query } }] };
          }
          rows = (response.items || []).map(v => ({ id: v.id?.videoId, title: safeText(v.snippet?.title), author: safeText(v.snippet?.channelTitle), seconds: 0, live: ['live', 'upcoming'].includes(v.snippet?.liveBroadcastContent), publishedAt: v.snippet?.publishedAt || null }));
          next = response.nextPageToken ? { token: response.nextPageToken } : null;
          if (queryArgs.minSeconds != null || queryArgs.maxSeconds != null) {
            const ids = rows.filter(v => validVideo(platform, v.id)).map(v => v.id);
            const data = ids.length ? await deps.youtube('videos', { part: 'contentDetails', id: ids.join(',') }) : {};
            const durations = new Map((data.items || []).map(v => [v.id, seconds(v.contentDetails?.duration)]));
            rows = rows.map(v => ({ ...v, durationSeconds: v.live ? null : durations.get(v.id) ?? null }));
          }
        } else {
          const page = cursor?.page || 1;
          const response = await deps.bilibili('/x/web-interface/search/type', { search_type: 'video', keyword: queryArgs.query, page }); ctx.guard();
          if (response.code !== 0) throw new Error(response.message || 'B站搜索失败');
          rows = (response.data?.result || []).slice(0, 100).map(v => ({ id: v.bvid, title: safeText(v.title), author: safeText(v.author), seconds: 0, durationSeconds: seconds(v.duration) }));
          next = page < Number(response.data?.numPages || 0) ? { page: page + 1 } : null;
        }
        ctx.guard(); rows = rows.filter(v => validVideo(platform, v.id));
        if (queryArgs.minSeconds != null || queryArgs.maxSeconds != null) rows = rows.filter(v => Number.isFinite(v.durationSeconds) && v.durationSeconds >= (queryArgs.minSeconds ?? 0) && v.durationSeconds <= (queryArgs.maxSeconds ?? Infinity));
      }
      const pageRows = rows.slice(0, 8), rest = rows.slice(8);
      const nextRef = rest.length || next ? remember({ type: 'video-page', platform, args: queryArgs, rows: rest, next }, ctx) : null;
      const items = pageRows.map(video => ({ ref: remember({ type: 'video', platform, video }, ctx), title: video.title, author: video.author, durationSeconds: video.durationSeconds ?? null }));
      const choices = pageRows.map((video, i) => ({ id: `video-${items[i].ref}`, title: video.title, subtitle: `${video.author}${video.durationSeconds == null ? '' : ` · ${video.durationSeconds}秒`}`, label: ctx.task.adaptive ? '选择' : '打开视频', action: ctx.task.adaptive ? 'video.select' : 'video.open', data: ctx.task.adaptive ? { ref: items[i].ref } : { ...video, platform } }));
      if (nextRef) choices.push({ id: 'video-next', kind: 'navigation', title: '下一页', label: '下一页', action: 'video.next', data: { platform, ref: nextRef } });
      return { ...(pageRows.length || (!ctx.task.adaptive && nextRef) ? { status: 'waiting' } : {}), message: pageRows.length ? `找到${pageRows.length}个视频，请选择${nextRef ? '或继续下一页' : ''}。` : '本页没有匹配视频；未知时长不会算作满足时长筛选。', choices,
        observation: { platform, items, nextRef, durationFilterApplied: queryArgs.minSeconds != null || queryArgs.maxSeconds != null } };
    }
    return { alarms, music, videos, choose };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantManagement = api;
})(globalThis);
