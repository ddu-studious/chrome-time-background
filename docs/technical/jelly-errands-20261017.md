---
title: 水母差事：桌面水母主动开口（第 1–3 期）
date: 2026-10-17
status: 第 1 期（协议 v8）、第 2 期（协议 v9：推荐歌曲、右键菜单“水母，给我…”）与第 3 期（协议 v10：白天清醒、巡游、按时段性格、小动作、完整睡眠规则）已实现，默认关闭（第 3 期的“让水母活动起来”在差事开启后默认开）；Chrome 侧业务替身测试、Swift 纯逻辑自测、独立 Bundle ID 的原生进程冒烟、真实 Chrome 侧模块 ↔ 真实原生进程联调通过，变异检查已做并逐个说明；真实 Chrome 156、真实网易云账号、真实播放、真实通知并存、真实闹钟到点、多显示器组合、全屏 Space、VoiceOver 未验收
---

# 水母差事（第 1–3 期）

设计稿：`docs/superpowers/specs/2026-10-17-jelly-errands-design.md`；实现计划：`docs/superpowers/plans/2026-10-17-jelly-errands-phase1.md`（第 1 期）、`docs/superpowers/plans/2026-10-17-jelly-errands-phase2.md`（第 2 期）、`docs/superpowers/plans/2026-10-17-jelly-errands-phase3.md`（第 3 期）。**本文前半部分是第 1 期（协议 v8）的记录，第 2 期（协议 v9）与第 3 期（协议 v10）见文末对应章节**；三期共用同一套调度、状态与气泡管线（第 3 期的行为纯属水母自己的动作，不经调度器）。

## 背景与用户决策

用户觉得桌面水母“太懒”，大部分时间都在睡觉，要求设计一套让它**主动、有能动性**的能力（推荐歌曲、提醒今天的工作日志、提醒未完成任务、随机发点小东西、活动活动）。逐项确认：

| 问题 | 决策 |
|---|---|
| 主动到什么程度 | **B 档**：水母可以自己开口、自己轮播低风险内容；**放歌、改数据永远要用户点一下** |
| 默认活跃度 | 适中，每小时最多 4 条（安静 2、忙碌 8） |
| 任务名 | 默认只说数量；显示任务名要单独打开（气泡会盖在任何应用上，包括屏幕共享） |
| 不在电脑前 | 用**系统空闲时间**判断，用户离开时不吐泡泡，回来后再说 |

## 范围

**本期做**（Phase 1）：晨间概览、过期任务、工作日志、小乐子四类差事；调度器；presence 事件；设置页卡片；开口前先游到你所在的屏幕。

**第 1 期不做**：推荐歌曲与右键“水母，给我…”菜单（已在第 2 期完成，见文末）；巡游与按时段性格（已在第 3 期完成，见文末）；自己放歌、自己改任务（用户明确不要，第 2 期的“播放”也只在用户点按钮时才放）。

## 设计修订（相对设计稿，以实现为准）

1. **没有新增 `errand` 命令，复用 `nudge`**：差事只是新的气泡类别 `brief/task/worklog/tidbit`，沿用喝水/起身气泡的窗口、`nudgeAction/nudgeActionResult` 回执、`nudgeHandled` 幂等表和 8 秒无回执提示。旧组件（≤v7）校验不认这些类别会回 `ok:false`，Chrome 照旧退回系统通知，不需要额外的版本分支。
2. **`offer(kind)`：五个已有的系统通知发送器先问水母**（每日摘要、过期任务、下班工作日志、工作日志智能检查、温情提示）。水母接手（原生回 `shown:true`）才跳过系统通知；其余任何情况——差事关闭、该类关闭、水母没常驻/没连上/组件太旧、用户不在电脑前、被响铃占着、没内容、水母 4 秒内没确认、任何异常——都返回 `handled:false`，调用方原样发系统通知。**所以开启差事不会让提醒变少。** `offer` 不检查时段、最小间隔和每小时条数（那是系统通知自己的触发时机，不能被气泡节奏吞掉），但展示后占用间隔与条数并记内容指纹，紧接着的定时评估不会再发同一条。过期任务与日志检查的“已提醒”标记无论走哪条路径都照常写入。
3. **`errandsReady()`（设计稿 §5 条件 1）**：差事只在“水母常驻 + 连接在 + 组件协议 ≥ v8”时可用。不为了弹一个气泡去启动组件，也不对旧组件发它不认识的类别。`JellyDesktop.errandsReady` 提供，控制器的定时评估与 `offer` 都先查。
4. **开口前先游过来**：差事气泡在水母到达鼠标所在屏幕之后才出现；水母已经在这块屏幕上则原地开口。4 秒兜底、`nudgeToken` 使被替换/被撤/被响铃接管/被用户抓走时迟到的“到位”回调失效。到位之前按钮不可点（`pressNudge` 钩子同样受限）。喝水/起身保持原来的立即出现。

## 架构与职责

**Chrome 仍是唯一调度器与执行器，原生端只显示与转发、不保存业务状态。** 第 1 期的差事按钮只**打开页面**（任务/概览开新标签页，日志先写 `pendingAction` 标记再开页），不改任务、不写日志、不放歌（第 2 期歌曲气泡的“播放”是唯一例外，由用户点击触发，见文末）。

| 单元 | 职责 |
|---|---|
| `js/jelly-errands-core.js`（新，UMD 纯逻辑） | 类别表与按钮白名单（`KINDS`，与 Swift 有同一份）、紧急度、最小间隔 15 分钟、每小时预算、刚回来等待 20 秒、连续 2 次拒绝当天静默该类、时段/工作日、任务统计、日志缺口（12/15/17 点检查点沿用现有期望值）、选择与去重、文案清洗；不碰 `Date`、存储与 DOM |
| `js/jelly-errands.js`（新，控制器） | 读数据源、`chrome.alarms` 评估（`jelly-errands-tick`，每 5 分钟，首次 1 分钟后）、经 presenter 交给水母、处理按钮动作与气泡自行消失、`offer`、`noteExternal`；状态 `jellyErrandsStateV1`（local，只有当天，换日清零）、设置 `jellyErrandsV1`（sync） |
| `js/jelly-nudge.js` | 新增 `onSent` 回调：喝水/起身发出后让差事让出最小间隔与每小时条数 |
| `js/jelly-desktop.js` | `errandsReady()` |
| `js/alarm-desktop.js` | 按 id 前缀 `jelly-errand-` 把按钮动作分流给差事（独立白名单 `open/later/dismiss/more`，喝水仍是 `done/snooze`）；`presence` 与 `nudgeHidden` 转交回调 |
| `js/background.js`、`js/settings-page.js`、`settings.html` | 接线、`jelly_errands_get/set`（校验 `sender.id/url`）、设置页“水母差事”卡片（脚本版本钉子 `settings-page.js?v=11`） |
| `desktop-reminder/jelly-model.swift`、`jelly-controller.swift`、`main.swift` | 协议 v8：类别与按钮白名单、主按钮、presence 采样与两态判定、先游过来再开口 |

没有新增 Swift 源文件，所以 `build.mjs` 清单与 `test/desktop-companion-logic.test.mjs` 的清单合同不变。

### 调度器放行顺序

`关闭 → 时段/工作日 → 离开 → 刚回来（<20 秒）→ 被占用（响铃/确认卡）→ 间隔（<15 分钟）→ 预算（滚动一小时）`；通过后过滤已静默类别、已展示指纹与（已做过概览的）brief，按紧急度降序、同级取最久没展示的。紧急度：任务 4、日志 3、概览 2、小乐子 1。晨间概览只在 6:00–11:59 且一天一次。“再来一条”（小乐子）是用户主动要的内容：跳过放行条件、不占间隔与条数，只限定小乐子类。

### 协议 v8

- `nudge` 的 `kind` 增加 `brief/task/worklog/tidbit`；按钮 id 按类别限定（brief/task/worklog：`open`/`later`；tidbit：`more`/`dismiss`；water/stretch：`done`/`snooze`）；主按钮（实心高亮）：喝水/起身 `done`，brief/task/worklog `open`，tidbit `more`。**这份表在 JS（`JellyErrandsCore.KINDS`）与 Swift（`JellyModel.nudgeButtonRules` / `primaryNudgeButton`）各有一份，`test/desktop-companion-logic.test.mjs` 逐类逐按钮对照，改一边必须改另一边。**
- 新事件 `presence {state:'active'|'away'}`：原生只在常驻时每 15 秒采样一次，**只在变化时上报**，不带秒数；阈值 300 秒；首次采样（含重新常驻后）一定上报一次，Chrome 以此得到初始状态；不常驻就不采样、不上报、忘掉上一次的结果。
- 原生回执版本 8；旧组件忽略新字段。`ping` 增加诊断字段 `nudgeArriving` 与 `presence`；测试钩子 `nudgeButton` 与 `TIMEKEEPER_IDLE_SECONDS` 只在 `TIMEKEEPER_TEST_HOOKS=1` 时可用。

