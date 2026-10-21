---
title: "水族馆视觉与“真实感”技术方向调研：Blender、2D/生成艺术（p5.js·PixiJS·OGL）、3D/空间体验（Babylon.js·Spline·Spark）、奇妙视觉效果（TypeGPU·Shader·流体·粒子·声音·Hydra·TouchDesigner）与 19 条已核对元数据的技术录像"
type: research
status: completed
version: "1.1"
created: "2026-10-20"
updated: "2026-10-20"
author: "AI 助手"
tags: [水族馆, 真实感, Blender, p5.js, PixiJS, OGL, Babylon.js, Spline, Gaussian-Splatting, Spark, TypeGPU, WebGPU, shader, 流体, 粒子, WebAudio, Hydra, TouchDesigner, CSP, 技术录像, 调研]
related:
  - docs/research/research-aquarium-physical-realism-libs-20261020.md
  - docs/technical/aquarium-yaw-20261020.md
  - docs/technical/aquarium-shore-20261020.md
  - docs/technical/aquarium-water-20261019.md
  - docs/technical/aquarium-ambient-20261020.md
changelog:
  - date: "2026-10-20"
    desc: "v1.1：补记 X 九帖（fxtwitter）与逐帧观察、Aurelia（MIT）手法笔记、Digital Life 许可更正为 CC BY-NC 4.0；你拍板后网页端落地见 technical aquarium-ambient-20261020.md（本文仍是调研，实现另文）"
  - date: "2026-10-20"
    desc: "初始创建：用户在上一轮汇报后列出四个调研方向（Blender；2D/生成艺术 p5.js·PixiJS·OGL；3D/空间体验 Babylon.js·Spline·Gaussian Splatting/Spark；奇妙视觉效果 TypeGPU·Shader·流体·粒子·声音交互·Hydra·TouchDesigner）并要求收集技术录像、X 改用其他能力。本文：10 个库（含 three.js 基线）逐一做最小打包；真实 Chrome 156（品牌版、无头、隔离配置）里分别用默认 MV3 CSP 与加 wasm-unsafe-eval 的两套临时扩展逐库初始化并读回结果（两套各跑完整一轮）；CPU 稳定流体加海洋雪的耗时（三次运行）与草图；19 条 YouTube 录像用 yt-dlp 核对标题/频道/日期/时长/章节；GitHub 元数据经 gh 只读取得；X 没有读到任何帖子，原因与替代路径如实记录。调研本身没有改任何业务实现，没有给仓库加依赖，没有放宽 CSP"
---

# 水族馆视觉与“真实感”技术方向调研

日期：2026-10-20。**只调研**：没有改业务代码，没有给仓库加依赖，没有放宽 CSP。所有实验都在 `/tmp/aq-lib2`（不入库、重启后会丢，关键数字都抄进了本文）。

## 0. 结论先行

1. **四个方向里，能“原样放进扩展”的几乎没有，能“借创意、自己写”的不少。** 10 个库（含 three.js 基线）在真实 Chrome 156 的默认 MV3 CSP 下分三档（§2.2）：
   - 干净：three.js、OGL、Babylon.js（最小入口）、tsParticles（只测了引擎的初始化与创建容器）。
   - 能用但要打补丁或有副作用：PixiJS（普通引入直接抛错，必须改用 `pixi.js/unsafe-eval`）、p5.js（2 次字符串求值被拦，中文环境还会去请求 jsdelivr）、TypeGPU（2 次字符串求值被拦但初始化成功，且需要 WebGPU）。
   - 不行或不可采用：Hydra（`EvalError`，且是 AGPL）、Spark（默认 CSP 下 0/20000 个像素被画出，加 `'wasm-unsafe-eval'` 后 3734 个，另一轮 3708 个）、Spline（无许可证、6 个 WASM、包内有多处外部服务地址；场景加载没测到）。
2. **“怎样更真实”最值钱的是数据，不是引擎。** 当前 `PROFILES`（剖面表）是美术取值、没有外部真值（上一轮调研已承认）。Blender 方向的真正价值是**离线量形体**：Digital Life（UMass）有大锤头鲨（个体估计体长 329 cm，激光摄影测量）、鲸鲨、南露脊鲸（按体长 5% 间隔量高与宽，与我们的剖面表同一思路）和多种海龟的重建模型——**不是 CC0，只对非营利的科研、教育与艺术用途开放，入口在 Sketchfab**，我没有登录、没有下载，是否使用需要你决定（§3.3）。
3. **便宜、零依赖、不动 CSP 就能做的“奇妙效果”有四个**（§6，都只借创意、自己写）：① 鱼尾水流与染色轨迹（CPU 稳定流体，96×54 网格 + 1500 粒子，三次运行平均每步约 0.46–0.51 ms，只量了计算）；② 海洋雪/浮游粒子；③ 光束（现有水层着色器里没有）与按通道吸收的深度着色（现有 `hazeOf` 只是单一混合比例）；④ 水下环境音（Web Audio 合成，不需要麦克风权限）。
4. **WebAssembly 与 WebGPU 都是“要你拍板”的事**：Spark 靠 WASM（默认 CSP 下画不出东西），必须在 manifest 里加 `'wasm-unsafe-eval'`（Chrome 允许，但属于降低防线的改动）；WebGPU 在本机无头 Chrome 156 可用，但 web3dsurvey 的平台数字显示覆盖面不一（macOS 89.95%、Windows 88.29%、Linux 17.29%，§2.3），用就必须保留 WebGL 回退。
5. **技术录像**：19 条已用 `yt-dlp` 核对元数据（§7），覆盖 Blender 几何节点鱼群、水下场景、风格化水；群集（boids）；粒子流体；Sea of Thieves 水渲染；Babylon 9.0；3DGS；shader 入门；TypeGPU；Hydra；TouchDesigner 粒子。**我没有看视频本身**，“讲了什么”只以章节标题或简介为准。
6. **X**：没有读到任何帖子（§1.2）。本文的取证全部来自 npm、GitHub、官方文档、YouTube 元数据与本机实测。

## 1. 取证方式与边界

### 1.1 三种证据层级（后文每条结论都标）

| 层级 | 含义 | 本文里的例子 |
|---|---|---|
| **跑过** | 在本机真实 Chrome 156（品牌版 156.0.8078.36，无头，隔离临时配置，macOS，Apple M3 Max）里实际执行并读到结果 | 各库初始化与 CSP 事件、Spark 的 A/B、WebGPU 适配器、WebAudio 状态、流体耗时 |
| **读过** | 读了 npm 元数据、包内文件、官方文档/博客/README 的页面文字 | 许可证、版本、体积、Blender 5.2 发布说明、Chrome CSP 文档、TouchDesigner 许可表 |
| **没核对** | 只在搜索结果里见过标题或一句话，或根本没打开原文 | 视频里讲的具体内容、各 demo 的真实效果 |

### 1.2 X（Twitter）怎么处理的

用户要求“X 需要通过其他能力处理，或者使用外部浏览器，Cursor 内置浏览器无法登录”。做了三件事，**结果是没有读到任何 X 帖子**：

