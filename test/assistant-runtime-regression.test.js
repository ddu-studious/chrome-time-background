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
      refresh: async () => {}, loadAICapabilities: async () => {},
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
