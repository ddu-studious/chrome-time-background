// 外观可见性/辨识度测量（desktop-reminder/appearance-contrast.mjs）：对比度、Lab 色差、叠底、统计范围、判定。
// 这里只测纯函数；真实渲染由 appearance-snapshot.mjs --all-colors 拍照、appearance-contrast.mjs --dir 量取。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, deltaE, luminance, measure, analyze, evaluate, percentile, toLab, BACKDROPS, LIMITS, SLOT_NAMES } from '../desktop-reminder/appearance-contrast.mjs';
import { encodePng } from './fixtures/png-encode.mjs';

const image = (...pixels) => ({ width: pixels.length, height: 1, pixels: Buffer.from(pixels.flat()) });   // 每个像素 [r,g,b,a]
const solid = (rgb, count = 40) => image(...Array.from({ length: count }, () => [...rgb, 255]));

test('亮度与对比度：黑白 21:1，同色 1:1，对称', () => {
  assert.ok(Math.abs(luminance([255, 255, 255]) - 1) < 1e-9);
  assert.equal(luminance([0, 0, 0]), 0);
  assert.ok(Math.abs(contrastRatio([255, 255, 255], [0, 0, 0]) - 21) < 1e-9);
  assert.equal(contrastRatio([10, 120, 200], [10, 120, 200]), 1);
  assert.equal(contrastRatio([10, 120, 200], [250, 250, 250]), contrastRatio([250, 250, 250], [10, 120, 200]));
  // 已知值：sRGB (119,119,119) 对白色约 4.48:1（WCAG 常见的 #777 对 #fff）
  assert.ok(Math.abs(contrastRatio([119, 119, 119], [255, 255, 255]) - 4.48) < 0.01);
});

test('Lab 色差（CIE76）：黑白约 100，同色 0，对称，红绿差很大', () => {
  assert.ok(Math.abs(deltaE([255, 255, 255], [0, 0, 0]) - 100) < 0.01);
  assert.equal(deltaE([30, 60, 90], [30, 60, 90]), 0);
  assert.equal(deltaE([200, 30, 60], [30, 200, 90]), deltaE([30, 200, 90], [200, 30, 60]));
  assert.ok(deltaE([255, 0, 0], [0, 255, 0]) > 80);
  assert.ok(deltaE([100, 100, 100], [102, 100, 100]) < 2, '几乎相同的颜色色差很小');
});

test('percentile：按排序后的下标取，空数组给 0', () => {
  const values = [5, 1, 4, 2, 3];
  assert.equal(percentile(values, 0), 1);
  assert.equal(percentile(values, 0.5), 3);
  assert.equal(percentile(values, 1), 5);
  assert.equal(percentile([], 0.5), 0);
  assert.deepEqual(values, [5, 1, 4, 2, 3], '不改动入参');
});

const close = (actual, expected, label) => {
  assert.ok(Array.isArray(actual), `${label}：应有颜色`);
  expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 1e-6, `${label}：${actual} 与 ${expected} 不一致`));
};

test('measure：只统计 alpha 够大的“身体”像素；叠底用非预乘 alpha；取每个通道的中位数', () => {
  // 四个像素：不透明红、完全透明（不算）、半透明蓝（alpha 128/255）、不透明白
  const img = image([255, 0, 0, 255], [9, 9, 9, 0], [0, 0, 255, 128], [255, 255, 255, 255]);
  const onBlack = measure(img, { backdrop: BACKDROPS.black });
  assert.equal(onBlack.count, 3, 'alpha=0 的像素不算');
  // 黑底：红→(255,0,0)；半透明蓝→(0,0,128)；白→(255,255,255)。三个值各通道取中位数：R 255、G 0、B 128
  close(onBlack.median, [255, 0, 128], '黑底');
  const onWhite = measure(img, { backdrop: BACKDROPS.white });
  assert.equal(onWhite.count, 3);
  // 白底：红→(255,0,0)；半透明蓝→(127,127,255)；白→(255,255,255)。R:[255,127,255]→255  G:[0,127,255]→127  B:[0,255,255]→255
  close(onWhite.median, [255, 127, 255], '白底');
});

