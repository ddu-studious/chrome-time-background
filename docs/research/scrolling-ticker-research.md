# 滚动信息栏（Tech Ticker）调研报告与 PRD

> **调研日期**: 2026-02-08  
> **项目**: 中国风景时钟 Chrome 扩展 - 滚动信息栏  
> **调研目标**: 在右侧时间区域上方添加滚动信息栏，展示 GitHub 热门项目和科技/AI 资讯

---

## 一、需求分析

### 1.1 核心需求

在新标签页右侧时间显示区域的上方，添加一条优雅的滚动信息栏（Ticker），实时展示：
1. **GitHub 热门项目** — 高 Star、近期热门的开源项目
2. **科技/AI 资讯** — Hacker News 热门帖子等技术社区动态

### 1.2 用户价值

- 每次打开新标签页时获取技术前沿信息
- 无需主动访问多个网站，信息自动聚合
- 不干扰主体功能（时钟、天气、任务），作为轻量信息补充

---

## 二、数据源调研

### 2.1 GitHub 热门项目

#### 方案 A：GitHub Search API（推荐 ✅）

GitHub 没有官方的 Trending API，但可以通过 **Search Repositories API** 模拟获取热门项目。

**API 端点**：
```
GET https://api.github.com/search/repositories
```

**推荐查询策略**：
```
# 获取最近7天创建的高 Star 项目
q=created:>2026-02-01&sort=stars&order=desc&per_page=10

# 获取特定语言的热门项目
q=language:python+created:>2026-02-01&sort=stars&order=desc&per_page=10

# 获取 Star 数超过1000的近期活跃项目
q=stars:>1000+pushed:>2026-02-01&sort=updated&order=desc&per_page=10
```

**速率限制**：
- 未认证：10 次/分钟
- 已认证：30 次/分钟
- 每次搜索最多返回 1000 条结果

**返回数据关键字段**：
```json
{
  "items": [
    {
      "full_name": "owner/repo-name",
      "html_url": "https://github.com/owner/repo-name",
      "description": "项目描述...",
      "stargazers_count": 5432,
      "language": "Python",
      "topics": ["ai", "machine-learning"],
      "created_at": "2026-02-01T10:00:00Z"
    }
  ]
}
```

**优点**：
- ✅ 官方 API，稳定可靠
- ✅ 无需认证即可使用（有速率限制）
- ✅ 支持丰富的查询条件
- ✅ CORS 友好（Chrome 扩展通过 host_permissions 即可直接调用）

**缺点**：
- ❌ 不是真正的 Trending 数据，是搜索排序
- ❌ 未认证速率限制较低（10 次/分钟）

#### 方案 B：第三方 Trending API

如 `https://github-trending-api.waningflow.com/` 等开源项目提供的 API。

**风险**：第三方服务不稳定，可能随时下线。**不推荐作为主要方案。**

### 2.2 科技/AI 资讯

#### 方案 A：Hacker News API（推荐 ✅）

Hacker News 提供完全免费、无需认证的 Firebase API。

**API 端点**：
```
# Top 500 Stories IDs
GET https://hacker-news.firebaseio.com/v0/topstories.json

# Best Stories IDs  
GET https://hacker-news.firebaseio.com/v0/beststories.json

# 单条详情
GET https://hacker-news.firebaseio.com/v0/item/{id}.json
```

**返回数据**：
```json
// topstories.json → [123, 456, 789, ...]（ID 数组）

// item/{id}.json
{
  "id": 123,
  "title": "Show HN: AI Coding Assistant",
  "url": "https://example.com/article",
  "score": 342,
  "by": "username",
  "time": 1706745600,
  "descendants": 156
}
```

**优点**：
- ✅ 完全免费，无需认证
- ✅ 无速率限制（Firebase 托管，高可用）
- ✅ 数据质量高，技术社区精选内容
- ✅ 天然适合开发者用户群

**缺点**：
- ❌ 需要两次请求（先获取 ID 列表，再获取详情）
- ❌ 内容以英文为主

