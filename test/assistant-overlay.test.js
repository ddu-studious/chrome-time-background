const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
// 虚拟时钟：只在所有微任务/宏任务跑完、系统空闲后才跳到下一个定时器，使“等 4 秒”类逻辑瞬间可测，且 Date.now() 与定时器一致。
function virtualClock() {
  let now=0,seq=0;const timers=new Map(),idle=()=>new Promise(resolve=>setImmediate(resolve));
  return {
    now:()=>now,
    setTimeout(fn,ms=0){const id=++seq;timers.set(id,{at:now+Math.max(0,ms),fn});return id;},
    clearTimeout(id){timers.delete(id);},
    async drive(promise){
      let settled=false;promise.then(()=>{settled=true;},()=>{settled=true;});
      for(let guard=0;!settled;guard++){
        await idle();await idle();if(settled)break;
        const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
        if(!next||guard>10000)throw new Error('虚拟时钟无法推进：没有待触发的定时器但调用尚未结束');
        timers.delete(next[0]);now=Math.max(now,next[1].at);next[1].fn();
      }
      return promise;
    }
  };
}
function fixture({blocked=false,homeReady=false,clock,log}={}) {
  const id='a'.repeat(32), values={}, opened=[], injected=[], homeMessages=[];let listener, reached=0;
  const chrome={runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:f=>listener=f},sendMessage:async message=>{homeMessages.push(message);return message.action.endsWith('_status')?{home:homeReady,visible:false}:{ok:homeReady};}},
    storage:{local:{},session:{get:async()=>structuredClone(values),set:async p=>Object.assign(values,structuredClone(p))}},
    commands:{getAll:async()=>[]},
    tabs:{query:async()=>[],sendMessage:async(tab,m)=>m.action==='assistant_overlay_status'?{visible:false}:{ok:!blocked}},
    scripting:{executeScript:async o=>injected.push(o)},
    windows:{getLastFocused:async()=>({left:0,top:0,width:1200,height:800}),create:async o=>opened.push(o)}};
  const context={chrome,URL,URLSearchParams,setTimeout:clock?clock.setTimeout:setTimeout,clearTimeout:clock?clock.clearTimeout:clearTimeout,...(clock?{Date:{now:clock.now}}:{}),crypto:{randomUUID:()=> 'fresh-nonce'},AssistantTools:{create:()=>({})},AssistantEngine:{create:()=>({snapshot:async()=>{reached++;return null;}})},LocalAIBridge:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-background.js'),'utf8'),context);
  const app=context.QuickAssistant.install(log?{log}:{});
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
    const context={document,window:{addEventListener(){}},URL,innerHeight:800,setTimeout:(fn,ms)=>{if(ms===15000)timer=fn;return 1;},clearTimeout(){},
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

test('磨砂与点击范围仅覆盖真实主卡片和 Tips，布局数据仍绑定来源且受视口限制',()=>{
  const id='a'.repeat(32),events={},nodes=[];let listener;
  const contentWindow={postMessage(){}};
  const document={activeElement:null,getElementById:()=>null,
    createElement:tag=>{const el={style:{},dataset:{},clientWidth:1322,clientHeight:600,contentWindow,focus(){},attachShadow:()=>({append(){}})};nodes.push({tag,el});return el;},
    documentElement:{append(el){el.isConnected=true;}},addEventListener(){}};
  const context={document,window:{addEventListener:(name,fn)=>events[name]=fn},URL,innerHeight:800,setTimeout:()=>1,clearTimeout(){},
    chrome:{runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,sendMessage:async()=>{},onMessage:{addListener:fn=>listener=fn}}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/assistant-overlay.js'),'utf8'),context);
  listener({action:'assistant_overlay_show',nonce:'n',url:`chrome-extension://${id}/assistant.html?embedded=1&nonce=n`},{id},()=>{});
  const [host,main,todo,frame]=nodes.map(row=>row.el);
  const data={type:'assistant_resize',nonce:'n',height:600,expanded:true,todoDock:'open',surfaces:{main:{x:0,y:0,width:1060,height:600},todo:{x:1070,y:58,width:252,height:130}}};
  events.message({source:contentWindow,origin:`chrome-extension://${id}`,data});
  assert.doesNotMatch(host.style.cssText,/backdrop-filter/);assert.match(host.style.cssText,/pointer-events:none/);
  assert.equal(main.style.width,'1060px');assert.equal(todo.style.height,'130px');
  assert.match(frame.style.clipPath,/M 1070 58 H 1322 V 188/);
  const previous=frame.style.clipPath;
  events.message({source:{},origin:`chrome-extension://${id}`,data:{...data,surfaces:{}}});assert.equal(frame.style.clipPath,previous);
  events.message({source:contentWindow,origin:'https://hostile.test',data});assert.equal(frame.style.clipPath,previous);
  events.message({source:contentWindow,origin:`chrome-extension://${id}`,data:{...data,surfaces:{main:data.surfaces.main,todo:{x:-1,y:0,width:Infinity,height:50000}}}});
  assert.equal(todo.style.display,'none');assert.doesNotMatch(frame.style.clipPath,/Infinity|-1/);
});

// ---- 浮层不应因数据慢或页面慢而掉进独立小窗（图 1 → 图 2）----
const noReceiver=()=>Promise.reject(new Error('Could not establish connection. Receiving end does not exist.'));
function liveHome(f,live=true){
  f.chrome.runtime.getContexts=async options=>{
    assert.deepEqual(Array.from(options.tabIds),[9]);assert.deepEqual(Array.from(options.contextTypes),['TAB']);
    return live?[{contextType:'TAB',tabId:9,frameId:0,documentUrl:`chrome-extension://${f.id}/index.html`}]:[];
  };
}
const summarize=logs=>logs.map(([category,action,detail])=>[category,action,detail.ok,detail.context]);

// ---- 宿主等待 iframe 就绪：慢但仍在推进的加载不能被当成失败（2026-10-14 下午复发：真实日志 home-ready-timeout 4008ms）----
// 选项：origin 是页面源（沙箱文档为 'null'）；xml 表示 XML/SVG 文档（真实 Chromium 里 createElement('div') 得到的不是
// HTML 元素，没有 style / dataset）；getURLFailures 让开头几次 chrome.runtime.getURL 抛错，模拟初始化中途失败。
function hostHarness({origin,xml=false,getURLFailures=0}={}) {
  const id='a'.repeat(32),events={},frameEvents={},timers=new Map(),shadows=[];let listener,seq=0,response,listeners=0,iframes=0,failures=getURLFailures;
  const contentWindow={postMessage(){}};
  const frame={style:{},contentWindow,focus(){},addEventListener:(name,fn)=>{frameEvents[name]=fn;}};
  // 与真实 DOM 一致：每个宿主有自己的 Shadow 树，移除宿主元素会连带摘掉树里的全部内容（包括“正在载入”提示）。
  const create=tag=>tag==='iframe'?(iframes++,frame):xml?{tag}:{tag,style:{},dataset:{},isConnected:false,textContent:'',
    attachShadow(){const items=[];this.shadowItems=items;shadows.push(items);return {append:(...nodes)=>items.push(...nodes)};},
    remove(){this.isConnected=false;this.removed=true;for(const item of this.shadowItems||[])item.removed=true;},animate(){return {cancel(){}};},focus(){}};
  const document={activeElement:null,visibilityState:'visible',hasFocus:()=>true,getElementById:()=>null,createElement:create,
    documentElement:{append(el){el.isConnected=true;}},addEventListener:(name,fn)=>events[name]=fn};
  const context={document,window:{addEventListener:(name,fn)=>events[name]=fn},URL,innerHeight:800,...(origin?{origin}:{}),
    setTimeout:(fn,ms)=>{const timer=++seq;timers.set(timer,{fn,ms});return timer;},clearTimeout:timer=>timers.delete(timer),
    chrome:{runtime:{id,getURL:p=>{if(failures>0){failures--;throw new Error('boom');}return `chrome-extension://${id}/${p}`;},sendMessage:async()=>{},onMessage:{addListener:fn=>{listener=fn;listeners++;}}}}};
  const code=fs.readFileSync(require.resolve('../js/assistant-overlay.js'),'utf8'),sandbox=vm.createContext(context);
  // 与 chrome.scripting.executeScript 一致：脚本里抛出的异常不会传给注入方，只留在页面的隔离世界里。
  const inject=()=>{try{vm.runInContext(code,sandbox);return null;}catch(error){return error;}};
  const injectError=inject();
  if(!getURLFailures&&injectError)throw injectError;
  const pending=ms=>[...timers.values()].filter(timer=>timer.ms===ms);
  return {events,frameEvents,timers,pending,response:()=>response,inject,injectError,guard:()=>sandbox.__quickAssistantOverlay,listeners:()=>listeners,iframes:()=>iframes,
    status:()=>{let value;listener({action:'assistant_overlay_status'},{id},reply=>{value=reply;});return value;},
    show:()=>listener({action:'assistant_overlay_show',nonce:'n',url:`chrome-extension://${id}/assistant.html?embedded=1&nonce=n`},{id},result=>{response=result;}),
    fire:ms=>{const entry=[...timers.entries()].find(([,timer])=>timer.ms===ms);assert.ok(entry,`缺少 ${ms}ms 定时器`);timers.delete(entry[0]);entry[1].fn();},
    ready:()=>events.message({source:contentWindow,origin:`chrome-extension://${id}`,data:{type:'assistant_ready',nonce:'n'}}),
    // 只看最近一次打开的宿主：遗留在旧宿主 Shadow 树里的提示对用户不可见。
    skeleton:()=>(shadows.at(-1)||[]).find(item=>/载入/.test(item.textContent||''))};
}

test('宿主等 iframe 就绪的上限是 15 秒而不是 4 秒；快速就绪时看不到“正在载入”提示',()=>{
  const h=hostHarness();h.show();
  assert.equal(h.pending(4000).length,0,'旧的 4 秒上限必须消失');
  assert.equal(h.pending(15000).length,1);assert.equal(h.pending(400).length,1);
  assert.equal(h.skeleton(),undefined,'提示不能在 400ms 之前出现');
  h.ready();
  assert.equal(h.response().ok,true);assert.equal(h.response().ready,true,'成功回包要说明是“真就绪”，后台据此才记录慢打开');
  assert.equal(h.pending(15000).length,0);assert.equal(h.pending(400).length,0,'就绪后不再需要提示与超时');
  assert.equal(h.skeleton(),undefined);
});

test('加载超过 400ms 才显示不拦截点击的“正在载入”提示，就绪后立即移除',()=>{
  const h=hostHarness();h.show();h.fire(400);
  const note=h.skeleton();assert.ok(note,'400ms 后应有提示');
  assert.match(note.style.cssText,/pointer-events:none/);assert.notEqual(note.removed,true);
  h.ready();assert.equal(note.removed,true);
});

test('15 秒仍未就绪才失败：回包带 ready-timeout 与不含页面内容的诊断，并撤下提示',()=>{
  const h=hostHarness();h.show();h.fire(400);const note=h.skeleton();
  h.fire(15000);
  const reply=h.response();assert.equal(reply.ok,false);assert.equal(reply.reason,'ready-timeout');
  assert.match(reply.diag,/^wait=\d+;load=none;vis=visible;focus=1$/,'诊断只能是时长与状态位，不得带地址、nonce 或页面文字');
  assert.equal(note.removed,true);
});

test('iframe 已 load 却不就绪时诊断记录 load 的时间，用来区分“文件没读到”与“页面脚本卡住”',()=>{
  const h=hostHarness();h.show();h.frameEvents.load();h.fire(15000);
  assert.match(h.response().diag,/;load=\+\d+;/);
});

test('加载期间主动收起：回包不带 reason 与 ready，清掉全部定时器与提示（提示出现之前或之后收起都一样）',()=>{
  for(const noticeShown of [false,true]) {
    const h=hostHarness();h.show();if(noticeShown)h.fire(400);const note=h.skeleton();
    h.events.pointerdown({composedPath:()=>[]});
    assert.equal(JSON.stringify(h.response()),'{"ok":true}','不得带 reason、ready 或 diag');
    if(noticeShown)assert.equal(note.removed,true);
    assert.equal(h.timers.size,0,noticeShown?'提示出现后收起':'提示出现前收起：遗留的 400ms 定时器会在下一次打开时抢占提示');
  }
});

test('提示出现之前就收起、随后马上再次打开：新一轮的提示照常出现',()=>{
  const h=hostHarness();h.show();h.events.pointerdown({composedPath:()=>[]});
  h.show();h.fire(400);
  assert.ok(h.skeleton(),'第二次打开的加载提示不能被第一次遗留的状态吃掉');
});

test('首页稍慢才回应状态探测（超过 750ms）时仍用页内浮层，不改开小窗',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)}),shown=[];
  liveHome(f);
  f.chrome.runtime.sendMessage=message=>{
    if(message.action.endsWith('_status'))return new Promise(resolve=>clock.setTimeout(()=>resolve({home:true,visible:false}),Math.max(0,1200-clock.now())));
    shown.push(message);return Promise.resolve({ok:true});
  };
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,0);assert.equal(shown.length,1);assert.equal(shown[0].action,'assistant_home_overlay_show');
  assert.equal(logs.length,0);assert.ok(clock.now()<4000);
});

