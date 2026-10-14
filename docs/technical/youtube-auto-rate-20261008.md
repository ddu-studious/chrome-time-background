# YouTube 自动 2 倍速的连接与回报核对

## 问题与调整

旧实现等整个 iframe 的 `load` 才开始 `listening`；慢资源会延迟快捷控制。首次设置即清除 `autoRatePending` 并将 UI 写成 2 倍速，没有等待真实回报。此外，原位切换后仅在 `onStateChange` 补设，忽略仅通过 `infoDelivery` 返回的播放状态。

- 复用已授权的 Chrome `tabs.getCurrent()`、`webNavigation.onCommitted` 和 `getAllFrames()`：只接受当前标签、顶层的直接子框架、与当前 iframe 完全相同的 URL、`active` 文档；帧快照只接受唯一匹配。导航提交后即可开始连接，不必等待全部资源。没有 API 或查询失败的 HTTP 预览继续使用 iframe `load`，不能猜测 about:blank 来源。
- 复用现有 `postMessage` 桥接，接收 `initialDelivery`、`infoDelivery` 和 `onPlaybackRateChange` 的真实倍速。保留精确 YouTube origin 和当前 iframe 的 `contentWindow` 校验，未确认时不高亮 2×。
- 自动设置只在视频已 cued、播放、暂停或缓冲时发送，每次间隔至少 2 秒，最多 6 次；就绪后最长等待 60 秒。收到真实 2 倍速回报才完成，次数或时间耗尽显示未确认。只读上报也能触发补设，不能仅依赖 `onStateChange`。
- 原位切换复用 `loadVideoById`；等待回报中的当前视频 URL/ID 与目标一致，再核对速度，避免将旧视频的 2× 与进度当成新视频成功。真实 Chrome 中发现该传输路径有时保留 2×，所以不能要求一定先回报 1。视频匹配等待也计入 60 秒时限，失败提示核对；工作台手动选速取消自动设置，自动成功后不持续锁定速度。
- 连接轮询每 700 毫秒一次、每轮最多 30 秒；后续真实 `load` 可重新开始连接。关闭、离开或切换清理监听与定时器，旧回调不得清理新播放器的定时器。不重复创建 iframe 或重播视频来修复倍速。

## 上游与适配范围

使用 Chrome 142+ 内置公开扩展 API，无新增依赖或权限。YouTube IFrame Player API 为在线、无固定版本的官方接口；复用本仓库已有 MV3 桥接适配，方法为 `setPlaybackRate`、`getPlaybackRate`、`loadVideoById`，当前视频标识来自回报中的 `videoUrl`（公开 `getVideoUrl` 对应数据）或 `videoData.video_id`，并核对真实状态。未复制或加载远程 SDK 脚本，未加入内容脚本、Cookie 提取或媒体直链。

原始 `listening` / delivery 消息是现有桥接的传输合同，并非独立的官方稳定 SDK；本次没有将其描述成正式 SDK 集成。这条 MV3 适配仍有 YouTube 传输实现变化的兼容边界，需要真实 Chrome 验收。

官方资料：

- [Chrome webNavigation：提交时资源可能尚未下载完成](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#event-onCommitted)
- [YouTube：设置倍速不保证生效、加载新视频会重置速度](https://developers.google.com/youtube/iframe_api_reference#Playback_rate)

## 验证

2026-10-08：`node --check` 与 `git diff --check` 通过。`node --test test/youtube-workbench-contract.test.js test/youtube-player-bridge.test.js test/youtube-home.test.mjs test/player-display-sync.test.js` 共 58 项通过。新增行为测试覆盖早于完整 load 的导航提交、提交竞态、重复帧、导航查询失败、首次设置未生效、真实速度展示、次数/时限、手动选速、原位切换后的重置/保留倍速两条路径、视频标识和进度隔离、来源伪造、取消清理、旧定时器回调隔离及连接超时恢复。

本机模型不涉及本次改动。HTTP 官方 iframe 预览与真实 Chrome 扩展/账号的验证结果分别记录，不以替身测试代替实际网络耗时或账号验收。

Chrome HTTP 独立预览使用官方示例视频 `M7lc1UVf-VE`，不写扩展观看历史。实际观察到 iframe 播放器可见而 `load` 尚未到达，完整 load 约 75.3 秒；首次设置发出后约 27 毫秒收到真实 `playbackRate=2`（`playerState=5`）。静音发起播放后经过缓冲，收到 `playerState=1` 且持续 `playbackRate=2`，确认该 HTTP 预览中的真实播放与倍速回报。仍未定位具体哪个网络资源拖延。

为在 HTTP 页面验证现有消息传输，曾在 Chrome 已回报该 iframe 的 YouTube Document 200 且播放器可见后，通过 CDP 在**独立调试页**标记导航并触发同一握手函数；随后看到 load 和真实倍速回报。这不替代扩展环境的 `webNavigation` 早接路径验收，也不构成其提速测量。真实扩展/真实账号完整播放和原位切换仍待重载扩展后验证。

原位加载另一官方示例 `bHQqvYy5KYo` 后，实际播放器标题和 URL 已切换，但仍上报速度 2；重新加载同一视频也可能保留速度。实际切换回报包含 `videoUrl` 和 `videoData.video_id`，已据此修正为视频绑定核对，不依赖一定重置为 1 的假设。

最终代码重新加载至 Chrome HTTP 预览后，初次完整 load 约 75.2 秒、首次设置到真实确认约 15 毫秒。原位加载第二示例后，`targetVideoId=bHQqvYy5KYo`、`rateVideoPending=false`、`autoRatePending=false`、`playerState=1`、`playbackRate=2`，确认新视频标识与真实倍速匹配；手动选 1× 和 2× 均收到对应回报，1× 持续期间自动设置未恢复。该结果为 HTTP 官方 iframe 验收，真实扩展环境的导航早接及账号路径仍待刷新后核对。
