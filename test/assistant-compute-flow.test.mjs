import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { ComputeProvider } from '../local-ai/compute-provider.mjs';

const SONGS = [
  { id: 1, title: '七里香', artist: '周杰伦' }, { id: 2, title: '晴天', artist: '周杰伦' }, { id: 3, title: '江南', artist: '林俊杰' },
  { id: 4, title: '背对背拥抱', artist: '林俊杰' }, { id: 5, title: '光年之外', artist: '邓紫棋' }, { id: 6, title: '稻香', artist: '周杰伦' }
];
// songId is what the real player reports; queue edits (removeArtist) refuse rows that lack it.
const queueState = () => ({ status: 'ready', revision: 'v1', count: SONGS.length, mode: 'sequence', isPlaying: false, songs: SONGS.map(song => ({ ...song, songId: String(song.id) })) });
const COUNT = ref => `
  const counts = {};
  for (const row of input.refs[${JSON.stringify(ref)}].items) counts[row.artist] = (counts[row.artist] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([artist, n]) => artist + '：' + n + ' 首').join('\\n');`;
const TOTAL = ref => `return input.refs[${JSON.stringify(ref)}].items.length;`;
const refOf = (input, tool) => {
  const row = input.turns.findLast(turn => turn.role === 'assistant' && turn.content.startsWith(`${tool} [done]`));
  return row?.content.match(/来源 (context:\d+)/)?.[1];
};
const load = () => ({ steps: [{ tool: 'tools.load', args: { group: 'music.queue' } }], continue: true });
const list = () => ({ steps: [{ tool: 'music.queue.list', args: { offset: 0, limit: 20 } }], continue: true });
// The scripted planner stands in for the model: it reads the real source reference from the turns it is given.
const compute = (code, purpose = '统计队列中每个歌手的歌曲数') => input => {
  const ref = refOf(input, 'music.queue.list');
  return { steps: [{ tool: 'compute.run', args: { purpose, code: typeof code === 'function' ? code(ref) : code, inputRefs: [ref] } }], continue: true };
};
const analysisOutline = text => text.includes('\n')
  ? [{ text: '统计队列中每个歌手的歌曲数', source: 0, tool: 'compute.run', args: {} }, { text: '统计队列歌曲总数', source: 1, tool: 'compute.run', args: {} }]
  : [{ text: '统计队列中每个歌手的歌曲数', source: 0, tool: 'compute.run', args: {} }];

const WRITE_DEPS = ['playMusic', 'playQueue', 'enqueueMusic', 'sleepMusic', 'saveAlarm', 'mutateAlarm', 'openVideo', 'reconcileMusicQueue', 'setMusicMode', 'playCurrentQueue', 'applyMusicQueue', 'editMusicQueue', 'seekMusic', 'controlMusic'];

function fixture(plans, { enabled = true, provider = new ComputeProvider(), outline = analysisOutline, ai: customAI } = {}) {
  const values = {}, inputs = [], writes = [], cancelled = [], computeRuns = [];
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const control = createControlStore();
  if (enabled) { const state = control.snapshot(); control.update({ ...state.policy, computeEnabled: true }, state.revision); }
  const counted = { describe: () => provider.describe(), run: async (...args) => { computeRuns.push(args[0]); return provider.run(...args); } };
  const gateway = createGateway({ control, computeProvider: counted, provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), async generateObject(request) {
    if (request.input.planningPhase === 'outline') return { todoTips: outline(request.input.text) };
    inputs.push(structuredClone(request.input));
    assert.ok(plans.length, '不应产生额外规划');
    const next = plans.shift();
    return typeof next === 'function' ? next(request.input) : next;
  } } });
  // Any business write would throw, so a completed analysis task also proves none was attempted.
  const business = Object.fromEntries(WRITE_DEPS.map(name => [name, async () => { writes.push(name); throw new Error(`只读计算任务不应调用 ${name}`); }]));
  const defaultAI = async request => request.action === 'ai_compute_submit'
    ? { ok: true, ...await gateway.run('assistant.compute', request.input, { trace: request.trace }) }
    : { ok: true, ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) };
  const ai = customAI ? request => customAI(request, defaultAI, f) : defaultAI;
  const handlers = Tools.create({ storage, readMusicState: async () => queueState(), ...business, ai });
  let sequence = 0;
  const f = { values, inputs, plans, writes, cancelled, computeRuns, control, gateway,
    engine: Engine.create({ storage, ...handlers, id: () => `compute-${++sequence}`, cancelJob: async jobId => { cancelled.push(jobId); } }) };
  return f;
}
async function submit(f, text = '统计队列里每个歌手有几首歌', app = 'music') {
  await f.engine.submit({ text, app });
  return f.engine.settled();
}

