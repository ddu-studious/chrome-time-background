# 水母差事 第一期 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务执行（本项目禁止使用子代理，不用 subagent-driven-development）。步骤用 `- [ ]` 跟踪。

**Goal:** 让常驻的桌面水母主动开口：晨间概览、过期任务、工作日志缺口、随机小乐子，并在开口前游到鼠标所在屏幕。

**Architecture:** Chrome 侧新增纯逻辑 `jelly-errands-core.js` 与控制器 `jelly-errands.js`，经现有 `JellyDesktop.presenter` 发气泡。原生端**复用现有 nudge 气泡管线**，只放宽类别与按钮白名单，并新增 `presence`（active/away）事件和“开口前游过来”。

**Tech Stack:** 原生 JS（UMD 模块，CommonJS 测试入口）、Swift/AppKit（`desktop-reminder/`，`swiftc` 由 `test/desktop-companion-logic.test.mjs` 编译自测）、`node --test`。

**工作位置:** worktree `~/worktrees/ctb-jelly-errands`，分支 `feat/jelly-errands`，基于提交 `a327fd0`。worktree 在扩展目录之外，不影响真实 Chrome 加载的目录。**不提交 Git**（AGENTS.md：未经要求不提交）。

## 对设计稿的修订（实现前先读 `docs/superpowers/specs/2026-10-17-jelly-errands-design.md`）

1. **不新增 `errand` 命令，复用 `nudge`。** 设计稿第 6 节写的是新命令。读代码后改为放宽 `nudge`：气泡窗口、存活时间、按钮等待回执、8 秒无回执、`nudgeAction/nudgeActionResult`、`AlarmDesktop.nudgeHandled` 幂等表全部现成。旧组件（v7）的 `JellyModel.parseNudge` 对未知类别返回 nil → 原生回 `ok:false` → Chrome 静默跳过，**天然安全降级**，仍加版本判断避免白发。
2. **差事 id 用前缀 `jelly-errand-<kind>-<毫秒>`**，`AlarmDesktop.handleNudgeAction` 把 `jelly-nudge-` 与 `jelly-errand-` 两类 id 分别路由到各自的处理器。
3. **`errands` 开关由 Chrome 侧控制是否发差事**，不再需要给 `jelly` 命令加 `errands` 字段；“开口前游过来”只对差事类别的气泡生效，不影响喝水/起身。

## Global Constraints

