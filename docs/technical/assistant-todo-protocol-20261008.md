---
title: "Todo 阶段合同与有界错误恢复"
type: technical
status: active
version: "1.2"
created: "2026-10-08"
updated: "2026-10-12"
author: "Cursor Agent"
tags: [AI工作台, Todo, 错误恢复, Gateway, 音乐队列, 推荐歌曲, 追问答复]
related:
  - docs/technical/assistant-todo-tips-20260928.md
  - docs/technical/assistant-queue-recovery-20260920.md
  - docs/research/research-assistant-dynamic-tools-20261012.md
  - docs/technical/assistant-speed-20260929.md
changelog:
  - date: "2026-10-08"
    desc: "初始创建：阶段合同、冗余副本校验、有界错误恢复、目标组预加载"
  - date: "2026-10-12"
    desc: "补充：推荐类请求在分析阶段返回空清单的修复（outline 不带偏好/记忆、失败重试条款、推荐路径），含真实 Qwen 对照与验证分层"
  - date: "2026-10-12"
    desc: "第二次补充：分析阶段追问后的补充答复沿用原始目标与原文分项，且不被本地快捷规划接管；含新旧代码真实 Qwen 对照与变异检查"
  - date: "2026-10-12"
    desc: "指向 assistant-speed-20260929.md：分析请求改为关闭思考起步并在同一执行轮内沿用（用户批准；协议、提示词与校验不变，只改 Gateway 起步等级）"
  - date: "2026-10-12"
    desc: "第三次补充：用户在候选卡上手动点“+”/播放后，以真实起播回执勾选当前“加入本地队列”Todo（Todo.observeChoice）；修复点击后已在播放却因 Todo 未完成而重复失败"
---

# Todo 阶段合同与有界错误恢复

## 本次真实失败

2026-10-08 11:13:11 用户输入“播放队列歌曲，如果过期了，帮我找回来。”。第一次低思考30秒超时后，模型返回空 `todoTips`；执行器记录一次 `ASSISTANT_PLAN_INVALID` 并重新规划。第二轮成功安装两项 pending Todo：条件保留恢复、播放队列。第三轮本应只提出 `music.state`，却同时复述了带 `id/status` 的完整已安装清单，被旧定义校验拒绝为“Todo 项目格式无效”。该轮没有任何音乐业务调用。

旧重复失败指纹只包含 `assistant.plan + {} + ASSISTANT_PLAN_INVALID`，将第一次空清单与第三轮不同错误合并，直接停止。用原始 JSON 和真实 Engine 的替身回放复现了两个问题。

## 权责与修改

1. **阶段输出清晰。** outline 只能返回1至12项完整目标或单独 question；空数组、模型生成的 id/status/receiptId 和清单/追问混合均明确拒绝。已存在清单时的执行提示不再夹带“首次创建清单”的格式，只要求当前的一步 steps、question 或有成功回执的 done。旧未传 planningPhase 的首次兼容调用保留。
2. **同一清单只有一个事实来源。** Gateway 服务和 Engine 都复用 `AssistantTodo.executionPlan()`。模型意外复述既有清单时，按顺序逐字段比较目标、来源、工具、参数和全部附带的执行器字段；只有与真实快照完全一致的冗余副本才丢弃。对象键顺序不影响比较。定义省略的 args 仅按原合同视为空对象；省略进度字段不会改变任何进度。模型改文字、参数、工具、顺序、数量、id、状态或回执均报 todo-immutable。原始结果和快照不被原地修改；单独复述没有步骤仍不能执行。首次 outline 无此兼容处理，不能让模型创建进度。
3. **错误可以修正，恢复仍有上限。** Contract 维护封闭的 planIssue 类别；Todo 按缺失、项目格式、验收参数、不可变清单、来源顺序、作用域和未完成目标报告具体错误。Gateway 只接受登记类别，将其加入既有 execution 元数据，现有异步 job 自然传递；Engine 从 error 或 execution 读取登记类别，写入失败观察。规划指纹增加当前 outline/execute 阶段及登记类别。未知类别不采信，不直接使用任意错误正文做指纹。工具失败判重不变，分类变化不会清空原恢复次数或规划/工具计数；同类第二次仍停止，总恢复最多3次，仍受12轮/12工具/5分钟限制。
4. **条件与最终目标分开。** 播放附带“过期则恢复”以已有 `music.queue.play` 的成功起播验收；该工具已支持 stale 版本的受控恢复，先读取真实状态即可，不另建强制 keep 写入。单独保留/恢复而不播放仍走 reconcile。旧已安装的条件 keep 清单不被重写：最新成功的队列读取若明确 ready、非空且有版本，可证明无需恢复，并绑定这次读取回执完成当前 keep 项；stale/unavailable/empty、缺失版本、失败或 unknown 不满足。后续播放仍需独立的真实起播回执。
5. **范围检查保留。** Todo 目标同时检查工具的 app/apps 范围，不因定义阶段没有执行而接受其他应用目标。执行参数、真实引用/版本、确认、取消和 unknown 仍由原工具及执行器校验。
6. **目标提供工具方向。** 真实模型首轮打磨验证虽然完成了起播，但先加载 music.queue，再尝试尚未加载的 music.queue.play，引入1次模型修复，约214秒。执行阶段现在按已保存的 activeTodo.tool，在当前应用的登记 groups 内找到最终工具所属组并预加载说明；outline 不预加载，不执行工具或改变业务权限，也不加载其他应用。缺少其他前置工具时仍走原 tools.load。避免重复插入相同音乐技能说明，保留冷加载12288上下文的真实预算检查，不通过放宽预算掩盖提示词膨胀。

