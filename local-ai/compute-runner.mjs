// Sandbox child for `assistant.compute`. It is only ever started by compute-provider.mjs under
// `node --permission` (no fs write, child process, worker, network, addons, WASI or inspector) with an
// empty environment. The model-written code itself runs inside QuickJS compiled to WebAssembly, which has
// no host objects at all; Node's permission model is defence in depth, not the primary boundary.
//
// Protocol: one JSON request on stdin, exactly one JSON line on stdout, then exit.
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import releaseSync from '@jitl/quickjs-wasmfile-release-sync';

const MAX_REQUEST_BYTES = 70000;
const WASM_PAGE = 65536;
const INITIAL_PAGES = 256;
const reply = (value, code = 0) => process.stdout.write(JSON.stringify(value) + '\n', () => process.exit(code));
const clean = (value, limit = 200) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);

// The permission API is the second line of defence. If it is missing or too permissive the run is refused;
// nothing silently falls back to an unrestricted child.
function isolated() {
  const permission = process.permission;
  if (!permission || typeof permission.has !== 'function') return false;
  const has = (...args) => { try { return permission.has(...args); } catch { return null; }; };
  if (has('fs.write') !== false || has('fs.read') !== false || has('fs.read', '/etc/hosts') !== false || has('child') !== false || has('worker') !== false) return false;
  // Scopes that exist only in newer Node versions: refuse when granted, ignore when unknown.
  return ['net', 'addon', 'wasi', 'inspector'].every(scope => has(scope) !== true);
}

async function readRequest() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const integer = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`invalid ${name}`);
  return value;
};

// Runs inside the guest. Builtins used after the user code are captured first, so the user cannot swap
// them. The completion value is always a primitive string: "R" + JSON text, or "I" + a reason.
const WRAPPER = code => `(function () {
  'use strict';
  const stringify = JSON.stringify, parse = JSON.parse, define = Object.defineProperty, freeze = Object.freeze;
  const noop = () => undefined;
  define(globalThis, 'console', { value: freeze({ log: noop, info: noop, warn: noop, error: noop, debug: noop }), writable: true, configurable: true });
  const input = parse(__input);
  delete globalThis.__input;
  const run = new Function('input', ${JSON.stringify(code)});
  const value = run(input);
  if (value === undefined) return 'Inothing was returned';
  if (typeof value === 'function' || typeof value === 'symbol') return 'Ia function or symbol cannot be returned';
  if (value !== null && typeof value === 'object' && typeof value.then === 'function') return 'Iasync results are not supported';
  const text = stringify(value);
  if (typeof text !== 'string') return 'Ithe value cannot be serialised as JSON';
  return 'R' + text;
})()`;

function lineOf(error) {
  // new Function() adds a two-line header before the body, so body line = reported line - 2.
  const raw = typeof error?.lineNumber === 'number' ? error.lineNumber : Number(/<input>:(\d+)/.exec(String(error?.stack || ''))?.[1]);
  return Number.isInteger(raw) && raw > 2 ? raw - 2 : null;
}

