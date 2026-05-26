---
title: "demo-graph.json 归档规范"
type: deploy
status: active
version: "1.0"
created: "2026-05-25"
updated: "2026-05-25"
author: "DevOps"
tags: [graphsphere, graphsnapshot, archive, demo-graph]
related:
  - docs/deploy/deploy-kg3d-demo.md
  - docs/technical/arch-graphsnapshot-schema-v1.md
  - docs/technical/graphsnapshot-schema-v1.json
changelog:
  - date: "2026-05-25"
    desc: "初版：命名、路径、manifest、校验与发版流程"
---

# demo-graph.json 归档规范

GraphSphere 预置场景在 **开发 SSOT** 与 **发布归档** 之间采用双路径命名，确保 BA 可编辑 fixture、运维可审计发布副本。

---

## 1. 命名与路径

### 1.1 开发 SSOT（研发/BA）

| 场景 | 路径 | 说明 |
|------|------|------|
| A · Chrome/Bridge | `test/fixtures/graphsphere/scenario-a-chrome-bridge.json` | 对内架构图谱 |
| B · AI 技术栈 | `test/fixtures/graphsphere/scenario-b-ai-stack.json` | 对外路演图谱 |
| Draft | `test/fixtures/graphsphere/scenario-*-draft.json` | ≤50 节点草稿，**不入发布包** |
| 单测最小样例 | `test/fixtures/graphsphere/minimal-valid.json` | CI 校验 |

### 1.2 发布别名（静态包 / 归档）

| 别名 | 源文件 | 用途 |
|------|--------|------|
| `demo-graph-a.json` | scenario-a-chrome-bridge | 场景 A 发布副本 |
| `demo-graph-b.json` | scenario-b-ai-stack | 场景 B 发布副本 |

打包路径（zip 内）：

```
fixtures/graphsphere/demo-graph-a.json
fixtures/graphsphere/demo-graph-b.json
```

> **规则**：禁止直接修改归档目录中的 JSON；变更须先改 SSOT，再跑归档脚本。

---

## 2. 归档流程

```bash
# 1. 校验全部 fixture
./scripts/validate-demo-graph-json.sh

# 2. 复制为发布别名 + 写 manifest（自 git 树）
./scripts/archive-demo-graph-json.sh \
  --ref HEAD \
  --version 0.1.0 \
  --tag demo-graph/v0.1.0
```

产出：

| 产物 | 路径 |
|------|------|
| 归档 JSON A | `releases/kg3d-demo/demo-graph-archives/demo-graph-a.json` |
| 归档 JSON B | `releases/kg3d-demo/demo-graph-archives/demo-graph-b.json` |
| Manifest | `releases/kg3d-demo/DEMO_GRAPH_MANIFEST.json` |

---

## 3. DEMO_GRAPH_MANIFEST 结构

```json
{
  "schemaVersion": 1,
  "latest": {
    "role": "demo-graph-release-bundle",
    "demoVersion": "0.1.0",
    "gitRef": "HEAD",
    "gitCommit": "<full-sha>",
    "archivedAt": "2026-05-25T12:00:00Z",
    "gitTag": "demo-graph/v0.1.0",
    "schemaVersion": "1.0.0",
    "files": [
      {
        "alias": "demo-graph-a.json",
        "sourcePath": "test/fixtures/graphsphere/scenario-a-chrome-bridge.json",
        "archivePath": "releases/kg3d-demo/demo-graph-archives/demo-graph-a.json",
        "sceneId": "scenario-a-chrome-bridge",
        "sha256": "<64-hex>",
        "sizeBytes": 12345,
        "nodeCount": 42
      }
    ]
  },
  "bundles": [ "..." ]
}
```

### 3.1 必填字段

| 字段 | 要求 |
|------|------|
| `demoVersion` | 与 `KG3D_DEMO_VERSION` / 发版 tag 一致 |
| `gitCommit` | 归档时 git 树 commit（非工作区脏文件） |
| `files[].sha256` | SHA256 全文件 |
| `files[].nodeCount` | 须 ≤150（L2-P0 preset） |
| `schemaVersion`（bundle 内） | GraphSnapshot `"1.0.0"` |

---

## 4. 校验门禁

归档前 **必须** 通过：

```bash
./scripts/validate-demo-graph-json.sh <file> release
```

校验级别（`kg-graph-core.validateGraphSnapshot`）：

| 级别 | 规则 |
|------|------|
| L0 | JSON Schema、`schemaVersion`、禁止坐标字段 |
| L1 | 边引用、无自环、无重复边 |
| L2-P0 | 节点 ≤150、孤立 ≤5%、主连通 ≥90%、`demo.tourNodeIds` 有效 |

Draft 文件使用同一脚本，`presetPackage: true`（仍跑 L2，上限 150）。

---

## 5. 与静态包的关系

`package-kg3d-demo.sh` 从 **git 树** 读取 SSOT，在 zip 内写入 **发布别名**：

```
scenario-a-chrome-bridge.json  ──copy──▶  demo-graph-a.json
scenario-b-ai-stack.json       ──copy──▶  demo-graph-b.json
```

`index.html` 内场景 catalog 同步改写为 `demo-graph-a` / `demo-graph-b` id。

发版检查清单：

- [ ] SSOT JSON 已通过 `validate-demo-graph-json.sh`
- [ ] `archive-demo-graph-json.sh` 已更新 manifest
- [ ] manifest 中 `sha256` 与归档文件一致
- [ ] CI `scan-kg3d-demo.sh` 校验 zip 内 JSON
- [ ] zip 内 gzip 合计 ≤800KB

---

## 6. 回滚与审计

| 场景 | 操作 |
|------|------|
| 仅回滚数据 | 从 `DEMO_GRAPH_MANIFEST.latest` 取 `sha256`，还原 `demo-graph-*.json` 到 SSOT 或重新 archive |
| 全量回滚 | 使用 `ROLLBACK_MANIFEST.latestStable` 对应 zip（含同版本 JSON 副本） |
| 审计 | 对比 `bundles[]` 历史 `nodeCount` / `sha256` 差异 |

---

## 7. 禁止事项

- 禁止在 JSON 中持久化布局坐标（`x/y/z/position`）
- 禁止将 `*-draft.json` 打入发布 zip
- 禁止跳过 manifest 直接改 `demo-graph-archives/`
- 禁止引入未在 `schema.nodeTypes` 声明的 `type` 字符串

---

*规范维护：Schema bump 时同步修订本文与 `validate-demo-graph-json.mjs` preset。*
