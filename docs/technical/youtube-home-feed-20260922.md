# YouTube 首页推荐 TAB

日期：2026-09-22

## 行为

- 在“为你推荐”旁增加“首页推荐”。原订阅聚合、默认入口和兴趣趋势保持原有来源。
- 首页推荐单独使用 YouTube 网页登录状态，不要求工作台 Google OAuth 已连接。
- 卡片支持刷新、加载更多、列表/网格、原有播放器、稍后看及学习清单。首页列表不自动轮询。
- 使用最近访问的普通 YouTube 标签页作为账号来源；分页固定原来源。没有可用页面时，在当前窗口创建不激活的首页标签，读取完成后关闭仍未激活且地址未变化的临时标签；不导航或关闭用户原有标签。
- 页面没有登录、账号发生变化、来源页关闭、游标过期、网络失败时明确提示。不会用订阅聚合或游客推荐冒充账号首页。

## 上游复用与适配

使用 `youtubei.js` **18.0.0**，MIT；从公开的 `youtubei.js/web` 导出加载 `Innertube`、`YT.HomeFeed`、`Parser`、`Log`。独立依赖目录为 `integrations/youtube-home/`，附精确版本及锁文件；`esbuild` 0.27.7 将代码生成到 `vendor/youtube-home/page.js`，保留许可证。运行时不从 CDN 加载 SDK。

核对过的官方及上游入口：

