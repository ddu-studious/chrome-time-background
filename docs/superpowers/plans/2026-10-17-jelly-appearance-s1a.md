# 桌面水母形象系统 S1a 实现计划（颜色、花纹、下发与回执探测、设置页）

> **执行方式：** 本项目禁止使用子代理（`.cursor/rules/no-subagent.mdc`），用 `superpowers:executing-plans` 在当前会话内逐任务执行。步骤用 `- [ ]` 勾选。**本计划不含 `git commit` 步骤**（项目规则：未经用户要求不提交）；每个任务结束用 `git diff --stat` 记录范围，是否提交由用户决定。

**Goal:** 桌面水母可选 8 种颜色与 4 种花纹（纯色/双色/渐变/七彩），支持“随机”“每天换一只”；Chrome 解析成具体值经 `jelly` 命令下发，原生只绘制；默认外观与重构前逐像素一致。

**Architecture:** Chrome 侧新增纯逻辑模块 `js/jelly-appearance.js`（规范化、按日期/种子解析、reroll、串行存储控制器），存储键独立（`desktopJellyAppearanceV1`），经 `JellyDesktop` 的一个可选 `appearance` 数据源挂进现有 `jelly` 下发；原生新增纯逻辑 `jelly-appearance.swift` 与 AppKit `jelly-materials.swift`（`JellyPainter` 协议 + `GlassPainter`，把现有钟罩/触手/脸的画法原样搬入并按花纹取色）。**协议版本不变（仍 v7）**，能力经 `jelly` 回执里的 `appearance:{status:'ok'}` 探测。

**Tech Stack:** 原生 JavaScript（UMD，`node --test`）；Swift 5.8 + AppKit（`xcrun swiftc`，无第三方库）；验收脚本为 Node ESM（`desktop-reminder/*.mjs`）。

**范围外（见设计稿 `docs/superpowers/specs/2026-10-17-jelly-appearance-design.md`）：** 尺寸（S1b，气泡锚点需随倍率上移）、材质（S2/S3）、节日（S4）、右键“换一只”与材质/尺寸子菜单（S2）。`appearance.material`、`size`、`seasonal` 的**存储与下发字段本轮就定义**（后续档位不再改协议），但原生本轮只按 `glass` + 中号绘制，`material/size/season` 解析后不影响画面。

## Global Constraints

- 回复与文档用中文（代码标识符除外）；不使用子代理；不提交 Git；不发布；保留与本任务无关的改动。
- 在 worktree `~/worktrees/ctb-jelly-appearance`（分支 `feat/jelly-appearance`，起点 `a327fd0`）里开发；**不得**在主工作目录改文件。另有并行 worktree `ctb-aquarium`、`ctb-jelly-errands`，互不触碰。
- **不升协议版本**（`desktop-reminder/main.swift` 的 `"version": 7` 与 `test/desktop-companion-logic.test.mjs` 对它的断言保持不变）；“水母差事”已占 v8。
- 不新增依赖、权限、网络、摄像头/麦克风/`chrome.idle`；不改闹钟、倒计时、喝水提醒、桌面 AI 助手的业务。
- **Chrome 是唯一设置所有者**：原生不另存外观；外观读取失败时 Chrome 的 `jelly` 下发**不带** `appearance`，原生**保持上一次**（不回到默认）；原生进程新启动时是默认外观。
- 存储键 `desktopJellyAppearanceV1` 独立于 `desktopJellyV1`（旧版本 `JellyDesktop.normalize` 只保留 `resident/night`，放进去会被旧版本抹掉）。
- 色位 0–7 的**色相顺序**与首页 `JellyfishSkin.PALETTE` 一致（红、橙、黄、绿、薄荷、冰蓝、紫、洋红）；桌面调色板色位 5 必须**恰好**等于现有平静色 `(0.40, 0.74, 0.90)`。
- 花纹语义与首页 `jellyfish.js` 的 `paintOf`/`tentacleTone` 一致：`solid` 全一色；`duo` 钟罩主色、触须第二色；`blend` 钟罩边缘主色→中心第二色；`rainbow` 三色沿钟罩横向铺开。偏移常量与首页 `PARAMS` 相同：`DUO_OFFSETS=[2,3,4]`、`BLEND_OFFSETS=[2]`、`RAINBOW_STEP=2`。
- 倒计时阶段色**覆盖**自选色：`calm` 用自选，其余阶段整只平滑过渡成阶段色（沿用现有每次 `syncPose` 向目标靠近 0.12、减少动态效果时直接到位的路径），结束后回到自选色；外观改变时若处于 `calm` **立即到位**（不等慢速收敛）。
- “减少动态效果”下行为不变；气泡调色板与对比度自测不受影响。
- 新增原生源文件必须同步 `desktop-reminder/build.mjs` 的 `sources` 清单、`test/desktop-companion-logic.test.mjs` 里的清单断言与自测编译命令。
- `js/background.js` 里 `userAlarmSaveQueue` 到 `getUserAlarmViewState` 之间的代码会被 `test/assistant-management.test.js` 截取沙箱执行，本计划只在 `jellyDesktop`/`jellyNudge` 接线处（该片段之外）改动。
- 隔离验收：独立构建 `--app=/tmp/tk/QA.app`（Bundle ID `com.timekeeper.desktop.qa`）；`--extension-id` 任意合法的 32 位 a–p 串即可（`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`）；禁止整屏/区域截图，只 `screencapture -l <自家窗口号>`；测试钩子仅在 `TIMEKEEPER_TEST_HOOKS=1` 时可用；`TIMEKEEPER_REDUCE_MOTION=1` 让画面静止（只用于测试）。
- 临时产物放 `/tmp`，不放仓库（worktree 虽在扩展目录之外，也保持习惯）。
- 与其他并行分支的合并点（改动要小而集中，计划里已按此设计）：`js/jelly-desktop.js` 的 `create`/`push`、`desktop-reminder/main.swift` 的 `case "jelly"`、`build.mjs` 的 `sources`、`test/desktop-companion-logic.test.mjs` 的清单断言、`settings.html`/`AGENTS.md`/各 `_index.md`。

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `js/jelly-appearance.js` | 新建 | 纯逻辑：常量、`normalize`、`resolve`、`reroll`；控制器 `create`（串行存储、`get/set/rerollNow/payload`） |
| `test/jelly-appearance.test.js` | 新建 | 上面模块的单测 |
| `js/jelly-desktop.js` | 小改 | `create` 增加可选 `appearance` 数据源；`push` 带 `appearance`；回执探测 `appearanceStatus()` |
| `test/jelly-appearance-desktop.test.js` | 新建 | 下发、探测、读取失败降级（不改现有 `jelly-desktop.test.js`，减少合并冲突） |
| `js/background.js` | 小改 | `importScripts` 加载、创建控制器、接线、`jelly_appearance_get/set/reroll` 消息 |
| `test/jelly-appearance-integration.test.js` | 新建 | 后台接线与源码扫描（无 `innerHTML`/网络/`importScripts` 顺序） |
| `desktop-reminder/jelly-appearance.swift` | 新建 | 纯逻辑：`JellyAppearance` 解析（白名单）、8 色调色板、色相计算 |
| `desktop-reminder/jelly-materials.swift` | 新建 | AppKit：`JellyPaint`、`JellyPainter` 协议、`GlassPainter` |
| `desktop-reminder/jelly-companion.swift` | 改 | 钟罩/触手/脸交给 painter；`JellyPose.paint`；`setAppearance`；阶段覆盖 |
| `desktop-reminder/jelly-controller.swift` | 改 | `setAppearance(_:)` 转交；`ping` 诊断 |
| `desktop-reminder/main.swift` | 小改 | `case "jelly"` 里解析 `appearance` 并在回执带 `appearance:{status:'ok'}`；`ping` 回执字段 |
| `desktop-reminder/build.mjs` | 小改 | `sources` 加两个文件 |
| `desktop-reminder/companion-selftest.swift` | 改 | 解析与调色板自测，打印对照行 |
| `test/desktop-companion-logic.test.mjs` | 改 | 清单断言、与 JS 对照（色相顺序、解析） |
| `desktop-reminder/appearance-snapshot.mjs` | 新建 | 隔离构建下截自家窗口 PNG，并做逐像素比较（基线闸门） |
| `desktop-reminder/appearance-smoke.mjs` | 新建 | 隔离冒烟：下发外观、阶段覆盖、读取失败保持、回执探测 |
| `js/settings-jelly-appearance.js` + `settings.html` | 新建/小改 | 设置页“形象”卡片（颜色色板、花纹、随机、每天换） |
| `test/jelly-appearance-settings.test.js` | 新建 | 设置页合同（ID、无内联处理器、消息动作） |
| `docs/technical/jelly-appearance-20261017.md`、`AGENTS.md`、各 `_index.md` | 新建/改 | 技术文档与项目说明同步 |

---

### Task 0: 基线截图（必须在改任何 Swift 之前做）

**Files:**
- Create: `desktop-reminder/appearance-snapshot.mjs`

**Interfaces:**
- Produces: `node desktop-reminder/appearance-snapshot.mjs --app=<app> --out=<dir>` 在 `<dir>` 写出 `calm-light.png`、`calm-dark.png`、`night-light.png`、`night-dark.png`；`node desktop-reminder/appearance-snapshot.mjs --compare=<dirA>,<dirB>` 逐像素比较两个目录，全部相同退出码 0，否则打印哪一张、第一个不同像素的位置与差值并退出 1。

- [ ] **Step 1: 写脚本**

```js
// 外观基线：在隔离构建里让水母静止（TIMEKEEPER_REDUCE_MOTION=1）、无气泡，只截水母自己的窗口（screencapture -l），
// 用来证明“重构后默认外观与重构前逐像素一致”。不连接 Chrome，不读写任何闹钟或喝水记录，不操作键盘鼠标。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-base
//   node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-after
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const EXTENSION_ID = 'a'.repeat(32);

function decodePng(file) {
  const data = readFileSync(file);
  let offset = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0; const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset), type = data.toString('latin1', offset + 4, offset + 8), body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colorType = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`${file}：只支持 8 位 RGBA 无隔行 PNG`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0, up = y > 0 ? pixels[(y - 1) * stride + x] : 0, upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predict = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1
        : (() => { const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; })();
      pixels[y * stride + x] = (line[x] + predict) & 255;
    }
  }
  return { width, height, pixels };
}

function compareDirs(a, b) {
  const names = readdirSync(a).filter(n => n.endsWith('.png')).sort();
  if (!names.length) throw new Error(`${a} 里没有 PNG`);
  let bad = 0;
  for (const name of names) {
    const left = decodePng(resolve(a, name)), right = decodePng(resolve(b, name));
    if (left.width !== right.width || left.height !== right.height) { bad++; console.log(`✗ ${name}：尺寸不同 ${left.width}×${left.height} 对 ${right.width}×${right.height}`); continue; }
    let first = -1, maxDiff = 0, count = 0;
    for (let i = 0; i < left.pixels.length; i++) {
      const diff = Math.abs(left.pixels[i] - right.pixels[i]);
      if (diff) { count++; maxDiff = Math.max(maxDiff, diff); if (first < 0) first = i; }
    }
    if (count) { bad++; const px = Math.floor(first / 4); console.log(`✗ ${name}：${count} 个字节不同，最大差 ${maxDiff}，首个在 (${px % left.width}, ${Math.floor(px / left.width)})`); }
    else console.log(`✓ ${name}：逐像素一致`);
  }
  process.exit(bad ? 1 : 0);
}

function start(app, env) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${EXTENSION_ID}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', TIMEKEEPER_REDUCE_MOTION: '1', ...env } });
  const host = { child, pending: new Map(), seq: 0, buffer: Buffer.alloc(0) };
  child.stdout.on('data', chunk => {
    host.buffer = Buffer.concat([host.buffer, chunk]);
    while (host.buffer.length >= 4 && host.buffer.length >= host.buffer.readUInt32LE(0) + 4) {
      const size = host.buffer.readUInt32LE(0);
      const message = JSON.parse(host.buffer.subarray(4, size + 4)); host.buffer = host.buffer.subarray(size + 4);
      if (host.pending.has(message.requestId)) { host.pending.get(message.requestId)(message); host.pending.delete(message.requestId); }
    }
  });
  host.request = (command, payload = {}) => new Promise((ok, fail) => {
    const requestId = String(++host.seq);
    const timeout = setTimeout(() => { host.pending.delete(requestId); fail(new Error(`原生组件超时: ${command}`)); }, 5000);
    host.pending.set(requestId, value => { clearTimeout(timeout); ok(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
  host.stop = async () => { await host.request('jelly', { jelly: { resident: false } }).catch(() => {}); child.stdin.end(); await delay(300); child.kill(); };
  return host;
}

async function capture(host, file) {
  const deadline = Date.now() + 4000;
  let reply;
  do { reply = await host.request('ping'); if (reply.jellyVisible) break; await delay(100); } while (Date.now() < deadline);
  if (!reply.jellyVisible) throw new Error('水母没有出现');
  await delay(900);
  const windowNumber = (await host.request('ping')).countdownWindowNumber;
  for (let attempt = 0; attempt < 3; attempt++) {
    rmSync(file, { force: true });
    try { execFileSync('/usr/sbin/screencapture', ['-x', '-o', `-l${windowNumber}`, file], { stdio: 'pipe' }); } catch { /* 重试 */ }
    try { if (readFileSync(file).readUInt32BE(16) > 16) return; } catch { /* 重试 */ }
    await delay(500);
  }
  throw new Error(`screencapture 没有取到窗口 ${windowNumber}`);
}

if (arg('compare')) { const [a, b] = arg('compare').split(','); compareDirs(a, b); }
else {
  const app = arg('app'), out = arg('out');
  if (!app || !out) throw new Error('需要 --app=隔离构建 与 --out=输出目录（或 --compare=A,B）');
  mkdirSync(out, { recursive: true });
  const appearance = process.argv.includes('--with-default-appearance') ? { appearance: { color: 5, colors: [5], look: 'solid', material: 'glass', size: 'medium', season: null } } : {};
  for (const [name, env, night] of [['calm-light', { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '12' }, false], ['calm-dark', { TIMEKEEPER_APPEARANCE: 'dark', TIMEKEEPER_NIGHT_HOUR: '12' }, false],
    ['night-light', { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '23' }, true], ['night-dark', { TIMEKEEPER_APPEARANCE: 'dark', TIMEKEEPER_NIGHT_HOUR: '23' }, true]]) {
    const host = start(app, env);
    try {
      const reply = await host.request('jelly', { jelly: { resident: true, night, lines: [], linesUntil: 0, ...appearance } });
      if (reply.ok !== true) throw new Error(`jelly 被拒绝：${JSON.stringify(reply)}`);
      await capture(host, resolve(out, `${name}.png`));
      console.log(`✓ ${name}`);
    } finally { await host.stop(); }
  }
}
```

