# Cursor Bridge — 本地多 Agent 矩阵开发平台

## PRD v0.1

**项目代号**: cursor-bridge  
**版本**: v0.1 (原型验证)  
**日期**: 2026-05-03  
**状态**: v0.1 完成 ✅ → v0.2 Chrome 扩展集成 ✅ (2026-05-04) → v0.3 Native Messaging 自动化 ✅ (2026-05-04)

---

## 1. 概述

### 1.1 产品定位

Cursor Bridge 是一个本地 Node.js 桥接服务，将 Cursor SDK (`@cursor/sdk`) 的 Agent 能力暴露为 HTTP/WebSocket API，使 Chrome 扩展（及其他 Web 客户端）能够管理和监控多个 AI Agent 的并行工作。

### 1.2 核心价值

| 场景 | 当前痛点 | 解决方案 |
|------|---------|---------|
| 多 Agent 协作 | 需开多个 Cursor 窗口，缺乏统一视图 | 集中管理面板，一屏监控所有 Agent |
| 代码审查流水线 | 手动切换窗口触发不同 Agent | 一键启动「审查+实现+测试」矩阵 |
| 项目级自动化 | 需反复输入相似 prompt | 预设 Agent 模板，一键复用 |
| 实时状态感知 | Agent 输出分散在各窗口 | SSE 实时流式推送到统一面板 |

### 1.3 技术约束