- [YouTube Data API activities.list](https://developers.google.com/youtube/v3/docs/activities/list)：`home` 已废弃，现有官方 Data API 无法提供账号首页。
- [YouTube.js 18.0.0](https://github.com/LuanRT/YouTube.js/releases/tag/v18.0.0)：开源库封装的是网页内部接口，不是 Google 官方 SDK。
- [认证](https://ytjs.dev/guide/authentication)：网页客户端使用 Cookie 会话；不能复用工作台只读 OAuth token 取得网页首页。
- [配置](https://ytjs.dev/guide/getting-started)：支持自定义 fetch、account_index、on_behalf_of_user、禁用播放器加载。实际安装包选项为 `fail_fast`，按已发布源码使用。
- [Chrome runtime](https://developer.chrome.com/docs/extensions/reference/api/runtime)：通过 MessageSender 校验来源；sender.tab 缺失时，用 documentId 和 getContexts 查出真实扩展标签。

SDK 拥有会话引导、认证签名、首页请求、返回结构解析及 continuation 请求。项目只承担同源传输、卡片字段投影、工作台/标签生命周期、超时、游标隔离与界面状态。

## 实际路径

```text
YouTubeController（home）
  → youtube_home_feed
  → YouTubeHomeService（后台）
  → chrome.scripting / MAIN（YouTube 顶层网页）
  → 本地打包的 YouTube.js
  → Innertube.create → getHomeFeed / HomeFeed.getContinuation
  → 字段投影 → 后台不透明游标 → 现有卡片/播放器
```

- 仅在用户进入首页 TAB 或显式刷新/分页时注入。没有增加扩展权限或声明式 content script。
- 自定义 fetch 只允许 `https://www.youtube.com/sw.js_data` 和 `/youtubei/v1/browse`。浏览器自动携带同源 Cookie；自定义代码移除 Cookie/Origin/Referer/User-Agent 请求头，避免浏览器禁止头的兼容问题。
- SDK 在 YouTube 页面内读取可用会话 Cookie 生成认证头。Cookie、OAuth token 和账号原始标识均不返回扩展 UI、不写入存储、不进入 AI 服务/上下文/日志。
- 禁用 SDK 播放器获取、额外配置请求、会话持久化和原始诊断输出。使用 `fail_fast: true`，SDK 引导失败不允许本地生成会话后静默继续。
- 卡片支持 SDK 的传统 Video 与新版 LockupView 字段。只展示可校验的 11 位视频 ID，不投影广告、帖子和播放列表；不声称与某次官网首页顺序完全一致。
- account_index、委托频道及会话签名来源绑定为内存指纹。读取前后、每次分页检查账号；账号变化不混入旧列表。
- 首屏和分页原始响应只短暂留在后台内存，用于通过公开 `HomeFeed` 构造器恢复上一页并调用 `getContinuation()`；前端只能拿到随机游标。游标绑定调用文档，5 分钟有效，最多保留 8 个；每页响应最多 2 MB、100 个视频。后台重启后要求刷新。
- SDK 请求共用 25 秒 AbortController；标签加载最多 12 秒；前端等待最多 50 秒。切页/关闭使晚到结果无效；关闭或切出首页释放游标，未完成只读请求在结束或超时后清理临时标签。不会取消或重放其他业务动作。
- 分页网络失败保留已有卡片和重试入口；成功后去重并替换游标。账号失效/变化清除旧卡片，避免展示错误账号内容。

## 构建及验证

```sh
cd integrations/youtube-home
npm ci --ignore-scripts
npm run build
```

验证层级：

| 层级 | 结果 |
| --- | --- |
| 真实 SDK + 合成网络响应 | 通过。实际调用锁定版本的会话引导、getHomeFeed、getContinuation 与解析器，覆盖旧/新卡片及签名/账号字段 |
| 业务替身测试 | 通过。游标所有权/失效、未登录、账号变化、超时、临时标签、取消晚到、OAuth 独立性、分页去重/失败保留 |
| 本地回归 | `node --test test/*.test.js test/youtube-home.test.mjs`：757/757 通过 |
| HTTP 替身预览 | 通过首屏、6→12 卡片分页、列表切换、390 px 窄屏和未登录恢复提示；使用合成内容，没有调用 YouTube |
| 真实 Chrome 扩展/账号 | **未完成**。浏览器工具的 URL 策略阻止访问 `chrome-extension://` 验证页，未绕过限制 |
| 播放/账号写入 | 本次未实际播放视频，也未修改账号数据 |

本地预览：`node integrations/youtube-home/preview.mjs`，只暴露白名单中的 5 个合成预览静态文件，监听 127.0.0.1:19847；其他路径返回 404。

真实验收时先在 `chrome://extensions` 重载扩展，再刷新新标签页，进入 YouTube → 首页推荐。确认与预期的网页登录账号一致，测试首屏、加载更多和切换账号后刷新。也可手动访问扩展内 `test/fixtures/youtube-home-live.html` 做独立只读验证；该页面不加载或重启后台，不能替代完整工作台验收。

此路径依赖网页内部接口和 ytcfg 登录状态。真实账户、同源 Cookie 可用性、站点验证页及后续 YouTube 改版仍须实际验收，不能把上述合成测试解释为真实登录首页已经通过。

## 卡片发布日期补充

- 新版 LockupView 从 SDK 的 metadata_rows 提取原站发布时间，兼容中文和英文相对时间；旧 Video 继续使用 published 字段。
- 工作台已连接 OAuth 时，复用现有只读 videos.list 按每批最多 50 个 ID 补齐 snippet.publishedAt，仅请求日期字段。先显示卡片再补日期，每批最多等待 5 秒；失败或未授权时保留原站相对时间，不估算具体年月日。
- 日期固定在卡片底部同一行的右侧，10 px、不被频道名挤掉：当年 MM-DD，跨年 YY-MM-DD；悬停显示完整发布日期。相对日期紧凑展示为“2天前”等。观看历史仍展示观看时间，不混为发布日期。
- 切换页面、开始播放、账号授权变化或新请求后，晚到的日期结果不会重绘当前界面。
- 本轮日期/首页/播放器/资源版本定向测试 45/45 通过，SDK 已重新打包，语法及 diff 检查通过；390 px HTTP 替身预览确认日期独立占位、保持同一行。真实账号日期补齐未单独验收。

## 为你推荐卡片布局对齐

- 用户撤回播放修改，仅调整订阅聚合“为你推荐”的卡片信息。封面点击、App 内播放器、稍后看及原站打开按钮保持原有行为。
- 复用首页卡片的 compactPublishedDate 和 yt-card-meta：标题最多两行，下方左侧为频道与时长，右侧为短发布日期；不增加额外信息行。
- 订阅播放列表本身没有视频时长，因此对本轮最多 24 个视频复用 videos.list 一次批量补齐 contentDetails.duration；卡片先展示，最长等待 5 秒，失败保留原列表。切页/播放后晚到结果不重绘界面。
- 46 项相关测试、语法和 diff 检查通过；HTTP 替身预览确认布局。此次未执行真实账号播放。
