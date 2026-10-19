// 设置页“桌面水母”卡片里的桌面 AI 助手：开关与快捷键预设、只经消息读写、状态说明与版本钉子。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Jelly = require('../js/jelly-desktop.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settingsHtml = read('settings.html');
const settingsJs = read('js/settings-page.js');
const card = settingsHtml.slice(settingsHtml.indexOf('id="sp-desktop-jelly-card"'), settingsHtml.indexOf('id="sp-jelly-nudge-card"'));
const part = settingsJs.slice(settingsJs.indexOf('桌面水母（macOS 原生组件）'), settingsJs.indexOf('async function loadBgProviderSettings'));

test('卡片里有助手开关（默认不勾选）、快捷键下拉与状态行，且都在“桌面水母”卡片之内', () => {
  assert.ok(card.length > 500);
  assert.match(card, /id="set-desktopAssistantEnabled"/);
  assert.ok(!/id="set-desktopAssistantEnabled"[^>]*checked/.test(card), '默认关闭');
  assert.match(card, /<select class="sp-select" id="set-desktopAssistantHotkey">/);
  assert.match(card, /id="set-desktopAssistantStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('快捷键下拉的选项恰好是后台的四个预设，顺序一致，默认项是 ctrl+shift+b，显示用符号', () => {
  const select = card.slice(card.indexOf('id="set-desktopAssistantHotkey"'), card.indexOf('</select>', card.indexOf('id="set-desktopAssistantHotkey"')));
  const options = [...select.matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)];
  assert.deepEqual(options.map(m => m[1]), [...Jelly.HOTKEY_PRESETS]);
  assert.match(options[0][2], /selected/); assert.equal(options.filter(m => /selected/.test(m[2])).length, 1);
  assert.equal(options[0][1], Jelly.DEFAULT_HOTKEY);
  const labels = options.map(m => m[3]);
  assert.deepEqual(labels, ['⌃⇧B', '⌃⇧空格', '⌃⌥A', '⌃⌥B']);
});

test('说明文字与真实行为一致：需要常驻、与浏览器工作台共用会话、来自桌面的操作一律先出确认卡、不是语音、不是控制任意网页', () => {
  const field = card.slice(card.indexOf('id="set-desktopAssistantEnabled"') - 700, card.indexOf('id="set-desktopAssistantEnabled"'));
  assert.match(field, /常驻/);
  assert.match(field, /同一个 AI 工作台|共用/);
  assert.match(field, /确认卡/);
  assert.match(field, /Chrome/);
  assert.match(card, /只支持文字，不使用麦克风/);
  assert.doesNotMatch(card.replace('不使用麦克风', ''), /语音|麦克风|控制任意网页|操作浏览器里的任意/, '没有做语音，也没有通用浏览器操控');
  assert.match(card, /更新桌面组件|desktop-reminder\/README\.md|重载扩展/);
});

test('快捷键说明不承诺系统会检测冲突：macOS 不告知组合是否被别的应用使用（2026-10-16 实测两个进程注册同一组合都成功、都收到按键），也不替 Chrome 自己的快捷键打包票', () => {
  const hint = card.slice(card.indexOf('sp-field-label">全局快捷键'), card.indexOf('id="set-desktopAssistantHotkey"'));
  assert.ok(hint.length > 100, '说明文字在下拉框之前');
  assert.match(hint, /不会告知/, '要明说系统不告知是否被别的应用使用');
  assert.match(hint, /没有反应|同时触发/, '要告诉用户出现冲突时看到的现象');
  assert.match(hint, /换一个组合/, '给出可执行的办法');
  assert.match(hint, /尚未验证/, 'Chrome 自己的快捷键同时触发与否没有验证，不能写成“不会冲突”');
  assert.doesNotMatch(hint, /不会冲突|不会被占用|已检查冲突|会提示.{0,6}占用/);
});

