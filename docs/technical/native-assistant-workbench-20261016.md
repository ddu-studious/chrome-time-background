---
title: 桌面水母原生 AI 工作台（L1）：任意应用里按全局快捷键直接对话，Chrome 仍是唯一执行器
date: 2026-10-16
status: 已实现，隔离验收与联调通过（设计经用户批准 2026-10-16，“我完全同意，可以执行设计和代码开发了”）；真实 Chrome 156、真实账号、真实中文整句输入、全屏 Space 与多屏组合、VoiceOver 等未验收，见“已知边界与未验收”
---

# 桌面水母原生 AI 工作台（L1）

## 背景与用户决策

2026-10-16 用户提出：现在 `Ctrl+Shift+B` 只有在浏览器里才能唤出 AI 工作台，希望借桌面水母的原生能力，**在任意应用里直接有一个原生的 AI 工作台**，而不是打开浏览器里的工作台（明确“不要 L0”）。调研与 `/tmp` 原型验证见 `docs/research/research-jellyfish-summon-assistant-20261016.md`（全局热键注册与送达、面板拿键盘焦点、输入、回车提交、Esc 归还焦点均在原型上通过，没有发现硬阻碍）。

用户逐项同意的取舍：

| 问题 | 决定 |
|---|---|
| 原生来源提交的文字是否允许“自动确认的一次性提醒创建” | **不允许**：来自桌面输入的任务（`origin:'desktop'`）所有写操作一律保留确认卡，不经 pi 自动确认判断 |
| 原生面板与浏览器工作台是否共用会话 | **共用同一个 `AssistantEngine` 会话**（引擎本来就只有一个 `current` 任务）；两处同时操作时沿用引擎既有的“当前任务正在执行，请先停止或等待完成”提示 |
| 全局快捷键默认值 | **可配置，默认 `ctrl+shift+b`**（设置页“桌面水母”卡片里选预设，不开放自由录制） |
| 范围 | 文字入口；**不做语音**（AGENTS 现状是原生端没有使用麦克风）；**不做 L2**（任意网页/标签页操控，另立项） |
| 前提 | 水母必须**常驻**才有全局快捷键（原生进程要在运行，与现有“常驻”约定一致，不做开机自启） |

## 范围

- **做**：macOS 原生桌面组件里的 AI 助手面板（输入、进度、结果、停止、在 Chrome 工作台查看）；全局快捷键与水母右键菜单入口；Chrome 侧薄适配层把原生输入交给**同一个** `engine.submit`、把任务状态投影回原生；设置页开关与快捷键预设；协议 v7。
- **不做**：原生端自己执行业务/调本机 AI/保存任务（Chrome 才是执行器）；语音输入；通用浏览器操控；开机自启；Chrome 没运行时“拉起 Chrome 再执行”；新增权限、网络、摄像头/麦克风、辅助功能或输入监控权限。

## 架构与责任划分

```
任意应用中按热键 / 水母菜单“问 AI…”
  → 原生 AssistantController（Carbon 热键、NSPanel 输入面板，只显示与转发）
  → 事件 assistantAction {action:'submit'|'cancel'|'open', actionId, text?, taskId?, version?}
  → Chrome AlarmDesktop.handleAssistantAction（绑定当前连接、actionId 幂等、同一动作处理中不重复进入）
  → AssistantNative（js/assistant-native.js，薄适配）→ engine.submit({text, origin:'desktop', 面板所见的 taskId/version}) / engine.cancel / openWorkspace
  → engine.onChange(task) → AssistantNative.sync → 命令 assistantState {state} 投影回原生
  → 命令 assistantResult {actionId, ok, error?}：对动作的回执（只有 ok:true 才让面板显示“已交给 Chrome”）
  → 原生面板显示进度/结果；需要选择/确认/补充时，仍由现有 AssistantConfirmation 弹原生确认卡
```

- **Chrome 是唯一所有者**：任务、版本、预算（12 轮/12 工具/5 分钟）、取消、恢复、副作用标记、unknown 回执、自动确认策略、本机 AI 网关开关与额度——全部不变，因为请求走同一个 `engine.submit`。原生端只存窗口位置之外的**任何东西都不存**（面板位置连窗口位置也不记忆），不存任务。
- **只有匹配的回执才显示成功**：面板点“发送/停止/在 Chrome 中查看”后进入 `pending`，收到匹配 `actionId` 的 `assistantResult`（`ok:true`）才继续；`ok:false` 显示 Chrome 给的原因并保留输入；8 秒无回执提示“Chrome 尚未确认，请重试或到浏览器里查看；若 Chrome 已接受，这里会自动显示进度”，不声称已提交，同一段文字重试沿用同一个 `actionId`（Chrome 侧幂等）；迟到但匹配的回执仍被接受，不匹配的一律忽略。
- **状态以 Chrome 推送为准**：面板里的“进度/结果”只来自 `assistantState`（含 `taskId/version/status/message`），原生不自行推断“已完成”。`completed` 只写“助手已回复”，助手原文照实显示，不改写成“已播放/已设置”；`interrupted`（unknown 回执）明确提示“已中断，请到 Chrome 里核对实际结果，不要直接重做”，不提供重试。
- **提交带面板所见的任务与版本**：与浏览器工作台一致，“第 2 个”之类的引用与过期检查走原有路径；半截绑定（只有 `taskId` 没有 `version`）不传。原生只能提交文字，应用、动作、候选、来源都不接受调用方给的。
- **确认卡复用**：`waiting/clarify/review/failed/interrupted` 仍由 `js/assistant-confirmation.js` 与 `confirmation-view.swift` 负责；面板只显示一行“需要你选择/确认/补充”和助手原文，不重复实现选择或确认。

