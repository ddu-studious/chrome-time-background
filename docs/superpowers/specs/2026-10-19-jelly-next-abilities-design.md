# 小水母下一批能力设计稿：飞书哨兵、深海拾贝、续看与标签卫士、会议静默守门、拖放投喂

日期：2026-10-19  
状态：**用户已确认方案，进入开发实现**

---

## 1. 决策来源与不抢权契约

用户于 2026-10-19 确认：

1. **飞书配置切换**：使用 `/opt/homebrew/bin/lark-cli`（`@larksuite/cli@1.0.92`，MIT 许可证）并固定指定 `--profile codex-feishu-notify`（该 profile 已配置好 `appSecret` 且用户态令牌可用，无需动默认空 profile）。
2. **纳入本期实现的全部能力**：
   - **能力 A：飞书“@我”消息哨兵（`lark`）**（默认仅显示元数据：几条、哪个群、谁；不落盘正文）
   - **能力 B1：标签卫士（`tabs`）**（只读检查长时间未访问的陈旧标签页，绝不自动关标签）
   - **能力 B2：续看提醒（`watch`）**（只读唤醒 B 站、YouTube、马士兵课程未看完进度）
   - **能力 B3：深海拾贝 · 书签回顾（`bookmark`）**（复用本仓库 `bookmarkCache` 与 `bookmark-srs.js` 到期复习书签）
   - **能力 C：会议/通话静默守门（Meeting Quiet Gate）**（原生端零权限读取摄像头/麦克风占用状态，开会时不弹主动差事气泡、不巡游打扰）
   - **能力 D：桌面拖放投喂（Drag-and-Drop Feed）**（拖入文字/链接/文件到水母身上，预填唤出桌面 AI 助手面板，`origin:'desktop'` 写操作一律保留确认卡）
3. **微信**：本期不做。

### 核心不抢权契约（所有新能力强制遵守）

1. **零焦点劫持、零鼠标接管**：所有差事气泡与水母本体的交互保持 `.nonactivatingPanel`，不切换前台应用、不抢键盘焦点、不发合成键鼠。只有用户主动把内容拖放到水母身上（或点击“问 AI…”）时才打开并聚焦桌面 AI 助手输入框。
2. **动作永远需要用户点一下**：打开网页、跳转视频续看、打开书签、提交 AI 任务全部在用户点击气泡按钮或面板发送按钮后才发生；桌面来源（`origin:'desktop'`）的写操作一律先出确认卡，绝不走自动确认。
3. **共用差事预算与退避**：新差事类别接入 `JellyErrandsCore`，共用活动时段、离开/刚回来/会议中静默、至少 15 分钟间隔、每小时预算（安静 2 / 适中 4 / 忙碌 8）以及“连续 2 次拒绝当天静默该类”机制。
4. **不新增扩展权限**：`manifest.json` 权限保持不变（复用已有 `tabs`、`storage`、`alarms`、`nativeMessaging`）；`js/jelly-errands*.js` 核心与控制器保持纯逻辑与依赖注入，不直接调用 `chrome.*` 或 `fetch`。

---

## 2. 本机环境与事实核对（macOS 26.5）

1. **双版本 `lark-cli` 与 Profile 诊断**：
   - `/usr/local/bin/lark-cli` 为旧版 `1.0.2`，默认 profile `cli_aaa51b2a22279bd0` 未配置可用密钥。
   - `/opt/homebrew/bin/lark-cli` 为官方 `@larksuite/cli@1.0.92`（MIT 许可证）。
   - `--profile codex-feishu-notify`（`appId: cli_a680a230abf1500c`）机器人身份 `ready`、用户身份 `available: true`（支持自动刷新），已具备 `im:chat:read`、`im:chat:readonly`、`im:message:readonly`、`im:message.group_msg:get_as_user`、`im:message.p2p_msg:get_as_user` 等只读权限。
2. **双路径飞书只读探测（零额外授权即可工作）**：
   - **路径 1（搜索路径）**：若已授予 `search:message` scope，调用 `im +messages-search --is-at-me --start <ISO> --page-size 50 --as user --format json`。
   - **路径 2（会话扫描路径，使用 `codex-feishu-notify` 现有权限直接可用）**：调用 `im +chat-list --as user --sort active_time --exclude-muted --page-size 5 --format json` 取最近活跃群聊，再对前 3 个活跃群调用 `im +chat-messages-list --as user --chat-id <id> --start <ISO> --page-size 20 --no-reactions --format json`，筛选 `deleted !== true` 且 `mentions` 命中当前用户 `openId`（或 `@_all`）的消息。
3. **原生零权限信号**：
   - 摄像头在用（`CoreMediaIO` `kCMIODevicePropertyDeviceIsRunningSomewhere`）与默认输入麦克风在用（`CoreAudio` `kAudioDevicePropertyDeviceIsRunningSomewhere`）均可在 Swift 中直接只读查询，不触发系统 TCC 弹窗，不采集任何音视频流。

