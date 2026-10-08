const test = require('node:test');
const assert = require('node:assert/strict');
const Voice = require('../js/assistant-voice.js');

const tick = () => new Promise(setImmediate);
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const policy = { ok: true, modelEnabled: true, scenes: [{ id: 'speech.synthesize', modelEnabled: true }], synthesis: { configured: true } };
const task = (content = '你好。') => ({ id: 't1', version: 3, messages: [{ id: 'm1', role: 'assistant', content }] });
function ready() {
  const bytes = Buffer.alloc(48); bytes.write('RIFF'); bytes.writeUInt32LE(40, 4); bytes.write('WAVE', 8);
  return { ok: true, status: 'ready', mimeType: 'audio/wav', audio: bytes.toString('base64') };
}
function fixture(overrides = {}) {
  const calls = [], notes = [], states = [], audios = [], revoked = [], blobs = [];
  let id = 0;
  const api = Voice.create({
    async send(action, body) { calls.push({ action, ...body }); return overrides.send ? overrides.send(action, body) : action === 'ai_control_get' ? policy : action === 'assistant_voice_synthesize' ? { ...ready(), jobId: 'job' } : { ok: true }; },
    notify: value => notes.push(value), onState: value => states.push(value), onStart: overrides.onStart,
    makeAudio() { const audio = { async play() { audio.played = true; if (overrides.playError) throw overrides.playError; }, pause() { audio.paused = true; }, removeAttribute() {}, load() {} }; audios.push(audio); return audio; },
    createObjectURL(blob) { blobs.push(blob); return 'blob:' + blobs.length; }, revokeObjectURL: value => revoked.push(value),
    newId: () => 'request-' + ++id, pollMs: 0, ...overrides.options
  });
  return { api, calls, notes, states, audios, revoked, blobs, async end(index = audios.length - 1) { audios[index].onended(); await tick(); } };
}

test('分句每段不超过 200 字，保持真实答复的连续原文和全部内容', () => {
  for (const text of ['这是第一句。'.repeat(80), 'a'.repeat(199) + '😀' + 'b'.repeat(250), '没有标点'.repeat(100), '第一行\n第二行。']) {
    const parts = Voice.splitText(text);
    assert.equal(parts.join(''), text);
    assert.ok(parts.every(part => part.length <= 200 && text.includes(part)));
    assert.ok(parts.every(part => !/[\uD800-\uDBFF]$/.test(part)));
  }
  assert.throws(() => Voice.splitText('长'.repeat(2001)), /超过 2000/);
  assert.throws(() => Voice.splitText('  '), /没有可朗读/);
});

test('每段顺序合成和播放，结束后释放音频 URL 和本机临时任务', async () => {
  let stoppedInput = 0;
  const f = fixture({ onStart() { stoppedInput++; } }), t = task('第一句话。'.repeat(50));
  const expected = Voice.splitText(t.messages[0].content), running = f.api.start(t, t.messages[0]);
  await tick(); assert.equal(stoppedInput, 1); assert.equal(f.audios.length, 1);
  assert.equal(f.calls.filter(call => call.action === 'assistant_voice_synthesize').length, 1);
  for (let index = 0; index < expected.length; index++) {
    assert.equal(f.audios[index].played, true);
    await f.end(index);
  }
  await running;
  const synth = f.calls.filter(call => call.action === 'assistant_voice_synthesize');
  assert.deepEqual(synth.map(call => call.text), expected);
  assert.equal(new Set(synth.map(call => call.requestId)).size, expected.length);
  assert.ok(synth.every(call => call.taskId === 't1' && call.version === 3 && call.messageId === 'm1'));
  assert.equal(f.revoked.length, expected.length);
  assert.equal(f.calls.filter(call => call.action === 'assistant_voice_cancel').length, expected.length);
  assert.equal(f.api.state().status, 'idle'); assert.equal(f.notes.at(-1), '朗读完成');
});

test('提交尚未返回时停止通过 requestId 取消，迟到的 job 回执再次释放且不播', async () => {
  const submit = defer();
  const f = fixture({ send: action => action === 'ai_control_get' ? policy : action === 'assistant_voice_synthesize' ? submit.promise : { ok: true } });
  const t = task(), running = f.api.start(t, t.messages[0]); await tick();
  f.api.stop(); await tick();
  assert.ok(f.calls.some(call => call.action === 'assistant_voice_cancel' && call.requestId === 'request-1'));
  submit.resolve({ ...ready(), jobId: 'late-job' }); await running; await tick();
  assert.equal(f.audios.length, 0);
  assert.ok(f.calls.some(call => call.action === 'assistant_voice_cancel' && call.jobId === 'late-job' && call.requestId === 'request-1'));
});

