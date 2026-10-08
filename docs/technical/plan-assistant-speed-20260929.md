---
title: "AI 工作台提速实现计划"
type: technical
status: active
version: "1.2"
created: "2026-09-29"
updated: "2026-09-29"
author: "Cursor Agent"
app-version: "3.16.0"
tags: [AI工作台, 提速, 实现计划, TDD, 规划超时, 无进展保护, 快速路径]
related:
  - docs/technical/assistant-speed-20260929.md
  - docs/technical/assistant-planner-timeout-20260919.md
changelog:
  - date: "2026-09-29"
    desc: "初始实现计划。已在隔离副本中完整演练：新增 22 项测试全部通过，相关回归与全量回归的失败集合与改动前一致；计划中的代码与测试编辑块经机械应用校验，结果与演练副本逐字节一致。尚未修改仓库业务代码。"
  - date: "2026-09-29"
    desc: "已在当前会话内执行 Task 0–7（未提交 Git）：代码与测试与演练结果逐字节一致，回归失败集合与基线一致；Task 8 真实本机模型 A/B 未运行。详见文末“执行记录”。"
  - date: "2026-09-29"
    desc: "用户同意后执行 Task 8（LM Studio 冷加载，每场景每策略 3 轮，共 12 次）：全部完成、副作用一致；adaptive 规划耗时中位数低约 47–48%，但四目标场景无效计划 2 次对 0 次，未满足既定门槛，默认保持 follow。详见文末“执行记录”。"
---

# AI 工作台提速实现计划

> **给执行代理：** 必须使用 `superpowers:executing-plans` 在当前会话内逐任务执行。本项目禁止子代理（`.cursor/rules/no-subagent.mdc`），因此**不要**使用 `superpowers:subagent-driven-development`。步骤使用复选框（`- [ ]`）跟踪。

**目标：** 落地已获批准的设计 [`assistant-speed-20260929.md`](assistant-speed-20260929.md)：可选的“规划思考起步”策略（默认关闭）、Engine 无进展保护、扩大的队列播放快速路径，并让评估脚本支持进程内 A/B。

**架构：** 三处彼此独立的小改动，各带测试。Gateway 只调整场景 `assistant.plan` 的起始思考档位；Engine 在 `nextPlan()` 拒绝“自上次写入、选择或失败恢复后重复提出的相同只读查询”，并复用现有 `modelRepair` 恢复；`MusicIntent.queuePlayRequest()` 改为封闭语法并新增 `bare` 参数，由路由与 `Tools.quickQueuePlayPlan` 共用。界面只增加一个下拉和两处展示文案。

**技术栈：** 原生 JavaScript（UMD 模块，浏览器与 CommonJS 测试共用）、Node 内置 `node:test`、仓库现有 `local-ai/` Gateway。无新依赖。

**演练说明：** 本计划的代码改动与除 Task 8 之外的命令，已在仓库工作区快照的隔离副本中完整演练。计划里所有代码与测试类的 Find/Replace/追加/新建块，都由脚本按文档顺序机械应用到干净副本，结果与演练副本逐字节一致；文档类编辑块（Task 7）经脚本核对锚点在当前仓库中唯一且可应用。演练期间仓库本身只新增了设计文档、本计划，以及技术索引中的两行。

## Global Constraints

- 使用中文交互（代码标识符除外）；不使用 Task 工具或任何子代理。
- 工作区含大量与本任务无关的未提交改动：**只**对本计划列出的文件做定点编辑（StrReplace 精确锚点，或在文件末尾追加），不整体覆盖；禁止 `git stash`、`git checkout`、`git restore`、`git reset`、`git clean`；不提交 Git、不发布。下文的“检查点”不含 `git commit`。
- 若某个 Find 锚点找不到或不唯一，说明工作区在设计之后发生了漂移：**停止并向用户报告**，不要凭猜测改写。
- 不读取 `local-ai/.local/token`；不操作真实音乐队列、提醒、账号；真实本机模型 A/B 只在用户明确同意、LM Studio 空闲时进行（Task 8）。
- 不新增依赖，不使用 pi SDK 的新 API；不改变 12 轮 / 12 工具 / 5 分钟（300000 ms）任务上限、每执行轮最多 3 次恢复，以及现有“30 秒思考 / 剩余约 60 秒关闭思考”的超时恢复。
- `planningStrategy` 只有 `follow`（默认）和 `adaptive`；缺失视为 `follow`；用户设置或本次选择的 `reasoning` 始终是上限；只影响场景 `assistant.plan`。
- `readSeen` 最多 24 条；参数序列化超过 2000 字符不参与判定；只检查计划的 `steps[0]`。
- 队列播放识别只用封闭语法；裸“随机播放”仅在 `!Contract.hasCandidates(task)` 时命中。
- 文档遵守 `.cursor/rules/05-docs-organization.mdc`：front matter、kebab-case 英文文件名、同步 `_index.md`、更新 `updated` 与 `changelog`；修改原有能力时同步 `AGENTS.md`。
- 验证分层报告（静态检查 / 业务替身测试 / 真实本机模型 / HTTP 预览 / 真实 Chrome 扩展 / 真实账号），不得把一层写成另一层通过；完成后给出一行安全自查。

## 演练数据（设计时，供对照）

| 项目 | 改动前 | 改动后 |
| --- | --- | --- |
| 相关回归 `node --test test/assistant-*.test.js test/assistant-*.test.mjs test/local-ai-*.test.mjs test/music-*.test.js` | 555 项 / 550 通过 / 5 失败 | 577 项 / 572 通过 / 5 失败（失败集合相同） |
| 全量 `node --test test/*.test.js test/*.test.mjs` | 1123 项 / 1115 通过 / 8 失败 | 1145 项 / 1137 通过 / 8 失败（失败集合相同） |
| 新增测试 | — | 22 项：`assistant-queue-phrases` 7、`assistant-no-progress` 7、`assistant-speed-ui` 2、`local-ai-control` +1、`local-ai-planner-recovery` +5 |

改动前已失败、与本任务无关、**不在本次修复**的测试：`local-ai-laya-prefetch` 4 项（“Laya 开关默认关闭…”“只观察不等待 Laya…”“只观察保留原目录…”“服务错误和目录外建议降级…”）、`local-ai-compaction` 1 项（“真实 SDK 压缩后的溢出恢复…”），全量中另有 3 项 UI 契约（“任务表格状态和筛选器…”“快捷导航关闭态…”“诗词电台五个页面复用同一播放状态”）。`local-ai-control.test.mjs` 里“超时精确等于 15000 ms”的既有断言偶发差 1 ms（毫秒边界），出现时单独重跑判断，不视为回归。

执行时以**当天实测的基线**为准：只比较“失败集合是否一致”和“测试总数是否恰好增加新增数”。

## 文件结构

| 文件 | 责任 | 任务 |
| --- | --- | --- |
| `js/music-intent.js` | 队列播放封闭语法与 `bare` 参数 | 1 |
| `js/assistant-contract.js` | `hasCandidates()`；`routeRequest` 传 `bare` | 1 |
| `js/assistant-tools.js` | `quickQueuePlayPlan` 传 `bare` | 1 |
| `js/assistant-engine.js` | `readSeen` 记录、清空与 `nextPlan()` 拦截 | 2 |
| `local-ai/control-store.mjs` | `planningStrategy` 策略字段与校验 | 3 |
| `local-ai/gateway.mjs` | 自适应起步、`startReason`、恢复判定排除 | 4 |
| `settings.html`、`js/ai-control.js` | 设置下拉与保存字段 | 5 |
| `js/assistant-timeline.js`、`assistant.html`、`js/ai-history.js` | 展示 `startReason` | 5 |
| `local-ai/evaluate-assistant-todo.mjs` | `--in-process --strategy=` 评估模式 | 6 |
| `test/assistant-queue-phrases.test.mjs`、`test/assistant-no-progress.test.mjs`、`test/assistant-speed-ui.test.js` | 新增测试 | 1、2、5 |
| `test/local-ai-control.test.mjs`、`test/local-ai-planner-recovery.test.mjs` | 追加测试 | 3、4 |
| `test/assistant-adaptive.test.js`、`test/assistant-approval.test.mjs` | 各改 1 行，避免测试靠重复读取撑到上限 | 2 |
| `AGENTS.md`、`local-ai/README.md`、`docs/technical/*` | 能力说明、验证结果、索引 | 7 |

---

### Task 0：开工前检查与基线（不改代码）

**Files:**
- 不修改仓库文件；创建仓库外的临时脚本 `/tmp/speed-check.sh`。

**Interfaces:**
- Produces: `/tmp/speed-check.sh <label>`，运行相关回归、输出汇总，并与 `/tmp/speed-baseline-related.txt` 比较失败集合。

- [x] **Step 1：确认起点并记录文件状态**

```bash
cd /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background
git status --short -- js/music-intent.js js/assistant-contract.js js/assistant-tools.js js/assistant-engine.js local-ai/control-store.mjs local-ai/gateway.mjs local-ai/evaluate-assistant-todo.mjs settings.html assistant.html js/ai-control.js js/ai-history.js js/assistant-timeline.js AGENTS.md local-ai/README.md test/assistant-adaptive.test.js test/assistant-approval.test.mjs test/local-ai-control.test.mjs test/local-ai-planner-recovery.test.mjs
git diff --check -- js/music-intent.js js/assistant-contract.js js/assistant-tools.js js/assistant-engine.js local-ai/control-store.mjs local-ai/gateway.mjs settings.html assistant.html js/ai-control.js js/ai-history.js js/assistant-timeline.js AGENTS.md local-ai/README.md test/assistant-adaptive.test.js test/assistant-approval.test.mjs test/local-ai-control.test.mjs test/local-ai-planner-recovery.test.mjs
```

预期：`git status` 中 ` M` 表示该文件已带有他人的未提交改动（保留），`??` 表示未跟踪（如 `local-ai/evaluate-assistant-todo.mjs`），无标记表示干净；`git diff --check` 无输出。记下这些状态，最后对照，确认没有无关文件被改动。

- [x] **Step 2：创建回归比较脚本**

**新建 `/tmp/speed-check.sh`**

```bash
#!/bin/bash
# 用法：/tmp/speed-check.sh <label>
# 在仓库根目录运行相关回归，输出汇总，并与 /tmp/speed-baseline-related.txt 比较失败集合。
cd /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background || exit 2
label="${1:?用法：/tmp/speed-check.sh <label>}"
out="/tmp/speed-${label}-related.txt"
node --test test/assistant-*.test.js test/assistant-*.test.mjs test/local-ai-*.test.mjs test/music-*.test.js > "$out" 2>&1
grep -E "^ℹ (tests|pass|fail)" "$out"
failures() { grep -E "^✖ " "$1" | sed -E 's/ \([0-9.]+ms\)$//' | sort -u; }
if diff <(failures /tmp/speed-baseline-related.txt) <(failures "$out"); then
  echo "失败集合与基线一致"
else
  echo "失败集合与基线不同：上方 < 为基线、> 为当前，请逐项分析"
fi
```

```bash
chmod +x /tmp/speed-check.sh
```

- [x] **Step 3：记录基线**

```bash
/tmp/speed-check.sh baseline
node --test test/*.test.js test/*.test.mjs > /tmp/speed-baseline-full.txt 2>&1
grep -E "^ℹ (tests|pass|fail)" /tmp/speed-baseline-full.txt
```

预期（设计时）：相关回归 `tests 555 / pass 550 / fail 5`，最后一行 `失败集合与基线一致`；全量 `tests 1123 / pass 1115 / fail 8`。数字不同时以实测为准并记下。

---

### Task 1：队列播放封闭语法与裸“随机播放”门控

**Files:**
- Modify: `js/music-intent.js`（`queuePlayRequest`）
- Modify: `js/assistant-contract.js`（新增 `hasCandidates`；`routeRequest` 传 `bare`）
- Modify: `js/assistant-tools.js`（`quickQueuePlayPlan` 传 `bare`）
- Create: `test/assistant-queue-phrases.test.mjs`

**Interfaces:**
- Consumes: 现有 `MusicIntent.artistRequest()` 与 `MusicIntent.parseLocal()`；它们调用 `queuePlayRequest(value)` 时**不传**选项，必须继续对队列说法返回 `null`。
- Produces: `MusicIntent.queuePlayRequest(text, { bare } = {})` → `null | {} | { mode: 'shuffle' }`；`AssistantContract.hasCandidates(task)` → `boolean`（`Boolean(task?.choices?.length || task?.candidateSet?.choices?.length)`）。

- [x] **Step 1：先写测试**

测试覆盖：真实说法的正例（含随机与顺序）、含歌手/条件/复合/指代的反例、裸“随机播放”的 `bare` 门控、歌手识别与本地解析不误判、路由在有/无候选时的两种结果，以及端到端“读一次状态、播放一次、0 次模型调用”。

