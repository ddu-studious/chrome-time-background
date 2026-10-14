---
title: "AI 工作台“临时写代码 / 自主编写工具”可行性调研"
type: research
status: completed
version: "1.1"
created: "2026-10-12"
updated: "2026-10-12"
author: "AI 助手（调研，无业务实现）"
tags: [AI工作台, 工具合同, 代码执行, 沙箱, pi, MV3, Chrome Web Store]
related:
  - docs/technical/assistant-todo-protocol-20261008.md
  - docs/technical/assistant-approval-pi-20260919.md
  - docs/technical/assistant-context-compaction-pi-20260919.md
  - docs/technical/assistant-compute-sandbox-20261012.md
changelog:
  - date: "2026-10-12"
    desc: "初始创建：核对 pi 0.85.1 公开 API、MV3/CWS 约束、Node/QuickJS/isolated-vm 沙箱文档，给出分阶段建议与验收门槛；本调研不修改任何业务实现"
  - date: "2026-10-12"
    desc: "v1.1：用户确认不上架 Chrome Web Store、接受每个任务多 1–2 分钟；A 档（只读无 I/O 纯计算）已实现为默认关闭的 compute.run，见 docs/technical/assistant-compute-sandbox-20261012.md。B 档与 C 档仍不做。正文保留调研时的原文，实施状态见第 1 节前的“实施状态”"
---

# AI 工作台“临时写代码 / 自主编写工具”可行性调研

## 实施状态（2026-10-12 更新）

- **A 档已实现**：`compute.run`，默认关闭的只读无 I/O 纯计算工具；实现、与本文 §6 草案的差异、验证与边界见 [`docs/technical/assistant-compute-sandbox-20261012.md`](../technical/assistant-compute-sandbox-20261012.md)。本文以下各节保留调研当时的原文（“先不做实现”等表述是当时的结论）。
- **B 档（代码调用业务工具）、C 档（持久化自写工具）仍不做。**
- 用户对 §10 的回答：① 扩展**不会上架** Chrome Web Store；② 能接受只读计算每个任务多约 1–2 分钟，更看重主动性与能力；③ 没有先做缺口指标，直接先打通能力。
- 与 §6 草案的有意差异：`inputRefs` 放宽到 6 个、输入合计 ≤40 KB；`compute.run` 可作为纯分析待办的完成条件（草案只允许作前置，会让纯分析任务永远无法 `done`），含动作原文仍必须另设动作目标。
- §7 验收门槛的结果（安全对抗用例、业务替身、真实 Qwen 成功率与额外耗时、证据分层）见技术文档“验证”与“真实本机模型评测”，其中**真实 Chrome 扩展与真实账号尚未验收**。

## 1. 结论（先给答案）

| 问题 | 结论 | 证据等级 |
|------|------|----------|
| 能不能让助手在没有合适工具时**临时写代码**并运行？ | **能，但只建议做“只读、无 I/O 的纯计算”这一档**，放在本机 AI 服务里、用强隔离运行，默认关闭。 | 设计结论（来自下方已核对的约束），未做原型 |
| 能不能让助手**自主编写并保存新工具**（带副作用、自己登记权限）？ | **不建议**。工具目录就是本项目的权限、回执、版本和 unknown 边界，不能由模型自己扩权。 | 项目合同（代码）+ 约束推导 |
| pi（已集成的 `@earendil-works/pi-coding-agent@0.85.1`）能直接实现吗？ | **不能直接实现。** pi 的“自我扩展”是模型写 TypeScript 扩展文件、以进程同权限运行；官方明确“没有内置沙箱”。本项目目前只使用它的三个库级能力（摘要/序列化/工具调用拦截），没有使用 AgentSession、扩展加载器或内置 bash/write 工具。 | 本机已安装包源码与文档（已核对） |
| 能在 Chrome 扩展页里直接 `eval` / 内嵌解释器吗？ | **不行或高风险。** MV3 扩展页 CSP 不允许 `unsafe-eval`；内嵌 WASM 解释器执行运行时代码，落在 Chrome Web Store 明确列出的违规项。 | 官方文档（已抓取） |
| 现在要做吗？ | **先不做实现。** 今天已把“推荐歌曲”这类固定工具内可解的路径修好；本机 4 天历史里的 3 次失败全是 Todo 协议/分析阶段问题，没有一次是“缺工具”（样本很小，见 §3.3）。是否投入沙箱，取决于能否先证明“固定工具确实频繁成为瓶颈”。 | 本机历史（已核对，样本小） |

