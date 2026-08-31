const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('背景设置提供图片、混合和动态三档并兼容旧视频开关', () => {
  const html = read('settings.html');
  const settings = read('js/settings-page.js');
  const provider = read('js/background-provider.js');

  assert.ok(html.includes('id="set-bgMediaMode"'));
  for (const mode of ['image', 'mixed', 'video']) {
    assert.ok(html.includes(`value="${mode}"`), `缺少背景类型: ${mode}`);
  }
  assert.ok(settings.includes("stored.enableVideoBackground ? 'mixed' : 'image'"));
  assert.ok(provider.includes("stored.enableVideoBackground ? 'mixed' : 'image'"));
  assert.ok(provider.includes("mediaMode === 'video'"));
  assert.ok(provider.includes("mediaMode === 'image'"));
});

test('视频 Provider 隔离图片缓存并限制候选分辨率', () => {
  const provider = read('js/background-provider.js');

  assert.ok(provider.includes("includeVideo ? 'mixed' : 'image'"));
  assert.ok(provider.includes("getCacheKey(providerName, variant = 'default')"));
  assert.ok(provider.includes('(f.width || 0) <= 1920'));
  assert.ok(provider.includes('(f.height || 0) <= 1080'));
  assert.ok(provider.includes('(item.width || 0) <= 1920'));
  assert.ok(provider.includes('(item.height || 0) <= 1080'));
});

test('视频背景在省流量、减少动态效果和播放失败时回退静态图片', () => {
  const html = read('index.html');
  const main = read('js/main.js');
  const effects = read('js/bg-effects.js');

  assert.ok(html.includes('preload="metadata"'));
  assert.ok(main.includes("matchMedia?.('(prefers-reduced-motion: reduce)')"));
  assert.ok(main.includes('navigator.connection?.saveData === true'));
  assert.ok(main.includes('const applyStaticFallback'));
  assert.ok(main.includes('video.onerror = () =>'));
  assert.ok(main.includes('setSuspended?.(true)'));
  assert.ok(effects.includes('function setSuspended(suspended)'));
  assert.ok(effects.includes('if (_suspended) return;'));
});
