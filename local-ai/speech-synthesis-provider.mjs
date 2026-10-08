import { existsSync, statSync } from 'node:fs';
import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const RUNTIME = join(ROOT, '.local/stepaudio-runtime');
export const STEP_AUDIO_MODEL = 'appautomaton/step-audio-editx-8bit-mlx';
export const STEP_AUDIO_REVISION = '3890eb13396c8bb791ff982987e9d3bbdecfab25';
export const STEP_AUDIO_RUNTIME = 'mlx-speech==0.5.2';
export const MAX_SPEECH_TEXT = 300;
export const MAX_SPEECH_SECONDS = 45;
const MAX_WAV_BYTES = 44 + 24000 * 2 * MAX_SPEECH_SECONDS;
const failure = (message, code, statusCode = 502) => Object.assign(new Error(message), { code, statusCode });

export function validateSpeechText(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_SPEECH_TEXT || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw failure('朗读文本须为 1–300 字的有效短句', 'SPEECH_INPUT_INVALID', 400);
  }
  return value.trim();
}

export function validateSynthesizedAudio(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46 || bytes.length > MAX_WAV_BYTES || bytes.length % 2 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(4) !== bytes.length - 8 ||
      bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' || bytes.readUInt32LE(16) !== 16 ||
      bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 24000 ||
      bytes.readUInt32LE(28) !== 48000 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 ||
      bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44) {
    throw failure('语音模型返回了无效或超过 45 秒的音频', 'SPEECH_OUTPUT_INVALID');
  }
  return { sampleRate: 24000, durationSeconds: (bytes.length - 44) / 48000 };
}

// Resolve only after close: cancellation must finish killing the process before its
// temporary directory is removed and the provider admits another generation.
export function runLocalSpeechProcess(binary, args, { signal, timeout, env, cwd, maxBuffer = 65536 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(failure('语音合成已取消', 'SPEECH_CANCELLED', 499));
    let child;
    try { child = spawn(binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'], env, cwd }); }
    catch (error) { reject(error); return; }
    let processError, rejected, timer, count = 0;
    const stop = (error) => { rejected ||= error; child.kill('SIGKILL'); };
    const abort = () => stop(failure('语音合成已取消', 'SPEECH_CANCELLED', 499));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    if (timeout) timer = setTimeout(() => stop(failure('语音合成超时，请缩短文字后重试', 'SPEECH_TIMEOUT', 504)), timeout);
    const consume = (chunk) => { count += chunk.length; if (count > maxBuffer) stop(failure('语音进程输出超过限制', 'SPEECH_PROCESS_OUTPUT_LIMIT')); };
    child.stdout.on('data', consume); child.stderr.on('data', consume);
    child.on('error', (error) => { processError = error; });
    child.on('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (rejected || processError) reject(rejected || processError);
      else if (code !== 0) reject(failure('本机语音运行库执行失败，请检查安装和模型配置', 'SPEECH_PROCESS_FAILED'));
      else resolve();
    });
  });
}