- 默认全关：`jellyErrandsV1.enabled` 只有明确 `true` 才开；总开关关闭时**所有现有行为一字不变**（包含五个系统通知发送器）。
- 活跃度每小时上限：安静 2 / 适中 4 / 勤快 8；两条之间 ≥ 15 分钟；默认适中。
- 默认只显示数量；`showTitles` 只有明确 `true` 才显示任务名。
- `presence` 只上报 `active` / `away` 两态；阈值 300 秒；回到 `active` 后 20 秒内不开口。
- 同一类差事连续 2 次被拒绝（`dismiss`/`later`/自行消失）当天静默；次日重置；状态只存当天。
- 文字清洗沿用 `JellyModel.clean`：标题 ≤24、正文 ≤120、按钮 ≤12，去控制字符与方向控制符。
- 不新增权限、网络目标、依赖；不调用模型；气泡文字不写日志（日志类别 `system/jelly-errands`）。
- 第一期**不做**：推荐歌曲、右键“水母，给我…”、巡游。`song` 类别与按钮 `play/another` 留到第二期，白名单里**不提前放入**。
- 新增 `js/*.js` 须同步 `js/background.js` 的 `importScripts` 顺序（`jelly-nudge.js` 之后、`jelly-desktop.js` 之前）；`js/background.js` 里 `userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的片段不得引用片段外全局。
- 新增 Swift 源文件须同步 `desktop-reminder/build.mjs` 清单与 `test/desktop-companion-logic.test.mjs`。第一期不新增 Swift 文件，只改现有文件。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `js/jelly-errands-core.js` | 新建 | 纯逻辑：规范化、时段、预算、收敛、挑选、文案、任务/日志统计 |
| `test/jelly-errands-core.test.js` | 新建 | 核心单测 |
| `js/jelly-errands.js` | 新建 | 控制器：评估、发气泡、动作、存储 |
| `test/jelly-errands.test.js` | 新建 | 控制器单测（全部注入） |
| `js/alarm-desktop.js` | 改 | `handleNudgeAction` 放宽差事动作与 id 前缀路由；`presence` 事件回调 |
| `test/alarm-desktop.test.js` | 改 | 新路由与 presence |
| `desktop-reminder/jelly-model.swift` | 改 | 类别/按钮白名单放宽、按钮主次、presence 阈值纯函数 |
| `desktop-reminder/jelly-controller.swift` | 改 | 差事气泡按钮主次、开口前游过来、presence 采样与上报 |
| `desktop-reminder/main.swift` | 改 | 回执带版本 8 |
| `desktop-reminder/companion-selftest.swift` | 改 | 新纯逻辑自测 |
| `test/desktop-companion-logic.test.mjs` | 改 | 白名单与 JS 对照 |
| `js/background.js` | 改 | `importScripts`、创建控制器、消息接口、五个发送器改为“先水母后通知” |
| `js/settings-page.js` `settings.html` | 改 | “水母差事”设置区 |
| `test/jelly-errands-integration.test.js` | 新建 | 源码扫描与接线合同 |

---

## Task 1: 纯逻辑核心 `jelly-errands-core.js`

**Files:** Create `js/jelly-errands-core.js`、`test/jelly-errands-core.test.js`。

**Interfaces — Produces（后续任务依赖的名字与形状）:**

```js
JellyErrandsCore = {
  KINDS,            // { brief, task, worklog, tidbit } 每项 { urgency, buttons:[{id,title}] }
  LEVELS,           // { quiet:{perHour:2}, mid:{perHour:4}, busy:{perHour:8} }
  DEFAULTS, MIN_GAP_MS, AWAY_RETURN_MS, STRIKE_LIMIT,
  normalize(raw) -> { enabled, level, kinds:{task,worklog,tidbit}, showTitles, from, to, weekdaysOnly },
  inWindow(config, date) -> boolean,
  emptyState(dayKey) -> state,
  rollover(state, dayKey) -> state,
  taskStats(memos, todayStr) -> { today, overdue, open, topTitle },
  worklogGap(entries, date, todayStr) -> null | { label, logged, expect },
  gate(config, state, ctx, nowMs) -> { ok:true } | { ok:false, reason },
  pick(candidates, state, nowMs) -> candidate | null,
  recordShown(state, candidate, nowMs) -> state,
  recordOutcome(state, kind, accepted) -> state,
  copy: { brief, task, worklog, tidbit },   // 返回 { title, text } 已按长度截断
}
```

`state = { day, shown:[{at, kind}], lastAt, strikes:{kind:n}, muted:{kind:true}, seen:[fp], briefDone }`。`ctx = { presence:'active'|'away', activeSince, busy }`。`candidate = { kind, fp, urgency, payload }`。

- [ ] **Step 1: 写失败测试**，覆盖（每条一个 `test()`）：
  - `normalize`：缺省全关/适中/三类全开/不显示任务名/09:00–18:00/仅工作日；未知键丢弃；`enabled`、`showTitles` 只认明确 `true`；非法 `level` 回 `mid`；时段非法回默认。
  - `inWindow`：工作日内外边界、周末与 `weekdaysOnly:false`。
  - `taskStats`：排除 `completed` 与 `status==='failed'`；`dueDate === today` 计 today，`< today` 计 overdue；`topTitle` 取最早到期者；无任务全 0。
  - `worklogGap`：12 点前不产生；12–14 点已记录 <60 分钟产生“上午”；15–16 <180 产生“下午”；17 点 <360 产生“今天”；够了返回 null；只看 `date === todayStr`。
  - `gate`：关闭、窗口外、`presence==='away'`、回到 active 不足 20 秒、`busy`、距 `lastAt` <15 分钟、本小时已满档，各自返回对应 `reason`；全满足返回 `{ok:true}`；“本小时”按 `nowMs` 前 60 分钟滑动计数。
  - `pick`：先剔除 `muted` 与 `seen` 里已有 `fp` 的候选；按 `urgency` 降序，同级取距该类上次展示最久者；全剔除返回 null。
  - `recordShown`：写 `shown/lastAt/seen`，`brief` 置 `briefDone`，`seen` 最多 50 条淘汰最旧。
  - `recordOutcome`：`accepted:false` 连续 2 次 → `muted[kind]=true`；`accepted:true` 清零该类 strike。
  - `rollover`：换日清零全部，同日原样返回。
  - `copy`：`brief` 默认“今天 N 个任务，另有 M 个已过期”，`showTitles` 为 true 且有 `topTitle` 时追加任务名；任务名里的控制字符被清掉并按 12 字截断；无过期时不写“另有”；标题 ≤24、正文 ≤120。

- [ ] **Step 2: 运行确认失败**：`node --test test/jelly-errands-core.test.js` → FAIL（模块不存在）。
- [ ] **Step 3: 写最小实现**（UMD 外壳照抄 `js/jelly-nudge.js` 头部；不碰 `Date.now`、存储与 DOM，时钟与随机数均由参数传入）。
- [ ] **Step 4: 运行确认通过**；再跑 `node --check js/jelly-errands-core.js`。

## Task 2: 控制器 `jelly-errands.js`

**Files:** Create `js/jelly-errands.js`、`test/jelly-errands.test.js`。

**Interfaces — Consumes:** Task 1 的 `JellyErrandsCore`；现有 `presenter.present({id,kind,title,text,buttons,ttl})` 返回 `{shown:boolean}`。

**Produces:**

```js
JellyErrands.create({ syncStorage, localStorage, alarms, presenter, tips, now, random, log, presenceTimeoutMs })
  -> {
    get() -> { ok, config, state },           // 只读
    set(raw) -> { ok, config },               // 规范化并保存；开则建 5 分钟周期闹钟，关则清掉
    restore() -> Promise,                     // 启动时按设置补闹钟
    fire(alarmName) -> Promise<undefined|result>,   // 不是本模块的闹钟返回 undefined
    act(id, action) -> Promise<{ok,text|error}>,    // open / later / dismiss / more
    onPresence(state) -> void,                // 'active' | 'away'
    noteExternal(nowMs) -> void,              // 喝水/起身刚发过：计入最小间隔与每小时上限
    parseId(id) -> kind | null,
    ALARM: 'jelly-errands-tick', PREFIX: 'jelly-errand-',
  }
