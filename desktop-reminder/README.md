# macOS 桌面闹钟组件

Chrome 保持原有调度、声音和通知，原生 AppKit 组件显示可拖动倒计时胶囊和到点提醒卡片，回传停止/稍后提醒。不会把时间调度迁移到 macOS，Chrome 完全退出后不能继续到点提醒。

## 已安装与使用

本机已构建 `local-ai/.local/TimeKeeperDesktop.app`，并注册 Chrome 原生消息宿主 `com.timekeeper.desktop`。仅允许当前时钟扩展 `ipcgchgohpjheedlgfkcjlhhfbdljefo` 连接。

重新加载 Chrome 扩展、刷新新标签页，在闹钟页面点击“测试桌面提醒”。测试卡片不会修改已有闹钟。之后正常闹钟到点会优先显示原生卡片，系统通知和 Offscreen 声音继续保留。原生组件不可用时降级回原有系统通知及已配置的重要提醒 Chrome 小窗。

桌面组件由 Chrome `connectNative` 按需启动，无需手工打开 App、无须启动本地 AI 服务或加载模型，也不添加登录启动项。没有申请屏幕录制或辅助功能权限。没有倒计时和响铃需要显示时断开连接并退出组件。倒计时显示期间保持 Native Messaging 连接；每秒刷新由原生 Timer 完成，不轮询 Chrome 或调用模型。菜单栏铃铛仅在组件运行期间出现。

## 构建、重新安装

项目根目录执行（需 macOS Command Line Tools）：

```sh
node desktop-reminder/build.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --install
```

不带 `--install` 时只编译和本地 ad-hoc 签名，不修改 Chrome 注册目录。换电脑或扩展 ID 后需使用实际 ID 重新安装。该构建用于本机开发，不是已公证的公开发行包。

注册文件：`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.timekeeper.desktop.json`。卸载时移除这个文件和项目内的生成 App 即可；不影响闹钟存储和 Chrome 原有通知。安装器更换已有注册内容时会保存带时间戳的备份。

## 展示和操作边界

- 原生 `NSPanel` 使用不激活应用的浮动面板，位于鼠标所在屏幕的右上角。长标题适度增加高度，卡片可拖动。
- 使用 `canJoinAllSpaces`、`fullScreenAuxiliary` 及受系统版本保护的 `canJoinAllApplications`，为跨桌面和全屏空间显示配置公开 API。锁屏及安全系统界面不承诺覆盖。
- 模型和 HTTP AI 服务不参与响铃。Native Messaging 采用长度前缀 JSON，接受 ping/show/hide/actionResult/countdown/confirmation/confirmationResult，读取上限 256 KiB（v4）；stdout 只写协议帧。
- 点击停止/稍后后等待 Chrome 确认；8 秒未确认可重试。无回执不声称操作成功。
- 回传绑定 sessionId/actionId，重复动作幂等，旧会话不得停止新会话；后台复核当前会话后复用原 `stopUserAlarmSession`，稍后提醒仍按原限制创建待调度记录。
- 没有可用的稍后提醒次数时隐藏该按钮。浏览器内停止或会话过期会同步关闭原生卡片。
- 正常显示原生卡片时不额外聚焦 Chrome；组件启动失败时，已结束的会话不会在延迟后再次弹出 Chrome 小窗。

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

运行原生交互测试：

```sh
node desktop-reminder/smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --action=dismiss
node desktop-reminder/smoke.mjs --extension-id=ipcgchgohpjheedlgfkcjlhhfbdljefo --action=snooze
node --test test/alarm-desktop.test.js test/alarm-clock-contract.test.js test/local-ai*.test.mjs
```

官方协议参考：https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging

## 桌面倒计时（2026-09-19）

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


## 胶囊透明边角与缩放优化（2026-09-19）

- 复用 AppKit `NSVisualEffectView.maskImage`，按材质实际尺寸生成 alpha 遮罩。只给 CALayer 设置圆角不会完整裁切系统磨砂材质；现在材质与窗口阴影共享胶囊形状，布局变化时同步刷新遮罩和阴影。没有引入第三方 UI 引擎。
- 减轻描边，使用青灰文字、等宽数字和分层字号；关闭图标减小，仍保留独立的可点击区域。
- 复用 `NSWindow` 的 `.resizable`、`contentAspectRatio`、`minSize`、`maxSize` 和 frame autosave。宽度范围 272–544 点，保持 3.4:1 比例；拖窗口边缘或右侧双斜线手柄调整大小，文字和图标同步缩放。
- 手柄是薄事件适配：使用鼠标事件的屏幕坐标计算拖动，支持非激活窗口的首次点击；点击手柄或右键浮窗可选“小巧 / 标准 / 舒展”。菜单操作也支持辅助功能触发。
- 位置恢复不再硬编码 320 × 96，保留上次宽度并限制在当前显示器内；关闭浮窗、下次提醒和重新启动均复用保存尺寸。
- 官方 API：[材质遮罩](https://developer.apple.com/documentation/appkit/nsvisualeffectview/maskimage)、[窗口比例约束](https://developer.apple.com/documentation/appkit/nswindow/aspectratio)。

此次验收使用 `/tmp/TimeKeeperCountdownPreview.app` 独立 bundle，避免移动/关闭真实闹钟。已真实拖动手柄放大，并通过菜单切换 272 × 80、340 × 100、442 × 130；截图 RGBA 检查确认胶囊外角 alpha 为 0，邻近柔和阴影的 alpha 为 3，不再有矩形材质底板。Swift 编译及现有 22 项闹钟相关测试通过。

- 补充实测：点击缩放手柄可打开尺寸菜单；缩放后退出并重新启动原生组件，分别断言恢复 442 × 130 和 340 × 100 成功。重新启动、响铃切换以及标题更新没有重置尺寸。最终截图：`output/screenshots/alarm-countdown-resizable.png`。
- 此次验收是隔离原生窗口与已有 JS 调度测试；真实 Chrome 当前连接仍使用旧进程，重载扩展后使用新组件，不将本次验收描述为真实闹钟从创建到响铃的全链路验收。
