---
title: "水族馆“模仿真实世界”的 JS 库调研：three.js、2D/3D 物理引擎、转向行为库与零依赖伪 3D 投影的取舍"
type: research
status: completed
version: "1.0"
created: "2026-10-20"
updated: "2026-10-20"
author: "AI 助手"
tags: [水族馆, 真实感, 转身, 伪3D, three.js, 物理引擎, matter-js, planck, cannon-es, rapier, jolt, yuka, CSP, WebAssembly, 调研]
related:
  - docs/technical/aquarium-yaw-20261020.md
  - docs/technical/aquarium-predation-20261020.md
  - docs/technical/aquarium-shore-20261020.md
  - docs/research/research-aquarium-tide-size-drag-predation-20261019.md
  - docs/research/research-marine-realism-20261019.md
changelog:
  - date: "2026-10-20"
    desc: "初始创建：用户 2026-10-20 要求“模仿真实世界，看看哪些技术库能实现，调研多种 js 库”。核对 7 个库（three.js、matter-js、planck、cannon-es、Rapier、Jolt、Yuka）的版本、许可、体积与能力；真实 Chrome 156 实测扩展页 CSP 拒绝编译 WebAssembly；以 three.js 真 3D 模型做轮廓参照，量产品投影与旧压扁画法的重合度；结论：不引入任何新依赖，采用零依赖的伪 3D 投影"
---

# 水族馆“模仿真实世界”的 JS 库调研

日期：2026-10-20。只调研与取舍，**没有给仓库加任何依赖**；three.js 只放在 `/tmp/aq-lib` 里当“真值参照”用，不入库。

## 0. 结论先行

1. **你要的“真实”其实是三件不同的事**，库能覆盖的部分不一样（§2）：① 转身时身体的体积（侧视的大鱼转到正对你时应该是圆滚滚的，不是一张纸翻面）；② 水里的运动（阻力、惯性、尾拍）；③ 群体与追击行为。本轮你指出的“拖拽像纸片”“转身像纸片翻面”主要是 ①②。
2. **本轮调研的 7 个库里，没有一个直接提供“鱼在水里转身”的现成能力**：2D 物理引擎（matter-js、planck）没有第三维，没法表达转身时的体积；3D 物理引擎（cannon-es、Rapier、Jolt）是刚体碰撞，没有水中阻力与浮力 API（我对 matter-js、planck、cannon-es、Yuka 的源码检索 `buoyan`/`fluid`、对 three.js 的构建文件检索 `buoyan`，命中数都是 0；Rapier 与 Jolt 是 WebAssembly，只看了 JS 包装层与 npm 元数据，**没有逐项核对**）；Yuka 是转向行为库，只管“往哪走”，不管“身体什么样”；three.js 是 3D 渲染器，能画出真 3D，但代价大（§4）。
3. **WebAssembly 库在这个扩展里不能直接用**：我在真实 Chrome 156、本扩展当前的 manifest（没有 `content_security_policy` 键）下实测，扩展页里 `WebAssembly.compile` 被 CSP 拒绝（§3.2）。Rapier 与 Jolt 都是 WebAssembly，要用必须在 manifest 里放宽扩展页 CSP（加 `'wasm-unsafe-eval'`），这是权限级改动，**需要你批准，我没有做**。
4. **three.js 真 3D 的代价**：只取 17 个必需类、经 esbuild 打包压缩仍有 541,010 B（gzip 136,543 B），是我写的零依赖伪 3D 投影模块（26,979 B / gzip 9,316 B）的约 20 倍；而且要另起 WebGL 渲染循环，水族馆现在是画在共享背景画布上的 Canvas 2D 单一 RAF，桌面端（AppKit）又完全用不上它。
5. **所以这一轮没有引入任何依赖**：转身用我写的 `js/aquarium-yaw.js`（椭圆剖面近似的伪 3D 投影，纯几何、没有第三方代码），并用 three.js 真 3D 模型当参照检验它。结果：侧视大鱼转到正对时，投影与真 3D 轮廓的重合度（IoU）小锤头鲨 0.980、鲸鲨 0.973，旧的“压扁”画法只有 0.129 和 0.169（§5）。
6. **这个 IoU 的含义有限**：参照模型和投影用的是**同一份椭圆剖面数据**，所以它只证明“投影与椭圆剖面体这个模型一致”，**不证明鱼真的是这个形状**；形状是否像真鱼要靠剖面数据（来自美术骨架）和你的眼睛判断。
7. 如果你仍想要“完整的真 3D”（任意角度转身、俯仰、光照），唯一现实的路线是 three.js，但那是一次架构级改动，我把选项和代价写在 §6，**请你决定，我不会自行引入**。

