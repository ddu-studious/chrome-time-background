# 更新日志

## [3.16.1] - 2026-03-30

### 修复
- **网易播放器演唱者文字溢出**
  - 修复多位演唱者名字过长时撑开播放条，导致播放/下一首按钮被挤出可视区域
  - `.mc-sub` 增加 `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` 截断
  - `.mc-info` 增加 `overflow: hidden` 防止子元素溢出

- **B 站主站点赞 CSRF 校验失败**
  - 根因：`declarativeNetRequest` DNR 规则无 `tabIds` 限制，拦截了 B 站主站的原生 API 请求，用静态 Cookie 覆盖了浏览器原生 Cookie，导致 `bili_jct` CSRF token 不匹配
  - Rule 9010（background API 代理）添加 `tabIds: [-1]` 限制为 Service Worker 请求
  - Rule 9001-9004（iframe Cookie 注入）通过 `sender.tab.id` 精确限定到扩展新标签页
  - 所有含 `tabIds` 的规则改用 `updateSessionRules`（`tabIds` 仅 session-scoped rules 支持）
  - 扩展安装/更新时自动清理旧版 dynamic rules 残留
  - `no-login-cookie` 状态降级为 `console.log`，避免正常未登录时产生误导性警告

### 新增
- **发现页推荐歌单模块**
  - 在每日推荐/热门歌曲下方展示推荐歌单（3×2 卡片网格）
  - 歌单卡片显示封面、名称、播放量
  - 悬浮显示播放按钮，点击直接加载歌单播放队列

- **搜索类型切换**
  - 搜索栏新增「歌曲/歌单/歌手」类型切换标签
  - 歌单搜索（type=1000）以卡片网格展示，点击加载歌单
  - 歌手搜索（type=100）显示头像和作品数量，点击播放歌手热门歌曲

## [3.16.0] - 2026-03-29

### 新增
- **常用信息标签归类筛选**
  - 标签云区域：自动从所有卡片收集标签并按使用频率排序，显示使用计数
  - 点击标签云标签筛选：高亮选中后仅显示包含该标签的卡片
  - 多标签交叉筛选：同时选中多个标签时，显示包含所有选中标签的卡片
  - 类型 × 标签组合筛选：类型筛选和标签筛选可同时生效
  - 卡片标签可点击：点击卡片上的标签等效于标签云中选中该标签
  - 已选中标签的卡片标签高亮提示
  - 一键清除所有标签筛选
  - 切换类型筛选时自动重置标签选择
  - 无标签时标签云区域自动隐藏

- **Markdown 编辑器 Tab 键支持**
  - Tab 键在编辑器中插入 4 空格缩进（不再跳出 textarea）
  - Shift+Tab 删除当前行行首最多 4 空格
  - 多行选中时 Tab/Shift+Tab 批量缩进/取消缩进
  - Tab 操作后 Markdown 预览自动刷新

- **Markdown 列表自动续行**
  - 无序列表（`- `）Enter 后自动续行前缀
  - 有序列表（`1. `）Enter 后自动递增序号
  - 任务列表（`- [ ] `）Enter 后自动续行
  - 保持缩进级别
  - 空列表项 Enter 后自动删除前缀（退出列表模式）

- **Markdown 快捷键增强**
  - Ctrl/Cmd+B 插入/切换粗体
  - Ctrl/Cmd+I 插入/切换斜体
  - Ctrl/Cmd+K 插入链接
  - Ctrl/Cmd+Shift+K 插入行内代码

### 文档
- 新增 `docs/research/knowledge-wall-competitive-research.md` — 常用信息竞品调研报告
- 新增 `docs/requirements/PRD-常用信息标签归类与Markdown增强.md` — 需求文档

## [3.15.1] - 2026-03-25

### 修复
- **视频自动进入网页全屏模式**
  - 在 iframe 内加载完整 B 站页面时，自动触发播放器原生"网页全屏"模式
  - 多时机重试（2s/4s/6s/8s/12s），兼容慢速加载场景
  - 优先使用 `player.requestWebFullScreen()` API，降级到点击 `.bpx-player-ctrl-web` 按钮

- **修复稍后看/收藏删除 412 风控拦截**
  - 根因：Service Worker 中 `fetch()` 的 `Origin` header 被浏览器自动替换为 `chrome-extension://xxx`（forbidden header 限制），B 站风控检测到非法来源返回 412
  - 通过 `declarativeNetRequest` DNR 规则在网络层注入正确的 `Origin`、`Referer`、`Cookie` 头
  - DNR 规则在首次 API 调用时自动创建，遇到 412 时自动刷新 Cookie 并重建规则
  - 同时优化：删除成功后本地直接从缓存移除该项，DOM 淡出动画消失，不再依赖重新拉取列表

