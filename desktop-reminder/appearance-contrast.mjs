// 外观的可见性与辨识度测量：把带 alpha 的水母窗口截图（appearance-snapshot.mjs --all-colors 的输出）分别叠在纯白、纯黑底上，
// 量“身体”像素对底色的对比度，以及 8 个颜色位之间的 Lab 色差。纯函数部分由 test/appearance-contrast.test.mjs 覆盖。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-colors --all-colors
//   node desktop-reminder/appearance-contrast.mjs --dir=/tmp/tk/appearance-colors
//
// 口径（写清楚以免被误读）：
//  · 水母是半透明的，实际观感取决于桌面壁纸；这里只量两个极端底色（纯白、纯黑），不代表任何真实壁纸；
//  · “身体”= 窗口截图里 alpha ≥ 0.45 的像素（钟罩填充、描边、脸与口腕；光晕与阴影不算）；
//  · 对比度用 WCAG 相对亮度公式，只作相对比较：WCAG 对图形对象的 3:1 针对不透明元素，半透明的水母并不套用；
//  · 色差用 CIE76 Lab（D65）：≥20 左右一眼可分，≥10 并排时可分；
//  · 阈值是对当前调色板与画法实测值的“防退化线”（见 LIMITS 旁的说明），不是视觉标准。
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png-decode.mjs';

export const BACKDROPS = Object.freeze({ white: 255, black: 0 });
export const SLOT_NAMES = Object.freeze(['红', '橙', '黄', '绿', '薄荷', '冰蓝', '紫', '洋红']);
const BACKDROP_LABEL = Object.freeze({ white: '白底', black: '黑底' });

const toLinear = value => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

/** WCAG 对比度：(亮 + 0.05) / (暗 + 0.05)。 */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB（0…255）→ CIE Lab（D65）。 */
export function toLab([r, g, b]) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 色差。 */
export function deltaE(a, b) {
  const p = toLab(a), q = toLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** 排序后按下标取分位数（不改动入参）；空数组给 0。 */
export function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/**
 * 把一张 RGBA（非预乘）窗口截图叠在纯色底（backdrop：0…255）上，只看 alpha ≥ minAlpha 的“身体”像素。
 * 返回身体像素数、叠底后各通道的中位数颜色、以及“叠底后颜色对底色”的对比度分位数；没有身体像素时 median 为 null。
 */
export function measure(image, { backdrop, minAlpha = 0.45 }) {
  const { pixels } = image;
  const need = Math.ceil(minAlpha * 255);
  const backdropColor = [backdrop, backdrop, backdrop];
  const channels = [[], [], []], contrasts = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    if (alpha < need) continue;
    const a = alpha / 255;
    const color = [0, 1, 2].map(k => a * pixels[i + k] + (1 - a) * backdrop);
    color.forEach((value, k) => channels[k].push(value));
    contrasts.push(contrastRatio(color, backdropColor));
  }
  const count = contrasts.length;
  return {
    count,
    median: count ? channels.map(values => percentile(values, 0.5)) : null,
    contrast: { p10: percentile(contrasts, 0.1), p50: percentile(contrasts, 0.5), p90: percentile(contrasts, 0.9), p98: percentile(contrasts, 0.98) },
  };
}

/** 每个颜色位在白/黑底上各测一组，并找出各底色上最相近的一对（按身体中位数颜色的 Lab 色差）。 */
export function analyze(images, options = {}) {
  const slots = images.map(image => ({ white: measure(image, { backdrop: BACKDROPS.white, ...options }), black: measure(image, { backdrop: BACKDROPS.black, ...options }) }));
  const closest = {};
  for (const backdrop of ['white', 'black']) {
    let best = null;
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i][backdrop].median, b = slots[j][backdrop].median;
      if (!a || !b) continue;
      const distance = deltaE(a, b);
      if (!best || distance < best.deltaE) best = { a: i, b: j, deltaE: distance };
    }
    closest[backdrop] = best;
  }
  return { slots, closest };
}