- Chrome 扩展运行在浏览器沙箱内，无法直接调用 Node.js 模块
- Cursor SDK 是 TypeScript/Node.js 包，需要本地文件系统访问和 API Key
- Agent 输出为流式（AsyncIterator），需转换为 SSE/WebSocket 推送

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│  Chrome 扩展 (New Tab UI)                                 │
│  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │ Agent 矩阵面板   │  │ 实时输出流 (SSE EventSource) │   │
│  │ • 创建/停止 Agent│  │ • 逐行输出                    │   │
│  │ • 状态指示       │  │ • 工具调用可视化              │   │
│  │ • 模型选择       │  │ • 错误高亮                    │   │
│  └────────┬────────┘  └──────────────┬───────────────┘   │
│           │                           │                   │
│           └─────────┐  ┌─────────────┘                   │
│                     ▼  ▼                                  │
│           HTTP REST + SSE (localhost:19840)                │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│  cursor-bridge (Node.js 服务)                             │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ API Layer (Fastify)                                  │ │
│  │ • POST /agents          — 创建 Agent                 │ │
│  │ • GET  /agents          — 列出所有 Agent             │ │
│  │ • POST /agents/:id/send — 发送 prompt                │ │
│  │ • POST /agents/:id/cancel — 取消当前 run             │ │
│  │ • DELETE /agents/:id    — 销毁 Agent                 │ │
│  │ • GET  /agents/:id/stream — SSE 实时输出             │ │
│  │ • GET  /models          — 可用模型列表               │ │
│  │ • GET  /health          — 健康检查                   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Agent Pool (内存管理)                                │ │
│  │ ┌─────────┐ ┌─────────┐ ┌─────────┐               │ │
│  │ │ Agent 1 │ │ Agent 2 │ │ Agent 3 │  ...          │ │
│  │ │ claude  │ │ gpt-5   │ │ codex   │               │ │
│  │ │ 项目 A  │ │ 项目 A  │ │ 项目 B  │               │ │
│  │ │ active  │ │ idle    │ │ running │               │ │
│  │ └─────────┘ └─────────┘ └─────────┘               │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  @cursor/sdk (Agent.create / agent.send / run.stream)     │
└───────────────────────────────────────────────────────────┘
```

---

## 3. 功能规格

### 3.1 v0.1 — 原型验证 (MVP)

**目标**：验证 Cursor SDK 桥接可行性，实现最小可用的 Agent 管理

| 功能 | 描述 | 优先级 |
|------|------|--------|
| Agent 创建 | 指定项目路径、模型、描述创建 Agent | P0 |
| Prompt 发送 | 向指定 Agent 发送 prompt，获取流式响应 | P0 |
| SSE 输出流 | 通过 Server-Sent Events 推送 Agent 输出 | P0 |
| Agent 列表 | 查看所有活跃 Agent 及其状态 | P0 |
| Agent 销毁 | 优雅关闭 Agent 并释放资源 | P0 |
| 模型列表 | 获取当前 API Key 可用的模型 | P1 |
| Run 取消 | 取消正在执行的 run | P1 |
| 健康检查 | /health 端点供 Chrome 扩展检测服务可用性 | P0 |

### 3.2 v0.2 — Chrome 扩展集成 ✅ 2026-05-04

| 功能 | 描述 | 状态 |
|------|------|------|
| Dock 栏 Agent 按钮 | 在扩展底部 Dock 栏添加带连接指示器的 Agent 按钮 | ✅ |
| Agent 管理面板 | 右侧滑出面板，磨砂玻璃风格统一 | ✅ |
| 连接状态自动检测 | 每 15s 轮询 /health，Dock 指示灯 + 面板状态显示 | ✅ |
| Agent 模板预设 | 5 种模板：代码审查、功能实现、测试编写、重构优化、文档生成 | ✅ |
| Agent 创建/发送/销毁 | 完整的 Agent 生命周期管理 | ✅ |
| SSE 实时输出流 | 流式输出（text/tool_call/thinking/status/error） | ✅ |
| 创建弹窗 | 支持名称、工作目录、模型选择、描述、初始 Prompt | ✅ |

**新增文件**:
- `js/cursor-bridge.js` — Bridge 客户端模块
- `css/cursor-bridge.css` — Agent 面板样式

**修改文件**:
- `manifest.json` — 添加 localhost host_permissions
- `index.html` — Dock 栏添加 Agent 按钮 + 引入 CSS/JS
- `js/main.js` — 初始化 CursorBridge 客户端

### 3.3 v0.3 — Native Messaging 自动化 ✅ 2026-05-04

| 功能 | 描述 | 状态 |
|------|------|------|
| Native Messaging Host | Node.js 脚本，接收 Chrome 的 start/stop/status/ping 命令 | ✅ |
| 安装/卸载脚本 | install.sh / uninstall.sh，一键注册 Host manifest | ✅ |
| 自动启动 bridge | 打开新标签页时，若 bridge 未运行则自动通过 Native Messaging 启动 | ✅ |
| 手动启停按钮 | Agent 面板 footer 中的启动/停止按钮 | ✅ |
| PID 文件管理 | bridge 服务写入 .bridge.pid，Host 通过 PID 管理进程 | ✅ |
| Service Worker 集成 | background.js 添加 bridge_native 消息处理器 | ✅ |
| 依赖自动安装 | Host 启动时检测 node_modules，缺失则自动 npm install | ✅ |
| nativeMessaging 权限 | manifest.json 添加 nativeMessaging 权限 | ✅ |

**新增文件**:
- `cursor-bridge/native-host/bridge-host.js` — Native Messaging Host 入口
- `cursor-bridge/native-host/com.cursor.bridge.json.template` — Host manifest 模板
- `cursor-bridge/native-host/install.sh` — 安装脚本 (macOS/Linux)
- `cursor-bridge/native-host/uninstall.sh` — 卸载脚本

**修改文件**:
- `manifest.json` — 添加 `nativeMessaging` 权限
- `js/background.js` — 添加 `bridge_native` 消息转发
- `js/cursor-bridge.js` — 添加 Native Messaging API、自动启动、启停按钮
- `css/cursor-bridge.css` — footer 控制按钮样式
- `cursor-bridge/src/index.ts` — PID 文件写入/清理
- `cursor-bridge/src/routes/health.ts` — 返回 PID 和 v0.3.0 版本号

### 3.4 v1.0 — 完整矩阵视图

| 功能 | 描述 |
|------|------|
| 矩阵视图 | 多 Agent 并行工作卡片式布局 |
| Agent 协作 | Agent 间消息传递 / 结果引用 |
| 项目管理 | 多项目切换、项目级 Agent 配置 |
| 历史记录 | Agent 对话历史持久化 |

---

## 4. API 设计

### 4.1 创建 Agent

```http
POST /agents
Content-Type: application/json

