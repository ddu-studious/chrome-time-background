// 动物绘制层的“画对了没有”检查：把产品里同一个 JellyView.draw 画进离屏位图（species-render.swift），再独立量像素。
//   node desktop-reminder/species-render.mjs                        编译 → 渲染 → 逐项检查（默认检查 JS 形状数据里的全部动物）
//   node desktop-reminder/species-render.mjs --species=hammer       只查一种
//   node desktop-reminder/species-render.mjs --keep --out=/tmp/x    保留渲染出来的 PNG（默认用完删除）
//   node desktop-reminder/species-render.mjs --sheet=/tmp/x.png     另外合成一张联系表（白底；--sheet-dark 用深色底），给人看
//   node desktop-reminder/species-render.mjs --bin=/tmp/x/species-render   跳过编译，用已有的可执行文件
//
// 为什么要有它：纯逻辑自测（companion-selftest.swift）核对的是几何、放置、姿态的数值，JS↔Swift 对拍核对的是颜料与形状数据；
// 都不证明“画出来的像素”用对了颜料、方向和变换（例如渐变画反了、俯仰符号错了、肢体取色把头尾弄反）。这里是对 AppKit 绘制层的独立检查：
// 期望值全部由 js/jelly-species-shapes.js 的形状数据加“规格里写明的规则”在 Node 里独立算出，不读 Swift 的几何，也不拿绘制代码的常数当答案。
//
// 口径（写清楚以免被误读）：
//  · 轮廓：期望轮廓 = 形状数据按（朝向、俯仰、划水）放到窗口里的多边形并集，外扩半个描边宽（0.55 pt）；渲染轮廓 = alpha ≥ 0.5 的像素。
//    判定是“与期望轮廓的交并比 ≥ MIN_IOU”，并且在一组备选姿态（朝向 ±1 × 俯仰 −0.35/0/0.35 × 划水 −1/0/1，加上本例的姿态）里，
//    本例的期望姿态必须是交并比最高的，领先第二名至少 MIN_MARGIN——否则这个检查分辨不出符号错了（例如划水方向反了只差几个像素）；
//  · 颜色：只比较色相，不比较明暗（鳍的上浅下深、躯干的自下而上渐变、白色高光叠加都改变明度，不改变色相）。取样点由形状数据自动选：
//    每个躯干/肢体部件里“离自己边缘最远、又不被后画的部件盖住、避开眼睛腮红”的点；躯干另外沿身体长轴取 10% / 50% / 90% 三个点核对渐变方向。
//    期望色相按规格里的规则（纯色全身主色；双色躯干主色、肢体第二色；渐变躯干由尾到头主色→第二色、肢体取两者 7:3；七彩躯干与肢体由尾到头主→第二→第三）
//    用调色板（由渲染工具从产品里读出来，不在本文件抄一份）混出来；
//  · 眼睛：醒着时眼中心是深色实心；睡着时变成一道弧线（眼周深色像素明显变少但不为零）；
//  · 窗口外圈：夜晚荧光不得碰到窗口边缘（最外 8 pt alpha ≤ 1），白天与醒着时轮廓外不得有任何多余的像素；睡着时才有 “z”；
//  · 响铃涟漪：工具固定开着“减少动态效果”，所以画的是两圈静止的圈（半径 = 20 + (外半径 − 20) × 0.35 / 0.75，透明度 0.30 / 0.18）。
//    圆心必须是动物的中心，外半径按规格 = 不超过 62、最外圈离窗口最近一边不少于 8 点、不小于 24（以动物中心离四边的最近距离算，不读绘制代码里的数字）；
//    判定看“径向剖面”：以动物中心为圆心，每 0.5 pt 一档，取该半径上不被动物盖住的像素 alpha 的中位数，找两个峰，位置与高度都要对上，且更外面没有别的圈；
//  · 浅色与深色外观：动物本身（没有气泡）的像素必须逐像素相同。
//  · 没有验证：真实窗口里的合成（半透明叠在壁纸上）、多显示器、真实鼠标跟随瞳孔、动画帧之间的过渡（只测静态姿态）。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng } from './png-decode.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const Shapes = createRequire(import.meta.url)('../js/jelly-species-shapes.js');

// ---------- 常量（与产品窗口一致；改窗口大小须同步 species-render.swift 的 viewSize） ----------

export const VIEW = Object.freeze({ width: 170, height: 150, scale: 2 });
export const TOP_ABOVE_BOTTOM = 91;        // SpeciesPlacement.topAboveWindowBottom（设计稿 §11 第 2 条：动物悬在窗口标准高度）
export const STROKE_HALF = 0.55;           // 躯干描边 1.1 pt 的一半（肢体 1.0 的一半是 0.5，取大的）
export const LOOKS = Object.freeze({ solid: [5], duo: [5, 0], blend: [5, 0], rainbow: [5, 0, 3] });
export const LIMITS = Object.freeze({
  minIou: 0.97,          // 渲染轮廓与期望轮廓的交并比下限（小锤头鲨实测 0.989–0.993；描边、抗锯齿与多边形近似会带来 1% 左右的差）
  minIouTurning: 0.92,   // 转身途中（朝向 0.5，实测 0.948）：水平缩放同样把描边压窄，期望轮廓却按固定宽度外扩，窄身上的相对误差更大
  minMargin: 0.05,       // 期望姿态领先第二名的最小交并比差（小锤头鲨实测约 0.105：划水方向反了、俯仰符号反了、朝向翻错都只差这么多）
  hueTolerance: 14,      // 色相容差（度）
  minChroma: 0.03,       // 取样点的最小色度（比这更接近灰白色相就不可靠；渐变中点是两个互补色的混合，色度只有约 0.05）
  hueGapMin: 25,         // 用到的色位两两色相差下限（否则这个检查分辨不出颜色画错）
  eyeCentre: 0.5,        // 醒着时眼中心的亮度上限（实测 0.34：瞳孔高光盖住了中心的一部分；睡着时中心是身体颜色，实测 0.73 以上）
  ink: 0.4,              // 数“深色像素”用的亮度上限（身体描边的亮度约 0.49，不能算进去）
  lightGap: 0.01,        // 部件上三分之一比下三分之一亮的最小亮度差（小锤头鲨实测躯干 0.017–0.037、肢体见 main 的 --verbose 输出；画反了是负数）
  lightMinPixels: 60,    // 判明暗至少要有这么多可用像素（上、下三分之一合计）
  borderAlpha: 1,        // 夜晚光晕在窗口最外 8 pt 内的 alpha 上限（0–255）
  strayAlpha: 20,        // 轮廓外“多余像素”的 alpha 门槛（0–255）
  rippleRadius: 1.0,     // 涟漪峰的半径与期望的最大差（点；线宽 2 pt，峰落在 0.5 pt 一档上）
  rippleAlpha: 8,        // 涟漪峰的 alpha 与期望的最大差（0–255；两圈期望 76.5 与 45.9）
  rippleSamples: 40,     // 每个半径档至少要有这么多个不被动物盖住的采样角度，否则该档不参与
  rippleOutside: 2.5,    // 最外一圈之外不允许再有圈：超出最外圈半径多少点以内的 alpha 起伏不算（线宽 2 pt 的外沿加抗锯齿）
});
const BORDER_PT = 8;

