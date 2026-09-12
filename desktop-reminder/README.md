# macOS 桌面闹钟组件

第一阶段：Chrome 保持原有调度、声音和通知，原生 AppKit 组件在当前桌面显示提醒卡片，回传停止/稍后提醒。不会把时间调度迁移到 macOS，Chrome 完全退出后不能继续到点提醒。

## 已安装与使用

本机已构建 `local-ai/.local/TimeKeeperDesktop.app`，并注册 Chrome 原生消息宿主 `com.timekeeper.desktop`。仅允许当前时钟扩展 `ipcgchgohpjheedlgfkcjlhhfbdljefo` 连接。

重新加载 Chrome 扩展、刷新新标签页，在闹钟页面点击“测试桌面提醒”。测试卡片不会修改已有闹钟。之后正常闹钟到点会优先显示原生卡片，系统通知和 Offscreen 声音继续保留。原生组件不可用时降级回原有系统通知及已配置的重要提醒 Chrome 小窗。

桌面组件由 Chrome `connectNative` 按需启动，无需手工打开 App、无须启动本地 AI 服务或加载模型，也不添加登录启动项。没有申请屏幕录制或辅助功能权限。提醒处理后断开连接并退出组件。菜单栏铃铛仅在组件运行期间出现。

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
- 模型和 HTTP AI 服务不参与响铃。Native Messaging 采用长度前缀 JSON，仅接受 ping/show/hide/actionResult，读取上限 64 KiB；stdout 只写协议帧。
- 点击停止/稍后后等待 Chrome 确认；8 秒未确认可重试。无回执不声称操作成功。
- 回传绑定 sessionId/actionId，重复动作幂等，旧会话不得停止新会话；后台复核当前会话后复用原 `stopUserAlarmSession`，稍后提醒仍按原限制创建待调度记录。
- 没有可用的稍后提醒次数时隐藏该按钮。浏览器内停止或会话过期会同步关闭原生卡片。
- 正常显示原生卡片时不额外聚焦 Chrome；组件启动失败时，已结束的会话不会在延迟后再次弹出 Chrome 小窗。

## 验证记录（2026-09-12，macOS 26.5）

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
