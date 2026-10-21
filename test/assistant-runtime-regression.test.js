const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function startupFixture(embeddedMode = true) {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const events = [], writes = []; let releaseDraft;
  const context = vm.createContext({
    DRAFT: 'draft', draftReady: false, draftEdited: false, snapshotReady: false,
    input: { value: '' }, app: null, skill: null, scopeExplicit: false, aiModel: '', aiReasoning: '', menu: null,
    modelOptionsData: null, C: require('../js/assistant-contract.js'), document: { activeElement: null },
    chrome: { storage: { local: { get: () => new Promise(resolve => { releaseDraft = resolve; }), set: async patch => writes.push(patch) } } },
    refresh: () => { events.push('refresh'); return new Promise(() => {}); },
    loadAICapabilities: () => { events.push('capabilities'); return new Promise(() => {}); },
    loadLayaControl: () => { events.push('laya'); return new Promise(() => {}); },
    renderTokens: () => events.push('tokens'), renderMenu: () => events.push('menu'), renderTask: () => events.push('task'),
    renderModelOptions: () => events.push('model-options'), focusInput: () => events.push('focus'),
    embedded: new URLSearchParams(embeddedMode ? 'embedded=1&nonce=test&hostOrigin=https%3A%2F%2Fx.com' : ''),
    parent: { postMessage(message, origin) { events.push({ ...message, origin }); } }
  });
  const restoreStart = source.indexOf('  async function restoreDraft()');
  const restoreEnd = source.indexOf("  if (embedded.get('embedded')", restoreStart);
  vm.runInContext(source.slice(restoreStart, restoreEnd), context);
  const originalRestore = context.restoreDraft;
  context.restoreDraft = () => { context.restoring = originalRestore(); return context.restoring; };
  const start = source.indexOf('  function initialize()');
  vm.runInContext(source.slice(start, source.lastIndexOf('})();')), context);
  return { context, events, writes, release: value => releaseDraft({ draft: value }) };
}

test('编辑器就绪不等待草稿、任务、模型或策略；跨域由宿主聚焦，独立页自动聚焦', async () => {
  for (const embeddedMode of [true, false]) {
    const f = startupFixture(embeddedMode);
    assert.deepEqual(f.events, ['tokens', 'menu', 'task', embeddedMode
      ? { type: 'assistant_ready', nonce: 'test', origin: 'https://x.com' } : 'focus', 'refresh', 'capabilities', 'laya']);
    assert.equal(f.context.draftReady, false);
    f.release(null); await f.context.restoring;
    assert.equal(f.context.draftReady, true);
  }
});

test('草稿迟到不覆盖新输入或刚选择的应用；未编辑时仍恢复草稿和模型选择', async () => {
  for (const edited of [false, true]) {
    const f = startupFixture(); f.context.modelOptionsData = {};
    if (edited) { f.context.draftEdited = true; f.context.input.value = '我刚写的内容'; f.context.app = 'alarm'; }
    f.release({ text: '旧草稿', app: 'music', aiModel: 'selected-model', aiReasoning: 'low' });
    await f.context.restoring;
    assert.equal(f.context.input.value, edited ? '我刚写的内容' : '旧草稿');
    assert.equal(f.context.app, edited ? 'alarm' : 'music');
    if (!edited) { assert.equal(f.context.aiModel, 'selected-model'); assert.ok(f.events.includes('model-options')); }
    assert.equal(f.writes.length, 0);
  }
});

test('草稿未读出就收起不会用空内容覆盖旧草稿；用户已编辑仍正常保存', async () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const fragment = source.slice(source.indexOf('  const hide ='), source.indexOf("  $('hide').addEventListener"));
  for (const edited of [false, true]) {
    const writes = [], calls = [];
    const context = vm.createContext({ draftReady: false, draftEdited: edited, DRAFT: 'draft', draftTimer: 1,
      input: { value: edited ? '新内容' : '' }, app: null, skill: null, scopeExplicit: false, aiModel: '', aiReasoning: '',
      clearTimeout() {}, stopVoice() {}, error() {}, send: async action => calls.push(action),
      chrome: { storage: { local: { set: async patch => writes.push(patch) } } }
    });
    vm.runInContext(fragment + '\nhide();', context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, Number(edited)); assert.deepEqual(calls, ['assistant_hide']);
  }
});

test('任务快照未恢复时只允许编辑，回车不能提交未知任务上下文', async () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const start = source.indexOf("  $('compose').addEventListener('submit'");
  const end = source.indexOf("  $('compact-context')", start);
  let handler, message;
  const context = vm.createContext({ $: () => ({ addEventListener: (_event, fn) => { handler = fn; } }),
    busy: () => false, snapshotReady: false, error: value => { message = value; },
    requestAI() { assert.fail('快照未恢复不可继续提交'); }
  });
  vm.runInContext(source.slice(start, end), context);
  await handler({ preventDefault() {} }); assert.match(message, /读取当前任务/);
});

test('初始化与聚焦重叠只读取一次策略，请求结束后再次聚焦读取最新值', async () => {
  const source = fs.readFileSync(require.resolve('../js/assistant.js'), 'utf8');
  const start = source.indexOf('  let layaPending =');
  const end = source.indexOf('  function error(', start);
  let count = 0, release; const rendered = [];
  const context = vm.createContext({ layaSaving: false,
    send: () => { count++; return new Promise(resolve => release = resolve); },
    renderLayaControl: value => rendered.push(value) });
  vm.runInContext(source.slice(start, end), context);
  const first = context.loadLayaControl(), second = context.loadLayaControl();
  assert.equal(first, second); assert.equal(count, 1);
  release({ revision: 1 }); await first;
  const next = context.loadLayaControl(); assert.equal(count, 2);
  release({ revision: 2 }); await next;
  assert.deepEqual(rendered, [{ revision: 1 }, { revision: 2 }]);
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
