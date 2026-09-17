# 本地 AI 入口与智能闹钟

## 对话与调用历史（2026-09-16）

快捷助手现已补充工具执行轨迹：规划、搜索/读取请求、用户选择的动作及播放确认等步骤均可展开；查看参数/结果需开启正文留存。模型请求可关联到具体步骤。历史记录中的工具次数与模型调用次数分别统计，旧记录无法补回工具过程。

设置 → AI 控制台增加长期历史：会话/用户消息/模型次数、逐次模型与思考等级、正文查询、导出和删除。历史保存在 `.local/history.json`，默认 30 天，正文默认关闭。需要查看原句和回复时开启“留存对话正文”。旧记录无法补回，服务离线期间无法保证留存。详见 [数据结构、留存边界与验证](../docs/technical/ai-history-20260916.md)。本节覆盖下文旧版本“仅有内存记录”的说明，原有内存运行记录仍保留。

快捷助手已扩展为轻量浮层和多类音乐对象，支持拼音匹配。参见 [最新实现与验收边界](../docs/design/assistant-v2-implementation.md)。

## 快捷助手 MVP（2026-09-15）

新增 `assistant.plan` 场景和 `skills/` 下的四个应用技能，接入扩展的统一输入条。支持 `@` 应用、`/` 动作、最多三步受控计划、真实候选选择和执行结果回执；简单操作复用离线解析。使用方式、工具范围和验收边界见 [快捷助手 MVP](../docs/requirements/assistant-command-mvp.md)。

## 统一控制面基础（2026-09-12）

现有闹钟 HTTP 接口现已通过统一场景网关。新增 `POST /v1/ai/interpret`，请求为 `{scene:"alarm.interpret",input:{text,now,timeZone,turns?,reasoning?}}`，返回 202 和 jobId；使用 `GET /v1/ai/jobs/:jobId` 轮询。旧接口继续兼容。

`GET /v1/control` 使用同一 Bearer 鉴权，返回场景清单、模型开关和最近 100 条内存调用记录，不包含正文和模型原文。`LOCAL_AI_MODEL_ENABLED=false` 关闭模型调用；`LOCAL_AI_DISABLED_SCENES=alarm.interpret` 关闭单个场景的模型调用，简单规则仍可用。修改启动环境后重启本服务生效。

控制台位于设置页的“AI 控制台”入口。策略保存到 `.local/control.json`，重启恢复；文件存在时优先于初始环境变量。支持版本冲突检测与历史回滚、查看和取消运行中的请求。其他业务的模型入口尚未迁移。本次相关测试 37/37 通过，运行服务已更新，真实 Qwen 经统一入口解析通过；真实 Chrome 扩展端尚待验收。完整规划见 [AI 路线图](../docs/requirements/roadmap-ai-control-plane.md)。

本机 Node.js 服务封装 LM Studio，第一项业务是中文闹钟解析。普通时间表达在扩展内离线处理；复杂口语调用本机 Qwen。服务只返回候选闹钟，不持有扩展存储权限，也不负责到点响铃。

## 启动和连接

需要 Node.js 22.13+，无需安装 npm 依赖（个人记忆使用内置 SQLite）。

1. 在 LM Studio 的 Developer 页面启动本地服务。默认连接 `http://127.0.0.1:1234`，默认模型为 `qwen/qwen3.8-27b`。首次生成可能触发模型加载；如果关闭了 LM Studio 的即时加载，请先手动加载该模型。
2. macOS 推荐双击本目录的 `启动本地AI.command`，或运行 `./service.sh start`。首次安装当前用户的 LaunchAgent 并启动入口，之后登录自动启动、进程退出后自动恢复；重复执行复用现有进程，终端可关闭。入口仅监听 `127.0.0.1:19841`。其他系统或临时前台调试仍可执行 `npm start` 并保持终端运行。
3. 在 Chrome 扩展管理页重新加载扩展（此次增加了本机服务地址权限），再刷新新标签页。
4. 打开闹钟 → 本地 AI，将此目录下 `.local/token` 文件里的内容粘贴到连接令牌框，点击“保存设置”。该文件首次启动时生成，只有当前本机账户可读写，已加入 Git 忽略。
5. 点击“检查状态”。输入“明天下午三点开会，提前十分钟提醒我”，应显示具体日期、14:50 和“已设置”。缺少时间会追问，直接在原输入框补充即可。

可以先用“20分钟后提醒我休息”验证离线路径。第一次连接令牌是本服务自己的令牌，与 LM Studio 的可选 API Token 不同。

## 配置

| 环境变量 | 默认值 | 用途 |
| --- | --- | --- |
| `LM_STUDIO_URL` | `http://127.0.0.1:1234` | 仅接受本机 HTTP 地址 |
| `LOCAL_AI_MODEL` | `qwen/qwen3.8-27b` | 模型别名 local-default 的实际映射 |
| `LOCAL_AI_REASONING` | `off` | 服务默认推理等级；扩展保存的选择会按请求覆盖 |
| `LM_STUDIO_TOKEN` | 空 | LM Studio 开启认证时配置 |
| `LOCAL_AI_PORT` | `19841` | 调整时也需同步扩展地址与权限，日常保持默认 |

