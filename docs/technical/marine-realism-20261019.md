---
title: "海洋动物写实化：矢量骨架求值器（MarineRig）、四种动物的写实数据、水族馆写实画法与桌面写实动物（协议不升版本，默认写实）"
type: technical
status: active
version: "1.0"
created: "2026-10-19"
updated: "2026-10-19"
author: "AI 助手"
tags: [水族馆, 桌面水母, 海洋动物, 写实, 骨架求值, CoreGraphics, Canvas, 对齐]
related:
  - docs/research/research-marine-realism-20261019.md
  - docs/superpowers/specs/2026-10-19-marine-realism-design.md
  - docs/technical/aquarium-water-20261019.md
  - docs/technical/aquarium-20261017.md
  - docs/technical/jelly-species-hammer-20261018.md
  - docs/technical/jelly-species-turtle-20261018.md
changelog:
  - date: "2026-10-19"
    desc: "初始创建：写实骨架系统、四种动物数据、水族馆与桌面两端的接线、对齐检查、验证分层与未验收项"
  - date: "2026-10-19"
    desc: "并入实验分支：脏工作区下的三方合并做法、合并后全量测试与原生验证，以及冒烟对机器负载与鼠标位置敏感的判定过程"
---

# 海洋动物写实化（MarineRig）

用户反馈：桌面与水族馆里新增的小锤头鲨、蝠鲼、海龟、鲸鲨“不太真实”，希望参考 X 上的作品和公开资料做得更像真实动物，并且**桌面端与首页水族馆对齐**。调研与取舍见 `docs/research/research-marine-realism-20261019.md`，设计见 `docs/superpowers/specs/2026-10-19-marine-realism-design.md`。本文是实现说明。

## 做了什么

| 项 | 行为 |
|---|---|
| 首页水族馆 | 四种动物默认用**写实画法**：整条脊柱行波（头几乎不动、幅度向尾部增大）、鳍与翼沿展向相位滞后、背深腹浅的逆荫蔽配色、物种花纹（鲸鲨 60 个白斑与纵棱、蝠鲼白色腹面与鳃裂暗斑、海龟盾片与头部鳞片、锤头鲨的宽头与眼）、转弯时身体弯成弧；远处更淡更蓝（景深雾），夜里更暗并有一圈光晕。设置页“写实动物”开关 `aquariumRealistic`（默认开，只有明确 `false` 才回卡通）。**海龟没有卡通画法**，关闭开关后仍是写实 |
| 桌面水母 | 设置页多一项“动物样式：写实 / 卡通”（`desktopJellyAppearanceV1.realistic`，**Chrome 侧默认 `true`**）。原生组件用**同一份展开后的数据**、同一条求值公式，经 CoreGraphics 画同一种动物；写实动物用自己的自然体色，颜色与花纹只管水母与卡通动物；倒计时的阶段色（临近/紧迫/最后 10 秒）按 34% 混入；平静阶段是自然体色。**协议仍是 v10，不升版本**：回执 `appearance:{status:'ok', species, realistic}`，旧组件没有 `realistic` 字段，Chrome 一律按卡通算，设置页如实写“组件还没有写实版” |
| 对齐 | 骨架数据、压平、脊柱与鳍的变形公式、放置规格只有一份（JS 为准，Swift 由生成器产出数据并逐点对拍），两端各有一支很薄的画笔。静态姿态下两端像素一致（见“对齐”一节）；运动模型、景深雾、光晕、阶段色与背景**没有**对齐 |

## 复用与新增（对照 AGENTS.md“优先复用”）

