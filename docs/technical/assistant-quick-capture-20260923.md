# AI 工作台：任务与工作日志快速添加

日期：2026-09-23。

## 调用与数据路径

- `@任务 /添加任务` 经 `assistant.plan` 生成 `task.create(title, description?, priority?, dueDate?)`，由 `AssistantContract.validatePlan` 校验，再经 `AssistantEngine` 串行执行。背景 `AssistantTools` 调用共享的 `QuickCapture.task()`，写入 `chrome.storage.local.memos`。记录结构与任务 App 的新建表单共用同一构造器；任务默认中优先级、未完成，未给日期时不生成截止日期。
- `@工作日志 /添加工作日志` 使用 `worklog.create(description, durationMinutes, date?, projectRef?)`，写入 `worklogEntries`。工作日志 App 的 `addEntry()` 也复用 `QuickCapture.entry()`。耗时必填，1–1439 分钟；未给日期取本地今天，未指定项目归入“未分类”。指定已有项目时先调用只读 `worklog.projects(query?)`，从当前任务的真实回执拿 `projectRef`；执行前重新核对项目仍存在且未归档。
- 两个 App 页面监听对应 storage 变更以刷新已打开的界面。`QuickCapture.append()` 读取现有列表、按确定性 ID 防重复、写入并回读核对；后台通过现有 `storage.set` 包装在写入开始前记录 `sideEffectStarted`。丢失写回执保持 unknown，Engine 禁止自动重做。

## 能力边界

只新增单条记录。任务修改、完成、删除、重复规则；工作日志修改、计时器、关联任务和创建项目都没有暴露为助手写工具。模型不能将这些要求改写成新增。日志必须给出实际耗时；项目引用不能由模型编造。当前 App 本地存储采用整表数组，没有跨所有旧页面的统一事务；多个页面恰好同时修改同一数组时，仍需在后续独立改造中统一串行存储入口。此处没有引入新的 SDK：复用本仓库现有 Engine、Contract、Tools 和 App 记录结构；没有上游 SDK 可直接覆盖这两个本地业务写入路径。

## 验证

- `node --test test/assistant-quick-capture.test.js test/assistant-mvp.test.js test/local-ai-assistant.test.mjs test/tasks-workbench-contract.test.js test/worklog-workbench-contract.test.js`：77/77 通过。覆盖应用范围、日期/耗时校验、模型规划合同、存储结构、幂等、项目引用失效、写回执 unknown。
- 修改脚本 `node --check` 与 `git diff --check` 通过。
- 首次加入任务/工作日志 App 后，须执行 `./local-ai/service.sh restart` 加载本机规划器的新应用目录，并重载 Chrome 扩展。只重载扩展会使旧本机服务返回“请选择已接入的应用”；工作台现在将此错误明确提示为服务版本未更新，且不执行写入。
- 初次实现未调用真实本机模型、未运行 HTTP 预览，未重载真实 Chrome 扩展；这些层级尚未验收。

## 2026-09-24 本机服务版本核对

截图中工作台已选“任务”，但仍在运行的本机服务对 `app: "task"` 返回“请选择已接入的应用”。现场在受控 HTTP 规划入口复现，确认失败发生在服务应用校验，业务工具没有执行。通过项目统一脚本恢复并加载新服务后，`status` 显示主接口、个人记忆和模型就绪；同一应用的只读规则规划成功。随后对截图原句“大模型需要好好看看，很重要。”进行真实本机模型**仅规划**验证，返回 `task.create(title="大模型需要好好看看", priority="high")`，未提交任务 App 写入。旧服务再现时，扩展现在明确提示运行 `./local-ai/service.sh restart`。
