# 桌面水母原生 AI 工作台（L1）Implementation Plan

> **执行方式：** 本项目禁止使用子代理（`.cursor/rules/no-subagent.mdc`），在当前会话里用 `superpowers:executing-plans` 逐任务内联执行，Chrome 侧按 TDD（先写失败的测试再实现）。项目规则：**不提交 Git**、保留与本任务无关的未提交改动、不重置/不清理、不加依赖/权限/网络；不碰用户已安装的真实桌面组件（只构建到 `/tmp/tk/QA.app` 的独立 Bundle ID 做隔离验收）。

**Goal:** 在任意应用里按全局快捷键（默认 `ctrl+shift+b`，可从预设里换）唤出桌面水母的原生 AI 面板：输入需求、看进度与结果、停止、去 Chrome 工作台查看；任务仍由 Chrome 里的同一个 `AssistantEngine` 执行；来自桌面的写操作一律保留确认卡。

**Architecture / 设计：** 见 `docs/technical/native-assistant-workbench-20261016.md`（协议 v7、`origin:'desktop'`、状态投影、失败矩阵、测试分层）。

## Global Constraints

- 回复与文档用中文（代码标识符除外）；不使用子代理；不提交 Git；不发布。
- 不新增依赖、权限、网络、麦克风/摄像头/`chrome.idle`/辅助功能/输入监控；日志不写用户输入与助手正文。
- 协议 v7 只增量：旧组件忽略新字段；Chrome 对 `assistant` 设置要求组件 ≥7；`CFBundleVersion`/`ping.version` 升 7，所有既有“version 6”断言同步。
- `js/background.js` 里 `userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的代码会被 `test/assistant-management.test.js` 截取沙箱执行：新增接线放在该片段之外。
- 新增原生源文件同步 `desktop-reminder/build.mjs` 清单与 `test/desktop-companion-logic.test.mjs`（构建顺序断言与自测编译命令）。
- 热键语法 JS/Swift 两份实现必须逐点对照（修饰键顺序 `ctrl+option+shift+cmd`、≥2 个修饰键且至少 1 个属于 `ctrl/option/cmd`、按键 `a–z/0–9/space/f1–f20`）。
- 原生面板：回执门槛（无匹配 `assistantResult` 不声称成功）、8 秒无回执提示、`actionId` 幂等；`origin:'desktop'` 只会让策略更严；面板不记忆位置、不写 `CompanionX`。
- 隔离验收：`build.mjs --app=/tmp/tk/QA.app`；禁止整屏/区域截图，只 `screencapture -l` 自家窗口；测试钩子仅在 `TIMEKEEPER_TEST_HOOKS=1`；合成键盘/鼠标只在面板确认拿到键盘焦点后发送；运行期间不碰键鼠。
- 分层报告：静态检查、Swift 纯逻辑自测、Chrome 业务替身、隔离原生进程、真实 Chrome 扩展、真实账号——互不替代；真实 Chrome 156、真实键盘与中文整句、全屏 Space/多显示器、VoiceOver **不能**由本计划验收。
- 完成代码修改后一行安全自查（无新增外部请求/权限；输入长度与字符有界；来源只会让授权更严）。

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `js/assistant-contract.js` | 改 | `input()` 仅保留 `origin:'desktop'` |
| `js/assistant-engine.js` | 改 | `respond()` 重新提交时带 `origin:'desktop'` |
| `js/assistant-tools.js` | 改 | 桌面来源跳过 `ai_approval_evaluate`，保留确认卡 |
| `js/alarm-desktop.js` | 改 | v7：`setAssistantState`、`handleAssistantAction`、`onAssistant*` 钩子、`hotkeyStatus`、`setJelly` 带 `assistant` |
| `js/jelly-desktop.js` | 改 | `assistant` 设置归一化、热键语法与预设、下发条件、热键状态、`assistantEnabled()` |
| `js/assistant-native.js` | 新 | 原生输入 → `engine.submit/cancel/open`；`engine` 状态 → `assistantState` 投影（清洗、有界、去重、重连重发） |
| `js/assistant-background.js` | 改 | 创建并接线 `AssistantNative`，随 `onChange` 同步 |
| `js/background.js` | 改 | `importScripts` 加载顺序、传入 `jellyDesktop`、`jelly_desktop_*` 消息带 `assistant` |
| `settings.html` / `js/settings-page.js` | 改 | “桌面水母”卡片：AI 助手开关 + 快捷键预设 + 状态；`?v=` 钉子升级 |
| `desktop-reminder/assistant-model.swift` | 新 | 纯逻辑：热键语法/键码/符号、状态投影文案、文本清洗、焦点重试决策、命令/事件解析 |
| `desktop-reminder/assistant-hotkey.swift` | 新 | Carbon `RegisterEventHotKey` 薄封装（注册/注销/状态映射） |
| `desktop-reminder/assistant-panel.swift` | 新 | `AssistantPanel`（NSPanel）+ `AssistantController`（显示、聚焦与重试、提交/停止/打开、回执门槛、状态渲染、测试钩子数据） |
| `desktop-reminder/jelly-controller.swift` / `main.swift` | 改 | 右键菜单“问 AI…”、`jelly.assistant` 配置、`assistantState/assistantResult` 命令、`hotkeyStatus` 事件、`ping` 字段、版本 7、测试钩子 |
| `desktop-reminder/build.mjs` | 改 | 清单加入三个新文件，版本 7 |
| `desktop-reminder/companion-selftest.swift` | 改 | 新增纯逻辑自测与热键对照输出 |
| `test/*.test.js(mjs)` | 新/改 | 见各任务 |
| `desktop-reminder/jelly-smoke.mjs` / `bridge-smoke.mjs` / `mouse-helper.swift` | 改 | 助手冒烟与联调 |
| 文档 | 改 | 技术文档收尾、`desktop-reminder/README.md`、`AGENTS.md`、`docs/technical/_index.md`、研究文档状态 |

## Tasks

### Phase A — Chrome 侧（TDD）

- [x] **A1 `origin` 贯穿**：测试先行（`test/assistant-native-origin.test.js`）：`Contract.input({origin:'desktop'})` 保留、其他值/类型丢弃、`routeRequest` 透传；`Engine.respond` 的新提交带 `origin`；`Tools` 桌面来源不调用 `ai_approval_evaluate`（调用次数为 0 且停在确认卡），浏览器来源行为不变（既有 `assistant-approval.test.mjs` 不变）。 **实际：`test/assistant-native-origin.test.js` 4 项；`origin` 只在值恰为 `'desktop'` 时保留；桌面来源的批准记录为 `policy:'desktop-origin'`。**
- [x] **A2 `AlarmDesktop` v7**：`setAssistantState`（需要已连接且版本 ≥7，不为推送状态启动组件）、`handleAssistantAction`（旧端口/空 id/超长 id 忽略；处理中去重；成功结果缓存幂等；失败不缓存；未知动作拒绝；回执 `assistantResult`）、`onAssistantConnected/onAssistantDisconnect`、`hotkeyStatus` 事件、`setJelly` 带 `assistant` 要求 v7。 **实际：**没有做 `hotkeyStatus` 事件**，注册结果写在 `jelly` 命令回执的 `assistant:{status}` 里；`setAssistantState` 在已知组件版本低于 7 时抛错并核对回执 `version≥7`；变异检查顺带发现并修复了三个幂等缓存从不淘汰（`Map.values()` 应为 `keys()`）。**
- [x] **A3 `JellyDesktop` 设置**：`normalizeHotkey` 与预设；`normalize`/`get`/`set` 的 `assistant`；`push` 仅在 `resident && enabled` 时下发 `enabled:true`；`assistantEnabled()`；热键状态入 `get/set` 结果；非法热键拒绝并给可行动提示；向后兼容旧存储。 **实际：设置存在独立键 `desktopAssistantV1`（不是 `desktopJellyV1.assistant`，回滚安全）。**
- [x] **A4 `AssistantNative`**：投影（状态白名单、`message/input` 清洗与上限、去控制字符与方向控制符、`taskId` 白名单字符）、去重与 `updatedAt` 不触发重发、断线重连重发最新状态、提交（trim、1–500 字、`origin:'desktop'`）、取消（任务/版本核对且仅 `planning/running`）、打开、未启用/组件错误的拒绝、日志仅固定类别。 **实际：状态字段名用 `at`（不是 `updatedAt`）；`input` ≤120 字符、`message` ≤1200 字符。**
- [x] **A5 接线**：`assistant-background.js` 创建适配层并在 `onChange` 同步，`background.js` `importScripts` 顺序与依赖注入；集成测试（源码扫描）守住接线位置在沙箱片段之外。 **实际：适配层文件是 `js/assistant-native.js`；接线在沙箱片段之外，由 `test/assistant-native-integration.test.js` 守住。**
- [x] **A6 设置页**：`settings.html` 开关 + 预设下拉 + 状态行；`settings-page.js` 读写与提示（常驻代价、可能与 Chrome 自带 `Ctrl+Shift+B` 冲突、旧组件提示）；版本钉子 `settings-page.js?v=10` 并同步三处测试。 **实际：版本钉子 `settings-page.js?v=10`，三处测试同步；设置页文案只承诺“已向系统注册”，不承诺冲突检测（见技术文档“验证中得到的系统行为”）。**

### Phase B — Swift 纯逻辑

- [x] **B1 `assistant-model.swift`** + 自测：热键语法（对照 JS 的 NIGHT 式 `HOTKEY` 行）、Carbon 键码表完整性、修饰键位与展示符号（⌃⌥⇧⌘）、状态文案与按钮/可停止判定、文本清洗/截断、焦点重试决策、命令解析（`assistantState/assistantResult/jelly.assistant`）；`build.mjs` 与 `desktop-companion-logic.test.mjs` 清单同步。 **实际：自测 583 项；变异检查暴露的自测缺口（长度上限与 `2^53−1` 版本边界）已补。**

### Phase C — AppKit

- [x] **C1 `assistant-hotkey.swift`**：注册/注销/状态映射（`0→ok`、`-9878→taken`、其他→`failed`、语法非法→`invalid`），重复配置不重复注册。 **实际：实测 `-9878` 只在**同一进程**重复注册时出现，跨应用冲突无法发现，`taken` 在实际使用里几乎不可达。**
- [x] **C2 `assistant-panel.swift`**：面板/控制器：聚焦与一次重试、提交/停止/打开、回执门槛与 8 秒提示、`assistantState` 渲染、Esc/归还焦点、深浅色、减少动态效果；测试钩子数据。 **实际：焦点核对增加“唤出之后拿到过键盘就不再重试”，避免把用户已切走的键盘抢回来。**
- [x] **C3 接线**：`jelly-controller.swift` 菜单项、`main.swift` 路由/`ping` 字段/版本 7/`hotkeyStatus`/测试钩子；更新全部 “version 6” 断言。 **实际：不含 `hotkeyStatus`；所有既有 “version 6” 断言已同步为 7。**

### Phase D — 隔离验收

- [x] **D1 `jelly-smoke.mjs --only=assistant`**（合成键盘由 `mouse-helper.swift` 新增 `key` 子命令，仅在面板确认键窗口后发送）+ `bridge-smoke.mjs` 助手场景；回归 `--only=ring|nudge-mouse`、`smoke.mjs --auto` 等既有冒烟。 **实际：新增独立的 `assistant-smoke.mjs`（12 个场景）而不是给 `jelly-smoke.mjs` 加 `--only=assistant`；另加 `user-quiet.mjs` 礼让用户机制（验收会抢键盘 / 移鼠标，曾把用户的真实按键送进测试面板）；`bridge-smoke.mjs` 增加助手阶段与断线重连；既有五个冒烟在协议 v7 下全部通过。**
- [x] **D2 变异检查**（Chrome 侧 / 纯逻辑 / AppKit 三层，脚本在 `/tmp`，逐个说明存活者）。 **实际：Chrome 侧 JS 60 个（57 抓到、3 等价）、Swift 纯逻辑 66 个（61 / 5）、AppKit 70 个（58 / 12）、礼让判定 17 个（15 / 2）；存活者逐个说明见技术文档。过程中误用原地改写仓库文件的脚本，短暂留下一个变异体，已按字节恢复，见技术文档“验证发现并修复的缺陷”第 7 条。**

### Phase E — 收尾

- [x] **E1 全量验证**：全量 `node --test`、`node --check`、`git diff --check`、构建与自测；对照设计文档写“实现与验证结果”（含差异与未验收清单）。 **实际：全量 `node --test` 2409 通过 / 0 失败；`node --check`、`git diff --check` 通过；隔离构建与自测通过；真实 Chrome 156、真实账号等未验收，已在技术文档如实列出。**
- [x] **E2 文档**：`docs/technical/native-assistant-workbench-20261016.md` 收尾、`docs/technical/_index.md`、`desktop-reminder/README.md`、`AGENTS.md` 新增条目与既有条目中受影响句子、研究文档状态与 `_index`。 **实际：技术文档、两个 `_index.md`、`desktop-reminder/README.md`、`AGENTS.md` 与研究文档（新增“九、实现后更正”）均已更新。**
