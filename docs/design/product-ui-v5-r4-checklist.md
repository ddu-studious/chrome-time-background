# Product UI v5 真实 Chrome R4 逐页清单

> 基线：19 个业务、121 个页面。只有状态为 `R4` 且有真实 Chrome 视觉与交互证据，才视为该页完成；`R4-partial` 不计完成。
>
> 当前：52/121 页达到 `R4`，1 页为 `R4-partial`。YouTube 的连接、播放器与订阅链路已完成真实扩展验收；其余新增页当前最高为 R2/R3，启动台因新增第 21 个应用需重新完成真实扩展验收。

| 完成 | 业务 | 页面键 | 页面 | 状态 | 真实 Chrome 证据 / 下一缺口 |
| --- | --- | --- | --- | --- | --- |
| ✅ | 产品外壳 | `shell/home` | 默认首页 | R4 | 真实 Chrome 首屏在真实资讯、任务、音乐数据下视觉验收 |
| ✅ | 产品外壳 | `shell/today-overview` | 今日概览 | R4 | 真实 Chrome 打开、关闭并恢复首页 |
| ✅ | 产品外壳 | `shell/personalize` | 个性化首页 | R4 | 真实 Chrome 切换深度工作模板、保存、刷新恢复，并还原均衡工作台 |
| ✅ | 产品外壳 | `shell/focus` | 专注模式 | R4 | 真实 Chrome 启动计时、暂停、退出并恢复首页 |
| ✅ | 产品外壳 | `shell/offline` | 离线状态 | R4 | 真实 Chrome 预览离线恢复中心、重新检测网络并返回首页，关闭后焦点回到网络入口 |
| ✅ | 网易云音乐 | `music/now-playing` | 正在播放 | R4 | 真实 Chrome 使用登录后的真实歌曲、封面、歌词预览、播放进度与底部控制条完成视觉验收 |
| ✅ | 网易云音乐 | `music/queue` | 播放队列 | R4 | 真实 Chrome 查看真实队列、当前歌曲高亮、数量与逐项操作 |
| ✅ | 网易云音乐 | `music/playlist-library` | 歌单库 | R4 | 真实 Chrome 加载真实歌单封面、名称和歌曲数并进入详情 |
| ✅ | 网易云音乐 | `music/playlist-detail` | 歌单详情 | R4 | 真实 Chrome 打开真实 196 首歌单，检查头部、播放全部与歌曲列表 |
| ✅ | 网易云音乐 | `music/lyrics-immersive` | 沉浸歌词 | R4 | 真实 Chrome 检查真实歌词滚动、当前行高亮及持续播放进度 |
| ✅ | 网易云音乐 | `music/search` | 音乐搜索 | R4 | 真实 Chrome 输入 `moske` 获取真实结果，并验证歌曲/歌手结果切换 |
| ✅ | 网易云音乐 | `music/discover-fm` | 发现与私人FM | R4 | 真实 Chrome 查看真实推荐数据并启动私人 FM，歌曲自动进入播放 |
| ✅ | 网易云音乐 | `music/artist-album` | 歌手与专辑 | R4 | 真实 Chrome 从歌手结果打开工作区，检查热门歌曲、专辑、相似歌手；背景隔离、初始焦点与 Esc 关闭通过 |
| ✅ | 网易云音乐 | `music/connection-error` | 连接异常 | R4 | 真实 Chrome 预览接口失败页；提示稳定跨过实时轮询、背景退出无障碍树，焦点落到重新检测，点击后恢复原页面 |
| ✅ | 网易云音乐 | `music/more-sleep-timer` | 更多与睡眠定时 | R4 | 真实 Chrome 验证标准菜单语义、五个定时选项、方向键与 Esc 焦点返回；更多菜单可聚焦，未触发断开连接 |
| ✅ | 常用信息 | `knowledge/card-wall` | 卡片墙 | R4 | 真实 Chrome 加载 22 张真实卡片；弹窗打开后搜索框获得焦点，关闭后焦点回到 Dock 入口 |
| ✅ | 常用信息 | `knowledge/search-filter` | 搜索筛选 | R4 | 真实 Chrome 输入 `RAG` 后收敛为 2 张匹配卡片，输入值、结果数量与焦点状态一致 |
| ✅ | 常用信息 | `knowledge/detail-inspector` | 详情检查器 | R4 | 真实 Chrome 从安全的学习卡片打开三栏详情，相关内容、内容属性与返回入口完整，初始焦点落在返回按钮 |
| ✅ | 常用信息 | `knowledge/create-edit` | 新建与编辑 | R4 | 真实 Chrome 从详情进入全屏编辑器，标题和 Markdown 内容正确回填、焦点落到标题；取消后未修改真实数据并返回原卡片 |
| ✅ | 常用信息 | `knowledge/timeline` | 时间线 | R4 | 真实 Chrome 切换本周时间线；真实数据为空时显示居中空态、统计为 0，布局无溢出且标签焦点正确 |
| ✅ | 常用信息 | `knowledge/graph-dashboard` | 图谱与仪表盘 | R4 | 真实 Chrome 验证 22 张卡片、106/117 任务、11 节点/9 关系；关系图连线、指标卡与类型分布均可见且无溢出 |
| ✅ | B站 | `bilibili/recommend` | 推荐 | R4 | 真实 Chrome 加载登录态个性化推荐，切换后推荐按钮状态、换一换和真实视频列表一致 |
| ✅ | B站 | `bilibili/player` | 播放器 | R4 | 真实 Chrome 从 `RAG` 搜索结果打开 BV1JLN2z4EZQ，嵌入播放器、正在播放信息、倍速/画质栏和观看记忆均进入真实状态 |
| ✅ | B站 | `bilibili/course` | 课程 | R4 | 真实 Chrome 读取已购课程并在左侧展示 178 课时 ComfyUI 课程，课程/已购/发现入口完整 |
| ✅ | B站 | `bilibili/library` | 收藏库 | R4 | 真实 Chrome 读取默认收藏夹及 5 条真实收藏视频，列表、文件夹计数和播放入口一致 |
| ✅ | B站 | `bilibili/history-ranking` | 历史与排行 | R4 | 真实 Chrome 历史页出现刚播放的 RAG 视频，并切换排行榜读取 20 条实时排行；两种状态共用同一工作台且无溢出 |
| ✅ | B站 | `bilibili/search` | 搜索 | R4 | 真实 Chrome 在工作台内输入 `RAG`，返回多条真实 B 站结果；输入值、搜索焦点和结果列表一致，未误跳外部页 |
| ✅ | B站 | `bilibili/login-error` | 登录异常 | R4 | 不退出真实账号地模拟登录失效，验证三步恢复、隐私说明和重新检测；检测成功后错误页退出、恢复默认收藏夹且焦点回到收藏入口 |
| ✅ | YouTube | `youtube/connect` | 连接 | R4 | 真实 `chrome-extension://` 页面重载后显示“已连接 · 只读”，并通过只读 OAuth 加载真实订阅频道；未读取 youtube.com Cookie |
| ⬜ | YouTube | `youtube/recommended` | 为你推荐 | R2 | 已实现订阅频道近期公开视频聚合并标明非 YouTube 首页算法；待真实 OAuth、API 数据和扩展页视觉验收 |
| ⬜ | YouTube | `youtube/trending` | 兴趣趋势 | R2 | 已实现中华文化圈/欧美/泛亚 4:3:3 配额（8/6/6）、三层渐进加载、卡片圈层标签和单层失败保留；每层继续使用官方评分、HD/非直播、质量门槛、频道去重与 Shorts 过滤。待真实 OAuth、实际配比、内容质量和扩展页视觉验收 |
| ✅ | YouTube | `youtube/player` | 播放器 | R4 | 真实扩展加载官方 iframe 无 error 153；外部进度条、±10 秒、0.75–2 倍速与 J/K/L 快捷键通过 IFrame API 同步，1.5 倍速得到播放器回执。清晰度明确留在原生菜单。频道来源视频可一键返回原频道列表；移除外层实时背景模糊并隔离 iframe 合成层后，两轮 PageDown/PageUp 中播放器、控制条和元信息均保持稳定 |
| ✅ | YouTube | `youtube/subscriptions` | 订阅 | R4 | 真实账号加载 50 个订阅频道；已验收“磊哥聊政经”频道卡进入最近更新、视频进入播放器及一键返回原频道列表，返回时保留列表上下文 |
| ⬜ | YouTube | `youtube/library` | 资料库 | R3 | 播放列表、喜欢、搜索结果及全部内容页已统一支持方框/列表布局并持久化偏好；播放列表卡可进入内容。待真实扩展点击、重载与窄屏验收 |
| ⬜ | YouTube | `youtube/local-queue` | 本地清单 | R2 | 已实现本地稍后看、学习清单和移除动作，不写入 YouTube；待本地浏览器与扩展持久化验收 |
| ⬜ | YouTube | `youtube/search` | 搜索 | R2 | 已实现显式搜索与链接/视频 ID 直达；待真实配额、结果和扩展页验收 |
| ⬜ | YouTube | `youtube/error` | 异常恢复 | R2 | 已区分 OAuth 未配置、授权过期、配额耗尽和后台不可用；待真实故障注入验收 |
| ✅ | 计划管理 | `schedule/day-view` | 日视图 | R4 | 真实 Chrome 验证 0 项计划、4 条真实例程、完成率摘要和分类时长；面板初始焦点落在“日”标签，焦点循环不越出模态面板 |
| ✅ | 计划管理 | `schedule/week-view` | 周视图 | R4 | 真实 Chrome 验证第 33 周七日时间网格、06:00–23:00 刻度和每日 4 条例程；日/周切换后焦点保留在当前标签且布局无溢出 |
| ✅ | 计划管理 | `schedule/create-edit` | 新建与编辑 | R4 | 真实 Chrome 打开添加计划表单，名称输入自动聚焦；Escape/取消返回“添加计划”且今日仍为 0 项，没有写入测试计划 |
| ✅ | 计划管理 | `schedule/routines` | 例行计划 | R4 | 真实 Chrome 显示晨跑、英语阅读、冥想、睡前总结 4 条真实习惯及编辑/删除语义；初始焦点在添加习惯，Escape 返回管理入口 |
| ✅ | 计划管理 | `schedule/conflict` | 冲突处理 | R4 | 真实 Chrome 用 06:30–07:00 无保存表单触发与晨跑冲突，建议 07:00–07:30；返回并取消后仍为 0 项计划，未写入存储 |
| ✅ | 计划管理 | `schedule/completed-day` | 完成日 | R4 | 仅在内存中模拟 4/4 后，真实 Chrome 验证 100% 圆环、1h40m、一句话复盘和完成例程；随后恢复原始 0/4，未调用存储保存 |
| ✅ | 工作日志 | `worklog/daily-list` | 每日列表 | R4 | 真实 Chrome 验证 2026-08-10 的 0 条记录、0m、0% 与三栏工作台；初始焦点落到描述输入框，主面板关闭后回到可见 Dock 入口 |
| ✅ | 工作日志 | `worklog/active-timer` | 活动计时 | R4 | 仅在内存中模拟进行中计时，真实 Chrome 验证递增时长、停止按钮和活动计时页面语义；重新加载扩展后恢复真实 00:00/开始计时，未生成日志或写入计时状态 |
| ✅ | 工作日志 | `worklog/manual-entry` | 手动记录 | R4 | 真实 Chrome 验证描述、项目、任务、时长、日期和优先级字段；描述自动聚焦，Escape 取消且焦点回到手动录入按钮，没有保存记录 |
| ✅ | 工作日志 | `worklog/quadrant` | 四象限 | R4 | 仅在内存中加入四种优先级样例，真实 Chrome 验证四象限各 1 项、2h30m、31% 与 1 个活跃项目；随后重载恢复真实 0 条数据 |
| ✅ | 工作日志 | `worklog/weekly-report` | 周报 | R4 | 真实 Chrome 验证 2026-08-10~16 七日空周报、0m/0 条/0 项目与复制入口；Escape 关闭后焦点回到周报按钮 |
| ✅ | 工作日志 | `worklog/projects` | 项目 | R4 | 真实 Chrome 验证未分类、IQIYI、持续向前三个真实项目及新增项目表单；未修改项目，Escape 关闭后焦点回到项目按钮 |
| ✅ | 写作空间 | `writing/library` | 文稿库 | R4 | 真实 Chrome 验证 95 篇、292,605 字、11 类目与真实标签的三栏文稿库；搜索框自动聚焦，文章行升级为可键盘操作的按钮，关闭后焦点回到写作 Dock |
| ✅ | 写作空间 | `writing/editor` | 编辑器 | R4 | 真实 Chrome 打开 2,107 字真实文章的 Markdown/实时预览双栏编辑器，标题自动聚焦；仅查看后返回，没有保存或改写文章 |
| ✅ | 写作空间 | `writing/preview` | 预览 | R4 | 真实 Chrome 验证真实文章标题、思想史分类、Hermes 标签、正文排版、编辑/复制/置顶/版本/删除入口；返回按钮获得初始焦点 |
| ✅ | 写作空间 | `writing/ai-assistant` | AI助手 | R4 | 真实 Chrome 验证当前文章级 AI 设置、Qwen 3 235B、温度、Token、提示词和 RAG 配置；未保存配置，Escape 后焦点回到设置按钮 |
| ✅ | 写作空间 | `writing/knowledge-citation` | 知识引用 | R4 | 真实 Chrome 验证知识服务未连接时仍保留概览/搜索/浏览/图谱与重新连接恢复态；修复通用 `.kw-panel` 把面板保持透明的 CSS 冲突，关闭后焦点回到知识库入口 |
| ✅ | 写作空间 | `writing/version-history` | 版本历史 | R4 | 真实 Chrome 验证当前文章 0 个可恢复版本的真实空历史、当前版本预览和禁用恢复按钮；未恢复版本，Escape 后焦点回到版本入口 |
| ✅ | 写作空间 | `writing/sync-error` | 同步异常 | R4 | 仅在内存中显示 Hermes 异常恢复页，真实 Chrome 验证 95 篇本地文章安全保留、远端等待、继续本地与重试说明；选择继续本地后文章数仍为 95，未触发重试 |
| ⬜ | 任务 | `tasks/list` | 列表 | R3 | Chrome 本地真实页面已验收 6 条样例按今天/逾期/即将到期/以后与无日期/完成分组，含负责人、等待与归档筛选；完成项在 6.5 秒撤销期保持可见，归档/删除/完成分离；480px 页面无横向溢出且表格局部滚动。待扩展真实任务与重载 |
| ⬜ | 任务 | `tasks/kanban` | 看板 | R3 | 本地真实页面已验收待处理/进行中/等待/完成四列、进行中 3/3 容量、拖拽与键盘下拉移动；移动到完成出现撤销条并保持任务可见。待扩展真实分布与持久化 |
| ⬜ | 任务 | `tasks/calendar` | 日历 | R3 | 本地真实页面已验收当月 42 格、无日期任务区、快捷安排日期，以及每一天“日期+任务数+高/中/低/空负载”的可读提示；待扩展真实日期分布 |
| ⬜ | 任务 | `tasks/analytics` | 分析 | R3 | 本地真实页面已验收 6 总量、17% 完成率、准时率、7 日趋势、4 档优先级、分类任务量和逾期/阻塞原因；待扩展真实统计 |
| ⬜ | 任务 | `tasks/detail` | 详情 | R3 | 本地真实页面已验收 65% 任务、2 项子任务、负责人/附件、关联计划与日志、评论空态、最近活动，以及编辑/归档/删除独立动作；dialog/inert、Tab/Esc 和精确返回通过。待扩展真实详情 |
| ⬜ | 任务 | `tasks/create` | 新建 | R3 | 本地真实页面已验收新建与编辑共用表单、当天/次日默认、负责人/进度/首个子任务、最多 3 张 1MB 图片、日期和附件校验；1280/480px 均通过，窄屏表单内部滚动且取消后仍为 6 条。待扩展真实保存/重载 |
| ⬜ | 任务 | `tasks/recurring-habits` | 周期习惯 | R3 | 本地真实页面已验收每周规则、连续完成、下次实例、暂停/继续和跳过本次撤销；主备忘录规范化器已保留周期状态字段。待扩展持久化 |
| ⬜ | 任务 | `tasks/search-empty` | 搜索空状态 | R3 | 本地真实页面已验收当前查询/筛选条件、拼写与扩大范围建议、清除条件、查看已归档和恢复列表焦点；待扩展真实搜索 |
| ✅ | 快捷导航 | `quick-nav/default` | 默认导航 | R4 | 真实 Chrome 从启动台打开，聚焦搜索框，关闭后焦点返回 |
| ⬜ | 快捷导航 | `quick-nav/command-search` | 命令搜索 | R3 | Chrome 本地真实页面以 6 个明确网址验证结果计数、无命中提示与清空恢复；`<img onerror>` 只按文本显示且无脚本弹窗；未按 Enter、未打开外链，待真实扩展复核 |
| ⬜ | 快捷导航 | `quick-nav/create-edit` | 新建与编辑 | R3 | Chrome 本地真实页面验证二级页独占内容、首焦点，以及名称/网址空值、非 HTTP(S) 和重复网址的聚焦错误；合法 `example.org/test` 保存后焦点落到新卡片，删除可撤销并恢复原位置；重载夹具还原数据，待扩展 storage 复核 |
| ⬜ | 快捷导航 | `quick-nav/import-empty` | 导入与空状态 | R3 | Chrome 本地真实页面验证非法对象报“JSON 顶层必须是数组”、合法 URL 自动补 HTTPS，恶意 id/图标/颜色净化为安全默认；空库添加/导入入口完整；360×720 双列卡片和常驻操作按钮无溢出，待真实扩展复核 |
| ⬜ | 今日阅读 | `reading/review-queue` | 复习队列 | R3 | Chrome 本地真实页面已验收三栏、空态、统计与 820px 响应式；待扩展真实书签队列复核 |
| ⬜ | 今日阅读 | `reading/detail` | 阅读详情 | R3 | Chrome 本地真实页面已从键盘卡片进入详情，确认未点击不外跳；待扩展中明确点击原文跳转 |
| ⬜ | 今日阅读 | `reading/permission` | 权限提示 | R3 | 本地真实页面已验收阅读专用目录选择：无需 AI/API Key、未授权只显示明确授权按钮、授权后 3 个样例目录、全不选校验、保存同步、520px 布局、Tab 闭环、Esc 焦点返回及启动台 inert 交接；待真实扩展系统权限与真实目录复核 |
| ⬜ | 今日阅读 | `reading/complete-feedback` | 完成反馈 | R3 | Chrome 本地真实页面已验收三项真实 SRS 字段和继续/历史入口；待扩展真实反馈落盘 |
| ⬜ | 今日阅读 | `reading/history-stats` | 历史统计 | R3 | Chrome 本地真实页面已验收四项统计、活动柱与历史记录；待扩展真实历史数据复核 |
| ⬜ | 诗词电台 | `poetry/mini-player` | 迷你播放器 | R3 | Chrome 本地真实页面已验收键盘入口、当前句/进度、播放/收藏状态语义和 480px 宽度约束；待扩展后台真实诗词状态复核 |
| ⬜ | 诗词电台 | `poetry/full-text` | 全文 | R3 | Chrome 本地真实页面已验收逐句进度、真实队列、首焦点、dialog/inert、Tab 闭环、Esc 关闭与焦点恢复；待扩展系统中文语音朗读验证 |
| ⬜ | 诗词电台 | `poetry/annotation` | 注释赏析 | R3 | Chrome 本地真实页面已验收译注/赏析/作者三态、来源不足诚实空态及独立诗句收藏；待扩展后台真实注释数据复核 |
| ⬜ | 诗词电台 | `poetry/favorites` | 收藏 | R3 | Chrome 本地真实页面已验收本地收藏、搜索、朝代筛选、结果计数及播放状态复用；待扩展真实收藏写入与重载复核 |
| ⬜ | 诗词电台 | `poetry/voice-settings` | 语音设置 | R3 | Chrome 本地真实页面已验收草稿/应用边界、音色/语速/音高/停顿/本地背景声/睡眠定时、持久化、焦点反馈及 1280/480px 布局；待系统中文音色与背景声实际试听 |
| ⬜ | Agent矩阵 | `agent/overview` | 总览 | R3 | 内置浏览器桌面/480px 验收同一 `竞品研究周报 · RUN-0822` 的 4 Agent、运行流水线、资源、产物、健康与人工确认；待真实 Bridge Agent 列表复核 |
| ⬜ | Agent矩阵 | `agent/active` | 运行中 | R3 | 验收 Analyst 当前步骤、流式输出、工具调用、上下文、产物与只读确认；暂停→继续状态独立于取消，待真实 Agent 运行流复核 |
| ⬜ | Agent矩阵 | `agent/create` | 创建Agent | R3 | 验收模板、角色目标、模型工具、最小权限和创建前测试五步；测试通过不伪造 Bridge 创建，待实际创建 |
| ⬜ | Agent矩阵 | `agent/flow-canvas` | 流程画布 | R3 | 验收 Researcher→Analyst→Writer→Reviewer 节点、输入输出、证据条件分支、v3 版本与运行预览；待 Bridge 实际运行 |
| ⬜ | Agent矩阵 | `agent/run-logs` | 运行日志 | R3 | 验收运行列表、事件表、Token/耗时、错误上下文，以及仅重试 `compare_evidence` 失败步骤而不重跑整流；待真实 SSE 日志流 |
| ⬜ | Agent矩阵 | `agent/collaboration` | 协作 | R3 | 验收四 Agent 交接链、共享上下文、冲突、团队消息及“人工确认不是错误”；批准只读访问后运行继续，待多角色真实协作 |
| ⬜ | Agent矩阵 | `agent/connection-error` | 连接异常 | R3 | 验收服务/模型/工具/本地数据诊断、受影响与仍可用范围；断连保留运行记录、产物和配置草稿，待真实 Bridge 断连重连 |
| ✅ | AI对话 | `ai-chat/default` | 默认对话 | R4 | 既有真实 Chrome 证据：打开聚焦输入框，关闭后内容移出无障碍树且焦点返回 Dock；本轮内置浏览器补验固定评审会话、工作区/模型/当前 Agent、双附件、建议问题和上下文配额 |
| ⬜ | AI对话 | `ai-chat/code-answer` | 代码回答 | R3 | 内置浏览器验收用户问题、文件引用、Markdown 代码块、独立复制/应用按钮、运行结果和风险；无安全补丁端点时明确阻止写入。待 VIP Brain 真实代码回复与 Chrome 扩展复核 |
| ⬜ | AI对话 | `ai-chat/multi-agent` | 多Agent协作 | R3 | 内置浏览器验收任务拆解、三份独立 Agent 证据、人工勾选、合并预览与“不自动并发外发”边界；待真实已配置 Agent 与 Chrome 扩展复核 |
| ⬜ | AI对话 | `ai-chat/config-drawer` | 配置抽屉 | R3 | 内置浏览器验收模型、温度、上下文、System Prompt、读取/浏览器/写入工具权限与即时预览；未写入真实配置，待安全配置与 Chrome 扩展复核 |
| ⬜ | AI对话 | `ai-chat/history` | 历史会话 | R3 | 内置浏览器验收按日期与 Agent 分组、搜索、标签、归档/恢复、分组导出；夹具离页恢复预览数据。待持久真实会话与 Chrome 扩展复核 |
| ⬜ | AI对话 | `ai-chat/error-recovery` | 错误恢复 | R3 | 内置浏览器验收失败阶段、已生成片段保留、从失败处重试、切换模型和配置诊断；流式停止后已有内容保留。待真实请求失败/恢复与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/role-editor` | 角色编辑 | R3 | 内置浏览器验收产品体验评审官、`v2.4.0-draft`/已发布 `v2.3.0`、7 个结构字段、三项固定变量、保存草稿与保存发布分离；1280/480px 主操作可达。待 Bridge 真实角色与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/live-preview` | 实时预览 | R3 | 内置浏览器实际运行测试，验收测试输入、编译后 Prompt、GPT-5.6 输出预览、Token 估算和最近测试记录；测试不发布草稿。待真实模型/Bridge 与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/version-diff` | 版本对比 | R3 | 内置浏览器验收版本选择、作者/时间/影响范围、七字段逐段差异与恢复预览；恢复前自动保存当前草稿副本。待 Bridge 真实历史版本与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/save-version` | 保存版本 | R3 | 内置浏览器验收版本号、变更说明、兼容性、个人/工作区/全局范围、结构/变量/敏感项校验和确认门槛；未提交发布。待 Bridge 实际保存发布与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/import-export` | 导入导出 | R3 | 内置浏览器验收文件预览、字段映射、备份覆盖/数组合并/跳过冲突、JSON/YAML/Markdown 格式与默认密钥/用户数据脱敏；导入只填充编辑器。待真实下载/文件选择与 Chrome 扩展复核 |
| ⬜ | Prompt管理 | `prompt-manager/offline-error` | 离线异常 | R3 | 内置浏览器验收本地草稿/远端发布双副本、冲突摘要、离线可用范围、导出/重试/三种恢复选项；离线点击安全合并明确不执行。待 Bridge 恢复后的真实合并与 Chrome 扩展复核 |
| ⬜ | 游戏 | `games/launcher` | 游戏启动器 | R3 | Chrome 本地真实页面已验收三款真实入口、背景 inert、首焦点与数据范围；待扩展协议页复核 |
| ⬜ | 游戏 | `games/snake` | 贪吃蛇 | R3 | Chrome 本地真实页面已验收画布、方向输入、暂停、重开、Esc 关闭及 aria 同步；待真实最高分持久化 |
| ⬜ | 游戏 | `games/tetris` | 俄罗斯方块 | R3 | Chrome 本地真实页面已验收平移、旋转、硬降、暂停、重开、Esc 关闭及 aria 同步；待真实计分长局 |
| ⬜ | 游戏 | `games/voxel` | 立体方块 | R3 | Chrome 本地真实页面已验收 WebGL2 3D 与 Canvas 2D 降级、键盘、暂停、重开和关闭；待扩展协议硬件回归 |
| ⬜ | 游戏 | `games/pause-gameover` | 暂停与结束 | R3 | Chrome 本地真实页面已验收 GAME OVER、本局信息、返回游戏/大厅及 Esc 分层返回；待真实内核结束事件联动 |
| ⬜ | 游戏 | `games/settings-help` | 设置与帮助 | R3 | Chrome 本地真实页面已验收键盘/声音/降级三类说明、三款入口与 Esc 返回大厅；待真实音效偏好 |
| ⬜ | 应用启动台 | `launchpad/all-apps` | 全部应用 | R3 | 原 20 应用已完成真实扩展验收；新增 YouTube 后注册表为 21 应用，需重新复核新卡片、打开/关闭和焦点回归 |
| ⬜ | 应用启动台 | `launchpad/category` | 分类 | R4-partial | Chrome 本地真实页面已完整验收休闲分类 aria-pressed、4 项真实入口与计数；待扩展协议页补同链路记录 |
| ⬜ | 应用启动台 | `launchpad/search` | 搜索 | R3 | Chrome 本地真实页面已验收“音乐”唯一命中网易云、无结果空态及搜索后固定保持筛选；待扩展协议页复核 |
| ⬜ | 应用启动台 | `launchpad/pin-order` | 固定与排序 | R3 | Chrome 本地真实页面已验收 AI 对话 7→8→7 固定恢复、焦点保持，以及计划管理后移/前移并恢复原顺序；新增键盘排序替代拖拽；待 sync/local 重载 |
| ⬜ | 应用启动台 | `launchpad/dock-menu` | Dock菜单 | R3 | Chrome 本地真实页面已验收真实右键打开、8 个单选效果、重置项、上下/Home/End/Esc 和焦点返回入口；待扩展协议持久化 |
| ⬜ | 热榜资讯 | `ticker/compact` | 紧凑栏 | R3 | Chrome 本地真实页面已验收 4 条明确样例、双份无缝迷你轨、关键词高亮和前后切换；待真实在线来源 |
| ⬜ | 热榜资讯 | `ticker/expanded` | 展开列表 | R3 | Chrome 本地真实页面已验收 4 条、4 个筛选、表格/精选/AI 洞察入口、精选 4 卡、aria-pressed、dialog/inert 和首焦点；待在线数据 |
| ⬜ | 热榜资讯 | `ticker/sources` | 数据源 | R3 | Chrome 本地真实页面已验收 40 来源、3 个已选、“知乎”双命中、搜索和 Esc 关闭；未应用写入，待真实刷新 |
| ⬜ | 热榜资讯 | `ticker/keywords` | 关键词 | R3 | Chrome 本地真实页面已验收 AI/网易云添加删除恢复、面板 aria 同步和 Esc；移除鼠标移出误关闭；待后台扫描通知 |
| ⬜ | 热榜资讯 | `ticker/detail-favorite` | 详情与收藏 | R3 | Chrome 本地真实页面已验收来源/热度/同源推荐、明确外链动作、收藏 false→true→false、焦点保持和 Esc；待真实条目持久化 |
| ⬜ | 热榜资讯 | `ticker/loading-error` | 加载异常 | R3 | Chrome 本地真实页面已验收 3 来源失败说明、重试/保留、收藏与规则保护、首焦点和 Esc；待真实请求失败/恢复 |
| ⬜ | 设置 | `settings/appearance` | 外观 | R3 | Chrome 本地真实页面已验收时间、日期、天气和主题表单层级、当前页语义及无横向溢出；本轮确认时间格式、4 个开关、温度、城市、主题与语言均有可读名称和键盘焦点样式；待扩展 sync 重载复核 |
| ⬜ | 设置 | `settings/homepage` | 首页 | R3 | Chrome 本地真实页面已验收信息展示、每日计划、工作日志三段聚合及切页回页首；待扩展真实开关写入 |
| ⬜ | 设置 | `settings/dock` | Dock | R3 | Chrome 本地真实页面已验收 7→8→7 固定选择、保存与刷新恢复；保存算法改为保留既有顺序/分组并只增删选择项；待扩展真实分组配置重载 |
| ⬜ | 设置 | `settings/data-privacy` | 数据与隐私 | R3 | Chrome 本地真实页面已验收导入初始禁用、重置准备首焦点、取消不写入与焦点返回；导入增加 schema/version 校验；本轮补齐文件标签/原子状态播报，重置准备在离页或 Esc 后自动收起并精确返回，520px 状态反馈仍可见；待扩展下载、文件选择和确认写入 |
| ⬜ | 设置 | `settings/integrations` | 集成 | R3 | Chrome 本地真实页面已验收 8 个壁纸来源、默认 2 个启用、未启用来源不暴露 Key 输入及无横向溢出；本轮为全部来源开关与 6 个密钥输入补齐唯一可读名称（如 `Pexels API Key`）；未修改密钥或来源 |
| ⬜ | 设置 | `settings/shortcuts` | 快捷键 | R3 | Chrome 本地真实页面已验收 4 张真实快捷键卡与快速上手/功能总览/快捷键/高级功能说明复用；待扩展实际快捷键逐项回归 |
| ⬜ | 设置 | `settings/about-diagnostics` | 关于与诊断 | R3 | Chrome 本地真实页面已验收性能/关于/诊断三段；注册表现为 121 页，localStorage 降级、外部网络未访问及切页回页首；待扩展上下文、版本和 storage 复核 |
