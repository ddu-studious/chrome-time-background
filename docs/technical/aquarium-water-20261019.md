---
title: "首页水族馆海水层：半分辨率 WebGL 水层（潮汐水线、光束、焦散、微粒与气泡，预乘 alpha 不遮壁纸）与页面帧率监护"
type: technical
status: active
version: "1.2"
created: "2026-10-19"
updated: "2026-10-20"
author: "AI 助手"
tags: [水族馆, 海水, WebGL, 着色器, 性能, 帧率监护, 背景体验, 潮汐, 预乘alpha]
related:
  - docs/research/research-marine-realism-20261019.md
  - docs/technical/marine-realism-20261019.md
  - docs/superpowers/specs/2026-10-19-marine-realism-design.md
  - docs/technical/aquarium-20261017.md
  - docs/technical/aquarium-tide-size-drag-20261019.md
  - docs/technical/aquarium-shore-20261020.md
changelog:
  - date: "2026-10-19"
    desc: "初始创建：海水层的画法、接线、三道保护与帧率监护器的设计（含真实 Chrome 里发现旧规则误杀启动期的证据）、验证与限制"
  - date: "2026-10-19"
    desc: "v1.1：用户反馈“做完海浪后背景被遮住、要潮起潮落”。输出改为预乘 alpha + 普通混合（去掉 mix-blend-mode: screen，水面以上完全透明）；水面改为随潮汐升降的水线并多一个 surface(now) 给鱼避让；画面、接线、保护项、版本钉子与测试数同步更新，详见 aquarium-tide-size-drag-20261019.md"
  - date: "2026-10-20"
    desc: "v1.2：用户选择潮汐风格 B（底部岸线冲刷）。水层改为只占页面底部一条（画布约 34% 页高、z-index 1），画面由“水下视角的整片水 + 光束 + 焦散”改为“沙滩、浅水渐隐、冲上来再退下的泡沫线”；鱼避让的是岸线，surface(now) 改为 shore(now)；本文里的画面描述与 surface 接线是 v1.1 的状态，已在开头标明，现状见 aquarium-shore-20261020.md"
---

# 首页水族馆海水层

用户希望首页水族馆有“海水、海浪”的效果（X 上看到很多 demo）。调研（`docs/research/research-marine-realism-20261019.md`）归纳出这类作品的共同套路：**从水下往上看**的水面起伏与镜面波光、从水面射下的光束、海底软边焦散、悬浮微粒与气泡。本次实现的就是这一层。**它不是“侧面剖开、看得见浪尖”的画法**——那种画法需要把水族馆重做成侧视舞台，会改动鱼的游动范围与互动，没有做；如果你要的是浪尖，请告诉我，那是另一个独立的功能。

> **2026-10-19 修订（v1.1）**：本文最初把它做成“只加光”的整屏水下光影（不透明画布 + `mix-blend-mode: screen`）。真实 Chrome 里这个设计不成立——壁纸被整个盖住（中段对比度只剩 5–30%），而且用户要的是“潮起潮落”而不是整屏光影。现在输出的是**预乘 alpha** 的颜色、水面以上完全透明，水线随潮汐缓慢升降、每 10 秒一组涌浪，鱼的身体始终留在水面以下。下文已逐项改成现状；根因、参数、实测数据与备选风格见 `docs/technical/aquarium-tide-size-drag-20261019.md`。

> **2026-10-20 修订（v1.2）**：你选了潮汐的**风格 B（底部岸线冲刷）**。水层现在**只占页面底部一条**（画布约 34% 页高、`z-index: 1`，首页的 Dock 画在它上面），画的是沙滩、渐隐的浅水与“冲上来再退下”的泡沫线，**不再是整屏的水下光影**，鱼避让的是岸线：`AquariumWater.surface(now)` 改为 `shore(now)`，`aq.frame({ surface })` 改为 `aq.frame({ shore })`。**下文“画面”“水面高度回传”“鱼把身体上缘留在水面以下”以及测试数量都是 v1.1 的状态，已过时**，现状（画面、参数、真实 Chrome 的遮挡度与避让实测、变异检查与限制）见 `docs/technical/aquarium-shore-20261020.md`；原文保留作历史记录。

