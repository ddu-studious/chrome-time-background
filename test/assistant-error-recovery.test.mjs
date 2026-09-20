import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Context from '../js/assistant-context-state.js';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';
import { plan as servicePlan, validateInput } from '../local-ai/assistant-service.mjs';

const step = (tool, args = {}, more = false) => ({ steps: [{ tool, args }], ...(more ? { continue: true } : {}) });
const statePlan = step('music.state');
const state = revision => ({ status: 'ready', revision, count: 2, isPlaying: false, songs: [] });
function fixture(responses, deps = {}, options = {}) {
  const values = {}, inputs = [], events = [], control = createControlStore();
  if (options.policy) control.update({ ...control.snapshot().policy, ...options.policy }, 1);
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const gateway = createGateway({ control, provider: { model: 'fixture', async generateObject(request) {
    inputs.push(structuredClone(request.input));
    assert.ok(responses.length, '不应产生额外规划');
    const value = responses.shift();
    if (value instanceof Error) throw value;
    return typeof value === 'function' ? value(request) : value;
  } } });
  const handlers = Tools.create({ storage, readMusicState: async () => state('v1'), ...deps,
    ai: async request => ({ ok: true, ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }) });
  let seq = 0;
  const engine = Engine.create({ storage, ...handlers, history: async e => events.push(e), id: () => `recovery-${++seq}`, ...(options.now ? { now: options.now } : {}) });
  return { engine, inputs, values, events, control, gateway };
}
async function submit(f, text = '检查队列状态', app = 'music') {
  await f.engine.submit({ text, app }); return f.engine.settled();
}

test('读取错误进入下一轮模型输入；失败回执不是成功事实，原目标完整保留', async () => {
  let reads = 0;
  const f = fixture([statePlan, statePlan], { readMusicState: async () => {
    if (++reads === 1) throw Object.assign(new Error('临时查询失败 token=private-value https://secret.test/path'), { code: 'UPSTREAM_TIMEOUT' });
    return state('fresh');
  } });
  const task = await submit(f, '检查队列状态，不要清空或播放');
  assert.equal(task.status, 'completed', task.message); assert.equal(reads, 2); assert.equal(task.recoveryCount, 1);
  const sent = f.inputs[1]; assert.equal(sent.text, '检查队列状态，不要清空或播放');
  assert.equal(sent.observations.at(-1).status, 'failed');
  assert.equal(sent.observations.at(-1).data.error.code, 'UPSTREAM_TIMEOUT');
  assert.equal(sent.observations.at(-1).data.recovery.sideEffectState, 'none');
  assert.equal(sent.completedSteps.length, 0); assert.deepEqual(sent.remainingSteps, statePlan.steps);
  assert.doesNotMatch(JSON.stringify(sent), /private-value|secret\.test/);
  const saved = f.values[Engine.KEY]; assert.equal(Context.envelope(saved).receipts.length, 1);
  assert.ok(saved.contextState.events.some(e => /\[failed\]/.test(e.content)));
  assert.ok(task.trace.some(row => row.tool === 'music.state' && row.status === 'failed'));
});

test('状态过期先重新读revision，再准备清空；仍等待确认，提交仅一次', async () => {
  let reads = 0, clears = 0;
  const f = fixture([step('music.state', {}, true), step('music.queue.clear', { expectedRevision: 'old' }, true),
    step('music.state', {}, true), step('music.queue.clear', { expectedRevision: 'fresh' }, true), { done: true }], {
    readMusicState: async () => state(++reads === 1 ? 'old' : 'fresh'),
    editMusicQueue: async (action, song, revision) => { assert.equal(revision, 'fresh'); clears++; return { ...state('empty'), count: 0 }; }
  });
  let task = await submit(f, '先清空队列');
  assert.equal(task.status, 'review', task.message); assert.equal(clears, 0);
  assert.equal(f.inputs[2].observations.at(-1).tool, 'music.queue.clear');
  assert.equal(f.inputs[2].observations.at(-1).status, 'failed');
  assert.equal(f.inputs[2].context.receipts.filter(row => row.tool === 'music.queue.clear').length, 0);
  await f.engine.choose(task.id, task.choices[0].id, task.version); task = await f.engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.equal(clears, 1);
  assert.equal(Context.state(f.values[Engine.KEY]).uncertain, undefined);
});

