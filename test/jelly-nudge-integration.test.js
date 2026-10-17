// 水母关怀接线合同：后台加载顺序与监听、通知点击优先级、设置页消息通道、只用已有权限。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const background = read('js/background.js');
const settingsJs = read('js/settings-page.js');
const settingsHtml = read('settings.html');

test('后台 importScripts 加载 jelly-nudge.js，且在使用它之前', () => {
  const importLine = background.split('\n').find(line => line.includes('importScripts('));
  assert.ok(importLine.includes("'jelly-nudge.js'"));
  assert.ok(background.indexOf("'jelly-nudge.js'") < background.indexOf('JellyNudge.create('));
});

test('后台：闹钟、通知按钮、启动补闹钟三条监听都接上，错误只告警不抛出', () => {
  const block = background.slice(background.indexOf('const jellyNudge = JellyNudge.create('), background.indexOf("'music_sleep_set'"));
  assert.match(block, /alarms\.onAlarm\.addListener\(alarm => \{ void jellyNudge\.fire\(alarm\.name\)\.catch/);
  assert.match(block, /notifications\.onButtonClicked\.addListener\(\(id, index\) => \{ void jellyNudge\.button\(id, index\)\.catch/);
  assert.match(block, /void jellyNudge\.restore\(\)\.catch/);
});

test('后台：设置消息只接受本扩展页面发来的，且只处理两个动作', () => {
  const start = background.indexOf("['jelly_nudge_get', 'jelly_nudge_set']");
  assert.ok(start > 0);
  const handler = background.slice(start, start + 700);
  assert.match(handler, /sender\.id !== chrome\.runtime\.id/);
  assert.match(handler, /sender\.url\?\.startsWith\(chrome\.runtime\.getURL\(''\)\)/);
  assert.match(handler, /jellyNudge\.set\(message\.config\)/);
  assert.match(handler, /jellyNudge\.get\(\)/);
  assert.equal((background.match(/jelly_nudge_(get|set)'\]\.includes/g) || []).length, 1);
});

test('通知点击：先交给水母关怀关闭自己的通知，再走默认“打开新标签页”分支', () => {
  const click = background.indexOf('chrome.notifications.onClicked.addListener');
  assert.ok(click > 0);
  const body = background.slice(click, click + 6000);
  const dismiss = body.indexOf('await jellyNudge.dismiss(notificationId)');
  assert.ok(dismiss > 0, '有 dismiss 分支');
  // 在 dismiss 之前的分支都不能命中水母关怀的通知 id；dismiss 之后紧跟的才是默认的“打开新标签页”
  const before = body.slice(0, dismiss);
  for (const [, prefix] of before.matchAll(/notificationId\.startsWith\('([^']+)'\)/g)) {
    assert.ok(!'jelly-nudge-water-1'.startsWith(prefix) && !'jelly-nudge-stretch-1'.startsWith(prefix), `前面的分支 ${prefix} 不会吞掉水母关怀的通知`);
  }
  for (const [, id] of before.matchAll(/notificationId === '([^']+)'/g)) assert.ok(!id.startsWith('jelly-nudge'), id);
  const after = body.slice(dismiss);
  assert.ok(after.search(/chrome\.tabs\.create\(\{ url: 'chrome:\/\/newtab\/' \}\)/) > 0, 'dismiss 之后才是默认打开新标签页');
});

test('后台没有清掉水母关怀的闹钟：启动清理只针对已登记的系统闹钟和 task-reminder-', () => {
  const clean = background.slice(background.indexOf('const managedSystemAlarmNames'), background.indexOf('const managedSystemAlarmNames') + 700);
  assert.doesNotMatch(clean, /jelly-nudge/);
  assert.doesNotMatch(background, /alarms\.clearAll\(/);
});

test('设置页：卡片与八个控件存在，设置页脚本经消息通道读写，不直接写存储', () => {
  for (const id of ['sp-jelly-nudge-card', 'set-nudgeWater', 'set-nudgeWaterEvery', 'set-nudgeStretch', 'set-nudgeStretchEvery', 'set-nudgeFrom', 'set-nudgeTo', 'set-nudgeWeekdays', 'set-nudgeStats', 'set-nudgeStatus']) {
    assert.ok(settingsHtml.includes(`id="${id}"`), id);
    assert.ok(settingsJs.includes(id) || id === 'sp-jelly-nudge-card' || id === 'set-nudgeStats' || id === 'set-nudgeStatus', id);
  }
  assert.ok(settingsHtml.includes('id="set-nudgeWater"') && !/id="set-nudgeWater"[^>]*checked/.test(settingsHtml), '喝水默认不勾选');
  assert.ok(!/id="set-nudgeStretch"[^>]*checked/.test(settingsHtml), '起身默认不勾选');
  assert.match(settingsJs, /action: 'jelly_nudge_get'/);
  assert.match(settingsJs, /action: 'jelly_nudge_set'/);
  const nudgePart = settingsJs.slice(settingsJs.indexOf('水母关怀（喝水'), settingsJs.indexOf('async function loadBgProviderSettings'));
  assert.doesNotMatch(nudgePart, /storage\.(sync|local)\.set|alarms\./);
});

test('选项与模块一致：下拉的每个档位都在模块的可选档位里，默认档位被选中', () => {
  const Nudge = require('../js/jelly-nudge.js');
  for (const [kind, id] of [['water', 'set-nudgeWaterEvery'], ['stretch', 'set-nudgeStretchEvery']]) {
    const select = new RegExp(`id="${id}">(.*?)</select>`, 's').exec(settingsHtml)[1];
    const values = [...select.matchAll(/<option value="(\d+)"( selected)?/g)];
    assert.deepEqual(values.map(m => Number(m[1])), [...Nudge.KINDS[kind].choices]);
    assert.equal(Number(values.find(m => m[2])[1]), Nudge.DEFAULTS[kind].everyMin);
  }
});

test('不新增权限，也不引入 idle 等新能力', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.ok(!manifest.permissions.includes('idle'));
  assert.ok(manifest.permissions.includes('alarms') && manifest.permissions.includes('notifications'));
});