## 来源与授权边界（`origin:'desktop'`）

- `Contract.input` 只在 `origin === 'desktop'` 时保留 `origin:'desktop'`（其他值一律丢弃，模型输出与扩展页面不能声明来源，`js/assistant-contract.js`）；`engine.respond`（原生确认卡的“回答”路径）在重新提交时同样带上 `origin:'desktop'`，因为该路径只能由原生交互卡触发（`js/assistant-engine.js`）。
- `js/assistant-tools.js` 在调用 `ai_approval_evaluate` 之前检查任务输入的 `origin`：`'desktop'` 时**不调用 pi 自动确认**，直接保留确认卡，`approval = {decision:'confirm', policy:'desktop-origin', reason:'来自桌面输入，保留手动确认'}`；其余路径（浏览器工作台）行为不变。**本地进程可伪造“来自桌面”，但无法获得比 `connectNative` 端口更多的权限**——`origin` 只会让策略更严，不会放宽。
- 输入长度沿用 `Contract.clean` 的 500 字上限；原生端发出前检查（空白不发、超长不发且不截断）、Chrome 端再次校验（不信任原生端）；`actionId` 非空且 ≤100 字符；同一时刻只处理一个提交；只接受 `connectNative` 当前端口的消息（旧端口的迟到消息忽略，缓存只在 `port === this.port` 时写入）。
- 日志只写固定类别（`system/assistant-native`，`context` 为动作名，`error` 为白名单错误类别 `invalid/busy/stale/disabled/rejected/unavailable`），**不写用户输入正文、助手回答或任务内容**（`bridge-smoke` 里逐字断言日志不含输入）。

## 协议 v7（在 v6 之上增量，旧组件忽略新字段）

| 方向 | 消息 | 说明 |
|---|---|---|
| Chrome → 原生 | `jelly` 命令可带 `assistant:{enabled:true, hotkey}` | 只在“水母常驻**且**助手已启用”时才带；**不带就是关闭**（原生据此注销热键、收起面板、去掉菜单项）；`hotkey` 是 Chrome 已规范化的字符串，原生再按同一套语法校验一遍 |
| 原生 → Chrome | 对 `jelly` 命令的回执里带 `assistant:{status, hotkey?}` | `status` ∈ `ok/invalid/taken/failed`（原生只有助手启用时才带）；Chrome 侧另有 `off`（没有带 assistant）、`unsupported`（组件版本低于 7）、`unknown`（还没有回报）三个自己的状态，设置页据此显示 |
| Chrome → 原生 | 命令 `assistantState {state}` | `state` 为 `null`（没有任务）或 `{taskId, version, status, input, message, at}`；`input` 单行 ≤120 字符、`message` 保留换行 ≤1200 字符，均为清洗后的有界纯文本；`status` ∈ `planning/running/waiting/review/clarify/completed/failed/interrupted/cancelled`，认不出的一律拒绝（`ok:false`） |
| Chrome → 原生 | 命令 `assistantResult {actionId, ok, error?, taskId?, version?}` | 对 `assistantAction` 的回执 |
| 原生 → Chrome | 事件 `assistantAction {actionId, action, text?, taskId?, version?}` | `action` ∈ `submit/cancel/open` |
| 原生 → Chrome | `ping` 回执新增 `assistant*` 诊断字段 | 仅用于验收（含 `assistantHotkeyPresses`，系统递给本进程的热键次数），Chrome 不依赖 |

设计稿里的独立 `hotkeyStatus` 事件**没有做**：注册发生在处理 `jelly` 命令时，结果直接写在那条命令的回执里，少一种消息、也不会出现“事件先到、命令回执后到”的乱序。

版本约定：`ping` 回执 `version` 升到 7；Chrome 侧 `AlarmDesktop.setAssistantState` 在已知组件版本低于 7 时抛错、并核对回执 `version ≥ 7`，旧组件不会收到 v7 命令；设置页提示“更新桌面组件并重载扩展”，其余水母功能不受影响。

## 设置与快捷键语法

