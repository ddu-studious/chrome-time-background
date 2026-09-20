import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createMemoryStore } from '../local-ai/memory-store.mjs';
import { createHistoryStore } from '../local-ai/history-store.mjs';
import { createServer } from '../local-ai/server.mjs';
import { experienceFromReceipt, serializeRecall, MEMORY_SDK } from '../local-ai/assistant-experience.mjs';
import { plan as modelPlan, validateInput } from '../local-ai/assistant-service.mjs';
import Memory from '../js/assistant-memory.js';
import Tools from '../js/assistant-tools.js';
import Engine from '../js/assistant-engine.js';
import Contract from '../js/assistant-contract.js';
const at = Date.now() - 10000;
const receipt = (patch = {}) => ({ id: 'turn:search:1', turnId: 'turn', conversationId: 'chat', sourceStartedAt: at - 100,
  startedAt: at, endedAt: at + 1, kind: 'tool', tool: 'music.search', status: 'waiting', contentSaved: true,
  input: { kind: 'artist', query: '林俊杰' }, output: { status: 'waiting', message: '找到歌手，请选择', musicView: { kind: 'search', title: '林俊杰' } }, ...patch });
const write = (store, body) => store.mutate({ ...body, expectedRevision: store.snapshot().revision });
const settings = { captureContent: true, retentionDays: 7 };
function store(t, options) { const s = createMemoryStore(options); t.after(() => s.close()); return s; }

test('真实搜索和自动播放形成经历，计划、服务请求、失败、取消、unknown和确认卡不形成成功事实', () => {
  assert.equal(experienceFromReceipt(receipt()).action, 'searched');
  const played = receipt({ tool: 'music.intent', status: 'succeeded', output: { playback: { artist: '法老' }, musicView: { kind: 'artist', title: '法老', id: '865007' }, message: '已播放' } });
  assert.deepEqual(experienceFromReceipt(played).entity, { platform: 'netease', kind: 'artist', id: '865007', name: '法老' });
  assert.equal(experienceFromReceipt(played).action, 'played');
  for (const patch of [{ kind: 'plan' }, { kind: 'request' }, { contentSaved: false }, ...['failed','cancelled','interrupted','unknown'].map(status => ({status})), { output: { status: 'review' } }, { output: { ok: false } }]) assert.equal(experienceFromReceipt(receipt(patch)), null);
  assert.equal(experienceFromReceipt(receipt({ tool: 'alarm.update.prepare', output: { status: 'review' } })), null);
  assert.equal(experienceFromReceipt(receipt({ tool: 'video.search', input: { platform: 'youtube', query: 'MySQL' }, output: { status: 'waiting', message: '账号未连接' } })), null);
  assert.equal(experienceFromReceipt(receipt({ tool: 'video.open', status: 'succeeded', input: { platform: 'youtube' }, output: { message: '已打开', observation: { opened: true, playbackConfirmed: false } } })).action, 'opened');
  assert.equal(experienceFromReceipt(receipt({ tool: 'music.queue.apply', status: 'succeeded', input: { startPlayback: false }, output: { message: '已追加', observation: { isPlaying: true } } })).action, 'applied');
});

