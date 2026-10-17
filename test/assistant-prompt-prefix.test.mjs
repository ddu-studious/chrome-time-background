import test from 'node:test';
import assert from 'node:assert/strict';
import Todo from '../js/assistant-todo.js';
import { plan } from '../local-ai/assistant-service.mjs';

// 背景（docs/technical/assistant-speed-20260929.md「修复后复测与前缀缓存实测（2026-10-14）」）：
// 本机 LM Studio 的提示缓存每 2048 token 才存一个状态，且不能在已存状态内部截断，所以相邻规划请求
// 的系统提示越早出现差异，就越拿不到缓存。真实冷启动重放里，当前事项和工具目录夹在静态规则中间，
// 相邻请求的公共前缀只有 1532–1650 token，不足 2048，11 次规划只有 2 次命中；把每轮都会变的段落放到
// 系统提示后部，真实捕获的公共前缀为 2181–2263 token（第一处易变内容之前的静态前缀 2110 token，
// 离 2048 的余量只有约 60 token），11 次里 9 次命中。余量很薄：精简静态规则几十个 token 就会让收益
// 悄悄消失，所以除了顺序，还要守住静态前缀的长度。本测试不依赖分词器（字符占比与字符数）；
// 它不判断模型质量，质量由真实模型评估负责。

const input = { app: 'music', text: '检查队列，有则清空\n搜索许巍热歌加入队列\n搜索法老热歌加入队列\n随机播放' };
const rows = [
  { text: '检查并清空队列', source: 0, tool: 'music.queue.clear' },
  { text: '追加许巍热歌', source: 1, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '追加法老热歌', source: 2, tool: 'music.queue.apply', args: { mode: 'append', startPlayback: false } },
  { text: '随机播放', source: 3, tool: 'music.queue.play', args: { mode: 'shuffle' } }
];
const base = Todo.create(input);
Todo.install(base, rows, 'music');
const withDone = count => {
  const value = structuredClone(base);
  value.items.forEach((row, index) => { if (index < count) { row.status = 'completed'; row.receiptId = `receipt-${index + 1}`; } });
  return value;
};
const obs = {
  state: { tool: 'music.state', status: 'done', message: '当前队列50首。', data: { status: 'ready', revision: 'rev-1', count: 50, mode: 'sequence', isPlaying: false } },
  clear: { tool: 'music.queue.clear', status: 'done', message: '已清空队列。', data: { status: 'empty', revision: 'rev-2', count: 0 } },
  load: { tool: 'tools.load', status: 'done', message: '已加载 music.library。', data: { group: 'music.library' } },
  search: { tool: 'music.search', status: 'waiting', message: '请选择歌手。', data: { choices: [{ ref: 'artist:1', title: '许巍' }, { ref: 'artist:2', title: '许巍 Live' }], total: 2 } },
  coll: { tool: 'music.collection.get', status: 'done', message: '已读取热门歌曲。', data: { selectedRef: 'collection:1', count: 20, songs: Array.from({ length: 20 }, (_, index) => ({ ref: `song:${index + 1}`, title: `歌${index + 1}`, artist: '许巍' })) } },
  apply: { tool: 'music.queue.apply', status: 'done', message: '已追加20首。', data: { status: 'ready', revision: 'rev-3', count: 20 } },
  failed: { tool: 'music.collection.get', status: 'failed', message: '读取失败。', error: { code: 'MUSIC_REQUEST_FAILED', message: '读取热门歌曲失败。' } }
};
// 每轮：[已完成项数, 观察序列, 已加载工具组]。覆盖：回执累积、事项勾选、工具组加载（目录变化）、失败回执（条件段落出现）。
const rounds = [
  [0, [], []],
  [0, [obs.state], []],
  [1, [obs.state, obs.clear], []],
  [1, [obs.state, obs.clear, obs.load], ['music.library']],
  [1, [obs.state, obs.clear, obs.load, obs.search], ['music.library']],
  [1, [obs.state, obs.clear, obs.load, obs.search, obs.failed], ['music.library']],
  [1, [obs.state, obs.clear, obs.load, obs.search, obs.coll], ['music.library', 'music.queue']],
  [2, [obs.state, obs.clear, obs.load, obs.search, obs.coll, obs.apply], ['music.library', 'music.queue']]
];

async function capture() {
  const prompts = [];
  for (const [done, observations, toolGroups] of rounds) {
    const body = { ...input, todoTips: withDone(done), planningPhase: 'execute', observations, ...(toolGroups.length ? { toolGroups } : {}) };
    await plan(body, { reasoning: 'off', async generateObject(options) { prompts.push(options.instructions); return { steps: [{ tool: 'music.state', args: {} }], continue: true }; } });
  }
  return prompts;
}
const commonPrefix = (a, b) => { let index = 0; const limit = Math.min(a.length, b.length); while (index < limit && a[index] === b[index]) index += 1; return index; };

