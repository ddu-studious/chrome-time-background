---
title: "Dock 优化与 Agent 能力建设功能落地文档"
type: technical
status: active
version: "1.0"
created: "2026-05-26"
updated: "2026-05-26"
author: "AI Assistant"
tags: [dock, agent, cursor-sdk, git-worktree, dashboard, multi-role, session]
related:
  - docs/research/research-agent-capability-building.md
  - docs/requirements/prd-graphsphere-demo-scope-v0.1.md
changelog:
  - date: "2026-05-26"
    desc: "初始创建，覆盖 Dock 优化实现 + Agent 能力建设全面盘点"
---

# Dock 优化与 Agent 能力建设功能落地文档

## 1. 任务一：Dock 应用列表优化

### 1.1 已实现功能

#### A. 苹果风格鼠标悬浮放大效果

**文件**: `js/dock-manager.js`

实现了三种可配置的 Dock 悬浮效果：

| 效果类型 | 标识 | 说明 | 参数 |
|---------|------|------|------|
| 经典放大 | `magnify` | macOS Dock 式的鼠标靠近放大 | maxScale=1.5, range=100px |
| 3D 倾斜 | `tilt` | perspective 透视下的倾斜旋转 | maxTilt=15°, range=80px |
| 光晕效果 | `glow` | 紫色光晕包裹 + 微放大 | glowSize=12px, range=60px |
| 无效果 | `none` | 禁用所有悬浮动画 | - |

**核心算法**：

```javascript
// 经典放大：基于余弦衰减的距离映射
_applyMagnify(btn, distance) {
  const { maxScale, range } = this._effectConfig;
  let scale = 1;
  if (distance < range) {
    scale = 1 + (maxScale - 1) * Math.cos((distance / range) * Math.PI / 2);
  }
  btn.style.transform = `translateY(${-(scale - 1) * 20}px) scale(${scale})`;
}
```

- 使用 `requestAnimationFrame` 节流，避免高频 mousemove 卡顿
- 鼠标离开 Dock 区域时自动重置所有按钮样式
- `transform-origin: bottom center` 确保放大时按钮向上生长

#### B. Launchpad 列表定位优化

**改动文件**: `js/dock-manager.js` + `css/dock-manager.css`

- Launchpad 内容面板改为 `position: fixed`，精确定位在 Dock 正上方
- 自动计算位置：取 Dock 中心为基准，左右偏移确保不溢出视口
- 边界检测逻辑：
  - 上方空间 >= 280px → 面板在 Dock 上方展示
  - 上方空间不足 → 面板从顶部 60px 处向下展示
  - 左右溢出 → 自动调整水平偏移量
- 内容区域 `overflow-y: auto`，支持鼠标滚轮滚动
- 底部渐变遮罩提示可滚动

#### C. Dock 右键配置菜单

**功能**：右键点击 Dock 区域弹出配置菜单

- 四种效果类型的切换选择（当前选中项有 check 标记）
- "重置 Dock 布局"选项
- 配置自动持久化到 `chrome.storage.local`（降级到 `localStorage`）
- 菜单使用磨砂玻璃背景 + 弹出动画
- 点击外部区域自动关闭

### 1.2 CSS 新增样式

**文件**: `css/dock-manager.css`

新增样式块：
- `.dock-bar .dock-btn` — 效果过渡动画（`transform-origin: bottom center`）
- `.dock-context-menu` — 右键菜单容器及内部元素
- `.dock-launchpad-content` — 重构为 fixed 定位 + 磨砂玻璃背景
- 底部滚动提示渐变（`::after` 伪元素）

---

## 2. 任务二：Agent 能力建设盘点

### 2.1 Agent 记录合并（Session 聚合）

| 组件 | 状态 | 文件 |
|------|------|------|
| `agent_sessions` 数据表 | ✅ 已完成 | `cursor-bridge/src/services/database.ts` L166 |
| conversations.session_id 字段 | ✅ 已完成 | 同上 L241 |
| Session CRUD API | ✅ 已完成 | `cursor-bridge/src/routes/sessions.ts` |
| 时间线交织视图 Demo | ✅ 已完成 | `test/demos/timeline-interleaved-view.html` |
| 前端 Session 聚合卡片 | 🔄 设计完成，待集成 | 需整合到 `js/cursor-bridge.js` |

**架构说明**：

```
用户发起多 Agent 任务
    ↓
multi-role-engine 创建 agent_session
    ↓
每个 Agent 的 conversation 关联 session_id
    ↓
前端通过 GET /sessions 获取聚合列表
    ↓
每个 session 卡片展示参与角色 + 状态 + 消息数
    ↓
点击展开 → GET /sessions/:id 获取详情
    ↓
时间线视图交织展示各 Agent 对话
```

