# 保存队列与播放器显示一致性（2026-09-23）

## 问题与调用路径

工作台通过 `music.state` → `readAssistantMusicState()` 读取 Offscreen 音频状态和 `musicPlaylistCache`。缓存超过24小时且当前音频没有匹配歌曲时，状态为 `stale`，但此前消息仍称“当前队列100首”。播放器 `MusicController.init()` → `_restoreMusicState()` 则直接忽略超过24小时的同一缓存，所以队列页显示为空。用户截图符合这条路径；没有读取到该 Chrome 扩展的实时存储值，不能把截图中的100首断言为已确认的播放队列。

## 修改

- 播放器保留并展示保存队列，不因时间超过24小时丢弃曲目；队列页标题标成“已保存队列（待核对）”。过期的 `lastMusicState` 仍不恢复为正在播放，后台 `restoreSilentMusicPlayback()` 的24小时自动续播限制不变。
- 工作台对 `stale` 状态明确称“本地保存的队列”或“本地过期缓存”，提示播放器尚未确认。`unavailable` 状态也只称为待核对记录。
- 用户明确说“随机播放我的队列歌曲”时，先执行 `music.state`。若读到 `stale` 且保存队列有效、非空、至多300首，`music.queue.play(mode="shuffle")` 可携真实 revision 进入受控播放路径；资源请求后再次核对 revision，随机起点不可播放时只尝试后续最多4首。Offscreen 确认播放后才一起持久化新队列时间与随机模式，并报告成功。单纯查看、模式切换、追加及普通队列清空不能借 `stale` 写入；显式清空走下述核对工具。`unavailable` 不能自动恢复播放。失败或回执未知时不重播，不声称已播放。
- 队列页在“已保存队列（待核对）”下显示处理说明和两个按钮。“保留并恢复”刷新本地缓存版本与保存时间，退出待核对，不自动播放；“清空保存队列”沿用页面确认弹窗，确认后删除本地曲目。页内操作先向后台读取真实 `revision`，再经同一个 `reconcileAssistantMusicQueue()` 核对 Offscreen 空闲状态、来源、缓存快照和版本后提交；已变化则拒绝旧操作。两种动作均不修改网易云云端歌单。
- 工作台新增 `music.queue.reconcile(action,expectedRevision)`：明确保留时直接提交，明确清空时先给确认卡。仅有效的 `stale` 队列可保留；`stale` 或闲置本地 `unavailable` 缓存可明确清空，播放中的队列或来源不明的记录不可借此清空。`ready` 队列继续走既有 `music.queue.clear`。
- 仅复用仓库已有的 Chrome storage、MusicController、AssistantTools、MusicQueuePolicy 与 Offscreen 通道；本问题没有需要新增的上游 SDK、依赖或锁文件。自有改动涉及显示恢复、文案和明确播放时的受控恢复。

## 验证边界

`node --test test/assistant-mvp.test.js test/assistant-queue-revision.test.mjs test/music-state-sync-contract.test.js test/music-view-contract.test.js test/product-ui-v5-contract.test.js test/assistant-error-recovery.test.mjs test/local-ai-planner-recovery.test.mjs test/assistant-runtime-regression.test.js`：139项通过，覆盖25小时旧缓存仍展示、旧播放状态不恢复、过期队列明确播放、不可播放曲目的有界尝试、未确认播放不持久化、页面保留按钮、工作台保留/清空、过期与异常队列版本限制，以及错误恢复和页面合同。`node --check` 与 `git diff --check` 通过。真实 Chrome 扩展、真实账号或实际播放仍需重载扩展后验收。

## 2026-09-28：过期队列清空的工具加载修复

真实历史及 LM Studio 输出确认：先清空、分别添加许巍与法老热歌、再随机播放的任务，成功读取到50首 `stale` 保存队列，但当轮仅提供 `music.playback` 和 `music.edit`。模型两次直接返回 `music.queue.reconcile(action="clear")`，其所属 `music.queue` 未加载，均在规划校验阶段被拒绝；此次没有清空、搜索、追加或播放。Laya 不可用已降级；两次低思考超时增加耗时，但不是最终工具校验失败的原因。

复用现有 `contract.toolGroups`、`assistant-service.plan()` 按需预加载、`tools.load` 和 Engine 恢复观察通道，不新增 SDK、依赖、全局工具目录或执行循环。现有 pi 0.85.1 的确认/压缩职责保持不变；本次缺口属于项目自己的工具目录适配。修改范围：

- 用户要求清空、保留或恢复，且最新队列状态/写入回执为成功的 `stale`/`unavailable` 并带非空字符串版本时，提供 `music.queue` 描述。无回执时不预加载，最新 ready/失败/unknown 覆盖旧 stale 回执，普通查询及其他应用不扩大目录。
- 未加载工具的拒绝信息包含具体工具名和当前应用允许的单步 `tools.load` JSON（`continue:true`），原 Engine 将其作为失败观察回传，仍受原恢复次数与预算约束。组合任务中被禁用的 `music.intent` 明确报告本轮不可用，不建议加载不存在的组。
- 不替模型执行缺失工具，不直接提交清空。`music.queue.reconcile` 仍进入原确认卡；确认后使用真实版本提交。旧版本先重新读状态，`unavailable` 不允许保留或播放，unknown 不可重放。

验证：`node --test test/assistant-tool-loading.test.mjs test/assistant-adaptive.test.js test/assistant-queue-revision.test.mjs test/assistant-error-recovery.test.mjs test/assistant-management.test.js test/assistant-mvp.test.js test/assistant-runtime-regression.test.js test/local-ai-assistant-context.test.mjs test/local-ai-laya-prefetch.test.mjs test/local-ai-planner-recovery.test.mjs`，144项通过。新增6项覆盖缺失组错误恢复、最新回执与应用隔离，以及真实 Engine/Tools 在 Laya 不可用时确认清空一次、两位歌手分别搜索追加一次、随机播放一次，取消确认无写入。模型及业务依赖为替身，不能据此称真实 Chrome 或账号验收通过。

补充实测：两次失败的历史输入与原始计划在修复后的规划器本地回放均通过。确认本机服务空闲后用现有 `service.sh` 重启加载修复（首次 launchd bootstrap 失败，检查为未加载后使用 `start` 恢复，个人记忆入口已就绪）。随后经鉴权 HTTP/Gateway，以第一次失败的历史输入调用真实 `qwen/qwen3.8-27b`、`off` 模式，24.2秒返回带原回执版本的 `music.queue.reconcile(action="clear")`，工具上下文含三个所需组。该用例只生成计划，业务写入为0；记录位于忽略目录 `.local/evaluations/assistant-tool-loading-1790563257234.json`。这不代表完整真实 Chrome/账号播放验收，也不是整条任务耗时比较。脚本语法及 `git diff --check` 通过；清空确认、应用范围、版本、取消及 unknown 防重放边界保持原路径，无新增接口、权限或外部请求。
