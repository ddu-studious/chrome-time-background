// One-off research experiment (not part of the product): can the local model write a usable card as HTML/CSS under the
// constraints in docs/research/research-native-popup-generated-ui-20261012.md, how long does it take, and does the
// result pass the locked-down WKWebView? Run (needs the local LM Studio model): node generate-cards.mjs [samples=3] [outDir]
// Not part of the build or the tests.
import { writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LMStudioProvider } from '../../../../../local-ai/provider.mjs';

const samples = Number(process.argv[2] || 3);
const out = process.argv[3] || mkdtempSync(join(tmpdir(), 'native-ui-gen-'));
mkdirSync(out, { recursive: true });
const model = new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, token: process.env.LM_STUDIO_TOKEN });

const facts = {
  state: 'failed',
  taskTitle: '推荐歌曲并加入本地播放队列',
  steps: [{ label: '读取当前队列', state: 'done' }, { label: '搜索真实歌单', state: 'done' }, { label: '加入本地播放队列', state: 'blocked' }],
  error: '同一操作重复失败，已停止自动恢复。最近错误：Todo 尚未完成：推荐歌曲并加入本地播放队列，请继续当前事项，不能结束整个任务',
  actions: [{ id: 'open-workbench', label: '打开工作台', kind: 'safe' }, { id: 'cancel-task', label: '取消任务', kind: 'destructive' }]
};
const instructions = `你是桌面提示卡片的界面设计师。根据给定的事实，输出一张提示卡片的 HTML 片段。
硬性规则：
1. 只输出 HTML：先一个 <style>，再一个 <main class="card">…</main>。不要 Markdown 代码围栏，不要解释。
2. 禁止：script、iframe、object、embed、form、input、button、meta、link、base、img 及任何外部地址、事件属性（onclick 等）。图标只能用内联 <svg>，圆点和进度环用 CSS。
3. 卡片宽 520px，body 背景透明，字体用系统字体 -apple-system, "PingFang SC", sans-serif，需同时适配浅色与深色（color-scheme: light dark）。
4. 事实不得改动：步骤的名称与状态（done=已完成，blocked=卡住，todo=未做）必须与事实一致；不能说成已完成未完成的事；不要编造数字以外的信息。错误原文放进 <details>。
5. 操作只能是 <a href="action://choice/ID">文字</a>，ID 与文字必须来自事实里的 actions；safe 操作用 class="primary"，destructive 操作用 class="secondary" 且放在 primary 左侧。不得出现其他 href。
6. 重点是让用户一眼看懂：发生了什么、做到哪一步、现在可以做什么。控制在 3KB 以内。`;

const rows = [];
for (let index = 1; index <= samples; index++) {
  const started = Date.now();
  let usage = null;
  try {
    const result = await model.generateText({ instructions, input: JSON.stringify(facts), reasoning: 'off', maxOutputTokens: 3000, timeoutMs: 240000, onUsage: value => { usage = value; } });
    const ms = Date.now() - started;
    let html = result.text.trim().replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/, '');
    const doc = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body style="margin:0;padding:16px">${html}</body></html>`;
    writeFileSync(`${out}/gen-${index}.html`, doc);
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']*)["']/gi)].map(match => match[1]);
    const forbidden = ['<script', '<iframe', '<object', '<embed', '<form', '<input', '<button', '<meta', '<link', '<base', '<img', 'http://', 'https://', ' on'].filter(word => html.toLowerCase().includes(word));
    const labels = facts.steps.map(step => step.label), actions = facts.actions.map(action => action.label);
    rows.push({ sample: index, ms, usage, stopReason: result.stopReason, chars: html.length, bytes: Buffer.byteLength(html), hrefs,
      hrefsAllowed: hrefs.length === 2 && hrefs.every(href => ['action://choice/open-workbench', 'action://choice/cancel-task'].includes(href)),
      forbidden, missingLabels: [...labels, ...actions].filter(label => !html.includes(label)), hasDetailsWithError: /<details[\s\S]*同一操作重复失败/.test(html) });
  } catch (error) {
    rows.push({ sample: index, ms: Date.now() - started, error: `${error.code || ''} ${String(error.message).slice(0, 200)}` });
  }
  console.log(JSON.stringify(rows.at(-1)));
}
writeFileSync(`${out}/generation.json`, JSON.stringify({ model: model.model, reasoning: 'off', maxOutputTokens: 3000, facts, rows }, null, 1));