## 做了什么

| 项 | 行为 |
|---|---|
| 画面 | 在壁纸之上、深海色调与鱼之下叠一层**水**：**水线**随潮汐缓慢升降（约 60 秒一个来回，快涨慢落），每 10 秒一组涌浪把水面顶上去再退下，浪花随涨落与涌浪变浓变淡；水面以上完全透明（壁纸原样），水面以下是两层很薄的半透明青色水（近层水线附近稍浓，其下很快淡到只剩一层薄青）；从水面之上的太阳射下的一条条光柱（缓慢漂移，只在水面下的浅层）；贴着水面的焦散光斑（域扭曲的 Voronoi 边缘，省流量时不算）；漂浮的微粒（两层，闪烁）；缓缓上升的气泡。夜里（晚 8 点到早 6 点，需开着“夜晚荧光”）整体变成冷蓝的月光，亮度也降下来 |
| 设置 | 设置页“海水效果”开关 `aquariumWater`（默认开，只有明确 `false` 才关），只在选了“水族馆”（`visualEffect: 'jellyfish'`）时运行，与“水族馆小鱼”开关互不影响；强度跟随“效果强度”（`0.25 + 0.75 × 强度`） |
| 成本 | 一张**半分辨率**的 WebGL 画布（内部边长是页面的 0.5，省流量 0.3，像素数上限 56 万），30 帧/秒（省流量 15）；不自建 RAF 或定时器，由宿主 `background-experience.js` 每帧调用；页面隐藏、被工作台遮挡时与宿主同停 |
| 失败 | 没有 WebGL、只有软件渲染、着色器编译失败、绘制异常、上下文丢失后无法恢复、页面帧率持续过低——**都只关闭海水层并留一条警告**，没有任何后备画法，鱼、水母与宿主帧循环不受影响 |

## 复用与新增

- 没有可用的现成库（也不需要）：着色器全部自写（GLSL ES 1.00，无纹理、无外部资源）——焦散用“域扭曲的 Voronoi 边缘”，光束用方位角上的值噪声，水面是 `swellH`（三个向右传播的正弦分量叠加、再乘一个成群起伏的包络，峰尖谷缓；v1.0 里是横向拉长的 Voronoi 细胞）。X 上的 demo 与参考图只借做法的思路。
- 复用：宿主 `background-experience.js` 的单条 RAF、`prefers-reduced-motion`/`reduce-motion`、页面可见性与工作台遮挡的挂起机制（`body.home-background-suspended`）、设置读取模式（只有明确 `false` 才关）；夜晚曲线沿用 `JellyfishCore.nightAmount`（与水母夜晚荧光同一条曲线，由 `env.nightAmount` 注入便于测试）。
- 新增：`js/aquarium-water-core.js`（纯逻辑：画布尺寸、帧率节流、着色器时间、uniform 取值、软件渲染识别、帧率监护器；不碰 DOM/WebGL/Date/存储）、`js/aquarium-water-shader.js`（着色器源码与 uniform 名单）、`js/aquarium-water.js`（控制器：独立画布、上下文丢失与恢复、失败即关）、`css/aquarium.css` 里的 `.aq-water`。**不读不写任何存储与任务数据**。

## 接线