## 1. 要回答的问题

用户 2026-10-20 的选择（AskQuestion `turn_look` 自由文本原话）：“需要模仿真实世界，使用看看哪些技术库能实现。调研多种 js 库。”

背景是同一轮反馈里的第 3 点——拖拽鱼像拖纸片、要有真实的鱼状态与游泳状态——以及我们自己试出来的一个现象：侧视的大鱼（小锤头鲨、鲸鲨）转身时原画法只把整只鱼沿屏幕横向压扁成 `|cos θ|`，转到正对观众时只剩一条细线，像翻面的纸片。

项目约束（`AGENTS.md`）：开源项目有可用能力时必须优先复用正式库；新增依赖要固定版本、提交锁文件、查许可证；扩展不得用 CDN 脚本；MV3 的 CSP 不允许 `eval`；用户明确不上架 Chrome Web Store。所以这份调研既要看“库能不能做”，也要看“能不能合规地放进扩展”。

## 2. 把“真实”拆成三件事

| 要什么 | 本质 | 需要的能力 | 本项目现有的做法 |
|---|---|---|---|
| ① 转身时的体积 | 几何投影：侧视的身体绕竖轴转，轮廓从“长条”变成“圆身体加两侧的鳍” | 3D 几何 + 投影（或真 3D 渲染） | `js/aquarium-yaw.js`（本轮新增，伪 3D 投影），骨架来自 `js/marine-rig*.js` |
| ② 水里的运动 | 阻力、惯性、尾拍推进、被抓着时被“牵着游” | 受力积分，不需要通用刚体碰撞 | `js/aquarium-core.js` 的游泳者模型（弹簧—阻尼、转向角速度上限、`stepHeld`） |
| ③ 群体与追击 | 群游、避让、追击、补员 | 转向行为（boids、pursuit） | `aquarium-core.js` 的群游与 `aquarium-predation-core.js` 的捕食状态机 |

后文每个库都按“它能帮上 ①②③ 的哪一件、代价是什么”来评价。

## 3. 实际量到的事实

### 3.1 版本、许可与体积（`npm view` 取元数据、本机下载文件实测）

