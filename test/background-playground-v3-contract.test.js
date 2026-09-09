const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demoRoot = path.join(root, 'test/demos/background-playground-v3');
const read = file => fs.readFileSync(path.join(demoRoot, file), 'utf8');

test('v3 可玩性实验室覆盖五种手势、组合能量和四套配色', () => {
  const html = read('index.html');
  const js = read('playground.js');
  for (const gesture of ['pulse', 'weave', 'core', 'flick', 'vortex']) {
    assert.ok(html.includes(`data-discovery="${gesture}"`), `缺少手势发现: ${gesture}`);
    assert.ok(js.includes(`unlock('${gesture}'`), `缺少手势解锁逻辑: ${gesture}`);
  }
  for (const palette of ['aurora', 'ember', 'tide', 'mono']) {
    assert.ok(html.includes(`data-palette="${palette}"`), `缺少配色: ${palette}`);
  }
  assert.ok(js.includes('triggerResonance'));
  assert.ok(js.includes('comboDeadline'));
});

test('快速甩动使用松手前速度窗口而不是松手事件的零位移', () => {
  const js = read('playground.js');
  assert.ok(js.includes('samples: []'));
  assert.ok(js.includes('function recordPointerSample'));
  assert.ok(js.includes('function getReleaseVelocity'));
  assert.ok(js.includes('const targetTime = newest.time - 120'));
  assert.ok(js.includes('const overallVelocity'));
  assert.ok(js.includes('const launchVelocity'));
  assert.ok(js.includes('displacement > 52 && launchVelocity.speed > 4'));
  assert.ok(js.includes('launchVelocity.vx, launchVelocity.vy'));
  assert.ok(!js.includes('const speed = Math.hypot(pointer.vx, pointer.vy)'));
});

test('v3 声音必须由用户显式开启且支持自动休眠和页面隐藏暂停', () => {
  const html = read('index.html');
  const js = read('playground.js');
  const css = read('playground.css');
  assert.ok(html.includes('id="sound-toggle"'));
  assert.ok(js.includes('let soundEnabled = false'));
  assert.ok(js.includes('now - lastInteraction > 12000'));
  assert.ok(js.includes("document.addEventListener('visibilitychange'"));
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
});

test('v2 六个视觉基线 Demo 仍完整保留', () => {
  const v2Root = path.join(root, 'test/demos/background-effects-v2');
  const files = [
    '01-living-depth.html', '02-weather-director.html', '03-memory-reveal.html',
    '04-liquid-color-field.html', '05-time-rift.html', '06-hidden-playground.html',
  ];
  for (const file of files) assert.ok(fs.existsSync(path.join(v2Root, file)), file);
  assert.ok(read('index.html').includes('../background-echo-garden-v4/index.html'));
});
