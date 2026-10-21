import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Contract from '../js/assistant-contract.js';
import Context from '../js/assistant-context-state.js';
import Todo from '../js/assistant-todo.js';
import Native from '../js/assistant-native.js';
import { plan } from '../local-ai/assistant-service.mjs';

function fixture(extra = {}) {
  const values = {}, calls = { read: 0, play: 0, model: 0 };
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  let revision = 'queue-1';
  const state = () => ({ status: 'ready', count: 2, revision, mode: 'shuffle', isPlaying: false, songs: [] });
  const handlers = Tools.create({ storage, readMusicState: async () => { calls.read++; return state(); },
    playCurrentQueue: async (expected) => { assert.equal(expected, revision); calls.play++; return { ...state(), isPlaying: true }; },
    ai: async request => { calls.model++; if (extra.model) return { ok: true, ...await plan(request.input, { generateObject: extra.model }) }; throw new Error('不应调用模型'); }, ...extra.deps });
  const engine = Engine.create({ storage, ...handlers });
  return { engine, calls, values, changeRevision() { revision = 'queue-2'; } };
}
const finish = async (engine, text, extra = {}) => { await engine.submit({ text, ...extra }); return engine.settled(); };
const confirm = async (engine, task) => { await engine.choose(task.id, task.choices[0].id, task.version); return engine.settled(); };

test('桌面随机播放音乐：本轮查状态，确认前零写入，全程零模型；重复请求再次读取和确认', async () => {
  const f = fixture();
  const first = await finish(f.engine, '随机播放音乐', { origin: 'desktop' });
  assert.equal(first.status, 'review', first.message);
  assert.deepEqual(f.calls, { read: 1, play: 0, model: 0 });
  const done = await confirm(f.engine, first);
  assert.equal(done.status, 'completed', done.message);
  assert.equal(done.todoTips.items[0].status, 'completed');
  assert.deepEqual(f.calls, { read: 1, play: 1, model: 0 });
  const second = await finish(f.engine, '随机播放音乐', { origin: 'desktop' });
  assert.equal(second.status, 'review');
  assert.equal(second.conversationId, first.conversationId);
  assert.deepEqual(f.calls, { read: 2, play: 1, model: 0 });
  const stored = f.values[Engine.KEY];
  assert.ok(Context.envelope(stored).receipts.some(row => row.evidence === 'historical'));
  assert.ok(stored.observations.every(row => row.goalId === stored.goalId));
});

test('确认后资源改变、重复点击、取消均不能提交过时或重复播放', async () => {
  const f = fixture();
  const review = await finish(f.engine, '随机播放音乐', { origin: 'desktop' });
  f.changeRevision();
  const done = await confirm(f.engine, review);
  assert.notEqual(done.status, 'completed'); assert.equal(f.calls.play, 0);
  await assert.rejects(f.engine.choose(review.id, review.choices[0].id, review.version));
  const other = fixture();
  const r = await finish(other.engine, '随机播放音乐', { origin: 'desktop' });
  await other.engine.cancel(r.id, r.version);
  await assert.rejects(other.engine.choose(r.id, r.choices[0].id, r.version));
  assert.equal(other.calls.play, 0);
});

test('绕过短句规则：模型过早done先投影只读补查，再确认真实播放；不借旧状态完成', async () => {
  let rounds = 0;
  const f = fixture({ model: async request => {
    if (request.input.planningPhase === 'outline') return { todoTips: [{ text: '随机起播', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }] };
    if (rounds++ === 0) return { done: true };
    if (request.input.todoTips.items[0].status === 'completed') return { done: true };
    return { steps: [{ tool: 'music.queue.play', args: { expectedRevision: 'queue-1', mode: 'shuffle' } }], continue: true };
  } });
  const r = await finish(f.engine, '@音乐 请用随机顺序开始当前队列里的音乐', { origin: 'desktop' });
  assert.equal(r.status, 'review', r.message); assert.equal(f.calls.read, 1); assert.equal(f.calls.play, 0);
  const d = await confirm(f.engine, r);
  assert.equal(d.status, 'completed', d.message); assert.equal(f.calls.play, 1);
  assert.equal(d.recoveryCount, 0);
});

test('补查只有一次；查询不能验收播放，unknown不投影新动作', async () => {
  const input = Contract.input({ app: 'music', text: '以随机顺序起播队列' });
  const todoTips = Todo.create(input);
  Todo.install(todoTips, [{ text: '随机起播', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }], 'music');
  const body = { ...input, todoTips, planningPhase: 'execute' };
  const provider = { generateObject: async () => ({ done: true }) };
  const first = await plan(body, provider);
  assert.equal(first.toolContext.evidenceRecovery, 'todo-incomplete:music.state');
  for (const observation of [
    { tool: 'music.state', status: 'done', message: '正在播放', data: { revision: 'r1', status: 'ready', isPlaying: true } },
    { tool: 'music.state', status: 'failed', message: '失败', data: null },
    { tool: 'music.queue.play', status: 'unknown', message: '回执未知', data: null }
  ]) await assert.rejects(plan({ ...body, observations: [observation] }, provider), e => e.planIssue === 'todo-incomplete');
});

