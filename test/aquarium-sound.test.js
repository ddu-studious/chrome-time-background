// 水族馆水下环境音控制器（js/aquarium-sound.js）：可注入假 AudioContext；默认不发声；失败只停自己。
const test = require('node:test');
const assert = require('node:assert/strict');
const Sound = require('../js/aquarium-sound.js');

function fakeCtx() {
    const nodes = [];
    const param = (v = 0) => {
        const p = {
            value: v,
            setValueAtTime(x) { p.value = x; },
            setTargetAtTime(x) { p.value = x; },
            cancelScheduledValues() {},
            exponentialRampToValueAtTime(x) { p.value = x; },
        };
        return p;
    };
    const node = (kind, extra = {}) => {
        const n = Object.assign({
            kind,
            connect() { return n; },
            start() { n.started = true; },
            stop() { n.stopped = true; },
            gain: param(0),
            frequency: param(0),
            Q: param(0),
            type: 'lowpass',
        }, extra);
        nodes.push(n);
        return n;
    };
    const ctx = {
        state: 'running',
        currentTime: 0,
        destination: {},
        nodes,
        createGain: () => node('gain'),
        createBiquadFilter: () => node('filter'),
        createOscillator: () => node('osc', { type: 'sine' }),
        createBuffer(channels, length, rate) {
            const data = [new Float32Array(length)];
            return {
                length, sampleRate: rate, numberOfChannels: channels,
                copyToChannel(src, ch) { data[ch].set(src); },
                getChannelData(ch) { return data[ch]; },
            };
        },
        createBufferSource: () => node('buffer', { buffer: null, loop: false }),
        async resume() { ctx.state = 'running'; },
        async suspend() { ctx.state = 'suspended'; },
        async close() { ctx.state = 'closed'; },
    };
    return ctx;
}

test('没有 AudioContext 时 start 失败但不抛；state.failed 为 true', async () => {
    const s = Sound.create({ AudioContext: null, warn() {} });
    assert.equal(await s.start(), false);
    assert.equal(s.state().failed, true);
    assert.equal(s.state().running, false);
});

test('注入假上下文：start 后 running，tick 改音量，stop 后不再跑', async () => {
    const ctx = fakeCtx();
    const s = Sound.create({ context: ctx, AudioContext: function () { return ctx; }, random: () => 0.3, warn() {} });
    assert.equal(await s.start({ amount: 0.8, night: 0 }), true);
    const st = s.state();
    assert.equal(st.running, true);
    assert.equal(st.wanted, true);
    assert.ok(st.startCount >= 1);
    s.tick({ amount: 0.2, night: 1 });
    assert.equal(s.state().amount, 0.2);
    assert.equal(s.state().night, 1);
    s.stop();
    assert.equal(s.state().wanted, false);
});

test('hidden:true 时调用 suspend；再次可见会 resume', async () => {
    const ctx = fakeCtx();
    const s = Sound.create({ context: ctx, AudioContext: function () { return ctx; }, random: () => 0.5, warn() {} });
    await s.start({ amount: 1 });
    s.tick({ hidden: true });
    assert.equal(ctx.state, 'suspended');
    s.tick({ hidden: false });
    assert.equal(ctx.state, 'running');
});