- 画布放在宿主根容器（`#background-experience-root`，`position: fixed; z-index: 2`，自成堆叠上下文）**之外**、壁纸与它之间（`.aq-water { z-index: 1; pointer-events: none }`，**没有混合模式**）。v1.0 用的是 `mix-blend-mode: screen`，那是错的：首页壁纸是 `body` 的背景，被传播到了视口画布上，而 `body` 自己是 `position: fixed`（自成堆叠上下文），`screen` 看不到壁纸，不透明的画布就把壁纸整个盖住了；现在改为画布自带 alpha（预乘）、浏览器按普通 source-over 合成。
- 水面高度回传：`AquariumWater.surface(now)` 返回此刻最深的波谷（页面高度的比例；画布没在显示时为 `null`），宿主 `drawJellyfish` 把它交给 `aq.frame({ surface })`，鱼据此把身体上缘留在水面以下。
- 宿主：`applySettings` 里与小鱼一并同步（`syncWater`）：选了水族馆且 `aquariumWater` 开着才 `start()`，否则 `stop()`（销毁画布与上下文）；`drawJellyfish` 里在鱼与水母**之前**调用 `water.frame({ width, height, now, amount, lowPower, night })`，水体层出错只关自己。`start()` 本身没有副作用，画布等第一帧（有页面尺寸时）才建，第一帧画完才加 `.is-on` 淡入（0.9 秒；“减少动态效果”时无过渡）。
- 工作台遮挡首页时 `body.home-background-suspended .aq-water { display: none }`，不再占用合成。
- 版本钉子（v1.1）：`aquarium.css?v=5`、`aquarium-water-core.js?v=2`、`aquarium-water-shader.js?v=2`、`aquarium-water.js?v=2`、`background-experience.js?v=15`；设置页 `settings-page.js?v=16`（v1.0 时分别是 4 / 1 / 1 / 1 / 14）。

## 三道保护（软件渲染与慢机器）

1. `getContext('webgl', { failIfMajorPerformanceCaveat: true, powerPreference: 'low-power', alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false })`（v1.0 是 `alpha: false`）。部分环境有效；**实测在 ANGLE + SwiftShader 里它并不拒绝**，页面会被拖到每帧 200 多毫秒。
2. 渲染器名称检查（`WEBGL_debug_renderer_info`，`isSoftwareRenderer` 识别 SwiftShader、llvmpipe 等）：命中就不画。读不到名称时当作硬件渲染，交给第三道。
3. **帧率监护器**（`createGovernor()`）：硬件渲染但仍然太慢（集成显卡、高分屏）时，先降到省流量画法，再慢就关。见下节。

## 帧率监护器的设计与教训

监护器只看宿主每帧调用 `frame()` 的**时间间隔**（不依赖 GPU 计时）。参数集中在 `aquarium-water-core.js` 的 `PARAMS`：`GOV_WARMUP_MS 4000`、`GOV_SETTLE_MAX_MS 30000`、`GOV_SLOW_MS 40`、`GOV_MIN_SAMPLES 20`、`GOV_MAX_GAP 1000`。

**第一版是错的**：“一个窗口的中位间隔超过阈值就降一级”从第一帧起就计。在真实 Chrome 156 里，页面刚打开时首页自己在加载、着色器在编译和上传，**关掉海水层的对照运行里前 20 帧的间隔中位数就有 183 ms，整个启动期都卡了 20 秒以上**——旧规则把这段卡顿记在海水层头上，一启动就把它关了（现象：23 帧后报“页面帧率过低”，设置里开关明明是开的）。教训：**不能把页面启动期、机器忙时的卡顿归咎于装饰层**。

**现在的规则**（只降不升，避免在临界处来回切换）：

1. **预热**：启动后头 `GOV_WARMUP_MS`（4 秒）一帧都不计。
2. **等页面流畅过**：只有某个窗口（`GOV_MIN_SAMPLES` 个间隔）的中位数 ≤ `GOV_SLOW_MS`（约 25 fps）才开始监护；最晚等到启动后 `GOV_SETTLE_MAX_MS`（30 秒）——机器本身一直很忙时，不拿启动期的卡顿去怪海水层。开始监护的那个窗口本身不判罚。
3. **监护**：之后每个窗口取中位数，超过 `GOV_SLOW_MS` 就降**一级**（0 → 1 省流量画法，1 → 2 关闭并留一条警告“页面帧率过低”）。
4. 大于 `GOV_MAX_GAP`（1 秒）的间隔是页面被切走又回来，倒退或非有限的时间戳都不计入；`stop()` 后再 `start()` 重新开始（新的预热）。
5. `state()` 多 `armed`（是否已开始监护），验收诊断用。

