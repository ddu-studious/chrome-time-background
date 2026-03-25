# B 站视频嵌入技术方案调研报告

> 调研日期：2026-03-25  
> 项目：中国风景时钟 Chrome 扩展  
> 背景：当前使用 iframe 加载完整 B 站视频页面，探索是否有更优的技术替代方案  

---

## 一、调研结论（TL;DR）

**当前 iframe + 完整页面方案是最优解。** 没有比它更好的替代方案能同时满足：画质完整、登录态共享、弹幕支持、实现可行、合规安全。

| 评级 | 方案 | 推荐度 |
|------|------|--------|
| **当前方案** | iframe + 完整 B 站视频页面 + DNR Cookie 注入 + CSS 全屏 | ⭐⭐⭐⭐⭐ |
| 可选补充 | Side Panel 侧栏（作为第二入口） | ⭐⭐⭐ |
| 不推荐 | 视频流代理 + 自建播放器 | ⭐⭐ |
| 不可行 | Shadow DOM / Offscreen / WebView / Controlled Frame | ⭐ |

---

## 二、各方案详细分析

### 方案 1：iframe + 完整 B 站视频页面（当前方案）

**技术路线**：`<iframe src="https://www.bilibili.com/video/BVxxx/">` + content script 注入全屏 CSS + `declarativeNetRequest` 注入 Cookie

**可行性**：✅ 已验证可行，正在使用

| 维度 | 评价 |
|------|------|
| 画质 | 完整支持所有画质（含 4K、HDR），原生画质切换 UI |
| 登录态 | 通过 DNR Cookie 注入解决第三方 Cookie 隔离 |
| 弹幕 | 完整支持（B 站原生弹幕系统） |
| 倍速 | 支持（video.playbackRate + B 站原生 UI） |
| 用户体验 | 在 newtab 内嵌入，一体化体验 |
| 实现复杂度 | 中等 |
| 合规风险 | 低（只是在 iframe 中加载官方页面） |

**已知限制**：
- 完整页面较重（~5-8MB 初始加载）
- 需要通过 CSS 隐藏非播放器元素
- B 站前端 DOM 结构变化时 CSS 选择器可能失效

---

### 方案 2：chrome.offscreen API

**技术路线**：创建隐藏的 offscreen 文档，在其中加载 B 站页面

**可行性**：❌ 不适用于本场景

- offscreen 文档**默认不可见**，设计目的是为 Service Worker 提供 DOM 能力（如音频播放、Canvas 处理）
- 只能加载**扩展包内的 HTML 文件**
- 单扩展同时只能有**一个** offscreen 文档
- 无法将 offscreen 的渲染画面"投屏"到 newtab 页面

**结论**：架构层面不匹配，offscreen 是后台能力，不是前台 UI 容器

---

### 方案 3：chrome.sidePanel API

**技术路线**：在 Chrome 侧栏中打开扩展 HTML，内嵌 B 站 iframe

**可行性**：✅ 技术可行，但体验受限

| 优点 | 缺点 |
|------|------|
| 常驻侧栏，不占标签页 | 宽度固定，不适合视频全屏观看 |
| 可与当前网页并排使用 | 不是 newtab 内嵌体验 |
| Chrome 114+ 支持 | iframe 嵌入问题与当前方案相同 |

**结论**：**可作为补充入口**（如"伴侣模式"），但不适合替代当前的 newtab 内嵌方案

---

### 方案 4：WebView / Controlled Frame

**技术路线**：使用类似 Electron `<webview>` 的隔离浏览环境

**可行性**：❌ 不可用

- 桌面 Chrome 扩展 (MV3) **没有 WebView API**
- `<webview>` 属于已废弃的 Chrome Apps 平台
- **Controlled Frame API** 仅限 Isolated Web Apps (IWA)，需要特殊注册流程，不适用于普通扩展

**结论**：当前无法使用，未来也不太可能面向普通扩展开放

---

### 方案 5：Shadow DOM + Fetch 抓取

**技术路线**：通过 fetch 抓取 B 站页面 HTML，渲染到 Shadow DOM 中

**可行性**：❌ 完全不可行

- B 站是**重 JS 单页应用**，静态 HTML 无法运行播放器
- 跨域 fetch 受 CORS 限制
- 无法复刻 B 站的 DRM 鉴权、弹幕 WebSocket、播放器逻辑
- Shadow DOM 只解决样式隔离，不解决 JS 执行环境

**结论**：技术路线根本不成立

---

### 方案 6：视频流代理 + 自建播放器

**技术路线**：通过 B 站 `/x/player/playurl` API 获取 DASH/FLV 视频流 URL，使用 flv.js/dash.js/DPlayer 等自建播放器

