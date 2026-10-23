---
title: "首页水族馆：个体大小差异、6 种新小鱼（青绿光鳃鱼、金花鲈、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷）与存储 v2 回滚保护"
type: technical
status: active
version: "1.0"
created: "2026-10-23"
updated: "2026-10-23"
author: "AI 助手"
tags: [水族馆, 个体大小, 新物种, 存储兼容, 回滚保护, 画法特征, 托盘, 浅礁3D]
related:
  - docs/superpowers/specs/2026-10-23-aquarium-variety-design.md
  - docs/superpowers/plans/2026-10-23-aquarium-variety.md
  - docs/technical/ocean-habitat/README.md
  - docs/technical/aquarium-20261017.md
  - docs/technical/aquarium-predation-20261020.md
  - docs/technical/aquarium-tide-size-drag-20261019.md
changelog:
  - date: "2026-10-23"
    desc: "初始创建：Step A（2D 渐进增强）的实现、与设计稿的差异、存储 v2 的真实旧代码核对、托盘与设置页、分层验证数字与限制；Step B（3D 浅礁模式）未开始"
---

# 首页水族馆：个体大小差异与 6 种新小鱼

> 状态：代码、测试与真实 Chrome 证据已完成，**未提交 Git**；新种的美术观感**需要你亲眼确认**。
> 设计稿：`docs/superpowers/specs/2026-10-23-aquarium-variety-design.md`；计划：`docs/superpowers/plans/2026-10-23-aquarium-variety.md`；证据：`output/aquarium-review-20261023/variety/RESULTS.md`。

## 背景与你的决定

你完成了 3D 浅礁实验（`docs/technical/ocean-habitat/README.md`）并问能否用它优化首页现有的水族馆。结论是**部分可借鉴、不整体替换**：现在的 2D 水母好看，一行不改；3D 浅礁是另一套 WebGL + three.js + 资产的成本。你选了“**两步都做：先渐进，验证后再做 3D 浅礁模式**”，物种清单选“**6 种全加**”（与 3D 浅礁同一清单，第二步可直接复用存储），流程选“**我先写 spec/plan 后直接开工，每个任务给测试与截图证据，事后一并审阅**”。本文是第一步（Step A）的实现记录。

## 做了什么

| 项 | 行为 |
|---|---|
| 个体大小差异 | 11 种小鱼（原有 5 种 + 新增 6 种）每条的体长在种类标准值的 75%–125% 之间，成群的鱼里也有大有小。大小只由条目 id（与群里的序号）确定，**不存储、不消耗随机数**，同一条鱼每次打开首页一样大，被吃掉后补回的鱼大小不变。小锤头鲨、海龟、蝠鲼、鲸鲨恒为 1（按真实比例，不随机）。设置页开关“个体大小差异”（`aquariumSizes`，默认开，只有明确 `false` 才关） |
| 6 种新小鱼 | 青绿光鳃鱼 `chromis`、金花鲈 `anthias`（成群，每群 5 条）；皇家伽玛 `gramma`、镰鱼 `idol`、蝴蝶鱼 `butterfly`、天竺鲷 `cardinal`（单条）。卡通 2D 画法，新增 3 个可选画法特征 `twoTone`、`bars`、`sail`。物种表现在是 15 种（14 种鱼 + 海龟），托盘按钮同序 |
| 存储 v2 | 名单里有新种时写 `{ v: 2, fish }`，只有原来 9 种时仍写 `v: 1`。**旧版本**读到 `v:2` 会拒绝读写并保持存储不动，回滚不会把新种从名单里抹掉 |
| 托盘 | 15 个按钮在 272 px 宽的面板里排成 5 行；面板加最大高度与滚动，窗口矮时在面板里滚动而不是顶出屏幕 |
| 预览 | `test/demos/aquarium-variety-preview.html`：14 种卡通画法鱼的图集（近/翻面/夜晚/远处/转弯），只用于调美术，产品不加载；需要本地 HTTP（它用 `fetch` 读产品脚本），入口卡片在 `test/index.html` |

不变：水母、四种大鱼的体长与画法、原来 8 种卡通画法的每一笔（`aquarium-extras` 的画法哈希不变）、既有黄金轨迹、捕食规则（新种没有 `diet`，既不吃也不被吃）、权限、依赖与网络。

