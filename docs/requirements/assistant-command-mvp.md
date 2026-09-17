# 快捷助手 MVP

> 工具编排已升级，见 [按需工具与逐步决策 v1](../design/assistant-adaptive-tools-v1.md)。以下保留第一版记录。

> 已升级轻量入口、拼音匹配与歌曲/歌手/歌单三类对象，最新说明见 [轻量助手实现](../design/assistant-v2-implementation.md)。下文保留第一版的范围与验收记录。

## 使用入口

- Chrome 扩展图标右键 →「快捷助手 · @ 应用 / 动作」。
- 主页 Dock / 全部应用中的「快捷助手」。既有自定义 Dock 可从全部应用手动固定。
- 在 Chrome 扩展快捷键设置中，为「唤出或收起快捷助手」绑定按键。四个旧默认快捷键保留，新增命令初始未绑定。
- 入口使用独立扩展小窗，不依赖当前网页注入权限；再次按键时，若小窗已聚焦则收起，否则恢复聚焦。

## 交互

`@` 选择音乐、闹钟、哔哩哔哩或 YouTube；`/` 根据已选应用列出动作。支持中文别名和直接自然语言。
方向键选择、Tab/Enter 补全、Enter 执行、Shift+Enter 换行。中文输入法确认不提交。
Esc 先关闭建议列表，再收起窗口。停止执行和收起窗口分别处理。
歌曲和视频使用真实候选，支持点击或回复「第二个」。闹钟先显示具体时间和时区，点击确认才保存。
当前任务、待选候选和输入草稿保存在扩展本地。关闭小窗不主动取消任务；后台重启时，未完成执行标为中断，不自动重放副作用。

## 工具范围

| 工具 | 能力与边界 |
| --- | --- |
| music.intent | 点歌、暂停/继续、音量、当前缓存队列的相邻曲目；不覆盖完整歌单探索与 FM 模式 |
| music.sleep | 0–240 分钟；0 取消定时 |
| alarm.prepare | 复用智能闹钟解析和追问，确认后保存 |
| alarm.list | 展示最多20条现有提醒 |
| video.search | B站/YouTube标题搜索；YouTube未授权时提供原站搜索选项 |
| video.history | B站最近一页记录，或YouTube扩展本地记录；可按最近30天中的具体日期及未看完状态筛选 |

视频选择后在原站打开，链接携带已知秒数；页面打开不等于自动播放成功。字幕、视频内容理解、精确时长筛选不在此版。

## 实现

- `assistant-contract.js`：应用、动作及严格工具参数合同。
- `assistant-engine.js`：单任务执行、选择暂停点、串行提交、取消和持久化。
- `assistant-tools.js` / `assistant-background.js`：真实业务适配、窗口与消息入口。
- 本地 AI 新场景 `assistant.plan` 使用 `local-ai/skills/{app}/SKILL.md`；指定应用时只加载对应技能，自动选择时加载四个简短技能。
- 本版是最多三步的受控计划与工具执行，复用已有 JSON 模型出口。尚未实现原生 `tool_calls` 的开放式自主循环。
- 模型调用继续通过统一控制面，窗口不获取模型令牌。网页消息无权调用快捷助手。
- 计划不能包含未登记工具、额外字段或越过显式选择的应用。执行失败不继续后续步骤；每次候选选择只执行一次。
- 音乐选择后核对真实播放状态；手动操作使尚未提交的助手播放失效。

## 验证入口

定向测试：`node --test test/assistant-mvp.test.js test/local-ai-assistant.test.mjs`。
HTTP/原有业务回归：`node --test test/local-ai*.test.mjs test/music-state-sync-contract.test.js test/music-sleep.test.js test/assistant-conversation.test.mjs`。
隔离交互：`node local-ai/assistant-preview.mjs`，打开终端输出的本地地址；使用真实 UI/工具执行器，替换媒体、模型、提醒与浏览器副作用。

真实扩展需重载后验证快捷键、小窗、账号搜索和播放；隔离页面结果不能作为真实账号或系统通知验收。

## 本轮验收记录（2026-09-15）

- JavaScript / MJS 全量回归：638/638 通过；语法检查与 `git diff --check` 通过。
- 真实 Qwen 经统一控制面，对「继续昨天没看完的 MySQL 视频」返回 `video.history(platform=bilibili, query=MySQL, dayOffset=1, unfinishedOnly=true)`，source=model，本次约16秒。仅验证规划，未执行真实历史查询。
- Chrome 隔离页面验证：@ 别名与 / 补全；复合点歌的候选暂停点；收起并重建页面后的恢复；回复「第二个」后继续定时；闹钟中文倒计时修改、确认后保存，以及修改未提交时禁用旧确认卡。
- 本地网关已在空闲时重启并读取最终代码，`assistant.plan` 已登记，离线规划通过真实 HTTP 入口返回。
- 浏览器工具的 URL 安全策略阻止访问 `chrome://extensions/`，因此未代为重载扩展。真实快捷键、原站账号查询和播放仍需用户重载后验收。
