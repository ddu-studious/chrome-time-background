// 花纹“画对了没有”的检查（desktop-reminder/appearance-looks.mjs）：用合成的“水母”图像覆盖分区几何、各区域取色、
// 每条判定规则的“画对”与“故意画错”两面，以及命令行。真实截图由 appearance-snapshot.mjs --all-looks 产生，不在单元测试里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { splitBody, medianColor, regionsOf, evaluateLooks, LOOK_SPECS, REFERENCE_SLOTS, LIMITS } from '../desktop-reminder/appearance-looks.mjs';
import { deltaE, toLab } from '../desktop-reminder/appearance-contrast.mjs';
import { encodePng } from './fixtures/png-encode.mjs';

const SCRIPT = resolve(import.meta.dirname, '../desktop-reminder/appearance-looks.mjs');
// 真实构建里三个参考色位（冰蓝 5、红 0、绿 3）的纯色身体中位色（白底）
const A = [191, 224, 242], B = [246, 194, 188], C = [195, 231, 197];
const REFS = { 5: A, 0: B, 3: C };
const mix = (p, q, t) => p.map((v, i) => Math.round(v + (q[i] - v) * t));
const dark = color => color.map(value => Math.round(value * 0.8));          // 描边比同色位的填充深一档
const OUTLINE_REFS = { 5: dark(A), 0: dark(B), 3: dark(C) };

// 合成水母：钟罩 = 行 20–59、列 20–99（宽 80），触须 = 行 60–89 的五根 4 像素宽竖线（行宽 20 < 钟罩的 40%），其余全透明。
// 钟罩最外一圈（左列、右列、顶行）是描边：默认画 a 的描边（纯色/双色/渐变的正确答案），七彩的正确答案是 b 的描边；outline 传 null 表示没有单独的描边。
const W = 120, H = 100, TENTACLE_X = [28, 44, 60, 76, 92];
function synth({ bell, tentacle, outline = dark(A), alpha = 255, extra = null }) {
  const pixels = Buffer.alloc(W * H * 4);
  const put = (x, y, [r, g, b], a = alpha) => { const i = (y * W + x) * 4; pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a; };
  for (let y = 20; y <= 59; y++) for (let x = 20; x <= 99; x++) put(x, y, outline && (x === 20 || x === 99 || y === 20) ? outline : bell(x, y));
  if (tentacle) for (let y = 60; y <= 89; y++) for (const x0 of TENTACLE_X) for (let k = 0; k < 4; k++) put(x0 + k, y, tentacle(x0 + k, y));
  extra?.(put);
  return { width: W, height: H, pixels };
}
const u = x => (x - 20) / 79;                                   // 横向 0…1
const v = y => (y - 20) / 39;                                   // 钟罩纵向 0（顶）…1（下缘）
const rainbowAt = (x, [p, q, r]) => (u(x) < 0.5 ? mix(p, q, u(x) * 2) : mix(q, r, (u(x) - 0.5) * 2));
const lit = (color, y) => mix(color, [255, 255, 255], 0.3 * (1 - v(y)));   // 七彩的自上而下亮度层：顶部更白
// 七彩的正确画法：横向 a→b→c、顶部更亮、描边是 b、触须沿钟罩铺开
const rainbowImage = ({ bell = (x, y) => lit(rainbowAt(x, [A, B, C]), y), tentacle = x => rainbowAt(x, [A, B, C]), outline = dark(B), extra } = {}) => synth({ bell, tentacle, outline, extra });

const GOOD = {
  solid: () => synth({ bell: () => A, tentacle: () => A }),
  duo: () => synth({ bell: () => A, tentacle: () => B }),
  blend: () => synth({ bell: (x, y) => mix(B, A, v(y)), tentacle: () => mix(A, B, 0.7) }),
  rainbow: () => rainbowImage(),
};
const goodLooks = () => Object.fromEntries(Object.entries(GOOD).map(([look, make]) => [look, make()]));
const withLook = (look, image) => ({ ...goodLooks(), [look]: image });
const failuresOf = (looks, limits) => evaluateLooks({ refs: REFS, outlineRefs: OUTLINE_REFS, looks }, limits);

test('常量：四种花纹用的色位、参考色位、阈值', () => {
  assert.deepEqual(LOOK_SPECS, { solid: [5], duo: [5, 0], blend: [5, 0], rainbow: [5, 0, 3] });
  assert.deepEqual([...REFERENCE_SLOTS], [0, 3, 5]);
  assert.deepEqual({ ...LIMITS }, { exact: 8, tentacleExact: 10, outlineExact: 4, lightGapMin: 1.5 });
  assert.ok(Object.isFrozen(LOOK_SPECS) && Object.isFrozen(LIMITS) && Object.isFrozen(REFERENCE_SLOTS));
  assert.ok(deltaE(A, B) > 25 && deltaE(A, C) > 25 && deltaE(B, C) > 25, '三个参考色两两应相差足够大，否则归类没有区分度');
  const [OA, OB, OC] = [OUTLINE_REFS[5], OUTLINE_REFS[0], OUTLINE_REFS[3]];
  assert.ok(deltaE(OA, OB) > 20 && deltaE(OA, OC) > 20 && deltaE(OB, OC) > 20, '三个参考描边色也要两两分得开');
});

