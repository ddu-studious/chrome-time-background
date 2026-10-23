---
title: 水族馆“个体大小差异 + 6 种新小鱼”设计稿（浅礁 3D 的 Step A，2D 渐进增强）
type: technical
status: completed
version: "1.1"
created: "2026-10-23"
updated: "2026-10-23"
author: "AI 助手"
tags: [水族馆, 个体大小, 新物种, 存储兼容, 设计稿]
related:
  - docs/technical/ocean-habitat/README.md
  - docs/technical/ocean-habitat/implementation-v9.md
  - docs/technical/aquarium-20261017.md
  - docs/superpowers/specs/2026-10-17-aquarium-design.md
changelog:
  - date: "2026-10-23"
    desc: "初始创建：用户确认“两步都做：先渐进，验证后再做 3D 浅礁”，并选定“6 种全加 + 我先写 spec/plan 后直接开工、事后一并审阅”；本稿是 Step A（2D 渐进）的设计，Step B（3D 浅礁模式）不在本稿范围"
  - date: "2026-10-23"
    desc: "v1.1：Step A 实施完成（状态改为 completed，**未提交 Git**）。实际取值与差异（`half` 重新取值、蝴蝶鱼色位互换、天竺鲷改用尾柄黑带、镰鱼自有旗状背鳍轮廓、预览页只做图集）、验证数字与限制见 docs/technical/aquarium-variety-20261023.md；§3.2 表里的 half/colors/外形说明是实施前的预估，以技术文档为准；新种美术观感待用户确认，Step B 未开始"
---

# 水族馆“个体大小差异 + 6 种新小鱼”设计稿

日期：2026-10-23　状态：**已完成（Step A 实施完毕，未提交 Git）**——用户已确认范围；每个任务附测试与截图证据，等待用户事后一并审阅。实际取值、与本稿的差异与验证数字见 `docs/technical/aquarium-variety-20261023.md`（§3.2 表里的 `half`、色位与外形说明是实施前的预估，以技术文档为准）。

## 0. 背景与你的决定

- 你完成了 `docs/technical/ocean-habitat/README.md`（隔离的 3D 浅礁实验），问能否用它优化首页现有“海洋生态设计”。你的两条倾向：**现在的 2D 水母好看，保留**；README 里规划的 3D 水母过于仿真、不好看，**其余写实设计不错**。
- 评估结论：可以借鉴，但不是整体替换。首页水族馆是 2D Canvas 的共享宿主画布，3D 浅礁与它同一接口（`window.Aquarium`）但另有 WebGL、three.js 与资产的成本。
- 你选了**“两步都做：先渐进，验证后再做 3D 浅礁模式”**；本稿是第一步。物种清单你选了**6 种全加**（与 3D 浅礁同一清单，后续第二步可直接复用存储条目）；流程选了**快速**。

## 1. 范围

**做（Step A）**

1. **个体大小差异**：同一种小鱼，每条的体长在标准值的 75%–125% 之间（成群的鱼里也有大有小）；由条目 id 确定，不存储，同一条鱼每次打开一样大。设置页新增开关“个体大小差异”，默认开，只有明确 `false` 才关。
2. **新增 6 种小鱼**：青绿光鳃鱼 `chromis`、金花鲈 `anthias`、皇家伽玛 `gramma`、镰鱼 `idol`、蝴蝶鱼 `butterfly`、天竺鲷 `cardinal`（卡通 2D 画法，3 个新的画法特征）。
3. **存储兼容**：名单里出现新种时写 `v:2`，旧版本看到不认识的版本会拒绝写入、不会把新种从名单里抹掉；只有最初 9 种时仍写 `v:1`。
4. 托盘 15 个按钮的布局、设置页文案、旧测试的有意更新、真实 Chrome 截图证据。

**不做**

- 3D 浅礁模式（Step B）：另行评审；它需要单独批准引入 three.js（2026-10-20 调研曾决定不引入）、第二个 WebGL 上下文与水层 WebGL 的关系、资产与包体预算、隐藏 60 秒回收、`webglcontextlost` 处理。**本稿的验证通过且你亲眼确认后才开始。**
- 水母：一行不改。
- 新种的捕食关系：新种**没有 `diet`**，既不吃也不被吃（README 的原则：生物学依据未核实的物种不参与捕食）。需要时另做。
- 大鱼（小锤头鲨、海龟、蝠鲼、鲸鲨）：按真实比例，体长不随机，数值与画法逐位不变。

