# PRD: v3.12.0 体验优化与缺陷修复

## 版本信息

| 项目 | 内容 |
|------|------|
| 版本号 | 3.12.0 |
| 上游版本 | 3.11.0 |
| 类型 | 缺陷修复 + 体验优化 |
| 影响模块 | 音乐播放器、哔哩哔哩集成、Offscreen 播放引擎 |

---

## 一、修复的缺陷

### 1.1 音乐播放器音量滑块无法操作（严重）

**现象**: 展开音量控制弹窗后，滑块无法拖动或点击调整音量。

**根因**: `.mc-panel` 设有 `overflow: hidden`（用于展开/收起动画的 `max-height` 过渡），音量弹窗 `.mc-vol-slider` 使用 `position: absolute; bottom: calc(100% + 8px)` 向上弹出，但被父容器的 `overflow: hidden` 完全裁剪。

**修复方案**: 将音量浮层从 `#mc-panel` 内部移出至 `.music-island` 层级（不受 `overflow: hidden` 限制），通过 JavaScript 动态计算位置，对齐音量按钮。

**涉及文件**:
- `js/music-controller.js` — 新增 `_initFloatingVolume()`、`_toggleFloatingVolume()`、`_positionFloatingVolume()`、`_bindFloatingVolumeEvents()`
- `css/style.css` — 新增 `.mc-vol-floating` 样式

---

### 1.2 Bilibili 画质切换缺少反馈（中等）

**现象**: 切换画质时仅 360P 有反馈（因为实际切换成功），1080P 等高画质无任何提示，用户不知道是否切换成功。

**根因**: `_setQuality()` 立即更新按钮高亮状态并发送 `postMessage` 到 iframe，但：
1. 无任何 toast 反馈告知用户操作已触发
2. 高画质可能因大会员限制被静默拒绝
3. 没有验证机制确认画质是否真正切换

**修复方案**:
1. 切换时立即显示 toast："切换画质: 1080P"
2. 延迟 2.5s 后向 iframe 重新请求画质信息
3. 收到回报后对比：若画质未变化，显示警告 toast："画质切换失败，可能需要大会员权限"
4. `_onQualityInfo` 收到确认数据时也显示当前画质

**涉及文件**:
- `js/bilibili-controller.js` — 新增 `_showBiliToast()`、改进 `_setQuality()` 和 `_onQualityInfo()`
- `css/style.css` — 新增 `.bili-toast` 样式

---

### 1.3 Bilibili toast 挂载选择器错误（中等）

**现象**: toast 容器选择器 `#bili-player-area` 不匹配 DOM（实际为 `class="bili-player-area"`），导致 toast 不可见。

**修复**: 将选择器改为 `.bili-player-area`。

---

### 1.4 进度条无法 seek 到歌曲开头（低）

**现象**: 将进度条拖到最左侧（0:00），歌曲不会跳到开头。

**根因**: `targetTime > 0` 排除了 `0`。

**修复**: 改为 `targetTime >= 0`。

---

### 1.5 Offscreen stop 命令未清空元数据（中等）

**现象**: 断开音乐连接后，offscreen 文档仍保留旧歌曲标题/封面等元数据，可能在后续广播中推送过时信息。

**修复**: `stop` 命令显式清空 `title`/`artist`/`cover`/`songId` 并触发一次 `broadcastState()`。

---

### 1.6 播放状态未持久化写入（中等）

**现象**: `_restoreMusicState()` 能读取 `lastMusicState`，但全局没有任何写入该键的代码，刷新页面后永远无法恢复上次播放状态。

**修复**: 新增 `_throttleSaveState()` 方法，在收到 offscreen 状态更新时节流（5秒间隔）写入 `lastMusicState`。

---

## 二、体验优化

### 2.1 发现页新增"全部播放"与"随机播放"按钮

**优化前**: 发现页（每日推荐/热门歌曲）只能逐首点击播放，无法一键播放整个列表。

**优化后**: 
- 推荐列表头部增加"全部"按钮和"随机"按钮
- 点击"全部"：将推荐列表设为播放队列 → 从第一首开始顺序播放
- 点击"随机"：将推荐列表设为播放队列 → 切换到随机模式 → 随机开始播放
- 单曲点击也会自动将当前推荐列表作为播放队列

---

### 2.2 搜索结果自动加入播放队列

**优化前**: 从搜索结果点击播放歌曲时，不会将搜索结果纳入播放队列，导致切歌时队列只有一首歌。

**优化后**: 首次从搜索结果播放时，自动将整页搜索结果（最多 20 首）设为播放队列（名称为"搜索: 关键词"），实现与发现页一致的切歌体验。

---

### 2.3 Toast 消息防裁剪

**优化前**: Toast 挂载在 `#mc-panel` 内（`overflow: hidden`），长文案被裁剪。

**优化后**:
- Toast 挂载到 `.music-island` 层级
- CSS 改为 `max-width: 300px; white-space: normal; word-break: break-word`
- 位置调整为面板上方

---

### 2.4 歌词滚动防抖

**优化前**: 每次歌词行切换都触发 `scrollIntoView({ behavior: 'smooth' })`，快歌时多个平滑滚动排队导致抖动。

**优化后**: 增加 300ms 防抖，确保同一时段只有一次 `scrollIntoView`，减少抖动。

---

## 三、已知遗留项（建议后续版本处理）

| 编号 | 问题 | 优先级 | 建议版本 |
|------|------|--------|----------|
| L1 | `requestAnimationFrame` 循环在 `destroy()` / 页面隐藏时未取消 | 中 | v3.13 |
| L2 | Offscreen `setInterval` 在非播放时仍每秒运行 | 中 | v3.13 |
| L3 | 歌单 Tab 每次进入全量重载，无缓存 | 中 | v3.13 |
| L4 | 歌词时间查找使用线性扫描，长 LRC 性能风险 | 低 | v3.14 |
| L5 | Bilibili 侧边栏切换竞态（`_loading` 锁可能导致 Tab UI/数据不一致） | 高 | v3.13 |
| L6 | Bilibili 操作按钮（点赞等）失败无用户提示 | 中 | v3.13 |
| L7 | 画质 inject 脚本中 `__playinfo__` 可能上报旧数据 | 中 | v3.13 |
| L8 | `_pollTimer` / `_startPolling` 空实现死代码 | 低 | v3.14 |
| L9 | 面板内嵌旧音量条 DOM（`#mc-vol-slider`）为死代码 | 低 | v3.14 |
| L10 | 歌单激活状态用歌名匹配而非 songId | 低 | v3.14 |

---

## 四、修改清单

| 文件 | 改动概述 |
|------|----------|
| `manifest.json` | 版本号 3.11.0 → 3.12.0 |
| `js/music-controller.js` | 浮动音量控件、发现页全播、搜索队列、状态持久化、seek 修正、Toast 移位、歌词防抖 |
| `js/bilibili-controller.js` | 画质切换 toast 反馈 + 验证、toast 选择器修正、hide 清理定时器 |
| `js/offscreen.js` | stop 命令清空元数据并广播 |
| `css/style.css` | 浮动音量样式、Bilibili toast 样式、推荐操作按钮、Toast 防裁剪 |