- 没有适用的开源 SDK：桌面是 CoreGraphics、首页是 Canvas 2D，动物的骨架与形状是本项目自有数据。已有的第三方作品（X 上的帖子、参考照片）**只借做法的思路，不借模型、代码、素材**；参考图只用于测量比例，不描摹、不入库，也没有版权与出处记录，所以没有用在产品里。
- **复用**：`js/jelly-species-shapes.js` 的严格路径解析与 `ellipsePath/mirrorPath`（只认 `M/L/C/Q/Z` 绝对命令）——Swift 侧复用已有的 `SpeciesPath.parse`，**没有另写路径语法**；桌面的放置 `SpeciesPlacement`（只抽出 `center(union:)/transform(union:)` 两个重载，卡通动物走同一条路径、行为不变）、姿态 `SpeciesPose`（只多一个 `rigPhase`）、`JellyView` 绘制管线与设置/回执链路；水族馆核心 `aquarium-core.js` 的游动、转弯、翻面、拉尾与互动。
- **新增**（自有代码承担的职责）：
  - `js/marine-rig.js`：压平（每段贝塞尔取 8 点）、脊柱行波弯曲、部件拍动（转动 + 沿展向相位滞后 + 可选 y 向压扁）、可选的拉尾；表驱动的快路径（脊柱 160 段、部件 64 段）与保留的精确参考公式；输出取整到 1e-4（远离零一侧进位，与 Swift `.rounded()` 一致）。
  - `js/marine-rig-data.js`：四种动物的写实数据（路径由小工具按“站位”生成；斑点、盾片用固定种子的 mulberry32，每次加载一致）。
  - `js/marine-rig-canvas.js`：把 ops 画到 Canvas 的薄画笔（`drawOps(ctx, ops, {alpha, tint})`）。
  - `js/aquarium-real.js`：水族馆里决定“这一帧用什么姿态、多清楚、多淡”（相位倍率、景深雾、夜光、`source-over`）。
  - `desktop-reminder/gen-marine.mjs`（生成器）→ 入库的生成物 `marine-rig-data.swift`；`marine-rig.swift`（解析、求值、几何、体长与频率表）；`marine-rig-painter.swift`（CoreGraphics 画笔）；`marine-rig-parity.swift`（对拍用）；`marine-align.mjs`（像素对齐检查）。

## 求值模型

坐标：身体轴沿 x，吻端 +x，y 向下；体长 100 单位，由宿主缩放。`pose = { phase, amp, turn, lod, pull? }`（相位弧度、幅度 0…1、转弯 −1…1、细节级别 0…2、拉尾位移）。求值器不碰 DOM、时钟与随机数。

1. **压平**：每个图层的路径压成多边形（C/Q 各 8 段），闭合子路径去掉重复末点；一个图层压平后最多 6000 点、一种动物最多 160 层。
2. **部件拍动**（鳍、翼、桨足）：先绕 `pivot` 把 y 缩放到 `1 − amp·squash·sin(…)`（俯视拍翼的透视收缩），再转 `amp·deg·sin(freq·phase + phase0 − lag·r/reach)`。`lag ∈ [0,3]` 让离 pivot 越远的点相位越晚——翼尖拖在后面，整片翼面是一道由根向尖传播的行波。镜像部件自动取反。
3. **脊柱弯曲**：横向位移 `amp·env(s)·span·sin(phase − 2π·waves·(1−s))`，`env` 从头端 `amp[0]` 到尾端 `amp[1]` 按 `pow` 次方增长（头几乎不动、尾幅最大）；点按脊柱切线旋转（解析导数，没有数值微分）；`turn` 另加一条二次曲线让身体弯成弧。`amp` 上限 0.2。
4. **拉尾**（只有水族馆用）：按头→尾五个站位的权重 `[0, 0, 0.12, 0.5, 1]` 叠加位移，量级夹在 ±60 单位；桌面端不传。
5. **输出**：每个图层一个 op（图层里所有子路径合成一条路径、一次填充或描边），`fill` 带纯色或线性渐变（端点随同一变形移动），`stroke` 带线宽、颜色与线帽。`lod` 大于当前级别的图层跳过（远处、省流量、小个体）。

表驱动的快路径把脊柱与每个部件各算一张小表后逐点查表插值（鲸鲨一帧近 4000 个点，精确公式每点要 `pow/sin/cos/sqrt`）。与精确公式的差在所有动物、随机姿态下 ≤ 2e-3 个单位（测试守住）；Node 里求值约 0.07–0.13 ms/帧。

## 四种动物的数据

