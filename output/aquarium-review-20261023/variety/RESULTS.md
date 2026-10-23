# 水族馆“个体大小差异 + 6 种新小鱼”验收（浅礁 3D 的 Step A）

日期：2026-10-23。用户选了“两步都做：先渐进，验证后再做 3D 浅礁模式”、物种“6 种全加”、流程“我先写 spec/plan 后直接开工，每个任务给测试与截图证据，事后一并审阅”。本目录是 Step A（2D 渐进增强）的证据；**未提交 Git**；Step B（3D 浅礁）没有开始。实现、取值、与设计稿的差异和限制见[技术文档](../../../docs/technical/aquarium-variety-20261023.md)，设计稿 [spec](../../../docs/superpowers/specs/2026-10-23-aquarium-variety-design.md)，计划 [plan](../../../docs/superpowers/plans/2026-10-23-aquarium-variety.md)。

## 交付

- 11 种小鱼每条体长在标准值的 75%–125%（由条目 id 哈希决定，不存储、不消耗随机数，设置“个体大小差异”默认开，关闭时与改前逐位一致）。
- 新增青绿光鳃鱼、金花鲈、皇家伽玛、镰鱼、蝴蝶鱼、天竺鲷（没有 `diet`，不吃也不被吃），三个新画法特征 `twoTone`、`bars`、`sail`。
- 名单里有新种时存储写 `v:2`；旧版本读到会拒绝读写并保持数据不动。
- 托盘 15 个按钮（5 行）加最大高度与滚动；设置页文案补新名字；版本钉子同步。
- 水母、四种大鱼、捕食规则、黄金轨迹与原 8 种的每一笔画法不变。

## 检查结果

| 检查 | 结果 | 证据 |
|---|---|---|
| 改动前基线（`test/aquarium*.test.js test/marine-rig*.test.js`） | 607/607 | [tests-baseline.log](tests-baseline.log) |
| Task 1 个体大小（TDD） | RED（失败原因是 `Core.sizeOf` 不存在）→ 新测试 10/10；水族馆子集回归 617/617 | [red](tests-task1-red.log) / [green](tests-task1.log) / [回归](tests-task1-regression.log) |
| Task 2 控制器、宿主、设置页开关（TDD） | RED → 绿；回归 629/629 | [red](tests-task2-red.log) / [green](tests-task2.log) / [回归](tests-task2-regression.log) |
| Task 4 六个新种与三个画法特征（TDD） | RED（物种不存在）→ 22 项绿 | [red](tests-task4-red.log) / [green](tests-task4-green1.log) |
| Task 3 存储 v2（TDD；依赖 Task 4 的 `since`，按计划在其后实现） | RED → 26 项绿 | [red](tests-task3-red.log) / [green](tests-task3-green.log) |
| Task 4 之后的中间回归（**预期中的失败**） | 656 项 5 失败 → 660 项 1 失败：失败的都是尚未做“有意更新”的旧断言（物种数 9、饮食表文案、画法哈希遍历、`describeBlock` 的群居种文案）与设置页鱼名（Task 5 补）；没有一条是黄金轨迹 | [regression1](tests-task4-regression1.log) / [regression2](tests-task4-regression2.log) |
| Task 5 托盘、文案、钉子（TDD） | RED 3 项；GREEN 822/822。**第一次 GREEN 是 821/822**：漏了 `jellyfish-integration.test.js` 里数组形式的版本钉子 `['background-experience.js', 20]`，已改并重跑 | [red](tests-task5-red.log) / [第一次](tests-task5-green-attempt1.log) / [终态](tests-task5-green.log) |
| 水族馆子集终态 | 639/639（607 + 29 个新测试 + 3 个宿主接线测试） | [tests-aquarium-final.log](tests-aquarium-final.log) |
| 黄金门（`aquarium-core`、`aquarium-extras`、`aquarium-heavy-animals`、`aquarium-yaw`、`aquarium-school-regroup`、`aquarium-core-predation`、`aquarium-predation-core`） | 257/257，黄金轨迹、画法哈希、统计门槛没有改动 | [tests-golden-gates.log](tests-golden-gates.log) |
| 全量 `node --test --test-force-exit --test-concurrency=4 test/*.test.js test/*.test.mjs` | 3650/3650，约 113 秒；写完文档与证据之后又完整重跑一次，仍是 3650/3650（114 秒） | [tests-full.log](tests-full.log) / [tests-full-final.log](tests-full-final.log) |
| 回滚演练（git HEAD 的真实旧 `aquarium.js` 与 `aquarium-core.js` 读 `v:2` 名单） | 旧代码读到空名单、放入与捞出都 `{ok:false, reason:'storage'}`、存储写入 0 次、数据原样保留 | [rollback-check.log](rollback-check.log) |
| 单鱼绘制成本（Canvas 2D 方法调用数，14 种卡通画法） | 近处白天：新种 54–90 次，原有种 49–102 次；微秒数只是主线程记录成本的代理，不下性能结论 | [perf-draw.json](perf-draw.json) / [log](perf-draw.log) |

