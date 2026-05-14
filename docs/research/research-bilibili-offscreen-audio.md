# 哔哩哔哩 Chrome 扩展集成技术调研（v2）

> 调研日期：2026-03-20（v1）→ 2026-03-22（v2 重构）  
> 调研人：AI Agent  
> 目标：评估在 Chrome 扩展中集成哔哩哔哩内容播放的技术方案，对比三种架构路线

---

## 1. 调研结论

前版方案（纯 API 音频提取 + WBI 签名 + DASH）复杂度过高，维护风险大，且**无法复用网易云的 Offscreen Document 架构**（B站与网易云的鉴权、音频格式、CDN 策略完全不同）。

**核心发现：B 站大部分数据 API 仅需 Cookie，不需要 WBI 签名。** 搭配官方嵌入播放器可完全避开 WBI/DASH/CDN 这些复杂问题。

### 推荐方案

| 方案 | 推荐度 | 复杂度 | 稳定性 | 功能完整度 |
|------|--------|--------|--------|----------|
| **A：Bilibili Lite（嵌入播放器 + API）** | ⭐⭐⭐⭐⭐ | 低 | 高 | 高 |
| B：Bilibili Audio（纯音频提取） | ⭐⭐ | 极高 | 低 | 中 |
| C：Bilibili Mini（迷你浏览器） | ⭐⭐⭐ | 中 | 中 | 极高 |

---

## 2. 三种方案详解

### 方案 A：Bilibili Lite（推荐）

**核心思路**：播放交给 B 站官方嵌入播放器（iframe），数据通过 Cookie API 获取。

```
┌──────────────────────────────────────────────────────┐
│  扩展新标签页 / 独立面板                              │
│  ├── 左侧：视频列表面板（收藏/历史/稍后看/热门/搜索） │
│  └── 右侧：iframe 嵌入 B 站官方播放器                │
│            player.bilibili.com/player.html?bvid=xxx  │
└────────┬─────────────────────────────────────────────┘
         │
   Service Worker (background.js)
   ├── chrome.cookies 读取 SESSDATA
   ├── fetch 调用 B 站 REST API（大多不需 WBI）
   └── 返回列表数据给前端
```

**技术要点**：
- **播放器**：`//player.bilibili.com/player.html?bvid=BVxxx&autoplay=1&danmaku=0`
- **不需要 WBI 签名的 API**：占用户所需功能的 90%
- **不需要任何鉴权的 API**：热门、排行、搜索建议

**优势**：
- 无需实现 WBI 签名算法
- 无需处理 DASH 音频流解析
- 无需 declarativeNetRequest CDN Referer 注入
- 播放器由 B 站自己维护，极稳定
- 开发周期短（预计 3-5 天）

**劣势**：
- iframe 播放器包含视频画面（不是纯音频）
- iframe 内播放器的精细控制受限（暂停/进度/音量需要 postMessage）
- 需要显示空间来放置 iframe 播放器

**Demo**：`test/demos/bilibili-demo-1-lite-panel.html`

---

### 方案 B：Bilibili Audio

**核心思路**：与网易云方案同构，通过 API 提取音频流在 Offscreen Document 中播放。

```
chrome.cookies → Service Worker
├── /x/web-interface/nav → 获取 WBI 密钥
├── WBI 签名（MD5 mixin_key）
├── /x/player/wbi/playurl → 获取 DASH 音频轨
├── 解析 dash.audio[0].baseUrl
└── Offscreen Document <audio src="..."> 播放
    └── declarativeNetRequest 注入 Referer: bilibili.com
```

**技术要点**：
- 完整实现 WBI 签名算法（64 位 mixin 表 + MD5）
- DASH 音频轨解析（从 playurl 响应中提取 `dash.audio` 数组）
- CDN 防盗链处理（`declarativeNetRequest` 对 `*.bilivideo.*` 注入 Referer）
- buvid 设备指纹维护

**优势**：
- 纯音频体验，资源占用低
- 可完全复用现有网易云面板 UI
- 无需显示视频画面

