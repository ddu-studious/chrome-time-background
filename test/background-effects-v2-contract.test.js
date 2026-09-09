const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const demoRoot = path.join(root, 'test/demos/background-effects-v2');
const read = file => fs.readFileSync(path.join(demoRoot, file), 'utf8');

const demos = [
  ['01-living-depth.html', 'data-effect="depth"'],
  ['02-weather-director.html', 'data-effect="weather"'],
  ['03-memory-reveal.html', 'data-effect="memory"'],
  ['04-liquid-color-field.html', 'data-effect="liquid"'],
  ['05-time-rift.html', 'data-effect="time"'],
  ['06-hidden-playground.html', 'data-effect="play"'],
];

test('背景特效 v2 体验馆提供六个独立可交互 Demo', () => {
  const index = read('index.html');
  for (const [file, marker] of demos) {
    assert.ok(index.includes(`href="${file}"`), `体验馆缺少入口: ${file}`);
    const html = read(file);
    assert.ok(html.includes(marker), `Demo 缺少效果标识: ${file}`);
    assert.ok(html.includes('id="intensity"'), `Demo 缺少强度控制: ${file}`);
    assert.ok(html.includes('shared.js'), `Demo 缺少共享交互引擎: ${file}`);
  }
  assert.ok(index.includes('../background-playground-v3/index.html'));
});

test('新方案包含减少动态效果与暂停降级', () => {
  const css = read('shared.css');
  const js = read('shared.js');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(js.includes("matchMedia?.('(prefers-reduced-motion: reduce)')"));
  assert.ok(js.includes("getElementById('pause-effect')"));
});

test('旧粒子星座方案及集成代码已移除', () => {
  assert.equal(fs.existsSync(path.join(root, 'js/bg-effects.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'css/bg-effects.css')), false);
  assert.equal(fs.existsSync(path.join(root, 'docs/technical/plan-background-interactive-effects-v1.md')), false);
  const oldDemoDir = path.join(root, 'test/demos/bg-effects');
  assert.equal(fs.existsSync(oldDemoDir) ? fs.readdirSync(oldDemoDir).length : 0, 0);
});
