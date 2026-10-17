---
title: 桌面水母形象系统 S1a：颜色与花纹（协议不升版本，默认外观逐像素不变）
date: 2026-10-17
status: S1a 已实现，并补完当晚的欠账（午夜自动换一只、设置页示意图、可见性与辨识度测量、花纹“画对了没有”的渲染检查、帧耗时对比、四层系统变异检查）；隔离环境验证通过（Chrome 侧业务替身测试、Swift 纯逻辑自测、独立 Bundle ID 的原生冒烟、默认外观逐像素基线、真实 Chrome 侧模块 ↔ 真实原生进程联调、HTTP 预览里的设置页版面）；带真实鼠标的冒烟没跑；材质（软糖/毛绒/线框/铅笔/像素）、尺寸、节日换装、“换一只”右键菜单未做（新物种在 S1a 之后的 Step A 里开始做，见 `jelly-species-hammer-20261018.md`）；真实 Chrome 156、重装后的真实组件、多显示器、全屏 Space、Stage Manager、壁纸叠加观感、VoiceOver 未验收
---

# 桌面水母形象系统 S1a：颜色与花纹

设计稿：`docs/superpowers/specs/2026-10-17-jelly-appearance-design.md`（含用户选择的逐项决定与 X 海洋动物 50 帖素材映射）。实施计划：`docs/superpowers/plans/2026-10-17-jelly-appearance-s1a.md`。物种设计稿（用户 2026-10-17 已确认五条默认值）：`docs/superpowers/specs/2026-10-17-jelly-species-design.md`；Step A（动物接口与小锤头鲨）的实现与验证见 `docs/technical/jelly-species-hammer-20261018.md`。分支 `feat/jelly-appearance`（独立 worktree；S1a 作为单个提交落在该分支，未合并、未发布）。

## 做了什么

用户可以在设置页“桌面水母形象”卡片里选 **8 种颜色**和 **4 种花纹**，并有“每天换一只”和“随机一只”，卡片第一项是当前形象的示意图：

| 项 | 取值 |
|---|---|
| 颜色 | 8 色，按色相环顺序排列；色位 5（冰蓝）就是原来的平静色 |
| 花纹 | `solid` 纯色 / `duo` 双色（钟罩一种、触须与口腕另一种）/ `blend` 渐变（钟罩下缘主色 → 顶部第二色，触须偏向第二色）/ `rainbow` 七彩（三色沿钟罩横向铺开，触须沿横向取色） |
| 每天换一只 | 由当天本地日期确定性地决定颜色与花纹，一天内不变，**过了本地午夜自动换成新的一只**（见“关键决定”6）；开着时手选的颜色与花纹不起作用，界面同步禁用 |
| 随机一只 | 必定换一种颜色、随机花纹，并关闭“每天换一只” |
| 示意图 | 卡片第一项“当前形象”（“每天换一只”开着时叫“今天这只”）：静态 SVG 画出钟罩、五根触须与两条口腕，旁边用文字写出花纹与颜色名；声明是示意，不是桌面上那只的实时预览（见“关键决定”7） |

阶段色（临近/紧迫/最后 10 秒）**覆盖**所选颜色，阶段结束后回到所选颜色；平静期换色立即生效，阶段内换色记下来、回到平静再生效。

## 复用与新增（对照 AGENTS.md“优先复用”）