test('相邻规划轮的系统提示共享足够长的前缀：每轮都会变的段落不能夹在静态规则中间', async () => {
  const prompts = await capture();
  assert.equal(prompts.length, rounds.length);
  for (let index = 1; index < prompts.length; index += 1) {
    const share = commonPrefix(prompts[index - 1], prompts[index]) / Math.min(prompts[index - 1].length, prompts[index].length);
    assert.ok(share >= 0.58, `第 ${index + 1} 轮与上一轮的系统提示共享前缀只有 ${(share * 100).toFixed(1)}%，要求不低于 58%`);
  }
});

test('当前事项、工具目录、失败回执说明都排在静态规则之后，输出格式规则仍在最末', async () => {
  const prompts = await capture();
  const staticMarkers = ['音乐写操作的expectedRevision必须原样使用', '本次是队列组合任务', '只输出JSON：普通独立操作', '严格使用参数名、类型和枚举'];
  const volatileMarkers = ['当前事项：', '当前目标的最终工具组已按登记目录预加载', '本轮工具目录：', '可加载工具组：', 'observations中failed是失败回执'];
  const seenVolatile = new Set();
  prompts.forEach((text, round) => {
    const lastStatic = Math.max(...staticMarkers.map(marker => { const at = text.indexOf(marker); assert.ok(at >= 0, `第 ${round + 1} 轮缺少静态段落「${marker}」`); return at; }));
    for (const marker of volatileMarkers) {
      const at = text.indexOf(marker);
      if (at < 0) continue;
      seenVolatile.add(marker);
      assert.ok(at > lastStatic, `第 ${round + 1} 轮「${marker}」出现在静态规则之前（${at} <= ${lastStatic}）`);
    }
    assert.match(text, /输出必须是单行紧凑JSON：不得换行、不得缩进、不得使用代码围栏，开头必须直接是\{"。$/, `第 ${round + 1} 轮的格式规则必须是系统提示的最后一行`);
  });
  const optional = '当前目标的最终工具组已按登记目录预加载'; // 只在当前目标命中已登记工具组时出现，不强制
  assert.deepEqual([...seenVolatile].filter(marker => marker !== optional).sort(), volatileMarkers.filter(marker => marker !== optional).sort(),
    '夹具必须覆盖当前事项、工具目录、可加载工具组与失败回执说明，否则顺序断言没有意义');
});

// 第一处“每轮会变”的内容出现之前的字符数。实测四目标场景为 4637 字符，真实分词是 2110 token（约 0.455 token/字符），
// 旧布局只有 3336 字符。LM Studio 在 2048 token 处存检查点，所以静态前缀至少要有约 4500 字符。
// 失败时不要直接改小阈值：先用冷重放（见技术文档）确认命中，再同步更新这里和文档里的数字。
const MIN_STATIC_PREFIX_CHARS = 4500;

test('静态前缀足够长：第一处每轮会变的内容之前至少 4500 字符，否则 LM Studio 的 2048 token 检查点用不上', async () => {
  const prompts = await capture();
  const volatileMarkers = ['当前事项：', '当前目标的最终工具组已按登记目录预加载', '仅在本轮目录缺少当前事项必要工具时', 'observations中failed是失败回执', '本轮工具目录：'];
  prompts.forEach((text, round) => {
    const starts = volatileMarkers.map(marker => text.indexOf(marker)).filter(at => at >= 0);
    assert.ok(starts.length > 0, `第 ${round + 1} 轮找不到任何易变内容标记，夹具或标记已过时`);
    const staticChars = Math.min(...starts);
    assert.ok(staticChars >= MIN_STATIC_PREFIX_CHARS,
      `第 ${round + 1} 轮第一处易变内容前只有 ${staticChars} 字符（要求不少于 ${MIN_STATIC_PREFIX_CHARS}，约 2048 token）：静态规则被缩短，或有易变内容被放到了前面，相邻请求会拿不到提示缓存`);
  });
});

test('重排不改变内容：每个段落仍然出现，只是顺序变化', async () => {
  const [first, , , , , , , last] = await capture();
  for (const marker of ['你是快捷助手的受控工具规划器', '执行阶段：完整 Todo 已由执行器保存', '清空以清空回执验收', '未完成禁止done，遗漏continue时执行器仍继续', '当前事项：', '本轮工具目录：', '可加载工具组：', '只能调用本轮目录的工具', '输出调用计划，不声称已执行成功。']) {
    assert.ok(first.includes(marker) && last.includes(marker), `缺少「${marker}」`);
  }
});
