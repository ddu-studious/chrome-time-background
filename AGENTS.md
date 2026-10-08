# 项目协作规范

## 交互与修改范围

- 使用中文交互，代码标识符除外。
- 先追踪真实调用与数据路径，再修改。用户仅要求调研、评审或影响分析时，不修改业务实现。
- 保留与当前任务无关的未提交工作；不得为方便测试而重置、覆盖或清理其他改动。未经要求不提交 Git、不发布。

## 必须优先复用已有能力

- **这是项目明确要求：pi、DSH 等开源项目已有可用能力时，必须优先使用其正式 SDK、库或插件 API，不重复造轮子。** 同样优先复用本仓库已有模块。
- 开发前检查实际发布版本、公开导出、运行环境、许可证与现有权限/调度边界。优先“上游能力 + 薄适配层”，不得只读上游思路后重新实现一套同功能引擎。
- 不要求为了复用一个模块迁入整个框架。仅在公开能力确实不覆盖业务需求或存在已验证的不兼容时，补充最小适配；在技术文档写明查过哪些 API、限制证据和自有代码承担的职责。
- 必须固定依赖版本并提交锁文件；不引用未导出的内部文件、不复制 SDK 源码冒充集成、不用静默自研 fallback 掩盖 SDK 故障。升级需验证真实 SDK 路径。
- SDK 不得绕过本项目模型开关、预算、取消、超时、日志和工具权限；不得隐式开启外部模型调用、自动执行 shell 或加载用户全局插件。

## 项目结构与已具备的能力

