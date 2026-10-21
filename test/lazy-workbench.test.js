const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const main = read('js/main.js');
const start = main.indexOf('function createLazyWorkbench(');
const end = main.indexOf('async function initApp()');

function fixture() {
  const timers = [];
  const listeners = {};
  const button = {
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); },
  };
  const logs = [];
  const context = {
    console: { error: (...args) => logs.push(args.map(String).join(' ')), log() {}, warn() {} },
    document: { getElementById: id => (id === 'dock' ? button : null) },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
  };
  vm.runInNewContext(main.slice(start, end), context);
  const emit = type => (listeners[type] || []).forEach(listener => listener());
  const runTimers = () => timers.forEach(timer => { const fn = timer.fn; timer.fn = null; fn?.(); });
  return { context, emit, runTimers, logs, timers };
}

function controller({ deferInit = false } = {}) {
  const state = { inits: [], toggles: 0, resolve: null, calls: [] };
  return {
    state,
    init(options) {
      state.inits.push(options);
      state.calls.push('init');
      if (!deferInit) return Promise.resolve();
      return new Promise(resolve => { state.resolve = resolve; });
    },
    toggle() { state.toggles++; state.calls.push('toggle'); },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('启动时不初始化，首次 ensure 才调用 init，且只调用一次', async () => {
  const f = fixture();
  const c = controller();
  const workbench = f.context.createLazyWorkbench(() => c, '测试');
  assert.equal(c.state.inits.length, 0);
  assert.equal(workbench.isStarted(), false);
  await workbench.ensure({ skipInitialView: true });
  await workbench.ensure();
  assert.equal(c.state.inits.length, 1);
  assert.equal(c.state.inits[0].skipInitialView, true);
  assert.equal(workbench.isReady(), true);
});

test('模块缺失时 ensure 以明确错误拒绝', async () => {
  const f = fixture();
  const workbench = f.context.createLazyWorkbench(() => null, '虎牙');
  await assert.rejects(workbench.ensure(), /虎牙模块尚未加载/);
});

test('悬停 200ms 才预热，快速划过不初始化', async () => {
  const f = fixture();
  const c = controller();
  const workbench = f.context.createLazyWorkbench(() => c, '测试');
  f.context.bindLazyDock('dock', workbench, () => c, { name: '测试' });
  f.emit('pointerenter');
  f.emit('pointerleave');
  f.runTimers();
  assert.equal(c.state.inits.length, 0, '划过不算意图');
  f.emit('pointerenter');
  assert.equal(f.timers[f.timers.length - 1].ms, 200);
  f.runTimers();
  await flush();
  assert.equal(c.state.inits.length, 1);
});

test('点击：初始化完成后再打开；等待期间重复点击不会开了又关', async () => {
  const f = fixture();
  const c = controller({ deferInit: true });
  const workbench = f.context.createLazyWorkbench(() => c, '测试');
  f.context.bindLazyDock('dock', workbench, () => c, { name: '测试' });
  f.emit('click');
  f.emit('click');
  assert.deepEqual(c.state.calls, ['init'], '初始化未完成不能先 toggle');
  c.state.resolve();
  await flush();
  assert.deepEqual(c.state.calls, ['init', 'toggle']);
  f.emit('click');
  assert.deepEqual(c.state.calls, ['init', 'toggle', 'toggle'], '已就绪后正常开关');
});

test('openImmediately：同一次点击同步初始化并打开（B 站数据边加载边渲染）', async () => {
  const f = fixture();
  const c = controller({ deferInit: true });
  const workbench = f.context.createLazyWorkbench(() => c, '测试');
  f.context.bindLazyDock('dock', workbench, () => c, { name: '测试', openImmediately: true });
  f.emit('click');
  assert.deepEqual(c.state.calls, ['init', 'toggle']);
});

test('初始化失败：记录错误，面板仍可打开，不重复注入', async () => {
  const f = fixture();
  const c = controller();
  c.init = function () { this.state.inits.push(1); return Promise.reject(new Error('boom')); };
  const workbench = f.context.createLazyWorkbench(() => c, '测试');
  f.context.bindLazyDock('dock', workbench, () => c, { name: '测试' });
  f.emit('click');
  await flush();
  assert.equal(c.state.toggles, 1);
  assert.ok(f.logs.some(line => line.includes('测试工作台初始化失败')));
  f.emit('click');
  await flush();
  assert.equal(c.state.inits.length, 1, '失败后不再重复 init');
});

test('main.js 不再在启动路径无条件初始化三个工作台；闲置动画只在面板打开时运行', () => {
  assert.equal(/await window\.huyaController\.init\(/.test(main), false);
  assert.equal(/window\.bilibiliController\.init\(\)/.test(main), false);
  const alarm = read('css/alarm-center.css');
  assert.ok(/\.alarm-ringing-overlay\.open \.alarm-ringing-glow\s*\{[^}]*animation:\s*alarm-breathe/.test(alarm), '响铃光晕只在 open 时动画');
  assert.equal(/(^|\n)\.alarm-ringing-glow\s*\{[^}]*animation:\s*alarm-breathe/.test(alarm), false, '关闭状态不得带无限动画');
  const v5 = read('css/product-ui-v5.css');
  assert.ok(/body:not\(\.bili-panel-open\) \.bili-live-pulse/.test(v5), 'B 站面板关闭时脉冲停止');
});