## 系统空闲时间：与既有原则的差别（必须记住）

项目原有原则是“不使用 `chrome.idle`、不读活动状态”（理由：无法知道人是否坐着，且要新增权限）。**差事第一次在原生端读取系统空闲秒数**，这是新的读取点：

- API：`CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: UInt32.max))`（CoreGraphics 公共 API，“任意输入事件”）。只读时间，**不读按了什么**。
- 本机（macOS 26.5）实测：不弹任何权限提示；读数与 `ioreg -c IOHIDSystem` 的 `HIDIdleTime` 一致（`/tmp/tk-errands/idle.mjs` 对照）。**没有**检查过其他 macOS 版本是否同样不需要权限。
- 只上报 `active/away` 两态，不上报秒数；Chrome 侧不读空闲（没有 `chrome.idle`，`manifest.json` 无新增权限，`test/jelly-errands-integration.test.js` 守住）。
- 读不到、负数、非有限值都按 `active`：读不出时间不能让水母一直沉默，也不能乱报“离开”。
- “离开”只代表**键鼠没动 5 分钟**，不等于人真的走开（看视频、开会、阅读都会被判离开）；没有摄像头、没有麦克风。

## 隐私与安全边界

- 默认关闭；任务名默认不显示（只说数量）；文字经 `clean`（去控制字符与方向控制符，标题 ≤24、正文 ≤120、任务名 ≤12 字后加“…”）。
- 日志只写固定类别（`system` 下的 `jelly-errands:shown/declined/open/later/dismiss/more`），不写任务名与正文。
- 没有新增权限、网络请求、模型调用、依赖。差事不写任何业务数据，只写自己的当天状态与设置。
- `jelly_errands_get/set` 只接受本扩展页面；动作按钮只认本类别白名单，其余当作失效；同一个 `id` 的重复动作与“气泡自行消失”只记一次（`acted`）。
- 过期任务的“明天再说”当天静默该类；连续 2 次拒绝（点“稍后”或气泡自己消失）同样静默该类，次日清零。

## 验证（分层报告）

**静态检查**：改动脚本均 `node --check`；`git diff --check`；一行安全自查见交付说明。

**业务替身测试（Node）**：新增 `test/jelly-errands-core.test.js`、`test/jelly-errands.test.js`、`test/jelly-errands-integration.test.js`，并扩展 `alarm-desktop`、`desktop-companion-logic`、`jelly-nudge`、`jelly-desktop` 及三个脚本版本钉子测试。全量 `node --test --test-force-exit test/*.test.js test/*.test.mjs`：见文末“最终结果”。

**Swift 纯逻辑**：`companion-selftest.swift` 增 v8 差事与 presence 块（含期望表独立于被测规则表的逐按钮核对），并与 JS 逐项对照类别与按钮。

**隔离原生冒烟**（独立 Bundle ID `com.timekeeper.desktop.qa`，不碰真实组件，不连接 Chrome；运行期间不碰键鼠）：`jelly-smoke.mjs` 新增阶段 P（presence：阈值 299/300 秒边界、只在变化时上报、不常驻不上报、不常驻只靠倒计时临时出现不上报、测试钩子关闭时忽略注入的空闲秒数）与阶段 E（11 个场景：类别与按钮白名单、到位前按钮不可点、到位后可点、等回执期间不重复、响铃优先拒绝、游过来途中被响铃接管后恢复、钩子在正式使用时无效等）；`bridge-smoke.mjs` 新增“4a 水母差事”（真实 `JellyErrands` / `JellyDesktop` / `AlarmDesktop` ↔ 真实原生进程，存储/闹钟/通知为替身）。各冒烟脚本的版本断言已改 8。

**变异检查**（只改 `/tmp/tk-errands/mut` 里的副本，跑完逐个 `cmp`/`shasum` 确认仓库文件未变；脚本在 `/tmp`，不入库）：

| 层 | 变异数 | 抓到 | 说明 |
|---|---|---|---|
| Chrome 侧 JS（核心、控制器、后台接线与发送器、jelly-nudge、jelly-desktop、alarm-desktop、设置页） | 75（另有 1 个占位变异因目标串不存在被跳过，不计） | 72 | 首轮 70 个抓到、5 个存活；其中 **2 个是真实的测试缺口**（后台差事设置消息“来源不对要拒绝并立即返回”、设置页组件版本门槛 8），已补断言，复测抓到。**3 个等价变异**：`offer` 里的分类开关检查（候选生成已按 `config.kinds` 过滤，是第二道冗余检查）、`offer` 里的类别校验（未知类别没有候选，结果同为 `handled:false`，只是原因字段不同）、`AlarmDesktop` 里 presence 的 `port === this.port`（处理函数最前面已有同样的 `port !== this.port` 直接返回）。为最后一项补了“旧连接迟到的 presence 不转发”回归测试，但它是冗余层，无法单独区分 |
| Swift 纯逻辑 | 15 | 13 | 首轮 12 个抓到、3 个存活：**1 个是真实的自测缺口**（喝水按钮集合被悄悄放宽一个按钮，原有用例只测整组按钮，单个按钮漏过），补了逐个按钮核对；**第一版补丁是循环的**（期望表取自被测规则表，规则被放宽时期望跟着放宽，变异复测仍存活），改成独立字面量后抓到。**2 个等价变异**：负数空闲秒数本来就小于阈值得 `active`；`parseNudge` 里的类别集合检查被紧随其后的按钮白名单查表（未知类别查不到）覆盖 |
| AppKit 控制器与 main | 15 | 11 | 首轮 10 个抓到、5 个存活；**1 个是真实的冒烟缺口**（`TIMEKEEPER_IDLE_SECONDS` 在没有测试钩子时仍生效，即环境变量能谎报“离开”），补了阶段 P 的对照场景，复测抓到。**4 个未验证**（不是等价）：①到位回调不核对 `nudgeToken`——被替换的旧差事的 4 秒兜底与旧冲刺回调是否会让新气泡提前开口，取决于冲刺时长，无头冒烟里无法确定地构造；②去掉 4 秒兜底——只在到位前被用户抓住水母时才起作用，需要合成真实鼠标，差事阶段没有这个场景；③跨屏时水母不先隐藏——需要两块屏幕加指针，本机只验证过响铃路径上的同一段逻辑；④已在屏幕上时不播报——读屏播报在没有 VoiceOver 时无法观察 |

**联调与礼让**：`assistant-smoke.mjs` 与 `bridge-smoke.mjs` 的助手阶段会抢键盘与前台，用户在用电脑时跑过一次，**用户的真实按键落进了测试面板**（`'联调：找一首歌shi' !== ''`），这不是代码缺陷；之后改为在 `HIDIdleTime` ≥ 30 秒后才运行。结果见“最终结果”。

## 已知边界与未验收

- **未验收**：真实 Chrome 156 与真实账号；真实系统通知与气泡并存/回退；真实闹钟到点（`chrome.alarms` 的 5 分钟节拍与 Service Worker 休眠重建）；全屏 Space、Stage Manager、刘海屏、Dock 在侧边/自动隐藏；多显示器的“水母在 A 屏、指针在 B 屏”差事路径（只有响铃路径验证过同一段代码）；VoiceOver 真机播报；真实的 300 秒离开（冒烟用环境变量注入，真实读数只做过与 `ioreg` 的一致性核对）；真实键盘与中文输入法；长期 CPU 占用；重装真实组件与重载扩展（由用户做，更新组件必须是 v8，旧组件下设置页会提示）。
- 常驻连接让 Service Worker 不休眠（常驻默认关闭的原有理由之一），差事评估依赖它存活或闹钟唤醒；`chrome.alarms` 在浏览器关闭期间不触发，不补发。
- 记录文字有效期到换日；Chrome 不在午夜主动清零，下一次评估才换日。
- 差事间隔、预算与时段是固定取值，设置页只暴露总开关、活跃度（安静/适中/忙碌）、四个分类开关、时段与工作日、是否显示任务名。
- 验收入口（用户做）：设置页打开“水母差事”后，等 1 分钟的第一次评估，或在设置页观察状态提示；组件须为 v8 并常驻。

## 复验命令

```
node --test --test-force-exit test/*.test.js test/*.test.mjs
node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app        # 不加 --install
node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --no-mouse [--only=presence|errand]
node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --no-mouse
node desktop-reminder/assistant-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --quiet=30
```

`test/` 目录不能当参数传给 `node --test`（Node 25 会报找不到模块）；在新 worktree 里跑全量前需要 `node_modules`（根与 `integrations/youtube-home`）与**真实的** `local-ai/node_modules`（`node --permission` 的计算沙箱测试不接受符号链接的真实路径，用 `cp -cR` 克隆）。

