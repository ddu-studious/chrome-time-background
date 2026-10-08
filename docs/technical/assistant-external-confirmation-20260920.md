# AI 工作台外部确认浮层

日期：2026-09-20。

当前已升级为 [统一原生交互面板 v4](assistant-interaction-native-20260920.md)，支持候选选择、文字补充和人工核对。以下为 v3 初版及断连修复的历史记录；当前行为以 v4 文档为准。

## 评估结论与交互

可行。仓库已有原生 AppKit 浮层、Native Messaging 长连接、长度前缀 JSON、动作回传及倒计时/响铃共存能力，直接扩展现有组件。pi 0.85.1 的确认策略保持不变；它负责决定是否需要确认，窗口展示和跨端同步复用本项目的 Engine 与桌面组件，不引入另一套模型/任务循环。

任务进入 `review`、有唯一确认动作且引用未过期时，工作台仍显示原确认卡，同时出现原生浮层。只读搜索的 `waiting` 候选列表和澄清问题不弹窗。外部浮层包含完整的当前确认说明、确认按钮、取消本次操作按钮、仅隐藏按钮。长说明可滚动，窗口不主动激活应用，使用原生 floating/nonactivatingPanel 与跨 Space 的公开配置。

- 确认：提交当前候选后收起浮层，工作台继续原任务。收到的是 Engine 接受确认的回执，不能理解为业务已成功；最终成功仍来自业务工具回执。
- 取消本次操作：同一 Engine 取消后续任务，两端同步；已执行过的动作不自动撤销。
- 关闭：只隐藏这一版本的浮层，任务仍待确认，可回工作台处理；同一版本不会被重复刷新弹出。
- 用户在工作台确认、取消、清理或提交新需求后，浮层同步收起/更新。窗口并非第二个授权来源。
- 待确认时手动整理上下文，完成后保留原操作说明，以新任务版本恢复确认卡；整理结果放在原有 contextNotice 中，不能替换掉待确认的影响说明。
- 未提交的输入框草稿不是新计划；外部确认始终针对卡片展示的已准备内容。修改需求应提交后生成新版本。

## 复用与调用路径

1. `AssistantEngine.save()` 在成功持久化后通知可选 `onChange`。观察者故障不会阻塞执行，不会把保存成功改成业务失败。清理任务同样通知 null。
2. `js/assistant-confirmation.js` 从公开任务快照投影卡片，仅保留任务 ID、版本、候选 ID、有效期和展示文本；不发送 `choice.data`、资源引用或可执行参数。快照和回执仍存于原有活动任务。
3. 通过已有 `AlarmDesktop` 和 `com.timekeeper.desktop` 连接发送协议 v3 的 `confirmation(card|null)`。发送串行化并消除相同投影的重复推送。宿主重启后以 Engine 快照恢复；未确认动作不会自动执行。
4. `confirmation-view.swift` 复用 `ReminderPanel` 及 `CountdownGlass` 材质遮罩，独立保存 `AssistantConfirmationV1` 窗口位置/尺寸。原倒计时保留胶囊圆角，确认卡使用固定圆角。
5. 原生按钮发 `confirmationAction`，带 confirmationId、taskId、version、choiceId、actionId 和 confirm/cancel。桥接核对当前连接、卡片与重复动作；投影层核对当前身份/有效期；最后 Engine 在原有串行锁内核对版本及 `review` 状态。
6. 确认调用原 `Engine.choose(..., reviewOnly=true)`，实际业务仍走原 choose 工具。取消复用 `Engine.cancel(taskId, expectedVersion)`，版本和状态在同一锁中检查，不能取消已经开始的新一轮执行。

外部浮层没有 HTTP 服务、不直接调用 pi 或模型、不拥有业务提交接口。复用仓库已有能力，不增加第三方依赖或 Chrome 权限。

## 同步与失败边界

- 双端同时点击，先进入 Engine 串行入口的一方推进版本；另一方旧版本失败，不重复执行。
- 重复 actionId 返回已接受回执；不同 actionId 仍须通过 Engine 的版本检查。重复回执不能关闭新卡。
- 原生端不以点击即成功。回执超时显示“请在工作台核对”，保持按钮禁用，不自动重试潜在已提交动作。
- 实际业务 unknown、取消和重复副作用边界继续由现有执行器负责；桌面回执不会写入伪造的业务成功状态。
- 候选到期后两端仍以 Engine 的十分钟有效期为准，外部浮层主动收起，不隐式确认或取消。
- 原生组件不可用/过旧/断开时，工作台原确认卡保留，快照返回桌面提示。没有窗口失败导致自动放行的路径。
- 确认、倒计时、响铃共享一个端口；三者均无活动内容才释放连接。用户隐藏确认浮层后不会因正常释放端口误报断线。
- 不承诺在锁屏或系统安全界面之上显示。跨 Space 使用与现有倒计时一致的公开 API；本轮没有逐种全屏应用现场验收。

