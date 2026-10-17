---
title: 桌面水母独立常驻：与闹钟脱钩、取消胶囊、喝水/起身提醒委托水母（协议 v6）
date: 2026-10-16
status: 已实现，隔离环境验证通过（Chrome 侧业务替身、Swift 纯逻辑自测、独立 Bundle ID 的原生进程冒烟、真实 Chrome 侧模块 ↔ 真实原生进程联调）；真实 Chrome 156、真实账号、重装后的真实组件、多显示器/全屏 Space 未验收
---

# 桌面水母独立常驻（协议 v6）

## 背景与用户决策

2026-10-16 用户看到桌面水母睡着、气泡里只有一个“56:02”的倒计时后提出：

1. 水母应该在**没有闹钟时也存在**，脱离“闹钟倒计时样式”这一个场景，“应用场景更宽广”；**喝水提醒也交给它**。
2. 随后明确：水母**不要和闹钟有绑定关系**，“水母的形态的时候，就把自己的需求委托给水母即可；或者也不要胶囊形态了，有闹钟的时候就交给水母”。
3. 进阶需求“怎么确认我已经喝水了”**只做调研**，不实现（见 `docs/research/research-jellyfish-drink-confirmation-20261016.md`，摄像头从未打开）。

已确认的选择（逐项询问）：

| 问题 | 选择 |
|---|---|
| 水母的生命周期 | **跟随 Chrome**：水母常驻开关打开时由 Chrome 保持与桌面组件的连接，Chrome 退出水母就消失；不做独立开机自启的 LaunchAgent |
| 喝水提醒的呈现 | **水母气泡 + 按钮“喝了 / 10 分钟后”**，水母不在或 3 秒内没有确认显示时退回原来的系统通知 |
| 胶囊去留 | **取消胶囊**：倒计时一律交给水母；未常驻时，倒计时期间水母临时出现 |

## 职责边界（不变量）

- **水母是独立的桌面伙伴，闹钟与提醒都只是“委托方”**。水母的存在由自己的设置决定（常驻开关），倒计时和喝水提醒只是往水母身上放内容；任何委托方消失，水母不因此消失（常驻时）或只在委托期间出现（非常驻时）。
- **Chrome 仍是闹钟、喝水计数、“10 分钟后再提醒”的唯一所有者**。原生端不计时、不计数、不保存业务状态，只保存自己的窗口位置（`UserDefaults` 的 `CompanionX`）。按钮动作回到 Chrome，收到 `nudgeActionResult` / `countdownActionResult` 才显示成功；8 秒没有回执只提示“Chrome 尚未确认”，保留按钮可重试，不声称成功。
- 原生端不判断“你到底喝没喝水”，“喝了”只是你自己点的自报；不使用 `chrome.idle`、摄像头、麦克风、屏幕内容。
- 没有新增扩展权限、网络请求、依赖、Cookie、模型调用。桌面组件仍由 Chrome 经已有的 Native Messaging 连接驱动。
- 与首页水母皮肤（背景体验）互相独立：首页的“夜晚荧光”开关 `jellyfishNight` 不变，桌面水母的夜晚荧光开关改放在**桌面水母自己的设置**里（`desktopJellyV1.night`）。

## 生命周期与样子

| 状态 | 水母何时显示、什么样 |
|---|---|
| 常驻开启、没有倒计时 | Chrome 运行期间一直在：趴在可见区域底边（Dock 上方）**打盹**，夜里带柔和荧光；点它一下醒来约 4 秒，头上冒出“今天的记录 / 下一次提醒”（由 Chrome 算好下发），之后继续打盹。不会自己游来游去 |
| 倒计时进行中 | 常驻与否都显示。离到点还远（`calm`）时同样休息、头上是读数；进入临近 / 紧迫 / 最后 10 秒后醒来游动、颜色随阶段变化 |
| 常驻关闭（默认）、没有倒计时也没有提醒气泡 | 不显示。Chrome 在没有任何委托内容 2 秒后断开连接，组件随连接退出 |
| 喝水 / 起身提醒气泡 | 水母停在游泳线上（不游走，按钮才不会从鼠标下跑掉），气泡带按钮；气泡消失后回到上面的状态 |
| 正在响铃 | **响铃气泡**优先（2026-10-16 同日改：原来的右上角提醒卡片已取消，水母游到鼠标所在屏幕底部正中报时，见 `jelly-ring-alarm-20261016.md`）；喝水/起身气泡被拒绝（Chrome 退回系统通知），倒计时读数让位；响完回到原位并恢复读数 |

