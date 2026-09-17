const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Tools = require('../js/assistant-tools.js');
const C = require('../js/assistant-contract.js');
const Engine = require('../js/assistant-engine.js');
const Alarm = require('../js/alarm-core.js');
const now = new Date(2030, 4, 10, 10).getTime();
const ctx = (app, adaptive = true) => ({ guard() {}, progress: async () => {}, task: { id: 'task', input: { app }, memory: {}, turns: [], adaptive } });
const exec = (tools, context, tool, args = {}) => tools.execute({ tool, args }, context);
function alarmFixture(rows) {
  let records = rows.map(a => Alarm.normalizeAlarm({ date: '2030-05-12', time: '11:00', label: '开会', enabled: true, ...a }, now));
  let writes = 0;
  const tools = Tools.create({ now: () => now, listAlarms: async () => ({ alarms: structuredClone(records) }), mutateAlarm: async (args, c) => {
    c.guard(); const i = records.findIndex(a => a.id === args.id);
    if (i < 0 || records[i].revision !== args.expectedRevision) throw new Error('提醒已变化');
    writes++;
    if (args.action === 'delete') { records.splice(i, 1); return { ok: true }; }
    if (args.action === 'toggle') { records[i].enabled = args.enabled; records[i].revision++; return { ok: true }; }
    records[i] = { ...args.patch, revision: records[i].revision + 1 }; return { alarm: records[i] };
  } });
  return { tools, records: () => records, writes: () => writes, change() { records[0].revision++; } };
}
test('P1 参数和应用范围严格校验，日期与时间不接受隐式纠正', () => {
  for (const args of [{ ref: 'r1' }, { ref: 'r1', date: '2030-02-30' }, { ref: 'r1', time: '25:00' }, { ref: 'r1', date: '2030-05-12', dayOffset: 1 }]) assert.throws(() => C.validatePlan({ steps: [{ tool: 'alarm.update.prepare', args }] }, 'alarm'));
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'alarm.toggle', args: { ref: 'r1', enabled: 'false' } }] }), /标记/);
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'video.search', args: { platform: 'youtube', query: 'mysql', minSeconds: 60, maxSeconds: 20 } }] }), /时长/);
  assert.doesNotThrow(() => C.validatePlan({ steps: [{ tool: 'tools.load', args: { group: 'video.inspect' } }], continue: true }, 'youtube'));
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'tools.load', args: { group: 'video.inspect' } }], continue: true }, 'music'), /范围/);
  for (const text of ['删除开会提醒', '把开会提醒改到明天', '关闭开会提醒']) assert.equal(C.localPlan({ app: 'alarm', text }), null);
});
test('修改已有提醒先展示前后差异，不新建，确认后保留未改字段', async () => {
  const f = alarmFixture([{ id: 'a', soundId: 'water', snoozeMinutes: 15 }]); const c = ctx('alarm');
  const listed = await exec(f.tools, c, 'alarm.list', { query: '开会' }); const ref = listed.observation.items[0].ref;
  assert.equal(listed.observation.items[0].id, undefined);
  const review = await exec(f.tools, c, 'alarm.update.prepare', { ref, dayOffset: 1, time: '16:30' });
  assert.equal(review.status, 'review'); assert.match(review.message, /修改前.*\n修改后/); assert.equal(f.writes(), 0);
  await f.tools.choose(review.choices[0], c);
  assert.equal(f.records().length, 1); assert.equal(f.records()[0].id, 'a'); assert.equal(f.records()[0].date, '2030-05-11');
  assert.equal(f.records()[0].time, '16:30'); assert.equal(f.records()[0].soundId, 'water'); assert.equal(f.records()[0].snoozeMinutes, 15);
  await assert.rejects(f.tools.choose(review.choices[0], c), /已经应用/); assert.equal(f.writes(), 1);
});
test('同名提醒必须选择；选择第二条只关闭第二条', async () => {
  const f = alarmFixture([{ id: 'a', time: '11:00' }, { id: 'b', time: '12:00' }]); const c = ctx('alarm');
  const result = await exec(f.tools, c, 'alarm.list', { query: '开会' }); assert.equal(result.status, 'waiting');
  const ref = result.observation.items[1].ref;
  await assert.rejects(exec(f.tools, c, 'alarm.toggle', { ref, enabled: false }), /选择/);
  await f.tools.choose(result.choices[1], c);
  await exec(f.tools, c, 'alarm.toggle', { ref, enabled: false });
  assert.equal(f.records()[0].enabled, true); assert.equal(f.records()[1].enabled, false);
});
test('删除必须确认，确认前目标被修改则拒绝；不能跨类型使用引用', async () => {
  const f = alarmFixture([{ id: 'a' }]); const c = ctx('alarm');
  const ref = (await exec(f.tools, c, 'alarm.list')).observation.items[0].ref;
  const review = await exec(f.tools, c, 'alarm.delete.prepare', { ref }); assert.equal(f.writes(), 0);
  f.change(); await assert.rejects(f.tools.choose(review.choices[0], c), /修改|变化/); assert.equal(f.writes(), 0);
  await assert.rejects(exec(f.tools, ctx('alarm'), 'alarm.get', { ref }), /引用/);
});
test('重复提醒不能被单日日期隐式改成一次性，允许只改时刻', async () => {
  const f = alarmFixture([{ id: 'a', repeat: 'weekdays' }]); const c = ctx('alarm');
  const ref = (await exec(f.tools, c, 'alarm.list')).observation.items[0].ref;
  await assert.rejects(exec(f.tools, c, 'alarm.update.prepare', { ref, dayOffset: 1 }), /重复提醒/);
  const review = await exec(f.tools, c, 'alarm.update.prepare', { ref, time: '08:30' });
  await f.tools.choose(review.choices[0], c); assert.equal(f.records()[0].repeat, 'weekdays');
});
test('提醒列表分页只返回本页引用，模糊目标不能绕过选择', async () => {
  const f = alarmFixture(Array.from({ length: 25 }, (_, i) => ({ id: String(i), label: '开会' + i }))); const c = ctx('alarm');
  const result = await exec(f.tools, c, 'alarm.list', { offset: 20, limit: 5 });
  assert.equal(result.observation.total, 25); assert.equal(result.observation.items.length, 5); assert.equal(result.observation.nextOffset, null);
});
const video = (i, duration = '05:00') => ({ bvid: `BV1xx411c7m${String.fromCharCode(65 + i)}`, title: 'MySQL ' + i, author: '课程', duration });
test('B站时长筛选基于真实时长；本页切片不丢候选，翻页保留条件', async () => {
  const calls = []; const tools = Tools.create({ bilibili: async (path, args) => { calls.push(args); return { code: 0, data: { numPages: 2, result: Array.from({ length: 12 }, (_, i) => video(i, i === 0 ? '30:00' : '05:00')) } }; } }); const c = ctx('bilibili');
  const first = await exec(tools, c, 'video.search', { platform: 'bilibili', query: 'MySQL', maxSeconds: 600 });
  assert.equal(first.observation.items.length, 8); assert.ok(first.observation.items.every(v => v.durationSeconds === 300));
  const second = await exec(tools, c, 'video.search.next', { platform: 'bilibili', ref: first.observation.nextRef });
  assert.equal(second.observation.items.length, 3); assert.equal(calls.length, 1);
  await exec(tools, c, 'video.search.next', { platform: 'bilibili', ref: second.observation.nextRef });
  assert.equal(calls[1].keyword, 'MySQL'); assert.equal(calls[1].page, 2);
});
test('YouTube精确时长来自videos接口，翻页令牌不暴露给模型且保留过滤', async () => {
  const calls = []; const ids = ['abcdefghijk', 'bcdefghijkl', 'cdefghijklm'];
  const tools = Tools.create({ youtube: async (resource, args) => { calls.push({ resource, args }); return resource === 'search' ? { nextPageToken: args.pageToken ? null : 'private-page-token', items: ids.map(id => ({ id: { videoId: id }, snippet: { title: '课程' } })) } : { items: [{ id: ids[0], contentDetails: { duration: 'PT5M' } }, { id: ids[1], contentDetails: { duration: 'PT40M' } }] }; } }); const c = ctx('youtube');
  const result = await exec(tools, c, 'video.search', { platform: 'youtube', query: 'mysql', maxSeconds: 600 });
  assert.equal(result.observation.items.length, 1); assert.doesNotMatch(JSON.stringify(result.observation), /private-page-token|abcdefghijk/);
  await exec(tools, c, 'video.search.next', { platform: 'youtube', ref: result.observation.nextRef });
  assert.equal(calls[2].args.pageToken, 'private-page-token'); assert.equal(calls[2].args.q, 'mysql');
});
test('视频详情使用真实引用；未经选择不能打开，重复打开不会再次开页', async () => {
  let opened = 0; const tools = Tools.create({ openURL: async () => { opened++; }, bilibili: async path => path.includes('search') ? { code: 0, data: { result: [video(0)] } } : { code: 0, data: { bvid: video(0).bvid, title: '真实标题', duration: 400, owner: { name: '真实作者' }, pubdate: 1000 } } }); const c = ctx('bilibili');
  const result = await exec(tools, c, 'video.search', { platform: 'bilibili', query: 'mysql' }); const ref = result.observation.items[0].ref;
  const detail = await exec(tools, c, 'video.details', { platform: 'bilibili', ref }); assert.equal(detail.observation.durationSeconds, 400);
  await assert.rejects(exec(tools, c, 'video.open', { platform: 'bilibili', ref }), /选择/);
  await tools.choose(result.choices[0], c);
  await exec(tools, c, 'video.open', { platform: 'bilibili', ref }); assert.equal(opened, 1);
  await assert.rejects(exec(tools, c, 'video.open', { platform: 'bilibili', ref }), /已经打开/);
});
test('无观看记录不伪装成零进度，进度工具拒绝跨平台引用', async () => {
  const tools = Tools.create({ youtube: async () => ({ items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: '课程' } }] }), storage: { get: async () => ({}) } }); const c = ctx('youtube');
  const ref = (await exec(tools, c, 'video.search', { platform: 'youtube', query: 'x' })).observation.items[0].ref;
  const result = await exec(tools, c, 'video.progress.get', { platform: 'youtube', ref }); assert.equal(result.observation.known, false); assert.equal(result.observation.seconds, null);
  await assert.rejects(exec(tools, { ...c, task: { ...c.task, input: { app: null } } }, 'video.details', { platform: 'bilibili', ref }), /平台/);
});
test('音乐清空先确认；状态变化或确认取消不能提交队列编辑', async () => {
  let writes = 0; const state = { revision: 'v1', count: 2, currentSongId: '1', songs: [{ songId: '1' }, { songId: '2' }] };
  const tools = Tools.create({ readMusicState: async () => state, editMusicQueue: async (_action, _songId, rev) => { if (rev !== state.revision) throw new Error('队列已变化'); writes++; return { count: 0 }; } }); const c = ctx('music');
  const result = await exec(tools, c, 'music.queue.clear', { expectedRevision: 'v1' }); assert.equal(result.status, 'review'); assert.equal(writes, 0);
  state.revision = 'v2'; await assert.rejects(tools.choose(result.choices[0], c), /变化/); assert.equal(writes, 0);
});
test('后台提醒CRUD统一串行，旧版本确认不能覆盖新修改', async () => {
  const source = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  const snippet = source.slice(source.indexOf('    let userAlarmSaveQueue ='), source.indexOf('    async function getUserAlarmViewState'));
  let records = [Alarm.normalizeAlarm({ id: 'a', label: '开会', date: '2099-01-01', time: '10:00', revision: 1 })];
  const scope = { AlarmCore: Alarm, loadUserAlarmState: async () => ({ alarms: structuredClone(records), runtime: { pendingSnoozes: [] } }), saveUserAlarmState: async data => { records = structuredClone(data); }, reconcileUserAlarmSchedule: async () => ({}) };
  vm.runInNewContext(snippet + '\nglobalThis.api={saveUserAlarm,toggleUserAlarm,deleteUserAlarm};', scope);
  const responses = await Promise.allSettled([scope.api.toggleUserAlarm('a', false, { expectedRevision: 1 }), scope.api.deleteUserAlarm('a', { expectedRevision: 1 })]);
  assert.equal(responses[0].status, 'fulfilled'); assert.equal(responses[1].status, 'rejected'); assert.equal(records.length, 1); assert.equal(records[0].enabled, false);
  await assert.rejects(scope.api.saveUserAlarm({ id: 'a', label: '旧修改' }, { expectedRevision: 1 }), /修改/);
  assert.equal(records[0].label, '开会');
});
test('按需目录按应用过滤，未知应用只加载简短说明，预算可控', async () => {
  const { plan } = await import('../local-ai/assistant-service.mjs');
  const seen = []; const provider = { generateObject: async x => { seen.push(x); return { question: '需要哪个应用？' }; } };
  await plan({ app: 'alarm', text: '把开会提醒改到明天' }, provider);
  assert.match(seen[0].instructions, /"alarm.update.prepare":/); assert.doesNotMatch(seen[0].instructions, /"music.queue.clear":|"video.details":/);
  const out = await plan({ text: '帮我找点东西' }, provider); assert.ok(out.toolContext.estimatedInputTokens < 6200);
  await assert.rejects(plan({ app: 'music', text: '如果队列可用请处理' }, { generateObject: async () => ({ steps: [{ tool: 'music.queue.clear', args: { expectedRevision: 'v1' } }] }) }), /尚未加载/);
});

