import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ComputeProvider, COMPUTE_LIMITS, COMPUTE_ERROR_CLASSES, isolationArgs, validateComputeInput } from '../local-ai/compute-provider.mjs';

const FAST = { wallMs: 600, killAfterMs: 1800 };
const provider = (options = {}) => new ComputeProvider({ ...options, limits: { ...FAST, ...options.limits } });
const run = (code, input = {}, options = {}) => provider(options.provider).run({ code, input }, options.run);
async function failure(code, input, options) {
  try { await run(code, input, options); }
  catch (error) { return error; }
  assert.fail('预期沙箱拒绝或终止这段代码');
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };

// ---- 正常计算 -------------------------------------------------------------------------------

test('返回可 JSON 序列化的结果，输入数据只经 input 注入，并给出可记录的指纹', async () => {
  const result = await run('return { total: input.data[0].reduce((a, b) => a + b, 0), who: input.who };', { data: [[1, 2, 3, 4]], who: '歌手 🎵' });
  assert.deepEqual(result.output, { total: 10, who: '歌手 🎵' });
  assert.equal(result.outputBytes, Buffer.byteLength(JSON.stringify(result.output)));
  assert.match(result.codeHash, /^[a-f0-9]{16}$/); assert.match(result.inputDigest, /^[a-f0-9]{16}$/);
  assert.equal(typeof result.elapsedMs, 'number');
  assert.equal(result.engine.name, 'quickjs-emscripten-core'); assert.equal(result.engine.version, '0.32.0');
});

test('日期运算使用宿主注入的 now，只依赖 ES 内置对象', async () => {
  const now = Date.UTC(2026, 9, 12, 8, 0, 0);
  const result = await run('const d = new Date(input.now); d.setUTCDate(d.getUTCDate() + 21); return d.toISOString().slice(0, 10);', { now });
  assert.equal(result.output, '2026-11-02');
});

test('排序、统计和较大输入在限额内正确完成', async () => {
  const rows = Array.from({ length: 700 }, (_, index) => ({ title: `歌${index}`, artist: `歌手${index % 7}`, n: (index * 7919) % 1500 }));
  const size = Buffer.byteLength(JSON.stringify({ rows }));
  assert.ok(size > 25000 && size < COMPUTE_LIMITS.inputBytes, `输入 ${size} 字节应接近但不超过上限`);
  const result = await run(`const count = {}; for (const row of input.rows) count[row.artist] = (count[row.artist] || 0) + 1;
    return { top: Object.entries(count).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0], first: input.rows.map(r => r.n).sort((a, b) => a - b)[0], sum: input.rows.reduce((total, row) => total + row.n, 0) };`, { rows });
  assert.deepEqual(result.output, { top: ['歌手0', 100], first: 0, sum: rows.reduce((total, row) => total + row.n, 0) });
});

test('console 是无副作用的空操作：不报错、不输出，也不影响返回值', async () => {
  const result = await run('for (let i = 0; i < 50; i++) console.log("行", i, { a: 1 }); console.error(new Error("x")); return 7;');
  assert.equal(result.output, 7);
  assert.equal('logs' in result, false);
});

test('没有 return、返回函数或 Promise 时明确报告输出无效', async () => {
  for (const code of ['const x = 1;', 'return () => 1;', 'return Promise.resolve(1);', 'return (async () => 1)();', 'return Symbol("x");']) {
    const error = await failure(code);
    assert.equal(error.code, 'COMPUTE_OUTPUT_INVALID', code); assert.equal(error.guest, true); assert.equal(error.statusCode, 422);
  }
});

test('语法错误与运行时错误分类明确，信息有界并给出代码行号', async () => {
  const syntax = await failure('const a = 1;\nreturn (');
  assert.equal(syntax.code, 'COMPUTE_SYNTAX_ERROR'); assert.equal(syntax.guest, true);
  assert.match(syntax.message, /第\s*\d+\s*行/);
  const runtime = await failure('const a = null;\nreturn a.missing.value;');
  assert.equal(runtime.code, 'COMPUTE_RUNTIME_ERROR');
  assert.match(runtime.message, /第\s*2\s*行/); assert.ok(runtime.message.length <= 400);
  const thrown = await failure('throw new Error("boom");');
  assert.equal(thrown.code, 'COMPUTE_RUNTIME_ERROR'); assert.match(thrown.message, /boom/);
  const bigint = await failure('return 10n;');
  assert.equal(bigint.code, 'COMPUTE_RUNTIME_ERROR');
  const cyclic = await failure('const a = {}; a.self = a; return a;');
  assert.equal(cyclic.code, 'COMPUTE_RUNTIME_ERROR');
});

