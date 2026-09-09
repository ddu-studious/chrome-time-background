const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('正式首页加载独立背景体验层并保持在业务内容之下', () => {
  const html = read('index.html');
  const css = read('css/background-experience.css');
  for (const id of [
    'background-experience-root',
    'background-experience-detail',
    'background-experience-canvas',
    'background-experience-toggle',
    'background-experience-hud',
  ]) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('css/background-experience.css?v=1'));
  assert.ok(html.includes('js/background-experience.js?v=3'));
  assert.match(css, /\.bgx-root \{[\s\S]*?z-index: 2;[\s\S]*?pointer-events: none;/);
  assert.match(read('css/style.css'), /\.main-layout \{[\s\S]*?z-index: 3;/);
});

test('v2 五种视觉皮肤与 v3 手势世界进入正式控制器', () => {
  const source = read('js/background-experience.js');
  for (const effect of ['depth', 'weather', 'memory', 'liquid', 'time']) {
    assert.ok(source.includes(`'${effect}'`), effect);
  }
  for (const gesture of ['脉冲', '织光', '引力核心', '彗光', '旋涡']) {
    assert.ok(source.includes(`'${gesture}'`), gesture);
  }
  assert.ok(source.includes('releaseVelocity'));
  assert.ok(source.includes('WORLD RESONANCE'));
  assert.ok(source.includes('autoCalmSeconds * 1000'));
  assert.ok(source.includes("visual !== 'none' || this.settings.playgroundEnabled"));
});

test('背景玩法只接收容器空白区域且具有省电与声音边界', () => {
  const source = read('js/background-experience.js');
  assert.match(source, /target === document\.body \|\| target === document\.documentElement/);
  for (const targetClass of ['main-layout', 'main-content', 'time-wrapper', 'time-container']) {
    assert.ok(source.includes(`target.classList.contains('${targetClass}')`), targetClass);
  }
  assert.match(source, /if \(!this\.active \|\| !this\.isBackgroundTarget\(event\.target\)\) return;\s+event\.preventDefault\(\);/);
  assert.ok(source.includes("soundEnabled: false"));
  assert.ok(source.includes("prefers-reduced-motion: reduce"));
  assert.ok(source.includes('navigator.connection?.saveData'));
  assert.ok(source.includes("document.addEventListener('visibilitychange'"));
});

test('背景切换同步视觉层，设置中心完整持久化体验配置', () => {
  const main = read('js/main.js');
  const settingsHtml = read('settings.html');
  const settingsSource = read('js/settings-page.js');
  assert.ok(main.includes('window.backgroundExperience?.setBackground(background)'));
  for (const id of [
    'set-bgExperienceEnabled', 'set-bgVisualEffect', 'set-bgEffectIntensity',
    'set-bgPlaygroundEnabled', 'set-bgExperienceSound', 'set-bgAutoCalmSeconds',
  ]) {
    assert.ok(settingsHtml.includes(`id="${id}"`), id);
  }
  assert.ok(settingsSource.includes("chrome.storage.sync.get('backgroundExperienceSettings')"));
  assert.ok(settingsSource.includes('backgroundExperienceSettings: bgExperienceSettings'));
  assert.ok(settingsHtml.includes('js/settings-page.js?v=4'));
  assert.ok(settingsHtml.indexOf('js/chrome-shim.js?v=5') < settingsHtml.indexOf('js/settings-page.js?v=4'));
  assert.ok(read('js/settings-v5.js').includes("'backgroundExperienceSettings'"));
  assert.ok(read('js/settings-v5.js').includes("targets: ['time', 'background-experience', 'weather', 'appearance']"));
});

test('v2 与 v3 原始 Demo 保持可访问', () => {
  assert.ok(fs.existsSync(path.join(root, 'test/demos/background-effects-v2/index.html')));
  assert.ok(fs.existsSync(path.join(root, 'test/demos/background-playground-v3/index.html')));
});
