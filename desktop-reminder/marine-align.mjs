// 写实动物“桌面端与水族馆对齐”检查：同一份 ops，桌面端用 CoreGraphics（marine-rig-painter.swift，经产品里同一个 JellyView.draw）画，
// 水族馆用 Canvas 2D（js/marine-rig-canvas.js，真实 Chromium）画，逐像素比较两张图。
//   node desktop-reminder/marine-align.mjs                       编译渲染工具 → 两边各画一遍 → 比较（四种动物 × 一组姿态）
//   node desktop-reminder/marine-align.mjs --species=manta       只查一种
//   node desktop-reminder/marine-align.mjs --bin=/tmp/x/species-render --keep --out=/tmp/x     用已有的渲染工具；保留两边的 PNG 与差异图
//   node desktop-reminder/marine-align.mjs --verbose             打印每个用例的实测数字
//
// 为什么要有它：marine-rig-parity（test/marine-rig-parity.test.mjs）证明两边求值出来的 ops 逐点相同（差 5e-14），但不证明“画出来的像素”一致——
// 画笔各有一份（Swift CoreGraphics、JS Canvas），渐变方向、描边线宽与线帽、填充规则、阶段色混入、放置变换都可能在其中一边写错。
// 这里的期望值**不是**从 Swift 或 JS 的画笔里抄来的：放置变换按规格（SpeciesPlacement 的文档：并集居中、顶端离窗口底边 91 pt、先转俯仰再翻朝向）
// 在本文件里独立写一份，加到 Canvas 一边；桌面一边是产品自己的 JellyView.draw 经 species-render 离屏渲染出来的图。
// 两边不是同一个光栅器（CoreGraphics 对 Skia），边缘抗锯齿与渐变抖动会有差异，所以判据是统计量（不是逐像素相等），阈值来自实测。
//
// 需要：macOS 的 Swift 编译器（xcrun swiftc）、Playwright 的 playwright-core 与 Chromium（环境变量 PLAYWRIGHT_CORE_DIR 指向含 playwright-core 的 node_modules，
// 默认 ~/.hermes/hermes-agent/node_modules）。不连接网络、不读写扩展数据、不碰真实 Chrome 配置（用独立的临时 Chromium 配置）。
// 没有验证：真实窗口里的合成（半透明叠在壁纸上）、动画帧之间的过渡、真实 GPU、多显示器。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compileHarness, runHarness, VIEW } from './species-render.mjs';
import { decodePng } from './png-decode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const require = createRequire(import.meta.url);
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');

// ---------- 规格（与产品一致；改了任何一个都要同步 marine-rig.swift / jelly-species.swift 与下面的检查） ----------

/** 骨架体长 100 单位对应的窗口点数（JellySpecies.rigBodyLength；companion-selftest 与 test/marine-rig-parity 对照）。 */
export const BODY_LENGTH = Object.freeze({ hammer: 70, manta: 74, turtle: 64, whaleshark: 84 });
export const TOP_ABOVE_BOTTOM = 91;
export const STAGE_TINT_STRENGTH = 0.34;
export const SLOT = 5;                       // 用例里的颜色位：写实动物不用它，只有阶段色混入取它作为目标色（色位 5 = 冰蓝）
export const LIMITS = Object.freeze({
  minIou: 0.985,          // 两边 alpha ≥ 128 的轮廓的交并比下限（实测最小 0.9921：鲸鲨与小锤头鲨的尾鳍边缘最多）
  meanDiff: 3.0,          // 两边都叠在白底上之后，并集像素里每个通道平均绝对差的上限（0–255；实测 0.5–2.1，鲸鲨的斑点最多所以最大）
  strongDiff: 48,         // “明显不同”的像素：最大通道差超过它
  strongShare: 0.005,     // 明显不同的像素占并集的比例上限（实测最大 0.17%，都在边缘抗锯齿上）
  controlGap: 0.015,      // 对照：故意错位的姿态，轮廓交并比必须比正确姿态至少低这么多（否则这个检查分辨不出姿态画错）
});

