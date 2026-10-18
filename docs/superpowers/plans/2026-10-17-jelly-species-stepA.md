# 桌面动物 Step A（物种接口 + 小锤头鲨）实现计划

> **执行状态（2026-10-18）：** A1–A9 已全部执行（写本行时未提交；之后提交为 `a6d897b`，并随 `feat/jelly-appearance` 并入实验分支）。下面的 `- [ ]` 复选框没有逐个回填，以实际结果为准：实现、验证数字、与本计划和设计稿的差异、存活的变异体与未验收项都记在 `docs/technical/jelly-species-hammer-20261018.md`。

> **给执行者：** 本项目禁止使用子代理（`AGENTS.md`、用户规则），所以按 `superpowers:executing-plans` 在当前会话里逐任务执行；步骤用 `- [ ]` 勾选。

**目标：** 设置里能选“水母 / 小锤头鲨”，桌面上只出现选中的那一只；默认水母，画面与现在逐像素一致；小锤头鲨会游动、休息、睡着、看鼠标、被抓、倒计时变色、响铃、喝水气泡、夜晚荧光，8 色 × 4 花纹对它有效。

**设计稿：** `docs/superpowers/specs/2026-10-17-jelly-species-design.md`（用户 2026-10-17 已确认五条默认值）。蝠鲼、海龟、鲸鲨是后续 Step B/C/D，复用本步建好的接口，只补各自的几何数据、调参、采样点、冒烟。

**架构：** 水母保持过程式画法（4 张像素基线守住）；动物由“部件”组成（角色 + 路径），几何写成 SVG 路径串，只在 `js/jelly-species-shapes.js` 里有一份；`desktop-reminder/gen-species.mjs` 生成并入库 `jelly-species-data.swift`，Swift 用一个只认 `M/L/C/Q/Z` 绝对命令的小解析器还原，纯逻辑（解析、包围盒、放置、朝向、调参）在 `jelly-species.swift`，AppKit 绘制在 `jelly-species-painter.swift`。Chrome 仍是设置唯一所有者，协议仍是 v7，`jelly` 回执的 `appearance.species` 回报**实际生效**的动物。

**技术栈：** 原生 JavaScript（UMD 模块 + Node 测试）、Swift 5.8（纯逻辑自测 + AppKit）、`node --test`。

## Global Constraints

- 协议仍是 v7，不新增权限、网络、连接；`species` 是两端各自白名单的枚举，未知值回水母（`jelly`）。
- 水母的画面与物理数值不变：4 张像素基线（calm/night × light/dark）逐像素一致；`JellyTuning.forStage(stage)` 对水母返回的数值不变。
- JS 与 Swift 各有一份的东西必须有对拍测试：物种 id 与默认值、`limbTone`、路径解析与包围盒、可用物种集合。
- 几何数据只有一个来源（`js/jelly-species-shapes.js`）；Swift 数据表是生成物，测试检查“生成物与数据一致”。
- 身体顶端放在窗口底边以上 91 pt，水平居中（镜像以包围盒中心为轴，转身不跳）；任何相位、两种朝向下包围盒离窗口边缘 ≥ 8 pt。
- “每天换一只 / 随机一只”不改动物；功能名仍叫“桌面水母”，原生面板标题、读屏、右键“收起…”用物种名。
- 变异检查只改 `/tmp` 副本，跑完核对仓库文件哈希；不做整屏截图，只 `screencapture -l` 自家窗口；不跑会移动真实鼠标的冒烟阶段；脚本抢键鼠须礼让用户。
- 不提交 Git（用户未要求）；每个任务结束前备份未提交改动到 `/tmp/tk/backup-species/`。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `desktop-reminder/jelly-paint.swift` | 改 | 增 `limbTone(u:)`，`tentacleTone` 委托给它（水母数值不变） |
| `desktop-reminder/jelly-species.swift` | 新建（纯逻辑） | `JellySpecies`、角色/视角、路径解析、几何、包围盒、放置、朝向/俯仰/划水包络、调参系数 |
| `desktop-reminder/jelly-species-data.swift` | 生成 | 各动物的路径串与数字（勿手改） |
| `desktop-reminder/gen-species.mjs` | 新建 | 从 JS 形状数据生成上面那份；`--check` 只比较 |
| `js/jelly-species-shapes.js` | 新建（UMD） | 形状数据 + `expand/parsePath/bounds/placement` |
| `desktop-reminder/jelly-species-painter.swift` | 新建（AppKit） | 把几何画出来（角色 → 颜色规则） |
| `desktop-reminder/jelly-appearance.swift` | 改 | `species` 字段与白名单解析 |
| `desktop-reminder/jelly-swim.swift` | 改 | `JellyTuning` 增 `sink/dragX/dragY` 与按物种取值；涟漪外圈参数 |
| `desktop-reminder/jelly-companion.swift` | 改 | 位姿增 `facing/pitch/stroke`，按物种选画法与锚点，标题/读屏 |
| `desktop-reminder/jelly-controller.swift`、`main.swift` | 改 | 回执 `appearance.species`、ping `jellySpecies`、菜单文字 |
| `desktop-reminder/build.mjs` | 改 | 编译清单加三个源文件 |
| `js/jelly-appearance.js`、`js/jelly-desktop.js` | 改 | `species` 设置、回执核对 |
| `settings.html`、`js/settings-jelly-appearance.js`、`css/settings-page.css` | 改 | “动物”一行与按所选动物画的示意图 |
| `test/…` | 改/新建 | 见各任务 |

