---
name: Tech-Debt — SRS Guideline + Phase 2 真 3D 预研
about: 跟踪 Guideline SRS 旋转债务与真 3D 多层玩法 Phase 2 预研
title: "[Tech-Debt] Guideline SRS 旋转 + 真 3D 多层玩法 Phase 2 预研"
labels: tech-debt, tetris, phase-2, pre-research
assignees: ''
---

## 摘要

MVP 采用 2.5D + generic 踢墙；Guideline SRS 与真 3D 井玩法延后至本 issue。预研代码见 `js/tetris-srs-kicks.js`、`js/tetris-3d-phase2-prototype.js`。

**完整 issue 正文 SSOT**：[`docs/tech-debt/issue-001-srs-guideline-and-phase2-3d-presearch.md`](../../docs/tech-debt/issue-001-srs-guideline-and-phase2-3d-presearch.md)

## 范围 A — SRS Guideline

- [ ] Profile 加载器接入 Core
- [ ] JLSTZ / I 分块踢墙 + 锁定延迟
- [ ] 单测 ≥20 条 SRS 向量

## 范围 B — Phase 2 真 3D 预研

- [x] `tetris-3d-phase2-prototype.js` 3D 网格 + Z 层消除
- [ ] 90 天 KPI 达标后 Go/No-Go
- [ ] 独立 PRD + ADR-002

## 验证

```bash
node --test test/tetris-rules-profile.test.js test/tetris-srs-kicks.test.js test/tetris-3d-phase2-prototype.test.js
```

## 关联

- ADR-001 §11
- PRD v1.1 §8
- Spike R1/R2
