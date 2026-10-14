---
title: "快捷助手页内浮层被误判失败后改开独立小窗：根因与修复"
type: technical
status: active
version: "1.2"
created: "2026-10-14"
updated: "2026-10-14"
author: "Cursor Agent"
app-version: "3.16.0"
tags: [快捷助手, 浮层, 独立小窗, assistant_ready, Service Worker, 首页, 回退日志, 系统负载, 载入提示, 慢打开, 页面适用性, 失败分类, XML文档, 沙箱页面, activeTab]
related:
  - docs/technical/extension-reload-and-page-open-20261014.md
  - docs/technical/assistant-interaction-native-20260920.md
changelog:
  - date: "2026-10-14"
    desc: "初始创建：浮层被误判失败后改开小窗的根因、三处修复、真实 Chromium 复现与验证、未覆盖范围"
  - date: "2026-10-14"
    desc: "第二轮（下午复发）：真实日志两条 home-ready-timeout（4008/4142 ms）；iframe 晚到而主线程空闲的复现；就绪上限 4→15 秒、400 ms 载入提示、后台等待窗口放宽、诊断字段与慢打开记录；真实 Chromium 对照与变异检查"
  - date: "2026-10-14"
    desc: "第三轮（傍晚复发，page-overlay-unavailable 8 ms）：排除企业策略、全局快捷键、重载后遗留标记；真实 Chromium 逐类页面实测发现 XML/SVG 文档里宿主自己崩溃、CSP sandbox 页面白等 15 秒；宿主立即拒绝并说明原因、初始化标记后置；失败原因分类（只记固定类别）与标签页/窗口状态；首页展示被拒与意外异常也必有界面；慢打开带宿主诊断；真实 open() 端到端复验"
---

# 快捷助手页内浮层被误判失败后改开独立小窗

日期：2026-10-14

## 现象

用户期望：在首页（新标签页）按快捷键，输入条以**页内浮层**出现在首页上；实际打开了一个**独立的 macOS 小窗**（只有一条输入栏的 Chrome 弹出窗口）。

## 现有打开顺序（本次未改）

`QuickAssistant.open()`（`js/assistant-background.js`）按顺序尝试：

1. 当前标签是本扩展首页或被本扩展覆盖的 `chrome://newtab/` → 首页浮层（`assistant_home_overlay_*`，由首页自己加载的 `js/assistant-overlay.js` 处理）。
2. 当前标签是 http(s) 页面 → 注入 `js/assistant-overlay.js` 并显示网页浮层。
3. 以上都不成立 → `chrome.windows.create({ type: 'popup' })` 打开独立小窗。

宿主脚本把 `assistant.html?embedded=1` 放进 iframe 后，等 iframe 发来 `assistant_ready`（`js/assistant-overlay.js`）；超时就撤下浮层并回报 `ready-timeout`，后台随即改开小窗。所以“浮层一闪而过、过几秒冒出一个小窗”就是这条超时路径。第一版只等 4 秒，2026-10-14 下午起放宽到 **15 秒**（见“第二轮”）。

## 根因

1. **主因：就绪信号排在数据加载之后。** `js/assistant.js` 原来在 `await Promise.all([refresh(), loadAICapabilities(), loadLayaControl()])` 之后才发 `assistant_ready`。这三项都要经 Service Worker 往返；本机 AI 服务不应答、或 Service Worker 冷启动后恢复上次任务时，每一项最长约 7 秒，远大于宿主的 4 秒窗口。输入条本身早已可用，却被误判为“没有就绪”。
2. **次因：首页宿主脚本加载过晚（竞态）。** 宿主脚本在文档后部才执行。扩展刚重新加载或页面刚打开时，Service Worker 的状态探测 `assistant_overlay_status` 因“没有接收者”被立即拒绝，被当成“这不是我们的首页”而直接开小窗。
3. **可观测性缺失：** 改开小窗没有任何记录，事后无法区分是哪条路径。

## 修改