test('生产执行器把已有提醒修改停在确认卡，确认后继续后续步骤', async () => {
  const { createGateway } = await import('../local-ai/gateway.mjs');
  const f = alarmFixture([{ id: 'a' }]); let n = 0, ref;
  const gateway = createGateway({ provider: { async generateObject({ input }) {
    if (n++ === 0) return { steps: [{ tool: 'alarm.list', args: { query: '开会' } }], continue: true };
    if (n === 2) { ref = input.observations.at(-1).data.items[0].ref; return { steps: [{ tool: 'alarm.update.prepare', args: { ref, dayOffset: 1, time: '16:30' } }], continue: true }; }
    return { done: true };
  } } });
  const values = {}; const storage = { get: async () => structuredClone(values), set: async p => Object.assign(values, structuredClone(p)), remove: async k => delete values[k] };
  const handlers = { ...f.tools, plan: Tools.create({ ai: async m => ({ ok: true, ...await gateway.run(m.scene, m.input) }) }).plan };
  const engine = Engine.create({ storage, ...handlers, now: () => now, id: () => 't1' });
  await engine.submit({ app: 'alarm', text: '把开会提醒改到明天下午四点半' });
  const review = await engine.settled(); assert.equal(review.status, 'review', review.message); assert.equal(f.writes(), 0);
  await engine.choose(review.id, review.choices[0].id, review.version);
  const done = await engine.settled(); assert.equal(done.status, 'completed', done.message); assert.equal(f.writes(), 1);
});