## 第 1 期最终结果

2026-10-17 在 worktree `/Users/liuqingwen/worktrees/ctb-jelly-errands`（分支 `feat/jelly-errands`，未提交）：

- **全量 `node --test`**：2495 项。首轮 2495/2495；文档改完后的三次整套运行结果为 2495 / 2493 / 2494 通过，失败的是与本改动无关的 `test/huya-follow.test.js`（“页面跳转到其他地址时报告 huya-redirected”）与 `test/local-ai-speech-synthesis-provider.test.mjs`（真实子进程 SIGKILL），两个文件本次都没改；单独连跑各 3–5 次全部通过，只在整套并发且机器忙（用户在用电脑、同时在编译 Swift）时偶发。**没有查明这两项的偶发原因**，未修改它们。
- **Swift 纯逻辑自测**（经 `test/desktop-companion-logic.test.mjs`）通过。
- **隔离原生冒烟**：`jelly-smoke.mjs --no-mouse` 全部阶段（含 P、E）通过；`countdown/confirmation/interaction-smoke` 通过。**没有跑**差事阶段的真实鼠标场景（本期没有），响铃/喝水的真实鼠标阶段（`--only=ring-mouse|nudge-mouse`）本轮未重跑。
- **联调** `bridge-smoke.mjs --no-mouse`：全部阶段通过（含 4a 水母差事、4d 桌面助手）。此前一次因用户在打字被真实按键污染而失败，改为等用户空闲 ≥30 秒后重跑才通过。
- **`assistant-smoke.mjs`**：12 个场景里 `config conflict presets protocol no-ack focus hooks-off lifecycle menu` 共 9 个通过（`focus` 一次被用户真实输入打断、等安静后重跑通过）；之后用户一直在使用电脑，等满 15 分钟放弃，**`keyboard`、`placement`、`shots` 三个场景本轮没有跑**（这个脚本本期只改了版本断言，助手相关代码未动）。用户安静时用 `--only=keyboard,placement,shots --quiet=30` 补跑（**第 2 期已补跑，12 个场景全部通过**，见第 2 期一节）。
- **真实 Chrome 156、真实账号、真实通知并存、真实闹钟到点：未验收。**

## 第 2 期（协议 v9）：推荐歌曲与右键菜单“水母，给我…”

2026-10-17，同一个 worktree、同一套调度与气泡管线；计划见 `docs/superpowers/plans/2026-10-17-jelly-errands-phase2.md`。

### 范围与不变的底线

- **做**：① `song` 类差事——水母偶尔推荐一首歌，气泡三个按钮“播放 / 换一首 / 不听”；② 右键水母 → “水母，给我…”：今日概览 / 来首歌 / 来点乐子 / 工作日志，主动要一条。
- **底线（用户决策 B 档，未变）**：**放歌只在用户点气泡上的“播放”时发生**，调度器与菜单请求自己都不会放歌（“来首歌”只是推荐一首，同样要点“播放”）；不修改任务、不写日志、不调用模型。
- **不做**：自动放歌；云端歌单写入；新的推荐算法（只用既有接口，文案不声称“按你的口味”）；巡游与按时段性格（第 3 期，**尚未做**）。

### 复用的既有能力（AGENTS.md “必须优先复用”）

| 需要 | 复用 | 查过的限制 |
|---|---|---|
| 歌曲来源 | `neteaseApiCall` + `getNeteaseCookies` + `normalizeSilentMusicSong`（都在 `js/background.js`），与右键“每日推荐”、音乐页“发现”同一套网易云接口：有 `MUSIC_U` 用每日推荐 `/api/v3/discovery/recommend/songs`（读 `data.data.dailySongs \|\| data.dailySongs`，与 `background.js` / `music-controller.js` 里既有读取一致），没登录或失败退回热歌榜 `/api/playlist/detail`（歌单 3778678） | `neteaseApiCall` 要求浏览器里**至少有一个 `music.163.com` Cookie**，一个都没有就抛“未登录”，来源按没有候选处理（音乐页同样）；Cookie 只由它带给 music.163.com，不进歌曲模块、日志与气泡 |
| 放歌 | `playAssistantMusic`：取地址 → 加入保存队列（≤300 首，已在则不重复）→ 交给 Offscreen 播放 → `waitAssistantPlayback` 最多 10 秒等播放器确认起播 → 保存当前曲目 | “已提交”不等于“已播放”：适配器 `playJellySong` 返回 `{ok, dispatched, code?, message?}`，`dispatched` 由“提交播放请求”那一步的 trace 钩子记下 |
| 是不是正在放歌 | `chrome.runtime.getContexts`（找 Offscreen 文档）+ `sendToOffscreen({command:'getState'})` 的 `isPlaying` | 没有 Offscreen 文档就是没在放，**不为了查询去创建文档**；读不出来返回 `null`，控制器据此不推荐歌曲 |
| 权限 | **无新增**：`*://music.163.com/*` 主机权限与 `cookies` 权限本来就在，`manifest.json` 未改 | |

**真实服务取证（2026-10-17，匿名 `curl`）**：热歌榜 `/api/playlist/detail?id=3778678&n=30` 返回 `{code:200, result:{tracks:[200 首…]}}`（约 600 KB，参数 `n` 被忽略），**曲目在 `result.tracks`**。所以来源按 `playlist.tracks`、`result.playlist.tracks`、`result.tracks` 三种位置依次取（先写了真实形状的失败测试再修）；把录下的这份真实响应整个交给真实的 `JellyErrandSongs` + 真实的 `normalizeSilentMusicSong` 重放，得到 30 首有效歌曲。**音乐页“发现”的兜底（`js/music-controller.js` 约 2904 行）只读 `playlist` / `result.playlist`，与这个真实形状对不上，可能从未命中——本期没有改它，仅在此记录。** 已登录的每日推荐没有用真实账号验证（只有与既有读取代码同形状的替身）。

### 协议 v9（在 v8 之上增量；旧组件忽略新字段）

- `jelly` 命令可带 `errands:{enabled:true}`：**只有带了才显示右键“水母，给我…”**（缺省 = 关闭，与 `assistant` 字段同规则；Chrome 在差事总开关关闭、组件 <v9 时不带）。
- `nudge` 的 `kind` 增加 `song`，按钮 `play / another / dismiss`，**歌曲是唯一允许 3 个按钮的类别**，主按钮 `play`；其余类别仍最多 2 个。能力门槛按类别：差事 ≥ v8，推荐歌曲与菜单 ≥ v9（`errandsReady(minVersion)` 只能把门槛抬到 8 以上）。旧组件（< v9）不认识 `song` 与 3 个按钮会回 `ok:false`，但 Chrome 在 `errandsReady(9)` 就不推荐歌曲了，用不到这条回退。
- 原生 → Chrome 事件 `errandRequest {errandId, kind}`（`kind` 只能是菜单里的四类）；Chrome → 原生命令 `errandRequestResult {errandId, ok, text?|error?}`（`text` ≤ 80、`error` ≤ 120，原生再清洗、截断到 60）。回执版本 9；`ping` 新增诊断字段 `errandsMenu`、`errandRequestBusy`、`feedback`；测试钩子 `menuItem` 对差事子菜单与其他菜单项一样，只在 `TIMEKEEPER_TEST_HOOKS=1` 时可用。
- **编号教训：菜单请求的编号叫 `errandId`，不能叫 `requestId`。** `requestId` 是“命令 → 回执”的关联键，`main.swift` 的 `respond()` 会把命令里的 `requestId` 原样写进回执。第一版结果命令也带了 `requestId`（菜单请求的 UUID），回执就被标成了那个 UUID，按自己 `requestId` 等回执的一方永远等不到——表现为 `jelly-smoke` 菜单场景里 `errandRequestResult` 超时。改名后两个方向都用 `errandId`；`test/alarm-desktop.test.js` 断言结果里没有 `requestId`、只带 `requestId` 的旧式消息被忽略，`jelly-smoke` 断言事件的键恰为 `errandId / kind / type`。
- 这些表在 JS（`JellyErrandsCore.KINDS`、`REQUEST_KINDS`）与 Swift（`JellyModel.nudgeButtonRules`、`primaryNudgeButton`、`maxNudgeButtons`、`errandRequestItems`）各有一份，`test/desktop-companion-logic.test.mjs` 与 `companion-selftest.swift` 逐项对照，改一边必须改另一边。

### 歌曲气泡