- 没有适用的开源 SDK：这是 AppKit/CoreGraphics 里的自绘水母。复用本仓库已有的 **Native Messaging 连接、`jelly` 命令、`JellyDesktop` 的 `push/sync`、设置页的“消息读写 + `sender` 校验”模式、`JellyPalette` 的深浅色约定**，没有新增权限、网络或第二条连接。
- **新增产品代码**（均为薄层）：`js/jelly-appearance.js`（设置、解析与午夜预约）、`js/settings-jelly-appearance.js`（设置页客户端与示意图）、`desktop-reminder/jelly-appearance.swift`（原生白名单解析 + 调色板）、`desktop-reminder/jelly-paint.swift`（纯逻辑的颜料 `JellyPaint`）、`desktop-reminder/jelly-materials.swift`（`JellyPainter` 协议、`GlassPainter`）。
- **新增验证工具**（不属于扩展运行时，位于 `desktop-reminder/` 与 `test/`）：`png-decode.mjs`（8 位 RGBA 无隔行 PNG 解码，只用 Node 内置 `zlib`，没有新依赖）、`appearance-snapshot.mjs`（默认外观基线、`--compare`、`--all-colors`、`--all-looks`）、`appearance-contrast.mjs`（可见性与辨识度测量）、`appearance-looks.mjs`（花纹“画对了没有”）、`appearance-smoke.mjs`（隔离原生冒烟）、`test/fixtures/png-encode.mjs`（测试用最小 PNG 编码器）。
- 绘制抽象：旧的 `drawTentacles/drawBell` **原样搬进 `GlassPainter`，只把颜色来源改成 `JellyPaint`**；`painter(for:)` 目前对任何材质都返回 `GlassPainter`，S2/S3 再加别的画法。

## 关键决定与理由

1. **协议仍是 v7，不升版本。** 并行分支的“跑腿”设计声明要用 v8，这里不抢版本号。能力探测靠回执：Chrome 在 `jelly` 命令里带 `appearance` 时，新原生组件回 `appearance:{status:'ok'}`，旧组件不回；`JellyDesktop.appearanceStatus()` 据此给出 `off | ok | unsupported | unknown`，设置页对应显示“已应用 / 请更新组件 / 等待确认”。没带 `appearance` 的命令，原生保持上一次外观（Chrome 读取外观失败时不会闪回默认）；全新进程从默认外观开始。
2. **独立存储键 `desktopJellyAppearanceV1`，不并入 `desktopJellyV1`。** 旧版本的 `desktopJellyV1` 解析会丢掉未知字段，并入会让回滚旧版本时抹掉外观；独立键与已有的 `desktopAssistantV1` 同理。
3. **Chrome 是设置唯一所有者，原生只解析与绘制。** 原生解析走白名单、永不失败：颜色必须是 0–7 的整数（布尔值用 CFBoolean 判别后拒绝）、颜色要么全部合法要么整体回默认、花纹需要的颜色数多于给出的数量时退回纯色；非法载荷（非字典、越界、布尔）回到默认外观，水母不消失。
4. **JS 与 Swift 各有一份外观解析与调色板**，`test/desktop-companion-logic.test.mjs` 做三项对照，改一边必须改另一边：① JS `resolve()` 的结果（4 种花纹 × 8 种颜色，外加连续 20 天的“每天换一只”）经 Swift 解析后逐项一致；② 桌面 8 色与首页 `JellyfishSkin.PALETTE` 的**色相顺序**一致（每个色位色相相差 ≤20°）；③ 同一批外观下，Swift `JellyPaint` 与首页 `js/jellyfish.js`、设置页示意图 `js/settings-jelly-appearance.js` 两份 JS `paintOf` 逐个部位（钟罩三色、触须、口腕、描边）数值一致（Swift 自测打印 `PAINT` 行，Node 与 JS 比较）。桌面调色板的**具体数值不与首页比较**（桌面水母是半透明叠在壁纸上，数值本来就不同），默认值 `DEFAULTS` 也没有 JS↔Swift 对照，默认外观靠逐像素基线守住。调色板顺序必须保持色相环顺序。
5. **每日与随机的确定性**：`resolve()` 用 mulberry32，每日种子为本地日期；双色取色位偏移 2/3/4、渐变偏移 2、七彩步长 2（八色环上第三色恰好在对面，所以第三色的方向符号没有影响）；`reroll` 必定换颜色。“同一天、同样的设置展开出的颜色在版本之间不变”由金样本守住（12 个日期 + 32 种手选组合），有意改算法时必须同时更新金样本并在文档注明。
6. **“每天换一只”过午夜自动刷新。** `create()` 里的 `armDaily`：每次真正下发外观（`payload`）或设置变化时，若“每天换”开着，就预约一个“下一个本地午夜 + 1 秒”的一次性定时器；到点只调用 `onChange` 通知后台重新下发，不自行续约（水母常驻时，重新下发会再次预约，所以链条靠常驻连接延续；没常驻就不会一直转）。反复下发先取消旧的、不堆叠；关掉“每天换”或点“随机一只”取消；计时器与时钟可注入，Node 宿主里 `unref`，源码绊线测试要求“唯一的定时器是注入式、一次性的午夜重发”，且无网络、无 `innerHTML`、无 `chrome.alarms`、无新权限。这是 Service Worker 里的 `setTimeout`：常驻时连接保持 Service Worker 不休眠；若 Chrome 仍让它休眠，则下一次唤醒或下发时才更新（真实 Chrome 过午夜**未验收**）。
7. **设置页示意图是静态 SVG，不是第二套绘制引擎。** 页面里有一份固定的 SVG（钟罩三种填充、五根触须、两条口腕），`paintOf(resolved, palette)` 按与原生 `JellyPaint` 相同的规则算出各部位颜色，写成 CSS 变量 `--jp-*`，按 `data-look` 切换钟罩填充；调色板直接取页面上色块的 `--swatch`，所以色块与示意图不会不一致，而色块十六进制与原生调色板四舍五入后逐位相同由测试守住。取色规则一旦在 Swift 里改动，源码绊线测试会失败，提醒同步示意图。后台没给出可用的 `resolved`、页面缺少个别元素、旧页面结构时示意图隐藏或跳过，不影响其余控件。
8. **`jellyTint == jellyPaintA` 约定**：`JellyPose.tint`（光晕、涟漪、睡觉标记、气泡边框用）始终等于颜料主色 `paint.a`；`ping` 回执带只作验收诊断的 `jellyLook`、`jellyPaintA`、`jellyTint`（`jellyAppearance` 是系统浅/深色，没改名），冒烟在每次读数时核对两者相等。