test('splitBody：按行宽把钟罩与触须分开，给出行列范围', () => {
  const body = splitBody(GOOD.duo());
  assert.equal(body.top, 20); assert.equal(body.bellBottom, 59); assert.equal(body.bottom, 89);
  assert.equal(body.left, 20); assert.equal(body.right, 99);
  assert.equal(body.bell.length, 80 * 40);
  assert.equal(body.tentacles.length, 5 * 4 * 30);
  assert.ok(body.bell.every(p => p.y <= 59) && body.tentacles.every(p => p.y >= 60));
});

test('splitBody：描边 = 钟罩里贴着剪影边缘的像素（四邻有一个不是身体），下摆附近 4 行不取', () => {
  const body = splitBody(GOOD.duo());
  // 顶行 80 个 + 左右两列各 35 个（行 21–55）；行 56–59 属下摆附近，不取；内部像素（四邻都是身体）不算
  assert.equal(body.outline.length, 80 + 35 + 35);
  assert.ok(body.outline.every(q => q.y <= 55), '最后一个取样行是 bellBottom − 4 = 55');
  assert.equal(body.outline.filter(q => q.y === 55).length, 2);
  assert.ok(body.outline.every(q => q.y === 20 || q.x === 20 || q.x === 99), '都在矩形最外一圈');
  assert.ok(!body.outline.some(q => q.x === 30 && q.y === 30), '内部像素不算');
  assert.ok(body.outline.every(q => q.color.every((c, i) => c === dark(A)[i])), '取到的颜色就是描边色');
  assert.ok(body.outline.every(q => body.bell.includes(q)), '描边只取自钟罩');
  // 四个方向各由一个像素把关：在钟罩内部挖一个洞，洞的上下左右四个邻居就都成了边缘像素
  const holed = splitBody(synth({ bell: () => A, tentacle: () => B, extra: put => put(50, 40, [0, 0, 0], 0) }));
  assert.equal(holed.outline.length, 80 + 35 + 35 + 4);
  for (const [x, y] of [[49, 40], [51, 40], [50, 39], [50, 41]]) assert.ok(holed.outline.some(q => q.x === x && q.y === y), `(${x},${y}) 贴着洞，是边缘`);
  assert.equal(holed.bell.length, 80 * 40 - 1, '洞本身不是身体');
});

test('splitBody：只要最大的一块连通像素——游离的小块（睡觉标记）不算身体，不会撑宽包围盒', () => {
  const blob = (x0, y0, size, color) => put => { for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) put(x, y, color); };
  const plain = splitBody(GOOD.duo());
  // 右上方 6×6 的深色小块，与钟罩之间隔着 8 列空白：像 “z” 睡觉标记
  const marked = splitBody(synth({ bell: () => A, tentacle: () => B, extra: blob(108, 30, 6, [20, 30, 40]) }));
  assert.equal(marked.right, 99, '包围盒右边界仍是钟罩的 99，不是小块的 113');
  assert.equal(marked.left, plain.left);
  assert.equal(marked.bell.length, plain.bell.length);
  assert.equal(marked.tentacles.length, plain.tentacles.length);
  assert.ok(![...marked.bell, ...marked.tentacles].some(q => q.x >= 108), '小块里的像素一个都不在身体里');
  // 小块在左上、扫描顺序在钟罩之前，也不会被当成“第一块”
  const early = splitBody(synth({ bell: () => A, tentacle: () => B, extra: blob(2, 2, 4, [20, 30, 40]) }));
  assert.equal(early.left, 20);
  assert.equal(early.top, 20);
});

test('splitBody：8 连通——只在对角上相接的像素仍算身体；并列最大时取扫描顺序靠前的一块', () => {
  const diagonal = splitBody(synth({ bell: () => A, tentacle: () => B, extra: put => put(100, 60, [1, 2, 3]) }));
  assert.equal(diagonal.right, 100, '(100,60) 与钟罩右下角 (99,59) 只在对角相接，按 8 连通算身体');
  assert.equal(diagonal.tentacles.length, 5 * 4 * 30 + 1);
  const twoBlobs = width2 => {
    const pixels = Buffer.alloc(120 * 40 * 4);
    const fill = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * 120 + x) * 4; pixels[i] = 9; pixels[i + 1] = 9; pixels[i + 2] = 9; pixels[i + 3] = 255; } };
    fill(10, 10, 5, 5);            // 左边一块 25 个像素
    fill(60, 10, width2, 5);       // 右边一块
    return { width: 120, height: 40, pixels };
  };
  assert.equal(splitBody(twoBlobs(5)).left, 10, '一样大：取扫描顺序靠前（左边）的那块');
  assert.equal(splitBody(twoBlobs(6)).left, 60, '右边多一列就更大：取右边那块');
  assert.equal(splitBody(twoBlobs(4)).left, 10, '右边更小：取左边那块');
});