**代价（已知）**：真正太慢的机器上，最坏要先经历约 30 秒的卡顿才会降级与关闭（页面一直不流畅就等到上限）。我选择“不误杀”优先于“尽快止损”，因为海水层默认是低成本的半分辨率画面，而误杀会让用户明明打开了效果却看不到；如果你更看重慢机器上尽快止损，可以把 `GOV_SETTLE_MAX_MS` 调小，这是一个数字的取舍。

## 验证（分层）

- **单元**（Node）：`test/aquarium-water-core.test.js`（v1.0 时 24 项，现 32 项：尺寸、节流、时间回绕、uniform、潮汐曲线与 `surfaceDeepestAt`、软件渲染名单、监护器的每条规则与边界）与 `test/aquarium-water.test.js`（v1.0 时 29 项，现 31 项：控制器的建立/销毁、预乘 alpha 的上下文参数、`surface(now)` 的 null 条件、上下文丢失与恢复、失败即关与单条警告、画布身份核对、监护器接线、缺失 DOM/WebGL 的退化）。
- **变异检查**（只改 `/tmp` 副本，核对仓库哈希）：监护器与控制器 29 个，杀死 26；存活 3 个均无可观察差别：预热边界 `>=` 改 `>`（只差恰好等于 4000 ms 的一个采样）、关闭之后继续判定（等级已是 2，控制器不再询问）、非有限时间戳不提前返回（后面的比较本来就不成立）。
- **真实 Chrome 156（品牌版、无头、隔离临时配置，Apple M3 Max 的 Metal 渲染器）**：端到端里海水层运行、开关即时生效（开→关→开）、设置页状态；**监护器在页内制造卡顿（每 10 ms 忙等 45 ms）的两种场景下验证**：A 只在启动期卡顿，之后恢复——海水层活着、不降级，监护随后开始；B 一直很卡——不会在启动期被关，到等待上限之后才开始监护，随后降到省流量、再关闭并留一条警告。（早先试过用 CDP `Emulation.setCPUThrottlingRate` 降速，`send` 一直不返回，已弃用。）
- **性能**：无头 Metal 下，开与关海水层的帧率没有可测差别（约 59.8 fps，p95 16.8 ms）；这不代表弱 GPU 或高分屏的表现。软件渲染（无头默认的 SwiftShader 路径）会被第 2 道保护拦下。

## 限制与未验收

- 美术观感需要你亲眼确认：水面带的高度与亮度、光束数量、焦散强度、微粒与气泡的密度、夜里的冷蓝都是看真实截图调出来的数值（`aquarium-water-shader.js` 里写明“改动必须重新看截图，不能只看单测”），没有量化的好看判据。
- 夜里的月光效果要求开着“夜晚荧光”（关闭则整天按白天画）。
- 不是侧面的浪：见开头。
- 弱 GPU / 集成显卡 / 高分屏的真实表现与上面“最坏约 30 秒才降级”的代价没有在真机上验证；用户自己的 Chrome 配置、真实 GPU 长期占用与电量、触屏未验收。
- 回滚：设置页关掉“海水效果”（立即销毁画布与上下文，不留监听）；代码层面把 `aquariumWater` 默认值改 `false`，或不加载三个新脚本（宿主里 `window.AquariumWater` 缺席时这些入口都是空操作）。
- 安全自查：不联网、不读写存储与任务数据、不用 `innerHTML`/`eval`，着色器源码是静态字符串；资源上限（像素数、帧率、失败即关）见上。