- 浏览器扩展为原生 JavaScript/HTML/CSS；后台入口 `js/background.js` 通过 `importScripts` 加载模块。新增共享脚本需同步后台加载顺序；CommonJS 测试入口和浏览器全局 API 都要可用。
- AI 工作台：`assistant.html`、`js/assistant.js`、`js/assistant-timeline.js` 负责界面；`js/assistant-engine.js` 管理任务、版本、串行执行、取消与恢复；`js/assistant-contract.js` 校验输入、工具目录和计划；`js/assistant-tools.js` 适配业务工具和本机 AI 请求。
- 自动确认判断：`local-ai/assistant-approval.mjs` 复用 pi 0.85.1 公开 `ExtensionRunner.emitToolCall()`，通过鉴权 `/v1/assistant/approval` 核对用户原文与真实准备参数。明确的一次性提醒创建、单条一次性提醒的明确名称/时间修改可直接提交；删除、清空、重复提醒、有歧义或预览要求保留确认。模型不能声明已授权。SDK/服务失败须明确提示并保留确认卡，不用自研放行 fallback；自动提交计入现有工具/时间预算并保留版本、取消及 unknown 回执边界。见 `docs/technical/assistant-approval-pi-20260919.md`。
- 原生交互面板：`js/assistant-confirmation.js` 投影 Engine 的 `interaction`，覆盖 `waiting` 选择、`clarify` 补充、`review` 确认及 `failed/interrupted` 人工核对；已完成任务的可选按钮不弹窗。复用 `AlarmDesktop` 的同一 Native Messaging 连接与 `desktop-reminder/confirmation-view.swift`。选择/回答/取消通过 `Engine.respond()` 回到原串行入口，绑定任务、版本、状态、候选和有效期；文字回答明确延续当前问题，保留模型选择与限制。原生端不执行业务或建立第二份任务状态；unknown 不可重放。关闭仅隐藏，取消才停止；组件失败保留工作台。主动断连自行清理端口，发送失败不重放业务动作。协议 v4（旧 v3 卡片兼容），更新组件后须重载扩展。见 `docs/technical/assistant-interaction-native-20260920.md`。
- 错误恢复复用现有 Engine 循环：将可恢复失败写入 `observations` 和当前上下文来源，由模型重新规划；每执行轮最多恢复 3 次，工具失败仍按工具/参数/错误码第二次停止；规划校验额外区分当前 outline/execute 阶段和 Contract 登记的 `planIssue`，不将已恢复的空清单与后续不同错误合并。分类由服务/执行器生成并经 Gateway execution 元数据传递，未知类别不采信，预算不重置，仍计入 12 轮/12 工具/5 分钟边界。Tools 在实际写依赖调用前记录 `sideEffectStarted`；丢失写回执为 unknown，只可查询核对，不能自动重做或宣称完成。新写依赖须加入该标记路径。详见 `docs/technical/assistant-error-recovery-20260919.md` 与 `docs/technical/assistant-todo-protocol-20261008.md`。
- 本机 AI：`local-ai/server.mjs` 提供鉴权 HTTP/异步 job；`gateway.mjs`、`control-store.mjs`、`admission.mjs` 管理模型选择、开关、额度、超时、熔断与调用记录；`provider.mjs` 连接本机 LM Studio。新增模型能力必须经过该入口。
- 本机模型管理：`local-ai/models.sh` 列出共享模型目录并管理独立的 Laya 按需服务；`local-ai/laya-runtime/` 固定官方 `laya[serve]==0.3.11`、Python 锁文件及多语言权重 revision/SHA。Laya 权重和 StepAudio 一样存放于 `~/.lmstudio/models/` 的独立子目录，但不由 LM Studio 推理。首轮工具组预加载建议经 Gateway 接入，AI 设置和工作台分别显示独立的 Laya（Jev 类）模式开关，默认关闭，可选只观察或参与；原厂 Jev 未接入，也不列入 Qwen 生成模型选择器。服务故障、超时、预算和熔断均回到原有规则与 Qwen 规划，不影响执行器的确认、取消和回执。见 `docs/technical/local-model-management-20260924.md` 与 `docs/technical/assistant-laya-prefetch-20260924.md`。
- AI 工作台语音：`js/voice-input.js` 复用本地 Whisper 录音转写，只回填可编辑文字；`js/voice-live.js` 与 AudioWorklet 在工作台逐段采集，输入框文字可被后续识别修正，停顿后自动完成，仍需用户点击执行；音乐搜索页保留手动结束。Whisper 结果由 `local-ai/speech-provider.mjs` 经固定的 `opencc-js@1.4.2` 公共 API 转为简体，不能转换用户手写文字；录音过程的“取消”按钮保持中性颜色和固定文字。每段预览与最终转写均经过 `speech.transcribe` 控制和预算，不绕过网关。数字静音直接提示。录音失败须在按钮附近高对比度显示错误名和简短原文，区分页面权限策略与普通授权拒绝，并保留文字入口。控制状态与麦克风申请分别限时；等待麦克风时明确提示尚未录音，浮层受阻可打开独立扩展页面，迟到媒体流须立即停止。助手答复朗读在 `js/assistant-voice.js` / `js/assistant-voice-background.js` 按任务版本、真实助手消息及页面来源绑定，合成经 `speech.synthesize` 受控场景调用 `mlx-speech==0.5.2` 公开 `StepAudioEditXModel` API，使用官方公开中文参考音色。模型、参考音色、Python 和依赖锁定见 `local-ai/voice-runtime/`；本机权重与独立 Python 环境不入库。音频短期保留，朗读失败不能重做业务动作；等待、播放、失败状态在对应答复旁展示，页面暂时隐藏时继续本次朗读，关闭页面或浮层、任务变化及明确停止仍需取消。取消/超时须结束子进程，不能使用音乐 Offscreen 通道或静默回退。真实麦克风、网页浮层权限与长句资源占用仍须分别验收。见 `docs/technical/assistant-voice-stepaudio-20260923.md`。
- 规划超时恢复：同一轮默认在 90 秒内按 30 秒思考 / 剩余约 60 秒关闭思考恢复；同一执行轮成功降级后沿用 off，来源记录为 `recoveryFromRequestId`，不改用户设置。新执行轮、选择或策略变化后重新判断；仍遵守冷却、次数与任务总时限。见 `docs/technical/assistant-planner-timeout-20260919.md`。可选“规划思考起步”策略 `planningStrategy`（默认 `follow`，与现状一致；`adaptive` 时仅 `assistant.plan` 在非 outline 且已有真实工具回执（`tool` 不是 `assistant.plan`）时直接以 off 单次起步并独占超时，所选等级仍是上限，不改用户设置；来源记为 `startReason=adaptive-receipts`，不冒充 `recoveryFromRequestId`，也不使后续规划沿用 off；默认值由用户决定；2026-09-29 三轮冒烟 A/B（LM Studio 冷加载）规划耗时中位数约降 47%，但四目标场景无效计划 2 次对 0 次，未达“无效计划不增加”门槛，默认仍为 `follow`）。见 `docs/technical/assistant-speed-20260929.md`。
- 规划连续失败按一次 Gateway 规划的最终结果累计；内部恢复尝试仍计入调用预算、失败总数和耗时，但不单独触发冷却，避免堵住本轮 off 恢复。音乐 expectedRevision 必须来自最新有效队列状态/写入回执，不能使用 context.revision；单步写计划缺少可信版本时只投影为 music.state 并重新规划，unknown 仍由 Engine 阻止重做。见 `docs/technical/assistant-queue-recovery-20260920.md`。
- 上下文预算：`local-ai/assistant-context.mjs` 按加载容量预留输出及安全空间。估算与模型实际 usage 必须区分；不能回退为固定 6200 token 门槛。
- 上下文压缩：优先使用 pi 官方 `@earendil-works/pi-coding-agent` 公开 API 做历史切分和摘要；项目适配层负责受控 Provider、浏览器任务状态、预算、来源与回执。以技术文档和实际测试确定已实现范围。
- 当前接入为 `local-ai/assistant-compaction.mjs`（pi 0.85.1）和 `js/assistant-context-state.js`（业务状态适配），来源随活动任务快照持久化；不要再创建平行摘要引擎或第二个活动任务事实库。实现及验证见 `docs/technical/assistant-context-compaction-pi-20260919.md`。
- 长期记忆：`js/assistant-memory.js`、`local-ai/memory-store.mjs` 管理明确个人偏好；任务摘要不自动成为个人偏好。`local-ai/history-store.mjs` 是可选历史留存，默认不保存正文，不能当作完整原文日志。
- 跨任务经历记忆：`local-ai/assistant-experience.mjs` 从匹配且留存正文的真实工具回执提取经历，复用 `memory_entries`，通过 pi 0.85.1 公开 `serializeConversation()` 投影召回背景。`memory.recall` 只读；自由文本偏好必须来自本次明确“记住”原文。经历不是授权/当前回执，后续动作须重新取得对象引用；正文/经历开关、取消、删除墓碑和期限均须保留。见 `docs/technical/assistant-experience-memory-pi-20260920.md`。
- 音乐：已有搜索、候选/集合引用、队列、播放、定时停止和 Offscreen 播放通道；复用 `music-*` 模块及真实 revision 校验。不得将“已提交播放”说成“已播放”。超过24小时的保存队列仍在播放器展示供核对，旧播放快照不自动恢复；助手须称其为过期缓存。用户明确要求播放已有队列时，`music.queue.play` 可用 `stale` 真实版本受控恢复，确认实际起播后才刷新队列和播放模式。队列页和工作台都提供显式“保留并恢复”或“清空保存队列”：保留不播放，清空先确认，均核对真实版本；闲置但格式异常的缓存只允许清空。见 `docs/technical/music-queue-cache-restore-20260923.md`。
- 过期队列工具加载：`local-ai/assistant-service.mjs` 在用户要求清空/保留/恢复、且最新队列回执成功返回 `stale`/`unavailable` 和有效版本时，按需提供已有 `music.queue` 组；旧回执、失败和未知态不能据此预加载。仅曝光工具合同，清空确认、版本和 unknown 限制仍由原执行器负责。其他未加载工具的错误须给出工具名及当前应用内有效的 `tools.load` 计划；被禁用的入口不能伪装成可加载工具。见同一队列技术文档的 2026-09-28 补充。
- 提醒：已有 `alarm-*` 模块、确认卡、倒计时和桌面提醒。原生浮窗复用 AppKit 材质遮罩、等比例缩放与尺寸/位置记忆，相关视图在 `desktop-reminder/countdown-view.swift`。修改提醒复用管理路径，不能误走新建。
- 网站工作区：`js/site-workspace-core.js` V3 在原存储键上保留旧页面为固定入口，新自动发现标签为临时页面；固定地址不随浏览跳转覆盖。来源只用 Chrome `openerTabId` 或固定入口同标签跳转，不按同域猜测；固定、重命名、关闭与最近关闭复用同一服务，最近关闭最多 30 条/7 天。后台与侧栏共享 Web Locks 串行存储事务；普通分组名称查找不依赖 AI，自然语言匹配仍走 `SceneAI`。见 `docs/technical/site-workspace-fixed-pages-20260920.md`。
- 视频：Bilibili/YouTube 已有搜索、详情、分页和本地观看记录。AI 候选及 `video.open` 统一通过 `js/app-video.js` 深链进入 App 内播放器，复用 controller 的 `openVideo`，保留秒数和 B 站分 P；YouTube 未授权入口留在 App 内连接/搜索。`opened` 仅为 App 页面打开回执，不能视为播放确认；新依赖 `openVideo` 必须保留副作用/取消/unknown 边界。不能将标题当正文或声称看过没有读取的字幕。见 `docs/technical/assistant-video-in-app-20260922.md`。
- 视频工作台省电：`js/main.js` 复用 B 站/YouTube 已有 body 状态与 Page Visibility，暂停被遮挡的首页视频壁纸、背景 Canvas/CSS 动画和自动轮换；全部工作台关闭且标签页可见后恢复。`js/background-experience.js` 仅在液态、动态天气或手势玩法需要绘制时调度单条 RAF；迟到的壁纸 play 失败不得覆盖新背景。只操作首页背景，不能暂停前景视频、音乐或助手朗读。见 `docs/technical/video-background-suspension-20260927.md`。
- YouTube 首页推荐：`js/youtube-home.js` 与 `integrations/youtube-home/` 复用 YouTube.js 18.0.0 的公开 `getHomeFeed()` / `HomeFeed.getContinuation()`，在 YouTube 页面内使用网页登录态；与原订阅聚合及 OAuth 分开。Cookie 不离开网页执行环境，不进 AI/存储/日志；后台仅保留有期限、绑定来源的分页内存，UI 只收卡片与不透明游标。SDK 失败不得换成游客或订阅推荐。生成文件为 `vendor/youtube-home/page.js`，修改源文件后须重建。卡片发布日期在已有 OAuth 可用时通过只读 videos.list 分批补齐，未授权/失败则保留网页相对日期，不能估算为准确日期。订阅“为你推荐”复用同款紧凑日期布局，并用一次 videos.list 批量补齐时长；保持原 App 内播放入口。真实账号验收尚未完成，见 `docs/technical/youtube-home-feed-20260922.md`。
- `cursor-bridge/` 是独立服务，不能假定其数据库或依赖已经被 `local-ai/` 共享。
- AI 工作台的任务/工作日志快速添加通过 `js/quick-capture.js` 与两个 App 共用记录构造，工具为 `task.create`、`worklog.projects`、`worklog.create`。日志耗时必填，项目须来自真实引用；写入经过 Engine 的副作用标记、确定性 ID 与回读核对，不将 unknown 自动重做。见 `docs/technical/assistant-quick-capture-20260923.md`。