test('每个错误类都在封闭列表内，且只有基础设施错误不被标记为代码错误', async () => {
  assert.deepEqual([...COMPUTE_ERROR_CLASSES].sort(), ['COMPUTE_BUSY', 'COMPUTE_INPUT_INVALID', 'COMPUTE_INPUT_TOO_LARGE', 'COMPUTE_ISOLATION_UNAVAILABLE', 'COMPUTE_MEMORY_LIMIT', 'COMPUTE_OUTPUT_INVALID', 'COMPUTE_OUTPUT_TOO_LARGE', 'COMPUTE_RUNTIME_ERROR', 'COMPUTE_SANDBOX_FAILED', 'COMPUTE_STACK_LIMIT', 'COMPUTE_SYNTAX_ERROR', 'COMPUTE_TIMEOUT'].sort());
  const guest = await Promise.all(['return (', 'return a.b', 'while(true){}', 'function f(){return f()} return f()', 'return "x".repeat(20000)', 'return undefined'].map(code => failure(code)));
  assert.ok(guest.every(error => error.guest === true && error.statusCode === 422 && COMPUTE_ERROR_CLASSES.includes(error.code)));
});

// ---- 资源限制 -------------------------------------------------------------------------------

test('死循环在墙钟限额内由中断终止，且错误不可被来宾代码捕获吞掉', async () => {
  const started = Date.now();
  const error = await failure('while (true) { try { while (true) {} } catch (e) {} }');
  assert.equal(error.code, 'COMPUTE_TIMEOUT'); assert.equal(error.guest, true);
  assert.ok(Date.now() - started < 3500, `耗时 ${Date.now() - started} ms`);
});

test('灾难性回溯正则同样受时限约束', async () => {
  const error = await failure('return /^(a+)+$/.test("a".repeat(60) + "b");');
  assert.equal(error.code, 'COMPUTE_TIMEOUT');
});

test('内存炸弹（数组/对象/字符串/类型数组）被 WASM 内存上限拦截，宿主内存不随之膨胀', async () => {
  const bombs = [
    'const a = []; while (true) a.push(new Array(100000).fill(1));',
    'const a = []; for (let i = 0; i < 1e8; i++) a.push({ i, s: "x".repeat(100) });',
    'let s = "x".repeat(1000); const parts = []; while (true) parts.push(s + parts.length);',
    'return new Uint8Array(1024 * 1024 * 1024).length;',
    'return new ArrayBuffer(512 * 1024 * 1024).byteLength;',
    'return new Array(1e9).fill(0).length;'
  ];
  const before = process.memoryUsage().rss;
  for (const code of bombs) {
    const started = Date.now();
    const error = await failure(code, {}, { provider: { limits: { wallMs: 1500, killAfterMs: 3000 } } });
    assert.ok(['COMPUTE_MEMORY_LIMIT', 'COMPUTE_TIMEOUT'].includes(error.code), `${code} -> ${error.code}`);
    assert.equal(error.guest, true);
    assert.ok(Date.now() - started < 3600);
  }
  assert.ok(process.memoryUsage().rss - before < 200 * 1024 * 1024, '沙箱的内存只能出现在被杀掉的子进程里');
  const direct = await failure('const a = []; while (true) a.push(new Array(100000).fill(1));', {}, { provider: { limits: { wallMs: 1500, killAfterMs: 3000 } } });
  assert.equal(direct.code, 'COMPUTE_MEMORY_LIMIT');
});

test('无限递归得到栈溢出错误类，错误文本被截断', async () => {
  const error = await failure('function f() { return f() + 1; } return f();');
  assert.equal(error.code, 'COMPUTE_STACK_LIMIT'); assert.ok(error.message.length <= 400);
});

test('输出超过 16 KB 被拒绝，边界内的输出被保留', async () => {
  assert.equal((await failure('return "x".repeat(20000);')).code, 'COMPUTE_OUTPUT_TOO_LARGE');
  assert.equal((await failure('return Array.from({ length: 5000 }, (_, i) => ({ i }));')).code, 'COMPUTE_OUTPUT_TOO_LARGE');
  const ok = await run('return "x".repeat(16000);');
  assert.equal(ok.output.length, 16000);
});

