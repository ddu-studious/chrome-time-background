# 到点响铃水母气泡 Implementation Plan

> **执行方式：** 本项目禁止使用子代理（`.cursor/rules/no-subagent.mdc`），所以用 `superpowers:executing-plans` 在当前会话里逐任务内联执行。步骤用 `- [ ]` 勾选。项目规则：**不提交 Git**（所以没有 commit 步骤，每个任务以 `git diff --stat` 记录范围）、保留与本任务无关的未提交改动、不重置/不清理、不加依赖/权限/网络。

**Goal:** 用桌面水母的“响铃气泡”取代原生到点提醒的深色卡片：水母游到屏幕底部正中，弹出跟随系统深浅色的玻璃气泡（时间最大 → 标题 → 通栏胶囊按钮），涟漪循环；点按钮后等 Chrome 回执才显示确认并游回；所有水母气泡一起跟随系统深浅色。

**Architecture:** Chrome 仍是闹钟/贪睡/会话结束的唯一所有者，`show` 协议仍为 v6，只多三个可选字段。原生端新增纯逻辑（`JellyModel.Ring` 解析与文案、`JellyDash` 缓动、`JellyBubblePalette` 配色与对比度，三者由 Swift 自测编译验证）和 AppKit 绘制（`jelly-ring.swift`：版式、气泡、涟漪、胶囊按钮），响铃状态机放进 `JellyController`，`main.swift` 删除旧卡片只留路由。设计与已批准的取舍见 `docs/technical/jelly-ring-alarm-20261016.md`。

**Tech Stack:** 原生 JavaScript（`js/alarm-desktop.js`，`node --test`）；Swift 5.8 + AppKit/CoreGraphics（`xcrun swiftc`，无第三方库）；验收脚本为 Node ESM（`desktop-reminder/*.mjs`，真实原生进程 + 合成鼠标 + `screencapture -l` 自家窗口）。

## Global Constraints

- 回复与文档用中文（代码标识符除外）；不使用子代理；不提交 Git；不发布。
- 不新增依赖、权限、网络、摄像头/麦克风/`chrome.idle`；不改闹钟与倒计时业务、声音、`alarm-ring.html`、闹钟中心响铃浮层、系统通知、`drawAttention` 与重要闹钟网页窗口的退路。
- 协议仍为 v6：`show` 只新增可选字段 `clock`（`^\d{1,2}:\d{2}$`）、`labels`（≤3 个、每个清洗后 ≤40 字符）、`more`（0…99）；既有字段与校验不变（`sessionId` 非空 ≤200、`title` ≤320、`canSnooze` 只有明确 `true`、`snoozeMinutes` 1…60）。
- 按钮动作发 `action {sessionId, actionId, action, minutes}`，**收到匹配的 `actionResult` 才显示成功**；`actionId` 幂等；8 秒无回执提示“Chrome 尚未确认，请重试或在浏览器中处理”并恢复按钮；迟到、不匹配的回执一律忽略；原生端不保存业务状态，只存水母窗口位置 `CompanionX`，**响铃自身不改写它**（用户拖动除外）。
- 弹出后 **0.5 秒内忽略点击**；确认语显示 **1.4 秒**；响铃期间到来的喝水/起身提醒气泡直接拒绝（回 `ok:false`，Chrome 退回系统通知）。
- Chrome 的真实调用顺序是**先 `hide`、后 `actionResult`**（`background.js` 的 `desktopAlarm` 回调与 `stopUserAlarmSession` 都在返回回执之前 `hide`）：原生端收到 `hide` 时若有等待中的动作，要再等回执（≤1.5 秒）才收尾，回执到了才显示确认；Chrome 侧 `AlarmDesktop` 在响铃会话 `hide` 后至少再保持连接 5 秒。
- 水母窗口外圈 8 点 alpha ≤ 1（光晕与气泡阴影不能被透明窗口截成方框）；响铃气泡的 `edge` 为 28（其他气泡仍是 14）。
- “减少动态效果”（含 `TIMEKEEPER_REDUCE_MOTION=1`）下水母不游动，只淡入；涟漪画成静止两圈；不弹跳。
- 隔离验收：独立构建 `--app=/tmp/tk/QA.app`（Bundle ID `com.timekeeper.desktop.qa`）；禁止整屏/区域截图，只 `screencapture -l <自家窗口号>`；合成鼠标只点水母自己的窗口；测试钩子仅在 `TIMEKEEPER_TEST_HOOKS=1` 时可用；`TIMEKEEPER_APPEARANCE=light|dark` 仅测试用。
- 新增原生源文件必须同步 `desktop-reminder/build.mjs` 清单与 `test/desktop-companion-logic.test.mjs`（构建顺序断言与自测编译命令）。
- `js/background.js` 里 `userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的代码会被 `test/assistant-management.test.js` 截取沙箱执行，本计划不改 `background.js`。
- 缓存、虚拟环境、截图等临时产物放 `/tmp`，不放仓库根目录（它就是 Chrome 扩展目录）。
- 视觉取值（尺寸、颜色、动效）是初始值，必须以真实截图校准；对比度由自测守住（正文 ≥4.5:1、大号时间 ≥3:1，浅/深两套都要过）。
- 分层报告：静态检查、Swift 纯逻辑自测、Chrome 业务替身测试、隔离原生进程（含截图）、真实 Chrome 扩展、真实账号——互不替代，真实 Chrome 与真实闹钟到点本计划**不能**验收。
- 完成代码修改后，用一行简述自查结果（安全基线：本次无新增外部请求、无新增权限、输入长度与字符均有界清洗）。

## 与设计文档的差异（实现时以此为准，完成后回写设计文档）

1. **新增两个源文件**：`jelly-palette.swift`（纯逻辑，配色与对比度，可单独编译自测）与 `jelly-ring.swift`（AppKit，版式/涟漪/气泡绘制/胶囊按钮）；设计文档只写了后者。
2. **配色按对比度自测调整**：设计文档的初始色值里浅色状态青 `#1b7a96`（4.16）、错误红 `#d9433a`（3.69）、深色错误 `#ff7a70`（4.13）在“半透明底板叠在纯白/纯黑上取更差者”的口径下低于 4.5。实现采用 浅色状态 `#14708a`（4.78）、成功 `#1d7348`（4.93）、错误 `#bd3027`（4.91），深色错误 `#ff9087`（4.79）；主按钮渐变 `#14809b → #0b6b86`、白字（4.57 / 6.07）。
3. **跨屏**：水母在别的屏幕时，原屏上直接消失、目标屏幕右边淡入（设计写的是“先淡出”）；多显示器本机无法实测。
4. **游动带一道轻弧**：冲刺在水平路程较长时有最高 18 点的小拱起（起点终点都在泳线上），让它像“游”而不是“滑”；窗口垂直位置因此在冲刺中最多抬高 18 点。
5. **`visible` 语义**：`reply.visible` = 响铃进行中且水母窗口在屏幕上（收到被接受的 `show` 即为 true；成功回执后到确认语结束、水母开始离开才变 false 之前仍为 true）。新增回执字段 `ringPhase`（`none|arriving|shown`）、`ringStatus`、`ringLane`。
6. **测试钩子 `ringButton {id}`**：与 `menuItem` 同一把钥匙（`TIMEKEEPER_TEST_HOOKS=1`），直接走按钮的动作入口（含 0.5 秒防误触），让“防误触窗口”的测试不依赖鼠标时序。
7. **确认语期间按钮收起**（像喝水气泡的做法），状态行显示确认语。

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `js/alarm-desktop.js` | 改 | `show` 多发 `clock/labels/more`；新增 `AlarmDesktop.clockText`；`hide` 在响铃会话结束后保持连接 ≥5 秒（`holdUntil`） |
| `test/alarm-desktop.test.js` | 改 | 可选字段与连接保持期的测试 |
| `desktop-reminder/jelly-model.swift` | 改 | `Ring`/`parseRing`/时间解析/标题行摘要/按钮/确认语/时序常量；`BubbleKind.ring`；`shouldShow`、`bubbleKind` 含响铃 |
| `desktop-reminder/jelly-swim.swift` | 改 | `JellyDash`（三次缓动、距离相关时长、轻弧）、`JellySwim.startDash/dash/dashEnded`、`contraction(atPhase:)` |
| `desktop-reminder/jelly-palette.swift` | 新 | `JellyRGB`、`JellyBubblePalette.light/dark`、对比度计算（纯逻辑） |
| `desktop-reminder/companion-selftest.swift` | 改 | 以上纯逻辑的自测 |
| `desktop-reminder/jelly-ring.swift` | 新 | `JellyRingLayout`（版式）、`JellyRingPainter`（气泡、涟漪、弹出曲线）、`JellyPillButton`、`NSColor(JellyRGB)` |
| `desktop-reminder/jelly-companion.swift` | 改 | `.ring` 气泡种类与 `clock`、去 `.aqua` 并按外观取色、涟漪/弹出/脉动、冲刺 API、`show(from:)`/`hide(remember:)`、落点/家/退场位置 |
| `desktop-reminder/jelly-controller.swift` | 改 | 响铃状态机（`showRing/hideRing/ringActionResult/...`）、去掉 `isRinging` 回调与 `retire` 动画、`showNudge` 响铃期间拒绝、回执字段 |
| `desktop-reminder/main.swift` | 改 | 删旧卡片界面，`show/hide/actionResult` 路由到水母，`respond()` 字段，`--demo`，状态栏“显示当前提醒”，`ringButton` 钩子，`TIMEKEEPER_APPEARANCE` |
| `desktop-reminder/build.mjs` | 改 | 清单加入两个新文件 |
| `test/desktop-companion-logic.test.mjs` | 改 | 构建顺序、`main.swift` 合同、自测编译命令 |
| `desktop-reminder/jelly-smoke.mjs` | 改 | 响铃阶段（落点、防误触、回执门槛、失败重试、无回执、hide 顺序、替换、拒绝喝水气泡、常驻返回、`CompanionX`、浅/深截图与外圈 alpha、减少动态效果）、`--only=ring` |
| `desktop-reminder/bridge-smoke.mjs` | 改 | 真实 `AlarmDesktop` ↔ 真实原生进程：`show → action → hide → actionResult → 确认 → 离开` |
| `desktop-reminder/smoke.mjs` | 改 | 手动冒烟的提示文字与“确认后气泡收起”的轮询 |
| 文档 | 改 | 设计文档（状态与差异）、`desktop-reminder/README.md`、`AGENTS.md`、`docs/technical/_index.md`、`jellyfish-resident-companion-20261016.md`、`alarm-countdown-companion-20261015.md` |

## 基线（已记录）

`node --test test/desktop-companion-logic.test.mjs test/alarm-desktop.test.js`：30 项全部通过（Swift 自测编译约 17 秒）。Node v25.9.0，Swift 5.8.1。

## 快速自测脚本（本计划各任务反复使用）

```sh
cat > /tmp/selftest.sh <<'EOF'
#!/bin/sh
# 编译并运行 companion-selftest（纯逻辑），只打印失败项与总结
set -e
cd /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background
rm -rf /tmp/st && mkdir -p /tmp/st
cp desktop-reminder/companion-selftest.swift /tmp/st/main.swift
FILES="desktop-reminder/countdown-model.swift desktop-reminder/jelly-model.swift desktop-reminder/jelly-swim.swift"
[ -f desktop-reminder/jelly-palette.swift ] && FILES="$FILES desktop-reminder/jelly-palette.swift"
/usr/bin/xcrun swiftc $FILES /tmp/st/main.swift -module-cache-path /tmp/st/cache -o /tmp/st/selftest
/tmp/st/selftest | grep -E '^FAIL|ALL PASS|FAILED' || true
EOF
chmod +x /tmp/selftest.sh
```

---

## Task 1: Chrome 侧 — `show` 可选字段与响铃后保持连接

**Files:**
- Modify: `js/alarm-desktop.js`（构造函数、`show`、`hide`、`releaseWhenIdle`）
- Test: `test/alarm-desktop.test.js`

**Interfaces:**
- Produces: `show` 载荷多出 `clock`（`"HH:mm"`，时间无效时无此键）、`labels`（清洗后的名字，≤3 个、每个 ≤40 字符，没有可用名字时无此键）、`more`（0…99，仅在有 `labels` 时发送）；`AlarmDesktop.clockText(ms|Date|string) -> string`；`this.holdUntil`（毫秒时间戳，响铃会话 `hide` 后 = 现在 + 5000）；`releaseWhenIdle(delayMs = 2000)`。
- 旧字段 `sessionId/title/timeText/canSnooze/snoozeMinutes` 与 `hide` 的消息格式不变。

- [ ] **Step 1: 写失败的测试**

在 `test/alarm-desktop.test.js` 里 “原生展示传递当前会话与可用操作…” 那条测试之后插入：

```js
test('show 附带响铃气泡用的可选字段：clock、labels（空白名字不收）、more；旧字段保持不变', async () => {
  const f = fixture();
  const at = new Date(2026, 9, 16, 9, 5).getTime();
  const occurrence = label => ({ label, snoozeMinutes: 7, snoozeLimit: 3, snoozeCount: 0 });
  await f.bridge.show({ id: 'ring-fields', scheduledAt: at, occurrences: [occurrence('开会'), occurrence('  '), occurrence('喝水')] });
  const sent = f.sent[0];
  assert.equal(sent.clock, '09:05');
  assert.deepEqual(sent.labels, ['开会', '喝水'], '空白名字不进 labels');
  assert.equal(sent.more, 0);
  assert.equal(sent.title, '开会；  ；喝水', '旧字段 title 沿用原拼接');
  assert.equal(typeof sent.timeText, 'string'); assert.equal(sent.canSnooze, true); assert.equal(sent.snoozeMinutes, 7);
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('show 的 labels 最多 3 个、每个最多 40 字符，其余计入 more（上限 99）', async () => {
  const f = fixture();
  const many = Array.from({ length: 120 }, (_, i) => ({ label: i === 0 ? '长'.repeat(60) : `闹钟${i}`, snoozeMinutes: 10, snoozeLimit: 0, snoozeCount: 0 }));
  await f.bridge.show({ id: 'ring-many', scheduledAt: Date.now(), occurrences: many });
  const sent = f.sent[0];
  assert.equal(sent.labels.length, 3); assert.equal(sent.labels[0].length, 40); assert.deepEqual(sent.labels.slice(1), ['闹钟1', '闹钟2']);
  assert.equal(sent.more, 99); assert.equal(sent.canSnooze, false);
  await f.bridge.show({ id: 'ring-five', scheduledAt: Date.now(), occurrences: many.slice(0, 5) });
  assert.equal(f.sent[1].labels.length, 3); assert.equal(f.sent[1].more, 2);
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('show 的 clock：午夜是 00:xx（不是 24:xx）；时间无效不带 clock；没有可用名字不带 labels 与 more', async () => {
  const f = fixture();
  await f.bridge.show({ id: 'ring-midnight', scheduledAt: new Date(2026, 9, 17, 0, 7).getTime(), occurrences: [{ label: '', snoozeMinutes: 10 }] });
  assert.equal(f.sent[0].clock, '00:07'); assert.equal('labels' in f.sent[0], false); assert.equal('more' in f.sent[0], false);
  await f.bridge.show({ id: 'ring-bad-time', scheduledAt: 'not-a-time', occurrences: [{ label: '开会', snoozeMinutes: 10 }] });
  assert.equal('clock' in f.sent[1], false); assert.deepEqual(f.sent[1].labels, ['开会']); assert.equal(f.sent[1].more, 0);
  assert.equal(AlarmDesktop.clockText(new Date(2026, 9, 16, 23, 59)), '23:59'); assert.equal(AlarmDesktop.clockText(NaN), '');
  clearTimeout(f.bridge.idleTimer); f.port.disconnect();
});

test('响铃会话结束后至少再保持连接 5 秒（水母要显示确认并游走），别处触发的空闲释放不能提前断开；没有响铃会话的 hide 仍是 2 秒', async () => {
  const timers = test.mock.timers;
  timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  try {
    const f = fixture();
    await f.bridge.show(session);
    f.bridge.hide(session.id);
    timers.tick(2100); assert.equal(f.port.closed, false, '响铃刚结束，2 秒时连接仍保持');
    f.bridge.releaseWhenIdle();      // 例如倒计时同步完成后的空闲释放
    timers.tick(2100); assert.equal(f.port.closed, false, '别处触发的空闲释放不能把保持期缩短');
    timers.tick(1500); assert.equal(f.port.closed, true, '保持期（5 秒）过后才断开');
    const g = fixture(); await g.bridge.status();
    timers.tick(2100); assert.equal(g.port.closed, true, '没有响铃会话时仍是 2 秒');
  } finally { timers.reset(); }
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test test/alarm-desktop.test.js`
Expected: 新增 4 条里至少前 3 条 FAIL（`sent.clock` 为 `undefined`），第 4 条 FAIL（2.1 秒时已断开）；其余既有测试 PASS。

- [ ] **Step 3: 实现**

`js/alarm-desktop.js` 构造函数里，`this.handled = ...; this.idleTimer = null;` 那一行之后加一行：

```js
      this.holdUntil = 0;   // 响铃会话结束后水母还要显示确认并游走：这个时刻之前不因空闲断开连接
```

把 `async show(session) {...}` 整个方法替换为（并在其后新增 `static clockText`）：