**新建 `test/assistant-queue-phrases.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Music from '../js/music-intent.js';
import Contract from '../js/assistant-contract.js';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import Todo from '../js/assistant-todo.js';

const shuffle = { mode: 'shuffle' };

test('队列播放语法覆盖真实说法，并区分随机与顺序播放', () => {
  for (const text of ['随机播放队里的歌曲', '随机播放队列中的歌曲', '随机播放当前队列', '随机播放已有队列', '随机播放队里中的歌曲', '随机播放队列歌曲',
    '随机播放列表歌曲', '随机播放列表里的歌曲', '随机播放列表', '随机播放当前列表', '随机播放播放列表', '随机播放一下队列', '请随机播放当前队列',
    '把队列随机播放', '列表歌曲随机播放', '队列里的歌曲随机播放', '队列随机播放', '随机播放列表歌曲。', '帮我随机播放队列里面的歌曲吧']) {
    assert.deepEqual(Music.queuePlayRequest(text), shuffle, text);
  }
  for (const text of ['播放队列', '播放队列里的歌曲', '播放列表歌曲', '听队列里的歌', '播放队列吧', '播放一下当前队列', '队列播放', '列表歌曲播放']) {
    assert.deepEqual(Music.queuePlayRequest(text), {}, text);
  }
});

test('含歌手、条件、复合、指代或多余对象的说法一律不命中', () => {
  for (const text of ['随机播放添加到队列里的歌曲', '随机播放周杰伦的歌曲', '如果队列有歌就随机播放', '随机播放歌单', '随机播放歌单里的歌', '播放列表', '听列表',
    '播放当前列表', '播放我的收藏列表', '随机播放队列里的周杰伦', '清空队列后随机播放', '随机播放队列然后30分钟后停止', '播放队列里的下一首',
    '随机播放歌曲', '播放歌曲', '随机播放这些歌曲', '随机播放我的队列', '', '随机', '队列']) {
    assert.equal(Music.queuePlayRequest(text), null, text);
    assert.equal(Music.queuePlayRequest(text, { bare: true }), null, `${text}（允许裸随机播放时）`);
  }
});

test('裸“随机播放”只在调用方允许时命中，且不误伤带对象的说法', () => {
  for (const text of ['随机播放', '随机播放。', '请随机播放', '帮我随机播放一下', '随机播放吧']) {
    assert.equal(Music.queuePlayRequest(text), null, text);
    assert.deepEqual(Music.queuePlayRequest(text, { bare: true }), shuffle, text);
  }
  for (const text of ['随机播放周杰伦', '没问题，可以直接随机播放。', '播放', '听']) {
    assert.equal(Music.queuePlayRequest(text, { bare: true }), null, text);
  }
});

test('歌手识别与本地解析不会把队列说法当成歌曲搜索', () => {
  for (const text of ['随机播放列表歌曲', '列表歌曲随机播放', '随机播放队列歌曲', '播放列表歌曲', '随机播放']) {
    assert.equal(Music.artistRequest(text), null, text);
    assert.equal(Music.parseLocal(text), null, text);
  }
});

function store() {
  const data = {};
  return { async get() { return structuredClone(data); }, async set(value) { Object.assign(data, structuredClone(value)); }, async remove(key) { delete data[key]; }, data };
}
const context = task => {
  const ctx = { task, guard() {}, async progress() {}, async trace(_tool, _title, _input, fn) { return fn(ctx); } };
  return ctx;
};

test('路由：无候选的裸“随机播放”是新的音乐需求；有候选时保持续接', () => {
  for (const current of [null, { scope: 'music', status: 'completed', choices: [] }, { scope: 'alarm', status: 'completed' }]) {
    const routed = Contract.routeRequest({ text: '随机播放。' }, current);
    assert.equal(routed.mode, 'new'); assert.equal(routed.input.app, 'music');
  }
  const waiting = { scope: 'music', status: 'waiting', choices: [{ id: 'song-1' }], candidateSet: { choices: [{ id: 'song-1' }] } };
  const kept = Contract.routeRequest({ text: '随机播放' }, waiting);
  assert.equal(kept.mode, 'continue'); assert.equal(kept.input.app, 'music');
  assert.equal(Contract.routeRequest({ text: '随机播放列表歌曲' }, waiting).mode, 'new', '明确的队列说法不受候选影响');
  assert.equal(Contract.hasCandidates({ candidateSet: { choices: [{ id: 'a' }] } }), true);
  assert.equal(Contract.hasCandidates({ choices: [] }), false);
  assert.equal(Contract.hasCandidates(null), false);
});

test('真实说法走确定性快速路径：读一次状态、播放一次、不调用模型', async () => {
  for (const [text, mode] of [['随机播放列表歌曲', 'shuffle'], ['列表歌曲随机播放', 'shuffle'], ['随机播放队列歌曲', 'shuffle'], ['随机播放队里中的歌曲', 'shuffle'], ['随机播放。', 'shuffle'], ['随机播放', 'shuffle'], ['播放列表歌曲', undefined]]) {
    const storage = store(); let reads = 0, plays = 0, modelCalls = 0;
    const handlers = Tools.create({ storage,
      readMusicState: async () => { reads++; return { status: 'ready', revision: 'queue-v1', count: 3, mode: 'loop', isPlaying: false, songs: [] }; },
      playCurrentQueue: async (revision, _songId, _ctx, playMode) => {
        assert.equal(revision, 'queue-v1'); assert.equal(playMode, mode); plays++;
        return { status: 'ready', revision: 'queue-v2', count: 3, mode: mode || 'loop', isPlaying: true, currentSong: { title: '测试歌曲', artist: '测试歌手' } };
      },
      ai: async () => { modelCalls++; throw new Error(`${text} 不应调用模型`); }
    });
    const engine = Engine.create({ storage, ...handlers });
    await engine.submit({ text });
    const result = await engine.settled();
    assert.equal(result.status, 'completed', `${text}: ${result.message}`);
    assert.equal(modelCalls, 0, text); assert.equal(reads, 1, text); assert.equal(plays, 1, text);
    assert.equal(result.recoveryCount, 0, text);
  }
});

test('有待选候选时裸“随机播放”交给完整规划，无候选时命中快速路径', async () => {
  const input = { app: 'music', text: '随机播放' };
  const task = extra => ({ id: 'bare', input, todoTips: Todo.create(input), observations: [], turns: [], log: [], memory: {}, startedAt: Date.now(), ...extra });
  let modelCalls = 0;
  const handlers = Tools.create({
    readMusicState: async () => { throw new Error('快速路径之外不应读取队列'); },
    ai: async request => { modelCalls++; assert.equal(request.input.planningPhase, 'outline'); return { ok: true, data: { question: '交给完整规划处理' } }; }
  });
  const planned = await handlers.plan(input, context(task({ choices: [{ id: 'song-1', title: '候选歌曲' }] })));
  assert.equal(planned.question, '交给完整规划处理'); assert.equal(modelCalls, 1);
  const quick = await handlers.plan(input, context(task({ choices: [] })));
  assert.equal(quick.todoTips[0].tool, 'music.queue.play'); assert.deepEqual(quick.todoTips[0].args, { mode: 'shuffle' });
  assert.equal(modelCalls, 1, '快速路径不再调用模型');
});
```

- [x] **Step 2：运行，确认按预期失败**

```bash
node --test test/assistant-queue-phrases.test.mjs
```

预期：`tests 7 / pass 1 / fail 6`。唯一通过的是“含歌手、条件、复合、指代或多余对象的说法一律不命中”（它是防回归护栏）；其余失败，例如语法用例断言 `随机播放队里中的歌曲`、快速路径用例 `随机播放列表歌曲 不应调用模型`、门控用例 `Cannot read properties of undefined`。

- [x] **Step 3：实现**

先改识别器（封闭语法，整句完全匹配，含歌手/条件/复合的一律 `null`）：

**编辑 `js/music-intent.js`**

Find:

```js
    return result;
  }
  function queuePlayRequest(text) {
    const value = String(text || '').trim().replace(/[。！!]+$/, '').replace(/\s+/g, '');
    if (!/^(?:请帮我|帮我|请)?(?:把)?(?:随机播放|播放|听)(?:当前|已有|现有|本地)?(?:队列(?:里|中|内)?|队里|播放列表(?:里|中|内)?)(?:的(?:歌曲|曲目|音乐|歌))?(?:吧|一下)?$/.test(value)) return null;
    return { ...(value.includes('随机播放') ? { mode: 'shuffle' } : {}) };
  }
  function artistRequest(text) {
```

Replace with:

```js
    return result;
  }
  // Closed grammar for "play the existing queue". Artists, conditions and extra
  // steps are deliberately absent: they belong to full planning.
  const queueGrammar = (() => {
    const prefix = '(?:请帮我|帮我|请)?(?:把)?', suffix = '(?:吧|一下)?';
    const scope = '(?:当前|已有|现有|本地)?', place = '(?:里面?|中|内)?', songs = '(?:的)?(?:歌曲|曲目|音乐|歌)';
    const strong = `${scope}(?:队列|队里|播放列表)${place}(?:${songs})?`;
    const weak = `${scope}列表${place}${songs}`, weakBare = `${scope}列表${place}`;
    return Object.freeze({
      shuffleForward: new RegExp(`^${prefix}随机播放(?:一下)?(?:${strong}|${weak}|${weakBare})${suffix}$`),
      shuffleReverse: new RegExp(`^${prefix}(?:${strong}|${weak}|${weakBare})随机播放${suffix}$`),
      playForward: new RegExp(`^${prefix}(?:播放|听)(?:一下)?(?:${strong}|${weak})${suffix}$`),
      playReverse: new RegExp(`^${prefix}(?:${strong}|${weak})播放${suffix}$`),
      bareShuffle: new RegExp(`^${prefix}随机播放${suffix}$`)
    });
  })();
  // A bare "随机播放" names no object. Callers allow it only when nothing else
  // (such as a pending candidate list) could be the thing to shuffle.
  function queuePlayRequest(text, { bare = false } = {}) {
    const value = String(text || '').trim().replace(/[。！!]+$/, '').replace(/\s+/g, '');
    if (queueGrammar.shuffleForward.test(value) || queueGrammar.shuffleReverse.test(value) || (bare && queueGrammar.bareShuffle.test(value))) return { mode: 'shuffle' };
    if (queueGrammar.playForward.test(value) || queueGrammar.playReverse.test(value)) return {};
    return null;
  }
  function artistRequest(text) {
```

再改合同：新增 `hasCandidates`，路由按当前任务是否持有候选决定是否允许裸“随机播放”，并导出：

**编辑 `js/assistant-contract.js`（第 1/3 处）**

Find:

```js
    return { index: n || 0, play: /直接|播放|放|听/.test(match[0]) };
  }
  function routeRequest(raw, current) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('需求输入无效');
```

Replace with:

```js
    return { index: n || 0, play: /直接|播放|放|听/.test(match[0]) };
  }
  // A live candidate list means a bare "随机播放" may refer to those results, so
  // only full planning can resolve it. Engine tasks and snapshots share these fields.
  const hasCandidates = task => Boolean(task?.choices?.length || task?.candidateSet?.choices?.length);
  function routeRequest(raw, current) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('需求输入无效');
```

**编辑 `js/assistant-contract.js`（第 2/3 处）**

Find:

```js
      && !/(?:怎么样|好听吗|好听么|可以吗|行吗|是谁|是什么|为什么|为何|吗|么|呢|吧|呀)$/.test(text);
    const queueEdit = /清除|清空|移除|删除|删掉|去掉/.test(text) && /队列|播放列表|队里|队中/.test(text);
    const queuePlay = Boolean(Music?.queuePlayRequest(text));
    let inferred = /(?:YouTube|油管)/i.test(text) ? 'youtube' : /B站|哔哩哔哩/i.test(text) ? 'bilibili'
      : /提醒我|提醒一下|闹钟|(?:创建|设置|新增|查看|看看|列出).{0,20}提醒/.test(text) ? 'alarm'
```

Replace with:

```js
      && !/(?:怎么样|好听吗|好听么|可以吗|行吗|是谁|是什么|为什么|为何|吗|么|呢|吧|呀)$/.test(text);
    const queueEdit = /清除|清空|移除|删除|删掉|去掉/.test(text) && /队列|播放列表|队里|队中/.test(text);
    const queuePlay = Boolean(Music?.queuePlayRequest(text, { bare: !hasCandidates(current) }));
    let inferred = /(?:YouTube|油管)/i.test(text) ? 'youtube' : /B站|哔哩哔哩/i.test(text) ? 'bilibili'
      : /提醒我|提醒一下|闹钟|(?:创建|设置|新增|查看|看看|列出).{0,20}提醒/.test(text) ? 'alarm'
```

**编辑 `js/assistant-contract.js`（第 3/3 处）**

Find:

```js
    return { mode, input:{ ...parsed, app, ...(aiSpecified ? { ai:selectedAI } : {}) }, reason:raw.newConversation ? '快捷键新需求' : !current ? '首次需求' : changedScope ? '切换应用' : replaceSearch ? (correction ? '纠正上次搜索' : '替换搜索关键词') : fresh ? '独立需求' : reference ? '引用当前会话' : '保留上下文' };
  }
  return Object.freeze({ apps, skills, tools, toolGroups, allows, input, appId, inputHint, aiSelection, validatePlan, localPlan, ordinal, routeRequest });
});
```

