// 桌面 AI 助手（原生面板）的 Chrome 侧适配：原生输入 → 同一个 Engine；Engine 状态 → 原生面板的有界纯文本投影。
// 用替身 engine / desktop 驱动真实适配层；整条链路与真实 Engine 的联调见 assistant-native-integration.test.js。
const test = require('node:test');
const assert = require('node:assert/strict');
const AssistantNative = require('../js/assistant-native.js');

const tick = () => new Promise(resolve => setImmediate(resolve));
const task = (extra = {}) => ({ id: 'task-1', version: 2, status: 'running', input: { text: '播放周杰伦的歌' }, message: '正在执行…', updatedAt: 1760000000000,
  log: [{ tool: 'music.search' }], trace: [{ big: 'x'.repeat(5000) }], messages: [{ role: 'user', content: '播放周杰伦的歌' }], choices: [{ id: 'c1' }], interaction: { id: 'i1' }, ...extra });

function env({ enabled = true, port = {}, current = null, submit, cancel, openWorkspace, failState } = {}) {
  const calls = { state: [], submit: [], cancel: [], open: 0, logs: [] };
  const desktop = {
    port, onAssistantAction: null, onAssistantConnected: null,
    async setAssistantState(state) {
      if (failState) throw new Error(failState);
      calls.state.push(state); return { ok: true, version: 7 };
    },
  };
  let snapshot = current;
  const engine = {
    async snapshot() { return snapshot; },
    async submit(input) { calls.submit.push(input); return submit ? submit(input) : { id: 'task-2', version: 1 }; },
    async cancel(id) { calls.cancel.push(id); return cancel ? cancel(id) : { id, version: 3, status: 'cancelled' }; },
  };
  const jelly = { enabled, assistantEnabled: async () => jelly.enabled, onAssistantApplied: null };
  const native = AssistantNative.create({ desktop, engine, jelly, openWorkspace: async () => { calls.open++; if (openWorkspace) return openWorkspace(); }, log: (...args) => calls.logs.push(args) });
  return { native, desktop, engine, jelly, calls, set(value) { snapshot = value; } };
}

// ---------- 投影 ----------

test('project：只带状态白名单字段；去掉 trace/messages/choices/interaction 等大对象与来源标记', () => {
  const state = AssistantNative.project(task({ input: { text: '播放', origin: 'desktop' } }));
  assert.deepEqual(Object.keys(state).sort(), ['at', 'input', 'message', 'status', 'taskId', 'version']);
  assert.deepEqual(state, { taskId: 'task-1', version: 2, status: 'running', input: '播放', message: '正在执行…', at: 1760000000000 });
  assert.equal(JSON.stringify(state).includes('origin'), false);
  for (const status of ['planning', 'running', 'waiting', 'review', 'clarify', 'completed', 'failed', 'interrupted', 'cancelled']) assert.equal(AssistantNative.project(task({ status })).status, status);
});

test('project：没有任务、未知状态、坏 id、坏版本都投影为 null（不猜测）', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, task({ status: 'weird' }), task({ status: undefined }), task({ id: '' }), task({ id: 'a b' }), task({ id: 'x'.repeat(101) }),
    task({ id: 5 }), task({ version: 1.5 }), task({ version: '2' }), task({ version: undefined }), task({ version: Number.MAX_SAFE_INTEGER + 2 })]) {
    assert.equal(AssistantNative.project(bad), null, JSON.stringify(bad)?.slice(0, 60));
  }
});