```js
    async show(session) {
      clearTimeout(this.idleTimer);
      this.sessionId = session.id;
      const first = session.occurrences[0];
      const names = session.occurrences.map(item => String(item?.label ?? '').trim()).filter(Boolean);
      const payload = {
        sessionId: session.id,
        title: session.occurrences.map(item => item.label).join('；').slice(0, 320),
        timeText: new Date(session.scheduledAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        canSnooze: session.occurrences.some(item => Number(item.snoozeCount || 0) < Number(item.snoozeLimit || 0)),
        snoozeMinutes: Math.max(1, Math.min(60, Number(first.snoozeMinutes) || 10))
      };
      // 响铃气泡的可选字段（协议仍是 v6，旧组件会忽略；原生端各自有兜底）：计划时间、最多 3 个名字、其余个数
      const clock = AlarmDesktop.clockText(session.scheduledAt);
      if (clock) payload.clock = clock;
      if (names.length) {
        payload.labels = names.slice(0, 3).map(name => name.slice(0, 40));
        payload.more = Math.min(99, Math.max(0, names.length - 3));
      }
      try { return await this.request('show', payload); } catch (error) {
        this.sessionId = null; this.releaseWhenIdle();
        throw error;
      }
    }
    static clockText(value) {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return '';
      const text = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      return /^\d{1,2}:\d{2}$/.test(text) ? text : '';
    }
```

把 `releaseWhenIdle()` 与 `hide(sessionId)` 两个方法替换为：

```js
    releaseWhenIdle(delayMs = 2000) {
      clearTimeout(this.idleTimer); this.idleTimer = null;
      if (this.sessionId || this.countdownId || this.confirmationId || this.nudgeId || this.resident || !this.port) return;
      const port = this.port;
      // 响铃会话刚结束时，水母还在显示确认语并游走：至少保持到 holdUntil，别处触发的释放不能把它缩短
      const wait = Math.max(delayMs, this.holdUntil - Date.now());
      this.idleTimer = setTimeout(() => {
        if (this.port === port && !this.sessionId && !this.countdownId && !this.confirmationId && !this.nudgeId && !this.resident && !this.pending.size) {
          this.releasePort(port, null, { disconnect: true, notify: false });
        }
      }, wait);
    }
    hide(sessionId) {
      if (!this.port || (sessionId && this.sessionId !== sessionId)) return;
      const port = this.port;
      const ringing = this.sessionId != null;
      try { port.postMessage({ command: 'hide', sessionId: this.sessionId }); }
      catch (error) { this.releasePort(port, error, { disconnect: true }); return; }
      this.sessionId = null;
      if (ringing) this.holdUntil = Date.now() + 5000;
      this.releaseWhenIdle();
    }
```

（`releasePort` 里不需要清 `holdUntil`：它只是个时间下限，连接没了就不起作用；新连接的第一次 `show` 前 `holdUntil` 已过期。）

- [ ] **Step 4: 运行，确认通过**

Run: `node --test test/alarm-desktop.test.js`
Expected: 全部 PASS（既有 + 新增 4 条）。

- [ ] **Step 5: 语法检查与影响面**

Run: `node --check js/alarm-desktop.js && node --test test/alarm-desktop.test.js test/jelly-desktop.test.js test/jelly-desktop-integration.test.js test/alarm-countdown.test.js test/assistant-confirmation.test.js`
Expected: 全部 PASS。

---

## Task 2: 纯逻辑 — 响铃负载解析、标题行、按钮、确认语与显示优先级（`jelly-model.swift`）

**Files:**
- Modify: `desktop-reminder/jelly-model.swift`
- Modify: `desktop-reminder/companion-selftest.swift`（插入响铃解析块、更新“显示规则”块）

**Interfaces:**
- Produces（后续任务依赖的精确签名）：
  - `JellyModel.Ring { id: String, clock: String, names: [String], more: Int, canSnooze: Bool, snoozeMinutes: Int }`（`Equatable`）
  - `JellyModel.parseRing(_ raw: Any?) -> Ring?`（入参是整条 `show` 命令字典）
  - `JellyModel.validClock(_ text: String) -> String?`、`JellyModel.firstClock(in text: String) -> String?`
  - `JellyModel.ringTitleLines(names: [String], more: Int) -> [String]`
  - `JellyModel.ringButtons(canSnooze: Bool, minutes: Int) -> [Button]`（id 为 `"snooze"`、`"dismiss"`；先次后主）
  - `JellyModel.ringConfirm(action: String, minutes: Int) -> String`
  - 常量 `ringActions`、`ringClickGuard = 0.5`、`ringFarewell = 1.4`、`ringHideGrace = 1.5`、`ringNoAck = 8.0`
  - `BubbleKind` 增加 `.ring`（最高优先级）；`bubbleKind(ringing:ringArrived:hasNudge:hasNote:detailActive:hasCountdown:)`（前两个参数缺省 `false`）；`shouldShow(...)` 在响铃时恒为真

- [ ] **Step 1: 写失败的自测**

在 `companion-selftest.swift` 里把“水母什么时候出现、气泡显示什么”块中这一行

```swift
    check(show(false, true, true, false) == false, "响铃时倒计时让位给提醒卡片")
    check(show(true, true, true, false) == true, "常驻的水母不因响铃而消失")
```

替换为

```swift
    check(show(false, true, true, false) == true, "响铃时水母不退场（倒计时读数让位给响铃气泡）")
    check(show(false, false, true, false) == true, "没有常驻、没有倒计时，响铃本身也让水母出现")
    check(show(true, true, true, false) == true, "常驻的水母不因响铃而消失")
```

并在该块的 `bubbleKind` 断言之后追加：

```swift
    check(JellyModel.bubbleKind(ringing: true, ringArrived: true, hasNudge: true, hasNote: true, detailActive: true, hasCountdown: true) == .ring, "响铃气泡优先于一切")
    check(JellyModel.bubbleKind(ringing: true, ringArrived: false, hasNudge: true, hasNote: true, detailActive: true, hasCountdown: true) == .none, "水母还在游向落点时不带任何气泡")
    check(JellyModel.bubbleKind(ringing: false, ringArrived: true, hasNudge: true, hasNote: false, detailActive: false, hasCountdown: false) == .nudge, "没有响铃时 ringArrived 不起作用")
    check(JellyModel.BubbleKind.ring > JellyModel.BubbleKind.nudge, "响铃的优先级最高")
```

在“水母协议 v6：nudge 命令”块之后新增整块：

```swift
// --- 水母协议 v6：show 命令（到点响铃气泡）---
do {
    func show(_ patch: [String: Any?] = [:]) -> [String: Any] {
        var base: [String: Any] = ["sessionId": "ring-1", "title": "开会；喝水", "timeText": "10/16 09:30", "clock": "09:30", "labels": ["开会", "喝水"], "more": 0, "canSnooze": true, "snoozeMinutes": 10]
        for (key, value) in patch { if let value = value { base[key] = value } else { base.removeValue(forKey: key) } }
        return base
    }
    let ok = JellyModel.parseRing(show())
    check(ok == JellyModel.Ring(id: "ring-1", clock: "09:30", names: ["开会", "喝水"], more: 0, canSnooze: true, snoozeMinutes: 10), "合规的响铃负载被接受")
    check(JellyModel.parseRing(nil) == nil && JellyModel.parseRing("x") == nil && JellyModel.parseRing([1]) == nil, "响铃负载必须是字典")
    check(JellyModel.parseRing(show(["sessionId": nil])) == nil && JellyModel.parseRing(show(["sessionId": ""])) == nil, "缺少或为空的 sessionId 被拒绝")
    check(JellyModel.parseRing(show(["sessionId": String(repeating: "x", count: 201)])) == nil && JellyModel.parseRing(show(["sessionId": String(repeating: "x", count: 200)])) != nil, "sessionId 最多 200 字符")
    check(JellyModel.parseRing(show(["title": nil])) == nil && JellyModel.parseRing(show(["title": 42])) == nil, "title 必须是字符串")
    check(JellyModel.parseRing(show(["title": String(repeating: "题", count: 321)])) == nil && JellyModel.parseRing(show(["title": String(repeating: "题", count: 320)])) != nil, "title 最多 320 字符（沿用旧卡片的校验）")

    // 名字：labels 优先；缺失或清洗后为空时退回 title（≤80 字符）
    check(JellyModel.parseRing(show(["labels": ["a", "b", "c", "d", "e"], "more": 2]))!.names == ["a", "b", "c"], "labels 最多取 3 个")
    check(JellyModel.parseRing(show(["labels": [String(repeating: "名", count: 60)]]))!.names[0].count == 40, "每个名字最多 40 字符")
    let dirtyNames: [Any] = ["开\u{202E}会\n", 7, "   ", ["x"], "喝水"]
    check(JellyModel.parseRing(show(["labels": dirtyNames]))!.names == ["开会", "喝水"], "去掉控制字符，非字符串与空白名字丢弃")
    check(JellyModel.parseRing(show(["labels": nil]))!.names == ["开会；喝水"] && JellyModel.parseRing(show(["labels": "not-a-list"]))!.names == ["开会；喝水"], "没有 labels：整段 title 当作一个名字（旧扩展）")
    check(JellyModel.parseRing(show(["labels": ["  ", 1]]))!.names == ["开会；喝水"], "labels 清洗后为空：退回 title")
    check(JellyModel.parseRing(show(["labels": nil, "title": String(repeating: "长", count: 200)]))!.names[0].count == 80, "退回 title 时最多 80 字符")
    check(JellyModel.parseRing(show(["labels": nil, "title": ""]))!.names.isEmpty, "标题也是空：没有名字（版式显示“时间到了”）")

    // more：只在 labels 有效时计入，夹在 0…99
    check(JellyModel.parseRing(show(["more": 2]))!.more == 2 && JellyModel.parseRing(show(["more": 500]))!.more == 99 && JellyModel.parseRing(show(["more": -3]))!.more == 0, "more 夹在 0…99")
    check(JellyModel.parseRing(show(["more": "x"]))!.more == 0 && JellyModel.parseRing(show(["more": Double.nan]))!.more == 0 && JellyModel.parseRing(show(["more": 2.6]))!.more == 3, "more 非数字按 0，小数四舍五入")
    check(JellyModel.parseRing(show(["labels": nil, "more": 5]))!.more == 0, "退回 title 时不采信 more")

    // clock：只认 H:mm / HH:mm 且在 0:00–23:59；缺失或非法时从 timeText 里取第一个有效时间
    check(JellyModel.parseRing(show(["clock": "9:05"]))!.clock == "09:05", "单位数小时补零")
    for bad in ["24:00", "12:60", "9:5", "09:30:00", "晚上9:30", "", "abc", "٠٩:٣٠"] {
        check(JellyModel.parseRing(show(["clock": bad, "timeText": "没有时间"]))!.clock == "", "非法 clock “\(bad)” 不显示")
    }
    check(JellyModel.parseRing(show(["clock": nil, "timeText": "10/16 21:45"]))!.clock == "21:45", "缺少 clock：从 timeText 取 21:45")
    check(JellyModel.parseRing(show(["clock": "99:99", "timeText": "10/16 21:45"]))!.clock == "21:45", "非法 clock：退回 timeText")
    check(JellyModel.parseRing(show(["clock": nil, "timeText": "这是测试，不会修改你的闹钟"]))!.clock == "", "都没有时间：不画大时间")
    check(JellyModel.firstClock(in: "123:45") == nil && JellyModel.firstClock(in: "1:234") == nil && JellyModel.firstClock(in: "上午 7:05 到 8:10") == "07:05", "时间前后不能紧挨数字；取第一个")
    check(JellyModel.validClock(" 23:59 ") == "23:59" && JellyModel.validClock("0:00") == "00:00" && JellyModel.validClock("24:00") == nil, "时间范围 0:00–23:59")

    // 按钮与稍后：canSnooze 只有明确的 true；分钟数夹在 1…60，缺省 10
    check(JellyModel.parseRing(show(["canSnooze": false]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": "yes"]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": 1]))!.canSnooze == false && JellyModel.parseRing(show(["canSnooze": nil]))!.canSnooze == false, "canSnooze 只有明确的 true 才算")
    check(JellyModel.parseRing(show(["snoozeMinutes": 0]))!.snoozeMinutes == 1 && JellyModel.parseRing(show(["snoozeMinutes": 99]))!.snoozeMinutes == 60 && JellyModel.parseRing(show(["snoozeMinutes": 7.4]))!.snoozeMinutes == 7, "snoozeMinutes 夹在 1…60")
    check(JellyModel.parseRing(show(["snoozeMinutes": nil]))!.snoozeMinutes == 10 && JellyModel.parseRing(show(["snoozeMinutes": "x"]))!.snoozeMinutes == 10 && JellyModel.parseRing(show(["snoozeMinutes": Double.nan]))!.snoozeMinutes == 10, "snoozeMinutes 缺省或非法按 10")
    check(JellyModel.ringButtons(canSnooze: true, minutes: 7) == [JellyModel.Button(id: "snooze", title: "7 分钟后再提醒"), JellyModel.Button(id: "dismiss", title: "停止")], "有稍后：次按钮在左、主按钮在右")
    check(JellyModel.ringButtons(canSnooze: false, minutes: 7) == [JellyModel.Button(id: "dismiss", title: "停止")], "不能稍后：只剩“停止”，不放占位")
    check(JellyModel.ringActions == ["dismiss", "snooze"], "只转发 dismiss / snooze")
    check(JellyModel.ringConfirm(action: "dismiss", minutes: 7) == "已停止" && JellyModel.ringConfirm(action: "snooze", minutes: 7) == "好的，7 分钟后再叫你", "确认语")

    // 标题行：1–3 个名字各占一行；超过 3 个只列前 2 个，第 3 行写“等共 N 个”；没有名字写“时间到了”
    check(JellyModel.ringTitleLines(names: ["a"], more: 0) == ["a"] && JellyModel.ringTitleLines(names: ["a", "b"], more: 0) == ["a", "b"] && JellyModel.ringTitleLines(names: ["a", "b", "c"], more: 0) == ["a", "b", "c"], "1–3 个名字原样各占一行")
    check(JellyModel.ringTitleLines(names: ["a", "b", "c"], more: 2) == ["a", "b", "等共 5 个"], "3 个名字加 2 个更多：前 2 个 + 等共 5 个")
    check(JellyModel.ringTitleLines(names: ["a", "b"], more: 5) == ["a", "b", "等共 7 个"] && JellyModel.ringTitleLines(names: ["a", "b", "c", "d"], more: 0) == ["a", "b", "等共 4 个"], "总数超过 3 个一律折叠")
    check(JellyModel.ringTitleLines(names: [], more: 0) == ["时间到了"], "没有名字显示“时间到了”")
    check(JellyModel.ringTitleLines(names: ["x"], more: 5) == ["x", "等共 6 个"] && JellyModel.ringTitleLines(names: ["a", "b"], more: -4) == ["a", "b"], "只有 1 个名字却声称还有更多、或 more 为负：不越界")
    check(JellyModel.ringClickGuard == 0.5 && JellyModel.ringFarewell == 1.4 && JellyModel.ringHideGrace == 1.5 && JellyModel.ringNoAck == 8, "响铃时序常量")
}
```

- [ ] **Step 2: 运行，确认失败（编译错误）**

Run: `/tmp/selftest.sh`（先按上面的脚本创建）
Expected: 编译失败，提示 `JellyModel` 没有 `parseRing`、`ring` 等成员。

- [ ] **Step 3: 实现**

在 `jelly-model.swift` 里：

(a) 把 `shouldShow` 与 `BubbleKind`、`bubbleKind` 三处（“显示规则”一节）替换为：

```swift
    // MARK: 显示规则

    /// 水母是否应该出现：常驻、有提醒气泡、有倒计时，或正在响铃（响铃由水母本人报时）。
    static func shouldShow(resident: Bool, hasCountdown: Bool, ringing: Bool, hasNudge: Bool) -> Bool {
        resident || hasNudge || hasCountdown || ringing
    }

    enum BubbleKind: Int, Comparable {
        case none, clock, detail, note, nudge, ring
        static func < (a: BubbleKind, b: BubbleKind) -> Bool { a.rawValue < b.rawValue }
    }

    /// 气泡内容的优先级：响铃 > 提醒 > 操作反馈 > 点一下的详情 > 倒计时读数 > 没有。
    /// 响铃时只显示响铃气泡；水母还在游向落点（ringArrived 为 false）时不带任何气泡。
    static func bubbleKind(ringing: Bool = false, ringArrived: Bool = false, hasNudge: Bool, hasNote: Bool, detailActive: Bool, hasCountdown: Bool) -> BubbleKind {
        if ringing { return ringArrived ? .ring : .none }
        if hasNudge { return .nudge }
        if hasNote { return .note }
        if detailActive { return .detail }
        if hasCountdown { return .clock }
        return .none
    }
```

(b) 在 `// MARK: 显示规则` 之前（`parseNudge` 之后）插入响铃一节：

