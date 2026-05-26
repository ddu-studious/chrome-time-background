# GraphSphere Demo 回滚演练报告

| 字段 | 值 |
|------|-----|
| drillId | kg3d-drill-20260525T155123Z |
| startedAt | 2026-05-25T15:51:23Z |
| endedAt | 2026-05-25T15:51:24Z |
| overall | **PASS** |

## L0（2D 降级，RTO <5min）

| 项 | 结果 |
|----|------|
| 状态 | pass |
| 说明 | kg-graph-renderer 单测通过；耗时 203ms |

## L2（静态 Demo 回退，RTO <2h）

| 项 | 结果 |
|----|------|
| 状态 | pass |
| 说明 | zip=graphsphere-demo-v0.1.0-stable-31bb591518b2.zip v0.1.0 sha256 OK；scan stable 通过 |
| 稳定 zip | graphsphere-demo-v0.1.0-stable-31bb591518b2.zip |
| 版本 | v0.1.0 |

---
自动生成: `./scripts/rollback-drill-kg3d-l0-l2.sh --report docs/deploy/drill-reports/kg3d-latest.md`
