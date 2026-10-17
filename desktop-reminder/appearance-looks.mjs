// 花纹的“画对了没有”检查：把四种花纹（纯色/双色/渐变/七彩）的窗口截图叠在白底上，按区域量颜色，
// 断言钟罩与触须分别画成了该花纹规定的颜色位——这是对 AppKit 绘制层（GlassPainter）的独立检查：
// JS↔Swift 对照只证明“颜料数值”一致，不证明画出来的像素用了对的颜料。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-looks --all-looks
//   node desktop-reminder/appearance-looks.mjs --dir=/tmp/tk/appearance-looks
//
// 口径（写清楚以免被误读）：
//  · 参考色 = 同一构建里“纯色”截图的身体中位色（白底），所以不依赖调色板的具体数值，只依赖“同一个色位画出来是什么颜色”；
//  · “身体”只取最大的一块连通像素：睡着时右上角的 “z z” 睡觉标记也满足 alpha ≥ 0.45，不排除的话包围盒会被撑宽
//    （真实截图里右边界 216 → 245），“左/中/右三段”就不是钟罩的三等分了；
//  · 分区靠身体像素的行宽：行宽 ≥ 最大行宽 40% 的最后一行以上算钟罩，其下算触须（静止姿态，TIMEKEEPER_REDUCE_MOTION=1）；
//    画法或尺寸比例大改时这个划分要重新核对；
//  · 描边 = 钟罩里贴着剪影边缘（四邻有一个不是身体）的像素，去掉下摆附近 4 行；参考描边色同样取自“纯色”截图；
//  · 判定是“最近的是哪个参考色位”与“更靠近谁”的排序，不用绝对色差阈值（除了纯色/双色里“就是那个颜色”、描边“就是那个颜色”的宽松上限，
//    以及七彩“顶部比下缘亮”的最小亮度差）；
//  · 只在白天（calm）、浅色外观、玻璃材质、中号下测过；材质与尺寸扩展后须各补一组。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png-decode.mjs';
import { deltaE, percentile, measure, toLab, BACKDROPS } from './appearance-contrast.mjs';

/** 每种花纹用的色位：a=5 冰蓝、b=0 红、c=3 绿，两两色相差很大（色位间最小色差 27），分区后的归类才有区分度。 */
export const LOOK_SPECS = Object.freeze({ solid: [5], duo: [5, 0], blend: [5, 0], rainbow: [5, 0, 3] });
/** 需要的参考色位（各自的纯色截图）。 */
export const REFERENCE_SLOTS = Object.freeze([...new Set(Object.values(LOOK_SPECS).flat())].sort((x, y) => x - y));
/**
 * exact：纯色/双色里“就是那个颜色”的色差上限（实测钟罩 0、触须 3–4，留足余量）；
 * outlineExact：描边与对应色位参考描边的色差上限（实测 0.0–0.7，错的色位在 40 左右）；
 * lightGapMin：七彩钟罩“顶部比下缘亮”的最小 L* 差（实测有亮度层时约 3，去掉后约 0）。其余判定只比较远近。
 */
export const LIMITS = Object.freeze({ exact: 8, tentacleExact: 10, outlineExact: 4, lightGapMin: 1.5 });
const BELL_ROW_RATIO = 0.4;
const HEM_SKIP_ROWS = 4;      // 描边取样时跳过钟罩下摆附近的行（那里与触须、口腕的起点混在一起）

/** mask 里最大的一块 8 连通区域（并列取扫描顺序靠前的那块）；返回只含这一块的新 mask。 */
function largestComponent(mask, width, height) {
  const label = new Int32Array(width * height), sizes = [0];
  let best = 0, count = 0;
  const stack = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    const id = ++count; let size = 0;
    label[start] = id; stack.push(start);
    while (stack.length) {
      const at = stack.pop(); size++;
      const x = at % width, y = (at - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] && !label[next]) { label[next] = id; stack.push(next); }
      }
    }
    sizes.push(size);
    if (size > sizes[best]) best = id;
  }
  const keep = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) if (label[i] === best) keep[i] = 1;
  return keep;
}

/**
 * 叠在 backdrop 上，取 alpha ≥ minAlpha 的“身体”像素（只要最大的一块连通区域，排除睡觉标记等游离的小块），
 * 并按行宽把钟罩与触须分开，再挑出钟罩的描边像素；没有身体像素返回 null。
 */