**劣势**：
- WBI 签名算法随 B 站版本更新可能变化
- DASH 处理增加了技术复杂度
- CDN 403 风险（Referer 规则可能变化）
- -352 风控风险（buvid 不完整时）
- 开发周期长（预计 7-10 天），维护成本高

**Demo**：`test/demos/bilibili-demo-2-audio-extract.html`

---

### 方案 C：Bilibili Mini

**核心思路**：在扩展独立页面中嵌入完整 B 站网页，通过 Content Script 增强控制。

```
┌────────────────────────────────────────────┐
│  扩展独立页面（bilibili.html）             │
│  ├── 顶部：导航栏（后退/前进/URL/快捷按钮）│
│  ├── 主体：iframe 加载 www.bilibili.com    │
│  ├── 浮动：底部播放控制条                   │
│  └── 侧栏：收藏/历史/稍后看列表（可收起）  │
└────────────────────────────────────────────┘
```

**技术要点**：
- 完整嵌入 `www.bilibili.com`（需要处理 CSP/X-Frame-Options）
- Content Script 注入控制层
- 跨 iframe 通信（postMessage）

**优势**：
- 功能最完整，100% B 站体验
- 用户可以浏览任意 B 站内容
- 所有交互由 B 站原生处理

**劣势**：
- **CSP 限制**：B 站可能设置 X-Frame-Options 阻止 iframe 嵌入
- 资源占用大（等于开了一个完整 B 站标签页）
- Content Script 注入控制脆弱（DOM 变更即失效）
- 可能需要 `webRequestBlocking` 等高权限

**Demo**：`test/demos/bilibili-demo-3-mini-browser.html`

---

## 3. API 能力矩阵

### 不需要 WBI 签名（仅需 Cookie SESSDATA）

| API | 用途 | 用户需求覆盖 |
|-----|------|-------------|
| `/x/web-interface/nav` | 登录状态检测 + 用户信息 | ✅ 登录检测 |
| `/x/web-interface/history/cursor` | 观看历史记录 | ✅ 观看历史 |
| `/x/v2/history/toview` | 稍后再看列表 | ✅ 稍后观看 |
| `/x/v3/fav/resource/list` | 收藏夹内容 | ✅ 收藏列表 |
| `/x/v2/history/toview/add` | 添加稍后再看 | ✅ 稍后观看操作 |

### 不需要任何鉴权（公开 API）

| API | 用途 | 用户需求覆盖 |
|-----|------|-------------|
| `/x/web-interface/popular` | 热门视频 | ✅ 热搜榜单 |
| `/x/web-interface/ranking/v2` | 全站排行榜 | ✅ 热搜榜单 |
| `s.search.bilibili.com/main/suggest` | 搜索建议 | ✅ 搜索辅助 |
| `s.search.bilibili.com/main/hotword` | 热搜词 | ✅ 热搜榜单 |
| `app.bilibili.com/x/v2/search/trending/ranking` | 热搜排行（手机端） | ✅ 热搜榜单 |

### 需要 WBI 签名

| API | 用途 | 备注 |
|-----|------|------|
| `/x/web-interface/wbi/search/all/v2` | 综合搜索 | 方案 A 可用 suggest 替代 |
| `/x/player/wbi/playurl` | 播放地址 | 方案 A 不需要（iframe 处理） |
| `/x/web-interface/wbi/search/square` | 热搜广场 | 可用手机端 API 替代 |

### 需求覆盖统计

| 用户需求 | 方案 A | 方案 B | 方案 C |
|---------|--------|--------|--------|
| 播放 | ✅ iframe embed | ✅ Offscreen audio | ✅ 原生页面 |
| 收藏列表 | ✅ Cookie API | ✅ Cookie API | ✅ 原生页面 |
| 稍后观看 | ✅ Cookie API | ✅ Cookie API | ✅ 原生页面 |
| 观看历史 | ✅ Cookie API | ✅ Cookie API | ✅ 原生页面 |
| 热搜榜单 | ✅ 公开 API | ✅ 公开 API | ✅ 原生页面 |
| 搜索 | ✅ Suggest API | ⚠️ 需 WBI | ✅ 原生页面 |