- 设置存在独立的 `desktopAssistantV1 {enabled, hotkey}`，**没有**放进 `desktopJellyV1`（设计稿写的是后者）：旧版本回滚时 `desktopJellyV1` 的写入路径不会把它抹掉。`enabled` 默认 **false**，只有明确 `true` 才启用；`hotkey` 默认 `ctrl+shift+b`；**只有水母常驻且 `enabled===true` 才向原生下发启用**。设置页“桌面水母”卡片里有开关与四个预设（`ctrl+shift+b ⌃⇧B`、`ctrl+shift+space ⌃⇧空格`、`ctrl+option+a ⌃⌥A`、`ctrl+option+b ⌃⌥B`），不开放自由录制。
- 语法（JS `normalizeHotkey` 与 Swift `AssistantModel.parseHotkey` 两份实现，`test/desktop-companion-logic.test.mjs` 用同一份用例表逐条对照，含首尾空白、重复修饰键、超长等边界）：规范字符串全小写，修饰键按 `ctrl+option+shift+cmd` 的固定顺序，末尾一个按键；长度 ≤64（按 UTF-16 长度、在去空白之前量），至少 3 段、修饰键不重复、至少 2 个修饰键且至少 1 个属于 `ctrl/option/cmd`（单独 Shift 不算，避免与普通输入冲突）；按键只允许 `a–z`、`0–9`、`space`、`f1`–`f20`（57 个键码）。非法值（含手改存储）回退默认并在设置页提示。
- 热键注册用 Carbon `RegisterEventHotKey`（公开 API，不需要“辅助功能”或“输入监控”权限）。**macOS 不会告知这个组合是否也被别的应用使用**（见“验证中得到的系统行为”），所以设置页只承诺“已向系统注册”，并明确写出“按下后没有反应、或同时触发了别的应用，就换一个组合”，与 Chrome 里为“快捷助手”设置的快捷键相同时会不会同时触发尚未验证，建议选不同的组合。
- 热键失败（非法、`taken`、其他系统错误）：状态回到设置页显示原因，面板仍可通过水母右键菜单“问 AI…”打开；不重复重试。

## 原生面板行为

- 面板：`NSPanel`（`.borderless + .nonactivatingPanel`，浮动，`canJoinAllSpaces + fullScreenAuxiliary`），复用 `GlassView` 材质与 `InteractionInput`（⌘A/C/V/X/Z）；宽度固定 560，高度随内容变化（正文最高 240，顶边不动，再夹进可见区）；位置在**鼠标所在屏幕**可见区水平居中、顶边落在可见区高度的 22% 处；**不记忆位置、不写任何持久化状态**（连 `CompanionX` 也不碰）；已显示时再次唤出不改变位置（用户拖到哪就留在哪），收起后再唤出回到计算位置；随系统深浅色。
- 唤出：热键 / 菜单 → `toggle`（已显示且为键窗口 → 收起；否则显示并聚焦）。聚焦用激活应用 + `makeKeyAndOrderFront` + `makeFirstResponder`；**0.25 秒后核对确实拿到了键盘（键窗口且应用已激活）**，没拿到只重试一次，仍没有就保持面板可见并提示“没有拿到键盘焦点，请点一下输入框再输入”，不吞输入。**用户自己切去别的应用不算失败、核对不会把键盘抢回来**（隔离验收里发现的缺陷，见下）：判定是“唤出之后是否拿到过键盘”，拿到过就不再重试。
- 收起：`Esc`（两条冗余路径：输入框的 `doCommandBy` 与窗口的 `cancelOperation`）或再按一次热键；任务继续在 Chrome 里执行，不取消。**只有收起那一刻面板还是键窗口且应用在前台，才把前台还给唤出前的应用**（唤出前的前台应用本身是我们、或用户已经去了第三个应用时，都不动前台）。
- 输入：`NSTextField` 的回车提交（输入法组字中的第一次回车由系统吃掉，与普通输入框一致）；空文本提示“请先输入需求”；超过 500 字提示“超过 500 字（现在 N 字），请精简后再发送”，不截断、不发送；等待回执期间禁止再次提交，输入保留到 `ok:true` 才清空（等待期间用户又改了输入则不清空）。“停止”只对 `planning/running` 的任务显示，经 `assistantAction{cancel,taskId,version}`（Chrome 侧再核对任务与版本仍是当前的）。
- 显示：`你：…`（上一次提交的需求，面板上最多 60 字符）+ 状态行 + 助手原文（可滚动）+ 底部提示（热键生效时“Esc 收起 · ⌃⇧B 再按一次也可收起”，失效时“全局快捷键没有生效，请在设置页换一个”）+ “在 Chrome 中查看”。状态行优先级：正在等 Chrome 回执 > 本地提示（拒绝原因、没有回执、焦点）> Chrome 推来的任务状态 > 空闲提示；`needs attention` 的三种状态（选择/确认/补充）用强调色，`failed/interrupted` 用错误色；`completed/failed/interrupted/cancelled` 保留到下一次提交。
- 不做：流式 token、历史列表、多会话、语音、候选/确认的重复实现。

