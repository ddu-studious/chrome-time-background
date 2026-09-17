const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/assistant-contract.js');
const { create, KEY } = require('../js/assistant-engine.js');
const Tools = require('../js/assistant-tools.js');
const vm = require('node:vm');
const fs = require('node:fs');
function storage() { const values = {}; return { values, async get() { return structuredClone(values); }, async set(patch) { Object.assign(values, structuredClone(patch)); }, async remove(key) { delete values[key]; } }; }
const one = { steps: [{ tool: 'music.intent', args: { text: '暂停' } }] };
function fixture(overrides = {}) {
  let n = 0;
  const store = storage();
  const deps = { storage: store, id: () => 'task-' + ++n, plan: async () => one, execute: async () => ({ message: '完成' }), choose: async () => ({ message: '已选择' }), ...overrides };
  return { store, deps, engine: create(deps) };
}
test('@ / 解析、别名及明确作用域', () => {
  assert.deepEqual(C.input({ text: '@B站 /继续看 MySQL' }), { text: 'MySQL', app: 'bilibili', skill: 'history' });
  assert.deepEqual(C.input({ text: '/暂停' }), { text: '', app: 'music', skill: 'pause' });
  assert.equal(C.input({ text: '@youtube /找视频 a@b.com' }).text, 'a@b.com');
  assert.throws(() => C.input({ app: 'alarm', skill: 'play', text: 'test' }), /不适用/);
  assert.throws(() => C.input({ text: '@未知 app' }), /未识别/);
});
test('明确点歌加定时形成两个步骤，时长越界不执行', () => {
  const plan = C.localPlan({ app: 'music', text: '播放张杰的逆战，半小时后暂停' });
  assert.deepEqual(plan.steps.map(s => s.tool), ['music.intent', 'music.sleep']);
  assert.equal(plan.steps[1].args.minutes, 30);
  assert.throws(() => C.localPlan({ app: 'music', text: '播放逆战，999分钟后停止' }), /240/);
  assert.equal(C.localPlan({ app: 'music', skill: 'sleep', text: '30分钟' }).steps[0].args.minutes, 30);
});
test('计划拒绝任意工具、参数、跨应用和超过三步', () => {
  for (const bad of [{ steps: [{ tool: 'eval', args: { text: 'x' } }] }, { steps: [{ tool: 'music.intent', args: { text: 'x', songId: '1' } }] }, { steps: Array(4).fill(one.steps[0]) }, { question: '请选择', steps: one.steps }]) assert.throws(() => C.validatePlan(bad));
  assert.throws(() => C.validatePlan(one, 'alarm'), /范围/);
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'video.search', args: { platform: 'youtube', query: 'x' } }] }, 'bilibili'), /范围/);
  assert.equal(C.localPlan({ app: 'music', skill: 'pause', text: '不要暂停' }), null);
});
test('选择歌曲后才继续定时；重复点击只执行一次', async () => {
  let plays = 0, timers = 0;
  const f = fixture({ plan: async () => C.localPlan({ app: 'music', text: '播放张杰的逆战，30分钟后停止' }),
    execute: async step => step.tool === 'music.intent' ? { status: 'waiting', message: '选歌', choices: [{ id: 'song', title: '歌曲', action: 'music.play', data: { songId: '123' } }] } : (timers++, { message: '定时完成' }),
    choose: async () => { plays++; return { message: '播放完成' }; } });
  const initial = await f.engine.submit({ app: 'music', text: 'test' });
  assert.equal((await f.engine.settled()).status, 'waiting'); assert.equal(timers, 0);
  const results = await Promise.allSettled([f.engine.choose(initial.id, 'song'), f.engine.choose(initial.id, 'song')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const final = await f.engine.settled(); assert.equal(final.status, 'completed'); assert.equal(plays, 1); assert.equal(timers, 1);
  assert.deepEqual(final.log.map(x => x.status), ['done', 'done']);
});
test('播放失败阻断后续定时，完成记录可核对', async () => {
  let calls = 0;
  const f = fixture({ plan: async () => ({ steps: [one.steps[0], { tool: 'music.sleep', args: { minutes: 30 } }] }), execute: async () => { calls++; throw new Error('未确认播放'); } });
  await f.engine.submit({ text: 'test' }); const task = await f.engine.settled();
  assert.equal(calls, 1); assert.equal(task.status, 'failed'); assert.match(task.message, /未确认/);
});
test('取消后迟到的计划不能执行工具', async () => {
  let release, calls = 0;
  const f = fixture({ plan: () => new Promise(resolve => { release = resolve; }), execute: async () => { calls++; return { message: 'bad' }; } });
  const t = await f.engine.submit({ text: 'test' });
  await f.engine.cancel(t.id); release(one); await f.engine.settled();
  assert.equal(calls, 0); assert.equal((await f.engine.snapshot()).status, 'cancelled');
});
test('重启保留待选候选，公开快照不暴露执行参数', async () => {
  let calls = 0;
  const f = fixture({ execute: async () => ({ status: 'waiting', message: '选歌', choices: [{ id: 'song', title: 'song', action: 'music.play', data: { songId: '123' } }] }), choose: async () => { calls++; return { message: '完成' }; } });
  await f.engine.submit({ text: 'test' }); const before = await f.engine.settled();
  assert.equal(before.choices[0].data, undefined);
  const restarted = create(f.deps); assert.equal((await restarted.snapshot()).status, 'waiting');
  await restarted.choose(before.id, 'song'); await restarted.settled(); assert.equal(calls, 1);
});
test('重启时不自动重复执行未确认完成的动作', async () => {
  const f = fixture();
  await f.store.set({ [KEY]: { id: 'old', version: 1, status: 'running', log: [], turns: [], jobId: 'job' } });
  let cancelled = 0;
  const restarted = create({ ...f.deps, cancelJob: async () => { cancelled++; } });
  assert.equal((await restarted.snapshot()).status, 'interrupted'); assert.equal(cancelled, 1);
});
test('旧任务候选、伪造候选及过期候选不能执行', async () => {
  let clock = 1000;
  const f = fixture({ now: () => clock, execute: async () => ({ status: 'waiting', message: '选', choices: [{ id: 'x', title: 'x' }] }) });
  await f.engine.submit({ text: 'test' }); const task = await f.engine.settled();
  await assert.rejects(f.engine.choose('old', 'x'), /过期/); await assert.rejects(f.engine.choose(task.id, 'forged'), /无效/);
  clock += 600001; await assert.rejects(f.engine.choose(task.id, 'x'), /十分钟/);
});
test('查询与候选链接拒绝脚本协议和无效视频ID', () => {
  assert.equal(Tools.videoURL('youtube', 'dQw4w9WgXcQ', 63), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=63s');
  assert.equal(Tools.videoURL('bilibili', 'BV1xx411c7mD', 12), 'https://www.bilibili.com/video/BV1xx411c7mD/?t=12');
  assert.equal(Tools.videoURL('bilibili', 'BV1xx411c7mD', 12, 3), 'https://www.bilibili.com/video/BV1xx411c7mD/?p=3&t=12');
  assert.throws(() => Tools.videoURL('youtube', 'javascript:alert(1)'));
  assert.throws(() => Tools.videoURL('other', 'dQw4w9WgXcQ'));
});
const context = () => ({ guard() {}, trackJob: async () => {}, progress: async () => {}, task: { id: 'fixture', input: { app: null }, memory: {}, turns: [{ role: 'user', content: 'test' }] } });
test('YouTube 续看只用扩展本地历史并携带持久化时间', async () => {
  const store = storage(); await store.set({ youtubeWatchHistory: [{ id: 'dQw4w9WgXcQ', title: 'MySQL 入门', channel: '课程' }], youtubeWatchProgress: { dQw4w9WgXcQ: { time: 123 } } });
  let url;
  const tools = Tools.create({ storage: store, openURL: async value => { url = value; }, youtube: () => assert.fail('不能获取官方账号历史') });
  const result = await tools.execute({ tool: 'video.history', args: { platform: 'youtube', query: 'mysql' } }, context());
  assert.match(result.message, /本地/); assert.match(result.choices[0].subtitle, /2:03/);
  await tools.choose(result.choices[0], context()); assert.match(url, /t=123s/);
});
test('未授权 YouTube 搜索只提供原站搜索选项，不编造候选', async () => {
  let opened = 0;
  const tools = Tools.create({ youtube: async () => { throw Object.assign(new Error('no'), { code: 'auth-required' }); }, openURL: async () => { opened++; } });
  const result = await tools.execute({ tool: 'video.search', args: { platform: 'youtube', query: 'test' } }, context());
  assert.equal(opened, 0); assert.equal(result.choices[0].action, 'video.search-site');
});
test('闹钟先显示确认卡，确认前不保存，过期时间不能创建', async () => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let saved = 0, clock = 1000;
  const tools = Tools.create({ now: () => clock, ai: async () => ({ ok: true, status: 'ready', displayText: '休息', timeZone: zone, alarm: { fireAt: 2000 } }), saveAlarm: async value => { saved++; return { alarm: { ...value, date: 'date', time: '10:00', label: '休息' } }; } });
  const result = await tools.execute({ tool: 'alarm.prepare', args: { text: '提醒' } }, context());
  assert.equal(result.status, 'review'); assert.equal(saved, 0);
  await tools.choose(result.choices[0], context()); assert.equal(saved, 1);
  clock = 3000; await assert.rejects(tools.choose(result.choices[0], context()), /时间已过/);
});
test('音乐搜索使用真实ID，未知或错误歌手不会被当成符合要求', async () => {
  const tools = Tools.create({ ai: async () => ({ ok: true, intent: { action: 'search', kind: 'song', query: '张杰 逆战', title: '逆战', artist: '张杰' } }), netease: async () => ({ code: 200, result: { songs: [{ id: 1, name: '逆战', ar: [{ name: '其他歌手' }] }, { id: 2, name: '逆战', ar: [{ name: '张杰' }] }] } }) });
  const result = await tools.execute({ tool: 'music.intent', args: { text: '播放张杰的逆战' } }, context());
  assert.equal(result.choices.filter(c => !c.secondary).length, 1); assert.equal(result.choices[0].data.songId, '2');
});
test('替换搜索不把旧音乐草稿和历史交给解析器', async () => {
  let seen;
  const tools = Tools.create({
    ai: async input => { seen=input; return {ok:true,intent:{action:'search',kind:'auto',query:'张杰'}}; },
    netease: async () => ({code:200,result:{artists:[{id:1,name:'张杰'}]}})
  });
  const ctx=context();ctx.task.startMode='replace';ctx.task.input.ai={model:'qwen/test',reasoning:'high'};ctx.task.memory={musicDraft:{action:'search',kind:'auto',query:'张杰 地铁'}};
  ctx.task.turns=[{role:'user',content:'张杰'},{role:'assistant',content:'搜索结果'},{role:'user',content:'地铁'},{role:'assistant',content:'搜索结果'},{role:'user',content:'张杰'}];
  await tools.execute({tool:'music.intent',args:{text:'张杰'}},ctx);
  assert.deepEqual(seen.turns,[]);assert.equal(Object.hasOwn(seen,'draft'),false);assert.deepEqual(seen.selection,{model:'qwen/test',reasoning:'high'});
});
test('观看日期和未看完筛选使用真实记录时间，排除已看完及其他日期', async () => {
  const now = new Date(2026, 8, 15, 12).getTime(), yesterday = new Date(2026, 8, 14, 12).getTime();
  const tools = Tools.create({ now: () => now, bilibili: async () => ({ code: 0, data: { list: [
    { bvid: 'BV1xx411c7mD', title: 'MySQL', view_at: yesterday / 1000, progress: 80, duration: 600 },
    { bvid: 'BV1xx411c7mE', title: 'MySQL 已看完', view_at: yesterday / 1000, progress: -1, duration: 600 },
    { bvid: 'BV1xx411c7mF', title: 'MySQL 今天', view_at: now / 1000, progress: 90, duration: 600 }
  ] } }) });
  const args = { platform: 'bilibili', query: 'mysql', dayOffset: 1, unfinishedOnly: true };
  C.validatePlan({ steps: [{ tool: 'video.history', args }] });
  const result = await tools.execute({ tool: 'video.history', args }, context());
  assert.equal(result.choices.length, 1); assert.equal(result.choices[0].data.id, 'BV1xx411c7mD');
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'video.history', args: { ...args, dayOffset: -1 } }] }));
});
test('闹钟追问后补充保留原草稿和时间锚点', async () => {
  const original = { label: '开会', kind: 'once', dayOffset: 1 };
  let seen;
  const tools = Tools.create({ ai: async input => { seen = input; return { ok: true, status: 'needs_clarification', question: '几点？', draft: original }; } });
  const ctx = context(); ctx.task.memory = { alarmDraft: original, alarmAnchor: 1000 }; ctx.task.turns = [{ role: 'user', content: '明天开会' }, { role: 'assistant', content: '几点？' }, { role: 'user', content: '上午' }];
  const result = await tools.execute({ tool: 'alarm.prepare', args: { text: '上午' } }, ctx);
  assert.deepEqual(seen.draft, original); assert.equal(seen.now, 1000); assert.equal(seen.turns.length, 2); assert.equal(result.status, 'clarify');
});
test('确认前修改倒计时保留事项，中文数字可离线解析', () => {
  const A = require('../js/alarm-intent.js');
  const context = { now: Date.now(), timeZone: 'Asia/Shanghai' };
  const draft = A.parseDraft('30分钟后提醒我休息', null, context);
  for (const text of ['改成40分钟', '四十分钟后']) {
    const next = A.parseDraft(text, draft, context);
    assert.equal(next.label, '休息'); assert.equal(next.delayMinutes, 40);
    assert.equal(A.resolveDraft(next, context).alarm.fireAt, context.now + 40 * 60000);
  }
});
function playbackFixture({ url = async () => 'https://music.example.test/track.mp3', confirms = true, initialQueue } = {}) {
  const source = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  const start = source.indexOf('    async function waitAssistantPlayback('), end = source.indexOf('    chrome.contextMenus.onClicked.addListener(', start);
  let clock = 1000, plays = 0, writes = 0, state = { songId: '1', isPlaying: true, volume: .5, currentTime: 30, duration: 300 };
  const queue = initialQueue || [{ songId: '1', title: '第一首' }, { songId: '2', title: '第二首' }];
  let cache = { playlist: queue }, mode = 'sequence';
  let captured;
  const context = { MusicQueuePolicy: require('../js/music-queue-policy.js'), TextEncoder, crypto: { subtle: require('node:crypto').webcrypto.subtle, randomUUID: () => 'fixture-revision' }, Date: { now: () => clock }, setTimeout: fn => { clock += 250; queueMicrotask(fn); },
    QuickAssistant: { install(deps) { captured = deps; return {}; } }, LocalAIBridge: {},
    chrome: { storage: { local: { async get() { return { musicPlaylistCache: cache, musicPlayMode: mode }; }, async set(value) { if (value.musicPlaylistCache) cache = value.musicPlaylistCache; if (value.musicPlayMode) mode = value.musicPlayMode; writes++; }, async remove() {} } }, tabs: {} },
    musicSleep: {}, getUserAlarmViewState() {}, saveUserAlarm() {}, neteaseApiCall() {}, bilibiliApiCall() {}, youtubeApiCall() {},
    getSilentMusicSongUrl: url,
    persistSilentMusicPlayback: async () => { writes++; cache = { playlist: context.playbackSnapshot().songs }; },
    sendToOffscreen: async (message, guard) => { guard?.(); if (message.command === 'seekTo') state.currentTime = message.value; if (message.command === 'stop') state = { ...state, songId: null, isPlaying: false, currentTime: 0 }; if (message.command === 'play') { plays++; state = { ...state, songId: message.songId, title: message.title, isPlaying: confirms }; } return { ok: true, data: state }; }
  };
  vm.runInNewContext('let silentMusicPlayback = null, assistantMusicRevision = 0;\n' + source.slice(start, end) + '\nglobalThis.interrupt = () => assistantMusicRevision++; globalThis.playbackSnapshot = () => silentMusicPlayback;', context);
  return { deps: captured, interrupt: context.interrupt, plays: () => plays, writes: () => writes, queue: () => cache.playlist, audio: () => state };
}
test('助手 URL 获取期间手动操作播放器，迟到结果不提交播放', async () => {
  let resolveURL;
  const f = playbackFixture({ url: () => new Promise(resolve => { resolveURL = resolve; }) });
  const pending = f.deps.playMusic({ songId: '2', title: '第二首' }, context());
  f.interrupt(); resolveURL('https://music.example.test/track.mp3');
  await assert.rejects(pending, /手动操作/); assert.equal(f.plays(), 0); assert.equal(f.writes(), 0);
});
test('助手下一首走受控后台队列并核对播放状态', async () => {
  const f = playbackFixture();
  const result = await f.deps.controlMusic({ action: 'next' }, context());
  assert.equal(result.ok, true); assert.match(result.message, /第二首/); assert.equal(f.plays(), 1); assert.equal(f.writes(), 1);
});
test('播放器接收命令但未实际播放，不报告成功也不保存播放快照', async () => {
  const f = playbackFixture({ confirms: false });
  await assert.rejects(f.deps.playMusic({ songId: '2', title: '第二首' }, context()), /未确认/);
  assert.equal(f.plays(), 1); assert.equal(f.writes(), 0);
});

