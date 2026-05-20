# Tetris 3D 回滚演练报告

| 字段 | 值 |
|------|-----|
| drillId | drill-20260520T051659Z |
| startedAt | 2026-05-20T05:16:59Z |
| endedAt | 2026-05-20T05:16:59Z |
| overall | **PASS** |

## L0（渲染降级，RTO <5min）

| 项 | 结果 |
|----|------|
| 状态 | pass |
| 说明 | renderer+game 单测通过；耗时 196ms（RTO 目标 <5min） |

## L2（版本回退，RTO <2h）

| 项 | 结果 |
|----|------|
| 状态 | pass |
| 说明 | zip=chrome-time-background-v3.16.0-stable-87bb214384d2.zip version=v3.16.0 sha256 OK；无 tetris-3d；CSP/包体扫描通过 |
| 稳定 zip | chrome-time-background-v3.16.0-stable-87bb214384d2.zip |
| 版本 | v3.16.0 |

---
自动生成: `./scripts/rollback-drill-l0-l2.sh --report docs/deploy/drill-reports/latest.md`
