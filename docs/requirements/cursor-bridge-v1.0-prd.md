# Cursor Bridge v1.0 — 完整矩阵视图需求规格

**版本**: v1.0  
**日期**: 2026-05-05  
**标题**: Cursor Bridge v1.0 完整矩阵视图与 Agent 协作平台 PRD  
**状态**: 开发中 (Phase 1~4 ✅, Phase 5 设计完成)  
**前置版本**: v0.3 (Native Messaging 自动化) ✅  
**调研依据**: [多 Agent 平台调研报告](../research/multi-agent-platform-research.md) | [Agent 生态调研 2026](../research/agent-ecosystem-research-2026.md)  
**当前进度**: Phase 1~4 全部完成 — 矩阵视图 + Agent 协作 + 工作流系统 + 增强功能 (Token 追踪/HITL/可观测性/项目级配置) | Phase 4.5 全部完成 — 白盒可观测性系统 | Phase 5 设计完成 — 企业级多角色协作系统 PRD  

---

## 1. 版本目标

将 Cursor Bridge 从"单 Agent 线性交互"升级为"多 Agent 矩阵协作平台"，实现：

- 多 Agent 并行工作的卡片式矩阵布局
- Agent 间消息传递与结果引用
- 任务工作流编排（DAG）
- 对话历史持久化
- 多项目管理
- 工作流模板系统

---

## 2. 功能规格

### 2.1 P0 — 必须完成

#### 2.1.1 矩阵视图

| 功能 | 描述 | 验收标准 | 状态 |
|------|------|---------|------|
| 卡片式布局 | 每个 Agent 一张卡片，网格排列，支持拖拽调整大小 | 3+ Agent 卡片可同时显示，卡片可拖拽调整高度 | ✅ 已完成 |
| 实时状态指示 | 每张卡片显示 Agent 状态（idle/running/error）和当前 run 进度 | 状态变化 < 1s 反映到 UI | ✅ 已完成 |
| 输出流分屏 | 每张卡片内嵌输出区，支持折叠/展开 | SSE 输出实时渲染，支持 Markdown 渲染 | ✅ 已完成 |
| 矩阵概览栏 | 顶部统计栏：总 Agent 数、运行中数、总 token 用量 | 数据实时更新 | ✅ 已完成 |

**参考**: LangGraph 的状态可视化 + CrewAI 的角色卡片

#### 2.1.2 Agent 协作

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| Agent 间消息传递 | Agent A 的输出可作为 Agent B 的输入引用 | 支持 `@agent-name` 引用语法 |
| 结果引用 | 在 prompt 中引用其他 Agent 最后一轮输出 | UI 显示引用来源，点击可跳转 |
| 依赖编排 | 定义 Agent 执行顺序（A 完成后触发 B） | DAG 编辑器可视化定义依赖 |

**参考**: AutoGen 对话协议 + Open Multi-Agent 目标分解 DAG

#### 2.1.3 对话历史持久化

| 功能 | 描述 | 验收标准 | 状态 |
|------|------|---------|------|
| 本地 SQLite 存储 | Agent 对话记录持久化到 SQLite | 重启 bridge 后历史可恢复 | ✅ 已完成 |
| 历史列表 | 按项目/时间/Agent 筛选历史对话 | 支持关键词搜索 | ✅ 已完成 (UI + API) |
| 历史详情 | 查看历史对话的消息内容 | 点击历史条目查看详情 | ✅ 已完成 |
| 历史恢复 | 从历史记录恢复 Agent 上下文继续对话 | 一键"继续对话" | ✅ 已完成 |

**参考**: LangGraph Checkpoints + CrewAI 记忆系统

#### 2.1.4 工作流模板

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 预设工作流 | 内置 3-5 个常用工作流模板 | 一键启动完整工作流 |
| 自定义工作流 | 用户可保存当前 Agent 组合为模板 | 模板支持导入/导出 |
| 工作流参数化 | 模板中的变量可在启动时填入 | 支持项目路径、分支名等变量 |

**内置工作流**:
1. **代码审查流水线**: 审查 Agent → 修复 Agent → 测试 Agent
2. **功能开发**: 需求分析 Agent → 实现 Agent → 测试 Agent → 文档 Agent
3. **重构优化**: 分析 Agent → 重构 Agent → 回归测试 Agent
4. **安全审计**: 漏洞扫描 Agent → 修复建议 Agent → 验证 Agent
5. **文档生成**: 代码分析 Agent → 文档编写 Agent → 校对 Agent

**参考**: CrewAI 角色团队 + Open Multi-Agent 任务 DAG

#### 2.1.5 多项目管理

| 功能 | 描述 | 验收标准 | 状态 |
|------|------|---------|------|
| 项目切换器 | 顶部下拉选择当前项目 | 切换后 Agent 列表自动过滤 | ✅ 已完成 |
| 项目级 Agent 配置 | 每个项目可有独立的 Agent 预设 | 配置跟随项目持久化 | ✅ 已实现 |
| 最近项目 | 记住最近打开的 5 个项目路径 | 快速切换不需要重新输入路径 | ✅ 已完成 (API) |

---

### 2.2 P1 — 应该完成

#### 2.2.1 Token 用量追踪

| 功能 | 描述 |
|------|------|
| 单次 run token 统计 | 每次 run 的 input/output token 计数 |
| Agent 累计用量 | 每个 Agent 的历史总 token 用量 |
| 项目级统计 | 按项目维度聚合 token 用量 |
| 用量图表 | 简单折线图/柱状图展示趋势 |

**参考**: Open Multi-Agent token 预算系统

#### 2.2.2 Agent 记忆系统

| 功能 | 描述 |
|------|------|
| 短期记忆 | 当前会话的上下文 (已有) |
| 长期记忆 | 跨会话的关键信息摘要存储 |
| 项目知识 | 项目级别的知识库（架构信息、代码约定等） |

**参考**: CrewAI 短期/长期/实体记忆

#### 2.2.3 Human-in-the-Loop

| 功能 | 描述 |
|------|------|
| 审批门 | Agent 执行到关键步骤时暂停等待确认 |
| 修改后继续 | 用户可修改 Agent 输出后继续下一步 |
| 紧急中断 | 全局中断按钮，停止所有运行中的 Agent |

**参考**: AutoGen 对话协议

#### 2.2.4 白盒可观测性 (Whitebox Observability)

| 功能 | 描述 | 状态 |
|------|------|------|
| Trace 事件采集 | 持久化 thinking/tool_call/tool_result 等 18 种事件类型 | ✅ 已完成 |
| 决策日志 | 结构化记录每个决策的议题/方案/选择/理由/支持者/反对者 | ✅ 已完成 |
| 因果链 | 记录事件间因果关系（caused/influenced/blocked/referenced） | ✅ 已完成 |
| 时间线视图 | 按时间排列所有 Agent 事件，颜色区分角色，图标区分类型 | ✅ 已完成 |
| 决策日志视图 | 展示每个决策的支持/反对/理由，可展开因果链 | ✅ 已完成 |
| 角色视角视图 | 以单个角色为中心展示思考/发言/影响力指标 | ✅ 已完成 |
| 因果图视图 | 有向图展示事件间因果关系，回答"这个决定怎么来的" | ✅ 已完成 |
| 回放模式 | 按时间步进回放整个协作过程，支持暂停/快进/回退 | ✅ 已完成 |
| Trace 统计 | 按类型/角色/阶段聚合的统计概览 | ✅ 已完成 |
| Phase 5 Trace Hooks | 讨论/执行/QA 流程的 trace 采集钩子函数 | ✅ 已完成 |

**三层架构**:
- **Layer 1 (事件采集)**: `agent-pool.ts` 中 SDK 事件自动持久化 + `phase5-trace-hooks.ts` 提供 Phase 5 专用采集钩子
- **Layer 2 (结构化存储)**: SQLite `traces`/`decisions`/`causal_links` 三表 + `trace-service.ts` CRUD
- **Layer 3 (可视化)**: `whitebox-observability.js` + `whitebox-observability.css` 五种视图

**TraceType 枚举**: `thinking` | `tool_call` | `tool_result` | `decision` | `opinion` | `agreement` | `objection` | `reference` | `delegation` | `escalation` | `phase_enter` | `phase_exit` | `approval` | `veto` | `bug_report` | `bug_fix` | `quality_gate` | `system`

