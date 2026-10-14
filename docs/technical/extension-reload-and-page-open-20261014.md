---
title: "扩展重新加载与首页打开提速：目录扫描根因、uv 缓存与 Laya 环境外移、壁纸陈旧可用与预热、Font Awesome 本地化"
type: technical
status: active
version: "1.1"
created: "2026-10-14"
updated: "2026-10-14"
author: "Cursor Agent"
app-version: "3.16.0"
tags: [性能, 重新加载, 扩展目录, uv-cache, Laya, 虚拟环境, 首页壁纸, 预热, stale-while-revalidate, Font Awesome, vendor]
related:
  - docs/technical/assistant-quick-overlay-ready-20261014.md
  - docs/technical/local-model-management-20260924.md
  - vendor/VENDOR.lock.md
changelog:
  - date: "2026-10-14"
    desc: "初始创建：重新加载慢的实测与根因、uv-cache 外移、符号链接实验、首页壁纸与 Font Awesome 的优化与实测、未决的结构性方案"
  - date: "2026-10-14"
    desc: "按用户决定外移 Laya 的 Python 环境（models.mjs 增加 LAYA_VENV_DIR 与扩展目录内警告，新增 test/local-ai-laya-runtime-paths.test.mjs），重载降到约 4.0 秒；记录迁移验证、启动耗时对照与剩余方案"
---

# 扩展重新加载与首页打开提速

日期：2026-10-14

## 结论

- **重新加载慢的根因已用实测证实：Chrome 每次加载 / 重新加载未打包扩展，都会递归枚举整个扩展目录里的每一个文件。** 本仓库根目录就是扩展目录，里面除了扩展自己的约 260 个文件，还有本机 AI 运行环境和各处 `node_modules`，共 7 万多个文件。同一台机器上，精简目录重载约 0.15 秒，整个仓库根目录曾需 11–20 秒。
- **已做（可逆）两步外移：** ① 把 `uv` 下载缓存（20,865 个文件、731 MB）移到扩展目录之外，重载由 11.0 / 20.1 / 13.4 秒降到 6.3–6.6 秒；② 按用户决定把 Laya 的 Python 环境（约 2.3 万个文件、765 MB）也移出，重载再降到 **3.85 / 4.02 / 4.10 秒**，扩展目录文件数从 72,770 降到 28,800。
- **剩余：** StepAudio 朗读环境（4,289 个文件）估计再省约 0.5 秒，各 `node_modules`（约 2.2 万个）基本移不出去，见“尚未做的结构性方案”。
- **首页打开慢**不在 JS，而在“背景一片黑，等壁纸下载”。已让壁纸提前缓存、列表先用上次结果再后台刷新、列表构建有等待上限。常规打开从 0.8–1.2 秒出图降到约 0.25 秒。**第一次冷启动（没有任何缓存）没有变化，约 5–6 秒。**
- Font Awesome 改为本地副本：**稳态下没有可测的首屏提速**（CDN 样式本来就命中 HTTP 缓存），收益是冷缓存 / 离线 / CDN 不可达时不再阻塞首次渲染。

## 一、重新加载慢

### 根因

Chrome 在加载未打包扩展（含点击“重新加载”和浏览器启动时恢复扩展）时，校验阶段会无条件递归遍历扩展目录查找私钥文件（`.pem`），没有关闭开关。遍历的开销主要是枚举每个文件；只有 `.pem` 才会被读取内容。所以**重载耗时与目录里的文件总数成正比，与这些文件是否属于扩展无关**。

### 实测（Chrome for Testing 151，无头，全新 profile，开发者模式；脚本调用 `developerPrivate.reload()` 直到扩展重新变为 ENABLED；每组三次，同一台机器顺序测量）

| 扩展目录 | 文件数 | 重新加载（毫秒） | 浏览器调试端口就绪（毫秒） |
| --- | ---: | --- | ---: |
| 精简副本（只含扩展自身文件） | 261 | 161 / 152 / 127 | 1,960 |
| 精简副本 + 一个符号链接指向 `local-ai/node_modules` | 261 + 13,755 | 2,045 / 2,105 / 1,635 | 2,984 |
| 仓库根目录（含 `uv-cache`） | 72,770 | 10,997 / 20,086 / 13,420 | 18,393 |
| 仓库根目录（`uv-cache` 已外移） | 51,905 | 6,378 / 6,594 / 6,256 | 7,364 |
| 仓库根目录（再外移 Laya 环境，**现状**） | 28,800 | 3,849 / 4,021 / 4,097 | 5,172 |

