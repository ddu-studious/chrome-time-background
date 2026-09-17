const test = require('node:test');
const assert = require('node:assert/strict');
const Match = require('../js/assistant-match.js');
const Music = require('../js/assistant-music.js');
const Engine = require('../js/assistant-engine.js');
const Contract = require('../js/assistant-contract.js');
function store() { const values = {}; return { async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } }; }
const songs = [{ id: 101, name: '逆战', ar: [{ name: '张杰' }], dt: 241000 }, { id: 102, name: '这，就是爱', ar: [{ name: '张杰' }], dt: 250000 }];
const ctx = () => ({ guard() {}, progress: async () => {}, task: { input: { app: 'music' }, memory: {} } });
function fixture() {
  const calls = [], actions = [], storage = store();
  const music = Music.create({ storage,
    netease: async (path, args) => {
      calls.push([path, args]);
      if (path.includes('playlist/detail')) return { code:200, playlist:{trackIds:[{id:102},{id:101}],tracks:songs,trackCount:2} };
      if (path.includes('/api/v1/album/')) return {code:200,album:{size:2},songs};
      if (path.includes('artist/albums')) return {code:200,hotAlbums:[{id:9,name:'这，就是爱',artist:{name:'张杰'}}]};
      if (path.includes('artist/top/song')) return {code:200,songs};
      return {code:200,result:args.type===100?{artists:[{id:7,name:'张杰'}]}:args.type===10?{albums:[{id:9,name:'这，就是爱',artist:{name:'张杰'}}]}:args.type===1000?{playlists:[{id:8,name:'张杰精选',trackCount:2}]}:{songs}};
    }, playMusic: async s => { actions.push(['song',s.songId]); return {ok:true}; },
    playQueue: async list => { actions.push(['queue',list.map(s=>s.songId)]); return {ok:true}; },
    enqueueMusic: async list => { actions.push(['append',list.map(s=>s.songId)]); return {message:'已加入'}; }
  });
  return { music, calls, actions, storage };
}
test('应用/动作全拼、首字母、原文排序与中文字符高亮', () => {
  assert.deepEqual(Match.match('张杰','zhangjie').range,[0,1]);
  assert.deepEqual(Match.match('张杰','zj').range,[0,1]);
  assert.equal(Match.rank(Contract.apps,'yy')[0].id,'music');
  assert.equal(Match.rank(Contract.skills,'jxk')[0].id,'history');
  assert.ok(Match.match('张杰','张杰').score>Match.match('张杰','zj').score);
  assert.equal(Match.match('张杰','missing'),null);
  const intent = require('../js/music-intent.js').parseLocal('播放张杰的歌单');
  assert.equal(intent.kind,'playlist');assert.equal(intent.query,'张杰');
  assert.equal(require('../js/music-intent.js').parseLocal('我的歌单'),null);
  assert.deepEqual(Contract.input({text:'@yy /ssyy 张杰'}),{app:'music',skill:'music-search',text:'张杰'});
});
test('综合检索独立调用歌曲/歌手/歌单接口，保留对象类型与真实ID', async () => {
  const f=fixture(); const result=await f.music.search({kind:'auto',query:'张杰'},ctx());
  assert.deepEqual(new Set(result.choices.filter(c=>!c.secondary).map(c=>c.kind)),new Set(['artist','album','playlist','song']));
  assert.deepEqual(f.calls.map(c=>c[1].type),[100,10,1000,1]);
  assert.equal(result.choices.find(c=>c.kind==='artist').data.id,'7');
  assert.equal(result.choices.find(c=>c.kind==='playlist').action,'music.browse');
  assert.equal(f.actions.length,0);
});
test('歌手/歌单浏览不播放，返回恢复原结果，播放整组使用真实曲目顺序', async () => {
  const f=fixture(); const c=ctx(); const root=await f.music.search({kind:'auto',query:'张杰'},c);
  c.task.selectionView=root;
  const browse=await f.music.choose(root.choices.find(x=>x.kind==='playlist'),c);
  assert.equal(browse.status,'waiting');assert.equal(f.actions.length,0);
  assert.equal(browse.musicView.kind,'playlist');assert.equal(browse.choices.find(x=>x.kind==='song').data.songId,'102');
  c.task.browseStack=browse.browseStack;
  const back=await f.music.choose(browse.choices.find(x=>x.action==='music.back'),c);
  assert.equal(back.musicView.kind,'search');assert.deepEqual(back.choices,root.choices);
  await f.music.choose(browse.choices.find(x=>x.action==='music.enqueue-collection'),c);
  assert.deepEqual(f.actions,[['queue',['102','101']]]);
});
test('拼音检索只匹配已知索引，不凭空生成中文ID；歌曲队列动作不会重复展开',async()=>{
  const f=fixture();await f.music.search({kind:'auto',query:'张杰'},ctx());f.calls.length=0;
  const result=await f.music.search({kind:'auto',query:'zj'},ctx());
  assert.equal(f.calls.length,0);assert.equal(result.musicView.local,true);
  assert.deepEqual(result.choices.filter(c=>!c.secondary).map(c=>c.kind),['artist','playlist']);
  const songsResult=await f.music.search({kind:'song',query:'逆战'},ctx());
  assert.equal(new Set(songsResult.choices.map(c=>c.id)).size,songsResult.choices.length);
});
test('浏览不推进后续定时，点加号播放成功后推进；再次点歌不重复定时',async()=>{
  const f=fixture();let timers=0;
  const engine=Engine.create({storage:f.storage,plan:async()=>({steps:[{tool:'music.intent',args:{text:'搜索张杰'}},{tool:'music.sleep',args:{minutes:30}}]}),
    execute:async(step,c)=>step.tool==='music.intent'?f.music.search({kind:'auto',query:'张杰'},c):(timers++,{message:'定时'}),choose:f.music.choose});
  await engine.submit({app:'music',text:'搜索张杰'});let task=await engine.settled();const version=task.version;
  await engine.choose(task.id,task.choices.find(c=>c.kind==='artist').id,task.version);task=await engine.settled();assert.equal(timers,0);
  await assert.rejects(engine.choose(task.id,'music-back',version),/页面已变化/);
  await engine.choose(task.id,task.choices.find(c=>c.secondary).id,task.version);task=await engine.settled();assert.equal(timers,1);assert.equal(task.status,'completed');assert.ok(task.choices.length);
  await engine.choose(task.id,task.choices.find(c=>c.kind==='song'&&!c.secondary).id,task.version);task=await engine.settled();assert.equal(timers,1);assert.equal(task.status,'completed');
});
test('歌单补全缺失详情保留 trackIds 顺序，不以返回顺序代替歌单顺序',async()=>{
  let played;
  const music=Music.create({storage:store(),netease:async path=>path.includes('playlist/detail')?{code:200,playlist:{trackIds:[{id:102},{id:101}],tracks:[],trackCount:2}}:{code:200,songs},playQueue:async s=>(played=s,{ok:true})});
  await music.choose({action:'music.play-collection',data:{id:'8',kind:'playlist',title:'张杰精选'}},ctx());
  assert.deepEqual(played.map(s=>s.songId),['102','101']);
});
test('专辑搜索有独立合同和类型，不会被解释为歌曲',async()=>{
  const plan=Contract.localPlan({app:'music',skill:'music-album',text:'这，就是爱'});
  assert.deepEqual(plan.steps,[{tool:'music.search',args:{kind:'album',query:'这，就是爱'}}]);
  const direct=Contract.localPlan({app:'music',text:'搜索专辑《这，就是爱》'});
  assert.equal(direct.steps[0].args.kind,'album');assert.equal(direct.steps[0].args.query,'这，就是爱');
  const f=fixture();const result=await f.music.search({kind:'album',query:'这，就是爱'},ctx());
  assert.deepEqual(f.calls.map(c=>c[1].type),[10]);assert.equal(result.choices[0].kind,'album');
  assert.equal(result.choices[1].action,'music.enqueue-collection');assert.equal(f.actions.length,0);
});
test('歌手加号替换队列并播放，成功后保留浏览结果',async()=>{
  const f=fixture(),c=ctx();const result=await f.music.search({kind:'artist',query:'张杰'},c);c.task.selectionView=result;
  const added=await f.music.choose(result.choices.find(c=>c.action==='music.enqueue-collection'),c);
  assert.deepEqual(f.actions,[['queue',['101','102']]]);assert.equal(added.keepChoices,true);assert.equal(added.playback.mode,'replace');assert.deepEqual(added.choices.filter(c=>c.action!=='music.queue'),result.choices);
  assert.equal(added.choices[0].action,'music.queue');
});
test('歌手专辑列表→专辑曲目→整张加入，返回顺序保持正确',async()=>{
  const f=fixture(),c=ctx();const result=await f.music.search({kind:'artist',query:'张杰'},c);c.task.selectionView=result;
  const artist=await f.music.choose(result.choices[0],c);
  c.task.selectionView=artist;c.task.browseStack=artist.browseStack;c.task.musicView=artist.musicView;
  const albums=await f.music.choose(artist.choices.find(c=>c.action==='music.artist-albums'),c);
  c.task.selectionView=albums;c.task.browseStack=albums.browseStack;c.task.musicView=albums.musicView;
  const album=await f.music.choose(albums.choices.find(c=>c.kind==='album'&&!c.secondary),c);
  assert.equal(album.musicView.kind,'album');assert.equal(f.actions.length,0);
  c.task.selectionView=album;c.task.browseStack=album.browseStack;c.task.musicView=album.musicView;
  await f.music.choose(album.choices.find(c=>c.action==='music.enqueue-collection'),c);
  assert.deepEqual(f.actions,[['queue',['101','102']]]);
  const back=await f.music.choose(album.choices.find(c=>c.action==='music.back'),c);assert.equal(back.musicView.kind,'artist-albums');
});
test('整组播放先去重，读取失败或取消不提交播放',async()=>{
  let writes=0;
  const music=Music.create({netease:async()=>({code:200,songs:[songs[0],songs[0],songs[1]]}),playQueue:async rows=>{writes++;assert.deepEqual(rows.map(s=>s.songId),['101','102']);return{ok:true};}});
  const c=ctx();c.task.selectionView={choices:[],message:'专辑'};
  const choice={action:'music.enqueue-collection',data:{kind:'album',id:'9',title:'这，就是爱'}};
  await music.choose(choice,c);assert.equal(writes,1);
  await assert.rejects(music.choose(choice,{...c,guard(){throw new Error('已取消');}}),/取消/);assert.equal(writes,1);
  const failed=Music.create({netease:async()=>({code:403,message:'无权读取'}),playQueue:async()=>writes++});
  await assert.rejects(failed.choose(choice,c),/无权/);assert.equal(writes,1);
});
test('歌手专辑使用路径中的ID，不再使用业务码400的错误端点',async()=>{
  const requests=[];
  const music=Music.create({netease:async(path,args,method)=>{
    requests.push({path,args,method});
    if(path==='/api/artist/albums/6472')return{code:200,hotAlbums:[{id:123,name:'张杰专辑',artist:{id:6472,name:'张杰'}}]};
    return{code:400};
  }});
  const result=await music.choose({action:'music.artist-albums',data:{kind:'artist',id:'6472',title:'张杰'}},ctx());
  assert.equal(requests.length,1);assert.equal(requests[0].path,'/api/artist/albums/6472');assert.equal(requests[0].method,'GET');
  assert.equal(result.choices.find(c=>c.kind==='album'&&!c.secondary).data.id,'123');
});
test('专辑查询回退搜索会排除同名但ID不匹配的歌手',async()=>{
  const music=Music.create({netease:async(path)=>path.includes('/search/')||path.includes('/cloudsearch/')?{code:200,result:{albums:[
    {id:1,name:'正确',artist:{id:6472,name:'张杰'}},{id:2,name:'同名',artist:{id:999,name:'张杰'}}
  ]}}:{code:400}});
  const result=await music.choose({action:'music.artist-albums',data:{kind:'artist',id:'6472',title:'张杰'}},ctx());
  assert.deepEqual(result.choices.filter(c=>c.kind==='album'&&!c.secondary).map(c=>c.data.id),['1']);
});
test('查看当前队列从持久化读取真实曲目，不重新搜索或播放',async()=>{
  const storage=store();await storage.set({musicPlaylistCache:{playlist:[{songId:'101',title:'逆战',artist:'张杰'}]}});
  const music=Music.create({storage,netease:()=>assert.fail(),playMusic:()=>assert.fail()});
  const result=await music.choose({action:'music.queue',data:{}},ctx());
  assert.match(result.message,/共1首/);assert.equal(result.choices.find(c=>c.kind==='song'&&!c.secondary).data.songId,'101');
});
test('单曲加号调用播放链路，已存在也不以去重结果跳过播放',async()=>{
  const f=fixture(),c=ctx();c.task.selectionView={choices:[]};
  const result=await f.music.choose({action:'music.enqueue',data:{songId:'101',title:'逆战',artist:'张杰'}},c);
  assert.deepEqual(f.actions,[['song','101']]);assert.equal(result.playback.mode,'append');assert.match(result.message,/开始播放/);
});
test('播放准备和失败时保留候选，返回明确状态并允许重新选择',async()=>{
  let rejectPlay, markPlayStarted;
  const playStarted = new Promise(resolve => { markPlayStarted = resolve; });
  const f=fixture();
  const engine=Engine.create({storage:f.storage,plan:async()=>({steps:[{tool:'music.intent',args:{text:'搜索张杰'}}]}),
    execute:async(step,c)=>f.music.search({kind:'auto',query:'张杰'},c),
    choose:()=>new Promise((resolve,reject)=>{rejectPlay=reject;markPlayStarted();})});
  await engine.submit({app:'music',text:'张杰'});let task=await engine.settled();
  const selected=task.choices.find(c=>c.action==='music.enqueue');const count=task.choices.length;
  await engine.choose(task.id,selected.id,task.version);
  task=await engine.snapshot();assert.equal(task.status,'running');assert.equal(task.choices.length,count);assert.equal(task.operation.status,'pending');
  await playStarted; rejectPlay(new Error('这首歌不可播放'));task=await engine.settled();
  assert.equal(task.status,'failed');assert.equal(task.operation.status,'failed');assert.equal(task.choices.length,count);assert.match(task.message,/不可播放/);
});
