# Cursor Skills 上下文膨胀调研 & 优化 SOP

> 调研日期：2026-05-25
> 问题：每次 Cursor 对话时 skills 描述占用大量上下文 token，导致上下文扛不住

---

## 一、问题诊断

### 1.1 现状数据

| 指标 | 数值 | 说明 |
|------|------|------|
| 全局 skills (`~/.cursor/skills/`) | **45 个顶层** | gstack 含 434 个嵌套 SKILL.md |
| gstack 嵌套层级 | **9 层子目录** | `.agents/`, `.factory/`, `.gbrain/`, `.hermes/`, `.kiro/`, `.openclaw/`, `.opencode/`, `.slate/`, `.cursor/` |
| 每层重复 skills | **43 个** | 每层是相同 skills 的副本 |
| codex skills (`~/.codex/skills/`) | **17 个** | lark 系列为主 |
| plugins/cache skills | **18 个** | redis(1) + stripe(3) + superpowers(14) |
| 项目 skills (`.cursor/skills/`) | **4 个** | chrome-extension-dev 等 |
| 项目 rules (`.cursor/rules/`) | **7 个** | 约 28KB 总量 |
| **SKILL.md 文件总字节数** | **~24 MB** | 主要由 gstack 嵌套贡献 |

### 1.2 根本原因

**Cursor 的 agent_skills 注入机制**：Cursor 在每次对话开始时，会扫描所有已注册的 skills 目录，提取每个 SKILL.md 的 `description`（简短描述），将其全部作为 `<agent_skills>` 块注入到系统 prompt 中。这些描述包含：

- 技能名称
- 文件路径
- 1-4 行的功能描述

**问题链**：

```
gstack 安装 → 在 9 个子目录下各复制 43 个 skills
→ 434 个 SKILL.md 描述被注入上下文
→ 加上 codex(17) + plugins(18) + 项目(4) = 473+ 个 skill 描述
→ 每条描述约 200-500 字符 → 总计 ~100K-200K 字符注入系统 prompt
→ 占用约 25K-50K tokens（模型上下文的 10-25%）
→ 留给实际对话的空间大幅缩减
```

### 1.3 关键发现

1. **gstack 的嵌套是设计给多平台的**：`.agents/`, `.hermes/`, `.kiro/`, `.openclaw/` 等子目录是 gstack 为不同 AI 代码编辑器（Claude Code、Hermes、Kiro、OpenClaw 等）准备的技能副本。但 Cursor 会把所有这些都当作 skills 加载。

2. **always_applied_workspace_rules 也会注入**：`.cursor/rules/` 中标记为 `always` 的规则会每次都注入，占用固定上下文。

3. **superpowers plugin 有 hooks**：`superpowers` 插件在每次会话开始时通过 hooks 注入 `using-superpowers` 的完整技能内容（约 3K tokens），强制要求在每次响应前检查 skills。

4. **MCP server 工具描述也占上下文**：每个 MCP server 的工具 descriptor 也会被加载到上下文中。

---

## 二、优化方案

### 2.1 紧急优化：清理 gstack 嵌套重复 (预估节省 80% skills 上下文)

gstack 在 `~/.cursor/skills/gstack/` 下有 9 个子目录，每个包含 43 个完全相同的 skills 副本。这些子目录（`.agents/`, `.factory/`, `.gbrain/`, `.hermes/`, `.kiro/`, `.openclaw/`, `.opencode/`, `.slate/`, `.cursor/`）是给其他 AI 工具用的，Cursor 不需要它们。

**操作**：

```bash
# 查看哪些子目录可以清理
ls -la ~/.cursor/skills/gstack/

# 删除非 Cursor 平台的嵌套 skills 目录
# ⚠️ 保留顶层的 skills（gstack 核心功能）
cd ~/.cursor/skills/gstack/
rm -rf .agents/ .factory/ .gbrain/ .hermes/ .kiro/ .openclaw/ .opencode/ .slate/

# 如果你不在 Claude Code 中使用 gstack，也可以删除 .cursor/ 子目录
# rm -rf .cursor/
```

**预估效果**：从 434 个 SKILL.md 减少到约 45 个，节省 ~89% 的 gstack skills 上下文。

### 2.2 评估全局 skills 的实际使用率

问自己：这些全局 skills 你真的每天都在用吗？

| Skills 分类 | 数量 | 建议 |
|-------------|------|------|
| gstack 核心 (browse, qa, ship, review 等) | ~45 | 保留你常用的，移除不用的 |
| codex/lark 系列 | 17 | 如果不常用飞书 API，可以移除 |
| superpowers | 14 | 评估是否真的需要 |
| redis | 1 | 仅在 redis 项目中才需要 |
| stripe | 3 | 仅在支付项目中才需要 |