这是一层本项目输出合同和业务回执适配，没有新的 Todo 引擎、状态数据库、业务工具或模型调用入口，也未放宽写入授权。沿用 `AssistantContract/AssistantTodo/Engine/Gateway/Context`，不添加别名转换或任意模型修复执行器。

核对已安装的 `@earendil-works/pi-coding-agent@0.85.1`：MIT，公开 exports 为 `. /rpc-entry /client /experimental/plugin`；公开 `dist/index.d.ts` 没有 Todo 导出。本次没有新增依赖、导入内部示例或改造 SDK；原有审批和压缩仍使用其公开 API，由回归覆盖真实 SDK 路径。

## 验证及边界

- 新增11项协议回归覆盖阶段提示、空清单及状态拒绝、完全相同的副本、所有不可变字段篡改、截图回放、不同错误分类/相同错误停止/总额不重置、ready 条件豁免、旧两项目标在 ready/stale 下各自执行、取消、unknown、目标组的范围/分析阶段隔离，以及鉴权 HTTP job 的分类传递。
- 最终全仓1169项通过，模型与业务为替身；包含真实 pi SDK、HTTP 鉴权/来源/取消、冷加载上下文预算和压缩路径。既有工具加载回归改用最终播放目标的 queue.list 前置工具，继续验证缺失工具的具体加载建议、有界恢复和单次起播。脚本语法及 diff 空白检查通过。
- 真实 Qwen3.8 27B 经新代码的 Gateway 验证同一原句，业务队列/播放器/任务存储均为替身。继承生产控制策略和用量的隔离副本，未改生产配置和记录。ready/stale 两场景均1项 Todo、4轮规划、0次错误恢复、读取1次/起播1次/额外reconcile 0次，分别约98.0秒/97.3秒；stale 起播时核对其真实替身 revision。报告为忽略的 `.local/evaluations/assistant-todo-polish-1791430944085.json`。首次214秒/1次恢复的报告 `.local/evaluations/assistant-todo-polish-1791430606618.json` 保留用于说明目标组改进；其起播成功，但未达到无恢复的验收门槛。
- 真实本机验证采用进程内 Gateway；没有通过生产 HTTP 规划入口，未做 HTTP 页面预览或真实 Chrome 扩展/账号验收。自然语言的所有任意条件仍没有通用的语义完整性证明，已覆盖的队列恢复采用已有正式工具的合同。生产队列和播放未操作。
- 没有重启生产服务、重载扩展、重新执行截图任务或改写已安装清单。新规划提示及 Gateway 元数据需本机服务加载新代码，Engine 与 Todo 适配需重载扩展。

安全自查：本次没有新增接口、权限、网络目标或依赖；错误类别为封闭集合，不回显任意模型字段/值。冗余副本不授予完成或写入权限；所有修改仍拒绝，次数和时间预算保持，取消/unknown/重复业务动作保护经回归验证。