/** 骨架坐标 → Canvas 画布（CSS 像素，y 向下）的仿射矩阵 [a, b, c, d, e, f]（X = a·x + c·y + e，Y = b·x + d·y + f）。独立按放置规格写，不读 Swift。 */
export function placementMatrix(species, { facing = 1, pitch = 0, bounds, width = VIEW.width, height = VIEW.height } = {}) {
  const unit = BODY_LENGTH[species] / 100;
  // 并集包围盒（骨架单位、y 向下）→ 几何坐标（缩放后、y 向上）里的中心与高度
  const midX = unit * (bounds.minX + bounds.maxX) / 2, midY = -unit * (bounds.minY + bounds.maxY) / 2;
  const unionHeight = unit * (bounds.maxY - bounds.minY);
  const targetX = width / 2, targetY = TOP_ABOVE_BOTTOM - unionHeight / 2;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return [facing * c * unit, -s * unit, facing * s * unit, c * unit,
    facing * (-c * midX + s * midY) + targetX, height + s * midX + c * midY - targetY];
}

/** 用例表：每种动物一组姿态（静止/中等幅度/满幅度、几个相位、朝左、俯仰、阶段色混入）。 */
export function buildCases(species) {
  const base = { species, colors: [SLOT], look: 'solid', realistic: true };
  const list = [
    ['rest', { rigPhase: 0, rigAmp: 0 }],
    ['phase0', { rigPhase: 0, rigAmp: 1 }],
    ['phase1', { rigPhase: 1.3, rigAmp: 1 }],
    ['phase2', { rigPhase: 2.6, rigAmp: 1 }],
    ['phase3', { rigPhase: 3.9, rigAmp: 1 }],
    ['phase4', { rigPhase: 5.2, rigAmp: 1 }],
    ['half', { rigPhase: 1.3, rigAmp: 0.5 }],
    ['left', { rigPhase: 2.6, rigAmp: 1, facing: -1 }],
    ['pitchUp', { rigPhase: 1.3, rigAmp: 1, pitch: 0.3 }],
    ['pitchDownLeft', { rigPhase: 3.9, rigAmp: 0.8, pitch: -0.25, facing: -1 }],
    ['stage', { rigPhase: 1.3, rigAmp: 1, stageMix: 1 }],
    ['stageHalf', { rigPhase: 3.9, rigAmp: 1, stageMix: 0.5, facing: -1 }],
  ];
  return list.map(([tag, extra]) => ({ name: `${species}-${tag}`, ...base, ...extra }));
}

// ---------- Canvas 一侧（真实 Chromium） ----------

function loadPlaywright() {
  const dir = process.env.PLAYWRIGHT_CORE_DIR || join(homedir(), '.hermes/hermes-agent/node_modules');
  try { return createRequire(join(dir, 'x.js'))('playwright-core'); }
  catch (error) { throw new Error(`找不到 playwright-core（在 ${dir}）：请设置 PLAYWRIGHT_CORE_DIR 指向含 playwright-core 的 node_modules。${error.message}`); }
}