---

### 任务 A1：`limbTone(u:)` 重构（水母数值不变）

**文件：** 改 `desktop-reminder/jelly-paint.swift`、`desktop-reminder/companion-selftest.swift`；测 `test/desktop-companion-logic.test.mjs`

**接口：** 产出 `JellyPaint.limbTone(u: CGFloat) -> JellyTint`；`tentacleTone(index:count:)` 对任意 index/count 返回与 `limbTone(u: count > 1 ? i/(count-1) : 0.5)` 相同的值。

- [ ] **步骤 1（红灯）**：自测里加检查——`limbTone(u:)` 对四种花纹在 u = 0、0.25、0.5、0.57、1 的期望值（纯色 a；双色 b；渐变 `a.mixed(b, 0.7)`；七彩 u<0.5 在 a→b、其余 b→c），以及“`tentacleTone` 与 `limbTone` 逐根一致”，并打印 `LIMB <用例序号> <u> <rgb>` 供 JS 对拍。编译应因 `limbTone` 不存在而失败。
- [ ] **步骤 2**：实现 `limbTone(u:)`，把 `tentacleTone` 改成委托；运行自测全部通过（含原有 683 项）。
- [ ] **步骤 3**：在 `js/settings-jelly-appearance.js` 导出 `limbTone(paint, u)`（与现有 `tentacles` 的 u=i/4 同规则），`test/desktop-companion-logic.test.mjs` 对拍 LIMB 行。
- [ ] **验收**：像素基线不受影响（本任务不改绘制）；`node --test test/desktop-companion-logic.test.mjs` 通过。

### 任务 A2：Chrome 侧 `species` 设置与回执核对

**文件：** 改 `js/jelly-appearance.js`、`js/jelly-desktop.js`；测 `test/jelly-appearance.test.js`、`test/jelly-appearance-desktop.test.js`

**接口：** `JellyAppearance.SPECIES = ['jelly','hammer','manta','turtle','whaleshark']`；`DEFAULTS.species = 'jelly'`；`normalize/resolve/set` 带 `species`；`resolve()` 的返回值多一个 `species`；`daily` 与 `rerollNow` 不改它。`JellyDesktop.appearanceStatus()` 在回执 `appearance.species`（缺省视为 `jelly`）与下发的 `species` 不一致时是 `unsupported`。

- [ ] **步骤 1（红灯）**：测试——默认 `jelly`；未知/非字符串回 `jelly`；`set({species:'x'})` 被拒绝；`resolve` 带 species 且不影响既有 44 个黄金样本的颜色花纹；`daily:true` 与 `reroll` 之后 species 不变；`set` 并发仍串行。桌面侧：请求 `hammer` 而回执只有 `{status:'ok'}` → `unsupported`；回执 `{status:'ok',species:'hammer'}` → `ok`；请求 `jelly` 而回执只有 `{status:'ok'}`（S1a 组件）→ `ok`。
- [ ] **步骤 2**：实现，测试通过。
- [ ] **验收**：`node --test test/jelly-appearance*.test.js` 通过。

### 任务 A3：Swift 物种模型、解析与回执

**文件：** 新建 `desktop-reminder/jelly-species.swift`（先只含 `JellySpecies`、`SpeciesRole`、`SpeciesView`），改 `jelly-appearance.swift`、`jelly-controller.swift`、`main.swift`、`build.mjs`、`companion-selftest.swift`、`test/desktop-companion-logic.test.mjs`

**接口：** `JellySpecies: String, CaseIterable`（`jelly/hammer/manta/turtle/whaleshark`）、`displayName`、`parse(Any?)`（未知回 `.jelly`）、`isAvailable`、`effective`；`JellyAppearance.species`；ping `jellySpecies`；回执 `appearance: {status:'ok', species: <effective>}`。

