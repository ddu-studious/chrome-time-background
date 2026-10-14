// Read-only pure computation for `assistant.compute`.
//
// Model-written code never runs in this process. Each call starts a fresh child:
//   node --permission  (read-only access to the runner and three package directories; no write,
//                       child process, worker, network, addons, WASI or inspector; empty environment)
//     -> quickjs-emscripten-core 0.32.0 (QuickJS compiled to WebAssembly: no host objects, no I/O)
// The parent adds a hard wall-clock kill, bounded stdout, a concurrency cap and cancellation. Every failure
// is reported with a closed error class; there is no in-process fallback when isolation is unavailable.
import { spawn as nodeSpawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPUTE_LIMITS = Object.freeze({
  codeChars: 4000, inputBytes: 40960, outputBytes: 16384,
  wallMs: 2000, killAfterMs: 3500,
  memoryBytes: 16 * 1024 * 1024, wasmMaxPages: 1024, stackBytes: 256 * 1024, maxConcurrent: 2
});
const HARD_RANGES = Object.freeze({
  wallMs: [50, 5000], killAfterMs: [100, 8000], outputBytes: [1, 65536], inputBytes: [1, 40960],
  memoryBytes: [1 << 20, 64 << 20], wasmMaxPages: [256, 2048], stackBytes: [32 << 10, 1 << 20]
});
const GUEST_CLASSES = Object.freeze(['COMPUTE_SYNTAX_ERROR', 'COMPUTE_RUNTIME_ERROR', 'COMPUTE_TIMEOUT', 'COMPUTE_MEMORY_LIMIT', 'COMPUTE_STACK_LIMIT', 'COMPUTE_OUTPUT_INVALID', 'COMPUTE_OUTPUT_TOO_LARGE']);
export const COMPUTE_ERROR_CLASSES = Object.freeze([...GUEST_CLASSES, 'COMPUTE_INPUT_INVALID', 'COMPUTE_INPUT_TOO_LARGE', 'COMPUTE_BUSY', 'COMPUTE_ISOLATION_UNAVAILABLE', 'COMPUTE_SANDBOX_FAILED']);
const MAX_DEPTH = 12;
const STDOUT_CAP = 65536;
const RUNNER = fileURLToPath(new URL('./compute-runner.mjs', import.meta.url));
const PACKAGES = ['quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync', '@jitl/quickjs-ffi-types'];

export class ComputeError extends Error {
  constructor(code, message, statusCode, guest = false) {
    super(message);
    this.name = 'ComputeError'; this.code = code; this.statusCode = statusCode;
    if (guest) this.guest = true;
  }
}
const guestError = (code, message) => new ComputeError(code, message.slice(0, 380), 422, true);
const invalid = message => new ComputeError('COMPUTE_INPUT_INVALID', message, 400);
const digest = text => createHash('sha256').update(text).digest('hex').slice(0, 16);

// The caller's JSON is copied, not trusted: only plain data of bounded depth reaches the sandbox.
function cloneJson(value, depth = 0) {
  if (depth > MAX_DEPTH) throw invalid('输入数据嵌套过深');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw invalid('输入数据包含非有限数字'); return value; }
  if (Array.isArray(value)) return value.map(item => cloneJson(item, depth + 1));
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item, depth + 1)]));
  }
  throw invalid('输入数据只能包含 JSON 值');
}

export function validateComputeInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['code', 'input'].includes(key))) throw invalid('代码计算只接受 code 与 input');
  if (typeof body.code !== 'string' || !body.code.trim()) throw invalid('code 必须是非空字符串');
  if (/\u0000/.test(body.code)) throw invalid('code 不能包含空字符');
  if (body.code.length > COMPUTE_LIMITS.codeChars) throw new ComputeError('COMPUTE_INPUT_TOO_LARGE', `code 最多 ${COMPUTE_LIMITS.codeChars} 字符`, 413);
  if (!body.input || typeof body.input !== 'object' || Array.isArray(body.input)) throw invalid('input 必须是 JSON 对象');
  const input = cloneJson(body.input);
  if (Buffer.byteLength(JSON.stringify(input)) > COMPUTE_LIMITS.inputBytes) throw new ComputeError('COMPUTE_INPUT_TOO_LARGE', `input 最多 ${COMPUTE_LIMITS.inputBytes} 字节`, 413);
  return { code: body.code, input };
}

