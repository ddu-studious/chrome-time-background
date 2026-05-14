# 调研报告：独立音乐播放器与体验增强

**产品名称**: 中国风景时钟  
**版本**: v2.9.1 → v3.0.0 规划  
**作者**: AI Agent  
**日期**: 2026-03-18  
**状态**: 调研完成

---

## 一、调研背景

### 1.1 现状分析

当前 v2.9.1 音乐播放器已具备以下能力：
- **内置 Audio 播放器**：new tab 页面内 `<audio>` 元素可直接播放
- **Cookie 直连 API**：通过 `chrome.cookies` 读取 music.163.com Cookie，直接调用网易云 API
- **完整功能**：歌单、歌词、搜索、推荐、播放模式切换

### 1.2 用户痛点

| 痛点 | 描述 | 影响等级 |
|------|------|----------|
| 需要"连接"平台 | 必须先点击"连接网易云"按钮打开隐藏标签页 | 高 |
| 控制按钮失灵 | 部分控制命令依赖 Content Script DOM 操控 | 高 |
| 关闭标签页音乐停止 | 内置播放器在 new tab `<audio>` 元素中，关闭标签页即停止 | 高 |
| 缺少人性化关怀 | 任务提醒只有冷冰冰的截止日期，缺少温情互动 | 中 |
| 无法感知电脑状态 | 用户不清楚自己电脑的资源使用情况 | 低 |

---

## 二、独立音乐播放器方案

### 2.1 核心目标

**不依赖打开音乐网站，使用同一个 Cookie 数据，实现完全独立的播放器。**

### 2.2 技术方案比较

| 方案 | 描述 | 优势 | 劣势 | 可行性 |
|------|------|------|------|--------|
| **A. Offscreen Document** | 使用 Chrome Offscreen API 创建后台文档播放音频 | 关闭 tab 不影响；标准 API；后台持续播放 | 30秒无声自动关闭；每个扩展只能有1个 offscreen document | ★★★★★ |
| B. Service Worker + Fetch | 直接在 background.js fetch 音频流 | 完全后台 | SW 无 DOM/Audio API；MV3 限制严格 | ★★☆☆☆ |
| C. Side Panel | 使用 Chrome Side Panel API | 独立于标签页 | 需要用户手动打开侧面板 | ★★★☆☆ |
| D. 保持 New Tab Audio | 维持现有方案（`<audio>` 在 new tab 中） | 实现简单 | 关标签就停；用户体验差 | ★★☆☆☆ |

### 2.3 推荐方案：Offscreen Document + 纯 API 模式

```
┌─────────────────────────────────────────────────────────────────┐
│  New Tab Page (index.html)                                       │
│  ├── MusicController (UI 控制)                                   │
│  └── ↕ chrome.runtime.sendMessage                                │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│  Background Service Worker (background.js)                       │
│  ├── 网易云 API 代理（fetch + Cookie 注入）                        │
│  ├── Offscreen Document 生命周期管理                              │
│  └── 播放队列状态管理                                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│  Offscreen Document (offscreen.html)                             │
│  ├── <audio> 元素                                                │
│  ├── 播放/暂停/切歌/音量/进度 控制                                │
│  └── MediaSession API（系统媒体中心集成）                         │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────┐
│  网易云 API 服务器     │
│  music.163.com       │
│  (Cookie 认证直连)    │
└─────────────────────┘
```

### 2.4 Offscreen Document 技术要点

**来源**: Chrome for Developers 官方文档

1. **创建方式**
```javascript
await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing music via NetEase Cloud Music API'
});
```

2. **生命周期管理**
   - `AUDIO_PLAYBACK` 类型的 offscreen document 在 30 秒无音频输出后自动关闭
   - 需要在播放前确保 document 存在：`chrome.offscreen.hasDocument()`
   - 每个扩展同时只能有 1 个 offscreen document

3. **通信机制**
   - Background → Offscreen: `chrome.runtime.sendMessage()`
   - Offscreen → Background: `chrome.runtime.sendMessage()`
   - 与现有消息通信架构完全兼容

