# 多角色 Agent 项目全生命周期使用指南

> 本文档说明如何使用 Cursor Bridge 多角色协作系统，通过 10 个企业角色 Agent 完成一个项目从需求到上线的全生命周期。

---

## 一、系统概览

### 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          用户（你）                                   │
│  "做一个电商小程序" ←── 自然语言需求                                  │
└──────────────────────────┬──────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────────────┐
│  Cursor Bridge (localhost:19840)                                     │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ 任务分析器    │→ │ 讨论引擎     │→ │ 执行引擎 → QA → 部署     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│         ↑                  ↑                     ↑                   │
│  ┌──────┴──────────────────┴─────────────────────┴──────────────┐  │
│  │               白盒可观测性层 (Phase 4.5)                       │  │
│  │  时间线 · 决策日志 · 角色视角 · 因果图 · 回放                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 10 个企业角色

| 角色 | 图标 | 阶段 | 核心职责 |
|------|------|------|---------|
| 运营 | 📊 | 讨论 | 市场分析、ROI 评估 |
| 业务 | 📈 | 讨论 | 业务流程、规则定义 |
| 产品经理 | 📋 | 讨论 | 需求拆解、PRD |
| 项目经理 | 📅 | 讨论+执行 | 计划制定、进度管理 |
| 架构师 | 🏗️ | 讨论+执行 | 技术方案、架构设计 |
| 资深开发 | 👨‍💻 | 执行 | 核心模块、代码审查 |
| 一线开发 | 💻 | 执行 | 功能实现、单元测试 |
| 测试 | 🧪 | QA | 测试用例、Bug 报告 |
| 运维 | 🚀 | 部署 | 部署方案、监控 |
| 技术负责人 | 🎯 | 全程 | 决策仲裁、质量把关 |

---

## 二、快速开始

### 1. 启动服务

```bash
cd cursor-bridge
./start.sh          # 后台启动
./start.sh --fg     # 前台启动（可看实时日志）
./stop.sh           # 停止
./stop.sh --status  # 查看状态
```

### 2. 提交需求（一键启动全流程）

```bash
# 提交自然语言需求
curl -X POST http://localhost:19840/tasks/analyze \
  -H "Content-Type: application/json" \
  -d '{"requirement": "开发一个任务提醒功能，支持定时提醒和重复任务"}'
```

响应中包含：
- **summary**: 需求摘要（类型/规模/技术栈/复杂度）
- **recommendedRoles**: 推荐参与的角色列表
- **executionPlan**: 分阶段执行计划

### 3. 审批执行计划

```bash
# 确认方案（或修改角色/参数）
curl -X PATCH http://localhost:19840/tasks/{taskId}/approve \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## 三、完整生命周期流程

### Phase A: 智能分析

系统自动分析需求，输出：
1. 需求类型（feature/bugfix/refactor/infra/research）
2. 规模评估（small/medium/large/epic）
3. 推荐角色组合
4. DAG 式执行计划

**适配规则**：
- small 需求 → 4 人团队（产品+架构+开发+TL）
- medium 需求 → 8 人团队
- large/epic 需求 → 全部 10 人

### Phase B: 团队讨论

```bash
# 1. 创建讨论
curl -X POST http://localhost:19840/tasks/{taskId}/discussions \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "任务提醒功能的设计方案",
    "phase": "discussion",
    "roleIds": ["operations", "product", "architect", "project-manager", "tech-lead"],
    "maxRounds": 3
  }'

# 2. 执行讨论轮次（每轮所有角色发言）
curl -X POST http://localhost:19840/discussions/{discussionId}/round

# 3. Tech Lead 总结并形成决策
curl -X POST http://localhost:19840/discussions/{discussionId}/conclude
```

**讨论机制**：
- 每轮各角色从自己的专业视角发言
- 支持引用和回应其他角色的观点
- Tech Lead 在最后一轮总结，形成讨论纪要 + 行动项
- 有分歧时 Tech Lead 做最终裁决

### Phase C: 执行落地

```bash
# 1. 创建执行小队（基于讨论结论分解任务）
curl -X POST http://localhost:19840/tasks/{taskId}/squads \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "title": "设计提醒数据模型",
        "description": "定义 reminder 的存储结构和 API",
        "assignedTo": "senior-dev",
        "reviewerId": "architect",
        "priority": "P0",
        "dependsOn": [],
        "input": "讨论纪要中的技术方案",
        "expectedOutput": "数据模型定义 + API 接口设计"
      },
      {
        "title": "实现定时提醒逻辑",
        "description": "基于 chrome.alarms API 实现提醒触发",
        "assignedTo": "developer",
        "reviewerId": "senior-dev",
        "priority": "P0",
        "dependsOn": [],
        "input": "数据模型和 API 设计",
        "expectedOutput": "完整的提醒触发代码 + 单元测试"
      }
    ]
  }'

