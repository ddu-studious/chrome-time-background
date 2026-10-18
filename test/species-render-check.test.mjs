// desktop-reminder/species-render.mjs 的分析函数：用合成图像核对“检查本身”是否可靠（能放过对的、拦住错的）。
// 渲染工具本身需要 swiftc 与 AppKit，属于隔离验收（node desktop-reminder/species-render.mjs），不在这里编译。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, chmodSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from '../desktop-reminder/png-decode.mjs';
import * as R from '../desktop-reminder/species-render.mjs';

const Shapes = createRequire(import.meta.url)('../js/jelly-species-shapes.js');
const W = R.VIEW.width * R.VIEW.scale, H = R.VIEW.height * R.VIEW.scale;

const blank = () => ({ width: W, height: H, pixels: Buffer.alloc(W * H * 4) });
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const count = mask => mask.reduce((sum, v) => sum + v, 0);
/** 把一个 0/1 轮廓画成不透明的纯色图像。 */
const fromMask = (mask, rgb = [120, 180, 220]) => {
  const image = blank();
  for (let i = 0; i < mask.length; i++) if (mask[i]) { image.pixels[i * 4] = rgb[0]; image.pixels[i * 4 + 1] = rgb[1]; image.pixels[i * 4 + 2] = rgb[2]; image.pixels[i * 4 + 3] = 255; }
  return image;
};
const paintBlock = (image, point, rgb, radius = 3) => {
  const [cx, cy] = R.toPixel(point[0], point[1]);
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const at = ((Math.floor(cy) + dy) * image.width + Math.floor(cx) + dx) * 4;
    image.pixels[at] = Math.round(rgb[0] * 255); image.pixels[at + 1] = Math.round(rgb[1] * 255); image.pixels[at + 2] = Math.round(rgb[2] * 255); image.pixels[at + 3] = 255;
  }
};
// 色相相隔很远的三个色位（红、绿、蓝），其余随便
const PALETTE = Array.from({ length: 8 }, () => [0.5, 0.5, 0.5]);
PALETTE[0] = [1, 0.1, 0.1]; PALETTE[3] = [0.1, 1, 0.1]; PALETTE[5] = [0.1, 0.1, 1];

test('flatten：直线路径、两个子路径、贝塞尔取样点数', () => {
  const box = Shapes.native('hammer').parts.find(p => p.role === 'body').cmds;
  assert.equal(R.flatten(box).length, 1);
  const two = R.flatten([{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'L', pts: [[4, 0]] }, { cmd: 'L', pts: [[4, 4]] }, { cmd: 'Z', pts: [] }, { cmd: 'M', pts: [[10, 10]] }, { cmd: 'L', pts: [[14, 10]] }, { cmd: 'L', pts: [[14, 14]] }, { cmd: 'Z', pts: [] }]);
  assert.equal(two.length, 2); assert.deepEqual(two.map(p => p.length), [3, 3]);
  const curve = R.flatten([{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'C', pts: [[1, 2], [3, 2], [4, 0]] }, { cmd: 'Z', pts: [] }]);
  assert.equal(curve[0].length, 1 + Shapes.SAMPLES, '每段 C 取 SAMPLES 个点（含终点）');
  assert.deepEqual(curve[0][curve[0].length - 1], [4, 0]);
});

test('rasterize：面积正确；同一部件里的子路径用偶奇规则（洞）', () => {
  const outer = square(10, 10, 30, 30), inner = square(15, 15, 25, 25);     // 20×20 pt 与 10×10 pt → 40×40 与 20×20 像素
  assert.equal(count(R.rasterize([outer])), 1600);
  assert.equal(count(R.rasterize([outer, inner])), 1600 - 400, '一个部件里的内层子路径是洞');
});

test('unionMask：不同部件取并集，重叠处不能挖洞（偶奇规则只用于同一部件的子路径；曾经把重叠的躯干与高光挖出洞）', () => {
  const geometry = { parts: [{ polygons: [square(10, 10, 30, 30)] }, { polygons: [square(15, 15, 25, 25)] }] };
  assert.equal(count(R.unionMask(geometry, W, H)), 1600, '内部的部件在外部部件里面：并集仍是外部部件');
  const partly = { parts: [{ polygons: [square(10, 10, 30, 30)] }, { polygons: [square(20, 20, 40, 40)] }] };
  assert.equal(count(R.unionMask(partly, W, H)), 1600 + 1600 - 400);
});

test('dilate：十字形膨胀；iou：相同 1、不相交 0、一半重叠 1/3', () => {
  const mask = new Uint8Array(25); mask[12] = 1;
  const grown = R.dilate(mask, 5, 5, 1);
  assert.equal(count(grown), 5); assert.deepEqual([...grown].map((v, i) => v ? i : -1).filter(i => i >= 0), [7, 11, 12, 13, 17]);
  const a = new Uint8Array([1, 1, 0, 0]), b = new Uint8Array([0, 1, 1, 0]);
  assert.equal(R.iou(a, a), 1); assert.equal(R.iou(a, new Uint8Array([0, 0, 1, 1])), 0); assert.ok(Math.abs(R.iou(a, b) - 1 / 3) < 1e-12);
});

test('hueOf / hueDistance / mix', () => {
  assert.equal(R.hueOf([1, 0, 0]).hue, 0); assert.equal(R.hueOf([0, 1, 0]).hue, 120); assert.equal(R.hueOf([0, 0, 1]).hue, 240);
  assert.equal(R.hueOf([0.5, 0.5, 0.5]).chroma, 0);
  assert.equal(R.hueDistance(350, 10), 20); assert.equal(R.hueDistance(10, 350), 20); assert.equal(R.hueDistance(0, 180), 180);
  assert.deepEqual(R.mix([0, 0, 0], [1, 2, 4], 0.5), [0.5, 1, 2]);
});

test('取色规则（规格）：纯色全主色；双色躯干主色、肢体第二色；渐变躯干由尾到头主→第二、肢体 7:3；七彩由尾到头主→第二→第三', () => {
  const tints = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  assert.deepEqual(R.bodyTone('solid', tints, 0.9), tints[0]); assert.deepEqual(R.limbToneOf('solid', tints, 0.1), tints[0]);
  assert.deepEqual(R.bodyTone('duo', tints, 0.1), tints[0]); assert.deepEqual(R.limbToneOf('duo', tints, 0.9), tints[1]);
  assert.deepEqual(R.bodyTone('blend', tints, 0), tints[0]); assert.deepEqual(R.bodyTone('blend', tints, 1), tints[1]);
  assert.deepEqual(R.limbToneOf('blend', tints, 0.2).map(v => Math.round(v * 100) / 100), [0.3, 0.7, 0]);
  assert.deepEqual(R.bodyTone('rainbow', tints, 0), tints[0]); assert.deepEqual(R.bodyTone('rainbow', tints, 0.5), tints[1]); assert.deepEqual(R.bodyTone('rainbow', tints, 1), tints[2]);
  assert.deepEqual(R.limbToneOf('rainbow', tints, 0.25).map(v => Math.round(v * 100) / 100), [0.5, 0.5, 0]);
});

test('insidePolygons / edgeDistance', () => {
  const box = [square(0, 0, 10, 10)];
  assert.equal(R.insidePolygons([5, 5], box), true); assert.equal(R.insidePolygons([15, 5], box), false);
  assert.equal(R.edgeDistance([5, 5], box), 5); assert.equal(R.edgeDistance([13, 5], box), 3);
  const ring = [square(0, 0, 10, 10), square(3, 3, 7, 7)];
  assert.equal(R.insidePolygons([5, 5], ring), false, '内层子路径是洞'); assert.equal(R.insidePolygons([1, 1], ring), true);
});

test('poseGeometry 的约定：顶端离窗口底边 91 pt；朝左是左右镜像；抬头时头端升高（两个朝向都是）；wave +1 尾端升高', () => {
  const rest = R.poseGeometry('hammer');
  const allPoints = geometry => geometry.parts.flatMap(part => part.polygons.flat());
  const top = Math.max(...allPoints(rest).map(p => p[1]));
  assert.ok(top <= R.TOP_ABOVE_BOTTOM + 1e-9 && top > R.TOP_ABOVE_BOTTOM - 8, `最高点 ${top}`);
  assert.ok(Math.abs(rest.target[1] + (Shapes.union('hammer').maxY - Shapes.union('hammer').minY) / 2 - R.TOP_ABOVE_BOTTOM) < 1e-9, '并集顶端恰好在 91 pt');

  const left = R.poseGeometry('hammer', { facing: -1 });
  rest.parts.forEach((part, i) => part.polygons.forEach((poly, j) => poly.forEach((p, k) => {
    const q = left.parts[i].polygons[j][k];
    assert.ok(Math.abs(q[0] - (R.VIEW.width - p[0])) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9, '朝左 = 绕窗口竖直中线镜像');
  })));

  // 按部件（而不是“最靠右的点”：转过去之后最靠右的是另一个顶点）看质心。小锤头鲨的部件：胸鳍×2（u 0.57）、尾鳍（u 0.1）、躯干、锤头（最后一个躯干部件）、高光
  const centroidOf = part => { const pts = part.polygons.flat(); return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]; };
  const head = geometry => centroidOf(geometry.parts.filter(part => part.role === 'body').pop());
  const tail = geometry => centroidOf(geometry.parts.find(part => part.role === 'limb' && part.u === 0.1));
  assert.ok(head(rest)[0] > rest.target[0], '朝右时头在中心右边');
  assert.ok(head(R.poseGeometry('hammer', { facing: 1, pitch: 0.35 }))[1] > head(rest)[1] + 5, '朝右抬头：头升高');
  assert.ok(head(left)[0] < left.target[0], '朝左时头在中心左边');
  assert.ok(head(R.poseGeometry('hammer', { facing: -1, pitch: 0.35 }))[1] > head(left)[1] + 5, '朝左抬头：头同样升高（先转后翻）');
  assert.ok(tail(R.poseGeometry('hammer', { facing: 1, pitch: 0.35 }))[1] < tail(rest)[1] - 5, '抬头时尾巴降低');
  assert.ok(tail(R.poseGeometry('hammer', { wave: 1 }))[1] > tail(rest)[1] + 2 && tail(R.poseGeometry('hammer', { wave: -1 }))[1] < tail(rest)[1] - 2, 'wave +1 尾鳍升高、−1 降低');
  assert.ok(Math.abs(head(R.poseGeometry('hammer', { wave: 1 }))[1] - head(rest)[1]) < 1e-9, '划水只动尾鳍，头不动');
});

test('judgeSilhouette：对的姿态通过，符号错了（划水、俯仰、朝向）被拦住', () => {
  const sample = { facing: -1, pitch: 0.35, wave: 1 };
  const own = fromMask(R.expectedSilhouette('hammer', sample, blank()));
  const good = R.judgeSilhouette('hammer', own, sample);
  const key = pose => `${pose.facing}/${pose.pitch}/${pose.wave}`;
  assert.ok(good.iou > 0.999, '自己的轮廓交并比约为 1');
  assert.equal(key(good.best), key(sample)); assert.ok(good.margin >= 0.05, `领先备选 ${good.margin}`);
  for (const wrong of [{ ...sample, wave: -1 }, { ...sample, pitch: -0.35 }, { ...sample, facing: 1 }]) {
    const verdict = R.judgeSilhouette('hammer', fromMask(R.expectedSilhouette('hammer', wrong, blank())), sample);
    assert.ok(key(verdict.best) !== key(sample), `画成 ${JSON.stringify(wrong)} 时，最像的不能是期望姿态（实际最像 ${key(verdict.best)}）`);
  }
});

test('judgeSilhouette：整体平移 3 pt 也被拦住（放置高度或居中错了）', () => {
  const pose = { facing: 1, pitch: 0, wave: 0 };
  const mask = R.expectedSilhouette('hammer', pose, blank()), shifted = new Uint8Array(mask.length), shift = 3 * R.VIEW.scale;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x] && y + shift < H) shifted[(y + shift) * W + x] = 1;
  assert.ok(R.judgeSilhouette('hammer', fromMask(shifted), pose).iou < 0.97);
});

test('samplePoints：每个躯干/肢体部件一个点，躯干沿长轴 10/50/90%；点在自己里面、不在后画的部件里', () => {
  const points = R.samplePoints('hammer');
  const geometry = R.poseGeometry('hammer');
  const byPart = points.filter(p => p.f === null).map(p => p.part).sort();
  const expectedParts = geometry.parts.map((p, i) => ['body', 'limb'].includes(p.role) ? i : -1).filter(i => i >= 0);
  assert.deepEqual(byPart, expectedParts);
  assert.deepEqual(points.filter(p => p.f !== null).map(p => p.f), [0.1, 0.5, 0.9]);
  for (const p of points) {
    assert.ok(R.insidePolygons(p.point, geometry.parts[p.part].polygons), `${p.role}#${p.part} 的点应在自己里面`);
    const later = geometry.parts.slice(p.part + 1).flatMap(q => q.polygons);
    assert.equal(later.length ? R.insidePolygons(p.point, later) : false, false, `${p.role}#${p.part} 的点不应被后画的部件盖住`);
    assert.ok(p.clearance >= 1.1);
  }
  const f = points.filter(p => p.f !== null);
  assert.ok(f[0].point[0] < f[1].point[0] && f[1].point[0] < f[2].point[0], '取样点由尾到头');
});

test('judgeColours：按规则涂色的合成图通过；渐变方向反了、肢体取色错了、双色躯干用错色都被拦住', () => {
  const points = R.samplePoints('hammer');
  const paintFor = (look, colors, { reverseBody = false, wrongLimb = false, bodyUsesSecond = false } = {}) => {
    const tints = colors.map(slot => PALETTE[slot]);
    while (tints.length < 3) tints.push(tints[tints.length - 1]);
    const image = blank();
    for (const sample of points) {
      let tone;
      if (sample.role === 'body' && sample.f !== null) tone = R.bodyTone(look, bodyUsesSecond ? [tints[1], tints[0], tints[2]] : tints, reverseBody ? 1 - sample.f : sample.f);
      else if (sample.role === 'body') tone = R.bodyTone(look, tints, 0);
      else tone = R.limbToneOf(look, tints, wrongLimb ? 1 - sample.u : sample.u);
      // 明度随位置变（真实绘制有上浅下深的渐变与白色高光）：向白色靠一点，不改变色相
      paintBlock(image, sample.point, R.mix(tone, [1, 1, 1], 0.3));
    }
    return image;
  };
  const run = (look, colors, options) => R.judgeColours('hammer', paintFor(look, colors, options), { look, colors }, PALETTE, points);
  for (const [look, colors] of Object.entries(R.LOOKS)) assert.ok(run(look, colors).every(r => r.ok), `${look} 按规则涂色应全部通过：${run(look, colors).filter(r => !r.ok).map(r => r.name).join('、')}`);
  assert.ok(run('blend', R.LOOKS.blend, { reverseBody: true }).some(r => !r.ok), '渐变画反了应被拦住');
  assert.ok(run('rainbow', R.LOOKS.rainbow, { reverseBody: true }).some(r => !r.ok), '七彩画反了应被拦住');
  assert.ok(run('rainbow', R.LOOKS.rainbow, { wrongLimb: true }).some(r => !r.ok), '七彩肢体头尾取反应被拦住');
  assert.ok(run('duo', R.LOOKS.duo, { bodyUsesSecond: true }).some(r => !r.ok), '双色躯干用了第二色应被拦住');
  const missing = R.judgeColours('hammer', blank(), { look: 'solid', colors: [5] }, PALETTE, points);
  assert.ok(missing.every(r => !r.ok), '取样点上没有像素时不能通过');
});

