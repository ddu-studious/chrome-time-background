// 设置页“桌面水母形象”卡片合同：元素、无内联处理器、只经扩展消息读写、状态文字说明预览条件。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('settings.html');
const Shapes = require('../js/jelly-species-shapes.js');
const MarineRig = require('../js/marine-rig.js');
const MarineRigData = require('../js/marine-rig-data.js');
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
  for (const id of ['set-jellyColorSwatches', 'set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus', 'set-jellyStyle']) assert.ok(card.includes(`id="${id}"`), id);
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
  assert.ok(html.indexOf('js/settings-page.js?v=16') < html.indexOf('js/settings-jelly-appearance.js?v=5'));
  assert.match(html, /<script src="js\/settings-jelly-appearance\.js\?v=5"><\/script>/);
  // 动物示意图用同一份形状数据：形状脚本必须先于外观脚本加载，且带版本号
  assert.match(html, /<script src="js\/jelly-species-shapes\.js\?v=4"><\/script>/);
  assert.ok(html.indexOf('js/jelly-species-shapes.js?v=4') < html.indexOf('js/settings-jelly-appearance.js?v=5'));
  // 写实示意图用与桌面、水族馆同一份骨架数据与求值器：骨架求值器先于数据（数据依赖它），二者都先于外观脚本，且与首页引用同一个带版本号的地址（共用浏览器缓存）
  assert.match(html, /<script src="js\/marine-rig\.js\?v=1"><\/script>/);
  assert.match(html, /<script src="js\/marine-rig-data\.js\?v=1"><\/script>/);
  assert.ok(html.indexOf('js/marine-rig.js?v=1') < html.indexOf('js/marine-rig-data.js?v=1'));
  assert.ok(html.indexOf('js/marine-rig-data.js?v=1') < html.indexOf('js/settings-jelly-appearance.js?v=5'));
  const index = read('index.html');
  assert.match(index, /js\/marine-rig\.js\?v=1/); assert.match(index, /js\/marine-rig-data\.js\?v=1/);
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
//   noShapes：页面里没有形状脚本；shapes：换成这份形状模块（合成的替身，测形状数据异常与真实动物覆盖不到的几何）
function load(reply, { dom = {}, hold = false, lastError = null, timers = null, readyState = 'complete', noDocument = false, noShapes = false, shapes = null, noMarine = false, marine = null } = {}) {
  const els = {}, listeners = {}, domListeners = {}, pending = [];
  const missing = new Set(dom.missing || []);
  const make = id => (els[id] = { id, dataset: {}, disabled: false, hidden: false, value: '', checked: false, textContent: '', attrs: {}, listeners: {}, vars: {},
    style: { setProperty(k, v) { this.owner.vars[k] = v; }, getPropertyValue(k) { return this.owner.vars[k] || ''; } },
    addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; }, removeAttribute(k) { delete this.attrs[k]; } });
  const ids = ['sp-jelly-appearance-card', 'set-jellyLook', 'set-jellyDaily', 'set-jellyReroll', 'set-jellyAppearanceStatus', 'set-jellyColorSwatches', ...(dom.noPreview ? [] : ['set-jellyPreview', 'set-jellyPreviewLabel', 'set-jellyPreviewText']),
    ...(dom.noSpecies ? [] : ['set-jellySpecies']), ...(dom.noStyle ? [] : ['set-jellyStyle']), ...(dom.noAnimalImg || dom.noPreview ? [] : ['set-jellyAnimalPreview'])];
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
  // 页面里由 js/jelly-species-shapes.js 提供形状数据、js/marine-rig*.js 提供写实骨架（settings.html 先于本脚本加载）；noMarine：没有写实脚本，marine：换成这份骨架模块（替身）
  const window = { ...(noShapes ? {} : { JellySpeciesShapes: shapes || Shapes }), ...(noMarine ? {} : { MarineRig: marine?.Rig || MarineRig, MarineRigData: marine?.Data || MarineRigData }) };
  new Function('window', 'document', 'chrome', 'setTimeout', 'clearTimeout', `${source}`)(window, noDocument ? undefined : document, chrome, timers?.setTimeout || setTimeout, timers?.clearTimeout || clearTimeout);
  return { els, swatches, sent, window, listeners, domListeners, pending };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const view = (settings, extra = {}) => ({ ok: true, settings: { color: 5, look: 'solid', material: 'glass', size: 'medium', seasonal: false, daily: false, species: 'jelly', realistic: false, ...settings }, resolved: {}, component: 'ok', connected: true, ...extra });

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
    [/case\s+\.rainbow:\s*return t < 0\.5 \? a\.mixed\(toward:\s*b,\s*t \* 2\) : b\.mixed\(toward:\s*c,\s*\(t - 0\.5\) \* 2\)/, '七彩肢体（触手、鳍）沿长轴三色取色（limbTone）'],
    [/let t = u\.isFinite \? max\(0,\s*min\(1,\s*u\)\) : 0\.5/, 'limbTone 的 u 夹到 0…1、非有限数取正中'],
    [/func tentacleTone\(index: Int,\s*count: Int\) -> JellyTint \{\s*limbTone\(u:\s*count > 1 \? CGFloat\(index\) \/ CGFloat\(count - 1\) : 0\.5\)/, '触手是 limbTone 在等距 u 上的特例'],
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

// ---------- 2026-10-17 动物（物种）：下拉、示意图、文案 ----------
// 设计见 docs/superpowers/specs/2026-10-17-jelly-species-design.md；示意图用 js/jelly-species-shapes.js 的同一份形状数据，颜色规则与原生 SpeciesPainter 一致。

const JellyAppearance = require('../js/jelly-appearance.js');
const painterSource = read('desktop-reminder/jelly-species-painter.swift');
const HAMMER_RESOLVED = { color: 5, colors: [5], look: 'solid', species: 'hammer' };
const speciesView = (species, resolved = {}, extra = {}) => view({ species }, { resolved: { color: 5, colors: [5], look: 'solid', species, ...resolved }, ...extra });

test('动物下拉：选项恰好是“已经画得出来”的物种（水母在前），值都合法，名称与脚本里的名称表一致，默认水母', () => {
  const card = cardOf();
  const select = card.match(/<select[^>]*id="set-jellySpecies"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const options = [...select.matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].map(m => ({ value: m[1], attrs: m[2], label: m[3] }));
  assert.deepEqual(options.map(o => o.value), [...Shapes.AVAILABLE], '下拉里只列形状数据已有的物种：加一种动物要同时加形状数据、下拉选项和示意图，缺一不可');
  for (const option of options) assert.ok(JellyAppearance.SPECIES.includes(option.value), `${option.value} 应是后台认的物种`);
  const names = load(view({})).window.JellyAppearanceSettings.SPECIES_NAMES;
  for (const option of options) assert.equal(option.label, names[option.value], `${option.value} 的下拉文字应与名称表一致`);
  assert.deepEqual(options.filter(o => /\bselected\b/.test(o.attrs)).map(o => o.value), ['jelly'], '默认选中水母');
  assert.deepEqual(Object.keys(names), [...JellyAppearance.SPECIES], '名称表覆盖全部物种（含还没画出来的），顺序与后台一致');
  assert.equal(Object.isFrozen(names), true);
  // 后台还有一份（提醒气泡的称呼用它）：与设置页这一份逐项相同，Swift 那一份由 test/desktop-companion-logic.test.mjs 与设置页对照
  assert.deepEqual({ ...JellyAppearance.SPECIES_NAMES }, { ...names }, '后台的名称表与设置页的一致');
  assert.deepEqual(Object.keys(JellyAppearance.SPECIES_NAMES), [...JellyAppearance.SPECIES]);
  assert.equal(Object.isFrozen(JellyAppearance.SPECIES_NAMES), true);
  assert.ok(card.indexOf('id="set-jellyPreview"') < card.indexOf('id="set-jellySpecies"') && card.indexOf('id="set-jellySpecies"') < card.indexOf('id="set-jellyColorSwatches"'), '动物在示意图之后、颜色之前');
});

test('动物下拉的说明：每天换/随机只换颜色与花纹不换动物；需要已更新的组件，否则仍是水母', () => {
  const card = cardOf();
  const field = card.slice(card.indexOf('<span class="sp-field-label">动物</span>'), card.indexOf('id="set-jellySpecies"'));
  assert.match(field, /每天换一只/); assert.match(field, /随机一只/);
  assert.match(field, /只换颜色与花纹，不会换动物/);
  assert.match(field, /已更新的桌面组件/); assert.match(field, /仍是水母/);
  assert.match(card, /给桌面水母换动物、颜色和花纹/);
  // 每种已经画得出来的动物都要在说明里点名；不留“以后会加”的预告（海龟加入之前写过一句“海龟会陆续加入”，加入后必须删掉）。
  // 视角（俯视/侧视）不再写在这里：写实与卡通的视角不同（例如小锤头鲨卡通俯视、写实侧视），说明放在“动物样式”一项里，免得与实际画法不符
  const names = load(view({})).window.JellyAppearanceSettings.SPECIES_NAMES;
  assert.ok(field.includes(names.jelly), '说明里要点名水母');
  for (const id of Shapes.AVAILABLE.filter(name => name !== 'jelly')) assert.ok(field.includes(names[id]), `说明里要点名“${names[id]}”`);
  assert.doesNotMatch(field, /俯视|侧视/, '视角随样式而不同，不在动物一项里写死');
  assert.doesNotMatch(field, /陆续|即将|敬请期待|还没有|尚未/, '说明里不留“以后会加”的预告');
});

test('动物样式下拉：写实（默认选中）/卡通；在动物之后、颜色之前；说明写实用自然体色、与水族馆同一份数据、旧组件仍是卡通、水母不受影响', () => {
  const card = cardOf();
  const select = card.match(/<select[^>]*id="set-jellyStyle"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
  const options = [...select.matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].map(m => ({ value: m[1], attrs: m[2], label: m[3] }));
  assert.deepEqual(options.map(o => [o.value, o.label]), [['realistic', '写实'], ['cartoon', '卡通']]);
  assert.deepEqual(options.filter(o => /\bselected\b/.test(o.attrs)).map(o => o.value), ['realistic'], '默认写实（与后台默认一致）');
  assert.ok(card.indexOf('id="set-jellySpecies"') < card.indexOf('id="set-jellyStyle"') && card.indexOf('id="set-jellyStyle"') < card.indexOf('id="set-jellyColorSwatches"'), '动物样式在动物之后、颜色之前');
  const field = card.slice(card.indexOf('<span class="sp-field-label">动物样式</span>'), card.indexOf('id="set-jellyStyle"'));
  assert.ok(field.length > 100, '应有动物样式的说明');
  assert.match(field, /写实/); assert.match(field, /卡通/);
  assert.match(field, /自然体色/); assert.match(field, /颜色与花纹只影响水母和卡通动物/);
  assert.match(field, /水族馆/); assert.match(field, /同一份数据/);
  assert.match(field, /选水母时这一项不起作用/);
  assert.match(field, /已更新的桌面组件/); assert.match(field, /旧组件仍画卡通版/);
});

test('动物示意图元素：在预览容器里、紧跟水母 svg，对读屏隐藏（说明文字在容器的 aria-label），没有预置地址', () => {
  const card = cardOf();
  const box = card.match(/<div class="sp-jelly-preview"[^>]*id="set-jellyPreview"[\s\S]*?<\/svg>(<img[^>]*>)<\/div>/);
  assert.ok(box, '预览容器里应在 svg 之后有一个 img');
  const img = box[1];
  assert.match(img, /id="set-jellyAnimalPreview"/); assert.match(img, /\balt=""/); assert.match(img, /aria-hidden="true"/);
  assert.doesNotMatch(img, /\ssrc=/, '地址由脚本写入，页面里没有预置（水母状态下不应加载任何图片）');
});

test('动物示意图样式：选了动物显示 img、隐藏水母 svg，其余相反；只靠 data-art，不依赖 hidden', () => {
  assert.match(css, /\.sp-jelly-preview\[data-art="animal"\] svg\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(css, /\.sp-jelly-preview:not\(\[data-art="animal"\]\) img\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(css, /\.sp-jelly-preview svg,\s*\.sp-jelly-preview img\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%/);
});

// ---- 示意图 SVG：结构、取色、位置 ----

// 极简严格 XML 解析（只为核对结构）：标签与双引号属性；示意图里没有文本节点，标签之间不允许有任何别的字符
function parseXml(text) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z][A-Za-z0-9:-]*="[^"<>&]*")*)\s*(\/?)>/y;
  let index = 0;
  while (index < text.length) {
    tag.lastIndex = index;
    const m = tag.exec(text);
    assert.ok(m, `位置 ${index} 附近不是合法标签：${text.slice(index, index + 60)}`);
    index = tag.lastIndex;
    const [, closing, name, attrText, selfClose] = m;
    if (closing) {
      assert.ok(!selfClose && !attrText.trim(), `闭合标签 ${name} 不应带属性`);
      const top = stack.pop();
      assert.equal(top.name, name, `标签没有正确嵌套：期望闭合 ${top.name}，遇到 ${name}`);
      continue;
    }
    const attrs = {};
    for (const a of attrText.matchAll(/([A-Za-z][A-Za-z0-9:-]*)="([^"]*)"/g)) { assert.ok(!(a[1] in attrs), `${name} 的属性 ${a[1]} 重复`); attrs[a[1]] = a[2]; }
    const node = { name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  assert.equal(stack.length, 1, '有标签没有闭合');
  assert.equal(root.children.length, 1, '只应有一个根元素');
  return root.children[0];
}
const walk = (node, visit) => { visit(node); node.children.forEach(child => walk(child, visit)); };
const ALLOWED_ELEMENTS = new Set(['svg', 'defs', 'linearGradient', 'stop', 'rect', 'g', 'path', 'circle', 'ellipse']);
const ALLOWED_ATTRIBUTES = new Set(['xmlns', 'viewBox', 'width', 'height', 'id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits', 'offset', 'stop-color', 'stop-opacity', 'rx', 'ry', 'cx', 'cy', 'r',
  'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'transform', 'd']);
const toHexTest = rgb => `#${rgb.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
const lighter = (rgb, amount = 0, dark = 0) => rgb.map(c => Math.min(1, c + (1 - c) * amount) * (1 - dark));
const swatchRgb = TEST_HEX.map(hex => [0, 2, 4].map(i => parseInt(hex.slice(1 + i, 3 + i), 16) / 255));
const LOOKS_UNDER_TEST = [
  ['solid', { colors: [5], look: 'solid' }],
  ['duo', { colors: [6, 0], look: 'duo' }],
  ['blend', { colors: [2, 4], look: 'blend' }],
  ['rainbow', { colors: [5, 7, 1], look: 'rainbow' }],
];
const previewPaint = (window, resolved) => window.JellyAppearanceSettings.paintOf(resolved, swatchRgb);
const gradientOf = (root, id) => { let found = null; walk(root, node => { if (node.name === 'linearGradient' && node.attrs.id === id) found = node; }); return found; };
const stopsOf = gradient => gradient.children.map(stop => ({ color: stop.attrs['stop-color'], offset: Number(stop.attrs.offset), opacity: Number(stop.attrs['stop-opacity']) }));

test('animalPreviewSvg：水母、未知物种、没有颜料、形状脚本缺失都返回 null（调用方回到水母示意图），不抛错', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  const paint = previewPaint(window, { colors: [5], look: 'solid' });
  assert.equal(api.animalPreviewSvg('jelly', paint), null, '水母不是数据驱动的，示意图用页面里的内联 svg');
  assert.equal(api.animalPreviewSvg('dragon', paint), null);
  assert.equal(typeof api.animalPreviewSvg('turtle', paint), 'string', '海龟已有形状数据：画得出来');
  for (const bad of [undefined, null, 5, {}, [], '', '__proto__', 'constructor', 'toString']) assert.equal(api.animalPreviewSvg(bad, paint), null, `物种 ${String(bad)}`);
  assert.equal(api.animalPreviewSvg('hammer', null), null);
  assert.equal(api.animalPreviewSvg('hammer', undefined), null);
  assert.equal(api.animalPreviewUri('hammer', null), null);
  const bare = load(view({}), { noShapes: true }).window.JellyAppearanceSettings;
  assert.equal(bare.animalPreviewSvg('hammer', paint), null, '形状脚本没加载：画不出来，不抛错');
  assert.equal(bare.animalPreviewUri('hammer', paint), null);
});

test('animalPreviewSvg：每种可用动物 × 四种花纹都得到结构合法的 SVG（元素与属性白名单、颜色格式、引用与 id、路径来自形状数据）', () => {
  const { window } = load(view({}));
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  assert.ok(animals.length >= 1);
  for (const id of animals) for (const [name, resolved] of LOOKS_UNDER_TEST) {
    const label = `${id}/${name}`;
    const svg = window.JellyAppearanceSettings.animalPreviewSvg(id, previewPaint(window, resolved));
    assert.equal(typeof svg, 'string', label);
    const root = parseXml(svg);
    assert.equal(root.name, 'svg'); assert.equal(root.attrs.xmlns, 'http://www.w3.org/2000/svg'); assert.equal(root.attrs.viewBox, '0 0 100 136');
    const ids = [];
    walk(root, node => {
      assert.ok(ALLOWED_ELEMENTS.has(node.name), `${label}：不允许的元素 ${node.name}`);
      for (const [key, value] of Object.entries(node.attrs)) {
        assert.ok(ALLOWED_ATTRIBUTES.has(key), `${label}：不允许的属性 ${key}`);
        if (['fill', 'stroke', 'stop-color'].includes(key)) assert.match(value, /^(#[0-9a-f]{6}|#fff|none|url\(#[A-Za-z0-9]+\))$/, `${label}：${key}=${value}`);
        if (['fill-opacity', 'stroke-opacity', 'stop-opacity'].includes(key)) assert.ok(Number(value) >= 0 && Number(value) <= 1, `${label}：${key}=${value} 应在 0…1`);
        if (['stroke-width', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'offset'].includes(key)) assert.ok(/^-?\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)), `${label}：${key}=${value} 应是有限的普通小数`);
        if (key === 'id') ids.push(value);
      }
    });
    assert.equal(new Set(ids).size, ids.length, `${label}：id 重复`);
    walk(root, node => { for (const value of Object.values(node.attrs)) for (const ref of value.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref[1]), `${label}：引用了没有定义的 ${ref[1]}`); });
    // 路径只来自形状数据：每条 d 都能被参考解析器接受
    walk(root, node => { if (node.attrs.d !== undefined) assert.ok(Shapes.parsePath(node.attrs.d), `${label}：d 不合规 ${node.attrs.d.slice(0, 40)}`); });
    assert.doesNotMatch(svg, /<script|\son[a-z]+=|href|xlink|<image|foreignObject|javascript:|style=|&|<!/i, label);
  }
});

test('animalPreviewSvg：路径与形状数据逐部件一致，躯干与肢体、腹部、斑点、高光各按角色上色（取色规则与原生一致）', () => {
  const { window } = load(view({}));
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  for (const id of animals) for (const [name, resolved] of LOOKS_UNDER_TEST) {
    const label = `${id}/${name}`;
    const paint = previewPaint(window, resolved);
    const root = parseXml(window.JellyAppearanceSettings.animalPreviewSvg(id, paint));
    const group = root.children.find(node => node.name === 'g');
    assert.ok(group, label);
    const layered = paint.kind === 'blend' || paint.kind === 'rainbow';
    const shape = Shapes.expand(id);
    const k = Number(group.attrs.transform.match(/scale\(([^)]+)\)/)[1]);
    let cursor = 0;
    shape.parts.forEach((part, index) => {
      const at = () => group.children[cursor++];
      const where = `${label} 部件 ${index}（${part.role}）`;
      if (part.role === 'limb') {
        const path = at();
        assert.equal(path.attrs.d, part.d, `${where}：路径`);
        const tone = window.JellyAppearanceSettings.limbTone(paint, part.u);
        const gradient = gradientOf(root, path.attrs.fill.match(/url\(#([^)]+)\)/)[1]);
        assert.ok(gradient, where);
        assert.deepEqual([gradient.attrs.x1, gradient.attrs.y1, gradient.attrs.x2, gradient.attrs.y2, gradient.attrs.gradientUnits], ['0', '1', '0', '0', undefined],
          `${where}：肢体渐变在自身包围盒里自下（y1=1）而上（y2=0），正竖直`);
        const [bottom, top] = stopsOf(gradient);
        assert.deepEqual([bottom.offset, top.offset], [0, 1], `${where}：两个色标分别在渐变的起点与终点`);
        assert.equal(bottom.color, toHexTest(lighter(tone, 0, 0.06)), `${where}：下端颜色`); assert.equal(bottom.opacity, 0.92);
        assert.equal(top.color, toHexTest(lighter(tone, 0.34)), `${where}：上端颜色`); assert.equal(top.opacity, 0.95);
        assert.equal(path.attrs.stroke, toHexTest(lighter(tone, 0, 0.3)), `${where}：描边`); assert.equal(Number(path.attrs['stroke-opacity']), 0.9);
        assert.ok(Math.abs(Number(path.attrs['stroke-width']) * k - 1.0) < 0.01, `${where}：描边宽度按底板像素是 1.0`);
      } else if (part.role === 'body') {
        const fill = at();
        assert.equal(fill.attrs.d, part.d, `${where}：路径`); assert.equal(fill.attrs.fill, 'url(#bodyFill)');
        if (layered) { const overlay = at(); assert.equal(overlay.attrs.d, part.d); assert.equal(overlay.attrs.fill, 'url(#bodyLight)'); }
        const outline = at();
        assert.equal(outline.attrs.d, part.d); assert.equal(outline.attrs.fill, 'none');
        assert.equal(outline.attrs.stroke, toHexTest(lighter(paint.outline, 0, 0.28)), `${where}：描边用 outlineTone`);
        assert.ok(Math.abs(Number(outline.attrs['stroke-width']) * k - 1.1) < 0.01, `${where}：描边宽度按底板像素是 1.1`);
      } else {
        const path = at();
        assert.equal(path.attrs.d, part.d, `${where}：路径`);
        if (part.role === 'belly') { assert.equal(path.attrs.fill, toHexTest(lighter(paint.a, 0.72))); assert.equal(Number(path.attrs['fill-opacity']), 0.92); }
        if (part.role === 'accent') { assert.equal(path.attrs.fill, '#fff'); assert.equal(Number(path.attrs['fill-opacity']), 0.72); }
        if (part.role === 'shine') { assert.equal(path.attrs.fill, '#fff'); assert.equal(Number(path.attrs['fill-opacity']), 0.4); }
      }
    });
    // 之后依次是每只眼睛两个圆（瞳孔、高光点），再是腮红
    for (const [x, y] of shape.eyes.at) {
      const pupil = group.children[cursor++], spark = group.children[cursor++];
      assert.equal(pupil.name, 'circle'); assert.equal(pupil.attrs.cx, Shapes.num(x)); assert.equal(pupil.attrs.cy, Shapes.num(y)); assert.equal(pupil.attrs.r, Shapes.num(shape.eyes.r));
      assert.equal(spark.attrs.cx, Shapes.num(x + 0.2 * shape.eyes.r)); assert.equal(spark.attrs.cy, Shapes.num(y - 0.4 * shape.eyes.r)); assert.equal(spark.attrs.r, Shapes.num(0.3 * shape.eyes.r));
    }
    for (const [x, y, rx, ry] of shape.blush) { const cheek = group.children[cursor++]; assert.equal(cheek.name, 'ellipse'); assert.equal(cheek.attrs.cx, Shapes.num(x)); assert.equal(cheek.attrs.cy, Shapes.num(y)); assert.equal(cheek.attrs.rx, Shapes.num(rx)); assert.equal(cheek.attrs.ry, Shapes.num(ry)); }
    // 最后是微笑（只有侧视动物有）：同一条三次贝塞尔，不填充，深色描边 1.2 pt、透明度 0.88，与原生 paintFace 一致
    if (shape.mouth) {
      const smile = group.children[cursor++];
      const [p0, p1, p2, p3] = shape.mouth.map(([x, y]) => `${Shapes.num(x)} ${Shapes.num(y)}`);
      assert.equal(smile.name, 'path', `${label}：微笑是一条路径`);
      assert.equal(smile.attrs.d, `M ${p0} C ${p1} ${p2} ${p3}`, `${label}：微笑的四个点与形状数据一致`);
      assert.equal(smile.attrs.fill, 'none'); assert.equal(smile.attrs.stroke, '#293a4d'); assert.equal(Number(smile.attrs['stroke-opacity']), 0.88);
      assert.ok(Math.abs(Number(smile.attrs['stroke-width']) * k - 1.2) < 0.01, `${label}：微笑线宽按底板像素是 1.2`);
    }
    assert.equal(cursor, group.children.length, `${label}：除上面列出的，没有多余的图形`);
  }
});

test('animalPreviewSvg：躯干渐变——纯色/双色自下而上由主色；渐变与七彩沿尾→头铺色并叠一层亮度；肢体颜色随花纹（双色用第二色，七彩沿位置取色）', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  const hammer = Shapes.expand('hammer');
  const bodyFillOf = (resolved) => { const paint = previewPaint(window, resolved); const root = parseXml(api.animalPreviewSvg('hammer', paint)); return { paint, root, fill: gradientOf(root, 'bodyFill'), light: gradientOf(root, 'bodyLight') }; };
  for (const resolved of [{ colors: [5], look: 'solid' }, { colors: [6, 0], look: 'duo' }]) {
    const { paint, fill, light } = bodyFillOf(resolved);
    assert.equal(light, null, '纯色/双色没有亮度层');
    assert.equal(fill.attrs.gradientUnits, 'userSpaceOnUse');
    assert.equal(fill.attrs.x1, fill.attrs.x2, '纯色/双色是纵向渐变'); assert.ok(Number(fill.attrs.y1) > Number(fill.attrs.y2), '自下（y 大）而上');
    assert.deepEqual(stopsOf(fill), [
      { color: toHexTest(lighter(paint.a, 0, 0.05)), offset: 0, opacity: 0.93 },
      { color: toHexTest(lighter(paint.a, 0.22)), offset: 0.55, opacity: 0.95 },
      { color: toHexTest(lighter(paint.a, 0.5)), offset: 1, opacity: 0.97 },
    ], `${resolved.look}：躯干只用主色`);
  }
  {
    const { paint, fill, light } = bodyFillOf({ colors: [2, 4], look: 'blend' });
    assert.equal(fill.attrs.y1, fill.attrs.y2, '渐变是横向（尾→头）'); assert.ok(Number(fill.attrs.x1) < Number(fill.attrs.x2));
    assert.deepEqual(stopsOf(fill), [{ color: toHexTest(lighter(paint.a, 0.22)), offset: 0, opacity: 0.95 }, { color: toHexTest(lighter(paint.b, 0.22)), offset: 1, opacity: 0.95 }]);
    assert.ok(light, '渐变有亮度层');
    assert.deepEqual(stopsOf(light), [{ color: '#ffffff', offset: 0, opacity: 0 }, { color: '#ffffff', offset: 1, opacity: 0.32 }]);
    assert.ok(Number(light.attrs.y1) > Number(light.attrs.y2), '亮度层自下而上变亮');
  }
  {
    const { paint, fill, light } = bodyFillOf({ colors: [5, 7, 1], look: 'rainbow' });
    assert.deepEqual(stopsOf(fill).map(s => s.color), [paint.a, paint.b, paint.c].map(rgb => toHexTest(lighter(rgb, 0.22))), '七彩三色沿尾→头');
    assert.deepEqual(stopsOf(fill).map(s => s.offset), [0, 0.5, 1]);
    assert.deepEqual(stopsOf(fill).map(s => s.opacity), [0.95, 0.95, 0.95], '七彩三段的透明度都是 0.95（与原生 gradient 的 0.95 一致）');
    assert.ok(light);
    assert.deepEqual(stopsOf(light), [{ color: '#ffffff', offset: 0, opacity: 0 }, { color: '#ffffff', offset: 1, opacity: 0.32 }], '七彩同样叠自下而上的亮度层');
    assert.ok(Number(light.attrs.y1) > Number(light.attrs.y2));
  }
  // 肢体颜色：双色用第二色；七彩沿 u 取色（与 limbTone 一致，这里用独立的写法再算一遍）
  const limbColors = resolved => {
    const paint = previewPaint(window, resolved), root = parseXml(api.animalPreviewSvg('hammer', paint));
    const group = root.children.find(node => node.name === 'g');
    return { paint, colors: group.children.filter(node => node.attrs.fill?.startsWith('url(#limb')).map(node => stopsOf(gradientOf(root, node.attrs.fill.match(/url\(#([^)]+)\)/)[1]))[0].color) };
  };
  const limbUs = hammer.parts.filter(part => part.role === 'limb').map(part => part.u);
  const mixRgb = (x, y, t) => x.map((v, i) => v + (y[i] - v) * t);
  const duo = limbColors({ colors: [6, 0], look: 'duo' });
  assert.deepEqual(duo.colors, limbUs.map(() => toHexTest(lighter(swatchRgb[0], 0, 0.06))), '双色：鳍与尾用第二色');
  const rainbow = limbColors({ colors: [5, 7, 1], look: 'rainbow' });
  const [a, b, c] = [swatchRgb[5], swatchRgb[7], swatchRgb[1]];
  assert.deepEqual(rainbow.colors, limbUs.map(u => toHexTest(lighter(u < 0.5 ? mixRgb(a, b, u * 2) : mixRgb(b, c, (u - 0.5) * 2), 0, 0.06))), '七彩：肢体沿身体长轴取色');
  const blend = limbColors({ colors: [2, 4], look: 'blend' });
  assert.deepEqual(blend.colors, limbUs.map(() => toHexTest(lighter(mixRgb(swatchRgb[2], swatchRgb[4], 0.7), 0, 0.06))), '渐变：肢体偏向第二色 0.7');
});

test('animalPreviewSvg：动物整体落在 100×136 的底板内（四周留白）并居中，描边与形状随缩放保持原有粗细', () => {
  const { window } = load(view({}));
  for (const id of Shapes.AVAILABLE.filter(name => name !== 'jelly')) {
    const root = parseXml(window.JellyAppearanceSettings.animalPreviewSvg(id, previewPaint(window, { colors: [5], look: 'solid' })));
    const group = root.children.find(node => node.name === 'g');
    const [, tx, ty] = group.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
    const k = Number(group.attrs.transform.match(/scale\(([^)]+)\)/)[1]);
    const shape = Shapes.expand(id);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const part of shape.parts) for (const [x, y] of Shapes.sample(Shapes.parsePath(part.d))) { minX = Math.min(minX, tx + k * x); maxX = Math.max(maxX, tx + k * x); minY = Math.min(minY, ty + k * y); maxY = Math.max(maxY, ty + k * y); }
    assert.ok(minX >= 6 && maxX <= 94, `${id}：横向 ${minX.toFixed(1)}…${maxX.toFixed(1)} 应留出 ≥6 的边`);
    assert.ok(minY >= 6 && maxY <= 130, `${id}：纵向 ${minY.toFixed(1)}…${maxY.toFixed(1)} 应留出 ≥6 的边`);
    // 底板居中的是“并集包围盒”（含各划水相位）：静止形状的每个取样点都必须落在以 (50, 68) 为中心、按同一缩放得到的并集盒内，
    // 且并集盒本身没有被挤出底板——这样 translate/scale 与 union 的换算（原生坐标 y 向上）才是自洽的，不只是公式重写了一遍
    const union = Shapes.union(id), fit = k / shape.scale;
    assert.ok(fit > 0 && fit <= 1 + 1e-9, `${id}：缩放只缩小不放大`);
    const halfW = fit * (union.maxX - union.minX) / 2, halfH = fit * (union.maxY - union.minY) / 2;
    assert.ok(50 - halfW >= 6 && 50 + halfW <= 94 && 68 - halfH >= 6 && 68 + halfH <= 130, `${id}：并集盒在底板内留白`);
    const eps = 0.011;
    assert.ok(minX >= 50 - halfW - eps && maxX <= 50 + halfW + eps, `${id}：静止形状横向在居中的并集盒内`);
    assert.ok(minY >= 68 - halfH - eps && maxY <= 68 + halfH + eps, `${id}：静止形状纵向在居中的并集盒内`);
    // 并集盒由静止形状与转动部件的各相位撑开：至少有一条边贴着静止形状（否则并集盒不是紧的，居中就没有意义）
    const touches = [minX - (50 - halfW), (50 + halfW) - maxX, minY - (68 - halfH), (68 + halfH) - maxY].some(gap => Math.abs(gap) < 0.05);
    assert.ok(touches, `${id}：并集盒与静止形状至少有一条边重合`);
  }
});

test('animalPreviewSvg：确定性——相同输入逐字相同，颜色或花纹不同则结果不同；data: 地址可还原且不含需要转义的裸字符', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  const a = api.animalPreviewSvg('hammer', previewPaint(window, { colors: [5], look: 'solid' }));
  assert.equal(api.animalPreviewSvg('hammer', previewPaint(window, { colors: [5], look: 'solid' })), a);
  assert.notEqual(api.animalPreviewSvg('hammer', previewPaint(window, { colors: [4], look: 'solid' })), a);
  assert.notEqual(api.animalPreviewSvg('hammer', previewPaint(window, { colors: [5, 7], look: 'blend' })), a);
  const uri = api.animalPreviewUri('hammer', previewPaint(window, { colors: [5], look: 'solid' }));
  assert.ok(uri.startsWith('data:image/svg+xml;charset=utf-8,'));
  const body = uri.slice('data:image/svg+xml;charset=utf-8,'.length);
  assert.doesNotMatch(body, /[<>"#\s]/, '尖括号、引号、# 与空白都已转义');
  assert.equal(decodeURIComponent(body), a);
});

test('animalPreviewSvg：躯干渐变的轴就是躯干部件的包围盒——横向从尾端到头端、纵向从下沿到上沿，只算躯干（不含鳍、尾、眼睛、高光）', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  const shape = Shapes.expand('hammer');
  const boundsOf = parts => {
    const points = parts.flatMap(part => Shapes.sample(Shapes.parsePath(part.d)));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const body = boundsOf(shape.parts.filter(part => part.role === 'body')), all = boundsOf(shape.parts);
  assert.ok(all.x0 < body.x0 - 1 && all.y0 < body.y0 - 1, '前提：算上鳍与尾，横纵范围都比躯干大（否则这个测试分不出“只算躯干”）');
  const n = Shapes.num;
  const solid = parseXml(api.animalPreviewSvg('hammer', previewPaint(window, { colors: [5], look: 'solid' })));
  const fill = gradientOf(solid, 'bodyFill');
  assert.equal(fill.attrs.gradientUnits, 'userSpaceOnUse');
  assert.deepEqual([fill.attrs.y1, fill.attrs.y2], [n(body.y1), n(body.y0)], '纯色：纵向，自下沿（y 大）到上沿');
  const blend = parseXml(api.animalPreviewSvg('hammer', previewPaint(window, { colors: [2, 4], look: 'blend' })));
  const lengthwise = gradientOf(blend, 'bodyFill'), light = gradientOf(blend, 'bodyLight');
  assert.equal(lengthwise.attrs.gradientUnits, 'userSpaceOnUse');
  assert.deepEqual([lengthwise.attrs.x1, lengthwise.attrs.x2], [n(body.x0), n(body.x1)], '渐变：横向，自尾端到头端');
  assert.deepEqual([light.attrs.y1, light.attrs.y2], [n(body.y1), n(body.y0)], '亮度层：纵向，自下沿到上沿');
});

// ---- 合成形状（替身）：真实模块里目前只有一种动物，它比 84 窄、并集盒上下对称，覆盖不到“过宽要缩小”“不对称也居中”与各种数据异常的防线 ----
// 替身只换 expand/union/AVAILABLE（sample、parsePath、num 沿用真实模块）；部件都是矩形，数据坐标 y 向下，union 是原生坐标（已乘 scale、y 向上）。
const rectD = (x0, y0, x1, y1) => `M ${x0} ${y0} L ${x1} ${y0} L ${x1} ${y1} L ${x0} ${y1} Z`;
const stubShapes = ({ scale = 1, body = [-10, -4, 10, 4], limbs = [], union = { minX: -10, maxX: 10, minY: -4, maxY: 4 }, bodyRole = 'body' } = {}) => {
  const animal = {
    view: 'top', scale, eyes: { r: 2, at: [[0, 0]] }, blush: [],
    parts: [{ role: bodyRole, u: 0.5, d: rectD(...body), motion: null }, ...limbs.map(box => ({ role: 'limb', u: 0.5, d: rectD(...box), motion: null }))],
  };
  return { ...Shapes, AVAILABLE: ['jelly', 'stub'], expand: id => (id === 'stub' ? animal : Shapes.expand(id)), union: id => (id === 'stub' ? union : Shapes.union(id)) };
};
const stubSvg = (stub, resolved = { colors: [5], look: 'solid' }) => {
  const { window } = load(view({}), { shapes: stub });
  return window.JellyAppearanceSettings.animalPreviewSvg('stub', previewPaint(window, resolved));
};
const placementOf = svg => {
  const group = parseXml(svg).children.find(node => node.name === 'g');
  const [, tx, ty] = group.attrs.transform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).map(Number);
  return { tx, ty, k: Number(group.attrs.transform.match(/scale\(([^)]+)\)/)[1]) };
};

test('animalPreviewSvg：形状数据异常一律返回 null（不抛错、不画半张图）——没有 expand、AVAILABLE 不是数组、expand/union 给 null、没有躯干、躯干退化成线、并集宽度不是正数', () => {
  assert.equal(typeof stubSvg(stubShapes()), 'string', '前提：合法的替身动物能画出来');
  const cases = [
    ['没有 expand', { ...stubShapes(), expand: undefined }],
    ['expand 不是函数', { ...stubShapes(), expand: 'expand' }],
    ['AVAILABLE 是字符串（子串匹配不算“在列表里”）', { ...stubShapes(), AVAILABLE: 'jelly,stub' }],
    ['AVAILABLE 是带 includes 的对象', { ...stubShapes(), AVAILABLE: { includes: () => true } }],
    ['AVAILABLE 里没有它', { ...stubShapes(), AVAILABLE: ['jelly'] }],
    ['expand 给 null', { ...stubShapes(), expand: () => null }],
    ['union 给 null', { ...stubShapes(), union: () => null }],
    ['没有躯干部件', stubShapes({ bodyRole: 'limb' })],
    ['躯干宽度为零（竖线）', stubShapes({ body: [5, -4, 5, 4] })],
    ['躯干高度为零（横线）', stubShapes({ body: [-10, 3, 10, 3] })],
    ['并集宽度为零', stubShapes({ union: { minX: 3, maxX: 3, minY: -4, maxY: 4 } })],
    ['并集宽度为负', stubShapes({ union: { minX: 3, maxX: 2, minY: -4, maxY: 4 } })],
    ['并集不是有限数', stubShapes({ union: { minX: NaN, maxX: 3, minY: -4, maxY: 4 } })],
  ];
  for (const [name, stub] of cases) assert.equal(stubSvg(stub), null, name);
  // 边界的另一侧：很窄但为正的并集盒仍然画得出来（不会被误当成无效）
  assert.equal(typeof stubSvg(stubShapes({ union: { minX: 0, maxX: 0.5, minY: -4, maxY: 4 } })), 'string', '宽度 0.5 的并集盒');
});

test('animalPreviewSvg：比 84 宽的动物缩到 84 宽并按并集盒居中（并集盒上下不对称也居中）；缩放 = 形状缩放 × 适配系数；不超宽的不缩', () => {
  // 数据坐标 y 向下：躯干 x -20…360、y -10…10，一个肢体在躯干上方（y -70…-10）；scale 0.5 → 原生并集盒 x -10…180（宽 190，中心 85）、y -5…35（中心 15，不对称）
  const wide = stubShapes({ scale: 0.5, body: [-20, -10, 360, 10], limbs: [[100, -70, 200, -10]], union: { minX: -10, maxX: 180, minY: -5, maxY: 35 } });
  const { tx, ty, k } = placementOf(stubSvg(wide));
  const fit = 84 / 190;
  assert.ok(Math.abs(k - 0.5 * fit) < 0.0006, `缩放 ${k}，期望 ${0.5 * fit}（形状缩放 0.5 × 适配 84/190）`);
  assert.ok(Math.abs(tx - (50 - fit * 85)) < 0.0006, `横向平移 ${tx}，期望 ${50 - fit * 85}`);
  assert.ok(Math.abs(ty - (68 + fit * 15)) < 0.0006, `纵向平移 ${ty}，期望 ${68 + fit * 15}`);
  // 几何上自洽：躯干在底板上宽 84、横向中心 50；躯干+肢体的纵向范围（数据 y -70…10）中心 68
  const x = value => tx + k * value, y = value => ty + k * value;
  assert.ok(Math.abs((x(360) - x(-20)) - 84) < 0.1, `躯干宽 ${x(360) - x(-20)} 应为 84`);
  assert.ok(Math.abs((x(-20) + x(360)) / 2 - 50) < 0.1 && Math.abs((y(-70) + y(10)) / 2 - 68) < 0.1, '并集盒中心在底板中心 (50, 68)');
  // 本来就窄的不放大：并集宽 40 → 适配系数 1，缩放就是形状缩放
  const narrow = placementOf(stubSvg(stubShapes({ scale: 0.8, union: { minX: -25, maxX: 15, minY: -4, maxY: 4 } })));
  assert.equal(narrow.k, 0.8, '不超宽的不缩');
  assert.ok(Math.abs(narrow.tx - 55) < 0.0006, `横向平移 ${narrow.tx}（并集盒中心 -5 → 底板 50 − (−5) = 55）`);
});

test('limbTone：沿身体长轴取色——u 夹在 0…1、不是有限数取正中不外推、七彩在 0.5 前后分别混合 a→b 与 b→c；没有颜料返回 null', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  assert.equal(api.limbTone(null, 0.5), null); assert.equal(api.limbTone(undefined, 0.5), null);
  const [a, b, c] = [swatchRgb[5], swatchRgb[7], swatchRgb[1]];
  const at = u => api.limbTone(previewPaint(window, { colors: [5, 7, 1], look: 'rainbow' }), u);
  near(at(0), a, 'u=0'); near(at(0.25), mix(a, b, 0.5), 'u=0.25'); near(at(0.45), mix(a, b, 0.9), 'u=0.45'); near(at(0.5), b, 'u=0.5');
  near(at(0.55), mix(b, c, 0.1), 'u=0.55'); near(at(0.75), mix(b, c, 0.5), 'u=0.75'); near(at(1), c, 'u=1');
  near(at(1.5), c, 'u>1 夹到 1'); near(at(100), c, 'u=100'); near(at(-0.5), a, 'u<0 夹到 0');
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, '0.2', {}]) near(at(bad), b, `u=${String(bad)} 取正中`);
});

test('示意图取色规则与原生 SpeciesPainter 一致（源码绊线）：Swift 里的取色、透明度与描边常数一改，这里就会失败，提醒同步示意图', () => {
  const rules = [
    [/case \.limb: paintLimb\(ctx, path, tone: p\.paint\.limbTone\(u: part\.u\), stroked: show\.strokes\)/, '肢体取 limbTone(u)（描边由检查用的 show.strokes 控制，产品默认全画）'],
    [/case \.body: paintBody\(ctx, path, bounds: g\.bodyBounds, paint: p\.paint, stroked: show\.strokes\)/, '躯干渐变沿躯干部件的包围盒铺开（描边同样由 show.strokes 控制）'],
    [/case \.belly: paintFlat\(ctx, path, color: p\.paint\.a\.color\(0\.92, lighten: 0\.72\)\)/, '腹部：主色提亮 0.72、透明度 0.92'],
    [/case \.accent: paintFlat\(ctx, path, color: NSColor\.white\.withAlphaComponent\(0\.72\)\)/, '斑点：白 0.72'],
    [/case \.shine: paintFlat\(ctx, path, color: NSColor\.white\.withAlphaComponent\(0\.40\)\)/, '高光：白 0.40'],
    [/gradient\(\[tone\.color\(0\.92, darken: 0\.06\), tone\.color\(0\.95, lighten: 0\.34\)\], \[0, 1\]\)/, '肢体渐变：下深上浅'],
    [/stroke\(ctx, path, color: tone\.color\(0\.9, darken: 0\.30\), width: 1\.0\)/, '肢体描边：深 0.30、宽 1.0'],
    [/gradient\(\[paint\.a\.color\(0\.93, darken: 0\.05\), paint\.a\.color\(0\.95, lighten: 0\.22\), paint\.a\.color\(0\.97, lighten: 0\.50\)\], \[0, 0\.55, 1\]\)/, '纯色/双色躯干：自下而上三段'],
    [/case \.blend:\s*gradient\(\[paint\.a\.color\(0\.95, lighten: 0\.22\), paint\.b\.color\(0\.95, lighten: 0\.22\)\], \[0, 1\]\)/, '渐变躯干：尾→头 主色 → 第二色'],
    [/paint\.c\.color\(0\.95, lighten: 0\.22\)\], \[0, 0\.5, 1\]\)/, '七彩躯干：三色沿尾→头'],
    [/NSColor\.white\.withAlphaComponent\(0\), NSColor\.white\.withAlphaComponent\(0\.32\)\], \[0, 1\]\)/, '渐变与七彩叠一层自下而上的亮度'],
    [/stroke\(ctx, path, color: paint\.outlineTone\.color\(0\.9, darken: 0\.28\), width: 1\.1\)/, '躯干描边：outlineTone 深 0.28、宽 1.1'],
    [/NSColor\(calibratedRed: 1\.0, green: 0\.55, blue: 0\.62, alpha: 0\.34\)/, '腮红颜色与透明度'],
    [/NSRect\(x: ex - radius \* 0\.1 \* narrow, y: ey \+ radius \* 0\.1 \* open, width: radius \* 0\.6 \* narrow, height: radius \* 0\.6 \* open\)/, '眼睛高光点的位置与大小'],
  ];
  for (const [pattern, label] of rules) assert.match(painterSource, pattern, `原生画法变了：${label}。请同步 js/settings-jelly-appearance.js 的 animalPreviewSvg`);
});

// ---- 页面行为（替身 DOM） ----

test('打开页面：下拉显示已存的物种；选动物发送 set(species)，成功后示意图换成动物（img 有地址、容器标记为 animal）、文字点名动物、状态说已应用到桌面', async () => {
  let current = speciesView('jelly');
  const { els, sent } = load(message => (message.action === 'jelly_appearance_set' ? (current = speciesView(message.settings.species, {}, {})) : current));
  await tick();
  assert.equal(els['set-jellySpecies'].value, 'jelly');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'jelly');
  assert.equal(els['set-jellyAnimalPreview'].attrs.src, undefined, '水母状态下不加载图片');
  els['set-jellySpecies'].listeners.change({ target: { value: 'hammer' } }); await tick();
  assert.deepEqual(sent[1], { action: 'jelly_appearance_set', settings: { species: 'hammer' } });
  assert.equal(els['set-jellySpecies'].value, 'hammer');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal'); assert.equal(els['set-jellyPreview'].attrs['data-species'], 'hammer');
  assert.match(els['set-jellyAnimalPreview'].attrs.src, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(els['set-jellyPreviewText'].textContent, '小锤头鲨，纯色（冰蓝）');
  assert.equal(els['set-jellyPreview'].attrs['aria-label'], '当前形象：小锤头鲨，纯色（冰蓝）');
  assert.equal(els['set-jellyAppearanceStatus'].textContent, '外观已应用到桌面：小锤头鲨。');
  assert.equal(els['set-jellyPreview'].hidden, false);
  // 切回水母：容器标记回 jelly，图片地址被清掉（不留着一张看不见的图）
  els['set-jellySpecies'].listeners.change({ target: { value: 'jelly' } }); await tick();
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'jelly'); assert.equal(els['set-jellyPreview'].attrs['data-species'], 'jelly');
  assert.equal(els['set-jellyAnimalPreview'].attrs.src, undefined);
  assert.equal(els['set-jellyPreviewText'].textContent, '纯色（冰蓝）', '水母的文字不带物种前缀');
  assert.equal(els['set-jellyAppearanceStatus'].textContent, '外观已应用到桌面水母。');
});

test('选了动物后示意图随颜色与花纹更新：文字用“躯干/鳍与尾/尾端/头端/由尾到头”，不再说钟罩与触须', async () => {
  const cases = [
    [{ colors: [6, 0], look: 'duo' }, '小锤头鲨，双色（躯干紫，鳍与尾红）'],
    [{ colors: [2, 4], look: 'blend' }, '小锤头鲨，渐变（尾端黄 → 头端薄荷）'],
    [{ colors: [5, 7, 1], look: 'rainbow' }, '小锤头鲨，七彩（冰蓝、洋红、橙，由尾到头铺开）'],
    [{ colors: [5], look: 'solid' }, '小锤头鲨，纯色（冰蓝）'],
  ];
  for (const [resolved, expected] of cases) {
    const { els } = load(speciesView('hammer', { color: resolved.colors[0], ...resolved }));
    await tick();
    assert.equal(els['set-jellyPreviewText'].textContent, expected);
    assert.doesNotMatch(els['set-jellyPreviewText'].textContent, /钟罩|触须|下缘|顶部/);
  }
});

test('“每天换一只”开着：物种下拉仍可用（日期只换颜色与花纹），颜色与花纹锁住；请求进行中物种下拉也禁用', async () => {
  const { els } = load(view({ species: 'hammer', daily: true }, { resolved: HAMMER_RESOLVED }));
  await tick();
  assert.equal(els['set-jellySpecies'].disabled, false, '物种与每天换无关');
  assert.equal(els['set-jellyLook'].disabled, true);
  assert.equal(els['set-jellyPreviewLabel'].textContent, '今天这只');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal', '今天这只也按所选动物画');
  const held = load(null, { hold: true });
  await tick();
  held.pending[0].answer(speciesView('jelly')); await tick();
  held.els['set-jellySpecies'].listeners.change({ target: { value: 'hammer' } }); await tick();
  assert.equal(held.els['set-jellySpecies'].disabled, true, '保存中禁用，防连点');
  assert.equal(held.els['set-jellyAppearanceStatus'].textContent, '正在保存…');
  held.pending[1].answer(speciesView('hammer')); await tick();
  assert.equal(held.els['set-jellySpecies'].disabled, false);
});

test('随机一只与每天换一只只换颜色和花纹：物种保持用户的选择', async () => {
  let current = speciesView('hammer');
  const { els, sent } = load(message => {
    if (message.action === 'jelly_appearance_reroll') current = speciesView('hammer', { color: 3, colors: [3, 1], look: 'duo' });
    return current;
  });
  await tick();
  els['set-jellyReroll'].listeners.click(); await tick();
  assert.deepEqual(sent.map(m => m.action), ['jelly_appearance_get', 'jelly_appearance_reroll']);
  assert.equal(els['set-jellySpecies'].value, 'hammer');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal');
  assert.match(els['set-jellyPreviewText'].textContent, /^小锤头鲨，双色/);
});

test('状态文字：选了动物时点名动物；组件没有画出它时如实说明现在显示的是水母，并给出更新办法，不说已应用', () => {
  const { window } = load(view({}));
  const d = window.JellyAppearanceSettings.describe;
  assert.equal(d({ component: 'ok', connected: true, settings: { species: 'hammer' } }), '外观已应用到桌面：小锤头鲨。');
  assert.equal(d({ component: 'ok', connected: true, settings: { species: 'jelly' } }), '外观已应用到桌面水母。');
  assert.equal(d({ component: 'ok', connected: true }), '外观已应用到桌面水母。', '旧回执没有 settings：按水母');
  const old = d({ component: 'unsupported', connected: true, settings: { species: 'hammer' } });
  assert.match(old, /“小锤头鲨”/); assert.match(old, /更新桌面组件/); assert.match(old, /现在桌面上显示的是水母/);
  assert.doesNotMatch(old, /已应用|已生效/);
  assert.match(d({ component: 'unsupported', connected: true, settings: { species: 'jelly' } }), /不支持形象设置/, '水母的旧提示保持原样');
  assert.doesNotMatch(d({ component: 'unsupported', connected: true, settings: { species: 'jelly' } }), /现在桌面上显示的是水母/);
  for (const component of ['unknown', 'off']) assert.doesNotMatch(d({ component, connected: component === 'off', settings: { species: 'hammer' } }), /已应用/);
  for (const odd of ['dragon', '', 5, null, undefined, '__proto__', 'toString']) assert.equal(d({ component: 'ok', connected: true, settings: { species: odd } }), '外观已应用到桌面水母。', `物种 ${String(odd)} 按水母`);
});

test('所选动物页面画不出（后台认它，但形状脚本没加载）：示意图退回水母并如实说明，不抛错', async () => {
  const turtle = load(speciesView('turtle'), { noShapes: true });
  await tick();
  assert.equal(turtle.els['set-jellyPreview'].attrs['data-art'], 'jelly');
  assert.equal(turtle.els['set-jellyAnimalPreview'].attrs.src, undefined);
  assert.equal(turtle.els['set-jellyPreviewText'].textContent, '暂时显示水母（“海龟”还没有加入），纯色（冰蓝）');
  assert.equal(turtle.els['set-jellyPreviewText'].textContent.includes('undefined'), false);
  const bare = load(speciesView('hammer'), { noShapes: true });
  await tick();
  assert.equal(bare.els['set-jellyPreview'].attrs['data-art'], 'jelly');
  assert.match(bare.els['set-jellyPreviewText'].textContent, /^暂时显示水母（“小锤头鲨”还没有加入）/);
  assert.equal(bare.els['set-jellyPreview'].hidden, false, '预览本身仍显示');
});

test('选海龟：发送 set(species)，示意图是动物（img 有地址、容器标记为 turtle），文字点名龟壳与头鳍，状态说已应用到桌面：海龟', async () => {
  let current = speciesView('jelly');
  const { els, sent } = load(message => (message.action === 'jelly_appearance_set' ? (current = speciesView(message.settings.species, { colors: [6, 0], look: 'duo' })) : current));
  await tick();
  els['set-jellySpecies'].listeners.change({ target: { value: 'turtle' } }); await tick();
  assert.deepEqual(sent[1], { action: 'jelly_appearance_set', settings: { species: 'turtle' } });
  assert.equal(els['set-jellySpecies'].value, 'turtle');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal'); assert.equal(els['set-jellyPreview'].attrs['data-species'], 'turtle');
  assert.match(els['set-jellyAnimalPreview'].attrs.src, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(els['set-jellyPreviewText'].textContent, '海龟，双色（龟壳紫，头、鳍与尾红）', '海龟的头与鳍、尾同一个肢体色：双色时点名头，躯干叫龟壳');
  assert.equal(els['set-jellyPreview'].attrs['aria-label'], '当前形象：海龟，双色（龟壳紫，头、鳍与尾红）');
  assert.equal(els['set-jellyAppearanceStatus'].textContent, '外观已应用到桌面：海龟。');
  const decoded = decodeURIComponent(els['set-jellyAnimalPreview'].attrs.src.slice('data:image/svg+xml;charset=utf-8,'.length));
  assert.match(decoded, /^<svg /); assert.ok(decoded.length > 3000, `海龟的示意图应有 11 个部件与壳纹，长度 ${decoded.length}`);
});

test('后台给的物种不认识：当水母处理（不抛错、不写地址）；后台没带 species 的旧回执同样按水母', async () => {
  for (const species of ['dragon', '', 7, null, '__proto__']) {
    const { els } = load(view({ species }, { resolved: { color: 5, colors: [5], look: 'solid', species } }));
    await tick();
    assert.equal(els['set-jellyPreview'].attrs['data-art'], 'jelly', String(species));
    assert.equal(els['set-jellyPreviewText'].textContent, '纯色（冰蓝）');
  }
  const { els } = load({ ok: true, settings: { color: 5, look: 'solid', daily: false }, resolved: { color: 5, colors: [5], look: 'solid' }, component: 'ok', connected: true });
  await tick();
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'jelly');
  assert.equal(els['set-jellySpecies'].value, 'jelly');
});

test('旧页面结构（没有动物下拉或没有动物图片元素）：脚本照常工作，不抛错；没有图片元素时诚实地退回水母', async () => {
  const noSelect = load(speciesView('hammer'), { dom: { noSpecies: true } });
  await tick();
  assert.match(noSelect.els['set-jellyAppearanceStatus'].textContent, /已应用/);
  assert.equal(noSelect.els['set-jellyPreview'].attrs['data-art'], 'animal');
  const noImg = load(speciesView('hammer'), { dom: { noAnimalImg: true } });
  await tick();
  assert.equal(noImg.els['set-jellyPreview'].attrs['data-art'], 'jelly', '没有 img 就画不了动物，不能让容器标记成 animal 而把水母隐藏掉');
  assert.match(noImg.els['set-jellyPreviewText'].textContent, /^暂时显示水母/);
  assert.equal(noImg.els['set-jellySpecies'].value, 'hammer');
});

test('动物脚本里没有 innerHTML、网络、直接写存储、eval；形状数据只经全局 JellySpeciesShapes 读取', () => {
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /root\.JellySpeciesShapes/);
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|createElementNS|\bfetch\(|XMLHttpRequest|chrome\.storage\.(local|sync)|eval\(|new Function|importScripts|\.src\s*=/);
});

// ---------- 2026-10-19 写实风格：样式下拉、状态文字、写实示意图 ----------
// 写实动物用与首页水族馆同一份骨架数据（js/marine-rig-data.js）和同一个求值器（js/marine-rig.js）；设置页示意图也用它们求值一帧，所以与桌面、水族馆是同一只。

const REAL_ANIMALS = [...MarineRigData.IDS];
const realView = (species, resolved = {}, extra = {}) => view({ species, realistic: true }, { resolved: { color: 5, colors: [5], look: 'solid', species, ...resolved }, ...extra });
const decodeUri = uri => decodeURIComponent(uri.slice('data:image/svg+xml;charset=utf-8,'.length));

test('样式下拉：打开页面显示已存的样式（缺字段当写实，与后台默认一致）；非写实值显示卡通', async () => {
  for (const [settings, expected] of [[{ realistic: true }, 'realistic'], [{ realistic: false }, 'cartoon'], [{}, 'cartoon']]) {
    const { els } = load(view({ species: 'manta', ...settings }, { resolved: { color: 5, colors: [5], look: 'solid', species: 'manta' } }));
    await tick();
    assert.equal(els['set-jellyStyle'].value, expected, JSON.stringify(settings));
  }
  // 旧回执根本没有 realistic 字段（后台是旧版本）：下拉回到写实（页面默认），不抛错
  const old = load({ ok: true, settings: { color: 5, look: 'solid', daily: false, species: 'manta' }, resolved: { color: 5, colors: [5], look: 'solid', species: 'manta' }, component: 'ok', connected: true });
  await tick();
  assert.equal(old.els['set-jellyStyle'].value, 'realistic');
});

test('选写实/卡通：发送 set(realistic)，成功后下拉、示意图（data-style）与文字更新；写实示意图是自然体色，不随颜色花纹变', async () => {
  let current = view({ species: 'whaleshark', realistic: true, color: 2, look: 'duo' }, { resolved: { color: 2, colors: [2, 4], look: 'duo', species: 'whaleshark' } });
  const { els, sent } = load(message => {
    if (message.action === 'jelly_appearance_set') current = { ...current, settings: { ...current.settings, ...message.settings } };
    return current;
  });
  await tick();
  assert.equal(els['set-jellyStyle'].value, 'realistic');
  assert.equal(els['set-jellyPreview'].attrs['data-style'], 'realistic'); assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal');
  assert.equal(els['set-jellyPreviewText'].textContent, '鲸鲨，写实（自然体色，不受颜色与花纹影响）');
  assert.equal(els['set-jellyPreview'].attrs['aria-label'], '当前形象：鲸鲨，写实（自然体色，不受颜色与花纹影响）');
  const realistic = decodeUri(els['set-jellyAnimalPreview'].attrs.src);
  els['set-jellyStyle'].listeners.change({ target: { value: 'cartoon' } }); await tick();
  assert.deepEqual(sent[1], { action: 'jelly_appearance_set', settings: { realistic: false } });
  assert.equal(els['set-jellyStyle'].value, 'cartoon');
  assert.equal(els['set-jellyPreview'].attrs['data-style'], 'cartoon');
  assert.equal(els['set-jellyPreviewText'].textContent, '鲸鲨，双色（躯干黄，鳍与尾薄荷）', '卡通版按所选颜色与花纹描述');
  assert.notEqual(decodeUri(els['set-jellyAnimalPreview'].attrs.src), realistic, '卡通与写实是两张不同的示意图');
  els['set-jellyStyle'].listeners.change({ target: { value: 'realistic' } }); await tick();
  assert.deepEqual(sent[2], { action: 'jelly_appearance_set', settings: { realistic: true } });
  assert.equal(decodeUri(els['set-jellyAnimalPreview'].attrs.src), realistic, '再切回写实：示意图与第一次完全相同（确定性）');
  // 只有明确的 'cartoon' 才存为卡通；别的取值（理论上下拉里不会有）按写实，不会把脏值写进设置
  els['set-jellyStyle'].listeners.change({ target: { value: 'anything' } }); await tick();
  assert.deepEqual(sent[3].settings, { realistic: true });
});

test('写实示意图：颜色与花纹的改变不影响它（自然体色）；换物种才变', async () => {
  const uriOf = async (species, resolved) => {
    const { els } = load(realView(species, resolved));
    await tick();
    return els['set-jellyAnimalPreview'].attrs.src;
  };
  const a = await uriOf('manta', { color: 1, colors: [1], look: 'solid' });
  const b = await uriOf('manta', { color: 6, colors: [6, 0, 3], look: 'rainbow' });
  assert.ok(a && a === b, '同一种动物、不同颜色花纹：写实示意图完全相同');
  const c = await uriOf('turtle', {});
  assert.ok(c && c !== a, '换物种示意图就变');
});

test('写实示意图：四种动物都能画；svg 结构合法（严格解析），没有脚本、内联处理器、外链；渐变与路径都有；每个路径点数据都是有限数', () => {
  const { window } = load(view({}));
  const api = window.JellyAppearanceSettings;
  assert.deepEqual([...REAL_ANIMALS].sort(), ['hammer', 'manta', 'turtle', 'whaleshark'], '骨架数据里恰好是这四种动物；下面逐种核对设置页都画得出来');
  for (const id of REAL_ANIMALS) {
    const svg = api.realisticPreviewSvg(id);
    assert.ok(svg && svg.length > 4000, `${id}：应画出写实示意图（长度 ${svg?.length}）`);
    assert.doesNotMatch(svg, /<script|\son[a-z]+\s*=|href=|xlink:|<image|<foreignObject|url\(\s*['"]?(?!#)/i, `${id}：不许脚本、处理器、外链`);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity|null/, `${id}：不能出现 NaN / undefined`);
    const top = parseXml(svg);      // 返回的就是最外层的 svg 元素
    assert.equal(top.name, 'svg'); assert.equal(top.attrs.viewBox, '0 0 100 136');
    const defs = top.children.find(node => node.name === 'defs');
    assert.ok(defs && defs.children.some(node => node.attrs.id === 'tile'), `${id}：有底板渐变`);
    const group = top.children.find(node => node.name === 'g');
    assert.ok(group.children.length > 8, `${id}：绘制步骤至少 8 条（实际 ${group.children.length}）`);
    assert.ok(group.children.every(node => node.name === 'path' && /^M[-\d.]/.test(node.attrs.d)), `${id}：每个绘制步骤是以 M 开头的路径`);
    const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, `${id}：svg 内 id 唯一`);
    for (const ref of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(ids.includes(ref[1]), `${id}：${ref[1]} 要在 svg 内定义`);
    // 动物居中且在底板里：用数值核对 transform（平移 + 缩放）后的并集落在 100 × 136 的底板内并留出边距
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(svg);
    assert.ok(m, `${id}：外层有平移与缩放`);
    const [tx, ty, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const union = MarineRig.unionBounds(MarineRigData.rig(id));
    const box = [tx + k * union.minX, ty + k * union.minY, tx + k * union.maxX, ty + k * union.maxY];
    assert.ok(box[0] >= 5 && box[2] <= 95 && box[1] >= 14 && box[3] <= 122, `${id}：并集在底板里留边距（${box.map(v => v.toFixed(1)).join(',')}）`);
    assert.ok(Math.abs((box[0] + box[2]) / 2 - 50) < 0.05 && Math.abs((box[1] + box[3]) / 2 - 68) < 0.05, `${id}：并集居中`);
  }
});

test('写实示意图：水母与不认识的物种返回 null；骨架数据缺失、求值器缺失、求值抛错或没有绘制步骤时返回 null，不抛错', () => {
  const full = load(view({})).window.JellyAppearanceSettings;
  for (const odd of ['jelly', 'dragon', '', 5, null, undefined, '__proto__', 'toString']) assert.equal(full.realisticPreviewSvg(odd), null, String(odd));
  assert.equal(full.realisticPreviewUri('jelly'), null);
  assert.match(full.realisticPreviewUri('manta'), /^data:image\/svg\+xml;charset=utf-8,/);
  const none = load(view({}), { noMarine: true }).window.JellyAppearanceSettings;
  assert.equal(none.realisticPreviewSvg('manta'), null, '页面里没有写实脚本');
  assert.equal(none.realisticPreviewUri('manta'), null);
  const bad = (Rig, Data) => load(view({}), { marine: { Rig, Data } }).window.JellyAppearanceSettings.realisticPreviewSvg('manta');
  assert.equal(bad({ ...MarineRig, evaluate: () => { throw new Error('boom'); } }, MarineRigData), null, '求值抛错');
  assert.equal(bad({ ...MarineRig, evaluate: () => ({ ops: [], bounds: null }) }, MarineRigData), null, '没有绘制步骤');
  assert.equal(bad({ ...MarineRig, evaluate: () => null }, MarineRigData), null, '求值返回空');
  assert.equal(bad({ ...MarineRig, unionBounds: () => null }, MarineRigData), null, '没有并集');
  assert.equal(bad({ ...MarineRig, unionBounds: () => ({ minX: 0, minY: 0, maxX: 0, maxY: 5 }) }, MarineRigData), null, '并集宽度为 0');
  assert.equal(bad({ evaluate: 1 }, MarineRigData), null, '求值器不是函数');
  assert.equal(bad(MarineRig, { IDS: ['hammer'], rig: MarineRigData.rig }), null, '数据里没有这种动物');
  assert.equal(bad(MarineRig, { IDS: 'manta', rig: MarineRigData.rig }), null, 'IDS 不是数组');
  assert.equal(bad(MarineRig, { IDS: ['manta'], rig: () => { throw new Error('nope'); } }), null, '取骨架抛错');
});

test('要写实却画不出写实示意图：退回卡通示意并如实说明，不把卡通图说成写实，也不抛错', async () => {
  const { els } = load(realView('manta', { colors: [6, 0], look: 'duo' }), { noMarine: true });
  await tick();
  assert.equal(els['set-jellyPreview'].attrs['data-style'], 'cartoon', '容器标记如实写卡通');
  assert.equal(els['set-jellyPreview'].attrs['data-art'], 'animal');
  assert.equal(els['set-jellyPreviewText'].textContent, '蝠鲼，写实示意图暂时画不出来，显示的是卡通示意，双色（躯干紫，鳍与尾红）');
  assert.match(els['set-jellyAnimalPreview'].attrs.src, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.equal(els['set-jellyPreviewText'].textContent.includes('undefined'), false);
  // 水母：写实开关没有意义，文字不提写实
  const jelly = load(view({ species: 'jelly', realistic: true }, { resolved: { color: 5, colors: [5], look: 'solid', species: 'jelly' } }), { noMarine: true });
  await tick();
  assert.equal(jelly.els['set-jellyPreviewText'].textContent, '纯色（冰蓝）'); assert.equal(jelly.els['set-jellyPreview'].attrs['data-style'], 'cartoon');
  // 没有 img 元素时不画动物（旧页面结构）：不能因为要写实而硬画
  const noImg = load(realView('manta'), { dom: { noAnimalImg: true } });
  await tick();
  assert.equal(noImg.els['set-jellyPreview'].attrs['data-art'], 'jelly');
});

test('状态文字（写实）：只有组件确认的画法与当前设置一致才说“写实”；旧组件画卡通时说明更新办法；确认过期按“等待确认”处理', () => {
  const d = load(view({})).window.JellyAppearanceSettings.describe;
  const base = { component: 'ok', connected: true };
  const asked = species => ({ species, realistic: true });
  // 写实：组件确认画成了写实
  assert.equal(d({ ...base, settings: asked('whaleshark'), style: { style: 'realistic', species: 'whaleshark', realistic: true } }), '外观已应用到桌面：鲸鲨（写实）。');
  // 写实：组件回执说画的是卡通（旧组件没有 realistic 回执，或者这种动物在组件里没有写实数据）
  const cartoon = d({ ...base, settings: asked('whaleshark'), style: { style: 'cartoon', species: 'whaleshark', realistic: true } });
  assert.match(cartoon, /还没有写实版/); assert.match(cartoon, /更新桌面组件/); assert.match(cartoon, /现在显示的是卡通版/);
  assert.doesNotMatch(cartoon, /（写实）|已应用到桌面：鲸鲨。/, '没画成写实就不能说写实');
  // 写实：还没有回执 / 回执不是这份设置的（物种或写实开关不一致）→ 等待确认，绝不说“写实”
  for (const style of [undefined, null, {}, { style: 'unknown', species: 'whaleshark', realistic: true }, { style: 'realistic', species: 'manta', realistic: true }, { style: 'realistic', species: 'whaleshark', realistic: false }, { style: 'weird', species: 'whaleshark', realistic: true }, 'realistic', 5]) {
    const text = d({ ...base, settings: asked('whaleshark'), style });
    assert.match(text, /正在等待桌面组件确认“鲸鲨”的写实风格/, JSON.stringify(style));
    assert.doesNotMatch(text, /（写实）|已应用/, JSON.stringify(style));
  }
  // 卡通：确认过就写“（卡通）”，没有确认保持原样，过期的确认（上一次是写实）不采信
  const wantCartoon = { species: 'turtle', realistic: false };
  assert.equal(d({ ...base, settings: wantCartoon, style: { style: 'cartoon', species: 'turtle', realistic: false } }), '外观已应用到桌面：海龟（卡通）。');
  assert.equal(d({ ...base, settings: wantCartoon }), '外观已应用到桌面：海龟。');
  assert.equal(d({ ...base, settings: wantCartoon, style: { style: 'realistic', species: 'turtle', realistic: true } }), '外观已应用到桌面：海龟。', '过期的写实确认不用于卡通设置');
  // 水母：写实开关没有意义，文字不变
  assert.equal(d({ ...base, settings: { species: 'jelly', realistic: true }, style: { style: 'realistic', species: 'jelly', realistic: true } }), '外观已应用到桌面水母。');
  // 其它组件状态不受影响：不支持、没连上、没常驻都不提写实，也不说已应用
  for (const component of ['unsupported', 'unknown', 'off']) assert.doesNotMatch(d({ component, connected: component === 'off', settings: asked('manta'), style: { style: 'realistic', species: 'manta', realistic: true } }), /已应用|已生效|（写实）/, component);
});

test('样式下拉：请求进行中禁用（防连点）；“每天换一只”开着时仍可用（日期只换颜色与花纹）', async () => {
  const daily = load(realView('manta', {}, {}));
  await tick();
  assert.equal(daily.els['set-jellyStyle'].disabled, false);
  const dailyOn = load(view({ species: 'manta', realistic: true, daily: true }, { resolved: { color: 5, colors: [5], look: 'solid', species: 'manta' } }));
  await tick();
  assert.equal(dailyOn.els['set-jellyStyle'].disabled, false, '样式与每天换无关');
  assert.equal(dailyOn.els['set-jellyLook'].disabled, true);
  const held = load(null, { hold: true });
  await tick();
  held.pending[0].answer(realView('manta')); await tick();
  held.els['set-jellyStyle'].listeners.change({ target: { value: 'cartoon' } }); await tick();
  assert.equal(held.els['set-jellyStyle'].disabled, true, '保存中禁用');
  assert.equal(held.els['set-jellyAppearanceStatus'].textContent, '正在保存…');
  held.pending[1].answer(view({ species: 'manta', realistic: false }, { resolved: { color: 5, colors: [5], look: 'solid', species: 'manta' } })); await tick();
  assert.equal(held.els['set-jellyStyle'].disabled, false);
  assert.equal(held.els['set-jellyStyle'].value, 'cartoon');
});

test('样式保存失败：如实显示原因，下拉回到已保存的值，不说已应用', async () => {
  let current = realView('manta');
  const { els } = load(message => (message.action === 'jelly_appearance_set' ? { ok: false, error: 'realistic 的取值无效' } : current));
  await tick();
  els['set-jellyStyle'].listeners.change({ target: { value: 'cartoon' } }); await tick();
  assert.match(els['set-jellyAppearanceStatus'].textContent, /保存失败：realistic 的取值无效/);
  assert.doesNotMatch(els['set-jellyAppearanceStatus'].textContent, /已应用/);
  assert.equal(els['set-jellyStyle'].disabled, false);
});

test('旧页面结构（没有样式下拉）：脚本照常工作，不抛错', async () => {
  const noStyle = load(realView('manta'), { dom: { noStyle: true } });
  await tick();
  assert.match(noStyle.els['set-jellyAppearanceStatus'].textContent, /正在等待桌面组件确认|已应用/);
  assert.equal(noStyle.els['set-jellyPreview'].attrs['data-style'], 'realistic');
});

test('写实脚本守卫：骨架数据与求值器只经全局 MarineRig / MarineRigData 读取；示意图拼接的只有求值结果的数字与十六进制颜色', () => {
  const code = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(code, /root\.MarineRig\b/); assert.match(code, /root\.MarineRigData\b/);
  assert.match(code, /Rig\.evaluate\(/); assert.match(code, /Rig\.unionBounds\(/);
  const body = code.slice(code.indexOf('function realisticPreviewSvg'), code.indexOf('function animalPreviewUri'));
  assert.ok(body.length > 1500, '应截到写实示意图函数');
  // 模板字符串里插入的只能是 num(...) / hexOf(...) / 本函数算出的数字与固定片段，不插入任何外部字符串
  for (const m of body.matchAll(/\$\{([^}]*)\}/g)) assert.match(m[1], /^(num\(|hexOf\(|rule|d\b|index|defs\.join|out\.join|stops|TILE_W|TILE_H|op\.cap|k\b|tx|ty|g\.)/, `模板里插入了没核对过的表达式：${m[1]}`);
});
