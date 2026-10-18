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
//  · 腹部（belly，鲸鲨）：规格是“主色提亮后平铺”，色相取主色（所有花纹一样）；纯色花纹里腹部比躯干的代表点明显更亮；
//  · 斑点（accent，鲸鲨约 60 个小圆）：规格是“白色 × alpha 盖在躯干上”，所以每个斑点中心 = 参照的躯干色向白色靠 alpha，色相不变；
//    参照色取斑点外一圈只属于躯干的像素（排除其他斑点、腹部、鳍、高光），参照像素不足的斑点不判；
//  · 壳纹（accent，海龟的六边形细带网，17 条细带加 5 个接点三角形）：规格同样是“白色 × alpha 盖在躯干上”，逐条细带比较缩进 1 像素后的内部颜色与外扩 3.5 pt 的躯干参照色；
//    accent 全是小圆走斑点检查、否则走壳纹检查（accentKind 分派，不会因为不是小圆就悄悄跳过）；
//  · 微笑（mouth，侧视动物）：醒着时沿曲线取点都是墨色（跟着朝向与俯仰），睡着时都不是；睡着的被抓住时醒来：睁眼、没有 “z”、有笑；
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
  smileDark: 0.45,       // 微笑线上的点的亮度上限（墨色 α0.88 压在浅色身体上，线宽 1.2 pt 约 2.4 像素；身体描边约 0.49，不在曲线上）
  bellyLift: 0.04,       // 纯色花纹里腹部比躯干代表点亮的最小亮度差
  spotAlpha: 0.72,       // 规格：斑点是白色 × 这个 alpha 盖在躯干上
  spotRing: 8,           // 参照像素至少这么多个，否则该斑点不判（实测最少 6 个以上的环；60 个斑点全部够）
  spotLift: 0.05,        // 斑点中心比参照的躯干亮的最小亮度差
  spotTolerance: 0.04,   // 斑点中心每个通道与“白色 × α 盖在参照色上”的期望值的最大差（0–1；实测最大 0.01，α 从 0.72 降到 0.65 就会超过）
  spotMinCount: 55,      // 参与判定的斑点至少这么多个（总数 60；少了说明检查空转）
  spotPass: 0.9,         // 参与判定的斑点里通过的最小比例
  spotRadius: 3,         // accent 的子路径到质心的最大距离不超过它才算“斑点”（小圆）；超过的是壳纹那样的条带，换 judgeSeams 判
  seamReach: 7,          // 壳纹：参照像素取到细带外扩多少个像素（7 个像素 = 3.5 pt，与斑点的参照环同宽）
  seamMinCount: 8,       // 参与判定的细带至少这么多条（海龟的壳纹有 17 条细带，实测其中 10 条够大、没被别的部件盖住；少了说明检查空转）
  // 元素（只画一个元素的图）：以下数值是一次完整真实渲染的实测最大偏差的 2–3 倍（实测值见 --verbose 输出与技术文档）
  elementRatio: 0.03,    // 部件 alpha 质量比与 1 的最大差（实测 0.981–1.012）
  elementShift: 0.15,    // 部件质心偏移上限（pt；实测最大 0.10）
  faceRatio: 0.055,      // 脸（眼睛、腮红、微笑）的质量比与 1 的最大差（实测 0.963–1.000；小圆与细线的抗锯齿系统性少 2–3%）
  faceShift: 0.07,       // 脸的质心偏移上限（pt；实测最大 0.041；瞳孔偏移 1.4 改成 1.5 就是 0.1）
  flatAlpha: 0.015,      // 平铺叠加层内部像素 alpha 与规格的最大差（8 位量化约 0.004）
  rangeSlack: 0.015,     // 渐变填充 alpha 超出规格范围的余量
  endSlack: 0.012,       // 渐变填充“走到两端”的余量：同一角色全部部件的内部像素里，最小 alpha ≤ 范围下端 + 它，最大 alpha ≥ 范围上端 − 它（实测躯干 0.929–0.969、肢体 0.922–0.949）
  whiteMin: 0.97,        // 斑点与高光内部像素各通道的下限（纯白）
  bellyColour: 0.06,     // 腹部颜色与“主色提亮”的最大通道差（AppKit 颜色转换本身约 0.03）
  strokeRatio: 0.03,     // 描边质量比与 1 的最大差（实测 0.997–1.010）
  strokeRingMin: 8,      // 判描边颜色至少要有这么多个盖在透明处的描边像素
  strokeDarker: 0.05,    // 描边比填充暗的最小亮度差
  inkLuma: 0.45,         // 墨色（眼睛、睡着的弧、微笑）的亮度上限
  glintRatioMin: 0.72,   // 高光面积（由亮度反推）与期望椭圆面积之比的范围（实测 0.84–0.93：小图形的抗锯齿系统性偏少；大小改 36% 就出范围）
  glintRatioMax: 1.12,
  glintShift: 0.05,      // 高光质心偏移上限（pt；实测最大 0.023；位置改 0.1 个半径就是 0.2 pt）
  zReach: 22,            // 睡着时 “z” 的质心离头端锚点的最大距离（pt；实测 13.4–15.1）
  glintContrast: 0.25,   // 眼睛高光比圆的深色部分亮的最小亮度差（完整覆盖的像素约 0.6；窄眼睛里高光只有一部分在像素内，按“至少半个像素在高光里”取样，实测 0.33–0.58）
  glintMinPixels: 2,     // 取到的高光像素少于这么多个时不判对比度：单个像素的亮度取决于高光落在它里面的亚像素位置，不是证据（实测几乎正对的蝠鲼只取到 1 个像素、对比度 0.262，离阈值只差 0.012；其余姿态至少 2 个像素、对比度 ≥ 0.331）
  pinkHue: 350,          // 腮红色相（度）
  pinkTolerance: 25,     // 腮红色相容差（度）
  pinkChroma: 0.2,       // 腮红的最小色度
  composeTolerance: 3,   // 各层叠起来与整只图每个预乘通道的最大差（0–255；一次完整渲染实测最大 1.82）
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

// 带 motion 的部件在划水相位 wave 的位置：先在 pivot 上把 y 缩放到 1 − squash × wave（拍翼），再绕 pivot 转 maxAngle × wave。
// 与形状模块的 bounds 是同一条规则；这里有意自己写一份，不借用它的函数，两处各自对着渲染出来的像素被核对。
const moved = (p, motion, wave) => rotateAbout([p[0], motion.pivot[1] + (p[1] - motion.pivot[1]) * (1 - motion.squash * wave)], motion.pivot, motion.maxAngle * wave);

/**
 * 某种动物在某个姿态下的“窗口坐标”几何（点，y 向上，原点在窗口左下角）：每个部件的多边形、眼睛、腮红，侧视动物还有嘴（微笑曲线的 4 个点，不是多边形）。
 * 放置规则（设计稿 §5）：先把各相位并集包围盒的中心移到原点，再按俯仰转（鼻子朝上为正），再按朝向水平翻转，最后放到
 * （窗口水平中心，并集顶端离窗口底边 91 pt）。划水：带 motion 的部件先在 pivot 上按 squash 缩放 y、再绕 pivot 转 maxAngle × wave。
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
    polygons: flatten(part.cmds).map(poly => poly.map(p => place(part.motion ? moved(p, part.motion, wave) : p))),
  }));
  const mouth = shape.mouth ? shape.mouth.map(place) : null;        // 嘴不在会动的部件上：划水时不动
  return { parts, eyes: shape.eyes.at.map(place), eyeRadius: shape.eyes.r, blush: shape.blush.map(b => ({ center: place([b[0], b[1]]), rx: b[2], ry: b[3] })), mouth, union, mid, target };
}

// ---------- 像素：多边形光栅化、轮廓比较 ----------

export const toPixel = (x, y, scale = VIEW.scale) => [x * scale, (VIEW.height - y) * scale];      // 窗口点（y 向上）→ 图像像素（y 向下，连续坐标）；scale 是每个窗口点的像素数

/** 偶奇规则扫描线填充：polygons 是窗口点坐标的多边形列表，返回 width×height 的 0/1 数组（以像素中心判定）。scale 是每个窗口点的像素数（超采样时放大）。 */
export function rasterize(polygons, width = VIEW.width * VIEW.scale, height = VIEW.height * VIEW.scale, scale = VIEW.scale) {
  const mask = new Uint8Array(width * height);
  const polys = polygons.map(poly => poly.map(p => toPixel(p[0], p[1], scale)));
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

/** 三次贝塞尔上的一个点（4 个控制点，t ∈ [0, 1]）。 */
export const bezierAt = ([p0, p1, p2, p3], t) => { const s = 1 - t; return [0, 1].map(k => s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k]); };

/** 沿微笑曲线取 n 个点（t 在 0.12…0.88 之间等距，避开两端的圆头）；没有嘴的动物返回空数组。geometry 来自 poseGeometry。 */
export function smilePoints(geometry, n = 7) {
  return geometry.mouth ? Array.from({ length: n }, (_, i) => bezierAt(geometry.mouth, 0.12 + 0.76 * i / (n - 1))) : [];
}

/**
 * 脸部装饰（眼睛、腮红、微笑线）周围的区域：它们画在躯干之上、不属于任何部件，颜色取样要避开。
 * 返回 (窗口点) => 是否在避让区里：眼睛 1.5 倍半径外加 1 pt、腮红椭圆外扩 1 pt、离微笑线 2.2 pt（线宽 1.2 pt 的一半加抗锯齿与 3×3 取样）以内。
 */
export function faceAvoider(geometry) {
  const { eyes, eyeRadius, blush, mouth } = geometry;
  const smile = mouth ? Array.from({ length: 25 }, (_, i) => bezierAt(mouth, i / 24)) : [];
  return point => eyes.some(e => Math.hypot(point[0] - e[0], point[1] - e[1]) < eyeRadius * 1.5 + 1)
    || blush.some(b => Math.hypot((point[0] - b.center[0]) / (b.rx + 1), (point[1] - b.center[1]) / (b.ry + 1)) < 1)
    || smile.some(m => Math.hypot(point[0] - m[0], point[1] - m[1]) < 2.2);
}

