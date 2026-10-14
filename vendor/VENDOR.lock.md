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

## flv.js

| 字段 | 值 |
|------|-----|
| **包名** | `flv.js` |
| **版本** | `1.6.2` |
| **许可证** | Apache-2.0 |
| **用途** | B 站直播官方活动播放器不可用时的 App 内 FLV 降级播放 |
| **路径** | `vendor/flv.min.js` |
| **许可证路径** | `vendor/flv.js.LICENSE` |
| **npm integrity** | `sha512-xre4gUbX1MPtgQRKj2pxJENp/RnaHaxYvy3YToVVCrSmAWUu85b9mug6pTXF6zakUjNP2lFWZ1rkSX7gxhB/2A==` |
| **SHA256** | `733b9b325dbc59871a652c0a84f2f285a2cfd06cf2efcedcd87cb1e194cd1e8f` |
| **字节数** | 144165 |

## Font Awesome Free

| 字段 | 值 |
|------|-----|
| **包名** | `@fortawesome/fontawesome-free` |
| **版本** | `6.0.0` |
| **许可证** | `(CC-BY-4.0 AND OFL-1.1 AND MIT)`：图标 CC BY 4.0、字体 SIL OFL 1.1、代码 MIT；官方 CSS 头部的署名注释与 `vendor/fontawesome/LICENSE.txt` 必须保留 |
| **用途** | 首页、设置、任务、闹钟响铃页的图标字体。原先从 `cdnjs.cloudflare.com` 加载：样式表阻塞首次渲染，网络慢或不可达时整页等待 |
| **路径** | `vendor/fontawesome/css/all.min.css`、`vendor/fontawesome/webfonts/*.woff2`、`vendor/fontawesome/LICENSE.txt` |
| **npm integrity** | `sha512-6LB4PYBST1Rx40klypw1SmSDArjFOcfBf2LeX9Zg5EKJT2eXiyiJq+CyBYKeXyK0sXS2FsCJWSPr/luyhuvh0Q==`（`npm pack` 取得的 tarball 已逐字节核对） |
| **css/all.min.css SHA256** | `8d321d88cb97fdedc3189506c25de9292c6e73a60ebaab496243346c6404480e`（89220 字节，与包内文件逐字节相同，不得手改） |
| **fa-solid-900.woff2 SHA256** | `1b099f88c06ed0869872561c157f0ec9cbe133a0939d9ece4ee1e1f54bd4683d`（126828 字节） |
| **fa-regular-400.woff2 SHA256** | `fa79fc4f2559112ff3dd27cf5be216d9b5f88066ceef728264f5a3a1a195fc1e`（23900 字节） |
| **fa-brands-400.woff2 SHA256** | `29bc44694c394921d1f00271128a2e4cd8293516216e24eac07a73fa821fc1f5`（104544 字节） |
| **fa-v4compatibility.woff2 SHA256** | `b3abfccce275536beaaeba990e900a0c08ed2fefbabf4a8bcbb2e2ffe3f2431f`（4956 字节） |
| **LICENSE.txt SHA256** | `de784a808496d49f5f80dd9d1d6e9a51cff712cfbc339e7c25155631ae3cdb5d`（7427 字节） |

只带 `woff2`：官方 CSS 为每个字体同时列出 `woff2` 与 `ttf`，浏览器取第一个支持的格式，Chrome（本扩展最低 142）只会请求 `woff2`，所以未带 `ttf`（共 4 个文件，也避免给扩展目录增加不必要的文件）。`uninstall.html` 仍引用 cdnjs 的 6.4.0（独立的卸载页，不在日常打开路径上）；`demo-*.html`、`demos/`、`test/` 下的演示页同样未改。

### 升级流程

```bash
npm pack @fortawesome/fontawesome-free@<版本>
# 用 `npm view @fortawesome/fontawesome-free@<版本> dist.integrity` 核对 tarball 的 sha512
tar -xzf fortawesome-fontawesome-free-<版本>.tgz package/css/all.min.css package/webfonts package/LICENSE.txt
# 复制 css/all.min.css、webfonts/*.woff2、LICENSE.txt 到 vendor/fontawesome/ 对应位置；CSS 不得改动
shasum -a 256 vendor/fontawesome/css/all.min.css vendor/fontawesome/webfonts/*.woff2 vendor/fontawesome/LICENSE.txt
# 更新本节版本、integrity、SHA256、字节数；不同版本的图标名/字形可能增减，升级后必须逐页目视核对
```

---

| 版本 | 日期 | 说明 |
|------|------|------|
| v1 | 2026-05-20 | 初版：锁定 three@0.170.0 |
| v2 | 2026-08-29 | 锁定 flv.js@1.6.2，用于直播 FLV 降级播放 |
| v3 | 2026-10-14 | 锁定 Font Awesome Free 6.0.0 本地副本（woff2），首页/设置/任务/闹钟响铃页不再依赖 cdnjs |
