# 本机 AI 服务脚本：`restart` 竞态与就绪检查（2026-10-12）

## 现象

2026-10-12 `npm ci` 后连续执行 `service.sh restart` / `stop` / `start`，8 条命令里有三次 `Bootstrap failed: 5: Input/output error`，另有两次“入口未就绪，请查看 service-error.log”。2026-09-24 已出现过同一现象（`assistant-laya-prefetch-20260924.md` 只记为“第一次 restart 在 bootstrap 阶段报错，随后 start 恢复”），当时没有查原因。该脚本（`local-ai/scripts/service.mjs`，最近一次提交为 03f300b）与本次 `compute.run` 改动无关，本次修改前工作区没有改动它。

## 证据（macOS 统一日志中 launchd 自己的记录）

| 时间 | 命令 | launchd 记录 |
|---|---|---|
| 20:12:05 | restart（服务运行中） | bootout 发起；脚本 5 ms 后就调用 `enable`；旧进程在 bootout 后 46 ms 才退出；`bootstrap` 落在拆除窗口内，失败 |
| 20:12:13 | restart（服务已被上一次卸载） | 加载成功，进程 26 ms 内拉起，存活 31 s；脚本等满 10 s 报“入口未就绪” |
| 20:12:44 | restart | bootout 后 7 ms 调用 `enable`；旧进程 490 ms 后才退出；`bootstrap` 失败 |
| 20:12:46 | restart | 加载成功，进程 20 ms 内拉起，存活 65 s；同样“入口未就绪” |
| 20:14:00 | start | 进程 16 ms 内拉起，脚本报告就绪 |
| 20:14:09 | restart | bootout 后 6 ms 调用 `enable`；旧进程 13 ms 后退出；`bootstrap` 失败 |
| 20:14:11 | restart | 进程 20 ms 内拉起；`service.log` 在 20:14:12 写入启动横幅，脚本报告就绪 |

## 根因与未定位的部分

- **确定**：`launchctl bootout` 在旧进程退出前就返回，原脚本紧接着 `rename → enable → bootstrap`（`install(true)`），既不等旧服务卸载，也不重试。失败时旧服务已卸载、新服务没加载，所以下一次 restart 实际是冷启动，表现为“交替失败”。用同样 Node 与模块图的替身 job（不同 label）连续 6 次 bootout→bootstrap 没有复现，原因是替身进程约 20 ms 就退出，拆除先于 `bootstrap` 完成；竞态取决于旧进程退出的快慢。
- **未定位**：两次“入口未就绪”里进程都在 20–26 ms 内被拉起并存活很久，`service-error.log` 为空（0 字节），所以既不是没启动，也不是崩溃或端口被占（隔离副本验证过：端口被占时进程会打印错误并退出）。隔离环境里服务从 import 到应答 `/v1/control` 只要 0.5–0.8 s（3 次），全新 APFS 克隆的冷副本仅 import 就是 0.46–0.49 s（3 次），无法复现慢启动。时间上与 `npm ci` 结束后 1 分钟内相关（同时段 Spotlight `mdworker` 大量启动/被杀），但这只是相关，不是已证实的原因。原“请查看 service-error.log”的提示对这种情形是误导。

## 修改

只用 macOS 公开的 `launchctl` 命令；没有可复用的上游 SDK（这是本项目自己的守护脚本），因此自有代码只承担下列职责，且全部在 `local-ai/scripts/service.mjs`，依赖通过参数注入以便模拟 launchd 测试：

- `waitUntilUnloaded`：`bootout` 后轮询 `launchctl print`，最长 `UNLOAD_WAIT_MS = 8000`（launchd 对该 job 的退出等待为 5 秒）；超时报错并保留旧状态，不强杀进程。`restart`、`stop`、`shutdown`、`uninstall` 都会等。
- `bootstrapJob`：只对 launchd 的 5 号错误（状态码 5 或含 `Input/output error`）最多重试 5 次、间隔 300 ms；其他错误立即报告原文，不重试。
- `reloadJob`：旧服务确实卸载之后才 `commit`（替换配置），失败或抛错时 `discard` 清理 `~/Library/LaunchAgents` 里的临时 plist，避免残留。
- `waitForReady`：进程仍加载时最多等 `READY_WAIT_MS = 30000`（原固定 10 秒），就绪立即返回；服务被卸载则立即报告；探测异常按未就绪处理。
- `describeNotReady`：失败信息包含等待秒数、进程 pid 与状态/上次退出码、19841 是否有进程监听，以及 `service-error.log` 与 `service.log` 的末几行（空则明说）；保留“不会自动终止其他占用端口的进程”。读日志经 `readTail`，只读末尾 4 KB。