/**
 * 取样点：对每个躯干/肢体/腹部部件，在网格上找“在自己里面、不在后画的任何部件里（逐个部件判断；离后画的躯干/肢体的边还要多留一个描边半宽）、离所有相关边缘最远、避开眼睛、腮红与微笑线”的点。
 * 躯干另外沿长轴 10%/50%/90% 各取一个（f 是该点在“全部躯干部件包围盒”里的相对位置，尾 0 → 头 1，与规格一致）。
 * 返回 [{ part, role, u, f, point, clearance }]，point 是静态姿态（朝右、不俯仰、不划水）的窗口点。
 */
export function samplePoints(id, { minClearance = 1.1, step = 0.5 } = {}) {
  const geometry = poseGeometry(id);
  const { parts } = geometry;
  const avoid = faceAvoider(geometry);
  const bodyPolys = parts.filter(p => p.role === 'body').flatMap(p => p.polygons);
  const bodyBox = bodyPolys.flat().reduce((box, p) => ({ minX: Math.min(box.minX, p[0]), maxX: Math.max(box.maxX, p[0]), minY: Math.min(box.minY, p[1]), maxY: Math.max(box.maxY, p[1]) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const clearanceAt = (point, index) => {
    const own = parts[index].polygons;
    if (!insidePolygons(point, own)) return -1;
    // 逐个部件判断是否被盖住：后画的多边形并在一起做偶奇判定，会把被两个部件同时盖住的点数成没盖住（腹部在龟板之内，两者又都盖着后肢）。
    // 离后画的躯干/肢体的边要多留一个描边半宽：它们的描边伸到多边形之外，3×3 像素的取色窗口碰到别的部件的深色描边，低色度的肢体色相会偏几十度（腹部、斑点、高光没有描边）
    const later = parts.slice(index + 1);
    if (later.some(p => insidePolygons(point, p.polygons) || edgeDistance(point, p.polygons) < minClearance + (p.role === 'body' || p.role === 'limb' ? STROKE_HALF : 0))) return -1;
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
    if (part.role !== 'body' && part.role !== 'limb' && part.role !== 'belly') return;
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
    const expected = sample.role === 'belly' ? tints[0]                           // 腹部：主色提亮后平铺，所有花纹同一个颜色，色相就是主色
      : sample.role === 'body' && sample.f !== null ? bodyTone(look, tints, sample.f)
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

// ---------- 微笑、腹部、斑点 ----------

/**
 * 微笑：沿曲线取点（smilePoints），drawn=true（醒着，或睡着又被抓住）时每个点都是墨色（亮度 < smileDark），drawn=false（睡着）时都不是。
 * 嘴跟着朝向与俯仰（poseGeometry 已处理），划水时不动。没有嘴的动物返回 null。
 */
export function judgeSmile(id, image, pose, drawn = true) {
  const points = smilePoints(poseGeometry(id, pose));
  if (!points.length) return null;
  const lumas = points.map(point => { const rgb = colourAt(image, point, 0); return rgb ? luma(rgb) : 1; });
  const dark = lumas.filter(value => value < LIMITS.smileDark).length;
  return { ok: drawn ? dark === points.length : dark === 0, dark, total: points.length, lumas, detail: `沿曲线 ${points.length} 个点里 ${dark} 个是墨色（亮度 < ${LIMITS.smileDark}；${drawn ? '应全部' : '应为 0'}），亮度 ${lumas.map(value => value.toFixed(2)).join(' ')}` };
}

/**
 * 腹部：规格是主色提亮后平铺。色相由 judgeColours 里 belly 取样点核对；这里核对“确实更亮”：
 * 纯色花纹里腹部取样点的亮度比躯干代表点高 bellyLift。没有腹部的动物返回 null。points 来自 samplePoints。
 */
export function judgeBelly(id, image, points = samplePoints(id)) {
  const belly = points.find(sample => sample.role === 'belly'), body = points.find(sample => sample.role === 'body' && sample.f === null);
  if (!belly) return null;
  const bellyRgb = colourAt(image, belly.point), bodyRgb = body ? colourAt(image, body.point) : null;
  if (!bellyRgb || !bodyRgb) return { ok: false, lift: NaN, detail: `取样点上没有不透明像素（腹部 ${bellyRgb ? '有' : '无'}，躯干 ${bodyRgb ? '有' : '无'}）` };
  const lift = luma(bellyRgb) - luma(bodyRgb);
  return { ok: lift >= LIMITS.bellyLift, lift, detail: `腹部亮度 ${luma(bellyRgb).toFixed(3)}，躯干代表点 ${luma(bodyRgb).toFixed(3)}（差 ${lift.toFixed(3)}，应 ≥ ${LIMITS.bellyLift}）` };
}

/** 一个子路径的外接圆：质心（顶点的平均）与到质心的最大距离。斑点是小圆，壳纹的细带不是。 */
export const discOf = polygon => {
  const centre = [polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length, polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length];
  return { centre, radius: Math.max(...polygon.map(p => Math.hypot(p[0] - centre[0], p[1] - centre[1]))) };
};

/**
 * accent 部件的种类：每个子路径都是小圆（到质心不超过 LIMITS.spotRadius）→ 'spots'（鲸鲨的斑点，judgeSpots 判）；
 * 否则 → 'seams'（海龟壳纹那样的细带网，judgeSeams 判）；没有 accent 部件 → null。检查按种类分派，不会因为形状不是小圆就悄悄跳过。
 */
export function accentKind(id) {
  const polygons = poseGeometry(id).parts.filter(part => part.role === 'accent').flatMap(part => part.polygons);
  if (!polygons.length) return null;
  return polygons.every(polygon => discOf(polygon).radius <= LIMITS.spotRadius) ? 'spots' : 'seams';
}

/**
 * 斑点（accent 部件里的每个子路径，鲸鲨是约 60 个小圆）：规格是“白色 × alpha 盖在躯干上”，所以斑点中心的颜色 = 躯干色向白色靠 alpha，色相不变。
 * 对每个斑点：参照色 = 斑点周围（离质心 r + 0.2 … r + 3.5 pt）里“只属于躯干”的像素的平均色——在躯干里、离躯干边缘 ≥ 1 pt（避开描边）、
 * 不在腹部/鳍/高光上（外扩 2 像素）、不在眼睛/腮红/微笑线的避让区里（faceAvoider）、离任何斑点的边缘 ≥ 0.3 pt（半个像素，保证整个像素都在斑点之外，不掺抗锯齿）；
 * 斑点色 = 质心附近（不超过 max(0.45, r − 0.35) pt）的平均色。参照像素不足 spotRing 个、或中心被后画的部件盖住的斑点不判。
 * 为什么环要取到 3.5 pt：斑点排得很密（相邻斑点边缘只隔约 0.5 pt），紧挨着的一圈几乎全是别的斑点或抗锯齿；
 * 躯干的明暗与渐变在 3.5 pt 内变化很小（按环对称取平均，线性渐变的中心值就是环平均），误差远小于 spotTolerance。
 * 判定：亮度比参照高 spotLift，且三个通道都在“白 × α 盖在参照色上”的期望值的 spotTolerance 以内；
 * 参与判定的斑点至少 spotMinCount 个（实测 60 个全部参与）、通过的比例至少 spotPass。bodyAlpha 是躯干自己的不透明度（产品里是 0.95）。
 * 只适用于小圆：accent 里有子路径到质心的最大距离超过 3 pt 时直接判不通过（别的形状的 accent 加进来时这条检查要重新设计，不能默默跳过）。
 * 没有斑点的动物返回 null。
 */
export function judgeSpots(id, image, { alpha = LIMITS.spotAlpha, bodyAlpha = 0.95 } = {}) {
  const geometry = poseGeometry(id);
  const spots = geometry.parts.filter(part => part.role === 'accent').flatMap(part => part.polygons).map(discOf);
  if (!spots.length) return null;
  const big = spots.filter(spot => spot.radius > LIMITS.spotRadius);
  if (big.length) return { ok: false, total: spots.length, evaluated: 0, passed: 0, skipped: 0, failures: [], detail: `${big.length} 个 accent 子路径不是小圆（到质心最远 ${Math.max(...big.map(spot => spot.radius)).toFixed(1)} pt > ${LIMITS.spotRadius}），斑点检查不适用（细带请用 judgeSeams）` };
  const { width, height } = image;
  const maskOf = predicate => {
    const mask = new Uint8Array(width * height);
    for (const part of geometry.parts) if (predicate(part)) { const one = rasterize(part.polygons, width, height); for (let i = 0; i < mask.length; i++) if (one[i]) mask[i] = 1; }
    return mask;
  };
  const bodyMask = maskOf(part => part.role === 'body');
  const nearBodyEdge = dilate(new Uint8Array(bodyMask.map(v => 1 - v)), width, height, 2);       // 离躯干边缘不到 1 pt（描边在这里）
  const otherNear = dilate(maskOf(part => part.role !== 'body' && part.role !== 'accent'), width, height, 2);
  const pixelRgb = i => [image.pixels[i * 4] / 255, image.pixels[i * 4 + 1] / 255, image.pixels[i * 4 + 2] / 255];
  const onFace = faceAvoider(geometry);
  const spotGap = (x, y) => spots.reduce((best, spot) => Math.min(best, Math.hypot(x - spot.centre[0], y - spot.centre[1]) - spot.radius), Infinity);
  const average = list => [0, 1, 2].map(k => list.reduce((sum, rgb) => sum + rgb[k], 0) / list.length);
  const total = alpha + bodyAlpha * (1 - alpha);
  let evaluated = 0, passed = 0, skipped = 0, minLift = Infinity, liftSum = 0, maxError = 0;
  const failures = [];
  spots.forEach((spot, index) => {
    const ring = [], core = [];
    const [px, py] = toPixel(spot.centre[0], spot.centre[1]), span = Math.ceil((spot.radius + 3.5) * VIEW.scale) + 1;
    for (let y = Math.max(0, Math.floor(py) - span); y <= Math.min(height - 1, Math.floor(py) + span); y++) for (let x = Math.max(0, Math.floor(px) - span); x <= Math.min(width - 1, Math.floor(px) + span); x++) {
      const i = y * width + x;
      if (image.pixels[i * 4 + 3] < 200) continue;
      const wx = (x + 0.5) / VIEW.scale, wy = VIEW.height - (y + 0.5) / VIEW.scale;
      const distance = Math.hypot(wx - spot.centre[0], wy - spot.centre[1]);
      if (distance <= Math.max(0.45, spot.radius - 0.35) && !otherNear[i]) core.push(pixelRgb(i));
      else if (distance >= spot.radius + 0.2 && distance <= spot.radius + 3.5 && bodyMask[i] && !nearBodyEdge[i] && !otherNear[i] && spotGap(wx, wy) >= 0.3 && !onFace([wx, wy])) ring.push(pixelRgb(i));
    }
    if (ring.length < LIMITS.spotRing || !core.length) { skipped++; return; }
    const base = average(ring), seen = average(core);
    const expected = base.map(value => (alpha + bodyAlpha * (1 - alpha) * value) / total);
    const lift = luma(seen) - luma(base), error = Math.max(...seen.map((value, k) => Math.abs(value - expected[k])));
    evaluated++; liftSum += lift; minLift = Math.min(minLift, lift); maxError = Math.max(maxError, error);
    if (lift >= LIMITS.spotLift && error <= LIMITS.spotTolerance) passed++;
    else failures.push(`#${index}（亮度提升 ${lift.toFixed(3)}，通道差 ${error.toFixed(3)}）`);
  });
  const ok = evaluated >= LIMITS.spotMinCount && passed / Math.max(1, evaluated) >= LIMITS.spotPass;
  return { ok, total: spots.length, evaluated, passed, skipped, minLift, meanLift: evaluated ? liftSum / evaluated : NaN, maxError, failures, detail: `${spots.length} 个斑点里 ${evaluated} 个参与判定（${skipped} 个参照像素不足或中心被盖住；应 ≥ ${LIMITS.spotMinCount} 个参与），通过 ${passed} 个（比例应 ≥ ${LIMITS.spotPass}）；亮度提升平均 ${evaluated ? (liftSum / evaluated).toFixed(3) : '无'}、最小 ${evaluated ? minLift.toFixed(3) : '无'}（应 ≥ ${LIMITS.spotLift}）；通道与期望值最大差 ${maxError.toFixed(3)}（应 ≤ ${LIMITS.spotTolerance}）${failures.length ? `；未通过：${failures.slice(0, 5).join('、')}${failures.length > 5 ? ' 等' : ''}` : ''}` };
}

/**
 * 壳纹（accent 部件是一张互不重叠的细带网，海龟：17 条细带加 5 个接点三角形）：规格与斑点相同，是“白色 × alpha 盖在躯干上”，
 * 所以细带中心的颜色 = 参照的躯干色向白色靠 alpha，色相不变。对每条细带：
 *  · 细带色 = 向内缩 1 个像素（0.5 pt，避开抗锯齿的边）之后的内部像素的平均色；这些像素不在腹部/鳍/头/高光上（外扩 2 个像素）、不在脸的避让区里；
 *  · 参照色 = 细带外扩 LIMITS.seamReach 个像素（3.5 pt）以内“只属于躯干”的像素的平均色：在躯干里、离躯干边缘 ≥ 1 pt（避开描边）、
 *    不在腹部/鳍/头/高光上、离任何壳纹至少 1 个像素（整个像素都在壳纹之外，不掺抗锯齿）、不在脸的避让区里。躯干的明暗与渐变在这个范围内几乎是线性的，
 *    按外扩环取平均，线性渐变的中心值就是环平均，误差远小于 spotTolerance；
 *  · 判定与斑点一样：亮度比参照高 spotLift，三个通道都在“白 × α 盖在参照色上”的期望值的 spotTolerance 以内。
 * 缩进后没有像素的（5 个接点三角形，边长约 1.3 pt，面积 0.7 pt²）、参照像素不足 spotRing 个的细带不判（它们的形状与白色由“元素”组按部件单独核对）；
 * 参与判定的细带至少 seamMinCount 条、通过的比例至少 spotPass。没有 accent 的动物返回 null。
 * 只适用于细带网：accent 里全是小圆（斑点）时用 judgeSpots，调用方按 accentKind 分派。
 */
export function judgeSeams(id, image, { alpha = LIMITS.spotAlpha, bodyAlpha = 0.95 } = {}) {
  const geometry = poseGeometry(id);
  const strips = geometry.parts.filter(part => part.role === 'accent').flatMap(part => part.polygons);
  if (!strips.length) return null;
  const { width, height } = image;
  const maskOf = predicate => {
    const mask = new Uint8Array(width * height);
    for (const part of geometry.parts) if (predicate(part)) { const one = rasterize(part.polygons, width, height); for (let i = 0; i < mask.length; i++) if (one[i]) mask[i] = 1; }
    return mask;
  };
  const invert = mask => Uint8Array.from(mask, v => 1 - v);
  const bodyMask = maskOf(part => part.role === 'body');
  const nearBodyEdge = dilate(invert(bodyMask), width, height, 2);
  const otherNear = dilate(maskOf(part => part.role !== 'body' && part.role !== 'accent'), width, height, 2);
  const nearSeam = dilate(maskOf(part => part.role === 'accent'), width, height, 1);
  const onFace = faceAvoider(geometry);
  const pixelRgb = i => [image.pixels[i * 4] / 255, image.pixels[i * 4 + 1] / 255, image.pixels[i * 4 + 2] / 255];
  const average = list => [0, 1, 2].map(k => list.reduce((sum, rgb) => sum + rgb[k], 0) / list.length);
  const total = alpha + bodyAlpha * (1 - alpha);
  let evaluated = 0, passed = 0, skipped = 0, minLift = Infinity, liftSum = 0, maxError = 0;
  const failures = [];
  strips.forEach((strip, index) => {
    const own = rasterize([strip], width, height);
    const inner = invert(dilate(invert(own), width, height, 1));
    const reach = dilate(own, width, height, LIMITS.seamReach);
    const core = [], ring = [];
    for (let i = 0; i < own.length; i++) {
      if (!reach[i] || image.pixels[i * 4 + 3] < 200 || otherNear[i]) continue;
      const wx = ((i % width) + 0.5) / VIEW.scale, wy = VIEW.height - (Math.floor(i / width) + 0.5) / VIEW.scale;
      if (onFace([wx, wy])) continue;
      if (inner[i]) core.push(pixelRgb(i));
      else if (!nearSeam[i] && bodyMask[i] && !nearBodyEdge[i]) ring.push(pixelRgb(i));
    }
    if (ring.length < LIMITS.spotRing || !core.length) { skipped++; return; }
    const base = average(ring), seen = average(core);
    const expected = base.map(value => (alpha + bodyAlpha * (1 - alpha) * value) / total);
    const lift = luma(seen) - luma(base), error = Math.max(...seen.map((value, k) => Math.abs(value - expected[k])));
    evaluated++; liftSum += lift; minLift = Math.min(minLift, lift); maxError = Math.max(maxError, error);
    if (lift >= LIMITS.spotLift && error <= LIMITS.spotTolerance) passed++;
    else failures.push(`#${index}（亮度提升 ${lift.toFixed(3)}，通道差 ${error.toFixed(3)}）`);
  });
  const ok = evaluated >= LIMITS.seamMinCount && passed / Math.max(1, evaluated) >= LIMITS.spotPass;
  return { ok, total: strips.length, evaluated, passed, skipped, minLift, meanLift: evaluated ? liftSum / evaluated : NaN, maxError, failures, detail: `${strips.length} 个壳纹子路径里 ${evaluated} 个参与判定（${skipped} 个太小、参照像素不足或被别的部件盖住；应 ≥ ${LIMITS.seamMinCount} 个参与），通过 ${passed} 个（比例应 ≥ ${LIMITS.spotPass}）；亮度提升平均 ${evaluated ? (liftSum / evaluated).toFixed(3) : '无'}、最小 ${evaluated ? minLift.toFixed(3) : '无'}（应 ≥ ${LIMITS.spotLift}）；通道与期望值最大差 ${maxError.toFixed(3)}（应 ≤ ${LIMITS.spotTolerance}）${failures.length ? `；未通过：${failures.slice(0, 5).join('、')}${failures.length > 5 ? ' 等' : ''}` : ''}` };
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

/**
 * 睡着时轮廓外的 “z”（strayStats 的结果）：像素够多；质心在动物中心朝向头的一侧、高于中心；在头端锚点的外侧——向前、向上飘，而不是往身体里飘；
 * 离锚点不超过 limit（z 画在头附近，不是别处）。centre 是动物中心，anchor 是头端锚点（都是窗口点，y 向上），facing：+1 头在右、−1 头在左。
 * 六个条件各自独立（单元测试逐条钉住）：这几句曾经内联在 checkSpecies 里，改坏任何一句没有测试会报。
 */
export function judgeSleepMark(z, { centre, anchor, facing, limit = LIMITS.zReach }) {
  const reach = Math.hypot(z.x - anchor[0], z.y - anchor[1]);
  const ok = z.count > 25 && Math.sign(z.x - centre[0]) === facing && z.y > centre[1] && (z.x - anchor[0]) * facing > 0 && z.y > anchor[1] && reach <= limit;
  return { ok, reach, detail: `${z.count} 个像素，质心 (${z.x.toFixed(1)}, ${z.y.toFixed(1)})，头端锚点 (${anchor[0].toFixed(1)}, ${anchor[1].toFixed(1)})，相距 ${reach.toFixed(1)} pt（≤ ${limit}），动物中心 (${centre[0]}, ${centre[1].toFixed(1)})，头在${facing > 0 ? '右' : '左'}` };
}

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

// ---------- 元素：每个元素单独画一遍（“画与不画”的差分） ----------
//
// 整只图上的容差会把绘制细节吸收掉：渐变停点、描边的线宽与透明度、眼睛与腮红的大小位置、斑点与高光的透明度……改了，整只图上看不出来。
// 渲染工具的 direct 模式直接调用 SpeciesPainter.draw（与 JellyView 画整只时是同一个调用，二者逐像素相同，见“叠层”组），并能只画一个元素；
// “只画它”与“什么都不画（全透明）”的差，就是这个元素自己画上去的东西，所以每个元素可以单独量：
//   · 形状与位置：它的 alpha 光栅 = 形状数据（按姿态放好的多边形）× 规格里写明的透明度，比较 alpha 质量比（大小 × 透明度）、质心偏移与形状之外的多余像素；
//   · 填充：躯干与肢体渐变填充的每个内部像素，alpha 都在规格范围里；
//   · 描边：同一个部件“画描边”与“不画描边”的差 = 描边自己，质量 = 透明度 × (半线宽 × 周长 × (2 − 填充 alpha) + π × 半线宽² × 填充 alpha)（外侧半条盖在透明处，内侧半条盖在填充上，圆头拐角的面积在最后一项），线宽、透明度、颜色走样都会改变它；
//   · 脸：眼睛（圆、高光、睡着时的弧）、腮红、微笑，各自按姿态（朝向、眨眼、警觉、瞳孔方向、睡着）算出期望形状；
//   · 叠层：把各层按绘制顺序在这里叠起来，必须与整只一起画出来的图一致——任何一个元素的绘制状态（变换、裁剪、线宽、颜色）漏到下一个元素上都会在这里露出来。
// 规格数值写在 PAINT_SPEC，是产品画法（jelly-species-painter.swift）的独立一份：改画法时两处一起改，改漏了这里的检查会失败。
// 颜色只做结构性核对（白就是白、墨色是深色、腮红是粉、描边比填充暗且色相相同）：AppKit 把“calibrated”颜色转进位图时会改变数值（实测墨色 (0.16, 0.22, 0.30) 变成约 (0.21, 0.29, 0.38)），
// 拿规格里的原始数字去比绝对值会误报；alpha 通道不受影响，所以透明度可以精确核对。

export const PAINT_SPEC = Object.freeze({
  flat: Object.freeze({ belly: 0.92, accent: 0.72, shine: 0.40 }),     // 平铺叠加层的 alpha：腹部（主色提亮）、斑点（纯白）、高光（纯白）
  bellyLighten: 0.72,                                                   // 腹部颜色 = 主色向白色靠 0.72
  fill: Object.freeze({ body: Object.freeze([0.93, 0.97]), limb: Object.freeze([0.92, 0.95]) }),   // 渐变填充的 alpha 范围（沿渐变轴由小到大；七彩/渐变躯干再叠一层白，仍在范围内）
  stroke: Object.freeze({ alpha: 0.9, body: 1.1, limb: 1.0 }),          // 描边的 alpha 与线宽（pt）
  eye: Object.freeze({
    alpha: 0.88, glintAlpha: 0.85, narrowMin: 0.35, openMin: 0.12, alert: 1.25, gazeX: 1.4, gazeY: 1.0,
    glintDx: 0.2, glintDy: 0.4, glintR: 0.3,                           // 高光：中心在眼中心偏（0.2, 0.4）个半径，半径 0.3 个眼半径（随变窄与睁开程度缩放）
    arcWidth: 1.3, arcHalf: 1.25, arcEnd: 0.8, arcControlX: 0.6, arcControlY: -2.2,   // 睡着时的弧：半宽 1.25 个半径，两端比眼中心高 0.8 pt，控制点在 ±0.6 个半宽、低 2.2 pt
  }),
  blushAlpha: 0.34,
  mouth: Object.freeze({ alpha: 0.88, width: 1.2 }),
});

function downsample(hi, width, height, sub) {
  const out = new Float32Array(width * height), norm = 1 / (sub * sub), stride = width * sub;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let n = 0;
    for (let dy = 0; dy < sub; dy++) { const row = (y * sub + dy) * stride + x * sub; for (let dx = 0; dx < sub; dx++) n += hi[row + dx]; }
    out[y * width + x] = n * norm;
  }
  return out;
}

/** 多边形的像素覆盖率（0…1，每个像素 sub×sub 个子点按偶奇规则判定）：抗锯齿后的 alpha 形状。 */
export function coverage(polygons, width = VIEW.width * VIEW.scale, height = VIEW.height * VIEW.scale, sub = 4) {
  return downsample(rasterize(polygons, width * sub, height * sub, VIEW.scale * sub), width, height, sub);
}

/** 折线（窗口点）加粗到 2 × halfWidth（两端是圆头）的像素覆盖率。 */
export function curveCoverage(points, halfWidth, width = VIEW.width * VIEW.scale, height = VIEW.height * VIEW.scale, sub = 4) {
  const scale = VIEW.scale * sub, W = width * sub, H = height * sub, hi = new Uint8Array(W * H), reach = halfWidth * scale, pad = Math.ceil(reach) + 1;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = toPixel(points[i][0], points[i][1], scale), b = toPixel(points[i + 1][0], points[i + 1][1], scale);
    const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - pad)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - pad)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + pad));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (segmentDistance([x + 0.5, y + 0.5], a, b) <= reach) hi[y * W + x] = 1;
  }
  return downsample(hi, width, height, sub);
}

