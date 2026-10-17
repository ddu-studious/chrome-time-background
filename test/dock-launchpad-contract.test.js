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

  assert.equal(registry.apps.length, 23);
  assert.ok(registry.apps.every(app => app.id && app.name && app.summary && app.category && app.dockBtnId));
  assert.deepEqual(
    Array.from(registry.apps.filter(app => app.defaultInDock), app => app.id),
    ['quick-assistant', 'knowledge', 'schedule', 'alarm', 'worklog', 'quick-nav', 'site-workspace', 'music', 'memo']
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

test('Dock v4 默认固定网站工作区与闹钟并为既有配置提供增量迁移', () => {
  const source = read('js/dock-manager.js');
  assert.match(source, /version:\s*4/);
  assert.match(source, /APP_REGISTRY\.filter\(a => a\.defaultInDock\)/);
  assert.match(source, /_migrateConfig\(\)/);
  assert.match(source, /hasApp\('site-workspace'\)/);
  assert.match(source, /hasApp\('alarm'\)/);
});

// 回归（2026-10-15）：休闲游戏（games-hub）在 index.html 里原先只是一个 hidden 的空占位按钮，放在 #dock-bar 之外。
// DockManager.render() 对“页面里已有原生按钮”的应用直接复用该元素，只重置 style.display：
// 固定后它被搬进 Dock，却仍带着 hidden、没有 .dock-btn 类也没有图标，结果启动台显示“已固定”而 Dock 里什么也没有。
// 这里只守页面合同（真实 Dock 渲染在真实 Chromium 里验证）：页面里写了原生按钮的应用，必须是 #dock-bar 内可直接显示的完整按钮。
test('页面里的原生 Dock 按钮都在 #dock-bar 内，且是带图标和标题的完整 .dock-btn（固定后才能显示）', () => {
  const html = read('index.html');
  const context = { window: {} };
  vm.runInNewContext(read('js/app-registry.js'), context);
  const apps = Array.from(context.window.ProductAppRegistry.apps);

  // 用 div 嵌套深度确定 #dock-bar 的范围（里面有分隔线 div）
  const barStart = html.indexOf('id="dock-bar"');
  assert.ok(barStart > 0, '找不到 #dock-bar');
  const scan = /<div\b|<\/div>/g;
  scan.lastIndex = html.lastIndexOf('<div', barStart);
  let depth = 0;
  let barEnd = -1;
  for (let match; (match = scan.exec(html));) {
    depth += match[0] === '</div>' ? -1 : 1;
    if (depth === 0) { barEnd = match.index; break; }
  }
  assert.ok(barEnd > barStart, '找不到 #dock-bar 的结束位置');

  const problems = [];
  let checked = 0;
  for (const app of apps) {
    const found = new RegExp(`<button\\b[^>]*\\bid="${app.dockBtnId}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    if (!found) continue; // 页面里没有原生按钮的应用，由 DockManager 在固定时动态创建
    checked += 1;
    const [markup, inner] = found;
    const tag = markup.slice(0, markup.indexOf('>') + 1);
    const issues = [];
    if (found.index < barStart || found.index > barEnd) issues.push('不在 #dock-bar 内');
    if (!/\bclass="[^"]*\bdock-btn\b/.test(tag)) issues.push('缺少 dock-btn 类');
    if (/\shidden(?=[\s>=])/.test(tag)) issues.push('带有 hidden 属性');
    if (/aria-hidden="true"/.test(tag)) issues.push('带有 aria-hidden="true"');
    if (!/\btitle="[^"]+"/.test(tag)) issues.push('缺少 title');
    const icon = /<i\b[^>]*class="([^"]*)"/.exec(inner)?.[1];
    if (!icon) issues.push('缺少图标');
    else if (icon !== app.icon) issues.push(`图标 "${icon}" 与注册表 "${app.icon}" 不一致`);
    if (issues.length) problems.push(`${app.id}（#${app.dockBtnId}）：${issues.join('；')}`);
  }
  assert.ok(checked >= 20, `应检查到至少 20 个原生按钮，实际 ${checked}`);
  assert.deepEqual(problems, []);
});
