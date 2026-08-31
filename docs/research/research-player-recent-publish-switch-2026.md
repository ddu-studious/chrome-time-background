---
title: "B 站与 YouTube 播放器最近发布切换调研"
type: research
status: implemented
version: "1.0"
created: "2026-08-22"
updated: "2026-08-22"
tags: [Bilibili, YouTube, Player, Recent Uploads, IFrame]
---

# B 站与 YouTube 播放器最近发布切换调研（2026）

## 1. 结论

能力可做，采用统一的产品形态、不同的平台切换实现：

- 位置：播放器画面下方、播放控制上方，使用横向最近发布栏；不遮挡 iframe，也不挤占内容侧栏。
- 内容：当前创作者最近 8 条公开视频，当前视频高亮，提供刷新与查看全部。
- 切换：点击卡片后停留在当前工作台。YouTube 使用官方 `loadVideoById` 原位加载；B 站在同一播放器容器内重载目标视频。
- 降级：数据不可用时保留播放器，显示可解释状态；不把列表请求失败升级成播放失败。

## 2. 官网与 GitHub 证据

### 2.1 YouTube

官方 Data API 提供稳定的两步读取路径：

1. `channels.list(part=contentDetails)` 读取 `contentDetails.relatedPlaylists.uploads`。
2. `playlistItems.list(playlistId=uploads)` 读取频道投稿列表；该读取方法单次成本为 1 quota unit。

官方 IFrame Player API 的 `loadVideoById(videoId, startSeconds)` 会加载并开始播放指定视频，适合在不销毁 iframe 的情况下切换。官方同时说明，调用视频/播放列表加载函数会把播放速度重置为 `1`，因此本扩展会在首次就绪和每次换稿后重新应用 `2×`。

参考：

- [YouTube Channels resource](https://developers.google.com/youtube/v3/docs/channels)
- [Retrieve a channel's uploaded videos](https://developers.google.com/youtube/v3/guides/implementation/videos)
- [PlaylistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [youtube/api-samples：retrieveMyUploads](https://github.com/youtube/api-samples/blob/master/apps-script/youtube.gs)
- [gajus/youtube-player：ready 后排队调用 loadVideoById](https://github.com/gajus/youtube-player/blob/main/README.md)

### 2.2 B 站

本次未找到 B 站开放平台面向普通 UGC 播放器公开的 JavaScript 原位换稿 API。因此不依赖未公开播放器对象，沿用当前扩展已验证的 iframe 播放路径，在同一容器中切换 BVID。

最近投稿优先使用 `GET /x/space/wbi/arc/search`，参数 `order=pubdate`；该接口依赖 WBI，可能出现 412 或空结果。失败时使用用户空间动态 `GET /x/polymer/web-dynamic/v1/feed/space`，从动态卡片中的 archive 恢复最近视频。

这些 B 站接口不是面向本扩展承诺稳定性的正式开放 API，需保留降级、去重和真实账号回归。

参考：

- [B 站网页播放器](https://www.bilibili.com/blackboard/html5player.html)
- [bili-apis：用户空间投稿接口](https://github.com/realysy/bili-apis/blob/master/docs/user/space.md)
- [bili-apis：用户空间动态接口](https://github.com/realysy/bili-apis/blob/master/docs/dynamic/space.md)
- [Bilibili-Live-API：动态 Feed 抓包验证](https://github.com/lovelyyoshino/Bilibili-Live-API/blob/master/API.dynamic_feed.md)

## 3. 交互设计

```text
┌──────────────────────── 播放器 16:9 ────────────────────────┐
│                                                             │
└─────────────────────────────────────────────────────────────┘
┌ 最近发布 ───────────────────────────────────── [刷新][全部] ┐
│ [当前视频] [视频 2] [视频 3] [视频 4]  → 横向滚动           │
└─────────────────────────────────────────────────────────────┘
┌──────────────────────── 播放控制 ───────────────────────────┐
└─────────────────────────────────────────────────────────────┘
```

设计约束：

- 卡片同时展示封面、标题、发布日期；不重复播放进度和统计信息。
- 当前视频使用图标、边框和 `aria-current` 三重状态，不只依赖颜色。
- 整卡是按钮，键盘焦点可见；横向溢出由轨道自身滚动，不让页面产生横向滚动。
- 切换视频不改变用户原来的返回列表上下文。
- 加载、空结果、未授权、接口失败均在最近发布栏内部呈现，不遮挡播放器。

## 4. 平台实现

| 项目 | B 站 | YouTube |
|---|---|---|
| 数据入口 | 投稿接口，失败回退空间动态 | Channel uploads playlist |
| 加载数量 | 8 | 8 |
| 切换方式 | 同一容器重载 BVID iframe | IFrame API `loadVideoById` |
| 播放速度 | 每次新视频自动应用 2×，之后允许手动调整 | 首次就绪与切换后自动应用 2×，之后允许手动调整 |
| 未登录/未授权 | 公开接口尽力加载 | 明确提示连接只读 OAuth |
| 列表失败 | 播放器继续工作 | 播放器继续工作 |

## 5. 验收边界

本地契约测试可验证 DOM、API 路径、状态与切换命令，但不能证明真实账号、WBI 风控、Google OAuth 配额和跨域播放器在当前 Chrome 包中的实时网络结果。正式验收仍需重载扩展后，分别用真实 B 站视频和已连接 YouTube 频道完成点击切换。