export const bezierPolyline = (points, n = 48) => Array.from({ length: n + 1 }, (_, i) => bezierAt(points, i / n));
export const ellipsePolygon = (centre, rx, ry, n = 72) => Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n; return [centre[0] + rx * Math.cos(t), centre[1] + ry * Math.sin(t)]; });
const scaledField = (field, k) => { const out = new Float32Array(field.length); for (let i = 0; i < out.length; i++) out[i] = field[i] * k; return out; };
const perimeterOf = polygons => polygons.reduce((sum, poly) => sum + poly.reduce((s, p, i) => s + Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]), 0), 0);
/** 多边形在图像里的内部像素（像素中心在里面，且离边缘至少 steps 个像素）。 */
const interiorOf = (polygons, width, height, steps) => {
  const mask = rasterize(polygons, width, height), near = dilate(new Uint8Array(mask.map(v => 1 - v)), width, height, steps);
  return mask.map((v, i) => (v && !near[i] ? 1 : 0));
};
const pixelRgb = (image, i) => [image.pixels[i * 4] / 255, image.pixels[i * 4 + 1] / 255, image.pixels[i * 4 + 2] / 255];

/**
 * 把渲染出来的 alpha 与期望的 alpha 光栅比较：返回
 *   ratio  = 渲染 alpha 质量 ÷ 期望 alpha 质量（大小 × 透明度对不对）、
 *   shift  = 两者质心相差多少 pt（位置对不对）、
 *   stray  = 期望形状（外扩 margin 个像素）之外 alpha ≥ floor 的像素个数（别处多画了东西）。
 * 期望为空（比如睡着时的嘴）而渲染也为空时 ratio 为 1、shift 为 0。
 */