- 站内搜索（`site:x.com …`）：搜索引擎没有结果。
- Playwright MCP 外部浏览器：返回 `Browser is already in use for …/mcp-chrome-6abbb3e`（被另一个会话占用）。**我没有强行关闭**，以免打断那边的工作；X 的搜索与时间线本来就要登录，我不会绕过登录。
- fxtwitter 镜像（只读公开单条帖子/账号资料的第三方接口）：个别账号资料能查到（`babylonjs`、`splinetool`），多数请求超时，`typegpu` 返回 `User is suspended`（这是镜像的返回，我没有核实账号真实状态）；**它没有时间线与搜索**，拿不到“某人最近发的 demo”。

替代：技术录像与 demo 改走 YouTube（元数据）、GitHub、官方文档与博客。**如果你有具体推文链接，贴给我，我逐条经镜像去读（可能超时）**；或者你登录后在外部浏览器里把想看的帖子导出给我。

### 1.3 实验室做法（`/tmp/aq-lib2`，不入库）

- `npm install --save-exact --ignore-scripts --no-audit`（**禁用安装脚本**）固定版本：p5 2.3.4、pixi.js 8.22.0、ogl 1.0.11、@babylonjs/core 9.31.0、three 0.186.1、@sparkjsdev/spark 2.4.0、typegpu 0.12.8、hydra-synth 1.4.0、@tsparticles/engine 4.4.0、@splinetool/runtime 2.0.95、esbuild 0.25.12；共 85 个包、328 MB。
- 每个库写一个**最小初始化入口**，用 esbuild 打包（`bundle`、`minify`、`format: iife`、`target: chrome120`、`platform: browser`，并定义 `process.env.NODE_ENV="production"`）。只测“能初始化并读到结果”，不是完整功能，体积是这个入口的下限。
- 两个临时 MV3 扩展：`ext-default`（没有 `content_security_policy` 键，与本扩展现状一致）与 `ext-wasm`（`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`）。驱动方式：Playwright 的 `launchPersistentContext` 启动品牌版 Chrome（无头，`/tmp` 下一次性临时配置，结束即删），经 CDP `Extensions.loadUnpacked` 加载临时扩展，逐库打开扩展页，监听 `securitypolicyviolation`；所有**非扩展来源的请求都被拦截并记录**（防止实验联网拉 CDN）。不碰你自己的 Chrome 配置。
- GitHub 的许可证、星数、更新时间用 `gh` 命令只读取得（2026-10-20 读取）。

## 2. 实测：10 个候选库在扩展页里的表现

### 2.1 许可、体积与环境（跑过 + 读过）

| 库 | 版本 | 许可 | 本入口打包 原始 / gzip | 安装目录（npm `unpackedSize`） | 备注 |
|---|---|---|---|---|---|
| three（基线） | 0.186.1 | MIT | 529 KB / 132 KB | 20.4 MB | WebGLRenderer + 一个方块 |
| OGL | 1.0.11 | Unlicense（npm 字段；GitHub 页面没识别出许可证文件） | **45 KB / 13 KB** | 0.4 MB | 薄 WebGL 封装 |
| PixiJS | 8.22.0 | MIT | 529 KB / 153 KB（加 `pixi.js/unsafe-eval` 后 542 KB / 155 KB） | 76.3 MB | 入口只含 Application + Graphics |
| p5.js | 2.3.4 | **LGPL-2.1** | 1.61 MB / 421 KB | 17.4 MB | 整库引入；包内有 `strands` 与 `webgpu` 目录 |
| Babylon.js | 9.31.0 | Apache-2.0 | 1.52 MB / 351 KB | 71.8 MB | 深层引用（引擎+场景+相机+灯+球+标准材质）；包内带 6 个 `.wasm`（`twgsl`、`glslang`、`Draco` ×3、`Basis`） |
| Spark + three | 2.4.0 | MIT | 3.23 MB / 1.08 MB | 17.2 MB（另需 three） | 对等依赖 `three >= 0.180.0` |
| TypeGPU | 0.12.8 | MIT | 293 KB / 84 KB | 1.4 MB | 需要 WebGPU；版本号尚未到 1.0 |
| Hydra（hydra-synth） | 1.4.0 | **AGPL**（npm 字段；GitHub 识别为 AGPL-3.0） | 188 KB / 60 KB | 1.8 MB | 依赖 regl、meyda、raf-loop |
| tsParticles（仅引擎） | 4.4.0 | MIT | 64 KB / 21 KB | 1.1 MB | 没加载形状/运动插件 |
| Spline runtime | 2.0.95 | **未声明**（npm `license` 字段为空，包内没有 LICENSE 文件） | 4.06 MB / 1.09 MB | 36.2 MB | 6 个 `.wasm`（bevel、boolean、hana-ui、navmesh、physics、process）；场景必须是 `.splinecode` |

对照：本项目自写的 `js/aquarium-yaw.js` 约 27 KB / gzip 9 KB（上一轮调研数）。

### 2.2 默认 MV3 CSP 与加 `'wasm-unsafe-eval'` 的结果（跑过）

| 库 | 默认 CSP | 加 `'wasm-unsafe-eval'` | 说明 |
|---|---|---|---|
| three | ✅ 0 违规；读回实心色 `[102,204,255,255]` | 同左 | |
| OGL | ✅ 0 违规；WebGL2（ANGLE Metal / Apple M3 Max）；读回实心色 | 同左 | |
| PixiJS（普通引入） | ❌ 抛错：`Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support.`（栈在 `_unsafeEvalCheck`） | ❌ 同样 | 不是 WASM 的问题，是 `new Function` |
| PixiJS（先引入 `pixi.js/unsafe-eval`） | ✅ 0 违规；WebGL 渲染器；读回实心色 | 同左 | 官方提供的补丁模块，本入口 +13 KB |
| p5.js | ⚠️ 2D 画布创建成功、读回 `[120,200,255,255]`；WEBGL 模式创建了 WebGL2 画布（**没有读像素**）；两种都有 **2 次 `eval` 被拦**（不致命），并**尝试请求** `https://cdn.jsdelivr.net/npm/p5@2.3/translations/zh/translation.json`（被我的拦截器中止，p5 照常运行；本机界面语言是中文） | 同左 | 另跑一次关闭友好错误系统（`disableFriendlyErrors`），**同样出现这 2 次 `eval` 与同一个 jsdelivr 请求**；源码 `dist/core/internationalization.js` 里 `loadPath` 写死 `https://cdn.jsdelivr.net/npm/p5@…`；包内有 `translations/` 目录，改成本地路径的做法我没有验证 |
| Babylon | ✅ 0 违规；WebGL2；受光球读回 `[51,51,77,255]`（有光照，不是实心色） | 同左 | 6 个 `.wasm` 在最小用法里没被触发；压缩网格/纹理会走 Draco/Basis（**没测**） |
| tsParticles | ✅ 0 违规；引擎初始化成功、容器创建成功 | 同左 | 形状/运动插件没加载，真实粒子效果没测 |
| TypeGPU | ⚠️ `tgpu.init()` 成功（`navigator.gpu` 可用，适配器 `apple / metal-3`），2 次 `eval` 被拦（不致命） | 同左 | 本机有 WebGPU 不代表用户机器有（§2.3） |
| Spark | ❌ 初始化成功、400 个泼溅已装入，但 **0/20000 个像素被画出**；1 次 `wasm-eval` 违规事件，3 个 `WebAssembly.compile()` 未处理拒绝 | ✅ **3734/20000 个像素被画出**（另一轮 3708），0 违规 | 同一份代码、同一批 400 个程序化泼溅，只改 CSP 就从“空白”变“有画面”；泼溅位置每轮随机，所以像素数略有差异，两轮都远大于 0 |
| Hydra | ❌ `EvalError`，栈顶是 `Function` ← `compile` | ❌ 同样（`unsafe-eval` 在 MV3 扩展页不允许） | 源码核对：regl 1.7.0（MIT，hydra-synth 的依赖）`dist/regl.js:5897` 是 `Function.apply(null, linkedNames.concat(src))`（动态生成代码）；Hydra 自己的 `lib/sandbox.js` 另用 `globalThis.eval` 执行用户代码——两条路都被禁止 |
| Spline | ⚠️ `new Application(canvas)` 构造成功，0 违规；`load()` 一个不存在的本地场景 → `Failed to fetch`（控制台 `ERR_FILE_NOT_FOUND`） | 同左 | **没有真实 `.splinecode`，场景加载后的 WASM/CSP 行为没测到** |