**操作**：将不常用的 skills 移到备份目录

```bash
mkdir -p ~/.cursor/skills-backup/

# 示例：移走不常用的
mv ~/.cursor/skills/gstack/benchmark-models ~/.cursor/skills-backup/
mv ~/.cursor/skills/gstack/canary ~/.cursor/skills-backup/
# ... 根据实际使用情况调整
```

### 2.3 优化 rules 配置

将 `always_applied` 规则改为 `agent_requestable`，让 Cursor 仅在需要时加载：

| 规则 | 当前 | 建议 |
|------|------|------|
| `no-subagent.mdc` | always | 保持 always（核心规则）|
| `01-project-overview.mdc` | always | 改为 agent_requestable |
| `02-documentation.mdc` | always | 改为 agent_requestable |
| `03-task-data-integrity.mdc` | always | 改为 agent_requestable |
| `04-demo-management.mdc` | always | 改为 agent_requestable |
| `05-docs-organization.mdc` | always | 改为 agent_requestable |
| `overlay-first.mdc` | always | 改为 agent_requestable |

### 2.4 禁用 superpowers hooks（可选）

superpowers 插件的 hooks 会在每次对话开始时注入 ~3K tokens 的 "using-superpowers" 技能内容。如果你觉得收益不大：

**方法 1**：在 Cursor 设置中禁用 superpowers 插件
**方法 2**：清空 hooks 配置

### 2.5 MCP Server 精简

评估 MCP servers 是否都需要常驻：

| MCP Server | 用途 | 建议 |
|------------|------|------|
| cursor-ide-browser | 浏览器控制 | 保留（常用）|
| user-larkMcpRemote | 飞书 | 按需启用 |
| user-notion | Notion | 按需启用 |
| user-playwright | 自动化测试 | 按需启用 |
| user-sequential-thinking | 思考链 | 保留 |
| user-Context7 | 文档查询 | 保留 |
| user-GitKraken | Git 可视化 | 按需启用 |
| plugin-stripe-stripe | 支付 | 按需启用 |
| plugin-slack-slack | Slack | 按需启用 |
| user-github | GitHub | 保留 |
| user-fetch | 网页抓取 | 保留 |

---

## 三、Cursor 使用 SOP（标准操作流程）

### 3.1 对话管理 SOP

```
┌─────────────────────────────────────────────────┐
│           Cursor 对话上下文管理 SOP              │
├─────────────────────────────────────────────────┤
│                                                 │
│  ① 开新对话前                                    │
│     • 明确本次对话的单一目标                      │
│     • 不要在一个对话中塞多个不相关的任务            │
│     • 预估任务复杂度，超过 3 步的考虑分拆          │
│                                                 │
│  ② 对话中                                       │
│     • 给出清晰、具体的指令                        │
│     • 用 @file 精确引用文件，避免让 AI 搜索        │
│     • 避免反复发送"继续"——每次都会增加上下文       │
│     • 如果对话变长，考虑开新对话                   │
│                                                 │
│  ③ 对话卡住时                                    │
│     • 检查是否上下文已满                          │
│     • 开新对话，用简洁的总结复述需求               │
│     • 不要依赖旧对话的记忆                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.2 Skills 使用 SOP

```
┌─────────────────────────────────────────────────┐
│           Skills 配置与使用 SOP                   │
├─────────────────────────────────────────────────┤
│                                                 │
│  原则：只保留你真正使用的 skills                   │
│                                                 │
│  ① 每月审查一次 skills 列表                       │
│     cd ~/.cursor/skills/                        │
│     ls -la                                      │
│     # 问自己：过去 30 天用过哪些？                 │
│                                                 │
│  ② 分层管理 skills                               │
│     • 全局 skills：仅放跨项目通用的                │
│     • 项目 skills：放项目专属的                    │
│     • 不要两边都放                                │
│                                                 │
│  ③ 清理嵌套重复                                   │
│     • gstack 等工具会在子目录中复制 skills         │
│     • 定期检查并清理非当前平台的副本               │
│                                                 │
│  ④ SKILL.md 编写规范                             │
│     • description 控制在 1-2 句话                 │
│     • 不要在 description 中放详细指令              │
│     • 详细内容放在 SKILL.md 正文中                 │
│     （Cursor 只在 description 匹配时才读正文）     │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.3 Rules 使用 SOP

