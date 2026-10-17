# macOS 桌面闹钟组件

Chrome 保持原有调度、声音和通知，原生 AppKit 组件显示桌面水母（倒计时、喝水/起身提醒、到点响铃的气泡都在它身上），回传停止/稍后提醒。不会把时间调度迁移到 macOS，Chrome 完全退出后不能继续到点提醒。

> **2026-10-16 起倒计时胶囊已取消**：水母独立于闹钟，常驻（默认关闭）时趴在桌面底部打盹，倒计时与喝水提醒都交给它；协议 v6，见文末“桌面水母 v6”与 `docs/technical/jellyfish-resident-companion-20261016.md`。下文“桌面倒计时”“胶囊透明边角与缩放优化”“倒计时 v5”是历史记录，其中的胶囊界面与 `countdown-companion-smoke.mjs` 等已不存在。
>
> **同日到点提醒卡片也已取消**：到点时水母游到鼠标所在屏幕底部正中，弹出带大时间的响铃气泡（浅/深色随系统，所有水母气泡一起），见文末“到点响铃气泡”与 `docs/technical/jelly-ring-alarm-20261016.md`。下文凡写“提醒卡片 / 原生卡片 / 右上角”的地方都是历史描述。
>
> **同日新增桌面 AI 助手（协议 v7）**：水母常驻时可以在任意应用里按全局快捷键唤出原生输入面板，直接对 AI 助手说需求；任务仍由 Chrome 里同一个 AI 工作台执行，原生端只显示与转发，见文末“桌面 AI 助手 v7”与 `docs/technical/native-assistant-workbench-20261016.md`。

## 已安装与使用

本机已构建 `local-ai/.local/TimeKeeperDesktop.app`，并注册 Chrome 原生消息宿主 `com.timekeeper.desktop`。仅允许当前时钟扩展 `ipcgchgohpjheedlgfkcjlhhfbdljefo` 连接。

重新加载 Chrome 扩展、刷新新标签页，在闹钟页面点击“测试桌面提醒”。测试响铃不会修改已有闹钟（已有闹钟正在响铃时会被拒绝）。之后正常闹钟到点会优先由水母显示响铃气泡，系统通知和 Offscreen 声音继续保留。原生组件不可用或拒绝时降级回原有系统通知及已配置的重要提醒 Chrome 小窗。

桌面组件由 Chrome `connectNative` 按需启动，无需手工打开 App、无须启动本地 AI 服务或加载模型，也不添加登录启动项。没有申请屏幕录制或辅助功能权限。没有倒计时和响铃需要显示时断开连接并退出组件。倒计时显示期间保持 Native Messaging 连接；每秒刷新由原生 Timer 完成，不轮询 Chrome 或调用模型。菜单栏铃铛仅在组件运行期间出现。

## 构建、重新安装

项目根目录执行（需 macOS Command Line Tools）：

```sh
node desktop-reminder/build.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --install
```

不带 `--install` 时只编译和本地 ad-hoc 签名，不修改 Chrome 注册目录。换电脑或扩展 ID 后需使用实际 ID 重新安装。该构建用于本机开发，不是已公证的公开发行包。