- **何时推荐**：与其他类别共用放行顺序（时段 / 离开 / 间隔 / 预算 / 静默），紧急度 1（与小乐子并列，歌曲排在前）；**只在没有更高紧急度的候选时才去取歌**，免得白白联网；**正在放歌，或读不出是否在放歌，都不推荐**。候选歌曲在内存里缓存 30 分钟，取歌失败后 10 分钟内不再联网；每首当天只推荐一次（指纹去重）。
- **“换一首”**是用户明确要的：跳过放行条件、不占间隔与条数，只限歌曲类（与小乐子的“再来一条”同规则）；**“不听”**记一次拒绝（连续 2 次当天静默歌曲类）；**“播放”确认起播后**才记一次接受。
- **“播放”的诚实边界**（每个气泡有自己的状态 `idle / playing / done / unknown / failed`，只记最近 20 个）：

  | 适配器结果 | 气泡文字 | 之后 |
  |---|---|---|
  | `ok:true`（播放器已确认起播） | 已开始播放《歌名》 | `done`；记一次接受；再点回同样文字 |
  | `dispatched:false`（明确没发出去） | Chrome 给的中文原因（≤ 40 字），否则“没能开始播放，请稍后再试” | `idle`，三个按钮恢复，可再点 |
  | `dispatched:false` 且 `code:'unavailable'` | 这首歌暂不可播放，点“换一首”试试 | `failed`，“播放”不再重试这一首 |
  | `dispatched:true`（已交给播放器，没等到确认） | 已交给播放器，还没确认开始播放，请在播放器里看看 | `unknown`，**不重放** |
  | 超时 / 抛错 / 结果说不清 | 播放器没有及时回应，请在播放器里看看有没有开始播放 | `unknown`，**不重放**，置 `signal.cancelled` 让迟到的流程在下一个检查点自己停下 |

  第二次点“播放”：`playing` 时回“正在交给播放器，请稍候”，`done / unknown` 回上次的文字，`failed` 回同样的失败。
- **两个超时不一致，是有意的**：Chrome 侧 `PLAY_MS = 12 s`（后台确认本身最长 10 秒），原生只等 8 秒回执；更慢的结果在用户再点一次时给出。边界：控制器在 12 秒处取消时，若播放器恰好在此时才起播，“保存当前曲目”这一步可能被跳过（窗口很窄，起播本身不受影响）。
- **播放会把这首歌加入保存队列**（≤ 300 首，已在则不重复；这是 `playAssistantMusic` 的既有行为），并会替换当前正在播的内容——设置页卡片已如实写明“把这一首加入播放队列并开始播放”。

### 右键菜单“水母，给我…”

- 菜单项：今日概览 / 来首歌 / 来点乐子 / 工作日志；只在设置页打开“水母差事”、组件 ≥ v9、没有响铃时出现。
- **手动请求的语义**：忽略时段、间隔、预算、静默与分类开关，但要求总开关打开、组件 ≥ v9、没有响铃；**不占预算、不计拒绝、不记接受**（编号带手动标记）；概览与日志不写状态，歌曲与小乐子只记内容指纹；“来首歌”不看是否正在放歌（用户主动要的）。同一时刻只处理一个请求（`requestBusy`）；`request()` 永不抛出，返回 `{ok:true}` / `{ok:true,text}`（没有内容可说）/ `{ok:false,error}`。
- **原生端**：等回执期间整个子菜单禁用；反馈气泡“稍等，水母在准备…”；回执 `ok` 且没有文字只清掉反馈（气泡已经由 `nudge` 命令呈现），`ok` 带文字显示 4 秒，失败显示原因 5 秒；**15 秒没有回执**提示“Chrome 没有回应，请重试”并恢复菜单；编号对不上或重复的回执被忽略，旧请求的 15 秒计时器按编号核对、不会清掉新请求。

### 隐私与安全（第 2 期增量）

- **新增一个联网读取点**：后台在差事命中 `song` 时读网易云接口（热歌榜一次约 600 KB；缓存 30 分钟、失败退避 10 分钟，所以最坏约每 30 分钟一次）。只读；自动推荐只在“水母差事”总开关与“推荐歌曲”分类开关都开启时发生，右键“来首歌”是用户主动要的，不看分类开关、但仍要求总开关打开；没有新增权限、依赖、模型调用。
- 日志只写固定类别（`system` 下 `jelly-errands:play / play-unknown / play-failed / request …`），不写歌名、歌手与 Cookie；气泡文字经 `clean`（歌名 ≤ 24、歌手 ≤ 16）；适配器返回给控制器的 `message` 只放中文原文（≤ 40 字），英文与技术报错一律不外传。
- `errandsEnabled` 直接读配置、不经控制器的串行队列（免得与耗时的歌曲推荐互相等）；`isMusicPlaying` 永不抛出。

### 验证（第 2 期，分层报告）

**静态检查**：改动脚本均 `node --check`；`git diff --check`（已跟踪文件）与对未跟踪新文件的行尾空白扫描均干净；Swift 全部源文件按构建顺序编译，隔离构建 `QA.app` 成功（不带 `--install`）。

**业务替身测试（Node，真实 SDK/真实 Chrome 都不在内）**：新增 `test/jelly-errand-songs.test.js`（9 项，含热歌榜三种响应形状与真实形状）；扩展 `test/jelly-errands-core.test.js`、`test/jelly-errands.test.js`（71 项：歌曲候选与放行顺序、缓存与退避、播放五态、unknown 不重放、迟到结果、手动请求不占预算/不计拒绝/不记接受、一次一个请求）、`test/alarm-desktop.test.js`（57 项：`errandRequest` 校验端口与 `errandId`、结果命令不带 `requestId`、只带 `requestId` 的旧式消息被忽略、在途编号清理）、`test/jelly-errands-integration.test.js`（23 项：设置页文案与版本钉子 `settings-page.js?v=12`、后台接线）、`test/desktop-companion-logic.test.mjs`（经 Swift 自测，2 项）、`test/user-quiet.test.mjs`（11 项，含 `bridge-smoke` 的礼让合同）。全量 `node --test --test-force-exit test/*.test.js test/*.test.mjs`：见文末“第 2 期最终结果”。

**Swift 纯逻辑**：`companion-selftest.swift` 的 v9 块（歌曲按钮与主按钮、3 个按钮只有歌曲能有、菜单项与请求类别、`errands` 严格解析），与 JS 逐项对照。

**隔离原生冒烟**（独立 Bundle ID，不碰真实组件，不连 Chrome；运行期间不碰键鼠）：`jelly-smoke.mjs --no-mouse` 全部阶段通过，其中阶段 E 共 20 个场景，第 2 期新增 9 个：歌曲气泡三按钮齐全且在窗口内互不重叠且不抢焦点（并 `screencapture -l` 截自家窗口目检）、三个按钮各发自己的动作且等回执时只能有一个、播放失败显示原因并恢复按钮且“换一首”仍可点、右键菜单（不带 `errands` 没有、带了才有、四项各发自己的 `errandRequest`、等回执时全部禁用）、菜单请求回执（有文字/失败/对不上或重复被忽略）、15 秒无回执、前一个请求的计时器不清掉后一个请求、响铃中没有菜单、钩子 `menuItem` 在正式使用时无效。`--scenario=` 过滤是为变异检查加的。`bridge-smoke.mjs --no-mouse --quiet=20`（真实 Chrome 侧模块 ↔ 真实原生进程，存储/闹钟/通知/播放器为替身）全部阶段通过，其中 4a2：菜单 → 请求 → 三按钮歌曲气泡 → 播放（替身播放器）→ unknown 不重放 → 换一首 → 不听 → 在放歌时不推荐 → 竞态请求的失败反馈 → 关闭后菜单消失；4d（助手面板会抢键盘）加了与 `assistant-smoke` 同样的礼让（`HIDIdleTime`，被真实输入打断以退出码 75 结束，不算失败）。`countdown/confirmation/interaction-smoke` 通过。`assistant-smoke.mjs` 12 个场景在三次运行里全部通过（中途几次被用户的真实输入打断；还有一次在机器负载很高时 `jelly` 命令超时崩溃，**不是第 2 期代码**，用户安静后重跑通过）；这些助手冒烟是在 `main.swift` 头部注释改成 v9 说明之前跑的（只改了注释），之后没有重跑。

**变异检查**（只改 `/tmp` 里的副本，跑完逐个 `cmp` / `diff` 确认仓库文件未变，脚本不入库）：