## 失败与降级矩阵

| 情况 | 行为 |
|---|---|
| 设置里未开启 / 水母未常驻 | `jelly` 命令不带 `assistant`：热键注销、面板收起、菜单项消失；显示类测试钩子回 `ok:false` |
| 组件版本低于 7 | 设置页提示“更新桌面组件并重载扩展”；`setAssistantState` 抛错；其余功能照常 |
| 热键非法 / 系统拒绝 | 设置页显示原因；菜单入口可用；面板底部提示去设置页换一个 |
| Chrome 连接断开（Chrome 退出、Service Worker 重建、端口关闭） | 原生进程随连接一起退出，面板和热键同时消失（不会有“未连接”的残留面板）；Chrome 侧按既有的 2/5/15/60/300 秒有界退避重新拉起常驻组件，新进程里助手由 `jelly` 命令重新生效，并补发 Engine 当前任务（`bridge-smoke` 覆盖） |
| 提交被拒绝（任务正在执行、输入无效、上一条还在提交、助手已关闭…） | 显示 Chrome 返回的原因（原生按单行、≤200 字符清洗），保留输入 |
| 8 秒无回执 | 提示尚未确认并解除按钮锁定；Chrome 若已接受，会通过 `assistantState` 补回进度；同一段文字重试沿用同一 `actionId`，Chrome 侧幂等，不会提交两次 |
| 任务需要确认 / 选择 / 补充 | 面板显示状态提示；确认卡由现有链路弹出，回答仍回到原串行入口 |
| 减少动态效果 | 面板出现时本来只有 0.12 秒淡入（没有位移动画），打开“减少动态效果”后直接显示 |
| 已取消任务的晚到结果 | 沿用 Engine 现有版本保护，`cancelled` 不会被复活（`bridge-smoke` 里发一个晚到结果验证） |

## 复用与新增

- 复用：`AssistantEngine.submit/cancel/respond`、`Contract.input`、`AssistantConfirmation`（确认卡）、`AlarmDesktop`（同一条 Native Messaging 连接）、`JellyDesktop`（设置与推送）、`GlassView`、`InteractionInput`、`JellyController` 菜单；不引入任何第三方库、SDK 或新权限（Carbon `RegisterEventHotKey` 是系统公开 API）。pi / DSH 在这里没有可复用的东西（这是原生输入前端，不是 Agent 运行时），自动确认链路对桌面来源是**关闭**而不是改造。
- 新增：`js/assistant-native.js`、`desktop-reminder/assistant-model.swift`（纯逻辑）、`assistant-hotkey.swift`、`assistant-panel.swift`；改动：`js/alarm-desktop.js`、`js/jelly-desktop.js`、`js/assistant-background.js`、`js/assistant-contract.js`、`js/assistant-engine.js`、`js/assistant-tools.js`、`js/settings-page.js`、`settings.html`、`desktop-reminder/main.swift`、`jelly-controller.swift`（菜单项）、`build.mjs`；验收：`desktop-reminder/assistant-smoke.mjs`、`bridge-smoke.mjs`（扩展）、`user-quiet.mjs`、`companion-selftest.swift`（扩展）、`mouse-helper.swift`（合成键盘与屏幕列表）。

## 与设计稿的差异

| 设计稿 | 实际 |
|---|---|
| 设置放进 `desktopJellyV1.assistant` | 独立键 `desktopAssistantV1`（回滚安全） |
| 原生 → Chrome 事件 `hotkeyStatus` | 没做，注册结果写在 `jelly` 命令的回执里 |
| `assistantState` 字段 `updatedAt` | 字段名 `at`（毫秒时间戳，0 表示不详） |
| 位置“上三分之一居中，重复唤出回到同一位置” | 可见区高度 22% 处居中；**已显示时再次唤出不动位置**（否则会把用户拖动过的面板拽回去），收起后再唤出才回到计算位置 |
| 焦点核对“没拿到则重试一次” | 加了“唤出后拿到过键盘就不再重试”：用户自己切走时不抢回 |
| 收起时“仅当本应用仍在前台才归还” | 同时要求面板仍是键窗口，且唤出前的前台应用不是我们自己 |
| 热键被占用返回 `-9878` 即显示“已被占用” | 实测不成立（见下）：系统不会告知跨应用冲突，`taken` 实际只在同一进程重复注册时出现，设置页文案改为只承诺“已向系统注册” |
| 设计稿的验收只有 5 层 | 另加“礼让用户”的验收脚本机制（`user-quiet.mjs`）：验收要抢键盘、移动鼠标、切前台，用户正在用电脑时会把他的按键送进测试面板，这在一次基线运行里真的发生了 |

## 验证结果（分层，互不替代）

