// desktop-reminder/marine-align.mjs 的判定逻辑自测：放置矩阵按规格、图像比较的统计量、对照检查确实有分辨力。
// 不编译 Swift、不启动 Chromium（那是 marine-align.mjs 命令行本身做的事，数字见 docs/technical/marine-realism-20261019.md）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { placementMatrix, compareImages, checkSpecies, buildCases, LIMITS, BODY_LENGTH, TOP_ABOVE_BOTTOM } from '../desktop-reminder/marine-align.mjs';

const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const BOUNDS = { minX: -50, maxX: 50, minY: -10, maxY: 10 };

test('放置矩阵：并集中心在窗口水平中点、顶端离窗口底边 91 pt（画布 y 向下，顶端在 150 − 91 处）', () => {
  const m = placementMatrix('hammer', { bounds: BOUNDS });
  const unit = BODY_LENGTH.hammer / 100;
  assert.ok(near(m[0], unit) && near(m[1], 0) && near(m[2], 0) && near(m[3], unit), `朝右、不俯仰时只有缩放：${m.slice(0, 4)}`);
  const [cx, cy] = apply(m, 0, 0);
  assert.ok(near(cx, 85), `水平中心 ${cx}`); assert.ok(near(cy, 150 - TOP_ABOVE_BOTTOM + unit * 10), `垂直中心 ${cy}`);
  const [, top] = apply(m, 0, -10);        // 骨架 y 向下：负的 y 是上方
  assert.ok(near(top, 150 - TOP_ABOVE_BOTTOM), `并集顶端应在画布 y=${150 - TOP_ABOVE_BOTTOM}，实际 ${top}`);
  const [snoutX] = apply(m, 50, 0), [tailX] = apply(m, -50, 0);
  assert.ok(near(snoutX, 85 + unit * 50) && near(tailX, 85 - unit * 50), '吻端在右、尾在左');
});

test('放置矩阵：朝左水平镜像（关于窗口中线）；俯仰为正时鼻子朝上（画布 y 变小），先转后翻所以朝左时抬头方向一致', () => {
  const right = placementMatrix('manta', { bounds: BOUNDS }), left = placementMatrix('manta', { facing: -1, bounds: BOUNDS });
  const [rx, ry] = apply(right, 50, 3), [lx, ly] = apply(left, 50, 3);
  assert.ok(near(rx - 85, 85 - lx) && near(ry, ly), '朝左 = 关于 x=85 的镜像，高度不变');
  const up = placementMatrix('manta', { pitch: 0.3, bounds: BOUNDS }), upLeft = placementMatrix('manta', { pitch: 0.3, facing: -1, bounds: BOUNDS });
  const [, flatY] = apply(right, 50, 0), [, upY] = apply(up, 50, 0), [, upLeftY] = apply(upLeft, 50, 0);
  assert.ok(upY < flatY - 5, `抬头：吻端应更靠上（画布 y 更小）：平 ${flatY} 抬 ${upY}`);
  assert.ok(near(upY, upLeftY), '朝左抬头，吻端同样上升');
  const unit = BODY_LENGTH.manta / 100, c = Math.cos(0.3), s = Math.sin(0.3);
  assert.ok(near(upY, 150 - (91 - unit * 10 + s * unit * 50)), `吻端高度按旋转公式：${upY}`);
  assert.ok(near(c * c + s * s, 1));
});

test('放置矩阵：并集中心总在窗口 (85, 150 − 91 + 半高)，与俯仰和朝向无关（绕并集中心旋转）', () => {
  for (const facing of [1, -1]) for (const pitch of [0, 0.3, -0.35]) {
    const m = placementMatrix('whaleshark', { facing, pitch, bounds: { minX: -60, maxX: 55, minY: -14, maxY: 22 } });
    const unit = BODY_LENGTH.whaleshark / 100;
    const [x, y] = apply(m, (-60 + 55) / 2, (-14 + 22) / 2);
    assert.ok(near(x, 85) && near(y, 150 - 91 + unit * 36 / 2), `facing=${facing} pitch=${pitch}：并集中心在 (${x}, ${y})`);
  }
});