| 层 | 变异数 | 抓到 | 说明 |
|---|---|---|---|
| Chrome 侧 JS（核心、歌曲来源、控制器、后台接线、`jelly-desktop`、`alarm-desktop`、设置页） | 111（最终在当前源码上完整重跑） | 110 | 首轮 109 个中 104 个抓到、3 个存活、2 个因目标串失效被跳过。存活的 2 个是**真实的测试缺口**：手动气泡不应记“接受”（`strikes.song` 保持不变、不写状态）、处理完要清除在途请求编号（同一编号之后是全新请求），已补断言，复测抓到；跳过的 2 个重新定位后抓到。**1 个等价变异**：`AlarmDesktop` 处理 `errandRequest` 时的“旧连接的请求也处理”——监听函数在更外层已有同样的 `port !== this.port` 直接返回，里层是同一个同步时刻的冗余检查 |
| Swift 纯逻辑（`jelly-model.swift`） | 19 | 18 | **1 个等价变异**：非歌曲类别的按钮个数上限放宽到 3——这些类别的白名单只有 2 个 id，且重复 id 被拒，所以 3 个按钮必然会在白名单或重复检查上被拒，个数上限对它们是冗余的 |
| AppKit 控制器 / 伴随视图 / `main.swift` | 23 | 21 | 首轮误判 1 个：把“ok 且没有文字要清掉‘正在准备’”交给了错误的冒烟场景，换成断言它的场景后抓到。**2 个未验证（不是等价）**：只拿掉发请求处的守卫（“已有请求在等”、“响铃中”）而菜单项的禁用/不出现仍在——验收钩子能走到的路径都被菜单本身挡住了；守卫真正的价值是“菜单已经展开之后状态才变化”的竞态（响铃恰好在菜单打开期间开始、请求在菜单打开期间发出），无头冒烟构造不出来。**两层同时拿掉的变异被抓到。** 另有为“旧请求的 15 秒计时器按编号核对”预先补的冒烟场景（预判原有场景抓不到它，没有单独验证“补之前确实存活”），该变异在补后被抓到 |

**真实服务**：只有对热歌榜接口的匿名读取（上文取证）；每日推荐、真实账号、真实播放没有验。

**复验命令（第 2 期增量）**：

```
node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --no-mouse --only=errand [--scenario=歌曲气泡]
node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --no-mouse --quiet=20
node desktop-reminder/assistant-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --quiet=30
```

### 第 2 期最终结果

2026-10-17 在 worktree `/Users/liuqingwen/worktrees/ctb-jelly-errands`（分支 `feat/jelly-errands`，未提交）；以下都在最终源码上跑（最后一次改动是 `jelly-smoke.mjs` 的新场景与 `--scenario` 过滤、`main.swift` 头部注释、文档）：

- **全量 `node --test`**：2560 项，2560 通过、0 失败（整套约 40 秒；第 1 期末是 2495 项，本期净增 65 项，含经 Swift 自测的 `desktop-companion-logic`）。第 1 期记录的两个偶发失败文件（`test/huya-follow.test.js`、`test/local-ai-speech-synthesis-provider.test.mjs`）这次没有出现；**没有查明它们之前偶发的原因，也没有改它们**。
- **隔离原生冒烟**：`jelly-smoke.mjs --no-mouse` 全部阶段通过（P、E、1、1b、1c、2、3、3b、4、6；阶段 E 20 个场景）；`countdown/confirmation/interaction-smoke` 通过。**没有跑**真实鼠标阶段（`--only=ring-mouse|nudge-mouse`；差事阶段本来就没有真实鼠标场景）。
- **联调** `bridge-smoke.mjs --no-mouse --quiet=20`：阶段 1、2、4a、4a2、4b、4c、4d、5、6、7、8 全部通过。
- **`assistant-smoke.mjs`**：12 个场景在此前三次运行里全部通过（见上），最终源码上没有重跑。
- **变异检查**：Chrome 侧 111 个抓到 110（1 个等价），Swift 纯逻辑 19 个抓到 18（1 个等价），AppKit 23 个抓到 21（2 个未验证的竞态守卫），逐个说明见上表。跑完后仓库内的 Swift、JS、测试文件与变异副本逐个 `cmp` / `diff` 一致，唯一的差异是变异副本复制之后才改的文件（`README.md`、`jelly-smoke.mjs` 的新场景、`main.swift` 头部那一行注释）——**仓库文件没有被变异脚本改动过**。
- **真实 Chrome 156、真实网易云账号（每日推荐）、真实播放与播放器确认、真实通知并存、全屏 Space / 多显示器组合、VoiceOver：未验收。**

### 第 2 期已知边界与未验收

- **未验收**：真实 Chrome 156；真实网易云账号（每日推荐只有替身）；真实播放与真实播放器确认；真实通知并存；全屏 Space / Stage Manager / 多显示器组合下的歌曲气泡与菜单；VoiceOver；真实键盘；长期占用。
- 更新组件须是 **v9**（重新构建安装，**重载扩展**），旧组件下设置页会提示，歌曲与菜单不出现、其余差事照旧。
- 音乐页“发现”兜底的形状对不上（上文），本期未改。
- 与另外两个 worktree（`ctb-jelly-appearance`、`ctb-aquarium`）合并时 `desktop-reminder/` 里的同一批文件会冲突：`ctb-jelly-appearance` 有未提交修改且不改协议版本（停在 v7），合并时回执版本号与版本断言要以 v9 为准。
- 第 3 期（巡游、按时段性格、睡眠规则）已完成，见下一节。

## 第 3 期（协议 v10）：白天清醒、巡游、按时段性格、小动作与完整睡眠规则

2026-10-17，同一个 worktree、同一套气泡管线；计划见 `docs/superpowers/plans/2026-10-17-jelly-errands-phase3.md`。**这一期没有新增 Swift 源文件，也没有新增任何 Chrome ↔ 原生的业务消息**：睡不睡、什么时候游、游多久都是水母自己的动作，不产生业务数据，不向 Chrome 回报；原生只存窗口位置，巡游不改写它。

### 范围与不变的底线

- **做**：① 开启后水母白天保持清醒（睁着眼，不再一直睡）；② 每隔几分钟自己沿泳线游一圈；③ 一天分六档性格（出发间隔、巡游时长、游速、小动作频率各不相同）；④ 清醒静止时隔一阵原地小跳一下（“小动作”）；⑤ 完整的睡眠规则。
- **底线（未变）**：巡游与小动作**不触发任何 Chrome 动作、业务回执、通知、网络或存储写入**，不放歌、不改任务；不新增权限、网络目标、依赖；不使用摄像头或麦克风。空闲时间仍是第 1 期那一条只读查询（`CGEventSource`，不读按键内容），这一期只是让水母自己的行为也看它。
- **只对常驻的水母生效**：差事总开关关着时 Chrome 压根不带 `errands`，没有常驻时原生也自己再认一次（临时出现的水母仍是老样子）。

### 设计取舍（设计稿 §7 只给了“每 3–8 分钟、持续 20–40 秒、回到泳线”“睡觉只在夜间 / 离开超过 10 分钟 / 差事关闭”“减少动态效果不巡游”“只在巡游与气泡时提速”；以下由实现方定，用户验收时校正）

1. **一个开关管两件事**：设置页“让水母活动起来”（`patrol`，**差事开启后默认开**，只有明确 `false` 才关）。开 = 白天清醒 + 偶尔巡游 + 小动作；关 = 回到老样子（休息就睡，哪怕差事开着）。这样“睡不睡”和“游不游”不会出现互相矛盾的组合。
2. **睡眠规则**（纯逻辑 `JellyBehavior.isAsleep`）：活动行为关 → 休息就睡；开 → 只有两种情况睡：**夜晚曲线 ≥ 0.5**（`CountdownModel.nightAmount` 的半高处，即约 19:30 到次日 06:30），或**系统空闲 ≥ 600 秒**。
   - 夜晚判定**不看“夜晚荧光”开关**：荧光是视觉效果，睡觉是行为，关荧光不该让水母整夜清醒（有冒烟场景守住）。
   - 睡觉阈值 600 秒比 presence 的“离开”阈值 300 秒更慢：刚走开一会儿它不会立刻躺下；设计稿写的是“`presence` 为 `away` 超过 10 分钟”，这里直接用同一份只读空闲读数（原生不必等 Chrome）。
   - 读不到空闲秒数、负数、非有限值都按“在电脑前”，夜晚值非有限同样不睡。
3. **巡游资格**（`JellyBehavior.canPatrol`，每一项单独为假都不能巡游）：活动行为开 ∧ 常驻 ∧ 不是“减少动态效果” ∧ 倒计时不在临近阶段（`stage == .calm`；临近时水母自己就在游）∧ 不“忙” ∧ 没睡着 ∧ 空闲 < 300 秒（presence 为 active）。
   - **“忙”** = 响铃及收尾 / 响铃后游回、差事与喝水起身气泡（含它们的“游过来”）、详情与反馈气泡、被抓着、右键菜单打开、鼠标正停在水母身上（窗口左右各缩 40 点、上下各缩 12 点的身体范围）。
   - **时钟读数气泡不算“忙”**：有闹钟时它一直在，算忙的话有闹钟的人永远等不到巡游。
   - 右键菜单“打开中”有 180 秒安全阀，超过当作漏了关闭通知，不让一次遗漏把活动行为永远关掉；时钟回拨的负间隔与非有限值不算打开中。