test('音乐搜索翻页沿用关键词与类型，只用接口给出的总数判断下一页', async () => {
  const calls = []; const tools = Tools.create({ netease: async (path, args) => {
    calls.push({ path, args });
    return { code: 200, result: { playlistCount: 9, playlists: Array.from({ length: args.offset ? 1 : 8 }, (_, i) => ({ id: args.offset + i + 1, name: '张杰歌单' + (args.offset + i) })) } };
  } }); const c = ctx('music');
  const first = await exec(tools, c, 'music.search', { kind: 'playlist', query: '张杰' });
  assert.ok(first.observation.nextRef);
  const second = await exec(tools, c, 'music.search.next', { ref: first.observation.nextRef });
  assert.equal(calls[1].args.offset, 8); assert.equal(calls[1].args.s, '张杰'); assert.equal(calls[1].args.type, 1000);
  assert.equal(second.observation.nextRef, null); assert.equal(second.observation.items.length, 1);
});
test('显式播放器控制参数不会接受额外自由文本，回执返回真实状态', async () => {
  assert.throws(() => C.validatePlan({ steps: [{ tool: 'music.playback.control', args: { action: 'pause', expectedRevision: 'v1', value: .5 } }] }), /value/);
  let paused = false; const tools = Tools.create({ readMusicState: async () => ({ revision: 'v1', isPlaying: !paused }), controlMusic: async intent => { assert.equal(intent.action, 'pause'); paused = true; return { ok: true, message: '已暂停' }; } });
  const result = await exec(tools, ctx('music'), 'music.playback.control', { action: 'pause', expectedRevision: 'v1' }); assert.equal(result.observation.isPlaying, false);
});