补充实测（`gpu` 探针页）：默认 CSP 下 `WebAssembly.compile` → `CompileError`（违反 CSP），`new Function` → `EvalError`，**`blob:` Worker 能创建**；加 `'wasm-unsafe-eval'` 后 `WebAssembly.compile` 成功，`new Function` 仍是 `EvalError`；两种下 `navigator.gpu` 都存在、适配器 `apple / metal-3`、WebGL2 都存在。所以**阻碍 Spark/Spline 的是 WASM，不是 Worker**。

### 2.3 WebGPU / WebGL 的覆盖面（读过）

web3dsurvey 页面（2026-10-20 读取，我没有核对其统计口径）：WebGPU 按平台——Android 74.45%、ChromeOS 91.39%、iOS 86.12%、Linux 17.29%、macOS 89.95%、Windows 88.29%；Chrome/Chromium 浏览器 84.91%。WebGL 总体 98.06%（Chrome 98.35%、macOS 97.17%、Windows 99.04%、Linux 88.74%、Android 99.43%）。**含义：想用 WebGPU 就必须同时写 WebGL 回退**；本机能用不能推出用户机器能用。

### 2.4 静态扫描（对各自打好的包，计数而非是否执行）

| 包 | `new Function(` | `Function.apply(` | `globalThis.eval(` | WASM 编译/实例化引用 | `new Worker(` | 包内外部地址（字符串） |
|---|---|---|---|---|---|---|
| three / OGL / tsParticles | 0 | 0 | 0 | 0 | 0 | — |
| Pixi 普通 / 加补丁 | 4 / 5 | 0 | 0 | 0 | 0 | — |
| p5 | 3 | 0 | 0 | 1 | 0 | `cdn.jsdelivr.net/npm/p5@…` |
| Babylon（最小入口） | 0 | 0 | 0 | 0 | 2 | `cdn.babylonjs.com`（含 `babylon.ktx2Decoder.js`）、`assets.babylonjs.com/core`、`unpkg.com/fflate@0.8.2`；最小入口运行时没有发出请求 |
| Spark | 0 | 0 | 0 | 13 | 2 | — |
| TypeGPU | 2 | 0 | 0 | 0 | 0 | — |
| Hydra | 0 | 1 | 2 | 0 | 0 | — |
| Spline | 8 | 0 | 0 | 31 | 3 | `cdn.spline.design/@splinetool/runtime@2.0.95/build/`、`unpkg.com/@splinetool/runtime@2.0.95/build`、`www.gstatic.com/draco/versioned/decoders/1.5.2/`、`fonts.gstatic.com`（Roboto）、`apis.spline.design/file/…`、`hooks.spline.design/events?hashFile=`、`relayserver.spline.design/session?uuidfile=`、`api.openai.com/v1/realtime/calls?model=gpt-realtime` |

“WASM 编译/实例化引用”统计 `WebAssembly.compile / instantiate / instantiateStreaming` 出现的次数。**“出现”不等于“执行”**（Pixi 加补丁后字符串仍在，但运行时 0 违规；Spline 的外部地址只是字符串，我没有验证它们何时被触发）。这张表用来判断风险，不用来判断结果。

## 3. 方向一：Blender（几何节点、程序化建模、动画、模拟、风格化渲染、插件、制作拆解）

**本机没有安装 Blender，下面全部是“读过”，没有“跑过”**。结论：Blender 是**离线创作与量形体的工具，不进扩展**（本项目运行时不会依赖它）。

### 3.1 许可（读过，[blender.org/about/license](https://www.blender.org/about/license/)、[FAQ](https://www.blender.org/support/faq/)）

- 软件本体 GPL（源码 v2+，二进制发布按 v3+），Cycles 是 Apache-2.0。
- **“你用 Blender 创作的内容归你”**（图像、影片、`.blend` 及其写出的数据文件），可自由用于任何用途；对我们意味着：用 Blender 渲染或量出的数据，本身没有许可证牵连。
- **公开发布的、调用 `bpy` 的 Python 脚本须按 GPL 发布**；官方 Extensions 平台要求插件 GPL-3.0-or-later、随附资源 CC0。**我们不写也不发布 Blender 插件**，所以这条不影响本项目；使用别人的插件只是在本机用。

### 3.2 版本与能力（读过，[5.2 LTS 发布页](https://www.blender.org/download/releases/5-2/)与[发布说明](https://developer.blender.org/docs/release_notes/5.2/)）

Blender 5.2 LTS 于 2026-07-14 发布，维护到 2028-07。与水族馆有关的几项：几何节点新增 **Sample Sound Frequencies 节点与 Sound 接口**（用声音驱动动画）、**Mesh Bevel 节点**、**Get/Set Geometry Bundle 节点**（Bundle 概念自 5.0 引入）；**实验性的节点式物理**（布料与毛发，内置 XPBD Solver 节点）；EEVEE 的实例密集场景提速 2 倍、抖动减少色带、取消每材质 8 个属性的上限，屏幕追踪新增 Backface 选项；Grease Pencil 新增 Delaunay 填充算法。这些是“离线做素材与模拟”的能力，**没有一项能直接变成运行时代码**。

### 3.3 与本项目相关的四种用法（按价值排序）