test('lightingOfPart：上浅下深的合成部件得到 upper > lower，画反了得到相反的符号，什么都没画不能通过（躯干与肢体都测）', () => {
  const geometry = R.poseGeometry('hammer');
  const indexes = { trunk: geometry.parts.findIndex(part => part.role === 'body'), tailFin: geometry.parts.findIndex(part => part.role === 'limb' && part.u === 0.1) };
  for (const [label, index] of Object.entries(indexes)) {
    const mask = R.rasterize(geometry.parts[index].polygons, W, H);
    let top = Infinity, bottom = -Infinity;
    mask.forEach((v, i) => { if (v) { top = Math.min(top, Math.floor(i / W)); bottom = Math.max(bottom, Math.floor(i / W)); } });
    const shade = reverse => {
      const image = blank();
      mask.forEach((v, i) => {
        if (!v) return;
        const t = (Math.floor(i / W) - top) / (bottom - top), value = Math.round(255 * (reverse ? 0.5 + 0.4 * t : 0.9 - 0.4 * t));      // 越靠上越亮
        image.pixels[i * 4] = image.pixels[i * 4 + 1] = image.pixels[i * 4 + 2] = value; image.pixels[i * 4 + 3] = 255;
      });
      return image;
    };
    const good = R.lightingOfPart('hammer', shade(false), index), reversed = R.lightingOfPart('hammer', shade(true), index);
    assert.ok(good.upper > good.lower + 0.1 && good.pixels >= R.LIMITS.lightMinPixels, `${label}：${good.upper} ${good.lower} ${good.pixels}`);
    assert.ok(reversed.upper < reversed.lower - 0.1, `${label} 画反`);
    const empty = R.lightingOfPart('hammer', blank(), index);
    assert.ok(!(empty.upper > empty.lower + R.LIMITS.lightGap), `${label}：全透明的图像（什么都没画）不能通过“上浅下深”`);
  }
  assert.equal(R.lightingOfTrunk('hammer', blank()).pixels, R.lightingOfPart('hammer', blank(), indexes.trunk).pixels, 'lightingOfTrunk 就是第一个躯干部件');
});

/** 在图像上画一圈抗锯齿的涟漪（线宽 2 pt：|d − r| ≤ 0.75 全覆盖，到 1.25 渐隐）：alpha01 是峰的不透明度，rgb 是 0–1。 */
const drawRing = (image, centre, radius, alpha01, rgb) => {
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const px = (x + 0.5) / R.VIEW.scale, py = R.VIEW.height - (y + 0.5) / R.VIEW.scale;
    const distance = Math.hypot(px - centre[0], py - centre[1]);
    const coverage = Math.max(0, Math.min(1, 1 - (Math.abs(distance - radius) - 0.75) / 0.5));
    if (coverage <= 0) continue;
    const at = (y * image.width + x) * 4, alpha = Math.round(alpha01 * 255 * coverage);
    if (alpha <= image.pixels[at + 3]) continue;
    image.pixels[at] = Math.round(rgb[0] * 255); image.pixels[at + 1] = Math.round(rgb[1] * 255); image.pixels[at + 2] = Math.round(rgb[2] * 255); image.pixels[at + 3] = alpha;
  }
};

test('rippleOuter：不超过 62、最外圈离最近一边不少于 8、不小于 24；径向剖面能找到半径与高度', () => {
  assert.equal(R.rippleOuter([85, 75]), 62, '余量足够（最近一边 75 → 67）时取 62 的上限');
  assert.equal(R.rippleOuter([85, 61]), 53, '最近一边 61 → 53');
  assert.equal(R.rippleOuter([85, 20]), 24, '余量不够（20 → 12）时取下限 inner + 4');
  assert.equal(R.rippleOuter([40, 75]), 32, '靠左边时按左边的余量算（40 → 32）');
  assert.equal(R.rippleOuter([85, 140]), 24, '靠上边时按上边的余量算（离上边 10 → 2 → 取下限）');
  const image = blank(), centre = [85, 70];
  drawRing(image, centre, 40, 0.3, [0.1, 0.1, 1]);
  const profile = R.radialProfile(image, centre, new Uint8Array(W * H));
  const peak = profile.filter(entry => entry.alpha !== null).reduce((best, entry) => entry.alpha > best.alpha ? entry : best);
  assert.ok(Math.abs(peak.radius - 40) <= 0.5 && Math.abs(peak.alpha - 76.5) <= 2, `峰 ${JSON.stringify(peak)}`);
  const hidden = new Uint8Array(W * H).fill(1);
  assert.ok(R.radialProfile(image, centre, hidden).every(entry => entry.alpha === null), '全被盖住时每档样本数为 0，记为 null，不参与判定');
});

test('judgeRipples：两圈位置、高度、颜色都对才通过；半径偏了、圆心偏了、太淡、颜色不对、少一圈、外面多一圈各自被拒绝', () => {
  const geometry = R.poseGeometry('hammer'), centre = geometry.target, outer = R.rippleOuter(centre);
  const radii = R.RIPPLE.fractions.map(f => R.RIPPLE.inner + (outer - R.RIPPLE.inner) * f);
  const make = ({ rs = radii, alphas = R.RIPPLE.alphas, at = centre, rgb = PALETTE[5] } = {}) => {
    const image = blank();
    rs.forEach((radius, index) => drawRing(image, at, radius, alphas[index], rgb));
    return image;
  };
  const pose = { facing: 1, pitch: 0, wave: 0 };
  const judge = image => R.judgeRipples('hammer', image, pose, 5, PALETTE);
  const good = judge(make());
  assert.ok(good.ok, good.detail);
  assert.ok(good.rings.every(ring => ring.ok) && good.noOuter && good.hueOk);
  // 半径偏了（例如外半径用了水母的 62 而不是按余量算的值：第二圈差约 1 pt，更大的偏差一定能看出）
  assert.ok(!judge(make({ rs: radii.map(r => r + 3) })).ok, '半径偏 3 pt 被拒绝');
  assert.ok(!judge(make({ rs: [radii[0], radii[1] + 4] })).rings[1].ok, '第二圈偏 4 pt');
  // 圆心偏了（画在水母的中心而不是动物的中心）
  assert.ok(!judge(make({ at: [centre[0], centre[1] + 6] })).ok, '圆心偏 6 pt 被拒绝');
  assert.ok(!judge(make({ at: [centre[0] + 6, centre[1]] })).ok, '圆心水平偏 6 pt 被拒绝');
  // 太淡 / 太浓
  assert.ok(!judge(make({ alphas: [0.12, 0.18] })).rings[0].ok, '第一圈太淡');
  assert.ok(!judge(make({ alphas: [0.30, 0.34] })).rings[1].ok, '第二圈太浓');
  // 颜色：红色的圈对蓝色色位
  const red = judge(make({ rgb: PALETTE[0] }));
  assert.ok(!red.ok && !red.hueOk && red.rings.every(ring => ring.ok), '位置对、颜色错：只有色相项失败');
  // 少一圈
  assert.ok(!judge(make({ rs: [radii[0]], alphas: [0.30] })).ok, '少一圈被拒绝');
  // 外面多出第三圈（外半径没有按余量收住）
  const third = judge(make({ rs: [...radii, outer + 4], alphas: [...R.RIPPLE.alphas, 0.1] }));
  assert.ok(!third.noOuter && !third.ok, `外面多一圈被拒绝：${third.detail}`);
  // 完全没有涟漪
  assert.ok(!judge(blank()).ok, '空白图被拒绝');
  // 动物身体盖住的部分不参与：把动物的躯干范围涂成不透明（涟漪画在动物之下），仍然通过
  const covered = make(), mask = R.unionMask(geometry, W, H);
  for (let i = 0; i < mask.length; i++) if (mask[i]) { covered.pixels[i * 4] = 40; covered.pixels[i * 4 + 1] = 40; covered.pixels[i * 4 + 2] = 40; covered.pixels[i * 4 + 3] = 255; }
  assert.ok(judge(covered).ok, '被动物盖住的像素不参与剖面');
});

test('眼睛与窗口外圈：judgeEyes、darkPixelsNear、borderMaxAlpha、strayStats、identicalImages', () => {
  const rest = { facing: 1, pitch: 0, wave: 0 };
  const eyes = R.poseGeometry('hammer', rest).eyes;
  const image = blank();
  for (const eye of eyes) paintBlock(image, eye, [0.1, 0.15, 0.2]);
  assert.ok(R.judgeEyes('hammer', image, rest).every(r => r.ok));
  assert.ok(R.judgeEyes('hammer', blank(), rest).every(r => !r.ok), '没有像素不通过');
  const light = blank();
  for (const eye of eyes) paintBlock(light, eye, [0.8, 0.9, 1]);
  assert.ok(R.judgeEyes('hammer', light, rest).every(r => !r.ok), '眼中心是浅色不通过');
  assert.ok(R.darkPixelsNear(image, eyes[0]) > 20 && R.darkPixelsNear(light, eyes[0]) === 0);

  const edge = blank();
  assert.equal(R.borderMaxAlpha(edge), 0);
  edge.pixels[3] = 5;                                         // 左上角像素
  assert.equal(R.borderMaxAlpha(edge), 5);
  const inner = blank(); inner.pixels[((H / 2) * W + W / 2) * 4 + 3] = 255;
  assert.equal(R.borderMaxAlpha(inner), 0, '窗口中央的像素不算外圈');

  const stray = fromMask(R.expectedSilhouette('hammer', rest, blank()));
  assert.equal(R.strayStats('hammer', stray, rest).count, 0, '只有动物自己时没有多余像素');
  const far = R.toPixel(20, 130);
  stray.pixels[(Math.floor(far[1]) * W + Math.floor(far[0])) * 4 + 3] = 255;
  const found = R.strayStats('hammer', stray, rest);
  assert.equal(found.count, 1); assert.ok(Math.abs(found.x - 20) < 0.6 && Math.abs(found.y - 130) < 0.6);

  assert.equal(R.identicalImages(stray, stray).same, true);
  const other = { ...stray, pixels: Buffer.from(stray.pixels) }; other.pixels[0] = 9;
  assert.equal(R.identicalImages(stray, other).same, false);
  assert.equal(R.identicalImages(stray, other, 9).same, true, '容差');
});

// ---------- 侧视动物的嘴、腹部与斑点（鲸鲨） ----------

const WHALE = 'whaleshark';
const whaleParts = (roles) => R.poseGeometry(WHALE).parts.filter(part => roles.includes(part.role));
/** 把若干角色的部件范围涂成纯色（straight RGB 0–1，alpha 默认 0.95）。 */
const fillRoles = (image, roles, rgb, alpha = 0.95) => {
  for (const part of whaleParts(roles)) {
    const mask = R.rasterize(part.polygons, image.width, image.height);
    for (let i = 0; i < mask.length; i++) if (mask[i]) {
      image.pixels[i * 4] = Math.round(rgb[0] * 255); image.pixels[i * 4 + 1] = Math.round(rgb[1] * 255); image.pixels[i * 4 + 2] = Math.round(rgb[2] * 255); image.pixels[i * 4 + 3] = Math.round(alpha * 255);
    }
  }
};
const spotPolygons = () => whaleParts(['accent']).flatMap(part => part.polygons);
/** 规格里的斑点颜色：白色 × alpha 盖在不透明度 bodyAlpha 的躯干色上。 */
const spotColour = (base, alpha = 0.72, bodyAlpha = 0.95) => base.map(v => (alpha + bodyAlpha * (1 - alpha) * v) / (alpha + bodyAlpha * (1 - alpha)));
const BODY_RGB = [0.45, 0.72, 0.9];
/** 躯干涂成 BODY_RGB，每个斑点的整个圆盘（按多边形光栅化，与真实渲染覆盖的像素一致）涂成 colourFor(序号)；only(序号) 为假的斑点不画。 */
const whaleSpotImage = ({ colourFor = () => spotColour(BODY_RGB), only = () => true, body = BODY_RGB } = {}) => {
  const image = blank();
  fillRoles(image, ['body'], body);
  spotPolygons().forEach((polygon, index) => {
    if (!only(index)) return;
    const mask = R.rasterize([polygon], image.width, image.height), rgb = colourFor(index);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { image.pixels[i * 4] = Math.round(rgb[0] * 255); image.pixels[i * 4 + 1] = Math.round(rgb[1] * 255); image.pixels[i * 4 + 2] = Math.round(rgb[2] * 255); image.pixels[i * 4 + 3] = 255; }
  });
  return image;
};

test('poseGeometry 的嘴：侧视动物有 4 个点，俯视动物没有；跟着朝向镜像、跟着俯仰转、不随划水动', () => {
  assert.equal(R.poseGeometry('hammer').mouth, null); assert.equal(R.poseGeometry('manta').mouth, null);
  const rest = R.poseGeometry(WHALE);
  assert.equal(rest.mouth.length, 4);
  const left = R.poseGeometry(WHALE, { facing: -1 });
  rest.mouth.forEach((p, i) => assert.ok(Math.abs(left.mouth[i][0] - (R.VIEW.width - p[0])) < 1e-9 && Math.abs(left.mouth[i][1] - p[1]) < 1e-9, '朝左 = 绕窗口竖直中线镜像'));
  const up = R.poseGeometry(WHALE, { pitch: 0.35 });
  assert.ok(up.mouth[0][1] > rest.mouth[0][1] + 5, '抬头：嘴（在头端）升高');
  const waved = R.poseGeometry(WHALE, { wave: 1 });
  rest.mouth.forEach((p, i) => assert.deepEqual(waved.mouth[i], p, '划水不动嘴'));
  // 嘴在躯干里面（微笑线不能画到身体外面）
  const trunk = rest.parts.filter(part => part.role === 'body').flatMap(part => part.polygons);
  for (const point of R.smilePoints(rest, 9)) assert.ok(R.insidePolygons(point, trunk), `微笑线上的点 (${point.map(v => v.toFixed(1))}) 在躯干里`);
});

test('bezierAt / smilePoints：端点、中点、个数与区间；没有嘴返回空数组', () => {
  const curve = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.deepEqual(R.bezierAt(curve, 0), [0, 0]); assert.deepEqual(R.bezierAt(curve, 1), [10, 0]);
  assert.deepEqual(R.bezierAt(curve, 0.5), [5, 7.5]);
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  const points = R.smilePoints(R.poseGeometry(WHALE), 7);
  assert.equal(points.length, 7);
  assert.ok(near(points[0], R.bezierAt(R.poseGeometry(WHALE).mouth, 0.12)) && near(points[6], R.bezierAt(R.poseGeometry(WHALE).mouth, 0.88)), '首尾点在 t = 0.12 与 0.88');
  assert.ok(near(points[3], R.bezierAt(R.poseGeometry(WHALE).mouth, 0.5)), '中点在 t = 0.5');
  assert.deepEqual(R.smilePoints(R.poseGeometry('hammer')), []);
});

test('faceAvoider：眼睛、腮红、微笑线附近要避开，远处不避', () => {
  const geometry = R.poseGeometry(WHALE), avoid = R.faceAvoider(geometry);
  assert.ok(avoid(geometry.eyes[0]), '眼睛中心');
  assert.ok(avoid(geometry.blush[0].center), '腮红中心');
  assert.ok(avoid(R.bezierAt(geometry.mouth, 0.5)), '微笑线上');
  const [x, y] = R.bezierAt(geometry.mouth, 0.5);
  assert.ok(avoid([x, y - 2]) && !avoid([x, y - 30]), '离线 2 pt 内避开，30 pt 外不避');
  assert.ok(!avoid([20, 20]), '远离脸');
  const noFace = R.faceAvoider({ eyes: [], eyeRadius: 1, blush: [], mouth: null });
  assert.equal(noFace([85, 75]), false, '没有脸部装饰时什么都不避');
});

test('samplePoints（鲸鲨）：腹部也取一个点；点避开眼睛、腮红与微笑线；躯干 10%/90% 有点，50% 被斑点、腹部与高光盖满而没有', () => {
  const points = R.samplePoints(WHALE), geometry = R.poseGeometry(WHALE), avoid = R.faceAvoider(geometry);
  const belly = points.filter(point => point.role === 'belly');
  assert.equal(belly.length, 1);
  assert.equal(geometry.parts[belly[0].part].role, 'belly');
  assert.ok(R.insidePolygons(belly[0].point, geometry.parts[belly[0].part].polygons));
  for (const point of points) {
    assert.ok(!avoid(point.point), `${point.role}#${point.part} 的取样点要避开脸部装饰`);
    assert.ok(point.clearance >= 1.1);
    const later = geometry.parts.slice(point.part + 1).flatMap(part => part.polygons);
    assert.equal(later.length ? R.insidePolygons(point.point, later) : false, false, `${point.role}#${point.part} 不应被后画的部件盖住`);
  }
  assert.deepEqual(points.filter(point => point.f !== null).map(point => point.f), [0.1, 0.9], '躯干中段整条都被斑点、腹部与高光盖住：没有 50% 的点（这是已知的取样限制，渐变中段由小锤头鲨与蝠鲼核对同一段画法）');
  assert.ok(points.length >= 4);
});

