const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// A just-big-enough DOM for js/ai-control.js: elements are created on demand by id, and tree walks cover the
// selectors the script uses. Everything else would throw, which keeps the harness honest.
function fakeDocument() {
  const byId = new Map();
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.textContent = ''; this.value = ''; this.checked = false; this.disabled = false; this.className = ''; this.classList = { toggle() {}, add() {}, remove() {} }; }
    append(...nodes) { for (const node of nodes) this.children.push(typeof node === 'string' ? { text: node } : node); }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    get options() { return this.children; }
    closest() { return null; }
    descendants() { return this.children.flatMap(child => [child, ...(child.descendants ? child.descendants() : [])]); }
    querySelectorAll(selector) { return this.descendants().filter(node => node.tag === selector); }
    querySelector(selector) {
      const match = /^input\[value="([^"]+)"\]$/.exec(selector);
      if (match) return this.descendants().find(node => node.tag === 'input' && node.value === match[1]) || null;
      const id = /^#(.+)$/.exec(selector)?.[1];
      if (!id) throw new Error(`测试 DOM 不支持选择器 ${selector}`);
      if (!byId.has(id)) { const node = new Node('div'); node.id = id; byId.set(id, node); }
      return byId.get(id);
    }
  }
  const page = new Node('section');
  return { page, byId, document: { getElementById: id => id === 'page-ai-control' ? page : null, createElement: tag => new Node(tag), createTextNode: text => ({ text }) } };
}

async function settle(until, label) {
  for (let i = 0; i < 200; i++) { if (until()) return; await new Promise(resolve => setImmediate(resolve)); }
  throw new Error(`等待超时：${label}`);
}

async function controlPage({ computeEnabled, disabledScenes = computeEnabled ? [] : ['assistant.compute'] }) {
  const dom = fakeDocument(), sent = [];
  const scene = (id, name, enabled = true) => ({ id, name, version: 1, modelEnabled: enabled });
  const policy = { modelEnabled: true, disabledScenes, computeEnabled, speechSynthesisEnabled: false, contextCompaction: 'hybrid', layaMode: 'off', planningStrategy: 'follow', dailyRequestLimit: 200, failureThreshold: 3, cooldownMs: 60000, model: null, embeddingModel: 'embed', reasoning: 'off', timeoutMs: 90000, maxOutputTokens: 4096 };
  const control = { ok: true, revision: 7, policy, scenes: [scene('assistant.plan', 'AI 工作台规划'), scene('assistant.compute', '代码计算（QuickJS 沙箱，只读无 I/O）', computeEnabled), scene('speech.synthesize', '助手回答朗读（StepAudio）', false)], usage: { day: '2026-10-12', admitted: 0, scenes: {} }, history: [], jobs: [], records: [], speech: {}, synthesis: {}, laya: {} };
  const chrome = { runtime: { async sendMessage(message) {
    sent.push(message);
    if (message.action === 'ai_control_get') return control;
    if (message.action === 'ai_control_save') return { ...control, revision: control.revision + 1, policy: { ...message.policy } };
    if (message.action === 'local_ai_status') return { ok: true, model: 'fixture', state: 'ready', models: [] };
    if (message.action === 'music_sleep_get') return { ok: true, timer: null };
    return { ok: false, error: `未预期的消息 ${message.action}` };
  } } };
  vm.runInNewContext(read('js/ai-control.js'), { document: dom.document, chrome, Number, Boolean, Date, Set, JSON, Promise, Error, console }, { filename: 'js/ai-control.js' });
  await settle(() => dom.byId.get('notice')?.textContent === '控制策略已刷新', '首次刷新');
  const compute = () => dom.byId.get('scenes').querySelector('input[value="assistant.compute"]');
  const save = async () => {
    const before = sent.filter(message => message.action === 'ai_control_save').length;
    dom.byId.get('policy').listeners.submit({ preventDefault() {} });
    await settle(() => sent.filter(message => message.action === 'ai_control_save').length > before, '保存策略');
    return sent.findLast(message => message.action === 'ai_control_save');
  };
  return { compute, save, sent };
}

test('AI 设置：勾选状态读取 computeEnabled；默认策略（开关关闭、场景未禁用）也必须显示为未勾选', async () => {
  const on = await controlPage({ computeEnabled: true });
  assert.equal(on.compute().checked, true);
  const off = await controlPage({ computeEnabled: false });
  assert.equal(off.compute().checked, false);
  const fresh = await controlPage({ computeEnabled: false, disabledScenes: [] });
  assert.equal(fresh.compute().checked, false, '新安装的默认策略里 disabledScenes 为空，但代码计算默认关闭');
  const savedFresh = await fresh.save();
  assert.equal(savedFresh.policy.computeEnabled, false, '未触碰开关的保存不能顺手把它打开');
});

test('AI 设置：保存时必须带上 computeEnabled，否则任何一次保存都会把已开启的代码计算静默关掉', async () => {
  const page = await controlPage({ computeEnabled: true });
  const message = await page.save();
  assert.equal(message.policy.computeEnabled, true);
  assert.ok(!message.policy.disabledScenes.includes('assistant.compute'), '开启状态保存后不能把场景也禁用');
  assert.equal(message.expectedRevision, 7);
});