- [ ] **Step 2: 语法检查**

Run: `cd ~/worktrees/ctb-jelly-appearance && node --check desktop-reminder/appearance-snapshot.mjs`
Expected: 无输出，退出码 0。

- [ ] **Step 3: 构建隔离基线并截图（此时 Swift 源码尚未改动）**

```bash
cd ~/worktrees/ctb-jelly-appearance
git status --short desktop-reminder/*.swift   # 必须为空
mkdir -p /tmp/tk
node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA-base.app
node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA-base.app --out=/tmp/tk/appearance-base
```
Expected: 四行 `✓ calm-light / calm-dark / night-light / night-dark`，`/tmp/tk/appearance-base/` 下 4 张 PNG。若提示没有屏幕录制权限，停下来请用户在终端授权，**不得改用整屏截图**。

- [ ] **Step 4: 确认截图稳定（同一构建连拍两次应逐像素一致，否则基线没有意义）**

```bash
node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA-base.app --out=/tmp/tk/appearance-base2
node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-base2
```
Expected: 四行 `✓ … 逐像素一致`。若不一致（动画时间、抖动），先查是哪个字节在变、是否 `TIMEKEEPER_REDUCE_MOTION` 没冻住 `clockTime`，**修到稳定为止再继续**，不要放宽比较。

- [ ] **Step 5: 记录范围**

Run: `git diff --stat; git status --short`
Expected: 只多一个未跟踪文件 `desktop-reminder/appearance-snapshot.mjs`。

---

### Task 1: Chrome 侧外观核心（纯逻辑）

**Files:**
- Create: `js/jelly-appearance.js`
- Test: `test/jelly-appearance.test.js`

**Interfaces:**
- Produces（`JellyAppearance`，UMD；浏览器全局 `JellyAppearance`，Node 为 `require('../js/jelly-appearance.js')`）：
  - 常量：`KEY = 'desktopJellyAppearanceV1'`、`COLORS = 8`、`LOOKS`、`MATERIALS`、`SIZES`、`DEFAULTS`
  - `normalize(raw) → { color, look, material, size, seasonal, daily }`
  - `resolve(settings, { date }) → { color, colors, look, material, size, season: null }`
  - `reroll(settings, random) → settings`（换成不同颜色与随机花纹，并关闭 `daily`）
  - `create({ storage, onChange, now, random }) → { get, set, rerollNow, payload }`

- [ ] **Step 1: 写失败的测试**

```js
// 桌面水母形象：设置规范化、解析成具体值（含按日期稳定的“每天换一只”）、reroll、串行存储控制器。
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/jelly-appearance.js');
const Core = require('../js/jellyfish-core.js');

function area(initial = {}) {
  const data = { ...initial }; const writes = [];
  return {
    data, writes,
    get: async key => (typeof key === 'string' ? { [key]: data[key] } : { ...data }),
    set: async items => { writes.push(items); Object.assign(data, JSON.parse(JSON.stringify(items))); },
  };
}
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

test('常量与首页水母一致：色位数与花纹种类', () => {
  assert.equal(A.COLORS, Core.PARAMS.COLORS);
  assert.deepEqual([...A.LOOKS], [...Core.PARAMS.LOOKS]);
  assert.equal(A.KEY, 'desktopJellyAppearanceV1');
});

test('默认值：玻璃、冰蓝（色位 5）、纯色、中号，节日与每天换都关', () => {
  assert.deepEqual(A.normalize(undefined), { color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false });
  assert.deepEqual(A.normalize(null), A.normalize({}));
  assert.deepEqual(A.normalize('x'), A.normalize({}));
});

test('normalize：非法字段各自回到默认，不影响其他字段', () => {
  const s = A.normalize({ color: 8, look: 'stripe', material: 'gummy', size: 'huge', seasonal: 'yes', daily: 1 });
  assert.equal(s.color, 5); assert.equal(s.look, 'solid'); assert.equal(s.material, 'gummy'); assert.equal(s.size, 'medium');
  assert.equal(s.seasonal, false); assert.equal(s.daily, false);
  assert.equal(A.normalize({ color: 2.5 }).color, 5);
  assert.equal(A.normalize({ color: true }).color, 5);
  assert.equal(A.normalize({ color: -1 }).color, 5);
  assert.equal(A.normalize({ color: 0 }).color, 0);
  assert.equal(A.normalize({ seasonal: true, daily: true }).seasonal, true);
});

test('resolve：纯色只有主色；duo/blend 第二色相隔 DUO/BLEND 偏移；rainbow 三色相隔 2 个色位', () => {
  const date = new Date(2026, 9, 17);
  assert.deepEqual(A.resolve({ color: 3, look: 'solid' }, { date }).colors, [3]);
  const duo = A.resolve({ color: 3, look: 'duo' }, { date }).colors;
  assert.equal(duo.length, 2); assert.equal(duo[0], 3);
  assert.ok([2, 3, 4].includes(Math.min((duo[1] - 3 + 8) % 8, (3 - duo[1] + 8) % 8)));
  const blend = A.resolve({ color: 6, look: 'blend' }, { date }).colors;
  assert.equal(Math.min((blend[1] - 6 + 8) % 8, (6 - blend[1] + 8) % 8), 2);
  const rainbow = A.resolve({ color: 1, look: 'rainbow' }, { date }).colors;
  assert.equal(rainbow.length, 3); assert.equal(rainbow[0], 1);
  const step = (rainbow[1] - 1 + 8) % 8;
  assert.ok(step === 2 || step === 6);
  assert.equal((rainbow[2] - rainbow[1] + 8) % 8, step);
  for (const c of [...duo, ...blend, ...rainbow]) assert.ok(Number.isInteger(c) && c >= 0 && c < 8);
});

test('resolve：同样的设置总得到同样的结果（重启、重连后外观稳定，不靠存储第二色）', () => {
  const date = new Date(2026, 9, 17);
  for (const look of A.LOOKS) for (let color = 0; color < 8; color++) {
    assert.deepEqual(A.resolve({ color, look }, { date }), A.resolve({ color, look }, { date: new Date(2030, 0, 1) }));
  }
});

test('resolve：负载只有下发字段，season 本轮恒为 null，material/size 原样带上', () => {
  const out = A.resolve({ color: 4, look: 'solid', material: 'wire', size: 'large', seasonal: true }, { date: new Date(2026, 9, 17) });
  assert.deepEqual(Object.keys(out).sort(), ['color', 'colors', 'look', 'material', 'season', 'size']);
  assert.equal(out.season, null); assert.equal(out.material, 'wire'); assert.equal(out.size, 'large');
});

test('daily：同一天稳定、不同天会变；忽略存储的 color/look，保留 material/size', () => {
  const a = A.resolve({ daily: true, color: 0, look: 'solid', material: 'plush', size: 'small' }, { date: new Date(2026, 9, 17, 3) });
  const b = A.resolve({ daily: true, color: 7, look: 'rainbow', material: 'plush', size: 'small' }, { date: new Date(2026, 9, 17, 23) });
  assert.deepEqual(a, b, '同一天（不论几点、存了什么颜色）结果相同');
  assert.equal(a.material, 'plush'); assert.equal(a.size, 'small');
  const seen = new Set();
  for (let day = 1; day <= 60; day++) { const r = A.resolve({ daily: true }, { date: new Date(2026, 9, day) }); seen.add(`${r.color}/${r.look}`); }
  assert.ok(seen.size >= 10, `60 天里应有足够多样的组合，实际 ${seen.size}`);
});

test('reroll：总换成不同的颜色，花纹随机，关闭 daily，保留 material/size/seasonal', () => {
  const base = { color: 5, look: 'solid', material: 'gummy', size: 'large', seasonal: true, daily: true };
  for (let i = 0; i < 8; i++) {
    const r = A.reroll(base, seq(i / 8, 0.5));
    assert.notEqual(r.color, 5, `第 ${i} 次抽到了相同颜色`);
    assert.ok(r.color >= 0 && r.color < 8); assert.ok(A.LOOKS.includes(r.look));
    assert.equal(r.daily, false); assert.equal(r.material, 'gummy'); assert.equal(r.size, 'large'); assert.equal(r.seasonal, true);
  }
  assert.notEqual(A.reroll({ color: 5 }, () => 0.999999).color, 5);
});

test('控制器 get：缺失键给默认，同时给出解析后的具体值', async () => {
  const storage = area();
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  const got = await c.get();
  assert.equal(got.ok, true);
  assert.deepEqual(got.settings, A.normalize({}));
  assert.deepEqual(got.resolved, A.resolve({}, { date: new Date(2026, 9, 17) }));
  assert.equal(storage.writes.length, 0, '读取不写存储');
});

test('控制器 set：只认已知字段并校验取值，未知键丢弃，非法值整体拒绝且不写', async () => {
  const storage = area(); const changes = [];
  const c = A.create({ storage, onChange: () => changes.push(1), now: () => new Date(2026, 9, 17) });
  const ok = await c.set({ color: 2, look: 'duo', bogus: 1 });
  assert.equal(ok.ok, true); assert.equal(ok.settings.color, 2); assert.equal(ok.settings.look, 'duo');
  assert.deepEqual(storage.data[A.KEY], { color: 2, look: 'duo', material: 'glass', size: 'medium', seasonal: false, daily: false });
  assert.equal(changes.length, 1);
  for (const bad of [{ color: 9 }, { color: '1' }, { look: 'x' }, { material: 'metal' }, { size: 'xl' }, { seasonal: 'true' }, { daily: 0 }, null, [], 'x']) {
    const writes = storage.writes.length;
    const r = await c.set(bad);
    assert.equal(r.ok, false, JSON.stringify(bad)); assert.equal(storage.writes.length, writes, '非法输入不写存储');
  }
  assert.equal(changes.length, 1, '失败不触发 onChange');
});

test('控制器 rerollNow：写入具体值并触发 onChange；payload 与 resolve 一致', async () => {
  const storage = area({ [A.KEY]: { color: 5, look: 'solid', daily: true } }); const changes = [];
  const c = A.create({ storage, onChange: () => changes.push(1), now: () => new Date(2026, 9, 17), random: seq(0.1, 0.9) });
  const r = await c.rerollNow();
  assert.equal(r.ok, true); assert.notEqual(r.settings.color, 5); assert.equal(r.settings.daily, false);
  assert.equal(changes.length, 1);
  assert.deepEqual(await c.payload(), A.resolve(storage.data[A.KEY], { date: new Date(2026, 9, 17) }));
});

test('控制器：并发的 set 串行执行，后一个在前一个结果上合并（不丢更新）', async () => {
  const storage = area();
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  await Promise.all([c.set({ color: 1 }), c.set({ look: 'blend' }), c.set({ daily: true })]);
  assert.deepEqual(storage.data[A.KEY], { color: 1, look: 'blend', material: 'glass', size: 'medium', seasonal: false, daily: true });
});

test('控制器：onChange 抛错或返回被拒绝的 Promise 都不影响保存', async () => {
  const storage = area();
  const c1 = A.create({ storage, onChange: () => { throw new Error('boom'); } });
  assert.equal((await c1.set({ color: 3 })).ok, true);
  const c2 = A.create({ storage, onChange: () => Promise.reject(new Error('boom')) });
  assert.equal((await c2.set({ color: 4 })).ok, true);
  assert.equal(storage.data[A.KEY].color, 4);
});

test('读取到损坏的存储值：按默认处理，不抛错也不覆盖原值', async () => {
  const storage = area({ [A.KEY]: 'garbage' });
  const c = A.create({ storage, now: () => new Date(2026, 9, 17) });
  assert.deepEqual((await c.get()).settings, A.normalize({}));
  assert.equal(storage.writes.length, 0);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd ~/worktrees/ctb-jelly-appearance && node --test test/jelly-appearance.test.js 2>&1 | tail -8`
