import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JellyfishCore = createRequire(import.meta.url)('../js/jellyfish-core.js');
const JellyDesktop = createRequire(import.meta.url)('../js/jelly-desktop.js');
const AssistantNative = createRequire(import.meta.url)('../js/assistant-native.js');
const swiftc = '/usr/bin/xcrun';
const canCompile = process.platform === 'darwin' && existsSync(swiftc);

// 全局快捷键语法对照用例：预设、大小写与空白、修饰键顺序与重复、按键范围、功能键边界、超长（按 UTF-16 单元）、非字符串，
// 以及 JS trim 与 Foundation 空白集合不同的字符（U+FEFF、U+0085）和大小写折叠特例（Kelvin 符号 U+212A）。
const HOTKEY_CASES = [
  ...JellyDesktop.HOTKEY_PRESETS,
  'CTRL+SHIFT+B', ' ctrl+shift+b ', 'ctrl+shift+b\n', '\tctrl+shift+b', 'shift+ctrl+b', 'cmd+ctrl+shift+option+f20', 'ctrl+option+shift+cmd+f20',
  'shift+cmd+0', 'cmd+shift+0', 'cmd+option+space', 'ctrl+shift+f1', 'ctrl+shift+F12', 'ctrl+shift+f20',
  'ctrl+shift+f21', 'ctrl+shift+f0', 'ctrl+shift+f01', 'ctrl+shift+f+1', 'ctrl+shift+f', 'ctrl+shift+ff1',
  'shift+b', 'ctrl+b', 'ctrl+shift', 'ctrl', '', '+', '++', 'ctrl++b', '+ctrl+shift+b', 'ctrl+shift+b+', 'ctrl+shift+', 'ctrl+shift+bb', 'ctrl+shift+bspace',
  'ctrl+ctrl+b', 'shift+shift+b', 'ctrl+shift+shift+b', 'shift+option+b', 'shift+cmd+b', 'option+cmd+b', 'alt+shift+b', 'control+shift+b', 'command+shift+b', 'meta+shift+b', 'ctrl+shift+enter', 'ctrl+shift+tab',
  'ctrl+shift+-', 'ctrl+shift+,', 'ctrl+shift+[', 'ctrl+shift+é', 'ctrl+shift+ｂ', 'ctrl+shift+１', 'ctrl+shift+\u212A', 'ctrl+shift+İ', 'ctrl+shift+ß',
  '\u00A0ctrl+shift+b\u3000', '\uFEFFctrl+shift+b', 'ctrl+shift+b\uFEFF', '\u0085ctrl+shift+b', 'ctrl+shift+b\u2028', 'ctrl +shift+b', 'ctrl+ shift+b',
  'a'.repeat(64), 'a'.repeat(65), `ctrl+shift+b${' '.repeat(52)}`, `ctrl+shift+b${' '.repeat(53)}`, `${' '.repeat(52)}ctrl+shift+b`, `${' '.repeat(53)}ctrl+shift+b`, '😀+shift+b',
  'ctrl+ctrl+shift+b', 'ctrl+option+ctrl+b', 'cmd+cmd+option+b', 'shift+option+shift+cmd+b',
  123, null, true, {}, [], ['ctrl+shift+b'],
];

