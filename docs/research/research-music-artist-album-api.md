---
title: "网易云音乐歌手/专辑 API 调研报告"
type: research
status: completed
version: "1.0"
created: "2026-08-05"
updated: "2026-08-05"
author: "AI Agent"
tags: [音乐, 网易云, API, 歌手, 专辑, 调研]
related:
  - docs/requirements/prd-v3.18.0-music-artist-album-navigation.md
changelog:
  - date: "2026-08-05"
    desc: "初始创建，完成 API 接口调研、开源项目调研、UI 趋势调研"
---

# 网易云音乐歌手/专辑 API 调研报告

## 一、调研目的

为 v3.18.0「歌手/专辑交互导航增强」提供 API 可行性分析、开源项目参考和 UI 设计趋势调研。

## 二、API 接口调研

### 2.1 数据来源

调研基于以下开源项目（均活跃维护中）：
- **NeteaseCloudMusicApi** (GitHub 12k+ Stars) — 最全的网易云 Node.js API
- **NeteaseCloudMusicApiEnhanced** — 增强版，新增解灰、多音源等
- **ncm-api-rs** (SPlayer-Dev) — Rust 实现版
- **NCMApi-plugin** — 自建部署版

### 2.2 歌手相关接口（17 个端点）

| 接口路径 | 方法 | 说明 | 必选参数 | 项目现状 |
|----------|------|------|----------|----------|
| `/api/artist/top/song` | GET | 歌手热门50首 | id | ✅ 已接入 |
| `/api/v1/artist` | GET/POST | 歌手信息+热门歌曲 | id | ✅ 已接入 |
| `/api/artist/albums` | GET/POST | 歌手专辑列表 | id, limit, offset | ✅ 已接入 |
| `/api/v1/artist/albums` | GET/POST | 歌手专辑(v1) | id, limit, offset, total | ✅ 已接入 |
| `/api/artist/detail` | GET | 歌手详情（头图/简介） | id | ❌ 未接入 |
| `/api/artist/desc` | GET | 歌手描述 | id | ❌ 未接入 |
| `/api/artist/songs` | GET | 歌手全部歌曲 | id, order, limit, offset | ❌ 未接入 |
| `/api/artist/mv` | GET | 歌手MV | id, limit, offset | ❌ 未接入 |
| `/api/artist/list` | GET | 歌手分类列表 | area, type, initial | ❌ 未接入 |
| `/api/artist/sub` | POST | 收藏/取消歌手 | id, t | ❌ 未接入 |
| `/api/artist/sublist` | GET | 已收藏歌手列表 | limit, offset | ❌ 未接入 |
| `/api/artist/fans` | GET | 歌手粉丝 | id, limit, offset | ❌ 未接入 |
| `/api/artist/follow/count` | GET | 歌手关注数 | id | ❌ 未接入 |
| `/api/artist/new/mv` | GET | 关注歌手新MV | | ❌ 未接入 |
| `/api/artist/new/song` | GET | 关注歌手新歌 | | ❌ 未接入 |
| `/api/artist/video` | GET | 歌手视频 | id | ❌ 未接入 |
| `/api/discovery/simiArtist` | GET/POST | 相似歌手推荐 | artistid | ✅ 已接入 |

### 2.3 专辑相关接口

| 接口路径 | 方法 | 说明 | 必选参数 | 项目现状 |
|----------|------|------|----------|----------|
| `/api/v1/album` | GET | 专辑内容(歌曲列表) | id | ✅ 已接入 |
| `/api/album/detail` | GET | 专辑详情(动态信息) | id | ❌ 未接入 |
| `/api/album/detail/dynamic` | GET | 专辑动态(收藏数/评论数) | id | ❌ 未接入 |
| `/api/album/sub` | POST | 收藏/取消专辑 | id, t | ❌ 未接入 |
| `/api/album/sublist` | GET | 已收藏专辑列表 | limit, offset | ❌ 未接入 |

### 2.4 关键数据字段

歌曲详情 `/api/v3/song/detail` 返回结构：
```json
{
  "songs": [{
    "name": "歌曲名",
    "id": 123456,
    "ar": [
      { "id": 6452, "name": "周杰伦" },
      { "id": 5771, "name": "方文山" }
    ],
    "al": {
      "id": 34567,
      "name": "专辑名",
      "picUrl": "https://p1.music.126.net/xxx/xxx.jpg"
    }
  }]
}
```

**关键发现**：`ar` 数组天然支持多歌手场景，每个歌手都有独立 `id`，可直接用于跳转。

