# 音乐队列版本与连续失败恢复

## 真实故障

2026-09-20 的“林俊杰热歌，添加队列，随机播放”已成功读取50首曲目。16:01:18 的规划先 low 超时，随后 off 返回 `music.queue.apply(ref=r10, mode=append, startPlayback=false, expectedRevision=5)`。其中5来自 `context.revision`，并非播放器状态生成的 revision 字符串。合同通用字符串校验报“输入内容无效或过长”，并未执行队列追加。

同一请求的超时与最终计划错误原先各计一次连续失败。下一次规划超时达到阈值3，恢复前的 admission 再检查冷却，将 off 重试拦截。冷却过后重新提交，首尝试超时使计数从3增到4，重复进入冷却。16:04:35 的模型端统计为输入1992 tokens、输出644（643为思考），没有正式执行计划；不是输入容量溢出。

## 实现与复用边界

- 继续复用 Gateway、admission、共享 AssistantContract、现有 `music.state`、Engine/Tools 和真实队列 revision 校验；没有引入新的模型或工作流引擎。现有 pi `@earendil-works/pi-coding-agent@0.85.1` 及锁文件不变，依赖安装公开路径保持原样；本次不涉及新上游能力。
- 模型提示和音乐工具说明明确区分任务上下文计数与音乐队列不透明字符串版本；共享合同给出具体字段错误，不再把数字版本误报为输入过长。
- 单步音乐写计划先查最新相关观察：只认可状态为 done 且业务状态 ready/empty 的 `music.state`、`music.queue.list` 或带版本的音乐写入回执。缺少版本、版本不同或查询失败时，严格校验其余参数、应用范围及工具可用性后，仅返回 `music.state` 和 continue。原写计划整体丢弃，绝不把5转为字符串或偷偷补入新版本后执行写入。
- `toolContext.revisionRecovery=music.state` 记录这次只读投影。读取仍计入原 Engine 的轮次/工具/时间限制；下一步由同一 Engine 重新规划。集合引用、确认、实际写前 revision 检查和 sideEffectStarted 边界不变。
- 有 unknown 观察或回执时，不改写模型的写计划，让原 Engine 拒绝潜在重复写入，保留查询核对路径。
- admission 新增仅供 Gateway 内部使用的 intermediate 结束标记。首尝试失败仍累加 failures、耗时及调用预算，consecutiveFailures 仅在整次规划最终失败时累加一次。恢复成功沿用原规则清零连续失败；连续3轮最终失败仍冷却60秒。已有冷却、每日预算、取消、策略版本、90秒总时限和最多两次尝试仍有效。
- 不重置持久化 usage，不更改模型选择、默认思考强度、失败阈值或全局超时。旧失败计数也可在冷却结束后经正常恢复成功清零。

## 验证

- 助手及本机 AI 回归395/395通过，包括真实安装的 pi SDK 与本机临时 HTTP 服务。覆盖阈值前恢复、三轮失败冷却及到期重试、每日预算、取消、策略更新、最终格式校验失败、unknown 与确认边界。
- 真实故障参数在合同层明确拒绝，在规划层只产生读取状态。真实 Engine/Tools 配合业务替身完成选择集合、读取版本、仅追加一次、使用追加后的新版本随机播放一次。
- 真实模型验证脚本：`node local-ai/evaluate-assistant-queue-recovery.mjs --live`。仅通过生产鉴权 HTTP/Gateway 生成三轮计划，队列状态和业务成功回执均为合成数据，不执行任何音乐业务动作。报告保存在 `local-ai/.local/evaluations/assistant-queue-recovery-*.json`。
- 修改脚本语法检查与 `git diff --check` 通过。未提交 Git；保留工作区内其他任务的未提交改动。

## 本机实测与生效状态

报告：`local-ai/.local/evaluations/assistant-queue-recovery-1789892221036.json`。模型为 `qwen/qwen3.8-27b`，使用原 low 选择，经受控生产入口执行：

| 规划 | 实际结果 | 耗时 |
|---|---|---|
| 集合已读、没有队列版本 | low 30.104秒超时，off 13.701秒成功；返回 music.state | 44.152秒 |
| 已收到模拟队列版本 | 沿用 off，返回 append 且 startPlayback=false，使用正确字符串版本 | 4.786秒 |
| 已收到模拟追加回执 | 沿用 off，返回 shuffle 播放，使用追加后的新版本 | 6.272秒 |

总计56.998秒，两轮后续规划均有 `recoveryFromRequestId`；首轮超时用量仍标注不完整。模型按新提示主动选择先读状态；坏版本只读投影另由真实故障参数回放测试覆盖。

服务空闲时通过现有 LaunchAgent 重载。验证前连续失败4次，冷却已自然结束；没有人为清零。本次首尝试超时仍可 off 恢复，正常成功回执将 consecutiveFailures、blockedUntil 归零。调用总数20→24，失败尝试8→9，证明首轮失败仍计入统计。控制策略仍为 revision=5、low、90秒、阈值3、冷却60秒；验证后无运行任务。

HTTP规划验证不等于真实Chrome扩展或真实账号播放验收；未执行任何真实队列追加或播放。此次不消除模型思考超时本身，而是确保受控恢复可达，并阻止上下文版本进入队列写入。