test('原生水母：构建清单包含所有水母源文件，且 main.swift 在最后', () => {
  const build = readFileSync(resolve(root, 'desktop-reminder/build.mjs'), 'utf8');
  const listed = build.match(/const sources = \[([^\]]*)\]/)?.[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean) ?? [];
  assert.deepEqual(listed, ['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'assistant-model', 'glass-view', 'jelly-ring', 'jelly-companion', 'jelly-controller', 'confirmation-view', 'assistant-hotkey', 'assistant-panel', 'main'], '构建清单：纯逻辑在前、AppKit 在后、main.swift 最后');
  for (const name of listed) assert.ok(existsSync(resolve(root, `desktop-reminder/${name}.swift`)), `${name}.swift 必须存在`);
  assert.match(build, /com\.timekeeper\.desktop\.qa/, '隔离构建使用独立 Bundle ID，避免改写真实组件的窗口记忆');
  const main = readFileSync(resolve(root, 'desktop-reminder/main.swift'), 'utf8');
  assert.doesNotMatch(main, /buildCountdown|layoutCountdown|resizeCountdown/, '旧倒计时实现不应残留在 main.swift');
  // 胶囊形态已取消：倒计时只是水母身上的一条气泡，旧胶囊源文件与样式开关不应残留
  for (const file of ['countdown-view.swift', 'countdown-companion.swift', 'countdown-controller.swift']) {
    assert.ok(!existsSync(resolve(root, `desktop-reminder/${file}`)), `${file} 已被水母宿主取代，不应残留`);
    assert.ok(!build.includes(file) && !listed.includes(file.replace(/\.swift$/, '')), `构建清单不应再引用 ${file}`);
  }
  assert.doesNotMatch(main, /CountdownController|countdownStyle|countdownCompact|activeStyle/, 'main.swift 不应再引用胶囊控制器与样式字段');
  assert.match(main, /let jelly = JellyController\(\)/, '水母控制器是唯一宿主');
  assert.match(main, /"version": 7/, '协议版本 7（桌面 AI 助手）');
  assert.doesNotMatch(main, /"version": 6/, '不应残留旧的协议版本');
  assert.doesNotMatch(main, /buildPanel|springIn|stopButton|snoozeButton|titleLabel|timeLabel|statusLabel/, '旧的深色提醒卡片界面不应残留在 main.swift');
  assert.match(main, /case "show":[^\n]*jelly\.showRing/, '响铃由水母承载：show 路由到 showRing');
  assert.match(main, /case "hide":[^\n]*jelly\.hideRing/, 'hide 路由到 hideRing');
  assert.match(main, /case "actionResult":[^\n]*jelly\.ringActionResult/, 'actionResult 路由到 ringActionResult');
  assert.match(main, /final class ReminderPanel: NSPanel/, 'ReminderPanel 类保留（水母窗口与确认卡的类型）');
  assert.match(main, /case "jelly":\s*\n\s*ok = jelly\.setJelly/, '处理 jelly 状态消息');
  assert.match(main, /case "nudge":[^\n]*jelly\.showNudge/, '处理提醒气泡');
  assert.match(main, /case "nudgeClear":/, '处理提醒撤销');
  assert.match(main, /case "nudgeActionResult":/, '处理提醒动作回执');
  assert.match(main, /send\(\["type": "componentQuit"\]\)\s*\n\s*NSApp\.terminate/, '状态栏退出先告知 Chrome 再结束进程，Chrome 才不会自动把水母拉起');
  // 桌面 AI 助手（协议 v7）：面板与热键由 AssistantController 承载；main.swift 只接线，业务状态与任务全在 Chrome
  assert.match(main, /var assistant: AssistantController!/, '助手控制器是唯一宿主');
  assert.match(main, /assistant\.apply\(\(message\["jelly"\] as\? \[String: Any\]\)\?\["assistant"\]\)/, 'jelly 命令里的 assistant 字段交给助手控制器注册 / 注销热键');
  assert.match(main, /extra\["assistant"\] = item/, '启用时把热键注册结果带在 jelly 的回执里，Chrome 才能在设置页如实显示');
  assert.match(main, /case "assistantState": ok = assistant\.update\(state: message\["state"\]\)/, 'assistantState 路由到面板（非法负载回 ok:false）');
  assert.match(main, /case "assistantResult": assistant\.result\(message\)/, 'assistantResult 路由到面板（只认未决动作的 actionId）');
  assert.match(main, /case "assistantHook":\s*\n(?:\s*\/\/[^\n]*\n)*\s*ok = ProcessInfo\.processInfo\.environment\["TIMEKEEPER_TEST_HOOKS"\] == "1" && assistant\.hook/, '助手测试钩子只在 TIMEKEEPER_TEST_HOOKS=1 时可用');
  assert.match(main, /jelly\.onAskAssistant = \{ \[weak self\] in self\?\.assistant\.show\(\) \}/, '水母右键菜单“问 AI…”唤出面板');
  assert.match(main, /assistant\.send = \{ \[weak self\] message in self\?\.send\(message\) \}/, '助手事件经与确认卡相同的 Native Messaging 写出');
  const panel = readFileSync(resolve(root, 'desktop-reminder/assistant-panel.swift'), 'utf8');
  const hotkey = readFileSync(resolve(root, 'desktop-reminder/assistant-hotkey.swift'), 'utf8');
  assert.match(hotkey, /RegisterEventHotKey/, '全局快捷键用 Carbon 公开热键 API');
  assert.doesNotMatch(hotkey + panel, /CGEventTap|CGEventTapCreate|AXIsProcessTrusted|NSEvent\.addGlobalMonitorForEvents|IOHIDManager/, '不使用需要“辅助功能 / 输入监控”权限的键盘监听');
  assert.doesNotMatch(panel, /UserDefaults|setFrameAutosaveName|saveFrame/, '面板不持久化任何状态（位置也不记）');
  assert.doesNotMatch(panel, /URLSession|NSURLConnection|Process\(\)|NSAppleScript/, '面板不联网、不启动子进程');
});

test('原生水母：纯逻辑（阶段、协议解析、显示规则、文案、水母物理）自测通过', { skip: canCompile ? false : '需要 macOS 与 Xcode 命令行工具', timeout: 120000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'companion-selftest-'));
  try {
    // 顶层代码要求入口文件名为 main.swift，复制到临时目录，不改动仓库文件。
    copyFileSync(resolve(root, 'desktop-reminder/companion-selftest.swift'), join(dir, 'main.swift'));
    const exe = join(dir, 'selftest');
    execFileSync(swiftc, ['swiftc', resolve(root, 'desktop-reminder/countdown-model.swift'), resolve(root, 'desktop-reminder/jelly-model.swift'), resolve(root, 'desktop-reminder/jelly-swim.swift'), resolve(root, 'desktop-reminder/jelly-palette.swift'), resolve(root, 'desktop-reminder/assistant-model.swift'), join(dir, 'main.swift'), '-module-cache-path', join(dir, 'cache'), '-o', exe], { stdio: 'pipe' });
    // 全局快捷键语法在 JS（normalizeHotkey）与 Swift（AssistantModel.parseHotkey）各有一份实现：同一批输入逐条对照
    const cases = HOTKEY_CASES;
    const casesFile = join(dir, 'hotkey-cases.json');
    writeFileSync(casesFile, JSON.stringify(cases));
    const output = execFileSync(exe, [], { encoding: 'utf8', env: { ...process.env, HOTKEY_CASES: casesFile } });
    assert.doesNotMatch(output, /^FAIL/m, output);
    assert.match(output, /ALL PASS/);
    // 夜晚荧光曲线：Swift 与首页水母的 JS 曲线逐点一致（同一套产品行为，两边各有一份实现）
    const rows = [...output.matchAll(/^NIGHT ([\d.]+) ([\d.]+)$/gm)];
    assert.ok(rows.length >= 10, '自测应打印夜晚曲线采样点');
    for (const [, hour, value] of rows) {
      assert.ok(Math.abs(JellyfishCore.nightAmount(Number(hour)) - Number(value)) < 1e-5, `${hour} 点：JS ${JellyfishCore.nightAmount(Number(hour))} 与 Swift ${value} 不一致`);
    }
    // 桌面 AI 助手：热键语法逐条一致（含非字符串、超长、全角、Kelvin 符号、JS 与 Foundation 空白集合不同的几个字符）
    const swiftHotkeys = new Map([...output.matchAll(/^HOTKEY (\d+) (\S+)$/gm)].map(match => [Number(match[1]), match[2]]));
    assert.equal(swiftHotkeys.size, cases.length, 'Swift 应对每个用例各输出一行');
    cases.forEach((value, index) => {
      const js = JellyDesktop.normalizeHotkey(value) ?? '-';
      assert.equal(swiftHotkeys.get(index), js, `用例 ${index}（${JSON.stringify(value)}）：Swift ${swiftHotkeys.get(index)} 与 JS ${js} 不一致`);
    });
    assert.ok(cases.some((_, index) => swiftHotkeys.get(index) !== '-'), '用例里必须有合法热键，否则对照没有意义');
    assert.ok(cases.some((_, index) => swiftHotkeys.get(index) === '-'), '用例里必须有非法热键');
    // 预设的展示符号：设置页下拉里的文字与原生面板、菜单里显示的符号必须是同一套
    const html = readFileSync(resolve(root, 'settings.html'), 'utf8');
    const select = html.match(/<select[^>]*id="set-desktopAssistantHotkey"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
    const options = [...select.matchAll(/<option value="([^"]+)"[^>]*>([^<]+)<\/option>/g)].map(match => [match[1], match[2]]);
    assert.deepEqual(options.map(([value]) => value), [...JellyDesktop.HOTKEY_PRESETS], '设置页下拉的预设与 JellyDesktop.HOTKEY_PRESETS 一致');
    for (const [value, label] of options) {
      const index = cases.indexOf(value);
      assert.ok(index >= 0, `${value} 必须在对照用例里`);
      const glyph = output.match(new RegExp(`^GLYPH ${index} (.+)$`, 'm'))?.[1];
      assert.equal(glyph, label, `${value} 的展示符号：原生 ${glyph} 与设置页 ${label} 不一致`);
    }
    // 任务状态集合：Chrome 投影出的 status 与原生能解析的完全一致（否则新增状态会被原生当成非法负载丢弃）
    const statuses = output.match(/^STATUSES (\S+)$/m)?.[1];
    assert.equal(statuses, [...AssistantNative.STATUSES].sort().join(','), '任务状态集合 Chrome 与原生一致');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
