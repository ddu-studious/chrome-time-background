const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('初始化时跨域输入条等待宿主聚焦，独立窗口仍自动聚焦', async () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const start = source.indexOf('  (async () => {');
  const end = source.indexOf('  const embedded =', start);
  assert.ok(start >= 0 && end > start);
  for (const embeddedMode of [true, false]) {
    const events = [];
    const context = {
      DRAFT: 'draft', chrome: { storage: { local: { get: async () => ({}) } } },
      refresh: async () => {}, loadAICapabilities: async () => {}, loadLayaControl: async () => {},
      renderTokens() {}, renderMenu() {}, focusInput: () => events.push('focus'),
      embedded: new URLSearchParams(embeddedMode ? 'embedded=1&nonce=test&hostOrigin=https%3A%2F%2Fx.com' : ''),
      parent: { postMessage(message, origin) { events.push({ ...message, origin }); } }
    };
    await vm.runInNewContext(source.slice(start, end), context);
    assert.deepEqual(events, embeddedMode
      ? [{ type: 'assistant_ready', nonce: 'test', origin: 'https://x.com' }]
      : ['focus']);
  }
});

test('就绪信号不等待快照、模型与本机策略：三项加载仍会发起，返回后再补渲染', async () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const start = source.indexOf('  (async () => {');
  const end = source.indexOf('  const embedded =', start);
  assert.ok(start >= 0 && end > start);
  for (const embeddedMode of [true, false]) {
    const events = [], gates = [];
    const pending = name => { events.push(name); return new Promise(resolve => gates.push(resolve)); };
    const context = {
      DRAFT: 'draft', chrome: { storage: { local: { get: async () => ({}) } } },
      refresh: () => pending('refresh'), loadAICapabilities: () => pending('capabilities'), loadLayaControl: () => pending('laya'),
      renderTokens: () => events.push('tokens'), renderMenu: () => events.push('menu'), focusInput: () => events.push('focus'),
      embedded: new URLSearchParams(embeddedMode ? 'embedded=1&nonce=test&hostOrigin=https%3A%2F%2Fx.com' : ''),
      parent: { postMessage: message => events.push(message.type) }
    };
    const done = vm.runInNewContext(source.slice(start, end), context);
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    // 三个请求都还没有返回：首屏渲染完成后必须已经发出就绪信号（宿主 4 秒内收不到就会撤下浮层并改开小窗）。
    assert.deepEqual(events, ['tokens', 'menu', embeddedMode ? 'assistant_ready' : 'focus', 'refresh', 'capabilities', 'laya']);
    gates.forEach(resolve => resolve());
    await done;
    assert.deepEqual(events.slice(-2), ['tokens', 'menu']);
  }
});

test('助手输入条的就绪信号只在首屏渲染之后发出，且不再依赖任何后台往返', () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const start = source.indexOf('  (async () => {');
  const end = source.indexOf('  const embedded =', start);
  const body = source.slice(start, end);
  const ready = body.indexOf("type: 'assistant_ready'");
  assert.ok(ready > 0);
  assert.ok(body.indexOf('renderTokens()') < ready, '首屏必须先渲染再通知宿主');
  // 就绪之前只允许读取本地草稿；快照/模型/策略请求必须排在就绪之后。
  for (const name of ['refresh()', 'loadAICapabilities()', 'loadLayaControl()']) assert.ok(body.indexOf(name) > ready, `${name} 不得在就绪信号之前等待`);
  assert.equal((body.slice(0, ready).match(/\bawait\b/g) || []).length, 1, '就绪之前只允许等待草稿读取');
});

function offscreenFixture({ response, runtimeError } = {}) {
  const source = fs.readFileSync(require.resolve('../js/background.js'), 'utf8');
  const start = source.indexOf('    async function sendToOffscreen(');
  const end = source.indexOf('    const musicSleep =', start);
  assert.ok(start >= 0 && end > start);
  let errorRead = false, inCallback = false, dispatches = 0;
  const context = {
    ensureOffscreen: async () => {},
    chrome: { runtime: {
      get lastError() { assert.equal(inCallback, true); errorRead = true; return runtimeError; },
      sendMessage(message, callback) {
        dispatches++;
        assert.equal(message.target, 'offscreen');
        inCallback = true;
        callback(response);
        inCallback = false;
        assert.equal(errorRead, true, '必须在回调结束前读取 lastError');
      }
    } }
  };
  vm.runInNewContext(source.slice(start, end), context);
  return { send: context.sendToOffscreen, dispatches: () => dispatches };
}

test('音频消息通道关闭时读取 lastError 并返回失败原因', async () => {
  const message = 'The message port closed before a response was received.';
  const f = offscreenFixture({ runtimeError: { message }, response: { ok: true } });
  const result = await f.send({ command: 'getState' });
  assert.equal(result.ok, false);
  assert.equal(result.error, message);
});

test('音频回复保持原样，空回复返回明确失败', async () => {
  const response = { ok: true, data: { isPlaying: true } };
  assert.equal(await offscreenFixture({ response }).send({ command: 'getState' }), response);
  const empty = await offscreenFixture().send({ command: 'getState' });
  assert.equal(empty.ok, false);
  assert.equal(empty.error, '音频页面未响应');
});

test('播放请求过期时仍先执行 guard，禁止发出音频消息', async () => {
  const f = offscreenFixture();
  await assert.rejects(f.send({ command: 'play' }, () => { throw new Error('stale'); }), /stale/);
  assert.equal(f.dispatches(), 0);
});