test('judgeColours（鲸鲨）：腹部按主色（提亮后）核对，所有花纹一样；腹部画成第二色被拦住', () => {
  const points = R.samplePoints(WHALE).filter(point => point.role === 'belly');
  assert.equal(points.length, 1);
  const paint = (look, colors, belly) => {
    const image = blank();
    paintBlock(image, points[0].point, belly(colors.map(slot => PALETTE[slot])));
    return image;
  };
  const lightened = tints => R.mix(tints[0], [1, 1, 1], 0.72);
  const judge = (look, colors, belly) => R.judgeColours(WHALE, paint(look, colors, belly), { look, colors }, PALETTE, points);
  for (const [look, colors] of Object.entries(R.LOOKS)) assert.ok(judge(look, colors, lightened).every(result => result.ok), `${look}：腹部按主色提亮应通过`);
  assert.ok(judge('duo', R.LOOKS.duo, tints => R.mix(tints[1], [1, 1, 1], 0.72)).some(result => !result.ok), '双色花纹里腹部画成第二色应被拦住');
  assert.ok(judge('rainbow', R.LOOKS.rainbow, tints => R.mix(tints[2], [1, 1, 1], 0.72)).some(result => !result.ok), '七彩花纹里腹部画成第三色应被拦住');
});

test('judgeSmile：醒着时沿曲线都是墨色才通过；睡着时一点墨色都不能有；没有嘴的动物返回 null', () => {
  const rest = { facing: 1, pitch: 0, wave: 0 };
  const inked = (pose) => { const image = blank(); for (const point of R.smilePoints(R.poseGeometry(WHALE, pose))) paintBlock(image, point, [0.2, 0.28, 0.38], 1); return image; };
  const light = (pose) => { const image = blank(); for (const point of R.smilePoints(R.poseGeometry(WHALE, pose))) paintBlock(image, point, [0.9, 0.95, 1], 1); return image; };
  assert.ok(R.judgeSmile(WHALE, inked(rest), rest, true).ok, '墨色沿曲线：醒着通过');
  assert.ok(!R.judgeSmile(WHALE, light(rest), rest, true).ok, '浅色沿曲线：醒着不通过（没画出微笑）');
  assert.ok(!R.judgeSmile(WHALE, blank(), rest, true).ok, '什么都没画：醒着不通过');
  assert.ok(R.judgeSmile(WHALE, light(rest), rest, false).ok, '浅色沿曲线：睡着通过');
  assert.ok(!R.judgeSmile(WHALE, inked(rest), rest, false).ok, '睡着时仍有墨色：不通过');
  assert.ok(R.judgeSmile(WHALE, blank(), rest, false).ok, '睡着时空白：通过（没有不透明像素按“不是墨色”算）');
  // 姿态：按朝左抬头放置的曲线对朝右静止姿态的图不通过（分辨得出朝向与俯仰）
  const turned = { facing: -1, pitch: 0.35, wave: 0 };
  assert.ok(R.judgeSmile(WHALE, inked(turned), turned, true).ok);
  assert.ok(!R.judgeSmile(WHALE, inked(turned), rest, true).ok, '画在朝左抬头的位置，却按静止姿态核对：不通过');
  // 一半的点没画：不通过（逐点都要是墨色）
  const half = inked(rest), points = R.smilePoints(R.poseGeometry(WHALE, rest));
  paintBlock(half, points[3], [0.9, 0.95, 1], 2);
  const verdict = R.judgeSmile(WHALE, half, rest, true);
  assert.ok(!verdict.ok && verdict.dark < verdict.total);
  assert.equal(R.judgeSmile('hammer', blank(), rest, true), null);
});

test('judgeBelly：腹部比躯干代表点亮才通过；没有像素不通过；没有腹部返回 null', () => {
  const points = R.samplePoints(WHALE), belly = points.find(point => point.role === 'belly'), body = points.find(point => point.role === 'body' && point.f === null);
  const make = (bellyRgb, bodyRgb) => { const image = blank(); paintBlock(image, belly.point, bellyRgb); paintBlock(image, body.point, bodyRgb); return image; };
  assert.ok(R.judgeBelly(WHALE, make([0.9, 0.95, 0.97], [0.45, 0.72, 0.9]), points).ok);
  const same = R.judgeBelly(WHALE, make([0.45, 0.72, 0.9], [0.45, 0.72, 0.9]), points);
  assert.ok(!same.ok && Math.abs(same.lift) < 1e-9, '一样亮不通过');
  assert.ok(!R.judgeBelly(WHALE, make([0.3, 0.4, 0.5], [0.45, 0.72, 0.9]), points).ok, '腹部更暗不通过');
  const onlyBelly = blank(); paintBlock(onlyBelly, belly.point, [0.9, 0.95, 0.97]);
  assert.ok(!R.judgeBelly(WHALE, onlyBelly, points).ok, '躯干代表点上没有像素：不通过');
  assert.equal(R.judgeBelly('hammer', blank()), null);
});

test('judgeSpots：每个斑点中心按“白 × α 盖在躯干上”画才通过；没有提亮、α 偏小、纯白、缺一半、全缺各自被拦住；没有斑点返回 null', () => {
  const good = R.judgeSpots(WHALE, whaleSpotImage());
  assert.ok(good.ok, good.detail);
  assert.equal(good.total, 60); assert.equal(good.evaluated, 60); assert.equal(good.passed, 60);
  assert.ok(good.maxError < 0.01 && good.minLift > 0.1, `合成图本身应与期望几乎一致：${good.detail}`);
  // 完全没画斑点（斑点中心就是躯干色）
  const bare = R.judgeSpots(WHALE, whaleSpotImage({ colourFor: () => BODY_RGB }));
  assert.ok(!bare.ok && bare.passed === 0, '斑点没有提亮');
  // α 偏小：0.5 的白盖上去（期望 0.72）
  const weak = R.judgeSpots(WHALE, whaleSpotImage({ colourFor: () => spotColour(BODY_RGB, 0.5) }));
  assert.ok(!weak.ok, `α 0.5 应被拦住：${weak.detail}`);
  // α 偏大到纯白
  assert.ok(!R.judgeSpots(WHALE, whaleSpotImage({ colourFor: () => [1, 1, 1] })).ok, '纯白斑点：与期望的通道差超限');
  // 缺一半（只画了偶数序号的斑点，其余是躯干色）
  const half = R.judgeSpots(WHALE, whaleSpotImage({ only: index => index % 2 === 0 }));
  assert.ok(!half.ok && half.passed === 30, `缺一半：${half.detail}`);
  // 缺 10%（每 10 个缺 1 个，比例 0.9 恰好是下限，再缺一个就不通过）
  const nine = R.judgeSpots(WHALE, whaleSpotImage({ only: index => index % 10 !== 0 }));
  assert.equal(nine.passed, 54); assert.ok(nine.ok, '54/60 = 0.9 达到下限');
  const eight = R.judgeSpots(WHALE, whaleSpotImage({ only: index => index % 10 !== 0 && index !== 1 }));
  assert.ok(!eight.ok, '53/60 低于 0.9');
  // 色相不对（把斑点涂成偏红的颜色）：通道差超限
  assert.ok(!R.judgeSpots(WHALE, whaleSpotImage({ colourFor: () => spotColour([0.9, 0.3, 0.3]) })).ok);
  // 躯干整体没画（没有任何参照像素）：参与判定的斑点太少，不通过
  const empty = R.judgeSpots(WHALE, blank());
  assert.ok(!empty.ok && empty.evaluated === 0);
  assert.equal(R.judgeSpots('hammer', blank()), null);
});

test('judgeSpots：参与判定的斑点太少时不通过（哪怕参与的全部正确）；参照不足的斑点被跳过；没有对比度时不放行', () => {
  // 只留画面的右半边：左半边的斑点没有任何像素（被跳过），右半边的斑点画得完全正确
  const half = whaleSpotImage();
  for (let y = 0; y < half.height; y++) for (let x = 0; x < Math.floor(half.width / 2); x++) half.pixels[(y * half.width + x) * 4 + 3] = 0;
  const some = R.judgeSpots(WHALE, half);
  assert.ok(some.evaluated >= 15 && some.evaluated < 55, `前提：参与判定的斑点在 15…54 个之间（实际 ${some.evaluated}）`);
  assert.equal(some.passed, some.evaluated, '参与判定的斑点全部正确');
  assert.ok(some.skipped >= 5, `没有像素的斑点被跳过（${some.skipped}）`);
  assert.ok(!some.ok, '参与判定的斑点不足下限：检查空转，不能算通过（这条守卫是全量变异检查里存活的，没有它只剩比例条件）');
  // 参照像素不足：只画斑点、不画躯干，每个斑点的参照环都是空的 → 全部跳过，而不是用一个空平均去“判定”
  const image = blank();
  for (const polygon of spotPolygons()) {
    const mask = R.rasterize([polygon], image.width, image.height), rgb = spotColour(BODY_RGB);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { image.pixels[i * 4] = Math.round(rgb[0] * 255); image.pixels[i * 4 + 1] = Math.round(rgb[1] * 255); image.pixels[i * 4 + 2] = Math.round(rgb[2] * 255); image.pixels[i * 4 + 3] = 255; }
  }
  const starved = R.judgeSpots(WHALE, image);
  assert.equal(starved.evaluated, 0); assert.equal(starved.skipped, 60); assert.ok(!starved.ok);
  // 没有对比度：躯干近乎纯白时，白色斑点怎么画都看不出提亮——通道误差再小也不放行（否则这一项检查对浅色躯干形同虚设）
  const white = [0.97, 0.99, 1];
  const flat = R.judgeSpots(WHALE, whaleSpotImage({ body: white, colourFor: () => spotColour(white) }));
  assert.ok(flat.maxError < 0.01, `前提：误差本身几乎为 0（${flat.maxError}）`);
  assert.ok(!flat.ok && flat.passed === 0, `没有对比度：${flat.detail}`);
});

test('judgeSmile：睡着时只要有一部分点是墨色就不通过（不是“不全是墨色就行”）', () => {
  const rest = { facing: 1, pitch: 0, wave: 0 }, points = R.smilePoints(R.poseGeometry(WHALE, rest));
  const image = blank();
  for (const point of points) paintBlock(image, point, [0.9, 0.95, 1], 0);          // 先全部涂浅色（每个点只涂它自己所在的一个像素，相邻点互不干扰）
  for (const index of [0, 4]) paintBlock(image, points[index], [0.2, 0.28, 0.38], 0);   // 再把不相邻的两个点涂成墨色
  const verdict = R.judgeSmile(WHALE, image, rest, false);
  assert.equal(verdict.dark, 2);
  assert.ok(!verdict.ok, '7 个点里 2 个是墨色：睡着时应当一个都没有');
});

test('checkSpecies 的接线：z（被抓住时）、微笑、腹部、斑点的判定结果真的进入结论（注入判定函数，各翻一项，其余保持通过）', () => {
  // 全量变异检查里，“把判定结果换成 true”的接线变异体在真实渲染（全部通过）下无法被发现；这里用注入的判定函数直接验证：
  // 被翻成不通过的那一行必须不通过，旁边没翻的行必须通过（两个方向都看到，所以“恒真”“恒假”两种接线错误都会被发现）。
  const cache = {};
  const images = new Proxy({}, { get: (_, name) => typeof name === 'string' ? (cache[name] ??= blank()) : undefined });
  const calls = [];
  const judges = {
    judgeSmile: (id, image, pose, drawn) => { calls.push(['smile', drawn]); return { ok: image !== images[`${id}-pose-up`] && image !== images[`${id}-asleep`] && !(drawn && image === images[`${id}-asleep-grabbed`]), dark: 0, total: 7, detail: '注入' }; },
    judgeBelly: () => ({ ok: false, lift: 0, detail: '注入' }),
    judgeSpots: (id, image) => ({ ok: image !== images[`${id}-blend`], detail: '注入' }),
    strayPixels: (id, image) => image === images[`${id}-asleep-grabbed`] ? 3 : 0,
  };
  const lines = R.checkSpecies(WHALE, images, PALETTE, judges);
  const status = (group, name) => { const found = lines.filter(line => line.group === group && line.name === name); assert.equal(found.length, 1, `${group}/${name} 应恰有一行（实际 ${found.length}）`); return found[0].ok; };
  assert.equal(status('被抓住', '睡着又被抓住：轮廓外没有 “z”'), false, '被抓住时有 3 个 z 像素：不通过');
  assert.equal(status('微笑', '抬头：醒着时沿曲线是墨色'), false); assert.equal(status('微笑', '静止姿态：醒着时沿曲线是墨色'), true); assert.equal(status('微笑', '朝左：醒着时沿曲线是墨色'), true);
  assert.equal(status('微笑', '睡着（朝右）：沿曲线没有墨色'), false); assert.equal(status('微笑', '睡着（朝左）：沿曲线没有墨色'), true);
  assert.equal(status('微笑', '睡着又被抓住：沿曲线是墨色'), false);
  assert.equal(status('腹部', '纯色花纹里腹部比躯干代表点更亮'), false);
  assert.equal(status('斑点', 'solid：斑点中心是白色 × α 盖在躯干上的颜色'), true);
  assert.equal(status('斑点', 'blend：斑点中心是白色 × α 盖在躯干上的颜色'), false);
  assert.equal(status('斑点', 'rainbow：斑点中心是白色 × α 盖在躯干上的颜色'), true);
  assert.equal(lines.filter(line => line.group === '斑点').length, 3, '斑点三种花纹各一行');
  assert.equal(calls.filter(([, drawn]) => drawn === true).length, 11, '醒着的微笑：十个姿态加一个“睡着又被抓住”');
  assert.equal(calls.filter(([, drawn]) => drawn === false).length, 2, '睡着的微笑：朝右、朝左各一次');
  // 没有嘴的动物不走微笑分支：蝠鲼的检查里没有“微笑”组（注入的判定函数一次都不该被调用）
  const manta = new Proxy({}, { get: (_, name) => typeof name === 'string' ? (cache[`manta:${name}`] ??= blank()) : undefined });
  calls.length = 0;
  const mantaLines = R.checkSpecies('manta', manta, PALETTE, judges);
  assert.equal(mantaLines.filter(line => line.group === '微笑').length, 0); assert.equal(calls.length, 0);
});

test('judgeSpots：accent 里有不是小圆的子路径时直接不通过（而不是悄悄跳过）', () => {
  const real = Shapes.native;
  Shapes.native = id => {
    const shape = real(id);
    if (id !== WHALE) return shape;
    const accent = shape.parts.find(part => part.role === 'accent');
    accent.cmds = [{ cmd: 'M', pts: [[-30, -5]] }, { cmd: 'L', pts: [[30, -5]] }, { cmd: 'L', pts: [[30, -2]] }, { cmd: 'L', pts: [[-30, -2]] }, { cmd: 'Z', pts: [] }];
    return shape;
  };
  try {
    const verdict = R.judgeSpots(WHALE, blank());
    assert.ok(!verdict.ok && /不是小圆/.test(verdict.detail), verdict.detail);
  } finally { Shapes.native = real; }
  assert.ok(R.judgeSpots(WHALE, whaleSpotImage()).ok, '还原后恢复正常');
});

test('用例表（鲸鲨）：有睡着又被抓住的用例（asleep 与 grabbed 同时为真）', () => {
  const cases = R.buildCases(WHALE);
  const grabbed = cases.find(c => c.name === `${WHALE}-asleep-grabbed`);
  assert.ok(grabbed && grabbed.asleep === true && grabbed.grabbed === true);
  const viaView = cases.filter(c => !c.direct);
  assert.ok(viaView.filter(c => c.grabbed).length === 1 && viaView.every(c => c.name === `${WHALE}-asleep-grabbed` || !c.grabbed), '经 JellyView 画的整只图里只有这一个被抓住的用例');
});