- 单文件开销约 0.12–0.14 毫秒：符号链接组 `(1,928 − 147) ms ÷ 13,755 ≈ 0.13`，`uv-cache` 外移后 `(6.4 − 0.15) s ÷ 51.6k ≈ 0.12`，现状 `(4.0 − 0.15) s ÷ 28.5k ≈ 0.135`。外移 Laya 前我按 0.12 估计会降到约 3.6 秒，实测 3.85–4.10 秒，估算略乐观。
- `uv-cache` 的 2 万个文件按这个单价只应占 2.5 秒，实测差 7 秒（中位数），而且“放回去”的三次波动很大（11.0–20.1 秒）。多出来的部分原因没有单独验证；样本只有各三次，数字是量级证据，不是精确基准。
- “调试端口就绪”包含浏览器启动时对扩展目录的同一次校验：文件多时，浏览器启动后扩展可用也会晚几秒到十几秒。

### 不能走的路（已验证或有约束）

- **符号链接不能绕过扫描。** 上表第二行：目录里只放一个指向大目录的符号链接，重载仍多出 1.6–2.1 秒，说明扫描会跟进符号链接。所以“把大目录移走，原位留一个链接”没有收益。
- **不能换成一个精简的构建目录来加载。** 扩展 ID（`ipcgchgohpjheedlgfkcjlhhfbdljefo`）由加载目录的路径决定（manifest 没有 `key`），它绑定了 YouTube OAuth 授权、Native Messaging 的 `allowed_origins` 和全部 `chrome.storage` 数据。换目录等于换扩展。
- 没有找到可用于排除目录的机制（这是对 Chromium 行为的了解，没有逐版本核对源码）。

### 本次改动：`uv` 缓存外移

- `local-ai/.local/uv-cache` → `~/Library/Caches/chrome-time-background/uv-cache`（同卷改名，瞬时完成；`local-ai/.local/` 在 `.gitignore` 中，Git 无变化）。
- 事先确认：仓库里没有代码引用该路径（只有 `docs/technical/local-model-management-20260924.md` 的恢复命令，已同步改为新位置）；当时运行的 `uv` 进程是全局 MCP 的，不引用本仓库。
- 缓存可再生，缺失时 `uv` 会重新下载；**不要再放回 `local-ai/.local/` 下**。以后新增任何缓存、虚拟环境、下载物、`node_modules`，先评估文件数。
- 还原命令（如需放回）：`mv "$HOME/Library/Caches/chrome-time-background/uv-cache" <仓库>/local-ai/.local/uv-cache`。

### 本次改动：Laya 的 Python 环境外移（用户确认，2026-10-14）

- **改的只有环境本身，不动令牌、日志和启动配置。** `local-ai/.local/laya-runtime/` 里 99.99% 的文件都是 `.venv`；令牌、日志、`laya.plist` 只有 4 个小文件，仍留在原处，所以 `laya-prefetch-provider.mjs` 读取令牌的路径、守护项的日志路径都不变。
- **代码（唯一的改动文件：`local-ai/scripts/models.mjs`）：** 环境位置改为 `VENV = LAYA_VENV_DIR || ~/.local/share/chrome-time-background/laya-venv`（支持 `~/` 开头；默认路径不含空格，避免脚本 shebang 出问题）。`PYTHON` 由它派生，所以 `verify`、`download`、`start` 以及生成的 launchd 配置（`ProgramArguments`）自动用新位置。三处重复的“缺少环境”检查合并为 `requirePython()`，报错现在带实际路径和 `UV_PROJECT_ENVIRONMENT` 提示；`help` 多打印一行环境位置；环境位于扩展目录内时 `help` / `laya` 子命令打印警告（只警告，不阻止）。
- **测试先行：** `test/local-ai-laya-runtime-paths.test.mjs` 4 个，用真实子进程（假的 `HOME`；只跑无副作用的 `help` 和缺环境时就报错退出的 `verify`，不碰 launchctl、令牌或真实环境）验证默认位置在扩展目录之外、`LAYA_VENV_DIR` 与 `~/` 展开、扩展目录内的警告、缺环境时的报错内容。先看到它们因“功能缺失”失败，再写实现。
- **迁移步骤：** 确认守护项未加载、`19085` 未监听 → 用文档里的官方恢复命令在新位置重建（`uv sync --locked --offline`，只用已外移的缓存，1 秒）→ 与旧环境逐包对照 → `verify` → 真实启动测试 → 停止 → 把旧的树内环境**同卷改名**到 `~/Library/Caches/chrome-time-background/laya-venv-in-tree-backup`（备份，确认无问题后可删；回滚只需 `mv` 回 `local-ai/.local/laya-runtime/.venv` 并取消新环境）。
- **迁移后的真实验证（Laya 的 CPU 本机服务，只用固定测试句，未触碰业务数据）：** 新旧环境各 43 个包，包名与版本完全一致，同为 Python 3.12.13；`verify` 通过（5 个文件、678,201,636 字节、revision `aa8c91ca…`）；`start` 生成的启动配置指向新位置的解释器；`test` 对“把开会提醒延后十分钟”判为 `update`，confidence 0.946；结束后已 `stop`，守护项卸载、`19085` 无监听、无遗留进程，与迁移前状态相同。
- **启动耗时（与迁移无关，但值得知道）：** 新环境没有字节码缓存，重建后的**第一次**启动要现编译约 2,300 个 `.pyc`，约 70 秒才就绪；之后的热启动约 35 秒。用旧的树内环境做同条件对照，`start` 同样在 35 秒的等待上限处提示“未就绪”，所以这是这台机器加载模型的固有耗时，`start` 的 35 秒上限本来就在边缘。遇到“未就绪”先用 `status` 复查，**不要立刻 `restart`**。

