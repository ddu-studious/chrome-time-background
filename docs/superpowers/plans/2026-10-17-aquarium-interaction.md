# 水族馆「互动」实现计划：戳、拉鱼尾、喂食

> **给执行者：** 本仓库规则（`.cursor/rules/no-subagent.mdc`、`AGENTS.md`）禁止使用子代理，所以这份计划**只能在当前会话里按顺序逐步执行**（用 `superpowers:executing-plans`；不要用 `subagent-driven-development`）。步骤用复选框（`- [ ]`）跟踪。动手前先读完“先读这里”和“全局约束”。

**目标：** 在已有的水族馆（首页水母背景里放入、捞出小鱼）里加三种互动——点鱼“戳一下”、按住鱼的后半身拖动“拉鱼尾”、从托盘拖饲料或点击撒饲料“喂食”。三种都是纯视觉：不存储、不读写任务数据、不新增设置，水母不受影响。

**架构（规格里的路线 A）：** 两个新的纯模块 + 对现有文件的最小钩子。

- `js/aquarium-play-core.js`（新，纯逻辑，不碰 DOM 与存储）：涟漪、气泡、饲料、变亮记录、拉尾弹簧，以及戳 / 撒饲料 / 拉尾的规则；
- `js/aquarium-play.js`（新）：涟漪、饲料、气泡的画法，和托盘里的“喂食”按钮（拖出饲料、点击撒饲料、键盘）；
- `js/aquarium-core.js`：只多两个钩子——吸引点（`Core.step` 的 `attractors`）和尾端抓取（`Core.grab` 的 `tail` 选项），外加导出 `cruiseSpeed`；不传新参数时行为与改动之前逐位一致；
- `js/aquarium.js`（控制器）：接线——手势分流、画图顺序、玩法层异常隔离（只关闭玩法层，鱼的游动、抓取、捞出不受影响）；
- 宿主 `js/background-experience.js` 与水母文件**不改**。

**技术栈：** 原生 JavaScript（UMD：`node --test` 里是 CommonJS，浏览器里是全局）、Canvas 2D（复用背景体验的共享画布，宿主仍是唯一的 RAF）；没有新增依赖、权限、网络或 CDN。

**规格：** `docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md`（含 §11“写实现计划时对本规格的修正”，请先读那一节）。

**工作树：** `~/worktrees/ctb-aquarium`，分支 `feat/aquarium-20261017`。所有水族馆改动都**未提交、未合并**；原工作区（`chrome-time-background`）保持不动，另外两条 worktree 也不碰。

---

## 先读这里：这份计划的来历、验证过什么、没验证什么

1. **代码从哪来。** 规格确认后，我没有直接写仓库，而是在 `/tmp/aq-plan/` 的副本里把全部代码按 TDD 先写完并验证了一遍（先写会失败的测试、看它红、再写实现、看它绿，每一步的真实红绿输出都存了档）。本计划里的每个代码块都由脚本从那份验证过的文件**原样生成**（新文件给完整内容，已有文件给 `diff -u` 差异），不是手抄。**仓库里现在没有任何这个子项目的功能代码**——是你批准这份计划之后才会写进去。
2. **计划重放。** 计划生成后，我在一份干净的 worktree 副本（`/tmp/aq-replay/tree`）上，**只按计划里的步骤**写文件、套差异、跑命令，并把计划里写下的期望逐项对一遍：套差异 13 处、写文件 24 个（5 个仓库文件 + 19 个 `/tmp` 脚本）、核对计划写下的期望 44 处（每个任务的红绿 `tests/pass/fail` 计数、失败名单与“本来就通过”名单、错误里的关键文字、每个检查点的 `diff -rq` 输出、两次全量套件、预览服务的四个状态码）；13/13 个仓库文件与验证过的最终文件逐字节一致，19 个脚本与原件逐字节一致；**最后一遍重放没有发现任何问题**。另外按附录 B 写的方法把小工具从计划里取出来（与源文件逐字节相同），在另一份干净副本上逐个套用了 20 个带代码块的步骤（含附录 A），得到的文件树与手工重放逐字节一致。前几遍重放（含 Task 9 的真实 Chromium 部分）抓到并改正了计划里的三处错误：① Task 1 的全量基线命令用 `tail -12` 看不到汇总行；② Task 9 Step 3 的 `curl` 带多个网址时 `-o /dev/null` 只管第一个，其余网址的网页内容会打到屏幕上；③ 抓取试验在最终版上只剩 4–7 次有效样本（脚本会按到页面按钮、点一下鱼又变成了“戳”而吓跑别的鱼），已改脚本并给 `judge.mjs` 加了“样本 ≥ 20”的检查。
3. **测试数字。** 水族馆相关 7 个测试文件：改动之前 4 个文件 112 项 → 完成后 205 项（新增 93 项）。全量 `node --test`（在 `/tmp` 副本里挂上 `local-ai/node_modules`，因为 worktree 本身没装 `local-ai` 依赖）：改动之前 2508 项通过 2477，完成后 2601 项通过 2570（多出的 93 项就是新增测试）。两次都是 31 项失败，**失败集合逐项相同**：30 项是 `compute.run` 沙箱相关的测试、1 项是 `test/youtube-home.test.mjs`，在改动之前就存在，原因我没有追查，与本改动无关。
4. **变异检查。** 只改 `/tmp` 里的副本。一共 308 个变异体，抓到 302 个，存活 6 个（play-C：不判被抓、不判 held 状态；wire：disablePlay 可重复、endTail 不清标记、endTail 不看 playOn、endTail 不看 play；逐个判断见 Task 9 Step 8）。逐个存活者的判断（等价还是漏测）在 Task 9 的“变异检查”一步里列出，脚本在附录 A。写原型时还发现过一个**空转的测试**（60 秒随机拉尾测试因为没有断言“真的发生过拉尾”而什么都测不到），已改成带存活断言的版本，计划里的是修正后的。
5. **真实 Chromium 的数字来自 `/tmp` 里的副本，不是仓库代码的验收。** 原型阶段在无头 Chromium（软件渲染）里跑过；计划写好后，又在“按计划重放出来的文件树”上把 Task 9 的整套实测（Step 3–6）完整跑了一遍：`judge.mjs` 38/38 项全部通过（戳 8 个种类、拉尾 6 个种类、喂食两个种子、网兜前后半身、耗时、亮背景、整缸打转、抓取试验）。截图我只看了有代表性的几张（戳：小丑鱼 120 ms；拉尾：小丑鱼拖动与松手；喂食：2.5 秒；网兜：后半身拖入；亮背景），与 Step 7 的描述一致，其余没有逐张看。这一部分是在更早一遍重放出来的文件树上跑的；之后的重放又把同样的文件树重建了几次（13 个仓库文件与 19 个脚本每次都逐字节相同），所以没有为每一遍重放都再跑一次 16 分钟的全套。大型鱼（蝠鲼、鲸鲨）常被任务条或水母挡住而按不到，所以它们用 `AQ_MEMOS=0 AQ_SPECIES=manta,whaleshark` 单独补测，Task 9 Step 5 已把这两条补测命令写进去。**Task 9 要在仓库里的真实代码上把这些全部重做一遍**，并以那时的结果为准（Task 9 的表格里有我在重放树上测到的参考值，用来判断你的数字是否在同一量级）。
6. **对规格的修正（请你知悉）。** 写计划时发现规格里有 12 处与已验证的原型不一致，已改在规格 §11 并改回正文各节；第 1–3 节你确认过的行为设计没有变。最值得知道的几处：`aquarium-play-core.js` 依赖 `AquariumCore`（原写“无”）；核心改动不止吸引点，还要导出 `cruiseSpeed`、给 `grab` 加 `tail` 选项并加 `HOLD_PV_RATE`——拉尾时鱼的位置和朝向归核心管，只有尾巴的拉伸是画法；涟漪半径 `RIPPLE_R` 与推开范围 `SHOCK_R` 分成两个参数；窗口尺寸变化时饲料、涟漪、泡按比例缩放而不是清掉；接口定稿（`create()` 无参数、`step(play, world, dtMs)`、`beginHold(play, world, fish)`、`endHold(…, { quiet })`、绘制拆成 `drawBack`/`drawFront`）；几个参数改了名或初值（`ATTRACT_W` 1.5→2.5、`TAIL_LX`→`TAIL_ZONE` 等）；控制器的玩法层可注入、有 `playGuard`/`disablePlay` 与 `state().playFailed`；新增 `test/aquarium-extras.test.js`；设置页说明多一句互动描述；任务顺序是画法模块先于控制器接线。这些是让文字与可运行的代码一致，不是设计变更。
7. **没验证的。** 品牌版 Chrome 156 里的真实扩展、真实 GPU 与长期占用、触摸屏、VoiceOver 朗读、真实壁纸叠加观感（亮背景只用合成的浅色底验证过）、真实任务数据、真实账号。原型里已经看到的弱点：亮背景下涟漪偏淡、气泡几乎看不见（饲料清楚）；成群小鱼按中率随种子波动（改动之前同样如此，不是回归）；大型鱼的拉尾拉伸量受限于体长上限（鲸鲨只拉到上限的约 40%）。

## 全局约束（每个任务都适用）

- **不新增权限、网络、依赖、CDN。** 新文件里不得出现 `innerHTML`、`insertAdjacentHTML`、`eval`、`fetch`、`XMLHttpRequest`、`localStorage`、`chrome.storage`、自建 RAF / 定时器 / 画布；`test/aquarium-integration.test.js` 的源码合同测试守住（Task 8）。
- **玩法状态不存储。** 不写 `aquariumV1`，不新增任何存储键，不读写任务、备忘录、设置；水母代码里不得出现“鱼”，水母不受任何影响，抓取优先级仍是水母先于鱼。
- **宿主不改。** `js/background-experience.js`、`js/jellyfish*.js` 不动；鱼层仍画在共享画布上、先于水母；宿主仍是唯一的 RAF。
- **手势边界。** 点一下鱼（没拖动）只是“戳”，**不吞 `click`**；拖过 6 px 才算拖；按住非成群鱼的后半身是“拉尾”，前半身仍是原来的抓取；空白水面的点击与原来一样。成群小鱼（霓虹灯鱼、蓝吊）不做拉尾。
- **玩法层出错只关玩法层。** 任何玩法层异常都走 `disablePlay`（只关闭玩法层，`state().playFailed` 为真），鱼的游动、抓取、捞出照常；没有新开关，玩法层跟随已有的 `aquariumFish` 开关。
- **TDD 铁律。** 每个任务先写测试、看它按预期的原因红（输出与本计划写的对得上）、再写实现、看它绿；不要先写实现。红绿结果以真实输出为准，不要凭记忆写“通过”。
- **变异检查只改 `/tmp` 里的副本**，不得原地改仓库文件；比较失败名前先去掉形如 `(0.56ms)` 的耗时。
- **不提交、不合并、不发布**，除非你（用户）明确要求。每个任务末尾的“建议提交点”只是个参考，不执行。
- **预览服务用完就关。** Task 9 起的两个本机 HTTP 服务（8791、8792）收尾时必须关掉。
- **分层报告验证结果**：静态检查 / 业务替身（node 测试）/ HTTP 预览里的真实 Chromium / 真实 Chrome 156 / 真实账号，各层分开写，没跑的层不写“通过”。
- 交互用中文，代码标识符除外；最后一句话给出安全自查（对照基线：认证与授权、外部请求、注入与输出编码、文件与反序列化、秘密与日志、资源限制）。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `js/aquarium-core.js` | 修改 | 吸引点（`step` 的 `attractors`）、尾端抓取（`grab` 的 `tail`）、导出 `cruiseSpeed`；不传新参数时与旧行为逐位一致 |
| `js/aquarium-play-core.js` | 新建 | 玩法纯逻辑：`create/resize/counts/poke/sprinkle/attractors/extrasOf/isTailZone/beginHold/endHold/step`，状态只在内存 |
| `js/aquarium-play.js` | 新建 | `drawBack/drawFront`（涟漪、饲料、气泡）、`mountFeed`（托盘里的喂食按钮：点击、拖出、键盘） |
| `js/aquarium.js` | 修改 | 画法钩子（`spineOf` 的 `pull`、`drawFish` 的 `extras`、变亮光晕）；接线（手势分流、画图顺序、玩法层隔离、喂食行） |
| `css/aquarium.css` | 修改 | 喂食按钮、一句用法提示、拖出去的饲料拖影 |
| `index.html` | 修改 | 两个新脚本的加载顺序与 `?v=` 钉子 |
| `settings.html` | 修改 | 设置页“水族馆小鱼”说明里加互动的描述 |
| `test/aquarium-core.test.js` | 修改（追加） | 钩子的测试（含两个取自改动前代码的黄金轨迹钉子） |
| `test/aquarium-play-core.test.js` | 新建 | 玩法核心测试 |
| `test/aquarium-extras.test.js` | 新建 | 画法钩子测试 |
| `test/aquarium-play.test.js` | 新建 | 画法与喂食按钮测试 |
| `test/aquarium.test.js` | 修改（追加） | 控制器接线测试 |
| `test/aquarium-integration.test.js` | 修改（追加） | 宿主接线、脚本顺序、源码合同、样式类名 |
| `docs/technical/aquarium-20261017.md`、`AGENTS.md`、`docs/technical/_index.md` | 修改 | Task 9：新增 §6、水族馆条目、索引 |

## 通用命令

在 worktree 根目录执行：

```bash
cd ~/worktrees/ctb-aquarium
# 水族馆相关的全部测试（完成后应是 205 项）
node --test test/aquarium-core.test.js test/aquarium-play-core.test.js test/aquarium-extras.test.js test/aquarium-play.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

与“改动之前”对照用的快照 `/tmp/aq-base` 在 Task 1 的第一步建立。**每个任务结束时**，用下面的命令核对“相对快照到底改了哪些文件”（比 `git status` 可靠，因为 worktree 里还有前几轮未提交的水族馆改动）：

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

**套用代码块。** 本计划的 `diff` 块与“写入 …（完整文件）”块可以用小工具 `/tmp/aq-apply.py` 原样套到工作树，免得手抄几千行代码时抄错（从本计划里取出它的方法和用法见附录 B；每个带代码块的步骤标题下面都有写好的命令，也可以照着块手工写）。工具只写文件；跑测试、核对期望输出、判断红绿仍然是你每一步都要做的事。

---

## Task 1：核心钩子（吸引点、尾端抓取、`cruiseSpeed`）

**目标。** 让玩法层不用改核心游泳逻辑，就能 ① 给鱼一个“被吸引”的目标（喂食），② 以“抓住后半身”的方式抓鱼并让被抓着的鱼头朝远离指针运动的方向（拉尾），③ 取得鱼的巡航速度（戳与冲击按它换算）。**不传 `attractors`、不带 `tail` 选项时，行为与改动之前逐位一致**——两个“黄金轨迹”测试守住这一点，它们的期望值（哈希）是在**改动之前的代码**上取的。

**Files:**
- Modify: `js/aquarium-core.js`
- Modify（末尾追加）: `test/aquarium-core.test.js`

**Interfaces:**
- Consumes: 现有 `Core.step / grab / release / hitTest / PARAMS`。
- Produces:
  - `Core.step(world, dtMs, { pointer, bells, attractors })`：`attractors` 可省略，形如 `[{ x, y, reach, weight, boost }]`；数字不是有限值或 `reach ≤ 0` 的整项丢弃，`weight` 夹在 0–3、`boost` 夹在 0.5–2.5；每条鱼只朝范围内最近的一个吸引点走，靠近时按 `boost` 加速（总速度仍受 `FLEE_CAP` 限制）。
  - `Core.cruiseSpeed(world, fish) → number`（px/s；未知种类为 0），原来 `stepFish` 里的同一个公式，现在导出并复用。
  - `Core.grab(world, fish, x, y, { tail: true }?) → boolean`：带 `tail: true` 时 `fish.held = { ox, oy, tail: true, gx, gy, lastX, lastY, pvx, pvy }`（被抓点留在指针下，鱼头朝远离指针平滑速度的方向）；不带时 `fish.held.tail === false`，其余字段沿用原来的。
  - `Core.PARAMS.HOLD_PV_RATE = 10`（指针速度平滑的速率，1/s）。

- [ ] **Step 1: 建快照并跑基线**

快照 `/tmp/aq-base` 是整个计划里“改动之前”的唯一参照（Task 9 还会在 8792 端口用它起一份旧版预览），**必须在改任何文件之前建**。

```bash
rsync -a --exclude .git --exclude node_modules --exclude output --exclude videos ~/worktrees/ctb-aquarium/ /tmp/aq-base/
cd ~/worktrees/ctb-aquarium
node --test test/aquarium-core.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

期望（输出末尾的三行）：

```text
ℹ tests 112
ℹ pass 112
ℹ fail 0
```

再记一下全量基线（worktree 里没装 `local-ai` 依赖，直接跑会有 80 个“缺依赖”的失败，所以在副本里挂上原工作区的依赖）：

```bash
rm -rf /tmp/aq-base-full && rsync -a /tmp/aq-base/ /tmp/aq-base-full/
ln -s /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/local-ai/node_modules /tmp/aq-base-full/local-ai/node_modules
(cd /tmp/aq-base-full && node --test test/*.test.js test/*.test.mjs > /tmp/aq-suite-base.txt 2>&1)
rg '^ℹ (tests|pass|fail) ' /tmp/aq-suite-base.txt
```

期望（约半分钟）：

```text
ℹ tests 2508
ℹ pass 2477
ℹ fail 31
```

这 31 个失败在改动之前就存在（30 项是 `compute.run` 沙箱相关的测试，1 项是 `test/youtube-home.test.mjs`；原因没有追查，与本改动无关），**不要去修**；后面 Task 9 按“失败集合不变”的口径对照。输出存在 `/tmp/aq-suite-base.txt` 里，Task 9 要用。

- [ ] **Step 2: 先写测试（追加到 `test/aquarium-core.test.js` 末尾）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 1 2`（用法见附录 B；也可以照着下面的块手工写）。

下面是相对当前文件的差异（只在末尾追加 15 个测试，不改已有测试）：

```diff
--- a/test/aquarium-core.test.js
+++ b/test/aquarium-core.test.js
@@ -723,4 +723,237 @@
         return w.fish.map(f => [f.x.toFixed(4), f.y.toFixed(4), f.scoopT.toFixed(4)].join()).join('|');
     };
     assert.equal(trace(), trace());
+});
+
+// ---------- 互动子项目（戳、拉尾、喂食）对核心的三处小改动 ----------
+// 改动之前先钉住现状：没有玩法输入时，游动必须与改动之前一致（黄金数字取自改动之前的核心）。
+
+const GOLDEN_SPECIES = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'];
+function goldenSwim(input = {}) {
+    const w = world({ random: seeded(11) });
+    Core.reconcile(w, GOLDEN_SPECIES.map((species, i) => ({ id: `g${i}`, species, addedAt: 1 })), { instant: true });
+    const bells = [{ x: 640, y: 360, r: 70 }];
+    for (let i = 0; i < 400; i++) {
+        const t = i * 0.05;
+        const pointer = i % 40 < 20 ? { x: 300 + 200 * Math.cos(t), y: 300 + 150 * Math.sin(t * 1.3) } : null;
+        Core.step(w, 50, Object.assign({ pointer, bells }, input));
+    }
+    return w;
+}
+const snapshot = w => JSON.stringify(w.fish.map(f => [f.x, f.y, f.vx, f.vy, f.ang, f.flip]));
+const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} ≠ ${expected}`);
+
+test('黄金轨迹：没有吸引点时，8 种鱼 20 秒后的位置、速度、朝向与改动之前一致（互动子项目不得改变现有游动）', () => {
+    const w = goldenSwim();
+    assert.equal(w.fish.length, 16);
+    const gold = {
+        g0: [705.344486133521, 588.2347657994214, 65.14135651571006, 19.42880201542292, -5.980011358017851],
+        g2: [345.43035968153856, 489.02791584275315, 28.180906534799124, -24.612685108283955, 11.8368789206577],
+        g5: [224.88224393111503, 402.22460528978957, 48.7691695714345, -9.270831817105435, 12.325458801927024],
+        g7: [230.27177569410733, 397.94394729097576, 9.20894274624747, -18.955318066811326, 5.151750429387654],
+    };
+    for (const [entryId, expected] of Object.entries(gold)) {
+        const f = w.fish.find(item => item.entry === entryId);
+        ['x', 'y', 'vx', 'vy', 'ang'].forEach((key, i) => near(f[key], expected[i], `${entryId}.${key}`));
+    }
+    near(w.fish.reduce((a, f) => a + f.x + f.y + f.vx + f.vy + f.ang, 0), 17469.65719267365, '全部鱼的总和');
+});
+
+test('黄金轨迹：普通抓取（不是拉尾）时，被抓着的鱼的位置、速度与朝向与改动之前一致', () => {
+    const w = world({ random: seeded(5) });
+    Core.reconcile(w, [entry('hammer', { id: 'h0' })], { instant: true });
+    const f = w.fish[0];
+    f.x = 400; f.y = 300; f.vx = 0; f.vy = 0; f.ang = 0.3; f.alpha = 1; f.state = 'alive';
+    assert.equal(Core.grab(w, f, 400, 300), true);
+    for (let i = 0; i < 40; i++) Core.step(w, 50, { pointer: { x: 400 + i * 12, y: 300 - i * 4 }, bells: [] });
+    [['x', 862.8571428571429], ['y', 145.71428571428572], ['vx', 239.99999999999955], ['vy', -80.00000000000011], ['ang', -0.3217505530114353], ['flip', 1]]
+        .forEach(([key, expected]) => near(f[key], expected, key));
+});
+
+test('cruiseSpeed：种类速度 × 视口缩放 × 深度系数；未知种类为 0', () => {
+    const w = world();
+    Core.reconcile(w, [entry('clown')], { instant: true });
+    const f = w.fish[0];
+    near(Core.cruiseSpeed(w, f), Core.speciesById('clown').speed * w.scale * (1 - P.Z_SPEED + P.Z_SPEED * f.z), 'cruise');
+    assert.equal(Core.cruiseSpeed(w, { species: 'kraken', z: 1 }), 0);
+});
+
+const lone = (species, seed = 3) => {
+    const w = world({ random: seeded(seed) });
+    Core.reconcile(w, [entry(species)], { instant: true });
+    const f = w.fish[0];
+    f.x = 500; f.y = 400; f.alpha = 1; f.state = 'alive';
+    return { w, f };
+};
+const lure = (x, y, extra = {}) => Object.assign({ x, y, reach: 400, weight: 2.5, boost: 1.5 }, extra);
+
+test('吸引点：没有、为空或全是坏数据时轨迹与没有玩法时逐位一致；远在范围外的吸引点同样不起作用', () => {
+    const base = snapshot(goldenSwim());
+    const bad = [undefined, [], null, 'x', [null], [{}], [{ x: NaN, y: 1, reach: 1, weight: 1, boost: 1 }], [{ x: 1, y: 1, reach: 0, weight: 1, boost: 1 }], [{ x: 1, y: 1, reach: -5, weight: 1, boost: 1 }]];
+    for (const attractors of bad) assert.equal(snapshot(goldenSwim({ attractors })), base, JSON.stringify(attractors));
+    const a = lone('clown');
+    const b = lone('clown');
+    for (let i = 0; i < 100; i++) { Core.step(a.w, 50, {}); Core.step(b.w, 50, { attractors: [lure(5000, 5000)] }); }
+    assert.equal(snapshot(a.w), snapshot(b.w));
 });
+
+test('吸引点：范围内的鱼被拉向它——8 个种子里 10 秒内都游到离它不到一个体长的地方，没有吸引点的对照组做不到', () => {
+    let reached = 0;
+    let controlReached = 0;
+    for (let seed = 1; seed <= 8; seed++) {
+        const t = lone('clown', seed);
+        const c = lone('clown', seed);
+        let best = Infinity;
+        let bestControl = Infinity;
+        for (let i = 0; i < 200; i++) {
+            Core.step(t.w, 50, { attractors: [lure(700, 400)] });
+            Core.step(c.w, 50, {});
+            best = Math.min(best, Math.hypot(t.f.x - 700, t.f.y - 400));
+            bestControl = Math.min(bestControl, Math.hypot(c.f.x - 700, c.f.y - 400));
+        }
+        if (best < t.f.len) reached++;
+        if (bestControl < t.f.len) controlReached++;
+    }
+    assert.equal(reached, 8, `8 个种子里只有 ${reached} 个游到了吸引点`);
+    assert.ok(controlReached <= 2, `对照组有 ${controlReached} 个碰巧也到了，这个测试不能证明吸引`);
+});
+
+test('吸引点：靠近时游得更快（boost 放大期望速度），瞬时速度不超过 巡航速度 × FLEE_CAP', () => {
+    const { w, f } = lone('clown', 2);
+    const cruise = Core.cruiseSpeed(w, f);
+    let sum = 0;
+    let max = 0;
+    for (let i = 0; i < 40; i++) {
+        Core.step(w, 50, { attractors: [lure(900, 400, { reach: 600 })] });
+        const s = Math.hypot(f.vx, f.vy);
+        sum += s;
+        max = Math.max(max, s);
+    }
+    assert.ok(sum / 40 > cruise * 1.15, `前 2 秒平均速度 ${sum / 40} 应明显高于巡航 ${cruise}`);
+    assert.ok(max <= cruise * P.FLEE_CAP + 1e-6, `速度 ${max} 超过上限`);
+});
+
+test('吸引点：权重夹在 0–3、速度倍数夹在 0.5–2.5，夸张的数字不放大', () => {
+    const run2 = attractor => {
+        const { w } = lone('puffer', 6);
+        for (let i = 0; i < 120; i++) Core.step(w, 50, { attractors: [attractor] });
+        return snapshot(w);
+    };
+    assert.equal(run2(lure(800, 380, { weight: 99 })), run2(lure(800, 380, { weight: 3 })));
+    assert.equal(run2(lure(800, 380, { boost: 99 })), run2(lure(800, 380, { boost: 2.5 })));
+    assert.equal(run2(lure(800, 380, { boost: 0 })), run2(lure(800, 380, { boost: 0.5 })));
+    assert.equal(run2(lure(800, 380, { weight: -4 })), run2(lure(800, 380, { weight: 0 })));
+});
+
+test('吸引点：同时有几个在范围内时，朝最近的那个游（与它们的先后顺序无关）', () => {
+    const toward = order => {
+        const { w, f } = lone('clown', 5);
+        const near1 = lure(650, 400);       // 150 px
+        const far1 = lure(500, 700, { reach: 600 });   // 300 px，在另一个方向
+        for (let i = 0; i < 40; i++) Core.step(w, 50, { attractors: order ? [near1, far1] : [far1, near1] });
+        return { dNear: Math.hypot(f.x - 650, f.y - 400), dFar: Math.hypot(f.x - 500, f.y - 700) };
+    };
+    for (const order of [true, false]) {
+        const r = toward(order);
+        assert.ok(r.dNear < 80 && r.dFar > 250, `顺序 ${order}：离近的 ${r.dNear.toFixed(0)}，离远的 ${r.dFar.toFixed(0)}`);
+    }
+});
+
+test('吸引点只拉游着的鱼：离开中的鱼不受影响，被抓着的鱼只跟指针', () => {
+    const leaving = attractors => {
+        const { w } = lone('clown', 9);
+        Core.dismiss(w, w.fish[0].entry);
+        for (let i = 0; i < 4; i++) Core.step(w, 50, { attractors });
+        return snapshot(w);
+    };
+    assert.equal(leaving([lure(520, 400)]), leaving(undefined));
+    const held = attractors => {
+        const { w, f } = lone('clown', 9);
+        assert.equal(Core.grab(w, f, 500, 400), true);
+        for (let i = 0; i < 20; i++) Core.step(w, 50, { pointer: { x: 520, y: 380 }, attractors });
+        return snapshot(w);
+    };
+    assert.equal(held([lure(900, 400)]), held(undefined));
+});
+
+// 拉尾几何：鱼在 (600, 300) 朝东，抓它后半身（尾巴在西侧）的一点（本地 y 偏移 ly 个体长），再沿 axis 方向、按 dir 的正负拖约 200 px/s，最后让指针停住一会儿。
+function dragTail(options, dir, { seed = 4, ly = 0, axis = 'x', still = 20 } = {}) {
+    const { w, f } = lone('hammer', seed);
+    f.x = 600; f.y = 300; f.vx = 0; f.vy = 0; f.ang = 0; f.flip = 1; f.flipTo = 1;
+    const gx0 = f.x - f.len * 0.3;
+    const gy0 = 300 + f.len * ly;
+    assert.equal(Core.grab(w, f, gx0, gy0, options), true);
+    let pointer = { x: gx0, y: gy0 };
+    for (let i = 0; i < 40; i++) {
+        pointer = axis === 'x' ? { x: gx0 + dir * i * 10, y: gy0 } : { x: gx0, y: gy0 + dir * i * 10 };
+        Core.step(w, 50, { pointer });
+    }
+    for (let i = 0; i < still; i++) Core.step(w, 50, { pointer });
+    return { w, f, pointer };
+}
+// 被抓的那一点现在在世界里的位置（拉尾时它应该就在指针下）
+const heldPoint = f => {
+    const c = Math.cos(f.ang);
+    const s = Math.sin(f.ang);
+    return { x: f.x + f.held.gx * c - f.held.gy * s, y: f.y + f.held.gx * s + f.held.gy * c };
+};
+const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
+
+test('抓取：held.tail 只在 tail 选项为真时为真（没有选项、tail:false 都是普通抓取）', () => {
+    for (const [options, expected] of [[undefined, false], [{}, false], [{ tail: false }, false], [{ tail: true }, true]]) {
+        const { w, f } = lone('clown');
+        assert.equal(Core.grab(w, f, f.x, f.y, options), true);
+        assert.equal(f.held.tail, expected);
+    }
+});
+
+test('拉尾：向西拖（朝着尾巴所在的一侧）时鱼头仍朝东，鱼身拖在指针东边，被抓的那一点就在指针下', () => {
+    const { f, pointer } = dragTail({ tail: true }, -1);
+    assert.ok(Math.cos(f.ang) > 0.95, `朝向 ${f.ang}`);
+    assert.ok(Math.abs(f.x - pointer.x - 0.24 * f.len) < 0.03 * f.len, `鱼心应在指针东边 0.24 个体长，实际 ${(f.x - pointer.x) / f.len}`);
+    assert.ok(gap(heldPoint(f), pointer) < 3, `被抓的点离指针 ${gap(heldPoint(f), pointer)} px`);
+});
+
+test('拉尾：向东拖（朝着鱼头的方向）时，鱼绕被抓的点转过来，鱼头朝西、鱼身拖在指针西边，被抓的点就在指针下', () => {
+    const { f, pointer } = dragTail({ tail: true }, 1);
+    assert.ok(Math.cos(f.ang) < -0.95, `朝向 ${f.ang}`);
+    assert.ok(Math.abs(pointer.x - f.x - 0.24 * f.len) < 0.03 * f.len, `鱼心应在指针西边 0.24 个体长，实际 ${(pointer.x - f.x) / f.len}`);
+    assert.ok(gap(heldPoint(f), pointer) < 3, `被抓的点离指针 ${gap(heldPoint(f), pointer)} px`);
+});
+
+test('拉尾：抓的点不在鱼的中线上、拖的方向是竖直的，也一样——鱼头朝与指针运动相反的方向，被抓的点始终在指针下', () => {
+    const east = dragTail({ tail: true }, 1, { ly: 0.2 });
+    assert.ok(gap(heldPoint(east.f), east.pointer) < 3, `向东拖：离指针 ${gap(heldPoint(east.f), east.pointer)} px`);
+    const south = dragTail({ tail: true }, 1, { axis: 'y' });
+    assert.ok(Math.sin(south.f.ang) < -0.95, `向南拖鱼头应朝北，朝向 ${south.f.ang}`);
+    assert.ok(gap(heldPoint(south.f), south.pointer) < 3, `向南拖：离指针 ${gap(heldPoint(south.f), south.pointer)} px`);
+    const north = dragTail({ tail: true }, -1, { axis: 'y', ly: -0.15 });
+    assert.ok(Math.sin(north.f.ang) > 0.95, `向北拖鱼头应朝南，朝向 ${north.f.ang}`);
+    assert.ok(gap(heldPoint(north.f), north.pointer) < 3, `向北拖：离指针 ${gap(heldPoint(north.f), north.pointer)} px`);
+});
+
+test('拉尾：转身过程中鱼心每帧的位移不超过抓取的速度上限，坐标始终有限；普通抓取向东拖，鱼头朝东', () => {
+    const { w, f } = lone('hammer', 4);
+    f.x = 600; f.y = 300; f.ang = 0;
+    assert.equal(Core.grab(w, f, f.x - f.len * 0.3, 300, { tail: true }), true);
+    let last = { x: f.x, y: f.y };
+    for (let i = 0; i < 40; i++) {
+        Core.step(w, 50, { pointer: { x: f.x - f.len * 0.3 + i * 10, y: 300 } });
+        assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.ang));
+        assert.ok(Math.hypot(f.x - last.x, f.y - last.y) <= P.HOLD_MAX_SPEED * 0.05 + 1e-6);
+        last = { x: f.x, y: f.y };
+    }
+    assert.ok(Math.cos(dragTail(undefined, 1).f.ang) > 0.95, '普通抓取：鱼头朝运动的方向');
+});
+
+test('拉尾：指针中途消失再出现，不会因为位移被当成一次极大的速度而让鱼头乱转', () => {
+    const { w, f } = lone('hammer', 4);
+    f.x = 600; f.y = 300; f.ang = 0;
+    const grabX = f.x - f.len * 0.3;
+    assert.equal(Core.grab(w, f, grabX, 300, { tail: true }), true);
+    for (let i = 0; i < 10; i++) Core.step(w, 50, { pointer: { x: grabX, y: 300 } });
+    for (let i = 0; i < 4; i++) Core.step(w, 50, { pointer: null });
+    const before = f.ang;
+    Core.step(w, 50, { pointer: { x: grabX + 400, y: 300 } });      // 指针回来时已经在 400 px 外
+    assert.ok(Math.abs(f.held.pvx) < 1e-6 && Math.abs(Core.angleDiff(before, f.ang)) < 0.05, `速度 ${f.held.pvx}，朝向变化 ${Core.angleDiff(before, f.ang)}`);
+});
```

- [ ] **Step 3: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-core.test.js
```

期望（输出末尾的三行）：

```text
ℹ tests 53
ℹ pass 44
ℹ fail 9
```

失败的 9 项（名字与下面一致；第一个失败的原因是 `Core.cruiseSpeed is not a function`）：

- `cruiseSpeed：种类速度 × 视口缩放 × 深度系数；未知种类为 0`
- `吸引点：范围内的鱼被拉向它——8 个种子里 10 秒内都游到离它不到一个体长的地方，没有吸引点的对照组做不到`
- `吸引点：靠近时游得更快（boost 放大期望速度），瞬时速度不超过 巡航速度 × FLEE_CAP`
- `吸引点：同时有几个在范围内时，朝最近的那个游（与它们的先后顺序无关）`
- `抓取：held.tail 只在 tail 选项为真时为真（没有选项、tail:false 都是普通抓取）`
- `拉尾：向西拖（朝着尾巴所在的一侧）时鱼头仍朝东，鱼身拖在指针东边，被抓的那一点就在指针下`
- `拉尾：向东拖（朝着鱼头的方向）时，鱼绕被抓的点转过来，鱼头朝西、鱼身拖在指针西边，被抓的点就在指针下`
- `拉尾：抓的点不在鱼的中线上、拖的方向是竖直的，也一样——鱼头朝与指针运动相反的方向，被抓的点始终在指针下`
- `拉尾：指针中途消失再出现，不会因为位移被当成一次极大的速度而让鱼头乱转`

另外 6 项在旧代码上本来就通过，它们守的是“不该变”的东西，改完之后仍要通过：

- `黄金轨迹：没有吸引点时，8 种鱼 20 秒后的位置、速度、朝向与改动之前一致（互动子项目不得改变现有游动）`
- `黄金轨迹：普通抓取（不是拉尾）时，被抓着的鱼的位置、速度与朝向与改动之前一致`
- `吸引点：没有、为空或全是坏数据时轨迹与没有玩法时逐位一致；远在范围外的吸引点同样不起作用`
- `吸引点：权重夹在 0–3、速度倍数夹在 0.5–2.5，夸张的数字不放大`
- `吸引点只拉游着的鱼：离开中的鱼不受影响，被抓着的鱼只跟指针`
- `拉尾：转身过程中鱼心每帧的位移不超过抓取的速度上限，坐标始终有限；普通抓取向东拖，鱼头朝东`

- [ ] **Step 4: 改核心**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 1 4`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/js/aquarium-core.js
+++ b/js/aquarium-core.js
@@ -63,6 +63,7 @@
         HOLD_K: 14,               // 抓着时追指针的快慢（1/s）
         HOLD_MAX_SPEED: 3200,
         HOLD_OFFSET: 0.8,
+        HOLD_PV_RATE: 10,         // 拉尾时指针速度的平滑速率（1/s）
         THROW_MAX: 600,           // 松手时带走的速度上限（px/s）
         FLIP_HYST: 0.3,           // 翻面滞回：朝向的 cos 越过 ±此值（离竖直线约 17°）才换到另一面，在竖直附近来回晃的鱼不会一帧一换
         FLIP_RATE: 9,             // 当前面向目标面缓动的快慢（1/s）：换面约 0.25 秒，身体先收窄再展开，像打了个滚
@@ -343,13 +344,29 @@
         return top;
     }
 
-    /** 抓住 fish：指针必须在它抓得到的范围内；同时只抓一条。 */
-    function grab(world, fish, x, y) {
+    /**
+     * 抓住 fish：指针必须在它抓得到的范围内；同时只抓一条。
+     * options.tail 为真表示抓的是尾巴（互动子项目的“拉鱼尾”）：记下被抓的那一点在鱼身上的位置，
+     * 之后鱼绕着这一点转、指针始终在这一点上，鱼头朝远离指针运动的方向（像被拖着走），见 stepHeld。
+     */
+    function grab(world, fish, x, y, options) {
         if (!fish || !world.fish.includes(fish) || !grabbable(fish) || !inHitRegion(fish, x, y)) return false;
         if (world.fish.some(f => f.state === 'held')) return false;
         fish.state = 'held';
         fish.alpha = 1;
-        fish.held = { ox: (fish.x - x) * PARAMS.HOLD_OFFSET, oy: (fish.y - y) * PARAMS.HOLD_OFFSET };
+        fish.held = { ox: (fish.x - x) * PARAMS.HOLD_OFFSET, oy: (fish.y - y) * PARAMS.HOLD_OFFSET, tail: false };
+        if (options && options.tail) {
+            const dx = x - fish.x;
+            const dy = y - fish.y;
+            const c = Math.cos(fish.ang);
+            const s = Math.sin(fish.ang);
+            Object.assign(fish.held, {
+                tail: true,
+                gx: (dx * c + dy * s) * PARAMS.HOLD_OFFSET,        // 被抓的点在鱼本地坐标里的位置（鼻子朝 +x）
+                gy: (-dx * s + dy * c) * PARAMS.HOLD_OFFSET,
+                lastX: x, lastY: y, pvx: 0, pvy: 0,                // 指针速度（平滑后），鱼头据此朝向
+            });
+        }
         return true;
     }
 
@@ -370,12 +387,48 @@
     function validBells(bells) {
         if (!Array.isArray(bells)) return [];
         return bells.filter(b => b && finite(b.x, b.y, b.r) && b.r > 0);
+    }
+
+    const NO_ATTRACTORS = Object.freeze([]);
+
+    /**
+     * 吸引点（饲料等，由玩法模块给出）：{ x, y, reach, weight, boost }。
+     * 只留数字都有限且 reach > 0 的；weight 夹在 0–3（朝它走的合力权重）、boost 夹在 0.5–2.5（靠近时的速度倍数，不超过 FLEE_CAP，免得被速度上限悄悄截掉），夸张的数字不会放大。
+     */
+    function validAttractors(list) {
+        if (!Array.isArray(list) || !list.length) return NO_ATTRACTORS;
+        const out = [];
+        for (const a of list) {
+            if (!a || !finite(a.x, a.y, a.reach, a.weight, a.boost) || a.reach <= 0) continue;
+            out.push({ x: a.x, y: a.y, reach: a.reach, weight: clamp(a.weight, 0, 3), boost: clamp(a.boost, 0.5, 2.5) });
+        }
+        return out;
     }
 
+    /** 某条鱼的巡航速度（px/s）：种类速度 × 视口缩放 × 深度系数；未知种类为 0。玩法冲量以它为单位。 */
+    function cruiseSpeed(world, f) {
+        const spec = BY_ID[f.species];
+        return spec ? spec.speed * world.scale * (1 - PARAMS.Z_SPEED + PARAMS.Z_SPEED * f.z) : 0;
+    }
+
     function stepHeld(world, f, dt, pointer) {
         if (pointer) {
-            const tx = pointer.x + f.held.ox;
-            const ty = pointer.y + f.held.oy;
+            const h = f.held;
+            let tx = pointer.x + h.ox;
+            let ty = pointer.y + h.oy;
+            if (h.tail) {
+                // 拉尾：目标是让被抓的那一点落在指针下（鱼身绕它转）；同时记指针速度，鱼头朝与它相反的方向
+                const c = Math.cos(f.ang);
+                const s = Math.sin(f.ang);
+                tx = pointer.x - (h.gx * c - h.gy * s);
+                ty = pointer.y - (h.gx * s + h.gy * c);
+                if (Number.isFinite(h.lastX)) {
+                    const k = Math.min(1, PARAMS.HOLD_PV_RATE * dt);
+                    h.pvx += ((pointer.x - h.lastX) / dt - h.pvx) * k;
+                    h.pvy += ((pointer.y - h.lastY) / dt - h.pvy) * k;
+                }
+                h.lastX = pointer.x; h.lastY = pointer.y;
+            }
             let vx = (tx - f.x) * PARAMS.HOLD_K;
             let vy = (ty - f.y) * PARAMS.HOLD_K;
             const speed = Math.hypot(vx, vy);
@@ -383,13 +436,17 @@
             f.x += vx * dt;
             f.y += vy * dt;
             f.vx = vx; f.vy = vy;
-            if (Math.hypot(vx, vy) > 20) f.ang += angleDiff(f.ang, Math.atan2(vy, vx)) * Math.min(1, 8 * dt);
+            const fx = h.tail ? -h.pvx : vx;                     // 鱼头朝向跟随的向量：拉尾时与指针运动相反
+            const fy = h.tail ? -h.pvy : vy;
+            if (Math.hypot(fx, fy) > 20) f.ang += angleDiff(f.ang, Math.atan2(fy, fx)) * Math.min(1, 8 * dt);
+        } else if (f.held.tail) {
+            f.held.lastX = NaN;                                  // 指针不在：下次有指针时重新取基准，免得速度冲一下
         }
         updateFlip(f, dt);
         f.phase += dt * 14;           // 被抓着时拼命摆尾
     }
 
-    function stepFish(world, f, dt, mates, pointer, bells) {
+    function stepFish(world, f, dt, mates, pointer, bells, attractors) {
         const spec = BY_ID[f.species];
         const scale = world.scale;
         const margin = PARAMS.MARGIN + f.len;
@@ -418,7 +475,7 @@
         const group = world.groups[f.entry];
         if (group && world.time >= group.next) pickHome(world, group, spec);
 
-        const speedT = spec.speed * scale * (1 - PARAMS.Z_SPEED + PARAMS.Z_SPEED * f.z);
+        const speedT = cruiseSpeed(world, f);
         let sx = 0;
         let sy = 0;
 
@@ -469,13 +526,30 @@
         const ry = sx * ss + sy * sc;
         sx = rx; sy = ry;
 
+        // 吸引点（饲料）：范围内最近的一个把合力拉向它，并放大期望速度；没有吸引点时 boost 恒为 1，计算与原来逐位一致
+        let boost = 1;
+        if (attractors.length) {
+            let best = null;
+            let bestD = Infinity;
+            for (const a of attractors) {
+                const d = Math.hypot(a.x - f.x, a.y - f.y);
+                if (d < a.reach && d < bestD) { best = a; bestD = d; }
+            }
+            if (best && bestD > 1e-6) {
+                sx += (best.x - f.x) / bestD * best.weight;
+                sy += (best.y - f.y) / bestD * best.weight;
+                boost = best.boost;
+            }
+        }
+        const go = speedT * boost;
+
         const sl = Math.hypot(sx, sy);
         let dvx; let dvy;
         if (sl > 1e-3) {
             const gain = clamp(sl / PARAMS.STEER_FULL, PARAMS.STEER_MIN, 1);
-            dvx = sx / sl * speedT * gain; dvy = sy / sl * speedT * gain;
+            dvx = sx / sl * go * gain; dvy = sy / sl * go * gain;
         }
-        else { const h = Math.hypot(f.vx, f.vy) || 1; dvx = f.vx / h * speedT; dvy = f.vy / h * speedT; }
+        else { const h = Math.hypot(f.vx, f.vy) || 1; dvx = f.vx / h * go; dvy = f.vy / h * go; }
         const turn = Math.min(1, PARAMS.TURN * dt);
         f.vx += (dvx - f.vx) * turn;
         f.vy += (dvy - f.vy) * turn;
@@ -541,7 +615,8 @@
     }
 
     /**
-     * 推进一步。input = { pointer: {x, y} | null, bells: [{x, y, r}] }：pointer 用于避让与抓取跟随，bells 是水母钟罩（只读）。
+     * 推进一步。input = { pointer: {x, y} | null, bells: [{x, y, r}], attractors: [{x, y, reach, weight, boost}] }：
+     * pointer 用于避让与抓取跟随，bells 是水母钟罩（只读），attractors 是玩法模块给出的吸引点（饲料）。
      * dtMs 非有限或接近 0 时什么都不做；单步最长 50 ms（标签页刚恢复时按 50 ms 算）。
      */
     function step(world, dtMs, input = {}) {
@@ -562,6 +637,7 @@
         }
 
         const bells = validBells(input && input.bells);
+        const attractors = validAttractors(input && input.attractors);
         const byEntry = new Map();
         for (const f of world.fish) {
             if (!byEntry.has(f.entry)) byEntry.set(f.entry, []);
@@ -569,14 +645,14 @@
         }
         for (const f of world.fish) {
             if (f.state === 'held') stepHeld(world, f, dt, pointer);
-            else stepFish(world, f, dt, byEntry.get(f.entry), pointer, bells);
+            else stepFish(world, f, dt, byEntry.get(f.entry), pointer, bells, attractors);
         }
         world.fish = world.fish.filter(f => !(f.state === 'leaving' && f.alpha <= 0));
     }
 
     return {
         PARAMS, SPECIES, speciesById, normalizeEntries, canAdd, renderCount, capacity,
-        createWorld, resize, reconcile, dismiss, step, hitTest, grab, release,
+        createWorld, resize, reconcile, dismiss, step, hitTest, grab, release, cruiseSpeed,
         clamp, lerp, angleDiff, updateFlip,
     };
 });
```

- [ ] **Step 5: 跑测试，确认绿**

```bash
node --test test/aquarium-core.test.js
node --test test/aquarium-core.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

第一条期望 `tests 53 / pass 53 / fail 0`；第二条（原有四个文件，核心现在是 53 项）期望：

```text
ℹ tests 127
ℹ pass 127
ℹ fail 0
```

- [ ] **Step 6: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium-core.js test/aquarium-core.test.js`，提交说明：`feat(aquarium): 核心钩子——吸引点、尾端抓取、cruiseSpeed`。

---

## Task 2：玩法核心（一）——戳

**目标。** 新建纯逻辑模块 `js/aquarium-play-core.js`，先只做“戳”：点鱼时这条鱼朝点击处的反方向窜出去，附近的鱼受惊，水面荡开一圈涟漪，嘴边冒两三个泡；涟漪与泡随时间推进、过期、按窗口比例缩放、省流量时减量。状态只在内存里，**从不存储**。

**Files:**
- Create: `js/aquarium-play-core.js`（本任务写第一版，196 行；Task 3、4 在它上面追加）
- Create: `test/aquarium-play-core.test.js`（本任务写第一版，14 项；Task 3、4 追加）

**Interfaces:**
- Consumes: `AquariumCore.PARAMS / clamp / cruiseSpeed / speciesById`（Task 1 导出了 `cruiseSpeed`）；`world` 的 `fish[] / width / height / scale / lowPower / random()`；鱼的 `id / x / y / vx / vy / ang / len / species / state`。
- Produces（本任务；后两个任务继续往导出里加）：
  - `PARAMS`（冻结的参数表，初值都要在 Task 9 的真实 Chromium 里校准）；
  - `create() → play`：`{ time, nextId, lastSprinkle, ripples, bubbles, pellets, pokedAt, fed, pulls }`，全在内存；
  - `resize(play, ratioX, ratioY)`：窗口变大变小时，涟漪、泡、饲料的位置按比例缩放（比例不是有限正数就什么都不做）；
  - `counts(play) → { ripples, bubbles, pellets, fed, pulls }`；
  - `poke(play, world, fish, at) → { ok: true, pushed } | { ok: false, reason }`，被拒原因只有 `invalid`（参数不是有限数 / 鱼不在 world 里）、`state`（鱼不是 `alive` 或 `entering`）、`cooldown`（同一条鱼 `POKE_COOLDOWN_S = 0.4` 秒内再戳）；被拒时什么都不改；
  - `step(play, world, dtMs)`：推进涟漪、泡，清掉过期的冷却记录；`dtMs` 不是有限数或小于核心的 `MIN_DT` 就忽略，过大按核心的 `MAX_DT` 夹住。

**行为要点（测试都有对应断言）。** 被戳的鱼以 `POKE_DASH × 巡航速度` 沿“点击处 → 鱼”的方向窜出（点在鱼的正中心 `POKE_CENTER × 体长` 以内时沿它自己的朝向窜）；`SHOCK_R × 视口缩放 + 邻鱼体长` 以内的邻鱼被向外推，线性衰减，大型鱼只受 `SHOCK_LARGE` 倍；离开中（`leaving`）和被抓着的鱼不参与；涟漪最多 `MAX_RIPPLES` 个（省流量 1 个）、泡最多 `MAX_BUBBLES` 个（省流量 8 个），超过时丢最老的。

- [ ] **Step 1: 先写测试（新建 `test/aquarium-play-core.test.js`，第一版）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 2 1`（用法见附录 B；也可以照着下面的块手工写）。

写入 `test/aquarium-play-core.test.js`（完整文件）：

```javascript
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../js/aquarium-core.js');
const Play = require('../js/aquarium-play-core.js');

const P = Play.PARAMS;

function seeded(seed = 7) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
let seq = 0;
const entry = (species, extra = {}) => Object.assign({ id: `e${++seq}`, species, addedAt: 1 }, extra);
const world = (extra = {}) => Core.createWorld(Object.assign({ width: 1280, height: 720, random: seeded(), lowPower: false }, extra));
const cruise = (w, f) => Core.cruiseSpeed(w, f);

/** 一条停在 (x, y) 朝东的鱼（已淡入、静止），其余条目的鱼由 others 给出。返回 { w, play, fish }。 */
function tank(species = 'clown', { others = [], extra = {}, x = 500, y = 400 } = {}) {
    const w = world(extra);
    Core.reconcile(w, [entry(species), ...others.map(([s]) => entry(s))], { instant: true });
    const fish = w.fish[0];
    Object.assign(fish, { x, y, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' });
    return { w, play: Play.create(), fish };
}
/** 把别的鱼放在离 (cx, cy) 为 d 的正东方，静止。 */
function place(f, cx, cy, d) { Object.assign(f, { x: cx + d, y: cy, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' }); }
const run = (w, play, seconds, dtMs = 50) => { for (let i = 0; i < seconds * 1000 / dtMs; i++) { Core.step(w, dtMs); Play.step(play, w, dtMs); } };

// ---------- 创建与基本约束 ----------

test('create：一份空状态，所有计数为 0，随机不用 Math.random（没有 world.random 也不会被调用）', () => {
    const play = Play.create();
    assert.deepEqual(Play.counts(play), { ripples: 0, bubbles: 0, pellets: 0, fed: 0, pulls: 0 });
    assert.equal(play.time, 0);
});

// ---------- 戳 ----------

test('戳：被戳的鱼朝远离点击处的方向窜出去，速度约为巡航速度的 POKE_DASH 倍，嘴边冒 2–3 个泡，点击处出现一圈涟漪', () => {
    const { w, play, fish } = tank('clown');
    const r = Play.poke(play, w, fish, { x: fish.x - 20, y: fish.y });          // 点在鱼身西侧 20 px
    assert.equal(r.ok, true);
    assert.ok(Math.abs(Math.hypot(fish.vx, fish.vy) - cruise(w, fish) * P.POKE_DASH) < 1e-6);
    assert.ok(fish.vx > 0 && Math.abs(fish.vy) < 1e-6, '点在西边，向东窜');
    const c = Play.counts(play);
    assert.equal(c.ripples, 1);
    assert.ok(c.bubbles >= 2 && c.bubbles <= 3, `泡 ${c.bubbles}`);
    const mouth = { x: fish.x + Math.cos(fish.ang) * fish.len * 0.45, y: fish.y + Math.sin(fish.ang) * fish.len * 0.45 };
    for (const b of play.bubbles) assert.ok(Math.hypot(b.x - mouth.x, b.y - mouth.y) < 8 * w.scale, '泡在嘴边');
});

test('戳：点在鱼心附近（不到 POKE_CENTER 个体长）时没有“远离”的方向，朝鱼头方向窜', () => {
    const { w, play, fish } = tank('hammer');
    fish.ang = Math.PI / 2;                                                    // 朝南
    assert.equal(Play.poke(play, w, fish, { x: fish.x, y: fish.y }).ok, true);
    assert.ok(Math.abs(fish.vx) < 1e-6 && fish.vy > 0, `速度 ${fish.vx}, ${fish.vy}`);
    const t = tank('hammer');
    t.fish.ang = 0;
    assert.equal(Play.poke(t.play, t.w, t.fish, { x: t.fish.x + 0.5 * P.POKE_CENTER * t.fish.len, y: t.fish.y }).ok, true);
    assert.ok(t.fish.vx > 0, '刚好在阈值之内仍朝鱼头');
});

test('冲击波：范围内的别的鱼被推离点击处，越近越强；范围外不动；大型鱼只有 SHOCK_LARGE 倍的反应', () => {
    const { w, play, fish } = tank('clown', { others: [['puffer'], ['angel'], ['manta'], ['tang']] });
    const [near, mid] = ['puffer', 'angel'].map(id => w.fish.find(f => f.species === id));
    const big = w.fish.find(f => f.species === 'manta');
    const outside = w.fish.filter(f => f.species === 'tang');
    for (const f of w.fish) if (f !== fish) place(f, 500, 400, 5000);
    place(near, 500, 400, 30);
    place(mid, 500, 400, 0.6 * (P.SHOCK_R * w.scale + mid.len));
    place(big, 500, 400, 20);
    const r = Play.poke(play, w, fish, { x: 500, y: 400 });
    assert.equal(r.ok, true);
    assert.equal(r.pushed, 3);
    const speed = f => Math.hypot(f.vx, f.vy);
    const expected = (f, d, factor = 1) => (1 - d / (P.SHOCK_R * w.scale + f.len)) * factor * cruise(w, f) * P.SHOCK_DASH;
    assert.ok(near.vx > 0 && Math.abs(speed(near) - expected(near, 30)) < 1e-6, `近处 ${speed(near)}`);
    assert.ok(Math.abs(speed(mid) - expected(mid, 0.6 * (P.SHOCK_R * w.scale + mid.len))) < 1e-6, `中间 ${speed(mid)}`);
    assert.ok(Math.abs(speed(big) - expected(big, 20, P.SHOCK_LARGE)) < 1e-6, `大型鱼 ${speed(big)}`);
    assert.ok(speed(near) > speed(mid));
    for (const f of outside) assert.equal(speed(f), 0, '范围外的鱼不动');
});

test('冲击波：成群的小鱼同样被推开；离开中和被抓着的鱼不受影响；正好压在点击处的鱼朝自己的鱼头方向被推', () => {
    const { w, play, fish } = tank('clown', { others: [['neon'], ['hammer'], ['puffer']] });
    for (const f of w.fish) if (f !== fish) place(f, 500, 400, 5000);
    const school = w.fish.filter(f => f.species === 'neon');
    school.forEach((f, i) => place(f, 500, 400, 40 + i * 8));
    const hammer = w.fish.find(f => f.species === 'hammer');
    place(hammer, 500, 400, 30); hammer.state = 'leaving';
    const puffer = w.fish.find(f => f.species === 'puffer');
    place(puffer, 500, 400, 0);
    puffer.ang = Math.PI / 2;
    Play.poke(play, w, fish, { x: 500, y: 400 });
    for (const f of school) assert.ok(f.vx > 0, '小鱼被推开');
    assert.equal(Math.hypot(hammer.vx, hammer.vy), 0);
    assert.ok(Math.abs(puffer.vx) < 1e-9 && puffer.vy > 0, `压在点击处的鱼朝鱼头（南）方向，速度 ${puffer.vx}, ${puffer.vy}`);
});

test('戳：同一条鱼 0.4 秒内不重复响应（不产生涟漪、泡、速度变化），别的鱼不受影响，过了冷却可以再戳', () => {
    const { w, play, fish } = tank('clown', { others: [['angel']] });
    const other = w.fish.find(f => f.species === 'angel');
    place(other, 500, 400, 600);
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true);
    run(w, play, 0.3);
    const before = JSON.stringify([Play.counts(play), fish.vx, fish.vy, play.bubbles]);
    assert.deepEqual(Play.poke(play, w, fish, { x: 480, y: 400 }), { ok: false, reason: 'cooldown' });
    assert.equal(JSON.stringify([Play.counts(play), fish.vx, fish.vy, play.bubbles]), before, '被拒绝的戳什么都不改');
    assert.equal(Play.poke(play, w, other, { x: 1000, y: 400 }).ok, true, '别的鱼不受冷却影响');
    run(w, play, 0.15);
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true, '过了冷却可以再戳');
});

test('戳：坏输入与不能戳的鱼被拒绝且什么都不改（不抛错）', () => {
    const { w, play, fish } = tank('clown');
    const before = JSON.stringify([Play.counts(play), fish.vx, fish.vy, [...play.pokedAt]]);
    const bad = [
        [null, { x: 1, y: 1 }], [fish, null], [fish, { x: NaN, y: 1 }], [fish, { x: 1, y: Infinity }], [fish, {}], [{ x: 1 }, { x: 1, y: 1 }],
        [Object.assign({}, fish), { x: 1, y: 1 }],                              // 不在 world 里的鱼
    ];
    for (const [f, at] of bad) assert.deepEqual(Play.poke(play, w, f, at), { ok: false, reason: 'invalid' });
    for (const state of ['leaving', 'held']) {
        const saved = fish.state;
        fish.state = state;
        assert.deepEqual(Play.poke(play, w, fish, { x: 480, y: 400 }), { ok: false, reason: 'state' });
        fish.state = saved;
    }
    assert.equal(JSON.stringify([Play.counts(play), fish.vx, fish.vy, [...play.pokedAt]]), before);
});

test('戳：淡入中的鱼也可以戳；涟漪最多 3 圈（省流量 1 圈）、泡最多 24 个（省流量 8 个），超出时丢最老的', () => {
    const { w, play, fish } = tank('clown');
    fish.state = 'entering';
    assert.equal(Play.poke(play, w, fish, { x: 480, y: 400 }).ok, true);
    fish.state = 'alive';
    for (let i = 0; i < 12; i++) { play.pokedAt.clear(); assert.equal(Play.poke(play, w, fish, { x: 400 + i, y: 400 }).ok, true); }
    assert.equal(play.ripples.length, P.MAX_RIPPLES);
    assert.deepEqual(play.ripples.map(r => r.x), [409, 410, 411], '留下的是最近的 3 圈');
    assert.ok(play.bubbles.length <= P.MAX_BUBBLES);
    const low = tank('clown', { extra: { lowPower: true } });
    for (let i = 0; i < 12; i++) { low.play.pokedAt.clear(); Play.poke(low.play, low.w, low.fish, { x: 400 + i, y: 400 }); }
    assert.equal(low.play.ripples.length, P.MAX_RIPPLES_LOW);
    assert.ok(low.play.bubbles.length <= P.MAX_BUBBLES_LOW);
    assert.equal(low.play.bubbles.length, P.MAX_BUBBLES_LOW, '泡多到顶满');
});

test('涟漪与泡：涟漪 RIPPLE_S 后消失；泡一路上浮、左右摇摆，到寿命或出了画面就消失', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    const ys = play.bubbles.map(b => b.y);
    run(w, play, 0.3);
    assert.equal(play.ripples.length, 1);
    play.bubbles.forEach((b, i) => assert.ok(b.y < ys[i] - 3, '泡在上浮'));
    run(w, play, P.RIPPLE_S);
    assert.equal(play.ripples.length, 0);
    run(w, play, 4);
    assert.equal(play.bubbles.length, 0);
    const edge = tank('clown', { y: 10 });
    Play.poke(edge.play, edge.w, edge.fish, { x: 480, y: 10 });
    run(edge.w, edge.play, 1.4);                                              // 短于泡的最短寿命，所以消失只能是因为出了画面
    assert.ok(edge.play.bubbles.every(b => b.y > -20), '出了画面的泡被丢掉');
});

test('泡：上浮时左右轻轻摇摆（水平位置不是一条直线，幅度也不大）', () => {
    const { w, play, fish } = tank('clown', { y: 600 });
    Play.poke(play, w, fish, { x: 480, y: 600 });
    const track = play.bubbles.map(() => []);
    for (let i = 0; i < 20; i++) { Play.step(play, w, 50); play.bubbles.forEach((b, j) => track[j].push(b.x)); }
    for (const xs of track) {
        const range = Math.max(...xs) - Math.min(...xs);
        assert.ok(range > 0.5 * w.scale && range < 8 * w.scale, `水平摆动范围 ${range}`);
    }
});

test('step：dt 非法或太小什么都不做；单步最长 50 ms；冷却记录过期后被清掉', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    for (const bad of [NaN, Infinity, undefined, 'x', 0, -5, 0.01]) { Play.step(play, w, bad); assert.equal(play.time, 0, String(bad)); }
    Play.step(play, w, 5000);
    assert.ok(Math.abs(play.time - 0.05) < 1e-12);
    assert.equal(play.pokedAt.size, 1);
    for (let i = 0; i < 9; i++) Play.step(play, w, 50);
    assert.equal(play.pokedAt.size, 0, '0.4 秒后冷却记录被清掉');
});

test('resize：涟漪与泡的位置按比例缩放，坏比例被忽略', () => {
    const { w, play, fish } = tank('clown');
    Play.poke(play, w, fish, { x: 480, y: 400 });
    const r = { ...play.ripples[0] };
    const b = { ...play.bubbles[0] };
    Play.resize(play, 0, 1); Play.resize(play, NaN, 1); Play.resize(play, 1, -2);
    assert.deepEqual([play.ripples[0].x, play.ripples[0].y], [r.x, r.y]);
    Play.resize(play, 2, 0.5);
    assert.deepEqual([play.ripples[0].x, play.ripples[0].y], [r.x * 2, r.y * 0.5]);
    assert.deepEqual([play.bubbles[0].x, play.bubbles[0].y], [b.x * 2, b.y * 0.5]);
});

test('确定性：同一个种子、同样的操作，两份玩法状态逐位一致；随机只来自 world.random', () => {
    const play1 = () => {
        const { w, play, fish } = tank('clown', { others: [['tang'], ['angel']] });
        for (let i = 0; i < 6; i++) { Play.poke(play, w, w.fish[i % w.fish.length], { x: 300 + i * 80, y: 380 }); run(w, play, 0.5); }
        return JSON.stringify([play.ripples, play.bubbles, [...play.pokedAt], w.fish.map(f => [f.x, f.y, f.vx, f.vy])]);
    };
    assert.equal(play1(), play1());
});

test('随机戳 60 秒：数量始终有界，所有数字有限（并且真的戳了很多次，不是空跑）', () => {
    const { w, play } = tank('clown', { others: [['tang'], ['neon'], ['hammer'], ['manta'], ['puffer'], ['angel']] });
    const rnd = seeded(99);
    let accepted = 0;
    for (let i = 0; i < 1200; i++) {
        if (i % 7 === 0 && Play.poke(play, w, w.fish[Math.floor(rnd() * w.fish.length)], { x: rnd() * 1280, y: rnd() * 720 }).ok) accepted++;
        Core.step(w, 50, { pointer: null });
        Play.step(play, w, 50);
        const c = Play.counts(play);
        assert.ok(c.ripples <= P.MAX_RIPPLES && c.bubbles <= P.MAX_BUBBLES && play.pokedAt.size <= w.fish.length);
    }
    assert.ok(accepted >= 100, `被接受的戳 ${accepted} 次`);
    assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
    assert.ok(play.bubbles.every(b => [b.x, b.y, b.r].every(Number.isFinite)));
});

```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-play-core.test.js
```

期望：整个文件加载失败（模块还不存在）——

```text
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

并且错误里有 `Error: Cannot find module '../js/aquarium-play-core.js'`。

- [ ] **Step 3: 写实现（新建 `js/aquarium-play-core.js`，第一版）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 2 3`（用法见附录 B；也可以照着下面的块手工写）。

写入 `js/aquarium-play-core.js`（完整文件）：

```javascript
(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports) ? require('./aquarium-core.js') : root && root.AquariumCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumPlayCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core) {
    'use strict';

    // 水族馆玩法核心：戳（涟漪、冲击波、泡）、喂食（饲料、吃、变亮）、拉鱼尾（拉伸弹簧）。
    // 纯逻辑：不碰 DOM、存储与 Date，随机数全部来自 world.random，所以可以在 node 里确定性地测试。
    // 状态（play）与 world 同生命周期，由控制器 aquarium.js 持有，刷新即清空；对鱼只写速度（冲量），位置与朝向仍归 aquarium-core.js。
    // 画法在 aquarium-play.js。设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md。

    const TAU = Math.PI * 2;
    const finite = (...values) => values.every(Number.isFinite);
    const clamp = Core.clamp;

    // 下面的数字全部是初值，在真实浏览器里看轨迹与逐帧图校准后写回技术文档。长度类参数乘视口缩放（world.scale）；时间单位是秒。
    const PARAMS = Object.freeze({
        // 戳
        POKE_COOLDOWN_S: 0.4,     // 同一条鱼两次响应之间的最短间隔
        POKE_DASH: 2.4,           // 被戳的鱼窜出去的速度（巡航速度的倍数；核心把速度夹在 FLEE_CAP = 2.6 倍以内）
        POKE_CENTER: 0.15,        // 点在离鱼心不到这么多个体长处时没有“远离”的方向，改朝鱼头方向窜
        SHOCK_R: 140,             // 冲击波半径（px，再加每条鱼自己的体长）
        SHOCK_DASH: 1.2,          // 紧贴涟漪中心的鱼被推开的速度（巡航速度的倍数），越远越弱
        SHOCK_LARGE: 0.35,        // 大型鱼（蝠鲼、鲸鲨）的反应折扣
        RIPPLE_S: 0.7,            // 涟漪扩散的时间
        RIPPLE_R: 110,            // 涟漪最终半径（px）
        MAX_RIPPLES: 3,
        MAX_RIPPLES_LOW: 1,       // 省流量
        MAX_BUBBLES: 24,
        MAX_BUBBLES_LOW: 8,
        POKE_BUBBLES: 2,          // 被戳时嘴边冒的泡：2…3 个（POKE_BUBBLES + 一个 0…1 的随机数）
        EAT_BUBBLES: 2,
        RELEASE_BUBBLES: 2,
        // 喂食
        SPRINKLE_COUNT: 6,        // 点一下按钮落下的粒数
        SPRINKLE_MAX: 12,
        SPRINKLE_X0: 0.2,         // 从上部落下时横向的范围（占宽度）
        SPRINKLE_X1: 0.8,
        SPRINKLE_Y: 0.12,         // 落点的高度（占高度）
        DROP_SPREAD: 40,          // 在水里松手时每粒在 ±这么多 px 内散开
        PELLET_SINK: 40,          // 下沉速度（px/s）
        PELLET_LIFE_S: 14,
        MAX_PELLETS: 24,
        MAX_PELLETS_LOW: 8,
        FEED_COOLDOWN_S: 0.8,
        ATTRACT_REACH: 300,       // 这么近（px）的鱼才会被饲料吸引
        ATTRACT_W: 2.5,           // 朝饲料走的合力权重：要比最坏情况下“家 + 漫游”（0.9 + 0.7）的反向合力大，鱼才一定朝它走
        ATTRACT_BOOST: 1.5,       // 靠近饲料时的速度倍数
        EAT_R_LEN: 0.45,          // 吃到的距离 = 体长 × 这个 + EAT_R_PAD
        EAT_R_PAD: 4,
        FED_S: 20,                // 吃到后变亮的时间
        FED_IN_S: 0.25,
        FED_OUT_S: 3,
        // 拉尾
        TAIL_ZONE: 0,             // 按在鱼本地坐标 x ≤ 体长 × 这个 的地方（后半身）才算拉尾
        PULL_GAIN: 0.1,           // 拉伸量 = 指针速度（px/s）× 这个（px）
        PULL_MAX: 0.35,           // 最多拉长体长的这么多
        PULL_ABS: 40,             // 另设绝对上限（px）
        PULL_OMEGA: 16,           // 弹簧的固有角频率（rad/s）
        PULL_ZETA: 0.5,           // 阻尼比：小于 1 才会回弹一次
        RELEASE_DASH: 2.0,        // 松手后鱼向前冲的速度（巡航速度的倍数）
    });

    // ---------- 状态 ----------

    /** 一份玩法状态，与 world 同生命周期。全部只在内存里：不存储、不进日志。 */
    function create() {
        return {
            time: 0,                   // 玩法自己的时钟（秒），只在 step 里前进
            nextId: 1,
            lastSprinkle: -Infinity,
            ripples: [],               // { x, y, t }
            bubbles: [],               // { x, y, r, vy, ph, t, life }
            pellets: [],               // { id, x, y, t, ph, sink, life }
            pokedAt: new Map(),        // 鱼 id → 上次被戳的时间（只留冷却期内的）
            fed: new Map(),            // 鱼 id → 变亮到什么时候
            pulls: new Map(),          // 鱼 id → { x, y, vx, vy }：拉尾弹簧（鱼本地坐标，px）
        };
    }

    /** 屏幕尺寸变了：位置按比例缩放；拉尾弹簧是鱼本地的小位移，缩放它没有意义，保持不动。 */
    function resize(play, ratioX, ratioY) {
        if (!finite(ratioX, ratioY) || ratioX <= 0 || ratioY <= 0) return;
        for (const list of [play.ripples, play.bubbles, play.pellets]) {
            for (const item of list) { item.x *= ratioX; item.y *= ratioY; }
        }
    }

    function counts(play) {
        return { ripples: play.ripples.length, bubbles: play.bubbles.length, pellets: play.pellets.length, fed: play.fed.size, pulls: play.pulls.size };
    }

    // ---------- 泡与涟漪 ----------

    function addBubbles(play, world, x, y, count) {
        const cap = world.lowPower ? PARAMS.MAX_BUBBLES_LOW : PARAMS.MAX_BUBBLES;
        const k = world.scale;
        for (let i = 0; i < count; i++) {
            play.bubbles.push({
                x: x + (world.random() - 0.5) * 6 * k,
                y: y + (world.random() - 0.5) * 4 * k,
                r: (1.4 + world.random() * 1.8) * k,
                vy: (24 + world.random() * 22) * k,
                ph: world.random() * TAU,
                t: 0,
                life: 1.5 + world.random() * 1.1,
            });
        }
        if (play.bubbles.length > cap) play.bubbles.splice(0, play.bubbles.length - cap);
    }

    function addRipple(play, world, x, y) {
        play.ripples.push({ x, y, t: 0 });
        const cap = world.lowPower ? PARAMS.MAX_RIPPLES_LOW : PARAMS.MAX_RIPPLES;
        if (play.ripples.length > cap) play.ripples.splice(0, play.ripples.length - cap);
    }

    /** 鱼嘴的位置（鼻尖稍靠里一点）。 */
    function mouthOf(fish) {
        return { x: fish.x + Math.cos(fish.ang) * fish.len * 0.45, y: fish.y + Math.sin(fish.ang) * fish.len * 0.45 };
    }

    function ageEffects(play, world, dt) {
        const k = world.scale;
        play.ripples = play.ripples.filter(r => (r.t += dt) < PARAMS.RIPPLE_S);
        play.bubbles = play.bubbles.filter(b => {
            b.t += dt;
            b.y -= b.vy * dt;
            b.x += Math.sin(b.t * 5 + b.ph) * 10 * k * dt;
            return b.t < b.life && b.y > -20;
        });
    }

    // ---------- 戳 ----------

    function poking(fish) { return fish.state === 'alive' || fish.state === 'entering'; }

    /**
     * 戳 fish（点击处 at）：被戳的鱼猛地窜开、嘴边冒泡；点击处荡开涟漪；附近的鱼被推开（越近越强，大型鱼打折）。
     * 同一条鱼 POKE_COOLDOWN_S 内不重复响应。拒绝时返回 { ok: false, reason: 'invalid' | 'state' | 'cooldown' }，什么都不改。
     */
    function poke(play, world, fish, at) {
        if (!fish || !at || !finite(at.x, at.y, fish.x, fish.y, fish.ang) || !world.fish.includes(fish)) return { ok: false, reason: 'invalid' };
        if (!poking(fish)) return { ok: false, reason: 'state' };
        const last = play.pokedAt.get(fish.id);
        if (last !== undefined && play.time - last < PARAMS.POKE_COOLDOWN_S) return { ok: false, reason: 'cooldown' };
        play.pokedAt.set(fish.id, play.time);

        // 被戳的鱼：朝远离点击处的方向窜（点在鱼心附近时朝鱼头方向）
        const dx = fish.x - at.x;
        const dy = fish.y - at.y;
        const d = Math.hypot(dx, dy);
        const away = d >= PARAMS.POKE_CENTER * fish.len ? { x: dx / d, y: dy / d } : { x: Math.cos(fish.ang), y: Math.sin(fish.ang) };
        const dash = Core.cruiseSpeed(world, fish) * PARAMS.POKE_DASH;
        fish.vx = away.x * dash;
        fish.vy = away.y * dash;
        const mouth = mouthOf(fish);
        addBubbles(play, world, mouth.x, mouth.y, PARAMS.POKE_BUBBLES + Math.floor(world.random() * 2));

        // 冲击波：别的鱼从点击处被推开
        let pushed = 0;
        for (const other of world.fish) {
            if (other === fish || !poking(other)) continue;
            const ox = other.x - at.x;
            const oy = other.y - at.y;
            const reach = PARAMS.SHOCK_R * world.scale + other.len;
            const od = Math.hypot(ox, oy);
            if (od >= reach) continue;
            const spec = Core.speciesById(other.species);
            const strength = (1 - od / reach) * (spec && spec.kind === 'large' ? PARAMS.SHOCK_LARGE : 1) * Core.cruiseSpeed(world, other) * PARAMS.SHOCK_DASH;
            const dir = od > 1e-6 ? { x: ox / od, y: oy / od } : { x: Math.cos(other.ang), y: Math.sin(other.ang) };
            other.vx += dir.x * strength;
            other.vy += dir.y * strength;
            pushed++;
        }
        addRipple(play, world, at.x, at.y);
        return { ok: true, pushed };
    }

    // ---------- 推进 ----------

    /** 推进一步（dtMs 毫秒，单步最长与核心一致）：涟漪扩散、泡上浮、饲料下沉与被吃、拉尾弹簧，过期的冷却与变亮记录清掉。 */
    function step(play, world, dtMs) {
        const seconds = Number(dtMs) / 1000;
        if (!Number.isFinite(seconds) || seconds < Core.PARAMS.MIN_DT) return;
        const dt = Math.min(seconds, Core.PARAMS.MAX_DT);
        play.time += dt;
        ageEffects(play, world, dt);
        for (const [id, t] of play.pokedAt) if (play.time - t >= PARAMS.POKE_COOLDOWN_S) play.pokedAt.delete(id);
    }

    return { PARAMS, create, resize, counts, poke, step };
});
```

- [ ] **Step 4: 跑测试，确认绿**

```bash
node --test test/aquarium-play-core.test.js
```

期望：

```text
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-play-core.test.js
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium-play-core.js test/aquarium-play-core.test.js`，提交说明：`feat(aquarium): 玩法核心（一）——戳、涟漪、泡`。

---

## Task 3：玩法核心（二）——喂食

**目标。** 在玩法核心里加“撒饲料、饲料下沉、被鱼吃掉、吃到的鱼变亮”。饲料作为**吸引点**交给 Task 1 的 `Core.step`：每条鱼只朝范围内最近的一粒游，靠近时加速；只有游着（`alive`）的鱼吃，离开中、被抓着、还在淡入的不吃；一粒只会被吃一次；吃到的鱼冒泡并“变亮”约 `FED_S = 20` 秒（只是画法用的 0…1 数值，**不写任何存储**，也与任务无关）。

**Files:**
- Modify: `js/aquarium-play-core.js`
- Modify: `test/aquarium-play-core.test.js`

**Interfaces:**
- Consumes: Task 2 的状态；`Core.step` 的 `attractors`（Task 1）。
- Produces（在 Task 2 的导出之外）：
  - `sprinkle(play, world, opts?) → { ok: true, count } | { ok: false, reason }`：`opts` 省略时从屏幕上部落下 `SPRINKLE_COUNT = 6` 粒（横向在中间 60%）；`opts = { x, y }` 时落在那里、每粒在 `DROP_SPREAD` 内散开；`opts.count`（整数 1…`SPRINKLE_MAX`）可改粒数；同屏放不下时只落放得下的那几粒、`count` 如实返回；被拒原因 `invalid | cooldown | busy`（`FEED_COOLDOWN_S = 0.8` 秒内再撒是 `cooldown`，同屏满了是 `busy`），被拒时什么都不改；
  - `attractors(play, world) → [{ x, y, reach, weight, boost }]`：每粒饲料一个；没有饲料时返回同一个冻结的空数组；
  - `extrasOf(play, fish) → { pull: { x, y } | null, fed: 0…1 }`：画这条鱼时要叠加的玩法状态（本任务 `pull` 恒为 `null`，Task 4 之后才会有值；没有任何状态时返回同一个冻结对象）。

- [ ] **Step 1: 先写测试（追加到 `test/aquarium-play-core.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 3 1`（用法见附录 B；也可以照着下面的块手工写）。

相对 Task 2 写下的第一版，差异如下（追加 11 项）：

```diff
--- a/test/aquarium-play-core.test.js
+++ b/test/aquarium-play-core.test.js
@@ -224,5 +224,201 @@
     assert.ok(accepted >= 100, `被接受的戳 ${accepted} 次`);
     assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
     assert.ok(play.bubbles.every(b => [b.x, b.y, b.r].every(Number.isFinite)));
+});
+
+// ---------- 喂食 ----------
+
+const pelletsOf = play => play.pellets.map(p => [p.x, p.y]);
+
+test('撒饲料（从上部落下）：默认 6 粒，横向在中间 60% 里，高度在屏幕上部，每粒各自有 id、下沉速度、相位', () => {
+    const { w, play } = tank('clown');
+    const r = Play.sprinkle(play, w);
+    assert.deepEqual(r, { ok: true, count: P.SPRINKLE_COUNT });
+    assert.equal(play.pellets.length, 6);
+    for (const p of play.pellets) {
+        assert.ok(p.x >= w.width * P.SPRINKLE_X0 && p.x <= w.width * P.SPRINKLE_X1, `x ${p.x}`);
+        assert.ok(Math.abs(p.y - w.height * P.SPRINKLE_Y) <= 5 * w.scale + 1e-9, `y ${p.y}`);
+        assert.ok(p.sink >= P.PELLET_SINK * w.scale * 0.85 && p.sink <= P.PELLET_SINK * w.scale * 1.15);
+    }
+    assert.equal(new Set(play.pellets.map(p => p.id)).size, 6);
+    assert.ok(new Set(play.pellets.map(p => Math.round(p.x))).size >= 4, '横向是随机散开的，不是一条线');
+});
+
+test('撒饲料（落在指定处）：每粒在 ±DROP_SPREAD 个像素内散开（乘视口缩放），始终在画布里；可指定粒数', () => {
+    const { w, play } = tank('clown');
+    assert.deepEqual(Play.sprinkle(play, w, { x: 600, y: 300, count: 4 }), { ok: true, count: 4 });
+    for (const p of play.pellets) {
+        assert.ok(Math.abs(p.x - 600) <= P.DROP_SPREAD * w.scale && Math.abs(p.y - 300) <= P.DROP_SPREAD * w.scale);
+    }
+    const edge = tank('clown');
+    Play.sprinkle(edge.play, edge.w, { x: 3, y: edge.w.height - 2, count: 12 });
+    for (const p of edge.play.pellets) assert.ok(p.x >= 0 && p.y <= edge.w.height && p.x <= edge.w.width && p.y >= 0);
+});
+
+test('撒饲料：0.8 秒冷却内被拒绝（什么都不改）；同屏满了返回 busy；只放得下几粒时只落那几粒；省流量上限 8', () => {
+    const { w, play } = tank('clown');
+    assert.equal(Play.sprinkle(play, w).ok, true);
+    const before = JSON.stringify(pelletsOf(play));
+    assert.deepEqual(Play.sprinkle(play, w), { ok: false, reason: 'cooldown' });
+    assert.equal(JSON.stringify(pelletsOf(play)), before);
+    for (let i = 0; i < 15; i++) Play.step(play, w, 50);                      // 0.75 秒：还在冷却
+    assert.equal(Play.sprinkle(play, w).reason, 'cooldown');
+    Play.step(play, w, 50);                                                    // 0.8 秒
+    assert.equal(Play.sprinkle(play, w).ok, true);
+    while (play.pellets.length < P.MAX_PELLETS - 3) { play.lastSprinkle = -Infinity; Play.sprinkle(play, w, { count: 1 }); }
+    play.lastSprinkle = -Infinity;
+    assert.deepEqual(Play.sprinkle(play, w), { ok: true, count: 3 }, '放得下 3 粒就只落 3 粒');
+    assert.equal(play.pellets.length, P.MAX_PELLETS);
+    play.lastSprinkle = -Infinity;
+    assert.deepEqual(Play.sprinkle(play, w), { ok: false, reason: 'busy' });
+    const low = tank('clown', { extra: { lowPower: true } });
+    assert.deepEqual(Play.sprinkle(low.play, low.w), { ok: true, count: 6 });
+    low.play.lastSprinkle = -Infinity;
+    assert.deepEqual(Play.sprinkle(low.play, low.w), { ok: true, count: 2 });
+    assert.equal(low.play.pellets.length, P.MAX_PELLETS_LOW);
+});
+
+test('撒饲料：坏输入被拒绝且什么都不改（只给 x 不给 y、非有限数、粒数不是 1…12 的整数、opts 不是对象按没给处理）', () => {
+    const { w, play } = tank('clown');
+    for (const opts of [{ x: 1 }, { y: 1 }, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 'a', y: 2 }, { count: 0 }, { count: 1.5 }, { count: 13 }, { count: -1 }, { count: '6' }, { count: NaN }, { x: 1, y: 1, count: 99 }]) {
+        assert.deepEqual(Play.sprinkle(play, w, opts), { ok: false, reason: 'invalid' }, JSON.stringify(opts));
+    }
+    assert.equal(play.pellets.length, 0);
+    assert.equal(play.lastSprinkle, -Infinity, '被拒绝的撒不开启冷却');
+    for (const opts of [null, 7, 'x', undefined]) { play.lastSprinkle = -Infinity; assert.equal(Play.sprinkle(play, w, opts).ok, true, String(opts)); }
+});
+
+test('饲料：慢慢下沉并左右轻摆，到 14 秒或沉出画面就消失', () => {
+    const { w, play } = tank('puffer', { x: 100, y: 100 });
+    Play.sprinkle(play, w, { x: 1000, y: 200, count: 3 });
+    const y0 = play.pellets.map(p => p.y);
+    const x0 = play.pellets.map(p => p.x);
+    for (let i = 0; i < 20; i++) Play.step(play, w, 50);                      // 1 秒
+    play.pellets.forEach((p, i) => {
+        assert.ok(Math.abs(p.y - y0[i] - p.sink) < 1e-6, '每秒下沉 sink 个像素');
+        assert.ok(p.x !== x0[i], '左右在摆');
+    });
+    for (let i = 0; i < 11 * 20; i++) Play.step(play, w, 50);                // 12 秒：高度 200 + 12×40×0.8 = 584 < 720，还在
+    assert.equal(play.pellets.length, 3);
+    for (let i = 0; i < 3 * 20; i++) Play.step(play, w, 50);                 // 15 秒：已过 14 秒寿命
+    assert.equal(play.pellets.length, 0);
+    const deep = tank('puffer', { x: 100, y: 100 });
+    Play.sprinkle(deep.play, deep.w, { x: 1000, y: 700, count: 2 });
+    for (let i = 0; i < 20 * 2; i++) Play.step(deep.play, deep.w, 50);       // 2 秒后沉出 720 + 20
+    assert.equal(deep.play.pellets.length, 0, '沉出画面的饲料被丢掉');
+});
+
+test('attractors：每粒饲料一个吸引点，范围、权重、速度倍数取自参数（范围乘视口缩放）；没有饲料时是空的', () => {
+    const { w, play } = tank('clown');
+    assert.equal(Play.attractors(play, w).length, 0);
+    assert.equal(Play.attractors(play, w), Play.attractors(play, w), '没有饲料时返回同一个空数组，不每帧分配');
+    Play.sprinkle(play, w, { x: 600, y: 300, count: 3 });
+    const list = Play.attractors(play, w);
+    assert.equal(list.length, 3);
+    list.forEach((a, i) => {
+        assert.deepEqual(a, { x: play.pellets[i].x, y: play.pellets[i].y, reach: P.ATTRACT_REACH * w.scale, weight: P.ATTRACT_W, boost: P.ATTRACT_BOOST });
+    });
+});
+
+test('吃：游着的鱼碰到饲料（距离 < 0.45×体长 + 4）就吃掉，同一粒只被吃一次；吃到的变亮并冒 2 个泡', () => {
+    const { w, play, fish } = tank('clown');
+    const eatR = P.EAT_R_LEN * fish.len + P.EAT_R_PAD;
+    play.pellets.push({ id: 1, x: fish.x + eatR + 5, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
+    play.pellets.push({ id: 2, x: fish.x + eatR - 3, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
+    Play.step(play, w, 50);
+    assert.deepEqual(play.pellets.map(p => p.id), [1], '近的被吃，远的还在');
+    assert.ok(play.fed.has(fish.id));
+    assert.equal(play.bubbles.length, P.EAT_BUBBLES);
+    assert.equal(Play.extrasOf(play, fish).fed, 0, '吃到的这一帧还没亮');
+    Play.step(play, w, 50);
+    const extras = Play.extrasOf(play, fish);
+    assert.ok(extras.fed > 0 && extras.fed <= 1, `下一帧开始亮 ${extras.fed}`);
 });
 
+test('吃：两条鱼同样近时只有先出现的那条吃到；更近的那条优先；离开中、被抓着、淡入中的鱼不吃', () => {
+    const t = tank('clown', { others: [['angel'], ['puffer'], ['hammer']] });
+    const { w, play } = t;
+    const [a, b, c, d] = w.fish;
+    for (const f of w.fish) place(f, 500, 400, 5000);
+    place(a, 500, 400, 0); place(b, 500, 400, 0);
+    play.pellets.push({ id: 1, x: 500, y: 400, t: 0, ph: 0, sink: 0, life: 14 });
+    Play.step(play, w, 50);
+    assert.deepEqual([...play.fed.keys()], [a.id], '一样近：先出现的吃');
+    const t2 = tank('clown', { others: [['angel']] });
+    const [near, far] = t2.w.fish;
+    place(far, 500, 400, 6); place(near, 500, 400, 3);
+    t2.play.pellets.push({ id: 1, x: 500, y: 400, t: 0, ph: 0, sink: 0, life: 14 });
+    Play.step(t2.play, t2.w, 50);
+    assert.deepEqual([...t2.play.fed.keys()], [near.id], '更近的吃');
+    for (const state of ['leaving', 'held', 'entering']) {
+        const s = tank('clown');
+        s.fish.state = state;
+        s.play.pellets.push({ id: 1, x: s.fish.x, y: s.fish.y, t: 0, ph: 0, sink: 0, life: 14 });
+        Play.step(s.play, s.w, 50);
+        assert.equal(s.play.pellets.length, 1, `${state} 的鱼不吃`);
+        assert.equal(s.play.fed.size, 0);
+    }
+});
+
+test('变亮：吃到后 FED_IN_S 内亮起、保持，最后 FED_OUT_S 内渐渐暗下，到 20 秒记录清掉；再吃一粒从头续满 20 秒', () => {
+    const { w, play, fish } = tank('clown');
+    play.pellets.push({ id: 1, x: fish.x, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
+    Play.step(play, w, 50);
+    const level = () => Play.extrasOf(play, fish).fed;
+    assert.equal(level(), 0, '吃到的这一帧是 0');
+    Play.step(play, w, 50);
+    assert.ok(Math.abs(level() - 0.05 / P.FED_IN_S) < 1e-9, '下一帧亮了一小截');
+    for (let i = 0; i < 5; i++) Play.step(play, w, 50);
+    assert.equal(level(), 1);
+    for (let i = 0; i < 20 * 15; i++) Play.step(play, w, 50);                // 吃到后第 15.3 秒
+    assert.equal(level(), 1);
+    for (let i = 0; i < 20 * 3; i++) Play.step(play, w, 50);                 // 第 18.3 秒：剩 1.7 秒，在渐暗里
+    assert.ok(level() > 0.4 && level() < 0.7, `渐暗中 ${level()}`);
+    play.pellets.push({ id: 2, x: fish.x, y: fish.y, t: 0, ph: 0, sink: 0, life: 14 });
+    Play.step(play, w, 50);                                                    // 再吃一粒：续满 20 秒
+    for (let i = 0; i < 20 * 10; i++) Play.step(play, w, 50);
+    assert.equal(level(), 1);
+    for (let i = 0; i < 20 * 12; i++) Play.step(play, w, 50);
+    assert.equal(play.fed.size, 0);
+    assert.equal(Play.extrasOf(play, fish), Play.extrasOf(play, { id: 'nobody' }), '没有玩法状态时返回同一个冻结对象，不分配');
+    assert.deepEqual(Play.extrasOf(play, fish), { pull: null, fed: 0 });
+});
+
+test('和核心一起：范围内的鱼游向饲料并吃到，范围外的鱼不理会', () => {
+    let ate = 0;
+    for (let seed = 1; seed <= 6; seed++) {
+        const { w, play, fish } = tank('clown', { extra: { random: seeded(seed) }, others: [['angel']] });
+        const bystander = w.fish[1];
+        place(bystander, 500, 400, 3000);
+        bystander.x = 3000; bystander.y = 400;
+        Play.sprinkle(play, w, { x: 700, y: 400, count: 1 });
+        for (let i = 0; i < 300 && play.pellets.length; i++) {
+            Core.step(w, 50, { attractors: Play.attractors(play, w) });
+            Play.step(play, w, 50);
+        }
+        if (play.fed.has(fish.id)) ate++;
+        assert.ok(!play.fed.has(bystander.id));
+    }
+    assert.ok(ate >= 5, `6 个种子里只有 ${ate} 次吃到`);
+});
+
+test('随机撒与戳 120 秒：饲料、泡、涟漪、变亮记录的数量始终有界，数字有限（并且真的撒了、戳了、吃到了，不是空跑）', () => {
+    const { w, play } = tank('clown', { others: [['tang'], ['neon'], ['hammer'], ['manta'], ['puffer'], ['angel']] });
+    const rnd = seeded(5);
+    let sprinkled = 0;
+    let poked = 0;
+    let peakFed = 0;
+    for (let i = 0; i < 2400; i++) {
+        if (i % 23 === 0 && Play.sprinkle(play, w, rnd() < 0.5 ? undefined : { x: rnd() * 1280, y: rnd() * 720 }).ok) sprinkled++;
+        if (i % 37 === 0 && Play.poke(play, w, w.fish[Math.floor(rnd() * w.fish.length)], { x: rnd() * 1280, y: rnd() * 720 }).ok) poked++;
+        Core.step(w, 50, { attractors: Play.attractors(play, w) });
+        Play.step(play, w, 50);
+        const c = Play.counts(play);
+        peakFed = Math.max(peakFed, c.fed);
+        assert.ok(c.pellets <= P.MAX_PELLETS && c.bubbles <= P.MAX_BUBBLES && c.ripples <= P.MAX_RIPPLES && c.fed <= w.fish.length);
+    }
+    assert.ok(sprinkled >= 50 && poked >= 30 && peakFed >= 5, `撒 ${sprinkled} 次、戳 ${poked} 次、同时变亮最多 ${peakFed} 条`);
+    assert.ok(play.pellets.every(p => [p.x, p.y].every(Number.isFinite)));
+    assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
+});
+
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-play-core.test.js
```

期望：

```text
ℹ tests 25
ℹ pass 14
ℹ fail 11
```

失败的 11 项（第一个失败的原因是 `Play.sprinkle is not a function`）：

- `撒饲料（从上部落下）：默认 6 粒，横向在中间 60% 里，高度在屏幕上部，每粒各自有 id、下沉速度、相位`
- `撒饲料（落在指定处）：每粒在 ±DROP_SPREAD 个像素内散开（乘视口缩放），始终在画布里；可指定粒数`
- `撒饲料：0.8 秒冷却内被拒绝（什么都不改）；同屏满了返回 busy；只放得下几粒时只落那几粒；省流量上限 8`
- `撒饲料：坏输入被拒绝且什么都不改（只给 x 不给 y、非有限数、粒数不是 1…12 的整数、opts 不是对象按没给处理）`
- `饲料：慢慢下沉并左右轻摆，到 14 秒或沉出画面就消失`
- `attractors：每粒饲料一个吸引点，范围、权重、速度倍数取自参数（范围乘视口缩放）；没有饲料时是空的`
- `吃：游着的鱼碰到饲料（距离 < 0.45×体长 + 4）就吃掉，同一粒只被吃一次；吃到的变亮并冒 2 个泡`
- `吃：两条鱼同样近时只有先出现的那条吃到；更近的那条优先；离开中、被抓着、淡入中的鱼不吃`
- `变亮：吃到后 FED_IN_S 内亮起、保持，最后 FED_OUT_S 内渐渐暗下，到 20 秒记录清掉；再吃一粒从头续满 20 秒`
- `和核心一起：范围内的鱼游向饲料并吃到，范围外的鱼不理会`
- `随机撒与戳 120 秒：饲料、泡、涟漪、变亮记录的数量始终有界，数字有限（并且真的撒了、戳了、吃到了，不是空跑）`

- [ ] **Step 3: 写实现（修改 `js/aquarium-play-core.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 3 3`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/js/aquarium-play-core.js
+++ b/js/aquarium-play-core.js
@@ -180,6 +180,94 @@
         return { ok: true, pushed };
     }
 
+    // ---------- 喂食 ----------
+
+    const NO_ATTRACTORS = Object.freeze([]);
+    const maxPellets = world => (world.lowPower ? PARAMS.MAX_PELLETS_LOW : PARAMS.MAX_PELLETS);
+
+    /**
+     * 撒饲料。opts 为空：从屏幕上部落下 SPRINKLE_COUNT 粒（横向在中间 60% 里随机）；opts = { x, y }：落在那里，每粒在 DROP_SPREAD 内散开；
+     * opts.count 可改粒数（整数 1…SPRINKLE_MAX）。同屏饲料放不下时只落放得下的那几粒，count 如实返回。
+     * 拒绝时返回 { ok: false, reason: 'invalid' | 'cooldown' | 'busy' }，什么都不改。
+     */
+    function sprinkle(play, world, opts) {
+        const o = opts && typeof opts === 'object' ? opts : {};
+        const given = o.x !== undefined || o.y !== undefined;
+        if (given && !finite(o.x, o.y)) return { ok: false, reason: 'invalid' };
+        const count = o.count === undefined ? PARAMS.SPRINKLE_COUNT : o.count;
+        if (!Number.isInteger(count) || count < 1 || count > PARAMS.SPRINKLE_MAX) return { ok: false, reason: 'invalid' };
+        if (play.time - play.lastSprinkle < PARAMS.FEED_COOLDOWN_S) return { ok: false, reason: 'cooldown' };
+        const room = maxPellets(world) - play.pellets.length;
+        if (room <= 0) return { ok: false, reason: 'busy' };
+        const n = Math.min(count, room);
+        const k = world.scale;
+        for (let i = 0; i < n; i++) {
+            const x = given
+                ? clamp(o.x + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.width)
+                : world.width * (PARAMS.SPRINKLE_X0 + (PARAMS.SPRINKLE_X1 - PARAMS.SPRINKLE_X0) * world.random());
+            const y = given
+                ? clamp(o.y + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.height)
+                : world.height * PARAMS.SPRINKLE_Y + (world.random() - 0.5) * 10 * k;
+            play.pellets.push({ id: play.nextId++, x, y, t: 0, ph: world.random() * TAU, sink: PARAMS.PELLET_SINK * k * (0.85 + 0.3 * world.random()), life: PARAMS.PELLET_LIFE_S });
+        }
+        play.lastSprinkle = play.time;
+        return { ok: true, count: n };
+    }
+
+    /** 饲料对鱼的吸引点，交给 Core.step 的 attractors（每粒一个，核心里每条鱼只朝范围内最近的一个走）。 */
+    function attractors(play, world) {
+        if (!play.pellets.length) return NO_ATTRACTORS;
+        const reach = PARAMS.ATTRACT_REACH * world.scale;
+        return play.pellets.map(p => ({ x: p.x, y: p.y, reach, weight: PARAMS.ATTRACT_W, boost: PARAMS.ATTRACT_BOOST }));
+    }
+
+    /** 吃到这粒饲料的鱼：只有游着的（alive）鱼吃，离开中、被抓着、还在淡入的不吃；够得着的里取最近的，一样近取先出现的。 */
+    function eaterOf(world, pellet) {
+        let best = null;
+        let bestD = Infinity;
+        for (const f of world.fish) {
+            if (f.state !== 'alive') continue;
+            const d = Math.hypot(f.x - pellet.x, f.y - pellet.y);
+            if (d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d < bestD) { best = f; bestD = d; }
+        }
+        return best;
+    }
+
+    function stepPellets(play, world, dt) {
+        if (!play.pellets.length) return;
+        const kept = [];
+        for (const p of play.pellets) {
+            p.t += dt;
+            p.y += p.sink * dt;
+            p.x += Math.sin(p.t * 1.7 + p.ph) * 9 * world.scale * dt;
+            if (p.t >= p.life || p.y > world.height + 20) continue;           // 过期或沉出画面
+            const eater = eaterOf(world, p);
+            if (eater) {                                                     // 被吃掉：这一粒立刻消失，所以同一粒只会被吃一次
+                play.fed.set(eater.id, play.time + PARAMS.FED_S);
+                const mouth = mouthOf(eater);
+                addBubbles(play, world, mouth.x, mouth.y, PARAMS.EAT_BUBBLES);
+                continue;
+            }
+            kept.push(p);
+        }
+        play.pellets = kept;
+    }
+
+    const NO_EXTRAS = Object.freeze({ pull: null, fed: 0 });
+
+    /** 画这条鱼时要叠加的玩法状态：{ pull: {x, y} | null（拉尾弹簧，鱼本地 px）, fed: 0…1（变亮程度，先快速亮起、最后几秒渐渐暗下） }。 */
+    function extrasOf(play, fish) {
+        const p = play.pulls.get(fish.id);
+        const until = play.fed.get(fish.id);
+        if (!p && until === undefined) return NO_EXTRAS;
+        let fed = 0;
+        if (until !== undefined) {
+            const remain = until - play.time;
+            fed = clamp(Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S), 0, 1);
+        }
+        return { pull: p ? { x: p.x, y: p.y } : null, fed };
+    }
+
     // ---------- 推进 ----------
 
     /** 推进一步（dtMs 毫秒，单步最长与核心一致）：涟漪扩散、泡上浮、饲料下沉与被吃、拉尾弹簧，过期的冷却与变亮记录清掉。 */
@@ -189,8 +277,10 @@
         const dt = Math.min(seconds, Core.PARAMS.MAX_DT);
         play.time += dt;
         ageEffects(play, world, dt);
+        stepPellets(play, world, dt);
         for (const [id, t] of play.pokedAt) if (play.time - t >= PARAMS.POKE_COOLDOWN_S) play.pokedAt.delete(id);
+        for (const [id, until] of play.fed) if (until <= play.time) play.fed.delete(id);
     }
 
-    return { PARAMS, create, resize, counts, poke, step };
+    return { PARAMS, create, resize, counts, poke, sprinkle, attractors, extrasOf, step };
 });
```

- [ ] **Step 4: 跑测试，确认绿**

```bash
node --test test/aquarium-play-core.test.js
```

期望：

```text
ℹ tests 25
ℹ pass 25
ℹ fail 0
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-play-core.test.js
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium-play-core.js test/aquarium-play-core.test.js`，提交说明：`feat(aquarium): 玩法核心（二）——撒饲料、吃、变亮`。

---

## Task 4：玩法核心（三）——拉鱼尾

**目标。** 在玩法核心里加“拉鱼尾”的规则。被拉尾抓住（Task 1 的 `Core.grab(…, { tail: true })`）的鱼，核心已经让被抓点留在指针下、鱼头朝远离指针运动的方向；玩法核心再给尾巴一根**二阶阻尼弹簧**：拖着走时弹簧趋向“指针速度 × `PULL_GAIN`”的位移（方向是指针运动方向、折算到鱼本地坐标，大小不超过 `min(PULL_MAX × 体长, PULL_ABS × 视口缩放)`），松手后目标回到 0、尾巴回弹一次再停稳，同时鱼朝鱼头方向冲一下（`RELEASE_DASH × 巡航速度`）并冒泡。这个位移**只是画法用的数值**（见 `extrasOf`），不改变鱼的位置与碰撞。成群小鱼（霓虹灯鱼、蓝吊）太小、看不出拉伸，不做拉尾。

**Files:**
- Modify: `js/aquarium-play-core.js`
- Modify: `test/aquarium-play-core.test.js`

**Interfaces:**
- Consumes: Task 1 的 `Core.grab(…, { tail: true })` 与 `fish.held.pvx / pvy`；Task 3 的 `extrasOf`。
- Produces（在前两个任务的导出之外）：
  - `isTailZone(fish, x, y) → boolean`：`(x, y)` 在鱼的后半身（鱼本地坐标 `x ≤ TAIL_ZONE × 体长`，`TAIL_ZONE = 0`，鼻子朝 +x）；成群小鱼、未知种类、坏输入一律 `false`；
  - `beginHold(play, world, fish) → { ok: true } | { ok: false, reason: 'state' }`：`fish` 必须在 world 里、是 `held` 且 `fish.held.tail` 为真；弹簧从 0 开始；
  - `endHold(play, world, fish, opts?) → { ok: true } | { ok: false, reason: 'state' }`：默认（拖过之后松手，调用前应已 `Core.release`、鱼是 `alive`）冲刺 + 冒泡，尾巴由 `step` 带阻尼回弹；鱼不是 `alive`（比如已被捞起）时只回弹、不冲刺不冒泡；`opts.quiet`（没拖就松手、被捞起等）直接清掉弹簧；没有拉尾记录时返回 `state`；
  - `extrasOf` 现在会返回 `pull`。

- [ ] **Step 1: 先写测试（追加到 `test/aquarium-play-core.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 4 1`（用法见附录 B；也可以照着下面的块手工写）。

差异如下（追加 12 项；其中“60 秒随机拉尾”一项带存活断言——断言拉尾真的发生过若干次，否则这类随机测试会空转、什么都测不到）：

```diff
--- a/test/aquarium-play-core.test.js
+++ b/test/aquarium-play-core.test.js
@@ -420,5 +420,251 @@
     assert.ok(sprinkled >= 50 && poked >= 30 && peakFed >= 5, `撒 ${sprinkled} 次、戳 ${poked} 次、同时变亮最多 ${peakFed} 条`);
     assert.ok(play.pellets.every(p => [p.x, p.y].every(Number.isFinite)));
     assert.ok(w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
+});
+
+// ---------- 拉尾 ----------
+
+/** 抓住一条鱼的后半身（拉尾）：鱼在 (500, 400) 朝东，按在西侧 0.3 个体长处；返回 { w, play, fish, pointer }，pointer 是当前指针（可被 drive 推进）。 */
+function holdTail(species = 'hammer', extra = {}) {
+    const t = tank(species, extra);
+    const gx = t.fish.x - t.fish.len * 0.3;
+    assert.equal(Play.isTailZone(t.fish, gx, t.fish.y), true);
+    assert.equal(Core.grab(t.w, t.fish, gx, t.fish.y, { tail: true }), true);
+    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: true });
+    t.pointer = { x: gx, y: t.fish.y };
+    return t;
+}
+/** 让指针以 (vx, vy) px/s 运动 seconds 秒，鱼与玩法状态一起推进。 */
+function drive(t, vx, vy, seconds) {
+    for (let i = 0; i < seconds * 20; i++) {
+        t.pointer = { x: t.pointer.x + vx * 0.05, y: t.pointer.y + vy * 0.05 };
+        Core.step(t.w, 50, { pointer: t.pointer });
+        Play.step(t.play, t.w, 50);
+    }
+}
+const pullOf = t => t.play.pulls.get(t.fish.id);
+
+test('isTailZone：只有后半身（本地 x ≤ 0）算，随鱼的朝向转；成群小鱼、坏输入一律不算', () => {
+    const { fish } = tank('clown');
+    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y), true);
+    assert.equal(Play.isTailZone(fish, fish.x, fish.y), true, '正好在中线上算后半身');
+    assert.equal(Play.isTailZone(fish, fish.x + 0.1, fish.y), false);
+    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y + 8), true, '后半身偏上下一点也算');
+    fish.ang = Math.PI;                                                       // 朝西：尾巴在东侧
+    assert.equal(Play.isTailZone(fish, fish.x + 10, fish.y), true);
+    assert.equal(Play.isTailZone(fish, fish.x - 10, fish.y), false);
+    fish.ang = -Math.PI / 2;                                                  // 朝北：尾巴在南侧
+    assert.equal(Play.isTailZone(fish, fish.x, fish.y + 10), true);
+    assert.equal(Play.isTailZone(fish, fish.x, fish.y - 10), false);
+    for (const species of ['neon', 'tang']) {
+        const s = tank(species);
+        assert.equal(Play.isTailZone(s.fish, s.fish.x - 5, s.fish.y), false, `${species} 不做拉尾`);
+    }
+    for (const species of ['puffer', 'angel', 'hammer', 'manta', 'whaleshark']) {
+        const s = tank(species);
+        assert.equal(Play.isTailZone(s.fish, s.fish.x - 5, s.fish.y), true, `${species} 可以拉尾`);
+    }
+    assert.equal(Play.isTailZone(null, 1, 1), false);
+    assert.equal(Play.isTailZone(fish, NaN, 1), false);
+    assert.equal(Play.isTailZone(fish, -Infinity, fish.y), false, '无穷远不算后半身');
+    assert.equal(Play.isTailZone(fish, fish.x - 5, Infinity), false);
+    assert.equal(Play.isTailZone({ ...fish, species: 'kraken' }, fish.x - 5, fish.y), false);
+    assert.equal(Play.isTailZone({ ...fish, ang: NaN }, fish.x - 5, fish.y), false);
+});
+
+test('beginHold / endHold：只接受用拉尾方式抓住、且在 world 里的鱼；没有记录时 endHold 返回 state', () => {
+    const t = tank('hammer');
+    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '没抓住');
+    assert.equal(Core.grab(t.w, t.fish, t.fish.x, t.fish.y), true);
+    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '普通抓取不是拉尾');
+    assert.deepEqual(Play.beginHold(t.play, t.w, null), { ok: false, reason: 'state' });
+    Core.release(t.w, t.fish);
+    assert.equal(Core.grab(t.w, t.fish, t.fish.x - 5, t.fish.y, { tail: true }), true);
+    assert.deepEqual(Play.beginHold(t.play, t.w, { ...t.fish }), { ok: false, reason: 'state' }, '不在 world 里的副本');
+    assert.equal(t.play.pulls.size, 0);
+    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: false, reason: 'state' }, '还没有记录');
+    assert.deepEqual(Play.endHold(t.play, t.w, null), { ok: false, reason: 'state' });
+    assert.deepEqual(Play.beginHold(t.play, t.w, t.fish), { ok: true });
+    assert.equal(t.play.pulls.size, 1);
+});
+
+test('拉伸：拖着走时弹簧趋向“指针速度 × PULL_GAIN”的位移，方向是指针运动方向（折算到鱼本地坐标），不超过体长 × PULL_MAX 与绝对上限', () => {
+    const t = holdTail('hammer');
+    drive(t, 300, 0, 1.5);                                                     // 向东拖：鱼头已转向西，本地 −x 就是指针运动的方向
+    const p = pullOf(t);
+    const expected = Math.min(300 * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
+    assert.ok(Math.abs(p.x + expected) < 0.5, `拉伸 ${p.x}，预期 ≈ ${-expected}`);
+    assert.ok(Math.abs(p.y) < 0.5, `横向 ${p.y}`);
+    const extras = Play.extrasOf(t.play, t.fish);
+    assert.ok(extras.pull.x < 0);
+    assert.notEqual(extras.pull, pullOf(t), '给画法的是副本，不是内部状态');
+    assert.deepEqual(extras.pull, { x: pullOf(t).x, y: pullOf(t).y });
+    const slow = holdTail('hammer');
+    drive(slow, 60, 0, 1.5);
+    assert.ok(Math.abs(pullOf(slow).x + 60 * P.PULL_GAIN) < 0.3, '慢速拖：拉伸小，与速度成正比');
+    const still = holdTail('hammer');
+    drive(still, 0, 0, 1);
+    assert.ok(Math.abs(pullOf(still).x) < 1e-6 && Math.abs(pullOf(still).y) < 1e-6, '指针不动：不拉伸');
+});
+
+test('拉伸上限：快速拖时不超过 体长 × PULL_MAX，大鱼不超过绝对上限 PULL_ABS × 视口缩放', () => {
+    const small = holdTail('puffer');
+    drive(small, 1500, 0, 1.5);
+    assert.ok(Math.hypot(pullOf(small).x, pullOf(small).y) <= P.PULL_MAX * small.fish.len + 1e-6);
+    assert.ok(Math.hypot(pullOf(small).x, pullOf(small).y) > 0.8 * P.PULL_MAX * small.fish.len, '快速拖能拉到接近上限');
+    const big = holdTail('whaleshark');
+    drive(big, 1500, 0, 1.5);
+    const m = Math.hypot(pullOf(big).x, pullOf(big).y);
+    assert.ok(m <= P.PULL_ABS * big.w.scale + 1e-6 && m > 0.8 * P.PULL_ABS * big.w.scale, `大鱼 ${m}`);
+    assert.ok(P.PULL_ABS * big.w.scale < P.PULL_MAX * big.fish.len, '这条鱼的体长上限更大，所以是绝对上限在起作用');
+});
+
+test('拉伸方向：指针速度折算到鱼本地坐标——鱼头朝南、指针向东拖时，目标在本地 −y 方向（逐轴核对符号）', () => {
+    const t = holdTail('hammer');
+    t.fish.ang = Math.PI / 2;                                                  // 朝南：本地 +x 指向南，本地 +y 指向西
+    t.fish.held.pvx = 300; t.fish.held.pvy = 0;                                // 指针向东：本地坐标里是 −y
+    for (let i = 0; i < 40; i++) Play.step(t.play, t.w, 50);                   // 只推进玩法状态，鱼和指针速度不动
+    const expected = Math.min(300 * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
+    assert.ok(Math.abs(pullOf(t).y + expected) < 0.2 && Math.abs(pullOf(t).x) < 0.2, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}，预期 (0, ${-expected})`);
+    t.fish.held.pvx = -200; t.fish.held.pvy = -100;                            // 指针向西北：本地 x = uy·(+1)... 逐分量核对
+    for (let i = 0; i < 40; i++) Play.step(t.play, t.w, 50);
+    const sp = Math.hypot(200, 100);
+    const mag = Math.min(sp * P.PULL_GAIN, P.PULL_MAX * t.fish.len, P.PULL_ABS * t.w.scale);
+    // ang = 90°：本地 x = ux·cos + uy·sin = uy；本地 y = −ux·sin + uy·cos = −ux
+    assert.ok(Math.abs(pullOf(t).x - (-100 / sp) * mag) < 0.2 && Math.abs(pullOf(t).y - (200 / sp) * mag) < 0.2, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}`);
+});
+
+test('拉伸方向：垂直方向拖时弹簧永远有限，突然改向也一样', () => {
+    const t = holdTail('hammer');
+    drive(t, 0, 300, 1.5);                                                     // 向南拖：鱼头转向北，本地 −x 指向南，所以仍是 −x
+    assert.ok(pullOf(t).x < -1 && Math.abs(pullOf(t).y) < 0.5, `拉伸 ${pullOf(t).x}, ${pullOf(t).y}`);
+    drive(t, 150, 0, 0.3);                                                     // 突然改向东拖：转身过程中会有横向分量
+    assert.ok([pullOf(t).x, pullOf(t).y, pullOf(t).vx, pullOf(t).vy].every(Number.isFinite));
+});
+
+test('松手：鱼朝鱼头方向冲一下（RELEASE_DASH × 巡航速度）、冒 2 个泡；尾巴回弹一次（过零、反向幅度小于第一次的 25%）后在 2 秒内停稳并清掉记录', () => {
+    const t = holdTail('hammer');
+    drive(t, 300, 0, 1.5);
+    const peak = pullOf(t).x;
+    assert.ok(peak < -1);
+    const bubbles = t.play.bubbles.length;
+    Core.release(t.w, t.fish, { vx: 300, vy: 0 });
+    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: true });
+    const dash = Core.cruiseSpeed(t.w, t.fish) * P.RELEASE_DASH;
+    assert.ok(Math.abs(t.fish.vx - Math.cos(t.fish.ang) * dash) < 1e-9 && Math.abs(t.fish.vy - Math.sin(t.fish.ang) * dash) < 1e-9);
+    assert.equal(t.play.bubbles.length, bubbles + P.RELEASE_BUBBLES);
+    let maxBack = 0;
+    let crossed = false;
+    let steps = 0;
+    while (pullOf(t) && steps < 100) {
+        Core.step(t.w, 50, {});
+        Play.step(t.play, t.w, 50);
+        steps++;
+        const p = pullOf(t);
+        if (p && p.x > 0) { crossed = true; maxBack = Math.max(maxBack, p.x); }
+    }
+    assert.ok(steps <= 40, `停稳用了 ${steps} 帧`);
+    assert.ok(crossed, '回弹过零');
+    assert.ok(maxBack < 0.25 * -peak, `回弹幅度 ${maxBack} 应小于第一次拉伸 ${-peak} 的 25%`);
+    assert.equal(t.play.pulls.size, 0);
 });
 
+test('松手时鱼已经不是 alive（例如刚被捞起）：只回弹，不冲刺、不冒泡、速度不变', () => {
+    const t = holdTail('hammer');
+    drive(t, 300, 0, 1);
+    Core.release(t.w, t.fish, { vx: 300, vy: 0 });
+    t.fish.state = 'leaving';
+    const v = [t.fish.vx, t.fish.vy];
+    const bubbles = t.play.bubbles.length;
+    assert.deepEqual(Play.endHold(t.play, t.w, t.fish), { ok: true });
+    assert.deepEqual([t.fish.vx, t.fish.vy], v);
+    assert.equal(t.play.bubbles.length, bubbles);
+});
+
+test('quiet：没拖就松手（或被捞起）时直接清掉弹簧——没有冲刺、没有泡、速度不变', () => {
+    const t = holdTail('hammer');
+    drive(t, 300, 0, 0.5);
+    Core.release(t.w, t.fish);
+    const v = [t.fish.vx, t.fish.vy];
+    const bubbles = t.play.bubbles.length;
+    assert.deepEqual(Play.endHold(t.play, t.w, t.fish, { quiet: true }), { ok: true });
+    assert.equal(t.play.pulls.size, 0);
+    assert.deepEqual([t.fish.vx, t.fish.vy], v);
+    assert.equal(t.play.bubbles.length, bubbles);
+});
+
+test('清理：鱼被捞走（离开中）或不在了，弹簧记录下一步就清掉（不等回弹）；被别处放开（没走 endHold）自己回到 0 并清掉，不冲刺', () => {
+    const gone = holdTail('hammer');
+    drive(gone, 300, 0, 1);
+    assert.ok(Math.abs(pullOf(gone).x) > 1, '拉着时有拉伸');
+    gone.fish.state = 'leaving';
+    Play.step(gone.play, gone.w, 50);
+    assert.equal(gone.play.pulls.size, 0);
+    const missing = holdTail('hammer');
+    missing.w.fish.length = 0;
+    Play.step(missing.play, missing.w, 50);
+    assert.equal(missing.play.pulls.size, 0);
+    const freed = holdTail('hammer');
+    drive(freed, 300, 0, 1);
+    Core.release(freed.w, freed.fish);
+    const v = [freed.fish.vx, freed.fish.vy];
+    for (let i = 0; i < 60; i++) { Play.step(freed.play, freed.w, 50); }
+    assert.equal(freed.play.pulls.size, 0, '放开后弹簧自己回到 0 并被清掉');
+    assert.equal(freed.play.bubbles.length, 0, '没有 endHold 就没有泡');
+    assert.ok(v.every(Number.isFinite));
+});
+
+test('被前半身的普通抓取接手：旧的拉尾弹簧目标回到 0（不读不存在的指针速度），停稳后清掉，没有 NaN', () => {
+    const t = holdTail('hammer');
+    drive(t, 400, 0, 1);
+    assert.ok(Math.abs(pullOf(t).x) > 1);
+    Core.release(t.w, t.fish);                                                  // 松手但没走 endHold：记录还在
+    const gx = t.fish.x + t.fish.len * 0.3;
+    assert.equal(Core.grab(t.w, t.fish, gx, t.fish.y), true);                   // 改用前半身抓住同一条鱼
+    assert.equal(t.fish.held.tail, false);
+    t.pointer = { x: gx, y: t.fish.y };
+    for (let i = 0; i < 80; i++) {
+        t.pointer = { x: t.pointer.x + 15, y: t.pointer.y };
+        Core.step(t.w, 50, { pointer: t.pointer });
+        Play.step(t.play, t.w, 50);
+        const p = pullOf(t);
+        if (p) assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite), `第 ${i} 步弹簧有限`);
+    }
+    assert.equal(t.fish.state, 'held', '仍被前半身抓着');
+    assert.equal(t.play.pulls.size, 0, '旧弹簧回到 0 后清掉（不必等放开）');
+});
+
+test('拉尾 60 秒随机操作：弹簧、速度、朝向始终有限，记录数不超过鱼数（并且真的抓了、放了很多次，不是空跑）', () => {
+    const t = tank('clown', { others: [['hammer'], ['puffer'], ['angel'], ['manta'], ['whaleshark']] });
+    const rnd = seeded(21);
+    let held = null;
+    let holds = 0;
+    let releases = 0;
+    let pointer = { x: 600, y: 400 };
+    for (let i = 0; i < 1200; i++) {
+        if (!held && i % 30 === 0) {
+            const alive = t.w.fish.filter(f => f.state === 'alive');
+            const f = alive[Math.floor(rnd() * alive.length)];
+            const gx = f.x - Math.cos(f.ang) * f.len * 0.3;           // 后半身（鱼心往鱼尾方向 0.3 个体长）
+            const gy = f.y - Math.sin(f.ang) * f.len * 0.3;
+            if (Play.isTailZone(f, gx, gy) && Core.grab(t.w, f, gx, gy, { tail: true })) {
+                assert.deepEqual(Play.beginHold(t.play, t.w, f), { ok: true });
+                held = f;
+                holds++;
+                pointer = { x: gx, y: gy };
+            }
+        } else if (held && i % 45 === 0) {
+            Core.release(t.w, held, { vx: rnd() * 600 - 300, vy: 0 });
+            if (rnd() < 0.5) Play.endHold(t.play, t.w, held); else Play.endHold(t.play, t.w, held, { quiet: true });
+            held = null;
+            releases++;
+        }
+        pointer = { x: Math.max(0, Math.min(1280, pointer.x + (rnd() - 0.5) * 60)), y: Math.max(0, Math.min(720, pointer.y + (rnd() - 0.5) * 40)) };
+        Core.step(t.w, 50, { pointer });
+        Play.step(t.play, t.w, 50);
+        assert.ok(t.play.pulls.size <= t.w.fish.length);
+    }
+    assert.ok(holds >= 10 && releases >= 10, `抓了 ${holds} 次、放了 ${releases} 次`);
+    assert.ok(t.w.fish.every(f => [f.x, f.y, f.vx, f.vy, f.ang].every(Number.isFinite)));
+    for (const p of t.play.pulls.values()) assert.ok([p.x, p.y, p.vx, p.vy].every(Number.isFinite));
+});
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-play-core.test.js
```

期望：

```text
ℹ tests 37
ℹ pass 25
ℹ fail 12
```

失败的 12 项（第一个失败的原因是 `Play.isTailZone is not a function`）：

- `isTailZone：只有后半身（本地 x ≤ 0）算，随鱼的朝向转；成群小鱼、坏输入一律不算`
- `beginHold / endHold：只接受用拉尾方式抓住、且在 world 里的鱼；没有记录时 endHold 返回 state`
- `拉伸：拖着走时弹簧趋向“指针速度 × PULL_GAIN”的位移，方向是指针运动方向（折算到鱼本地坐标），不超过体长 × PULL_MAX 与绝对上限`
- `拉伸上限：快速拖时不超过 体长 × PULL_MAX，大鱼不超过绝对上限 PULL_ABS × 视口缩放`
- `拉伸方向：指针速度折算到鱼本地坐标——鱼头朝南、指针向东拖时，目标在本地 −y 方向（逐轴核对符号）`
- `拉伸方向：垂直方向拖时弹簧永远有限，突然改向也一样`
- `松手：鱼朝鱼头方向冲一下（RELEASE_DASH × 巡航速度）、冒 2 个泡；尾巴回弹一次（过零、反向幅度小于第一次的 25%）后在 2 秒内停稳并清掉记录`
- `松手时鱼已经不是 alive（例如刚被捞起）：只回弹，不冲刺、不冒泡、速度不变`
- `quiet：没拖就松手（或被捞起）时直接清掉弹簧——没有冲刺、没有泡、速度不变`
- `清理：鱼被捞走（离开中）或不在了，弹簧记录下一步就清掉（不等回弹）；被别处放开（没走 endHold）自己回到 0 并清掉，不冲刺`
- `被前半身的普通抓取接手：旧的拉尾弹簧目标回到 0（不读不存在的指针速度），停稳后清掉，没有 NaN`
- `拉尾 60 秒随机操作：弹簧、速度、朝向始终有限，记录数不超过鱼数（并且真的抓了、放了很多次，不是空跑）`

- [ ] **Step 3: 写实现（修改 `js/aquarium-play-core.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 4 3`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/js/aquarium-play-core.js
+++ b/js/aquarium-play-core.js
@@ -266,8 +266,86 @@
             fed = clamp(Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S), 0, 1);
         }
         return { pull: p ? { x: p.x, y: p.y } : null, fed };
+    }
+
+    // ---------- 拉尾 ----------
+
+    /** (x, y) 是不是在这条鱼的后半身（鱼本地坐标 x ≤ 体长 × TAIL_ZONE，鼻子朝 +x）。成群的小鱼太小、看不出拉伸，不做拉尾。 */
+    function isTailZone(fish, x, y) {
+        if (!fish || !finite(x, y, fish.x, fish.y, fish.ang, fish.len)) return false;
+        const spec = Core.speciesById(fish.species);
+        if (!spec || spec.kind === 'school') return false;
+        return (x - fish.x) * Math.cos(fish.ang) + (y - fish.y) * Math.sin(fish.ang) <= PARAMS.TAIL_ZONE * fish.len;
+    }
+
+    /** 开始拉尾：fish 必须是用 Core.grab(…, { tail: true }) 抓住的。弹簧从 0 开始。 */
+    function beginHold(play, world, fish) {
+        if (!fish || !world.fish.includes(fish) || fish.state !== 'held' || !fish.held || !fish.held.tail) return { ok: false, reason: 'state' };
+        play.pulls.set(fish.id, { x: 0, y: 0, vx: 0, vy: 0 });
+        return { ok: true };
+    }
+
+    /**
+     * 结束拉尾。默认（拖过之后松手；调用前应已 Core.release，鱼是 alive）：鱼朝鱼头方向冲一下并冒泡，尾巴由 stepPulls 带阻尼回弹；
+     * 鱼不是 alive（比如已被捞起）时只回弹、不冲刺、不冒泡。opts.quiet（没拖就松手、被捞起等）：直接清掉弹簧，没有回弹、冲刺和泡。
+     * 没有拉尾记录时返回 { ok: false, reason: 'state' }。
+     */
+    function endHold(play, world, fish, opts) {
+        const pull = fish && play.pulls.get(fish.id);
+        if (!pull) return { ok: false, reason: 'state' };
+        if (opts && opts.quiet) { play.pulls.delete(fish.id); return { ok: true }; }
+        if (fish.state === 'alive') {
+            const dash = Core.cruiseSpeed(world, fish) * PARAMS.RELEASE_DASH;
+            fish.vx = Math.cos(fish.ang) * dash;
+            fish.vy = Math.sin(fish.ang) * dash;
+            const mouth = mouthOf(fish);
+            addBubbles(play, world, mouth.x, mouth.y, PARAMS.RELEASE_BUBBLES);
+        }
+        return { ok: true };
     }
 
+    /**
+     * 拉尾弹簧：被拉着时目标是指针运动方向（折算到鱼本地坐标）上 min(指针速度 × PULL_GAIN, 体长 × PULL_MAX, PULL_ABS × 视口缩放) 的位移，
+     * 松手后目标回到 0；二阶阻尼弹簧（PULL_OMEGA、PULL_ZETA < 1）所以会回弹一次再停下，停稳后记录清掉；过冲也不超过同一个上限。
+     * 这只是画法用的位移（见 extrasOf），不改变鱼的位置与碰撞。
+     */
+    function stepPulls(play, world, dt) {
+        if (!play.pulls.size) return;
+        const byId = new Map(world.fish.map(f => [f.id, f]));
+        const omega = PARAMS.PULL_OMEGA;
+        const damp = 2 * PARAMS.PULL_ZETA * omega;
+        for (const [id, p] of play.pulls) {
+            const f = byId.get(id);
+            if (!f || f.state === 'leaving') { play.pulls.delete(id); continue; }
+            const holding = f.state === 'held' && !!f.held && !!f.held.tail;   // 不再被拉着尾巴（放开了，或被普通抓取接手）：目标回到 0，停稳后清掉
+            const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS * world.scale);
+            let tx = 0;
+            let ty = 0;
+            if (holding) {
+                const speed = Math.hypot(f.held.pvx, f.held.pvy);
+                if (speed > 1) {
+                    const mag = Math.min(speed * PARAMS.PULL_GAIN, cap);
+                    const ux = f.held.pvx / speed;
+                    const uy = f.held.pvy / speed;
+                    const c = Math.cos(f.ang);
+                    const s = Math.sin(f.ang);
+                    tx = (ux * c + uy * s) * mag;
+                    ty = (-ux * s + uy * c) * mag;
+                }
+            }
+            const h = dt / 2;
+            for (let i = 0; i < 2; i++) {
+                p.vx += (omega * omega * (tx - p.x) - damp * p.vx) * h;
+                p.vy += (omega * omega * (ty - p.y) - damp * p.vy) * h;
+                p.x += p.vx * h;
+                p.y += p.vy * h;
+            }
+            const m = Math.hypot(p.x, p.y);                                    // 弹簧过冲也不超过上限
+            if (m > cap) { p.x *= cap / m; p.y *= cap / m; }
+            if (!holding && Math.abs(p.x) < 0.05 && Math.abs(p.y) < 0.05 && Math.abs(p.vx) < 0.5 && Math.abs(p.vy) < 0.5) play.pulls.delete(id);
+        }
+    }
+
     // ---------- 推进 ----------
 
     /** 推进一步（dtMs 毫秒，单步最长与核心一致）：涟漪扩散、泡上浮、饲料下沉与被吃、拉尾弹簧，过期的冷却与变亮记录清掉。 */
@@ -278,9 +356,10 @@
         play.time += dt;
         ageEffects(play, world, dt);
         stepPellets(play, world, dt);
+        stepPulls(play, world, dt);
         for (const [id, t] of play.pokedAt) if (play.time - t >= PARAMS.POKE_COOLDOWN_S) play.pokedAt.delete(id);
         for (const [id, until] of play.fed) if (until <= play.time) play.fed.delete(id);
     }
 
-    return { PARAMS, create, resize, counts, poke, sprinkle, attractors, extrasOf, step };
+    return { PARAMS, create, resize, counts, poke, sprinkle, attractors, extrasOf, isTailZone, beginHold, endHold, step };
 });
```

- [ ] **Step 4: 跑测试，确认绿，并确认文件已是最终版**

```bash
node --test test/aquarium-play-core.test.js
shasum -a 256 js/aquarium-play-core.js test/aquarium-play-core.test.js
```

测试期望：

```text
ℹ tests 37
ℹ pass 37
ℹ fail 0
```

两个文件的 SHA-256 应当是（与验证过的最终版一致）：

```text
10fe9bd41560f09dad70adfc9c88c6f1a68fed7a3ecfab4802f50547b6ff6584  js/aquarium-play-core.js
2584e34351075cd14e9200723b35c5fa0c522c2490124ab675e396378616e6ee  test/aquarium-play-core.test.js
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-play-core.test.js
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium-play-core.js test/aquarium-play-core.test.js`，提交说明：`feat(aquarium): 玩法核心（三）——拉鱼尾弹簧`。

---

## Task 5：画法钩子（拉尾拉伸、吃饱变亮）

**目标。** 让 `drawFish` 能画出玩法层给的两样东西：尾巴被拉长（`pull`），和刚吃到饲料时更亮、近处多一圈光晕（`fed`）。只加**可选**参数，**不传时绘制调用序列与改动之前逐条一致**（有一个哈希测试守住，期望值取自改动前的代码）。

**Files:**
- Modify: `js/aquarium.js`（只动画法部分：`FED_GLOW`、`PULL_WEIGHT`、`spineOf`、`drawFish`、`geometry` 导出；接线留到 Task 7）
- Create: `test/aquarium-extras.test.js`（5 项）

**Interfaces:**
- Consumes: `AquariumPlayCore.extrasOf` 的形状 `{ pull: { x, y } | null, fed: 0…1 }`（Task 3、4）。
- Produces:
  - `Aquarium.geometry.spineOf(fish, shape, len, pull?) → 5 个站位的 { x, y }`：`pull`（鱼本地 px）按 `PULL_WEIGHT = [0, 0, 0.12, 0.5, 1]` 叠到各站位，头与前身不动、尾端拉满；缺失或非有限时没有影响；
  - `Aquarium.drawFish(ctx, fish, palette, view, extras?)`：`extras.fed` 把不透明度最多抬高 `FED_GLOW = 0.25`，并让夜里的荧光与吃饱的光晕共用同一圈渐变（`glow = clamp(night + fed × 0.9, 0, 1)`；省流量时仍不画渐变）；`extras.pull` 传给 `spineOf`；非法的 `extras` 当作没有。

- [ ] **Step 1: 先写测试（新建 `test/aquarium-extras.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 5 1`（用法见附录 B；也可以照着下面的块手工写）。

写入 `test/aquarium-extras.test.js`（完整文件）：

```javascript
// 互动子项目对画法的两处小改动：拉尾时脊柱的尾端位移（spineOf 的 pull），吃到饲料后的变亮与光晕（drawFish 的 extras）。
// 没有玩法状态时，画出来的每一笔必须与改动之前完全一致——按种类钉住绘制调用的哈希（数字取到小数点后 4 位，颜色字符串本来就取整）。
// 需要重新生成哈希时：在改动前的提交上用同一个 recorder 与场景跑一遍即可（见本文件的 GOLD_SCENARIOS）。
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Core = require('../js/aquarium-core.js');
const Aquarium = require('../js/aquarium.js');

const { SHAPES, geometry, drawFish } = Aquarium;
const PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];

function recorder() {
    const calls = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => {
                calls.push([String(key), args]);
                return /^create(Linear|Radial)Gradient$/.test(String(key)) ? { addColorStop(o, c) { calls.push(['addColorStop', [o, c]]); } } : undefined;
            };
        },
        set(target, key, value) { calls.push(['set:' + String(key), [value]]); target[key] = value; return true; },
    });
}
const round = v => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
const fishOf = (species, extra = {}) => Object.assign({ species, x: 200, y: 150, ang: 0.3, len: Core.speciesById(species).len * 3, z: 0.95, alpha: 1, phase: 1.1, turn: 0.4, flip: 1 }, extra);
const log = (species, fishExtra, view, extras) => {
    const ctx = recorder();
    drawFish(ctx, fishOf(species, fishExtra), PALETTE, Object.assign({ amount: 0.9, night: 0, lowPower: false }, view), extras);
    return ctx._calls.map(([n, a]) => [n, a.map(round)]);
};
const sets = (calls, name) => calls.filter(([n]) => n === `set:${name}`).map(([, a]) => a[0]);
const alphaOf = css => Number(/, ([\d.]+)\)$/.exec(css)[1]);

const GOLD_SCENARIOS = [
    [{}, {}],
    [{ z: 0.4 }, {}],
    [{}, { night: 0.6 }],
    [{}, { lowPower: true }],
    [{ scoopT: 0.5, flip: -0.5 }, { night: 0.2 }],
];
const GOLD = {
    neon: 'fd86f6176ce43467', tang: 'fdee4ce17b56cdd8', clown: '4c91781322140894', puffer: '11801381e87978eb',
    angel: '3eff4f2328fc7e66', hammer: 'c24a88631760c450', manta: '286862276db6ab51', whaleshark: '1914a4943a106bff',
};
const goldOf = (id, extras) => {
    const h = crypto.createHash('sha1');
    for (const [fishExtra, view] of GOLD_SCENARIOS) h.update(JSON.stringify(log(id, fishExtra, view, extras)));
    return h.digest('hex').slice(0, 16);
};

test('黄金画法：没有 extras（缺省、null、空对象、无变亮无拉尾、非法值）时，8 种鱼 5 个场景的每一笔与改动之前一致', () => {
    for (const spec of Core.SPECIES) {
        assert.equal(goldOf(spec.id, undefined), GOLD[spec.id], `${spec.id}：没有 extras`);
        for (const extras of [null, {}, { pull: null, fed: 0 }, { pull: { x: NaN, y: 1 }, fed: NaN }, { pull: { x: 1 }, fed: 'x' }, { fed: -3 }]) {
            assert.equal(goldOf(spec.id, extras), GOLD[spec.id], `${spec.id}：${JSON.stringify(extras)}`);
        }
    }
});

test('spineOf：没有 pull 时与原来的公式一致；pull 按站位权重叠加，头不动、尾端拉满；非法 pull 不影响', () => {
    const fish = fishOf('hammer', { phase: 2.2, turn: -0.5 });
    const shape = SHAPES.hammer;
    const len = 60;
    const base = geometry.spineOf(fish, shape, len);
    const amp = (shape.amp || 0.12) * len;
    const bend = -0.5 * len * 0.12;
    [0, 0.25, 0.5, 0.75, 1].forEach((u, i) => {
        assert.ok(Math.abs(base[i].x - len * (0.5 - u)) < 1e-9);
        assert.ok(Math.abs(base[i].y - (Math.sin(2.2 - u * 2.4) * amp * Math.pow(u, 1.4) + bend * Math.pow(u, 1.5))) < 1e-9);
    });
    const pulled = geometry.spineOf(fish, shape, len, { x: -10, y: 4 });
    assert.deepEqual([pulled[0].x, pulled[0].y], [base[0].x, base[0].y], '鼻子不动');
    assert.deepEqual([pulled[1].x, pulled[1].y], [base[1].x, base[1].y], '前身不动');
    assert.ok(Math.abs(pulled[4].x - (base[4].x - 10)) < 1e-9 && Math.abs(pulled[4].y - (base[4].y + 4)) < 1e-9, '尾端拉满');
    assert.ok(Math.abs(pulled[3].x - (base[3].x - 5)) < 1e-9 && Math.abs(pulled[2].x - (base[2].x - 1.2)) < 1e-9, '中间按权重');
    for (const bad of [null, undefined, {}, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 1 }]) {
        assert.deepEqual(geometry.spineOf(fish, shape, len, bad), base, JSON.stringify(bad));
    }
});

test('画拉尾：pull 把尾端拉长（身体与尾鳍的路径变了），其余种类也一样；弹簧回到 0 时与没有拉尾画得一样', () => {
    for (const spec of Core.SPECIES) {
        const plain = JSON.stringify(log(spec.id, {}, {}));
        const pulled = JSON.stringify(log(spec.id, {}, {}, { pull: { x: -8, y: 3 }, fed: 0 }));
        assert.notEqual(pulled, plain, `${spec.id} 的画法没有随 pull 改变`);
        assert.equal(JSON.stringify(log(spec.id, {}, {}, { pull: { x: 0, y: 0 }, fed: 0 })), plain, `${spec.id}：pull 为 0 应与没有一样`);
    }
});

test('画变亮：fed 越大不透明度越高（最多加 25%），近处的鱼多一圈光晕；省流量没有光晕但仍变亮；超出 0…1 的值被夹住', () => {
    const bodyAlpha = (extras, view = {}) => {
        const calls = log('puffer', { z: 0.4 }, view, extras);                 // z 小：远处，不画渐变，身体是一个纯色
        return alphaOf(sets(calls, 'fillStyle').at(-1) ? sets(calls, 'fillStyle').find(s => /^rgba/.test(s)) : 'rgba(0, 0, 0, 0)');
    };
    const a0 = bodyAlpha({ pull: null, fed: 0 }, { amount: 0.6 });
    const a1 = bodyAlpha({ pull: null, fed: 1 }, { amount: 0.6 });
    assert.ok(a1 > a0 * 1.1, `变亮 ${a0} → ${a1}`);
    assert.equal(JSON.stringify(log('puffer', {}, {}, { fed: 5 })), JSON.stringify(log('puffer', {}, {}, { fed: 1 })), 'fed 夹到 1');
    assert.equal(JSON.stringify(log('puffer', {}, {}, { fed: -5 })), JSON.stringify(log('puffer', {}, {}, { fed: 0 })), 'fed 夹到 0');
    const count = (calls, name) => calls.filter(([n]) => n === name).length;
    const near = count(log('puffer', {}, {}, { fed: 1 }), 'createRadialGradient') - count(log('puffer', {}, {}), 'createRadialGradient');
    assert.equal(near, 1, '吃饱的鱼多一圈光晕');
    const haloAlpha = fed => alphaOf(log('puffer', {}, {}, { fed }).find(([n, a]) => n === 'addColorStop' && a[0] === 0)[1][1]);
    assert.ok(haloAlpha(1) > 0.1 && haloAlpha(0.5) > 0.03 && haloAlpha(1) > haloAlpha(0.5), `光晕随 fed 变强：${haloAlpha(0.5)} → ${haloAlpha(1)}`);
    const low = count(log('puffer', {}, { lowPower: true }, { fed: 1 }), 'createRadialGradient');
    assert.equal(low, 0, '省流量不画光晕');
    assert.ok(alphaOf(sets(log('clown', {}, { lowPower: true }, { fed: 1 }), 'fillStyle').find(s => /^rgba/.test(s))) >= 0, '省流量仍能画');
    const fedLow = log('puffer', { z: 0.4 }, { lowPower: true, amount: 0.6 }, { fed: 1 });
    const plainLow = log('puffer', { z: 0.4 }, { lowPower: true, amount: 0.6 });
    assert.notEqual(JSON.stringify(fedLow), JSON.stringify(plainLow), '省流量下不透明度仍然加亮');
});

test('画法对坏的 extras 不抛错：pull 与 fed 的各种怪值', () => {
    for (const extras of [{ pull: { x: 1e9, y: -1e9 }, fed: 1 }, { pull: { x: 'a', y: null }, fed: Infinity }, 5, 'x', [], () => 1]) {
        assert.doesNotThrow(() => log('manta', {}, {}, extras), String(extras));
    }
});
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-extras.test.js
```

期望：

```text
ℹ tests 5
ℹ pass 2
ℹ fail 3
```

失败的 3 项（第一个失败的原因是 `geometry.spineOf is not a function`——旧代码里 `spineOf` 没有导出）：

- `spineOf：没有 pull 时与原来的公式一致；pull 按站位权重叠加，头不动、尾端拉满；非法 pull 不影响`
- `画拉尾：pull 把尾端拉长（身体与尾鳍的路径变了），其余种类也一样；弹簧回到 0 时与没有拉尾画得一样`
- `画变亮：fed 越大不透明度越高（最多加 25%），近处的鱼多一圈光晕；省流量没有光晕但仍变亮；超出 0…1 的值被夹住`

另外 2 项在旧代码上本来就通过（它们守的是“没有额外参数时不变”）：

- `黄金画法：没有 extras（缺省、null、空对象、无变亮无拉尾、非法值）时，8 种鱼 5 个场景的每一笔与改动之前一致`
- `画法对坏的 extras 不抛错：pull 与 fed 的各种怪值`

- [ ] **Step 3: 改 `js/aquarium.js` 的画法部分**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 5 3`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/js/aquarium.js
+++ b/js/aquarium.js
@@ -21,6 +21,7 @@
     const STORAGE_KEY = 'aquariumV1';
     const DRAG_PX = 6;                        // 拖过这么远才算“拖”：之前松手只是点了一下，放回去
     const FLIP_MIN = 0.06;                    // 翻面到正中间时身体最薄的比例
+    const FED_GLOW = 0.25;                    // 刚吃到饲料时，鱼的不透明度与光晕额外加亮的比例（乘 0…1 的变亮程度）
     const FALLBACK_PALETTE = Object.freeze([
         [255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225],
     ]);
@@ -62,6 +63,7 @@
         whaleshark: { half: [0.05, 0.1, 0.12, 0.09, 0.04], tail: 'shark', tailLen: 0.24, dorsal: 0.12, spots: true, amp: 0.08 },
     });
     const STATIONS = [0, 0.25, 0.5, 0.75, 1];
+    const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);    // 拉尾的位移落在各站位上的比例：越靠尾越多，头与前身不动
 
     // ---- 几何辅助（纯函数，u 沿体长：0 头 → 1 尾）----
 
@@ -106,15 +108,19 @@
         }
         return marks;
     }
-    const geometry = Object.freeze({ halfAt, spineAt, bandCenters, spineMarks, bodyOutline, noseCap, smoothAt });
+    const geometry = Object.freeze({ halfAt, spineAt, bandCenters, spineMarks, bodyOutline, noseCap, smoothAt, spineOf });
 
-    /** 沿体长 5 个站位的脊柱：横向偏移 = 摆尾正弦（越靠尾越大）+ 转弯时的弯身。 */
-    function spineOf(fish, shape, len) {
+    /**
+     * 沿体长 5 个站位的脊柱：横向偏移 = 摆尾正弦（越靠尾越大）+ 转弯时的弯身。
+     * pull（可选，{ x, y }，鱼本地 px）是拉尾的位移：按 PULL_WEIGHT 叠到各站位上，尾端拉得最多；缺失或非有限时没有影响。
+     */
+    function spineOf(fish, shape, len, pull) {
         const amp = (shape.amp || 0.12) * len;
         const bend = clamp(fish.turn || 0, -1, 1) * len * 0.12;
-        return STATIONS.map(u => ({
-            x: len * (0.5 - u),
-            y: Math.sin(fish.phase - u * 2.4) * amp * Math.pow(u, 1.4) + bend * Math.pow(u, 1.5),
+        const pulled = !!pull && Number.isFinite(pull.x) && Number.isFinite(pull.y);
+        return STATIONS.map((u, i) => ({
+            x: len * (0.5 - u) + (pulled ? pull.x * PULL_WEIGHT[i] : 0),
+            y: Math.sin(fish.phase - u * 2.4) * amp * Math.pow(u, 1.4) + bend * Math.pow(u, 1.5) + (pulled ? pull.y * PULL_WEIGHT[i] : 0),
         }));
     }
 
@@ -209,7 +215,8 @@
         ctx.closePath();
     }
 
-    function drawFish(ctx, fish, palette, view) {
+    /** extras（可选，来自 AquariumPlayCore.extrasOf）：{ pull: {x, y} | null 拉尾位移, fed: 0…1 变亮程度 }；缺失、非法时与没有玩法时完全一样。 */
+    function drawFish(ctx, fish, palette, view, extras) {
         const spec = Core.speciesById(fish.species);
         const shape = SHAPES[fish.species];
         if (!spec || !shape) return;
@@ -219,10 +226,11 @@
         const main = palette[spec.colors[0] % palette.length] || FALLBACK_PALETTE[0];
         const accent = palette[spec.colors[1] % palette.length] || FALLBACK_PALETTE[1];
         // 主次：鱼比水母淡，越远越淡；夜里略亮
-        const A = clamp(fish.alpha * view.amount * lerp(0.5, 1.0, fish.z) * (1 + 0.3 * view.night), 0, 1);
+        const fed = extras && Number.isFinite(extras.fed) ? clamp(extras.fed, 0, 1) : 0;
+        const A = clamp(fish.alpha * view.amount * lerp(0.5, 1.0, fish.z) * (1 + 0.3 * view.night + FED_GLOW * fed), 0, 1);
         if (A <= 0.003) return;
         const far = fish.z < 0.55 || view.lowPower;       // 远处与省流量：不画渐变、眼睛、鳍的细节
-        const spine = spineOf(fish, shape, len);
+        const spine = spineOf(fish, shape, len, extras && extras.pull);
         const half = shape.half;
         // 朝左游时身体翻过来（背鳍始终朝上）：用核心维护的当前面（缓动的 −1…1，换面时身体先收窄再展开，像打了个滚）；
         // 缺失或非法（旧数据）才按朝向取正负。正中间留一条细身体而不缩到 0，免得画布矩阵退化。
@@ -234,9 +242,10 @@
         ctx.rotate(fish.ang);
         ctx.scale(1, flip);
 
-        if (view.night > 0.05 && !view.lowPower) {
+        const glow = clamp(view.night + fed * 0.9, 0, 1);              // 夜里的荧光与刚吃到饲料的光晕共用同一圈渐变
+        if (glow > 0.05 && !view.lowPower) {
             const g = ctx.createRadialGradient(0, 0, 0, 0, 0, len * 0.95);
-            g.addColorStop(0, rgba(main, 0.2 * view.night * A));
+            g.addColorStop(0, rgba(main, 0.2 * glow * A));
             g.addColorStop(1, rgba(main, 0));
             ctx.fillStyle = g;
             ctx.beginPath();
```

- [ ] **Step 4: 跑测试，确认绿**

```bash
node --test test/aquarium-extras.test.js
node --test test/aquarium-core.test.js test/aquarium-play-core.test.js test/aquarium-extras.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

第一条期望 `tests 5 / pass 5 / fail 0`；第二条（本任务之前已有的各文件 + 本任务的）期望：

```text
ℹ tests 169
ℹ pass 169
ℹ fail 0
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Files /tmp/aq-base/js/aquarium.js and ./js/aquarium.js differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-extras.test.js
Only in ./test: aquarium-play-core.test.js
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium.js test/aquarium-extras.test.js`，提交说明：`feat(aquarium): 画法钩子——拉尾拉伸与吃饱变亮（可选参数）`。

---

## Task 6：玩法的画法与喂食按钮（`js/aquarium-play.js`）

**目标。** 新建 `js/aquarium-play.js`，只做两件事：① 把玩法状态画出来——涟漪（鱼后面）、饲料与气泡（鱼前面）；② 托盘里的“喂食”按钮（点一下撒饲料、按住拖到水里松手撒在松手处、键盘 Enter/空格）。它**只依赖 `AquariumPlayCore.PARAMS`**，不碰存储、不碰核心。宿主给鱼层画布设的 `screen` 混合在亮背景上会吞掉浅色，所以涟漪的深色环与饲料的深色描边用 `source-over` 画，浅色光晕再用 `screen`。

**Files:**
- Create: `js/aquarium-play.js`（198 行）
- Create: `test/aquarium-play.test.js`（14 项，用假 DOM；假 DOM 的 `innerHTML` 一用就抛错，守住“只用 createElement 与 textContent”）

**Interfaces:**
- Consumes: `AquariumPlayCore.PARAMS`；`play` 状态的 `ripples / bubbles / pellets`（Task 2、3 的形状）。
- Produces（导出 `{ drawBack, drawFront, mountFeed, DRAG_PX, SWALLOW_MS }`）：
  - `drawBack(ctx, play, view)`、`drawFront(ctx, play, view)`：`view = { amount, night, lowPower, scale }`；`play` 为空或没有对应状态时什么都不画、不调用任何 ctx 方法；省流量时不画光晕渐变；
  - `mountFeed(parent, hooks) → { button, setEnabled(on, reason, describedBy), destroy() }`，`hooks = { doc, win?, now?, feed(point | null), overUi(x, y) }`：点一下（没拖）调 `feed(null)`；按住拖出 `DRAG_PX = 6` px 后出现跟手的饲料拖影（`.aq-feed-ghost`，三个小圆点，`aria-hidden`），松手时不在界面上（`overUi` 为假）才调 `feed({ x, y })`；松在托盘上、按 Esc、窗口失焦、`pointercancel` 都是取消；拖过之后 `SWALLOW_MS = 450` 毫秒内吞掉随后的那次 `click`，免得拖完又“点一下撒一把”；`setEnabled(false, reason, describedBy)` 禁用按钮、`title` 换成原因、`aria-describedby` 指向 `describedBy`；`destroy()` 去掉按钮、拖影和所有监听。

- [ ] **Step 1: 先写测试（新建 `test/aquarium-play.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 6 1`（用法见附录 B；也可以照着下面的块手工写）。

写入 `test/aquarium-play.test.js`（完整文件）：

```javascript
// 水族馆玩法的画法（涟漪、饲料、泡）与喂食按钮的指针交互。用记录型画布与假 DOM 驱动真实代码：这是业务替身层，不等同于真实 Chrome。
// 画面好不好看靠真实 Chromium 截图判断；这里只守住不会悄悄丢失的约定：深色垫底、画布状态成对保存恢复、省流量少画、坏数据不抛错、取消路径都清理干净。
const test = require('node:test');
const assert = require('node:assert/strict');
const PlayCore = require('../js/aquarium-play-core.js');
const Play = require('../js/aquarium-play.js');

const P = PlayCore.PARAMS;

function recorder() {
    const calls = [];
    const state = {};
    return new Proxy(state, {
        get(target, key) {
            if (key === '_calls') return calls;
            if (key in target) return target[key];
            return (...args) => { calls.push([String(key), args]); };
        },
        set(target, key, value) { calls.push([`set:${String(key)}`, [value]]); target[key] = value; return true; },
    });
}
const names = ctx => ctx._calls.map(([n]) => n);
const count = (ctx, name) => names(ctx).filter(n => n === name).length;
const stateOf = (ctx, i) => { const op = ctx._calls.slice(0, i).filter(([n]) => n === 'set:globalCompositeOperation').at(-1); return op ? op[1][0] : '(未设置)'; };

function makeDom() {
    class El {
        constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parent = null; this.attrs = {}; this.listeners = {}; this.style = {}; this.className = ''; this.disabled = false; this._text = ''; }
        set textContent(v) { this._text = String(v); this.children = []; }
        get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
        set innerHTML(v) { throw new Error('不得使用 innerHTML'); }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
        removeAttribute(k) { delete this.attrs[k]; }
        appendChild(c) { if (c.parent) c.parent.removeChild(c); c.parent = this; this.children.push(c); return c; }
        removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; return c; }
        remove() { if (this.parent) this.parent.removeChild(this); }
        addEventListener(name, fn) { (this.listeners[name] = this.listeners[name] || []).push(fn); }
        removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(x => x !== fn); }
        fire(name, event = {}) { for (const fn of [...(this.listeners[name] || [])]) fn(Object.assign({ type: name, target: this, preventDefault() {}, stopPropagation() {} }, event)); }
    }
    const doc = new El('document');
    doc.body = new El('body');
    doc.createElement = tag => new El(tag);
    const win = new El('window');
    return { doc, win, El };
}

// ---------- 画法 ----------

test('涟漪：没有就一笔不画；有则每圈深色垫底再浅色提亮，半径随进度扩大、越来越淡；画布状态成对保存与恢复；省流量少画内圈', () => {
    const empty = recorder();
    Play.drawBack(empty, { ripples: [], pellets: [], bubbles: [] }, { scale: 1 });
    assert.equal(empty._calls.length, 0);

    const play = { ripples: [{ x: 100, y: 80, t: 0.0 }, { x: 300, y: 80, t: P.RIPPLE_S / 2 }], pellets: [], bubbles: [] };
    const ctx = recorder();
    Play.drawBack(ctx, play, { scale: 0.8, lowPower: false });
    assert.equal(count(ctx, 'save'), 1);
    assert.equal(count(ctx, 'restore'), 1);
    assert.equal(count(ctx, 'arc'), 6, '每圈 3 道：深色垫底、浅色、内圈');
    const arcs = ctx._calls.filter(([n]) => n === 'arc').map(([, a]) => a);
    assert.equal(arcs[0][2], 0, '刚荡开：半径 0');
    const half = P.RIPPLE_R * 0.8 * (1 - 0.25);                                 // 进度 0.5 的缓出：1 − (1 − 0.5)²
    assert.ok(Math.abs(arcs[3][2] - half) < 1e-9, `半径 ${arcs[3][2]} 应为 ${half}`);
    ctx._calls.forEach(([n], i) => { if (n === 'arc') assert.ok(['source-over', 'screen'].includes(stateOf(ctx, i)), '每一道都显式设了合成方式'); });
    const firstArc = ctx._calls.findIndex(([n]) => n === 'arc');
    assert.equal(stateOf(ctx, firstArc), 'source-over', '先用 source-over 垫一圈深色细边');
    const low = recorder();
    Play.drawBack(low, play, { scale: 0.8, lowPower: true });
    assert.equal(count(low, 'arc'), 4, '省流量：每圈 2 道');
});

test('涟漪：越晚越淡，寿命走完时浅色圈完全透明；线条随进度变细', () => {
    const alphaAndWidth = t => {
        const ctx = recorder();
        Play.drawBack(ctx, { ripples: [{ x: 0, y: 0, t }], pellets: [], bubbles: [] }, { scale: 1, lowPower: true });
        const strokes = ctx._calls.filter(([n]) => n === 'set:strokeStyle').map(([, a]) => a[0]);
        const widths = ctx._calls.filter(([n]) => n === 'set:lineWidth').map(([, a]) => a[0]);
        return { dark: Number(/, ([\d.]+)\)$/.exec(strokes[0])[1]), light: Number(/, ([\d.]+)\)$/.exec(strokes[1])[1]), width: widths[1] };
    };
    const a = alphaAndWidth(0);
    const b = alphaAndWidth(P.RIPPLE_S * 0.5);
    const c = alphaAndWidth(P.RIPPLE_S);
    assert.ok(a.light > b.light && b.light > c.light, `浅色圈越来越淡：${a.light} > ${b.light} > ${c.light}`);
    assert.equal(c.light, 0);
    assert.equal(c.dark, 0);
    assert.ok(a.dark > b.dark, '深色垫底圈同样越来越淡');
    assert.ok(a.width > b.width && b.width > c.width, '线条越来越细');
    assert.ok(a.light > 0.4 && a.light < 0.8, `初始透明度在合理范围：${a.light}`);
    assert.ok(b.light < a.light * 0.5 && b.light > a.light * 0.15, `淡出比线性快一些但不是一下子没了：${b.light}（初始 ${a.light}）`);
});

test('涟漪：寿命已超过上限也不出 NaN（半径夹在最大值、透明度为 0），避免颜色字符串失效', () => {
    const ctx = recorder();
    Play.drawBack(ctx, { ripples: [{ x: 5, y: 5, t: P.RIPPLE_S * 3 }], pellets: [], bubbles: [] }, { scale: 0.5, lowPower: true });
    const styles = ctx._calls.filter(([n]) => n === 'set:strokeStyle').map(([, a]) => a[0]);
    assert.ok(styles.length === 2 && styles.every(css => !/NaN/.test(css) && /, 0\.000\)$/.test(css)), `颜色：${styles}`);
    const radii = ctx._calls.filter(([n]) => n === 'arc').map(([, a]) => a[2]);
    assert.ok(radii.every(r => Math.abs(r - P.RIPPLE_R * 0.5) < 1e-9), `半径：${radii}`);
});

test('饲料与泡：饲料先 source-over 画实心与深色细边，再 screen 加暖光；泡用 screen 画圈与高光；省流量去掉光晕与高光；最后 20% 寿命的饲料渐渐淡出', () => {
    const play = {
        ripples: [],
        pellets: [{ x: 10, y: 20, t: 0, life: 14 }, { x: 30, y: 40, t: 13.5, life: 14 }],
        bubbles: [{ x: 50, y: 60, r: 2, t: 0, life: 2 }],
    };
    const ctx = recorder();
    Play.drawFront(ctx, play, { scale: 1, lowPower: false });
    assert.equal(count(ctx, 'save'), 1);
    assert.equal(count(ctx, 'restore'), 1);
    assert.equal(count(ctx, 'arc'), 2 * 2 + 2, '2 粒饲料各 2 道（实心 + 光晕），1 个泡 2 道（圈 + 高光）');
    const firstFill = ctx._calls.findIndex(([n]) => n === 'fill');
    assert.equal(stateOf(ctx, firstFill), 'source-over');
    const sets = ctx._calls.filter(([n]) => n === 'set:fillStyle').map(([, a]) => a[0]);
    const alphaOf = css => Number(/, ([\d.]+)\)$/.exec(css)[1]);
    assert.ok(alphaOf(sets[2]) < alphaOf(sets[0]) * 0.8, `快到寿命的饲料更淡：${sets[0]} → ${sets[2]}`);
    assert.equal(count(ctx, 'stroke'), 2 + 1, '2 粒饲料各描一圈深色细边，泡描一圈');
    assert.ok(ctx._calls.some(([n, a]) => n === 'set:strokeStyle' && /^rgba\(110, 60, 10,/.test(a[0])), '深色细边是暗棕色：亮壁纸上也看得见');
    const low = recorder();
    Play.drawFront(low, play, { scale: 1, lowPower: true });
    assert.equal(count(low, 'arc'), 2 + 1, '省流量：2 粒饲料各 1 道，泡 1 道');
    assert.equal(count(low, 'stroke'), 2 + 1, '省流量也保留深色细边（它决定亮壁纸上看不看得见）');
    const none = recorder();
    Play.drawFront(none, { ripples: [], pellets: [], bubbles: [] }, {});
    assert.equal(none._calls.length, 0);
});

test('画法对坏数据不抛错：非有限的坐标被跳过，缺 view 当作默认', () => {
    const play = {
        ripples: [{ x: NaN, y: 1, t: 0.1 }, { x: 1, y: 1, t: Infinity }, { x: 5, y: 5, t: 99 }],
        pellets: [{ x: NaN, y: 1, t: 0, life: 14 }, { x: 1, y: 1, t: 0, life: NaN }],
        bubbles: [{ x: 1, y: 1, r: NaN, t: 0, life: 2 }],
    };
    const ctx = recorder();
    assert.doesNotThrow(() => { Play.drawBack(ctx, play); Play.drawFront(ctx, play); Play.drawBack(ctx, play, null); Play.drawFront(ctx, play, { scale: 'x' }); });
    assert.equal(count(ctx, 'arc'), 6, '只有 t=99（进度夹到 1）的那一圈有效，画了两次，每次 3 道；饲料与泡的坏数据一笔不画');
    for (const [name, args] of ctx._calls) if (name === 'arc') assert.ok(args.slice(0, 3).every(Number.isFinite), `arc 参数 ${args}`);
});

// ---------- 喂食按钮 ----------

function mount(extra = {}) {
    const { doc, win } = makeDom();
    const parent = doc.createElement('div');
    doc.body.appendChild(parent);
    const fed = [];
    let clock = 1000;
    let over = false;
    const feed = Play.mountFeed(parent, Object.assign({ doc, win, now: () => clock, feed: p => fed.push(p), overUi: () => over }, extra));
    return { doc, win, parent, feed, fed, button: feed.button, tick: ms => { clock += ms; }, setOver: v => { over = v; } };
}
const down = (m, x = 100, y = 100, extra = {}) => m.button.fire('pointerdown', Object.assign({ button: 0, clientX: x, clientY: y, pointerId: 1, isPrimary: true }, extra));
const move = (m, x, y) => m.doc.fire('pointermove', { clientX: x, clientY: y, pointerId: 1 });
const up = (m, x, y) => m.doc.fire('pointerup', { clientX: x, clientY: y, pointerId: 1 });

test('喂食按钮：挂在 parent 里，有名字与说明；点击（含键盘触发的 click）撒一次，point 为 null', () => {
    const m = mount();
    assert.equal(m.button.parent, m.parent);
    assert.equal(m.button.textContent, '喂食');
    assert.ok(/喂食/.test(m.button.getAttribute('aria-label')));
    m.button.fire('click');
    assert.deepEqual(m.fed, [null]);
});

test('从按钮拖出去：拖过 6 px 才出现一小撮饲料跟着指针；在水里松手，在松手处撒；随后 450 ms 内的 click 不再多撒一次，之后恢复', () => {
    const m = mount();
    down(m);
    move(m, 103, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '没拖过 6 px 不出现');
    move(m, 160, 140);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    assert.ok(ghost && ghost.children.length === 3 && ghost.attrs['aria-hidden'] === 'true');
    assert.equal(ghost.style.transform, 'translate(160px, 140px)');
    move(m, 400, 300);
    assert.equal(ghost.style.transform, 'translate(400px, 300px)');
    move(m, 400.4, 300.6);
    assert.equal(ghost.style.transform, 'translate(400px, 301px)', '取整到整像素，避免饲料团发虚');
    move(m, 400, 300);
    up(m, 400, 300);
    assert.deepEqual(m.fed, [{ x: 400, y: 300 }]);
    assert.equal(ghost.parent, null, '松手后饲料团消失');
    assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0, '松手后文档与窗口上不留监听');
    m.button.fire('click');                                                    // 松手落回按钮上时浏览器会再补一个 click
    assert.equal(m.fed.length, 1, '450 ms 内的 click 被吞掉');
    m.tick(500);
    m.button.fire('click');
    assert.equal(m.fed.length, 2, '之后的 click 正常');
});

test('拖拽取消：松在托盘上、Esc、窗口失焦、pointercancel 都不撒，饲料团消失，监听清理干净，随后的 click 同样被吞掉', () => {
    const cancels = [
        ['松在托盘上', m => { m.setOver(true); up(m, 150, 150); }],
        ['Esc', m => m.doc.fire('keydown', { key: 'Escape' })],
        ['窗口失焦', m => m.win.fire('blur')],
        ['pointercancel', m => m.doc.fire('pointercancel', {})],
    ];
    for (const [label, cancel] of cancels) {
        const m = mount();
        down(m);
        move(m, 150, 150);
        const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
        assert.ok(ghost, `${label}：先出现饲料团`);
        cancel(m);
        assert.deepEqual(m.fed, [], label);
        assert.equal(ghost.parent, null, `${label}：饲料团消失`);
        assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0, `${label}：监听清理`);
        m.button.fire('click');
        assert.deepEqual(m.fed, [], `${label}：随后的 click 被吞掉`);
        m.tick(500);
        m.button.fire('click');
        assert.deepEqual(m.fed, [null], `${label}：之后正常`);
    }
});

test('没拖过（移动不到 6 px）就松手：不在松手处撒，由随后的 click 撒一次；非主键、非主指针、禁用时忽略', () => {
    const m = mount();
    down(m); move(m, 102, 101); up(m, 102, 101);
    assert.deepEqual(m.fed, []);
    m.button.fire('click');
    assert.deepEqual(m.fed, [null]);
    const other = mount();
    down(other, 100, 100, { button: 2 }); down(other, 100, 100, { isPrimary: false });
    assert.equal(Object.values(other.doc.listeners).flat().length, 0, '没有被当成开始拖拽');
    other.feed.setEnabled(false, '先放入一条鱼', 'aq-reason');
    down(other);
    assert.equal(Object.values(other.doc.listeners).flat().length, 0, '禁用时不响应');
    other.button.fire('click');
    assert.deepEqual(other.fed, []);
});

test('setEnabled：禁用时按钮 disabled、title 写明原因并指向原因行；启用后恢复；拖拽中被禁用会取消这次拖拽', () => {
    const m = mount();
    const label = m.button.getAttribute('title');
    m.feed.setEnabled(false, '先放入一条鱼，才能喂食', 'aq-reason');
    assert.equal(m.button.disabled, true);
    assert.equal(m.button.getAttribute('title'), '先放入一条鱼，才能喂食');
    assert.equal(m.button.getAttribute('aria-describedby'), 'aq-reason');
    m.feed.setEnabled(true);
    assert.equal(m.button.disabled, false);
    assert.equal(m.button.getAttribute('title'), label);
    assert.equal(m.button.getAttribute('aria-describedby'), null);
    down(m); move(m, 200, 200);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    m.feed.setEnabled(false, '没有鱼');
    assert.equal(ghost.parent, null);
    assert.equal(Object.values(m.doc.listeners).flat().length, 0);
    assert.equal(m.button.getAttribute('aria-describedby'), null, '没给原因行就不挂 describedby');
});

test('destroy：按钮、饲料团、监听全部清掉，之后的事件不再触发', () => {
    const m = mount();
    down(m); move(m, 200, 200);
    const ghost = m.doc.body.children.find(c => c.className === 'aq-feed-ghost');
    m.feed.destroy();
    assert.equal(m.button.parent, null);
    assert.equal(ghost.parent, null);
    assert.equal(Object.values(m.doc.listeners).flat().length + Object.values(m.win.listeners).flat().length, 0);
    up(m, 300, 300);
    assert.deepEqual(m.fed, []);
});

test('没有 win 与 now 也能工作（回落到默认时钟，不抛错）', () => {
    const { doc } = makeDom();
    const parent = doc.createElement('div');
    const fed = [];
    const feed = Play.mountFeed(parent, { doc, feed: p => fed.push(p), overUi: () => false });
    feed.button.fire('pointerdown', { button: 0, clientX: 1, clientY: 1 });
    doc.fire('pointermove', { clientX: 100, clientY: 100 });
    doc.fire('pointerup', { clientX: 100, clientY: 100 });
    assert.deepEqual(fed, [{ x: 100, y: 100 }]);
    feed.destroy();
});

test('拖拽阈值是 6 px：差一点不算拖，刚好 6 px 算拖；按其他键不会取消拖拽，只有 Esc 才取消', () => {
    const m = mount();
    down(m, 100, 100);
    move(m, 105, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '5 px 不算拖');
    move(m, 106, 100);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 1, '刚好 6 px 算拖');
    m.doc.fire('keydown', { key: 'a' });
    m.doc.fire('keydown', {});
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 1, '其他键不取消');
    up(m, 300, 300);
    assert.deepEqual(m.fed, [{ x: 300, y: 300 }]);
    assert.equal(Play.DRAG_PX, 6);
});

test('松手坐标缺失或不是数字时不撒（宁可不撒也不撒到 NaN）；重复按下会先结束上一次拖拽，不残留饲料团', () => {
    const m = mount();
    down(m); move(m, 200, 200);
    m.doc.fire('pointerup', { clientX: undefined, clientY: 'x' });
    assert.deepEqual(m.fed, []);
    assert.equal(m.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0);
    const n = mount();
    down(n); move(n, 200, 200);
    down(n, 300, 300);
    assert.equal(n.doc.body.children.filter(c => c.className === 'aq-feed-ghost').length, 0, '上一次的饲料团被收掉');
    assert.equal(n.doc.listeners.pointermove.length, 1, '没有重复挂监听');
});
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-play.test.js
```

期望：整个文件加载失败（模块还不存在）——

```text
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

并且错误里有 `Cannot find module '../js/aquarium-play.js'`。

- [ ] **Step 3: 写实现（新建 `js/aquarium-play.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 6 3`（用法见附录 B；也可以照着下面的块手工写）。

写入 `js/aquarium-play.js`（完整文件）：

```javascript
(function (root, factory) {
    'use strict';
    const core = (typeof module === 'object' && module.exports) ? require('./aquarium-play-core.js') : root && root.AquariumPlayCore;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AquariumPlay = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (PlayCore) {
    'use strict';

    // 水族馆玩法的画法与“喂食”按钮。状态与规则在 aquarium-play-core.js，本文件只读它的状态来画，并管理喂食按钮的指针交互。
    // 画在背景体验的共享画布上，宿主的合成方式是 screen（只会变亮），所以要在亮壁纸上也看得见的东西（饲料、涟漪）
    // 会先用 source-over 垫一层深色细边；每个函数自己 save/restore，不改宿主的画布状态。
    // 不读写存储、不请求网络、不拼 HTML 字符串（只建元素、只设文字与样式）。设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md。

    const P = PlayCore.PARAMS;
    const TAU = Math.PI * 2;
    const DRAG_PX = 6;                 // 与鱼的抓取一样：拖过这么远才算“拖”，之前松手只是点了一下
    const SWALLOW_MS = 450;            // 拖拽松手后这么久内到来的 click 不再撒一次饲料（与宿主吞掉点击的时长一致）
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const rgba = (r, g, b, a) => `rgba(${r}, ${g}, ${b}, ${clamp(a, 0, 1).toFixed(3)})`;
    const ok = (...values) => values.every(Number.isFinite);

    // ---------- 画法 ----------

    /** 画在鱼后面的：涟漪。view = { scale, lowPower }。 */
    function drawBack(ctx, play, view) {
        if (!play.ripples.length) return;
        const k = view && Number.isFinite(view.scale) ? view.scale : 1;
        ctx.save();
        for (const r of play.ripples) {
            if (!ok(r.x, r.y, r.t)) continue;
            const u = clamp(r.t / P.RIPPLE_S, 0, 1);
            const radius = P.RIPPLE_R * k * (1 - (1 - u) * (1 - u));
            const fade = Math.pow(1 - u, 1.5);
            const width = (2.4 * (1 - u) + 0.6) * k;
            ctx.globalCompositeOperation = 'source-over';              // 深色细圈垫底：亮壁纸上 screen 的浅色圈看不见
            ctx.strokeStyle = rgba(20, 50, 80, 0.2 * fade);
            ctx.lineWidth = width + 1;
            ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.stroke();
            ctx.globalCompositeOperation = 'screen';
            ctx.strokeStyle = rgba(170, 225, 255, 0.6 * fade);
            ctx.lineWidth = width;
            ctx.beginPath(); ctx.arc(r.x, r.y, radius, 0, TAU); ctx.stroke();
            if (!(view && view.lowPower)) {
                ctx.strokeStyle = rgba(170, 225, 255, 0.32 * fade);
                ctx.lineWidth = width * 0.6;
                ctx.beginPath(); ctx.arc(r.x, r.y, radius * 0.62, 0, TAU); ctx.stroke();
            }
        }
        ctx.restore();
    }

    /** 画在鱼前面的：饲料与泡。 */
    function drawFront(ctx, play, view) {
        if (!play.pellets.length && !play.bubbles.length) return;
        const k = view && Number.isFinite(view.scale) ? view.scale : 1;
        const low = !!(view && view.lowPower);
        ctx.save();
        for (const p of play.pellets) {
            if (!ok(p.x, p.y, p.t, p.life)) continue;
            const fade = clamp((1 - p.t / p.life) / 0.2, 0, 1);       // 最后 20% 的寿命渐渐淡出
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = rgba(255, 190, 90, 0.95 * fade);
            ctx.strokeStyle = rgba(110, 60, 10, 0.55 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * k, 0, TAU); ctx.fill(); ctx.stroke();
            if (!low) {
                ctx.globalCompositeOperation = 'screen';
                ctx.fillStyle = rgba(255, 170, 70, 0.22 * fade);
                ctx.beginPath(); ctx.arc(p.x, p.y, 7 * k, 0, TAU); ctx.fill();
            }
        }
        ctx.globalCompositeOperation = 'screen';
        for (const b of play.bubbles) {
            if (!ok(b.x, b.y, b.r, b.t, b.life)) continue;
            const fade = clamp((b.life - b.t) / 0.5, 0, 1);
            ctx.strokeStyle = rgba(200, 235, 255, 0.6 * fade);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
            if (!low) {
                ctx.fillStyle = rgba(255, 255, 255, 0.5 * fade);
                ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.6, b.r * 0.25), 0, TAU); ctx.fill();
            }
        }
        ctx.restore();
    }

    // ---------- 喂食按钮 ----------

    /**
     * 在 parent 里挂一个“喂食”按钮并管理它的指针交互。hooks：
     * - doc（必需）：document；win（可选）：window，用来在失焦时取消拖拽；now（可选）：毫秒时钟；
     * - feed(point | null)：点一下按钮（或键盘 Enter/空格）时 point 为 null；从按钮拖出去在水里松手时是松手处 { x, y }；
     * - overUi(x, y)：松手处是不是还在托盘上（是则取消，不撒）。
     * 返回 { button, setEnabled(enabled, reason, describedBy), destroy() }。
     * 取消拖拽的方式：松在托盘上、Esc、窗口失焦、pointercancel。
     */
    function mountFeed(parent, hooks) {
        const { doc, win } = hooks;
        const now = hooks.now || (() => Date.now());
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'aq-feed';
        button.textContent = '喂食';
        const label = '喂食：点一下从上面撒饲料，或按住拖到水里松手';
        button.setAttribute('aria-label', label);
        button.setAttribute('title', label);
        parent.appendChild(button);

        let drag = null;                 // { x, y, id, dragging, ghost }
        let swallowUntil = 0;
        let enabled = true;

        const makeGhost = () => {
            const ghost = doc.createElement('div');
            ghost.className = 'aq-feed-ghost';
            ghost.setAttribute('aria-hidden', 'true');
            for (let i = 0; i < 3; i++) ghost.appendChild(doc.createElement('span'));
            doc.body.appendChild(ghost);
            return ghost;
        };
        const place = (ghost, x, y) => { ghost.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`; };

        function detach() {
            if (typeof doc.removeEventListener === 'function') {
                doc.removeEventListener('pointermove', onMove);
                doc.removeEventListener('pointerup', onUp);
                doc.removeEventListener('pointercancel', onCancel);
                doc.removeEventListener('keydown', onKey);
            }
            if (win && typeof win.removeEventListener === 'function') win.removeEventListener('blur', onCancel);
        }
        function finish() {
            const d = drag;
            drag = null;
            detach();
            if (d && d.ghost) d.ghost.remove();
            return d;
        }
        function onMove(event) {
            if (!drag || !ok(event.clientX, event.clientY)) return;
            if (!drag.dragging) {
                if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_PX) return;
                drag.dragging = true;
                drag.ghost = makeGhost();
            }
            place(drag.ghost, event.clientX, event.clientY);
        }
        function onUp(event) {
            const d = finish();
            if (!d || !d.dragging) return;                                   // 没拖过：随后的 click 负责撒饲料
            swallowUntil = now() + SWALLOW_MS;
            if (!ok(event.clientX, event.clientY) || hooks.overUi(event.clientX, event.clientY)) return;
            hooks.feed({ x: event.clientX, y: event.clientY });
        }
        function onCancel() {
            const d = finish();
            if (d && d.dragging) swallowUntil = now() + SWALLOW_MS;
        }
        function onKey(event) {
            if (event && event.key === 'Escape') onCancel();
        }
        function onDown(event) {
            if (!enabled || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
            if (drag) finish();
            drag = { x: event.clientX, y: event.clientY, id: event.pointerId, dragging: false, ghost: null };
            doc.addEventListener('pointermove', onMove);
            doc.addEventListener('pointerup', onUp);
            doc.addEventListener('pointercancel', onCancel);
            doc.addEventListener('keydown', onKey);
            if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', onCancel);
        }
        function onClick() {
            if (!enabled || now() < swallowUntil) return;
            hooks.feed(null);
        }
        button.addEventListener('pointerdown', onDown);
        button.addEventListener('click', onClick);

        return {
            button,
            setEnabled(on, reason, describedBy) {
                enabled = !!on;
                button.disabled = !enabled;
                if (!enabled && drag) finish();
                button.setAttribute('title', enabled || !reason ? label : reason);
                if (!enabled && describedBy) button.setAttribute('aria-describedby', describedBy);
                else button.removeAttribute('aria-describedby');
            },
            destroy() {
                finish();
                button.remove();
            },
        };
    }

    return { drawBack, drawFront, mountFeed, DRAG_PX, SWALLOW_MS };
});
```

- [ ] **Step 4: 跑测试，确认绿**

```bash
node --test test/aquarium-play.test.js
```

期望：

```text
ℹ tests 14
ℹ pass 14
ℹ fail 0
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Only in ./js: aquarium-play.js
Files /tmp/aq-base/js/aquarium.js and ./js/aquarium.js differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-extras.test.js
Only in ./test: aquarium-play-core.test.js
Only in ./test: aquarium-play.test.js
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium-play.js test/aquarium-play.test.js`，提交说明：`feat(aquarium): 玩法画法与托盘喂食按钮`。

---

## Task 7：控制器接线（`js/aquarium.js` 与 `test/aquarium.test.js`）

**目标。** 把三种手势接到已有的抓取状态机上，并保证玩法层出任何问题都只停玩法层。

**手势分流（`grabAt` / `drop` / `cancel`）：**
- 按下时用 `AquariumPlayCore.isTailZone` 判断按的是不是非成群鱼的后半身：是 → `Core.grab(…, { tail: true })` 并 `beginHold`（拉尾）；否则是原来的普通抓取；
- 松手没拖过 6 px（`drop` 的“没拖”路径）：放回、收起拉尾记录（静悄悄）、对这条鱼 `poke`，**返回 `false`**——所以宿主不会吞随后的 `click`；
- 拖过之后松在网兜里：捞出（拉尾记录静悄悄收起，捞起动画不变）；松在别处：放开、尾巴回弹、鱼向前冲一下（拉尾）或照原样放开（普通抓取），返回 `true`；
- `cancel`（Esc、失焦、页面隐藏等）：放开；没拖过就静悄悄收起，拖过则回弹。

**一帧的顺序（`frame`）：** 先由饲料算吸引点 → `Core.step(world, dt, { pointer, bells, attractors })` → `PlayCore.step` → 抓取状态推进 → 绘制：涟漪（`drawBack`）→ 鱼（`drawFish` 带 `extrasOf`）→ 饲料与气泡（`drawFront`）→ 水母（宿主）。世界里没有鱼时丢弃玩法状态；窗口尺寸变化时对玩法状态 `resize`。

**玩法层隔离：** 玩法层可注入（`env.playCore` / `env.play` / `env.window`，传 `null` 就是没有玩法层，行为与改动之前一致）；任何玩法调用都包在 `playGuard` 里，抛错只走 `disablePlay`（销毁喂食按钮并隐藏喂食行、丢弃玩法状态、打一条警告、`state().playFailed = true`），鱼的游动、抓取、捞出、存储不受影响；下次 `start` 再试。

**界面：** 托盘里在物种按钮行与容量行之间加一行喂食（按钮 + 灰字“点一下撒饲料，也可以拖到水里”）；没有鱼时按钮禁用，原因“先放入一条鱼，才能喂食”并用 `aria-describedby` 指向居民列表里的“还没有鱼”（`#aq-empty`）；撒下后状态栏写“落下了 N 粒饲料”，同屏放不下写“饲料还没吃完”。

**Files:**
- Modify: `js/aquarium.js`（接线部分；Task 5 已改过画法部分）
- Modify（`make()` 辅助加一个 `extraEnv` 参数 + 末尾追加）: `test/aquarium.test.js`

**Interfaces:**
- Consumes: Task 1–6 的全部导出。
- Produces: `Aquarium.create(env)` 的 `env` 多了 `playCore`、`play`、`window`（都可省略）；实例多了 `_play()`（测试用，返回玩法状态或 `null`），`state()` 多了 `playFailed`；其余接口不变。

- [ ] **Step 1: 先写测试（修改 `test/aquarium.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 7 1`（用法见附录 B；也可以照着下面的块手工写）。

差异如下（`make()` 多收一个 `extraEnv`，末尾追加 18 项）：

```diff
--- a/test/aquarium.test.js
+++ b/test/aquarium.test.js
@@ -119,16 +119,16 @@
 
 const entry = (species, id) => ({ id, species, addedAt: 1000 });
 
-async function make({ stored, lowPower = false, dom = true, random = seeded(), wall } = {}) {
+async function make({ stored, lowPower = false, dom = true, random = seeded(), wall, env: extraEnv } = {}) {
     const fc = fakeChrome(stored);
     const d = makeDom();
     let clock = 1700000000000;
     const warns = [];
-    const aq = Aquarium.create({
+    const aq = Aquarium.create(Object.assign({
         chrome: fc.chrome, document: dom ? d.document : null, window: {},
         random, wall: wall || (() => ++clock), warn: m => warns.push(m), now: () => 0,
         palette: [[255, 0, 0], [255, 150, 50], [240, 220, 70], [90, 230, 100], [80, 240, 190], [110, 200, 255], [170, 110, 255], [245, 105, 225]],
-    });
+    }, extraEnv));
     aq.start();
     await settle();
     const ctx = ctxProxy();
@@ -855,4 +855,492 @@
     assert.equal(c.t.aq.drop(100, 560), true);
     c.t.frame({ lowPower: true, dt: 50 });
     assert.equal(c.net.classes.has('aq-net-on'), false, '世界换了，网兜随之收起');
+});
+
+
+// ---------- 玩法接线：戳、喂食、拉尾（规则见 aquarium-play-core.test.js，画法与按钮见 aquarium-play.test.js） ----------
+
+const PlayCore = require('../js/aquarium-play-core.js');
+const PlayUi = require('../js/aquarium-play.js');
+const PP = PlayCore.PARAMS;
+
+const feedButton = t => t.d.findAll(n => n.classes.has('aq-feed'))[0];
+const fireDoc = (t, name, event) => { for (const fn of [...(t.d.docListeners[name] || [])]) fn(event); };
+const dragFeed = (t, x, y) => {
+    const b = feedButton(t);
+    for (const fn of b.listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
+    fireDoc(t, 'pointermove', { clientX: x, clientY: y });
+    fireDoc(t, 'pointerup', { clientX: x, clientY: y });
+};
+const statusText = t => t.d.findAll(n => n.classes.has('aq-status'))[0].textContent;
+const frames = (t, n, extra = {}) => { for (let i = 0; i < n; i++) t.frame(extra); };
+
+async function playFish(extra = {}) {
+    const f = await withFish(extra);
+    f.fish.ang = 0;
+    return f;
+}
+
+test('戳：点一下鱼（没拖）= 放回并戳一下：返回 false 不吞 click，鱼窜开、嘴边冒泡、点击处荡开涟漪，不写存储', async () => {
+    const { t, fish } = await playFish();
+    assert.equal(t.aq._play(), null, '没用过玩法就没有玩法状态（零开销）');
+    assert.equal(t.aq.grabAt(520, 300), true);
+    t.frame({ pointer: { x: 523, y: 301 } });
+    assert.equal(t.aq.drop(523, 301), false, '点一下不吞随后的 click');
+    assert.equal(fish.state, 'alive');
+    assert.ok(Math.hypot(fish.vx, fish.vy) > 0, '被戳的鱼窜开');
+    const play = t.aq._play();
+    assert.equal(PlayCore.counts(play).ripples, 1);
+    assert.deepEqual({ x: play.ripples[0].x, y: play.ripples[0].y }, { x: 520, y: 300 }, '涟漪在按下的位置（不是松手位置）');
+    assert.ok(play.bubbles.length >= PP.POKE_BUBBLES);
+    assert.equal(t.fc.state.sets.length, 0);
+});
+
+test('戳：拖过 6 px 就不是戳；玩法层关闭（playCore: null）时点一下鱼与原来完全一样', async () => {
+    const a = await playFish();
+    assert.equal(a.t.aq.grabAt(520, 300), true);
+    a.t.frame({ pointer: { x: 520, y: 330 } });
+    a.t.frame({ pointer: { x: 700, y: 200 } });
+    assert.equal(a.t.aq.drop(700, 200), true);
+    assert.equal(a.t.aq._play(), null, '拖过之后松手不戳（连玩法状态都没建）');
+    const b = await playFish({ env: { playCore: null } });
+    b.fish.vx = 0; b.fish.vy = 0;
+    assert.equal(b.t.aq.grabAt(520, 300), true);
+    b.t.frame({ pointer: { x: 521, y: 300 } });
+    assert.equal(b.t.aq.drop(521, 300), false);
+    assert.equal(b.t.aq._play(), null);
+    assert.deepEqual(b.t.warns, [], '没有玩法层不是错误');
+    assert.equal(b.fish.vx, 0);
+    assert.equal(b.fish.vy, 0);
+    assert.equal(b.t.d.findAll(n => n.classes.has('aq-feed')).length, 0, '没有玩法层就没有喂食按钮');
+    assert.equal(b.t.aq.grabAt(480, 300), true);
+    assert.ok(!b.fish.held.tail, '没有玩法层就没有拉尾');
+    const c = await playFish({ env: { play: null } });
+    c.fish.vx = 0; c.fish.vy = 0;
+    assert.equal(c.t.aq.grabAt(520, 300), true);
+    assert.equal(c.t.aq.drop(520, 300), false);
+    assert.equal(c.t.aq._play(), null, '没有画法模块：不戳（否则画不出来也停不下来）');
+    assert.deepEqual(c.t.warns, []);
+    assert.equal(c.fish.vx, 0);
+    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed')).length, 0);
+    assert.equal(c.t.aq.grabAt(480, 300), true);
+    assert.ok(!c.fish.held.tail, '没有画法模块：不拉尾');
+});
+
+test('绘制顺序：涟漪在鱼后面，饲料与泡在鱼前面；没有玩法状态时不调用', async () => {
+    const calls = [];
+    const spy = {
+        drawBack: (ctx, play, view) => { ctx.mark_back(); calls.push(['back', view.scale]); },
+        drawFront: ctx => { ctx.mark_front(); calls.push(['front']); },
+        mountFeed: PlayUi.mountFeed,
+    };
+    const { t } = await playFish({ env: { play: spy } });
+    t.ctx._calls.length = 0;
+    t.frame();
+    assert.equal(names(t.ctx).includes('mark_back'), false, '还没用过玩法：不画玩法层');
+    t.aq.grabAt(520, 300);
+    t.aq.drop(520, 300);
+    t.ctx._calls.length = 0;
+    t.frame();
+    const order = names(t.ctx);
+    const back = order.indexOf('mark_back');
+    const front = order.indexOf('mark_front');
+    assert.ok(back === 0 && front > back + 1, `涟漪在最前、饲料与泡在最后，中间是鱼：${back} ${front}`);
+    assert.ok(order.slice(back + 1, front).length > 5, '两层之间画了鱼');
+    assert.ok(calls[0][1] > 0 && calls[0][1] < 2, '视图里带着缩放');
+});
+
+function names(ctx) { return ctx._calls.map(c => c); }
+
+test('喂食：按钮点一下从上面落 6 粒，冷却内再点没有变化，饲料满了提示“还没吃完”；没有鱼时按钮禁用并指向原因', async () => {
+    const t = await make();
+    const button0 = feedButton(t);
+    assert.ok(button0, '托盘里有喂食按钮');
+    assert.ok(t.d.findAll(n => n.classes.has('aq-feed-hint'))[0], '旁边有一句怎么用的提示');
+    assert.equal(button0.disabled, true, '一条鱼都没有：禁用');
+    assert.equal(button0.getAttribute('aria-describedby'), 'aq-empty');
+    assert.ok(/先放入一条鱼/.test(button0.getAttribute('title')));
+    assert.ok(t.d.findAll(n => n.attrs.id === 'aq-empty').length === 1, '原因行确实存在');
+    await t.aq.add('clown');
+    await settle();
+    t.frame();
+    const button = feedButton(t);
+    assert.equal(button.disabled, false);
+    assert.equal(button.getAttribute('aria-describedby'), null);
+    button.click();
+    assert.equal(t.aq._play().pellets.length, PP.SPRINKLE_COUNT);
+    assert.equal(statusText(t), `落下了 ${PP.SPRINKLE_COUNT} 粒饲料`);
+    button.click();
+    assert.equal(t.aq._play().pellets.length, PP.SPRINKLE_COUNT, '冷却内再点没有变化');
+    assert.equal(statusText(t), `落下了 ${PP.SPRINKLE_COUNT} 粒饲料`, '冷却是静默的');
+    for (let i = 0; i < 4; i++) { t.aq._play().lastSprinkle = -Infinity; button.click(); }
+    assert.equal(t.aq._play().pellets.length, PP.MAX_PELLETS);
+    t.aq._play().lastSprinkle = -Infinity;
+    button.click();
+    assert.equal(statusText(t), '饲料还没吃完');
+    assert.equal(t.aq._play().pellets.length, PP.MAX_PELLETS);
+});
+
+test('喂食：从按钮拖到水里松手，饲料落在松手处；鱼被吸引过去吃掉并变亮；松在托盘上取消', async () => {
+    const { t, fish } = await playFish();
+    fish.x = 500; fish.y = 300;
+    const toggle = t.d.findAll(n => n.classes.has('aq-toggle'))[0];
+    toggle.rect = { left: 1200, top: 560, width: 40, height: 40 };
+    dragFeed(t, 1210, 570);
+    assert.equal(t.aq._play(), null, '松在托盘上：取消，不撒（也没有创建玩法状态）');
+    dragFeed(t, 600, 300);
+    const play = t.aq._play();
+    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT);
+    const spread = PP.DROP_SPREAD * t.aq._world().scale;
+    assert.ok(play.pellets.every(p => Math.abs(p.x - 600) <= spread + 1e-6 && Math.abs(p.y - 300) <= spread + 1e-6), '落在松手处附近');
+    let fed = 0;
+    for (let i = 0; i < 1200 && !fed; i++) { t.frame(); fed = play.fed.size; }
+    assert.ok(fed >= 1, '鱼被饲料吸引过去，吃到了');
+    assert.ok(play.pellets.length < PP.SPRINKLE_COUNT, '被吃掉的饲料消失');
+    t.frame();
+    const extras = PlayCore.extrasOf(play, fish);
+    assert.ok(extras.fed > 0, '吃到的鱼变亮');
+});
+
+test('拉尾：按在后半身 = 拉尾（抓住的点留在指针下、弹簧开始），按在前半身与原来一样；成群的小鱼不拉尾', async () => {
+    const { t, fish } = await playFish();
+    assert.equal(t.aq.grabAt(520, 300), true);
+    assert.equal(fish.held.tail, false, '前半身：普通抓取');
+    assert.equal(t.aq._play(), null);
+    assert.equal(t.aq.cancel(), true);
+    assert.equal(t.aq.grabAt(480, 300), true);
+    assert.equal(fish.held.tail, true, '后半身：拉尾');
+    assert.ok(t.aq._play().pulls.has(fish.id));
+    t.aq.cancel();
+    const school = await make({ stored: { v: 1, fish: [entry('neon', 'n1')] } });
+    school.frame();
+    const small = school.aq._world().fish[0];
+    small.x = 500; small.y = 300; small.ang = 0; small.alpha = 1; small.state = 'alive';
+    assert.equal(school.aq.grabAt(480, 300), true);
+    assert.equal(small.held.tail, false, '成群的小鱼太小，不做拉尾');
+});
+
+test('拉尾：拖拽中尾巴被拉长；拖过之后松手（网兜外）→ 尾巴弹回、鱼向前冲并冒泡，弹簧停稳后清掉', async () => {
+    const { t, fish } = await playFish();
+    t.aq.grabAt(480, 300);
+    let maxPull = 0;
+    for (let i = 0; i < 40; i++) {
+        t.frame({ pointer: { x: 480 + i * 8, y: 300 + i * 4 } });
+        const e = PlayCore.extrasOf(t.aq._play(), fish);
+        if (e.pull) maxPull = Math.max(maxPull, Math.hypot(e.pull.x, e.pull.y));
+    }
+    assert.ok(maxPull > 2, `拖动中尾巴被拉长：${maxPull}`);
+    assert.equal(fish.state, 'held');
+    const bubblesBefore = t.aq._play().bubbles.length;
+    assert.equal(t.aq.drop(800, 460), true);
+    assert.equal(fish.state, 'alive');
+    const speed = Math.hypot(fish.vx, fish.vy);
+    assert.ok(speed > 0, '向前冲');
+    assert.ok(t.aq._play().bubbles.length >= bubblesBefore + PP.RELEASE_BUBBLES, '冒泡');
+    assert.ok(t.aq._play().pulls.has(fish.id), '尾巴还在回弹');
+    frames(t, 200);
+    assert.equal(t.aq._play().pulls.size, 0, '弹簧停稳后清掉');
+});
+
+test('拉尾：拖进网兜捞出 = 静悄悄收起拉尾（没有冲刺与泡）；取消：拖过则回弹冲刺，没拖过则静悄悄', async () => {
+    const a = await playFish();
+    a.t.aq.grabAt(480, 300);
+    for (let i = 0; i < 30; i++) a.t.frame({ pointer: { x: 480 - i * 12, y: 300 + i * 8 } });
+    const bubbles = a.t.aq._play().bubbles.length;
+    assert.equal(a.t.aq.drop(100, 560), true);
+    assert.equal(a.t.aq._play().pulls.size, 0, '捞出：拉尾记录立即清掉');
+    assert.equal(a.t.aq._play().bubbles.length, bubbles, '没有冲刺的泡');
+
+    const b = await playFish();
+    b.t.aq.grabAt(480, 300);
+    for (let i = 0; i < 30; i++) b.t.frame({ pointer: { x: 480 + i * 10, y: 300 } });
+    const before = b.t.aq._play().bubbles.length;
+    assert.equal(b.t.aq.cancel(), true);
+    assert.equal(b.fish.state, 'alive');
+    assert.ok(b.t.aq._play().bubbles.length > before, '拖过之后取消：冲刺并冒泡');
+    assert.ok(b.t.aq._play().pulls.has(b.fish.id), '尾巴回弹');
+
+    const c = await playFish();
+    c.t.aq.grabAt(480, 300);
+    c.t.frame({ pointer: { x: 481, y: 300 } });
+    assert.equal(c.t.aq.cancel(), true);
+    assert.equal(c.t.aq._play().pulls.size, 0, '没拖就取消：静悄悄');
+    assert.equal(c.t.aq._play().bubbles.length, 0);
+});
+
+test('拉尾：没有网兜 DOM（受限环境）时拖动开始就放回，拉尾记录一并收起、没有冲刺', async () => {
+    const t = await make({ stored: { v: 1, fish: [entry('hammer', 'h1')] }, dom: false });
+    t.frame();
+    const fish = t.aq._world().fish[0];
+    fish.x = 500; fish.y = 300; fish.ang = 0; fish.vx = 0; fish.vy = 0; fish.alpha = 1; fish.state = 'alive';
+    assert.equal(t.aq.grabAt(480, 300), true);
+    assert.equal(fish.held.tail, true);
+    t.frame({ pointer: { x: 300, y: 300 } });
+    assert.equal(t.aq.isGrabbing(), false);
+    assert.equal(fish.state, 'alive');
+    assert.equal(t.aq._play().pulls.size, 0);
+    assert.equal(t.aq._play().bubbles.length, 0);
+});
+
+test('玩法出错只停玩法：鱼、放入与捞出、存储照常，喂食按钮收起；每一处玩法调用都做过', async () => {
+    const wrap = name => {
+        const bad = Object.assign({}, PlayCore, { [name]: () => { throw new Error(`坏了：${name}`); } });
+        return { playCore: bad };
+    };
+    const scenes = {
+        poke: async t => { t.aq.grabAt(520, 300); t.aq.drop(520, 300); },
+        sprinkle: async t => { feedButton(t).click(); },
+        attractors: async t => { feedButton(t).click(); t.frame(); },
+        step: async t => { feedButton(t).click(); t.frame(); },
+        extrasOf: async t => { feedButton(t).click(); t.frame(); },
+        isTailZone: async t => { t.aq.grabAt(480, 300); },
+        beginHold: async t => { t.aq.grabAt(480, 300); },
+        endHold: async t => { t.aq.grabAt(480, 300); t.frame({ pointer: { x: 480, y: 300 } }); t.frame({ pointer: { x: 700, y: 200 } }); t.aq.drop(700, 200); },
+        resize: async t => { feedButton(t).click(); t.frame({ width: 640, height: 360 }); },
+    };
+    for (const [name, act] of Object.entries(scenes)) {
+        const t0 = await playFish({ env: wrap(name) });
+        const { t, fish } = t0;
+        await act(t);
+        t.frame();
+        assert.equal(t.aq.state().failed, false, `${name}：鱼层没有停`);
+        assert.equal(t.aq.state().playFailed, true, `${name}：玩法停了`);
+        assert.ok(t.warns.some(w => /玩法出错/.test(w) && w.includes(`坏了：${name}`)), `${name}：留了警告：${t.warns}`);
+        assert.equal(t.d.findAll(n => n.classes.has('aq-feed')).length, 0, `${name}：喂食按钮收起`);
+        assert.equal(t.d.findAll(n => n.classes.has('aq-feed-row'))[0].hidden, true, `${name}：提示行也收起`);
+        if (name === 'sprinkle') assert.match(statusText(t), /喂食出错/, '状态栏说明原因');
+        assert.equal(t.warns.filter(w => /玩法出错/.test(w)).length, 1, `${name}：只警告一次`);
+        assert.equal(t.frame(), true);
+        assert.ok(fish.state === 'alive' || fish.state === 'held', `${name}：鱼还在`);
+        t.aq.cancel();
+        assert.equal((await t.aq.add('angel')).ok, true, `${name}：放入仍可用`);
+    }
+    const drawBad = await playFish({ env: { play: Object.assign({}, PlayUi, { drawBack: () => { throw new Error('坏了：画'); } }) } });
+    drawBad.t.aq.grabAt(520, 300); drawBad.t.aq.drop(520, 300);
+    assert.equal(drawBad.t.frame(), true);
+    assert.equal(drawBad.t.aq.state().playFailed, true);
+    assert.equal(drawBad.t.aq.state().failed, false);
+    const drawBad2 = await playFish({ env: { play: Object.assign({}, PlayUi, { drawFront: () => { throw new Error('坏了：画前层'); } }) } });
+    drawBad2.t.aq.grabAt(520, 300); drawBad2.t.aq.drop(520, 300);
+    assert.equal(drawBad2.t.frame(), true);
+    assert.equal(drawBad2.t.aq.state().playFailed, true);
 });
+
+test('玩法出错时正拉着尾巴的鱼照常放回；停用后不再调用玩法，下次 start 重新可用', async () => {
+    let throwOnStep = false;
+    const flaky = Object.assign({}, PlayCore, { step: (...args) => { if (throwOnStep) throw new Error('坏了：step'); return PlayCore.step(...args); } });
+    const { t, fish } = await playFish({ env: { playCore: flaky } });
+    t.aq.grabAt(480, 300);
+    t.frame({ pointer: { x: 480, y: 300 } });
+    throwOnStep = true;
+    t.frame({ pointer: { x: 600, y: 300 } });
+    assert.equal(t.aq.state().playFailed, true);
+    assert.equal(t.aq.isGrabbing(), true, '抓取本身不受影响');
+    t.frame({ pointer: { x: 700, y: 200 } });
+    assert.equal(t.aq.drop(700, 200), true);
+    assert.equal(fish.state, 'alive', '鱼被放回');
+    const calls = { n: 0, step: 0 };
+    flaky.poke = (...args) => { calls.n++; return PlayCore.poke(...args); };
+    flaky.step = (...args) => { calls.step++; return PlayCore.step(...args); };
+    t.aq.grabAt(fish.x, fish.y); t.aq.drop(fish.x, fish.y);
+    frames(t, 5);
+    assert.equal(calls.n, 0, '停用后不再调用玩法');
+    assert.equal(calls.step, 0, '停用后帧循环不再推进玩法');
+    throwOnStep = false;
+    t.aq.stop();
+    t.aq.start();
+    await settle();
+    assert.equal(t.aq.state().playFailed, false, '重新开始：玩法重新可用');
+    assert.ok(feedButton(t), '喂食按钮回来了');
+});
+
+test('玩法状态与 world 同生命周期：省流量切换（重建 world）、停止、鱼被全部捞出都会丢弃；缩放窗口时位置按比例缩放；从不存储', async () => {
+    const a = await playFish();
+    a.t.aq.grabAt(520, 300); a.t.aq.drop(520, 300);
+    assert.ok(a.t.aq._play());
+    a.t.frame({ lowPower: true });
+    assert.equal(a.t.aq._play(), null, '省流量切换重建了 world：玩法状态随之丢弃');
+
+    const b = await playFish();
+    feedButton(b.t).click();
+    const before = b.t.aq._play().pellets.map(p => ({ x: p.x, y: p.y }));
+    b.t.frame({ width: 640, height: 540, dt: 0 });
+    const after = b.t.aq._play().pellets;
+    assert.equal(after.length, before.length);
+    after.forEach((p, i) => { assert.ok(Math.abs(p.x - before[i].x * 0.5) < 1e-6 && Math.abs(p.y - before[i].y * 0.75) < 1e-6, `饲料 ${i} 位置按横向 0.5、纵向 0.75 缩放：${p.x},${p.y}`); });
+
+    const c = await playFish();
+    feedButton(c.t).click();
+    for (const fn of feedButton(c.t).listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
+    fireDoc(c.t, 'pointermove', { clientX: 300, clientY: 300 });
+    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed-ghost')).length, 1, '拖拽中有饲料团');
+    c.t.aq.stop();
+    assert.equal(c.t.aq._play(), null);
+    assert.equal(c.t.d.findAll(n => n.classes.has('aq-feed') || n.classes.has('aq-feed-ghost')).length, 0, '停止后喂食按钮与饲料团都清掉');
+    assert.equal(Object.values(c.t.d.docListeners).flat().length, 0, '停止后文档上不留监听（含喂食拖拽与 Esc）');
+
+    const d = await playFish();
+    feedButton(d.t).click();
+    await d.t.aq.remove('h1');
+    await settle();
+    frames(d.t, 80);
+    assert.equal(d.t.aq._play(), null, '鱼全没了：玩法状态丢弃，一笔不画');
+    const sets = JSON.stringify(a.t.fc.state.sets) + JSON.stringify(b.t.fc.state.sets) + JSON.stringify(c.t.fc.state.sets);
+    assert.ok(!/pellet|ripple|bubble|pull/.test(sets), '玩法状态从不写进存储');
+});
+
+
+test('玩法接线的其余约定：世界没建好时点喂食什么都不发生；喂食钩子过滤坏坐标、认得托盘范围、接上了宿主的 window；窗口失焦取消拖拽', async () => {
+    const early = await make({ stored: { v: 1, fish: [entry('clown', 'c1')] } });
+    assert.equal(early.aq._world(), null, '还没有帧：world 为空');
+    assert.equal(feedButton(early).disabled, false);
+    feedButton(early).click();
+    assert.equal(early.aq._play(), null);
+    assert.equal(early.aq.state().playFailed, false, '不算玩法出错');
+    assert.deepEqual(early.warns, []);
+    assert.equal(statusText(early), '');
+
+    let hooks = null;
+    const wl = {};
+    const fakeWin = {
+        addEventListener: (n, f) => { (wl[n] = wl[n] || []).push(f); },
+        removeEventListener: (n, f) => { wl[n] = (wl[n] || []).filter(x => x !== f); },
+    };
+    const stub = { drawBack() {}, drawFront() {}, mountFeed: (parent, h) => { hooks = h; return PlayUi.mountFeed(parent, h); } };
+    const { t } = await playFish({ env: { play: stub, window: fakeWin } });
+    assert.equal(hooks.win, fakeWin, '宿主的 window 接进了喂食按钮');
+    assert.equal(hooks.doc, t.d.document);
+    assert.equal(typeof hooks.now, 'function');
+    hooks.feed({ x: NaN, y: 5 });
+    const play = t.aq._play();
+    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT);
+    const h = t.aq._world().height;
+    assert.ok(play.pellets.every(p => p.y < h * 0.3), '没有有效坐标：从上面落下，而不是落在 NaN');
+    play.pellets.length = 0;
+    play.lastSprinkle = -Infinity;
+    hooks.feed({ x: 5, y: NaN });
+    assert.equal(play.pellets.length, PP.SPRINKLE_COUNT, '只有 y 坏掉同样当作没有坐标');
+    assert.ok(play.pellets.every(p => p.y < h * 0.3));
+
+    const toggle = t.d.findAll(n => n.classes.has('aq-toggle'))[0];
+    const panel = t.d.findAll(n => n.classes.has('aq-panel'))[0];
+    toggle.rect = { left: 1200, top: 560, width: 40, height: 40 };
+    panel.rect = { left: 900, top: 400, width: 272, height: 200 };
+    assert.equal(hooks.overUi(1210, 570), true, '开关按钮上');
+    for (const [x, y] of [[1200, 570], [1240, 570], [1210, 560], [1210, 600]]) assert.equal(hooks.overUi(x, y), true, `边界上（含）：${x},${y}`);
+    for (const [x, y] of [[1199.9, 570], [1240.1, 570], [1210, 559.9], [1210, 600.1]]) assert.equal(hooks.overUi(x, y), false, `边界外：${x},${y}`);
+    assert.equal(hooks.overUi(1000, 500), true, '展开的面板上');
+    assert.equal(hooks.overUi(600, 300), false, '水里');
+    panel.rect = { left: 0, top: 0, width: 0, height: 0 };
+    assert.equal(hooks.overUi(0, 0), false, '面板收起（面积为 0）：不算');
+
+    const button = feedButton(t);
+    for (const fn of button.listeners.pointerdown || []) fn({ button: 0, clientX: 10, clientY: 10, isPrimary: true });
+    fireDoc(t, 'pointermove', { clientX: 300, clientY: 300 });
+    assert.equal(wl.blur.length, 1, '拖拽期间监听窗口失焦');
+    const before = play.pellets.length;
+    for (const fn of [...wl.blur]) fn();
+    assert.equal(t.d.findAll(n => n.classes.has('aq-feed-ghost')).length, 0, '失焦取消拖拽：饲料团消失');
+    fireDoc(t, 'pointerup', { clientX: 300, clientY: 300 });
+    assert.equal(play.pellets.length, before, '取消后松手不再撒');
+});
+
+test('拉尾：后半身没拖就松手 = 点了一下：戳一下并静悄悄收起拉尾记录（没有松手冲刺的泡）', async () => {
+    const { t, fish } = await playFish();
+    assert.equal(t.aq.grabAt(480, 300), true);
+    assert.equal(fish.held.tail, true);
+    t.frame({ pointer: { x: 481, y: 300 } });
+    assert.equal(t.aq.drop(481, 300), false);
+    const play = t.aq._play();
+    assert.equal(play.pulls.size, 0, '拉尾记录静悄悄收起');
+    assert.equal(play.ripples.length, 1, '点一下 = 戳');
+    assert.ok(play.bubbles.length <= PP.POKE_BUBBLES + 1, `只有戳的泡，没有冲刺的泡：${play.bubbles.length}`);
+});
+
+test('画法接线：吃到饲料的鱼与被拉着尾巴的鱼，画出来与平时不一样（extras 真的传给了 drawFish）', async () => {
+    const { t, fish } = await playFish();
+    t.aq.grabAt(520, 300);
+    t.aq.drop(520, 300);
+    const play = t.aq._play();
+    play.ripples.length = 0;
+    play.bubbles.length = 0;
+    const draw = () => {
+        const log = [];
+        const ctx = new Proxy({}, {
+            get(target, key) {
+                if (key in target) return target[key];
+                return (...args) => { log.push([String(key), args]); if (/Gradient$/.test(String(key))) return { addColorStop: (...a) => log.push(['stop', a]) }; return undefined; };
+            },
+            set(target, key, value) { log.push([`set:${String(key)}`, [value]]); target[key] = value; return true; },
+        });
+        t.frame({ ctx, dt: 0 });
+        return JSON.stringify(log);
+    };
+    const base = draw();
+    assert.equal(draw(), base, '同一状态画两次一样');
+    play.fed.set(fish.id, play.time + PP.FED_S - 1);
+    const fedDraw = draw();
+    assert.notEqual(fedDraw, base, '吃到饲料的鱼画得不一样');
+    play.fed.clear();
+    play.pulls.set(fish.id, { x: -12, y: 0, vx: 0, vy: 0 });
+    assert.notEqual(draw(), base, '被拉着尾巴的鱼画得不一样');
+});
+
+
+test('玩法停用后喂食按钮只销毁一次：之后刷新托盘、停止都不再碰它', async () => {
+    const counts = { setEnabled: 0, destroy: 0 };
+    let real = null;
+    const stub = {
+        drawBack() {}, drawFront() {},
+        mountFeed: (parent, hooks) => {
+            real = PlayUi.mountFeed(parent, hooks);
+            return { button: real.button, setEnabled: (...a) => { counts.setEnabled++; return real.setEnabled(...a); }, destroy: () => { counts.destroy++; return real.destroy(); } };
+        },
+    };
+    const boom = Object.assign({}, PlayCore, { poke: () => { throw new Error('坏了：poke'); } });
+    const { t } = await playFish({ env: { play: stub, playCore: boom } });
+    t.aq.grabAt(520, 300);
+    t.aq.drop(520, 300);
+    assert.equal(t.aq.state().playFailed, true);
+    assert.equal(counts.destroy, 1);
+    const enabledBefore = counts.setEnabled;
+    await t.aq.add('angel');
+    await settle();
+    assert.equal(counts.setEnabled, enabledBefore, '销毁后刷新托盘不再更新它');
+    t.aq.stop();
+    assert.equal(counts.destroy, 1, '停止时也不再销毁第二次');
+});
+
+test('拉尾后的回弹期间又用前半身抓同一条鱼：不会因为旧的拉尾记录再冲刺一次，旧弹簧照常回到 0', async () => {
+    const { t, fish } = await playFish();
+    t.aq.grabAt(480, 300);
+    for (let i = 0; i < 30; i++) t.frame({ pointer: { x: 480 + i * 10, y: 300 } });
+    assert.equal(t.aq.drop(800, 200), true);
+    const play = t.aq._play();
+    assert.ok(play.pulls.has(fish.id), '尾巴还在回弹');
+    fish.vx = 0; fish.vy = 0;
+    const head = { x: fish.x + Math.cos(fish.ang) * fish.len * 0.3, y: fish.y + Math.sin(fish.ang) * fish.len * 0.3 };
+    assert.equal(t.aq.grabAt(head.x, head.y), true);
+    assert.ok(!fish.held.tail, '这次抓的是前半身');
+    for (let i = 0; i < 20; i++) t.frame({ pointer: { x: head.x + i * 10, y: head.y } });
+    for (const e of [PlayCore.extrasOf(play, fish)]) assert.ok(!e.pull || (Number.isFinite(e.pull.x) && Number.isFinite(e.pull.y)), '旧弹簧没有出 NaN');
+    const bubbles = play.bubbles.length;
+    assert.equal(t.aq.drop(900, 100), true);
+    assert.equal(play.bubbles.length, bubbles, '前半身拖动后松手：没有冲刺的泡');
+    frames(t, 200);
+    assert.equal(play.pulls.size, 0, '旧弹簧停稳后清掉');
+});
+
+test('鱼层出错（画鱼本身）：玩法状态一并丢弃，不留着占内存；这不算玩法出错', async () => {
+    const { t } = await playFish();
+    t.aq.grabAt(520, 300);
+    t.aq.drop(520, 300);
+    const play = t.aq._play();
+    play.ripples.length = 0;
+    play.bubbles.length = 0;
+    const bad = new Proxy({}, { get() { return () => { throw new Error('boom'); }; }, set() { return true; } });
+    assert.equal(t.frame({ ctx: bad }), false);
+    assert.equal(t.aq.state().failed, true);
+    assert.equal(t.aq.state().playFailed, false, '是鱼层出的错，不是玩法');
+    assert.equal(t.aq._play(), null);
+});
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium.test.js
```

期望：

```text
ℹ tests 57
ℹ pass 39
ℹ fail 18
```

失败的 18 项（第一个失败的原因是 `t.aq._play is not a function`）：

- `戳：点一下鱼（没拖）= 放回并戳一下：返回 false 不吞 click，鱼窜开、嘴边冒泡、点击处荡开涟漪，不写存储`
- `戳：拖过 6 px 就不是戳；玩法层关闭（playCore: null）时点一下鱼与原来完全一样`
- `绘制顺序：涟漪在鱼后面，饲料与泡在鱼前面；没有玩法状态时不调用`
- `喂食：按钮点一下从上面落 6 粒，冷却内再点没有变化，饲料满了提示“还没吃完”；没有鱼时按钮禁用并指向原因`
- `喂食：从按钮拖到水里松手，饲料落在松手处；鱼被吸引过去吃掉并变亮；松在托盘上取消`
- `拉尾：按在后半身 = 拉尾（抓住的点留在指针下、弹簧开始），按在前半身与原来一样；成群的小鱼不拉尾`
- `拉尾：拖拽中尾巴被拉长；拖过之后松手（网兜外）→ 尾巴弹回、鱼向前冲并冒泡，弹簧停稳后清掉`
- `拉尾：拖进网兜捞出 = 静悄悄收起拉尾（没有冲刺与泡）；取消：拖过则回弹冲刺，没拖过则静悄悄`
- `拉尾：没有网兜 DOM（受限环境）时拖动开始就放回，拉尾记录一并收起、没有冲刺`
- `玩法出错只停玩法：鱼、放入与捞出、存储照常，喂食按钮收起；每一处玩法调用都做过`
- `玩法出错时正拉着尾巴的鱼照常放回；停用后不再调用玩法，下次 start 重新可用`
- `玩法状态与 world 同生命周期：省流量切换（重建 world）、停止、鱼被全部捞出都会丢弃；缩放窗口时位置按比例缩放；从不存储`
- `玩法接线的其余约定：世界没建好时点喂食什么都不发生；喂食钩子过滤坏坐标、认得托盘范围、接上了宿主的 window；窗口失焦取消拖拽`
- `拉尾：后半身没拖就松手 = 点了一下：戳一下并静悄悄收起拉尾记录（没有松手冲刺的泡）`
- `画法接线：吃到饲料的鱼与被拉着尾巴的鱼，画出来与平时不一样（extras 真的传给了 drawFish）`
- `玩法停用后喂食按钮只销毁一次：之后刷新托盘、停止都不再碰它`
- `拉尾后的回弹期间又用前半身抓同一条鱼：不会因为旧的拉尾记录再冲刺一次，旧弹簧照常回到 0`
- `鱼层出错（画鱼本身）：玩法状态一并丢弃，不留着占内存；这不算玩法出错`

（新增的测试在旧代码上全部失败；原有的 39 项仍然通过。）

- [ ] **Step 3: 改 `js/aquarium.js` 的接线部分**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 7 3`（用法见附录 B；也可以照着下面的块手工写）。

相对 Task 5 之后的版本，差异如下：

```diff
--- a/js/aquarium.js
+++ b/js/aquarium.js
@@ -1,20 +1,23 @@
 (function (root, factory) {
     'use strict';
-    const core = (typeof module === 'object' && module.exports)
-        ? require('./aquarium-core.js')
-        : root && root.AquariumCore;
-    const api = factory(core, root);
-    if (typeof module === 'object' && module.exports) module.exports = api;
+    const cjs = typeof module === 'object' && module.exports;
+    const core = cjs ? require('./aquarium-core.js') : root && root.AquariumCore;
+    // 玩法（戳、喂食、拉尾）是可选层：少了或没加载成功只是没有这些玩法，鱼与存储照常
+    const playCore = cjs ? require('./aquarium-play-core.js') : root && root.AquariumPlayCore;
+    const playUi = cjs ? require('./aquarium-play.js') : root && root.AquariumPlay;
+    const api = factory(core, root, playCore || null, playUi || null);
+    if (cjs) module.exports = api;
     // 只创建实例，不自动启动：是否运行由背景体验的设置决定（applySettings 里 start/stop）；没选水母皮肤或关了水族馆时没有任何 DOM、监听或存储读取。
     if (root && typeof document !== 'undefined') root.Aquarium = api.create();
-})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core, root) {
+})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function (Core, root, DefaultPlayCore, DefaultPlayUi) {
     'use strict';
 
     // 水族馆控制器：存储（chrome.storage.local 的 aquariumV1）、托盘与居民列表、网兜、抓取状态机、画鱼。
     // 群游与命中等逻辑在 aquarium-core.js；鱼画在背景体验的共享画布上、先于水母画（鱼在水母后面），
     // 不自建 RAF 与画布：调度、隐藏即停、被工作台遮挡即停、省流量降帧都沿用宿主 background-experience.js。
     // 水母（主线）与任务完全无关于鱼：本文件不读也不写任务数据；唯一写入的是 aquariumV1，且只在用户放入或捞出时。
-    // 设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-design.md。
+    // 玩法（戳、喂食、拉尾）：规则在 aquarium-play-core.js，画法与喂食按钮在 aquarium-play.js，本文件只接线；玩法状态只在内存里、从不存储。
+    // 设计与取舍见 docs/superpowers/specs/2026-10-17-aquarium-design.md 与 2026-10-17-aquarium-interaction-design.md。
 
     const P = Core.PARAMS;
     const TAU = Math.PI * 2;
@@ -484,6 +487,10 @@
             const fn = env.nightAmount || (root && root.JellyfishCore && root.JellyfishCore.nightAmount);
             return typeof fn === 'function' ? fn(hour) : 0;
         };
+        // 玩法层可注入（测试里传 null 即关闭）；缺了就没有戳、喂食和拉尾，其余照常
+        const PlayCore = env.playCore !== undefined ? env.playCore : DefaultPlayCore;
+        const PlayUi = env.play !== undefined ? env.play : DefaultPlayUi;
+        const win = env.window !== undefined ? env.window : root;
 
         let started = false;
         let failed = false;
@@ -492,11 +499,13 @@
         let world = null;
         let entries = [];              // 用户放入的鱼（存储里的事实，按正常上限整理；省流量只限制绘制，不丢条目）
         let queue = Promise.resolve();
-        let session = null;            // 正在进行的抓取：{ fish, down, dragging, generation }
+        let session = null;            // 正在进行的抓取：{ fish, down, dragging, generation, tail }（tail：按住的是后半身，在拉尾）
         let ui = null;
         let netHold = null;            // 捞起动画期间网兜保持显示：{ world, until }（until 是 world.time）
         let storageListener = null;
         let counter = 0;
+        let play = null;               // 玩法状态（涟漪、饲料、泡、拉尾弹簧）：首次用到才建，与 world 同生命周期，换 world、停止、出错时丢弃；从不存储
+        let playFailed = false;        // 玩法出过错：本次会话停用玩法（鱼与存储照常），下次 start 再试
 
         // ----- 存储 -----
 
@@ -592,6 +601,53 @@
             });
         }
 
+        // ----- 玩法接线（戳、喂食、拉尾）：任何一步出错都只停玩法 -----
+
+        const playOn = () => !!(PlayCore && PlayUi && !playFailed && world);       // world 只在运行中且没出过错时才有
+
+        function ensurePlay() {
+            if (!play) play = PlayCore.create();
+            return play;
+        }
+
+        function disablePlay(error) {
+            if (playFailed) return;
+            playFailed = true;
+            play = null;
+            warn(`[Aquarium] 玩法出错，本次会话停用戳、喂食和拉尾：${error && error.message ? error.message : error}`);
+            if (ui && ui.feed) { ui.feed.destroy(); ui.feed = null; }
+            if (ui && ui.feedRow) ui.feedRow.hidden = true;
+        }
+
+        /** 玩法里的任何调用都走这里：抛错就只停玩法（鱼、存储与宿主的帧循环不受影响），并返回 fallback。 */
+        function playGuard(fn, fallback) {
+            try { return fn(); } catch (error) { disablePlay(error); return fallback; }
+        }
+
+        function pokeFish(fish, at) {
+            if (!playOn()) return;
+            playGuard(() => PlayCore.poke(ensurePlay(), world, fish, at));
+        }
+
+        /** 收起拉尾记录。quiet：没有回弹、冲刺与泡（没拖就松手、被捞起）；否则尾巴弹回、鱼向前冲一下。调用前鱼应已 Core.release。 */
+        function endTail(s, quiet) {
+            if (!s.tail) return;
+            s.tail = false;
+            if (!play || !playOn()) return;
+            playGuard(() => PlayCore.endHold(play, world, s.fish, quiet ? { quiet: true } : undefined));
+        }
+
+        /** 喂食：按钮点击时 point 为 null（从上面落下），从按钮拖到水里松手时是松手处。结果同时写进状态栏。 */
+        function feedAt(point) {
+            if (!playOn()) return { ok: false, reason: 'inactive' };
+            const at = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : undefined;
+            const result = playGuard(() => PlayCore.sprinkle(ensurePlay(), world, at), { ok: false, reason: 'failed' });
+            if (result.ok) setStatus(`落下了 ${result.count} 粒饲料`);
+            else if (result.reason === 'busy') setStatus('饲料还没吃完');
+            else if (result.reason === 'failed') setStatus('喂食出错，已停用戳、喂食和拉尾');
+            return result;
+        }
+
         // ----- 界面（托盘、居民列表、网兜）：只用 createElement 与 textContent -----
 
         function el(tag, className, text) {
@@ -633,6 +689,15 @@
                 speciesButtons.set(spec.id, button);
             }
             panel.appendChild(row);
+            // 喂食：玩法层可用时才有（缺了或出错都不显示，也不影响放入与捞出）
+            let feed = null;
+            let feedRow = null;
+            if (PlayCore && PlayUi && !playFailed) {
+                feedRow = el('div', 'aq-feed-row');
+                feed = PlayUi.mountFeed(feedRow, { doc, win, now, feed: point => feedAt(point), overUi: (x, y) => overUi(x, y) });
+                feedRow.appendChild(el('span', 'aq-feed-hint', '点一下撒饲料，也可以拖到水里'));
+                panel.appendChild(feedRow);
+            }
             const capacityLine = el('div', 'aq-capacity', '');
             panel.appendChild(capacityLine);
             const reasonLine = el('div', 'aq-reason', '');
@@ -665,12 +730,13 @@
 
             doc.body.appendChild(rootEl);
             doc.body.appendChild(net);
-            return { root: rootEl, toggle, panel, list, status, net, speciesButtons, capacityLine, reasonLine, onKey };
+            return { root: rootEl, toggle, panel, list, status, net, speciesButtons, capacityLine, reasonLine, onKey, feed, feedRow };
         }
 
         function destroyUi() {
             if (!ui) return;
             if (typeof doc.removeEventListener === 'function') doc.removeEventListener('keydown', ui.onKey);
+            if (ui.feed) ui.feed.destroy();
             ui.root.remove();
             ui.net.remove();
             ui = null;
@@ -691,11 +757,19 @@
                 if (blockedNow && block.text) button.setAttribute('aria-describedby', reasonId);
                 else button.removeAttribute('aria-describedby');
             }
+            if (ui.feed) {
+                const hasFish = entries.length > 0;
+                ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');
+            }
             ui.capacityLine.textContent = `已放 ${cap.entries}/${cap.maxEntries} 个${low ? '（省流量）' : ''} · 大型鱼 ${cap.large}/${cap.maxLarge}`;
             ui.reasonLine.textContent = block.text;
             ui.reasonLine.hidden = !block.text;
             const items = [];
-            if (!entries.length) items.push(el('li', 'aq-empty', '还没有鱼，点上面的鱼种放入'));
+            if (!entries.length) {
+                const empty = el('li', 'aq-empty', '还没有鱼，点上面的鱼种放入');
+                empty.setAttribute('id', 'aq-empty');
+                items.push(empty);
+            }
             for (const info of describeEntries(entries)) {
                 const li = el('li', 'aq-item');
                 li.appendChild(el('span', 'aq-item-name', info.label));
@@ -712,11 +786,14 @@
 
         // ----- 抓取 -----
 
-        const netContains = (x, y) => {
-            if (!ui || !ui.net || typeof ui.net.getBoundingClientRect !== 'function') return false;
-            const r = ui.net.getBoundingClientRect();
+        const inRect = (node, x, y) => {
+            if (!node || typeof node.getBoundingClientRect !== 'function') return false;
+            const r = node.getBoundingClientRect();
             return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;
         };
+        const netContains = (x, y) => inRect(ui && ui.net, x, y);
+        /** (x, y) 是不是在托盘上（开关按钮或展开的面板）：喂食拖出去时松在这里算取消。 */
+        const overUi = (x, y) => !!ui && (inRect(ui.toggle, x, y) || inRect(ui.panel, x, y));
 
         const netCenter = () => {
             if (!ui || !ui.net || typeof ui.net.getBoundingClientRect !== 'function') return null;
@@ -747,8 +824,11 @@
         function grabAt(x, y) {
             if (!started || failed || !world || session) return false;
             const fish = Core.hitTest(world, x, y);
-            if (!fish || !Core.grab(world, fish, x, y)) return false;
-            session = { fish, down: { x, y }, dragging: false, generation };
+            if (!fish) return false;
+            const tail = playOn() && playGuard(() => PlayCore.isTailZone(fish, x, y), false);
+            if (!Core.grab(world, fish, x, y, tail ? { tail: true } : undefined)) return false;
+            session = { fish, down: { x, y }, dragging: false, generation, tail };
+            if (tail) playGuard(() => PlayCore.beginHold(ensurePlay(), world, fish));        // 出错时玩法停用，endTail 随之什么都不做
             return true;
         }
 
@@ -762,6 +842,7 @@
                 s.dragging = true;
                 if (!ui) {                         // 没有落点（受限环境）：这次不抓了，鱼原样放回，绝不在没有网兜时捞出
                     Core.release(world, s.fish);
+                    endTail(s, true);
                     endSession();
                     return;
                 }
@@ -770,20 +851,26 @@
             ui.net.classList.toggle('aq-net-near', netContains(point.x, point.y));
         }
 
-        /** 抬起：返回这次是不是真的“拖过”（宿主据此吞掉随后的 click）。没拖过 = 放回；拖过但不在网兜里 = 放回；在网兜里 = 捞出。 */
+        /**
+         * 抬起：返回这次是不是真的“拖过”（宿主据此吞掉随后的 click）。
+         * 没拖过 = 放回并“戳”一下（点一下鱼，不吞 click）；拖过但不在网兜里 = 放回（拉着尾巴的：尾巴弹回、鱼向前冲）；在网兜里 = 捞出。
+         */
         function drop(x, y) {
             const s = session;
             if (!s) return false;
             if (!present(s)) { endSession(); return false; }
+            const fish = s.fish;
             if (!s.dragging) {
-                Core.release(world, s.fish);
+                Core.release(world, fish);
+                endTail(s, true);
                 endSession();
+                pokeFish(fish, s.down);
                 return false;
             }
             const inNet = netContains(x, y);
             const to = inNet ? netCenter() : null;
-            const fish = s.fish;
-            if (!inNet) { endSession(); Core.release(world, fish); return true; }
+            if (!inNet) { endSession(); Core.release(world, fish); endTail(s, false); return true; }
+            endTail(s, true);
             endSession(true);
             netHold = { world, until: world.time + P.SCOOP_S + 0.1 };
             void remove(fish.entry, to ? { to } : undefined);
@@ -793,7 +880,10 @@
         function cancel() {
             const s = session;
             if (!s) return false;
-            if (present(s)) Core.release(world, s.fish);
+            if (present(s)) {
+                Core.release(world, s.fish);
+                endTail(s, !s.dragging);
+            }
             endSession();
             return true;
         }
@@ -824,6 +914,7 @@
             if (started) return;
             started = true;
             failed = false;
+            playFailed = false;
             loaded = false;
             generation++;
             world = null;
@@ -844,6 +935,7 @@
             storageListener = null;
             destroyUi();
             world = null;
+            play = null;
             entries = [];
             loaded = false;
         }
@@ -860,26 +952,35 @@
                 const low = !!lowPower;
                 if (!world || world.lowPower !== low) {
                     world = Core.createWorld({ width, height, random, lowPower: low });
+                    play = null;
                     Core.reconcile(world, entries, { instant: true });
                     refreshUi();
                 } else if (world.width !== width || world.height !== height) {
+                    const ratioX = width / world.width;
+                    const ratioY = height / world.height;
                     Core.resize(world, width, height);
+                    if (play) playGuard(() => PlayCore.resize(play, ratioX, ratioY));
                 }
                 const point = pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y) ? { x: pointer.x, y: pointer.y } : null;
-                Core.step(world, dt, { pointer: point, bells: options.bells });
+                const attractors = play && playOn() ? playGuard(() => PlayCore.attractors(play, world), undefined) : undefined;
+                Core.step(world, dt, { pointer: point, bells: options.bells, attractors });
+                if (play) playGuard(() => PlayCore.step(play, world, dt));
                 tick(point);
                 if (netHold && !session && (netHold.world !== world || world.time >= netHold.until)) hideNet();
-                if (!world.fish.length) return true;
+                if (!world.fish.length) { play = null; return true; }
                 const night = options.night === false ? 0 : nightAmount(Number.isFinite(options.nightHour) ? options.nightHour : hourNow());
-                const view = { amount: clamp(Number.isFinite(options.amount) ? options.amount : 0.65, 0, 1), night: clamp(night || 0, 0, 1), lowPower: low };
+                const view = { amount: clamp(Number.isFinite(options.amount) ? options.amount : 0.65, 0, 1), night: clamp(night || 0, 0, 1), lowPower: low, scale: world.scale };
                 const colors = palette();
                 const order = world.fish.slice().sort((a, b) => a.z - b.z);       // 先画远的
-                for (const fish of order) drawFish(ctx, fish, colors, view);
+                if (play) playGuard(() => PlayUi.drawBack(ctx, play, view));
+                for (const fish of order) drawFish(ctx, fish, colors, view, play ? playGuard(() => PlayCore.extrasOf(play, fish), undefined) : undefined);
+                if (play) playGuard(() => PlayUi.drawFront(ctx, play, view));
                 return true;
             } catch (error) {
                 failed = true;
                 session = null;
                 world = null;
+                play = null;
                 destroyUi();
                 warn(`[Aquarium] 绘制出错，本次会话停用水族馆：${error && error.message ? error.message : error}`);
                 return false;
@@ -891,8 +992,9 @@
             isActive: () => started && !failed,
             isGrabbing: () => !!session,
             entries: () => entries.map(item => ({ id: item.id, species: item.species, addedAt: item.addedAt })),
-            state: () => ({ started, failed, loaded, entries: entries.length, fish: world ? world.fish.length : 0, grabbing: !!session }),
+            state: () => ({ started, failed, loaded, entries: entries.length, fish: world ? world.fish.length : 0, grabbing: !!session, playFailed }),
             _world: () => world,
+            _play: () => play,
         };
     }
 
```

- [ ] **Step 4: 跑测试，确认绿**

```bash
node --test test/aquarium.test.js
node --test test/aquarium-core.test.js test/aquarium-play-core.test.js test/aquarium-extras.test.js test/aquarium-play.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

第一条期望 `tests 57 / pass 57 / fail 0`；第二条（七个文件，集成测试还是旧的 21 项）期望：

```text
ℹ tests 201
ℹ pass 201
ℹ fail 0
```

- [ ] **Step 5: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Only in ./js: aquarium-play.js
Files /tmp/aq-base/js/aquarium.js and ./js/aquarium.js differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-extras.test.js
Only in ./test: aquarium-play-core.test.js
Only in ./test: aquarium-play.test.js
Files /tmp/aq-base/test/aquarium.test.js and ./test/aquarium.test.js differ
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add js/aquarium.js test/aquarium.test.js`，提交说明：`feat(aquarium): 控制器接线——戳、拉尾、喂食与玩法层隔离`。

---

## Task 8：页面接线（`index.html`、样式、设置页说明）与集成测试

**目标。** 让真实页面加载新模块并有喂食按钮的样式：`index.html` 里 `aquarium-core.js`、`aquarium-play-core.js`、`aquarium-play.js`、`aquarium.js` 依次加载（都在水母之后、宿主之前），同步 `?v=` 钉子；`css/aquarium.css` 加喂食行、按钮与拖影的样式；设置页“水族馆小鱼”说明里加互动的描述。集成测试把这些接线与源码合同钉住。

**Files:**
- Modify: `index.html`、`css/aquarium.css`、`settings.html`
- Modify（末尾追加）: `test/aquarium-integration.test.js`

**Interfaces:**
- Consumes: Task 1–7。
- Produces: 页面里 `window.AquariumCore`、`window.AquariumPlayCore`、`window.AquariumPlay`、`window.Aquarium` 都可用；版本钉子 `aquarium.css?v=3`、`aquarium-core.js?v=3`、`aquarium-play-core.js?v=1`、`aquarium-play.js?v=1`、`aquarium.js?v=3`。

- [ ] **Step 1: 先写测试（修改 `test/aquarium-integration.test.js`）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 8 1`（用法见附录 B；也可以照着下面的块手工写）。

差异如下（原有 21 项里有几项的钉子随版本号一起更新，另追加 5 项）：

```diff
--- a/test/aquarium-integration.test.js
+++ b/test/aquarium-integration.test.js
@@ -42,7 +42,8 @@
 }
 
 /**
- * 宿主夹具。skin：'spy' 间谍皮肤 / 'real' 真实 jellyfish-core.js + jellyfish.js / 'none' 皮肤脚本缺席。
+ * 宿主夹具。aquarium：'spy' 间谍水族馆 / 'real' 真实核心 + 玩法 + 控制器 / 'real-noplay' 没有玩法脚本。
+ * skin：'spy' 间谍皮肤 / 'real' 真实 jellyfish-core.js + jellyfish.js / 'none' 皮肤脚本缺席。
  * 间谍皮肤只记录宿主怎么调用它；真实皮肤验证整条链路画在宿主画布上。
  */
 async function hostFixture({ effect = 'jellyfish', settings = {}, reduceMotion = false, saveData = false, skin = 'spy', memos, crumple = false, complete, aquarium = 'spy', localData = {}, order } = {}) {
@@ -140,8 +141,12 @@
         vm.runInContext(read('js/jellyfish-core.js'), context, { filename: 'jellyfish-core.js' });
         vm.runInContext(read('js/jellyfish.js'), context, { filename: 'jellyfish.js' });
     }
-    if (aquarium === 'real') {
+    if (aquarium === 'real' || aquarium === 'real-noplay') {
         vm.runInContext(read('js/aquarium-core.js'), context, { filename: 'aquarium-core.js' });
+        if (aquarium === 'real') {          // real-noplay：玩法脚本缺席（加载失败）时鱼层照常工作
+            vm.runInContext(read('js/aquarium-play-core.js'), context, { filename: 'aquarium-play-core.js' });
+            vm.runInContext(read('js/aquarium-play.js'), context, { filename: 'aquarium-play.js' });
+        }
         vm.runInContext(read('js/aquarium.js'), context, { filename: 'aquarium.js' });
     }
     vm.runInContext(read('js/background-experience.js'), context, { filename: 'background-experience.js' });
@@ -421,13 +426,92 @@
     for (let i = 0; i < 5; i++) f.render(116 + i * 16);
     assert.equal(f.calls.get('quadraticCurveTo') || 0, before, '没有鱼：没有身体曲线');
 });
+
+
+const HAMMER = { aquariumV1: { v: 1, fish: [{ id: 'h1', species: 'hammer', addedAt: 1 }] } };
+
+/** 真实水族馆里放一条静止、朝东的小锤头鲨在 (x, y)，返回它。skin 用间谍（永远抓不到水母），免得随机的水母恰好挡在鱼上。 */
+async function fishAt(x, y, { aquarium = 'real' } = {}) {
+    const f = await hostFixture({ skin: 'spy', aquarium, localData: HAMMER });
+    await tick(); await tick();
+    f.render(116);
+    const fish = f.win.Aquarium._world().fish[0];
+    Object.assign(fish, { x, y, vx: 0, vy: 0, ang: 0, alpha: 1, state: 'alive' });
+    return { f, fish };
+}
 
+test('整链路：点一下真实的鱼 = 戳（涟漪画在宿主画布上、鱼窜开、不吞随后的 click）；拖过 6 px 不算戳', async () => {
+    const { f, fish } = await fishAt(700, 400);
+    const aq = f.win.Aquarium;
+    assert.equal(aq._play(), null, '没戳之前没有玩法状态');
+    const arcs = () => f.calls.get('arc') || 0;
+    let before = arcs();
+    f.render(132);
+    const perFrame = arcs() - before;
+    f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
+    assert.equal(f.experience.grab.kind, 'fish');
+    f.dispatch('pointerup', { clientX: 720, clientY: 400, buttons: 0 });
+    assert.equal(f.experience.grab, null);
+    assert.equal(f.experience.swallowClickUntil, 0, '点一下不吞随后的 click');
+    assert.equal(aq._play().ripples.length, 1, '真实的玩法核心被调用了：出现一圈涟漪');
+    assert.ok(Math.hypot(fish.vx, fish.vy) > 0, '被戳的鱼窜开');
+    before = arcs();
+    f.render(148);
+    assert.ok(arcs() - before >= perFrame + 3, `涟漪的三道圈画在了宿主画布上：${arcs() - before} 对 ${perFrame}`);
+    // 这个夹具里没有 DOM（没有网兜这个落点）：拖过 6 px 时鱼原样放回，既不算戳也不吞 click
+    const drag = await fishAt(700, 400);
+    drag.f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
+    drag.f.dispatch('pointermove', { clientX: 760, clientY: 440, buttons: 1 });
+    drag.f.render(132);
+    assert.equal(drag.fish.held, null, '没有落点：原样放回');
+    drag.f.dispatch('pointerup', { clientX: 760, clientY: 440, buttons: 0 });
+    assert.equal(drag.f.win.Aquarium._play(), null, '拖过不是戳，按在前半身也没有拉尾记录');
+    assert.equal(Math.hypot(drag.fish.vx, drag.fish.vy), 0, '没有被戳');
+});
+
+test('整链路：按在后半身 = 拉尾抓取接通宿主指针；没有落点时拖过 6 px 就原样放回，不留拉尾状态', async () => {
+    const { f, fish } = await fishAt(700, 400);
+    const aq = f.win.Aquarium;
+    f.dispatch('pointerdown', { clientX: 680, clientY: 400, buttons: 1 });
+    assert.equal(fish.held.tail, true, '后半身：拉尾抓取');
+    assert.equal(aq._play().pulls.size, 1, '拉尾记录已建立');
+    f.dispatch('pointermove', { clientX: 740, clientY: 440, buttons: 1 });
+    f.render(132);
+    assert.equal(fish.held, null, '没有落点：放回');
+    assert.equal(fish.state, 'alive');
+    assert.equal(aq._play().pulls.size, 0, '拉尾记录同时清掉，没有残留的弹簧');
+    f.dispatch('pointerup', { clientX: 740, clientY: 440, buttons: 0 });
+    assert.equal(f.experience.grab, null);
+    for (let i = 0; i < 10; i++) f.render(148 + i * 16);
+    assert.equal(aq.state().failed, false);
+    assert.equal(aq.state().playFailed, false);
+});
+
+test('整链路：玩法脚本缺席（加载失败）时鱼层照常工作，点一下鱼与原来一样', async () => {
+    const { f, fish } = await fishAt(700, 400, { aquarium: 'real-noplay' });
+    const aq = f.win.Aquarium;
+    assert.equal(aq.isActive(), true);
+    f.dispatch('pointerdown', { clientX: 720, clientY: 400, buttons: 1 });
+    assert.equal(f.experience.grab.kind, 'fish');
+    f.dispatch('pointerup', { clientX: 720, clientY: 400, buttons: 0 });
+    assert.equal(aq._play(), null);
+    assert.equal(fish.vx, 0);
+    assert.equal(fish.vy, 0);
+    f.dispatch('pointerdown', { clientX: 680, clientY: 400, buttons: 1 });
+    assert.ok(!fish.held.tail, '没有玩法就没有拉尾');
+    for (let i = 0; i < 5; i++) f.render(132 + i * 16);
+    assert.equal(aq.state().failed, false);
+    assert.equal(aq.state().playFailed, false);
+});
+
 // ---------- 静态契约 ----------
 
 test('源码合同：鱼层不自建 RAF/定时器/画布，不 innerHTML/eval/联网，不碰任务/备忘录存储；只写 aquariumV1', () => {
     const aq = read('js/aquarium.js');
     const core = read('js/aquarium-core.js');
-    for (const [name, text] of [['aquarium.js', aq], ['aquarium-core.js', core]]) {
+    const playCore = read('js/aquarium-play-core.js');
+    const playUi = read('js/aquarium-play.js');
+    for (const [name, text] of [['aquarium.js', aq], ['aquarium-core.js', core], ['aquarium-play-core.js', playCore], ['aquarium-play.js', playUi]]) {
         assert.doesNotMatch(text, /requestAnimationFrame|setInterval|innerHTML|insertAdjacentHTML|\beval\(|new Function|fetch\(|XMLHttpRequest|sendMessage|chrome\.storage\.sync|document\.createElement\(.canvas/, name);
         assert.doesNotMatch(text, /\bmemos\b|completeTaskById|memoManager|TaskCrumple/, `${name} 不读写任务数据、不碰纸篓`);
     }
@@ -435,6 +519,9 @@
     assert.doesNotMatch(code, /\bdocument\b|\bwindow\b|\bDate\b|chrome\./, '核心是纯逻辑：不碰 DOM、时钟与 chrome');
     assert.equal((code.match(/Math\.random/g) || []).length, 1, '随机源只作为 createWorld 的默认参数出现，其余全部走 world.random');
     assert.match(code, /random = Math\.random/);
+    const playCode = playCore.replace(/\/\/.*$/gm, '').replace(/^\(function \(root, factory\)[\s\S]*?\}\)\(typeof window[^\n]*\n/, '');
+    assert.doesNotMatch(playCode, /\bdocument\b|\bwindow\b|\bDate\b|chrome\.|Math\.random/, '玩法核心同样是纯逻辑：不碰 DOM、时钟、chrome，随机数全部走 world.random');
+    assert.doesNotMatch(playUi, /chrome\.|localStorage|sessionStorage|indexedDB|Math\.random/, '玩法的画法与按钮不碰任何存储；饲料位置等随机量来自玩法核心');
     assert.equal((aq.match(/area\.set\(/g) || []).length, 1, '只有一处写存储');
     assert.doesNotMatch(aq, /area\.(remove|clear)\(/, '不删除、不清空存储');
     assert.match(aq, /STORAGE_KEY = 'aquariumV1'/);
@@ -449,14 +536,16 @@
     assert.match(host, /aquariumFish: true,/);
 });
 
-test('index.html：脚本顺序与版本钉子（核心先于控制器、都在水母之后宿主之前）、样式已链接', () => {
+test('index.html：脚本顺序与版本钉子（核心、玩法核心、玩法画法先于控制器，都在水母之后宿主之前）、样式已链接', () => {
     const html = read('index.html');
     const idx = s => { const i = html.indexOf(s); assert.ok(i >= 0, s); return i; };
-    assert.ok(idx('js/jellyfish.js?v=6') < idx('js/aquarium-core.js?v=2'));
-    assert.ok(idx('js/aquarium-core.js?v=2') < idx('js/aquarium.js?v=2'));
-    assert.ok(idx('js/aquarium.js?v=2') < idx('js/background-experience.js?v=12'));
-    idx('css/aquarium.css?v=2');
-    assert.ok(fs.existsSync(path.join(root, 'css/aquarium.css')));
+    assert.ok(idx('js/jellyfish.js?v=6') < idx('js/aquarium-core.js?v=3'));
+    assert.ok(idx('js/aquarium-core.js?v=3') < idx('js/aquarium-play-core.js?v=1'));
+    assert.ok(idx('js/aquarium-play-core.js?v=1') < idx('js/aquarium-play.js?v=1'));
+    assert.ok(idx('js/aquarium-play.js?v=1') < idx('js/aquarium.js?v=3'));
+    assert.ok(idx('js/aquarium.js?v=3') < idx('js/background-experience.js?v=12'));
+    idx('css/aquarium.css?v=3');
+    for (const file of ['css/aquarium.css', 'js/aquarium-play-core.js', 'js/aquarium-play.js']) assert.ok(fs.existsSync(path.join(root, file)), file);
 });
 
 test('设置页：有水族馆开关，默认开，保存键 aquariumFish，脚本版本已更新', () => {
@@ -489,12 +578,16 @@
     assert.ok(hint.includes(`大型鱼最多 ${P.MAX_LARGE} 条`), '写明大型鱼上限');
     assert.match(hint, /#1/, '说明列表里同种多个会编号');
     assert.match(hint, /选了“水族馆”时/);
+    assert.match(hint, /点一下鱼.*戳/, '说明里写了怎么戳');
+    assert.match(hint, /后半身.*拉/, '说明里写了拉鱼尾');
+    assert.match(hint, /喂食/, '说明里写了喂食');
+    assert.match(hint, /不保存/, '说明里写了这些互动不保存');
 });
 
 test('样式：托盘、面板、网兜类名与源码里的类名一致；网兜不接收事件', () => {
     const css = read('css/aquarium.css');
-    const aq = read('js/aquarium.js');
-    for (const cls of ['aq-ui', 'aq-toggle', 'aq-panel', 'aq-species', 'aq-list', 'aq-item', 'aq-catch', 'aq-status', 'aq-net', 'aq-net-on', 'aq-net-near', 'aq-empty', 'aq-capacity', 'aq-reason', 'aq-item-meta']) {
+    const aq = read('js/aquarium.js') + read('js/aquarium-play.js');
+    for (const cls of ['aq-ui', 'aq-toggle', 'aq-panel', 'aq-species', 'aq-list', 'aq-item', 'aq-catch', 'aq-status', 'aq-net', 'aq-net-on', 'aq-net-near', 'aq-empty', 'aq-capacity', 'aq-reason', 'aq-item-meta', 'aq-feed-row', 'aq-feed', 'aq-feed-hint', 'aq-feed-ghost']) {
         assert.ok(css.includes(`.${cls}`), `css 缺 .${cls}`);
         assert.ok(aq.includes(cls), `源码缺 ${cls}`);
     }
@@ -502,8 +595,24 @@
     assert.match(css, /\.aq-panel\[hidden\] \{ display: none; \}/);
     // 原因行没有内容时用 hidden 属性藏起来。这条规则现在对显示没有影响（.aq-reason 没写 display），只是防线：以后谁给 .aq-reason 加了 display，空的原因框就会一直露着
     assert.match(css, /\.aq-reason\[hidden\] \{ display: none; \}/);
+    assert.match(css, /\.aq-feed-row\[hidden\] \{ display: none; \}/, '玩法停用时收起的提示行真的会消失');
 });
 
+test('样式：喂食按钮可拖（touch-action: none）、禁用有样式；拖出去的饲料团不接收事件且比托盘高', () => {
+    const css = read('css/aquarium.css');
+    const rule = selector => { const start = css.indexOf(`${selector} {`); assert.ok(start >= 0, `缺 ${selector}`); return css.slice(start, css.indexOf('}', start)); };
+    assert.match(rule('.aq-feed'), /touch-action: none/);
+    assert.match(css, /\.aq-feed:disabled \{[^}]*opacity/);
+    const ghost = rule('.aq-feed-ghost');
+    assert.match(ghost, /pointer-events: none/);
+    assert.match(ghost, /position: fixed/);
+    const ghostZ = Number(/z-index: (\d+)/.exec(ghost)[1]);
+    const trayZ = Number(/z-index: (\d+)/.exec(rule('.aq-ui'))[1]);
+    assert.ok(ghostZ > trayZ, `饲料团（${ghostZ}）要盖在托盘（${trayZ}）上`);
+    assert.match(css, /html\.reduce-motion[^{]*\.aq-feed[^{]*\{ transition: none; \}/);
+    assert.match(css, /prefers-reduced-motion: reduce\) \{\s*\.aq-net, \.aq-toggle, \.aq-feed \{ transition: none; \}/);
+});
+
 test('样式：网兜不遮挡被拖着的鱼——没有磨砂模糊、实心底色几乎透明、网线不粗，提示文字单独成胶囊浮在网兜上方', () => {
     const css = read('css/aquarium.css');
     const block = selector => {
```

- [ ] **Step 2: 跑测试，确认按预期的原因红**

```bash
node --test test/aquarium-integration.test.js
```

期望：

```text
ℹ tests 25
ℹ pass 21
ℹ fail 4
```

失败的 4 项（第一个失败的原因是断言找不到 `js/aquarium-core.js?v=3`）：

- `index.html：脚本顺序与版本钉子（核心、玩法核心、玩法画法先于控制器，都在水母之后宿主之前）、样式已链接`
- `设置页文案：视觉风格叫“水族馆”（取值仍是 jellyfish），说明里不再出现“深海水母”；小鱼的名字与数字跟鱼种表和上限一致，没有旧叫法`
- `样式：托盘、面板、网兜类名与源码里的类名一致；网兜不接收事件`
- `样式：喂食按钮可拖（touch-action: none）、禁用有样式；拖出去的饲料团不接收事件且比托盘高`

- [ ] **Step 3: 改 `index.html`（脚本顺序与版本钉子）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 8 3`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/index.html
+++ b/index.html
@@ -13,7 +13,7 @@
     </style>
     <link rel="stylesheet" href="css/style.css?v=15">
     <link rel="stylesheet" href="css/background-experience.css?v=6">
-    <link rel="stylesheet" href="css/aquarium.css?v=2">
+    <link rel="stylesheet" href="css/aquarium.css?v=3">
     <link rel="stylesheet" href="css/touch-feel.css?v=1">
     <link rel="stylesheet" href="css/schedule.css">
     <link rel="stylesheet" href="css/alarm-center.css?v=1">
@@ -513,8 +513,10 @@
     <script src="js/quick-nav.js?v=13"></script>
     <script src="js/jellyfish-core.js?v=6"></script>
     <script src="js/jellyfish.js?v=6"></script>
-    <script src="js/aquarium-core.js?v=2"></script>
-    <script src="js/aquarium.js?v=2"></script>
+    <script src="js/aquarium-core.js?v=3"></script>
+    <script src="js/aquarium-play-core.js?v=1"></script>
+    <script src="js/aquarium-play.js?v=1"></script>
+    <script src="js/aquarium.js?v=3"></script>
     <script src="js/pomodoro-jelly.js?v=2"></script>
     <script src="js/background-experience.js?v=12"></script>
     <script src="js/background-warm.js?v=1"></script>
```

- [ ] **Step 4: 改 `css/aquarium.css`（喂食行、按钮、拖影）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 8 4`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/css/aquarium.css
+++ b/css/aquarium.css
@@ -1,4 +1,4 @@
-/* 水族馆（js/aquarium.js）的托盘、居民列表与网兜。只在选了“水族馆”视觉且开着水族馆小鱼时才有这些元素。
+/* 水族馆（js/aquarium.js）的托盘、居民列表与网兜，以及喂食按钮（js/aquarium-play.js）。只在选了“水族馆”视觉且开着水族馆小鱼时才有这些元素。
    托盘按钮放在“唤醒背景玩法”按钮（右下 18px / 82px）的正上方；面板向左展开，不遮挡底部 Dock。
    网兜是拖鱼时才出现的落点，与水母的纸篓是两个东西，不会同时出现（一次只抓一个）。 */
 
@@ -146,7 +146,53 @@
     transform: translateX(-50%);
 }
 
-html.reduce-motion .aq-net, html.reduce-motion .aq-toggle { transition: none; }
+/* 喂食：一个按钮加一句用法提示。按钮是暖色药丸（以区别于青绿的鱼种按钮），可以点（从上面落下）或按住拖到水里松手（落在松手处）。
+   touch-action: none 让触屏上的拖动不被当成页面滚动；没有鱼时禁用（原因由 aria-describedby 指向居民列表里的“还没有鱼”）。 */
+.aq-feed-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
+.aq-feed-row[hidden] { display: none; }
+.aq-feed {
+    flex: 0 0 auto;
+    padding: 4px 12px;
+    border: 1px solid rgba(255, 190, 90, .45);
+    border-radius: 999px;
+    color: inherit;
+    background: rgba(255, 190, 90, .14);
+    font: inherit;
+    cursor: grab;
+    touch-action: none;
+    transition: background .18s ease, border-color .18s ease, opacity .18s ease;
+}
+.aq-feed:hover:not(:disabled) { background: rgba(255, 190, 90, .26); border-color: rgba(255, 190, 90, .75); }
+.aq-feed:active:not(:disabled) { cursor: grabbing; }
+.aq-feed:focus-visible { outline: 2px solid rgba(139, 207, 255, .9); outline-offset: 2px; }
+.aq-feed:disabled { opacity: .4; cursor: not-allowed; }
+.aq-feed-hint { min-width: 0; color: rgba(242, 247, 255, .6); font-size: 12px; }
+
+/* 拖出去的那一小撮饲料：跟着指针，不接收事件；比托盘（100）高，才不会被面板盖住。 */
+.aq-feed-ghost {
+    position: fixed;
+    left: 0;
+    top: 0;
+    z-index: 101;
+    width: 0;
+    height: 0;
+    pointer-events: none;
+}
+.aq-feed-ghost > span {
+    position: absolute;
+    width: 7px;
+    height: 7px;
+    margin: -3.5px 0 0 -3.5px;
+    border: 1px solid rgba(110, 60, 10, .55);
+    border-radius: 50%;
+    background: rgb(255, 190, 90);
+    box-shadow: 0 0 8px rgba(255, 170, 70, .55);
+}
+.aq-feed-ghost > span:nth-child(1) { transform: translate(-7px, 3px); }
+.aq-feed-ghost > span:nth-child(2) { transform: translate(6px, 5px); }
+.aq-feed-ghost > span:nth-child(3) { transform: translate(0, -6px); }
+
+html.reduce-motion .aq-net, html.reduce-motion .aq-toggle, html.reduce-motion .aq-feed { transition: none; }
 @media (prefers-reduced-motion: reduce) {
-    .aq-net, .aq-toggle { transition: none; }
+    .aq-net, .aq-toggle, .aq-feed { transition: none; }
 }
```

- [ ] **Step 5: 改 `settings.html`（说明句）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 8 5`（用法见附录 B；也可以照着下面的块手工写）。

```diff
--- a/settings.html
+++ b/settings.html
@@ -193,7 +193,7 @@
                         <label class="sp-toggle"><input type="checkbox" id="set-bgJellyfishGrow" checked><span class="sp-toggle-slider"></span></label>
                     </div>
                     <div class="sp-field">
-                        <div class="sp-field-info"><span class="sp-field-label">水族馆小鱼</span><span class="sp-field-hint">选了“水族馆”时：右下角出现一个小鱼按钮，点开可以放入霓虹灯鱼、蓝吊、小丑鱼、河豚、神仙鱼、小锤头鲨、蝠鲼、鲸鲨（最多 12 个，省流量模式 6 个；大型鱼最多 2 条；面板里会显示已放数量，放不下时直接写明原因），也可以把鱼拖到屏幕下方的网兜里捞出，或在列表里点“捞出”（同一种放了多个时列表里按先后编号，例如“小丑鱼 #1”“小丑鱼 #2”）。鱼只是装饰：不绑任务、不吃水母、不影响任务和提醒；你放了哪些鱼只保存在本机，不会同步。关闭后背景里不再有鱼、也没有按钮，已放的鱼仍保留，重新打开时回来</span></div>
+                        <div class="sp-field-info"><span class="sp-field-label">水族馆小鱼</span><span class="sp-field-hint">选了“水族馆”时：右下角出现一个小鱼按钮，点开可以放入霓虹灯鱼、蓝吊、小丑鱼、河豚、神仙鱼、小锤头鲨、蝠鲼、鲸鲨（最多 12 个，省流量模式 6 个；大型鱼最多 2 条；面板里会显示已放数量，放不下时直接写明原因），也可以把鱼拖到屏幕下方的网兜里捞出，或在列表里点“捞出”（同一种放了多个时列表里按先后编号，例如“小丑鱼 #1”“小丑鱼 #2”）。鱼还能玩：点一下鱼会把它戳得窜开、水面荡开涟漪，按住后半身拖动会把尾巴拉长、松手后弹回并向前冲一下，面板里的“喂食”点一下就从上面撒饲料、也可以拖到水里松手，附近的鱼会游过去吃，吃到的会亮一阵子（这些互动只在当前页面有效，不保存）。鱼只是装饰：不绑任务、不吃水母、不影响任务和提醒；你放了哪些鱼只保存在本机，不会同步。关闭后背景里不再有鱼、也没有按钮，已放的鱼仍保留，重新打开时回来</span></div>
                         <label class="sp-toggle"><input type="checkbox" id="set-bgAquariumFish" checked><span class="sp-toggle-slider"></span></label>
                     </div>
                     <div class="sp-field">
```

- [ ] **Step 6: 跑测试，确认绿**

```bash
node --test test/aquarium-core.test.js test/aquarium-play-core.test.js test/aquarium-extras.test.js test/aquarium-play.test.js test/aquarium.test.js test/aquarium-shapes.test.js test/aquarium-integration.test.js
```

期望（水族馆七个文件的最终数字）：

```text
ℹ tests 205
ℹ pass 205
ℹ fail 0
```

- [ ] **Step 7: 检查点**

```bash
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

期望输出恰好是：

```text
Files /tmp/aq-base/css/aquarium.css and ./css/aquarium.css differ
Files /tmp/aq-base/index.html and ./index.html differ
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Only in ./js: aquarium-play.js
Files /tmp/aq-base/js/aquarium.js and ./js/aquarium.js differ
Files /tmp/aq-base/settings.html and ./settings.html differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-extras.test.js
Files /tmp/aq-base/test/aquarium-integration.test.js and ./test/aquarium-integration.test.js differ
Only in ./test: aquarium-play-core.test.js
Only in ./test: aquarium-play.test.js
Files /tmp/aq-base/test/aquarium.test.js and ./test/aquarium.test.js differ
```

建议提交点（**不执行**，只在你要求提交时才做）：`git add index.html css/aquarium.css settings.html test/aquarium-integration.test.js`，提交说明：`feat(aquarium): 页面接线、喂食样式与设置页说明`。

---

## Task 9：真实 Chromium 验证、变异检查、文档与收尾

**目标。** 在**仓库里的真实代码**上做规格 §6.5 要求的所有实测，对照通过线；做变异检查；更新技术文档、`AGENTS.md`、文档索引；分层报告并收尾。本任务不改功能代码——**除非实测没过**：那时回到对应任务，先写一个会失败的测试复现，再改，再重跑这里的步骤（不要默默放宽通过线）。

**Files:**
- Modify: `docs/technical/aquarium-20261017.md`、`AGENTS.md`、`docs/technical/_index.md`
- 写到 `/tmp`（不进仓库）：`/tmp/aq-play/*`（真实 Chromium 验证脚本）、`/tmp/aq-mut/*`（变异检查脚本，附录 A）

**Interfaces:** 无新增。

- [ ] **Step 1: 静态检查**

```bash
cd ~/worktrees/ctb-aquarium
node --check js/aquarium-core.js && node --check js/aquarium-play-core.js && node --check js/aquarium-play.js && node --check js/aquarium.js && echo syntax-ok
git diff --check && echo diff-check-ok
rg -n '[ \t]+$' js/aquarium-play-core.js js/aquarium-play.js test/aquarium-play-core.test.js test/aquarium-extras.test.js test/aquarium-play.test.js; echo "rg exit=$? (1 表示没有行尾空白)"
```

期望：`syntax-ok`、`diff-check-ok`、`rg exit=1`。（`git diff --check` 只覆盖已跟踪文件的改动，所以新文件另用 `rg` 查。）

- [ ] **Step 2: 全量套件，与改动之前的失败集合对照**

```bash
rm -rf /tmp/aq-final-full && rsync -a --exclude .git ~/worktrees/ctb-aquarium/ /tmp/aq-final-full/
rm -rf /tmp/aq-final-full/local-ai/node_modules && ln -s /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/local-ai/node_modules /tmp/aq-final-full/local-ai/node_modules
(cd /tmp/aq-final-full && node --test test/*.test.js test/*.test.mjs > /tmp/aq-suite-final.txt 2>&1)
rg '^ℹ (tests|pass|fail) ' /tmp/aq-suite-final.txt
python3 - <<'PY'
import re
def fails(p):
    s = set()
    for l in open(p, encoding='utf-8'):
        if l.startswith('✖') and 'failing tests' not in l:
            s.add(re.sub(r'\s*\([\d.]+ms\)\s*$', '', l.rstrip('\n')))
    return s
a = fails('/tmp/aq-suite-base.txt'); b = fails('/tmp/aq-suite-final.txt')
print(len(a), len(b), '仅基线失败:', sorted(a - b), '仅完成后失败:', sorted(b - a))
PY
```

期望（改动之前是 2508 / 2477 / 31，多出的 93 项就是新增测试）：

```text
ℹ tests 2601
ℹ pass 2570
ℹ fail 31
31 31 仅基线失败: [] 仅完成后失败: []
```

这 31 个失败在改动之前的副本里就存在（30 项是 `compute.run` 沙箱相关、1 项是 `test/youtube-home.test.mjs`），与本改动无关；这里按“失败集合不变”的口径比较。（如果你在 Task 1 没有把基线输出存成 `/tmp/aq-suite-base.txt`，现在补跑：`cd /tmp/aq-base-full && node --test test/*.test.js test/*.test.mjs > /tmp/aq-suite-base.txt 2>&1`。）

- [ ] **Step 3: 起两个预览服务**

8791 服务改动之后的代码（worktree），8792 服务改动之前的快照 `/tmp/aq-base`（只用来做对照）。

```bash
cd ~/worktrees/ctb-aquarium && (python3 -m http.server 8791 --bind 127.0.0.1 > /tmp/aq-8791.log 2>&1 & echo $! > /tmp/aq-8791.pid)
cd /tmp/aq-base && (python3 -m http.server 8792 --bind 127.0.0.1 > /tmp/aq-8792.log 2>&1 & echo $! > /tmp/aq-8792.pid)
sleep 1
for u in http://127.0.0.1:8791/index.html http://127.0.0.1:8791/js/aquarium-play-core.js http://127.0.0.1:8792/index.html http://127.0.0.1:8792/js/aquarium-play-core.js; do curl -s -o /dev/null -w '%{http_code} ' "$u"; done; echo
```

期望（注意 curl 带多个网址时 `-o` 只管第一个，所以用循环逐个请求）：

```text
200 200 200 404
```

最后的 `404` 是改动之前的快照里没有玩法脚本——这正是它作“改动之前”的证据。

- [ ] **Step 4: 写验证脚本（写到 `/tmp/aq-play/`，不进仓库）**

套用命令：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 9 4`（用法见附录 B；也可以照着下面的块手工写）。

脚本用 `playwright-core`，`common.mjs` 顶部那一行写的是这台机器上它的位置（`/Users/liuqingwen/.hermes/hermes-agent/node_modules/`）；换机器时只改那一行。脚本逐个检查页面里的真实行为，数字落在 `/tmp/aq-play/out/`，截图也在那里。

写入 `/tmp/aq-play/common.mjs`（完整文件）：

```javascript
import { createRequire } from 'node:module';
const require = createRequire('/Users/liuqingwen/.hermes/hermes-agent/node_modules/');
export const { chromium } = require('playwright-core');
export const URL = process.env.AQ_URL || 'http://127.0.0.1:8791/index.html';      // AQ_URL 可指向另一份预览（例如改动之前的代码），用来做对照

export const mk = list => list.map((species, i) => ({ id: `${species}-${i + 1}`, species, addedAt: i + 1 }));

export function storageFor(fish, { memos = 5, titles } = {}) {
  const names = titles || ['写完周报', '回复邮件', '整理会议纪要', '预约体检', '买猫粮', '读论文', '修自行车', '备份照片'];
  return {
    backgroundExperienceSettings: { enabled: true, visualEffect: 'jellyfish', intensity: 75, playgroundEnabled: true },
    aquariumV1: { v: 1, fish },
    memos: Array.from({ length: memos }, (_, i) => ({ id: 'm' + i, title: names[i % names.length], completed: false, priority: i % 2 ? 'medium' : 'high', createdAt: Date.now() + i })),
  };
}

/** 页面脚本之前注入：存储、可重复的随机数、可选的“夜晚”、演示用假光标与字幕。 */
export function initScript({ storage, seed = 7, night = false, cursor = false }) {
  return ({ storage, seed, night, cursor }) => {
    if (!localStorage.getItem('__chrome_storage__')) localStorage.setItem('__chrome_storage__', JSON.stringify(storage));
    let s = seed >>> 0;
    Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    if (night) { Date.prototype.getHours = function () { return 22; }; }
    if (!cursor) return;
    const boot = () => {
      const cur = document.createElement('div');
      cur.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;border:2px solid rgba(255,255,255,.95);background:rgba(255,255,255,.16);box-shadow:0 0 0 1px rgba(0,0,0,.4),0 3px 12px rgba(0,0,0,.4);pointer-events:none;z-index:2147483647;display:none';
      const cap = document.createElement('div');
      cap.style.cssText = 'position:fixed;left:50%;bottom:236px;transform:translateX(-50%);padding:9px 22px;border-radius:999px;background:rgba(6,12,24,.74);color:#fff;font:600 18px/1.35 -apple-system,"PingFang SC","Heiti SC",sans-serif;letter-spacing:.05em;white-space:nowrap;z-index:2147483646;pointer-events:none;opacity:0;transition:opacity .3s;box-shadow:0 6px 24px rgba(0,0,0,.35)';
      document.documentElement.append(cur, cap);
      let x = -100, y = -100, down = false;
      const paint = () => { cur.style.display = x < -50 ? 'none' : 'block'; cur.style.transform = `translate(${x}px,${y}px) scale(${down ? 0.8 : 1})`; cur.style.background = down ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.16)'; };
      addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; paint(); }, true);
      addEventListener('pointerdown', () => { down = true; paint(); }, true);
      addEventListener('pointerup', () => { down = false; paint(); }, true);
      window.__cap = t => { cap.textContent = t || ''; cap.style.opacity = t ? '1' : '0'; };
    };
    if (document.documentElement) boot(); else addEventListener('DOMContentLoaded', boot);
  };
}

export async function openPage(browser, { fish, dpr = 1, seed = 7, night = false, cursor = false, video, memos = 5, wait = 5000, viewport = { width: 1440, height: 900 }, patch, blockPlay = false }) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, ...(video ? { recordVideo: { dir: video, size: viewport } } : {}) });
  const page = await ctx.newPage();
  const createdAt = Date.now();
  const errors = [];
  page.on('pageerror', e => { if (!/chrome is not defined/.test(e.message)) errors.push(e.message); });
  await page.addInitScript(initScript({ storage: storageFor(fish, { memos }), seed, night, cursor }), { storage: storageFor(fish, { memos }), seed, night, cursor });
  if (blockPlay) await page.route(/\/js\/aquarium-play(-core)?\.js/, route => route.abort());
  if (patch) await page.route('**/js/aquarium-core.js*', async route => { const resp = await route.fetch(); const body = await resp.text(); await route.fulfill({ response: resp, body: patch(body) }); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  return { ctx, page, errors, createdAt };
}
```

写入 `/tmp/aq-play/play-lib.mjs`（完整文件）：

```javascript
// 互动验证的公共部分：启动页面、CDP 截图（不触发 resize）、找一条“按得到”的鱼、用真实鼠标移动。
import fs from 'node:fs';
import { chromium, mk, openPage } from './common.mjs';
export { chromium, mk, openPage };
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const OUT = '/tmp/aq-play/out';
fs.mkdirSync(OUT, { recursive: true });

const page_fish = (page, id) => page.evaluate(id => { const f = window.Aquarium._world().fish.find(f => f.id === id); return f ? { x: f.x, y: f.y } : null; }, id);

export async function launch(opts) {
    const browser = await chromium.launch({ headless: true });
    const h = await openPage(browser, opts);
    const cdp = await h.ctx.newCDPSession(h.page);
    const shot = async (name, clip) => {
        const r = await cdp.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
        fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
        return r.data;
    };
    // 以鱼当前的位置为中心截一小块并放大（scale 倍），看拉伸、涟漪的细节
    const shotAround = async (name, id, { width = 280, height = 210, scale = 2 } = {}) => {
        const f = await page_fish(h.page, id);
        if (!f) return null;
        const view = h.page.viewportSize();
        const x = Math.max(0, Math.min(view.width - width, f.x - width / 2));
        const y = Math.max(0, Math.min(view.height - height, f.y - height / 2));
        const r = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x, y, width, height, scale } });
        fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
        return r.data;
    };
    const close = async () => { await h.ctx.close(); await browser.close(); };
    return { ...h, browser, cdp, shot, shotAround, close };
}

/** 页面里找一条按得到的鱼：游着、不透明、在空白背景上（不在托盘、任务条、卡片下面）、离水母和屏幕边都有距离；wantTail 时要求后半身点也按得到。 */
export const pickFor = (page, species, { wantTail = false, wantFront = false } = {}) => page.evaluate(({ species, wantTail, wantFront }) => {
    const aq = window.Aquarium; const w = aq._world(); const bx = window.backgroundExperience;
    const bells = (window.JellyfishSkin && window.JellyfishSkin.bells && window.JellyfishSkin.bells()) || [];
    const ok = (x, y) => {
        if (x < 140 || x > innerWidth - 140 || y < 170 || y > innerHeight - 280) return false;
        if (bells.some(b => Math.hypot(x - b.x, y - b.y) < b.r * 1.9 + 70)) return false;
        const el = document.elementFromPoint(x, y);
        return !!el && bx.isBackgroundTarget(el);
    };
    for (const f of w.fish) {
        if (f.species !== species || f.state !== 'alive' || f.alpha < 0.95) continue;
        const rear = { x: f.x - Math.cos(f.ang) * f.len * 0.3, y: f.y - Math.sin(f.ang) * f.len * 0.3 };
        const front = { x: f.x + Math.cos(f.ang) * f.len * 0.3, y: f.y + Math.sin(f.ang) * f.len * 0.3 };
        if (!ok(f.x, f.y)) continue;
        if (wantTail && !(ok(rear.x, rear.y) && window.AquariumPlayCore.isTailZone(f, rear.x, rear.y))) continue;
        if (wantFront && !(ok(front.x, front.y) && !window.AquariumPlayCore.isTailZone(f, front.x, front.y))) continue;
        return { id: f.id, x: f.x, y: f.y, ang: f.ang, len: f.len, rear, front };
    }
    return null;
}, { species, wantTail, wantFront });

export async function waitPick(page, species, opts, tries = 60) {
    for (let i = 0; i < tries; i++) { const p = await pickFor(page, species, opts); if (p) return p; await sleep(250); }
    return null;
}

export const fishNow = (page, id) => page.evaluate(id => {
    const f = window.Aquarium._world().fish.find(f => f.id === id);
    return f ? { x: f.x, y: f.y, ang: f.ang, vx: f.vx, vy: f.vy, state: f.state, len: f.len } : null;
}, id);

export function mouse(page) {
    let mx = 700, my = 420;
    return {
        pos: () => ({ x: mx, y: my }),
        async to(x, y, ms = 300) {
            const x0 = mx, y0 = my; const n = Math.max(2, Math.round(ms / 16));
            for (let i = 1; i <= n; i++) { const t = i / n; await page.mouse.move(x0 + (x - x0) * t, y0 + (y - y0) * t); await sleep(ms / n); }
            mx = x; my = y;
        },
    };
}

/**
 * 把真实鼠标对准鱼（或它的后半身 rear:true）：鱼一直在游，所以每次读到它现在的位置再移过去，
 * 并在页面里核对“这一点真的会抓到这个种类的鱼、且下面是空白背景”，对不上就再试，最多 8 次。成功返回当时的鱼，否则返回 null。
 */
export async function aim(page, id, { rear = false, front = false } = {}) {
    for (let k = 0; k < 8; k++) {
        const f = await fishNow(page, id);
        if (!f || f.state !== 'alive') return null;
        const k = rear ? -0.3 : front ? 0.3 : 0;
        const x = f.x + Math.cos(f.ang) * f.len * k;
        const y = f.y + Math.sin(f.ang) * f.len * k;
        await page.mouse.move(x, y);
        const ok = await page.evaluate(([x, y, id, rear, front]) => {
            const w = window.Aquarium._world(); const f = w.fish.find(f => f.id === id);
            const hit = window.AquariumCore.hitTest(w, x, y); const el = document.elementFromPoint(x, y);
            const tailZone = !!hit && window.AquariumPlayCore.isTailZone(hit, x, y);
            return !!(f && hit && hit.species === f.species && el && window.backgroundExperience.isBackgroundTarget(el) && (!rear || tailZone) && (!front || !tailZone));
        }, [x, y, id, rear, front]);
        if (ok) return { ...f, px: x, py: y };
        await sleep(40);
    }
    return null;
}
```

写入 `/tmp/aq-play/play-poke.mjs`（完整文件）：

```javascript
// 戳：8 种鱼各点一下（真实鼠标、不拖），记录涟漪、泡、冲刺速度（相对巡航速度）、邻居反应、翻面次数、是否出界，并截 4 张图。
import { launch, mk, sleep, waitPick, mouse, aim } from './play-lib.mjs';

const SPECIES = (process.env.AQ_SPECIES || 'neon,tang,clown,puffer,angel,hammer,manta,whaleshark').split(',');   // AQ_SPECIES 可只测几个种类（大型鱼常被界面挡住，单独换种子补测）
const SEED = Number(process.argv[2] || 5);
const h = await launch({ fish: mk(SPECIES), dpr: 1, seed: SEED, wait: 3000, memos: Number(process.env.AQ_MEMOS ?? 5) });   // AQ_MEMOS=0：没有水母，少一圈“不能按”的区域，大型鱼更容易按到
const { page, shot, errors } = h;
const m = mouse(page);

const startRec = id => page.evaluate(id => {
    const aq = window.Aquarium, Core = window.AquariumCore;
    const rec = window.__rec = { t0: performance.now(), rows: [], stop: false };
    const loop = () => {
        if (rec.stop) return;
        const w = aq._world(); const f = w && w.fish.find(f => f.id === id); const p = aq._play();
        if (f) {
            let others = 0;
            for (const g of w.fish) if (g !== f) others = Math.max(others, Math.hypot(g.vx, g.vy) / Math.max(1, Core.cruiseSpeed(w, g)));
            rec.rows.push({ t: performance.now() - rec.t0, x: f.x, y: f.y, ang: f.ang, ratio: Math.hypot(f.vx, f.vy) / Math.max(1, Core.cruiseSpeed(w, f)), others, ripples: p ? p.ripples.length : 0, bubbles: p ? p.bubbles.length : 0, W: w.width, H: w.height });
        }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}, id);
const stopRec = () => page.evaluate(() => { window.__rec.stop = true; return window.__rec.rows; });

const report = {};
for (const species of SPECIES) {
    let at = null;
    for (let attempt = 0; attempt < 6 && !at; attempt++) {
        const p = await waitPick(page, species);
        if (!p) break;
        await m.to(p.x, p.y, 250);
        at = await aim(page, p.id);
    }
    if (!at) { report[species] = { error: 'no-aim' }; continue; }
    const id = (await page.evaluate(([x, y]) => window.AquariumCore.hitTest(window.Aquarium._world(), x, y).id, [at.px, at.py]));
    await startRec(id);
    await page.mouse.down(); await sleep(40); await page.mouse.up();
    const clip = { x: Math.max(0, at.px - 230), y: Math.max(0, at.py - 170), width: 460, height: 340 };
    const marks = [0, 120, 300, 600]; let last = 0;
    for (const t of marks) { await sleep(t - last); last = t; await shot(`poke-${species}-${t}`, clip); }
    await sleep(1000);
    const rows = await stopRec();
    const flips = rows.reduce((n, r, i) => n + (i && Math.sign(Math.cos(r.ang)) !== Math.sign(Math.cos(rows[i - 1].ang)) ? 1 : 0), 0);
    const first600 = rows.filter(r => r.t < 700);
    report[species] = {
        poked: rows.some(r => r.ripples > 0),
        peakSpeedRatio: +Math.max(...first600.map(r => r.ratio)).toFixed(2),
        neighborPeakRatio: +Math.max(...first600.map(r => r.others)).toFixed(2),
        bubblesPeak: Math.max(...rows.map(r => r.bubbles)),
        flips,
        offscreen: rows.some(r => r.x < -120 || r.x > r.W + 120 || r.y < -120 || r.y > r.H + 120),
    };
    await m.to(700, 420, 200);
    await sleep(700);
}
console.log(JSON.stringify({ seed: SEED, errors, report }, null, 1));
await h.close();
```

写入 `/tmp/aq-play/play-pull.mjs`（完整文件）：

```javascript
// 拉尾：6 种单条/大型鱼各做一次“按在后半身 → 拖 → 松手 → 回弹”，记录拉伸量（相对上限）、松手后的冲刺、回弹的过零次数与收敛时间，并截序列图。
import { launch, mk, sleep, waitPick, mouse, aim } from './play-lib.mjs';

const SPECIES = (process.env.AQ_SPECIES || 'clown,puffer,angel,hammer,manta,whaleshark').split(',');   // AQ_SPECIES 可只测几个种类
const SEED = Number(process.argv[2] || 5);
const h = await launch({ fish: mk(['neon', 'tang', ...SPECIES]), dpr: 1, seed: SEED, wait: 3000, memos: Number(process.env.AQ_MEMOS ?? 5) });   // AQ_MEMOS=0：没有水母，少一圈“不能按”的区域，大型鱼更容易按到
const { page, shotAround, errors } = h;
const m = mouse(page);

const startRec = id => page.evaluate(id => {
    const aq = window.Aquarium, Core = window.AquariumCore;
    const rec = window.__rec = { t0: performance.now(), rows: [], stop: false };
    const loop = () => {
        if (rec.stop) return;
        const w = aq._world(); const f = w && w.fish.find(f => f.id === id); const p = aq._play();
        const pull = p && p.pulls.get(id);
        if (f) rec.rows.push({ t: performance.now() - rec.t0, state: f.state, tail: !!(f.held && f.held.tail), px: pull ? pull.x : 0, py: pull ? pull.y : 0, has: !!pull, ratio: Math.hypot(f.vx, f.vy) / Math.max(1, Core.cruiseSpeed(w, f)), len: f.len, cap: Math.min(0.35 * f.len, 40 * w.scale) });
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
}, id);
const stopRec = () => page.evaluate(() => { window.__rec.stop = true; return window.__rec.rows; });
const mark = (name, at) => page.evaluate(([name, at]) => { window.__rec.marks = window.__rec.marks || {}; window.__rec.marks[name] = performance.now() - window.__rec.t0; }, [name, at]);

/** 过零次数，以及“看得见的回弹”：第一次过零之后，某一段的峰值超过最大拉伸的 10%。 */
function rebounds(series, maxPull) {
    let side = Math.sign(series.find(v => Math.abs(v) > 0.5 * maxPull) || 0);
    let zero = 0; let visible = 0; let peak = 0;
    for (const v of series) {
        const sign = Math.sign(v);
        if (sign && sign !== side) { if (zero > 0 && peak > 0.1 * maxPull) visible++; zero++; side = sign; peak = 0; }
        peak = Math.max(peak, Math.abs(v));
    }
    if (zero > 0 && peak > 0.1 * maxPull) visible++;
    return { zero, visible };
}

const report = {};
for (const species of SPECIES) {
    let at = null; let id = null;
    for (let attempt = 0; attempt < 8 && !at; attempt++) {
        const p = await waitPick(page, species, { wantTail: true });
        if (!p) break;
        await m.to(p.rear.x, p.rear.y, 250);
        at = await aim(page, p.id, { rear: true });
        if (at) id = p.id;
    }
    if (!at) { report[species] = { error: 'no-aim' }; continue; }
    await startRec(id);
    await page.mouse.down(); await sleep(60);
    const grabbed = await page.evaluate(id => { const f = window.Aquarium._world().fish.find(f => f.id === id); return !!(f && f.held && f.held.tail); }, id);
    // 向上偏左拖 200 px，约 0.45 秒，路径不经过网兜（网兜在屏幕下方中间）
    const x0 = at.px, y0 = at.py; const steps = 28;
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 - 150 * i / steps, y0 - 130 * i / steps); await sleep(16); if (i === 14) await shotAround(`pull-${species}-1drag`, id); }
    await mark('release');
    await page.mouse.up();
    for (const [n, t] of [['2release', 0], ['3back120', 120], ['4back320', 200]]) { await sleep(t); await shotAround(`pull-${species}-${n}`, id); }
    await sleep(2500);
    const rows = await stopRec();
    const releaseT = await page.evaluate(() => window.__rec.marks.release);
    const dragging = rows.filter(r => r.t < releaseT);
    const after = rows.filter(r => r.t >= releaseT);
    const maxPull = Math.max(0, ...rows.map(r => Math.hypot(r.px, r.py)));
    const cap = rows[0].cap;
    const series = after.filter(r => r.has).map(r => (Math.abs(r.px) >= Math.abs(r.py) ? r.px : r.py));   // 松手后沿主轴的拉伸量（带符号）
    const { zero, visible } = rebounds(series, maxPull);
    const settled = after.find(r => !r.has);
    report[species] = {
        tailGrab: grabbed,
        maxPullPx: +maxPull.toFixed(1), capPx: +cap.toFixed(1), pullOverCap: +(maxPull / cap).toFixed(2),
        pullDuringDragPx: +Math.max(0, ...dragging.map(r => Math.hypot(r.px, r.py))).toFixed(1),
        dashRatioAfterRelease: +Math.max(0, ...after.filter(r => r.t < releaseT + 300 && r.state === 'alive').map(r => r.ratio)).toFixed(2),
        zeroCrossings: zero,
        visibleRebounds: visible,
        settleMs: settled ? Math.round(settled.t - releaseT) : null,
    };
    await m.to(700, 420, 200);
    await sleep(600);
}
console.log(JSON.stringify({ seed: SEED, errors, report }, null, 1));
await h.close();
```

写入 `/tmp/aq-play/play-feed.mjs`（完整文件）：

```javascript
// 喂食：整缸（12 个条目）里撒两次，记录 14 秒内被吃掉的比例、变亮的鱼数、持续打转（≥1 秒）、成群小鱼的聚散。
import { launch, mk, sleep } from './play-lib.mjs';

const SEED = Number(process.argv[2] || 5);
const FISH = mk(['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark', 'clown', 'angel', 'puffer', 'hammer']);
const h = await launch({ fish: FISH, dpr: 1, seed: SEED, wait: 3000, memos: 5 });
const { page, errors } = h;

await page.evaluate(() => {
    const aq = window.Aquarium; const Core = window.AquariumCore;
    const S = window.__feed = { t0: null, pellets: new Map(), eaten: [], expired: 0, sunk: 0, fedPeak: 0, spin: {}, spread: [], simT: 0 };
    // 打转：与 spin-full 同口径，按模拟时间统计朝向角速度 > 3 rad/s 连续超过 1 秒
    const orig = Core.step; const prev = new Map(); let lastT = null;
    Core.step = function (world, dtMs, input) {
        const r = orig.apply(this, arguments);
        if (S.t0 === null) S.t0 = world.time;
        S.simT = world.time - S.t0;
        const dt = lastT === null ? 0 : world.time - lastT; lastT = world.time;
        if (dt > 0) for (const f of world.fish) {
            if (f.state !== 'alive') { prev.delete(f.id); continue; }
            const a = prev.get(f.id); prev.set(f.id, f.ang); if (a === undefined) continue;
            const s = S.spin[f.species] || (S.spin[f.species] = { run: {}, sustained: 0 });
            if (Math.abs(f.ang - a) / dt > 3) { s.run[f.id] = (s.run[f.id] || 0) + dt; if (s.run[f.id] >= 1) s.sustained += dt; } else s.run[f.id] = 0;
        }
        return r;
    };
    // 饲料去向：每帧看一遍，消失的按“过期 / 沉出画面 / 被吃”分类
    const loop = () => {
        const p = aq._play(); const w = aq._world();
        if (w) {
            if (p) {
                const now = new Map(p.pellets.map(x => [x.id, x]));
                for (const [id, last] of S.pellets) if (!now.has(id)) {
                    S.pellets.delete(id);
                    if (last.t + 0.1 >= last.life) S.expired++; else if (last.y > w.height) S.sunk++; else S.eaten.push(S.simT);
                }
                for (const x of p.pellets) S.pellets.set(x.id, { t: x.t, life: x.life, y: x.y });
                S.fedPeak = Math.max(S.fedPeak, p.fed.size);
            }
            const groups = new Map();
            for (const f of w.fish) { if (!groups.has(f.entry)) groups.set(f.entry, []); groups.get(f.entry).push(f); }
            let sum = 0; let n = 0;
            for (const g of groups.values()) if (g.length >= 4) for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { sum += Math.hypot(g[i].x - g[j].x, g[i].y - g[j].y); n++; }
            if (n) S.spread.push({ t: S.simT, d: sum / n });
        }
        requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
});

await page.click('.aq-toggle'); await sleep(400);
await page.evaluate(() => { window.__feed.feedAt = window.__feed.simT; });
await page.click('.aq-feed'); await sleep(1100);
await page.click('.aq-feed');                                       // 第二次：冷却（0.8 秒）已过
await sleep(1500);
await h.shot('feed-whole-2s5');
await sleep(14000);
await h.shot('feed-whole-16s');

const r = await page.evaluate(() => {
    const S = window.__feed; const feedAt = S.feedAt;
    const eatenBy14 = S.eaten.filter(t => t - feedAt <= 14).length;
    const total = S.eaten.length + S.expired + S.sunk + S.pellets.size;
    const spread = S.spread; const base = spread.filter(s => s.t < feedAt).map(s => s.d);
    const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const during = spread.filter(s => s.t >= feedAt).map(s => s.d);
    const spin = {}; for (const [sp, s] of Object.entries(S.spin)) spin[sp] = +s.sustained.toFixed(2);
    return {
        sprinkled: total, eaten: S.eaten.length, eatenBy14s: eatenBy14, expired: S.expired, sunk: S.sunk, stillFalling: S.pellets.size,
        eatenFraction: +(eatenBy14 / Math.max(1, total)).toFixed(2), fedPeak: S.fedPeak,
        schoolSpreadBaselinePx: +mean(base).toFixed(1), schoolSpreadPeakPx: +Math.max(...during).toFixed(1),
        schoolSpreadLast3sPx: +mean(spread.filter(s => s.t >= S.simT - 3).map(s => s.d)).toFixed(1),
        lastPelletEatenAtS: S.eaten.length ? +(Math.max(...S.eaten) - feedAt).toFixed(1) : null,
        sustainedSpinSecondsBySpecies: spin, simSeconds: +S.simT.toFixed(1),
    };
});
console.log(JSON.stringify({ seed: SEED, errors, ...r }, null, 1));
await h.close();
```

写入 `/tmp/aq-play/play-net.mjs`（完整文件）：

```javascript
// 网兜回归：真实鼠标把一条鱼拖进网兜松手，核对“捞出”仍然成立。分两种按法：按前半身（原来的抓取）和按后半身（拉尾）——
// 拉尾的鱼拖进网兜也必须被捞出，并且静悄悄收起（没有回弹冲刺）。每种按法一条鱼，各自独立页面。
import { launch, mk, sleep, waitPick, mouse, aim } from './play-lib.mjs';

const SEED = Number(process.argv[2] || 5);
const report = {};
for (const mode of ['front', 'rear']) {
    const species = mode === 'front' ? 'hammer' : 'clown';
    const h = await launch({ fish: mk(['neon', 'tang', 'clown', 'hammer', 'angel']), dpr: 1, seed: SEED, wait: 3000, memos: 5 });
    const { page, errors, shot } = h;
    const m = mouse(page);
    let at = null; let id = null;
    for (let attempt = 0; attempt < 8 && !at; attempt++) {
        const p = await waitPick(page, species, mode === 'rear' ? { wantTail: true } : { wantFront: true });
        if (!p) break;
        const aimAt = mode === 'rear' ? p.rear : p.front;
        await m.to(aimAt.x, aimAt.y, 250);
        at = await aim(page, p.id, mode === 'rear' ? { rear: true } : { front: true });
        if (at) id = p.id;
    }
    if (!at) { report[mode] = { error: 'no-aim' }; await h.close(); continue; }
    const before = await page.evaluate(() => window.Aquarium.entries().length);
    await page.mouse.down(); await sleep(60);
    const grabbed = await page.evaluate(id => { const f = window.Aquarium._world().fish.find(f => f.id === id); return f ? { held: f.state === 'held', tail: !!(f.held && f.held.tail) } : null; }, id);
    // 拖到网兜中心（先小幅拖出 6 px 以上让网兜出现，再读它的位置）
    await page.mouse.move(at.px + 12, at.py + 12); await sleep(120);
    const net = await page.evaluate(() => { const r = document.querySelector('.aq-net').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, shown: document.querySelector('.aq-net').classList.contains('aq-net-on') }; });
    const x0 = at.px + 12, y0 = at.py + 12; const steps = 30;
    for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + (net.x - x0) * i / steps, y0 + (net.y - y0) * i / steps); await sleep(16); }
    await sleep(300);
    await shot(`net-${mode}-drag`);
    const nearNet = await page.evaluate(() => document.querySelector('.aq-net').classList.contains('aq-net-near'));
    const speedBefore = await page.evaluate(id => { const f = window.Aquarium._world().fish.find(f => f.id === id); return f ? Math.hypot(f.vx, f.vy) : null; }, id);
    await page.mouse.up();
    await sleep(1800);
    const after = await page.evaluate(([id]) => {
        const w = window.Aquarium._world();
        const stored = JSON.parse(localStorage.getItem('__chrome_storage__') || '{}').aquariumV1;
        return { entries: window.Aquarium.entries().length, stillInWorld: !!w.fish.find(f => f.id === id), stored: stored ? stored.fish.length : null, pulls: window.Aquarium._play() ? window.Aquarium._play().pulls.size : null, grabbing: window.Aquarium.isGrabbing() };
    }, [id]);
    const r = { species, grabbed, netShown: net.shown, nearNet, entriesBefore: before, entriesAfter: after.entries, storedAfter: after.stored, fishGone: !after.stillInWorld, pullsAfter: after.pulls, grabbingAfter: after.grabbing, speedAtRelease: speedBefore === null ? null : +speedBefore.toFixed(0), errors };
    // 通过条件：按前半身是普通抓取（tail:false）、按后半身是拉尾（tail:true）；网兜出现并亮起；松手后条目少一个、存储同步少一个、鱼不在世界里、没有残留的拉尾记录（玩法状态还没建过时 _play() 是 null，也算没有）与抓取、没有页面错误
    r.pass = !!(grabbed && grabbed.held && grabbed.tail === (mode === 'rear') && r.netShown && r.nearNet && r.entriesAfter === r.entriesBefore - 1 && r.storedAfter === r.entriesAfter && r.fishGone && !r.pullsAfter && !r.grabbingAfter && errors.length === 0);
    report[mode] = r;
    await h.close();
}
console.log(JSON.stringify({ seed: SEED, report }, null, 1));
```

写入 `/tmp/aq-play/play-perf.mjs`（完整文件）：

```javascript
// 耗时：同一份页面、同一批鱼，A = 屏蔽玩法脚本（等同改动之前）、B = 玩法空闲、C = 玩法满载（24 粒饲料、24 个泡、3 圈涟漪，每 100 ms 补满）。
// 统计宿主每帧调用 Aquarium.frame 的 JS 耗时（包含玩法的推进与绘制）。
import { chromium, mk, URL, initScript, storageFor } from './common.mjs';

const DPR = Number(process.argv[2] || 2);
const SEED = Number(process.argv[3] || 5);
const SECONDS = Number(process.argv[4] || 10);
const FISH = mk(['neon', 'neon', 'neon', 'neon', 'tang', 'tang', 'tang', 'tang', 'clown', 'puffer', 'angel', 'hammer']);   // 12 个条目，渲染约 40 条
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

async function session(browser, { blockPlay }) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    const args = { storage: storageFor(FISH, { memos: 5 }), seed: SEED, night: false, cursor: false };
    await page.addInitScript(initScript(args), args);
    if (blockPlay) await page.route(/\/js\/aquarium-play(-core)?\.js/, route => route.abort());
    await page.goto(URL, { waitUntil: 'load' });
    await sleep(3000);
    return { ctx, page };
}

const measure = (page, seconds, load) => page.evaluate(({ seconds, load }) => new Promise(resolve => {
    const aq = window.Aquarium; const orig = aq.frame; const times = []; const seen = { pellets: 0, bubbles: 0, ripples: 0, fed: 0 };
    aq.frame = function (...a) { const t = performance.now(); const out = orig.apply(this, a); times.push(performance.now() - t); return out; };
    const refill = () => {
        const play = aq._play(); const w = aq._world(); const P = window.AquariumPlayCore;
        if (!play || !w) return;
        play.lastSprinkle = -Infinity;
        while (play.pellets.length < 24) { const r = P.sprinkle(play, w, { x: Math.random() * w.width, y: w.height * (0.1 + Math.random() * 0.3), count: Math.min(12, 24 - play.pellets.length) }); play.lastSprinkle = -Infinity; if (!r.ok) break; }
        const alive = w.fish.filter(f => f.state === 'alive');
        for (let i = 0; i < 4; i++) { const f = alive[Math.floor(Math.random() * alive.length)]; if (f) P.poke(play, w, f, { x: Math.random() * w.width, y: Math.random() * w.height }); }
        const c = P.counts(play);
        for (const k of Object.keys(seen)) seen[k] = Math.max(seen[k], c[k]);
    };
    const timer = load ? setInterval(refill, 100) : null;
    setTimeout(() => { aq.frame = orig; if (timer) clearInterval(timer); resolve({ times, seen }); }, seconds * 1000);
}), { seconds, load });

const browser = await chromium.launch({ headless: true });
const out = {};
for (const [label, opts, load] of [['A 屏蔽玩法脚本（等同改动之前）', { blockPlay: true }, false], ['B 玩法空闲', { blockPlay: false }, false], ['C 玩法满载', { blockPlay: false }, true]]) {
    const { ctx, page } = await session(browser, opts);
    if (!opts.blockPlay) { await page.click('.aq-toggle'); await page.click('.aq-feed'); await sleep(500); }   // 点一下喂食，让玩法状态建立
    const state = await page.evaluate(() => window.Aquarium.state());
    const { times, seen } = await measure(page, SECONDS, load);
    out[label] = { dpr: DPR, fish: state.fish, frames: times.length, avgMs: +avg(times).toFixed(3), p50Ms: +q(times, .5).toFixed(3), p95Ms: +q(times, .95).toFixed(3), maxMs: +Math.max(...times).toFixed(2), ...(load ? { peakCounts: seen } : {}), playFailed: state.playFailed };
    await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
```

写入 `/tmp/aq-play/play-bright.mjs`（完整文件）：

```javascript
// 亮背景：把鱼层画布的背景改成接近白色（模拟浅色壁纸），撒一把饲料、戳一下，截图并量化“看得见”：
// 饲料周围最大的亮度差（相对背景，0…1）、涟漪环上的平均亮度差。截图放大 3 倍保存，供肉眼核对。
import { launch, mk, sleep, OUT } from './play-lib.mjs';
import fs from 'node:fs';

const BG = [233, 239, 245];
const h = await launch({ fish: mk(['clown', 'angel', 'hammer', 'puffer']), dpr: 1, seed: 5, wait: 3000, memos: 5 });
const { page, errors, cdp } = h;
await page.addStyleTag({ content: `#background-experience-canvas { background: rgb(${BG.join(',')}) !important; } .bgx-root, body { background: rgb(${BG.join(',')}) !important; }` });
await page.click('.aq-toggle'); await page.click('.aq-feed'); await sleep(300);

// 在一块安静的地方放：饲料 (640, 330) 一撮、涟漪 (640, 520)；把所有鱼挪到远处免得遮挡，并冻结它们
const placed = await page.evaluate(() => {
    const aq = window.Aquarium; const w = aq._world(); const play = aq._play(); const P = window.AquariumPlayCore;
    for (const f of w.fish) { f.x = 120; f.y = 780; f.vx = 0; f.vy = 0; }
    play.pellets.length = 0; play.ripples.length = 0; play.bubbles.length = 0; play.lastSprinkle = -Infinity;
    P.sprinkle(play, w, { x: 640, y: 330, count: 6 });
    const f = w.fish[0]; f.x = 640; f.y = 520; f.ang = 0; f.state = 'alive'; f.alpha = 1;
    play.pokedAt.clear();
    P.poke(play, w, f, { x: 640, y: 520 });
    f.x = 900; f.y = 600; f.vx = f.vy = 0;                       // 被戳的鱼挪开；它嘴边的泡留在原处
    return { pellets: play.pellets.map(p => ({ x: p.x, y: p.y })), ripples: play.ripples.length, bubbles: play.bubbles.length };
});
await sleep(120);                                                 // 涟漪扩到中等大小
const snap = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 440, y: 220, width: 400, height: 380, scale: 3 } });
fs.writeFileSync(`${OUT}/bright-play.png`, Buffer.from(snap.data, 'base64'));
const now = await page.evaluate(() => { const play = window.Aquarium._play(); return { pellets: play.pellets.map(p => ({ x: p.x, y: p.y })), ripples: play.ripples.map(r => ({ x: r.x, y: r.y, t: r.t })), bubbles: play.bubbles.length }; });

// 量化：在浏览器里解码截图
const m = await page.evaluate(async ({ b64, now, bg }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const S = 3; const ox = 440, oy = 220;
    const lum = (r, g2, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
    const Lbg = lum(...bg);
    const px = (x, y) => { const d = g.getImageData(Math.round((x - ox) * S), Math.round((y - oy) * S), 1, 1).data; return lum(d[0], d[1], d[2]); };
    const pellets = now.pellets.map(p => { let best = 0; for (let dy = -9; dy <= 9; dy += 0.5) for (let dx = -9; dx <= 9; dx += 0.5) if (dx * dx + dy * dy <= 81) best = Math.max(best, Math.abs(px(p.x + dx, p.y + dy) - Lbg)); return +best.toFixed(2); });
    const ripples = now.ripples.map(r => {
        const RIPPLE_R = 110 * window.Aquarium._world().scale; const radius = RIPPLE_R * Math.min(1, r.t / 0.7);   // 与 aquarium-play.js 的半径公式一致（只用来找环的位置）
        let sum = 0; let n = 0;
        for (let a = 0; a < 360; a += 4) { let best = 0; for (let d = -3; d <= 3; d += 0.5) { const rad = a * Math.PI / 180; best = Math.max(best, Math.abs(px(r.x + Math.cos(rad) * (radius + d), r.y + Math.sin(rad) * (radius + d)) - Lbg)); } sum += best; n++; }
        return { radiusPx: +radius.toFixed(0), meanRingContrast: +(sum / n).toFixed(3) };
    });
    return { bgLuminance: +Lbg.toFixed(2), pelletMaxContrast: pellets, ripples };
}, { b64: snap.data, now, bg: BG });
console.log(JSON.stringify({ errors, placed: { pellets: placed.pellets.length, ripples: placed.ripples, bubbles: placed.bubbles }, now: { pellets: now.pellets.length, ripples: now.ripples.length, bubbles: now.bubbles }, ...m }, null, 1));
await h.close();
```

写入 `/tmp/aq-play/spin-full.mjs`（完整文件）：

```javascript
// 最终代码、真实 Chromium（无头、软件渲染）、8 个条目（全部鱼种）、5 只水母、指针不动：
// 在每次 Core.step 之后按“模拟时间”逐步统计朝向角速度，不受帧率影响。
// 打转 = 朝向角速度 > 3 rad/s 的步数占比；持续打转 = 连续超过 1 秒（模拟时间）都 > 3 rad/s。
import { chromium, mk, openPage } from './common.mjs';

const SECONDS = Number(process.argv[2] || 60);
const SEEDS = (process.argv[3] || '7,29').split(',').map(Number);
const SPECIES = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'];

async function runOne(seed) {
  const browser = await chromium.launch({ headless: true });
  const { ctx, page, errors } = await openPage(browser, { fish: mk(SPECIES), dpr: 1, seed, wait: 3000, memos: 5 });
  await page.evaluate(() => {
    const Core = window.AquariumCore;
    const orig = Core.step;
    const prev = new Map();
    let lastT = null;
    window.__spin = { stats: {}, t0: null, t: 0, steps: 0 };
    Core.step = function (world, dtMs, input) {
      const r = orig.apply(this, arguments);
      const S = window.__spin;
      if (S.t0 === null) S.t0 = world.time;
      S.t = world.time - S.t0;
      const dt = lastT === null ? 0 : world.time - lastT;
      lastT = world.time;
      S.steps++;
      if (dt > 0) {
        for (const f of world.fish) {
          if (f.state !== 'alive') { prev.delete(f.id); continue; }
          const a = prev.get(f.id);
          prev.set(f.id, f.ang);
          if (a === undefined) continue;
          const rate = Math.abs(f.ang - a) / dt;
          const s = S.stats[f.species] || (S.stats[f.species] = { n: 0, spin: 0, run: 0, longestRun: 0, orbitSeconds: 0, fish: {} });
          const fs = s.fish[f.id] || (s.fish[f.id] = { run: 0 });
          s.n++;
          if (rate > 3) { s.spin++; fs.run += dt; if (fs.run > s.longestRun) s.longestRun = fs.run; if (fs.run >= 1) s.orbitSeconds += dt; }
          else fs.run = 0;
        }
      }
      return r;
    };
  });
  const started = Date.now();
  while (Date.now() - started < 150000) {
    const t = await page.evaluate(() => window.__spin.t);
    if (t >= SECONDS) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const out = await page.evaluate(() => {
    const S = window.__spin;
    const res = {};
    for (const [sp, s] of Object.entries(S.stats)) res[sp] = { steps: s.n, spinPct: +(100 * s.spin / s.n).toFixed(2), longestRunS: +s.longestRun.toFixed(2), sustainedS: +s.orbitSeconds.toFixed(2) };
    return { simSeconds: +S.t.toFixed(1), steps: S.steps, res };
  });
  const wall = ((Date.now() - started) / 1000).toFixed(0);
  await ctx.close(); await browser.close();
  return { seed, wallSeconds: Number(wall), errors, ...out };
}

const results = await Promise.all(SEEDS.map(runOne));
console.log(JSON.stringify(results, null, 1));
```

写入 `/tmp/aq-play/grab-trials.mjs`（完整文件）：

```javascript
// 最终代码：真实 Chromium 里反复“移到一条鱼上按下”，统计按中率，并记录没按中时的原因。
// 目的：弄清视频脚本里蓝吊两次“grab failed”是脚本的问题，还是真实的小鱼难抓。
import { chromium, mk, openPage } from './common.mjs';

const SPECIES = ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark'];
const SEED = Number(process.argv[2] || 29);
const TRIALS = Number(process.argv[3] || 6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const { ctx, page, errors } = await openPage(browser, { fish: mk(SPECIES), dpr: 1, seed: SEED, wait: 3000, memos: 5, blockPlay: process.env.AQ_BLOCK_PLAY === '1' });   // AQ_BLOCK_PLAY=1：屏蔽玩法脚本，等同改动之前

let mx = 700, my = 420;
async function moveTo(x, y, ms) {
  const x0 = mx, y0 = my; const n = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { const t = i / n; await page.mouse.move(x0 + (x - x0) * t, y0 + (y - y0) * t); await sleep(ms / n); }
  mx = x; my = y;
}

const pickFor = species => page.evaluate(species => {
  const w = window.Aquarium._world(); const bx = window.backgroundExperience;
  const bells = (window.JellyfishSkin && window.JellyfishSkin.bells && window.JellyfishSkin.bells()) || [];
  const out = [];
  for (const f of w.fish) {
    if (f.species !== species || f.state !== 'alive' || f.alpha < 0.9) continue;
    if (bells.some(b => Math.hypot(f.x - b.x, f.y - b.y) < b.r * 1.9 + 60)) continue;
    if (f.x < 120 || f.x > innerWidth - 120 || f.y < 150 || f.y > innerHeight - 260) continue;
    const el = document.elementFromPoint(f.x, f.y);
    if (!el || !bx.isBackgroundTarget(el)) continue;
    out.push({ id: f.id, x: f.x, y: f.y, len: f.len, z: f.z });
  }
  return out;
}, species);

const results = {};
const ORDER = (process.env.AQ_SPECIES || 'tang,neon,clown,angel,hammer,puffer').split(',');   // AQ_SPECIES 只测其中几种
for (const species of ORDER) {
  results[species] = { tries: 0, pressed: 0, hit: 0, fails: [] };
  for (let k = 0; k < TRIALS; k++) {
    let list = [];
    for (let i = 0; i < 40 && !list.length; i++) { list = await pickFor(species); if (!list.length) await sleep(250); }
    if (!list.length) { results[species].fails.push({ why: 'no-candidate' }); continue; }
    const pick = list[k % list.length];
    results[species].tries++;
    await moveTo(pick.x, pick.y, 500);
    // 与视频脚本相同：追踪位置几次再按
    for (let i = 0; i < 5; i++) {
      const p = await page.evaluate(id => { const f = window.Aquarium._world().fish.find(f => f.id === id); return f ? { x: f.x, y: f.y } : null; }, pick.id);
      if (!p) break; await moveTo(p.x, p.y, 100);
    }
    const before = await page.evaluate(([id, px, py]) => {
      const w = window.Aquarium._world(); const f = w.fish.find(f => f.id === id);
      const hit = window.AquariumCore.hitTest(w, px, py);
      return { fish: f ? { x: f.x, y: f.y, state: f.state, alpha: f.alpha, len: f.len, z: f.z } : null, hitId: hit ? hit.id : null, held: w.fish.filter(g => g.state === 'held').length };
    }, [pick.id, mx, my]);
    const whyAt = () => page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py); const bx = window.backgroundExperience;
        const w = window.Aquarium._world();
        const fishNow = w.fish.map(f => ({ id: f.id, d: Math.hypot(f.x - px, f.y - py) })).sort((a, b) => a.d - b.d)[0];
        return { target: el ? (el.id || el.className || el.tagName).toString().slice(0, 40) : null, isBg: el ? bx.isBackgroundTarget(el) : null, nearest: fishNow, jelly: !!(window.JellyfishSkin && window.JellyfishSkin.isGrabbing && window.JellyfishSkin.isGrabbing()), hitNow: (window.AquariumCore.hitTest(w, px, py) || {}).id || null };
      }, [mx, my]);
    // 指针下是页面 UI（鱼游到了任务条、时钟或按钮后面）时不按：真按下去会点到按钮、打开别的面板，把后面的试验全挡住（实测发生过）。
    // 这种情况照样记一次“ui”，只是不按。
    const pre = await whyAt();
    if (pre.isBg === false) {
      results[species].fails.push({ id: pick.id, len: +pick.len.toFixed(1), z: +pick.z.toFixed(2), before, why: pre, skipped: true });
      await sleep(300);
      continue;
    }
    results[species].pressed++;
    await page.mouse.down(); await sleep(120);
    const grabbing = await page.evaluate(() => window.Aquarium.isGrabbing());
    if (grabbing) results[species].hit++;
    else {
      const why = await whyAt();
      results[species].fails.push({ id: pick.id, len: +pick.len.toFixed(1), z: +pick.z.toFixed(2), before, why });
    }
    // 按中之后拖开一小段再松手，让松手是“拖放”而不是“点一下”：改动之后点一下鱼是“戳”（周围的鱼会被吓开），
    // 不拖开的话，抓得越准、后面的试验里能选的鱼就越少，改动前后的样本数就没法比（实测：7 次对 33 次）。
    if (grabbing) { await moveTo(mx + 30, my, 150); await sleep(150); }
    await page.mouse.up(); await sleep(500);
  }
}
await ctx.close(); await browser.close();
// 汇总：每次没按中都归类，只有“鱼就在指针下面、指针下是空白背景、水母也没抢走，却没抓到”才是抓取缺陷（应为 0）：
//   moved = 按下时鱼已游开（小鱼会躲指针，hitId 为空）；ui = 指针下是页面 UI（这种情况不按）；jelly = 水母先抓走了（水母优先）。
//   pressed = 真的按下去的次数（tries 减去不按的 ui）；hit / pressed 才是按中率的口径。
const summary = {};
let defectsTotal = 0; let hitTotal = 0; let triesTotal = 0; let pressedTotal = 0;
for (const [k, v] of Object.entries(results)) {
  const real = v.fails.filter(f => f.why && f.why !== 'no-candidate');
  const c = { moved: 0, ui: 0, jelly: 0, defect: 0 };
  for (const f of real) {
    if (f.before.hitId == null) c.moved++;
    else if (f.why.isBg === false) c.ui++;
    else if (f.why.jelly) c.jelly++;
    else c.defect++;
  }
  defectsTotal += c.defect; hitTotal += v.hit; triesTotal += v.tries; pressedTotal += v.pressed;
  summary[k] = { tries: v.tries, pressed: v.pressed, hit: v.hit, ...c };
}
console.log(JSON.stringify({ seed: SEED, errors, defectsTotal, hit: hitTotal, pressed: pressedTotal, tries: triesTotal, summary, results }, null, 1));
```

写入 `/tmp/aq-play/judge.mjs`（完整文件）：

```javascript
// 把 out/*.json 里的实测数字对照通过线，逐条打印 PASS / FAIL；有任何 FAIL 时退出码为 1。
// 用法：node judge.mjs [输出目录，默认 /tmp/aq-play/out]
// 通过线都是初值（见规格 §6.5），实测后如果要调，改在这里并把理由写进技术文档。
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || '/tmp/aq-play/out';
const load = name => JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8'));
const rows = [];
let failed = 0;
const check = (group, name, ok, detail) => { rows.push({ group, name, ok: !!ok, detail }); if (!ok) failed++; };
const merge = (...reports) => { const m = {}; for (const r of reports) for (const [k, v] of Object.entries(r)) if (!m[k] || (m[k].error && !v.error)) m[k] = v; return m; };

// 戳：8 个种类各点一下（大型鱼常被界面挡住，用 AQ_MEMOS=0 AQ_SPECIES=manta,whaleshark 补测）
{
    const a = load('poke.json'); const b = load('poke-large.json');
    check('戳', '页面没有报错', !a.errors.length && !b.errors.length, JSON.stringify([...a.errors, ...b.errors]));
    const rep = merge(a.report, b.report);
    for (const sp of ['neon', 'tang', 'clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark']) {
        const r = rep[sp];
        if (!r || r.error) { check('戳', `${sp} 有数据`, false, r ? r.error : '缺失'); continue; }
        check('戳', `${sp}：点了就有涟漪、冲刺峰值 ≤ 2.6 倍巡航速度、冒泡 ≥ 2、翻面 ≤ 2、没出界`,
            r.poked === true && r.peakSpeedRatio <= 2.6 && r.bubblesPeak >= 2 && r.flips <= 2 && r.offscreen === false, JSON.stringify(r));
    }
}
// 拉尾：6 种单条/大型鱼
{
    const a = load('pull.json'); const b = load('pull-large.json');
    check('拉尾', '页面没有报错', !a.errors.length && !b.errors.length, JSON.stringify([...a.errors, ...b.errors]));
    const rep = merge(a.report, b.report);
    for (const sp of ['clown', 'puffer', 'angel', 'hammer', 'manta', 'whaleshark']) {
        const r = rep[sp];
        if (!r || r.error) { check('拉尾', `${sp} 有数据`, false, r ? r.error : '缺失'); continue; }
        check('拉尾', `${sp}：按后半身是拉尾、拉伸不超上限且真的拉了、回弹 ≥ 1 次、松手冲刺 1.5–2.6 倍、1.5 秒内停稳`,
            r.tailGrab === true && r.maxPullPx > 0 && r.pullOverCap <= 1.01 && r.visibleRebounds >= 1 && r.dashRatioAfterRelease >= 1.5 && r.dashRatioAfterRelease <= 2.6 && r.settleMs !== null && r.settleMs <= 1500, JSON.stringify(r));
    }
}
// 喂食：整缸（12 个条目）撒两次
for (const f of ['feed5.json', 'feed29.json']) {
    const r = load(f);
    const spin = Object.values(r.sustainedSpinSecondsBySpecies);
    check('喂食', `${f}：页面没有报错`, !r.errors.length, JSON.stringify(r.errors));
    check('喂食', `${f}：14 秒内至少吃掉一半、最后一粒 ≤ 14 秒被吃、有鱼变亮`, r.eatenFraction >= 0.5 && r.lastPelletEatenAtS !== null && r.lastPelletEatenAtS <= 14 && r.fedPeak >= 1, `eatenFraction ${r.eatenFraction}, last ${r.lastPelletEatenAtS}, fedPeak ${r.fedPeak}`);
    check('喂食', `${f}：持续打转（≥1 秒）为 0`, spin.length > 0 && spin.every(v => v === 0), JSON.stringify(r.sustainedSpinSecondsBySpecies));
    check('喂食', `${f}：成群小鱼最后 3 秒的散开程度回到基线的 0.5–1.5 倍（没挤成一团、也没散开不回来）`, r.schoolSpreadLast3sPx >= 0.5 * r.schoolSpreadBaselinePx && r.schoolSpreadLast3sPx <= 1.5 * r.schoolSpreadBaselinePx, `基线 ${r.schoolSpreadBaselinePx}，峰值 ${r.schoolSpreadPeakPx}，最后 3 秒 ${r.schoolSpreadLast3sPx}`);
}
// 网兜回归
{
    const r = load('net.json').report;
    check('网兜', '按前半身（普通抓取）拖进网兜：捞出，存储同步，没有残留', r.front && r.front.pass === true, JSON.stringify(r.front));
    check('网兜', '按后半身（拉尾）拖进网兜：同样捞出，没有残留的拉尾记录', r.rear && r.rear.pass === true, JSON.stringify(r.rear));
}
// 耗时：40 条鱼、DPR 2
{
    const r = load('perf.json');
    const A = r['A 屏蔽玩法脚本（等同改动之前）']; const B = r['B 玩法空闲']; const C = r['C 玩法满载'];
    check('耗时', '三种场景都没有触发 playFailed', A.playFailed === false && B.playFailed === false && C.playFailed === false, '');
    check('耗时', '满载确实达到上限（24 粒饲料、24 个泡、3 圈涟漪）', C.peakCounts && C.peakCounts.pellets === 24 && C.peakCounts.bubbles === 24 && C.peakCounts.ripples === 3, JSON.stringify(C.peakCounts));
    check('耗时', '玩法空闲的平均耗时 ≤ 屏蔽玩法的 + 0.3 ms', B.avgMs <= A.avgMs + 0.3, `A ${A.avgMs}，B ${B.avgMs}`);
    check('耗时', '玩法满载的平均耗时 ≤ 屏蔽玩法的 + 0.3 ms（规格 §6.5）', C.avgMs <= A.avgMs + 0.3, `A ${A.avgMs}，C ${C.avgMs}，C 的 P95 ${C.p95Ms}`);
}
// 亮背景
{
    const r = load('bright.json');
    check('亮背景', '页面没有报错', !r.errors.length, JSON.stringify(r.errors));
    check('亮背景', '每粒饲料周围的亮度差 ≥ 0.3', r.pelletMaxContrast.length > 0 && r.pelletMaxContrast.every(v => v >= 0.3), JSON.stringify(r.pelletMaxContrast));
    check('亮背景', '涟漪环的平均亮度差 ≥ 0.015（偏淡属已知；还要用眼睛看 bright-play.png）', r.ripples.length > 0 && r.ripples.every(v => v.meanRingContrast >= 0.015), JSON.stringify(r.ripples));
}
// 回归：整缸静置打转（改动之前的最大值 1.47%）
{
    const list = load('spin.json');
    for (const r of list) {
        const worst = Math.max(...Object.values(r.res).map(v => v.spinPct));
        check('回归·打转', `种子 ${r.seed}：没有页面报错、每个种类打转占比 ≤ 2.0%、持续打转为 0`, !r.errors.length && Object.values(r.res).every(v => v.spinPct <= 2.0 && v.sustainedS === 0), `最大 ${worst}%`);
    }
}
// 回归：抓取试验（命中率只作参考，缺陷数必须为 0）
{
    const f = load('grab-final.json'); const b = load('grab-base.json');
    check('回归·抓取', '页面没有报错', !f.errors.length, JSON.stringify(f.errors));
    check('回归·抓取', '改动前后真正按下去的次数都 ≥ 20（样本太少，“缺陷为 0”就没有说服力，重跑）', f.pressed >= 20 && b.pressed >= 20, `最终按下 ${f.pressed} 次，改动之前 ${b.pressed} 次`);
    check('回归·抓取', '“鱼就在指针下面、指针下是空白背景、水母也没抢走，却没抓到”的缺陷数为 0', f.defectsTotal === 0, `最终 ${f.hit}/${f.pressed}（缺陷 ${f.defectsTotal}），改动之前 ${b.hit}/${b.pressed}（缺陷 ${b.defectsTotal}）`);
}

let group = '';
for (const r of rows) {
    if (r.group !== group) { group = r.group; console.log(`\n【${group}】`); }
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : '\n      ' + r.detail}`);
}
console.log(`\n${rows.length - failed}/${rows.length} 通过${failed ? `，${failed} 项未通过` : ''}`);
process.exit(failed ? 1 : 0);
```


- [ ] **Step 5: 跑全部实测**

大约 16 分钟（我这台机器上的实测）。**运行期间不要动鼠标**（脚本用的是浏览器内的合成鼠标，不会碰你的真实鼠标，但机器忙时数字会抖）。`AQ_MEMOS=0` 去掉水母、`AQ_SPECIES` 只测几个种类，用来补测常被界面挡住的大型鱼。

抓取试验（`grab-trials.mjs`）有两处设计要知道：① 指针下是页面 UI（鱼游到了任务条、时钟或按钮后面）时**不按**——真按下去会点到按钮、打开别的面板，把后面的试验全挡住（我第一次跑最终版时就这样只剩 4–7 次有效样本）；② 按中后拖开 30 px 再松手，免得“点一下”变成“戳”、把别的鱼吓跑，使改动前后的样本数没法比。

```bash
cd /tmp/aq-play && mkdir -p out
node play-poke.mjs 5 > out/poke.json
AQ_MEMOS=0 AQ_SPECIES=manta,whaleshark node play-poke.mjs 5 > out/poke-large.json
node play-pull.mjs 5 > out/pull.json
AQ_MEMOS=0 AQ_SPECIES=manta,whaleshark node play-pull.mjs 5 > out/pull-large.json
node play-feed.mjs 5 > out/feed5.json
node play-feed.mjs 29 > out/feed29.json
node play-net.mjs 5 > out/net.json
node play-perf.mjs 2 5 10 > out/perf.json
node play-bright.mjs > out/bright.json
node spin-full.mjs 60 7,29 > out/spin.json
AQ_URL=http://127.0.0.1:8792/index.html node grab-trials.mjs 29 6 > out/grab-base.json
node grab-trials.mjs 29 6 > out/grab-final.json
```

- [ ] **Step 6: 对照通过线**

```bash
cd /tmp/aq-play && node judge.mjs
```

期望：各组都是 PASS，最后一行是 `38/38 通过`（检查项的总数；抓取试验里有一条“改动前后真正按下去的次数都 ≥ 20”，样本不够时重跑 Step 5 的最后两条命令）。通过线与规格 §6.5 的对应关系：戳（逐帧反应、不出界、不翻面闪烁）、拉尾（拉伸 ≤ 35% 体长与绝对上限）、喂食（14 秒吃掉一半、持续打转 0、成群不被吸散）、耗时（满载 ≤ 基线 + 0.3 ms）、回归（抓取试验、整缸打转、网兜）、亮背景。

**我在按计划重放出来的文件树上测到的参考值**（无头 Chromium、软件渲染，仅供你判断数量级；你的数字可以有出入，以通过线为准）：

- 戳（8 个种类）：冲刺峰值 2.18–2.33 倍巡航速度，泡 2–3 个，翻面 0–1 次；
- 拉尾（6 个种类）：松手冲刺 1.85–1.98 倍，停稳 621–678 ms，回弹 1 次，拉伸占上限 0.42–1（大型鱼拉不满）；单独补测的蝠鲼与鲸鲨：冲刺 1.97 / 1.98 倍，停稳 764 / 809 ms；
- 喂食（整缸 12 条）：种子 5：6 秒吃完、最后 3 秒成群散开 43 px（基线 36.8，峰值 86.1）；种子 29：4.9 秒、33.7 px（基线 37.6，峰值 51.7）；持续打转 0；
- 网兜：前半身与后半身都捞出；
- 耗时（40 条鱼、DPR 2）：屏蔽 0.318 / 空闲 0.363 / 满载 0.443 ms（满载 P95 0.5 ms）；
- 亮背景：饲料亮度差 0.48–0.53，涟漪环 0.02；
- 整缸打转：最大 1.31%，持续打转 0；
- 抓取试验：改动之前按中 23/24（缺陷 0），之后 27/30（缺陷 0）。

**如果有 FAIL：** 先看 `judge.mjs` 打印的明细和对应截图，判断是代码缺陷还是通过线本身不合理。代码缺陷：回到对应任务，先写会失败的测试复现，再改。通过线不合理：改 `judge.mjs` 里的那一条，并把理由与新旧值写进 Step 9 的“参数与通过线校准”；**不要**为了过关悄悄放宽。

- [ ] **Step 7: 逐张看截图（人工，不能省）**

`judge.mjs` 看不出“好不好看”，下面这些图要一张张打开看，并在报告里写看到了什么：

- `out/poke-<种类>-{0,120,300,600}.png`（点击处周围，0 / 120 / 300 / 600 ms）：涟漪从点击处扩开、鱼窜开、嘴边有泡；涟漪大小合适（半径约 `RIPPLE_R`），没有遮住鱼；
- `out/pull-<种类>-{1drag,2release,3back120,4back320}.png`（以鱼为中心放大 2 倍）：拖动时尾巴被拉长、**轮廓和鳍没有断开**、没有出现一条细线（画布矩阵没有退化）；松手后尾巴回弹、鱼向前冲；
- `out/feed-whole-2s5.png`、`out/feed-whole-16s.png`：饲料可见（暖色小圆点带深色细边），附近的鱼朝饲料游、吃到的鱼更亮；16 秒时饲料都吃完了，鱼群正常散开；
- `out/net-front-drag.png`、`out/net-rear-drag.png`：拖鱼进网兜时网兜亮起、鱼在里面；
- `out/bright-play.png`（合成的亮色背景，放大 3 倍）：饲料清楚；涟漪偏淡但看得见；气泡几乎看不见（已知，见技术文档 §6.5）。

- [ ] **Step 8: 变异检查**

按附录 A 把脚本写到 `/tmp/aq-mut/`（用工具：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md A`），然后：

```bash
cd ~/worktrees/ctb-aquarium
for f in core play-A play-B play-C draw play-ui wire; do echo "=== $f"; AQ_ROOT=$PWD python3 /tmp/aq-mut/$f.py | tail -2; done
```

脚本只在 `/tmp/aq-mut-work` 里改副本，**不会改仓库文件**；每组开头会打印 `baseline fails: 0`（基线本身全绿，否则脚本会停下）。期望每组最后一行是 `抓到/总数`（括号里列出存活的变异体）：

```text
core   20/20
play-A 37/37
play-B 40/40
play-C 37/39 存活：不判被抓、不判 held 状态
draw   17/17
play-ui56/56
wire   95/99 存活：disablePlay 可重复、endTail 不清标记、endTail 不看 playOn、endTail 不看 play
```

存活的逐个判断是**等价变异体**（改了但行为不可能不同）还是**漏测**，漏测就补测试；全部写进技术文档 §6.4（等价的写明为什么等价）。

**我在重放树上跑出来的结果就是上面这张表**，存活者的判断：存活 6 个，都不是漏测，是读代码判断的（推断，不是证明）：玩法核心拉尾组 2 个（`stepPulls` 里 `holding` 的 `f.state === 'held'` 与 `!!f.held` 两个判断去掉任何一个）——`fish.held` 只在 `Core.grab` 里与 `state = 'held'` 一起设置、在 `Core.release` 与 `Core.dismiss` 里一起清掉（鱼生成时是 `null`），两个判断互相蕴含，所以是等价变异体，保留它们是因为这个函数不拥有这条不变量；控制器接线组 4 个（`disablePlay` 的重入保护、`endTail` 里的 `s.tail = false`、`!playOn()`、`!play`）——都是防御性的冗余检查，在当前调用关系下不可达：`disablePlay` 之后每个调用点都已被 `play === null` 或 `playOn()` 挡住；`endTail(s, …)` 对同一个会话最多调用一次（调用后立刻 `endSession()`，`session` 变 `null`）；`s.tail` 为真且 `playOn()` 时 `play` 一定已由 `beginHold` 那一路建好。要观察到它们必须构造公开接口走不到的状态，所以没有为它们补测试；将来改了调用关系要重新评估。

你的结果应当与此完全一致；多出任何存活者，先判断是漏测还是等价，再往下走。跑完后确认仓库文件没被动过：`diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos` 的输出与 Task 8 的检查点一致（只多了文档类修改，见 Step 10 之后）。

- [ ] **Step 9: 参数与通过线校准（有改动才做）**

如果 Step 5–7 要求改任何 `PARAMS` 值或通过线：先改（或补）测试，再改值，再从 Step 5 重跑；把“参数：旧值 → 新值，原因（对应哪个数字或哪张图）”逐条写进技术文档 §6.3（替换那句“初值未改”）。没有改动就不用动。

- [ ] **Step 10: 更新文档（技术文档 §6、§5.7，`AGENTS.md`，`docs/technical/_index.md`）**

**10a. 技术文档**：在 `docs/technical/aquarium-20261017.md` 末尾追加下面整节（§6.4 里表格的下划线按 Step 5–6 的实测数填写；§6.3 最后一句“初值未改”如果 Step 9 改了参数，就换成逐条的“参数：旧值 → 新值，原因（对应哪个数字或哪张图）”）：

```markdown

## 6. 互动：戳、拉鱼尾、喂食（2026-10-17，第三轮的第一个子项目）

设计规格 `docs/superpowers/specs/2026-10-17-aquarium-interaction-design.md`（含 §11 写计划时的修正），实现计划 `docs/superpowers/plans/2026-10-17-aquarium-interaction.md`。三种互动都是**纯视觉**：不存储、不读写任务数据、不新增设置，水母不受影响，仍是唯一与任务挂钩的；跟随已有的 `aquariumFish` 开关。

### 6.1 做了什么

- **戳**：点一下鱼（按下到松开没拖过 6 px）——这条鱼朝点击处的反方向窜出去（`POKE_DASH` 倍巡航速度，点在正中心 `POKE_CENTER` 个体长以内则沿自己的朝向窜），`SHOCK_R` 范围内的邻鱼被向外推（线性衰减，大型鱼只受 `SHOCK_LARGE` 倍），点击处荡开一圈涟漪，嘴边冒两三个泡；同一条鱼 `POKE_COOLDOWN_S` 秒内不重复。**不吞 `click`**（`drop` 在没拖过时返回 `false`），空白水面的点击与原来一样。
- **拉鱼尾**：按住非成群鱼的**后半身**（鱼本地 `x ≤ 0`，含正中心）拖动——被抓点留在指针下，鱼头朝远离指针运动的方向，尾巴按指针速度被拉长（上限 `min(0.35 体长, 40 px × 视口缩放)`）；松手后尾巴带阻尼回弹一次，鱼朝鱼头方向冲一下并冒泡。拖进网兜捞出时静悄悄收起（没有回弹、冲刺和泡）。霓虹灯鱼、蓝吊（成群小鱼）太小，不做拉尾，按哪里都是普通抓取。按前半身仍是原来的抓取。
- **喂食**：托盘里一个“喂食”按钮——点一下从屏幕上部落下 6 粒，或按住拖到水里松手（落在松手处）、键盘 Enter/空格；饲料下沉、过期（`PELLET_LIFE_S`）、被游着的鱼吃掉（每粒只被吃一次），吃到的鱼冒泡并变亮约 `FED_S = 20` 秒（只是 0…1 的画法数值，不存储）；附近的鱼会朝最近的一粒游过去并加速。同屏最多 24 粒（省流量 8），`FEED_COOLDOWN_S` 内连点被忽略，放不下时状态栏写“饲料还没吃完”。没有鱼时按钮禁用，原因写在居民列表的“还没有鱼”里并由 `aria-describedby` 指向。

### 6.2 结构与边界（复用与自有）

- **没有引入任何第三方库、权限、网络或 CDN。** 弹簧是一个二阶阻尼公式，冲击是速度叠加，吸引点是 `Core.step` 里的一个可选目标；本仓库没有通用物理引擎依赖，这里也不需要碰撞。复用的是仓库已有的东西：`AquariumCore` 的游泳/抓取/命中、`aquarium.js` 的抓取状态机与托盘、宿主 `background-experience.js` 的共享画布与唯一 RAF、`isBackgroundTarget` 的指针路由。
- **自有代码**：`js/aquarium-play-core.js`（纯逻辑：涟漪、气泡、饲料、变亮记录、拉尾弹簧与三种规则，不碰 DOM 与存储）、`js/aquarium-play.js`（涟漪/饲料/气泡的画法 + 托盘喂食按钮）、`js/aquarium-core.js` 的两个钩子（`step` 的 `attractors`、`grab` 的 `tail` 选项）与导出的 `cruiseSpeed`、`js/aquarium.js` 的画法钩子与接线。不传新参数时核心与画法的行为与改动之前逐位一致（黄金轨迹与绘制序列哈希测试守住）。
- **隔离**：玩法层可注入（`env.playCore` / `env.play`），任何玩法调用都包在 `playGuard` 里，抛错只走 `disablePlay`（销毁喂食按钮、丢弃玩法状态、`state().playFailed` 为真），鱼的游动、抓取、捞出、存储不受影响；下次 `start` 再试。宿主 `background-experience.js` 与水母文件没改。
- **状态**：玩法状态（涟漪、气泡、饲料、变亮记录、拉尾弹簧）只在内存里，换 world、停止、出错或鱼全被捞出时丢弃，**不写任何存储键**，也不读写任务、备忘录、设置。

### 6.3 参数（初值，已在真实 Chromium 里按 §6.4 的通过线核对）

全部在 `AquariumPlayCore.PARAMS`（`js/aquarium-play-core.js`）与画法侧的 `FED_GLOW`、`PULL_WEIGHT`（`js/aquarium.js`）；核心侧新增 `HOLD_PV_RATE`。校准：Task 9 的实测没有要求改任何参数，初值未改。

### 6.4 验证（分层）

1. **静态检查**：`node --check` 四个脚本；`git diff --check`；未跟踪的新文件另用 `rg '[ \t]+$'` 查行尾空白。
2. **业务替身（node 测试）**：水族馆七个测试文件 112 项 → 205 项（新增：核心 15、玩法核心 37、画法钩子 5、画法与按钮 14、控制器 18、集成 4）；全量 `node --test`（`/tmp` 副本，挂上 `local-ai/node_modules`）2508 项 → 2601 项，失败 31 项，改动前后失败集合逐项相同（`compute.run` 沙箱相关 30 项 + `test/youtube-home.test.mjs`，与本改动无关，原因未追查）。开发按先写会失败的测试、看它红、再写实现的顺序进行，每个任务的红绿输出对得上计划。
3. **变异检查**（只改 `/tmp` 副本；失败按“基线失败集合之外的新增失败”计，比较前先去掉耗时）：核心钩子 20/20、玩法核心（戳 37/37、喂食 40/40、拉尾 37/39）、画法钩子 17/17、画法与按钮 56/56、控制器接线 95/99。存活 6 个，都不是漏测，是读代码判断的（推断，不是证明）：玩法核心拉尾组 2 个（`stepPulls` 里 `holding` 的 `f.state === 'held'` 与 `!!f.held` 两个判断去掉任何一个）——`fish.held` 只在 `Core.grab` 里与 `state = 'held'` 一起设置、在 `Core.release` 与 `Core.dismiss` 里一起清掉（鱼生成时是 `null`），两个判断互相蕴含，所以是等价变异体，保留它们是因为这个函数不拥有这条不变量；控制器接线组 4 个（`disablePlay` 的重入保护、`endTail` 里的 `s.tail = false`、`!playOn()`、`!play`）——都是防御性的冗余检查，在当前调用关系下不可达：`disablePlay` 之后每个调用点都已被 `play === null` 或 `playOn()` 挡住；`endTail(s, …)` 对同一个会话最多调用一次（调用后立刻 `endSession()`，`session` 变 `null`）；`s.tail` 为真且 `playOn()` 时 `play` 一定已由 `beginHold` 那一路建好。要观察到它们必须构造公开接口走不到的状态，所以没有为它们补测试；将来改了调用关系要重新评估。**脚本缺陷，如实记录**：写原型时有一个“60 秒随机拉尾”测试没有断言“拉尾真的发生过”，会空转、什么都测不到，变异检查发现后已改成带存活断言的版本。
4. **HTTP 预览 + 真实 Chromium（无头、软件渲染）**，对改动之后的代码实测（数字来自 `/tmp/aq-play/out/*.json`，`judge.mjs` 全部通过）：

   | 项目 | 通过线 | 实测 |
   |---|---|---|
   | 戳（8 个种类） | 涟漪出现、冲刺峰值 ≤ 2.6 倍巡航速度、冒泡 ≥ 2、翻面 ≤ 2、不出界 | 峰值 ______ – ______ 倍（`poke*.json` 的 `peakSpeedRatio`） |
   | 拉尾（6 个种类） | 拉伸 ≤ 上限、回弹 ≥ 1 次、冲刺 1.5–2.6 倍、1.5 秒内停稳 | 冲刺 ______ – ______ 倍，停稳 ______ – ______ ms（`pull*.json`） |
   | 喂食（整缸 12 条，种子 5 与 29） | 14 秒内吃掉 ≥ 一半、持续打转 0、成群回到基线 0.5–1.5 倍 | 吃完用时 ______ / ______ 秒，最后 3 秒散开 ______ / ______（基线 ______ / ______）（`feed5.json`、`feed29.json`） |
   | 网兜回归 | 前半身与后半身拖进网兜都捞出、没有残留 | ______（`net.json`） |
   | 耗时（40 条鱼、DPR 2） | 满载 ≤ 屏蔽玩法脚本 + 0.3 ms | 屏蔽 ______ / 空闲 ______ / 满载 ______ ms（`perf.json`） |
   | 亮背景 | 饲料亮度差 ≥ 0.3、涟漪环 ≥ 0.015 且肉眼看得见 | 饲料 ______ – ______，涟漪 ______（`bright.json`） |
   | 回归·打转 | 每个种类 ≤ 2.0%、持续打转 0（改动之前最大 1.47%） | 最大 ______%（`spin.json`） |
   | 回归·抓取 | 改动前后真正按下去 ≥ 20 次，“鱼在指针下却没抓到”的缺陷数 0 | 改动之前按中 ______/按下 ______，之后 ______/______，缺陷 ______（`grab-*.json` 的 `hit`/`pressed`/`defectsTotal`） |

   表里的下划线是**执行者在这一步用本次实测值填写**的位置（数字从括号里的文件取）；填完后不能留下划线。
5. **未验收**：品牌版 Chrome 156 里的真实扩展、真实 GPU 与长期占用、触摸屏（拉尾与拖饲料都用指针事件，没在触屏上试过）、VoiceOver 对喂食按钮与禁用原因的朗读、亮色真实壁纸下涟漪与气泡的观感（只用合成的浅色底验证过）、真实任务数据、真实账号。重载扩展由用户做。

### 6.5 已知限制与后续

- **亮背景**：饲料清楚；涟漪偏淡但看得见；气泡几乎看不见（只有 `screen` 的浅色圈），只是点缀，是否也给它垫一圈深色细边，留到真实壁纸验收时定。
- **大型鱼**（蝠鲼、鲸鲨）在 1440×900 的预览里常被任务条或卡片挡住，真实鼠标不容易按到；验证时用 `AQ_MEMOS=0`（没有水母）和 `AQ_SPECIES` 单独补测。拉尾对小锤头鲨（48–60 px）效果最小，对 100 px 以上的大型鱼最大，但大型鱼的拉伸量受 35% 体长上限约束，鲸鲨实测只拉到上限的约 40%。
- **成群小鱼按中率**随种子波动（小鱼会躲指针），改动之前同样如此，不是回归；抓取试验以“缺陷数为 0”为准。
- 没有声音、不保存互动结果、不联动任务、水母不能被喂食、没有触屏专门适配、没有拉尾的键盘替代（规格 §8）。
- **后续子项目**（各自先澄清、给方案、等批准）：布景（可考虑给鱼垫一层水色底以提升对比度）、来访者、记忆。
```

再替换 §5.7 的第二条（指向 §6）。旧文本：

```text
- **新玩法**（喂食冲击波、拉尾巴、背景布景、稀有访客、图鉴、保存位置——设计文档 §9 的延后项）：按流程先逐个澄清、给方案、等批准，批准前没有写任何功能代码。
```

新文本：

```text
- **新玩法**（设计文档 §9 的延后项）：按流程先逐个澄清、给方案、等批准。第一个子项目“互动”（戳、拉尾巴、喂食）已实现，见 §6；背景布景、稀有访客、图鉴与记忆（保存位置、收藏）各自是后续子项目，批准前没有写任何功能代码。
```

**10b. `AGENTS.md`**（水族馆条目是第 53 行那一整行）：用两处精确替换。第一处，旧文本：

```text
版本钉子：`jellyfish.js?v=6`、`background-experience.js?v=12`、`settings-page.js?v=11`、`aquarium-core.js?v=2`、`aquarium.js?v=2`、`aquarium.css?v=2`。测试 112 项（核心 38、控制器 39、宿主接线 21、外观 14；相关既有 370 项也通过）
```

新文本：

```text
版本钉子：`jellyfish.js?v=6`、`background-experience.js?v=12`、`settings-page.js?v=11`、`aquarium-core.js?v=3`、`aquarium-play-core.js?v=1`、`aquarium-play.js?v=1`、`aquarium.js?v=3`、`aquarium.css?v=3`。水族馆测试 205 项（核心 53、玩法核心 37、画法钩子 5、画法与按钮 14、控制器 57、宿主接线 25、外观 14；第二轮结束时是 112 项；全量 `node --test` 在挂上依赖的 `/tmp` 副本里 2601 项失败 31，与改动之前的失败集合逐项相同）
```

第二处，旧文本：

```text
未验收：品牌版 Chrome 156、真实 GPU 与长期占用、触摸屏、亮色壁纸与多分辨率观感、真实任务数据
```

新文本：

```text
互动（2026-10-17 第三轮第一个子项目，`docs/technical/aquarium-20261017.md` §6）：点鱼戳一下（涟漪、泡、邻鱼受惊，不吞 `click`）、按住非成群鱼的后半身拖动拉鱼尾（拉伸、阻尼回弹、松手冲刺；拖进网兜时静悄悄收起）、托盘“喂食”（点一下撒饲料或拖到水里、键盘可用，吃到的鱼冒泡并变亮约 20 秒），全部是纯视觉：状态只在 `js/aquarium-play-core.js` 的内存里、不写存储、不读写任务数据、不改设置，水母不受影响且仍是唯一与任务挂钩的；`js/aquarium-play.js` 只负责涟漪/饲料/气泡的画法与喂食按钮；`aquarium-core.js` 只多了吸引点与尾端抓取两个钩子和导出的 `cruiseSpeed`（不传新参数时与旧行为逐位一致，黄金轨迹与绘制序列哈希测试守住）；玩法层任何异常只关闭玩法层（`state().playFailed`，鱼的游动、抓取、捞出、存储不受影响），没有新开关、跟随 `aquariumFish`，宿主 `background-experience.js` 与水母文件不改。变异检查（`/tmp` 副本）核心钩子 20/20、玩法核心 114/116、画法钩子 17/17、画法与按钮 56/56、控制器 95/99，存活的逐个说明见技术文档 §6.4。互动未验收：品牌版 Chrome 156、真实 GPU、触摸屏（拉尾与拖饲料没在触屏上试过）、VoiceOver 朗读喂食按钮、亮色真实壁纸下涟漪与气泡的观感。未验收：品牌版 Chrome 156、真实 GPU 与长期占用、触摸屏、亮色壁纸与多分辨率观感、真实任务数据
```

**10c. `docs/technical/_index.md`**（水族馆条目那一行）：两处精确替换。第一处，旧文本：

```text
测试 112 项，第二轮变异检查
```

新文本：

```text
第二轮结束时测试 112 项（第三轮“互动”子项目完成后水族馆测试 205 项），第二轮变异检查
```

第二处，旧文本：

```text
、VoiceOver 朗读未验收 |
```

新文本：

```text
、VoiceOver 朗读未验收；第三轮“互动”子项目（点鱼戳一下、按住后半身拉鱼尾、托盘喂食，纯视觉、不存储、不绑任务、无新开关，玩法层出错只停玩法层；新增 `aquarium-play-core.js` / `aquarium-play.js`，核心只多两个钩子；详见 §6 与 `docs/superpowers/plans/2026-10-17-aquarium-interaction.md`）|
```

替换后确认三件事：① `rg -n '实测值|______|TBD|待定' docs/technical/aquarium-20261017.md AGENTS.md docs/technical/_index.md` 没有输出（表格里的下划线都已填成数字）；② `git diff --check` 仍然通过；③ `rg -n '[ \t]+$' docs/technical/aquarium-20261017.md` 没有输出（这份技术文档没被 git 跟踪，`git diff --check` 管不到它）。

- [ ] **Step 11: 收尾与分层报告**

```bash
kill "$(cat /tmp/aq-8791.pid)" "$(cat /tmp/aq-8792.pid)" 2>/dev/null; rm -f /tmp/aq-8791.pid /tmp/aq-8792.pid
sleep 1; lsof -nP -iTCP:8791 -iTCP:8792 -sTCP:LISTEN || echo "两个预览服务都已关闭"
cd ~/worktrees/ctb-aquarium
diff -rq /tmp/aq-base . -x .git -x node_modules -x output -x videos
```

最后的 `diff -rq` 期望恰好是这些行（相对 Task 1 开头建的快照，全部改动）：

```text
Files /tmp/aq-base/AGENTS.md and ./AGENTS.md differ
Files /tmp/aq-base/css/aquarium.css and ./css/aquarium.css differ
Files /tmp/aq-base/docs/technical/_index.md and ./docs/technical/_index.md differ
Files /tmp/aq-base/docs/technical/aquarium-20261017.md and ./docs/technical/aquarium-20261017.md differ
Files /tmp/aq-base/index.html and ./index.html differ
Files /tmp/aq-base/js/aquarium-core.js and ./js/aquarium-core.js differ
Only in ./js: aquarium-play-core.js
Only in ./js: aquarium-play.js
Files /tmp/aq-base/js/aquarium.js and ./js/aquarium.js differ
Files /tmp/aq-base/settings.html and ./settings.html differ
Files /tmp/aq-base/test/aquarium-core.test.js and ./test/aquarium-core.test.js differ
Only in ./test: aquarium-extras.test.js
Files /tmp/aq-base/test/aquarium-integration.test.js and ./test/aquarium-integration.test.js differ
Only in ./test: aquarium-play-core.test.js
Only in ./test: aquarium-play.test.js
Files /tmp/aq-base/test/aquarium.test.js and ./test/aquarium.test.js differ
```

然后用中文向你（用户）分层报告，**各层分开写，没跑的层不写“通过”**：

1. **静态检查**：Step 1 的结果；
2. **业务替身（node 测试）**：水族馆七个文件 205 项、全量 2601 项失败 31（与改动之前集合相同）；每个任务的红绿都对得上；
3. **变异检查**：每组 抓到/总数，存活者逐个说明；
4. **真实 Chromium（HTTP 预览，无头、软件渲染）**：`judge.mjs` 的结果、Step 7 看过的截图与看到的内容、校准过的参数；
5. **没验证**：品牌版 Chrome 156、真实 GPU 与长期占用、触摸屏、VoiceOver 朗读、真实壁纸叠加观感、真实任务数据、真实账号；重载扩展由你做；
6. 一句话的安全自查（认证与授权：无；外部请求：无；注入与输出编码：只用 `createElement` 与 `textContent`，源码合同测试守住；文件与反序列化：无；秘密与日志：只有一条固定文案的警告，不含用户数据；资源限制：饲料 24、泡 24、涟漪 3，省流量减量）。

**不提交、不合并**，除非你要求；提交点的建议见各任务末尾。

---

## 附录 A：变异检查脚本（写到 `/tmp/aq-mut/`，不进仓库）

思路：把被测文件、它的依赖和测试复制到 `/tmp/aq-mut-work`，逐个把一处文本替换成一个“错误版本”，只跑相关测试；比较失败名前去掉形如 `(0.56ms)` 的耗时，只算“基线失败集合之外的新增失败”；每个变异体的“旧文本”必须在被测文件里恰好出现一次（否则记为存活并提示）。`AQ_ROOT` 指向要被测的仓库（默认当前目录）。

写入 `/tmp/aq-mut/lib.py`（完整文件）：

```python
import os, pathlib, re, shutil, subprocess

# 变异只发生在 /tmp 里的副本：被测文件、依赖和测试先复制过去，再逐个替换一处文本跑测试。
# 仓库里的文件从不被改写。
ROOT = pathlib.Path(os.environ.get('AQ_ROOT') or pathlib.Path.cwd()).resolve()
WORK = pathlib.Path('/tmp/aq-mut-work')


def strip(t):
    return set(re.sub(r'\s*\([\d.]+ms\)\s*$', '', l) for l in t.splitlines() if l.startswith('✖') and 'failing tests' not in l)


def run_mutations(target, tests, muts, deps=()):
    """target: 被变异的文件（相对 ROOT）；tests: 要跑的测试文件；deps: 一并复制的其他文件；
    muts: {名: (旧, 新)}（旧必须恰好出现一次，否则记为存活并提示）"""
    assert not str(WORK).startswith(str(ROOT)), '工作目录不能在被测仓库里面'
    shutil.rmtree(WORK, ignore_errors=True)
    for f in list(deps) + list(tests) + [target]:
        dst = WORK / f
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / f, dst)
    src = (ROOT / target).read_text()
    cmd = ['node', '--test'] + list(tests)
    base = subprocess.run(cmd, cwd=WORK, capture_output=True, text=True)
    base_fail = strip(base.stdout)
    print('baseline fails:', len(base_fail))
    if base.returncode != 0:
        print(base.stdout[-1500:], base.stderr[-1500:])
        raise SystemExit('基线本身不是全绿：先修依赖或测试，再做变异检查（否则全部“被抓到”都是假的）')
    caught = 0
    alive = []
    for name, (old, new) in muts.items():
        if src.count(old) != 1:
            print('SKIP', name, '出现', src.count(old), '次')
            alive.append(name + '(skip)')
            continue
        (WORK / target).write_text(src.replace(old, new))
        r = subprocess.run(cmd, cwd=WORK, capture_output=True, text=True)
        failed = strip(r.stdout) - base_fail
        crashed = r.returncode != 0 and not failed
        if failed or crashed:
            caught += 1
            print('CAUGHT', name, '|', (sorted(failed)[0][:70] if failed else '运行失败'))
        else:
            alive.append(name)
            print('ALIVE ', name)
    (WORK / target).write_text(src)
    print(f'{caught}/{len(muts)}', ('存活：' + '、'.join(alive)) if alive else '')
    return alive
```

写入 `/tmp/aq-mut/core.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations

muts = {
 'weight 不夹': ("weight: clamp(a.weight, 0, 3)", "weight: a.weight"),
 'boost 上限不夹': ("boost: clamp(a.boost, 0.5, 2.5)", "boost: a.boost"),
 'boost 下限不夹': ("boost: clamp(a.boost, 0.5, 2.5)", "boost: Math.min(a.boost, 2.5)"),
 'weight 下限不夹': ("weight: clamp(a.weight, 0, 3)", "weight: Math.min(a.weight, 3)"),
 'boost 恒为 1': ("boost = best.boost;", "boost = 1;"),
 '吸引不朝向': ("sx += (best.x - f.x) / bestD * best.weight;", "sx -= (best.x - f.x) / bestD * best.weight;"),
 'reach 不判': ("if (d < a.reach && d < bestD)", "if (d < bestD)"),
 '最近不取': ("if (d < a.reach && d < bestD) { best = a; bestD = d; }", "if (d < a.reach) { best = a; bestD = d; }"),
 'cruiseSpeed 不乘 z': ("PARAMS.Z_SPEED * f.z) : 0;", "PARAMS.Z_SPEED) : 0;"),
 'step 不传 attractors': ("byEntry.get(f.entry), pointer, bells, attractors);", "byEntry.get(f.entry), pointer, bells, NO_ATTRACTORS);"),
 'tail 总为真': ("tail: false };", "tail: true };"),
 'tail 选项不认': ("if (options && options.tail) {", "if (false) {"),
 '拉尾目标忽略几何': ("tx = pointer.x - (h.gx * c - h.gy * s);", "tx = pointer.x + h.ox;"),
 '拉尾目标 y 忽略几何': ("ty = pointer.y - (h.gx * s + h.gy * c);", "ty = pointer.y + h.oy;"),
 '鱼头不反向': ("const fx = h.tail ? -h.pvx : vx;", "const fx = h.tail ? h.pvx : vx;"),
 '鱼头 y 不反向': ("const fy = h.tail ? -h.pvy : vy;", "const fy = h.tail ? h.pvy : vy;"),
 '鱼头不跟指针速度': ("const fx = h.tail ? -h.pvx : vx;", "const fx = vx;"),
 '指针消失不重取基准': ("f.held.lastX = NaN;", "void 0;"),
 '指针速度不更新': ("h.pvx += ((pointer.x - h.lastX) / dt - h.pvx) * k;", "void 0;"),
 'gx 不用 HOLD_OFFSET': ("gx: (dx * c + dy * s) * PARAMS.HOLD_OFFSET,", "gx: (dx * c + dy * s) * 0,"),
}
run_mutations('js/aquarium-core.js', ['test/aquarium-core.test.js'], muts)
```

写入 `/tmp/aq-mut/play-A.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
muts = {
 '冷却不判': ("if (last !== undefined && play.time - last < PARAMS.POKE_COOLDOWN_S)", "if (false)"),
 '冷却不记': ("play.pokedAt.set(fish.id, play.time);", "void 0;"),
 '冷却判反': ("play.time - last < PARAMS.POKE_COOLDOWN_S", "play.time - last > PARAMS.POKE_COOLDOWN_S"),
 '不检查 world': ("|| !world.fish.includes(fish)) return { ok: false, reason: 'invalid' };", ") return { ok: false, reason: 'invalid' };"),
 '不检查 at': ("!at || !finite(at.x, at.y, fish.x, fish.y, fish.ang)", "!at"),
 '状态不判': ("if (!poking(fish)) return { ok: false, reason: 'state' };", ""),
 '允许 held': ("return fish.state === 'alive' || fish.state === 'entering';", "return fish.state !== 'leaving';"),
 '窜向点击处': ("{ x: dx / d, y: dy / d } : { x: Math.cos", "{ x: -dx / d, y: -dy / d } : { x: Math.cos"),
 '中心判据反': ("d >= PARAMS.POKE_CENTER * fish.len ? {", "d < PARAMS.POKE_CENTER * fish.len ? {"),
 '速度倍数': ("* PARAMS.POKE_DASH;", "* 1;"),
 '泡数': ("PARAMS.POKE_BUBBLES + Math.floor(world.random() * 2)", "PARAMS.POKE_BUBBLES + 3"),
 '泡不在嘴边': ("Math.cos(fish.ang) * fish.len * 0.45, y: fish.y + Math.sin(fish.ang) * fish.len * 0.45", "0, y: fish.y"),
 '冲击不分大小': ("(spec && spec.kind === 'large' ? PARAMS.SHOCK_LARGE : 1)", "1"),
 '冲击不衰减': ("(1 - od / reach) *", "1 *"),
 '冲击范围不加体长': ("const reach = PARAMS.SHOCK_R * world.scale + other.len;", "const reach = PARAMS.SHOCK_R * world.scale;"),
 '冲击范围不乘缩放': ("const reach = PARAMS.SHOCK_R * world.scale + other.len;", "const reach = PARAMS.SHOCK_R + other.len;"),
 '冲击推向中心': ("other.vx += dir.x * strength;", "other.vx -= dir.x * strength;"),
 '冲击含离开中': ("if (other === fish || !poking(other)) continue;", "if (other === fish) continue;"),
 '冲击含自己': ("if (other === fish || !poking(other)) continue;", "if (!poking(other)) continue;"),
 '冲击不累计': ("pushed++;", "void 0;"),
 '压心无方向': ("const dir = od > 1e-6 ? { x: ox / od, y: oy / od } : { x: Math.cos(other.ang), y: Math.sin(other.ang) };", "const dir = { x: ox / od, y: oy / od };"),
 '涟漪不记': ("addRipple(play, world, at.x, at.y);", "void 0;"),
 '涟漪上限': ("if (play.ripples.length > cap) play.ripples.splice(0, play.ripples.length - cap);", "void 0;"),
 '涟漪省流量': ("world.lowPower ? PARAMS.MAX_RIPPLES_LOW : PARAMS.MAX_RIPPLES;\n        if (play.ripples", "PARAMS.MAX_RIPPLES;\n        if (play.ripples"),
 '泡上限': ("if (play.bubbles.length > cap) play.bubbles.splice(0, play.bubbles.length - cap);", "void 0;"),
 '泡省流量': ("const cap = world.lowPower ? PARAMS.MAX_BUBBLES_LOW : PARAMS.MAX_BUBBLES;", "const cap = PARAMS.MAX_BUBBLES;"),
 '泡不上浮': ("b.y -= b.vy * dt;", "void 0;"),
 '泡不摆': ("b.x += Math.sin(b.t * 5 + b.ph) * 10 * k * dt;", "void 0;"),
 '泡不过期': ("return b.t < b.life && b.y > -20;", "return b.y > -20;"),
 '泡出界不丢': ("return b.t < b.life && b.y > -20;", "return b.t < b.life;"),
 '涟漪不过期': ("play.ripples = play.ripples.filter(r => (r.t += dt) < PARAMS.RIPPLE_S);", "play.ripples.forEach(r => { r.t += dt; });"),
 'dt 不夹': ("const dt = Math.min(seconds, Core.PARAMS.MAX_DT);", "const dt = seconds;"),
 'dt 不判': ("if (!Number.isFinite(seconds) || seconds < Core.PARAMS.MIN_DT) return;", "if (!Number.isFinite(seconds)) return;"),
 '冷却记录不清': ("for (const [id, t] of play.pokedAt) if (play.time - t >= PARAMS.POKE_COOLDOWN_S) play.pokedAt.delete(id);", "void 0;"),
 'resize 不缩': ("item.x *= ratioX; item.y *= ratioY;", "void 0;"),
 'resize x y 互换': ("item.x *= ratioX; item.y *= ratioY;", "item.x *= ratioY; item.y *= ratioX;"),
 'resize 坏比例': ("if (!finite(ratioX, ratioY) || ratioX <= 0 || ratioY <= 0) return;", ""),
}
run_mutations('js/aquarium-play-core.js', ['test/aquarium-play-core.test.js'], muts, deps=['js/aquarium-core.js'])
```

写入 `/tmp/aq-mut/play-B.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
muts = {
 'invalid 不判 xy': ("if (given && !finite(o.x, o.y)) return { ok: false, reason: 'invalid' };", ""),
 '粒数不判整数': ("!Number.isInteger(count) || count < 1 || count > PARAMS.SPRINKLE_MAX", "count < 1 || count > PARAMS.SPRINKLE_MAX"),
 '粒数下限': ("count < 1 || count > PARAMS.SPRINKLE_MAX", "count > PARAMS.SPRINKLE_MAX"),
 '粒数上限': ("count < 1 || count > PARAMS.SPRINKLE_MAX", "count < 1"),
 '冷却不判': ("if (play.time - play.lastSprinkle < PARAMS.FEED_COOLDOWN_S) return { ok: false, reason: 'cooldown' };", ""),
 '冷却不记': ("play.lastSprinkle = play.time;", "void 0;"),
 '满了不判': ("if (room <= 0) return { ok: false, reason: 'busy' };", ""),
 '不裁剪粒数': ("const n = Math.min(count, room);", "const n = count;"),
 '省流量上限': ("world.lowPower ? PARAMS.MAX_PELLETS_LOW : PARAMS.MAX_PELLETS", "PARAMS.MAX_PELLETS"),
 '散开不乘缩放': ("* PARAMS.DROP_SPREAD * k, 0, world.width)", "* PARAMS.DROP_SPREAD, 0, world.width)"),
 'x 不夹': ("? clamp(o.x + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.width)", "? o.x + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k"),
 'y 不夹': ("? clamp(o.y + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k, 0, world.height)", "? o.y + (world.random() * 2 - 1) * PARAMS.DROP_SPREAD * k"),
 '顶部横向范围': ("PARAMS.SPRINKLE_X0 + (PARAMS.SPRINKLE_X1 - PARAMS.SPRINKLE_X0) * world.random()", "world.random()"),
 '顶部高度': ("world.height * PARAMS.SPRINKLE_Y + (world.random() - 0.5) * 10 * k", "world.height * 0.5"),
 'id 不递增': ("id: play.nextId++", "id: 1"),
 '下沉不乘缩放': ("sink: PARAMS.PELLET_SINK * k * (0.85 + 0.3 * world.random())", "sink: PARAMS.PELLET_SINK * (0.85 + 0.3 * world.random())"),
 '吸引范围不乘缩放': ("const reach = PARAMS.ATTRACT_REACH * world.scale;", "const reach = PARAMS.ATTRACT_REACH;"),
 '吸引权重': ("weight: PARAMS.ATTRACT_W, boost", "weight: 1, boost"),
 '吸引倍数': ("boost: PARAMS.ATTRACT_BOOST }", "boost: 1 }"),
 '吃：状态': ("if (f.state !== 'alive') continue;", "if (f.state === 'leaving') continue;"),
 '吃：半径': ("d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d < bestD", "d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD + 20 && d < bestD"),
 '吃：半径不含 pad': ("d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d < bestD", "d < PARAMS.EAT_R_LEN * f.len && d < bestD"),
 '吃：不取最近': ("&& d < bestD) { best = f; bestD = d; }", ") { best = f; bestD = d; }"),
 '吃：并列取后': ("d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d < bestD", "d < PARAMS.EAT_R_LEN * f.len + PARAMS.EAT_R_PAD && d <= bestD"),
 '吃：不删这粒': ("                continue;\n            }\n            kept.push(p);", "            }\n            kept.push(p);"),
 '吃：不变亮': ("play.fed.set(eater.id, play.time + PARAMS.FED_S);", "void 0;"),
 '吃：变亮时长': ("play.time + PARAMS.FED_S", "play.time + 1"),
 '吃：不冒泡': ("addBubbles(play, world, mouth.x, mouth.y, PARAMS.EAT_BUBBLES);", "void 0;"),
 '饲料不下沉': ("p.y += p.sink * dt;", "void 0;"),
 '饲料不摆': ("p.x += Math.sin(p.t * 1.7 + p.ph) * 9 * world.scale * dt;", "void 0;"),
 '饲料不过期': ("if (p.t >= p.life || p.y > world.height + 20) continue;", "if (p.y > world.height + 20) continue;"),
 '饲料出界不丢': ("if (p.t >= p.life || p.y > world.height + 20) continue;", "if (p.t >= p.life) continue;"),
 '变亮记录不清': ("for (const [id, until] of play.fed) if (until <= play.time) play.fed.delete(id);", "void 0;"),
 '变亮不渐入': ("Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S)", "remain / PARAMS.FED_OUT_S"),
 '变亮不渐出': ("Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S)", "(PARAMS.FED_S - remain) / PARAMS.FED_IN_S"),
 '变亮不夹': ("fed = clamp(Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S), 0, 1);", "fed = Math.min((PARAMS.FED_S - remain) / PARAMS.FED_IN_S, remain / PARAMS.FED_OUT_S);"),
 '没有状态也分配': ("if (!p && until === undefined) return NO_EXTRAS;", ""),
 'attractors 空也分配': ("if (!play.pellets.length) return NO_ATTRACTORS;", ""),
 'step 不调饲料': ("        stepPellets(play, world, dt);\n", ""),
 'step 先吃后沉': ("            p.t += dt;\n            p.y += p.sink * dt;", "            p.y += p.sink * dt;"),
}
run_mutations('js/aquarium-play-core.js', ['test/aquarium-play-core.test.js'], muts, deps=['js/aquarium-core.js'])
```

写入 `/tmp/aq-mut/play-C.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
muts = {
 '尾区判据反': ("<= PARAMS.TAIL_ZONE * fish.len;", ">= PARAMS.TAIL_ZONE * fish.len;"),
 '尾区不随朝向': ("(x - fish.x) * Math.cos(fish.ang) + (y - fish.y) * Math.sin(fish.ang) <=", "(x - fish.x) * 1 + 0 <="),
 '尾区含小鱼': ("if (!spec || spec.kind === 'school') return false;", "if (!spec) return false;"),
 '尾区未知种类': ("if (!spec || spec.kind === 'school') return false;", "if (spec && spec.kind === 'school') return false;"),
 '尾区不判有限': ("if (!fish || !finite(x, y, fish.x, fish.y, fish.ang, fish.len)) return false;", "if (!fish) return false;"),
 'begin 不判 tail': ("fish.state !== 'held' || !fish.held || !fish.held.tail", "fish.state !== 'held' || !fish.held"),
 'begin 不判 world': ("!fish || !world.fish.includes(fish) || fish.state !== 'held'", "!fish || fish.state !== 'held'"),
 'begin 不建记录': ("play.pulls.set(fish.id, { x: 0, y: 0, vx: 0, vy: 0 });", "void 0;"),
 'end 无记录也成': ("if (!pull) return { ok: false, reason: 'state' };", "if (!pull) return { ok: true };"),
 'end quiet 不清': ("if (opts && opts.quiet) { play.pulls.delete(fish.id); return { ok: true }; }", "if (opts && opts.quiet) { return { ok: true }; }"),
 'end 不冲刺': ("fish.vx = Math.cos(fish.ang) * dash;", "void 0;"),
 'end 冲刺反向': ("fish.vx = Math.cos(fish.ang) * dash;\n            fish.vy = Math.sin(fish.ang) * dash;", "fish.vx = -Math.cos(fish.ang) * dash;\n            fish.vy = -Math.sin(fish.ang) * dash;"),
 'end 倍数': ("Core.cruiseSpeed(world, fish) * PARAMS.RELEASE_DASH;", "Core.cruiseSpeed(world, fish);"),
 'end 不冒泡': ("addBubbles(play, world, mouth.x, mouth.y, PARAMS.RELEASE_BUBBLES);", "void 0;"),
 'end 非 alive 也冲': ("if (fish.state === 'alive') {\n            const dash", "if (true) {\n            const dash"),
 '弹簧不清离开': ("if (!f || f.state === 'leaving') { play.pulls.delete(id); continue; }", "if (!f) { play.pulls.delete(id); continue; }"),
 '弹簧不清缺失': ("if (!f || f.state === 'leaving') { play.pulls.delete(id); continue; }", "if (f && f.state === 'leaving') { play.pulls.delete(id); continue; }\n            if (!f) continue;"),
 '上限不夹': ("const m = Math.hypot(p.x, p.y);                                    // 弹簧过冲也不超过上限\n            if (m > cap) { p.x *= cap / m; p.y *= cap / m; }", ""),
 '上限无体长': ("const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS * world.scale);", "const cap = PARAMS.PULL_ABS * world.scale;"),
 '上限无绝对': ("const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS * world.scale);", "const cap = PARAMS.PULL_MAX * f.len;"),
 '绝对不乘缩放': ("const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS * world.scale);", "const cap = Math.min(PARAMS.PULL_MAX * f.len, PARAMS.PULL_ABS);"),
 '增益': ("const mag = Math.min(speed * PARAMS.PULL_GAIN, cap);", "const mag = Math.min(speed * 0.5, cap);"),
 '目标 x 折算': ("tx = (ux * c + uy * s) * mag;", "tx = ux * mag;"),
 '目标 y 折算': ("ty = (-ux * s + uy * c) * mag;", "ty = uy * mag;"),
 '目标 y 符号': ("ty = (-ux * s + uy * c) * mag;", "ty = (ux * s + uy * c) * mag;"),
 '慢速门槛': ("if (speed > 1) {", "if (speed > 1e9) {"),
 '阻尼': ("const damp = 2 * PARAMS.PULL_ZETA * omega;", "const damp = 20 * PARAMS.PULL_ZETA * omega;"),
 '无阻尼': ("const damp = 2 * PARAMS.PULL_ZETA * omega;", "const damp = 0;"),
 '弹簧 y 不积': ("p.y += p.vy * h;", "void 0;"),
 '停稳不删': ("if (!holding && Math.abs(p.x) < 0.05", "if (false && Math.abs(p.x) < 0.05"),
 '停稳过早': ("Math.abs(p.x) < 0.05 && Math.abs(p.y) < 0.05 && Math.abs(p.vx) < 0.5 && Math.abs(p.vy) < 0.5", "Math.abs(p.x) < 50 && Math.abs(p.y) < 50 && Math.abs(p.vx) < 500 && Math.abs(p.vy) < 500"),
 '被拉着也删': ("if (!holding && Math.abs(p.x) < 0.05", "if (Math.abs(p.x) < 0.05"),
 '不判被抓': ("const holding = f.state === 'held' && !!f.held && !!f.held.tail;", "const holding = !!f.held && !!f.held.tail;"),
 '不判 tail 标记': ("const holding = f.state === 'held' && !!f.held && !!f.held.tail;", "const holding = f.state === 'held' && !!f.held;"),
 '不判 held 状态': ("const holding = f.state === 'held' && !!f.held && !!f.held.tail;", "const holding = f.state === 'held' && !!f.held.tail;"),
 'holding 恒真': ("const holding = f.state === 'held' && !!f.held && !!f.held.tail;", "const holding = true;"),
 'step 不调弹簧': ("        stepPulls(play, world, dt);\n", ""),
 'extras 不带 pull': ("return { pull: p ? { x: p.x, y: p.y } : null, fed };", "return { pull: null, fed };"),
 'extras 带引用': ("return { pull: p ? { x: p.x, y: p.y } : null, fed };", "return { pull: p || null, fed };"),
}
run_mutations('js/aquarium-play-core.js', ['test/aquarium-play-core.test.js'], muts, deps=['js/aquarium-core.js'])
```

写入 `/tmp/aq-mut/draw.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
muts = {
 'FED_GLOW 为 0': ("const FED_GLOW = 0.25;", "const FED_GLOW = 0;"),
 'fed 不夹': ("const fed = extras && Number.isFinite(extras.fed) ? clamp(extras.fed, 0, 1) : 0;", "const fed = extras && Number.isFinite(extras.fed) ? extras.fed : 0;"),
 'fed 不判有限': ("const fed = extras && Number.isFinite(extras.fed) ? clamp(extras.fed, 0, 1) : 0;", "const fed = extras ? clamp(extras.fed, 0, 1) : 0;"),
 'fed 不进 A': ("(1 + 0.3 * view.night + FED_GLOW * fed)", "(1 + 0.3 * view.night)"),
 'fed 不进光晕': ("const glow = clamp(view.night + fed * 0.9, 0, 1);", "const glow = view.night;"),
 '光晕省流量也画': ("if (glow > 0.05 && !view.lowPower) {", "if (glow > 0.05) {"),
 '光晕强度不用 glow': ("g.addColorStop(0, rgba(main, 0.2 * glow * A));", "g.addColorStop(0, rgba(main, 0.2 * view.night * A));"),
 '光晕阈值': ("if (glow > 0.05 && !view.lowPower) {", "if (glow > 0.5 && !view.lowPower) {"),
 'pull 不传 spineOf': ("const spine = spineOf(fish, shape, len, extras && extras.pull);", "const spine = spineOf(fish, shape, len);"),
 'pull x 不叠': ("x: len * (0.5 - u) + (pulled ? pull.x * PULL_WEIGHT[i] : 0),", "x: len * (0.5 - u),"),
 'pull y 不叠': ("+ bend * Math.pow(u, 1.5) + (pulled ? pull.y * PULL_WEIGHT[i] : 0),", "+ bend * Math.pow(u, 1.5),"),
 'pull 权重头也动': ("const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);", "const PULL_WEIGHT = Object.freeze([1, 0, 0.12, 0.5, 1]);"),
 'pull 权重尾不满': ("const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);", "const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 0.5]);"),
 'pull 权重中间': ("const PULL_WEIGHT = Object.freeze([0, 0, 0.12, 0.5, 1]);", "const PULL_WEIGHT = Object.freeze([0, 0, 0.5, 0.12, 1]);"),
 'pull 不判有限': ("const pulled = !!pull && Number.isFinite(pull.x) && Number.isFinite(pull.y);", "const pulled = !!pull;"),
 'pull 只判 x': ("const pulled = !!pull && Number.isFinite(pull.x) && Number.isFinite(pull.y);", "const pulled = !!pull && Number.isFinite(pull.x);"),
 'spineOf 未导出': ("smoothAt, spineOf });", "smoothAt });"),
}
run_mutations('js/aquarium.js', ['test/aquarium-extras.test.js'], muts, deps=['js/aquarium-core.js', 'js/aquarium-play-core.js', 'js/aquarium-play.js'])
```

写入 `/tmp/aq-mut/play-ui.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
T = 'js/aquarium-play.js'
tests = ['test/aquarium-play.test.js']
deps = ['js/aquarium-play-core.js', 'js/aquarium-core.js']
muts = {
 '涟漪进度不夹到 1': ("const u = clamp(r.t / P.RIPPLE_S, 0, 1);", "const u = r.t / P.RIPPLE_S;"),
 '涟漪缓出改线性': ("P.RIPPLE_R * k * (1 - (1 - u) * (1 - u))", "P.RIPPLE_R * k * u"),
 '涟漪淡出指数': ("Math.pow(1 - u, 1.5)", "Math.pow(1 - u, 0.2)"),
 '涟漪不垫深色': ("ctx.strokeStyle = rgba(20, 50, 80, 0.2 * fade);", "ctx.strokeStyle = rgba(20, 50, 80, 0);"),
 '涟漪垫底用 screen': ("ctx.globalCompositeOperation = 'source-over';              // 深色细圈垫底", "ctx.globalCompositeOperation = 'screen';              // 深色细圈垫底"),
 '涟漪线宽不随进度': ("const width = (2.4 * (1 - u) + 0.6) * k;", "const width = 3 * k;"),
 '涟漪省流量仍画内圈': ("if (!(view && view.lowPower)) {\n                ctx.strokeStyle = rgba(170, 225, 255, 0.32 * fade);", "if (true) {\n                ctx.strokeStyle = rgba(170, 225, 255, 0.32 * fade);"),
 '涟漪缺 save': ("        if (!play.ripples.length) return;\n        const k = view && Number.isFinite(view.scale) ? view.scale : 1;\n        ctx.save();", "        if (!play.ripples.length) return;\n        const k = view && Number.isFinite(view.scale) ? view.scale : 1;"),
 '涟漪缺 restore': ("            }\n        }\n        ctx.restore();\n    }\n\n    /** 画在鱼前面的", "            }\n        }\n    }\n\n    /** 画在鱼前面的"),
 '涟漪不过滤坏数据': ("if (!ok(r.x, r.y, r.t)) continue;", ""),
 '涟漪不用 view 的缩放': ("const k = view && Number.isFinite(view.scale) ? view.scale : 1;\n        ctx.save();\n        for (const r of play.ripples)", "const k = 1;\n        ctx.save();\n        for (const r of play.ripples)"),
 '饲料不淡出': ("clamp((1 - p.t / p.life) / 0.2, 0, 1)", "1"),
 '饲料不垫深边': ("ctx.strokeStyle = rgba(110, 60, 10, 0.55 * fade);\n            ctx.lineWidth = 1;\n            ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * k, 0, TAU); ctx.fill(); ctx.stroke();", "ctx.strokeStyle = rgba(110, 60, 10, 0.55 * fade);\n            ctx.lineWidth = 1;\n            ctx.beginPath(); ctx.arc(p.x, p.y, 3.2 * k, 0, TAU); ctx.fill();"),
 '饲料用 screen 画实心': ("ctx.globalCompositeOperation = 'source-over';\n            ctx.fillStyle = rgba(255, 190, 90, 0.95 * fade);", "ctx.globalCompositeOperation = 'screen';\n            ctx.fillStyle = rgba(255, 190, 90, 0.95 * fade);"),
 '饲料省流量仍画光晕': ("            if (!low) {\n                ctx.globalCompositeOperation = 'screen';\n                ctx.fillStyle = rgba(255, 170, 70, 0.22 * fade);", "            if (true) {\n                ctx.globalCompositeOperation = 'screen';\n                ctx.fillStyle = rgba(255, 170, 70, 0.22 * fade);"),
 '饲料不过滤坏数据': ("if (!ok(p.x, p.y, p.t, p.life)) continue;", ""),
 '泡不过滤坏数据': ("if (!ok(b.x, b.y, b.r, b.t, b.life)) continue;", ""),
 '泡省流量仍画高光': ("            if (!low) {\n                ctx.fillStyle = rgba(255, 255, 255, 0.5 * fade);", "            if (true) {\n                ctx.fillStyle = rgba(255, 255, 255, 0.5 * fade);"),
 '前层缺 restore': ("        }\n        ctx.restore();\n    }\n\n    // ---------- 喂食按钮", "        }\n    }\n\n    // ---------- 喂食按钮"),
 '前层空时仍画': ("if (!play.pellets.length && !play.bubbles.length) return;", ""),
 '拖拽阈值 <=': ("if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_PX) return;", "if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) <= DRAG_PX) return;"),
 '拖拽阈值太小': ("const DRAG_PX = 6; ", "const DRAG_PX = 1; "),
 '不吞 click': ("if (!enabled || now() < swallowUntil) return;", "if (!enabled) return;"),
 '吞 click 时长太短': ("const SWALLOW_MS = 450;", "const SWALLOW_MS = 0;"),
 '松手不吞 click': ("            swallowUntil = now() + SWALLOW_MS;\n            if (!ok(event.clientX, event.clientY) || hooks.overUi", "            if (!ok(event.clientX, event.clientY) || hooks.overUi"),
 '取消不吞 click': ("            const d = finish();\n            if (d && d.dragging) swallowUntil = now() + SWALLOW_MS;", "            const d = finish();"),
 '松在托盘上也撒': ("if (!ok(event.clientX, event.clientY) || hooks.overUi(event.clientX, event.clientY)) return;", "if (!ok(event.clientX, event.clientY)) return;"),
 '不检查坐标': ("if (!ok(event.clientX, event.clientY) || hooks.overUi(event.clientX, event.clientY)) return;", "if (hooks.overUi(event.clientX, event.clientY)) return;"),
 '没拖也在松手处撒': ("if (!d || !d.dragging) return;                                   // 没拖过", "if (!d) return;                                   // 没拖过"),
 'Esc 判定放宽': ("if (event && event.key === 'Escape') onCancel();", "if (event) onCancel();"),
 'Esc 不取消': ("if (event && event.key === 'Escape') onCancel();", ""),
 '失焦不取消': ("            if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', onCancel);\n        }\n        function onClick", "        }\n        function onClick"),
 '失焦监听不摘': ("            if (win && typeof win.removeEventListener === 'function') win.removeEventListener('blur', onCancel);", ""),
 '右键也算': ("if (!enabled || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;", "if (!enabled || event.isPrimary === false) return;"),
 '非主指针也算': ("if (!enabled || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;", "if (!enabled || (event.button !== undefined && event.button !== 0)) return;"),
 '禁用时仍响应按下': ("if (!enabled || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;", "if ((event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;"),
 '禁用时仍响应点击': ("if (!enabled || now() < swallowUntil) return;", "if (now() < swallowUntil) return;"),
 '饲料团不收': ("            if (d && d.ghost) d.ghost.remove();\n            return d;", "            return d;"),
 '监听不摘 move': ("                doc.removeEventListener('pointermove', onMove);\n", ""),
 '监听不摘 up': ("                doc.removeEventListener('pointerup', onUp);\n", ""),
 '监听不摘 cancel': ("                doc.removeEventListener('pointercancel', onCancel);\n", ""),
 '监听不摘 key': ("                doc.removeEventListener('keydown', onKey);\n", ""),
 '饲料团不跟随': ("            place(drag.ghost, event.clientX, event.clientY);\n        }\n        function onUp", "        }\n        function onUp"),
 '饲料团位置不取整': ("translate(${Math.round(x)}px, ${Math.round(y)}px)", "translate(${x}px, ${y}px)"),
 '重复按下不收旧的': ("            if (drag) finish();\n            drag = {", "            drag = {"),
 '禁用不取消拖拽': ("                if (!enabled && drag) finish();\n", ""),
 '禁用不写原因': ("button.setAttribute('title', enabled || !reason ? label : reason);", "button.setAttribute('title', label);"),
 '启用不清 describedby': ("                else button.removeAttribute('aria-describedby');", ""),
 '禁用不挂 describedby': ("if (!enabled && describedBy) button.setAttribute('aria-describedby', describedBy);", "if (false) button.setAttribute('aria-describedby', describedBy);"),
 '按钮不 disabled': ("                button.disabled = !enabled;\n", ""),
 'destroy 不收按钮': ("                finish();\n                button.remove();", "                finish();"),
 'destroy 不收拖拽': ("                finish();\n                button.remove();", "                button.remove();"),
 '点击不传 null': ("            hooks.feed(null);", "            hooks.feed(undefined);"),
 '默认时钟缺失': ("const now = hooks.now || (() => Date.now());", "const now = hooks.now;"),
 '按钮不挂到 parent': ("        parent.appendChild(button);\n\n        let drag", "\n        let drag"),
 '按钮没有说明': ("        button.setAttribute('aria-label', label);\n", ""),
}
run_mutations(T, tests, muts, deps)
```

写入 `/tmp/aq-mut/wire.py`（完整文件）：

```python
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import run_mutations
T = 'js/aquarium.js'
tests = ['test/aquarium.test.js', 'test/aquarium-shapes.test.js']
deps = ['js/aquarium-core.js', 'js/aquarium-play-core.js', 'js/aquarium-play.js']
HOOK = "feed = PlayUi.mountFeed(feedRow, { doc, win, now, feed: point => feedAt(point), overUi: (x, y) => overUi(x, y) });"
TAILLINE = "const tail = playOn() && playGuard(() => PlayCore.isTailZone(fish, x, y), false);"
ATT = "const at = point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : undefined;"
muts = {
 'env.playCore 被忽略': ("const PlayCore = env.playCore !== undefined ? env.playCore : DefaultPlayCore;", "const PlayCore = DefaultPlayCore;"),
 'env.play 被忽略': ("const PlayUi = env.play !== undefined ? env.play : DefaultPlayUi;", "const PlayUi = DefaultPlayUi;"),
 'window 没接': ("const win = env.window !== undefined ? env.window : root;", "const win = null;"),
 'playOn 不看 playFailed': ("!!(PlayCore && PlayUi && !playFailed && world)", "!!(PlayCore && PlayUi && world)"),
 'playOn 不看 world': ("!!(PlayCore && PlayUi && !playFailed && world)", "!!(PlayCore && PlayUi && !playFailed)"),
 'playOn 不看 PlayUi': ("!!(PlayCore && PlayUi && !playFailed && world)", "!!(PlayCore && !playFailed && world)"),
 'playOn 不看 PlayCore': ("!!(PlayCore && PlayUi && !playFailed && world)", "!!(PlayUi && !playFailed && world)"),
 'ensurePlay 每次重建': ("if (!play) play = PlayCore.create();", "play = PlayCore.create();"),
 'disablePlay 不置 null': ("            playFailed = true;\n            play = null;\n            warn(", "            playFailed = true;\n            warn("),
 'disablePlay 不警告': ("            warn(`[Aquarium] 玩法出错，本次会话停用戳、喂食和拉尾：${error && error.message ? error.message : error}`);\n", ""),
 'disablePlay 警告不带原因': ("停用戳、喂食和拉尾：${error && error.message ? error.message : error}`);", "停用戳、喂食和拉尾`);"),
 'disablePlay 不收按钮': ("            if (ui && ui.feed) { ui.feed.destroy(); ui.feed = null; }\n", ""),
 'disablePlay 不清引用': ("{ ui.feed.destroy(); ui.feed = null; }", "{ ui.feed.destroy(); }"),
 'disablePlay 不收提示行': ("            if (ui && ui.feedRow) ui.feedRow.hidden = true;\n", ""),
 'disablePlay 可重复': ("            if (playFailed) return;\n            playFailed = true;", "            playFailed = true;"),
 'playGuard 不给 fallback': ("catch (error) { disablePlay(error); return fallback; }", "catch (error) { disablePlay(error); }"),
 'playGuard 不捕获': ("try { return fn(); } catch (error) { disablePlay(error); return fallback; }", "return fn();"),
 'playGuard 吞掉不停用': ("catch (error) { disablePlay(error); return fallback; }", "catch (error) { return fallback; }"),
 'pokeFish 不看 playOn': ("            if (!playOn()) return;\n            playGuard(() => PlayCore.poke(ensurePlay(), world, fish, at));", "            playGuard(() => PlayCore.poke(ensurePlay(), world, fish, at));"),
 'pokeFish 位置不对': ("PlayCore.poke(ensurePlay(), world, fish, at)", "PlayCore.poke(ensurePlay(), world, fish, { x: fish.x, y: fish.y })"),
 'endTail 不看 tail': ("            if (!s.tail) return;\n            s.tail = false;", "            s.tail = false;"),
 'endTail 不清标记': ("            if (!s.tail) return;\n            s.tail = false;", "            if (!s.tail) return;"),
 'endTail 不看 playOn': ("            if (!play || !playOn()) return;", "            if (!play) return;"),
 'endTail 不看 play': ("            if (!play || !playOn()) return;", "            if (!playOn()) return;"),
 'endTail 永远安静': ("quiet ? { quiet: true } : undefined", "{ quiet: true }"),
 'endTail 永远不安静': ("quiet ? { quiet: true } : undefined", "undefined"),
 'feedAt 不看 playOn': ("            if (!playOn()) return { ok: false, reason: 'inactive' };\n", ""),
 'feedAt 坐标不过滤': (ATT, "const at = point ? { x: point.x, y: point.y } : undefined;"),
 'feedAt 总是从上面': (ATT, "const at = undefined;"),
 'feedAt 只看 x': (ATT, "const at = point && Number.isFinite(point.x) ? { x: point.x, y: point.y } : undefined;"),
 'feedAt 只看 y': (ATT, "const at = point && Number.isFinite(point.y) ? { x: point.x, y: point.y } : undefined;"),
 'feedAt 不写粒数': ("setStatus(`落下了 ${result.count} 粒饲料`)", "setStatus('落下了饲料')"),
 'feedAt busy 不提示': ("            else if (result.reason === 'busy') setStatus('饲料还没吃完');\n", ""),
 'feedAt failed 不提示': ("            else if (result.reason === 'failed') setStatus('喂食出错，已停用戳、喂食和拉尾');\n", ""),
 '喂食按钮总不建': ("if (PlayCore && PlayUi && !playFailed) {", "if (false) {"),
 '喂食按钮不看 PlayCore': ("if (PlayCore && PlayUi && !playFailed) {", "if (PlayUi && !playFailed) {"),
 '喂食按钮不看 PlayUi': ("if (PlayCore && PlayUi && !playFailed) {", "if (PlayCore && !playFailed) {"),
 '喂食不带提示': ("                feedRow.appendChild(el('span', 'aq-feed-hint', '点一下撒饲料，也可以拖到水里'));\n", ""),
 '喂食钩子不传 win': (HOOK, "feed = PlayUi.mountFeed(feedRow, { doc, now, feed: point => feedAt(point), overUi: (x, y) => overUi(x, y) });"),
 '喂食钩子不传 now': (HOOK, "feed = PlayUi.mountFeed(feedRow, { doc, win, feed: point => feedAt(point), overUi: (x, y) => overUi(x, y) });"),
 '喂食钩子 overUi 永假': (HOOK, "feed = PlayUi.mountFeed(feedRow, { doc, win, now, feed: point => feedAt(point), overUi: () => false });"),
 '喂食钩子 feed 丢点': (HOOK, "feed = PlayUi.mountFeed(feedRow, { doc, win, now, feed: () => feedAt(null), overUi: (x, y) => overUi(x, y) });"),
 '喂食行不入面板': ("                panel.appendChild(feedRow);\n", ""),
 'destroyUi 不收喂食': ("            if (ui.feed) ui.feed.destroy();\n            ui.root.remove();", "            ui.root.remove();"),
 'refreshUi 不更新喂食': ("            if (ui.feed) {\n                const hasFish = entries.length > 0;\n                ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');\n            }\n", ""),
 'refreshUi 永远可喂': ("ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');", "ui.feed.setEnabled(true);"),
 'refreshUi 有鱼才禁': ("ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');", "ui.feed.setEnabled(!hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');"),
 'refreshUi 不给原因': ("ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');", "ui.feed.setEnabled(hasFish, undefined, 'aq-empty');"),
 'refreshUi 不指向原因行': ("ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食', 'aq-empty');", "ui.feed.setEnabled(hasFish, hasFish ? undefined : '先放入一条鱼，才能喂食');"),
 '空列表项没有 id': ("                empty.setAttribute('id', 'aq-empty');\n", ""),
 'inRect 不看面积': ("return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains", "return x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains"),
 'inRect 左边界': ("return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains", "return r.width > 0 && r.height > 0 && x > r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains"),
 'inRect 右边界': ("return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains", "return r.width > 0 && r.height > 0 && x >= r.left && x < r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains"),
 'inRect 上边界': ("return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains", "return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y > r.top && y <= r.top + r.height;\n        };\n        const netContains"),
 'inRect 下边界': ("return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height;\n        };\n        const netContains", "return r.width > 0 && r.height > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y < r.top + r.height;\n        };\n        const netContains"),
 'overUi 只认开关': ("(inRect(ui.toggle, x, y) || inRect(ui.panel, x, y))", "inRect(ui.toggle, x, y)"),
 'overUi 只认面板': ("(inRect(ui.toggle, x, y) || inRect(ui.panel, x, y))", "inRect(ui.panel, x, y)"),
 'netContains 认错元素': ("inRect(ui && ui.net, x, y)", "inRect(ui && ui.toggle, x, y)"),
 'grabAt 不判后半身': (TAILLINE, "const tail = false;"),
 'grabAt 总是拉尾': (TAILLINE, "const tail = playOn();"),
 'grabAt 不看 playOn': (TAILLINE, "const tail = playGuard(() => PlayCore.isTailZone(fish, x, y), false);"),
 'grabAt 不传 tail': ("Core.grab(world, fish, x, y, tail ? { tail: true } : undefined)", "Core.grab(world, fish, x, y)"),
 'grabAt 不 beginHold': ("            if (tail) playGuard(() => PlayCore.beginHold(ensurePlay(), world, fish));        // 出错时玩法停用，endTail 随之什么都不做\n", ""),
 'grabAt beginHold 不确保 play': ("PlayCore.beginHold(ensurePlay(), world, fish)", "PlayCore.beginHold(play, world, fish)"),
 'grabAt 会话不记 tail': ("session = { fish, down: { x, y }, dragging: false, generation, tail };", "session = { fish, down: { x, y }, dragging: false, generation, tail: false };"),
 'grabAt 会话 tail 取反': ("session = { fish, down: { x, y }, dragging: false, generation, tail };", "session = { fish, down: { x, y }, dragging: false, generation, tail: !tail };"),
 'tick 无 UI 不收拉尾': ("                    Core.release(world, s.fish);\n                    endTail(s, true);\n                    endSession();", "                    Core.release(world, s.fish);\n                    endSession();"),
 'drop 点一下不戳': ("                endSession();\n                pokeFish(fish, s.down);\n                return false;", "                endSession();\n                return false;"),
 'drop 戳在松手处': ("pokeFish(fish, s.down);", "pokeFish(fish, { x, y });"),
 'drop 点一下吞 click': ("                pokeFish(fish, s.down);\n                return false;", "                pokeFish(fish, s.down);\n                return true;"),
 'drop 点一下不收拉尾': ("                Core.release(world, fish);\n                endTail(s, true);\n                endSession();\n                pokeFish", "                Core.release(world, fish);\n                endSession();\n                pokeFish"),
 'drop 点一下拉尾不安静': ("                endTail(s, true);\n                endSession();\n                pokeFish", "                endTail(s, false);\n                endSession();\n                pokeFish"),
 'drop 先戳后放': ("                Core.release(world, fish);\n                endTail(s, true);\n                endSession();\n                pokeFish(fish, s.down);", "                pokeFish(fish, s.down);\n                Core.release(world, fish);\n                endTail(s, true);\n                endSession();"),
 'drop 放回不收拉尾': ("if (!inNet) { endSession(); Core.release(world, fish); endTail(s, false); return true; }", "if (!inNet) { endSession(); Core.release(world, fish); return true; }"),
 'drop 放回拉尾安静': ("Core.release(world, fish); endTail(s, false); return true; }", "Core.release(world, fish); endTail(s, true); return true; }"),
 'drop 先收拉尾再放': ("if (!inNet) { endSession(); Core.release(world, fish); endTail(s, false); return true; }", "if (!inNet) { endSession(); endTail(s, false); Core.release(world, fish); return true; }"),
 'drop 捞出不收拉尾': ("            endTail(s, true);\n            endSession(true);", "            endSession(true);"),
 'drop 捞出拉尾不安静': ("            endTail(s, true);\n            endSession(true);", "            endTail(s, false);\n            endSession(true);"),
 'cancel 不收拉尾': ("                endTail(s, !s.dragging);\n", ""),
 'cancel 总安静': ("endTail(s, !s.dragging);", "endTail(s, true);"),
 'cancel 总不安静': ("endTail(s, !s.dragging);", "endTail(s, false);"),
 'start 不重置 playFailed': ("            failed = false;\n            playFailed = false;\n            loaded = false;", "            failed = false;\n            loaded = false;"),
 'stop 不丢 play': ("            destroyUi();\n            world = null;\n            play = null;\n            entries = [];\n            loaded = false;", "            destroyUi();\n            world = null;\n            entries = [];\n            loaded = false;"),
 'frame 重建 world 不丢 play': ("                    world = Core.createWorld({ width, height, random, lowPower: low });\n                    play = null;", "                    world = Core.createWorld({ width, height, random, lowPower: low });"),
 'frame 不缩放 play': ("                    if (play) playGuard(() => PlayCore.resize(play, ratioX, ratioY));\n", ""),
 'frame 缩放 xy 反': ("PlayCore.resize(play, ratioX, ratioY)", "PlayCore.resize(play, ratioY, ratioX)"),
 'frame 缩放比例反': ("const ratioX = width / world.width;", "const ratioX = world.width / width;"),
 'frame 缩放比例反 y': ("const ratioY = height / world.height;", "const ratioY = world.height / height;"),
 'frame 先缩放 world 再取比例': ("                    const ratioX = width / world.width;\n                    const ratioY = height / world.height;\n                    Core.resize(world, width, height);", "                    Core.resize(world, width, height);\n                    const ratioX = width / world.width;\n                    const ratioY = height / world.height;"),
 'frame 不传 attractors': ("Core.step(world, dt, { pointer: point, bells: options.bells, attractors });", "Core.step(world, dt, { pointer: point, bells: options.bells });"),
 'frame 不推进 play': ("                if (play) playGuard(() => PlayCore.step(play, world, dt));\n", ""),
 'frame 推进 play 用错 dt': ("PlayCore.step(play, world, dt)", "PlayCore.step(play, world, dt * 2)"),
 'frame 没鱼不丢 play': ("if (!world.fish.length) { play = null; return true; }", "if (!world.fish.length) return true;"),
 'frame 不画涟漪': ("                if (play) playGuard(() => PlayUi.drawBack(ctx, play, view));\n", ""),
 'frame 不画前层': ("                if (play) playGuard(() => PlayUi.drawFront(ctx, play, view));\n", ""),
 'frame 不传 extras': ("drawFish(ctx, fish, colors, view, play ? playGuard(() => PlayCore.extrasOf(play, fish), undefined) : undefined)", "drawFish(ctx, fish, colors, view)"),
 'frame view 没有缩放': (", lowPower: low, scale: world.scale };", ", lowPower: low };"),
 'catch 不丢 play': ("                world = null;\n                play = null;\n                destroyUi();", "                world = null;\n                destroyUi();"),
 'state 不含 playFailed': ("grabbing: !!session, playFailed })", "grabbing: !!session })"),
}
run_mutations(T, tests, muts, deps)
```


---

## 附录 B：套用代码块的小工具（`/tmp/aq-apply.py`，不进仓库）

这份计划里有几千行测试与实现代码。手抄容易抄错，所以附一个小工具：它**只做一件事**——把某个步骤里的 ` ```diff ` 块用 `patch -p1` 套到工作树，把“写入 `路径`（完整文件）：”后面的块整份写到路径；不跑命令、不碰说明与期望输出，也不处理文档替换（Task 9 Step 10 的文档改动仍要你自己做，因为表格里的数字要现场填）。“计划重放”验证时用的就是这段逻辑（重放时另外检查过：用这个工具逐步骤套一遍得到的文件树，与手工按步骤重放得到的逐字节一致）。

第一次用之前，在工作树根目录用下面这条命令把它从本计划里取出来（取出的内容与下面的代码块逐字节相同）：

```bash
cd ~/worktrees/ctb-aquarium
python3 - <<'PY'
import pathlib, re
plan = pathlib.Path('docs/superpowers/plans/2026-10-17-aquarium-interaction.md').read_text(encoding='utf-8')
m = re.search(r'## 附录 B：.*?```python\n(.*?)\n```', plan, re.S)
pathlib.Path('/tmp/aq-apply.py').write_text(m.group(1) + '\n', encoding='utf-8')
PY
python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md 1 2 --dry-run   # 先演练：不写任何文件，只检查差异能不能套上
```

用法：`python3 /tmp/aq-apply.py docs/superpowers/plans/2026-10-17-aquarium-interaction.md <任务号> <步骤号>`（任务号写 `A` 表示附录 A 的变异检查脚本）。每个带代码块的步骤标题下面都有写好的这条命令。**一步一步来**：套完一步要先跑该步骤的测试、核对期望输出，再进下一步；套不上（工作树与计划写的起点不一致）时工具会报错并停下，这时不要硬改，先弄清为什么不一致。

小工具的完整代码（上面的命令把它保存为 `/tmp/aq-apply.py`）：

```python
#!/usr/bin/env python3
"""把实现计划里某个步骤的代码块原样套到工作树，省得手抄几千行代码时抄错。

用法：
  python3 /tmp/aq-apply.py <计划.md> <任务号|A> [<步骤号>] [--root 工作树] [--tmp-root 目录] [--dry-run]

套用的只有两种块（其余说明、命令、期望输出、文档替换都不碰）：
  1. diff 围栏（三个反引号加 diff）：相对当前文件的差异，用 patch -p1 套到工作树；
  2. 紧跟在“写入 `路径`（完整文件）：”后面的围栏：整份文件写到 路径（相对工作树；以 /tmp/ 开头的绝对路径照写，--tmp-root 可把它们挪到别处，只用于演练）。
任务号写 A 表示附录 A（变异检查脚本）。不写步骤号就套该任务里的所有步骤（一般应一步一步来：每一步套完要先跑测试核对期望，再进下一步）。
这个工具只写文件、不跑任何命令；它的逻辑和“计划重放”验证时用的一样。
"""
import argparse, pathlib, re, subprocess, sys

FENCE = chr(96) * 3          # 三个反引号（不直接写出来，免得这段代码嵌进 Markdown 围栏时被误认）

ap = argparse.ArgumentParser()
ap.add_argument('plan')
ap.add_argument('task')
ap.add_argument('step', nargs='?')
ap.add_argument('--root', default=str(pathlib.Path.home() / 'worktrees' / 'ctb-aquarium'))
ap.add_argument('--tmp-root', default=None)
ap.add_argument('--dry-run', action='store_true')
args = ap.parse_args()
root = pathlib.Path(args.root).expanduser()

lines = pathlib.Path(args.plan).read_text(encoding='utf-8').split('\n')
task = step = None
prose = []
todo = []
i = 0
while i < len(lines):
    ln = lines[i]
    m = re.match(r'^## Task (\d+)：', ln)
    if m:
        task, step = m.group(1), None
    elif re.match(r'^## 附录 A：', ln):
        task, step = 'A', None
    elif ln.startswith('## '):
        task, step = None, None
    m = re.match(r'^- \[ \] \*\*Step (\d+)', ln)
    if m:
        step = m.group(1)
    if ln.startswith(FENCE):
        lang = ln[3:].strip()
        j = i + 1
        body = []
        while j < len(lines) and lines[j] != FENCE:
            body.append(lines[j])
            j += 1
        text = '\n'.join(body) + '\n'
        label = next((p.strip() for p in reversed(prose) if p.strip()), '')
        mw = re.match(r'^写入 `([^`]+)`（完整文件）：$', label)
        if task == args.task and (args.step is None or step == args.step):
            if lang == 'diff':
                todo.append(('diff', None, text, step))
            elif mw:
                todo.append(('write', mw.group(1), text, step))
        prose = []
        i = j + 1
        continue
    prose.append(ln)
    i += 1

if not todo:
    sys.exit(f'任务 {args.task} 步骤 {args.step or "（全部）"} 里没有可套用的代码块')

PATCH = ['patch', '-p1', '-F0', '--no-backup-if-mismatch', '-d', str(root)]     # -F0：上下文必须逐行吻合，不接受模糊匹配

# 先对本次所有 diff 块做演练：任何一块套不上就一个文件都不改（单个步骤里没有两块 diff 改同一个文件，演练互不影响）
for kind, path, text, st in todo:
    if kind == 'diff':
        r = subprocess.run(PATCH + ['--dry-run'], input=text, capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f'Step {st}: 差异套不上（工作树和计划写的起点不一致？）。没有改动任何文件：\n{r.stdout}{r.stderr}')

for kind, path, text, st in todo:
    if kind == 'diff':
        cmd = PATCH + (['--dry-run'] if args.dry_run else [])
        r = subprocess.run(cmd, input=text, capture_output=True, text=True)
        print(f'Step {st}: patch {"（演练）" if args.dry_run else ""}{r.stdout.strip().replace(chr(10), "；")}')
        if r.returncode != 0:
            sys.exit(f'Step {st}: 差异套不上：\n{r.stdout}{r.stderr}')
    else:
        target = pathlib.Path(path)
        if target.is_absolute():
            if args.tmp_root and path.startswith('/tmp/'):
                target = pathlib.Path(args.tmp_root) / path[len('/tmp/'):]
        else:
            target = root / path
        print(f'Step {st}: 写入 {target}（{len(text.splitlines())} 行）{"（演练）" if args.dry_run else ""}')
        if not args.dry_run:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text, encoding='utf-8')
```

---

## 自检（写完计划后做的）

**规格覆盖。**

| 规格 | 落在哪个任务 |
|---|---|
| §1–3 手势模型（戳、拉尾、喂食、空水不变、点不吞 click） | Task 2（戳）、Task 4（拉尾）、Task 3（喂食）、Task 7（手势分流与 `drop` 返回值） |
| §4 架构：核心钩子（吸引点、`tail`、`cruiseSpeed`） | Task 1 |
| §4 架构：玩法核心、画法、按钮、接线、隔离 | Task 2–4、Task 6、Task 7 |
| §4 画法钩子（`spineOf` 的 `pull`、`drawFish` 的 `extras`、变亮光晕） | Task 5 |
| §5 界面文案（按钮、提示、状态栏、禁用原因）与设置页说明 | Task 6、Task 7、Task 8 |
| §6.2 先钉住现状（黄金轨迹、`spineOf`、绘制序列哈希） | Task 1、Task 5（期望值取自改动之前的代码） |
| §6.3 新增与补充的测试 | Task 1–8 |
| §6.4 变异检查 | Task 9 Step 8 + 附录 A |
| §6.5 真实 Chromium 通过线 | Task 9 Step 4–7（`judge.mjs`） |
| §6.6 分层报告 | Task 9 Step 11 |
| §10 文档与交付（技术文档新一节、`AGENTS.md`、`_index.md`、设置页说明句） | Task 8（设置页）、Task 9 Step 10 |
| §8 不做（YAGNI） | 计划里没有任何一步实现它们 |

**占位符扫描。** 计划正文里没有“待补”“稍后”“类似上面”之类的说法；每个代码步骤都有完整代码或可直接套用的差异。唯一需要执行者现场填的是 Task 9 Step 10 技术文档表格里的实测数字（执行前不可能知道），已写明数字取自哪个文件的哪个字段、填完不能留下划线，并有一条 `rg` 检查。

**类型与命名一致性。** 导出名在各任务间一致：`Core.step(…, { pointer, bells, attractors })`、`Core.cruiseSpeed`、`Core.grab(…, { tail })`、`fish.held.tail / pvx / pvy`（Task 1）→ `PlayCore.poke / sprinkle / attractors / extrasOf / isTailZone / beginHold / endHold / step / resize / counts / create`（Task 2–4）→ `geometry.spineOf(…, pull)`、`drawFish(…, extras)`（Task 5）→ `Play.drawBack / drawFront / mountFeed`（Task 6）→ 控制器 `_play()`、`state().playFailed`（Task 7）→ 版本钉子（Task 8）。被拒原因的取值集合在 Task 2–4 与测试里一致。**这些都由“计划重放”验证：套差异 13 处、写文件 24 个（5 个仓库文件 + 19 个 `/tmp` 脚本）、核对计划写下的期望 44 处（每个任务的红绿 `tests/pass/fail` 计数、失败名单与“本来就通过”名单、错误里的关键文字、每个检查点的 `diff -rq` 输出、两次全量套件、预览服务的四个状态码）；13/13 个仓库文件与验证过的最终文件逐字节一致，19 个脚本与原件逐字节一致；**最后一遍重放没有发现任何问题**。另外按附录 B 写的方法把小工具从计划里取出来（与源文件逐字节相同），在另一份干净副本上逐个套用了 20 个带代码块的步骤（含附录 A），得到的文件树与手工重放逐字节一致。前几遍重放（含 Task 9 的真实 Chromium 部分）抓到并改正了计划里的三处错误：① Task 1 的全量基线命令用 `tail -12` 看不到汇总行；② Task 9 Step 3 的 `curl` 带多个网址时 `-o /dev/null` 只管第一个，其余网址的网页内容会打到屏幕上；③ 抓取试验在最终版上只剩 4–7 次有效样本（脚本会按到页面按钮、点一下鱼又变成了“戳”而吓跑别的鱼），已改脚本并给 `judge.mjs` 加了“样本 ≥ 20”的检查。**
