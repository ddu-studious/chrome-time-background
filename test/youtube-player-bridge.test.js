const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/youtube-controller.js'), 'utf8');

function harness({ navigation = false, frames = [], getCurrent } = {}) {
  let now = 1;
  let nextTimer = 1;
  const timers = new Map();
  const navigationListeners = new Set();
  const messages = [];
  const context = {
    URL, console,
    Date: class extends Date { static now() { return now; } },
    window: {
      setInterval(callback, period) {
        const id = nextTimer++;
        timers.set(id, { callback, period, due: now + period });
        return id;
      },
      clearInterval(id) { timers.delete(id); },
      cancelAnimationFrame() {},
    },
  };
  if (navigation) context.chrome = {
    tabs: { getCurrent: getCurrent || (() => Promise.resolve({ id: 7 })) },
    webNavigation: {
      onCommitted: {
        addListener(callback) { navigationListeners.add(callback); },
        removeListener(callback) { navigationListeners.delete(callback); },
      },
      getAllFrames: () => Promise.resolve(frames),
    },
  };
  vm.runInNewContext(source, context);
  const controller = context.window.youtubeController;
  controller._captureWatchProgress = () => {};
  controller._schedulePlayerControlUpdate = () => {};
  controller._recordWatchHistory = () => {};
  const frame = {
    id: 'yt-player-frame', isConnected: true,
    src: 'https://www.youtube.com/embed/AAA00000001?enablejsapi=1',
    contentWindow: { postMessage(payload, origin) { messages.push({ ...JSON.parse(payload), origin, at: now }); } },
    addEventListener(type, callback) { if (type === 'load') this.onLoad = callback; },
  };
  controller._attachPlayerBridge(frame);
  const emit = (event, info) => controller._handlePlayerMessage({
    origin: 'https://www.youtube.com', source: frame.contentWindow, data: { event, info },
  });
  const advance = duration => {
    const end = now + duration;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due;
      next[1].due += next[1].period;
      next[1].callback();
    }
    now = end;
  };
  const commit = overrides => {
    const details = { tabId: 7, frameId: 12, parentFrameId: 0, url: frame.src, documentLifecycle: 'active', ...overrides };
    for (const callback of [...navigationListeners]) callback(details);
  };
  return { controller, frame, messages, emit, advance, commit, timers, navigationListeners,
    rateCommands: () => messages.filter(message => message.func === 'setPlaybackRate') };
}

const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function controls(controller) {
  const status = { textContent: '' };
  const buttons = [0.75, 1, 1.25, 1.5, 2].map(rate => ({
    dataset: { rate: String(rate) }, disabled: true, hidden: false, pressed: 'false',
    getAttribute() { return this.pressed; },
    setAttribute(name, value) { this.pressed = value; },
  }));
  controller.stage = {
    querySelector(selector) { return selector === '[data-yt-player-status]' ? status : null; },
    querySelectorAll() { return buttons; },
  };
  return { status, buttons };
}

test('Chrome 证明当前 iframe 已提交后即可连接，不等完整 load；首次回报也可启动倍速', async () => {
  const h = harness({ navigation: true });
  await settle();
  h.advance(1400);
  assert.equal(h.messages.length, 0, 'about:blank 阶段不能猜测来源');
  h.commit({ tabId: 8 });
  h.commit({ parentFrameId: 12 });
  h.commit({ url: 'https://www.youtube.com/embed/BBB00000002?enablejsapi=1' });
  h.commit({ documentLifecycle: 'cached' });
  assert.equal(h.messages.length, 0);
  h.commit();
  assert.equal(h.controller.playerBridge.loaded, false);
  assert.equal(h.messages[0].event, 'listening');
  assert.equal(h.messages[0].origin, 'https://www.youtube.com');
  assert.equal(h.navigationListeners.size, 0);
  h.emit('initialDelivery', { playerState: 5, playbackRate: 1, availablePlaybackRates: [1, 2] });
  assert.equal(h.rateCommands().length, 1);
  assert.equal(h.controller.playerBridge.autoRatePending, true, '发送命令还不是成功');
  assert.equal(h.controller.playerBridge.playbackRate, 1);
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  assert.equal(h.controller.playerBridge.autoRatePending, false);
  assert.equal(h.timers.size, 0, '确认后停止握手与倍速轮询');
});

test('导航已在 getCurrent 返回前提交时，当前标签的唯一真实帧快照可补上；重复帧不可猜测', async () => {
  const frame = { frameId: 12, parentFrameId: 0, url: 'https://www.youtube.com/embed/AAA00000001?enablejsapi=1', documentLifecycle: 'active' };
  const h = harness({ navigation: true, frames: [frame] });
  await settle();
  assert.equal(h.messages[0].event, 'listening');
  const duplicate = harness({ navigation: true, frames: [frame, { ...frame, frameId: 13 }] });
  await settle();
  assert.equal(duplicate.messages.length, 0);
});

