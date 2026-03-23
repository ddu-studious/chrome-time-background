# PRD：音乐播放器增强 v3.5.0

**产品名称**: 中国风景时钟  
**版本**: v2.4.1 ~ v3.5.0  
**作者**: AI Agent  
**日期**: 2026-03-20  
**状态**: Phase 13 v3.5.0 ✅ 已完成  
**依赖**: Phase 12 v3.4.0 性能省电模式

---

## 一、产品概述

### 1.1 背景

v2.4.0-alpha 已实现基础音乐控制（播放/暂停/切歌/歌曲信息），但存在以下痛点：

1. **使用门槛高**：用户必须手动打开网易云/酷狗网页才能使用
2. **功能不足**：无进度控制、音量调节、歌词展示
3. **UI 待升级**：现有 pill 样式较为单调，用户选择了灵动岛浮窗方案
4. **DOM 操控不稳定**：歌单列表/搜索/歌词等功能依赖 DOM 选择器，平台前端变更即失效（v2.7.x 暴露的核心问题）

### 1.2 目标

- 降低使用门槛：一键连接音乐平台（隐藏标签页）
- 补全核心体验：进度条、音量、歌词
- UI 升级：采用灵动岛浮窗风格
- **v2.8.0 新目标**：通过 Open API 数据通道解决 DOM 操控不稳定问题
- **v2.9.0 新目标**：面板 UI 全面重设计 + API 歌词/推荐 + 内置独立播放器 + 播放模式切换

### 1.3 成功指标

| 指标 | 目标 |
|------|------|
| 一键连接使用率 | > 50% 用户使用隐藏标签页连接 |
| 进度条/音量交互 | > 60% 控制器用户使用过拖拽 |
| 歌词展示满意度 | 无明显延迟（< 1s） |
| **歌单加载成功率（v2.8.0）** | **> 95%（API 驱动）** |
| **搜索结果返回率（v2.8.0）** | **> 98%（API 驱动）** |

---

## 二、功能需求

### 2.1 UI 重构：灵动岛浮窗

#### 2.1.1 设计方案

采用 Demo 2（灵动岛浮窗）风格，关键设计要素：

```
默认状态（紧凑）:
┌──────────────────────────────────┐
│ [封面] 🎵🎵🎵🎵  歌名 - 歌手  ⏮ ⏯ ⏭ │
└──────────────────────────────────┘

Hover 展开状态:
┌──────────────────────────────────────────┐
│ [封面]  歌名              ⏮  ⏯  ⏭  🔊 │
│         歌手                        ⊗   │
│  ━━━━━━━━━━━━○━━━━━━━━ 2:35 / 4:12     │
│  ♪ 我落泪情绪零碎                        │
│  ☰ 播放列表   🎵 网易云          ✕ 断开 │
└──────────────────────────────────────────┘
```

| 属性 | 值 |
|------|------|
| 圆角 | 28px |
| 背景 | rgba(10, 10, 10, 0.75) |
| 磨砂 | blur(40px) saturate(180%) |
| 阴影 | 0 8px 32px rgba(0,0,0,0.35) |
| 默认高度 | 52px |
| 展开高度 | ~120px |
| 过渡动画 | cubic-bezier(0.4, 0, 0.2, 1) 0.5s |
| 入场动画 | scale(0.6→1) pop effect |

#### 2.1.2 交互细节

- **未检测到音乐**：不显示（与现有行为一致）
- **紧凑状态**：封面 + 音波动画 + 播放控制
- **Hover 展开**：显示完整歌曲信息 + 进度条 + 歌词行
- **点击展开/收起**：在移动端或需要固定展开时
- **断开按钮**：关闭音乐标签，回到平台选择界面（v2.7.2+）

### 2.2 进度条控制（P1）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 进度显示 | 实时显示播放进度条 | P1 |
| 时间标签 | 显示 当前时间 / 总时长 | P1 |
| 拖拽定位 | 拖动进度条跳转播放位置 | P1 |
| 点击定位 | 点击进度条任意位置跳转 | P1 |

### 2.3 音量控制（P1）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 音量滑块 | 垂直滑块控制音量（writing-mode 实现） | P1 |
| 音量图标 | 根据音量显示不同图标 | P1 |
| 静音切换 | 点击图标切换静音 | P1 |
| 音量记忆 | 记住用户上次设置的音量 | P2 |