// 字符画：'#' 是身体像素（不透明灰），其余透明；用来把“连通块怎么找”写成一眼能看懂的形状
const art = rows => {
  const width = Math.max(...rows.map(row => row.length)), height = rows.length, pixels = Buffer.alloc(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') pixels.set([9, 9, 9, 255], (y * width + x) * 4); }));
  return { width, height, pixels };
};
const pixelCount = body => body.bell.length + body.tentacles.length;
const boxOf = body => [body.left, body.right, body.top, body.bottom];

test('splitBody 的连通块：单个像素、贴着图片边角的身体都取得到', () => {
  for (const [rows, x, y] of [[['#..', '...', '...'], 0, 0], [['...', '.#.', '...'], 1, 1], [['...', '...', '..#'], 2, 2]]) {
    const body = splitBody(art(rows));
    assert.equal(pixelCount(body), 1, rows.join('/'));
    assert.deepEqual(boxOf(body), [x, x, y, y], rows.join('/'));
  }
});

test('splitBody 的连通块：八个方向都要走得通（V、倒 V、右臂更高的 V、U、Z、斜线到左边缘）', () => {
  // 每个形状里都有一段只能靠某个方向的相邻关系才走得到的像素；少一个方向就会丢像素、包围盒变小
  const cases = {
    'V（走到右上要用 ↗）': [['#.....#', '.#...#.', '..#.#..', '...#...'], 7, [0, 6, 0, 3]],
    '倒 V（顶点只有一个像素；左臂要用 ↙）': [['...#...', '..#.#..', '.#...#.', '#.....#'], 7, [0, 6, 0, 3]],
    '右臂更高的 V（左臂要用 ↖）': [['......#', '.#...#.', '..#.#..', '...#...'], 6, [1, 6, 0, 3]],
    'U（右臂要用 ↑）': [['#...#', '#...#', '#...#', '#####'], 11, [0, 4, 0, 3]],
    'Z（末端要用 ←）': [['###', '..#', '###'], 7, [0, 2, 0, 2]],
    '斜线一路走到图片左边缘': [['...#', '..#.', '.#..', '#...'], 4, [0, 3, 0, 3]],
  };
  for (const [name, [rows, total, box]] of Object.entries(cases)) {
    const body = splitBody(art(rows));
    assert.equal(pixelCount(body), total, name);
    assert.deepEqual(boxOf(body), box, name);
  }
});

test('splitBody 的连通块：只隔一个像素的两块是两块（不会被当成一个）', () => {
  const sideBySide = splitBody(art(['##.###', '##.###']));       // 左块 2×2、右块 3×2，中间空一列：取更大的右块
  assert.equal(sideBySide.left, 3);
  assert.equal(pixelCount(sideBySide), 6);
  const stacked = splitBody(art(['##', '##', '..', '##', '##', '##']));   // 上块 2×2、下块 2×3，中间空一行
  assert.equal(stacked.top, 3);
  assert.equal(pixelCount(stacked), 6);
  // 后一块在先扫描到的那块的左边（先扫描到的是右上的 6 个像素，左下的 4 个像素隔着一列）：邻域若向左多伸一格就会被并进来
  const leftGap = splitBody(art(['...###', '##.###', '##....']));
  assert.equal(leftGap.left, 3);
  assert.equal(pixelCount(leftGap), 6);
  // 另一块在先扫描到的那块某个像素的正上方、中间隔一行（先扫描到的 U 形从左臂绕到右臂的短柱 (4,3)，(4,1) 在它上方两行）
  const upGap = splitBody(art(['#....', '#...#', '#....', '#...#', '#####']));
  assert.equal(pixelCount(upGap), 10);
  assert.equal(upGap.bell.concat(upGap.tentacles).some(q => q.x === 4 && q.y === 1), false, '(4,1) 不属于 U 形');
});

test('splitBody 的连通块：图片右边缘与下一行的左边缘不相邻（不会“绕回”）', () => {
  // (4,0) 与 (0,1) 在内存里是相邻的两个下标，但在图上隔着整整一行：各自是一块，并列取扫描顺序靠前的 (4,0)
  const body = splitBody(art(['....#', '#....', '.....']));
  assert.deepEqual(boxOf(body), [4, 4, 0, 0]);
  assert.equal(pixelCount(body), 1);
});

test('splitBody 的描边：占满整幅图的身体——图边上的像素算边缘，内部不算（也不“绕回”到下一行）', () => {
  const body = splitBody(art(Array.from({ length: 6 }, () => '######')));
  assert.equal(body.bellBottom, 5);
  // 取样行是 0–1：行 0 整行（上邻在图外）6 个 + 行 1 只有左右两端 2 个
  assert.equal(body.outline.length, 8);
  assert.deepEqual(body.outline.filter(q => q.y === 1).map(q => q.x), [0, 5]);
});

test('splitBody：钟罩行宽恰好等于最大行宽的 40% 时仍算钟罩，低一点就算触须', () => {
  // 行 0–3 宽 100（最大行宽）；行 4 是“下缘一行”：宽 40（=40%）算钟罩 → bellBottom 为 4，宽 39（<40%）算触须 → bellBottom 停在 3
  for (const [widest, width, expected] of [[100, 40, 4], [100, 39, 3], [104, 42, 4], [104, 41, 3], [3, 2, 4], [3, 1, 3], [10, 4, 4], [10, 3, 3]]) {
    const w = 120, h = 10, pixels = Buffer.alloc(w * h * 4);
    const fill = (y, count) => { for (let x = 0; x < count; x++) { const i = (y * w + x) * 4; pixels[i] = 10; pixels[i + 1] = 20; pixels[i + 2] = 30; pixels[i + 3] = 255; } };
    for (let y = 0; y < 4; y++) fill(y, widest);
    fill(4, width);
    assert.equal(splitBody({ width: w, height: h, pixels }).bellBottom, expected, `最大行宽 ${widest}，下缘行宽 ${width}`);
  }
});

test('splitBody：只取 alpha ≥ 0.45 的像素，并按 alpha 叠在底色上；全透明返回 null', () => {
  const half = synth({ bell: () => [0, 0, 0], tentacle: () => [0, 0, 0], outline: null, alpha: 115 });      // 115/255 ≈ 0.451：刚好够
  assert.ok(splitBody(half));
  assert.deepEqual(splitBody(half).bell[0].color.map(Math.round), [140, 140, 140], '黑色以 alpha 0.451 叠在白底上 ≈ 255×0.549');
  const thin = synth({ bell: () => [0, 0, 0], tentacle: () => [0, 0, 0], outline: null, alpha: 114 });      // 114/255 ≈ 0.447：不够
  assert.equal(splitBody(thin), null);
  assert.equal(splitBody({ width: 4, height: 4, pixels: Buffer.alloc(64) }), null);
  assert.deepEqual(splitBody(thin, { minAlpha: 0.4 }).bell[0].color.map(Math.round), [141, 141, 141]);
  assert.deepEqual(splitBody(half, { backdrop: 0 }).bell[0].color.map(Math.round), [0, 0, 0], '黑底上黑色还是黑色');
});

test('medianColor：逐通道中位数，空组为 null', () => {
  const list = [[10, 200, 5], [30, 100, 5], [20, 150, 9]].map(color => ({ x: 0, y: 0, color }));
  assert.deepEqual(medianColor(list), [20, 150, 5]);
  assert.equal(medianColor([]), null);
});

test('regionsOf：钟罩上/下 1/3、左/中/右 1/3 与触须左 1/3 各取自己的像素', () => {
  const image = synth({
    // 钟罩：上三分之一红、下三分之一蓝、其余绿；同时左/中/右三段各一种色（只看列时）以 x 分段，行分段另测
    bell: (x, y) => (y < 20 + 13 ? [255, 0, 0] : y > 59 - 13 ? [0, 0, 255] : [0, 255, 0]),
    tentacle: x => (x < 20 + 79 / 3 ? [200, 100, 0] : [0, 100, 200]),
  });
  const regions = regionsOf(splitBody(image));
  assert.deepEqual(regions.bellTop, [255, 0, 0]);
  assert.deepEqual(regions.bellBottom, [0, 0, 255]);
  assert.deepEqual(regions.tentacleLeft, [200, 100, 0]);
  assert.deepEqual(regions.tentacles, [0, 100, 200], '触须整体：右侧三根多于左侧两根，中位数落在右侧颜色');
  const columns = regionsOf(splitBody(synth({ bell: x => (x < 46 ? [255, 0, 0] : x < 73 ? [0, 255, 0] : [0, 0, 255]), tentacle: () => [9, 9, 9] })));
  assert.deepEqual(columns.bellLeft, [255, 0, 0]);
  assert.deepEqual(columns.bellMiddle, [0, 255, 0]);
  assert.deepEqual(columns.bellRight, [0, 0, 255]);
});

test('regionsOf：描边与触须左/右 1/3 取自自己的像素', () => {
  const image = synth({ bell: () => [10, 20, 30], outline: [200, 10, 10], tentacle: x => (x < 20 + (2 * 79) / 3 ? [100, 100, 0] : [0, 100, 200]) });
  const regions = regionsOf(splitBody(image));
  assert.deepEqual(regions.outline, [200, 10, 10]);
  assert.deepEqual(regions.bell, [10, 20, 30], '描边只占钟罩的一小圈，不影响钟罩中位色');
  assert.deepEqual(regions.tentacleLeft, [100, 100, 0]);
  assert.deepEqual(regions.tentacleRight, [0, 100, 200], '右 1/3：列 ≥ 20 + 2/3 × 79 = 72.7，即后两根触须');
});

test('regionsOf：用“红色通道 = 列号、绿色通道 = 行号”的渐变把三等分的边界钉到具体的列和行', () => {
  // 纯色块的中位数会掩盖边界偏移一两列；渐变的中位数就是区域中间那一列/行的编号。percentile 取上中位数（floor(0.5·n)）。
  const regions = regionsOf(splitBody(synth({ bell: (x, y) => [x, y, 0], tentacle: x => [x, 0, 0], outline: null })));
  // 钟罩 20–99 列、20–59 行：宽 79 → 左 < 46.33（列 20–46）、中 46.33–72.67（列 47–72）、右 ≥ 72.67（列 73–99）
  assert.equal(regions.bellLeft[0], 33);
  assert.equal(regions.bellMiddle[0], 60);
  assert.equal(regions.bellRight[0], 86);
  // 高 39 → 上 < 33（行 20–32）、下 > 46（行 47–59）
  assert.equal(regions.bellTop[1], 26);
  assert.equal(regions.bellBottom[1], 53);
  // 触须条带 28–31、44–47、60–63、76–79、92–95：左 1/3 = 条带 1 与条带 2 的前两列，右 1/3 = 最后两根
  assert.equal(regions.tentacleLeft[0], 31);
  assert.equal(regions.tentacleRight[0], 92);
  assert.equal(regions.tentacles[0], 62);
});

test('evaluateLooks：四种花纹都画对时没有失败', () => {
  assert.deepEqual(failuresOf(goodLooks()), []);
});

test('evaluateLooks：参考色缺失直接抛错，不静默通过', () => {
  assert.throws(() => evaluateLooks({ refs: { 5: A, 0: B }, outlineRefs: OUTLINE_REFS, looks: goodLooks() }), /缺少色位 3 的参考色/);
  assert.throws(() => evaluateLooks({ outlineRefs: OUTLINE_REFS, looks: goodLooks() }), /缺少色位 5 的参考色/);
  // 参考描边色同样不能缺：缺任何一个色位都直接抛错，而不是拿别的色位凑数
  assert.throws(() => evaluateLooks({ refs: REFS, outlineRefs: { 5: OUTLINE_REFS[5], 0: OUTLINE_REFS[0] }, looks: goodLooks() }), /缺少色位 3 的参考描边色/);
  assert.throws(() => evaluateLooks({ refs: REFS, looks: goodLooks() }), /缺少色位 5 的参考描边色/);
});

test('evaluateLooks：取不到像素（缺图、全透明）算失败', () => {
  const missing = goodLooks(); delete missing.duo;
  assert.ok(failuresOf(missing).some(line => /^duo：没有取到身体像素/.test(line)));
  const blank = withLook('rainbow', { width: 8, height: 8, pixels: Buffer.alloc(8 * 8 * 4) });
  assert.ok(failuresOf(blank).some(line => /^rainbow：没有取到身体像素/.test(line)));
  assert.equal(failuresOf(blank).length, 1, '只有这一种花纹失败');
});

test('evaluateLooks 纯色：触须不是 a 就失败，并报出色差上限', () => {
  const failures = failuresOf(withLook('solid', synth({ bell: () => A, tentacle: () => B })));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^solid：触须离色位 5 色差 \d+\.\d，超过 10$/);
  const bellOff = failuresOf(withLook('solid', synth({ bell: () => mix(A, B, 0.5), tentacle: () => A })));
  assert.match(bellOff.join('\n'), /^solid：钟罩离色位 5 色差 \d+\.\d，超过 8$/m);
});