4. **MediaSession 集成**
   - 可在 offscreen document 中设置 `navigator.mediaSession` 的 metadata 和 action handlers
   - 用户可通过系统媒体中心（macOS 控制中心、键盘媒体键）控制播放

### 2.5 网易云 API 完整端点梳理

现有已验证可用的 API（通过 Cookie 直连 music.163.com）：

| 端点 | 用途 | 现有状态 | 备注 |
|------|------|----------|------|
| `/api/nuser/account/get` | 获取用户信息 | ✅ 可用 | 确认登录状态 |
| `/api/user/playlist` | 用户歌单列表 | ✅ 可用 | uid + limit + offset |
| `/api/v6/playlist/detail` | 歌单详情 | ✅ 可用 | id + n(trackCount) |
| `/api/v3/song/detail` | 歌曲详情（批量） | ✅ 可用 | c=JSON([{id}]) |
| `/api/song/url/v1` | 歌曲播放 URL | ✅ 可用 | id + level=standard |
| `/api/song/lyric` | 歌词 | ✅ 可用 | id + lv=1 + tv=1 |
| `/api/search/get/web` | 搜索 | ✅ 可用 | s + type=1 + limit + offset |
| `/api/v6/recommend/songs` | 每日推荐 | ✅ 可用 | 需登录 |
| `/api/playlist/detail` | 公开歌单详情 | ✅ 可用 | 热门歌曲降级 |

### 2.6 关键改进点

| 改进 | 当前 | 改进后 |
|------|------|--------|
| 启动方式 | 点击"连接网易云"→打开隐藏标签页 | 自动检测 Cookie→直接进入播放模式 |
| 播放引擎 | new tab 页面内 `<audio>` | Offscreen Document `<audio>` |
| 标签页关闭 | 音乐停止 | 音乐继续播放 |
| 控制命令 | 混合模式（DOM + API） | 纯 API 模式 |
| 系统集成 | 无 | MediaSession（媒体键控制） |
| Content Script | 需要注入到音乐网页 | 可选（向后兼容） |

### 2.7 GitHub 参考项目