### 2.4 歌词展示（P1）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 当前歌词行 | 在控制器底部展示当前播放歌词 | P1 |
| 歌词切换动画 | 淡入淡出过渡 | P1 |
| 歌词开关 | 用户可选择是否展示歌词 | P1 |
| **API 歌词获取** | **通过 /lyric API 获取完整歌词（v2.8.0）** | **P1** |

### 2.5 隐藏标签页连接（P1）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 平台选择 | 未连接时显示平台选择按钮 | P0 |
| 后台打开 | 点击后在后台创建音乐标签页 | P0 |
| 标签分组 | 将音乐标签折叠到"🎵 Music"分组 | P1 |
| 连接状态 | 显示已连接的平台及状态 | P1 |
| 断开连接 | 关闭隐藏的音乐标签页（v2.7.2+） | P1 |

### 2.6 歌单与播放列表（P2）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 播放列表 | 展示当前队列中的歌曲列表 | P2 |
| 歌单切换 | 支持切换"我喜欢的"等歌单 | P2 |
| 推荐歌曲 | 展示平台推荐歌曲列表 | P3 |
| 搜索歌曲 | 在控制器中搜索并播放 | P3 |

### 2.7 API 数据通道（v2.8.0 新增）

| 功能 | 描述 | 优先级 |
|------|------|--------|
| API 服务配置 | 用户配置自部署 NeteaseCloudMusicApi 地址 | P0 |
| 二维码登录 | 扫码登录网易云账号，获取 cookie | P0 |
| 歌单列表（API） | 通过 /user/playlist 获取完整歌单列表 | P0 |
| 歌单详情（API） | 通过 /playlist/track/all 获取歌单内所有歌曲 | P0 |
| 搜索（API） | 通过 /search 搜索歌曲 | P1 |
| 歌词（API） | 通过 /lyric 获取完整同步歌词 | P1 |
| 推荐歌曲（API） | 通过 /recommend/songs 获取每日推荐 | P2 |
| 音乐 URL（API） | 通过 /song/url 获取播放地址 | P2 |

---

## 三、通信协议升级

### 3.1 双通道架构（v2.8.0）

```
┌─────────────────────────────────────────────────────┐
│  MusicController (New Tab)                          │
│  ├── 控制通道 (DOM): playPause / prev / next / seek │
│  ├── 数据通道 (API): 歌单 / 搜索 / 歌词 / 推荐     │
│  └── 播放通道: 优先 DOM audio → 降级 API song/url   │
└────────┬──────────────────────┬──────────────────────┘
         │                      │
   Content Script          Background.js
   (DOM 操控音乐网页)     (fetch → API Server)
                                │
                    NeteaseCloudMusicApi Enhanced
                    (Vercel / Railway / 自建)
```

### 3.2 状态数据

```javascript
{
    platform: 'netease' | 'kugou',
    isPlaying: boolean,
    title: string,
    artist: string,
    cover: string,
    currentTime: number,
    duration: number,
    volume: number,
    lyricLine: string,
    playlist: [{ title, artist, isActive }]
}
```

### 3.3 命令列表

| 命令 | 参数 | 说明 | 通道 |
|------|------|------|------|
| `seekTo` | `value: number` | 跳转到指定时间（秒） | DOM |
| `setVolume` | `value: number` | 设置音量 0-1 | DOM |
| `getPlaylist` | - | 获取当前播放列表 | DOM → API |
| `getUserPlaylists` | - | 获取用户歌单列表 | DOM → API |
| `switchPlaylist` | `value: string` | 切换到指定歌单 | DOM → API |
| `searchSong` | `value: string` | 搜索歌曲 | DOM → API |
| `getRecommended` | - | 获取推荐歌曲 | DOM → API |

---

## 四、版本规划

### Phase 2：v2.4.1 ✅

| 功能 | 优先级 | 状态 |
|------|--------|------|
| UI 重构为灵动岛风格 | 高 | ✅ 已完成 |
| 进度条显示与拖拽 | 高 | ✅ v2.4.1 修复 |
| 音量控制滑块 | 高 | ✅ v2.4.1 修复 |
| 歌词行展示 | 中 | ⏸️ 平台限制 |
| Content Script 协议扩展 | 高 | ✅ v2.4.1 重构 |
| 隐藏标签页连接 | 高 | ✅ 已完成 |

