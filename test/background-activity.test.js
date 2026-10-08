const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let reject;
  const promise = new Promise((_, no) => { reject = no; });
  return { promise, reject };
}

async function fixture({ hidden = false, panels = [], effect = 'liquid' } = {}) {
  const listeners = new Map();
  const observers = [];
  const frames = new Map();
  const intervals = [];
  const calls = { play: 0, pause: 0, clear: 0 };
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
    };
  }
  const body = element();
  panels.forEach(value => body.classList.add(value));
  const elements = new Map();
  for (const id of ['root', 'canvas', 'detail', 'time', 'toggle', 'hud', 'energy', 'energy-fill', 'status']) {
    elements.set(`background-experience-${id}`, element());
  }
  let playResult = null;
  const video = {
    src: '', paused: true, style: {}, autoplay: false,
    getAttribute: name => name === 'src' ? video.src : null,
    removeAttribute(name) { if (name === 'src') this.src = ''; },
    load() {},
    pause() { calls.pause++; this.paused = true; },
    play() { calls.play++; this.paused = false; return playResult || Promise.resolve(); },
  };
  elements.set('background-video', video);
  const document = {
    body, hidden, readyState: 'loading',
    getElementById: id => elements.get(id) || null,
    querySelector: () => null,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(listener);
    },
  };
  const window = { addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }) };
  const context = vm.createContext({
    window, document, navigator: {}, innerWidth: 1440, innerHeight: 900, devicePixelRatio: 2,
    performance: { now: () => 100 },
    requestAnimationFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setInterval(callback) { intervals.push(callback); return intervals.length; }, clearInterval() {},
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target) { if (target === body) observers.push(this.callback); }
    },
    chrome: {
      runtime: { sendMessage() {} },
      storage: {
        sync: { get(key, callback) {
          if (callback) return callback({ settings: {} });
          return Promise.resolve({ backgroundExperienceSettings: { visualEffect: effect } });
        } },
        onChanged: { addListener() {} },
      },
    },
  });
  vm.runInContext(read('js/background-experience.js'), context);
  const main = read('js/main.js');
  vm.runInContext(main.slice(main.indexOf('// ==================== 背景系统'), main.indexOf('// 注意：时间显示')), context);
  for (const listener of listeners.get('DOMContentLoaded') || []) listener();
  await tick();
  function notify() { observers.forEach(callback => callback()); }
  return {
    context, window, document, body, video, calls, frames, intervals,
    experience: window.backgroundExperience,
    apply(id = 'one') { context._applyBackground({ mediaType: 'video', videoUrl: `https://example.com/${id}.mp4`, url: `https://example.com/${id}.jpg` }); },
    panel(name, open) { body.classList.toggle(name, open); notify(); },
    visibility(value) { document.hidden = value; (listeners.get('visibilitychange') || []).forEach(listener => listener()); },
    playResult(value) { playResult = value; },
    render(now = 116) {
      for (const [id, callback] of [...frames]) { frames.delete(id); callback(now); }
    },
    notify,
  };
}

test('B 站打开后停止背景视频与帧调度，关闭后只恢复一次', async () => {
  const f = await fixture();
  f.apply();
  f.render();
  assert.equal(f.frames.size, 1);
  f.panel('bili-panel-open', true);
  assert.equal(f.video.paused, true);
  assert.equal(f.frames.size, 0);
  const clears = f.calls.clear;
  for (let i = 0; i < 60; i++) f.render();
  assert.equal(f.calls.clear, clears, '被遮挡后没有后台逐帧清屏');
  assert.equal(f.body.classList.contains('home-background-suspended'), true);
  f.notify();
  f.panel('bili-panel-open', false);
  f.notify();
  assert.equal(f.frames.size, 1);
  assert.equal(f.video.paused, false);
  assert.equal(f.calls.play, 2);
});

test('B 站与 YouTube 重叠或标签页隐藏时，不提前恢复背景', async () => {
  const f = await fixture();
  f.apply();
  f.panel('bili-panel-open', true);
  f.panel('youtube-workbench-open', true);
  f.panel('bili-panel-open', false);
  f.visibility(true);
  f.panel('youtube-workbench-open', false);
  assert.equal(f.calls.play, 1);
  assert.equal(f.frames.size, 0);
  f.visibility(false);
  assert.equal(f.calls.play, 2);
  assert.equal(f.frames.size, 1);
});

test('先打开工作台或后台加载页面，再到达的壁纸不会自动播放', async () => {
  for (const options of [{ hidden: true }, { panels: ['bili-panel-open'] }, { panels: ['youtube-workbench-open'] }]) {
    const f = await fixture(options);
    f.apply();
    assert.equal(f.calls.play, 0);
    assert.equal(f.frames.size, 0);
    assert.equal(f.video.paused, true);
  }
  assert.doesNotMatch(read('index.html'), /<video id="background-video"[^>]*\bautoplay\b/);
});