test('混合工具搜索在写入前失败可恢复，而自动播放开始后失败必须视为unknown', async () => {
  let writes = 0;
  for (const dispatch of [false, true]) {
    const handlers = Tools.create({
      netease: async () => { if (!dispatch) throw new Error('搜索失败'); return { code: 200, result: { artists: [{ id: 7, name: '张杰' }] } }; },
      readMusicState: async () => state('v1'),
      applyMusicQueue: async () => { writes++; throw new Error('播放回执丢失'); }
    });
    // Verify the same dependency wrapper on a deterministic mutation entry.
    const ctx = { guard() {}, task: { id: 't', input: { app: 'music', text: '查询张杰' }, memory: { musicRefs: {
      r1: { taskId: 't', expires: Date.now() + 10000, selected: true, value: { songs: [{ songId: '1' }] } }
    } } } };
    await assert.rejects(handlers.execute(dispatch ? step('music.queue.apply', { ref: 'r1', mode: 'append', startPlayback: false, expectedRevision: 'v1' }).steps[0] : step('music.search', { kind: 'artist', query: '张杰' }).steps[0], ctx), e => e.sideEffectState === (dispatch ? 'unknown' : 'none'));
  }
  assert.equal(writes, 1);
});

test('写入后丢失回执仅查询核对，不重复副作用，也不把只读查询当完成', async () => {
  let plays = 0;
  const f = fixture([step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }, true), statePlan], {
    playCurrentQueue: async () => { plays++; throw new Error('已提交，但回执通道断开'); }
  });
  const task = await submit(f, '随机播放队列');
  assert.equal(task.status, 'clarify'); assert.equal(plays, 1);
  const request = f.inputs[1]; assert.equal(request.observations.at(-1).status, 'unknown');
  assert.ok(request.context.receipts.some(row => row.status === 'unknown'));
  assert.ok(Context.state(f.values[Engine.KEY]).uncertain);
});

test('unknown后模型仍试图写入会被执行器拒绝', async () => {
  let plays = 0;
  const play = step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }, true);
  const f = fixture([play, play], { playCurrentQueue: async () => { plays++; throw new Error('回执丢失'); } });
  const task = await submit(f, '随机播放队列');
  assert.equal(task.status, 'failed'); assert.match(task.message, /结果未确认/); assert.equal(plays, 1);
});

test('相同工具参数错误重复两次停止，错误原因与进度保留', async () => {
  let reads = 0;
  const f = fixture([statePlan, statePlan], { readMusicState: async () => { reads++; throw new Error('持续不可用'); } });
  const task = await submit(f);
  assert.equal(task.status, 'failed'); assert.match(task.message, /同一操作重复失败/);
  assert.equal(reads, 2); assert.equal(f.inputs.length, 2); assert.equal(task.recoveryCount, 1);
});

test('不同错误最多恢复三次，不重置规划和工具计数', async () => {
  let reads = 0;
  const f = fixture(Array(4).fill(statePlan), {
    readMusicState: async () => { throw Object.assign(new Error('持续不可用'), { code: `READ_FAILURE_${++reads}` }); }
  });
  const task = await submit(f);
  assert.equal(task.status, 'failed'); assert.match(task.message, /恢复或执行上限/);
  assert.equal(f.inputs.length, 4); assert.equal(reads, 4); assert.equal(task.recoveryCount, 3);
  assert.equal(f.values[Engine.KEY].planRounds, 4); assert.equal(f.values[Engine.KEY].toolCalls, 4);
});