一句话建议：**对已知缺口优先补专用工具（低风险、可验收）；若仍有大量“纯数据变换”缺口，再做一个默认关闭的只读计算工具原型，并按 §7 的门槛决定是否转正。** 不做“持久化自写工具”，也不让代码直接调用业务工具。

## 2. 先把“需求”拆成三档

| 档位 | 含义 | 例子 | 副作用 | 建议 |
|------|------|------|--------|------|
| A. 临时计算 | 模型写一小段无 I/O 的代码，对**已读取的回执数据**做过滤、排序、去重、统计、格式化、日期/时长计算，只返回 JSON | 把搜索结果按“曲数/关键词”打分排序；计算几个提醒之间的间隔；从多段文字里抽出数字 | 无 | **可做原型**（§6、§7） |
| B. 代码编排已有工具 | 代码里直接调用 `music.queue.apply` 等业务工具 | “循环读取每页队列，凡含某歌手就删除” | 有 | **不做**：绕开 Engine 的逐步回执、版本、确认、`sideEffectStarted`/unknown 边界 |
| C. 自主生成并保存新工具 | 模型写出新工具定义/扩展，登记进目录，以后反复调用 | “以后我说‘整理歌单’就用你刚写的工具” | 有 | **不做**：目录本身是权限边界，模型不能自行扩权 |

## 3. 现状：为什么现在是“固定工具”，以及它到底卡在哪

### 3.1 固定是有意设计

- 模型输出只是待校验计划：`js/assistant-contract.js:183` 对不在登记表里的工具直接抛“助手选择了未接入的工具”。
- Todo 目标的完成条件必须来自完成条件目录（`js/assistant-todo.js` 的 `definitions()`，由 `Contract.tools` 投影，`assistant-service.mjs` 的 `completionCatalog`）。
- 执行器拥有回执、版本、确认和 unknown：丢失写回执只能查询核对，不能自动重做。
- 每个任务有 12 轮规划 / 12 次工具 / 5 分钟的硬边界（`js/assistant-engine.js` 的 `recover()` 与 `nextPlan()`）。

所以“固定工具”不只是功能限制，它同时提供了**可验收的完成语义**。任何“临时代码”方案都必须保住这些语义，而不是绕过。

### 3.2 现有的逃生口

- `tools.load`：只能加载**已登记**的工具组说明，不能创造新能力。
- `question`：说明阻碍并让用户补充。
- 个别场景有专用服务（例如 `music.recommend` 场景和 `local-ai/music-recommend-service.mjs`，目前仅在 `js/music-assistant.js` 使用，没有接进工作台）。

### 3.3 “缺口有多大”：目前的样本里没有出现“缺工具”

本机 `local-ai/.local/history.json` 已开启正文留存（`captureContent: true`，保留 7 天）。2026-10-08 至 10-12 的 4 天窗口里共 9 个会话、11 次完成，非成功结局如下（只统计原因类别，不引用请求原文）：

| 结局 | 次数 | 原因类别 |
|------|------|----------|
| 失败 | 3 | 全部是 Todo 协议/分析阶段错误：验收参数无效（1）、项目格式无效（1）、空清单后重复失败（1，即今天的“推荐歌曲”） |
| 追问 | 3 | 2 次是搜索“没有找到匹配对象”，1 次是用户开始新需求而结束旧会话 |
| 取消 | 3 | 用户主动停止/开始下一项需求 |