test('首页文档已存在但监听尚未注册时有界重试，注册后即可用页内浮层',async()=>{
  const clock=virtualClock(),f=fixture({clock});liveHome(f);
  f.chrome.runtime.sendMessage=message=>{
    if(message.action.endsWith('_status'))return clock.now()<300?noReceiver():Promise.resolve({home:true,visible:false});
    return Promise.resolve({ok:true});
  };
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,0);assert.ok(clock.now()>=300&&clock.now()<1000);
});

test('没有本扩展首页文档（别家新标签页或已失效页面）时立即兜底，不空等，并记录原因',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f,false);
  f.chrome.runtime.sendMessage=noReceiver;
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,1);assert.equal(clock.now(),0);
  assert.deepEqual(summarize(logs),[['system','assistant-popup',false,'home-no-document']]);
  assert.ok(Number.isFinite(logs[0][2].durationMs));
});

test('确有首页文档却始终不回应时，最多等待约 10 秒后兜底并记录“首页无回应”',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
  f.chrome.runtime.sendMessage=()=>new Promise(()=>{});
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,1);assert.ok(clock.now()>=10000&&clock.now()<10400,`实际等待 ${clock.now()}ms`);
  assert.deepEqual(summarize(logs),[['system','assistant-popup',false,'home-no-reply']]);
});