Expected: FAIL，`Cannot find module '../js/jelly-appearance.js'`。

- [ ] **Step 3: 实现**

```js
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellyAppearance = api;
})(globalThis, function () {
  'use strict';

  // 桌面水母的外观设置（颜色、花纹、材质、尺寸、节日、每天换一只）。
  //  · Chrome 是唯一的设置所有者：这里把设置解析成**具体值**交给原生端，原生端不另存、不做随机；
  //  · 存储键独立于 desktopJellyV1：旧版本的 JellyDesktop.normalize 只保留 resident/night，放进去会被旧版本抹掉；
  //  · 花纹语义与首页水母（js/jellyfish-core.js 的 pickLook、js/jellyfish.js 的 paintOf）一致，偏移常量相同；
  //  · 本模块不碰 DOM、网络、权限，随机数与时间都可注入。设计见 docs/superpowers/specs/2026-10-17-jelly-appearance-design.md。

  const KEY = 'desktopJellyAppearanceV1';
  const COLORS = 8;
  const LOOKS = Object.freeze(['solid', 'duo', 'blend', 'rainbow']);
  const MATERIALS = Object.freeze(['glass', 'gummy', 'plush', 'wire', 'pencil', 'pixel']);
  const SIZES = Object.freeze(['small', 'medium', 'large']);
  const DUO_OFFSETS = Object.freeze([2, 3, 4]);
  const BLEND_OFFSETS = Object.freeze([2]);
  const RAINBOW_STEP = 2;
  const DEFAULTS = Object.freeze({ color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false });
  const VALIDATORS = Object.freeze({
    color: value => Number.isInteger(value) && value >= 0 && value < COLORS,
    look: value => LOOKS.includes(value),
    material: value => MATERIALS.includes(value),
    size: value => SIZES.includes(value),
    seasonal: value => typeof value === 'boolean',
    daily: value => typeof value === 'boolean',
  });

  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const wrap = color => ((color % COLORS) + COLORS) % COLORS;

  /** 规范化：每个字段各自校验，非法值回到默认，不影响其他字段。 */
  function normalize(raw) {
    const source = isObject(raw) ? raw : {};
    const out = {};
    for (const key of Object.keys(DEFAULTS)) out[key] = VALIDATORS[key](source[key]) ? source[key] : DEFAULTS[key];
    return out;
  }

  /** 32 位种子的小型伪随机数（mulberry32）：结果只取决于种子，所以同一天、同一设置总得到同一外观。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const dateSeed = date => date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const pickIndex = (rand, length) => Math.min(length - 1, Math.floor(rand() * length));

  /** 按花纹把主色展开成 1…3 个色位；方向与偏移由 rand 决定（调用方保证 rand 是确定的）。 */
  function colorsFor(color, look, rand) {
    const sign = rand() < 0.5 ? 1 : -1;
    const choose = list => list[pickIndex(rand, list.length)];
    if (look === 'duo') return [color, wrap(color + sign * choose(DUO_OFFSETS))];
    if (look === 'blend') return [color, wrap(color + sign * choose(BLEND_OFFSETS))];
    if (look === 'rainbow') return [color, wrap(color + sign * RAINBOW_STEP), wrap(color + sign * RAINBOW_STEP * 2)];
    return [color];
  }

  /**
   * 设置 → 下发给原生端的具体值。daily 为 true 时颜色与花纹由本地日期决定（同一天不变，忽略存储的 color/look）；
   * 否则第二、第三色由“主色 + 花纹”确定性算出，所以不需要存储它们，重启与重连后外观不会变。
   * season 本轮恒为 null（节日是 S4）。
   */
  function resolve(settings, { date = new Date() } = {}) {
    const s = normalize(settings);
    let color = s.color, look = s.look, rand;
    if (s.daily) {
      rand = mulberry32(dateSeed(date));
      color = pickIndex(rand, COLORS);
      look = LOOKS[pickIndex(rand, LOOKS.length)];
    } else {
      rand = mulberry32(color * 16 + LOOKS.indexOf(look) + 1);
    }
    return { color, colors: colorsFor(color, look, rand), look, material: s.material, size: s.size, season: null };
  }

  /** “随机”：换成**不同**的颜色与随机花纹，并关闭“每天换”（用户明确选了一只）；其余字段保留。 */
  function reroll(settings, random = Math.random) {
    const s = normalize(settings);
    let color = pickIndex(random, COLORS);
    if (color === s.color) color = wrap(color + 1 + Math.floor(random() * (COLORS - 1)));
    const look = LOOKS[pickIndex(random, LOOKS.length)];
    return { ...s, color, look, daily: false };
  }

  /**
   * storage：chrome.storage.local；onChange：保存后调用（后台据此让 JellyDesktop 重新下发），抛错或返回被拒绝的 Promise 都不影响保存。
   * 所有写入经同一条串行队列“先读最新值再改”，并发的设置互不覆盖。
   */
  function create({ storage, onChange = null, now = () => new Date(), random = Math.random }) {
    let queue = Promise.resolve();
    const serial = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
    const read = async () => normalize((await storage.get(KEY))[KEY]);
    const view = settings => ({ ok: true, settings, resolved: resolve(settings, { date: now() }) });
    const notify = () => { try { Promise.resolve(onChange?.()).catch(() => {}); } catch (_) { /* 回调失败不影响保存 */ } };

    const get = async () => view(await read());
    const payload = async () => resolve(await read(), { date: now() });
    const set = patch => {
      if (!isObject(patch)) return Promise.resolve({ ok: false, error: '外观设置格式不正确' });
      const next = {};
      for (const key of Object.keys(DEFAULTS)) {
        if (!has(patch, key)) continue;
        if (!VALIDATORS[key](patch[key])) return Promise.resolve({ ok: false, error: `${key} 的取值无效` });
        next[key] = patch[key];
      }
      return serial(async () => {
        const settings = { ...(await read()), ...next };
        await storage.set({ [KEY]: settings });
        notify();
        return view(settings);
      });
    };
    const rerollNow = () => serial(async () => {
      const settings = reroll(await read(), random);
      await storage.set({ [KEY]: settings });
      notify();
      return view(settings);
    });
    return { get, set, rerollNow, payload };
  }

  return { KEY, COLORS, LOOKS, MATERIALS, SIZES, DEFAULTS, normalize, resolve, reroll, create };
});
```

- [ ] **Step 4: 运行，确认通过**

Run: `node --test test/jelly-appearance.test.js 2>&1 | tail -12`
Expected: 全部 `✔`，`fail 0`。

- [ ] **Step 5: 语法检查与范围记录**

Run: `node --check js/jelly-appearance.js && git diff --stat && git status --short`
Expected: 新增 `js/jelly-appearance.js`、`test/jelly-appearance.test.js`（未跟踪）。

---

### Task 2: 接入 JellyDesktop 下发与回执探测

**Files:**
- Modify: `js/jelly-desktop.js`（`create` 参数、`push`、`onPortLost`、`api`）
- Test: `test/jelly-appearance-desktop.test.js`（新建）

**Interfaces:**
- Consumes: Task 1 的 `JellyAppearance.create(...).payload()`
- Produces: `JellyDesktop.create({ ..., appearance })`，`appearance` 是 `() => Promise<object|null>`；`api.appearanceStatus() → 'off'|'ok'|'unsupported'|'unknown'`；`jelly` 命令负载可能多一个 `appearance` 字段。

- [ ] **Step 1: 写失败的测试**

```js
// 外观下发：JellyDesktop 在每次 jelly 下发里带 appearance；回执里有 appearance.status==='ok' 才算组件支持；
// 读取外观失败只影响外观（不带该字段），水母照常下发。
const test = require('node:test');
const assert = require('node:assert/strict');
const Jelly = require('../js/jelly-desktop.js');

function area(initial = {}) {
  const data = { ...initial };
  return { data, get: async key => (typeof key === 'string' ? { [key]: data[key] } : Array.isArray(key) ? Object.fromEntries(key.map(k => [k, data[k]])) : { ...data }), set: async items => { Object.assign(data, JSON.parse(JSON.stringify(items))); } };
}
function desktopStub({ reply = {} } = {}) {
  const calls = [];
  const desktop = {
    calls, port: null,
    setResident() {},
    async setJelly(jelly) { calls.push(jelly); if (desktop.fail) throw new Error(desktop.fail); desktop.port = desktop.port || { fake: true }; return { ok: true, version: 7, ...reply }; },
    async showNudge() { return { ok: true, version: 7 }; },
    clearNudge() {},
  };
  return desktop;
}
const make = ({ appearance, reply, storage = { desktopJellyV1: { resident: true } } } = {}) => {
  const desktop = desktopStub({ reply });
  const jelly = Jelly.create({ storage: area(storage), desktop, appearance, setTimer: () => ({}), clearTimer: () => {} });
  return { jelly, desktop };
};
const PAYLOAD = { color: 2, colors: [2], look: 'solid', material: 'glass', size: 'medium', season: null };

test('下发带 appearance，且原有字段不变', async () => {
  const { jelly, desktop } = make({ appearance: async () => PAYLOAD });
  await jelly.sync();
  assert.equal(desktop.calls.length, 1);
  assert.deepEqual(desktop.calls[0].appearance, PAYLOAD);
  assert.equal(desktop.calls[0].resident, true);
  assert.equal(desktop.calls[0].night, true);
  assert.ok(Array.isArray(desktop.calls[0].lines));
});

test('没有外观数据源时：不带 appearance，状态是 off（旧行为）', async () => {
  const { jelly, desktop } = make({});
  await jelly.sync();
  assert.equal('appearance' in desktop.calls[0], false);
  assert.equal(jelly.appearanceStatus(), 'off');
});

test('回执带 appearance.status==="ok" 才是 ok；没有就是 unsupported（旧组件）', async () => {
  const supported = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } });
  await supported.jelly.sync();
  assert.equal(supported.jelly.appearanceStatus(), 'ok');
  const old = make({ appearance: async () => PAYLOAD });
  await old.jelly.sync();
  assert.equal(old.jelly.appearanceStatus(), 'unsupported');
  const odd = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'invalid' } } });
  await odd.jelly.sync();
  assert.equal(odd.jelly.appearanceStatus(), 'unsupported', '只有 ok 才算支持');
});

test('读取外观失败或返回空：本次不带 appearance，水母照常下发', async () => {
  for (const source of [async () => { throw new Error('read failed'); }, async () => null]) {
    const { jelly, desktop } = make({ appearance: source });
    await jelly.sync();
    assert.equal(desktop.calls.length, 1);
    assert.equal('appearance' in desktop.calls[0], false);
    assert.equal(desktop.calls[0].resident, true);
    assert.equal(jelly.appearanceStatus(), 'off');
  }
});

test('下发失败：状态回到 unknown，不冒充 ok', async () => {
  const { jelly, desktop } = make({ appearance: async () => PAYLOAD, reply: { appearance: { status: 'ok' } } });
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'ok');
  desktop.fail = '连接失败';
  await jelly.sync();
  assert.equal(jelly.appearanceStatus(), 'unknown');
});

test('每次下发都重新取外观：设置改变后 sync 带新值', async () => {
  let current = PAYLOAD;
  const { jelly, desktop } = make({ appearance: async () => current });
  await jelly.sync();
  current = { ...PAYLOAD, color: 6, colors: [6] };
  await jelly.sync();
  assert.deepEqual(desktop.calls.map(call => call.appearance.color), [2, 6]);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test test/jelly-appearance-desktop.test.js 2>&1 | tail -8`
Expected: FAIL（`appearanceStatus is not a function` 或 `appearance` 缺失）。

- [ ] **Step 3: 实现（对 `js/jelly-desktop.js` 的四处小改）**

(a) `create` 的参数解构加 `appearance = null`：

```js
  function create({ storage, desktop, summary = null, act = null, onRestored = null, appearance = null, setTimer = setTimeout, clearTimer = clearTimeout, retryMs = RETRY_MS }) {
```

(b) 在 `let assistantInfo = { status: 'unknown' };` 的下一行加：

```js
    // 最近一次下发里外观那部分的结果：off（没有外观数据源或本次没取到）、ok（组件回执带了 appearance.status==='ok'）、
    // unsupported（带了外观但回执没有它：旧组件）、unknown（连接失败或还没有下发）。协议版本不变，靠回执探测能力。
    let appearanceInfo = 'off';
```

(c) `push` 里，在 `try { const stored = await readAssistant(); ...` 那个 `let assistant = null;` 块之后、`try { const result = await desktop.setJelly(` 之前加：

```js
      // 外观读取失败只影响外观：本次不带该字段（原生端保持上一次），水母照常下发
      let appearancePayload = null;
      if (appearance) {
        try { const value = await appearance(); if (value && typeof value === 'object') appearancePayload = value; } catch (_) { /* 按没有外观处理 */ }
      }
```