test('放置矩阵：四种动物的体长与规格表一致', () => {
  assert.deepEqual(BODY_LENGTH, { hammer: 70, manta: 74, turtle: 64, whaleshark: 84 });
});

// ---- 图像比较 ----
const image = (w, h, paint) => { const pixels = new Uint8Array(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = paint(x, y); if (c) pixels.set(c, (y * w + x) * 4); } return { width: w, height: h, pixels }; };
const square = (x0, y0, size, color = [20, 120, 200, 255]) => (x, y) => (x >= x0 && x < x0 + size && y >= y0 && y < y0 + size ? color : null);

test('compareImages：相同的图交并比 1、差 0；平移 1 像素交并比下降；换颜色出现明显差异；全透明的两张图交并比 1', () => {
  const a = image(40, 40, square(10, 10, 12));
  const same = compareImages(a, image(40, 40, square(10, 10, 12)));
  assert.equal(same.iou, 1); assert.equal(same.meanDiff, 0); assert.equal(same.strongShare, 0); assert.equal(same.maxDiff, 0);
  const shifted = compareImages(a, image(40, 40, square(11, 10, 12)));
  assert.ok(shifted.iou < 0.9 && shifted.iou > 0.8, `平移 1 像素 ${shifted.iou}`);
  assert.ok(shifted.strongShare > 0.1, '边缘的两列像素明显不同');
  const recolored = compareImages(a, image(40, 40, square(10, 10, 12, [220, 40, 40, 255])));
  assert.equal(recolored.iou, 1); assert.ok(recolored.meanDiff > 50 && recolored.strongShare === 1, `换色 ${JSON.stringify(recolored)}`);
  const empty = compareImages(image(8, 8, () => null), image(8, 8, () => null));
  assert.equal(empty.iou, 1); assert.equal(empty.union, 0); assert.equal(empty.meanDiff, 0);
  assert.throws(() => compareImages(image(8, 8, () => null), image(9, 8, () => null)), /尺寸不同/);
});

test('compareImages：半透明像素按“叠在白底上”比较，直通 alpha 里颜色值不同但完全透明的像素不算差异', () => {
  const a = image(10, 10, () => [0, 0, 0, 0]), b = image(10, 10, () => [255, 0, 0, 0]);
  const r = compareImages(a, b);
  assert.equal(r.union, 0); assert.equal(r.meanDiff, 0);
  const half = compareImages(image(10, 10, () => [0, 0, 0, 128]), image(10, 10, () => [0, 0, 0, 128]));
  assert.equal(half.meanDiff, 0); assert.equal(half.iou, 1);
  const alphaDiff = compareImages(image(10, 10, () => [0, 0, 0, 255]), image(10, 10, () => [0, 0, 0, 128]));
  assert.ok(alphaDiff.meanDiff > 100, `黑色 α255 对 α128 叠白底差很大：${alphaDiff.meanDiff}`);
});

// ---- 检查函数：用合成数据证明对齐判定与对照判定都有分辨力 ----
// 每个用例一张互不相同的图（竖条的位置由用例名决定），canvas 一侧复制 native 一侧：应全部通过。
const hash = text => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const caseImage = (name, w = 60, h = 40) => image(w, h, (x, y) => { const k = hash(name) % 40; return x >= 5 + k && x < 12 + k && y >= 5 && y < 30 ? [10 + (hash(name) % 200), 100, 160, 255] : null; });
const fixture = species => Object.fromEntries(buildCases(species).map(item => [item.name, caseImage(item.name)]));
const clone = images => Object.fromEntries(Object.entries(images).map(([name, img]) => [name, { ...img, pixels: new Uint8Array(img.pixels) }]));