| 位置 | 改动 |
| --- | --- |
| `js/assistant.js`（`assistant.html` 的脚本版本 `?v=20261014-ready-early`） | 输入条（草稿恢复、`renderTokens()`、`renderMenu()`）准备好后**立即**发 `assistant_ready`，再并行加载 `refresh / loadAICapabilities / loadLayaControl`。就绪只表示“输入条可用”，不表示数据已到；数据到达后仍走原有更新路径。`const embedded = new URLSearchParams(location.search)` 必须留在这段初始化之后（测试按源码切片）。 |
| `index.html` | `<script src="js/assistant-overlay.js?v=8" data-assistant-home="true">` 提到 `<head>` 最前（样式之前），让监听器在页面任何慢资源之前注册。 |
| `js/assistant-background.js` | 新增 `probeHome()` / `hasHomeDocument()`：先发状态探测（750 ms）；无回应时用 `chrome.runtime.getContexts({ tabIds, contextTypes: ['TAB'] })` 判断该标签里**是否确实存在本扩展首页文档**。存在（仍在加载、主线程忙）就每 120 ms 重试、最多 4 秒（第二轮起 10 秒）；不存在（别家新标签页、扩展刚重载后遗留的失效旧页面）立即兜底，不白等。 |
| `js/assistant-background.js` + `js/background.js` | 改开小窗时向已有的 `extEventLog`（`chrome.storage.local`，最多保留最近 200 条）写一条 `system / assistant-popup`，原因落在记录的 `ctx` 字段（见下表；调用参数名为 `context`）；`QuickAssistant.install` 新增可选依赖 `log`，日志失败不影响助手入口。 |

不改动：确认/选择卡片、Engine、Gateway、预算、取消、权限。`authorize()` 对 iframe 消息的 nonce、`frameId`、宿主来源绑定完全不变，没有放宽任何消息授权。

### 回退原因（`system / assistant-popup` 记录的 `ctx` 字段）

| `ctx` | 含义 | `ok` |
| --- | --- | --- |
| `home-no-document` | 当前标签不含本扩展首页文档（别家新标签页、旧页面失效） | false |
| `home-no-reply` | 首页文档存在但 10 秒内（第一版 4 秒）一直没有回应探测 | false |
| `home-ready-timeout` | 首页浮层已显示，iframe 15 秒内（第一版 4 秒）没有发出 `assistant_ready`；`err` 字段带宿主诊断 | false |
| `home-show-no-reply` / `home-show-refused` | 首页宿主没有回应显示请求 / 明确拒绝 | false |
| `page-ready-timeout` / `page-show-refused` | 网页浮层的同类情况 | false |
| `page-overlay-unavailable` | Chrome 拒绝注入或展示请求（受限页面、错误页、缺少手势授权、宿主脚本报错等）；`err` 为 `<阶段>:<类别>;tab=…;disc=…;win=…`，见“第三轮” | 类别为 `no-access` / `error-page` / `webstore` / `policy` / `frame-gone` 时 true，其余（`no-receiver` / `port-closed` / `host-error` / `other`）false |
| `page-unsupported-document` | 宿主明确拒绝：XML / SVG 文档里建不出 HTML 元素（第三轮新增） | true |
| `page-opaque-origin` | 宿主明确拒绝：CSP sandbox 页面的源是 `null`，iframe 的就绪消息会被丢弃（第三轮新增） | true |
| `overlay-error` | 尝试页内浮层时出现意料之外的异常（如会话存储拒绝写入）；`err` 为 `open:<类别>;…`（第三轮新增） | false |
| `unsupported-page` | 不是 http(s) 页面，也不是首页（预期兜底） | true |

## 验证

按层次分开记录：

- **静态与业务替身：** `test/assistant-overlay.test.js`、`test/assistant-runtime-regression.test.js`（覆盖：初始化里就绪信号先于数据加载、宿主脚本在 `<head>` 且位于样式之前、探测的各分支与原因值、日志写入且日志失败不阻断）。
- **真实 Chromium（Chrome for Testing 151，无头，经 CDP 加载本扩展）：**
  - 复现条件：存入一个假令牌，并用 CDP `Fetch` 拦截 Service Worker 发往 `127.0.0.1:19841` 的全部请求且永不应答，模拟“本机 AI 服务不应答”；真实服务全程没有被访问。
  - 修复前：浮层在 4026 ms 被撤下，随后打开独立小窗。
  - 修复后：`assistant_ready` 在 79 ms 到达，7 秒时浮层仍在，没有小窗。
  - 另确认：`chrome://newtab/`（被扩展覆盖时）也能用 `getContexts` 识别出本扩展首页文档。
- **未验证：** 你本机的品牌版 Chrome 156（它不接受命令行 `--load-extension`，所以测试用的是 Chrome for Testing 151）、真实本机 AI 服务、真实账号数据、macOS 原生确认卡的联动。Service Worker 冷启动慢是同一路径上的另一个可能来源，没有单独复现；修复使两种来源都不再影响就绪信号。

## 第二轮：隔一会儿再按快捷键仍偶发开出小窗（2026-10-14 下午）

### 现象与问题

第一轮修复并重载扩展后，用户在 15:27 前后再次看到小窗：刚完成一个“随机播放”任务，离开一会儿，回来按 `⌘⇧B`，出现的是独立小窗（输入条里“模型 读取中…”“读取本机策略…”“正在读取快捷键…”都还是占位）。用户的疑问是：是不是有遗留代码、或者有场景没去掉。

