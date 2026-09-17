(function () {
  'use strict';
  const send = (action, body = {}) => new Promise(resolve => chrome.runtime.sendMessage({ action, ...body }, result => resolve(result || { ok: false, error: '扩展后台未响应' })));
  const norm = text => String(text || '').trim().toLocaleLowerCase();
  window.MusicAssistant = {
    mount(player) {
      const pane = player._el.querySelector('#mc-pane-search');
      if (!pane || pane.querySelector('.music-assistant')) return;
      const box = document.createElement('section'); box.className = 'music-assistant';
      box.innerHTML = `
        <div class="assistant-session-bar">
          <div class="music-assistant-heading"><span class="music-assistant-title">AI 音乐助手</span><strong data-session-state>新需求</strong></div>
          <div class="music-session-actions"><button type="button" data-session-new>新建另一条</button><button type="button" data-session-edit>编辑当前需求</button><button type="button" data-session-end>结束本次</button></div>
        </div>
        <form><label><span>一句话听音乐</span><input maxlength="500" placeholder="播放周杰伦的晴天，或输入：暂停" aria-label="一句话听音乐" required></label><button type="submit">执行</button><button type="button" data-cancel hidden>停止处理，保留会话</button></form>
        <p role="status" aria-live="polite">点歌、调音量，或设置定时关闭，说一句就好。</p>
        <div data-choices></div>
        <details class="assistant-transcript"><summary>查看本次对话</summary><div data-session-history></div></details>`;
      pane.prepend(box);
      const input = box.querySelector('input'), status = box.querySelector('p'), choices = box.querySelector('[data-choices]'), cancel = box.querySelector('[data-cancel]');
      let generation = 0, jobId = null, recommendationController = null, selectable = [], running = false;
      let storage; try { storage = window.sessionStorage; } catch {}
      const session = AssistantSession.create('music', storage, { history: event => send('ai_history_write', { body: { operation: 'event', event } }) });
      input.addEventListener('input', () => session.set({ editingText: input.value }));
      function renderSession() {
        const labels = { idle:'新需求', active:'正在处理', waiting:'会话中 · 待补充或选择', review:'会话中 · 待选择', error:'会话保留 · 可重试', completed:'已完成', cancelled:'已结束' };
        box.querySelector('[data-session-state]').textContent = labels[session.data.state] + (session.data.historyWarning ? ' · ' + session.data.historyWarning : '');
        const history = box.querySelector('[data-session-history]'); history.replaceChildren();
        for (const turn of session.data.turns) { const row = document.createElement('p'); row.textContent = `${turn.role === 'user' ? '你' : '助手'}：${turn.content}`; history.append(row); }
        input.placeholder = session.open ? '继续补充，或输入：第二个' : '播放周杰伦的晴天，或输入：暂停';
        box.querySelector('[type="submit"]').textContent = session.open ? '发送补充' : '执行';
        box.querySelector('[data-session-edit]').disabled = !session.open || running;
        box.querySelector('[data-session-edit]').hidden = !session.open;
        box.querySelector('[data-session-end]').hidden = !session.open;
        box.querySelector('[data-session-new]').hidden = session.data.state === 'idle';
        box.querySelector('.assistant-transcript').hidden = !session.data.turns.length;
        cancel.hidden = !running;
      }
      function complete() { session.end(); renderSession(); }
      function addChoice(button, label, handler) {
        const index = selectable.length + 1;
        button.textContent = `${index}. ${label}`;
        const choose = async () => {
          if (running || button.disabled) return;
          running = true; renderSession();
          const id = session.data.id, selectedVersion = generation;
          try {
            await handler();
            if (id === session.data.id && session.data.state !== 'cancelled' && (selectedVersion === generation || session.data.state === 'completed')) session.reply(`选择第 ${index} 个：${label}`.slice(0,500), status.textContent, session.data.state === 'completed' ? 'completed' : 'waiting');
          } catch (error) { if (id === session.data.id && selectedVersion === generation) { session.set({ state: 'error' }); feedback(error.message); } }
          finally { if (id === session.data.id && (selectedVersion === generation || !running)) { running = false; renderSession(); } }
        };
        selectable.push({ choose }); button.addEventListener('click', choose);
      }
      const feedback = text => { status.textContent = text; };
      const invalidate = () => {
        generation++; recommendationController?.abort(); recommendationController = null; if (jobId) void send('ai_job_cancel', { jobId }); jobId = null;
        cancel.hidden = true; choices.replaceChildren(); selectable = [];
      };
      const stopRequest = () => { invalidate(); running = false; if (session.open) session.set({ state: 'waiting' }); renderSession(); };
      const voice = window.VoiceInput?.mount({ root: box.querySelector('form'), input, notify: feedback, onStart: () => { if (running) stopRequest(); } });
      box.querySelector('[data-session-new]').addEventListener('click', () => { voice?.cancel(); invalidate(); running = false; session.start(); input.value = ''; feedback('已开启新会话'); renderSession(); input.focus(); });
      box.querySelector('[data-session-end]').addEventListener('click', () => { voice?.cancel(); invalidate(); running = false; session.end('cancelled'); input.value = ''; feedback('本次会话已结束'); renderSession(); });
      box.querySelector('[data-session-edit]').addEventListener('click', () => { if (!running && session.open) { input.value = session.data.draft?.query || session.data.turns.filter(t => t.role === 'user').map(t => t.content).join('，'); input.focus(); } });
      cancel.addEventListener('click', () => { stopRequest(); feedback('已停止处理，会话仍保留；可继续补充或结束本次'); });
      // A manual player interaction takes precedence over an outstanding assistant request.
      player._el.addEventListener('pointerdown', event => { if (!box.contains(event.target)) { stopRequest(); if (session.open) feedback('播放器已手动操作，旧候选已失效；本次需求仍保留，可继续补充'); } }, true);
      player._el.addEventListener('keydown', event => { if (!box.contains(event.target) && ['Enter', ' '].includes(event.key)) stopRequest(); }, true);
      async function play(song, version, sequence) {
        if (version !== generation || sequence !== player._playRequestSeq) return;
        feedback(`正在准备：${song.title} · ${song.artist}`);
        const [url, detail] = await Promise.all([player._getSongUrl(song.songId, sequence), player._neteaseApi('/api/v3/song/detail', { c: JSON.stringify([{ id: song.songId }]) })]);
        if (version !== generation || sequence !== player._playRequestSeq) return;
        if (!url) throw new Error('这首歌暂不可播放，请选择其他版本');
        // Resolve the URL before touching the current playback or queue.
        if (!player._playlist.some(item => String(item.songId) === String(song.songId))) { player._playlist.push({ ...song, index: player._playlist.length }); player._savePlaylistCache(); }
        const result = await player._playSongById(song.songId, { knownSong: song, resolvedUrl: url, resolvedDetail: detail || { ok: false }, assistantGuard: () => version === generation });
        if (version !== generation) return;
        if (!result?.ok) throw new Error('播放器未确认播放成功，请检查登录或选择其他歌曲');
        feedback(`正在播放：${song.title} · ${song.artist}`); cancel.hidden = true; choices.replaceChildren(); selectable = []; complete();
      }
      async function execute(raw, version, sequence, requestText) {
        const intent = MusicIntent.validate(raw);
        if (version !== generation || sequence !== player._playRequestSeq) return;
        if (intent.action === 'clarify') { feedback(intent.question); return; }
        session.set({ draft: intent });
        if (intent.action === 'recommend') {
          feedback('正在检索真实歌单…');
          const found = await player._searchPlaylistCandidates(intent.query);
          if (version !== generation || sequence !== player._playRequestSeq) return;
          if (!found?.ok) throw new Error('歌单搜索失败，请检查连接');
          const candidates = (found.data?.result?.playlists || []).filter(item => /^\d+$/.test(String(item.id))).slice(0,8);
          if (!candidates.length) throw new Error('没有找到相关歌单，请换个描述');
          let picks = [], fallback = false;
          if (candidates.length === 1) picks = [{index:1,reason:'唯一搜索结果，请查看曲目后选择',quote:''}];
          else {
            const controller = recommendationController = new AbortController();
            feedback('正在根据歌单标题与简介选择…');
            try {
              const ranked = await window.SceneAI.run('music.recommend', {query:session.data.turns.filter(t => t.role === 'user').map(t => t.content).concat(requestText).join('；').slice(-500),candidates:candidates.map(item=>({name:String(item.name||'').slice(0,120),description:String(item.description||'').slice(0,200)}))}, {signal:controller.signal});
              picks = ranked.recommendations;
            } catch(error) {
              if (controller.signal.aborted || version !== generation) return;
              fallback = true; picks = candidates.slice(0,3).map((_,index)=>({index:index+1,reason:'原始搜索结果，AI 排序未完成',quote:''}));
            } finally { if (recommendationController === controller) recommendationController = null; }
          }
          if (version !== generation || sequence !== player._playRequestSeq) return;
          feedback(picks.length ? (fallback ? 'AI 排序不可用，以下为原始搜索结果。' : '依据标题和简介推荐，曲目属性请在歌单中核对。') : '现有歌单资料不足以推荐，请换个描述');
          for (const pick of picks) {
            const candidate = candidates[pick.index-1]; if (!candidate) continue;
            const button = document.createElement('button'); button.type = 'button'; button.textContent = `${candidate.name} — ${pick.reason}`;
            if (pick.quote) button.title = `依据：${pick.quote}`;
            addChoice(button, `${candidate.name} — ${pick.reason}`, async () => { if(version!==generation || sequence!==player._playRequestSeq)return; choices.replaceChildren(); selectable = []; player._switchTab('playlists'); await player._loadPlaylistSongsViaApi(candidate.id,null); if(version!==generation)return; feedback('已打开所选歌单，可继续补充偏好'); session.set({ state: 'waiting' }); });
            choices.append(button);
          }
          return;
        }
        if (intent.action === 'search') {
          const showArtists = artists => {
            for (const candidate of artists.slice(0,6)) {
              const button=document.createElement('button');button.type='button';
              addChoice(button, `歌手 · ${candidate.name} — 查看热门歌曲与专辑`, async()=>{
                if(version!==generation || sequence!==player._playRequestSeq)return;
                choices.replaceChildren();selectable=[];
                await player._openArtistActionSheet(candidate.id,candidate.name,candidate.img1v1Url||'');
                if(version===generation) feedback(`已打开歌手：${candidate.name}`);
              });choices.append(button);
            }
          };
          if (intent.kind === 'artist') {
            feedback('正在查找歌手…');
            const response=await player._searchArtistCandidates(intent.query);
            if(version!==generation || sequence!==player._playRequestSeq)return;
            if(!response?.ok)throw new Error('歌手搜索暂不可用，请检查连接后重试');
            const artists=MusicSearch.artists(response.data?.result?.artists || [],intent.query);
            if(!artists.length)throw new Error('没有找到歌手，请补充完整姓名或别名');
            feedback('找到以下歌手，选择后查看热门歌曲和专辑：');showArtists(artists);return;
          }
          if(intent.kind === 'playlist') {
            feedback('正在查找歌单…');
            const response=await player._searchPlaylistCandidates(intent.query);
            if(version!==generation || sequence!==player._playRequestSeq)return;
            if(!response?.ok)throw new Error('歌单搜索暂不可用，请检查连接后重试');
            const candidates=MusicSearch.unique(response.data?.result?.playlists || []);
            if(!candidates.length)throw new Error('没有找到歌单，请换个关键词');
            feedback('找到以下歌单，选择后查看曲目：');
            for(const candidate of candidates.slice(0,6)) {
              const button=document.createElement('button');button.type='button';
              addChoice(button,`歌单 · ${candidate.name}${candidate.creator?.nickname ? ` · ${candidate.creator.nickname}` : ''}`,async()=>{
                if(version!==generation || sequence!==player._playRequestSeq)return;
                choices.replaceChildren();selectable=[];player._switchTab('playlists');await player._loadPlaylistSongsViaApi(candidate.id,null);
                if(version===generation)feedback(`已打开歌单：${candidate.name}`);
              });choices.append(button);
            }
            return;
          }
          feedback('正在网易云搜索…');
          let [response, artistResponse] = await Promise.all([
            player._searchSongCandidates(intent.query).catch(()=>({ok:false})),
            intent.kind === 'auto' ? player._searchArtistCandidates(intent.query).catch(()=>({ok:false})) : null
          ]);
          if (version !== generation || sequence !== player._playRequestSeq) return;
          const matchesRequest = song => MusicSearch.exact(song.name,intent.title) && (!intent.artist || (song.ar || song.artists || []).some(a=>MusicSearch.exact(a.name,intent.artist)));
          if (intent.title && intent.query !== intent.title && !(response?.data?.result?.songs || []).some(matchesRequest)) {
            const fallback = await player._searchSongCandidates(intent.title).catch(()=>({ok:false}));
            if(fallback?.ok) response = {ok:true,data:{result:{songs:MusicSearch.unique([...(response?.data?.result?.songs || []),...(fallback.data?.result?.songs || [])])}}};
          }
          if (version !== generation || sequence !== player._playRequestSeq) return;
          const exactArtists = intent.kind === 'auto' ? MusicSearch.artists(artistResponse?.data?.result?.artists || [],intent.query).filter(a=>MusicSearch.exact(a.name,intent.query)||(a.alias||[]).some(alias=>MusicSearch.exact(alias,intent.query))) : [];
          if (!response?.ok && !exactArtists.length) throw new Error('歌曲搜索失败，请检查网易云连接');
          const songs = MusicSearch.songs(response.data?.result?.songs || [],intent).map(song => ({ songId: song.id, title: song.name || '', artist: (song.ar || song.artists || []).map(artist => artist.name).join('/'), album: song.al?.name || song.album?.name || '', artists: song.ar || song.artists || [] }));
          if(exactArtists.length)showArtists(exactArtists);
          if (!songs.length && !exactArtists.length) throw new Error('没有找到歌曲，请补充完整歌名或歌手');
          const exact = intent.title ? songs.filter(song => MusicSearch.exact(song.title,intent.title) && (!intent.artist || song.artists.some(artist => MusicSearch.exact(artist.name,intent.artist)))) : [];
          if(exactArtists.length && !exact.length) { feedback('识别到匹配歌手，选择后查看热门歌曲与专辑：'); return; }
          if (exact.length === 1 && !exactArtists.length && (intent.kind !== 'auto' || artistResponse?.ok)) return play(exact[0], version, sequence);
          feedback(exactArtists.length ? '同时找到同名歌手和歌曲，请选择：' : exact.length ? '找到以下歌曲版本，请点击或输入序号选择：' : '未找到完全匹配，以下是相关歌曲，请核对歌手和版本后选择：');
          for (const song of (exact.length ? exact : songs).slice(0, 6)) {
            const button = document.createElement('button'); button.type = 'button'; button.textContent = `${song.title} · ${song.artist}`;
            addChoice(button, `歌曲 · ${song.title} · ${song.artist}${song.album ? ` · ${song.album}` : ''}`,  async () => {
              if (version !== generation || sequence !== player._playRequestSeq) return;
              cancel.hidden = false;
              choices.querySelectorAll('button').forEach(item => { item.disabled = true; });
              try { await play(song, version, sequence); } catch (error) { if (version === generation) { feedback(error.message); choices.querySelectorAll('button').forEach(item => { item.disabled = false; }); } }
              finally { if (version === generation) cancel.hidden = true; }
            }); choices.append(button);
          }
          return;
        }
        if (intent.action === 'sleep') {
          const saved = await (intent.minutes === 0 ? player._cancelSleepTimer() : player._setSleepTimer(intent.minutes));
          if (version !== generation) return;
          if (!saved?.ok) throw new Error(saved?.error || '音乐定时未保存');
          feedback(intent.minutes ? `将在 ${intent.minutes} 分钟后停止播放` : '已取消音乐定时关闭'); complete(); return;
        }
        if (intent.action === 'next' || intent.action === 'previous') {
          if (!player._playlist?.length && !player._fmMode) throw new Error('播放队列为空，请先点一首歌');
          if (intent.action === 'next') player._nextTrack(); else player._prevTrack();
          feedback('已提交切歌请求，请查看播放条状态'); complete(); return;
        }
        let response;
        if (intent.action === 'volume') {
          const volume = Math.max(0, Math.min(1, intent.value ?? (player.state.volume + intent.delta)));
          if (player._offscreenMode) response = await player._offscreenCommand('setVolume', volume);
          else if (player._builtinAudio) { player._builtinAudio.volume = volume; response = { ok: true }; }
          if (version !== generation) return;
          if (!response?.ok) throw new Error('音量调整失败，请检查播放器连接');
          player.state.volume = volume; player._updateVolumeUI(volume); await player._saveVolume(volume);
          if (version !== generation) return;
          feedback(`音量已调整为 ${Math.round(volume * 100)}%`); complete(); return;
        }
        const pause = intent.action === 'pause';
        if (player._offscreenMode) response = await player._offscreenCommand(pause ? 'pause' : 'resume');
        else if (player._builtinAudio?.src) { if (pause) player._builtinAudio.pause(); else await player._builtinAudio.play(); response = { ok: true }; }
        if (version !== generation) return;
        if (!response?.ok) throw new Error('播放器尚未就绪，请先选择歌曲');
        player.state.isPlaying = !pause; player._updateUI(); feedback(pause ? '已暂停播放' : '已继续播放'); complete();
      }
      box.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault();
        const requestText = input.value.trim(); if (!requestText) return;
        const ordinal = /^(?:播放|选|选择|就)?第?([1-6一二三四五六两])(?:个|首|项)?(?:吧)?$/.exec(requestText);
        if (ordinal) {
          const n = Number(ordinal[1]) || ({一:1,二:2,两:2,三:3,四:4,五:5,六:6})[ordinal[1]];
          if (!selectable[n-1]) { feedback('当前没有这个候选，请重新描述歌曲或重新搜索'); return; }
          input.value = ''; await selectable[n-1].choose(); return;
        }
        invalidate(); const version = generation, sequence = player._playRequestSeq;
        if (!session.open) session.start();
        let context;
        try { context = session.request(requestText); } catch(error) { feedback(error.message); renderSession(); return; }
        running = true; renderSession();
        cancel.hidden = false; feedback('正在理解音乐需求…');
        try {
          let result = await send('music_ai_interpret', { text: requestText, ...context });
          if (version !== generation) { if (result.jobId) void send('ai_job_cancel', { jobId: result.jobId }); return; }
          jobId = result.jobId || null; const deadline = Date.now() + 100000;
          while (result.ok && result.status === 'pending') {
            if (Date.now() > deadline) throw new Error('音乐解析超时，请重试');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (version !== generation) return;
            result = await send('music_ai_result', { jobId });
          }
          if (version !== generation) return;
          if (!result.ok) throw new Error(result.error || '音乐解析失败');
          session.set({ currentSource: result.source || null });
          await execute(result.intent, version, sequence, requestText);
          if (version === generation) {
            const state = session.data.state === 'completed' ? 'completed' : 'waiting';
            session.reply(requestText, status.textContent, state); if (input.value.trim() === requestText) input.value = ''; renderSession();
          }
        } catch (error) { if (version === generation) { if (jobId) void send('ai_job_cancel', { jobId }); session.reply(requestText, error.message, 'error'); feedback(error.message); renderSession(); } }
        finally { if (version === generation) { jobId = null; running = false; cancel.hidden = true; renderSession(); } }
      });
      if (session.open) { input.value = session.data.editingText || session.data.pendingText || ''; feedback('已恢复未完成的音乐会话；候选需重新搜索，继续补充即可'); }
      renderSession();
    }
  };
})();