- 水母只活动在**水平带**里：当前屏幕可见区域的底边，向两侧游或休息，窗口纵向向上增高来容纳气泡；气泡始终画在水母上方，水平方向夹回可见区域，尾巴指向水母身体。（设计阶段写过“靠近屏幕上沿时气泡改画在下方”，没有实现——水母不会出现在屏幕上沿。）
- 气泡有 5 种内容，优先级：**喝水/起身提醒（带按钮；成功回执与错误都显示在同一个气泡里）> 倒计时操作的反馈（延后/跳过的结果）> 点一下看到的详情 > 倒计时读数 > 无**。（2026-10-16 晚补：到点响铃加入后成为第 6 种，且是最高优先级：**响铃 > 喝水/起身提醒 > …**；所有气泡同时改为随系统浅/深色，见 `jelly-ring-alarm-20261016.md`。）
- 右键菜单（条目随状态变化，均交回 Chrome 执行）：倒计时进行中有“接下来”（最多 5 条，只读）、“延后 5 分钟”、“跳过本次 → 确认跳过这一次提醒”（离到点 ≤10 秒、缺少 `alarmId`/`revision`、响铃中不提供）、“在 Chrome 中打开闹钟中心”、“隐藏倒计时（不取消闹钟）”；没有倒计时时列出“今天的记录”几行（只读）；提醒气泡存在时有“收起提醒气泡”；常驻时有“收起水母”。
- 常驻由 Chrome 端 `AlarmDesktop.setResident(true)` 保持连接（不做 2 秒空闲断开）；连接被对端关闭（组件崩溃、被系统结束）时按 2 / 5 / 15 / 60 / 300 秒的**有界退避**重连，仍失败就停止并在设置页显示原因，不无限重试；重连成功后退避计数清零。用户从状态栏菜单“退出桌面组件”时原生先发 `componentQuit`，Chrome 把它视为“不再常驻”并保存、不再自动拉起，直到用户下次改设置。
- Service Worker 休眠重启后由 `restore()` 在启动时按设置重新建立连接；重连成功后重新下发当前倒计时（`AlarmCountdown.sync()`）与水母状态。
- 右键菜单“收起水母”由原生发 `jellySetting {resident:false}`，Chrome 校验后写入设置；原生要等 Chrome 推来新状态才会消失（原生不替 Chrome 改设置，也不能把常驻打开）。

## 设置与迁移

- 新存储键 `desktopJellyV1`（`chrome.storage.local`）：`{ resident: boolean, night: boolean }`；只有明确的 `true` 才常驻，只有明确的 `false` 才关闭夜晚荧光（缺省开）。
- `userAlarmCountdownV1` 只剩 `enabled`（是否把倒计时交给水母，原闹钟中心的“桌面倒计时”）。`style` 不再使用，旧值被忽略。`night` 迁移：`desktopJellyV1.night` 缺失时沿用 `userAlarmCountdownV1.night`，之后只读新键。
- 设置页新增“桌面水母”卡片，经消息 `jelly_desktop_get` / `jelly_desktop_set` 读写（后台校验 `sender.id` 与扩展页面来源，只接受两个布尔字段），不直接写存储；闹钟中心只保留“桌面倒计时”勾选和“发送测试”。