test('measure：minAlpha 可调，faint 的光晕不算身体；没有身体像素时给空结果而不是抛错', () => {
  const faint = image([200, 200, 200, 20], [200, 200, 200, 30]);
  const none = measure(faint, { backdrop: 255 });
  assert.equal(none.count, 0);
  assert.equal(none.median, null);
  assert.equal(none.contrast.p50, 0);
  assert.equal(measure(faint, { backdrop: 255, minAlpha: 0.05 }).count, 2);
});

test('measure：对比度分位数按“叠底后颜色对底色”逐像素计算', () => {
  // 40 个纯黑不透明像素叠在白底：每个对比度 21
  const black = measure(solid([0, 0, 0]), { backdrop: 255 });
  assert.ok(Math.abs(black.contrast.p50 - 21) < 1e-9);
  assert.ok(Math.abs(black.contrast.p98 - 21) < 1e-9);
  // 纯白不透明像素叠在白底：1
  assert.equal(measure(solid([255, 255, 255]), { backdrop: 255 }).contrast.p50, 1);
});

test('analyze：每个颜色位对白/黑底各一组测量，并给出各底色上最相近的一对', () => {
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255], [128, 128, 128], [255, 128, 0]];
  const result = analyze(colors.map(rgb => solid(rgb)));
  assert.equal(result.slots.length, 8);
  assert.ok(result.slots[0].white.count > 0 && result.slots[0].black.count > 0);
  for (const backdrop of ['white', 'black']) {
    const closest = result.closest[backdrop];
    assert.ok(Number.isInteger(closest.a) && Number.isInteger(closest.b) && closest.a < closest.b);
    // 最小值必须真是所有两两色差里的最小
    let min = Infinity;
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) min = Math.min(min, deltaE(result.slots[i][backdrop].median, result.slots[j][backdrop].median));
    assert.ok(Math.abs(result.closest[backdrop].deltaE - min) < 1e-9);
  }
});

const limits = { whiteMedianContrast: 1.2, blackMedianContrast: 4, pairDeltaE: 20 };

test('evaluate：都达标没有失败；某一项不达标时指明颜色位、底色与数值', () => {
  const colors = [[230, 90, 80], [240, 140, 60], [235, 200, 70], [80, 190, 100], [70, 200, 170], [80, 160, 220], [150, 110, 235], [225, 100, 190]];
  const good = analyze(colors.map(rgb => solid(rgb)));
  assert.deepEqual(evaluate(good, { whiteMedianContrast: 1.2, blackMedianContrast: 4, pairDeltaE: 20 }), []);
  const pale = analyze(colors.map((rgb, i) => solid(i === 2 ? [250, 250, 250] : rgb)));
  const failures = evaluate(pale, limits);
  assert.ok(failures.some(text => /色位 2/.test(text) && /白底/.test(text)), failures.join('\n'));
});

test('evaluate：两个颜色几乎一样会被判为不可分辨，并写出是哪两个', () => {
  const colors = [[230, 90, 80], [231, 91, 80], [235, 200, 70], [80, 190, 100], [70, 200, 170], [80, 160, 220], [150, 110, 235], [225, 100, 190]];
  const failures = evaluate(analyze(colors.map(rgb => solid(rgb))), limits);
  assert.ok(failures.some(text => /色位 0/.test(text) && /色位 1/.test(text) && /色差/.test(text)), failures.join('\n'));
});

test('evaluate：缺少身体像素（截图失败）也算失败，不会静默通过', () => {
  const empty = image([0, 0, 0, 0], [0, 0, 0, 0]);
  const colors = [[230, 90, 80], [240, 140, 60], [235, 200, 70], [80, 190, 100], [70, 200, 170], [80, 160, 220], [150, 110, 235]];
  const failures = evaluate(analyze([...colors.map(rgb => solid(rgb)), empty]), limits);
  assert.ok(failures.some(text => /色位 7/.test(text) && /没有/.test(text)), failures.join('\n'));
});

// ───────── 以下是补强：独立参照值、边界、档位、并列、命令行 ─────────