## 实现位置与合并热点

后续合并并行分支时，冲突最可能出现在这些**共享文件**（本次改动规模见括号，均为最小接线）：

| 文件 | 改动 |
|---|---|
| `js/background.js` | `importScripts` 加载 `jelly-appearance.js`；创建 `jellyAppearance` 并传给 `JellyDesktop.create`；`jelly_appearance_get/set/reroll` 消息（校验 `sender.id` 与 `sender.url`）。接线在 `getUserAlarmViewState` 之后，不在 `assistant-management` 测试截取的片段内 |
| `js/jelly-desktop.js` | `create(...appearance)`、`push` 带 `appearance`、`appearanceInfo` 与 `appearanceStatus()` |
| `desktop-reminder/jelly-companion.swift` | 绘制改走 `painter`；`JellyTint` 可比较；`JellyPose.paint`；`setAppearance` |
| `desktop-reminder/jelly-controller.swift`、`main.swift` | `setAppearance` 接线；`case "jelly"` 回执 `appearance`；ping 新增 `jellyLook`、`jellyPaintA`、`jellyTint` |
| `desktop-reminder/build.mjs`、`test/desktop-companion-logic.test.mjs` | 源文件清单加入 `jelly-appearance`、`jelly-paint`、`jelly-materials` |
| `settings.html`、`css/settings-page.css` | 新卡片、色板与示意图样式，位于“桌面水母”之后、“水母关怀”之前 |

## 验证结果（分层，不互相冒充）

**静态检查**：`git diff --check` 无输出（它只覆盖已跟踪文件，未跟踪的新文件另用 `rg` 查过行尾空白，无）；新增与修改的 JS、`.mjs` 均 `node --check` 通过；Swift 随原生构建与自测一起编译通过。

**业务替身测试（Chrome 侧与工具层）**：8 个新测试文件共 175 项全部通过——`jelly-appearance` 30（解析、每日/随机确定性、金样本稳定性契约、串行写入、午夜预约）、`jelly-appearance-desktop` 8、`jelly-appearance-integration` 5、`jelly-appearance-settings` 47（含示意图）、`jelly-appearance-background` 6、`appearance-contrast` 31、`appearance-looks` 37、`png-decode` 11。全量 `node --test --test-force-exit test/*.test.js test/*.test.mjs`：**2584 项全部通过**（首版 2441 项）。