test('播放工具轨迹区分资源准备、提交、实际播放确认和队列落盘', async () => {
  for (const confirms of [true, false]) {
    const playback = playbackFixture({ confirms }), events = [];
    const f = fixture({ history: async e => { events.push(e); }, execute: async (step, ctx) => {
      const result = await playback.deps.playMusic({ songId: '2', title: '第二首' }, ctx);
      return { message: '已确认播放', playback: result };
    } });
    await f.engine.submit({ text: '播放' }); await f.engine.settled();
    const ended = events.filter(e => e.role === 'tool' && e.phase === 'end');
    assert.equal(ended.find(e => e.tool === 'music.playback.prepare').status, 'succeeded');
    assert.equal(ended.find(e => e.tool === 'music.playback.dispatch').status, 'succeeded');
    assert.equal(ended.find(e => e.tool === 'music.playback.confirm').status, confirms ? 'succeeded' : 'failed');
    assert.equal(ended.some(e => e.tool === 'music.queue.persist'), confirms);
    assert.equal(playback.writes() > 0, confirms);
    assert.doesNotMatch(JSON.stringify(events), /music.example.test/);
  }
});
test('批量加入保留原队列顺序、去重，不改变音频状态',async()=>{
  const f=playbackFixture();const before={...f.audio()};
  const result=await f.deps.enqueueMusic([{songId:'1',title:'已有'},{songId:'3',title:'新曲目'},{songId:'3',title:'重复新曲目'}],context());
  assert.equal(result.added,1);assert.deepEqual(Array.from(f.queue(),s=>s.songId),['1','2','3']);
  assert.deepEqual(f.audio(),before);assert.equal(f.plays(),0);
  assert.equal((await f.deps.enqueueMusic([{songId:'3'}],context())).added,0);
  assert.equal(f.queue().length,3);
});
test('批量添加超出容量时整批拒绝，不截断或覆盖原队列',async()=>{
  const queue=Array.from({length:299},(_,i)=>({songId:String(i+1),title:'原曲目'}));
  const f=playbackFixture({initialQueue:queue});
  await assert.rejects(f.deps.enqueueMusic([{songId:'400'},{songId:'401'}],context()),/队列已满/);
  assert.equal(f.queue().length,299);assert.equal(f.writes(),0);assert.equal(f.plays(),0);
});
test('单曲播放追加到已有队列，重复歌曲仍立即播放但不重复入队',async()=>{
  const f=playbackFixture();
  await f.deps.playMusic({songId:'3',title:'逆战',artist:'张杰'},context());
  assert.deepEqual(Array.from(f.queue(),s=>s.songId),['1','2','3']);assert.equal(f.audio().songId,'3');
  await f.deps.playMusic({songId:'2',title:'第二首'},context());
  assert.deepEqual(Array.from(f.queue(),s=>s.songId),['1','2','3']);assert.equal(f.audio().songId,'2');assert.equal(f.plays(),2);
});
test('整组播放完全替换旧队列；资源准备失败保留旧队列',async()=>{
  const rows=[{songId:'3',title:'新一'},{songId:'4',title:'新二'}];
  const f=playbackFixture();const result=await f.deps.playQueue(rows,context(),'张杰专辑');
  assert.deepEqual(Array.from(f.queue(),s=>s.songId),['3','4']);assert.equal(f.audio().songId,'3');assert.equal(result.queueLength,2);
  const failed=playbackFixture({url:async()=>''});
  await assert.rejects(failed.deps.playQueue(rows,context(),'张杰专辑'),/不可播放/);
  assert.deepEqual(Array.from(failed.queue(),s=>s.songId),['1','2']);assert.equal(failed.plays(),0);assert.equal(failed.writes(),0);
});
test('满队列不丢弃末尾歌曲，已有歌曲仍可切换播放',async()=>{
  const queue=Array.from({length:300},(_,i)=>({songId:String(i+1),title:'曲目'}));
  const f=playbackFixture({initialQueue:queue});
  await assert.rejects(f.deps.playMusic({songId:'999',title:'新曲目'},context()),/队列已满/);
  assert.equal(f.queue().length,300);assert.equal(f.queue()[299].songId,'300');assert.equal(f.plays(),0);
  await f.deps.playMusic({songId:'300',title:'末尾曲目'},context());assert.equal(f.audio().songId,'300');assert.equal(f.queue().length,300);
});