test('通用问答不继承音乐范围，一次模型回答，无写入；动作不能伪装为回答', async () => {
  const f = fixture({ model: async () => ({ answer: '前缀缓存复用相同输入的计算结果，能减少重复预填充。' }) });
  await finish(f.engine, '随机播放音乐');
  const reply = await finish(f.engine, '解释前缀缓存的作用', { origin: 'desktop' });
  assert.equal(reply.status, 'completed', reply.message); assert.equal(reply.input.app, null);
  assert.equal(reply.result.kind, 'answer'); assert.equal(f.calls.model, 1); assert.equal(f.calls.play, 1);
  for (const text of ['读取我的文件并分析', '发送消息给小张', '随机播放音乐', '解释我的当前队列', '分析最新新闻']) {
    const input = Contract.input({ text });
    await assert.rejects(plan({ ...input, todoTips: Todo.create(input), planningPhase: 'outline' }, { generateObject: async () => ({ answer: '已经完成。' }) }));
  }
  assert.throws(() => Contract.validatePlan({ answer: '已播放音乐' }));
});

test('桌面任务创建也在真实存储写入前确认，不重复两张卡', async () => {
  const f = fixture({ model: async request => request.input.planningPhase === 'outline' ? { todoTips: [{ text: '添加任务', source: 0, tool: 'task.create', args: {} }] } : request.input.todoTips.items[0].status === 'completed' ? { done: true } : { steps: [{ tool: 'task.create', args: { title: '检查缓存' } }] } });
  const r = await finish(f.engine, '@任务 添加任务：检查缓存', { origin: 'desktop' });
  assert.equal(r.status, 'review', r.message); assert.equal(f.values.memos, undefined);
  const d = await confirm(f.engine, r);
  assert.equal(d.status, 'completed', d.message); assert.equal(f.values.memos.length, 1);
});

test('目录只投影当前注册能力，连接内只发一次；新需求显式布尔白名单', async () => {
  const c = Native.catalog(); assert.equal(c.apps.length, 6); assert.deepEqual(c.actions.map(row => row.id), Contract.skills.map(row => row.id));
  let catalogs = 0, submitted;
  const desktop = { port: {}, async setAssistantState() { return { assistantCatalog: 1 }; }, async setAssistantCatalog(value) { catalogs++; assert.deepEqual(value, c); } };
  const native = Native.create({ desktop, engine: { async submit(value) { submitted = value; }, async snapshot() { return null; } }, jelly: { assistantEnabled: async () => true } });
  await native.sync(null); await native.sync(null); assert.equal(catalogs, 1);
  assert.equal((await native.handle({ action: 'submit', text: '@音乐 随机播放', newConversation: true })).ok, true);
  assert.equal(submitted.newConversation, true); assert.equal(submitted.app, undefined);
  assert.equal((await native.handle({ action: 'submit', text: '你好', newConversation: 'true' })).ok, false);
});

test('纯解释提示省去工具目录且拒绝额外目标，分析仍保留能力目录', async () => {
  const explanation = Contract.input({ text: '解释前缀缓存为什么能减少重复计算' });
  const body = { ...explanation, todoTips: Todo.create(explanation), planningPhase: 'outline' };
  await plan(body, { generateObject: async request => {
    assert.ok(request.instructions.length < 600); assert.doesNotMatch(request.instructions, /music.queue.play/);
    return { answer: '重复前缀可以复用先前计算。' };
  } });
  await assert.rejects(plan(body, { generateObject: async () => ({ todoTips: [{ text: '播放', source: 0, tool: 'music.queue.play', args: {} }] }) }), e => e.planIssue === 'plan-phase');
  const analysis = Contract.input({ text: '分析这些数字：1、2、3的平均数' });
  await plan({ ...analysis, todoTips: Todo.create(analysis), planningPhase: 'outline' }, { computeEnabled: true, generateObject: async request => {
    assert.match(request.instructions, /compute.run/); return { answer: '平均数是2。' };
  } });
});

test('取消后的通用回答被丢弃，不覆盖取消状态', async () => {
  let release, started;
  const waiting = new Promise(resolve => { started = resolve; });
  const f = fixture({ model: async () => { started(); return new Promise(resolve => { release = resolve; }); } });
  await f.engine.submit({ text: '解释缓存', origin: 'desktop' }); await waiting;
  const t = await f.engine.snapshot(); await f.engine.cancel(t.id);
  release({ answer: '这个迟到回答不能覆盖取消状态。' });
  const stopped = await f.engine.settled(); assert.equal(stopped.status, 'cancelled'); assert.doesNotMatch(stopped.message, /迟到回答/);
});

test('桌面视频候选直接选择也先确认；确认后才打开一次', async () => {
  const values = {}; let opens = 0;
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); } };
  const handlers = Tools.create({ openVideo: async () => { opens++; return { opened: true, destination: 'app' }; } });
  const choice = { id: 'video-1', title: '测试视频', action: 'video.open', data: { platform: 'youtube', id: 'abcdefghijk', title: '测试视频' } };
  const engine = Engine.create({ storage, choose: handlers.choose, plan: async () => ({ steps: [{ tool: 'video.search', args: { platform: 'youtube', query: '测试' } }] }),
    execute: async () => ({ status: 'waiting', message: '请选择视频', choices: [choice] }) });
  const t = await finish(engine, '@YouTube 找视频', { origin: 'desktop' });
  const r = await confirm(engine, t); assert.equal(r.status, 'review'); assert.equal(opens, 0);
  const done = await confirm(engine, r); assert.equal(done.status, 'completed', done.message); assert.equal(opens, 1);
});