下列结果都是在最终源码上、用最后一次重建的隔离组件（`build.mjs --app=/tmp/tk/QA.app`，独立 Bundle ID `com.timekeeper.desktop.qa`，没有碰真实组件）重跑得到的。验证途中发生过一次变异脚本误操作、短暂改动了仓库里的一个 Swift 文件（见“验证发现并修复的缺陷”第 7 条），已按字节恢复并在恢复后的源码上重跑了本节的全部层级；变异检查本身是在恢复前、正确的源码上做的，没有重跑。

| 层 | 内容 | 结果 | 它**不能**证明什么 |
|---|---|---|---|
| 静态检查 | 全部改动与新增的 JS / MJS 过 `node --check`；`git diff --check`；未跟踪新文件的行尾空白扫描；Swift 由 `swiftc` 编译（隔离构建与自测各编一次） | 全部通过，0 处问题 | 行为 |
| Chrome 侧业务替身（Node） | 全量 `node --test test/*.test.js test/*.test.mjs`；其中本功能 9 个文件共 141 项：`assistant-native` 15、`assistant-native-integration` 10、`assistant-native-origin` 4、`desktop-assistant-settings` 9、`alarm-desktop` 44、`jelly-desktop` 34、`jelly-desktop-integration` 13、`user-quiet` 10、`desktop-companion-logic` 2 | **2409 通过 / 0 失败 / 0 跳过** | 真实 Chrome、真实 Service Worker 与真实 `chrome.*` API |
| Swift 纯逻辑 | `companion-selftest.swift`（由 `desktop-companion-logic.test.mjs` 编译运行）：热键语法（与 JS 同一份用例表逐条对照）、面板文案 / 状态优先级 / 长度截断 / `2^53−1` 版本边界 / 位置几何、协议解析、既有水母逻辑 | **583 项检查全部通过**（响铃气泡阶段是 242 项，新增检查来自助手部分） | AppKit 窗口、真实系统行为 |
| 隔离原生进程 | `assistant-smoke.mjs` 12 个场景（下面逐个列出），含合成热键 / 键盘 / 鼠标、第三个应用（Finder）切换、两块屏幕、12 张自家窗口截图 | **12 / 12 通过** | 真实物理键盘、真实输入法、更多种屏幕组合 |
| 联调 | `bridge-smoke.mjs`：源码原样加载的真实 `AssistantEngine` / `AssistantNative` / `AlarmDesktop` / `JellyDesktop` ↔ 真实原生进程（规划与执行是替身，`connectNative` 是替身）：启用与热键状态回到设置视图、`origin:'desktop'` 提交、进度投影回面板、取消、晚到结果不复活已取消任务、断线重连后热键与当前任务补回、日志不含输入正文 | 全部阶段通过（含既有的响铃 `holdUntil` 阶段，实测 5013 ms） | 真实 Chrome、真实本机 AI |
| 回归（协议 v7 下重跑既有功能） | `countdown-smoke`、`confirmation-smoke`、`interaction-smoke`、`smoke.mjs --auto`、`jelly-smoke.mjs`（含合成真实鼠标） | 全部通过，回执 `version:7`。`jelly-smoke` 最后一次运行时本机只剩一块屏幕，脚本跳过了多显示器场景（此前两块屏幕时通过过） | 真实 Chrome、真实组件 |

`assistant-smoke.mjs` 的 12 个场景：

- `config`：默认关闭、启用、非法热键、停用时的注册状态与回执；
- `conflict`：两个进程注册同一组合后按下，两个都收到（系统不告知跨应用冲突的实测依据）；
- `presets`：四个预设逐个向系统注册；
- `protocol`：提交 / 停止 / 回执 / 任务状态渲染 / 非法负载；
- `no-ack`：8 秒无回执只提示、解除锁定，同一段文字重试沿用同一个 `actionId`，晚到的匹配回执仍算数；
- `focus`（四次运行）：没拿到键盘重试一次、仍没有就提示且不吞输入；用户自己切走时不抢回；新一轮唤出不继承上一轮的重试次数；
- `hooks-off`：没有 `TIMEKEEPER_TEST_HOOKS=1` 时测试钩子一律被拒，面板不会被弹出；
- `lifecycle`：停用清掉面板状态；Chrome 断开后进程结束，没有“未连接”的残留面板；
- `menu`：启用后水母右键菜单第一项是“问 AI…”，点选唤出面板，停用后消失；
- `keyboard`：合成热键唤出并拿到键盘、输入、回车提交、`Esc` 收起并归还焦点、再按一次热键收起、不在键窗口时再按重新唤出、用户已切到第三个应用时不动前台、热键递送次数（换组合 / 非法 / 停用后旧组合不再递送）；
- `placement`：出现在鼠标所在屏幕、水平居中、顶边在可见区高度 22% 处（本次验证了 2 块屏幕）；
- `shots`：只截面板自己的窗口（`screencapture -l`），浅色与深色各六种状态（空闲、进行中、等待、完成、中断、超长输入），人工核对排版与可读性。

