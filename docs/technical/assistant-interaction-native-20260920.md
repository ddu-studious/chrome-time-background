# AI 工作台统一原生交互面板

日期：2026-09-20。本文为当前协议 v4；取代 v3 仅支持单个 `review` 确认按钮的范围限制。

## 行为与范围

任务真正停下来等用户时，复用现有原生面板展示问题与操作。任务完成后保留的可选按钮不会触发面板。

| Engine 状态 | 面板 | 可以执行的交互 |
| --- | --- | --- |
| `waiting` | 需要你选择 | 歌手、歌曲、专辑、歌单、视频、提醒目标等真实候选；分页、返回和次要动作；文字补充 |
| `clarify` | 需要你补充 | 缺少时间、平台、对象、没有搜索结果等问题的文字回答 |
| `review` | 需要你确认 | 展示操作影响后确认；也可输入修改要求 |
| `failed` / `interrupted` | 需要你处理 | 展示失败或中断原因、打开工作台核对、取消；不提供自动重试或旧候选执行 |
| `planning` / `running` / `completed` / `cancelled` | 不展示 | 不把执行中或可选后续操作当作人工阻塞 |

YouTube 未连接但工具提供原站搜索候选时，可直接选择原有候选；没有结构化处理动作的失败引导到工作台，不猜测登录地址或自动启动授权。结果不确定时仍遵循原 Engine 的 unknown 回执约束。

输入最多 500 UTF-16 单元，与现有工作台输入合同一致。原生输入框点击后获取键盘焦点，支持中文粘贴、全选、复制、剪切和撤销；出现面板不会自动切走前台应用，也没有全局 Enter/Escape 提交行为。关闭只隐藏这一版本；取消才停止任务，已有业务动作不会回滚。

## 复用与实现职责

- 继续使用原 `AssistantEngine`、`AssistantConfirmation`、`AlarmDesktop`、Native Messaging 连接、`ReminderPanel`、`CountdownGlass`；没有第二个执行器、任务事实库或摘要系统。
- Engine 根据最终状态生成并在原 `quickAssistantTaskV1` 快照中保存 `interaction`：ID、版本、状态、交互类型、有效期、是否允许文字回答。模型不能生成授权或原生操作参数。
- 等待选择与确认使用原候选有效期；无候选的追问与失败提示使用独立十分钟交互有效期。刷新不续期，已持久化状态重启不续期。
- `Engine.respond()` 是薄分派层：选择进入原 `choose()`；回答进入原 `submit()`；取消进入原 `cancel()`。最终变更在原串行锁内再核对交互身份、状态、版本与有效期。
- 原生文字回答显式按当前会话继续，不走普通输入的“裸歌手名替换搜索”路由；继承原模型选择、用户限制与剩余步骤。原工作台新需求路由不变。序号选择仍复用 `selectOrdinal()`。
- 整理上下文后保留 `waiting` / `clarify` / `review` 的原问题说明，以新版本恢复交互。
- `AssistantConfirmation` 仅投影允许展示的字段，不发送业务 `data`、资源引用或可执行参数。候选全量保留至 Engine 的 96 条上限，原生列表可滚动，支持原候选中的分页、返回和次要动作；不私自只保留前几条。
- `AlarmDesktop` 复用同一端口及前次断连清理修复。原生事件仍绑定 confirmationId、taskId、version、actionId；动作去重、未知回执、取消及预算仍由原链路负责。
- 原生端只渲染和回传 ID / 用户输入，不发起模型请求、不执行音乐或提醒业务。

没有新增 npm 依赖、Chrome 权限或全局插件。原有 pi 0.85.1 的 `ExtensionRunner.emitToolCall()` 自动批准策略保持不变；明确低风险操作可继续自动执行。pi 不负责 macOS 窗口和 Native Messaging，界面与传输继续使用项目现成适配层。