| 动物 | 视角 | 图层 / 压平点数 | 并集（体长 100） | 桌面体长 | 桌面频率 | 水族馆相位倍率 `FREQ` |
|---|---|---|---|---|---|---|
| 小锤头鲨 `hammer` | 侧视（略俯拍，锤头是竖着的横杆） | 26 / 2469 | 113.5 × 68 | 70 pt | 0.75 Hz | 0.7 |
| 蝠鲼 `manta` | 俯视，**从下往上看**（白色腹面、鳃裂、头鳍、口），翼拍动带 `squash 0.12` | 28 / 1787 | 100.6 × 107.6 | 74 pt | 0.5 Hz | 0.55 |
| 海龟 `turtle` | 俯视，**背面**（盾片、四只桨足、头上鳞片）；前鳍对称同步划，后鳍相位滞后 1.3 rad | 34 / 2108 | 97.4 × 131.1 | 64 pt | 0.4 Hz | 0.5 |
| 鲸鲨 `whaleshark` | 侧视，背上 60 个白斑、纵棱、浅色细线、鳃裂 | 27 / 3829 | 107.9 × 52.6 | 84 pt | 0.4 Hz | 0.42 |

- 桌面并集（点）：锤头鲨 79.5×47.6、蝠鲼 74.5×79.6、海龟 62.3×83.9、鲸鲨 90.7×44，都装得进窗口里动物上方 91 pt 的空间（自测核对）。
- **写实版与卡通版的视角不一定相同**：海龟卡通版是侧视，写实版是俯视背面（龟壳盾片与四只桨足只有俯视才能画对）；蝠鲼两者都是俯视，写实版是腹面。切换样式时桌面上的海龟会换视角。
- 水族馆里 `FREQ` 是核心 `phase` 的倍率（核心的相位为小鱼快速摆尾定的，大型动物真实节奏慢得多）；桌面用 `rigFrequency`（Hz）。**两处是各自调的、同一量级，不是同一个数**——运动模型没有对齐。数值是美术取值，没有量化依据；`test/aquarium-real.test.js` 钉死了 `FREQ` 的取值与大小次序，改动须同步本表。
- 水族馆的体长（px，视口缩放 1）：锤头鲨 56、蝠鲼 96、海龟 70、鲸鲨 130（海龟是本次加入水族馆的第 9 种动物，`aquarium-core.js` 的 `SPECIES` 多一项）。

## 水族馆接线

- `js/aquarium.js` 的 `drawFish`：`useReal = !!Real && !realBroken && Real.has(species) && (view.real === true || !shape)`。**写实画法抛过异常后，整个页面生命周期都不再用它**（模块级 `realBroken`，只给一条警告）；有卡通形状的退回卡通，海龟没有卡通形状则不画，**居民列表、存储与鱼层都不受影响**（`test/aquarium-real.test.js` 守住）。`state()` 多 `realDrawn`（上一帧写实画出的条数）与 `realFailed`，只作验收诊断，业务路径不读。
- `Real.draw` 的参数各按来源传：长度（含被网兜捞起时的缩小）、翻面、饲料、远近（`z < 0.55` 或省流量）、夜晚、背景强度、省流量、速度参照（`该种巡航速度 × 视口缩放`）、拉尾、光晕色（该种主色）、鱼自己的淡入淡出——`test/aquarium-real.test.js` 用替身逐项核对。
- 宿主画布平时在 `screen` 下合成（只会变亮），写实动物有深色，所以 `draw` 里用 `source-over` 并在 `finally` 里还原画布状态。
- `js/background-experience.js` 新增 `aquariumRealistic`（默认 `true`，只有明确 `false` 才关），随 `aquarium.frame` 传入 `realistic`。设置页脚本 `settings-page.js` 与 `settings.html` 有对应开关（`set-bgAquariumRealistic`）。

## 桌面接线