---

## 3. 架构与数据流设计

### 3.1 差事类别扩展（`js/jelly-errands-core.js` ↔ `desktop-reminder/jelly-model.swift`）

在现有 5 类差事（`brief`、`task`、`worklog`、`song`、`tidbit`）基础上新增 4 类（组件协议版本门槛 `since: 10`，与当前协议 v10 对齐，旧 v8/v9 组件自动跳过）：

| 类别 `kind` | 名称 | 紧急度 `urgency` | 按钮白名单（首项为主按钮） | 右键“水母，给我…”菜单项 |
|---|---|---|---|---|
| `lark` | 飞书 @我 提醒 | `3`（与日志同级） | `open`（去看看）、`later`（稍后） | `看看飞书 @我` |
| `tabs` | 标签卫士 | `1`（低打扰） | `open`（去整理）、`later`（稍后） | `检查陈旧标签页` |
| `watch` | 续看提醒 | `1`（低打扰） | `open`（继续看）、`dismiss`（先不看） | `接着看未看完的视频` |
| `bookmark` | 深海拾贝（书签回顾） | `1`（低打扰） | `open`（打开看看）、`later`（改天） | `捞一条旧书签` |

- `JellyErrandsCore.KINDS`、`SWITCHABLE`、`REQUEST_KINDS` 与 `JellyModel.errandKinds`、`nudgeButtonRules`、`primaryNudgeButton`、`errandRequestItems` 严格双向同步，由 `test/desktop-companion-logic.test.mjs` 与 `companion-selftest.swift` 独立字面量断言守住。
- 新四类差事属于水母独有能力，无旧系统通知可退回：`present` 未显示时 `fallback: false`，静默跳过，不弹系统通知。

### 3.2 能力 A：飞书“@我”消息哨兵（`local-ai/lark-sentinel.mjs`）

```
Chrome 后台 (js/background.js 注入 readLark)
   └─ 鉴权 GET /v1/sentinel/lark?since=<ms>&manual=0|1  (local-ai/server.mjs)
         └─ local-ai/lark-sentinel.mjs
               ├─ 固定可执行文件：/opt/homebrew/bin/lark-cli
               ├─ 固定 Profile：--profile codex-feishu-notify
               ├─ 10 分钟服务端缓存（手动请求可刷新）+ 失败退避
               └─ 只返回清洗后的元数据：{ ok, status, mode, count, chats:[{name,count}], senders:[name], newestAt }
```

- **安全与隐私边界**：
  - 子进程使用 `execFile` 固定参数数组（绝不经过 shell），超时 15 秒，`maxBuffer` 1 MiB，并发互斥（同时最多 1 个）。
  - 服务端与 Chrome 端**均不返回、不落盘、不写日志任何消息正文（`content`）**；群名与发送者名经控制字符/方向控制符清洗并截断至 ≤24 字符。
  - 点击气泡 `open`（“去看看”）时，在 Chrome 中打开飞书网页消息页或已打开的飞书标签页。

### 3.3 能力 B1–B3：浏览器内建数据源唤醒（零网络请求、纯本地只读）

全部在 `js/background.js` 中封装为只读提供器注入 `JellyErrands.create(...)`，`js/jelly-errands.js` 自身不直接访问 `chrome.*`：

1. **标签卫士（`tabs`）**：
   - `readStaleTabs()` 调用 `chrome.tabs.query({})`，排除 `pinned`、`audible`、`active` 及非 `http(s)` 页面，统计 `lastAccessed` 距今超过 48 小时（`2 * 86400 * 1000` ms）的标签页数量与最久未访问的一条标题。
   - 定时差事仅当陈旧标签数 `>= 5` 时产生候选（每天最多提醒一次，`fp: tabs:<day>`）；手动右键菜单请求“检查陈旧标签页”时如实报告当前陈旧数量（若为 0 则反馈“目前没有超过 2 天未看的网页标签”）。
   - 点击 `open` 打开首页并聚焦网站工作区/激活最久未访问的标签页供用户自行决定去留，**绝不自动关闭任何标签页**。
2. **续看提醒（`watch`）**：
   - `readWatch()` 只读 `chrome.storage.local` 中的 `biliWatchMemory`、`youtubeWatchHistory` + `youtubeWatchProgress`、`mashibingStudyTrackerV1`。
   - 挑选最近 7 天内观看进度在 5%–90% 之间（已看 ≥60 秒且剩余 ≥120 秒）的未看完视频/课程。
   - 气泡文案：`还有没看完的视频` / `上次看到《标题》的第 M 分钟，要接着看吗？`。
   - 点击 `open` 打开对应续看页面（B 站/YouTube 应用内深链或课程页）。