### 现状分布（28,800 个文件）

| 目录 | 文件数 | 体积 | 说明 |
| --- | ---: | ---: | --- |
| `local-ai/node_modules` | 13,755 | 441 MB | 本机 AI 服务依赖（pi SDK、QuickJS 沙箱等） |
| `cursor-bridge/node_modules` | 5,261 | 79 MB | 独立服务 `cursor-bridge/` 的依赖 |
| `local-ai/.local/stepaudio-runtime` | 4,289 | 335 MB | StepAudio 朗读的独立 Python 环境 |
| `integrations/youtube-home/node_modules` | 2,498 | 37 MB | 仅重建 `vendor/youtube-home/page.js` 时需要 |
| 根目录 `node_modules` | 773 | 23 MB | |
| `.git` | 296 | 384 MB | 对象已打包，文件数很少 |
| 其余（扩展自身、文档、测试等） | 约 1,900 | | |

已不在扩展目录内：`uv` 缓存（`~/Library/Caches/chrome-time-background/uv-cache`）、Laya 环境（`~/.local/share/chrome-time-background/laya-venv`）、旧环境备份（`~/Library/Caches/chrome-time-background/laya-venv-in-tree-backup`）。

### 尚未做的结构性方案（需要决定，未经确认不动运行环境）

按单价 0.13 毫秒估算（估算值，不是实测，Laya 这一步的实测证明估算略乐观）：

| 方案 | 外移文件数 | 预计重载 | 代价与风险 |
| --- | ---: | ---: | --- |
| A. 外移 `stepaudio-runtime` | 4,289 | 约 3.4 秒（省约 0.5 秒） | 语音朗读日常在用；`speech-synthesis-provider.mjs`（已有 `LOCAL_AI_TTS_PYTHON` 可改解释器）等路径要改为可配置，同样要用锁文件重建环境并重启本机服务，朗读功能在迁移期间不可用。收益小，风险大于 Laya。 |
| B. 再清理 `integrations/youtube-home/node_modules`（用时 `npm ci`） | 2,498 | 再省约 0.3 秒 | 只在重建 YouTube 首页推荐 bundle 时需要。 |
| C. 外移各服务的 `node_modules` | 约 2.2 万 | 理论上再省约 2.8 秒 | **基本不可行**：Node 按源码所在目录向上查找依赖，符号链接又会被扫描；要么把服务源码一并移出仓库根，要么重构仓库结构。 |

## 二、首页打开慢

### 测量与根因