- 数据管线：`js/marine-rig-data.js` → `desktop-reminder/gen-marine.mjs`（`--check` 比对入库生成物，退出码 1 不一致、2 数据不合规；`--data=`/`--out=` 供测试）→ `marine-rig-data.swift`（**入库，不要手改**）→ `marine-rig.swift` 解析（复用 `SpeciesPath.parse`；解析失败的物种“没有写实骨架”，退回卡通，不崩溃）。生成物里 Swift 只需要压平与求值，不再实现路径镜像与校验。
- `JellyView.drawRealAnimal` 与卡通的 `drawAnimal` 是两条独立路径：**卡通动物与水母的像素基线逐字节不变**（默认水母 4 张基线图与改前一致；`species-render` 677/677）。写实动物的位置规则与卡通完全相同（并集居中、顶端离窗口底边 91 pt、先转俯仰再翻朝向）。
- `SpeciesPose.rigPhase`：游动时按 `rigFrequency` 匀速推进，停下后随包络落回、不再推进（停下后零动画帧）；“减少动态效果”时静止。
- **`realistic` 的默认语义两端不同，是有意的**：Swift 的 `JellyAppearance.realistic` 默认 `false`、只有负载里明确的布尔 `true` 才开（非布尔、`1`、字符串、数组一律按卡通）；Chrome 的 `jelly-appearance.js` 默认 `true`。含义：新的 Chrome 对新组件默认写实；任何不明负载或旧路径都不会让原生“猜”成写实。
- 回执与诊断：`appearance:{status:'ok', species, realistic}`（`realistic` 只有真的画出写实版才是 `true`）；`ping` 只读诊断 `jellyRealistic`、`jellyRig`（业务路径不读）。`JellyDesktop.appearanceStyle()` 返回 `{style:'jelly'|'realistic'|'cartoon'|'unknown', species, realistic}`（后两项记下这次确认针对的设置），后台 `jelly_appearance_*` 的回复带 `style`；设置页 `confirmedStyle(reply)` **只在确认针对的物种与写实开关与当前保存的设置一致时才采信**，否则按“还没确认”，所以设置刚改完、组件还没回执时，旧确认不会被说成新设置的结果。状态文字：`外观已应用到桌面：{动物}（写实）。` / `（卡通）。` / 旧组件“还没有写实版…请更新桌面组件后重载扩展”。
- 构建清单：`desktop-reminder/build.mjs` 加入 `marine-rig`、`marine-rig-data`（在 `jelly-paint` 之前）与 `marine-rig-painter`（在 `jelly-companion` 之前）；`test/desktop-companion-logic.test.mjs` 的编译清单同步；`species-render.mjs` 直接读 `build.mjs` 的清单，不需要另改。
- 设置页：`#set-jellyStyle` 下拉；示意图在写实时画写实版（`realisticPreviewSvg`，复用 `marine-rig` 求值，`data-style` 标明 `realistic`/`cartoon`），画不出来时退回卡通示意并如实说明。

## 对齐

`desktop-reminder/marine-align.mjs`：把同一姿态、同一缩放、同一放置分别交给原生 `JellyView.draw`（经 `species-render` 离屏渲染，CoreGraphics）与真实 Chromium Canvas（Playwright，`js/marine-rig-canvas.js`），逐像素比较。**期望值不抄任何一边的画笔**：放置变换按 `SpeciesPlacement` 的规格在检查脚本里独立写一份。判据是统计量（两边不是同一个光栅器）：轮廓交并比 ≥ 0.985、并集像素每通道平均绝对差 ≤ 3.0、“明显不同”（通道差 > 48）的像素占比 ≤ 0.5%；另有**对照**（故意错位的姿态，交并比必须至少低 0.015，否则检查分辨不出画错），`test/marine-align-check.test.mjs` 守住判据与对照本身。

- 已对齐：静态姿态下的几何、颜色（渐变方向、描边线宽与线帽、填充规则）、缩放与放置、阶段色混入。
- **没有对齐**：运动模型（水族馆是 `phase × FREQ` 加核心的游动与转弯，桌面是 `rigFrequency` 与桌面自己的游动系数）、景深雾、夜光光晕（水族馆有，桌面是原有的夜晚荧光）、阶段色（桌面独有）、背景与合成（桌面半透明叠在壁纸上，水族馆在深海色调与海水层上）。所以“同一只动物”成立，“同一个画面”不成立。
- **终态实测**（本机 macOS 26.5、品牌版 Chromium、2026-10-19 在最后一次改代码之后重跑）：48 个对齐用例 + 20 个对照，68/68 通过；对齐用例的交并比 0.9921–0.9984、平均差 0.53–2.08、明显差异像素占比 0–0.17%（都落在边缘抗锯齿上，鲸鲨的斑点与尾鳍边缘最多）；对照（错位的姿态）都明显更差，说明这套判据分辨得出画错。
- 另有 JS 与 Swift 的**求值对拍**（`test/marine-rig-parity.test.mjs` + `marine-rig-parity.swift`）：四种动物 × 216 个姿态比较摘要，另有每种动物 5 个姿态逐点比较坐标与颜料、2 个精确公式姿态；容许一个取整步长（1.5e-4，两边三角函数若在末位差 1 ulp，个别坐标会落在另一侧进位）。它证明数据与公式一致，不证明像素一致，后者由对齐检查承担。

