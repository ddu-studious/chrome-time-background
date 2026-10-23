# 水族馆“个体大小差异 + 6 种新小鱼”实现计划

> **给执行者：** 本项目禁止使用子代理（`AGENTS.md`、用户规则），所以按 `superpowers:executing-plans` 在当前会话里逐任务执行；每个行为按 `superpowers:test-driven-development` 先写失败测试、看到失败原因正确、再最小实现；完成前按 `superpowers:verification-before-completion` 用命令输出说话。步骤用 `- [ ]` 勾选。

> **执行状态（2026-10-23）：已按计划执行完毕，未提交 Git。** 与计划不同的地方：① 步骤 0.3 的预览页只做了物种图集，没有做“活水族馆”（整页观感由真实 Chrome 里加载扩展的整页截图覆盖）；② 步骤 6.3 的“15 种全放”做不到（条目上限 12，11 种小鱼加 4 种大鱼已是 15 个条目），改为 11 种小鱼各放一个条目（27 条鱼）加托盘的 12 条目最坏情况；③ Task 5 的 RED 日志是事后在 `/tmp` 副本上重建的；④ 6 个新种的 `half`、蝴蝶鱼色位、天竺鲷花纹、镰鱼背鳍轮廓在美术校准（4.6）后与设计稿不同，最终取值见技术文档。实际结果、验证数字与限制见 `docs/technical/aquarium-variety-20261023.md`，证据见 `output/aquarium-review-20261023/variety/RESULTS.md`。

**目标：** 水族馆的小鱼每条大小略有不同（默认开、可在设置里关）；托盘里多出青绿光鳃鱼、金花鲈、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷 6 种卡通小鱼；放入新种后存储写 `v:2`，旧版本不会因为看不懂而抹掉它们。水母、大鱼、捕食规则与所有黄金轨迹不变。

**设计稿：** `docs/superpowers/specs/2026-10-23-aquarium-variety-design.md`（用户 2026-10-23 已确认：两步都做、6 种全加、快速流程）。

**架构：** 核心 `js/aquarium-core.js` 只加三样纯逻辑——`sizeOf`（条目 id 的确定性哈希，不用随机数）、`world.sizes` 开关（默认关，关着时与原来逐位一致）、`storageVersionOf`（含新种写 v:2）；控制器 `js/aquarium.js` 只在三处接线（`frame` 的 `options.sizes`、`parseValue`/`mutate` 的版本、`SHAPES` 的新种与三个新画法特征）；宿主与设置页按 `aquariumPredation` 的现成模式加一个布尔开关。

**技术栈：** 原生 JavaScript（UMD 模块）、`node --test`、真实品牌版 Chrome 156（Playwright `launchPersistentContext` + CDP `Extensions.loadUnpacked`，沿用 `/tmp/aq-r2/lib.mjs` 的做法，脚本放 `/tmp/aq-variety/` 不入库）。

## Global Constraints