**没有一条属于“没有已登记工具可用”**（例如 `助手选择了未接入的工具`）。样本很小（n=9 个会话、仅 4 天），不能据此证明缺口不存在，但**现在没有证据说明“缺工具”是主要失败原因**；已有失败都发生在固定工具的规划合同内，并已经能在固定工具内修复（今天的推荐场景用真实 Qwen 验证通过）。

建议在投入沙箱之前先补一个轻量指标：规划因“没有可用工具覆盖”而 `question`/失败时，记录一个封闭原因码（不含正文），攒够样本再决定。

## 4. pi 0.85.1 能提供什么，不能提供什么

本机包：`local-ai/node_modules/@earendil-works/pi-coding-agent@0.85.1`，MIT，`engines.node >= 22.19.0`。

### 4.1 本项目已使用的 pi 能力

| 位置 | 使用的公开 API | 作用 |
|------|----------------|------|
| `local-ai/assistant-approval.mjs:1,72-74` | `ExtensionRunner.emitToolCall()`、`createExtensionRuntime`、`SessionManager.inMemory` | 仅策略的确认判断；对模型访问用 `Proxy` 直接抛错，不创建默认 provider |
| `local-ai/assistant-compaction.mjs:3` | `findCutPoint`、`generateSummaryWithUsage`、`shouldCompact` | 历史切分与摘要 |
| `local-ai/assistant-experience.mjs:1` | `serializeConversation` | 经历记忆序列化 |

没有使用 `createAgentSession`、`defineTool`、`DefaultResourceLoader` 或内置 `bash/write/edit` 工具。

### 4.2 pi 的“自己写工具”到底是什么

| 能力 | 官方文档 | 对本需求的含义 |
|------|----------|----------------|
| 运行时动态注册工具 | `docs/extensions.md`：`pi.registerTool()` 可在加载期或启动后调用，新工具在同一会话立即可被模型调用 | 这是**扩展 API**，要有已加载的扩展，不是 SDK 里一个“让模型生成工具”的开关 |
| SDK 添加自定义工具 | `docs/sdk.md`：`createAgentSession({ customTools: [defineTool({... TypeBox parameters ...})] })`；`tools` 白名单、`noTools: "all"` | 工具由**宿主写好**，模型只调用；并不是模型创造工具 |
| 模型自我扩展 | 扩展为 TypeScript，经 jiti 加载（`docs/extensions.md`）；放在 `~/.pi/agent/extensions/` 或 `.pi/extensions/` 后 `/reload` 热加载 | 模型写文件、宿主加载并以**同一进程权限**运行 |
| 沙箱 | `docs/security.md`“No Built-in Sandbox”：内置工具可读写文件、执行 shell；扩展“run with the same permissions”；真正隔离“needs to come from the operating system or a virtualization/container boundary” | pi **不提供**受限代码执行 |
| 官方给的隔离做法 | `docs/containerization.md`、`examples/extensions/sandbox`（`@anthropic-ai/sandbox-runtime` 0.0.26，macOS 用 `sandbox-exec`，Linux 用 bubblewrap）、Gondolin micro-VM、Docker | 都是进程/虚拟机边界，不在库内 |
| 关闭全局发现 | `DefaultResourceLoader` 选项含 `noExtensions`、`noSkills`、`noPromptTemplates`、`noThemes`、`noContextFiles`、`extensionFactories` | 若要用 AgentSession，必须显式关闭用户全局插件发现（与 AGENTS.md 一致） |
| 自定义模型 provider | `docs/custom-provider.md`：`pi.registerProvider()`，含自定义流式 API | 理论上可让 AgentSession 的模型调用指向本项目 Gateway；但 Gateway 的 `assistant.plan` 是一次性 JSON 计划合同，不是流式工具调用，需要新适配（**未验证**） |