- 强制 Todo 路线：`js/assistant-todo.js` 在原任务快照中保存完整目标、原文分项和逐项进度。模型先用 `planningPhase=outline` 单独分析完整 Todo，保存后才用 `execute` 规划一步工具；分析阶段不保存或执行夹带步骤。贴片附在主面板右侧，支持收起为带进度的小标签，本页折叠偏好通过 sessionStorage 保留；宿主与 iframe 按固定展示状态同步宽度，磨砂底板与点击范围仅覆盖两张卡片的真实边界，位置变化须重新投影；窄屏贴边展开。逐项打勾，完成后保留；“播放添加到队列里的歌曲”不能误判为再次追加。后续不能覆盖或勾选，由 Engine 将当前事项绑定真实工具回执。未完成不得 `done`，漏 `continue` 仍沿原循环继续，确认、选择、恢复及压缩保留进度；不重放 unknown，不绕过12轮/12工具/5分钟边界。工作台展示同一快照；pi 0.85.1 无公开 Todo 状态组件，不导入其内部示例。见 `docs/technical/assistant-todo-tips-20260928.md`。
- 明确的“播放/随机播放当前队列”短句由 `MusicIntent.queuePlayRequest(text, { bare })` 按封闭语法精确识别（含“随机播放列表歌曲”“列表歌曲随机播放”“队里中的歌曲”等真实说法；含歌手、条件或复合内容一律不命中；裸“随机播放”仅在调用方传入 `bare` 时命中，规则是当前任务没有待选候选，路由与 `Tools.quickQueuePlayPlan` 共用 `Contract.hasCandidates()`），先保存单项 Todo，再由原 Engine 读取 `music.state` 的真实版本、调用一次 `music.queue.play` 并验收起播回执。空队列不播放；过期保存队列仅在用户明确播放时沿原 `stale` 版本路径恢复，不一致队列须核对。取消、unknown、预算与重复写保护仍由原链路负责。具名歌手请求保留原歌手路径，复合及含条件请求走完整规划；未执行的本地快捷候选若未通过 Todo 校验，记为“快捷规划未命中”并转模型分析，不计错误恢复。见 `docs/technical/assistant-todo-tips-20260928.md`。