test('用例表：名字唯一且合乎渲染工具的命名规则；覆盖四种花纹、两个朝向、姿态与睡觉/夜晚', () => {
  const cases = R.buildCases('hammer');
  const names = cases.map(c => c.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.every(n => /^[A-Za-z0-9._-]{1,80}$/.test(n)));
  for (const look of Object.keys(R.LOOKS)) for (const suffix of ['', '-left', '-dark']) assert.ok(names.includes(`hammer-${look}${suffix}`), `${look}${suffix}`);
  for (const need of ['pose-half', 'pose-up', 'pose-up-left', 'pose-down', 'pose-wave-up', 'pose-wave-down', 'pose-wave-left', 'pose-all', 'asleep', 'asleep-left', 'night', 'night-light', 'alert']) assert.ok(names.includes(`hammer-${need}`), need);
  assert.ok(cases.every(c => c.species === 'hammer' && Array.isArray(c.colors) && typeof c.look === 'string'));
});

test('源文件清单取自 build.mjs（去掉 main），与产品编译同源', () => {
  const list = R.sourceList();
  assert.ok(!list.includes('main') && list.includes('jelly-species-painter') && list.includes('jelly-companion') && list.includes('jelly-species-data'));
  const build = readFileSync(new URL('../desktop-reminder/build.mjs', import.meta.url), 'utf8');
  for (const name of list) assert.ok(build.includes(`'${name}'`));
});

// ---------- 命令行之外的“检查本身”：Q 段、检查清单、渲染工具替身 ----------
// 系统性变异检查（2026-10-18）在渲染检查脚本自己的代码里发现了三类没人把守的地方：flatten 的 Q 分支（形状数据没用过 Q，37 个变异体全部存活）、
// 删掉某个 add(…) 语句（输出少一条，仍然“全部通过”）、命令行的退出码与错误路径（真实渲染从来都是全过，失败时的行为没人看过）。以下按这三类补。

test('flatten：Q 段按二次贝塞尔取样（t = 1/4、1/2 与终点），Q 之后的 L 从 Q 的终点接着走；不足三个点的折线被丢弃', () => {
  const path = [{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'Q', pts: [[4, 8], [8, 0]] }, { cmd: 'L', pts: [[8, -4]] }, { cmd: 'Z', pts: [] }];
  const [polygon] = R.flatten(path);
  assert.equal(polygon.length, 1 + Shapes.SAMPLES + 1, '起点 + SAMPLES 个取样点（含终点）+ 后面的 L');
  const at = i => polygon[i];
  assert.deepEqual(at(0), [0, 0]);
  assert.ok(Math.abs(at(Shapes.SAMPLES / 4)[0] - 2) < 1e-9 && Math.abs(at(Shapes.SAMPLES / 4)[1] - 3) < 1e-9, 't = 1/4 应在 (2, 3)');
  assert.ok(Math.abs(at(Shapes.SAMPLES / 2)[0] - 4) < 1e-9 && Math.abs(at(Shapes.SAMPLES / 2)[1] - 4) < 1e-9, 't = 1/2 应在 (4, 4)');
  assert.deepEqual(at(Shapes.SAMPLES), [8, 0], '终点');
  assert.deepEqual(at(Shapes.SAMPLES + 1), [8, -4]);
  // 第二个 Q 的起点是上一个 Q 的终点（current 要更新成 Q 的最后一个点）
  const twice = R.flatten([{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'Q', pts: [[0, 4], [4, 4]] }, { cmd: 'Q', pts: [[8, 4], [8, 0]] }, { cmd: 'Z', pts: [] }])[0];
  const mid = twice[Shapes.SAMPLES + Shapes.SAMPLES / 2];     // 第二段 t = 1/2：0.25·(4,4) + 0.5·(8,4) + 0.25·(8,0)
  assert.ok(Math.abs(mid[0] - 7) < 1e-9 && Math.abs(mid[1] - 3) < 1e-9, `第二段中点应在 (7, 3)，实际 ${mid}`);
  assert.deepEqual(R.flatten([{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'L', pts: [[4, 0]] }, { cmd: 'Z', pts: [] }]), [], '两个点围不出面积，丢弃');
});

test('flatten：Q 段的数值在“起点 x ≠ y、终点 y ≠ 0”的不对称数据上也对；没有 Z 的开放路径在结尾交出折线', () => {
  // 上面两条 Q 的起点都在对角线（0,0）、（4,4）上，终点 y 都是 0，把 current[0]/current[1] 互换或把终点 y 的项改坏都看不出来（系统性变异检查里这 4 个变异体存活）。
  // B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2，P0 = (2, 6)，P1 = (10, -2)，P2 = (6, 4)：t=1/4 → (84/16, 46/16)，1/2 → (7, 1.5)，3/4 → (116/16, 30/16)
  const [polygon] = R.flatten([{ cmd: 'M', pts: [[2, 6]] }, { cmd: 'Q', pts: [[10, -2], [6, 4]] }, { cmd: 'Z', pts: [] }]);
  const n = Shapes.SAMPLES;
  assert.deepEqual(polygon[0], [2, 6]);
  for (const [index, [x, y]] of [[n / 4, [84 / 16, 46 / 16]], [n / 2, [7, 1.5]], [3 * n / 4, [116 / 16, 30 / 16]], [n, [6, 4]]]) {
    assert.ok(Math.abs(polygon[index][0] - x) < 1e-9 && Math.abs(polygon[index][1] - y) < 1e-9, `取样点 ${index}：应在 (${x}, ${y})，实际 ${polygon[index]}`);
  }
  // 没有 Z：折线要在命令结束时交出来（形状数据全都以 Z 结尾，所以这条路径只有这个测试走得到）
  assert.deepEqual(R.flatten([{ cmd: 'M', pts: [[0, 0]] }, { cmd: 'L', pts: [[4, 0]] }, { cmd: 'L', pts: [[4, 4]] }]), [[[0, 0], [4, 0], [4, 4]]]);
});

test('检查清单：登记了每个有形状数据的动物，各组条数是正整数；对空白图像跑一遍，每个动物的实际条数与清单逐组一致（删掉任何一条 add(…) 都会失败）', () => {
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  assert.deepEqual(Object.keys(R.CHECK_MANIFEST).sort(), [...animals].sort(), '清单里的动物 = 有形状数据的动物');
  assert.ok(Object.isFrozen(R.CHECK_MANIFEST));
  const palette = Array.from({ length: 8 }, (_, i) => [0.2 + i * 0.1, 0.5, 0.5]);
  for (const id of animals) {
    const groups = R.CHECK_MANIFEST[id];
    assert.ok(Object.keys(groups).length >= 10 && Object.values(groups).every(n => Number.isInteger(n) && n > 0), `${id} 的清单`);
    const images = {};
    for (const item of R.buildCases(id)) images[item.name] = blank();
    const lines = R.checkSpecies(id, images, palette);
    assert.equal(R.manifestProblem(id, lines), null, `${id}：条数应与清单一致（有意增删检查时，同步更新 CHECK_MANIFEST 与文档里的总数）`);
    assert.equal(lines.length, Object.values(groups).reduce((sum, n) => sum + n, 0));
  }
  assert.deepEqual(Object.keys(R.CHECK_MANIFEST.hammer).filter(g => !(g in R.CHECK_MANIFEST.whaleshark)), [], '鲸鲨的组是小锤头鲨的超集');
  assert.ok(!('微笑' in R.CHECK_MANIFEST.hammer) && !('斑点' in R.CHECK_MANIFEST.manta) && '微笑' in R.CHECK_MANIFEST.whaleshark, '微笑、腹部、斑点只有鲸鲨有');
});

test('manifestProblem：少一条、多一条、多出新的组、少掉整组、没登记的动物各自给出说明；一致返回 null；可传入自己的清单', () => {
  const manifest = { cat: { 甲: 2, 乙: 1 } };
  const make = counts => Object.entries(counts).flatMap(([group, n]) => Array.from({ length: n }, () => ({ group })));
  assert.equal(R.manifestProblem('cat', make({ 甲: 2, 乙: 1 }), manifest), null);
  assert.match(R.manifestProblem('cat', make({ 甲: 1, 乙: 1 }), manifest), /\[甲\] 应有 2 条、实际 1 条/);
  assert.match(R.manifestProblem('cat', make({ 甲: 3, 乙: 1 }), manifest), /\[甲\] 应有 2 条、实际 3 条/);
  assert.match(R.manifestProblem('cat', make({ 甲: 2, 乙: 1, 丙: 1 }), manifest), /\[丙\] 应有 0 条、实际 1 条/);
  assert.match(R.manifestProblem('cat', make({ 甲: 2 }), manifest), /\[乙\] 应有 1 条、实际 0 条/);
  const two = R.manifestProblem('cat', make({ 甲: 1 }), manifest);
  assert.ok(two.includes('[甲]') && two.includes('[乙]') && two.includes('；'), `两处不一致要都说出来：${two}`);
  assert.match(R.manifestProblem('dog', make({ 甲: 2 }), manifest), /dog 没有登记检查清单.*CHECK_MANIFEST/);
  assert.equal(R.manifestProblem('hammer', make({ 分辨力: 1 })).includes('[颜色] 应有 57 条、实际 0 条'), true, '默认用内置清单');
});

test('reportSpecies：按组打印“通过/总数”，失败的项带名称与说明，--verbose 才打印通过的项；清单对不上算一项失败并计入汇总（总数与失败数各加一）', () => {
  const lines = [
    { group: '甲', name: 'a1', ok: true, detail: '好' }, { group: '乙', name: 'b1', ok: false, detail: '坏了' },
    { group: '甲', name: 'a2', ok: false, detail: '也坏了' }, { group: '乙', name: 'b2', ok: true, detail: '也好' },
  ];
  const exact = { cat: { 甲: 2, 乙: 2 } };
  const quiet = R.reportSpecies('cat', lines, { manifest: exact });
  assert.deepEqual(quiet.output, ['[甲] 1/2', '  ✗ a2：也坏了', '[乙] 1/2', '  ✗ b1：坏了'], '组按首次出现的顺序；项按原来的顺序；通过的项不打印');
  assert.deepEqual([quiet.total, quiet.failed], [4, 2]);
  const loud = R.reportSpecies('cat', lines, { verbose: true, manifest: exact });
  assert.deepEqual(loud.output, ['[甲] 1/2', '  ✓ a1：好', '  ✗ a2：也坏了', '[乙] 1/2', '  ✗ b1：坏了', '  ✓ b2：也好']);
  assert.deepEqual([loud.total, loud.failed], [4, 2]);
  const allGood = R.reportSpecies('cat', lines.map(line => ({ ...line, ok: true })), { manifest: exact });
  assert.deepEqual([allGood.total, allGood.failed], [4, 0]);
  assert.ok(!allGood.output.some(line => line.includes('检查清单')), '清单一致时不出现清单的行');
  const mismatch = R.reportSpecies('cat', lines.slice(0, 3), { manifest: exact });     // 少了 b2：乙 应有 2 条、实际 1 条
  assert.deepEqual(mismatch.output.slice(-2), ['[检查清单] 0/1', '  ✗ 检查的条数与清单不一致：[乙] 应有 2 条、实际 1 条']);
  assert.deepEqual([mismatch.total, mismatch.failed], [3 + 1, 2 + 1], '清单对不上多算一项失败');
  const unknown = R.reportSpecies('dog', lines.map(line => ({ ...line, ok: true })), { manifest: exact });
  assert.deepEqual([unknown.total, unknown.failed], [4 + 1, 1]);
  assert.ok(unknown.output.at(-1).includes('dog 没有登记检查清单'));
  // 默认用内置清单：把小锤头鲨的一次真实结果缺一条放进来，会被指出缺在哪一组
  const real = [];
  for (const [group, count] of Object.entries(R.CHECK_MANIFEST.hammer)) for (let i = 0; i < count - (group === '眼睛' ? 1 : 0); i++) real.push({ group, name: `${group}${i}`, ok: true, detail: '' });
  const missing = R.reportSpecies('hammer', real);
  assert.ok(missing.output.at(-1).includes('[眼睛] 应有 5 条、实际 4 条'), missing.output.at(-1));
  assert.equal(R.reportSpecies('hammer', [...real, { group: '眼睛', name: 'e', ok: true, detail: '' }]).failed, 0, '补上这一条就一致');
});