**原生纯逻辑自测**：`companion-selftest.swift` 编译并运行，683 项检查全部通过，含上述 JS↔Swift 的解析往返、色相顺序与 `PAINT` 逐部位对照，以及 `main.swift` 合同断言（`setAppearance(object["appearance"])`、`extra["appearance"]`、`"version": 7`、`jellyLook`、`jellyTint`）。

**默认外观逐像素基线**（本次改造的核心闸门）：重构前先用 `appearance-snapshot.mjs` 在隔离构建里截下 4 张自家窗口图（平静/夜晚 × 浅/深色，`TIMEKEEPER_REDUCE_MOTION=1`，只用 `screencapture -l`）；用**最终源码重新构建**后再截并 `--compare`，**4 张图都与基线逐像素一致**（不下发 `appearance` 与显式下发默认外观两种情况在之前的轮次里都比对过）。闸门灵敏度另由变异检查佐证（见下）。

**隔离原生冒烟**（独立 Bundle ID `com.timekeeper.desktop.qa`，用最终源码重新构建）：`appearance-smoke.mjs` 11/11（无 `appearance` 为旧行为且版本仍是 7；回执 `ok` 且颜色立即到位；显式默认等同不下发；非法/非字典载荷回默认且水母不消失；缺省保持上一次；多色三个色位回显；阶段覆盖与恢复；阶段内换色在回到平静后生效；**开着动态效果时**平静期换色立即到位、阶段色是渐变过去的——这两个场景在系统本身开着“减少动态效果”时明确跳过、不算通过）；`jelly-smoke.mjs --no-mouse` 全部阶段通过（协议 v7）；`bridge-smoke.mjs --no-mouse`（真实 Chrome 侧模块 ↔ 真实原生进程）全部阶段通过。**带真实鼠标的阶段没有跑**：`jelly-smoke` 的真实鼠标场景与 `bridge-smoke` 的 3、4 阶段会移动用户的真实指针，需要用户不在电脑前时再跑。

**花纹“画对了没有”（渲染检查，`appearance-looks.mjs`）**：JS↔Swift 对照只证明颜料数值一致，不证明画出来的像素用了对的颜料，所以把四种花纹的窗口截图叠在白底上，取最大的一块连通身体像素，按行宽分出钟罩与触须，再按左/中/右、上/下与描边分区取中位色，断言每个区域最接近哪个参考色位。最终构建上四种花纹全部画成了规定的色位（纯色整只 5；双色钟罩 5、触须 0；渐变钟罩下缘 5 → 顶部 0、触须 0；七彩钟罩横向 5 → 0 → 3、描边 0）。口径与限制写在脚本头：只在白天、浅色外观、玻璃材质、中号下测过，材质与尺寸扩展后须各补一组；睡着的 “z z” 标记会撑宽包围盒（真实截图里右边界 216 → 245），所以只取最大连通块。

**可见性与辨识度（`appearance-contrast.mjs`）**：把 8 个颜色位的窗口截图叠在纯白、纯黑底上量（身体 = alpha ≥ 0.45 的像素）。实测：白底身体中位对比度 1.21（黄）…1.57（紫），默认冰蓝 1.38；黑底 5.18（紫）…7.55（黄）；身体色差最小：白底绿与薄荷 11.4、黑底橙与黄 13.6（调色板本身最小 27.2，半透明叠底后被压缩）。**防退化线** `{ whiteMedianContrast: 1.15, blackMedianContrast: 4.8, pairDeltaE: 10 }` 略低于这些实测最小值，用来发现“改调色板或画法后某个颜色变得更淡、更像邻居”，**不是视觉标准**：水母是半透明的，真实观感取决于壁纸，这里只量两个极端底色；WCAG 对图形对象的 3:1 针对不透明元素，不套用。白底上黄色只有 1.21，说明浅色壁纸上黄色水母会很淡——这是量出来的事实，没有为此改调色板。