## 2026-10-12 补充：推荐类请求的分析阶段空清单

### 真实失败

2026-10-12 10:11 前后，用户在 AI 工作台输入“帮我推荐一些歌曲，加入歌单，随机播放。”，任务以“同一操作重复失败，已停止自动恢复。最近错误：请先规划覆盖完整需求的 Todo（1至12项）；不能返回空清单…”结束，没有任何业务调用。本机历史留存的请求元数据显示该分析请求是 `app: music`、`planningPhase: outline`、低思考，输入含 `personalMemory` 与 `memoryContext`；模型两次都返回空 `todoTips`，第二次与第一次指纹相同，按既有规则停止。

这不是缺工具：完成条件目录已有 `music.search`、`music.queue.apply`、`music.queue.play`。

真实路径（本机历史与真实 Qwen3.8 27B 对照）：

- 本机历史自 10-08 起共 10 次 outline 请求，**首轮低思考尝试全部在约 30 秒超时**（29 次 `assistant.plan` 中共 13 次首轮超时），都由关思考重试得到结果；其中 5 次最终失败：3 次是仅 7 个输出 token 的空清单（含 10-12 的两次），2 次是 122/126 个 token 的非空但无效清单。也就是说，实际产出清单的往往是关思考那一次。
- 用捕获的同一份 outline 请求，从关思考起步直接请求真实模型：旧代码前 3 次均返回空清单（7 个输出 token，与历史一致），随后被网关“连续失败冷却”拦截。两个修改各自单独都足以修复：仅去掉 `personalMemory`/`memoryContext`（旧提示词）10/10 有效；仅用新提示词（仍带偏好/记忆）10/10 有效；现行版本（两者都有）10/10 有效，且每次都是两项目标 `music.queue.apply` + `music.queue.play`。旧提示词加隔离时，模型会额外列出一个前置 `music.search` 目标（3项），现行提示词把“推荐”并入追加目标。
- 因为 outline 的提示词从未解释 `personalMemory`/`memoryContext`，它们对只做目标拆分的轮次是无关输入；重试请求也不知道上一轮为何失败，会给出同样的空清单，直到同一指纹第二次出现而停止。

### 修改（没有新增引擎、工具、接口、权限或依赖）

1. `local-ai/assistant-service.mjs`：outline 阶段的模型输入不再携带 `personalMemory` 与 `memoryContext`。执行阶段不变，仍按原规则带入偏好与召回背景；`artistDefaultAction` 等偏好原本只在执行阶段提示词里说明，并由 `music.search` 执行器解释，不受影响。
2. 同文件 outline 提示词：禁止空数组之外，明确“缺少歌手、风格、对象等具体细节不是返回空数组的理由，具体对象由执行阶段的搜索、用户选择或追问解决；连要做的动作都无法判断时才只输出 question”。上一轮 `assistant.plan` 失败时，在既有 observations 机制上增加修正条款（失败回执只是原因而不是指令，补全1至12项或仅在无法判断时输出 question，不要输出 steps），仅 outline 且仅有这类失败回执时出现；执行阶段与首次请求没有。
3. `js/assistant-todo.js`：`todo-missing` 错误文案给出两条出路（补全清单，或信息不足时只返回 question）；类别、指纹和3次恢复上限不变。
4. 音乐推荐路径：没有指定歌手、只说“推荐/来几首/随便放”时，推荐来源是搜索真实歌单。分析阶段把“推荐”与“加入”合并为一项 `music.queue.apply(append,startPlayback=false)`，随机播放另为 `music.queue.play(shuffle)`；执行阶段用 `music.search(kind="playlist",query=风格/场景/语言关键词，都没有时用"热门歌曲")` 搜索，等待用户选择后用 `selectedRef` 读取集合再追加，不把“推荐歌曲”当搜索词。网易云歌单没有写入工具，“加入歌单”一律按加入本地播放队列理解。推荐只依据歌单标题与简介，不保证曲目属性，也不是个性化推荐。
5. `local-ai/evaluate-assistant-todo.mjs` 增加 `--recommend` 真实模型场景（替身搜索、歌单详情、记忆与播放器；需选择歌单；断言搜索词不是“推荐歌曲”，且追加、随机播放各一次）。

