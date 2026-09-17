const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../js/assistant-engine.js');
const Tools = require('../js/assistant-tools.js');
const Contract = require('../js/assistant-contract.js');

function fixture() {
  let seq = 0, clock = Date.now(); const values = {}, events = [], requests = [], plays = [];
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage, netease: async (path, params) => {
    requests.push({ path, params });
    if (path.includes('artist/top')) return { code:200, songs:[{ id:params.id + '1', name:'候选的歌曲', ar:[{name:'张杰'}] }] };
    return { code:200, result:{ artists:[{id:11,name:'张杰'},{id:22,name:'张杰'}] } };
  }, playQueue: async (songs, ctx) => { plays.push(songs); return ctx.trace('music.playback.confirm', '确认播放', {}, async () => ({ ok:true, song:songs[0], queueLength:songs.length })); } });
  const options = { storage, ...handlers, id: () => `test-${++seq}`, now: () => clock, history: async e => { events.push(e); }, plan: async () => ({steps:[{tool:'music.search',args:{kind:'artist',query:'张杰'}}]}) };
  return { engine:Engine.create(options), options, values, events, requests, plays, advance(ms) { clock += ms; } };
}
async function search(f) { await f.engine.submit({app:'music',text:'张杰，直接播放'}); return f.engine.settled(); }

test('输入播放第二个直接播放歌手热门曲目，不浏览、不再次搜索；独立轮次仍是同一会话', async () => {
  const f = fixture(), first = await search(f), searches = f.requests.length;
  await f.engine.submit({app:'music',text:'直接播放第 2 个',taskId:first.id,version:first.version,candidateIds:['artist-11','artist-22']});
  const second = await f.engine.settled();
  assert.equal(second.conversationId, first.conversationId); assert.notEqual(second.turnId, first.turnId);
  assert.equal(second.status, 'completed'); assert.equal(f.plays[0][0].songId, '221');
  assert.equal(f.requests.length, searches + 1); assert.equal(second.musicView.kind, 'search');
  assert.ok(second.messages.some(row => row.content === '直接播放第 2 个'));
  assert.ok(second.trace.some(row => row.turnId === first.turnId)); assert.ok(second.trace.some(row => row.turnId === second.turnId));
  assert.equal(second.memorySummary.candidateCount, 2);
});

test('完成后继续输入保留消息、候选和会话，清除后才新建会话', async () => {
  const f = fixture(); let task = await search(f);
  await f.engine.submit({app:'music',text:'播放第二个',taskId:task.id,version:task.version}); task = await f.engine.settled();
  await f.engine.submit({app:'music',text:'再看看',taskId:task.id,version:task.version}); const continued = await f.engine.settled();
  assert.equal(continued.conversationId, task.conversationId); assert.notEqual(continued.id, task.id);
  assert.ok(continued.messages.some(row => row.content === '播放第二个'));
  await assert.rejects(f.engine.submit({text:'播放第一个',taskId:task.id,version:task.version}), /候选/);
  await f.engine.clear(); await assert.rejects(f.engine.submit({text:'播放第一个'}), /候选/);
  const fresh = await search(f); assert.notEqual(fresh.conversationId, task.conversationId);
});

test('筛选后的编号使用实际展示 ID，拒绝伪造列表、越界、旧版本，过期不因继续输入刷新', async () => {
  const f = fixture(); let task = await search(f); const submit = extra => f.engine.submit({app:'music',text:'播放第 1 个',taskId:task.id,version:task.version,...extra});
  await assert.rejects(submit({candidateIds:['fake']}), /变化/);
  await assert.rejects(submit({candidateIds:[]}), /没有这个/);
  await assert.rejects(submit({version:99}), /变化/);
  await submit({candidateIds:['artist-22']}); task = await f.engine.settled(); assert.equal(f.plays[0][0].songId, '221');
  f.advance(600001); await assert.rejects(submit(), /十分钟/); assert.equal(f.plays.length, 1);
});