{
  "name": "代码审查员",
  "model": "composer-2",
  "cwd": "/Users/user/project-a",
  "description": "负责代码审查和质量把关"
}
```

**响应**:
```json
{
  "id": "agent_1714700000_abc",
  "name": "代码审查员",
  "model": "composer-2",
  "cwd": "/Users/user/project-a",
  "status": "idle",
  "createdAt": 1714700000000
}
```

### 4.2 发送 Prompt

```http
POST /agents/:id/send
Content-Type: application/json

{
  "prompt": "审查 src/auth.ts 中的安全问题"
}
```

**响应**:
```json
{
  "runId": "run_1714700001_xyz",
  "status": "running"
}
```

### 4.3 SSE 实时输出

```http
GET /agents/:id/stream
Accept: text/event-stream
```

**事件格式**:
```
event: text
data: {"content": "我发现了以下安全问题：\n"}

event: tool_call
data: {"tool": "read_file", "args": {"path": "src/auth.ts"}}

event: status
data: {"status": "finished", "runId": "run_1714700001_xyz"}

event: error
data: {"message": "Agent run failed", "code": "RUN_ERROR"}
```

### 4.4 Agent 列表

```http
GET /agents
```

**响应**:
```json
{
  "agents": [
    {
      "id": "agent_1714700000_abc",
      "name": "代码审查员",
      "model": "composer-2",
      "cwd": "/Users/user/project-a",
      "status": "running",
      "currentRunId": "run_1714700001_xyz",
      "createdAt": 1714700000000
    }
  ]
}
```

### 4.5 取消 Run

```http
POST /agents/:id/cancel
```

### 4.6 销毁 Agent

```http
DELETE /agents/:id
```

### 4.7 健康检查

```http
GET /health
```

**响应**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "agents": 3,
  "uptime": 3600
}
```

---

## 5. 数据模型

### 5.1 Agent 状态机

```
  create          send           finish/error
┌────────┐    ┌────────┐    ┌──────────┐    ┌────────┐
│ created│───>│  idle  │───>│ running  │───>│  idle  │
└────────┘    └────────┘    └──────────┘    └────────┘
                  │              │
                  │   cancel     │   dispose
                  │              │
                  ▼              ▼
              ┌────────┐    ┌──────────┐
              │disposed│    │  error   │
              └────────┘    └──────────┘
```

### 5.2 Agent 对象

```typescript
interface BridgeAgent {
  id: string;
  name: string;
  model: string;
  cwd: string;
  description?: string;
  status: 'idle' | 'running' | 'error' | 'disposed';
  createdAt: number;
  currentRunId?: string;
  runHistory: RunRecord[];
  sdkAgent: Agent;          // @cursor/sdk Agent 实例
  sseClients: Set<Response>; // 活跃的 SSE 连接
}

interface RunRecord {
  id: string;
  prompt: string;
  status: 'running' | 'finished' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  result?: string;
}
```

---

## 6. 技术方案

### 6.1 技术栈

| 组件 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js 20+ | Cursor SDK 依赖 |
| HTTP 框架 | Fastify | 性能优、插件生态、TypeScript 原生 |
| SDK | @cursor/sdk | 官方 TypeScript SDK |
| 包管理 | pnpm | 快速、磁盘友好 |
| 类型 | TypeScript 5.x | 类型安全 |

### 6.2 项目结构

```
cursor-bridge/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 入口，启动 Fastify
│   ├── config.ts         # 配置加载（端口、API Key）
│   ├── routes/
│   │   ├── agents.ts     # Agent CRUD 路由
│   │   ├── stream.ts     # SSE 路由
│   │   └── health.ts     # 健康检查
│   ├── services/
│   │   ├── agent-pool.ts # Agent 池管理
│   │   └── stream-hub.ts # SSE 事件分发
│   └── types.ts          # 类型定义
└── README.md
```

