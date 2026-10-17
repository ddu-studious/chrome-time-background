---
title: "用桌面水母在浏览器之外唤出 / 驱动 AI 工作台：可行性调研"
type: research
status: active
created: "2026-10-16"
updated: "2026-10-16"
tags: [桌面水母, AI工作台, 原生组件, 全局快捷键, Native Messaging]
related:
  - docs/research/research-jellyfish-drink-confirmation-20261016.md
  - docs/technical/jellyfish-resident-companion-20261016.md
  - docs/technical/native-assistant-workbench-20261016.md
changelog:
  - date: "2026-10-16"
    desc: "初始调研：三层可行性与现有链路盘点"
  - date: "2026-10-16"
    desc: "用户确定要 L1（原生 AI 工作台、不要 L0）；补充 /tmp 原型验证（热键送达、焦点、输入、回车、归还焦点）与结论更新"
  - date: "2026-10-16"
    desc: "L1 已按用户批准的取舍实现（见技术文档）；新增“九、实现后更正”：热键冲突假设被实测推翻、协议与文件名与设想的差异、焦点重试的实际验证范围；调研正文保留原样"
---

# 用桌面水母在浏览器之外唤出 / 驱动 AI 工作台：可行性调研

> 日期：2026-10-16　状态：调研 + `/tmp` 原型验证，未改任何业务实现
> 问题：现在 `Ctrl+Shift+B` 只在 Chrome 里才能唤出 AI 工作台，能否借桌面水母的原生能力在任意应用里唤出，并“驱动浏览器做事”？

## 结论

**可行，而且大部分管道已经存在。** 但“驱动浏览器”要分清三层，难度差别很大：

| 层级 | 做什么 | 可行性 | 估计规模（推断） |
|---|---|---|---|
| L0 唤出 | 全局快捷键 / 点水母 → Chrome 打开现有工作台 | 高，复用现成路径 | 约半天 |
| L1 原生对话 | 在水母上直接输入需求 → Chrome 里的 Engine 执行 → 水母显示进度、确认、结果 | 高，新增一条协议 + 一个输入面板 + 结果气泡 | 约 2–3 天（含项目要求的测试与变异检查） |
| L2 通用浏览器操控 | 点网页、填表单、开关任意标签页 | **不是水母能给的**：助手今天没有这类工具，要新做工具族并重新评估风险 | 单独立项 |

水母只是**入口和显示面**。真正“做事”的仍然是 Chrome 里 Service Worker 中的 `AssistantEngine`，所以 L1 能做的事 = 现在工作台能做的事（音乐、提醒、任务/工作日志、B 站/YouTube 打开与检索、记忆、只读计算），不多也不少。

## 一、现有能力盘点（已读代码核对）

1. **工作台引擎不依赖页面。** `js/assistant-background.js` 的 `QuickAssistant.install` 在 Service Worker 里创建 `AssistantEngine`，`assistant_submit` 只是扩展页面经 `chrome.runtime.onMessage` 调 `engine.submit(message.input)`。引擎、工具（`AssistantTools`）、确认状态都在后台，页面只是投影。
2. **快捷键只是 `chrome.commands`。** `manifest.json` 里 `toggle-quick-assistant` 没有 `suggested_key`，`Ctrl+Shift+B` 是你在 `chrome://extensions/shortcuts` 里自己绑的；该命令不是 `global`，所以 Chrome 没有焦点时不触发（官方文档：命令默认只在浏览器有焦点时有效）。
3. **原生 → Chrome 的“打开工作台”已经有一条路。** `js/assistant-confirmation.js` 的 `onConfirmationAction` 在 `message.action === 'open'` 时调用 `openWorkspace()`，它在 `assistant-background.js` 里就是 `open(false)`，不带 `tab` 参数。也就是说水母/确认卡点“去工作台”走的就是这条，且已经在隔离验收里验证过协议（真实 Chrome 里未验收）。
4. **原生端已有文字输入与 IME。** `desktop-reminder/confirmation-view.swift` 的 `InteractionInput`（`NSTextField`）+ “发送回答”，README 记录中文输入已在隔离原生 UI 中验证；回答经 `confirmationAction{action:'reply', text}` → `Engine.respond()` → `submit()` 回到原串行入口。
5. **原生 → Chrome 的信任边界已经存在。** 原生进程由 Chrome `connectNative` 启动，`main.swift` 只在 `argv[1]` 是允许的扩展来源时运行；确认卡的“确认”按钮本来就能让原生端提交写操作（绑定任务、版本、状态、候选、有效期）。**新增“原生端提交文字”不扩大信任面**，只是少了一道“必须先有一张卡”的限制，见下文风险。
6. **水母已能常驻并保持连接。** `desktopJellyV1.resident` 打开后 `AlarmDesktop.setResident(true)` 让端口不空闲断开，同时让 Service Worker 不休眠；非常驻时原生进程只在需要显示时才存在。