原生输入复用公开 AppKit API：[`NSPanel.becomesKeyOnlyIfNeeded`](https://developer.apple.com/documentation/appkit/nspanel/becomeskeyonlyifneeded)、[`NSView.needsPanelToBecomeKey`](https://developer.apple.com/documentation/appkit/nsview/needspaneltobecomekey)、[`performKeyEquivalent(with:)`](https://developer.apple.com/documentation/appkit/nsview/performkeyequivalent(with:)) 和 `NSTextView` 编辑动作。已有辅助组件未配置主编辑菜单，输入框通过小型 responder 适配提供标准编辑快捷键，只在自身编辑时处理。

## 协议与兼容

仍使用 `confirmation(card|null)` / `confirmationAction` / `confirmationResult`，握手版本升为 **4**。

- v4 卡片新增 `protocolVersion`、`kind`、`status`、`allowText`、`choices[]`、`inputPlaceholder`。候选只含 ID、标题、副标题、动作标签与展示类型。
- 回传动作：`select(choiceId)`、`reply(text)`、`cancel`、`open`。兼容原 `confirm` 回传。
- 扩展展示 v4 卡片前先 `ping` 核对协议；v3 组件显示“请更新桌面组件以启用选择与输入”，不把多候选错误地显示成单个批准按钮。
- 新原生组件仍支持旧 v3 的单 `choiceId` 卡片；该模式隐藏新增文字输入和工作台入口。
- Native Messaging 入站帧上限从 64 KiB 调为 256 KiB，扩展卡片上限 240 KiB；超限明确退回工作台。原生出站仍限 64 KiB。
- 请求等待回执时禁用提交控件，超时不自动重试。旧事件不能执行新任务；旧回执不能关闭新卡。业务成功仍以工具回执为准。

## 验证

- `test/assistant-interaction.test.js`：生产 Engine + 业务替身，共 12 项，覆盖歌手选择、无候选追问、文字补充、会话/模型/剩余步骤继承、双端竞态、分页、隐藏/取消、过期、非法输入、旧组件降级、96 个候选、确认前修改及 unknown 防重放。
- 助手、pi 自动批准、记忆、错误恢复、上下文压缩和闹钟相关回归 302 项通过。最初沙箱运行因禁止本机回环监听而失败的 HTTP 用例已在允许本机测试监听的环境重跑通过，没有访问真实账号或模型。
- 修改脚本语法检查与 `git diff --check` 通过；Swift 编译与 ad-hoc 签名通过。
- `interaction-smoke.mjs` 驱动隔离 AppKit 进程，验证 v4 各类面板、96 候选、非法候选拒绝、不抢前台焦点、倒计时共存与过期收起。
- 使用真实原生 UI 操作选择“林俊杰”、输入并发送中文、确认、取消、打开工作台按钮和隐藏；协议事件中的候选 ID、文字、任务与版本均与测试卡匹配。另单独验证实际鼠标聚焦、输入 ASCII、全选、中文粘贴和提交。
- 原 `confirmation-smoke.mjs` 验证旧单确认协议、长说明滚动、旧回执隔离和倒计时共存。原生测试是隔离进程，工作台按钮仅验证回传；不等价于真实 Chrome 的开页或执行业务。

## 启用与边界

已在原 `local-ai/.local/TimeKeeperDesktop.app` 路径构建更新，原宿主注册和扩展 ID 不变。**需要重新加载 Chrome 扩展**，以启用新后台代码并建立 v4 原生连接；无需重启本机 AI 服务。

未重载用户当前 Chrome，也未对真实歌手搜索、播放、提醒或账号执行端到端操作；此次没有真实本机模型调用。复杂失败只引导工作台核对；仍不承诺在锁屏及系统安全界面上显示。

复验命令：

```sh
node desktop-reminder/build.mjs --extension-id=实际扩展ID --app=/tmp/TimeKeeperInteractionQA.app
node desktop-reminder/interaction-smoke.mjs --extension-id=实际扩展ID --interactive
# 只验证输入框键盘和文字提交
node desktop-reminder/interaction-smoke.mjs --extension-id=实际扩展ID --input-only
node --test test/assistant-interaction.test.js test/assistant-confirmation.test.js test/alarm-desktop.test.js
```