// 参照值由与被测代码无关的实现算出（Python：IEC 61966-2-1 传递函数、D65 白点、CIE 精确常数 ε=216/24389、κ=24389/27），
// 其中红/绿/蓝/黄/青与已发表的 sRGB D65 Lab 值逐位一致（红 53.2408 80.0925 67.2032，绿 87.7347 −86.1827 83.1793，蓝 32.2970 79.1875 −107.8602）。
// 暗灰（8…13）落在线性段与幂函数段的交界，20…50 落在 Lab 立方根阈值附近，专门用来逮常数被悄悄改动。
const REFERENCE_LAB = [
  [[255, 0, 0], [53.2408, 80.0925, 67.2032]], [[0, 255, 0], [87.7347, -86.1827, 83.1793]], [[0, 0, 255], [32.2970, 79.1875, -107.8602]],
  [[255, 255, 0], [97.1393, -21.5537, 94.4780]], [[0, 255, 255], [91.1132, -48.0875, -14.1312]], [[255, 0, 255], [60.3242, 98.2343, -60.8249]],
  [[255, 255, 255], [100, 0, 0]], [[0, 0, 0], [0, 0, 0]], [[128, 128, 128], [53.5850, 0, 0]], [[119, 119, 119], [50.0344, 0, 0]],
  [[255, 115, 107], [65.4275, 52.7244, 30.7303]], [[255, 158, 77], [73.7107, 29.4940, 56.0369]], [[245, 209, 82], [84.8053, -0.9140, 65.3044]],
  [[107, 209, 122], [76.1486, -48.0041, 34.1979]], [[92, 214, 179], [78.2394, -42.4650, 7.0984]], [[102, 189, 230], [72.8456, -14.7594, -28.4242]],
  [[168, 128, 242], [61.8037, 38.9923, -51.9469]], [[237, 117, 204], [65.8191, 56.7573, -23.9327]],
  [[8, 8, 8], [2.1934, 0, 0]], [[10, 10, 10], [2.7417, 0, 0]], [[11, 11, 11], [3.0229, 0, 0]], [[12, 12, 12], [3.3210, 0, 0]], [[13, 13, 13], [3.6355, 0, 0]],
  [[20, 20, 20], [6.3189, 0, 0]], [[30, 30, 30], [11.2636, 0, 0]], [[40, 40, 40], [16.1144, 0, 0]], [[50, 50, 50], [20.7878, 0, 0]],
  [[12, 40, 90], [17.1487, 10.7119, -33.0104]], [[90, 12, 40], [18.3230, 35.9862, 4.2300]], [[40, 90, 12], [33.5409, -31.3602, 36.3359]],
  [[9, 9, 60], [5.2354, 18.9594, -31.6635]], [[60, 9, 9], [10.3796, 24.5792, 12.4674]], [[9, 60, 9], [21.2424, -27.8050, 25.1324]], [[30, 12, 50], [6.9486, 18.8678, -21.5039]],
];

test('toLab：与独立实现的参照值逐项一致（含暗色线性段、幂函数段与 Lab 阈值附近）', () => {
  for (const [rgb, expected] of REFERENCE_LAB) {
    const actual = toLab(rgb);
    expected.forEach((value, i) => assert.ok(Math.abs(actual[i] - value) < 5e-4, `${rgb} 的 ${'Lab'[i]} 是 ${actual[i].toFixed(4)}，参照 ${value}`));
  }
});