```swift
    // MARK: show 命令（到点响铃）

    static let maxRingNames = 3
    static let maxRingNameChars = 40
    static let maxRingTitleChars = 80
    static let maxSessionTitleChars = 320
    static let ringActions: Set<String> = ["dismiss", "snooze"]
    static let ringClickGuard = 0.5     // 气泡弹出后这么久之内忽略点击，免得用户正好点别处时误触
    static let ringFarewell = 1.4       // 成功回执后显示确认语的时长
    static let ringHideGrace = 1.5      // Chrome 先结束会话（hide）、回执随后才到时，多等回执的时间
    static let ringNoAck = 8.0          // 点了按钮而 Chrome 一直不回执

    struct Ring: Equatable {
        var id: String
        var clock: String          // "HH:mm"；没有可用的时间时为空，版式里不画大时间
        var names: [String]        // 已清洗的提醒名字，最多 3 个；标题也为空时没有名字
        var more: Int              // names 之外还有几个（0…99）
        var canSnooze: Bool
        var snoozeMinutes: Int     // 1…60
    }

    private static func isDigit(_ scalar: Unicode.Scalar) -> Bool { ("0"..."9").contains(scalar) }

    /// 严格的 H:mm / HH:mm（只认 ASCII 数字，0:00–23:59），规整为 HH:mm；其余返回 nil。
    static func validClock(_ text: String) -> String? {
        let parts = text.trimmingCharacters(in: .whitespaces).split(separator: ":", omittingEmptySubsequences: false)
        guard parts.count == 2, (1...2).contains(parts[0].count), parts[1].count == 2,
              parts.allSatisfy({ $0.unicodeScalars.allSatisfy(isDigit) }),
              let hour = Int(parts[0]), let minute = Int(parts[1]), hour <= 23, minute <= 59 else { return nil }
        return String(format: "%02d:%02d", hour, minute)
    }

    /// 文字里第一个有效的时间（前后不能紧挨数字）：旧扩展只发 timeText（如“10/16 09:30”）时用它兜底。
    static func firstClock(in text: String) -> String? {
        let scalars = Array(text.unicodeScalars)
        func digit(_ index: Int) -> Bool { index >= 0 && index < scalars.count && isDigit(scalars[index]) }
        for i in 0..<scalars.count where scalars[i] == ":" && digit(i - 1) && digit(i + 1) && digit(i + 2) && !digit(i + 3) {
            var start = i - 1
            if digit(start - 1) { start -= 1 }
            if digit(start - 1) { continue }
            if let valid = validClock(String(String.UnicodeScalarView(scalars[start..<(i + 3)]))) { return valid }
        }
        return nil
    }

    /// 解析并校验整条 `show` 命令。必需字段（sessionId、title）不合规返回 nil（调用方回 ok:false，Chrome 据此退回系统通知）；
    /// 可选字段 clock / labels / more 缺失或非法时各自兜底，不拒绝整条命令。
    static func parseRing(_ raw: Any?) -> Ring? {
        guard let object = raw as? [String: Any],
              let id = object["sessionId"] as? String, !id.isEmpty, id.count <= maxIDChars,
              let title = object["title"] as? String, title.count <= maxSessionTitleChars else { return nil }
        var names: [String] = []
        var more = 0
        if let list = object["labels"] as? [Any] {
            for item in list {
                if let name = clean(item, max: maxRingNameChars) { names.append(name) }
                if names.count >= maxRingNames { break }
            }
            if !names.isEmpty, let value = number(object["more"]), value.isFinite { more = Int(min(99, max(0, value.rounded()))) }
        }
        if names.isEmpty, let whole = clean(title, max: maxRingTitleChars) { names = [whole] }
        var clock = ""
        if let own = object["clock"] as? String, let valid = validClock(own) { clock = valid }
        else if let text = object["timeText"] as? String, let found = firstClock(in: text) { clock = found }
        var minutes = 10
        if let value = number(object["snoozeMinutes"]), value.isFinite { minutes = Int(min(60, max(1, value.rounded()))) }
        return Ring(id: id, clock: clock, names: names, more: more, canSnooze: (object["canSnooze"] as? Bool) == true, snoozeMinutes: minutes)
    }

    /// 响铃气泡标题区的行：1–3 个名字各占一行；总数超过 3 个只列前 2 个，第 3 行写“等共 N 个”；没有名字写“时间到了”。
    /// 对任意输入都有定义（例如只有 1 个名字却声明还有 5 个：列出这 1 个，再写“等共 6 个”），不会越界。
    static func ringTitleLines(names: [String], more: Int) -> [String] {
        if names.isEmpty { return ["时间到了"] }
        let total = names.count + max(0, more)
        if total <= maxRingNames { return names }
        return Array(names.prefix(2)) + ["等共 \(total) 个"]
    }

    /// 响铃气泡的按钮：左“N 分钟后再提醒”（次按钮，仅在还能稍后时有），右“停止”（主按钮）。id 就是回传给 Chrome 的 action。
    static func ringButtons(canSnooze: Bool, minutes: Int) -> [Button] {
        var list: [Button] = []
        if canSnooze { list.append(Button(id: "snooze", title: "\(minutes) 分钟后再提醒")) }
        list.append(Button(id: "dismiss", title: "停止"))
        return list
    }

    /// 收到 Chrome 的成功回执后显示的确认语。
    static func ringConfirm(action: String, minutes: Int) -> String {
        action == "snooze" ? "好的，\(minutes) 分钟后再叫你" : "已停止"
    }
```

(`Button` 就是文件里已有的 `JellyModel.Button { id, title }`。)

- [ ] **Step 4: 运行，确认通过**

Run: `/tmp/selftest.sh`
Expected: 输出 `ALL PASS`，没有 `FAIL` 行。若某条 `FAIL`，按其消息修正实现（不改断言的意图）。

---

## Task 3: 纯逻辑 — 冲刺缓动与响铃动效曲线（`jelly-swim.swift`）

**Files:**
- Modify: `desktop-reminder/jelly-swim.swift`
- Modify: `desktop-reminder/companion-selftest.swift`（在“收缩量范围”块之后插入冲刺块）

**Interfaces:**
- Produces:
  - `JellyDash { fromX, fromY, toX, toY, duration, elapsed; static duration(distance:), ease(_:), slope(_:), pulsePeriod = 0.5, maxVisualSpeed = 320; progress; arc; position(at:) }`
  - `JellySwim.dash: JellyDash?`、`JellySwim.dashEnded: Bool`（控制器读到后自行清零；`step` 不重置它）
  - `JellySwim.startDash(toX: CGFloat, toY: CGFloat = 0)`：夹进 `[lo, hi]`；距离 ≤1 点直接到位并置 `dashEnded`；冲刺中 `mode == .swim`；结束时 `mode = wantsRest && toY <= 0 ? .rest : .swim`，`landed = true`，`squashV += 8`
  - `JellySwim.contraction(atPhase:)`（静态）；实例 `contraction` 改用它；`hold(...)` 取消冲刺（`dash = nil`，不置 `dashEnded`）
  - `JellyRingMotion`（纯函数，供 AppKit 绘制调用）：`popDuration = 0.32`、`popScale(age:)`（0.82 起，过冲后回到 1）、`popAlpha(age:)`、`buttonAlpha(age:)`（弹出后段才淡入，因为按钮是真控件、不跟着气泡缩放）、`ripples(time:reduceMotion:) -> [(radius, alpha)]`（3 圈，周期 2.2 秒、间隔 0.73 秒、半径 20→62、透明度 0.55→0；减少动态效果时固定两圈 0.30 / 0.18）

- [ ] **Step 1: 写失败的自测**

在 `companion-selftest.swift` 的“收缩量范围”块之后、`print(failures == 0 ...)` 之前插入：

```swift
// --- 冲刺：响铃时游到落点、响铃后游回或游走 ---
do {
    check(abs(JellyDash.duration(distance: 0) - 0.7) < 1e-9 && abs(JellyDash.duration(distance: 600) - 1.05) < 1e-9 && abs(JellyDash.duration(distance: 1200) - 1.4) < 1e-9 && abs(JellyDash.duration(distance: 9000) - 1.4) < 1e-9, "冲刺时长随距离在 0.7–1.4 秒之间")
    check(JellyDash.ease(0) == 0 && JellyDash.ease(1) == 1 && abs(JellyDash.ease(0.5) - 0.5) < 1e-12 && JellyDash.ease(-1) == 0 && JellyDash.ease(2) == 1, "三次缓动：两端精确、中点 0.5、越界夹紧")
    var easeMonotonic = true
    for i in 1...100 { if JellyDash.ease(CGFloat(i) / 100) < JellyDash.ease(CGFloat(i - 1) / 100) { easeMonotonic = false } }
    check(easeMonotonic, "缓动单调不减")
    check(JellyDash.slope(0) == 0 && JellyDash.slope(1) == 0 && abs(JellyDash.slope(0.5) - 3) < 1e-12, "起止速度为 0、中点最快")

    struct DashRun { var swim: JellySwim; var xs: [CGFloat]; var minY: CGFloat; var maxY: CGFloat; var maxSpeed: CGFloat; var pulses: Int; var seconds: CGFloat; var landedAtEnd: Bool; var ended: Int; var facings: Set<CGFloat> }
    func runDash(from x0: CGFloat, to x1: CGFloat, y0: CGFloat = 0, wantsRest: Bool = true, dt: CGFloat = 1.0 / 30, lo: CGFloat = 0, hi: CGFloat = 2000) -> DashRun {
        var rng = SeededRandom(state: 1)
        var swim = JellySwim()
        swim.setBounds(lo: lo, hi: hi)
        swim.x = x0; swim.y = y0; swim.wantsRest = wantsRest; swim.mode = y0 > 0 ? .swim : .rest
        swim.startDash(toX: x1, toY: 0)
        var run = DashRun(swim: swim, xs: [swim.x], minY: swim.y, maxY: swim.y, maxSpeed: 0, pulses: 0, seconds: 0, landedAtEnd: false, ended: 0, facings: [])
        var steps = 0
        while run.swim.dash != nil && steps < 600 {
            run.swim.step(dt: dt, random: { rng.next() })
            steps += 1
            run.xs.append(run.swim.x); run.minY = min(run.minY, run.swim.y); run.maxY = max(run.maxY, run.swim.y)
            run.maxSpeed = max(run.maxSpeed, abs(run.swim.vx))
            if run.swim.pulsed { run.pulses += 1 }
            if run.swim.dashEnded { run.ended += 1; run.landedAtEnd = run.swim.landed }
            run.facings.insert(run.swim.facing)
        }
        run.seconds = CGFloat(steps) * dt
        return run
    }

    let right = runDash(from: 300, to: 1000)
    let expected = JellyDash.duration(distance: 700)
    check(right.swim.x == 1000 && right.swim.y == 0 && right.swim.vx == 0 && right.swim.vy == 0, "向右冲刺精确停在目标（x \(right.swim.x)）")
    check(right.swim.dash == nil && right.swim.mode == .rest && right.landedAtEnd && right.ended == 1, "到位后进入休息、落地一弹，且只通知一次结束")
    check(abs(right.seconds - expected) < 1.0 / 30 + 1e-9, "用时约等于计算的时长（\(String(format: "%.3f", right.seconds)) 对 \(String(format: "%.3f", expected))）")
    check(zip(right.xs, right.xs.dropFirst()).allSatisfy { $0 <= $1 }, "向右冲刺水平位置单调不减")
    check(right.minY >= 0 && right.maxY > 5 && right.maxY <= 18.001, "只有一道最高 18 点的轻弧，从不沉到泳线以下（最高 \(String(format: "%.1f", right.maxY))）")
    check(right.maxSpeed <= JellyDash.maxVisualSpeed + 1e-9 && right.maxSpeed > 100, "供倾斜与触手拖尾用的速度被限幅（最大 \(String(format: "%.0f", right.maxSpeed))）")
    check(abs(CGFloat(right.pulses) - right.seconds / JellyDash.pulsePeriod) <= 1, "钟罩按 0.5 秒节奏脉动（\(right.pulses) 次 / \(String(format: "%.2f", right.seconds)) 秒）")
    check(right.facings == [1], "向右游时朝右")

    let left = runDash(from: 1000, to: 300)
    check(left.swim.x == 300 && zip(left.xs, left.xs.dropFirst()).allSatisfy { $0 >= $1 } && left.facings == [-1], "向左冲刺同样精确、单调，朝左")

    let drop = runDash(from: 600, to: 600, y0: 60)
    check(drop.swim.x == 600 && drop.swim.y == 0 && drop.minY >= 0 && drop.maxY <= 60.001, "从高处冲到泳线：原地落下，不先升高")

    let near = runDash(from: 500, to: 500.5)
    check(near.swim.dash == nil && near.swim.x == 500.5 && near.ended == 0, "距离不足 1 点：直接到位")
    var tiny = JellySwim(); tiny.setBounds(lo: 0, hi: 1000); tiny.x = 500; tiny.wantsRest = true
    tiny.startDash(toX: 500.5)
    check(tiny.dashEnded && tiny.dash == nil && tiny.mode == .rest, "距离不足 1 点：立即标记结束，进入休息")

    check(runDash(from: 800, to: 5000, hi: 1500).swim.x == 1500 && runDash(from: 800, to: -50, lo: 100).swim.x == 100, "目标夹在可游范围内")
    check(runDash(from: 300, to: 1000, dt: 1.0 / 15).swim.x == 1000 && runDash(from: 300, to: 1000, dt: 1.0 / 60).swim.x == 1000, "帧间隔变化（卡顿或 60 帧）都能精确到位")
    check(runDash(from: 300, to: 1000, wantsRest: false).swim.mode == .swim, "还想游的水母冲刺后继续游（不强行休息）")
    let shortTrip = JellyDash.duration(distance: 100), longTrip = JellyDash.duration(distance: 1000)
    check(shortTrip < longTrip && shortTrip >= 0.7 && longTrip <= 1.4, "路程越长用时越长")

    // 被抓住：取消冲刺，不通知结束（控制器据此丢弃回调）
    var held = JellySwim(); held.setBounds(lo: 0, hi: 2000); held.x = 300; held.wantsRest = true
    held.startDash(toX: 1000)
    var rng = SeededRandom(state: 2)
    for _ in 0..<5 { held.step(dt: 1.0 / 30, random: { rng.next() }) }
    held.hold(x: 700, y: 40, dt: 1.0 / 30)
    check(held.dash == nil && held.mode == .grabbed && held.dashEnded == false, "抓住水母会取消冲刺且不算“到位”")
    held.startDash(toX: 1200)
    check(held.dash == nil && held.mode == .grabbed, "被抓着时不能开始冲刺")

    // 外观收缩量：静态函数与实例读数一致，休息时为 0
    var pulse = JellySwim(); pulse.mode = .swim
    var same = true
    for i in 0...100 { pulse.phase = CGFloat(i) / 100; if pulse.contraction != JellySwim.contraction(atPhase: pulse.phase) { same = false } }
    check(same, "contraction(atPhase:) 与实例的 contraction 一致")
    check(JellySwim.contraction(atPhase: 0) == 0 && abs(JellySwim.contraction(atPhase: 0.28) - 1) < 1e-9 && JellySwim.contraction(atPhase: 1) == 0, "收缩曲线：起点 0、0.28 处最紧、终点 0")
}

// --- 响铃动效曲线：弹出与涟漪 ---
do {
    check(abs(JellyRingMotion.popScale(age: 0) - 0.82) < 1e-9 && abs(JellyRingMotion.popScale(age: JellyRingMotion.popDuration) - 1) < 1e-9, "弹出缩放：0.82 起，0.32 秒到位")
    check(JellyRingMotion.popScale(age: -1) == JellyRingMotion.popScale(age: 0) && JellyRingMotion.popScale(age: 5) == 1, "弹出缩放：越界夹紧")
    var peak: CGFloat = 0, rising = true, last: CGFloat = 0
    for i in 0...64 {
        let value = JellyRingMotion.popScale(age: JellyRingMotion.popDuration * CGFloat(i) / 64)
        peak = max(peak, value)
        if i > 0 && value + 1e-9 < last && peak < 1.0 { rising = false }
        last = value
    }
    check(peak > 1.005 && peak < 1.06, "弹出有一点过冲但不夸张（峰值 \(String(format: "%.3f", peak))）")
    check(rising, "过冲之前缩放单调增大")
    check(JellyRingMotion.popAlpha(age: 0) == 0 && JellyRingMotion.popAlpha(age: JellyRingMotion.popDuration) == 1 && JellyRingMotion.popAlpha(age: 0.05) > 0 && JellyRingMotion.popAlpha(age: 0.05) < 1, "弹出透明度 0→1")
    check(JellyRingMotion.buttonAlpha(age: 0) == 0 && JellyRingMotion.buttonAlpha(age: 0.1) == 0 && JellyRingMotion.buttonAlpha(age: JellyRingMotion.popDuration) == 1 && JellyRingMotion.buttonAlpha(age: 9) == 1, "按钮在弹出后段才淡入")
    var buttonMonotonic = true
    for i in 1...32 { if JellyRingMotion.buttonAlpha(age: 0.32 * CGFloat(i) / 32) < JellyRingMotion.buttonAlpha(age: 0.32 * CGFloat(i - 1) / 32) { buttonMonotonic = false } }
    check(buttonMonotonic, "按钮淡入单调")

    let first = JellyRingMotion.ripples(time: 0, reduceMotion: false)
    check(first.count == 1 && abs(first[0].radius - 20) < 1e-9 && abs(first[0].alpha - 0.55) < 1e-9, "刚开始只有第一圈，半径 20、透明度 0.55")
    check(JellyRingMotion.ripples(time: 0.8, reduceMotion: false).count == 2 && JellyRingMotion.ripples(time: 1.5, reduceMotion: false).count == 3, "后两圈各晚 0.73 秒出发")
    var withinRange = true, alwaysThree = true
    for i in 0...400 {
        let time = 1.5 + CGFloat(i) * 0.0173
        let rings = JellyRingMotion.ripples(time: time, reduceMotion: false)
        if rings.count != 3 { alwaysThree = false }
        for ring in rings where !(ring.radius >= 20 - 1e-9 && ring.radius <= 62 + 1e-9 && ring.alpha >= -1e-12 && ring.alpha <= 0.55 + 1e-9) { withinRange = false }
    }
    check(withinRange && alwaysThree, "稳定后恒为 3 圈，半径 20…62、透明度 0…0.55")
    func sortedRadii(_ time: CGFloat) -> [CGFloat] { JellyRingMotion.ripples(time: time, reduceMotion: false).map { $0.radius }.sorted() }
    check(zip(sortedRadii(3.0), sortedRadii(3.0 + JellyRingMotion.ripplePeriod)).allSatisfy { abs($0 - $1) < 1e-6 }, "涟漪按 2.2 秒周期循环")
    check(JellyRingMotion.ripples(time: 0.3, reduceMotion: true).count == 2 && JellyRingMotion.ripples(time: 0.3, reduceMotion: true).map { $0.alpha } == [0.30, 0.18] && JellyRingMotion.ripples(time: 7, reduceMotion: true).map { $0.radius } == JellyRingMotion.ripples(time: 0.3, reduceMotion: true).map { $0.radius }, "减少动态效果：静止的两圈，与时间无关")
    check(JellyRingMotion.ripples(time: 0, reduceMotion: true).allSatisfy { $0.radius + 0 <= 62 }, "静止的涟漪也在 62 点以内（不会碰到窗口边缘）")
}
```

