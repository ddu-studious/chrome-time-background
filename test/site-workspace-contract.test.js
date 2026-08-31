const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Manifest 声明侧边栏、标签组、favicon 与 Chrome 142 边界', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.minimum_chrome_version, '142');
  assert.equal(manifest.side_panel.default_path, 'site-workspace.html');
  for (const permission of ['sidePanel', 'tabGroups', 'favicon', 'tabs', 'storage']) {
    assert.ok(manifest.permissions.includes(permission), `missing permission ${permission}`);
  }
  assert.match(manifest.action.default_title, /右键打开网站工作区/);
  assert.equal(manifest.commands['open-site-workspace'].suggested_key.default, 'Ctrl+Shift+U');
  assert.equal(manifest.commands['open-site-workspace'].suggested_key.mac, 'Command+Shift+U');
  assert.equal(manifest.commands['add-current-tab-to-site-workspace'].suggested_key.default, 'Ctrl+Shift+Y');
  assert.equal(manifest.commands['add-current-tab-to-site-workspace'].suggested_key.mac, 'Command+Shift+Y');
});

test('网站工作区注册为独立 App 并接入启动台与 Dock', () => {
  const registry = read('js/app-registry.js');
  const html = read('index.html');
  const launcher = read('js/site-workspace-launcher.js');
  const dock = read('js/dock-manager.js');
  assert.match(registry, /id: 'site-workspace'[\s\S]*?defaultInDock: true/);
  assert.ok(html.indexOf('js/site-workspace-core.js') < html.indexOf('js/dock-manager.js'));
  assert.ok(html.indexOf('js/site-workspace-launcher.js') > html.indexOf('js/dock-manager.js'));
  assert.match(launcher, /chrome\.sidePanel|service\.openPanel\(\)/);
  assert.match(launcher, /site-workspace-dock-btn/);
  assert.match(dock, /appId === 'site-workspace'[\s\S]*?siteWorkspaceLauncher\.openPanel\(\)/);
});

test('侧边栏页面绑定真实工作区能力且不包含 iframe', () => {
  const html = read('site-workspace.html');
  const source = read('js/site-workspace.js');
  assert.match(html, /id="sw-adopt-tab"/);
  assert.match(html, /id="sw-page-dialog"/);
  assert.match(html, /快速开关：按 <kbd>⌘⇧U<\/kbd>/);
  assert.match(html, /⌘⇧U/);
  assert.match(html, /⌘⇧Y/);
  assert.match(html, /js\/site-workspace-core\.js/);
  assert.doesNotMatch(html, /<iframe/i);
  for (const method of ['openSite', 'openSavedPage', 'adoptCurrentTab', 'removeTab', 'closeTab', 'movePageToGroup', 'renamePage', 'deletePage']) {
    assert.ok(source.includes(`service.${method}`), `missing ${method}`);
  }
  assert.match(html, /Chrome 分组关闭或删除后/);
  assert.match(source, /chrome\.tabs\.onUpdated/);
  assert.match(source, /chrome\.tabGroups\.onUpdated/);
  assert.match(source, /data-action="edit-page"/);
});

test('快捷导航保留普通跳转并增加工作区打开入口', () => {
  const source = read('js/quick-nav.js');
  assert.match(source, /class="quick-nav-item-open"[\s\S]*?target="_blank"/);
  assert.match(source, /class="quick-nav-item-workspace"/);
  assert.match(source, /siteWorkspaceLauncher\.openUrl\(link\.url\)/);
});

test('任意网页可通过右键菜单或快捷键快速加入工作区', () => {
  const background = read('js/background.js');
  assert.match(background, /site-workspace-add-current-tab/);
  assert.match(background, /title: '加入网站工作区'/);
  assert.match(background, /documentUrlPatterns: \['http:\/\/\*\/\*', 'https:\/\/\*\/\*'\]/);
  assert.match(background, /chrome\.commands\.onCommand/);
  assert.match(background, /Promise\.all\(\[/);
  assert.match(background, /siteWorkspaceService\.adoptTab\(tab\.id\)/);
  assert.match(background, /chrome\.sidePanel\.open\(\{ windowId: tab\.windowId \}\)/);
});

test('网页、工具栏图标与快捷键都能直接打开工作区抽屉', () => {
  const background = read('js/background.js');
  assert.match(background, /site-workspace-open-panel/);
  assert.match(background, /title: '打开网站工作区'/);
  assert.match(background, /contexts: \['page', 'action'\]/);
  assert.match(background, /open-site-workspace/);
  assert.match(background, /openSiteWorkspace\(tab\)/);
  assert.match(background, /chrome\.sidePanel\.open\(\{ windowId: activeTab\.windowId \}\)/);
});

test('同一快捷键根据可见 Side Panel 生命周期切换打开和关闭', () => {
  const background = read('js/background.js');
  const panel = read('js/site-workspace.js');
  assert.match(background, /function toggleSiteWorkspace\(tab\)/);
  assert.match(background, /chrome\.sidePanel\.close\(\{ windowId: activeTab\.windowId \}\)/);
  assert.match(background, /openSiteWorkspaceWindows\.has\(activeTab\.windowId\)/);
  assert.match(background, /chrome\.runtime\.onConnect\.addListener/);
  assert.match(background, /site-workspace-visible-panel/);
  assert.match(background, /chrome\.sidePanel\.onOpened\?\.addListener/);
  assert.match(background, /chrome\.sidePanel\.onClosed\?\.addListener/);
  assert.match(panel, /bindPanelLifecycle\(\)/);
  assert.match(panel, /contextTypes: \['SIDE_PANEL'\]/);
  assert.match(panel, /document\.hidden/);
  assert.match(panel, /site-workspace-panel-visible/);
  assert.match(panel, /visibilitychange/);
  assert.match(background, /toggleSiteWorkspace\(tab\)/);
});