// 渲染工具替身：按真实工具的协议（<cases.json> <输出目录> → stdout 清单；--palette → 调色板）给每个用例一张纯色半透明的图，
// 可以让它报告错的动物、错的外观、不报告外观、没有调色板，也可以让它不回报 direct / show、或把 show 忽略掉（“只画一个元素”的图就成了整只图）。
// 真实工具需要 swiftc 与 AppKit，不在单测里编译。
const CLI = fileURLToPath(new URL('../desktop-reminder/species-render.mjs', import.meta.url));
const PNG_FIXTURE = new URL('./fixtures/png-encode.mjs', import.meta.url).href;
const stubColour = name => { const h = [...name].reduce((x, c) => (x * 31 + c.charCodeAt(0)) >>> 0, 7); return [h & 255, (h >>> 8) & 255, (h >>> 16) & 255, 128]; };
const STUB_PALETTE = Array.from({ length: 8 }, (_, i) => [0.2 + i * 0.1, 0.5, 0.5]);
const withTemp = body => { const dir = mkdtempSync(join(tmpdir(), 'render-cli-test-')); try { return body(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };
function makeStub(dir, options = {}) {
  const file = join(dir, 'stub-render.mjs');
  writeFileSync(file, `#!${process.execPath}
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from ${JSON.stringify(PNG_FIXTURE)};
const options = ${JSON.stringify(options)};
const colourOf = ${stubColour.toString()};
const expectedShow = ${R.expectedShow.toString()};
const [first, second] = process.argv.slice(2);
if (first === '--palette') {
  if (options.noPalette) process.exit(1);
  process.stdout.write(JSON.stringify(${JSON.stringify(STUB_PALETTE)}));
  process.exit(0);
}
const cases = JSON.parse(readFileSync(first, 'utf8'));
const manifest = cases.map(item => {
  const width = 340, height = 300, pixels = Buffer.alloc(width * height * 4), [r, g, b, a] = colourOf(item.name);
  for (let i = 0; i < width * height; i++) { pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a; }
  const path = join(second, item.name + '.png');
  writeFileSync(path, encodePng(width, height, pixels));
  const entry = { name: item.name, file: path, species: options.species || item.species, width, height, scale: 2 };
  if (!options.omitAppearance) entry.appearance = item.direct ? (options.directAppearance || 'none') : (options.appearance || (item.dark ? 'dark' : 'light'));
  if (!options.omitDirect) entry.direct = options.direct !== undefined ? options.direct : Boolean(item.direct);
  if (!options.omitShow) entry.show = options.ignoreShow ? expectedShow(undefined) : expectedShow(item.show);
  return entry;
});
process.stdout.write(JSON.stringify(manifest));
`);
  chmodSync(file, 0o755);
  return file;
}
const brief = (result, size = 400) => `退出码 ${result.status}；${(result.stdout + result.stderr).slice(-size).replace(/\s*\n\s*/g, ' | ')}`;
const runCli = (args, env = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
const uniformImages = species => {
  const images = {};
  for (const item of R.buildCases(species)) {
    const pixels = Buffer.alloc(W * H * 4), [r, g, b, a] = stubColour(item.name);
    for (let i = 0; i < W * H; i++) { pixels[i * 4] = r; pixels[i * 4 + 1] = g; pixels[i * 4 + 2] = b; pixels[i * 4 + 3] = a; }
    images[item.name] = { width: W, height: H, pixels };
  }
  return images;
};

test('命令行：检查没有通过时退出码为 1；按组打印“通过/总数”，汇总行的数字与逐项结果一致；失败的项带说明，通过的项只在 --verbose 时打印', () => withTemp(dir => {
  const stub = makeStub(dir), out = join(dir, 'out');
  const lines = R.checkSpecies('manta', uniformImages('manta'), STUB_PALETTE);
  const failedLines = lines.filter(line => !line.ok), passedLines = lines.filter(line => line.ok);
  assert.ok(failedLines.length > 50 && passedLines.length >= 1, '替身的纯色图应让绝大多数检查失败、至少放过一两项（用来核对打印）');
  assert.equal(R.manifestProblem('manta', lines), null);
  const result = runCli([`--bin=${stub}`, '--species=manta', `--out=${out}`]);
  assert.equal(result.status, 1, `有检查失败，退出码必须是 1：${brief(result)}`);
  assert.match(result.stdout, /== manta ==/, brief(result));
  assert.ok(result.stdout.includes(`✗ ${failedLines.length}/${lines.length} 项没有通过`), result.stdout.split('\n').slice(-3).join('|'));
  assert.ok(!/全部 \d+ 项通过/.test(result.stdout), '有失败时不能写“全部 N 项通过”');
  const groups = new Map();
  for (const line of lines) groups.set(line.group, [...(groups.get(line.group) || []), line]);
  for (const [group, items] of groups) assert.ok(result.stdout.includes(`[${group}] ${items.filter(line => line.ok).length}/${items.length}`), `组 ${group} 的计数`);
  const sample = failedLines[0];
  assert.ok(result.stdout.includes(`  ✗ ${sample.name}：${sample.detail}`), '失败的项要打印名称与说明');
  const passed = passedLines[0], passedText = `  ✓ ${passed.name}：${passed.detail}`;
  assert.ok(!result.stdout.includes(passedText), '没有 --verbose 时不打印通过的项');
  assert.ok(runCli([`--bin=${stub}`, '--species=manta', `--out=${out}`, '--verbose']).stdout.includes(passedText), '--verbose 打印通过的项');
  assert.ok(existsSync(join(out, 'manta-solid.png')), '指定了 --out 就保留图像');
}));

test('命令行：渲染工具给出的东西不对时按基础设施错误处理（退出码 2、说明原因），而不是当成检查失败', () => withTemp(dir => {
  const cases = [
    [{ species: 'hammer' }, ['--species=manta'], /manta-solid：请求 manta，原生实际画的是 hammer/],
    [{ appearance: 'light' }, ['--species=manta'], /manta-solid-dark：请求深色外观，渲染工具报告的是 light/],
    [{ appearance: 'dark' }, ['--species=manta'], /manta-solid：请求浅色外观，渲染工具报告的是 dark/],
    [{ omitAppearance: true }, ['--species=manta'], /manta-solid：请求浅色外观，渲染工具报告的是 没有报告（旧版渲染工具？）/],
    [{ noPalette: true }, ['--species=manta'], /渲染工具没有给出调色板/],
    [{ omitDirect: true }, ['--species=manta'], /manta-solid：请求经 JellyView 画，渲染工具报告的是 没有报告（旧版渲染工具？）/],
    [{ direct: true }, ['--species=manta'], /manta-solid：请求经 JellyView 画，渲染工具报告的是 直接画/],
    [{ direct: false }, ['--species=manta'], /manta-direct：请求直接画，渲染工具报告的是 经 JellyView 画/],
    [{ directAppearance: 'light' }, ['--species=manta'], /manta-direct：请求直接画（与外观无关），渲染工具报告的是 light/],
    [{ omitShow: true }, ['--species=manta'], /manta-solid：请求的元素可见性是 .*渲染工具报告的是 没有报告（旧版渲染工具？）/],
    [{ ignoreShow: true }, ['--species=manta'], /manta-direct-all：请求的元素可见性是 .*"strokes":false.*渲染工具报告的是 .*"strokes":true/],
    [{}, ['--species=turtle'], /turtle 没有形状数据，无法检查/],
    [{}, ['--species=jelly'], /jelly 没有形状数据，无法检查/],
  ];
  for (const [options, args, expected] of cases) {
    const stub = makeStub(dir, options);
    const result = runCli([`--bin=${stub}`, ...args, `--out=${join(dir, 'out')}`]);
    assert.equal(result.status, 2, `${JSON.stringify(options)} ${args}：退出码应为 2：${brief(result)}`);
    assert.match(result.stderr, expected, brief(result));
    assert.ok(!result.stdout.includes('项没有通过') && !/全部 \d+ 项通过/.test(result.stdout), '基础设施错误不打印检查汇总');
  }
}));

test('命令行：没有 --out 时用临时目录并在结束时删掉，--keep 才保留；--sheet 写出联系表（九张图按顺序、半透明图叠在白底或 --sheet-dark 的深底上）', () => withTemp(dir => {
  const stub = makeStub(dir), tempRoot = join(dir, 'tmp'); mkdirSync(tempRoot);
  const leftovers = () => readdirSync(tempRoot).filter(name => name.startsWith('species-render-'));
  runCli([`--bin=${stub}`, '--species=manta'], { TMPDIR: tempRoot });
  assert.deepEqual(leftovers(), [], '默认结束时删掉临时目录');
  runCli([`--bin=${stub}`, '--species=manta', '--keep'], { TMPDIR: tempRoot });
  const kept = leftovers();
  assert.equal(kept.length, 1, '--keep 保留临时目录');
  assert.ok(existsSync(join(tempRoot, kept[0], 'manta-solid.png')));
  const names = ['solid', 'duo', 'blend', 'rainbow', 'blend-left', 'pose-up', 'pose-wave-up', 'asleep', 'night'].map(name => `manta-${name}`);
  for (const [dark, back] of [[false, [255, 255, 255]], [true, [28, 30, 36]]]) {
    const sheet = join(dir, dark ? 'sheet-dark.png' : 'sheet.png');
    const result = runCli([`--bin=${stub}`, '--species=manta', `--sheet=${sheet}`, ...(dark ? ['--sheet-dark'] : [])]);
    assert.ok(result.stdout.includes(`联系表：${sheet}`), brief(result));
    const image = decodePng(sheet);
    assert.equal(image.width, 340 * 3); assert.equal(image.height, 300 * 3, '九张图，每行三张，三行');
    names.forEach((name, index) => {
      const [r, g, b] = stubColour(name), x = (index % 3) * 340 + 170, y = Math.floor(index / 3) * 300 + 150, at = (y * image.width + x) * 4;
      const expected = [r, g, b].map((c, k) => Math.round(c * 128 / 255 + back[k] * (1 - 128 / 255)));
      expected.forEach((value, k) => assert.ok(Math.abs(image.pixels[at + k] - value) <= 1, `${dark ? '深' : '浅'}底第 ${index} 张（${name}）通道 ${k}：期望 ${value}，实际 ${image.pixels[at + k]}`));
      assert.equal(image.pixels[at + 3], 255, '联系表不透明');
    });
  }
}));

// ---------- 元素（“画与不画”的差分）：用合成图核对判定函数 ----------
// 真实渲染里这些判定都通过；这里用按规格“画出来”的合成图确认它们放得过对的，再逐项做错（透明度、大小、位置、颜色、多画一块、少画一块）确认拦得住。
// 合成图的画法与产品一致：各层按 source-over 叠在透明底上，存成不预乘的 RGBA（真实 PNG 就是这样）。

const INK = [0.21, 0.29, 0.38], PINK = [1, 0.58, 0.66], BLUE = [0.3, 0.55, 0.85], WHITE = [1, 1, 1];
const lightenToward = (rgb, k) => rgb.map(v => Math.min(1, v + (1 - v) * k));
/** 把一层（覆盖率 field × alpha，颜色 rgb）叠到 image 上（就地修改并返回）。 */
function composeOver(image, field, rgb, alpha) {
  for (let i = 0; i < field.length; i++) {
    const sa = alpha * field[i];
    if (!sa) continue;
    const da = image.pixels[i * 4 + 3] / 255, oa = sa + da * (1 - sa);
    for (let k = 0; k < 3; k++) image.pixels[i * 4 + k] = Math.round((rgb[k] * sa + image.pixels[i * 4 + k] / 255 * da * (1 - sa)) / oa * 255);
    image.pixels[i * 4 + 3] = Math.round(oa * 255);
  }
  return image;
}
const fromField = (field, rgb = [0, 0, 0]) => composeOver(blank(), field, rgb, 1);
const shiftPolygons = (polygons, dx, dy) => polygons.map(poly => poly.map(([x, y]) => [x + dx, y + dy]));
const scaleAbout = (poly, k) => {
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
};
const levelOf = role => R.PAINT_SPEC.flat[role] ?? (R.PAINT_SPEC.fill[role][0] + R.PAINT_SPEC.fill[role][1]) / 2;
const partOf = (species, role) => R.poseGeometry(species).parts.find(part => part.role === role);
const layerImage = (polygons, rgb, alpha) => composeOver(blank(), R.coverage(polygons), rgb, alpha);
const outlineField = (polygons, halfWidth) => {
  const out = new Float32Array(W * H);
  for (const poly of polygons) { const field = R.curveCoverage([...poly, poly[0]], halfWidth); for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], field[i]); }
  return out;
};
const areaOf = field => field.reduce((sum, v) => sum + v, 0) / (R.VIEW.scale * R.VIEW.scale);
const copyImage = image => ({ ...image, pixels: Buffer.from(image.pixels) });

test('coverage / curveCoverage / ellipsePolygon / bezierPolyline：面积、圆头、端点与取样数', () => {
  assert.ok(Math.abs(areaOf(R.coverage([square(10, 10, 30, 30)])) - 400) < 1.5, '20×20 pt 的方块');
  assert.ok(Math.abs(areaOf(R.coverage([square(10.3, 10.3, 30.3, 30.3)])) - 400) < 1.5, '放在子像素位置，面积不变');
  assert.ok(Math.abs(areaOf(R.curveCoverage([[20, 20], [40, 20]], 1)) - (20 * 2 + Math.PI)) < 1.5, '长 20、半宽 1、两端圆头：20×2 + π');
  assert.ok(Math.abs(areaOf(R.curveCoverage([[20, 20], [40, 20], [40, 40]], 1)) - (40 * 2 + Math.PI)) < 2, '折线两段，拐角与两端都是圆的');
  const ellipse = R.ellipsePolygon([10, 20], 3, 2);
  assert.equal(ellipse.length, 72);
  assert.ok(ellipse.every(([x, y]) => Math.abs(((x - 10) / 3) ** 2 + ((y - 20) / 2) ** 2 - 1) < 1e-9), '每个点都在椭圆上');
  assert.ok(Math.abs(areaOf(R.coverage([ellipse])) - Math.PI * 6) < 0.6, '椭圆面积 π·3·2');
  const curve = R.bezierPolyline([[0, 0], [1, 2], [3, 2], [4, 0]], 8);
  assert.equal(curve.length, 9);
  assert.deepEqual(curve[0], [0, 0]); assert.deepEqual(curve[8], [4, 0]);
  assert.ok(Math.abs(curve[4][0] - 2) < 1e-12 && Math.abs(curve[4][1] - 1.5) < 1e-12, '中点 (2, 1.5)');
  assert.equal(R.bezierPolyline([[0, 0], [1, 2], [3, 2], [4, 0]]).length, 49, '默认取样 48 段');
});

test('compareAlpha：一致 → 比 1、偏移 0、没有多余像素；alpha 偏大、整体平移、别处多一个像素各自从对应的数字上看得出来；两边都空是“一致”，一边空另一边有是“不一致”', () => {
  const polygons = [square(40, 40, 70, 60)], predicted = R.coverage(polygons).map(v => v * 0.8);
  const same = R.compareAlpha(fromField(predicted), predicted);
  assert.ok(Math.abs(same.ratio - 1) < 0.01 && same.shift < 0.01 && same.stray === 0, `一致：${same.ratio} ${same.shift} ${same.stray}`);
  const heavier = R.compareAlpha(fromField(predicted.map(v => v * 1.1)), predicted);
  assert.ok(Math.abs(heavier.ratio - 1.1) < 0.01 && heavier.shift < 0.01, `alpha 大 10%：${heavier.ratio}`);
  const moved = R.compareAlpha(fromField(R.coverage(shiftPolygons(polygons, 1, 0)).map(v => v * 0.8)), predicted);
  assert.ok(Math.abs(moved.shift - 1) < 0.03 && Math.abs(moved.ratio - 1) < 0.01, `平移 1 pt：偏移 ${moved.shift}`);
  const lone = fromField(predicted), at = (150 * W + 300) * 4;                      // 离形状很远的一个像素
  lone.pixels[at + 3] = 255;
  assert.equal(R.compareAlpha(lone, predicted).stray, 1, '别处多一个像素');
  const faint = fromField(predicted); faint.pixels[at + 3] = 8;
  assert.equal(R.compareAlpha(faint, predicted).stray, 0, 'alpha < 4%（10/255）的不算多余');
  const none = new Float32Array(W * H);
  const empty = R.compareAlpha(blank(), none);
  assert.ok(empty.ratio === 1 && empty.shift === 0 && empty.stray === 0, '都空：一致');
  const drawnButNotExpected = R.compareAlpha(fromField(predicted), none);
  assert.ok(drawnButNotExpected.ratio === Infinity && Number.isNaN(drawnButNotExpected.shift), '画了不该有的东西');
  const expectedButMissing = R.compareAlpha(blank(), predicted);
  assert.ok(expectedButMissing.ratio === 0 && Number.isNaN(expectedButMissing.shift), '该有的没画');
});

test('judgeLayer：按规格画的各层（腹部、斑点、高光、躯干、肢体）通过；alpha 偏、位置偏、别处多一点、颜色不对各自被拦住；未知角色报错', () => {
  const cases = [['hammer', 'shine', WHITE], ['hammer', 'body', BLUE], ['hammer', 'limb', BLUE], [WHALE, 'belly', lightenToward(BLUE, R.PAINT_SPEC.bellyLighten)], [WHALE, 'accent', WHITE]];
  for (const [species, role, rgb] of cases) {
    const part = partOf(species, role), level = levelOf(role), judge = image => R.judgeLayer(role, image, part.polygons, { tone: BLUE });
    const good = judge(layerImage(part.polygons, rgb, level));
    assert.ok(good.ok && good.pixels > 20, `${species} ${role} 应通过：${good.detail}`);
    assert.ok(!judge(layerImage(part.polygons, rgb, level * 0.85)).ok, `${role}：alpha 小 15%`);
    assert.ok(!judge(layerImage(part.polygons, rgb, Math.min(1, level * 1.06))).ok, `${role}：alpha 大 6%`);
    assert.ok(!judge(layerImage(shiftPolygons(part.polygons, 0.5, 0), rgb, level)).ok, `${role}：整体平移 0.5 pt`);
    const stray = copyImage(layerImage(part.polygons, rgb, level)); composeOver(stray, R.coverage([square(5, 5, 6, 6)]), rgb, level);
    const strayVerdict = judge(stray);
    assert.ok(!strayVerdict.ok && strayVerdict.stray > 0, `${role}：别处多画一个 1 pt 的小块：${strayVerdict.stray}`);
    assert.ok(!judge(blank()).ok, `${role}：什么都没画`);
  }
  for (const role of ['shine', 'accent']) {
    const part = partOf(role === 'shine' ? 'hammer' : WHALE, role);
    assert.ok(!R.judgeLayer(role, layerImage(part.polygons, [0.8, 0.85, 1], levelOf(role)), part.polygons).ok, `${role}：不是纯白（通道 < 0.97）`);
  }
  const belly = partOf(WHALE, 'belly'), want = lightenToward(BLUE, R.PAINT_SPEC.bellyLighten);
  assert.ok(!R.judgeLayer('belly', layerImage(belly.polygons, [0.9, 0.5, 0.5], levelOf('belly')), belly.polygons, { tone: BLUE }).ok, '腹部颜色不是主色提亮');
  assert.ok(!R.judgeLayer('belly', layerImage(belly.polygons, lightenToward(BLUE, 0.4), levelOf('belly')), belly.polygons, { tone: BLUE }).ok, '腹部提亮不够（0.4 对 0.72）');
  assert.ok(R.judgeLayer('belly', layerImage(belly.polygons, [0.9, 0.5, 0.5], levelOf('belly')), belly.polygons).ok, '不给主色就不核对腹部颜色');
  assert.ok(R.judgeLayer('belly', layerImage(belly.polygons, want.map(v => Math.min(1, v + 0.04)), levelOf('belly')), belly.polygons, { tone: BLUE }).ok, '颜色差 0.04 在 AppKit 颜色转换的误差之内');
  // 渐变填充：alpha 沿竖直方向由 0.94 到 0.96 仍在范围内；整体掉到 0.85 就出范围
  const body = partOf('hammer', 'body'), ys = body.polygons.flat().map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys);
  const cover = R.coverage(body.polygons), gradientImage = blank();
  for (let i = 0; i < cover.length; i++) {
    if (!cover[i]) continue;
    const y = R.VIEW.height - (Math.floor(i / W) + 0.5) / R.VIEW.scale, alpha = (0.94 + 0.02 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)))) * cover[i];
    gradientImage.pixels.set([Math.round(BLUE[0] * 255), Math.round(BLUE[1] * 255), Math.round(BLUE[2] * 255), Math.round(alpha * 255)], i * 4);
  }
  assert.ok(R.judgeLayer('body', gradientImage, body.polygons).ok, '竖直渐变 0.94→0.96 在范围内');
  const dim = blank();
  for (let i = 0; i < cover.length; i++) if (cover[i]) dim.pixels.set([77, 140, 217, Math.round(0.85 * cover[i] * 255)], i * 4);
  assert.ok(!R.judgeLayer('body', dim, body.polygons).ok, '整体掉到 0.85：出范围');
  assert.throws(() => R.judgeLayer('nope', blank(), []), /没有 nope 的规格/);
});