## 验证（分层，只写实测到的）

- **Chrome 侧单元**（Node）：新增 8 个测试文件共 133 项——`marine-rig`（22）、`marine-rig-data`（15）、`marine-rig-gen`（6）、`marine-rig-parity`（2）、`marine-align-check`（11）、`aquarium-real`（24）、`aquarium-water-core`（24）、`aquarium-water`（29）——另改了既有的水族馆/设置/桌面外观测试（版本钉子、状态文字、回执字段）。全量 `node --test`：2952 项，2872 通过，80 失败；失败全在 `assistant-*`、`local-ai-*`、`local-ai-compute-sandbox`、`youtube-home` 这些依赖 `local-ai/node_modules` 或 `integrations/youtube-home` 依赖的文件里，工作树里没安装依赖；失败集合在改动前后完全一致。临时把主工作区的依赖符号链接进来重跑这 47 个文件（跑完立即移除，git 状态里没有残留）：431 项里 400 项通过，即 80 项失败里有 49 项只是缺依赖；剩 31 项（代码计算沙箱的子进程与 `youtube-home`，后者的 `youtubei.js` 在 `integrations/youtube-home` 自己的依赖目录里）在符号链接下仍起不来，需要真正的安装才能判断，**在工作树里这 31 项没有验证**；它们都不在本次改动触及的代码里，并入主工作区（依赖已安装）后与其余测试一起通过，见“并入实验分支”一节。
- **原生**（隔离 QA 构建，独立 Bundle ID，不碰真实组件）：Swift 纯逻辑自测全部通过（含四种动物的骨架编译、体长与频率表、放置、`realistic` 解析的各种非法输入）；JS↔Swift 求值对拍通过；`species-render` 677/677（卡通与水母的像素基线没有被写实改动影响）；`appearance-smoke` 含写实场景；`jelly-smoke --no-mouse`、`bridge-smoke --no-mouse` 通过；`marine-align` 见上。
- **真实 Chrome 156（品牌版、无头、隔离临时配置，扩展目录是本工作树，扩展 ID 与真实安装不同）**：水族馆回归 30/30；与隔离 QA 原生进程的端到端 38/38（协议 v10、每种动物的写实回执、卡通回执、水母、进程生命周期、海水层运行、开关即时生效、设置页示意图）。
- **变异检查**（只改 `/tmp` 副本并核对仓库哈希）：水族馆写实接入与 `aquarium-real.js` 46 个，杀死 43（首轮 33，补测试后 43；存活 3 个均为等价：`Real.has` 检查冗余——数据不可用时 `Real.draw` 本来就返回 `false`、幅度下限 0.4 永远用不到（幅度至少 0.5）、缩放用固定 100（四种骨架的体长恰好都是 100，由数据测试守住））；桌面写实/卡通“如实说明”的 Chrome 侧链路 28 个，杀死 27（存活 1 个等价：确认风格的白名单——任何非 `realistic`/`cartoon` 的值在 `describe` 里都与 `unknown` 同样处理）；海水层帧率监护 29 个，杀死 26（见海水层文档）；**骨架求值器 `js/marine-rig.js` 本体 60 个**（压平的贝塞尔权重与去重点容差、各项数据校验上限、脊柱包络/行波方向/斜率符号/转弯项/法线系数、部件转角/滞后/压扁（精确公式与站位表两份）、镜像部件与渐变端点、拉尾权重与夹取、取整对称性、lod 边界、站位表缩放与夹取、并集采样、图层与描边不透明度）：首轮杀死 54，存活 6，其中 2 个只被 JS↔Swift 对拍而不是 JS 单元杀死；据此补了 8 处单元测试（不对称 C/Q 曲线逐点对 de Casteljau、近起点末点保留、纯色与描边不透明度、单轴拉力、没有压扁的部件走同一条站位表比较、远离躯干的点与精确公式比较、默认并集采样数与密采样的缺口）后，**58 个被不依赖 Swift 的 JS 单元杀死**；剩下 2 个存活均为等价：快路径里 `q > flap.n` 的夹取（部件的作用半径取自它自己的顶点，距离最多等于半径，夹取只吸收浮点误差，去掉它的偏差在 1e-16 量级）、`pose.turn !== 0` 的判断（转弯为 0 时本来就加 0）。

