# 俄罗斯方块规则参数包（首版评审附件）

本文档与 `tetris-rules-v1-parameter-bundle.json` 配对：**JSON 为机器可读 SSOT**，Markdown 承担评审叙事与验收锚点。

## 架构师评审结论（首版锁定建议）

| 维度 | **经典子集 `classic_subset_v1`** | **Guideline 子集 `guideline_subset_v1`（推荐）** |
|------|----------------------------------|--------------------------------------------------|
| 踢墙 | 通用偏移试探（实现成本低） | SRS 风格分块踢墙表（JLSTZ / I / O） |
| 锁定 | `lockDelayMs: 0` → 重力步触地即锁（语义简单） | `500ms` + 重置上限 `15` + 限定重置事件 |
| 软降 | 倍率预留（需与「逐格 softDrop」语义对齐） | 常用约 **20×** 重力 |
| 速度曲线 | **ms** 分段近似（NES 体感向） | **60fps 帧** 分段（Guideline 向） |
| 风险 | 与「现代方块」玩家体感偏差大；日后对齐成本高 | Core 状态机复杂度上升（锁定计时器、重置计数） |
| 适用 | 工期极限降级 / 内部试玩 | **首版默认**：七袋已采纳，补齐旋转与锁定更接近公众预期 |

**最终动作**：PO / 技责在评审纪要勾选其一 Profile；架构侧将 `recommendedProfileForMVP` 与选定 Profile **同名同步**，并在版本说明中写明「不对竞技合规作对外承诺」。

---

## 坐标与旋转约定（验收必读）

- **偏移 `[dx, dy]`**：列向右为正，**行向下为正**（与仓库 `js/tetris-game.js` 中 `piece.x / piece.y` 一致）。
- **旋转索引**：`0→1→2→3` 为顺时针（CW）；CCW 由 Core 以对偶迁移实现， JSON 仅给出 CW 序列以降低重复。
- **O**：占位旋转不变；踢墙表为空表示 **no-op**。

---

## 参数表摘要（详见 JSON）

### 1. 踢墙（Guideline Profile）

- **JLSTZ**：四套 `from → to` 的测试序列（每序列最多 5 次偏移）。
- **I**：独立四套序列（避免与 JLSTZ 混用）。
- **Classic Profile**：`genericKickOffsets` 数组顺序即试探优先级。

### 2. 锁定延迟

| Profile | `lockDelayMs` | `lockResetLimit` | 重置触发（示意） |
|---------|---------------|------------------|------------------|
| classic | `0`（瞬时锁） | `0` | — |
| guideline | `500` | `15` | 横移 / 软降步进 / 成功旋转 |

### 3. 软降倍率

两 Profile 均默认 **`softDropGravityMultiplier: 20`**（Core 引入重力累积后与 Guideline 常见体感一致）。若首版暂保留「每次输入下移一格」，须在手册标注 **语义降级**，避免与锁定延迟组合产生歧义。

### 4. 速度曲线

- **classic**：`dropIntervalMs` 按 `levelStart` 阶梯查询（表中未覆盖等级沿用上一档）。
- **guideline**：`dropIntervalFrames @ 60fps`；宿主可换算 `frames / 60 * 1000 ms`。

---

## 可调性与文档化闸门

1. **schemaVersion**：`tetris-rules-params/1.0.0` — 任意破坏性字段改名须升版。
2. **Profile Id**：运行时/UI「高级选项」仅允许选择命名 Profile，不散落魔法数。
3. **变更流程**：体感评审 → 更新 JSON → 同步本条 Markdown「摘要」→ Core 单测覆盖踢墙向量与锁定边界。

---

## 相关代码映射（仅供对接，本条非实现）

| 概念 | 当前仓库锚点 |
|------|----------------|
| 简化踢墙 | `js/tetris-game.js` 中 `KICKS` |
| 重力间隔 | `TetrisGameManager.baseIntervalMs` |
| 软降 / 锁块 | `softDrop`、`tick` |

落地 Profile 时，应由 **Core** 消费参数包；**宿主**只负责 rAF、输入与渲染只读快照。