```

- `tips()` 注入：返回 `[{text,type}]`，由 `background.js` 提供 `WARM_QUOTES`；控制器自己不含文案库。
- `open` 动作需要打开页面：注入 `openPage(kind)`（`task`/`brief` 打开新标签页首页任务入口，`worklog` 打开工作日志入口；具体 URL 在 Task 6 接线时按现有深链确定，控制器测试只验证被调用且参数是 kind）。
- 读数据源注入：`readMemos()`、`readWorklog()`，均只读。

- [ ] **Step 1: 写失败测试**，覆盖：
  - `set`：保存规范化结果；开启建周期闹钟（5 分钟），关闭清闹钟；非对象输入返回 `ok:false` 不写存储。
  - `fire`：总开关关、`gate` 不通过、没有候选 → 不调用 `presenter`；通过时恰好一次 `present`，`id` 以 `jelly-errand-<kind>-` 开头，按钮来自 `KINDS`，文字已清洗。
  - `present` 返回 `{shown:false}`、抛错、超时：不计入展示次数；歌曲/小乐子类静默，过期任务与日志类返回 `{fallback:true}` 供调用方退回系统通知（Task 7 用）。
  - `act`：`later`/`dismiss` → `recordOutcome(false)`；`open` → `recordOutcome(true)` 并调用 `openPage`；`more`（小乐子）→ 立即再出一条新内容，仍受 `seen` 去重；未知 id/动作 `ok:false` 且不改状态。
  - 状态只存当天：换日后 `shown/strikes/muted/seen` 清零；读取损坏的存储不覆盖原值。
  - `presence`：`onPresence('away')` 后 `fire` 不发；`onPresence('active')` 不足 20 秒不发，之后发。
  - `noteExternal`：之后 15 分钟内不发。
  - 并发：同时两次 `fire` 只发一条（串行队列，同 `jelly-nudge.js` 的 `serial`）。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 最小实现**（串行队列、`bounded()` 超时包装照抄 `jelly-nudge.js`，不重新发明）。
- [ ] **Step 4: 运行通过；`node --check`。**

## Task 3: 协议放宽（Chrome 侧 + Swift 纯逻辑）

**Files:** Modify `js/alarm-desktop.js:293-313`（`handleNudgeAction`）、`js/alarm-desktop.js:42-43`、`desktop-reminder/jelly-model.swift`（`nudgeKinds`、`nudgeActions`、`parseNudge`）、`desktop-reminder/companion-selftest.swift`、`test/alarm-desktop.test.js`、`test/desktop-companion-logic.test.mjs`。

- 新增 `JellyModel.nudgeKinds = ["water","stretch","brief","task","worklog","tidbit"]`；`nudgeActions = ["done","snooze","open","later","dismiss","more"]`。
- 新增 `JellyModel.nudgeButtonRules: [kind: Set<actionId>]`：`water/stretch → {done,snooze}`、`brief/task/worklog → {open,later}`、`tidbit → {more,dismiss}`；`parseNudge` 要求每个按钮 id 属于该类别的允许集合，否则整条 nil。
- 新增 `JellyModel.isPrimaryNudgeButton(kind:id:)`：`water/stretch` 的 `done`、`brief/task/worklog` 的 `open`、`tidbit` 的 `more` 为主按钮（控制器改用它代替写死的 `"done"`）。
- JS 侧同一份表放在 `JellyErrandsCore.KINDS`；`test/desktop-companion-logic.test.mjs` 逐类别逐按钮对照 Swift 与 JS（改一边必须改另一边）。
- `AlarmDesktop.handleNudgeAction` 把动作白名单从写死的 `['done','snooze']` 改为“按 id 前缀选择处理器与允许动作”；`onNudgeAction` 保留给 `jelly-nudge-`，新增 `onErrandAction` 给 `jelly-errand-`；两类都沿用 `nudgeHandled` 幂等表。

- [ ] Step 1–4：先在两个测试文件加失败用例（Swift 纯逻辑含：差事类别带非法按钮被拒、water 带 `open` 被拒、旧提醒不受影响、`ttl`/清洗不变；JS 含路由、幂等、失效 id），确认失败 → 实现 → 通过。运行：`node --test test/alarm-desktop.test.js test/desktop-companion-logic.test.mjs`。

## Task 4: `presence` 事件

**Files:** Modify `desktop-reminder/jelly-model.swift`（纯函数 `presenceState(idleSeconds:threshold:)`）、`desktop-reminder/jelly-controller.swift`、`js/alarm-desktop.js`（`message.type === 'presence'` → `onPresence`）、两个测试。

- 原生每 15 秒采样一次系统空闲秒数（只读，进程内 API 的选择在本任务第一步用 `swift` 小程序在本机实测后定：优先 `CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)`，不可用时退回 `IOHIDSystem` 的 `HIDIdleTime`；不可用的情况下不上报，Chrome 侧按 `active` 处理）。**采样只在水母常驻且可见时进行**，不常驻不采样。
- 只在两态**变化**时发 `{type:"presence", state}`；首次采样后也发一次当前态，让 Chrome 初始化。
- [ ] Step 1–4：纯函数自测（阈值边界 299/300/301、负数与 NaN 当 active）；JS 路由测试；控制器层用环境变量 `TIMEKEEPER_IDLE_SECONDS`（仅测试）注入。

## Task 5: 开口前游过来

**Files:** Modify `desktop-reminder/jelly-controller.swift`（`showNudge`）、`desktop-reminder/jelly-smoke.mjs`。

- 差事类别的 `showNudge`（`kind ∈ {brief,task,worklog,tidbit}`）：若水母可见但不在鼠标所在屏幕，沿用 `showRing` 的做法 `companion.hide(remember:false)` + `startAtRightEdgeOnce` 后 `companion.dash(toX: companion.centerX)`；已在鼠标屏幕则不动。气泡在 `dash` 完成回调里才出现；`reduceMotion` 下不游，直接在原位淡入。
- 喝水/起身（`water/stretch`）的行为**不变**。
- 响铃优先的现有规则不变：响铃中差事直接 `ok:false`。
- [ ] Step 1–4：`jelly-smoke.mjs` 新增 `--only=errand` 场景（隔离构建、合成鼠标，**运行期间不碰鼠标**，沿用 `user-quiet.mjs` 礼让）：差事气泡出现、按钮点击发出 `nudgeAction`、回执后收起、响铃中被拒。

## Task 6: 接线与设置页

**Files:** Modify `js/background.js`、`settings.html`、`js/settings-page.js`；Create `test/jelly-errands-integration.test.js`。

- `importScripts` 加入 `'jelly-errands-core.js', 'jelly-errands.js'`（在 `jelly-nudge.js` 之后）。
- `background.js` 在创建 `jellyNudge` 之后创建 `jellyErrands`；`desktopAlarm.onErrandAction = (m) => jellyErrands.act(m.id, m.action)`；`desktopAlarm.onPresence = s => jellyErrands.onPresence(s)`；`chrome.alarms.onAlarm` 新增监听调用 `jellyErrands.fire(alarm.name)`；`jellyNudge` 发出气泡后调用 `jellyErrands.noteExternal`（通过 `JellyNudge.create` 新增的可选 `onSent` 回调）。
- 消息 `jelly_errands_get/jelly_errands_set`，校验 `sender.id` 与 `sender.url`（同 `jelly_nudge_*`）。
- 设置页“桌面水母”卡片下新增“水母差事”区：总开关、活跃度三档、四类中的三类（任务/日志/小乐子）开关、“气泡里显示任务名”、时段与工作日。组件版本 < 8 时提示更新并更新组件后重载扩展。
- 版本钉子：`index.html` 无改动；`settings.html` 的 `settings-page.js?v=` 加一并同步对应契约测试。
- [ ] Step 1–4：接线合同测试（`importScripts` 顺序、`background.js` 沙箱片段不引用外部全局、源码扫描无 `innerHTML`/网络/新权限）→ 实现 → 通过。

## Task 7: 五个现有系统通知发送器改为“先水母后通知”

**Files:** Modify `js/background.js`（`sendDailySummary`、`checkOverdueTasks`、`sendWorklogReminder`、`checkWorklogProgress`、`sendWarmTipNotification`）。

- 仅当 `jellyErrands` 总开关已开且对应类别开启时，先调用控制器的 `offerOrFallback(kind, payload)`：水母在 3 秒内确认显示就**不再**发系统通知；`{fallback:true}` 才走原来的 `chrome.notifications.create`。总开关关闭时一字不改旧行为。
- 工作日志缺口的触发条件、检查点（12/15/17 点）、去重标记 `worklog_reminded_*` **不变**；只有水母接手成功后才写标记，退回系统通知时沿用原写入顺序。
- [ ] Step 1–4：沿用 `test/assistant-management.test.js` 的沙箱截取方式写合同测试，覆盖开/关、接手/回退、标记写入时机。

## Task 8: 文档、验证与交付

- [ ] 新增 `docs/technical/jelly-errands-20261017.md`（含：查过的 API、复用了哪些现有能力、系统空闲 API 的实测结论、设计稿修订的三点、验证结果、仍未验收的边界），并更新 `docs/technical/_index.md`。
- [ ] 同步 `AGENTS.md`：桌面水母条加入差事、`presence` 与“原生读系统空闲秒数”这一新读取点（说明与既有“不使用 chrome.idle”原则的区别与边界）。
- [ ] 验证并分层报告：`node --check` 全部改动脚本；`git diff --check`；相关 `node --test`（至少 jelly/alarm-desktop/desktop-companion-logic/assistant-management 及新增文件）；全量 `node --test`；隔离构建 `jelly-smoke.mjs --only=errand`、`bridge-smoke.mjs`；变异检查（预算、收敛、白名单、降级、主次按钮）只改 `/tmp` 副本，跑完逐个 `cmp` 核对仓库文件未被改动。
- [ ] 不声称已验收：真实 Chrome 156、真实闹钟与通知并存、全屏 Space、多显示器组合、VoiceOver、长时间 CPU 占用；重装组件与重载扩展由用户做。

## 自查记录

- **设计稿覆盖**：第 4 节第一期差事（概览/过期/日志/小乐子）→ Task 1–2、7；第 5 节调度规则 → Task 1–2；第 6 节协议 → Task 3–4（已按修订 1 改为复用 nudge）；第 7 节第一期部分（开口前游过来）→ Task 5，巡游与右键菜单留第三/二期；第 8 节设置 → Task 6；第 9–11 节 → Task 8。推荐歌曲整条留到第二期，不在本计划内。
- **类型一致**：`candidate.kind` 全程使用 `brief|task|worklog|tidbit`；差事 id 前缀统一 `jelly-errand-`；按钮 id 统一 `open|later|dismiss|more`。