## 个体大小差异的实现

- **公式**（`js/aquarium-core.js`，纯函数）：`sizeOf(entryId, index, spec) = lo + (hi − lo) × (hash01(id|i|a) + hash01(id|i|b)) / 2`，`hash01` 是 FNV-1a 32 位加雪崩混合。两次哈希取平均得到以 1.0 为中心的三角分布：多数鱼接近标准大小，少数明显偏大或偏小。`SIZE_RANGE = [0.75, 1.25]` 是美术取值（深度 `z` 本身已让体长在约 65%–100% 间变化，个体差异取同量级才不盖过景深线索），不是量化结论。
- **接入点只有两处**：`spawnGroup`（首次生成）与 `enterOne`（被吃后补员）把 `len` 乘以大小。之后核心里所有尺度（命中、避让、群游半径、软边界、岸线与屏顶、摆尾频率）都读 `f.len`，自动一致；`consume` 把 `f.size` 写进空缺，`refill` 传回 `enterOne`，所以补回的鱼不变样。
- **关闭时与改动之前逐位一致**：`createWorld({ sizes })` 默认 `false`，关闭时 `len × 1` 与原值逐位相同，`world.random()` 的取用序列也与开启时相同（只有 `len` 不同）。鱼对象始终带 `size` 字段（关闭时为 1）；空缺只有在 `world.sizes` 时才带 `size`。
- **控制器与宿主**：`aq.frame(options)` 只有 `options.sizes === true` 才开启（与 `predation` 同一口径），`world.sizes` 与选项不一致时与 `lowPower` 变化一样重建世界并 `reconcile(instant)`——大小由 id 决定，重建前后同一条鱼大小不变；**关→开时鱼的位置会重新散开一次**（设置页里的一次性操作，与切换省流量模式同一语义）。`js/background-experience.js` 读 `aquariumSizes`（默认 `true`，只有明确 `false` 才关）并传 `sizes`；`js/settings-page.js` 与 `settings.html` 同步默认值、规范化、读取、绑定与开关文案。
- **影响范围（如实）**：大一点的鱼更好抓（抓取范围 = `f.len × hit × HIT_SCALE + HIT_PAD`，`HIT_PAD` 是固定常量，所以小鱼仍有最小范围）、群游分离与避让半径更大；**捕食规则看种类的 `meters`，不看个体大小**。纯外观，不改任何存储。

## 6 种新小鱼（最终取值）

所有新种：`size: SIZE_RANGE`、`since: 2`，**没有 `diet`、`gape`、`top`、`hit`**。`meters` 取 3D 浅礁实验的默认体长（`test/demos/reef-3d-lab-20261021/community-catalog.mjs`），用于将来与 3D 同源的比例换算，**不是经核实的生物统计，文档与设置页都不称其为“真实体长”**。以下数值（`len`、`half`、`speed`、`band`、`colors` 与 `SHAPES` 里的半宽鳍高）是美术与手感取值。

| id | 名称 | kind / 群 | len(px) | meters | half | speed | band | colors（色位） | 外形（`SHAPES`） |
|---|---|---|---|---|---|---|---|---|---|
| chromis | 青绿光鳃鱼 | school / 5 | 18 | 0.055 | 0.22 | 74 | 0.20–0.70 | [3, 4] 绿 + 薄荷 | 纤细，深叉尾，背鳍 0.12 |
| anthias | 金花鲈 | school / 5 | 22 | 0.085 | 0.22 | 70 | 0.15–0.65 | [1, 7] 橙 + 洋红 | 高背鳍 0.2、更深的叉尾、洋红纵纹（复用 `stripe`） |
| gramma | 皇家伽玛 | solo / 1 | 26 | 0.06 | 0.24 | 44 | 0.55–0.92 | [7, 2] 洋红 + 黄 | `twoTone: 0.5`：前半身洋红、后半身黄；圆尾；胸鳍 |
| idol | 镰鱼 | solo / 1 | 34 | 0.11 | 0.46 | 38 | 0.35–0.85 | [2, 1] 黄 + 橙 | 盘状身体；`bars` 两条宽黑带；`sail` 向后掠的旗状背鳍加白色长丝 |
| butterfly | 蝴蝶鱼 | solo / 1 | 30 | 0.095 | 0.42 | 42 | 0.40–0.90 | [4, 2] 薄荷 + 黄 | 圆盘身体；`bars` 一条穿过眼睛的黑带；圆尾 |
| cardinal | 天竺鲷 | solo / 1 | 24 | 0.055 | 0.26 | 36 | 0.60–0.93 | [0, 1] 红 + 橙 | 圆胖红色身体、大眼睛（0.058）；`bars` 尾柄上一条窄黑带 |