3. **深海拾贝 · 书签回顾（`bookmark`）**：
   - `readBookmark()` 只读 `chrome.storage.local` 中的 `bookmarkCache`（由 `js/bookmark-rag.js` / `js/bookmark-srs.js` 维护），筛选 `status === 'active'` 且 `srs.status !== 'archived'` 且到期需复习（`srs.nextReview <= now`）或收藏已久的条目。
   - 气泡文案：`深海拾贝 · 书签回顾` / `以前收藏的《标题》到了温习时间，要打开看看吗？`。
   - 点击 `open` 在新标签页打开该书签 URL（仅限合法 `http(s)` URL）。

### 3.4 能力 C：会议/通话静默守门（`desktop-reminder/`）

1. **原生只读检测（`JellyHardware.isMediaInUse`）**：
   - 在 `desktop-reminder/` 中查询 `CoreAudio` 默认输入设备 `kAudioDevicePropertyDeviceIsRunningSomewhere` 与 `CoreMediaIO` 视频设备 `kCMIODevicePropertyDeviceIsRunningSomewhere`。
   - 支持隔离验收环境变量 `TIMEKEEPER_MEDIA_BUSY=0|1`（仅在 `TIMEKEEPER_TEST_HOOKS=1` 时生效）。
2. **静默守门行为**：
   - `main.swift` 每 15 秒采样时将 `meeting: Bool` 交由 `jelly.noteIdle(idle, meeting: meeting)`，并在状态变化时随 `presence` 事件（`{ type: "presence", presence: "active"|"away", meeting: true|false }`）上报 Chrome。
   - 原生侧 `JellyController.behaviorEligible` 在 `meeting == true` 时不发起巡游与随机小动作（水母安静陪伴）。
   - Chrome 侧 `JellyErrandsCore.gate` 在 `presence.meeting === true` 时返回 `{ ok: false, reason: 'meeting' }`，会议期间不主动弹差事气泡（闹钟到点响铃与用户主动右键请求不受影响）。

### 3.5 能力 D：桌面拖放投喂（`desktop-reminder/` ↔ `AssistantController`）

1. **纯逻辑清洗与预填构造（`JellyModel.DropItem` / `JellyModel.parseDrop`）**：
   - 接受三类拖入负载：
     - `url`：仅限 `http://` 或 `https://`，清洗控制字符，长度 ≤500，生成预填提示词 `"帮我总结或处理这个链接：<url>"`
     - `text`：纯文本清洗控制字符，长度 ≤500，生成预填提示词 `"帮我处理这段内容：<text>"`
     - `file`：仅取文件名（`lastPathComponent`，≤80 字符），**不读取文件内容、不上传**，生成预填提示词 `"我拖入了一个文件「<name>」，帮我记一条待办或整理说明"`
2. **视图与控制器交互**：
   - `JellyView` 注册 `registerForDraggedTypes([.URL, .fileURL, .string])`。
   - 拖入悬停（`draggingEntered`）时：若正在响铃则拒绝；否则水母睁大眼并执行一次轻跳反馈。
   - 松手投喂（`performDragOperation`）时：
     - 若桌面 AI 助手已启用（`assistant.enabled`），调用 `assistant.prefillAndShow(item.prompt)` 打开原生 AI 面板并预填输入框，由用户确认后按回车发送（遵循 `origin:'desktop'` 规则，写操作必出确认卡）。
     - 若桌面 AI 助手未启用，水母弹出简短反馈气泡提示“请先在设置页开启桌面 AI 助手”，同时向 Chrome 发送 `dropItem` 事件。
   - 隔离验收钩子：`dropHook`（仅 `TIMEKEEPER_TEST_HOOKS=1` 可用），支持在不移动真实鼠标的情况下端到端验证 `url / text / file` 投喂与面板预填。

---

## 4. 验证与交付计划

1. **静态与契约测试**：
   - `test/jelly-errands-core.test.js`、`test/jelly-errands.test.js`、`test/jelly-errands-integration.test.js` 覆盖新增四类差事、会议静默守门、手动请求与设置页控件。
   - `test/local-ai-lark-sentinel.test.mjs` 用替身可执行脚本验证 `lark-cli --profile codex-feishu-notify` 的双路径解析、元数据投影、超时/退避与零正文泄露。
   - `test/desktop-companion-logic.test.mjs` + `desktop-reminder/companion-selftest.swift` 对拍 JS 与 Swift 的 `KINDS`、`REQUEST_KINDS`、会议静默守门与 `parseDrop` 纯逻辑。
2. **隔离原生冒烟**：
   - 在 `/tmp` 临时目录构建独立 QA 应用（绝不在主工作区直接编译 Swift），运行 `jelly-smoke.mjs` 与 `bridge-smoke.mjs` 验证会议静默守门与拖放投喂钩子。
3. **语法与格式检查**：
   - `node --check` 全部改动脚本，`git diff --check` 无空白或冲突标记错误。