test('AI 设置：取消勾选即关闭，勾选即开启；开关和场景禁用同步变化', async () => {
  const page = await controlPage({ computeEnabled: true });
  page.compute().checked = false;
  let message = await page.save();
  assert.equal(message.policy.computeEnabled, false);
  assert.ok(message.policy.disabledScenes.includes('assistant.compute'));
  const closed = await controlPage({ computeEnabled: false });
  closed.compute().checked = true;
  message = await closed.save();
  assert.equal(message.policy.computeEnabled, true);
  assert.ok(!message.policy.disabledScenes.includes('assistant.compute'));
});

test('AI 设置：朗读开关和代码计算开关互不影响', async () => {
  const page = await controlPage({ computeEnabled: false });
  const message = await page.save();
  assert.equal(message.policy.computeEnabled, false);
  assert.equal(message.policy.speechSynthesisEnabled, false);
});

test('AI 设置页说明代码计算的边界，并随脚本版本更新', () => {
  const html = read('settings.html');
  assert.match(html, /id="compute-hint"/);
  const hint = html.match(/id="compute-hint">([^<]+)</)[1];
  for (const phrase of [/默认关闭/, /只读/, /不能联网/, /不能执行/, /展示代码/]) assert.match(hint, phrase, String(phrase));
  assert.match(html, /js\/ai-control\.js\?v=6/);
});

// ---- Execution timeline: the user must be able to read the program the model wrote ----

const { computeDetails } = (() => { require('../js/assistant-timeline.js'); return globalThis.AssistantTimeline; })();
const CODE = 'const counts = {};\nfor (const song of input.refs["context:5"].items) counts[song.artist] = (counts[song.artist] || 0) + 1;\nreturn Object.entries(counts).map(([name, n]) => `${name}：${n} 首`).join("\\n");';
const row = (extra = {}) => ({ id: 't:tool:3', tool: 'compute.run', title: '只读计算', status: 'succeeded', input: { purpose: '统计每位歌手的歌曲数', code: CODE, inputRefs: ['context:5'] },
  output: { message: '计算结果（统计每位歌手的歌曲数）：…', observation: { purpose: '统计每位歌手的歌曲数', output: '周杰伦：3 首\n林俊杰：2 首', outputBytes: 40, sources: ['context:5'] } }, ...extra });

test('时间线：只有 compute.run 行有专用详情，其他工具沿用通用展示', () => {
  assert.equal(computeDetails({ tool: 'music.state', input: { code: 'x' } }), null);
  assert.equal(computeDetails(null), null);
  assert.ok(Array.isArray(computeDetails(row())));
});

test('时间线：目的、原样多行代码、输入来源和计算输出各自成块，代码不被转义成一行 JSON', () => {
  const blocks = computeDetails(row());
  const byTitle = Object.fromEntries(blocks.map(block => [block.title.slice(0, 4), block]));
  assert.equal(byTitle['计算目的'].text, '统计每位歌手的歌曲数');
  assert.equal(byTitle['模型生成'].kind, 'pre');
  assert.equal(byTitle['模型生成'].text, CODE, '代码逐字展示，换行是真换行');
  assert.match(byTitle['模型生成'].title, /不能联网/);
  assert.equal(byTitle['输入来源'].text, 'context:5');
  assert.equal(byTitle['计算输出'].kind, 'pre');
  assert.equal(byTitle['计算输出'].text, '周杰伦：3 首\n林俊杰：2 首');
  assert.ok(blocks.every(block => typeof block.title === 'string' && typeof block.text === 'string' && ['p', 'pre'].includes(block.kind)), '只产出纯文本块，由 textContent 渲染');
});

test('时间线：对象输出缩进展示；超长代码被轨迹截断时明确说明运行的是完整代码', () => {
  const object = computeDetails(row({ output: { message: 'x', observation: { output: { total: 5, top: '周杰伦' } } } })).find(block => block.title === '计算输出');
  assert.equal(object.text, JSON.stringify({ total: 5, top: '周杰伦' }, null, 2));
  const truncated = computeDetails(row({ input: { purpose: '统计', code: `${'a'.repeat(1960)}\n[文本已截断]`, inputRefs: ['context:5'] } }));
  const note = truncated.find(block => /截断/.test(block.title + block.text) && block.kind === 'p');
  assert.ok(note, '截断提示');
  assert.match(note.text, /完整代码/);
});

test('时间线：失败或旧记录缺字段时不抛错，也不伪造输出块', () => {
  const failed = computeDetails({ tool: 'compute.run', status: 'failed', input: { purpose: '统计', code: 'return (', inputRefs: ['context:5'] }, error: { message: 'COMPUTE_SYNTAX_ERROR', code: 'COMPUTE_SYNTAX_ERROR' } });
  assert.ok(failed.some(block => block.title.startsWith('模型生成')));
  assert.ok(!failed.some(block => block.title === '计算输出'));
  assert.deepEqual(computeDetails({ tool: 'compute.run' }), []);
  assert.deepEqual(computeDetails({ tool: 'compute.run', input: { code: 42, purpose: { x: 1 }, inputRefs: 'context:5' }, output: { observation: null } }), []);
});

test('时间线渲染使用专用详情，并随脚本版本更新', () => {
  const timeline = read('js/assistant-timeline.js'), html = read('assistant.html');
  assert.match(timeline, /const compute = computeDetails\(row\)/);
  assert.match(timeline, /root\.AssistantTimeline = \{ create, offOrigin, computeDetails \}/);
  assert.match(html, /js\/assistant-workbench\.bundle\.js\?v=20261020-startup/);
});
