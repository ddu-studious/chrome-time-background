// 设置页“桌面水母形象”卡片合同：元素、无内联处理器、只经扩展消息读写、状态文字说明预览条件。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('settings.html');
const source = read('js/settings-jelly-appearance.js');
const css = read('css/settings-page.css');

const cardOf = () => {
  const start = html.indexOf('id="sp-jelly-appearance-card"');
  assert.ok(start > 0, '应有形象卡片');
  const end = html.indexOf('id="sp-jelly-nudge-card"', start);
  return html.slice(start, end > 0 ? end : start + 6000);
};

test('settings.html 有形象卡片，位于“桌面水母”卡片之后、“水母关怀”之前', () => {
  const card = cardOf();
  for (const id of ['set-jellyColorSwatches', 'set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus']) assert.ok(card.includes(`id="${id}"`), id);
  assert.ok(html.indexOf('id="sp-desktop-jelly-card"') < html.indexOf('id="sp-jelly-appearance-card"'));
  assert.ok(html.indexOf('id="sp-jelly-appearance-card"') < html.indexOf('id="sp-jelly-nudge-card"'));
});

test('色板：8 个按钮，data-color 为 0..7，各有可读名称，默认冰蓝（色位 5）为选中', () => {
  const card = cardOf();
  const buttons = [...card.matchAll(/<button[^>]*data-color="(\d)"[^>]*>/g)];
  assert.deepEqual(buttons.map(m => Number(m[1])), [0, 1, 2, 3, 4, 5, 6, 7]);
  for (const [tag] of buttons) { assert.match(tag, /type="button"/); assert.match(tag, /role="radio"/); assert.match(tag, /aria-label="[^"]+"/); assert.match(tag, /title="[^"]+"/); }
  const checked = buttons.filter(([tag]) => /aria-checked="true"/.test(tag)).map(m => Number(m[1]));
  assert.deepEqual(checked, [5]);
  assert.match(card, /role="radiogroup"/);
});