export function splitBody(image, { minAlpha = 0.45, backdrop = BACKDROPS.white } = {}) {
  const { width, height, pixels } = image;
  const need = Math.ceil(minAlpha * 255), raw = new Uint8Array(width * height);
  let any = false;
  for (let i = 0; i < raw.length; i++) if (pixels[i * 4 + 3] >= need) { raw[i] = 1; any = true; }
  if (!any) return null;
  const mask = largestComponent(raw, width, height), rowWidth = new Array(height).fill(0), body = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (!mask[y * width + x]) continue;
    const i = (y * width + x) * 4, a = pixels[i + 3] / 255;
    body.push({ x, y, color: [0, 1, 2].map(k => a * pixels[i + k] + (1 - a) * backdrop) });
    rowWidth[y]++;
  }
  const top = body[0].y, bottom = body[body.length - 1].y, widest = Math.max(...rowWidth);
  let bellBottom = top;
  for (let y = top; y <= bottom; y++) if (rowWidth[y] >= BELL_ROW_RATIO * widest) bellBottom = y;
  let left = Infinity, right = -Infinity;
  for (const p of body) { if (p.x < left) left = p.x; if (p.x > right) right = p.x; }
  const inside = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  const bell = body.filter(p => p.y <= bellBottom);
  const outline = bell.filter(p => p.y <= bellBottom - HEM_SKIP_ROWS && !(inside(p.x - 1, p.y) && inside(p.x + 1, p.y) && inside(p.x, p.y - 1) && inside(p.x, p.y + 1)));
  return { bell, tentacles: body.filter(p => p.y > bellBottom), outline, top, bellBottom, bottom, left, right };
}

/** 一组像素的逐通道中位色；空组返回 null。 */
export function medianColor(list) {
  return list.length ? [0, 1, 2].map(k => percentile(list.map(p => p.color[k]), 0.5)) : null;
}

/** 钟罩分上/下 1/3（按行）与左/中/右 1/3（按列）、描边、触须整体与左/右 1/3（按列，以钟罩的左右边界为准）。 */
export function regionsOf(body) {
  const { bell, tentacles, outline, top, bellBottom, left, right } = body;
  const height = bellBottom - top, width = right - left;
  return {
    bell: medianColor(bell),
    bellTop: medianColor(bell.filter(p => p.y < top + height / 3)),
    bellBottom: medianColor(bell.filter(p => p.y > bellBottom - height / 3)),
    bellLeft: medianColor(bell.filter(p => p.x < left + width / 3)),
    bellMiddle: medianColor(bell.filter(p => p.x >= left + width / 3 && p.x < left + (2 * width) / 3)),
    bellRight: medianColor(bell.filter(p => p.x >= left + (2 * width) / 3)),
    outline: medianColor(outline),
    tentacles: medianColor(tentacles),
    tentacleLeft: medianColor(tentacles.filter(p => p.x < left + width / 3)),
    tentacleRight: medianColor(tentacles.filter(p => p.x >= left + (2 * width) / 3)),
  };
}

/**
 * 按花纹的规定判定截图画对了没有；返回失败说明（空数组表示通过）。取不到像素算失败，不会静默通过。
 *  · 纯色：钟罩与触须都是 a，描边是 a。
 *  · 双色：钟罩 a，触须 b，描边 a。
 *  · 渐变：钟罩下缘靠 a、顶部靠 b，触须靠 b（触须偏向第二色 0.7），描边 a。
 *  · 七彩：钟罩从左到右依次靠 a、b、c，且左侧比右侧更像 a、右侧比左侧更像 c，顶部比下缘亮（自上而下的亮度层）；
 *    触须最左一段更靠 a 而不是 c、最右一段更靠 c 而不是 a（五根触须沿钟罩铺开）；描边是 b。
 * refs：{ 色位: 该色位纯色截图的身体中位色 }；outlineRefs：{ 色位: 该色位纯色截图的描边中位色 }；looks：{ 花纹: 解码后的截图 }。
 */
