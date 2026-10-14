import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';

const TEXT = '统计队列里每个歌手有几首歌';
const compute = { describe: () => ({ configured: true, localOnly: true }), run: async () => { throw new Error('规划测试不应运行沙箱'); } };

function planner({ enabled = true, changes = {}, provider = compute, responses = [] } = {}) {
  const control = createControlStore();
  if (enabled || Object.keys(changes).length) { const state = control.snapshot(); control.update({ ...state.policy, computeEnabled: enabled, ...changes }, state.revision); }
  const requests = [];
  const gateway = createGateway({ control, computeProvider: provider, provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }),
    async generateObject(request) { requests.push(request); if (!responses.length) throw new Error('测试没有安排模型回复'); return responses.shift(); } } });
  return { requests, control, gateway,
    plan: body => gateway.run('assistant.plan', body) };
}
const outlineBody = (text = TEXT, app = 'music') => ({ text, app, turns: [], observations: [], completedSteps: [], toolGroups: [], todoTips: Todo.create({ text, app }), planningPhase: 'outline' });
const item = (tool = 'compute.run', text = '统计队列中每个歌手的歌曲数') => ({ text, source: 0, tool, args: {} });
const executeBody = (tool = 'compute.run', extra = {}) => {
  const todoTips = Todo.create({ text: TEXT, app: 'music' });
  todoTips.items = [{ ...item(tool), id: 'todo-1', status: 'pending' }];
  return { text: TEXT, app: 'music', turns: [{ role: 'assistant', content: 'music.queue.list [done] 当前队列共6首（来源 context:5）' }], observations: [], completedSteps: [], toolGroups: ['music.queue'], todoTips, planningPhase: 'execute', ...extra };
};
const computeStep = { steps: [{ tool: 'compute.run', args: { purpose: '统计歌手歌曲数', code: 'return 1;', inputRefs: ['context:5'] } }], continue: true };

test('默认关闭时，规划提示词和工具目录完全不提 compute.run，也不出现代码计算的任何说明', async () => {
  const f = planner({ enabled: false, responses: [{ todoTips: [item('music.queue.list', '读取队列')] }, { steps: [{ tool: 'music.state', args: {} }], continue: true }] });
  await f.plan(outlineBody());
  await f.plan(executeBody('music.queue.list'));
  assert.equal(f.requests.length, 2);
  for (const request of f.requests) assert.doesNotMatch(request.instructions, /compute|inputRefs|input\.refs|沙箱/i);
});