Replace with:

```js
    return { mode, input:{ ...parsed, app, ...(aiSpecified ? { ai:selectedAI } : {}) }, reason:raw.newConversation ? '快捷键新需求' : !current ? '首次需求' : changedScope ? '切换应用' : replaceSearch ? (correction ? '纠正上次搜索' : '替换搜索关键词') : fresh ? '独立需求' : reference ? '引用当前会话' : '保留上下文' };
  }
  return Object.freeze({ apps, skills, tools, toolGroups, allows, input, appId, inputHint, aiSelection, validatePlan, localPlan, ordinal, hasCandidates, routeRequest });
});
```

最后让快速路径使用同一门控：

**编辑 `js/assistant-tools.js`**

Find:

```js
    }
    function quickQueuePlayPlan(input, ctx) {
      const request = input.app === 'music' && !input.skill && Music.queuePlayRequest(input.text);
      const todo = ctx.task.todoTips;
      if (!request || !todo || todo.goal !== input.text || todo.sources.length !== 1 || ctx.task.remainingSteps?.length) return null;
```

Replace with:

```js
    }
    function quickQueuePlayPlan(input, ctx) {
      const request = input.app === 'music' && !input.skill && Music.queuePlayRequest(input.text, { bare: !Contract.hasCandidates(ctx.task) });
      const todo = ctx.task.todoTips;
      if (!request || !todo || todo.goal !== input.text || todo.sources.length !== 1 || ctx.task.remainingSteps?.length) return null;
```

- [x] **Step 4：运行，确认通过**

```bash
node --test test/assistant-queue-phrases.test.mjs
node --check js/music-intent.js && node --check js/assistant-contract.js && node --check js/assistant-tools.js
```

预期：`tests 7 / pass 7 / fail 0`，语法检查无输出。

- [x] **Step 5：检查点（不提交）**

```bash
/tmp/speed-check.sh t1
```

预期：`tests` 恰好比基线多 7，`fail` 数不变，最后一行 `失败集合与基线一致`。若出现新的失败，先看是否为 `assistant-todo`、`assistant-mvp`、`music-*` 中依赖旧语法的用例，逐个分析，不要放宽新语法。

---

### Task 2：Engine 无进展保护

**Files:**
- Modify: `js/assistant-engine.js`
- Modify: `test/assistant-adaptive.test.js`（1 行）
- Modify: `test/assistant-approval.test.mjs`（1 行）
- Create: `test/assistant-no-progress.test.mjs`

**Interfaces:**
- Consumes: `Contract.tools[tool].readOnly` 与 `.title`；`recover()` 现有的 `modelRepair` 分支（`ASSISTANT_PLAN_INVALID`）与 `ASSISTANT_RECOVERY_LIMIT`；`accept(t, version, outcome)` 调用点。
- Produces: 任务快照字段 `readSeen: string[]`（随 `quickAssistantTaskV1` 保存，不进入 `view()` 与模型输入）；拒绝重复读取时的错误文案以“已读取过完全相同的「工具标题」”开头。

- [x] **Step 1：先写测试，并调整两处既有测试**

新增测试覆盖：重放 2026-09-23 空转、拒绝一次后改用不同步骤可继续、写入后允许重新读取、不同参数不算重复、重复 `tools.load` 在规划阶段被拒绝、失败/unknown 后允许核对读取、用户选择开始新执行轮并清空记录。

**新建 `test/assistant-no-progress.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import Engine from '../js/assistant-engine.js';
import Tools from '../js/assistant-tools.js';
import { createGateway } from '../local-ai/gateway.mjs';
import { createControlStore } from '../local-ai/control-store.mjs';

const step = (tool, args = {}, more = true) => ({ steps: [{ tool, args }], ...(more ? { continue: true } : {}) });
const state = revision => ({ status: 'ready', revision, count: 3, mode: 'sequence', isPlaying: false, songs: [] });
const playing = mode => ({ status: 'ready', revision: 'v2', count: 3, mode, isPlaying: true, currentSong: { title: '测试歌曲', artist: '测试歌手' } });
const defaultOutline = text => [{ text, source: 0, ...(/随机播放/.test(text) ? { tool: 'music.queue.play', args: { mode: 'shuffle' } } : { tool: 'music.state' }) }];

function fixture(responses, deps = {}, outline = defaultOutline) {
  const values = {}, inputs = [];
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const gateway = createGateway({ control: createControlStore(), provider: { model: 'fixture', planningContext: async () => ({ contextLength: 40960, contextSource: 'loaded-model' }), async generateObject(request) {
    if (request.input.planningPhase === 'outline') return { todoTips: outline(request.input.text) };
    inputs.push(structuredClone(request.input));
    assert.ok(responses.length, '不应产生额外规划');
    return responses.shift();
  } } });
  const handlers = Tools.create({ storage, readMusicState: async () => state('v1'), ...deps,
    ai: async request => ({ ok: true, ...await gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }) });
  let sequence = 0;
  return { values, inputs, responses, engine: Engine.create({ storage, ...handlers, id: () => `no-progress-${++sequence}` }) };
}
async function submit(f, text, app = 'music') {
  await f.engine.submit({ text, app });
  return f.engine.settled();
}

test('重放 09-23 空转：相同的只读查询只执行一次，模型最多规划三次', async () => {
  let reads = 0;
  const f = fixture([step('music.state'), step('music.state'), step('music.state'), step('music.state')], {
    readMusicState: async () => { reads++; return { ...state('stale-v1'), status: 'stale' }; }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'failed', task.message);
  assert.match(task.message, /同一操作重复失败/);
  assert.match(task.message, /已读取过完全相同/);
  assert.equal(reads, 1);
  assert.equal(f.inputs.length, 3);
  assert.equal(f.responses.length, 1, '第三次重复后不再向模型要第四次规划');
  assert.equal(task.recoveryCount, 1);
  const feedback = f.inputs[2].observations.at(-1);
  assert.equal(feedback.status, 'failed');
  assert.equal(feedback.data.error.code, 'ASSISTANT_PLAN_INVALID');
  assert.match(feedback.message, /已读取过完全相同/);
});

test('重复读取被拒绝一次后，模型改用不同的下一步可以继续', async () => {
  let reads = 0, plays = 0;
  const f = fixture([step('music.state'), step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), { done: true }], {
    readMusicState: async () => { reads++; return state('v1'); },
    playCurrentQueue: async (revision, _songId, _ctx, mode) => { assert.equal(revision, 'v1'); assert.equal(mode, 'shuffle'); plays++; return playing(mode); }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(reads, 1); assert.equal(plays, 1); assert.equal(task.recoveryCount, 1);
});

test('写入之后允许重新读取：读取、播放、再读取都不会被拦截', async () => {
  let reads = 0, plays = 0;
  const outline = () => [{ text: '随机播放队列', source: 0, tool: 'music.queue.play', args: { mode: 'shuffle' } }, { text: '核对播放状态', source: 1, tool: 'music.state' }];
  const f = fixture([step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), step('music.state'), { done: true }], {
    readMusicState: async () => { reads++; return reads === 1 ? state('v1') : playing('shuffle'); },
    playCurrentQueue: async (revision, _songId, _ctx, mode) => { assert.equal(revision, 'v1'); plays++; return playing(mode); }
  }, outline);
  const task = await submit(f, '随机播放队列\n核对播放状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(reads, 2); assert.equal(plays, 1); assert.equal(task.recoveryCount, 0);
});

test('参数不同的只读调用不算重复', async () => {
  const f = fixture([step('tools.load', { group: 'music.queue' }), step('tools.load', { group: 'music.edit' }), step('music.state'), { done: true }]);
  const task = await submit(f, '检查队列状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 0);
  assert.deepEqual(f.values[Engine.KEY].memory.toolGroups.slice(0, 2), ['music.queue', 'music.edit']);
});

test('重复加载同一工具组在规划阶段被拒绝，不进入执行器', async () => {
  const f = fixture([step('tools.load', { group: 'music.queue' }), step('tools.load', { group: 'music.queue' }), step('music.state'), { done: true }]);
  const task = await submit(f, '检查队列状态');
  assert.equal(task.status, 'completed', task.message);
  assert.equal(task.recoveryCount, 1);
  const feedback = f.inputs[2].observations.at(-1);
  assert.equal(feedback.data.error.code, 'ASSISTANT_PLAN_INVALID');
  assert.match(feedback.message, /已读取过完全相同/);
});

test('读取失败或写入回执丢失后允许核对读取', async () => {
  let reads = 0, plays = 0;
  const f = fixture([step('music.state'), step('music.queue.play', { expectedRevision: 'v1', mode: 'shuffle' }), step('music.state', {}, false)], {
    readMusicState: async () => { reads++; return state('v1'); },
    playCurrentQueue: async () => { plays++; throw new Error('已提交，但回执通道断开'); }
  });
  const task = await submit(f, '随机播放队列，然后核对播放状态');
  assert.equal(task.status, 'clarify', task.message);
  assert.equal(reads, 2); assert.equal(plays, 1);
  assert.equal(f.inputs.at(-1).observations.at(-1).status, 'unknown');
  assert.equal(task.recoveryCount, 1);
});

test('选择开始新的执行轮，并清空已读记录', async () => {
  const now = Date.now();
  const values = { [Engine.KEY]: { id: 'seed', version: 1, status: 'waiting', scope: 'music', input: { text: '搜索候选', app: 'music' },
    plan: [{ tool: 'video.search', args: {} }], index: 0, adaptive: false, jobId: null,
    log: [{ tool: 'video.search', title: '搜索视频', status: 'waiting' }], turns: [], messages: [], trace: [], memory: {}, observations: [],
    choices: [{ id: 'c1', title: '候选一', action: 'music.play', data: {} }], keepChoices: true,
    candidateSet: { choices: [{ id: 'c1', title: '候选一', action: 'music.play', data: {} }], expiresAt: now + 60000 },
    readSeen: ['music.state\n{}'], startedAt: now, updatedAt: now } };
  const storage = { async get() { return structuredClone(values); }, async set(value) { Object.assign(values, structuredClone(value)); }, async remove(key) { delete values[key]; } };
  const engine = Engine.create({ storage, plan: async () => ({ done: true, steps: [] }), execute: async () => ({ message: '不应执行' }), choose: async () => ({ message: '已执行所选操作' }) });
  assert.equal((await engine.snapshot()).status, 'waiting');
  await engine.choose('seed', 'c1', 1);
  const result = await engine.settled();
  assert.equal(result.status, 'completed', result.message);
  assert.deepEqual(values[Engine.KEY].readSeen, []);
});
```

`test/assistant-adaptive.test.js`（“规划有上限…”）与 `test/assistant-approval.test.mjs`（“第十二个工具准备提醒后不能额外自动提交”）原先用**反复提出完全相同的只读步骤**来撑到 12 轮/12 工具上限。这正是本保护要提前终止的行为（演练中确认：不改的话二者会因新保护提前失败）。因此各改一行，让每轮参数不同；上限逻辑与断言不变：

**编辑 `test/assistant-adaptive.test.js`**

Find:

```js
plan: async () => { calls++; return step('music.state'); }
```

Replace with:

```js
plan: async () => { calls++; return step('music.queue.list', { offset: calls }); }
```

**编辑 `test/assistant-approval.test.mjs`**

Find:

```js
++rounds === 12 ? prepare : { tool: 'alarm.list', args: {} }
```

Replace with:

```js
++rounds === 12 ? prepare : { tool: 'alarm.list', args: { query: `提醒${rounds}` } }
```

- [x] **Step 2：运行，确认按预期失败**

```bash
node --test test/assistant-no-progress.test.mjs
```

预期：`tests 7 / pass 3 / fail 4`。失败的是：重放 09-23（文案不匹配 `同一操作重复失败`）、“重复读取被拒绝一次后…”、“重复加载同一工具组在规划阶段被拒绝…”（当前会走到执行器并报 `加载工具后必须重新规划`）、“选择开始新的执行轮…”（`readSeen` 不存在）。通过的三项是护栏：写入后允许重读、参数不同、失败/unknown 后允许核对。

- [x] **Step 3：实现**

按文件顺序应用下列编辑。含义依次是：`readFingerprint()` 辅助函数；`accept()` 接收 `step` 并维护 `readSeen`；`recover()` 在**工具执行**失败/unknown 时清空；`nextPlan()` 拒绝与已读指纹相同的首步只读提议；执行循环把 `step` 传给 `accept()`（选择动作与直接播放的调用保持不传，因此会清空）；`choose()` 开始新执行轮时清空。

**编辑 `js/assistant-engine.js`（第 1/7 处）**

Find:

```js
    const choices = (task.choices || []).filter(choice => ['music.enqueue-collection', 'music.play-artist'].includes(choice.action) && /热门歌曲/.test(choice.title || ''));
    return choices.length === 1 ? choices[0] : null;
  }
  function traceValue(value) {
```

Replace with:

```js
    const choices = (task.choices || []).filter(choice => ['music.enqueue-collection', 'music.play-artist'].includes(choice.action) && /热门歌曲/.test(choice.title || ''));
    return choices.length === 1 ? choices[0] : null;
  }
  // Canonical identity of a read-only proposal. Oversized arguments are never
  // treated as duplicates, so this cannot hide a genuinely different request.
  function readFingerprint(step) {
    if (!step || !Contract.tools[step.tool]?.readOnly) return null;
    const canonical = value => Array.isArray(value) ? value.map(canonical)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
    const args = JSON.stringify(canonical(step.args || {}));
    return args.length > 2000 ? null : `${step.tool}\n${args}`;
  }
  function traceValue(value) {
```

**编辑 `js/assistant-engine.js`（第 2/7 处）**

Find:

```js
      };
    }
    async function accept(t, version, outcome) {
      await lock(async () => {
        guard(t, version);
```

Replace with:

```js
      };
    }
    async function accept(t, version, outcome, step) {
      await lock(async () => {
        guard(t, version);
```

**编辑 `js/assistant-engine.js`（第 3/7 处）**

Find:

```js
        t.log.at(-1).status = waiting ? 'waiting' : 'done';
        t.log.at(-1).message = t.message;
        let observation;
        try { observation = Context.observe(t, { tool: t.log.at(-1).tool, status: waiting ? 'waiting' : 'done', message: t.message.slice(0, 500), data: outcome.observation || null }, t.log.at(-1)); }
```

Replace with:

```js
        t.log.at(-1).status = waiting ? 'waiting' : 'done';
        t.log.at(-1).message = t.message;
        // Successful read-only calls since the last write, choice or recovery. Anything
        // else changes the world (or the plan), so an identical read may return new data.
        if (step && Contract.tools[step.tool]?.readOnly) {
          const fingerprint = readFingerprint(step);
          if (fingerprint && !waiting) t.readSeen = [...(t.readSeen || []).filter(item => item !== fingerprint), fingerprint].slice(-24);
        } else t.readSeen = [];
        let observation;
        try { observation = Context.observe(t, { tool: t.log.at(-1).tool, status: waiting ? 'waiting' : 'done', message: t.message.slice(0, 500), data: outcome.observation || null }, t.log.at(-1)); }
```

**编辑 `js/assistant-engine.js`（第 4/7 处）**

Find:

```js
        }
        recovery.count++; recovery.failures.push(fingerprint);
        const observation = Context.observe(t, { tool: phase === 'action' ? 'assistant.action' : step.tool, status: unknown ? 'unknown' : 'failed', message,
          data: { operation: step.tool, error: { code, message }, args, recovery: { attempt: recovery.count, remaining: 3 - recovery.count, sideEffectState: unknown ? 'unknown' : 'none' } } });
```

Replace with:

```js
        }
        recovery.count++; recovery.failures.push(fingerprint);
        // A failed or unknown tool run may have changed state: verification reads are legitimate again.
        if (phase !== 'plan') t.readSeen = [];
        const observation = Context.observe(t, { tool: phase === 'action' ? 'assistant.action' : step.tool, status: unknown ? 'unknown' : 'failed', message,
          data: { operation: step.tool, error: { code, message }, args, recovery: { attempt: recovery.count, remaining: 3 - recovery.count, sideEffectState: unknown ? 'unknown' : 'none' } } });
```

**编辑 `js/assistant-engine.js`（第 5/7 处）**

Find:

```js
            Todo.prepare(t, validated);
            if (validated.steps.length === 1) Todo.before(t, validated.steps[0]);
            return validated;
          }
```

Replace with:

```js
            Todo.prepare(t, validated);
            if (validated.steps.length === 1) Todo.before(t, validated.steps[0]);
            const repeated = readFingerprint(validated.steps[0]);
            if (repeated && (t.readSeen || []).includes(repeated)) throw new Error(`已读取过完全相同的「${Contract.tools[validated.steps[0].tool].title}」，且之后没有写入、选择或失败恢复，重复读取不会有新信息。请依据已有回执给出下一步、用 question 说明需要用户提供什么，或在原始要求已满足时输出 done。`);
            return validated;
          }
```

**编辑 `js/assistant-engine.js`（第 6/7 处）**

Find:

```js
          });
          if (!outcome) continue;
          await accept(t, version, outcome);
          // Only an explicit direct-play request and a single real candidate can skip disambiguation.
          if (t.status === 'waiting' && t.musicView?.kind === 'search' && !t.memory?.artistRequest && /直接播放/.test(t.input.text) && !/不要|不想|别|先不|不要直接|不用|如果/.test(t.input.text)) {
```

Replace with:

```js
          });
          if (!outcome) continue;
          await accept(t, version, outcome, step);
          // Only an explicit direct-play request and a single real candidate can skip disambiguation.
          if (t.status === 'waiting' && t.musicView?.kind === 'search' && !t.memory?.artistRequest && /直接播放/.test(t.input.text) && !/不要|不想|别|先不|不要直接|不用|如果/.test(t.input.text)) {
```

**编辑 `js/assistant-engine.js`（第 7/7 处）**

Find:

```js
          current.status = 'running'; current.version++; current.runStartedAt = now(); current.usedModel = false;
          current.turnId = id(); current.endedAt = null;
          current.toolCalls = 0; current.planRounds = 0;
          current.recovery = { count: 0, failures: [] };
          current.turns.push({ role: 'user', content: userText || `选择：${choice.title}` }); current.turns = current.turns.slice(-16);
```

Replace with:

```js
          current.status = 'running'; current.version++; current.runStartedAt = now(); current.usedModel = false;
          current.turnId = id(); current.endedAt = null;
          current.toolCalls = 0; current.planRounds = 0; current.readSeen = [];
          current.recovery = { count: 0, failures: [] };
          current.turns.push({ role: 'user', content: userText || `选择：${choice.title}` }); current.turns = current.turns.slice(-16);
```

- [x] **Step 4：运行，确认通过**

```bash
node --test test/assistant-no-progress.test.mjs test/assistant-adaptive.test.js test/assistant-approval.test.mjs
node --check js/assistant-engine.js
```

预期：`tests 33 / pass 33 / fail 0`（新增 7 + 既有各 13），语法检查无输出。

- [x] **Step 5：检查点（不提交）**

```bash
/tmp/speed-check.sh t2
```

预期：`tests` 比基线多 14，`fail` 数不变，`失败集合与基线一致`。

---

### Task 3：控制策略字段 `planningStrategy`

**Files:**
- Modify: `local-ai/control-store.mjs`
- Modify: `test/local-ai-control.test.mjs`（导入 + 末尾追加 1 项）

**Interfaces:**
- Consumes: `createControlStore()` 的 `validate()` 白名单与 `snapshot()/update()/rollback()`。
- Produces: `control.snapshot().policy.planningStrategy`：`'follow' | 'adaptive'`；缺失值（旧策略文件、旧调用方）规范化为 `'follow'`；非法值抛出“规划思考起步策略无效”。

- [x] **Step 1：先写测试**

**编辑 `test/local-ai-control.test.mjs`**

Find:

```js
import { mkdtempSync, rmSync } from 'node:fs';
```

Replace with:

```js
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
```

**追加 `test/local-ai-control.test.mjs`（文件末尾，前面空一行）**

```js
test('规划思考起步策略默认严格按设置，可持久化和回滚，非法值被拒绝', t => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-policy-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'control.json');
  const control = createControlStore({ file });
  assert.equal(control.snapshot().policy.planningStrategy, 'follow');
  control.update({ ...control.snapshot().policy, planningStrategy: 'adaptive' }, 1);
  assert.equal(createControlStore({ file }).snapshot().policy.planningStrategy, 'adaptive');
  assert.throws(() => control.update({ ...control.snapshot().policy, planningStrategy: 'always-off' }, 2), /规划思考起步/);
  assert.equal(control.rollback(1, 2).policy.planningStrategy, 'follow');
  writeFileSync(join(dir, 'legacy.json'), JSON.stringify({ revision: 1, policy: { modelEnabled: true, disabledScenes: [] }, history: [] }));
  assert.equal(createControlStore({ file: join(dir, 'legacy.json') }).snapshot().policy.planningStrategy, 'follow');
});
```

- [x] **Step 2：运行，确认按预期失败**

```bash
node --test test/local-ai-control.test.mjs
```

预期：`tests 6 / pass 5 / fail 1`，失败的是新增用例，首个断言 `actual: undefined`（期望 `'follow'`）。

- [x] **Step 3：实现**

**编辑 `local-ai/control-store.mjs`（第 1/3 处）**

Find:

```js
'contextCompaction', 'layaMode', 'modelEnabled'
```

Replace with:

```js
'contextCompaction', 'layaMode', 'planningStrategy', 'modelEnabled'
```

**编辑 `local-ai/control-store.mjs`（第 2/3 处）**

Find:

```js
throw error('Laya 模式无效');
```

Replace with:

```js
throw error('Laya 模式无效');
    const planningStrategy = value.planningStrategy ?? 'follow';
    if (!['follow', 'adaptive'].includes(planningStrategy)) throw error('规划思考起步策略无效');
```

**编辑 `local-ai/control-store.mjs`（第 3/3 处）**

Find:

```js
return { speechSynthesisEnabled, contextCompaction, layaMode, modelEnabled: value.modelEnabled,
```

Replace with:

```js
return { speechSynthesisEnabled, contextCompaction, layaMode, planningStrategy, modelEnabled: value.modelEnabled,
```

- [x] **Step 4：运行，确认通过**

```bash
node --test test/local-ai-control.test.mjs
node --check local-ai/control-store.mjs
```

预期：`tests 6 / pass 6 / fail 0`。

- [x] **Step 5：检查点（不提交）**

```bash
/tmp/speed-check.sh t3
```

预期：`tests` 比基线多 15，`fail` 数不变，`失败集合与基线一致`。若唯一多出的失败是“模型参数持久化校验…”且信息为 `14999 !== 15000`，那是既有的毫秒边界偶发断言，重跑即可。

---

### Task 4：Gateway 自适应起步

**Files:**
- Modify: `local-ai/gateway.mjs`
- Modify: `test/local-ai-planner-recovery.test.mjs`（导入 + 末尾追加 5 项）

**Interfaces:**
- Consumes: Task 3 的 `state.policy.planningStrategy`；`scene.validate(body)` 的结果（含 `planningPhase`、`observations`）。
- Produces: 当 `assistant.plan` 满足自适应条件时，`record.startReason = 'adaptive-receipts'`，出现在 `execution()`、历史记录和第一个尝试；首个尝试 `reasoning='off'`，独占策略剩余超时窗口；`recovered`（沿用 off）判定排除仅由自适应起步产生的上一条记录。

- [x] **Step 1：先写测试**

新增 5 项：直接关闭思考并拿到完整超时（`requestedReasoning` 保持所选值、只占一次准入）；只在“有真实工具回执、非 outline、所选思考不是 off”时生效（含“只有规划失败观察不算回执”）；自适应起步不冒充超时恢复、不使后续无回执规划沿用 off；失败不重试、真实超时恢复优先；真实 Engine + Tools 端到端（首轮按所选档位，读取回执后从 off 起步，用户确认后仍带回执起步）。

**编辑 `test/local-ai-planner-recovery.test.mjs`**

Find:

```js
import Tools from '../js/assistant-tools.js';
```

Replace with:

```js
import Tools from '../js/assistant-tools.js';
import Todo from '../js/assistant-todo.js';
```

**追加 `test/local-ai-planner-recovery.test.mjs`（文件末尾，前面空一行）**