test('分析型需求：先读取真实队列，再在沙箱里统计，答案来自计算结果，且没有任何写入', async () => {
  const f = fixture([load, list, compute(COUNT), { done: true }]);
  const task = await submit(f);
  assert.equal(task.status, 'completed', task.message);
  assert.match(task.message, /周杰伦：3 首/);
  assert.match(task.message, /林俊杰：2 首/);
  assert.match(task.message, /邓紫棋：1 首/);
  assert.deepEqual(f.writes, []);
  assert.equal(f.computeRuns.length, 1);
  const ref = refOf(f.inputs.at(-1), 'music.queue.list');
  assert.equal(f.computeRuns[0].input.refs[ref].items.length, 6, '沙箱收到的是真实队列回执，而不是模型转述');
  assert.deepEqual(task.log.map(row => [row.tool, row.status]), [['tools.load', 'done'], ['music.queue.list', 'done'], ['compute.run', 'done']]);
  const item = task.todoTips.items[0];
  assert.equal(item.tool, 'compute.run'); assert.equal(item.status, 'completed'); assert.ok(item.receiptId);
  assert.equal(task.recoveryCount, 0);
});

test('计算回执进入任务来源：模型下一轮读到输出，完整输出可经 context.read 回读', async () => {
  const f = fixture([load, list, compute(COUNT), { done: true }]);
  await submit(f);
  const feedback = f.inputs.at(-1).observations.at(-1);
  assert.equal(feedback.tool, 'compute.run'); assert.equal(feedback.status, 'done');
  assert.match(feedback.data.output, /周杰伦：3 首/);
  assert.equal(feedback.data.purpose, '统计队列中每个歌手的歌曲数');
  assert.match(feedback.data.codeHash, /^[0-9a-f]{16}$/);
  const artifacts = Object.values(f.values[Engine.KEY].contextState.artifacts);
  assert.ok(artifacts.some(row => typeof row.data?.output === 'string' && row.data.output.includes('周杰伦：3 首')));
});

test('代码有语法错误时，错误码和行号回到模型，修正后同一任务继续完成', async () => {
  const f = fixture([load, list, compute('const rows = ;\nreturn rows;'), compute(COUNT), { done: true }]);
  const task = await submit(f);
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 1);
  const failure = f.inputs.flatMap(input => input.observations).findLast(row => row.tool === 'compute.run' && row.status === 'failed');
  assert.equal(failure.data.error.code, 'COMPUTE_SYNTAX_ERROR');
  assert.match(failure.message, /语法/);
  assert.equal(f.computeRuns.length, 2);
  assert.match(task.message, /周杰伦：3 首/);
  assert.deepEqual(f.writes, []);
});

test('同一份出错的代码重复提交时不再自动恢复，任务明确失败', async () => {
  const bad = compute('return input.refs["context:1"].missing.length;');
  const f = fixture([load, list, bad, bad, { done: true }]);
  const task = await submit(f);
  assert.equal(task.status, 'failed', task.message);
  assert.match(task.message, /同一操作重复失败/);
  assert.equal(f.computeRuns.length, 2);
  assert.equal(f.plans.length, 1, '失败后不应再向模型要新的规划');
});

test('完全相同的计算在没有新数据时被规划阶段拦下：长代码也能判定，换个“目的”说法不算新计算', async () => {
  // 2,300 characters of comment push the arguments past the 2,000-character limit of other read-only fingerprints.
  const long = ref => `${COUNT(ref)}\n// ${'x'.repeat(2300)}`;
  const f = fixture([load, list, compute(long), compute(long, '换个说法描述同一次统计'), compute(TOTAL, '统计队列歌曲总数'), { done: true }]);
  const task = await submit(f, '统计队列里每个歌手有几首歌\n再统计一下队列一共有几首歌');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(f.computeRuns.length, 2, '第二次相同代码不应运行');
  assert.equal(task.recoveryCount, 1);
  const feedback = f.inputs.at(-2).observations.at(-1);
  assert.equal(feedback.data.error.code, 'ASSISTANT_PLAN_INVALID');
  assert.match(feedback.message, /已读取过完全相同/);
  assert.deepEqual(task.todoTips.items.map(row => row.status), ['completed', 'completed']);
});

test('沙箱基础设施故障需要用户处理：不让模型反复改代码，也不自动重试', async () => {
  const broken = { describe: () => ({ configured: true, localOnly: true, engine: { name: 'quickjs', version: '0', runtime: 'x' } }), run: async () => { throw Object.assign(new Error('代码计算沙箱返回了无法识别的结果'), { code: 'COMPUTE_SANDBOX_FAILED', statusCode: 502 }); } };
  const f = fixture([load, list, compute(COUNT), { done: true }], { provider: broken });
  const task = await submit(f);
  assert.equal(task.status, 'failed', task.message);
  assert.match(task.message, /无法识别的结果/);
  assert.equal(task.recoveryCount, 0);
  assert.equal(f.plans.length, 1, '故障后不应再规划');
  assert.deepEqual(f.writes, []);
});