test('花纹下拉：纯色/双色/渐变/七彩，值与 JellyAppearance.LOOKS 一致', () => {
  const A = require('../js/jelly-appearance.js');
  const select = cardOf().match(/<select[^>]*id="set-jellyLook"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  assert.deepEqual([...select.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), [...A.LOOKS]);
});

test('卡片文案：说明预览条件、阶段色覆盖，以及材质与尺寸稍后加入', () => {
  const card = cardOf();
  assert.match(card, /常驻/);
  assert.match(card, /没有常驻时没有实时预览/);
  assert.match(card, /临近|紧迫/);
  assert.match(card, /材质与尺寸会在后续版本加入/);
});

test('卡片里没有内联事件处理器与内联脚本（MV3 CSP）', () => {
  assert.doesNotMatch(cardOf(), /\son[a-z]+\s*=|<script/i);
});

test('脚本加载：在 settings-page.js 之后、带版本号', () => {
  assert.ok(html.indexOf('js/settings-page.js?v=10') < html.indexOf('js/settings-jelly-appearance.js?v=1'));
  assert.match(html, /<script src="js\/settings-jelly-appearance\.js\?v=1"><\/script>/);
});

test('色板与随机按钮有样式：选中态、键盘焦点环、禁用态', () => {
  assert.match(css, /\.sp-jelly-swatch\b/);
  assert.match(css, /\.sp-jelly-swatch\[aria-checked="true"\]/);
  assert.match(css, /\.sp-jelly-swatch:focus-visible/);
  assert.match(css, /\.sp-jelly-swatch:disabled/);
  assert.match(css, /\.sp-jelly-reroll\b/);
});

test('脚本：只经扩展消息读写，无 innerHTML、网络、直接写存储、eval', () => {
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /chrome\.runtime\.sendMessage/);
  for (const action of ['jelly_appearance_get', 'jelly_appearance_set', 'jelly_appearance_reroll']) assert.ok(code.includes(action), action);
  assert.doesNotMatch(code, /innerHTML|\bfetch\(|XMLHttpRequest|chrome\.storage\.(local|sync)\.set|\.onclick\s*=|eval\(|new Function/);
});

// 测试里的色块十六进制（与 settings.html 一致，下面有对照测试）
const TEST_HEX = ['#ff736b', '#ff9e4d', '#f5d152', '#6bd17a', '#5cd6b3', '#66bde6', '#a880f2', '#ed75cc'];
// 在沙箱里加载脚本，替身 DOM 与 chrome，测行为。选项（都可省）：
//   dom.noPreview / dom.noCard / dom.missing（缺失的元素 id）/ dom.noTitles（色块没有 title）/ dom.reverseSwatches（querySelectorAll 返回的顺序与 data-color 相反）
//   hold：消息不自动回复，进入 pending，由测试调用 answer(响应)；lastError：回调执行期间 chrome.runtime.lastError 的值
//   timers：替身 setTimeout/clearTimeout；readyState：document.readyState；noDocument：不提供 document（非页面环境）
function load(reply, { dom = {}, hold = false, lastError = null, timers = null, readyState = 'complete', noDocument = false } = {}) {
  const els = {}, listeners = {}, domListeners = {}, pending = [];
  const missing = new Set(dom.missing || []);
  const make = id => (els[id] = { id, dataset: {}, disabled: false, hidden: false, value: '', checked: false, textContent: '', attrs: {}, listeners: {}, vars: {},
    style: { setProperty(k, v) { this.owner.vars[k] = v; }, getPropertyValue(k) { return this.owner.vars[k] || ''; } },
    addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; } });
  const ids = ['sp-jelly-appearance-card', 'set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus', 'set-jellyColorSwatches', ...(dom.noPreview ? [] : ['set-jellyPreview', 'set-jellyPreviewLabel', 'set-jellyPreviewText'])];
  for (const id of ids) if (!missing.has(id) && !(dom.noCard && id === 'sp-jelly-appearance-card')) make(id);
  for (const el of Object.values(els)) el.style.owner = el;
  const NAMES = ['红', '橙', '黄', '绿', '薄荷', '冰蓝（默认）', '紫', '洋红'];
  const swatches = Array.from({ length: 8 }, (_, color) => {
    const el = make(`swatch-${color}`); el.style.owner = el; el.dataset.color = String(color);
    el.vars['--swatch'] = TEST_HEX[color]; el.attrs['aria-label'] = NAMES[color];
    if (!dom.noTitles) el.attrs.title = NAMES[color];
    return el;
  });
  const sent = [];
  const document = {
    readyState,
    getElementById: id => els[id] || null,
    querySelectorAll: selector => (selector.includes('data-color') ? (dom.reverseSwatches ? [...swatches].reverse() : swatches) : []),
    addEventListener(type, fn) { domListeners[type] = fn; },
  };
  const chrome = {
    runtime: { lastError: null, sendMessage(message, cb) {
      sent.push(message);
      const answer = response => { chrome.runtime.lastError = lastError; try { cb(response); } finally { chrome.runtime.lastError = null; } };
      if (hold) pending.push({ message, answer });
      else Promise.resolve().then(() => answer(typeof reply === 'function' ? reply(message) : reply));
    } },
    storage: { onChanged: { addListener(fn) { listeners.storage = fn; } } },
  };
  const window = {};
  new Function('window', 'document', 'chrome', 'setTimeout', 'clearTimeout', `${source}`)(window, noDocument ? undefined : document, chrome, timers?.setTimeout || setTimeout, timers?.clearTimeout || clearTimeout);
  return { els, swatches, sent, window, listeners, domListeners, pending };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const view = (settings, extra = {}) => ({ ok: true, settings: { color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false, ...settings }, resolved: {}, component: 'ok', connected: true, ...extra });

test('状态文字：每种组件状态都给出可行动的说明，没生效就不说已生效', () => {
  const { window } = load(view({}));
  const d = window.JellyAppearanceSettings.describe;
  assert.match(d({ component: 'ok', connected: true }), /已应用/);
  assert.match(d({ component: 'unsupported', connected: true }), /更新桌面组件/);
  assert.doesNotMatch(d({ component: 'unsupported', connected: true }), /已应用|已生效/);
  assert.match(d({ component: 'unknown', connected: false }), /没有连上/);
  assert.match(d({ component: 'unknown', connected: false }), /常驻/);
  assert.match(d({ component: 'off', connected: false }), /已保存/);
});

test('打开页面：读取设置并显示——选中色位、花纹、每天换', async () => {
  const { els, swatches, sent } = load(view({ color: 2, look: 'duo', daily: false }));
  await tick();
  assert.deepEqual(sent[0], { action: 'jelly_appearance_get' });
  assert.deepEqual(swatches.map(s => s.attrs['aria-checked']), ['false', 'false', 'true', 'false', 'false', 'false', 'false', 'false']);
  assert.equal(els['set-jellyLook'].value, 'duo');
  assert.equal(els['set-jellyDaily'].checked, false);
  assert.match(els['set-jellyAppearanceStatus'].textContent, /已应用/);
});

test('点色板：发送 set(color)，成功后选中态与状态更新', async () => {
  let current = view({ color: 5 });
  const { swatches, sent, els } = load(message => (message.action === 'jelly_appearance_set' ? (current = view({ ...current.settings, ...message.settings })) : current));
  await tick();
  swatches[0].listeners.click();
  await tick();
  assert.deepEqual(sent[1], { action: 'jelly_appearance_set', settings: { color: 0 } });
  assert.equal(swatches[0].attrs['aria-checked'], 'true'); assert.equal(swatches[5].attrs['aria-checked'], 'false');
  assert.match(els['set-jellyAppearanceStatus'].textContent, /已应用/);
});

test('改花纹与“每天换”：各发一条 set；“随机”发 reroll 并显示新结果', async () => {
  let current = view({ color: 5 });
  const { els, swatches, sent } = load(message => {
    if (message.action === 'jelly_appearance_set') current = view({ ...current.settings, ...message.settings });
    if (message.action === 'jelly_appearance_reroll') current = view({ color: 3, look: 'rainbow', daily: false });
    return current;
  });
  await tick();
  els['set-jellyLook'].listeners.change({ target: { value: 'blend' } }); await tick();
  els['set-jellyDaily'].listeners.change({ target: { checked: true } }); await tick();
  els['set-jellyReroll'].listeners.click(); await tick();
  assert.deepEqual(sent.slice(1).map(m => m.action), ['jelly_appearance_set', 'jelly_appearance_set', 'jelly_appearance_reroll']);
  assert.deepEqual(sent[1].settings, { look: 'blend' });
  assert.deepEqual(sent[2].settings, { daily: true });
  assert.equal(els['set-jellyLook'].value, 'rainbow'); assert.equal(swatches[3].attrs['aria-checked'], 'true');
});

test('“每天换一只”开着时颜色与花纹不可改（避免以为能改）；关掉后恢复', async () => {
  const { els, swatches } = load(view({ daily: true }));
  await tick();
  assert.equal(els['set-jellyLook'].disabled, true);
  assert.ok(swatches.every(s => s.disabled === true));
  const off = load(view({ daily: false }));
  await tick();
  assert.equal(off.els['set-jellyLook'].disabled, false);
  assert.ok(off.swatches.every(s => s.disabled === false));
});

test('保存失败：如实显示原因与重试办法，控件恢复可用，不说已应用', async () => {
  const { swatches, els } = load(message => (message.action === 'jelly_appearance_set' ? { ok: false, error: 'color 的取值无效' } : view({})));
  await tick();
  swatches[1].listeners.click();
  await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /保存失败：color 的取值无效/);
  assert.doesNotMatch(els['set-jellyAppearanceStatus'].textContent, /已应用/);
  assert.equal(els['set-jellyReroll'].disabled, false);
  assert.equal(swatches[1].disabled, false);
});

test('读取失败（后台没有响应）：显示无法读取，不留空白', async () => {
  const { els } = load({ ok: false, error: '仅扩展页面可设置桌面水母形象' });
  await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /无法读取形象设置/);
});