**可行性**：⚠️ 技术上可行，但风险高

| 维度 | 评价 |
|------|------|
| 画质 | 取决于 API 返回（需要 Cookie + WBI 签名） |
| 登录态 | 需要通过 background 代理，可用 |
| 弹幕 | 需要单独对接弹幕 API，实现复杂 |
| DASH 格式 | 需要 MSE (Media Source Extensions) + dash.js |
| 防盗链 | 视频流 URL 需要特定 Referer header |
| 合规 | **高风险**——违反 B 站服务条款，可能面临法律问题 |

**社区案例**：
- **BiliScape (BiliChrome)**：第三方 B 站客户端扩展，137 stars，**已于 2026-02 停止维护**，原因是底层 API 项目收到停止函
- **bilibili-mpv-opener**：外链到 MPV 播放器，避开了自建播放器的问题

**技术难点**：
1. B 站 playurl API 需要 **WBI 签名**（基于 img_key + sub_key 的 HMAC），签名算法经常更新
2. DASH 格式分离音视频流，需要 MSE 同步播放
3. 视频流 URL 有**时间戳校验 + IP 绑定**，不可缓存
4. 高画质（1080P+）需要 SESSDATA Cookie + 大会员权限

**结论**：**不推荐**——实现复杂度极高，维护成本大，合规风险无法忽视

---

### 方案 7：打开新标签页 + Content Script 注入

**技术路线**：`chrome.tabs.create({ url: 'https://www.bilibili.com/video/BVxxx' })`，通过 content script 注入增强 UI

**可行性**：✅ 最稳定的方案

| 优点 | 缺点 |
|------|------|
| Cookie/登录态完全原生 | 不在 newtab 内嵌，破坏一体化体验 |
| 画质/弹幕/弹幕完整 | 用户需要在两个标签页间切换 |
| 合规无风险 | 与"仪表盘"概念不符 |
| 实现最简单 | 无法控制页面布局 |

**结论**：**功能最完整但体验不匹配**——适合"外链播放"模式，不适合当前的集成面板设计

---

### 方案 8：Popup 弹窗

**可行性**：✅ 但体验极差

- 弹窗窗口小，关闭弹窗后视频停止
- 不常驻，不适合长视频观看
- 本质还是 iframe 嵌入

**结论**：不推荐

---

## 三、社区实践总结

通过 GitHub 搜索，B 站相关 Chrome 扩展的主流技术路线：

| 类型 | 代表项目 | 技术方案 | 状态 |
|------|---------|---------|------|
| 页面增强 | bilibili-enhancer, bilibili-speed-controller | Content script 注入到 B 站页面 | 活跃 |
| 外链播放 | bilibili-mpv-opener | 协议调用本地 MPV + yt-dlp | 活跃 |
| 第三方客户端 | BiliScape (BiliChrome) | 自建 UI + 非官方 API | **已停维** |
| 视频解析 | Bili2VRC | 解析视频 URL 到剪贴板 | 活跃 |

**关键洞察**：社区中**没有**成功的"在扩展 newtab 中嵌入 B 站播放器"的先例。大多数项目要么在 B 站原页面上增强，要么外链到外部播放器。我们的 iframe 全站方案实际上是**独创路线**。

---

## 四、当前方案优化建议

基于调研结论，当前 iframe 方案已是最优解。可进一步优化：

### 短期优化
1. **CSS 选择器稳定性**：使用更健壮的选择器（id > class > 层级），减少 B 站前端改版影响
2. **加载性能**：iframe 添加 `loading="lazy"`，视频页面预热
3. **错误恢复**：iframe 加载失败时自动回退到 embed player

### 中期优化
4. **Side Panel 补充入口**：添加侧栏模式，用户可以在主页面旁边看 B 站
5. **画质记忆**：保存用户上次选择的画质，下次播放时自动应用

### 长期关注
6. **Controlled Frame API**：关注该 API 向普通扩展开放的进展
7. **B 站 embed player 升级**：如果 B 站未来为 embed player 添加画质支持，可以切回轻量方案

---

## 五、风险评估

| 风险 | 级别 | 应对 |
|------|------|------|
| B 站禁止 iframe 嵌入（添加 X-Frame-Options） | 中 | 可通过 DNR 移除 header，但需关注合规 |
| B 站前端 DOM 改版导致 CSS 失效 | 中 | 使用稳定选择器 + 定期维护 |
| Chrome 收紧 declarativeNetRequest 策略 | 低 | 当前规则范围精确，风险可控 |
| 第三方 Cookie 策略进一步收紧 | 低 | 已通过 DNR 注入 Cookie 解决 |

---

*报告完成。结论：继续使用 iframe + 完整页面方案，无需更换技术路线。*