test('deltaE：等于参照 Lab 值差的欧氏距离（CIE76），不是别的范数', () => {
  const lookup = new Map(REFERENCE_LAB.map(([rgb, lab]) => [rgb.join(), lab]));
  const pairs = [[[255, 0, 0], [0, 255, 0]], [[255, 0, 0], [0, 0, 255]], [[255, 115, 107], [255, 158, 77]], [[107, 209, 122], [92, 214, 179]], [[168, 128, 242], [237, 117, 204]], [[12, 40, 90], [90, 12, 40]]];
  for (const [a, b] of pairs) {
    const p = lookup.get(a.join()), q = lookup.get(b.join());
    const expected = Math.sqrt((p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2);
    assert.ok(Math.abs(deltaE(a, b) - expected) < 2e-3, `${a} 与 ${b}：${deltaE(a, b)} 对 ${expected}`);
  }
});

test('luminance / contrastRatio：与独立算出的值一致（含暗色线性段）、与已发表的 WCAG 示例一致', () => {
  const REFERENCE_LUMINANCE = [[[255, 0, 0], 0.2126], [[0, 255, 0], 0.7152], [[0, 0, 255], 0.0722], [[128, 128, 128], 0.215861], [[8, 8, 8], 0.002428], [[10, 10, 10], 0.003035], [[11, 11, 11], 0.003347], [[13, 13, 13], 0.004025], [[200, 100, 50], 0.21624]];
  for (const [rgb, expected] of REFERENCE_LUMINANCE) assert.ok(Math.abs(luminance(rgb) - expected) < 2e-6, `${rgb}：${luminance(rgb)} 对 ${expected}`);
  // WebAIM 等处公布的灰字白底对比度：#767676 4.54、#595959 7.00、#949494 3.03；黑字 #767676 底 4.62
  const gray = value => [value, value, value];
  assert.ok(Math.abs(contrastRatio(gray(0x76), gray(255)) - 4.5422) < 5e-4);
  assert.ok(Math.abs(contrastRatio(gray(0x59), gray(255)) - 7.0047) < 5e-4);
  assert.ok(Math.abs(contrastRatio(gray(0x94), gray(255)) - 3.0335) < 5e-4);
  assert.ok(Math.abs(contrastRatio(gray(0), gray(0x76)) - 4.6233) < 5e-4);
});

test('measure：alpha 阈值 = ceil(minAlpha×255)，恰在边界上的像素算身体', () => {
  // 默认 0.45 → 115：114 不算，115 与 116 与 255 算
  const edge = image([200, 0, 0, 114], [200, 0, 0, 115], [200, 0, 0, 116], [200, 0, 0, 255]);
  assert.equal(measure(edge, { backdrop: 0 }).count, 3);
  // minAlpha=1 → 255：254 不算
  assert.equal(measure(image([200, 0, 0, 254], [200, 0, 0, 255]), { backdrop: 0, minAlpha: 1 }).count, 1);
  // 0.05 → ceil(12.75)=13：12 不算、13 算
  assert.equal(measure(image([9, 9, 9, 12], [9, 9, 9, 13]), { backdrop: 0, minAlpha: 0.05 }).count, 1);
  // minAlpha=0 表示不过滤：全透明像素也算
  assert.equal(measure(image([1, 2, 3, 0]), { backdrop: 0, minAlpha: 0 }).count, 1);
});

test('measure：对比度分位数档位是 10% / 50% / 90% / 98%，颜色取各通道 50% 位置', () => {
  // 100 个不透明像素叠在黑底：R 100…199 递增、G 10…109 递增、B 200…101 递减；对比度按颜色各自排序后按下标取
  const pixels = Array.from({ length: 100 }, (_, i) => [100 + i, 10 + i, 200 - i, 255]);
  const result = measure(image(...pixels), { backdrop: 0 });
  const sorted = pixels.map(([r, g, b]) => contrastRatio([r, g, b], [0, 0, 0])).sort((x, y) => x - y);
  assert.equal(result.count, 100);
  assert.equal(result.contrast.p10, sorted[10]);
  assert.equal(result.contrast.p50, sorted[50]);
  assert.equal(result.contrast.p90, sorted[90]);
  assert.equal(result.contrast.p98, sorted[98]);
  // 各通道单独排序后取下标 50：R 排序后第 50 个是 150、G 是 60、B（101…200）是 151
  assert.deepEqual(result.median, [150, 60, 151]);
  // 不是随便哪个分位：p10 < p50 < p90 < p98 严格递增
  assert.ok(result.contrast.p10 < result.contrast.p50 && result.contrast.p50 < result.contrast.p90 && result.contrast.p90 < result.contrast.p98);
});

test('measure：像素数据长度不是 4 的倍数时忽略尾部不足一个像素的 1/2/3 个字节，不读越界、不多算一个', () => {
  for (const tail of [[9], [9, 9], [9, 9, 9]]) {
    const result = measure({ width: 1, height: 1, pixels: Buffer.from([255, 0, 0, 255, ...tail]) }, { backdrop: 0 });
    assert.equal(result.count, 1, `尾部 ${tail.length} 字节`);
    assert.deepEqual(result.median, [255, 0, 0], `尾部 ${tail.length} 字节`);
  }
  // 长度恰好是 4 的倍数时，最后一个像素必须算
  assert.equal(measure({ width: 2, height: 1, pixels: Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]) }, { backdrop: 0 }).count, 2);
});