**帧耗时（离屏绘制，不含 WindowServer 合成）**：M3 Max、macOS 26.5、机器负载 load average 约 7.7，三组“基线构建 / 当前构建”交错，每组每场景 5 轮 × 1500 帧，取三组中位数；`JellyView.cacheDisplay` 170×150（2× 位图），`-Onone`（与 `build.mjs` 默认 `swiftc` 相同）。白天每帧：基线 0.219 ms；纯色 0.222（+1.4%）；双色 0.221（+0.9%）；渐变 0.221（+0.9%）；七彩 0.275（+25.6%，约 +0.056 ms）。夜晚每帧：基线 0.487 ms；纯色/双色/渐变 0.488–0.489（≤ +0.4%）；七彩 0.546（+12.1%）。每帧颜料插值：基线 0.111 µs，纯色 0.371、双色/渐变 0.458、七彩 0.540（每帧多 0.26–0.43 µs）。按 30 fps 折算占一个核：基线 0.66%，七彩 0.83%（多 0.17 个百分点），夜晚七彩 1.64% 对基线 1.46%。基线自身波动 0.210–0.320 ms，所以纯色/双色/渐变 ≤1.4% 的差别在噪声内。这是离屏绘制成本，不含窗口合成与真实 GPU 占用。

**变异检查（四层，只改 `/tmp` 副本，每次跑完核对仓库文件哈希与时间、并与镜像 `cmp`）**：

| 层 | 对象 | 变异体 | 结果 |
|---|---|---|---|
| Chrome 侧 JS 与工具 | `jelly-appearance.js`、`settings-jelly-appearance.js`、`appearance-contrast.mjs`、`png-decode.mjs`，以及 `jelly-desktop.js`、`background.js` 的外观接线行 | 806 | 全新跑一遍：存活 34（95.8%，22 个超时按杀死计）；补一条 PNG 尺寸上限边界测试后再跑相关变异体，存活 32（96.0%）。32 个存活：29 个等价或实际等价（见下），3 个是**没测的边界** |
| 渲染检查 | `appearance-looks.mjs` | 377 | 分三轮逐步补测试，最终存活 22（94.2%），已用最终版本的测试对存活者重跑确认；22 个均为等价或在该分辨率下观察不到 |
| Swift 纯逻辑 | `jelly-appearance.swift`、`jelly-paint.swift` | 214（7 个未通过编译） | 杀死 203，存活 4（98.1%），均为等价 |
| AppKit 绘制与接线 | `jelly-materials.swift`、`jelly-companion.swift`、`jelly-controller.swift`、`main.swift` 手写变异 | 23 | 第一轮 14/23（存活 9）；据此加了 `jellyTint` 诊断（核对 tint 始终等于 `paint.a`）、两个开着动态效果的冒烟场景（平静期换色立即到位、阶段色渐变过去），并给渲染检查补了七彩触须分段、顶部亮度层与描边三项，第二轮 21/23（91.3%）；存活 2 个见下 |

等价或实际等价的存活者（逐类说明，不是“看着不要紧”）：

