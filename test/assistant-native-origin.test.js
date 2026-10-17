const test = require('node:test');
const assert = require('node:assert/strict');
const Contract = require('../js/assistant-contract.js');
const Engine = require('../js/assistant-engine.js');

// 来源只会让授权更严：只有精确的 'desktop' 会被保留，其他值（含模型/页面伪造的）一律丢弃。
test('Contract.input 只保留 origin:"desktop"；其他取值与类型全部丢弃，没有来源时结构不变', () => {
  assert.equal(Contract.input({ text: '播放音乐', origin: 'desktop' }).origin, 'desktop');
  for (const bad of ['browser', 'Desktop', 'DESKTOP', ' desktop', '', null, undefined, true, 1, {}, ['desktop']]) {
    assert.equal(Object.hasOwn(Contract.input({ text: '播放音乐', origin: bad }), 'origin'), false, String(bad));
  }
  assert.deepEqual(Contract.input({ text: '播放音乐' }), { text: '播放音乐', app: null, skill: null });
});

test('routeRequest 透传桌面来源：新建、继续与没有来源三种情况', () => {
  const fresh = Contract.routeRequest({ text: '10分钟后提醒我喝水', origin: 'desktop' }, null);
  assert.equal(fresh.input.origin, 'desktop');
  assert.equal(fresh.mode, 'new');
  const plain = Contract.routeRequest({ text: '10分钟后提醒我喝水' }, null);
  assert.equal(Object.hasOwn(plain.input, 'origin'), false);
  const forged = Contract.routeRequest({ text: '10分钟后提醒我喝水', origin: 'trusted' }, null);
  assert.equal(Object.hasOwn(forged.input, 'origin'), false);
});

function fixture(plan) {
  const values = {}; let count = 0;
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  return Engine.create({ storage, now: () => Date.now(), id: () => `origin-${++count}`, onChange: () => {}, plan,
    execute: async () => ({ status: 'completed', message: '好了' }), choose: async () => ({ message: '好了' }) });
}

test('任务输入保存 origin；原生确认卡回答（Engine.respond）重新提交时带桌面来源，提交前的任务不带', async () => {
  const engine = fixture(async () => ({ question: '需要哪位歌手？', steps: [] }));
  await engine.submit({ app: 'music', text: '林俊杰' }); await engine.settled();
  const before = await engine.snapshot();
  assert.equal(Object.hasOwn(before.input, 'origin'), false);
  assert.equal(before.interaction.kind, 'input');
  await engine.respond(before.id, before.version, { interaction: before.interaction, action: 'reply', text: '周杰伦' });
  await engine.settled();
  const after = await engine.snapshot();
  assert.equal(after.startMode, 'continue');
  assert.equal(after.input.origin, 'desktop');
});

test('原生入口 submit 的 origin 写入任务输入并随快照持久化，浏览器入口不带来源', async () => {
  const desktop = fixture(async () => ({ steps: [] }));
  await desktop.submit({ text: '随便聊聊', origin: 'desktop' }); await desktop.settled();
  assert.equal((await desktop.snapshot()).input.origin, 'desktop');
  const browser = fixture(async () => ({ steps: [] }));
  await browser.submit({ text: '随便聊聊' }); await browser.settled();
  assert.equal(Object.hasOwn((await browser.snapshot()).input, 'origin'), false);
});