## 验证及交付

- `test/assistant-confirmation.test.js`：生产 Engine 配合业务替身覆盖双端竞态、重复事件、旧版本取消、隐藏与取消区别、任务清理/替换、旧组件降级、重启恢复和共享连接生命周期。
- 助手/本机 AI/闹钟回归共 395/395 通过；旧播放 VM 测试补齐新增 desktop 依赖，没有修改播放实现。
- 随后补充“整理上下文不丢确认详情”的回归，外部确认及上下文压缩专项 25/25 通过。
- 10 个相关 JavaScript 脚本语法检查及 `git diff --check` 通过。
- Swift 编译与 ad-hoc 签名通过；先构建 `ConfirmationQA.app` 隔离测试，再更新原安装路径下的 `TimeKeeperDesktop.app`，宿主注册和扩展 ID 未改变。
- `confirmation-smoke.mjs --interactive` 驱动真实原生进程，UI 自动化实际点击确认、取消、隐藏，收到正确绑定的事件；版本 v3、不抢前台焦点、非法输入拒绝、旧回执隔离、更新不移动窗口、倒计时共存和过期收起均通过。
- 已观察真实窗口布局：440×300，说明可读、操作按钮可用。没有操作真实 Chrome 提醒、音乐队列或账号，没有调用模型。
- 未重新加载用户的 Chrome 扩展，真实 Chrome 后台至工作台和原生组件的整体联动仍需重载后验收；不能将生产 Engine 替身测试或隔离原生按钮测试称为真实扩展全链路通过。

重新加载 Chrome 扩展即可启用。新增 `assistant-confirmation.js` 已加入后台 `importScripts`，不需要重启本机 AI 服务。代码未提交 Git。

## 空闲断连与残留提示修复（2026-09-20）

现场报错 `Attempting to use a disconnected port object` 对应两个已隔离复现的缺陷：空闲两秒后调用 `Port.disconnect()` 却保留旧端口；桌面展示失败后，任务完成时空投影命中去重而跳过错误清理。原测试替身错误地让本端主动断开触发本端 `onDisconnect`，因此未覆盖 Chrome 实际语义。

继续复用 Chrome 公开的 [`runtime.Port`](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-Port) 与原 `AlarmDesktop`，没有新增依赖、权限或协议版本。公开 API 明确规定主动断开只向对端发断连事件；项目适配层负责以下生命周期管理：

- 主动空闲断开、原生端断开及发送异常统一释放当前端口、面板标识和待响应请求；正常空闲释放不报告故障。下一次请求通过原 `connectNative()` 获取新连接，不自动重放失败请求或业务动作。
- 旧连接的晚到消息与断连事件不能影响新连接。响铃请求被组件拒绝时保留仍服务确认/倒计时的正常连接。
- 提示仅在当前有效且未隐藏的确认卡上返回；任务离开待确认、新版本替换、隐藏和到期立即失效，旧请求晚到失败不能污染新任务提示。
- 测试共享原生端口替身改为每次连接生成新对象，主动关闭不回调本端，关闭后发送抛错；远端断开与旧事件另行模拟。

验证：`node --test test/alarm-desktop.test.js test/assistant-confirmation.test.js test/alarm-countdown.test.js test/alarm-clock-contract.test.js` 共 36/36 通过，包含生产 Engine 的双端确认、取消及副作用次数检查，新增空闲断连后重连、共享面板、发送失败清理、旧事件隔离、残留提示和晚到失败回归。修改的 JavaScript 语法检查与 `git diff --check` 通过。排查阶段已通过隔离进程 ping 确认安装组件正常响应 v3；本次未改 Swift，无需重装组件或重启 AI 服务。

上述为业务替身与静态验证，未操作真实提醒、调用真实模型或重载用户 Chrome。真实 Chrome 全链路需重载扩展后验收；重载会启用新的连接管理代码。
