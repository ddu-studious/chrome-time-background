const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const MusicIntent = require('../js/music-intent.js');
const MusicSearch = require('../js/music-search.js');
const AssistantSession = require('../js/assistant-session.js');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
class Element {
  constructor() { this.events = {}; this.nodes = {}; this.children = []; this.hidden = false; this.value = ''; }
  querySelector(key) { return this.nodes[key] ||= new Element(); }
  querySelectorAll() { return this.children; }
  addEventListener(key, handler) { this.events[key] = handler; }
  append(child) { this.children.push(child); }
  prepend(child) { this.box = child; }
  replaceChildren() { this.children = []; }
  focus() {}
  contains(target) { return target === this || Object.values(this.nodes).includes(target); }
}
function fixture(sceneAI, windowExtras = {}) {
  const root = new Element(), pane = new Element();
  pane.querySelector = () => null;
  root.nodes['#mc-pane-search'] = pane;
  const pending = [];
  const player = { _el: root, _playRequestSeq: 0, _playlist: [], state: { volume: .5 }, _offscreenMode: true,
    _savePlaylistCache() {}, _saveVolume: async () => {}, _updateVolumeUI() {}, _updateUI() {},
    _getSongUrl: async () => 'https://audio.test/song', _neteaseApi: async () => ({ ok: true, data: { result: { songs: [{ id: 1, name: '晴天', artists: [{ name: '周杰伦' }] }] } } }),
    _playSongById: async () => { player.played = true; return { ok: true }; }, _offscreenCommand: async () => ({ ok: true }) };
  player._searchArtistCandidates = async()=>({ok:true,data:{result:{artists:[]}}});
  player._searchSongCandidates = () => player._neteaseApi();
  const context = { window: {SceneAI:sceneAI, ...windowExtras}, MusicIntent, MusicSearch, AssistantSession, document: { createElement: () => new Element() }, chrome: { runtime: { sendMessage(message, callback) { if (message.action === 'ai_history_write') { callback({ ok: true }); return; } pending.push({ message, callback }); } } }, setTimeout, Date, console, AbortController };
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/music-assistant.js'), 'utf8'), context);
  context.window.MusicAssistant.mount(player);
  const box = pane.box;
  const submit = text => { box.querySelector('input').value = text; return box.querySelector('form').events.submit({ preventDefault() {} }); };
  return { player, root, box, pending, submit };
}
test('唯一精确候选等待真实链接后才播放', async () => {
  const f = fixture(), url = deferred(); f.player._getSongUrl = () => url.promise;
  const run = f.submit('播放周杰伦的晴天');
  f.pending[0].callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal('播放周杰伦的晴天') });
  await new Promise(setImmediate); assert.equal(f.player.played, undefined);
  url.resolve('https://audio.test/song'); await run;
  assert.equal(f.player.played, true); assert.match(f.box.querySelector('p').textContent, /正在播放/);
});
test('准备期间手动操作或取消使旧请求失效，不污染队列', async () => {
  for (const manual of [true, false]) {
    const f = fixture(), url = deferred(); f.player._getSongUrl = () => url.promise;
    const run = f.submit('播放晴天');
    f.pending[0].callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal('播放晴天') });
    await new Promise(setImmediate);
    if (manual) f.root.events.pointerdown({ target: new Element() }); else f.box.querySelector('[data-cancel]').events.click();
    url.resolve('https://audio.test/song'); await run;
    assert.equal(f.player.played, undefined); assert.equal(f.player._playlist.length, 0);
  }
});
test('连续请求乱序返回时只执行最新请求', async () => {
  const f = fixture();
  const first = f.submit('播放晴天'), second = f.submit('暂停');
  f.pending[1].callback({ ok: true, status: 'ready', intent: { action: 'pause' } }); await second;
  f.pending[0].callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal('播放晴天') }); await first;
  assert.equal(f.player.played, undefined); assert.equal(f.box.querySelector('p').textContent, '已暂停播放');
});
test('重复版本须选候选，不自动播放；无版权保持旧队列', async () => {
  const f = fixture(); f.player._neteaseApi = async () => ({ ok: true, data: { result: { songs: [1, 2].map(id => ({ id, name: '晴天', artists: [{ name: '周杰伦' }] })) } } });
  const run = f.submit('播放晴天'); f.pending[0].callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal('播放晴天') }); await run;
  assert.equal(f.box.querySelector('[data-choices]').children.length, 2); assert.equal(f.player.played, undefined);
  f.player._getSongUrl = async () => null;
  await f.box.querySelector('[data-choices]').children[0].events.click();
  assert.equal(f.player._playlist.length, 0); assert.match(f.box.querySelector('p').textContent, /不可播放/);
});

