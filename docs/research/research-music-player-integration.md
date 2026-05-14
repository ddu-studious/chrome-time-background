# Chrome 扩展新标签页音乐播放器控制功能调研报告

**调研目标**：在 Chrome 扩展（Manifest V3）的新标签页中集成音乐播放器控制功能，支持酷狗音乐和网易云音乐。

**调研日期**：2026 年 3 月 17 日

---

## 一、酷狗音乐

### 1.1 官方 API

酷狗音乐**未提供官方公开 API 文档**，所有可用接口均为非官方逆向或社区整理。

### 1.2 第三方 API 资源

| 来源 | 链接 | 说明 |
|------|------|------|
| Gitee 项目 | [superxuqc/cool-dog-music-api](https://gitee.com/superxuqc/cool-dog-music-api) | 酷狗音乐 API，个人参考学习 |
| 博客整理 | [酷狗音乐API接口-整理](https://blog.cenguigui.cn/125.html) | 接口大全整理 |
| 免费聚合平台 | [api.aa1.cn/doc/kugou_music.html](https://api.aa1.cn/doc/kugou_music.html) | 酷狗 VIP 音乐免费 API |
| 技术博客 | [记一次酷狗音乐API的获取](https://www.cnblogs.com/apresunday/p/8448126.html) | 接口逆向与封装思路 |

### 1.3 主要接口分类

**搜索接口**
```
http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword={关键字}&page={页数}&pagesize={单页数量}
```

**排行榜接口**
```
http://mobilecdn.kugou.com/api/v3/rank/list
http://mobilecdn.kugou.com/api/v3/rank/song?ranktype={type}&rankid={id}&page={页数}&pagesize={单页数量}
```

**歌曲播放接口**
```
https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash={歌曲hash}
```
返回 JSON，包含歌曲信息、播放链接、歌词等。

**其他**
- 歌单搜索、专辑搜索、歌词搜索
- 歌手信息、专辑、MV 等

### 1.4 可用性与限制

| 项目 | 说明 |
|------|------|
| **是否免费** | 第三方接口多为免费，聚合平台可能有调用限制 |
| **登录/鉴权** | 部分接口无需登录，播放链接获取可能需鉴权 |
| **速率限制** | 无公开文档，建议自测并控制调用频率 |
| **稳定性** | 非官方接口，可能随时失效或变更 |
| **法律风险** | 非官方接口，仅供学习参考，禁止商业使用 |

### 1.5 GitHub 项目情况

以 "kugou music api"、"kugou api" 搜索 GitHub，**未发现成熟的开源酷狗 API 项目**，多为个人博客或 Gitee 小项目。

---

## 二、网易云音乐

### 2.1 NeteaseCloudMusicApi 项目状态

| 项目 | 状态 | Stars | 说明 |
|------|------|-------|------|
| **Binaryify/NeteaseCloudMusicApi** | ⛔ 已归档 | 30,296 | 原项目，因版权问题停止维护 |
| **NeteaseCloudMusicApi Enhanced** | ✅ 活跃维护 | 643+ | 复刻版本，持续更新 |
| **NPM 包** | ✅ 可用 | 1.1K 周下载 | `npx NeteaseCloudMusicApi@latest` |

**原项目归档原因**：网易云音乐发送法律通知，指控侵犯著作权、不正当竞争等，开发者清空代码并标注「保护版权，此仓库不再维护」。

### 2.2 活跃替代方案

**NeteaseCloudMusicApi Enhanced**
- 仓库：https://github.com/NeteaseCloudMusicApiEnhanced/NeteaseCloudMusicApi
- 文档：https://docs-neteasecloudmusicapi.focalors.ltd/
- 特点：200+ 接口、四种加密模式、后端代理
- 基于 Binaryify 原版复刻并增强

### 2.3 API 能力

| 能力 | 支持情况 |
|------|----------|
| 用户登录/鉴权 | ✅ |
| 歌曲搜索 | ✅ |
| 歌单管理 | ✅ |
| 歌词获取 | ✅ |
| 每日推荐 | ✅ |
| 私人 FM | ✅ |
| MV 数据 | ✅ |
| 播放 URL | ✅（需注意版权与加密） |

### 2.4 部署方式

| 方式 | 说明 |
|------|------|
| **本地 Node.js** | `node app.js`，默认端口 3000 |
| **npx 快速启动** | `npx NeteaseCloudMusicApi@latest` |
| **Docker** | `binaryify/netease_cloud_music_api` |
| **Vercel** | Fork 后导入 Vercel 部署 |
| **腾讯云 Serverless** | 前三个月有免费额度 |

**环境要求**：Node.js 14+（建议 18+）

### 2.5 法律风险（重要）

网易对原 NeteaseCloudMusicApi 项目的指控包括：
- **侵犯著作权**：非法破解接口获取版权歌曲
- **不正当竞争**：非法获取用户流量
- **涉嫌刑事犯罪**：侵犯著作权罪、破坏计算机信息系统等

**结论**：使用网易云第三方 API 存在**较高法律风险**，尤其是获取播放链接、下载等涉及版权内容的功能。

---

## 三、Chrome 扩展集成方案

### 3.1 Media Session API

| 项目 | 说明 |
|------|------|
| **用途** | 自定义媒体通知、处理播放/暂停/上一曲/下一曲等 |
| **访问方式** | `navigator.mediaSession` |
| **扩展限制** | ⚠️ **扩展无法直接读取网页的 MediaSession 数据**，需通过注入脚本间接访问 |
| **参考** | [MDN Media Session API](https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API) |

### 3.2 Content Script 注入方案（推荐）

**原理**：在酷狗/网易云网页版注入 content script，通过 DOM 操作或模拟点击控制播放。

**实现方式**：
- 使用 CSS 选择器定位播放/暂停/上一曲/下一曲等按钮
- 调用 `element.click()` 或 `dispatchEvent` 模拟点击
- 对 `<audio>`/`<video>` 使用 `play()`、`pause()`、`currentTime` 等
- 通过 `aria-label` 等属性识别按钮状态（如 repeat、shuffle）

**注意事项**：
- 网易云、酷狗网页版 DOM 结构可能随版本变化，需维护选择器
- 注入的 HTML 需避免被站点 CSS 隐藏（如 Spotify 的 `body > div:not([id], [class]) { display: none; }`）
- 需在 `manifest.json` 中配置 `content_scripts` 和 `host_permissions`

**参考项目**：
- [Music_Web_Manager](https://github.com/lazylettucewaseaten/Music_Web_Manager) - YouTube Music、Spotify
- [AVC-WebPlayer](https://github.com/avcbcoder/AVC-WebPlayer) - 通用媒体控制

### 3.3 新标签页内嵌播放器

**方案**：在新标签页中嵌入 `<audio>` 或 `<video>`，通过自建/第三方 API 获取播放 URL 后直接播放。

**限制**：
- 需自建或使用第三方 API 服务（网易云、酷狗均无官方 Web API）
- 涉及版权内容获取，法律风险高
- 网易云、酷狗播放链接常有加密、时效性，实现复杂

### 3.4 chrome.tabCapture

| 项目 | 说明 |
|------|------|
| **用途** | 捕获标签页的音频/视频流 |
| **权限** | 需 `tabCapture` |
| **Manifest V3** | Service Worker 不能直接调用，需通过 popup 或 offscreen document |
| **适用场景** | 录音、转码等，不适合作为常规播放控制方案 |

### 3.5 Manifest V3 影响

| 变化 | 影响 |
|------|------|
| Background Page → Service Worker | 无持久上下文，需用 offscreen document 处理媒体 |
| tabCapture | 需在用户交互（如点击扩展图标）后调用 |
| Content Script | 不受影响，仍可注入到目标页面 |

---

## 四、竞品参考

### 4.1 Chrome Web Store 音乐控制扩展

| 扩展名 | 功能 | 实现方式 | 支持平台 |
|--------|------|----------|----------|
| **Streamkeys** | 全局媒体快捷键 | Content Script 按站点注入 | Spotify、YouTube Music、Pandora、Deezer 等 |
| **Spotify Web Player Hotkeys** | Spotify 快捷键 | Content Script | 仅 Spotify |
| **TuneEase** | 播放控制、音量、喜欢 | 需 Spotify 桌面端 | Spotify |
| **MiniPlay** | 弹出播放器、快捷键 | Content Script | Google Music、Pandora、Spotify |
| **Music_Web_Manager** | 播放控制、画中画 | DOM 选择器 + 键盘事件 | YouTube Music、Spotify |

### 4.2 Streamkeys 实现要点

- **berrberr/streamkeys**（约 546 stars）：为每个支持的站点编写独立 controller
- 检测当前标签页是否为支持的站点，图标变绿表示已连接
- 通过全局快捷键将命令发送到活动媒体标签页
- 支持站点以欧美为主（Spotify、Pandora、YouTube Music 等），**未见明确支持网易云、酷狗**

### 4.3 用户评价与维护

- Streamkeys 等扩展需随站点改版更新选择器，否则会失效
- 有用户反馈 Spotify 等站点更新后扩展失效
- 扩展需申请「阻止任意页面内容」「显示通知」等权限，可能影响用户信任

---

## 五、可行性评估

### 5.1 技术可行性

| 方案 | 可行性 | 说明 |
|------|--------|------|
| **Content Script 控制网页版** | 高 | 与 Streamkeys 类似，需为 music.163.com、web.kugou.com 等编写 controller |
| **新标签页内嵌 + 自建 API** | 中 | 技术可行，但依赖自建网易云/酷狗 API，维护成本高 |
| **Media Session 跨标签控制** | 低 | 扩展无法直接读取其他页面的 MediaSession，只能通过注入脚本 |

### 5.2 法律风险

| 方案 | 风险等级 | 说明 |
|------|----------|------|
| **Content Script 控制网页版** | 低 | 仅控制用户已打开的官方网页，不获取版权内容 |
| **使用 NeteaseCloudMusicApi / 酷狗第三方 API** | 高 | 网易已对类似项目发法律通知，酷狗接口亦非官方 |
| **获取播放 URL 并内嵌播放** | 高 | 涉及未经授权的音乐传播，版权风险大 |

### 5.3 实现复杂度

| 方案 | 复杂度 | 主要工作 |
|------|--------|----------|
| **Content Script 控制** | 中 | 分析网易云/酷狗网页 DOM，编写 controller，处理站点更新 |
| **自建 API + 内嵌播放器** | 高 | 部署 API 服务、处理加密与鉴权、前端播放器、版权合规 |

---

## 六、结论与建议

### 6.1 推荐方案：Content Script 控制网页版

**理由**：
1. 法律风险低：仅增强用户已打开的官方网页体验，不获取、存储、传播版权内容
2. 无需自建服务：不依赖第三方 API
3. 有成熟参考：Streamkeys、Music_Web_Manager 等已验证可行
4. 与 Manifest V3 兼容良好

**实现步骤**：
1. 确认网易云音乐、酷狗音乐网页版 URL（如 `music.163.com`、`www.kugou.com`）
2. 分析播放控制相关 DOM 结构（播放/暂停、上一曲、下一曲、音量等）
3. 为每个站点编写 content script controller
4. 在新标签页或 popup 中提供统一控制入口，通过 `chrome.tabs.sendMessage` 与 content script 通信
5. 配置 `host_permissions` 和 `content_scripts` 的 `matches`

### 6.2 不推荐方案

- **直接使用 NeteaseCloudMusicApi / 酷狗第三方 API 获取播放链接**：法律风险高，且网易已对类似项目采取法律行动
- **新标签页内嵌完整播放器并播放版权音乐**：涉及未经授权的传播，版权与合规风险大

### 6.3 网页版支持情况

需进一步确认：
- **网易云音乐**：`music.163.com` 提供网页版播放器
- **酷狗音乐**：`www.kugou.com` 提供网页版

建议在开发前实际打开上述页面，验证播放控制元素的 DOM 结构及稳定性。

---

## 附录：关键链接汇总

| 类型 | 链接 |
|------|------|
| NeteaseCloudMusicApi 原项目 | https://github.com/Binaryify/NeteaseCloudMusicApi |
| NeteaseCloudMusicApi Enhanced | https://github.com/NeteaseCloudMusicApiEnhanced/NeteaseCloudMusicApi |
| NeteaseCloudMusicApi 文档 | https://docs-neteasecloudmusicapi.focalors.ltd/ |
| 酷狗 API（Gitee） | https://gitee.com/superxuqc/cool-dog-music-api |
| Streamkeys | https://github.com/berrberr/streamkeys |
| Music_Web_Manager | https://github.com/lazylettucewaseaten/Music_Web_Manager |
| Media Session API (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API |
| Chrome tabCapture | https://developer.chrome.com/docs/extensions/reference/api/tabCapture |

---

*报告完成。如有更新或补充，请以最新调研为准。*
