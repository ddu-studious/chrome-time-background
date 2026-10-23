# AI 工作台外部模型兜底（2026-10-23）

## 当前能力

设置 → AI 控制台 → 外部模型兜底。默认关闭，支持自动兜底和始终使用外部模型；可配置 DeepSeek 模型名称、CPU 阈值、空闲内存阈值、上下文预算及是否因本地容量不足而外发。默认模型 `deepseek-flash`。

当前只覆盖工作台的 `assistant.plan`（规划和回答）与 `assistant.compact`（上下文整理）。其他独立业务场景、语音、向量、Laya 和代码计算继续使用原有本机路径。外部模型没有业务工具执行权；输出继续经过 Contract、Todo、Engine、确认卡、对象引用、资源版本和 unknown 回执边界。

自动模式在模型请求前选择本机或外部：

1. 两段连续 500 ms 的整机 CPU 使用率都达到阈值，默认 85%；或 `os.freemem()` 低于阈值，默认 1024 MiB。
2. 本机 Provider 繁忙，或查询本机模型容量时遇到断连、服务端故障、模型不存在或超时。
3. 本机分词确认输入超过可用预算；冷模型则使用已有保守估算。容量兜底开关可单独关闭。

每条模型请求单独判断，不修改用户的本机默认模型或思考设置。已开始的本机生成不会在中途迁移，生成期间的超时仍走原有受限恢复。外部失败明确停止，不转回本机重做。关闭兜底时不采样机器、不发送外部请求。自动模式的采样约增加 1 秒请求准备时间，不使用常驻采样定时器。

`os.freemem()` 是空闲物理内存，尤其在 macOS 上不等同于 Activity Monitor 的内存压力或可回收内存；阈值可调整。CPU 采用整机累计时间差，取两段使用率的较小值，不把一次尖峰当作持续繁忙。资源检查仅决定去向，不卸载已加载的本机模型。

## SDK 与接入范围

直接固定 `@earendil-works/pi-ai@0.85.1`（MIT），复用其公开导出 `@earendil-works/pi-ai/api/openai-completions.lazy` 的 `openAICompletionsApi().stream(...).result()`。检查过同版本公开 README 的 Custom Providers、OpenAI Compatibility Settings，以及公开 `ProviderRequestOptions` 的 `apiKey`、`fetch`、`signal`、`timeoutMs`、`maxRetries`、`onPayload`。这条路径不创建 coding-agent 会话、不加载用户全局插件、不授予 shell 或文件工具。

SDK 负责协议和流式响应解析。本项目薄适配层只负责固定目标、密钥、禁重定向、有界响应、超时、JSON 输出、关闭思考和业务合同衔接；没有另写兼容协议解析器。设置 `maxRetries:0`，外部每轮最多一次生成，继续计入 Gateway 的每日请求预算、场景熔断和 Engine 既有任务预算。