并把 `desktop.setJelly({ ... })` 的参数对象末尾加一行（紧接 assistant 那行）：

```js
          ...(assistant ? { assistant: { enabled: true, hotkey: assistant.hotkey } } : {}),
          ...(appearancePayload ? { appearance: appearancePayload } : {}) });
```

（原来那行以 `}) ` 结尾，改成上面两行：给 assistant 那行末尾补逗号，并把收尾的 `}` `)` 移到新行。）

成功分支（`status.ok = true; ...` 之后，`if (assistant) {` 之前）加：

```js
        appearanceInfo = appearancePayload ? (result?.appearance?.status === 'ok' ? 'ok' : 'unsupported') : 'off';
```

失败分支（`catch (error) {` 里 `assistantInfo = { status: 'unknown' };` 之后）加：

```js
        appearanceInfo = 'unknown';
```

(d) `desktop.onPortLost = info => {` 里 `assistantInfo = { status: 'unknown' };` 同一行之后加 `appearanceInfo = 'unknown';`；`api` 对象里 `status: snapshot,` 之前加：

```js
      /** 外观是否被组件接受（见上）；设置页据此提示“需要更新组件”。 */
      appearanceStatus: () => appearanceInfo,
```

- [ ] **Step 4: 运行，确认通过，并回归现有水母测试**

Run: `node --test test/jelly-appearance-desktop.test.js test/jelly-desktop.test.js test/jelly-desktop-integration.test.js 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 语法检查与范围记录**

Run: `node --check js/jelly-desktop.js && git diff --stat`
Expected: 只有 `js/jelly-desktop.js` 小幅改动（约 +12 行）。

---

### Task 3: 后台接线与消息

**Files:**
- Modify: `js/background.js:1`（`importScripts`）、`js/background.js` 的 `jellyDesktop` 创建处与消息监听处
- Test: `test/jelly-appearance-integration.test.js`（新建）

**Interfaces:**
- Consumes: Task 1 `JellyAppearance.create`，Task 2 的 `JellyDesktop.create({appearance})` 与 `appearanceStatus()`
- Produces: 扩展消息 `jelly_appearance_get`、`jelly_appearance_set`（`settings`）、`jelly_appearance_reroll`，回应 `{ ok, settings, resolved, component: 'off'|'ok'|'unsupported'|'unknown', connected }`；仅扩展页面可调用（校验 `sender.id` 与 `sender.url`）。

- [ ] **Step 1: 写失败的测试**

```js
// 后台接线合同：脚本加载顺序、JellyDesktop 拿到外观数据源、消息只认扩展页面、保存后重新下发。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const background = read('js/background.js');

test('importScripts 在使用前加载 jelly-appearance.js，且在 jelly-desktop.js 之后创建控制器', () => {
  const importLine = background.split('\n').find(line => line.includes('importScripts('));
  assert.ok(importLine.includes("'jelly-appearance.js'"));
  assert.ok(background.indexOf("'jelly-appearance.js'") < background.indexOf('JellyAppearance.create('));
});