test('evaluateLooks 双色：触须画成 a、钟罩画成 b、或两者对调，分别报出', () => {
  assert.match(failuresOf(withLook('duo', synth({ bell: () => A, tentacle: () => A }))).join('\n'), /^duo：触须最接近色位 5，应是色位 0$/m);
  assert.match(failuresOf(withLook('duo', synth({ bell: () => B, tentacle: () => B }))).join('\n'), /^duo：钟罩最接近色位 0，应是色位 5$/m);
  const swapped = failuresOf(withLook('duo', synth({ bell: () => B, tentacle: () => A })));
  assert.equal(swapped.length, 2);
  // 还是最近的色位，但偏得太远：钟罩混入 30% 的 b（色差约 10 > 8）
  const drift = failuresOf(withLook('duo', synth({ bell: () => mix(A, B, 0.3), tentacle: () => B })));
  assert.equal(drift.length, 1);
  assert.match(drift[0], /^duo：钟罩离色位 5 色差 \d+\.\d，超过 8$/);
});

test('evaluateLooks 渐变：纵向颠倒、触须不偏向第二色都会失败', () => {
  const reversed = failuresOf(withLook('blend', synth({ bell: (x, y) => mix(A, B, v(y)), tentacle: () => mix(A, B, 0.7) }))).join('\n');
  assert.match(reversed, /^blend：钟罩下缘最接近色位 0，应是色位 5$/m);
  assert.match(reversed, /^blend：钟罩顶部最接近色位 5，应是色位 0$/m);
  const tentacleA = failuresOf(withLook('blend', synth({ bell: (x, y) => mix(B, A, v(y)), tentacle: () => A })));
  assert.equal(tentacleA.length, 1);
  assert.match(tentacleA[0], /^blend：触须应更接近色位 0（\d+\.\d）而不是色位 5（\d+\.\d）$/);
});