- [ ] **步骤 1（红灯）**：自测——五个 id 与名字、`parse` 的非法输入（数字、布尔、大小写不同、空串、数组）都回 `.jelly`、`JellyAppearance.parse` 带 species、`APPEARANCE` 行多一列；Node 对拍 `JellyAppearance.SPECIES` 与 Swift 的 `allCases`。
- [ ] **步骤 2**：实现；`main.swift` 回执与 ping；菜单标题与“收起…”按物种名；`build.mjs` 清单与测试里的清单同步。
- [ ] **验收**：自测、清单测试通过。

### 任务 A4：形状数据、生成器、解析器、包围盒与放置

**文件：** 新建 `js/jelly-species-shapes.js`、`desktop-reminder/gen-species.mjs`、`desktop-reminder/jelly-species-data.swift`（生成）；扩展 `jelly-species.swift`；测 `test/jelly-species-shapes.test.js`、`test/jelly-species-gen.test.mjs`、自测

**接口（JS）：** `SHAPES`、`AVAILABLE`（`jelly` + `SHAPES` 的键）、`expand(id)`（展开镜像与椭圆，得到只含 `M/L/C/Q/Z` 绝对命令的部件）、`parsePath(d)`（返回命令数组或 `null`）、`bounds(id, wave)`、`union(id)`。**接口（Swift）：** `SpeciesPath.parse(_:) -> [PathCommand]?`、`SpeciesGeometry.of(_:)`、`bounds(wave:)`、`union`、`SpeciesPlacement.center(_:)`。

- [ ] **步骤 1（红灯）**：JS 测试——形状数据的每个路径只含允许的命令且数字有限；镜像展开后坐标对称；`parsePath` 拒绝畸形输入（未知命令、缺数字、非有限数、不以 `M` 开头）；`bounds` 有限且在 91 pt 放置后离窗口边 ≥ 8。生成器测试——`gen-species.mjs --check` 与入库文件一致。自测——Swift 解析与包围盒打印 `SPEC <id> <wave> <minX> <maxX> <minY> <maxY>`，Node 与 JS 的 `bounds` 对拍（误差 < 0.01）；解析器对畸形输入返回 `nil`；放置后顶端 = 91 ± 0.5、水平居中 ± 0.5、五个相位 × 两种朝向离窗口边 ≥ 8、镜像后包围盒镜像一致。
- [ ] **步骤 2**：写小锤头鲨形状（俯视，缩放 0.89，来自草图），生成数据，实现解析、包围盒、放置。
- [ ] **验收**：三组测试通过；`AVAILABLE` 与 Swift `isAvailable` 的集合一致（自测打印 `AVAILABLE` 行，Node 对拍）。

### 任务 A5：朝向、俯仰、划水包络（纯逻辑）与调参

**文件：** 扩展 `jelly-species.swift`、`jelly-swim.swift`；测自测

**接口：** `SpeciesMotion.facingTarget(vx:current:)`（速度 < 12 pt/s 不翻面）、`advanceFacing(_:target:dt:)`（0.3 秒走完 −1…1）、`pitch(vx:vy:)`（`atan2(vy, max(|vx|,30))` 夹到 ±0.35）、`wave(contraction:)`、`advanceStroke(envelope:swimming:dt:)`；`JellyTuning` 增 `sink/dragX/dragY`；`JellyTuning.forStage(_:species:)`；`JellyRingMotion.ripples(time:reduceMotion:outer:)`。

- [ ] **步骤 1（红灯）**：自测——朝向滞回（12 pt/s 边界两侧、静止保持）、翻面时长、俯仰夹紧与符号、划水包络上升/衰减、`wave` 取值范围；`JellyTuning.forStage(stage)` 对水母的每个字段数值与重构前相同（钉死）；每种可用动物 × 每个阶段的纵向分布（沿用水母那组断言：不沉到泳线下、不越界、超过 60 点高度 < 5%、极少顶到上限、平均高度接近愿意停留的高度、会水平游动）；涟漪 `outer` 缺省与旧行为相同、给小值时所有圈的半径 ≤ outer。
- [ ] **步骤 2**：实现并按模拟结果定初值（数值写进代码注释说明来源）。
- [ ] **验收**：自测通过；水母的旧断言一条不改。

### 任务 A6：AppKit 绘制、放置与宿主接线

**文件：** 新建 `desktop-reminder/jelly-species-painter.swift`；改 `jelly-companion.swift`、`jelly-controller.swift`、`build.mjs`；测 隔离构建 + 截图