- 不提交 Git、不发布（用户未要求）；保留工作区里与本任务无关的未提交改动（3D 实验目录、`docs/` 里已有的修改）；`docs/technical/_index.md` 只追加一行。
- 水母一行不改；大鱼（小锤头鲨、海龟、蝠鲼、鲸鲨）的体长、画法、轨迹逐位不变；原有 9 种之间的相对顺序不变。
- 新选项默认关/缺省与改动之前逐位一致：`createWorld({sizes})` 默认 `false`；`frame` 只认 `options.sizes === true`；`consume` 只在 `world.sizes` 时给空缺加 `size`（`aquarium-core-predation.test.js` 钉着空缺形状 `{entry, species, due}`）。
- 不用 `world.random` 算个体大小（随机序列不变）；不存储个体大小；不新增权限、依赖、网络。
- 画法：深色细节只在 `source-over` 下画；远处（`z < 0.55`）与省流量不建渐变、不裁剪；旧形状没有新字段，旧种的每一笔不变（`aquarium-extras.test.js` 的哈希守住）。
- 存储：只有最初 9 种时写 `v:1`；含 `since: 2` 的种写 `v:2`；`parseValue` 接受 `v ∈ {1, 2}`，其他数字仍拒绝写入。
- 旧测试只在三处有意更新并写明原因：物种数量 9→15、`v:2` 不再是“未来版本”（改用 `v:3`）、画法哈希遍历改为固定的原 8 种。
- 变更完成后给一行安全自查，不虚构测试结论。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `js/aquarium-core.js` | 改 | `SIZE_RANGE`、`hash01`、`sizeOf`、`world.sizes`、`spawnGroup`/`enterOne`/`consume`/`refill` 保大小、6 个新种（`since: 2`）、`STORAGE_VERSIONS`、`storageVersionOf` |
| `js/aquarium.js` | 改 | `SHAPES` 6 个新形状；`twoTone`/`bars`/`sail` 三个画法特征；`frame` 的 `options.sizes`；`parseValue`/`mutate` 的存储版本 |
| `js/background-experience.js` | 改 | `aquariumSizes` 默认值、规范化、传给 `aq.frame` |
| `js/settings-page.js`、`settings.html` | 改 | 设置页开关与文案；“水族馆小鱼”“大鱼吃小鱼”文案补新种 |
| `css/aquarium.css` | 改 | `.aq-panel` 的 `max-height` + 滚动 |
| `index.html`、`settings.html` | 改 | `?v=` 钉子 |
| `test/aquarium-variety.test.js` | 新 | 本次全部新增行为的测试 |
| `test/aquarium-core.test.js`、`aquarium-core-predation.test.js`、`aquarium-predation-core.test.js`、`aquarium-extras.test.js`、`aquarium.test.js`、`aquarium-integration.test.js` 及其他钉 `?v=` 的测试 | 改 | 有意更新（见 Global Constraints） |
| `test/demos/aquarium-variety-preview.html` | 新 | 物种图集与活水族馆预览页（调美术与截图用，不被产品加载） |
| `docs/technical/aquarium-variety-20261023.md`、`docs/technical/_index.md`、`AGENTS.md` | 新/改 | 技术文档、索引一行、协作规范里的简短条目 |
| `output/aquarium-review-20261023/variety/` | 新 | 日志、截图与 `RESULTS.md` |

---

## Task 0：基线与取证

- [x] **0.1** 跑现状回归并留日志（改动前基线）：
  `node --test --test-force-exit --test-concurrency=4 test/aquarium*.test.js test/marine-rig*.test.js 2>&1 | tee output/aquarium-review-20261023/variety/tests-baseline.log`
  期望：全部通过（本会话已测得 607 项约 46 秒）。
- [x] **0.2** 复制 `/tmp/aq-r2/lib.mjs` 为 `/tmp/aq-variety/lib.mjs`，写 `/tmp/aq-variety/shot.mjs`：开隔离配置的真实 Chrome 156、加载本目录扩展、把设置 `visualEffect: jellyfish` 与一组鱼写进存储、打开 `index.html` 截整页；先截**基线**（9 种全放）存到 `output/aquarium-review-20261023/variety/before-*.png`。
- [x] **0.3** 写 `test/demos/aquarium-variety-preview.html`（图集：近/远 × 白天/夜晚；活水族馆：真实 `Aquarium.create` + 假存储，可切 `sizes`），用 `/tmp/aq-variety/gallery.mjs` 截图。预览页只在 `test/demos/`，产品不加载。

## Task 1：核心——个体大小（TDD）

**文件：** `js/aquarium-core.js`、`test/aquarium-variety.test.js`（新）

