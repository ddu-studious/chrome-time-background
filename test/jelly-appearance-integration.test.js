// 后台接线合同：脚本加载顺序、JellyDesktop 拿到外观数据源、消息只认扩展页面、保存后重新下发。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const background = read('js/background.js');

test('importScripts 在使用前加载 jelly-appearance.js，且早于创建控制器', () => {
  const importLine = background.split('\n').find(line => line.includes('importScripts('));
  assert.ok(importLine.includes("'jelly-appearance.js'"));
  assert.ok(background.indexOf("'jelly-appearance.js'") < background.indexOf('JellyAppearance.create('));
});

test('JellyDesktop 拿到外观数据源，保存后让它重新下发', () => {
  assert.match(background, /const jellyAppearance = JellyAppearance\.create\(\{[^}]*onChange: \(\) => jellyDesktop\.sync\(\)/s, '外观保存后经 jellyDesktop.sync 重新下发');
  assert.match(background, /JellyDesktop\.create\(\{[\s\S]*?appearance: \(\) => jellyAppearance\.payload\(\)/, 'JellyDesktop 的外观数据源是控制器的 payload');
});

test('消息：三个动作都校验扩展页面来源，回应带组件支持状态', () => {
  const block = background.match(/\['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll'\][\s\S]*?return true;\s*\}\);/)?.[0] || '';
  assert.ok(block, '应有统一的外观消息监听');
  assert.match(block, /sender\.id !== chrome\.runtime\.id \|\| !sender\.url\?\.startsWith\(chrome\.runtime\.getURL\(''\)\)/, '只认本扩展页面');
  assert.match(block, /jelly_appearance_set' \? jellyAppearance\.set\(message\.settings\)/);
  assert.match(block, /jellyAppearance\.rerollNow\(\)/);
  assert.match(block, /component: jellyDesktop\.appearanceStatus\(\)/);
});

test('外观接线在 userAlarmSaveQueue 到 getUserAlarmViewState 的沙箱截取片段之外', () => {
  const start = background.indexOf('userAlarmSaveQueue'), end = background.indexOf('getUserAlarmViewState');
  assert.ok(start >= 0 && end > start);
  assert.ok(!background.slice(start, end).includes('jellyAppearance'), '该片段会被 test/assistant-management.test.js 截取沙箱执行，不得引用片段外的全局');
});

test('外观模块源码：无网络、无 innerHTML、无周期调度与权限接口；唯一的定时器是注入式、一次性的午夜重发', () => {
  const source = read('js/jelly-appearance.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|innerHTML|setInterval|requestAnimationFrame|chrome\.(idle|permissions|tabs)|document\./);
  // 全局 setTimeout/clearTimeout 只能作为注入参数 setTimer/clearTimer 的默认值出现，不得直接调用
  const withoutDefaults = source.replace('setTimer = setTimeout', '').replace('clearTimer = clearTimeout', '');
  assert.doesNotMatch(withoutDefaults, /\bsetTimeout\b|\bclearTimeout\b/, '全局定时器只能是注入参数的默认值');
  assert.equal((source.match(/\bsetTimer\(/g) || []).length, 1, '只允许一处预约（午夜重新下发），不得再加别的调度');
});