export function compareAlpha(image, predicted, { margin = 1, floor = 0.04 } = {}) {
  const { width, height } = image, count = width * height, support = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (predicted[i] > 0) support[i] = 1;
  const near = dilate(support, width, height, margin);
  let mass = 0, expected = 0, sx = 0, sy = 0, ex = 0, ey = 0, stray = 0;
  for (let i = 0; i < count; i++) {
    const a = image.pixels[i * 4 + 3] / 255, p = predicted[i];
    if (a >= floor && !near[i]) stray++;
    if (!a && !p) continue;
    const x = (i % width + 0.5) / VIEW.scale, y = VIEW.height - (Math.floor(i / width) + 0.5) / VIEW.scale;
    mass += a; expected += p; sx += a * x; sy += a * y; ex += p * x; ey += p * y;
  }
  const ratio = expected > 0 ? mass / expected : mass > 0 ? Infinity : 1;
  const shift = mass > 0 && expected > 0 ? Math.hypot(sx / mass - ex / expected, sy / mass - ey / expected) : (mass > 0 || expected > 0 ? NaN : 0);
  return { mass, expected, ratio, shift, stray };
}

const fmt = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : String(value);
const PART_TOLERANCE = Object.freeze({ ratio: 'elementRatio', shift: 'elementShift' }), FACE_TOLERANCE = Object.freeze({ ratio: 'faceRatio', shift: 'faceShift' });
const describeStats = (s, tolerance = PART_TOLERANCE) => `质量比 ${fmt(s.ratio)}（应在 1 ± ${LIMITS[tolerance.ratio]} 内），质心偏移 ${fmt(s.shift)} pt（≤ ${LIMITS[tolerance.shift]}），形状外多余像素 ${s.stray}（应为 0）`;
const statsOk = (s, tolerance = PART_TOLERANCE) => Math.abs(s.ratio - 1) <= LIMITS[tolerance.ratio] && s.shift <= LIMITS[tolerance.shift] && s.stray === 0;

/**
 * 一个部件的一层（只画它、不画描边）：平铺叠加层（belly / accent / shine）的 alpha 是常数，颜色白（斑点、高光）或主色提亮（腹部，tone 是主色 RGB，缺省不核对颜色）；
 * 渐变填充（body / limb）每个内部像素的 alpha 都在规格范围里。polygons 是该姿态下这个部件的多边形（poseGeometry）。
 */
export function judgeLayer(role, image, polygons, { tone = null } = {}) {
  const flat = PAINT_SPEC.flat[role], range = PAINT_SPEC.fill[role];
  if (flat === undefined && !range) throw new Error(`没有 ${role} 的规格`);
  const level = flat !== undefined ? flat : (range[0] + range[1]) / 2;
  const stats = compareAlpha(image, scaledField(coverage(polygons, image.width, image.height), level));
  const inside = interiorOf(polygons, image.width, image.height, flat !== undefined ? 1 : 2);
  let pixels = 0, outside = 0, colourBad = 0, sum = [0, 0, 0];
  for (let i = 0; i < inside.length; i++) {
    if (!inside[i]) continue;
    pixels++;
    const a = image.pixels[i * 4 + 3] / 255, rgb = pixelRgb(image, i);
    if (flat !== undefined) { if (Math.abs(a - flat) > LIMITS.flatAlpha) outside++; }
    else if (a < range[0] - LIMITS.rangeSlack || a > range[1] + LIMITS.rangeSlack) outside++;
    if (role === 'accent' || role === 'shine') { if (Math.min(...rgb) < LIMITS.whiteMin) colourBad++; }
    for (let k = 0; k < 3; k++) sum[k] += rgb[k];
  }
  let detail = `${describeStats(stats)}；内部像素 ${pixels} 个里 alpha ${flat !== undefined ? `不是 ${flat}（±${LIMITS.flatAlpha}）` : `超出 ${range[0]}…${range[1]}（±${LIMITS.rangeSlack}）`}的 ${outside} 个（应为 0）`;
  let ok = statsOk(stats) && pixels > 0 && outside === 0;
  if (role === 'accent' || role === 'shine') { ok = ok && colourBad === 0; detail += `；不够白（通道 < ${LIMITS.whiteMin}）的 ${colourBad} 个（应为 0）`; }
  if (role === 'belly' && tone) {
    const want = tone.map(v => Math.min(1, v + (1 - v) * PAINT_SPEC.bellyLighten)), got = sum.map(v => v / Math.max(1, pixels));
    const error = Math.max(...got.map((v, k) => Math.abs(v - want[k])));
    ok = ok && error <= LIMITS.bellyColour; detail += `；颜色与“主色提亮 ${PAINT_SPEC.bellyLighten}”最大差 ${fmt(error)}（≤ ${LIMITS.bellyColour}）`;
  }
  if (!pixels) detail += '；没有内部像素可核对';
  return { ok, ...stats, pixels, outside, detail };
}

