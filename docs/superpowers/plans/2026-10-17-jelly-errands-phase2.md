# 水母差事 第二期 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 逐任务执行（本项目禁止使用子代理，不用 subagent-driven-development）。步骤用 `- [ ]` 跟踪。

**Goal:** 在第一期之上加两样：①推荐歌曲（提议 → 用户点“播放”才放，带失败边界）；②水母右键菜单“水母，给我…”（今日概览 / 来首歌 / 来点乐子 / 记工时，用户主动叫，不占打扰预算）。

**Architecture:** 仍是“Chrome 唯一调度与执行，原生只显示与转发”。歌曲气泡复用第一期的 nudge 气泡管线，只把 `song` 加进类别白名单（按钮 3 个）；歌曲来源是一个只读小模块（注入后台已有的 `neteaseApiCall` 与 `normalizeSilentMusicSong`），播放复用后台已有的 `playAssistantMusic`（取地址 → 交给 Offscreen → 等播放器真实确认 → 保存队列）。右键菜单经新事件 `errandRequest` 回到 Chrome，由控制器的 `request(kind)` 现做一条候选，复用同一个 presenter 发气泡；结果文字经新命令 `errandRequestResult` 回到原生的反馈气泡。

**Tech Stack:** 原生 JS（UMD 模块，CommonJS 测试入口）、Swift/AppKit（`desktop-reminder/`）、`node --test`。

**工作位置:** worktree `~/worktrees/ctb-jelly-errands`，分支 `feat/jelly-errands`（基于 `a327fd0`，第一期改动仍未提交）。**不提交 Git**；不碰另外两个 worktree（`ctb-aquarium`、`ctb-jelly-appearance`）和主仓库。

## 对设计稿的修订（先读 `docs/superpowers/specs/2026-10-17-jelly-errands-design.md` 的第 4、6、7 节）

1. **协议 v9**（v8 已被第一期占用）。v9 只在 v8 之上增量：`song` 类别（按钮 3 个）、`jelly` 命令可选字段 `errands`、事件 `errandRequest`、命令 `errandRequestResult`。旧组件对 `song` 气泡返回 `ok:false`（类别未知），Chrome 静默跳过；旧组件忽略 `errands` 字段，所以没有菜单。Chrome 侧按组件版本放行：差事 ≥ 8，歌曲与菜单请求 ≥ 9。
2. **“播放”走 `playAssistantMusic`，不是设计稿写的 `offscreen_play` + 队列版本校验。** 读代码后确认：`offscreen_play` 是音乐页的入口，需要页面；`playAssistantMusic`（`js/background.js`，助手单曲播放同款）在后台完成“检查可播放 → 交给 Offscreen → 轮询播放器直到 `isPlaying && songId` 一致（10 秒）→ 保存队列”，并受 `assistantMusicRevision`（用户手动操作播放器就中止）保护。它**追加**而不替换已保存队列（歌曲不在队列里就加到末尾，≤300）。
3. **回执文案修订**：设计稿写“只写已交给播放器，不写已播放”。`playAssistantMusic` 只有在播放器真实确认起播后才返回成功，所以确认后写“已开始播放《…》”是准确的；**已发给播放器但没确认**写“已交给播放器，还没确认开始播放，请在播放器里看看”，且**不重放**。
4. **失败分两类，靠 `ctx.trace` 钩子判断**：`playAssistantMusic` 在真正发给 Offscreen 之前会调用 `ctx.trace('music.playback.dispatch', …)`。适配器在这个钩子里记 `dispatched = true`：没到这一步的失败是“明确没放”（可以换一首，或再点一次重试），到了这一步之后的失败一律按“未知”处理（不重放、不声称成功）。超时时置 `signal.cancelled`，适配器的 `ctx.guard()` 据此抛错，让迟到的流程在下一个检查点停下。
5. **不预检歌曲是否可播放**（设计稿没要求，且要多 1–3 次联网）：不可播放的歌在点“播放”时得到明确失败，并提示“换一首”。
6. **手动请求（右键菜单）的语义**：忽略活动时段、最小间隔、每小时条数、当天静默与“分项开关”（用户明确要的），但**仍要求**总开关开着、水母已连接且组件 ≥ 9、没有响铃。手动出的气泡**不占预算**，也**不计拒绝**（点“不听/稍后再说”或自行消失都不累计连续拒绝）；概览与日志不写 `briefDone`，歌曲与小乐子只记内容指纹（`recordSeen`）。
7. **“来首歌”忽略“正在播放”检查**（用户明确要）；定时提议仍然在播放中或读不出播放状态时不提议。