## 2. 现状盘点（按代码核对）

- 物种表 `js/aquarium-core.js` 的 `SPECIES`（9 种）；体长 `lengthOf(world, spec, z) = spec.len × world.scale × (1 − Z_SIZE + Z_SIZE × z)`，生成鱼时写进 `f.len`，**之后核心里所有尺度计算（命中、避让、群游半径、软边界、岸线与屏顶、摆尾频率）都读 `f.len`**；`resize` 按 `f.len *= factor` 缩放；`agileOf` 以 `f.len ≤ AGILE_LEN × scale` 判断笨重。因此“个体大小”只需在**生成鱼的两个入口**（`spawnGroup`、补员 `enterOne`）把 `len` 乘一个系数，其余自动一致。
- 补员：`consume` 记录空缺 `{entry, species, due}`，`refill` 调 `enterOne`。补回的鱼必须保持原来的大小，否则被吃的鱼回来时会变一个样子。
- 画法 `js/aquarium.js` 的 `SHAPES`（8 种有卡通形状，海龟只有写实）；`drawFish` 读 `fish.len`；深色细节必须临时切到 `source-over`（宿主整张画布在 `screen` 下画，深色加不上任何东西），`test/aquarium-shapes.test.js` 守住；远处与省流量不建渐变、不裁剪。
- 存储 `chrome.storage.local.aquariumV1 = { v: 1, fish: [{id, species, addedAt}] }`；`mutate()` 是唯一写入点；`parseValue` 对 `v` 不是 1 的数据返回 `ok:false`，此时放入/捞出都拒绝且不写（`test/aquarium.test.js` 守住）；`Core.normalizeEntries` 会丢掉白名单之外的种类。
- 黄金测试：`aquarium-core.test.js` 的黄金轨迹（用显式物种名单，**不依赖物种表顺序与数量**）、`aquarium-extras.test.js` 的 8 种 × 5 场景画法哈希（用 `Core.SPECIES.filter(…)` 遍历，需要有意改为固定名单）。
- 托盘面板宽 272 px，`flex-wrap`；从 `.aq-ui`（右 18、下 130）向上展开。9→15 个按钮会多出两三行。

## 3. 设计

### 3.1 个体大小差异

**公式**（核心，纯函数，不用 `world.random`，不存储）：

```
hash01(s) = FNV-1a 32 位 + 雪崩混合 → [0, 1)
sizeOf(entryId, index, spec) = spec.size 缺失 ? 1
    : lo + (hi − lo) × (hash01(`${entryId}|${index}|a`) + hash01(`${entryId}|${index}|b`)) / 2
```

- 两次均匀哈希取平均 = 以区间中点为中心的三角分布：多数鱼接近标准大小，少数明显偏大或偏小（不是一个个等概率的随机大小）。
- `SIZE_RANGE = [0.75, 1.25]`，中点 1.0（美术取值：深度 `z` 本身已让体长在 65%–100% 间变化，个体差异取同量级，才不至于盖过景深线索）。给 11 种小鱼各登记 `size: SIZE_RANGE`；大鱼没有 `size` → 恒为 1。
- `index` 是鱼在群里的序号（`spawnGroup` 的循环变量；单条为 0）。条目 id 本身带随机成分（`种类-时间-计数`），所以不同条目的同一种鱼大小不同；同一条目每次刷新相同。
- **不消耗随机数**：开关开或关，`world.random()` 的取用序列一模一样，只有 `len` 不同；关闭时 `len × 1` 与原值逐位相同（`x × 1 === x`），所有黄金轨迹不变。
- 世界新增选项 `createWorld({ sizes })`，默认 `false`（没传的调用方、旧测试逐位一致）；`spawnGroup` 与 `enterOne` 里 `len = lengthOf(...) × size`，鱼上记 `f.size`（诊断与补员用）。`consume` 把 `f.size` 写进空缺，`refill` 传给 `enterOne`。
- 控制器 `frame(options)`：`options.sizes === true` 才开（与 `predation` 同一口径：没传的调用方与改动之前一致）；`world.sizes` 与 `options.sizes` 不一致时与 `lowPower` 变化一样**重建世界**并 `reconcile(instant)`——因为大小由 id 决定，所以重建前后同一条鱼大小不变（开关关→开时鱼的位置会重新散开，这是设置页里一次性的操作，与切省流量模式同一语义）。
- 宿主 `background-experience.js`：设置 `aquariumSizes`，默认 `true`，只有明确 `false` 才关；传 `sizes: this.settings.aquariumSizes`。设置页同一处接线（默认值、规范化、读取、绑定、HTML 开关与文案）。
- **影响范围（如实）**：大一点的鱼抓取范围、群游分离半径、避让半径、软边界宽度、摆尾频率都随 `f.len`（自动）；捕食规则看**种类的真实体长 `meters`**，不看个体大小（小锤头鲨能吃谁不随个体大小变）；纯外观、不改任何存储。