注册文件：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.timekeeper.desktop.json`。卸载时移除这个文件和项目内的生成 App 即可；不影响闹钟存储和 Chrome 原有通知。安装器更换已有注册内容时会保存带时间戳的备份。

## 展示和操作边界

- 原生 `NSPanel`（`ReminderPanel`）使用不激活应用的透明浮动面板，是水母自己的窗口：到点响铃时水母游到鼠标所在屏幕可见区底部正中，响铃气泡长在它头上；窗口随气泡增高，不再有独立的右上角卡片。
- 使用 `canJoinAllSpaces`、`fullScreenAuxiliary` 及受系统版本保护的 `canJoinAllApplications`，为跨桌面和全屏空间显示配置公开 API。锁屏及安全系统界面不承诺覆盖。
- 模型和 HTTP AI 服务不参与响铃。Native Messaging 采用长度前缀 JSON，接受 ping/show/hide/actionResult/countdown/confirmation/confirmationResult，读取上限 256 KiB（v4）；stdout 只写协议帧。
- 点击停止/稍后后等待 Chrome 确认；8 秒未确认可重试。无回执不声称操作成功。
- 回传绑定 sessionId/actionId，重复动作幂等，旧会话不得停止新会话；后台复核当前会话后复用原 `stopUserAlarmSession`，稍后提醒仍按原限制创建待调度记录。
- 没有可用的稍后提醒次数时隐藏该按钮。浏览器内停止或会话过期会同步收起响铃气泡（水母游回，不显示确认语）。
- 正常显示响铃气泡时不额外聚焦 Chrome；组件启动失败时，已结束的会话不会在延迟后再次弹出 Chrome 小窗。

## AI 工作台统一原生交互（协议 v4）

原生面板现支持歌手/歌曲/视频/提醒目标选择、文字补充和操作确认。搜索无结果或模型追问时可以直接输入回答；失败或中断时展示原因并提供工作台核对入口。任务已完成后不会因保留可选按钮而弹窗。

已更新原安装路径下的组件，重新加载 Chrome 扩展后生效；无需重新注册宿主或重启本机 AI。旧 v3 组件需要更新后才能使用候选列表和输入框。文字回答、选择、取消都由同一 Chrome 执行器处理；关闭仅隐藏，原生组件不直接执行业务。

302 项相关回归通过，隔离原生 UI 已实际验证选择、中文输入、确认、取消、工作台入口和隐藏事件；未进行真实 Chrome 业务全链路验收。详细协议、边界和复验命令见 [统一原生交互说明](../docs/technical/assistant-interaction-native-20260920.md)。

## 历史：AI 工作台外部确认 v3（2026-09-20）

协议 v3 支持独立的“需要你确认”浮层：跨应用展示确认内容，点击确认或取消会交回 Chrome 中同一任务执行器；关闭按钮仅隐藏，不取消任务。确认卡与闹钟/倒计时共享连接，单独关闭不会断开其他活动面板。窗口复用 AppKit 材质遮罩、不主动切换应用，并记忆位置和尺寸。长详情可滚动。

请更新组件后重新加载 Chrome 扩展。已安装用户无需重新注册原生宿主；`build.mjs` 默认更新原注册路径，`--app=/绝对路径/QA.app` 可构建隔离测试组件。未安装或旧组件不会阻塞工作台确认，工作台会显示失败提示。现阶段只镜像单个待确认动作，不把搜索结果候选列表弹到桌面。

```sh
node desktop-reminder/confirmation-smoke.mjs --extension-id=实际扩展ID
# 隔离进程里依次手动点击确认、取消、关闭；不操作真实提醒
node desktop-reminder/confirmation-smoke.mjs --extension-id=实际扩展ID --interactive
```

本轮实际编译/签名及 Native Messaging 测试通过，真实三个按钮经 UI 操作回传通过，出现窗口时前台应用保持不变。395 项助手/本机 AI/闹钟回归通过。未重新加载用户 Chrome 扩展，完整真实扩展双端验收待重载；Engine 双端竞态使用生产执行器和业务替身验证。详细设计见 [外部确认说明](../docs/technical/assistant-external-confirmation-20260920.md)。

后续修复了空闲主动断开后复用失效端口的问题，以及任务完成后残留“桌面确认暂不可用”的提示。36 项相关回归通过；此修复仅修改扩展 JavaScript，重新加载 Chrome 扩展即可生效，无需重新安装 v3 桌面组件或重启本机 AI。真实 Chrome 全链路仍需重载后验收。

## 原有响铃验证记录（2026-09-12，macOS 26.5）

- Swift 编译和 ad-hoc 签名成功，Chrome 宿主文件读回与扩展 ID、可执行文件路径一致。
- 原生 IPC 驱动真实启动 App，面板返回 visible=true、onActiveSpace=true；展示前后前台应用未变化（focusStayed=true）。
- 实际显示并检查卡片；停止与 10 分钟后再提醒均收到真实按钮消息，回执后 visible=false；旧会话 hide 不会误关卡片。
- 相关单元/契约测试覆盖原生桥接和已有调度，共 34 项通过。
- 此次原生测试使用隔离协议驱动，未修改真实闹钟；不能等价于 Chrome 实际到点、系统声音与所有链路的端到端验收。
- 本机仅检测到一块屏幕；桌面切换快捷键测试未产生 activeSpaceDidChange 事件，因此跨 Spaces、全屏和多显示器效果仍需独立实测，不标记通过。

运行原生交互测试（2026-10-16 起：连接真实组件时要你亲手点水母气泡里的按钮；加 `--app` 指向隔离构建，`--auto` 用验收钩子代替手点，只能配合 `--app`）：

```sh
node desktop-reminder/smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --action=dismiss
node desktop-reminder/smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --action=snooze
node desktop-reminder/smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --app=/tmp/tk/QA.app --auto --action=snooze
node --test test/alarm-desktop.test.js test/alarm-clock-contract.test.js test/local-ai*.test.mjs
```

官方协议参考：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

## 桌面倒计时（2026-09-19，历史：胶囊已取消）

重新加载 Chrome 扩展并刷新新标签页后生效；本机已注册的宿主仍使用原路径，更新只需重新构建组件，无需重新注册权限。

- 在闹钟中心设置提醒后，默认显示 340 × 100 的磨砂玻璃胶囊，包含提醒名称、剩余时间和到点时刻。拖动胶囊背景可调整位置，macOS 保存窗口位置；显示器变化时将窗口限制到可见区域。
- 切换 Chrome 标签页或关闭扩展页面不影响显示，也可浮在其他应用之上；它不是注入网页的 DOM。完全退出 Chrome 后停止运行，电脑睡眠时不能唤醒电脑。
- 多个闹钟跟随调度器的最近一次提醒，同秒显示条数；手动、快捷、智能闹钟和助手入口共用持久化状态。改名、改时、删除、开关、贪睡都会同步。
- 到点归零后等待 Chrome 调度，不在原生进程另起响铃。正在响铃时隐藏胶囊，优先显示现有提醒卡片；处理后显示下一次提醒。
- 浮窗右侧 × 只关闭显示，不取消任何闹钟；显示偏好保存在 `userAlarmCountdownV1.enabled`。闹钟中心重新勾选“桌面倒计时”即可恢复。
- 仅支持已有 macOS 桌面组件；未安装/版本过旧时，闹钟中心显示连接提示，原有 Chrome 调度、声音和通知不受影响。
- 协议 v2 新增 `countdown`（timer 或 null）和绑定 occurrence ID 的 `countdownHidden`；倒计时与响铃共享连接，关闭其中一种不会断开另一种。

隔离原生验收（不创建/修改真实 Chrome 闹钟）：

```sh
node desktop-reminder/countdown-smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo
# 保留窗口 90 秒供视觉检查
node desktop-reminder/countdown-smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --preview
node --test test/alarm-countdown.test.js test/alarm-desktop.test.js test/alarm-clock-contract.test.js
```

### 本次验证边界

- Swift 编译及 ad-hoc 签名通过；复用现有 Chrome 宿主注册路径，没有新增系统权限。
- 全量 `node --test test/*.test.js test/*.test.mjs`：859/859 通过；最后的显示偏好 UI 同步补充后，相关 25 项再次通过。
- 独立 Native Messaging 协议驱动真实 App：visible、秒级数字变化、focusStayed、改名不移位、非法输入拒绝、响铃优先、旧会话 hide 隔离、到期归零、跨天格式和隐藏均验证通过。
- 实际窗口截图：`output/screenshots/alarm-countdown-native.png`。测试结束后关闭隔离组件，没有写入真实 Chrome 闹钟。
- 桌面自动化工具连接超时，未验证真实鼠标拖动/关闭按钮及拖动后跨进程位置恢复；拖动与保存使用 AppKit 的窗口背景拖动和 frame autosave。未进行真实 Chrome 扩展重载后的创建→响铃完整联调，不将原生协议测试算作这条链路的验收。


## 胶囊透明边角与缩放优化（2026-09-19，历史：胶囊已取消）

- 复用 AppKit `NSVisualEffectView.maskImage`，按材质实际尺寸生成 alpha 遮罩。只给 CALayer 设置圆角不会完整裁切系统磨砂材质；现在材质与窗口阴影共享胶囊形状，布局变化时同步刷新遮罩和阴影。没有引入第三方 UI 引擎。
- 减轻描边，使用青灰文字、等宽数字和分层字号；关闭图标减小，仍保留独立的可点击区域。
- 复用 `NSWindow` 的 `.resizable`、`contentAspectRatio`、`minSize`、`maxSize` 和 frame autosave。宽度范围 272–544 点，保持 3.4:1 比例；拖窗口边缘或右侧双斜线手柄调整大小，文字和图标同步缩放。
- 手柄是薄事件适配：使用鼠标事件的屏幕坐标计算拖动，支持非激活窗口的首次点击；点击手柄或右键浮窗可选“小巧 / 标准 / 舒展”。菜单操作也支持辅助功能触发。
- 位置恢复不再硬编码 320 × 96，保留上次宽度并限制在当前显示器内；关闭浮窗、下次提醒和重新启动均复用保存尺寸。
- 官方 API：[材质遮罩](https://developer.apple.com/documentation/appkit/nsvisualeffectview/maskimage)、[窗口比例约束](https://developer.apple.com/documentation/appkit/nswindow/aspectratio)。

此次验收使用 `/tmp/TimeKeeperCountdownPreview.app` 独立 bundle，避免移动/关闭真实闹钟。已真实拖动手柄放大，并通过菜单切换 272 × 80、340 × 100、442 × 130；截图 RGBA 检查确认胶囊外角 alpha 为 0，邻近柔和阴影的 alpha 为 3，不再有矩形材质底板。Swift 编译及现有 22 项闹钟相关测试通过。

- 补充实测：点击缩放手柄可打开尺寸菜单；缩放后退出并重新启动原生组件，分别断言恢复 442 × 130 和 340 × 100 成功。重新启动、响铃切换以及标题更新没有重置尺寸。最终截图：`output/screenshots/alarm-countdown-resizable.png`。
- 此次验收是隔离原生窗口与已有 JS 调度测试；真实 Chrome 当前连接仍使用旧进程，重载扩展后使用新组件，不将本次验收描述为真实闹钟从创建到响铃的全链路验收。


## 倒计时 v5：活胶囊与桌面小伙伴（2026-10-15，历史：已被水母 v6 取代）

活胶囊（进度环、悬停按钮、迷你尺寸）与可切换的桌面小伙伴水母，协议 v5；延后/跳过由 Chrome 执行、原生只转发的约束沿用到 v6。详见 `docs/technical/alarm-countdown-companion-20261015.md`。

## 桌面水母 v6（2026-10-16）

水母不再依附闹钟：**常驻**（设置页“桌面水母”，默认关闭）时趴在可见区域底边打盹，夜里带荧光，点一下醒来看今天的记录和下一次提醒；闹钟倒计时、喝水 / 起身提醒都由它头上的气泡显示，按钮动作（延后、跳过、“喝了”、“10 分钟后”）原样交回 Chrome，收到回执才显示成功；没有常驻时只在倒计时或提醒期间临时出现，之后组件随连接退出。水母寿命跟随 Chrome（不做开机自启），原生端不保存业务状态，只记自己的窗口位置。协议 v6，旧组件忽略新字段，旧 v5 组件仍显示胶囊，需重新构建安装组件并重载扩展：

```sh
node desktop-reminder/build.mjs --extension-id=<id> --install
```

隔离验收（独立 Bundle ID `com.timekeeper.desktop.qa`，不碰真实组件的窗口记忆；只截自家窗口，不做整屏截图；运行期间不要同时操作鼠标，脚本里有合成鼠标）：

```sh
node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-mouse] [--shots=/tmp/shots]
node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app   # 真实 Chrome 侧模块 ↔ 真实原生进程（存储/闹钟/通知为替身）
node desktop-reminder/countdown-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node desktop-reminder/confirmation-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node desktop-reminder/interaction-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node --test test/desktop-companion-logic.test.mjs test/jelly-desktop.test.js test/jelly-desktop-integration.test.js test/jelly-nudge.test.js test/jelly-nudge-integration.test.js test/alarm-desktop.test.js test/alarm-countdown.test.js
```

- 源文件：`countdown-model.swift` / `jelly-model.swift` / `jelly-swim.swift` / `jelly-palette.swift` 是纯逻辑（只依赖 Foundation，由 `companion-selftest.swift` 单独编译运行，`test/desktop-companion-logic.test.mjs` 调用）；`glass-view.swift`、`jelly-ring.swift`、`jelly-companion.swift`、`jelly-controller.swift`、`confirmation-view.swift`、`main.swift` 是 AppKit。新增源文件须同步 `build.mjs` 清单与该合同测试。
- 测试钩子：环境变量 `TIMEKEEPER_TEST_HOOKS=1` 时命令 `menuItem {title}` 才能按标题触发右键菜单或状态栏菜单条目、命令 `ringButton {id}` 才能走响铃气泡的按钮动作入口，正式运行恒回 `ok:false`；`TIMEKEEPER_NIGHT_HOUR`、`TIMEKEEPER_REDUCE_MOTION`、`TIMEKEEPER_APPEARANCE=light|dark`（强制气泡外观）同为仅测试用。`ping` 回执里的 `mouse`（原生端看到的指针位置）只用于验收失败时的诊断。
- 没有新增权限、网络、依赖，不读键鼠空闲状态，不使用摄像头或麦克风；“怎么确认喝了水”只做了调研，见 `docs/research/research-jellyfish-drink-confirmation-20261016.md`。
- 验证边界：Chrome 侧业务替身测试、Swift 纯逻辑自测、隔离原生冒烟、真实 Chrome 侧模块 ↔ 真实原生进程联调已通过；真实 Chrome 156、真实账号、重装后的真实组件与全屏 Space 未验收，多显示器只在本机两块屏幕上用合成鼠标验证过响铃场景。详见 `docs/technical/jellyfish-resident-companion-20261016.md`。

## 到点响铃气泡（2026-10-16，取代右上角提醒卡片）

闹钟到点时 Chrome 照旧响铃、发系统通知，并向原生发 `show`；水母从原位（常驻）、屏幕右边（没有常驻）或倒计时位置出发，**游到鼠标所在屏幕可见区的底部正中**，气泡弹出（约 0.32 秒，带一点过冲），头上三圈涟漪循环。气泡从上到下：大号时间（`clock`）→ 提醒名字（最多 3 行，超过 3 个只列前 2 个，第 3 行写“等共 N 个”）→ 状态行（位置常驻，点按钮后“正在同步到 Chrome…”不会把内容顶上去）→ 通栏胶囊按钮：左“N 分钟后再提醒”（淡灰，没有稍后次数时整个不出现），右“停止”（实心青色）。**气泡出现后 0.5 秒内忽略点击**，防止正好在点别处时误触。

- 点按钮发 `action {sessionId, actionId, action, minutes}`，同步中按钮变灰；**收到匹配的 `actionResult` 才显示成功**（确认语“已停止”/“好的，N 分钟后再叫你”替换按钮行，约 1.4 秒后水母游走）；失败或 8 秒无回执只提示“Chrome 尚未确认”并恢复按钮，铃声与涟漪继续；迟到、不匹配的回执一律忽略。
- 响完：常驻或仍有倒计时 → 游回响铃前的位置（用户拖到别处就以放下的位置为准），没有常驻也没有倒计时 → 游向右边消失；响铃不改写记住的位置。Chrome 在别处处理（通知按钮、网页）发来的 `hide` 同样收起，不显示确认语。**真实顺序是 Chrome 先 `hide`、再回 `actionResult`**，所以原生端给回执 1.5 秒宽限，Chrome 端响铃会话结束后至少再保持连接 5 秒。
- 优先级：响铃 > 喝水/起身气泡（响铃期间拒绝它们，Chrome 退回系统通知）> 倒计时读数。**所有水母气泡（读数、点一下的详情、喝水/起身、响铃）随系统浅/深色**，配色在 `jelly-palette.swift`，文字对比度（正文 ≥4.5:1、大号时间 ≥3:1，对纯白、纯黑桌面背景各算一次取更差的）由自测守住。
- “减少动态效果”：水母不游动、不播涟漪，直接淡入到底部正中。响铃出现时发 VoiceOver 播报（未做真机验收）。
- 协议仍是 v6：`show` 只多三个可选字段 `clock` / `labels` / `more`，旧扩展不发时原生自行兜底（从 `timeText` 取时间、用 `title` 当名字），旧组件忽略它们；校验失败仍回 `ok:false`，Chrome 退回系统通知。业务调度、声音、`alarm-ring.html` 与已有降级路径不变。
- 隔离验收（同上，独立 Bundle ID，只截自家窗口）：`jelly-smoke.mjs --only=ring [--no-mouse]` 只跑响铃部分（约 100 秒，含逻辑场景与浅/深色自家窗口截图），`--only=ring-mouse` 只跑响铃的合成真实鼠标场景（点按钮、拖动、多显示器，约 50 秒），`--only=nudge-mouse` 只跑喝水提醒按钮的真实鼠标阶段；`bridge-smoke.mjs` 有响铃的真实顺序（Chrome 侧模块先 `hide` 再回执）；`smoke.mjs --app=… --auto` 走验收钩子。**水母按指针所在屏幕选落点，所以运行期间不要碰鼠标，也不要把指针挪到另一块屏幕**——否则会得到“水母去了别的屏幕”这类假失败（失败信息里带原生端看到的指针位置 `mouse`，可据此判断）。多显示器场景用 `mouse-helper screens` 取各屏可见区，只有一块屏幕时跳过并打印，不当作通过。验证结果与边界见 `docs/technical/jelly-ring-alarm-20261016.md`。

## 桌面 AI 助手 v7（2026-10-16）

水母常驻（设置页“桌面水母”）并打开“桌面 AI 助手”（默认关闭）后，在**任意应用**里按全局快捷键（默认 `⌃⇧B`，设置页可选四个预设）或右键水母选“问 AI…”，屏幕上方弹出一个原生输入面板：写需求、回车发送、看进度与结果、“停止”、“在 Chrome 中查看”。**Chrome 仍是唯一的执行器**：面板只显示与转发，任务、版本、预算、取消、确认、自动确认策略都在 Chrome 的 `AssistantEngine`，与浏览器里的 AI 工作台共用同一个会话；来自桌面的输入（`origin:'desktop'`）所有写操作一律先出确认卡，不经 pi 自动确认。需要选择 / 确认 / 补充时仍由原有的原生确认卡处理。只支持文字，不使用麦克风；Chrome 必须在运行（Chrome 断开连接后原生进程随之退出，面板和热键一起消失）。

- 协议 v7（在 v6 之上增量，旧组件忽略新字段；旧组件下设置页会提示更新）：`jelly` 命令可带 `assistant:{enabled:true, hotkey}`（不带就是关闭，原生据此注销热键），回执里带 `assistant:{status, hotkey?}`（`ok/invalid/taken/failed`）；Chrome → 原生 `assistantState {state}`（`null` 或 `{taskId, version, status, input, message, at}`）、`assistantResult {actionId, ok, error?}`；原生 → Chrome `assistantAction {actionId, action:'submit'|'cancel'|'open', text?, taskId?, version?}`。**只有收到匹配 `actionId` 的 `assistantResult(ok:true)` 才算 Chrome 接受**；失败显示 Chrome 给的原因并保留输入；8 秒没有回执只提示“Chrome 尚未确认”、不声称已提交，同一段文字重试沿用同一个 `actionId`（Chrome 侧幂等）。进度与结果只来自 `assistantState`，`completed` 只写“助手已回复”。
- 全局快捷键用 Carbon `RegisterEventHotKey`（公开 API，不需要“辅助功能”或“输入监控”权限；系统只在这一个组合被按下时通知本进程）。**macOS 不会告知这个组合是否也被别的应用使用**（本机 macOS 26.5 实测：两个进程注册同一组合都返回成功、按下时都收到；系统保留组合也返回成功；只有同一进程重复注册才返回 -9878），所以设置页只承诺“已向系统注册”，不承诺没有冲突。
- 面板：`NSPanel`（非激活式、浮动、所有 Space、随系统浅/深色），宽 560，水平居中、顶边在鼠标所在屏幕可见区高度的 22% 处；不记忆位置、不写任何持久化状态；已显示时再次唤出不改变位置。唤出后 0.25 秒核对确实拿到了键盘，没拿到只重试一次，仍没有就提示“没有拿到键盘焦点，请点一下输入框再输入”（面板保持可见、不吞输入）；用户自己切去别的应用不算失败，不会把键盘抢回来。`Esc` 或再按一次热键收起，只有收起时键盘还在面板里才把前台还给唤出前的应用。
- 源文件：`assistant-model.swift` 是纯逻辑（热键语法、键码、状态投影文案、文本清洗、焦点决策、面板几何，由 `companion-selftest.swift` 自测，并与 JS 的 `normalizeHotkey` 逐条对照），`assistant-hotkey.swift` / `assistant-panel.swift` 是 AppKit；新增源文件已登记于 `build.mjs` 与 `test/desktop-companion-logic.test.mjs`。
- 测试钩子（只有环境变量 `TIMEKEEPER_TEST_HOOKS=1` 才生效，正式运行恒回 `ok:false`）：命令 `assistantHook {op, text?}`，`op` 为 `show/toggle/hide/focus/skipfocus/deactivate/move/type/submit/stop/open/close`，走与用户操作相同的入口；`TIMEKEEPER_TEST_FOCUS_SKIP=N` 让前 N 次“激活并聚焦”什么都不做。`ping` 回执里 `assistant*` 字段（含 `assistantHotkeyPresses`，系统递给本进程的热键次数）只用于验收诊断，Chrome 不依赖。

隔离验收（独立 Bundle ID，不碰真实组件；面板截图只用 `screencapture -l` 取自家窗口号，不做整屏或区域截图）：

```sh
node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
node desktop-reminder/assistant-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-keyboard] [--shots=/tmp/tk/shots] [--only=protocol,focus,…] [--quiet=20]
node desktop-reminder/bridge-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app   # 含真实 AssistantEngine + AssistantNative ↔ 真实原生进程
node --test test/desktop-companion-logic.test.mjs test/assistant-native.test.js test/assistant-native-integration.test.js test/assistant-native-origin.test.js test/desktop-assistant-settings.test.js test/alarm-desktop.test.js test/jelly-desktop.test.js
```

`assistant-smoke.mjs` 有 12 个场景（`config conflict presets protocol no-ack focus hooks-off lifecycle menu keyboard placement shots`），其中 `keyboard`、`placement` 会合成真实键盘与鼠标移动，并且会把 Finder 切到前台再切回来（验证“用户去了第三个应用”）。**脚本会礼让正在使用电脑的人**（`desktop-reminder/user-quiet.mjs`）：每个场景开始前等用户至少安静 `--quiet` 秒（默认 20），运行中发现真实键盘 / 鼠标输入就立刻杀掉测试面板并以退出码 75 结束（不算验收失败，稍后重跑即可）；`--quiet=0` 关闭，只在无人值守时用。判断依据是系统的 `HIDIdleTime`（只读空闲时间，不读按键内容），脚本自己合成的输入会重置它，所以每次合成后都做了标记。
- 验证结果、与设计稿的差异、验证中发现并修复的缺陷、未验收项见 `docs/technical/native-assistant-workbench-20261016.md`。更新组件须重新构建安装并**重载扩展**：`node desktop-reminder/build.mjs --extension-id=<id> --install`。