test('实时步骤在工具结束前可见，敏感字段与链接脱敏，参数正文不写入会话快照存储', async () => {
  const f = fixture(); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  const engine = Engine.create({...f.options, execute: async (step, ctx) => ctx.trace('service.test','测试请求',{query:'live-only-body',cookie:'private-secret',url:'https://secret.test'},async () => { entered(); await new Promise(resolve => { release = resolve; }); return { message:'完成',password:'private-secret' }; })});
  await engine.submit({text:'test'}); await started;
  const snapshot = await engine.snapshot(), row = snapshot.trace.find(row => row.tool === 'service.test');
  assert.equal(row.status,'running'); assert.equal(row.input.query,'live-only-body');
  assert.doesNotMatch(JSON.stringify(snapshot), /private-secret|secret.test/);
  assert.doesNotMatch(JSON.stringify(f.values), /live-only-body|private-secret|secret.test/);
  release(); const final = await engine.settled(); assert.equal(final.trace.find(item => item.id === row.id).status,'succeeded');
});

test('重开后保留会话、候选和动作元数据，点击失败后仍可选其他候选', async () => {
  const f = fixture(), task = await search(f);
  const restored = Engine.create({...f.options, choose:async () => {throw new Error('播放器离线');}});
  const before = await restored.snapshot(); assert.equal(before.conversationId,task.conversationId); assert.equal(before.messages.length,2);
  assert.ok(before.trace.length); assert.equal(before.trace[0].input,undefined);
  await restored.submit({app:'music',text:'播放第二个',taskId:before.id,version:before.version}); const failed = await restored.settled(); assert.equal(failed.status,'failed');
  assert.equal(failed.memorySummary.candidateCount,2);
  const retry = Engine.create(f.options); await retry.submit({app:'music',text:'播放第一个',taskId:failed.id,version:failed.version}); assert.equal((await retry.settled()).status,'completed');
});

test('序号解析支持空格、多位数字与中文，普通需求不误判为候选选择', () => {
  for (const [text,n] of [['播放第 2 个',2],['直接播放第十二个',12],['第九首播放',9],['选择第21条',21],['第一个吧',1]]) assert.equal(Contract.ordinal(text).index,n);
  for (const text of ['张杰，直接播放','播放三十分钟','不要播放第一个','如果第一个失败播放第二个']) assert.equal(Contract.ordinal(text),null);
});

test('明确直接播放且只有一个候选时自动播放，普通搜索或否定请求仍停在候选', async () => {
  for (const text of ['张杰，直接播放','搜索张杰','不要直接播放张杰']) {
    const f = fixture(); let played = 0;
    const engine = Engine.create({...f.options, execute:async () => ({status:'waiting',message:'找到歌手',musicView:{kind:'search'},choices:[
      {id:'artist',kind:'artist',title:'张杰',action:'music.browse'},
      {id:'play',kind:'artist',secondary:true,parentId:'artist',title:'播放张杰',action:'music.enqueue-collection'}
    ]}), choose:async () => { played++; return {message:'播放器已确认'}; }});
    await engine.submit({app:'music',text}); const result = await engine.settled();
    assert.equal(played, text === '张杰，直接播放' ? 1 : 0);
    assert.equal(result.status, played ? 'completed' : 'waiting');
  }
});

test('浏览歌手后说播放热门歌曲直接使用当前候选，不再重新规划', async () => {
  const f = fixture(); let task = await search(f);
  await f.engine.submit({ app:'music', text:'第一个', taskId:task.id, version:task.version }); task = await f.engine.settled();
  assert.equal(task.status, 'waiting'); assert.equal(task.musicView.kind, 'artist');
  const searches = f.requests.length;
  await f.engine.submit({ app:'music', skill:'music-search', text:'播放热门歌曲', taskId:task.id, version:task.version });
  const played = await f.engine.settled();
  assert.equal(played.status, 'completed', played.message); assert.equal(f.plays.length, 1);
  assert.equal(f.plays[0][0].songId, '111');
  assert.equal(f.requests.length, searches + 1); // 仅重新读取并播放当前歌手曲目，没有再次搜索。
  assert.ok(played.messages.some(row => row.content === '播放热门歌曲'));
});
