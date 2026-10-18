# 水母差事 第三期 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务执行（本项目禁止使用子代理，不用 subagent-driven-development）。步骤用 `- [ ]` 跟踪。

**Goal:** 让常驻的桌面水母“白天不再一直睡觉”：差事开着时它保持清醒，每隔几分钟自己在桌面上巡游一圈（按一天里的时段有不同性格），只在夜里、你离开电脑太久、或你关掉这项能力时才睡。

**Architecture:** 仍是“Chrome 唯一调度与执行，原生只显示与转发”——而这一期的行为（睡与不睡、什么时候游、游多久）**纯属水母自己的动作，不产生任何业务数据，也不向 Chrome 回报**，所以全部放在原生端：纯逻辑进 `jelly-model.swift`（`JellyBehavior`）与 `jelly-swim.swift`（`JellyTuning.patrol`），状态机进 `jelly-controller.swift`，物理仍是现有的 `JellySwim`（只换一份调校参数，不新造引擎）。Chrome 只多发一个开关 `errands.patrol`，并在设置页提供对应的勾选项。

**Tech Stack:** Swift/AppKit（`desktop-reminder/`）、原生 JS（UMD 模块）、`node --test`。

**工作位置:** worktree `~/worktrees/ctb-jelly-errands`，分支 `feat/jelly-errands`（基于 `a327fd0`，第一、二期改动仍未提交）。**不提交 Git**；不碰另外两个 worktree（`ctb-aquarium`、`ctb-jelly-appearance`）和主仓库。

## 对设计稿（`docs/superpowers/specs/2026-10-17-jelly-errands-design.md` 第 7、12 节）的细化与修订

设计稿只给了“每 3–8 分钟、持续 20–40 秒、然后回到泳线”“睡觉只在夜间 / 离开超过 10 分钟 / 差事关闭”“减少动态效果不巡游”“只在巡游与气泡时提速”。下面是实现方补的设计，写进技术文档，由用户在验收时校正：

1. **协议 v10**（v9 已被第二期占用）。v10 只在 v9 之上增量：`jelly` 命令的 `errands` 对象多一个可选布尔 `patrol`；回执版本 10；`ping` 回执多几项验收诊断。旧组件忽略 `patrol`（照旧睡觉），Chrome 设置页按组件版本提示“需要 v10”。原生**严格**读取：只有 `errands.enabled === true` 且 `errands.patrol === true` 才开启（缺省、`false`、别的写法都是老样子）。
2. **一个开关管两件事**：`patrol` 开 = “活动行为”开，水母（a）白天保持清醒、（b）偶尔巡游。关 = 回到老样子（休息就睡，哪怕差事开着）。这样“睡不睡”和“游不游”不会出现互相矛盾的组合。Chrome 侧该开关默认开，只有明确 `false` 才关；差事总开关关着时 Chrome 压根不带 `errands`，所以也没有活动行为。
3. **睡觉规则（`JellyBehavior.isAsleep`）**：活动行为关 → 休息就睡（老样子）；开 → 只有两种情况睡：**夜晚曲线 ≥ 0.5**（即 19:30–06:30，曲线半高处；不受“夜晚荧光”开关限制——荧光是视觉效果，睡觉是行为，关荧光不应让水母整夜清醒）或**系统空闲 ≥ 600 秒**（比 presence 的“离开”阈值 300 秒更慢：刚走开一会儿它不会立刻躺下）。读不到空闲秒数、负数、非有限值都按“在电脑前”，不睡。
4. **巡游条件（`JellyBehavior.canPatrol`）**：活动行为开 ∧ 水母常驻 ∧ 不是“减少动态效果” ∧ 倒计时不在临近阶段（`stage == .calm`，即剩余 > 10 分钟或根本没有倒计时；已经临近的倒计时水母自己就在游）∧ 没有“忙”的状态（响铃及收尾、差事/提醒气泡及其到位、详情与反馈气泡、被抓着、右键菜单打开、鼠标正停在水母上）∧ 不在睡觉 ∧ 空闲 < 300 秒（presence 为 active）。**时钟读数气泡不算“忙”**：有闹钟时它一直在，若算忙，有闹钟的人永远等不到巡游。
5. **调度**：条件满足且没有计时器时安排“一次性”的出发计时器（时长在该时段性格的区间里取随机）；出发时再核对一遍条件；巡游持续时长同样取随机；**任何一项条件不再满足就取消计时器、立刻结束进行中的巡游**，条件恢复后重新计一段完整的等待（回到电脑前不会立刻被拉去游）。巡游结束或被打断都**只是让水母沉回泳线**（设计稿“回到泳线”），不游回原位——差事气泡、响铃本来就有自己的位置逻辑，用户也随时可以把它拖到别处。
6. **时段性格（`JellyBehavior.personality(hour:)`）**：设计稿没定义，实现方定六档（本地小时，半开区间）：

   | 时段 | 性格 | 出发间隔（分钟） | 巡游时长（秒） | 游速倍率 | 小动作间隔（秒） |
   |---|---|---|---|---|---|
   | 06–09 | 精神 | 3–5 | 30–40 | 1.15 | 15–30 |
   | 09–12 | 专注 | 4–6 | 25–35 | 1.0 | 25–45 |
   | 12–14 | 犯懒 | 6–8 | 20–28 | 0.75 | 45–90 |
   | 14–18 | 忙碌 | 4–6 | 25–40 | 1.05 | 20–40 |
   | 18–20 | 悠闲 | 5–8 | 25–35 | 0.85 | 30–60 |
   | 20–06 | 睡眠 | —（夜里不巡游） | — | — | — |

   所有区间都落在设计稿的“3–8 分钟 / 20–40 秒”之内；非有限小时按白天（专注）。这是视觉性格，不是对用户状态的判断。