test('后台响应不完整（没有 settings，或 ok 不是 true）：给出明确提示，不泄露内部报错，控件恢复可用', async () => {
  for (const bad of [{}, { ok: true }, { ok: true, settings: null }, { ok: 'yes', settings: { color: 1 } }, { success: true }]) {
    const { els, swatches } = load(bad);
    await tick();
    const text = els['set-jellyAppearanceStatus'].textContent;
    assert.match(text, /无法读取形象设置：后台返回的数据不完整/, JSON.stringify(bad));
    assert.doesNotMatch(text, /undefined|Cannot read|TypeError/, JSON.stringify(bad));
    assert.ok(swatches.every(s => s.disabled === false), '控件应恢复可用');
  }
  // 保存时同样
  const { els, swatches } = load(message => (message.action === 'jelly_appearance_set' ? {} : view({})));
  await tick();
  swatches[2].listeners.click(); await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /保存失败：后台返回的数据不完整/);
});

test('快速连点：消息按顺序一条条发送，不并发', async () => {
  let inFlight = 0, maxInFlight = 0;
  const reply = message => { inFlight++; maxInFlight = Math.max(maxInFlight, inFlight); Promise.resolve().then(() => { inFlight--; }); return view({}); };
  const { swatches, sent } = load(reply);
  await tick();
  swatches[1].listeners.click(); swatches[2].listeners.click(); swatches[3].listeners.click();
  await tick(); await tick();
  assert.ok(sent.length >= 2, '至少处理了其中的点击');
  assert.ok(maxInFlight <= 1, `同时在途的消息应 ≤1，实际 ${maxInFlight}`);
});


// ---------- 外观示意图（“当前形象 / 今天这只”） ----------

const swiftSource = read('desktop-reminder/jelly-appearance.swift');
const materialsSource = read('desktop-reminder/jelly-materials.swift');
const paintSource = read('desktop-reminder/jelly-paint.swift');   // 颜料规则（花纹 → 各部位颜色）是纯逻辑，在 jelly-paint.swift

test('示意图：卡片第一项是“当前形象”，有示意图容器、名称与文字说明，并声明是示意', () => {
  const card = cardOf();
  const first = card.indexOf('class="sp-field');
  const preview = card.indexOf('id="set-jellyPreview"');
  assert.ok(preview > 0 && first > 0 && preview < card.indexOf('id="set-jellyColorSwatches"'), '示意图应在颜色选择之前');
  for (const id of ['set-jellyPreview', 'set-jellyPreviewLabel', 'set-jellyPreviewText']) assert.ok(card.includes(`id="${id}"`), id);
  assert.match(card, /id="set-jellyPreview"[^>]*role="img"/, '示意图容器要有 role=img 供读屏');
  assert.match(card, /示意/, '要说明这是示意图而不是桌面实际画面');
  assert.match(card, /<svg[^>]*aria-hidden="true"/, 'svg 本身对读屏隐藏，文字说明在容器的 aria-label 与旁边的文字里');
});

test('示意图：svg 里的 id 在整页唯一，且没有脚本、内联处理器、外链', () => {
  const card = cardOf();
  const svg = card.match(/<svg[\s\S]*?<\/svg>/)?.[0] || '';
  assert.ok(svg.length > 500, '应有内联 svg 示意图');
  assert.doesNotMatch(svg, /<script|\son[a-z]+\s*=|href="(?!#)|xlink:|<image|<foreignObject|url\(\s*['"]?(?!#)/i, '只允许指向 svg 内部的引用（#id），不许外链、脚本、图片');
  for (const ref of svg.matchAll(/href="#([^"]+)"/g)) assert.ok(svg.includes(`id="${ref[1]}"`), `${ref[1]} 要在 svg 内定义`);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual([...new Set(dup)], [], `settings.html 里有重复 id：${dup.join(',')}`);
  for (const gradient of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(svg.includes(`id="${gradient[1]}"`), `${gradient[1]} 要在 svg 内定义`);
});

test('示意图：三种钟罩填充、五根触手、两条口腕都有可被样式选中的钩子', () => {
  const svg = cardOf().match(/<svg[\s\S]*?<\/svg>/)?.[0] || '';
  for (const kind of ['solid', 'blend', 'rainbow', 'light']) assert.match(svg, new RegExp(`data-bell="${kind}"`), kind);
  assert.equal((svg.match(/data-tentacle="\d"/g) || []).length, 5);
  assert.equal((svg.match(/data-oral="\d"/g) || []).length, 2);
  assert.match(svg, /class="jp-outline"/);
});

test('示意图样式：按 data-look 切换钟罩填充，颜色全部来自 --jp-* 变量；读屏文字与动效不依赖它', () => {
  assert.match(css, /\.sp-jelly-preview\b/);
  for (const kind of ['solid', 'blend', 'rainbow']) assert.match(css, new RegExp(`\\[data-look="${kind}"\\][^{]*\\[data-bell="${kind}"\\]`), kind);
  assert.match(css, /--jp-a/); assert.match(css, /--jp-t0/); assert.match(css, /--jp-oral/); assert.match(css, /--jp-outline/);
  assert.doesNotMatch(css.match(/\.sp-jelly-preview[^}]*\{[^}]*\}/g)?.join('') || '', /animation|transition/, '示意图是静态的');
});