## 二、全局快捷键：两条路

### 路 A：原生进程注册全局快捷键（推荐）

- 使用 Carbon `RegisterEventHotKey`：这是 macOS 上不需要“辅助功能 / 输入监控”权限的全局热键 API（项目现有约束是“没有申请屏幕录制或辅助功能权限”，这条路不破坏它）。
- 本次在 `/tmp` 做了最小实验：`RegisterEventHotKey` 在 `.accessory` 应用里返回 `noErr`（0）。**未验证“真实按键被送达”**：我用 `CGEventPost` 合成按键，处理函数没触发，合成按键不等价于真实按键；且该实验的 `AXIsProcessTrusted` 为 true（继承自终端/Cursor），不能证明“干净应用无需权限”。这两点要用真实按键、独立签名的 App 复验。
- 前提：原生进程必须在运行 → **只有“常驻”模式下才有全局快捷键**。常驻默认关闭，且会让 Service Worker 保持唤醒（这是它默认关的理由之一）。快捷键与常驻绑定可以接受，因为 Chrome 本身没运行时助手也无法执行任何任务。
- 与 Chrome 自己的快捷键冲突：全局热键由系统先拿走，Chrome 在前台时不会再触发它的 `commands`（推断，未实测）。可行做法是原生端只上报“热键被按下”，由 Chrome 侧用现有 `open(true)` 决定展开 / 收起。热键组合应可配置，避免占用其他应用的快捷键。

### 路 B：Chrome 的 `global: true` 命令（零原生代码，但有不确定性）

- 官方支持把命令标成 `global`，Chrome 无焦点时也触发；建议键位限于 `Ctrl+Shift+[0..9]`，用户可在快捷键页面改成别的组合。
- **不确定**：macOS 上 Chrome 实现全局热键用的机制与是否需要系统权限，我没有找到官方说明，也没在本机实测；而且它不要求水母，也就谈不上水母的“触发后显示”体验。可以作为 L0 的零成本对照实验。

## 三、L0：唤出（半天量级）

流程：热键 / 点水母 → 原生发 `assistantOpen` 事件 → Chrome 调现有 `quickAssistant.open(true)`。

必须面对的现实：

- 原生触发**没有 `activeTab` 授权**（那是用户在浏览器内用快捷键 / 点击扩展图标时 Chrome 授予的）。`open()` 对普通网页的 `tryPage` 需要 `chrome.scripting.executeScript` 注入，会失败并落到设计内的最终兜底——**独立小窗**（`chrome.windows.create({type:'popup', focused:true})`，不需要手势）。已有日志分类会把这种情况记为预期兜底。首页浮层 `tryHome` 不受影响（扩展自己的页面）。用户若已给 `<all_urls>`（可选权限，现状是可选）则页面浮层也能用，但 Chrome 在后台时浮层放在看不见的窗口里没有意义。所以实际体验 ≈ “在任意应用里按热键 → Chrome 弹出输入小窗”。
- **未验证**：Chrome 不是前台应用时，`windows.create(focused:true)` 在 macOS 上能否把窗口真的提到所有应用之前（未实测，需要真实 Chrome 156 + 另一个前台应用）。若不能，原生端可以用公开的 `NSRunningApplication.activate` 帮 Chrome 提前，但这属于新增行为，需要评估。
- 重复触发：现有 `opening` 锁会吞掉打开期间的第二次按键，保持不变。