## 并入实验分支（2026-10-19）

用户选择“提交后合并到主工作区”。实验分支 `experiment/touch-feel-20261014` 的 HEAD 仍是本分支的基线 `4f17cc6`，所以结果是本分支唯一的一个提交落在它上面、分支引用快进；难点是主工作区当时有另一条线尚未提交的改动（“水母下一批实用能力”：21 个已修改文件、4 个未跟踪文件），与本批重叠 11 个文件（`AGENTS.md`、`docs/technical/_index.md`、`desktop-reminder/{companion-selftest,jelly-companion,jelly-controller,main}.swift`、`js/background.js`、`js/settings-page.js`、`settings.html`、`test/desktop-companion-logic.test.mjs`、`test/jelly-errands-integration.test.js`）。

做法（以后遇到“主工作区脏、且与分支重叠”照此办，不要 stash、也不要 reset）：

1. 先把未提交的改动逐文件备份到 `/tmp`（文件副本、SHA-256 清单、补丁），不动它们。
2. 脏工作区里 `git merge` 会拒绝，所以对 11 个重叠文件逐个 `git merge-file`（基线取 `4f17cc6`，一边是主工作区现状、另一边是本批），其余本批文件直接复制；只有 `docs/technical/_index.md` 表头下两边都加了新行，保留双方，其余文件文本上自动合并、没有冲突标记。
3. 用“行多重集”核对重叠文件：用户一侧新增的每一行和本批新增的每一行都还在，没有被吞或重复。
4. 在合并后的工作区上跑验证（见下）；提交后用 `git update-ref`（带旧值的比较并交换）移动实验分支引用，再 `git reset -q`（mixed，只同步索引，不碰工作区）。用户的未提交改动因此仍是未提交状态，非重叠文件的哈希与备份清单逐个一致。

合并后验证（分层；原生部分在 `/tmp` 的副本里编译与运行，**没有在主工作区构建**，以免 Swift 缓存落进扩展目录）：

- **全量 `node --test`**（主工作区，依赖已安装，含用户未提交的改动）：3291 项全部通过。并入前同一工作区的基线是 3127 项、3126 通过，唯一失败是 `test/background-provider-swr.test.js` 在机器高负载下卡住 270 秒被终止（该文件单独运行 13/13 通过、约 0.25 秒，与本批无关）。工作树里因缺依赖而失败的 80 项（见上）也在这里一并通过。
- **原生（隔离 QA 构建，独立 Bundle ID）**：合并后的 Swift 源码编译通过；离屏渲染检查 `species-render` 677/677（卡通动物与水母的像素基线与“画与不画”差分检查没有被写实改动或用户那条线影响）；`marine-align` 68/68；`appearance-smoke` 42 个场景全部通过（含 6 个写实场景与 4 个开着动态效果的写实响铃场景）。
- **`jelly-smoke --no-mouse` 与 `bridge-smoke --no-mouse`**：**一次连续跑不保证全过**，这是对机器负载与鼠标位置敏感的场景造成的，不是并入引入的。经过：第一次连续跑在阶段 A 的“出发前被打断”处等不到出发而超时；第二次连续跑里阶段 P、E（差事 21 个场景）通过，阶段 A 在“巡游 × 物种：海龟”的“窗口横向游动 ≥ 60 点”处不达标，随后的 `bridge-smoke` 在“响铃后游回原位”超时（它第一次还因我漏传 `--extension-id` 直接报错，那是命令行错误，不算）。当时机器负载约 25（16 核；Cursor 另一个窗口 `ai-research` 里一个 `rg --files --follow` 已跑了 5 小时 42 分、占约 9–10 个核），用户在使用鼠标（系统空闲秒数一直在 0–10 之间；两次失败信息里原生端读到的指针位置分别在两块屏幕上，屏幕数 2）。**判断是否由并入造成**：对失败场景在“合并后构建”与“只有用户未提交改动、没有本批改动的基线构建”上交替重跑——“出发前被打断”合并后 3/3 通过、基线 2/3 通过（失败信息与上面相同）；“海龟巡游”合并后与基线各 4/4 通过。随后按组重跑（每组失败才重试，实际每组第 1 次就通过）：非 A/E 的全部阶段一次通过；阶段 A 的 23 组（覆盖全部 42 个场景）全部通过；`bridge-smoke` 完整一次通过（结束时用户已空闲 33 秒）。**这是分组或重跑后的结果，不是一次连续全过**；要一次全过需要安静的机器与不动的鼠标。
- 没有做的：真实 Chrome 配置与真实桌面组件上的并入后验证（需用户重载扩展、重装组件）；带真实鼠标的冒烟；对并入后的代码重做变异检查（变异检查是在合并前的本分支上做的）。