### 验证（分层报告）

- 静态检查：`node --check`（`local-ai/assistant-service.mjs`、`js/assistant-todo.js`、`local-ai/evaluate-assistant-todo.mjs`、`test/assistant-todo-protocol.test.mjs`）与 `git diff --check` 通过。
- 业务替身：`test/assistant-todo-protocol.test.mjs` 新增8项（共19项），覆盖 outline 不带偏好/记忆而执行阶段保留、失败重试条款仅在 outline 且有失败回执时出现、空清单提示的两条出路、音乐/通用提示分别生效（不外溢到提醒应用）、不带 `app` 的工作台请求同样得到音乐规则、整条 Engine+Tools+Gateway 的截图回放（模型在带偏好/记忆的分析输入下返回空清单，修复后一次分析成功，搜索1次/追加1次/随机播放1次，`recoveryCount` 为0）和分析偶发空清单后的恢复回放（重试携带失败回执与补全条款，恢复1次，写入只发生一次）。对 HEAD 代码运行同一测试文件：这8项全部失败，原有11项通过；现在19项全部通过。全仓 `node --test test/*.test.js test/*.test.mjs`：1287项，1286项通过，1项失败，失败项是 `test/console-resilience.test.js` 的缓存版本断言（期望 `js/youtube-controller.js?v=16`，而工作区里未提交的 YouTube 改动已把 `index.html` 改为 `?v=17`），与本次无关，未改动。
- 真实本机模型（进程内 Gateway，业务/播放器/存储为替身，不经生产 HTTP 入口，隔离副本、未改生产配置和记录）：同一原句，旧代码（HEAD）2次均 63 秒内失败，错误与截图完全一致（每次都是分析首轮低思考30秒超时，关思考重试返回空清单，同一指纹第二次出现后停止）；新代码4次均通过，分析首轮在低思考下约23–26秒完成（未超时，2项目标），共6次规划、0次无效计划、0次规划失败，搜索词为“热门歌曲”，业务副作用为搜索1/追加1/随机播放1，用时158–218秒（执行阶段每次有2轮低思考30秒超时后关思考重试，属原有机制）。分析首轮距30秒上限只有约4–7秒余量，所以关思考路径另做了下面的对照。
- 真实本机模型，分析阶段单独对照（进程内 Gateway，输入是 Engine/Tools 替身捕获的真实首轮 outline 请求，含偏好与召回记忆，从关思考起步，每个代码变体连续10次）：旧代码前3次均返回空清单（7个输出 token），随后被网关冷却拦截；旧提示词+隔离偏好/记忆 10/10 有效（3项，多出一个前置搜索目标）；新提示词+保留偏好/记忆 10/10 有效（2项）；现行版本 10/10 有效（2项，约4.6–5.2秒/次）。这是 outline 单轮样本，不代表完整任务稳定性；探针脚本在临时目录，未纳入仓库。旧代码的两份失败报告与四个变体的对照日志保存在忽略的 `local-ai/.local/evaluations/`（`assistant-recommend-HEAD-before-fix-*.json`、`assistant-outline-off-probe-*.log`、`assistant-outline-probe-captured-request.json`）。回归：默认的四项清空/追加/追加/随机播放场景通过（524.6秒，11次规划，0无效，副作用顺序 clear→search→append→search→append→shuffle）；`--remove-artist` 场景通过（170.5秒，4次规划，批量移除1次）。未对这两个回归场景做新旧耗时对照。报告为 `local-ai/.local/evaluations/` 下已忽略的 `assistant-recommend-*`、`assistant-todo-follow-*`、`assistant-remove-artist-follow-*`。
- 未做：HTTP 页面预览、真实 Chrome 扩展、真实账号验证；未重启生产服务、未重载扩展、未改写已有任务。生产队列和播放未操作。

### 边界

