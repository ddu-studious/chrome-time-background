# 水母下一批实用能力：飞书哨兵、标签页/观看进度/书签回顾、会议安静门禁与拖拽投喂（2026-10-19）

- 设计稿：`docs/superpowers/specs/2026-10-19-jelly-next-abilities-design.md`
- 前置能力：`docs/technical/jelly-errands-20261017.md`（水母差事第 1–3 期，协议 v8–v10）与 `docs/technical/native-assistant-workbench-20261016.md`（桌面 AI 助手 L1）

---

## 1. 背景与复用边界

在桌面水母已具备独立常驻、差事调度（`brief/task/worklog/song/tidbit`）、活动行为（v10）与桌面 AI 助手（v7）的基础上，本轮在不新增任何 Chrome 扩展权限、不增加常驻轮询进程、不破坏“Chrome 唯一拥有业务状态、原生端只显示与转发、改数据永远要用户点一下”原则的前提下，补齐四组高感知的日常实用能力：

1. **能力 A（`lark`）**：飞书 `@我` 消息哨兵——复用本机已安装的官方 `@larksuite/cli@1.0.92`（MIT 许可证，`/opt/homebrew/bin/lark-cli`，配置 `codex-feishu-notify`），经受控 `local-ai` 鉴权接口 `/v1/sentinel/lark` 只读拉取近 24 小时 `@我` 元数据（条数、群名/会话名、发送人名字），**绝不返回或落盘消息正文**。
2. **能力 B1–B3（`tabs` / `watch` / `bookmark`）**：纯本机零网络差事——陈旧标签页守护（只读统计超过 48 小时未访问的后台普通网页标签页，≥5 个时温和提醒去网站工作区整理，绝不自动关标签）、接着看提醒（只读 `biliWatchMemory`、`youtubeWatchHistory`+`youtubeWatchProgress`、`mashibingStudyTrackerV1` 中近 7 天进度在 5%–90% 的未看完视频/课程）、深海拾贝（只读 `bookmarkCache` 中已到期的间隔重复书签 `srs.nextReview <= now`）。
3. **能力 C（会议安静门禁）**：原生端在每 15 秒 `samplePresence()` 时，用 macOS 公开的 `CoreAudio`（`kAudioDevicePropertyDeviceIsRunningSomewhere`）与 `CoreMediaIO`（`kCMIODevicePropertyDeviceIsRunningSomewhere`）零权限只读判断默认麦克风或任一摄像头是否正在被使用（不采集音视频、不弹系统授权窗）；占用期间 `presence` 事件附带 `meeting: true`，Chrome 侧 `JellyErrandsCore.gate` 以 `reason: 'meeting'` 暂停主动差事，原生侧 `JellyBehavior.canPatrol` 暂停随机巡游与原地小跳。
4. **能力 D（拖拽投喂水母）**：水母窗口 `JellyView` 注册 `registerForDraggedTypes([.fileURL, .URL, .string])`，经纯函数 `JellyModel.parseDrop` 校验并清洗（只认 `http/https` 链接、白名单后缀且无 `..` 路径穿越的本地文件、非空纯文本，生成 ≤400 字的提示词），填入桌面 AI 助手输入框并弹出面板（**只预填，绝不自动提交**，后续仍走 `origin: 'desktop'` 确认卡边界）。

---

## 2. 上游能力核查与自有适配层

| 能力 | 复用的上游 / 仓库内模块 | 自有代码职责 |
|---|---|---|
| 飞书 `@我` 哨兵 | `@larksuite/cli@1.0.92`（`/opt/homebrew/bin/lark-cli`，MIT）：优先尝试 `im +messages-search --is-at-me`，若当前账号缺少 `search:message` scope（错误码 `99991679`），自动回退到已授权的 `im +chat-list` + `im +chat-messages-list` 并按 `mentions` 匹配当前用户 `open_id` 或 `@_all` | `local-ai/lark-sentinel.mjs` 负责 `execFile` 安全调用（固定绝对路径、超时 10 秒、禁用环境变量覆盖）、内存缓存（10 分钟）与错误冷却（5 分钟），并只提取 `{ count, chats, senders, newestAt }` 元数据，丢弃 `content` 正文 |
| 陈旧标签页守护 | Chrome 已有 `tabs` 权限与 `js/site-workspace-core.js` 工作区入口 | `JellyErrandsCore.staleTabStats` 纯函数过滤（排除 `active`、`pinned`、`audible`、非 `http(s)` 标签），阈值 48 小时且 ≥5 个才候选；点击“去整理”只打开网站工作区 |
| 接着看提醒 | 仓库内已有的 `biliWatchMemory`、`youtubeWatchHistory`、`youtubeWatchProgress`、`mashibingStudyTrackerV1` 本地存储 | `JellyErrandsCore.watchCandidates` 纯函数归一化近 7 天、进度 5%–90% 的条目；点击“接着看”打开对应视频工作台或课程页 |
| 深海拾贝（书签回顾） | 仓库内 `js/bookmark-srs.js` 写入的 `bookmarkCache`（`status === 'active'`、`srs.nextReview`） | `JellyErrandsCore.dueBookmarks` 纯函数筛选到期未归档书签；点击“去回顾”打开被遗忘书签页 |
| 会议安静门禁 | macOS 系统框架 `CoreAudio` / `CoreMediaIO` 的 `IsRunningSomewhere` 只读属性 | `desktop-reminder/main.swift` 的 `hardwareMediaBusy()` 与 `samplePresence()`、`JellyBehavior.canPatrol`、`JellyErrandsCore.gate` |
| 拖拽投喂 | AppKit `NSDraggingDestination` + 仓库内 `AssistantController`（`desktop-reminder/assistant-panel.swift`） | `JellyModel.parseDrop` 白名单解析、`JellyView` 拖拽代理扩展、`AssistantController.prefillAndShow` |