- [x] **1.1 写失败测试**（`test/aquarium-variety.test.js`）：
  - `sizeOf`：同一 id 两次相同；4000 个 id 全落在 `[0.75, 1.25]`、均值与 1 相差 < 0.01、最小 < 0.8 且最大 > 1.2、`|s−1| < 0.0625` 的数量 > `|s−1| > 0.1875` 的 3 倍（三角分布，理论比约 7）；同一条目的 5 个序号至少 4 个不同值；大鱼与 `null` 恒为 1；5 种原有小鱼的 `size` 都是 `[0.75, 1.25]`。
  - `createWorld`：默认 `sizes === false` 且每条鱼 `size === 1`；同一随机种子下 `sizes:true` 与关着的两个世界，**每条鱼的 `x/y/vx/vy/ang/z/phase/seed` 逐位相同**（没有消耗随机数），`len` 在开着时恰为 `关着的 len × f.size`，大鱼 `size === 1` 且 `len` 相同；关着时与不传 `sizes` 的世界逐位一致。
  - 补员：开着 `sizes`，对一条 `|size − 1| > 0.1` 的小丑鱼 `consume` 后跑到补员，新鱼 `size` 与原来相同、`len / size` 落在 `[0.7725, 1] × spec.len × scale`；关着时空缺形状仍是 `{entry, species, due}`；开着时空缺多一个 `size`。
- [x] **1.2** 运行，确认**因为 `Core.sizeOf` 不存在 / `size` 未定义而失败**（不是语法错）：`node --test test/aquarium-variety.test.js`。
- [x] **1.3 实现**（`js/aquarium-core.js`）：
  ```js
  // 个体大小：小鱼每条在 [lo, hi] 倍标准体长之间（世界开着 sizes 时才用）；没有 size 的（小锤头鲨、海龟、蝠鲼、鲸鲨按真实比例）恒为 1
  const SIZE_RANGE = Object.freeze([0.75, 1.25]);
  // 稳定的字符串哈希（FNV-1a 32 位 + 雪崩混合）→ [0, 1)：个体大小不用 world.random，随机序列不变，也不需要存储
  function hash01(text) {
      let h = 0x811c9dc5;
      for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
  }
  function sizeOf(entryId, index, spec) {
      if (!spec || !spec.size) return 1;
      const [lo, hi] = spec.size;
      const u = (hash01(`${entryId}|${index}|a`) + hash01(`${entryId}|${index}|b`)) / 2;     // 两次均匀取平均：以区间中点为中心的三角分布
      return lo + (hi - lo) * u;
  }
  ```
  五个原有小种加 `size: SIZE_RANGE`；`createWorld({ …, sizes = false })` 增加 `sizes: !!sizes`；`spawnGroup` 循环里 `const size = world.sizes ? sizeOf(item.id, i, spec) : 1; const len = lengthOf(world, spec, z) * size;` 并在鱼上加 `size`；`enterOne(world, entryId, speciesId, size = 1)` 里 `const scale = Number.isFinite(size) && size > 0 ? size : 1;`、`len = lengthOf(...) * scale`、鱼上 `size: scale`；`consume` 里 `const vacancy = { entry, species, due }; if (world.sizes) vacancy.size = Number.isFinite(fish.size) ? fish.size : 1;`；`refill` 调 `enterOne(world, v.entry, v.species, v.size)`；导出 `SIZE_RANGE, sizeOf`。
- [x] **1.4** 运行新测试通过；再跑 `node --test --test-force-exit --test-concurrency=4 test/aquarium-core*.test.js test/aquarium-heavy-animals.test.js test/aquarium-yaw.test.js test/aquarium-predation-core.test.js`，**黄金轨迹与旧测试一项不变**。把两次输出追加到 `output/aquarium-review-20261023/variety/tests-task1.log`。

## Task 2：控制器、宿主与设置页——个体大小开关（TDD）

**文件：** `js/aquarium.js`、`js/background-experience.js`、`js/settings-page.js`、`settings.html`、`test/aquarium-variety.test.js`