#### 方案 B：NewsAPI / GNews

- 需要 API Key
- 免费额度有限（100 次/天）
- 不适合 Chrome 扩展场景（Key 暴露风险）
- **不推荐**

### 2.3 数据源方案选择

| 数据源 | 可行性 | 数据质量 | 免费 | 稳定性 | 选择 |
|-------|--------|---------|------|--------|------|
| GitHub Search API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | ✅ 主选 |
| Hacker News API | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ | ✅ 主选 |
| 第三方 Trending API | ⭐⭐ | ⭐⭐⭐⭐ | ✅ | ⭐⭐ | ❌ 不选 |
| NewsAPI/GNews | ⭐⭐⭐ | ⭐⭐⭐ | ⚠️ | ⭐⭐⭐ | ❌ 不选 |

**最终方案**：GitHub Search API + Hacker News API 双数据源

---

## 三、技术方案设计

### 3.1 整体架构

```
┌─────────────────────────────────────────┐
│              index.html                  │
│  ┌─────────────────────────────────┐    │
│  │     Scrolling Ticker Bar        │    │
│  │  ⭐ repo-name ★1.2k | 📰 HN... │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │       Time Container            │    │
│  │         12:30:45                │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘

Data Flow:
  Page Load
    → Check Cache (chrome.storage.session)
    → If expired → Fetch GitHub API + HN API
    → Merge & Format → Render Ticker
    → Cache with TTL (30min)
```

### 3.2 UI 设计

#### 位置
- 放置在 `.time-wrapper` 内部，`.time-container` 的上方
- 宽度与时间区域一致，不超过 `max-width: 700px`

#### 视觉风格
- 半透明磨砂玻璃效果，与现有 UI 统一
- 单行滚动，从右向左平滑滚动
- 每条信息包含：图标 + 标题 + 指标（Star数/Score）
- 悬停暂停滚动，点击跳转

#### 交互
- 鼠标悬停：暂停滚动，显示完整信息
- 点击信息项：在新标签页打开对应链接
- 右侧小按钮：刷新数据 / 切换数据源
- 支持折叠/隐藏

### 3.3 数据获取策略

```javascript
// 缓存策略
const CACHE_CONFIG = {
  github: {
    ttl: 30 * 60 * 1000,  // 30 分钟
    key: 'ticker_github_cache'
  },
  hackernews: {
    ttl: 15 * 60 * 1000,  // 15 分钟
    key: 'ticker_hn_cache'
  }
};

// GitHub 查询策略（轮换，避免单一查询导致重复）
const GITHUB_QUERIES = [
  // 最近7天创建的高 Star 项目
  `created:>${getDateDaysAgo(7)}&sort=stars&order=desc`,
  // AI/ML 相关热门项目
  `topic:artificial-intelligence+stars:>100+pushed:>${getDateDaysAgo(30)}&sort=stars`,
  // 最近活跃的千星项目
  `stars:>1000+pushed:>${getDateDaysAgo(7)}&sort=updated`
];
```

### 3.4 Chrome 扩展适配

#### host_permissions 更新
```json
{
  "host_permissions": [
    "https://*.unsplash.com/*",
    "https://devapi.qweather.com/*",
    "https://commons.wikimedia.org/*",
    "https://upload.wikimedia.org/*",
    "https://api.github.com/*",
    "https://hacker-news.firebaseio.com/*"
  ]
}
```

#### CORS 处理
- Chrome 扩展页面（chrome-extension:// 协议）通过 `host_permissions` 声明后，可以直接 fetch 外部 API，无 CORS 限制
- 不需要 background.js 代理

### 3.5 性能优化

1. **缓存优先**：使用 `chrome.storage.session` 缓存数据，避免频繁请求
2. **懒加载**：页面加载后延迟 2 秒再获取 ticker 数据，优先加载时钟和天气
3. **批量请求**：Hacker News 只获取 Top 10 条目的详情
4. **CSS 动画**：使用 `transform: translateX()` 实现滚动，GPU 加速
5. **requestAnimationFrame**：平滑动画，低 CPU 占用

