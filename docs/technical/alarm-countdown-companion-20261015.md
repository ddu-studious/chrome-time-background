---
title: 桌面倒计时 v5：活胶囊、桌面小伙伴（水母）与最后 10 秒仪式
date: 2026-10-15
status: 已实现，其中胶囊与可切换小伙伴已于 2026-10-16 被水母 v6 取代（见 jellyfish-resident-companion-20261016.md）；隔离验收通过，真实 Chrome、真实账号与重新安装的真实组件未验收
---

# 桌面倒计时 v5

> **2026-10-16 更新：本文的活胶囊与“可切换小伙伴”已被取代。** 胶囊（进度环、悬停按钮、迷你/标准尺寸、拖拽缩放）和 `userAlarmCountdownV1.style` 已删除，水母独立于闹钟、倒计时改由水母承载（协议 v6），见 `jellyfish-resident-companion-20261016.md`。本文里仍然有效的是“延后/跳过由 Chrome 串行执行、原生只转发”“`AlarmCore.nextDispatch` 跳过已处理的重复 occurrence”等约束；其余界面描述、`countdown-companion-smoke.mjs` 与 `countdown-view.swift` 等都是历史记录，对应文件已不存在。
>
> **同日晚的补充：v5 里的“提醒卡片”（右上角深色面板、`main.swift` 的 `buildPanel/position/springIn`、`isRinging` 回调）也已取消**，到点响铃改由水母的响铃气泡承载（水母游到鼠标所在屏幕底部正中，见 `jelly-ring-alarm-20261016.md`）。下文“最后 10 秒仪式”里“提醒卡片用阻尼弹簧弹入”“胶囊/水母先爆开再淡出”等描述对应的是旧卡片；现在正在显示倒计时的水母在响铃接棒时做一次“炸开”（减少动态效果时不做），再从当前位置冲刺到落点。约束不变：Chrome 是会话、贪睡与结束的唯一所有者，原生只显示与转发，回执绑定 `sessionId`+`actionId`。

## 目标与取舍

用户对 macOS 桌面倒计时胶囊（标题 + 数字 + “到点 · 最近提醒”）不满意，要求增加体验与可玩性，并强调“符合咱们业务”。经选择确认：

- 方向 **A + B**：A“活胶囊”（进度环、紧张阶段、悬停快捷操作、迷你尺寸、右键菜单），B 可切换的“桌面小伙伴”。
- 附加项只做**最后 10 秒仪式**。触感转盘、快速新增、摇一摇贪睡**没有做**（用户未选）。
- 角色：**水母**。小伙伴默认**关闭**，在闹钟中心勾选“桌面小伙伴（水母）”后启用。
- 原提案中的“靠边自动吸附”改为手动“迷你”尺寸（176 宽，仅进度环 + 时间），没有做吸附。

## 职责边界（不变量）

- **Chrome 是闹钟的唯一所有者**：延后、跳过只在 `js/background.js` 经 `userAlarmSaveQueue` 与保存、改名、删除同一条串行队列修改 `userAlarmsV1` / `userAlarmRuntimeV1`；原生只显示并转发动作，收到 Chrome 的 `countdownActionResult` 才显示成功。原生没有第二份闹钟状态。
- 动作绑定 `id`（occurrence）+ `alarmId` + `revision`；不匹配返回“提醒已被修改，请查看最新倒计时”。同一 `actionId` 幂等（`countdownHandled`），处理中的重复请求被忽略；响铃中、同秒多条、距到点 ≤3 秒拒绝；延后分钟数限制在 1–60。
- 没有新增权限、网络请求、依赖、Cookie 或模型调用；小伙伴样式只存 `userAlarmCountdownV1.style`（`capsule` 默认 / `companion`），位置记忆 `CompanionX` 在原生 `UserDefaults`。

## 协议 v5（旧组件忽略新增字段，旧 v≤4 端仍可显示基础胶囊）

| 方向 | 消息 | 字段 |
|---|---|---|
| Chrome→原生 | `countdown` 的 `timer` 新增 | `style`、`alarmId`、`revision`、`startAt`、`delayed`、`canAct`、`items[≤5]`（接下来的提醒） |
| 原生→Chrome | `countdownAction` | `id, alarmId, actionId, action: delay\|skip\|open, minutes, revision` |
| 原生→Chrome | `countdownStyle` | `id, style`（Chrome 端白名单，仅绑定当前倒计时） |
| Chrome→原生 | `countdownActionResult` | `id, actionId, ok, text\|error` |

`ping`/`response` 回执新增诊断字段 `countdownStage / countdownMenu / countdownCompact / countdownReduceMotion`，只供隔离验收，不含闹钟之外的数据。

## Chrome 侧

- `js/alarm-countdown.js` 导出 `nextTimer / upcomingItems / applyAction / normalizeStyle`。`applyAction` 规则：
  - 一次性闹钟延后：改 `fireAt/date/time/updatedAt/revision`；重复闹钟延后：把本次 occurrence 标为已处理，并追加后缀 `d1` 的 `pendingSnoozes`（带 `startedAt`）；已有贪睡条目延后：原地平移。
  - 一次性闹钟跳过：停用；重复闹钟跳过：本次标为已处理；贪睡条目跳过：取消。
- `js/alarm-core.js` 的 `nextDispatch` 修复：已处理的重复闹钟的“下一次”现在向后跳到未处理的 occurrence，否则跳过/延后今天这一次后，明天没有任何调度。
- `js/alarm-desktop.js` 的 `handleCountdownAction`：先查幂等表，再校验动作白名单；`js/background.js` 的 `runUserAlarmCountdownAction` 与 `openAlarmCenterPage`（通知点击共用）。接线语句放在 `getUserAlarmViewState` 之后，因为 `test/assistant-management.test.js` 会截取 `userAlarmSaveQueue` 到该函数之间的源码在沙箱里执行，不能引用片段外的 `alarmCountdown`。
- `js/alarm-center.js`（`?v=6`）增加“桌面小伙伴（水母）”复选框；组件版本 <5 时提示需要更新组件。