/** 在页面里按规格摆放并画 ops，返回每个用例的 RGBA 字节（base64）。ops 与 JS 求值器在页面里现算（和水族馆同一份 js）。 */
async function renderCanvas(cases, palette) {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
    const errors = [];
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
    for (const file of ['js/jelly-species-shapes.js', 'js/marine-rig.js', 'js/marine-rig-data.js', 'js/marine-rig-canvas.js']) await page.addScriptTag({ content: readFileSync(join(ROOT, file), 'utf8') });
    const requests = cases.map(item => {
      const rig = Data.rig(item.species);
      const bounds = Rig.unionBounds(rig, 12);
      return {
        name: item.name, species: item.species,
        pose: { phase: item.rigPhase ?? 0, amp: item.rigAmp ?? 0, turn: 0, lod: 2 },
        matrix: placementMatrix(item.species, { facing: item.facing ?? 1, pitch: item.pitch ?? 0, bounds }),
        tint: (item.stageMix ?? 0) > 0.004 ? { rgb: palette[SLOT], amount: STAGE_TINT_STRENGTH * Math.min(1, item.stageMix) } : null,
      };
    });
    const result = await page.evaluate(({ requests, width, height, scale }) => {
      const out = {};
      const canvas = document.createElement('canvas');
      canvas.width = width * scale; canvas.height = height * scale;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      for (const request of requests) {
        const rig = window.MarineRigData.rig(request.species);
        const evaluation = window.MarineRig.evaluate(rig, request.pose);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const m = request.matrix;
        ctx.setTransform(scale * m[0], scale * m[1], scale * m[2], scale * m[3], scale * m[4], scale * m[5]);
        window.MarineRigCanvas.drawOps(ctx, evaluation.ops, { alpha: 1, tint: request.tint });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let binary = '';
        for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
        out[request.name] = btoa(binary);
      }
      return out;
    }, { requests, width: VIEW.width, height: VIEW.height, scale: VIEW.scale });
    if (errors.length) throw new Error(`页面报错：${errors.join('；')}`);
    return Object.fromEntries(Object.entries(result).map(([name, text]) => [name, { width: VIEW.width * VIEW.scale, height: VIEW.height * VIEW.scale, pixels: Uint8Array.from(Buffer.from(text, 'base64')) }]));
  } finally { await browser.close(); }
}

// ---------- 比较 ----------

/** 两张 RGBA（直通 alpha）图的比较：轮廓交并比（alpha ≥ 128）、叠在白底上的平均/明显差异。 */
export function compareImages(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`尺寸不同：${a.width}×${a.height} 对 ${b.width}×${b.height}`);
  const n = a.width * a.height;
  let both = 0, either = 0, union = 0, sum = 0, strong = 0, maxDiff = 0;
  const diffs = [];
  for (let i = 0; i < n; i++) {
    const aa = a.pixels[i * 4 + 3], ba = b.pixels[i * 4 + 3];
    const ina = aa >= 128, inb = ba >= 128;
    if (ina && inb) both++;
    if (ina || inb) either++;
    if (aa === 0 && ba === 0) continue;
    union++;
    let worst = 0;
    for (let k = 0; k < 3; k++) {
      const ca = (a.pixels[i * 4 + k] * aa + 255 * (255 - aa)) / 255, cb = (b.pixels[i * 4 + k] * ba + 255 * (255 - ba)) / 255;
      const d = Math.abs(ca - cb); sum += d; if (d > worst) worst = d;
    }
    diffs.push(worst);
    if (worst > LIMITS.strongDiff) strong++;
    if (worst > maxDiff) maxDiff = worst;
  }
  diffs.sort((p, q) => p - q);
  return { iou: either ? both / either : 1, meanDiff: union ? sum / (union * 3) : 0, strongShare: union ? strong / union : 0, maxDiff, p99: diffs.length ? diffs[Math.floor(diffs.length * 0.99)] : 0, union };
}