### Phase 3：v2.5.0 ✅

| 功能 | 优先级 | 状态 |
|------|--------|------|
| Markdown 语法高亮 | 中 | ✅ 已完成 |
| Markdown Mermaid | 低 | ✅ 已完成 |
| 任务详情 Markdown 渲染 | 中 | ✅ 已完成 |

### Phase 4：v2.6.0 ✅

| 功能 | 优先级 | 状态 |
|------|--------|------|
| 播放列表展示 | 中 | ✅ 已完成 |
| 歌曲切换 | 中 | ✅ 已完成 |

### Phase 5：v2.7.0 → v2.7.3 ✅

| 功能 | 优先级 | 状态 |
|------|--------|------|
| 歌单切换 | 中 | ✅ 已完成（用户歌单侧栏提取 + Tab面板切换 + 登录检测引导） |
| 推荐歌曲 | 低 | ✅ 已完成（平台推荐内容提取 + 登录态检测 + 引导登录） |
| 搜索歌曲 | 低 | ✅ 已完成（搜索输入 → DOM交互 → 结果提取 → 播放） |
| 扩展刷新数据恢复 | 高 | ✅ v2.7.1 修复 |
| 播放列表空列表修复 | 高 | ✅ v2.7.1 修复 |
| 专辑封面显示修复 | 中 | ✅ v2.7.1 修复 |
| DOM 选择器健壮性 | 中 | ✅ v2.7.1 重构 |
| 音量滑块遮挡修复 | 高 | ✅ v2.7.2 修复（z-index 层级修正 + overflow:visible） |
| 断开连接/关闭音乐 | 高 | ✅ v2.7.2 新增 |
| 歌单选择器增强 | 中 | ✅ v2.7.2 增强 |
| 音量滑块拖拽修复 | 高 | ✅ v2.7.3 修复（writing-mode 垂直 range + 正确的触控区域） |
| 歌单切换后列表加载 | 高 | ✅ v2.7.3 修复（切换后自动轮询 + Tab 切换 + 重试机制） |

### Phase 6：v2.8.0 ✅ — API 数据层（Cookie 直连，零部署）

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **浏览器 Cookie 共享**（零配置） | 高 | ✅ 已完成（chrome.cookies 读取 music.163.com Cookie，无需扫码登录） |
| **歌单列表（API 驱动）** | 高 | ✅ 已完成（/api/user/playlist + /api/nuser/account/get 获取完整歌单） |
| **歌单歌曲加载（API）** | 高 | ✅ 已完成（/api/v6/playlist/detail + /api/v3/song/detail 批量加载） |
| **搜索歌曲（API 驱动）** | 高 | ✅ 已完成（/api/search/get/web 替代 DOM 交互链） |
| 音量拖拽生效修复 | 高 | ✅ 已完成（轮询冻结机制 + 百分比显示 + change 后 5s 保护期 → v2.9.1 三层穿透策略升级） |
| 歌词获取（API 驱动） | 中 | ✅ Phase 7 已完成（/api/song/lyric） |
| 推荐歌曲（API 驱动） | 中 | ✅ Phase 7 已完成（/api/v6/recommend/songs） |

### Phase 6.5：v2.8.1 ✅ — iframe 兼容性修复

| 功能 | 优先级 | 状态 |
|------|--------|------|
| 音量控制 iframe 穿透 | 高 | ✅ 已完成（querySafeAllDocs 双文档查询 → v2.9.1 三层策略：audio+bar+localStorage） |
| 播放列表 iframe 抓取 | 高 | ✅ 已完成（findPlaylistContainer 支持主文档 + g_iframe 双范围搜索） |
| 进度条/音量条 iframe 查询 | 中 | ✅ 已完成（seekViaProgressBar / setVolumeViaBar 跨文档查找） |