test('脚本：设置只经 jelly_desktop_get / jelly_desktop_set 读写，保存时一并带上 assistant:{enabled,hotkey}，不直接写存储', () => {
  assert.match(part, /'set-desktopAssistantEnabled'/);
  assert.match(part, /'set-desktopAssistantHotkey'/);
  assert.match(part, /assistant: \{ enabled: !!document\.getElementById\('set-desktopAssistantEnabled'\)\?\.checked, hotkey: /);
  assert.match(part, /action: 'jelly_desktop_set', settings/);
  assert.doesNotMatch(part, /storage\.(sync|local)\.set|innerHTML|alarms\./);
  const ids = part.slice(part.indexOf('const DESKTOP_JELLY_IDS'), part.indexOf(']', part.indexOf('const DESKTOP_JELLY_IDS')));
  assert.match(ids, /set-desktopAssistantEnabled/); assert.match(ids, /set-desktopAssistantHotkey/);
});

test('脚本：每种热键状态都有可行动的说明（ok/taken/invalid/failed/unsupported/unknown，以及需要常驻）', () => {
  for (const key of ['ok', 'taken', 'invalid', 'failed', 'unsupported', 'unknown']) assert.match(part, new RegExp(`\\b${key}\\b`), key);
  assert.match(part, /needsResident/);
  assert.match(part, /问 AI/);                         // 菜单入口在快捷键不可用时仍可用
  assert.match(part, /set-desktopAssistantStatus/);
  assert.match(part, /hotkeyLabel|⌃/);
  // 夜晚荧光、storage 变化刷新沿用原有路径：助手设置存在独立键，也要跟着刷新
  assert.match(part, /changes\.desktopAssistantV1/);
});

// 设置页脚本是一大段依赖 DOM 的代码，没法整体加载：这里把“桌面水母”那一段里只做展示的函数取出来，配一个假的 document 真正执行
function loadDesktopFunctions(elements = {}) {
  const source = part.slice(part.indexOf('const DESKTOP_JELLY_IDS'), part.indexOf('function loadDesktopJelly'));
  const context = vm.createContext({ document: { getElementById: id => elements[id] || null }, Promise });
  vm.runInContext(`${source}\nthis.api = { describeAssistant, applyDesktopJellyUI, hotkeyLabel };`, context);
  return context.api;
}

test('脚本（实际执行）：每种热键状态都给出各自的说明——被占用不会写成“已就绪”，旧组件要求更新而不是留空，需要常驻时先说常驻', () => {
  const { describeAssistant, hotkeyLabel } = loadDesktopFunctions();
  const base = { enabled: true, hotkey: 'ctrl+shift+b', needsResident: false };
  const text = hotkeyStatus => describeAssistant({ ...base, hotkeyStatus });
  assert.equal(describeAssistant(undefined), ''); assert.equal(describeAssistant({ ...base, enabled: false, hotkeyStatus: 'ok' }), '', '没开启就没有说明');
  assert.match(describeAssistant({ ...base, needsResident: true, hotkeyStatus: 'ok' }), /常驻/);
  const ok = text('ok');
  assert.match(ok, /已就绪/); assert.match(ok, /⌃⇧B/); assert.match(ok, /问 AI/);
  assert.match(ok, /不会告知快捷键是否与其他应用冲突/, '热键冲突无法检测，不得承诺“没有冲突”');
  const taken = text('taken');
  assert.match(taken, /已被占用/); assert.match(taken, /换一个组合/); assert.match(taken, /问 AI/); assert.doesNotMatch(taken, /已就绪/);
  assert.match(text('invalid'), /无效/); assert.match(text('invalid'), /换一个组合/);
  assert.match(text('failed'), /没有接受/); assert.match(text('failed'), /换一个组合/);
  const unsupported = text('unsupported');
  assert.match(unsupported, /版本过旧/); assert.match(unsupported, /desktop-reminder\/README\.md/); assert.match(unsupported, /重载扩展/);
  assert.match(text('unknown'), /正在等待/); assert.match(text(undefined), /正在等待/); assert.match(text('something-new'), /正在等待/, '认不出的状态按“还在等待”处理，不冒充成功');
  assert.equal(new Set(['ok', 'taken', 'invalid', 'failed', 'unsupported', 'unknown'].map(text)).size, 6, '六种状态的说明互不相同');
  for (const [hotkey, label] of [['ctrl+shift+b', '⌃⇧B'], ['ctrl+shift+space', '⌃⇧空格'], ['ctrl+option+a', '⌃⌥A'], ['shift+cmd+1', '⇧⌘1'], ['ctrl+cmd+f12', '⌃⌘F12']]) assert.equal(hotkeyLabel(hotkey), label, hotkey);
});

test('脚本（实际执行）：下拉只能显示预设——存储里手改成合法的非预设值或非法值时回到默认项，不留空白；开关与状态行照实刷新', () => {
  const elements = {
    'set-desktopJellyResident': { checked: false }, 'set-desktopJellyNight': { checked: false }, 'set-desktopAssistantEnabled': { checked: false },
    'set-desktopAssistantHotkey': { options: Jelly.HOTKEY_PRESETS.map(value => ({ value })), value: '' },
    'set-desktopAssistantStatus': { textContent: '' }, 'set-desktopJellyStatus': { textContent: '' },
  };
  const { applyDesktopJellyUI } = loadDesktopFunctions(elements);
  const select = elements['set-desktopAssistantHotkey'];
  const apply = assistant => applyDesktopJellyUI({ settings: { resident: true, night: true }, status: { connected: true, version: 7 }, assistant });
  apply({ enabled: true, hotkey: 'ctrl+option+a', hotkeyStatus: 'ok', needsResident: false });
  assert.equal(select.value, 'ctrl+option+a');
  assert.equal(elements['set-desktopAssistantEnabled'].checked, true);
  assert.equal(elements['set-desktopJellyResident'].checked, true); assert.equal(elements['set-desktopJellyNight'].checked, true);
  assert.match(elements['set-desktopAssistantStatus'].textContent, /⌃⌥A/);
  apply({ enabled: true, hotkey: 'cmd+option+k', hotkeyStatus: 'ok', needsResident: false });      // 合法，但不在预设里（只能手改存储得到）
  assert.equal(select.value, Jelly.DEFAULT_HOTKEY, '下拉里没有这一项：回到默认项，不显示成空白');
  apply({ enabled: false, hotkey: 'not-a-hotkey', hotkeyStatus: 'off', needsResident: false });
  assert.equal(select.value, Jelly.DEFAULT_HOTKEY); assert.equal(elements['set-desktopAssistantEnabled'].checked, false); assert.equal(elements['set-desktopAssistantStatus'].textContent, '');
  apply(undefined);
  assert.equal(select.value, Jelly.DEFAULT_HOTKEY); assert.equal(elements['set-desktopAssistantEnabled'].checked, false, '旧后台没有 assistant 字段时按关闭显示');
});

test('脚本版本钉子：settings-page.js?v=16，且仍在 chrome-shim 之后加载', () => {
  assert.ok(settingsHtml.includes('js/settings-page.js?v=16'));
  assert.ok(settingsHtml.indexOf('js/chrome-shim.js?v=5') < settingsHtml.indexOf('js/settings-page.js?v=16'));
});