### 6.3 关键实现细节

#### Agent 生命周期管理

```typescript
import { Agent } from "@cursor/sdk";

class AgentPool {
  private agents = new Map<string, BridgeAgent>();

  async create(opts: CreateAgentOpts): Promise<BridgeAgent> {
    const sdkAgent = Agent.create({
      apiKey: config.apiKey,
      model: { id: opts.model },
      local: { cwd: opts.cwd },
    });

    const bridgeAgent: BridgeAgent = {
      id: `agent_${Date.now()}_${randomId()}`,
      name: opts.name,
      model: opts.model,
      cwd: opts.cwd,
      status: 'idle',
      createdAt: Date.now(),
      runHistory: [],
      sdkAgent,
      sseClients: new Set(),
    };

    this.agents.set(bridgeAgent.id, bridgeAgent);
    return bridgeAgent;
  }

  async send(agentId: string, prompt: string): Promise<string> {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.status === 'running') throw new Error('Agent is busy');

    agent.status = 'running';
    const run = await agent.sdkAgent.send(prompt);
    const runId = `run_${Date.now()}_${randomId()}`;
    agent.currentRunId = runId;

    // 非阻塞：启动流式读取并分发到 SSE 客户端
    this.streamRun(agent, run, runId);
    return runId;
  }

  private async streamRun(agent: BridgeAgent, run: Run, runId: string) {
    try {
      for await (const event of run.stream()) {
        const sseData = this.transformEvent(event);
        for (const client of agent.sseClients) {
          client.write(`event: ${sseData.event}\ndata: ${JSON.stringify(sseData.data)}\n\n`);
        }
      }
      const result = await run.wait();
      agent.status = result.status === 'error' ? 'error' : 'idle';
      // 通知 SSE 客户端 run 完成
      this.broadcast(agent, 'status', { status: result.status, runId });
    } catch (err) {
      agent.status = 'error';
      this.broadcast(agent, 'error', { message: err.message, runId });
    }
  }

  async dispose(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    await agent.sdkAgent[Symbol.asyncDispose]();
    agent.status = 'disposed';
    for (const client of agent.sseClients) client.end();
    this.agents.delete(agentId);
  }
}
```

#### SSE 路由

```typescript
fastify.get('/agents/:id/stream', (request, reply) => {
  const agent = agentPool.get(request.params.id);
  if (!agent) return reply.code(404).send({ error: 'Agent not found' });

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  agent.sseClients.add(reply.raw);
  reply.raw.write(`event: connected\ndata: {"agentId":"${agent.id}"}\n\n`);

  request.raw.on('close', () => {
    agent.sseClients.delete(reply.raw);
  });
});
```

### 6.4 安全考虑

| 风险 | 缓解措施 |
|------|---------|
| API Key 泄露 | Key 仅在服务端，不传输给前端 |
| 未授权访问 | 仅监听 localhost，可选 Bearer token |
| cwd 注入 | 路径白名单或用户确认机制 |
| 资源泄露 | Agent 池上限（默认 10），idle 超时自动回收 |

### 6.5 CORS 配置

服务仅监听 `127.0.0.1:19840`，配置 CORS 允许 `chrome-extension://*` Origin。

---

## 7. Chrome 扩展集成方案 (v0.2)

### 7.1 UI 入口

在 Dock 栏添加 "Agent" 按钮（与写作空间同级），点击打开 Agent 管理面板。

### 7.2 面板布局

