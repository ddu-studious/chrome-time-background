---
title: "Hermes Cron 故事标题输出规范"
type: technical
status: active
created: "2026-06-02"
updated: "2026-06-02"
tags: [hermes, cron, writing, title]
related:
  - docs/technical/guide-hermes-writing-integration.md
changelog:
  - date: "2026-06-02"
    desc: "初版：与写作空间解析器对齐的 Prompt 规范 + 批量 patch 脚本"
---

# Hermes Cron 故事标题输出规范

写作空间与 cursor-bridge 会从 `## Response` 之后解析标题。为减少兼容分支，**Hermes 侧应统一输出格式**；扩展侧仍保留对旧格式的兼容解析。

## 标准输出（Agent 必须遵守）

### 推荐：首行即标题

```markdown
📜 **少康中兴——遗腹子复国记**
```

加粗内**只能是**本篇真实标题（8~40 字），不得出现字段名「标题」或占位「简明有力」。

### 可选：机器可读行（写在 📜 行之前）

```markdown
HERMES_TITLE: 少康中兴——遗腹子复国记
📜 **少康中兴——遗腹子复国记**
```

bridge 解析器会优先读取 `HERMES_TITLE:`。

## 禁止写法

| 写法 | 后果 |
|------|------|
| `📜 **标题**：伊尹放太甲——…` | 写作空间标题变成「标题」 |
| `📜 **标题：大禹治水——…**` | 标题带「标题：」前缀 |
| 首行 `📜 **标题**：简明有力` | 误用 Prompt 模板占位 |
| 仅有 `# 一级标题` 且无 📜 行 | 依赖兜底解析，不稳定 |

## Prompt 模板说明

Cron Prompt 里的「故事结构」示例行：

```markdown
📜 **标题**：简明有力
```

这是**写作提纲**，不是让 Agent 原样输出的字面量。已在 `hermes-prompts/output-title-standard.md` 中明确区分。

## 应用到现有 3 个 Cron 任务

```bash
# 预览
node scripts/patch-hermes-cron-title-standard.mjs --dry-run

# 写入 ~/.hermes/cron/jobs.json（自动备份）
node scripts/patch-hermes-cron-title-standard.mjs
```

涉及任务 ID：

- `0c0d2c2e0918` — 中国历史每日故事
- `dd51052451f6` — 中国学术思想史每日一讲
- `469d08ad3a2d` — 抗日战争前后故事

## 新增 Cron 任务时

1. 在 Prompt 中 include `hermes-prompts/output-title-standard.md` 全文，或运行 patch 脚本前把 job id 加入 `scripts/patch-hermes-cron-title-standard.mjs` 的 `TARGET_IDS`
2. 在 `cursor-bridge/.../hermes-import.ts` 的 `HERMES_JOB_PROFILES` 登记 job → 分类映射

## 双端职责

| 端 | 职责 |
|----|------|
| Hermes | **规范输出**（本文件 + patch 后的 Prompt） |
| 写作空间 / bridge | **兼容解析**旧稿 + `title-map` / 正文解析修复 `blogPosts` |

## 已显示「标题」的旧文章怎么修

1. 启动 bridge：`cd cursor-bridge && npm run dev`
2. 在 Chrome **扩展管理页** 对该扩展点 **重新加载**
3. 打开新标签页 → 写作空间 → 点击顶栏 **Hermes**（会自动修复标题）

或在写作空间页面按 F12，控制台执行：

```javascript
await HermesWritingSync.repairTitlesInBlog()
// 返回 { ok: true, updated: 4 } 表示已修复 4 篇
```

修复会从 bridge 标题表 + 文章正文里的 `📜 **标题**：真实名` 重新解析，无需重新导入。