```
┌─────────────────────────────────────────────────┐
│           Rules 配置 SOP                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  ① always_applied 规则                           │
│     • 仅放绝对必要的（如 no-subagent）             │
│     • 这些规则每次对话都会注入上下文               │
│     • 控制在 3 条以内                             │
│                                                 │
│  ② agent_requestable 规则                        │
│     • 大多数规则应该用这个类型                     │
│     • AI 会根据任务需要自动加载                    │
│     • 不会浪费默认上下文                          │
│                                                 │
│  ③ auto_attached 规则（按 glob 匹配）             │
│     • 用于特定文件类型的规则                       │
│     • 例如：编辑 .ts 文件时加载 TypeScript 规则    │
│                                                 │
│  ④ AGENTS.md                                    │
│     • 放在项目根目录                              │
│     • 保持简洁，不要超过 200 行                    │
│     • 每次对话都会注入                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 3.4 紧急清理操作 Checklist

面对"上下文扛不住"的紧急情况，按以下顺序操作：

- [ ] **第 1 步**：清理 gstack 嵌套目录（节省 ~80% skills 上下文）
  ```bash
  cd ~/.cursor/skills/gstack/
  rm -rf .agents/ .factory/ .gbrain/ .hermes/ .kiro/ .openclaw/ .opencode/ .slate/
  ```

- [ ] **第 2 步**：将不常用 skills 移到备份目录
  ```bash
  mkdir -p ~/.cursor/skills-backup/
  # 按需移动
  ```

- [ ] **第 3 步**：将 rules 从 always 改为 agent_requestable
  - 编辑 `.cursor/rules/*.mdc`，将 `alwaysApply: true` 改为 `alwaysApply: false`

- [ ] **第 4 步**：在 Cursor 设置中禁用不常用的 MCP servers

- [ ] **第 5 步**：重启 Cursor 使更改生效

---

## 四、长期优化建议

### 4.1 Cursor 官方能力的改进方向

目前 Cursor 的 skills 注入机制存在以下问题：

1. **全量注入描述**：即使 skill 不相关，其描述也会被注入。理想情况下应该有智能过滤。
2. **无去重机制**：多个目录下相同 skill 的描述会重复注入。
3. **无优先级排序**：常用和少用的 skills 权重相同。

### 4.2 自建 Skills 管理

可以考虑写一个简单的脚本来管理 skills 的启用/禁用：

```bash
#!/bin/bash
# cursor-skills-toggle.sh
# 快速启用/禁用 skills 目录

SKILLS_DIR=~/.cursor/skills
BACKUP_DIR=~/.cursor/skills-backup

case "$1" in
  disable)
    mv "$SKILLS_DIR/$2" "$BACKUP_DIR/$2"
    echo "Disabled: $2"
    ;;
  enable)
    mv "$BACKUP_DIR/$2" "$SKILLS_DIR/$2"
    echo "Enabled: $2"
    ;;
  list)
    echo "=== Active ==="
    ls "$SKILLS_DIR/" 2>/dev/null
    echo "=== Disabled ==="
    ls "$BACKUP_DIR/" 2>/dev/null
    ;;
esac
```

### 4.3 上下文预算分配参考

| 组件 | 建议 token 预算 | 占比 |
|------|----------------|------|
| 系统 prompt (固定) | ~5K | 5% |
| Rules (always) | ~2K | 2% |
| Skills 描述 | ≤5K | 5% |
| MCP 工具描述 | ~3K | 3% |
| 用户对话历史 | ~50K | 50% |
| 代码上下文 (@file) | ~25K | 25% |
| AI 响应空间 | ~10K | 10% |
| **总计** | **~100K** | **100%** |

当前你的 skills 描述占了约 25K-50K tokens，远超建议的 5K 预算，严重挤压了对话历史和代码上下文的空间。

---

## 五、总结

### 核心问题

你安装的 **gstack 工具在 9 个子目录下重复存放了 43 个 skills**，导致 Cursor 加载 434+ 个 SKILL.md 描述（约 24MB），每次对话消耗约 25K-50K tokens 仅用于 skills 描述。

### 立即行动

1. 删除 `~/.cursor/skills/gstack/` 下的 `.agents/`, `.factory/`, `.gbrain/`, `.hermes/`, `.kiro/`, `.openclaw/`, `.opencode/`, `.slate/` 目录
2. 评估并移除不常用的全局 skills
3. 将大部分 rules 从 `always` 改为 `agent_requestable`

### 预估效果

执行第 1 步后，skills 上下文消耗从 ~50K tokens 降至 ~10K tokens，释放 ~40K tokens 给实际对话使用。