const require = createRequire(import.meta.url);
function packageDir(name) {
  let directory = dirname(require.resolve(name));
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name) return realpathSync(directory);
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`找不到依赖 ${name}`);
    directory = parent;
  }
}

// Node permission flags shared by the sandbox child and the isolation probe in the tests. Paths must be real
// (symlink-free) because the permission model matches resolved paths. The entry script is appended by the caller.
export function isolationArgs(entry, { read = [] } = {}) {
  return ['--permission', ...[entry, ...read].map(path => `--allow-fs-read=${realpathSync(path)}`), '--disallow-code-generation-from-strings', '--max-old-space-size=128'];
}

function resolveLimits(overrides) {
  const limits = { ...COMPUTE_LIMITS, ...overrides };
  for (const [key, [min, max]] of Object.entries(HARD_RANGES)) {
    if (!Number.isInteger(limits[key]) || limits[key] < min || limits[key] > max) throw new Error(`沙箱限额无效：${key} 必须在 ${min} 至 ${max} 之间`);
  }
  if (limits.killAfterMs <= limits.wallMs) throw new Error('沙箱限额无效：强制终止时间必须大于墙钟限额');
  return Object.freeze(limits);
}

function describeFailure(klass, detail, line, limits) {
  const where = Number.isInteger(line) ? `（第${line}行）` : '';
  switch (klass) {
    case 'COMPUTE_SYNTAX_ERROR': return `代码语法错误：${detail}${where}。code 是函数体，请检查括号与关键字`;
    case 'COMPUTE_RUNTIME_ERROR': return `代码运行出错：${detail}${where}`;
    case 'COMPUTE_TIMEOUT': return `代码运行超过 ${limits.wallMs / 1000} 秒，已终止；请减少循环次数或数据量`;
    case 'COMPUTE_MEMORY_LIMIT': return '代码使用的内存超过上限，已终止；请避免生成巨大的数组或字符串';
    case 'COMPUTE_STACK_LIMIT': return '递归或调用层级过深（栈溢出），已终止；请改用循环';
    case 'COMPUTE_OUTPUT_TOO_LARGE': return `返回值超过 ${limits.outputBytes} 字节；请只返回必要的统计、筛选或排序结果`;
    default: return `代码没有返回可 JSON 序列化的值：${detail}；请用 return 返回对象、数组、字符串、数字、布尔值或 null`;
  }
}

export class ComputeProvider {
  #limits; #maxConcurrent; #spawn; #nodePath; #running = 0; #setup = null;
  constructor({ limits = {}, maxConcurrent = COMPUTE_LIMITS.maxConcurrent, spawn = nodeSpawn, nodePath = process.execPath } = {}) {
    this.#limits = resolveLimits(limits);
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new Error('沙箱并发数必须是 1 至 4');
    this.#maxConcurrent = maxConcurrent; this.#spawn = spawn; this.#nodePath = nodePath;
  }

  // Dependencies are resolved lazily so missing packages disable this scene only, never the local service.
  #prepare() {
    if (this.#setup) return this.#setup;
    try {
      const directories = PACKAGES.map(packageDir);
      const version = JSON.parse(readFileSync(join(directories[0], 'package.json'), 'utf8')).version;
      this.#setup = { args: isolationArgs(RUNNER, { read: directories }), engine: Object.freeze({ name: PACKAGES[0], version, runtime: process.version }) };
    } catch (error) {
      this.#setup = { error: `代码计算依赖不可用，请在 local-ai 目录运行 npm ci：${String(error?.message || error).slice(0, 120)}` };
    }
    return this.#setup;
  }

