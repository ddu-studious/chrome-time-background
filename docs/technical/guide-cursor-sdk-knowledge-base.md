---
title: "Cursor SDK 能力知识库"
type: technical
status: active
version: "1.0"
created: "2026-05-23"
updated: "2026-05-23"
author: "AI Assistant"
tags: [cursor-sdk, agent, mcp, skills, cloud-agent, typescript]
related:
  - docs/research/research-agent-capability-building.md
  - docs/technical/guide-multi-role-agent.md
changelog:
  - date: "2026-05-23"
    desc: "初始创建，覆盖 SDK 全 API、MCP 集成、Skills 生态、Dashboard 能力、最佳实践"
---

# Cursor SDK 能力知识库

## 目录

1. [SDK 概览与安装](#1-sdk-概览与安装)
2. [核心 API 完整参考](#2-核心-api-完整参考)
3. [MCP 服务器集成](#3-mcp-服务器集成)
4. [Skills 生态系统](#4-skills-生态系统)
5. [Dashboard 与账号管理](#5-dashboard-与账号管理)
6. [Stream 事件系统](#6-stream-事件系统)
7. [模型与参数配置](#7-模型与参数配置)
8. [Cloud Agent 运行时](#8-cloud-agent-运行时)
9. [子代理系统](#9-子代理系统)
10. [错误处理与最佳实践](#10-错误处理与最佳实践)
11. [与我们项目的集成方案](#11-与我们项目的集成方案)

---

## 1. SDK 概览与安装

### 1.1 基本信息

| 属性 | 值 |
|------|-----|
| 包名 | `@cursor/sdk` |
| 当前版本 | 1.0.13 (2026-05-12) |
| npm 周下载量 | 120.6K |
| 状态 | Public Beta |
| 运行时 | Node.js / Bun |
| 语言 | TypeScript |
| 许可 | Proprietary (Cursor) |

### 1.2 安装

```bash
npm install @cursor/sdk
# 或
pnpm add @cursor/sdk
```

### 1.3 认证方式

```typescript
import { Agent, Cursor } from "@cursor/sdk";

// 方式 1: 环境变量（推荐）
// 设置 CURSOR_API_KEY 环境变量

// 方式 2: 显式传入
const agent = await Agent.create({
  apiKey: process.env.CURSOR_API_KEY,
  model: { id: "composer-2.5" },
  local: { cwd: process.cwd() },
});
```

**API Key 获取路径**：cursor.com/dashboard → Integrations → Create API Key

### 1.4 定价模型

SDK 运行与 IDE/CLI/Cloud 使用相同的 token 消耗定价：
- Pro ($20/mo): $20 API agent usage
- Pro Plus ($60/mo): $70 API agent usage
- Ultra ($200/mo): $400 API agent usage

Spend 在 Dashboard 中显示，标记为 `SDK` 标签。

---

## 2. 核心 API 完整参考

### 2.1 API 总览

```
@cursor/sdk
├── Agent (静态命名空间)
│   ├── Agent.create(options)        → SDKAgent
│   ├── Agent.prompt(msg, options)   → RunResult (一次性快捷)
│   ├── Agent.resume(agentId, opts)  → SDKAgent
│   ├── Agent.list(options)          → ListResult<SDKAgentInfo>
│   ├── Agent.listRuns(agentId)      → ListResult<Run>
│   ├── Agent.getRun(runId)          → Run
│   ├── Agent.get(agentId)           → SDKAgentInfo
│   ├── Agent.archive(agentId)       → void
│   ├── Agent.unarchive(agentId)     → void
│   └── Agent.delete(agentId)        → void
│
├── SDKAgent (实例)
│   ├── agentId: string
│   ├── model: ModelSelection
│   ├── send(msg, options)           → Run
│   ├── close()                      → void
│   ├── reload()                     → void
│   ├── listArtifacts()              → SDKArtifact[] (cloud only)
│   └── downloadArtifact(path)       → Buffer (cloud only)
│
├── Run (运行实例)
│   ├── id, agentId, status, result, model, durationMs, git
│   ├── stream()                     → AsyncGenerator<SDKMessage>
│   ├── wait()                       → RunResult
│   ├── cancel()                     → void
│   ├── conversation()               → ConversationTurn[]
│   ├── supports(operation)          → boolean
│   └── onDidChangeStatus(fn)        → Disposable
│
├── Cursor (命名空间)
│   ├── Cursor.me()                  → SDKUser
│   ├── Cursor.models.list()         → SDKModel[]
│   └── Cursor.repositories.list()   → SDKRepository[]
│
└── Errors
    ├── CursorAgentError (基类)
    ├── AuthenticationError
    ├── RateLimitError
    ├── ConfigurationError
    ├── AgentBusyError
    ├── IntegrationNotConnectedError
    ├── NetworkError
    ├── UnknownAgentError
    └── UnsupportedRunOperationError
```

### 2.2 Agent.create() 完整参数

```typescript
interface AgentOptions {
  // === 认证 ===
  apiKey?: string;                // CURSOR_API_KEY

  // === 模型 ===
  model: ModelSelection;
  // model.id: string             如 "composer-2.5", "composer-2.5-fast"
  // model.params?: ModelParam[]  如 [{ id: 'thinking', value: 'high' }]

  // === Agent 标识 ===
  name?: string;                  // 人类可读名称
  agentId?: string;               // 持久化 ID (跨调用复用)

  // === 对话模式 ===
  mode?: 'agent' | 'plan';       // agent=执行, plan=规划

  // === 运行时 (二选一) ===
  local?: {
    cwd?: string | string[];      // 工作目录 (可多个)
    settingSources?: SettingSource[];
    // "project" | "user" | "team" | "mdm" | "plugins" | "all"
    sandboxOptions?: { enabled: boolean };
  };

  cloud?: {
    env?: {
      type: 'cloud' | 'pool' | 'machine';
      name?: string;
    };
    repos?: Array<{
      url: string;
      startingRef?: string;
      prUrl?: string;
    }>;
    envVars?: Record<string, string>;
    workOnCurrentBranch?: boolean;
    autoCreatePR?: boolean;
    skipReviewerRequest?: boolean;
  };

  // === MCP 服务器 ===
  mcpServers?: Record<string, McpServerConfig>;

  // === 子代理 ===
  agents?: Record<string, AgentDefinition>;
}
```

### 2.3 agent.send() 完整参数

```typescript
type SendMessage = string | SDKUserMessage;

interface SDKUserMessage {
  text: string;
  images?: Array<
    | { url: string; dimension?: { width: number; height: number } }
    | { data: string; mimeType: string; dimension?: { width: number; height: number } }
  >;
}

interface SendOptions {
  model?: ModelSelection;           // 本次运行覆盖 (sticky)
  mode?: 'agent' | 'plan';         // 本次运行模式覆盖
  mcpServers?: Record<string, McpServerConfig>;
  local?: { force?: boolean };      // 强制过期卡住的运行

  onStep?: (args: { step: ConversationStep }) => void | Promise<void>;
  onDelta?: (args: { update: InteractionUpdate }) => void | Promise<void>;
}
```

### 2.4 Agent.prompt() - 一次性快捷方式

```typescript
const result = await Agent.prompt("Fix the bug in auth.ts", {
  apiKey: process.env.CURSOR_API_KEY,
  model: { id: "composer-2.5" },
  local: { cwd: "/path/to/project" },
});

console.log(result.status); // "completed" | "error"
```

### 2.5 Agent.resume() - 跨会话恢复

```typescript
const agent = await Agent.resume("agent-abc123", {
  apiKey: process.env.CURSOR_API_KEY,
  mcpServers: { /* 需要重新传入 */ },
});

const run = await agent.send("Continue with the next task");
```

**注意**：`Agent.resume()` 不会持久化 inline `mcpServers`，恢复时需重新传入。

### 2.6 查询已有 Agent

```typescript
const agents = await Agent.list({ apiKey });
// { items: SDKAgentInfo[], hasMore: boolean, cursor?: string }

const agentInfo = await Agent.get("agent-abc123", { apiKey });
// { id, name, model, status, createdAt, ... }

const runs = await Agent.listRuns("agent-abc123", { apiKey });
const run = await Agent.getRun("run-xyz789", { apiKey });
```

---

## 3. MCP 服务器集成

### 3.1 MCP 配置格式

SDK 支持三种 MCP 服务器传输协议：

```typescript
const agent = await Agent.create({
  model: { id: "composer-2.5" },
  local: { cwd: process.cwd() },
  mcpServers: {
    // Stdio 传输 (本地进程)
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
      cwd: process.cwd(),
      env: { NODE_ENV: "development" },
    },

    // HTTP 传输 (远程服务器)
    docs: {
      type: "http",
      url: "https://example.com/mcp",
      headers: { "Authorization": "Bearer token" },
      auth: {
        CLIENT_ID: "client-id",
        scopes: ["read", "write"],
      },
    },

    // SSE 传输 (Server-Sent Events)
    realtime: {
      type: "sse",
      url: "https://example.com/mcp/sse",
      headers: { "Authorization": "Bearer token" },
    },
  },
});
```

### 3.2 常用 MCP 服务器示例

```typescript
const mcpServers = {
  // Page Agent (阿里巴巴 - 页内浏览器控制)
  "page-agent": {
    type: "stdio",
    command: "npx",
    args: ["-y", "@page-agent/mcp"],
    env: {
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_API_KEY: process.env.OPENAI_API_KEY,
      LLM_MODEL_NAME: "gpt-4o",
    },
  },

  // GitHub (代码仓库操作)
  github: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN },
  },

  // Notion (文档操作)
  notion: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/mcp-server"],
    env: { NOTION_TOKEN: process.env.NOTION_TOKEN },
  },

  // 数据库查询
  database: {
    type: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite", "./data.db"],
  },
};
```

### 3.3 MCP 与 settingSources 的关系

```typescript
const agent = await Agent.create({
  model: { id: "composer-2.5" },
  local: {
    cwd: process.cwd(),
    // 控制加载哪些配置层
    settingSources: ["project", "user", "plugins"],
    // "project" = .cursor/mcp.json (项目级)
    // "user" = ~/.cursor/mcp.json (用户级)
    // "plugins" = 插件市场安装的 MCP
    // "all" = 加载所有层
  },
  // inline mcpServers 始终可用，不受 settingSources 影响
  mcpServers: { /* ... */ },
});
```

### 3.4 动态 MCP 注册 (Extension API)

```typescript
// Cursor Extension API (vscode.cursor 命名空间)
vscode.cursor.mcp.registerServer({
  name: "my-dynamic-server",
  command: "node",
  args: ["./my-mcp-server.js"],
});
```

---

## 4. Skills 生态系统

### 4.1 Skills 概念

Skills 是可分发的 AI 知识包，让 Agent 具备特定领域的专业能力。格式为 `SKILL.md` 文件，包含 frontmatter 元数据和技能指导内容。

### 4.2 Skills 安装方式

```bash
# 通过 npx skills CLI (跨平台通用)
npx skills add greensock/gsap-skills           # 安装整个技能包
npx skills add greensock/gsap-skills --skill gsap-core  # 安装单个技能
npx skills add greensock/gsap-skills -g        # 全局安装

# 通过 Cursor Settings UI
# Settings → Rules → Add Rule → Remote Rule (Github)
# 输入: greensock/gsap-skills

# 通过 Cursor Plugins Marketplace
# 浏览 cursor.com/marketplace 安装官方插件
```

### 4.3 Skills 目录结构

```
.cursor/
├── skills/              # 项目级技能
│   ├── gsap-skills/
│   │   ├── SKILL.md     # 技能入口
│   │   ├── references/  # 参考资料
│   │   └── scripts/     # 辅助脚本
│   └── qa-skills/
│       └── SKILL.md
├── rules/               # 项目规则 (.mdc 文件)
├── mcp.json             # 项目级 MCP 配置
└── plugins/             # 插件缓存
    └── cache/
        └── cursor-public/
            └── gsap-skills/
```

### 4.4 SKILL.md 格式规范

```markdown
---
name: gsap-core
description: Core GSAP API usage
triggers:
  - "animate"
  - "gsap.to"
  - "tween"
---

# GSAP Core API Skill

## When to Use
使用 GSAP 做 DOM 动画时...

## API Reference
- `gsap.to(target, vars)` ...
- `gsap.from(target, vars)` ...

## Best Practices
1. 使用 transforms 而非 layout 属性
2. ...
```

### 4.5 在 SDK Agent 中使用 Skills

通过 `settingSources` 让 Agent 自动加载已安装的技能：

```typescript
const agent = await Agent.create({
  model: { id: "composer-2.5" },
  local: {
    cwd: "/path/to/project",
    settingSources: ["project", "plugins"],
    // "project" 会加载 .cursor/skills/ 和 .cursor/rules/
    // "plugins" 会加载 marketplace 安装的插件技能
  },
});

// Agent 现在自动具备已安装 Skills 的知识
const run = await agent.send("用 GSAP 实现一个滚动触发的渐入动画");
```

### 4.6 常用 Skills 推荐

| 技能包 | 仓库 | 用途 |
|--------|------|------|
| GSAP Skills | `greensock/gsap-skills` | 动画开发 |
| Firebase Skills | `firebase/agent-skills` | Firebase 集成 |
| Stripe Skills | `cursor-public/stripe` | 支付集成 |
| QA Skills | `qaskills.sh` | 测试自动化 |
| Find Skills | `vercel-labs/agent-skills` | 技能发现 |
| Redis Skills | `cursor-public/redis-development` | Redis 开发 |

### 4.7 Plugins 系统

Cursor Plugins 是更完整的分发包，可包含：
- Rules (.mdc 规则文件)
- Skills (SKILL.md 技能文件)
- Agents (子代理定义)
- Commands (自定义命令)
- MCP Servers (工具服务器)
- Hooks (事件钩子)

```json
// .cursor-plugin/plugin.json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "components": {
    "skills": ["skills/"],
    "rules": ["rules/"],
    "mcp": "mcp.json"
  }
}
```

---

## 5. Dashboard 与账号管理

### 5.1 Cursor.me() - 账号信息

```typescript
import { Cursor } from "@cursor/sdk";

const me = await Cursor.me({ apiKey: process.env.CURSOR_API_KEY });
// 返回:
// {
//   apiKeyName: string;    // API Key 名称
//   userEmail?: string;    // 用户邮箱
//   createdAt: string;     // 创建时间
// }
```

### 5.2 Dashboard Usage API (非官方)

通过逆向工程获得的 Dashboard API 端点：

```typescript
// 基础 URL: https://api2.cursor.sh
// 协议: gRPC-Web over JSON (aiserver.v1.DashboardService)

// 1. 获取使用概览
// POST /aiserver.v1.DashboardService/GetUsageSummary
interface UsageSummary {
  billingCycleStart: string;   // unix ms
  billingCycleEnd: string;
  planUsage: {
    totalSpend: number;         // cents
    includedSpend: number;      // cents
    bonusSpend: number;         // cents
    remaining: number;          // cents
    limit: number;              // cents (plan limit)
    autoPercentUsed: number;    // Auto 模式使用 %
    apiPercentUsed: number;     // API 使用 %
    totalPercentUsed: number;   // 总使用 %
  };
  spendLimitUsage?: {
    limitType: 'individual' | 'team';
    enabled: boolean;
    individualLimit: number;
    pooledLimit?: number;
    pooledUsed?: number;
    pooledRemaining?: number;
  };
}

// 2. 获取计划信息
// POST /aiserver.v1.DashboardService/GetPlanInfo
interface PlanInfo {
  planName: string;             // "Pro" | "Pro Plus" | "Ultra"
  includedAmountCents: number;  // 包含额度 (cents)
  price: string;                // "$20/mo"
  billingCycleEnd: string;      // unix ms
}

// 3. 获取详细使用事件 (分页)
// POST /api/dashboard/get-filtered-usage-events
interface UsageEvent {
  timestamp: string;
  model: string;                // "claude-4.6", "composer-2.5"
  kind: string;                 // "USAGE_EVENT_IND_USAGE"
  tokenUsage: {
    total: number;
    input: number;
    output: number;
  };
  cost: number;                 // cents
}
```

### 5.3 官方 API (Enterprise)

| API | 用途 | 可用性 |
|-----|------|--------|
| Admin API | 团队管理、使用数据、花费 | Enterprise |
| Analytics API | AI 指标、活跃用户、模型使用 | Enterprise |
| AI Code Tracking API | AI 代码贡献追踪 | Enterprise |
| Cloud Agents API | Agent 创建管理 | All Plans (Beta) |

### 5.4 OpenUsage 社区方案

[robinebers/openusage](https://github.com/robinebers/openusage) 提供了标准化的用量查询：

```typescript
// openusage 标准化字段映射
const usageFields = {
  totalUsage: "planUsage.totalPercentUsed",
  autoUsage: "planUsage.autoPercentUsed",
  apiUsage: "planUsage.apiPercentUsed",
  onDemand: "spendLimitUsage",
};
```

---

## 6. Stream 事件系统

### 6.1 SDKMessage 事件类型

```typescript
const run = await agent.send("Build a login page");

for await (const message of run.stream()) {
  switch (message.type) {
    case "system":
      // 初始化元数据 (运行开始时发一次)
      // message.model?, message.tools?
      break;

    case "user":
      // 用户 prompt 回显
      // message.message.content: TextBlock[]
      break;

    case "assistant":
      // 模型文本输出
      // message.message.content: (TextBlock | ToolUseBlock)[]
      break;

    case "thinking":
      // 推理内容 (Extended Thinking)
      // message.text, message.thinking_duration_ms?
      break;

    case "tool_call":
      // 工具调用生命周期
      // message.call_id, message.name, message.status
      // message.args? (调用参数), message.result? (返回结果)
      break;

    case "status":
      // 云端运行状态变化
      // message.status: "CREATING"|"RUNNING"|"FINISHED"|"ERROR"|"CANCELLED"
      break;

    case "task":
      // 任务级里程碑
      // message.status?, message.text?
      break;

    case "request":
      // 等待用户输入/审批
      // message.request_id
      break;
  }
}
```

### 6.2 Delta 细粒度回调

```typescript
const run = await agent.send("Refactor the database layer", {
  onDelta: ({ update }) => {
    switch (update.type) {
      case "text-delta":
        process.stdout.write(update.text);
        break;
      case "thinking-delta":
        // 推理增量
        break;
      case "thinking-completed":
        // 推理完成, update.thinking_duration_ms
        break;
      case "tool-call-started":
        // update.call_id, update.name
        break;
      case "partial-tool-call":
        // 工具参数流入中
        break;
      case "tool-call-completed":
        // update.call_id, update.result
        break;
      case "token-delta":
        // token 计数增量
        break;
      case "step-started":
      case "step-completed":
        // 步骤生命周期
        break;
      case "turn-ended":
        // 回合结束 + usage 统计
        break;
      case "shell-output-delta":
        // Shell 命令输出增量
        break;
      case "summary":
      case "summary-started":
      case "summary-completed":
        // 摘要生成
        break;
    }
  },
  onStep: ({ step }) => {
    // 每个完整步骤完成时触发
    console.log(`Step completed: ${step.type}`);
  },
});
```

### 6.3 run.conversation() - 结构化对话

```typescript
const run = await agent.send("...");
await run.wait();

const turns = await run.conversation();
// ConversationTurn[]
// 每个 turn 包含完整的消息、工具调用、结果
```

---

## 7. 模型与参数配置

### 7.1 获取可用模型

```typescript
const models = await Cursor.models.list({ apiKey });
// SDKModel[]
// { id, aliases?, params?: ModelParamDescriptor[] }
```

### 7.2 模型参数

```typescript
const agent = await Agent.create({
  model: {
    id: "composer-2.5",
    params: [
      { id: "thinking", value: "high" },   // 推理深度: low|medium|high
      // 其他模型特有参数...
    ],
  },
  // ...
});
```

### 7.3 已知模型 ID

| 模型 ID | 说明 |
|---------|------|
| `composer-2.5` | 最新平衡模型 |
| `composer-2.5-fast` | 快速模型 |
| `composer-2` | 上一代平衡 |
| `composer-2-fast` | 上一代快速 |
| `composer-latest` | 别名: 最新版 |
| `claude-4.6-sonnet-high` | Claude 4.6 |
| `claude-opus-4-7-thinking-xhigh` | Claude Opus (高推理) |
| `gpt-5.3-codex-xhigh` | GPT 5.3 |
| `gpt-5.5-medium` | GPT 5.5 |

### 7.4 mode 参数

| 值 | 说明 | 适用场景 |
|-----|------|---------|
| `agent` | 执行模式 - 直接修改代码 | 开发、修复、重构 |
| `plan` | 规划模式 - 先探索再规划 | 讨论、设计、评审 |

---

## 8. Cloud Agent 运行时

### 8.1 Cloud vs Local 对比

| 维度 | Local | Cloud |
|------|-------|-------|
| 执行环境 | 本机 | 隔离 VM |
| 文件访问 | 直接 | 通过 repos |
| 安全性 | 受限于本机 | 完全隔离 |
| PR 创建 | 手动 | autoCreatePR |
| 适用场景 | 开发调试 | CI/CD, 自动化 |

### 8.2 Cloud 配置示例

```typescript
const agent = await Agent.create({
  model: { id: "composer-2.5" },
  cloud: {
    env: { type: "cloud" },
    repos: [{
      url: "https://github.com/org/repo",
      startingRef: "main",
    }],
    envVars: {
      DATABASE_URL: "postgres://...",
      API_KEY: "secret",
    },
    autoCreatePR: true,
    workOnCurrentBranch: false,
  },
});
```

### 8.3 产物管理 (Cloud Only)

```typescript
const artifacts = await agent.listArtifacts();
// SDKArtifact[] - Agent 在云端生成的文件

const buffer = await agent.downloadArtifact("output/report.md");
```

---

## 9. 子代理系统

### 9.1 定义子代理

```typescript
const agent = await Agent.create({
  model: { id: "composer-2.5" },
  local: { cwd: process.cwd() },
  agents: {
    researcher: {
      description: "研究和收集信息",
      prompt: "你是一个研究助手，专注于收集和整理信息...",
      model: { id: "composer-2.5" },  // 可选，默认继承
      mcpServers: {
        web: { type: "stdio", command: "npx", args: ["-y", "fetch-mcp"] },
      },
    },
    coder: {
      description: "编写和修改代码",
      prompt: "你是一个高级开发者...",
      model: "inherit",  // 显式继承父 Agent 模型
    },
  },
});
```

### 9.2 子代理 vs 手动 Pool

| 维度 | SDK 子代理 | 手动 Agent Pool |
|------|-----------|----------------|
| 管理方式 | SDK 自动管理 | 需自行实现 |
| 生命周期 | 随父 Agent | 独立管理 |
| 通信 | SDK 内部 | 需自建协议 |
| MCP 隔离 | 独立配置 | 共享或隔离 |
| 灵活性 | 受限于 SDK | 完全自主 |

---

## 10. 错误处理与最佳实践

### 10.1 错误类型

```typescript
import {
  CursorAgentError,
  AuthenticationError,
  RateLimitError,
  ConfigurationError,
  AgentBusyError,
  NetworkError,
} from "@cursor/sdk";

try {
  const run = await agent.send("...");
  await run.wait();
} catch (error) {
  if (error instanceof RateLimitError) {
    // 等待后重试
    await sleep(error.retryAfter ?? 60000);
  } else if (error instanceof AgentBusyError) {
    // Agent 正在执行中，等待或取消
    const activeRun = await Agent.listRuns(agent.agentId);
    await activeRun.items[0]?.cancel();
  } else if (error instanceof AuthenticationError) {
    // API Key 无效或过期
  } else if (error instanceof NetworkError) {
    // 网络问题，重试
  }
}
```

### 10.2 最佳实践

1. **Agent 复用**：使用固定 `agentId` 避免频繁创建
2. **超时处理**：设置合理的 `run.wait()` 超时
3. **流式处理**：优先使用 `run.stream()` 获取实时反馈
4. **MCP 重传**：`Agent.resume()` 需重新传入 `mcpServers`
5. **模式选择**：讨论阶段用 `plan`，执行阶段用 `agent`
6. **thinking 级别**：复杂任务用 `high`，简单任务用 `low`
7. **settingSources**：始终指定需要的配置层，避免 `"all"` 带来的不确定性

### 10.3 性能优化

```typescript
// 1. 预热 Agent (避免首次 send 延迟)
const agent = await Agent.create({ ... });
// create 只创建，不初始化运行时
// 第一次 send 才真正初始化

// 2. 并行多 Agent
const agents = await Promise.all([
  Agent.create({ name: "frontend", ... }),
  Agent.create({ name: "backend", ... }),
]);

// 3. 使用 onDelta 替代 stream() 减少内存
const run = await agent.send("...", {
  onDelta: ({ update }) => {
    // 逐 delta 处理，不需要缓存完整流
  },
});
```

---

## 11. 与我们项目的集成方案

### 11.1 当前使用状态

```
已使用:
  ✅ Agent.create({ apiKey, model, local.cwd, name })
  ✅ agent.send(prompt) → Run
  ✅ run.stream() → SDKMessage
  ✅ run.wait() → RunResult
  ✅ run.cancel()
  ✅ agent.close()
  ✅ Cursor.models.list()

已接入 (v1.1~v1.2):
  ✅ model.params (thinking level)
  ✅ mode: 'plan' | 'agent'
  ✅ onDelta / onStep 回调
  ✅ mcpServers 注入
  ✅ settingSources: ["project", "user"]
  ✅ Agent.resume()

已接入 (v1.3):
  ✅ run.conversation() — 结构化对话历史
  ✅ SDKUserMessage.images — 视觉验证
  ✅ Agent.list() / Agent.get() — Agent 查询
  ✅ Agent.listRuns() / Agent.getRun() — 运行查询

已接入 (v1.4):
  ✅ agents — 子代理定义 (AgentDefinition)
  ✅ cloud 运行时 — repos + autoCreatePR + envVars
  ✅ Agent.prompt() — 一次性快捷方式
  ✅ agent.reload() — 热加载配置

待评估:
  🔍 agent.listArtifacts() / downloadArtifact() — 产物管理 (Cloud only)
```

### 11.2 推荐接入步骤

```typescript
// Phase 1: agent-pool.ts 改造
const sdkAgent = await Agent.create({
  apiKey: config.apiKey,
  model: {
    id: model,
    params: roleConfig.modelParams,  // 按角色配置 thinking 级别
  },
  name: opts.name,
  mode: roleConfig.phase === 'discussion' ? 'plan' : 'agent',
  local: {
    cwd: opts.cwd,
    settingSources: ['project', 'plugins'],  // 加载 Skills + MCP
  },
  mcpServers: {
    // 按需注入浏览器、数据库等工具
    ...buildMcpServersForRole(roleConfig),
  },
});

// Phase 2: SSE 实时推送改造
const run = await agent.send(prompt, {
  onDelta: ({ update }) => {
    // 通过 SSE 实时推送到前端
    sseEmitter.emit('delta', { agentId, update });
  },
  onStep: ({ step }) => {
    sseEmitter.emit('step', { agentId, step });
  },
});
```

### 11.3 角色 → SDK 参数映射

| 角色 | model.id | thinking | mode | mcpServers |
|------|---------|----------|------|------------|
| 运营/业务/产品 | composer-2.5 | low | plan | - |
| 项目经理 | composer-2.5 | low | plan | - |
| 架构师 | composer-2.5 | high | plan→agent | - |
| 技术负责人 | composer-2.5 | high | agent | github |
| 前端开发 | composer-2.5-fast | low | agent | browser, gsap |
| 后端开发 | composer-2.5-fast | low | agent | database |
| 测试工程师 | composer-2.5 | low | agent | browser |
| DevOps | composer-2.5-fast | low | agent | - |

---

## 附录 A: 官方文档链接

| 资源 | URL |
|------|-----|
| TypeScript SDK 文档 | https://cursor.com/docs/api/sdk/typescript |
| Python SDK 文档 | https://cursor.com/docs/sdk/python |
| npm 包 | https://www.npmjs.com/package/@cursor/sdk |
| Cloud Agents API | https://cursor.com/docs/cloud-agent/api/endpoints |
| MCP 配置文档 | https://cursor.com/docs/mcp |
| Plugins 文档 | https://cursor.com/docs/plugins |
| Hooks 配置 | https://cursor.com/docs/hooks |
| APIs 概览 | https://cursor.com/docs/api |
| Dashboard 使用量 | https://cursor.com/help/models-and-usage/usage-limits |

## 附录 B: SDK 版本历史

| 版本 | 发布日期 | 重点变更 |
|------|---------|---------|
| 1.0.13 | 2026-05-12 | 最新稳定版 |
| 1.0.7 | 2026-04-26 | 首个公开版本 |