**变异检查**（对象各自独立；每个变异体都要求至少一个测试或场景失败才算“抓到”）：

| 对象 | 变异数 | 抓到 | 存活 |
|---|---|---|---|
| Chrome 侧 JS（协议适配、幂等、设置与热键规范化、来源收紧） | 60 | 57（首轮 49，补测试后再抓 8） | 3：J01 / J02 / J03，热键语法里三道互相蕴含的守卫（至少 3 段、至少 2 个不同修饰键、至少 1 个非 Shift），单独去掉任何一道行为都不变 |
| Swift 纯逻辑（`assistant-model.swift`） | 66 | 61 | 5：M07 / M09 / M10 同上（合并去掉的 M65 / M66 被抓到）；M13（`utf16.count` 换成标量数）与 M33（`> 0` 换成 `>= 0`）等价——合法热键只含 ASCII，`at = 0` 本来就等于“不详” |
| AppKit（面板 / 热键 / 控制器） | 70 | 58 | 12，逐个说明见下 |
| 礼让判定（`user-quiet.mjs`） | 17 | 15 | 2：Q13 / Q14（`seconds=0` 的提前返回与后面的循环条件等价） |

AppKit 层 12 个存活变异体：

- 等价（2）：H04（同一热键不早退，只是优化）、H08（处理函数不核对热键标识，进程里本来只有一个热键）。
- 成对冗余（4）：P11a / P11b（“设第一响应者”在应用激活与窗口成为键窗口两处各做一次）、P32a / P32b（`Esc` 经字段编辑器与窗口两条路径）。单独去掉任一处行为不变，两处同时去掉的 P11c / P32c 被抓到。
- 有另一层保护或本机构造不出触发条件（6）：P05（停用时收起也归还前台：只有“停用那一刻面板正好是键窗口”才有区别，而收起时本来就要求 `isKeyWindow && NSApp.isActive`）；P06 / P12（热键切换 / 记录键盘不看应用是否激活：只有“面板是键窗口但应用不在前台”才有区别，macOS 协作式激活下本机造不出这个状态）；P17（核对不看是不是最新一次：只有 250 毫秒窗口内重叠的两次唤出才有区别，属时序型，脚本无法确定性触发）；P43（注册失败也记热键：`taken` 在本机不可达，AppKit 层的显示路径只被纯逻辑层覆盖）；P50（无回执定时器不看是否已解除：回调里另有 `pending` 判断，是有意的冗余）。

变异检查与隔离验收发现的问题见下一节；变异检查没有覆盖的是读屏播报、真实键盘与真实 Chrome。

## 验证发现并修复的缺陷

分开写：产品缺陷（会影响用户）与测试 / 验收脚本自己的缺陷（不影响产品，但会让“通过”不可信或打扰用户）。

**产品缺陷（2 个）**

1. **三个幂等缓存从不淘汰**（`js/alarm-desktop.js`，Chrome 侧变异检查发现）：`countdownHandled`、`nudgeHandled`（v6 就有）和新写的 `assistantHandled` 都想“满 100 条删最旧的一条”，写成了 `Map.values().next().value`——`values()` 给的是结果对象，`delete(对象)` 什么也删不掉，缓存会无限增长。三处都改为 `keys().next().value`，并各补了“满 100 条后最旧的被淘汰、仍在缓存里的不被重复处理”的测试。
2. **焦点核对会把用户已经切走的键盘抢回来**（隔离原生验收发现）：唤出后 250 毫秒内用户切去别的应用，旧逻辑判定“没拿到键盘”并重新激活，把焦点重新拽回面板。现在记录“唤出之后面板是否拿到过键盘”（`keyboardSinceShow`，应用激活与窗口成为键窗口两个通知先后不定，任何一个到达时都检查两个条件），拿到过就不再重试；`focus` 场景还验证了“新一轮唤出不继承上一轮的重试次数”。

**设计假设被实测推翻（1 个）**：设计稿以为热键注册返回 `-9878` 就等于“被其他应用占用”，设置页能据此提示。实测不成立（见下一节），设置页说明与状态文案改成只承诺“已向系统注册”，`test/desktop-assistant-settings.test.js` 守住不再出现“不会冲突 / 已检查冲突”之类的话。

**测试与验收脚本的缺陷 / 缺口（5 个）**