test('JellyDesktop 拿到外观数据源，保存后让它重新下发', () => {
  assert.match(background, /const jellyAppearance = JellyAppearance\.create\(\{[^}]*onChange: \(\) => jellyDesktop\.sync\(\)/s, '外观保存后经 jellyDesktop.sync 重新下发');
  assert.match(background, /JellyDesktop\.create\(\{[\s\S]*?appearance: \(\) => jellyAppearance\.payload\(\)/, 'JellyDesktop 的外观数据源是控制器的 payload');
});

test('消息：三个动作都校验扩展页面来源，回应带组件支持状态', () => {
  const block = background.match(/\['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll'\][\s\S]*?return true;\s*\}\);/)?.[0] || '';
  assert.ok(block, '应有统一的外观消息监听');
  assert.match(block, /sender\.id !== chrome\.runtime\.id \|\| !sender\.url\?\.startsWith\(chrome\.runtime\.getURL\(''\)\)/, '只认本扩展页面');
  assert.match(block, /jelly_appearance_set' \? jellyAppearance\.set\(message\.settings\)/);
  assert.match(block, /jellyAppearance\.rerollNow\(\)/);
  assert.match(block, /component: jellyDesktop\.appearanceStatus\(\)/);
});

test('外观接线在 userAlarmSaveQueue 到 getUserAlarmViewState 的沙箱截取片段之外', () => {
  const start = background.indexOf('userAlarmSaveQueue'), end = background.indexOf('getUserAlarmViewState');
  assert.ok(start >= 0 && end > start);
  assert.ok(!background.slice(start, end).includes('jellyAppearance'), '该片段会被 test/assistant-management.test.js 截取沙箱执行，不得引用片段外的全局');
});

test('外观模块源码：无网络、无 innerHTML、无自建定时器与权限接口', () => {
  const source = read('js/jelly-appearance.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|innerHTML|setInterval|setTimeout|chrome\.(idle|permissions|tabs)|document\./);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test test/jelly-appearance-integration.test.js 2>&1 | tail -10`
Expected: FAIL（`importScripts` 里没有 `jelly-appearance.js`）。

- [ ] **Step 3: 实现**

(a) `js/background.js` 第 1 行 `importScripts('jelly-nudge.js', 'jelly-desktop.js', ` 改为 `importScripts('jelly-nudge.js', 'jelly-appearance.js', 'jelly-desktop.js', `（其余不变）。

(b) 找到 `const jellyDesktop = JellyDesktop.create({`（约 586 行），**在它之前**插入控制器，**在它的参数对象里**加数据源。因为 `onChange` 要引用 `jellyDesktop`（稍后才声明），用箭头函数延迟求值：

```js
    // 桌面水母形象（颜色/花纹…）：设置与解析在 js/jelly-appearance.js，保存后经 jellyDesktop.sync() 重新下发
    const jellyAppearance = JellyAppearance.create({
        storage: chrome.storage.local,
        onChange: () => jellyDesktop.sync(),
    });
    const jellyDesktop = JellyDesktop.create({
        // …原有参数保持不变…
        appearance: () => jellyAppearance.payload(),
    });
```

（实施时先 `sed -n 580,596p js/background.js` 看清原参数对象，只在其末尾加 `appearance:` 一行，不动其他。）

(c) 在 `jelly_desktop_get/set` 那个 `chrome.runtime.onMessage.addListener(...)` 块**之后**加：

```js
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll'].includes(message?.action)) return;
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) { respond({ ok: false, error: '仅扩展页面可设置桌面水母形象' }); return; }
        (message.action === 'jelly_appearance_set' ? jellyAppearance.set(message.settings) : message.action === 'jelly_appearance_reroll' ? jellyAppearance.rerollNow() : jellyAppearance.get())
            .then(result => respond(result.ok ? { ...result, component: jellyDesktop.appearanceStatus(), connected: jellyDesktop.status().connected } : result))
            .catch(error => respond({ ok: false, error: error.message }));
        return true;
    });
```

- [ ] **Step 4: 运行，确认通过，并回归受影响的现有测试**

Run: `node --check js/background.js && node --test test/jelly-appearance-integration.test.js test/jelly-desktop-integration.test.js test/assistant-management.test.js test/csp-no-inline-handler.test.js 2>&1 | tail -8`
Expected: `fail 0`。

- [ ] **Step 5: 范围记录**

Run: `git diff --stat`
Expected: `js/background.js` 约 +16 行，`js/jelly-desktop.js`，新增文件若干。

---

### Task 4: 原生纯逻辑（解析、调色板）与对照测试

**Files:**
- Create: `desktop-reminder/jelly-appearance.swift`
- Modify: `desktop-reminder/companion-selftest.swift`、`desktop-reminder/build.mjs`（`sources`）、`test/desktop-companion-logic.test.mjs`

**Interfaces:**
- Produces（Swift，纯 Foundation）：`struct JellyAppearance { colors:[Int]; look; material; size; season }`、`JellyAppearance.parse(_ raw: Any?) -> JellyAppearance`（永不失败，非法回默认）、`JellyAppearance.palette: [(r: Double, g: Double, b: Double)]`（8 个）、`JellyAppearance.hue(_ rgb:) -> Double`（0…360）、`JellyAppearance.default`。

- [ ] **Step 1: 写 Swift 源文件**

```swift
import Foundation

// 桌面水母的外观：纯数据与解析，只依赖 Foundation，可由 companion-selftest.swift 单独编译验证。
// Chrome 是设置所有者：下发的永远是具体值（见 js/jelly-appearance.js），原生端只解析、不做随机、不另存。
// 解析走白名单：未知字段或越界值回到默认，永不失败（外观不对不能让水母消失）。
struct JellyAppearance: Equatable {
    enum Look: String, CaseIterable { case solid, duo, blend, rainbow }
    enum Material: String, CaseIterable { case glass, gummy, plush, wire, pencil, pixel }
    enum Size: String, CaseIterable { case small, medium, large }

    static let colorCount = 8
    static let defaultColor = 5
    static let seasons: Set<String> = ["spring-festival", "lantern", "dragon-boat", "mid-autumn", "halloween", "christmas"]

    /// 8 色，**色相顺序**与首页 JellyfishSkin.PALETTE 一致（红、橙、黄、绿、薄荷、冰蓝、紫、洋红）；数值是桌面专用的
    /// （半透明叠在未知壁纸上，须以真实截图校准）。色位 5 必须恰好是现有的平静色 (0.40, 0.74, 0.90)：默认外观才逐像素不变。
    static let palette: [(r: Double, g: Double, b: Double)] = [
        (1.00, 0.45, 0.42),   // 0 红
        (1.00, 0.62, 0.30),   // 1 橙
        (0.96, 0.82, 0.32),   // 2 黄
        (0.42, 0.82, 0.48),   // 3 绿
        (0.36, 0.84, 0.70),   // 4 薄荷
        (0.40, 0.74, 0.90),   // 5 冰蓝（= 平静色）
        (0.66, 0.50, 0.95),   // 6 紫
        (0.93, 0.46, 0.80),   // 7 洋红
    ]

    var colors: [Int]          // 1…3 个色位，第一个是主色；个数与花纹匹配（solid ≥1，duo/blend ≥2，rainbow ≥3）
    var look: Look
    var material: Material
    var size: Size
    var season: String?

    static let `default` = JellyAppearance(colors: [defaultColor], look: .solid, material: .glass, size: .medium, season: nil)

    var color: Int { colors[0] }

    /// JSON 里的布尔会以 NSNumber 到达，直接按数字读会把 true 当成 1；这里先识别出来。
    private static func isBoolean(_ value: Any) -> Bool {
        CFGetTypeID(value as AnyObject) == CFBooleanGetTypeID()
    }

    /// 色位：必须是 0…7 的整数（不接受布尔、小数、字符串）。
    private static func slot(_ value: Any?) -> Int? {
        guard let value = value, !isBoolean(value), let number = JellyModel.number(value), number.isFinite, number == number.rounded(), number >= 0, number < Double(colorCount) else { return nil }
        return Int(number)
    }

    static func parse(_ raw: Any?) -> JellyAppearance {
        guard let object = raw as? [String: Any] else { return .default }
        var colors: [Int] = []
        if let list = object["colors"] as? [Any], (1...3).contains(list.count) {
            let parsed = list.compactMap { slot($0) }
            if parsed.count == list.count { colors = parsed }      // 任何一个越界就整体丢弃，回到 [color]
        }
        if colors.isEmpty { colors = [slot(object["color"]) ?? defaultColor] }
        var look = Look(rawValue: object["look"] as? String ?? "") ?? .solid
        let needed = look == .rainbow ? 3 : (look == .solid ? 1 : 2)
        if colors.count < needed { look = .solid; colors = [colors[0]] }     // 花纹要的颜色不够：退回纯色，不用猜
        let season = (object["season"] as? String).flatMap { seasons.contains($0) ? $0 : nil }
        return JellyAppearance(colors: colors, look: look,
                               material: Material(rawValue: object["material"] as? String ?? "") ?? .glass,
                               size: Size(rawValue: object["size"] as? String ?? "") ?? .medium, season: season)
    }

    /// 色相（度，0…360），用来在自测里核对调色板与首页调色板的色相顺序一致。
    static func hue(_ rgb: (r: Double, g: Double, b: Double)) -> Double {
        let high = max(rgb.r, rgb.g, rgb.b), low = min(rgb.r, rgb.g, rgb.b), span = high - low
        guard span > 0 else { return 0 }
        var degrees: Double
        if high == rgb.r { degrees = 60 * ((rgb.g - rgb.b) / span).truncatingRemainder(dividingBy: 6) }
        else if high == rgb.g { degrees = 60 * ((rgb.b - rgb.r) / span + 2) }
        else { degrees = 60 * ((rgb.r - rgb.g) / span + 4) }
        if degrees < 0 { degrees += 360 }
        return degrees
    }
}
```

- [ ] **Step 2: 自测（`companion-selftest.swift` 里在 `print("STATUSES …")` 之前加）**

```swift
    // ---- 外观解析与调色板 ----
    do {
        typealias A = JellyAppearance
        check(A.palette.count == A.colorCount, "调色板有 8 个色位")
        check(A.palette[5].r == 0.40 && A.palette[5].g == 0.74 && A.palette[5].b == 0.90, "色位 5 恰好是平静色（默认外观才逐像素不变）")
        let hues = A.palette.map { A.hue($0) }
        check(zip(hues, hues.dropFirst()).allSatisfy { $0 < $1 }, "色位的色相严格递增（红→橙→黄→绿→薄荷→冰蓝→紫→洋红）")
        check(A.parse(nil) == .default && A.parse("x") == .default && A.parse([String: Any]()) == .default, "没有或不是字典：默认")
        let full = A.parse(["color": 2, "colors": [2, 4, 6], "look": "rainbow", "material": "wire", "size": "large", "season": "christmas"] as [String: Any])
        check(full.colors == [2, 4, 6] && full.look == .rainbow && full.material == .wire && full.size == .large && full.season == "christmas", "完整负载逐项解析")
        check(A.parse(["colors": [9], "color": 3] as [String: Any]).colors == [3], "colors 里有越界色位：整体回到 color")
        check(A.parse(["colors": [1, 2, 3, 4]] as [String: Any]).colors == [A.defaultColor], "colors 超过 3 个：整体丢弃")
        check(A.parse(["colors": [] as [Int], "color": 6] as [String: Any]).colors == [6], "colors 为空：用 color")
        check(A.parse(["color": true] as [String: Any]).colors == [A.defaultColor], "布尔不是色位")
        check(A.parse(["color": 2.5] as [String: Any]).colors == [A.defaultColor], "小数不是色位")
        check(A.parse(["color": "1"] as [String: Any]).colors == [A.defaultColor], "字符串不是色位")
        check(A.parse(["colors": [true, 1]] as [String: Any]).colors == [A.defaultColor], "colors 里有布尔：整体丢弃")
        let thin = A.parse(["colors": [1], "look": "rainbow"] as [String: Any])
        check(thin.look == .solid && thin.colors == [1], "花纹要的颜色不够：退回纯色")
        check(A.parse(["colors": [1, 4], "look": "duo"] as [String: Any]).look == .duo, "两色可以是 duo")
        check(A.parse(["season": "easter"] as [String: Any]).season == nil, "未知节日丢弃")
        check(A.parse(["material": "metal", "size": "xl"] as [String: Any]).material == .glass, "未知材质回到玻璃")
        check(A.parse(["size": "xl"] as [String: Any]).size == .medium, "未知尺寸回到中号")
    }
```

在 `print("STATUSES …")` 之前再加与 JS 对照用的输出（Node 把一批设置交给这里，Swift 解析 JS `resolve` 的结果后原样回显）：

```swift
    if let path = ProcessInfo.processInfo.environment["APPEARANCE_CASES"], let data = FileManager.default.contents(atPath: path),
       let cases = (try? JSONSerialization.jsonObject(with: data)) as? [Any] {
        for (index, value) in cases.enumerated() {
            let a = JellyAppearance.parse(value)
            print("APPEARANCE \(index) \(a.colors.map(String.init).joined(separator: ",")) \(a.look.rawValue) \(a.material.rawValue) \(a.size.rawValue) \(a.season ?? "-")")
        }
    }
    for (index, rgb) in JellyAppearance.palette.enumerated() { print("PALETTEHUE \(index) \(String(format: "%.1f", JellyAppearance.hue(rgb)))") }
```

- [ ] **Step 3: 更新 `build.mjs` 与测试里的清单**

`build.mjs`：`sources` 里在 `'jelly-palette'` 之后加 `'jelly-appearance'`（纯逻辑组，在 `assistant-model` 之前）。此时先**不**加 `'jelly-materials'`（Task 5 才有）。

`test/desktop-companion-logic.test.mjs`：
- 清单断言的 `assert.deepEqual(listed, [...])` 里同样在 `'jelly-palette'` 后加 `'jelly-appearance'`；
- 自测编译命令（`execFileSync(swiftc, ['swiftc', ...` 那一行）在 `jelly-palette.swift` 之后加 `resolve(root, 'desktop-reminder/jelly-appearance.swift'),`；
- 在 `STATUSES` 对照的上方加对照块：

```js
    // 外观：JS 解析出的具体值经 Swift 解析后原样回显；调色板色相顺序与首页调色板一致
    const JellyAppearance = require('../js/jelly-appearance.js');
    const JellyfishSkin = require('../js/jellyfish.js');
    const appearanceCases = [];
    for (const look of JellyAppearance.LOOKS) for (let color = 0; color < JellyAppearance.COLORS; color++) appearanceCases.push(JellyAppearance.resolve({ color, look, material: 'wire', size: 'large' }, { date: new Date(2026, 9, 17) }));
    for (let day = 1; day <= 20; day++) appearanceCases.push(JellyAppearance.resolve({ daily: true }, { date: new Date(2026, 9, day) }));
    appearanceCases.push({ color: 3, colors: [9], look: 'duo' }, { colors: [1], look: 'rainbow' }, 'x', null, { colors: [true, 1] }, { season: 'christmas' });
    const appearanceFile = join(dir, 'appearance-cases.json');
    writeFileSync(appearanceFile, JSON.stringify(appearanceCases));
    const appearanceOut = execFileSync(exe, [], { encoding: 'utf8', env: { ...process.env, HOTKEY_CASES: casesFile, APPEARANCE_CASES: appearanceFile } });
    const swiftAppearance = new Map([...appearanceOut.matchAll(/^APPEARANCE (\d+) (\S+) (\S+) (\S+) (\S+) (\S+)$/gm)].map(m => [Number(m[1]), m.slice(2)]));
    assert.equal(swiftAppearance.size, appearanceCases.length, 'Swift 应对每个外观用例各输出一行');
    const resolvedCount = JellyAppearance.LOOKS.length * JellyAppearance.COLORS + 20;
    appearanceCases.slice(0, resolvedCount).forEach((expected, index) => {
      const [colors, look, material, size, season] = swiftAppearance.get(index);
      assert.deepEqual(colors.split(',').map(Number), expected.colors, `用例 ${index} 颜色`);
      assert.equal(look, expected.look); assert.equal(material, expected.material); assert.equal(size, expected.size); assert.equal(season, '-');
    });
    assert.deepEqual(swiftAppearance.get(resolvedCount), ['3', 'solid', 'glass', 'medium', '-'], 'colors 越界：回到 color，duo 退回纯色');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 1), ['1', 'solid', 'glass', 'medium', '-'], '花纹颜色不够退回纯色');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 2), ['5', 'solid', 'glass', 'medium', '-'], '非字典：默认');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 4), ['5', 'solid', 'glass', 'medium', '-'], 'colors 含布尔：整体丢弃');
    assert.deepEqual(swiftAppearance.get(resolvedCount + 5), ['5', 'solid', 'glass', 'medium', 'christmas'], '合法节日保留');
    const hueOf = ([r, g, b]) => { const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo; if (!d) return 0; const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4; return (h * 60 + 360) % 360; };
    const swiftHues = new Map([...appearanceOut.matchAll(/^PALETTEHUE (\d+) ([\d.]+)$/gm)].map(m => [Number(m[1]), Number(m[2])]));
    assert.equal(swiftHues.size, JellyAppearance.COLORS);
    JellyfishSkin.PALETTE.forEach((rgb, slot) => {
      const diff = Math.abs(swiftHues.get(slot) - hueOf(rgb)); const wrapped = Math.min(diff, 360 - diff);
      assert.ok(wrapped <= 20, `色位 ${slot}：桌面色相 ${swiftHues.get(slot)}° 与首页 ${hueOf(rgb).toFixed(1)}° 相差 ${wrapped.toFixed(1)}°，顺序应一致`);
    });
```

（`js/jellyfish.js` 若不能在 Node 里 `require`，改为在该测试里读取其 `PALETTE` 的方式以 `jellyfish-integration` 现有测试的做法为准——实施时先 `grep -n "require('../js/jellyfish" test/*.js` 确认。）

- [ ] **Step 4: 运行**

Run: `cd ~/worktrees/ctb-jelly-appearance && node --test test/desktop-companion-logic.test.mjs 2>&1 | tail -15`
Expected: 全部通过；自测输出 `ALL PASS`，含新增外观用例。若色相对照失败，**调整 Swift 调色板数值**（不要放宽 20°，也不要动色位 5）。

- [ ] **Step 5: 范围记录**

Run: `git diff --stat`
Expected: `build.mjs`、`companion-selftest.swift`、`test/desktop-companion-logic.test.mjs` 小改，新增 `jelly-appearance.swift`。

---

### Task 5: 画法抽成 painter，并按花纹取色（默认外观逐像素不变）

**Files:**
- Create: `desktop-reminder/jelly-materials.swift`
- Modify: `desktop-reminder/jelly-companion.swift`、`desktop-reminder/build.mjs`（`sources` 加 `'jelly-materials'`，在 `'jelly-ring'` 之后、`'jelly-companion'` 之前）、`test/desktop-companion-logic.test.mjs`（同一清单断言）

**Interfaces:**
- Consumes: Task 4 `JellyAppearance`
- Produces: `struct JellyPaint { kind; a; b; c }`（`solid(_:)`、`make(appearance:)`、`mixed(toward:_:)`、`mixedAll(toward tint:_:)`、`tentacleTone(index:count:)`）；`protocol JellyPainter { func tentacles(...); func bell(...); func face(...) }`；`struct GlassPainter: JellyPainter`；`JellyPose.paint`；`JellyCompanion.setAppearance(_:)`；`JellyCompanion.appearance`。

- [ ] **Step 1: 新建 `jelly-materials.swift`（`JellyPaint` 与 `JellyPainter`）**

```swift
import AppKit

// 水母的画法：钟罩、触手、脸交给 painter，JellyView.draw 只负责位置、倾斜、夜晚荧光、睡觉标记与气泡。
// 本轮只有 GlassPainter（把原来 JellyView 里的画法原样搬进来）；软糖/毛绒/线框/铅笔/像素在后续档位加入，
// 它们实现同一个协议，由 painter(for:) 按 appearance.material 选择。
// 花纹（JellyPaint）语义与首页 js/jellyfish.js 的 paintOf / tentacleTone 一致。

/// 一只水母的“颜料”：由外观的 1…3 个色位和花纹得到，三个 JellyTint 随阶段/夜晚各自平滑变化。
struct JellyPaint: Equatable {
    var kind: JellyAppearance.Look
    var a: JellyTint
    var b: JellyTint
    var c: JellyTint

    static func solid(_ tint: JellyTint) -> JellyPaint { JellyPaint(kind: .solid, a: tint, b: tint, c: tint) }

    static func tint(slot: Int) -> JellyTint {
        let rgb = JellyAppearance.palette[max(0, min(JellyAppearance.colorCount - 1, slot))]
        return JellyTint(r: CGFloat(rgb.r), g: CGFloat(rgb.g), b: CGFloat(rgb.b))
    }

    /// 自选外观对应的颜料（calm 阶段使用）。
    static func make(appearance: JellyAppearance) -> JellyPaint {
        let tints = appearance.colors.map { tint(slot: $0) }
        switch appearance.look {
        case .solid: return .solid(tints[0])
        case .duo, .blend: return JellyPaint(kind: appearance.look, a: tints[0], b: tints[1], c: tints[1])
        case .rainbow: return JellyPaint(kind: .rainbow, a: tints[0], b: tints[1], c: tints[2])
        }
    }

    /// 某个阶段的目标颜料：calm 用自选外观；其余阶段整只变成阶段色（倒计时阶段色覆盖自选色）。
    static func target(stage: CountdownStage, appearance: JellyAppearance) -> JellyPaint {
        stage == .calm ? make(appearance: appearance) : .solid(JellyTint.forStage(stage))
    }

    /// 向目标靠近 t（0…1）；花纹种类直接取目标的（颜色在平滑过渡，种类不插值）。
    func mixed(toward other: JellyPaint, _ t: CGFloat) -> JellyPaint {
        JellyPaint(kind: other.kind, a: a.mixed(toward: other.a, t), b: b.mixed(toward: other.b, t), c: c.mixed(toward: other.c, t))
    }

    /// 三个颜色都向同一个颜色靠近（夜晚把阶段色略推向深海蓝紫，只在绘制时用，不污染按阶段渐变的颜料）。
    func mixedAll(toward tint: JellyTint, _ t: CGFloat) -> JellyPaint {
        JellyPaint(kind: kind, a: a.mixed(toward: tint, t), b: b.mixed(toward: tint, t), c: c.mixed(toward: tint, t))
    }

    /// 第 index 根触手（共 count 根）的颜色：纯色一个色；双色一律第二种；渐变偏向第二种；彩带按横向位置在三色之间取色。
    func tentacleTone(index: Int, count: Int) -> JellyTint {
        switch kind {
        case .solid: return a
        case .duo: return b
        case .blend: return a.mixed(toward: b, 0.7)
        case .rainbow:
            let u = count > 1 ? CGFloat(index) / CGFloat(count - 1) : 0.5
            return u < 0.5 ? a.mixed(toward: b, u * 2) : b.mixed(toward: c, (u - 0.5) * 2)
        }
    }

    /// 口腕（两条短而粗的）的颜色。
    var oralTone: JellyTint { kind == .solid ? a : b }
    /// 钟罩描边与睡觉标记等“整体色”。
    var outlineTone: JellyTint { kind == .rainbow ? b : a }
}

/// 一种材质的画法。坐标约定与原来的 JellyView 相同：cx 为身体中心横坐标，by 为钟罩底边，w/h 为钟罩宽高。
protocol JellyPainter {
    func tentacles(cx: CGFloat, by: CGFloat, w: CGFloat, p: JellyPose)
    func bell(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose)
    func face(cx: CGFloat, by: CGFloat, w: CGFloat, h: CGFloat, p: JellyPose)
}

/// 玻璃果冻：原来的画法。本轮之外的材质在 S2/S3 加入。
struct GlassPainter: JellyPainter {
    // 方法体见 Step 2：逐字从 jelly-companion.swift 原 drawTentacles / drawBell 搬来。
}

enum JellyPainters {
    /// 按材质选画法；本轮所有材质都先用玻璃（其他材质尚未实现，解析出来也不影响画面）。
    static func painter(for material: JellyAppearance.Material) -> JellyPainter { GlassPainter() }
}
```

- [ ] **Step 2: 把原画法搬进 `GlassPainter`（逐字搬动，只做下列替换）**

从 `desktop-reminder/jelly-companion.swift` 把 `private func drawTentacles(...)`（约 410–449 行）和 `private func drawBell(...)`（约 451–514 行）的函数体搬进 `GlassPainter` 的 `tentacles(...)` / `bell(...)`；把 `drawBell` 末尾以 `// 脸` 开头的那一段（约 480–513 行，眼睛、腮红、嘴）**整段**剪出来放进 `face(...)`。三个方法的头部改成协议里的签名，函数体里只做这些替换：

| 原文 | 替换为 |
|---|---|
| `p.tint.color(0.55, lighten: 0.15).setStroke()`（触手，410–432 行内） | 先取 `let tone = p.paint.tentacleTone(index: i, count: count)`，再 `tone.color(0.55, lighten: 0.15).setStroke()` |
| `p.tint.color(0.34, lighten: 0.4).setStroke()`（口腕） | `p.paint.oralTone.color(0.34, lighten: 0.4).setStroke()` |
| 钟罩渐变 `NSGradient(colors: [p.tint.color(0.50), p.tint.color(0.74, lighten: 0.22), p.tint.color(0.94, lighten: 0.45)], ...)` | **见下方 `fillBell`**（`.solid`/`.duo` 与原来逐字相同） |
| `p.tint.color(0.85, darken: 0.12).setStroke()`（钟罩描边） | `p.paint.outlineTone.color(0.85, darken: 0.12).setStroke()` |

`face(...)` 里不出现 `p.tint`（脸用固定深色与腮红），原样搬。**不得改动任何数字、顺序或路径构造**。

钟罩填充按花纹分支（`bell(...)` 里替换渐变那几行）：

```swift
        func fillBell(_ bell: NSBezierPath, _ p: JellyPose) {
            let paint = p.paint
            switch paint.kind {
            case .solid, .duo:
                let g = NSGradient(colors: [paint.a.color(0.50), paint.a.color(0.74, lighten: 0.22), paint.a.color(0.94, lighten: 0.45)],
                                   atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)
                g?.draw(in: bell, angle: 90)
            case .blend:
                // 钟罩由边缘的主色渐变到中心的第二色
                let mid = paint.a.mixed(toward: paint.b, 0.5)
                let g = NSGradient(colors: [paint.a.color(0.50), mid.color(0.74, lighten: 0.22), paint.b.color(0.94, lighten: 0.45)],
                                   atLocations: [0, 0.55, 1], colorSpace: .deviceRGB)
                g?.draw(in: bell, angle: 90)
            case .rainbow:
                // 三种颜色沿钟罩横向铺开，再叠一层自上而下的亮度，保留钟罩的立体感
                let bands = NSGradient(colors: [paint.a.color(0.74, lighten: 0.22), paint.b.color(0.74, lighten: 0.22), paint.c.color(0.74, lighten: 0.22)],
                                       atLocations: [0, 0.5, 1], colorSpace: .deviceRGB)
                bands?.draw(in: bell, angle: 0)
                let light = NSGradient(colors: [NSColor.white.withAlphaComponent(0.0), NSColor.white.withAlphaComponent(0.30)], atLocations: [0, 1], colorSpace: .deviceRGB)
                light?.draw(in: bell, angle: 90)
            }
        }
```

（`fillBell` 作为 `GlassPainter` 的私有方法放在 `bell(...)` 之前；`bell(...)` 里 `gradient?.draw(in: bell, angle: 90)` 那一行随之改为 `fillBell(bell, p)`。）

- [ ] **Step 3: 改 `jelly-companion.swift` 使用 painter**

(a) `JellyPose` 加 `var paint = JellyPaint.solid(.calm)`（紧接 `var tint = JellyTint.calm`）。`tint` 保留（光晕、涟漪、睡觉标记、气泡里用它），新增约定 `tint == paint.a`。

(b) `JellyView.draw` 里：把第 361 行的夜晚推色

```swift
        if night > 0 { p.tint = p.tint.mixed(toward: .nightBlue, 0.05 * night) }   // 只在绘制时推色，不污染按阶段渐变的 tint
```

改为同时推 paint（保留原注释）：

```swift
        if night > 0 { p.tint = p.tint.mixed(toward: .nightBlue, 0.05 * night); p.paint = p.paint.mixedAll(toward: .nightBlue, 0.05 * night) }
```

把原来的

```swift
        drawTentacles(cx: cx, by: by, w: w, p: p)
        drawBell(cx: cx, by: by, w: w, h: h, p: p)
```

改为

```swift
        let painter = JellyPainters.painter(for: appearance.material)
        painter.tentacles(cx: cx, by: by, w: w, p: p)
        painter.bell(cx: cx, by: by, w: w, h: h, p: p)
        painter.face(cx: cx, by: by, w: w, h: h, p: p)
```

并给 `JellyView` 加 `var appearance = JellyAppearance.default { didSet { if appearance != oldValue { needsDisplay = true } } }`；删除已搬走的 `drawTentacles` 与 `drawBell`。

(c) `JellyCompanion` 加：

```swift
    private(set) var appearance = JellyAppearance.default

    /// 控制器收到 Chrome 下发的外观后调用。calm 阶段立即换色（不等每次刷新 0.12 的慢速收敛）；其他阶段颜色由阶段覆盖，外观记下来，回到 calm 时生效。
    func setAppearance(_ next: JellyAppearance) {
        guard next != appearance else { return }
        appearance = next
        view.appearance = next
        if info.stage == .calm {
            pose.paint = JellyPaint.make(appearance: next)
            pose.tint = pose.paint.a
        }
        syncPose()
        ensureTicking()
    }
```

(d) `syncPose` 里把

```swift
        next.tint = pose.tint.mixed(toward: JellyTint.forStage(info.stage), reduceMotion ? 1 : 0.12)
```

改为

```swift
        next.paint = pose.paint.mixed(toward: JellyPaint.target(stage: info.stage, appearance: appearance), reduceMotion ? 1 : 0.12)
        next.tint = next.paint.a
```

（对 `.solid` 且默认外观：`paint.a` 的运算与原来的 `tint` 逐分量相同，所以画面逐像素不变。）

(e) `JellyTint.calm` 改为取自调色板，避免两处各写一份数值：

```swift
    static let calm: JellyTint = { let rgb = JellyAppearance.palette[JellyAppearance.defaultColor]; return JellyTint(r: CGFloat(rgb.r), g: CGFloat(rgb.g), b: CGFloat(rgb.b)) }()
```

并给 `JellyTint` 加 `Equatable`（`struct JellyTint: Equatable {`）。

- [ ] **Step 4: 登记源文件，编译**

`build.mjs` 的 `sources` 在 `'jelly-ring'` 之后、`'jelly-companion'` 之前加 `'jelly-materials'`；`test/desktop-companion-logic.test.mjs` 的清单断言同样加（顺序必须一致）。

Run: `cd ~/worktrees/ctb-jelly-appearance && node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA-after.app 2>&1 | tail -15`
Expected: `组件已构建：/tmp/tk/QA-after.app`，无编译错误。

- [ ] **Step 5: 闸门——默认外观逐像素一致（此前 Task 0 的基线）**

```bash
node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA-after.app --out=/tmp/tk/appearance-after
node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-after
```
Expected: 四行 `✓ … 逐像素一致`，退出码 0。

再带显式默认外观下发一次，证明“下发默认外观”与“不下发”画面相同：

```bash
node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA-after.app --out=/tmp/tk/appearance-after-explicit --with-default-appearance
node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-after-explicit
```
Expected: 同样四行 `✓`。

**若任何一张不一致，这个任务没有完成**：先看差异位置与大小，定位是搬动时改了某个数字/顺序，还是 `paint` 与 `tint` 的混合路径不同；修到一致，**不得放宽比较**。

- [ ] **Step 6: 回归与范围记录**

Run: `node --test test/desktop-companion-logic.test.mjs 2>&1 | tail -6 && git diff --stat`
Expected: `fail 0`；`jelly-companion.swift` 净减少（两个函数搬走）、新增 `jelly-materials.swift`。

---

### Task 6: 控制器与 `main.swift` 接线、ping 诊断、隔离冒烟

**Files:**
- Modify: `desktop-reminder/jelly-controller.swift`、`desktop-reminder/main.swift`
- Create: `desktop-reminder/appearance-smoke.mjs`
- Modify: `test/desktop-companion-logic.test.mjs`（`main.swift` 源码断言）

**Interfaces:**
- Produces：`JellyController.setAppearance(_ raw: Any?)`；`jelly` 回执 `appearance:{status:'ok'}`（仅当负载带了 `appearance`）；`ping` 回执新增 `jellyAppearance`（如 `"colors=5 look=solid material=glass size=medium season=-"`）与 `jellyPaintA`（`"r,g,b"`，保留 3 位小数）。

- [ ] **Step 1: 控制器转交（`jelly-controller.swift`）**

在 `setJelly` 之后加：

```swift
    /// Chrome 下发的外观（已是具体值）：解析成白名单值交给水母；非法字段回默认，永不失败。
    func setAppearance(_ raw: Any?) {
        companion.setAppearance(JellyAppearance.parse(raw))
    }

    var appearanceSummary: String {
        let a = companion.appearance
        return "colors=\(a.colors.map(String.init).joined(separator: ",")) look=\(a.look.rawValue) material=\(a.material.rawValue) size=\(a.size.rawValue) season=\(a.season ?? "-")"
    }
    /// 当前颜料主色（验收脚本据此核对阶段覆盖与换色）。
    var paintSummary: String {
        let t = companion.pose.paint.a
        return String(format: "%.3f,%.3f,%.3f", Double(t.r), Double(t.g), Double(t.b))
    }
```

- [ ] **Step 2: `main.swift`**

`case "jelly":` 里，在 `ok = jelly.setJelly(message["jelly"])` 的 `if ok {` 块**开头**加：

```swift
                // 外观跟着 jelly 命令走：带了就应用并在回执里告诉 Chrome（它据此知道组件支持外观，协议版本不变）；
                // 没带就保持上一次（Chrome 读取外观失败时不会让水母闪回默认）
                if let raw = (message["jelly"] as? [String: Any])?["appearance"] {
                    jelly.setAppearance(raw)
                    extra["appearance"] = ["status": "ok"]
                }
```

`ping` 回执（`reply["jellyVisible"] = jelly.visible` 附近）加：

```swift
        reply["jellyAppearance"] = jelly.appearanceSummary
        reply["jellyPaintA"] = jelly.paintSummary
```

- [ ] **Step 3: 把合同写进测试（`test/desktop-companion-logic.test.mjs` 的 main.swift 断言处加）**

```js
  assert.match(main, /jelly\.setAppearance\(raw\)/, 'jelly 命令里的 appearance 交给水母控制器');
  assert.match(main, /extra\["appearance"\] = \["status": "ok"\]/, '回执带 appearance.status，Chrome 靠它探测组件是否支持（协议版本不升）');
  assert.match(main, /"version": 7/, '协议版本仍是 7：外观走回执探测，不占“水母差事”的 v8');
```

- [ ] **Step 4: 写冒烟脚本 `desktop-reminder/appearance-smoke.mjs`**

```js
// 隔离冒烟：外观下发、回执探测、阶段覆盖、读取失败时保持上一次。不连接 Chrome，不读写闹钟，不操作键鼠，只用 ping 读数。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-smoke.mjs --app=/tmp/tk/QA.app
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const app = process.argv.find(a => a.startsWith('--app='))?.slice(6);
if (!app) throw new Error('需要 --app=隔离构建');
const id = 'a'.repeat(32);

function start(env = {}) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', TIMEKEEPER_REDUCE_MOTION: '1', TIMEKEEPER_NIGHT_HOUR: '12', ...env } });
  const host = { pending: new Map(), seq: 0, buffer: Buffer.alloc(0) };
  child.stdout.on('data', chunk => {
    host.buffer = Buffer.concat([host.buffer, chunk]);
    while (host.buffer.length >= 4 && host.buffer.length >= host.buffer.readUInt32LE(0) + 4) {
      const size = host.buffer.readUInt32LE(0);
      const message = JSON.parse(host.buffer.subarray(4, size + 4)); host.buffer = host.buffer.subarray(size + 4);
      if (host.pending.has(message.requestId)) { host.pending.get(message.requestId)(message); host.pending.delete(message.requestId); }
    }
  });
  host.request = (command, payload = {}) => new Promise((ok, fail) => {
    const requestId = String(++host.seq);
    const timeout = setTimeout(() => { host.pending.delete(requestId); fail(new Error(`原生组件超时: ${command}`)); }, 5000);
    host.pending.set(requestId, value => { clearTimeout(timeout); ok(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
  host.stop = async () => { await host.request('countdown', { timer: null }).catch(() => {}); await host.request('jelly', { jelly: { resident: false } }).catch(() => {}); child.stdin.end(); await delay(300); child.kill(); };
  return host;
}
const scenario = async (name, body) => { const h = start(); try { await body(h); console.log(`  ✓ ${name}`); } finally { await h.stop(); } };
const jelly = (extra = {}) => ({ resident: true, night: false, lines: [], linesUntil: 0, ...extra });
const rgb = text => text.split(',').map(Number);
const near = (a, b, eps = 0.0015) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const CALM = [0.40, 0.74, 0.90];
const PALETTE = JSON.parse(process.env.PALETTE_JSON || 'null');

await scenario('没有 appearance：回执不带 appearance（旧 Chrome），默认外观', async h => {
  const reply = await h.request('jelly', { jelly: jelly() });
  assert.equal(reply.ok, true); assert.equal('appearance' in reply, false);
  assert.equal(reply.version, 7, '协议版本不变');
  const ping = await h.request('ping');
  assert.equal(ping.jellyAppearance, 'colors=5 look=solid material=glass size=medium season=-');
  assert.ok(near(rgb(ping.jellyPaintA), CALM), `默认应是平静色，实际 ${ping.jellyPaintA}`);
});

await scenario('带 appearance：回执 appearance.status=ok，calm 阶段颜色立即到位（不等慢速收敛）', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ appearance: { color: 0, colors: [0], look: 'solid', material: 'glass', size: 'medium', season: null } }) });
  assert.deepEqual(reply.appearance, { status: 'ok' });
  const ping = await h.request('ping');
  assert.equal(ping.jellyAppearance, 'colors=0 look=solid material=glass size=medium season=-');
  assert.ok(!near(rgb(ping.jellyPaintA), CALM), '颜色应已换成红色，而不是仍然是平静色');
  assert.ok(rgb(ping.jellyPaintA)[0] > 0.9, `红色的 r 应接近 1，实际 ${ping.jellyPaintA}`);
});

await scenario('非法 appearance：回执仍是 ok，但解析回默认，水母不消失', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ appearance: { colors: [99], look: 'x', material: 'metal', size: 'xl', season: 'easter' } }) });
  assert.equal(reply.ok, true);
  assert.equal((await h.request('ping')).jellyAppearance, 'colors=5 look=solid material=glass size=medium season=-');
  assert.equal((await h.request('ping')).jellyVisible, true);
});

await scenario('后一次下发没带 appearance：保持上一次（Chrome 读取外观失败时不闪回默认）', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: { color: 6, colors: [6], look: 'solid', material: 'glass', size: 'medium', season: null } }) });
  const reply = await h.request('jelly', { jelly: jelly() });
  assert.equal('appearance' in reply, false);
  assert.equal((await h.request('ping')).jellyAppearance, 'colors=6 look=solid material=glass size=medium season=-');
});

await scenario('多色花纹：三个色位都被接受并回显', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: { color: 1, colors: [1, 3, 5], look: 'rainbow', material: 'glass', size: 'medium', season: null } }) });
  assert.equal((await h.request('ping')).jellyAppearance, 'colors=1,3,5 look=rainbow material=glass size=medium season=-');
});

await scenario('阶段覆盖：倒计时进入临近阶段后整只变成阶段色，取消倒计时回到自选色', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: { color: 0, colors: [0], look: 'solid', material: 'glass', size: 'medium', season: null } }) });
  const calm = rgb((await h.request('ping')).jellyPaintA);
  const fireAt = Date.now() + 25000;
  const reply = await h.request('countdown', { timer: { id: 'smoke', title: '外观冒烟', count: 1, alarmId: 'a', revision: 3, canAct: true, fireAt, items: [{ id: 'smoke', alarmId: 'a', title: '外观冒烟', fireAt }] } });
  assert.equal(reply.ok, true);
  await delay(1500);
  const urgent = rgb((await h.request('ping')).jellyPaintA);
  assert.ok(!near(urgent, calm, 0.02), `临近阶段应覆盖自选色：${calm} → ${urgent}`);
  await h.request('countdown', { timer: null });
  await delay(1500);
  assert.ok(near(rgb((await h.request('ping')).jellyPaintA), calm, 0.02), '倒计时结束后回到自选色');
});

console.log('外观冒烟全部通过');
```

（timer 的形状抄自 `jelly-smoke.mjs` 的 `timer()` 构造函数；25 秒后到点属于临近/紧迫阶段，若 `CountdownModel` 的阶段阈值不同，按 `countdown-model.swift` 里的阈值调整 `fireAt`，让它落在非 calm 阶段。`reduceMotion` 下 `syncPose` 的混合系数是 1，阶段颜色直接到位；若要观察渐变，把该场景去掉 `TIMEKEEPER_REDUCE_MOTION` 单独跑，本脚本只验“覆盖与恢复”。）

- [ ] **Step 5: 构建并运行**

```bash
cd ~/worktrees/ctb-jelly-appearance
node --check desktop-reminder/appearance-smoke.mjs
node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app 2>&1 | tail -3
node desktop-reminder/appearance-smoke.mjs --app=/tmp/tk/QA.app
```
Expected: 六行 `✓` 与 `外观冒烟全部通过`。

- [ ] **Step 6: 回归现有隔离验收（外观改动没有破坏水母）**

```bash
node desktop-reminder/jelly-smoke.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app --no-mouse 2>&1 | tail -15
node --test test/desktop-companion-logic.test.mjs 2>&1 | tail -6
```
Expected: 冒烟全部通过、`fail 0`。**这一步不用鼠标，不会抢用户的输入**；带真实鼠标的阶段留给用户在安静时验收。

- [ ] **Step 7: 范围记录**

Run: `git diff --stat`

---

### Task 7: 设置页“形象”卡片

**Files:**
- Create: `js/settings-jelly-appearance.js`
- Modify: `settings.html`（在 `sp-desktop-jelly-card` 之后加一个新卡片；在 `settings-page.js` 的 `<script>` 之后加载新脚本）
- Test: `test/jelly-appearance-settings.test.js`

**Interfaces:**
- Consumes: Task 3 的消息 `jelly_appearance_get/set/reroll`，回应字段 `settings`、`resolved`、`component`、`connected`。
- Produces: 设置页元素 ID：`sp-jelly-appearance-card`、`set-jellyColorSwatches`（8 个按钮，`data-color`）、`set-jellyLook`（`<select>`，4 个选项）、`set-jellyDaily`（复选框）、`set-jellyReroll`（按钮）、`set-jellyAppearanceStatus`（状态行）。

- [ ] **Step 1: 写失败的测试**

```js
// 设置页“形象”卡片合同：元素、无内联处理器、只经扩展消息读写、状态文字说明预览条件。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('settings.html');
const source = read('js/settings-jelly-appearance.js');

test('settings.html 有形象卡片，并在 settings-page.js 之后加载新脚本', () => {
  for (const id of ['sp-jelly-appearance-card', 'set-jellyColorSwatches', 'set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus']) assert.ok(html.includes(`id="${id}"`), id);
  assert.ok(html.indexOf('js/settings-page.js') < html.indexOf('js/settings-jelly-appearance.js'));
  assert.match(html, /js\/settings-jelly-appearance\.js\?v=1/);
  const card = html.slice(html.indexOf('id="sp-jelly-appearance-card"'));
  assert.equal([...card.slice(0, card.indexOf('sp-jelly-nudge-card') > 0 ? card.indexOf('sp-jelly-nudge-card') : 4000).matchAll(/data-color="(\d)"/g)].length, 8, '8 个色板按钮');
  const options = [...card.matchAll(/<option value="(solid|duo|blend|rainbow)"/g)].map(m => m[1]);
  assert.deepEqual(options.slice(0, 4), ['solid', 'duo', 'blend', 'rainbow']);
});

test('卡片文案：说明预览条件（水母常驻时所见即所得）与材质/尺寸稍后加入', () => {
  const card = html.slice(html.indexOf('id="sp-jelly-appearance-card"'), html.indexOf('id="sp-jelly-appearance-card"') + 3500);
  assert.match(card, /常驻/);
  assert.match(card, /没有常驻时没有实时预览/);
});

test('脚本：只经扩展消息读写，没有内联处理器、innerHTML、网络、直接写存储', () => {
  const code = source.replace(/\/\/.*$/gm, '');
  assert.match(code, /chrome\.runtime\.sendMessage/);
  for (const action of ['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll']) assert.ok(code.includes(action), action);
  assert.doesNotMatch(code, /innerHTML|\bfetch\(|XMLHttpRequest|chrome\.storage\.(local|sync)\.set|onclick\s*=|eval\(/);
  assert.doesNotMatch(html.slice(html.indexOf('id="sp-jelly-appearance-card"'), html.indexOf('id="sp-jelly-appearance-card"') + 3500), /\son[a-z]+=/i, '卡片里没有内联事件处理器（MV3 CSP）');
});

test('状态文字：组件不支持时给出可行动的提示，不把没生效说成已生效', () => {
  const sandbox = {};
  new Function('window', 'document', 'chrome', `${source}; window.__describe = typeof describe === 'function' ? describe : null;`)(sandbox, { getElementById: () => null, addEventListener: () => {}, readyState: 'loading' }, { runtime: { sendMessage() {} } });
  assert.equal(typeof sandbox.JellyAppearanceSettings?.describe, 'function', '脚本导出 describe 供测试');
  const d = sandbox.JellyAppearanceSettings.describe;
  assert.match(d({ component: 'unsupported', connected: true }), /更新桌面组件/);
  assert.match(d({ component: 'unknown', connected: false }), /没有连上|未连接|常驻/);
  assert.match(d({ component: 'ok', connected: true }), /已应用|已生效/);
  assert.doesNotMatch(d({ component: 'unsupported', connected: true }), /已应用|已生效/);
});
```

- [ ] **Step 2: 运行，确认失败**

Run: `node --test test/jelly-appearance-settings.test.js 2>&1 | tail -8`
Expected: FAIL（找不到 `js/settings-jelly-appearance.js`）。

- [ ] **Step 3: 写 `settings.html` 卡片**（插在 `id="sp-desktop-jelly-card"` 那个 `</div>` 之后、`id="sp-jelly-nudge-card"` 之前）

```html
                <div class="sp-card" id="sp-jelly-appearance-card">
                    <h3 class="sp-card-title">桌面水母形象</h3>
                    <p class="sp-card-desc">给桌面水母换颜色和花纹。水母常驻时，选择立即在桌面上生效，所见即所得；没有常驻时没有实时预览，下次出现时按这里的设置显示。倒计时临近、紧迫时它会暂时变成提示色（黄、橙红、粉红），结束后回到你选的颜色。材质与尺寸会在后续版本加入。需要已更新的桌面组件。</p>
                    <div class="sp-field">
                        <div class="sp-field-info"><span class="sp-field-label">颜色</span><span class="sp-field-hint">8 种，按色相排列；选“每天换一只”时这里的颜色与花纹不起作用</span></div>
                        <div class="sp-jelly-swatches" id="set-jellyColorSwatches" role="radiogroup" aria-label="水母颜色">
                            <button type="button" class="sp-jelly-swatch" data-color="0" role="radio" aria-checked="false" aria-label="红" title="红" style="--swatch:#ff7369"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="1" role="radio" aria-checked="false" aria-label="橙" title="橙" style="--swatch:#ff9e4d"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="2" role="radio" aria-checked="false" aria-label="黄" title="黄" style="--swatch:#f5d152"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="3" role="radio" aria-checked="false" aria-label="绿" title="绿" style="--swatch:#6bd17a"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="4" role="radio" aria-checked="false" aria-label="薄荷" title="薄荷" style="--swatch:#5cd6b3"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="5" role="radio" aria-checked="true" aria-label="冰蓝（默认）" title="冰蓝（默认）" style="--swatch:#66bde6"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="6" role="radio" aria-checked="false" aria-label="紫" title="紫" style="--swatch:#a880f2"></button>
                            <button type="button" class="sp-jelly-swatch" data-color="7" role="radio" aria-checked="false" aria-label="洋红" title="洋红" style="--swatch:#ed75cc"></button>
                        </div>
                    </div>
                    <div class="sp-field">
                        <div class="sp-field-info"><span class="sp-field-label">花纹</span><span class="sp-field-hint">纯色；双色（钟罩一种、触须一种）；渐变（钟罩由边缘渐变到中心）；七彩（三种颜色沿钟罩铺开）。多色的另外几种颜色由主色决定</span></div>
                        <select class="sp-select" id="set-jellyLook"><option value="solid" selected>纯色</option><option value="duo">双色</option><option value="blend">渐变</option><option value="rainbow">七彩</option></select>
                    </div>
                    <div class="sp-field">
                        <div class="sp-field-info"><span class="sp-field-label">每天换一只</span><span class="sp-field-hint">颜色与花纹由当天日期决定，一天内不变，次日自动换；默认关闭</span></div>
                        <label class="sp-toggle"><input type="checkbox" id="set-jellyDaily"><span class="sp-toggle-slider"></span></label>
                    </div>
                    <div class="sp-field">
                        <div class="sp-field-info"><span class="sp-field-label">随机一只</span><span class="sp-field-hint">换成另一种颜色和随机花纹，并关闭“每天换一只”</span></div>
                        <button type="button" class="sp-btn" id="set-jellyReroll">随机</button>
                    </div>
                    <p class="sp-card-desc" id="set-jellyAppearanceStatus" role="status" aria-live="polite"></p>
                </div>
```

脚本标签：在 `<script src="js/settings-page.js?v=10"></script>` 之后加 `<script src="js/settings-jelly-appearance.js?v=1"></script>`。色板样式放进该卡片所在页已加载的设置样式文件（`css/settings-page.css`）末尾：

```css
.sp-jelly-swatches { display: flex; gap: 8px; flex-wrap: wrap; }
.sp-jelly-swatch { width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent; background: var(--swatch); cursor: pointer; padding: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.18) inset; }
.sp-jelly-swatch[aria-checked="true"] { border-color: var(--accent-color, #3b82f6); box-shadow: 0 0 0 2px rgba(255,255,255,.9) inset; }
.sp-jelly-swatch:focus-visible { outline: 2px solid var(--accent-color, #3b82f6); outline-offset: 2px; }
.sp-jelly-swatch:disabled { opacity: .5; cursor: default; }
```

（`settings.html` 引用 `css/settings-page.css` 的 `?v=` 若有钉子测试，同步版本并改对应契约测试；实施时先 `grep -n "settings-page.css" settings.html test/*.js`。）

- [ ] **Step 4: 写 `js/settings-jelly-appearance.js`**

```js
(function (root) {
  'use strict';

  // 设置页“桌面水母形象”卡片：只经扩展消息读写（后台 js/jelly-appearance.js 拥有设置与解析），页面不直接写存储、不连接组件。
  // 水母常驻时选择立即在桌面生效；没有常驻时没有实时预览，页面如实说明。设计见 docs/superpowers/specs/2026-10-17-jelly-appearance-design.md。

  const IDS = ['set-jellyLook', 'set-jellyDaily', 'set-jellyReroll'];
  let chain = Promise.resolve();

  const $ = id => document.getElementById(id);
  const send = (message, timeout = 8000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('后台没有响应')), timeout);
    chrome.runtime.sendMessage(message, reply => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (!reply || reply.ok === false) { reject(new Error(reply?.error || '操作失败')); return; }
      resolve(reply);
    });
  });

  /** 状态文字：每种组件状态都给出可行动的下一步，没生效就不说已生效。 */
  function describe(reply) {
    switch (reply?.component) {
      case 'ok': return '外观已应用到桌面水母。';
      case 'unsupported': return '桌面组件版本较旧，不支持形象设置：请按 desktop-reminder/README.md 更新桌面组件，再重载扩展。设置已保存，更新后自动生效。';
      case 'off': return '设置已保存。';
      default: return reply?.connected
        ? '设置已保存，正在等待桌面组件确认…'
        : '设置已保存。桌面水母没有连上（需要先在上面的“桌面水母”里打开“常驻桌面”），下次出现时会按这里的设置显示。';
    }
  }

  function setStatus(text) { const el = $('set-jellyAppearanceStatus'); if (el) el.textContent = text || ''; }
  function setDisabled(disabled) {
    for (const id of IDS) { const el = $(id); if (el) el.disabled = disabled; }
    for (const swatch of document.querySelectorAll('#set-jellyColorSwatches [data-color]')) swatch.disabled = disabled;
  }

  function apply(reply) {
    const { settings } = reply;
    for (const swatch of document.querySelectorAll('#set-jellyColorSwatches [data-color]')) {
      swatch.setAttribute('aria-checked', String(Number(swatch.dataset.color) === settings.color));
    }
    const look = $('set-jellyLook'); if (look) look.value = settings.look;
    const daily = $('set-jellyDaily'); if (daily) daily.checked = settings.daily === true;
    // “每天换一只”开着时颜色与花纹由日期决定，选择器不起作用，禁用以免误以为能改
    const manual = settings.daily !== true;
    if (look) look.disabled = !manual;
    for (const swatch of document.querySelectorAll('#set-jellyColorSwatches [data-color]')) swatch.disabled = !manual;
    setStatus(describe(reply));
  }

  function run(message, label) {
    setDisabled(true);
    setStatus(label);
    chain = chain.then(() => send(message)).then(apply)
      .catch(error => setStatus(`保存失败：${error.message}。再改一次即可重试。`))
      .then(() => setDisabled(false));
    return chain;
  }

  function bind() {
    if (!$('sp-jelly-appearance-card')) return;
    for (const swatch of document.querySelectorAll('#set-jellyColorSwatches [data-color]')) {
      swatch.addEventListener('click', () => { void run({ action: 'jelly_appearance_set', settings: { color: Number(swatch.dataset.color) } }, '正在保存…'); });
    }
    $('set-jellyLook')?.addEventListener('change', event => { void run({ action: 'jelly_appearance_set', settings: { look: event.target.value } }, '正在保存…'); });
    $('set-jellyDaily')?.addEventListener('change', event => { void run({ action: 'jelly_appearance_set', settings: { daily: event.target.checked } }, '正在保存…'); });
    $('set-jellyReroll')?.addEventListener('click', () => { void run({ action: 'jelly_appearance_reroll' }, '正在换一只…'); });
    // 水母常驻状态变化后（连上/断开）刷新一次状态文字
    chrome.storage?.onChanged?.addListener?.((changes, area) => {
      if (area === 'local' && (changes.desktopJellyV1 || changes.desktopJellyAppearanceV1)) void run({ action: 'jelly_appearance_get' }, '');
    });
    chain = chain.then(() => send({ action: 'jelly_appearance_get' })).then(apply)
      .catch(error => setStatus(`无法读取形象设置：${error.message}。请在已加载的扩展里打开本页。`));
  }

  root.JellyAppearanceSettings = { describe };
  if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else if (typeof document !== 'undefined') bind();
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 5: 运行，确认通过，并回归设置页相关测试**

Run: `node --check js/settings-jelly-appearance.js && node --test test/jelly-appearance-settings.test.js test/desktop-assistant-settings.test.js test/csp-no-inline-handler.test.js 2>&1 | tail -10`
Expected: `fail 0`。若有测试钉着 `settings.html` 的脚本版本或样式版本，按它的提示同步。

- [ ] **Step 6: 范围记录**

Run: `git diff --stat`

---

### Task 8: 文档与项目说明同步，全量验证

**Files:**
- Create: `docs/technical/jelly-appearance-20261017.md`
- Modify: `AGENTS.md`（在“桌面水母”条目之后新增“桌面水母形象”条）、`docs/technical/_index.md`、`docs/superpowers/specs/2026-10-17-jelly-appearance-design.md`（状态改为“S1a 已实现，S1b/S2–S4 未做”）
- 遵循 `.cursor/rules/05-docs-organization.mdc`：技术文档必须有 Front Matter（`title/type/status/created/updated/tags/changelog`），文件名 kebab-case，并更新 `_index.md`。

- [ ] **Step 1: 写技术文档**，内容必须包含：复用了什么（首页调色板与花纹语义、`jelly` 命令与回执探测、`JellyDesktop` 的串行与规范化模式、既有隔离验收脚本）、没有用上游库及原因（Aurelia MIT 但是 Three.js/WebGPU 实验场景，Swift 原生无可复用 API；Cyber Ocean 无许可证，均只借视觉方向）、**协议不升版本的原因与回执探测方式**、与并行分支（水母差事占 v8）的合并点、验证结果（逐项如实：静态检查、纯逻辑自测与 JS/Swift 对照、业务替身测试、隔离原生冒烟、基线像素比较、**未验收：真实 Chrome 156、真实组件重装、多显示器、全屏 Space、Stage Manager、真实壁纸叠加观感、VoiceOver**）、已知边界（材质/尺寸/节日本轮不画；桌面色相数值以真实截图为准）。

- [ ] **Step 2: 写 `AGENTS.md` 新条**（简洁，沿用文件里同类条目的口径）：存储键 `desktopJellyAppearanceV1`（独立于 `desktopJellyV1` 的原因）、`appearance` 下发字段与“不带则保持上一次”、**不升协议版本、用回执 `appearance:{status:'ok'}` 探测**、阶段色覆盖自选色且 calm 时立即换色、8 色色相顺序与首页一致但数值独立、默认外观逐像素基线闸门（`appearance-snapshot.mjs`）、新增源文件 `jelly-appearance.swift`/`jelly-materials.swift` 已登记 `build.mjs` 与合同测试、未验收项。

- [ ] **Step 3: 更新 `docs/technical/_index.md`**（顶部加一行，日期 2026-10-17，状态 active）。

- [ ] **Step 4: 全量验证**

```bash
cd ~/worktrees/ctb-jelly-appearance
git diff --check
for f in js/jelly-appearance.js js/jelly-desktop.js js/background.js js/settings-jelly-appearance.js desktop-reminder/appearance-snapshot.mjs desktop-reminder/appearance-smoke.mjs; do node --check "$f" || echo "语法错误: $f"; done
node --test test/jelly-appearance.test.js test/jelly-appearance-desktop.test.js test/jelly-appearance-integration.test.js test/jelly-appearance-settings.test.js test/desktop-companion-logic.test.mjs test/jelly-desktop.test.js test/jelly-desktop-integration.test.js test/alarm-desktop.test.js test/desktop-assistant-settings.test.js test/csp-no-inline-handler.test.js test/jelly-nudge.test.js test/jelly-nudge-integration.test.js test/assistant-management.test.js 2>&1 | tail -8
node --test test/*.test.js test/*.test.mjs 2>&1 | tail -10
```
Expected: `git diff --check` 无输出；每个 `node --check` 通过；定向测试 `fail 0`；全量 `node --test` 对比 `a327fd0` 基线，**失败数不增加**（若基线本身有失败，先在主目录 `git stash` 不可行时用 `git worktree` 另起 `a327fd0` 对照，不得拿“本来就失败”糊弄）。

- [ ] **Step 5: 隔离原生验收汇总**

```bash
node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-final
node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-final
node desktop-reminder/appearance-smoke.mjs --app=/tmp/tk/QA.app
node desktop-reminder/jelly-smoke.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app --no-mouse
```
Expected: 四行逐像素一致、外观冒烟全部通过、`jelly-smoke` 全部通过。

- [ ] **Step 6: 看真实截图校准桌面色板**（**这一步不是测试，是设计判断**）：用 `--shots` 或 `appearance-snapshot.mjs` 给 8 个色位各截一张（浅/深），人工看是否彼此可分、在浅色与深色壁纸上都可辨；不满意就调 `JellyAppearance.palette` 的数值（色位 5 与色相顺序不变），再跑 Task 4 的对照测试。**截图只截水母自己的窗口**。

- [ ] **Step 7: 最终范围记录与交付说明**

Run: `git status --short && git diff --stat`
向用户报告（分层，不混写）：静态检查 / 业务替身测试 / 隔离原生冒烟与像素基线 / 真实 Chrome 与真实组件（**未验收，请你重装组件并重载扩展后在安静时试：设置页选色、水母实时变色、倒计时阶段变色与恢复**）；并说明 S1b（尺寸）、S2（软糖/毛绒与右键“换一只”）、S3、S4 未做。

---

## 自检（对照设计稿 §3–§6 S1a）

| 设计稿要求 | 对应任务 |
|---|---|
| 存储模型与独立键、`daily`、`reroll` | Task 1 |
| 下发具体值、读取失败不带、回执探测 | Task 2、6 |
| 后台消息与来源校验 | Task 3 |
| 原生白名单解析、调色板色相顺序、色位 5 = 平静色 | Task 4 |
| painter 抽象、花纹取色、阶段色覆盖、calm 立即换色 | Task 5 |
| 默认外观逐像素一致 | Task 0 + Task 5 Step 5 |
| 设置页形象区（颜色/花纹/随机/每天换）与预览说明 | Task 7 |
| 协议不升版本 | Task 2、6、8（文档与断言） |
| 文档、AGENTS、索引 | Task 8 |
| **不在本计划**：尺寸（S1b）、材质（S2/S3）、右键菜单、节日（S4） | 设计稿 §6 分档 |
