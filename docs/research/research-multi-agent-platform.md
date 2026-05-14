# 多 Agent 平台调研报告 — Cursor Bridge v1.0 参考

**版本**: v1.0  
**日期**: 2026-05-04  
**标题**: 多 Agent 协作平台技术调研与竞品分析  
**作者**: AI Assistant  

---

## 1. 调研目标

为 Cursor Bridge v1.0（完整矩阵视图）的设计提供参考，调研业界主流多 Agent 框架和协议的优势特性，明确可借鉴的设计模式。

---

## 2. 主流框架对比分析

### 2.1 框架概览

| 框架 | 开发方 | 语言 | Stars | 架构模式 | 适合场景 |
|------|--------|------|-------|---------|---------|
| LangGraph | LangChain | Python/TS | 20K+ | 图状态机 | 复杂工作流、合规系统 |
| CrewAI | CrewAI | Python | 25K+ | 角色团队 | 内容生产、快速原型 |
| AutoGen | Microsoft | Python/.NET | 40K+ | 对话协商 | 人机协作、代码执行 |
| Open Multi-Agent | JackChen | TypeScript | 6K+ | 目标分解 DAG | Node.js 后端集成 |
| Alphora | OpenCMIT | Python | 344 | ReAct/Plan-Execute | 生产级沙箱环境 |
| Agent Framework | Microsoft | Python/.NET | 新 | 多 Agent 编排 | 企业级 .NET 集成 |

### 2.2 性能基准 (GPT-4o, 2026)

| 任务类型 | LangGraph | CrewAI | AutoGen |
|---------|-----------|--------|---------|
| 研究任务 (中位数) | 14.1s | 18.4s | 22.7s |
| 代码审查 (中位数) | 8.3s | 9.1s | 11.6s |
| Token 额外开销 | +9% | +18% | +31% |
| 上手时间 | ~55 min | ~25 min | ~45 min |

### 2.3 各框架核心优势

#### LangGraph — 图状态机
- **精细控制**: 工作流定义为有向无环图，节点=推理步骤，边=状态转换
- **类型化状态通道**: 状态通过 typed channels 流转，防止隐式数据 bug
- **原生持久化**: 内置 checkpoints，支持长时间运行任务的恢复
- **可观测性**: LangSmith 集成，全链路追踪

**可借鉴**:
- Agent 工作流的 DAG 可视化
- 任务状态的类型化管理
- Checkpoint/恢复机制

#### CrewAI — 角色化团队
- **角色建模**: Agent 有 role、goal、backstory，类似人类团队分工
- **最小样板代码**: 快速定义 Agent 团队并协作
- **内置工具**: 数百个预置工具，开箱即用
- **记忆系统**: 短期/长期/实体记忆，跨任务上下文保持

**可借鉴**:
- Agent 模板的角色化设计（已在 v0.2 实现基础版）
- 记忆系统 — Agent 跨会话上下文保持
- 团队预设/流水线概念

#### AutoGen — 对话协商
- **动态角色**: Agent 在运行时协商角色分配
- **人类在环**: 强大的 Human-in-the-Loop 支持
- **对话协议**: 通过消息传递实现协作
- **错误处理**: 对话式重试和修正

**可借鉴**:
- Agent 间对话/消息传递机制
- Human-in-the-Loop 审批流程
- 错误自修正策略

#### Open Multi-Agent — 目标分解
- **目标驱动**: 自动将高级目标分解为任务 DAG
- **并行化**: 独立任务自动并行执行
- **10 个 LLM 适配器**: Anthropic, OpenAI, Azure, Bedrock, Gemini, Grok, DeepSeek 等
- **MCP 支持**: 原生 Model Context Protocol 集成
- **Token 预算**: 精细的 token 消耗管控
- **结构化输出**: Zod schema 验证

**可借鉴（最强相关性 — 同为 TypeScript 生态）**:
- 目标分解 → 任务 DAG → 并行执行的编排模式
- 多 LLM 适配器统一接口
- Token 预算/用量追踪
- MCP 集成方案

---

## 3. 协议标准分析

### 3.1 Google A2A 协议 (Agent-to-Agent)

**状态**: v1.0.0 (2026-03), Linux Foundation 治理, 150+ 组织生产采用

**核心三元素**:
1. **Agent Card**: `/.well-known/agent.json` — 描述 Agent 能力、输入输出、认证方式
2. **Task**: 工作单元，包含目标、消息、带类型的 Artifact
3. **Transport**: JSON-RPC 2.0 over HTTPS + SSE 流式推送

**设计原则**:
- 拥抱非结构化协作
- 基于现有标准 (HTTP, SSE, JSON-RPC)
- 默认安全
- 框架和厂商无关
- 保持 Agent 不透明性（无需暴露内部状态）

**对 Cursor Bridge 的借鉴价值**:
- Agent Card 概念 → 我们的 Agent 模板可以扩展为标准化的能力描述
- Task 作为工作单元的抽象 → 统一 Agent 任务管理
- SSE 流式推送 → 我们已实现，可进一步规范化