test('轮询期间取消会停止等待，迟到的结果不创建音频', async () => {
  const response = defer();
  const f = fixture({ send: action => action === 'ai_control_get' ? policy : action === 'assistant_voice_synthesize' ? { ok: true, status: 'pending', jobId: 'pending-job' } : action === 'assistant_voice_result' ? response.promise : { ok: true } });
  const t = task(), running = f.api.start(t, t.messages[0]);
  await new Promise(resolve => setTimeout(resolve, 5));
  f.api.stop(); response.resolve({ ...ready(), jobId: 'pending-job' }); await running;
  assert.equal(f.audios.length, 0); assert.equal(f.api.state().status, 'idle');
  assert.ok(f.calls.some(call => call.action === 'assistant_voice_cancel' && call.jobId === 'pending-job'));
});

test('版本变化、任务切换和消息变化均停止播放；普通快照刷新继续播放', async () => {
  for (const update of [t => ({ ...t, version: 4 }), t => ({ ...t, id: 't2' }), t => ({ ...t, messages: [{ ...t.messages[0], content: '已经变了' }] }), () => null]) {
    const f = fixture(), t = task(), running = f.api.start(t, t.messages[0]); await tick();
    f.api.updateTask(structuredClone(t)); assert.equal(f.api.state().status, 'playing');
    f.api.updateTask(update(t)); await running; await tick();
    assert.equal(f.api.state().status, 'idle'); assert.equal(f.audios[0].paused, true); assert.deepEqual(f.revoked, ['blob:1']);
    assert.ok(f.calls.some(call => call.action === 'assistant_voice_cancel' && call.jobId === 'job'));
  }
});

test('同一条答复再次点击停止，其他答复接替旧音频且不重播旧结果', async () => {
  const f = fixture(), t = task(), running = f.api.start(t, t.messages[0]); await tick();
  await f.api.start(t, t.messages[0]); await running;
  assert.equal(f.api.state().status, 'idle'); assert.equal(f.audios.length, 1);
  const second = { ...t, messages: [...t.messages, { id: 'm2', role: 'assistant', content: '第二条答复' }] };
  const next = f.api.start(second, second.messages[1]); await tick();
  assert.equal(f.api.state().messageId, 'm2'); await f.end(); await next;
});

test('总开关、场景开关、未配置、超长答复和用户消息均不调用合成', async () => {
  for (const p of [{ ...policy, modelEnabled: false }, { ...policy, scenes: [] }, { ...policy, synthesis: { configured: false } }]) {
    const f = fixture({ send: () => p }), t = task(); await f.api.start(t, t.messages[0]);
    assert.equal(f.calls.filter(call => call.action === 'assistant_voice_synthesize').length, 0);
    assert.match(f.notes.at(-1), /AI 设置/);
  }
  for (const t of [task('长'.repeat(2001)), { ...task(), messages: [{ id: 'm1', role: 'user', content: '不要读用户消息' }] }]) {
    const f = fixture(); await f.api.start(t, t.messages[0]); assert.equal(f.calls.length, 0);
  }
});

test('合成超时取消任务；返回非 WAV 和播放被拒绝均明确报错并清理', async () => {
  const f = fixture({ options: { timeoutMs: 0 }, send: action => action === 'ai_control_get' ? policy : { ok: true, status: 'pending', jobId: 'timeout-job' } });
  let t = task(); await f.api.start(t, t.messages[0]); await tick();
  assert.match(f.notes.at(-1), /超时/); assert.ok(f.calls.some(call => call.action === 'assistant_voice_cancel' && call.jobId === 'timeout-job'));
  const bad = fixture({ send: action => action === 'ai_control_get' ? policy : { ...ready(), audio: 'invalid', jobId: 'bad' } });
  await bad.api.start(t, t.messages[0]); assert.match(bad.notes.at(-1), /WAV/); assert.equal(bad.audios.length, 0);
  const denied = fixture({ playError: Object.assign(new Error('not allowed'), { name: 'NotAllowedError' }) });
  await denied.api.start(t, t.messages[0]); assert.match(denied.notes.at(-1), /浏览器阻止/); assert.deepEqual(denied.revoked, ['blob:1']);
});

test('销毁后取消全部临时资源，禁止再次发起合成', async () => {
  const f = fixture(), t = task(), running = f.api.start(t, t.messages[0]); await tick();
  f.api.destroy(); await running; await tick(); const count = f.calls.length;
  await f.api.start(t, t.messages[0]); assert.equal(f.calls.length, count); assert.equal(f.audios[0].paused, true);
});

test('播放启动 Promise 未返回时仍可立即停止，不等待浏览器迟到的播放回执', async () => {
  const pending = defer(), audio = { play: () => pending.promise, pause() {}, removeAttribute() {}, load() {} };
  const f = fixture({ options: { makeAudio: () => audio } }), t = task();
  const running = f.api.start(t, t.messages[0]); await tick(); f.api.stop();
  await running; assert.equal(f.api.state().status, 'idle'); assert.deepEqual(f.revoked, ['blob:1']);
  pending.resolve(); await tick(); assert.notEqual(f.notes.at(-1), '朗读完成');
});