- [ ] **Step 2: 运行，确认失败（编译错误）**

Run: `/tmp/selftest.sh`
Expected: 编译失败，`JellyDash`、`startDash`、`dash`、`dashEnded`、`contraction(atPhase:)` 未定义。

- [ ] **Step 3: 实现**

在 `jelly-swim.swift` 中 `struct JellySwim {` 之前新增：

```swift
/// 一次定时的“冲刺”：从当前位置按三次缓动游到目标，时长随距离在 0.7–1.4 秒之间。
/// 位置完全由缓动决定（不走水母平时的推力物理），速度只用于倾斜与触手拖尾（已限幅）。
struct JellyDash: Equatable {
    static let pulsePeriod: CGFloat = 0.5        // 冲刺时钟罩的收缩节奏
    static let maxVisualSpeed: CGFloat = 320
    var fromX: CGFloat
    var fromY: CGFloat
    var toX: CGFloat
    var toY: CGFloat
    var duration: CGFloat
    var elapsed: CGFloat = 0

    static func duration(distance: CGFloat) -> CGFloat { 0.7 + min(0.7, max(0, distance) / 1200 * 0.7) }

    /// 三次缓入缓出：两端速度为 0、中点最快。
    static func ease(_ u: CGFloat) -> CGFloat {
        let c = min(1, max(0, u))
        if c < 0.5 { return 4 * c * c * c }
        let k = -2 * c + 2
        return 1 - k * k * k / 2
    }
    /// ease 对 u 的导数。
    static func slope(_ u: CGFloat) -> CGFloat {
        let c = min(1, max(0, u))
        return c < 0.5 ? 12 * c * c : 12 * (1 - c) * (1 - c)
    }

    var progress: CGFloat { duration <= 0 ? 1 : min(1, elapsed / duration) }
    /// 水平路程越长，轻轻拱起的弧越高（最多 18 点）；起点与终点都在原高度上。
    var arc: CGFloat { min(18, abs(toX - fromX) * 0.03) }

    func position(at u: CGFloat) -> (x: CGFloat, y: CGFloat) {
        let e = JellyDash.ease(u)
        return (fromX + (toX - fromX) * e, fromY + (toY - fromY) * e + arc * sin(min(1, max(0, u)) * .pi))
    }
}

/// 响铃气泡的动效曲线（纯函数，AppKit 绘制时调用）：气泡弹出、涟漪。数值是初始取值，须以真实截图校准。
enum JellyRingMotion {
    static let popDuration: CGFloat = 0.32
    static let rippleCount = 3
    static let ripplePeriod: CGFloat = 2.2       // 每圈从出发到消失
    static let rippleSpacing: CGFloat = 0.73     // 相邻两圈出发的间隔（≈ 周期 / 3）
    static let rippleInner: CGFloat = 20
    static let rippleOuter: CGFloat = 62         // 钟罩中心到窗口底边约 78，62 的圈不会碰到窗口边缘
    static let rippleAlpha: CGFloat = 0.55

    /// 弹出缩放：0.82 起，带一点过冲（easeOutBack），0.32 秒到 1。age 越界夹紧。
    static func popScale(age: CGFloat) -> CGFloat {
        let t = min(1, max(0, age / popDuration))
        let c1: CGFloat = 1.70158, c3 = c1 + 1
        let back = 1 + c3 * pow(t - 1, 3) + c1 * pow(t - 1, 2)
        return 0.82 + 0.18 * back
    }
    static func popAlpha(age: CGFloat) -> CGFloat { min(1, max(0, age / popDuration * 2.5)) }
    /// 按钮是真控件，不能跟着气泡缩放，所以等气泡几乎到位（弹出的后 45%）才淡入。
    static func buttonAlpha(age: CGFloat) -> CGFloat { min(1, max(0, (age / popDuration - 0.55) / 0.45)) }

    /// 当前可见的涟漪（半径、透明度）：第 i 圈比前一圈晚 rippleSpacing 秒出发，每圈 ripplePeriod 秒从 inner 扩到 outer，
    /// 透明度 0.55 → 0（二次衰减）。减少动态效果时固定画两圈静止的（0.30 / 0.18），与时间无关。
    static func ripples(time: CGFloat, reduceMotion: Bool) -> [(radius: CGFloat, alpha: CGFloat)] {
        if reduceMotion {
            return [(rippleInner + (rippleOuter - rippleInner) * 0.35, 0.30), (rippleInner + (rippleOuter - rippleInner) * 0.75, 0.18)]
        }
        var rings: [(radius: CGFloat, alpha: CGFloat)] = []
        for i in 0..<rippleCount {
            let local = time - CGFloat(i) * rippleSpacing
            guard local >= 0 else { continue }
            let u = local.truncatingRemainder(dividingBy: ripplePeriod) / ripplePeriod
            rings.append((rippleInner + (rippleOuter - rippleInner) * u, rippleAlpha * (1 - u) * (1 - u)))
        }
        return rings
    }
}
```

在 `JellySwim` 里：

(a) `var pulsed = false` 之后加：

```swift
    /// 正在进行的冲刺（响铃时游到落点、响铃后游回或游走）；有它时位置由缓动决定，不走平时的推力物理。
    var dash: JellyDash?
    /// 冲刺刚走完（控制器读到后自行清零，step 不会重置它）。
    var dashEnded = false
```

(b) 把 `var contraction: CGFloat {...}` 整段替换为：

```swift
    /// 脉动的外观收缩量 0…1：快速收缩、缓慢舒张（p 为 0…1 的脉动相位）。
    static func contraction(atPhase p: CGFloat) -> CGFloat {
        if p < 0.28 { let t = p / 0.28; return sin(t * .pi / 2) }
        let t = (p - 0.28) / 0.72
        let s = 1 - t
        return s * s * s
    }

    var contraction: CGFloat {
        guard mode != .rest else { return 0 }
        return JellySwim.contraction(atPhase: phase)
    }
```

(c) 在 `release()` 之前加 `startDash`，并在 `hold(...)` 的 `mode = .grabbed` 一行后加 `dash = nil`：

```swift
    /// 开始一次冲刺：从当前位置游到泳线上的 tx（夹在可游范围内）。距离不足 1 点时直接到位并置 dashEnded。被抓着时不能开始。
    mutating func startDash(toX tx: CGFloat, toY ty: CGFloat = 0) {
        guard mode != .grabbed else { return }
        let target = max(lo, min(tx, hi))
        let distance = hypot(target - x, ty - y)
        vx = 0; vy = 0
        guard distance > 1 else {
            x = target; y = ty
            dash = nil; dashEnded = true
            mode = wantsRest && ty <= 0 ? .rest : .swim
            return
        }
        dash = JellyDash(fromX: x, fromY: y, toX: target, toY: ty, duration: JellyDash.duration(distance: distance))
        dashEnded = false
        mode = .swim
        phase = 0
        if abs(target - x) > 1 { facing = target > x ? 1 : -1 }
    }
```

(d) 在 `step(dt:random:)` 里，弹簧形变三行之后、`guard mode == .swim else { return }` 之前加入冲刺分支：

```swift
        if var d = dash {
            d.elapsed += dt
            let u = d.progress
            let pos = d.position(at: u)
            x = pos.x; y = pos.y
            let dx = d.toX - d.fromX
            let speed = d.duration > 0 ? dx * JellyDash.slope(u) / d.duration : 0
            vx = max(-JellyDash.maxVisualSpeed, min(JellyDash.maxVisualSpeed, speed)); vy = 0
            phase += dt / JellyDash.pulsePeriod
            if phase >= 1 { phase -= floor(phase); pulsed = true }
            if u >= 1 {
                x = d.toX; y = d.toY; vx = 0; vy = 0
                dash = nil; dashEnded = true
                mode = wantsRest && d.toY <= 0 ? .rest : .swim
                if d.toY <= 0 { squashV += 8; landed = true }
            } else {
                dash = d
            }
            return
        }
```

- [ ] **Step 4: 运行，确认通过**

Run: `/tmp/selftest.sh`
Expected: `ALL PASS`。既有的物理自测（纵向分布、掉头、落地等）必须仍然全部通过，说明冲刺分支没有改动平时的游动。

---

## Task 4: 纯逻辑 — 气泡配色与对比度（`jelly-palette.swift`）与构建/契约清单

**Files:**
- Create: `desktop-reminder/jelly-palette.swift`
- Modify: `desktop-reminder/companion-selftest.swift`（追加配色块、更新头部注释）
- Modify: `desktop-reminder/build.mjs`（清单加入 `jelly-palette.swift` 与 `jelly-ring.swift`）
- Modify: `test/desktop-companion-logic.test.mjs`（构建顺序、自测编译命令、`main.swift` 合同）

**Interfaces:**
- Produces: `JellyRGB(hex:alpha:)`（`r/g/b/a` 为 0…1 的 `Double`）、`JellyBubblePalette { fillTop, fillBottom, border, clock, title, body, status, success, error, ghostFill, ghostText, primaryTop, primaryBottom, primaryText, nudgePrimaryText }`、`.light`、`.dark`、`JellyBubblePalette.contrast(_:on:) -> Double`、`worstContrast(of:) -> Double`、`worstGhostContrast() -> Double`、`worstPrimaryContrast() -> Double`。

- [ ] **Step 1: 写失败的自测**

在 `companion-selftest.swift` 的冲刺块之后追加：

```swift
// --- 气泡配色：浅/深两套。底板半透明，对比度按“底板叠在纯白与纯黑上各算一次、取更差的”，渐变两端都算 ---
do {
    func f(_ value: Double) -> String { String(format: "%.2f", value) }
    for (name, palette) in [("浅色", JellyBubblePalette.light), ("深色", JellyBubblePalette.dark)] {
        let rules: [(String, JellyRGB, Double)] = [("大号时间", palette.clock, 3), ("标题", palette.title, 4.5), ("正文", palette.body, 4.5), ("状态", palette.status, 4.5), ("成功", palette.success, 4.5), ("错误", palette.error, 4.5)]
        for (label, color, floor) in rules {
            let worst = palette.worstContrast(of: color)
            check(worst >= floor, "\(name)\(label)文字对比度 \(f(worst)) ≥ \(floor)")
        }
        check(palette.worstGhostContrast() >= 4.5, "\(name)次按钮文字对比度 \(f(palette.worstGhostContrast())) ≥ 4.5")
        check(palette.worstPrimaryContrast() >= 4.5, "\(name)主按钮白字对比度 \(f(palette.worstPrimaryContrast())) ≥ 4.5")
    }
    let lightFill = JellyBubblePalette.light.fillTop.composited(over: JellyRGB(hex: 0xFFFFFF)), darkFill = JellyBubblePalette.dark.fillTop.composited(over: JellyRGB(hex: 0xFFFFFF))
    check(lightFill.luminance > 0.85 && darkFill.luminance < 0.12, "浅色底亮、深色底暗（没有拿反：\(f(lightFill.luminance)) / \(f(darkFill.luminance))）")
    check(JellyBubblePalette.light.border == JellyBubblePalette.light.border && JellyBubblePalette.light.border.a > 0.3 && JellyBubblePalette.dark.border.a > 0.3, "金色描边在两套里都看得见")
    check(abs(JellyBubblePalette.contrast(JellyRGB(hex: 0x000000), on: JellyRGB(hex: 0xFFFFFF)) - 21) < 1e-9 && abs(JellyBubblePalette.contrast(JellyRGB(hex: 0xFFFFFF), on: JellyRGB(hex: 0xFFFFFF)) - 1) < 1e-9, "对比度公式：黑白 21:1、同色 1:1")
    check(abs(JellyRGB(hex: 0xFF0000, alpha: 0.5).composited(over: JellyRGB(hex: 0x000000)).r - 0.5) < 1e-12, "半透明叠色")
}
```

并把文件头部注释的编译命令里的文件列表更新为 `countdown-model.swift jelly-model.swift jelly-swim.swift jelly-palette.swift`，注释首行改为“纯逻辑自测：countdown-model.swift + jelly-model.swift + jelly-swim.swift + jelly-palette.swift（无 AppKit）”。

- [ ] **Step 2: 运行，确认失败（编译错误）**

Run: `/tmp/selftest.sh`
Expected: 编译失败，`JellyRGB`、`JellyBubblePalette` 未定义（脚本发现 `jelly-palette.swift` 不存在时不加入编译文件）。

- [ ] **Step 3: 实现**

创建 `desktop-reminder/jelly-palette.swift`：

```swift
import Foundation

// 水母气泡的配色（浅色 / 深色两套）与对比度计算。纯数据，只依赖 Foundation，由 companion-selftest.swift 单独编译验证。
// 所有水母气泡（倒计时读数、点一下的详情、喝水/起身提醒、到点响铃）都按系统外观取其中一套。
// 色值是初始取值，须以真实截图校准；对比度由自测守住（正文 ≥ 4.5:1、大号时间 ≥ 3:1）。

struct JellyRGB: Equatable {
    var r: Double, g: Double, b: Double, a: Double

    init(hex: UInt32, alpha: Double = 1) {
        r = Double((hex >> 16) & 0xFF) / 255
        g = Double((hex >> 8) & 0xFF) / 255
        b = Double(hex & 0xFF) / 255
        a = alpha
    }

    /// 叠在 background 上之后的不透明颜色。
    func composited(over background: JellyRGB) -> JellyRGB {
        var result = JellyRGB(hex: 0)
        result.r = r * a + background.r * (1 - a)
        result.g = g * a + background.g * (1 - a)
        result.b = b * a + background.b * (1 - a)
        result.a = 1
        return result
    }

    /// WCAG 相对亮度（忽略自身透明度，调用方先叠色）。
    var luminance: Double {
        func linear(_ c: Double) -> Double { c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
    }
}

struct JellyBubblePalette {
    var fillTop: JellyRGB
    var fillBottom: JellyRGB
    var border: JellyRGB
    var clock: JellyRGB
    var title: JellyRGB
    var body: JellyRGB
    var status: JellyRGB            // 同步中等信息色
    var success: JellyRGB           // 喝水气泡里“已记录”的绿色
    var error: JellyRGB
    var ghostFill: JellyRGB         // 次按钮底（半透明，叠在气泡底板上）
    var ghostText: JellyRGB
    var primaryTop: JellyRGB        // 主按钮渐变（两种外观相同）
    var primaryBottom: JellyRGB
    var primaryText: JellyRGB
    var nudgePrimaryText: JellyRGB  // 喝水气泡里系统圆角主按钮的强调字色

    static let light = JellyBubblePalette(
        fillTop: JellyRGB(hex: 0xFFFFFF, alpha: 0.97), fillBottom: JellyRGB(hex: 0xF6FCFE, alpha: 0.94),
        border: JellyRGB(hex: 0xE6B040, alpha: 0.5),
        clock: JellyRGB(hex: 0x16394F), title: JellyRGB(hex: 0x1F4047), body: JellyRGB(hex: 0x3D575E),
        status: JellyRGB(hex: 0x14708A), success: JellyRGB(hex: 0x1D7348), error: JellyRGB(hex: 0xBD3027),
        ghostFill: JellyRGB(hex: 0x1F4047, alpha: 0.09), ghostText: JellyRGB(hex: 0x2C4B52),
        primaryTop: JellyRGB(hex: 0x14809B), primaryBottom: JellyRGB(hex: 0x0B6B86), primaryText: JellyRGB(hex: 0xFFFFFF),
        nudgePrimaryText: JellyRGB(hex: 0x14708A))

    static let dark = JellyBubblePalette(
        fillTop: JellyRGB(hex: 0x303A49, alpha: 0.97), fillBottom: JellyRGB(hex: 0x222936, alpha: 0.96),
        border: JellyRGB(hex: 0xE6B040, alpha: 0.42),
        clock: JellyRGB(hex: 0xF4FBFF), title: JellyRGB(hex: 0xE6F1F4), body: JellyRGB(hex: 0xC3D3D8),
        status: JellyRGB(hex: 0x6FD0E6), success: JellyRGB(hex: 0x7DDBB0), error: JellyRGB(hex: 0xFF9087),
        ghostFill: JellyRGB(hex: 0xFFFFFF, alpha: 0.13), ghostText: JellyRGB(hex: 0xDBE8EC),
        primaryTop: JellyRGB(hex: 0x14809B), primaryBottom: JellyRGB(hex: 0x0B6B86), primaryText: JellyRGB(hex: 0xFFFFFF),
        nudgePrimaryText: JellyRGB(hex: 0x6FD0E6))

    /// text 相对 background（须不透明）的对比度，1…21。
    static func contrast(_ text: JellyRGB, on background: JellyRGB) -> Double {
        let a = text.composited(over: background).luminance, b = background.luminance
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    private static let backdrops = [JellyRGB(hex: 0xFFFFFF), JellyRGB(hex: 0x000000)]

    /// 文字相对半透明底板的最差对比度：桌面背景未知，底板叠在纯白与纯黑上各算一次，渐变两端都算。
    func worstContrast(of text: JellyRGB) -> Double {
        var worst = Double.infinity
        for fill in [fillTop, fillBottom] {
            for backdrop in JellyBubblePalette.backdrops {
                worst = min(worst, JellyBubblePalette.contrast(text, on: fill.composited(over: backdrop)))
            }
        }
        return worst
    }

    /// 次按钮文字相对“次按钮底叠在气泡底板上”的最差对比度。
    func worstGhostContrast() -> Double {
        var worst = Double.infinity
        for fill in [fillTop, fillBottom] {
            for backdrop in JellyBubblePalette.backdrops {
                let bubble = fill.composited(over: backdrop)
                worst = min(worst, JellyBubblePalette.contrast(ghostText, on: ghostFill.composited(over: bubble)))
            }
        }
        return worst
    }

    /// 主按钮白字相对渐变两端的最差对比度。
    func worstPrimaryContrast() -> Double {
        min(JellyBubblePalette.contrast(primaryText, on: primaryTop.composited(over: JellyRGB(hex: 0x000000))),
            JellyBubblePalette.contrast(primaryText, on: primaryBottom.composited(over: JellyRGB(hex: 0x000000))))
    }
}
```