- **画质横条与播放器显示不同步**
  - 根因：`_setQuality` 乐观更新 UI，未等播放器确认就标记为已切换
  - 改为切换时标记 "pending" 闪烁状态，不更新实际画质值
  - 等播放器回报 `quality-info` 确认后才真正更新 UI
  - 8 秒超时未确认则回退 UI 并提示切换失败

## [3.15.0] - 2026-03-25

### 重要更新
- **B站播放器升级：从嵌入播放器切换到完整版页面（彻底解决画质受限）**
  - **问题根因**：B 站嵌入播放器（`player.bilibili.com/player.html`）从底层架构上限制画质
    - `quality`/`high_quality` URL 参数不在 embed player 的 `SEARCH_PARAM` 支持列表中，被完全忽略
    - 使用 `nano.createPlayer` 框架，内置 `ChannelKind.Embedded_Other` 标记，服务端强制返回 360P
    - embed player 无画质选择 UI，无 `window.player.requestQuality` 等 API
    - 与 Cookie/登录态无关，是 B 站对第三方嵌入的业务策略限制
  - **方案**：iframe 直接加载完整版 B 站视频页面（`www.bilibili.com/video/BVxxx`）
    - 完整版页面拥有原生画质切换 UI（含 1080P+/4K 等全部选项）
    - `declarativeNetRequest` 动态规则注入 bilibili Cookie，确保 iframe 内登录态可用
    - `bilibili-player-inject.js` 检测 iframe 环境后自动注入全屏 CSS，隐藏导航/评论/推荐等非播放器元素
    - 播放器区域铺满整个 iframe，体验与原 embed player 一致但功能完整
  - content_scripts 扩展匹配 `www.bilibili.com/video/*` 和 `bangumi/*`
  - 新增 `declarativeNetRequest` 权限

- **修复画质 toast 显示 `[object Object]` 问题**
  - 新增 `_safeQualityLabel()` 安全标签提取方法
  - 对 `_onQualityInfo()` 中的 descriptions 值和 current 画质代码增加类型安全检查

- **允许跳转到 B 站站内**
  - 移除 `bilibili-player-inject.js` 中对 window.open 和链接的全面拦截
  - 改为仅拦截播放器控件（画质/倍速菜单）内的无意跳转
  - 移除 `background.js` 中 webNavigation 新标签页拦截
  - iframe sandbox 添加 `allow-popups allow-popups-to-escape-sandbox`

- **修复取消收藏/稍后看 412 风控错误**
  - B 站 POST 请求风控要求 `Origin` header，`bilibiliApiCall` 中新增 `Origin: https://www.bilibili.com`

- **修复手动切换低画质后自动回切 1080P 问题**
  - 根因：`autoSetBestQuality()` 每 2 秒周期检测画质 < 80 就自动切回，覆盖用户手动选择
  - 新增 `_userQualityOverride` 标志：用户通过 postMessage 主动切换画质时设为 true
  - `autoSetBestQuality()` 检测到用户覆盖后永久跳过自动切换
  - 修正循环条件逻辑：`_autoQualityAttempted` 设为 true 后不再重复进入

## [3.14.0] - 2026-03-25

### 修复 & 优化
- **任务弹窗 UI 优化**
  - 编辑任务和添加任务的弹窗浮层不再响应点击外部关闭，仅通过关闭/取消按钮关闭
  - 避免误触导致编辑内容丢失

- **网易云音乐播放器 UI 优化**
  - 队列列表新增"我喜欢"按钮：hover 显示心形图标，点击即可收藏/取消歌曲到网易云"我喜欢"
  - 列表布局重构：歌名和歌手改为上下双行布局（.mc-row-info），解决左侧拥挤问题
  - 序号列宽调整为 22px 居中对齐，整体间距优化（gap: 8px, padding: 14px）

- **播放器队列刷新恢复修复**
  - 刷新页面后队列列表自动从缓存恢复并渲染，不再显示"暂无歌曲"
  - 修复 `_restoreMusicState` 未恢复 `_currentSongId` 的问题
  - 恢复时自动高亮当前播放歌曲

