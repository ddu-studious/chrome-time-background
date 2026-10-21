# 调研文档索引

> 最后更新：2026-10-20

| 更新日期 | 文档 | 标题 |
|----------|------|------|
| 2026-10-20 | [research-aquarium-visual-tech-survey-20261020.md](research-aquarium-visual-tech-survey-20261020.md) | 水族馆视觉与“真实感”技术方向调研（按你列的四个方向：Blender；2D/生成艺术 p5.js·PixiJS·OGL；3D/空间体验 Babylon.js·Spline·Spark；奇妙视觉效果 TypeGPU·Shader·流体·粒子·声音·Hydra·TouchDesigner）：10 个库（含 three.js 基线）在真实 Chrome 156（品牌版、无头、隔离配置）里分别用默认 MV3 CSP 与加 `'wasm-unsafe-eval'` 的临时扩展逐个实测（干净：three / OGL / Babylon / tsParticles；要补丁或有副作用：PixiJS 须 `pixi.js/unsafe-eval`、p5 有被拦的 `eval` 且中文环境会请求 jsdelivr、TypeGPU；不行或不可采用：Hydra `EvalError` 且 AGPL、Spark 默认 CSP 下 0 像素而加 wasm 后 3734 / 3708 像素、Spline 无许可证且含 6 个 WASM 与外部服务地址）；CPU 稳定流体加海洋雪（96×54 网格、1500 粒子）每步约 0.5 ms（只量计算、机器负载高偏悲观）；Blender 只读文档、本机未安装（Digital Life 的鲨鱼/鲸/海龟模型不是 CC0、仅限非营利科研教育艺术用途、入口在 Sketchfab，未登录未下载）；19 条技术录像用 yt-dlp 核对了元数据与章节、没有看视频本身；X 没读到任何帖子（Playwright 浏览器被另一会话占用、镜像没有时间线，未绕过登录）；建议 A 档零依赖自写；你拍板后网页端已落地 A1–A4（默认关，见 technical `aquarium-ambient-20261020.md`），A5 因 Sketchfab 未登录未改剖面表；主 CSP 仍未放宽；文末补记了 X 帖逐帧与 Aurelia 手法；调研正文仍保留拍板前的结论 |
| 2026-10-20 | [research-aquarium-physical-realism-libs-20261020.md](research-aquarium-physical-realism-libs-20261020.md) | 水族馆“模仿真实世界”的 JS 库调研（你要求调研多种 JS 库）：把“真实”拆成转身体积 / 水里运动 / 群体追击三件事；three.js 0.186.1、matter-js、planck、cannon-es、Rapier、Jolt、Yuka 的版本、许可、体积与逐库判断（npm 元数据与本机下载实测；Rapier、Jolt 只看了 JS 包装层）；真实 Chrome 156 里实测本扩展 CSP 拒绝 `WebAssembly.compile`（Rapier / Jolt 必须放宽 CSP，未做、需你批准）；用 three.js 真 3D 模型当“真值”检验零依赖伪 3D 投影（IoU 90° 时小锤头鲨 0.980、鲸鲨 0.973，旧压扁画法 0.129 / 0.169；参照与投影共用同一份剖面数据，只证明实现与模型一致、不证明像真鱼）；结论：不引入任何依赖，转身用自写的 `js/aquarium-yaw.js`（见 technical 索引的 `aquarium-yaw-20261020.md`），选项 A–D 与未核对项写明；X 关键词搜索需要登录，未做 |
| 2026-10-19 | [research-aquarium-tide-size-drag-predation-20261019.md](research-aquarium-tide-size-drag-predation-20261019.md) | 水族馆潮起潮落、真实体长、拖拽游泳与大鱼吃小鱼调研：开源项目、论文与 Web 演示的取得方式、许可与借用边界（只借创意不借代码）、潮汐与涌浪的时间压缩、真实体长数据来源、被拴住的游泳者模型（弹簧—阻尼、转向限制、尾拍）、捕食者—猎物模型的生物学依据；X 关键词搜索需要登录，未做 |
| 2026-10-19 | [research-marine-realism-20261019.md](research-marine-realism-20261019.md) | 海洋动物写实化与水族馆海水效果调研（X 海洋动物 50 帖的取得方式——匿名 yt-dlp、未读用户 Cookie——与逐类结论、公开参考资料的使用边界、真实动物形态与运动依据、海水效果做法对照；结论：用自写的 2.5D 矢量骨架求值器让桌面与水族馆共用一份数据，海水做成水下视角的光层而不是侧面浪尖） |
| 2026-10-16 | [research-jellyfish-summon-assistant-20261016.md](research-jellyfish-summon-assistant-20261016.md) | 用桌面水母在浏览器之外唤出 / 驱动 AI 工作台：三层可行性（L0 全局快捷键唤出、L1 水母上直接对话、L2 通用浏览器操控）、现有链路盘点（引擎在 Service Worker、原生 `open` 路径与文字输入已存在）、原生 `RegisterEventHotKey` 与 Chrome `global` 命令两条路、`activeTab` 缺失导致落到独立小窗、原生来源提交文字的授权取舍；用户选定 L1（原生工作台）；`/tmp` 原型验证热键注册与送达（合成按键）、面板拿键盘焦点（24/24 + 偶发 4 次失败未定位）、输入法下回车提交、`Esc` 归还焦点；调研本身未改业务实现；同日 L1 已实现（见 technical 索引的 `native-assistant-workbench-20261016.md`），文末“九、实现后更正”记录被实测推翻的设想（热键注册返回“已存在”不代表被别的应用占用：两个进程注册同一组合都成功、都收到，跨应用冲突发现不了）、协议与文件名的差异和焦点重试的实际验证范围；真实键盘与真实 Chrome 整链路仍未验证 |
| 2026-10-16 | [research-jellyfish-drink-confirmation-20261016.md](research-jellyfish-drink-confirmation-20261016.md) | 水母“确认喝了水”调研：证据层级（只能确认“看到你举杯”而非“喝了水”）、自报 / 系统空闲时间 / 摄像头 + Apple Vision / 本地多模态模型 / 可穿戴 / 称重杯垫的对照；本机能力探测与 18 张 CC 授权照片的 Vision 小实验（手到嘴与嘴边容器两个信号互补，整帧有杯子不能当证据）、摄像头授权归属（宿主是 Chrome 的子进程，须用独立小 App）、分级路线与需获同意后才做的真机验证；没有打开过摄像头，未改业务实现 |
| 2026-10-12 | [research-native-popup-generated-ui-20261012.md](research-native-popup-generated-ui-20261012.md) | 原生弹窗提示 UI 的“自主编码”可行性调研（现状问题、U0–U4 四档方案、锁定 WKWebView 实测、生成耗时与质量；只调研，未改弹窗实现） |
| 2026-10-12 | [research-assistant-dynamic-tools-20261012.md](research-assistant-dynamic-tools-20261012.md) | AI 工作台“临时写代码 / 自主编写工具”可行性调研（pi 0.85.1、MV3/CWS 约束、沙箱方案、分阶段建议）；v1.1：A 档已实现为默认关闭的 `compute.run`，B/C 档仍不做 |
| 2026-08-22 | [research-player-recent-publish-switch-2026.md](research-player-recent-publish-switch-2026.md) | B 站与 YouTube 播放器最近发布切换调研（2026） |
| 2026-08-16 | [research-youtube-integration-2026.md](research-youtube-integration-2026.md) | YouTube Chrome 扩展集成调研（2026） |
| 2026-08-05 | [research-music-netease-enhanced-features.md](research-music-netease-enhanced-features.md) | 网易云音乐增强功能 API 调研报告 |
| 2026-08-05 | [research-music-artist-album-api.md](research-music-artist-album-api.md) | 网易云音乐歌手/专辑 API 调研报告 |
| 2026-05-24 | [research-agent-capability-building.md](research-agent-capability-building.md) | Agent 能力建设调研 v1.2（+Skills/MCP安装使用推荐指南+Phase 4进度更新） |
| 2026-05-11 | [research-writing-ai-autocomplete.md](research-writing-ai-autocomplete.md) | 写作空间 AI 智能联想调研 |
| 2026-05-11 | [research-task-form-demo-designs.md](research-task-form-demo-designs.md) | 任务编辑窗口设计方案 |
| 2026-05-11 | [research-qweather-hourly-forecast.md](research-qweather-hourly-forecast.md) | 和风天气逐小时预报 API 调研 |
| 2026-05-11 | [research-multi-agent-platform.md](research-multi-agent-platform.md) | 多 Agent 平台调研 |
| 2026-05-11 | [research-agent-ecosystem-2026.md](research-agent-ecosystem-2026.md) | AI Agent 生态调研 |
| 2026-04-16 | [research-daily-schedule-planner.md](research-daily-schedule-planner.md) | 每日时间计划表调研 |
| 2026-04-15 | [research-daily-worklog-timetracking.md](research-daily-worklog-timetracking.md) | 每日工作日志 & 时间追踪调研 |
| 2026-04-13 | [research-daily-websites-integration.md](research-daily-websites-integration.md) | 每日固定查看网站/信息聚合调研 |
| 2026-04-04 | [research-markdown-content-copy.md](research-markdown-content-copy.md) | Markdown 内容复制能力调研 |
| 2026-03-29 | [research-knowledge-wall-competitive.md](research-knowledge-wall-competitive.md) | 常用信息（知识墙）竞品调研 |
| 2026-03-25 | [research-bilibili-embed-alternatives.md](research-bilibili-embed-alternatives.md) | B 站视频嵌入技术方案调研 |
| 2026-03-22 | [research-extension-resource-usage.md](research-extension-resource-usage.md) | Chrome 扩展资源占用评估 |
| 2026-03-22 | [research-bilibili-offscreen-audio.md](research-bilibili-offscreen-audio.md) | 哔哩哔哩 Chrome 扩展集成技术调研 |
| 2026-03-22 | [research-bilibili-cookie-following.md](research-bilibili-cookie-following.md) | B 站 Cookie 共享与关注列表调研 |
| 2026-03-20 | [research-netease-api-v3.4.0.md](research-netease-api-v3.4.0.md) | 网易云音乐 Web API 调研 |
| 2026-03-20 | [research-kugou-music-chrome-extension-integration.md](research-kugou-music-chrome-extension-integration.md) | 酷狗音乐 Chrome 扩展集成调研 |
| 2026-03-18 | [research-standalone-music-player.md](research-standalone-music-player.md) | 独立音乐播放器与体验增强调研 |
| 2026-03-18 | [research-music-player-api-integration.md](research-music-player-api-integration.md) | 音乐播放器 API 集成调研 |
| 2026-03-18 | [research-keyword-alert.md](research-keyword-alert.md) | 热搜关键字监控报警调研 |
| 2026-03-17 | [research-music-player-integration.md](research-music-player-integration.md) | 音乐播放器控制功能调研 |
| 2026-03-17 | [research-music-player-advanced-features.md](research-music-player-advanced-features.md) | 音乐播放器高级功能调研 |
| 2026-03-05 | [research-search-enhancement.md](research-search-enhancement.md) | 书签智能搜索增强技术调研 |
| 2026-03-04 | [research-calendar-multi-day-tasks.md](research-calendar-multi-day-tasks.md) | 日历中多日/跨天任务展示调研 |
| 2026-03-04 | [research-bookmark-collection-review.md](research-bookmark-collection-review.md) | 网页收藏智能复习系统调研 |
| 2026-02-08 | [research-ui-consistency-audit.md](research-ui-consistency-audit.md) | UI 组件一致性审计 |
| 2026-02-08 | [research-ticker-sizing.md](research-ticker-sizing.md) | Ticker 尺寸优化调研 |
| 2026-02-08 | [research-ticker-experience-optimization.md](research-ticker-experience-optimization.md) | 滚动信息栏体验优化调研 |
| 2026-02-08 | [research-task-ticker.md](research-task-ticker.md) | 未完成任务滚动提醒条调研 |
| 2026-02-08 | [research-scrolling-ticker.md](research-scrolling-ticker.md) | 滚动信息栏调研与 PRD |
| 2026-02-08 | [research-multi-source-ticker.md](research-multi-source-ticker.md) | 多数据源滚动信息栏调研 |
| 2026-02-08 | [research-china-hot-trending-ticker.md](research-china-hot-trending-ticker.md) | 中国主流媒体热搜/热榜信息调研 |
| 2026-02-08 | [research-adaptive-readability.md](research-adaptive-readability.md) | 背景自适应可读性优化调研 |
| 2026-02-07 | [research-daily-recurring-tasks.md](research-daily-recurring-tasks.md) | 长期任务/每日重复任务展示调研 |
| 2026-02-05 | [research-calendar-worklog.md](research-calendar-worklog.md) | 日历面板回看完成工作调研 |