### 结论：不是遗留代码，是同一条超时兜底被误触发

- 独立小窗是**设计内的最终兜底**，不是旧实现的残留：受限页面（`unsupported-page`，如 `chrome://extensions/`）和注入失败（`page-overlay-unavailable`）本来就走小窗；其余情况只在页内浮层确实没成功时才走。全仓核对过：`assistant.html` 只在 `js/assistant-background.js` 的 `QuickAssistant.open()` 末尾那一处 `chrome.windows.create` 里被当作小窗打开，没有第二条会无条件开小窗的路径（其余 `windows.create` 调用分别属于虎牙弹窗与别的功能，不涉及 `assistant.html`）。
- 这次是**宿主等 `assistant_ready` 的窗口太短**：第一版固定 4 秒，iframe 只要晚到就被判失败。

### 证据

1. 用户 Chrome 配置里的 `extEventLog`（只读取本扩展 `assistant-popup` 记录，没有复制任何配置文件）当天只有两条，且都是同一类：

   | 本地时间 | `ctx` | 耗时 |
   | --- | --- | --- |
   | 15:11:19 | `home-ready-timeout` | 4008 ms |
   | 15:25:57 | `home-ready-timeout` | 4142 ms |

   没有 `home-no-document`、`home-no-reply`、`home-show-*`。含义：后台 ↔ 首页的消息往返是快的（探测与显示请求都成功了），宿主也创建了 iframe，但 iframe 在 4 秒内没发出就绪信号。耗时紧贴 4000 ms，说明宿主的定时器是准点触发的，页面主线程当时并没有被卡死。
2. 排除项（逐条核对过）：快捷键不是全局或隐藏窗口作用域（`global: false`）；Service Worker 没有 `fetch` 监听；其他扩展页面不会回应首页状态探测（都按 `target` 与动作白名单过滤）；LevelDB 压缩只有 13–20 ms 级。
3. 干净的 Chromium 配置里，空闲、新开页面、页面被冻结三种情形下 `assistant_ready` 都在 76–200 ms 到达。所以问题不在代码路径本身，而在用户那台机器当时 iframe 的启动被拖慢。
4. **复现签名**：用 CDP 把 iframe 的导航延后 7 秒（主线程保持空闲）后，修复前得到 `home-ready-timeout 4007 ms` 加一个小窗，与真实日志的 4008 / 4142 ms 一致。

### 推断（没有直接观测，请按推断对待）

出问题期间机器的内存与 I/O 压力很大：swap 已用约 14.0 / 15.4 GB、空闲页只有约 60 MB、一个无关的 `rg` 占用约 10 个核心并以每秒 1 GB 以上读盘，公司安全代理 `QzhddrSrv`（约 115% CPU）和 `CorpLinkExtension`（约 46%）处在文件访问路径上。这与第一轮实测的“Chrome 访问扩展目录约 0.12 毫秒 / 文件”是同一个机制：iframe 要现读 `assistant.html`、约 12 个脚本和样式，I/O 拥塞或被换页时可以晚到数秒，而常驻内存的首页响应依然正常。“离开一会儿再回来”也符合：渲染进程的内存被压缩或换出，唤醒要付出代价。小窗要读的是同一批文件，所以改开小窗并不会更快。

没有直接测到用户机器上 iframe 的 `load` 时间，所以下面加了诊断，下次出现时能直接区分。

### 修改

| 位置 | 改动 |
| --- | --- |
| `js/assistant-overlay.js`（`index.html` 版本 `?v=9`） | 就绪上限 `READY_MAX_MS` 由 4 秒改为 **15 秒**；加载超过 `NOTICE_DELAY_MS`（400 ms）才在原卡片位置显示一条不拦截点击的“快捷助手正在载入…”提示（`pointer-events:none`，位于 closed Shadow 树内，就绪、收起、超时都会移除；正常就绪约 100 ms，看不到它）；成功回包增加 `ready: true`（用户主动收起的回包没有）；超时回包增加 `diag`。提示在 400 ms 定时器里才创建，不改变 `[host, main, todo, frame]` 的创建顺序（有测试按此顺序取元素）。 |
| `js/assistant-background.js` | 状态探测上限 `HOME_BUSY_STATUS_MS` 4→10 秒；展示回包等待 `HOME_SHOW_MS` 5→**20 秒**，必须长于宿主的 15 秒，否则后台先放弃会出现“浮层稍后出现、小窗已经弹出”的双重界面；收起请求新增 `HOME_HIDE_MS`（5 秒，保持原值）；`assistant-popup` 记录带 `err` 诊断；新增 `assistant-slow-open` 记录。 |
| `test/assistant-overlay.test.js` | 新增宿主测试台（虚拟定时器与逐宿主的 Shadow 树）和后台慢打开用例，更新原先断言 4 秒的用例。 |

