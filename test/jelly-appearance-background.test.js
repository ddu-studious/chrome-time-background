// 后台“桌面水母形象”消息处理的行为：从 js/background.js 里截出真实的监听函数，在沙箱里用替身执行。
// jelly-appearance-integration.test.js 只扫源码文字（接线是否存在）；这里验证发送方校验、动作分发与回应形状——
// 第一轮变异检查发现：把校验条件、分发分支、回应字段改掉，只扫文字的测试几乎都发现不了。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const background = fs.readFileSync(path.join(__dirname, '..', 'js', 'background.js'), 'utf8');
const REJECTION = { ok: false, error: '仅扩展页面可设置桌面水母形象' };
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const plain = value => JSON.parse(JSON.stringify(value));   // 沙箱里创建的对象原型不同，比较前先转成普通对象

function snippet() {
  const anchor = background.indexOf("['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll']");
  assert.ok(anchor > 0, '找不到外观消息监听');
  const start = background.lastIndexOf('chrome.runtime.onMessage.addListener(', anchor);
  const endMarker = 'return true;\n    });';
  const end = background.indexOf(endMarker, anchor);
  assert.ok(start >= 0 && end > anchor, '截取不到完整的监听函数');
  return background.slice(start, end + endMarker.length);
}

function harness({ result = { ok: true, settings: { color: 2 }, resolved: { color: 2, colors: [2] } }, fail = null, component = 'unsupported', connected = false, style = { style: 'unknown', species: 'jelly', realistic: false } } = {}) {
  const listeners = [], calls = [];
  const chrome = { runtime: { id: EXTENSION_ID, getURL: file => `chrome-extension://${EXTENSION_ID}/${file}`, onMessage: { addListener: listener => listeners.push(listener) } } };
  const respond = name => async (...args) => { calls.push([name, ...args]); if (fail) throw new Error(fail); return result; };
  const jellyAppearance = { get: respond('get'), set: respond('set'), rerollNow: respond('rerollNow') };
  const jellyDesktop = { appearanceStatus: () => component, appearanceStyle: () => style, status: () => ({ connected }) };
  vm.runInNewContext(snippet(), { chrome, jellyAppearance, jellyDesktop });
  assert.equal(listeners.length, 1, '应注册一个监听函数');
  const send = async (message, sender) => {
    const replies = [];
    const returned = listeners[0](message, sender, reply => replies.push(plain(reply)));
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));   // 让 Promise 链跑完
    return { returned, replies };
  };
  return { send, calls };
}
const goodSender = { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}/settings.html` };
const ACTIONS = ['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll'];

test('无关的消息不处理：不回应、不占用异步通道、不调用任何外观方法（含没有消息体的情况）', async () => {
  const { send, calls } = harness();
  for (const message of [{ action: 'jelly_nudge_get' }, { action: 'jelly_appearance' }, { action: 123 }, {}, undefined, null]) {
    const { returned, replies } = await send(message, goodSender);
    assert.equal(returned, undefined, JSON.stringify(message));
    assert.deepEqual(replies, []);
  }
  assert.deepEqual(calls, []);
});

test('发送方不是本扩展页面：三个动作一律拒绝，不调用外观方法，也不占用异步通道', async () => {
  const badSenders = [
    { id: 'someotherextensionidsomeotherextens', url: goodSender.url },                  // 别的扩展
    { id: EXTENSION_ID, url: 'https://example.com/settings.html' },                    // 同 id 但来自网页（例如被注入的内容脚本带着网页地址）
    { id: EXTENSION_ID, url: `chrome-extension://${EXTENSION_ID}.evil.example/x.html` }, // 前缀伪装
    { id: EXTENSION_ID, url: 'chrome-extension://someotherextensionidsomeotherextens/settings.html' },
    { id: EXTENSION_ID },                                                               // 没有来源地址
    {},
  ];
  for (const action of ACTIONS) for (const sender of badSenders) {
    const { send, calls } = harness();
    const { returned, replies } = await send({ action, settings: { color: 1 } }, sender);
    const label = `${action} ← ${JSON.stringify(sender)}`;
    assert.deepEqual(replies, [REJECTION], label);
    assert.notEqual(returned, true, label);
    assert.deepEqual(calls, [], label);
  }
});

test('动作分发：get 只读、set 把 message.settings 原样交给设置、reroll 调 rerollNow', async () => {
  for (const [action, expected] of [
    ['jelly_appearance_get', [['get']]],
    ['jelly_appearance_set', [['set', { color: 6, look: 'duo' }]]],
    ['jelly_appearance_reroll', [['rerollNow']]],
  ]) {
    const { send, calls } = harness();
    const { returned } = await send({ action, settings: { color: 6, look: 'duo' }, other: 'ignored' }, goodSender);
    assert.equal(returned, true, `${action} 要占用异步通道（保持 respond 有效）`);
    assert.deepEqual(plain(calls), expected, action);
  }
});

test('成功回应：带上后台设置的结果，并附组件支持状态、组件确认的画法与连接状态（取自 JellyDesktop，不是写死值）', async () => {
  const result = { ok: true, settings: { color: 3 }, resolved: { color: 3, colors: [3] } };
  const styles = [
    { style: 'unknown', species: 'jelly', realistic: false },
    { style: 'realistic', species: 'whaleshark', realistic: true },
    { style: 'cartoon', species: 'manta', realistic: false },
  ];
  for (const [index, [component, connected]] of [['unsupported', false], ['ok', true], ['unknown', true], ['off', false]].entries()) {
    const style = styles[index % styles.length];
    const { send } = harness({ result, component, connected, style });
    for (const action of ACTIONS) {
      const { replies } = await send({ action, settings: { color: 3 } }, goodSender);
      assert.deepEqual(replies, [{ ...result, component, style, connected }], `${action} component=${component} style=${style.style} connected=${connected}`);
    }
  }
});

test('失败的结果原样转发，不附 component/style/connected（没保存成功就不谈组件状态）', async () => {
  const failure = { ok: false, error: 'color 的取值无效' };
  const { send } = harness({ result: failure, component: 'ok', connected: true });
  for (const action of ACTIONS) {
    const { replies } = await send({ action, settings: { color: 99 } }, goodSender);
    assert.deepEqual(replies, [failure], action);
  }
});

test('后台方法抛错：回应 {ok:false, error}，不留下没有回应的消息', async () => {
  const { send } = harness({ fail: 'boom' });
  for (const action of ACTIONS) {
    const { returned, replies } = await send({ action, settings: {} }, goodSender);
    assert.equal(returned, true);
    assert.deepEqual(replies, [{ ok: false, error: 'boom' }], action);
  }
});