test('色块十六进制与原生调色板一致（四舍五入后逐位相同）：色块显示什么颜色，桌面上就是什么颜色', () => {
  const rows = [...swiftSource.matchAll(/\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)\s*,\s*\/\/\s*(\d)/g)];
  assert.equal(rows.length, 8, '应能从 jelly-appearance.swift 读出 8 个调色板色位');
  const hex = value => Math.round(Number(value) * 255).toString(16).padStart(2, '0');
  const swatches = [...cardOf().matchAll(/data-color="(\d)"[^>]*--swatch:(#[0-9a-f]{6})/g)].map(m => [Number(m[1]), m[2]]);
  assert.equal(swatches.length, 8);
  for (const [, r, g, b, slot] of rows) {
    const expected = `#${hex(r)}${hex(g)}${hex(b)}`;
    const actual = swatches.find(([index]) => index === Number(slot))?.[1];
    assert.equal(actual, expected, `色位 ${slot}：色块 ${actual} 与原生调色板 ${expected} 不一致`);
  }
});

test('文案：渐变是“下缘 → 顶部”的纵向渐变（与原生画法一致），不再写“由边缘到中心”', () => {
  const card = cardOf();
  assert.doesNotMatch(card, /由边缘渐变到中心|边缘渐变到中心/);
  assert.match(card, /下缘/);
  assert.match(card, /顶部/);
});

// 取色规则：把后台解析出的颜色位分配到钟罩、触手、口腕、描边（与原生 JellyPaint 同规则）
const fakePalette = Array.from({ length: 8 }, (_, i) => [i / 10, 0.5, 1 - i / 10]);
const mix = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
const near = (actual, expected, label) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-9, `${label}：${actual} ≠ ${expected}`));

test('paintOf：纯色整只一个颜色', () => {
  const { window } = load(view({}));
  const paint = window.JellyAppearanceSettings.paintOf({ colors: [3], look: 'solid' }, fakePalette);
  assert.equal(paint.kind, 'solid');
  near(paint.a, fakePalette[3], 'a'); near(paint.b, fakePalette[3], 'b'); near(paint.c, fakePalette[3], 'c');
  paint.tentacles.forEach((t, i) => near(t, fakePalette[3], `触手 ${i}`));
  near(paint.oral, fakePalette[3], '口腕'); near(paint.outline, fakePalette[3], '描边');
});

test('paintOf：双色钟罩主色、触手与口腕第二色，描边主色', () => {
  const { window } = load(view({}));
  const paint = window.JellyAppearanceSettings.paintOf({ colors: [0, 6], look: 'duo' }, fakePalette);
  near(paint.a, fakePalette[0], 'a'); near(paint.b, fakePalette[6], 'b');
  paint.tentacles.forEach((t, i) => near(t, fakePalette[6], `触手 ${i}`));
  near(paint.oral, fakePalette[6], '口腕'); near(paint.outline, fakePalette[0], '描边');
});

test('paintOf：渐变的触手偏向第二色（0.7），钟罩中段是两色的中点', () => {
  const { window } = load(view({}));
  const paint = window.JellyAppearanceSettings.paintOf({ colors: [2, 4], look: 'blend' }, fakePalette);
  paint.tentacles.forEach((t, i) => near(t, mix(fakePalette[2], fakePalette[4], 0.7), `触手 ${i}`));
  near(paint.mid, mix(fakePalette[2], fakePalette[4], 0.5), '钟罩中段');
  near(paint.oral, fakePalette[4], '口腕'); near(paint.outline, fakePalette[2], '描边');
});

test('paintOf：七彩的触手沿横向在三色之间取色，口腕第二色，描边第二色', () => {
  const { window } = load(view({}));
  const paint = window.JellyAppearanceSettings.paintOf({ colors: [5, 7, 1], look: 'rainbow' }, fakePalette);
  const [a, b, c] = [fakePalette[5], fakePalette[7], fakePalette[1]];
  near(paint.tentacles[0], a, '触手 0（最左）'); near(paint.tentacles[1], mix(a, b, 0.5), '触手 1');
  near(paint.tentacles[2], b, '触手 2（正中）'); near(paint.tentacles[3], mix(b, c, 0.5), '触手 3'); near(paint.tentacles[4], c, '触手 4（最右）');
  near(paint.oral, b, '口腕'); near(paint.outline, b, '描边');
});