4. **调度**：条件满足且没有计时器时安排一个“一次性”出发计时器（等待时间在该时段性格的区间里随机）；出发时再核对一遍；巡游时长同样随机。**任何一项条件不再满足就取消计时器、立刻结束进行中的巡游**，条件恢复后重新计一段完整的等待（回到电脑前不会立刻被拉去游）。结束（自然结束或被打断）都**只是让水母沉回泳线**，不游回原位——差事气泡与响铃本来就有自己的落点逻辑，用户也随时可以把它拖走。
   - 唯一没有“结束事件”的阻碍是**鼠标停在水母身上**（鼠标移开不会通知任何人）：这时每 3 秒再核对一次；所以鼠标移开之后，最多 3 秒 + 一段完整的等待才会出发（5 秒覆盖下实测约 9 秒）。
5. **提速只在需要时**：空闲清醒仍是 30 秒一次的刷新、零动画帧；巡游期间刷新改为每秒一次（鼠标靠近、菜单、气泡都在这一拍被核对），结束后回到 30 秒。
6. **小动作**：清醒的水母静止时是不眨眼的定格（没有动画帧），看起来像塑像，所以清醒且不忙时每隔“小动作间隔”让它原地小跳一下（复用现有 `swim.poke()`，同“点一下”的跳，只是不弹详情气泡），回落后重新静止。减少动态效果下没有小动作。**到点时同样再核对一遍资格**：鼠标移到水母身上没有任何事件通知，旧的小动作计时器还在，不核对的话水母会在鼠标底下突然跳走（真实鼠标场景守住）。这是对设计稿的补充，目的只有一个：清醒不等于僵住。
7. **减少动态效果**：仍然清醒（清醒不是“动”），但不巡游、没有小动作。
8. **不做**：全屏 / 屏幕共享时抑制巡游（没有公开、可靠的判定，见已知边界；用户可以关掉“让水母活动起来”）；跨屏巡游（只在水母当前所在屏幕的泳线上游）；让巡游影响任何业务状态或向 Chrome 回报；JS 侧的第二份性格表（性格只在 Swift 一份）。

### 时段性格（`JellyBehavior.personality(hour:)`，本地小时、半开区间、按 24 小时取模，非有限值按“专注”）

| 时段 | id（名字） | 出发间隔（分钟） | 巡游时长（秒） | 游速倍率 | 小动作间隔（秒） |
|---|---|---|---|---|---|
| 06–09 | `lively`（精神） | 3–5 | 30–40 | 1.15 | 15–30 |
| 09–12 | `steady`（专注） | 4–6 | 25–35 | 1.0 | 25–45 |
| 12–14 | `drowsy`（犯懒） | 6–8 | 20–28 | 0.75 | 45–90 |
| 14–18 | `busy`（忙碌） | 4–6 | 25–40 | 1.05 | 20–40 |
| 18–20 | `mellow`（悠闲） | 5–8 | 25–35 | 0.85 | 30–60 |
| 20–06 | `night`（睡眠） | —（夜里不巡游） | — | — | —（没有小动作） |

所有区间都落在设计稿的“3–8 分钟 / 20–40 秒”之内。**这是视觉性格，不是对用户状态的判断**；数值是设计取舍，须以真实观感校准。出发的分钟换算成秒、时长与小动作间隔的取值路径放在纯逻辑（`patrolDelaySeconds` / `patrolDurationSeconds` / `fidgetSeconds`），因为验收覆盖会绕过控制器里的这段换算，只能由纯逻辑自测守住。

### 巡游的游法（复用 `JellySwim`，不新造物理引擎）

`JellyTuning.patrol(pace:)` 只换一份调校参数：脉动周期 `1.4/pace`（pace 夹在 0.5–2，无效按 1）、水平冲量 62、垂直冲量按“上升 ≈ 下沉”标定（`1.4·sink·T/(1−e^(−dragY·T))`，否则水母会一路升到屏幕顶端——首页水母第一版就吃过这个亏）、愿意停留的高度 16。纯逻辑自测的 30 秒物理仿真（seeded 随机）：游速 0.75 / 1 / 1.15 走过约 606 / 783 / 869 点，而平静调校约 319 点；平均高度约 28 点，从不超过 60 点；`wantsRest` 之后 1.4–1.7 秒落回泳线。

### 协议 v10（在 v9 之上增量；旧组件忽略新字段）

- `jelly` 命令的 `errands` 对象多一个可选布尔 `patrol`：Chrome 只在“水母常驻 ∧ 差事开启”时才带 `errands`，值是设置页的开关；**原生严格解析**，只有 `errands.enabled === true` 且 `errands.patrol === true` 才开启（缺省、`false`、字符串、数字、差事没开却带了 `patrol` 都是老样子）。
- 回执版本 10；`ping` 增加验收诊断 `jellyLively`、`jellyAsleep`（水母此刻是否真的合着眼）、`patrolling`、`patrolCount`、`fidgetCount`、`personality`（最近一次安排计时器时的性格）、`patrolPace`（最近一次巡游的游速倍率，0 = 还没巡游过）、`swimPeriod`（水母此刻实际在用的脉动周期：巡游时 1.4 / 游速，平静阶段 2.4；验收“游动调校真的交到了水母手里”靠它）。
- 测试钩子（只有 `TIMEKEEPER_TEST_HOOKS=1` 才生效）：环境变量 `TIMEKEEPER_PATROL_SECONDS="出发,时长,小动作"`（秒，恰好三项且都是正有限数，否则整条作废）、命令 `menuTracking {open}`（走与 AppKit 打开 / 关闭右键菜单相同的委托入口）；`TIMEKEEPER_IDLE_SECONDS`（第 1 期）、`TIMEKEEPER_NIGHT_HOUR`（夜晚荧光、睡觉与性格共用这一个读数，不受钩子开关限制，是第 1 期留下的）、`TIMEKEEPER_REDUCE_MOTION` 照旧。
- Chrome 侧：`JellyErrandsCore.normalize` 增 `patrol`（默认 `true`，只有明确 `false` 才关，旧配置自然为开）；`JellyDesktop` 的 `errands` 下发带 `patrol`，新钩子 `errandsPatrol`（读不到或抛错按关）；`js/background.js` 接线；设置页新增“让水母活动起来”勾选，组件版本低于 10 时提示“需要组件协议 v10”（脚本版本钉 `settings-page.js?v=13`）。不新增权限、不新增消息类型。

### 复用的既有能力（AGENTS.md “必须优先复用”）

物理与调校复用现有 `JellySwim` / `JellyTuning`；夜晚曲线复用 `CountdownModel.nightAmount`；空闲读数复用第 1 期的 `CGEventSource.secondsSinceLastEventType`（只读时间）；鼠标位置用公共 API `NSEvent.mouseLocation`（不需要权限）；右键菜单打开状态用 `NSMenuDelegate` 的 `menuWillOpen` / `menuDidClose`；小动作复用 `swim.poke()`；设置、版本提示与下发沿用第 1 期的 `JellyErrandsCore` / `JellyDesktop` / 设置页卡片。没有新依赖、没有新权限，也没有第二套调度。

### 隐私与安全（第 3 期增量）

- 没有新的数据读取点，也没有新的上报：行为状态只在原生进程内存里，不落盘、不进日志、不发给 Chrome；`ping` 诊断字段不含任何用户内容。
- 不使用 `chrome.idle`（`manifest.json` 无新增权限，`test/jelly-errands-integration.test.js` 守住）。
- 测试钩子在正式使用时无效（计时覆盖、菜单钩子都有“钩子关闭”场景守住）。
- 一行安全自查：本期 diff 没有新增接口、外部请求、文件写入、反序列化或秘密；新增输入（`errands.patrol`）是严格布尔解析，环境变量覆盖只在测试钩子打开时生效。

### 验证（第 3 期，分层报告）

**静态检查**：本期改动与新增的 26 个 JS/MJS 文件逐个 `node --check` 通过；`git diff --check` 干净，未跟踪新文件的行尾空白扫描干净；Swift 全部源文件按构建顺序编译，隔离构建 `QA.app` 成功（`--app=/tmp/tk-errands/QA.app`，不带 `--install`）。本期没有新增 Swift 源文件，`build.mjs` 清单与 `desktop-companion-logic.test.mjs` 的源文件合同不变。