- **B站播放器画质切换增强**
  - 重构 `bilibili-player-inject.js` 画质探测：增加 DOM 解析策略作为降级方案
  - 新增 `getQualityFromDOM()` 方法：遍历多种选择器匹配新版/旧版播放器画质菜单
  - 新增 `setQualityViaDOM()` 方法：通过模拟 mouseenter + click 切换画质
  - 新增 `QUALITY_LABEL_TO_QN` 中文标签到画质代码的映射
  - 增加自动画质重试机制（最多 3 次）
  - 画质切换失败提示根据等级区分（大会员/登录/通用提示）

## [2.3.1] - 2026-03-05

### 修复 & 优化
- **新增通义千问（阿里云百炼）作为默认 AI 服务商**
  - 模型：`text-embedding-v4`（Qwen3-Embedding 系列），支持 100+ 语种，中文优化
  - 向量维度：1024，API 完全兼容 OpenAI 格式
  - 免费额度：100 万 Token（90 天），价格约 ¥0.0005/千 Token
  - 配置地址：`https://dashscope.aliyuncs.com/compatible-mode/v1`
- **修复 DeepSeek Embedding 不可用问题**
  - DeepSeek 官方已不提供 `deepseek-embedding` 模型
  - 将 DeepSeek 标记为"仅 Chat 精排"，配置向导中增加提示徽章
  - 选择 DeepSeek 时给出引导提示，避免 Embedding 报错
- **调整各 Provider 向量维度**
  - 通义千问：1024 维（text-embedding-v4 默认）
  - OpenAI：1536 维（text-embedding-3-small）
  - Gemini：768 维（text-embedding-004）
  - 自定义：默认 1024 维
- **优化 `_callEmbeddingAPI`**：基于 `supportsDimensions` 标志决定是否传 `dimensions` 参数（Gemini 不支持该参数）
- **UI 优化**：Provider 卡片增加"仅 Chat 精排"徽章，区分不支持 Embedding 的服务商

## [2.3.0] - 2026-03-05

### 新增
- **智能查询理解**
  - 多层分词管道 `_tokenize()`：中英文/数字交界自动分词、标点归一化
  - `Intl.Segmenter` 精细中文分词（Chrome 87+ 内置，零体积）
  - 中文停用词过滤（~100 个常见虚词："我"、"要"、"的"、"帮我"…）
  - 中文 N-gram 子词扩展（3 字以上中文词提取 2 字子词，权重减半）
- **动态语义阈值**
  - 根据查询长度自适应：短查询（≤5字符）0.35 → 长查询（>30字符）0.15
  - 自然语言描述式搜索不再因阈值过高被过滤
- **查询向量预处理**
  - `_buildSemanticQuery()` 去停用词后再生成 Embedding，向量更聚焦
  - 例："我要学习Agent" → Embedding 输入变为 "学习 agent"

### 修复
- 修复中英文混合无空格输入（如 "我要学习Agent"）搜索不到结果的 Bug
- 修复关键词搜索 N-gram 扩展词未命中时的不合理惩罚

### 改进
- 关键词未命中惩罚从 -5 调整为 -3，减少假阴性
- Spotlight 搜索框提示文案更新，明确支持自然语言和中英文混合

### 技术
- 新增 `BookmarkRAG.STOP_WORDS` — 中英文停用词表
- 新增 `_tokenize()` — 多层分词管道（中英文交界 + Intl.Segmenter + 停用词 + N-gram）
- 新增 `_buildSemanticQuery()` — 查询向量预处理
- 新增 `_getSemanticThreshold()` — 动态语义阈值
- 更新 `search()` — 使用新分词器 + N-gram 扩展匹配
- 更新 `vectorSearch()` — 支持动态阈值
- 更新 `hybridSearch()` — 查询预处理后再生成 Embedding

### 文档
- 新增 `docs/requirements/v2.3.0-intelligent-query-search-enhancement.md` — PRD
- 新增 `docs/research/search-enhancement-research.md` — 技术调研报告
- 更新 `docs/technical/vectorization-search-guide.md` — 分词策略、动态阈值说明

## [2.2.0] - 2026-03-04

### 新增
- **LLM 重排序**
  - Spotlight 搜索结果底部新增"AI 精排"按钮
  - 基于 Listwise 方式调用 LLM 对 Top-K 结果智能重排序
  - 重排后展示 LLM 评分和相关理由
  - 显示精排耗时（"AI 已重排 N 条结果（X秒）"）
  - 支持所有已配置的 AI Provider