test('evaluateLooks 七彩：横向颠倒、只有两色、触须顺序反了，都会失败（每次只坏一处）', () => {
  const reversed = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => lit(rainbowAt(x, [C, B, A]), y) })));
  assert.match(reversed.join('\n'), /^rainbow：钟罩右段最接近色位 5，应是色位 3$/m);
  assert.match(reversed.join('\n'), /^rainbow：钟罩左段应更接近色位 5（\d+\.\d）而不是色位 3（\d+\.\d）$/m);
  assert.match(reversed.join('\n'), /^rainbow：钟罩左段应比右段更像色位 5$/m);
  assert.match(reversed.join('\n'), /^rainbow：钟罩右段应比左段更像色位 3$/m);
  assert.equal(reversed.length, 4, reversed.join('\n'));
  const twoColors = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => lit(rainbowAt(x, [A, B, B]), y) })));
  assert.match(twoColors.join('\n'), /^rainbow：钟罩右段最接近色位 0，应是色位 3$/m);
  assert.ok(twoColors.every(line => line.startsWith('rainbow：')));
  const tentacleReversed = failuresOf(withLook('rainbow', rainbowImage({ tentacle: x => rainbowAt(x, [C, B, A]) })));
  assert.equal(tentacleReversed.length, 2, tentacleReversed.join('\n'));
  assert.match(tentacleReversed[0], /^rainbow：触须最左一段应更接近色位 5（\d+\.\d）而不是色位 3（\d+\.\d）$/);
  assert.match(tentacleReversed[1], /^rainbow：触须最右一段应更接近色位 3（\d+\.\d）而不是色位 5（\d+\.\d）$/);
});

test('evaluateLooks 七彩：触须没沿钟罩铺开（全是 a 或全是 c）时，只有对应的那一端报错', () => {
  const allA = failuresOf(withLook('rainbow', rainbowImage({ tentacle: () => A })));
  assert.equal(allA.length, 1, allA.join('\n'));
  assert.match(allA[0], /^rainbow：触须最右一段应更接近色位 3（\d+\.\d）而不是色位 5（\d+\.\d）$/);
  const allC = failuresOf(withLook('rainbow', rainbowImage({ tentacle: () => C })));
  assert.equal(allC.length, 1, allC.join('\n'));
  assert.match(allC[0], /^rainbow：触须最左一段应更接近色位 5（\d+\.\d）而不是色位 3（\d+\.\d）$/);
});