test('系统负载高、首页 8 秒后才回应状态探测时仍用页内浮层，并记录一次“慢打开”',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
  f.chrome.runtime.sendMessage=message=>{
    if(message.action.endsWith('_status'))return clock.now()<8000?noReceiver():Promise.resolve({home:true,visible:false});
    return Promise.resolve({ok:true,ready:true});
  };
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,0);assert.ok(clock.now()>=8000&&clock.now()<8600,`实际等待 ${clock.now()}ms`);
  assert.deepEqual(summarize(logs),[['system','assistant-slow-open',true,'home']]);
});

test('宿主 14 秒后才就绪也算成功（后台等展示回包最长约 20 秒，必须长于宿主的 15 秒上限），不开小窗',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
  f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false})
    :new Promise(resolve=>clock.setTimeout(()=>resolve({ok:true,ready:true}),14000));
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,0);
  assert.deepEqual(summarize(logs),[['system','assistant-slow-open',true,'home']]);
  assert.ok(logs[0][2].durationMs>=14000&&logs[0][2].durationMs<14500);
});

test('展示请求 20 秒仍无回包才记为“展示无回应”并兜底',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
  f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false}):new Promise(()=>{});
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,1);assert.ok(clock.now()>=20000&&clock.now()<20400,`实际等待 ${clock.now()}ms`);
  assert.deepEqual(summarize(logs),[['system','assistant-popup',false,'home-show-no-reply']]);
});