### 3.2 六种新小鱼

| id | 名称 | kind / group | len(px) | meters | half | speed | band | colors | 外形特点 |
|---|---|---|---|---|---|---|---|---|---|
| chromis | 青绿光鳃鱼 | school / 5 | 18 | 0.055 | 0.22 | 74 | 0.20–0.70 | [3, 4] 绿+薄荷 | 纤细、深叉尾，在珊瑚上方悬停 |
| anthias | 金花鲈 | school / 5 | 22 | 0.085 | 0.26 | 70 | 0.15–0.65 | [1, 7] 橙+洋红 | 高背鳍、更深的叉尾、一道洋红纵纹（复用 `stripe`） |
| gramma | 皇家伽玛 | solo / 1 | 26 | 0.06 | 0.24 | 44 | 0.55–0.92 | [7, 2] 洋红+黄 | 前半身洋红、后半身黄（新特征 `twoTone`），圆尾，靠近底部 |
| idol | 镰鱼 | solo / 1 | 34 | 0.11 | 0.55 | 38 | 0.35–0.85 | [2, 1] 黄+橙 | 盘状身体、两条宽黑带（新特征 `bars`）、镰刀般后掠的高背鳍与一条长丝（新特征 `sail`） |
| butterfly | 蝴蝶鱼 | solo / 1 | 30 | 0.095 | 0.36 | 42 | 0.40–0.90 | [2, 4] 黄+薄荷 | 圆盘身体、穿过眼睛的黑带（`bars`）、圆尾 |
| cardinal | 天竺鲷 | solo / 1 | 24 | 0.055 | 0.28 | 36 | 0.60–0.93 | [0, 1] 红+橙 | 圆胖红色身体、大眼睛、一道纵纹（复用 `stripe`），靠近底部 |

- 以上数值（`len`、`half`、`speed`、`band`、`colors`、`SHAPES` 里的半宽与鳍高）是**美术与手感取值，不是量化结论**；`meters` 取 3D 浅礁实验的默认体长（`test/demos/reef-3d-lab-20261021/community-catalog.mjs`），用于将来与 3D 同源的比例换算，不参与现在的捕食判断。落地后以真实 Chrome 截图校准，校准后的最终数字记在技术文档。
- 物种表里的顺序是托盘按钮的顺序：群居小鱼在前、单条在后、大鱼最后——新种插在原有的中间，**原有 9 种之间的相对顺序不变**。
- 新种在物种表里带 `since: 2`（存储版本）；没有 `diet`、没有 `gape`；不是 `top`；`hit` 沿用默认。

### 3.3 三个新的画法特征（`SHAPES` 的可选字段，旧形状没有这些字段，旧种的每一笔不变）

- **`twoTone`（数字，分界位置 0–1）**：身体填充改为沿体长的水平渐变——头段主色、尾段点缀色，分界处约 12% 体长的过渡；远处/省流量没有渐变，用主色与点缀色的混合平涂。
- **`bars`（`[[u, 宽度占体长], …]`）**：宽的深色竖带，按身体轮廓裁剪、`source-over` 下画（与小丑鱼白带、神仙鱼竖纹同一规则）；近处才画。
- **`sail`（布尔）**：背鳍最高点引出一条白色长丝，向后飘出体外，随摆动轻荡；近处才画；只用 `stroke`，不建渐变。

### 3.4 存储 v2（回滚保护）