test('evaluateLooks 七彩：顶部不比下缘亮就失败（亮度层缺失、太弱或上下颠倒）', () => {
  const white = [255, 255, 255];
  const flat = failuresOf(withLook('rainbow', rainbowImage({ bell: x => rainbowAt(x, [A, B, C]) })));
  assert.equal(flat.length, 1, flat.join('\n'));
  assert.match(flat[0], /^rainbow：钟罩顶部应比下缘亮（L\* 差 -?\d+\.\d，至少 1\.5）$/);
  const faint = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => mix(rainbowAt(x, [A, B, C]), white, 0.02 * (1 - v(y))) })));
  assert.equal(faint.length, 1, faint.join('\n'));
  assert.match(faint[0], /钟罩顶部应比下缘亮/);
  const upsideDown = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => mix(rainbowAt(x, [A, B, C]), white, 0.3 * v(y)) })));
  assert.equal(upsideDown.length, 1, upsideDown.join('\n'));
  assert.match(upsideDown[0], /L\* 差 -\d+\.\d/, '下缘更亮时差值是负的');
});

test('evaluateLooks 描边：画成别的色位、或色位对但偏得太远，都会失败（各花纹的规定色位不同）', () => {
  // 双色/渐变/纯色的描边是 a（色位 5），七彩的描边是 b（色位 0）
  const duoWrong = failuresOf(withLook('duo', synth({ bell: () => A, tentacle: () => B, outline: dark(B) })));
  assert.deepEqual(duoWrong, ['duo：描边最接近色位 0，应是色位 5']);
  const blendWrong = failuresOf(withLook('blend', synth({ bell: (x, y) => mix(B, A, v(y)), tentacle: () => mix(A, B, 0.7), outline: dark(B) })));
  assert.deepEqual(blendWrong, ['blend：描边最接近色位 0，应是色位 5']);
  const rainbowAsA = failuresOf(withLook('rainbow', rainbowImage({ outline: dark(A) })));
  assert.deepEqual(rainbowAsA, ['rainbow：描边最接近色位 5，应是色位 0']);
  const rainbowAsC = failuresOf(withLook('rainbow', rainbowImage({ outline: dark(C) })));
  assert.deepEqual(rainbowAsC, ['rainbow：描边最接近色位 3，应是色位 0']);
  // 纯色只有一个候选色位，分不出“最接近谁”，靠色差上限把关
  const solidFar = failuresOf(withLook('solid', synth({ bell: () => A, tentacle: () => A, outline: dark(C) })));
  assert.equal(solidFar.length, 1, solidFar.join('\n'));
  assert.match(solidFar[0], /^solid：描边离色位 5 的参考描边色差 \d+\.\d，超过 4$/);
  // 色位对，但偏离 30%（色差约 9 > 4）
  const drift = failuresOf(withLook('duo', synth({ bell: () => A, tentacle: () => B, outline: mix(dark(A), dark(B), 0.3) })));
  assert.equal(drift.length, 1, drift.join('\n'));
  assert.match(drift[0], /^duo：描边离色位 5 的参考描边色差 \d+\.\d，超过 4$/);
  // 钟罩太小取不到描边像素（行 56 以下属下摆附近不取）：明确报“没有取到像素”，不当作通过
  const flatBody = { width: 120, height: 100, pixels: Buffer.alloc(120 * 100 * 4) };
  for (let y = 20; y <= 22; y++) for (let x = 20; x <= 99; x++) { const i = (y * 120 + x) * 4; flatBody.pixels[i] = A[0]; flatBody.pixels[i + 1] = A[1]; flatBody.pixels[i + 2] = A[2]; flatBody.pixels[i + 3] = 255; }
  assert.ok(failuresOf(withLook('solid', flatBody)).includes('solid：描边没有取到像素'));
});

test('evaluateLooks：阈值的边界——刚好等于下限/上限算通过，差一点就失败（lightGapMin、outlineExact）', () => {
  const regions = regionsOf(splitBody(GOOD.rainbow()));
  const gap = toLab(regions.bellTop)[0] - toLab(regions.bellBottom)[0];
  assert.ok(gap > LIMITS.lightGapMin + 0.5, `夹具的亮度差 ${gap} 应明显大于下限，边界测试才有意义`);
  assert.deepEqual(failuresOf(goodLooks(), { ...LIMITS, lightGapMin: gap }), [], '亮度差刚好等于下限：通过');
  assert.match(failuresOf(goodLooks(), { ...LIMITS, lightGapMin: gap + 1e-9 }).join('\n'), /^rainbow：钟罩顶部应比下缘亮/m);
  // 描边：偏 10% 的 b，色差落在上限之内
  const off = synth({ bell: () => A, tentacle: () => B, outline: mix(dark(A), dark(B), 0.1) });
  const d = deltaE(regionsOf(splitBody(off)).outline, OUTLINE_REFS[5]);
  assert.ok(d > 0.5 && d < LIMITS.outlineExact, `夹具的描边色差 ${d} 应在 (0.5, ${LIMITS.outlineExact}) 之间`);
  assert.deepEqual(failuresOf(withLook('duo', off)), [], '默认上限放得下');
  assert.deepEqual(failuresOf(withLook('duo', off), { ...LIMITS, outlineExact: d }), [], '色差刚好等于上限：通过');
  assert.match(failuresOf(withLook('duo', off), { ...LIMITS, outlineExact: d - 1e-9 }).join('\n'), /^duo：描边离色位 5 的参考描边色差 \d+\.\d，超过 /m);
});

