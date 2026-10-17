'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INLINE = /\son(error|click|load|change|input|submit|mouse\w+|focus|blur|key\w+)\s*=\s*["'\\]/;

function productionFiles() {
  const files = [];
  for (const f of fs.readdirSync(ROOT)) if (f.endsWith('.html')) files.push(f);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) files.push(path.join('js', f));
  return files;
}

test('扩展页面脚本与 HTML 不含内联事件处理器（MV3 CSP 会拦截）', () => {
  const offenders = [];
  for (const rel of productionFiles()) {
    const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    lines.forEach((line, i) => { if (INLINE.test(line)) offenders.push(`${rel}:${i + 1}`); });
  }
  assert.deepEqual(offenders, []);
});

test('img-fallback 在捕获阶段处理 hide / remove', () => {
  const listeners = [];
  const root = { document: { addEventListener: (t, fn, cap) => listeners.push({ t, fn, cap }) } };
  const src = fs.readFileSync(path.join(ROOT, 'js/img-fallback.js'), 'utf8');
  new Function('window', 'globalThis', `${src}`)(root, root);
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].t, 'error');
  assert.equal(listeners[0].cap, true);

  const mk = (mode) => ({ tagName: 'IMG', style: {}, removed: false, remove() { this.removed = true; }, getAttribute: () => mode });
  const hide = mk('hide'); listeners[0].fn({ target: hide });
  assert.equal(hide.style.display, 'none');
  const rm = mk('remove'); listeners[0].fn({ target: rm });
  assert.equal(rm.removed, true);
  const none = mk(null); listeners[0].fn({ target: none });
  assert.equal(none.removed, false); assert.equal(none.style.display, undefined);
});