**Swift 纯逻辑**（`companion-selftest.swift`，期望值独立写成字面量，不从被测代码推出来）：847 项 `ok`、没有 `FAIL`、`ALL PASS`；经 `test/desktop-companion-logic.test.mjs` 编译运行也通过（2 项）。本期块覆盖：`errands.patrol` 的严格解析（缺省 / `false` / `1` / `"true"` / 差事没开却带 `patrol` 都不生效）、`isAsleep` 真值表（0.49 / 0.5、599.9 / 600 两个边界，空闲 `nil` / 负数 / `NaN` / `∞`，夜晚 `NaN`）、`canPatrol` 每一项单独为假、`personality` 逐小时与区间边界及非有限小时、`patrolDelaySeconds` / `patrolDurationSeconds` / `fidgetSeconds` 的区间两端与“覆盖优先”、`parseOverrides` 的坏输入（缺项、非数、零、负、`∞`、多项、**空段** `"1,2,3,"` / `",1,2,3"`）、`JellyTuning.patrol` 的字面量与 `thrustY` 公式、30 秒 seeded 物理仿真（游速 0.75 / 1 / 1.15 走过 606 / 783 / 869 点，平静调校 319 点；平均高度约 28 点、从不超过 60 点；`wantsRest` 后回落并静止）。

**业务替身测试（Node，真实 SDK / 真实 Chrome 都不在内）**：`test/jelly-errands-core.test.js`（29 项：`patrol` 缺省 / 非布尔 / 旧配置都得开，只有明确 `false` 才关）、`test/jelly-desktop.test.js`（40 项：下发 `errands:{enabled:true, patrol}`，`errandsPatrol` 钩子严格 `true`、抛错 / 缺失 / 字符串按关，差事没开不带 `errands`、也不去问 `patrol`）、`test/jelly-errands-integration.test.js`（26 项：设置页 `set-errandsPatrol` 读写与文案、组件 <10 的提示、统一禁用 / 启用、后台接线、版本钉 `settings-page.js?v=13`、不使用 `chrome.idle`）、`test/jelly-desktop-integration.test.js`（13 项）与 `test/background-experience-integration.test.js`（5 项）里的版本钉子、`test/desktop-companion-logic.test.mjs`（2 项）。

**隔离原生冒烟**（独立 Bundle ID，不碰真实组件，不连 Chrome）：`jelly-smoke.mjs` 全部阶段通过（`PASS: jelly（协议 v10）全部阶段`）。其中阶段 A（活动行为）共 37 个场景加 2 个真实鼠标场景，包括：
- 老样子五种写法（没带 `errands`、只开差事没带 `patrol`、`patrol:false`、`patrol` 不是布尔、差事没开却带了 `patrol`）都是休息就睡、不巡游、没有小动作；
- 活动行为开：白天清醒；等一段后出发，窗口真的在横向游动；`swimPeriod` 对得上（11 点游速 1.0 → 周期 1.4），结束后一刷新就换回平静阶段的游法（周期 2.4）；结束后沉回泳线并静止（不游回原位）；再隔一段等待才第二次出发；
- 时段性格 5 档（7 / 10 / 13 / 16 / 19 点的名字、游速与实际脉动周期）；睡觉规则（23 点、凌晨 3 点、06:24 睡 / 06:36 醒、19:24 醒 / 19:36 睡、中午；关掉“夜晚荧光”不影响夜里睡觉）；空闲 5 / 299.9 / 300 / 400 / 599.9 / 600 / 700 秒；减少动态效果；只在常驻时有活动行为；
- 让路与打断：巡游中来差事气泡（立刻结束、收起后重新等）、**出发前被打断**（旧出发计时器作废，气泡收起后要重新等满一个完整的 6 秒才出发）、巡游中响铃、倒计时进入临近阶段不巡游而平静阶段（时钟读数气泡在）照常巡游、右键菜单打开期间不出发且巡游中打开立刻结束、菜单请求等回执（反馈气泡）时不出发、巡游中关掉活动行为 / 取消常驻；
- 小动作：清醒静止时隔一阵原地小跳（窗口纵向起伏、回落后静止）、有气泡时没有；钩子关闭（没有 `TIMEKEEPER_TEST_HOOKS`）时计时覆盖与菜单钩子无效；
- 2 个真实鼠标场景（合成真实鼠标，礼让用户，场景结束后把指针停到别处）：停在水母身上时不出发、移开后才出发，巡游中鼠标停到身上（靠每秒刷新）或被抓住都立刻结束、放手后重新等待；**停在水母身上时没有小动作、移开后才继续**。

`bridge-smoke.mjs --no-mouse --quiet=20`（真实 Chrome 侧模块 ↔ 真实原生进程，存储 / 闹钟 / 通知 / 播放器为替身）：阶段 1、2、4a、4a2、**4a3**、4b、4c、4d、5、6、7、8 全部通过；4a3 是本期新增——缺省按开启 → 关闭 → 再打开 → 差事总开关关闭，原生端的“活动”状态逐一跟上，Chrome 没有收到任何关于巡游的回报。`countdown-smoke`、`confirmation-smoke`、`interaction-smoke`、`smoke.mjs --auto` 通过。`assistant-smoke.mjs --quiet=30` 的 11 个场景（config、conflict、presets、protocol、no-ack、focus、hooks-off、lifecycle、menu、keyboard、placement）通过，`shots` 需要 `--shots` 目录，这次没跑。`--only=ring-mouse` 与 `--only=nudge-mouse`（真实鼠标阶段）在最终构建上各通过一次。

**CPU 实测**（隔离构建，`top -pid <pid> -l 4 -s 1 -stats cpu`，丢掉第一个累计样本后取 3 个 1 秒样本的均值，单位是单个核心的百分比；只是记录，不是性能验收，**机器当时被别的进程占着，负载均值 17–26，数字偏保守**）：

| 状态 | 完整 `--no-mouse` 一轮 | `--only=patrol` 一轮 | 说明 |
|---|---|---|---|
| 睡着（夜里） | 0.0% | 0.0% | 没有动画帧 |
| 清醒静止（白天，没有巡游与小动作） | 0.0% | 0.0% | 30 秒一次刷新、零动画帧——这是“白天清醒”没有拖累笔记本的依据 |
| 巡游中 | 2.4% | 2.1% | 更早的一次完整运行是 2.7%；30 fps 物理 + 窗口移动 |
| 小动作（验收里每 3.5 秒跳一次） | 1.3% | 1.2% | 真实间隔是 15–90 秒，比验收频繁得多，只是上限估计 |

**变异检查**（三层，只改 `/tmp` 里的副本，脚本不入库；跑完逐个 `cmp` / `diff` 确认仓库文件未变）：

| 层 | 变异数 | 抓到 | 说明 |
|---|---|---|---|
| Chrome 侧 JS（`jelly-errands-core` 规范化、`jelly-desktop` 下发、后台接线、设置页读写与提示、`settings.html` 控件 / 文案 / 版本钉） | 36 | 35 | 1 个**等价变异**：`jelly-desktop.js` 里 `patrol` 局部变量的初值（`let errands = false, patrol = false` 改成 `patrol = true`）只在 `errands` 为真的分支里被读，而那条分支先给它赋值，初值读不到。基线要把 `css/` 一并复制进副本才全绿（设置页测试读样式），不是变异造成的 |
| Swift 纯逻辑（`JellyBehavior`、`JellyTuning.patrol`、`State.patrol` 解析） | 66 | 66 | 首轮存活 1 个，是**真实的测试缺口**：`parseOverrides` 对空段（`"1,2,3,"`、`",1,2,3"`）的处理没人测，补两条坏输入用例后抓到 |
| AppKit 控制器 / 伴随视图 / `main.swift`（命令与睡觉 9、资格输入 6、“忙” 13、同步与计时 10、出发与结束 13、验收钩子 2） | 53 | 45 | 首轮抓到 41、存活 12；其中 4 个是**真实的验收缺口**，补断言或场景后抓到：① 巡游调校没有交给水母（补 `swimPeriod` 诊断与断言）、② 资格丢了不取消等待中的出发计时器（补“出发前被打断，要重新等满一个完整的 6 秒”场景）、③ 巡游自然结束后不刷新（巡游时长原来取整秒，恰好与每秒刷新重合而被掩盖，改成 5.5 秒）、④ 小动作到点不核对资格（补真实鼠标场景“停在水母身上时没有小动作”）。**最终存活 8 个，逐个分析如下** |

AppKit 层最终存活的 8 个：

- **可达状态下不可观察（2 个）**：#15 去掉 `companion.isVisible &&`——有资格巡游必须常驻，常驻水母必在屏幕上，隐藏分支同时 `cancelBehavior`；#17 “忙”不含 `ringExiting`——该状态只在 `shouldShow` 为假（不常驻、无倒计时、无气泡）时进入，而巡游资格本来就要求常驻，淡出 0.25 秒内常驻被打开的极端情形也只影响计时器安排。
- **冗余保护，只影响计时器“安排”那一刻（5 个）**：#18 “忙”不含响铃后游回、#21 不含详情气泡、#22 不含被抓着（鼠标停在身上仍算）、#31 资格丢了不取消小动作计时器、#45 出发时不取消小动作计时器。它们都在到点时被**再核对一遍**的同一条件兜住，而真实等待是小动作 ≥15 秒、出发 ≥3 分钟，游回、详情、抓取都只持续几秒，所以生产里没有可观察的差别；无头冒烟（验收用 `TIMEKEEPER_PATROL_SECONDS` 把等待压到几秒）构造不出“计时器在忙的那几秒里被安排、又恰好在几秒内到点”。**这是未验证，不是等价。**
- **延迟优化（1 个）**：#37 空闲读数变化时不立刻刷新——空闲跨过 300 / 600 秒时由 30 秒一次的刷新补上，最多晚 30 秒；没有运行期空闲钩子可以让冒烟观察到这个差别。**未验证。**

