# 本地 AI 入口与智能闹钟

## 对话与调用历史（2026-09-16）

快捷助手现已补充工具执行轨迹：规划、搜索/读取请求、用户选择的动作及播放确认等步骤均可展开；查看参数/结果需开启正文留存。模型请求可关联到具体步骤。历史记录中的工具次数与模型调用次数分别统计，旧记录无法补回工具过程。

设置 → AI 控制台增加长期历史：会话/用户消息/模型次数、逐次模型与思考等级、正文查询、导出和删除。历史保存在 `.local/history.json`，默认 30 天，正文默认关闭。需要查看原句和回复时开启“留存对话正文”。旧记录无法补回，服务离线期间无法保证留存。详见 [数据结构、留存边界与验证](../docs/technical/ai-history-20260916.md)。本节覆盖下文旧版本“仅有内存记录”的说明，原有内存运行记录仍保留。

快捷助手已扩展为轻量浮层和多类音乐对象，支持拼音匹配。参见 [最新实现与验收边界](../docs/design/assistant-v2-implementation.md)。

## 快捷助手 MVP（2026-09-15）

新增 `assistant.plan` 场景和 `skills/` 下的六个应用技能，接入扩展的统一输入条。支持 `@` 应用、`/` 动作、最多三步受控计划、真实候选选择和执行结果回执；简单操作复用离线解析。使用方式、工具范围和验收边界见 [快捷助手 MVP](../docs/requirements/assistant-command-mvp.md)。

## 统一控制面基础（2026-09-12）

现有闹钟 HTTP 接口现已通过统一场景网关。新增 `POST /v1/ai/interpret`，请求为 `{scene:"alarm.interpret",input:{text,now,timeZone,turns?,reasoning?}}`，返回 202 和 jobId；使用 `GET /v1/ai/jobs/:jobId` 轮询。旧接口继续兼容。

`GET /v1/control` 使用同一 Bearer 鉴权，返回场景清单、模型开关和最近 100 条内存调用记录，不包含正文和模型原文。`LOCAL_AI_MODEL_ENABLED=false` 关闭模型调用；`LOCAL_AI_DISABLED_SCENES=alarm.interpret` 关闭单个场景的模型调用，简单规则仍可用。修改启动环境后重启本服务生效。

控制台位于设置页的“AI 控制台”入口。策略保存到 `.local/control.json`，重启恢复；文件存在时优先于初始环境变量。支持版本冲突检测与历史回滚、查看和取消运行中的请求。其他业务的模型入口尚未迁移。本次相关测试 37/37 通过，运行服务已更新，真实 Qwen 经统一入口解析通过；真实 Chrome 扩展端尚待验收。完整规划见 [AI 路线图](../docs/requirements/roadmap-ai-control-plane.md)。

本机 Node.js 服务封装 LM Studio，第一项业务是中文闹钟解析。普通时间表达在扩展内离线处理；复杂口语调用本机 Qwen。服务只返回候选闹钟，不持有扩展存储权限，也不负责到点响铃。

## 启动和连接

需要 Node.js 22.19+。首次安装或更新依赖后，在 `local-ai` 目录执行 `npm ci`；上下文整理直接复用锁定的 pi 官方 SDK，个人记忆继续使用内置 SQLite。

1. 在 LM Studio 的 Developer 页面启动本地服务。默认连接 `http://127.0.0.1:1234`，默认模型为 `qwen/qwen3.8-27b`。首次生成可能触发模型加载；如果关闭了 LM Studio 的即时加载，请先手动加载该模型。
2. macOS 推荐双击本目录的 `启动本地AI.command`，或运行 `./service.sh start`。首次安装当前用户的 LaunchAgent 并启动入口，之后登录自动启动、进程退出后自动恢复；重复执行复用现有进程，终端可关闭。入口仅监听 `127.0.0.1:19841`。其他系统或临时前台调试仍可执行 `npm start` 并保持终端运行。
3. 在 Chrome 扩展管理页重新加载扩展（此次增加了本机服务地址权限），再刷新新标签页。
4. 打开闹钟 → 本地 AI，将此目录下 `.local/token` 文件里的内容粘贴到连接令牌框，点击“保存设置”。该文件首次启动时生成，只有当前本机账户可读写，已加入 Git 忽略。
5. 点击“检查状态”。输入“明天下午三点开会，提前十分钟提醒我”，应显示具体日期、14:50 和“已设置”。缺少时间会追问，直接在原输入框补充即可。

