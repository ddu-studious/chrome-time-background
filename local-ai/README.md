# 本地 AI 入口与智能闹钟

本机 Node.js 服务封装 LM Studio，第一项业务是中文闹钟解析。普通时间表达在扩展内离线处理；复杂口语调用本机 Qwen。服务只返回候选闹钟，不持有扩展存储权限，也不负责到点响铃。

## 启动和连接

需要 Node.js 22+，无需安装 npm 依赖。

1. 在 LM Studio 的 Developer 页面启动本地服务。默认连接 `http://127.0.0.1:1234`，默认模型为 `qwen/qwen3.8-27b`。首次生成可能触发模型加载；如果关闭了 LM Studio 的即时加载，请先手动加载该模型。
2. 在此目录执行 `npm start`，保持终端运行。入口监听 `127.0.0.1:19841`。结束进程只影响新的复杂口语解析，不会取消已创建的闹钟。
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