- 无进展保护：`js/assistant-engine.js` 在活动任务快照中保存 `readSeen`（工具名 + 键排序参数的只读调用指纹，最多 24 条，参数超过 2000 字符不判定）。成功且不等待的计划内只读调用追加；写入/准备工具、用户选择动作、`choose()` 开始新执行轮以及工具执行失败/unknown 恢复会清空，规划阶段的模型修复不清空。`nextPlan()` 拒绝 `steps[0]` 与已读指纹完全相同的只读提议（含重复 `tools.load`），以 `ASSISTANT_PLAN_INVALID` 进入现有 modelRepair 恢复一次，再次重复由 `ASSISTANT_RECOVERY_LIMIT` 停止；不新增预算或分支，不放宽 12 轮/12 工具/5 分钟与 3 次恢复，也不清除或重放业务动作。见 `docs/technical/assistant-speed-20260929.md`。

- 本地队列按歌手批量移除：`music.queue.removeArtist(artist, expectedRevision)` 复用 `MusicQueuePolicy`、现有确认引用和 `editMusicQueue`，按完整歌手名匹配（含合唱）、一次确认后单次写入剩余队列；不逐页/逐首模型循环，不搜索云端删除对象。命中当前曲目先停止，其余播放保留；版本/集合变化、取消、unknown 和私人FM边界均须保留。“清除队里中…”须进入队列编辑规划。见 `docs/technical/assistant-queue-remove-artist-20260928.md`。