## 协议 v6（旧组件忽略新字段）

Chrome → 原生（均带 `requestId`，回执 `type:"response"`，`version:6`）：

| 命令 | 字段 | 说明 |
|---|---|---|
| `jelly` | `jelly:{ resident, night, lines[≤3,各≤40字], linesUntil(ms) }` | 水母自身状态；每次新连接都会先下发；`lines` 是 Chrome 算好的“今天的记录/下一次提醒”，过了 `linesUntil` 原生不再显示 |
| `countdown` | `timer:{ id,title,fireAt,count,alarmId,revision,canAct,delayed,items[≤5] } \| null` | 同 v5，去掉 `style`、`night`、`startAt`；原生忽略未知字段 |
| `nudge` | `nudge:{ id, kind:"water"\|"stretch", title≤24, text≤120, buttons[1..2]:{ id:"done"\|"snooze", title≤12 }, ttl(秒,10–180) }` | 气泡提醒；校验失败或响铃中返回 `ok:false`，Chrome 退回系统通知 |
| `nudgeClear` | `id` | 迟到或被替换的气泡由 Chrome 清除；不匹配当前 `id` 则忽略 |
| `nudgeActionResult` | `id, actionId, ok, text\|error` | 回执，成功才在气泡里显示“记下啦，今天第 N 次”并在约 2.4 秒后收起；失败保留按钮 |
| `countdownActionResult` | 同 v5 | |

原生 → Chrome：

| 事件 | 字段 | 校验 |
|---|---|---|
| `nudgeAction` | `id, actionId, action:"done"\|"snooze"` | 绑定当前连接与当前气泡 `id`（Chrome 只处理 `jelly-nudge-<kind>-<毫秒>` 形式的 id，原生对 `id` 只要求非空且 ≤200 字符并原样回传）；`actionId` 幂等（回执丢失重发只补回执，不重复计数）；失败不进入幂等缓存，可重试 |
| `nudgeHidden` | `id` | 气泡结束（超时、被“收起提醒气泡”、成功回执显示完毕）时发；Chrome 据此清 `nudgeId` 并放开空闲连接，另有按 ttl+8 秒的兜底计时 |
| `jellySetting` | `resident:false` | 只接受“收起”，不能由原生打开常驻 |
| `componentQuit` | — | 状态栏“退出桌面组件”在结束进程前发出；之后的断开按“用户退出”处理，不自动重连 |
| `countdownAction` / `countdownHidden` | 同 v5 | `countdownStyle` 已删除，旧组件发来的会被忽略 |

`ping`/`response` 的诊断字段（仅隔离验收用，不含闹钟之外的数据）：`jellyVisible / jellyResident / jellyNight / jellyLines / jellyBubble / nudgeId / nudgeBusy / nudgeButtons`，并保留 v5 的 `countdownVisible / countdownText / countdownTitle / countdownFrame / countdownWindowNumber / countdownStage / countdownNight / countdownReduceMotion / countdownMenu` 供原有冒烟脚本使用（含义是“水母窗口当前显示的倒计时”）。

测试钩子：命令 `menuItem {title}` 按完整标题触发水母右键菜单或状态栏菜单的条目（走与点选相同的 `sendAction`），**只有环境变量 `TIMEKEEPER_TEST_HOOKS=1` 时才可用，正式运行恒回 `ok:false`**；只用于隔离验收（状态栏“退出桌面组件”无法由合成鼠标可靠点到）。`TIMEKEEPER_NIGHT_HOUR`、`TIMEKEEPER_REDUCE_MOTION` 同为仅测试用。

## 喝水 / 起身提醒委托水母