不改动：`authorize()` 的 nonce / `frameId` / 来源绑定、`opening` 串行锁、`assistant_ready` 先于数据加载的约束、预算与确认链路。

### 诊断字段与慢打开记录

- `system / assistant-popup` 的 `err`（仅 `ready-timeout` 类）形如 `wait=15002;load=none;vis=visible;focus=1`：
  - `wait`：宿主等待的毫秒数；
  - `load=none`：iframe 文档始终没加载完（文件读取慢，对应上面的推断）；`load=+N`：N 毫秒时加载完成但没发就绪（页面脚本或存储读取慢，需要另查）；
  - `vis`：标签页是否可见；`focus`：文档是否有焦点。
  - 只含时长与状态位。宿主不会写入地址、nonce 或页面文字；后台只接受这一固定格式，其余整条丢弃。
- `system / assistant-slow-open`（`ok` 为 `true`，`ctx` 为 `home` 或 `page`，`ms` 为总耗时）：输入条真的就绪了，但从按键起超过 1.5 秒。这类“慢但成功”的打开以前看不见，现在能直接数出环境变慢的频率。

排查语句（Service Worker 控制台）：

```js
chrome.storage.local.get('extEventLog').then(r => console.table((r.extEventLog || []).filter(e => ['assistant-popup', 'assistant-slow-open'].includes(e.act))))
```

### 第二轮验证（分层）

- **静态与业务替身：** `test/assistant-overlay.test.js` 31 项通过（含宿主上限 15 秒、提示 400 ms 后出现且不拦截点击、就绪与收起时清理、诊断固定格式、后台 10 / 20 秒窗口、慢打开仅在 `ready: true` 且 ≥1.5 秒时记录）。先写测试：修改前 12 项失败，原因都是预期的行为差异。**变异检查**（在 `/tmp` 副本上逐个破坏实现）：把上限改回 4 秒、不撤提示、不清定时器、回包不带 `ready` 或诊断、提示拦截点击、后台窗口改回 4 / 5 秒、诊断不做格式校验、主动收起也记慢打开、日志不带诊断，共 11 种全部被测试抓住；其中“收起时不清 400 ms 定时器”最初漏过，补了“提示出现前收起、随即再次打开”的用例后抓住（遗留的旧定时器会占用 `notice` 变量，让下一次打开不显示提示）。
- **真实 Chromium 151（Chrome for Testing，无头，经 CDP 加载本扩展；`assistant.js` 带计时探针的 `/tmp` 副本，仓库未改）：**

  | 场景 | 修复前 | 修复后 |
  | --- | --- | --- |
  | 正常打开 | 约 80–140 ms 就绪 | +142 ms 就绪，无小窗，无日志 |
  | iframe 导航延后 2 秒 | （未测） | 提示出现，+2076 ms 就绪，0 个小窗，`assistant-slow-open 2077 ms` |
  | iframe 导航延后 7 秒 | 4 秒时撤下浮层，`home-ready-timeout 4007 ms`，1 个小窗 | 提示出现，+7094 ms 就绪，0 个小窗，`assistant-slow-open 7094 ms` |
  | iframe 导航延后 20 秒（超过上限） | （同上） | 15 秒回退小窗，`home-ready-timeout 15008 ms`，`err=wait=15002;load=none;vis=visible;focus=1` |

  截图确认：载入中在原卡片位置出现磨砂提示条，就绪后是正常输入条。
- **未验证：** 用户本机的品牌版 Chrome 156、真实负载下的 iframe 加载耗时（上面的“推断”）、真实本机 AI 服务、真实账号。用户须重新加载扩展才会使用新版本。

## 第三轮：普通网页上又开出小窗，`page-overlay-unavailable` 8 ms（2026-10-14 傍晚）

### 现象与日志

16:17 前后用户再次看到独立小窗，背景是一个公司内部的表单类网页。用户贴出的 `extEventLog`（`assistant-popup` / `assistant-slow-open`）共四条：

| 本地时间 | 记录 | `ctx` | 耗时 | 说明 |
| --- | --- | --- | --- | --- |
| 15:11:19 | `assistant-popup`（false） | `home-ready-timeout` | 4008 ms | 第二轮已分析 |
| 15:25:57 | `assistant-popup`（false） | `home-ready-timeout` | 4142 ms | 第二轮已分析 |
| 16:08:17 | `assistant-slow-open`（true） | `home` | 11835 ms | 第二轮修复后：首页浮层**慢了 11.8 秒仍然成功**（旧的 4 秒窗口必然兜底成小窗）。扩展在同一分钟（16:08，`Secure Preferences` 的 `last_update_time`）重载过；**推断**这是重载后的第一次打开、文件缓存是冷的，没有直接观测 |
| 16:17:13 | `assistant-popup`（true） | `page-overlay-unavailable` | **8 ms** | 本轮要解释的小窗 |