test('输入校验：代码与数据大小、类型、形状均有上限，非 JSON 值被拒绝', async () => {
  assert.equal(COMPUTE_LIMITS.codeChars, 4000); assert.equal(COMPUTE_LIMITS.outputBytes, 16384);
  assert.throws(() => validateComputeInput({ code: '', input: {} }), error => error.code === 'COMPUTE_INPUT_INVALID' && error.statusCode === 400);
  assert.throws(() => validateComputeInput({ code: 'x'.repeat(4001), input: {} }), error => error.code === 'COMPUTE_INPUT_TOO_LARGE');
  assert.throws(() => validateComputeInput({ code: 'return 1', input: { big: 'x'.repeat(41000) } }), error => error.code === 'COMPUTE_INPUT_TOO_LARGE');
  assert.throws(() => validateComputeInput({ code: 'return 1', input: [] }), error => error.code === 'COMPUTE_INPUT_INVALID');
  assert.throws(() => validateComputeInput({ code: 'return 1', input: { n: 10n } }), error => error.code === 'COMPUTE_INPUT_INVALID');
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => validateComputeInput({ code: 'return 1', input: cyclic }), error => error.code === 'COMPUTE_INPUT_INVALID');
  assert.throws(() => validateComputeInput({ code: 'return 1', input: {}, extra: true }), error => error.code === 'COMPUTE_INPUT_INVALID');
  assert.throws(() => validateComputeInput({ code: 'return 1\u0000', input: {} }), error => error.code === 'COMPUTE_INPUT_INVALID');
  const deep = {}; let node = deep; for (let i = 0; i < 40; i++) node = node.child = {};
  assert.throws(() => validateComputeInput({ code: 'return 1', input: deep }), error => error.code === 'COMPUTE_INPUT_INVALID');
  assert.deepEqual(validateComputeInput({ code: 'return 1', input: { a: [1] } }), { code: 'return 1', input: { a: [1] } });
});

// ---- 逃逸与宿主能力 ---------------------------------------------------------------------------

