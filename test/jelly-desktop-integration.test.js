// 桌面水母接线合同：后台加载顺序与回调、设置消息通道与来源校验、倒计时设置只剩“是否交给水母”、
// 设置页卡片与闹钟中心的控件、不新增权限、沙箱截取片段不引用新全局。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const background = read('js/background.js');
const alarmCenter = read('js/alarm-center.js');
const settingsJs = read('js/settings-page.js');
const settingsHtml = read('settings.html');
const indexHtml = read('index.html');

test('后台 importScripts 加载 jelly-desktop.js，且在使用它之前', () => {
  const importLine = background.split('\n').find(line => line.includes('importScripts('));
  assert.ok(importLine.includes("'jelly-desktop.js'"));
  assert.ok(importLine.indexOf("'jelly-desktop.js'") < importLine.indexOf("'alarm-desktop.js'") || importLine.includes("'alarm-desktop.js'"));
  assert.ok(background.indexOf("'jelly-desktop.js'") < background.indexOf('JellyDesktop.create('));
});

test('后台：水母与提醒互相接线——水母下发提醒的记录、气泡按钮回到提醒模块、重连后重新下发倒计时；提醒经水母呈现并在数据变化后刷新水母', () => {
  const start = background.indexOf('const jellyDesktop = JellyDesktop.create(');
  const nudgeStart = background.indexOf('const jellyNudge = JellyNudge.create(');
  assert.ok(start > 0 && nudgeStart > start, '先创建水母，再创建提醒');
  const desktopBlock = background.slice(start, nudgeStart);
  assert.match(desktopBlock, /storage: chrome\.storage\.local/);
  assert.match(desktopBlock, /desktop: desktopAlarm/);
  assert.match(desktopBlock, /summary: \(\) => jellyNudge\.summary\(\)/);
  assert.match(desktopBlock, /act: \(id, action\) => jellyNudge\.act\(id, action\)/);
  assert.match(desktopBlock, /onRestored: \(\) => alarmCountdown\.sync\(\)/);
  const nudgeBlock = background.slice(nudgeStart, nudgeStart + 900);
  assert.match(nudgeBlock, /presenter: jellyDesktop\.presenter/);
  assert.match(nudgeBlock, /onChange: \(\) => jellyDesktop\.sync\(\)/);
});