### 结论

- **第二轮的修复有效**：此后再没有 `home-ready-timeout`；那次 11.8 秒的打开就是以前会开出小窗的情形。
- **这次是另一条路径，不是超时**：页面分支在 8 ms 内就被拒，说明是 `executeScript` 或紧随其后的 `tabs.sendMessage` 立刻抛了异常，被归入 `page-overlay-unavailable`。该记录当时没有保留报错原文，**所以无法断定那个页面属于下面哪一类**。这一轮补上了分类字段，再出现一次就能直接判定。

### 已排除的猜测（都有证据）

| 猜测 | 证据 |
| --- | --- |
| 企业策略禁止扩展在该站点运行（`ExtensionSettings` / `runtime_blocked_hosts`） | 没有找到托管策略的痕迹：`/Library/Managed Preferences/` 里没有 `com.google.Chrome.plist`，用户域 `com.google.Chrome` 里没有 `ExtensionSettings` / `ExtensionInstall*` / `URLBlocklist` / `runtime_blocked_hosts` 一类的键；两个配置的 `Preferences` 没有 `enterprise_profile_info` 与 `policy` 键，用户数据目录和 `Profile 2` 下没有 `Policy` 目录（`Default` 下只有 `Managed Extension Settings`，是 Chrome 存放扩展托管存储的目录，内容未读取）；扩展 `disable_reasons` 为 0。**这是间接证据，不等于在 `chrome://policy` 里直接核对**；若策略真的拦截，新日志会记成 `inject:policy` |
| 快捷键被设成“全局”，Chrome 不给全局命令授予 `activeTab` | `Preferences` 中 `toggle-quick-assistant` 绑定 `mac:Command+Shift+B`，`global: false` |
| 扩展重载后，旧页面里遗留的“已注入”标记让新注入直接返回、从此没有接收端 | 真实 Chromium 151，用 `chrome://extensions` 自带的 `developerPrivate.reload`（与“重新加载”按钮同一路径）重载：重载前先收起浮层、重载时浮层仍开着两种情形，重载后再次注入并展示都是 `{ok:true, ready:true}`（分别 41 / 42 ms），页面上只剩一个宿主元素 |
| 扩展自身状态异常 | Default 配置：`disable_reasons` 为 0（未被禁用；新版 Chrome 的配置里没有 `state` 字段，以它为准）、34 个主机授权已授予（`withholding_permissions: false`）、`activeTab` 在已授予的 API 里、最后更新 16:08 |

另：`Profile 2` 配置里只有这个扩展的残留条目（没有安装位置、没有主机授权、没有更新时间），两个配置都留着 `⌘⇧B` 的绑定（都是 `global: false`）；真正在用的是 Default。测试环境备注：`--load-extension` 加载的干净配置没开开发者模式，`chrome.runtime.reload()` 会让扩展以 `unsupportedDeveloperExtension` 被禁用，所以上面的重载实验先用 `developerPrivate.updateProfileConfiguration` 打开开发者模式。

### 真实 Chromium 151 逐类页面实测：发现两个真实缺陷

方法：Chrome for Testing 151（无头，经 CDP 加载 `/tmp` 里的扩展副本，仓库未改；副本的 manifest 补了 `127.0.0.1` 主机权限，代替按键带来的 `activeTab` 授权，其余相同）。**修复前**用本轮开始前的 `assistant-background.js`，加上回退了本轮四处宿主改动的 `assistant-overlay.js`（与变异检查 M1–M4 同一套精确替换）；**修复后**用当前仓库代码。每类页面先用原语（`executeScript` 注入 + `tabs.sendMessage(show)`）直接测宿主，再调用后台真实的 `quickAssistant.open()` 并读取真实写入的 `extEventLog`。原始输出存放在测试机的 `/tmp/perf-harness/results/`（不在仓库内）。

原语（展示请求）逐类结果：