  describe() {
    const setup = this.#prepare();
    return { configured: !setup.error, localOnly: true, ...(setup.error ? { error: setup.error } : { engine: setup.engine }), limits: { ...this.#limits }, maxConcurrent: this.#maxConcurrent, running: this.#running };
  }

  async run(request, { signal } = {}) {
    signal?.throwIfAborted();
    const { code, input } = validateComputeInput(request);
    const setup = this.#prepare();
    if (setup.error) throw new ComputeError('COMPUTE_SANDBOX_FAILED', setup.error, 503);
    if (this.#running >= this.#maxConcurrent) throw new ComputeError('COMPUTE_BUSY', '代码计算正忙，请稍后重试', 429);
    const limits = this.#limits, started = Date.now();
    this.#running++;
    try {
      const outcome = await this.#execute({ code, input }, setup, limits, signal);
      return { ...outcome, codeHash: digest(code), inputDigest: digest(JSON.stringify(input)), elapsedMs: Date.now() - started, engine: setup.engine };
    } finally { this.#running--; }
  }

  // The first complete stdout line is the answer. Whatever happens next, run() settles only after the child
  // has exited (it is killed if still alive), so a cancelled or finished call never leaves a sandbox process.
  #execute(payload, setup, limits, signal) {
    return new Promise((resolve, reject) => {
      let child, stdout = '', decided = false, exited = false, killedByTimer = false, timer, fallback, delivered = false;
      const kill = () => { try { child?.kill('SIGKILL'); } catch { /* already gone */ } };
      const infra = (message, code = 'COMPUTE_SANDBOX_FAILED', status = 502) => new ComputeError(code, message, status);
      const settle = (action, value) => {
        if (decided) return; decided = true;
        clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
        const deliver = () => { if (delivered) return; delivered = true; clearTimeout(fallback); action(value); };
        if (exited || !child?.pid) return deliver();
        kill(); child.once('close', deliver); fallback = setTimeout(deliver, 1000);
      };
      const onAbort = () => settle(reject, signal.reason ?? Object.assign(new Error('任务已停止'), { name: 'AbortError' }));
      const conclude = closed => {
        if (decided) return;
        if (signal?.aborted) return onAbort(); // a late result must never update a cancelled task
        const newline = stdout.indexOf('\n');
        if (newline < 0) {
          if (!closed) return;
          return settle(reject, killedByTimer ? guestError('COMPUTE_TIMEOUT', describeFailure('COMPUTE_TIMEOUT', '', null, limits)) : infra('代码计算沙箱没有返回有效结果'));
        }
        let line;
        try { line = JSON.parse(stdout.slice(0, newline)); } catch { return settle(reject, infra('代码计算沙箱没有返回有效结果')); }
        if (!line || typeof line !== 'object') return settle(reject, infra('代码计算沙箱没有返回有效结果'));
        if (line.type === 'fatal') {
          return settle(reject, line.class === 'COMPUTE_ISOLATION_UNAVAILABLE'
            ? infra('代码计算沙箱的进程隔离不可用，已拒绝执行；请确认本机 Node 版本支持 --permission', 'COMPUTE_ISOLATION_UNAVAILABLE', 503)
            : infra('代码计算沙箱内部出错'));
        }
        if (line.type === 'error' && GUEST_CLASSES.includes(line.class) && typeof line.detail === 'string' && (line.line === null || Number.isInteger(line.line))) {
          return settle(reject, guestError(line.class, describeFailure(line.class, line.detail.slice(0, 200), line.line, limits)));
        }
        if (line.type === 'result' && typeof line.text === 'string' && Buffer.byteLength(line.text) <= limits.outputBytes) {
          let output;
          try { output = JSON.parse(line.text); } catch { return settle(reject, infra('代码计算沙箱返回的结果不是有效 JSON')); }
          return settle(resolve, { output, outputBytes: Buffer.byteLength(line.text) });
        }
        return settle(reject, infra('代码计算沙箱返回了无法识别的结果'));
      };
      try {
        child = this.#spawn(this.#nodePath, [...setup.args, RUNNER], { env: {}, cwd: '/', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      } catch (error) { return reject(infra(`无法启动代码计算沙箱：${String(error?.message || error).slice(0, 120)}`)); }
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => { killedByTimer = true; kill(); }, limits.killAfterMs);
      child.on('error', error => settle(reject, infra(`代码计算沙箱启动失败：${String(error?.message || error).slice(0, 120)}`)));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        if (decided) return;
        stdout += chunk;
        if (stdout.length > STDOUT_CAP) return settle(reject, infra('代码计算沙箱输出异常，已终止'));
        if (stdout.includes('\n')) conclude(false);
      });
      child.stderr.on('data', () => {}); // diagnostics never reach callers
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ ...payload, limits: { wallMs: limits.wallMs, memoryBytes: limits.memoryBytes, stackBytes: limits.stackBytes, wasmMaxPages: limits.wasmMaxPages, outputBytes: limits.outputBytes } }));
      child.on('close', () => { exited = true; conclude(true); });
    });
  }
}