- **网页摘要抓取**
  - 书签面板每条书签新增"抓取摘要"按钮
  - 面板操作栏新增"批量抓取"按钮
  - 通过隐藏标签页 + scripting 注入提取网页正文
  - LLM 生成 50-100 字摘要和 5-10 个关键词标签
  - 抓取后自动重新生成 Embedding，增强搜索语义密度
  - Spotlight 搜索结果中展示摘要片段
- **搜索增强**
  - Embedding 文本增强：title + domain + summary + contentTags + aiTags
  - 书签面板统计新增"已抓取"指标

### 技术
- 新增 `_callChatAPI()` — 通用 LLM Chat API 调用方法
- 新增 `rerank()` — Listwise LLM 重排序
- 新增 `extractAndSummarize()` — 单条书签网页摘要抓取
- 新增 `batchExtractSummaries()` — 批量摘要抓取
- `background.js` 新增 `extractWebContent` 消息处理器
- `manifest.json` 新增 `scripting` 权限和 `optional_host_permissions`

## [2.1.0] - 2026-03-04

### 新增
- **书签间隔复习系统**
  - SM-2 改良算法，适配书签场景
  - 4 种频率模板：频繁阅读/定期关注/偶尔翻阅/长期存档
  - 新标签页"今日推荐阅读"卡片
  - 复习反馈 4 档操作（归档/不熟/稍后/已读）
  - 复习卡片消失动画
- **一键转任务**
  - Spotlight 搜索结果支持"转为任务"按钮
  - 书签面板列表支持"转为任务"按钮
  - 今日推荐阅读卡片支持"转为任务"按钮
- **书签面板增强**
  - 新增"启用复习"按钮
  - 统计区新增"待复习"指标

### 技术
- 新增 `js/bookmark-srs.js` — SM-2 算法、频率模板、复习队列
- 更新 `js/bookmark-rag.js` — 集成 SRS 复习方法
- 更新 `js/memo.js` — 今日推荐阅读 UI、复习反馈、一键转任务

## [2.0.0] - 2026-03-04

### 新增
- **书签 RAG 语义搜索**
  - Embedding 生成（DeepSeek/OpenAI/Gemini）
  - 向量搜索（cosine similarity）
  - 混合搜索（BM25 + 向量 + RRF 融合排序）
  - IndexedDB 持久化，浏览器重启后恢复索引
  - Query 向量缓存（24 小时有效期）
  - 增量 Embedding（新书签自动处理）
- **Spotlight 快捷搜索**
  - `Ctrl+K` 全局唤出搜索框
  - 搜索结果分"关键词匹配"和"语义推荐"两区
  - 上下键导航、回车打开、ESC 关闭
  - 搜索延迟 < 500ms

## [1.7.0] - 2026-03-03

### 新增
- **书签智能检索 Phase 1**
  - 侧边栏工具栏"书签"按钮
  - AI 配置向导（DeepSeek/OpenAI/Gemini/自定义）
  - 书签文件夹树形选择器
  - 书签列表面板（搜索、分类浏览）
  - BM25 关键词搜索
  - 书签变化监听（onCreated/onRemoved/onMoved/onChanged）
  - 手动处理按钮 + 进度条

### 新增权限
- `bookmarks` — 可选权限，按需申请

## [1.5.0] - 2026-01-30

### 新增
- **每日任务管理功能**
  - 快速添加每日任务
  - 支持设置截止时间（精确到小时分钟）
  - 今日任务视图
  - 过期任务高亮显示
  - 本周任务视图
  - 快速推迟任务（明天/下周一）
  - 任务复制功能
  - 任务统计信息
- **任务提醒系统**
  - 每日任务摘要通知（可配置时间）
  - 过期任务自动提醒
  - 单个任务提前提醒（默认30分钟）
  - 通知按钮交互（完成/推迟）
- **数据管理优化**
  - 任务数据存储到 chrome.storage.local（10MB容量）
  - 自动清理30天前已完成的旧任务
  - 存储空间优化

### 改进
- 优化了任务筛选功能，新增"今日"、"过期"、"本周"筛选
- 改进了 Service Worker 的稳定性
- 增强了任务数据的保存可靠性

### 新增权限
- `alarms` - 用于定时任务提醒
- `notifications` - 用于显示任务通知

## [1.4.2] - 即将发布

### 新增
- 面板大小调整功能，支持保存面板位置和大小
- 任务完成动画效果，提升用户体验
- 任务优先级标记功能，支持高、中、低三级优先级
- 截止日期功能
  - 任务创建和编辑时可设置截止日期
  - 根据截止日期状态显示不同样式（已逾期、今日到期、明日到期等）
  - 逾期任务高亮显示和动画效果
  - 支持按截止日期排序任务