更换模型后重启本服务即可。Gemma 的本机模型 ID 是 `google/gemma-4-26b-a4b`，尚未做闹钟准确率验收。不会自动同时加载两个大模型或回退到云端。

## 接口契约

所有接口需要 `Authorization: Bearer <本服务令牌>`。JSON 请求最多 16 KiB，用户输入最多 500 字。

- `GET /health`、`GET /models`：LM Studio 模型状态，区分 `ready`、`not_loaded`、`busy`、`model_missing`；连接失败返回明确错误。
- `POST /v1/alarms/interpret`：提交 `{text, now, timeZone, turns?, reasoning?}`，`now` 为首次提交时的 Unix 毫秒数，`timeZone` 为 IANA 时区。返回 HTTP 202 `{ok:true,status:"pending",jobId}`。
- `GET /v1/alarms/jobs/:jobId`：返回 `pending`、`ready`（含 `alarm` 和 `displayText`）、`needs_clarification`（含 `question`）或 `{ok:false,error}`。解析结果仅在内存保留 5 分钟，最多 32 个任务。

澄清时仍使用原始 `now`，`turns` 最多 8 条，只包含此前的 user/assistant 澄清问答。点击“重新输入一条提醒”清空上下文并重新计时。解析完成不等于保存完成：扩展收到原有 `user_alarm_save` 成功回执后才显示“已设置”。

## 边界与实现

- 当前支持创建一个一次性、每日或按星期重复的闹钟，也支持按明确日期和时间给已有一次性闹钟改名。法定节假日/调休、每月、重复的开始/结束日期、多条批量、自然语言取消已有闹钟暂不支持；修改用“修改”进入原编辑器。
- 工作日明确显示周一至周五。已过时间不自动顺延。午夜歧义会追问，非法日期和夏令时重复/不存在的时刻拒绝自动创建。
- `js/alarm-intent.js` 负责严格本地解析、时间语义校验和时区计算；`local-ai/alarm-service.mjs` 管理闹钟提示词；`provider.mjs` 是可复用模型适配器。
- 当前 MLX 路径使用 LM Studio 原生 `/api/v1/chat` 明确设置 默认 `reasoning: off`、`store: false`；off 模式输出上限 650 token，启用推理时为 4096 token（包含思考预算）。提示模型返回 JSON，再由业务程序严格校验；没有声称使用语法约束的 JSON Schema 解码。
- 同时最多一个模型生成请求；繁忙时明确报错，不堆积大模型任务。服务推理超时 90 秒，扩展通过短请求轮询，避免 MV3 Worker 等待长 HTTP 响应而被终止。
- 请求仅到本机；校验 Host、Origin 和令牌，不开放通配 CORS。令牌仅存扩展本地存储。默认不记录提醒正文、不启用模型工具调用。LM Studio 自身日志策略由其设置控制。
- 到点声音、通知、稍后提醒继续使用原闹钟调度。电脑睡眠或 Chrome 完全退出时无法承诺准点响铃。

## 验证

在项目根目录执行 `node --test test/local-ai*.test.mjs test/alarm-clock-contract.test.js`。

本地服务启动后执行 `node local-ai/smoke.mjs`，调用真实 Qwen 的五条用例，只解析，不创建真实闹钟。输出结果保存到忽略的 `.local/smoke-results.json`。2026-09-12 的 off 模式实测 5/5 通过，首次约 18 秒，其余约 12 秒；该耗时不代表 low 模式。

`test/fixtures/smart-alarm-preview.html` 是隔离交互夹具，使用真实界面和规则解析，存储/通知/模型是测试替身；不代表真实扩展响铃验收。

可运行 `node local-ai/preview.mjs`（项目根目录）打开隔离 HTTP 预览。预览服务只提供指定的测试文件，不公开项目目录或令牌。桌面创建/撤销、480px 追问界面已验证；480px 下页面宽度为 480、面板内容宽度为 454，无横向溢出。截图位于 `output/playwright/smart-alarm-desktop.png` 和 `smart-alarm-mobile.png`。

当前相关测试 29/29 通过；上一轮全项目共 503 项，501 通过，剩余两项是 `bilibili-v5-contract.test.js` 和 `music-view-contract.test.js` 对既有 `product-ui-v5.css?v=48` 的旧版本断言，与本次改动无关，未修改。真实扩展的重载、权限生效和到点声音通知尚未验收。

官方协议参考：https://lmstudio.ai/docs/developer/rest/chat

## 推理等级选择

闹钟 → 本地 AI → 推理等级，检查状态后按模型能力动态显示可选值。当前 Qwen 返回 off、low、medium、xhigh、on；Gemma 返回 off、on。不支持的等级明确报错，不静默降级。默认 off，原有只保存令牌的配置自动使用 off。已经明确保存的其他等级会保留；若要切换，选择 off 后保存。保存等级时无需重新粘贴令牌，选择仅影响后续模型请求，简单离线解析不调用模型。此设置按请求传递，不修改 LM Studio 聊天界面的全局偏好。