test('助手状态来自实时音频和队列，模式更新返回新版本，旧版本写入被拒绝', async () => {
  const f = playbackFixture(); const c = context();
  const before = await f.deps.readMusicState(c);
  assert.equal(before.status, 'ready'); assert.equal(before.count, 2); assert.equal(before.isPlaying, true);
  const changed = await f.deps.setMusicMode('shuffle', before.revision, c);
  assert.equal(changed.mode, 'shuffle'); assert.notEqual(changed.revision, before.revision);
  await assert.rejects(f.deps.playCurrentQueue(before.revision, null, c), /已变化/);
  const playing = await f.deps.playCurrentQueue(changed.revision, null, c);
  assert.equal(playing.isPlaying, true); assert.equal(playing.mode, 'shuffle'); assert.equal(f.plays(), 1);
});
test('实时播放器仍有歌曲但没有匹配队列时，不把状态当作空队列', async () => {
  const f = playbackFixture({ initialQueue: [] }); const c = context();
  const state = await f.deps.readMusicState(c); assert.equal(state.status, 'unavailable');
  await assert.rejects(f.deps.applyMusicQueue([{ songId: '8' }], { mode: 'replace', startPlayback: true, expectedRevision: state.revision }, c), /不可用/);
  assert.equal(f.plays(), 0);
});
test('后台队列应用保留追加语义，不发起播放；重复歌曲不重复加入', async () => {
  const f = playbackFixture(); const c = context();
  const state = await f.deps.readMusicState(c);
  const next = await f.deps.applyMusicQueue([{ songId: '2', title: '第二首' }, { songId: '3', title: '第三首' }], { mode: 'append', startPlayback: false, expectedRevision: state.revision }, c);
  assert.equal(next.count, 3); assert.equal(f.plays(), 0);
  assert.deepEqual(Array.from(f.queue(), s => s.songId), ['1', '2', '3']);
});
test('读取状态后手动操作会使助手写入版本失效', async () => {
  const f = playbackFixture(); const c = context(); const state = await f.deps.readMusicState(c);
  f.interrupt();
  await assert.rejects(f.deps.setMusicMode('shuffle', state.revision, c), /已变化/);
  assert.equal(f.writes(), 0);
});
test('准备播放资源期间队列被修改，提交前再次验证版本', async () => {
  let resolveURL; const f = playbackFixture({ url: () => new Promise(r => { resolveURL = r; }) }); const c = context();
  const state = await f.deps.readMusicState(c);
  const pending = f.deps.playCurrentQueue(state.revision, '2', c);
  while (!resolveURL) await new Promise(r => setImmediate(r));
  await f.deps.enqueueMusic([{ songId: '3', title: '手动新增' }], c);
  resolveURL('https://music.example.test/song');
  await assert.rejects(pending, /已变化/); assert.equal(f.plays(), 0);
});