**API 端点**:
```http
GET  /tasks/:id/traces              — Trace 列表（支持 type/phase/role/limit/offset 筛选）
GET  /tasks/:id/traces/timeline     — 时间线视图数据
GET  /tasks/:id/traces/by-role/:r   — 角色视角数据
GET  /tasks/:id/traces/by-phase/:p  — 按阶段筛选
GET  /traces/:traceId/causal-chain  — 因果链追溯
GET  /tasks/:id/decisions           — 决策日志列表
GET  /decisions/:id                 — 决策详情（含支持/反对 traces）
GET  /tasks/:id/replay              — 回放数据
GET  /tasks/:id/replay/snapshot/:ts — 某时间点状态快照
GET  /tasks/:id/traces/stats        — Trace 统计
```

**参考**: LangSmith 可观测性 + OpenTelemetry Trace 模型

---

### 2.3 P2 — 可以后续迭代

| 功能 | 描述 | 参考 |
|------|------|------|
| A2A 协议支持 | 暴露 Agent Card，支持外部 Agent 发现和调用 | Google A2A |
| MCP Server 模式 | Bridge 作为 MCP Server 供其他工具调用 | Anthropic MCP |
| 结构化错误恢复 | Agent 错误的自动诊断和重试策略 | MCP 学术研究 |
| 多用户支持 | 本地多用户隔离（远程协作场景） | Enterprise 需求 |
| 插件系统 | 第三方扩展 Agent 能力的插件机制 | CrewAI 工具生态 |

---

## 3. 数据模型扩展

### 3.1 新增实体

```typescript
interface Project {
  id: string;
  name: string;
  cwd: string;
  createdAt: number;
  lastAccessed: number;
  agentPresets: AgentPreset[];
}

interface AgentPreset {
  id: string;
  name: string;
  model: string;
  description: string;
  defaultPrompt: string;
  role: string;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  isBuiltin: boolean;
  variables: WorkflowVariable[];
}

interface WorkflowStep {
  id: string;
  agentPresetId: string;
  prompt: string;
  dependsOn: string[];     // 依赖的步骤 ID
  outputMapping?: string;  // 输出映射到下一步的变量名
}

interface WorkflowVariable {
  name: string;
  description: string;
  defaultValue?: string;
  required: boolean;
}

interface ConversationRecord {
  id: string;
  agentId: string;
  projectId: string;
  messages: MessageRecord[];
  createdAt: number;
  updatedAt: number;
  tokenUsage: TokenUsage;
}

interface MessageRecord {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  runId?: string;
  toolCalls?: ToolCallRecord[];
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  type: 'reference' | 'trigger' | 'data';
  timestamp: number;
}
```