- [x] **2.1 写失败测试**：
  - 控制器（沿用 `test/aquarium.test.js` 的 `fakeChrome/makeDom/ctxProxy` 写法，在新文件里复制最小替身）：`frame({ sizes: true })` 建出的世界 `sizes === true` 且鱼 `size` 取自 `Core.sizeOf`；`frame({})`（没传）与 `frame({ sizes: false })` 的世界 `sizes === false`；同一帧序列里 `sizes` 由 `false` 变 `true` 重建世界，**同一个条目的同一条鱼大小等于 `sizeOf`**，再变回 `false` 时 `size` 全是 1。
  - 源码合同：宿主有 `aquariumSizes: true,`、`aquariumSizes: source.aquariumSizes !== false`、`sizes: this.settings.aquariumSizes`；设置页有 `aquariumSizes: true,`、`aquariumSizes: stored.aquariumSizes !== false`、`['set-bgAquariumSizes', 'aquariumSizes', element => element.checked]`、`aquariumSizes.checked = bgExperienceSettings.aquariumSizes`；`settings.html` 有 `id="set-bgAquariumSizes" checked`，标签是“个体大小差异”，说明含“75%”“125%”“不读也不写任何数据”“小锤头鲨、海龟、蝠鲼、鲸鲨保持真实比例”；水母文件（`js/jellyfish.js`、`js/jellyfish-core.js`）不出现 `aquariumSizes`。
- [x] **2.2** 运行确认失败（原因：世界没有 `sizes`、源码没有接线）。
- [x] **2.3 实现**：`frame` 里 `const sizes = options.sizes === true;`，建世界条件加上 `|| world.sizes !== sizes`，`createWorld({ …, sizes })`；`state()` 增 `sizes: world ? world.sizes : false`（验收诊断）。宿主与设置页按 `aquariumPredation` 的四处接线；`settings.html` 在“水族馆小鱼”之后加开关与文案。
- [x] **2.4** 通过；跑 `test/aquarium*.test.js test/background-experience*.test.js`，保存日志。

## Task 3：存储 v2 回滚保护（TDD）

**文件：** `js/aquarium-core.js`、`js/aquarium.js`、`test/aquarium-variety.test.js`、`test/aquarium.test.js`

- [x] **3.1 写失败测试**（核心）：`Core.STORAGE_VERSIONS` 恰为 `[1, 2]` 且冻结；`storageVersionOf` 对空名单、只有原 9 种、含任一新种、含未知种/坏项分别返回 1、1、2、（未知不计）。（控制器）：只放原有种 → 写 `v:1`；放入 `gramma` → 写 `v:2` 且名单含它；再把它捞出 → 写回 `v:1`；存储里是 `v:2` 且含新种时正常读出；`v:3`（未来版本）仍然拒绝写入且数据原样保留。
- [x] **3.2** 把 `test/aquarium.test.js` 里两处把 `v: 2` 当“未来版本”的夹具（约第 154、702 行）有意改为 `v: 3`，并在测试名/注释里写明“v:2 自 2026-10-23 起是含新种时的合法版本”。运行确认新测试因缺少 `STORAGE_VERSIONS` 而失败。
- [x] **3.3 实现**：
  ```js
  // 存储版本：名单里只有最初 9 种时写 v:1（旧版本照常读写）；含后来加入的种（since: 2）就写 v:2——旧版本遇到不认识的版本会拒绝写入，不会把新种从名单里抹掉
  const STORAGE_VERSIONS = Object.freeze([1, 2]);
  function storageVersionOf(entries) { /* 取名单里各种 since 的最大值，缺省 1 */ }
  ```
  `parseValue` 的拒绝条件改为 `typeof value.v === 'number' && !Core.STORAGE_VERSIONS.includes(value.v)`；`mutate` 写 `{ v: Core.storageVersionOf(outcome.entries), fish: outcome.entries }`。（`since: 2` 在 Task 4 随新种加入；本任务的测试先用测试里临时构造的名单与 `Core.speciesById('gramma')` 之前的失败来驱动，Task 4 后重跑。）
  **注意**：Task 3 与 Task 4 互相依赖（`since` 来自新种）。执行顺序为 Task 4 的 4.1–4.3 完成后再做 3.3 的实现，3.1 的测试在两者之间保持红色。
- [x] **3.4** 通过；日志追加。

## Task 4：六种新小鱼与三个画法特征（TDD）

**文件：** `js/aquarium-core.js`、`js/aquarium.js`、`test/aquarium-variety.test.js`、`test/aquarium-core.test.js`、`test/aquarium-core-predation.test.js`、`test/aquarium-predation-core.test.js`、`test/aquarium-extras.test.js`