test('来宾看不到任何宿主全局：全局属性只允许 ES 内置与受限 console', async () => {
  const allowed = new Set(['AggregateError', 'Array', 'ArrayBuffer', 'BigInt', 'BigInt64Array', 'BigUint64Array', 'Boolean', 'DataView', 'Date', 'Error', 'EvalError', 'FinalizationRegistry', 'Float16Array', 'Float32Array', 'Float64Array', 'Function', 'Infinity', 'Int16Array', 'Int32Array', 'Int8Array', 'InternalError', 'Iterator', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'Promise', 'Proxy', 'RangeError', 'ReferenceError', 'Reflect', 'RegExp', 'Set', 'SharedArrayBuffer', 'String', 'Symbol', 'SyntaxError', 'TypeError', 'URIError', 'Uint16Array', 'Uint32Array', 'Uint8Array', 'Uint8ClampedArray', 'WeakMap', 'WeakRef', 'WeakSet', 'console', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'eval', 'globalThis', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined', 'unescape']);
  const names = (await run('return Object.getOwnPropertyNames(globalThis);')).output;
  assert.deepEqual(names.filter(name => !allowed.has(name)), [], '出现了未登记的全局名称，QuickJS 升级后须重新审查');
  const shared = (await run('return [Object.getPrototypeOf(globalThis) === Object.prototype, Object.getPrototypeOf(Object.prototype)];')).output;
  assert.deepEqual(shared, [true, null], '全局对象的原型必须是来宾自己的 Object.prototype，没有宿主定义的中间原型');
});

test('process/require/fetch/定时器/Buffer/WebAssembly/Atomics/std/os 都不存在', async () => {
  const names = ['process', 'require', 'module', 'exports', '__filename', '__dirname', 'fetch', 'XMLHttpRequest', 'WebSocket', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'Buffer', 'WebAssembly', 'Atomics', 'std', 'os', 'scriptArgs', 'Intl', 'structuredClone', 'TextEncoder', 'TextDecoder', 'URL', 'crypto', 'navigator', 'window', 'document', 'chrome', 'Deno', 'Bun', 'gc', '__input'];
  const result = (await run(`return ${JSON.stringify(names)}.map(name => typeof globalThis[name]);`)).output;
  assert.deepEqual(result, names.map(() => 'undefined'));
  assert.equal((await failure('return Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);')).code, 'COMPUTE_RUNTIME_ERROR');
  assert.equal((await failure('return process.env.HOME;')).code, 'COMPUTE_RUNTIME_ERROR');
  assert.equal((await failure('return require("fs").readFileSync("/etc/hosts", "utf8");')).code, 'COMPUTE_RUNTIME_ERROR');
});

test('Function 构造器、constructor 链、间接 eval 与 this 都只能触及来宾自己的世界', async () => {
  const result = (await run(`const probes = [
    () => (function () {}).constructor('return typeof process')(),
    () => Function('return typeof require')(),
    () => (0, eval)('typeof process'),
    () => eval('typeof globalThis.process'),
    () => (function () { return typeof this.process + typeof this.require; }).call(undefined),
    () => ({}).constructor.constructor('return typeof fetch')(),
    () => new Function('return typeof setTimeout')(),
    () => Reflect.ownKeys(globalThis).filter(key => typeof key === 'string' && /^(process|require|module|fetch|Buffer|child_process|fs|os)$/i.test(key)).join(',')
  ]; return probes.map(probe => { try { return String(probe()); } catch (error) { return 'error:' + error.name; } });`)).output;
  assert.deepEqual(result, ['undefined', 'undefined', 'undefined', 'undefined', 'undefinedundefined', 'undefined', 'undefined', '']);
});

test('动态 import 与静态 import 都不能加载宿主模块', async () => {
  assert.equal((await failure('return import("node:fs");')).code, 'COMPUTE_OUTPUT_INVALID');
  assert.equal((await failure('return import("fs").then(fs => fs.readFileSync("/etc/hosts", "utf8"));')).code, 'COMPUTE_OUTPUT_INVALID');
  assert.equal((await failure('import fs from "fs"; return 1;')).code, 'COMPUTE_SYNTAX_ERROR');
  assert.equal((await failure('return import("os").catch(() => "x");')).code, 'COMPUTE_OUTPUT_INVALID');
});

test('每次运行都是全新进程：原型污染与全局修改不会残留到下一次', async () => {
  const first = await run('Object.prototype.polluted = "yes"; Array.prototype.map = () => "hacked"; globalThis.leak = 1; return typeof ({}).polluted;');
  assert.equal(first.output, 'string');
  const second = (await run('return [typeof ({}).polluted, typeof globalThis.leak, [1].map(x => x + 1)[0]];')).output;
  assert.deepEqual(second, ['undefined', 'undefined', 2]);
});

test('来宾篡改 JSON.stringify/toJSON 不能欺骗宿主的输出检查', async () => {
  const forged = await run('JSON.stringify = () => "[\\"forged\\"]"; return { honest: true };');
  assert.deepEqual(forged.output, { honest: true });
  const hostile = await failure('return { toJSON() { return "x".repeat(50000); } };');
  assert.equal(hostile.code, 'COMPUTE_OUTPUT_TOO_LARGE');
  const throwing = await failure('return { toJSON() { throw new Error("nope"); } };');
  assert.equal(throwing.code, 'COMPUTE_RUNTIME_ERROR');
});

test('输出里的 __proto__ 键不会污染宿主对象', async () => {
  const result = await run('return JSON.parse(\'{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted2": 2}}, "a": 1}\');');
  assert.equal(Object.getPrototypeOf(result.output), Object.prototype);
  assert.equal(({}).polluted, undefined); assert.equal(({}).polluted2, undefined);
  assert.equal(result.output.a, 1);
});

test('大量日志调用和巨量字符串拼接不会拖垮宿主', async () => {
  const result = await run('let s = ""; for (let i = 0; i < 5000; i++) { console.log("x".repeat(5000)); s += "ab"; } return s.length;');
  assert.equal(result.output, 10000);
});

// ---- 子进程隔离与失败闭合 ---------------------------------------------------------------------

test('权限模型实际生效：同样的 Node 标志下读文件、写文件、子进程、worker、网络、DNS、扩展、WASI 全部被拒', () => {
  const probe = fileURLToPath(new URL('./fixtures/compute-isolation-probe.mjs', import.meta.url));
  const marker = join(tmpdir(), `compute-probe-${process.pid}-${Date.now()}.txt`);
  const outcome = spawnSync(process.execPath, [...isolationArgs(probe), probe, marker], { env: {}, cwd: '/', encoding: 'utf8', timeout: 8000 });
  assert.equal(outcome.status, 0, outcome.stderr);
  const report = JSON.parse(outcome.stdout.trim().split('\n').at(-1));
  assert.equal(report.permissionApi, 'object');
  for (const [name, state] of Object.entries(report.result)) assert.notEqual(state, 'ALLOWED', `${name} 不应可用`);
  for (const name of ['readOutside', 'readSecretStore', 'listRepository', 'writeFile', 'spawnChild', 'startWorker', 'tcpConnect', 'dnsLookup']) assert.equal(report.result[name], 'ERR_ACCESS_DENIED', name);
  assert.ok(['ERR_ACCESS_DENIED', 'ERR_DLOPEN_DISABLED'].includes(report.result.loadAddon), `原生扩展必须被拒：${report.result.loadAddon}`);
  assert.equal(existsSync(marker), false);
  rmSync(marker, { force: true });
});

test('子进程参数最小授权：只读运行器与三个包目录，无写、无网络、无子进程、无环境变量，工作目录为根', async () => {
  const calls = [];
  const spy = (command, args, options) => { calls.push({ command, args, options }); return spawn(command, args, options); };
  await provider({ spawn: spy }).run({ code: 'return 1', input: {} });
  assert.equal(calls.length, 1);
  const { command, args, options } = calls[0];
  assert.equal(command, process.execPath);
  assert.ok(args.includes('--permission') && args.includes('--disallow-code-generation-from-strings'));
  assert.ok(!args.some(arg => /^--allow-(fs-write|child-process|worker|net|addons|wasi|inspector|ffi)/.test(arg)));
  const reads = args.filter(arg => arg.startsWith('--allow-fs-read=')).map(arg => arg.slice('--allow-fs-read='.length));
  assert.equal(reads.length, 4);
  const root = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
  for (const path of reads) { assert.ok(path.startsWith(root), path); assert.equal(path, realpathSync(path)); assert.ok(!/\/(\.local|test|docs|js|assets|css)(\/|$)/.test(path.slice(root.length)), path); }
  assert.ok(reads.some(path => path.endsWith('compute-runner.mjs')));
  assert.deepEqual(options.env, {}); assert.equal(options.cwd, '/'); assert.deepEqual(options.stdio, ['pipe', 'pipe', 'pipe']);
});

test('隔离不可用时失败闭合：去掉全部权限标志后运行器自检拒绝执行，提供者报告基础设施错误而不是静默回退', async () => {
  const stripped = (command, args, options) => spawn(command, args.filter(arg => !/^--(permission|allow-)/.test(arg)), options);
  const error = await provider({ spawn: stripped }).run({ code: 'return 1', input: {} }).catch(value => value);
  assert.equal(error.code, 'COMPUTE_ISOLATION_UNAVAILABLE'); assert.equal(error.statusCode, 503); assert.notEqual(error.guest, true);
  assert.match(error.message, /隔离/);
});

test('只去掉 --permission 而保留授权参数时，Node 或运行器仍拒绝执行，绝不返回结果', async () => {
  const stripped = (command, args, options) => spawn(command, args.filter(arg => arg !== '--permission'), options);
  const error = await provider({ spawn: stripped }).run({ code: 'return 1', input: {} }).catch(value => value);
  assert.ok(['COMPUTE_ISOLATION_UNAVAILABLE', 'COMPUTE_SANDBOX_FAILED'].includes(error.code), String(error.code ?? error));
  assert.notEqual(error.guest, true);
});

test('子进程崩溃、输出异常、输出过量都是基础设施错误且进程被清理', async () => {
  const children = [];
  const script = body => (command, args, options) => { const child = spawn(command, ['-e', body], options); children.push(child); return child; };
  for (const body of ['process.exit(3)', 'process.stdout.write("not json\\n")', 'console.log(JSON.stringify({type:"result",text:5}))', 'console.log(JSON.stringify({type:"error",class:"NOT_REGISTERED",message:"x"}))', 'process.stdout.write("x".repeat(300000)); setInterval(() => {}, 1000)']) {
    const error = await provider({ spawn: script(body) }).run({ code: 'return 1', input: {} }).catch(value => value);
    assert.equal(error.code, 'COMPUTE_SANDBOX_FAILED', body); assert.equal(error.statusCode, 502); assert.notEqual(error.guest, true);
  }
  assert.ok(children.every(child => child.pid && !alive(child.pid)));
});

test('运行器卡死时由父进程强制终止并报告超时', async () => {
  const children = [];
  const hung = (command, args, options) => { const child = spawn(command, ['-e', 'process.stdin.resume(); setInterval(() => {}, 1000)'], options); children.push(child); return child; };
  const started = Date.now();
  const error = await provider({ spawn: hung, limits: { wallMs: 300, killAfterMs: 900 } }).run({ code: 'return 1', input: {} }).catch(value => value);
  assert.equal(error.code, 'COMPUTE_TIMEOUT'); assert.equal(error.guest, true);
  assert.ok(Date.now() - started < 2500);
  assert.ok(!alive(children[0].pid));
});

test('取消在约 1 秒内终止子进程，错误携带取消原因，不残留进程', async () => {
  const children = [];
  const spy = (command, args, options) => { const child = spawn(command, args, options); children.push(child); return child; };
  const controller = new AbortController();
  const pending = provider({ spawn: spy, limits: { wallMs: 2000, killAfterMs: 3500 } }).run({ code: 'while (true) {}', input: {} }, { signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 400));
  const started = Date.now(); controller.abort(Object.assign(new Error('任务已停止'), { name: 'AbortError' }));
  const error = await pending.catch(value => value);
  assert.equal(error.name, 'AbortError'); assert.ok(Date.now() - started < 1000, `取消耗时 ${Date.now() - started} ms`);
  assert.ok(!alive(children[0].pid));
  const early = new AbortController(); early.abort(Object.assign(new Error('已取消'), { name: 'AbortError' }));
  const none = [];
  const rejected = await provider({ spawn: (...args) => { none.push(args); return spawn(...args); } }).run({ code: 'return 1', input: {} }, { signal: early.signal }).catch(value => value);
  assert.equal(rejected.name, 'AbortError'); assert.equal(none.length, 0, '已取消的请求不应启动子进程');
});

test('并发受限：超出上限立即返回忙碌，结束后名额释放', async () => {
  const limited = provider({ maxConcurrent: 2, limits: { wallMs: 700, killAfterMs: 2000 } });
  const slow = () => limited.run({ code: 'while (true) {}', input: {} }).catch(error => error);
  const first = slow(), second = slow();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(limited.describe().running, 2);
  const busy = await limited.run({ code: 'return 1', input: {} }).catch(error => error);
  assert.equal(busy.code, 'COMPUTE_BUSY'); assert.equal(busy.statusCode, 429);
  assert.deepEqual((await Promise.all([first, second])).map(error => error.code), ['COMPUTE_TIMEOUT', 'COMPUTE_TIMEOUT']);
  assert.equal(limited.describe().running, 0);
  assert.equal((await limited.run({ code: 'return 2', input: {} })).output, 2);
});

test('默认限额符合设计，并且调用方不能把限额调到硬上限之外', async () => {
  assert.equal(COMPUTE_LIMITS.wallMs, 2000); assert.equal(COMPUTE_LIMITS.memoryBytes, 16 * 1024 * 1024);
  assert.equal(COMPUTE_LIMITS.stackBytes, 256 * 1024); assert.equal(COMPUTE_LIMITS.inputBytes, 40960);
  assert.throws(() => new ComputeProvider({ limits: { wallMs: 60000 } }), /限额/);
  assert.throws(() => new ComputeProvider({ limits: { outputBytes: 10 ** 7 } }), /限额/);
  assert.throws(() => new ComputeProvider({ maxConcurrent: 50 }), /并发/);
  const info = new ComputeProvider().describe();
  assert.equal(info.configured, true); assert.equal(info.localOnly, true); assert.equal(info.engine.version, '0.32.0'); assert.equal(info.running, 0);
});

test('子进程与测试结束后没有遗留的探针文件', () => {
  const leftovers = readdirSync(tmpdir()).filter(name => name.startsWith(`compute-probe-${process.pid}-`));
  assert.deepEqual(leftovers, []);
});