已核对 [DeepSeek 官方接入说明](https://api-docs.deepseek.com/)、[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[JSON Output](https://api-docs.deepseek.com/guides/json_mode/)。使用官方固定 `https://api.deepseek.com/chat/completions`，关闭思考 `thinking:{type:'disabled'}`，规划设置 `response_format:{type:'json_object'}`。不传业务工具，不接受工具调用、截断结果、空答复或无效 JSON。

通用 SDK 可以覆盖其他兼容服务，但仓库没有经过安全评审的通用 SafeUrlClient。首版不接受任意 base URL、代理或重定向；业务请求和模型不能指定 endpoint。后续增加供应商应扩充可信代码中的固定目标并验证其协议，不开放未经验证的 URL 抓取能力。

## 上下文与回执

本机已加载模型继续通过官方 LM Studio SDK 真实计数，计数故障明确拒绝，不冒充容量不足或静默改用估算。真正超限时，在现有 `prepareModelContext` 内切换到外部预算，仍保留用户限制和执行回执。外部最大规划窗口沿用 32768 token 的项目上限，可配 8192–32768，并预留原输出额度和 512 token 安全空间；不因供应商宣传更大窗口而扩大项目边界。

外部请求没有本地分词器，明确标记 `tokenCountSource:remote-conservative-estimate`、`contextSource:remote-config`，不会写入 `measuredInputTokens`；实际响应用量来自 SDK 的服务端 usage，未返回时保持未知。外部仍超限则保留原记录并按原有压缩或错误路径处理，不裁掉业务事实来换取成功。

调用记录新增 `routing:{provider,model,reason,configRevision,resource?}`，工作台过程显示外部模型和切换原因，历史详情及导出也保留该信息。`requestedModel` 保留原本机选择，`model` 和 `reasoning` 记录实际外部模型及 off。外部成功的 off 不会被当成本机思考降级，从而影响后续本机规划。

## 配置、凭证和启用

- 外部配置单独写入被 Git 忽略的 `local-ai/.local/remote.json`，目录 0700、文件 0600、原子写入、独立递增 revision。密钥是当前本机账户可读的明文文件，不是系统钥匙串。
- `GET /v1/control` 的 `remote` 仅有公开配置、版本与 `keyConfigured`，无密钥。`POST /v1/control/remote` 复用本机 Bearer 认证、Host/Origin 检查和 JSON 大小上限，按 `expectedRevision` 拒绝冲突。密钥不进入扩展 storage、控制策略历史或日志；保存后清空密码输入框。留空保留，勾选清除时须同时关闭。
- 外部配置更新撤销尚未消费的旧 job；生成前后及计数前后检查策略与外部配置版本。取消或配置变化后的迟到结果不得进入执行器。SDK 异常只输出固定错误，不回显供应商错误正文、提示词或凭证。
- 出站固定 HTTPS 官方目标、禁止重定向，不使用用户代理配置；总响应不超过 2 MiB，外部调用继续受配置超时和取消约束。总模型开关与单场景开关同样控制本地和外部；请求数是预算，不是金额限额。
- 本机控制策略回滚只恢复原策略，不恢复密钥或外部配置版本。配置界面明确提示启用后会发送当前请求所需的输入、背景和工具回执，并可能产生费用。

依赖已执行 `npm ci --ignore-scripts`。启用新服务代码需重启本机服务，重载扩展并重新打开工作台，再在设置中填写 API Key；不在聊天、源码或配置样例中粘贴真实密钥。首次建议选择“始终使用外部模型”做纯问答验证，通过后改成自动兜底。

```bash
./local-ai/service.sh restart
```

初次实现没有重启用户服务或开启外部模式。随后经用户明确要求，已通过 `service.sh restart` 重启真实本机网关并在个人 Chrome 的扩展详情页重载扩展；入口和个人记忆均已读回就绪，LM Studio 可连接、模型尚未加载。没有填写密钥或发起真实 DeepSeek 请求。

## 主动选择 DeepSeek 与运行接入（同日补充）

保存密钥并启用“自动兜底”或“始终使用外部模型”后，工作台的模型下拉框新增 `DeepSeek · 配置中的模型名`。主动选择立即使用外部模型，不等待 CPU/内存条件，也不改全局默认模式。浏览器用既有受控 `selection.model` 传递固定标识 `deepseek:configured`，网关只在工作台规划/整理场景内将它映射为服务端配置的真实模型，业务输入不能借此指定 URL 或其他供应商。

未配置或已关闭时，选项显示“请先在 AI 控制台配置并启用”且禁用；后端同样拒绝此选择，不静默改用本机。工作台重新获得焦点时刷新公开模型能力。独立的本地提醒/音乐解释场景不接收这个外部规划标识，继续沿用原本的本地调用合同、预算和确认边界。

修正服务守护的健康判定：鉴权 `/v1/control` 返回的 `version:1` 与场景列表用于验证网关；`localOnly:false` 仅表示已启用外部能力，不能被当作网关不健康。原有有界卸载、启动重试和就绪等待保持不变。

本轮 853 项并行回归中 852 项通过，语音子进程启动 PID 的 500 ms 时序用例在并行负载下失败；该文件单独复测 8/8 通过。新增的主动选择、关停拒绝、局部解释器路由和双模式健康检查均通过；构建新鲜度、语法与 diff 检查通过。

配置页交接仍需用户完成：浏览器自动化安全策略明确拒绝 `chrome-extension://` 导航，并禁止通过其他入口绕过，因此没有自动打开配置页。已请用户手动进入“设置 → AI 控制台 → 外部模型兜底”填写密钥。

## 验证

- 相关 Node 回归 849/849：涵盖 AI 网关、工作台、上下文、pi 摘要、官方 LM Studio 计数、确认、取消、恢复、沙箱与设置合同。
- 新增 20 项外部测试使用真实 pi SDK，HTTP transport 为隔离替身：请求字段、SSE 解析、用量、429/401/500 无 SDK 重试、截断/工具调用/空 JSON 拒绝、响应大小、超时、取消、秘密脱敏、预算与配置冲突。
- 真实 Engine + Tools + 外部 SDK 替身完成“清空队列”：确认前 0 次写入、确认后 1 次，四次模型调用进入统一统计；测试没有接触个人音乐队列。
- Playwright 独立 HTTP 预览验证默认关闭、假密钥保存后输入框清空、已保存状态与窄屏表单。预览从正式设置页提取 AI 区块，配置仅存内存，不接真实扩展或模型。
- 新 SDK 直接依赖锁定 0.85.1，原有依赖版本没有升级；npm audit 仍报告原有 pi-coding-agent、brace-expansion、undici 三项（1 moderate、2 high），未执行自动修复。外部适配使用官方 SDK 的 fetch 注入和 Node 默认 fetch，不使用上述包的 Agent 执行或 RetryHandler。
- 尚未进行真实本机模型、真实 DeepSeek 密钥与付费请求、真实 Chrome 扩展及真实账号验收；不能将 SDK 替身或 HTTP 预览视为这些层级已通过。

安全自查：复用本机鉴权和资源授权边界；外部目标固定、禁止重定向、响应与超时有界；密钥仅私有本机配置保存且不回显；文本输出沿用 textContent；工具权限、确认与 unknown 幂等边界保持有效。