# 2. 执行具体任务
curl -X POST http://localhost:19840/squads/{squadId}/execute/{taskId}
```

**执行模式**：
- 项目经理分配任务（复杂任务 → 资深开发，普通任务 → 一线开发）
- 资深开发可审查一线开发的输出（审查通过才算完成）
- 遇到技术难题可升级到架构师
- 进度实时追踪

### Phase D: 质量保障

```bash
# 1. 启动 QA 会话
curl -X POST http://localhost:19840/tasks/{taskId}/qa \
  -H "Content-Type: application/json" \
  -d '{
    "executionSquadId": "{squadId}",
    "testCases": [
      {
        "title": "正常创建定时提醒",
        "type": "functional",
        "steps": ["点击添加提醒", "设置时间为5分钟后", "确认保存"],
        "expectedResult": "提醒创建成功，5分钟后触发通知"
      },
      {
        "title": "重复任务周期触发",
        "type": "functional",
        "steps": ["创建每日重复提醒", "等待触发", "检查第二天是否再次触发"],
        "expectedResult": "每天定时触发，不遗漏"
      }
    ],
    "passThreshold": 80
  }'

# 2. 执行测试轮次
curl -X POST http://localhost:19840/qa/{qaId}/run
```

**QA 闭环**：
```
测试 → 发现 Bug → 反馈项目经理 → 分配修复 → 修复 → 回归测试
   ↻ 循环直到通过率 ≥ 80% 或达到最大轮次
```

### Phase E: 部署（运维角色）

运维 Agent 负责：
- 制定部署方案和回滚策略
- 检查安全和性能指标
- Tech Lead 做最终 Go/No-Go 决策

### Phase F: 总结报告

```bash
# 生成项目报告
curl -X POST http://localhost:19840/tasks/{taskId}/report/generate
```

报告包含：
- 需求摘要
- 各阶段完成情况
- 讨论纪要和关键决策
- 执行任务完成率
- Bug 统计和修复率
- 质量评分
- 参与角色列表

---

## 四、白盒可观测性

全过程透明可追溯，支持 5 种视图：

### 1. 时间线视图
按时间排列所有事件，颜色区分角色。
```
GET /traces?taskAnalysisId={id}&view=timeline
```

### 2. 决策日志
结构化展示每个决策的支持/反对/理由。
```
GET /traces/decisions?taskAnalysisId={id}
```

### 3. 角色视角
以单个角色为中心，展示其思考/发言/影响力。
```
GET /traces?roleId=architect&taskAnalysisId={id}
```

### 4. 因果图
展示事件间因果关系链（谁的意见导致了什么决策）。
```
GET /traces/causal-links?taskAnalysisId={id}
```

### 5. 回放模式
按时间步进回放整个协作过程。

---

## 五、最佳实践

### 5.1 需求描述技巧

好的需求描述能让系统更精准地分析：

```
❌ 差: "做一个好看的页面"
✅ 好: "开发一个电商商品详情页，包含图片轮播、价格展示、规格选择、
       加入购物车功能。技术栈用 React + TypeScript，需要支持移动端适配。"
