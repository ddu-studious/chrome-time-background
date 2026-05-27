---
title: "写作空间 RAG 联想与 Agent 能力建设 v2"
type: technical
status: active
version: "2.0"
created: "2026-05-26"
updated: "2026-05-26"
author: "AI Assistant"
tags: [writing, rag, embedding, agent, dashboard, cdp, worktree, prompt-editor, session]
related:
  - docs/technical/plan-dock-agent-capability-v1.md
  - docs/requirements/prd-blog-ai-autocomplete.md
  - docs/research/research-agent-capability-building.md
changelog:
  - date: "2026-05-26"
    desc: "初始创建，覆盖 Agent 能力补全 + 写作空间 RAG 联想完整实现"
---

# 写作空间 RAG 联想与 Agent 能力建设 v2

## 1. 任务一：Agent 能力建设

### 1.1 Dashboard 使用开放接口（已完成 → 100%）

#### 技术方案

| 项目 | 说明 |
|------|------|
| API 端点 | `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` |
| 协议 | Connect RPC v1 (JSON over HTTP) |
| 认证 | Bearer Token (从 Cursor 本地 state.vscdb 读取) |
| Token 刷新 | `POST https://api2.cursor.sh/oauth/token` (refresh_token flow) |

#### 实现文件

**`cursor-bridge/src/services/dashboard.ts`**

- 自动从 `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` 读取 JWT
- JWT 过期时自动通过 refresh_token 刷新
- 返回的数据包含：
  - `billing.planUsage` — 计费周期用量/额度/百分比
  - `billing.onDemandUsage` — On-Demand 用量（如有）
  - `user` — 用户信息 + 计划类型
  - `models` — 可用模型列表
  - `localUsage` — 本地 Agent 运行统计

#### 返回数据结构

```typescript
interface DashboardSnapshot {
  user: { apiKeyName: string; userEmail?: string; plan?: string };
  models: Array<{ id: string; displayName?: string }>;
  localUsage: UsageSummary;
  billing: {
    billingCycleStart: string;
    billingCycleEnd: string;
    planUsage: { totalSpend: number; remaining: number; limit: number; percentUsed: number };
    onDemandUsage?: { totalSpend: number; limit: number; remaining: number };
  } | null;
  fetchedAt: number;
}
```

### 1.2 Session 聚合前端（已完成 → 100%）

#### 实现方式

创建独立 HTML 面板，通过 Bridge 路由 `/sessions/panel` 提供：

- 列表展示所有 Agent Session（按时间倒序）
- 状态过滤（进行中/已完成/失败）
- 点击展开时间线视图，显示各 Agent 角色的对话摘要
- 参与角色标签显示

**文件**: `cursor-bridge/src/routes/session-panel-ui.ts`
**入口**: `GET http://127.0.0.1:19840/sessions/panel`

### 1.3 浏览器自动化 CDP 增强（已完成 → 100%）

#### 新增操作类型

| 操作 | 说明 | 参数 |
|------|------|------|
| `hover` | 完整悬浮（mouseenter + mouseover + mouseMoved + hold） | `target`, `params.holdMs` |
| `doubleClick` | 双击元素 | `target` |
| `rightClick` | 右键点击 | `target` |
| `drag` | 从 A 元素拖拽到 B 元素 | `target` (from), `params.to`, `params.steps` |

**文件**: `cursor-bridge/src/services/browser-automation.ts`

#### hover 增强细节

- 触发 `mouseenter` + `mouseover` DOM 事件（JS 层面）
- CDP `Input.dispatchMouseEvent` 发送 `mouseMoved` 
- 支持 `holdMs` 参数控制悬停时长（默认 300ms）

#### drag 实现

- 平滑多步拖拽（默认 10 步 + 16ms 间隔）
- 起点 mousePressed → 逐步 mouseMoved → 终点 mouseReleased

### 1.4 Self-Loop 验证引擎与 QA 角色联动（已完成 → 100%）

#### 新增 QAReport 结构

验证失败时自动生成结构化 QA 报告，可直接传递给多角色系统的 QA Agent：

```typescript
interface QAReport {
  severity: 'critical' | 'major' | 'minor';
  failedTests: Array<{
    testId: string;
    testName: string;
    error: string;
    screenshot?: string;
    stepsCompleted: number;
    totalSteps: number;
  }>;
  environment: { baseUrl: string; timestamp: number; retryAttempt: number };
  suggestions: string[];
  requiresManualFix: boolean;
}
```