1. `chrome.alarms` 触发后 `JellyNudge.fire` 仍按原规则判断开关、时段、工作日；通过后**先**尝试 `presenter.present(nudge)`（`JellyDesktop`），在 3 秒内收到原生 `ok` 才算“水母接手”（`AlarmDesktop.showNudge` 默认等 3 秒；`JellyNudge` 另有 4 秒的 `presenter` 总上限作兜底，免得堵住串行队列），此时**不再弹系统通知**。
2. 水母不在、未安装/组件过旧、校验失败、响铃中、3 秒内没确认、连接异常，都退回原有的系统通知（含“喝了 / 10 分钟后再提醒”按钮），并先向原生发 `nudgeClear`，避免迟到的气泡与通知同时出现；Chrome 一侧此时已清掉 `nudgeId`，晚到的 `nudgeAction` 会因“这条提醒已失效”被拒。
3. 气泡上的按钮发 `nudgeAction`；Chrome 经 `JellyNudge.act(id, action)`：`done` → 今天的计数 +1（封顶 999，只保留今天），`snooze` → 再约一次 10 分钟的一次性闹钟（该类已关则不约，仍回“好的”）。回执文案由 Chrome 给出，原生只显示。没有明确 `ok:true` 的结果一律按失败回报。
4. 气泡 `ttl`（默认 90 秒）内没人理就自行收起，**原生不计时也不计数**，不算喝了也不改计数。
5. 点击水母显示的“今天喝了 N 次水 / 今天起身 N 次 / 下次喝水提醒 14:30”由 Chrome 的 `JellyNudge.summary()` 算好后随 `jelly` 命令下发；计数变化、设置变化、通知按钮后都会重新下发，到了 `linesUntil`（下一次提醒时间或本地午夜，取早者）原生不再显示。

## 取消胶囊带来的变化

- 删除 `countdown-view.swift`（胶囊、进度环、悬停按钮、迷你/小巧/标准/舒展尺寸、拖拽缩放、样式切换）。倒计时的“延后 5 分钟 / 跳过本次 / 打开闹钟中心 / 隐藏倒计时”改在水母的右键菜单里，规则与 v5 相同（同秒多条、缺少标识、最后 10 秒、响铃中不提供延后/跳过），动作仍经 `countdownAction`，Chrome 校验 occurrence / `alarmId` / `revision` 后由 `AlarmCountdown.applyAction` 串行执行。
- 倒计时的阶段（平静 → 临近 → 紧迫 → 最后 10 秒）由水母的姿态、颜色和气泡文字表达，不再有进度环；`CountdownModel.ringFraction / isCompact` 已删除。
- 旧 v5 组件仍然存在时，Chrome 发的倒计时没有 `style` 字段，旧组件按缺省样式显示胶囊；水母相关功能需要更新并重装组件（`node desktop-reminder/build.mjs --extension-id=<id> --install`）后重载扩展，设置页会提示“组件版本过旧”。
- 已删除、不再有的能力：胶囊悬停的“+5 分钟 / 跳过 / 编辑”按钮、进度环、迷你/标准/舒展尺寸、拖拽缩放。倒计时操作只剩右键菜单。
- **回滚与恢复边界**：被删除的 v5 胶囊源码（`countdown-view.swift`、`countdown-companion.swift`、`countdown-controller.swift` 及其冒烟脚本）当时都是**未提交**状态，git `HEAD` 里的 `countdown-view.swift` 只是 2026-09-19 的更早版本，v5 的 Chrome 侧代码也已被 v6 就地替换，所以**无法用 git 回到 v5**；游动的水母逻辑已并入 `jelly-companion/jelly-swim`。唯一留下的 v5 实物是升级前真实安装的组件二进制，已另存在 `~/Library/Caches/chrome-time-background/desktop-component-backup/TimeKeeperDesktop-v5-20261016.app`（仓库之外，仅二进制，供参照，配套的 Chrome 侧 v5 代码已不存在）。想要回到胶囊需要重写，不是一次回退。

## 复用与自有范围

