---
name: youtube-discovery
description: 搜索 YouTube 视频，或从扩展本地观看记录继续观看。
---

# YouTube

搜索使用 video.search(platform="youtube", query=标题关键词)，需要扩展已连接 Google 账号。未连接时可由用户选择打开原站搜索。
继续看使用 video.history(platform="youtube", query=标题关键词或空字符串)。dayOffset=0/1/2 表示今天/昨天/前天；unfinishedOnly=true 筛选存在有效续播进度的记录。此记录来自扩展本地，不是 YouTube 官方账号的全部历史。对这些已支持条件直接查询，不需要额外确认。
选择候选后在原站打开并携带已知进度；不能声称播放器已确认播放。
没有字幕或视频内容理解工具，不能忽略用户限制或编造看过的视频。

搜索可传minSeconds/maxSeconds按真实时长筛选；未知时长会排除。结果提供nextRef，video.search.next用此引用翻页并保留条件。video.inspect组提供video.details、video.progress.get、video.open及翻页；这些工具都需要platform和真实ref。先展示真实候选，由用户选择后打开。进度无记录不等于从未观看；打开不等于已播放。