（`JellyRGB(hex: 0)` 只在 `composited` 里当作可变的空白结果用。）

在 `desktop-reminder/build.mjs` 的 `swiftc` 参数里，把清单改为（顺序：纯逻辑 → AppKit → `main.swift` 最后）：

```js
execFileSync('/usr/bin/xcrun', ['swiftc', ...['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'glass-view', 'jelly-ring', 'jelly-companion', 'jelly-controller', 'confirmation-view', 'main'].map(name => resolve(root, `desktop-reminder/${name}.swift`)), '-framework', 'AppKit', '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', executable], { stdio: 'inherit' });
```

> 注意：`jelly-ring.swift` 在 Task 5 才创建，本任务结束时 `build.mjs` 暂时会因缺文件而无法构建，这是预期的；Task 5 完成后恢复。契约测试按下面更新。

在 `test/desktop-companion-logic.test.mjs` 里：

1. 构建顺序断言的 `order` 改为：

```js
  const order = ['countdown-model.swift', 'jelly-model.swift', 'jelly-swim.swift', 'jelly-palette.swift', 'glass-view.swift', 'jelly-ring.swift', 'jelly-companion.swift', 'jelly-controller.swift', 'confirmation-view.swift', 'main.swift'];
```

（`build.mjs` 现在用 `map` 生成路径，字符串 `desktop-reminder/${file}` 不再逐个出现；所以把断言改成读取 `build.mjs` 里的名字数组：

```js
  const listed = build.match(/\[('countdown-model'[^\]]*)\]\.map/)?.[1].split(',').map(s => s.trim().replace(/'/g, '')) ?? [];
  assert.deepEqual(listed, ['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'glass-view', 'jelly-ring', 'jelly-companion', 'jelly-controller', 'confirmation-view', 'main'], '构建清单：纯逻辑在前、AppKit 在后、main.swift 最后');
  for (const name of listed) assert.ok(existsSync(resolve(root, `desktop-reminder/${name}.swift`)), `${name}.swift 必须存在`);
```
并删除原来的 `for (const file of order) {...}` 循环与 `order` 数组。）

2. 在 `main.swift` 合同断言里，把 `assert.match(main, /"version": 6/, ...)` 之后追加：

```js
  assert.doesNotMatch(main, /buildPanel|springIn|stopButton|snoozeButton|titleLabel|timeLabel|statusLabel/, '旧的深色提醒卡片界面不应残留在 main.swift');
  assert.match(main, /case "show":[^\n]*jelly\.showRing/, '响铃由水母承载：show 路由到 showRing');
  assert.match(main, /case "hide":[^\n]*jelly\.hideRing/, 'hide 路由到 hideRing');
  assert.match(main, /case "actionResult":[^\n]*jelly\.ringActionResult/, 'actionResult 路由到 ringActionResult');
  assert.match(main, /final class ReminderPanel: NSPanel/, 'ReminderPanel 类保留（水母窗口与确认卡的类型）');
```

3. 自测编译命令（`execFileSync(swiftc, ['swiftc', ...` 那一行）里加入 `jelly-palette.swift`：

```js
    execFileSync(swiftc, ['swiftc', resolve(root, 'desktop-reminder/countdown-model.swift'), resolve(root, 'desktop-reminder/jelly-model.swift'), resolve(root, 'desktop-reminder/jelly-swim.swift'), resolve(root, 'desktop-reminder/jelly-palette.swift'), join(dir, 'main.swift'), '-module-cache-path', join(dir, 'cache'), '-o', exe], { stdio: 'pipe' });
```

- [ ] **Step 4: 运行，确认配色自测通过**

Run: `/tmp/selftest.sh`
Expected: `ALL PASS`（含浅/深色每项对比度的 `ok` 行，可在无 grep 过滤时看到具体数值：浅色状态 4.78、成功 4.93、错误 4.91，深色错误 4.79 等）。若有对比度 `FAIL`，只调整调色板色值（朝更深/更浅方向），不降低阈值。

> 此时 `node --test test/desktop-companion-logic.test.mjs` 的“构建清单”测试仍会失败（`jelly-ring.swift` 和 `main.swift` 合同尚未满足），这是预期的，Task 6 结束时才会全部通过。

---

## Task 5: AppKit 视图层 — `jelly-ring.swift` 新文件与 `jelly-companion.swift` 改造

**Files:**
- Create: `desktop-reminder/jelly-ring.swift`
- Modify: `desktop-reminder/jelly-companion.swift`

**Interfaces:**
- Consumes: Task 2–4 的 `JellyModel`、`JellyDash`、`JellyRingMotion`、`JellyBubblePalette`、`JellyRGB`。
- Produces（Task 6 的控制器使用）：
  - `JellyBubble.Kind.ring`；`JellyBubble.bigClock: String?`、`confirm: String?`（有它时按钮收起、文字画在按钮那一行，`bad` 决定颜色）
  - `JellyPose.ripples: Bool`、`JellyPose.ringAge: CGFloat`（自气泡（重新）弹出起的秒数，弹出、涟漪、按钮淡入共用）
  - `JellyInfo.ripples: Bool`、`JellyInfo.ringEpoch: Int`（变化时重播弹出）
  - `JellyCompanion.dash(toX:completion:)`、`centerX`、`rightEdgeX`、`isOnMouseScreen()`、`startAtRightEdgeOnce`、`show()`（支持从右边出现）、`hide(remember:)`、`onGrabBegin`
  - `JellyView.palette/isDark`、`JellyView.bubbleRectString()`、`JellyView.appearanceName`
  - 响铃气泡 `JellyRingLayout.size(_:)/frame(...)`、`JellyRingPainter.draw(...)`、`JellyPillButton`

### Step 1: 创建 `desktop-reminder/jelly-ring.swift`

```swift
import AppKit

// 到点响铃气泡的 AppKit 部分：版式（尺寸由文字量出）、绘制（气泡本体）和通栏胶囊按钮。
// 纯逻辑（解析、文案、配色、弹出与涟漪曲线）在 jelly-model / jelly-palette / jelly-swim，由 companion-selftest 单独验证；
// 这里的数值是初始取值，须以真实截图校准。窗口、尾巴与夹屏沿用 JellyBubbleLayout，所以这里只算响铃气泡自己的内部版式。

extension NSColor {
    convenience init(_ color: JellyRGB) {
        self.init(srgbRed: CGFloat(color.r), green: CGFloat(color.g), blue: CGFloat(color.b), alpha: CGFloat(color.a))
    }
}

enum JellyRingLayout {
    static let width: CGFloat = 300
    static let pad: CGFloat = 16
    static let edge: CGFloat = 28            // 响铃气泡阴影模糊半径约 10，边距比其他气泡（14）大
    static let radius: CGFloat = 18
    static let tail: CGFloat = 6
    static let buttonHeight: CGFloat = 30
    static let buttonGap: CGFloat = 8
    static let clockGap: CGFloat = 8         // 时间 → 标题
    static let statusGap: CGFloat = 7        // 标题 → 状态
    static let buttonsGap: CGFloat = 14      // 状态 → 按钮
    static let lineGap: CGFloat = 2          // 多个名字之间

    static let clockFont: NSFont = {
        let base = NSFont.monospacedDigitSystemFont(ofSize: 40, weight: .bold)
        if #available(macOS 11.0, *), let rounded = base.fontDescriptor.withDesign(.rounded), let font = NSFont(descriptor: rounded, size: 40) { return font }
        return base
    }()
    static func titleFont(count: Int, hasClock: Bool) -> NSFont {
        if !hasClock { return .systemFont(ofSize: count == 1 ? 19 : 15, weight: .semibold) }   // 没有大时间：标题放大
        return count == 1 ? .systemFont(ofSize: 15, weight: .semibold) : .systemFont(ofSize: 14, weight: .medium)
    }
    static let statusFont = NSFont.systemFont(ofSize: 11.5, weight: .medium)
    static let buttonFont = NSFont.systemFont(ofSize: 13, weight: .semibold)
    static let confirmFont = NSFont.systemFont(ofSize: 15, weight: .semibold)

    private struct Metrics {
        var size: NSSize
        var clock: CGFloat
        var lines: [CGFloat]
        var status: CGFloat
    }

    private static func metrics(_ bubble: JellyBubble) -> Metrics {
        let hasClock = !(bubble.bigClock ?? "").isEmpty
        let clock = hasClock ? JellyBubbleLayout.lineHeight(clockFont) : 0
        let font = titleFont(count: bubble.lines.count, hasClock: hasClock)
        let lines = bubble.lines.map { _ in JellyBubbleLayout.lineHeight(font) }
        let inner = width - pad * 2
        // 状态行的位置常驻（没有内容时也留着），点按钮后出现“正在同步…”不会把时间和标题顶上去
        let reserved = JellyBubbleLayout.lineHeight(statusFont)
        let status = bubble.status.map { max(reserved, JellyBubbleLayout.measure($0, font: statusFont, width: inner, maxLines: 2).height) } ?? reserved
        let titles = lines.reduce(0, +) + CGFloat(max(0, lines.count - 1)) * lineGap
        var height = pad + buttonHeight + buttonsGap + status + statusGap + titles + pad
        if clock > 0 { height += clockGap + clock }
        return Metrics(size: NSSize(width: width, height: ceil(height)), clock: clock, lines: lines, status: status)
    }

    static func size(_ bubble: JellyBubble) -> NSSize { metrics(bubble).size }

    /// 自下而上排：下内边距 → 按钮行 → 状态行 → 标题各行 → 时间 → 上内边距。
    static func frame(_ bubble: JellyBubble, bodyX: CGFloat, viewWidth: CGFloat) -> JellyBubbleLayout.Frame {
        let m = metrics(bubble)
        let boxWidth = min(m.size.width, viewWidth - edge * 2)
        let x = max(edge, min(bodyX - boxWidth / 2, viewWidth - edge - boxWidth))
        let rect = NSRect(x: x, y: JellyBubbleLayout.minY, width: boxWidth, height: m.size.height)
        let tailX = max(rect.minX + 24, min(bodyX, rect.maxX - 24))
        let innerX = rect.minX + pad, innerWidth = rect.width - pad * 2
        var y = rect.minY + pad
        let slot = NSRect(x: innerX, y: y, width: innerWidth, height: buttonHeight)
        var buttons: [NSRect] = []
        switch bubble.buttons.count {
        case 1: buttons = [slot]
        case 2:
            let total = innerWidth - buttonGap
            let first = floor(total * 1.6 / 2.6)      // 次按钮文字长，宽度权重 1.6；主按钮“停止”权重 1
            buttons = [NSRect(x: innerX, y: y, width: first, height: buttonHeight), NSRect(x: innerX + first + buttonGap, y: y, width: total - first, height: buttonHeight)]
        default: break
        }
        y += buttonHeight + buttonsGap
        let status = NSRect(x: innerX, y: y, width: innerWidth, height: m.status)
        y += m.status + statusGap
        var lines = [NSRect](repeating: .zero, count: m.lines.count)
        for i in stride(from: m.lines.count - 1, through: 0, by: -1) {
            lines[i] = NSRect(x: innerX, y: y, width: innerWidth, height: m.lines[i])
            y += m.lines[i] + lineGap
        }
        y -= lineGap
        var clock = NSRect.zero
        if m.clock > 0 { y += clockGap; clock = NSRect(x: innerX, y: y, width: innerWidth, height: m.clock) }
        return JellyBubbleLayout.Frame(rect: rect, tailX: tailX, title: .zero, text: .zero, status: status, buttons: buttons, clock: clock, lines: lines, slot: slot)
    }
}

/// 响铃气泡本体的绘制（按钮是真控件，不在这里画）：阴影与底板、金色描边、时间、标题、状态或确认语。
/// 弹出时气泡本体按尾巴尖为中心缩放并淡入（JellyRingMotion）；按钮在弹出后段淡入，由 JellyView 控制。
enum JellyRingPainter {
    static func draw(_ bubble: JellyBubble, frame: JellyBubbleLayout.Frame, palette: JellyBubblePalette, dark: Bool, age: CGFloat) {
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let rect = frame.rect
        let tipY = rect.minY - JellyRingLayout.tail
        ctx.saveGState()
        ctx.translateBy(x: frame.tailX, y: tipY)
        let scale = JellyRingMotion.popScale(age: age)
        ctx.scaleBy(x: scale, y: scale)
        ctx.translateBy(x: -frame.tailX, y: -tipY)
        ctx.setAlpha(JellyRingMotion.popAlpha(age: age))

        let shape = NSBezierPath(roundedRect: rect, xRadius: JellyRingLayout.radius, yRadius: JellyRingLayout.radius)
        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: frame.tailX - 7, y: rect.minY + 1))
        tail.line(to: NSPoint(x: frame.tailX, y: tipY))
        tail.line(to: NSPoint(x: frame.tailX + 7, y: rect.minY + 1))
        tail.close()
        shape.append(tail)
        // 阴影：先填一层带阴影的底，再盖渐变（渐变本身半透明，底层与它叠在一起只会更不透明，不会降低文字对比度）
        NSGraphicsContext.saveGraphicsState()
        let shadow = NSShadow()
        shadow.shadowColor = NSColor.black.withAlphaComponent(dark ? 0.5 : 0.22)
        shadow.shadowBlurRadius = 10
        shadow.shadowOffset = NSSize(width: 0, height: -3)
        shadow.set()
        NSColor(palette.fillBottom).setFill()
        shape.fill()
        NSGraphicsContext.restoreGraphicsState()
        NSGraphicsContext.saveGraphicsState()
        shape.addClip()
        NSGradient(starting: NSColor(palette.fillTop), ending: NSColor(palette.fillBottom))?.draw(in: NSRect(x: rect.minX, y: tipY, width: rect.width, height: rect.height + JellyRingLayout.tail), angle: -90)
        NSGraphicsContext.restoreGraphicsState()
        NSColor(palette.border).setStroke()
        shape.lineWidth = 1
        shape.stroke()

        func text(_ value: String, in box: NSRect, font: NSFont, color: NSColor) {
            // 与 JellyBubbleLayout 同一套行高；向下多给 3 点余量避免取整误差把单行判成放不下
            let room = NSRect(x: box.minX, y: box.minY - 3, width: box.width, height: box.height + 3)
            (value as NSString).draw(with: room, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: JellyBubbleLayout.attributes(font, color: color, lineBreak: .byTruncatingTail))
        }
        if let clock = bubble.bigClock, !clock.isEmpty, frame.clock.height > 0 { text(clock, in: frame.clock, font: JellyRingLayout.clockFont, color: NSColor(palette.clock)) }
        let hasClock = !(bubble.bigClock ?? "").isEmpty
        let titleFont = JellyRingLayout.titleFont(count: bubble.lines.count, hasClock: hasClock)
        for (line, box) in zip(bubble.lines, frame.lines) { text(line, in: box, font: titleFont, color: NSColor(palette.title)) }
        if let confirm = bubble.confirm {
            text(confirm, in: NSRect(x: frame.slot.minX, y: frame.slot.midY - JellyBubbleLayout.lineHeight(JellyRingLayout.confirmFont) / 2, width: frame.slot.width, height: JellyBubbleLayout.lineHeight(JellyRingLayout.confirmFont)), font: JellyRingLayout.confirmFont, color: NSColor(bubble.bad ? palette.error : palette.success))
        } else if let status = bubble.status {
            text(status, in: frame.status, font: JellyRingLayout.statusFont, color: NSColor(bubble.bad ? palette.error : palette.status))
        }
        ctx.restoreGState()
    }
}

/// 通栏胶囊按钮：真正的 NSButton 子类（键盘与辅助功能可用），自己画实心青色渐变（主）或淡色底（次）。
final class JellyPillButton: NSButton {
    var primary = false { didSet { needsDisplay = true } }
    var palette = JellyBubblePalette.light { didSet { needsDisplay = true } }
    private var hovering = false { didSet { needsDisplay = true } }
    private var area: NSTrackingArea?

    init(id: String, title: String, primary: Bool, target: AnyObject?, action: Selector) {
        super.init(frame: .zero)
        self.title = title
        self.primary = primary
        self.identifier = NSUserInterfaceItemIdentifier(id)
        self.target = target
        self.action = action
        isBordered = false
        setButtonType(.momentaryPushIn)
        focusRingType = .none
        setAccessibilityLabel(title)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var isFlipped: Bool { false }
    override var isOpaque: Bool { false }
    override var acceptsFirstResponder: Bool { true }
    override func resetCursorRects() { addCursorRect(bounds, cursor: .pointingHand) }
    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        if let area = area { removeTrackingArea(area) }
        let next = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect], owner: self, userInfo: nil)
        addTrackingArea(next)
        area = next
    }
    override func mouseEntered(with event: NSEvent) { hovering = true }
    override func mouseExited(with event: NSEvent) { hovering = false }

    override func draw(_ dirtyRect: NSRect) {
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: rect, xRadius: rect.height / 2, yRadius: rect.height / 2)
        let dim: CGFloat = isEnabled ? 1 : 0.45
        let press: CGFloat = isHighlighted ? 0.16 : 0          // 按下略暗
        let hover: CGFloat = hovering && isEnabled ? 0.08 : 0   // 悬停略亮
        func tweak(_ color: JellyRGB) -> NSColor {
            let base = NSColor(color)
            let lit = base.blended(withFraction: hover, of: .white) ?? base
            let dark = lit.blended(withFraction: press, of: .black) ?? lit
            return dark.withAlphaComponent(CGFloat(color.a) * dim)
        }
        if primary {
            NSGradient(starting: tweak(palette.primaryTop), ending: tweak(palette.primaryBottom))?.draw(in: path, angle: -90)
        } else {
            tweak(palette.ghostFill).setFill()
            path.fill()
        }
        let font = JellyRingLayout.buttonFont
        let color = (primary ? NSColor(palette.primaryText) : NSColor(palette.ghostText)).withAlphaComponent(dim)
        let lineHeight = JellyBubbleLayout.lineHeight(font)
        let box = NSRect(x: bounds.minX + 8, y: bounds.midY - lineHeight / 2 - 1, width: bounds.width - 16, height: lineHeight + 3)
        (title as NSString).draw(with: box, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], attributes: JellyBubbleLayout.attributes(font, color: color, lineBreak: .byTruncatingTail))
        if window?.firstResponder === self && isEnabled {          // 键盘焦点环
            NSColor(palette.status).withAlphaComponent(0.8).setStroke()
            let ring = NSBezierPath(roundedRect: bounds.insetBy(dx: 1.5, dy: 1.5), xRadius: (bounds.height - 3) / 2, yRadius: (bounds.height - 3) / 2)
            ring.lineWidth = 2
            ring.stroke()
        }
    }
}
```