test('歌手加歌名无结果时按歌名检索并重新核对歌手', async () => {
  const f = fixture(), queries = [];
  f.player._searchSongCandidates = async query => {
    queries.push(query);
    return query.includes(' ') ? { ok: true, data: { result: { songs: [] } } } : f.player._neteaseApi();
  };
  const run = f.submit('播放周杰伦的晴天');
  f.pending[0].callback({ ok: true, status: 'ready', intent: MusicIntent.parseLocal('播放周杰伦的晴天') });
  await run;
  assert.deepEqual(queries, ['周杰伦 晴天', '晴天']); assert.equal(f.player.played, true);
});

test('定时设置必须等后台确认，失败不能报告已设置', async () => {
  const f = fixture(); f.player._setSleepTimer = async () => ({ ok: false, error: '后台保存失败' });
  const run = f.submit('听半小时就关掉');
  f.pending[0].callback({ ok: true, status: 'ready', intent: { action: 'sleep', minutes: 30 } });
  await run;
  assert.equal(f.box.querySelector('p').textContent, '后台保存失败');
});

test('推荐排序失败明确展示原始候选，不冒充 AI 推荐或自动播放', async () => {
  const f = fixture({run:async()=>{throw new Error('模型离线');}});
  f.player._searchPlaylistCandidates = async()=>({ok:true,data:{result:{playlists:[{id:1,name:'专注音乐'},{id:2,name:'安静音乐'}]}}});
  const run=f.submit('放点专注音乐');f.pending[0].callback({ok:true,status:'ready',intent:{action:'recommend',query:'专注音乐'}});await run;
  assert.match(f.box.querySelector('p').textContent,/原始搜索结果/);assert.equal(f.player.played,undefined);assert.equal(f.box.querySelector('[data-choices]').children.length,2);
});
test('取消推荐时中止二次模型请求，迟到推荐不显示', async () => {
  const rank=deferred();let signal;
  const f=fixture({run:async(_scene,_body,options)=>{signal=options.signal;return rank.promise;}});
  f.player._searchPlaylistCandidates=async()=>({ok:true,data:{result:{playlists:[{id:1,name:'专注'},{id:2,name:'学习'}]}}});
  const run=f.submit('放点专注音乐');f.pending[0].callback({ok:true,status:'ready',intent:{action:'recommend',query:'专注'}});await new Promise(setImmediate);
  f.box.querySelector('[data-cancel]').events.click();assert.equal(signal.aborted,true);rank.resolve({recommendations:[{index:1,reason:'专注',quote:'专注'}]});await run;
  assert.equal(f.box.querySelector('[data-choices]').children.length,0);
});