test('paintOf：颜色位不够或越界时与原生解析一致地退回纯色；完全无效返回 null', () => {
  const { window } = load(view({}));
  const paintOf = window.JellyAppearanceSettings.paintOf;
  assert.equal(paintOf({ colors: [1], look: 'duo' }, fakePalette).kind, 'solid');
  assert.equal(paintOf({ colors: [1, 2], look: 'rainbow' }, fakePalette).kind, 'solid');
  assert.equal(paintOf({ colors: [1, 9], look: 'duo' }, fakePalette).kind, 'solid', '越界的颜色位不采用');
  assert.equal(paintOf({ colors: [1, 2], look: 'stripe' }, fakePalette).kind, 'solid', '未知花纹按纯色');
  for (const bad of [null, undefined, {}, { colors: [] }, { colors: [true, 1], look: 'duo' }, { colors: [9], look: 'solid' }, 'x', 3]) assert.equal(paintOf(bad, fakePalette), null, JSON.stringify(bad));
});

test('取色规则与原生 JellyPaint 一致（源码绊线）：Swift 里的关键规则一改，这里就会失败，提醒同步示意图', () => {
  const paintRules = [
    [/case\s+\.duo,\s*\.blend:\s*return JellyPaint\(kind:\s*appearance\.look,\s*a:\s*tints\[0\],\s*b:\s*tints\[1\],\s*c:\s*tints\[1\]\)/, 'duo/blend 的 a、b、c'],
    [/case\s+\.rainbow:\s*return JellyPaint\(kind:\s*\.rainbow,\s*a:\s*tints\[0\],\s*b:\s*tints\[1\],\s*c:\s*tints\[2\]\)/, 'rainbow 的 a、b、c'],
    [/case\s+\.duo:\s*return b\b/, '双色触手用第二色'],
    [/case\s+\.blend:\s*return a\.mixed\(toward:\s*b,\s*0\.7\)/, '渐变触手偏向第二色 0.7'],
    [/return u < 0\.5 \? a\.mixed\(toward:\s*b,\s*u \* 2\) : b\.mixed\(toward:\s*c,\s*\(u - 0\.5\) \* 2\)/, '七彩触手沿横向三色取色'],
    [/var oralTone: JellyTint \{ kind == \.solid \? a : b \}/, '口腕：纯色用主色，其余第二色'],
    [/var outlineTone: JellyTint \{ kind == \.rainbow \? b : a \}/, '描边：七彩用第二色，其余主色'],
  ];
  const fillRules = [      // 钟罩填充是 AppKit 画法，仍在 jelly-materials.swift
    [/let mid = paint\.a\.mixed\(toward:\s*paint\.b,\s*0\.5\)/, '渐变钟罩中段是两色中点'],
    [/NSGradient\(colors:\s*\[paint\.a\.color\(0\.50\),\s*mid\.color\(0\.74,\s*lighten:\s*0\.22\),\s*paint\.b\.color\(0\.94,\s*lighten:\s*0\.45\)\],[\s\S]*?gradient\?\.draw\(in:\s*bell,\s*angle:\s*90\)/, '渐变钟罩：自下而上 主色 → 中点 → 第二色'],
    [/bands\?\.draw\(in:\s*bell,\s*angle:\s*0\)/, '七彩钟罩：横向三段'],
  ];
  for (const [pattern, label] of paintRules) assert.match(paintSource, pattern, `原生规则变了：${label}。请同步 js/settings-jelly-appearance.js 的 paintOf 与示意图`);
  for (const [pattern, label] of fillRules) assert.match(materialsSource, pattern, `原生画法变了：${label}。请同步示意图`);
  assert.doesNotMatch(materialsSource, /struct JellyPaint\b/, 'JellyPaint 不应回到 jelly-materials.swift（纯逻辑放 jelly-paint.swift 才能被自测直接测数值）');
});

test('打开页面：按后台解析出的外观画示意图——变量、花纹、文字', async () => {
  const resolved = { color: 6, colors: [6, 0], look: 'duo', material: 'glass', size: 'medium', season: null };
  const { els } = load(view({ color: 6, look: 'duo' }, { resolved }));
  await tick();
  const preview = els['set-jellyPreview'];
  assert.equal(preview.hidden, false);
  assert.equal(preview.attrs['data-look'], 'duo');
  assert.equal(preview.vars['--jp-a'], TEST_HEX[6]); assert.equal(preview.vars['--jp-b'], TEST_HEX[0]);
  for (let i = 0; i < 5; i++) assert.equal(preview.vars[`--jp-t${i}`], TEST_HEX[0], `触手 ${i} 用第二色`);
  assert.equal(preview.vars['--jp-oral'], TEST_HEX[0]); assert.equal(preview.vars['--jp-outline'], TEST_HEX[6]);
  assert.match(els['set-jellyPreviewText'].textContent, /双色/);
  assert.match(els['set-jellyPreviewText'].textContent, /钟罩紫/); assert.match(els['set-jellyPreviewText'].textContent, /触须红/);
  assert.equal(preview.attrs['aria-label'], `${els['set-jellyPreviewLabel'].textContent}：${els['set-jellyPreviewText'].textContent}`);
  assert.equal(els['set-jellyPreviewLabel'].textContent, '当前形象');
});

test('示意图文字：渐变写“下缘 → 顶部”，七彩写三种颜色，纯色只写一个；括号里的“默认”不进文字', async () => {
  const cases = [
    [{ colors: [2, 4], look: 'blend' }, /渐变（下缘黄 → 顶部薄荷）/],
    [{ colors: [5, 7, 1], look: 'rainbow' }, /七彩（冰蓝、洋红、橙，横向铺开）/],
    [{ colors: [5], look: 'solid' }, /^纯色（冰蓝）$/],
  ];
  for (const [resolved, pattern] of cases) {
    const { els } = load(view({}, { resolved: { color: resolved.colors[0], material: 'glass', size: 'medium', season: null, ...resolved } }));
    await tick();
    assert.match(els['set-jellyPreviewText'].textContent, pattern);
    assert.doesNotMatch(els['set-jellyPreviewText'].textContent, /默认/);
  }
});

test('每天换一只：标题改为“今天这只”，示意图显示当天解析出的外观（不是已存的颜色）', async () => {
  const resolved = { color: 3, colors: [3, 1], look: 'duo', material: 'glass', size: 'medium', season: null };
  const { els } = load(view({ color: 5, look: 'solid', daily: true }, { resolved }));
  await tick();
  assert.equal(els['set-jellyPreviewLabel'].textContent, '今天这只');
  assert.equal(els['set-jellyPreview'].vars['--jp-a'], TEST_HEX[3], '示意图用 resolved（当天的），不是 settings.color');
  assert.match(els['set-jellyPreviewText'].textContent, /双色/);
});

test('点色板、改花纹、随机之后示意图随之更新', async () => {
  let current = view({ color: 5 }, { resolved: { color: 5, colors: [5], look: 'solid' } });
  const { els, swatches } = load(message => {
    if (message.action === 'jelly_appearance_set') {
      const settings = { ...current.settings, ...message.settings };
      current = view(settings, { resolved: { color: settings.color, colors: settings.look === 'duo' ? [settings.color, (settings.color + 2) % 8] : [settings.color], look: settings.look } });
    }
    if (message.action === 'jelly_appearance_reroll') current = view({ color: 7, look: 'rainbow' }, { resolved: { color: 7, colors: [7, 1, 3], look: 'rainbow' } });
    return current;
  });
  await tick();
  swatches[0].listeners.click(); await tick();
  assert.equal(els['set-jellyPreview'].vars['--jp-a'], TEST_HEX[0]);
  els['set-jellyLook'].listeners.change({ target: { value: 'duo' } }); await tick();
  assert.equal(els['set-jellyPreview'].attrs['data-look'], 'duo');
  assert.equal(els['set-jellyPreview'].vars['--jp-b'], TEST_HEX[2]);
  els['set-jellyReroll'].listeners.click(); await tick();
  assert.equal(els['set-jellyPreview'].attrs['data-look'], 'rainbow');
  assert.equal(els['set-jellyPreview'].vars['--jp-c'], TEST_HEX[3]);
});

test('后台没有给出可用的 resolved：隐藏示意图并清空文字，不报错、不影响其余控件', async () => {
  const { els, swatches } = load(view({ color: 2 }));      // view() 默认 resolved: {}
  await tick();
  assert.equal(els['set-jellyPreview'].hidden, true);
  assert.equal(els['set-jellyPreviewText'].textContent, '');
  assert.equal(swatches[2].attrs['aria-checked'], 'true');
  assert.match(els['set-jellyAppearanceStatus'].textContent, /已应用/);
});

test('旧页面结构（没有示意图元素）：脚本照常工作，不抛错', async () => {
  const { els, swatches } = load(view({ color: 2 }, { resolved: { color: 2, colors: [2], look: 'solid' } }), { dom: { noPreview: true } });
  await tick();
  assert.equal(swatches[2].attrs['aria-checked'], 'true');
  assert.match(els['set-jellyAppearanceStatus'].textContent, /已应用/);
});

// ---------- 2026-10-17 第一轮变异检查后补充：交互状态、容错、启动分支、取色细节 ----------

const RESOLVED_DUO = { color: 2, colors: [2, 4], look: 'duo', material: 'glass', size: 'medium', season: null };
const fakeTimerSet = () => {
  const list = [], cleared = [];
  return { list, cleared, setTimeout: (fn, ms) => { const handle = { fn, ms }; list.push(handle); return handle; }, clearTimeout: handle => { cleared.push(handle); } };
};

test('请求进行中：所有控件禁用并显示进度，完成后恢复（防连点与重复提交）', async () => {
  const { els, swatches, pending } = load(null, { hold: true });
  await tick();
  pending[0].answer(view({}));                                  // 先完成打开页面时的读取
  await tick();
  swatches[1].listeners.click(); await tick();
  assert.equal(pending.length, 2);
  assert.equal(els['set-jellyAppearanceStatus'].textContent, '正在保存…');
  assert.ok(swatches.every(s => s.disabled === true), '色块在途时禁用');
  for (const id of ['set-jellyLook', 'set-jellyDaily', 'set-jellyReroll']) assert.equal(els[id].disabled, true, `${id} 在途时禁用`);
  pending[1].answer(view({ color: 1 })); await tick();
  assert.ok(swatches.every(s => s.disabled === false));
  for (const id of ['set-jellyLook', 'set-jellyDaily', 'set-jellyReroll']) assert.equal(els[id].disabled, false, `${id} 完成后恢复`);
  // 随机的提示不同；“每天换”开着时只锁颜色与花纹，开关与随机仍可用
  els['set-jellyReroll'].listeners.click(); await tick();
  assert.equal(els['set-jellyAppearanceStatus'].textContent, '正在换一只…');
  pending[2].answer(view({ daily: true })); await tick();
  assert.ok(swatches.every(s => s.disabled === true) && els['set-jellyLook'].disabled === true, '每天换开着：颜色与花纹锁住');
  assert.equal(els['set-jellyDaily'].disabled, false); assert.equal(els['set-jellyReroll'].disabled, false);
  assert.equal(els['set-jellyDaily'].checked, true);
});

test('读取超时：默认等 8 秒，到点明确提示“后台没有响应”', async () => {
  const fake = fakeTimerSet();
  const { els } = load(null, { hold: true, timers: fake });
  await tick();
  assert.equal(fake.list.length, 1); assert.equal(fake.list[0].ms, 8000, '默认等待 8 秒');
  fake.list[0].fn(); await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /无法读取形象设置：后台没有响应/);
});

