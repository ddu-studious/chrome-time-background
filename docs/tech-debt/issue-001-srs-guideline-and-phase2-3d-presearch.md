# Tech-Debt Issue #001：Guideline SRS 旋转 + 真 3D 多层玩法 Phase 2 预研

| 字段 | 值 |
|------|-----|
| **类型** | tech-debt / pre-research |
| **优先级** | P2 |
| **负责人** | senior-dev |
| **状态** | Open |
| **创建日期** | 2026-05-20 |
| **关联 ADR** | [ADR-001](../adr/adr-tetris-3d-tech-stack-architecture-v1.md) §11 |
| **关联 PRD** | [PRD v1.1 §8](../requirements/prd-tetris-3d-v1.1.md) |
| **预研代码** | `js/tetris-rules-profile.js`、`js/tetris-srs-kicks.js`、`js/tetris-3d-phase2-prototype.js` |

---

## 背景

MVP 裁定采用 **2.5D**（10×20 单层逻辑 + 3D 视觉），内核 `createTetrisGameCore` 沿用 **generic 踢墙**（`KICKS` 数组），**不**接入 Guideline SRS 分块踢墙表与锁定延迟（R1，见 [tetris-mvp-spike-v1.md](../tetris-mvp-spike-v1.md)）。

产品 PRD v1.0 描述的 **真 3D 多层井**（4×4×N、Z 层消除、双轴旋转）已移入 Phase 2，以 90 天留存 KPI 为立项门禁。本 issue 跟踪两项延后债务的 **预研与验收路径**，避免与 MVP 交付耦合。

---

## 范围 A：Guideline SRS 旋转（Tech-Debt）

### 问题陈述

| 现状 | 目标 |
|------|------|
| `rotateCW()` 使用 9 点 generic 偏移试探 | 消费 `guideline_subset_v1.pieceSpecificKickTables`（JLSTZ / I / O） |
| `lockDelayMs = 0`，触地即锁 | `500ms` + `lockResetLimit: 15` + 限定重置事件 |
| 速度曲线硬编码于 `TetrisGameManager` | 读取 profile `speedCurve`（帧/ms 分段） |

### 验收标准（Done Definition）

- [ ] `tetris-srs-kicks.js` 单测覆盖 JLSTZ / I 四套 CW 过渡及 O no-op
- [ ] `createTetrisGameCore` 支持 `profileId` 注入，`rotateCW/CCW` 走 SRS 解析器
- [ ] 锁定延迟状态机单测：重置计数、上限 15、qualified move 列表
- [ ] 回归：`test/tetris-game-core.test.js` + 新增 SRS 向量用例（≥20 条）
- [ ] 文档：`tetris-rules-v1-parameter-bundle.json` 与实现对齐，`reviewStatus` 升为 `implemented`

### 估时

| 子项 | 人日 |
|------|------|
| Profile 加载器 + SRS 踢墙接入 Core | 1–2 |
| 锁定延迟 + 重力累积 refactor | 1–1.5 |
| 速度曲线 + 宿主对齐 | 0.5–1 |
| QA 向量与回归 | 0.5 |
| **合计** | **3–5** |

### 风险

- softDrop「逐格锁块」与 lock delay 语义冲突（R2）→ 须先拆分重力累积器
- 竞技玩家可能对比 Guideline 官方向量 → 对外不承诺竞技合规（BR-VALID-008）

---

## 范围 B：真 3D 多层玩法 Phase 2 预研

### 问题陈述

Phase 2 需独立内核或子系统，玩法状态含 **深度轴 Z**（4×4×N 井）、Z 向消除、多轴旋转、四向深度移动。复杂度约为 2.5D 的 **3–5×**（ADR §3.4）。

### 预研交付物（本 issue 首批）

| 交付物 | 路径 | 说明 |
|--------|------|------|
| 3D 占用网格 + 碰撞 API | `js/tetris-3d-phase2-prototype.js` | `board[z][y][x]`，非 MVP 运行时依赖 |
| Z 层满消除 | 同上 | 整层 Z 平面清除 + 上方层下落 |
| 深度移动 + XY 平面旋转 | 同上 | 预研范围；三轴旋转列为 OQ |
| 复杂度估算钩子 | `estimatePhase2Complexity()` | 供 PM/架构 Go/No-Go 量化 |
| 单测 | `test/tetris-3d-phase2-prototype.test.js` | 碰撞、Z 消层、深度移动 |

### Phase 2 立项门禁（引用 PRD §1.4）

- MVP 上线后 **90 天**内：Dock 点击率 +15~25%、7 日留存 +2~4pp、主功能使用下降 ≤3%
- 本预研完成 **可玩原型 Demo** + 独立 PRD + ADR 修订
- **未达标则冻结** Phase 2 Epic

### 估时（全量 Phase 2，非本 issue）

| 子项 | 周 |
|------|-----|
| 3D 状态机 + 碰撞 + 墙踢 | 3–4 |
| Z/柱体消除 + 计分 | 1–2 |
| 双轴旋转 UX + 教学 | 2–3 |
| 渲染适配（复用 InstancedMesh） | 2–3 |
| QA 全矩阵 | 1–2 |
| **合计** | **+8~12** |

### 开放问题（预研阶段）

| ID | 问题 | 默认假设 |
|----|------|----------|
| OQ-P2-1 | Z 轴正向：0=井口还是井底？ | 0=近端（玩家侧），+N=向井内 |
| OQ-P2-2 | 消层 vs 消柱体 | 先实现 **整层 Z 平面** |
| OQ-P2-3 | 双轴旋转顺序 | Y 轴（竖直）优先，Z 轴（深度）次之 |
| OQ-P2-4 | 与 SRS 债务合并还是并行 | **并行**：SRS 可先于 Phase 2 合入 2.5D |

---

## 任务分解

| # | 任务 | 优先级 | 状态 |
|---|------|--------|------|
| T1 | 落地 `tetris-rules-profile.js` + `tetris-srs-kicks.js` 预研模块 | P2 | ✅ 首批 |
| T2 | 落地 `tetris-3d-phase2-prototype.js` + 单测 | P2 | ✅ 首批 |
| T3 | SRS 接入 `createTetrisGameCore`（profile 注入） | P2 | 待 MVP 发布后 |
| T4 | 锁定延迟 + 重力累积 refactor | P2 | 依赖 T3 |
| T5 | Phase 2 可玩 Demo（Dock 独立入口或 test fixture HTML） | P2 | 依赖 90d KPI |
| T6 | 独立 PRD + ADR-002 真 3D | P2 | 依赖 T5 |

---

## 验证命令

```bash
cd /path/to/chrome-time-background
node --test \
  test/tetris-rules-profile.test.js \
  test/tetris-srs-kicks.test.js \
  test/tetris-3d-phase2-prototype.test.js
```

---

## 标签建议（GitHub）

`tech-debt`, `tetris`, `phase-2`, `pre-research`, `P2`

---

*本文件为 issue 正文 SSOT；创建 GitHub Issue 时可整段粘贴或使用 `.github/ISSUE_TEMPLATE/tech-debt-tetris-srs-phase2.md`。*