托盘顺序（与物种表同序）：霓虹灯鱼、蓝吊、青绿光鳃鱼、金花鲈、小丑鱼、河豚、神仙鱼、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷、小锤头鲨、海龟、蝠鲼、鲸鲨；原有 9 种之间的相对顺序不变。

### 与设计稿的差异

| 项 | 设计稿 / 计划 | 最终 | 原因 |
|---|---|---|---|
| `half` | anthias .26、idol .55、butterfly .36、cardinal .28 | .22、.46、.42、.26 | 设计稿是画形状之前的预估，按校准后的 `SHAPES` 重新取值（设计稿写明“校准后的最终数字记在技术文档”） |
| 蝴蝶鱼色位 | [2, 4]（黄 + 薄荷） | [4, 2]（薄荷 + 黄） | 主色与点缀色互换：薄荷身体、黄色点缀，与镰鱼的黄色身体拉开距离（对比图 `pal-*`、`pal2-*`） |
| 天竺鲷花纹 | 一道纵纹（复用 `stripe`） | 尾柄上一条窄黑带（`bars: [[0.8, 0.06]]`），不用 `stripe` | 与金花鲈、霓虹灯鱼的纵纹区分开，且更接近这类鱼的特征 |
| 镰鱼背鳍 | “背鳍最高点引出一条白色长丝” | 自己的旗状背鳍轮廓 `sailPoints(spine, half, len, height)`，再加白色长丝 | 通用 `drawFin` 画的是站位 1–3 之间的一条二次曲线三角；旗状（前缘陡直、尖端偏后、后缘内凹）需要自己的三点轮廓，同一个函数给长丝提供鳍尖位置，保证长丝接在鳍尖上；仍只用路径与描边 |
| 预览页 | 计划 0.3：预览页含图集与“活水族馆”（真实 `Aquarium.create` + 假存储，可切 `sizes`） | 只做了图集 | 整页的实际观感由真实 Chrome 里加载扩展的整页截图覆盖（含个体大小开/关对比），没有再做第二套替身 |

## 三个新的画法特征（`SHAPES` 的可选字段）

旧形状没有这些字段，旧种的每一笔不变（`aquarium-extras` 的 8 种 × 5 场景画法哈希守住）。深色细节一律在 `source-over` 下画（宿主整张画布在 `screen` 下合成，深色加不上任何东西），远处（`z < 0.55`）与省流量不建渐变、不裁剪。

- **`twoTone`（0–1 的分界位置）**：身体填充改为沿体长的水平渐变，色标 0、分界 −0.06、分界 +0.06、1，分界处约 12% 体长的过渡；远处与省流量用主色与点缀色的混合平涂。
- **`bars`（`[[u, 宽度占体长], …]`）**：宽的深色竖带（`rgba(24,18,30, α×0.88)`），按身体轮廓裁剪，只在近处画。
- **`sail`（布尔）**：旗状背鳍加一条白色长丝，随摆动轻荡，只在近处画，长丝只用 `stroke`、不建渐变。

## 存储 v2 与回滚保护

- `Core.STORAGE_VERSIONS = [1, 2]`；`Core.storageVersionOf(entries)`：名单里有任何 `since === 2` 的种返回 2，否则 1。`mutate()`（唯一写入点）写 `{ v: Core.storageVersionOf(outcome.entries), fish }`；`parseValue` 对数字 `v` 只接受 `STORAGE_VERSIONS` 里的值，其他数字（含 3 及以上）仍按“看不懂就不碰”：`ok:false`、不写、数据保留。存储键 `aquariumV1` 不改名。
- **真实旧代码核对**（`rollback-check.cjs`，对 git HEAD 的旧 `aquarium-core.js` 与 `aquarium.js`）：存储里有 `v:2` 且含新种时，旧代码读到空名单、放入与捞出都返回 `{ ok:false, reason:'storage' }`、**写入 0 次**、存储原样保留（`rollback-check.log` 末行 `ROLLBACK_CHECK_OK`）。把新种全部捞出后又写回 `v:1`。