### 4.3 与 AGENTS.md 不变量的冲突

直接采用 pi 的“模型写扩展/脚本 + 运行”路径，会同时违反：

1. 不得隐式执行 shell、不得加载用户全局插件；
2. SDK 不得绕过本项目的模型开关、预算、取消、超时、日志和工具权限（AgentSession 自带循环和 provider 解析，会形成**第二个任务状态机**，与 `Engine` 的串行、版本、取消、unknown 重复）；
3. 完成状态、回执和版本由 `Engine` 拥有，模型脚本不能自己宣称成功。

### 4.4 pi 里**可以**复用的部分（薄适配层）

- `ExtensionRunner.emitToolCall()`：已在审批里使用，可对新增的只读计算工具做统一的“执行前策略拦截”（例如开关、长度、纯文本检查）。价值有限，因为这类规则本项目 Contract 也能表达，不建议为此引入更多 pi 面积。
- `defineTool` 的 TypeBox 参数声明：仅在将来真的引入 AgentSession 时才有意义；当前 Contract 已有自己的字段/枚举校验，不建议重复。

结论：**“上游能力 + 薄适配层”在这个需求上，上游贡献的是工具声明/拦截的少量接口，而不是代码执行与隔离**。隔离必须来自别处。

## 5. 运行位置与沙箱方案对照

### 5.1 在 Chrome 扩展内运行

| 方案 | 官方约束（均已抓取） | 判断 |
|------|----------------------|------|
| 扩展页 `eval` / `new Function` | `content_security_policy.extension_pages` 的最低策略是 `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`，**不能加入 `'unsafe-eval'`**，否则安装时报错 | 不可行 |
| 扩展包内嵌 QuickJS-WASM 等解释器 | 最低策略允许 `'wasm-unsafe-eval'`，但 Chrome Web Store MV3 要求把“**Building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data**”列为常见违规；功能必须能从提交代码中看明白 | 高审核风险，不推荐 |
| manifest `sandbox` 页面 | 沙箱页没有扩展 API，默认策略含 `'unsafe-eval'`；CWS 说明“隔离于扩展 API 的上下文（如 iframe、沙箱页）”不受“不得加载远程代码”限制，但仍必须能判断完整功能并遵守用户数据政策 | 可行但属政策灰区（“本机模型运行时生成的代码”是否算远程来源，没有官方明文），**需人工合规评审**；还要新增页面与消息桥 |
| `chrome.userScripts` | 官方 API，专门用于“用户提供、无法随包发布的脚本”；需要 `userScripts` 权限，且用户须手动开启开关（Chrome 138+ 为每个扩展详情页的“Allow User Scripts”，之前为开发者模式）；脚本注入网页的 `USER_SCRIPT` 世界，不是纯计算通道 | 适合“对网页跑用户脚本”，不适合计算工具；且当前 manifest 没有该权限，`minimum_chrome_version` 为 142，会要求用户逐扩展开启 |

当前 `manifest.json`：没有 `content_security_policy`、没有 `sandbox` 页、没有 `userScripts` 权限（默认策略下 WebAssembly 被禁用）。

### 5.2 在本机 AI 服务（Node）里运行