### Step 2: 改造 `jelly-companion.swift`

按顺序做这些修改（每一处都是对现有代码的精确改动，不改无关逻辑）：

1. **`JellyBubble`**：`Kind` 增加 `ring`，增加两个字段：

```swift
    enum Kind { case clock, note, detail, nudge, ring }
    // ……其余字段不变……
    var alert = false               // clock：临近到点用红色
    var bigClock: String? = nil     // ring：大号时间 "HH:mm"
    var confirm: String? = nil      // ring：确认语；有它时按钮收起，文字画在按钮那一行（bad 决定颜色）
```

2. **`JellyBubbleLayout`**：
   - 在 `static let edge` 之后加：`static func edge(for kind: JellyBubble.Kind) -> CGFloat { kind == .ring ? JellyRingLayout.edge : edge }`
   - `Frame` 增加三个带默认值的成员（现有 `Frame(...)` 调用不受影响）：`var clock = NSRect.zero`、`var lines: [NSRect] = []`、`var slot = NSRect.zero`
   - `windowSize(for:base:)`：`let size = bubble.kind == .ring ? JellyRingLayout.size(bubble) : metrics(bubble).size`；`edge` 换成 `edge(for: bubble.kind)`
   - `frame(_:bodyX:viewWidth:)`：函数第一行加 `if bubble.kind == .ring { return JellyRingLayout.frame(bubble, bodyX: bodyX, viewWidth: viewWidth) }`；其余 `edge` 换成 `edge(for: bubble.kind)`

3. **`JellyPose`**：加 `var ripples = false`、`var ringAge: CGFloat = 1000`。

4. **`JellyView`**：
   - 删除 `override init(frame:)` 里的 `appearance = NSAppearance(named: .aqua)`（保留 `override init(frame:)` 本身，调用 `super.init(frame:)`），注释改为“气泡与按钮跟随系统深浅色”。
   - 新增：

```swift
    var reduceMotion = false { didSet { if reduceMotion != oldValue { needsDisplay = true } } }
    /// 当前外观是否深色，以及对应的调色板（所有水母气泡共用；测试用环境变量 TIMEKEEPER_APPEARANCE 通过窗口外观强制）。
    var isDark: Bool { effectiveAppearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua }
    var palette: JellyBubblePalette { isDark ? .dark : .light }
    var appearanceName: String { isDark ? "dark" : "light" }
    override func viewDidChangeEffectiveAppearance() {
        super.viewDidChangeEffectiveAppearance()
        restyleButtons()
        needsDisplay = true
    }
    /// 当前气泡本体在视图里的矩形（NSStringFromRect 格式，空串表示没有气泡），验收脚本据此取样截图像素。
    func bubbleRectString() -> String {
        guard let bubble = pose.bubble else { return "" }
        return NSStringFromRect(bubbleFrame(bubble, bodyX: bodyX ?? bounds.midX).rect)
    }
```
   - `pose.didSet` 里 `rebuildButtons()` 之后加 `syncButtonAlpha()`。
   - `rebuildButtons()`：记录 `buttonKind`；相同种类、id 与文字不变时只更新 `isEnabled` 与 `isHidden`（`pose.bubble?.confirm != nil` 时隐藏）；重建时 `kind == .ring` 创建 `JellyPillButton(id:title:primary:target:action:)`（`palette` 取当前、`isEnabled`、`isHidden`），其他种类沿用现有系统圆角 `NSButton`（主按钮标题改调用 `styleSystemPrimary`）。
   - 新增：

```swift
    private var buttonKind: JellyBubble.Kind?

    private func styleSystemPrimary(_ button: NSButton, title: String) {
        button.attributedTitle = NSAttributedString(string: title, attributes: [.font: NSFont.systemFont(ofSize: 11, weight: .semibold), .foregroundColor: NSColor(palette.nudgePrimaryText)])
    }
    private func restyleButtons() {
        let palette = self.palette
        for (button, spec) in zip(buttonViews, pose.bubble?.buttons ?? []) {
            if let pill = button as? JellyPillButton { pill.palette = palette }
            else if spec.primary { styleSystemPrimary(button, title: spec.title) }
        }
    }
    /// 响铃气泡的按钮在弹出后段才淡入（气泡本体在缩放，按钮是真控件，不跟着缩放）。
    private func syncButtonAlpha() {
        guard pose.bubble?.kind == .ring, !buttonViews.isEmpty else { return }
        let alpha = reduceMotion ? 1 : JellyRingMotion.buttonAlpha(age: pose.ringAge)
        for button in buttonViews where button.alphaValue != alpha { button.alphaValue = alpha }
    }
```
   - `draw(_:)`：在夜晚光晕之后、水母本体之前加 `if p.ripples { drawRipples(cx: cx, cy: by + h * 0.45, p: p) }`；新增

```swift
    /// 响铃涟漪：钟罩周围向外扩散的圈，画在水母与气泡之下（曲线见 JellyRingMotion）。
    private func drawRipples(cx: CGFloat, cy: CGFloat, p: JellyPose) {
        for ring in JellyRingMotion.ripples(time: p.ringAge, reduceMotion: reduceMotion) where ring.alpha > 0.004 {
            let path = NSBezierPath(ovalIn: NSRect(x: cx - ring.radius, y: cy - ring.radius, width: ring.radius * 2, height: ring.radius * 2))
            path.lineWidth = 2
            p.tint.color(ring.alpha, lighten: 0.15).setStroke()
            path.stroke()
        }
    }
```
   - `drawBubble(cx:p:)`：取 `let palette = self.palette`；`bubble.kind == .ring` 时 `JellyRingPainter.draw(bubble, frame: frame, palette: palette, dark: isDark, age: reduceMotion ? JellyRingMotion.popDuration : p.ringAge); return`；其余种类的颜色全部改为调色板：`ink → NSColor(palette.title)`、`soft → NSColor(palette.body)`、`red → NSColor(palette.error)`、状态绿 → `NSColor(palette.success)`、底板填色 `NSColor(palette.fillTop)`、阴影透明度深色 0.4 / 浅色 0.16；阶段色描边保持不变。

5. **`JellyInfo`**：加 `var ripples = false`、`var ringEpoch = 0`。

6. **`JellyCompanion`**：
   - 新增成员：`var onGrabBegin: (() -> Void)?`、`var startAtRightEdgeOnce = false`、`private var dashCompletion: (() -> Void)?`、`private var ringStart: CFTimeInterval = 0`、`private var laneScreenFrame = NSRect.zero`；`init` 里按环境变量强制外观：

```swift
        switch ProcessInfo.processInfo.environment["TIMEKEEPER_APPEARANCE"] {      // 仅隔离验收：强制浅/深外观
        case "dark": panel.appearance = NSAppearance(named: .darkAqua)
        case "light": panel.appearance = NSAppearance(named: .aqua)
        default: break
        }
```
   - `refreshLane(for:)` 里记录 `laneScreenFrame = screen?.frame ?? .zero`。
   - 新增：

```swift
    /// 响铃落点：所在屏幕可见区的底部正中（夹进泳线范围）；须在 show() 之后调用。
    var centerX: CGFloat { max(swim.lo, min(laneFrame.midX, swim.hi)) }
    /// 泳线最右端：没出现的水母从这里游入，响完不再需要时游向这里后消失。
    var rightEdgeX: CGFloat { swim.hi }
    /// 水母已出现并且就在鼠标所在的屏幕上？不在时响铃改从目标屏幕右边出现（跨屏时原屏上直接消失，不做淡出）。
    func isOnMouseScreen() -> Bool {
        guard panel.isVisible else { return false }
        guard let mouse = screenAt(NSEvent.mouseLocation) else { return true }
        return laneScreenFrame == mouse.frame
    }

    /// 游到泳线上的 x（夹进泳线范围），到位后回调一次；被新的冲刺替换或被用户抓住时回调作废，不会被调用。
    /// “减少动态效果”或窗口不可见：直接就位，回调异步触发。
    func dash(toX x: CGFloat, completion: (() -> Void)? = nil) {
        dashCompletion = nil
        if reduceMotion || !panel.isVisible {
            swim.dash = nil; swim.dashEnded = false
            swim.x = max(swim.lo, min(x, swim.hi)); swim.y = 0; swim.vx = 0; swim.vy = 0; swim.mode = .rest
            layoutPanel(); syncPose()
            if let completion = completion { DispatchQueue.main.async(execute: completion) }
            return
        }
        dashCompletion = completion
        swim.startDash(toX: x)
        if swim.dashEnded {       // 距离不足 1 点：已经在落点上
            swim.dashEnded = false
            let done = dashCompletion; dashCompletion = nil
            if let done = done { DispatchQueue.main.async(execute: done) }
        }
        ensureTicking()
    }
```
   - `show()`：`swim.x = startAtRightEdgeOnce ? swim.hi : (saved.map { CGFloat($0) } ?? swim.hi - 40)`，随后 `startAtRightEdgeOnce = false`。
   - `hide()` 改为 `hide(remember: Bool = true)`：只有 `remember` 时才写 `CompanionX`；同时 `dashCompletion = nil`。
   - `update(_:reduceMotion:)`：在 `info = next` 之前加 `if next.ringEpoch != info.ringEpoch { ringStart = CACurrentMediaTime() }`。
   - `syncPose()`：

```swift
        next.ripples = info.ripples
        next.ringAge = info.ringEpoch == 0 ? 1000 : CGFloat(max(0, CACurrentMediaTime() - ringStart))
        // 响铃时水母停在泳线上：钟罩按 0.5 秒节奏收缩只是视觉，不移动窗口
        if info.ripples && !reduceMotion && swim.mode == .rest {
            next.contraction = JellySwim.contraction(atPhase: (next.ringAge / JellyDash.pulsePeriod).truncatingRemainder(dividingBy: 1))
        }
        view.reduceMotion = reduceMotion
```
   - `needsFrames`：`if reduceMotion { return false }` 之后加 `if info.ripples { return true }`。
   - `tick()`：`swim.step(...)` 之后加

```swift
        if swim.dashEnded {
            swim.dashEnded = false
            let done = dashCompletion; dashCompletion = nil
            done?()
        }
```
   - `mouseDragged` 首次越过 4 点（`dragged = true` 之后）：`dashCompletion = nil; onGrabBegin?()`。

### Step 3: 编译检查（无控制器接线，只确认视图层能编译）

先把 `main.swift` 暂时保持不变会因 `JellyController.isRinging` 仍存在而继续编译；`build.mjs` 清单已在 Task 4 更新。

Run: `node desktop-reminder/build.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app`
Expected: 编译成功并 ad-hoc 签名（无 error；warning 逐条看，不留新增 warning）。

Run: `/tmp/selftest.sh`
Expected: `ALL PASS`。

---

## Task 6: 控制器状态机与 `main.swift` 路由

**Files:**
- Modify: `desktop-reminder/jelly-controller.swift`
- Modify: `desktop-reminder/main.swift`

**Interfaces:**
- Consumes: Task 5 的视图层 API。
- Produces: `JellyController.showRing(_:) -> Bool`、`hideRing(id:)`、`ringActionResult(_:)`、`ringButton(_:) -> Bool`（测试钩子与按钮共用）、`replayRing()`、读数 `ringActive/ringVisible/ringID/ringBusy/ringPhaseName/ringStatusText/ringButtonFrames()/laneString/bubbleRectString/appearanceName`；`main.swift` 的 `show/hide/actionResult/ringButton` 路由与回执字段。

### Step 1: 改造 `jelly-controller.swift`

删除：`var isRinging`、`retireToken`、`retire(animated:)`、`hideNow()`、`ringingChanged()`；`updateVisibility()` 里的 `companion.panel.alphaValue = 1`（透明度由响铃代码自己管）。

修改现有函数（只改这些行）：

```swift
    func updateVisibility() {
        let ringing = ring != nil || ringExiting
        let countdownActive = data != nil && ring == nil
        guard JellyModel.shouldShow(resident: resident, hasCountdown: data != nil, ringing: ringing, hasNudge: nudge != nil) else {
            stopTicker()
            detailTimer?.invalidate(); detailUntil = nil
            companion.hide(remember: !ringReturning)      // 回家的路上被隐藏：当前位置不是用户放下的位置，不能记
            countdownShown = false
            return
        }
        // 倒计时刚被响铃接棒：水母留下，只做一次到点的“炸开”
        if countdownShown && !countdownActive && !reduceMotion && companion.isVisible { companion.burst() }
        countdownShown = countdownActive
        if !companion.isVisible {
            let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
            companion.show()
            onFocusCheck?(frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier)
        }
        refresh()
        restartTicker()
    }
```

- `tickerNeedsSeconds`：`(data != nil && ring == nil) || nudge != nil || feedback != nil`
- `refresh()`：`remaining` 的条件改为 `(data != nil && ring == nil)`；`bubbleKind` 调用改为 `JellyModel.bubbleKind(ringing: ring != nil, ringArrived: ringPhase == .shown, hasNudge: ..., ...)`；`switch kind` 增加：

```swift
        case .ring:
            if let current = ring {
                let closing = ringClosing
                let buttons = JellyModel.ringButtons(canSnooze: current.canSnooze, minutes: current.snoozeMinutes)
                    .map { JellyBubble.Button(id: $0.id, title: $0.title, enabled: ringPending == nil && !closing, primary: $0.id == "dismiss") }
                bubble = JellyBubble(kind: .ring, lines: JellyModel.ringTitleLines(names: current.names, more: current.more),
                                     status: closing ? nil : (ringStatus?.text ?? (ringPending != nil ? "正在同步到 Chrome…" : nil)),
                                     bad: ringStatus?.bad ?? false, buttons: buttons,
                                     bigClock: current.clock.isEmpty ? nil : current.clock, confirm: closing ? ringStatus?.text : nil)
            }
```
  `companion.update(...)` 的参数改为：

```swift
        let ringing = ring != nil
        companion.update(JellyInfo(stage: ringing ? .due : stage, night: nightValue, bubble: bubble, awake: kind > .clock || ringing,
                                   rest: ringing || ringExiting || stage == .calm || nudge != nil,
                                   ripples: ringing && ringPhase == .shown, ringEpoch: ringEpoch), reduceMotion: reduceMotion)
```
- `showNudge`：第一行 `guard ring == nil, ringExiting == false else { return false }`（响铃期间与游走途中拒绝，Chrome 退回系统通知），其后不变。
- `poked()`：`guard nudge == nil, ring == nil else { return }`。
- `menuNeedsUpdate`：`if data != nil && ring == nil`。
- `countdownVisible`：`companion.isVisible && data != nil && ring == nil`；`bubbleName` 增加 `case .ring: return "ring"`；`nudgeButtonFrames()` 仅在 `lastBubble == .nudge` 时返回按钮，否则空字典。
- `init()` 里加：`companion.onGrabBegin = { [weak self] in self?.grabBegan() }`、`companion.onGrabEnd = { [weak self] in self?.grabEnded() }`。
- 文件头注释改为说明“水母承载倒计时、提醒与到点响铃”。

在 `// MARK: 菜单动作` 之前新增整节响铃代码：