- **复用本仓库已有能力**：Native Messaging 连接及其唯一所有者 `AlarmDesktop`；延后/跳过的唯一执行入口 `AlarmCountdown.applyAction` 与串行写队列 `userAlarmSaveQueue`；调度与“已处理 occurrence”规则 `AlarmCore`；喝水/起身提醒的开关、时段、计数和系统通知回退 `JellyNudge`；原生端的材质遮罩 `glass-view.swift`、夜晚曲线与光晕几何 `countdown-model.swift`、游动物理 `jelly-swim.swift`。
- **自有的薄适配层**：`JellyDesktop`（设置、连接策略、重连退避、`presenter`）、协议 v6 的 `jelly/nudge/nudgeClear/nudgeActionResult` 命令与 `nudgeAction/nudgeHidden/jellySetting/componentQuit` 事件、`jelly-model/jelly-companion/jelly-controller`（水母的气泡、按钮与菜单）。
- **没有上游 SDK 可复用**：本功能不涉及模型调用、网络或第三方库（pi、DSH 等与它无关）；Chrome 的 `runtime.connectNative` 与 macOS AppKit 是仅有的平台接口，没有新增依赖，也没有引入锁文件变化。

## Chrome 侧改动

- `js/jelly-desktop.js`（新）：水母设置、连接策略、重连退避、`presenter`（对 `JellyNudge` 的薄适配）。
- `js/alarm-desktop.js`：`setResident`、`setJelly`、`showNudge`（带 3 秒上限）、`clearNudge`、`handleNudgeAction`、`onPortLost`（含 `quit`）、`onConnected`、`onJellySetting`；删除 `onCountdownStyle` 与 `countdownStyle` 处理。
- `js/jelly-nudge.js`：`presenter`、`act`、`summary`（`describe` / `nextDue` 为纯函数）、`onChange`；原有通知路径与按钮逻辑保持。
- `js/alarm-countdown.js`：去掉 `style`、`night` 与相关方法。
- `js/background.js`：`importScripts('jelly-desktop.js')`、创建 `jellyDesktop`、`jelly_desktop_get/set` 消息（校验来源）、启动 `restore()`；写入点在 `userAlarmSaveQueue` 之后，不引用 `stopUserAlarmSession` 截取片段内的任何新全局（`test/jelly-desktop-integration.test.js` 守住）。
- 常驻的端口开着，Service Worker 因此不会被浏览器回收（Native Messaging 长连接的已知行为）；这是常驻开关默认关闭的理由之一，设置页说明已写明“水母只跟随 Chrome”。

## 原生侧改动

- 文件：`countdown-model.swift`（阶段/读数/夜晚曲线/光晕几何，纯逻辑）、`jelly-model.swift`（`parseState/parseNudge` 校验与清洗、`shouldShow`、`bubbleKind`、`tickInterval`，纯逻辑）、`jelly-swim.swift`（游动物理，纯逻辑）、`glass-view.swift`（原 `GlassView`）、`jelly-companion.swift`（窗口、绘制、气泡版式与按钮命中）、`jelly-controller.swift`（把 Chrome 的内容拼成气泡，把操作交回 Chrome）、`confirmation-view.swift`、`main.swift`（只接线、协议与回执）。三个纯逻辑文件不依赖 AppKit，由 `companion-selftest.swift` 单独编译运行；新增源文件须同步 `build.mjs` 清单与 `test/desktop-companion-logic.test.mjs`。
- 窗口：气泡把窗口撑大，窗口底边不动、向上增高，水平夹回可见区域；气泡到窗口边缘的最小距离 `edge = 14` 点——气泡阴影（模糊半径 5）必须在窗口边缘之前衰减完，验收脚本核对窗口最外 8 点 alpha ≤ 1。气泡按钮是自绘命中区，不抢焦点。
- 夜晚荧光曲线、光晕半径、透明边缘约束沿用 `docs/technical/jellyfish-night-glow-celebrate-20261015.md`；“减少动态效果”下水母静止、气泡无动画。
- 文字排版教训：气泡里的中文正文第一版只画出一行并留下空白——**测量与绘制必须用同一套选项和同一个行高**（CJK 回退字体的行高比拉丁字体多 1 点：14 对 13，`.usesFontLeading` 又会改变结果）。现在 `JellyBubbleLayout` 用真实排版测一次“国”得到行高，测量与绘制共用，绘制矩形向下多留 3 点余量；4 行截断由截图核对。