/** 检查一个动物：返回 { rows, failed }，rows 是每个用例的实测与判定。controls：故意错位的比较（native 的 X 对 canvas 的 Y），必须明显更差。 */
export function checkSpecies(species, native, canvas) {
  const rows = [];
  const cases = buildCases(species);
  for (const item of cases) {
    const stats = compareImages(native[item.name], canvas[item.name]);
    const failures = [];
    if (stats.iou < LIMITS.minIou) failures.push(`轮廓交并比 ${stats.iou.toFixed(4)} < ${LIMITS.minIou}`);
    if (stats.meanDiff > LIMITS.meanDiff) failures.push(`平均差 ${stats.meanDiff.toFixed(2)} > ${LIMITS.meanDiff}`);
    if (stats.strongShare > LIMITS.strongShare) failures.push(`明显不同的像素占 ${(stats.strongShare * 100).toFixed(2)}% > ${LIMITS.strongShare * 100}%`);
    rows.push({ name: item.name, kind: '对齐', stats, failures });
  }
  // 对照：错位的姿态必须比对齐的更差，否则说明“对齐”这个结论分辨不出姿态画错
  const pairs = [['phase1', 'phase3'], ['phase0', 'phase2'], ['left', 'phase2'], ['pitchUp', 'phase1']];
  for (const [x, y] of pairs) {
    const wrong = compareImages(native[`${species}-${x}`], canvas[`${species}-${y}`]);
    const right = rows.find(row => row.name === `${species}-${x}`).stats;
    const failures = right.iou - wrong.iou < LIMITS.controlGap ? [`错位对照没有明显更差：对齐 ${right.iou.toFixed(4)}，错位 ${wrong.iou.toFixed(4)}`] : [];
    rows.push({ name: `${species}-${x} 对照 ${y}`, kind: '对照', stats: wrong, failures });
  }
  // 阶段色混入真的发生了：同一姿态下混入 1 的图与不混的图必须明显不同（否则“阶段色”这几个用例是空检查）
  const plain = compareImages(canvas[`${species}-phase1`], canvas[`${species}-stage`]);
  rows.push({ name: `${species}-stage 与 phase1 不同`, kind: '对照', stats: plain, failures: plain.meanDiff < 1.0 ? [`阶段色混入后平均差只有 ${plain.meanDiff.toFixed(2)}（应 ≥ 1.0）`] : [] });
  return { rows, failed: rows.reduce((sum, row) => sum + row.failures.length, 0) };
}

// ---------- 命令行 ----------

async function main() {
  const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const flag = name => process.argv.includes(`--${name}`);
  const wanted = arg('species') ? [arg('species')] : Data.IDS;
  const keep = flag('keep'), outDir = arg('out') ? resolve(arg('out')) : mkdtempSync(join(tmpdir(), 'marine-align-'));
  mkdirSync(outDir, { recursive: true });
  let binary = arg('bin');
  if (!binary) { console.log('编译渲染工具……'); binary = compileHarness(outDir); }
  const paletteResult = spawnSync(binary, ['--palette'], { encoding: 'utf8' });
  if (paletteResult.status !== 0) throw new Error('渲染工具没有给出调色板');
  const palette = JSON.parse(paletteResult.stdout);
  let failed = 0, total = 0;
  for (const species of wanted) {
    if (!BODY_LENGTH[species]) throw new Error(`${species} 没有写实版，无法检查`);
    const cases = buildCases(species);
    const manifest = runHarness(binary, cases, outDir);
    const native = {};
    for (const entry of manifest) {
      if (entry.species !== species) throw new Error(`${entry.name}：请求 ${species}，原生实际画的是 ${entry.species}`);
      if (entry.realistic !== true) throw new Error(`${entry.name}：请求写实版，渲染工具报告实际画的不是写实版（${entry.realistic}）`);
      native[entry.name] = decodePng(entry.file);
    }
    const canvas = await renderCanvas(cases, palette);
    const report = checkSpecies(species, native, canvas);
    console.log(`\n== ${species} ==`);
    for (const row of report.rows) {
      total++;
      const verdict = row.failures.length ? '✗' : '✓';
      console.log(`${verdict} [${row.kind}] ${row.name}${row.failures.length || flag('verbose') ? `  交并比 ${row.stats.iou.toFixed(4)} 平均差 ${row.stats.meanDiff.toFixed(2)} 明显差异 ${(row.stats.strongShare * 100).toFixed(2)}% 最大差 ${row.stats.maxDiff.toFixed(0)} p99 ${row.stats.p99.toFixed(0)}` : ''}`);
      for (const failure of row.failures) console.log(`    ${failure}`);
    }
    failed += report.failed;
    if (keep || arg('out')) {
      for (const [name, image] of Object.entries(canvas)) writeFileSync(join(outDir, `${name}.canvas.rgba`), image.pixels);
    }
  }
  if (!keep && !arg('out')) rmSync(outDir, { recursive: true, force: true });
  console.log(`\n${failed ? `✗ ${failed} 项没有通过（共 ${total} 项）` : `✓ 全部 ${total} 项通过`}`);
  process.exit(failed ? 1 : 0);
}

const invokedDirectly = () => { try { return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } };
if (invokedDirectly()) main().catch(error => { console.error(error.message); process.exit(2); });