```swift
    // MARK: 到点响铃（来自 Chrome 的 show / hide / actionResult；动作交回 Chrome，水母只显示）
    // 水母游到所在屏幕的底部正中，弹出玻璃气泡；点按钮发 action，收到匹配的回执才显示结果；Chrome 是闹钟、稍后提醒与会话结束的唯一所有者。

    private enum RingPhase: String { case none, arriving, shown }

    private(set) var ring: JellyModel.Ring?
    private var ringPhase = RingPhase.none
    private var ringEpoch = 0                           // 每次气泡（重新）弹出 +1：水母据此重播弹出与涟漪
    private var ringClickableAt = Date.distantFuture    // 弹出后 0.5 秒内忽略点击
    private var ringPending: (id: String, action: String)?
    private var ringStatus: (text: String, bad: Bool)?
    private var ringClosing = false                     // 回执已到，正在显示确认语（或失败说明），随后离开
    private var ringHideRequested = false               // Chrome 先结束了会话（hide），回执随后才到：多等一小会儿
    private var ringHomeX: CGFloat?                     // 响铃前水母所在的横坐标；nil 表示本来就不在，响完游走
    private var ringMoved = false                       // 响铃期间用户拖动过：以放下的位置为准
    private var ringReturning = false
    private var ringExiting = false
    private var ringToken = 0                           // 使进行中的游动 / 淡出回调失效
    private var ringTimer: Timer?                       // 确认语时长
    private var ringGraceTimer: Timer?                  // 先 hide 后回执的等待

    /// 显示一次响铃；负载不合规返回 false（Chrome 据此退回系统通知）。返回 true 表示水母已出现在桌面上。
    func showRing(_ raw: Any?) -> Bool {
        guard let next = JellyModel.parseRing(raw) else { return false }
        if let current = ring, current.id == next.id {
            // 同一会话重发（重连后 Chrome 重新 show）：只更新内容，不重播入场，也不重新计防误触
            ring = next
            refresh()
            return companion.isVisible
        }
        let frontmost = NSWorkspace.shared.frontmostApplication?.processIdentifier
        let replacing = ring != nil
        let leaving = ringReturning || ringExiting      // 上一次响铃的收尾还在途中：沿用最初的“家”
        let wasVisible = companion.isVisible
        let home: CGFloat? = wasVisible ? companion.swim.x : nil
        var fromEdge = !wasVisible
        if wasVisible && !companion.isOnMouseScreen() { companion.hide(remember: false); fromEdge = true }
        cancelRingTimers()
        ringToken += 1
        ring = next
        ringPending = nil; ringStatus = nil; ringClosing = false; ringHideRequested = false
        ringReturning = false; ringExiting = false
        if !replacing && !leaving { ringHomeX = home; ringMoved = false }
        detailTimer?.invalidate(); detailUntil = nil
        feedback = nil
        if fromEdge { companion.startAtRightEdgeOnce = true }
        updateVisibility()
        startArrival(fadeIn: fromEdge)
        onFocusCheck?(frontmost == NSWorkspace.shared.frontmostApplication?.processIdentifier)
        return companion.isVisible
    }

    private func startArrival(fadeIn: Bool) {
        ringPhase = .arriving
        ringClickableAt = .distantFuture
        ringToken += 1
        let token = ringToken
        if fadeIn { setAlpha(0, duration: 0); setAlpha(1, duration: reduceMotion ? 0.2 : 0.25) } else { setAlpha(1, duration: 0) }
        refresh()
        companion.dash(toX: companion.centerX) { [weak self] in self?.ringArrived(token) }
    }

    private func ringArrived(_ token: Int) {
        guard ring != nil, ringToken == token, ringPhase == .arriving else { return }
        ringPhase = .shown
        ringEpoch += 1
        ringClickableAt = Date().addingTimeInterval(JellyModel.ringClickGuard)
        refresh()
        announceRing()
    }

    private func announceRing() {
        guard let current = ring else { return }
        let text = (["时间到了"] + [current.clock] + JellyModel.ringTitleLines(names: current.names, more: current.more)).filter { !$0.isEmpty }.joined(separator: "，")
        NSAccessibility.post(element: companion.view, notification: .announcementRequested,
                             userInfo: [.announcement: text, .priority: NSAccessibilityPriorityLevel.high.rawValue])
    }

    /// 气泡按钮（也是隔离验收钩子的入口）：返回是否真的发出了动作。弹出后 0.5 秒内、等待回执期间、确认语期间都忽略。
    @discardableResult
    func ringButton(_ action: String?) -> Bool {
        guard let action = action, JellyModel.ringActions.contains(action), let current = ring, ringPhase == .shown,
              ringPending == nil, !ringClosing, Date() >= ringClickableAt, action == "dismiss" || current.canSnooze else { return false }
        let actionID = UUID().uuidString
        ringPending = (actionID, action)
        ringStatus = nil
        send?(["type": "action", "sessionId": current.id, "actionId": actionID, "action": action, "minutes": current.snoozeMinutes])
        refresh()
        DispatchQueue.main.asyncAfter(deadline: .now() + JellyModel.ringNoAck) { [weak self] in
            guard let self = self, self.ringPending?.id == actionID, self.ring?.id == current.id else { return }
            self.ringPending = nil
            self.ringStatus = ("Chrome 尚未确认，请重试或在浏览器中处理", true)
            self.refresh()
        }
        return true
    }

    /// Chrome 对按钮动作的回执：sessionId 与 actionId 都要对得上；成功才显示确认语，失败保留按钮以便重试。
    func ringActionResult(_ message: [String: Any]) {
        guard let current = ring, message["sessionId"] as? String == current.id,
              let pending = ringPending, message["actionId"] as? String == pending.id else { return }
        ringPending = nil
        ringGraceTimer?.invalidate(); ringGraceTimer = nil
        if message["ok"] as? Bool == true {
            ringStatus = (JellyModel.ringConfirm(action: pending.action, minutes: current.snoozeMinutes), false)
            beginRingFarewell()
        } else {
            ringStatus = (JellyModel.clean(message["error"], max: 60) ?? "操作失败，请重试", true)
            if ringHideRequested { beginRingFarewell() } else { refresh() }   // 会话已被 Chrome 结束，重试没有意义：显示原因后离开
        }
    }

    private func beginRingFarewell() {
        ringClosing = true
        ringTimer?.invalidate()
        ringTimer = Timer.scheduledTimer(withTimeInterval: JellyModel.ringFarewell, repeats: false) { [weak self] _ in self?.finishRing() }
        refresh()
    }

    /// Chrome 结束了这次会话（在别处处理了，或自己处理完动作）。Chrome 的真实顺序是先 hide、后回执：
    /// 有等待中的动作就再等回执（最多 ringHideGrace 秒）并显示确认语；没有就直接收尾，不显示确认语。
    func hideRing(id: String?) {
        guard let current = ring, id == current.id, !ringClosing else { return }
        if ringPending != nil {
            guard !ringHideRequested else { return }
            ringHideRequested = true
            ringGraceTimer?.invalidate()
            ringGraceTimer = Timer.scheduledTimer(withTimeInterval: JellyModel.ringHideGrace, repeats: false) { [weak self] _ in
                guard let self = self, self.ring?.id == current.id, !self.ringClosing else { return }
                self.ringPending = nil
                self.finishRing()
            }
            return
        }
        finishRing()
    }

    private func cancelRingTimers() {
        ringTimer?.invalidate(); ringTimer = nil
        ringGraceTimer?.invalidate(); ringGraceTimer = nil
    }

    /// 收尾：常驻或仍有倒计时 / 提醒 → 游回响铃前的位置（用户拖动过就留在放下的位置）；否则游向右边后消失。
    private func finishRing() {
        guard ring != nil else { return }
        cancelRingTimers()
        ring = nil; ringPhase = .none; ringPending = nil; ringStatus = nil; ringClosing = false; ringHideRequested = false
        ringToken += 1
        let token = ringToken
        if JellyModel.shouldShow(resident: resident, hasCountdown: data != nil, ringing: false, hasNudge: nudge != nil) {
            if !ringMoved, let home = ringHomeX {
                ringReturning = true
                refresh()
                companion.dash(toX: home) { [weak self] in self?.ringReturned(token) }
            } else {
                ringHomeX = nil
                refresh()
            }
            restartTicker()
        } else {
            ringHomeX = nil
            ringExiting = true
            refresh()
            companion.dash(toX: companion.rightEdgeX) { [weak self] in self?.fadeOutAndHide(token) }
        }
    }

    private func ringReturned(_ token: Int) {
        guard ringToken == token, ringReturning else { return }
        ringReturning = false
        ringHomeX = nil
        refresh()
    }

    private func fadeOutAndHide(_ token: Int) {
        guard ringToken == token, ringExiting else { return }
        setAlpha(0, duration: reduceMotion ? 0.2 : 0.25) { [weak self] in
            guard let self = self, self.ringToken == token, self.ringExiting else { return }
            self.ringExiting = false
            if JellyModel.shouldShow(resident: self.resident, hasCountdown: self.data != nil, ringing: false, hasNudge: self.nudge != nil) {
                self.setAlpha(1, duration: 0)       // 淡出期间别的内容需要水母了：留在原地
                self.refresh()
            } else {
                self.stopTicker()
                self.companion.hide(remember: false)   // 响铃自身不改写记住的位置
                self.setAlpha(1, duration: 0)
            }
        }
    }

    /// 状态栏“显示当前提醒”：响铃进行中把水母重新游到落点并重播弹出；没有响铃时只是刷新可见性。
    func replayRing() {
        guard ring != nil else { updateVisibility(); return }
        ringMoved = false
        startArrival(fadeIn: false)
    }

    private func grabBegan() {
        if ring != nil { ringMoved = true }
        if ringReturning || ringExiting {
            ringToken += 1
            ringReturning = false; ringExiting = false
            setAlpha(1, duration: 0)
        }
    }

    private func grabEnded() {
        if ring != nil, ringPhase == .arriving { ringArrived(ringToken) }   // 还没游到落点就被抓走：放下的位置就是落点
        updateVisibility()
    }

    /// 窗口透明度；duration 为 0 时同时打断正在进行的淡入淡出。
    private func setAlpha(_ value: CGFloat, duration: TimeInterval, completion: (() -> Void)? = nil) {
        let panel = companion.panel
        NSAnimationContext.runAnimationGroup({ context in
            context.duration = duration
            context.timingFunction = CAMediaTimingFunction(name: .easeOut)
            panel.animator().alphaValue = value
        }, completionHandler: completion)
        if duration <= 0 { panel.alphaValue = value }
    }

    // 读数（协议回执与验收脚本用）
    var ringActive: Bool { ring != nil }
    var ringVisible: Bool { ring != nil && companion.isVisible }
    var ringID: String? { ring?.id }
    var ringBusy: Bool { ringPending != nil }
    var ringPhaseName: String { ring == nil ? "none" : ringPhase.rawValue }
    var ringStatusText: String { ringStatus?.text ?? (ringPending != nil ? "正在同步到 Chrome…" : "") }
    var laneString: String { NSStringFromRect(companion.laneRect) }
    var bubbleRectString: String { companion.view.bubbleRectString() }
    var appearanceName: String { companion.view.appearanceName }
    func ringButtonFrames() -> [String: String] {
        lastBubble == .ring ? companion.view.buttonScreenFrames().mapValues { NSStringFromRect($0) } : [:]
    }
```

（`JellyCompanion` 需要补一个只读的 `var laneRect: NSRect { laneFrame }`。）

### Step 2: 重写 `main.swift`

`ReminderPanel` 类保留；`DesktopReminder` 删除 `panel/titleLabel/timeLabel/statusLabel/stopButton/snoozeButton/sessionID/actionID/snoozeMinutes`、`buildPanel/position/show/springIn/dismiss/snooze/perform`。保留 `confirmation/jelly/demo/spaceTransitions/focusStayed/statusItem`。改动如下：

```swift
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        jelly.send = { [weak self] message in
            // --demo 没有 Chrome：点任一响铃按钮就结束进程（沿用旧卡片的行为）；其余消息丢弃
            if self?.demo == true { if message["type"] as? String == "action" { NSApp.terminate(nil) }; return }
            self?.send(message)
        }
        jelly.onFocusCheck = { [weak self] stayed in self?.focusStayed = stayed }
        confirmation = ConfirmationPanelController { [weak self] message in self?.send(message) }
        // …… 工作区 Space 通知与状态栏菜单不变 ……
        if demo {
            let clock = DateFormatter(); clock.dateFormat = "HH:mm"
            _ = jelly.showRing(["sessionId": "demo", "title": "桌面提醒测试", "timeText": "这是测试，不会修改你的闹钟", "clock": clock.string(from: Date()),
                                "labels": ["桌面提醒测试"], "more": 0, "canSnooze": true, "snoozeMinutes": 10])
        } else {
            DispatchQueue.global(qos: .utility).async { self.readMessages() }
        }
    }

    @objc func showCurrent() { jelly.replayRing() }
```

`handle(_:)` 里替换 `show / hide / actionResult` 三个 case，并新增 `ringButton`：

```swift
        case "show": ok = jelly.showRing(message)
        case "hide": jelly.hideRing(id: message["sessionId"] as? String)
        case "actionResult": jelly.ringActionResult(message)
        case "ringButton":
            // 仅隔离验收：TIMEKEEPER_TEST_HOOKS=1 时才可用，直接走气泡按钮的动作入口（含弹出后 0.5 秒的防误触），
            // 让防误触窗口的测试不依赖鼠标时序；返回 ok 表示动作真的发出了。正式使用时恒为 false。
            ok = ProcessInfo.processInfo.environment["TIMEKEEPER_TEST_HOOKS"] == "1" && jelly.ringButton(message["id"] as? String)
```

`respond(_:ok:)`：删除卡片相关的 `visible/onActiveSpace` 来源，改为：

```swift
        // 响铃与桌面水母（同一个窗口）
        reply["visible"] = jelly.ringVisible
        reply["onActiveSpace"] = jelly.companion.panel.isOnActiveSpace
        reply["screenCount"] = NSScreen.screens.count
        reply["spaceTransitions"] = spaceTransitions
        reply["focusStayed"] = focusStayed
        // …… confirmation* 字段不变 ……
        // …… countdown* 与 jelly* 字段不变 ……
        reply["ringId"] = jelly.ringID ?? NSNull()
        reply["ringBusy"] = jelly.ringBusy
        reply["ringPhase"] = jelly.ringPhaseName
        reply["ringStatus"] = jelly.ringStatusText
        reply["ringButtons"] = jelly.ringButtonFrames()
        reply["ringFrame"] = jelly.frameString
        reply["ringLane"] = jelly.laneString
        reply["ringBubble"] = jelly.bubbleRectString
        reply["jellyAppearance"] = jelly.appearanceName
```

### Step 3: 构建、契约测试与既有验收

Run: `node --test test/desktop-companion-logic.test.mjs test/alarm-desktop.test.js`
Expected: 全部 PASS（构建顺序、`main.swift` 合同、自测编译运行均通过）。

Run: `node desktop-reminder/build.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app`
Expected: 编译、签名成功，无新增 warning。

Run（会弹出真实窗口并使用合成鼠标，期间不要碰鼠标）：`node desktop-reminder/jelly-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app --no-mouse`
Expected: 阶段 1c（响铃接棒，见下一任务改写）以外的阶段 PASS；阶段 1c 会因旧断言失败，留到 Task 7 改写。

---

## Task 7: 验收脚本改写与真实截图校准

**Files:**
- Modify: `desktop-reminder/jelly-smoke.mjs`（阶段 1c 改写成响铃阶段；`--only=ring`；PNG 取样）
- Modify: `desktop-reminder/bridge-smoke.mjs`（真实 `AlarmDesktop` ↔ 真实原生进程的响铃阶段）
- Modify: `desktop-reminder/smoke.mjs`、`desktop-reminder/countdown-smoke.mjs`（旧卡片的断言与提示文字）

### Step 1: 先看旧断言

Run: `rg -n "visible|show'|hide'|actionResult|卡片|stopButton|当前桌面提醒" desktop-reminder/smoke.mjs desktop-reminder/countdown-smoke.mjs desktop-reminder/interaction-smoke.mjs desktop-reminder/confirmation-smoke.mjs desktop-reminder/bridge-smoke.mjs`
记录每一处对旧卡片的依赖（`visible` 的含义改为“响铃进行中且水母窗口在屏幕上”；`countdownVisible` 在响铃时为 false 的断言保持成立）。

### Step 2: `jelly-smoke.mjs` 阶段 1c 改写为响铃阶段

把 “阶段 1c：响铃接棒” 整段替换成下面的响铃阶段（各子场景各开一个原生进程，互不影响；`ring()` 是构造 `show` 载荷的辅助函数；`until()` 是轮询辅助函数）：