| 库 | 版本 / 许可 / 最后发布 | 本机文件 原始 / gzip | 类别 |
|---|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | 0.186.1 / MIT / 2026-09-24 | 最小子集（17 个类，esbuild 0.25.10 `--bundle --minify`）541,010 B / 136,543 B | 3D 渲染 |
| [matter-js](https://github.com/liabru/matter-js) | 0.20.0 / MIT / 2024-06-23 | `matter.min.js` 83,476 B / 25,933 B | 2D 刚体物理 |
| [planck](https://github.com/piqnt/planck.js)（Box2D 的 JS 移植） | 1.5.1 / MIT / 2026-10-12 | `planck.min.js` 297,211 B / 55,249 B | 2D 刚体物理 |
| [cannon-es](https://github.com/pmndrs/cannon-es) | 0.20.0 / MIT / 2022-08-12 | `cannon-es.js`（未压缩 ESM）346,256 B / 75,245 B | 3D 刚体物理 |
| [Rapier](https://rapier.rs)（`@dimforge/rapier3d-compat`） | 0.21.0 / Apache-2.0 / 2026-09-25 | `rapier3d.mjs`（内嵌 WASM）4,340,292 B / 1,655,248 B | 3D 刚体物理（WebAssembly） |
| [Jolt](https://github.com/jrouwe/JoltPhysics.js)（`jolt-physics`） | 1.1.0 / MIT / 2026-07-11 | **没有下载**；npm 解包体积 46,371,750 B | 3D 刚体物理（WebAssembly） |
| [Yuka](https://github.com/Mugen87/yuka) | 0.7.8 / MIT / 2022-09-17 | `yuka.min.js` 123,214 B / 32,942 B | 游戏 AI：转向行为 |
| 本项目 `js/aquarium-yaw.js` | — | 26,979 B / 9,316 B | 伪 3D 投影（零依赖） |

说明：体积是我在 2026-10-20 实测的；three.js 的最小子集 541,010 B 是同一份入口重新打包的结果（早先另一个 esbuild 版本测得 540,901 B，相差 0.02%）。最小子集包含 `WebGLRenderer, Scene, PerspectiveCamera, Mesh, MeshStandardMaterial, BufferGeometry, BufferAttribute, Bone, Skeleton, SkinnedMesh, AmbientLight, DirectionalLight, Vector3, Matrix4, Quaternion, CanvasTexture, DoubleSide, Group`——也就是“画一条带骨骼的鱼”的最小集合，再少就画不出来了。

### 3.2 WebAssembly 在本扩展里被 CSP 拒绝（真实 Chrome 156 实测）

在真实 Chrome 156.0.8078.36（品牌版、无头、隔离临时配置，加载本仓库扩展 3.16.0；不碰你的配置）里，打开 `settings.html` 扩展页，对最小合法 WASM 模块（只有魔数与版本的 8 字节）调用 `WebAssembly.compile`：

```
manifest.content_security_policy = null（manifest 里没有这个键，用 MV3 默认策略）
WebAssembly.compile → CompileError: Compiling or instantiating WebAssembly module violates the following Content Security policy directive because neither 'wasm-eval' nor 'unsafe-eval' is an allowed source of script …
```

结论：Rapier 与 Jolt 这类 WASM 库在当前 manifest 下**直接被拒绝**。要用就得把扩展页的 `script-src` 加上 `'wasm-unsafe-eval'`——这放宽了扩展页的内容安全策略，和项目里“不在扩展页内 eval 或内嵌解释器”的立场相邻（`AGENTS.md` 的代码计算一条：QuickJS-WASM 是放在**本机 Node 子进程**里跑的，原因正是 MV3 CSP），所以我不会擅自改。

（附带：同一次探测里在 DevTools 中 `new Function('return 1')()` 返回正常，这是因为 DevTools 的 `Runtime.evaluate` 默认放行被 CSP 拦的 eval，**不能说明扩展页允许 eval**，我没有把它当结论。）

### 3.3 关键词检索：这些库有没有水中阻力 / 浮力 / 转向行为

只对我下载到本机的源码做关键词检索（命中行数，`rg -c`，不区分大小写）：

| 库 | `buoyan` | `fluid` | 全局阻尼（`frictionAir` / `linearDamping`） | 转向行为（Seek/Arrive/Flee/Pursuit/Evade/Wander/Alignment/Cohesion/Separation） |
|---|---|---|---|---|
| matter-js 0.20.0 | 0 | 0 | `frictionAir` 有 | 无 |
| planck 1.5.1 | 0 | 0 | `linearDamping`/`angularDamping` 有 | 无 |
| cannon-es 0.20.0 | 0 | 0 | `linearDamping`/`angularDamping` 有 | 无 |
| Yuka 0.7.8 | 0 | 0 | 无 | **有**（`SeekBehavior`、`ArriveBehavior`、`FleeBehavior`、`PursuitBehavior`、`EvadeBehavior`、`WanderBehavior`、`AlignmentBehavior`、`CohesionBehavior`、`SeparationBehavior`、`ObstacleAvoidanceBehavior` 等） |
| three.js 0.186.1（`three.module.js`、`three.core.js`） | 0 | — | — | 无 |

含义：物理引擎只有一个**全局**的速度衰减，没有“沿身体方向阻力小、横向阻力大”的各向异性水阻，也没有浮力。本项目自己的游泳者模型（`aquarium-core.js` 的 `stepHeld`）也**没有**做各向异性水阻：被抓着时是弹簧—阻尼把被抓的那一点拉向指针、朝向跟随指针运动且角速度有上限、摆尾频率随速度变化；松手（绳子松了）后只剩各向同性的水阻衰减（`exp(−2.5·dt)`）。要不要引入各向异性阻力是另一个问题，本轮没有做。Rapier 与 Jolt 的 WebAssembly 内部没有核对，**不能据此断言它们没有浮力功能**（Jolt 官方 C++ 库有没有、绑定有没有导出，我没查）。

### 3.4 Yuka 与现有核心的重叠，以及随机数

Yuka 的转向行为与本项目已有、已测试的核心行为大面积重叠（群游、追击、漫游）：

- 水族馆核心 `js/aquarium-core.js` **必须用注入的 `world.random`**，才能做种子化的黄金轨迹测试，并保证“关闭新功能时小物种轨迹与改动之前逐位一致”（`AGENTS.md` 与 `test/aquarium-core.test.js` 的约束）；而 Yuka 未压缩源码（`yuka.js`）里有 10 行直接用 `Math.random`，换进来就破坏这个测试基础。
- 捕食状态机（`aquarium-predation-core.js`）需要“水母结构性吃不到”“空缺登记与补员”“猎物不能被同时两条鲨鱼选中”等业务规则，Yuka 的 `PursuitBehavior` 不管这些；换成 Yuka 等于重写一套已经做过三轮变异检查的逻辑。
- 它没有任何关于“身体长什么样”的能力，帮不上 ①。

## 4. 逐库判断

| 库 | 能帮上哪件事 | 不采用 / 暂不采用的理由 |
|---|---|---|
| three.js | ① 真 3D 渲染，任意角度；骨骼动画 | 需要 541 KB 的最小子集和另一套 WebGL 渲染循环，水族馆是共享背景画布上的 Canvas 2D；桌面端 AppKit 无法共用，**两端要“对齐”的目标会破裂**；鱼身体要建 3D 网格、做蒙皮与光照，是新一套美术资产与测试；性能在高分屏、省电模式下需要重新评估。**不是不能做，是架构级改动，需要你批准** |
| matter-js / planck | ③ 的一小部分（碰撞）、② 的积分 | 都是 2D，没有第三维，表达不了转身；全局阻尼不能做各向异性水阻；本项目没有“物体互相碰撞”的需求 |
| cannon-es | ② 刚体积分、3D | 没有水中力；最后发布 2022 年；用它只为积分欠合算 |
| Rapier | 3D 刚体 | WebAssembly，当前 CSP 直接拒绝（§3.2）；体积 4.3 MB / gzip 1.66 MB；用途与 cannon-es 同样不对口 |
| Jolt | 3D 刚体 | 同上，WebAssembly；npm 解包 46 MB；用途不对口 |
| Yuka | ③ 转向行为 | 与现有核心重叠、内部用 `Math.random` 破坏确定性（§3.4）；管不了 ① |
| **自写 `aquarium-yaw.js`（采用）** | ① 侧视大鱼转身的体积 | 没有第三方代码；26,979 B；纯几何、可单测；桌面端的原生画法现在**没有**这套投影（见 §6） |

## 5. 用 three.js 当“真值”检验伪 3D 投影

方法（`/tmp/aq-lib` 里的临时页面，不入库）：把投影模块用的同一份剖面数据（`PROFILES` 的椭圆剖面站位、鳍片与锤头参数）在 three.js 里建成真 3D 模型，用正交相机在若干转角下取轮廓，与三种画法在同一像素网格里比 IoU：**旧压扁画法**（legacy）、**产品投影**（product）；参照是 three.js 真 3D 轮廓（ref）。2026-10-20 重跑的结果（1600×1200 视口，真实 Chrome，转角相对侧视）：

**小锤头鲨**

| 转角 | 0° | 20° | 40° | 60° | 75° | 90° |
|---|---|---|---|---|---|---|
| 旧压扁 / 参照 IoU | 0.928 | 0.829 | 0.747 | 0.732 | 0.653 | **0.129** |
| 产品投影 / 参照 IoU | 0.928 | 0.931 | 0.944 | 0.959 | 0.943 | **0.980** |
| 外接框（旧 / 产品 / 参照，宽×高） | 427×216 / 430×217 / 427×217 | 401×217 / 412×217 / 413×217 | 327×216 / 353×217 / 354×217 | 214×215 / 258×217 / 257×216 | 111×214 / 184×215 / 184×215 | 16×179 / 164×139 / 163×139 |

**鲸鲨**

| 转角 | 0° | 20° | 40° | 60° | 75° | 90° |
|---|---|---|---|---|---|---|
| 旧压扁 / 参照 IoU | 0.993 | 0.923 | 0.877 | 0.832 | 0.703 | **0.169** |
| 产品投影 / 参照 IoU | 0.993 | 0.993 | 0.991 | 0.989 | 0.985 | **0.973** |
| 外接框（旧 / 产品 / 参照，宽×高） | 423×153 / 423×153 / 423×155 | 397×154 / 402×154 / 403×154 | 324×154 / 337×153 / 340×154 | 211×153 / 237×153 / 239×154 | 109×152 / 147×153 / 147×153 | 17×140 / 147×112 / 146×113 |

解读与限制：

- 转到 90° 时，旧画法宽度只剩 16–17 个像素、IoU 仅 0.129 与 0.169（像一张纸）；产品投影宽度 147–164 个像素，与真 3D 的外接框相差 1 个像素以内，IoU 0.973–0.980。
- 0° 时小锤头鲨的 IoU 是 0.928 而不是 1：这是**参照模型（椭圆剖面、三角网格）与美术轮廓本身的差异**，旧画法与产品在 0° 一致（同一条路径），转身过程中产品不会在 0° 处出现跳变（有单测：`θ = 0` 时除躯干轮廓与藏在身后的远侧鳍之外所有图层与输入逐点一致）。
- 如前述，参照与投影共用同一份剖面数据，**这个检验只证明实现与模型一致**。
- 帧耗时（无头 Chrome；这台机器测量时负载很高，load average 约 21–26，主要来自一个不是我启动的 `rg` 进程）：弯曲姿态、转角 0.9 rad 下 `project` 1.2–2.7 ms（小锤头鲨 2.749 / 鲸鲨 1.213），Node 里同样的计算只要约 0.24–0.35 ms（2026-10-20 晚重测：小锤头鲨 0.240、鲸鲨 0.348，机器负载仍约 23，是偏高的上限量级）。`project` 只在**正在转身的侧视大鱼**（小锤头鲨、鲸鲨）上调用，核心里一次转身（起始速度 0 的实测：小锤头鲨约 3 秒、鲸鲨约 10 秒以上，见 `docs/technical/aquarium-tide-size-drag-20261019.md` §5.4；真实巡航更快）；测得的冷启动卡顿（第一次调用约 1–2 秒）出现在这台机器的无头 Chrome 里，在 Node 里同样代码第一次调用只要 3.8 ms（100 次之后稳定在约 0.3 ms），我把它归因于这台机器上 Chrome 的内存分配慢（2×10⁵ 个小对象分配 182 ms，Node 里 1.9 ms），**这是推断，没有证明；真实用户的 Chrome 里有没有首次转身的卡顿没有验证**。

## 6. 选项与我的建议

| 选项 | 内容 | 代价 | 建议 |
|---|---|---|---|
| A. 保持现状（已做） | 零依赖伪 3D 投影；水族馆侧视大鱼转身有体积；桌面端原生仍是旧压扁画法 | 桌面与扩展在**转身的那几秒**（起始速度 0 的实测：小锤头鲨约 3 秒、鲸鲨约 10 秒以上）不对齐（原生没有投影，仍是压扁画法） | **建议保持，先用你的眼睛确认观感** |
| B. 把同一投影移植到桌面原生（Swift） | 在 `desktop-reminder/jelly-species-painter.swift` 一侧重写同样的几何，不加依赖 | 工作量大；需要隔离构建与冒烟；桌面端目录里已有你未提交的改动（`jelly-companion.swift`、`jelly-controller.swift`、`main.swift` 等），改画法要特别小心冲突 | 看你对“转身时两端不一致”有多在意；做的话另立一轮 |
| C. 采用 three.js 做真 3D | 鱼改为 3D 网格 + 骨骼动画，任意转向、俯仰、光照 | 541 KB 最小子集、另一套渲染循环与美术资产、桌面端仍无法共享；依赖要固定版本并提交锁文件 | **不建议**，除非你想把整个水族馆升级成 3D 场景；这是产品方向的选择，不是修复 |
| D. 放宽 CSP 后使用 WASM 物理库 | `'wasm-unsafe-eval'` + Rapier/Jolt | 放宽扩展页 CSP；体积 1.7–46 MB 级；仍没有水阻与转身能力 | **不建议**，投入与对口程度不匹配 |

## 7. 取得方式、许可与借用边界

- 所有库只在 `/tmp/aq-lib` 里下载与打包（`npm view` 取元数据，`npm install three` 与单文件下载取体积），**没有写入仓库、没有锁文件变化、没有 CDN 引用**；`package.json`/`package-lock.json` 未动。
- 许可：three.js、matter-js、planck、cannon-es、Jolt、Yuka 为 MIT，Rapier 为 Apache-2.0（均取自 npm 元数据；**没有逐个读取仓库内 LICENSE 文件**，Yuka 的 `LICENSE` 开头核对过是 MIT）。
- 借用边界：只借“用 3D 参照检验 2D 投影”的方法，不借任何库的代码；`js/aquarium-yaw.js` 是自写代码，文件头注明了参照关系。
- 之前两份调研（`research-marine-realism-20261019.md`、`research-aquarium-tide-size-drag-predation-20261019.md`）里已有的结论不重复：Lottie/Rive、预渲染位图序列、glTF 模型等方案已在设计稿里被否决，本轮没有改变那些理由。

## 8. 未核对与限制

- 只检索了 5 个库的源码关键词；Rapier、Jolt 的内部能力没有核对；Jolt 没有下载。
- 没有试用任何物理库的实际手感（不满足 §3.2 的 CSP 前提，且对口度低，不值得为此改 manifest 做实验）。
- 没有在 X 上检索“鱼转身”类演示：X 关键词检索需要你在可见浏览器里登录，Cursor 内置浏览器的 X 登录弹窗一直转圈，本轮单条链接能读、关键词搜索不能。如果你想补，请在可见浏览器里登录后告诉我。
- 美术观感（转身时的体积是否像真鱼、锤头横杆的比例、鲸鲨头部的宽度）没有量化判据，**请你亲眼确认**。
- 真实用户 Chrome 里首次转身是否有冷启动卡顿、真实 GPU、高分屏与长期占用均未验收。