## 验证

分层报告，互相不替代：

**静态检查**
- `node --check` 全部改动的 `js/*.js`、测试与脚本；`git diff --check`；`xcrun swiftc` 编译全部原生源文件（含 ad-hoc 签名）均通过。

**业务替身测试（真实模块代码 + 替身存储/连接/计时器）**
- Chrome 侧：`test/jelly-desktop.test.js`、`test/jelly-desktop-integration.test.js`、`test/jelly-nudge.test.js`、`test/jelly-nudge-integration.test.js`、`test/alarm-desktop.test.js`、`test/alarm-countdown.test.js`、`test/alarm-clock-contract.test.js`，覆盖设置规范化与迁移、常驻连接、有界重连、`componentQuit`、气泡委托与 3 秒退回、按钮动作幂等与绑定、`nudgeHidden`、过期、权限边界、文案、版本钉子等。
- **变异检查**（41 个：`AlarmDesktop` 16、`JellyDesktop` 15、`JellyNudge` 10，在内存里改一处、跑上述测试、立即还原并校验 sha256）：首轮抓到 35 个，存活 6 个——① 3 秒上限的断言用 `/timeoutMs = 3000/` 匹配源码文字，`30000` 也匹配；② 动作结果缺少明确 `ok:true` 时仍回成功；③ 气泡兜底过期的默认公式没有被钉住；④ 退出组件后连接层仍按常驻处理（原测试里 `desktop.resident` 一开始就是 `false`，断言是空的）；⑤ 重连成功后退避计数不清零；⑥ 呈现超时被放宽 1000 倍时测试只是变慢而不失败。已逐个补测试（按真正登记的计时器核对、弱结果集、公式表、先恢复常驻再退出、恢复后再掉线重新从 2 秒开始、耗时上限），6 个全部被抓到，最终 41/41。
- Swift 纯逻辑自测 126 项通过（由 `test/desktop-companion-logic.test.mjs` 编译并运行，同时断言删除的胶囊文件/符号不再出现、`version: 6`、`componentQuit` 在结束进程之前发出）。**Swift 变异检查** 24 个（在临时副本里改、不碰仓库）：首轮抓到 21 个，存活 3 个——`S13` / `S14`（动作与类别白名单被悄悄放宽到近似写法）补了近似写法拒绝的检查后被抓到；`S11`（允许 3 个按钮）是等价变异体：按钮 id 必须唯一且只有 `done`/`snooze` 两种，第三个按钮永远过不了校验，保留为纵深防御。
- 全量 `node --test test/*.test.js test/*.test.mjs`：见下文“最终全量结果”。

