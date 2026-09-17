(function (root) {
  'use strict';
  const Match = typeof module === 'object' && module.exports ? require('./assistant-match.js') : root.AssistantMatch;
  const Search = typeof module === 'object' && module.exports ? require('./music-search.js') : root.MusicSearch;
  const INDEX = 'quickAssistantMusicIndexV1';
  const valid = id => /^\d+$/.test(String(id || ''));
  const text = value => String(value || '').replace(/<[^>]*>/g, '').slice(0, 180);
  function image(value) { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; } }
  const song = raw => ({ songId: String(raw.id || raw.songId || ''), title: text(raw.name || raw.title), artist: (raw.ar || raw.artists || []).map(a => text(a.name)).join(' / ') || text(raw.artist), album: text((raw.al || raw.album)?.name || (typeof raw.album === 'string' ? raw.album : '')), cover: image((raw.al || raw.album)?.picUrl || raw.cover), duration: Number(raw.dt || raw.duration) || 0 });
  const duration = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
  function songChoices(items) {
    return items.filter(s => valid(s.songId)).slice(0, 30).flatMap(s => [
      { id: `song-${s.songId}`, kind: 'song', title: s.title, subtitle: s.artist + (s.album ? ` · ${s.album}` : ''), cover: s.cover, detail: duration(s.duration), label: '播放', action: 'music.play', data: s },
      { id: `queue-${s.songId}`, kind: 'song', secondary: true, parentId: `song-${s.songId}`, title: `加入并播放：${s.title}`, label: '+', action: 'music.enqueue', data: s }
    ]);
  }
  function create({ netease, storage, playMusic, playQueue, enqueueMusic }) {
    async function api(endpoint, params, method = 'GET') {
      const result = await netease(endpoint, params, method);
      if (!result || (result.code != null && result.code !== 200)) throw new Error(`${result?.message || '网易云请求未成功'}（${endpoint}，业务码 ${result?.code ?? '未知'}）`);
      return result;
    }
    async function searchType(query, type, ctx, page = 0) {
      let lastError, success = false;
      const key = ({ 1: 'songs', 100: 'artists', 10: 'albums', 1000: 'playlists' })[type];
      for (const endpoint of (page ? ['/api/cloudsearch/get/web', '/api/search/get/web'] : ['/api/cloudsearch/get/web', '/api/search/get/web', '/api/search/suggest/web'])) {
        ctx.guard();
        try { const data = await api(endpoint, { s: query, type, limit: type === 1 ? 16 : 8, offset: page * (type === 1 ? 16 : 8) }, 'POST'); success = true;
          if (data.result?.[key]?.length) {
            const rows = data.result[key];
            const total = data.result[({ 1: 'songCount', 100: 'artistCount', 10: 'albumCount', 1000: 'playlistCount' })[type]] ?? data.result.playListCount;
            rows.hasNextPage = endpoint !== '/api/search/suggest/web' && ((Number.isFinite(total) && (page + 1) * (type === 1 ? 16 : 8) < total) || data.result.hasMore === true);
            return rows;
          } }
        catch (error) { lastError = error; }
      }
      if (!success && lastError) throw lastError;
      return [];
    }
    function objectChoices(items, kind) {
      return items.filter(v => valid(v.id) && typeof v.name === 'string' && v.name.trim()).slice(0, 8).map(v => ({ id: `${kind}-${v.id}`, kind, title: text(v.name),
        subtitle: kind === 'album' ? `专辑 · ${text(v.artist?.name || (v.artists || []).map(a => a.name).join(' / '))}` : kind === 'artist' ? '歌手 · 热门歌曲' : `歌单${Number.isFinite(v.trackCount) ? ` · ${v.trackCount} 首` : ''}${v.creator?.nickname ? ` · ${text(v.creator.nickname)}` : ''}`,
        cover: image(v.picUrl || v.img1v1Url || v.coverImgUrl), label: kind === 'artist' ? '查看歌手' : kind === 'album' ? '查看专辑' : '查看歌单', action: 'music.browse', data: { kind, id: String(v.id), title: text(v.name), cover: image(v.picUrl || v.img1v1Url || v.coverImgUrl) } }));
    }
    function collectionChoices(choices) {
      return choices.flatMap(c => ['artist', 'album', 'playlist'].includes(c.kind) && !c.secondary ? [c, {
        id: `add-${c.id}`, kind: c.kind, secondary: true, parentId: c.id,
        title: c.kind === 'artist' ? `替换队列并播放${c.title}的热门歌曲` : `替换队列并播放${c.kind === 'album' ? '整张专辑' : '歌单'}：${c.title}`, label: '+', action: 'music.enqueue-collection', data: c.data
      }] : [c]);
    }
    async function search(intent, ctx) {
      const query = intent.query, type = intent.action === 'recommend' || intent.kind === 'playlist' ? 1000 : intent.kind === 'artist' ? 100 : intent.kind === 'album' ? 10 : intent.kind === 'song' ? 1 : null;
      const cached = storage?.get ? (await storage.get(INDEX))[INDEX] || [] : [];
      let choices = [];
      if (!intent.page && /^[a-z][a-z\s.'-]{0,60}$/i.test(query)) {
        choices = Match.rank(cached, query, item => [item.title]).filter(c => !type || c.kind === ({ 1: 'song', 100: 'artist', 10: 'album', 1000: 'playlist' })[type]).slice(0, 24);
        if (choices.length) return { status: 'waiting', message: '匹配到本地音乐索引。选择对象后读取最新内容。', musicView: { kind: 'search', title: query, local: true }, browseStack: [], choices: collectionChoices(choices.flatMap(c => c.kind === 'song' ? songChoices([c.data]) : [c])) };
      }
      const types = type ? [type] : [100, 10, 1000, 1];
      await ctx.progress('正在搜索歌手、专辑、歌单和歌曲…');
      const results = await Promise.allSettled(types.map(t => searchType(query, t, ctx, intent.page || 0)));
      ctx.guard();
      for (let i = 0; i < types.length; i++) {
        if (results[i].status !== 'fulfilled') continue;
        if (types[i] === 1) {
          let rows = Search.songs(results[i].value, intent);
          if (intent.artist) rows = rows.filter(v => (v.ar || v.artists || []).some(a => Search.exact(a.name, intent.artist)));
          if (!rows.length && intent.title && intent.title !== query) {
            rows = Search.songs(await searchType(intent.title, 1, ctx), intent);
            if (intent.artist) rows = rows.filter(v => (v.ar || v.artists || []).some(a => Search.exact(a.name, intent.artist)));
          }
          choices.push(...songChoices(rows.slice(0, 16).map(song)));
        } else choices.push(...objectChoices(results[i].value, types[i] === 100 ? 'artist' : types[i] === 10 ? 'album' : 'playlist'));
      }
      ctx.guard();
      if (!choices.length && results.every(r => r.status === 'rejected')) throw results[0].reason;
      if (!choices.length) return { status: 'clarify', message: '没有找到匹配对象。可输入中文名称，或调整关键词；全站拼音召回取决于网易云接口。' };
      const index = new Map(cached.map(c => [c.id, c]));
      for (const c of choices.filter(c => !c.secondary)) { index.delete(c.id); index.set(c.id, c); }
      if (storage?.set) await storage.set({ [INDEX]: [...index.values()].slice(-200) });
      return { status: 'waiting', message: '选择歌手、专辑或歌单浏览内容；点 + 替换队列并播放整组；单曲点 + 加入并立即播放。', musicView: { kind: 'search', title: query }, browseStack: [], nextPage: (intent.page || 0) < 19 && results.some(r => r.status === 'fulfilled' && r.value.hasNextPage) ? (intent.page || 0) + 1 : null, choices: collectionChoices(choices) };
    }
    async function tracks(object, ctx) {
      ctx.guard();
      if (!valid(object.id) || !['artist', 'album', 'playlist'].includes(object.kind)) throw new Error('音乐对象无效');
      if (object.kind === 'artist') {
        let error;
        for (const endpoint of ['/api/artist/top/song', '/api/v1/artist']) {
          try { const data = await api(endpoint, { id: object.id }, 'POST'); ctx.guard(); const rows = data.songs || data.hotSongs; if (rows?.length) return { songs: rows.map(song).filter(s => valid(s.songId)).slice(0, 100), total: rows.length }; }
          catch (e) { error = e; }
        }
        if (error) throw error; return { songs: [], total: 0 };
      }
      if (object.kind === 'album') {
        const response = await api(`/api/v1/album/${object.id}`, {}, 'POST'); ctx.guard();
        if (!Array.isArray(response.songs)) throw new Error('专辑不存在或当前账号无权读取');
        const rows = response.songs.map(song).filter(s => valid(s.songId));
        return { songs: rows.slice(0, 300), total: Number(response.album?.size) || rows.length };
      }
      const response = await api('/api/v6/playlist/detail', { id: object.id, n: 300 }); ctx.guard();
      const playlist = response.playlist;
      if (!playlist) throw new Error('歌单不存在或当前账号无权读取');
      const ids = (playlist.trackIds || playlist.tracks || []).map(t => String(t.id)).filter(valid).slice(0, 300);
      const found = new Map((playlist.tracks || []).map(v => [String(v.id), song(v)]));
      const missing = ids.filter(id => !found.has(id));
      for (let i = 0; i < missing.length; i += 50) {
        ctx.guard(); const details = await api('/api/v3/song/detail', { c: JSON.stringify(missing.slice(i, i + 50).map(id => ({ id }))) });
        for (const v of details.songs || []) if (valid(v.id)) found.set(String(v.id), song(v));
      }
      ctx.guard(); return { songs: ids.map(id => found.get(id)).filter(Boolean), total: Number(playlist.trackCount) || ids.length };
    }
    function playReceipt(ctx, message, playback) {
      const previous = ctx.task.selectionView || {};
      return { ...previous, keepChoices: true, message, playback,
        choices: [{ id: 'music-current-queue', kind: 'collection-action', title: '查看当前播放队列', label: '查看队列', action: 'music.queue', data: {} }, ...(previous.choices || []).filter(c => c.id !== 'music-current-queue')] };
    }
    async function choose(choice, ctx) {
      const object = choice.data;
      if (choice.action === 'music.queue') {
        const stored = await storage.get('musicPlaylistCache'); ctx.guard();
        const rows = (stored.musicPlaylistCache?.playlist || []).map(song).filter(s => valid(s.songId));
        return { status: 'waiting', message: `当前播放队列共${rows.length}首${rows.length > 30 ? '，下方显示前30首' : ''}。单曲点 + 加入并播放；整组点 + 替换队列并播放。`,
          musicView: { kind: 'queue', title: '当前播放队列' }, browseStack: [...(ctx.task.browseStack || []), ctx.task.selectionView].filter(Boolean).slice(-4),
          choices: [{ id:'music-back',kind:'navigation',title:'返回上一页',label:'← 返回',action:'music.back',data:{} }, ...songChoices(rows)] };
      }
      if (choice.action === 'music.browse') {
        const loaded = await tracks(object, ctx); ctx.guard();
        const stack = [...(ctx.task.browseStack || []), ctx.task.selectionView].filter(Boolean).slice(-4);
        const choices = [{ id: 'music-back', kind: 'navigation', title: ctx.task.musicView?.title ? `返回${ctx.task.musicView.title}` : '返回搜索结果', label: '← 返回', action: 'music.back', data: {} }];
        if (loaded.songs.length) choices.push({ id: `enqueue-${object.kind}-${object.id}`, kind: 'collection-action', title: object.kind === 'artist' ? `替换队列并播放热门歌曲（${loaded.songs.length}首）` : `替换队列并播放${object.kind === 'album' ? '专辑' : '歌单'}（${loaded.songs.length}首）`, label: '替换并播放', action: 'music.enqueue-collection', data: object });
        if (object.kind === 'artist') choices.push({ id: `albums-${object.id}`, kind: 'collection-action', title: '浏览歌手专辑', label: '查看专辑', action: 'music.artist-albums', data: object });
        choices.push(...songChoices(loaded.songs));
        return { status: 'waiting', message: `${object.title} · 已加载 ${loaded.songs.length} 首${loaded.songs.length > 30 ? '，下方展示前30首' : ''}。浏览不会改变当前播放。`, choices, browseStack: stack, musicView: { ...object, total: loaded.total, loaded: loaded.songs.length } };
      }
      if (choice.action === 'music.artist-albums') {
        if (object.kind !== 'artist' || !valid(object.id)) throw new Error('歌手无效');
        let albums = [], failure, succeeded = false;
        const paths = [`/api/artist/albums/${object.id}`, '/api/artist/albums', '/api/v1/artist/albums'];
        for (const path of paths) {
          for (const method of ['GET', 'POST']) {
            ctx.guard();
            try {
              const result = await api(path, { id: object.id, limit: 30, offset: 0, total: true }, method);
              succeeded = true;
              albums = [result.hotAlbums, result.albums, result.data?.hotAlbums, result.data?.albums].find(Array.isArray) || [];
              if (albums.length) break;
            } catch (error) { failure = error; }
          }
          if (albums.length) break;
        }
        ctx.guard();
        if (!albums.length) {
          // Search is a fallback only; verify artist identity rather than returning namesakes.
          try {
            const found = await searchType(object.title, 10, ctx);
            albums = found.filter(album => [album.artist, ...(album.artists || [])].filter(Boolean).some(a => String(a.id) === object.id || (!a.id && Search.exact(a.name, object.title))));
            succeeded = true;
          } catch (error) { failure = error; }
        }
        if (!albums.length && !succeeded && failure) throw failure;
        const choices = objectChoices(albums, 'album');
        return { status: 'waiting', message: choices.length ? '选择专辑查看曲目，或点 + 替换队列并播放整张专辑。当前最多展示8张专辑。' : '没有读取到该歌手的专辑。', musicView: { kind: 'artist-albums', title: object.title }, browseStack: [...(ctx.task.browseStack || []), ctx.task.selectionView].filter(Boolean).slice(-4),
          choices: [{ id: 'music-back', kind: 'navigation', title: `返回${object.title}`, label: '← 返回', action: 'music.back', data: {} }, ...collectionChoices(choices)] };
      }
      if (['music.enqueue-collection', 'music.play-collection'].includes(choice.action)) {
        await ctx.progress(`正在读取${object.title}的曲目…`);
        const loaded = await tracks(object, ctx); ctx.guard();
        const unique = [...new Map(loaded.songs.map(s => [s.songId, s])).values()];
        if (!unique.length) throw new Error('没有可播放的曲目，原队列未更改');
        await ctx.progress(`正在准备${object.title}，找到${unique.length}首；确认可播放后替换队列…`);
        const result = await playQueue(unique, ctx, object.title);
        if (!result?.ok) throw new Error(result?.error || '播放器未确认播放');
        const current = result.song || unique[result.skipped || 0];
        return playReceipt(ctx, `已替换为${object.title}（${result.queueLength || unique.length}首），并开始播放《${current.title}》${result.skipped ? `；跳过开头${result.skipped}首不可播放曲目` : ''}。`,
          { mode: 'replace', title: current.title, artist: current.artist, songId: current.songId, count: result.queueLength || unique.length, source: object.title });
      }
      if (choice.action === 'music.back') {
        const stack = [...(ctx.task.browseStack || [])], previous = stack.pop();
        if (!previous) throw new Error('返回路径已失效，请重新搜索');
        return { ...previous, status: 'waiting', browseStack: stack };
      }
      if (['music.enqueue', 'music.play'].includes(choice.action)) {
        await ctx.progress(`正在准备《${object.title}》，加入队列并播放…`);
        ctx.guard(); const result = await playMusic(object, ctx);
        if (!result?.ok) throw new Error(result?.error || '播放器未确认播放');
        return playReceipt(ctx, `已加入队列并开始播放《${object.title}》 · ${object.artist}`,
          { mode: 'append', title: object.title, artist: object.artist, songId: object.songId, count: result.queueLength });
      }
      throw new Error('音乐操作无效');
    }
    return { search, choose, tracks };
  }
  const api = { create, song, songChoices, image };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AssistantMusic = api;
})(globalThis);