3. **Swift 自测里的同义反复**（Swift 纯逻辑变异检查发现）：长度上限的断言拿常量和常量自己比、没有 `2^53−1` 版本号边界。改为字面量 120 / 1200 的边界检查（等于上限原样保留、超 1 个字符被截成 `上限−1 个字符 + …`）和 `9_007_199_254_740_991` 接受、`9_007_199_254_740_992` 拒绝；原来 M27 / M28 / M32 三个变异体因此存活，补完后被抓到。
4. **“收起时前台应用不能变成自己”没有测试守着**（AppKit 层变异规划时发现）：面板已在键窗口时再次触发“显示”，唤出前的前台应用若被记成我们自己，之后 `Esc` 就没有可归还的对象。代码里本来有这个判断，但没有任何场景会走到；`keyboard` 场景加了“键窗口状态下再 show（钩子，延迟 300 毫秒）之后 Esc 仍能归还给唤出前的应用”，另加“用户已切到第三个应用（Finder）再收起，不动前台”和热键递送次数的断言（旧组合在换组合 / 非法 / 停用之后不再递送）。
5. **验收脚本把用户的真实按键送进了测试面板**（一次基线运行里，`提交被接受后清空输入` 的断言实际得到 `'  提醒我\n明天\t九点开会 l'`，末尾多出的 `l` 是用户当时在别处敲的）。后果是把用户的输入吞进了测试窗口，所以加了“礼让用户”机制：`desktop-reminder/user-quiet.mjs` 读系统的 `HIDIdleTime`（只读空闲时间，不读按键内容、不需要权限），开始前等用户安静 20 秒，运行中发现真实输入就立刻撤掉测试面板、等他安静后重跑该场景（场景互相独立，各用全新的原生进程；连续被打断 6 次才以退出码 75 结束，不算验收失败），合成输入后必须 `touch()`；判定逻辑由 `test/user-quiet.test.mjs` 的 10 个测试守住，对它自己做的 17 个变异里抓到 15 个，存活的 2 个（`wait` / `waitIfActive` 里 `seconds=0` 的提前返回）与后面的循环条件等价。
6. **第三个应用场景的前台比较永远不相等**（验收脚本）：`lsappinfo front` 与 `lsappinfo find bundleid=` 输出的 ASN 格式不同，初版直接比较字符串；改成先用正则归一化再比较。
7. **变异脚本误操作，短暂改动了仓库里的源文件**（验证过程的失误，不是产品缺陷）：Chrome 侧 JS 脚本与串行 Swift 脚本是**原地改写仓库源文件**、每个变异体之后在 `finally` 里恢复的（并行 Swift、AppKit、礼让判定三个脚本只改 `/tmp/tk/wt` 下的副本）。我给串行 Swift 脚本传了它并不支持的 `--list`，它没有报错、而是把 66 个变异体真跑了一遍，被工具超时转入后台后我用 `pkill`（SIGTERM）终止，`finally` 没有执行，`desktop-reminder/assistant-model.swift` 里残留了一个变异体（默认热键被改成 `ctrl+shift+n`）。处理：发现后立刻拿 AppKit 变异 worker 里的原件核对（只差这一行）、按字节恢复并校验 SHA-256（`06dff9a2…`），再把 `desktop-reminder` 下全部 Swift / MJS 源文件与 worker 副本逐个 `cmp`、重跑 `desktop-companion-logic` 测试，之后在恢复后的源码上重建隔离组件并重跑了“验证结果”一节的全部层级；两个原地脚本现在拒绝不认识的 `--` 开关、把 SIGTERM / SIGINT / SIGHUP 转成正常退出让 `finally` 照常恢复，`--check` 逐个核对每个变异体的原文在当前源码里恰好出现一次（即没有残留的变异）。影响面：该 Swift 文件只被原生组件的构建读取、Chrome 不加载它，期间真实组件没有被重建；但**原地改写 JS 的脚本在 Chrome 加载的扩展目录里运行过**（每个变异体只存在几秒，整次运行持续数分钟），那段时间里新打开的扩展页面理论上可能读到被改动的 JS，我无法证明没有发生，也没有观察到异常。以后这类检查应改成只改副本。

## 验证中得到的系统行为（实测，macOS 26.5，本机一块 2× 内屏 + 一块 1× 外屏）

- **Carbon 热键不是独占的，也无法发现冲突**：两个进程注册同一组合都返回 0，按下时两个进程都收到；系统保留的组合同样返回 0；只有**同一进程**重复注册同一组合才返回 `eventHotKeyExistsErr`（-9878）。所以 `taken` 在实际使用里几乎不可达，设置页文案、状态文字和 AGENTS 都不能写“未被占用 / 无冲突”。与 Chrome 自己的快捷键（`chrome.commands`，非全局）同时设置时谁先收到、会不会都触发，**没有验证**（manifest 里 `toggle-quick-assistant` 没有 `suggested_key`，默认不会冲突）。
- **合成按键的细节**（只影响验收脚本）：F1–F19 的合成事件必须带 `.maskSecondaryFn` 才会被热键派发收到，F20、字母、数字、空格相反，带了就收不到；这就是验收里用 `⌃⌥⇧⌘F20` / `F19` 当测试组合的原因（任何应用里都不做事）。
- **macOS 14+ 的协作式激活**：`NSApp.deactivate()` 不可靠（测试钩子 `deactivate` 实际是激活唤出前的应用或 Finder），不要靠它归还前台。`lsappinfo front` 返回 `ASN:0x0-0x…:`，`lsappinfo find bundleid=…` 返回 `ASN:0x0-0x…-"名字":`，对比前须用正则归一化（第三应用场景的初版因此永远判“不相等”）。
- **定时器会被合并**：验收里的等待都用轮询（`until`），不依赖固定延时。
- **`HIDIdleTime` 会被合成事件重置**：验收脚本自己的键盘 / 鼠标合成输入同样让它归零，所以礼让判定只看“比我们最后一次合成输入更晚的事件”。