test('回退小窗的日志带宿主诊断（error 字段）；只收固定格式，其余整条丢弃，不能把地址或 nonce 写进日志',async()=>{
  const good1='wait=15003;load=none;vis=visible;focus=1',good2='wait=15003;load=+4210;vis=hidden;focus=0';
  const cases=[
    ['chrome://newtab/','home-ready-timeout',good1,good1],
    ['https://example.test/a','page-ready-timeout',good2,good2],
    ['chrome://newtab/','home-ready-timeout','wait=1;chrome-extension://x/y?nonce=secret',''],
    ['chrome://newtab/','home-ready-timeout',`${good1};extra=1`,''],
    ['chrome://newtab/','home-ready-timeout',{wait:1},''],
    ['chrome://newtab/','home-ready-timeout','a'.repeat(500),''],
    ['chrome://newtab/','home-ready-timeout',undefined,'']
  ];
  for(const [url,context,diag,expected] of cases) {
    const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
    const reply={ok:false,reason:'ready-timeout',diag};
    f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false}):Promise.resolve(reply);
    f.chrome.tabs.sendMessage=async(tab,message)=>message.action==='assistant_overlay_status'?{visible:false}:reply;
    await clock.drive(f.app.open(false,{id:9,url}));
    assert.equal(logs[0][2].context,context);assert.equal(logs[0][2].error||'',expected,`${url} ${JSON.stringify(diag)}`);
  }
});