- `Core.STORAGE_VERSIONS = [1, 2]`；`Core.storageVersionOf(entries)`：名单里有任何 `since > 1` 的种返回 2，否则 1。
- `mutate` 写入 `{ v: Core.storageVersionOf(outcome.entries), fish }`；`parseValue` 接受 `v ∈ STORAGE_VERSIONS`，其他数字（含 3 及以上）仍按“看不懂就不碰”处理。
- 效果：只有最初 9 种时，写入与现在完全相同（`v:1`），旧版本读写不受影响；放入新种后写 `v:2`，**旧版本**读到 `v:2` 返回 `ok:false`、放入/捞出都拒绝且不写——名单留在存储里，回到新版本即可恢复，不会因为回滚而丢失新种。把新种全部捞出后又写回 `v:1`。
- 存储键 `aquariumV1` 不改名。

### 3.5 托盘与设置页

- 托盘按钮由 `Core.SPECIES` 生成，不需要改代码；`.aq-panel` 增加 `max-height: calc(100vh − 154px); overflow-y: auto`（面板底边在 `.aq-ui` 的位置，上方留 24 px 余量），低窗口时可滚动而不是顶出屏幕。
- 设置页“水族馆小鱼”的说明补上 6 个新名字（测试要求说明里包含 `Core.SPECIES` 的每个名字）；“大鱼吃小鱼”的说明补上“新增的 6 种也不参与”；新增“个体大小差异”开关与说明（放在“水族馆小鱼”之后）。
- `?v=` 钉子：`aquarium-core.js` 7→8、`aquarium.js` 8→9、`aquarium.css` 6→7、`background-experience.js` 20→21、`settings-page.js` 19→20，相关测试里的钉子同步。

## 4. 测试与证据

- **TDD**：每个行为先写失败测试（看到失败原因正确），再最小实现。新测试集中在 `test/aquarium-variety.test.js`；旧测试只在“物种数量、存储版本 2 不再是未来版本、画法哈希遍历”三处**有意更新**，并在文件内写明原因。
- **必须不变**：`aquarium-core.test.js` 的全部黄金轨迹、`aquarium-heavy-animals.test.js`、`aquarium-yaw.test.js`、`aquarium-extras.test.js` 的 8 种画法哈希、`aquarium-school-regroup.test.js` 的统计门槛；大鱼的体长与轨迹。
- **新增检查**：`sizeOf` 确定性/范围/均值/分布/大鱼恒为 1；`sizes` 关时与不传逐位一致；开时每条 `len` = 基础体长 × `f.size`；补员保大小；`resize` 不丢大小；新种的物种表约束与 `SHAPES` 约束（复用 `aquarium-shapes.test.js` 的通用循环）；三个新特征的绘制调用（裁剪、`source-over`、远处不画、无非有限数）；存储 v1/v2 读写与回滚保护；设置页与宿主接线（源码合同）。
- **截图证据（真实品牌版 Chrome 156，无头、隔离临时配置，加载本目录）**：基线（改动前）与改动后各一组——整页水族馆、15 个物种图集（近/远、白天/夜晚）、托盘展开、个体大小开/关对比；证据放 `output/aquarium-review-20261023/variety/`，含 `RESULTS.md`。
- 变异检查与更长的性能观察不在本步范围（沿用既有的帧耗时测量口径，只记录新种的单鱼绘制调用数）。

## 5. 风险与未决

- 新种形状与颜色是第一版美术，**需要你亲眼确认**；可能需要一轮微调（半宽、鳍高、颜色色位）。
- 个体大小在“关→开”时会重建世界，鱼位置重新散开（一次性）；若觉得突兀，可改为“只缩放 `f.len` 不重建”（代价：核心需要保存基准体长，多一处状态）。
- 托盘高度：15 个按钮后面板更高，已加滚动保护；真实窗口里的观感待截图确认。
- `meters` 与 3D 浅礁的实验数据同源，但**不是**经核实的生物统计；文档与设置页不得称其为“真实体长”。

## 6. 自审

- 占位词/矛盾：无；所有数值标注了“美术取值”或“来自代码”的来源。
- 范围：单一目标（2D 渐进增强），Step B 明确不在本稿；不改水母；不新增权限、依赖或网络。
- 歧义：“个体大小”不改变捕食判断与大鱼；“v:2”只在含新种时写；“默认开”的开关只有明确 `false` 才关，与既有 `aquariumRealistic` 同口径。
- 与 AGENTS.md 一致：保留未提交的无关改动（3D 实验目录与文档）；不提交、不发布；优先复用既有模块（核心、画法、托盘、设置页都沿用现有结构）。
