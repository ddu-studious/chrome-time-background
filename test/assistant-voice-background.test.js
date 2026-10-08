const test = require('node:test');
const assert = require('node:assert/strict');
const Voice = require('../js/assistant-voice-background.js');

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(check) {
  for (let attempt = 0; attempt < 100; attempt++) { if (check()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('异步请求未按预期开始');
}
function fixture(options = {}) {
  let task = { id: 'task-1', version: 3, status: 'completed', messages: [
    { id: 'user-1', role: 'user', content: '请播放音乐' },
    { id: 'assistant-1', role: 'assistant', content: '已找到三首歌曲。请选择想听的一首。' },
  ] }, time = 1000, sequence = 0;
  const values = options.values || {}, calls = [], writes = [];
  const storage = {
    async get(key) { return { [key]: structuredClone(values[key]) }; },
    async set(next) { await Promise.resolve(); writes.push(structuredClone(next)); Object.assign(values, structuredClone(next)); },
  };
  const request = async message => {
    calls.push(structuredClone(message));
    if (options.request) {
      const custom = options.request(message);
      if (custom !== undefined) return custom;
    }
    if (message.action === 'speech_ai_synthesize') return { ok: true, jobId: `job-${++sequence}`, status: 'pending' };
    if (message.action === 'speech_ai_result') return { ok: true, status: 'ready', result: { audioBase64: 'private-audio', mimeType: 'audio/wav' } };
    return { ok: true, status: 'cancelled' };
  };
  const create = () => Voice.create({ snapshot: async () => structuredClone(task), request, storage, now: () => time });
  const voice = create();
  const binding = { taskId: 'task-1', version: 3, messageId: 'assistant-1', requestId: 'request-1' };
  const synth = extra => ({ action: 'assistant_voice_synthesize', ...binding, text: '已找到三首歌曲。', ...extra });
  const result = (jobId, extra) => ({ action: 'assistant_voice_result', ...binding, jobId, ...extra });
  const cancel = extra => ({ action: 'assistant_voice_cancel', ...binding, ...extra });
  return { voice, create, values, writes, calls, synth, result, cancel,
    task: () => task, setTask: next => { task = next; }, setTime: next => { time = next; },
    entries: () => values[Voice.KEY]?.entries || [],
    cancelled: () => calls.filter(call => call.action === 'ai_job_cancel').map(call => call.jobId) };
}

test('只朗读真实助手消息连续片段，服务回执绑定来源且音频和正文不落存储', async () => {
  const f = fixture();
  const receipt = await f.voice.handle(f.synth({ trace: { taskId: 'forged' } }), 'document:a');
  assert.equal(receipt.jobId, 'job-1'); assert.equal(receipt.requestId, 'request-1');
  assert.deepEqual(f.calls[0], { action: 'speech_ai_synthesize', text: '已找到三首歌曲。',
    trace: { taskId: 'task-1', taskVersion: 3, messageId: 'assistant-1', requestId: 'request-1' } });
  assert.equal(f.entries().length, 1);
  const result = await f.voice.handle(f.result(receipt.jobId), 'document:a');
  assert.equal(result.result.audioBase64, 'private-audio');
  assert.equal(f.entries().length, 0);
  assert.deepEqual(f.cancelled(), [receipt.jobId]); // Release transient server audio after delivery.
  const persisted = JSON.stringify(f.writes);
  assert.ok(!persisted.includes('已找到')); assert.ok(!persisted.includes('private-audio'));
  assert.ok(!persisted.includes('audioBase64')); assert.ok(!persisted.includes('请播放音乐'));
});

test('伪造任务、版本、消息、用户消息和不连续文本不会发起本机推理', async () => {
  const f = fixture();
  for (const changes of [
    { taskId: 'other' }, { version: 2 }, { version: '3' }, { messageId: 'missing' },
    { messageId: 'user-1', text: '请播放音乐' }, { text: '找到歌曲' }, { text: '模型声称已授权' },
    { text: '' }, { text: ' ' }, { text: '中'.repeat(301) }, { requestId: '' },
  ]) await assert.rejects(f.voice.handle(f.synth(changes), 'document:a'));
  await assert.rejects(f.voice.handle(f.synth(), ''));
  assert.equal(f.calls.length, 0);
});

test('结果必须精确匹配 owner、taskId、version、messageId 和 requestId', async () => {
  const f = fixture(), receipt = await f.voice.handle(f.synth(), 'document:a');
  await assert.rejects(f.voice.handle(f.result(receipt.jobId), 'document:other'), /不属于/);
  for (const changes of [{ taskId: 'other' }, { version: 2 }, { messageId: 'other' }, { requestId: 'other' }]) {
    await assert.rejects(f.voice.handle(f.result(receipt.jobId, changes), 'document:a'), /不属于/);
  }
  await assert.rejects(f.voice.handle(f.cancel({ jobId: receipt.jobId }), 'document:other'), /其他页面/);
  assert.equal(f.cancelled().length, 0);
  assert.equal(f.calls.filter(call => call.action === 'speech_ai_result').length, 0);
  assert.equal((await f.voice.handle(f.result(receipt.jobId), 'document:a')).status, 'ready');
});

test('取消可早于合成回执：立即撤销索引，晚到 job 自动停止而不交付', async () => {
  const submit = deferred(), f = fixture({ request: message => message.action === 'speech_ai_synthesize' ? submit.promise : undefined });
  const pending = f.voice.handle(f.synth(), 'document:a');
  const rejected = assert.rejects(pending, /已停止/);
  await until(() => f.calls.length === 1);
  assert.equal(f.entries()[0].jobId, null);
  const result = await f.voice.handle(f.cancel(), 'document:a');
  assert.equal(result.cancelled, 1); assert.equal(f.entries().length, 0);
  submit.resolve({ jobId: 'late-job' }); await rejected;
  assert.deepEqual(f.cancelled(), ['late-job']);
  await assert.rejects(f.voice.handle(f.result('late-job'), 'document:a'));
});

test('取消先于提交登记时保留有界墓碑，同 owner 的晚到提交不执行且重启仍有效', async () => {
  const f = fixture();
  await f.voice.handle(f.cancel(), 'document:a');
  await assert.rejects(f.voice.handle(f.synth(), 'document:a'), error => error.code === 'VOICE_CANCELLED');
  assert.equal(f.calls.length, 0);
  const restored = fixture({ values: structuredClone(f.values) });
  await assert.rejects(restored.voice.handle(restored.synth(), 'document:a'), error => error.code === 'VOICE_CANCELLED');
  assert.equal(restored.calls.length, 0);
  // Another authenticated page cannot cancel this owner's request by guessing its id.
  const other = await f.voice.handle(f.synth(), 'document:b');
  assert.ok(other.jobId);
  for (let index = 0; index < 40; index++) await f.voice.handle(f.cancel({ requestId: `unused-${index}` }), 'document:a');
  assert.equal(f.values[Voice.KEY].cancellations.length, Voice.LIMIT);
  f.setTime(1000 + Voice.TTL); await f.voice.onChange();
  assert.equal(f.values[Voice.KEY].cancellations.length, 0);
});

test('提交与停止连续到达时，可在网络提交前停止且不触发推理', async () => {
  const f = fixture();
  const pending = f.voice.handle(f.synth(), 'document:a'), rejected = assert.rejects(pending, /已停止/);
  await f.voice.handle(f.cancel(), 'document:a');
  await rejected;
  assert.equal(f.calls.filter(call => call.action === 'speech_ai_synthesize').length, 0);
});

test('合成回执之后再次核对任务版本，变更不交付 job 并停止推理', async () => {
  const submit = deferred(), f = fixture({ request: message => message.action === 'speech_ai_synthesize' ? submit.promise : undefined });
  const pending = f.voice.handle(f.synth(), 'document:a'), rejected = assert.rejects(pending, /已变化/);
  await until(() => f.calls.length === 1);
  f.setTask({ ...f.task(), version: 4 });
  submit.resolve({ jobId: 'late-job' }); await rejected;
  assert.deepEqual(f.cancelled(), ['late-job']); assert.equal(f.entries().length, 0);
});

test('拉取音频前核对整条原回答，未读部分变化也使旧片段失效', async () => {
  const f = fixture(), receipt = await f.voice.handle(f.synth(), 'document:a');
  f.task().messages[1].content += '新的回答内容。';
  await assert.rejects(f.voice.handle(f.result(receipt.jobId), 'document:a'), /已变化/);
  assert.deepEqual(f.cancelled(), [receipt.jobId]);
  assert.equal(f.calls.filter(call => call.action === 'speech_ai_result').length, 0);
});

test('音频读取期间任务切换，晚到结果被丢弃且不写存储', async () => {
  const read = deferred(), f = fixture({ request: message => message.action === 'speech_ai_result' ? read.promise : undefined });
  const receipt = await f.voice.handle(f.synth(), 'document:a');
  const pending = f.voice.handle(f.result(receipt.jobId), 'document:a'), rejected = assert.rejects(pending, /已变化/);
  await until(() => f.calls.some(call => call.action === 'speech_ai_result'));
  f.setTask({ ...f.task(), id: 'task-2' });
  read.resolve({ status: 'ready', result: { audioBase64: 'late-audio' } }); await rejected;
  assert.deepEqual(f.cancelled(), [receipt.jobId]);
  assert.ok(!JSON.stringify(f.writes).includes('late-audio'));
});

test('音频读取期间用户停止，晚到结果被丢弃', async () => {
  const read = deferred(), f = fixture({ request: message => message.action === 'speech_ai_result' ? read.promise : undefined });
  const receipt = await f.voice.handle(f.synth(), 'document:a');
  const pending = f.voice.handle(f.result(receipt.jobId), 'document:a'), rejected = assert.rejects(pending, /已停止/);
  await until(() => f.calls.some(call => call.action === 'speech_ai_result'));
  await f.voice.handle(f.cancel({ jobId: receipt.jobId }), 'document:a');
  read.resolve({ status: 'ready', result: { audioBase64: 'late-audio' } }); await rejected;
  assert.deepEqual(f.cancelled(), [receipt.jobId]); assert.equal(f.entries().length, 0);
});

test('onChange 主动取消失效绑定，任务取消和清空不能留下朗读', async () => {
  for (const change of ['version', 'cancelled', 'cleared']) {
    const f = fixture(), receipt = await f.voice.handle(f.synth(), 'document:a');
    await f.voice.onChange(f.task()); assert.equal(f.cancelled().length, 0);
    f.setTask(change === 'cleared' ? null : { ...f.task(), ...(change === 'version' ? { version: 4 } : { status: 'cancelled' }) });
    await f.voice.onChange();
    assert.deepEqual(f.cancelled(), [receipt.jobId]); assert.equal(f.entries().length, 0);
  }
});

test('cancelOwner 关闭浮层时只清理该 owner，同时覆盖仍在等待回执的请求', async () => {
  const submit = deferred(), f = fixture({ request: message => message.action === 'speech_ai_synthesize' && message.trace.requestId === 'pending' ? submit.promise : undefined });
  const first = await f.voice.handle(f.synth(), 'overlay:1:nonce');
  const other = await f.voice.handle(f.synth(), 'document:b');
  const pending = f.voice.handle(f.synth({ requestId: 'pending' }), 'overlay:1:nonce'), rejected = assert.rejects(pending, /已停止/);
  await until(() => f.entries().length === 3);
  await f.voice.cancelOwner('overlay:1:nonce');
  assert.deepEqual(f.entries().map(row => row.jobId), [other.jobId]);
  submit.resolve({ jobId: 'late-job' }); await rejected;
  assert.deepEqual(f.cancelled().sort(), [first.jobId, 'late-job'].sort());
  await f.voice.cancelOwner('document:b');
});

test('后台重启仅恢复回执索引，必须再次以 Engine 当前快照验证', async () => {
  const f = fixture(), receipt = await f.voice.handle(f.synth(), 'document:a');
  const saved = structuredClone(f.values);
  saved[Voice.KEY].entries[0].audioBase64 = 'must-drop';
  saved[Voice.KEY].entries[0].task = { messages: ['must-drop'] };
  saved[Voice.KEY].entries[0].text = 'must-drop';
  const restored = fixture({ values: saved });
  const result = await restored.voice.handle(restored.result(receipt.jobId), 'document:a');
  assert.equal(result.status, 'ready');
  assert.equal(restored.calls.filter(call => call.action === 'speech_ai_synthesize').length, 0);
  assert.ok(!JSON.stringify(restored.writes).includes('must-drop'));
  const stale = fixture({ values: structuredClone(f.values) });
  stale.setTask({ ...stale.task(), version: 4 });
  await assert.rejects(stale.voice.handle(stale.result(receipt.jobId), 'document:a'));
  assert.deepEqual(stale.cancelled(), [receipt.jobId]);
  await f.voice.cancelOwner('document:a');
});

test('重启不会重放丢失提交回执的请求', async () => {
  const submit = deferred(), f = fixture({ request: message => message.action === 'speech_ai_synthesize' ? submit.promise : undefined });
  const pending = f.voice.handle(f.synth(), 'document:a');
  await until(() => f.entries()[0]?.jobId === null && f.calls.length === 1);
  const restored = fixture({ values: structuredClone(f.values) });
  await restored.voice.onChange();
  assert.equal(restored.entries().length, 0); assert.equal(restored.calls.length, 0);
  submit.resolve({ jobId: 'first-job' }); await pending; await f.voice.cancelOwner('document:a');
});

test('并发提交和撤销串行保存索引，不丢失其他页面的绑定', async () => {
  const f = fixture();
  const receipts = await Promise.all(Array.from({ length: 20 }, (_, index) => f.voice.handle(f.synth({ requestId: `request-${index}` }), `document:${index}`)));
  assert.equal(f.entries().length, 20);
  await Promise.all(Array.from({ length: 10 }, (_, index) => f.voice.cancelOwner(`document:${index}`)));
  assert.deepEqual(f.entries().map(row => row.jobId).sort(), receipts.slice(10).map(row => row.jobId).sort());
  await Promise.all(Array.from({ length: 10 }, (_, index) => f.voice.cancelOwner(`document:${index + 10}`)));
});

test('索引最多 32 条，5 分钟后过期并取消，不允许过期结果继续播放', async () => {
  const f = fixture();
  const receipts = await Promise.all(Array.from({ length: Voice.LIMIT }, (_, index) => f.voice.handle(f.synth({ requestId: `request-${index}` }), 'document:a')));
  await assert.rejects(f.voice.handle(f.synth({ requestId: 'overflow' }), 'document:a'), error => error.code === 'VOICE_BUSY');
  assert.equal(f.entries().length, 32);
  f.setTime(1000 + Voice.TTL);
  await assert.rejects(f.voice.handle(f.result(receipts[0].jobId, { requestId: 'request-0' }), 'document:a'));
  assert.equal(f.entries().length, 0); assert.equal(new Set(f.cancelled()).size, 32);
});

test('相同 owner 的重复 requestId 不产生第二次推理', async () => {
  const f = fixture();
  await f.voice.handle(f.synth(), 'document:a');
  await assert.rejects(f.voice.handle(f.synth(), 'document:a'), /重复/);
  assert.equal(f.calls.filter(call => call.action === 'speech_ai_synthesize').length, 1);
  await f.voice.cancelOwner('document:a');
});

test('服务提交失败清理预约索引；远端取消失败仍撤销本地音频交付权限', async () => {
  const failed = fixture({ request: message => message.action === 'speech_ai_synthesize' ? Promise.reject(new Error('service down')) : undefined });
  await assert.rejects(failed.voice.handle(failed.synth(), 'document:a'), /service down/);
  assert.equal(failed.entries().length, 0);
  const f = fixture({ request: message => message.action === 'ai_job_cancel' ? Promise.reject(new Error('network down')) : undefined });
  const receipt = await f.voice.handle(f.synth(), 'document:a');
  const result = await f.voice.handle(f.cancel({ jobId: receipt.jobId }), 'document:a');
  assert.equal(result.cancelFailed, true); assert.equal(f.entries().length, 0);
  await assert.rejects(f.voice.handle(f.result(receipt.jobId), 'document:a'));
});