export function evaluateLooks({ refs, outlineRefs, looks }, limits = LIMITS) {
  const failures = [];
  for (const [look, slots] of Object.entries(LOOK_SPECS)) {
    const [a, b = a, c = a] = slots;
    for (const slot of slots) if (!refs?.[slot]) throw new Error(`缺少色位 ${slot} 的参考色`);
    for (const slot of slots) if (!outlineRefs?.[slot]) throw new Error(`缺少色位 ${slot} 的参考描边色`);
    const body = looks?.[look] ? splitBody(looks[look]) : null;
    if (!body) { failures.push(`${look}：没有取到身体像素（截图失败或水母没有出现）`); continue; }
    const regions = regionsOf(body);
    const distance = (color, slot) => deltaE(color, refs[slot]);
    const nearest = color => slots.map(slot => ({ slot, d: distance(color, slot) })).sort((x, y) => x.d - y.d)[0];
    const fail = text => failures.push(`${look}：${text}`);
    const has = (name, label) => { if (regions[name]) return true; fail(`${label}没有取到像素`); return false; };
    const expectNearest = (name, label, slot, max) => {
      if (!has(name, label)) return;
      const best = nearest(regions[name]);
      if (best.slot !== slot) fail(`${label}最接近色位 ${best.slot}，应是色位 ${slot}`);
      else if (max !== undefined && best.d > max) fail(`${label}离色位 ${slot} 色差 ${best.d.toFixed(1)}，超过 ${max}`);
    };
    const expectCloser = (name, label, near, far) => {
      if (!has(name, label)) return;
      const dn = distance(regions[name], near), df = distance(regions[name], far);
      if (!(dn < df)) fail(`${label}应更接近色位 ${near}（${dn.toFixed(1)}）而不是色位 ${far}（${df.toFixed(1)}）`);
    };
    // 描边：最近的参考描边色必须是该花纹规定的色位，且离它不远（同一画法下量出来的参考，不依赖调色板数值）
    const expectOutline = slot => {
      if (!has('outline', '描边')) return;
      const best = slots.map(candidate => ({ slot: candidate, d: deltaE(regions.outline, outlineRefs[candidate]) })).sort((x, y) => x.d - y.d)[0];
      if (best.slot !== slot) fail(`描边最接近色位 ${best.slot}，应是色位 ${slot}`);
      else if (best.d > limits.outlineExact) fail(`描边离色位 ${slot} 的参考描边色差 ${best.d.toFixed(1)}，超过 ${limits.outlineExact}`);
    };
    switch (look) {
      case 'solid':
        expectNearest('bell', '钟罩', a, limits.exact);
        expectNearest('tentacles', '触须', a, limits.tentacleExact);
        expectOutline(a);
        break;
      case 'duo':
        expectNearest('bell', '钟罩', a, limits.exact);
        expectNearest('tentacles', '触须', b, limits.tentacleExact);
        expectOutline(a);
        break;
      case 'blend':
        expectNearest('bellBottom', '钟罩下缘', a);
        expectNearest('bellTop', '钟罩顶部', b);
        expectCloser('tentacles', '触须', b, a);
        expectOutline(a);
        break;
      case 'rainbow':
        expectNearest('bellMiddle', '钟罩中段', b);
        expectNearest('bellRight', '钟罩右段', c);
        expectCloser('bellLeft', '钟罩左段', a, c);
        if (has('bellLeft', '钟罩左段') && has('bellRight', '钟罩右段') && !(distance(regions.bellLeft, a) < distance(regions.bellRight, a))) fail('钟罩左段应比右段更像色位 ' + a);
        if (has('bellLeft', '钟罩左段') && has('bellRight', '钟罩右段') && !(distance(regions.bellRight, c) < distance(regions.bellLeft, c))) fail('钟罩右段应比左段更像色位 ' + c);
        expectCloser('tentacleLeft', '触须最左一段', a, c);
        expectCloser('tentacleRight', '触须最右一段', c, a);
        if (has('bellTop', '钟罩顶部') && has('bellBottom', '钟罩下缘')) {
          const gap = toLab(regions.bellTop)[0] - toLab(regions.bellBottom)[0];
          if (!(gap >= limits.lightGapMin)) fail(`钟罩顶部应比下缘亮（L* 差 ${gap.toFixed(1)}，至少 ${limits.lightGapMin}）`);
        }
        expectOutline(b);
        break;
      default: break;
    }
  }
  return failures;
}

function main() {
  const dir = process.argv.find(arg => arg.startsWith('--dir='))?.slice(6);
  if (!dir) throw new Error('需要 --dir=（appearance-snapshot.mjs --all-looks 的输出目录）');
  const refs = {}, outlineRefs = {};
  for (const slot of REFERENCE_SLOTS) {
    const image = decodePng(resolve(dir, `color-${slot}.png`));
    const reference = measure(image, { backdrop: BACKDROPS.white });
    if (!reference.median) throw new Error(`色位 ${slot} 的参考截图里没有身体像素`);
    refs[slot] = reference.median;
    const outline = regionsOf(splitBody(image)).outline;
    if (!outline) throw new Error(`色位 ${slot} 的参考截图里没有描边像素`);
    outlineRefs[slot] = outline;
  }
  const looks = Object.fromEntries(Object.keys(LOOK_SPECS).map(look => [look, decodePng(resolve(dir, `look-${look}.png`))]));
  for (const [look, slots] of Object.entries(LOOK_SPECS)) {
    const body = splitBody(looks[look]);
    if (!body) { console.log(`${look.padEnd(8)} 没有身体像素`); continue; }
    const regions = regionsOf(body);
    const cells = Object.entries(regions).map(([name, color]) => {
      if (!color) return `${name}=—`;
      const table = name === 'outline' ? outlineRefs : refs;
      const best = slots.map(slot => ({ slot, d: deltaE(color, table[slot]) })).sort((x, y) => x.d - y.d)[0];
      return `${name}→${best.slot}(${best.d.toFixed(0)})`;
    });
    console.log(`${look.padEnd(8)} 钟罩 ${body.top}–${body.bellBottom} 触须 ${body.bellBottom + 1}–${body.bottom}  ${cells.join('  ')}`);
  }
  const failures = evaluateLooks({ refs, outlineRefs, looks });
  if (failures.length) { console.log(`\n未通过（${failures.length}）：`); failures.forEach(line => console.log(`  ✗ ${line}`)); process.exit(1); }
  console.log('\n四种花纹都画成了规定的颜色位。');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
