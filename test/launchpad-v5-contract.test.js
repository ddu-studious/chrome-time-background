const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/dock-manager.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/dock-manager.css'), 'utf8');

test('应用启动台五个页面映射现有分类搜索与 Dock 操作', () => {
  for (const page of ['all-apps', 'category', 'search', 'pin-order', 'dock-menu']) {
    assert.match(source, new RegExp(`['\"]${page}['\"]`));
  }
  assert.match(source, /setBusinessPage\?\.\('launchpad'/);
  assert.match(html, /js\/dock-manager\.js\?v=13/);
});

test('关闭启动台和 Dock 菜单会恢复产品外壳', () => {
  assert.match(source, /setShellPage\?\.\('home'\)/);
  assert.match(source, /_closeContextMenu\(restore = true\)/);
});

test('启动台关闭态不会残留在无障碍树或键盘焦点中', () => {
  assert.match(css, /\.dock-launchpad\s*\{[\s\S]*?visibility:\s*hidden/);
  assert.match(css, /\.dock-launchpad\.open\s*\{[\s\S]*?visibility:\s*visible/);
  assert.match(html, /css\/dock-manager\.css\?v=10/);
  assert.match(source, /hideLaunchpad\(restoreFocus = true, restoreShell = true\)/);
  assert.match(source, /_setLaunchpadBackgroundInert\(true\)/);
  assert.match(source, /_handleLaunchpadKeydown/);
  assert.match(html, /js\/dock-manager\.js\?v=13/);
});

test('Dock 使用烟熏透明外壳并支持固定、离开收起与靠近安全唤出', () => {
  assert.match(source, /const DOCK_SHELL_KEY = 'dockShellConfig'/);
  assert.match(source, /data-dock-shell-action="pin"/);
  assert.match(source, /data-dock-shell-action="collapse"/);
  assert.match(source, /data-dock-shell-action="reveal"/);
  assert.match(source, /_scheduleDockCollapse\(\)/);
  assert.match(source, /pointerenter[\s\S]*?_setDockCollapsed\(false, \{ fromHover: true \}\)/);
  assert.match(source, /_scheduleDockCollapse\(160, true\)/);
  assert.match(source, /_dockInteractionLockedUntil = Date\.now\(\) \+ 360/);
  assert.match(source, /stopImmediatePropagation\(\)/);
  assert.match(source, /Dock 已收起，鼠标靠近或点击展开/);
  assert.match(css, /\.dock-bar\.dock-shell-v5\s*\{[\s\S]*?rgba\(255, 255, 255, 0\.012\)/);
  assert.match(css, /backdrop-filter: blur\(0\.75px\) saturate\(104%\)/);
  assert.match(css, /\.dock-bar\.dock-shell-v5 \.dock-btn i[\s\S]*?drop-shadow/);
  assert.match(css, /\.dock-bar\.dock-shell-v5\.dock-is-collapsed/);
  assert.match(css, /\.dock-bar\.dock-shell-v5\.dock-is-collapsed::after/);
  assert.match(css, /\.dock-bar\.dock-shell-v5\.dock-is-revealing/);
  assert.match(css, /\.dock-shell-pin\.active/);
  assert.match(source, /if \(dockSlotCount >= 6\)[\s\S]*?dock-mobile-overflow/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.dock-mobile-overflow/);
});

test('启动台可以打开未固定且没有 Dock 按钮的应用', () => {
  assert.match(source, /_activateApp\(appId\)/);
  assert.match(source, /appId === 'chatbot'[\s\S]*?window\.Chatbot\.open\(\)/);
  assert.match(source, /appId === 'quick-nav'[\s\S]*?window\.quickNavManager\.open\(\)/);
  assert.match(source, /this\._activateApp\(appId\);[\s\S]*?this\.hideLaunchpad\(false, false\)/);
  assert.match(source, /aria-label', '应用启动台'/);
});

test('应用卡片不嵌套交互元素且 Dock 菜单支持键盘', () => {
  assert.match(source, /<article class="dock-launchpad-app/);
  assert.match(source, /class="dock-launchpad-open"/);
  assert.doesNotMatch(source, /role="button" tabindex="0" aria-label="打开/);
  assert.match(source, /role', 'menu'/);
  assert.match(source, /menuitemradio/);
  assert.match(source, /event\.key === 'ArrowDown'/);
  assert.match(source, /_contextReturnFocus/);
  assert.match(source, /this\._filterLaunchpad\(this\.launchpadEl\.querySelector\('#dock-launchpad-search'\)\?\.value \|\| ''\)/);
  assert.match(source, /querySelectorAll\('\.dock-launchpad-app\.in-dock'\)\.length/);
  assert.match(source, /_moveDockApp\(appId, direction\)/);
  assert.match(source, /data-app-move="-1"/);
});