- 本机服务须加载新提示词：运行 `./local-ai/service.sh restart`（旧进程自 10-08 起运行旧代码）；扩展须重载才能得到新的 `todo-missing` 文案，其余修复在服务端。
- 推荐只是“热门歌单兜底”或按用户给出的关键词搜歌单，不读取个人听歌画像；用户选歌单这一步保留，不自动挑选。
- 原有限制“分析阶段只返回 `question` 时，补充答复会以答复原文为新的 Todo 来源，多目标原句可能被丢掉后续分项”已在下一节修复。
- 真实 Qwen 的运行时长受 LM Studio 冷加载和每轮 30 秒低思考超时影响；4次完整通过和 outline 的 10 次对照不代表所有措辞都稳定，同类措辞的更多真实样本仍应通过本机历史继续观察。
- 本机历史里分析首轮的低思考 10/10 超时，实际靠关思考重试产出清单；本次没有改思考起步策略，也没有改 30 秒阈值。若想省掉这约 30 秒，可评估让 outline 直接以关思考起步（上面的对照里现行版本约 5 秒/次且 10/10 有效），但这是规划质量与速度的取舍，需要由用户决定，没有在这里偷偷更改默认。（后续：用户当天批准了该评估，并在端到端实测后选定“清单分析关闭起步成功后同一执行轮沿用关闭思考”，已实现，见 [assistant-speed-20260929.md](assistant-speed-20260929.md) 的“清单分析关闭思考起步（2026-10-12）”；本文其余关于“低思考超时后重试”的描述是实现前的历史记录。）
- 临时写代码/自写工具只做了调研，没有实现，见 `docs/research/research-assistant-dynamic-tools-20261012.md`。

安全自查：未新增接口、权限、网络目标或依赖；提示词只收缩 outline 的模型输入并增加修正条款，不放宽写入授权、预算或取消；写入次数由替身断言（搜索/追加/起播各一次，重试不重放）。

## 2026-10-12 第二次补充：分析阶段追问后的补充答复

### 真实路径与失败

分析阶段允许只返回 `question`（连要做的动作都无法判断时）。此时任务停在 `clarify`，Todo 只有 `goal` 与 `sources`、没有事项。用户随后的文字答复（输入框，或原生交互卡的文字回复 `Engine.respond()`）在 `Engine.submit()` 里因为 `Todo.current(previous.todoTips)` 为空而不继承清单，`Todo.create()` 便以答复文字（例如“许嵩”）作为新的目标和唯一的原文分项，原需求只剩在 `turns` 和上下文里。后果有两层：

1. 答复若能被本地快捷规划识别（`Contract.localPlan` → `music.intent`），且单个来源的 Todo 校验不会拒绝它，就会被当作完整需求验收，原需求的其余目标被静默丢弃。来源里带“加入队列”“随机播放”等校验关键词时，`Todo.install` 会拒绝并转给模型；其他单行需求没有这层保护。用探针检查了 5 个没有这些关键词的单行需求（如“帮我找一首适合下雨天听的歌，如果没有合适的就换一批”），答复“许嵩”全部被接受。
2. 即使转给模型，模型看到的 `todoTips.goal/sources` 也只是答复。

真实本机模型对照（进程内 Gateway，业务依赖和点击为替身）：原句“搜索歌手热歌加入队列 / 随机播放添加到队列里的歌曲”，第一次分析的追问“要搜索哪位歌手的热歌？”由脚本给出（不是模型输出），答复“许嵩”，之后全部由本机 Qwen3.8 27B 规划。旧代码 1 次：311 秒失败，没有得到覆盖原需求的完整清单，副作用为搜索 2 次、追加 1 次、随机播放 0 次，并出现两次无效规划（“工具 music.queue.play 尚未加载…”与“Todo 引用无效”）。

### 修改（没有新增引擎、工具、接口、权限、存储字段或依赖）

1. `js/assistant-todo.js`：新增两个小判断。`awaitingAnswer(task)`：任务为 `clarify` 且清单仍没有事项；`answers(task, input)`：清单为空、目标不是本次输入，且助手的追问紧挨在本次答复之前（`turns` 倒数第二条）。`goalOf()` 由 `create()` 抽出，目标文字规则不变。
2. `js/assistant-engine.js` `submit()`：继承 `todoTips` 的条件增加 `Todo.awaitingAnswer(previous)`。仍要求路由为“继续”且同一应用，所以被路由为新需求或替换的输入（例如追问之后另起“搜索周杰伦”）照常新建 Todo，不沿用旧分项。
3. `js/assistant-tools.js` `plan()`：对追问的答复不走本地快捷规划，并写一条 `assistant.localPlan` 决策记录（`answers-outline-question`，下一步 `outline`）；没有追问时本地快捷路径不变。
4. `local-ai/assistant-service.mjs`：仅在 outline 且 `text` 不是 `todoTips.goal` 时，分析提示词多一句“回答只补充 `todoTips.sources` 里缺少的细节，不是新增分项；清单仍覆盖全部分项，并把细节写进对应目标的文字或 args”。首次分析、技能请求和执行阶段都不带这句。
5. `local-ai/evaluate-assistant-todo.mjs` 增加 `--follow-up`（须同时使用 `--in-process`）：只有第一次分析的追问由脚本给出，之后全部是真实模型。

