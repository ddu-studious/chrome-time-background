import test from 'node:test';
import assert from 'node:assert/strict';
import Tools from '../js/assistant-tools.js';
import Context from '../js/assistant-context-state.js';
import Alarm from '../js/alarm-core.js';

const NOW = Date.UTC(2026, 9, 12, 4, 30, 0);
const JOB = 'a'.repeat(32);
const ready = (output, extra = {}) => ({ ok: true, status: 'ready', source: 'compute', output, outputBytes: Buffer.byteLength(JSON.stringify(output)), execution: { compute: { codeHash: 'abcd1234', elapsedMs: 17 } }, ...extra });

function harness({ artifacts = {}, ai, now = () => NOW, app = 'music' } = {}) {
  const task = { id: 'task-1', version: 1, input: { text: '统计队列', app }, turns: [], log: [], startedAt: NOW, runStartedAt: NOW };
  const refs = {};
  for (const [tool, data] of Object.entries(artifacts)) {
    Context.observe(task, { tool, status: 'done', message: `${tool} 完成`, data });
    refs[tool] = Object.keys(Context.state(task).artifacts).at(-1);
  }
  const calls = [], tracked = [];
  const deps = { now, ai: async request => { calls.push(structuredClone(request)); return ai ? ai(request, calls) : ready('ok'); } };
  const handlers = Tools.create(deps);
  const ctx = { task, guard() {}, async trackJob(id) { tracked.push(id); }, async progress() {}, async modelCall() { throw new Error('只读计算不是模型调用，不应登记'); }, spanId: 'span-1' };
  return { task, refs, calls, tracked, ctx, run: (args, over = {}) => handlers.execute({ tool: 'compute.run', args }, { ...ctx, ...over }) };
}
const QUEUE = { status: 'ready', count: 2, items: [{ title: 'A', artist: '甲' }, { title: 'B', artist: '乙' }] };