**隔离原生进程（独立 Bundle ID `com.timekeeper.desktop.qa`，不碰真实组件的窗口记忆；只用 `screencapture -l <自家窗口号>`，不做整屏/区域截图）**
- `desktop-reminder/jelly-smoke.mjs`（真实合成鼠标）：协议字段、常驻与临时出现、记录过期、倒计时委托、菜单、阶段、夜晚光晕与气泡窗口边缘 alpha、提醒按钮（回执才收起、失败可重试、8 秒无回执提示、重复点击只发一次）、倒计时动作等待回执期间重复点选与不匹配的回执都不会重复提交、点击、拖动、减少动态效果。
- `countdown-smoke.mjs`、`confirmation-smoke.mjs`、`interaction-smoke.mjs`：倒计时读数、外部确认、选择与输入（旧协议路径不受影响）。
- `desktop-reminder/bridge-smoke.mjs`：**真实的 `JellyDesktop` / `JellyNudge` / `AlarmDesktop` / `AlarmCountdown` / `AlarmCore` 经 `connectNative` 垫片连到真实原生进程**（`chrome.alarms`/`notifications`/存储仍是替身）：常驻水母显示 Chrome 算好的记录；提醒由气泡承载且没有系统通知；点“喝了”→ 计数 +1 → 回执 → 气泡收起 → 记录刷新一次；点“10 分钟后”→ 一次性闹钟；倒计时委托（延后 +5 分钟、打开闹钟中心、跳过后水母读数更新，被跳过的那一次不会再出现，新增闹钟后倒计时回来，隐藏只改显示开关）；`SIGKILL` 后有界重连并重新下发状态；状态栏退出 → `componentQuit` → 保存不再常驻且不重连；没有常驻时提醒临时出现、结束后进程约 2 秒退出。
- **原生 AppKit 层变异检查**（17 个，在 `/tmp/dr-mut` 的副本里改 `jelly-controller.swift` / `main.swift`、构建独立 QA 组件后跑 `jelly-smoke.mjs`（退出类的一个跑 `bridge-smoke.mjs`），不碰仓库）：提醒回执不核对 `actionId`、`ok:false` 当成功、无回执恢复时间放宽 100 倍、气泡结束不发 `nudgeHidden`、`nudgeClear` 不核对 id、`showNudge` 总返回 `false`、“收起水母”发 `resident:true`、隐藏倒计时不通知、“延后 5 分钟”发成 50 分钟、倒计时反馈永不消失、退出不发 `componentQuit`、测试钩子不要求环境变量、回执版本号写错、倒计时回执不核对 `actionId`，外加提醒按钮重复点击保护的三个变体。首轮 15 个抓到 13 个，存活 2 个：
  - `M15`（倒计时回执不核对 `actionId`）是冒烟的真缺口：过期回执之后只断言气泡仍属 `note` 类，而错误反馈同样是 `note`，区分不出来；补了“不匹配的回执之后再点‘延后 5 分钟’仍不得发出第二个动作”后被抓到。
  - `M1`（控制器里的重复点击保护）存活，进一步实验说明有**两层互相冗余的保护**：等待回执时气泡按钮被禁用（`NSButton.isEnabled`），控制器自己再检查 `nudgePending`。只拿掉任意一层（`M1`、`M1c`）冒烟都抓不到，两层一起拿掉（`M1b`）被“等待回执期间再点不重复提交”抓到——所以重复提交确实被测试覆盖，单层是纵深防御而不是缺口。
  最终 17 个里 15 个被抓到，2 个单层变体存活（上述冗余）。没有做变异的部分：`jelly-companion.swift` 的绘制与气泡版式靠真实窗口截图判断；窗口边缘 alpha 的检查是开发中被真实的 `edge = 12` 失败抓到的（见下），没有另做变异。
- 视觉判断来自真实窗口截图（常驻白天/夜晚、提醒、处理中、完成、出错、无回执、详情、各倒计时阶段）。

**未验收（不得写成通过）**：真实 Chrome 156 里的 Native Messaging 常驻连接与 Service Worker 休眠重建、真实 `chrome.alarms` 与真实系统通知并存/回退、真实账号、重装后的真实组件、多显示器与全屏 Space、状态栏“退出桌面组件”的真实点击（只经测试钩子触发同一菜单动作）、亮色壁纸叠加下的观感。

## 最终全量结果