test('导航查询失败仍保留真实 iframe load 路径，不能提前发送或遗留监听', async () => {
  const h = harness({ navigation: true, getCurrent: () => Promise.reject(new Error('unavailable')) });
  await settle();
  assert.equal(h.navigationListeners.size, 0);
  h.advance(14000);
  assert.equal(h.messages.length, 0);
  h.frame.onLoad();
  assert.equal(h.messages[0].event, 'listening');
  h.emit('onReady');
  assert.equal(h.rateCommands().length, 0, '就绪但视频未 cued 时不能过早设置后被加载重置');
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1 });
  assert.equal(h.rateCommands().length, 1);
});

test('首次 2 倍速未生效会有界补设，真实 2 倍速回报才点亮按钮并结束', () => {
  const h = harness();
  const ui = controls(h.controller);
  h.controller._updatePlayerControls();
  assert.equal(ui.buttons.at(-1).pressed, 'false');
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1, availablePlaybackRates: [1, 2] });
  h.controller._updatePlayerControls();
  assert.equal(ui.buttons.at(-1).pressed, 'false');
  h.emit('infoDelivery', { playbackRate: 1 });
  h.advance(2100);
  assert.equal(h.rateCommands().length, 2);
  assert.equal(h.controller.playerBridge.autoRatePending, true);
  h.emit('onPlaybackRateChange', 2);
  h.controller._updatePlayerControls();
  assert.equal(ui.buttons.at(-1).pressed, 'true');
  assert.equal(h.controller.playerBridge.autoRatePending, false);
  h.advance(60000);
  assert.equal(h.rateCommands().length, 2);
  h.emit('infoDelivery', { playbackRate: 1 });
  h.advance(10000);
  assert.equal(h.rateCommands().length, 2, '成功后在原生播放器改速也不能被自动重试覆盖');
});

test('一直未确认最多设置 6 次并提示失败；不支持 2 倍速时不盲目发送', () => {
  const h = harness();
  const ui = controls(h.controller);
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1, availablePlaybackRates: [1, 2] });
  h.advance(61000);
  assert.equal(h.rateCommands().length, 6);
  assert.equal(h.controller.playerBridge.autoRateFailed, true);
  assert.equal(h.timers.size, 0);
  h.controller._updatePlayerControls();
  assert.match(ui.status.textContent, /未确认/);
  h.emit('infoDelivery', { playbackRate: 2 });
  assert.equal(h.controller.playerBridge.autoRateFailed, false, '迟到的真实成功回报应清除失败提示');
  const unsupported = harness();
  unsupported.frame.onLoad();
  unsupported.emit('infoDelivery', { playerState: 1, playbackRate: 1, availablePlaybackRates: [1] });
  unsupported.advance(61000);
  assert.equal(unsupported.rateCommands().length, 0);
  assert.equal(unsupported.controller.playerBridge.autoRatePending, false);
  assert.equal(unsupported.timers.size, 0);
  const unsupportedUi = controls(unsupported.controller);
  unsupported.controller._updatePlayerControls();
  assert.match(unsupportedUi.status.textContent, /暂未提供/);
});

test('手动选速取消自动补设，失败后可手动再试且 UI 仍等待真实回报', () => {
  const h = harness();
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1, availablePlaybackRates: [1, 1.5, 2] });
  h.controller._setPlayerRate(1.5);
  assert.equal(h.controller.playerBridge.playbackRate, 1);
  h.emit('infoDelivery', { playbackRate: 1.5 });
  h.advance(61000);
  assert.deepEqual(h.rateCommands().map(message => message.args[0]), [2, 1.5]);
  assert.equal(h.controller.playerBridge.autoRatePending, false);
  h.controller._setPlayerRate(2);
  h.emit('infoDelivery', { playbackRate: 2 });
  assert.equal(h.controller.playerBridge.playbackRate, 2);
});

test('原位切换不能将上个视频的迟到 2× 当成功，核对新视频标识后仍会补设', async () => {
  const h = harness();
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2, availablePlaybackRates: [1, 2] });
  h.controller.currentVideo = { id: 'AAA00000001' };
  for (const method of ['_updatePlayerVideoMeta', '_renderPlayerRecent', '_setStatus']) h.controller[method] = () => {};
  h.controller._getWatchResumeTime = () => 0;
  await h.controller._switchRecentVideo({ id: 'BBB00000002', title: '新视频' });
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2, videoUrl: 'https://www.youtube.com/watch?v=AAA00000001' });
  assert.equal(h.controller.playerBridge.autoRatePending, true);
  assert.equal(h.controller.playerBridge.playbackRate, null);
  assert.equal(h.rateCommands().length, 0);
  h.emit('infoDelivery', { playerState: 3, playbackRate: 1, videoUrl: 'https://www.youtube.com/watch?v=BBB00000002' });
  assert.equal(h.rateCommands().length, 1);
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  assert.equal(h.controller.playerBridge.autoRatePending, false);
});