```js
const adaptive = { planningStrategy: 'adaptive' };
const receipt = [{ tool: 'music.state', status: 'done', message: '当前队列共3首。', data: { status: 'ready', revision: 'v1', count: 3 } }];
const withReceipts = { ...input, observations: receipt };

test('自适应起步：已有执行回执时直接关闭思考并拿到完整超时，所选等级和默认设置不变', async () => {
  const f = fixture([answer(plan)], adaptive);
  const result = await f.gateway.run('assistant.plan', withReceipts, { selection });
  assert.deepEqual(f.sent.map(row => row.reasoning), ['off']);
  assert.ok(f.sent[0].timeoutMs > 60000 && f.sent[0].timeoutMs <= 90000);
  assert.equal(f.sent[0].max_output_tokens, 1200);
  assert.equal(result.execution.requestedReasoning, 'medium');
  assert.equal(result.execution.effectiveReasoning, 'off');
  assert.equal(result.execution.startReason, 'adaptive-receipts');
  assert.equal(result.execution.recoveryFromRequestId, undefined);
  assert.equal(result.execution.attempts.length, 1);
  assert.equal(result.execution.attempts[0].startReason, 'adaptive-receipts');
  assert.equal(f.gateway.describe().usage.admitted, 1);
  assert.equal(f.history.snapshot().calls[0].startReason, 'adaptive-receipts');
  assert.equal(f.control.snapshot().policy.reasoning, 'off', '默认设置保持原值');
});

test('自适应起步只在有真实工具回执、非清单分析阶段且思考未关闭时生效', async () => {
  const outline = { ...input, todoTips: Todo.create(input), planningPhase: 'outline', observations: receipt };
  const cases = [
    ['默认 follow 仍按所选设置起步', {}, withReceipts, selection, 'medium'],
    ['没有执行回执', adaptive, input, selection, 'medium'],
    ['只有规划失败观察不算执行回执', adaptive, { ...input, observations: [{ tool: 'assistant.plan', status: 'failed', message: '计划格式无效', data: null }] }, selection, 'medium'],
    ['清单分析阶段', adaptive, outline, selection, 'medium'],
    ['所选思考已经是 off', adaptive, withReceipts, { reasoning: 'off' }, 'off']
  ];
  for (const [name, policy, body, chosen, expected] of cases) {
    const f = fixture([answer(plan)], policy);
    await f.gateway.run('assistant.plan', body, { selection: chosen }).catch(() => {});
    assert.equal(f.sent[0].reasoning, expected, name);
    assert.equal(f.history.snapshot().calls[0].startReason, undefined, name);
  }
});

test('自适应起步不是超时恢复：不会让后续无回执规划继续沿用 off，也不记为恢复来源', async () => {
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  const f = fixture([answer(plan), answer(plan), answer(plan)], adaptive);
  const first = await f.gateway.run('assistant.plan', withReceipts, { selection, trace });
  const second = await f.gateway.run('assistant.plan', withReceipts, { selection, trace });
  const third = await f.gateway.run('assistant.plan', input, { selection, trace });
  assert.deepEqual(f.sent.map(row => row.reasoning), ['off', 'off', 'medium']);
  assert.equal(first.execution.startReason, 'adaptive-receipts'); assert.equal(second.execution.startReason, 'adaptive-receipts');
  assert.equal(second.execution.recoveryFromRequestId, undefined);
  assert.equal(third.execution.recoveryFromRequestId, undefined);
  assert.equal(third.execution.startReason, undefined);
});

test('自适应起步失败不再重试，预算只计一次；真实超时恢复的来源仍照常记录', async () => {
  const f = fixture([Object.assign(new Error('timeout'), { code: 'MODEL_RESPONSE_TIMEOUT' })], adaptive);
  await assert.rejects(f.gateway.run('assistant.plan', withReceipts, { selection }), { code: 'MODEL_RESPONSE_TIMEOUT' });
  assert.equal(f.sent.length, 1);
  assert.equal(f.gateway.describe().usage.admitted, 1);
  const trace = { conversationId: 'conversation', turnId: 'turn', userManaged: true };
  const g = fixture([reasoningOnly, answer(plan), answer(plan)], adaptive);
  const first = await g.gateway.run('assistant.plan', input, { selection, trace });
  const next = await g.gateway.run('assistant.plan', withReceipts, { selection, trace });
  assert.deepEqual(g.sent.map(row => row.reasoning), ['medium', 'off', 'off']);
  assert.equal(next.execution.recoveryFromRequestId, first.requestId);
  assert.equal(next.execution.startReason, undefined, '真实恢复优先，不重复标记为自适应起步');
});

test('真实 Engine 与 Tools：首轮按所选等级，读取回执后的规划轮从 off 起步，用户确认后仍带回执起步', async () => {
  const revision = 'fixture-revision';
  const clear = { steps: [{ tool: 'music.queue.clear', args: { expectedRevision: revision } }], continue: true };
  const f = fixture([answer({ todoTips: [{ text: '清空队列', source: 0, tool: 'music.queue.clear' }] }), answer(plan), answer(clear), answer({ done: true })], adaptive);
  const values = {}, effects = [];
  const storage = { async get() { return structuredClone(values); }, async set(v) { Object.assign(values, structuredClone(v)); }, async remove(k) { delete values[k]; } };
  const handlers = Tools.create({ storage,
    memory: async () => ({ ok: true, revision: 1, enabled: false, preferences: [] }),
    ai: async request => ({ ok: true, ...await f.gateway.run(request.scene, request.input, { selection: request.selection, trace: request.trace }) }),
    readMusicState: async () => ({ status: 'ready', revision, count: 50, isPlaying: false }),
    editMusicQueue: async (action, songId, expectedRevision) => {
      assert.equal(action, 'clear'); assert.equal(expectedRevision, revision); effects.push(action);
      return { status: 'empty', revision: 'fixture-empty', count: 0, isPlaying: false };
    }
  });
  const engine = Engine.create({ storage, ...handlers });
  await engine.submit({ app: 'music', text: '清空队列', ai: selection });
  let task = await engine.settled();
  assert.equal(task.status, 'review'); assert.deepEqual(effects, []);
  await engine.choose(task.id, task.choices.find(c => c.id === 'queue-edit-confirm').id, task.version);
  task = await engine.settled();
  assert.equal(task.status, 'completed', task.message); assert.deepEqual(effects, ['clear']);
  assert.deepEqual(f.sent.map(row => row.reasoning), ['medium', 'medium', 'off', 'off']);
  assert.deepEqual(task.modelCalls.filter(call => call.scene === 'assistant.plan').map(call => call.startReason), [undefined, undefined, 'adaptive-receipts', 'adaptive-receipts']);
  assert.equal(task.input.ai.reasoning, 'medium');
});
```

- [x] **Step 2：运行，确认按预期失败**

```bash
node --test test/local-ai-planner-recovery.test.mjs
```

预期（Task 3 已完成）：`tests 24 / pass 20 / fail 4`。失败的是前述第 1、3、4、5 项（`Expected values to be strictly deep-equal`，实际仍是 `medium` 起步）；第 2 项“只在有真实工具回执…”通过，因为它断言的都是不应改变起步档位的情形（护栏）。

- [x] **Step 3：实现**

三处编辑：`execution()` 输出 `startReason`；`recovered` 判定排除自适应起步记录，并在 `scene.validate(body)` 之后判断是否自适应；第一个尝试记录 `startReason`。

**编辑 `local-ai/gateway.mjs`（第 1/3 处）**

Find:

```js
...(record.recoveryFromRequestId ? { recoveryFromRequestId: record.recoveryFromRequestId } : {}), ...(record.attempts ?
```

Replace with:

```js
...(record.recoveryFromRequestId ? { recoveryFromRequestId: record.recoveryFromRequestId } : {}), ...(record.startReason ? { startReason: record.startReason } : {}), ...(record.attempts ?
```

**编辑 `local-ai/gateway.mjs`（第 2/3 处）**

Find:

```js
          previous.effectiveReasoning === 'off' && previous.attempts?.at(-1)?.status === 'succeeded';
        if (recovered) record.recoveryFromRequestId = previous.requestId;
        const planningReasoning = recovered ? 'off' : selected.reasoning;
        // Strip caller-supplied prompts, provider URLs, credentials and unrelated context.
        const validated = scene.validate(body);
```

Replace with:

```js
          previous.effectiveReasoning === 'off' && previous.attempts?.at(-1)?.status === 'succeeded' &&
          previous.startReason !== 'adaptive-receipts';
        if (recovered) record.recoveryFromRequestId = previous.requestId;
        // Strip caller-supplied prompts, provider URLs, credentials and unrelated context.
        const validated = scene.validate(body);
        // Opt-in policy: a planning round that already holds executor receipts starts with
        // thinking off. The selected level stays the ceiling and no setting is changed.
        const adaptiveStart = sceneId === 'assistant.plan' && !recovered && selected.reasoning !== 'off' && state.policy.planningStrategy === 'adaptive' &&
          validated.planningPhase !== 'outline' && Array.isArray(validated.observations) && validated.observations.some(row => row.tool !== 'assistant.plan');
        if (adaptiveStart) record.startReason = 'adaptive-receipts';
        const planningReasoning = recovered || adaptiveStart ? 'off' : selected.reasoning;
```

**编辑 `local-ai/gateway.mjs`（第 3/3 处）**

Find:

```js
startedAt: Date.now(), status: 'pending', ...(retryReason ? { retryReason } : {}) };
```

Replace with:

```js
startedAt: Date.now(), status: 'pending', ...(retryReason ? { retryReason } : {}), ...(index === 0 && record.startReason ? { startReason: record.startReason } : {}) };
```

- [x] **Step 4：运行，确认通过**

```bash
node --test test/local-ai-planner-recovery.test.mjs
node --check local-ai/gateway.mjs
```

预期：`tests 24 / pass 24 / fail 0`。

- [x] **Step 5：检查点（不提交）**

```bash
/tmp/speed-check.sh t4
```

预期：`tests` 比基线多 20，`fail` 数不变，`失败集合与基线一致`。

---

### Task 5：设置页下拉、时间线与历史展示

**Files:**
- Modify: `settings.html`、`js/ai-control.js`
- Modify: `js/assistant-timeline.js`、`assistant.html`、`js/ai-history.js`
- Create: `test/assistant-speed-ui.test.js`

**Interfaces:**
- Consumes: Task 3 的策略字段；Task 4 的 `startReason`（Engine 已把 Gateway 的 `execution` 原样放入任务的 `modelCalls`，时间线直接读取）。
- Produces: 设置页 `#planning-strategy` 下拉（`follow`/`adaptive`）；保存策略时始终带上该字段；时间线与历史详情把“自适应起步”和“超时恢复”分开展示。

设计说明：AI 设置页保存策略时**从零构造**策略对象，若不带上 `planningStrategy`，每次保存都会把它重置为 `follow`；工作台自己的 Laya 保存使用 `{ ...latest.policy }` 展开（已核对 `js/assistant.js` 的 `ai_control_save`），不需要改。`ai-control.html` 只是跳转页，无需修改。

- [x] **Step 1：先写测试**

**新建 `test/assistant-speed-ui.test.js`**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('AI 设置提供规划思考起步策略：默认严格按设置，并随策略一起读写', () => {
  const html = read('settings.html'), control = read('js/ai-control.js');
  assert.match(html, /<select id="planning-strategy"><option value="follow">[^<]+<\/option><option value="adaptive">[^<]+<\/option><\/select>/);
  assert.match(html, /所选等级仍是上限，不修改默认设置/);
  assert.match(html, /js\/ai-control\.js\?v=5/);
  assert.match(control, /\$\('planning-strategy'\)\.value = data\.policy\.planningStrategy \|\| 'follow'/);
  assert.match(control, /planningStrategy: \$\('planning-strategy'\)\?\.value \|\| state\.policy\.planningStrategy \|\| 'follow'/);
});

test('时间线与历史详情把自适应起步和超时恢复分开展示', () => {
  const timeline = read('js/assistant-timeline.js'), history = read('js/ai-history.js');
  assert.match(timeline, /model\?\.startReason === 'adaptive-receipts'/);
  assert.match(timeline, /已有执行回执，本轮从关闭思考开始/);
  assert.match(timeline, /model\.startReason === 'adaptive-receipts' \? ' → 关闭（已有回执，自适应）'/);
  assert.match(timeline, /沿用本轮恢复/);
  assert.match(history, /startReason: row\.startReason/);
  assert.match(read('assistant.html'), /js\/assistant-timeline\.js\?v=20260929-speed/);
});
```

- [x] **Step 2：运行，确认按预期失败**

```bash
node --test test/assistant-speed-ui.test.js
```

预期：`tests 2 / pass 0 / fail 2`（断言在 `settings.html` 与 `js/assistant-timeline.js` 上找不到新内容）。

- [x] **Step 3：实现**

设置页（新增下拉、说明文字，并提升脚本缓存版本号）：

**编辑 `settings.html`（第 1/4 处）**

Find:

```html
<label>上下文整理<select id="context-compaction"><option value="hybrid">自动精简与 pi 摘要</option><option value="deterministic">仅精简，不调用摘要模型</option></select></label>
```

Replace with:

```html
<label>上下文整理<select id="context-compaction"><option value="hybrid">自动精简与 pi 摘要</option><option value="deterministic">仅精简，不调用摘要模型</option></select></label><label>规划思考起步<select id="planning-strategy"><option value="follow">严格按上方思考设置（默认）</option><option value="adaptive">已有执行回执时自动关闭思考</option></select></label>
```

**编辑 `settings.html`（第 2/4 处）**

Find:

```html
内部重试仍计入每日预算和失败总数。
```

Replace with:

```html
内部重试仍计入每日预算和失败总数。“规划思考起步”选自适应时，仅助手已拿到真实工具回执的后续规划轮从关闭思考开始，所选等级仍是上限，不修改默认设置。
```

**编辑 `settings.html`（第 3/4 处）**

Find:

```html
<script src="js/ai-control.js?v=4"></script>
```

Replace with:

```html
<script src="js/ai-control.js?v=5"></script>
```

**编辑 `settings.html`（第 4/4 处）**

Find:

```html
<script src="js/ai-history.js?v=2"></script>
```

Replace with:

```html
<script src="js/ai-history.js?v=3"></script>
```

保存与渲染：

**编辑 `js/ai-control.js`（第 1/2 处）**

Find:

```js
$('context-compaction').value = data.policy.contextCompaction || 'hybrid';
```

Replace with:

```js
$('context-compaction').value = data.policy.contextCompaction || 'hybrid';
    if ($('planning-strategy')) $('planning-strategy').value = data.policy.planningStrategy || 'follow';