- **静态**：`node --check` 对 76 个改动/新增的 JS/MJS 文件全部通过；`git diff --check` 通过（已跟踪文件），未跟踪的新文件另用 `rg '[ \t]+$'` 扫描没有行尾空白；`build.mjs` 经 `xcrun swiftc` 编译全部原生源文件并 ad-hoc 签名通过。代码与测试里除了断言“这些文件/符号已不存在”的合同测试，没有对已删除的胶囊文件与符号（`countdown-view.swift`、`CountdownController`、`countdownStyle`、`countdown-companion-smoke.mjs` 等）的引用；文档里只在“历史 / 已取代”说明中出现。
- **全量业务替身测试**：`node --test --test-force-exit --test-timeout=120000 test/*.test.js test/*.test.mjs`，**2333 项，通过 2333，失败 0**（19 秒）。此前一次全量运行出过两个与本功能无关的问题：`test/background-provider-swr.test.js` 单文件卡住（186 秒后失败）、`test/huya-follow.test.js` 的“页面跳转到其他地址时报告 huya-redirected”一项失败。当时机器正同时跑别的重负载；这两个文件及其被测源码都没有改动，单独运行均通过，最终这一次整体运行也没有复现。它们是否偶发地依赖机器负载，没有进一步定位。
- **Swift 纯逻辑自测** 126 项通过；**隔离原生冒烟**（用当前仓库源码重建的 QA 组件）全部通过：`jelly-smoke`（含合成真实鼠标）、`countdown-smoke`、`confirmation-smoke`、`interaction-smoke`，`bridge-smoke` 连续 3 次通过。
- 层级说明：以上是静态检查、业务替身测试、隔离原生进程、真实 Chrome 侧模块 ↔ 真实原生进程四个层级；**没有一项是真实 Chrome 156、真实账号或重装后的真实组件**，不得互相替代。

## 实现中发现并修掉的问题

- 气泡正文被截成一行并留空白：测量与绘制行高不一致（见上“文字排版教训”）。
- 气泡窗口边缘 alpha 超标：先加 `edge = 12`，之后冒烟里又测到 1–2（最里一列的阴影尾巴），改为 14；该检查曾把“光晕被窗口边缘截成方框”的真机反馈固化为断言。
- 测试钩子点到带子菜单的条目崩溃（`submenuAction:` 控制器不响应）：跳过子菜单入口并检查 `responds(to:)`。
- 倒计时操作等待回执期间重复点选，会误显示“不支持”：改为静默忽略重复点选。
- 联调脚本里“跳过后重新启用同一个闹钟”倒计时不回来：不是产品缺陷——被跳过的那一次已在运行时记为已处理，`AlarmCore.nextDispatch` 按设计不会再调度它；测试改为新增一个闹钟。
- 冒烟缺口（变异检查发现）：倒计时回执不核对 `actionId` 的变异原本没有被抓到——过期回执之后只断言气泡仍属 `note` 类，错误反馈同样是 `note`；补了“不匹配的回执不能解除等待、再点‘延后’不得发出第二个动作”的断言。
- 间歇性：`screencapture -l` 三十多次里失败过 1 次，冒烟脚本里带一次重试；合成鼠标可能与真实鼠标输入冲突，运行冒烟时不要同时操作鼠标。

## 仍然存在的边界

- 真实 Chrome 156 里的 Native Messaging 常驻连接、Service Worker 休眠后重建、真实通知并存/回退、真实账号、重装后的真实组件、多显示器与全屏 Space 均未验收。
- 记录文字的有效期到下一次提醒或本地午夜（取早者），**Chrome 不会在午夜主动推一次新记录**：过期后水母点击只显示“我在这儿～”，直到下一次计数变化、设置变化或重连才刷新。
- 常驻连接让 Service Worker 一直存活，会比不常驻多占一点资源；这是默认关闭的理由之一。
- “怎么确认喝了水”只做了调研，结论是只有“看到你举杯”可以如实声称，摄像头必须是独立应用、默认关闭、用户主动触发；本次没有实现，也没有打开过摄像头。
- 桌面水母不读取键鼠空闲时间；如果之后要做“离开后回来提醒喝水”，需要单独评审（调研文档 §4.2）。
- 旧 v5 组件仍显示胶囊；更新组件前设置页会提示版本过旧。