### Phase 7：v2.9.0 ✅ — 面板 UI 重设计 + 歌词/推荐 API + 独立播放器 + 播放模式

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **面板 UI 全面重设计** | 高 | ✅ 已完成（采用 Minimal Card 方案：极简紧凑 + 滑动 Tab + 紫色主题） |
| **歌词获取（API /lyric）** | 高 | ✅ 已完成（/api/song/lyric 获取 LRC 同步歌词 + 翻译，自动搜索匹配 songId） |
| **推荐歌曲（API /recommend/songs）** | 中 | ✅ 已完成（/api/v6/recommend/songs 每日推荐 + /api/playlist/detail 热门歌曲降级） |
| **音乐 URL 获取（API /song/url）** | 高 | ✅ 已完成（/api/song/url/v1 获取可播放音频地址） |
| **内置 Audio 播放器（脱离网页标签）** | 高 | ✅ 已完成（new tab 页面内 audio 元素，不依赖音乐网页 tab） |
| **播放模式切换（单曲循环/随机/顺序）** | 中 | ✅ 已完成（顺序/列表循环/单曲循环/随机，状态持久化） |
| 歌单详情页 UI（封面+播放/随机按钮） | 中 | ✅ 已完成（API 批量加载歌单歌曲 + 内置播放器直接播放） |
| 搜索增强（热门搜索/历史记录） | 低 | ✅ 已完成（搜索历史持久化 + 快捷标签） |
| 更多平台（QQ音乐/Spotify） | 低 | 🔄 远期规划 |

### Phase 7.1：v2.9.1 ✅ — 音量穿透修复 + 歌单详情页重构

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **音量控制穿透修复** | 高 | ✅ 已完成（三层策略：audio 元素 + 进度条拖拽模拟 + localStorage 写入） |
| **歌单详情页重构** | 高 | ✅ 已完成（apiLoadingQueue 标志防覆盖 + 详情页头部 UI：封面/名称/播放全部/随机按钮 + 返回歌单列表） |
| **歌单点击流程修复** | 高 | ✅ 已完成（_switchTab 增加 skipLoad 参数，API 加载时跳过 DOM 刷新） |
| **音量 DOM 交互增强** | 中 | ✅ 已完成（mousedown→mousemove→mouseup 完整拖拽事件链替代单击） |
| **全量 audio 元素搜索** | 中 | ✅ 已完成（findAllAudioElements 搜索主文档 + g_iframe 中所有 audio/video） |

### Phase 8：v3.0.0 ✅ — 独立播放器 + 温情提示 + 系统监控

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **Offscreen Document 音频引擎** | 高 | ✅ 已完成（offscreen.html 独立音频播放，关闭标签页不停止音乐） |
| **纯 API 模式（去除 Content Script 依赖）** | 高 | ✅ 已完成（自动检测 Cookie 登录→直接调用网易云 API→Offscreen 播放） |
| **一键独立播放** | 高 | ✅ 已完成（连接面板新增"独立播放"按钮，Cookie 存在即可用） |
| **MediaSession 系统媒体键集成** | 中 | ✅ 已完成（键盘媒体键/macOS 控制中心可控制播放） |
| **温情提示内置数据库** | 中 | ✅ 已完成（50+ 条名言/方法论/笑话/寓言/健康小贴士） |
| **温情提示推送系统** | 中 | ✅ 已完成（每2小时推送 + 每日摘要/过期提醒附加温情内容） |
| **温情提示浮动条** | 中 | ✅ 已完成（页面底部浮动显示 + 一键换新） |
| **系统资源监控 API** | 中 | ✅ 已完成（chrome.system.cpu/memory/storage 数据采集） |
| **系统资源可视化 UI** | 中 | ✅ 已完成（右下角浮动面板 + CPU/内存/磁盘进度条 + CPU 折线图） |
| **系统监控数据历史** | 低 | ✅ 已完成（每分钟采集，保留60个采样点） |

### Phase 9：v3.1.0 ✅ — 扩展活动监控 + 音乐未知歌曲引导 UX

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **扩展事件日志系统** | 高 | ✅ 已完成（background.js 统一 logExtEvent，覆盖音乐/网络/任务/闹钟/存储/系统 6 大类） |
| **活动时间线 UI** | 高 | ✅ 已完成（监控面板新增"扩展活动"区域：时间轴 + 分类筛选 + 耗时/成功状态标签） |
| **网易云 API 调用追踪** | 高 | ✅ 已完成（neteaseApiCall 记录 endpoint/耗时/成功失败/错误码） |
| **闹钟事件追踪** | 中 | ✅ 已完成（所有 alarm 触发均记录类别和执行耗时） |
| **存储写入追踪** | 中 | ✅ 已完成（chrome.storage.onChanged 监听，记录 key 和 memos 条数变化） |
| **音乐检测/登录追踪** | 中 | ✅ 已完成（detect-tabs、login-check、offscreen-play、track-ended 全链路记录） |
| **"未知歌曲"引导面板** | 高 | ✅ 已完成（4 种状态引导：no-cookie / api-error / no-metadata / default，可操作按钮） |
| **歌曲元数据重试** | 中 | ✅ 已完成（_retryFetchMetadata 通过 songId 重新请求 song/detail 补齐 title/artist/cover） |
| **登录失败诊断** | 中 | ✅ 已完成（login-check 返回 reason 字段，引导面板根据原因显示对应提示和操作） |
| **监控面板图标升级** | 低 | ✅ 已完成（从 fa-microchip 改为 fa-heartbeat，标题改为"扩展监控"） |