1. **量形体，给 `PROFILES` 找外部真值（价值最高，需你决定）**：Digital Life（UMass，[3D 模型页](http://digitallife3d.org/3d-model)；模型入口 [sketchfab.com/DigitalLife3D/models](https://sketchfab.com/DigitalLife3D/models)）的重建模型，页面文字（读过）：
   - **73A 大锤头鲨**：成年雌性，个体 “Nemesis”，估计体长 329 cm（“基于激光摄影测量”），用环绕潜水的多机位视频重建；
   - **55A 南露脊鲸**：用 Blender 重建，数据来自无人机视频，**按体长 5% 的间隔量高度与宽度、以椭球为基底**——与我们 `PROFILES` 的剖面表同一思路；
   - **99A 鲸鲨**：亚成体雄性（个体 TZ 209），由 GoPro 视频重建；
   - 另有多个海龟模型（如 47A 红海龟，直线甲长 86 cm；46A 亚成体绿海龟；72B 幼年绿海龟）；
   - 页面对部分“由照片与既有数据重建”的模型明确写着“不声称完美反映真实个体”（我没有逐个对应是哪几个），所以**它们是“有依据的参照”，不是“真值”**。
   - **许可不是 CC0**：页面写明“一般政策是对非营利的科研、教育与艺术用途开放，含下载”，商业用途须联系其主任、并通常要求合作方同意。**我没有登录 Sketchfab，也没有下载任何模型。**
   - 作法（若你同意）：你下载 GLB → 我在 Node 里解析顶点，沿体轴切 21 个截面量宽与高，与现有表对比；**只把量出的数字（事实性的尺寸）写进代码，不入库网格**。数字是否构成“衍生”由你判断，我倾向只把模型当测量参照。
   - 我没有核对其他模型库（如 CC0 资源站）的许可与解剖准确性。
2. **用 Blender 做独立“裁判”**：把 `aquarium-yaw.js` 用的椭圆剖面放样导出成网格，在 Blender 里按相同转角渲染轮廓，与我们的投影对比。上一轮用 three.js 做过同类检查（IoU 0.980/0.973），Blender 能换一个独立渲染器，**但仍是“同一份剖面数据”，只能证明实现与模型一致，不能证明像真鱼**。
3. **序列帧与顶点动画烘焙**：
   - [Sprite Sheet Generator](https://extensions.blender.org/add-ons/sprite-sheet-generator/)（Extensions 页面：版本 2.2.3，要求 Blender 4.2 LTS+，GPL-3.0-or-later，权限仅文件读写）：把 3D 动画渲成精灵图，描述为“带骨架旋转”。
   - [Vertex Animation Toolkit（VAT）](https://extensions.blender.org/add-ons/vat/)（页面描述：把网格动画烘焙成文件，由实时引擎在顶点着色器里重放；两种编码——顶点动画纹理 `positions.exr/.png + normals.png + .glb`，或给 WebGPU 的 `.bin + .json + .glb`；“Tested with three.js”；页面自称无自动化测试、无 CI，要求 Blender 4.2+）。
   - [OpenVAT](https://github.com/sharpen3d/openvat)（GPL-3.0，288★，2026-10-02 仍有提交）：仓库描述为“Blender 原生的顶点动画纹理编码，附主流 DCC 的解码方法与示例”。
   - **代价**：每种动物 × 转角 × 颜色变体都要预渲染或烘焙，位图换色得重烘，与现在运行时按昼夜/饱食程度给鱼染色（`hazeOf`）的做法冲突；VAT 路线需要能读顶点纹理的 3D 管线（three.js 或自写 WebGL）。**当前不建议**。
4. **几何节点做批量与程序化**：[100,000+ 鱼群视频](https://www.youtube.com/watch?v=bpyilKAY2fM)（用节点逐个实现群游公式）；[程序化鱼游动](https://www.youtube.com/watch?v=lvHLQGUo-y4)（噪声纹理、旋转节点）。**我们已经有自己的群游与身体波**，这部分只有学习价值。

### 3.4 风格化渲染与制作拆解（读过）

- [Singularity](https://studio.blender.org/projects/singularity/)（Blender Studio 的开放电影项目页）：太空题材的水彩风格短片，其中有受深海生物启发的生物群；用 Brushstroke Tools、几何节点做生物群；**素材以 CC-BY 提供，有每周制作日志**。适合学“风格化 + 程序化群体”的流程，**与本项目的矢量画法没有直接代码关系**。
- 相关视频：[水下场景（焦散、体积深度、上帝光、气泡）](https://www.youtube.com/watch?v=l5QcxrTDJ90)、[卡通水（EEVEE）](https://www.youtube.com/watch?v=zSbm14lLE58)、[5.2 全功能五分钟](https://www.youtube.com/watch?v=QVAzlqIGKnY)。

## 4. 方向二：2D / 生成艺术（p5.js、PixiJS、OGL）

| | 能给水族馆什么 | 代价与风险 | 判断 |
|---|---|---|---|
| **p5.js 2.3.4**（LGPL-2.1） | 原型最快（官方 Web Editor 里写、直接看）；官方[群集示例](https://p5js.org/examples/Classes-And-Objects-Flocking/)（页面说明“Simulate bird flocking behavior.”）；包内有 `strands` 与 `webgpu` 目录（读过包结构，没运行） | 整库 1.61 MB；**LGPL 与打包进扩展的关系要小心**（非律师意见）；默认 CSP 下有被拦的 `eval`；**中文环境会请求 jsdelivr**（违背“不用 CDN”） | **只当原型/学习工具**（在 p5 官方 Web Editor 里做草图），**不引入扩展** |
| **PixiJS 8.22.0**（MIT） | 批处理 2D、滤镜；[`DisplacementFilter`](https://pixijs.download/dev/docs/filters.DisplacementFilter.html)（文档：位移图红通道管水平、绿通道管垂直）做水波折射很合适；官方 Fish Pond 教程（源码在 `pixijs/pixijs.com` 的 `src/tutorials/v8.0.0/fishPond/`，第 5 步是 Displacement Effect；我读了目录与第 5 步标题，没运行教程） | 普通引入在 MV3 扩展页直接抛错，必须用 `pixi.js/unsafe-eval`；npm 解包 76.3 MB；我们的水族馆是**画在共享背景画布上的 Canvas 2D**，换渲染器是架构级改动；桌面端用不上 | **不引入**；位移滤镜的创意可用现有水层着色器自己写 |
| **OGL 1.0.11**（Unlicense） | 45 KB 的薄 WebGL 封装，0 违规 | 本项目已有自己的 WebGL 封装（`js/aquarium-water.js` 292 行里 39 处 `gl.*(` 调用，`js/wallpaper-weave.js` 580 行里 61 处），OGL 省不了多少 | **不引入**（除非以后要加好几个新的 WebGL 层） |

## 5. 方向三：3D / 空间体验（Babylon.js、Spline、Gaussian Splatting / Spark）

| | 事实 | 与水族馆的契合 | 判断 |
|---|---|---|---|
| **Babylon.js 9.31.0**（Apache-2.0） | 9.0 于 2026-03-26 发布（[发布博客](https://aka.ms/babylon9Blog)，读过）：集群光照（WebGPU 与 WebGL2 都支持）、**体积光（光束穿过雾/尘；可配消光与相位参数；用 WebGPU 计算着色器，WebGL2 有回退）**、Frame Graph v1；**自带高斯泼溅**（7.0 引入，9.0 支持 `.ply/.splat/.spz/.sog` 等格式）；最小入口 1.52 MB / 351 KB，默认 CSP 下 0 违规（跑过） | 我们要的是“2D 矢量鱼 + 伪 3D 转身”，不需要场景图；真 3D 的代价与 three.js 同类但更重（解包 71.8 MB）；泼溅是否需要 WASM 我没测 | **不引入**；体积光（消光 + 相位）的创意可借 |
| **Spline runtime 2.0.95** | 场景只能在 Spline 编辑器里做、导出 `.splinecode`（导出地址由服务端生成）；运行时 4.06 MB JS + 6 个 WASM；官方文档给了自托管办法（构造参数 `wasmPath`，示例把导出文件放进 `public/`、`wasmPath="/"`）；渲染器可选 `webgl` / `webgpu`；**包里没有许可证、npm 的 `license` 字段为空**；包内静态字符串含 spline.design 的 API/事件钩子/中继地址与 `api.openai.com` 的 realtime 接口地址（§2.4，未验证何时触发） | 动物要在我们的物理/行为系统里游，Spline 的场景是“设计好的交互”，接不上 | **不可采用**：许可证不明 + WASM + 外部服务地址，任意一条都踩项目规则 |
| **Gaussian Splatting / Spark 2.4.0**（MIT） | 3DGS 是 SIGGRAPH 2023 的论文（作者团队的[演示视频](https://www.youtube.com/watch?v=T_kXY43VZnk)，5:04）；Spark 是 World Labs 的渲染器（[2.0 博客](https://www.worldlabs.ai/blog/spark-2.0)，2026-04-14：基于 three.js、面向 WebGL2；博客与文档页写到 LoD 树遍历是 Rust 编译成 WASM、在后台 Web Worker 里跑，排序用后台 Worker 里的两遍基数排序）；**本机实测：默认 CSP 下 3 次 `WebAssembly.compile()` 被拒、渲染 0 像素，加 `wasm-unsafe-eval` 后 3734（另一轮 3708）像素**——说明连最基本的渲染路径也依赖 WASM（具体是哪个模块我没有定位） | 泼溅擅长**静态的实景捕获**（比如真实珊瑚礁的 3D 背景），不擅长我们这种会游、会转、会被吃的动画对象；素材（`.spz/.ply`）本仓库没有，且要 WASM | **不引入**；若将来想要“真实珊瑚礁视差背景”再单独评估（需放宽 CSP） |

## 6. 方向四：奇妙视觉效果

### 6.1 TypeGPU / WebGPU

TypeGPU 0.12.8（MIT，版本号尚未到 1.0）是写 WebGPU 的 TypeScript 工具箱，能用 TS 写着色器、类型安全地管理缓冲布局（Software Mansion 的[短视频](https://www.youtube.com/watch?v=7-oXB9Rnt8o)简介：保留底层能力，同时让 TypeGPU 帮你避开调试陷阱）。**跑过**：扩展页里 `tgpu.init()` 成功（本机 WebGPU 可用），2 次 `eval` 被拦但不致命。**风险**：覆盖面见 §2.3，任何 WebGPU 功能都要有 WebGL/CPU 回退；我们要的粒子量（≤ 数千）用 CPU 足够（§6.3），没有必要。**不引入。**

### 6.2 Shader（学习资源与我们的缺口）

- **现有水层着色器**（`js/aquarium-water-shader.js`）：有 `fbm2` 噪声、`voronoiEdge`/`caustic()` 焦散、`rush()` 岸线冲刷；**搜 `god ray|fresnel|refract|volumetric|shaft` 没有命中**——**缺光束**。鱼的深度着色在 `js/aquarium-real.js` 的 `hazeOf(z, night, fed)`：`clamp((1 − z) × 0.5 + night × 0.22 − fed × 0.12, 0, 0.7)`，是**单一混合比例**（把鱼往水色里混），**没有按颜色通道不同衰减**。
- 可借的创意（只借思路，不借代码）：
  - [forbiddenlink/ocean-simulator](https://github.com/forbiddenlink/ocean-simulator)（MIT，**仅 1★、2026-10-20 仍在更新**，证据力度低）的 README 自述：**按通道的 Beer–Lambert 深度着色**（红最先被吸收、青色留得最久，作者称这是“让海看起来像海而不是泳池的最大一个线索”——这是作者的看法，不是我验证过的结论）、体积光束、域扭曲的 Voronoi 焦散、背深腹浅 + 菲涅尔边缘光、AgX 色调映射。
  - Babylon 9.0 的体积光（§5）：消光与相位两个参数给美术控制光束。
  - Blender 视频里的“上帝光”做法：[水下场景视频](https://www.youtube.com/watch?v=l5QcxrTDJ90)有“Implementing god rays”和“Fake god rays technique”两个章节（只看了章节标题）。
- 学习资源：[kishimisu 入门](https://www.youtube.com/watch?v=f4s1h2YETNY)（22:39，22 个章节）；Acerola 的[游戏怎么“假”水](https://www.youtube.com/watch?v=PH9q0HNBjT4)（简介的主题清单：叠加正弦波、顶点/片元着色器、法线、Lambert 漫反射、Blinn-Phong 高光，还有一条是“为什么 Gerstner 波不好”，即视频对它持批评态度）与[模拟整片海洋](https://www.youtube.com/watch?v=yPfagLeUa7k)（自动字幕摘录讨论叠加正弦波数量的上限与“波浪级联”）；Martin Renou 的[实时焦散文章](https://medium.com/@martinRenou/real-time-rendering-of-water-caustics-59cda1d74aa)（Medium 对 curl 返回 Cloudflare 拦截页，**我没读到正文**）及其 [threejs-caustics](https://github.com/martinRenou/threejs-caustics)（BSD-3-Clause，370★）、[threejs-water](https://github.com/martinRenou/threejs-water)（BSD-3-Clause，293★，对 Evan Wallace 的 WebGL Water 的 three.js 实现）。
- **Sea of Thieves 的水**：SIGGRAPH 2018 Talks 的《The Technical Art of Sea of Thieves》（Ang、Catling、Ciardi、Kozin，[ACM SIGGRAPH 历史档案页](https://history.siggraph.org/learning/the-technical-art-of-sea-of-thieves/)，读过摘要）：摘要写到“风格化并补充 FFT 水的外观”、不用昂贵光线步进的体积云、基于物理的绳索滑轮渲染，以及“把模拟数据烘焙成纹理”和“在 GPU 上用实时表面流体模拟来表现零散的水行为”。**摘要没有展开做法，所以“泡沫怎么散开”之类的细节我没有读到**。

### 6.3 流体（水流、鱼尾轨迹）——**零依赖可行，已有耗时与草图**

- 参照：Pavel Dobryakov 的 [WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)（GitHub 许可信息为 **MIT**，16.7k★）：GPU 上的 Navier–Stokes，速度/染料/压力多套帧缓冲。Sebastian Lague 的[流体视频](https://www.youtube.com/watch?v=rSKMYc1CQHE)讲的是粒子法（平滑粒子，SPH）。我们的规则是“只借创意、自己写”。
- **跑过**：我写了一个 CPU 版 Jos Stam 稳定流体（半拉格朗日平流 + Gauss–Seidel 投影），鱼在身后注入速度和染料，再让海洋雪粒子顺流飘。每步耗时（Node 25，**机器负载约 24，偏悲观**；同一脚本跑了三次，平均值范围如下，p95 来自其中两次）：

  | 网格 | 迭代 | 粒子 | 平均（三次范围） | p95（两次范围） |
  |---|---|---|---|---|
  | 64×36 | 10 | 800 | 0.153–0.161 ms | 0.196 ms |
  | 96×54 | 12 | 1500 | 0.456–0.509 ms | 0.458–0.536 ms |
  | 128×72 | 12 | 1500 | 0.816–0.832 ms | 0.825–1.074 ms |
  | 160×90 | 16 | 2000 | 1.609–1.660 ms | 1.688–2.142 ms |

  同一段代码在真实 Chrome 156 里 96×54 / 1500 粒子、420 步（含 JIT 预热）平均 0.509 ms/步（另一次 0.495）。**只量了计算，没算画到画布与上传的成本。** 60 fps 的帧预算是 16.7 ms，0.5 ms 约占 3%。
- 草图（三条“鱼”留下的染色涡流轨迹 + 1500 个海洋雪粒子）只在 `/tmp/aq-lib2/fluid-demo.png`，不入库；粗糙，网格分辨率肉眼可见，参数没调。
- **必须守住的约束**：用户第一条要求是“海浪不要遮住背景”。流体/粒子只能用小面积、半透明的画法，不得整屏铺色，也不得改变背景画布的合成关系。

### 6.4 粒子（气泡、海洋雪、浮游生物）

- 现有：互动时冒的气泡（`js/aquarium-play-core.js`，上限 24，低功耗 8）；**没有环境性的悬浮粒子**（读过）。
- [tsParticles 4.4.0](https://particles.js.org/docs/)（MIT）：引擎能初始化、能创建容器（跑过）；它的绘制方式、预设效果与实际开销我没有测。我们不需要整库：§6.3 的 CPU 流体加 1500 粒子每步约 0.5 ms，说明几千个环境粒子用自己的几十行代码就够。
- 要上万以上才值得 GPU：TU Wien 的学士论文（Benedikt Peter，2023-02，读过摘要）写在 GTX 1060 上用计算着色器模拟并渲染一千万粒子约 63 fps，且“顶点拉取”在约四百万以上才比实例化快。
- 海洋雪与气泡的 LOD 经验：[ricardoyang00/thalassa](https://github.com/ricardoyang00/thalassa)（three.js 的“沉没遗迹”场景，2★，**没有许可证**）README 的“未解决”一节写到气泡的 LOD 与剔除没做成（每个实例的顶点数固定，跳过粒子只省片元、不省顶点）。
- 群体与 LOD 的另一个来源：[The Coral Reef](https://kody-w.github.io/learnwithkody/examples/coral-reef/)（个人博客页，three.js + GLSL；自述：500 只鱼分 6 群，**3D 空间哈希（6 m 网格）让 boids 保持 O(N)**，“把镜头当作捕食者加进 boids 步骤，鱼群会在你游进去时散开，这是最能增加沉浸感的一步”）——**作者自述，我没有运行它**。我们已有捕食与逃避逻辑，“用户指针/拖拽当作捕食者”这类互动是否已覆盖，实现前需要对照现有代码。

### 6.5 声音交互

- Web Audio 能**纯合成**水下氛围（不需要音频文件，也**不需要麦克风权限**）。参考：[Lumen Tide](https://vibecruiser.com/v/paragontasx--lumen-tide)（页面描述：WebGL2 流体加生成式配乐、互相驱动，单个 HTML；GitHub 仓库 `paragontasx/lumen-tide`，0★，**没有许可证**）。
- **跑过**：无头 Chrome 156 的扩展页里，创建 `AudioContext`（噪声缓冲 → 低通 400 Hz → 增益 0.02，纯合成）**初始状态就是 `running`**，点击后仍是 `running`；**没验证有头的真实 Chrome 是否受自动播放策略约束**。
- 现有：`js/background-experience.js` 已有 `soundEnabled`（默认 `false`，只有一个振荡器的提示音）。**麦克风驱动的“声音响应”需要 `getUserMedia`（会弹授权），不建议**；与水族馆有关的可行形态是“按潮汐/捕食事件合成声音，默认关”。

### 6.6 Hydra、TouchDesigner

- **Hydra**（hydra-synth 1.4.0）：浏览器里实时编码视觉（模块化合成器式的反馈链）；**AGPL-3.0**（网络使用条款：把它并进你的作品并让用户通过网络使用，整个作品也要按 AGPL 提供源码；非律师意见）；**跑过：默认与 wasm CSP 下都初始化失败（`EvalError`）**，原因见 §2.2（regl 动态生成代码 + Hydra 自己的 `globalThis.eval`）。只能当**创意工具**用（[在线编辑器](https://hydra.ojack.xyz/)里玩、截图/录屏做素材）；录像：Olivia Jack 的[演讲](https://www.youtube.com/watch?v=cw7tPDrFIQg)与[长访谈](https://www.youtube.com/watch?v=7SW8dodzLhw)。
- **TouchDesigner**（Derivative，专有软件）：节点式实时视觉创作。许可（官网 [Licensing](https://docs.derivative.ca/Licensing) 页读过）：Non-Commercial 免费（个人/教育/评估用途，不得用于有偿项目，分辨率限制在 1280×1280）；Educational 300 美元；Commercial 600 美元；Pro 2200 美元；表里“实时导出 H.264/H.265 影片”写的是 “with Nvidia GPU”，并非 Non-Commercial 可用（**在 Apple 芯片上能否用，页面没写，我没验证**）。**不可内嵌进扩展**，只能离线做循环素材（焦散、墨水扩散）。教程：elekktronaut 的[音频响应粒子云（`particlesGPU`）](https://www.youtube.com/watch?v=olhePB-r7I4)。**不建议**（视频壁纸需求本仓库已有，而素材大且与矢量风格不统一）。

## 7. 技术录像（19 条，元数据由 `yt-dlp` 核对，未下载、未观看视频本身）

“覆盖”一列来自 YouTube **章节标题或简介开头**，不是我看视频后的概括；没有章节的写“无章节”。

| 方向 | 标题 | 频道 | 日期 | 时长 | 链接 | 覆盖 |
|---|---|---|---|---|---|---|
| Blender | How to Simulate a 100.000+ Fish Swarm in Blender! | MTR Animation | 2024-03-02 | 33:22 | [bpyilKAY2fM](https://www.youtube.com/watch?v=bpyilKAY2fM) | 17 章：设置点、逐个实现 4 个公式、速度属性、点变鱼、碰撞、孔洞、噪声 |
| Blender | Procedural Fish Animation in Blender 3.0 Geometrynodes! | Cartesian Caramel | 2022-02-02 | 9:58 | [lvHLQGUo-y4](https://www.youtube.com/watch?v=lvHLQGUo-y4) | 4 章：噪声纹理、Value 节点、Rotate Euler 节点 |
| Blender | how to make an underwater scene in blender | TopChannel1on1 | 2024-04-30 | 14:03 | [l5QcxrTDJ90](https://www.youtube.com/watch?v=l5QcxrTDJ90) | 9 章：海底、焦散设计、体积深度、上帝光、气泡与环境、假上帝光、合成 |
| Blender | Simple Toon Shaded Water in Blender [Eevee] | Blender Box | 2022-09-03 | 3:31 | [zSbm14lLE58](https://www.youtube.com/watch?v=zSbm14lLE58) | 5 章：水波纹、动画、透明与颜色、阴影 |
| Blender | Every Blender 5.2 Feature in FIVE MINUTES! | SouthernShotty | 2026-07-13 | 5:45 | [QVAzlqIGKnY](https://www.youtube.com/watch?v=QVAzlqIGKnY) | 7 章：概览、几何节点、动画、渲染、资产与合成、建模 |
| 2D/生成 | Coding Challenge 124: Flocking Simulation | The Coding Train | 2018-12-11 | 42:27 | [mhjuuHl6qHM](https://www.youtube.com/watch?v=mhjuuHl6qHM) | 8 章：什么是 boids、对齐、凝聚、分离；简介：基于 Craig Reynolds 的 boids 算法的 JavaScript 群集模拟 |
| 2D/生成 | Coding Adventure: Boids | Sebastian Lague | 2019-08-26 | 8:35 | [bqtqltqcQhw](https://www.youtube.com/watch?v=bqtqltqcQhw) | 7 章：三条规则、避障、优化、“Swimming with the fishies”；简介链接：项目源码（`SebLague/Boids`）、Boids 论文、鱼的顶点着色器示例（[`albertomelladoc/Fish-Animation`](https://github.com/albertomelladoc/Fish-Animation)，MIT，Unity 的顶点动画 shader 试验，2018 年后无更新，52★）与一篇[顶点着色器鱼游动文章](https://www.bitshiftprogrammer.com/2018/01/how-to-animate-fish-swimming-with.html) |
| 2D/生成 | Coding Adventure: Simulating Fluids | Sebastian Lague | 2023-10-08 | 47:52 | [rSKMYc1CQHE](https://www.youtube.com/watch?v=rSKMYc1CQHE) | 19 章：平滑粒子、密度、压力、空间网格、粘性、并行排序、三维 |
| 3D/空间 | Babylon.js 9.0 Release Video | Babylon js | 2026-03-26 | 3:28 | [Th9mD_D5DrQ](https://www.youtube.com/watch?v=Th9mD_D5DrQ) | 无章节；简介：9.0 发布，链到[发布博客](https://aka.ms/babylon9Blog) |
| 3D/空间 | 3D Gaussian Splatting for Real-Time Radiance Field Rendering | Inria/GraphDeco（GraphDeco Inria Research Group） | 2023-05-02 | 5:04 | [T_kXY43VZnk](https://www.youtube.com/watch?v=T_kXY43VZnk) | 10 章：3D 高斯表示、优化、实时渲染结果、对比、消融；简介首行：SIGGRAPH 2023（ACM Transactions on Graphics） |
| 视觉效果 | An introduction to Shader Art Coding | kishimisu | 2023-05-20 | 22:39 | [f4s1h2YETNY](https://www.youtube.com/watch?v=f4s1h2YETNY) | 22 章；简介：Shader 艺术编程入门 |
| 视觉效果 | I Tried Simulating The Entire Ocean | Acerola | 2023-08-31 | 27:18 | [yPfagLeUa7k](https://www.youtube.com/watch?v=yPfagLeUa7k) | 无章节；自动字幕摘录讨论叠加正弦波数量的上限与“波浪级联” |
| 视觉效果 | How Games Fake Water | Acerola | 2023-07-24 | 22:52 | [PH9q0HNBjT4](https://www.youtube.com/watch?v=PH9q0HNBjT4) | 无章节；简介主题清单：叠加正弦波、顶点/片元着色器、法线、Lambert 漫反射、Blinn-Phong 高光，以及“为什么 Gerstner 波不好” |
| 视觉效果 | The Technical Art of Sea of Thieves | iamarugin（**第三方上传**，讲者是 Ang 等四人；该上传标 CC BY） | 2023-03-23 | 41:11 | [y9BOz2dFZzs](https://www.youtube.com/watch?v=y9BOz2dFZzs) | 9 章：海洋渲染、甲板水、流动水效、云、光照天气、绳索、触手特效；简介首行指向 SIGGRAPH 历史档案页上的同名 Talk（§6.2） |
| 视觉效果 | Olivia Jack - Hydra, Live Coding Visuals in the Browser | Algorithmic Art Assembly | 2019-04-04 | 34:15 | [cw7tPDrFIQg](https://www.youtube.com/watch?v=cw7tPDrFIQg) | 8 章：模块化合成器隐喻、实时编码、视频反馈、社区 |
| 视觉效果 | Olivia Jack \|\| Live Coding Visuals with HYDRA | MPLab | 2021-05-06 | 1:29:35 | [7SW8dodzLhw](https://www.youtube.com/watch?v=7SW8dodzLhw) | 9 章：起源、现场演示、反馈技巧、协作空间、声音与混合界面 |
| 视觉效果 | Iwo Plaza – Write TypeGPU, Use Anywhere: Composable WebGPU Shaders for React Native and Beyond | Software Mansion | 2026-06-19 | 31:15 | [GOjrDiPANYU](https://www.youtube.com/watch?v=GOjrDiPANYU) | 无章节；标题即主题 |
| 视觉效果 | How Type-Safe GPU Primitives Save You Debugging Time? | Software Mansion | 2026-05-25 | 1:31 | [7-oXB9Rnt8o](https://www.youtube.com/watch?v=7-oXB9Rnt8o) | 无章节；简介：WebGPU 的底层能力与陷阱，TypeGPU 的做法 |
| 视觉效果 | Audioreactive Particle Cloud (new) – TouchDesigner Tutorial 65 | bileam tschepe (elekktronaut) | 2023-07-10 | 16:24 | [olhePB-r7I4](https://www.youtube.com/watch?v=olhePB-r7I4) | 10 章：`particlesGPU`、颜色、音频响应、相机序列器 |

## 8. 对本项目的建议（按“需不需要你批准”分档）

**A 档：零依赖、不改 CSP、只借创意自己写（仍需你点名做哪个，我不会自行动手）**

| # | 内容 | 依据 | 估计与约束 |
|---|---|---|---|
| A1 | 鱼尾水流 + 染色轨迹，并与捕食冲刺/拖拽联动 | CPU 稳定流体 ≈0.5 ms/步（跑过，只算计算）；草图（跑过） | 中；要接进共享背景画布与“低功耗”模式；**不得遮住壁纸**（§6.3） |
| A2 | 环境海洋雪/浮游粒子（≤ 2000，低功耗减量） | 同上 | 小；同样不得遮背景 |
| A3 | 光束（god rays）+ 把 `hazeOf` 改成按通道衰减 | 水层着色器没有光束、`hazeOf` 是单一比例（读过源码）；做法来自 ocean-simulator README 自述与 Babylon 9.0 的消光/相位思路（读过，证据力度见 §6.2） | 小到中；**要看真实截图调**，数值没有量化依据 |
| A4 | 水下环境音（Web Audio 合成，默认关，按潮汐/捕食事件） | 无头 Chrome 里 `AudioContext` 可用（跑过）；有头真实 Chrome 的自动播放策略没验证 | 小 |
| A5 | 用公开真实体型数据校准 `PROFILES`（文献数据，或 Digital Life 模型作测量参照） | 许可与取得方式见 §3.3；下载要登录 | 中，**要你先做决定** |

**B 档：需要你批准依赖或放宽策略**

- `'wasm-unsafe-eval'`（Chrome 允许）+ Spark：只有“真实珊瑚礁视差背景”这类静态实景才值，素材仓库里没有。**不建议。**
- PixiJS + `pixi.js/unsafe-eval`、TypeGPU/WebGPU 粒子、Babylon：都是引入新渲染架构或需要回退，**当前需求下不划算**。

**C 档：不建议**

- Hydra（AGPL + 动态求值）、Spline（无许可证 + WASM + 外部服务地址）、TouchDesigner（专有、不能内嵌）。

**离线工具（不进扩展）**：Blender（量形体、导出轮廓/序列帧做参照）、p5 Web Editor / Shadertoy（试着色器与草图）、TouchDesigner 非商业版（做循环素材，限制见 §6.6）。

**桌面端**：以上都是网页端能力；桌面 AppKit 画法不能用 JS 库。你已选“转身投影移植到桌面”**稍后**再说，A1–A4 也不涉及桌面。

## 9. 需要你拍板

1. A 档里先做哪几个？（建议顺序：A1 + A2 合成“水流与海洋雪”，再 A3 光束与按通道衰减。）
2. A5：是否同意我把 Digital Life 的模型**当测量参照**（你来登录下载，我只量尺寸、不入库网格）？还是改走论文/文献里的体型数据？
3. 是否愿意放宽 `'wasm-unsafe-eval'`？（我的建议：不。）
4. X：要不要给我具体推文链接？

## 10. 未核对与局限

- **没有安装 Blender**，§3 全部是读过的文档，没跑过任何 Blender 工作流；Digital Life 模型没有下载、没有量过；Sketchfab 的下载流程没有走过。
- 实验是**最小初始化**，不代表各库的完整功能在扩展里都能用（如 Babylon 的压缩网格、tsParticles 的真实预设、Spline 的整套场景、Spark 的真实场景文件、p5 WEBGL 模式的像素）。
- 实验环境：无头、隔离配置、macOS、Apple M3 Max（WebGPU/WebGL 表现不能推到用户机器）；机器负载约 24，**耗时数字偏悲观**；**流体耗时没算绘制与上传**。
- p5 与 TypeGPU 的 `eval` 来源没有逐行定位；p5 避免 CDN 请求的做法没验证；Spline 包内的外部地址只做了静态扫描。
- 视频只核对了元数据与章节；`y9BOz2dFZzs` 是第三方上传（讲者是 Ang 等四人，该上传标 CC BY），`7SW8dodzLhw` 来自 MPLab 频道；章节标题可能是上传者或平台生成，未核实；Acerola 两条的“覆盖”来自简介或自动字幕摘录，不是完整内容。
- 页面读取：Medium 对 curl 返回 Cloudflare 拦截页（403）；Babylon 9.0 博客的正文是用另一种取页工具取到的（§5 因此算“读过”），Martin Renou 的焦散文章没读到正文。Pixi 教程页面是客户端渲染，我只读了教程源码目录。
- 许可证：已读 LICENSE/包元数据或 GitHub 许可信息的有 p5（LGPL-2.1）、Pixi（MIT）、OGL（Unlicense，npm 字段）、Babylon（Apache-2.0）、three/Spark/TypeGPU/tsParticles/regl（MIT）、Hydra（AGPL）、PavelDoGreat 流体（MIT）、martinRenou 的 threejs-caustics 与 threejs-water（BSD-3-Clause）、ocean-simulator（MIT）、OpenVAT（GPL-3.0）、Fish-Animation（MIT）；**Spline 无许可信息**；thalassa 与 lumen-tide 仓库没有许可证；各 demo 一律按“只借创意不借代码”处理。
- `npm audit` 没有跑（这些包只在 `/tmp`，未入库）。
- 初稿里有若干凭记忆写的细节（部分数字与出处），已逐条核对改正或删除；本文所有数字与出处以最终内容为准。

## 11. 参考

Chrome MV3 CSP：[developer.chrome.com/docs/extensions/reference/manifest/content-security-policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)（默认 `script-src 'self'; object-src 'self'`，WASM 禁用；最低策略可加 `'wasm-unsafe-eval'`；`'unsafe-eval'` 在安装时报错）。Blender：[许可](https://www.blender.org/about/license/)、[5.2 LTS](https://www.blender.org/download/releases/5-2/)、[Singularity](https://studio.blender.org/projects/singularity/)。Digital Life：[3D 模型页](http://digitallife3d.org/3d-model)。Spark：[World Labs 2.0 博客](https://www.worldlabs.ai/blog/spark-2.0)。Babylon：[9.0 发布](https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428)。TypeGPU：[文档](https://docs.swmansion.com/TypeGPU/)。Sea of Thieves：[SIGGRAPH 历史档案页](https://history.siggraph.org/learning/the-technical-art-of-sea-of-thieves/)。TouchDesigner：[Licensing](https://docs.derivative.ca/Licensing)。

## 11. 补记（2026-10-20 晚，拍板后）

你选了 A 档四组原型、隔离探针允许 `'wasm-unsafe-eval'`、Digital Life 由助手开临时 Chrome 等你登录。实现见 `docs/technical/aquarium-ambient-20261020.md`。这里只补调研当时没写进正文的证据。

### 11.1 X 帖（fxtwitter 镜像，不经登录）

九个单帖 JSON 已取到（章鱼帖首次截断后重取）。视频用 ffmpeg 按时间点抽帧，未整部下栽（虎鲸/鲨鱼片源约 280 MB 级）。共同观感：**深度色吸收（深处更暗更蓝）、淡淡竖向光束、沙底焦散、偶尔的气泡团、闪烁的细屑（海洋雪）**。这些直接驱动了 A1–A3 的取舍（只借观感，不借代码）。

### 11.2 Aurelia（MIT）

公开仓库可核对：广告牌浮游生物径向衰减约 `(1−r)³`、闪烁、慢噪声漂移、相机包裹场；物体阴影体做“上帝之光”；噪声雾上亮下暗。水族馆实现是自写的低分辨率光带纹理 + 海洋雪粒子，**没有复制其源码**。

### 11.3 Digital Life 许可更正

正文初稿写“不是 CC0、仅限非营利……”——公开页核到的许可证是 **CC BY-NC 4.0**（须署名、非商业）。下载 API 无登录 401。本轮临时 Chrome 监视结束时仍未登录，**没有下载网格**；A5 未改 `PROFILES` 数值。

### 11.4 隔离 Spark / wasm 探针

主扩展 CSP **未改**。先前实验室：默认 CSP 下 Spark 画 0 像素，加 `'wasm-unsafe-eval'` 后约 3.7k 像素。是否并入主扩展仍待你另一次拍板。