| 项目 | 说明 | 参考价值 |
|------|------|----------|
| [sigoden/netease-music-crx](https://github.com/sigoden/netease-music-crx) | Chrome 扩展内置网易云播放器 | UI 设计、API 调用方式 |
| [ycace/netease-music-crx](https://github.com/ycace/netease-music-crx) | 支持 MediaSession | MediaSession 集成 |
| [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) | 200+ API 端点 | API 文档参考 |
| [2061360308/NeteaseCloudMusicApi_V8](https://github.com/2061360308/NeteaseCloudMusicApi_V8) | V8 引擎独立运行 | 加密算法参考 |

---

## 三、温情提示系统方案

### 3.1 内容类型

| 类型 | 描述 | 数据来源 | 频率 |
|------|------|----------|------|
| 名人名言 | 激励性格言 | 内置 100+ 条 + API 补充 | 每2小时轮换 |
| 方法论 | 时间管理/效率技巧 | 内置 50+ 条 | 每日1条 |
| 笑话/幽默 | 轻松段子 | 内置 50+ 条 + API 补充 | 随机穿插 |
| 小寓言 | 富含哲理的小故事 | 内置 30+ 条 | 每日1条 |
| 歌曲推荐 | 根据时间/心情推荐 | 网易云 API | 随提醒一起 |

### 3.2 推送时机

| 时机 | 内容 | 实现方式 |
|------|------|----------|
| 每日摘要提醒 | 附带一条名言 + 歌曲推荐 | 增强现有 daily-summary alarm |
| 过期任务提醒 | 附带一条鼓励方法论 | 增强现有 check-overdue alarm |
| 久坐提醒 | 附带健康小贴士 | 新增 health-reminder alarm |
| 空闲时段 | 推送笑话/寓言 | 新增 mood-booster alarm |
| 任务完成 | 赞美+歌曲推荐 | 完成任务后触发 |

### 3.3 免费 API 调研

| API | 端点 | 免费额度 | 内容质量 |
|-----|------|----------|----------|
| 夏柔API-名言 | `v.api.aa1.cn/api/api-wenan-mingrenmingyan` | 无限制 | 中等 |
| 夏柔API-笑话 | `v.api.aa1.cn/api/api-wenan-gaoxiao` | 无限制 | 中等 |
| 一言API | `v1.hitokoto.cn` | 无限制 | 高 |
| ALAPI-名言 | `v2.alapi.cn/api/mingyan` | 需token | 高 |

**推荐策略**：内置数据为主（离线可用），API 作为补充（联网时刷新缓存）。

### 3.4 歌曲推荐增强

利用现有 `/api/v6/recommend/songs` API，在温情提示中附带：
```
🎵 今日推荐：「晴天」- 周杰伦  [▶ 播放]
```

用户点击通知可直接播放。

---

## 四、系统资源可视化方案

### 4.1 可用的 Chrome API

| API | 权限 | 数据 | 可用性 |
|-----|------|------|--------|
| `chrome.system.cpu` | `system.cpu` | CPU 架构、核心数、使用率 | ✅ Chrome 91+ |
| `chrome.system.memory` | `system.memory` | 总内存、可用内存 | ✅ Chrome 91+ |
| `chrome.system.storage` | `system.storage` | 存储设备信息、容量 | ✅ Chrome 91+ |
| `navigator.deviceMemory` | 无需权限 | 设备 RAM（近似值） | ✅ Chrome 63+ |
| `navigator.getBattery()` | 无需权限 | 电池状态（需 offscreen） | ⚠️ 已废弃 |

### 4.2 UI 设计方案

在页面底部添加系统监控条（默认折叠，点击展开）：

```
┌────────────────────────────────────────────────────────────────────┐
│  💻 CPU 23% ████░░░░  │  🧠 内存 62% ██████░░  │  💾 磁盘 45% ████░░░░  │
└────────────────────────────────────────────────────────────────────┘
```

展开后显示详细信息：
- CPU：型号、核心数、各核心使用率折线图
- 内存：总量/已用/可用 环形图
- 磁盘：各分区使用率柱状图

### 4.3 性能考量

- 数据刷新频率：每 5 秒采集一次（通过 background.js 的 alarm）
- 历史数据：保留最近 60 个采样点（5分钟折线图）
- 渲染方式：Canvas 绘制图表，避免 DOM 操作开销

### 4.4 manifest.json 权限变更

```json
{
  "permissions": [
    "system.cpu",
    "system.memory",
    "system.storage",
    "offscreen"
  ]
}
```

---

## 五、版本规划

### v3.0.0 — 独立播放器 + 体验增强

| 功能模块 | 优先级 | 预估工作量 |
|----------|--------|-----------|
| Offscreen Document 音频引擎 | P0 | 高 |
| 纯 API 模式（去除 Content Script 依赖） | P0 | 中 |
| 自动登录检测（Cookie 存在即可用） | P0 | 低 |
| MediaSession 系统媒体键集成 | P1 | 中 |
| 温情提示内置数据库 | P1 | 中 |
| 温情提示推送系统 | P1 | 中 |
| 系统资源监控 API | P2 | 中 |
| 系统资源可视化 UI | P2 | 高 |
| 歌曲推荐与通知联动 | P2 | 低 |

### 实施顺序

```
Phase 1: Offscreen Document 音频引擎 + 纯 API 模式
Phase 2: 温情提示系统
Phase 3: 系统资源可视化
```

---

## 六、风险评估

| 风险 | 影响 | 等级 | 应对 |
|------|------|------|------|
| Offscreen Document 30秒超时 | 音乐暂停时 offscreen 被关闭 | 中 | 播放前重新创建；或播放无声音频保活 |
| 网易云 Cookie 过期 | API 调用失败 | 低 | 检测 401 响应→引导重新登录 |
| system.cpu/memory 权限审核 | Chrome 商店审核可能质疑 | 低 | 说明用于用户主动查看系统状态 |
| 内置数据版权 | 名言/笑话内容版权 | 低 | 使用公共领域内容 |
| 温情提示频率 | 过于频繁打扰用户 | 中 | 提供频率设置 + 一键静音 |

---

*调研完成日期: 2026-03-18*