// 8 个彼此都远的颜色，用来单独制造“某一对很近”
const FAR = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255], [40, 40, 40], [200, 200, 200]];
const withColor = (index, rgb) => FAR.map((c, i) => solid(i === index ? rgb : c));

test('analyze：最相近的一对是紧挨着的 0 与 1 时能找到', () => {
  const result = analyze(withColor(1, [254, 2, 0]));
  for (const backdrop of ['white', 'black']) {
    assert.equal(result.closest[backdrop].a, 0);
    assert.equal(result.closest[backdrop].b, 1);
    assert.ok(Math.abs(result.closest[backdrop].deltaE - deltaE([255, 0, 0], [254, 2, 0])) < 1e-9);
  }
});

test('analyze：最相近的一对在末尾的 6 与 7 时也能找到；不会越过末尾', () => {
  const result = analyze(withColor(7, [41, 40, 40]));
  for (const backdrop of ['white', 'black']) {
    assert.equal(result.closest[backdrop].a, 6);
    assert.equal(result.closest[backdrop].b, 7);
  }
});

test('analyze：色差并列时保留先出现的一对（2 与 3），不被后面的相同色差顶掉', () => {
  const colors = FAR.map((c, i) => solid(i >= 2 && i <= 4 ? [120, 60, 200] : c));   // 2、3、4 三者相同：两两色差都是 0
  const result = analyze(colors);
  for (const backdrop of ['white', 'black']) {
    assert.deepEqual([result.closest[backdrop].a, result.closest[backdrop].b, result.closest[backdrop].deltaE], [2, 3, 0]);
  }
});

test('analyze：没有任何一对可比时 closest 为 null；只有一个颜色位也没有一对', () => {
  const empty = image([0, 0, 0, 0]);
  assert.deepEqual(analyze([empty, empty]).closest, { white: null, black: null });
  assert.deepEqual(analyze([solid([1, 2, 3])]).closest, { white: null, black: null });
  // 缺身体的颜色位不参与配对，其余照常
  const mixed = analyze([solid([255, 0, 0]), empty, solid([254, 2, 0])]);
  assert.deepEqual([mixed.closest.white.a, mixed.closest.white.b], [0, 2]);
});

test('analyze：把 options 透传给两种底色的测量（minAlpha）', () => {
  const half = image(...Array.from({ length: 10 }, () => [10, 10, 10, 100]));
  assert.equal(analyze([half]).slots[0].white.count, 0);
  assert.equal(analyze([half], { minAlpha: 0.3 }).slots[0].white.count, 10);
  assert.equal(analyze([half], { minAlpha: 0.3 }).slots[0].black.count, 10);
});

// ───────── evaluate 的边界：直接构造测量结果，数值精确可控 ─────────
const fakeResult = (p50, median = [10, 10, 10]) => ({ count: 1, contrast: { p10: p50, p50, p90: p50, p98: p50 }, median });
const emptyResult = () => ({ count: 0, contrast: { p10: 0, p50: 0, p90: 0, p98: 0 }, median: null });
const oneSlot = (white, black) => ({ slots: [{ white, black }], closest: {} });
const NO_LIMITS = { whiteMedianContrast: 0, blackMedianContrast: 0, pairDeltaE: 0 };

test('evaluate：中位对比度恰好等于阈值算通过，略低才失败；白底与黑底各用各的阈值', () => {
  const lim = { whiteMedianContrast: 1.15, blackMedianContrast: 4.8, pairDeltaE: 0 };
  assert.deepEqual(evaluate(oneSlot(fakeResult(1.15), fakeResult(4.8)), lim), []);
  const lowWhite = evaluate(oneSlot(fakeResult(1.1499999), fakeResult(4.8)), lim);
  assert.equal(lowWhite.length, 1);
  assert.match(lowWhite[0], /^色位 0（红）：白底中位对比度 1\.15 低于 1\.15$/);
  const lowBlack = evaluate(oneSlot(fakeResult(1.15), fakeResult(4.7999999)), lim);
  assert.equal(lowBlack.length, 1);
  assert.match(lowBlack[0], /^色位 0（红）：黑底中位对比度 4\.80 低于 4\.8$/);
  // 阈值互相独立：白底阈值不拿去比黑底
  assert.deepEqual(evaluate(oneSlot(fakeResult(2), fakeResult(2)), { whiteMedianContrast: 1.5, blackMedianContrast: 1.5, pairDeltaE: 0 }), []);
  assert.equal(evaluate(oneSlot(fakeResult(2), fakeResult(1)), { whiteMedianContrast: 1.5, blackMedianContrast: 1.5, pairDeltaE: 0 }).length, 1);
});