| 页面类型 | 修复前 | 修复后 |
| --- | --- | --- |
| HTML、XHTML、纯文本、JSON、PNG、框架集、DOM 劫持命名（`form[name=getElementById]`）、空文档、Trusted Types、严格 CSP（`default-src 'none'; frame-src 'none'`） | 浮层就绪，40–54 ms | 浮层就绪，39–80 ms |
| PDF（无头模式下该标签页只有主框架，没有进入 PDF 查看器） | 浮层就绪，44 ms | 浮层就绪，43 ms |
| **XML、SVG 文档** | 3 ms 抛 `Uncaught TypeError: Cannot set properties of undefined (setting 'extension')`（XML 文档里 `createElement('div')` 得到的不是 HTML 元素，没有 `style` / `dataset`） | 2–3 ms 回 `{ok:false, reason:'unsupported-document'}` |
| **`Content-Security-Policy: sandbox`** | **15007 ms** 才回 `ready-timeout`，诊断 `load=+10`：iframe 10 ms 就加载完了，但页面源是 `null`，iframe 按页面源投递的就绪消息被浏览器丢弃 | 4 ms 回 `{ok:false, reason:'opaque-origin'}` |
| 错误页（连接被拒，标签页 URL 仍是原地址） | `inject` 阶段 1 ms：`Frame with ID 0 is showing error page` | 同左（Chrome 拒绝，与宿主无关） |

真实 `open()`（后台完整链路；`ms` 是 `assistant-popup` 记录里的耗时，括号内是 `open()` 调用总耗时，含创建小窗）：

| 页面类型 | 修复前 | 修复后 |
| --- | --- | --- |
| 普通 HTML / XHTML | 页内浮层（70 / 45 ms），无日志 | 页内浮层（70 / 46 ms），无日志 |
| XML / SVG | 小窗；`page-overlay-unavailable`，`ok:true`，`err` 为空；4 / 3 ms（106 / 82 ms） | 小窗；`page-unsupported-document`，`ok:true`；3 / 3 ms（102 / 89 ms） |
| CSP sandbox | 小窗；**`page-ready-timeout`，`ok:false`**，`err=wait=15002;load=+9;vis=visible;focus=1`；15009 ms（**15085 ms**） | 小窗；`page-opaque-origin`，`ok:true`；6 ms（**90 ms**） |
| 没有主机权限也没有手势授权（用 `localhost` 代替“没拿到 `activeTab`”） | 小窗；`page-overlay-unavailable`，`ok:true`，`err` 为空；3 ms（101 ms） | 小窗；`page-overlay-unavailable`，`ok:true`，`err=inject:no-access;tab=complete;disc=0;win=normal`；2 ms（95 ms） |
| 错误页（连接被拒） | 小窗；`page-overlay-unavailable`，`ok:true`，`err` 为空；2 ms（90 ms） | 小窗；`page-overlay-unavailable`，`ok:true`，`err=inject:error-page;tab=complete;disc=0;win=normal`；2 ms（85 ms） |
| PDF（无头，只有主框架） | —— | 页内浮层（83 ms），无日志 |

**关键观察：修复前，XML、SVG、无授权主机、错误页这四类的记录完全一样**——`page-overlay-unavailable`、`ok:true`、`err` 为空、个位数毫秒，正是用户那条（8 ms）的签名。所以单凭那条记录无法判断是哪一类，这也是本轮加分类字段的原因。有头真实 Chrome 里的 PDF 查看器页面**没有验证**（无头模式下 `getAllFrames` 只返回一个框架，没有查看器子框架）。

### 修改

| 位置 | 改动 |
| --- | --- |
| `js/assistant-overlay.js`（`index.html` 版本 `?v=10`） | ① 展示请求先判断页面是否适用：源为 `"null"`（沙箱文档）回 `{ok:false, reason:'opaque-origin'}`，`createElement('div')` 得不到 HTML 元素（XML / SVG 文档）回 `{ok:false, reason:'unsupported-document'}`，都在写入令牌与创建 iframe 之前立即返回；② “已初始化”标记 `__quickAssistantOverlay` 移到文件末尾，`onMessage` 监听改为最后注册——初始化中途抛异常时不再留下标记，否则这一页之后的每次注入都在第一行返回、永远没有接收端；③ 真就绪的回包带 `diag`。 |
| `js/assistant-background.js` | `open()` 拆成 `tryHome` / `tryPage`，外层兜住意料之外的异常（会话存储拒绝写入、标签页突然消失……）——此前这类异常会让 `open()` 拒绝、快捷键什么界面都没有，现在一律改开小窗并记 `overlay-error`；首页展示请求**被拒绝**（而不是无回应）时同样兜底；页面注入/展示失败按固定类别记录（下节）；新增宿主拒绝原因映射 `page-unsupported-document` / `page-opaque-origin`；`assistant-slow-open` 带宿主诊断。 |
| `test/assistant-overlay.test.js` | 宿主测试台支持 XML 文档、不透明源、初始化抛错后重新注入、监听器与 iframe 计数；新增 10 项。 |

不改动：`authorize()` 的 nonce / `frameId` / 来源绑定、`hostOrigin` 来源绑定（**没有**为了适配沙箱页面而放宽）、`opening` 串行锁、`assistant_ready` 先于数据加载的约束、预算与确认链路、`manifest.json`（没有新增权限）。