test('project：message 与 input 清洗——去控制字符/方向控制符，input 压成单行 ≤120，message 保留换行但压缩空行 ≤1200，截断加省略号', () => {
  const dirty = AssistantNative.project(task({ message: '第一行\r\n\u0000第二\u202e行\n\n\n\n第三行\u200f', input: { text: '播放\n\t周杰伦\u0007  的歌\u2066' } }));
  assert.equal(dirty.message, '第一行\n第二行\n\n第三行');
  assert.equal(dirty.input, '播放 周杰伦 的歌');
  const long = AssistantNative.project(task({ message: '字'.repeat(5000), input: { text: '长'.repeat(500) } }));
  assert.equal([...long.message].length, 1200); assert.ok(long.message.endsWith('…'));
  assert.equal([...long.input].length, 120); assert.ok(long.input.endsWith('…'));
  const emoji = AssistantNative.project(task({ message: '😀'.repeat(1300) }));
  assert.equal([...emoji.message].length, 1200, '按码点截断，不拆代理对');
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emoji.message));
  const odd = AssistantNative.project(task({ message: 5, input: { text: null }, updatedAt: 'x' }));
  assert.deepEqual([odd.message, odd.input, odd.at], ['', '', 0]);
  assert.equal(AssistantNative.project(task({ input: undefined })).input, '');
});

// ---------- 状态下发 ----------

test('sync：已连接且已启用才下发投影；相同内容不重复发（updatedAt 变化不算内容变化）；清空任务只发一次 null', async () => {
  const e = env();
  await e.native.sync(task());
  assert.equal(e.calls.state.length, 1);
  assert.equal(e.calls.state[0].status, 'running');
  await e.native.sync(task({ updatedAt: 1760000009999 }));
  assert.equal(e.calls.state.length, 1, '只有 updatedAt 不同');
  await e.native.sync(task({ message: '已找到歌曲' }));
  assert.equal(e.calls.state.length, 2);
  await e.native.sync(null); await e.native.sync(null);
  assert.deepEqual(e.calls.state.map(s => s && s.message), ['正在执行…', '已找到歌曲', undefined].map(v => v === undefined ? null : v).map(v => v));
  assert.equal(e.calls.state.at(-1), null);
  assert.equal(e.calls.state.length, 3);
});

test('sync：没有连接不启动组件、助手未开启不下发；之后连接/开启时补发最新状态', async () => {
  const noPort = env({ port: null });
  await noPort.native.sync(task());
  assert.equal(noPort.calls.state.length, 0);
  const off = env({ enabled: false, current: task() });
  await off.native.sync(task());
  assert.equal(off.calls.state.length, 0);
  off.jelly.enabled = true;
  off.jelly.onAssistantApplied();
  await tick(); await tick();
  assert.equal(off.calls.state.length, 1, '设置生效后补发 Engine 当前任务');
  noPort.desktop.port = {};
  noPort.set(task({ status: 'completed', message: '好了' }));
  noPort.desktop.onAssistantConnected();
  await tick(); await tick();
  assert.deepEqual(noPort.calls.state.map(s => s.status), ['completed'], '新连接补发的是 Engine 当前任务，不是旧缓存');
});

test('新连接与设置生效后即使内容没变也要重发（原生进程是新的，没有旧状态）', async () => {
  const e = env({ current: task() });
  await e.native.sync(task());
  assert.equal(e.calls.state.length, 1);
  e.desktop.onAssistantConnected(); await tick(); await tick();
  assert.equal(e.calls.state.length, 2);
  e.jelly.onAssistantApplied(); await tick(); await tick();
  assert.equal(e.calls.state.length, 3);
  e.set(null);
  e.desktop.onAssistantConnected(); await tick(); await tick();
  assert.equal(e.calls.state.length, 4); assert.equal(e.calls.state.at(-1), null, '没有任务时新进程也要收到“没有任务”');
});

test('下发失败：记录固定类别、不重复刷屏、不更新“已发送”，下一次变化或连接再试；不产生未处理的拒绝', async () => {
  const e = env({ failState: '桌面组件未响应，请检查是否已安装' });
  await e.native.sync(task());
  assert.equal(e.calls.logs.length, 1);
  const [category, action, detail] = e.calls.logs[0];
  assert.deepEqual([category, action, detail.ok, detail.context], ['system', 'assistant-native', false, 'state']);
  assert.equal(JSON.stringify(e.calls.logs).includes('播放周杰伦'), false, '日志不含用户输入');
  assert.equal(JSON.stringify(e.calls.logs).includes('正在执行'), false, '日志不含助手内容');
  e.desktop.setAssistantState = async state => { e.calls.state.push(state); return { ok: true, version: 7 }; };
  await e.native.sync(task());
  assert.equal(e.calls.state.length, 1, '失败后同样内容会再试一次');
});