// ---------- 几何：形状数据 → 窗口里的多边形 ----------

/** 把一个部件的命令展开成若干子路径（折线，16 点/段贝塞尔，与 Shapes.SAMPLES 一致）；点是原生坐标（y 向上）。 */
export function flatten(cmds) {
  const subpaths = [];
  let current = null, start = null, line = null;
  const flush = () => { if (line && line.length > 2) subpaths.push(line); line = null; };
  for (const { cmd, pts } of cmds) {
    if (cmd === 'M') { flush(); current = pts[0]; start = pts[0]; line = [pts[0]]; }
    else if (cmd === 'L') { line.push(pts[0]); current = pts[0]; }
    else if (cmd === 'C' || cmd === 'Q') {
      for (let i = 1; i <= Shapes.SAMPLES; i++) {
        const t = i / Shapes.SAMPLES, s = 1 - t;
        line.push(cmd === 'C'
          ? [s * s * s * current[0] + 3 * s * s * t * pts[0][0] + 3 * s * t * t * pts[1][0] + t * t * t * pts[2][0], s * s * s * current[1] + 3 * s * s * t * pts[0][1] + 3 * s * t * t * pts[1][1] + t * t * t * pts[2][1]]
          : [s * s * current[0] + 2 * s * t * pts[0][0] + t * t * pts[1][0], s * s * current[1] + 2 * s * t * pts[0][1] + t * t * pts[1][1]]);
      }
      current = pts[pts.length - 1];
    } else if (cmd === 'Z') { current = start; flush(); }
  }
  flush();
  return subpaths;
}

const rotateAbout = (p, pivot, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle), dx = p[0] - pivot[0], dy = p[1] - pivot[1];
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
};

/**
 * 某种动物在某个姿态下的“窗口坐标”几何（点，y 向上，原点在窗口左下角）：每个部件的多边形、眼睛、腮红。
 * 放置规则（设计稿 §5）：先把各相位并集包围盒的中心移到原点，再按俯仰转（鼻子朝上为正），再按朝向水平翻转，最后放到
 * （窗口水平中心，并集顶端离窗口底边 91 pt）。划水：带 motion 的部件绕 pivot 转 maxAngle × wave。
 */
export function poseGeometry(id, { facing = 1, pitch = 0, wave = 0 } = {}) {
  const shape = Shapes.native(id), union = Shapes.union(id);
  if (!shape || !union) throw new Error(`没有 ${id} 的形状数据`);
  const mid = [(union.minX + union.maxX) / 2, (union.minY + union.maxY) / 2];
  const target = [VIEW.width / 2, TOP_ABOVE_BOTTOM - (union.maxY - union.minY) / 2];
  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  const place = p => {
    const x = p[0] - mid[0], y = p[1] - mid[1];
    return [(x * cos - y * sin) * facing + target[0], x * sin + y * cos + target[1]];
  };
  const parts = shape.parts.map(part => ({
    role: part.role, u: part.u,
    polygons: flatten(part.cmds).map(poly => poly.map(p => place(part.motion ? rotateAbout(p, part.motion.pivot, part.motion.maxAngle * wave) : p))),
  }));
  return { parts, eyes: shape.eyes.at.map(place), eyeRadius: shape.eyes.r, blush: shape.blush.map(b => ({ center: place([b[0], b[1]]), rx: b[2], ry: b[3] })), union, mid, target };
}

// ---------- 像素：多边形光栅化、轮廓比较 ----------

export const toPixel = (x, y) => [x * VIEW.scale, (VIEW.height - y) * VIEW.scale];      // 窗口点（y 向上）→ 图像像素（y 向下，连续坐标）

/** 偶奇规则扫描线填充：polygons 是窗口点坐标的多边形列表，返回 width×height 的 0/1 数组（以像素中心判定）。 */
export function rasterize(polygons, width = VIEW.width * VIEW.scale, height = VIEW.height * VIEW.scale) {
  const mask = new Uint8Array(width * height);
  const polys = polygons.map(poly => poly.map(p => toPixel(p[0], p[1])));
  for (let row = 0; row < height; row++) {
    const yc = row + 0.5, xs = [];
    for (const poly of polys) {
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let col = from; col <= to; col++) mask[row * width + col] = 1;
    }
  }
  return mask;
}

/** 十字形膨胀 steps 次（半径 ≈ steps 个像素）。 */
export function dilate(mask, width, height, steps = 1) {
  let current = mask;
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (current[y * width + x]) continue;
      if ((x > 0 && current[y * width + x - 1]) || (x < width - 1 && current[y * width + x + 1]) || (y > 0 && current[(y - 1) * width + x]) || (y < height - 1 && current[(y + 1) * width + x])) next[y * width + x] = 1;
    }
    current = next;
  }
  return current;
}

export const alphaMask = (image, threshold = 128) => {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i++) mask[i] = image.pixels[i * 4 + 3] >= threshold ? 1 : 0;
  return mask;
};

export function iou(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (x && y) both++; if (x || y) either++; }
  return either ? both / either : 1;
}

/**
 * 全部部件的并集。必须逐个部件光栅化再取或：部件互相重叠（躯干盖住鳍根、高光在躯干里面），
 * 一起用偶奇规则填会把重叠处挖成洞（部件内部的多个子路径，如鲸鲨的斑点，才是偶奇规则的用处）。
 */
export function unionMask(geometry, width, height) {
  const mask = new Uint8Array(width * height);
  for (const part of geometry.parts) {
    const one = rasterize(part.polygons, width, height);
    for (let i = 0; i < mask.length; i++) if (one[i]) mask[i] = 1;
  }
  return mask;
}

/** 某姿态的期望轮廓（所有部件并集，外扩半个描边宽）。 */
export function expectedSilhouette(id, pose, image) {
  return dilate(unionMask(poseGeometry(id, pose), image.width, image.height), image.width, image.height, Math.round(STROKE_HALF * VIEW.scale));
}

