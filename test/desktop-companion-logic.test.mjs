import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { deltaE } from '../desktop-reminder/appearance-contrast.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const JellyfishCore = createRequire(import.meta.url)('../js/jellyfish-core.js');
const JellyDesktop = createRequire(import.meta.url)('../js/jelly-desktop.js');
const JellyAppearance = createRequire(import.meta.url)('../js/jelly-appearance.js');
const JellyfishSkin = createRequire(import.meta.url)('../js/jellyfish.js');
const SpeciesShapes = createRequire(import.meta.url)('../js/jelly-species-shapes.js');
const SpeciesPathCases = createRequire(import.meta.url)('./fixtures/species-path-cases.js');
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
  assert.deepEqual(listed, ['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'jelly-appearance', 'jelly-species', 'jelly-species-data', 'jelly-paint', 'assistant-model', 'glass-view', 'jelly-ring', 'jelly-materials', 'jelly-species-painter', 'jelly-companion', 'jelly-controller', 'confirmation-view', 'assistant-hotkey', 'assistant-panel', 'main'], '构建清单：纯逻辑在前、AppKit 在后、main.swift 最后');
  for (const name of listed) assert.ok(existsSync(resolve(root, `desktop-reminder/${name}.swift`)), `${name}.swift 必须存在`);
  assert.match(build, /com\.timekeeper\.desktop\.qa/, '隔离构建使用独立 Bundle ID，避免改写真实组件的窗口记忆');
  const main = readFileSync(resolve(root, 'desktop-reminder/main.swift'), 'utf8');
  assert.doesNotMatch(main, /buildCountdown|layoutCountdown|resizeCountdown/, '旧倒计时实现不应残留在 main.swift');
  // 水母外观：跟着 jelly 命令走，回执带 appearance.status 供 Chrome 探测；协议版本不升（“水母差事”已占 v8）
  assert.match(main, /jelly\.setAppearance\(object\["appearance"\]\)/, 'jelly 命令里的 appearance 交给水母控制器');
  assert.match(main, /extra\["appearance"\] = \["status": "ok", "species": jelly\.speciesName\]/, '回执带 appearance.status 与实际生效的物种，Chrome 靠它探测组件是否支持、是否真的画出了所选动物');
  assert.match(main, /reply\["jellySpecies"\] = jelly\.speciesName/, 'ping 诊断：实际生效的物种（不是设置里的那个）');
  assert.match(main, /reply\["jellyTuning"\] = jelly\.tuningSummary/, 'ping 诊断：运行中的游动调参（冒烟据此核对物种的系数确实接到了游动上）');
  assert.match(main, /reply\["jellyTitle"\] = jelly\.titleSummary/, 'ping 诊断：窗口标题（实际生效的物种名）');
  assert.match(main, /reply\["jellyLabel"\] = jelly\.labelSummary/, 'ping 诊断：读屏名称（实际生效的物种名）');
  assert.match(main, /"version": 7/, '协议版本仍是 7：外观走回执探测，不占 v8');
  assert.match(main, /reply\["jellyLook"\] = jelly\.lookSummary/, 'ping 诊断：外观（jellyAppearance 是系统浅/深外观，不能复用）');
  assert.match(main, /reply\["jellyTint"\] = jelly\.tintSummary/, 'ping 诊断：tint（约定始终等于 paint.a，冒烟据此核对）');
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
    // 变异检查用：外部已按（被改动的）源码增量编译好自测时，设置 TIMEKEEPER_SELFTEST_EXE 指向它，这里就跳过编译（常规运行不设置）
    const prebuilt = process.env.TIMEKEEPER_SELFTEST_EXE;
    const exe = prebuilt || join(dir, 'selftest');
    if (!prebuilt) execFileSync(swiftc, ['swiftc', resolve(root, 'desktop-reminder/countdown-model.swift'), resolve(root, 'desktop-reminder/jelly-model.swift'), resolve(root, 'desktop-reminder/jelly-swim.swift'), resolve(root, 'desktop-reminder/jelly-palette.swift'), resolve(root, 'desktop-reminder/jelly-appearance.swift'), resolve(root, 'desktop-reminder/jelly-species.swift'), resolve(root, 'desktop-reminder/jelly-species-data.swift'), resolve(root, 'desktop-reminder/jelly-paint.swift'), resolve(root, 'desktop-reminder/assistant-model.swift'), join(dir, 'main.swift'), '-module-cache-path', join(dir, 'cache'), '-o', exe], { stdio: 'pipe' });
    // 全局快捷键语法在 JS（normalizeHotkey）与 Swift（AssistantModel.parseHotkey）各有一份实现：同一批输入逐条对照
    const cases = HOTKEY_CASES;
    const casesFile = join(dir, 'hotkey-cases.json');
    writeFileSync(casesFile, JSON.stringify(cases));
    // 外观：JS 解析出的具体值经 Swift 解析后原样回显；越界/不完整/非字典的负载在 Swift 侧回到默认
    const appearanceCases = [];
    for (const look of JellyAppearance.LOOKS) for (let color = 0; color < JellyAppearance.COLORS; color++) appearanceCases.push(JellyAppearance.resolve({ color, look, material: 'wire', size: 'large' }, { date: new Date(2026, 9, 17) }));
    for (let day = 1; day <= 20; day++) appearanceCases.push(JellyAppearance.resolve({ daily: true }, { date: new Date(2026, 9, day) }));
    for (const species of JellyAppearance.SPECIES) appearanceCases.push(JellyAppearance.resolve({ species, color: 2, look: 'duo' }, { date: new Date(2026, 9, 17) }));
    const resolvedCount = appearanceCases.length;
    appearanceCases.push({ color: 3, colors: [9], look: 'duo' }, { colors: [1], look: 'rainbow' }, 'x', null, { colors: [true, 1] }, { season: 'christmas' },
      { species: 'hammer' }, { species: 'Hammer' }, { species: 3 }, { species: true }, { species: ' hammer', color: 1 });
    const appearanceFile = join(dir, 'appearance-cases.json');
    writeFileSync(appearanceFile, JSON.stringify(appearanceCases));
    // 动物路径解析：共用的合规/不合规用例（含非字符串）交给 Swift 逐项回显
    const parseCases = [...SpeciesPathCases.VALID, ...SpeciesPathCases.BAD.map(([, input]) => input)];
    const parseFile = join(dir, 'parse-cases.json');
    writeFileSync(parseFile, JSON.stringify(parseCases));
    const output = execFileSync(exe, [], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, HOTKEY_CASES: casesFile, APPEARANCE_CASES: appearanceFile, PARSE_CASES: parseFile } });
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
    // 水母外观：Chrome 的 resolve 结果经 Swift 解析后一致；桌面调色板与首页调色板的色相顺序一致（数值不比，桌面是半透明叠在壁纸上）
    const swiftAppearance = new Map([...output.matchAll(/^APPEARANCE (\d+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+)$/gm)].map(match => [Number(match[1]), match.slice(2)]));
    assert.equal(swiftAppearance.size, appearanceCases.length, 'Swift 应对每个外观用例各输出一行');
    appearanceCases.slice(0, resolvedCount).forEach((expected, index) => {
      const [colors, look, material, size, season, species] = swiftAppearance.get(index);
      assert.deepEqual(colors.split(',').map(Number), expected.colors, `外观用例 ${index} 颜色`);
      assert.equal(look, expected.look, `外观用例 ${index} 花纹`); assert.equal(material, expected.material); assert.equal(size, expected.size); assert.equal(season, '-');
      assert.equal(species, expected.species, `外观用例 ${index} 物种：Chrome 下发的值经 Swift 白名单解析后应原样回显`);
    });
    assert.deepEqual(swiftAppearance.get(resolvedCount), ['3', 'solid', 'glass', 'medium', '-', 'jelly'], 'colors 越界：回到 color，duo 颜色不够退回纯色');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 1), ['1', 'solid', 'glass', 'medium', '-', 'jelly'], '花纹要的颜色不够：退回纯色');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 2), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], '非字典：默认');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 3), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], 'null：默认');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 4), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], 'colors 含布尔：整体丢弃');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 5), ['5', 'solid', 'glass', 'medium', 'christmas', 'jelly'], '合法节日保留');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 6), ['5', 'solid', 'glass', 'medium', '-', 'hammer'], '合法物种保留');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 7), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], '物种区分大小写：Hammer 回到水母');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 8), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], '物种不是字符串（数字）：水母');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 9), ['5', 'solid', 'glass', 'medium', '-', 'jelly'], '物种不是字符串（布尔）：水母');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 10), ['1', 'solid', 'glass', 'medium', '-', 'jelly'], '物种带空白不被裁剪：水母，别的字段不受影响');
    // 物种列表：Chrome 的 SPECIES 与 Swift 的 JellySpecies.allCases 逐项相同（含顺序）
    assert.equal(output.match(/^SPECIES (\S+)$/m)?.[1], JellyAppearance.SPECIES.join(','), '物种列表 Chrome 与原生一致');
    const hueOf = ([r, g, b]) => { const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo; if (!d) return 0; const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const swiftHues = new Map([...output.matchAll(/^PALETTEHUE (\d+) ([\d.]+)$/gm)].map(match => [Number(match[1]), Number(match[2])]));
    assert.equal(swiftHues.size, JellyAppearance.COLORS, 'Swift 应输出 8 个色位的色相');
    assert.equal(JellyfishSkin.PALETTE.length, JellyAppearance.COLORS);
    JellyfishSkin.PALETTE.forEach((rgb, slot) => {
      const diff = Math.abs(swiftHues.get(slot) - hueOf(rgb)), wrapped = Math.min(diff, 360 - diff);
      assert.ok(wrapped <= 20, `色位 ${slot}：桌面色相 ${swiftHues.get(slot)}° 与首页 ${hueOf(rgb).toFixed(1)}° 相差 ${wrapped.toFixed(1)}°，顺序应一致`);
    });
    // 调色板色差：Swift 自测与 Node 测量脚本各有一份 Lab 实现，这里用同一份调色板对照最小色差——其中一份公式写错，检查就形同虚设
    const paletteRows = [...readFileSync(resolve(root, 'desktop-reminder/jelly-appearance.swift'), 'utf8').matchAll(/\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)\s*,\s*\/\/\s*(\d)/g)];
    assert.equal(paletteRows.length, 8, '应能从 jelly-appearance.swift 读出 8 个调色板色位');
    const paletteRgb = paletteRows.map(row => [Number(row[1]) * 255, Number(row[2]) * 255, Number(row[3]) * 255]);
    let jsClosest = { i: -1, j: -1, delta: Infinity };
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const delta = deltaE(paletteRgb[i], paletteRgb[j]); if (delta < jsClosest.delta) jsClosest = { i, j, delta }; }
    const swiftClosest = output.match(/^PALETTEMIN (\d+) (\d+) ([\d.]+)$/m);
    assert.ok(swiftClosest, 'Swift 自测应打印调色板最小色差');
    assert.deepEqual([Number(swiftClosest[1]), Number(swiftClosest[2])], [jsClosest.i, jsClosest.j], '最相近的一对色位两边一致');
    assert.ok(Math.abs(Number(swiftClosest[3]) - jsClosest.delta) < 0.01, `最小色差：Swift ${swiftClosest[3]} 与 JS ${jsClosest.delta.toFixed(3)} 不一致`);
    assert.ok(jsClosest.delta >= 20, `调色板任意两色的色差应 ≥ 20，最近的一对 ${jsClosest.i}/${jsClosest.j} 只有 ${jsClosest.delta.toFixed(1)}`);
    // 颜料：Swift 的 JellyPaint 与设置页示意图的 paintOf（同一套规则的 JS 版）逐部位一致——钟罩三色、五根触手、口腕、描边
    const paintSandbox = {};
    vm.runInNewContext(readFileSync(resolve(root, 'js/settings-jelly-appearance.js'), 'utf8'), paintSandbox);
    const jsPaintOf = paintSandbox.JellyAppearanceSettings.paintOf;
    // 物种中文名：Swift 的 displayName 与设置页的 SPECIES_NAMES 逐项相同（设置页下拉与状态文字、桌面面板标题与菜单用的是同一个名字）
    const swiftNames = new Map([...output.matchAll(/^SPECIESNAME (\S+) (\S+)$/gm)].map(match => [match[1], match[2]]));
    assert.deepEqual([...swiftNames.keys()], [...JellyAppearance.SPECIES], 'Swift 应按同一顺序输出每个物种的名字');
    assert.deepEqual(Object.fromEntries(swiftNames), { ...paintSandbox.JellyAppearanceSettings.SPECIES_NAMES }, '物种中文名：原生 displayName 与设置页 SPECIES_NAMES 一致');
    const palette01 = paletteRows.map(row => [Number(row[1]), Number(row[2]), Number(row[3])]);
    const swiftPaint = new Map(output.split('\n').filter(line => line.startsWith('PAINT ')).map(line => { const [, index, ...rest] = line.split(' '); return [Number(index), rest]; }));
    assert.equal(swiftPaint.size, appearanceCases.length, 'Swift 应对每个外观用例各输出一行颜料');
    const seenKinds = new Set();
    appearanceCases.slice(0, resolvedCount).forEach((resolved, index) => {
      const [kind, a, b, c, oral, outline, ...tentacles] = swiftPaint.get(index);
      const js = jsPaintOf(resolved, palette01);
      seenKinds.add(kind);
      assert.equal(kind, js.kind, `用例 ${index} 花纹种类`);
      const close = (swiftText, expected, what) => swiftText.split(',').map(Number).forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 2e-6, `用例 ${index}（颜色位 ${JSON.stringify(resolved.colors)}，${resolved.look}）${what}：Swift ${swiftText} 与 JS ${[...expected]} 不一致`));
      close(a, js.a, '钟罩主色'); close(b, js.b, '第二色'); close(c, js.c, '第三色'); close(oral, js.oral, '口腕'); close(outline, js.outline, '描边');
      assert.equal(tentacles.length, 5, '五根触手');
      tentacles.forEach((text, i) => close(text, js.tentacles[i], `第 ${i} 根触手`));
    });
    assert.deepEqual([...seenKinds].sort(), ['blend', 'duo', 'rainbow', 'solid'], '对照用例必须覆盖四种花纹');
    assert.equal(swiftPaint.get(resolvedCount)[0], 'solid', '颜色位越界、duo 颜色不够：颜料退回纯色');
    assert.equal(swiftPaint.get(resolvedCount + 1)[0], 'solid', 'rainbow 只有一个颜色位：颜料退回纯色');
    // 肢体取色：Swift 的 limbTone(u:) 与设置页示意图的 limbTone（JS 版）在同一批 u 上逐点一致——含花纹交界两侧与越界
    const LIMB_US = [0, 0.1, 0.25, 0.4999, 0.5, 0.57, 0.9, 1, -2, 5];
    const jsLimbTone = paintSandbox.JellyAppearanceSettings.limbTone;
    const swiftLimb = new Map(output.split('\n').filter(line => line.startsWith('LIMB ')).map(line => { const [, index, ...rest] = line.split(' '); return [Number(index), rest]; }));
    assert.equal(swiftLimb.size, appearanceCases.length, 'Swift 应对每个外观用例各输出一行肢体取色');
    appearanceCases.slice(0, resolvedCount).forEach((resolved, index) => {
      const paint = jsPaintOf(resolved, palette01), row = swiftLimb.get(index);
      assert.equal(row.length, LIMB_US.length, `用例 ${index} 的肢体取色点个数`);
      LIMB_US.forEach((u, i) => {
        const expected = jsLimbTone(paint, u);
        row[i].split(',').forEach((text, k) => assert.ok(Math.abs(Number(text) - expected[k]) < 2e-6, `用例 ${index}（${resolved.look}）u=${u}：Swift ${row[i]} 与 JS ${[...expected]} 不一致`));
      });
    });
    const rainbowPaint = jsPaintOf(appearanceCases.find(item => item.look === 'rainbow'), palette01);
    for (const odd of [NaN, Infinity, -Infinity, '0.2', null, undefined, {}]) assert.deepEqual(jsLimbTone(rainbowPaint, odd), jsLimbTone(rainbowPaint, 0.5), `u=${String(odd)} 不是有限数：取正中`);
    assert.deepEqual(jsLimbTone(rainbowPaint, -2), jsLimbTone(rainbowPaint, 0), 'u 越界夹到两端');
    assert.equal(jsLimbTone(null, 0.5), null, '没有颜料返回 null');
    // 动物形状：Swift 的路径解析与包围盒与 JS 参考实现（js/jelly-species-shapes.js）逐点一致；数据表里的动物集合两边相同
    const swiftParse = new Map([...output.matchAll(/^PARSE (\d+) (\S+)$/gm)].map(match => [Number(match[1]), match[2]]));
    assert.equal(swiftParse.size, parseCases.length, 'Swift 应对每个路径用例各输出一行');
    let accepted = 0, rejected = 0;
    parseCases.forEach((input, index) => {
      const js = SpeciesShapes.parsePath(input), swift = swiftParse.get(index), label = `路径用例 ${index}（${String(input).slice(0, 40).replace(/\s+/g, ' ')}）`;
      // 这里不用 assert.equal(swift, '-')：Swift 误接受时 swift 是一整条长路径，作为 actual 附在断言错误上，`node --test` 汇报失败时会在父进程里卡上很久（变异检查里表现为超时）
      if (!js) { rejected++; assert.ok(swift === '-', `${label}：JS 拒绝，Swift 却接受了 ${swift?.slice(0, 60)}`); return; }
      accepted++;
      assert.notEqual(swift, '-', `${label}：JS 接受，Swift 却拒绝了`);
      const commands = swift.split(';');
      assert.equal(commands.length, js.length, `${label}：命令个数`);
      commands.forEach((text, i) => {
        assert.equal(text[0], js[i].cmd, `${label}：第 ${i} 条命令`);
        const numbers = text.slice(1) ? text.slice(1).split(',').map(Number) : [];
        assert.deepEqual(numbers.length, js[i].pts.length * 2, `${label}：第 ${i} 条命令的数字个数`);
        numbers.forEach((value, k) => assert.ok(Math.abs(value - js[i].pts[k >> 1][k & 1]) < 1e-6, `${label}：第 ${i} 条命令的第 ${k} 个数字`));
      });
    });
    // 取样点：Swift 的 SpeciesPath.sample 与 JS 的 sample 在每个合规用例上逐点一致（JS 一侧另由 test/jelly-species-shapes.test.js 用独立的 De Casteljau 算法核对）
    const swiftSamples = new Map([...output.matchAll(/^SAMPLES (\d+) (\S+)$/gm)].map(match => [Number(match[1]), match[2]]));
    parseCases.forEach((input, index) => {
      const js = SpeciesShapes.parsePath(input);
      if (!js) { assert.ok(!swiftSamples.has(index), `路径用例 ${index}：被拒绝的路径不该有取样点`); return; }
      const expected = SpeciesShapes.sample(js), got = swiftSamples.get(index).split(';').map(pair => pair.split(',').map(Number));
      assert.equal(got.length, expected.length, `路径用例 ${index}：取样点个数`);
      got.forEach((p, i) => assert.ok(Math.abs(p[0] - expected[i][0]) < 1e-6 && Math.abs(p[1] - expected[i][1]) < 1e-6, `路径用例 ${index}：第 ${i} 个取样点 Swift ${p} 与 JS ${expected[i]} 不一致`));
    });
    assert.ok(accepted >= 8 && rejected >= 30, `路径对照必须同时覆盖接受（${accepted}）与拒绝（${rejected}）`);
    assert.equal(output.match(/^SPECAVAILABLE (\S+)$/m)?.[1], SpeciesShapes.AVAILABLE.join(','), '可画出来的物种：Swift（有几何数据）与 JS（有形状数据）一致，水母永远在内');
    const animals = SpeciesShapes.AVAILABLE.filter(id => id !== 'jelly');
    const nums = text => text.split(' ').map(Number);
    for (const id of animals) {
      const js = SpeciesShapes.native(id);
      // 并集取样的相位表在 JS 与 Swift 各有一份：Swift 打印出来的相位必须与 JS 的 WAVES 逐项一致（只遍历 JS 的表会漏掉两边不一致、或某一边悄悄少了一个相位）
      const swiftWaves = [...output.matchAll(new RegExp(`^SPEC ${id} (\\S+) `, 'gm'))].map(match => Number(match[1]));
      assert.deepEqual(swiftWaves, [...SpeciesShapes.WAVES], `${id}：Swift 打印的相位 ${swiftWaves} 与 JS 的 WAVES ${[...SpeciesShapes.WAVES]} 不一致`);
      for (const wave of SpeciesShapes.WAVES) {
        const row = output.match(new RegExp(`^SPEC ${id} ${Number.isInteger(wave) ? wave.toFixed(1) : wave} (\\S+ \\S+ \\S+ \\S+)$`, 'm'))?.[1];
        assert.ok(row, `${id} wave=${wave}：Swift 应打印包围盒`);
        const [minX, maxX, minY, maxY] = nums(row), box = SpeciesShapes.bounds(id, wave);
        for (const [name, swift, expected] of [['minX', minX, box.minX], ['maxX', maxX, box.maxX], ['minY', minY, box.minY], ['maxY', maxY, box.maxY]]) assert.ok(Math.abs(swift - expected) < 1e-6, `${id} wave=${wave} ${name}：Swift ${swift} 与 JS ${expected} 不一致`);
      }
      const union = nums(output.match(new RegExp(`^SPECUNION ${id} (\\S+ \\S+ \\S+ \\S+)$`, 'm'))[1]), jsUnion = SpeciesShapes.union(id);
      [jsUnion.minX, jsUnion.maxX, jsUnion.minY, jsUnion.maxY].forEach((expected, i) => assert.ok(Math.abs(union[i] - expected) < 1e-6, `${id} 并集第 ${i} 项：Swift ${union[i]} 与 JS ${expected} 不一致`));
      const [view, scale] = output.match(new RegExp(`^SPECVIEW ${id} (\\S+) (\\S+)$`, 'm')).slice(1);
      assert.equal(view, js.view, `${id} 视角`); assert.ok(Math.abs(Number(scale) - js.scale) < 1e-9, `${id} 缩放`);
      const partRows = [...output.matchAll(new RegExp(`^SPECPART ${id} (\\d+) (\\S+) (\\S+) (\\S+)$`, 'gm'))];
      assert.equal(partRows.length, js.parts.length, `${id} 部件个数`);
      partRows.forEach(([, index, role, u, motion]) => {
        const part = js.parts[Number(index)];
        assert.equal(role, part.role, `${id} 第 ${index} 个部件的角色`); assert.ok(Math.abs(Number(u) - part.u) < 1e-9, `${id} 第 ${index} 个部件的取色位置`);
        if (!part.motion) { assert.equal(motion, '-', `${id} 第 ${index} 个部件不该有转动`); return; }
        const [px, py, angle, squash] = motion.split(',').map(Number);
        assert.ok(Math.abs(px - part.motion.pivot[0]) < 1e-6 && Math.abs(py - part.motion.pivot[1]) < 1e-6, `${id} 第 ${index} 个部件的转轴`);
        assert.ok(Math.abs(angle - part.motion.maxAngle) < 1e-6, `${id} 第 ${index} 个部件的最大转角：Swift ${angle} 与 JS ${part.motion.maxAngle}`);
        assert.ok(Math.abs(squash - part.motion.squash) < 1e-6, `${id} 第 ${index} 个部件的拍翼幅度：Swift ${squash} 与 JS ${part.motion.squash}`);
      });
      const eyes = output.match(new RegExp(`^SPECEYES ${id} (\\S+) (.+)$`, 'm'));
      assert.ok(Math.abs(Number(eyes[1]) - js.eyes.r) < 1e-6, `${id} 眼睛半径`);
      eyes[2].split(' ').forEach((pair, i) => { const [x, y] = pair.split(',').map(Number); assert.ok(Math.abs(x - js.eyes.at[i][0]) < 1e-6 && Math.abs(y - js.eyes.at[i][1]) < 1e-6, `${id} 第 ${i} 只眼睛`); });
      const blush = output.match(new RegExp(`^SPECBLUSH ${id} (.+)$`, 'm'))[1].split(' ');
      assert.equal(blush.length, js.blush.length, `${id} 腮红个数`);
      blush.forEach((text, i) => text.split(',').map(Number).forEach((value, k) => assert.ok(Math.abs(value - js.blush[i][k]) < 1e-6, `${id} 第 ${i} 个腮红第 ${k} 项`)));
      const mouth = output.match(new RegExp(`^SPECMOUTH ${id} (.+)$`, 'm'))[1];
      if (!js.mouth) assert.equal(mouth, '-', `${id}：JS 没有嘴，Swift 也不该有`);
      else {
        const points = mouth.split(' ');
        assert.equal(points.length, 4, `${id}：嘴是四个点`); assert.equal(points.length, js.mouth.length, `${id}：嘴的点数`);
        points.forEach((pair, i) => pair.split(',').map(Number).forEach((value, k) => assert.ok(Math.abs(value - js.mouth[i][k]) < 1e-6, `${id} 嘴的第 ${i} 个点第 ${k} 项：Swift ${value} 与 JS ${js.mouth[i][k]}`)));
      }
    }
    // 放置用的窗口尺寸：自测里写的 170×150 必须就是水母窗口的真实尺寸（改了窗口而没改自测，放置余量检查就失效）
    assert.match(readFileSync(resolve(root, 'desktop-reminder/jelly-companion.swift'), 'utf8'), /static let size = NSSize\(width: 170, height: 150\)/, '水母窗口 170×150');
    assert.match(readFileSync(resolve(root, 'desktop-reminder/companion-selftest.swift'), 'utf8'), /let width: CGFloat = 170, height: CGFloat = 150, cx = width \/ 2/, '自测里的放置窗口尺寸与水母窗口一致');
    // 任务状态集合：Chrome 投影出的 status 与原生能解析的完全一致（否则新增状态会被原生当成非法负载丢弃）
    const statuses = output.match(/^STATUSES (\S+)$/m)?.[1];
    assert.equal(statuses, [...AssistantNative.STATUSES].sort().join(','), '任务状态集合 Chrome 与原生一致');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