test('页内浮层（普通网页）慢于 1.5 秒才就绪同样记录“慢打开”；快速打开与用户主动收起都不记录',async()=>{
  const slow=virtualClock(),slowLogs=[],page=fixture({clock:slow,log:(...args)=>slowLogs.push(args)});
  page.chrome.tabs.sendMessage=(tab,message)=>message.action==='assistant_overlay_status'?Promise.resolve({visible:false})
    :new Promise(resolve=>slow.setTimeout(()=>resolve({ok:true,ready:true}),2000));
  await slow.drive(page.app.open(false,{id:9,url:'https://example.test/a'}));
  assert.deepEqual(summarize(slowLogs),[['system','assistant-slow-open',true,'page']]);
  for(const [delay,reply] of [[0,{ok:true,ready:true}],[1000,{ok:true,ready:true}],[3000,{ok:true}]]) {
    const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
    f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false})
      :new Promise(resolve=>clock.setTimeout(()=>resolve(reply),delay));
    await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
    assert.equal(f.opened.length,0);assert.equal(logs.length,0,`延迟 ${delay}ms 的 ${JSON.stringify(reply)} 不应记录慢打开`);
  }
});

test('慢打开日志写入失败或抛错不能影响已成功的浮层',async()=>{
  const clock=virtualClock(),f=fixture({clock,log:()=>{throw new Error('disk full');}});liveHome(f);
  f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false})
    :new Promise(resolve=>clock.setTimeout(()=>resolve({ok:true,ready:true}),3000));
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,0);
});

test('旧版本没有 getContexts 或调用失败时按原 750ms 窗口兜底，不抛错',async()=>{
  const clock=virtualClock(),f=fixture({clock});
  f.chrome.runtime.sendMessage=()=>new Promise(()=>{});
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,1);assert.equal(clock.now(),750);
  const g=fixture({clock:virtualClock()});g.chrome.runtime.getContexts=async()=>{throw new Error('unsupported');};g.chrome.runtime.sendMessage=noReceiver;
  await g.app.open(false,{id:9,url:'chrome://newtab/'});assert.equal(g.opened.length,1);
});