### Phase 10: v3.2.1 — 监控深化 + 布局重构 + VIP 播放修复

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **扩展自身内存监控** | 高 | ✅ 已完成（performance.memory 获取 JS 堆内存，显示扩展占用） |
| **事件描述可读化** | 高 | ✅ 已完成（EVT_LABELS 映射所有事件为中文描述，context 格式化） |
| **统一底部工具栏 (Dock Bar)** | 高 | ✅ 已完成（胶囊底座 + 分隔线统一视觉；v3.2.1 细化 hover/active 反馈） |
| **独立播放模式队列同步修复** | 中 | ✅ 已完成（queue tab 不再触发 DOM getPlaylist 清空内部队列；单曲触发自动填充队列） |
| **VIP 歌曲播放修复** | 高 | ✅ 已完成（多端点降级策略：enhance/player/url/v1 → enhance/player/url → song/url/v1） |
| **neteaseApiCall POST 支持** | 中 | ✅ 已完成（API 调用层支持 GET/POST 双模式，为加密接口预留） |
| **Offscreen error 可读化** | 中 | ✅ 已完成（MediaError.code 映射中文描述，code=4 自动切下一首） |
| **歌曲点击 loading 反馈** | 中 | ✅ 已完成（点击后 spinner 动画，VIP 限制友好 toast 提示） |
| **元数据路径修复** | 高 | ✅ 已完成（_retryFetchMetadata 修正 resp.data.songs 数据路径） |
| **元数据同步到 Offscreen** | 中 | ✅ 已完成（_syncMetaToOffscreen + offscreen_command 全参数透传） |

### Phase 11: v3.3.0 ✅ — Dock Bar 统一 + 空间优化

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **Dock Bar 4 按钮统一** | 高 | ✅ 已完成（监控 + 知识墙 + 设置 + 任务，全部纳入 dock-bar） |
| **知识墙按钮整合** | 高 | ✅ 已完成（kw-trigger 不再独立 appendChild，改用 dock-bar 内 kw-dock-btn） |
| **设置按钮整合** | 高 | ✅ 已完成（settings-button 从右上角独立浮动迁入 dock-bar，统一视觉） |
| **底部文字避让** | 中 | ✅ 已完成（keyboard-hint 上移至 dock 上方，避免被 dock-bar 覆盖） |
| **今日推荐阅读默认收起** | 中 | ✅ 已完成（initReadingRecommendation 加载后自动 collapsed，点击展开） |
| **24 小时温度趋势默认收起** | 中 | ✅ 已完成（hourly-chart-wrapper 默认 collapsed，展开时才渲染 Canvas） |
| **温度图表懒渲染** | 低 | ✅ 已完成（renderHourlyChart 收起状态跳过 Canvas 绑定，展开 toggle 触发渲染） |