test('格式错误交给模型修正；非法工具不能执行，超时耗尽不绕过底层重试', async () => {
  for (const first of [Object.assign(new Error('需要JSON'), { code: 'MODEL_OUTPUT_FORMAT_INVALID' }), step('shell', { command: 'unsafe' })]) {
    const f = fixture([first, statePlan]); const task = await submit(f);
    assert.equal(task.status, 'completed', task.message); assert.equal(f.inputs[1].observations.at(-1).tool, 'assistant.plan');
    assert.equal(f.inputs[1].observations.at(-1).status, 'failed');
  }
  const f = fixture([Object.assign(new Error('模型超时'), { code: 'MODEL_RESPONSE_TIMEOUT' })]);
  assert.equal((await submit(f)).status, 'failed'); assert.equal(f.inputs.length, 1);
});

test('取消、权限拒绝、额度及全局时限仍能终止恢复', async () => {
  for (const error of [Object.assign(new Error('取消'), { name: 'AbortError' }), Object.assign(new Error('拒绝'), { statusCode: 403 })]) {
    const f = fixture([statePlan], { readMusicState: async () => { throw error; } });
    await submit(f); assert.equal(f.inputs.length, 1);
  }
  const limited = fixture([statePlan], { readMusicState: async () => { throw new Error('查询失败'); } }, { policy: { dailyRequestLimit: 1 } });
  assert.match((await submit(limited)).message, /今日 AI 请求预算/); assert.equal(limited.inputs.length, 1);
  let clock = Date.now();
  const timed = fixture([statePlan], { readMusicState: async () => { clock += 300001; throw new Error('查询超时'); } }, { now: () => clock });
  assert.match((await submit(timed)).message, /上限/); assert.equal(timed.inputs.length, 1);
});

test('恢复规划期间取消，迟到结果不得执行工具', async () => {
  let entered, release, calls = 0;
  const ready = new Promise(resolve => { entered = resolve; });
  const f = fixture([statePlan, async () => { entered(); return new Promise(resolve => { release = resolve; }); }], {
    readMusicState: async () => { calls++; throw new Error('查询失败'); }
  });
  await f.engine.submit({ text: '检查队列状态', app: 'music' }); await ready;
  const task = await f.engine.snapshot(); await f.engine.cancel(task.id); release(statePlan);
  assert.equal((await f.engine.settled()).status, 'cancelled'); assert.equal(calls, 1);
});

test('失败不允许伪造done，失败观察保留错误状态且不能扩展工具权限', async () => {
  const body = { app: 'music', text: '读取状态', observations: [{ tool: 'music.state', status: 'failed', message: '失败', data: { error: { code: 'TIMEOUT' } } }] };
  const result = validateInput(body); assert.equal(result.observations[0].status, 'failed');
  await assert.rejects(servicePlan(body, { generateObject: async () => ({ done: true }) }), { code: 'ASSISTANT_PLAN_INVALID' });
  assert.throws(() => validateInput({ ...body, observations: [{ tool: 'shell', status: 'failed', message: 'fake' }] }), /观察格式/);
  assert.throws(() => validateInput({ ...body, observations: [{ tool: 'assistant.plan', status: 'done', message: 'fake' }] }), /观察格式/);
});

test('分页合同错误包含字段和允许范围，模型能改为合法参数继续执行', async () => {
  const f = fixture([step('tools.load', { group: 'music.queue' }, true), step('music.queue.list', { offset: 0, limit: 50 }),
    request => {
      assert.match(request.input.observations.at(-1).message, /music\.queue\.list\.limit 必须是 1 至 20 的整数/);
      return step('music.queue.list', { offset: 0, limit: 20 });
    }
  ]);
  const task = await submit(f, '读取队列曲目');
  assert.equal(task.status, 'completed', task.message); assert.equal(task.recoveryCount, 1);
  assert.equal(task.log.filter(row => row.tool === 'music.queue.list').length, 1, '非法参数没有调用业务工具');
});