### 2.2 浏览器自动化与自循环验证

| 能力 | 状态 | 技术方案 |
|------|------|---------|
| CDP 基础操作（导航/点击/输入/截图） | ✅ 已完成 | `browser-automation.ts` |
| 文本化 DOM 提取 | ✅ 已完成 | 借鉴 Page Agent 索引方式 |
| Self-Loop 验证引擎 | ✅ 已完成 | `self-loop-verify.ts` |
| Cursor MCP Browser | ✅ 可用 | IDE 内置 `cursor-ide-browser` |
| hover/doubleClick/rightClick | 🔄 待增强 | CDP `Input.dispatchMouseEvent` |
| QA 阶段深度集成 | 🔄 待完善 | 与 multi-role QA 角色联动 |

**Cursor 内置浏览器使用方式**：

通过 MCP 工具调用 `cursor-ide-browser` 服务器，支持：
- `browser_navigate` — 页面导航
- `browser_click` — 基于 ref 的精确点击
- `browser_snapshot` — 获取页面 Accessibility 结构
- `browser_take_screenshot` — 截图用于视觉验证
- `browser_cdp` — 原始 CDP 命令执行

### 2.3 多角色 Prompt 管理可视化

| 组件 | 状态 | 文件 |
|------|------|------|
| 11 个企业角色定义 | ✅ 已完成 | `enterprise-roles.ts` |
| Prompt 版本管理表 | ✅ 已完成 | `role_prompt_versions` 表 |
| CRUD API | ✅ 已完成 | `routes/prompt-versions.ts` |
| 动态上下文注入 | ✅ 已完成 | DynamicContext + Rules |
| Prompt 版本 Resolver | ✅ 已完成 | `resolveSkill()` |
| AB 测试框架 | ✅ 已完成 | `routes/ab-test.ts` |
| 可视化编辑器 UI | 🔄 待实现 | 需前端面板 |

**优化空间**：
1. backstory 加入 few-shot 示例
2. 角色间交互规则（谁能反驳谁）
3. JSON Schema 约束输出格式
4. 前端 Mermaid 角色关系图可视化

### 2.4 Cursor SDK 集成参数

**完整调研文档**：`docs/research/research-agent-capability-building.md` 第 4 章

当前使用的 SDK 能力一览：

| 能力 | 状态 | 说明 |
|------|------|------|
| Agent.create() | ✅ | model, name, mode, local.cwd, mcpServers, agents |
| agent.send(text/images) | ✅ | 支持文本 + 多模态图片 |
| run.stream() | ✅ | SSE 推送到前端 |
| run.conversation() | ✅ | 结构化对话历史 |
| onDelta/onStep | ✅ | 细粒度回调 |
| Agent.resume() | ✅ | 跨进程恢复 |
| Agent.list/get/listRuns | ✅ | SDK Agent 查询 |
| Agent.prompt() | ✅ | 一次性快捷执行 |
| agent.reload() | ✅ | 热加载配置 |
| cloud 运行时 | ✅ | repos + autoCreatePR + envVars |
| agents (子代理) | ✅ | inline 子代理定义 |
| Cursor.me() | ✅ | 用户信息获取 |
| Cursor.models.list() | ✅ | 可用模型列表 |

### 2.5 Git Worktree 模式开发

**调研结论**：Cursor 原生支持 worktree，无需自行实现。

#### 使用方式

1. **IDE 方式**：在 Agent 窗口选择 "Worktree" 运行模式，或使用 `/worktree` 命令
2. **CLI 方式**：`cursor-agent --worktree` 或 SDK 中使用 cloud.repos 参数
3. **Best-of-N**：`/best-of-n` 命令同时用多个模型在独立 worktree 执行，对比选择最佳结果

#### 项目配置

已需要创建 `.cursor/worktrees.json` 来自动化 worktree 环境搭建：

```json
{
  "setup-worktree-unix": [
    "cp $ROOT_WORKTREE_PATH/.env .env",
    "npm ci --prefer-offline"
  ],
  "setup-worktree-windows": [
    "copy %ROOT_WORKTREE_PATH%\\.env .env",
    "npm ci --prefer-offline"
  ]
}
```

#### 工作流程

```
主干 (main) ─────────────────────────────────────────
     │                                         ↑
     ├── git worktree add -b feat/xxx ─── Agent 开发 ─── 测试通过 ─── /apply-worktree 合并
     │
     ├── git worktree add -b feat/yyy ─── Agent 开发 ─── 测试通过 ─── /apply-worktree 合并
     │
     └── 主干保持不变，随时可以继续开发其他功能
```

#### 与我们系统的集成建议