## 四、L1：在水母上对话（你想要的体验）

```
任意应用中按热键 / 点水母
   → 原生输入气泡（复用 glass-view 与 InteractionInput）
   → 回车：native → Chrome  assistantSubmit {text, requestId}
   → 后台适配层调用同一个 engine.submit({text})
   → engine.onChange(task) → 投影到水母：
        waiting/clarify/review/failed/interrupted → 现有确认卡（已有）
        running / done                           → 新的“进度 / 结果”气泡（需新做）
```

需要新做的部分（都是薄适配，业务不动）：

1. **协议 v7**：新增事件 `assistantSubmit`、`assistantOpen`；新增命令 `assistantState`（进度、最终回答、`taskId/version`）与对应回执。旧组件忽略新字段；与现有 v6 兼容规则一致（Chrome 端 `request('ping')` 看到 `version<7` 就不显示入口并提示更新）。
2. **Chrome 适配层**（新文件，如 `js/jelly-assistant.js`，由 `js/jelly-desktop.js` 接线，**在 `background.js` 的 `userAlarmSaveQueue … getUserAlarmViewState` 截取片段之外接线**，见 AGENTS 中该约束）：校验长度与频率，调用现有 `engine.submit`；把 `engine.snapshot()` 的 `status/message/result` 投影成有长度上限的纯文本。不得另存任务状态。
3. **原生输入与结果气泡**：输入框可复用 `InteractionInput`；结果气泡文字需有上限与滚动，按 Chrome 回执才显示成功，沿用响铃气泡“没有回执不声称成功”的写法。点“在工作台查看”继续走现有 `open`。
4. **取消**：水母上要有“停止”，映射 `engine.cancel(taskId)`。

直接受益于现有边界：确认卡（自动确认判断、删除/清空必须确认、`unknown` 不重放）、12 轮/12 工具/5 分钟预算、取消与版本检查、本机 AI 网关的开关与额度，**全部原样适用**，因为请求最终走同一个 Engine。

### 风险与开放问题

- **“原生可直接提交文字”的授权语义。** 现在原生端只能对一张已存在、绑定了版本的卡做动作；新增后，原生端（或任何伪造出该进程的本机程序）可以让助手执行“明确的一次性提醒创建”这类**自动确认**动作（见 AGENTS“自动确认判断”）。本机同权限程序本来就能做更多事，所以不是新的信任等级，但应当：只接受 `connectNative` 端口上的消息（Chrome 已保证）、限速限长、记录来源为 `desktop`、**不对原生来源开放任何新的自动放行**，并在技术文档里写明这条决定。是否要求原生来源一律走确认卡，是一个需要你拍板的取舍。
- **语音**：工作台语音靠扩展页面里的麦克风（`voice-live.js`）。原生端要语音就得给 `TimeKeeperDesktop` 申请麦克风权限，并保持“默认关闭、用户主动触发”，现状 AGENTS 明确“没有使用麦克风”。建议 L1 先只做文字。
- **常驻成本**：热键依赖常驻；常驻会让 Service Worker 不休眠。需要在设置页“桌面水母”卡片里把“全局快捷键”作为常驻的子选项，并说明代价。
- **结果展示面积**：助手回答可能很长（表格、候选列表）。气泡只放摘要，完整内容仍回工作台；候选选择沿用已有原生选择卡。
- **工具里依赖页面的部分**：`video.open` 会在扩展内打开页面，Chrome 不在前台时用户看不到——结果气泡要明确写“已在 Chrome 打开”，而不是“已播放/已看”。音乐走 Offscreen，不受影响。
- **Chrome 没运行**：整条链路不成立（Chrome 是执行器）。不要做“水母拉起 Chrome 再执行”，否则要处理 Service Worker 冷启动、扩展未就绪等一整套新边界。