test('暂停引起的迟到 play 失败不会抹掉已经恢复的壁纸', async () => {
  const f = await fixture();
  const pending = deferred();
  f.playResult(pending.promise);
  f.apply();
  f.panel('bili-panel-open', true);
  f.playResult(null);
  f.panel('bili-panel-open', false);
  pending.reject(new Error('late play rejection'));
  await tick();
  assert.equal(f.video.src, 'https://example.com/one.mp4');
  assert.equal(f.document.body.dataset.backgroundMedia, 'video');
  assert.equal(f.video.paused, false);
});

test('旧来源失败不覆盖新壁纸，当前来源真实失败仍回退静态图', async () => {
  const f = await fixture();
  const old = deferred();
  f.playResult(old.promise);
  f.apply('old');
  f.playResult(null);
  f.apply('new');
  old.reject(new Error('old source failed'));
  await tick();
  assert.equal(f.video.src, 'https://example.com/new.mp4');
  const current = deferred();
  f.playResult(current.promise);
  f.apply('failed');
  current.reject(new Error('decoder failed'));
  await tick();
  assert.equal(f.video.src, '');
  assert.equal(f.document.body.dataset.backgroundMedia, 'image');
  assert.equal(f.document.body.style.backgroundImage, 'url(https://example.com/failed.jpg)');
});

test('暂停期间不自动轮换壁纸，恢复后沿用原轮换间隔', async () => {
  const f = await fixture();
  vm.runInContext("backgroundImages = [{url: 'https://example.com/a.jpg'}, {url: 'https://example.com/b.jpg'}]; setupBackgroundAutoSwitch();", f.context);
  f.apply();
  f.panel('youtube-workbench-open', true);
  f.intervals[0]();
  assert.equal(f.video.src, 'https://example.com/one.mp4');
  f.panel('youtube-workbench-open', false);
  f.intervals[0]();
  assert.equal(f.video.src, '');
  assert.equal(f.intervals.length, 1);
});

test('暂停保留壁纸来源和进度，恢复时真实播放失败仍展示静态背景', async () => {
  const f = await fixture();
  f.apply();
  f.video.currentTime = 42;
  f.panel('youtube-workbench-open', true);
  assert.equal(f.video.src, 'https://example.com/one.mp4');
  assert.equal(f.video.currentTime, 42);
  const pending = deferred();
  f.playResult(pending.promise);
  f.panel('youtube-workbench-open', false);
  pending.reject(new Error('resume failed'));
  await tick();
  assert.equal(f.document.body.dataset.backgroundMedia, 'image');
  assert.equal(f.video.paused, true);
});

test('天气从晴天转为雨雪时启动动画，天气清除后停止', async () => {
  const f = await fixture({ effect: 'weather' });
  assert.equal(f.frames.size, 0);
  f.experience.weather = 'rain';
  f.experience.applySettings();
  assert.equal(f.frames.size, 1);
  f.render();
  f.experience.weather = 'clear';
  f.experience.applySettings();
  assert.equal(f.frames.size, 0);
});

test('静态皮肤无空转帧，手势世界唤醒与休眠仍可切换', async () => {
  for (const effect of ['depth', 'memory', 'time', 'none']) {
    const f = await fixture({ effect });
    assert.equal(f.frames.size, 0, effect);
    f.experience.setActive(true);
    assert.equal(f.frames.size, 1);
    f.experience.setActive(true);
    assert.equal(f.frames.size, 1, '不能出现重复动画循环');
    f.experience.setActive(false);
    assert.equal(f.frames.size, 0);
  }
});

test('动态效果设置在暂停期间变更也不启动帧，恢复时使用最新设置', async () => {
  const f = await fixture({ effect: 'none' });
  f.panel('bili-panel-open', true);
  f.experience.settings.visualEffect = 'liquid';
  f.experience.applySettings();
  assert.equal(f.frames.size, 0);
  f.panel('bili-panel-open', false);
  assert.equal(f.frames.size, 1);
  f.experience.settings.enabled = false;
  f.experience.applySettings();
  assert.equal(f.frames.size, 0);
});

test('恢复动画不会把隐藏时长作为一步物理时间，悬停不唤醒背景', async () => {
  const f = await fixture();
  f.render(1000);
  f.experience.pointer.down = true;
  f.panel('bili-panel-open', true);
  assert.equal(f.experience.pointer.down, false);
  f.experience.onPointerMove({ clientX: 4, clientY: 5 });
  assert.equal(f.frames.size, 0);
  f.panel('bili-panel-open', false);
  assert.equal(f.experience.lastFrame, 0);
  f.render(100000);
  assert.equal(f.frames.size, 1);
});