test('compute.run 把所选回执原样交给沙箱并附带时间信息，只发送代码与输入，不带模型选择', async () => {
  const h = harness({ artifacts: { 'music.queue.list': QUEUE }, ai: async () => ready('甲：1 首\n乙：1 首') });
  const ref = h.refs['music.queue.list'];
  const outcome = await h.run({ purpose: '统计每个歌手的歌曲数', code: 'return "甲：1 首\\n乙：1 首";', inputRefs: [ref] });
  assert.equal(h.calls.length, 1);
  const [call] = h.calls;
  assert.deepEqual(Object.keys(call).sort(), ['action', 'input', 'trace']);
  assert.equal(call.action, 'ai_compute_submit');
  assert.deepEqual(Object.keys(call.input).sort(), ['code', 'input']);
  assert.equal(call.input.code, 'return "甲：1 首\\n乙：1 首";');
  assert.deepEqual(call.input.input.refs, { [ref]: QUEUE });
  assert.equal(call.input.input.now, NOW);
  assert.match(call.input.input.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(call.input.input.utcOffsetMinutes, -new Date(NOW).getTimezoneOffset());
  assert.equal(call.trace.userManaged, true); assert.equal(call.trace.toolCallId, 'span-1'); assert.equal(call.trace.turnId, 'task-1');
  assert.match(outcome.message, /统计每个歌手的歌曲数/);
  assert.match(outcome.message, /甲：1 首/);
  assert.equal(outcome.status, undefined, '计算结果不是等待、确认或追问状态');
  assert.equal(outcome.observation.output, '甲：1 首\n乙：1 首');
  assert.equal(outcome.observation.purpose, '统计每个歌手的歌曲数');
  assert.equal(outcome.observation.codeHash, 'abcd1234');
  assert.equal(outcome.observation.elapsedMs, 17);
  assert.equal(h.task.usedModel, undefined, '沙箱计算不得冒充模型调用');
});

test('没有来源引用时仍可做纯日期或数值计算，refs 为空对象', async () => {
  const h = harness({ ai: async () => ready(75) });
  const outcome = await h.run({ purpose: '计算 25 乘以 3', code: 'return 25 * 3;' });
  assert.deepEqual(h.calls[0].input.input.refs, {});
  assert.equal(outcome.observation.output, 75);
  assert.match(outcome.message, /75/);
});

test('对象结果以紧凑 JSON 展示；过长结果在消息中截断但完整保留在回执里', async () => {
  const object = harness({ ai: async () => ready({ total: 3, top: '甲' }) });
  const shown = await object.run({ purpose: '汇总', code: 'return {};' });
  assert.match(shown.message, /"total":3/); assert.match(shown.message, /"top":"甲"/);
  assert.deepEqual(shown.observation.output, { total: 3, top: '甲' });

  const long = 'x'.repeat(3000);
  const big = harness({ ai: async () => ready(long) });
  const truncated = await big.run({ purpose: '长文本', code: 'return "";' });
  assert.ok(truncated.message.length <= 1400, `消息 ${truncated.message.length} 字符应小于工作台 1500 字上限`);
  assert.match(truncated.message, /完整结果/);
  assert.equal(truncated.observation.output, long);
});

test('引用不存在或已失效时不启动沙箱，错误可恢复', async () => {
  const h = harness({ artifacts: { 'music.state': { status: 'ready' } } });
  await assert.rejects(h.run({ purpose: '统计', code: 'return 1;', inputRefs: ['context:999'] }), error => error.code === 'CONTEXT_REF_EXPIRED' && /context:999/.test(error.message) && error.sideEffectState === 'none');
  assert.equal(h.calls.length, 0);
});

test('来源超过输入上限时不启动沙箱，并说明字节数和改进方向', async () => {
  const fat = { rows: Array.from({ length: 700 }, (_, index) => ({ index, title: 'x'.repeat(70) })) };
  const h = harness({ artifacts: { 'music.collection.get': fat } });
  await assert.rejects(h.run({ purpose: '统计', code: 'return 1;', inputRefs: [h.refs['music.collection.get']] }),
    error => error.code === 'COMPUTE_INPUT_TOO_LARGE' && /40960/.test(error.message) && /\d{5,} 字节/.test(error.message) && error.sideEffectState === 'none');
  assert.equal(h.calls.length, 0);
});

test('代码自身的错误（语法、运行、超时、内存、输出等）保留错误码和行号，让模型修正后重试', async () => {
  for (const code of ['COMPUTE_SYNTAX_ERROR', 'COMPUTE_RUNTIME_ERROR', 'COMPUTE_TIMEOUT', 'COMPUTE_MEMORY_LIMIT', 'COMPUTE_STACK_LIMIT', 'COMPUTE_OUTPUT_INVALID', 'COMPUTE_OUTPUT_TOO_LARGE', 'COMPUTE_INPUT_INVALID']) {
    const h = harness({ ai: async () => { throw Object.assign(new Error('代码运行出错：TypeError: x 不是函数（第2行）'), { code }); } });
    await assert.rejects(h.run({ purpose: '统计', code: 'return 1;' }), error => error.code === code && /第2行/.test(error.message) && error.sideEffectState === 'none', code);
  }
  const returned = harness({ ai: async () => ({ ok: false, error: '代码运行出错（第3行）', code: 'COMPUTE_RUNTIME_ERROR' }) });
  await assert.rejects(returned.run({ purpose: '统计', code: 'return 1;' }), error => error.code === 'COMPUTE_RUNTIME_ERROR' && /第3行/.test(error.message));
});

test('沙箱不可用、被关闭或繁忙属于需要用户处理的情况：停止自动恢复，保留原始说明和错误码', async () => {
  for (const code of ['COMPUTE_DISABLED', 'COMPUTE_UNCONFIGURED', 'COMPUTE_BUSY', 'COMPUTE_ISOLATION_UNAVAILABLE', 'COMPUTE_SANDBOX_FAILED']) {
    const h = harness({ ai: async () => { throw Object.assign(new Error(`原始说明 ${code}`), { code }); } });
    await assert.rejects(h.run({ purpose: '统计', code: 'return 1;' }), error => error.code === 'ASSISTANT_USER_INPUT_REQUIRED' && error.computeCode === code && error.message.includes(`原始说明 ${code}`), code);
  }
});

test('异步作业：登记作业编号供取消使用，轮询到完成后返回结果', async () => {
  let polls = 0;
  const h = harness({ ai: async request => {
    if (request.action === 'ai_compute_submit') return { ok: true, status: 'pending', jobId: JOB };
    assert.equal(request.action, 'ai_scene_result'); assert.equal(request.jobId, JOB);
    return ++polls < 3 ? { ok: true, status: 'pending', jobId: JOB } : ready(5);
  } });
  const outcome = await h.run({ purpose: '算数', code: 'return 5;' });
  assert.equal(outcome.observation.output, 5);
  assert.deepEqual(h.tracked, [JOB]);
  assert.deepEqual(h.calls.map(call => call.action), ['ai_compute_submit', 'ai_scene_result', 'ai_scene_result', 'ai_scene_result']);
});

test('作业编号登记失败（任务已停止）时立即向本机服务取消该作业', async () => {
  const h = harness({ ai: async request => request.action === 'ai_compute_submit' ? { ok: true, status: 'pending', jobId: JOB } : { ok: true } });
  const stopped = Object.assign(new Error('任务已停止'), { name: 'AbortError' });
  await assert.rejects(h.run({ purpose: '算数', code: 'return 5;' }, { async trackJob() { throw stopped; } }), error => error === stopped);
  assert.deepEqual(h.calls.map(call => call.action), ['ai_compute_submit', 'ai_job_cancel']);
  assert.equal(h.calls[1].jobId, JOB);
});

test('本机服务久不返回时取消作业并要求用户处理，不无限等待', async () => {
  let clock = NOW;
  const h = harness({ now: () => clock, ai: async request => {
    if (request.action === 'ai_compute_submit') return { ok: true, status: 'pending', jobId: JOB };
    if (request.action === 'ai_job_cancel') return { ok: true };
    clock += 30000;
    return { ok: true, status: 'pending', jobId: JOB };
  } });
  await assert.rejects(h.run({ purpose: '算数', code: 'return 5;' }), error => error.code === 'ASSISTANT_USER_INPUT_REQUIRED' && error.computeCode === 'COMPUTE_NO_RESPONSE' && /20 秒/.test(error.message));
  assert.equal(h.calls.at(-1).action, 'ai_job_cancel');
  assert.equal(h.calls.at(-1).jobId, JOB);
});

test('执行器自己再校验一次参数：非法计划不会到达本机服务', async () => {
  const h = harness();
  await assert.rejects(h.run({ purpose: '', code: 'return 1;' }), /purpose/);
  await assert.rejects(h.run({ purpose: '统计', code: 'return 1;', inputRefs: ['r12'] }), /inputRefs/);
  await assert.rejects(h.run({ purpose: '统计', code: 'x'.repeat(4001) }), /code/);
  assert.equal(h.calls.length, 0);
});

test('无效的服务回执被当作基础设施故障，不当作计算结果', async () => {
  for (const response of [undefined, { ok: true, status: 'ready', source: 'compute' }, { ok: true, status: 'ready', source: 'rules', output: 1 }]) {
    const h = harness({ ai: async () => response });
    await assert.rejects(h.run({ purpose: '统计', code: 'return 1;' }), error => error.code === 'ASSISTANT_USER_INPUT_REQUIRED' && error.computeCode === 'COMPUTE_SANDBOX_FAILED');
  }
});

// alarm.list normally turns several matches into a "which one?" card so a later edit has a target. A read-only
// analysis has no target to pick, so that card would stop the task before any data reached compute.run.
test('提醒列表在只读分析（当前待办由 compute.run 验收）时只返回数据，不弹选择卡；管理类任务仍要选择', async () => {
  const day = new Date(2030, 4, 10, 10).getTime();
  const rows = ['交水电费', '取快递', '周会'].map((label, index) => Alarm.normalizeAlarm({ date: `2030-05-1${index + 1}`, time: '11:00', label, enabled: true }, day));
  const tools = Tools.create({ now: () => day, listAlarms: async () => ({ alarms: structuredClone(rows) }) });
  const task = todoTips => ({ id: 'task', input: { app: 'alarm' }, memory: {}, turns: [], log: [], adaptive: true, ...(todoTips ? { todoTips } : {}) });
  const context = value => ({ guard() {}, progress: async () => {}, task: value });
  const analysing = await tools.execute({ tool: 'alarm.list', args: {} }, context(task({ items: [{ text: '分析提醒', tool: 'compute.run', status: 'pending' }] })));
  assert.equal(analysing.status, undefined, '分析读取不得进入 waiting');
  assert.equal(analysing.choices, undefined);
  assert.equal(analysing.observation.items.length, 3);
  assert.equal(analysing.observation.nextOffset, null);
  assert.ok(analysing.observation.today && analysing.observation.timeZone, '分析需要今天的日期与时区');
  const managing = await tools.execute({ tool: 'alarm.list', args: {} }, context(task()));
  assert.equal(managing.status, 'waiting', '没有分析待办时保持原行为：多条匹配要选择');
  const other = await tools.execute({ tool: 'alarm.list', args: {} }, context(task({ items: [{ text: '删除提醒', tool: 'alarm.delete.prepare', status: 'pending' }] })));
  assert.equal(other.status, 'waiting', '其他完成条件的待办也保持原行为');
  const finished = await tools.execute({ tool: 'alarm.list', args: {} }, context(task({ items: [{ text: '分析', tool: 'compute.run', status: 'completed' }, { text: '删除提醒', tool: 'alarm.delete.prepare', status: 'pending' }] })));
  assert.equal(finished.status, 'waiting', '分析项已完成后，当前事项是动作，仍须选择');
});