## 五、L2：真正“驱动浏览器”（需要单独决策）

现有助手工具清单（`js/assistant-contract.js`）里没有任何针对任意网页或标签页的工具：没有开关标签、跳转网址、读取页面、点击、填写。想要这些，需要新工具族，而不是水母：

- 权限并非全无基础：`tabs`、`tabGroups`、`scripting`、`sidePanel` 已声明，`bookmarks` 与 `<all_urls>` 是可选权限；但**读页面内容并交给模型**会引入网页内容提示注入（页面里的文字可以写成指令）；点击/填写更要求逐步确认。
- 项目的既有边界：模型生成代码调用业务工具（B 档）仍禁止；任何新工具必须经 Contract 登记、Engine 的副作用标记与回执、预算与取消。
- 最小而安全的起点（若要做）：只读“列出当前窗口标签页（标题+域名）”、“打开网址/切换到某标签页”（有确认或仅限用户明确给出的网址）、复用 `site-workspace` 现有的固定页面与分组服务。这是另一个调研/设计，不建议和 L1 绑在一起做。

## 六、原型验证记录（2026-10-16 傍晚，用户确定要 L1 后）

用户的目标是 **L1：在任意应用里直接有原生的 AI 工作台，不再打开浏览器里的工作台（不要 L0）**。为此在 `/tmp` 里做了隔离原型（用完已删除，没有碰仓库、Chrome、真实扩展或真实任务；键盘事件只在面板确认拿到键盘焦点后才合成发送，避免打进别的应用）。环境：macOS 26（darwin 25.5）、前台应用在 Chrome / DataGrip 之间切换、输入法为腾讯微信输入法拼音（`com.tencent.inputmethod.wetype.pinyin`）。

| 验证项 | 结果 |
|---|---|
| `RegisterEventHotKey` 注册 `Ctrl+Shift+B` | 成功（返回 0）；用 `open` 以独立 App 启动（`AXIsProcessTrusted=false`）同样成功，**不需要辅助功能权限** |
| 全局热键能否收到按键 | 能：用“控制键、Shift、B 逐键按下”的合成序列经 HID / session 两个入口各触发 1 次；只发 B 加标志位或走 annotated 入口不触发。**这是合成按键，不等于真实键盘**，但路径是系统同一套热键派发 |
| 热键唤出 `NSPanel`（`.nonactivatingPanel`、`canBecomeKey`、`.floating`、`canJoinAllSpaces + fullScreenAuxiliary`）后是否成为键盘焦点 | 大多数能：同进程连续 24 次（`activate(ignoringOtherApps:)`、`NSRunningApplication.activate`、临时切 `.regular` 三种写法各 8 次）全部成功，约 90–270 ms；新进程 16+16 次也全部成功。**但早先有 4 次失败**（面板可见，应用未激活，Chrome 仍在前台），发生在新启动进程的第一次按键附近，之后无法复现，原因未定位 |
| 输入框收到输入 | 能，`hi` 进入文本框；输入法是拼音时第一次回车是“确认组字”，第二次回车才触发提交，与普通输入框一致，**面板必须按组字状态处理回车（标准 `NSTextField` 已经如此）** |
| 回车提交 | 能：`control(_:textView:doCommandBy:)` 收到 `insertNewline:`，取到文本并收起面板；这一步在真实实现里就是写出一帧 Native Messaging 消息 |
| `Esc` 取消并归还焦点 | 能：收起面板后用 `NSRunningApplication.activate` 把前台还给原来的应用（DataGrip 测试里恢复成功） |
| 唤出时不切换 Chrome / 不需要浏览器窗口 | 能：整个流程没有任何 Chrome 参与；Chrome 只需是运行的进程 |