/**
 * 渐变填充的两端：躯干的竖直渐变从 0.93 走到 0.97，肢体从 0.92 走到 0.95。同一角色全部部件的内部像素（离边缘至少 2 个像素）合起来，
 * 最小 alpha 要靠近范围下端、最大要靠近上端。渐变的停点位置超出 1（NSGradient 不会夹取：终点只走到一半）、终点透明度改低，内部各点仍在范围里、整体质量也只差一点点，只有这一条看得出来。
 * entries：[{ image, polygons }]，每个部件一项（只画填充、不画描边的图与该姿态下的多边形）。
 */
export function judgeFillEnds(role, entries) {
  const range = PAINT_SPEC.fill[role];
  if (!range) throw new Error(`没有 ${role} 的填充范围`);
  let lo = Infinity, hi = -Infinity, pixels = 0;
  for (const { image, polygons } of entries) {
    const inside = interiorOf(polygons, image.width, image.height, 2);
    for (let i = 0; i < inside.length; i++) if (inside[i]) { const a = image.pixels[i * 4 + 3] / 255; lo = Math.min(lo, a); hi = Math.max(hi, a); pixels++; }
  }
  const ok = pixels > 0 && lo <= range[0] + LIMITS.endSlack && hi >= range[1] - LIMITS.endSlack;
  return { ok, lo, hi, pixels, detail: `内部像素 ${pixels} 个，最小 alpha ${fmt(lo)}（应 ≤ ${fmt(range[0] + LIMITS.endSlack)}）、最大 ${fmt(hi)}（应 ≥ ${fmt(range[1] - LIMITS.endSlack)}）；规格范围 ${range[0]}…${range[1]}` };
}

/**
 * 描边：withImage 是“画描边”的图，fillImage 是同一部件“不画描边”的图，二者之差就是描边自己。
 * 质量 = α × (半线宽 × 周长 × (2 − 填充均值) + π × 半线宽² × 填充均值)（圆头拐角）；描边之外（外扩半线宽 + 3 像素）不能有差；描边颜色（盖在透明处的那一圈）与 tone 同色相、比填充暗。
 */
export function judgeStroke(role, withImage, fillImage, polygons, { tone = null } = {}) {
  const { width, height } = withImage, widthPt = PAINT_SPEC.stroke[role], half = widthPt / 2;
  if (!widthPt) throw new Error(`没有 ${role} 的描边规格`);
  const mask = rasterize(polygons, width, height), inner = interiorOf(polygons, width, height, 2);
  const support = dilate(mask, width, height, Math.ceil(half * VIEW.scale) + 3);        // 留余量只为抓“画到别处去了”；线宽对不对由质量比核对
  let fillSum = 0, fillCount = 0, fillRgb = [0, 0, 0];
  for (let i = 0; i < inner.length; i++) if (inner[i]) { fillSum += fillImage.pixels[i * 4 + 3] / 255; fillCount++; const rgb = pixelRgb(fillImage, i); for (let k = 0; k < 3; k++) fillRgb[k] += rgb[k]; }
  const meanFill = fillCount ? fillSum / fillCount : NaN;
  let delta = 0, stray = 0, ringCount = 0, ring = [0, 0, 0];
  for (let i = 0; i < mask.length; i++) {
    const diff = (withImage.pixels[i * 4 + 3] - fillImage.pixels[i * 4 + 3]) / 255;
    delta += diff;
    if (diff >= 0.04 && !support[i]) stray++;
    if (!mask[i] && withImage.pixels[i * 4 + 3] >= 153 && fillImage.pixels[i * 4 + 3] === 0) { ringCount++; const rgb = pixelRgb(withImage, i); for (let k = 0; k < 3; k++) ring[k] += rgb[k]; }
  }
  // 闭合曲线的外侧半条带面积 = 半线宽 × 周长 + π × 半线宽²，内侧是 − π × 半线宽²（圆头拐角，总转角 2π）：外侧盖在透明处（alpha α），内侧盖在填充上（增加 (1 − 填充) × α）
  const expected = PAINT_SPEC.stroke.alpha * (half * perimeterOf(polygons) * (2 - meanFill) + Math.PI * half * half * meanFill);
  const ratio = delta / (VIEW.scale * VIEW.scale) / expected;
  const ringRgb = ring.map(v => v / Math.max(1, ringCount)), fillMean = fillRgb.map(v => v / Math.max(1, fillCount));
  let colourOk = ringCount >= LIMITS.strokeRingMin, colourDetail = `盖在透明处的描边像素 ${ringCount} 个（应 ≥ ${LIMITS.strokeRingMin}）`;
  if (colourOk && tone) {
    const want = hueOf(tone), got = hueOf(ringRgb), distance = hueDistance(want.hue, got.hue), darker = luma(fillMean) - luma(ringRgb);
    colourOk = got.chroma >= LIMITS.minChroma && distance <= LIMITS.hueTolerance && darker >= LIMITS.strokeDarker;
    colourDetail += `；色相差 ${fmt(distance, 0)}°（≤ ${LIMITS.hueTolerance}°，色度 ${fmt(got.chroma, 2)}），比填充暗 ${fmt(darker)}（≥ ${LIMITS.strokeDarker}）`;
  }
  const ok = Math.abs(ratio - 1) <= LIMITS.strokeRatio && stray === 0 && colourOk;
  return { ok, ratio, stray, ringCount, detail: `描边质量比 ${fmt(ratio)}（应在 1 ± ${LIMITS.strokeRatio} 内；线宽 ${widthPt} pt、α ${PAINT_SPEC.stroke.alpha}），描边外多余像素 ${stray}（应为 0）；${colourDetail}` };
}

/** 眼睛的期望形状（窗口点）：醒着是椭圆与高光，睡着（且没被抓住）是一道弧。pose 里 blink / alert / gaze / asleep / grabbed 都可省略。 */
export function eyeShapes(geometry, pose = {}) {
  const spec = PAINT_SPEC.eye, asleep = Boolean(pose.asleep) && !pose.grabbed;
  const narrow = Math.max(spec.narrowMin, Math.abs(pose.facing ?? 1)), open = Math.max(spec.openMin, 1 - (pose.blink ?? 0));
  const radius = geometry.eyeRadius * (pose.alert && !asleep ? spec.alert : 1), gaze = pose.gaze ?? [0, 0];
  return geometry.eyes.map(eye => {
    const c = [eye[0] + gaze[0] * spec.gazeX, eye[1] + gaze[1] * spec.gazeY];
    if (asleep) {
      const half = radius * spec.arcHalf * narrow;
      return { arc: bezierPolyline([[c[0] - half, c[1] + spec.arcEnd], [c[0] - spec.arcControlX * half, c[1] + spec.arcControlY], [c[0] + spec.arcControlX * half, c[1] + spec.arcControlY], [c[0] + half, c[1] + spec.arcEnd]]) };
    }
    return { disc: ellipsePolygon(c, radius * narrow, radius * open), glint: ellipsePolygon([c[0] + spec.glintDx * radius * narrow, c[1] + spec.glintDy * radius * open], spec.glintR * radius * narrow, spec.glintR * radius * open) };
  });
}

/**
 * 高光（白、α 0.85）盖在圆（深色、α 0.88）上。圆里完全覆盖的像素的预乘亮度 v = base + 0.85·g·(1 − base)：
 * base 是圆自己的预乘亮度（取这些像素的中位数——高光只占一小部分），g 是这个像素里高光的覆盖率。
 * 由 v 反推 g，再与期望的高光椭圆比面积与质心：高光的大小、位置、是否盖在圆上，都在这里；颜色空间转换不影响亮度的线性混合。
 */
export function glintEstimate(image, discPolygon, glintPolygon) {
  const { width, height } = image, disc = coverage([discPolygon], width, height), glint = coverage([glintPolygon], width, height);
  const inside = [];
  for (let i = 0; i < disc.length; i++) if (disc[i] >= 0.99) inside.push(i);
  if (inside.length < 8) return null;
  const value = i => { const a = image.pixels[i * 4 + 3] / 255; return luma(pixelRgb(image, i)) * a; };
  const sorted = inside.map(value).sort((a, b) => a - b), base = sorted[sorted.length >> 1];
  let measured = 0, expected = 0, mx = 0, my = 0, ex = 0, ey = 0;
  for (const i of inside) {
    const g = Math.max(0, (value(i) - base) / (PAINT_SPEC.eye.glintAlpha * (1 - base)));
    const x = (i % width + 0.5) / VIEW.scale, y = VIEW.height - (Math.floor(i / width) + 0.5) / VIEW.scale;
    measured += g; mx += g * x; my += g * y; expected += glint[i]; ex += glint[i] * x; ey += glint[i] * y;
  }
  if (!(expected > 0)) return null;
  const shift = measured > 0 ? Math.hypot(mx / measured - ex / expected, my / measured - ey / expected) : Infinity;
  return { ratio: measured / expected, shift };
}