test('checkSpecies：两边完全相同 → 对齐与对照全部通过；用例表覆盖朝左、俯仰与阶段色混入', () => {
  const native = fixture('manta'), canvas = clone(native);
  const report = checkSpecies('manta', native, canvas);
  assert.equal(report.failed, 0, JSON.stringify(report.rows.filter(row => row.failures.length)));
  assert.equal(report.rows.filter(row => row.kind === '对齐').length, buildCases('manta').length);
  const tags = buildCases('manta').map(item => item.name.replace('manta-', ''));
  for (const tag of ['rest', 'phase0', 'left', 'pitchUp', 'stage', 'stageHalf']) assert.ok(tags.includes(tag), tag);
  assert.ok(buildCases('manta').some(item => item.facing === -1) && buildCases('manta').some(item => item.pitch) && buildCases('manta').some(item => item.stageMix > 0));
  assert.ok(buildCases('manta').every(item => item.realistic === true && item.colors.length === 1));
});

test('checkSpecies：某个用例两边不一致（画笔画错了）→ 该用例失败并指出是哪一项', () => {
  const native = fixture('turtle'), canvas = clone(native);
  canvas['turtle-phase2'] = { ...canvas['turtle-phase2'], pixels: caseImage('别的东西').pixels };
  const report = checkSpecies('turtle', native, canvas);
  assert.ok(report.failed >= 1);
  const bad = report.rows.filter(row => row.kind === '对齐' && row.failures.length);
  assert.deepEqual(bad.map(row => row.name), ['turtle-phase2']);
  assert.match(bad[0].failures.join(), /交并比|平均差|明显不同/);
});

test('checkSpecies：颜色画错但轮廓一致（如渐变画反、阶段色没混入）→ 靠平均差与明显差异判出', () => {
  const native = fixture('hammer'), canvas = clone(native);
  const img = canvas['hammer-stage'];
  for (let i = 0; i < img.pixels.length; i += 4) if (img.pixels[i + 3]) { img.pixels[i] = 255 - img.pixels[i]; img.pixels[i + 1] = 255 - img.pixels[i + 1]; }
  const report = checkSpecies('hammer', native, canvas);
  const bad = report.rows.filter(row => row.kind === '对齐' && row.failures.length);
  assert.deepEqual(bad.map(row => row.name), ['hammer-stage']);
  assert.ok(bad[0].stats.iou === 1, '轮廓一致');
  assert.match(bad[0].failures.join(), /平均差|明显不同/);
});

test('checkSpecies：所有用例的图都一样（检查分辨不出姿态）→ 对照项失败，不会因为“两边一样”就通过', () => {
  const same = image(60, 40, square(10, 10, 20));
  const flat = Object.fromEntries(buildCases('whaleshark').map(item => [item.name, { ...same, pixels: new Uint8Array(same.pixels) }]));
  const report = checkSpecies('whaleshark', flat, clone(flat));
  const controls = report.rows.filter(row => row.kind === '对照');
  assert.ok(controls.length >= 5 && controls.every(row => row.failures.length === 1), '每个对照都应失败：' + JSON.stringify(controls.map(row => row.failures)));
  assert.match(controls.at(-1).failures[0], /阶段色混入/);
  assert.equal(report.rows.filter(row => row.kind === '对齐').every(row => row.failures.length === 0), true, '两边一样时对齐项本身是通过的');
});

test('阈值：判据有量级，不是无限宽松（交并比下限 > 0.95、平均差上限 < 5、明显差异占比 < 1%）', () => {
  assert.ok(LIMITS.minIou > 0.95 && LIMITS.minIou < 1);
  assert.ok(LIMITS.meanDiff > 0 && LIMITS.meanDiff < 5);
  assert.ok(LIMITS.strongShare > 0 && LIMITS.strongShare < 0.01);
  assert.ok(LIMITS.controlGap > 0 && LIMITS.controlGap < 0.1);
});