不变的边界：`restart` 仍会停止服务，运行中的 AI 任务随之取消（原有行为）；仍不杀未知进程；仍不改变令牌、控制配置与用量文件。

## 验证

- 静态：`node --check`；`git diff --check`。
- 模拟 launchd（`test/local-ai-service-restart.test.mjs`，17 个）：旧服务延迟 40 ms 才卸载时只 bootstrap 一次且配置在卸载之后才替换；旧服务一直不卸载时在 8 秒内报错、不加载并清理待提交配置；停止/替换失败同样清理；`print` 已显示卸载但 bootstrap 仍短暂 5 号错误时重试后成功；持续 5 号错误时恰好 5 次后失败并带出 launchd 原文；其他错误码不重试；启动慢到 25 秒仍能等到；被卸载立即报告；超时带进程状态。原有 `test/local-ai-service.test.mjs` 3 个仍通过。
- 变异检查：去掉等待、重试改为 1 次、就绪窗口改回 10 秒、失败路径不清理、对所有错误都重试，五个变异都被对应用例发现。
- 真实 launchd（本机，无运行中的 AI job 时）：连续 5 次 `service.sh restart`（间隔约 3 秒，无额外等待）全部成功，每次旧进程在 bootout 后 13–16 ms 退出、`enable` 在约 120–124 ms 后才调用（晚于旧进程退出）、新进程在 `enable` 后 22–31 ms 内拉起；`stop` 返回后 `launchctl print` 已不存在，紧接着 `start` 成功；没有残留临时 plist。
- 未验证：慢启动的真实原因（本次未复现，所以只能延长等待并改进诊断）；旧进程退出超过 8 秒的真实场景（仅模拟）；其他 macOS 版本。再次出现“入口未就绪”时，新提示会带出进程 pid/状态和日志；若仍持续，请同时保留 `launchctl print gui/$(id -u)/local.chrome-time-background.ai` 与 `lsof -nP -iTCP:19841`。

## 同批 npm 事项

- `npm audit` 的 3 项（pi-coding-agent 本体、嵌套 `undici@8.9.0`、`brace-expansion@5.0.9`）和 `node-domexception` 弃用提示都来自 pi 0.85.1 的子依赖，对比 HEAD 的锁文件只多了 3 个 QuickJS 包，其余版本与哈希无变化。pi 升到 1.1.0 是主版本，须验证真实 SDK 路径，本次不改；只有 `brace-expansion` 可单独 `npm audit fix`，同样未做。服务启动时 `undici` 与 `brace-expansion` 都会被加载，不能因此说不可达；服务只监听 127.0.0.1，判断风险低但未做利用验证。
- npm 11.19 提示 `esbuild`、`protobufjs`、`@google/genai` 三个子依赖的安装脚本“尚未被 allowScripts 审核”。默认模式下这些脚本本来就会执行，因此在 `local-ai/package.json` 用 `npm install-scripts approve` 按 `包名@版本` 登记（`"allowScripts": {"@google/genai@1.52.0": true, "esbuild@0.28.1": true, "protobufjs@7.6.5": true}`）：行为不变，只消除提示；版本一变，登记即不再覆盖，须重新审核。用临时副本做 A/B：不带 `allowScripts` 时 `npm ci --dry-run` 出现提示，带上后没有，且仍与 `package-lock.json` 一致；`npm install-scripts ls` 显示没有未审核项。注意：npm 11.19.0 的 `npm install-scripts approve --dry-run` 实际仍写了 `package.json`。该用法的 `--dry-run` 不可信，只能靠 `git diff` 确认。