test('旧版数据库原位迁移、跨重启、幂等补充、独立开关与正文留存门槛', t => {
  const dir = mkdtempSync(join(tmpdir(), 'experience-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'memory.db'); const db = new DatabaseSync(file);
  db.exec('CREATE TABLE memory_meta (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL, enabled INTEGER NOT NULL, remember_artists INTEGER NOT NULL, cleared_at INTEGER NOT NULL); INSERT INTO memory_meta VALUES (1,2,1,1,0)'); db.close();
  let s = createMemoryStore({file});
  assert.equal(s.captureHistory([receipt()]).added, 0);
  assert.equal(s.captureHistory([receipt()], settings).added, 1);
  assert.equal(s.captureHistory([receipt()], settings).added, 0); s.close();
  s = createMemoryStore({file}); t.after(() => s.close());
  assert.equal(s.snapshot().experiences.length, 1); assert.equal(s.snapshot().artists.length, 0);
  write(s, { operation: 'configure', enabled: true, rememberArtists: true, rememberExperiences: false });
  assert.equal(s.captureHistory([receipt({id:'other'})], settings).added, 0);
  write(s, { operation: 'configure', enabled: true, rememberArtists: false });
  assert.equal(s.snapshot().rememberExperiences, false);
});

test('删除单条、来源会话、清空及迟到回执不会因补充历史复活，经历按期限清理', t => {
  let now = at + 1000; const s = store(t, { now: () => now });
  s.captureHistory([receipt()], settings); const key = s.snapshot().experiences[0].key;
  write(s, { operation: 'delete', kind: 'experience', key });
  assert.equal(s.captureHistory([receipt()], settings).added, 0);
  s.captureHistory([receipt({id:'second'})], settings); s.forgetSource('chat');
  assert.equal(s.captureHistory([receipt({id:'third'})], settings).added, 0);
  s.captureHistory([receipt({id:'new',conversationId:'other'})], settings);
  write(s, { operation: 'clear', confirm: true }); now += 100;
  assert.equal(s.captureHistory([receipt({id:'late',conversationId:'other',startedAt:now-1,endedAt:now})], settings).added, 0);
  s.captureHistory([receipt({id:'fresh',conversationId:'fresh',sourceStartedAt:now-1,startedAt:now-1,endedAt:now})], settings);
  assert.equal(s.snapshot().experiences.length, 1); now += 8*86400000;
  assert.equal(s.snapshot().experiences.length, 0);
});

test('通用偏好只能来自明确记住的原文，有来源删除、去重和范围；现有音乐枚举兼容', t => {
  const s = store(t); const source = '记住：我喜欢爵士乐';
  assert.deepEqual(Memory.command(source), {operation:'note',value:'我喜欢爵士乐'});
  assert.equal(Memory.command('搜索爵士乐'), null); assert.equal(Memory.command('今天我喜欢爵士乐'), null);
  const body = {...Memory.command(source),app:'music',source,sourceId:'note-chat',sourceStartedAt:at};
  write(s,body);write(s,body);assert.equal(s.snapshot().notes.length,1);
  assert.throws(()=>write(s,{...body,value:'模型捏造的偏好'}),/原文/);
  assert.equal(Memory.command('记住：热门歌曲替换队列').key,'artistQueueMode');
  assert.equal(Contract.localPlan({app:'music',text:source}).steps[0].tool,'memory.manage');
  assert.equal(Contract.localPlan({app:'alarm',text:'记住：提醒名称请写清楚事项'}).steps[0].tool,'memory.manage');
  s.forgetSource('note-chat');assert.equal(s.snapshot().notes.length,0);
});

test('跨会话召回支持中文人名、最近、昨天和应用范围，不回传可执行引用', t => {
  const s = store(t);
  s.captureHistory([receipt(), receipt({ id:'video',tool:'video.search',input:{platform:'youtube',query:'MySQL'},output:{message:'找到视频',observation:{items:[]}} })],settings);
  for(const text of ['上次搜索了谁','上次搜索的那个人是谁','继续播放上次找到的歌手','我最近搜索过哪些歌手','查看我的经历']) assert.ok(Memory.recall(s.snapshot(),text,{app:'music'}).some(r=>r.query==='林俊杰'),text);
  assert.equal(Memory.recall(s.snapshot(),'上次搜索了谁',{app:'youtube'})[0].query,'MySQL');
  assert.equal(Memory.recall(s.snapshot(),'搜索法老',{app:'music'}).length,0);
  assert.equal(Memory.recall({...s.snapshot(),enabled:false},'上次搜索了谁').length,0);
  const tomorrow = new Date(at);tomorrow.setDate(tomorrow.getDate()+1);
  assert.equal(Memory.recall(s.snapshot(),'昨天搜索了谁',{app:'music',now:tomorrow.getTime()})[0].query,'林俊杰');
  assert.equal(Contract.localPlan({app:'music',text:'上次搜索了谁'}).steps[0].tool,'memory.recall');
  assert.equal(Contract.localPlan({app:'music',text:'继续播放上次找到的歌手'}),null);
});

test('真实 pi SDK 序列化召回，白名单剔除引用/凭证；召回计入规划预算且当前要求优先', async t => {
  const s = store(t);s.captureHistory([receipt()],settings);
  const recalledMemory = Memory.recall(s.snapshot(),'继续播放上次找到的歌手',{app:'music'});
  recalledMemory[0].ref='r999'; recalledMemory[0].token='secret-test';
  const serialized=serializeRecall(recalledMemory);
  assert.match(MEMORY_SDK,/0\.85\.1/);assert.match(serialized,/\[User\]:/);assert.match(serialized,/林俊杰/);assert.doesNotMatch(serialized,/r999|secret-test/);
  assert.throws(()=>validateInput({text:'继续播放',recalledMemory:[{kind:'experience',app:'shell'}]}),/格式/);
  assert.throws(()=>serializeRecall(Array(9).fill(recalledMemory[0])),/数量/);
  let calls=0;
  await modelPlan({text:'继续播放上次找到的歌手，先只搜索',app:'music',recalledMemory},{model:'fixture',reasoning:'off',async generateObject(args){calls++;assert.match(args.input.memoryContext,/林俊杰/);assert.match(args.instructions,/当前要求优先/);assert.ok(args.contextBudget.estimatedInputTokens>0);return{steps:[{tool:'music.search',args:{kind:'artist',query:'林俊杰'}}]};}});
  assert.equal(calls,1);
});

async function httpFixture(t) {
  const server=createServer({token:'a'.repeat(64),provider:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const request=async(path,body)=>(await fetch(`http://127.0.0.1:${server.address().port}${path}`,{headers:{Authorization:'Bearer '+'a'.repeat(64),'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})})).json();
  await request('/v1/history',{operation:'configure',revision:1,settings});return request;
}
test('HTTP真实历史 start/end 驱动记忆写入，重放和孤立end不写；删除历史联动且补充遵守CAS', async t => {
  const request=await httpFixture(t),r=receipt();
  const event={...r,role:'tool',title:'搜索歌手',phase:'start'};
  await request('/v1/history',{operation:'event',event});
  assert.equal((await request('/v1/memory')).experiences.length,0);
  await request('/v1/history',{operation:'event',event:{...event,phase:'end'}});
  const mem=await request('/v1/memory');assert.equal(mem.experiences.length,1);
  await request('/v1/history',{operation:'event',event:{...event,phase:'end'}});
  await request('/v1/history',{operation:'event',event:{...event,id:'orphan',phase:'end'}});
  assert.equal((await request('/v1/memory')).experiences.length,1);
  assert.match((await request('/v1/memory',{operation:'learn-history',expectedRevision:1})).error,/已变化/);
  assert.equal((await request('/v1/memory',{operation:'learn-history',expectedRevision:mem.revision})).added,0);
  await request('/v1/history',{operation:'delete',conversationId:'chat'});
  assert.equal((await request('/v1/memory')).experiences.length,0);
});

test('真实执行器自动点歌只播放一次，经历跨新会话可查；读取失败不伪造回忆', async t => {
  const request=await httpFixture(t), values={};let plays=0;
  const storage={async get(){return values;},async set(v){Object.assign(values,structuredClone(v));}};
  const handlers=Tools.create({storage,memory:async(action,body)=>request('/v1/memory',action==='get'?undefined:body),
    netease:async(path)=>path.includes('artist/top/song')?{songs:[{id:101,name:'歌',ar:[{name:'林俊杰'}]}]}:{result:{artists:[{id:3684,name:'林俊杰'}]}},
    readMusicState:async()=>({status:'ready',revision:'q1',count:0}),applyMusicQueue:async()=>{plays++;return{isPlaying:true,currentSong:{title:'歌'},count:1,status:'ready',revision:'q2'};},ai:async()=>{throw new Error('不应调用模型');}});
  const engine=Engine.create({storage,...handlers,history:event=>request('/v1/history',{operation:'event',event})});
  await engine.submit({app:'music',text:'林俊杰的热门歌曲',newConversation:true});let view=await engine.settled();assert.equal(view.status,'completed',view.message);
  const mem=await request('/v1/memory');assert.equal(mem.artists.length,0);assert.equal(mem.experiences.length,1);assert.equal(mem.experiences[0].action,'played');assert.equal(Memory.recall(mem,'上次找过谁',{app:'music'})[0].title,'林俊杰');
  await engine.submit({app:'music',text:'我上次播放过哪些歌曲',newConversation:true});view=await engine.settled();assert.equal(view.status,'completed',view.message);assert.match(view.message,/林俊杰/);assert.equal(plays,1);
  const offline=Tools.create({memory:async()=>{throw new Error('离线');}});
  await assert.rejects(offline.execute({tool:'memory.recall',args:{text:'上次搜索了谁'}},{guard(){},task:{input:{text:'上次搜索了谁',app:'music'}}}),/离线/);
});

test('规划取记忆后取消不发模型请求，失败的业务写入不会生成经历', async t => {
  let cancel=false,calls=0;
  const h=Tools.create({memory:async()=>{cancel=true;return{ok:true,revision:1,enabled:true,experiences:[]};},ai:async()=>{calls++;}});
  await assert.rejects(h.plan({text:'继续播放上次找到的歌手'},{guard(){if(cancel)throw new Error('已取消');},task:{input:{text:'继续播放上次找到的歌手'},observations:[],turns:[]}}),/取消/);
  assert.equal(calls,0);
  const history=createHistoryStore();history.configure(settings,1);
  const event={...receipt(),role:'tool',phase:'start'};history.event(event);
  const row=history.event({...event,phase:'end',status:'failed',output:{message:'回执丢失',playback:{artist:'林俊杰'}}});
  const s=store(t);assert.equal(s.captureHistory([row],settings).added,0);
});


test('大搜索回执保留有限经历投影，关闭留存期间的完成不会补写正文或经历', t => {
  const h=createHistoryStore();h.configure(settings,1);
  const event={...receipt(),role:'tool',phase:'start'};h.event(event);
  const output={...event.output,choices:Array.from({length:100},(_,i)=>({title:'候选'+i,description:'x'.repeat(1000)}))};
  const saved=h.event({...event,phase:'end',output});
  assert.equal(saved.output.truncated,true);assert.equal(saved.experience.query,'林俊杰');
  const s=store(t);assert.equal(s.captureHistory([saved],settings).added,1);
  h.event({...event,id:'off'});h.configure({...settings,captureContent:false},2);
  const disabled=h.event({...event,id:'off',phase:'end',output});
  assert.equal(disabled.output,undefined);assert.equal(disabled.experience,undefined);
  assert.equal(s.captureHistory([disabled],{...settings,captureContent:false}).added,0);
});

test('缩短历史期限同步删除过期派生经历，跨应用召回不混用音乐偏好', t => {
  const now=at+10*86400000,s=store(t,{now:()=>now});s.captureHistory([receipt()],{...settings,retentionDays:30});
  assert.equal(s.snapshot().experiences.length,1);s.restrictRetention(7);assert.equal(s.snapshot().experiences.length,0);
  assert.equal(Memory.scopeFor('播放上次B站的视频'),'bilibili');
  assert.equal(Contract.localPlan({text:'上次搜索了谁，然后播放他的歌',app:'music'}),null);
  const snapshot={enabled:true,notes:[{key:'n',app:'music',value:'我喜欢爵士乐',updatedAt:now}]};
  assert.equal(Memory.recall(snapshot,'帮我创建提醒',{app:'alarm'}).length,0);
});