test('收到回复就清掉对应的超时定时器（否则 8 秒后会对已完成的请求再报一次超时）', async () => {
  const fake = fakeTimerSet();
  const { pending } = load(null, { hold: true, timers: fake });
  await tick();
  assert.equal(fake.cleared.length, 0);
  pending[0].answer(view({})); await tick();
  assert.deepEqual(fake.cleared, [fake.list[0]]);
});

test('保存超时：提示“后台没有响应”并说明重试，控件恢复可用', async () => {
  const fake = fakeTimerSet();
  const { els, swatches, pending } = load(null, { hold: true, timers: fake });
  await tick();
  pending[0].answer(view({})); await tick();
  swatches[3].listeners.click(); await tick();
  assert.equal(fake.list.length, 2); assert.equal(fake.list[1].ms, 8000);
  fake.list[1].fn(); await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /保存失败：后台没有响应。再改一次即可重试。/);
  assert.ok(swatches.every(s => s.disabled === false), '超时后控件恢复');
});

test('chrome.runtime.lastError（扩展刚重载、后台不可达）：显示具体原因，不当作成功', async () => {
  const { els, swatches } = load(view({ color: 2 }), { lastError: { message: 'Extension context invalidated.' } });
  await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /无法读取形象设置：Extension context invalidated\./);
  assert.ok(swatches.every(s => s.attrs['aria-checked'] === undefined), '没有成功就不改选中态');
});