旧测试只做了“有意更新”（物种数 9→15、`v:2` 不再是未来版本而改用 `v:3` 夹具、画法哈希遍历固定的 8 个原有 id、版本钉子、设置页与托盘文案），每处文件内都写明“2026-10-23 有意更新”与原因，清单见技术文档；没有放宽任何黄金轨迹、画法哈希或统计门槛。

## 真实 Chrome 156 观察

环境：品牌版 Chrome 156.0.8078.48（`/Applications/Google Chrome.app`），无头，隔离临时配置，经 CDP `Extensions.loadUnpacked` 加载本目录（扩展 ID 与真实安装相同，存储是临时的；新种的运行预置 `v:2` 名单）；本机软件渲染，**不是用户自己的 Chrome 配置，也不是真实 GPU**。每次运行的 `console`、`pageerror`、`warnings` 都为空（各 `.json` 的 `issues` 字段），结束后没有残留的浏览器进程与端口。

- **个体大小**：11 个条目共 27 条鱼，开启时 27 个互不相同的大小，范围 [0.832, 1.236]，均值 1.035；白天与夜晚两次运行逐条相同（由条目 id 决定）；关闭时全部为 1。整页：[开](final-day-11small-sizes-on.png) / [关](final-day-11small-sizes-off.png) / [夜晚开](final-night-11small-sizes-on.png)；两个鱼群的开/关对比（标了每条的 `size` 与 `len`）：[sizes-on-off-schools.png](sizes-on-off-schools.png)。
- **新种近景**：DPR 2 的整页与每种鱼的裁剪：[白天](final-day-new6-dpr2.png) / [白天裁剪](final-day-new6-dpr2-crops.png) / [夜晚](final-night-new6-dpr2.png) / [夜晚裁剪](final-night-new6-dpr2-crops.png)。
- **托盘**：15 个按钮 5 行。12 个条目的最坏情况：1280×720 时面板 509 px 高、上沿离顶 81 px、不滚动（[图](tray-12entries-1280x720.png) / [裁剪](tray-12entries-1280x720-crop.png)）；视口高 560 时面板封顶 406 px、上沿离顶 24 px、内部滚动（[图](tray-12entries-1280x560.png) / [裁剪](tray-12entries-1280x560-crop.png)）；高 420 时封顶 266 px（[图](tray-12entries-1280x420.png) / [裁剪](tray-12entries-1280x420-crop.png)）。改动前 9 个按钮、8 个条目时面板 386 px 高（[before-tray-1280x720.png](before-tray-1280x720.png)）。数字在各 `.json` 的 `info.panel`。
- **物种图集**（卡通画法，只用于调美术）：`test/demos/aquarium-variety-preview.html`，需本地 HTTP。终稿代码下重新生成的两张：[近景（朝右 / 翻面）](atlas-new6-final-near.png)、[全部视角（近、翻面、夜晚、远处、转弯、六个摆尾相位、真实比例）](atlas-new6-final-all.png)。`atlas-new6-v4.png` 等旧图是校准过程中的版本（例如 v4 里天竺鲷还用纵纹，终稿改为尾柄黑带），不要当终稿看。
- 条目上限仍是 12：15 种不可能同时放满（原计划 6.3 的“15 种全放”因此改为 11 种小鱼各放一个条目共 27 条鱼，加托盘的 12 条目最坏情况）。