- [x] **4.1 写失败测试**：
  - 物种表：共 15 种；新种 id 恰为 `chromis/anthias/gramma/idol/butterfly/cardinal`，名称与设计稿一致；`chromis`、`anthias` 是 `school` 且 `group === 5`，其余 `solo`；`since === 2` 仅新种；新种没有 `diet`、`gape`、`top`；`size` 为 `SIZE_RANGE`；`len ≥ round(meters × PX_PER_M) − 1`、`band`/`colors` 合法；**原有 9 种之间的相对顺序不变**，且大鱼排在最后。
  - 画法：`SHAPES` 恰有 14 个键（15 减海龟）；新形状满足 `aquarium-shapes.test.js` 的通用约束（5 个站位半宽 >0 且 <0.5、尾型合法）；`gramma.twoTone` 是 0.2–0.8 的数；`idol.bars` 两条、`butterfly.bars` 一条，每条 `[u, w]` 满足 `0<u<1`、`0<w<0.3`；`idol.sail === true`。
  - 绘制：`gramma` 近处用一次水平 `createLinearGradient` 且含三个以上色标；远处/省流量不建渐变；`idol`、`butterfly` 近处各有一次 `clip`，暗色 `fillRect` 在 `source-over` 下画（沿用 `tracer`），远处没有 `clip`；`idol` 近处多一条以 `quadraticCurveTo` 画的 `stroke`（长丝），远处没有；所有新种“种类 × 远近 × 省流量 × 翻面 × 被捞起”不抛错、`save/restore` 配对、没有非有限数。（`aquarium-shapes.test.js` 的现有循环会自动覆盖新种。）
- [x] **4.2** 运行确认失败（物种不存在）。
- [x] **4.3 实现**：在 `SPECIES` 里按设计稿 §3.2 插入 6 个新种（群居在前、单条随后；原有顺序不变），每个新种 `since: 2`、`size: SIZE_RANGE`；在 `SHAPES` 里加 6 个新形状与三个特征：
  ```js
  // 身体填充：皇家伽玛等“前后两色”的鱼——沿体长的水平渐变，分界处一小段过渡；远处平涂主色与点缀色的混合
  } else if (shape.twoTone) {
      const g = ctx.createLinearGradient(len * 0.5, 0, -len * 0.5, 0);
      const cut = clamp(shape.twoTone, 0.2, 0.8);
      g.addColorStop(0, rgba(mixColor(main, [255, 255, 255], 0.2), A * 0.85));
      g.addColorStop(cut - 0.06, rgba(main, A * 0.85));
      g.addColorStop(cut + 0.06, rgba(accent, A * 0.85));
      g.addColorStop(1, rgba(mixColor(accent, [255, 255, 255], 0.15), A * 0.75));
      ctx.fillStyle = g;
  }
  ```
  `bars`（在 `stripes` 之后；裁剪到身体、`source-over`、`fillRect`）与 `sail`（背鳍之后；`quadraticCurveTo` 长丝）按设计稿 §3.3 实现。
- [x] **4.4 有意更新旧测试**：`aquarium-core.test.js:30` 的物种表断言改为 15 种（固定的独立字面量名单）并保留各类断言；`aquarium-core-predation.test.js:47` 的 `9`→`15`（`expected` 字面量不变，新种的 `diet` 必须是 `undefined`）；`aquarium-predation-core.test.js` 的“9×9”标题改为“15×15”（`eats` 字面量不变：新种既不吃也不被吃）；`aquarium-extras.test.js` 两处遍历 `Core.SPECIES.filter(item => SHAPES[item.id])`——黄金哈希一处改为 `Object.keys(GOLD)`（原 8 种），拉尾一处保留遍历（新种也必须随 `pull` 改变画法）。
- [x] **4.5** 运行新测试与上述旧测试全部通过；再做 Task 3.3 的实现并跑 Task 3 的测试。日志追加。
- [x] **4.6 校准美术**：用预览页在真实 Chrome 里看 6 个新种的近/远、白天/夜晚、翻面与转弯，调 `half`、鳍高、颜色色位直到一眼能认出各自特征（皇家伽玛的前紫后黄、镰鱼的长丝与双黑带、蝴蝶鱼穿眼黑带、金花鲈的深叉尾、天竺鲷的圆胖与大眼、青绿光鳃鱼的纤细叉尾）；调整后重跑 `aquarium-shapes.test.js`。截图存证据目录。

