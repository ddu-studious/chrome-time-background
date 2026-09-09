const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../js/chrome-shim.js'), 'utf8');

test('本地预览兼容设置监听和扩展内 URL', () => {
  assert.ok(source.includes('globalThis.chrome.storage.onChanged'));
  assert.ok(source.includes('globalThis.chrome.runtime.getURL'));
  assert.ok(source.includes('globalThis.chrome.runtime.getManifest'));
  assert.ok(source.includes("msg?.action === 'getBackgrounds'"));
  assert.ok(source.includes("source: 'local-preview'"));
});
