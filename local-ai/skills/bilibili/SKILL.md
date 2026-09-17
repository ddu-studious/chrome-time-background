---
name: bilibili-discovery
description: 搜索 B 站视频，或查询最近观看记录以继续观看。
---

# 哔哩哔哩

搜索使用 video.search(platform="bilibili", query=标题关键词)。
继续看使用 video.history(platform="bilibili", query=标题关键词或空字符串)。可用 dayOffset=0/1/2 表示今天/昨天/前天，unfinishedOnly=true 筛选未看完的记录。这些筛选在最近一页记录上执行，不覆盖全部历史。
用户说“继续昨天没看完的 MySQL 视频”时直接调用 video.history(platform="bilibili", query="MySQL", dayOffset=1, unfinishedOnly=true)，无需先询问是否查询。
展示真实视频和观看进度，由用户选择后在原站打开；已打开页面不等于播放器已成功播放。
没有字幕、内容理解和收藏写入工具，不能凭标题编造内容。

搜索可传minSeconds/maxSeconds按真实时长筛选；未知时长会排除。结果提供nextRef，video.search.next用此引用翻页并保留条件。video.inspect组提供video.details、video.progress.get、video.open及翻页；这些工具都需要platform和真实ref。先展示真实候选，由用户选择后打开。进度无记录不等于从未观看；打开不等于已播放。
