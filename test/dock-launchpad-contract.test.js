const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('应用注册表先于 Dock 控制器加载', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('js/app-registry.js') < html.indexOf('js/dock-manager.js'));
});

test('应用注册表覆盖全部入口并提供摘要', () => {
  const source = read('js/app-registry.js');
  const context = { window: {} };
  vm.runInNewContext(source, context);
  const registry = context.window.ProductAppRegistry;

  assert.equal(registry.apps.length, 20);
  assert.ok(registry.apps.every(app => app.id && app.name && app.summary && app.category && app.dockBtnId));
  assert.deepEqual(
    Array.from(registry.apps.filter(app => app.defaultInDock), app => app.id),
    ['knowledge', 'schedule', 'worklog', 'quick-nav', 'music', 'agent', 'memo']
  );
});

test('启动台具备分类、最近使用、空状态和固定语义', () => {
  const source = read('js/dock-manager.js');
  for (const contract of [
    'dock-launchpad-categories',
    'dock-launchpad-recent',
    'dock-launchpad-empty',
    '固定到 Dock',
    'RECENT_APPS_KEY',
  ]) {
    assert.ok(source.includes(contract), `缺少启动台契约: ${contract}`);
  }
});

test('新用户默认 Dock 使用 v2 精简配置', () => {
  const source = read('js/dock-manager.js');
  assert.match(source, /version:\s*2/);
  assert.match(source, /APP_REGISTRY\.filter\(a => a\.defaultInDock\)/);
});