## 已知限制与未验收

- **美术观感需要用户亲眼确认**：形状、配色、斑点密度、鳍摆幅、`FREQ` 与桌面频率都是我按公开资料的比例与目测调的，没有量化的“像不像”判据。
- 运动模型两端各自调（见上），不是同一个数；桌面端的真实游动节奏（3–8 分钟的巡游等）与写实动物的搭配只在隔离环境里看过。
- 未验收：用户自己的 Chrome 配置（需用户重载扩展）；重装后的真实桌面组件（`node desktop-reminder/build.mjs --extension-id=<id> --install`，否则桌面上仍是旧组件，设置页会如实提示）；真实 GPU 上的长期占用与电量；带真实鼠标的冒烟；多显示器、全屏 Space、Stage Manager、VoiceOver；触屏；真实账号与真实壁纸叠加观感。
- 没有做变异检查的部分：`marine-align.mjs` 自身的比较逻辑（只有 `marine-align-check.test.mjs` 的判据与对照用例）、`appearance-smoke.mjs` 新增的写实场景、`marine-rig-painter.swift`/`aquarium-real.js` 之外的画笔层（`marine-rig-canvas.js`、CoreGraphics 画笔，靠对齐检查与像素比较把守）。
- 帧耗时：求值在 Node 里约 0.07–0.13 ms/帧；Canvas/CoreGraphics 真实绘制耗时在无头 Chromium 里没有可作结论的测量（软件光栅），真机 CPU 占用待用户确认。没有做缓存。
- 回滚：设置页把“写实动物”关掉（首页）或“动物样式”选“卡通”（桌面）即回到卡通；代码层面把 `aquariumRealistic` 默认值改为 `false`、`jelly-appearance.js` 的 `DEFAULTS.realistic` 改为 `false` 即可，数据与存储不需要迁移。

## 复现与维护

- 改了 `js/marine-rig-data.js` 或 `js/marine-rig.js` 的展开结果后，运行 `node desktop-reminder/gen-marine.mjs` 重新生成 `desktop-reminder/marine-rig-data.swift`；`node desktop-reminder/gen-marine.mjs --check` 与 `test/marine-rig-gen.test.mjs` 会在不一致时失败。
- 改了画笔、放置或阶段色混入，重跑 `node desktop-reminder/marine-align.mjs`（需要 macOS 的 `xcrun swiftc`、`playwright-core` 与 Chromium，环境变量 `PLAYWRIGHT_CORE_DIR` 指向含 `playwright-core` 的 `node_modules`；不连网、不碰真实 Chrome 配置）。
- 版本钉子：`index.html` 的 `aquarium.css?v=4`、`aquarium-core.js?v=4`、`jelly-species-shapes.js?v=4`、`marine-rig.js?v=1`、`marine-rig-canvas.js?v=1`、`marine-rig-data.js?v=1`、`aquarium-real.js?v=1`、`aquarium.js?v=4`、`background-experience.js?v=14`；`settings.html` 的 `settings-page.js?v=16`、`marine-rig.js?v=1`、`marine-rig-data.js?v=1`、`settings-jelly-appearance.js?v=5`。首页脚本顺序（`index.html`）：`jelly-species-shapes.js` → `marine-rig.js` → `marine-rig-canvas.js` → `marine-rig-data.js` → `aquarium-real.js` → `aquarium.js`（`marine-rig` 依赖 `jelly-species-shapes`，必须在它之后）。
- 安全自查：新增代码不联网、不读写存储与任务数据（除原有的 `aquariumV1` 与外观设置键）、不使用 `eval`/`innerHTML` 处理外部数据；原生新增文件只解析随包生成的静态数据；负载里的 `realistic` 严格按布尔解析；无新增权限、依赖或网络。