```
┌─────────────────────────────────────────────────────┐
│ Agent 矩阵                           [+ 新建] [设置]│
├─────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│ │ 🟢 代码审查   │ │ 🔵 实现任务   │ │ ⚪ 测试编写   │ │
│ │ composer-2   │ │ gpt-5        │ │ codex        │ │
│ │ project-a    │ │ project-a    │ │ project-a    │ │
│ │              │ │              │ │              │ │
│ │ [输出区...]   │ │ [输出区...]   │ │ [等待中]     │ │
│ │              │ │              │ │              │ │
│ │ [发送 prompt]│ │ [发送 prompt]│ │ [发送 prompt]│ │
│ └──────────────┘ └──────────────┘ └──────────────┘ │
├─────────────────────────────────────────────────────┤
│ 连接状态: ✅ cursor-bridge 运行中 (3 agents)        │
└─────────────────────────────────────────────────────┘
```

### 7.3 连接检测

```javascript
class CursorBridgeClient {
  constructor(baseUrl = 'http://127.0.0.1:19840') {
    this.baseUrl = baseUrl;
    this.connected = false;
  }

  async checkHealth() {
    try {
      const resp = await fetch(`${this.baseUrl}/health`);
      const data = await resp.json();
      this.connected = data.status === 'ok';
      return data;
    } catch {
      this.connected = false;
      return null;
    }
  }

  subscribeAgent(agentId, onEvent) {
    const es = new EventSource(`${this.baseUrl}/agents/${agentId}/stream`);
    es.addEventListener('text', (e) => onEvent('text', JSON.parse(e.data)));
    es.addEventListener('tool_call', (e) => onEvent('tool', JSON.parse(e.data)));
    es.addEventListener('status', (e) => onEvent('status', JSON.parse(e.data)));
    es.addEventListener('error', (e) => onEvent('error', JSON.parse(e.data)));
    return es;
  }
}
```

---

## 8. 迭代路径 & 里程碑

| 阶段 | 交付物 | 预期周期 |
|------|--------|---------|
| v0.1 | cursor-bridge 独立服务 + CLI 测试 | 1-2 天 |
| v0.1.1 | 简单 Web UI（可选，用于验证） | 0.5 天 |
| v0.2 | Chrome 扩展 Agent 面板集成 | 2-3 天 |
| v0.3 | Native Messaging 自动启动 | 1-2 天 |
| v1.0 | 完整矩阵视图 + 项目管理 | 5-7 天 |

---

## 9. 风险 & 依赖

| 风险 | 影响 | 缓解 |
|------|------|------|
| Cursor SDK API 变更 | 桥接层失效 | 版本锁定 + 适配层隔离 |
| API Key 并发限制 | 多 Agent 被限流 | Agent 池上限 + 排队机制 |
| 本地端口冲突 | 服务无法启动 | 端口可配置 + 自动查找可用端口 |
| Chrome 扩展 localhost 访问 | 被 CSP 阻止 | manifest.json 声明 host_permissions |

---

## 10. 验收标准 (v0.1)

- [x] `npm run dev` 启动服务，`/health` 返回 200 ✅ 2026-05-03
- [x] 通过 API 创建 Agent（指定本地项目路径 + 模型） ✅ 2026-05-03
- [x] 向 Agent 发送 prompt，通过 SSE 接收流式输出 ✅ 2026-05-03
- [x] 支持同时运行 3+ Agent（并发压测通过） ✅ 2026-05-03
- [x] Agent 销毁后资源正确释放 ✅ 2026-05-03
- [x] 超时/错误场景下 Agent 状态正确转移 ✅ 2026-05-03

### 10.2 验收标准 (v0.3)

- [x] `./install.sh <extension-id>` 成功注册 Native Messaging Host ✅ 2026-05-04
- [x] Chrome 扩展通过 Native Messaging 发送 `status` 命令并收到响应 ✅ 2026-05-04
- [x] 点击"启动服务"按钮后 bridge 自动启动并连接成功 ✅ 2026-05-04
- [x] 点击"停止"按钮后 bridge 进程正确退出 ✅ 2026-05-04
- [x] 打开新标签页时，若 bridge 未运行则自动启动（可配置） ✅ 2026-05-04
- [x] PID 文件正确写入/清理 ✅ 2026-05-04
- [x] 卸载脚本正确清理 manifest 和停止服务 ✅ 2026-05-04