## 已知边界与未验收

- **真实 Chrome 156、真实账号、真实本机 AI 服务**：整条“原生输入 → Service Worker → `engine.submit` → 模型 → 投影回原生”没有在真实 Chrome 里跑过。联调（`bridge-smoke`）用的是源码原样加载的真实 `AssistantEngine` / `AssistantNative` / `AlarmDesktop` / `JellyDesktop`，规划与执行是替身，连接是 `connectNative` 替身 ↔ 真实原生进程。
- **真实物理键盘**：全局热键只用合成事件验证（系统同一套热键派发，但不等于真实键盘）；**中文整句输入法**（候选框、组字中回车）只验证了普通 `NSTextField` 的行为，没有用真实输入法输入过整句。
- **全屏 Space、Stage Manager、刘海屏 / Dock 在侧边或自动隐藏、更多种多显示器组合**：只在本机一块 2× 与一块 1× 的组合上验证过“面板跟着指针所在屏幕定位”；**VoiceOver** 未验证；**Chrome 弹窗、系统安全输入场景**下的表现未验证。
- **热键冲突**：无法检测（见上），只能靠用户在设置页换组合；与 Chrome 自己的“快捷助手”快捷键同时设置的行为未验证。
- **资源占用**：常驻的原生进程只多了一个热键注册和一个按需创建的面板，没有测量 CPU / 内存；常驻会让 Service Worker 不休眠（已有约束，默认关闭的理由之一）。
- **真实组件**：本机 `local-ai/.local/TimeKeeperDesktop.app` 在验收期间始终没有被替换（隔离构建用独立 Bundle ID `com.timekeeper.desktop.qa`）。让这个功能在真实环境生效需要用户**重装真实组件并重载扩展**；验收入口是设置页打开“桌面 AI 助手”后按热键或右键水母选“问 AI…”。
- **变异检查没有覆盖的**：读屏播报、真实键盘、真实 Chrome；存活的变异体逐个说明见上面“验证结果”。

## 复验命令

```sh
# 隔离构建（独立 Bundle ID，不碰真实组件；扩展 ID 用占位值即可，隔离验收不连接 Chrome）
node desktop-reminder/build.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app

# Chrome 侧与 Swift 纯逻辑
node --test test/desktop-companion-logic.test.mjs test/assistant-native.test.js test/assistant-native-integration.test.js test/assistant-native-origin.test.js test/desktop-assistant-settings.test.js test/alarm-desktop.test.js test/jelly-desktop.test.js test/jelly-desktop-integration.test.js test/user-quiet.test.mjs
node --test test/*.test.js test/*.test.mjs

# 隔离原生冒烟（会合成键盘与鼠标、切前台；脚本会礼让正在使用电脑的人，被打断时重跑该场景）
node desktop-reminder/assistant-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app --shots=/tmp/tk/shots
node desktop-reminder/bridge-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app

# 回归（都带 --app，不加会连到真实组件）
node desktop-reminder/countdown-smoke.mjs --extension-id=… --app=/tmp/tk/QA.app
node desktop-reminder/confirmation-smoke.mjs --extension-id=… --app=/tmp/tk/QA.app
node desktop-reminder/interaction-smoke.mjs --extension-id=… --app=/tmp/tk/QA.app
node desktop-reminder/smoke.mjs --extension-id=… --app=/tmp/tk/QA.app --auto
node desktop-reminder/jelly-smoke.mjs --extension-id=… --app=/tmp/tk/QA.app
```

变异检查脚本在 `/tmp/tk`（不入库）：`mutate-assistant-js.py`（Chrome 侧 JS 60 个）、`mutate-assistant-swift.py` + `mutate-swift-parallel.py`（Swift 纯逻辑 66 个）、`mutate-assistant-appkit.py`（AppKit 70 个，`--workers=N --list --check --baseline-only`）、`mutate-quiet.py`（礼让判定 17 个）。并行 Swift、AppKit、礼让三个脚本只改 `/tmp/tk/wt` 下的副本，仓库文件一个字节都不动（AppKit 脚本启动时记下仓库源文件哈希，结束时核对未变）；**`mutate-assistant-js.py` 与串行的 `mutate-assistant-swift.py` 是原地改写仓库文件再恢复的**，只在确有必要时使用（现在不认识的开关会直接报错、被信号终止时也会恢复原文，`--check` 可核对没有残留变异），事故经过见“验证发现并修复的缺陷”第 7 条。