test('evaluate：色差恰好等于阈值算通过，略低才失败；两个底色分别判定并指明是哪两个色位', () => {
  const A = [200, 60, 60], B = [60, 120, 200];
  const D = deltaE(A, B);
  const pair = { slots: [{ white: fakeResult(9, A), black: fakeResult(9, A) }, { white: fakeResult(9, B), black: fakeResult(9, B) }], closest: {} };
  assert.deepEqual(evaluate(pair, { ...NO_LIMITS, pairDeltaE: D }), []);
  const failures = evaluate(pair, { ...NO_LIMITS, pairDeltaE: D + 1e-9 });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^色位 0（红） 与 色位 1（橙）：白底上色差 \d+\.\d 低于 /);
  assert.match(failures[1], /^色位 0（红） 与 色位 1（橙）：黑底上色差 \d+\.\d 低于 /);
});

test('evaluate：配对从每个色位的“下一个”开始（不与自己比较），缺身体的色位只报缺失、不参与配对', () => {
  // 只有一个色位：自己与自己的色差是 0，若误与自己比较会在阈值>0 时失败
  assert.deepEqual(evaluate(oneSlot(fakeResult(9, [1, 2, 3]), fakeResult(9, [1, 2, 3])), { ...NO_LIMITS, pairDeltaE: 5 }), []);
  // 中间一个缺身体：只有它自己的两条“没有取到身体像素”，另外两位相距够远则不额外失败
  const slots = [{ white: fakeResult(9, [200, 60, 60]), black: fakeResult(9, [200, 60, 60]) }, { white: emptyResult(), black: emptyResult() }, { white: fakeResult(9, [60, 120, 200]), black: fakeResult(9, [60, 120, 200]) }];
  const failures = evaluate({ slots, closest: {} }, { ...NO_LIMITS, pairDeltaE: 5 });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^色位 1（橙）：白底上没有取到身体像素/);
  assert.match(failures[1], /^色位 1（橙）：黑底上没有取到身体像素/);
});

test('evaluate：超出名单的颜色位用“?”做名字，不抛错', () => {
  const slots = Array.from({ length: 9 }, () => ({ white: fakeResult(9, [1, 2, 3]), black: fakeResult(9, [1, 2, 3]) }));
  slots[8] = { white: emptyResult(), black: fakeResult(9, [1, 2, 3]) };
  const failures = evaluate({ slots, closest: {} }, NO_LIMITS);
  assert.deepEqual(failures, ['色位 8（?）：白底上没有取到身体像素（截图失败或水母没有出现）']);
});

test('防退化线、颜色位名称与底色常量被钉死；改动须同步技术文档里的实测依据', () => {
  assert.deepEqual({ ...LIMITS }, { whiteMedianContrast: 1.15, blackMedianContrast: 4.8, pairDeltaE: 10 });
  assert.deepEqual([...SLOT_NAMES], ['红', '橙', '黄', '绿', '薄荷', '冰蓝', '紫', '洋红']);
  assert.deepEqual({ ...BACKDROPS }, { white: 255, black: 0 });
  assert.ok(Object.isFrozen(LIMITS) && Object.isFrozen(SLOT_NAMES) && Object.isFrozen(BACKDROPS));
});

