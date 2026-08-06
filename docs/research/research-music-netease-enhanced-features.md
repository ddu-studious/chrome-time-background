---
title: "网易云音乐增强功能 API 调研报告"
type: research
status: active
version: "1.0"
created: "2026-08-05"
updated: "2026-08-05"
author: "AI Agent"
tags: [音乐, 网易云, API, 开源, 调研]
related:
  - docs/requirements/prd-v3.19.0-music-enhanced-features.md
  - docs/research/research-netease-api-v3.4.0.md
changelog:
  - date: "2026-08-05"
    desc: "初始创建"
---

# 网易云音乐增强功能 API 调研报告

**日期**: 2026-08-05
**状态**: active
**关联 PRD**: prd-v3.19.0-music-enhanced-features.md

---

## 一、调研目标

基于当前扩展已有的网易云音乐播放能力，调研可进一步集成的网易云 API 接口，让扩展更接近客户端体验。

## 二、参考项目

| 项目 | 地址 | 说明 |
|------|------|------|
| NeteaseCloudMusicApiEnhanced | [GitHub](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) | 社区维护的 200+ 接口，支持解灰/FLAC |
| YesPlayMusic | [GitHub](https://github.com/qier222/YesPlayMusic) | 高颜值第三方播放器，Vue.js，32k+ Stars |
| Listen1 Chrome Extension | [GitHub](https://github.com/listen1/listen1_chrome_extension) | 多平台聚合 Chrome 扩展 |
| netease-music-crx | [GitHub](https://github.com/sigoden/netease-music-crx) | 简洁的网易云 Chrome 扩展（已归档） |
| NetEaseMusicWorld++ | [Chrome Store](https://chromewebstore.google.com/detail/ibglohpjgdhkmhmfpdibjgmjjmccafmh) | 解锁海外限制 |

## 三、现有功能覆盖

### 已实现

| 功能 | API | 实现版本 |
|------|-----|---------|
| 播放/暂停/上下首 | offscreen audio | v2.9.0 |
| 搜索歌曲/歌单/歌手 | `/api/search/get/web` | v2.9.0 |
| 用户歌单列表 | `/api/user/playlist` | v3.4.0 |
| 歌单详情与播放 | `/api/v6/playlist/detail` | v3.4.0 |
| 歌曲详情 | `/api/v3/song/detail` | v3.4.0 |
| 获取播放链接 | `/api/song/enhance/player/url/v1` | v3.4.0 |
| 歌词 | `/api/song/lyric/v1` | v3.4.0 |
| 每日推荐歌曲 | `/api/v3/discovery/recommend/songs` | v3.4.0 |
| 排行榜 | `/api/toplist` | v3.4.0 |
| 私人FM | `/api/v1/radio/get` | v3.13.0 |
| FM 垃圾桶 | `/api/radio/trash/add` | v3.13.0 |
| 喜欢歌曲 | `/api/song/like` | v3.13.0 |
| 心动模式 | `/api/playmode/intelligence/list` | v3.13.0 |
| 分类随机听 | `/api/playlist/list` | v3.13.0 |
| 歌手详情/热门/专辑/相似 | 多接口 | v3.15.0/v3.18.0 |
| 专辑详情 | `/api/album/v3/detail` | v3.18.0 |
| 收藏歌单 | `/api/playlist/subscribe` | v3.19.0 |

### 待实现（本次调研重点）

见下文第四节。

## 四、新增 API 接口详细调研

### 4.1 每日签到

**接口**: `/api/point/dailyTask`
**方法**: POST
**参数**: `type=0`（安卓端签到，获取 3 云贝）

**返回示例**:
```json
{
  "code": 200,
  "point": 3,
  "msg": null
}
```

**异常码**:
- `code: -2`: 重复签到
- `code: 301`: 未登录

**调研结论**: 接口稳定，可直接通过已有 `_neteaseApi` 调用。YesPlayMusic 曾实现自动签到功能，后因网易政策调整移除。建议默认手动签到，自动签到作为可选项。

---

### 4.2 收藏单曲到歌单

**接口**: `/api/playlist/manipulate/tracks`
**方法**: POST
**参数**:
- `op`: `add`（添加）或 `del`（移除）
- `pid`: 目标歌单 ID
- `trackIds`: 歌曲 ID（逗号分隔支持批量）

**返回示例**:
```json
{
  "code": 200,
  "status": 200,
  "body": { "code": 200, "trackIds": "12345" }
}
```

**异常码**:
- `code: 502`: 歌曲已存在于该歌单
- `code: 401`: 无权操作（非自己的歌单）
- `code: 301`: 未登录

**调研结论**: 需要配合 `/api/user/playlist` 获取用户自建歌单列表。过滤条件为 `playlist.creator.userId === 当前用户 userId`。

---

### 4.3 相似歌曲

**接口**: `/api/simi/song`
**方法**: GET
**参数**: `id`（歌曲 ID）

**返回结构**:
```json
{
  "code": 200,
  "songs": [
    {
      "id": 12345,
      "name": "歌曲名",
      "artists": [{"id": 1, "name": "歌手名"}],
      "album": {"id": 1, "name": "专辑名", "picUrl": "..."}
    }
  ]
}
```

**调研结论**: 返回数量通常 6-10 首。部分冷门歌曲可能返回空列表。YesPlayMusic 在歌曲详情页使用此接口展示相似推荐。

---

### 4.4 新歌速递

**接口**: `/api/top/song`
**方法**: GET
**参数**: `type`
- 0: 全部
- 7: 华语
- 96: 欧美
- 8: 日语
- 16: 韩语

**返回结构**:
```json
{
  "code": 200,
  "data": [
    {
      "id": 12345,
      "name": "歌曲名",
      "artists": [{"id": 1, "name": "歌手名"}],
      "album": {"id": 1, "name": "专辑名", "picUrl": "..."}
    }
  ]
}
```

**调研结论**: 每个分类通常返回 50-100 首新歌。数据每日更新。适合在「发现」Tab 中以瀑布流或列表形式展示。

---

### 4.5 播放记录

**接口**: `/api/v1/play/record`
**方法**: GET
**参数**:
- `uid`: 用户 ID
- `type`: 0（所有时间）/ 1（最近一周）

**返回结构**:
```json
{
  "code": 200,
  "weekData": [
    {
      "playCount": 15,
      "song": { "id": 12345, "name": "歌曲名", "ar": [...] }
    }
  ],
  "allData": [...]
}
```

**调研结论**: `type=1` 返回 `weekData`，`type=0` 返回 `allData`。每种最多 100 首，按播放次数降序。需要先获取用户 UID（可从 `/api/nuser/account/get` 获取，已有调用）。

---

### 4.6 推荐歌单

**接口**: `/api/recommend/resource`
**方法**: GET
**参数**: 无（基于登录 Cookie 个性化推荐）

**返回结构**:
```json
{
  "code": 200,
  "recommend": [
    {
      "id": 12345,
      "name": "歌单名",
      "copywriter": "推荐理由",
      "picUrl": "封面URL",
      "playcount": 100000,
      "trackCount": 50
    }
  ]
}
```

**调研结论**: 每日推荐 6-10 个歌单，基于用户听歌偏好。适合在「发现」Tab 中以卡片形式展示。

---

### 4.7 搜索建议

**接口**: `/api/search/suggest/web`
**方法**: GET
**参数**: `s`（搜索关键词）

**返回结构**:
```json
{
  "code": 200,
  "result": {
    "songs": [...],
    "artists": [...],
    "albums": [...],
    "playlists": [...]
  }
}
```

**调研结论**: 返回混合建议，包含歌曲/歌手/专辑/歌单。适合在搜索输入框下方实时展示。需注意防抖（300ms+），避免频繁请求。

---

### 4.8 歌曲评论

**接口**: `/api/v1/resource/comments/R_SO_4_{id}`
**方法**: GET
**参数**:
- `pageSize`: 每页条数（默认 20）
- `pageNo`: 页码
- `sortType`: 1（按推荐排序）/ 2（按热度排序）/ 3（按时间排序）

**调研结论**: 热门评论是网易云核心社交功能。在扩展中适合展示 Top 5-10 热评。

---

### 4.9 精品歌单

**接口**: `/api/playlist/highquality/list`
**方法**: GET
**参数**:
- `cat`: 分类标签（如 "华语"、"流行" 等，默认全部）
- `limit`: 数量

**调研结论**: 适合在「发现」中作为精品推荐区域。与「分类随机听」可互补。

---

### 4.10 新碟上架

**接口**: `/api/album/new`
**方法**: GET
**参数**:
- `area`: ALL / ZH / EA / KR / JP
- `limit`, `offset`

**调研结论**: 适合关注歌手新专辑的用户。可结合歌手操作台使用。

---

## 五、技术可行性总结

| 维度 | 评估 |
|------|------|
| API 兼容性 | 所有接口均为网易云 Web API，可通过已有 `neteaseApiCall` 直接调用 |
| 认证要求 | 所有接口需要 music.163.com Cookie，与现有方案一致 |
| 性能影响 | 单次请求延迟 200-500ms，不影响播放体验 |
| 额外依赖 | 无，不需要第三方 API 服务 |

## 六、风险与注意事项

1. **接口稳定性**: 网易云 Web API 非官方公开接口，存在调整风险，建议做好容错
2. **频率限制**: 避免短时间大量请求，建议签到等操作做本地去重
3. **隐私安全**: 播放记录等数据仅在本地展示，不做持久化存储
4. **收藏操作**: 属于写入操作，需谨慎处理，避免误操作（如添加确认）