2026-09-12 新增 low 实测：相同五条用例 5/5 通过，请求耗时约 12–20 秒；服务健康检查确认 defaultReasoning=low。等级默认值、参数透传、保留令牌和拒绝不支持等级已加入相关测试。其他等级此次仅核对模型能力及参数透传，未逐项运行真实模型验收。

## 一句话改名

输入 `2026-09-12 16:26 的闹钟名称修改为：你好，闹钟`，按日期和时间定位现有一次性闹钟。支持“名字改为”“改名为”“重命名为”等明确表达，离线处理，不调用 Qwen。找到唯一目标直接更新名称；多个匹配显示选择按钮；无匹配只报错，不创建新闹钟。已关闭/已过期闹钟也能改名，不重新启用、不改变日期、时间、声音或稍后提醒。当前自然语言修改范围仅为这种改名；改时间、删除和重复闹钟编辑仍使用列表按钮。

后端 `user_alarm_rename` 重查目标，选择时检查 revision，返回成功回执后页面才显示“已修改名称”。改名完成不会显示“撤销创建”，避免误删原闹钟。2026-09-12 默认等级已恢复 off；上述 low 耗时记录为此前测试。

## 控制台模型参数

统一策略支持 model（null 使用服务默认模型）、reasoning（默认 off）、timeoutMs（5000–90000）、maxOutputTokens（64–4096）。闹钟页面展示控制台等级，不再独立决定推理参数。已有策略文件缺少新字段时补默认值。关闭推理时有效输出预算为配置值与 650 的较小值。模型能力由本机模型清单校验，未知模型/不支持的推理等级明确失败。

闹钟“取消解析”仅撤销尚未保存的解析；进入保存后按钮隐藏。取消后本地立即停止消费结果，后台取消请求失败也不会继续保存。真实扩展入口验证仍待完成。

## 本地语音输入（开发中）

设置 `LOCAL_AI_SPEECH_MODEL` 为 whisper.cpp 兼容模型的绝对路径后启动服务。当前程序默认 `/usr/local/bin/whisper-cli`；音频不会自动转发云端。`POST /v1/speech/transcribe` 接收 `{audio: base64Wav}`，返回 jobId，复用 `/v1/ai/jobs/:jobId` 轮询和取消。录音上限 29 秒，服务最多接受 30 秒规范 WAV。

音乐搜索页点击“说一句话”录音，再点击“结束录音”提交本机识别；转写后检查文字再点击执行。控制台未配置语音模型时不会申请麦克风。临时音频识别后删除，转写结果与其他解析任务一样只在服务内存中短暂保留。真实麦克风及语音模型验收尚未完成，新增功能需要重启服务并重载扩展后生效。

2026-09-12 已在当前运行服务配置本机现有 small 模型，用生成的“暂停播放”音频完成真实 Provider 和统一 HTTP 入口测试，转写为“暫停播放”，约 4.1 秒。未申请真实麦克风权限；浏览器录音端仍待验收。语音模型路径通过启动环境变量传入，手工重新启动时需保留该变量。

## 固定场景评估

`node local-ai/evaluate.mjs` 列出用途；加 `--live` 顺序调用本机控制面运行12个固定用例。不会创建业务数据或调用VIP Brain。结果保存在 `.local/evaluations/latest.json` 及带时间戳的历史文件中；策略变化或任一断言失败返回非零退出码。首次发现日程时间猜测后已修复，2026-09-12第二轮12/12通过。

## macOS 自动启动管理

```bash
./service.sh start      # 安装并启动；已运行则复用
./service.sh status     # 分别检查守护、本地入口和模型状态
./service.sh restart    # 更新运行路径/环境配置并重启（代码更新后使用）
./service.sh stop       # 停止本次运行；下次登录仍自动启动
./service.sh uninstall  # 停止并移除自动启动；保留令牌、业务配置、日志
```

配置安装在 `~/Library/LaunchAgents/local.chrome-time-background.ai.plist`，不需要 root。日志保存在 `.local/service.log` 和 `.local/service-error.log`。默认 Node 路径在安装时固定；项目移动或 Node 路径变化后，用新的 Node 环境重新执行 `./service.sh install`。

脚本复用 `.local/token`、`control.json`、`usage.json`，不重置已有连接。显式提供的模型、推理、语音等环境变量会记录到权限为600的启动配置中；再次安装时保留未重新指定的值。自动启动固定使用扩展的19841端口。若已有手动启动的进程占用该端口，脚本会提示先停止，不会杀掉未知进程。

此守护负责扩展的本地入口服务，不自动打开 LM Studio 或加载模型。LM Studio 的1234端口仍需开启；`status` 将两者分开显示。登录前及电脑睡眠期间不保证可用，手动执行 `stop` / `uninstall` 会停止守护。