```

### 5.2 何时用多角色 vs 单 Agent

| 场景 | 推荐 | 理由 |
|------|------|------|
| 简单代码修改 | 单 Agent | 无需讨论 |
| 新功能开发 | 多角色 | 需要多视角分析 |
| Bug 修复 | 单 Agent 或 QA+Dev | 视复杂度而定 |
| 架构重构 | 多角色 | 需要架构师+TL 把关 |
| 安全审计 | 多角色 | 需要运维+测试+架构 |

### 5.3 讨论轮次配置

| 需求规模 | 讨论轮次 | 参与角色 |
|----------|---------|---------|
| small | 1-2 轮 | 3-4 人 |
| medium | 2-3 轮 | 5-8 人 |
| large | 3 轮 | 全部 10 人 |

### 5.4 审批门设置

在关键节点设置 Human-in-the-Loop 审批：
- 讨论结论确认（用户确认方案再执行）
- QA 未达标时决定是否继续
- 部署前 Go/No-Go

---

## 六、API 一览表

| 端点 | 方法 | 描述 |
|------|------|------|
| `/tasks/analyze` | POST | 提交需求，LLM 分析 |
| `/tasks/:id` | GET | 获取分析详情 |
| `/tasks/:id/approve` | PATCH | 审批执行计划 |
| `/tasks/:id/status` | GET | 获取全局状态 |
| `/tasks/:id/discussions` | POST | 创建讨论 |
| `/tasks/:id/discussions` | GET | 列出讨论 |
| `/discussions/:id` | GET | 讨论详情 |
| `/discussions/:id/round` | POST | 执行一轮讨论 |
| `/discussions/:id/conclude` | POST | 总结讨论 |
| `/tasks/:id/squads` | POST | 创建执行小队 |
| `/squads/:id` | GET | 小队状态 |
| `/squads/:id/execute/:taskId` | POST | 执行任务 |
| `/tasks/:id/qa` | POST | 启动 QA |
| `/qa/:id` | GET | QA 状态 |
| `/qa/:id/run` | POST | 执行测试轮次 |
| `/tasks/:id/report` | GET | 获取报告 |
| `/tasks/:id/report/generate` | POST | 生成报告 |
| `/roles` | GET | 角色列表 |
| `/roles/:id` | GET | 角色详情 |
| `/.well-known/agent.json` | GET | A2A Agent Card |

---

## 七、实战示例：开发一个任务提醒功能

以下是完整的操作流程演示：

### Step 1: 提交需求

```bash
curl -s -X POST http://localhost:19840/tasks/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "requirement": "为中国风景时钟扩展添加任务提醒功能。支持：1.设置定时提醒 2.重复任务（每天/每周/每月）3.提醒到时通知 4.提醒管理（编辑/删除/暂停）。技术栈：Chrome Extension MV3, chrome.alarms API, chrome.notifications API",
    "projectId": "chrome-time-bg"
  }' | jq .
```

### Step 2: 查看分析结果并审批

```bash
# 查看推荐的角色和计划
curl -s http://localhost:19840/tasks/{taskId} | jq .recommendedRoles

# 满意则审批
curl -X PATCH http://localhost:19840/tasks/{taskId}/approve
```

### Step 3: 启动讨论

```bash
curl -s -X POST http://localhost:19840/tasks/{taskId}/discussions \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "任务提醒功能的产品方案和技术实现",
    "phase": "discussion",
    "roleIds": ["product", "architect", "project-manager", "tech-lead"],
    "maxRounds": 2
  }' | jq .id
```

### Step 4: 执行讨论

```bash
# Round 1: 各角色发言
curl -s -X POST http://localhost:19840/discussions/{discId}/round | jq '.messages[] | {role: .roleId, content: .content[:100]}'

# Round 2: 交叉回应
curl -s -X POST http://localhost:19840/discussions/{discId}/round

# 总结
curl -s -X POST http://localhost:19840/discussions/{discId}/conclude | jq .
```

### Step 5: 创建执行小队

根据讨论结论创建任务列表，分配给开发角色。

### Step 6: QA 测试

创建测试用例，运行测试轮次，修复 Bug，直到通过率达标。

### Step 7: 生成报告

```bash
curl -s -X POST http://localhost:19840/tasks/{taskId}/report/generate | jq .
```

---

## 八、在 Chrome 扩展前端中使用

打开新标签页后，通过 **Cursor Bridge 面板** (Ctrl+Shift+B) 操作：

1. 点击 **"新建协作任务"** 按钮
2. 输入需求描述
3. 查看 AI 分析结果 → 确认/修改角色
4. 观看多角色讨论实时进行（每张卡片一个角色）
5. 查看白盒可观测性面板（时间线/决策/因果图）
6. 执行阶段看到任务进度条
7. QA 阶段看到通过率变化
8. 最终查看完整报告

---

## 九、与单 Agent 模式的区别

| 维度 | 单 Agent | 多角色协作 |
|------|---------|-----------|
| 视角 | 单一 | 10 种专业视角 |
| 决策 | 直觉 | 结构化讨论 + 仲裁 |
| 质量 | 自检 | 独立 QA 闭环 |
| 可追溯 | 日志 | 全链路白盒 |
| 适用 | 快速任务 | 复杂项目 |
| 成本 | 低 | 中高（多次 LLM 调用）|

---

## 十、配置参考

`.env` 配置项：

```env
CURSOR_API_KEY=your_key        # 必须
BRIDGE_PORT=19840              # 服务端口
BRIDGE_MAX_AGENTS=10           # 最大并发 Agent
BRIDGE_DEFAULT_MODEL=claude-sonnet-4-20250514  # 默认模型
BRIDGE_LOG_LEVEL=info          # 日志级别
BRIDGE_LOG_FILE=logs/bridge.log  # 日志文件
```

---

*最后更新: 2026-05-05*
*版本: Cursor Bridge v1.0.0 — Phase 5 + Phase 6*
