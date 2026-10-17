// desktop-reminder/species-render.mjs 的分析函数：用合成图像核对“检查本身”是否可靠（能放过对的、拦住错的）。
// 渲染工具本身需要 swiftc 与 AppKit，属于隔离验收（node desktop-reminder/species-render.mjs），不在这里编译。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