test('evaluateLooks 七彩：只有中段画错（钟罩中段不是 b），其余都对时只报这一条', () => {
  const failures = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => lit(x < 73 ? mix(A, A, 0) : C, y) })));
  assert.deepEqual(failures.filter(line => !/钟罩左段|钟罩右段/.test(line)), ['rainbow：钟罩中段最接近色位 5，应是色位 0']);
  // 只改中段一段：左段 a、中段换成 c、右段 c
  const onlyMiddle = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => lit(x < 46 ? A : x < 73 ? C : C, y) })));
  assert.ok(onlyMiddle.includes('rainbow：钟罩中段最接近色位 3，应是色位 0'), onlyMiddle.join('\n'));
});

test('evaluateLooks 七彩：左右两段一模一样（整块一个颜色）时，“左比右更像 a、右比左更像 c”都不成立', () => {
  const failures = failuresOf(withLook('rainbow', rainbowImage({ bell: (x, y) => lit(B, y) })));
  assert.ok(failures.includes('rainbow：钟罩左段应比右段更像色位 5'), failures.join('\n'));
  assert.ok(failures.includes('rainbow：钟罩右段应比左段更像色位 3'), failures.join('\n'));
});

test('evaluateLooks：身体里缺某个区域（没有触须、钟罩只有一行）时报“没有取到像素”，不抛异常', () => {
  const noTentacles = failuresOf(withLook('rainbow', synth({ bell: (x, y) => lit(rainbowAt(x, [A, B, C]), y), tentacle: null, outline: dark(B) })));
  assert.deepEqual(noTentacles, ['rainbow：触须最左一段没有取到像素', 'rainbow：触须最右一段没有取到像素']);
  const blend = failuresOf(withLook('blend', synth({ bell: (x, y) => mix(B, A, v(y)), tentacle: null, outline: dark(A) })));
  assert.deepEqual(blend, ['blend：触须没有取到像素']);
  const solidNone = failuresOf(withLook('solid', synth({ bell: () => A, tentacle: null })));
  assert.deepEqual(solidNone, ['solid：触须没有取到像素']);
  // 钟罩只有一行：高度为 0，上/下 1/3 都是空的；描边（避开下摆 4 行）与触须也都没有
  const oneRow = { width: 120, height: 100, pixels: Buffer.alloc(120 * 100 * 4) };
  for (let x = 20; x <= 99; x++) oneRow.pixels.set([...rainbowAt(x, [A, B, C]), 255], (20 * 120 + x) * 4);
  assert.deepEqual(failuresOf(withLook('rainbow', oneRow)), [
    'rainbow：触须最左一段没有取到像素',
    'rainbow：触须最右一段没有取到像素',
    'rainbow：钟罩顶部没有取到像素',
    'rainbow：描边没有取到像素',
  ]);
});

test('evaluateLooks：exact / tentacleExact 的边界——刚好等于上限算通过，差一点就失败', () => {
  const bellOff = synth({ bell: () => mix(A, B, 0.1), tentacle: () => A });
  const dBell = deltaE(regionsOf(splitBody(bellOff)).bell, REFS[5]);
  assert.ok(dBell > 0.5 && dBell < LIMITS.exact, `钟罩色差 ${dBell}`);
  assert.deepEqual(failuresOf(withLook('solid', bellOff), { ...LIMITS, exact: dBell }), []);
  assert.match(failuresOf(withLook('solid', bellOff), { ...LIMITS, exact: dBell - 1e-9 }).join('\n'), /^solid：钟罩离色位 5 色差 \d+\.\d，超过 /m);
  const tentacleOff = synth({ bell: () => A, tentacle: () => mix(A, B, 0.1) });
  const dTentacle = deltaE(regionsOf(splitBody(tentacleOff)).tentacles, REFS[5]);
  assert.ok(dTentacle > 0.5 && dTentacle < LIMITS.tentacleExact, `触须色差 ${dTentacle}`);
  assert.deepEqual(failuresOf(withLook('solid', tentacleOff), { ...LIMITS, tentacleExact: dTentacle }), []);
  assert.match(failuresOf(withLook('solid', tentacleOff), { ...LIMITS, tentacleExact: dTentacle - 1e-9 }).join('\n'), /^solid：触须离色位 5 色差 \d+\.\d，超过 /m);
});

test('evaluateLooks：两个候选色位的参考色相同（平局）时，“更接近”不成立，而不是默认通过', () => {
  // 色位 3 的参考色和色位 5 一样：任何颜色到两者的距离都相等
  const tie = evaluateLooks({ refs: { 5: A, 0: B, 3: A }, outlineRefs: OUTLINE_REFS, looks: goodLooks() });
  assert.ok(tie.some(line => /^rainbow：钟罩左段应更接近色位 5（(\d+\.\d)）而不是色位 3（\1）$/.test(line)), tie.join('\n'));
  assert.ok(tie.some(line => /^rainbow：触须最左一段应更接近色位 5（(\d+\.\d)）而不是色位 3（\1）$/.test(line)), tie.join('\n'));
  assert.ok(tie.some(line => /^rainbow：触须最右一段应更接近色位 3（(\d+\.\d)）而不是色位 5（\1）$/.test(line)), tie.join('\n'));
});