export class StepAudioProvider {
  constructor({ python = process.env.LOCAL_AI_TTS_PYTHON || join(RUNTIME, '.venv/bin/python'),
    modelDir = process.env.LOCAL_AI_TTS_MODEL_DIR || join(homedir(), '.lmstudio/models', STEP_AUDIO_MODEL),
    referenceAudio = process.env.LOCAL_AI_TTS_REFERENCE_AUDIO || join(RUNTIME, 'reference/whisper_prompt.wav'),
    referenceText = process.env.LOCAL_AI_TTS_REFERENCE_TEXT || '比如在工作间隙，做一些简单的伸展运动，放松一下身体，这样，会让你更有精力.',
    voice = 'stepaudio-official-zh-example', run = runLocalSpeechProcess } = {}) {
    this.python = python; this.modelDir = modelDir; this.referenceAudio = referenceAudio;
    this.referenceText = referenceText; this.voice = voice; this.run = run; this.busy = false;
  }
  describe() {
    let configured = false;
    try { configured = [this.python, this.modelDir, this.referenceAudio].every((path) => typeof path === 'string' && isAbsolute(path) && existsSync(path)) && statSync(this.modelDir).isDirectory() && Boolean(this.referenceText?.trim()); } catch {}
    return { configured, localOnly: true, provider: 'stepaudio-mlx', model: STEP_AUDIO_MODEL,
      revision: STEP_AUDIO_REVISION, runtime: STEP_AUDIO_RUNTIME, voice: this.voice,
      maxCharacters: MAX_SPEECH_TEXT, maxSeconds: MAX_SPEECH_SECONDS, streaming: false };
  }
  async synthesize(value, { signal, timeoutMs = 120000 } = {}) {
    const text = validateSpeechText(value);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 300000) throw failure('语音合成时限无效', 'SPEECH_TIMEOUT_INVALID', 400);
    if (this.busy) throw failure('语音合成繁忙，请稍后重试', 'SPEECH_BUSY', 429);
    if (!this.describe().configured) throw failure('请先安装本机语音运行库并配置参考音色', 'SPEECH_NOT_CONFIGURED', 503);
    this.busy = true;
    let directory;
    try {
      signal?.throwIfAborted();
      await access(this.python); await access(this.referenceAudio);
      directory = await mkdtemp(join(tmpdir(), 'time-keeper-tts-'));
      const input = join(directory, 'input.json');
      await writeFile(input, JSON.stringify({ text, modelDir: this.modelDir, referenceAudio: this.referenceAudio,
        referenceText: this.referenceText, outputDir: directory }), { mode: 0o600 });
      await this.run(this.python, ['-I', join(ROOT, 'voice-runtime/synthesize.py'), '--input', input], {
        signal, timeout: Math.floor(timeoutMs), maxBuffer: 65536, cwd: directory,
        env: { PATH: `${dirname(this.python)}:/usr/bin:/bin`, LANG: 'en_US.UTF-8',
          HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1',
          HF_HOME: directory, XDG_CACHE_HOME: directory, TMPDIR: directory, OMP_NUM_THREADS: '4' }
      });
      signal?.throwIfAborted();
      const metadataFile = join(directory, 'result.json');
      if ((await stat(metadataFile)).size > 4096) throw failure('语音结果元数据无效', 'SPEECH_OUTPUT_INVALID');
      const metadata = JSON.parse(await readFile(metadataFile, 'utf8'));
      if (metadata.stop_reached !== true || metadata.stop_reason !== 'eos') throw failure('语音生成未完整结束，请缩短文字后重试', 'SPEECH_TRUNCATED');
      const output = join(directory, 'output.wav');
      if ((await stat(output)).size > MAX_WAV_BYTES) throw failure('语音模型返回了超过 45 秒的音频', 'SPEECH_OUTPUT_INVALID');
      const bytes = await readFile(output), format = validateSynthesizedAudio(bytes);
      signal?.throwIfAborted();
      return { audio: bytes.toString('base64'), mimeType: 'audio/wav', ...format,
        provider: 'stepaudio-mlx', model: STEP_AUDIO_MODEL, revision: STEP_AUDIO_REVISION,
        runtime: STEP_AUDIO_RUNTIME, voice: this.voice,
        generatedAudioTokens: Number.isSafeInteger(metadata.generated_audio_tokens) && metadata.generated_audio_tokens >= 0 ? metadata.generated_audio_tokens : null };
    } catch (error) {
      if (signal?.aborted) throw failure('语音合成已取消', 'SPEECH_CANCELLED', 499);
      if (error.code?.startsWith('SPEECH_')) throw error;
      throw failure('本机语音合成失败，请检查运行库、模型和参考音色配置', 'SPEECH_SYNTHESIS_FAILED');
    } finally { try { if (directory) await rm(directory, { recursive: true, force: true }); } finally { this.busy = false; } }
  }
}