## 托盘、设置页与版本钉子

- 托盘按钮由 `Core.SPECIES` 生成；`css/aquarium.css` 的 `.aq-panel` 增加 `max-height: calc(100vh - 154px); overflow-y: auto`（面板底边就是 `.aq-ui` 的底边，离视口底 130 px，再留 24 px 余量）。真实 Chrome 156（见下）：15 个按钮排成 5 行；12 个条目的最坏情况在 1280×720 时面板 509 px 高、上沿离视口顶 81 px、不需要滚动（改动前 9 个按钮、8 个条目时是 386 px 高）；视口矮到 560 与 420 时面板被封顶在 406 与 266 px、上沿离顶正好 24 px、内部滚动（内容高 507 px）。
- 设置页“水族馆小鱼”的说明列出全部 15 个名字（顺序与托盘一致）；“大鱼吃小鱼”的说明在“不参与”的名单里补上 6 个新名字（河豚、海龟、蝠鲼、鲸鲨和青绿光鳃鱼、金花鲈、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷都不参与）；新增“个体大小差异”开关与说明（小锤头鲨、海龟、蝠鲼、鲸鲨保持真实比例）。
- `?v=` 钉子：`aquarium-core.js` 7→8、`aquarium.js` 8→9、`aquarium.css` 6→7、`background-experience.js` 20→21、`settings-page.js` 19→20；加载顺序 core → 控制器 → 宿主不变，测试守住。

## 旧测试的有意更新

下列旧测试因“物种数 9→15、存储版本 2 不再是未来版本、托盘与设置页文案”而改，每处都在文件里写明“2026-10-23 有意更新”与原因，**没有放宽任何黄金轨迹或画法哈希**：

- `test/aquarium-core.test.js`：物种表断言 15 种；群居清单为霓虹灯鱼、蓝吊、青绿光鳃鱼、金花鲈；单条清单补上新种。
- `test/aquarium-core-predation.test.js`：9→15；出生状态键多 `size`，`f.size === 1`。
- `test/aquarium-predation-core.test.js`：标题 15×15（新种两两都不参与捕食）。
- `test/aquarium-extras.test.js`：画法哈希改为遍历固定的 8 个原有 id（`Object.keys(GOLD)`），不再随物种表增长。
- `test/aquarium.test.js`：放不下的文字变为四个群居种；“未来版本”夹具由 `{v:2}` 改为 `{v:3}`，标题改为“v 不是 1 或 2”。
- `test/aquarium-integration.test.js`：新增 3 个宿主接线测试，版本钉子同步。
- 版本钉子同步：`aquarium-water.test.js`、`jellyfish-integration.test.js`（含数组形式 `['background-experience.js', 21]`）、`background-experience-integration.test.js`、`jelly-errands-integration.test.js`、`jelly-desktop-integration.test.js`、`desktop-assistant-settings.test.js`、`jelly-appearance-settings.test.js`。

## 验证（分层）