变异检查中暴露的**验收脚本自身的问题**（都已修复，不是产品缺陷）：真实鼠标场景留下的合成指针会停在水母上，让随后的非鼠标场景因“指针在水母身上所以不出发”而超时，被变异脚本误记为“抓到”——冒烟场景结束后现在会把指针停到别处（`parkPointer`），变异脚本每次运行前也先停好指针。#38–#42 首轮的“抓到”因此作废，停好指针后重跑，全部确实抓到，且失败信息与变异含义一致；真实鼠标那一组（#26、#27、#32、#34、#35、#36、#46）也按同一口径重跑复核，全部抓到（上面首轮的 41 个就是按这个口径复核后的数）。

**复验命令（第 3 期增量）**：

```
node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk-errands/QA.app           # 隔离构建，不带 --install
node --test --test-force-exit test/desktop-companion-logic.test.mjs                        # Swift 纯逻辑自测
node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk-errands/QA.app --no-mouse --only=patrol
node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk-errands/QA.app --only=patrol --quiet=20   # 含真实鼠标场景，运行期间不要碰鼠标
node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk-errands/QA.app --no-mouse --quiet=20
```

### 第 3 期最终结果

2026-10-18 凌晨在 worktree `/Users/liuqingwen/worktrees/ctb-jelly-errands`（分支 `feat/jelly-errands`，未提交）；以下都在最终源码、最终构建 `QA.app` 上跑（最后一次改动是为验收加的 `swimPeriod` 诊断与对应断言、5.5 秒巡游时长、文档）：

- **Swift 纯逻辑自测**：847 项 `ok`，`ALL PASS`。
- **隔离原生冒烟**：`jelly-smoke.mjs --no-mouse` 全部阶段通过；`--only=patrol`（含两个真实鼠标场景）、`--only=ring-mouse`、`--only=nudge-mouse` 各通过；`countdown-smoke`、`confirmation-smoke`、`interaction-smoke`、`smoke.mjs --auto`、`assistant-smoke.mjs --quiet=30`（11 个场景）通过。
- **联调** `bridge-smoke.mjs --no-mouse --quiet=20`：阶段 1、2、4a、4a2、4a3、4b、4c、4d、5、6、7、8 全部通过。
- **全量 `node --test`**：2566 项；连跑三次，**每一次都有 1 到 2 个与本期无关的失败或缺报**，都发生在这台机器被别人的进程占到负载均值 20 以上的时候：
  - 第 1、3 次 2565 通过、1 失败：`test/huya-follow.test.js:267`“页面跳转到其他地址时报告 huya-redirected”（第 1 期已记录过这个偶发失败）。该用例在 `setTimeout(…, 2)` 之后立刻读 `created[0].id`，机器忙时 2 毫秒内服务还没建好标签页，于是 `TypeError`；单独跑 3/3 通过，该文件与虎牙代码本 worktree 都没改。
  - 第 2 次 2555 通过、1 失败（共报告 2556 项，少了 10 项）：`test/local-ai-control.test.mjs:34` 的 `14999 !== 15000`（按时间算出的断言，单独跑 3/3 通过，开发本期时也见过一次）；另外 `test/jelly-game.test.js` 最后 10 个用例只打印了“开始”没有结果（按名字对比三次输出才发现），**原因没有查明**；该文件单独跑 5/5 次都是 58 项全过，且本期没有改它。
  - 这三个文件本期都没有改动；**没有改它们，也没有据此放宽任何断言**。与本期相关的 12 个测试文件（上文清单与 `alarm-desktop`、`jelly-errands`、`jelly-errand-songs`、`desktop-assistant-settings`、`user-quiet`、`jelly-nudge`）单独跑全部通过。
- **变异检查**：Chrome 侧 36 个抓到 35（1 个等价）；Swift 纯逻辑 66 个全抓到（补过 1 个缺口）；AppKit 53 个抓到 45（补过 4 个验收缺口），存活 8 个已逐个分析（2 个可达状态下不可观察、5 个冗余保护、1 个延迟优化，后 6 个未验证）。跑完后 AppKit 与 JS 变异副本和仓库逐个 `cmp` 一致，唯一差异是副本复制之后才改的 `README.md`；Swift 纯逻辑的分片副本是更早的快照（缺少之后才加的 `swimPeriod` 诊断与两条自测用例），被变异的纯逻辑文件与仓库一致——**仓库文件没有被变异脚本改动过**。
- **真实 Chrome 156、真实账号、真实夜里与真实 600 秒空闲、巡游的真实观感、全屏 Space / 屏幕共享 / 多显示器 / Stage Manager、VoiceOver：未验收**（见下一节）。

### 第 3 期已知边界与未验收

- **不做**：全屏 / 屏幕共享时抑制巡游（没有公开、可靠的判定；用户可关掉“让水母活动起来”）；跨屏巡游（只在水母当前所在屏幕的泳线上游）。
- **鼠标停在水母身上**是唯一没有“结束事件”的阻碍：鼠标移开后最多 3 秒再加一段完整的等待才会出发；巡游期间鼠标移到身上最多晚 1 秒被发现（每秒刷新）。
- **睡觉读的是键鼠空闲时间**（与第 1 期的 presence 同一个读数）：不代表人不在、也不代表人在；看视频、读文章 10 分钟不动键鼠水母会睡着，动一下就醒。
- 水母常驻的寿命跟随 Chrome（协议 v6 起的既有行为）：Chrome 退出、原生进程随之退出，活动行为也随之消失；Service Worker 休眠重建后由 `jelly` 命令带 `errands.patrol` 重新生效（`bridge-smoke` 阶段 5 覆盖断线重连，真实休眠未验）。
- **时段性格表的数值是设计取舍**，出发间隔、巡游时长、游速、小动作间隔都须以真实观感校准；验收用 `TIMEKEEPER_PATROL_SECONDS` 把几分钟压成几秒，**真实 3–8 分钟的整段等待、长时间运行下计时器是否被系统合并或推迟（App Nap）没有观察过**。
- **未验收**：真实 Chrome 156（设置页开关与“需要组件协议 v10”提示在真实页面里的表现）；真实账号；真实夜里（19:30–06:30）与真实 600 秒空闲睡觉（只用 `TIMEKEEPER_NIGHT_HOUR` / `TIMEKEEPER_IDLE_SECONDS`）；巡游的真实观感与出发间隔；全屏 Space / 屏幕共享 / Stage Manager / Dock 在侧边或自动隐藏 / 刘海屏 / 多显示器组合下的巡游与小动作；VoiceOver（巡游与小动作没有读屏播报）；真实键盘与真实鼠标（只验证过合成鼠标）；长期占用与笔记本电量。
- 更新组件须是 **v10**（重新构建安装，**重载扩展**）；旧组件下设置页会提示，活动行为不出现，v9 的歌曲与菜单、v8 的其余差事照旧。
- 与另外两个 worktree（`ctb-jelly-appearance`、`ctb-aquarium`）合并时会在同一批文件上冲突：`ctb-jelly-appearance` 回执版本仍是 7（已有提交 `8fcb73f`，另有未提交修改），合并时回执版本号与各冒烟脚本的版本断言要以 v10 为准。2026-10-18 的快照（只比较文件名，没有试合并）：与 `ctb-jelly-appearance`（`8fcb73f` 相对 `a327fd0`）重叠 11 个文件——`AGENTS.md`、`desktop-reminder/README.md`、`companion-selftest.swift`、`jelly-companion.swift`、`jelly-controller.swift`、`main.swift`、`docs/technical/_index.md`、`js/background.js`、`js/jelly-desktop.js`、`settings.html`、`test/desktop-companion-logic.test.mjs`；与 `ctb-aquarium`（未提交）重叠 7 个——`AGENTS.md`、`docs/technical/_index.md`、`js/settings-page.js`、`settings.html`、`test/background-experience-integration.test.js`、`test/desktop-assistant-settings.test.js`、`test/jelly-desktop-integration.test.js`。最容易撞的是脚本版本钉子：`ctb-aquarium` 把 `settings.html` 里的 `js/settings-page.js?v=10` 改成了 11，本分支（三期各抬一次）是 13，合并时钉子与各钉子测试（`background-experience-integration`、`desktop-assistant-settings`、`jelly-desktop-integration`）要统一抬高，不能各取其一。