可以先用“20分钟后提醒我休息”验证离线路径。第一次连接令牌是本服务自己的令牌，与 LM Studio 的可选 API Token 不同。

### 统一服务脚本（macOS）

在项目根目录执行以下命令；在本目录中可省略 `local-ai/`，也可从任意目录使用脚本绝对路径。

```bash
./local-ai/service.sh start      # 启动；已运行则检查并复用
./local-ai/service.sh restart    # 更新代码后重启，保留连接令牌、模型及语音配置
./local-ai/service.sh stop       # 关闭本次运行；shutdown 是同义命令
./local-ai/service.sh status     # 检查主接口、个人记忆接口及模型状态
./local-ai/service.sh help       # 查看完整帮助；也支持 -h / --help
./local-ai/service.sh uninstall  # 停止并取消登录自动启动，保留数据
```

不传参数默认执行 `start`。`stop` 后下次登录仍会自动启动；永久关闭使用 `uninstall`。`install` 可重新安装或更新登录启动配置。脚本只管理扩展的本地 AI 网关，LM Studio 模型服务仍需单独开启。

`start`、`restart` 和 `status` 都会检查个人记忆接口；如果提示“记忆接口不存在”，说明运行中的服务尚未加载新代码，执行 `restart`。记忆库异常会单独报告，其他 AI 功能可以继续使用。日志保存在 `.local/service.log` 和 `.local/service-error.log`。

快捷助手遇到以 `tools.load` 开头的计划时，会在严格验证工具、参数与应用范围后补齐继续标记，只执行加载步骤，再根据真实加载回执重新规划；同批提出的后续动作不会提前执行。

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

## 本机模型管理

本机模型目录与独立运行时的管理入口是 `./local-ai/models.sh list`，Laya 多语言模型通过 `./local-ai/models.sh laya status|verify|test|start|stop|logs` 管理。权重与 LM Studio 其他模型同放在 `~/.lmstudio/models/` 的独立子目录，Laya 由锁定的官方 Python 包加载，LM Studio 不运行其决策头。目录归属、固定版本与哈希、下载恢复、启停和新增模型规范见 [本机模型管理手册](../docs/technical/local-model-management-20260924.md)。Laya 已作为默认关闭的首轮工具组预加载建议器接入 Gateway；关闭、只观察、参与及故障降级边界见 [Laya 预加载技术说明](../docs/technical/assistant-laya-prefetch-20260924.md)。

## AI 工作台本地语音

语音输入复用 whisper.cpp。Apple Silicon 优先选择 `/opt/homebrew/bin/whisper-cli`，其他现有环境保留 `/usr/local/bin/whisper-cli`；默认识别模型是 `.local/whisper/ggml-small-q5_1.bin`，也可用 `LOCAL_AI_SPEECH_MODEL` 指向已核验的兼容模型。Whisper 返回文字经锁定的 `opencc-js@1.4.2` 转为简体，预览和最终转写共用该出口，用户手写内容不转换。音频只发送到本机受控入口。`POST /v1/speech/transcribe` 接收 `{audio: base64Wav}`，返回 jobId，复用 `/v1/ai/jobs/:jobId` 轮询和取消。录音上限 29 秒，服务最多接受 30 秒规范 WAV；数字静音立即提示麦克风问题。

音乐搜索页继续点击“说一句话”开始、点击“结束录音”提交识别。AI 工作台使用本机逐步转写：录音中会修正输入框文字，说完停顿后自动完成；“完成语音输入”仍可手动提前结束。两处都只回填可编辑文字，检查后由用户点击执行。控制台未配置语音模型时不会申请麦克风。临时音频识别后删除，转写结果与其他解析任务一样只在服务内存中短暂保留。