- 方法：Chrome for Testing 151 + CDP，加载 `chrome-extension://<id>/index.html`；记录壁纸列表就绪、图片完成、是否来自磁盘缓存。
- 界面本身很快：`DOMContentLoaded` 约 210–240 毫秒，`FCP` 约 200–220 毫秒，脚本耗时可以忽略。
- 慢在背景：壁纸列表来自 Service Worker 的 `getBackgrounds`（Wikimedia Commons 三次串行 API，Bing 一次），12 小时 TTL 的缓存过期后同步重建需要约 5 秒；之后每次页面随机挑一张图片才开始下载，常规 0.8–1.2 秒期间背景是纯黑。网络请求被挂起时，旧代码在这条路径上没有等待上限，实测 12 秒观察窗口内壁纸始终没有出现。

### 改动

1. **列表“陈旧可用”（stale-while-revalidate）**，`js/background-provider.js`：
   - 构建好的合并结果写入 `chrome.storage.local` 的 `bgMergedResultV1`（只存壁纸项；设置指纹用 SHA-256 摘要，**API Key 只参与摘要，不落盘**）。
   - 命中且在 30 分钟内直接用；超过 30 分钟仍立即返回，并在后台刷新；最长保留 7 天，更旧才同步重建。
   - 读取时仍按当前设置重新过滤（`filterAllowedBackgrounds`、媒体模式），所以区域限制和模式切换对旧结果同样生效；设置变化会使旧结果失效。
   - 同一设置并发重建合并为一次；刷新失败保留旧结果，5 分钟内不重复尝试；首次构建 / 过期重建最多等 10 秒，超时先返回内置回退壁纸，构建继续并写入结果；超过 60 秒仍未完成的构建视为卡死，新请求会另起一次。
   - 只有 `source === 'multi'` 的结果才记忆；`getBackgrounds` 返回结构、`js/background.js` 里的消息处理、导出列表都不变；Wikimedia 请求仍然串行（遵守其 API 使用礼仪，不并行化）。
2. **预热下一张**，新增 `js/background-warm.js`（在 `index.html` 中位于 `main.js` 之前）：
   - 当前壁纸显示后，用 `Image()` 把最多 2 张候选预取进**浏览器 HTTP 缓存**（不新增权限、不存图片数据），`localStorage` 的 `bgWarmV1` 只记 URL 与时间（最多 6 条、24 小时过期）。
   - 下次选壁纸优先从“已预热且仍在列表里”的 URL 里挑；选中即移出记录；只预热 https 静态图，不预热视频；页面不可见或数据节省模式下不预热；失败不记录，也不影响显示。
   - 缓存是否保留由浏览器决定，所以这是加速手段，不是保证。
3. **Font Awesome 本地化**：`index.html`、`settings.html`、`tasks.html`、`alarm-ring.html` 改用 `vendor/fontawesome/css/all.min.css`（6.0.0，与 CDN 字节一致，随附 `LICENSE.txt`，只带 woff2 字体）；校验和与升级步骤在 `vendor/VENDOR.lock.md`。`uninstall.html` 仍用 cdnjs 的 6.4.0，不属于首页链路，未改。

### 实测（Chromium 151，同一台机器与网络；每次打开观察 12 秒，记录列表就绪与壁纸图片加载完成的时间）

| 场景 | 优化前 | 优化后 |
| --- | --- | --- |
| 常规打开（列表缓存有效） | 图片 0.78 / 1.14 / 1.17 / 1.25 秒（随机挑的图尚未缓存；另有一次恰好是已缓存的图，0.22 秒） | 连续 6 次 0.23–0.27 秒，全部命中缓存，每次图片不同 |
| 列表缓存过期后的第一次打开 | 列表 5.0 秒、图片 6.9 秒 | 列表 0.41 秒、图片 0.41 秒（先用旧列表，后台刷新） |
| 网络请求被挂起，且缓存已过期 | 12 秒内列表与壁纸都没有出现，背景全黑 | 0.25 秒出图（用 13 小时前的旧结果） |
| 第一次冷启动（没有列表与缓存） | 列表 5.1–5.3 秒、图片 7.8–8.6 秒（3 次） | 列表 5.0–5.2 秒、图片 5.5–8.9 秒（3 次），没有变化：串行 API 的固有成本，图片时间取决于被选中图片的下载速度 |

Font Awesome：本地与 CDN 的 `FCP` 中位数分别约 220 与 200 毫秒，CDN 额外注入 0.8 / 3 秒延迟也不影响（样式已命中 HTTP 缓存），所以**不要把它写成稳态提速**。

## 验证（分层）