test('浮层已展示却迟迟未就绪时按真实原因记录并兜底；受限页面的预期兜底不算失败',async()=>{
  const cases=[
    ['chrome://newtab/',{ok:false,reason:'ready-timeout'},'home-ready-timeout',false],
    ['chrome://newtab/',null,'home-show-no-reply',false],
    ['chrome://newtab/',{ok:false},'home-show-refused',false],
    ['https://example.test/a',{ok:false,reason:'ready-timeout'},'page-ready-timeout',false],
    ['https://example.test/a',{ok:false},'page-show-refused',false]
  ];
  for(const [url,reply,context,ok] of cases) {
    const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
    f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false}):reply===null?new Promise(()=>{}):Promise.resolve(reply);
    f.chrome.tabs.sendMessage=async(tab,message)=>message.action==='assistant_overlay_status'?{visible:false}:reply;
    await clock.drive(f.app.open(false,{id:9,url}));
    assert.equal(f.opened.length,1,url+JSON.stringify(reply));assert.deepEqual(summarize(logs),[['system','assistant-popup',ok,context]]);
    assert.equal(f.values.quickAssistantOverlaysV1[9],undefined,'失败后必须清除绑定');
  }
  const logs=[];
  const restricted=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
  await restricted.app.open(false,{id:9,url:'chrome://extensions/'});
  const blocked=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
  blocked.chrome.scripting.executeScript=async()=>{throw new Error('Cannot access a chrome:// URL');};
  await blocked.app.open(false,{id:9,url:'https://chromewebstore.google.com/'});
  assert.deepEqual(summarize(logs),[['system','assistant-popup',true,'unsupported-page'],['system','assistant-popup',true,'page-overlay-unavailable']]);
  assert.equal(restricted.opened.length,1);assert.equal(blocked.opened.length,1);
});

test('日志写入失败或抛错不能阻止小窗兜底',async()=>{
  const f=fixture({clock:virtualClock(),log:()=>{throw new Error('disk full');}});
  await f.app.open(false,{id:9,url:'chrome://extensions/'});assert.equal(f.opened.length,1);
});

test('首页宿主脚本排在所有样式表与同步脚本之前，样式表或脚本迟到也不影响状态探测',()=>{
  const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
  assert.match(scripts[0],/^js\/assistant-overlay\.js\?v=\d+$/);
  assert.equal(scripts.filter(src=>src.startsWith('js/assistant-overlay.js')).length,1);
  assert.ok(html.indexOf('js/assistant-overlay.js')<html.indexOf('rel="stylesheet"'),'宿主脚本必须早于第一个样式表，否则会被样式表加载阻塞');
  assert.match(html,/<script src="js\/assistant-overlay\.js\?v=\d+" data-assistant-home="true"><\/script>/);
});

// ---- 页内浮层的页面适用性与失败原因（2026-10-14 傍晚：用户再次看到小窗，日志为 page-overlay-unavailable 8ms）----
// 在真实 Chromium 151 逐类页面实测：XML/SVG 文档里宿主自己抛异常；CSP sandbox 页面要白等 15 秒；错误页在注入阶段 1ms 被拒。
test('XML/SVG 文档里宿主给出明确原因并立即拒绝：不抛异常、不留下状态、不创建 iframe 与定时器',()=>{
  const h=hostHarness({xml:true});
  assert.doesNotThrow(()=>h.show(),'真实 Chromium：旧代码在这里抛 Cannot set properties of undefined (setting \'extension\')');
  assert.deepEqual({...h.response()},{ok:false,reason:'unsupported-document'});
  assert.equal(h.iframes(),0);assert.equal(h.timers.size,0,'拒绝后不能遗留 15 秒就绪定时器');
  assert.deepEqual({...h.status()},{visible:false,nonce:undefined,home:false},'拒绝前不能写入令牌');
});

test('沙箱文档（页面源为 null）立即拒绝并说明原因，不让用户白等 15 秒；普通页面不受影响',()=>{
  const h=hostHarness({origin:'null'});h.show();
  assert.deepEqual({...h.response()},{ok:false,reason:'opaque-origin'});
  assert.equal(h.iframes(),0);assert.equal(h.pending(15000).length,0);
  const normal=hostHarness({origin:'https://example.test'});normal.show();
  assert.equal(normal.response(),undefined,'普通页面照常等待就绪');assert.equal(normal.pending(15000).length,1);
});