## 文件索引

终稿（审阅用）：`final-*`、`atlas-new6-final-*`、`sizes-on-off-schools.png`、`tray-*`、`rollback-check.log`、`perf-draw.*`、`tests-*.log`、`before-day-9species.*`（改动前整页）、`before-tray-1280x720.*`（改动前托盘）。

校准过程中的中间稿（不是最终外观，仅留作调美术的记录）：其余 `atlas-*`（图集，v1→v4、夜晚/远处/转弯与单种对照；`atlas-new6-final-*` 除外）、`pal-*` 与 `pal2-*`（镰鱼、蝴蝶鱼的色位对比：蝴蝶鱼最终选薄荷 + 黄 [4, 2]，镰鱼选黄 + 橙 [2, 1]）、`ref-tang-clown-angel.png`（原有鱼的画法参照）、`day-new6-*`（第一轮整页，美术校准之前）。

## 复现

`scripts/` 里是验收用的脚本（原先放在 `/tmp/aq-variety/`，不属于产品）：`lib.mjs`（隔离配置里启动真实 Chrome 并加载扩展，**playwright-core 取自 `/Users/liuqingwen/.hermes/hermes-agent/node_modules/`，换机器要改路径**）、`shot.mjs`（整页截图，环境变量 `TAG FISH SIZES HOUR VIEW TRAY SCHEMA DPR SECS HIDE`；壁纸取自 `/tmp/aq-variety/wall/`，未入库）、`gallery.mjs`、`crops.py`、`open-atlas.mjs`、`perf-draw.mjs`、`rollback-check.cjs`（`mkdir /tmp/aq-old && git archive HEAD js | tar -x -C /tmp/aq-old && node rollback-check.cjs /tmp/aq-old`；这里 HEAD 是本次改动之前的提交，所以**提交本次改动之后要把 HEAD 换成提交前的那个提交**，否则“旧代码”就是新代码，脚本会在 `oldCodeHasNewSpecies` 一项上报错；这条命令在写本文时重跑过，输出 `ROLLBACK_CHECK_OK`）。测试命令见上表与技术文档“验证”一节。

## 限制

- 新种美术观感**需要用户亲眼确认**（镰鱼的旗状背鳍与长丝、皇家伽玛的前后两色、天竺鲷尾柄的黑带、蝴蝶鱼的穿眼黑带）；`len`、`half`、颜色与 `SHAPES` 都是美术取值。
- `meters` 来自 3D 浅礁实验的默认值，**不是核实过的生物体长**，不称“真实体长”。
- 只在无头软件渲染 + 隔离配置里验过；用户自己的 Chrome 配置（重载扩展由用户做）、真实 GPU、长期帧耗时、触屏、多显示器都没验。
- Task 5 的 RED 日志是事后重建的（把新测试复制到 `/tmp` 副本，配上改动前版本的 css、设置页与首页再跑，3 项因正确的原因失败，副本已删除）；Task 1–4 的 RED 日志是实施时即时留的。
- 没有做变异检查（设计稿明确不在本步范围）。
- 个体大小“关→开”会重建世界，鱼位置重新散开一次。

## 安全自查

只改了本地水族馆的纯逻辑、画法、托盘样式与设置页开关；没有新增权限、依赖、网络或外部请求；设置值只在 `!== false` 的布尔口径下读取；存储仍只在用户放入/捞出时写，写入前读最新值，新数据白名单仍由 `normalizeEntries` 把守，`parseValue` 对未知版本数字继续拒绝写入；界面文字沿用既有的 `textContent` 路径；无鉴权/授权面变化。