/**
 * 只画眼睛的图：形状、位置与透明度（质量比、质心、多余像素），以及结构性的颜色——圆是深色、高光在圆上面是亮的、弧是深色。
 * 醒着时高光盖在圆上：alpha = 1 − (1 − 圆的 alpha)(1 − 高光的 alpha)，颜色核对只取“完全在圆里、不在高光里”与“完全在高光里”的像素。
 */
export function judgeEyeImage(image, geometry, pose = {}) {
  const { width, height } = image, spec = PAINT_SPEC.eye, shapes = eyeShapes(geometry, pose);
  const predicted = new Float32Array(width * height);
  let coreLuma = [], glintLuma = [];
  const glints = [], fullOpen = Math.max(spec.narrowMin, Math.abs(pose.facing ?? 1)) >= 0.9 && Math.max(spec.openMin, 1 - (pose.blink ?? 0)) >= 0.9;
  for (const shape of shapes) {
    if (shape.arc) {
      const field = curveCoverage(shape.arc, spec.arcWidth / 2, width, height);
      for (let i = 0; i < field.length; i++) predicted[i] = 1 - (1 - predicted[i]) * (1 - spec.alpha * field[i]);
      for (let i = 0; i < field.length; i++) if (field[i] >= 0.99) coreLuma.push(luma(pixelRgb(image, i)));
    } else {
      const disc = coverage([shape.disc], width, height), glint = coverage([shape.glint], width, height);
      for (let i = 0; i < disc.length; i++) {
        const base = spec.alpha * disc[i];
        predicted[i] = 1 - (1 - predicted[i]) * (1 - (1 - (1 - base) * (1 - spec.glintAlpha * glint[i])));
        if (disc[i] >= 0.99 && glint[i] === 0) coreLuma.push(luma(pixelRgb(image, i)));
        if (glint[i] >= 0.5) glintLuma.push(luma(pixelRgb(image, i)));
      }
      if (fullOpen) { const estimate = glintEstimate(image, shape.disc, shape.glint); if (estimate) glints.push(estimate); }
    }
  }
  const stats = compareAlpha(image, predicted);
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  const awake = shapes.length > 0 && !shapes[0].arc;
  const coreOk = coreLuma.length > 0 && mean(coreLuma) < LIMITS.inkLuma;
  // 高光盖在圆上面，所以比圆的深色部分亮得多；窄眼睛里取到的像素太少（0 个，或不足 glintMinPixels 个）时无从判断，这一项不判（静止、警觉等姿态里取得到）
  const contrast = glintLuma.length && coreLuma.length ? mean(glintLuma) - mean(coreLuma) : NaN;
  const glintShape = glints.length === 0 || glints.every(g => g.ratio >= LIMITS.glintRatioMin && g.ratio <= LIMITS.glintRatioMax && g.shift <= LIMITS.glintShift);
  const glintOk = !awake || ((glintLuma.length < LIMITS.glintMinPixels || contrast >= LIMITS.glintContrast) && glintShape);
  const contrastText = glintLuma.length >= LIMITS.glintMinPixels ? `${fmt(contrast)}（${glintLuma.length} 个像素，应 ≥ ${LIMITS.glintContrast}，盖在圆上面）`
    : glintLuma.length ? `${fmt(contrast)}（只取到 ${glintLuma.length} 个像素，少于 ${LIMITS.glintMinPixels} 个，不判）` : '（取不到像素，不判）';
  const glintText = glints.length ? `；高光面积比 ${fmt(Math.min(...glints.map(g => g.ratio)))}–${fmt(Math.max(...glints.map(g => g.ratio)))}（应在 ${LIMITS.glintRatioMin}…${LIMITS.glintRatioMax}），质心偏移 ${fmt(Math.max(...glints.map(g => g.shift)))} pt（≤ ${LIMITS.glintShift}）` : '';
  return {
    ok: statsOk(stats, FACE_TOLERANCE) && coreOk && glintOk, ...stats,
    detail: `${describeStats(stats, FACE_TOLERANCE)}；${shapes[0]?.arc ? '弧' : '圆'}的颜色亮度 ${coreLuma.length ? fmt(mean(coreLuma)) : '无像素'}（${coreLuma.length} 个像素，应 < ${LIMITS.inkLuma}，深色）${awake ? `；高光比圆亮 ${contrastText}${glintText}` : ''}`,
  };
}

/** 只画腮红的图：椭圆（水平半径随朝向变窄），粉色。 */
export function judgeBlushImage(image, geometry, pose = {}) {
  const { width, height } = image, narrow = Math.max(PAINT_SPEC.eye.narrowMin, Math.abs(pose.facing ?? 1));
  const predicted = new Float32Array(width * height);
  const cores = [];
  for (const spot of geometry.blush) {
    const field = coverage([ellipsePolygon(spot.center, spot.rx * narrow, spot.ry)], width, height);
    for (let i = 0; i < field.length; i++) { predicted[i] = 1 - (1 - predicted[i]) * (1 - PAINT_SPEC.blushAlpha * field[i]); if (field[i] >= 0.99) cores.push(pixelRgb(image, i)); }
  }
  const stats = compareAlpha(image, predicted);
  const mean = cores.length ? [0, 1, 2].map(k => cores.reduce((s, rgb) => s + rgb[k], 0) / cores.length) : null;
  const pink = mean ? hueDistance(hueOf(mean).hue, LIMITS.pinkHue) : NaN;
  const colourOk = Boolean(mean) && pink <= LIMITS.pinkTolerance && hueOf(mean).chroma >= LIMITS.pinkChroma;
  return { ok: statsOk(stats, FACE_TOLERANCE) && colourOk, ...stats, detail: `${describeStats(stats, FACE_TOLERANCE)}；颜色色相与粉色（${LIMITS.pinkHue}°）相差 ${fmt(pink, 0)}°（≤ ${LIMITS.pinkTolerance}°，${cores.length} 个像素）` };
}

/** 只画微笑的图：沿曲线加粗到 1.2 pt、两端圆头；睡着（且没被抓住）时不画，期望为空。没有嘴的动物返回 null。 */
export function judgeMouthImage(image, geometry, pose = {}) {
  if (!geometry.mouth) return null;
  const asleep = Boolean(pose.asleep) && !pose.grabbed;
  const predicted = asleep ? new Float32Array(image.width * image.height) : scaledField(curveCoverage(bezierPolyline(geometry.mouth), PAINT_SPEC.mouth.width / 2, image.width, image.height), PAINT_SPEC.mouth.alpha);
  const stats = compareAlpha(image, predicted);
  let darkLuma = [];
  if (!asleep) for (let i = 0; i < predicted.length; i++) if (predicted[i] >= PAINT_SPEC.mouth.alpha * 0.99) darkLuma.push(luma(pixelRgb(image, i)));
  const colourOk = asleep || (darkLuma.length > 0 && darkLuma.reduce((a, b) => a + b, 0) / darkLuma.length < LIMITS.inkLuma);
  return { ok: statsOk(stats, FACE_TOLERANCE) && colourOk, ...stats, detail: `${asleep ? '睡着：应什么都没有；' : ''}${describeStats(stats, FACE_TOLERANCE)}${asleep ? '' : `；线的颜色亮度 ${darkLuma.length ? fmt(darkLuma.reduce((a, b) => a + b, 0) / darkLuma.length) : '无像素'}（${darkLuma.length} 个像素，应 < ${LIMITS.inkLuma}）`}` };
}

/** 把各层（按绘制顺序）在这里叠起来（预乘 alpha，浮点），与整只图比较：返回最大通道差（0–255）与超过 tolerance 的通道数。 */
export function judgeComposite(layers, full, tolerance = LIMITS.composeTolerance) {
  const count = full.width * full.height, acc = new Float64Array(count * 4);
  for (const layer of layers) {
    if (layer.width !== full.width || layer.height !== full.height) return { ok: false, worst: Infinity, over: Infinity, detail: `尺寸 ${layer.width}×${layer.height} 对 ${full.width}×${full.height}` };
    for (let i = 0; i < count; i++) {
      const a = layer.pixels[i * 4 + 3] / 255; if (!a) continue;
      const keep = 1 - a;
      for (let k = 0; k < 3; k++) acc[i * 4 + k] = layer.pixels[i * 4 + k] / 255 * a + acc[i * 4 + k] * keep;
      acc[i * 4 + 3] = a + acc[i * 4 + 3] * keep;
    }
  }
  let worst = 0, over = 0;
  for (let i = 0; i < count; i++) {
    const a = full.pixels[i * 4 + 3] / 255;
    const target = [full.pixels[i * 4] / 255 * a, full.pixels[i * 4 + 1] / 255 * a, full.pixels[i * 4 + 2] / 255 * a, a];
    for (let k = 0; k < 4; k++) { const d = Math.abs(target[k] - acc[i * 4 + k]) * 255; worst = Math.max(worst, d); if (d > tolerance) over++; }
  }
  return { ok: over === 0, worst, over, detail: `${layers.length} 层叠起来与整只图最大相差 ${fmt(worst, 2)}/255，超过 ${tolerance}/255 的通道 ${over} 个（应为 0）` };
}

// ---------- 元素用例（direct：直接画，不经过 JellyView） ----------

export const ALL_POSE = Object.freeze({ facing: -1, pitch: 0.35, wave: -1 });     // 朝左、抬头、尾向下摆（与 pose-all 同一个姿态）
/** 脸的几种姿态（只画眼睛 / 腮红 / 微笑时用）：静止、朝左抬头划水、转身途中、眨眼、警觉、瞳孔看向右下、睡着、睡着又被抓住、睡着时转身途中（弧的宽度也随朝向变窄）、睡着时警觉（睡着时警觉无效，弧不放大）、几乎正对（朝向低于下限 0.35，眼睛只变窄到下限）。
 *  不含“完全闭眼”：闭眼的眼睛只剩约 1.2 个像素高的细条，CoreGraphics 的抗锯齿与 4×4 超采样预测相差 ±7%，没有可靠的判据；下限 0.12 由源码钉子守（见单元测试）。 */
