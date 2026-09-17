const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
function fixture({blocked=false,homeReady=false}={}) {
  const id='a'.repeat(32), values={}, opened=[], injected=[], homeMessages=[];let listener, reached=0;
  const chrome={runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:f=>listener=f},sendMessage:async message=>{homeMessages.push(message);return message.action.endsWith('_status')?{home:homeReady,visible:false}:{ok:homeReady};}},
    storage:{local:{},session:{get:async()=>structuredClone(values),set:async p=>Object.assign(values,structuredClone(p))}},
    commands:{getAll:async()=>[]},
    tabs:{query:async()=>[],sendMessage:async(tab,m)=>m.action==='assistant_overlay_status'?{visible:false}:{ok:!blocked}},
    scripting:{executeScript:async o=>injected.push(o)},
    windows:{getLastFocused:async()=>({left:0,top:0,width:1200,height:800}),create:async o=>opened.push(o)}};
  const context={chrome,URL,URLSearchParams,setTimeout,clearTimeout,crypto:{randomUUID:()=> 'fresh-nonce'},AssistantTools:{create:()=>({})},AssistantEngine:{create:()=>({snapshot:async()=>{reached++;return null;}})},LocalAIBridge:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-background.js'),'utf8'),context);
  const app=context.QuickAssistant.install({});
  const call=(message,sender)=>new Promise(resolve=>listener(message,sender,resolve));
  return {id,values,opened,injected,homeMessages,chrome,app,call,reached:()=>reached};
}
test('普通网页使用顶层注入与绑定的扩展 iframe，不创建独立窗口',async()=>{
  const f=fixture();await f.app.open(true,{id:9,url:'https://example.test/article'});
  assert.equal(f.opened.length,0);assert.equal(f.injected.length,1);assert.equal(f.injected[0].target.tabId,9);
  assert.equal(f.values.quickAssistantOverlaysV1[9].origin,'https://example.test');
});
test('自有新标签页与 index.html 通过首页消息通道展示，不创建系统小窗',async()=>{
  for (const suffix of ['chrome://newtab/','index.html?from=dock']) {
    const f=fixture({homeReady:true}); const url=suffix.startsWith('chrome:')?suffix:`chrome-extension://${f.id}/${suffix}`;
    await f.app.open(true,{id:9,url});
    assert.equal(f.opened.length,0);assert.equal(f.injected.length,0);
    const show=f.homeMessages.find(m=>m.action==='assistant_home_overlay_show');
    assert.equal(show.targetTabId,9);assert.equal(show.toggle,true);assert.equal(f.values.quickAssistantOverlaysV1[9].home,true);
  }
});
test('缺少 sender.tab 的首页 iframe 按 documentId 恢复绑定，不能使用当前其他标签页',async()=>{
  const f=fixture({homeReady:true});f.values.quickAssistantOverlaysV1={9:{nonce:'good',origin:`chrome-extension://${f.id}`,home:true}};
  f.chrome.runtime.getContexts=async options=>{assert.deepEqual(Array.from(options.documentIds),['document-1']);return [{documentId:'document-1',tabId:9,frameId:2}];};
  f.chrome.tabs.get=async id=>({id,url:'chrome://newtab/'});
  const sender={id:f.id,url:`chrome-extension://${f.id}/assistant.html?embedded=1&nonce=good`,documentId:'document-1'};
  assert.equal((await f.call({action:'assistant_snapshot'},sender)).ok,true);
  assert.equal(f.values.quickAssistantOverlaysV1[9].frameId,2);
  f.chrome.tabs.get=async id=>({id,url:'https://other.test'});
  assert.equal((await f.call({action:'assistant_snapshot'},sender)).ok,false);
});
test('受限页面和无法加载的 iframe 使用紧凑小窗兜底',async()=>{
  for(const [url,blocked] of [['chrome://newtab/',false],['https://example.test',true]]) {
    const f=fixture({blocked});await f.app.open(false,{id:9,url});assert.equal(f.opened.length,1);assert.equal(f.opened[0].height,250);
    if(url.startsWith('chrome:'))assert.equal(f.injected.length,0);
    else assert.equal(f.values.quickAssistantOverlaysV1[9],undefined);
  }
});
test('其他首页保留消息通道但目标页未响应时，入口不会一直卡住',async()=>{
  const f=fixture();f.chrome.runtime.sendMessage=()=>new Promise(()=>{});
  await f.app.open(false,{id:9,url:'chrome://newtab/'});
  assert.equal(f.opened.length,1);
});
test('网页和未由快捷键唤出的公开 iframe 不能读取或操作助手',async()=>{
  const f=fixture();
  for(const sender of [
    {id:f.id,url:'https://example.test',frameId:0,tab:{id:9,url:'https://example.test'}},
    {id:f.id,url:`chrome-extension://${f.id}/assistant.html`,frameId:2,tab:{id:9,url:'https://example.test'}},
    {id:f.id,url:`chrome-extension://${f.id}/assistant.html?embedded=1&nonce=forged`,frameId:2,tab:{id:9,url:'https://example.test'}}
  ]) assert.equal((await f.call({action:'assistant_snapshot'},sender)).ok,false);
  assert.equal(f.reached(),0);
});
test('输入条令牌绑定标签页、来源与具体 frame，不能跨页面复用',async()=>{
  const f=fixture();f.values.quickAssistantOverlaysV1={9:{nonce:'good',origin:'https://example.test'}};
  const sender={id:f.id,url:`chrome-extension://${f.id}/assistant.html?embedded=1&nonce=good`,frameId:2,tab:{id:9,url:'https://example.test/article'}};
  assert.equal((await f.call({action:'assistant_snapshot'},sender)).ok,true);assert.equal(f.reached(),1);
  for(const bad of [{...sender,frameId:3},{...sender,frameId:0},{...sender,tab:{id:10,url:'https://example.test'}},{...sender,tab:{id:9,url:'https://other.test'}}])assert.equal((await f.call({action:'assistant_snapshot'},bad)).ok,false);
  assert.equal(f.reached(),1);
});
test('加载期间主动收起不触发兜底弹窗；真正加载超时才要求兜底',()=>{
  for(const dismiss of [true,false]) {
    const id='a'.repeat(32),events={};let listener,timer,response,focused=0;
    const document={activeElement:{isConnected:true,focus(){focused++;}},getElementById:()=>null,
      createElement:()=>({style:{},dataset:{},contentWindow:{},attachShadow:()=>({append(){}}),remove(){this.isConnected=false;},focus(){}}),
      documentElement:{append(el){el.isConnected=true;}},addEventListener:(name,fn)=>events[name]=fn};
    const context={document,window:{addEventListener(){}},URL,innerHeight:800,setTimeout:fn=>(timer=fn,1),clearTimeout(){},
      chrome:{runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,sendMessage:async()=>{},onMessage:{addListener:fn=>listener=fn}}}};
    vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-overlay.js'),'utf8'),context);
    listener({action:'assistant_overlay_show',nonce:'n',url:`chrome-extension://${id}/assistant.html?embedded=1&nonce=n`},{id},result=>response=result);
    if(dismiss)events.pointerdown({composedPath:()=>[]});else timer();
    assert.equal(response.ok,dismiss);assert.equal(focused,0);
  }
});
test('输入条就绪后宿主聚焦 iframe 并显式请求输入框获得光标',()=>{
  const id='a'.repeat(32),events={};let listener,response,frameFocused=0;
  const posted=[];
  const contentWindow={postMessage:(message,origin)=>posted.push({message,origin})};
  const frame={style:{},contentWindow,focus(){frameFocused++;}};
  const host={style:{},dataset:{},attachShadow:()=>({append(){}})};
  const document={activeElement:null,getElementById:()=>null,createElement:tag=>tag==='iframe'?frame:host,
    documentElement:{append(el){el.isConnected=true;}},addEventListener:(name,fn)=>events[name]=fn};
  const context={document,window:{addEventListener:(name,fn)=>events[name]=fn},URL,innerHeight:800,setTimeout:()=>1,clearTimeout(){},
    chrome:{runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,sendMessage:async()=>{},onMessage:{addListener:fn=>listener=fn}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-overlay.js'),'utf8'),context);
  listener({action:'assistant_overlay_show',nonce:'n',url:`chrome-extension://${id}/assistant.html?embedded=1&nonce=n`},{id},result=>response=result);
  events.message({source:contentWindow,origin:`chrome-extension://${id}`,data:{type:'assistant_ready',nonce:'n'}});
  assert.equal(response.ok,true);assert.equal(frameFocused,1);
  assert.equal(posted.length,1);assert.equal(posted[0].message.type,'assistant_focus');assert.equal(posted[0].message.nonce,'n');
  assert.equal(posted[0].origin,`chrome-extension://${id}`);
});
test('首页显式宿主标识兼容可见 chrome://newtab 地址，仍只响应目标标签页',async()=>{
  const id='a'.repeat(32);let listener;
  const context={URL,location:new URL('chrome://newtab/'),document:{currentScript:{dataset:{assistantHome:'true'}},getElementById:()=>null,addEventListener(){}},window:{addEventListener(){}},
    chrome:{tabs:{getCurrent:async()=>({id:9})},runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:fn=>listener=fn}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-overlay.js'),'utf8'),context);
  const status=await new Promise(resolve=>listener({action:'assistant_home_overlay_status',targetTabId:9},{id},resolve));
  assert.equal(status.home,true);assert.equal(status.visible,false);
  let wrong=false;listener({action:'assistant_home_overlay_status',targetTabId:10},{id},()=>{wrong=true;});await Promise.resolve();assert.equal(wrong,false);
});
