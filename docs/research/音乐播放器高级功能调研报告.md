# Chrome 扩展音乐播放器高级功能调研报告

**调研目标**：为中国风景时钟扩展的音乐播放器补充高级能力——隐藏标签页自动连接、歌词展示、进度/音量控制、歌单/推荐列表等。

**调研日期**：2026-03-17  
**基于版本**：v2.4.0-alpha（Phase 1 已完成基础控制）

---

## 一、隐藏打开音乐标签页方案

### 1.1 需求背景

当前实现要求用户手动打开网易云/酷狗网页版，Content Script 自动注入后才能在新标签页显示迷你控制器。用户希望无需手动操作即可使用。

### 1.2 方案对比

| 方案 | 原理 | 优点 | 缺点 | 可行性 |
|------|------|------|------|--------|
| **A: 后台标签页** | `chrome.tabs.create({ active: false })` | Content Script 自动注入；兼容现有架构；实现最简单 | 标签栏可见（可通过 tabGroups 折叠） | **高** |
| **B: 最小化窗口** | `chrome.windows.create({ state: 'minimized' })` | 完全不可见 | 窗口管理复杂；Alt-Tab 可见；macOS 行为不一致 | 中 |
| **C: Offscreen Document** | `chrome.offscreen.createDocument()` | 完全隐藏，MV3 推荐 | **无法加载外部 URL**（只能加载扩展内 HTML）；无法注入 Content Script | **低** |
| **D: iframe 嵌入** | 在新标签页 iframe 中加载音乐站 | 无需新标签 | X-Frame-Options 阻止；CSP 限制；音乐站大多禁止嵌入 | **低** |

### 1.3 推荐方案：后台标签页 + TabGroup 折叠

**技术路线**：
1. 用户在控制器点击"连接音乐平台"按钮
2. `chrome.tabs.create({ url, active: false })` 在后台打开音乐网页
3. 使用 `chrome.tabs.group()` + `chrome.tabGroups.update({ collapsed: true })` 将标签折叠到不显眼的分组
4. Content Script 自动注入，控制器激活

**优势**：
- 零改动现有 Content Script 架构
- 标签分组折叠后仅显示小色条，不干扰用户
- 支持 `tabGroups` API（Chrome 89+）

**代码示例**：
```javascript
async function openMusicTabHidden(url, platform) {
    const tab = await chrome.tabs.create({ url, active: false });
    const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
    await chrome.tabGroups.update(groupId, {
        title: '🎵 Music',
        color: 'green',
        collapsed: true
    });
    return tab.id;
}
```

**权限需求**：`tabGroups`（无需额外权限，`tabs` 权限已包含分组操作能力）

---

## 二、歌词展示方案

### 2.1 获取方式

| 方案 | 实现 | 可靠性 |
|------|------|--------|
| **DOM 提取（推荐）** | Content Script 读取网页已渲染的歌词 DOM | 高（歌词已在页面上） |
| 第三方 API | 调用 NeteaseCloudMusicApi 歌词接口 | 中（需自建服务；法律风险） |
| audio metadata | 读取 audio 元素的 metadata | 低（浏览器不提供歌词 metadata） |

### 2.2 网易云歌词 DOM 结构

```
music.163.com 歌词面板:
  .m-lyric / .lyric-content / .j-flag .lrc
  每行歌词: .lrc-item / p[data-time]
  当前行: .lrc-item.z-sel / .j-flag.z-sel
```

### 2.3 酷狗歌词 DOM 结构

```
web.kugou.com 歌词面板:
  #lrc_content / .lrc-container
  每行歌词: .lrc-line
  当前行: .lrc-line.active / .lrc-line.current
```

### 2.4 歌词同步策略

- Content Script 每 500ms 检测当前高亮歌词行
- 通过 `chrome.runtime.sendMessage` 发送当前歌词文本
- 新标签页控制器显示单行歌词（滚动过渡动画）

---

## 三、进度条与音量控制

### 3.1 数据获取

