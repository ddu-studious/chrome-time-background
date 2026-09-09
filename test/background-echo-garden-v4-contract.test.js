const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demoRoot = path.join(root, 'test/demos/background-echo-garden-v4');
const read = file => fs.readFileSync(path.join(demoRoot, file), 'utf8');

test('v4 回声花园提供三层录制、循环、和声与绽放', () => {
  const html = read('index.html');
  const js = read('garden.js');
  for (const marker of ['data-slot="0"', 'data-slot="1"', 'data-slot="2"', 'id="record-toggle"', 'id="tempo"', 'id="demo-garden"']) {
    assert.ok(html.includes(marker), marker);
  }
  assert.ok(js.includes('function beginRecording'));
  assert.ok(js.includes('function finishRecording'));
  assert.ok(js.includes('function harmonyAt'));
  assert.ok(js.includes('function triggerBloom'));
  assert.ok(js.includes('currentPoints.length > 160'));
  assert.ok(js.includes('capturedDuration >= 240 || pathLength >= 80'));
  assert.ok(js.includes('pathLength * 3.2'));
  assert.ok(js.includes('const syncedAt = performance.now()'));
  assert.ok(js.includes('loop.created = syncedAt'));
});

test('v4 声音默认关闭并支持减少动态效果和页面隐藏暂停', () => {
  const js = read('garden.js');
  const css = read('garden.css');
  assert.ok(js.includes('let soundEnabled = false'));
  assert.ok(js.includes("document.addEventListener('visibilitychange'"));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
});

test('v2 与 v3 Demo 仍保留且 v4 可返回 v3', () => {
  const html = read('index.html');
  assert.ok(fs.existsSync(path.join(root, 'test/demos/background-effects-v2/index.html')));
  assert.ok(fs.existsSync(path.join(root, 'test/demos/background-playground-v3/index.html')));
  assert.ok(html.includes('../background-playground-v3/index.html'));
});