| 方案 | 官方说明（已抓取/核对） | 判断 |
|------|--------------------------|------|
| `node:vm` | Node 文档：“The `node:vm` module is not a security mechanism. Do not use it to run untrusted code.” | 禁用 |
| Node Permission Model（`--permission`） | Node 文档：属于“seat belt”，**不提供对恶意代码的安全保证**；限制 fs、网络、子进程、worker、原生插件、WASI、FFI、inspector；已知 `process._debugProcess()` 不受限、符号链接会被跟随、已有文件描述符可绕过 | 只能作纵深防御，不能单独当边界 |
| `isolated-vm` 7.0.1 | ISC，`engines.node >= 24`，**原生插件**（node-gyp 构建）；README 称“Running untrusted code is an extraordinarily difficult problem”，建议把实例放进独立进程，并**不建议使用奇数版本 Node**（开发 shell 的 `node -v` 为 v25.9.0，生产服务进程使用 `~/.hermes/node/bin/node`） | 需要原生构建并绑定 Node 版本；与 `--permission` 默认禁用原生插件冲突（须 `--allow-addons`）；不优先 |
| QuickJS-WASM（`quickjs-emscripten` 0.32.0） | MIT，2026-02-16 发布；README：“Safely evaluate untrusted Javascript”，提供 `setMemoryLimit`、`setMaxStackSize`、`setInterruptHandler`/`shouldInterruptAfterDeadline`、`memoryLimitBytes`；同时写明“**has not been audited**” | **语言层主边界的首选**：纯 WASM、无 node-gyp、默认无 `require/process/fetch`；仍不是审计过的安全边界 |
| OS/虚拟机边界 | pi 官方示例：`sandbox-exec`（macOS）/ bubblewrap（Linux）/ Gondolin micro-VM / Docker | 最强但部署成本高；作为第二阶段加强项 |

**本项目的自然落点**：在 `local-ai/` 内（已有鉴权 HTTP、预算、取消、日志、控制开关），不在扩展包内。`local-ai/server.mjs:92` 有固定的鉴权路由白名单，`/v1/assistant/approval` 是“非模型的策略接口”的现成先例。

## 6. 若要原型：只读计算工具的设计草案（已按此实现，差异见技术文档）

名称暂定 `compute.run`（只读，登记进 `Contract.tools`，放入按需组，不默认曝光）。

| 项目 | 草案 |
|------|------|
| 输入 | `code`（≤4000 字符、仅 ES2023 内置、禁止 import/require）、`inputRefs`（≤4 个来自**本次回执**的引用，由执行器取出白名单字段注入；模型不能自己塞任意大数据或凭证）、`purpose`（≤120 字，给用户看） |
| 执行位置 | `local-ai` 内新增鉴权 POST（模仿 `/v1/assistant/approval`：体积上限、令牌校验），只收 JSON |
| 隔离 | 独立子进程 `node --permission`（不授予 fs/net/child/worker/addons/wasi）→ 其中 QuickJS-WASM 运行代码；墙钟约 2 秒、内存约 16 MB、栈约 256 KB、输入 ≤64 KB、输出 ≤16 KB；超限即杀进程，返回封闭错误类 |
| Engine 语义 | `readOnly`；成功回执只是 observation，**不能证明任何业务完成**；不得作为 Todo 的最终完成工具，只能作前置；纳入 12 工具 / 5 分钟；取消终止子进程；相同代码+输入指纹纳入 `readSeen` 防无进展 |
| 日志与隐私 | 记录 `codeHash`、`inputDigest`、`outputBytes`、`elapsedMs`、`errorClass`；正文仅在用户已开启历史正文留存时保存；不读取 Cookie/令牌，无网络 |
| 可见性 | UI 展示 `purpose`、可折叠的代码和输出；设置页独立开关，默认关闭 |
| 失败处理 | 沙箱不可用/超限/输出非法一律明确报错并回到原有规划/追问；**不做静默自研 fallback** |

明确**不做**：代码直接调用业务工具；代码生成的 steps 绕过 `Contract.validatePlan`；持久化模型写出的工具；使用 pi 的 `/reload` 自写扩展机制。

### 成本提示（今天的真实数据）

经受控本机入口（进程内 Gateway，替身业务）4 次实测 Qwen3.8 27B：清单分析约 23–26 秒，执行阶段每个规划轮约 15–57 秒（低思考首轮 30 秒超时会触发关思考重试，每次完整运行都发生 2 次，计入上述轮耗时）；完整“推荐→选歌单→追加→随机播放”任务 158–218 秒。本机生产历史里，29 次 `assistant.plan` 有 13 次首轮低思考在 30 秒超时（10 次清单分析全部如此），所以真实延迟更可能高于上述受控实测。计算工具意味着每个任务**至少多一轮规划**（再加一次沙箱执行），对延迟非常敏感；因此只能在“已登记工具无法表达所需数据变换”时才触发，而不是常规路径。

