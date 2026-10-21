---
title: 水族馆氛围层（水流、海洋雪、光束、按通道吸收、环境音）
type: technical
status: completed
version: "1.0"
created: 2026-10-20
updated: 2026-10-20
author: cursor-agent
tags: [aquarium, ambient, fluid, marine-snow, godrays, web-audio, beer-lambert]
related:
  - docs/research/research-aquarium-visual-tech-survey-20261020.md
  - docs/technical/aquarium-yaw-20261020.md
  - docs/technical/aquarium-predation-20261020.md
  - docs/technical/aquarium-shore-20261020.md
changelog:
  - "1.0: 首版。A1–A4 已实现（默认关），A5 因 Sketchfab 未登录改用公开体型数据说明、未改 PROFILES 数值；隔离 Spark/wasm 探针另记；未提交。"
---

# 水族馆氛围层（2026-10-20）

你在调研汇报后选了 A 档全部四组原型，并允许隔离探针加 `'wasm-unsafe-eval'`、Digital Life 由我帮下（你自己登录）。本轮在网页端水族馆落地了 **水流与海洋雪、光束与按通道吸收、水下环境音**；**剖面表校准**因 Sketchfab 登录监视超时未下到网格，改用公开体型数据写明、**没有改 `PROFILES` 数值**；桌面原生端未移植（转身投影你已选“先看网页观感再说”）。

**未提交**；未碰你其它未提交的桌面水母 / 差事 / local-ai 改动。

## 1. 你拍的板与落地对照

| 决定 | 落地 |
|------|------|
| A1+A2 水流与海洋雪 | `js/aquarium-flow-core.js` + `js/aquarium-ambient.js`，设置 `aquariumFlow` **默认关** |
| A3 光束 + 按通道吸收 | `js/aquarium-light-core.js`；`hazeOf(..., absorb)` + `Painter.css` 的 `amounts`；设置 `aquariumRays` **默认关**（开时写实画法也按通道吸收） |
| A4 水下环境音 | `js/aquarium-sound-core.js` + `js/aquarium-sound.js`，设置 `aquariumSound` **默认关**；须本页点击才真正 `start` |
| A5 用公开体型数据校准 PROFILES | Sketchfab 未登录（监视结束 `logged in = false`）；网格未下、未入库；本节 §5 记公开数据与现状，**数值未改** |
| wasm 只给隔离探针 | 主 `manifest.json` **未改**；探针结论见调研补记 |
| 不提交 | 遵守 |

## 2. 模块与接线

| 文件 | 职责 |
|------|------|
| `js/aquarium-flow-core.js` | 纯逻辑：Stam 稳定流体（粗网格）+ 海洋雪；只读鱼状态；`burst` 给捕食张口 |
| `js/aquarium-light-core.js` | 纯逻辑：斜光带纹理（低分辨率、约 14 Hz 重算） |
| `js/aquarium-ambient.js` | 画法：离屏 `ImageData` → `drawImage`；海洋雪分前后两层；`seeded` 随机流 |
| `js/aquarium-sound-core.js` | 纯逻辑：粉红噪声样本、主音量、气泡时刻表 |
| `js/aquarium-sound.js` | Web Audio 接线；可注入假 `AudioContext` |
| `js/aquarium.js` | 可选层接线：`options.flow` / `options.rays` 明确 `true` 才开；省流量一律关；失败只停自己 |
| `js/aquarium-real.js` / `js/marine-rig-canvas.js` | `absorb` → 每通道 `amounts`；无 `amounts` 时与改前逐位一致 |
| `js/background-experience.js` | 设置默认 / 规范化 / 每帧传 `flow`·`rays`；环境音由宿主持有，指针按下才 `start` |
| `settings.html` / `js/settings-page.js` | 三个默认关的开关与如实文案 |

脚本顺序（`index.html`）：… → predation → **flow → light → ambient → sound-core → sound** → … → aquarium → … → background-experience。版本钉子：`aquarium.js?v=8`、`aquarium-real.js?v=4`、`marine-rig-canvas.js?v=2`、`background-experience.js?v=19`、`settings-page.js?v=19`。

**不盖壁纸**：染色、雪、光束都用 `globalCompositeOperation = 'screen'`（只加亮）；光束 `MAX_ALPHA` 初值 0.10；染色上限 `FLOW_DYE_ALPHA` 0.48。真实 Chrome 156 隔离配置下，开关氛围层的全画面灰度差均值约 **2/255**（局部最大约 100+），放大差分能清楚看到尾迹、竖向光柱与雪点——叠在亮壁纸上故意很淡。