export const POSE_GRID = (() => {
  const out = [];
  for (const facing of [1, -1]) for (const pitch of [-0.35, 0, 0.35]) for (const wave of [-1, 0, 1]) out.push({ facing, pitch, wave });
  return out;
})();
const poseKey = pose => `${pose.facing}/${pose.pitch}/${pose.wave}`;

/**
 * 轮廓判定：返回 { iou, best, margin, ranking }。best 是备选姿态里交并比最高的；margin 是期望姿态领先“其余备选里最高者”的差。
 */
export function judgeSilhouette(id, image, pose) {
  const rendered = alphaMask(image);
  const hypotheses = [pose, ...POSE_GRID.filter(candidate => poseKey(candidate) !== poseKey(pose))];
  const scores = hypotheses.map(hypothesis => ({ pose: hypothesis, iou: iou(rendered, expectedSilhouette(id, hypothesis, image)) }));
  const own = scores[0].iou, others = scores.slice(1).sort((a, b) => b.iou - a.iou);
  return { iou: own, best: [...scores].sort((a, b) => b.iou - a.iou)[0].pose, margin: own - (others[0]?.iou ?? 0), runnerUp: others[0] };
}

// ---------- 颜色：取样点与期望色相 ----------

export function hueOf([r, g, b]) {
  const high = Math.max(r, g, b), low = Math.min(r, g, b), span = high - low;
  if (!span) return { hue: 0, chroma: 0 };
  let h;
  if (high === r) h = 60 * (((g - b) / span) % 6);
  else if (high === g) h = 60 * ((b - r) / span + 2);
  else h = 60 * ((r - g) / span + 4);
  return { hue: (h + 360) % 360, chroma: span };
}
export const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
export const mix = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);

/** 规格里的取色规则（颜料 a/b/c 与花纹 → 躯干沿长轴 f、肢体沿 u 的颜色）。 */
export function bodyTone(look, [a, b, c], f) {
  if (look === 'solid' || look === 'duo') return a;
  if (look === 'blend') return mix(a, b, f);
  return f < 0.5 ? mix(a, b, f * 2) : mix(b, c, (f - 0.5) * 2);
}
export function limbToneOf(look, [a, b, c], u) {
  if (look === 'solid') return a;
  if (look === 'duo') return b;
  if (look === 'blend') return mix(a, b, 0.7);
  return u < 0.5 ? mix(a, b, u * 2) : mix(b, c, (u - 0.5) * 2);
}

const segmentDistance = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
export function insidePolygons(p, polygons) {
  let inside = false;
  for (const poly of polygons) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}