test('澄清后短句带原问答，完成后下一条不带旧会话', async () => {
  const f=fixture();let run=f.submit('播放晴天');
  f.pending[0].callback({ok:true,intent:{action:'clarify',question:'哪位歌手的？'}});await run;
  run=f.submit('周杰伦');assert.equal(f.pending[1].message.turns[0].content,'播放晴天');assert.equal(f.pending[1].message.turns[1].content,'哪位歌手的？');
  f.pending[1].callback({ok:true,intent:MusicIntent.parseLocal('播放周杰伦的晴天')});await run;
  run=f.submit('暂停');assert.equal(f.pending[2].message.turns.length,0);assert.equal(f.pending[2].message.draft,null);
  f.pending[2].callback({ok:true,intent:{action:'pause'}});await run;
});
test('文字第二个选择当前真实候选，新会话不能再选择旧候选', async () => {
  const f=fixture();let playedId;
  f.player._neteaseApi=async()=>({ok:true,data:{result:{songs:[1,2].map(id=>({id,name:'晴天',artists:[{name:'周杰伦'}]}))}}});
  f.player._playSongById=async id=>{playedId=id;return {ok:true};};
  const run=f.submit('播放晴天');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放晴天')});await run;
  await f.submit('第二个');assert.equal(playedId,2);assert.equal(f.pending.length,1);
  f.box.querySelector('[data-session-new]').events.click();playedId=null;
  await f.submit('第二个');assert.equal(playedId,null);assert.match(f.box.querySelector('p').textContent,/没有这个候选/);
});
test('明确结束后旧响应不覆盖新状态、不执行；已输入的下一句不会被清空', async () => {
  const f=fixture();const first=f.submit('播放晴天');
  f.box.querySelector('[data-session-end]').events.click();
  f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放晴天')});await first;
  assert.equal(f.player.played,undefined);assert.match(f.box.querySelector('p').textContent,/已结束/);
  const next=f.submit('暂停');f.box.querySelector('input').value='再小声一点';
  f.pending[1].callback({ok:true,intent:{action:'pause'}});await next;assert.equal(f.box.querySelector('input').value,'再小声一点');
});
test('录音开始保留已展示候选，新建或结束会话取消旧语音',async()=>{
 let voiceOptions,cancelled=0;
 const f=fixture(null,{VoiceInput:{mount(options){voiceOptions=options;return {cancel(){cancelled++;}};}}});
 f.player._neteaseApi=async()=>({ok:true,data:{result:{songs:[1,2].map(id=>({id,name:'晴天',artists:[{name:'周杰伦'}]}))}}});
 const run=f.submit('播放晴天');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放晴天')});await run;
 voiceOptions.onStart();assert.equal(f.box.querySelector('[data-choices]').children.length,2);
 await f.submit('第二个');assert.equal(f.player.played,true);
 f.box.querySelector('[data-session-new]').events.click();f.box.querySelector('[data-session-end]').events.click();assert.equal(cancelled,2);
});
test('搜歌手时显示歌手入口，不自动播放相关歌曲',async()=>{
 const f=fixture();f.player._searchArtistCandidates=async()=>({ok:true,data:{result:{artists:[{id:12,name:'林俊杰'}]}}});let opened;
 f.player._openArtistActionSheet=async id=>{opened=id;};
 const run=f.submit('播放林俊杰');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放林俊杰')});await run;
 assert.equal(f.player.played,undefined);assert.match(f.box.querySelector('[data-choices]').children[0].textContent,/歌手 · 林俊杰/);
 await f.submit('第一个');assert.equal(opened,12);
});
test('同名歌手和歌曲必须选择；搜索故障不能冒充零结果',async()=>{
 const f=fixture();f.player._searchArtistCandidates=async()=>({ok:true,data:{result:{artists:[{id:12,name:'晴天'}]}}});
 const run=f.submit('播放晴天');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放晴天')});await run;
 assert.equal(f.player.played,undefined);assert.equal(f.box.querySelector('[data-choices]').children.length,2);
 assert.match(f.box.querySelector('p').textContent,/同名/);
});
test('歌单在AI区展示真实候选，支持序号进入曲目',async()=>{
 const f=fixture();let opened;f.player._searchPlaylistCandidates=async()=>({ok:true,data:{result:{playlists:[{id:91,name:'民谣精选',creator:{nickname:'测试'}}]}}});f.player._switchTab=()=>{};f.player._loadPlaylistSongsViaApi=async id=>{opened=id;};
 const run=f.submit('搜索歌单民谣');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('搜索歌单民谣')});await run;await f.submit('第一个');assert.equal(opened,91);assert.equal(f.player.played,undefined);
});
test('组合关键词只返回无关歌曲时重搜歌名并核对歌手',async()=>{
 const f=fixture(),queries=[];
 f.player._searchSongCandidates=async query=>{queries.push(query);return {ok:true,data:{result:{songs:query.includes(' ')?[{id:9,name:'无关歌曲',artists:[{name:'其他人'}]}]:[{id:1,name:'晴天',artists:[{name:'周杰伦'}]}]}}};};
 const run=f.submit('播放周杰伦的晴天');f.pending[0].callback({ok:true,intent:MusicIntent.parseLocal('播放周杰伦的晴天')});await run;
 assert.deepEqual(queries,['周杰伦 晴天','晴天']);assert.equal(f.player.played,true);
});