**文件**: `cursor-bridge/src/services/self-loop-verify.ts`

#### 联动流程

```
Dev Agent 代码变更
    ↓
Self-Loop 执行测试
    ↓ (失败)
生成 QAReport → 路由到 QA 角色
    ↓
QA 角色分析 → 生成修复建议
    ↓
回传 fixSuggestions → 可选自动重试
```

### 1.5 多角色 Prompt 可视化编辑器（已完成 → 100%）

#### 实现方式

自包含 HTML 页面，通过 `/prompts/editor` 路由提供：

- 左侧：角色列表（11 个企业角色）
- 右侧编辑区：
  - 角色定义 (Role)
  - 系统提示词 (System Prompt)
  - 行为规则 (Behavior)
  - 输出格式 (Output Format)
  - 约束 (Constraints)
  - 组合预览（实时拼接展示）
- 版本管理：保存新版本、查看历史、激活指定版本

**文件**: `cursor-bridge/src/routes/prompt-editor-ui.ts`
**入口**: `GET http://127.0.0.1:19840/prompts/editor`

### 1.6 Git Worktree（已确认 → 可用）

#### 验证结果

- `.cursor/worktrees.json` 已配置完备
- `git worktree list` 确认本项目支持
- 配置了 unix/windows 两套 setup 脚本（复制 .env + npm install）

#### 使用方式

Cursor IDE 中选择 Worktree 模式运行 Agent，或手动：

```bash
git worktree add -b feat/xxx ../chrome-time-worktree-xxx
```

---

## 2. 任务二：写作空间 RAG 联想

### 2.1 功能概述

基于千问 `text-embedding-v3` 模型实现文档语义检索增强。用户在写作空间输入时，系统从历史文档中检索语义相关片段，注入 LLM 上下文，提升补全质量。

### 2.2 技术架构

```
用户输入 → WritingAssistant 触发补全
    ↓
(RAG enabled?) → 取光标前 200 字作 query
    ↓
千问 Embedding API → 生成 query 向量
    ↓
本地向量库余弦相似度检索 → Top-K 结果
    ↓
注入 system prompt → 发送给千问 LLM → 流式响应
```

### 2.3 核心组件

| 组件 | 文件 | 说明 |
|------|------|------|
| RAG Service | `cursor-bridge/src/modules/writing/rag-service.ts` | 索引/检索/配置管理 |
| Embedding Client | 复用 `qwen-client.ts` 的 OpenAI 实例 | text-embedding-v3 |
| 向量存储 | SQLite `writing_rag_chunks` 表 + 内存 | 持久化 + 快速检索 |
| 前端设置 | `js/writing-assistant.js` 设置面板 | RAG 开关/TopK/系统提示词 |

### 2.4 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/writing/rag/index` | 索引文档（分 chunk + embedding） |
| POST | `/writing/rag/retrieve` | 语义检索相关片段 |
| GET | `/writing/rag/config` | 获取 RAG 配置 + 系统提示词 |
| PUT | `/writing/rag/config` | 更新 RAG 配置 |
| GET | `/writing/rag/stats` | 获取向量库统计 |
| DELETE | `/writing/rag/store` | 清除向量库 |
| GET | `/writing/rag/system-prompt` | 获取联想系统提示词 |

### 2.5 默认关闭

RAG 联想 **默认关闭** (`enabled: false`)，需用户手动开启：

1. 在写作 AI 设置面板勾选"启用联想"
2. 或通过 API: `PUT /writing/rag/config` 设置 `{ "enabled": true }`

关闭时，写作补全仅使用基础 system prompt，不触发 embedding 请求。

### 2.6 系统提示词可视化

在写作 AI 设置面板中新增 RAG 区域：
- 联想开关
- Top-K 检索条数设置
- 系统提示词只读预览（展示当前使用的 RAG 增强 prompt）

系统提示词内容：

```
续写用户文本1-2句。直接输出续写内容，不重复已有文本，不加引号。保持语气一致，优先中文。

当提供了"参考文档片段"时，优先从中获取灵感和措辞进行续写，使输出与用户历史文档风格一致。不要照抄参考内容，而是融合其风格和知识自然续写。
```

### 2.7 Embedding 配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 模型 | `text-embedding-v3` | 千问通用文本向量模型 |
| 维度 | 512 | 平衡精度与存储 |
| Chunk 大小 | 200 字 | 按段落分割 |
| Chunk 重叠 | 50 字 | 保证上下文连续 |
| Top-K | 3 | 检索最相关的 3 个片段 |
| 最低分数 | 0.3 | 余弦相似度阈值 |