- 随机数最后一步混合常量（`t >>> 14` 改成 13/15）：只影响输出的低 18 位，而取色、花纹、偏移只用最高几位，只有数值落在选择边界 2⁻¹⁴ 之内才会不同（约万分之一/次），金样本里的 12 个日期不会碰到；除数 4294967296 ±1、`rand() < 0.5` 改 `<=`（概率 2⁻³²）同理；七彩第三色方向符号：2 × 步长 2 = 4 = 八色环的一半，`+4` 与 `−4` 同色位。
- 设置页 `NEED.solid` 取 0/2（纯色分支从不读它）；纯色提前返回改成走通用分支（`b = c = a`，插值恒等）；触须取色分段点 0.5 改 0.4/0.6 或 `<` 改 `<=`（触须只有 u = 0、0.25、0.5、0.75、1 五个取样点，在 0.5 处两侧都等于第二色）；调色板读取的守卫（无效项之后同样被 `Array.isArray` 拒绝）。
- 对比度测量里 sRGB 线性化与 Lab 的分段阈值取 `<=`/`<`（两侧在阈值处连续）、外层循环上界多一轮（内层不再执行）、入口 `process.argv[1]` 真值守卫（只有 REPL 或 `node -e` 动态导入时才有区别，**没测**）。
- PNG 解码：只有没有 IHDR 时才用到的初始值（随后因 `depth !== 8` 先抛错，宽高、位深、颜色类型、隔行初值都观察不到）；循环多跑一行/一列写在缓冲区之外或被下一行覆盖；子数组结束下标多取几字节（只读前 `stride` 个）；Paeth 并列取舍（`pa <= pb` 改 `<`）对全部 256³ 个 (左, 上, 左上) 穷举，一个差异都没有。
- `jelly-desktop.js` 里 `if (appearance)` 改成 `if (true)`：没有外观数据源时调用 `undefined` 抛出的 TypeError 被紧随其后的 `try/catch` 吞掉，行为相同。
- **没测的边界**：`png-decode` 的上限常量降到 `1 << 25`、以及“恰好等于上限”改成 `<`——要验证需要真去解 128–256 MiB 的像素缓冲，单元测试里不做；已测“刚超出上限（8192×8193、8193×8192）也被拒绝”以及 10 万 × 10 万、1.3 亿行等；`appearance-contrast.mjs` 的 `argv[1]` 守卫如上。
- AppKit 层存活的 2 个：① 把口腕描边的颜色从 `oralTone` 改成主色 `paint.a`——**这是没有被任何自动检查观察到的真实盲区**（口腕与身体重叠、面积很小，渲染检查按区域取中位色取不到它；双色/渐变/七彩下口腕应用第二色这条规则只由 Swift 自测的数值与示意图的源码绊线守住，没有像素级验证）；② 去掉 `setAppearance` 里“相同外观不重复应用”的 `guard`——重复应用同一外观是幂等的，等价变异。
- 渲染检查的 22 个存活者：邻域对称遍历（`x + dx` 改 `x − dx` 访问同一集合）、数组越界读取得到 `undefined` 被当假值（循环多一轮）、整三分点上差一列的区域边界（区域内取中位数，该分辨率下观察不到）、`ceil(0.45 × 255)` 与 `ceil(0.45 × 254)` 同为 115、真值与 `1/2` 的差别、`return false`/`undefined`、入口守卫。

**HTTP 预览（真实 Chromium，只验版面）**：设置页卡片在深色主题下色板、花纹下拉、示意图、两个控件与按钮排列整齐，选中色带环。预览里没有真实后台，页面自带的消息桩返回空对象，所以默认状态行验证的是“后台响应不完整”这条路径（见下）；另在页面里临时装上**真实的 `js/jelly-appearance.js` 控制器（内存存储）**当消息桥，点“紫”、选“七彩”后，示意图变成紫/红/黄三色七彩，状态行“外观已应用到桌面水母”，文字“七彩（紫、红、黄，横向铺开）”。这只验证页面与控制器的接线和版面，不是真实扩展后台，也没有桌面组件。

**调色板观感**：8 色与 4 种花纹是用自家窗口截图合成到深/浅底色上逐张目测的（8 色可区分、双色/渐变/七彩可读），现在另有上面的自动测量与渲染检查；仍**没有测真实壁纸叠加**。

## 验证中发现并处理的问题