7. **小动作（fidget）**：清醒的水母静止时是不眨眼的定格（没有动画帧，零 CPU），看起来像塑像。所以清醒且不忙时，每隔“小动作间隔”让它原地小跳一下（复用现有 `swim.poke()`，同“点一下”的跳，只是不弹详情气泡），回落后重新静止。减少动态效果时没有小动作。这是对设计稿的补充，目的只有一个：清醒不等于僵住。
8. **性能边界**：空闲清醒时仍是 30 秒一次的刷新与零动画帧；只有巡游（30 fps，物理）和小动作（约 1 秒）期间才出帧。CPU 数字必须在隔离环境实测后写进文档，不得凭估计。
9. **不做**：全屏/屏幕共享时抑制巡游（没有公开、可靠的判定；写进已知边界，用户可在设置里关掉巡游）；跨屏巡游（只在水母当前所在屏幕的泳线上游）；让巡游影响任何业务状态或向 Chrome 回报。

## Global Constraints

- 巡游、睡觉、小动作**不得**触发任何 Chrome 动作、业务回执、通知、网络或存储写入（原生只存窗口位置，且巡游不改写它）。
- 不新增权限、网络目标、依赖；不新增 Swift 源文件（只改 `jelly-model.swift`、`jelly-swim.swift`、`jelly-companion.swift`、`jelly-controller.swift`、`main.swift`、`companion-selftest.swift`），所以 `build.mjs` 清单不变。
- 原生严格解析 `errands.patrol`；时段区间的纯逻辑只有 Swift 一份（JS 不需要知道性格，不做第二份实现）。
- 测试钩子只在 `TIMEKEEPER_TEST_HOOKS=1` 时生效：`TIMEKEEPER_PATROL_SECONDS="出发,时长,小动作"`（秒，逗号分隔，用于让验收不必等几分钟；任一项不是正有限数就整条忽略）。`TIMEKEEPER_IDLE_SECONDS`（第一期已有）与 `TIMEKEEPER_NIGHT_HOUR`、`TIMEKEEPER_REDUCE_MOTION` 照旧。
- 验收脚本礼让用户（`user-quiet.mjs`）、巡游验收期间**不碰鼠标**（水母按指针所在屏幕选落点）、不做整屏截图，只 `screencapture -l` 自家窗口；变异检查只改 `/tmp` 副本并逐个 `cmp` 核对仓库文件未变。
- `userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的 `js/background.js` 片段不得引用片段外全局（新钩子接在差事接线块里）。
- 版本钉：`settings-page.js?v=12 → 13`（同步更新所有钉子测试）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `desktop-reminder/jelly-model.swift` | 改 | `State.patrol` 与严格解析；`JellyBehavior`（`isAsleep`、`canPatrol`、`personality`、取随机、测试覆盖解析） |
| `desktop-reminder/jelly-swim.swift` | 改 | `JellyTuning.patrol(pace:)`（周期、水平/垂直冲量按“上升≈下沉”标定） |
| `desktop-reminder/jelly-companion.swift` | 改 | `JellyInfo.patrol`（巡游调校；非 nil 时不休息）、`isPointerOver` |
| `desktop-reminder/jelly-controller.swift` | 改 | 巡游/小动作状态机、`noteIdle`、菜单打开状态、睡觉判定接入 `awake`、验收诊断 |
| `desktop-reminder/main.swift` | 改 | 回执版本 10、`samplePresence` 把空闲秒数交给控制器、`ping` 诊断字段 |
| `desktop-reminder/companion-selftest.swift` | 改 | 新纯逻辑自测（独立写出的期望表） |
| `desktop-reminder/jelly-smoke.mjs` `bridge-smoke.mjs` 及其余 5 个冒烟脚本 | 改 | 巡游阶段、CPU 实测、联调；版本断言 9→10 |
| `js/jelly-errands-core.js` | 改 | `normalize` 增 `patrol`（默认 true，仅明确 `false` 才关） |
| `js/jelly-desktop.js` | 改 | `errands` 下发带 `patrol`；新钩子 `errandsPatrol` |
| `js/background.js` | 改 | 接线 `jellyDesktop.errandsPatrol` |
| `js/jelly-errands.js` | 视需要 | 配置读写若只透传 `normalize` 则不动 |
| `js/settings-page.js` `settings.html` | 改 | “巡游”勾选与文案、版本提示（需要 v10）、脚本版本钉 |
| 各测试文件 | 改/新建 | 见各任务 |

---

## Task 1: 纯逻辑（Swift，先写测试）

**Files:** Modify `desktop-reminder/companion-selftest.swift`、`desktop-reminder/jelly-model.swift`、`desktop-reminder/jelly-swim.swift`。

- [x] **Step 1: 在 `companion-selftest.swift` 加“协议 v10：巡游与睡觉规则”测试块（期望值独立写成字面量，不从被测代码推出来）**
  - `parseState`：`errands:{enabled:true, patrol:true}` → `errands && patrol`；`patrol` 缺省/`false`/`1`/`"true"` → 没有 patrol；`enabled:false` 或没有 `errands` 时 `patrol:true` 也不生效。
  - `isAsleep` 真值表：活动行为关 → 恒睡；开且白天且在电脑前 → 不睡；夜晚曲线 0.49 不睡、0.5 睡；空闲 599.9 不睡、600 睡；`nil`、负数、`NaN`、`∞` 空闲不睡；夜晚 `NaN` 不睡。
  - `canPatrol` 逐项关闭：活动行为、常驻、减少动态、阶段非 `calm`、忙、夜晚、空闲 ≥ 300（边界 299.9 可 / 300 不可）、睡觉中——每一项单独为假都得不可；全满足得可。
  - `personality`：0–23 点逐小时的名字与关键数值（对着上表的字面量）、边界 5.99/6/8.99/9/11.99/12/13.99/14/17.99/18/19.99/20、`NaN`/负数/≥24 的处理；夜里没有巡游（`patrol == nil`）；所有时段的区间都在 3–8 分钟、20–40 秒之内。
  - 取随机：随机数取 0 与 1 分别得到区间两端；`overridePatrolSeconds("1,3,2")` 得 `(1,3,2)`，缺项/非数/零/负/`∞`/多项都得 `nil`。
  - `JellyTuning.patrol(pace:)`：pace 1 时 `period/thrustX/thrustY/hover` 的字面量；pace 0.75/1.15 的周期反比；`thrustY` 与公式 `1.4·sink·T/(1−e^(−dragY·T))` 一致（允许 ±1）；`pace` 非有限或 ≤ 0 时按 1。
  - 物理分布：用 `JellySwim.step` 以 seeded 随机各跑 pace 0.75/1.0/1.15 共 5 分钟——不沉到泳线以下、不越界、超过 60 点高度 < 5%、平均高度接近 hover、水平 30 秒内平均走过 ≥ 300 点；`wantsRest = true` 后在 20 秒内落回泳线并静止。
- [x] **Step 2: 跑 `node --test test/desktop-companion-logic.test.mjs`，确认新增断言因缺少实现而失败（红）。**
- [x] **Step 3: 实现 `JellyBehavior`、`JellyTuning.patrol`、`State.patrol` 解析，再跑到全绿。**

## Task 2: 原生控制器与接线（AppKit）

**Files:** Modify `jelly-companion.swift`、`jelly-controller.swift`、`main.swift`。

- [x] **Step 1:** `JellyInfo` 增加 `patrol: JellyTuning?`；`JellyCompanion.update` 在 `patrol != nil` 时用它替换 `forStage` 的调校且不休息；增 `isPointerOver`。
- [x] **Step 2:** 控制器：状态 `lively/patrolling/patrolCount/patrolTimer/fidgetTimer/idleSeconds/menuOpen`；`refresh()` 末尾调用 `evaluateBehavior()`（核对资格、安排或取消计时器、结束巡游）；`awake` 并入 `lively && !asleep`；`NSMenuDelegate.menuWillOpen/menuDidClose`；`grabBegan/grabEnded` 触发重新核对；`setJelly` 读 `State.patrol`；`updateVisibility` 在隐藏分支清理两个计时器与巡游状态。
- [x] **Step 3:** `main.swift`：回执版本 10；`samplePresence` 在去重判断之前把空闲秒数交给 `jelly.noteIdle`；`ping` 回执加 `jellyAsleep/jellyLively/patrolling/patrolCount/personality`。
- [x] **Step 4:** 编译（`build.mjs` 隔离构建），再跑逻辑测试，确认没有破坏已有场景。

## Task 3: Chrome 侧（开关与设置页）

**Files:** Modify `js/jelly-errands-core.js`、`js/jelly-desktop.js`、`js/background.js`、`js/settings-page.js`、`settings.html`；Test `test/jelly-errands-core.test.js`、`test/jelly-desktop.test.js`、`test/jelly-errands-integration.test.js`、设置页相关测试及版本钉子测试。

- [x] **Step 1（先写测试）:** `normalize`：缺省/`undefined`/非布尔都得 `patrol:true`，只有明确 `false` 才得 `false`，旧配置（没有 `patrol` 键）读出 `true`；`jelly-desktop`：`errandsEnabled` 为真时 `errands` 一律带 `patrol` 布尔，`errandsPatrol` 钩子严格 `true` 才为 `true`、抛错/缺失/`"true"` 都为 `false`；`errandsEnabled` 不为真时仍不带 `errands`；设置页：`set-errandsPatrol` 读写、版本 < 10 的提示、控件在 `ERRANDS_IDS` 里被统一禁用/启用。
- [x] **Step 2:** 实现，跑相关测试到全绿；`settings-page.js?v=13` 并更新全部钉子测试。

## Task 4: 隔离验收脚本

**Files:** Modify `desktop-reminder/jelly-smoke.mjs`、`bridge-smoke.mjs`、`countdown/confirmation/interaction/assistant-smoke.mjs`。

- [x] 版本断言 9→10（7 处）。
- [x] `jelly-smoke.mjs` 新增 `--only=patrol` 阶段（用 `TIMEKEEPER_PATROL_SECONDS` 与 `TIMEKEEPER_IDLE_SECONDS`、`TIMEKEEPER_NIGHT_HOUR`、`TIMEKEEPER_REDUCE_MOTION`）：①不带 `errands`（老样子）→ 水母休息就睡、不巡游；②带 `errands:{enabled:true, patrol:false}` → 同样；③开 → 白天清醒（`jellyAsleep:false`）、出发后窗口横向真的在动、结束后沉回泳线并静止；④夜里（`NIGHT_HOUR=23`）→ 睡、不巡游；⑤空闲 400 秒 → 清醒但不巡游，700 秒 → 睡；⑥减少动态效果 → 清醒但不巡游也没有小动作；⑦巡游中来差事气泡/响铃 → 立刻结束巡游；⑧巡游中右键菜单打开（用 `menuItem` 钩子的检查路径之外，另以控制器诊断核对 `menuOpen`）→ 不出发；⑨小动作：清醒不忙时窗口在小动作间隔内出现一次纵向起伏；⑩钩子关闭（没有 `TEST_HOOKS`）时环境变量不生效。
- [x] CPU 实测：同一进程分别量 睡着 / 清醒静止 / 巡游中 / 小动作 的 `cputime` 增量除以墙钟时间，结果写进技术文档，不凭估计。
- [x] `bridge-smoke.mjs` 加一段：真实 `JellyDesktop` 在 `errandsEnabled/errandsPatrol` 为真时下发 `errands:{enabled:true, patrol:true}`，原生 `ping` 显示 `jellyLively:true`；关掉 `patrol` 再同步 → `jellyLively:false`。

## Task 5: 全面验证

- [x] 全量 `node --test`（临时软链主仓库的 `node_modules`，结束后 `unlink`）；`node --check`；`git diff --check`。
- [x] 隔离原生冒烟：`jelly-smoke`（含 `--no-mouse`）、`bridge-smoke --no-mouse`、`countdown/confirmation/interaction-smoke`；`assistant-smoke` 礼让用户后重跑（本期只改了 `main.swift` 的版本号与 `jelly-*`，仍按改动面重跑）。
- [x] 三层变异检查（Chrome 侧 JS、Swift 纯逻辑、AppKit 控制器），只改 `/tmp` 副本；存活者逐个分析（等价 / 冗余保护 / 真缺口——真缺口要补测试）；`cmp` 证明仓库文件未变。

## Task 6: 文档

- [x] `docs/technical/jelly-errands-20261017.md` 增“第 3 期（协议 v10）”：复用了什么、设计取舍（上面各条）、API/限制、时段表、CPU 实测数字、验证结果分层、已知边界（全屏/屏幕共享不抑制、只在当前屏幕泳线、真实 Chrome/账号/多屏/全屏 Space 未验收）。
- [x] `docs/technical/_index.md`、`desktop-reminder/README.md`（协议 v10 一节与安装/更新提示）、`AGENTS.md`“水母差事”条同步。
- [x] 最终分层报告（中文）：静态检查、业务替身测试、隔离原生冒烟、真实 Chrome、真实账号分别写；提醒用户重装 v10 组件并重载扩展、与另两个 worktree 的潜在合并冲突、未提交。

---

## 实际执行与计划的差异（2026-10-18 收尾时补记）

计划里的 19 个步骤都已完成，结果见 `docs/technical/jelly-errands-20261017.md` 的“第 3 期最终结果”。与计划不同的地方：

1. **`ping` 诊断比计划多两项**：`patrolPace`（最近一次巡游的游速倍率）与 `swimPeriod`（水母此刻实际在用的脉动周期）。变异检查发现“巡游调校没有交给水母”“游速倍率固定为 1”这类变异原先没有断言能抓到，加诊断后才可观察。
2. **出发 / 时长 / 小动作的取值放进了纯逻辑**（`patrolDelaySeconds` / `patrolDurationSeconds` / `fidgetSeconds`），而不是只在控制器里：验收用的计时覆盖会绕过控制器里的“分钟→秒”换算，真实路径只能由纯逻辑自测守住。
3. **CPU 实测**按计划量了睡着 / 清醒静止 / 巡游中 / 小动作四种状态（小动作那一行只是上限估计：验收里每 3.5 秒跳一次，真实间隔是 15–90 秒）。
4. **新增验收场景**（变异检查暴露的缺口）：“出发前被打断：旧出发计时器作废，收起后重新等满一个完整的时间”“真实鼠标：停在水母身上时没有小动作，移开后才继续”；巡游时长从整数秒改成 5.5 秒（整数秒与每秒刷新重合，会掩盖“巡游自然结束后不刷新”）；真实鼠标场景提炼成 `mouseScenario`，结束后把指针停到别处（`parkPointer`）。
5. **小动作到点时重新核对资格**（计划没写）：鼠标移到水母身上没有事件通知，旧的小动作计时器不核对的话水母会在鼠标底下突然跳走。
6. **Task 4 ⑧**：计划写“以控制器诊断核对 `menuOpen`”，实际用测试钩子命令 `menuTracking {open}`（走与 AppKit 打开 / 关闭右键菜单相同的委托入口）。
7. **没有新增 Swift 源文件**，`build.mjs` 清单与 `desktop-companion-logic.test.mjs` 的源文件合同未变，与计划一致。