test('evaluateLooks：每条规则单独失败时只报这一条（不会因为别的花纹连带）', () => {
  assert.deepEqual(failuresOf(withLook('duo', GOOD.duo())), []);
  for (const [look, bad] of [['solid', synth({ bell: () => A, tentacle: () => C })], ['duo', synth({ bell: () => A, tentacle: () => C })], ['blend', synth({ bell: (x, y) => mix(B, A, v(y)), tentacle: () => C })], ['rainbow', rainbowImage({ tentacle: () => C })]]) {
    const failures = failuresOf(withLook(look, bad));
    assert.ok(failures.length >= 1 && failures.every(line => line.startsWith(`${look}：`)), `${look}：${failures.join(' | ')}`);
  }
});

// ---------- 命令行 ----------
function withDir(images, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'appearance-looks-'));
  try {
    for (const [name, image] of Object.entries(images)) writeFileSync(join(dir, name), encodePng(image.width, image.height, image.pixels));
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const run = dir => spawnSync(process.execPath, [SCRIPT, `--dir=${dir}`], { encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
const solid = color => synth({ bell: () => color, tentacle: () => color, outline: dark(color) });
const files = looks => ({
  'color-5.png': solid(A), 'color-0.png': solid(B), 'color-3.png': solid(C),
  ...Object.fromEntries(Object.entries(looks).map(([look, image]) => [`look-${look}.png`, image])),
});

test('命令行：四种花纹都对时退出码 0，逐花纹输出分区与归类', () => {
  withDir(files(goodLooks()), dir => {
    const result = run(dir);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /^duo +钟罩 20–59 触须 60–89 /m);
    assert.match(result.stdout, /^rainbow +钟罩 20–59 /m);
    assert.match(result.stdout, /四种花纹都画成了规定的颜色位/);
    // 每个区域都标出“最接近哪个色位（色差）”；描边对照的是参考描边色，不是参考填充色
    assert.match(result.stdout, /^solid .* outline→5\(0\) /m, '纯色的描边与参考描边色一模一样，色差 0');
    const rainbow = result.stdout.split('\n').find(line => line.startsWith('rainbow'));
    for (const cell of [/bellLeft→5\(\d+\)/, /bellMiddle→0\(\d+\)/, /bellRight→3\(\d+\)/, /outline→0\(0\)/, /tentacleLeft→5\(\d+\)/, /tentacleRight→3\(\d+\)/]) assert.match(rainbow, cell);
  });
});

test('命令行：某个花纹的截图里没有身体、或身体太小取不到的区域，逐项标明而不是崩溃', () => {
  withDir(files(withLook('rainbow', { width: 8, height: 8, pixels: Buffer.alloc(8 * 8 * 4) })), dir => {
    const result = run(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /^rainbow +没有身体像素$/m);
    assert.match(result.stdout, /✗ rainbow：没有取到身体像素/);
  });
  const oneRow = { width: 120, height: 100, pixels: Buffer.alloc(120 * 100 * 4) };      // 钟罩只有一行：上/下 1/3、描边、触须都取不到
  for (let x = 20; x <= 99; x++) oneRow.pixels.set([...rainbowAt(x, [A, B, C]), 255], (20 * 120 + x) * 4);
  withDir(files(withLook('rainbow', oneRow)), dir => {
    const result = run(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    const line = result.stdout.split('\n').find(entry => entry.startsWith('rainbow'));
    for (const cell of ['bellTop=—', 'bellBottom=—', 'outline=—', 'tentacles=—', 'tentacleLeft=—', 'tentacleRight=—']) assert.ok(line.includes(cell), `${cell}：${line}`);
    assert.match(line, /bellMiddle→\d\(\d+\)/, '取得到的区域照常标出');
  });
});

test('命令行：有花纹画错时退出码 1，逐条列出失败', () => {
  withDir(files(withLook('duo', synth({ bell: () => A, tentacle: () => A }))), dir => {
    const result = run(dir);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /未通过（1）/);
    assert.match(result.stdout, /✗ duo：触须最接近色位 5，应是色位 0/);
    assert.doesNotMatch(result.stdout, /四种花纹都画成了规定的颜色位/);
  });
});

test('命令行：缺参数、缺图片、参考图里没有身体像素都明确报错而不是静默通过', () => {
  const noArg = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
  assert.notEqual(noArg.status, 0);
  assert.match(noArg.stderr, /需要 --dir=/);
  withDir({ 'color-5.png': solid(A) }, dir => {
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /ENOENT/);
  });
  const blank = { width: 8, height: 8, pixels: Buffer.alloc(8 * 8 * 4) };
  withDir({ ...files(goodLooks()), 'color-3.png': blank }, dir => {
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /色位 3 的参考截图里没有身体像素/);
  });
  // 有身体、但太扁取不到描边像素（钟罩只有 3 行，描边取样要避开下摆附近 4 行）
  const flat = { width: 120, height: 100, pixels: Buffer.alloc(120 * 100 * 4) };
  for (let y = 20; y <= 22; y++) for (let x = 20; x <= 99; x++) { const i = (y * 120 + x) * 4; flat.pixels[i] = C[0]; flat.pixels[i + 1] = C[1]; flat.pixels[i + 2] = C[2]; flat.pixels[i + 3] = 255; }
  withDir({ ...files(goodLooks()), 'color-3.png': flat }, dir => {
    const result = run(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /色位 3 的参考截图里没有描边像素/);
  });
});