test('页面缺少个别控件（旧结构或被改动）：其余部分照常更新，点击也不抛错，控件不会卡在禁用', async () => {
  const sets = [['set-jellyLook'], ['set-jellyDaily'], ['set-jellyReroll'], ['set-jellyAppearanceStatus'], ['set-jellyPreviewLabel'], ['set-jellyPreviewText'], ['set-jellyPreviewLabel', 'set-jellyPreviewText'], ['set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus']];
  for (const missing of sets) {
    const { els, swatches } = load(view({ color: 2, look: 'duo' }, { resolved: RESOLVED_DUO }), { dom: { missing } });
    await tick();
    swatches[3].listeners.click(); await tick();
    const label = `缺 ${missing.join('、')}`;
    assert.equal(swatches[2].attrs['aria-checked'], 'true', `${label}：选中态仍应更新`);
    assert.equal(els['set-jellyPreview'].vars['--jp-a'], TEST_HEX[2], `${label}：示意图仍应更新`);
    assert.equal(els['set-jellyPreview'].hidden, false, label);
    assert.ok(swatches.every(s => s.disabled === false), `${label}：控件不该卡在禁用`);
  }
});

test('示意图的可选元素（标题、文字）缺失：有数据与没数据两条路径都不抛错、不被当成失败，示意图本身仍照常显示或隐藏', async () => {
  for (const missing of [['set-jellyPreviewLabel'], ['set-jellyPreviewText'], ['set-jellyPreviewLabel', 'set-jellyPreviewText']]) {
    const label = `缺 ${missing.join('、')}`;
    const withData = load(view({ color: 2, look: 'duo' }, { resolved: RESOLVED_DUO }), { dom: { missing } });
    withData.els['set-jellyPreview'].hidden = true;       // 先藏起来：必须由渲染把它翻成显示，否则“根本没渲染”也能通过
    await tick();
    assert.equal(withData.els['set-jellyPreview'].hidden, false, `${label}（有数据）：示意图应显示`);
    assert.match(withData.els['set-jellyPreview'].attrs['aria-label'], /^当前形象：双色/, `${label}（有数据）：读屏文字仍应写入`);
    assert.match(withData.els['set-jellyAppearanceStatus'].textContent, /已应用/, `${label}（有数据）：不能被当成失败`);
    const noData = load(view({ color: 2 }), { dom: { missing } });
    await tick();
    assert.equal(noData.els['set-jellyPreview'].hidden, true, `${label}（没数据）：示意图应隐藏`);
    assert.match(noData.els['set-jellyAppearanceStatus'].textContent, /已应用/, `${label}（没数据）：不能被当成失败`);
  }
});

test('示意图：没有可用数据时隐藏并清空文字，之后有数据再显示出来（不会一直藏着、也不留旧文字）', async () => {
  let call = 0;
  const { els, swatches } = load(() => (++call === 2 ? view({ color: 2 }) : view({ color: 2, look: 'duo' }, { resolved: RESOLVED_DUO })));
  await tick();
  assert.equal(els['set-jellyPreview'].hidden, false);
  assert.match(els['set-jellyPreviewText'].textContent, /双色/);
  swatches[0].listeners.click(); await tick();                    // 第 2 次回复没有可用的 resolved
  assert.equal(els['set-jellyPreview'].hidden, true);
  assert.equal(els['set-jellyPreviewText'].textContent, '', '旧文字要清掉');
  swatches[0].listeners.click(); await tick();                    // 第 3 次又有数据
  assert.equal(els['set-jellyPreview'].hidden, false);
  assert.match(els['set-jellyPreviewText'].textContent, /双色/);
});