test('新视频保留 2 倍速时，凭正确视频标识确认；不等待不会出现的 1 倍速', async () => {
  const h = harness();
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  h.controller.currentVideo = { id: 'AAA00000001' };
  for (const method of ['_updatePlayerVideoMeta', '_renderPlayerRecent', '_setStatus']) h.controller[method] = () => {};
  h.controller._getWatchResumeTime = () => 0;
  await h.controller._switchRecentVideo({ id: 'BBB00000002' });
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2, videoData: { video_id: 'BBB00000002' } });
  assert.equal(h.controller.playerBridge.autoRatePending, false);
  assert.equal(h.controller.playerBridge.playbackRate, 2);
  assert.equal(h.rateCommands().length, 0);
  h.advance(61000);
  assert.equal(h.timers.size, 0);
});

test('切换后没有新视频标识不能把旧进度写给新视频，等待仍有截止时间', async () => {
  const h = harness();
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  h.controller.currentVideo = { id: 'AAA00000001' };
  for (const method of ['_updatePlayerVideoMeta', '_renderPlayerRecent', '_setStatus']) h.controller[method] = () => {};
  h.controller._getWatchResumeTime = () => 0;
  await h.controller._switchRecentVideo({ id: 'BBB00000002' });
  let captures = 0;
  h.controller._captureWatchProgress = () => { captures++; };
  h.emit('infoDelivery', { playerState: 1, currentTime: 500, duration: 1000, playbackRate: 2 });
  h.controller._seekPlayerBy(10);
  assert.equal(captures, 0);
  assert.equal(h.controller.playerBridge.currentTime, 0);
  h.advance(61000);
  assert.equal(h.controller.playerBridge.autoRateFailed, true);
  assert.equal(h.timers.size, 0);
});

test('伪造 origin/source 不能验收倍速，关闭后清理所有重试及迟到导航查询', async () => {
  let resolveTab;
  const h = harness({ navigation: true, getCurrent: () => new Promise(resolve => { resolveTab = resolve; }) });
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1, availablePlaybackRates: [1, 2] });
  h.controller._handlePlayerMessage({ origin: 'https://evil.example', source: h.frame.contentWindow, data: { event: 'infoDelivery', info: { playbackRate: 2 } } });
  h.controller._handlePlayerMessage({ origin: 'https://www.youtube.com', source: {}, data: { event: 'infoDelivery', info: { playbackRate: 2 } } });
  assert.equal(h.controller.playerBridge.autoRatePending, true);
  h.controller._detachPlayerBridge();
  resolveTab({ id: 7 });
  await settle();
  h.advance(61000);
  h.commit();
  assert.equal(h.rateCommands().length, 1);
  assert.equal(h.timers.size, 0);
  assert.equal(h.navigationListeners.size, 0);
});

test('控制连接超时有提示并停止轮询；随后真正 load 仍可恢复', () => {
  const h = harness();
  const ui = controls(h.controller);
  h.advance(31000);
  assert.equal(h.messages.length, 0);
  assert.equal(h.timers.size, 0);
  h.controller._updatePlayerControls();
  assert.match(ui.status.textContent, /连接超时/);
  h.frame.onLoad();
  assert.equal(h.messages[0].event, 'listening');
  assert.equal(h.controller.playerBridge.connectTimedOut, false);
  h.emit('infoDelivery', { playerState: 1, playbackRate: 2 });
  assert.equal(h.timers.size, 0);
});

test('旧播放器已排队的定时器回调不能清除新播放器的连接或倍速轮询', () => {
  const h = harness();
  const oldConnect = h.timers.get(h.controller.playerBridgeTimer).callback;
  h.frame.onLoad();
  h.emit('infoDelivery', { playerState: 1, playbackRate: 1 });
  const oldAutoRate = h.timers.get(h.controller.playerAutoRateTimer).callback;
  const nextFrame = { ...h.frame, contentWindow: { postMessage() {} } };
  h.controller._attachPlayerBridge(nextFrame);
  const newConnectTimer = h.controller.playerBridgeTimer;
  oldConnect();
  assert.equal(h.controller.playerBridgeTimer, newConnectTimer);
  assert.equal(h.timers.has(newConnectTimer), true);
  nextFrame.onLoad();
  h.controller._handlePlayerMessage({ origin: 'https://www.youtube.com', source: nextFrame.contentWindow,
    data: { event: 'infoDelivery', info: { playerState: 1, playbackRate: 1 } } });
  const newAutoRateTimer = h.controller.playerAutoRateTimer;
  oldAutoRate();
  assert.equal(h.controller.playerAutoRateTimer, newAutoRateTimer);
  assert.equal(h.timers.has(newAutoRateTimer), true);
  h.emit('infoDelivery', { playbackRate: 2 });
  assert.equal(h.controller.playerBridge.autoRatePending, true, '旧 iframe 的迟到消息也不能验收新播放器');
  h.controller._detachPlayerBridge();
  assert.equal(h.timers.size, 0);
});
