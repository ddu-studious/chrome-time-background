# Vendor Lock — Chrome 扩展第三方资产

> 供应链锁定清单。CI `scripts/scan-package.sh` 会校验 `three.module.min.js` 的 SHA256 与本文件一致。

## three.js

| 字段 | 值 |
|------|-----|
| **包名** | `three` |
| **版本** | `0.170.0`（`REVISION = '170'`） |
| **许可证** | MIT |
| **用途** | Tetris 3D 渲染层（`js/tetris-3d-renderer.js` ESM import） |
| **路径** | `vendor/three/three.module.min.js` |
| **SHA256** | `009c124ea8ed0beb9fe3166002295fb8dbe1bfb1a2c1cac3600a601ea7017e05` |
| **字节数** | 688373 |

### 升级流程

```bash
# 仓库根目录
npm pack three@0.170.0
tar -xf three-*.tgz package/build/three.module.js
# 压缩写入 vendor/three/three.module.min.js（esbuild / terser）
shasum -a 256 vendor/three/three.module.min.js
# 更新本文件 SHA256 / 版本 / 字节数
./scripts/ci-gate.sh
```

### CI 约束

- 生产 zip **必须** 含 `vendor/three/three.module.min.js`
- zip 内 **不得** 出现 `cdn.jsdelivr.net/npm`、`unpkg.com/`、`unsafe-eval`
- HTML **不得** 含 `<script src="https://...">`

## 其他 vendor（参考）

| 资产 | 说明 |
|------|------|
| `vendor/mermaid.tiny.min.js` | 本地 bundle，非 Tetris 门禁 SHA 校验范围 |
| `vendor/marked.min.js` | 同上 |
| `vendor/purify.min.js` | 同上 |
| `vendor/highlight.min.js` | 同上 |

---

| 版本 | 日期 | 说明 |
|------|------|------|
| v1 | 2026-05-20 | 初版：锁定 three@0.170.0 |