```js
const ring = (extra = {}) => ({ sessionId: 'ring-1', title: '开会；喝水', timeText: '10/16 09:30', clock: '09:30', labels: ['开会', '喝水'], more: 0, canSnooze: true, snoozeMinutes: 10, ...extra });
const until = async (host, predicate, ms = 4000, label = '条件') => {
  const end = Date.now() + ms; let reply;
  while (Date.now() < end) { reply = await host.request('ping'); if (predicate(reply)) return reply; await delay(80); }
  throw new Error(`等待超时：${label}\n${JSON.stringify(reply, null, 1).slice(0, 900)}`);
};
const centerOf = f => ({ x: f.x + f.w / 2, y: f.y + f.h / 2 });
const laneRect = text => frameOf(text);

// ---------- 阶段 1c：到点响铃（水母报时） ----------
host = start();
try {
  // 协议：非法载荷被拒绝（Chrome 据此退回系统通知）且不改变状态
  for (const bad of [{ sessionId: '' }, { sessionId: 'x'.repeat(201) }, { title: undefined }, { title: 'x'.repeat(321) }, { title: 42 }]) {
    const reply = await host.request('show', ring(bad));
    assert.equal(reply.ok, false, `应拒绝：${JSON.stringify(bad).slice(0, 60)}`); assert.equal(reply.ringId, null); assert.equal(reply.jellyVisible, false);
  }
  // 没有常驻、没有倒计时：水母从右边游到底部正中，弹出气泡
  let reply = await host.request('show', ring());
  assert.equal(reply.ok, true); assert.equal(reply.version, 6); assert.equal(reply.focusStayed, true, '响铃不抢焦点');
  assert.equal(reply.ringId, 'ring-1'); assert.equal(reply.jellyVisible, true); assert.equal(reply.visible, true);
  assert.equal(reply.jellyBubble === 'none' || reply.jellyBubble === 'ring', true);
  reply = await until(host, r => r.ringPhase === 'shown', 3500, '水母游到落点');
  assert.equal(reply.jellyBubble, 'ring'); assert.deepEqual(Object.keys(reply.ringButtons).sort(), ['dismiss', 'snooze'], '两个真实按钮');
  const lane = laneRect(reply.ringLane), frame = frameOf(reply.ringFrame);
  assert.ok(Math.abs(frame.x + frame.w / 2 - (lane.x + lane.w / 2)) <= 2, `落点在所在屏幕可见区的横向正中：窗口中心 ${frame.x + frame.w / 2} 对 ${lane.x + lane.w / 2}`);
  assert.ok(frame.y < lane.y + 40, `窗口贴着屏幕底部（泳线）：${frame.y} 对 ${lane.y}`);
  assert.ok(frame.w > 170 && frame.h > 150, '窗口为气泡长大');
  assert.equal(reply.countdownMenu.some(item => item.includes('延后')), false);
  // 防误触：弹出后 0.5 秒内点击不发 action；之后一次点击恰好一个 action
  host.events.length = 0;
  reply = await host.request('ringButton', { id: 'dismiss' });
  assert.equal(reply.ok, false, '弹出 0.5 秒内忽略点击'); host.noEvent('action', '防误触窗口内不得发出 action');
  ...（后续：点击、重复提交保护、不匹配回执、失败重试、成功确认、收尾，见下）
}
```

响铃阶段的完整场景清单（每条都是一个断言组，写成上面的风格）：

| 场景 | 断言 |
|---|---|
| 防误触与动作字段 | 弹出后立刻 `ringButton dismiss` → `ok:false`、无 `action`；等 0.6 秒后再点 → `ok:true`，恰好一个 `action` 事件，字段 `sessionId=ring-1`、`action=dismiss`、`minutes=10`、`actionId` 长度 >8；`ringBusy=true`、`ringStatus` 含“正在同步”；再点 `snooze`/`dismiss` 都 `ok:false` 且无第二个 `action` |
| 回执门槛 | `actionResult` 用错误 `actionId`、错误 `sessionId` → 仍 busy；匹配 `ok:false,error:'没有记上'` → `ringBusy=false`、`ringStatus` 为该文字、`ringId` 仍在（按钮恢复）；再点 → 新的 `actionId`；匹配 `ok:true` → `ringStatus='已停止'`、`ringId` 仍在；约 1.8 秒后 `ringId=null` |
| `snooze` 文案与字段 | `snoozeMinutes:7` → 回执 ok 后 `ringStatus='好的，7 分钟后再叫你'`；`action.minutes=7`；`canSnooze:false` 时 `ringButtons` 只有 `dismiss`，`ringButton snooze` → `ok:false` |
| 先 hide 后回执（Chrome 真实顺序） | 点 dismiss → `hide` → `ringId` 仍在、`ringBusy=true`；在 1.5 秒内发匹配 `ok:true` 回执 → 显示“已停止”，约 1.8 秒后收尾；另一个进程：点 dismiss → `hide` → 不发回执 → 约 1.8 秒内 `ringId=null`（不显示确认语） |
| hide 无等待动作 | `show` → 到位 → `hide`（匹配 id）→ 立即 `ringId=null`；不匹配 id、`sessionId` 缺失（`null`）→ 忽略、`ringId` 仍在 |
| 8 秒无回执 | 点 dismiss → 8.6 秒后 `ringBusy=false`、`ringStatus` 含“尚未确认”，再点能发出新的 `action` |
| 同会话重发与替换 | 同 `sessionId` 再 `show`（换 `labels`）→ `ringPhase` 仍为 `shown`，不重新入场；不同 `sessionId` → `ringId` 变化，旧 id 的 `hide`/`actionResult` 被忽略 |
| 响铃期间拒绝喝水气泡 | `nudge` → `ok:false`、`nudgeId=null`；响铃结束后同一个 `nudge` → `ok:true` |
| 常驻返回原位 | `jelly resident:true`，记录 `ping` 的窗口 x；`show` → 到位 → 点 dismiss + 回执 → 收尾后（轮询 ≤4 秒）窗口 x 回到响铃前的位置（±3 点），`jellyVisible=true`、`ringId=null`、窗口回到基础尺寸 `170×150` |
| 没常驻无倒计时离开且不改写 `CompanionX` | 先让水母常驻再取消常驻以写入一个已知的 `CompanionX`（`defaults read com.timekeeper.desktop.qa CompanionX`）；响铃全程结束后 `jellyVisible=false`（轮询 ≤4 秒），`CompanionX` 与之前一致 |
| 倒计时水母接棒 | 有倒计时（非常驻）→ `show` → 倒计时气泡被响铃取代（`countdownVisible=false`），结束后水母回到原位并恢复读数气泡 |
| 减少动态效果 | `TIMEKEEPER_REDUCE_MOTION=1`：`show` 后 ≤0.8 秒 `ringPhase='shown'`，窗口居中，`countdownReduceMotion=true`，整个响铃过程窗口 y 不变 |
| 菜单 | 响铃期间右键菜单没有倒计时项（`countdownMenu` 不含“延后”“跳过”） |
| 外观与截图 | `TIMEKEEPER_APPEARANCE=light` / `dark`：`jellyAppearance` 对应；响铃到位 0.8 秒后各截一张自家窗口图（`ring-light`、`ring-dark`），解码 PNG 在 `ringBubble` 矩形内的上沿内侧取样（避开文字）：浅色亮度 >0.8、深色 <0.25；`checkBorder` 外圈 8 像素 alpha ≤1（响铃气泡、涟漪、水母夜晚光晕都要查，`TIMEKEEPER_NIGHT_HOUR=23` 再查一次）；另截喝水气泡 / 倒计时读数 / 详情在深色下的图（`nudge-dark`、`clock-dark`、`detail-dark`）供目视与外圈检查 |
| 真实鼠标（不带 `--no-mouse`） | 响铃到位 0.6 秒后对 `ringButtons.dismiss` 的中心做真实点击 → 一个 `action`；点气泡空白处不发任何业务动作 |
| 拖动 | 响铃到位后真实拖动水母到别处放手 → 响铃结束后不再回到原位（以放下的位置为准） |

PNG 取样辅助函数（并入现有的最小 PNG 解码，导出像素）：把 `pngAlphaBorder` 里的解码部分抽成 `decodePng(file)` 返回 `{ width, height, stride, pixels }`，`pngAlphaBorder` 与新增的 `pngLuminanceAt(file, frame, rect)` 共用；取样点 = 气泡矩形上沿内侧 8 点、水平居中（视图坐标自下而上，像素行自上而下，缩放 = PNG 宽 / 窗口宽），亮度按 sRGB 相对亮度近似 `0.2126r+0.7152g+0.0722b`（0…1）。

另加命令行选项 `--only=ring`：只运行响铃阶段（调试用，省去其余阶段的等待）。

### Step 3: 其余脚本

- `bridge-smoke.mjs`：新增响铃阶段——用真实 `AlarmDesktop`（Chrome 侧模块）`show(session)`，原生回执 `clock/labels` 生效（`ringPhase` 轮询到 `shown`）；原生发出 `action`，Chrome 侧 `onAction` 回调里先 `hide(sessionId)`、再用 `desktopAlarm` 的回执通道发 `actionResult`（复现真实顺序），原生显示确认语并在约 1.8 秒后收尾；保持期内（5 秒）连接不断开，之后才释放。
- `smoke.mjs`：提示文字改为“水母来报时”；“点击后气泡收起”的轮询改为等 `ringId=null`。
- `countdown-smoke.mjs`：响铃断言按新语义改（`visible` = 响铃且水母在屏幕上；`hide` 之后倒计时恢复显示）。

### Step 4: 运行并目视校准

Run（顺序；每个都会弹窗并用合成鼠标）：
```sh
node desktop-reminder/build.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app
node desktop-reminder/jelly-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app --shots=/tmp/tk/shots
node desktop-reminder/bridge-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app
node desktop-reminder/countdown-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app
node desktop-reminder/interaction-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app
node desktop-reminder/confirmation-smoke.mjs --extension-id=abcdefghijklmnopabcdefghijklmnop --app=/tmp/tk/QA.app
```
Expected: 全部 PASS。随后**目视检查** `/tmp/tk/shots` 里的 `ring-light.png`、`ring-dark.png`、`nudge-dark.png`、`clock-dark.png`、`detail-dark.png`：时间是否最大且居中、标题层次是否清楚、按钮是否通栏且比例合适、深色底是否通透而不脏、涟漪是否看得见又不抢戏、水母与气泡尾巴是否对得上；按观感只调 `JellyRingLayout`/`JellyBubblePalette`/`JellyRingMotion` 的数值（调色板的对比度自测必须仍然通过，`/tmp/selftest.sh`），每次调整后重跑相关脚本，并把最终取值与理由记入设计文档。截图只用 `screencapture -l` 自家窗口。

另测一次响铃期间的占用：`jelly-smoke --only=ring` 运行时用 `ps -o %cpu= -p <原生进程 pid>` 采样 5 次，记录平均值（只作为“未经优化的实测占用”写进文档，不当作性能保证）。

---

## Task 8: 变异检查

目的：证明新增断言真的守得住逻辑，不是“怎么写都过”。变异脚本与副本只放 `/tmp`，不入库。方法与项目已有的做法相同：复制被测文件到 `/tmp`，用 `sed`/脚本做一处最小改动，运行对应测试，**必须失败**；存活者逐个说明是否等价。

- [ ] **Chrome 侧（`js/alarm-desktop.js` × `test/alarm-desktop.test.js`）**：不发 `clock`；`labels` 上限 3→4；`names.slice(0,3)` 去掉；`more` 上限 99→100；`more` 公式 `length - 3` → `length - 2`；`holdUntil` 不设；`releaseWhenIdle` 里的 `Math.max` 改成只用 `delayMs`；`hide` 里 `ringing` 恒为 false；`clockText` 用 `hour12`；空白名字不过滤。
- [ ] **Swift 纯逻辑（`jelly-model.swift` / `jelly-swim.swift` / `jelly-palette.swift` × `companion-selftest.swift`）**：`canSnooze == true` → `!= false`；`ringClickGuard` 0.5→0.1；`ringHideGrace`/`ringFarewell`/`ringNoAck` 各改一个数；`parseRing` 去掉 `sessionId` 长度限制/`title` 长度限制；`names` 上限 3→4；`more` 夹值 99→100；`validClock` 放宽小时 ≤24；`firstClock` 去掉“前后不能紧挨数字”；`ringTitleLines` 阈值 3→4、`等共` 用 `names.count` 而非总数；`bubbleKind` 响铃优先级放到 nudge 之后；`shouldShow` 不含 `ringing`；`JellyDash.duration` 上限 1.4→2；`ease` 中点公式错一个符号；`arc` 上限 18→40；`startDash` 距离阈值 1→10；结束时不置 `landed`；`hold` 不取消冲刺；`startDash` 在被抓着时仍生效；调色板：浅色 `body` 颜色变浅一档（对比度应跌破 4.5）、深色 `error` 变暗；`JellyRingMotion.popScale` 不再过冲；`ripples` 间隔 0.73→0；减少动态效果也按时间变化。
- [ ] **AppKit 控制器层（`jelly-controller.swift` × `jelly-smoke.mjs` 响铃阶段，每个变异体重新构建到 `/tmp/tk/Mut.app`）**：去掉点击保护检查；`actionId` 不匹配也接受；`sessionId` 不匹配也接受；成功回执前就显示确认语；`hideRing` 在有等待动作时立即收尾（不等回执）；宽限超时不收尾；`finishRing` 不判断 `ringMoved`；退场时 `hide(remember: true)`（会改写 `CompanionX`）；同会话重发也重播入场；`showNudge` 响铃期间不拒绝；`hideRing` 不校验 id（`null` 也能结束）；`ringArrived` 不校验 `token`；`grabEnded` 不处理抵达前被抓；无回执 8 秒不恢复按钮。
- [ ] 存活者逐个记录：属于“两层冗余保护各拿掉一层”还是真的缺断言（真缺断言就补测试并重跑）。变异脚本在 `/tmp`，文档里写数量与存活者说明。

---

## Task 9: 文档、全量验证与收尾

**Files:** `docs/technical/jelly-ring-alarm-20261016.md`、`docs/technical/_index.md`、`docs/technical/jellyfish-resident-companion-20261016.md`、`docs/technical/alarm-countdown-companion-20261015.md`、`desktop-reminder/README.md`、`AGENTS.md`

- [ ] **设计文档**：front matter `status` 改为“已实现（隔离原生进程验收通过；真实 Chrome 与真实闹钟到点未验收）”；正文加“实现与验证”一节：各层验证结果（命令与通过数量，不虚报）、变异检查数量与存活者、截图校准后的最终取值（尺寸/配色/动效）、与设计的差异（本计划“与设计文档的差异”七条，按实际结果修订）、遗留边界（未验收清单）。
- [ ] **索引与关联文档**：`_index.md` 该行改为“已实现”；`jellyfish-resident-companion-20261016.md` 的“正在响铃”一行、`alarm-countdown-companion-20261015.md` 的卡片描述各加一句指向本文的取代说明；`README.md` 的简介、“展示和操作边界”与冒烟说明改成响铃气泡；`AGENTS.md` 的“提醒”与“桌面水母”两条更新：响铃气泡取代 `ReminderPanel` 卡片、Chrome 先 `hide` 后回执与 `holdUntil`、`ringButton` 钩子、`TIMEKEEPER_APPEARANCE`、新增回执字段、所有水母气泡随系统深浅色、新增两个源文件须同步构建清单与合同测试、响铃气泡的 `edge = 28`。
- [ ] **静态检查**：`node --check js/alarm-desktop.js`、对改动的 `.mjs` 逐个 `node --check`、`git diff --check`。
- [ ] **全量测试**：`node --test test/*.test.js test/*.test.mjs`（记录总数与失败数；失败先判断是否本改动引起，无关的既有失败只报告不修）。
- [ ] **安装与用户验收入口说明（不替用户操作真实组件）**：用户需运行 `node desktop-reminder/build.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --install` 并重载扩展，然后在闹钟中心点“测试桌面提醒”（`user_alarm_desktop_test`）。我**不**安装到真实位置，除非用户要求。
- [ ] **收尾清理**：停止可视化辅助服务（`scripts/stop-server.sh /tmp/ring-card-design/.superpowers/brainstorm/54056-1792123269`）；`git status` 核对只改了计划列出的文件、没有误碰无关改动；不提交。
- [ ] **最终报告**：分层列出静态 / Swift 纯逻辑 / Chrome 业务替身 / 隔离原生进程（含截图与占用）/ 变异检查 / 真实 Chrome / 真实账号，各自的结果与未验收项；一行安全自查。

---

## Self-Review（写完计划后的自查）

1. **覆盖设计文档**：行为 1–12 条 → Task 6（出发、落点、到位、操作、收尾、拖动、重发与替换、优先级、减少动态效果、多显示器、状态栏与 `--demo`、无障碍）；外观规格 → Task 4（配色）、Task 5（版式与绘制）、Task 3（弹出与涟漪曲线）；协议 → Task 1 与 Task 2；深浅色（所有气泡）→ Task 5 第 4 点；验证计划 1–6 → Task 7–9；用户已批准的取舍与差异 → 计划开头的差异表。
2. **占位符检查**：逻辑代码与测试均给出完整内容；AppKit 绘制按“常量 + 顺序 + 截图校准”规定（数值明确标为初始取值，并由 Task 7 的目视检查与对比度自测约束），没有留“TODO/稍后补”。
3. **类型一致性**：`JellyModel.Ring` 字段名在 Task 2、Task 6 一致；`JellyBubble.confirm/bigClock`、`JellyPose.ringAge`、`JellyInfo.ripples/ringEpoch` 在 Task 5、6 一致；`ringButton(_:) -> Bool` 与 `main.swift` 的 `ringButton` 钩子一致；`hide(remember:)` 在控制器三处调用一致；`JellyRingMotion` 的函数签名在 Task 3 与 Task 5 一致。
4. **已知取舍**：响铃气泡固定占一行“状态行”的位置（避免点按钮后版面跳动），所以比设计文档写的“约 150”略高；成功后按钮行变成确认语而不是消失（气泡尺寸不变）。这两点会写进设计文档的“与设计的差异”。
5. **执行风险**：Task 7 的真实窗口脚本依赖屏幕录制/辅助功能权限；无权限时截图相关断言跳过并如实报告，不当作通过。