async function main() {
  if (!isolated()) return reply({ type: 'fatal', class: 'COMPUTE_ISOLATION_UNAVAILABLE', message: 'Node permission isolation is not active' }, 3);
  const request = await readRequest();
  if (typeof request?.code !== 'string' || !request.code || !request.input || typeof request.input !== 'object' || Array.isArray(request.input)) throw new Error('invalid request');
  const limits = request.limits || {};
  const wallMs = integer(limits.wallMs, 50, 5000, 'wallMs'), memoryBytes = integer(limits.memoryBytes, 1 << 20, 64 << 20, 'memoryBytes');
  const stackBytes = integer(limits.stackBytes, 32 << 10, 1 << 20, 'stackBytes'), wasmMaxPages = integer(limits.wasmMaxPages, 256, 2048, 'wasmMaxPages');
  const outputBytes = integer(limits.outputBytes, 1, 65536, 'outputBytes');
  // The WebAssembly memory ceiling is the hard memory limit. QuickJS's own setMemoryLimit does not count
  // blocks grown with realloc in this WASM build, so it cannot be the only guard.
  const variant = newVariant(releaseSync, { wasmMemory: new WebAssembly.Memory({ initial: INITIAL_PAGES, maximum: wasmMaxPages }) });
  const QuickJS = await newQuickJSWASMModuleFromVariant(variant);
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(memoryBytes);
  runtime.setMaxStackSize(stackBytes);
  const deadline = Date.now() + wallMs;
  let interrupted = false;
  runtime.setInterruptHandler(() => { if (Date.now() > deadline) { interrupted = true; return true; } return false; });
  const vm = runtime.newContext();
  const started = Date.now();
  let outcome;
  try {
    const json = vm.newString(JSON.stringify(request.input));
    vm.setProp(vm.global, '__input', json); json.dispose();
    const result = vm.evalCode(WRAPPER(request.code), 'sandbox.js');
    if (result.error) {
      const error = vm.dump(result.error); result.error.dispose();
      const name = error && typeof error === 'object' ? clean(error.name, 40) : '';
      const message = error && typeof error === 'object' ? clean(error.message) : typeof error === 'string' ? clean(error) : '';
      // QuickJS cannot build an Error object once its heap limit is hit, so an exhausted heap often surfaces as a
      // bare null/empty exception. It counts as memory exhaustion only when the WebAssembly memory has grown
      // past its initial size; a deliberate `throw null` in a fresh runtime stays an ordinary runtime error.
      const blank = !name && !message;
      const grown = QuickJS.getWasmMemory().buffer.byteLength > INITIAL_PAGES * WASM_PAGE;
      let klass = 'COMPUTE_RUNTIME_ERROR';
      if (interrupted) klass = 'COMPUTE_TIMEOUT';
      else if (/out of memory|allocation failed|invalid array buffer length/i.test(message) || (blank && grown)) klass = 'COMPUTE_MEMORY_LIMIT';
      else if (name === 'InternalError' && /stack overflow/i.test(message)) klass = 'COMPUTE_STACK_LIMIT';
      else if (name === 'SyntaxError') klass = 'COMPUTE_SYNTAX_ERROR';
      const detail = blank ? clean(String(error)) : name && name !== 'InternalError' ? `${name}: ${message}` : message;
      outcome = { type: 'error', class: klass, detail, line: lineOf(error) };
    } else {
      const value = vm.dump(result.value); result.value.dispose();
      if (typeof value !== 'string' || !/^[RI]/.test(value)) outcome = { type: 'error', class: 'COMPUTE_OUTPUT_INVALID', detail: 'unexpected completion value', line: null };
      else if (value[0] === 'I') outcome = { type: 'error', class: 'COMPUTE_OUTPUT_INVALID', detail: clean(value.slice(1)), line: null };
      else if (Buffer.byteLength(value) - 1 > outputBytes) outcome = { type: 'error', class: 'COMPUTE_OUTPUT_TOO_LARGE', detail: '', line: null };
      else outcome = { type: 'result', text: value.slice(1), wallMs: Date.now() - started };
    }
  } catch (error) {
    // An engine abort (for example WebAssembly memory exhaustion) is caused by the guest code.
    const message = clean(error?.message);
    outcome = { type: 'error', class: interrupted ? 'COMPUTE_TIMEOUT' : /memory|alloc/i.test(message) ? 'COMPUTE_MEMORY_LIMIT' : 'COMPUTE_RUNTIME_ERROR', detail: interrupted ? '' : message || 'engine aborted', line: null };
  }
  reply(outcome);
}

main().catch(error => reply({ type: 'fatal', class: 'COMPUTE_SANDBOX_FAILED', message: clean(error?.message) || 'sandbox failed' }, 4));
