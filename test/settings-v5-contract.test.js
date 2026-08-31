const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('设置中心映射七个设计页面并复用现有设置表单', () => {
  const html = read('settings.html');
  const source = read('js/settings-v5.js');
  for (const page of ['appearance', 'homepage', 'dock', 'data-privacy', 'integrations', 'shortcuts', 'about-diagnostics']) {
    assert.match(source, new RegExp(`['"]?${page.replace('-', '\\-')}['"]?\\s*:`), `缺少设置页面 ${page}`);
    assert.ok(source.includes(`setBusinessPage?.('settings', activePage)`));
  }
  for (const legacy of ['time', 'weather', 'info', 'schedule', 'worklog', 'background', 'performance', 'about']) {
    assert.ok(source.includes(`'${legacy}'`), `未复用现有设置区 ${legacy}`);
  }
  assert.match(html, /js\/settings-v5\.js\?v=5/);
  assert.match(html, /css\/settings-v5\.css\?v=5/);
});

test('导入必须先暂存再确认，重置不清空业务数据', () => {
  const source = read('js/settings-v5.js');
  assert.match(source, /let stagedImport = null/);
  assert.match(source, /尚未写入/);
  assert.match(source, /settings-v5-import-confirm/);
  assert.match(source, /确认重置界面配置/);
  assert.match(source, /settings-v5-reset-cancel/);
  assert.match(source, /value\?\.schema === 'chrome-time-background-settings'/);
  assert.doesNotMatch(source, /storage\.(?:local|sync)\.clear\s*\(/);
  assert.doesNotMatch(source, /localStorage\.clear\s*\(/);
  assert.match(source, /不会清空任务、文稿或知识库内容/);
});

test('Dock 设置使用主页面相同的存储合同', () => {
  const source = read('js/settings-v5.js');
  assert.match(source, /dockManagerConfig/);
  assert.match(source, /dockEffectConfig/);
  assert.match(source, /version:\s*2/);
  assert.match(source, /ProductAppRegistry/);
  assert.match(source, /reconcileDockItems/);
  assert.match(source, /item\.children/);
  assert.match(source, /loadedDockConfig/);
});

test('设置导航和异步反馈具备当前页与实时播报语义', () => {
  const source = read('js/settings-v5.js');
  assert.match(source, /aria-current/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /settings-v5-import-summary[^>]+role="status"/);
  assert.match(source, /globalThis\.scrollTo/);
});

test('快捷键设置显示 Chrome 实际绑定并引导用户安全修改', () => {
  const source = read('js/settings-v5.js');
  assert.match(source, /chrome\?\.commands\?\.getAll/);
  assert.match(source, /open-site-workspace/);
  assert.match(source, /add-current-tab-to-site-workspace/);
  assert.match(source, /chrome:\/\/extensions\/shortcuts/);
  assert.match(source, /Chrome 不允许扩展直接改写快捷键/);
  assert.match(source, /bindCommandShortcuts\(\)/);
});

test('设置字段、导入文件和重置确认具备可读名称与安全退场', () => {
  const html = read('settings.html');
  const source = read('js/settings-v5.js');
  const css = read('css/settings-v5.css');
  assert.match(source, /function enhanceFormSemantics\(\)/);
  assert.match(source, /control\.setAttribute\('aria-labelledby', label\.id\)/);
  assert.match(source, /control\.setAttribute\('aria-label', `\$\{provider\} \$\{label\.textContent\.trim\(\)\}`\)/);
  assert.match(source, /settings-v5-file-label/);
  assert.match(source, /aria-atomic="true"/);
  assert.match(source, /sidebar\.setAttribute\('aria-label', '设置导航'\)/);
  assert.match(source, /aria-label="\$\{escapeHtml\(page\.title\)\}"/);
  assert.match(source, /aria-label="返回首页"/);
  assert.match(source, /icon: 'fa-lock', targets: \['data-privacy'\]/);
  assert.doesNotMatch(source, /fa-shield-halved/);
  assert.match(source, /aria-controls="settings-v5-reset-actions"/);
  assert.match(source, /function collapseResetConfirmation/);
  assert.match(source, /activePage === 'data-privacy' && pageId !== 'data-privacy'/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /if \(!file\) \{/);
  assert.match(css, /\.sp-toggle input:focus-visible \+ \.sp-toggle-slider/);
  assert.doesNotMatch(css, /#settings-v5-status\s*\{\s*display:\s*none/);
  assert.match(html, /js\/settings-v5\.js\?v=5/);
});

test('设置中心验收夹具隔离 Dock 样例并支持窄屏视口', () => {
  const fixture = read('test/fixtures/settings-preview.html');
  assert.match(fixture, /独立 Dock 样例/);
  assert.match(fixture, /不写入 Chrome 扩展/);
  assert.match(fixture, /dockManagerConfig/);
  assert.match(fixture, /beforeunload/);
  assert.match(fixture, /new URLSearchParams\(location\.search\)\.get\('width'\)/);
  assert.match(fixture, /\.\.\/\.\.\/settings\.html\?fixtureRev=/);
});