### Phase 12: v3.4.0 ✅ — 性能省电模式 + 网易云 API 修复 + 酷狗调研

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **设置面板"性能与省电"分组** | 高 | ✅ 已完成（8 项功能开关 + 说明提示，低配用户可逐项关闭） |
| **模块条件初始化（main.js）** | 高 | ✅ 已完成（读取 settings 开关，禁用模块不初始化/不创建 DOM） |
| **后台 alarm 受开关控制** | 高 | ✅ 已完成（system-monitor/keyword-scan/warm-tip 按开关创建） |
| **系统监控默认关闭 + 采集间隔可调** | 高 | ✅ 已完成（默认关闭，间隔从 1min→5min，减少 80% 后台采样） |
| **关键字扫描默认关闭** | 中 | ✅ 已完成（避免低配电脑不必要的高频网络请求） |
| **推荐接口修复** | 高 | ✅ 已完成（`/api/v6/recommend/songs` → `/api/v3/discovery/recommend/songs`） |
| **业务 code 校验增强** | 高 | ✅ 已完成（`_neteaseApi` 增加 JSON body.code !== 200 检测） |
| **热门歌曲降级兼容** | 中 | ✅ 已完成（兼容 `result.playlist` 和 `playlist` 两种响应结构） |
| **酷狗音乐集成调研** | 低 | ✅ 已完成（调研报告：谨慎推荐，web.kugou.com 已停服，独立播放需签名） |
| **网易云 API 现状调研** | 中 | ✅ 已完成（接口清单更新 + 404 根因分析 + 适配方案） |
| **资源占用评估报告 v2.0** | 中 | ✅ 已完成（新增省电模式评估 + 低配推荐配置表） |

### Phase 13: v3.5.0 ✅ — 音乐架构精简 + 设置独立页面 + 哔哩哔哩调研

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **移除酷狗 Web 音乐方案** | 高 | ✅ 已完成（删除 content_scripts 配置、酷狗 host_permissions、背景消息处理） |
| **移除网易云 Web 模式** | 高 | ✅ 已完成（content script 注入移除，仅保留 Offscreen Document 独立播放） |
| **music-controller.js 精简** | 高 | ✅ 已完成（移除 _sendCommand/_detectMusicTabs 等 web 模式方法，连接 UI 简化为单按钮） |
| **background.js 精简** | 高 | ✅ 已完成（移除 reinjectMusicContentScripts、web 模式消息监听、标签页关闭监听） |
| **设置侧边栏 → 独立页面** | 高 | ✅ 已完成（settings.html 全新独立设置页，侧栏导航 + 卡片表单 + 现代化 UI） |
| **使用说明书编写** | 高 | ✅ 已完成（5 大功能模块详细说明 + 快捷键指南 + 3 步快速开始） |
| **关于页面** | 中 | ✅ 已完成（版本信息 + 项目描述 + 功能亮点列表） |
| **哔哩哔哩音频集成调研** | 中 | ✅ 已完成（Offscreen Document 方案调研：WBI 签名 + declarativeNetRequest + DASH） |
| **哔哩哔哩 PRD 文档** | 中 | ✅ 已完成（`docs/requirements/PRD-哔哩哔哩音频集成.md`） |
| **版本号升级 v3.5.0** | 低 | ✅ 已完成（manifest.json version → 3.5.0） |

### Phase 14: v3.6.0 🔧 — 哔哩哔哩视频/课程集成

| 功能 | 优先级 | 状态 |
|------|--------|------|
| **B站 Cookie API 代理** | 高 | ✅ 已完成（background.js 新增 bilibiliApiCall + 白名单端点校验） |
| **bilibili-controller.js** | 高 | ✅ 已完成（独立模块：6分类加载/搜索/嵌入播放/侧栏列表/课程支持） |
| **沉浸式面板 UI + CSS** | 高 | ✅ 已完成（方案C暗色风格：全屏面板 + 顶部导航 + 可收起侧栏） |
| **Dock Bar 入口** | 中 | ✅ 已完成（B站按钮加入 dock-bar） |
| **设置项 enableBilibili** | 中 | ✅ 已完成（settings.js + settings-page.js + settings.html 性能开关） |
| **manifest.json 权限** | 高 | ✅ 已完成（host_permissions 增加 bilibili.com/api.bilibili.com/s.search.bilibili.com） |
| **课程分类支持** | 中 | ✅ 已完成（/pugv/app/v2/mine/seasons API + 已购/免费/付费标识 + 学习进度条） |
| **版本号升级 v3.6.0** | 低 | ✅ 已完成 |

---

## 五、风险与应对