## Global Constraints

- 放歌**只能**由用户点“播放”触发；定时评估永远只发气泡。点“播放”之外没有任何会出声或改播放队列的路径。
- 不新增权限、网络目标、依赖：联网只走后台已有的 `neteaseApiCall`（`music.163.com`，音乐功能本来就在用），且只在“推荐歌曲”开着、水母可开口、没有更高优先级的候选时才取；候选列表在内存里缓存 30 分钟，失败后 10 分钟内不再试。不调用模型。
- `song` 的紧急度与小乐子同为 1（低于概览 2），同级由 `pick` 按“最久没展示”轮换，歌曲与小乐子交替出现，不会因为歌曲候选多（最多 30 首）把小乐子饿死；没有“严格更高”的候选才为歌曲联网取数。`song` 不属于有系统通知兜底的类别（不进 `FALLBACK_KINDS`，`offer('song')` 返回 `{handled:false, reason:'kind'}`）。
- 歌名与歌手当作不可信输入：`Core.clean`（去控制字符与方向控制符）、歌名 ≤24 字、歌手 ≤16 字（超出加“…”），气泡文字不写日志（日志只写固定类别 `system/jelly-errands`，上下文只有类别名）。
- 文字限制沿用第一期：标题 ≤24、正文 ≤120、按钮 ≤12；回执文字 ≤80（`AlarmDesktop` 截断）。
- 按钮白名单每类一份（JS `JellyErrandsCore.KINDS`、Swift `JellyModel.nudgeButtonRules`），`test/desktop-companion-logic.test.mjs` 逐项对照；`song` 是唯一允许 3 个按钮的类别。
- 菜单项白名单 `brief/song/tidbit/worklog`：JS `JellyErrandsCore.REQUEST_KINDS` 与 Swift `JellyModel.errandRequestItems` 对照；`task` 不在菜单里。
- 右键菜单只在 `jelly` 命令带 `errands:{enabled:true}` 时出现（Chrome 仅在“常驻且差事总开关开”时带）；`jelly` 命令不带它就是关闭，旧行为不变。
- 新增 `js/*.js` 须加入 `js/background.js` 的 `importScripts`；`userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的片段不得引用片段外全局（新接线放在第一期差事接线块里，不在该片段内）。
- 不新增 Swift 源文件（只改现有文件），所以 `build.mjs` 清单不变。
- 验收脚本礼让用户（`user-quiet.mjs`），不做整屏截图，只 `screencapture -l` 自家窗口；变异检查只改 `/tmp` 副本并逐个 `cmp` 核对仓库文件未变。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `js/jelly-errands-core.js` | 改 | `KINDS.song`、`since`、`REQUEST_KINDS`、`normalize` 的 `kinds.song`、`copy.song/worklogNow`、`loggedToday` |
| `js/jelly-errand-songs.js` | 新建 | 只读歌曲来源：已登录每日推荐 → 热歌榜 → 空；全部由注入的 `api/loggedIn/normalize` 完成 |
| `js/jelly-errands.js` | 改 | 歌曲候选与缓存、`play/another` 动作、`request(kind)`、`onChange`、`isAvailable(minVersion)` |
| `js/alarm-desktop.js` | 改 | 差事动作白名单加 `play/another`；`errandRequest` 事件与 `errandRequestResult` 回执 |
| `js/jelly-desktop.js` | 改 | `errandsReady(minVersion)`；`push` 带 `errands:{enabled:true}`；`errandsEnabled` 外部回调 |
| `js/background.js` | 改 | 载入新模块、歌曲来源/播放适配器、`isMusicPlaying`、请求接线、`onChange` |
| `js/settings-page.js` `settings.html` | 改 | “推荐歌曲”开关与文案、版本提示（歌曲与菜单需要 v9）、脚本版本钉 |
| `desktop-reminder/jelly-model.swift` | 改 | `song` 类别/按钮/主按钮、每类按钮上限、`errandRequestItems`、`State.errands` |
| `desktop-reminder/jelly-controller.swift` | 改 | 右键子菜单、`errandRequest` 发送与超时、`errandRequestResult` 显示 |
| `desktop-reminder/main.swift` | 改 | 回执版本 9、`errandRequestResult` 命令 |
| `desktop-reminder/companion-selftest.swift` | 改 | 新纯逻辑自测（独立写出的期望表） |
| `desktop-reminder/jelly-smoke.mjs` `bridge-smoke.mjs` | 改 | 3 按钮歌曲气泡、菜单请求、联调；版本断言 8→9 |
| `test/jelly-errands-core.test.js` `test/jelly-errand-songs.test.js`（新）`test/jelly-errands.test.js` `test/alarm-desktop.test.js` `test/jelly-desktop.test.js` `test/jelly-errands-integration.test.js` `test/desktop-companion-logic.test.mjs` | 改/新建 | 各层测试 |

---

## Task 1: 纯逻辑核心补充

**Files:** Modify `js/jelly-errands-core.js`、`test/jelly-errands-core.test.js`。

**Interfaces — Produces:**

```js
JellyErrandsCore.KINDS.song = { since: 9, urgency: 1, buttons: [{id:'play',title:'播放'},{id:'another',title:'换一首'},{id:'dismiss',title:'不听'}] }
// 其余类别补 since: 8
JellyErrandsCore.MIN_VERSION = 8; REQUEST_SINCE = 9; REQUEST_KINDS = ['brief','song','tidbit','worklog']
JellyErrandsCore.SWITCHABLE = ['task','worklog','song','tidbit']
normalize(raw).kinds = { task, worklog, song, tidbit }        // 分项只有明确 false 才关；缺省 song 为 true
copy.song(song) -> { title:'来首歌？', text:'《歌名》 · 歌手' } | null   // 无歌名/非对象返回 null
copy.worklogNow(loggedMinutes) -> { title:'工作日志', text }          // 手动“记工时”：不看检查点，说今天记了多少
loggedToday(entries, todayStr) -> minutes                              // worklogGap 复用它
```

- [ ] **Step 1: 写失败测试**：`KINDS.song` 的按钮 id/标题/主按钮、`since`（song 9，其余 8）、紧急度与 tidbit 相同且低于 brief；`REQUEST_KINDS`/`REQUEST_SINCE`/`MIN_VERSION`；`normalize` 的 `kinds.song`（缺省 true、只有 `false` 关、非布尔按开）；`copy.song`（有无歌手、控制字符与方向控制符、超长歌名与歌手截断加“…”、无歌名返回 null、非对象返回 null）；`copy.worklogNow(0/90)`；`loggedToday` 只累加今天且有限正数的 `duration`；`pick`：歌曲排在概览/日志/任务之后，与小乐子同级时按“最久没展示”轮换（都没展示过保持候选顺序），`muted.song` 与 `seen` 里的指纹被剔除；`sanitizeState` 保留 `strikes.song`/`muted.song`；`recordOutcome` 对 `song` 生效。
- [ ] **Step 2: 运行确认失败**：`node --test --test-force-exit test/jelly-errands-core.test.js`。
- [ ] **Step 3: 写最小实现**。
- [ ] **Step 4: 运行确认通过**；`node --check js/jelly-errands-core.js`。

## Task 2: 歌曲来源模块

**Files:** Create `js/jelly-errand-songs.js`、`test/jelly-errand-songs.test.js`。

**Interfaces — Produces:**

```js
JellyErrandSongs.create({ api, loggedIn, normalize }) -> { suggest() -> Promise<Song[]> }   // 永不抛出，失败返回 []
// api(endpoint, params) -> JSON（后台传 neteaseApiCall）；loggedIn() -> boolean；normalize(raw, index) -> song（后台传 normalizeSilentMusicSong）
// Song = normalize 的结果，且 songId 为纯数字字符串（≤20 位）、title 非空；去重，最多 30 首
JellyErrandSongs.DAILY = '/api/v3/discovery/recommend/songs'
JellyErrandSongs.CHART = { endpoint: '/api/playlist/detail', params: { id: 3778678, n: 30 } }   // 热歌榜，与音乐页发现页同一来源
```

- [ ] **Step 1: 写失败测试**：已登录用每日推荐（`data.data.dailySongs` 与 `data.dailySongs` 两种形状）；未登录直接用热歌榜（`playlist.tracks` 与 `result.playlist.tracks` 两种形状）且不调用每日推荐；每日推荐抛错或为空时退回热歌榜；都失败返回 `[]`；`loggedIn` 抛错按未登录；缺 `api`/`normalize` 返回 `[]`；`songId` 变字符串、非数字或空歌名丢弃、重复丢弃、最多 30 首；`normalize` 抛错的条目跳过；源码里没有 `fetch(`、`chrome.`、`innerHTML`、`eval`、`document`。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 写最小实现**（UMD 外壳同 `jelly-errands-core.js`）。
- [ ] **Step 4: 运行确认通过**；`node --check`。

## Task 3: 控制器——歌曲提议、动作与手动请求

**Files:** Modify `js/jelly-errands.js`、`test/jelly-errands.test.js`。

**Interfaces — Consumes:** Task 1 的 `Core.*`；Task 2 的 `songs.suggest()`；注入 `isPlaying() -> true|false|null`、`playSong(song, signal) -> { ok:true } | { ok:false, dispatched:boolean, code?, message? }`、`isAvailable(minVersion) -> boolean`、`onChange()`。

**Produces:**

```js
JellyErrands.create({ …第一期的全部, songs, isPlaying, playSong, onChange, songFetchMs = 6000, playingCheckMs = 3000, playMs = 12000 })   // 三个时限可注入，测试用小值
  .request(kind) -> Promise<{ ok:true } | { ok:true, text } | { ok:false, error }>   // 手动请求，永不抛出
  .act(id, 'play' | 'another' | 'dismiss')                                          // song 气泡的动作
  .set(raw) -> 保存并对齐闹钟后调用 onChange()（失败不影响设置）
JellyErrands.parseId 认得 song；offer('song') -> { handled:false, reason:'kind' }
```

- 歌曲候选：`config.kinds.song` 开、有 `songs`、`isAvailable(9)` 为真、`isPlaying()` 严格为 `false`（3 秒内；读不出/抛错/超时按不提议）、没有严格更高优先级的候选（概览/日志/任务在就不取歌，免得白联网；小乐子与歌曲同级，不阻止取歌）、候选没出现在 `state.seen`。候选列表里歌曲排在小乐子之前（第一天两者都没展示过时先听歌）。候选缓存 30 分钟，失败（空/抛错/超时 6 秒）后 10 分钟内不再取。随机挑一首，指纹 `song:<songId>`。
- `play`：不占串行队列（联网与等待播放器最多 12 秒；原生只等 8 秒回执，更慢的结果在用户再点一次时给出）。按气泡 id 记 `{song, status}`（≤20 条）：`idle → playing → done | unknown | failed`；同一气泡**只有 `idle` 才会真的调用 `playSong`**：`playing` 返回 `{ok:false, error:'正在交给播放器，请稍候'}`，`done/unknown` 返回上次的结果文字，`failed`（明确不可播放）返回同样的失败文字。`playSong` 返回 `ok:true` → 文字“已开始播放《歌名》”，记一次接受（清零连续拒绝）；`dispatched:true` → `ok:true` + “已交给播放器，还没确认开始播放，请在播放器里看看”；超时、抛错或结果说不清（不是对象、缺 `dispatched` 标记）→ `ok:true` + “播放器没有及时回应，请在播放器里看看有没有开始播放”（不知道发出去没有，不说“已交给”）；两者状态都是 `unknown`，不重放，超时/抛错置 `signal.cancelled`；`dispatched:false` 且 `code==='unavailable'` → `ok:false` “这首歌暂不可播放，点“换一首”试试”，状态 `failed`；其余 `dispatched:false` → `ok:false` + 适配器给的中文提示（没有就写“没能开始播放，请稍后再试”），状态回 `idle`（可再点）。无 `playSong` → `ok:false` “播放功能不可用”。
- `another`：当作手动评估（`evaluate({manual:true, only:'song'})`，不占预算、不记拒绝），成功 `{ok:true,text:'换一首～'}`，没有候选 `{ok:false,error:'今天的推荐都看完啦'}`。
- `dismiss`：第一期的通用路径（记一次拒绝，连续 2 次当天静默歌曲）。
- `request(kind)`：串行；同一时刻只处理一个（忙时 `{ok:false,error:'上一个请求还在处理'}`）。白名单外、总开关关、组件不够新（`isAvailable(9)`）、响铃中 → `ok:false`。读取失败 → `ok:false`。没有内容 → `{ok:true,text}`（不发气泡）。发气泡被拒 → `ok:false`。成功 → `{ok:true}`，气泡 id 记入“手动”集合（≤50）。`brief`：没有任务 `text:'今天没有到期或已过期的任务'`；`worklog`：`readWorklog` 抛错 → `error:'工作日志提醒没开启，或暂时读不到'`；`tidbit`：用完 `text:'今天的小乐子都说完啦'`；`song`：没有候选 `text:'这会儿没找到可推荐的歌，稍后再试'`。

- [ ] **Step 1: 写失败测试**（沿用该文件的 `env()` 替身：加 `songs/isPlaying/playSong/onChange` 透传）：
  - 提议：开启且不在播放 → 发 `jelly-errand-song-<n>` 气泡，按钮 `play/another/dismiss`，文字 `《歌名》 · 歌手`，状态记 `shown` 与 `seen` 的 `song:<id>`；不提议的情形逐条：正在播放 / `isPlaying` 返回 `null`、抛错、超时 / `kinds.song:false` / 无 `songs` / `isAvailable` 对 9 返回 false（而对 8 仍可发其他类别）/ 候选都在 `seen` / 来源返回空；有过期任务时先发任务且 `suggest` 一次都没调用；30 分钟内连续评估 `suggest` 只调一次、失败后 10 分钟内不重试；`isAvailable` 对 song 收到 9、对其他收到 8。
  - `play`：成功路径（一次 `playSong`、文字、清零拒绝）；重复点（新 `actionId`）不再调用；第一次未完成时第二次返回“正在交给播放器”；`unavailable` 失败后再点不再调用；其余 `dispatched:false` 失败后可再点并再次调用；`dispatched:true` 与超时按未知处理（不重放，超时 `signal.cancelled === true`）；无 `playSong`；未知气泡 id；`play` 后气泡自行消失不记拒绝。
  - `another`：发新气泡、不占 `lastAt`/`shown`、旧指纹仍在 `seen`；全看完 → `ok:false`。
  - `dismiss` 连续两次 → `muted.song`，之后不再提议。
  - `offer('song')` 返回 `{handled:false, reason:'kind'}`。
  - `request`：四类各自的成功/没有内容/失败；不占预算（`lastAt`、`shown` 不变）；忽略时段、间隔、预算、静默、分项开关；手动气泡的 `dismiss/later` 与自行消失不累计拒绝；`isBusy`、版本不够、总开关关、白名单外、presenter 拒绝、并发第二个请求；`brief` 不写 `briefDone`；`song` 与 `tidbit` 写 `seen`。
  - `set` 调用 `onChange` 一次；`onChange` 抛错不影响返回。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 写最小实现**（`bounded()`、`serial()` 沿用；`candidates()` 加 `only` 参数避免为别的类别取歌）。
- [ ] **Step 4: 运行确认通过**；`node --check`。

## Task 4: 桥接层——AlarmDesktop 与 JellyDesktop

**Files:** Modify `js/alarm-desktop.js`、`js/jelly-desktop.js`、`test/alarm-desktop.test.js`、`test/jelly-desktop.test.js`。

**Interfaces — Produces:**

```js
AlarmDesktop: 差事动作白名单 ['open','later','dismiss','more','play','another']
AlarmDesktop.onErrandRequest = async kind => ({ ok, text?|error? })          // 由后台赋值
// 原生 → Chrome：{ type:'errandRequest', errandId, kind }（编号叫 errandId：requestId 是命令回执的关联键，不能占用）
// Chrome → 原生：{ command:'errandRequestResult', errandId, ok, text?|error? }（text ≤80、error ≤120；不带 requestId，原生才不会回一个标错编号的回执）
JellyDesktop: errandsReady(minVersion = 8) -> boolean（常驻、端口在、最近一次下发成功、版本 ≥ minVersion）
JellyDesktop.errandsEnabled = null | (() => Promise<boolean>)                  // 后台在差事控制器创建之后赋值
// jelly 命令：常驻且 errandsEnabled() 为 true 才带 errands:{enabled:true}；读取失败按没有
```

- [ ] **Step 1: 写失败测试**：`play/another` 被路由到 `onErrandRequest` 之外的 `onErrandAction`（与第一期同一路径）；`errandRequest`：校验端口与 `errandId`（非字符串/空/超 100 字符忽略）、`kind` 非字符串或超长回失败、成功回 `{ok:true,text}`、失败回 `{ok:false,error}`、无处理器回失败、处理器抛错回失败、同一 `errandId` 处理中重复到达忽略、旧连接的迟到事件忽略；`errandsReady(9)`/`errandsReady()` 在 v8 与 v9 组件上的取值；`push` 在常驻且 `errandsEnabled()` 为 true 时带 `errands:{enabled:true}`，不常驻/返回 false/抛错/未赋值时不带。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 写最小实现**。
- [ ] **Step 4: 运行确认通过**；`node --check`。

## Task 5: 原生端——`song` 气泡与右键子菜单（Swift 纯逻辑先行）

**Files:** Modify `desktop-reminder/jelly-model.swift`、`jelly-controller.swift`、`main.swift`、`companion-selftest.swift`、`test/desktop-companion-logic.test.mjs`。

**Interfaces — Produces:**

```swift
JellyModel.errandKinds += "song"; nudgeButtonRules["song"] = ["play","another","dismiss"]; primaryNudgeButton["song"] = "play"
JellyModel.maxNudgeButtons(kind) -> Int          // song 3，其余 2；parseNudge 用它限制按钮数
JellyModel.errandRequestItems: [(kind: String, title: String)] = [("brief","今日概览"),("song","来首歌"),("tidbit","来点乐子"),("worklog","记工时")]
JellyModel.State.errands: Bool                   // jelly 命令里 errands.enabled == true 才为真
// 控制器：右键菜单在 errandsMenu && 没有响铃时多一个“水母，给我…”子菜单；点选发 {type:'errandRequest', errandId:<UUID>, kind}
// 同一时刻只有一个请求在等回执；15 秒无回执 → 反馈气泡“Chrome 没有回应，请重试”（bad）；
// errandRequestResult：errandId 对得上才处理；ok 且有 text → 反馈气泡（4 秒，非 bad）；ok 无 text → 什么都不显示（气泡由 nudge 命令呈现）；!ok → 反馈气泡显示 error（5 秒，bad）
```

- [ ] **Step 1: 写失败测试**：在 `companion-selftest.swift` 里用**独立写出**的字面量期望（不从被测表推导）核对：`song` 的按钮/主按钮/类别、其余类别仍最多 2 个按钮、`song` 3 个按钮通过 `parseNudge`、4 个按钮被拒、`errandRequestItems`、`parseState` 的 `errands` 字段（缺省/非布尔/false/true）。`test/desktop-companion-logic.test.mjs` 增加 JS 对照：`KINDS.song` 的按钮表、`REQUEST_KINDS` 与菜单项 kind 完全一致。
- [ ] **Step 2: 运行确认失败**：`node --test --test-force-exit test/desktop-companion-logic.test.mjs`（会编译自测）。
- [ ] **Step 3: 写最小实现**（纯逻辑 → 控制器 → `main.swift`；`menuNeedsUpdate` 里的子菜单按“跳过本次”的现有写法；`requestErrand(_:)` 从 `representedObject` 取 kind，这样 `menuItem` 测试钩子走同一条 `sendAction` 路径）。
- [ ] **Step 4: 运行通过**；`swiftc -typecheck` 全部源文件。

## Task 6: 后台接线、设置页与源码合同

**Files:** Modify `js/background.js`、`settings.html`、`js/settings-page.js`、`index.html`/`settings.html` 的脚本版本钉（如有）、`test/jelly-errands-integration.test.js`、`test/jelly-desktop-integration.test.js`（如受影响）。

**接线要点：**

- `importScripts` 在 `'jelly-errands-core.js'` 之后加入 `'jelly-errand-songs.js'`。
- 歌曲来源：`JellyErrandSongs.create({ api: neteaseApiCall, loggedIn: async () => (await getNeteaseCookies()).includes('MUSIC_U'), normalize: normalizeSilentMusicSong })`（与 `startSilentNeteaseQuickPlay` 同一判定与同一规范化）。
- `isMusicPlaying()`：先用 `chrome.runtime.getContexts({ contextTypes:['OFFSCREEN_DOCUMENT'], documentUrls:[offscreen.html] })` 看有没有播放文档，**没有就是没在播放**（不为了查询去创建文档）；有才 `sendToOffscreen({command:'getState'})`，回包不 `ok` 返回 `null`，否则 `Boolean(data.isPlaying)`。
- `playJellySong(song, signal)`：`ctx = { guard() { if (signal.cancelled) throw new Error('已取消') }, trace: (name, title, input, fn) => { if (name === 'music.playback.dispatch') { ctx.guard(); dispatched = true; } return fn(); } }`，调 `playAssistantMusic(song, ctx)`；成功 `{ok:true}`，失败 `{ok:false, dispatched, code: error.code === 'unavailable' ? 'unavailable' : 'other', message: <只有含中文的错误信息才回，≤40 字>}`。
- `isAvailable: minVersion => jellyDesktop.errandsReady(minVersion)`；`onChange: () => jellyDesktop.sync()`；`jellyDesktop.errandsEnabled = async () => (await jellyErrands.get()).config.enabled === true`（控制器创建之后赋值）；`desktopAlarm.onErrandRequest = async kind => jellyErrands.request(kind)`。
- 设置页：`set-errandsSong` 开关（默认勾选）并入 `ERRANDS_IDS/readErrandsConfig/applyErrandsUI`；卡片文案修订（不再写“不会放歌/不联网”，改为“只有你点气泡上的‘播放’才会放那一首；推荐歌曲会读取网易云的每日推荐或热歌榜，和音乐页同一来源”）；版本提示：歌曲与右键菜单需要组件协议 v9，v8 组件上其余差事照常，歌曲与菜单不可用。

- [ ] **Step 1: 写失败测试**（源码合同）：`importScripts` 顺序；接线字符串（`neteaseApiCall`、`MUSIC_U`、`normalizeSilentMusicSong`、`getContexts`、`music.playback.dispatch`、`onErrandRequest`、`errandsEnabled`、`errandsReady(minVersion)`、`onChange`）；`isMusicPlaying` 不无条件调用 `ensureOffscreen`；`jelly-errand-songs.js` 无网络与 DOM；设置页新增控件 id 全部出现在 `settings.html` 与 `ERRANDS_IDS`；文案不再含“不会放歌”；`js/background.js` 的 `userAlarmSaveQueue…getUserAlarmViewState` 片段仍不引用片段外全局。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 写实现**。
- [ ] **Step 4: 运行通过**；`node --check js/background.js js/settings-page.js`。

## Task 7: 隔离原生验收与联调

**Files:** Modify `desktop-reminder/jelly-smoke.mjs`、`bridge-smoke.mjs`（及它们断言的版本号 8→9，`assistant-smoke.mjs` 里若有协议版本断言一并改）。

- jelly-smoke 增加场景（**实际实现**：并入既有 `--only=errand`，另加 `--scenario=名字里的正则` 只跑匹配的差事场景，调试与变异检查用）：①`song` 气泡 3 个按钮（`ping` 回报按钮 id），`nudgeButton` 钩子分别按 `another`/`play`/`dismiss` 并回执成功/失败，只有匹配回执才显示结果，4 个按钮被拒；`screencapture -l` 自家窗口截图并目检；②`jelly` 命令带/不带 `errands` 时 `menuTitles()` 有无“水母，给我…”，`menuItem` 点“来首歌”得到 `errandRequest` 事件（kind=song、errandId 为字符串、事件不带 requestId），回 `errandRequestResult` 的三种结果（有文字/无文字/失败）与 15 秒超时，旧请求的迟到回执被忽略，响铃中菜单不出现该项。
- bridge-smoke 增加阶段：真实 `AlarmDesktop` + `JellyErrands`（替身歌曲源与 `playSong`）↔ 真实原生进程：定时提议一首歌 → 钩子点“播放” → Chrome 回执 → 原生显示；菜单“来首歌”请求 → Chrome 发气泡；菜单“今日概览”在没有任务时回文字。
- 运行时礼让用户：`user-quiet.mjs`；不要碰鼠标；先确认 `assistant-smoke` 的后台补跑已结束（同一个隔离 Bundle ID 不能并行）。

- [ ] **Step 1: 写场景与断言**；**Step 2:** `node desktop-reminder/build.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --app=/tmp/tk-errands/QA.app`（不带 `--install`）；**Step 3:** 逐个跑 `jelly-smoke.mjs --no-mouse --only=…`、`bridge-smoke.mjs --no-mouse`，再跑全部；**Step 4:** 目检截图。

## Task 8: 变异检查、文档与交付

- 变异检查（脚本放 `/tmp`，只改副本）：Chrome 侧（控制器歌曲与请求路径、歌曲来源、桥接、`push`）、Swift 纯逻辑、AppKit 控制器；每个存活变异体要么补测试，要么在文档里说明为什么等价。逐个 `cmp` 证明仓库文件没变。
- 文档：`docs/technical/jelly-errands-20261017.md` 加“第二期”章节（复用了哪些既有能力、协议 v9、失败边界、未验收项）；`docs/technical/_index.md`；`desktop-reminder/README.md`（v9 段落）；`AGENTS.md` 的“水母差事”条同步；设置页文案与技术文档一致。
- 验证：`node --test --test-force-exit` 全量（Node 25 不接受目录，传 `test/*.test.js test/*.test.mjs`）、各 `node --check`、`swiftc -typecheck`、`git diff --check`；分别报告静态检查、业务替身、隔离原生冒烟、真实 Chrome（未验收）与真实账号（未验收）。
- 不能声称已验收：真实 Chrome 156、真实网易云账号与每日推荐、真实播放（Offscreen 与音频设备）、重装后的真实组件、全屏 Space、多显示器组合、VoiceOver。重装组件与重载扩展由用户做。

## 自检（对照设计稿）

- 第 4 节“推荐歌曲”：数据源（每日推荐 → 热歌榜 → 跳过）、按钮（播放/换一首/不听）、先问播放状态、点“播放”才放、失败显示原因 → Task 2/3/6；回执文案按“修订 3”调整。
- 第 5 节收敛与去重：歌曲沿用 `muted/strikes/seen` → Task 3。
- 第 6 节协议：`errands` 字段与菜单请求 → Task 4/5（设计稿的单独 `errand` 命令在第一期已改为复用 `nudge`）。
- 第 7 节右键菜单：四个子项、走同一套生成与回执、不占预算 → Task 3/5。
- 第 8 节设置：“推荐歌曲”分项 → Task 6。
- 第 10 节错误处理：推荐失败静默跳过、组件太旧静默跳过 → Task 3。
- 不在本期：巡游、时段性格、睡觉条件（第三期）。