### 2.5 项目已有的 API 回退策略

当前 `music-controller.js` 已实现多端点回退：

**歌手热门歌曲**（3 级回退 + 搜索兜底）：
1. `/api/artist/top/song` GET
2. `/api/v1/artist` GET → `hotSongs`
3. `/api/v1/artist` POST → `hotSongs`
4. 回退：搜索歌手名 `/api/search/get/web` type=1

**歌手专辑**（4 级回退 + 搜索兜底）：
1. `/api/artist/albums` GET
2. `/api/artist/albums` POST
3. `/api/v1/artist/albums` GET
4. `/api/v1/artist/albums` POST
5. 回退：搜索歌手名 `/api/search/get/web` type=10

**结论**：API 层容错性已非常好，本次迭代核心工作在 UI 触点改造。

## 三、开源项目调研

### 3.1 Listen 1 Chrome Extension (12k+ Stars)

- 多平台聚合播放器（网易云/QQ/酷狗/酷我/B站/咪咕/千千）
- **歌手交互设计**：
  - 搜索→歌手列表→歌手详情页（热门歌曲+专辑）
  - 歌曲主页：点击封面进入包含歌手/专辑信息的详情页
  - 支持网易云排行榜、艺人页面、专辑页面 URL 解析
- **参考价值**：歌手页面的 Tab 结构（热门/专辑/MV）

### 3.2 Shin Netease Music (Chrome Extension)

- 专注网易云音乐网页版 UI 重设计
- 基于 vitesse-webext 模板，Vue 3 + TypeScript
- **参考价值**：对官方 UI 的优化思路（暗色模式适配、页面布局优化）

### 3.3 Pulse Music Player UI (GitHub Demo)

- 移动端优先的音乐播放器 UI
- 单页 HTML + Tailwind CSS + Alpine.js
- **包含完整的歌手/专辑页面**：
  - Artist Detail Page：简介 + Top Songs + Play Top 操作
  - Album Detail Page：歌曲列表 + Play Album / Shuffle
  - 全局搜索跨 Songs/Artists/Albums
- **参考价值**：mobile-first 交互模式，底部导航 + mini-player

## 四、UI 设计趋势调研 (2026)

### 4.1 Apple Music iOS 27 (2026)

- **歌手页面重设计**：歌手图片融入页面背景，配色动态自适应专辑封面
- **布局简化**：歌手信息、播放按钮、精选音乐分区明确
- **设计哲学**：从"消费音乐"到"体验音乐"，聚焦歌手身份认同
- **专辑页面**：预计也采用类似的沉浸式头图设计

### 4.2 Qobuz 2026 重设计

- **全新播放器界面**：环境动态适应专辑封面色调
- **Mini-player 常驻**：导航过程中始终可控制播放
- **Explore 探索页**：基于一首歌推荐相似专辑、歌手、歌单、电台
- **队列手势**：滑动即可重排/移除

### 4.3 共同设计趋势

| 趋势 | 说明 | 我们的适配方案 |
|------|------|---------------|
| Tab 式歌手页 | Popular / Discography / About | 已有 3-tab（热门/专辑/相似） |
| 底部弹出式操作菜单 | 点击歌手/专辑弹出 Action Sheet | 已有 ActionSheet 浮层 |
| 沉浸式头图 | 歌手大图融入背景 | Phase 3 升级 header |
| Mini-player 常驻 | 播放不中断探索 | 已有 mc-strip 常驻 |
| 动态配色 | 界面色调跟随封面 | 暂不实现（复杂度高） |

## 五、结论与建议

### 5.1 API 层

- **无需新增中间服务**：继续直连网易云 API + Cookie 认证
- **Phase 1-2 无新 API**：所有需要的接口已接入
- **Phase 3 新增 1 个**：`/api/artist/detail` 获取歌手头图/简介

### 5.2 UI 层

- **核心改造量在前端**：8 个触点的 mc-row-artist 可点击改造
- **复用已有能力**：`_openArtistActionSheet()` 已是完整的歌手操作台
- **渐进增强**：Phase 1 先做可点击，Phase 3 再升级视觉效果

### 5.3 风险评估

| 风险项 | 等级 | 说明 |
|--------|------|------|
| API 兼容性 | 低 | 已有多端回退策略 |
| 性能影响 | 低 | 内存缓存 + 防抖 |
| UI 复杂度 | 中 | 多歌手拆分 + 返回栈需仔细处理 |
| 数据迁移 | 低 | playlist 结构向后兼容（新字段可选） |