---

## 3. 协议与数据边界

- **协议版本保持 v10**：
  - `KINDS` 新增 `lark`（紧急度 3，按钮 `open/later`）、`tabs`（紧急度 2，按钮 `open/later`）、`watch`（紧急度 1，按钮 `open/dismiss`）、`bookmark`（紧急度 1，按钮 `open/later`）；JS `JellyErrandsCore.KINDS` 与 Swift `JellyModel.nudgeButtonRules` / `primaryNudgeButton` 由 `test/desktop-companion-logic.test.mjs` 与 `companion-selftest.swift` 双向对照守住。
  - 右键菜单“水母，给我…”（`REQUEST_KINDS` / `JellyModel.errandRequestItems`）扩展为 8 项：`今日概览 (brief)`、`飞书 @我 (lark)`、`来首歌 (song)`、`来点乐子 (tidbit)`、`工作日志 (worklog)`、`整理标签页 (tabs)`、`接着看 (watch)`、`深海拾贝 (bookmark)`。
  - `presence` 事件在空闲状态基础上增加可选布尔字段 `meeting: true`（仅当 `meeting == true` 时附带该键，散会后发不带 `meeting` 的 `presence` 事件，Chrome 侧 `alarm-desktop.js` 按 `message.meeting === true` 归一后传给 `jellyErrands.onPresence(state, { meeting })`）。
- **隔离测试钩子（仅 `TIMEKEEPER_TEST_HOOKS=1` 生效）**：
  - `TIMEKEEPER_TEST_HOOKS=1` 下 `systemMediaBusy()` 默认与宿主真实麦克风/摄像头硬件状态隔离（返回 `false`），以免开发者机器开着麦克风时干扰既有冒烟；测试可通过命令 `mediaBusy { busy: Bool }` 或环境变量 `TIMEKEEPER_MEDIA_BUSY=1|0|hardware` 显式控制。
  - 新增命令 `dropHook { url?, fileURL?, text? }`，走与真实拖拽相同的 `JellyModel.parseDrop` + `JellyController.receiveDrop` 路径。

---

## 4. 分层验证结果

1. **静态与语法检查**：
   - `git diff --check` 无空白或格式错误。
   - `desktop-reminder/species-render.mjs` 离屏渲染检查 **677 / 677** 项通过（确认 `jelly-companion.swift` 末尾追加拖拽扩展未影响任何物种绘制与行号约束）。
2. **Swift 纯逻辑自测与跨语言契约（`test/desktop-companion-logic.test.mjs`）**：
   - 编译并运行 `companion-selftest.swift`：覆盖 9 类差事按钮白名单、8 项右键菜单请求、会议占用下的 `canPatrol` 门禁、`JellyModel.parseDrop` 链接/文件/文本解析与非法路径拒绝，全部通过。
3. **Node 单元测试**：
   - `test/local-ai-lark-sentinel.test.mjs`（4 项）：覆盖搜索模式、缺 `search:message` 自动回退群聊扫描模式、未登录优雅返回、10 分钟缓存命中。
   - `test/jelly-errands-core.test.js` + `test/jelly-errands.test.js` + `test/jelly-errands-integration.test.js` + `test/alarm-desktop.test.js`：全部通过。
   - 全量 `node --test --test-force-exit --test-concurrency=4 test/*.test.js test/*.test.mjs` 通过。
4. **隔离原生进程冒烟与桥接联调（`/tmp/tk-next/QA.app`）**：
   - `jelly-smoke.mjs --only=errand --no-mouse`：19 个差事场景（含八项右键菜单请求、会议安静门禁 `mediaBusy`、拖拽投喂 `dropHook`）全部通过。
   - `jelly-smoke.mjs --only=patrol --scenario="开会期间" --no-mouse`：开会期间不出发、巡游中开始开会立刻结束、散会后重新等待再出发，通过。
   - `TIMEKEEPER_IDLE_SECONDS=0 node desktop-reminder/bridge-smoke.mjs --no-mouse`：阶段 1 至阶段 7 全部通过。
5. **未验收边界**：
   - 用户自己的 Chrome 配置（需用户重载扩展）与重装后的真实桌面组件（`node desktop-reminder/build.mjs --extension-id=<id> --install`）。
   - 真实飞书线上会话在完整一天内的消息量表现、真实 Zoom/腾讯会议/飞书会议开启摄像头与麦克风时的真机触发、Finder/浏览器向水母窗口的真实鼠标拖拽手势。