## 7. 建议的验收门槛（进入产品前）

1. **安全**：不少于 30 个对抗用例全部被拦截或安全终止——枚举全局对象无宿主对象；`process`/`require`/`fetch`/动态 `import()`/`Function` 构造器逃逸；原型污染；死循环；内存炸弹；超大字符串/深递归；输出超限；子进程被杀后无残留。
2. **业务**：断言所有业务替身（队列、提醒、账号）调用次数为 0；取消在约 1 秒内终止；超时/内存超限可恢复且计入预算。
3. **模型质量**：在 ≥10 个真实“只读数据变换”任务上，真实 Qwen 的成功率与额外耗时对比“无代码工具”基线；若成功率低于 80% 或每任务额外耗时超过 90 秒，则不转正。
4. **合规**：确认是否上架 Chrome Web Store；上架则代码只能在本机服务执行，扩展包内不得出现代码解释器或 eval。
5. **证据分层**：静态检查、业务替身、真实本机模型、HTTP 预览、真实 Chrome 扩展、真实账号分别报告，不互相替代。

## 8. 更低风险的替代与增量

1. **补专用工具**：对确认的高频缺口直接新增固定工具（如把已有的歌单推荐场景接进工作台、队列去重），可逐项验收，沿用 `Contract`/`Todo`/`Engine`。
2. **声明式表达式引擎**（JSONata / JMESPath 一类）：比任意 JS 小得多，但仍需单独评估依赖许可、版本、超时与 DoS（**本次未调研，不能当作已验证选项**）。
3. **采集缺口指标**：先统计“无工具覆盖”的封闭原因码，再决定是否做 §6。

## 9. 证据与未验证项

**已核对（本机包/源码）**：pi 0.85.1 的 `docs/security.md`、`docs/extensions.md`、`docs/sdk.md`、`docs/containerization.md`、`docs/custom-provider.md`、`examples/extensions/sandbox`；`DefaultResourceLoader` 的 `no*` 选项；本项目 `js/assistant-contract.js`、`js/assistant-todo.js`、`js/assistant-engine.js`、`local-ai/server.mjs`、`local-ai/assistant-approval.mjs`、`manifest.json`。

**已核对（官方文档，2026-10-12 抓取）**：Chrome `userScripts` 参考（页脚更新于 2026-09-11）、Chrome 清单 CSP、Chrome Web Store MV3 附加要求（更新于 2024-04-03）、Node.js v26.11.1 的 Permissions 与 vm 文档、`quickjs-emscripten@0.32.0` README、`isolated-vm@7.0.1` README 与 npm 元数据。

**未验证**：quickjs-emscripten 在本机 Node 版本上的实际运行与资源开销；Qwen 生成只读计算代码的可靠性；CWS 审核方对“本机模型运行时生成的代码”的实际口径；macOS `sandbox-exec` 的长期可用性；JSONata/JMESPath 的安全与性能；通过 pi `registerProvider()` 把 AgentSession 接到本项目 Gateway 的实际可行性。

## 10. 需要你决定的问题

1. 扩展是否计划上架 Chrome Web Store？（决定能否考虑扩展内沙箱页方案。）——**回答（2026-10-12）：不上架。** 仍不在扩展页内放解释器；代码只在本机服务执行。
2. 能否接受“只读计算”每个任务额外约 1–2 分钟的本机延迟？——**回答：能接受，更看重主动性与能力。**
3. 是否先做 §8 的缺口指标，再决定是否投入原型？——**回答：直接先打通自主编码能力**（未先做缺口指标）。