- 键盘快捷键支持
  - 全局快捷键（添加任务、显示/隐藏面板等）
  - 任务操作快捷键（完成/取消完成、编辑、删除等）
  - 任务导航快捷键（上下箭头选择任务）
  - 快捷键帮助对话框
- 任务分类和标签功能
  - 支持创建、编辑和删除分类
  - 支持创建、编辑和删除标签
  - 任务可以分配到一个分类
  - 任务可以添加多个标签
  - 分类和标签都支持自定义颜色
  - 添加分类和标签管理界面
- 任务搜索和筛选功能
  - 支持按文本内容搜索任务
  - 支持按完成状态筛选任务（全部/已完成/未完成）
  - 支持按分类筛选任务
  - 支持按标签筛选任务
  - 实时筛选结果更新
  - 显示筛选后的任务计数

### 改进
- 优化了面板拖拽和调整大小的交互体验
- 任务完成状态切换时添加动画效果
- 改进了任务列表的显示效果

### 修复
- 修复了任务状态切换后可能出现的UI不更新问题
- 修复了面板拖拽时可能超出屏幕边界的问题
- 修复了某些情况下任务无法保存的问题

## [1.4.1] - 开发中

### 已完成
- 备忘录UI优化
  - 实现左侧悬浮式备忘录面板，取代抽屉模式
  - 添加任务完成状态切换功能
  - 设计淡雅半透明UI，与整体风格统一
  - 实现面板最小化和关闭功能
  - 支持面板拖拽移动
- 备忘录功能增强
  - 添加任务排序功能（按创建时间、更新时间、标题、完成状态）
  - 支持升序和降序排序
  - 实现任务搜索和过滤功能（全部、已完成、未完成）
  - 添加搜索和排序的UI控件

### 计划更新
- 备忘录功能增强
  - 支持面板大小调整功能
  - 添加任务优先级标记
  - 支持键盘快捷键操作
- 性能优化
  - 进一步优化渲染性能
  - 减少不必要的DOM操作
- 用户体验改进
  - 添加任务完成动画效果
  - 优化移动设备上的显示效果

## [1.4.0] - 2025-02-26

### 新增
- 添加备忘录功能
  - 支持创建、编辑和删除备忘录
  - 支持备忘录分类（工作、生活、学习、其他）
  - 实现持久化存储
  - 添加响应式UI设计
- 优化国际化支持，添加备忘录相关的多语言翻译
- 添加浮动操作按钮，提供快速访问功能

### 优化
- 改进UI交互体验
- 优化代码结构，提高可维护性
- 增强模块化设计

## [1.3.1] - 2024-02-26

### 修复
- 修复背景切换时日期跳动问题
- 优化背景切换动画
- 提高UI稳定性

### 优化
- 实现新的背景层机制，确保UI元素在背景切换时不会跳动
- 调整z-index层级，确保UI元素正确显示
- 优化CSS，支持新的背景层

## [1.3.0] - 2024-02-25

### 新增
- 添加设置面板UI
- 实现时间格式选择（12/24小时制）
- 实现温度单位切换（摄氏度/华氏度）
- 添加背景切换间隔设置
- 实现节假日显示功能
- 添加多语言支持（中文/英文）
- 实现用户自定义设置
- 支持自定义背景图片
- 添加本地缓存机制
- 实现离线功能支持

### 优化
- 优化性能和加载速度
- 改进用户界面交互体验

## [1.2.0] - 2024-02-24

### 新增
- 集成和风天气API
- 实现地理位置获取
- 添加当前天气状况显示
- 实现天气图标动画效果
- 添加天气预报显示
- 根据天气状况调整界面风格
- 实现天气缓存机制

## [1.1.0] - 2024-02-24

### 新增
- 实现背景图片轮播功能
- 添加更多精美的中国风景图片
- 优化时间和日期的显示样式
- 实现图片预加载功能
- 添加背景图片来源显示
- 实现平滑的过渡动画效果
- 添加节假日显示功能

## [1.0.0] - 2024-02-24

### 新增
- 项目初始化
- 创建基本框架
- 配置manifest.json
- 创建项目文档
- 实现基本的时间显示
- 实现日期显示
- 创建基本UI框架
- 设计和实现扩展图标
- 实现磨砂玻璃效果的现代化界面
- 实现农历显示
- 添加简单的背景图片

### 计划中
- 智能提醒功能
- 日程管理功能
- 智能建议系统
- 图片分享功能
- 社交媒体集成