## Task 5：托盘、设置页文案、版本钉子

**文件：** `css/aquarium.css`、`settings.html`、`index.html`、`test/aquarium-integration.test.js` 及钉 `?v=` 的测试

- [x] **5.1 写失败测试**：`aquarium-variety.test.js` 里：`css/aquarium.css` 的 `.aq-panel` 规则含 `max-height: calc(100vh - 154px)` 与 `overflow-y: auto`；“水族馆小鱼”说明含 6 个新名字（`aquarium-integration.test.js` 现有测试已按 `Core.SPECIES` 遍历，会自动失败于缺名字）；“大鱼吃小鱼”说明含 6 个新名字且写明“不参与”；`index.html` 与 `settings.html` 的新 `?v=`：`aquarium-core.js?v=8`、`aquarium.js?v=9`、`aquarium.css?v=7`、`background-experience.js?v=21`、`settings-page.js?v=20`。
- [x] **5.2** 运行确认失败。
- [x] **5.3 实现**：改 CSS、两处文案、`?v=`；批量更新所有钉旧 `?v=` 的测试（`grep` 出 `aquarium-core.js?v=7|aquarium.js?v=8|aquarium.css?v=6|background-experience.js?v=20|settings-page.js?v=19` 的全部位置逐个改，不改别的）。
- [x] **5.4** 通过。

## Task 6：全量验证、真实 Chrome 证据与文档

- [x] **6.1** 全量回归：`node --test --test-force-exit --test-concurrency=4 test/*.test.js test/*.test.mjs 2>&1 | tee output/aquarium-review-20261023/variety/tests-full.log`；期望：与改动前相比只多出本次新增测试，没有新增失败（与本改动无关的已知计时型偶发失败单独重跑核对，不放宽断言）。
- [x] **6.2** 黄金与统计门槛单独跑并留日志：`aquarium-core.test.js` 黄金轨迹、`aquarium-extras.test.js`、`aquarium-heavy-animals.test.js`、`aquarium-yaw.test.js`、`aquarium-school-regroup.test.js`（约 17 秒）。
- [x] **6.3** 真实 Chrome 156 截图（`/tmp/aq-variety/shot.mjs`，隔离配置）：整页白天/夜晚；15 种全放（含两群、四条单条）；托盘展开（1280×720 与 1280×560 两种窗口高度）；个体大小开/关各一张；`Aquarium._world().fish` 读回 `sizes`、`size` 分布与 `len`；`console.error`、`pageerror` 为空；做完核对没有残留浏览器进程。
- [x] **6.4** 写 `docs/technical/aquarium-variety-20261023.md`（实际落地、与设计稿的偏差、验证数字、限制、回滚），`docs/technical/_index.md` 追加一行，`AGENTS.md` 的水族馆条目加简短说明（存储 v2、`sizes` 选项口径、新种无 `diet`）；`output/aquarium-review-20261023/variety/RESULTS.md` 汇总日志与截图。
- [x] **6.5** 一行安全自查（鉴权/授权不涉及；无新增外部请求、权限、依赖；文案用 `textContent` 的既有路径；存储只在用户放入/捞出时写，写入前读最新值；新数据白名单仍由 `normalizeEntries` 把守）。

## 自审（计划）

- 设计稿 §3.1–§3.5 每一条都有任务与测试对应；Step B 没有出现在任何任务里。
- Task 3 与 Task 4 的依赖已在文内写明执行顺序，没有隐含假设。
- 所有“有意更新的旧测试”已逐项列出；除此之外不得改旧测试。
- 没有占位词；所有命令可直接执行。