### 3.2 Anthropic MCP 协议 (Model Context Protocol)

**状态**: 2026 已达 9700 万月 SDK 下载量

**定位**: Agent 连接工具和数据源的标准协议（与 A2A 互补）

**2026 最佳实践**:
- TypeScript/Python 官方 SDK
- Streamable HTTP 作为推荐传输层（替代纯 SSE）
- Zod schema 验证输入
- Per-user/per-tool 速率限制
- 结构化错误语义支持 Agent 自修正

**缺失的协议原语（学术研究发现）**:
1. 身份传播 — 多 Agent 场景下的安全需求
2. 自适应工具预算 — 顺序调用时的 token 分配
3. 结构化错误语义 — 确定性自修正

**对 Cursor Bridge 的借鉴价值**:
- MCP Server 集成 → Bridge 可暴露为 MCP Server，让其他 Agent 调用
- 工具预算管理 → Agent 的 token 用量追踪
- 结构化错误处理 → 更健壮的错误恢复

---

## 4. Cursor SDK 原生能力分析

### 4.1 当前 SDK 能力

| 能力 | 支持情况 |
|------|---------|
| Local Runtime | ✅ Node.js 进程内运行 |
| Cloud Runtime | ✅ Cursor 托管/自托管 VM |
| Subagent 隔离 | ✅ 独立上下文窗口 |
| 并行执行 | ✅ 多 Subagent 同时运行 |
| 浏览器控制 | ✅ 导航/截图/交互 |
| MCP 工具 | ✅ 原生集成 |
| 流式输出 | ✅ AsyncIterator |

### 4.2 Subagent 类型

- **generalPurpose**: 通用任务
- **explore**: 只读代码探索
- **shell**: 命令执行
- **browser-use**: 浏览器自动化
- **code-reviewer**: 代码审查
- **best-of-n-runner**: 隔离分支实验

---

## 5. 可借鉴特性优先级矩阵

| 特性 | 来源 | 实现复杂度 | 用户价值 | 优先级 |
|------|------|-----------|---------|--------|
| Agent 间消息传递 | AutoGen/A2A | 中 | 极高 | P0 |
| 任务 DAG 编排/可视化 | LangGraph/Open Multi-Agent | 高 | 高 | P0 |
| Agent 记忆系统 | CrewAI | 中 | 高 | P1 |
| Token 用量追踪/预算 | Open Multi-Agent | 低 | 中 | P1 |
| Agent Card 能力描述 | A2A | 低 | 中 | P1 |
| Human-in-the-Loop 审批 | AutoGen | 中 | 高 | P1 |
| MCP Server 暴露 | MCP | 中 | 中 | P2 |
| 对话历史持久化 | CrewAI/LangGraph | 中 | 高 | P0 |
| 工作流模板/预设 | CrewAI | 低 | 极高 | P0 |
| 多项目/工作空间管理 | Cursor SDK | 中 | 高 | P0 |
| 实时状态可观测 | LangGraph/LangSmith | 中 | 高 | P1 |
| 结构化错误恢复 | MCP/AutoGen | 低 | 中 | P1 |

---

## 6. 推荐的 v1.0 技术方向

### 6.1 架构演进

```
v0.3 (当前)                    v1.0 (目标)
┌──────────────────┐          ┌──────────────────────────────┐
│ 单 Agent 创建/管理│          │ 矩阵编排器 (Orchestrator)     │
│ 线性 prompt→输出  │   ──>   │ • DAG 工作流引擎              │
│ 独立 SSE 流       │          │ • Agent 间消息总线            │
│ 无持久化          │          │ • 状态持久化 (SQLite)         │
└──────────────────┘          │ • Token 预算管理              │
                              │ • 工作流模板系统              │
                              └──────────────────────────────┘
```

### 6.2 技术选型建议

| 组件 | 推荐方案 | 理由 |
|------|---------|------|
| 持久化 | better-sqlite3 | 已有依赖，零额外成本 |
| 消息总线 | EventEmitter + 内存队列 | 本地场景无需分布式 |
| DAG 引擎 | 自建轻量版 | 避免重框架，参考 Open Multi-Agent |
| 状态可视化 | 扩展 UI 内嵌 | D3.js 或 Canvas 绘制 |

---

## 7. 调研结论

1. **v0.3 已完成所有计划功能**，代码质量良好，架构清晰
2. **v1.0 最核心的差异化是矩阵视图 + Agent 协作**，这是市面上大多框架提供的能力
3. **Open Multi-Agent 是最佳技术参考**（TypeScript 生态、目标分解 DAG、MCP 集成）
4. **A2A + MCP 双协议集成**是长期技术方向，但 v1.0 应先聚焦本地场景
5. **对话历史持久化和工作流模板**是用户体验提升的关键

---

*调研来源: GitHub 开源项目、Google A2A 官方文档、Anthropic MCP 规范、Cursor SDK 文档、Framework 性能基准报告*
