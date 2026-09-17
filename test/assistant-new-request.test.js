const test = require('node:test');
const assert = require('node:assert/strict');
const Contract = require('../js/assistant-contract.js');
const Engine = require('../js/assistant-engine.js');

const music = {scope:'music',status:'completed'};
const inherited = text => ({text,app:'music',skill:'music-search',inheritedScope:true});
test('明确独立需求自动新开，提醒和视频不会被旧音乐标签锁住', () => {
  for (const [text,app] of [['明天九点提醒我开会','alarm'],['查看我的提醒','alarm'],['搜索周杰伦','music'],['请帮我搜索周杰伦','music'],['B站搜索 MySQL 视频','bilibili'],['在 YouTube 搜索猫的视频','youtube']]) {
    const routed = Contract.routeRequest(inherited(text),music);
    assert.equal(routed.mode,'new',text); assert.equal(routed.input.app,app,text); assert.equal(routed.input.skill,null);
  }
});
test('序号、代词、修改、翻页和定时停止继续会话，不确定表达也保留上下文', () => {
  for (const text of ['播放第 2 个','换一个','他的专辑呢','再过半小时停止播放','改成随机播放','继续搜索下一页','播放热门歌曲','再看看','好听吗']) {
    const routed=Contract.routeRequest(inherited(text),music);
    assert.equal(routed.mode,'continue',text); assert.equal(routed.input.app,'music');
  }
  assert.equal(Contract.routeRequest({text:'上午九点'}, {scope:'alarm',status:'clarify'}).mode,'continue');
  assert.equal(Contract.routeRequest({text:'暂停'}, {scope:'alarm',status:'completed'}).input.app,'music');
});
test('搜索结果页的新裸关键词替换搜索，引用、序号和追问仍继续', () => {
  const results={scope:'music',status:'waiting',musicView:{kind:'search',title:'张杰'}};
  for (const text of ['地铁','张杰','Taylor Swift','我刚才输错了，重新搜张杰']) {
    const routed=Contract.routeRequest(inherited(text),results);
    assert.equal(routed.mode,'replace',text);assert.equal(routed.input.app,'music',text);
  }
  for (const text of ['他的专辑呢','第二个','再看看','好听吗']) assert.equal(Contract.routeRequest(inherited(text),results).mode,'continue',text);
  assert.equal(Contract.routeRequest(inherited('周杰伦'),{scope:'music',status:'clarify'}).mode,'continue');
});
test('强制新需求清除继承范围，显式应用和动作保留且仍经过合法性校验', () => {
  const fresh=Contract.routeRequest({...inherited('新的事情'),newConversation:true},music);
  assert.equal(fresh.mode,'new'); assert.equal(fresh.input.app,null); assert.equal(fresh.input.skill,null);
  const explicit=Contract.routeRequest({text:'@提醒 明天九点提醒我开会',app:'music',skill:'music-search',inheritedScope:true,newConversation:true},music);
  assert.equal(explicit.input.app,'alarm');
  assert.equal(Contract.routeRequest({text:'',app:'music',skill:'pause',newConversation:true},music).input.skill,'pause');
  assert.equal(Contract.routeRequest({text:'周杰伦',app:'music',skill:'music-artist'},music).mode,'new');
  assert.equal(Contract.routeRequest({text:'40分钟休息',app:'alarm',skill:'remind'},{scope:'alarm'}).mode,'new');
  assert.throws(()=>Contract.routeRequest({text:'test',newConversation:'true'},music),/标记/);
  assert.throws(()=>Contract.routeRequest({text:'test',app:'alarm',skill:'play',newConversation:true},music),/不适用/);
});
test('本次任务可选模型和思考强度，非法字段不进入任务', () => {
  const routed=Contract.routeRequest({text:'张杰',ai:{model:'qwen/qwen3.8-27b',reasoning:'medium'}},null);
  assert.deepEqual(routed.input.ai,{model:'qwen/qwen3.8-27b',reasoning:'medium'});
  assert.equal(Contract.routeRequest({text:'张杰',ai:null},null).input.ai,null);
  assert.throws(()=>Contract.routeRequest({text:'张杰',ai:{model:'http://evil.test'}},null),/模型/);
  assert.throws(()=>Contract.routeRequest({text:'张杰',ai:{reasoning:'ultra'}},null),/思考/);
  assert.throws(()=>Contract.routeRequest({text:'张杰',ai:{reasoning:'low',token:'secret'}},null),/AI 选择/);
});
function fixture(overrides={}) {
  const values={}, events=[], contexts=[]; let n=0;
  const storage={async get(){return structuredClone(values);},async set(v){Object.assign(values,structuredClone(v));},async remove(k){delete values[k];}};
  const engine=Engine.create({storage,id:()=>`task-${++n}`,history:async event=>events.push(event),
    plan:async(input,ctx)=>{contexts.push(structuredClone({input,memory:ctx.task.memory,turns:ctx.task.turns,observations:ctx.task.observations,remainingSteps:ctx.task.remainingSteps}));return {steps:[{tool:input.app==='alarm'?'alarm.prepare':'music.intent',args:{text:input.text}}]};},
    execute:async()=>({message:'完成',memory:{lastObject:'old-artist'}}),...overrides});
  return {engine,values,events,contexts};
}
test('自动新开使用独立会话与空上下文，旧会话留存事件不删除，也不提交停止播放动作', async () => {
  const f=fixture(); await f.engine.submit({app:'music',text:'张杰'});const old=await f.engine.settled();
  const userCount=f.events.filter(e=>e.role==='user').length;
  await f.engine.submit({...inherited('明天九点提醒我开会'),taskId:old.id,version:old.version});const next=await f.engine.settled();
  assert.notEqual(next.conversationId,old.conversationId);assert.equal(next.scope,'alarm');assert.equal(next.startMode,'new');
  assert.deepEqual(f.contexts[1].memory,{});assert.deepEqual(f.contexts[1].observations,[]);assert.deepEqual(f.contexts[1].remainingSteps,[]);
  assert.deepEqual(f.contexts[1].turns,[{role:'user',content:'明天九点提醒我开会'}]);
  assert.ok(f.events.some(e=>e.role==='status'&&e.conversationId===old.conversationId));
  assert.equal(f.events.filter(e=>e.role==='user').length,userCount+1);
});
test('含糊追问沿用同一会话，强制新需求才清除该上下文且不重复发送', async () => {
  const f=fixture();await f.engine.submit({app:'music',text:'张杰'});let old=await f.engine.settled();
  await f.engine.submit({...inherited('再看看'),taskId:old.id,version:old.version});let next=await f.engine.settled();
  assert.equal(next.conversationId,old.conversationId);assert.equal(f.contexts[1].memory.lastObject,'old-artist');
  await f.engine.submit({...inherited('再看看'),newConversation:true,taskId:next.id,version:next.version});const fresh=await f.engine.settled();
  assert.notEqual(fresh.conversationId,next.conversationId);assert.equal(f.contexts[2].input.app,null);assert.deepEqual(f.contexts[2].memory,{});
  assert.equal(f.events.filter(e=>e.role==='user').length,3);
});
test('后续请求可继承本轮模型，也可显式切回服务默认', async () => {
  const f=fixture();await f.engine.submit({app:'music',text:'张杰',ai:{model:'qwen/selected',reasoning:'high'}});let task=await f.engine.settled();
  await f.engine.submit({...inherited('再看看'),taskId:task.id,version:task.version});task=await f.engine.settled();
  assert.deepEqual(f.contexts[1].input.ai,{model:'qwen/selected',reasoning:'high'});
  await f.engine.submit({...inherited('再看看'),ai:null,taskId:task.id,version:task.version});await f.engine.settled();
  assert.equal(Object.hasOwn(f.contexts[2].input,'ai'),false);
});
test('张杰到地铁再回张杰会保留对话但清除旧搜索草稿、回执和候选', async () => {
  const f=fixture({execute:async step=>({status:'waiting',message:`${step.args.text}·搜索结果`,memory:{musicDraft:{action:'search',kind:'auto',query:step.args.text}},musicView:{kind:'search',title:step.args.text},choices:[{id:`choice-${step.args.text}`,title:step.args.text,action:'music.play',data:{}}]})});
  await f.engine.submit({app:'music',text:'张杰'});let task=await f.engine.settled();const conversationId=task.conversationId;
  await f.engine.submit({...inherited('地铁'),taskId:task.id,version:task.version});task=await f.engine.settled();
  assert.equal(task.startMode,'replace');assert.equal(task.conversationId,conversationId);assert.equal(task.musicView.title,'地铁');
  assert.deepEqual(f.contexts[1].memory,{});assert.deepEqual(f.contexts[1].observations,[]);assert.equal(f.contexts[1].turns.at(-1).content,'地铁');
  assert.ok(!task.choices.some(choice=>choice.id==='choice-张杰'));
  await f.engine.submit({...inherited('张杰'),taskId:task.id,version:task.version});task=await f.engine.settled();
  assert.equal(task.startMode,'replace');assert.equal(task.conversationId,conversationId);assert.equal(task.musicView.title,'张杰');
  assert.deepEqual(f.contexts[2].memory,{});assert.deepEqual(f.contexts[2].observations,[]);assert.ok(!task.choices.some(choice=>choice.id==='choice-地铁'));
});
test('强制新开不能引用旧候选，输入校验失败、旧版本提交都不清空已有会话', async () => {
  const f=fixture();await f.engine.submit({app:'music',text:'张杰'});const old=await f.engine.settled();
  for (const raw of [{text:'播放第 2 个',newConversation:true},{text:'',newConversation:true},{text:'新的需求',newConversation:true,taskId:'stale'}]) await assert.rejects(f.engine.submit(raw));
  assert.equal((await f.engine.snapshot()).conversationId,old.conversationId);
  assert.equal(f.events.filter(e=>e.role==='status').length,0);
});
test('执行中强制新开不打断或重复已提交的动作', async () => {
  let release, entered;const started=new Promise(resolve=>{entered=resolve;});
  const f=fixture({execute:async()=>{entered();await new Promise(resolve=>{release=resolve;});return {message:'已完成'};}});
  const running=await f.engine.submit({app:'music',text:'张杰'});await started;
  await assert.rejects(f.engine.submit({text:'新的需求',newConversation:true,taskId:running.id}),/正在执行/);
  assert.equal(f.events.filter(e=>e.role==='user').length,1);release();assert.equal((await f.engine.settled()).status,'completed');
});
test('纯动作快捷键仍有可读的用户消息和完成回执标题', async () => {
  const f=fixture();await f.engine.submit({text:'@音乐 /暂停',newConversation:true});const result=await f.engine.settled();
  assert.equal(result.input.text,'');assert.equal(result.conversationTitle,'暂停');assert.equal(result.messages[0].content,'暂停');
});