export const edgeDistance = (p, polygons) => {
  let best = Infinity;
  for (const poly of polygons) for (let i = 0; i < poly.length; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
};

/**
 * 取样点：对每个躯干/肢体部件，在网格上找“在自己里面、不在后画的任何部件里、离所有相关边缘最远、避开眼睛与腮红”的点。
 * 躯干另外沿长轴 10%/50%/90% 各取一个（f 是该点在“全部躯干部件包围盒”里的相对位置，尾 0 → 头 1，与规格一致）。
 * 返回 [{ part, role, u, f, point, clearance }]，point 是静态姿态（朝右、不俯仰、不划水）的窗口点。
 */
export function samplePoints(id, { minClearance = 1.1, step = 0.5 } = {}) {
  const geometry = poseGeometry(id);
  const { parts, eyes, eyeRadius, blush } = geometry;
  const avoid = point => eyes.some(e => Math.hypot(point[0] - e[0], point[1] - e[1]) < eyeRadius * 1.5 + 1) || blush.some(b => Math.hypot((point[0] - b.center[0]) / (b.rx + 1), (point[1] - b.center[1]) / (b.ry + 1)) < 1);
  const bodyPolys = parts.filter(p => p.role === 'body').flatMap(p => p.polygons);
  const bodyBox = bodyPolys.flat().reduce((box, p) => ({ minX: Math.min(box.minX, p[0]), maxX: Math.max(box.maxX, p[0]), minY: Math.min(box.minY, p[1]), maxY: Math.max(box.maxY, p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const clearanceAt = (point, index) => {
    const own = parts[index].polygons;
    if (!insidePolygons(point, own)) return -1;
    const later = parts.slice(index + 1).flatMap(p => p.polygons);
    if (later.length && (insidePolygons(point, later) || edgeDistance(point, later) < minClearance)) return -1;
    if (avoid(point)) return -1;
    return edgeDistance(point, own);
  };
  const out = [];
  const bounds = Shapes.union(id);
  const scan = (index, accept) => {
    let best = null;
    for (let x = geometry.target[0] - (bounds.maxX - bounds.minX) / 2 - 2; x <= geometry.target[0] + (bounds.maxX - bounds.minX) / 2 + 2; x += step) {
      for (let y = geometry.target[1] - (bounds.maxY - bounds.minY) / 2 - 2; y <= geometry.target[1] + (bounds.maxY - bounds.minY) / 2 + 2; y += step) {
        if (accept && !accept([x, y])) continue;
        const clearance = clearanceAt([x, y], index);
        if (clearance >= minClearance && (!best || clearance > best.clearance)) best = { point: [x, y], clearance };
      }
    }
    return best;
  };
  parts.forEach((part, index) => {
    if (part.role !== 'body' && part.role !== 'limb') return;
    const found = scan(index);
    if (found) out.push({ part: index, role: part.role, u: part.u, f: null, point: found.point, clearance: found.clearance });
  });
  const centreY = (bodyBox.minY + bodyBox.maxY) / 2, band = (bodyBox.maxY - bodyBox.minY) * 0.2;
  for (const f of [0.1, 0.5, 0.9]) {
    const wantedX = bodyBox.minX + f * (bodyBox.maxX - bodyBox.minX);
    let best = null;
    parts.forEach((part, index) => {
      if (part.role !== 'body') return;
      const found = scan(index, p => Math.abs(p[0] - wantedX) <= 1 && Math.abs(p[1] - centreY) <= band);
      if (found && (!best || found.clearance > best.clearance)) best = { ...found, part: index };
    });
    if (best) out.push({ part: best.part, role: 'body', u: null, f, point: best.point, clearance: best.clearance });
  }
  return out;
}

/** 在图像上取一个窗口点周围的平均颜色（反预乘前的直通 RGB，0…1）；周围没有足够不透明的像素时返回 null。 */
export function colourAt(image, point, radius = 1) {
  const [cx, cy] = toPixel(point[0], point[1]);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const at = (y * image.width + x) * 4;
    if (image.pixels[at + 3] < 200) continue;
    r += image.pixels[at]; g += image.pixels[at + 1]; b += image.pixels[at + 2]; n++;
  }
  return n ? [r / n / 255, g / n / 255, b / n / 255] : null;
}

/** 把采样点按姿态放到窗口里（只处理朝向与俯仰，不含划水——取样点都不在会动的部件上，或者调用方用 wave=0）。 */
export function placePoint(id, point, { facing = 1, pitch = 0 } = {}) {
  const geometry = poseGeometry(id);
  const x = point[0] - geometry.target[0], y = point[1] - geometry.target[1];
  const cos = Math.cos(pitch), sin = Math.sin(pitch);
  return [(x * cos - y * sin) * facing + geometry.target[0], x * sin + y * cos + geometry.target[1]];
}

/**
 * 颜色判定：对每个取样点比较色相。返回 [{ name, ok, detail }]。
 * palette 是产品里的调色板（RGB 0…1，按色位序号）；colors 是该花纹用的色位。
 */
export function judgeColours(id, image, { look, colors, facing = 1, pitch = 0 }, palette, points = samplePoints(id)) {
  const tints = colors.map(slot => palette[slot]);
  while (tints.length < 3) tints.push(tints[tints.length - 1]);
  const results = [];
  for (const sample of points) {
    const expected = sample.role === 'body' && sample.f !== null ? bodyTone(look, tints, sample.f)
      : sample.role === 'body' ? bodyTone(look, tints, 0.0)                       // 整块躯干的“代表点”只在纯色/双色里按主色核对
      : limbToneOf(look, tints, sample.u);
    if (sample.role === 'body' && sample.f === null && (look === 'blend' || look === 'rainbow')) continue;
    const at = placePoint(id, sample.point, { facing, pitch });
    const rendered = colourAt(image, at);
    const name = `${sample.role}${sample.f !== null ? `@${Math.round(sample.f * 100)}%` : sample.u !== null ? `(u=${sample.u})` : ''}#${sample.part}`;
    if (!rendered) { results.push({ name, ok: false, detail: `取样点 (${at.map(v => v.toFixed(1))}) 没有不透明像素` }); continue; }
    const want = hueOf(expected), got = hueOf(rendered);
    const distance = hueDistance(want.hue, got.hue);
    results.push({ name, ok: got.chroma >= LIMITS.minChroma && distance <= LIMITS.hueTolerance, detail: `期望色相 ${want.hue.toFixed(0)}°，实际 ${got.hue.toFixed(0)}°（差 ${distance.toFixed(0)}°，色度 ${got.chroma.toFixed(2)}）` });
  }
  return results;
}

// ---------- 明暗：躯干上浅下深 ----------

/**
 * 部件的立体感：同一个部件里，上三分之一的平均亮度应高于下三分之一（躯干纯色/双色是自下而上由深到浅，渐变与七彩叠了一层自上而下的白；
 * 肢体是上浅下深的小渐变）。取该部件里（向内缩 2 像素避开描边、且不被后画的部件盖住的）像素；返回 { upper, lower, pixels }。
 * 只在朝右、不俯仰、不划水的静态姿态下用（那时渐变方向就是竖直的）。
 */
export function lightingOfPart(id, image, index) {
  const geometry = poseGeometry(id);
  const own = rasterize(geometry.parts[index].polygons, image.width, image.height);
  const later = new Uint8Array(own.length);
  for (const part of geometry.parts.slice(index + 1)) { const one = rasterize(part.polygons, image.width, image.height); for (let i = 0; i < later.length; i++) if (one[i]) later[i] = 1; }
  const covered = dilate(later, image.width, image.height, 2), edge = dilate(new Uint8Array(own.map(v => 1 - v)), image.width, image.height, 2);
  let top = Infinity, bottom = -Infinity;
  const usable = new Uint8Array(own.length);
  for (let i = 0; i < own.length; i++) {
    if (!own[i] || covered[i] || edge[i]) continue;
    usable[i] = 1;
    const row = Math.floor(i / image.width); top = Math.min(top, row); bottom = Math.max(bottom, row);
  }
  const third = (bottom - top + 1) / 3;
  const sums = { upper: [0, 0], lower: [0, 0] };
  for (let i = 0; i < usable.length; i++) {
    if (!usable[i]) continue;
    const row = Math.floor(i / image.width), group = row < top + third ? sums.upper : row >= bottom + 1 - third ? sums.lower : null;
    if (!group) continue;
    group[0] += luma([image.pixels[i * 4] / 255, image.pixels[i * 4 + 1] / 255, image.pixels[i * 4 + 2] / 255]); group[1]++;
  }
  return { upper: sums.upper[1] ? sums.upper[0] / sums.upper[1] : NaN, lower: sums.lower[1] ? sums.lower[0] / sums.lower[1] : NaN, pixels: sums.upper[1] + sums.lower[1] };
}
/** 第一个躯干部件（躯干）的立体感，见 lightingOfPart。 */
export const lightingOfTrunk = (id, image) => lightingOfPart(id, image, poseGeometry(id).parts.findIndex(part => part.role === 'body'));

// ---------- 眼睛、窗口外圈、睡觉标记 ----------

const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** 眼睛：醒着时眼中心是深色。返回 [{ name, ok, detail }]。 */
export function judgeEyes(id, image, pose) {
  const geometry = poseGeometry(id, pose);
  return geometry.eyes.map((eye, index) => {
    const rgb = colourAt(image, eye, 0);
    const dark = rgb ? luma(rgb) : 1;
    return { name: `eye#${index}`, ok: Boolean(rgb) && dark < LIMITS.eyeCentre, detail: rgb ? `眼中心亮度 ${dark.toFixed(2)}（应 < ${LIMITS.eyeCentre}）` : '眼中心没有不透明像素' };
  });
}

/** 眼周的深色像素个数（窗口点周围 ±3 pt 的方块里亮度 < ink 且不透明的像素）。 */
export function darkPixelsNear(image, point, half = 3) {
  const [cx, cy] = toPixel(point[0], point[1]);
  let count = 0;
  for (let y = Math.floor(cy - half * VIEW.scale); y <= Math.ceil(cy + half * VIEW.scale); y++) for (let x = Math.floor(cx - half * VIEW.scale); x <= Math.ceil(cx + half * VIEW.scale); x++) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const at = (y * image.width + x) * 4;
    if (image.pixels[at + 3] >= 128 && luma([image.pixels[at] / 255, image.pixels[at + 1] / 255, image.pixels[at + 2] / 255]) < LIMITS.ink) count++;
  }
  return count;
}

/** 窗口最外 BORDER_PT 点这一圈里的最大 alpha（0–255）。 */
export function borderMaxAlpha(image) {
  const band = BORDER_PT * VIEW.scale;
  let max = 0;
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (x >= band && y >= band && x < image.width - band && y < image.height - band) continue;
    max = Math.max(max, image.pixels[(y * image.width + x) * 4 + 3]);
  }
  return max;
}

/**
 * 轮廓（外扩 margin 个像素）之外 alpha ≥ threshold 的像素：个数与质心（窗口点，y 向上）。
 * 白天醒着应为 0 个，睡着时是 “z”，夜晚是光晕。
 */
export function strayStats(id, image, pose, { margin = 3, threshold = LIMITS.strayAlpha } = {}) {
  const shape = dilate(unionMask(poseGeometry(id, pose), image.width, image.height), image.width, image.height, margin + Math.round(STROKE_HALF * VIEW.scale));
  let count = 0, sx = 0, sy = 0;
  for (let i = 0; i < shape.length; i++) {
    if (shape[i] || image.pixels[i * 4 + 3] < threshold) continue;
    count++; sx += ((i % image.width) + 0.5) / VIEW.scale; sy += VIEW.height - (Math.floor(i / image.width) + 0.5) / VIEW.scale;
  }
  return { count, x: count ? sx / count : NaN, y: count ? sy / count : NaN };
}
export const strayPixels = (id, image, pose, options) => strayStats(id, image, pose, options).count;

export function identicalImages(a, b, tolerance = 0) {
  if (a.width !== b.width || a.height !== b.height) return { same: false, detail: `尺寸 ${a.width}×${a.height} 对 ${b.width}×${b.height}` };
  let count = 0, max = 0;
  for (let i = 0; i < a.pixels.length; i++) { const d = Math.abs(a.pixels[i] - b.pixels[i]); if (d > tolerance) { count++; max = Math.max(max, d); } }
  return { same: count === 0, detail: count ? `${count} 个字节相差超过 ${tolerance}，最大差 ${max}` : '逐像素一致' };
}

// ---------- 响铃涟漪 ----------

/** 涟漪的规格（JellyRingMotion 的文字说明）：内半径 20、外半径上限 62、静止两圈在外半径的 35% / 75% 处，透明度 0.30 / 0.18。 */
export const RIPPLE = Object.freeze({ inner: 20, outer: 62, margin: 8, minimumSpan: 4, fractions: [0.35, 0.75], alphas: [0.30, 0.18] });

/** 涟漪外半径：不超过 62，最外圈离窗口最近一边不少于 8 点，不小于 inner + 4（圆心取动物的中心）。 */
export function rippleOuter(centre) {
  const nearest = Math.min(centre[0], VIEW.width - centre[0], centre[1], VIEW.height - centre[1]);
  return Math.max(RIPPLE.inner + RIPPLE.minimumSpan, Math.min(RIPPLE.outer, nearest - RIPPLE.margin));
}

/**
 * 径向剖面：以 centre（窗口点，y 向上）为圆心，半径 from…to 每 step 点一档，取该半径上 360 个角度里
 * 不被 mask 盖住（且在图像内）的像素 alpha 的中位数（0–255）。样本不足 minSamples 的档记为 null。
 */
export function radialProfile(image, centre, mask, { from = 8, to = 70, step = 0.5, minSamples = LIMITS.rippleSamples } = {}) {
  const profile = [];
  for (let radius = from; radius <= to + 1e-9; radius += step) {
    const values = [];
    for (let degrees = 0; degrees < 360; degrees++) {
      const angle = degrees * Math.PI / 180;
      const [px, py] = toPixel(centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle));
      const x = Math.floor(px), y = Math.floor(py);
      if (x < 0 || y < 0 || x >= image.width || y >= image.height || mask[y * image.width + x]) continue;
      values.push(image.pixels[(y * image.width + x) * 4 + 3]);
    }
    values.sort((a, b) => a - b);
    profile.push({ radius, alpha: values.length >= minSamples ? values[values.length >> 1] : null, samples: values.length });
  }
  return profile;
}

/**
 * 判定一张画了涟漪的图：两圈的位置、高度、颜色，以及更外面没有第三圈。pose 是动物的姿态（用来排除被动物盖住的像素）。
 * 返回 { outer, rings: [{ expected, found, ok }], farthest, hueOk, ok, detail }。
 */
export function judgeRipples(id, image, pose, paletteSlot, palette) {
  const geometry = poseGeometry(id, pose), centre = geometry.target, outer = rippleOuter(centre);
  const covered = dilate(unionMask(geometry, image.width, image.height), image.width, image.height, Math.round((STROKE_HALF + 1) * VIEW.scale));
  const profile = radialProfile(image, centre, covered);
  const rings = RIPPLE.fractions.map((fraction, index) => {
    const expected = { radius: RIPPLE.inner + (outer - RIPPLE.inner) * fraction, alpha: RIPPLE.alphas[index] * 255 };
    let best = null;
    for (const entry of profile) if (entry.alpha !== null && Math.abs(entry.radius - expected.radius) <= 4 && (!best || entry.alpha > best.alpha)) best = entry;
    const ok = Boolean(best) && Math.abs(best.radius - expected.radius) <= LIMITS.rippleRadius && Math.abs(best.alpha - expected.alpha) <= LIMITS.rippleAlpha;
    return { expected, found: best, ok };
  });
  const lastExpected = rings[rings.length - 1].expected.radius;
  const farthest = profile.filter(entry => entry.alpha !== null && entry.alpha >= 4).reduce((max, entry) => Math.max(max, entry.radius), 0);
  const noOuter = farthest <= lastExpected + RIPPLE_STROKE_HALF + LIMITS.rippleOutside;
  // 颜色：峰半径 ±0.5 点的环里不被动物盖住、alpha 足够的像素，按 alpha 加权平均，色相要接近所选色位
  let hueOk = true, hueDetail = '';
  if (palette) {
    const ring = rings[0].found;
    let r = 0, g = 0, b = 0, weight = 0;
    if (ring) {
      for (let degrees = 0; degrees < 360; degrees++) {
        const angle = degrees * Math.PI / 180;
        const [px, py] = toPixel(centre[0] + ring.radius * Math.cos(angle), centre[1] + ring.radius * Math.sin(angle));
        const x = Math.floor(px), y = Math.floor(py);
        if (x < 0 || y < 0 || x >= image.width || y >= image.height || covered[y * image.width + x]) continue;
        const at = (y * image.width + x) * 4, a = image.pixels[at + 3];
        if (a < 20) continue;
        r += image.pixels[at] * a; g += image.pixels[at + 1] * a; b += image.pixels[at + 2] * a; weight += a;
      }
    }
    if (weight > 0) {
      const mean = [r / weight / 255, g / weight / 255, b / weight / 255], found = hueOf(mean), wanted = hueOf(palette[paletteSlot]);
      hueOk = found.chroma >= LIMITS.minChroma && hueDistance(found.hue, wanted.hue) <= LIMITS.hueTolerance;
      hueDetail = `；颜色色相 ${found.hue.toFixed(0)}°（期望约 ${wanted.hue.toFixed(0)}°，容差 ${LIMITS.hueTolerance}°）`;
    } else { hueOk = false; hueDetail = '；峰上没有可用于取色的像素'; }
  }
  const ok = rings.every(entry => entry.ok) && noOuter && hueOk;
  const describe = entry => `期望半径 ${entry.expected.radius.toFixed(2)} / alpha ${entry.expected.alpha.toFixed(1)}，实测 ${entry.found ? `${entry.found.radius.toFixed(1)} / ${entry.found.alpha}` : '无'}`;
  return { outer, centre, rings, farthest, noOuter, hueOk, ok, detail: `${rings.map(describe).join('；')}；最外有像素的半径 ${farthest.toFixed(1)}（应 ≤ ${(lastExpected + RIPPLE_STROKE_HALF + LIMITS.rippleOutside).toFixed(1)}）；外半径 ${outer.toFixed(1)}，圆心 (${centre[0].toFixed(1)}, ${centre[1].toFixed(1)})${hueDetail}` };
}
const RIPPLE_STROKE_HALF = 1;      // 涟漪线宽 2 pt

// ---------- 用例表 ----------

export function buildCases(species) {
  const cases = [];
  const base = { species };
  for (const [look, colors] of Object.entries(LOOKS)) {
    cases.push({ ...base, name: `${species}-${look}`, look, colors });
    cases.push({ ...base, name: `${species}-${look}-left`, look, colors, facing: -1 });
    cases.push({ ...base, name: `${species}-${look}-dark`, look, colors, dark: true });
  }
  for (const slot of [...new Set(Object.values(LOOKS).flat())]) cases.push({ ...base, name: `${species}-slot${slot}`, look: 'solid', colors: [slot] });
  const blend = { ...base, look: 'blend', colors: [5, 0] };
  cases.push({ ...blend, name: `${species}-pose-half`, facing: 0.5 });
  cases.push({ ...blend, name: `${species}-pose-up`, pitch: 0.35 });
  cases.push({ ...blend, name: `${species}-pose-up-left`, pitch: 0.35, facing: -1 });
  cases.push({ ...blend, name: `${species}-pose-down`, pitch: -0.35 });
  cases.push({ ...blend, name: `${species}-pose-wave-up`, wave: 1 });
  cases.push({ ...blend, name: `${species}-pose-wave-down`, wave: -1 });
  cases.push({ ...blend, name: `${species}-pose-wave-left`, wave: 1, facing: -1 });
  cases.push({ ...blend, name: `${species}-pose-all`, wave: -1, pitch: 0.35, facing: -1 });
  cases.push({ ...blend, name: `${species}-asleep`, asleep: true });
  cases.push({ ...blend, name: `${species}-asleep-left`, asleep: true, facing: -1 });
  cases.push({ ...blend, name: `${species}-night`, night: 1, dark: true });
  cases.push({ ...blend, name: `${species}-night-light`, night: 1 });
  cases.push({ ...base, name: `${species}-alert`, look: 'solid', colors: [5], alert: true });
  cases.push({ ...base, name: `${species}-ripples`, look: 'solid', colors: [5], ripples: true });
  return cases;
}

// ---------- 编译与运行 ----------

export function sourceList() {
  const text = readFileSync(join(HERE, 'build.mjs'), 'utf8');
  const match = text.match(/const sources = \[([^\]]+)\]/);
  if (!match) throw new Error('build.mjs 里找不到 sources 清单');
  return [...match[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]).filter(name => name !== 'main');
}