test('初始化中途失败不能留下全局标记：下一次注入会重新注册监听，而不是这一页永久没有接收端',()=>{
  const h=hostHarness({getURLFailures:1});
  assert.ok(h.injectError,'第一次注入应在初始化中抛错');
  assert.equal(h.listeners(),0,'失败的初始化不能遗留监听器');
  assert.notEqual(h.guard(),true,'失败的初始化不能留下“已注入”标记');
  assert.equal(h.inject(),null);assert.equal(h.listeners(),1);assert.equal(h.guard(),true);
  h.show();assert.equal(h.pending(15000).length,1,'重新注入后可以正常展示');
  assert.equal(h.inject(),null);assert.equal(h.listeners(),1,'已成功注册后重复注入不再叠加监听');
});

test('真就绪的回包带诊断（时长与状态位），后台据此记录慢打开的组成',()=>{
  const h=hostHarness();h.show();h.frameEvents.load();h.ready();
  assert.equal(h.response().ready,true);
  assert.match(h.response().diag,/^wait=\d+;load=\+\d+;vis=visible;focus=1$/);
});

test('页内浮层注入失败只记录固定类别，不记录报错原文；页面本身不允许的算预期，我们自己出错的算失败',async()=>{
  const secret='https://intranet.example/path?token=SECRET123';
  const cases=[
    ['inject',`Cannot access contents of url "${secret}". Extension manifest must request permission to access this host.`,'inject:no-access',true],
    ['inject','Cannot access a chrome:// URL','inject:no-access',true],
    ['inject','Frame with ID 0 is showing error page','inject:error-page',true],
    ['inject','The extensions gallery cannot be scripted.','inject:webstore',true],
    ['inject','This page cannot be scripted due to an ExtensionsSettings policy.','inject:policy',true],
    ['inject','No frame with id 0 in tab with id 9.','inject:frame-gone',true],
    ['inject',`Something odd at ${secret}`,'inject:other',false],
    ['show','Could not establish connection. Receiving end does not exist.','show:no-receiver',false],
    ['show','The message port closed before a response was received.','show:port-closed',false],
    ['show',"Uncaught TypeError: Cannot set properties of undefined (setting 'extension')",'show:host-error',false]
  ];
  for(const [stage,message,expected,ok] of cases){
    const logs=[],f=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
    if(stage==='inject')f.chrome.scripting.executeScript=async()=>{throw new Error(message);};
    else f.chrome.tabs.sendMessage=async(tab,m)=>{if(m.action==='assistant_overlay_status')return {visible:false};throw new Error(message);};
    await f.app.open(false,{id:9,url:'https://intranet.example/path',status:'complete'});
    assert.equal(logs.length,1,message);assert.equal(f.opened.length,1,'无论什么原因都必须有界面可用');
    const detail=logs[0][2];
    assert.equal(detail.context,'page-overlay-unavailable');assert.equal(detail.ok,ok,message);
    assert.equal(detail.error,`${expected};tab=complete;disc=0;win=unknown`,message);
    assert.doesNotMatch(JSON.stringify(logs),/SECRET123|intranet|token/,'日志里不能出现报错原文、网址或令牌');
    assert.equal(f.values.quickAssistantOverlaysV1[9],undefined,'失败后必须清除绑定');
  }
});

test('失败记录带标签页与窗口状态（加载中、被丢弃、应用窗口）；窗口查询失败或卡住不能拖住兜底，也不能写入白名单之外的值',async()=>{
  const denied='Cannot access contents of url "https://x.test/". Extension manifest must request permission to access this host.';
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});
  f.chrome.scripting.executeScript=async()=>{throw new Error(denied);};
  f.chrome.windows.get=async id=>{assert.equal(id,77);return {type:'app'};};
  await clock.drive(f.app.open(false,{id:9,url:'https://x.test/',status:'loading',discarded:true,windowId:77}));
  assert.equal(logs[0][2].error,'inject:no-access;tab=loading;disc=1;win=app');
  const hang=virtualClock(),hangLogs=[],g=fixture({clock:hang,log:(...args)=>hangLogs.push(args)});
  g.chrome.scripting.executeScript=async()=>{throw new Error('Frame with ID 0 is showing error page');};
  g.chrome.windows.get=()=>new Promise(()=>{});
  await hang.drive(g.app.open(false,{id:9,url:'https://x.test/',status:'complete',windowId:77}));
  assert.equal(g.opened.length,1);assert.match(hangLogs[0][2].error,/;win=unknown$/);assert.ok(hang.now()<=1500,`窗口查询最多等约 1 秒，实际 ${hang.now()}ms`);
  const odd=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
  odd.chrome.scripting.executeScript=async()=>{throw new Error(denied);};
  odd.chrome.windows.get=async()=>({type:'<script>alert(1)</script>'});
  await odd.app.open(false,{id:9,url:'https://x.test/',status:'<b>weird</b>',windowId:1});
  assert.equal(logs.at(-1)[2].error,'inject:no-access;tab=unknown;disc=0;win=unknown');
});