### 3.2 SQLite Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  agent_presets TEXT -- JSON
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  project_id TEXT,
  messages TEXT NOT NULL, -- JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  token_input INTEGER DEFAULT 0,
  token_output INTEGER DEFAULT 0
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps TEXT NOT NULL, -- JSON
  variables TEXT,      -- JSON
  is_builtin INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE agent_messages (
  id TEXT PRIMARY KEY,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX idx_conv_project ON conversations(project_id);
CREATE INDEX idx_conv_agent ON conversations(agent_id);
CREATE INDEX idx_msg_timestamp ON agent_messages(timestamp);
```

---

## 4. API 扩展

### 4.1 新增端点

```http
# 项目管理
GET    /projects                    — 项目列表 ✅
POST   /projects                    — 创建项目 ✅
GET    /projects/:id                — 获取项目详情 ✅
POST   /projects/:id/open           — 标记项目访问 ✅
DELETE /projects/:id                — 删除项目 ✅
PUT    /projects/:id                — 更新项目 ✅
GET    /projects/:id/presets        — 获取项目 Agent 预设 ✅
PUT    /projects/:id/presets        — 更新项目 Agent 预设 ✅

# 工作流
GET    /workflows                   — 工作流列表（含内置）
POST   /workflows                   — 创建自定义工作流
POST   /workflows/:id/run           — 执行工作流
DELETE /workflows/:id               — 删除工作流

# 对话历史
GET    /conversations               — 对话列表（支持项目/Agent 筛选） ✅
GET    /conversations/:id           — 对话详情 ✅
POST   /conversations                — 创建对话记录 ✅
PATCH  /conversations/:id           — 更新对话状态 ✅
GET    /conversations/:id/messages  — 获取消息列表 ✅
POST   /conversations/:id/messages  — 添加消息 ✅
POST   /conversations/:id/resume    — 恢复对话 ✅
DELETE /conversations/:id           — 删除对话 ✅
GET    /conversations/search?q=     — 对话搜索 ✅

# Agent 间通信
POST   /agents/:id/message          — 向 Agent 发送跨 Agent 消息
GET    /agents/:id/messages          — 获取 Agent 收到的消息

# 统计
GET    /stats                       — 总览统计 ✅ (项目/对话/消息计数)
GET    /stats/tokens                — Token 用量统计 ✅ (消息数/模型分布/24h统计)
GET    /stats/tokens/recent         — 最近 Token 用量记录 ✅
GET    /stats/tokens/agent/:id      — Agent 级 Token 统计 ✅
GET    /stats/tokens/project/:id    — 项目级 Token 统计 ✅

# Human-in-the-Loop
POST   /agents/:id/approval         — 开启/关闭审批门 ✅
GET    /approvals                    — 全局待审批列表 ✅
GET    /agents/:id/approvals         — Agent 待审批列表 ✅
POST   /agents/:id/approvals/:aid/resolve — 审批决议 ✅
POST   /agents/emergency-stop       — 紧急中断所有 Agent ✅
```

---

## 5. UI/UX 设计

### 5.1 矩阵视图布局

```
┌────────────────────────────────────────────────────────────────┐
│ ⬡ Cursor Bridge            项目: [my-project ▼]   🔍  ⚙️  ❌ │
├────────────────────────────────────────────────────────────────┤
│ 📊 3 Agents | 🟢 2 Running | 💰 12.5K tokens | 🕐 00:15:32  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │ 🟢 代码审查   │  │ 🔵 功能实现   │  │ ⚪ 测试编写   │        │
│  │ claude-4     │  │ gpt-5        │  │ composer-2   │        │
│  │ ────────────  │  │ ────────────  │  │ ────────────  │        │
│  │ [输出流...]   │  │ [输出流...]   │  │ [等待 Agent1]│        │
│  │              │  │              │  │              │        │
│  │ [prompt 输入] │  │ [prompt 输入] │  │ [prompt 输入] │        │
│  │ ↗️引用 ✋暂停 │  │ ↗️引用 ✋暂停 │  │ ↗️引用 ✋暂停 │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                │
│  [+ 新建 Agent]  [🔄 工作流模板]  [📜 历史记录]               │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ 连接状态: ✅ bridge v1.0.0 | 📂 /Users/user/my-project       │
│ [⏹ 停止服务]                                                   │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 工作流编排视图

```
┌──────────────────────────────────────────┐
│ 🔄 代码审查流水线                   [运行] │
├──────────────────────────────────────────┤
│                                          │
│  [审查 Agent] ──→ [修复 Agent] ──→ [测试] │
│   claude-4        gpt-5         composer │
│   ✅ 完成         🟢 运行中      ⏳ 等待  │
│                                          │
│  进度: ████████░░░░░░ 66%               │
└──────────────────────────────────────────┘
```

---

## 6. 实现路径

### Phase 1: 基础矩阵 (预期 3-4 天) — ✅ 全部完成
- [x] SQLite 持久化层 ✅ (WAL 模式, projects/conversations/messages/agent_presets 表)
- [x] 矩阵视图 UI ✅ (全屏卡片网格 + 实时状态 + SSE 输出流 + 折叠/展开 + 拖拽调整大小)
- [x] 项目管理 API ✅ (CRUD + last_opened 追踪)
- [x] 项目管理 UI ✅ (顶部下拉项目切换器 + 搜索 + 添加项目)
- [x] 对话历史存储 ✅ (conversations + messages 表, 按项目/Agent 筛选)
- [x] 对话历史 UI ✅ (侧边栏历史列表 + 详情弹窗)
- [x] 对话自动保存 ✅ (createAgent 自动创建 conversation, sendPrompt/SSE 自动保存消息)
- [x] 对话历史恢复 ✅ (一键"继续对话"按钮)
- [x] 历史消息计数 ✅ (列表展示每个对话的消息条数)

### Phase 1.5: 调研成果落地 (预期 2-3 天) — ✅ 全部完成
> 基于 [Agent 生态调研 2026](../research/agent-ecosystem-research-2026.md) 的短期可落地建议

- [x] **Agent 角色 Skill 化** ✅ — AGENT_TEMPLATES 升级为完整角色 Skill（含 role/behavior/outputFormat/constraints），sendPrompt 自动注入 Skill 系统提示
- [x] **进度追踪卡片** ✅ — Agent 卡片集成任务进度条，SSE 事件驱动实时更新（running → streaming → complete/error），含进度动画
- [x] **项目切换器 UI** ✅ — 顶部下拉项目选择器，切换后 Agent 列表和历史自动过滤
- [x] **对话搜索** ✅ — 历史侧边栏加入关键词搜索 + 后端搜索 API (LIKE 匹配)
- [x] **对话删除** ✅ — 前端删除按钮 + 后端 DELETE API，含确认提示

### Phase 2: Agent 协作 (预期 3-4 天) — ✅ 全部完成
- [x] Agent 间消息传递 API ✅ (POST /agents/:id/message + GET messages + 标记已读, SQLite agent_messages 表)
- [x] 结果引用机制 ✅ (前端 @agent-name 文本替换已实现)
- [x] 依赖编排 ✅ (线性依赖: SSE 完成事件自动触发下游 Agent，含 UI 链接设置 Modal + _triggerDependents 引擎)

### Phase 3: 工作流系统 (预期 2-3 天) — ✅ 全部完成
- [x] 工作流模板数据结构 + SQLite 存储 ✅ (workflows 表, CRUD API)
- [x] 5 个内置工作流 ✅ (代码审查/功能开发/重构/安全/文档，含参数化变量)
- [x] 工作流执行引擎 ✅ (基于 Agent 依赖链的自动触发，DAG 根节点并发启动)
- [x] 工作流选择和运行 UI ✅ (工作流模板面板，步骤预览，参数输入，一键运行)

### Phase 4: 增强功能 (预期 2-3 天) — ✅ 全部完成
- [x] Token 用量追踪（单次/累计/项目级） ✅ 后端 token_usage 表 + API + 前端统计面板
- [x] Human-in-the-Loop 审批门 ✅ 审批门 + 紧急中断 + 前端审批弹窗
- [x] 可观测性面板（日志流 + 工具调用追踪） ✅ (升级为 Phase 4.5 白盒可观测性系统 + 前端实时日志流面板)
- [x] 项目级 Agent 配置 ✅ agent_presets 字段 + CRUD API
- [x] 项目更新 API (PUT /projects/:id) ✅
- [ ] Skill 自学习 — 借鉴 Hermes，用户常用工作流自动保存为模板

### Phase 4.5: 白盒可观测性系统 (预期 5-7 天) — ✅ 全部完成
> 为多角色协作系统（Phase 5）构建透明的可观测性层，让用户能看透每个 Agent 的思考过程、决策依据、角色间的信息流动、以及整个生命周期的因果链。

- [x] **数据模型**: `TraceEvent`/`TraceMetadata`/`TraceType` 等 18 种事件类型定义 ✅
- [x] **存储层**: SQLite `traces`/`decisions`/`causal_links` 三表 + 索引 ✅
- [x] **服务层**: `trace-service.ts` — recordTrace/recordDecision/linkCause + 10+ 查询 API ✅
- [x] **事件采集**: `agent-pool.ts` 持久化 thinking/tool_call/tool_result ✅
- [x] **Phase 5 钩子**: `phase5-trace-hooks.ts` — 15 个专用采集函数 (opinion/decision/delegation/bug_report 等) ✅
- [x] **API 端点**: `routes/traces.ts` — 10 个 RESTful 端点 ✅
- [x] **时间线视图**: 按时间排列，颜色区分角色，筛选器（阶段/类型）✅
- [x] **决策日志视图**: 结构化展示支持/反对/理由，可展开因果链 ✅
- [x] **角色视角视图**: 角色选择器 + 按角色分类展示 + 影响力指标 ✅
- [x] **因果图视图**: 有向图节点展示 + 关系连线描述 ✅
- [x] **回放模式**: 播放/暂停/步进控制 + 时间轴进度条 ✅

### Phase 5: 企业级多角色协作系统 (预期 5-7 天) — ✅ 核心完成
> 基于 A2A 协议理念，构建模拟真实公司团队的多角色 Agent 协作系统。
> 覆盖产品全生命周期：需求分析 → 方案讨论 → 开发执行 → 质量保障 → 上线部署。

- [x] **5.1 智能任务分析器 (Task Analyzer)** ✅ LLM 自动分析需求 + 角色推荐 + DAG 执行计划
- [x] **5.2 企业角色模板体系 (Enterprise Roles)** ✅ 10 个内置角色 + RoleSkill 完整定义 + 系统提示构建
- [x] **5.3 多 Agent 讨论机制 (Discussion Protocol)** ✅ 结构化多轮讨论 + Tech Lead 总结裁决
- [x] **5.4 执行 Agent 带队制 (Execution Squad)** ✅ 项目经理分配 + 任务执行 + 代码审查 + 进度追踪
- [x] **5.5 QA 闭环系统 (QA Feedback Loop)** ✅ 测试用例执行 + Bug 报告 + 修复分配 + 回归测试 + 质量门
- [x] **5.6 完成条件与总结报告 (Completion Criteria)** ✅ 项目报告生成 + 各阶段汇总 + 全局指标

### Phase 6: 生态集成 (远期) — ✅ 全部完成
- [x] A2A 协议 Agent Card 暴露 ✅ (/.well-known/agent.json + /a2a/capabilities)
- [x] 浏览器自动化测试 ✅ CDP 协议连接 + 8 种动作 (navigate/click/type/screenshot/evaluate/waitFor/getContent/getTabs) + 批量执行 + 连接状态检测
- [x] 跨会话长期记忆 ✅ SQLite FTS5 全文搜索 + 5 种记忆类型 + CRUD + 自动提取 + 重要度排序 + 访问频次追踪
- [x] 多用户隔离 ✅ Bearer Token 认证 + SHA-256 哈希 + 角色权限 (admin/user/readonly) + API Token 管理 + 单/多用户模式切换

**总预期**: 20-27 天

---

## 6.5 Phase 5 功能详细规格

### 5.1 智能任务分析器 (Task Analyzer)

**核心理念**: 用户输入一段自然语言需求（如"做一个电商小程序"），大模型自动分析需要哪些角色参与，生成角色编排方案和执行计划。

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 需求解析 | 大模型分析用户需求，提取关键信息（类型/规模/技术栈/时间要求） | 输入自然语言，输出结构化需求摘要 |
| 角色推荐 | 根据需求自动推荐需要参与的角色列表 | 推荐列表含角色名、理由、优先级 |
| 执行计划生成 | 生成分阶段的执行计划（讨论→执行→测试→上线） | DAG 式执行计划，含阶段、角色、依赖关系 |
| 计划审批 | 用户确认/修改角色编排方案后启动 | Human-in-the-Loop 审批门 |

**参考**: gstack 的 `/office-hours` + autoresearch 的 program.md

```typescript
interface TaskAnalysis {
  id: string;
  originalRequirement: string;
  summary: {
    type: 'feature' | 'bugfix' | 'refactor' | 'infra' | 'research';
    scope: 'small' | 'medium' | 'large' | 'epic';
    techStack: string[];
    estimatedComplexity: 1 | 2 | 3 | 4 | 5;
  };
  recommendedRoles: RoleRecommendation[];
  executionPlan: ExecutionPlan;
  createdAt: number;
}

interface RoleRecommendation {
  roleId: string;
  reason: string;
  priority: 'required' | 'recommended' | 'optional';
  phase: 'discussion' | 'execution' | 'qa' | 'deployment';
}

interface ExecutionPlan {
  phases: ExecutionPhase[];
  maxRounds: number;
  successCriteria: string[];
}

interface ExecutionPhase {
  id: string;
  name: string;
  type: 'discussion' | 'execution' | 'qa' | 'deployment' | 'summary';
  roles: string[];
  dependsOn: string[];
  maxRounds: number;
  exitCondition: string;
}
```

---

### 5.2 企业角色模板体系 (Enterprise Roles)

**核心理念**: 预置一套模拟真实公司的固定角色 Agent，每个角色有独立的行为模式、专业视角、输出格式和约束条件。

| 角色 | 职责 | 阶段 | Skill 行为 |
|------|------|------|-----------|
| **运营 (Operations)** | 市场分析、用户需求收集、ROI 评估 | 讨论 | 关注商业价值、用户增长、竞品差异 |
| **业务 (Business)** | 业务流程梳理、业务规则定义 | 讨论 | 关注业务逻辑完整性、异常流程、合规性 |
| **产品经理 (Product)** | 需求拆解、PRD 编写、优先级排序 | 讨论 | 关注用户体验、功能边界、MVP 范围 |
| **项目经理 (Project)** | 执行计划、进度管理、风险评估 | 讨论+执行 | 关注时间线、资源分配、阻塞点 |
| **架构师 (Architect)** | 技术方案、架构设计、技术选型 | 讨论+执行 | 关注可扩展性、性能、安全、技术债 |
| **资深开发 (Senior Dev)** | 核心模块设计、代码审查、技术指导 | 执行 | 关注代码质量、设计模式、最佳实践 |
| **一线开发 (Developer)** | 功能实现、单元测试、Bug 修复 | 执行 | 关注代码实现、测试覆盖、文档 |
| **测试 (QA)** | 测试用例、Bug 报告、回归测试 | QA | 关注边界条件、异常处理、用户场景 |
| **运维 (DevOps)** | 部署方案、监控、上线检查 | 部署 | 关注环境配置、CI/CD、回滚方案 |
| **技术负责人 (Tech Lead)** | 全局协调、技术决策仲裁、质量把关 | 全程 | 关注全局一致性、技术方向、团队效率 |

```typescript
interface EnterpriseRole {
  id: string;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  phase: ('discussion' | 'execution' | 'qa' | 'deployment')[];
  skill: RoleSkill;
}

interface RoleSkill {
  role: string;
  goal: string;
  backstory: string;
  behavior: string[];
  outputFormat: string;
  constraints: string[];
  focusAreas: string[];
  canDelegate: boolean;
  canVeto: boolean;
}
```

**内置角色模板**:

```typescript
const ENTERPRISE_ROLES: EnterpriseRole[] = [
  {
    id: 'operations',
    name: '运营',
    nameEn: 'Operations',
    icon: '📊',
    phase: ['discussion'],
    skill: {
      role: '运营分析师',
      goal: '从市场和用户角度评估需求的商业价值',
      backstory: '拥有5年互联网运营经验，擅长数据分析和用户增长策略',
      behavior: [
        '用数据和案例支撑观点',
        '关注用户获取成本和留存率',
        '评估需求对现有用户的影响'
      ],
      outputFormat: '商业分析报告（含数据指标、竞品对比、ROI 预估）',
      constraints: ['不涉及技术实现细节', '基于市场数据说话'],
      focusAreas: ['商业价值', '用户增长', '竞品差异', 'ROI'],
      canDelegate: false,
      canVeto: false
    }
  },
  {
    id: 'product',
    name: '产品经理',
    nameEn: 'Product Manager',
    icon: '📋',
    phase: ['discussion'],
    skill: {
      role: '产品经理',
      goal: '将需求转化为可执行的产品方案',
      backstory: '资深产品经理，擅长需求分析和用户体验设计',
      behavior: [
        '拆解需求为用户故事',
        '定义功能优先级（P0/P1/P2）',
        '考虑极端情况和边界条件'
      ],
      outputFormat: 'PRD 文档（含用户故事、功能列表、优先级、验收标准）',
      constraints: ['不做技术选型', '以用户价值为导向'],
      focusAreas: ['用户体验', '功能边界', 'MVP 范围', '优先级'],
      canDelegate: false,
      canVeto: false
    }
  },
  {
    id: 'project-manager',
    name: '项目经理',
    nameEn: 'Project Manager',
    icon: '📅',
    phase: ['discussion', 'execution'],
    skill: {
      role: '项目经理（执行负责人）',
      goal: '制定执行计划并协调团队按时交付',
      backstory: '敏捷开发实践者，PMP 认证，擅长风险管理',
      behavior: [
        '将产品方案拆解为开发任务',
        '评估任务工时和依赖关系',
        '识别阻塞点并提出解决方案',
        '分配任务给合适的开发角色'
      ],
      outputFormat: '执行计划（含任务列表、时间线、角色分配、风险矩阵）',
      constraints: ['不写代码', '关注进度和风险'],
      focusAreas: ['时间线', '资源分配', '阻塞点', '里程碑'],
      canDelegate: true,
      canVeto: false
    }
  },
  {
    id: 'architect',
    name: '架构师',
    nameEn: 'Architect',
    icon: '🏗️',
    phase: ['discussion', 'execution'],
    skill: {
      role: '技术架构师',
      goal: '设计可靠、可扩展的技术方案',
      backstory: '10年+系统架构经验，经历过大规模系统的演进',
      behavior: [
        '评估技术方案的可行性和风险',
        '设计模块划分和接口规范',
        '选择合适的技术栈和框架',
        '考虑性能、安全和可维护性'
      ],
      outputFormat: '技术方案（含架构图、模块划分、接口定义、技术选型理由）',
      constraints: ['不写业务代码', '关注架构层面'],
      focusAreas: ['可扩展性', '性能', '安全', '技术债'],
      canDelegate: false,
      canVeto: true
    }
  },
  {
    id: 'senior-dev',
    name: '资深开发',
    nameEn: 'Senior Developer',
    icon: '👨‍💻',
    phase: ['execution'],
    skill: {
      role: '资深开发工程师',
      goal: '负责核心模块的设计和实现，指导初级开发',
      backstory: '全栈开发专家，代码洁癖，追求工程卓越',
      behavior: [
        '设计核心模块的详细方案',
        '编写关键代码和示例',
        '审查其他开发者的代码',
        '解决技术难题'
      ],
      outputFormat: '代码实现（含设计说明、核心代码、单元测试）',
      constraints: ['遵循架构师的技术方案', '代码必须有测试'],
      focusAreas: ['代码质量', '设计模式', '最佳实践', '性能优化'],
      canDelegate: true,
      canVeto: false
    }
  },
  {
    id: 'developer',
    name: '一线开发',
    nameEn: 'Developer',
    icon: '💻',
    phase: ['execution'],
    skill: {
      role: '开发工程师',
      goal: '按照设计方案实现具体功能',
      backstory: '执行力强的开发者，注重细节和测试覆盖',
      behavior: [
        '根据任务分配实现具体功能',
        '编写单元测试',
        '修复 Bug',
        '编写代码注释和文档'
      ],
      outputFormat: '功能代码（含实现代码、测试代码、改动说明）',
      constraints: ['遵循资深开发的设计', '不擅自修改公共接口'],
      focusAreas: ['功能实现', '测试覆盖', '文档', 'Bug 修复'],
      canDelegate: false,
      canVeto: false
    }
  },
  {
    id: 'qa',
    name: '测试',
    nameEn: 'QA Engineer',
    icon: '🧪',
    phase: ['qa'],
    skill: {
      role: 'QA 测试工程师',
      goal: '确保产品质量，发现并报告所有缺陷',
      backstory: '质量强迫症，擅长发现边界条件和异常场景',
      behavior: [
        '编写测试用例（正常流程 + 异常流程 + 边界条件）',
        '执行测试并记录结果',
        '提交 Bug 报告（含复现步骤、期望结果、实际结果）',
        '回归测试确认修复'
      ],
      outputFormat: 'Bug 报告（含严重度、复现步骤、截图、期望vs实际）',
      constraints: ['不修改代码', '每个 Bug 必须可复现'],
      focusAreas: ['边界条件', '异常处理', '用户场景', '回归测试'],
      canDelegate: false,
      canVeto: true
    }
  },
  {
    id: 'devops',
    name: '运维',
    nameEn: 'DevOps Engineer',
    icon: '🚀',
    phase: ['deployment'],
    skill: {
      role: '运维工程师',
      goal: '确保安全、稳定的部署和运行',
      backstory: 'SRE 实践者，追求 99.9% 可用性',
      behavior: [
        '制定部署方案和回滚策略',
        '配置 CI/CD 流水线',
        '检查安全和性能指标',
        '监控上线后的运行状态'
      ],
      outputFormat: '部署报告（含部署步骤、环境配置、监控指标、回滚方案）',
      constraints: ['不修改业务代码', '必须有回滚方案'],
      focusAreas: ['环境配置', 'CI/CD', '回滚方案', '监控'],
      canDelegate: false,
      canVeto: true
    }
  },
  {
    id: 'tech-lead',
    name: '技术负责人',
    nameEn: 'Tech Lead',
    icon: '🎯',
    phase: ['discussion', 'execution', 'qa', 'deployment'],
    skill: {
      role: '技术负责人（全局协调者）',
      goal: '全局把控技术方向和质量，协调团队高效交付',
      backstory: '从一线开发成长起来的技术管理者，兼具技术深度和管理视野',
      behavior: [
        '在讨论阶段收集各方意见并做出决策',
        '在执行阶段监控进度并协调资源',
        '在 QA 阶段评估 Bug 严重度并决定是否阻塞上线',
        '在部署阶段做最终 Go/No-Go 决策'
      ],
      outputFormat: '决策记录（含各方意见摘要、决策理由、行动项）',
      constraints: ['不直接写代码', '保持中立客观'],
      focusAreas: ['全局一致性', '技术方向', '团队效率', '质量把关'],
      canDelegate: true,
      canVeto: true
    }
  }
];
```

**参考**: CrewAI 角色团队 + gstack 的 6 角色 Skill 体系

---

### 5.3 多 Agent 讨论机制 (Discussion Protocol)

**核心理念**: 不是简单的消息传递，而是结构化的"团队会议"模式。多个 Agent 围绕一个议题发表各自专业视角的意见，由 Tech Lead 总结讨论结果并形成决策。

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 讨论会议创建 | 根据议题自动邀请相关角色参与 | 议题 → 角色匹配 → 讨论开始 |
| 轮次发言 | 每个角色按顺序或并行发表意见 | 每个角色从自身专业视角发言 |
| 交叉引用 | 角色可以引用和回应其他角色的观点 | 支持 `@role-name` 引用 |
| 讨论收敛 | Tech Lead 总结各方观点，形成共识 | 输出讨论纪要 + 行动项 |
| 分歧处理 | 当角色间有分歧时，Tech Lead 做最终裁决 | 记录分歧点和裁决理由 |
| 讨论轮次上限 | 设定最大讨论轮次，避免无限争论 | 默认 3 轮，可配置 |

```typescript
interface Discussion {
  id: string;
  taskAnalysisId: string;
  topic: string;
  phase: 'discussion' | 'execution-review' | 'qa-review' | 'deployment-review';
  participants: DiscussionParticipant[];
  rounds: DiscussionRound[];
  maxRounds: number;
  currentRound: number;
  status: 'active' | 'concluded' | 'timeout';
  conclusion?: DiscussionConclusion;
  createdAt: number;
}

interface DiscussionParticipant {
  roleId: string;
  joinedAt: number;
  messageCount: number;
}

interface DiscussionRound {
  roundNumber: number;
  messages: DiscussionMessage[];
  summary?: string;
}

interface DiscussionMessage {
  id: string;
  roleId: string;
  content: string;
  references: string[];
  timestamp: number;
  type: 'opinion' | 'question' | 'objection' | 'agreement' | 'decision';
}

interface DiscussionConclusion {
  summary: string;
  decisions: Decision[];
  actionItems: ActionItem[];
  dissents: Dissent[];
}

interface Decision {
  topic: string;
  decision: string;
  reason: string;
  decidedBy: string;
}

interface ActionItem {
  description: string;
  assignedTo: string;
  priority: 'P0' | 'P1' | 'P2';
  deadline?: string;
}

interface Dissent {
  roleId: string;
  point: string;
  resolution: string;
}
```

**讨论流程图**:

```
用户需求 → 任务分析器
               ↓
         角色推荐 + 执行计划
               ↓ (用户审批)
    ┌─── 讨论阶段 (Phase: Discussion) ───┐
    │                                     │
    │  Round 1: 各角色从专业视角发言        │
    │  ├── 运营: 商业价值分析              │
    │  ├── 产品: 需求拆解 + 优先级         │
    │  ├── 架构: 技术可行性评估            │
    │  └── 项目: 工时评估 + 风险           │
    │                                     │
    │  Round 2: 交叉回应 + 补充            │
    │  ├── 产品 回应 运营的建议             │
    │  ├── 架构 反驳/支持 产品的方案        │
    │  └── 项目 调整计划                   │
    │                                     │
    │  Round 3 (如有分歧): Tech Lead 裁决   │
    │                                     │
    │  → 讨论纪要 + 执行方案确定            │
    └─────────────────────────────────────┘
               ↓
         执行阶段 (Phase: Execution)
```

**参考**: AutoGen 对话协商 + Superpowers 强制 brainstorm

---

### 5.4 执行 Agent 带队制 (Execution Squad)

**核心理念**: 项目经理 Agent 作为"执行负责人"，指挥资深开发和一线开发 Agent 落地项目。项目经理负责任务分配和进度管理，开发 Agent 负责代码实现。

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 任务分解 | 项目经理根据讨论结论，分解为具体开发任务 | 每个任务有明确的输入/输出/验收标准 |
| 任务分配 | 项目经理将任务分配给资深开发或一线开发 | 根据任务复杂度匹配角色 |
| 进度监控 | 项目经理实时监控各任务状态 | 卡片上显示整体进度条 |
| 代码审查 | 资深开发审查一线开发的输出 | 审查通过后才算任务完成 |
| 阶段汇报 | 每个里程碑节点，项目经理汇报进度 | 输出进度报告，含完成/进行中/阻塞任务 |
| 问题升级 | 遇到技术难题，升级到架构师或 Tech Lead | 自动触发讨论流程 |

```typescript
interface ExecutionSquad {
  id: string;
  taskAnalysisId: string;
  leaderId: string;
  members: SquadMember[];
  tasks: ExecutionTask[];
  milestones: Milestone[];
  status: 'planning' | 'executing' | 'reviewing' | 'completed' | 'blocked';
  currentMilestone: number;
  progressPercent: number;
}

interface SquadMember {
  roleId: string;
  agentId: string;
  assignedTasks: string[];
  completedTasks: string[];
}

interface ExecutionTask {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  reviewerId?: string;
  status: 'pending' | 'in_progress' | 'in_review' | 'completed' | 'blocked' | 'failed';
  priority: 'P0' | 'P1' | 'P2';
  dependsOn: string[];
  input: string;
  expectedOutput: string;
  actualOutput?: string;
  reviewComment?: string;
  startedAt?: number;
  completedAt?: number;
}

interface Milestone {
  id: string;
  name: string;
  tasks: string[];
  status: 'pending' | 'in_progress' | 'completed';
  dueDescription: string;
}
```

**执行流程**:

```
讨论结论 → 项目经理 Agent
               ↓
         任务分解 + 分配
    ┌──────────────────────────────────┐
    │  资深开发 Agent        一线开发 Agent  │
    │  ├── 核心模块设计       ├── 功能 A 实现  │
    │  ├── 接口定义           ├── 功能 B 实现  │
    │  └── 代码审查 ←──────── └── 单元测试    │
    │         ↓                              │
    │    审查通过/打回                         │
    └──────────────────────────────────┘
               ↓ (所有任务完成)
         阶段汇报 → 进入 QA 阶段
```

**参考**: gstack 的 Ship 工作流 + Deep Agents 的 Sub-agent 隔离

---

### 5.5 QA 闭环系统 (QA Feedback Loop)

**核心理念**: 测试 Agent 独立执行测试用例，发现 Bug 后反馈给执行 Agent（项目经理），由项目经理分配修复任务，修复后再次测试，形成闭环直到质量达标。

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 测试计划生成 | QA Agent 根据产品方案生成测试计划 | 含正常流程 + 异常流程 + 边界测试 |
| 测试用例执行 | QA Agent 逐条执行测试用例 | 每条用例有 pass/fail 状态和详情 |
| Bug 报告 | QA Agent 提交结构化的 Bug 报告 | 含严重度、复现步骤、期望vs实际 |
| Bug 分配 | 项目经理收到 Bug 报告后分配修复任务 | Bug → 开发任务 → 分配给开发 Agent |
| Bug 修复 | 开发 Agent 修复 Bug 并提交 | 修复代码 + 说明 |
| 回归测试 | QA Agent 对修复的 Bug 进行回归测试 | 确认修复 → 关闭 Bug；未修复 → 重新打回 |
| 质量报告 | QA Agent 输出整体质量报告 | 含通过率、Bug 统计、质量评分 |

```typescript
interface QASession {
  id: string;
  taskAnalysisId: string;
  executionSquadId: string;
  testPlan: TestPlan;
  bugs: Bug[];
  rounds: QARound[];
  maxRounds: number;
  currentRound: number;
  qualityScore: number;
  passThreshold: number;
  status: 'planning' | 'testing' | 'waiting_fix' | 'regression' | 'passed' | 'failed';
}

interface TestPlan {
  testCases: TestCase[];
  coverageAreas: string[];
}

interface TestCase {
  id: string;
  title: string;
  type: 'functional' | 'edge_case' | 'performance' | 'security';
  steps: string[];
  expectedResult: string;
  actualResult?: string;
  status: 'pending' | 'pass' | 'fail' | 'blocked';
  bugId?: string;
}

interface Bug {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor' | 'cosmetic';
  testCaseId: string;
  reproSteps: string[];
  expected: string;
  actual: string;
  assignedTo?: string;
  fixDescription?: string;
  status: 'open' | 'assigned' | 'fixing' | 'fixed' | 'verified' | 'reopened' | 'wontfix';
  round: number;
}

interface QARound {
  roundNumber: number;
  testResults: { testCaseId: string; status: 'pass' | 'fail' }[];
  newBugs: string[];
  fixedBugs: string[];
  reopenedBugs: string[];
  passRate: number;
  timestamp: number;
}
```

**QA 闭环流程**:

```
执行完成 → QA Agent 介入
               ↓
         生成测试计划
               ↓
    ┌─── QA Round 1 ───────────────────┐
    │  执行测试用例                       │
    │  ├── Case 1: ✅ Pass              │
    │  ├── Case 2: ❌ Fail → Bug #1     │
    │  ├── Case 3: ✅ Pass              │
    │  └── Case 4: ❌ Fail → Bug #2     │
    │  通过率: 50%  (未达标 80%)         │
    └───────────────────────────────────┘
               ↓ (反馈给项目经理)
    ┌─── Bug 修复 ─────────────────────┐
    │  项目经理分配:                      │
    │  ├── Bug #1 → 一线开发 修复        │
    │  └── Bug #2 → 资深开发 修复        │
    └───────────────────────────────────┘
               ↓ (修复完成)
    ┌─── QA Round 2 (回归测试) ────────┐
    │  ├── Bug #1 回归: ✅ Verified     │
    │  ├── Bug #2 回归: ❌ Reopened     │
    │  └── 新增测试: ✅ Pass             │
    │  通过率: 75%  (未达标)             │
    └───────────────────────────────────┘
               ↓ (继续修复 + 测试)
    ┌─── QA Round 3 ───────────────────┐
    │  通过率: 95%  (达标 ✅)            │
    │  → 生成质量报告 → 进入部署阶段      │
    └───────────────────────────────────┘
```

**参考**: gstack `/qa` + `/qa-only` 的三层测试体系 + Superpowers 验证优先

---

### 5.6 完成条件与总结报告 (Completion Criteria)

**核心理念**: 定义明确的完成标准。每个阶段有退出条件，整体有最大轮次限制。无论成功或超时，都生成结构化的总结报告。

| 功能 | 描述 | 验收标准 |
|------|------|---------|
| 阶段退出条件 | 每个阶段有可配置的退出条件 | 讨论轮次/通过率/审批等 |
| 全局轮次上限 | 整个流程有最大轮次上限，防止无限循环 | 默认总轮次上限 10 轮 |
| 质量达标判定 | QA 通过率达到阈值即为达标 | 默认阈值 80%，可配置 |
| 超时总结 | 超过最大轮次仍未达标，生成失败总结 | 含未解决问题、建议、下一步行动 |
| 成功报告 | 达标后生成完整的交付报告 | 含需求摘要、讨论纪要、实现说明、测试报告 |
| 过程回放 | 可回看整个协作过程的时间线 | 按阶段/角色/时间查看所有消息 |

```typescript
interface CompletionCriteria {
  discussion: {
    maxRounds: number;
    requireConsensus: boolean;
  };
  execution: {
    maxIterations: number;
    requireCodeReview: boolean;
  };
  qa: {
    maxRounds: number;
    passRateThreshold: number;
    blockOnCriticalBugs: boolean;
  };
  deployment: {
    requireApproval: boolean;
    requireRollbackPlan: boolean;
  };
  global: {
    maxTotalRounds: number;
    timeoutMinutes: number;
  };
}

interface ProjectReport {
  id: string;
  taskAnalysisId: string;
  status: 'success' | 'partial' | 'timeout' | 'failed';
  summary: string;
  phases: PhaseReport[];
  metrics: ProjectMetrics;
  createdAt: number;
}

interface PhaseReport {
  phase: string;
  status: 'completed' | 'partial' | 'skipped';
  duration: number;
  rounds: number;
  participants: string[];
  keyDecisions: string[];
  outputSummary: string;
}

interface ProjectMetrics {
  totalDuration: number;
  totalRounds: number;
  totalMessages: number;
  totalTokens: number;
  discussionRounds: number;
  executionTasks: number;
  completedTasks: number;
  totalBugs: number;
  fixedBugs: number;
  qaPassRate: number;
  rolesInvolved: string[];
}
```

**完成判定流程**:

```
                    ┌──────────────────┐
                    │  检查完成条件      │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
         QA 通过率       达到轮次上限    关键 Bug
         ≥ 阈值         或超时          仍未修复
              ↓              ↓              ↓
         ✅ 达标          ⚠️ 超时         ❌ 阻塞
              ↓              ↓              ↓
         成功报告        超时总结报告     失败报告
         (完整交付)      (含未解决问题)   (含阻塞原因)
              ↓              ↓              ↓
         → 部署阶段      → 人工介入       → 人工介入
         或直接结束       决定下一步        决定下一步
```

---

### 5.7 完整生命周期流程图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    用户提交需求（自然语言）                            │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Phase A: 智能分析                                                   │
│  任务分析器 → 需求解析 + 角色推荐 + 执行计划 → 用户审批               │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓ 审批通过
┌─────────────────────────────────────────────────────────────────────┐
│  Phase B: 团队讨论                                                   │
│  运营 + 业务 + 产品 + 架构 + 项目 → 多轮讨论 → Tech Lead 总结决策    │
│  输出: 讨论纪要 + 产品方案 + 技术方案 + 执行计划                      │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Phase C: 执行落地                                                   │
│  项目经理(带队) + 资深开发 + 一线开发 → 任务分解 → 编码 → 审查        │
│  输出: 代码实现 + 设计文档 + 单元测试                                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Phase D: 质量保障                                                   │
│  QA Agent → 测试计划 → 执行测试 → Bug 报告 → 修复 → 回归测试         │
│  ↻ 循环直到通过率达标 或 达到轮次上限                                  │
│  输出: 质量报告 + Bug 清单                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Phase E: 上线部署                                                   │
│  运维 Agent → 部署方案 → 上线检查 → Tech Lead Go/No-Go 决策          │
│  输出: 部署报告 + 监控方案                                           │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Phase F: 总结报告                                                   │
│  生成完整交付报告: 需求→讨论→实现→测试→部署 全过程记录                 │
│  可回放整个协作时间线                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 5.8 新增 SQLite 表

```sql
-- 任务分析
CREATE TABLE task_analyses (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  original_requirement TEXT NOT NULL,
  summary TEXT NOT NULL,           -- JSON: TaskAnalysis.summary
  recommended_roles TEXT NOT NULL, -- JSON: RoleRecommendation[]
  execution_plan TEXT NOT NULL,    -- JSON: ExecutionPlan
  status TEXT DEFAULT 'draft',     -- draft/approved/executing/completed
  created_at INTEGER NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

-- 讨论会议
CREATE TABLE discussions (
  id TEXT PRIMARY KEY,
  task_analysis_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  phase TEXT NOT NULL,
  participants TEXT NOT NULL,      -- JSON: DiscussionParticipant[]
  rounds TEXT NOT NULL,            -- JSON: DiscussionRound[]
  max_rounds INTEGER DEFAULT 3,
  current_round INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  conclusion TEXT,                 -- JSON: DiscussionConclusion
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_analysis_id) REFERENCES task_analyses(id)
);

-- 执行小队
CREATE TABLE execution_squads (
  id TEXT PRIMARY KEY,
  task_analysis_id TEXT NOT NULL,
  leader_role TEXT NOT NULL,
  members TEXT NOT NULL,           -- JSON: SquadMember[]
  tasks TEXT NOT NULL,             -- JSON: ExecutionTask[]
  milestones TEXT,                 -- JSON: Milestone[]
  status TEXT DEFAULT 'planning',
  progress_percent INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_analysis_id) REFERENCES task_analyses(id)
);

-- QA 会话
CREATE TABLE qa_sessions (
  id TEXT PRIMARY KEY,
  task_analysis_id TEXT NOT NULL,
  execution_squad_id TEXT NOT NULL,
  test_plan TEXT NOT NULL,         -- JSON: TestPlan
  bugs TEXT NOT NULL,              -- JSON: Bug[]
  rounds TEXT NOT NULL,            -- JSON: QARound[]
  max_rounds INTEGER DEFAULT 5,
  current_round INTEGER DEFAULT 0,
  quality_score REAL DEFAULT 0,
  pass_threshold REAL DEFAULT 80,
  status TEXT DEFAULT 'planning',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_analysis_id) REFERENCES task_analyses(id),
  FOREIGN KEY (execution_squad_id) REFERENCES execution_squads(id)
);

-- 项目报告
CREATE TABLE project_reports (
  id TEXT PRIMARY KEY,
  task_analysis_id TEXT NOT NULL,
  status TEXT NOT NULL,            -- success/partial/timeout/failed
  summary TEXT NOT NULL,
  phases TEXT NOT NULL,            -- JSON: PhaseReport[]
  metrics TEXT NOT NULL,           -- JSON: ProjectMetrics
  created_at INTEGER NOT NULL,
  FOREIGN KEY (task_analysis_id) REFERENCES task_analyses(id)
);

CREATE INDEX idx_task_project ON task_analyses(project_id);
CREATE INDEX idx_discussion_task ON discussions(task_analysis_id);
CREATE INDEX idx_squad_task ON execution_squads(task_analysis_id);
CREATE INDEX idx_qa_task ON qa_sessions(task_analysis_id);
CREATE INDEX idx_report_task ON project_reports(task_analysis_id);
```

---

### 5.9 新增 API 端点

```http
# 任务分析
POST   /tasks/analyze              — 提交需求，LLM 分析并生成角色编排方案
GET    /tasks/:id                  — 获取任务分析详情
PATCH  /tasks/:id/approve          — 审批执行计划（可修改角色/参数）
GET    /tasks/:id/status           — 获取任务全局状态（含各阶段进度）

# 讨论
POST   /tasks/:id/discussions      — 创建讨论会议
GET    /tasks/:id/discussions       — 获取讨论列表
POST   /discussions/:id/speak      — 角色发言
POST   /discussions/:id/conclude   — Tech Lead 总结讨论
GET    /discussions/:id            — 获取讨论详情（含所有轮次消息）

# 执行小队
POST   /tasks/:id/squads           — 创建执行小队（基于讨论结论）
GET    /squads/:id                 — 获取小队状态
POST   /squads/:id/assign          — 分配任务
PATCH  /squads/:id/tasks/:taskId   — 更新任务状态
POST   /squads/:id/escalate        — 问题升级（触发讨论）

# QA
POST   /tasks/:id/qa               — 启动 QA 会话
GET    /qa/:id                     — 获取 QA 会话状态
POST   /qa/:id/run                 — 执行一轮测试
POST   /qa/:id/bugs                — 提交 Bug 报告
PATCH  /qa/:id/bugs/:bugId         — 更新 Bug 状态
POST   /qa/:id/regression          — 执行回归测试

# 报告
GET    /tasks/:id/report           — 获取项目报告
POST   /tasks/:id/report/generate  — 生成总结报告

# 企业角色
GET    /roles                      — 获取所有可用角色模板
GET    /roles/:id                  — 获取角色详情
```

---

### 5.10 UI 设计

#### 任务协作总览

```
┌────────────────────────────────────────────────────────────────────┐
│ ⬡ Cursor Bridge            项目: [my-project ▼]   🔍  ⚙️  ❌     │
├────────────────────────────────────────────────────────────────────┤
│ 📋 任务: "电商小程序开发"                          轮次: 3/10      │
│ 进度: ████████████░░░░ 70%    阶段: QA 测试中     通过率: 85%     │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  [A.分析] → [B.讨论] → [C.执行] → [D.QA] → [E.部署] → [F.总结]    │
│    ✅        ✅        ✅       🟢       ⏳        ⏳              │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  ┌── 当前阶段: QA 测试 (Round 2/5) ─────────────────────────┐     │
│  │                                                           │     │
│  │  🧪 QA Agent                    📅 项目经理               │     │
│  │  ├── Case 1: ✅ Pass            分配修复:                 │     │
│  │  ├── Case 2: ✅ Pass            ├── Bug#3 → 一线开发      │     │
│  │  ├── Case 3: ❌ Fail→Bug#3     └── Bug#4 → 资深开发      │     │
│  │  └── Case 4: ❌ Fail→Bug#4                               │     │
│  │                                                           │     │
│  │  通过率: 50% → 需要 ≥ 80%                                │     │
│  │  [查看 Bug 详情]  [查看测试报告]                          │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                    │
│  ┌── 团队成员 ──────────────────────────────────────────────┐     │
│  │ 📊运营 📋产品 📅项目 🏗️架构 👨‍💻资深 💻开发 🧪QA 🚀运维 🎯Lead│     │
│  │  ✅     ✅    🟢    ✅    🟢    🟢   🟢   ⏳    ✅       │     │
│  └───────────────────────────────────────────────────────────┘     │
│                                                                    │
│  [📜 查看讨论纪要]  [📊 查看执行报告]  [🔄 回到矩阵视图]           │
├────────────────────────────────────────────────────────────────────┤
│ 连接状态: ✅ bridge v1.0.0 | 📂 /Users/user/my-project            │
└────────────────────────────────────────────────────────────────────┘
```

---

## 7. 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| SQLite 并发写入 | Agent 高并发时数据丢失 | WAL 模式 + 写入队列 |
| Agent 间消息延迟 | 协作流程卡顿 | EventEmitter 内存队列，< 10ms |
| 工作流死锁 | 循环依赖导致永远等待 | DAG 拓扑排序检测环 |
| Cursor SDK 变更 | 桥接层失效 | 适配层隔离 + 版本锁定 |
| 大量历史数据 | SQLite 查询变慢 | 索引优化 + 定期清理策略 |
| 多 Agent 讨论发散 | 讨论无法收敛，消耗大量 token | 轮次上限 + Tech Lead 强制裁决 + token 预算 |
| QA 无限循环 | Bug 反复出现导致死循环 | QA 轮次上限 + 质量分降级容忍 + 人工介入门 |
| 角色 Prompt 干扰 | 角色行为偏离预期 | 约束条件明确 + 输出格式校验 + 行为基线测试 |
| 执行任务粒度 | 任务拆分过细或过粗 | 项目经理自适应调整 + 用户可手动修改 |
| LLM 幻觉在角色扮演中放大 | 角色"虚构"不存在的技术方案 | 多角色交叉验证 + 架构师/QA 的 veto 权 |

---

## 8. 验收标准

### Phase 1 验收
- [x] 3+ Agent 卡片同时显示在矩阵视图中 ✅
- [x] Agent 输出实时渲染，支持 Markdown ✅
- [x] 项目切换后 Agent 列表正确过滤 ✅ (项目切换器 + 历史过滤)
- [x] 重启 bridge 后对话历史可恢复 ✅ (SQLite WAL 持久化)
- [x] 历史列表支持按项目/时间筛选 ✅ (API + 前端侧边栏)
- [x] 对话历史详情可查看 ✅ (点击历史条目查看消息)

### Phase 2 验收 — ✅ 全部通过
- [x] Agent A 输出可通过 `@引用` 传递给 Agent B ✅ (POST /agents/:id/message + @agent-name 前端替换)
- [x] 依赖 Agent 自动在前置 Agent 完成后触发 ✅ (SSE 完成事件 _triggerDependents 引擎)
- [x] 消息传递延迟 < 100ms ✅ (EventEmitter 内存队列)

### Phase 3 验收 — ✅ 全部通过
- [x] 一键启动"代码审查流水线"工作流 ✅ (5 个内置工作流 + UI 模板面板)
- [x] 自定义工作流可保存/加载 ✅ (POST /workflows + DELETE API)
- [x] 工作流进度条正确显示 ✅ (DAG 步骤追踪 + 前端进度渲染)

### Phase 4 验收 — ✅ 全部通过
- [x] Token 用量统计准确 ✅ (token_usage 表 + /stats/tokens API + 前端面板)
- [x] Agent 可在关键步骤暂停等待确认 ✅ (审批门 API + 前端审批弹窗 + 紧急中断)
- [x] 执行时间线正确渲染 ✅ (可观测性面板实时日志流 + 类型/Agent 过滤)

### Phase 4.5 验收 (白盒可观测性)
- [x] thinking/tool_call/tool_result 事件自动持久化到 SQLite ✅
- [x] 18 种 TraceType 完整覆盖 Phase 5 全生命周期场景 ✅
- [x] 时间线视图按时间排列所有事件，颜色区分角色 ✅
- [x] 决策日志结构化展示每个决策的支持/反对/理由 ✅
- [x] 角色视角以单个角色为中心展示思考/发言/影响力 ✅
- [x] 因果图展示事件间因果关系链 ✅
- [x] 回放模式可按时间步进回放整个协作过程 ✅
- [x] 10 个 RESTful API 端点覆盖全部查询需求 ✅
- [x] Phase 5 trace hooks 就绪，可在实现 Phase 5 时直接使用 ✅

### Phase 5 验收 — ✅ 核心通过
- [x] 输入自然语言需求后，LLM 自动分析并推荐参与角色和执行计划 ✅
- [x] 用户审批后，自动创建多个角色 Agent 并启动讨论流程 ✅
- [x] 讨论阶段各角色从专业视角发言，Tech Lead 可总结并形成决策 ✅
- [x] 讨论轮次达到上限自动收敛，输出讨论纪要 ✅
- [x] 项目经理 Agent 根据讨论结论分解任务并分配给开发 Agent ✅
- [x] 资深开发可审查一线开发的输出，打回或通过 ✅
- [x] QA Agent 生成测试用例并逐条执行，发现 Bug 自动反馈 ✅
- [x] Bug 修复后 QA 自动回归测试，通过率实时更新 ✅
- [x] 通过率达标后自动进入部署阶段，未达标在轮次上限内继续循环 ✅
- [x] 超过最大轮次自动生成总结报告（含未解决问题和建议）✅
- [x] 全过程可回放，按阶段/角色/时间查看消息时间线 ✅ (Phase 4.5 白盒系统)

### Phase 6 验收 — ✅ 全部通过
- [x] A2A Agent Card 对外暴露，第三方可发现和调用 ✅ (GET /.well-known/agent.json + GET /a2a/capabilities)
- [x] 浏览器自动化：CDP 连接检测 + 8 种页面操作 + 批量执行 + 状态查询 ✅ (/a2a/browser/*)
- [x] 跨会话记忆：FTS5 全文搜索 + 5 种记忆类型 + 完整 CRUD + 自动提取 ✅ (/memories/* + /a2a/memory/*)
- [x] 多用户隔离：Bearer Token + SHA-256 哈希 + 3 级角色 + API Token + 模式切换 ✅ (/auth/*)

---

---

## 9. 已完成功能清单

### v0.3 → v1.0 前端已实现 (截至 2026-05-05)

| 功能 | 描述 | 实现文件 |
|------|------|---------|
| 全屏矩阵面板 | 磨砂玻璃暗色主题的全屏接管面板 | `css/cursor-bridge.css` |
| Agent 卡片网格 | 2 列自适应网格，1200px 宽 | `js/cursor-bridge.js` |
| 实时 SSE 输出流 | 每张卡片实时渲染 Agent 输出 | `js/cursor-bridge.js` |
| Markdown 渲染 | Agent 输出支持简单 Markdown 渲染 | `js/cursor-bridge.js` |
| 命令面板 (⌘L) | 快捷命令面板，支持模板快速创建 | `js/cursor-bridge.js` |
| 多模型选择器 | 标签式模型选择，支持多家 LLM | `js/cursor-bridge.js` |
| 双模式创建 | 表单模式 + 对话模式创建 Agent | `js/cursor-bridge.js` |
| 卡片拖拽调整大小 | 底部 resize 手柄拖拽调整卡片高度 | `js/cursor-bridge.js` |
| 按钮操作完整显示 | 取消/备忘/写作/复制/折叠/销毁，文字不折叠 | `css/cursor-bridge.css` |
| 对话历史侧边栏 | 右侧滑出式历史记录面板 | `js/cursor-bridge.js` |
| 历史详情弹窗 | 点击历史条目查看对话消息详情 | `js/cursor-bridge.js` |
| 结果保存到备忘录 | Agent 输出一键保存到扩展备忘录 | `js/cursor-bridge.js` |
| 结果保存到写作空间 | Agent 输出一键保存为博客草稿 | `js/cursor-bridge.js` |
| Native Messaging | 通过 Chrome Native Host 连接本地 bridge | `js/background.js` |
| Toast 通知 | 操作反馈的浮动提示 | `js/cursor-bridge.js` |
| 对话搜索 | 历史面板关键词搜索 + 实时过滤 | `js/cursor-bridge.js` |
| 对话删除 | 删除按钮 + 确认弹窗 + 前后端联动 | `js/cursor-bridge.js` |
| AgentConvMap 持久化 | localStorage 保存 agent-conversation 映射 | `js/cursor-bridge.js` |
| 项目切换器 | 顶部下拉切换器 + 搜索 + 添加项目 | `js/cursor-bridge.js` |

### 白盒可观测性已实现 (Phase 4.5)

| 功能 | 描述 | 实现文件 |
|------|------|---------|
| Trace 数据模型 | 18 种 TraceType + TraceEvent/TraceMetadata/Decision 等类型 | `cursor-bridge/src/types.ts` |
| Trace 存储层 | traces/decisions/causal_links 三表 + 索引 | `cursor-bridge/src/services/database.ts` |
| Trace 服务层 | recordTrace/recordDecision/linkCause + 查询 API | `cursor-bridge/src/services/trace-service.ts` |
| SDK 事件采集 | thinking/tool_call/tool_result 自动持久化 | `cursor-bridge/src/services/agent-pool.ts` |
| Phase 5 Trace Hooks | 15 个专用采集函数 (opinion/decision/delegation 等) | `cursor-bridge/src/services/phase5-trace-hooks.ts` |
| Trace API 端点 | 10 个 RESTful 查询端点 | `cursor-bridge/src/routes/traces.ts` |
| 白盒可视化面板 | 时间线/决策日志/角色视角/因果图/回放模式五种视图 | `js/whitebox-observability.js` |
| 白盒面板样式 | 暗色主题 + 角色颜色编码 + 响应式布局 | `css/whitebox-observability.css` |

### 后端已实现

| 功能 | 描述 | 实现文件 |
|------|------|---------|
| SQLite 持久化 | WAL 模式，项目/对话/消息/工作流表 + Phase 5 多角色表 | `cursor-bridge/src/services/database.ts` |
| 项目管理 API | CRUD + 最近访问追踪 | `cursor-bridge/src/routes/projects.ts` |
| 对话历史 API | 列表/创建/更新/消息管理/搜索/删除/恢复 | `cursor-bridge/src/routes/conversations.ts` |
| 健康检查 + 统计 API | 服务状态 + 统计概览 + Token 用量（总量/Agent 级/项目级/最近记录） | `cursor-bridge/src/routes/health.ts` |
| 文件系统 API | 目录列表/对话框/路径补全 | `cursor-bridge/src/routes/fs.ts` |
| Agent 管理 API | CRUD + 发送/取消/恢复 + 消息通信 + 审批门 + 紧急中断 | `cursor-bridge/src/routes/agents.ts` |
| 工作流 API | CRUD + 5 个内置模板 | `cursor-bridge/src/routes/workflows.ts` |
| Trace 可观测性 API | 10 个查询端点（时间线/角色/阶段/因果链/决策/回放/统计） | `cursor-bridge/src/routes/traces.ts` |
| 多角色协作 API | 任务分析/讨论/执行小队/QA/报告/角色模板 | `cursor-bridge/src/routes/multi-role.ts` |
| A2A 协议 | Agent Card 暴露 + 能力发现 + 浏览器自动化 + 记忆搜索 | `cursor-bridge/src/routes/a2a.ts` |
| 浏览器自动化服务 | CDP 连接 + 8 种动作 (navigate/click/type/screenshot/evaluate/waitFor/getContent/getTabs) | `cursor-bridge/src/services/browser-automation.ts` |
| 跨会话记忆 API | FTS5 全文搜索 + CRUD + 自动提取 + 重要度排序 + 5 种记忆类型 | `cursor-bridge/src/routes/memory.ts` + `cursor-bridge/src/services/memory-service.ts` |
| 多用户隔离 | Bearer Token 认证 + SHA-256 哈希 + 角色权限 (admin/user/readonly) + API Token | `cursor-bridge/src/routes/auth.ts` + `cursor-bridge/src/services/auth-middleware.ts` |

---

*基于调研报告 [multi-agent-platform-research.md](../research/multi-agent-platform-research.md) 编写*