**接口：** `SpeciesPainter.draw(_ g: SpeciesGeometry, pose: JellyPose, cx: CGFloat, in ctx: CGContext)`；`JellyPose` 增 `facing/pitch/stroke`；`JellyCompanion` 按 `appearance.species.effective` 选画法、锚点、调参、标题与读屏标签。

- [ ] **步骤 1**：先实现 `limb/body/belly/shine/眼睛/腮红` 的角色规则（设计稿 §4），夜晚荧光、涟漪、睡觉标记按动物包围盒取位置，眼睛跟随与眨眼、警觉放大 1.3 倍。
- [ ] **步骤 2**：重建隔离构建，**先验证水母 4 张基线逐像素一致**（`appearance-snapshot.mjs --compare`），再拍小锤头鲨的亮/暗、四种花纹、睡着、响铃，看真实截图校准颜色与比例。
- [ ] **验收**：基线 4/4 一致；动物截图在亮/暗底都清楚，外圈 8 pt alpha ≤ 1（光晕与气泡阴影的既有验收口径）。

### 任务 A7：设置页“动物”一行与按所选动物画的示意图

**文件：** 改 `settings.html`、`js/settings-jelly-appearance.js`、`css/settings-page.css`；测 `test/jelly-appearance-settings.test.js`

**接口：** `<select id="set-jellySpecies">`（选项来自 `AVAILABLE`，带中文名）；`speciesSvg(id, resolved, palette)` 返回 SVG 字符串，示意图用 `<img id="set-speciesPreview">` 的 `data:` 地址显示（无 `innerHTML`）；水母仍用原来的静态 SVG。

- [ ] **步骤 1（红灯）**：测试——选项与 `AVAILABLE` 一致；选动物发 `jelly_appearance_set {species}`；`speciesSvg` 对四种花纹的颜色（身体渐变、肢体按位置取色）与 `paintOf/limbTone` 一致；`unsupported` 文案提到“动物”；源码绊线仍无 `innerHTML/fetch/eval`。
- [ ] **步骤 2**：实现并在 HTTP 预览里看版面（消息桥用真实 `js/jelly-appearance.js` 控制器）。
- [ ] **验收**：设置页测试通过；预览截图里卡片版面正常。

### 任务 A8：小锤头鲨端到端验证

- [ ] 纯逻辑自测、全量 `node --test`；
- [ ] 原生冒烟（独立 Bundle ID，**不跑真实鼠标阶段**）：`appearance-smoke.mjs` 增动物场景（下发 → 回执 `species` 回显；未下发/未知/不可用回水母；阶段色覆盖动物；响铃气泡尾巴不遮身体）；`jelly-smoke.mjs --no-mouse`、`bridge-smoke.mjs --no-mouse`；
- [ ] 语义渲染检查（采样点法，先用纯合成图验证检查器自己）：身体沿轴线 a→b→c、肢体按位置取色、描边取 b；
- [ ] 性能：沿用离屏计时（水母基线 0.219 ms/帧），小锤头鲨 × 4 花纹，上限参照水母七彩（约 +25.6%）；
- [ ] 变异检查（JS 解析/几何、Swift 纯逻辑、AppKit 绘制与锚点），只改 `/tmp` 副本，存活者逐个归类。

### 任务 A9：文档同步

- [ ] `docs/technical/jelly-appearance-20261017.md` 增“动物（Step A）”一节；设计稿状态；`AGENTS.md`（桌面水母形象条目）；`desktop-reminder/README.md`；`docs/technical/_index.md`；
- [ ] `git diff --check`、全量测试、分层验证报告（静态/业务替身/Swift 自测/隔离原生/语义渲染/变异/HTTP 预览/真实 Chrome 与真实账号分别写，未验收的如实列出）。

## 自检（对照设计稿）

- 设计稿 §1 目标：任务 A1–A6 覆盖；“水母逐像素一致”由 A6 步骤 2 守住。§3 接口：A3/A4；§4 颜色规则：A6；§5 锚点：A4（放置）+ A6（光晕、涟漪、z 标记）；§6 游动：A5；§7 设置与协议：A2/A3/A7；§8 验收：A8；§9 分期：本计划只含 Step A；§11 五条默认值：写进 Global Constraints。
- 与设计稿的两处实现差异（都在技术文档里写明）：① “按包围盒水平中心平移”改为放置函数运行时居中，而不是生成时平移——效果相同（镜像轴在包围盒中心），不需要生成器里重复一份几何运算；② 设置页的动物选择先用下拉（带中文名），缩略图卡片留到四种动物都齐了再做。