```

**编辑 `js/ai-control.js`（第 2/2 处）**

Find:

```js
layaMode: $('laya-mode')?.value || 'off', dailyRequestLimit:
```

Replace with:

```js
layaMode: $('laya-mode')?.value || 'off', planningStrategy: $('planning-strategy')?.value || state.policy.planningStrategy || 'follow', dailyRequestLimit:
```

时间线、缓存版本号与历史详情：

**编辑 `js/assistant-timeline.js`（第 1/2 处）**

Find:

```js
'本轮前序规划已关闭思考恢复成功，后续步骤沿用关闭思考；未更改默认设置。'));
```

Replace with:

```js
'本轮前序规划已关闭思考恢复成功，后续步骤沿用关闭思考；未更改默认设置。'));
        if (model?.startReason === 'adaptive-receipts') detail.append(element('p', '已有执行回执，本轮从关闭思考开始（规划思考起步：自适应）；未更改默认设置。'));
```

**编辑 `js/assistant-timeline.js`（第 2/2 处）**

Find:

```js
 → 关闭（沿用本轮恢复）' : model.attempts?.length > 1
```

Replace with:

```js
 → 关闭（沿用本轮恢复）' : model.startReason === 'adaptive-receipts' ? ' → 关闭（已有回执，自适应）' : model.attempts?.length > 1
```

**编辑 `assistant.html`**

Find:

```html
js/assistant-timeline.js?v=20260927-laya-control
```

Replace with:

```html
js/assistant-timeline.js?v=20260929-speed
```

**编辑 `js/ai-history.js`**

Find:

```js
recoveryFromRequestId: row.recoveryFromRequestId, modelErrorCode
```

Replace with:

```js
recoveryFromRequestId: row.recoveryFromRequestId, startReason: row.startReason, modelErrorCode
```

- [x] **Step 4：运行，确认通过**

```bash
node --test test/assistant-speed-ui.test.js test/settings-v5-contract.test.js test/local-ai-history.test.mjs
node --check js/ai-control.js && node --check js/assistant-timeline.js && node --check js/ai-history.js
```

预期：全部通过（新增 2 项），语法检查无输出。

- [x] **Step 5：检查点（不提交）**

```bash
/tmp/speed-check.sh t5
```

预期：`tests` 比基线多 22，`fail` 数不变，`失败集合与基线一致`。

---

### Task 6：评估脚本进程内模式

**Files:**
- Modify: `local-ai/evaluate-assistant-todo.mjs`（未跟踪文件，同样只做定点编辑）

**Interfaces:**
- Consumes: `createGateway`、`createControlStore`、`createHistoryStore`、`LMStudioProvider`；Task 3/4 的 `planningStrategy` 与 `startReason`。
- Produces: 命令行 `--in-process [--strategy=follow|adaptive] [--remove-artist]`；报告 `metrics`（`planningCalls`、`planningMs`、`firstAttemptTimeouts`、`offRetries`、`adaptiveStarts`、`planningFailures`、`invalidPlans`）；报告文件名 `assistant-{todo|remove-artist}-<strategy>-<时间戳>.json`。原 `--live` 行为不变。

进程内模式的边界：网关与控制/历史存储都在内存中（不传 `file`），**不读取** `local-ai/.local/token`，不写生产策略、用量与历史；只写被忽略的 `local-ai/.local/evaluations/` 报告。音乐操作和用户点击仍是替身。

- [x] **Step 1：实现**

**编辑 `local-ai/evaluate-assistant-todo.mjs`（第 1/5 处）**

Find:

```js
import Tools from '../js/assistant-tools.js';
import Queue from '../js/music-queue-policy.js';

const removeArtist = process.argv.includes('--remove-artist');