### 验证（分层报告）

- 静态检查：`node --check`（上述 4 个源文件、评估脚本、测试文件）与 `git diff --check` 通过。
- 业务替身：`test/assistant-todo-protocol.test.mjs` 新增 8 项（共 27 项）：多行原句追问后保留目标与全部分项；单行多目标原句同样保留；没有校验关键词的单行需求不被本地快捷规划接管（且留下决策记录）；没有追问时本地快捷规划仍先于清单分析；追问之后另起的独立需求不沿用旧分项；提示词一句只在答复时出现（首次分析、技能请求、执行阶段都没有）；连续两次追问后每次答复仍沿用同一份原始目标；通过交互卡文字回答同样沿用且没有伪造完成回执。先写测试：未修改代码时，多行、单行和提示词 3 项失败，其余按预期通过；之后追加的用例按下面的变异检查确认能够失败。变异检查（在临时副本中，最终代码）：去掉 Engine 继承，多行、两种单行、连续追问、交互卡共 5 项失败；只去掉本地快捷拦截，仅“没有校验关键词的单行需求”1 项失败。原有 `test/assistant-todo.test.mjs` 的“未执行的本地候选未通过 Todo 校验”用例保持不变并通过（第一版拦截只比较目标文字，使该用例少了决策记录而失败，改为同时要求助手追问紧挨在答复之前后恢复）。全仓 `node --test test/*.test.js test/*.test.mjs`：1295 项，1294 项通过，1 项失败；失败项仍是 `test/console-resilience.test.js` 的缓存版本断言（期望 `?v=16`，工作区里未提交的 `index.html` 已是 `?v=17`），与本次无关，未改动。
- 真实本机模型（进程内 Gateway，业务/播放器/存储为替身，不经生产 HTTP 入口，不读生产令牌、不写生产记录）：新代码连续 4 次通过（前 3 次是拦截条件修正前的版本，最后 1 次是最终代码）。每次第二次分析都是两项目标（来源 0 `music.queue.apply(append, startPlayback=false)`、来源 1 `music.queue.play(shuffle)`），目标文字都写进了“许嵩”；`goal` 与两条 `sources` 保持原句；副作用为搜索 1 次、追加 1 次、随机播放 1 次，两项都有完成回执；0 次规划失败、0 次无效计划；用时 175–240 秒（其中每次有 2 次低思考 30 秒超时后关思考重试的原有机制，最终代码那次例外：分析一次通过）。最终代码那次的轨迹里有一条 `answers-outline-question` 决策记录。这是 1 条原句、脚本给出追问、4 次样本，不代表其他措辞或模型自己提出的追问。
- 未做：HTTP 页面预览、真实 Chrome 扩展、真实账号验证；未重启生产服务、未重载扩展；生产队列和播放未操作。

### 边界

- 只有“追问之后的下一条文字答复且路由为继续”才沿用原清单；答复被路由为新需求或替换时按新需求处理，沿用既有路由语义，没有改路由规则。
- 追问本身仍由模型决定。提示词已要求“缺少细节照常列目标”，追问应当少见；这次保护的是出现追问时不丢原需求。
- 本机服务须重启才有分析提示词的那一句（`./local-ai/service.sh restart`）；扩展须重载才有 Engine/Tools 的沿用与拦截。只重载扩展而服务仍是旧版时，原目标和分项会保留，但模型没有“这是在回答追问”的说明，可靠性无法由本次样本担保。
- 安全自查：没有新增接口、权限、网络目标或依赖；沿用的是同一任务链里用户自己的原文，不扩大发给模型的数据范围；决策记录只含封闭代码和下一步；预算、取消、版本、unknown 与重复写入保护的路径没有改动，由原有用例回归。