---

## 4. B 站官方嵌入播放器

### 基本用法

```html
<iframe src="//player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=1&danmaku=0"
        scrolling="no" frameborder="0" allowfullscreen></iframe>
```

### 支持参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `bvid` | string | 视频 BV 号（必须） |
| `aid` | number | 视频 AV 号（与 bvid 二选一） |
| `p` | number | 分P集数（默认 1） |
| `autoplay` | boolean | 自动播放 |
| `muted` | boolean | 静音 |
| `danmaku` | boolean | 弹幕开关（false 关闭） |
| `t` | number | 起始时间（秒） |
| `poster` | boolean | 封面图 |

### 简洁版播放器

```
bilibili.com/blackboard/html5mobileplayer.html?bvid=xxx&hideCoverInfo=1&danmaku=0
```

---

## 5. Cookie 依赖

| Cookie | 作用 | 方案 A 是否需要 | 方案 B 是否需要 |
|--------|------|----------------|----------------|
| SESSDATA | 登录会话 | ✅ 数据 API | ✅ 全部 API |
| bili_jct | CSRF token | ⚠️ 仅写操作 | ⚠️ 仅写操作 |
| DedeUserID | 用户 ID | 可选 | 建议 |
| buvid3/buvid4 | 设备指纹 | 不需要 | ✅ 避免 -352 |

---

## 6. 风险评估

| 风险 | 方案 A 影响 | 方案 B 影响 | 方案 C 影响 |
|------|-----------|-----------|-----------|
| WBI 算法更新 | ❌ 不受影响 | 🔴 高：功能失效 | ❌ 不受影响 |
| API 端点变更 | 🟡 中：列表数据 | 🔴 高：播放失效 | ❌ 不受影响 |
| CDN 防盗链变化 | ❌ 不受影响 | 🔴 高：音频 403 | ❌ 不受影响 |
| X-Frame-Options | ❌ embed 播放器允许 | ❌ 不适用 | 🔴 高：页面无法加载 |
| 版权风控 | 🟢 低：官方播放器 | 🟡 中：音频直链 | 🟢 低：原生页面 |
| Chrome 商店审核 | 🟢 低 | 🟡 中 | 🟡 中 |

---

## 7. 实施建议

### 推荐路径：方案 A（Bilibili Lite）

**Phase 1：PoC 验证（1-2 天）**
1. 验证 `player.bilibili.com` iframe 在扩展页面中的兼容性
2. 通过 `chrome.cookies` 读取 SESSDATA
3. 调用 `/x/web-interface/nav` 验证登录状态
4. 调用 `/x/v2/history/toview` 获取稍后再看列表

**Phase 2：MVP 功能（3-5 天）**
- 收藏夹列表 + iframe 播放
- 观看历史 + 稍后再看
- 热门视频 + 排行榜
- 搜索建议

**Phase 3：增强（2-3 天）**
- 播放队列管理
- 热搜关键词监控集成
- UI 深度定制（适配项目风格）

### 保留方案 B 作为后备

如果 iframe 嵌入播放器在扩展环境中遇到不可解决的限制，可降级到方案 B。WBI 签名算法已有完整的 JS 参考实现。

---

## 8. 参考资源

- [bilibili-API-collect（镜像）](https://lxb007981.github.io/bilibili-API-collect/) — 野生 API 文档
- [B站嵌入播放器官方说明](https://player.bilibili.com/) — 参数文档
- [WBI 签名算法](https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/sign/wbi.html) — JS/Python 实现
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — 后台音频播放
- [declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest) — 请求头修改
- [BiliChrome](https://github.com/ez118/bilichrome) — 参考实现（已停维）

### Demo 文件

- `test/demos/bilibili-demo-1-lite-panel.html` — 方案 A Demo（推荐）
- `test/demos/bilibili-demo-2-audio-extract.html` — 方案 B Demo
- `test/demos/bilibili-demo-3-mini-browser.html` — 方案 C Demo