test('judgeFillEnds：渐变从规格范围的下端走到上端才通过；终点透明度偏低、起点偏高、整体压在中间、没有像素各自被拦住；没有填充范围的角色报错', () => {
  const gradientEntries = (role, { from = R.PAINT_SPEC.fill[role][0], to = R.PAINT_SPEC.fill[role][1] } = {}) => {
    const parts = R.poseGeometry('hammer').parts.filter(part => part.role === role), ys = parts.flatMap(part => part.polygons.flat().map(p => p[1])), lo = Math.min(...ys), hi = Math.max(...ys);
    return parts.map(part => {
      const cover = R.coverage(part.polygons), image = blank();
      for (let i = 0; i < cover.length; i++) {
        if (!cover[i]) continue;
        const y = R.VIEW.height - (Math.floor(i / W) + 0.5) / R.VIEW.scale, alpha = (from + (to - from) * Math.min(1, Math.max(0, (y - lo) / (hi - lo)))) * cover[i];
        image.pixels.set([77, 140, 217, Math.round(alpha * 255)], i * 4);
      }
      return { image, polygons: part.polygons };
    });
  };
  for (const role of ['body', 'limb']) {
    const [lo, hi] = R.PAINT_SPEC.fill[role], good = R.judgeFillEnds(role, gradientEntries(role));
    assert.ok(good.ok && good.pixels > 100, `${role} 应通过：${good.detail}`);
    assert.ok(!R.judgeFillEnds(role, gradientEntries(role, { to: hi - 0.02 })).ok, `${role}：终点透明度偏低 0.02（渐变的停点位置超出 1 就是这个效果）`);
    assert.ok(!R.judgeFillEnds(role, gradientEntries(role, { from: lo + 0.02 })).ok, `${role}：起点透明度偏高 0.02`);
    assert.ok(!R.judgeFillEnds(role, gradientEntries(role, { from: lo + 0.015, to: hi - 0.015 })).ok, `${role}：整体压在中间`);
    assert.ok(R.judgeFillEnds(role, gradientEntries(role, { from: lo + 0.005, to: hi - 0.005 })).ok, `${role}：两端各差 0.005 在余量之内`);
    assert.ok(!R.judgeFillEnds(role, []).ok, `${role}：没有部件`);
  }
  assert.throws(() => R.judgeFillEnds('belly', []), /没有 belly 的填充范围/);
});

test('judgeStroke：按规格画的描边（躯干 1.1 pt、肢体 1.0 pt，α 0.9，比填充暗、同色相）通过；线宽、α、位置、颜色做错各自被拦住；没有描边规格的角色报错', () => {
  const darker = rgb => rgb.map(v => v * 0.55);                       // 同色相、更暗
  for (const role of ['body', 'limb']) {
    const part = partOf('hammer', role), widthPt = R.PAINT_SPEC.stroke[role], fillAlpha = levelOf(role);
    const fill = layerImage(part.polygons, BLUE, fillAlpha);
    const withStroke = ({ width = widthPt, alpha = R.PAINT_SPEC.stroke.alpha, rgb = darker(BLUE), dx = 0 } = {}) =>
      composeOver(copyImage(fill), outlineField(shiftPolygons(part.polygons, dx, 0), width / 2), rgb, alpha);
    const judge = image => R.judgeStroke(role, image, fill, part.polygons, { tone: BLUE });
    const good = judge(withStroke());
    assert.ok(good.ok && Math.abs(good.ratio - 1) < 0.02 && good.stray === 0 && good.ringCount >= R.LIMITS.strokeRingMin, `${role} 应通过：${good.detail}`);
    assert.ok(!judge(withStroke({ width: widthPt * 1.15 })).ok, `${role}：线宽粗 15%`);
    assert.ok(!judge(withStroke({ width: widthPt * 0.85 })).ok, `${role}：线宽细 15%`);
    assert.ok(!judge(withStroke({ alpha: 1 })).ok, `${role}：α 1.0（规格 0.9）`);
    assert.ok(!judge(withStroke({ alpha: 0.8 })).ok, `${role}：α 0.8`);
    assert.ok(!judge(fill).ok, `${role}：没有画描边`);
    const strayVerdict = judge(withStroke({ dx: 2.5 }));
    assert.ok(!strayVerdict.ok && strayVerdict.stray > 0, `${role}：描边画偏了 2.5 pt：多余像素 ${strayVerdict.stray}`);
    assert.ok(!judge(withStroke({ rgb: BLUE })).ok, `${role}：描边与填充同色（不比填充暗）`);
    assert.ok(!judge(withStroke({ rgb: [0.55, 0.3, 0.1] })).ok, `${role}：描边色相不对`);
    assert.ok(R.judgeStroke(role, withStroke({ rgb: [0.55, 0.3, 0.1] }), fill, part.polygons).ok, '不给主色就不核对描边的色相与明暗');
  }
  assert.throws(() => R.judgeStroke('belly', blank(), blank(), []), /没有 belly 的描边规格/);
});

/** 把一组眼睛形状（R.eyeShapes）按规格画出来：圆是墨色 α 0.88，高光是白 α 0.85 盖在圆上，睡着是线宽 1.3 的弧。transform 可以把每个形状做错。 */
function drawEyes(shapes, { disc = shape => shape.disc, glint = shape => shape.glint, ink = INK, alpha = R.PAINT_SPEC.eye.alpha, withGlint = true, arcWidth = R.PAINT_SPEC.eye.arcWidth, arc = shape => shape.arc } = {}) {
  const image = blank();
  for (const shape of shapes) {
    if (shape.arc) composeOver(image, R.curveCoverage(arc(shape), arcWidth / 2), ink, alpha);
    else {
      composeOver(image, R.coverage([disc(shape)]), ink, alpha);
      if (withGlint) composeOver(image, R.coverage([glint(shape)]), WHITE, R.PAINT_SPEC.eye.glintAlpha);
    }
  }
  return image;
}

test('eyeShapes：睁眼是圆加高光，睡着（没被抓住）是弧；警觉放大 1.25 倍、转身变窄、眨眼变扁、瞳孔随视线偏移', () => {
  const widthOf = poly => Math.max(...poly.map(p => p[0])) - Math.min(...poly.map(p => p[0]));
  const heightOf = poly => Math.max(...poly.map(p => p[1])) - Math.min(...poly.map(p => p[1]));
  const centreOf = poly => [(Math.max(...poly.map(p => p[0])) + Math.min(...poly.map(p => p[0]))) / 2, (Math.max(...poly.map(p => p[1])) + Math.min(...poly.map(p => p[1]))) / 2];
  const shapesFor = (species, pose) => R.eyeShapes(R.poseGeometry(species, pose), pose);
  for (const species of ['hammer', WHALE]) {
    const rest = shapesFor(species, {}), geometry = R.poseGeometry(species);
    assert.equal(rest.length, geometry.eyes.length, `${species}：每只眼睛一个形状`);
    assert.ok(rest.every(shape => shape.disc && shape.glint && !shape.arc));
    assert.ok(Math.abs(widthOf(rest[0].disc) - 2 * geometry.eyeRadius) < 0.02 && Math.abs(heightOf(rest[0].disc) - 2 * geometry.eyeRadius) < 0.02, '静止：圆，半径 = eyeRadius');
    assert.ok(Math.abs(widthOf(shapesFor(species, { alert: true })[0].disc) / widthOf(rest[0].disc) - 1.25) < 0.01, '警觉：1.25 倍');
    assert.ok(Math.abs(widthOf(shapesFor(species, { facing: 0.5 })[0].disc) / widthOf(rest[0].disc) - 0.5) < 0.01 && Math.abs(heightOf(shapesFor(species, { facing: 0.5 })[0].disc) / heightOf(rest[0].disc) - 1) < 0.01, '转身途中：只变窄');
    assert.ok(Math.abs(widthOf(shapesFor(species, { facing: 0 })[0].disc) / widthOf(rest[0].disc) - R.PAINT_SPEC.eye.narrowMin) < 0.01, '正对时变窄到下限 0.35');
    assert.ok(Math.abs(heightOf(shapesFor(species, { blink: 0.6 })[0].disc) / heightOf(rest[0].disc) - 0.4) < 0.01, '眨眼 0.6：高度 0.4');
    assert.ok(Math.abs(heightOf(shapesFor(species, { blink: 1 })[0].disc) / heightOf(rest[0].disc) - R.PAINT_SPEC.eye.openMin) < 0.01, '闭眼：高度到下限 0.12');
    const gaze = shapesFor(species, { gaze: [1, -0.5] })[0], at = centreOf(rest[0].disc), looked = centreOf(gaze.disc);
    assert.ok(Math.abs(looked[0] - at[0] - 1.4) < 0.01 && Math.abs(looked[1] - at[1] + 0.5) < 0.01, '瞳孔偏移 (1.4·x, 1.0·y)');
    const asleep = shapesFor(species, { asleep: true });
    assert.ok(asleep.every(shape => shape.arc && !shape.disc && shape.arc.length === 49), '睡着：一道弧（48 段）');
    assert.ok(shapesFor(species, { asleep: true, grabbed: true }).every(shape => shape.disc && !shape.arc), '睡着又被抓住：醒着的圆');
    assert.ok(shapesFor(species, { asleep: true, alert: true }).every(shape => shape.arc), '睡着时警觉无效（仍是弧）');
    const arcWidthOf = shapes => Math.abs(shapes[0].arc[48][0] - shapes[0].arc[0][0]);
    assert.ok(Math.abs(arcWidthOf(shapesFor(species, { asleep: true, facing: 0.5 })) / arcWidthOf(asleep) - 0.5) < 1e-9, '睡着时转身途中：弧的宽度随朝向变窄一半');
    const arcCentre = [(asleep[0].arc[0][0] + asleep[0].arc[48][0]) / 2, asleep[0].arc[0][1]];
    assert.ok(Math.abs(arcCentre[0] - geometry.eyes[0][0]) < 1e-9 && Math.abs(arcCentre[1] - geometry.eyes[0][1] - R.PAINT_SPEC.eye.arcEnd) < 1e-9, '弧两端比眼睛中心高 0.8 pt');
  }
});

test('judgeEyeImage：各姿态下按规格画的眼睛通过（醒着的圆与高光、睡着的弧）；大小、位置、透明度、颜色、高光的有无/大小/位置、多画一块各自被拦住；空白图不抛错', () => {
  const POSES = Object.entries(R.FACE_VARIANTS);
  for (const species of ['hammer', WHALE]) {
    for (const [variant, pose] of POSES) {
      const geometry = R.poseGeometry(species, pose), shapes = R.eyeShapes(geometry, pose);
      const verdict = R.judgeEyeImage(drawEyes(shapes), geometry, pose);
      assert.ok(verdict.ok, `${species}（${variant}）应通过：${verdict.detail}`);
    }
  }
  const species = 'hammer', pose = R.FACE_VARIANTS.rest, geometry = R.poseGeometry(species, pose), shapes = R.eyeShapes(geometry, pose);
  const judge = image => R.judgeEyeImage(image, geometry, pose);
  const expectFail = (label, image, pick = () => true) => { const verdict = judge(image); assert.ok(!verdict.ok && pick(verdict), `${label}：${verdict.detail}`); };
  expectFail('圆大 10%', drawEyes(shapes, { disc: s => scaleAbout(s.disc, 1.1) }));
  expectFail('圆小 10%', drawEyes(shapes, { disc: s => scaleAbout(s.disc, 0.9) }));
  expectFail('圆移位 0.3 pt', drawEyes(shapes, { disc: s => shiftPolygons([s.disc], 0.3, 0)[0] }), v => v.shift > R.LIMITS.faceShift);
  expectFail('α 0.7', drawEyes(shapes, { alpha: 0.7 }), v => Math.abs(v.ratio - 1) > R.LIMITS.faceRatio);
  expectFail('颜色是浅色', drawEyes(shapes, { ink: [0.8, 0.85, 0.95] }));
  expectFail('没有高光', drawEyes(shapes, { withGlint: false }));
  expectFail('高光移位 0.3 pt', drawEyes(shapes, { glint: s => shiftPolygons([s.glint], 0.3, 0)[0] }));
  expectFail('高光大 36%（半径 × 1.17）', drawEyes(shapes, { glint: s => scaleAbout(s.glint, 1.17) }));
  expectFail('高光小 30%（半径 × 0.83）', drawEyes(shapes, { glint: s => scaleAbout(s.glint, 0.83) }));
  const extra = drawEyes(shapes); composeOver(extra, R.coverage([square(5, 5, 6, 6)]), INK, 0.88);
  expectFail('别处多画一个小块', extra, v => v.stray > 0);
  assert.ok(judge(drawEyes(shapes, { glint: s => scaleAbout(s.glint, 1.03) })).ok, '高光大 6%（面积）在容差之内：不是追求“差一点点就拦”');
  // 睡着的弧
  const sleepPose = R.FACE_VARIANTS.asleep, sleepGeometry = R.poseGeometry(species, sleepPose), sleepShapes = R.eyeShapes(sleepGeometry, sleepPose);
  const judgeSleep = image => R.judgeEyeImage(image, sleepGeometry, sleepPose);
  assert.ok(!judgeSleep(drawEyes(sleepShapes, { arcWidth: 1.5 })).ok, '弧线宽 1.5（规格 1.3）');
  assert.ok(!judgeSleep(drawEyes(sleepShapes, { arcWidth: 1.1 })).ok, '弧线宽 1.1');
  assert.ok(!judgeSleep(drawEyes(sleepShapes, { arc: s => s.arc.map(([x, y]) => [x + 0.3, y]) })).ok, '弧移位 0.3 pt');
  assert.ok(!judgeSleep(drawEyes(sleepShapes, { arc: s => s.arc.map(([x, y]) => [x, y - 0.4]) })).ok, '弧低了 0.4 pt');
  assert.ok(!judgeSleep(drawEyes(R.eyeShapes(sleepGeometry, {}))).ok, '睡着时画成了睁开的圆');
  assert.ok(!R.judgeEyeImage(drawEyes(sleepShapes), geometry, pose).ok, '该睁眼时画成了弧');
  assert.doesNotThrow(() => R.judgeEyeImage(blank(), geometry, pose));
  assert.ok(!R.judgeEyeImage(blank(), geometry, pose).ok, '空白图：不通过');
});

test('glintEstimate：由亮度反推高光的面积与质心——对的画法比值接近 1、偏移很小；大了、小了、移位了、没有都有数字；圆太小或没有期望的高光返回 null', () => {
  const geometry = R.poseGeometry('hammer'), [shape] = R.eyeShapes(geometry, {});
  const estimate = image => R.glintEstimate(image, shape.disc, shape.glint);
  const good = estimate(drawEyes([shape]));
  assert.ok(good && good.ratio > 0.97 && good.ratio < 1.03 && good.shift < 0.01, `对的：${JSON.stringify(good)}`);
  const big = estimate(drawEyes([shape], { glint: s => scaleAbout(s.glint, 1.3) })), small = estimate(drawEyes([shape], { glint: s => scaleAbout(s.glint, 0.7) }));
  assert.ok(Math.abs(big.ratio - 1.69) < 0.12 && Math.abs(small.ratio - 0.49) < 0.08, `大 1.3 倍的面积 1.69、小到 0.7 倍的面积 0.49：${big.ratio} ${small.ratio}`);
  const moved = estimate(drawEyes([shape], { glint: s => shiftPolygons([s.glint], 0.25, -0.2)[0] }));
  assert.ok(Math.abs(moved.shift - Math.hypot(0.25, 0.2)) < 0.03, `移位 (0.25, −0.2)：偏移 ${moved.shift}`);
  const absent = estimate(drawEyes([shape], { withGlint: false }));
  assert.ok(absent.ratio < 0.05, `没有高光：${absent.ratio}`);
  assert.equal(R.glintEstimate(blank(), R.ellipsePolygon([20, 20], 0.5, 0.5), R.ellipsePolygon([20, 20], 0.1, 0.1)), null, '圆里完全覆盖的像素不足 8 个');
  assert.equal(R.glintEstimate(drawEyes([shape]), shape.disc, R.ellipsePolygon([5, 5], 0.0001, 0.0001)), null, '期望的高光在圆外/没有面积');
});

