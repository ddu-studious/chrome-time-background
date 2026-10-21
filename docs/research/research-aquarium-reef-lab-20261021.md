---
title: 浅海珊瑚礁隔离原型与四类技术案例补充
type: research
status: prototype
created: 2026-10-21
updated: 2026-10-21
---

# 浅海珊瑚礁隔离原型与四类技术案例补充

## 本轮范围与新的设计约束

用户明确：继续调研、允许 demo 测试，暂不接入正式功能；现在的背景展示必须优先保留，珊瑚礁等固定遮挡至少可开关。因此，上轮“完整海洋背景”的建议由本轮约束覆盖：**默认只展示原背景与可动居民，固定造景默认关闭**。

本轮只新增 `test/demos/reef-lab-20261021/`、研究记录与截图。没有改 `index.html`、`settings.html`、生产 JS/CSS、manifest 或全局技能；没有重载真实扩展、提交 Git 或发布。

## 实际体验入口

- [浅海原型](http://127.0.0.1:18765/)
- [18 组案例索引](http://127.0.0.1:18765/research.html)
- 本地源码：[原型目录](../../test/demos/reef-lab-20261021/README.md)

本地服务运行时可打开。首次进入有 5 个演示鱼条目、3 项演示任务，全部只在本页内存中；刷新即重置，不读取正式扩展的壁纸或真实任务。

操作：打开“显示珊瑚礁造景”后加载 3D 岩礁、珊瑚和海葵；造景区域可在屏幕底部 20%–42% 之间调节，默认 32%。关闭立刻隐藏固定造景，不保留整屏深海蒙色、背板或全屏折射。右下角“鱼”按钮继续提供原有居民列表、喂食、放入和捞出。带文字的任务水母可抓取，拖入原有纸篓后等待演示完成回执。

预设背景可在暮色海湾、晴空蓝、暖色晨光和透明检查格之间切换；这些是 demo 的示例画面。也提供本地 PNG / JPEG / WebP 选择，使用页面 Blob URL、不上传、不持久化。**自动化选择本地文件被 Chrome 连接器“文件 URL 访问”权限阻止，未改权限、此项未验收。**

“暂停观察”保留当前动物截图并停止宿主驱动，便于对照；这时鱼与水母不可拖动，需点“继续游动”。“体验方式与边界”中的拖拽引导只显示只读位置和落点，真实输入仍经过原有抓取、网兜与任务回执路径。

## 真实复用与技术边界

[Deskworlds](https://github.com/chaseleantj/deskworlds) 固定到 `335d6c1aeb59b338b1cc59d734dc6eb87a596a88`；20 个文件逐一比对 Git blob SHA-1，并记录额外 SHA-256。原文件未改，MIT 与 Three.js 许可随目录保留。

实际调用其公开导出的 `createTerrain`、`createCorals`、`createAnemone`、`createCaustics`、`createEnvironment` 和 `waterTime`。薄适配层负责透明画布、开关、大小和资源生命周期。没有复制它的完整 main 或另起 ReefSimulation。

为验证上游已知组合，使用该提交配套的 **Three.js r180**，没有擅自换成上轮调研中的最新 r186。上游材质使用 Three.js 正式 `onBeforeCompile`，但着色器块与版本相关；升级必须独立验证。打包复用仓库已有锁定的 **esbuild 0.28.1** 公共 build API。构建时只将 terrain 中三个资产基址重新绑定到保留的上游目录。

依赖清单在 [upstream-lock.json](../../test/demos/reef-lab-20261021/upstream-lock.json)，版权与适配说明在 [NOTICE.md](../../test/demos/reef-lab-20261021/NOTICE.md)。上游资源约 **17.47 MB**，生成的渲染模块 **566,893 bytes**；这是研究资产体积，不能当正式扩展包预算。固定造景未开启时不初始化其 WebGLRenderer、不请求造景图片和网格。已查 Three.js [维护者安全公告页](https://github.com/mrdoob/three.js/security/advisories)，页面当时未列已发布公告；这不代表完成漏洞扫描或证明没有漏洞。

现有 `BackgroundExperience` 仍是唯一动物/造景帧调度，适配层复用原 `AquariumWater.frame` 宿主合同，没有额外 RAF。造景最多每秒提交 24 帧，并限制绘制像素；这只是限制，不代表实际测到稳定 24 fps。隐藏页面时由原宿主暂停。诊断面板的 CPU 提交时间不含 GPU，不作为显卡性能结论。

**当前仍是 3D 造景 + 原有 2D 动物。** 没有统一 3D 深度、鱼礁碰撞、新动物网格、栖息地 AI 或流场双向耦合。鱼会被画在礁石前面；真实生态和遮挡是下一阶段需单独验证的内容。任务水母只使用演示任务完成替身，未覆盖真实任务保存、日志或账号验收。

## 已验证与未验证

| 层级 | 本轮证据 |
| --- | --- |
| 真实 Chrome（个人配置）的隔离 HTTP 页 | 默认造景关闭；打开后真实 WebGL 珊瑚与海葵可见，早期渲染阶段控制台错误/警告为空 |
| 喂食 | 造景开启时显示“落下了 6 粒饲料”；只确认投放，不宣称全部进食完成 |
| 小鱼拖拽 | 真实指针将小丑鱼拖进原网兜，条目从 5/12 降为 4/12，并显示“已捞出” |
| 任务水母 | 真实指针拖入纸篓，显示“已完成 1/3 项演示任务：发现珊瑚礁” |
| 背景开关 | 同一暂停画面开/关造景；1832×947 截图的未遮盖抽样区 `[421,75,1410,160]`，RGB 最大/平均差均为 0。只证明该抽样区，不外推所有像素或真实壁纸 |
| 背景预设 | 透明检查格与暮色海湾切换可见 |
| 既有回归 | `aquarium.test`、`aquarium-play.test`、`jellyfish.test`、`jellyfish-integration.test`、`aquarium-integration.test`：257/257 通过 |
| 上游与静态检查 | 20 个源文件哈希复核、demo 源码语法检查通过；本地文档链接与清单另核 |
| 服务边界 | 首页/案例页 200；`/.git/config`、`/local-ai/.local/token` 404；POST 405 |
| 未验收 | 真实扩展页、真实任务数据、本地图片自动化选择、触屏、长期 GPU / 电量 / 内存、WebGL 上下文恢复、所有外部案例的运行 |

截图：[交互回执](../../output/aquarium-review-20261021/reef-lab/interaction-proof.png)、[造景开启](../../output/aquarium-review-20261021/reef-lab/cover-on.png)、[造景关闭](../../output/aquarium-review-20261021/reef-lab/cover-off.png)。[背景差分数据](../../output/aquarium-review-20261021/reef-lab/background-comparison.json)、[服务检查](../../output/aquarium-review-20261021/reef-lab/server-checks.json)。

## 四类案例的取舍

下面的案例不是热度排名，也不都代表可直接集成的库。技术说明优先来自作者仓库、官方示例或作者原帖。X 的 Private Beach 原帖、V2 与访谈入口已在个人 Chrome 中核对。Reddit 部分短链接抓取失败后读到了完整标题链接；Spline 在线站未加载成功、TypeGPU 浏览器页未得到可确认的画面，均如实标注。

### Blender

- **[Infinigen / CoralFactory](https://github.com/princeton-vl/infinigen)**（[技术 / 演示](https://github.com/princeton-vl/infinigen/blob/main/docs/source/GeneratingIndividualAssets.md)）：程序化自然资产与珊瑚生成，可输出 .blend 并烘焙到外部格式。 适合离线生成不同礁石、珊瑚与地形，再做低模和贴图；不把 Blender 搬进扩展。 **证据：**官方 README 与资产生成文档已读；未安装运行。

- **[Private Beach / FLIP Fluids](https://x.com/Lark_movie/status/1495291857462603777)**（[技术 / 演示](https://github.com/rlguy/Blender-FLIP-Fluids)）：LARK 的桌上微缩海滩；作者原帖标明 Blender 与 FLIP Fluids，另有制作访谈。 参考浪涌、湿沙和微缩构图。FLIP 引擎与插件、付费示例采用不同许可，不能一概当 MIT 素材。 **证据：**X 作者原帖、V2 与访谈帖已读；FLIP 官方 README 已读。

### 2D / 生成艺术

- **[p5.js Flocking](https://p5js.org/examples/Classes-And-Objects-Flocking/)**：可交互的群集行为教学示例，基于 Reynolds 的 boids。 用于解释群游参数。项目已有鱼群核心，无需再引入一套；示例页面标 CC BY-NC-SA 4.0，与库本体许可不同。 **证据：**官方示例正文和代码已读；本轮未运行。

- **[PixiJS Fish Pond](https://pixijs.com/8.x/tutorials)**（[技术 / 演示](https://github.com/pixijs/pixijs.com)）：官方分步鱼塘教程；适合研究精灵、交互和水面位移的组织方式。 如果以后探索 2D 贴图鱼，这是优先学习路径；本轮不替换已有 Canvas 动物。 **证据：**官方教程目录已核对；没有把教程截图当本机运行结果。

- **[OGL Mouse Flowmap](https://github.com/oframe/ogl/blob/master/examples/mouse-flowmap.html)**（[技术 / 演示](https://oframe.github.io/ogl/examples/?src=mouse-flowmap.html)）：鼠标速度写入流图，流图再扭曲水纹理坐标。 适合比较指针扰动与柔和尾迹；若采用优先调用 Flowmap 导出 API，素材另核许可。 **证据：**官方示例源码已读。

- **[OGL Fluid Distortion](https://github.com/oframe/ogl/blob/master/examples/post-fluid-distortion.html)**（[技术 / 演示](https://oframe.github.io/ogl/examples/?src=post-fluid-distortion.html)）：压力、散度、涡量和缓冲交换组合成流体扭曲。 只宜作为可开关的局部效果，整屏折射会改变用户背景；本轮未加入。 **证据：**官方示例源码已读；未测当前扩展性能。

### 3D / 空间体验

- **[Deskworlds Reefscape](https://github.com/chaseleantj/deskworlds)**：MIT 珊瑚、海葵、地形、水流和焦散模块。 本 demo 已实际复用，保留上游固定提交及配套 Three.js r180；固定遮挡默认关。 **证据：**20 个上游文件验证 Git blob 哈希；真实 Chrome 隔离页已渲染。

- **[Babylon.js Fluid Rendering Demos](https://doc.babylonjs.com/features/featuresDeepDive/particles/fluid_renderer/fluid_demos)**：粒子液面、预计算粒子、盒体/球体与高度图碰撞演示。 学习液体渲染与物理模拟的区别；官方明确部分演示只负责渲染，不能当完整流体引擎。 **证据：**官方说明已读；未安装 Babylon 或测 GPU。

- **[Spline + Framer Underwater](https://www.reddit.com/r/Spline3D/comments/1b9k86j/underwater_3d_scrolling_website_made_with_spline/)**（[技术 / 演示](https://underwater.framer.website/)）：社区展示 Ilya Kostin 的水下滚动网站，并附 Live / Remix 入口。 参考镜头推进与信息层级；不把滚动宣传场景当能直接接居民与任务的 SDK。 **证据：**Reddit 原帖与入口已核对；在线站本轮未加载成功，未验证运行效果或素材许可。

- **[Gaussian Splashing](https://github.com/BGU-CS-VIL/gaussianSplashing)**：作者实现将水下衰减与背散射纳入高斯重建。 适合未来扫描礁石环境的离线研究；其 CUDA 训练/渲染结果不能等同浏览器性能。 **证据：**作者 README 已读；未训练、下载数据或运行。许可需按原始 3DGS 条款另核。

- **[Spark 动态泼溅与按需渲染](https://sparkjs.dev/examples/)**（[技术 / 演示](https://github.com/sparkjsdev/spark)）：官方列出 Dynamic Lighting、Particle Animation、Raycasting、LoD 与 On-demand Rendering。 Spark 并非只能静态显示，但动态效果不自动提供鱼类拓扑、碰撞或现有交互。可继续做独立研究，不直接接本原型。 **证据：**官方 README 和案例目录已读；未运行新样张。WASM 与资产加载仍须独立验证。

### 视觉 / 流体 / 声音

- **[TypeGPU：3D Fish、焦散、Stable Fluids](https://docs.swmansion.com/TypeGPU/examples/)**（[技术 / 演示](https://docs.swmansion.com/TypeGPU/blog/typegpu-012/)）：官方案例库同时覆盖鱼、焦散、流体、粒子雪和群集；0.12 说明了实验性 WebGL 回退。 优先关注焦散与薄计算适配；不能把某个 WebGL 回退示例外推为所有 WebGPU 功能可回退。 **证据：**官方目录与版本说明已读；浏览器页面未获得可确认的案例画面，本轮不记为运行通过。

- **[TouchDesigner / touchFluid](https://github.com/kamindustries/touchFluid)**：MIT 的二维半拉格朗日流体，含涡量、温度、浮力和障碍，提供 .toe / .tox 与 GLSL。 适合离线调尾迹和流动观感；TouchDesigner 工程不能原样加载到扩展。 **证据：**作者 README 已读；本轮未运行 TouchDesigner。

- **[Audio Reactive Ocean](https://www.reddit.com/r/TouchDesigner/comments/1ufueou/audio_reactive_ocean/)**：作者以 GLSL TOP 和 MIDI 驱动海面参数，参考 Seascape shader。 值得借鉴缓变的声音响应；作者表示不公开工程，不能当可复用源码。 **证据：**Reddit 作者正文与回复已读；未获取工程。

- **[Hydra 音频响应与反馈](https://github.com/hydra-synth/hydra)**（[技术 / 演示](https://github.com/hydra-synth/hydra-synth)）：音频频带可驱动颜色、形状、反馈；引擎提供关闭自动循环和音频检测的选项。 适合离线生成抽象流动纹理。当前 MV3 的动态执行边界仍存在，本轮不接入或申请麦克风。 **证据：**官方 README / API 说明已读；未运行。

- **[WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)**（[技术 / 演示](https://paveldogreat.github.io/WebGL-Fluid-Simulation/)）：可交互彩色流体的经典 WebGL 开源样例，作者 README 标 MIT。 对比尾迹消散与涡旋；优先考虑有界局部区域，避免覆盖整幅壁纸。 **证据：**作者 README 已读；本轮未做性能探针。

- **[ThreeJS-caustics](https://github.com/martinRenou/threejs-caustics)**（[技术 / 演示](https://martinrenou.github.io/threejs-caustics)）：Martin Renou 的实时水下焦散示例，附实时入口与技术文章。 作为焦散观察参考；本 demo 已复用 Deskworlds 焦散，不叠加另一套求解。 **证据：**作者 README 与入口已核对；本轮未运行，文章正文未复核。

- **[Deep Sea Geometry](https://www.reddit.com/r/creativecoding/comments/1tud21g/deep_sea_geometry_2_hours_of_generative/)**：作者用 Processing P3D、程序几何、噪声运动和分层雾制作抽象深海，声音用 SuperCollider。 适合独立艺术模式；与默认保留背景的陪伴模式分开。 **证据：**Reddit 作者说明已读；没有获取或运行工程。

## 下一步仍以实验为界

建议先实际体验“造景关 / 20% / 32% / 42%”四种状态，再决定固定造景是否值得进入正式方案。若喜欢当前材质，下一组隔离试验应优先验证鱼与礁石的深度关系、姿态投影和遮挡，不再增加第二套居民或任务状态。Blender 用于离线生成与简化资产，TypeGPU / Spark / Babylon / Spline / Hydra / TouchDesigner 留在各自隔离探针里比较收益。

本轮安全自查：demo 只监听回环、白名单只读供给、拒绝写请求与私有路径，使用独立内存演示数据；无新增生产权限、远程执行或真实业务数据写入。第三方文件固定提交与哈希；没有运行上游安装脚本或放宽正式 CSP。