export const FACE_VARIANTS = Object.freeze({
  rest: Object.freeze({}), all: ALL_POSE, half: Object.freeze({ facing: 0.5 }), blink: Object.freeze({ blink: 0.6 }), alert: Object.freeze({ alert: true }),
  gaze: Object.freeze({ gaze: Object.freeze([1, -0.5]) }), asleep: Object.freeze({ asleep: true }), grabbed: Object.freeze({ asleep: true, grabbed: true }),
  asleepHalf: Object.freeze({ asleep: true, facing: 0.5 }), asleepAlert: Object.freeze({ asleep: true, alert: true }), turned: Object.freeze({ facing: 0.2 }),
});
export const FACE_KINDS = Object.freeze({
  eyes: Object.freeze(['rest', 'all', 'half', 'blink', 'alert', 'gaze', 'asleep', 'grabbed', 'asleepHalf', 'asleepAlert', 'turned']),
  blush: Object.freeze(['rest', 'all', 'half']),
  mouth: Object.freeze(['rest', 'all', 'asleep', 'grabbed']),
});
export const soloName = (species, what) => `${species}-solo-${what}`;

/** 元素用例：整只（直接画）、每个部件单独（有描边 / 只有填充 / 朝左抬头划水）、脸的每个元素在各个姿态下单独。 */
export function elementCases(species) {
  const parts = Shapes.native(species)?.parts;
  if (!parts) throw new Error(`没有 ${species} 的形状数据`);
  const direct = { species, direct: true }, solid = { look: 'solid', colors: [5] }, blend = { look: 'blend', colors: [5, 0] };
  const hideFace = { eyes: false, blush: false, mouth: false };
  const cases = [{ ...direct, name: `${species}-direct`, ...solid }, { ...direct, name: `${species}-direct-all`, ...blend, ...ALL_POSE, show: { strokes: false } }];
  parts.forEach((part, index) => {
    cases.push({ ...direct, name: soloName(species, `p${index}`), ...solid, show: { parts: [index], ...hideFace } });
    if (part.role === 'body' || part.role === 'limb') cases.push({ ...direct, name: soloName(species, `p${index}-fill`), ...solid, show: { parts: [index], strokes: false, ...hideFace } });
    cases.push({ ...direct, name: soloName(species, `p${index}-all`), ...blend, ...ALL_POSE, show: { parts: [index], strokes: false, ...hideFace } });
  });
  const hasMouth = Boolean(Shapes.native(species).mouth);
  for (const [kind, variants] of Object.entries(FACE_KINDS)) {
    if (kind === 'mouth' && !hasMouth) continue;
    for (const variant of variants) {
      cases.push({ ...direct, name: soloName(species, `${kind}-${variant}`), ...(variant === 'all' ? blend : solid), ...FACE_VARIANTS[variant], show: { parts: [], eyes: kind === 'eyes', blush: kind === 'blush', mouth: kind === 'mouth' } });
    }
  }
  return cases;
}

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
  cases.push({ ...blend, name: `${species}-asleep-grabbed`, asleep: true, grabbed: true });
  cases.push({ ...blend, name: `${species}-night`, night: 1, dark: true });
  cases.push({ ...blend, name: `${species}-night-light`, night: 1 });
  cases.push({ ...base, name: `${species}-alert`, look: 'solid', colors: [5], alert: true });
  cases.push({ ...base, name: `${species}-ripples`, look: 'solid', colors: [5], ripples: true });
  return [...cases, ...elementCases(species)];
}

// ---------- 检查清单 ----------

/**
 * 每个物种、每一组应有的检查条数（一次完整的真实渲染实测）。
 * 静默少掉一条检查——有人删了一行 add(…)、判定函数提前 return、分支条件写反——比一条检查失败更危险：输出只是少一条，仍然写着“全部通过”。
 * 系统性变异检查发现：删掉某个 add(…) 语句，之前没有任何东西会失败。所以条数也是契约：清单对不上就算失败（见 main），
 * 新增检查或新增动物时，把一次完整渲染里各组的条数（运行输出里的 `[组名] 通过/总数` 的总数）写进这里。
 */
export const CHECK_MANIFEST = Object.freeze({
  hammer: Object.freeze({ 分辨力: 1, 轮廓: 10, 颜色: 57, 外观: 4, 明暗: 21, 眼睛: 5, 被抓住: 3, 窗口外圈: 7, 睡觉标记: 3, 涟漪: 3, 元素: 33, 叠层: 3 }),
  manta: Object.freeze({ 分辨力: 1, 轮廓: 10, 颜色: 61, 外观: 4, 明暗: 9, 眼睛: 5, 被抓住: 3, 窗口外圈: 7, 睡觉标记: 3, 涟漪: 3, 元素: 33, 叠层: 3 }),
  turtle: Object.freeze({ 分辨力: 1, 轮廓: 10, 颜色: 93, 外观: 4, 明暗: 17, 眼睛: 3, 被抓住: 2, 微笑: 13, 腹部: 1, 壳纹: 3, 窗口外圈: 7, 睡觉标记: 3, 涟漪: 3, 元素: 50, 叠层: 3 }),
  whaleshark: Object.freeze({ 分辨力: 1, 轮廓: 10, 颜色: 61, 外观: 4, 明暗: 17, 眼睛: 3, 被抓住: 2, 微笑: 13, 腹部: 1, 斑点: 3, 窗口外圈: 7, 睡觉标记: 3, 涟漪: 3, 元素: 41, 叠层: 3 }),
});

/** 把一个物种的检查行按组计数，与清单比较：一致返回 null，否则返回说明（哪一组应有几条、实际几条；没登记清单也算不一致）。 */
export function manifestProblem(species, lines, manifest = CHECK_MANIFEST) {
  const expected = manifest[species];
  if (!expected) return `${species} 没有登记检查清单（新增动物时，把一次完整渲染里各组的条数写进 CHECK_MANIFEST）`;
  const actual = {};
  for (const line of lines) actual[line.group] = (actual[line.group] || 0) + 1;
  const problems = [];
  for (const group of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const want = expected[group] || 0, got = actual[group] || 0;
    if (want !== got) problems.push(`[${group}] 应有 ${want} 条、实际 ${got} 条`);
  }
  return problems.length ? problems.join('；') : null;
}

/**
 * 把一个物种的全部检查结果整理成要打印的行与计数：按组“通过/总数”，失败的项（--verbose 时连通过的）带名称与说明，最后核对检查清单。
 * 清单对不上算一项失败，计入 total/failed：少掉的检查与失败的检查同样不能放过。纯函数，打印交给命令行。
 */