1. **设置页对“成功但没带设置”的响应会崩，并把内部报错显示给用户。** HTTP 预览里消息桩返回空对象，状态行显示 `Cannot read properties of undefined (reading 'color')`。已先补红灯测试（空对象、`ok:true` 无 `settings`、`settings:null`、`ok` 不是 `true`、别的成功字段，以及保存时同样），再让 `send` 只接受 `ok === true` 且带 `settings` 对象的响应，否则显示“后台返回的数据不完整”并让控件恢复可用。
2. **我自己 worktree 的环境把 31 项测试弄失败。** 首次全量 2407/2438：`compute.run` 沙箱测试因 `node --permission` 只读真实路径、而 `local-ai/node_modules` 是指向主仓库的软链而失败；`youtube-home` 缺 `youtubei.js` 包。先在主仓库跑同组测试（54/54 通过）确认与改动无关，再把两个 `node_modules` 换成 APFS 克隆（`cp -cR`，真实目录，被 `.gitignore` 覆盖），全量变为 2441/2441。克隆在 worktree 里、不在扩展目录，不影响 Chrome 重载。
3. **我曾误把共享的 `.git/info/exclude` 当成 worktree 私有**，往里写了一行 `local-ai/node_modules`，已撤回并核对该文件恢复原样。`info/exclude` 在所有 worktree 间共用，worktree 私有的排除需要 `core.excludesFile` 或 `extensions.worktreeConfig`。
4. 不带 `--test-force-exit` 时全量 `node --test` 会在某个留着句柄的测试文件处无限挂起（输出停在 `背景特效` 测试之后、CPU 为 0）；这是仓库已有现象，本次未排查具体文件。
5. **测试原先只测“不变量”，改常量、种子、边界都发现不了。** 第一轮变异检查暴露后补了金样本（12 个日期与 32 种手选组合的展开结果）、与首页水母共用常量的对照、随机源取边界值（0 与恰好 1）的测试和 `reroll` 逐个旧颜色的覆盖。
6. **PNG 解码器的一个循环变异体把高度读成 1.3 亿行，整套测试卡住。** 解码器现在先核对头部尺寸（上限 `1 << 26` 像素）再分配缓冲，损坏的头部报“图像尺寸异常”并带文件名，不去申请几个 GB 内存；对应测试覆盖 10 万 × 10 万、1.3 亿行、0 宽高以及刚超出上限的尺寸。
7. **渲染检查最初把睡着的 “z z” 标记算进身体包围盒**，“左/中/右三段”因此不是钟罩的三等分（真实截图里右边界 216 → 245）。改为只取最大的一块连通像素。
8. **旧的变异结果与当前源码对不上**（行号与变异体编号已漂移，不能直接引用）。因此用最终源码在新的镜像上整套重跑，并规定引用结果前先核对源文件时间与镜像 `cmp`。
9. **变异脚本曾残留孤儿进程。** 改为独立进程组启动、结束时按组发信号；变异检查只改 `/tmp` 里的副本，跑完逐个核对仓库文件哈希。AGENTS.md 里另有一次原地改写 Swift 文件被信号打断而残留变异体的教训，这里沿用同一条规则。

## 已知边界与未做

- **带真实鼠标的冒烟没跑**（只跑了 `--no-mouse`）：会移动用户的真实指针，需要用户礼让；外观改动不涉及鼠标交互，但这是没有验证的层。
- 材质（`gummy/plush/wire/pencil/pixel`）、尺寸（`small/medium/large`）、节日换装（`seasonal`）与 `daily` 之外的右键菜单入口**都只在设置模型里解析并保存，原生端这一轮不绘制**：`painter(for:)` 总是返回 `GlassPainter`。设置页卡片文案已如实写“材质与尺寸会在后续版本加入”。
- 新物种：**小锤头鲨已在其后的 Step A 实现**（见 `docs/technical/jelly-species-hammer-20261018.md`）；蝠鲼、海龟、鲸鲨只有设计稿与草图，**没有实现**（Step B/C/D，一次一只）。本文其余部分描述的是 S1a 提交时的状态，其中的测试数量与冒烟场景数是当时的数字。
- 水母没有常驻时设置页没有实时预览，只保存，下次出现时按设置显示；示意图是静态示意，页面如实说明。
- 旧桌面组件（不回 `appearance`）下，设置已保存但不会生效，设置页提示更新组件并重载扩展；更新后自动生效。
- 渲染检查只在白天、浅色外观、玻璃材质、中号下测过；夜晚、深色外观和后续材质/尺寸要各补一组。
- 对比度与帧耗时是自家窗口离屏/截图口径，不含真实壁纸叠加与 WindowServer 合成；黄色在浅色壁纸上对比度最低（白底 1.21）是已知事实，未改调色板。
- 变异检查的存活者里有 3 个没测的边界（PNG 上限的两侧、`argv[1]` 守卫），原因与取舍见上；AppKit 层只做了 23 个手写变异，不是穷举。
- 未验收：真实 Chrome 156 与真实账号（含过午夜自动换一只）、重装后的真实桌面组件与重载扩展（由用户做）、多显示器、全屏 Space、Stage Manager、真实壁纸叠加下 8 色的辨识度、VoiceOver。验收入口：设置页打开“桌面水母常驻”后在“桌面水母形象”里改色与花纹，观察桌面水母。
- 待用户决定：节日换装（现有每年节日装扮）是否保留；是否增加第 7 种粒子材质。