test('并发的 sync 串行下发，最终原生看到的是最后一个状态', async () => {
  const e = env();
  await Promise.all([e.native.sync(task({ message: 'a' })), e.native.sync(task({ message: 'b' })), e.native.sync(task({ message: 'c' }))]);
  assert.equal(e.calls.state.at(-1).message, 'c');
  assert.ok(e.calls.state.length <= 3);
});

// ---------- 动作：提交 / 停止 / 打开 ----------

test('submit：trim 后交给同一个 engine.submit，带桌面来源；有效的 taskId/version 一并传（与浏览器工作台一致），无效的丢弃', async () => {
  const e = env();
  const result = await e.desktop.onAssistantAction({ action: 'submit', text: '  播放周杰伦的歌  ', taskId: 'task-1', version: 2 });
  assert.deepEqual(result, { ok: true, taskId: 'task-2', version: 1 });
  assert.deepEqual(e.calls.submit[0], { text: '播放周杰伦的歌', origin: 'desktop', taskId: 'task-1', version: 2 });
  await e.desktop.onAssistantAction({ action: 'submit', text: '再来一首', taskId: 'bad id', version: 1.5 });
  assert.deepEqual(e.calls.submit[1], { text: '再来一首', origin: 'desktop' });
  await e.desktop.onAssistantAction({ action: 'submit', text: '再来', taskId: 'task-1' });
  assert.deepEqual(e.calls.submit[2], { text: '再来', origin: 'desktop' }, '只有 taskId 没有 version 也不传，避免半截绑定');
  await e.desktop.onAssistantAction({ action: 'submit', text: '再来2', origin: 'browser', app: 'music', skill: 'play', candidateIds: ['c1'] });
  assert.deepEqual(e.calls.submit[3], { text: '再来2', origin: 'desktop' }, '原生只能提交文字：应用/动作/候选/来源都不接受调用方给的');
});

test('submit：空、非字符串、超过 500 个字符、助手未开启都在适配层拒绝，engine 不被调用', async () => {
  const e = env();
  for (const text of ['', '   ', '\n\t', null, undefined, 5, {}, 'x'.repeat(501), '😀'.repeat(501)]) {
    const result = await e.desktop.onAssistantAction({ action: 'submit', text });
    assert.equal(result.ok, false, JSON.stringify(text)?.slice(0, 20)); assert.ok(result.error);
  }
  assert.equal(e.calls.submit.length, 0);
  assert.equal((await e.desktop.onAssistantAction({ action: 'submit', text: 'x'.repeat(500) })).ok, true, '500 个字符允许');
  assert.equal((await e.desktop.onAssistantAction({ action: 'submit', text: '😀'.repeat(500) })).ok, true, '按字符而非 UTF-16 单元计数');
  e.jelly.enabled = false;
  const off = await e.desktop.onAssistantAction({ action: 'submit', text: '播放' });
  assert.deepEqual([off.ok, typeof off.error], [false, 'string']);
  assert.equal(e.calls.submit.length, 2);
});

test('submit：engine 拒绝（任务正在执行、会话已变化…）如实返回原因，不声称成功；日志只记类别', async () => {
  const e = env({ submit: async () => { throw new Error('当前任务正在执行，请先停止或等待完成'); } });
  const result = await e.desktop.onAssistantAction({ action: 'submit', text: '私人内容：我的银行卡' });
  assert.deepEqual(result, { ok: false, error: '当前任务正在执行，请先停止或等待完成' });
  const logs = JSON.stringify(e.calls.logs);
  assert.equal(logs.includes('银行卡'), false);
  assert.deepEqual([e.calls.logs.at(-1)[1], e.calls.logs.at(-1)[2].context, e.calls.logs.at(-1)[2].ok], ['assistant-native', 'submit', false]);
});