### 2.8 数据存储

SQLite 表结构：

```sql
CREATE TABLE writing_rag_chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  doc_title TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,  -- JSON array of floats
  created_at INTEGER NOT NULL
);
```

启动时从 DB 加载到内存，检索时使用内存中的余弦相似度计算。

---

## 3. 能力矩阵总览（v2 更新）

| 能力模块 | 完成度 | 变更 |
|---------|--------|------|
| Dock 放大效果 | 100% | - |
| Launchpad 定位优化 | 100% | - |
| 右键配置菜单 | 100% | - |
| Session 聚合后端 | 100% | - |
| Session 聚合前端 | **100%** | ✅ 独立面板 + 时间线视图 |
| 浏览器自动化 CDP | **100%** | ✅ hover/drag/doubleClick/rightClick |
| Self-Loop 验证引擎 | **100%** | ✅ QAReport + QA 角色联动 |
| 多角色 Prompt 管理 | **100%** | ✅ 可视化编辑器 |
| Cursor SDK 集成 | 100% | - |
| Git Worktree | 100% | 已验证可用 |
| Dashboard 数据 | **100%** | ✅ gRPC 开放 API + 额度/用量 |
| AB 测试 | 100% | - |
| 写作 RAG 联想 | **100%** | ✅ 千问 embedding + 向量检索 |
| 联想默认关闭 | **100%** | ✅ enabled: false |
| 系统提示词可视化 | **100%** | ✅ 设置面板内展示 |

---

## 4. 变更文件清单

| 文件 | 类型 | 变更说明 |
|------|------|---------|
| `cursor-bridge/src/services/dashboard.ts` | 重写 | 接入 Cursor gRPC API，支持 billing/usage |
| `cursor-bridge/src/services/browser-automation.ts` | 修改 | 新增 doubleClick/rightClick/drag + hover 增强 |
| `cursor-bridge/src/services/self-loop-verify.ts` | 修改 | QAReport 结构 + buildQAReport 函数 |
| `cursor-bridge/src/routes/prompt-editor-ui.ts` | 新增 | Prompt 可视化编辑器 HTML 面板 |
| `cursor-bridge/src/routes/session-panel-ui.ts` | 新增 | Session 聚合面板 HTML |
| `cursor-bridge/src/modules/writing/rag-service.ts` | 新增 | RAG 核心服务（索引/检索/配置） |
| `cursor-bridge/src/modules/writing/service.ts` | 修改 | 集成 RAG 到补全流程 |
| `cursor-bridge/src/modules/writing/routes.ts` | 修改 | 新增 RAG API 路由 |
| `cursor-bridge/src/modules/writing/index.ts` | 修改 | 导出 RAG 初始化函数 |
| `cursor-bridge/src/index.ts` | 修改 | 注册新路由 + RAG 表初始化 |
| `js/writing-assistant.js` | 修改 | 设置面板增加 RAG 配置区域 |
| `docs/technical/plan-writing-rag-and-agent-capability-v2.md` | 新增 | 本文档 |

---

## 5. 使用指南

### 5.1 启动 Dashboard

```bash
curl http://127.0.0.1:19840/dashboard
```

### 5.2 打开 Prompt 编辑器

浏览器访问: `http://127.0.0.1:19840/prompts/editor`

### 5.3 查看 Session 面板

浏览器访问: `http://127.0.0.1:19840/sessions/panel`

### 5.4 开启 RAG 联想

```bash
# 1. 开启 RAG
curl -X PUT http://127.0.0.1:19840/writing/rag/config \
  -H 'Content-Type: application/json' \
  -d '{"enabled": true}'

# 2. 索引文档
curl -X POST http://127.0.0.1:19840/writing/rag/index \
  -H 'Content-Type: application/json' \
  -d '{"docId":"doc1","title":"我的文档","content":"这是文档内容..."}'

# 3. 验证检索
curl -X POST http://127.0.0.1:19840/writing/rag/retrieve \
  -H 'Content-Type: application/json' \
  -d '{"query":"相关关键词"}'
```

### 5.5 Worktree 开发

```bash
# 创建 worktree 分支
git worktree add -b feat/new-feature ../chrome-time-feat-xxx

# Cursor IDE 中自动执行 .cursor/worktrees.json 中的 setup 脚本
# 完成后回到主干
git worktree remove ../chrome-time-feat-xxx
```