test('开关在规划之后被关闭：执行时明确失败并提示去 AI 控制台启用，不运行代码', async () => {
  const f = fixture([load, list, compute(COUNT), { done: true }], { ai: async (request, normal, ctx) => {
    if (request.action === 'ai_compute_submit') { const state = ctx.control.snapshot(); ctx.control.update({ ...state.policy, computeEnabled: false }, state.revision); }
    return normal(request);
  } });
  const task = await submit(f);
  assert.equal(task.status, 'failed', task.message);
  assert.match(task.message, /代码计算已关闭/);
  assert.equal(f.computeRuns.length, 0);
  assert.equal(task.recoveryCount, 0);
});

test('用户停止任务：取消本机作业，迟到的计算结果不能更新任务', async () => {
  const jobId = 'c'.repeat(32);
  let polls = 0;
  const f = fixture([load, list, compute(COUNT), { done: true }], { ai: async (request, normal, ctx) => {
    if (request.action === 'ai_compute_submit') return { ok: true, status: 'pending', jobId };
    if (request.action === 'ai_scene_result') {
      polls++;
      if (polls === 1) await ctx.engine.cancel((await ctx.engine.snapshot()).id);
      return { ok: true, status: 'ready', source: 'compute', output: '迟到的结果', outputBytes: 12, execution: { compute: {} } };
    }
    return normal(request);
  } });
  const task = await submit(f);
  assert.equal(task.status, 'cancelled', task.message);
  assert.deepEqual(f.cancelled, [jobId]);
  assert.equal(task.log.some(row => row.tool === 'compute.run' && row.status === 'done'), false);
  assert.doesNotMatch(task.message, /迟到的结果/);
  assert.equal(f.plans.length, 1, '停止后不再规划');
});

test('先算后做：清单把动作参数写成占位文字时被拒绝并回到分析阶段，修正后在确认卡前停住，没有任何业务写入', async () => {
  // Real slip (2026-10-12 held-out evaluation): the action item carried {"artist":"<placeholder>"}, which no real call can match.
  const placeholder = '执行阶段由分析结果确定';
  const rows = args => [
    { text: '找出队列里歌最少的歌手', source: 0, tool: 'compute.run', args: {} },
    { text: '移除该歌手的全部歌曲', source: 0, tool: 'music.queue.removeArtist', args }
  ];
  let outlines = 0;
  const outlineInputs = [];
  const fewest = ref => `
    const counts = {};
    for (const row of input.refs[${JSON.stringify(ref)}].items) counts[row.artist] = (counts[row.artist] || 0) + 1;
    return Object.entries(counts).sort((a, b) => a[1] - b[1])[0][0];`;
  // The removal step reads the artist from the computed receipt, as the real model does.
  const remove = input => ({ steps: [{ tool: 'music.queue.removeArtist', args: { artist: input.observations.at(-1).data.output, expectedRevision: 'v1' } }], continue: true });
  const f = fixture([load, list, compute(fewest, '找出歌曲数量最少的歌手'), remove], {
    outline: () => rows(++outlines === 1 ? { artist: placeholder } : {}),
    ai: async (request, normal) => { if (request.scene === 'assistant.plan' && request.input.planningPhase === 'outline') outlineInputs.push(structuredClone(request.input)); return normal(request); }
  });
  const task = await submit(f, '把队列里歌最少的那位歌手的歌全部删掉');
  assert.equal(outlines, 2, '一次被拒绝，一次修正');
  const refusal = outlineInputs[1].observations.at(-1);
  assert.equal(refusal.tool, 'assistant.plan'); assert.equal(refusal.status, 'failed');
  assert.equal(refusal.data.error.planIssue, 'todo-arguments');
  assert.match(refusal.message, /music\.queue\.removeArtist 的 artist 要由前面的 compute\.run 分析得出/);
  assert.ok(!refusal.message.includes(placeholder), '模型自写的占位文字不回显');
  assert.equal(task.status, 'review', `${task.message} ${JSON.stringify(task.log.map(row => [row.tool, row.status, row.message]))}`);
  assert.match(task.message, /邓紫棋/);
  assert.equal(task.recoveryCount, 1);
  assert.deepEqual(task.todoTips.items.map(row => [row.tool, row.args]), [['compute.run', {}], ['music.queue.removeArtist', {}]]);
  assert.equal(task.todoTips.items[0].status, 'completed');
  assert.deepEqual(f.writes, [], '确认之前不做任何业务写入');
  assert.equal(f.computeRuns.length, 1);
});