test('submit：上一条提交还没返回时拒绝第二条（不同 actionId 的并发也只让一条进入 engine）', async () => {
  let release, calls = 0;
  const e = env({ submit: () => (++calls === 1 ? new Promise(resolve => { release = () => resolve({ id: 'task-9', version: 1 }); }) : { id: 'task-10', version: 1 }) });
  const first = e.desktop.onAssistantAction({ action: 'submit', text: '第一条' });
  await tick();
  const second = await e.desktop.onAssistantAction({ action: 'submit', text: '第二条' });
  assert.equal(second.ok, false);
  release();
  assert.equal((await first).ok, true);
  assert.equal(e.calls.submit.length, 1);
  assert.equal((await e.desktop.onAssistantAction({ action: 'submit', text: '第三条' })).ok, true, '上一条结束后恢复可用');
});

test('cancel：只停止与面板所见一致的执行中任务；版本/任务变化、非执行中、无效参数都拒绝；engine.cancel 只传 taskId', async () => {
  const e = env({ current: task() });
  const ok = await e.desktop.onAssistantAction({ action: 'cancel', taskId: 'task-1', version: 2 });
  assert.deepEqual(ok, { ok: true, taskId: 'task-1', version: 3 });
  assert.deepEqual(e.calls.cancel, ['task-1']);
  for (const bad of [{ taskId: 'task-1', version: 1 }, { taskId: 'other', version: 2 }, { taskId: 'task-1' }, { version: 2 }, { taskId: 5, version: 2 }, { taskId: 'task-1', version: '2' }]) {
    const result = await e.desktop.onAssistantAction({ action: 'cancel', ...bad });
    assert.equal(result.ok, false, JSON.stringify(bad));
  }
  for (const status of ['completed', 'failed', 'waiting', 'review', 'clarify', 'interrupted', 'cancelled']) {
    e.set(task({ status }));
    assert.equal((await e.desktop.onAssistantAction({ action: 'cancel', taskId: 'task-1', version: 2 })).ok, false, status);
  }
  e.set(null);
  assert.equal((await e.desktop.onAssistantAction({ action: 'cancel', taskId: 'task-1', version: 2 })).ok, false);
  assert.equal(e.calls.cancel.length, 1);
  e.set(task({ status: 'planning' }));
  assert.equal((await e.desktop.onAssistantAction({ action: 'cancel', taskId: 'task-1', version: 2 })).ok, true, '规划中也可以停止');
});

test('open：调用工作台打开入口；失败如实返回原因；助手未开启时拒绝', async () => {
  const e = env();
  assert.deepEqual(await e.desktop.onAssistantAction({ action: 'open' }), { ok: true });
  assert.equal(e.calls.open, 1);
  const failing = env({ openWorkspace: async () => { throw new Error('无法打开工作台'); } });
  assert.deepEqual(await failing.desktop.onAssistantAction({ action: 'open' }), { ok: false, error: '无法打开工作台' });
  e.jelly.enabled = false;
  assert.equal((await e.desktop.onAssistantAction({ action: 'open' })).ok, false);
  assert.equal(e.calls.open, 1);
});

test('未知动作被拒绝；create 把钩子接到 desktop 与 jelly，dispose 后全部解除', async () => {
  const e = env();
  for (const action of ['delete', 'respond', '', undefined, 5]) assert.equal((await e.desktop.onAssistantAction({ action })).ok, false, String(action));
  assert.equal(typeof e.desktop.onAssistantConnected, 'function');
  assert.equal(typeof e.jelly.onAssistantApplied, 'function');
  e.native.dispose();
  assert.equal(e.desktop.onAssistantAction, null); assert.equal(e.desktop.onAssistantConnected, null); assert.equal(e.jelly.onAssistantApplied, null);
});