### 新的日志字段

`page-overlay-unavailable` 与 `overlay-error` 的 `err` 形如 `inject:no-access;tab=complete;disc=0;win=normal`，由固定白名单拼成，**不含报错原文、网址或标签页编号**（报错原文含这些，所以只记类别）：

| 片段 | 取值 | 含义 |
| --- | --- | --- |
| 阶段 | `inject` / `show` / `open` | 失败发生在注入、展示请求，还是外层意外异常 |
| 类别 | `no-access` | 页面不允许脚本：站点不在授权范围且没拿到 `activeTab`，或页面类型不允许（`chrome://` 等） |
| | `error-page` | 当前标签显示的是 Chrome 错误页（网络不通、内网域名没连上等）；标签页 URL 仍是原地址，所以看起来像普通网页 |
| | `webstore` / `policy` | Chrome 应用商店 / 企业策略禁止 |
| | `frame-gone` | 标签页正在导航或刚关闭，主框架已不存在 |
| | `no-receiver` | 注入成功但没有接收端：宿主脚本没跑起来（我们的问题） |
| | `host-error` | 宿主脚本抛了未捕获异常（我们的问题） |
| | `port-closed` | 页面在回包前被卸载或导航 |
| | `other` | 认不出；按失败记录，需要时再把新文案加进分类表 |
| `tab=` | `loading` / `complete` / `unloaded` / `unknown` | 按键时标签页状态（`loading` 提示导航竞态） |
| `disc=` | `0` / `1` | 标签页是否被 Chrome 丢弃 |
| `win=` | `normal` / `popup` / `app` / `devtools` / `app_popup` / `unknown` | 所在窗口类型（`app` 即 PWA / 应用窗口）；查询最多等 1 秒 |

`ok`：`no-access` / `error-page` / `webstore` / `policy` / `frame-gone` 记 `true`（页面本身不允许或已不存在，预期兜底）；`no-receiver` / `host-error` / `port-closed` / `other` 与 `overlay-error` 记 `false`（“本该用浮层却开了小窗”）。`assistant-slow-open` 的 `err` 现在带宿主就绪时的诊断（格式同第二轮，如 `wait=11200;load=+10900;vis=visible;focus=1`，数值仅作示意）：`wait` 是展示到就绪的耗时；`load=+N` 与 `wait` 接近，说明就绪紧跟在 iframe 加载完成之后，时间花在 iframe 文档与脚本的读取上；`load=none` 在**成功**记录里也会正常出现——`assistant_ready` 在输入条渲染后立即发出，不等 iframe 的 `load` 事件（原语矩阵里就有 `wait=40;load=none`），这时只按 `wait` 本身判断，不要把它当成故障。

### 没有做的事（以及为什么）

- **没有对失败重试**：导航提交会清除 `activeTab` 授权，重试几乎必然得到 `no-access`；也没有证据表明存在“重试就能成功”的类别。等日志里出现 `frame-gone` / `tab=loading` 的记录再评估。
- **没有申请 `<all_urls>`**：那会把权限从 34 个站点扩大到所有网站，只为覆盖“没拿到 `activeTab`”的假设；按键触发时 `activeTab` 本来就够用，除非日志证明不够。
- **没有为沙箱页面放宽 `hostOrigin`**：那会削弱 iframe 与宿主之间按来源绑定的消息校验。
- **未实施的备选：** 用 `chrome.sidePanel` 承载助手，可覆盖所有受限页面（不需要注入）。这是一个独立的界面设计，用户没有要求，没有做。

### 第三轮验证（分层）

- **静态：** `node --check`（`js/assistant-overlay.js`、`js/assistant-background.js`、`js/assistant.js`、`js/background.js`）通过；`git diff --check` 通过（本文档是未跟踪文件，另用 `rg " +$"` 查尾随空白，没有）。
- **业务替身（VM 测试台）：** `test/assistant-overlay.test.js` 41 项通过（第二轮是 31 项，本轮新增 10 项）；全量 `node --test test/*.test.js test/*.test.mjs`（139 个文件）1534 / 1534。把本轮代码回退（后台脚本用本轮开始前的备份，宿主脚本回退四处改动）而保留新测试时：**41 项里 10 项失败（正是新增的 10 项），31 项旧测试仍通过**，说明新测试确实在约束本轮行为。**变异检查**（`/tmp` 副本，逐个破坏当前实现）14 种全部被抓住：去掉沙箱早退、去掉 XML 早退、标记改回开头、监听提前注册、回包不带诊断、分类器恒为 `other`、注入失败一律算预期、宿主拒绝原因不映射、首页展示不兜底拒绝、外层不兜底异常、慢打开不带诊断、窗口查询不设上限、窗口类型不过白名单、日志写入报错原文。
- **真实 Chromium 151（Chrome for Testing，无头，经 CDP；扩展为 `/tmp` 副本，仓库只读）：** 上面两张表（15 类页面的原语测试、7 类页面的真实 `open()` 前后对照、PDF 单独核对）；两种重载情形的实验（重载后再次注入并展示分别 41 / 42 ms，页面只剩一个宿主元素）。
- **用户机器与配置（只读、只取本扩展的字段与数量，没有复制配置文件）：** 没有找到托管策略的痕迹（间接证据）、快捷键作用域为 `global: false`、扩展未被禁用与授权数量摘要、日志时间戳换算。
- **未验证：** 品牌版 Chrome 156 上的真实按键与真实 `activeTab` 授权；**16:17 那条记录对应页面的真实原因**（仍未知，等新日志）；有头真实 Chrome 的 PDF 查看器页面；应用窗口（PWA）里的行为；真实本机 AI 服务与真实账号（本轮改动不涉及）。用户须重新加载扩展并刷新首页才会使用新版本。