## 3. 流场与海洋雪（A1+A2）

- 网格目标边长 18 px，夹在 16×9…96×54；速度单位格子/秒；Neumann/反射边界。
- 尾迹：体长 ≥ 36 px、速度 ≥ 6 px/s、`state` 为 `alive`（或缺省）的鱼；每步最多 14 条（体长大优先）；速度向目标射流**松弛**（不是每步叠加冲量）；染色按扫过面积 `DYE_LEVEL·π·R·v`。
- 海洋雪：粒子数 ≈ 面积/3200（120…520）；下沉 + 慢漂 + 0.55 耦合流场；沉到 `floorY`（岸线，缺省画布底）回到顶。
- 捕食 `bubbles` 回调额外 `Flow.burst`（只是视觉）。
- Node 冒烟（1440×900、鲸鲨+锤头、600 步）：约 **0.68 ms/步**（只算计算）；真实 Chrome 里与整帧画鱼合在一起，单帧驱动均值约 5–36 ms（机器负载很高，偏悲观）。

## 4. 光束与吸收（A3）

- 5 条斜光带，纹理 80×45，约 14 Hz；夜里保留约 12%。
- Beer–Lambert 吸收系数初值 `a ≈ [0.22, 0.065, 0.02]` / m，虚拟水深 7 m；`amounts` 均值在未触顶时等于原来的 `amount`（只改色偏）。
- 单测：红 ≥ 绿 ≥ 蓝；`z=1` 为零；无 `absorb` 时无 `amounts`；`css` 的 `amounts` 与全等回退。

## 5. 环境音（A4）

- 程序合成：循环粉红噪声 + 55 Hz 嗡鸣 + 低通 + 偶发气泡“啵”；不联网、不读文件。
- **默认关**；打开后须在本页点一下（自动播放策略）；`visibility` / 工作台遮挡时 `suspend`；省流量不建。
- 有头 Chrome 里真实听感与自动播放边界：**未在本机有头会话核对**（无头隔离配置只验了接线与假上下文单测）。

## 6. A5 剖面校准（未改数值）

原计划用 Digital Life 3D（CC BY-NC 4.0）网格量体轴宽高比。做法：隔离临时 Chrome + `/tmp/aq-dl/watch.mjs` 等你登录 → 下到 `/tmp`（不入库）→ 自写解析量测。

**结果**：监视结束时仍未登录（两端 401 / 上下文已关），**没有下载任何网格**。公开可核对的文字：

| 物种 | 公开体型要点 | 与现状 |
|------|-------------|--------|
| 小锤头鲨 | Digital Life 73A 描述成年雌性 Nemesis 约 **329 cm**（激光摄影测量）；头锤宽约体长 20–25%（文献量级） | 水族馆 `meters` 与 `PX_PER_M=56` 已按约 2.5 m；yaw 锤头 `half:14.5`（骨架单位）属美术取值，**未用网格重标** |
| 鲸鲨 | 体长可达约 9–12 m；头部相对侧扁、正面观头宽 | `whaleshark` τ 表头部已 >1；**未改** |
| 蝠鲼 / 海龟 | 俯视盘宽、龟甲纵横比有公开形态学数据 | 二者**不做 yaw 剖面**（俯视/已有侧视骨架） |

许可提醒：若日后下载 Digital Life，网格只许放 `/tmp`、记录测量数字与署名（Digital Life / UMass Amherst 等），**不得入库**。

## 7. 验证（分层如实）

**跑过**

- 新单测：`aquarium-flow-core` 12、`aquarium-light-core` 4、`aquarium-sound-core` 3、`aquarium-sound` 3；`aquarium-real` 吸收用例；`aquarium-integration` 设置与脚本钉子。
- 氛围相关子集与既有 aquarium 集成 / water / real：**全过**。
- 真实 Chrome 156（无头、隔离配置、扩展目录即本工作区）：氛围层开着时可建流场与光束（`flowLive`/`raysLive`）、无 pageerror；开关差分见上。

**读过**

- Stam 2003 公开算法思路（自写，无第三方流体代码）；Aurelia（MIT）只借“闪烁浮游生物 / 竖向光”观感，未借代码。

**没核对**

- 有头 Chrome 里环境音听感与自动播放；你自己的 Chrome 配置；真实 GPU 长期占用；桌面原生端；Digital Life 网格实测；Spark 隔离探针的完整样张（见调研补记待补）。

## 8. 安全自查（本轮）

无新权限、无网络、无密钥；环境音与流体均本地；设置默认关；Digital Life 未入库。一眼：本轮 diff 无认证绕过、无注入面扩大、无秘密落盘。