- 任务 Todo 属性与合同：仅在任务应用或 `task-add` 中，将前一原文分项后明确标注的截止时间/日期、优先级、描述、备注和链接合入该来源，保留完整原文；普通任务行、其他应用及12项限制不变。分析目录由 `AssistantContract.tools` 投影允许的验收字段，排除运行时引用/版本，并复用任务技能和本地日期。未知字段错误明确指出条目、工具、字段和允许字段，不回显任意字段文字或参数值；模型仍通过原有有界恢复。任务/日志保存 ID 使用当前 Todo 编号，避免每轮步骤下标重置后不同目标碰撞；旧无 Todo 路径沿用步骤下标。见 `docs/technical/assistant-task-todo-20261008.md`。

- Todo 阶段协议：outline 必须返回1至12项目标或单独 question，不能返回空清单或模型进度；execute 提示只要求当前一步、追问或有回执的完成，并按当前 Todo 最终工具预加载同一应用的已登记工具组说明，仅曝光合同，不执行或授权工具。服务与 Engine 共用 `Todo.executionPlan()`，仅在模型复述的每项定义及所有附带 id/status/receiptId 均与真实快照相同时丢弃副本，不改变清单；改项、删项、重排、勾选或伪造回执仍拒绝。播放队列时附带“过期则恢复”以既有 `music.queue.play` 的真实起播验收，恢复属于前置条件；保留而不播放仍为独立 reconcile 目标。旧 keep 清单的当前项可由最新成功 ready/非空/有版本的队列读取证明无需恢复，stale/unavailable/empty/unknown 不勾选。见 `docs/technical/assistant-todo-protocol-20261008.md`。

## 状态与上下文不变量

- 模型输出是待校验计划，不是执行事实。完成状态、动作回执、对象引用、版本和确认状态由执行器拥有。
- 压缩不得丢失用户明确限制，不得复活过期引用，不得把 prepare/waiting/unknown 变成 succeeded；重试模型不重放已完成业务动作。
- 取消、任务版本变化、控制策略变化后，晚到的模型结果不得更新任务或继续执行。清理与删除应覆盖派生摘要，防止数据复活。
- 大工具结果应使用字段投影、分页和可校验引用；不要简单只取前几项而丢掉用户选中的对象。
- 任何重试、压缩都要有次数和时间界限，并纳入用量统计；不能重置执行器现有预算以实现无限执行。

## 验证与交付

- 本机 AI 依赖在 `local-ai/` 内执行 `npm ci`；Node 版本须满足 `local-ai/package.json` 及所用 SDK 的要求。
- 按改动运行有意义的 `node --test test/...`；AI 链路修改需覆盖 SDK 真实调用、预算、取消、恢复、输出校验和业务副作用次数。
- 对修改脚本做语法检查，执行 `git diff --check`；文档与工具合同、界面提示保持一致。
- 分别报告静态检查、业务替身测试、真实本机模型、HTTP 预览、真实 Chrome 扩展和真实账号验证。不得把其中一个层级写成另一个层级通过。
- 实测模型只使用受控本机入口；验证复杂业务优先使用替身，不随意操作真实播放队列、提醒或账号。
- 在技术文档说明复用了哪个上游版本/API、自有适配范围、验证结果及仍存在的边界。原有能力变更时同步更新本文件。