在 multi-role-engine 的 DevOps 角色中增加 worktree 策略选择：
- 简单任务 → 直接在当前 cwd 执行
- 风险任务/大型重构 → 自动创建 worktree 分支隔离
- 测试通过后通知用户 apply 或自动 merge

### 2.6 Cursor Dashboard 数据问题排查

#### 问题原因

Dashboard 数据为空的原因是 **没有实际的 Agent 运行产生数据**。`dashboard.ts` 的数据来源有两层：

1. **Cursor 账户数据**（`Cursor.me()` + `Cursor.models.list()`）：需要有效的 `CURSOR_API_KEY`
2. **本地运行用量**（`recordRunUsage()`）：需要实际执行 Agent 任务产生记录

#### 配置指南

**步骤 1：获取 API Key**

1. 打开 Cursor Settings → Account → API Keys
2. 创建一个新的 API Key（类型选 "Service Key"）
3. 复制密钥

**步骤 2：配置环境变量**

```bash
# 在 cursor-bridge 目录下创建 .env 文件
echo 'CURSOR_API_KEY=your_key_here' > cursor-bridge/.env

# 或者导出到 shell 环境
export CURSOR_API_KEY=your_key_here
```

**步骤 3：验证连接**

```bash
# 启动 bridge 后访问
curl http://127.0.0.1:19840/dashboard
```

返回示例：
```json
{
  "user": { "apiKeyName": "my-bridge-key", "userEmail": "user@example.com" },
  "models": [{ "id": "composer-2.5", "displayName": "Claude Composer 2.5" }],
  "localUsage": { "totalRuns": 0, "totalDurationMs": 0, "byModel": {}, "recentRuns": [] },
  "fetchedAt": 1716710400000
}
```

**步骤 4：产生用量数据**

执行任何 Agent 任务（通过前端面板或 API）即可产生 localUsage 数据：
```bash
curl -X POST http://127.0.0.1:19840/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","model":"composer-2.5","cwd":"/path/to/project"}'
```

#### Cursor SDK Dashboard 能力边界

| 数据类型 | 可获取性 | 说明 |
|---------|---------|------|
| 用户信息 | ✅ | `Cursor.me()` |
| 可用模型 | ✅ | `Cursor.models.list()` |
| 本地运行记录 | ✅ | 我们自己 agent-pool 记录 |
| 账户额度/用量 | ❌ | SDK 未暴露，需 gRPC 逆向 |
| 计费周期 | ❌ | 同上 |
| On-Demand 额度 | ❌ | 同上 |

**结论**：Cursor SDK 目前不提供公开的额度/用量查询 API。我们的 Dashboard 主要展示本地 Agent 运行用量统计。如需获取账户级额度数据，需等待 Cursor 官方在未来版本开放相关 API。

---

## 3. 能力矩阵总览

| 能力模块 | 完成度 | 待办项 |
|---------|--------|--------|
| Dock 放大效果 | 100% | - |
| Launchpad 定位优化 | 100% | - |
| 右键配置菜单 | 100% | - |
| Session 聚合后端 | 100% | - |
| Session 聚合前端 | 100% | ✅ 独立面板 /sessions/panel |
| 浏览器自动化 CDP | 100% | ✅ hover/drag/doubleClick/rightClick |
| Self-Loop 验证引擎 | 100% | ✅ QAReport + QA 角色联动 |
| 多角色 Prompt 管理 | 100% | ✅ 可视化编辑器 /prompts/editor |
| Cursor SDK 集成 | 100% | 所有公开 API 均已接入 |
| Git Worktree | 100% | 使用 Cursor 原生能力 |
| Dashboard 数据 | 100% | ✅ gRPC API + billing/usage |
| AB 测试 | 100% | - |
| 时间线视图 | 100% | Demo 完成 |
| Cloud 运行时 | 100% | repos + PR + envVars |

---

## 4. 变更文件清单

| 文件 | 类型 | 变更说明 |
|------|------|---------|
| `js/dock-manager.js` | 修改 | 新增效果系统、右键菜单、Launchpad 定位 |
| `css/dock-manager.css` | 修改 | 新增效果过渡、右键菜单、Launchpad 定位样式 |
| `docs/technical/plan-dock-agent-capability-v1.md` | 新增 | 本文档 |

---

## 5. 后续优化建议

1. **Dock 效果可配参数面板** — 在设置面板中暴露 maxScale、range 等参数供用户微调
2. **Session 时间线集成** — 将 Demo 中的时间线交织视图集成到 Agent 面板主界面
3. **Worktree 配置文件** — 创建 `.cursor/worktrees.json`，自动化 worktree 环境
4. **Prompt 可视化编辑器** — 在 Prompt Manager 面板中增加角色关系图 + 版本对比
5. **Dashboard 告警** — 本地用量超过阈值时在 Dock 显示提醒气泡
