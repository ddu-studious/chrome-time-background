const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

// 手动时钟：失焦休息与隐藏释放都靠计时器，测试里不真等。
function clock() {
  let now = 1000;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout(callback, delay) { timers.set(++id, { at: now + delay, callback }); return id; },
    clearTimeout(handle) { timers.delete(handle); },
    pending: () => timers.size,
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = end;
    },
  };
}

async function fixture({ focused = true, hidden = false, effect = 'jellyfish' } = {}) {
  const listeners = new Map();
  const windowListeners = new Map();
  const frames = new Map();
  const calls = { clear: 0, play: 0, pause: 0, skinStart: 0, skinStop: 0, aqStart: 0, aqStop: 0, waterStart: 0, waterStop: 0 };
  const time = clock();
  let frameId = 0;
  const canvasContext = new Proxy({}, { get: (target, key) => target[key] || (() => {
    if (key === 'clearRect') calls.clear++;
    return { addColorStop() {} };
  }) });
  function element() {
    const classes = new Set();
    return {
      dataset: {}, style: { setProperty() {} },
      classList: {
        contains: value => classes.has(value),
        add: value => classes.add(value), remove: value => classes.delete(value),
        toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); },
      },
      setAttribute() {}, addEventListener() {}, getContext: () => canvasContext,
      width: 0, height: 0,
    };
  }
  const body = element();
  const elements = new Map();
  for (const id of ['root', 'canvas', 'detail', 'time', 'toggle', 'hud', 'energy', 'energy-fill', 'status']) {
    elements.set(`background-experience-${id}`, element());
  }
  const state = { focused, hasFocusFn: true };
  const document = {
    body, hidden, readyState: 'loading',
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
    hasFocus: () => state.focused,
  };
  const window = {
    addEventListener(name, listener) {
      if (!windowListeners.has(name)) windowListeners.set(name, []);
      windowListeners.get(name).push(listener);
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    JellyfishSkin: {
      start() { calls.skinStart++; this.active = true; }, stop() { calls.skinStop++; this.active = false; },
      isActive() { return !!this.active; }, frame() {}, bells: () => [],
    },
    Aquarium: {
      start() { calls.aqStart++; this.active = true; }, stop() { calls.aqStop++; this.active = false; },
      isActive() { return !!this.active; }, frame() {}, cancel() {},
    },
    AquariumWater: {
      start() { calls.waterStart++; this.active = true; }, stop() { calls.waterStop++; this.active = false; },
      isActive() { return !!this.active; }, frame() {}, shore: () => null,
    },
  };
  const context = vm.createContext({
    window, document, navigator: {}, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    performance: { now: () => time.now() },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout: time.setTimeout, clearTimeout: time.clearTimeout,
    setInterval() { return 1; }, clearInterval() {},
    Element: class {},
    MutationObserver: class { observe() {} },
    chrome: {
      runtime: { sendMessage() {} },
      storage: {
        sync: { get() { return Promise.resolve({ backgroundExperienceSettings: { visualEffect: effect } }); } },
        onChanged: { addListener() {} },
      },
    },
  });
  vm.runInContext(read('js/background-experience.js'), context);
  for (const listener of listeners.get('DOMContentLoaded') || []) listener();
  await tick();
  const fire = (target, name, event = {}) => (target.get(name) || []).forEach(listener => listener(event));
  const canvas = elements.get('background-experience-canvas');
  return {
    window, document, body, calls, frames, time, canvas, state,
    experience: window.backgroundExperience,
    blur() { state.focused = false; fire(windowListeners, 'blur'); },
    focus() { state.focused = true; fire(windowListeners, 'focus'); },
    resize() { fire(windowListeners, 'resize'); },
    hover() { fire(listeners, 'pointermove', { pointerId: 1, buttons: 0, pointerType: 'mouse', clientX: 10, clientY: 10, target: null }); },
    visibility(value) { document.hidden = value; fire(listeners, 'visibilitychange'); },
    render(now = 116) { for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); } },
  };
}

test('失焦 4 秒后冻结帧循环并保留最后一帧，不清屏', async () => {
  const f = await fixture();
  assert.equal(f.frames.size, 1, '有焦点时在画');
  f.render();
  const clears = f.calls.clear;
  f.blur();
  assert.equal(f.frames.size, 1, '刚失焦还有宽限，不立刻停（切个窗口再回来不该闪）');
  f.time.advance(3999);
  assert.equal(f.experience.isResting(), false);
  f.time.advance(2);
  assert.equal(f.experience.isResting(), true);
  assert.equal(f.frames.size, 0, '休息后已取消待执行的帧');
  f.render();
  for (let i = 0; i < 30; i++) f.render();
  assert.equal(f.calls.clear, clears, '冻结时不清屏、不再绘制（画面停在最后一帧）');
  assert.equal(f.body.classList.contains('home-resting'), true, '无限 CSS 动画靠这个类暂停');
  assert.equal(f.body.classList.contains('home-background-suspended'), false, '失焦不是被遮挡：不隐藏壁纸与背景层');
});

test('回到焦点立刻恢复；宽限内回来则什么都不发生', async () => {
  const f = await fixture();
  f.blur();
  f.time.advance(2000);
  f.focus();
  assert.equal(f.time.pending(), 0, '回来后清掉休息计时器');
  f.time.advance(10000);
  assert.equal(f.experience.isResting(), false);
  f.blur();
  f.time.advance(5000);
  f.render();
  assert.equal(f.frames.size, 0);
  f.focus();
  assert.equal(f.experience.isResting(), false);
  assert.equal(f.frames.size, 1, '恢复后重新调度一帧');
  assert.equal(f.body.classList.contains('home-resting'), false);
});

