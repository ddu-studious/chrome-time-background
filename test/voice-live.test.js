const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('音频 Worklet 按固定块传出麦克风样本', () => {
  let Processor;
  const sent = [];
  const context = vm.createContext({ Float32Array, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: value => sent.push(value) }; } }, registerProcessor(name, type) { assert.equal(name, 'voice-capture'); Processor = type; } });
  vm.runInContext(fs.readFileSync(require.resolve('../js/voice-capture-worklet.js'), 'utf8'), context);
  const processor = new Processor();
  processor.process([[new Float32Array(1024).fill(.25)]]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].length, 1024);
  assert.equal(sent[0][0], .25);
});

function liveFixture({ addModule = async () => {} } = {}) {
  let node, closed = 0;
  class AudioContext {
    constructor() { this.sampleRate = 16000; this.state = 'suspended'; this.audioWorklet = { addModule }; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    async resume() { this.state = 'running'; }
    async close() { closed++; this.state = 'closed'; }
  }
  class AudioWorkletNode {
    constructor() { this.port = { onmessage: null }; node = this; }
    connect() {}
    disconnect() {}
  }
  const context = vm.createContext({ window: {}, document: { baseURI: 'chrome-extension://example/assistant.html' }, AudioContext, AudioWorkletNode, URL, Float32Array, clearTimeout, setTimeout });
  vm.runInContext(fs.readFileSync(require.resolve('../js/voice-live.js'), 'utf8'), context);
  return {
    start: options => context.window.VoiceLive.start({}, options),
    feed(value, count = 1) { for (let index = 0; index < count; index++) node.port.onmessage?.({ data: vm.runInContext(`new Float32Array(1024).fill(${value})`, context) }); },
    closed: () => closed
  };
}

test('说话期间给出预览，停顿后自动结束并保留整段音频', async () => {
  const fixture = liveFixture(), previews = [];
  const session = await fixture.start({ onPreview: (samples, rate) => previews.push({ length: samples.length, rate }) });
  fixture.feed(.1, 50);
  assert.ok(previews.length >= 1);
  fixture.feed(0, 28);
  const result = await session.finished;
  assert.equal(result.reason, 'silence');
  assert.equal(result.heardSpeech, true);
  assert.ok(result.samples.length >= 77 * 1024 && result.samples.length <= 78 * 1024);
  assert.equal(fixture.closed(), 1);
});

test('取消后不再接收录音，且不交出可转写的音频', async () => {
  const fixture = liveFixture();
  const session = await fixture.start();
  fixture.feed(.1, 8);
  session.cancel();
  const result = await session.finished;
  assert.equal(result.reason, 'cancel');
  assert.equal(result.samples, null);
  assert.equal(fixture.closed(), 1);
});

test('实时组件初始化挂起时有界失败并关闭音频上下文', async () => {
  const fixture = liveFixture({ addModule: () => new Promise(() => {}) });
  await assert.rejects(fixture.start({ setupTimeoutMs: 15 }), /响应超时/);
  assert.equal(fixture.closed(), 1);
});