没有测的：真实键盘与真实手指节奏；腾讯输入法的候选框与中文整句输入（只用英文字母合成）；全屏 Space / 多显示器 / Stage Manager；焦点失败的真正原因；`nonactivatingPanel` 与辅助功能 / VoiceOver；面板在 Chrome 弹窗、系统安全输入场景下的表现。

### 对方案的影响

1. **L1 的原生端是可行的，没有发现硬阻碍。** 热键、输入、IME、提交、归还焦点这条链路在原型上都通了，所需 API 均为 AppKit / Carbon 公开接口，不需要新增权限。
2. **焦点失败必须当真处理。** 激活后要检查 `isKeyWindow && NSApp.isActive`，过短延迟（约 250 ms）内没拿到就重试一次；仍失败时面板保持可见并提示“点一下输入框”，不能默默吃掉用户的输入。重试方案我只在“本来就不失败”的环境里跑过（32/32），没能在失败场景里验证有效。
3. **“水母常驻”是 L1 的前提。** 热键靠常驻的原生进程；要么常驻，要么 Chrome 启动时拉起（仍不做开机自启，与现有约定一致）。需要在设置页写清“开启后水母和 Service Worker 常驻”的成本。
4. **Chrome 仍是必需的执行器。** 原生工作台只是前端，工具、存储（`chrome.storage`）、Offscreen 音乐、提醒调度都在扩展里。Chrome 不运行时原生输入面板应显示“Chrome 未运行”，而不是静默失败。想让原生端自己直接调本机 AI 服务去执行，会绕开 Engine 的确认、回执、预算与版本边界，**不建议**。
5. **和浏览器里的工作台共用同一个会话。** `AssistantEngine` 只有一个 `current` 任务；原生提交会接上浏览器里正在进行的会话，反之亦然。好处是连续；代价是两处同时操作会遇到“当前任务正在执行，请先停止或等待完成”。需要决定是否允许、怎样提示。
6. **提交接口本身不依赖页面。** `engine.submit` 是异步的，立即返回任务视图，真正的执行在后台继续；`assistant_submit` 只是把 `message.input`（`text`、`app`、`skill`、`taskId`、`version`、`candidateIds`）原样交给它。原生端提交只需要走同一个入口并复用 `Contract.input` 校验。

## 七、建议的推进顺序（更新）

1. **先定三件事（需要你决定）**：①原生来源提交的文字是否也允许“自动确认的一次性提醒创建”，还是一律走确认卡；②原生与浏览器工作台共用同一会话是否接受；③热键默认值（`Ctrl+Shift+B` 会与 Chrome 自带快捷键同时存在，建议原生热键可配置，默认待定）。
2. **做 L1 的最小竖切**（常驻水母 + 热键 + 输入面板 + 提交 + 任务进度/结果气泡 + 现有确认卡复用），协议 v7、旧组件向下兼容。按项目惯例补纯逻辑自测、隔离原生冒烟、`bridge-smoke` 联调与变异检查。
3. 把焦点失败的重试做进原型之后，用真实键盘、中文整句输入、全屏 Space 做人工验收。
4. L2（通用浏览器操控）仍然另立项，不与 L1 绑定。

## 八、没有验证的部分

- 真实键盘按下的全局热键、中文整句输入、候选框；焦点偶发失败的原因：**未验证**。
- 真实 Chrome 156 下原生 → Service Worker → `engine.submit` → 回写水母的整条链路：**没有搭**（原型只验证原生一端；Chrome 端按代码阅读判断可行，现有确认卡的 `reply` 已经走同样的 `Engine.respond → submit` 路径）。
- 全屏 Space、多显示器、Stage Manager、VoiceOver：未验证（与现有水母功能同样的边界）。
- 工作量均为按现有代码结构的推断，不是测量值。

