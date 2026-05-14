# AI Agent 生态调研报告 (2026.05)

**调研目的**: 分析当前 AI Agent 生态中高星项目的核心能力，找出对 Cursor Bridge 项目可借鉴的架构模式和设计理念。

---

## 1. 项目速览

| 项目 | Stars | 核心定位 | 语言 | 许可证 |
|------|-------|---------|------|--------|
| [karpathy/autoresearch](https://github.com/karpathy/autoresearch) | 68K+ | 自主 AI 研究（LLM 训练实验） | Python | MIT |
| [garrytan/gstack](https://github.com/garrytan/gstack) | 76K+ | Claude Code 技能框架（虚拟工程团队） | TypeScript | MIT |
| [obra/Superpowers](https://github.com/obra/Superpowers) | - | AI 编码助手工作流框架 | TypeScript | MIT |
| [browser-use/browser-harness](https://github.com/browser-use/browser-harness) | 8.7K+ | 自修复浏览器自动化（CDP直连） | Python/TS | MIT |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | 132K+ | 自我进化多平台 Agent 框架 | Python | MIT |
| [langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) | 1.1K+ | LangChain 深度 Agent SDK（规划/子代理/文件系统） | Python | MIT |
| [RUC-NLPIR/DeepAgent](https://github.com/RUC-NLPIR/DeepAgent) | - | 端到端深度推理 Agent（学术） | Python | MIT |

---

## 2. 详细分析

### 2.1 karpathy/autoresearch

**核心理念**: 给 AI Agent 一个真实的 LLM 训练环境，让它自主实验、评估、迭代。

**架构**:
- 极简设计 — 只有 3 个核心文件（prepare.py, train.py, program.md）
- Agent 修改 train.py → 训练 5 分钟 → 用 val_bpb 评估 → 保留或回滚
- 通过 program.md 人类指导研究方向

**对我们的启发**:
- **"实验-评估-迭代"闭环**: Cursor Bridge 的工作流可以借鉴，让 Agent 自主运行代码、评估结果、决定下一步
- **可量化评估指标**: Agent 每次操作都有明确的成功/失败判断（val_bpb 下降 = 成功）
- **人类指导 + Agent 自主**: program.md 模式 = 我们的 Workflow Template

---

### 2.2 garrytan/gstack (76K Stars)

**核心理念**: "认知齿轮切换" — 每个 Skill 只做一件事，角色隔离防止模式污染。

**23 个 Skill 分为 6 个角色**:
- CEO: `/plan-ceo-review`, `/office-hours`
- 设计师: `/plan-design-review`, `/design-review`, `/design-shotgun`
- 工程经理: `/plan-eng-review`, `/investigate`
- 发布经理: `/ship`, `/land-and-deploy`, `/review`
- 文档工程师: `/document-release`
- QA: `/qa`, `/qa-only`, `/browse`, `/benchmark`

**对我们的启发**:
- **角色模板化**: 我们的 AGENT_TEMPLATES 可以更深入 — 不只是 prompt 模板，而是完整的行为模式
- **Skill 自发现**: gstack 的 Skill 会在对话中自动建议使用，我们可以在命令面板中实现类似推荐
- **`/browse` 持久 Chromium**: gstack 用浏览器做 QA 测试，我们的 Chrome 扩展天然具备浏览器控制能力
- **Ship 工作流**: `/ship` 自动化 PR 全流程，正是我们 Phase 3 工作流系统要实现的

---

### 2.3 Superpowers (obra/Superpowers)

**核心理念**: 结构化 5 阶段工作流 — Clarify → Design → Plan → Code → Verify

**关键设计**:
- 14 个专项 Skill（TDD、调试、子代理分发、计划执行等）
- 强制性脑暴：任何创造性工作前必须先 brainstorm
- TodoWrite 进度追踪：每个计划分解为 2-5 分钟可验证任务
- 子代理驱动开发：并行任务自动 fork 子代理执行

**对我们的启发**:
- **任务分解 + 进度追踪**: 我们的 Agent 卡片可以集成 TodoWrite 式的进度条
- **验证优先**: 每个任务完成后强制验证，可集成到我们的 Human-in-the-Loop 审批
- **子代理隔离**: Superpowers 的 subagent 模式 = 我们的 Agent 间依赖编排

---

### 2.4 browser-harness (8.7K Stars)

**核心理念**: "苦涩的教训" — 不预设人类抽象（click/goto），直接暴露原始 CDP 协议。

**架构亮点**:
- 核心仅 ~592 行代码
- 自修复设计 — Agent 遇到缺失功能时，自己编写 helper 函数
- CDP WebSocket 直连，零抽象层
- TS 版本有 652 个类型化 CDP 方法包装

**对我们的启发**:
- **Chrome 扩展 → browser-harness 桥接**: 我们的扩展天然运行在浏览器中，可以集成类似能力让 Agent 控制页面
- **自修复 Agent**: Agent 遇到问题时自己扩展工具集，而不是预定义所有工具
- **极简设计哲学**: 暴露底层能力让 AI 自己组合，而非堆砌人类设计的抽象

---

### 2.5 hermes-agent (132K Stars)

**核心理念**: 自我进化的全平台 Agent，通过经验学习技能。

**核心能力**:
- **自我学习**: 复杂任务完成后自动创建 Skill
- **跨会话记忆**: FTS5 全文搜索 + LLM 摘要做跨会话回忆
- **多平台网关**: Telegram/Discord/Slack/WhatsApp/Signal/Email/CLI 统一入口
- **6 种终端后端**: 本地/Docker/SSH/Daytona/Singularity/Modal
- **200+ 模型**: 通过 OpenRouter/OpenAI/NVIDIA NIM 等接入
- **70+ 内置 Skill**: MCP 支持、多代理委派

**对我们的启发**:
- **自动 Skill 创建**: 当 Agent 完成复杂工作流后，自动保存为可复用模板
- **跨会话记忆**: 我们的 SQLite 对话历史 + FTS5 = Agent 长期记忆
- **多平台统一**: 理念可借鉴 — Chrome 扩展作为浏览器端入口，cursor-bridge 作为开发端入口
- **用户偏好模型**: hermes 跨会话学习用户偏好，我们可以学习用户常用工作流

---

### 2.6 LangChain Deep Agents (deepagents)

**核心理念**: "Agent 脚手架" — 在 LangChain/LangGraph 之上提供内置规划、文件系统、子代理等能力的高级 Agent SDK。

**官方文档**: https://docs.langchain.com/oss/python/deepagents/overview

**架构**:
- **Planning**: `write_todos` 任务分解和进度追踪
- **Filesystem**: read/write/edit/ls 虚拟文件系统（可插拔后端：内存/磁盘/沙箱/LangGraph Store）
- **Sub-agents**: `task` 工具隔离上下文的子代理委派
- **Context Management**: 自动摘要压缩 + 文件系统卸载长上下文
- **Shell Execution**: 沙箱环境中运行 shell 命令（Modal/Daytona/Deno）
- **Permissions**: 声明式文件系统权限规则
- **Human-in-the-loop**: 敏感操作需人工审批
- **Skills**: 可复用的 Skill 扩展机制

**核心代码示例**:
```python
from deepagents import create_deep_agent
agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",
    tools=[custom_tool],
    system_prompt="You are a helpful assistant",
)
agent.invoke({"messages": [{"role": "user", "content": "..."}]})
```

**对我们的启发**:
- **SDK 模式可借鉴**: Deep Agents 是嵌入式 SDK，我们的 cursor-bridge 也是类似定位
- **Planning Tool 模式**: write_todos → 进度追踪，可直接集成到 Agent 卡片
- **Sub-agent 隔离**: 每个子代理有独立 context window，防止上下文污染
- **Filesystem 作为工作记忆**: Agent 把中间结果写入虚拟文件系统，供其他 Agent 引用
- **可插拔后端**: 文件系统后端可切换（内存/磁盘/Supabase），我们可借鉴做 Agent 存储后端
- **权限控制**: 限制 Agent 读写范围，对多 Agent 协作场景很重要

---

## 3. Deep Agents vs Hermes-Agent 异同对比

| 维度 | Deep Agents (LangChain) | Hermes-Agent (Nous Research) |
|------|----------------------|------------------------------|
| **定位** | 开发框架/SDK（嵌入你的应用） | 独立运行的 AI 助手（端到端产品） |
| **规模** | 轻量（pip 包，~1K stars） | 重量级（完整系统，132K stars） |
| **架构** | LangGraph 状态机 + 可插拔后端 | 自定义引擎 + Skill 自学习循环 |
| **多 Agent** | Sub-agent 模式（父子隔离 + 权限继承） | 委派模式（独立子代理 + RPC） |
| **记忆** | 文件系统工作记忆 + LangGraph Store 持久化 | 短期/长期/实体三层记忆 + FTS5 |
| **平台** | Python，支持任意 LLM provider | Python，独立部署（$5 VPS 起） |
| **学习** | Skills 机制（手动定义） | 自动从经验创建 Skill |
| **工具** | 文件系统 + shell + 用户自定义 | 70+ Skill + 自扩展 |
| **多模型** | 通过 LangChain 接入（OpenAI/Anthropic/Google/Ollama 等） | 200+ 模型，OpenRouter 路由 |
| **沙箱** | Modal/Daytona/Deno 隔离执行 | Docker/SSH/VPS/Modal/Daytona |
| **用途** | 复杂多步编码任务自动化 | 全方位助手（编码+通信+研究） |

**核心差异总结**:
- Deep Agents 是**SDK** — 你构建应用时嵌入它，有 CLI 和 ACP（编辑器协议）集成
- Hermes-Agent 是**产品** — 它本身就是一个完整的 AI 助手
- Deep Agents 偏**结构化编排** — Planning + Filesystem + Sub-agents 三板斧
- Hermes-Agent 偏**自主演化** — 它从经验中学习新能力

---

## 4. 对 Cursor Bridge 项目的具体建议

### 4.1 短期可落地（Phase 2 融合）

| 借鉴来源 | 具体行动 | 优先级 |
|---------|---------|-------|
| Deep Agents | 引入 `write_todos` 式进度追踪到 Agent 卡片 | P0 |
| gstack | Agent 模板升级为"角色 Skill"（含行为模式、禁止列表） | P0 |
| Hermes | Agent 间结果引用 → 用 `@agent-name` 引用输出 | P0 |
| browser-harness | Agent 通过扩展 API 控制当前页面（测试/截图） | P1 |
| Superpowers | 工作流强制验证步骤（Human-in-the-Loop） | P1 |

### 4.2 中期架构演进（Phase 3-4）

| 借鉴来源 | 具体行动 |
|---------|---------|
| autoresearch | "实验-评估-迭代"闭环 → Agent 自动运行代码并根据结果决策 |
| Hermes | Skill 自学习 → 用户常用工作流自动保存为模板 |
| Deep Agents | 文件系统工作记忆 → Agent 间通过虚拟文件系统共享数据 |
| gstack | 认知齿轮切换 → 工作流阶段自动切换 Agent 行为模式 |

### 4.3 长期愿景

将 Cursor Bridge 演化为:
> **"Chrome 扩展中的 Hermes-Agent"** — 一个运行在浏览器新标签页中的多 Agent 协作平台，具备自学习能力、跨会话记忆、浏览器自动化测试、和 IDE 深度集成。

---

## 5. ai-langchain 项目借鉴

你的 `ai-langchain` 项目已安装 LangChain 1.2.10 和 LangGraph 1.0.9，具备：
- `langchain.agents.middleware` — 包含 human_in_the_loop、tool_retry、model_fallback 等
- `langgraph` 状态机引擎 — 用于构建 DAG 工作流
- 可安装 `deepagents` 包直接使用 Deep Agents SDK

**可写的 Demo**:
1. **Deep Agents 基础 Demo**: 用 `create_deep_agent` 创建带规划能力的 Agent
2. **工作流引擎 Demo**: 用 LangGraph 实现"代码审查 → 修复 → 测试"三步 DAG
3. **Human-in-the-Loop Demo**: 用 Deep Agents 的 `human-in-the-loop` 配置实现关键步骤暂停审批
4. **Sub-agent Demo**: 用 Deep Agents 的 `task` 工具并行执行多个子任务
5. **Memory Demo**: 用 LangGraph Store + Deep Agents Filesystem 实现跨会话记忆

这些 Demo 可以验证 cursor-bridge 后端的工作流编排逻辑。

---

*调研日期: 2026-05-05*
*调研人: AI Assistant*