- **静态 / 业务替身：** `test/background-warm.test.js`（18 个：预热模块、对 `main.js` 背景系统源码的切片测试、`index.html` 脚本顺序合同）；`test/background-provider-swr.test.js`（13 个：在 `vm` 中加载真实的 provider 代码，内存版 `chrome.storage`、可控时钟与定时器、可挂起 / 可失败的 `fetch`，覆盖首次构建、新鲜命中、过期返回旧结果并只刷新一次、刷新失败保留旧结果与 5 分钟间隔、超过 7 天同步重建、设置变化失效、区域过滤、并发首次构建、10 秒上限回退与稍后写入、60 秒卡死替换、无来源、记忆损坏）。**灵敏度检查：** 把这 13 个用例对准 `git show HEAD:js/background-provider.js` 的旧版 provider 运行（只在 `/tmp` 里，每个用例限时 4 秒），9 个不通过——6 个失败、3 个等待超时（并发只刷新一次、10 秒上限回退、60 秒卡死替换，旧版没有这些行为）；通过的 4 个（结果还新直接返回、超过 7 天重建、无来源返回兜底、损坏记忆被忽略）本来就是新旧都成立的不变量，用作回归保护。新版 13/13 通过。`test/poetry-v5-contract.test.js` 的 `main.js` 版本合同同步为 `v=15`；`test/console-resilience.test.js` 里旧的 `youtube-controller.js?v=16` 固定值改为 `v=17`（与 `index.html` 及另外两个合同测试一致，这是此前未提交的 YouTube 工作留下的旧值，与本次改动无关，经用户确认顺手修正）；`test/local-ai-laya-runtime-paths.test.mjs`（4 个，见上文）。
- **真实 Chromium 151（无头，经 CDP）：** 上文所有表格；网络卡住用 CDP `Fetch` 在 Service Worker 上挂起请求；缓存过期用 Service Worker 内的 `chrome.storage.local.set` 改写时间戳。最终用仓库根目录本身加载，冒烟了 `index`、`settings`、`tasks`、`alarm-ring`、`assistant` 五个页面：图标字体都从本地加载，没有 cdnjs 请求。
- **真实本机服务（Laya，CPU，只用固定测试句）：** 迁移后的 `verify`、`start`、`status`、`test`、`stop`，结果见“本次改动：Laya 的 Python 环境外移”。
- **未验证：** 你本机的品牌版 Chrome 156 与真实配置；真实重载耗时会受其他扩展、系统负载和文件系统缓存状态影响，上面的数字只证明方向与量级；浏览器 HTTP 缓存在真实使用中的保留时长；真实账号；Laya 预加载建议链在工作台里的端到端表现（该开关默认关闭，本次只验证了服务本身）。

## 边界与注意

- 修改只涉及页面与脚本时，刷新页面或重新加载扩展即可生效；重新加载现在仍要枚举约 2.9 万个文件（约 4 秒），其中约 2.2 万个是各服务的 `node_modules`，基本移不出去。以后新增任何缓存、虚拟环境、下载物或大型依赖目录，先评估文件数，不要放进仓库根目录。
- 扩展目录内的 Laya 环境不得恢复：`models.mjs` 会打印警告；`LAYA_VENV_DIR` 只能指向扩展目录之外。旧环境备份 `~/Library/Caches/chrome-time-background/laya-venv-in-tree-backup`（约 765 MB）确认无问题后可删：`rm -rf "$HOME/Library/Caches/chrome-time-background/laya-venv-in-tree-backup"`。
- 壁纸列表缓存键：`bgMergedResultV1`（`chrome.storage.local`）、`bgProvider_*`（各来源，12 小时 TTL，原有）、`bgWarmV1`（页面 `localStorage`）。清除这些键即可强制重建。
- 预热不得改成并行请求 Wikimedia API，也不得把预热做成会在后台持续循环的任务；视频壁纸、省电暂停逻辑（`docs/technical/video-background-suspension-20260927.md`）保持原样。
- 新增脚本或样式放进首页时，要同步 `test/background-warm.test.js` 中的顺序合同和 `main.js` 的版本号。
- 同一机制（每个扩展文件的读取成本，在内存换页、I/O 拥塞或安全代理介入时会放大）也会让快捷助手的 iframe 晚到数秒；这类“慢但成功”的打开现在会记录为 `system/assistant-slow-open`，超过 15 秒才回退小窗，详见 [快捷助手页内浮层被误判失败后改开独立小窗](assistant-quick-overlay-ready-20261014.md) 的“第二轮”。