test('judgeBlushImage：按朝向变窄的粉色椭圆（α 0.34）通过；大小、位置、透明度、颜色、没有变窄、多画一块各自被拦住', () => {
  const species = WHALE, drawBlush = (pose, { scale = 1, dx = 0, alpha = R.PAINT_SPEC.blushAlpha, rgb = PINK, narrow = Math.max(R.PAINT_SPEC.eye.narrowMin, Math.abs(pose.facing ?? 1)) } = {}) => {
    const image = blank();
    for (const spot of R.poseGeometry(species, pose).blush) composeOver(image, R.coverage([R.ellipsePolygon([spot.center[0] + dx, spot.center[1]], spot.rx * narrow * scale, spot.ry * scale)]), rgb, alpha);
    return image;
  };
  for (const variant of ['rest', 'all', 'half']) {
    const pose = R.FACE_VARIANTS[variant], verdict = R.judgeBlushImage(drawBlush(pose), R.poseGeometry(species, pose), pose);
    assert.ok(verdict.ok, `（${variant}）应通过：${verdict.detail}`);
  }
  const pose = R.FACE_VARIANTS.rest, geometry = R.poseGeometry(species, pose), judge = image => R.judgeBlushImage(image, geometry, pose);
  assert.ok(!judge(drawBlush(pose, { scale: 1.12 })).ok, '大 12%');
  assert.ok(!judge(drawBlush(pose, { scale: 0.88 })).ok, '小 12%');
  assert.ok(!judge(drawBlush(pose, { dx: 0.3 })).ok, '移位 0.3 pt');
  assert.ok(!judge(drawBlush(pose, { alpha: 0.5 })).ok && !judge(drawBlush(pose, { alpha: 0.2 })).ok, 'α 0.5 / 0.2');
  assert.ok(!judge(drawBlush(pose, { rgb: [0.5, 0.5, 0.5] })).ok, '灰色');
  assert.ok(!judge(drawBlush(pose, { rgb: [0.3, 0.8, 0.4] })).ok, '绿色');
  const half = R.FACE_VARIANTS.half;
  assert.ok(!R.judgeBlushImage(drawBlush(half, { narrow: 1 }), R.poseGeometry(species, half), half).ok, '转身途中没有变窄');
  const extra = drawBlush(pose); composeOver(extra, R.coverage([square(5, 5, 6, 6)]), PINK, 0.34);
  assert.ok(!judge(extra).ok, '别处多画一块');
  assert.ok(!judge(blank()).ok, '空白图：不通过');
});

test('judgeMouthImage：沿曲线加粗到 1.2 pt、两端圆头、墨色 α 0.88 通过；睡着时什么都没有才通过；线宽、α、位置、颜色做错被拦住；没有嘴的动物返回 null', () => {
  const species = WHALE, geometry = R.poseGeometry(species, {});
  const drawMouth = (geometry2, { width = R.PAINT_SPEC.mouth.width, alpha = R.PAINT_SPEC.mouth.alpha, dy = 0, rgb = INK } = {}) =>
    composeOver(blank(), R.curveCoverage(R.bezierPolyline(geometry2.mouth).map(([x, y]) => [x, y + dy]), width / 2), rgb, alpha);
  for (const variant of ['rest', 'all', 'asleep', 'grabbed']) {
    const pose = R.FACE_VARIANTS[variant], at = R.poseGeometry(species, pose), asleep = Boolean(pose.asleep) && !pose.grabbed;
    const verdict = R.judgeMouthImage(asleep ? blank() : drawMouth(at), at, pose);
    assert.ok(verdict.ok, `（${variant}）应通过：${verdict.detail}`);
  }
  const judge = image => R.judgeMouthImage(image, geometry, {});
  assert.ok(!judge(drawMouth(geometry, { width: 1.5 })).ok, '线宽 1.5');
  assert.ok(!judge(drawMouth(geometry, { width: 0.9 })).ok, '线宽 0.9');
  assert.ok(!judge(drawMouth(geometry, { alpha: 0.6 })).ok, 'α 0.6');
  assert.ok(!judge(drawMouth(geometry, { dy: 0.3 })).ok, '移位 0.3 pt');
  assert.ok(!judge(drawMouth(geometry, { rgb: [0.9, 0.9, 0.95] })).ok, '线是浅色');
  assert.ok(!judge(blank()).ok, '醒着却没画');
  const sleeping = R.FACE_VARIANTS.asleep, sleepGeometry = R.poseGeometry(species, sleeping);
  assert.ok(!R.judgeMouthImage(drawMouth(sleepGeometry), sleepGeometry, sleeping).ok, '睡着时画了嘴');
  assert.equal(R.judgeMouthImage(blank(), R.poseGeometry('hammer', {}), {}), null, '没有嘴的动物');
});

test('judgeComposite：各层按绘制顺序叠起来与整只图一致才通过；少一层、层的透明度不对、层与整只图尺寸不同各自被拦住；容差可调', () => {
  const part = partOf('hammer', 'body'), other = partOf('hammer', 'shine');
  const lower = layerImage(part.polygons, BLUE, 0.95), upper = layerImage(other.polygons, WHITE, 0.4), full = composeOver(copyImage(lower), R.coverage(other.polygons), WHITE, 0.4);
  const same = R.judgeComposite([lower, upper], full);
  assert.ok(same.ok && same.worst <= 1.5 && same.over === 0, `一致：${same.detail}`);
  assert.ok(!R.judgeComposite([lower], full).ok, '少了上面一层');
  assert.ok(!R.judgeComposite([upper, lower], full).ok, '顺序反了（高光被躯干盖住）');
  assert.ok(!R.judgeComposite([lower, layerImage(other.polygons, WHITE, 0.5)], full).ok, '上层 α 0.5（规格 0.4）');
  const small = { width: 10, height: 10, pixels: Buffer.alloc(400) };
  const mismatch = R.judgeComposite([small], full);
  assert.ok(!mismatch.ok && mismatch.worst === Infinity && /尺寸/.test(mismatch.detail), '尺寸不同');
  assert.ok(R.judgeComposite([lower, layerImage(other.polygons, WHITE, 0.4 + 6 / 255)], full, 8).ok, '把容差放宽到 8/255 后，6/255 的差能过');
  assert.ok(!R.judgeComposite([lower, layerImage(other.polygons, WHITE, 0.4 + 6 / 255)], full, 3).ok, '默认容差 3/255 拦得住 6/255 的差');
  // 只有一个方向的尺寸不同（宽相同、高少一行；高相同、宽少一列）也是“尺寸不同”，而不是读到缓冲区外去
  const shorter = { width: full.width, height: full.height - 1, pixels: Buffer.alloc(full.width * (full.height - 1) * 4) };
  const narrower = { width: full.width - 1, height: full.height, pixels: Buffer.alloc((full.width - 1) * full.height * 4) };
  for (const [label, layer] of [['高少一行', shorter], ['宽少一列', narrower]]) {
    const verdict = R.judgeComposite([layer], full);
    assert.ok(!verdict.ok && verdict.worst === Infinity && /尺寸/.test(verdict.detail), `${label}：${verdict.detail}`);
  }
});

// ---------- 判定函数的补强 ----------
// 上面的测试放得过对的、拦得住整体做错的。这里把另外几处钉住：它们在真实渲染里被别的检查顺带兜住，单独坏掉时没有任何测试会报
// （变异检查里存活的那些：一个内部像素不对、没有内部像素可核对、圆太小不估计高光、弧与窄眼睛的颜色、窄眼睛里高光的有无、淡粉色、尺寸只差一个方向、
//  脸的姿态表、没有形状数据的错误说明、睡觉的 “z” 的六个条件）。

/** polygons 里一个“稳稳在里面”的像素下标：周围 margin 圈的像素覆盖率都是 1（找不到就报错，免得测试悄悄变成空转）。 */
function solidPixel(polygons, margin) {
  const cover = R.coverage(polygons);
  for (let i = 0; i < cover.length; i++) {
    let solid = true;
    for (let dy = -margin; dy <= margin && solid; dy++) for (let dx = -margin; dx <= margin; dx++) if (cover[i + dy * W + dx] !== 1) { solid = false; break; }
    if (solid) return i;
  }
  throw new Error('没有找到稳稳在里面的像素');
}
const statsWithin = verdict => Math.abs(verdict.ratio - 1) <= R.LIMITS.elementRatio && verdict.shift <= R.LIMITS.elementShift && verdict.stray === 0;

test('judgeLayer：整体质量几乎不变、只有一个内部像素的 alpha 不对也被拦住（平铺层与渐变层，偏高偏低各一）；小到没有内部像素时不通过并说明，其余几项仍是对的', () => {
  // 平铺层（高光，α 0.40）
  const shine = partOf('hammer', 'shine'), flat = levelOf('shine'), flatAt = solidPixel(shine.polygons, 1);
  const flatGood = R.judgeLayer('shine', layerImage(shine.polygons, WHITE, flat), shine.polygons);
  assert.ok(flatGood.ok && flatGood.outside === 0 && !/没有内部像素可核对/.test(flatGood.detail), `对的画法：${flatGood.detail}`);
  for (const delta of [0.08, -0.08]) {
    const image = layerImage(shine.polygons, WHITE, flat);
    image.pixels[flatAt * 4 + 3] = Math.round((flat + delta) * 255);
    const verdict = R.judgeLayer('shine', image, shine.polygons);
    assert.ok(statsWithin(verdict), `只有一个像素不对：质量比、质心、多余像素都还在容差里（所以拦住它的只能是逐像素这一项）：${verdict.detail}`);
    assert.ok(!verdict.ok && verdict.outside === 1, `平铺层：一个内部像素 alpha ${delta > 0 ? '偏高' : '偏低'} 0.08：${verdict.detail}`);
  }
  // 渐变层（躯干，竖直渐变 0.94→0.96，范围 0.93…0.97）
  const body = partOf('hammer', 'body'), ys = body.polygons.flat().map(p => p[1]), lo = Math.min(...ys), hi = Math.max(...ys), cover = R.coverage(body.polygons);
  const gradient = () => {
    const image = blank();
    for (let i = 0; i < cover.length; i++) {
      if (!cover[i]) continue;
      const y = R.VIEW.height - (Math.floor(i / W) + 0.5) / R.VIEW.scale, alpha = (0.94 + 0.02 * Math.min(1, Math.max(0, (y - lo) / (hi - lo)))) * cover[i];
      image.pixels.set([77, 140, 217, Math.round(alpha * 255)], i * 4);
    }
    return image;
  };
  const fillAt = solidPixel(body.polygons, 2);
  const fillGood = R.judgeLayer('body', gradient(), body.polygons);
  assert.ok(fillGood.ok && fillGood.outside === 0, `对的画法：${fillGood.detail}`);
  for (const alpha of [0.8, 1]) {
    const image = gradient();
    image.pixels[fillAt * 4 + 3] = Math.round(alpha * 255);
    const verdict = R.judgeLayer('body', image, body.polygons);
    assert.ok(statsWithin(verdict), `只有一个像素不对：${verdict.detail}`);
    assert.ok(!verdict.ok && verdict.outside === 1, `渐变层：一个内部像素 alpha ${alpha}（范围 0.93…0.97）：${verdict.detail}`);
  }
  // 小到没有内部像素：其余几项（质量、位置、多余像素）都是对的，只有“没有像素可核对”拦住它
  const tiny = [square(40, 40, 41.2, 41.2)], small = R.judgeLayer('shine', layerImage(tiny, WHITE, flat), tiny);
  assert.equal(small.pixels, 0);
  assert.ok(statsWithin(small) && small.outside === 0, `其余几项是对的：${small.detail}`);
  assert.ok(!small.ok && /没有内部像素可核对/.test(small.detail), `没有内部像素：不通过并说明：${small.detail}`);
});

test('glintEstimate：圆里完全覆盖的像素不足 8 个时不估计，哪怕期望的高光有面积（不是凑巧没有高光）', () => {
  const disc = R.ellipsePolygon([85, 45], 0.9, 0.9), glint = R.ellipsePolygon([85.1, 45.2], 0.4, 0.4);       // 圆心在像素角上：完全覆盖的像素是 4 个（半径 0.7–1.0 pt 都是 4 个）
  const interior = R.coverage([disc]).reduce((n, v) => n + (v >= 0.99 ? 1 : 0), 0);
  assert.ok(interior >= 1 && interior < 8, `圆里完全覆盖的像素 ${interior} 个（要在 1–7）`);
  assert.ok(R.coverage([glint]).some(v => v > 0), '期望的高光有面积');
  assert.equal(R.glintEstimate(blank(), disc, glint), null);
  const eight = R.ellipsePolygon([85, 45], 1.9, 1.9), many = R.coverage([eight]).reduce((n, v) => n + (v >= 0.99 ? 1 : 0), 0);
  assert.ok(many >= 8, `放大一点就够 8 个（${many}）：判据是个数，不是圆的大小`);
  assert.notEqual(R.glintEstimate(blank(), eight, R.ellipsePolygon([85.1, 45.2], 0.6, 0.6)), null, '够 8 个像素就估计');
});

test('judgeEyeImage：颜色单独被核对——睡着的弧、转身途中的圆画成不够深的颜色（形状与透明度都对，高光仍比圆亮）也不通过', () => {
  const MID = [0.55, 0.58, 0.62];                                        // 亮度约 0.58：不够深（要 < 0.45），但白高光仍比它亮 0.4 以上
  assert.ok(Math.abs(MID[0] * 0.2126 + MID[1] * 0.7152 + MID[2] * 0.0722 - 0.58) < 0.02);
  for (const variant of ['asleep', 'half', 'blink']) {
    const pose = R.FACE_VARIANTS[variant], geometry = R.poseGeometry('hammer', pose), shapes = R.eyeShapes(geometry, pose);
    const good = R.judgeEyeImage(drawEyes(shapes), geometry, pose);
    assert.ok(good.ok, `${variant}：深色的画法通过：${good.detail}`);
    const mid = R.judgeEyeImage(drawEyes(shapes, { ink: MID }), geometry, pose);
    assert.ok(Math.abs(mid.ratio - 1) <= R.LIMITS.faceRatio && mid.shift <= R.LIMITS.faceShift && mid.stray === 0, `${variant}：形状与透明度没问题：${mid.detail}`);
    assert.ok(!mid.ok, `${variant}：颜色不够深：${mid.detail}`);
  }
});

test('judgeEyeImage：转身途中与眨眼时不估计高光面积，但高光“有没有、比圆亮多少”仍由对比度核对——没有高光、高光不比圆亮都不通过', () => {
  for (const variant of ['half', 'blink']) {
    const pose = R.FACE_VARIANTS[variant], geometry = R.poseGeometry('hammer', pose), shapes = R.eyeShapes(geometry, pose);
    const none = R.judgeEyeImage(drawEyes(shapes, { withGlint: false }), geometry, pose);
    assert.ok(Math.abs(none.ratio - 1) <= R.LIMITS.faceRatio && none.shift <= R.LIMITS.faceShift && none.stray === 0, `${variant}：高光很小，质量与位置拦不住它：${none.detail}`);
    assert.ok(!none.ok && /高光比圆亮 -?0\.0/.test(none.detail), `${variant}：没有高光：${none.detail}`);
    const good = R.judgeEyeImage(drawEyes(shapes), geometry, pose);
    assert.ok(good.ok, `${variant}：对的画法通过：${good.detail}`);
  }
});