if (!process.argv.includes('--live')) {
  console.log('使用 --live 经鉴权网关验证真实模型与 Todo 全流程；音乐查询、清空、追加和播放全部使用测试替身。');
} else {
  const token = readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET',
```

Replace with:

```js
import Tools from '../js/assistant-tools.js';
import Queue from '../js/music-queue-policy.js';
import { createGateway } from './gateway.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { LMStudioProvider } from './provider.mjs';

const removeArtist = process.argv.includes('--remove-artist');
const inProcess = process.argv.includes('--in-process');
const strategy = process.argv.find(arg => arg.startsWith('--strategy='))?.slice('--strategy='.length) || 'follow';
if (!['follow', 'adaptive'].includes(strategy)) { console.error('--strategy 只能是 follow 或 adaptive'); process.exit(2); }

if (!process.argv.includes('--live') && !inProcess) {
  console.log('使用 --live 经鉴权网关验证真实模型与 Todo 全流程；音乐查询、清空、追加和播放全部使用测试替身。');
  console.log('使用 --in-process [--strategy=follow|adaptive] 在进程内创建独立网关（内存策略与历史，不读取生产令牌、不写生产记录），比较规划思考起步策略。');
} else {
  // In-process mode never reads the production token and never writes production policy, usage or history.
  const token = inProcess ? null : readFileSync(new URL('.local/token', import.meta.url), 'utf8').trim();
  const request = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:19841${path}`, { method: body ? 'POST' : 'GET',
```

**编辑 `local-ai/evaluate-assistant-todo.mjs`（第 2/5 处）**

Find:

```js
    return data;
  };
  const control = await request('/v1/control');
  assert.equal(control.jobs.length, 0, '有运行中的任务，稍后再验证');
  const started = Date.now(), values = {}, effects = [], plans = [], jobs = new Set();
  let sequence = 0, revision = 1;
```

Replace with:

```js
    return data;
  };
  const gateway = inProcess ? (() => {
    const control = createControlStore();
    control.update({ ...control.snapshot().policy, reasoning: 'low', planningStrategy: strategy }, 1);
    return createGateway({ control, history: createHistoryStore(), provider: new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN }) });
  })() : null;
  if (!inProcess) {
    const control = await request('/v1/control');
    assert.equal(control.jobs.length, 0, '有运行中的任务，稍后再验证');
  }
  const started = Date.now(), values = {}, effects = [], plans = [], jobs = new Set();
  let sequence = 0, revision = 1;
```

**编辑 `local-ai/evaluate-assistant-todo.mjs`（第 3/5 处）**

Find:

```js
    memory: async () => ({ ok: true, enabled: false }),
    ai: async message => {
      let result;
      if (message.action === 'ai_scene_submit') result = await request('/v1/ai/interpret', { scene: message.scene, input: message.input, selection: message.selection, trace: message.trace });
```

Replace with:

```js
    memory: async () => ({ ok: true, enabled: false }),
    ai: async message => {
      if (inProcess) {
        if (message.action !== 'ai_scene_submit') throw new Error(`验证不允许调用 ${message.action}`);
        try {
          const result = await gateway.run(message.scene, message.input, { selection: message.selection, trace: message.trace });
          plans.push({ data: result.data, execution: result.execution });
          console.log(JSON.stringify({ plan: result.data, elapsedMs: result.execution?.elapsedMs, reasoning: result.execution?.effectiveReasoning, startReason: result.execution?.startReason }));
          return { ok: true, ...result };
        } catch (error) {
          plans.push({ error: { code: error.code, message: error.message }, execution: error.execution });
          console.log(JSON.stringify({ error: error.message, code: error.code, elapsedMs: error.execution?.elapsedMs }));
          throw error;
        }
      }
      let result;
      if (message.action === 'ai_scene_submit') result = await request('/v1/ai/interpret', { scene: message.scene, input: message.input, selection: message.selection, trace: message.trace });
```

**编辑 `local-ai/evaluate-assistant-todo.mjs`（第 4/5 处）**

Find:

```js
  });
  const engine = Engine.create({ storage, ...handlers, id: () => `todo-evaluation-${started}-${++sequence}` });
  const report = { at: new Date(started).toISOString(), boundary: '真实鉴权HTTP/Gateway/本机模型和生产Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号', passed: false };
  try {
    await engine.submit({ app: 'music', text: removeArtist ? '清除队里中许嵩的歌曲' : '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲', ai: { reasoning: 'low' } });
```

Replace with:

```js
  });
  const engine = Engine.create({ storage, ...handlers, id: () => `todo-evaluation-${started}-${++sequence}` });
  const report = { at: new Date(started).toISOString(), passed: false,
    boundary: inProcess ? '进程内 Gateway（内存策略与历史，不读生产令牌、不写生产记录）、真实 LM Studio 本机模型和生产 Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号'
      : '真实鉴权HTTP/Gateway/本机模型和生产Engine/Tools；所有音乐依赖及用户点击均为替身，未操作真实账号',
    ...(inProcess ? { strategy, reasoning: 'low' } : {}) };
  try {
    await engine.submit({ app: 'music', text: removeArtist ? '清除队里中许嵩的歌曲' : '检查队列是否有歌曲？有，则清空\n搜索许嵩热歌，加入到队列\n搜索法老热歌，加入到队列\n随机播放添加到队列里的歌曲', ai: { reasoning: 'low' } });
```

**编辑 `local-ai/evaluate-assistant-todo.mjs`（第 5/5 处）**

Find:

```js
  } catch (error) { report.error = error.message; process.exitCode = 1; }
  finally { for (const id of jobs) await request(`/v1/ai/jobs/${id}/cancel`, {}).catch(() => {}); }
  Object.assign(report, { elapsedMs: Date.now() - started, effects, plans });
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-${removeArtist ? "remove-artist" : "todo"}-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, effects, elapsedMs: report.elapsedMs, report: output.pathname }));
}
```

Replace with:

```js
  } catch (error) { report.error = error.message; process.exitCode = 1; }
  finally { for (const id of jobs) await request(`/v1/ai/jobs/${id}/cancel`, {}).catch(() => {}); }
  const executions = plans.map(row => row.execution).filter(row => row?.scene === 'assistant.plan');
  report.metrics = {
    planningCalls: executions.length,
    planningMs: executions.reduce((sum, row) => sum + (row.elapsedMs || 0), 0),
    firstAttemptTimeouts: executions.filter(row => row.attempts?.[0]?.errorCode === 'MODEL_RESPONSE_TIMEOUT').length,
    offRetries: executions.filter(row => row.attempts?.length > 1).length,
    adaptiveStarts: executions.filter(row => row.startReason === 'adaptive-receipts').length,
    planningFailures: (report.task?.trace || []).filter(row => row.tool === 'assistant.plan' && row.status === 'failed').length,
    invalidPlans: (report.task?.trace || []).filter(row => row.tool === 'assistant.plan' && row.error?.code === 'ASSISTANT_PLAN_INVALID').length
  };
  Object.assign(report, { elapsedMs: Date.now() - started, effects, plans });
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const output = new URL(`assistant-${removeArtist ? 'remove-artist' : 'todo'}${inProcess ? `-${strategy}` : ''}-${started}.json`, directory);
  writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: report.passed, error: report.error, ...(inProcess ? { strategy } : {}), effects, elapsedMs: report.elapsedMs, metrics: report.metrics, report: output.pathname }));
}
```

- [x] **Step 2：语法检查与用法（不涉及模型）**

```bash
node --check local-ai/evaluate-assistant-todo.mjs
node local-ai/evaluate-assistant-todo.mjs
node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=bogus; echo "exit=$?"
```

预期：无参数时打印两行用法（原 `--live` 说明 + `--in-process` 说明），退出码 0；非法策略打印 `--strategy 只能是 follow 或 adaptive`，`exit=2`。

- [x] **Step 3：连接失败路径（关闭的端口，不涉及真实模型）**

```bash
LM_STUDIO_URL=http://127.0.0.1:9 node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=adaptive --remove-artist; echo "exit=$?"
```

预期：先输出 `{"error":"无法连接 LM Studio，请检查本地服务是否启动",...}`，最后一行 JSON 含 `"passed":false`、`"strategy":"adaptive"`、`"metrics":{"planningCalls":1,...,"planningFailures":1,"invalidPlans":0}`，`exit=1`。

- [x] **Step 4：用假 LM Studio 服务冒烟（脚本接线，不是真实模型）**

在仓库外创建一次性脚本。它只在随机本机端口伪造 LM Studio 的 `/api/v1/models` 与 `/api/v1/chat`，为 `--remove-artist` 场景提供脚本化规划：

**新建 `/tmp/speed-stub/stub-run.mjs`（先执行 `mkdir -p /tmp/speed-stub`）**

```js
// Throwaway smoke test for `evaluate-assistant-todo.mjs --in-process`.
// It fakes only LM Studio's HTTP API (models + chat) on a random local port and scripts the
// planner for the --remove-artist scenario. It is not a real model and proves nothing about quality.
// Usage: node stub-run.mjs <repo-root>            (STUB_INVALID_ONCE=1 adds one invalid plan)
import http from 'node:http';
import { spawn } from 'node:child_process';

const answer = value => ({ output: [{ type: 'message', content: JSON.stringify(value) }], stats: { input_tokens: 1000, total_output_tokens: 40, reasoning_output_tokens: 0 } });
const calls = [];
let invalidSent = false;
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/v1/models') {
      return res.end(JSON.stringify({ models: [{ key: 'qwen/qwen3.8-27b', type: 'llm', display_name: 'Qwen stub', loaded_instances: [{ config: { context_length: 40960 } }], capabilities: { reasoning: { allowed_options: ['off', 'low', 'medium', 'high'] } } }] }));
    }
    const request = JSON.parse(body), input = JSON.parse(request.input);
    calls.push({ reasoning: request.reasoning, phase: input.planningPhase, observations: (input.observations || []).length });
    const artist = '许嵩';
    if (input.planningPhase === 'outline') return res.end(JSON.stringify(answer({ todoTips: [{ text: `移除${artist}的队列歌曲`, source: 0, tool: 'music.queue.removeArtist', args: { artist } }] })));
    if (input.observations.some(row => row.status === 'unknown')) return res.end(JSON.stringify(answer({ question: '写入结果未知' })));
    if (input.todoTips.items.every(row => row.status === 'completed')) return res.end(JSON.stringify(answer({ done: true })));
    if (process.env.STUB_INVALID_ONCE && !invalidSent) { invalidSent = true; return res.end(JSON.stringify(answer({ steps: [{ tool: 'no.such.tool', args: {} }], continue: true }))); }
    const latest = input.observations.findLast(row => row.status === 'done' && row.data?.revision);
    return res.end(JSON.stringify(answer(latest ? { steps: [{ tool: 'music.queue.removeArtist', args: { artist, expectedRevision: latest.data.revision } }], continue: true } : { steps: [{ tool: 'music.state', args: {} }], continue: true })));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const root = process.argv[2];
if (!root) { console.error('用法：node stub-run.mjs <仓库根目录>'); process.exit(2); }
for (const strategy of ['follow', 'adaptive']) {
  calls.length = 0; invalidSent = false;
  const output = await new Promise(resolve => {
    const child = spawn('node', ['local-ai/evaluate-assistant-todo.mjs', '--in-process', `--strategy=${strategy}`, '--remove-artist'], { cwd: root, env: { ...process.env, LM_STUDIO_URL: url } });
    let text = ''; child.stdout.on('data', chunk => { text += chunk; }); child.stderr.on('data', chunk => { text += chunk; });
    child.on('close', code => resolve({ code, text }));
  });
  const summary = JSON.parse(output.text.trim().split('\n').at(-1));
  console.log(`=== strategy=${strategy} exit=${output.code} passed=${summary.passed} report=${summary.report}`);
  console.log(`metrics: ${JSON.stringify(summary.metrics)}`);
  console.log(`stub saw reasoning per call: ${calls.map(row => `${row.phase}/${row.reasoning}`).join(' → ')}`);
}
server.close();
```

```bash
node /tmp/speed-stub/stub-run.mjs "$PWD"
STUB_INVALID_ONCE=1 node /tmp/speed-stub/stub-run.mjs "$PWD"
```

预期（第一条命令，耗时数字会不同）：

```text
=== strategy=follow exit=0 passed=true report=.../local-ai/.local/evaluations/assistant-remove-artist-follow-<时间戳>.json
metrics: {"planningCalls":4,...,"adaptiveStarts":0,"planningFailures":0,"invalidPlans":0}
stub saw reasoning per call: outline/low → execute/low → execute/low → execute/low
=== strategy=adaptive exit=0 passed=true report=.../local-ai/.local/evaluations/assistant-remove-artist-adaptive-<时间戳>.json
metrics: {"planningCalls":4,...,"adaptiveStarts":2,"planningFailures":0,"invalidPlans":0}
stub saw reasoning per call: outline/low → execute/low → execute/off → execute/off
```

第二条命令（多一次无效计划）中 `planningCalls` 为 5、`planningFailures` 与 `invalidPlans` 均为 1，`adaptive` 的推理序列为 `outline/low → execute/low → execute/low → execute/off → execute/off`：无效计划的修复轮只有“规划失败观察”而没有真实工具回执，所以仍按 `low` 起步。

- [x] **Step 5：清理烟测报告并做检查点（不提交）**

Step 3 与 Step 4 的三条命令共生成 5 份报告（1 + 2 + 2），绝对路径已打印，均在 `local-ai/.local/evaluations/`，文件名含 `-follow-` 或 `-adaptive-` 与本次时间戳。**只删除本任务刚生成的这 5 个文件**（按打印出的路径逐个 `rm`），不要触碰该目录里其他已有报告。然后：

```bash
rm -rf /tmp/speed-stub
git diff --no-index --check /dev/null local-ai/evaluate-assistant-todo.mjs
/tmp/speed-check.sh t6
```

预期：`--no-index --check` 无输出（文件干净时退出码也是 1，只表示“与 /dev/null 有差异”；有空白问题时才会打印告警且退出码为 3，以是否有输出为准）；回归结果与 Task 5 相同（本任务不影响 `test/`）。

---

### Task 7：文档、`AGENTS.md`、README 与最终验证

**Files:**
- Modify: `AGENTS.md`、`local-ai/README.md`
- Modify: `docs/technical/assistant-speed-20260929.md`（状态、变更记录、验证与边界）
- Modify: `docs/technical/assistant-planner-timeout-20260919.md`、`docs/technical/assistant-todo-tips-20260928.md`（交叉引用）

- [x] **Step 1：更新 `AGENTS.md`（三处）**

第一处：在“规划超时恢复”条目末尾补充可选策略：

**编辑 `AGENTS.md`（“规划超时恢复”条目末尾）**

Find:

```text
见 `docs/technical/assistant-planner-timeout-20260919.md`。
```

Replace with:

```text
见 `docs/technical/assistant-planner-timeout-20260919.md`。可选“规划思考起步”策略 `planningStrategy`（默认 `follow`，与现状一致；`adaptive` 时仅 `assistant.plan` 在非 outline 且已有真实工具回执（`tool` 不是 `assistant.plan`）时直接以 off 单次起步并独占超时，所选等级仍是上限，不改用户设置；来源记为 `startReason=adaptive-receipts`，不冒充 `recoveryFromRequestId`，也不使后续规划沿用 off；默认值须经真实本机模型 A/B 评估后由用户决定）。见 `docs/technical/assistant-speed-20260929.md`。
```

第二处：更新“播放/随机播放当前队列”条目的识别说明：

**编辑 `AGENTS.md`（“播放/随机播放当前队列”条目）**

Find:

```text
`MusicIntent.queuePlayRequest()` 精确识别，先保存单项 Todo
```

Replace with:

```text
`MusicIntent.queuePlayRequest(text, { bare })` 按封闭语法精确识别（含“随机播放列表歌曲”“列表歌曲随机播放”“队里中的歌曲”等真实说法；含歌手、条件或复合内容一律不命中；裸“随机播放”仅在调用方传入 `bare` 时命中，规则是当前任务没有待选候选，路由与 `Tools.quickQueuePlayPlan` 共用 `Contract.hasCandidates()`），先保存单项 Todo
```

第三处：在“本地队列按歌手批量移除”之前新增“无进展保护”条目：

**编辑 `AGENTS.md`（在“本地队列按歌手批量移除”条目之前新增一条）**

Find:

```text
- 本地队列按歌手批量移除：
```

Replace with:

```text
- 无进展保护：`js/assistant-engine.js` 在活动任务快照中保存 `readSeen`（工具名 + 键排序参数的只读调用指纹，最多 24 条，参数超过 2000 字符不判定）。成功且不等待的计划内只读调用追加；写入/准备工具、用户选择动作、`choose()` 开始新执行轮以及工具执行失败/unknown 恢复会清空，规划阶段的模型修复不清空。`nextPlan()` 拒绝 `steps[0]` 与已读指纹完全相同的只读提议（含重复 `tools.load`），以 `ASSISTANT_PLAN_INVALID` 进入现有 modelRepair 恢复一次，再次重复由 `ASSISTANT_RECOVERY_LIMIT` 停止；不新增预算或分支，不放宽 12 轮/12 工具/5 分钟与 3 次恢复，也不清除或重放业务动作。见 `docs/technical/assistant-speed-20260929.md`。

- 本地队列按歌手批量移除：
```

- [x] **Step 2：更新 `local-ai/README.md`**

在文件末尾“工作台上下文整理（pi SDK）”一节之后追加新的小节：

**编辑 `local-ai/README.md`（文件末尾）**

Find:

```text
专项测试：`node --test test/local-ai-compaction.test.mjs`（项目根目录）；真实模型合成材料验证：`node local-ai/evaluate-assistant-compaction.mjs --live`，不会操作账号、队列或提醒。
```

Replace with:

```text
专项测试：`node --test test/local-ai-compaction.test.mjs`（项目根目录）；真实模型合成材料验证：`node local-ai/evaluate-assistant-compaction.mjs --live`，不会操作账号、队列或提醒。

### 工作台规划提速（规划思考起步 · 无进展保护 · 队列播放快速路径）

AI 设置新增“规划思考起步”（`planningStrategy`），默认“严格按上方思考设置”，行为与此前完全一致。选择“已有执行回执时自动关闭思考”后，仅 `assistant.plan` 中已拿到真实工具回执、且不是清单分析阶段的规划轮会直接以关闭思考单次起步并独占完整超时；所选思考等级仍是上限，默认设置、预算与熔断规则不变。历史和时间线用 `startReason=adaptive-receipts` 标记，与“超时恢复”分开显示。Engine 会拦截“自上次写入、选择或失败恢复后，重复提出完全相同的只读查询”：先把原因写入回执让模型重规划一次，再次重复则由现有恢复上限停止。“随机播放列表歌曲”“列表歌曲随机播放”“随机播放队里中的歌曲”等封闭语法的队列播放短句直接走确定性快速路径，不调用模型。更新后须重启本机服务并重载扩展（旧服务会拒绝 `planningStrategy` 字段）。设计、边界与验证见 [提速技术说明](../docs/technical/assistant-speed-20260929.md)。

进程内评估：`node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=follow|adaptive [--remove-artist]` 创建独立的内存网关直接调用 LM Studio（`LM_STUDIO_URL`、`LOCAL_AI_MODEL` 可覆盖），不读取生产令牌、不写生产策略与历史，报告与 `metrics` 写入 `.local/evaluations/`。LM Studio 为单并发，运行时不要同时使用助手；音乐依赖与用户点击均为替身。
```

- [x] **Step 3：交叉引用**

技术索引 `docs/technical/_index.md` 已在创建设计文档与本计划时各加一行，无需再改。

**编辑 `docs/technical/assistant-planner-timeout-20260919.md`（文件末尾）**

Find:

```text
没有自动重试用户的失败业务任务，没有清空真实队列或播放音乐，未提交 Git。
```

Replace with:

```text
没有自动重试用户的失败业务任务，没有清空真实队列或播放音乐，未提交 Git。

2026-09-29 补充：AI 设置新增可选“规划思考起步”（`planningStrategy`，默认 `follow`，行为不变）。选择 `adaptive` 后，已有真实工具回执的规划轮不再先等 30 秒 `low` 尝试，而是从 `off` 单次起步；这不是本文的超时恢复，记录为 `startReason=adaptive-receipts`，不写入 `recoveryFromRequestId`，也不使后续无回执规划沿用 off。详见 [assistant-speed-20260929.md](assistant-speed-20260929.md)。
```

**编辑 `docs/technical/assistant-todo-tips-20260928.md`（“明确短句”一段）**

Find:

```text
路由将这些明确短句识别为独立音乐需求。
```

Replace with:

```text
路由将这些明确短句识别为独立音乐需求。2026-09-29：识别语法扩展为封闭语法（新增“列表歌曲”等真实说法），并为裸“随机播放”增加“无待选候选”门控，见 [assistant-speed-20260929.md](assistant-speed-20260929.md)。
```

- [x] **Step 4：更新设计文档的状态与验证结果**

前两处编辑把文档从“实现前设计”改为“已实现、待真实模型评估”。执行当天若不是 2026-09-29，把 `updated` 和新增 changelog 的日期改为实际日期。

**编辑 `docs/technical/assistant-speed-20260929.md`（front matter：状态与版本）**

Find:

```text
status: draft
version: "1.0"
```

Replace with:

```text
status: active
version: "1.1"
```

**编辑 `docs/technical/assistant-speed-20260929.md`（front matter：变更记录）**

Find:

```text
实现计划见 plan-assistant-speed-20260929.md。"
---
```

Replace with:

```text
实现计划见 plan-assistant-speed-20260929.md。"
  - date: "2026-09-29"
    desc: "按 plan-assistant-speed-20260929.md 实现并完成业务替身层验证：planningStrategy 默认仍为 follow；真实本机模型 A/B 与真实 Chrome 验收待做。"
---
```

**编辑 `docs/technical/assistant-speed-20260929.md`（“状态”一节第一段）**

Find:

```text
本文是**实现前的设计**，已获用户批准，代码尚未修改。实现、测试与真实模型评估完成后，在“验证与边界”一节补充结果，不得把设计目标写成已验证事实。
```

Replace with:

```text
本文是已获用户批准的设计，并已按 [plan-assistant-speed-20260929.md](plan-assistant-speed-20260929.md) 实现。`planningStrategy` 默认仍为 `follow`；是否启用 `adaptive` 取决于真实本机模型 A/B 评估，尚未运行。各层验证结果见“验证与边界”，不得把设计目标写成已验证事实。
```

“验证与边界”一节先按演练值写入。**执行时必须把表中数字换成本次实测结果**；本次没有运行的层级保持“未运行”，不得沿用演练值冒充。

**编辑 `docs/technical/assistant-speed-20260929.md`（“验证与边界”一节）**

Find:

```text
## 验证与边界（实现后补充）

待实现后按“静态检查 / 业务替身测试 / 真实本机模型 / HTTP 预览 / 真实 Chrome 扩展 / 真实账号”分别记录，不把其中一层写成另一层通过。
```

Replace with:

```text
## 验证与边界

以下分层记录 2026-09-29 的实测结果，层级之间互不替代。

| 层级 | 结果 |
| --- | --- |
| 静态检查 | 变更脚本 `node --check` 通过；`git diff --check` 对已跟踪改动文件无输出，新增（未跟踪）文件用 `git diff --no-index --check /dev/null <文件>` 无输出。 |
| 业务替身测试 | 新增 22 项全部通过；相关回归 577 项 / 572 通过 / 5 失败，全量 1145 项 / 1137 通过 / 8 失败，失败集合与改动前完全一致（均为与本设计无关的既有失败：Laya ×4、压缩恢复 ×1，另有 3 项 UI 契约）。两处既有测试改为使用不同参数，见“对既有测试的影响”。 |
| 评估脚本接线 | `--in-process` 用**假 LM Studio 服务**冒烟：`follow` 的规划推理序列为 `outline/low → execute/low → execute/low → execute/low`；`adaptive` 为 `outline/low → execute/low → execute/off → execute/off`（`adaptiveStarts=2`）；连接失败时返回 `passed:false` 与 `metrics`。这只验证脚本与 Gateway 的接线，不代表真实模型的质量或耗时。 |
| 真实本机模型 | **未运行**。A/B 需要用户同意并保持 LM Studio 空闲；结果决定是否启用 `adaptive`。 |
| HTTP 预览 | 未运行。 |
| 真实 Chrome 扩展 | 未验收。设置页下拉与助手时间线新文案需重启本机服务、重载扩展后确认；旧服务会以“控制策略包含未知字段”拒绝 `planningStrategy`。 |
| 真实账号 | 不涉及。 |

**仍存在的边界**：同“已知边界与后续”。在真实模型 A/B 之前，`adaptive` 对规划质量的影响没有证据，默认保持 `follow`。
```

- [x] **Step 5：最终验证**

```bash
# 静态检查
for f in js/music-intent.js js/assistant-contract.js js/assistant-tools.js js/assistant-engine.js js/ai-control.js js/assistant-timeline.js js/ai-history.js local-ai/control-store.mjs local-ai/gateway.mjs local-ai/evaluate-assistant-todo.mjs; do node --check "$f" && echo "语法 ok $f"; done
git diff --check -- js/music-intent.js js/assistant-contract.js js/assistant-tools.js js/assistant-engine.js local-ai/control-store.mjs local-ai/gateway.mjs settings.html assistant.html js/ai-control.js js/ai-history.js js/assistant-timeline.js AGENTS.md local-ai/README.md docs/technical/_index.md docs/technical/assistant-planner-timeout-20260919.md test/assistant-adaptive.test.js test/assistant-approval.test.mjs test/local-ai-control.test.mjs test/local-ai-planner-recovery.test.mjs
for f in local-ai/evaluate-assistant-todo.mjs test/assistant-queue-phrases.test.mjs test/assistant-no-progress.test.mjs test/assistant-speed-ui.test.js docs/technical/assistant-speed-20260929.md docs/technical/assistant-todo-tips-20260928.md docs/technical/plan-assistant-speed-20260929.md; do git diff --no-index --check /dev/null "$f"; done

# 相关回归与全量回归
/tmp/speed-check.sh final
node --test test/*.test.js test/*.test.mjs > /tmp/speed-final-full.txt 2>&1
grep -E "^ℹ (tests|pass|fail)" /tmp/speed-final-full.txt
failures() { grep -E "^✖ " "$1" | sed -E 's/ \([0-9.]+ms\)$//' | sort -u; }
diff <(failures /tmp/speed-baseline-full.txt) <(failures /tmp/speed-final-full.txt) && echo "全量：失败集合与基线一致"
```

预期：所有语法检查通过；`git diff --check` 与 `--no-index --check` 无输出（`--no-index` 干净时退出码为 1，只看是否有输出）；相关回归比基线多 22 项、失败集合一致；全量比基线多 22 项、失败集合一致（设计时：577/572/5 与 1145/1137/8）。再运行一次 Task 0 Step 1 的 `git status --short`，确认除本计划文件外没有出现无关文件的状态变化。

- [x] **Step 6：收尾报告（不提交）**

按“静态检查 / 业务替身测试 / 真实本机模型 / HTTP 预览 / 真实 Chrome 扩展 / 真实账号”分层向用户报告，并说明：

1. 更新后必须**重启本机 AI 服务并重载扩展**（旧服务会以“控制策略包含未知字段”拒绝 `planningStrategy`）；执行代理不代替用户重启服务。
2. `planningStrategy` 默认仍为 `follow`，行为与改动前一致；是否启用 `adaptive` 取决于 Task 8 的真实模型 A/B，由用户决定。
3. 附一行安全自查：无新接口/权限/秘密/外部请求；新增策略字段为枚举，经既有鉴权控制接口保存；进程内评估不读取令牌、不写生产记录；保护只拦截重复只读查询。

---

### Task 8（需用户同意后才能执行）：真实本机模型 A/B

**Files:**
- 不改仓库代码；创建仓库外的汇总脚本 `/tmp/speed-stub/summarize.mjs`；结果写入设计文档“验证与边界”。

前置条件：用户明确同意；LM Studio 已加载常用模型且**空闲**（单并发，运行期间不要使用助手）；不读取令牌、不操作真实账号，音乐依赖全部是替身。

- [x] **Step 1：交错运行两种策略，每个场景各 3 轮**

```bash
cd /Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background
START=$(node -e 'console.log(Date.now())')
for i in 1 2 3; do
  node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=follow --remove-artist
  node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=adaptive --remove-artist
done
for i in 1 2 3; do
  node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=follow
  node local-ai/evaluate-assistant-todo.mjs --in-process --strategy=adaptive
done
echo "START=$START"
```

单次模型规划可能长达 90 秒，整批可能需要数十分钟，命令应放在后台运行并轮询，不要为了赶时间缩短超时或增加并发。

- [x] **Step 2：汇总**

**新建 `/tmp/speed-stub/summarize.mjs`（先执行 `mkdir -p /tmp/speed-stub`）**

```js
// Summarizes evaluate-assistant-todo.mjs --in-process reports written since a given timestamp (ms).
// Usage: node summarize.mjs <evaluations-dir> <since-ms>
import { readdirSync, readFileSync } from 'node:fs';

const [dir, since = '0'] = process.argv.slice(2);
if (!dir) { console.error('用法：node summarize.mjs <评估报告目录> <起始毫秒时间戳>'); process.exit(2); }
const rows = readdirSync(dir)
  .filter(name => /^assistant-(todo|remove-artist)-(follow|adaptive)-\d+\.json$/.test(name))
  .map(name => ({ name, at: Number(name.match(/-(\d+)\.json$/)[1]), report: JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')) }))
  .filter(row => row.at >= Number(since));
const median = list => list.length ? [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) / 2)] : null;
for (const scenario of ['todo', 'remove-artist']) {
  for (const strategy of ['follow', 'adaptive']) {
    const group = rows.filter(row => row.name.startsWith(`assistant-${scenario}-${strategy}-`));
    if (!group.length) continue;
    const sum = key => group.reduce((total, row) => total + (row.report.metrics?.[key] || 0), 0);
    console.log(JSON.stringify({
      scenario, strategy, runs: group.length, passed: group.filter(row => row.report.passed).length,
      planningMsMedian: median(group.map(row => row.report.metrics?.planningMs).filter(Number.isFinite)),
      elapsedMsMedian: median(group.map(row => row.report.elapsedMs).filter(Number.isFinite)),
      planningCalls: group.map(row => row.report.metrics?.planningCalls),
      firstAttemptTimeouts: sum('firstAttemptTimeouts'), offRetries: sum('offRetries'), adaptiveStarts: sum('adaptiveStarts'),
      planningFailures: sum('planningFailures'), invalidPlans: sum('invalidPlans')
    }));
  }
}
if (!rows.length) console.log('没有找到符合条件的报告');
```

```bash
node /tmp/speed-stub/summarize.mjs local-ai/.local/evaluations "$START"
```

预期：每个场景/策略一行 JSON，含 `runs`、`passed`、`planningMsMedian`、`elapsedMsMedian`、`planningCalls`、`firstAttemptTimeouts`、`offRetries`、`adaptiveStarts`、`planningFailures`、`invalidPlans`。

- [x] **Step 3：按设计口径下结论并记录**

设计口径（`assistant-speed-20260929.md`）：若 `adaptive` 的完成率不低于 `follow`、`invalidPlans` 不增加、且规划总耗时中位数更低，则建议启用；否则保持 `follow` 并记录原因。3 轮只是冒烟级对比，不是统计证明。把每个场景的汇总、模型名、加载上下文、是否有并发使用写入“验证与边界”的“真实本机模型”行（替换“未运行”），并把是否修改默认值的决定交给用户。清理只限本步骤生成的评估报告与 `/tmp/speed-stub`。

---

## 执行记录（2026-09-29）

Task 0–7 已在当前会话内按本计划执行，未提交 Git。Task 8 在用户同意后运行，结果见下表最后一行与设计文档“评估结果（2026-09-29）”。

| 项目 | 结果 |
| --- | --- |
| 基线（执行前实测） | 相关回归 555 / 550 / 5，全量 1123 / 1115 / 8，与设计时一致 |
| 红灯（先失败） | 队列语法 7 / 1 / 6；无进展保护 7 / 3 / 4；控制策略 6 / 5 / 1；Gateway 24 / 20 / 4；界面 2 / 0 / 2 |
| 绿灯 | 上述测试文件全部通过；Task 2 联跑 33 / 33，Task 5 联跑 17 / 17 |
| 检查点（相关回归） | Task 1：562 / 557 / 5；Task 2：569 / 564 / 5；Task 3：570 / 565 / 5；Task 4：575 / 570 / 5；Task 5、6 与最终：577 / 572 / 5；失败集合始终与基线一致 |
| 最终全量 | 1145 项 / 1137 通过 / 8 失败，失败集合与基线一致 |
| 代码与测试 | 19 个文件，与设计时隔离演练的结果逐字节一致 |
| 评估脚本 | 假 LM Studio 冒烟通过；5 份烟测报告与临时目录已清理，未触碰既有评估报告 |
| Task 8 真实本机模型 A/B | 用户同意后运行（`qwen/qwen3.8-27b`，冷加载，顺序交错，每场景每策略 3 轮，19:30–20:13）：12 次全部完成，业务副作用序列一致。`--remove-artist` 规划耗时中位数 95.1 → 49.0 秒，四目标 435.3 → 232.0 秒（`follow` → `adaptive`）；四目标无效计划 0 → 2，未满足“无效计划不增加”，默认保持 `follow`；是否启用由用户决定 |

与计划的差异：

1. Task 7 中先运行了 Step 5 的回归，再写入 Step 4 的验证表（表中数字来自这次实测，恰与演练值相同）；静态检查放在文档编辑之后。
2. `assistant-planner-timeout-20260919.md` 与 `assistant-todo-tips-20260928.md` 是没有 front matter、也不在索引中的旧文档，只追加了正文，没有为它们补 front matter 或索引行。
3. Task 0 基线之后被修改的文件共 24 个，恰为计划所列的 19 个代码/测试文件与 5 份文档；计划文件与技术索引在基线之前已创建或更新。
4. Task 8 开始时 LM Studio 没有加载任何模型，不满足前置条件“已加载常用模型”。已停下并询问用户，用户明确选择“不预加载、接受冷加载”，因此没有单独预热，`--remove-artist` 的 `follow` 第 1 轮含加载耗时（结论不受影响，见设计文档）。该模型即时加载后仍留在 LM Studio 中（IDLE，TTL 1 小时），执行代理没有卸载。
5. 计划要求清理本步骤生成的评估报告；实际只删除了 `/tmp/speed-stub`，保留了 12 份真实模型报告（被忽略的 `local-ai/.local/evaluations/`，文件名时间戳 1790681407081–1790683754984，与既有 22 份并存），作为设计文档中数字的原始依据，也便于排查上述无效计划。不需要时可按该时间戳范围删除。