// ───────── 命令行：真实起一个进程，读真实 PNG 文件 ─────────
const SCRIPT = fileURLToPath(new URL('../desktop-reminder/appearance-contrast.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 30000 });
const PASSING = [[230, 90, 80], [240, 140, 60], [235, 200, 70], [80, 190, 100], [70, 200, 170], [80, 160, 220], [150, 110, 235], [225, 100, 190]];

// colors 里的 null 表示整张全透明（水母没有出现）；每张 8×8，五种滤波器轮换，顺便走一遍真实解码
function withDir(colors, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'appearance-contrast-'));
  try {
    colors.forEach((rgb, index) => {
      const pixels = rgb ? Buffer.concat(Array.from({ length: 64 }, () => Buffer.from([...rgb, 255]))) : Buffer.alloc(64 * 4);
      writeFileSync(join(dir, `color-${index}.png`), encodePng(8, 8, pixels, { filters: [0, 1, 2, 3, 4] }));
    });
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('命令行：达标目录退出码 0，逐色位输出身体像素数，并报告两种底色上最相近的一对', () => withDir(PASSING, dir => {
  const result = run(`--dir=${dir}`);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^色位 {3}身体像素 {3}白底 中位\/p98 对比度 {3}黑底 中位\/p98 对比度/m);
  for (let i = 0; i < 8; i++) assert.match(result.stdout, new RegExp(`^色位 ${i}（${SLOT_NAMES[i]}）\\s+64\\s+\\d+\\.\\d\\d / \\d+\\.\\d\\d\\s+\\d+\\.\\d\\d / \\d+\\.\\d\\d\\s+\\d+,\\d+,\\d+$`, 'm'), `第 ${i} 行`);
  // 与同一批颜色直接分析的结果一致（同一对、同一个色差）
  const expected = analyze(PASSING.map(rgb => solid(rgb, 64)));
  for (const [backdrop, label] of [['white', '白底'], ['black', '黑底']]) {
    const c = expected.closest[backdrop];
    assert.ok(result.stdout.includes(`${label}上最相近的一对：色位 ${c.a}（${SLOT_NAMES[c.a]}） 与 色位 ${c.b}（${SLOT_NAMES[c.b]}），色差 ${c.deltaE.toFixed(1)}`), `${label}：\n${result.stdout}`);
  }
  assert.ok(result.stdout.includes(`✓ 全部达到防退化线 ${JSON.stringify(LIMITS)}`));
  assert.doesNotMatch(result.stdout, /未达防退化线|✗/);
}));

test('命令行：有颜色低于防退化线时退出码 1，逐条列出 ✗ 并给出阈值', () => withDir(PASSING.map((rgb, i) => (i === 2 ? [250, 250, 250] : rgb)), dir => {
  const result = run(`--dir=${dir}`);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.ok(result.stdout.includes(`未达防退化线（${JSON.stringify(LIMITS)}）：`));
  assert.match(result.stdout, /^ {2}✗ 色位 2（黄）：白底中位对比度 1\.04 低于 1\.15$/m);
  assert.doesNotMatch(result.stdout, /全部达到/);
}));

test('命令行：整张都没有身体像素时不崩溃，逐位报“没有取到身体像素”，不输出“最相近的一对”', () => withDir(Array(8).fill(null), dir => {
  const result = run(`--dir=${dir}`);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '', '不能因为没有可比的一对而抛 TypeError');
  assert.equal((result.stdout.match(/没有取到身体像素/g) ?? []).length, 16);
  assert.doesNotMatch(result.stdout, /最相近的一对/);
  assert.match(result.stdout, /未达防退化线/);
}));

test('命令行：缺少 --dir（或为空）报错退出并说明用法；目录里缺文件时报出文件名', () => {
  for (const args of [[], ['--dir='], ['--other=/tmp']]) {
    const result = run(...args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /需要 --dir=/, args.join(' '));
  }
  const dir = mkdtempSync(join(tmpdir(), 'appearance-contrast-empty-'));
  try {
    const result = run(`--dir=${dir}`);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /color-0\.png/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('命令行：--dir 可以放在别的参数之后；作为模块导入时不会执行主流程', async () => {
  withDir(PASSING, dir => {
    const result = run('--verbose', `--dir=${dir}`);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
  // 本文件顶部已 import 过该模块；若入口守卫失效，导入时就会因缺 --dir 抛错，整个文件都跑不起来
  const again = await import('../desktop-reminder/appearance-contrast.mjs');
  assert.equal(typeof again.evaluate, 'function');
});