export function reportSpecies(species, lines, { verbose = false, manifest = CHECK_MANIFEST } = {}) {
  const output = [], groups = new Map();
  let total = 0, failed = 0;
  for (const line of lines) { if (!groups.has(line.group)) groups.set(line.group, []); groups.get(line.group).push(line); }
  for (const [group, items] of groups) {
    output.push(`[${group}] ${items.filter(item => item.ok).length}/${items.length}`);
    for (const item of items) {
      total++; if (!item.ok) failed++;
      if (!item.ok || verbose) output.push(`  ${item.ok ? '✓' : '✗'} ${item.name}：${item.detail}`);
    }
  }
  const problem = manifestProblem(species, lines, manifest);
  if (problem) { total++; failed++; output.push('[检查清单] 0/1', `  ✗ 检查的条数与清单不一致：${problem}`); }
  return { output, total, failed };
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

/** 请求里的 show 换成渲染工具会原样回报的样子（键按字母序，没写的项是“画”）。 */
export const expectedShow = show => ({ blush: show?.blush ?? true, eyes: show?.eyes ?? true, mouth: show?.mouth ?? true, parts: show?.parts ? [...show.parts].sort((a, b) => a - b) : null, strokes: show?.strokes ?? true });

// ---------- 逐项检查 ----------

const FACE_LABELS = Object.freeze({ rest: '静止', all: '朝左抬头划水', half: '转身途中', blink: '眨眼', alert: '警觉', gaze: '瞳孔看向右下', asleep: '睡着', grabbed: '睡着又被抓住', asleepHalf: '睡着时转身途中', asleepAlert: '睡着时警觉（弧不放大）', turned: '几乎正对（眼睛变窄到下限）' });

/** “元素”与“叠层”两组检查（用例见 elementCases）。J 是判定函数表（checkSpecies 传进来；测试里可以只替换其中几个，不必跑整套检查）。 */
export function checkElements(species, find, palette, add, J) {
  const rest = { facing: 1, pitch: 0, wave: 0 }, restGeometry = poseGeometry(species, rest), allGeometry = poseGeometry(species, ALL_POSE);
  const primary = palette[LOOKS.solid[0]];          // 纯色花纹：躯干、肢体、腹部的主色都是它
  restGeometry.parts.forEach((part, index) => {
    const label = `${part.role}#${index}`, stroked = part.role === 'body' || part.role === 'limb';
    const layerImage = find(soloName(species, stroked ? `p${index}-fill` : `p${index}`));
    const layer = J.judgeLayer(part.role, layerImage, part.polygons, { tone: primary });
    add('元素', `${label}：形状与透明度`, layer.ok, layer.detail);
    if (stroked) {
      const stroke = J.judgeStroke(part.role, find(soloName(species, `p${index}`)), layerImage, part.polygons, { tone: primary });
      add('元素', `${label}：描边`, stroke.ok, stroke.detail);
    }
    const moved = J.judgeLayer(part.role, find(soloName(species, `p${index}-all`)), allGeometry.parts[index].polygons, { tone: primary });
    add('元素', `${label}（朝左抬头划水）：形状与透明度`, moved.ok, moved.detail);
  });
  for (const role of ['body', 'limb']) {
    const entries = restGeometry.parts.flatMap((part, index) => part.role === role ? [{ image: find(soloName(species, `p${index}-fill`)), polygons: part.polygons }] : []);
    const ends = J.judgeFillEnds(role, entries);
    add('元素', `${role === 'body' ? '躯干' : '肢体'}渐变的两端（${role === 'body' ? '全部躯干' : '全部肢体'}部件合起来）`, ends.ok, ends.detail);
  }
  for (const variant of FACE_KINDS.eyes) {
    const pose = FACE_VARIANTS[variant], verdict = J.judgeEyeImage(find(soloName(species, `eyes-${variant}`)), poseGeometry(species, pose), pose);
    add('元素', `眼睛（${FACE_LABELS[variant]}）`, verdict.ok, verdict.detail);
  }
  for (const variant of FACE_KINDS.blush) {
    const pose = FACE_VARIANTS[variant], verdict = J.judgeBlushImage(find(soloName(species, `blush-${variant}`)), poseGeometry(species, pose), pose);
    add('元素', `腮红（${FACE_LABELS[variant]}）`, verdict.ok, verdict.detail);
  }
  if (restGeometry.mouth) {
    for (const variant of FACE_KINDS.mouth) {
      const pose = FACE_VARIANTS[variant], verdict = J.judgeMouthImage(find(soloName(species, `mouth-${variant}`)), poseGeometry(species, pose), pose);
      add('元素', `微笑（${FACE_LABELS[variant]}）`, verdict.ok, verdict.detail);
    }
  }
  const faceLayers = variant => [find(soloName(species, `eyes-${variant}`)), find(soloName(species, `blush-${variant}`)), ...(restGeometry.mouth ? [find(soloName(species, `mouth-${variant}`))] : [])];
  const stacked = J.judgeComposite([...restGeometry.parts.map((_, index) => find(soloName(species, `p${index}`))), ...faceLayers('rest')], find(`${species}-direct`));
  add('叠层', '静止：各层按绘制顺序叠起来 = 整只图', stacked.ok, stacked.detail);
  const stackedAll = J.judgeComposite([...restGeometry.parts.map((_, index) => find(soloName(species, `p${index}-all`))), ...faceLayers('all')], find(`${species}-direct-all`));
  add('叠层', '朝左抬头划水（不画描边）：各层叠起来 = 整只图', stackedAll.ok, stackedAll.detail);
  const same = identicalImages(find(`${species}-direct`), find(`${species}-solid`));
  add('叠层', '直接画（SpeciesPainter.draw）与产品视图（JellyView）画的整只图逐像素相同', same.same, same.detail);
}

/** judges：只给测试用——替换其中几个判定函数，验证它们的结果真的进入结论（接线）；不传就是真实的判定。 */
export function checkSpecies(species, images, palette, judges = {}) {
  const J = { judgeSmile, judgeBelly, judgeSpots, judgeSeams, strayPixels, judgeLayer, judgeFillEnds, judgeStroke, judgeEyeImage, judgeBlushImage, judgeMouthImage, judgeComposite, ...judges };
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

  // 3b) 被抓住：睡着的动物被抓住时醒来——眼睛睁开、没有 “z”（与醒着一样）
  const grabbed = find(`${species}-asleep-grabbed`);
  for (const result of judgeEyes(species, grabbed, rest)) add('被抓住', `睡着又被抓住：眼睛睁开 ${result.name}`, result.ok, result.detail);
  const grabbedMarks = J.strayPixels(species, grabbed, rest);
  add('被抓住', '睡着又被抓住：轮廓外没有 “z”', grabbedMarks === 0, `${grabbedMarks} 个`);

  // 3c) 微笑（只有侧视动物有嘴）：醒着时每个姿态下沿曲线都是墨色，睡着时没有，睡着又被抓住时有
  if (smilePoints(geometryRest).length) {
    for (const [label, pose, name] of poses) {
      const smile = J.judgeSmile(species, find(name), pose, true);
      add('微笑', `${label || '静止姿态'}：醒着时沿曲线是墨色`, smile.ok, smile.detail);
    }
    for (const [label, pose, name] of [['睡着（朝右）', { facing: 1, pitch: 0, wave: 0 }, `${species}-asleep`], ['睡着（朝左）', { facing: -1, pitch: 0, wave: 0 }, `${species}-asleep-left`]]) {
      const smile = J.judgeSmile(species, find(name), pose, false);
      add('微笑', `${label}：沿曲线没有墨色`, smile.ok, smile.detail);
    }
    const awake = J.judgeSmile(species, grabbed, rest, true);
    add('微笑', '睡着又被抓住：沿曲线是墨色', awake.ok, awake.detail);
  }

  // 3d) 腹部（只有有腹部部件的动物）：纯色花纹里比躯干亮；色相已在“颜色”组里按主色核对
  const belly = J.judgeBelly(species, find(`${species}-solid`), points);
  if (belly) add('腹部', '纯色花纹里腹部比躯干代表点更亮', belly.ok, belly.detail);

  // 3e) 斑点或壳纹（只有有 accent 部件的动物）：白色 × alpha 盖在躯干上；三种有代表性的花纹。accent 全是小圆走斑点（鲸鲨），否则走壳纹的细带网（海龟）
  const accent = accentKind(species);
  for (const look of ['solid', 'blend', 'rainbow']) {
    if (accent === 'spots') {
      const spots = J.judgeSpots(species, find(`${species}-${look}`));
      if (spots) add('斑点', `${look}：斑点中心是白色 × α 盖在躯干上的颜色`, spots.ok, spots.detail);
    } else if (accent === 'seams') {
      const seams = J.judgeSeams(species, find(`${species}-${look}`));
      if (seams) add('壳纹', `${look}：壳纹中心是白色 × α 盖在躯干上的颜色`, seams.ok, seams.detail);
    }
  }

  // 4) 窗口外圈与多余像素
  add('窗口外圈', '夜晚荧光（深色外观）不碰窗口边缘', borderMaxAlpha(find(`${species}-night`)) <= LIMITS.borderAlpha, `最外 ${BORDER_PT} pt 内最大 alpha ${borderMaxAlpha(find(`${species}-night`))}（≤ ${LIMITS.borderAlpha}）`);
  add('窗口外圈', '夜晚荧光（浅色外观）不碰窗口边缘', borderMaxAlpha(find(`${species}-night-light`)) <= LIMITS.borderAlpha, `最外 ${BORDER_PT} pt 内最大 alpha ${borderMaxAlpha(find(`${species}-night-light`))}（≤ ${LIMITS.borderAlpha}）`);
  const glow = J.strayPixels(species, find(`${species}-night`), rest, { threshold: 8 });
  add('窗口外圈', '夜晚确实有光晕', glow > 500, `轮廓外 alpha ≥ 8 的像素 ${glow} 个（应 > 500）`);
  for (const [look] of Object.entries(LOOKS)) {
    const stray = J.strayPixels(species, find(`${species}-${look}`), rest);
    add('窗口外圈', `${look}：白天醒着时轮廓外没有多余像素`, stray === 0, `${stray} 个`);
  }
  const marks = J.strayPixels(species, find(`${species}-asleep`), rest);
  add('睡觉标记', '睡着时轮廓外出现 “z”', marks > 25, `${marks} 个像素（应 > 25）`);
  const centre = poseGeometry(species, rest).target;
  for (const [label, facing, name] of [['朝右', 1, `${species}-asleep`], ['朝左', -1, `${species}-asleep-left`]]) {
    const z = strayStats(species, find(name), { facing, pitch: 0, wave: 0 });
    // 头端的锚点：并集包围盒前端往里 12% 宽、顶端（规格：z 在头的前上方），按朝向放到窗口里；z 要在它的外侧（向前、向上飘）而不是往身体里飘
    const union = Shapes.union(species), geometryAt = poseGeometry(species, { facing, pitch: 0, wave: 0 });
    const anchor = [geometryAt.target[0] + facing * ((union.maxX - (union.maxX - union.minX) * 0.12) - geometryAt.mid[0]), geometryAt.target[1] + (union.maxY - geometryAt.mid[1])];
    const mark = judgeSleepMark(z, { centre, anchor, facing });
    add('睡觉标记', `${label}睡着时 “z” 在头的一侧、身体上方、向外飘、离锚点不远`, mark.ok, mark.detail);
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

  // 6) 元素：每个元素单独画一遍（只画它），独立量形状、透明度、描边与颜色；再把各层叠起来对整只图
  checkElements(species, find, palette, add, J);
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
    const asked = new Map(cases.map(item => [item.name, item]));
    for (const entry of manifest) {
      if (entry.species !== species) throw new Error(`${entry.name}：请求 ${species}，原生实际画的是 ${entry.species}`);
      const request = asked.get(entry.name);
      if (!request) throw new Error(`${entry.name}：渲染工具报告了一个没有请求过的用例`);
      // 直接画还是经 JellyView 画：工具不报告（旧版）或报告得不一样，“只画一个元素”的各项检查拿到的就可能是整只图
      const wantDirect = Boolean(request.direct);
      if (entry.direct !== wantDirect) throw new Error(`${entry.name}：请求${wantDirect ? '直接画' : '经 JellyView 画'}，渲染工具报告的是 ${entry.direct === undefined ? '没有报告（旧版渲染工具？）' : entry.direct ? '直接画' : '经 JellyView 画'}`);
      // 渲染工具报告产品自己判断的外观名：没切过去，“深浅两种外观下动物相同”之类的检查就是空检查（旧版渲染工具不报告，同样要拒绝）；直接画与外观无关，报告 none
      const wantAppearance = wantDirect ? 'none' : request.dark ? 'dark' : 'light';
      if (entry.appearance !== wantAppearance) throw new Error(`${entry.name}：请求${wantAppearance === 'none' ? '直接画（与外观无关）' : wantAppearance === 'dark' ? '深色外观' : '浅色外观'}，渲染工具报告的是 ${entry.appearance === undefined ? '没有报告（旧版渲染工具？）' : entry.appearance}`);
      // 元素可见性原样回报：工具忽略了 show，“只画这一个”的图就是整只图
      const wantShow = expectedShow(request.show);
      if (JSON.stringify(entry.show) !== JSON.stringify(wantShow)) throw new Error(`${entry.name}：请求的元素可见性是 ${JSON.stringify(wantShow)}，渲染工具报告的是 ${entry.show === undefined ? '没有报告（旧版渲染工具？）' : JSON.stringify(entry.show)}`);
      images[entry.name] = decodePng(entry.file);
      allImages[entry.name] = images[entry.name];
    }
    const palette = (() => {
      const result = spawnSync(binary, ['--palette'], { encoding: 'utf8' });
      return result.status === 0 ? JSON.parse(result.stdout) : null;
    })();
    if (!palette) throw new Error('渲染工具没有给出调色板');
    console.log(`\n== ${species} ==`);
    const report = reportSpecies(species, checkSpecies(species, images, palette), { verbose: flag('verbose') });
    console.log(report.output.join('\n'));
    total += report.total; failed += report.failed;
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
