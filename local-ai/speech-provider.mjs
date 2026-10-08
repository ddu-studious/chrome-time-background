import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, isAbsolute, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import OpenCC from 'opencc-js/t2cn';
const execute = promisify(execFile);
const toSimplified = OpenCC.Converter({ from: 'tw', to: 'cn' });
const DEFAULT_MODEL = join(dirname(fileURLToPath(import.meta.url)), '.local', 'whisper', 'ggml-small-q5_1.bin');
const DEFAULT_BINARY = existsSync('/opt/homebrew/bin/whisper-cli') ? '/opt/homebrew/bin/whisper-cli' : '/usr/local/bin/whisper-cli';

export function validateAudio(value) {
  if (typeof value !== 'string' || value.length > 1280064 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('语音数据无效或超过 30 秒');
  const bytes = Buffer.from(value, 'base64');
  // Canonical browser-produced 16 kHz mono PCM16 WAV, no metadata/chunk injection.
  if (bytes.length < 46 || bytes.length > 960044 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.toString('ascii', 12, 16) !== 'fmt ' || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1 || bytes.readUInt32LE(24) !== 16000 || bytes.readUInt32LE(28) !== 32000 || bytes.readUInt16LE(32) !== 2 || bytes.readUInt16LE(34) !== 16 || bytes.toString('ascii', 36, 40) !== 'data' || bytes.readUInt32LE(40) !== bytes.length - 44 || bytes.readUInt32LE(4) !== bytes.length - 8 || bytes.length % 2) throw new Error('仅支持最长 30 秒的 16kHz 单声道 PCM16 WAV');
  let audible = false;
  for (let index = 44; index < bytes.length; index += 2) if (Math.abs(bytes.readInt16LE(index)) > 32) { audible = true; break; }
  if (!audible) throw new Error('没有录到声音，请检查麦克风后重试');
  return bytes;
}

export class WhisperProvider {
  constructor({ binary = DEFAULT_BINARY, modelPath = process.env.LOCAL_AI_SPEECH_MODEL || DEFAULT_MODEL, run = execute } = {}) {
    this.binary = binary; this.modelPath = modelPath; this.run = run; this.busy = false;
  }
  describe() { return { configured: Boolean(isAbsolute(this.modelPath) && isAbsolute(this.binary) && existsSync(this.modelPath) && existsSync(this.binary)), localOnly: true, maxSeconds: 30, provider: 'whisper.cpp', model: this.modelPath ? basename(this.modelPath) : null }; }
  async transcribe(base64, signal, { timeoutMs = 90000 } = {}) {
    const audio = validateAudio(base64);
    if (!isAbsolute(this.binary) || !isAbsolute(this.modelPath)) throw new Error('请为本地服务配置 LOCAL_AI_SPEECH_MODEL 语音模型绝对路径');
    if (this.busy) throw Object.assign(new Error('语音识别繁忙，请稍后重试'), { statusCode: 429 });
    this.busy = true;
    let directory;
    try {
      signal?.throwIfAborted();
      await access(this.binary); await access(this.modelPath);
      directory = await mkdtemp(join(tmpdir(), 'time-keeper-speech-'));
      const file = join(directory, 'input.wav'), output = join(directory, 'result');
      await writeFile(file, audio, { mode: 0o600 });
      await this.run(this.binary, ['-m', this.modelPath, '-f', file, '-l', 'zh', '-t', '4', '-otxt', '-of', output], { signal, timeout: Math.max(1, Math.min(90000, timeoutMs)), killSignal: 'SIGKILL', maxBuffer: 512 * 1024 });
      signal?.throwIfAborted();
      const recognized = (await readFile(output + '.txt', 'utf8')).trim();
      if (!recognized || recognized.length > 500) throw new Error('没有识别到有效短句，请重试或直接输入文字');
      const text = toSimplified(recognized).trim();
      if (!text || text.length > 500) throw new Error('没有识别到有效短句，请重试或直接输入文字');
      return { text };
    } catch (error) {
      if (signal?.aborted) throw new Error('语音识别已取消');
      if (error.code === 'ENOENT') throw new Error('语音程序或模型文件不存在，请检查本地配置');
      if (error.killed || error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') throw new Error('语音识别超时或输出过长');
      if (error.cmd) throw new Error('本地语音识别失败，请检查语音模型');
      throw error;
    } finally { try { if (directory) await rm(directory, { recursive: true, force: true }); } finally { this.busy = false; } }
  }
}