| 层 | 内容 | 结果 |
|---|---|---|
| 新测试（TDD，每步先看到失败原因正确再实现） | `node --test --test-force-exit test/aquarium-variety.test.js`：大小公式与分布、开关关闭时逐位一致、补员保大小、`resize` 不丢大小、控制器重建、设置页与宿主接线、物种表与 `SHAPES` 约束、三个特征的绘制调用（裁剪、`source-over`、远处不画、无非有限数）、存储 v1/v2 与回滚保护、托盘 CSS、设置页文案、版本钉子 | 29/29（RED 日志 `tests-task1/2/3/4/5-red.log`；Task 1–4 的 RED 是实施时即时留的，**Task 5 的 RED 日志是事后重建的**：把新测试复制到 `/tmp` 副本，配上改动前版本的 css、设置页与首页再跑，3 项因正确的原因失败，副本已删除） |
| 水族馆子集 | `node --test --test-force-exit --test-concurrency=4 test/aquarium*.test.js test/marine-rig*.test.js` | 基线 607/607 → 改动后 639/639（+29 新测试 +3 宿主接线测试） |
| 黄金门 | `aquarium-core`、`aquarium-extras`、`aquarium-heavy-animals`、`aquarium-yaw`、`aquarium-school-regroup`、`aquarium-core-predation`、`aquarium-predation-core` | 257/257，黄金轨迹、画法哈希、统计门槛没有改动 |
| 接线与钉子子集 | 上面的水族馆子集再加 `background-experience*`、`jellyfish-integration`、`jelly-errands-integration`、`jelly-desktop-integration`、`desktop-assistant-settings`、`jelly-appearance-settings` | 822/822（第一次 821/822：数组形式的版本钉子漏改，已修，两份日志都保留） |
| 全量 | `node --test --test-force-exit --test-concurrency=4 test/*.test.js test/*.test.mjs` | 3650/3650，约 113 秒 |
| 真实 Chrome 156.0.8078.48（品牌版、无头、隔离临时配置，经 CDP `Extensions.loadUnpacked` 加载本目录，扩展 ID `ipcgchgohpjheedlgfkcjlhhfbdljefo`，存储里预置 `v:2` 名单） | 整页截图（白天/夜晚、个体大小开/关、DPR 2 近景裁剪）、托盘三种视口高度、个体大小实测、无 console/pageerror、结束后无残留浏览器进程 | 11 个条目共 27 条鱼：开启时 27 个互不相同的大小，范围 [0.832, 1.236]、均值 1.035，白天与夜晚两次运行逐条相同（由条目 id 决定）；关闭时全部为 1。对比图 `sizes-on-off-schools.png` |
| 单鱼绘制成本（`perf-draw.mjs`：对 14 种卡通画法的鱼各画近处白天、近处夜晚、远处，用 Proxy 数每次 `drawFish` 的 Canvas 2D 方法调用） | 近处白天每条：新种 54–90 次，原有种 49–102 次 | 落在既有范围内；最坏情况由 `MAX_FISH = 40`（省流量 16）封顶。同一脚本也记了每次平均微秒（约 2–9 µs，仅一个预热离群值 23.5 µs），但那只是主线程记录命令的耗时代理，GPU 光栅化没量，**不拿它下性能结论** |

## 限制与未验收

- **美术观感需要你亲眼确认**：6 种新小鱼的形状、颜色、尤其是镰鱼的旗状背鳍与长丝、皇家伽玛的前后两色、天竺鲷尾柄的黑带，都是第一版美术取值，可能要一轮微调（半宽、鳍高、色位）。图集与截图见证据目录。
- `meters` 来自 3D 浅礁实验的默认值，**不是核实过的生物体长**，不得在文案里称“真实体长”。
- 真实 Chrome 验证是**无头软件渲染 + 隔离临时配置**：没有在你自己的 Chrome 配置里验过（重载扩展由你做；`?v=` 钉子会让缓存刷新），没有真实 GPU、多显示器与长时间运行的帧耗时对比；上面的单鱼绘制调用数只是主线程记录成本的代理，GPU 光栅化没有量。
- 个体大小“关→开”会重建世界，鱼的位置重新散开一次（与切换省流量同一语义）。如果觉得突兀，可改为只缩放 `f.len` 不重建，代价是核心要多存一份基准体长。
- 12 个条目的上限没有变：15 种鱼不能同时放满；大型鱼（蝠鲼、鲸鲨）仍最多 2 条。
- 没有做变异检查（设计稿 §4 明确不在本步范围）。
- Step B（3D 浅礁模式）**没有开始**：它需要单独批准引入 three.js（2026-10-20 的调研曾决定不引入）、第二个 WebGL 上下文与水层 WebGL 的关系、资产与包体预算、隐藏 60 秒回收与 `webglcontextlost` 处理，须在你确认 Step A 的美术后另做设计。

## 关闭与回滚

- 只关个体大小：设置页关闭“个体大小差异”（`aquariumSizes: false`），所有鱼回到标准体长，名单不变。
- 不想要新种：在托盘里把它们捞出；全部捞出后存储自动写回 `v:1`。名单里仍有新种时回滚到旧版本，旧版本会拒绝读写并保持存储不动，换回新版本即可恢复（见“存储 v2 与回滚保护”）。
- 不提交、不发布：本次所有改动都在工作区里，没有 Git 提交。