| 风险 | 影响 | 等级 | 应对 |
|------|------|------|------|
| ~~音乐网页 DOM 变更~~ | ~~歌词/进度获取失败~~ | ~~中~~ | ~~v3.5.0 已移除 web 模式，风险消除~~ |
| ~~TabGroup API 兼容性~~ | ~~分组折叠失败~~ | ~~低~~ | ~~v3.5.0 已移除隐藏标签页方案~~ |
| **Cookie 直连版权灰色地带** | **法律风险** | **低** | **仅用户自有账号 Cookie + 不缓存/分发音频 + 无第三方服务** |
| **Cookie 过期** | **API 调用失败** | **低** | **引导重新登录网易云** |
| **网易云接口变更** | **API 数据获取失败** | **中** | **关注上游接口变更 + 多端点降级** |
| **Chrome 商店审核** | **上架被拒** | **低** | **cookies 权限已在 permissions 中声明 + host_permissions 限定域名** |
| 封面/歌词加载失败 | 显示异常 | 低 | URL 归一化 + 回退 + API 补充 |
| **事件日志存储膨胀** | **storage.local 空间占用** | **低** | **固定上限 200 条，自动 FIFO 淘汰** |
| **事件日志写入频率** | **高频写入影响性能** | **低** | **仅关键路径埋点，避免 timeupdate 等高频事件** |
| **Offscreen Document 30秒超时** | **暂停时音频引擎被回收** | **中** | **播放前 ensureOffscreen 自动恢复 + AUDIO_PLAYBACK reason** |
| **system.cpu/memory 权限审核** | **Chrome 商店可能质疑** | **低** | **permissions 声明 + 说明用于用户主动查看** |
| **温情提示频率过高** | **打扰用户** | **低** | **提供 warmTipEnabled 开关 + 合理的推送间隔** |
| **B站 API 接口变更** | **列表/播放URL失效** | **中** | **API 白名单限制 + Cookie 直连无 WBI 依赖** |
| **B站嵌入播放器 CSP 限制** | **iframe 加载被阻** | **低** | **player.bilibili.com 官方支持嵌入 + 扩展 CSP 豁免** |
| **B站 Cookie 过期** | **需登录接口返回空列表** | **低** | **检测登录状态 + 引导重新登录提示** |

---

## 六、附录

### 6.1 调研报告

- `docs/research/音乐播放器集成调研报告.md` — 初始调研
- `docs/research/音乐播放器高级功能调研报告.md` — 高级功能调研
- `docs/research/音乐播放器API集成调研报告.md` — API 方案调研（v2.8.0 依据）
- `docs/research/独立音乐播放器与体验增强调研报告.md` — v3.0.0 调研报告（Offscreen + 温情提示 + 系统监控）
- **`docs/research/kugou-music-chrome-extension-integration-research.md`** — v3.4.0 酷狗音乐集成调研
- **`docs/research/netease-api-v3.4.0-research.md`** — v3.4.0 网易云 API 接口现状与修复方案
- **`docs/research/扩展资源占用评估报告.md`** — v2.0 资源占用评估报告（含省电模式评估）
- **`docs/research/bilibili-offscreen-audio-research.md`** — v3.5.0 哔哩哔哩 Offscreen 音频集成调研
- **`docs/requirements/PRD-哔哩哔哩音频集成.md`** — v3.6.0 哔哩哔哩集成产品需求文档

### 6.2 API 参考

- [NeteaseCloudMusicApi Enhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) — 200+ 接口
- [API 文档](https://docs-neteasecloudmusicapi.focalors.ltd) — 接口说明
- [Chrome Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) — 后台音频播放
- [chrome.system.cpu](https://developer.chrome.com/docs/extensions/reference/api/system/cpu) — CPU 监控
- [chrome.system.memory](https://developer.chrome.com/docs/extensions/reference/api/system/memory) — 内存监控

### 6.3 UI 参考

- 灵动岛浮窗基础：`test/demos/music-player-demo-2-floating-island.html`
- **面板 UI 重设计 Demo（v2.9.0）**：
  - `test/demos/music-panel-demo-1-spotify-flow.html` — Spotify Flow（左右分栏 + 歌词联动）
  - `test/demos/music-panel-demo-2-apple-stack.html` — Apple Stack（大封面 Hero + 全屏歌词）
  - `test/demos/music-panel-demo-3-netease-drawer.html` — NetEase Drawer（抽屉式多级导航）
  - `test/demos/music-panel-demo-4-notion-tabs.html` — Notion Tabs（竖直侧栏图标 + 宽面板）
  - `test/demos/music-panel-demo-5-minimal-card.html` — Minimal Card（极简紧凑 + 滑动切换）

---

*文档版本: v3.6 | 最后更新: 2026-03-22 | Phase 14 v3.6.0 ✅ 已完成*