## 原生侧（`desktop-reminder/`）

- 文件：`countdown-model.swift`（阶段/进度/文案，纯 Foundation）、`jelly-swim.swift`（游泳物理，纯 Foundation）、`countdown-view.swift`（玻璃胶囊、进度环 `CountdownRingView`）、`countdown-companion.swift`（水母面板与自绘）、`countdown-controller.swift`（统一调度、菜单、动作往返）、`main.swift`（只保留 `let countdown = CountdownController()` 接线与提醒卡片 `springIn()`）。
- 阶段：平静 >600 s、临近 ≤600、紧迫 ≤60、最后 ≤10、到点。进度环窗口为 `min(创建以来的跨度, 3600 s)`，更远时满环并轻微呼吸；颜色与心跳随阶段加强（心跳 1.07/1.12/1.16 倍）。
- 悬停（仅常规尺寸、单条、`canAct`、>10 秒、胶囊样式）：把“到点 · 最近提醒”替换为“+5 分钟 / 跳过 / 编辑”。跳过需点两次（“确认跳过?”，数秒后复原）；动作发出后显示“正在同步到 Chrome…”，8 秒无回执则超时复原，成功/失败文字按 Chrome 回执显示。
- 右键菜单：接下来的提醒（≤5）、延后 5 分钟、跳过本次（子菜单确认）、在 Chrome 中打开闹钟中心、尺寸（迷你 176 / 小巧 272 / 标准 340 / 舒展 442）、切换样式、隐藏倒计时（不取消闹钟）。
- 迷你布局（宽 <230）：只显示环与时间，不显示悬停操作。
- 桌面小伙伴：170×150 不抢焦点的浮层，Core Graphics 自绘水母（钟罩、触手、眼睛追随鼠标、腮红、睡着的 z、报时气泡）；沿屏幕底部游动（`JellySwim` 的 `thrustScale` 防止飘到天花板）；点击戳一下并显示标题与口语化剩余时间 4 秒；拖起放手后落回游泳线（可换到鼠标所在屏幕）；只在移动时开 30 fps 定时器，睡着且落稳后零定时器。
- **最后 10 秒仪式**：最后 10 秒每秒数字放大弹一下；到点附近若随后出现提醒卡片，胶囊/水母先“爆开”再淡出，提醒卡片用阻尼弹簧从 95% 弹入；没有提醒卡片时不演出。全部在“减少动态效果”下关闭（`accessibilityDisplayShouldReduceMotion`；隔离测试可设环境变量 `TIMEKEEPER_REDUCE_MOTION=1` 强制）。
- 隔离构建：`build.mjs --app=…` 使用独立 Bundle ID `com.timekeeper.desktop.qa`，不改写真实组件保存的窗口位置/尺寸。

## 验证

分层报告：

- **静态检查**：`node --check`（`alarm-countdown.js / alarm-desktop.js / alarm-core.js / background.js / alarm-center.js / countdown-companion-smoke.mjs`）、`git diff --check` 通过；Swift 全量编译通过。
- **业务替身测试**：`node --test test/*.test.js test/*.test.mjs`：2131/2131 通过（含新增的倒计时协议、延后/跳过语义、边界校验、幂等、样式白名单、`nextDispatch` 跳转，以及 `test/desktop-companion-logic.test.mjs`：构建清单合同 + 编译并运行 50 项纯逻辑自测——阶段、进度、文案、水母物理的纵向分布与不飘顶；对物理做过变异检查，守卫能抓住）。
- **隔离原生验收**（真实 AppKit 进程，不接 Chrome，不读写闹钟）：`countdown-smoke.mjs`、`interaction-smoke.mjs`、`confirmation-smoke.mjs`（版本断言 v5）与新增 `countdown-companion-smoke.mjs`：协议字段与四个阶段、菜单内容（常规/不可操作/最后 10 秒/小伙伴）、非法样式回退、退场仪式（胶囊与小伙伴都在提醒卡片出现后退场，卡片处理后恢复）、减少动态效果下小伙伴静止、**合成真实鼠标事件**的悬停按钮 → `countdownAction(delay)`、反馈期间不重复提交、过期 `actionId` 回执被忽略、跳过两次确认、编辑 → `open`、小伙伴点击不改闹钟、拖起放手落回、迷你布局。截图（隔离窗口 `screencapture -l`）用于检查视觉。
- **HTTP 预览 / 真实 Chrome 扩展 / 真实账号**：未验证。没有重新安装真实的已安装组件，也没有重载真实扩展；Chrome 侧延后/跳过只经测试替身验证，未与真实 Chrome 的闹钟调度联调。
- 未覆盖：真实 GPU / 多显示器热插拔 / 全屏 Space 下的小伙伴、透明像素点击穿透、长时间运行占用。

## 升级与使用

更新原生组件后须重载扩展：`node desktop-reminder/build.mjs --extension-id=<id> --install`，然后在闹钟中心勾选“桌面小伙伴（水母）”才会启用小伙伴。旧组件只显示基础胶囊，闹钟中心会提示更新。

隔离验收：

```sh
node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node desktop-reminder/countdown-companion-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app --shots=/tmp/tk/shots   # --no-mouse 跳过鼠标阶段
```

鼠标阶段由 `desktop-reminder/mouse-helper.swift` 合成事件，只点击组件自己的窗口；不要用整屏或区域截图，避免截到用户其他应用内容。
