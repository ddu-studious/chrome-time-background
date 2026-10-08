import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StepAudioProvider, runLocalSpeechProcess, validateSpeechText, validateSynthesizedAudio } from '../local-ai/speech-synthesis-provider.mjs';
import { validateInput, interpret } from '../local-ai/speech-synthesis-service.mjs';

const here = fileURLToPath(import.meta.url);
const configured = { python: process.execPath, modelDir: dirname(here), referenceAudio: here, referenceText: '公开示例' };
function wav(samples = 2400) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples * 2, 40);
  return b;
}
async function output(input, { bytes = wav(), metadata = { stop_reached: true, stop_reason: 'eos', generated_audio_tokens: 12 } } = {}) {
  const request = JSON.parse(await readFile(input, 'utf8'));
  await writeFile(join(request.outputDir, 'output.wav'), bytes);
  await writeFile(join(request.outputDir, 'result.json'), JSON.stringify(metadata));
}

test('TTS 输入只有有界纯文本，不接受浏览器路径或参数', () => {
  assert.deepEqual(validateInput({ text: '  你好。  ' }), { text: '你好。' });
  for (const text of ['', ' ', null, {}, '字'.repeat(301), '\u0000', '😀'.repeat(151)]) assert.throws(() => validateSpeechText(text), /1–300/);
  for (const input of [{ text: '好', modelDir: '/private' }, { text: '好', referenceAudio: '/private' }, { text: '好', temperature: 0 }, [], null]) assert.throws(() => validateInput(input));
});

test('TTS WAV 严格校验采样率/数据长度/上限，不接受额外元数据块', () => {
  assert.deepEqual(validateSynthesizedAudio(wav()), { sampleRate: 24000, durationSeconds: 0.1 });
  assert.equal(validateSynthesizedAudio(wav(24000 * 45)).durationSeconds, 45);
  for (const bytes of [Buffer.alloc(0), wav(24000 * 45 + 1), Buffer.concat([wav(), Buffer.alloc(2)])]) assert.throws(() => validateSynthesizedAudio(bytes));
  for (const [offset, value] of [[24, 16000], [40, 10], [20, 3], [22, 2]]) {
    const b = wav(); b.writeUInt32LE(value, offset); assert.throws(() => validateSynthesizedAudio(b));
  }
});

test('StepAudio 用固定子进程参数、离线环境和私有文件；完成后清理', async () => {
  let input;
  const provider = new StepAudioProvider({ ...configured, run: async (binary, args, options) => {
    assert.equal(binary, process.execPath); assert.equal(args[0], '-I'); assert.equal(args[2], '--input');
    assert.equal(options.timeout, 3123); assert.equal(options.env.HF_HUB_OFFLINE, '1');
    assert.equal(options.env.TRANSFORMERS_OFFLINE, '1'); assert.ok(!('PYTHONPATH' in options.env));
    input = args[3]; const request = JSON.parse(await readFile(input, 'utf8'));
    assert.equal(request.text, '你好。'); assert.equal(request.referenceAudio, here);
    assert.equal(request.outputDir, dirname(input)); await output(input);
  } });
  const result = await provider.synthesize('你好。', { timeoutMs: 3123 });
  assert.equal(result.provider, 'stepaudio-mlx'); assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.durationSeconds, 0.1); assert.equal(result.generatedAudioTokens, 12);
  assert.equal(validateSynthesizedAudio(Buffer.from(result.audio, 'base64')).sampleRate, 24000);
  assert.equal(provider.busy, false); await assert.rejects(access(input));
  assert.ok(!JSON.stringify(provider.describe()).includes(here));
});

test('截断/坏音频/异常进程/晚到取消全部失败并清理，不回退到其他语音后端', async () => {
  for (const mode of ['truncated', 'bad-audio', 'failed', 'cancelled']) {
    let input; const abort = new AbortController();
    const provider = new StepAudioProvider({ ...configured, run: async (_, args) => {
      input = args[3];
      if (mode === 'failed') throw new Error('private command and secret text');
      await output(input, mode === 'truncated' ? { metadata: { stop_reached: false, stop_reason: 'max_new_tokens' } } : mode === 'bad-audio' ? { bytes: Buffer.from('bad') } : {});
      if (mode === 'cancelled') abort.abort();
    } });
    await assert.rejects(provider.synthesize('你好', { signal: abort.signal }), (error) => !error.message.includes('secret') && error.code.startsWith('SPEECH_'));
    assert.equal(provider.busy, false); await assert.rejects(access(input));
  }
});

test('Provider 串行准入，正在执行时第二个请求不会启动运行库', async () => {
  let started, release, calls = 0;
  const ready = new Promise((resolve) => { started = resolve; });
  const pending = new Promise((resolve) => { release = resolve; });
  const provider = new StepAudioProvider({ ...configured, run: async (_, args) => { calls++; started(); await pending; await output(args[3]); } });
  const first = provider.synthesize('第一句'); await ready;
  await assert.rejects(provider.synthesize('第二句'), (error) => error.statusCode === 429);
  assert.equal(calls, 1); release(); await first; assert.equal(provider.busy, false);
});

test('真实子进程超时/取消以 SIGKILL 结束后才释放 Provider 和清理输入', async () => {
  for (const mode of ['timeout', 'cancel']) {
    let input, pid; const abort = new AbortController();
    const provider = new StepAudioProvider({ ...configured, run: async (_, args, options) => {
      input = args[3]; const pidFile = join(dirname(input), 'pid');
      const processRun = runLocalSpeechProcess(process.execPath, ['-e', `require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`, pidFile], options);
      // Attach a rejection handler while observing the real child start.
      processRun.catch(() => {});
      for (let attempt = 0; attempt < 100; attempt++) {
        try { pid = Number(await readFile(pidFile, 'utf8')); break; } catch { await new Promise((resolve) => setTimeout(resolve, 5)); }
      }
      if (mode === 'cancel') abort.abort();
      return processRun;
    } });
    await assert.rejects(provider.synthesize('你好', { signal: abort.signal, timeoutMs: mode === 'timeout' ? 500 : 2000 }), (error) => error.code === (mode === 'timeout' ? 'SPEECH_TIMEOUT' : 'SPEECH_CANCELLED'));
    assert.ok(pid > 0); assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    assert.equal(provider.busy, false); await assert.rejects(access(input));
  }
});

test('真实运行器输出上限会杀死进程，不泄露 stdout/stderr', async () => {
  await assert.rejects(runLocalSpeechProcess(process.execPath, ['-e', `process.stdout.write('private'.repeat(20000));setInterval(()=>{},1000)`], { timeout: 2000, maxBuffer: 100 }), (error) => error.code === 'SPEECH_PROCESS_OUTPUT_LIMIT' && !error.message.includes('private'));
});

test('未配置与预先取消均不启动模型；服务只返回语音结果', async () => {
  let calls = 0;
  const missing = new StepAudioProvider({ ...configured, referenceAudio: '/missing-reference', run: async () => calls++ });
  assert.equal(missing.describe().configured, false); await assert.rejects(missing.synthesize('你好'), /配置/);
  const abort = new AbortController(); abort.abort();
  const cancelled = new StepAudioProvider({ ...configured, run: async () => calls++ });
  await assert.rejects(cancelled.synthesize('你好', { signal: abort.signal }), /取消/); assert.equal(calls, 0);
  const result = await interpret({ text: '你好' }, { synthesize: async (text) => ({ text, mimeType: 'audio/wav' }) });
  assert.equal(result.status, 'ready'); assert.equal(result.source, 'speech');
});
