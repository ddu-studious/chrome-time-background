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
- 外部确认浮层：`js/assistant-confirmation.js` 只投影 Engine 的 `review` 状态，复用 `AlarmDesktop` 的同一 Native Messaging 连接与 `desktop-reminder/confirmation-view.swift` 原生面板。确认/取消必须回到同一 Engine 的串行入口，绑定任务、版本、候选、有效期；不得在原生端执行业务或建立第二份任务状态。关闭仅隐藏，取消才停止任务；组件失败保留工作台确认。主动断连须自行清理端口，不能依赖本端 `onDisconnect`；发送失败丢弃失效连接，不重放业务动作。桌面错误仅属于当前有效确认卡，完成、取消、隐藏或过期即不再显示。协议 v3，安装组件后须重载扩展。见 `docs/technical/assistant-external-confirmation-20260920.md`。
- 错误恢复复用现有 Engine 循环：将可恢复失败写入 `observations` 和当前上下文来源，由模型重新规划；每执行轮最多恢复 3 次，同一工具/参数/错误码第二次失败即停止，仍计入 12 轮/12 工具/5 分钟边界。Tools 在实际写依赖调用前记录 `sideEffectStarted`；丢失写回执为 unknown，只可查询核对，不能自动重做或宣称完成。新写依赖须加入该标记路径。详见 `docs/technical/assistant-error-recovery-20260919.md`。
- 本机 AI：`local-ai/server.mjs` 提供鉴权 HTTP/异步 job；`gateway.mjs`、`control-store.mjs`、`admission.mjs` 管理模型选择、开关、额度、超时、熔断与调用记录；`provider.mjs` 连接本机 LM Studio。新增模型能力必须经过该入口。
- 规划超时恢复：同一轮默认在 90 秒内按 30 秒思考 / 剩余约 60 秒关闭思考恢复；同一执行轮成功降级后沿用 off，来源记录为 `recoveryFromRequestId`，不改用户设置。新执行轮、选择或策略变化后重新判断；仍遵守冷却、次数与任务总时限。见 `docs/technical/assistant-planner-timeout-20260919.md`。
- 上下文预算：`local-ai/assistant-context.mjs` 按加载容量预留输出及安全空间。估算与模型实际 usage 必须区分；不能回退为固定 6200 token 门槛。
- 上下文压缩：优先使用 pi 官方 `@earendil-works/pi-coding-agent` 公开 API 做历史切分和摘要；项目适配层负责受控 Provider、浏览器任务状态、预算、来源与回执。以技术文档和实际测试确定已实现范围。
- 当前接入为 `local-ai/assistant-compaction.mjs`（pi 0.85.1）和 `js/assistant-context-state.js`（业务状态适配），来源随活动任务快照持久化；不要再创建平行摘要引擎或第二个活动任务事实库。实现及验证见 `docs/technical/assistant-context-compaction-pi-20260919.md`。
- 长期记忆：`js/assistant-memory.js`、`local-ai/memory-store.mjs` 管理明确个人偏好；任务摘要不自动成为个人偏好。`local-ai/history-store.mjs` 是可选历史留存，默认不保存正文，不能当作完整原文日志。
- 跨任务经历记忆：`local-ai/assistant-experience.mjs` 从匹配且留存正文的真实工具回执提取经历，复用 `memory_entries`，通过 pi 0.85.1 公开 `serializeConversation()` 投影召回背景。`memory.recall` 只读；自由文本偏好必须来自本次明确“记住”原文。经历不是授权/当前回执，后续动作须重新取得对象引用；正文/经历开关、取消、删除墓碑和期限均须保留。见 `docs/technical/assistant-experience-memory-pi-20260920.md`。
- 音乐：已有搜索、候选/集合引用、队列、播放、定时停止和 Offscreen 播放通道；复用 `music-*` 模块及真实 revision 校验。不得将“已提交播放”说成“已播放”。
- 提醒：已有 `alarm-*` 模块、确认卡、倒计时和桌面提醒。原生浮窗复用 AppKit 材质遮罩、等比例缩放与尺寸/位置记忆，相关视图在 `desktop-reminder/countdown-view.swift`。修改提醒复用管理路径，不能误走新建。
- 视频：Bilibili/YouTube 已有搜索、详情、分页和本地观看记录。不能将标题当正文或声称看过没有读取的字幕。
- `cursor-bridge/` 是独立服务，不能假定其数据库或依赖已经被 `local-ai/` 共享。

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