test('直播的未知时长不会当作零秒而通过十分钟筛选', async () => {
  const tools = Tools.create({ youtube: async resource => resource === 'search' ? { items: [{ id: { videoId: 'abcdefghijk' }, snippet: { title: '直播', liveBroadcastContent: 'live' } }] } : { items: [{ id: 'abcdefghijk', contentDetails: { duration: 'PT0S' } }] } });
  const result = await exec(tools, ctx('youtube'), 'video.search', { platform: 'youtube', query: 'mysql', maxSeconds: 600 });
  assert.equal(result.observation.items.length, 0);
});
test('待选会话继续翻页时保留真实引用，旧任务点击不能冒用新任务', async () => {
  const values = {}; const storage = { get: async () => structuredClone(values), set: async p => Object.assign(values, structuredClone(p)), remove: async k => delete values[k] }; let id = 0;
  const handlers = Tools.create({ storage, netease: async (path, args) => ({ code: 200, result: { playlistCount: 9, playlists: Array.from({ length: args.offset ? 1 : 8 }, (_, i) => ({ id: args.offset + i + 1, name: '张杰' + i })) } }) });
  const engine = Engine.create({ storage, ...handlers, id: () => 't' + ++id, plan: async (input, context) => input.text === '下一页' ? { steps: [{ tool: 'music.search.next', args: { ref: context.task.observations.at(-1).data.nextRef } }] } : { steps: [{ tool: 'music.search', args: { kind: 'playlist', query: '张杰' } }] } });
  await engine.submit({ app: 'music', text: '搜索张杰歌单' }); const first = await engine.settled();
  await engine.submit({ text: '下一页', taskId: first.id }); const second = await engine.settled();
  assert.equal(second.status, 'waiting', second.message); assert.notEqual(first.id, second.id);
  await assert.rejects(engine.choose(first.id, first.choices[0].id), /过期/);
});