test('别处改了设置（storage.onChanged）：只对本地存储里的两个键刷新一次，且刷新时不清掉当前状态文字', async () => {
  const { els, sent, listeners, pending } = load(null, { hold: true });
  await tick();
  pending[0].answer(view({})); await tick();
  const before = els['set-jellyAppearanceStatus'].textContent;
  assert.match(before, /已应用/);
  for (const [changes, area] of [[{ other: {} }, 'local'], [{ desktopJellyV1: {} }, 'sync'], [{ desktopJellyAppearanceV1: {} }, 'managed'], [{}, 'local']]) {
    listeners.storage(changes, area); await tick();
    assert.equal(sent.length, 1, `${JSON.stringify(changes)} @ ${area} 不该触发刷新`);
  }
  listeners.storage({ desktopJellyV1: {} }, 'local'); await tick();
  assert.equal(sent.length, 2); assert.deepEqual(sent[1], { action: 'jelly_appearance_get' });
  assert.equal(els['set-jellyAppearanceStatus'].textContent, before, '刷新在途时保持原来的状态文字，不闪成空白');
  pending[1].answer(view({})); await tick();
  listeners.storage({ desktopJellyAppearanceV1: {} }, 'local'); await tick();
  assert.equal(sent.length, 3, '外观键变化也刷新');
});

test('启动：页面还在加载就等 DOMContentLoaded，加载完了立即启动；没有卡片或没有 document 时什么都不做', async () => {
  const early = load(view({}), { readyState: 'loading' });
  await tick();
  assert.equal(early.sent.length, 0, '加载中不该先发消息');
  assert.equal(typeof early.domListeners.DOMContentLoaded, 'function');
  early.domListeners.DOMContentLoaded(); await tick();
  assert.equal(early.sent.length, 1);
  const ready = load(view({}));
  await tick();
  assert.equal(ready.sent.length, 1); assert.equal(ready.domListeners.DOMContentLoaded, undefined, '已加载完就不再等事件');
  const noCard = load(view({}), { dom: { noCard: true } });
  await tick();
  assert.equal(noCard.sent.length, 0, '没有形象卡片的页面不发消息');
  assert.equal(noCard.swatches[0].listeners.click, undefined, '也不绑定点击');
  assert.equal(noCard.listeners.storage, undefined, '也不监听存储变化');
  const bare = load(view({}), { noDocument: true });
  assert.equal(typeof bare.window.JellyAppearanceSettings.paintOf, 'function');
  assert.equal(bare.sent.length, 0);
});

test('示意图取色：色块位置不影响取色（按 data-color 对应，不按 DOM 顺序）；色块缺少 title 时用“色位 N”', async () => {
  const reversed = load(view({ color: 6 }, { resolved: { color: 6, colors: [6], look: 'solid' } }), { dom: { reverseSwatches: true } });
  await tick();
  assert.equal(reversed.els['set-jellyPreview'].vars['--jp-a'], TEST_HEX[6], 'DOM 顺序反过来也要取到 data-color=6 的颜色');
  const unnamed = load(view({ color: 6 }, { resolved: { color: 6, colors: [6], look: 'solid' } }), { dom: { noTitles: true } });
  await tick();
  assert.equal(unnamed.els['set-jellyPreviewText'].textContent, '纯色（色位 7）', '兜底名从 1 数，与界面里“第几个色块”一致');
});

test('paintOf 细节：多余的颜色位被截断（solid 只留 1 个、duo/blend 2 个、rainbow 3 个）；b、c 的取法与原生一致；触手数等于示意图的触手数', () => {
  const { window } = load(view({}));
  const paintOf = window.JellyAppearanceSettings.paintOf;
  const solid = paintOf({ colors: [3, 4, 5], look: 'solid' }, fakePalette);
  assert.deepEqual(solid.slots, [3]); near(solid.b, fakePalette[3], 'solid.b'); near(solid.c, fakePalette[3], 'solid.c');
  solid.tentacles.forEach((tentacle, i) => near(tentacle, fakePalette[3], `solid 触手 ${i}`));
  near(solid.mid, fakePalette[3], 'solid.mid');
  const duo = paintOf({ colors: [1, 6, 2], look: 'duo' }, fakePalette);
  assert.deepEqual(duo.slots, [1, 6]); near(duo.c, fakePalette[6], 'duo.c 与 b 同色（原生 c: tints[1]）'); near(duo.mid, mix(fakePalette[1], fakePalette[6], 0.5), 'duo.mid');
  const blend = paintOf({ colors: [1, 6, 2], look: 'blend' }, fakePalette);
  assert.deepEqual(blend.slots, [1, 6]); near(blend.c, fakePalette[6], 'blend.c');
  const rainbow = paintOf({ colors: [1, 6, 2, 3], look: 'rainbow' }, fakePalette);
  assert.deepEqual(rainbow.slots, [1, 6, 2]); near(rainbow.c, fakePalette[2], 'rainbow.c');
  const svg = cardOf().match(/<svg[\s\S]*?<\/svg>/)?.[0] || '';
  const hooks = (svg.match(/data-tentacle="\d"/g) || []).length;
  for (const paint of [solid, duo, blend, rainbow]) assert.equal(paint.tentacles.length, hooks, '触手数要等于示意图里的 data-tentacle 个数（也是原生画的根数）');
});