const nameOf = index => `色位 ${index}（${SLOT_NAMES[index] ?? '?'}）`;

/** 按阈值判定；返回失败说明（空数组表示通过）。取不到身体像素算失败，不会静默通过。 */
export function evaluate(analysis, limits) {
  const failures = [];
  analysis.slots.forEach((slot, index) => {
    for (const [backdrop, key] of [['white', 'whiteMedianContrast'], ['black', 'blackMedianContrast']]) {
      const result = slot[backdrop];
      if (!result.count) { failures.push(`${nameOf(index)}：${BACKDROP_LABEL[backdrop]}上没有取到身体像素（截图失败或水母没有出现）`); continue; }
      if (result.contrast.p50 < limits[key]) failures.push(`${nameOf(index)}：${BACKDROP_LABEL[backdrop]}中位对比度 ${result.contrast.p50.toFixed(2)} 低于 ${limits[key]}`);
    }
  });
  for (const backdrop of ['white', 'black']) {
    for (let i = 0; i < analysis.slots.length; i++) for (let j = i + 1; j < analysis.slots.length; j++) {
      const a = analysis.slots[i][backdrop].median, b = analysis.slots[j][backdrop].median;
      if (!a || !b) continue;
      const distance = deltaE(a, b);
      if (distance < limits.pairDeltaE) failures.push(`${nameOf(i)} 与 ${nameOf(j)}：${BACKDROP_LABEL[backdrop]}上色差 ${distance.toFixed(1)} 低于 ${limits.pairDeltaE}，不易分辨`);
    }
  }
  return failures;
}

/**
 * 防退化线：略低于 2026-10-17 在 macOS 26.5 隔离构建（纯色玻璃、中号、白天）上的实测最小值，用来发现“改调色板或画法后某个颜色变得更淡、更像邻居”，
 * 不是视觉标准。实测：白底身体中位对比度 1.21（黄）…1.57（紫）、默认冰蓝 1.38；黑底 5.18（紫）…7.55（黄）；
 * 身体色差最小：白底绿与薄荷 11.4、黑底橙与黄 13.6（调色板本身最小 27.2，半透明叠底后被压缩）。
 */
export const LIMITS = Object.freeze({ whiteMedianContrast: 1.15, blackMedianContrast: 4.8, pairDeltaE: 10 });

function main() {
  const dirArg = process.argv.find(a => a.startsWith('--dir='))?.slice(6);
  if (!dirArg) throw new Error('需要 --dir=（appearance-snapshot.mjs --all-colors 的输出目录）');
  const images = SLOT_NAMES.map((_, index) => decodePng(resolve(dirArg, `color-${index}.png`)));
  const analysis = analyze(images);
  console.log('色位   身体像素   白底 中位/p98 对比度   黑底 中位/p98 对比度   身体颜色(白底) 中位 RGB');
  analysis.slots.forEach((slot, index) => {
    const w = slot.white, b = slot.black;
    console.log(`${nameOf(index).padEnd(10)} ${String(w.count).padStart(6)}   ${w.contrast.p50.toFixed(2)} / ${w.contrast.p98.toFixed(2)}          ${b.contrast.p50.toFixed(2)} / ${b.contrast.p98.toFixed(2)}         ${w.median?.map(Math.round).join(',')}`);
  });
  for (const backdrop of ['white', 'black']) {
    const c = analysis.closest[backdrop];
    if (c) console.log(`${BACKDROP_LABEL[backdrop]}上最相近的一对：${nameOf(c.a)} 与 ${nameOf(c.b)}，色差 ${c.deltaE.toFixed(1)}`);
  }
  const failures = evaluate(analysis, LIMITS);
  if (failures.length) { console.log(`\n未达防退化线（${JSON.stringify(LIMITS)}）：`); failures.forEach(text => console.log(`  ✗ ${text}`)); process.exit(1); }
  console.log(`\n✓ 全部达到防退化线 ${JSON.stringify(LIMITS)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