## 九、实现后更正（2026-10-16 晚，L1 实现并隔离验收之后）

L1 已按用户批准的取舍实现，细节与验证结果见 `docs/technical/native-assistant-workbench-20261016.md`。上面各节是实现之前的调研，保留原文；与实现不一致或被实测推翻的地方如下：

1. **“热键被占用时注册会失败、设置页据此提示”这个设想被实测推翻。** 第二节与设计稿都默认 `RegisterEventHotKey` 的 `-9878`（`eventHotKeyExistsErr`）代表“被其他应用占用”。隔离实测（macOS 26.5）：两个进程注册同一组合都返回 0，按下时两个进程都收到；系统保留的组合也返回 0；只有**同一进程**重复注册同一组合才返回 -9878。所以 Carbon 这条路发现不了跨应用冲突，设置页只能承诺“已向系统注册”，并告诉用户“按下后没有反应、或同时触发了别的应用，就换一个组合”；`taken` 状态在实际使用里几乎不可达。与 Chrome 自己的快捷键（`chrome.commands`，非全局）同时设置时会不会都触发，**仍没有验证**。
2. **合成按键的两个细节**（只影响验收脚本）：第二节写的“合成按键处理函数没触发”，在第六节的原型里已经查明是合成方式的问题（要逐键按下）；实现阶段又发现 F1–F19 的合成事件必须带 `.maskSecondaryFn` 才会被热键派发收到，F20、字母、数字、空格反过来，带了就收不到，所以验收用 `⌃⌥⇧⌘F20` / `F19` 这类在任何应用里都不做事的组合。
3. **协议比第四节的草图更小**：没有 `assistantSubmit` / `assistantOpen` 两种事件，合并成一个事件 `assistantAction{action:'submit'|'cancel'|'open'}`；设计稿里的独立 `hotkeyStatus` 事件也没有做，注册结果直接写在 `jelly` 命令的回执里（`assistant:{status}`）。适配层文件是 `js/assistant-native.js`（不是草图里的 `js/jelly-assistant.js`）；设置存在独立的 `desktopAssistantV1`（不是 `desktopJellyV1.assistant`），回滚时不会被旧版本抹掉。
4. **第七节“先定三件事”的结论**：原生来源一律走确认卡（`origin:'desktop'`，不经 pi 自动确认，且只收紧授权）；与浏览器工作台共用同一个 `AssistantEngine` 会话；默认热键 `ctrl+shift+b`，设置页给四个预设、不开放自由录制。
5. **焦点失败**：原型里那 4 次偶发失败的真正原因**仍未定位**。实现了“0.25 秒后核对键盘、只重试一次、仍没有就提示且不吞输入”，并用注入失败的测试开关在隔离验收里验证了重试与提示路径；这只证明处理逻辑有效，不等于找到了偶发失败的原因。这一轮验收还发现了第六节没有想到的一点：如果用户在 0.25 秒内自己切去了别的应用，“没拿到键盘”的判断会把焦点抢回来，已改成“唤出之后拿到过键盘就不再重试”。
6. **仍然没有验证的**：真实 Chrome 156 里的整条链路（隔离联调用的是真实 Engine / 适配层代码加替身）、真实键盘与中文整句输入法候选框、全屏 Space / Stage Manager / 更多种屏幕组合、VoiceOver、资源占用、Chrome 自带快捷键与原生热键同时存在的行为。

## 参考

- Chrome Commands API（含 `global` 与键位限制）：https://developer.chrome.com/docs/extensions/reference/api/commands
- 本仓库：`js/assistant-background.js`（`open` / 授权）、`js/assistant-confirmation.js`（原生交互投影）、`js/alarm-desktop.js`（原生桥）、`desktop-reminder/main.swift`、`desktop-reminder/confirmation-view.swift`、`docs/technical/jellyfish-resident-companion-20261016.md`