test('失焦窗口里的真实悬停会唤醒，停下 4 秒后重新休息', async () => {
  const f = await fixture();
  f.blur();
  f.time.advance(4100);
  assert.equal(f.experience.isResting(), true);
  f.hover();
  assert.equal(f.experience.isResting(), false);
  assert.equal(f.frames.size, 1);
  f.time.advance(2000);
  f.hover();
  f.time.advance(3000);
  assert.equal(f.experience.isResting(), false, '指针一直在动就不该睡');
  f.time.advance(2000);
  assert.equal(f.experience.isResting(), true);
});

test('有焦点时指针移动不会碰休息计时器', async () => {
  const f = await fixture();
  f.hover();
  f.hover();
  assert.equal(f.time.pending(), 0);
});

test('页面在没有焦点的窗口里打开，同样会进入休息', async () => {
  const f = await fixture({ focused: false });
  assert.equal(f.experience.isResting(), false);
  f.time.advance(4100);
  assert.equal(f.experience.isResting(), true);
});

test('旧环境没有 document.hasFocus 时按有焦点处理，永不休息', async () => {
  const f = await fixture();
  f.document.hasFocus = undefined;
  f.blur();
  f.time.advance(60000);
  assert.equal(f.experience.isResting(), true, 'blur 事件本身仍然有效');
  f.focus();
  assert.equal(f.experience.isResting(), false);
});

test('休息状态通知监听者，监听者出错不影响休息', async () => {
  const f = await fixture();
  const seen = [];
  f.experience.onRestChange(value => seen.push(value));
  f.experience.onRestChange(() => { throw new Error('boom'); });
  f.blur();
  f.time.advance(4100);
  f.focus();
  assert.deepEqual(seen, [true, false]);
});

test('隐藏超过 60 秒才释放海洋生态与共享画布，回到页面完整恢复', async () => {
  const f = await fixture();
  assert.equal(f.calls.skinStart, 1);
  assert.equal(f.calls.aqStart, 1);
  assert.equal(f.calls.waterStart, 1);
  f.visibility(true);
  f.time.advance(59000);
  assert.equal(f.calls.aqStop, 0, '短暂切走不释放');
  assert.ok(f.canvas.width > 1);
  f.time.advance(2000);
  assert.equal(f.calls.skinStop >= 1 && f.calls.aqStop >= 1 && f.calls.waterStop >= 1, true, '三层都按各自原有的停止入口销毁');
  assert.equal(f.canvas.width, 1);
  assert.equal(f.canvas.height, 1);
  f.visibility(false);
  assert.equal(f.calls.skinStart, 2);
  assert.equal(f.calls.aqStart, 2);
  assert.equal(f.calls.waterStart, 2);
  assert.ok(f.canvas.width > 1, '画布尺寸恢复');
  assert.equal(f.frames.size, 1);
});

test('不到 60 秒就回来：取消释放计时器，什么都不重启', async () => {
  const f = await fixture();
  f.visibility(true);
  f.time.advance(30000);
  f.visibility(false);
  assert.equal(f.time.pending(), 0);
  f.time.advance(120000);
  assert.equal(f.calls.aqStop, 0);
  assert.equal(f.calls.aqStart, 1);
});

test('释放期间窗口尺寸变化不会重新分配大画布', async () => {
  const f = await fixture();
  f.visibility(true);
  f.time.advance(61000);
  assert.equal(f.canvas.width, 1);
  f.resize();
  assert.equal(f.canvas.width, 1);
});

test('隐藏时又变成失焦再回来：先恢复，再按焦点状态决定是否冻结', async () => {
  const f = await fixture();
  f.blur();
  f.time.advance(4100);
  f.visibility(true);
  f.time.advance(61000);
  f.visibility(false);
  assert.equal(f.experience.isResting(), true, '仍然没有焦点');
  assert.ok(f.frames.size === 1, '回到可见时先补画几帧，避免背景一片空白');
  f.render(); f.render(); f.render(); f.render();
  assert.equal(f.frames.size, 0, '补画后冻结');
});

test('非水母皮肤也只释放共享画布，不调用海洋生态入口', async () => {
  const f = await fixture({ effect: 'liquid' });
  const before = { aqStop: f.calls.aqStop, skinStop: f.calls.skinStop, waterStop: f.calls.waterStop };
  f.visibility(true);
  f.time.advance(61000);
  assert.equal(f.canvas.width, 1);
  assert.deepEqual({ aqStop: f.calls.aqStop, skinStop: f.calls.skinStop, waterStop: f.calls.waterStop }, before, '释放时没有额外调用海洋生态的停止入口');
  f.visibility(false);
  assert.ok(f.canvas.width > 1);
  assert.equal(f.calls.aqStart, 0);
});

test('接线：CSS 暂停失焦动画、index 版本号、main.js 失焦不轮换壁纸', () => {
  const css = read('css/background-experience.css');
  assert.ok(/body\.home-resting \.bgx-root \*[\s\S]{0,200}animation-play-state: paused !important/.test(css), 'CSS 暂停规则');
  assert.ok(/body\.home-resting \.ticker-mini-track/.test(css), '滚动条暂停规则');
  assert.equal(/body\.home-resting[^{]*\{[^}]*display:\s*none/.test(css), false, '休息不隐藏任何图层');
  const main = read('js/main.js');
  assert.ok(/onRestChange\?\.\(/.test(main), 'main.js 订阅休息状态');
  assert.ok(/_bgAutoSwitchTimer = setInterval\(\(\) => \{\s*if \(!_isBackgroundSuspended\(\) && !_isBackgroundResting\(\)/.test(main), '失焦不轮换壁纸');
});