test('宿主明确拒绝（XML/SVG 文档、沙箱页面）时直接改开小窗并记录原因，属于预期兜底',async()=>{
  for(const [reason,context] of [['unsupported-document','page-unsupported-document'],['opaque-origin','page-opaque-origin']]) {
    const logs=[],f=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
    f.chrome.tabs.sendMessage=async(tab,m)=>m.action==='assistant_overlay_status'?{visible:false}:{ok:false,reason};
    await f.app.open(false,{id:9,url:'https://x.test/'});
    assert.equal(f.opened.length,1);assert.deepEqual(summarize(logs),[['system','assistant-popup',true,context]]);
    assert.equal(f.values.quickAssistantOverlaysV1[9],undefined,'失败后必须清除绑定');
  }
});

test('首页展示请求被拒绝（而不是无回应）时同样兜底成小窗并记录，不能让入口什么界面都没有',async()=>{
  const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});liveHome(f);
  f.chrome.runtime.sendMessage=message=>message.action.endsWith('_status')?Promise.resolve({home:true,visible:false}):Promise.reject(new Error('Extension context invalidated.'));
  await clock.drive(f.app.open(false,{id:9,url:'chrome://newtab/'}));
  assert.equal(f.opened.length,1);assert.deepEqual(summarize(logs),[['system','assistant-popup',false,'home-show-no-reply']]);
  assert.equal(f.values.quickAssistantOverlaysV1[9],undefined,'失败后必须清除绑定');
});

test('尝试页内浮层时出现意料之外的异常（如会话存储拒绝写入）仍然开小窗，并记录为失败且不含原文',async()=>{
  const logs=[],f=fixture({clock:virtualClock(),log:(...args)=>logs.push(args)});
  f.chrome.storage.session.set=async()=>{throw new Error('QUOTA_BYTES quota exceeded for https://x.test/?k=SECRET');};
  await f.app.open(false,{id:9,url:'https://x.test/'});
  assert.equal(f.opened.length,1);assert.equal(logs.length,1);
  assert.equal(logs[0][2].context,'overlay-error');assert.equal(logs[0][2].ok,false);
  assert.equal(logs[0][2].error,'open:other;tab=unknown;disc=0;win=unknown');
  assert.doesNotMatch(JSON.stringify(logs),/SECRET|x\.test/);
});

test('慢打开日志带宿主就绪时的诊断（只收固定格式），能区分“iframe 加载慢”和“页面脚本慢”',async()=>{
  const good='wait=11200;load=+10900;vis=visible;focus=1';
  for(const [diag,expected] of [[good,good],['wait=1;nonce=secret',''],[undefined,''],[{wait:1},'']]) {
    const clock=virtualClock(),logs=[],f=fixture({clock,log:(...args)=>logs.push(args)});
    f.chrome.tabs.sendMessage=(tab,message)=>message.action==='assistant_overlay_status'?Promise.resolve({visible:false})
      :new Promise(resolve=>clock.setTimeout(()=>resolve({ok:true,ready:true,diag}),3000));
    await clock.drive(f.app.open(false,{id:9,url:'https://example.test/a'}));
    assert.equal(logs[0][1],'assistant-slow-open');assert.equal(logs[0][2].error||'',expected,JSON.stringify(diag));
  }
});
