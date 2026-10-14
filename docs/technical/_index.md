# 技术文档索引

> 最后更新：2026-10-14

| 更新日期 | 文档 | 标题 |
|----------|------|------|
| 2026-10-14 | [huya-app-20261011.md](huya-app-20261011.md) | 虎牙直播 App：关注列表（后台标签页读取虎牙页面，本地搜索与按人气排序）、热门推荐、官方嵌入播放器（宽屏 / 网页全屏 / 弹窗观看）、站外试看限制调研、小老虎图标，以及本机最近观看 / 继续观看、关注自定义分组与“弹窗优先”（第四轮起默认开启，避开内嵌试看限制）；第五轮：弹窗新建或复用后替用户点虎牙自己的“剧场模式”按钮（逐文档注入页内函数、有界等待、失败保持默认布局，不新增权限） |
| 2026-10-14 | [extension-reload-and-page-open-20261014.md](extension-reload-and-page-open-20261014.md) | 扩展重新加载与首页打开提速：Chrome 递归扫描整个扩展目录（7.3 万文件 → 重载 11–20 秒）的实测根因、`uv` 缓存外移（约 6.4 秒）与 Laya 的 Python 环境外移（`LAYA_VENV_DIR`，约 4.0 秒，含迁移验证与启动耗时对照）、符号链接无法绕过的实验、壁纸列表陈旧可用与预热下一张（常规打开约 0.25 秒出图，冷启动不变）、Font Awesome 本地化（仅健壮性、无稳态提速）；StepAudio 环境外移待决定 |
| 2026-10-14 | [assistant-quick-overlay-ready-20261014.md](assistant-quick-overlay-ready-20261014.md) | 快捷助手页内浮层被误判失败后改开独立小窗：`assistant_ready` 排在数据加载之后而超出宿主 4 秒窗口的根因，就绪信号提前、首页宿主脚本提到 `<head>`、`getContexts` 有界探测、回退原因日志（`system/assistant-popup`）；第二轮（下午复发，真实日志两条 `home-ready-timeout` 4008/4142 ms）：iframe 晚到而主线程空闲的复现、就绪上限放宽到 15 秒、400 ms 载入提示、后台等待窗口 10/20 秒、`err` 诊断与 `assistant-slow-open` 慢打开记录、变异检查；第三轮（傍晚，普通网页 `page-overlay-unavailable` 8 ms 复发）：排除企业策略 / 全局快捷键 / 重载遗留标记，真实 Chromium 逐类页面实测发现 XML/SVG 文档里宿主自己崩溃与 CSP sandbox 页面白等 15 秒并改为立即拒绝后开小窗（`page-unsupported-document` / `page-opaque-origin`）、初始化标记后置、失败原因固定类别日志（`<阶段>:<类别>;tab;disc;win`，不记原文）、首页展示被拒与意外异常兜底（`overlay-error`）、慢打开带宿主诊断；真实 Chromium 复现与验证，系统负载下的真实原因为推断，该次页面的真实原因仍未知，真实 Chrome 156 未验证 |
| 2026-10-12 | [local-ai-service-restart-20261012.md](local-ai-service-restart-20261012.md) | 本机 AI 服务脚本 `restart` 偶发 `Bootstrap failed: 5` 的根因（launchd 日志证实 `bootout` 先于旧进程退出返回）与修复（等待卸载、仅对 5 号错误有限重试、就绪等待 30 秒并输出进程/端口/日志诊断）；“入口未就绪”未定位原因；npm `allowScripts` 登记与 `npm audit` 结论（均为 pi 子依赖，未升级） |
| 2026-10-12 | [assistant-compute-sandbox-20261012.md](assistant-compute-sandbox-20261012.md) | AI 工作台只读代码计算 `compute.run`（默认关闭）：本机服务内 `node --permission` 子进程 + QuickJS-WASM（固定 0.32.0）、有界 WebAssembly 内存、Gateway 开关/预算/取消、Todo 验收规则；本机模型暴露的规划输出偏差修复（数组信封、复述待办清单、提醒统计类提问、动作词误判）与评测结果 |
| 2026-10-12 | [assistant-todo-protocol-20261008.md](assistant-todo-protocol-20261008.md) | Todo 阶段合同与有界错误恢复；推荐类请求的分析阶段空清单修复（outline 不带偏好/记忆、失败重试条款、歌单推荐路径）；分析阶段追问后的补充答复沿用原始目标与原文分项；用户手动点候选（“+”/播放）后以真实起播回执勾选“加入本地队列”Todo |
| 2026-09-29 | [plan-assistant-speed-20260929.md](plan-assistant-speed-20260929.md) | AI 工作台提速实现计划 |
| 2026-09-29 | [assistant-speed-20260929.md](assistant-speed-20260929.md) | AI 工作台提速：思考档位起步策略、无进展保护、队列播放快速路径与清单分析关闭思考起步（2026-10-12） |
| 2026-08-16 | [guide-youtube-oauth-setup.md](guide-youtube-oauth-setup.md) | YouTube OAuth 配置与验收指南 |
| 2026-05-26 | [plan-writing-rag-and-agent-capability-v2.md](plan-writing-rag-and-agent-capability-v2.md) | 写作空间 RAG 联想与 Agent 能力建设 v2 |
| 2026-05-26 | [plan-dock-agent-capability-v1.md](plan-dock-agent-capability-v1.md) | Dock 优化与 Agent 能力建设功能落地文档 |
| 2026-05-25 | [plan-graphsphere-execution-v0.2.md](plan-graphsphere-execution-v0.2.md) | GraphSphere Demo Sprint 执行计划 v0.2 |
| 2026-05-25 | [arch-graphsnapshot-schema-v1.md](arch-graphsnapshot-schema-v1.md) | GraphSnapshot Schema v1（冻结） |
| 2026-05-25 | [graphsnapshot-schema-v1.json](graphsnapshot-schema-v1.json) | GraphSnapshot JSON Schema（机器可读） |
| 2026-05-11 | [guide-multi-role-agent.md](guide-multi-role-agent.md) | 多角色 Agent 开发指南 |
| 2026-03-17 | [guide-vectorization-search.md](guide-vectorization-search.md) | 向量化搜索指南 |
| 2026-01-31 | [guide-storage-api.md](guide-storage-api.md) | Chrome Storage API 使用指南 |