当前 Content Script 已通过 `<audio>` 元素获取 `currentTime` 和 `duration`，但未传递 `volume`。

**扩展数据协议**：
```javascript
{
    currentTime: number,   // 已有
    duration: number,      // 已有
    volume: number,        // 新增：0-1
    lyricLine: string,     // 新增：当前歌词行
}
```

### 3.2 进度条拖拽

Content Script 需支持 `seekTo` 命令：
```javascript
case 'seekTo':
    const audio = querySafe(platform.selectors.audio);
    if (audio) audio.currentTime = msg.value;
    break;
```

### 3.3 音量控制

Content Script 需支持 `setVolume` 命令：
```javascript
case 'setVolume':
    const audio = querySafe(platform.selectors.audio);
    if (audio) audio.volume = Math.max(0, Math.min(1, msg.value));
    break;
```

---

## 四、歌单与推荐列表

### 4.1 可行方案

| 功能 | 方案 | 可行性 |
|------|------|--------|
| 当前播放列表 | DOM 提取网页端已有的播放队列 | 高 |
| 歌单切换 | DOM 操作切换网页端歌单 | 中（UI 交互复杂） |
| 推荐歌曲 | 读取网页端"每日推荐"/"推荐歌单" | 中 |
| 我喜欢的 | 读取网页端"我喜欢的音乐"播放列表 | 中（需用户已登录） |
| 搜索歌曲 | 模拟网页端搜索操作 | 中 |

### 4.2 Content Script 播放列表提取

**网易云播放列表 DOM**：
```
播放队列面板: .m-playlist / .listbd
歌曲条目: .listbd li / .item
歌名: .ttc .txt
歌手: .col
```

**酷狗播放列表 DOM**：
```
播放列表: .list_content / .play_list
歌曲条目: .list_content li
歌名: .song_name
歌手: .song_singer
```

### 4.3 建议的分步策略

| Phase | 功能 | 版本 |
|-------|------|------|
| Phase 2 | 进度条、音量控制、当前歌词行 | v2.4.0-beta |
| Phase 3 | 隐藏标签页连接、播放列表展示 | v2.5.0 |
| Phase 4 | 歌单切换、推荐、搜索、我喜欢的 | v2.6.0 |

---

## 五、Highlight.js & Mermaid 本地集成

### 5.1 Highlight.js

| 属性 | 说明 |
|------|------|
| 版本 | v11.x |
| 完整大小 | ~1MB（含所有语言） |
| 精简方案 | 仅打包常用语言（JS/TS/Python/CSS/HTML/JSON/Bash）约 120KB |
| 主题 | atom-one-dark（适合深色背景）约 2KB |
| 集成方式 | vendor/highlight.min.js + vendor/highlight-theme.css |

### 5.2 Mermaid

| 属性 | 说明 |
|------|------|
| 版本 | v11.x |
| 完整大小 | ~2.5MB |
| 精简方案 | `@mermaid-js/tiny` 约 1.2MB（无 Mindmap、Architecture、KaTeX） |
| 集成方式 | vendor/mermaid.tiny.min.js |
| 安全 | 纯客户端渲染，无网络请求 |

### 5.3 MarkView 竞品参考

MarkView 扩展已验证在 Chrome 扩展中本地打包 highlight.js + mermaid.js 的可行性：
- 支持 180+ 语言语法高亮
- 完整 Mermaid 图表（流程图、时序图、甘特图等）
- 100% 离线运行

---

## 六、结论

1. **隐藏标签页**：采用后台标签页 + TabGroup 折叠方案，改动最小且最可靠
2. **歌词**：Content Script DOM 提取当前歌词行，零法律风险
3. **进度/音量**：扩展现有 audio 元素控制协议，添加 seekTo/setVolume 命令
4. **歌单/推荐**：分阶段实现，从播放列表读取开始，逐步增加歌单切换等高级功能
5. **Markdown P2**：本地打包 highlight.js（精简）+ @mermaid-js/tiny，参考 MarkView 方案

---

*报告完成。2026-03-17*