export function compileHarness(workDir) {
  const mainFile = join(workDir, 'main.swift');
  writeFileSync(mainFile, readFileSync(join(HERE, 'species-render.swift')));
  const binary = join(workDir, 'species-render');
  const result = spawnSync('/usr/bin/xcrun', ['swiftc', ...sourceList().map(name => join(HERE, `${name}.swift`)), mainFile, '-framework', 'AppKit', '-module-cache-path', join(tmpdir(), 'ctb-species-render-cache'), '-o', binary], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`编译渲染工具失败：\n${result.stderr || result.stdout}`);
  return binary;
}

export function runHarness(binary, cases, outDir) {
  const casesFile = join(outDir, 'cases.json');
  writeFileSync(casesFile, JSON.stringify(cases));
  const result = spawnSync(binary, [casesFile, outDir], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (result.status !== 0) throw new Error(`渲染失败（退出码 ${result.status}）：${result.stderr}`);
  return JSON.parse(result.stdout);
}

// ---------- 逐项检查 ----------

export function checkSpecies(species, images, palette) {
  const lines = [];
  const add = (group, name, ok, detail) => lines.push({ group, name, ok: Boolean(ok), detail });
  const imageOf = name => images[name];
  const find = name => { const image = imageOf(name); if (!image) throw new Error(`缺少渲染结果 ${name}`); return image; };

  // 0) 检查本身要有分辨力：用到的色位两两色相差、备选姿态的期望轮廓两两不同
  const slots = [...new Set(Object.values(LOOKS).flat())];
  let gap = Infinity;
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) gap = Math.min(gap, hueDistance(hueOf(palette[slots[i]]).hue, hueOf(palette[slots[j]]).hue));
  add('分辨力', '用到的色位两两色相差', gap >= LIMITS.hueGapMin, `最小 ${gap.toFixed(0)}°（要求 ≥ ${LIMITS.hueGapMin}°）`);

  // 1) 轮廓：朝向 / 俯仰 / 划水 / 转身
  const poses = [
    ['', { facing: 1, pitch: 0, wave: 0 }, `${species}-blend`],
    ['朝左', { facing: -1, pitch: 0, wave: 0 }, `${species}-blend-left`],
    ['转身途中（朝向 0.5）', { facing: 0.5, pitch: 0, wave: 0 }, `${species}-pose-half`, LIMITS.minIouTurning],
    ['抬头', { facing: 1, pitch: 0.35, wave: 0 }, `${species}-pose-up`],
    ['朝左抬头', { facing: -1, pitch: 0.35, wave: 0 }, `${species}-pose-up-left`],
    ['低头', { facing: 1, pitch: -0.35, wave: 0 }, `${species}-pose-down`],
    ['尾向上摆（wave +1）', { facing: 1, pitch: 0, wave: 1 }, `${species}-pose-wave-up`],
    ['尾向下摆（wave −1）', { facing: 1, pitch: 0, wave: -1 }, `${species}-pose-wave-down`],
    ['朝左划水（wave +1）', { facing: -1, pitch: 0, wave: 1 }, `${species}-pose-wave-left`],
    ['朝左低着尾抬头', { facing: -1, pitch: 0.35, wave: -1 }, `${species}-pose-all`],
  ];
  for (const [label, pose, name, minIou = LIMITS.minIou] of poses) {
    const verdict = judgeSilhouette(species, find(name), pose);
    const isBest = poseKey(verdict.best) === poseKey(pose);
    add('轮廓', label || '静止姿态', verdict.iou >= minIou && verdict.margin >= LIMITS.minMargin && isBest,
      `交并比 ${verdict.iou.toFixed(4)}（≥ ${minIou}），领先备选 ${verdict.margin.toFixed(4)}（≥ ${LIMITS.minMargin}）${isBest ? '' : `；最像的却是 ${poseKey(verdict.best)}`}，最接近的备选 ${poseKey(verdict.runnerUp.pose)} 交并比 ${verdict.runnerUp.iou.toFixed(4)}`);
  }

  // 2) 颜色：四种花纹 × 朝右/朝左 × 浅/深外观
  const points = samplePoints(species);
  add('颜色', '取样点数量', points.length >= 4, `${points.length} 个：${points.map(p => `${p.role}${p.f !== null ? `@${Math.round(p.f * 100)}%` : ''}#${p.part}`).join('、')}`);
  for (const [look, colors] of Object.entries(LOOKS)) {
    for (const [suffix, facing] of [['', 1], ['-left', -1]]) {
      for (const result of judgeColours(species, find(`${species}-${look}${suffix}`), { look, colors, facing }, palette, points)) add('颜色', `${look}${suffix ? '（朝左）' : ''} ${result.name}`, result.ok, result.detail);
    }
    const dark = identicalImages(find(`${species}-${look}`), find(`${species}-${look}-dark`));
    add('外观', `${look}：深色与浅色外观下的动物逐像素相同`, dark.same, dark.detail);
  }

  // 2b) 明暗：躯干与肢体都是上浅下深（只看有足够多可用像素的部件）
  const geometryRest = poseGeometry(species);
  for (const look of Object.keys(LOOKS)) {
    geometryRest.parts.forEach((part, index) => {
      if (part.role !== 'body' && part.role !== 'limb') return;
      const light = lightingOfPart(species, find(`${species}-${look}`), index);
      if (!(light.pixels >= LIMITS.lightMinPixels)) return;        // 太小的部件（取不到足够像素）不判
      add('明暗', `${look}：${part.role}#${index} 上浅下深`, light.upper > light.lower + LIMITS.lightGap, `上三分之一平均亮度 ${light.upper.toFixed(3)}，下三分之一 ${light.lower.toFixed(3)}（差应 > ${LIMITS.lightGap}），取样像素 ${light.pixels} 个`);
    });
  }
  add('明暗', '至少有一个躯干与一个肢体参与判定', geometryRest.parts.some((part, i) => part.role === 'body' && lightingOfPart(species, find(`${species}-solid`), i).pixels >= LIMITS.lightMinPixels) && geometryRest.parts.some((part, i) => part.role === 'limb' && lightingOfPart(species, find(`${species}-solid`), i).pixels >= LIMITS.lightMinPixels), '否则这一组检查是空的');

  // 3) 眼睛
  const rest = { facing: 1, pitch: 0, wave: 0 };
  for (const result of judgeEyes(species, find(`${species}-solid`), rest)) add('眼睛', `醒着 ${result.name}`, result.ok, result.detail);
  const eyes = poseGeometry(species, rest).eyes;
  eyes.forEach((eye, index) => {
    // 睡着时眼睛闭成一道弧线：眼中心不再是实心的深色（醒着时是），但眼周仍有弧线的深色像素
    const centre = colourAt(find(`${species}-asleep`), eye, 0), arc = darkPixelsNear(find(`${species}-asleep`), eye);
    add('眼睛', `睡着时眼睛变成弧线 #${index}`, Boolean(centre) && luma(centre) >= LIMITS.eyeCentre && arc >= 4, `眼中心亮度 ${centre ? luma(centre).toFixed(2) : '无像素'}（应 ≥ ${LIMITS.eyeCentre}，醒着时是深色），眼周深色像素 ${arc} 个（应 ≥ 4）`);
  });

  // 4) 窗口外圈与多余像素
  add('窗口外圈', '夜晚荧光（深色外观）不碰窗口边缘', borderMaxAlpha(find(`${species}-night`)) <= LIMITS.borderAlpha, `最外 ${BORDER_PT} pt 内最大 alpha ${borderMaxAlpha(find(`${species}-night`))}（≤ ${LIMITS.borderAlpha}）`);
  add('窗口外圈', '夜晚荧光（浅色外观）不碰窗口边缘', borderMaxAlpha(find(`${species}-night-light`)) <= LIMITS.borderAlpha, `最外 ${BORDER_PT} pt 内最大 alpha ${borderMaxAlpha(find(`${species}-night-light`))}（≤ ${LIMITS.borderAlpha}）`);
  const glow = strayPixels(species, find(`${species}-night`), rest, { threshold: 8 });
  add('窗口外圈', '夜晚确实有光晕', glow > 500, `轮廓外 alpha ≥ 8 的像素 ${glow} 个（应 > 500）`);
  for (const [look] of Object.entries(LOOKS)) {
    const stray = strayPixels(species, find(`${species}-${look}`), rest);
    add('窗口外圈', `${look}：白天醒着时轮廓外没有多余像素`, stray === 0, `${stray} 个`);
  }
  const marks = strayPixels(species, find(`${species}-asleep`), rest);
  add('睡觉标记', '睡着时轮廓外出现 “z”', marks > 25, `${marks} 个像素（应 > 25）`);
  const centre = poseGeometry(species, rest).target;
  for (const [label, facing, name] of [['朝右', 1, `${species}-asleep`], ['朝左', -1, `${species}-asleep-left`]]) {
    const z = strayStats(species, find(name), { facing, pitch: 0, wave: 0 });
    // 头端的锚点：并集包围盒前端往里 12% 宽、顶端（规格：z 在头的前上方），按朝向放到窗口里；z 要在它的外侧（向前、向上飘）而不是往身体里飘
    const union = Shapes.union(species), geometryAt = poseGeometry(species, { facing, pitch: 0, wave: 0 });
    const anchor = [geometryAt.target[0] + facing * ((union.maxX - (union.maxX - union.minX) * 0.12) - geometryAt.mid[0]), geometryAt.target[1] + (union.maxY - geometryAt.mid[1])];
    add('睡觉标记', `${label}睡着时 “z” 在头的一侧、身体上方、向外飘`, z.count > 25 && Math.sign(z.x - centre[0]) === facing && z.y > centre[1] && (z.x - anchor[0]) * facing > 0 && z.y > anchor[1],
      `${z.count} 个像素，质心 (${z.x.toFixed(1)}, ${z.y.toFixed(1)})，头端锚点 (${anchor[0].toFixed(1)}, ${anchor[1].toFixed(1)})，动物中心 (${centre[0]}, ${centre[1].toFixed(1)})，头在${facing > 0 ? '右' : '左'}`);
  }
  const alertEye = darkPixelsNear(find(`${species}-alert`), eyes[0]), calmEye = darkPixelsNear(find(`${species}-solid`), eyes[0]);
  add('眼睛', '警觉时眼睛更大', alertEye > calmEye, `眼周深色像素：警觉 ${alertEye}，平静 ${calmEye}`);

  // 5) 响铃涟漪：圆心在动物中心、半径随离窗口边缘的余量缩小、两圈的位置与高度、颜色、窗口外圈
  const ripples = find(`${species}-ripples`), ripple = judgeRipples(species, ripples, rest, 5, palette);
  add('涟漪', '两圈涟漪的半径、高度与颜色，更外面没有别的圈', ripple.ok, ripple.detail);
  add('涟漪', '涟漪不碰窗口边缘', borderMaxAlpha(ripples) <= LIMITS.borderAlpha, `最外 ${BORDER_PT} pt 内最大 alpha ${borderMaxAlpha(ripples)}（≤ ${LIMITS.borderAlpha}）`);
  const withoutRipples = alphaMask(find(`${species}-solid`), 1), withRipples = alphaMask(ripples, 1);
  let added = 0; for (let i = 0; i < withRipples.length; i++) if (withRipples[i] && !withoutRipples[i]) added++;
  add('涟漪', '画了涟漪的图比没画的多出像素', added > 800, `多出 ${added} 个像素（应 > 800）`);
  return lines;
}

// ---------- 联系表（给人看） ----------

async function writeSheet(file, names, images, dark) {
  const { encodePng } = await import('../test/fixtures/png-encode.mjs');
  const first = images[names[0]], columns = 3, rows = Math.ceil(names.length / columns);
  const width = first.width * columns, height = first.height * rows, pixels = Buffer.alloc(width * height * 4);
  const back = dark ? [28, 30, 36] : [255, 255, 255];
  names.forEach((name, index) => {
    const image = images[name], ox = (index % columns) * first.width, oy = Math.floor(index / columns) * first.height;
    for (let y = 0; y < first.height; y++) for (let x = 0; x < first.width; x++) {
      const s = (y * first.width + x) * 4, d = ((oy + y) * width + ox + x) * 4, alpha = image.pixels[s + 3] / 255;
      for (let k = 0; k < 3; k++) pixels[d + k] = Math.round(image.pixels[s + k] * alpha + back[k] * (1 - alpha));
      pixels[d + 3] = 255;
    }
  });
  writeFileSync(file, encodePng(width, height, pixels));
}

// ---------- 命令行 ----------

async function main() {
  const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const flag = name => process.argv.includes(`--${name}`);
  const wanted = (arg('species') ? [arg('species')] : Shapes.AVAILABLE.filter(id => id !== 'jelly'));
  const keep = flag('keep'), outDir = arg('out') ? resolve(arg('out')) : mkdtempSync(join(tmpdir(), 'species-render-'));
  mkdirSync(outDir, { recursive: true });
  let binary = arg('bin');
  if (!binary) { console.log('编译渲染工具……'); binary = compileHarness(outDir); }
  let failed = 0, total = 0;
  const sheetNames = [], allImages = {};
  for (const species of wanted) {
    if (!Shapes.AVAILABLE.includes(species) || species === 'jelly') throw new Error(`${species} 没有形状数据，无法检查`);
    const cases = buildCases(species);
    const manifest = runHarness(binary, cases, outDir);
    const images = {};
    for (const entry of manifest) {
      if (entry.species !== species) throw new Error(`${entry.name}：请求 ${species}，原生实际画的是 ${entry.species}`);
      images[entry.name] = decodePng(entry.file);
      allImages[entry.name] = images[entry.name];
    }
    const palette = (() => {
      const result = spawnSync(binary, ['--palette'], { encoding: 'utf8' });
      return result.status === 0 ? JSON.parse(result.stdout) : null;
    })();
    if (!palette) throw new Error('渲染工具没有给出调色板');
    console.log(`\n== ${species} ==`);
    const groups = new Map();
    for (const line of checkSpecies(species, images, palette)) { if (!groups.has(line.group)) groups.set(line.group, []); groups.get(line.group).push(line); }
    for (const [group, lines] of groups) {
      console.log(`[${group}] ${lines.filter(line => line.ok).length}/${lines.length}`);
      for (const line of lines) {
        total++; if (!line.ok) failed++;
        if (!line.ok || flag('verbose')) console.log(`  ${line.ok ? '✓' : '✗'} ${line.name}：${line.detail}`);
      }
    }
    sheetNames.push(`${species}-solid`, `${species}-duo`, `${species}-blend`, `${species}-rainbow`, `${species}-blend-left`, `${species}-pose-up`, `${species}-pose-wave-up`, `${species}-asleep`, `${species}-night`);
  }
  if (arg('sheet')) { await writeSheet(resolve(arg('sheet')), sheetNames, allImages, flag('sheet-dark')); console.log(`\n联系表：${resolve(arg('sheet'))}`); }
  if (!keep && !arg('out')) rmSync(outDir, { recursive: true, force: true });
  console.log(`\n${failed ? `✗ ${failed}/${total} 项没有通过` : `✓ 全部 ${total} 项通过`}`);
  process.exit(failed ? 1 : 0);
}

// macOS 的 /tmp 是 /private/tmp 的符号链接：import.meta.url 是解析过的真实路径，argv[1] 不是，所以两边都取 realpath 再比
const invokedDirectly = () => { try { return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href; } catch { return false; } };
if (invokedDirectly()) main().catch(error => { console.error(error.message); process.exit(2); });
