window.chrome = { runtime: { sendMessage(message, callback) { callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal(message.text || '暂停') }); } } };
const preview = { _el: document.querySelector('#player'), _playRequestSeq: 0, _playlist: [], state: { volume: .5 }, _offscreenMode: true,
  _searchArtistCandidates: async()=>({ok:true,data:{result:{artists:[{id:1,name:'林俊杰'}]}}}),
  _openArtistActionSheet:async()=>{},
  _searchSongCandidates: async () => ({ ok: true, data: { result: { songs: [1, 2].map(id => ({ id, name: '有何不可', artists: [{ name: id === 1 ? '许嵩' : '翻唱歌手' }] })) } } }),
  _getSongUrl: async () => 'fixture-only', _neteaseApi: async () => ({ ok: false }), _playSongById: async () => ({ ok: true }),
  _savePlaylistCache() {}, _offscreenCommand: async () => ({ ok: true }), _updateUI() {}, _saveVolume: async () => {}, _updateVolumeUI() {},
  _setSleepTimer: async () => ({ ok: true }), _cancelSleepTimer: async () => ({ ok: true }) };
MusicAssistant.mount(preview);

// Exercise the production search renderers against isolated candidate data.
const normal=document.createElement('section');normal.id='normal-search';normal.innerHTML=`<h2>搜索音乐 · 隔离数据</h2><div class="mc-search-bar"><input id="mc-search-input" aria-label="普通搜索" placeholder="输入林俊杰并回车"><button id="mc-search-clear" hidden>清除</button></div><div id="mc-search-results"></div><p data-opened></p>`;document.body.append(normal);
const search=window.musicController;search._el=normal;search._searchType=0;search._saveSearchHistory=()=>{};
search._neteaseApi=async(_path,params)=>({ok:true,data:{result:params.type===100?{artists:[{id:12,name:'林俊杰',albumSize:20,musicSize:200}]}:params.type===1000?{playlists:[{id:91,name:'林俊杰精选',creator:{nickname:'测试歌单'}}]}:{songs:[{id:1,name:'江南',artists:[{id:12,name:'林俊杰'}]},{id:2,name:'曹操',artists:[{id:12,name:'林俊杰'}]}]}}});
search._openArtistActionSheet=async(_id,name)=>{normal.querySelector('[data-opened]').textContent=`已选择歌手：${name}`;};
normal.querySelector('input').addEventListener('input',()=>search._onSearchInputChange());
normal.querySelector('input').addEventListener('keydown',event=>{if(event.key==='Enter')void search._performSearch(event.target.value);});