AI 工作台的助手答复另有“朗读”按钮：按真实消息分段，通过独立 `speech.synthesize` 场景调用本机 StepAudio，不改变音乐队列。必须开启 AI 总开关及“助手回答朗读（StepAudio）”场景；旧策略默认关闭。运行库锁定于 `voice-runtime/pyproject.toml` / `uv.lock`，独立 ARM Python 环境和参考音色放在 `.local/stepaudio-runtime/`，模型权重在 LM Studio 模型目录。点击停止、任务变化或关页会撤销待生成音频。完整的安装来源、调用边界和验证结果见 [技术说明](../docs/technical/assistant-voice-stepaudio-20260923.md)。代码更新后需重启服务并重载扩展。

2026-09-12 曾以当时的 small 模型转写生成音频。2026-09-23 已下载并校验默认 small-q5_1，原生 ARM 与现有 x86 CLI 均通过公开规范 WAV 的本机网关测试；真实扩展中 StepAudio 朗读与停止已验收。隔离 Chromium 的虚拟麦克风返回全零录音，当前会直接提示静音；真实物理麦克风和网页浮层权限仍需单独验收。

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


### 工作台自动确认判断（pi SDK）

明确的一次性提醒（例如“20分钟后提醒我喝水”）以及准确指定单条一次性提醒的名称/时间修改，可以直接执行并继续后续步骤。删除、清空、重复提醒、歧义目标及预览要求仍保留确认。使用现有 pi 0.85.1 的公开执行前事件，无额外模型调用。

鉴权接口为 `POST /v1/assistant/approval`，返回当次操作的判断，不提交业务动作、不保存通用授权。服务未连接或版本过旧时明确提示并保留手动确认。升级后重启本机服务、重新加载扩展。实现范围和验证见 [自动确认判断说明](../docs/technical/assistant-approval-pi-20260919.md)。

### 工作台上下文整理（pi SDK）

自动整理直接复用 `@earendil-works/pi-coding-agent@0.85.1` 的公开 API，通过现有网关调用本机模型；历史用户要求和真实执行回执独立保留。AI 设置可切换“自动精简与 pi 摘要 / 仅精简”，工作台也可手动整理。首次升级请在本目录执行 `npm ci`，重启本机服务并重新加载扩展。

实现、来源存储边界与真实模型验证见 [pi SDK 接入说明](../docs/technical/assistant-context-compaction-pi-20260919.md)。专项测试：`node --test test/local-ai-compaction.test.mjs`（项目根目录）；真实模型合成材料验证：`node local-ai/evaluate-assistant-compaction.mjs --live`，不会操作账号、队列或提醒。

### 工作台规划提速（规划思考起步 · 无进展保护 · 队列播放快速路径）

AI 设置新增“规划思考起步”（`planningStrategy`），默认“严格按上方思考设置”，行为与此前完全一致。选择“已有执行回执时自动关闭思考”后，仅 `assistant.plan` 中已拿到真实工具回执、且不是清单分析阶段的规划轮会直接以关闭思考单次起步并独占完整超时；所选思考等级仍是上限，默认设置、预算与熔断规则不变。历史和时间线用 `startReason=adaptive-receipts` 标记，与“超时恢复”分开显示。Engine 会拦截“自上次写入、选择或失败恢复后，重复提出完全相同的只读查询”：先把原因写入回执让模型重规划一次，再次重复则由现有恢复上限停止。“随机播放列表歌曲”“列表歌曲随机播放”“随机播放队里中的歌曲”等封闭语法的队列播放短句直接走确定性快速路径，不调用模型。更新后须重启本机服务并重载扩展（旧服务会拒绝 `planningStrategy` 字段）。设计、边界与验证见 [提速技术说明](../docs/technical/assistant-speed-20260929.md)。

进程内评估：`node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=follow|adaptive [--remove-artist]` 创建独立的内存网关直接调用 LM Studio（`LM_STUDIO_URL`、`LOCAL_AI_MODEL` 可覆盖），不读取生产令牌、不写生产策略与历史，报告与 `metrics` 写入 `.local/evaluations/`。LM Studio 为单并发，运行时不要同时使用助手；音乐依赖与用户点击均为替身。