test('开启后，清单分析把 compute.run 列为只读分析的完成条件，并规定动作不能由它验收', async () => {
  const f = planner({ responses: [{ todoTips: [item()] }] });
  const result = await f.plan(outlineBody());
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.data.todoTips, [{ text: '统计队列中每个歌手的歌曲数', source: 0, tool: 'compute.run', args: {} }]);
  const text = f.requests[0].instructions;
  assert.match(text, /"compute\.run":\{"title":"只读计算/);
  assert.match(text, /compute\.run验收，args必须为空/);
  assert.match(text, /动作.*不能代替|不能代替.*动作/);
  assert.equal(JSON.parse(text.match(/完成条件目录：(\{.*\})/)[1])['compute.run'].fields.length, 0, '完成条件目录里 compute.run 没有可预填的验收参数');
});

test('开启后，清单分析说明：只有提问或统计、没有动作的原文也必须列为一项目标，并给出写法示例（不得使用评测场景的原话）', async () => {
  const f = planner({ responses: [{ todoTips: [item()] }] });
  await f.plan(outlineBody());
  const text = f.requests[0].instructions;
  assert.match(text, /只是提问或统计、没有任何动作的原文.{0,12}必须列为一项/);
  assert.match(text, /不能返回空数组/);
  assert.match(text, /\{"todoTips":\[\{"text":"[^"]+","source":0,"tool":"compute\.run","args":\{\}\}\]\}/, '要有一个完整的清单写法示例');
  // The example must stay generic: it may not be lifted from the real-model evaluation cases.
  for (const phrase of ['重复的歌曲', '周六或周日', '下一个要响', '歌最多', '每个歌手', '多少首歌']) assert.ok(!text.includes(phrase), `提示词不应包含评测原话：${phrase}`);
});

test('开启后，清单分析说明：动作的对象要由数据算出来时不要追问用户，先列分析目标再列动作目标（措辞保持通用）', async () => {
  const f = planner({ responses: [{ todoTips: [item()] }] });
  await f.plan(outlineBody());
  const text = f.requests[0].instructions;
  // Real slip (2026-10-12 evaluation): "remove the artist with the most songs" came back as a clarifying question
  // that merely asked permission to count first, and the task stopped waiting for an answer nobody needed to give.
  assert.match(text, /动作的对象要由数据算出来[^。]{0,40}不要追问用户/);
  assert.match(text, /先列一项compute\.run分析目标，再列对应的动作目标/);
  // Real slip (2026-10-12 held-out evaluation): the action item was given {"artist":"<placeholder>"}, which the real
  // call can never match because a Todo is not editable. The value is computed later, so args stay empty.
  assert.match(text, /动作目标的args[^。]{0,50}不要预先写[^。]{0,30}分析得出的值[^。]{0,20}占位文字[^。]{0,30}写成\{\}/);
  for (const phrase of ['重复的歌曲', '周六或周日', '下一个要响', '歌最多', '歌最少', '每个歌手', '多少首歌', '最多的那位', '最少的那位', '全部删掉', '执行阶段由分析结果确定']) assert.ok(!text.includes(phrase), `提示词不应包含评测原话：${phrase}`);
});

test('默认关闭时，清单分析不出现“由数据算出再动作”的说明', async () => {
  const f = planner({ enabled: false, responses: [{ todoTips: [item('music.queue.list', '读取队列')] }] });
  await f.plan(outlineBody());
  assert.doesNotMatch(f.requests[0].instructions, /动作的对象要由数据算出来|分析目标/);
});

test('开启后，清单分析要求：读取工具的回执本身已含答案时不用 compute.run（如队列首数、提醒总数）', async () => {
  const f = planner({ responses: [{ todoTips: [item('music.state', '查看当前队列歌曲数')] }] });
  await f.plan(outlineBody('现在队列里有多少首歌？'));
  const text = f.requests[0].instructions;
  assert.match(text, /回执本身(已经|就)?(包含|有).{0,6}答案/);
  assert.match(text, /music\.state[^。]{0,24}count/);
  assert.match(text, /alarm\.list[^。]{0,24}total/);
  assert.match(text, /不要用compute\.run/);
});

test('开启后，执行提示词给出计算工具目录与用法：输入形状、可用能力、返回约束、出错处理', async () => {
  const f = planner({ responses: [computeStep] });
  const result = await f.plan(executeBody());
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.data.steps, [{ tool: 'compute.run', args: { purpose: '统计歌手歌曲数', code: 'return 1;', inputRefs: ['context:5'] } }]);
  const text = f.requests[0].instructions;
  const catalog = JSON.parse(text.match(/本轮工具目录：(\{.*\})/)[1]);
  assert.deepEqual(catalog['compute.run'].fields, ['purpose', 'code', 'inputRefs']);
  for (const phrase of [/input\.refs/, /input\.now/, /input\.today/, /utcOffsetMinutes/, /inputRefs/, /context:N/, /return/, /不能.*(联网|网络)/, /不能.*(播放|添加|删除)/, /错误码|error\.code/, /function|import|await|fetch/, /40KB/]) assert.match(text, phrase, String(phrase));
  assert.match(text, /先用已登记/, '说明必须先用现有读取工具取得数据');
  // Seen with the real model: it wrote input.refs[...].data.items and lost an attempt to the TypeError.
  assert.match(text, /input\.refs\["context:N"\]直接就是.{0,20}observation/, '说明回执原始 JSON 的形状');
  assert.match(text, /不要再(套|加).{0,3}\.data/, '明确不要再包一层 .data');
});

test('开启后，执行提示词说明分页读取：每页上限、翻页字段、读完所有页再计算，且所有页的来源都要放进 inputRefs', async () => {
  const f = planner({ responses: [computeStep] });
  await f.plan(executeBody());
  const text = f.requests[0].instructions;
  // The real failure this guards against: a model asking music.queue.list for limit 300 and never recovering.
  assert.match(text, /limit.{0,20}(1至20|最多20)/, '读取工具的每页上限必须在提示词里，而不是等校验报错才知道');
  assert.match(text, /nextOffset/, '回执用 nextOffset 指示下一页');
  assert.match(text, /offset/);
  assert.match(text, /(所有|全部|每一)页/, '统计整张列表前必须读完所有页');
  assert.match(text, /不要只用第一页/);
});

test('开启后，执行提示词给出每轮一步的正确写法：对象而非数组、不加 id/text、读取与计算各一例，且无需先查 music.state', async () => {
  const f = planner({ responses: [computeStep] });
  await f.plan(executeBody());
  const text = f.requests[0].instructions;
  assert.match(text, /每轮只返回一个步骤/);
  assert.match(text, /不要返回数组/);
  assert.match(text, /不要加id、text、status/);
  // Real slip: inputRefs written beside args instead of inside it (2 of 12 evaluation cases stopped on it).
  assert.match(text, /purpose、code、inputRefs都写在args里面，不要放在步骤同级/);
  assert.ok(text.includes('{"steps":[{"tool":"music.queue.list","args":{"offset":0,"limit":20}}],"continue":true}'), '读取一页的示例');
  assert.match(text, /\{"steps":\[\{"tool":"compute\.run","args":\{"purpose":"[^"]+","code":"[^"]+","inputRefs":\["context:\d+"(?:,"context:\d+")*\]\}\}\],"continue":true\}/, '计算的示例');
  assert.match(text, /队列回执已含count[^。]{0,24}不需要先music\.state/);
  // The current Todo item (this fixture's own text) is embedded in the prompt, so only phrases outside it are checked.
  for (const phrase of ['重复的歌曲', '周六或周日', '下一个要响', '歌最多', '多少首歌']) assert.ok(!text.includes(phrase), `提示词不应包含评测原话：${phrase}`);
});

test('开启后，执行提示词只要求下一步：读下一页就只返回读取，不要把之后的计算或动作一起写出，也不要加步骤注释字段', async () => {
  const f = planner({ responses: [computeStep] });
  await f.plan(executeBody());
  const text = f.requests[0].instructions;
  // Real slip (2026-10-12 evaluation): after the first queue page the model wrote [read page 2, compute, remove] as one
  // array with _step/_purpose notes, a program instead of the next step, and the task stopped on the format errors.
  assert.match(text, /只返回下一步[^。]{0,60}读下一页[^。]{0,24}只返回读取这一页/);
  assert.match(text, /不要把之后的计算或动作一起写出来/);
  assert.match(text, /_step/);
  // The fixture's own Todo text is embedded in the prompt, so only phrases that text does not contain are checked.
  assert.doesNotMatch(text, /重复的歌曲|周六或周日|下一个要响|歌最多|多少首歌/);
});

test('开启后，音乐应用里当前待办是 compute.run 时直接曝光队列读取工具，不再先空走一轮“尚未加载”的纠错', async () => {
  // Every music analysis used to start with music.queue.list being rejected as not loaded, one wasted model call and
  // one recovery slot before tools.load. The group description is exposed (never authorised, never run).
  const f = planner({ responses: [{ steps: [{ tool: 'music.queue.list', args: { offset: 0, limit: 20 } }], continue: true }] });
  const result = await f.plan(executeBody('compute.run', { toolGroups: [], turns: [], observations: [] }));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.data.steps, [{ tool: 'music.queue.list', args: { offset: 0, limit: 20 } }]);
  assert.ok(result.toolContext.loadedGroups.includes('music.queue'));
  const catalog = JSON.parse(f.requests[0].instructions.match(/本轮工具目录：(\{.*\})/)[1]);
  assert.ok(catalog['music.queue.list'] && catalog['compute.run']);
});

test('只有音乐应用的 compute.run 待办才预加载队列工具组；其他应用、其他工具的待办和默认关闭时都保持原样', async () => {
  const read = { steps: [{ tool: 'music.state', args: {} }], continue: true };
  const other = planner({ responses: [{ steps: [{ tool: 'alarm.list', args: { offset: 0, limit: 20 } }], continue: true }] });
  const alarmTodo = Todo.create({ text: '哪些提醒在周末响', app: 'alarm' });
  alarmTodo.items = [{ ...item(), id: 'todo-1', status: 'pending' }];
  const alarm = await other.plan({ text: '哪些提醒在周末响', app: 'alarm', turns: [], observations: [], completedSteps: [], toolGroups: [], todoTips: alarmTodo, planningPhase: 'execute' });
  assert.ok(!alarm.toolContext.loadedGroups.includes('music.queue'), '提醒应用不需要队列工具');
  const state = planner({ responses: [read] });
  const musicState = await state.plan(executeBody('music.state', { toolGroups: [] }));
  assert.ok(!musicState.toolContext.loadedGroups.includes('music.queue'), '当前待办不是 compute.run 时不改变工具组');
  const off = planner({ enabled: false, responses: [read] });
  const disabled = await off.plan(executeBody('music.state', { toolGroups: [] }));
  assert.ok(!disabled.toolContext.loadedGroups.includes('music.queue'), '默认关闭时行为不变');
  const outline = planner({ responses: [{ todoTips: [item()] }] });
  const analysis = await outline.plan(outlineBody());
  assert.ok(!(analysis.toolContext?.loadedGroups || []).includes('music.queue'), '清单分析阶段不预加载');
});

test('默认关闭时，执行提示词不含这些示例', async () => {
  const f = planner({ enabled: false, responses: [{ steps: [{ tool: 'music.state', args: {} }], continue: true }] });
  await f.plan(executeBody('music.queue.list'));
  assert.doesNotMatch(f.requests[0].instructions, /不要返回数组|不需要先music\.state|"tool":"compute\.run"/);
});

test('开关、总开关、场景禁用、沙箱未配置中任何一项不满足，都不曝光 compute.run', async () => {
  const cases = [
    ['专属开关关闭', { enabled: false }],
    ['场景被禁用', { changes: { disabledScenes: ['assistant.compute'] } }],
    ['沙箱依赖缺失', { provider: { describe: () => ({ configured: false, error: '缺少依赖' }), run: async () => {} } }],
    ['沙箱未配置', { provider: null }]
  ];
  for (const [name, options] of cases) {
    const f = planner({ ...options, responses: [{ steps: [{ tool: 'music.state', args: {} }], continue: true }] });
    await f.plan(executeBody('music.queue.list'));
    assert.doesNotMatch(f.requests[0].instructions, /compute\.run/, name);
  }
  const on = planner({ responses: [{ steps: [{ tool: 'music.state', args: {} }], continue: true }] });
  await on.plan(executeBody('music.queue.list'));
  assert.match(on.requests[0].instructions, /compute\.run/);
});

test('关闭时，模型把 compute.run 写进清单会在规划阶段被拒绝，并提示改用目录中的完成条件', async () => {
  const f = planner({ enabled: false, responses: [{ todoTips: [item()] }] });
  await assert.rejects(f.plan(outlineBody()), error => error.code === 'ASSISTANT_PLAN_INVALID' && error.planIssue === 'todo-arguments' && /compute\.run/.test(error.message) && /未开启|关闭/.test(error.message));
});

test('关闭时，模型提议 compute.run 步骤会被拒绝：它不在本轮目录，也不能靠加载工具组启用', async () => {
  const f = planner({ enabled: false, responses: [computeStep] });
  await assert.rejects(f.plan(executeBody('music.queue.list')), error => error.code === 'ASSISTANT_PLAN_INVALID' && /compute\.run/.test(error.message) && /不可用/.test(error.message));
});

test('已保存的待办要求代码计算、但开关已被关闭：明确要求用户处理，不调用模型', async () => {
  const f = planner({ enabled: false, responses: [computeStep] });
  await assert.rejects(f.plan(executeBody()), error => error.code === 'ASSISTANT_USER_INPUT_REQUIRED' && /AI 控制台/.test(error.message) && /代码计算/.test(error.message));
  assert.equal(f.requests.length, 0, '没有可行路径时不应消耗一次模型调用');
});

test('开启时，含动作的原文不能只用 compute.run 验收，规则在服务端清单校验里同样生效', async () => {
  const f = planner({ responses: [{ todoTips: [item()] }] });
  await assert.rejects(f.plan(outlineBody('统计队列里每个歌手有几首歌，然后播放最多的那位')), error => error.code === 'ASSISTANT_PLAN_INVALID' && error.planIssue === 'todo-arguments' && /动作/.test(error.message));
});

test('规划请求夹带的代码或沙箱开关会被丢弃：它们既不进入模型输入，也不能自行开启计算', async () => {
  const f = planner({ enabled: false, responses: [{ steps: [{ tool: 'music.state', args: {} }], continue: true }] });
  await f.plan({ ...executeBody('music.queue.list'), code: 'return "秘密代码";', computeEnabled: true, inputRefs: ['context:5'] });
  assert.equal(f.requests.length, 1);
  assert.doesNotMatch(JSON.stringify(f.requests[0].input), /秘密代码|computeEnabled|inputRefs/);
  assert.doesNotMatch(f.requests[0].instructions, /compute\.run/);
});

test('历史回执里的 compute.run 观察可以被服务读取，用于下一轮规划', async () => {
  const f = planner({ responses: [{ done: true }] });
  const observation = { tool: 'compute.run', status: 'done', message: '计算结果（统计）：周杰伦：3 首', data: { purpose: '统计', output: '周杰伦：3 首', outputBytes: 20, codeHash: 'abcd1234abcd1234', sources: ['context:5'] } };
  const todoTips = Todo.create({ text: TEXT, app: 'music' });
  todoTips.items = [{ ...item(), id: 'todo-1', status: 'completed', receiptId: 'x:6' }];
  const result = await f.plan({ ...executeBody(), todoTips, observations: [observation], completedSteps: [{ tool: 'compute.run', message: observation.message }] });
  assert.equal(result.status, 'ready'); assert.equal(result.data.done, true);
  assert.match(JSON.stringify(f.requests[0].input.observations), /周杰伦：3 首/);
});