test('后台：启动时先让提醒补闹钟，再让水母按设置恢复连接（水母下发的“下一次提醒”才读得到闹钟）', () => {
  const nudgeRestore = background.indexOf('void jellyNudge.restore()');
  const desktopRestore = background.indexOf('void jellyDesktop.restore()');
  assert.ok(nudgeRestore > 0 && desktopRestore > nudgeRestore);
  assert.match(background.slice(desktopRestore, desktopRestore + 160), /\.catch\(error => console\.warn\('\[JellyDesktop\]'/);
});

test('后台：水母设置消息只接受本扩展页面发来的，且只处理两个动作，设置只来自 message.settings', () => {
  const start = background.indexOf("['jelly_desktop_get', 'jelly_desktop_set']");
  assert.ok(start > 0);
  const handler = background.slice(start, start + 800);
  assert.match(handler, /sender\.id !== chrome\.runtime\.id/);
  assert.match(handler, /sender\.url\?\.startsWith\(chrome\.runtime\.getURL\(''\)\)/);
  assert.match(handler, /jellyDesktop\.set\(message\.settings\)/);
  assert.match(handler, /jellyDesktop\.get\(\)/);
  assert.equal((background.match(/jelly_desktop_(get|set)'\]\.includes/g) || []).length, 1);
});

test('倒计时设置只剩“是否交给水母”：后台没有样式/夜晚分支，也没有旧的 setStyle / setNight 调用', () => {
  const start = background.indexOf("case 'user_alarm_countdown_set':");
  const end = background.indexOf("case 'user_alarm_desktop_status':", start);
  assert.ok(start > 0 && end > start);
  const branch = background.slice(start, end);
  assert.match(branch, /alarmCountdown\.setEnabled\(message\.enabled === true\)/);
  assert.doesNotMatch(branch, /style|night/);
  assert.doesNotMatch(background, /alarmCountdown\.set(Style|Night)\b/);
  assert.doesNotMatch(background, /onCountdownStyle/);
});

test('截取沙箱执行的片段（userAlarmSaveQueue 到 getUserAlarmViewState）不引用水母相关的新全局', () => {
  const from = background.indexOf('    let userAlarmSaveQueue');
  const to = background.indexOf('getUserAlarmViewState');
  assert.ok(from > 0 && to > from);
  const slice = background.slice(from, to);
  assert.doesNotMatch(slice, /jellyDesktop|JellyDesktop|jellyNudge|JellyNudge/);
});

test('后台不为水母新增任何权限：没有 idle、摄像头、麦克风', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const permission of ['idle', 'videoCapture', 'audioCapture']) assert.ok(!manifest.permissions.includes(permission), permission);
  const source = read('js/jelly-desktop.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /getUserMedia|mediaDevices|chrome\.idle/);
});

test('设置页：“桌面水母”卡片与两个开关存在，只经消息读写，不直接写存储；常驻默认不勾选，夜晚荧光默认勾选', () => {
  assert.ok(settingsHtml.includes('id="sp-desktop-jelly-card"'));
  assert.ok(!/id="set-desktopJellyResident"[^>]*checked/.test(settingsHtml), '常驻默认关闭');
  assert.ok(/id="set-desktopJellyNight"[^>]*checked/.test(settingsHtml), '夜晚荧光默认开启');
  assert.ok(settingsHtml.includes('id="set-desktopJellyStatus"'));
  assert.match(settingsJs, /action: 'jelly_desktop_get'/);
  assert.match(settingsJs, /action: 'jelly_desktop_set'/);
  const part = settingsJs.slice(settingsJs.indexOf('桌面水母（macOS 原生组件）'), settingsJs.indexOf('async function loadBgProviderSettings'));
  assert.ok(part.length > 200);
  assert.doesNotMatch(part, /storage\.(sync|local)\.set|alarms\.|innerHTML/);
  assert.ok(settingsHtml.indexOf('sp-desktop-jelly-card') < settingsHtml.indexOf('sp-jelly-nudge-card'), '桌面水母卡片在水母关怀之前');
});

test('设置页“桌面水母”卡片的说明与真实行为一致：常驻是打盹、点一下才醒，不写“一直游”或“眼睛跟着鼠标”', () => {
  const card = settingsHtml.slice(settingsHtml.indexOf('id="sp-desktop-jelly-card"'), settingsHtml.indexOf('id="set-desktopJellyResident"'));
  assert.match(card, /打盹/); assert.match(card, /点它一下就会醒来/); assert.match(card, /临时出现/); assert.match(card, /关闭 Chrome 它就消失/);
  assert.doesNotMatch(card, /一直游|眼睛跟着鼠标/, '常驻时水母趴着睡觉，不会一直游，眼睛也只在醒着时才看鼠标');
});

test('设置页的文案与新行为一致：水母关怀说明水母接手与退回通知；首页夜晚荧光说明桌面水母在自己的卡片里设置', () => {
  const nudgeCard = settingsHtml.slice(settingsHtml.indexOf('id="sp-jelly-nudge-card"'), settingsHtml.indexOf('id="set-nudgeWaterEvery"'));
  assert.match(nudgeCard, /桌面水母/);
  assert.match(nudgeCard, /系统通知/);
  assert.doesNotMatch(settingsHtml, /桌面小伙伴水母的夜晚荧光在闹钟中心单独设置/);
  assert.match(settingsHtml, /桌面水母的夜晚荧光在“桌面水母”卡片里单独设置/);
});

test('闹钟中心：胶囊时代的“桌面小伙伴 / 夜晚荧光”勾选已移除，只留“桌面倒计时”与测试；读取的倒计时设置只含 enabled', () => {
  assert.doesNotMatch(alarmCenter, /alarm-countdown-companion|alarm-countdown-night/);
  assert.doesNotMatch(alarmCenter, /style: value\.style|night: value\.night|countdown\.style|countdown\.night/);
  assert.match(alarmCenter, /id="alarm-countdown-enabled"/);
  assert.match(alarmCenter, /id="alarm-desktop-test"/);
  assert.match(alarmCenter, /send\('user_alarm_countdown_set', \{ enabled: toggle\.checked \}\)/);
  assert.doesNotMatch(alarmCenter, /user_alarm_countdown_set', \{ (style|night)/);
});

test('闹钟中心的提示文字指向桌面水母：倒计时由水母显示，常驻在设置页里', () => {
  assert.match(alarmCenter, /桌面水母/);
  assert.doesNotMatch(alarmCenter, /浮窗右侧 ×|可拖动、记住位置/);
});

test('脚本版本钉子已随改动更新（避免旧缓存）：alarm-center.js?v=8、settings-page.js?v=14', () => {
  assert.ok(indexHtml.includes('js/alarm-center.js?v=8'));
  assert.ok(settingsHtml.includes('js/settings-page.js?v=14'));
});