---

## 四、详细 PRD

### 4.1 功能需求

#### FR-1: 滚动信息栏展示
- 在时间显示区域上方展示一条水平滚动信息栏
- 信息从右向左连续滚动
- 单行显示，高度约 36px
- 各信息项之间用分隔符隔开

#### FR-2: GitHub 热门项目
- 展示最近 7 天内创建的高 Star 项目（Top 10）
- 每项显示：GitHub 图标 + 项目名 + Star 数 + 简短描述
- 点击跳转到 GitHub 仓库页面

#### FR-3: Hacker News 热门资讯
- 展示 HN Top Stories 前 10 条
- 每项显示：HN 图标 + 标题 + 分数
- 点击跳转到原文或 HN 讨论页

#### FR-4: 数据缓存
- GitHub 数据缓存 30 分钟
- Hacker News 数据缓存 15 分钟
- 缓存使用 chrome.storage.session

#### FR-5: 交互控制
- 鼠标悬停暂停滚动
- 右侧提供刷新按钮
- 支持通过设置开关控制显示/隐藏

### 4.2 非功能需求

- 页面加载后 2 秒内开始展示（有缓存时）
- API 请求失败时静默降级，不影响主功能
- 滚动动画帧率 ≥ 30fps
- 总内存占用增加 < 5MB

### 4.3 数据结构

```javascript
// Ticker 数据项
{
  type: 'github' | 'hackernews',  // 数据源类型
  title: string,                   // 显示标题
  url: string,                     // 跳转链接
  icon: string,                    // 图标（emoji或class）
  metric: string,                  // 指标文本（如 "⭐ 1.2k" 或 "▲ 342"）
  description: string,             // 简短描述
  timestamp: number                // 数据时间戳
}
```

### 4.4 实现优先级

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | 基础滚动 UI | HTML + CSS 滚动动画 |
| P0 | GitHub 数据获取 | Search API 集成 |
| P0 | Hacker News 数据获取 | Firebase API 集成 |
| P1 | 数据缓存 | session storage 缓存 |
| P1 | 悬停暂停/点击跳转 | 基本交互 |
| P2 | 刷新按钮 | 手动刷新数据 |
| P2 | 设置开关 | 控制显示/隐藏 |
| P3 | 数据源切换 | 仅显示 GitHub / 仅显示 HN |

---

## 五、UI 设计稿

### 5.1 滚动条样式

```
┌──────────────────────────────────────────────────────┐
│ 🔥  repo-name ⭐1.2k  │  📰 AI发布新模型 ▲342  │  🔥... │
└──────────────────────────────────────────────────────┘
                    ← 滚动方向 ←
```

### 5.2 配色方案

- 背景：`rgba(0, 0, 0, 0.3)` + `backdrop-filter: blur(10px)`
- GitHub 图标色：`#f0883e`（橙色）
- HN 图标色：`#ff6600`（HN 橙色）
- 文字色：`rgba(255, 255, 255, 0.85)`
- Star 色：`#f1c40f`（金色）
- 分隔符：`rgba(255, 255, 255, 0.2)`

---

## 六、总结

### 最佳方案

采用 **GitHub Search API + Hacker News API** 双数据源方案：

1. **免费且稳定** — 两个 API 均免费、高可用
2. **无需认证** — 降低实现复杂度
3. **数据质量高** — GitHub 开源项目 + HN 技术社区精选
4. **Chrome 扩展友好** — 通过 host_permissions 直接调用，无 CORS 问题
5. **缓存策略合理** — 减少 API 调用，提升加载速度

### 实施步骤

1. 更新 `manifest.json` 添加 host_permissions
2. 创建 `js/ticker.js` 数据获取模块
3. 在 `index.html` 添加 ticker HTML 结构
4. 在 `css/style.css` 添加滚动动画样式
5. 在 `js/main.js` 初始化 ticker 模块
6. 测试与优化

---

**文档版本**: v1.0  
**调研完成日期**: 2026-02-08  
**维护者**: AI Assistant