## 边界与注意

- `assistant_ready` 不能再挪到数据加载之后；以后给输入条增加新的异步初始化，也要放在发信号之后。
- 宿主的 15 秒是“输入条就绪”窗口，不是任务时限；它不影响任务的 12 轮 / 12 工具 / 5 分钟预算。不得缩回 4–5 秒；`HOME_SHOW_MS` 必须长于宿主上限。
- 15 秒也不是保证：负载极端时仍会回退小窗，此时看 `err` 里的 `load=`。如果日志显示 `load=none` 占多数，说明瓶颈是 iframe 的文件读取，下一步才值得考虑合并 `assistant.html` 的 12 个脚本或预热，这次没有做（改动面大，且没有直接证据）。
- 等待期间再按一次快捷键不会收起（`opening` 串行锁会吞掉它）；点击页面其他位置会收起（原有行为）。慢加载时用户在看到提示的同时无法用快捷键取消。
- 载入提示放在宿主 Shadow 树的最上层。iframe 的 HTML/CSS 先绘出、脚本还没跑完时（慢环境里“卡片壳已出现、占位文字还在”的状态），提示条会压在半透明的卡片上，略有叠影；放在 iframe 下面会透过半透明卡片出现重影，所以保持在上层。这个状态下输入框已经可见，但回车提交要等脚本就绪。
- 网页分支（`chrome.tabs.sendMessage` 展示请求）没有后台侧的超时，依赖宿主在 15 秒内一定回包（就绪或超时）；首页分支有后台侧的 20 秒。目标标签页是前台活动页，不会被冻结，所以没有为它另加超时；如果以后要加，须新增一个 `page-show-no-reply` 原因并同步测试与上表。
- 网页分支的真实 Chromium 验证用的是：本地 `http://127.0.0.1` 普通页面、在 Service Worker 里按 `open()` 网页分支的步骤（`executeScript` 注入宿主脚本、`tabs.sendMessage` 展示）操作、精简副本的 manifest 里补了 `127.0.0.1` 的主机权限（用来替代真实按键带来的 `activeTab` 授权）。回包为 `{ok:true, ready:true}`：正常 134 ms，iframe 脚本被人为卡住 2.5 秒时 2595 ms，均无小窗。`open()` 本身对网页分支的判断由单元测试覆盖，没有在真实浏览器里按真实快捷键走完。
- 真实场景里仍可能出现 `ctx` 为 `home-no-document` 的记录：安装了接管新标签页的其他扩展，或扩展刚重新加载后仍停留在旧页面。后者刷新页面即可。
- 沙箱页面（源为 `null`）与 XML / SVG 文档不能放页内浮层，改开小窗是预期行为，不要为它们放宽来源校验或在宿主里硬塞 HTML 元素；以后新增页面类型的判断也放在宿主“展示请求”的最前面、写入任何状态之前，并给出明确 `reason`。
- “已初始化”标记必须留在宿主脚本末尾、监听最后注册；以后往脚本中间加初始化步骤，不能再把标记挪回开头（会让一次失败变成这一页永久没有接收端）。
- `page-overlay-unavailable` 的 `err` 只能由固定白名单拼出；新增类别要同时改分类表、`EXPECTED_KINDS` 与测试，不得把报错原文写进日志。
- 排查方法（没有界面入口）：打开 `chrome://extensions`，点本扩展的 “Service Worker” 打开控制台，执行下面的语句，按 `ctx` 对照上表；`ok` 为 `false` 的才是“本该用浮层却开了小窗”。

```js
chrome.storage.local.get('extEventLog').then(r => console.table((r.extEventLog || []).filter(e => e.act === 'assistant-popup')))
```