test('超过工具容量的已有队列只读可见，不会静默截成300首后播放', async () => {
  const f = playbackFixture({ initialQueue: Array.from({ length: 301 }, (_, i) => ({ songId: String(i + 1) })) }); const c = context();
  const state = await f.deps.readMusicState(c);
  assert.equal(state.count, 301); assert.equal(state.status, 'unavailable');
  await assert.rejects(f.deps.playCurrentQueue(state.revision, null, c), /不可用/);
  assert.equal(f.queue().length, 301); assert.equal(f.plays(), 0);
});

test('队列播放可在同一工具中明确设置随机模式并确认声音状态', async () => {
  const f = playbackFixture(); const c = context(); const state = await f.deps.readMusicState(c);
  const result = await f.deps.playCurrentQueue(state.revision, null, c, 'shuffle');
  assert.equal(result.mode, 'shuffle'); assert.equal(result.isPlaying, true); assert.equal(f.plays(), 1);
});

test('音乐定位等待真实进度，超出时长或旧版本不得提交', async () => {
  const f = playbackFixture(); const c = context(); const state = await f.deps.readMusicState(c);
  await assert.rejects(f.deps.seekMusic(400, state.revision, c), /时长/);
  const result = await f.deps.seekMusic(120, state.revision, c);
  assert.equal(result.currentTime, 120); assert.equal(f.audio().isPlaying, true);
  f.interrupt(); await assert.rejects(f.deps.seekMusic(100, state.revision, c), /变化/);
});
test('后台队列移除保留当前音频，清空先停止且无法用旧版本重放', async () => {
  const f = playbackFixture(); const c = context(); let state = await f.deps.readMusicState(c);
  state = await f.deps.editMusicQueue('remove', '2', state.revision, c);
  assert.equal(state.count, 1); assert.equal(f.audio().songId, '1'); assert.equal(f.audio().isPlaying, true);
  const revision = state.revision;
  state = await f.deps.editMusicQueue('clear', null, revision, c);
  assert.equal(state.count, 0); assert.equal(state.isPlaying, false); assert.equal(state.currentSongId, null);
  await assert.rejects(f.deps.editMusicQueue('clear', null, revision, c), /变化/);
});
