const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const MusicSearch=require('../js/music-search.js'),MusicIntent=require('../js/music-intent.js');
function controller(){const scope={window:{},MusicSearch,console,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(require.resolve('../js/music-controller.js'),'utf8'),scope);return scope.window.musicController;}
test('模糊对象不硬判歌名；歌手、指定歌曲和歌单分别处理',()=>{
 assert.equal(MusicIntent.parseLocal('播放林俊杰').kind,'auto');assert.equal(MusicIntent.parseLocal('听林俊杰的歌').kind,'artist');
 assert.equal(MusicIntent.parseLocal('歌手林俊杰').kind,'artist');assert.equal(MusicIntent.parseLocal('播放歌曲江南').kind,'song');
 assert.equal(MusicIntent.parseLocal('搜索歌单民谣').kind,'playlist');assert.equal(MusicIntent.parseLocal('放点适合专注的音乐'),null);
});
test('排序去重并保留版本差异，指定歌手优先',()=>{
 const rows=[{id:1,name:'江南 (Live)',ar:[{name:'林俊杰'}]},{id:2,name:'江南',ar:[{name:'其他人'}]},{id:3,name:'江南',ar:[{name:'林俊杰'}]},{id:3,name:'重复'},{id:'bad',name:'伪造'}];
 assert.deepEqual(MusicSearch.songs(rows,{title:'江南',artist:'林俊杰'}).map(x=>x.id),[3,1,2]);
 assert.equal(MusicSearch.exact('  HELLO ','hello'),true);assert.equal(MusicSearch.exact('江南(Live)','江南'),false);
});
test('提交后不再安排联想，迟到联想不能重新盖住结果',async()=>{
 const c=controller(),input={value:'林俊杰'},results={innerHTML:''};let finish,shown=0,scheduled=0;
 c._el={querySelector:k=>k==='#mc-search-input'?input:k==='#mc-search-results'?results:null};
 c._neteaseApi=()=>new Promise(r=>finish=r);c._renderSuggest=()=>shown++;c._onSearchInputChange=()=>scheduled++;c._saveSearchHistory=()=>{};c._searchType=1;c._searchSongs=async()=>{};
 const pending=c._fetchSuggest('林俊杰');await c._performSearch('林俊杰');finish({ok:true,data:{result:{artists:[{id:1,name:'林俊杰'}]}}});await pending;
 assert.equal(shown,0);assert.equal(scheduled,0);
});
test('歌手搜索首个端点失败后走后备端点',async()=>{
 const c=controller(),calls=[];c._neteaseApi=async path=>{calls.push(path);return calls.length===1?{ok:false}:{ok:true,data:{result:{artists:[{id:1,name:'林俊杰'}]}}};};
 assert.equal((await c._searchArtistCandidates('林俊杰')).data.result.artists[0].name,'林俊杰');assert.equal(calls.length,2);
});
test('显式歌曲或歌单不被名称中的的字误分成歌手',()=>{
 assert.equal(MusicIntent.parseLocal('播放《我的歌》').kind,'song');
 assert.equal(MusicIntent.parseLocal('搜索歌单林俊杰的歌').kind,'playlist');
});
test('综合搜索中用户切走后的旧响应不渲染',async()=>{
 const c=controller();let finish;
 c._searchVer=1;c._searchSongCandidates=async()=>({ok:true,data:{result:{songs:[{id:2,name:'江南'}]}}});
 c._searchArtistCandidates=async()=>({ok:true,data:{result:{artists:[{id:1,name:'林俊杰'}]}}});c._searchPlaylistCandidates=()=>new Promise(r=>finish=r);
 const results={replaceChildren(){throw new Error('旧请求不能渲染');}};
 const run=c._searchSmart('林俊杰',results,1);c._searchVer=2;finish({ok:true,data:{result:{playlists:[]}}});await run;
});