## 2026-10-12 第三次补充：用户手动点候选后，Todo 不认这次操作

### 真实路径与失败

任务“帮我推荐一些歌曲，加入歌单，随机播放。”（本机 AI 历史 `fbd2ea7e…`，14:17–14:25）：用户登录网易云后在歌单候选上手动点“+”。`music.enqueue-collection` 成功，`playQueue`、播放准备/发送/确认、`queue.persist` 全部成功，`music.state` 读回 300 首、`mode: shuffle`、`isPlaying: true`。但第 1 项 `music.queue.apply(append)` 始终未勾选：

1. `Todo.observe()` 要求回执来自带 `todoId` 的步骤，且工具名与参数等于 Todo 登记值；点击走 `Engine.choose()`/`pump(selectedChoice)`，日志没有 `todoId`，工具名是 `music.enqueue-collection`。
2. 之后模型回 `done` 被 `Todo.prepare()` 以“Todo 尚未完成”拒绝；读 `music.state` 不会勾选 `queue.apply`；再 `queue.apply` 需要真实候选引用，点击后已清空，形成死局。同一规划错误第二次出现，Engine 按“同一操作重复失败”停止。界面第 1 项显示“已阻塞”，第 2 项“随机播放”从未执行。

### 修改（没有新增引擎、工具、接口、权限、存储字段或依赖）

1. `js/assistant-todo.js` 新增 `observeChoice(task, choice, outcome, receipt)`，只在以下条件全部满足时勾选当前项并绑定该回执：当前项是 `music.queue.apply`；选择动作属于封闭集合（`music.enqueue-collection`/`music.play-collection` 对应 `replace`，`music.enqueue`/`music.play` 对应 `append`）；结果不是 waiting/review/clarify；回执为 `done`；`outcome.playback` 的 `mode` 与动作一致、`songId` 非空、`count` 为不小于 1 的整数（这些由选择处理器在播放器确认后才返回）；该项原文没有“不要/先不/先别/不替换/保留原/不播放/别播放”。每次最多勾当前一项，随机播放等其他项不会被同一次点击提前勾选，已完成清单不再变化。
2. `js/assistant-engine.js`：`accept()` 增加可选的 `choice` 参数，仅 `pump(selectedChoice)` 的用户选择路径传入；系统在“直接播放”唯一候选时自动选择的路径不传。
3. 点击产生的回执仍走原来的 `Context.observe`、版本、取消、unknown、12 轮/12 工具/5 分钟边界；模型不能借此声明完成。

### 验证（分层报告）

- 静态检查：`node --check`（两个源文件）与 `git diff --check` 通过。
- 业务替身：`test/assistant-todo-protocol.test.mjs` 31 项通过（新增 4 项）。完整 Engine + Tools + Gateway 重放截图场景：搜索一次，用户点“+”（替身播放器 `playQueue` 一次），随后模型只 `music.state` 与 `music.queue.play(shuffle)`；副作用为追加 0 次、点击 1 次、随机播放 1 次，两项都有互不相同的回执，不需要错误恢复。另有单元用例覆盖缺回执、失败回执、缺/空起播证据、模式不符、waiting、`music.browse`/`music.queue`/空选择、原文排除播放或替换、当前项不是加入队列、已完成清单不变。变异检查：关闭 Engine 调用后重放用例失败（`status` 不是 `completed`），恢复后通过。原有两个重放的副作用断言增加 `clicks: 0`。助手相关 486 项测试（`test/assistant-*`、`music-assistant`、`local-ai-assistant*`、`dock-launchpad-contract`）全部通过。
- 未做：真实本机模型复测、HTTP 页面预览、真实 Chrome 扩展、真实账号验证；生产队列和播放未操作。

### 边界

- 用户点的是“替换队列并播放”，与 Todo 登记的“追加、不起播”字面不同；按用户明确点击视为满足“加入本地队列”。若原文明确排除播放/替换则不勾选，仍会停在该项。
- 只覆盖“当前项为 `music.queue.apply`”。点候选后的其他 Todo 类型（如当前项直接是随机播放）没有新增映射。
- 扩展须重载才生效；本机 AI 服务无改动，不需重启。已失败的旧任务不会被追溯修复，需新建需求。