test('judgeEyeImage：高光只取到 1 个像素时不判对比度（单个像素的亮度取决于亚像素位置，不是证据），取到 2 个及以上仍判', () => {
  const glintPixels = (species, pose) => {
    const geometry = R.poseGeometry(species, pose);
    return R.eyeShapes(geometry, pose).reduce((sum, shape) => sum + R.coverage([shape.glint]).filter(c => c >= 0.5).length, 0);
  };
  // 前提取自真实形状数据：几乎正对的蝠鲼（眼睛变窄到下限）高光只落在 1 个像素里（真实渲染里对比度 0.262，离阈值 0.25 只差 0.012）；眨眼的小锤头鲨是 2 个
  const narrow = R.FACE_VARIANTS.turned, blink = R.FACE_VARIANTS.blink;
  assert.equal(glintPixels('manta', narrow), 1, '前提：形状数据变了就要重新看这条（高光不再只落在 1 个像素里）');
  assert.equal(glintPixels('hammer', blink), 2, '前提：同上');
  const judge = (species, pose, options) => { const geometry = R.poseGeometry(species, pose); return R.judgeEyeImage(drawEyes(R.eyeShapes(geometry, pose), options), geometry, pose); };
  const single = judge('manta', narrow, { withGlint: false });
  assert.ok(single.ok && /只取到 1 个像素，少于 2 个，不判/.test(single.detail), `1 个像素：对比度不判（没有高光也不因此失败）：${single.detail}`);
  assert.ok(judge('manta', narrow).ok, '1 个像素：对的画法照常通过');
  const pair = judge('hammer', blink, { withGlint: false });
  assert.ok(!pair.ok && /高光比圆亮 -?0\.0.*2 个像素，应 ≥ 0\.25/.test(pair.detail), `2 个像素：没有高光仍被拦住：${pair.detail}`);
  // 其余的检查不受影响：1 个像素时圆的大小与颜色照样被核对
  const geometry = R.poseGeometry('manta', narrow), shapes = R.eyeShapes(geometry, narrow);
  assert.ok(!R.judgeEyeImage(drawEyes(shapes, { withGlint: false, disc: s => scaleAbout(s.disc, 0.8) }), geometry, narrow).ok, '1 个像素：圆小 20% 仍被拦住');
  assert.ok(!R.judgeEyeImage(drawEyes(shapes, { withGlint: false, ink: [0.8, 0.85, 0.95] }), geometry, narrow).ok, '1 个像素：圆是浅色仍被拦住');
});

test('judgeBlushImage：色相是粉的但几乎没有颜色（色度远低于 0.2）不算粉色', () => {
  const species = WHALE, pose = R.FACE_VARIANTS.rest, geometry = R.poseGeometry(species, pose);
  const draw = rgb => { const image = blank(); for (const spot of geometry.blush) composeOver(image, R.coverage([R.ellipsePolygon(spot.center, spot.rx, spot.ry)]), rgb, R.PAINT_SPEC.blushAlpha); return image; };
  assert.ok(R.judgeBlushImage(draw(PINK), geometry, pose).ok, '粉色通过');
  const pale = R.judgeBlushImage(draw([0.56, 0.5, 0.5]), geometry, pose);
  assert.ok(Math.abs(pale.ratio - 1) <= R.LIMITS.faceRatio && pale.shift <= R.LIMITS.faceShift && pale.stray === 0, `形状与透明度没问题：${pale.detail}`);
  assert.ok(!pale.ok, `色度 0.06：${pale.detail}`);
});

test('FACE_VARIANTS 与 FACE_KINDS：脸的姿态表逐项钉住（检查与渲染用同一张表，表自己被改坏时两边一起改、谁也发现不了）', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(R.FACE_VARIANTS)), {
    rest: {}, all: { facing: -1, pitch: 0.35, wave: -1 }, half: { facing: 0.5 }, blink: { blink: 0.6 }, alert: { alert: true },
    gaze: { gaze: [1, -0.5] }, asleep: { asleep: true }, grabbed: { asleep: true, grabbed: true }, asleepHalf: { asleep: true, facing: 0.5 },
    asleepAlert: { asleep: true, alert: true }, turned: { facing: 0.2 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(R.FACE_KINDS)), {
    eyes: ['rest', 'all', 'half', 'blink', 'alert', 'gaze', 'asleep', 'grabbed', 'asleepHalf', 'asleepAlert', 'turned'], blush: ['rest', 'all', 'half'], mouth: ['rest', 'all', 'asleep', 'grabbed'],
  });
  for (const kind of Object.values(R.FACE_KINDS)) for (const variant of kind) assert.ok(variant in R.FACE_VARIANTS, `${variant} 在姿态表里`);
  assert.ok(Object.isFrozen(R.FACE_VARIANTS) && Object.isFrozen(R.FACE_VARIANTS.grabbed) && Object.isFrozen(R.FACE_VARIANTS.gaze.gaze));
  assert.throws(() => R.elementCases('nope'), /没有 nope 的形状数据/, '没有形状数据的动物：给出名字，而不是一个 TypeError');
});

test('源码钉子（绘制层）：渲染检查看不到的取值——眼睛随朝向变窄、随眨眼变扁的下限，渐变与七彩躯干的白色叠层——源码里的数字与 PAINT_SPEC 一致，两处叠层同时在', () => {
  // 下限只在极端姿态才起作用：闭眼的眼睛只剩约 1.2 个像素高的细条（抗锯齿与预测相差 ±7%），逐像素判据不可靠，所以只钉源码。
  // 叠层强度渲染里也没有判据（颜色只做结构性核对），而且渐变与七彩各有一处同样的叠层：只改一处时源码里仍能找到另一处，所以要数个数。
  const painter = readFileSync(new URL('../desktop-reminder/jelly-species-painter.swift', import.meta.url), 'utf8'), spec = R.PAINT_SPEC.eye;
  assert.ok(painter.includes(`let narrow = max(${spec.narrowMin}, abs(p.facing))`), `朝向变窄的下限 ${spec.narrowMin}（PAINT_SPEC.eye.narrowMin）`);
  assert.ok(painter.includes(`let open = max(${spec.openMin}, 1 - p.blink)`), `眨眼变扁的下限 ${spec.openMin}（PAINT_SPEC.eye.openMin）`);
  const overlay = 'gradient([NSColor.white.withAlphaComponent(0), NSColor.white.withAlphaComponent(0.32)], [0, 1])?';
  assert.equal(painter.split(overlay).length - 1, 2, '渐变与七彩两处都叠同一层白色亮度（α 0 → 0.32，由下到上）：改了一处、另一处没改，渲染检查与另一个源码绊线都看不出来');
});

test('judgeSleepMark：“z” 的六个条件各自独立——像素够多、在中心朝向头的一侧、高于中心、在头端锚点的外侧（向前、向上）、离锚点不超过上限；朝左是镜像', () => {
  const base = { count: 40, x: 125, y: 90 }, setup = { centre: [100, 60], anchor: [120, 80], facing: 1, limit: 22 };
  const judge = (z, over = {}) => R.judgeSleepMark({ ...base, ...z }, { ...setup, ...over });
  const good = judge({});
  assert.ok(good.ok && Math.abs(good.reach - Math.hypot(5, 10)) < 1e-9, `对的：${good.detail}`);
  assert.ok(/40 个像素，质心 \(125\.0, 90\.0\)，头端锚点 \(120\.0, 80\.0\)，相距 11\.2 pt（≤ 22），动物中心 \(100, 60\.0\)，头在右/.test(good.detail), good.detail);
  // 每一行只做错一个条件（其余五个仍满足）
  const rows = [
    ['像素不够（25 个）', judge({ count: 25 })], ['像素刚好够（26 个）', judge({ count: 26 }), true],
    ['质心在中心的另一侧（中心右移到 126）', judge({}, { centre: [126, 60] })],
    ['质心没有高于中心（中心上移到 95）', judge({}, { centre: [100, 95] })],
    ['质心没有在锚点的外侧（向前）：x 118', judge({ x: 118 })],
    ['质心没有在锚点的外侧（向上）：y 78', judge({ y: 78 })],
    ['离锚点太远（25 > 22）', judge({ x: 140, y: 95 })],
    ['离锚点在上限里（21.9）', judge({ x: 120 + 21.9 * Math.cos(0.9), y: 80 + 21.9 * Math.sin(0.9) }), true],
    ['上限放宽后离得远也行', judge({ x: 140, y: 95 }, { limit: 30 }), true],
  ];
  for (const [label, verdict, expected = false] of rows) assert.equal(verdict.ok, expected, `${label}：${verdict.detail}`);
  // 朝左：整个几何左右镜像（中心 100、锚点 80、z 在 75）
  const mirror = { centre: [100, 60], anchor: [80, 80], facing: -1 };
  assert.ok(R.judgeSleepMark({ count: 40, x: 75, y: 90 }, mirror).ok, '朝左的对的画法');
  assert.ok(!R.judgeSleepMark({ count: 40, x: 125, y: 90 }, { ...mirror, anchor: [120, 80] }).ok, '朝左却飘到右边去');
  assert.ok(!R.judgeSleepMark({ count: 40, x: 82, y: 90 }, mirror).ok, '朝左：x 82 在锚点（80）的里侧');
  assert.ok(/头在左/.test(R.judgeSleepMark({ count: 40, x: 75, y: 90 }, mirror).detail));
  // 一个 “z” 都没有：质心是 NaN，不通过也不抛错
  const none = R.judgeSleepMark({ count: 0, x: NaN, y: NaN }, setup);
  assert.ok(!none.ok && /0 个像素/.test(none.detail), none.detail);
  assert.equal(R.judgeSleepMark(base, { centre: setup.centre, anchor: setup.anchor, facing: 1 }).ok, true, '不给上限时用 LIMITS.zReach');
  assert.equal(R.judgeSleepMark({ ...base, x: 120 + R.LIMITS.zReach + 1, y: 85 }, { centre: setup.centre, anchor: setup.anchor, facing: 1 }).ok, false, '23 pt 以外：超过 LIMITS.zReach（22）');
});

test('expectedShow：没写的项是“画”、parts 排序、没写 parts 是 null；elementCases：名字合规且唯一、都是直接画、每个部件与每个脸的元素都有，嘴只有侧视动物有', () => {
  assert.deepEqual(R.expectedShow(undefined), { blush: true, eyes: true, mouth: true, parts: null, strokes: true });
  assert.deepEqual(R.expectedShow({ parts: [3, 1], strokes: false, eyes: false }), { blush: true, eyes: false, mouth: true, parts: [1, 3], strokes: false });
  assert.deepEqual(R.expectedShow({ parts: [] }).parts, [], '空数组是“一个部件也不画”，不是“全画”');
  assert.deepEqual(Object.keys(R.expectedShow({})), ['blush', 'eyes', 'mouth', 'parts', 'strokes'], '键按字母序，与渲染工具的回报逐字一致');
  for (const species of ['hammer', 'manta', WHALE]) {
    const parts = Shapes.native(species).parts, cases = R.elementCases(species), names = cases.map(c => c.name);
    assert.equal(new Set(names).size, names.length, `${species}：名字唯一`);
    assert.ok(names.every(name => /^[A-Za-z0-9._-]{1,80}$/.test(name)) && cases.every(c => c.direct === true && c.species === species));
    const hasMouth = Boolean(Shapes.native(species).mouth), stroked = parts.filter(part => part.role === 'body' || part.role === 'limb').length;
    assert.equal(cases.length, 2 + parts.length * 2 + stroked + 11 + 3 + (hasMouth ? 4 : 0), `${species}：整只 2 + 每个部件（单独、朝左抬头）+ 有描边的部件多一张只填充的 + 眼 11 + 腮红 3${hasMouth ? ' + 嘴 4' : ''}`);
    parts.forEach((part, index) => {
      const solo = cases.find(c => c.name === R.soloName(species, `p${index}`));
      assert.deepEqual(solo.show.parts, [index]); assert.ok(solo.show.eyes === false && solo.show.blush === false && solo.show.mouth === false, '部件单独的图不画脸');
      assert.equal(Boolean(cases.find(c => c.name === R.soloName(species, `p${index}-fill`))), part.role === 'body' || part.role === 'limb');
      assert.equal(cases.find(c => c.name === R.soloName(species, `p${index}-fill`))?.show.strokes ?? false, false, '只填充的图关掉描边');
    });
    const faces = cases.filter(c => /-solo-(eyes|blush|mouth)-/.test(c.name));
    assert.ok(faces.every(c => Array.isArray(c.show.parts) && c.show.parts.length === 0), '脸的单独图不画任何部件');
    assert.equal(faces.filter(c => c.name.includes('-solo-mouth-')).length, hasMouth ? 4 : 0);
    assert.ok(cases.some(c => c.name === R.soloName(species, 'eyes-grabbed') && c.asleep === true && c.grabbed === true), '睡着又被抓住的眼睛');
    assert.ok(cases.find(c => c.name === `${species}-direct`).look === 'solid' && cases.find(c => c.name === `${species}-direct-all`).look === 'blend');
  }
});

test('接线（元素与叠层）：每个判定函数的结果真的进入对应的那几行（注入判定函数，各翻一项，其余保持通过）；checkSpecies 把判定函数表原样交给它', () => {
  const palette = Array.from({ length: 8 }, (_, i) => [0.2 + i * 0.1, 0.5, 0.5]);
  const pass = () => ({ ok: true, detail: '好' }), fail = () => ({ ok: false, detail: '坏' });
  const ALL = { judgeLayer: pass, judgeFillEnds: pass, judgeStroke: pass, judgeEyeImage: pass, judgeBlushImage: pass, judgeMouthImage: pass, judgeComposite: pass };
  const run = (species, images, judges) => {
    const lines = [], add = (group, name, ok, detail) => lines.push({ group, name, ok: Boolean(ok), detail });
    R.checkElements(species, name => { if (!images[name]) throw new Error(`缺少 ${name}`); return images[name]; }, palette, add, judges);
    return lines;
  };
  for (const species of ['hammer', 'manta', WHALE]) {
    const images = {};
    for (const item of R.buildCases(species)) images[item.name] = blank();
    const parts = Shapes.native(species).parts, stroked = parts.filter(part => part.role === 'body' || part.role === 'limb').length, hasMouth = Boolean(Shapes.native(species).mouth);
    const base = run(species, images, ALL);
    assert.deepEqual(Object.fromEntries(Object.entries(R.CHECK_MANIFEST[species]).filter(([group]) => group === '元素' || group === '叠层')), { 元素: base.filter(line => line.group === '元素').length, 叠层: base.filter(line => line.group === '叠层').length }, `${species}：条数与清单一致`);
    assert.ok(base.every(line => line.ok), `${species}：全部判定注入“通过”时各行都通过（叠层的最后一行是“直接画 = 经产品视图画”，两张空白图逐像素相同）`);
    // 脸的条数取姿态表的长度（表本身由“FACE_VARIANTS 与 FACE_KINDS”那个测试逐项钉住）
    const expected = { judgeLayer: parts.length * 2, judgeFillEnds: 2, judgeStroke: stroked, judgeEyeImage: R.FACE_KINDS.eyes.length, judgeBlushImage: R.FACE_KINDS.blush.length, judgeMouthImage: hasMouth ? R.FACE_KINDS.mouth.length : 0, judgeComposite: 2 };
    for (const [name, count] of Object.entries(expected)) {
      const broken = run(species, images, { ...ALL, [name]: fail }).filter(line => !line.ok);
      assert.equal(broken.length, count, `${species}：只翻 ${name}，应有 ${count} 行失败，实际 ${broken.length}`);
      assert.ok(broken.every(line => line.detail === '坏'), `${name}：失败行带着判定函数给的说明`);
    }
    const sameLine = run(species, { ...images, [`${species}-direct`]: fromField(R.coverage([square(10, 10, 30, 30)])) }, ALL).filter(line => !line.ok);
    assert.deepEqual(sameLine.map(line => line.name), ['直接画（SpeciesPainter.draw）与产品视图（JellyView）画的整只图逐像素相同'], '直接画与经 JellyView 画的整只图不同：只有这一行失败');
    assert.throws(() => run(species, { ...images, [R.soloName(species, 'p0')]: undefined }, ALL), /缺少/, '缺少渲染结果直接报错，不能悄悄少一条');
  }
  // checkSpecies 把 judges 原样交给 checkElements：翻一个判定函数，元素组恰好多出相应数量的失败行
  const images = {};
  for (const item of R.buildCases(WHALE)) images[item.name] = blank();
  const flip = judges => R.checkSpecies(WHALE, images, palette, judges).filter(line => (line.group === '元素' || line.group === '叠层') && !line.ok);
  assert.equal(flip({ ...ALL, judgeLayer: fail }).length, Shapes.native(WHALE).parts.length * 2);
  assert.equal(flip(ALL).length, 0);
});
