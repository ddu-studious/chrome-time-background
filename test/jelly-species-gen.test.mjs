// 生成器 desktop-reminder/gen-species.mjs：入库的 jelly-species-data.swift 必须与 js/jelly-species-shapes.js 一致；
// 形状数据有问题（路径解析不了、角色/视角不合法）时生成器必须拒绝并且不写出半成品。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const Shapes = createRequire(import.meta.url)('../js/jelly-species-shapes.js');
const generator = resolve(root, 'desktop-reminder/gen-species.mjs');
const committed = resolve(root, 'desktop-reminder/jelly-species-data.swift');
const run = args => spawnSync(process.execPath, [generator, ...args], { encoding: 'utf8' });

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-species-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
const shapesSource = readFileSync(resolve(root, 'js/jelly-species-shapes.js'), 'utf8');
const modified = (dir, from, to) => {
  assert.ok(shapesSource.includes(from), `测试前提：形状源码里应有 ${from}`);
  const file = join(dir, 'shapes.js');
  writeFileSync(file, shapesSource.replace(from, to));
  return file;
};

test('入库的 jelly-species-data.swift 与形状来源一致（--check 退出码 0）', () => {
  const result = run(['--check']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /生成物与来源一致/, '检查通过时要明说一致（而不是静默退出）');
});

test('重新生成到临时文件，与入库文件逐字节相同；检查模式不写任何文件', () => withTemp(dir => {
  const out = join(dir, 'data.swift');
  const result = run([`--out=${out}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已写入/); assert.ok(result.stdout.includes(out), '成功信息要带上写到了哪里');
  assert.match(result.stdout, /4 种动物：hammer、manta、turtle、whaleshark/, '成功信息列出写入的动物（全量变异检查里删掉这行信息语句的变异体曾存活）');
  // 用 ok 而不是 equal：两份文件各有几十 KB，不一致时 equal 会去算整份文本的差异，实测要几分钟（变异检查里出现过超时），而这里只需要知道“不一致”。
  assert.ok(readFileSync(out, 'utf8') === readFileSync(committed, 'utf8'), '生成结果应与入库文件完全相同（不一致时运行 node desktop-reminder/gen-species.mjs 重新生成并核对差异）');
  const absent = join(dir, 'absent.swift');
  assert.equal(run(['--check', `--out=${absent}`]).status, 1, '输出文件不存在也算不一致');
  assert.ok(!existsSync(absent), '--check 绝不写文件');
}));

test('形状来源改了而没重新生成：--check 退出码 1，并提示怎么办', () => withTemp(dir => {
  const shapes = modified(dir, 'scale: 0.89', 'scale: 0.9');
  const result = run(['--check', `--shapes=${shapes}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不一致/); assert.match(result.stderr, /gen-species\.mjs/);
}));

test('形状数据有问题：生成器拒绝（退出码 2）且不写出半成品', () => withTemp(dir => {
  const cases = [
    ['路径解析不了（缺数字）', "'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z'", "'M 10 -7 L -2'", /第 \d+ 个部件的路径无法解析/],
    ['路径含相对命令', "'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z'", "'M 10 -7 l -2 -25 Z'", /第 \d+ 个部件的路径无法解析/],
    ['角色不合法', "role: 'body', d: 'M 24 -8", "role: 'torso', d: 'M 24 -8", /角色 torso 不合法/],
    ['视角不合法', "view: 'top'", "view: 'front'", /视角 front 不合法/],
    ['缩放不合法', 'scale: 0.89', 'scale: 0', /缩放不合法/],
    // 数字不是有限值：写进 Swift 会变成编译不过的 NaN/Infinity（或者悄悄画出怪东西），必须在生成时拒绝
    ['眼睛半径是 NaN', 'eyes: { r: 2.2', 'eyes: { r: NaN'],
    ['腮红位置是 NaN', 'blush: [[30, -10, 2.6, 1.8]', 'blush: [[30, NaN, 2.6, 1.8]'],
    ['摆动角度是 NaN', 'deg: 12', 'deg: NaN'],
    ['转动支点是无穷', 'pivot: [-28, 0]', 'pivot: [-28, Infinity]'],
    ['拍翼幅度是 NaN', 'squash: 0.1', 'squash: NaN'],
    ['拍翼幅度超过上限', 'squash: 0.1', 'squash: 0.5'],
    ['拍翼幅度是负数', 'squash: 0.1', 'squash: -0.1'],
    ['拍翼幅度不是数字', 'squash: 0.1', "squash: '0.1'"],
    ['部件的取色位置 u 是 NaN', 'u: 0.57', 'u: NaN'],
    // 椭圆参数缺失会得到无法解析的路径；这条要由“展开失败”的防线拦住（不能让它崩在后面，退出码不是 2）
    ['椭圆缺少纵向半径', 'ellipse: [0, -5, 12, 2.4, -2]', 'ellipse: [0, -5, 12]'],
    // 第四项（可选）：生成器给出的具体说明——数据作者靠它找到出错的部件，不能只剩一句笼统的“不合规”
    ['部件既没有路径也没有椭圆', "{ role: 'shine', ellipse: [0, -5, 12, 2.4, -2] }", "{ role: 'shine' }", /既没有路径、椭圆也没有小圆/],
    ['路径用了指数写法', "'M 24 -8 C 10 -9", "'M 24 -8 C 1e1 -9"],
    // 微笑（mouth）：只有侧视动物有，四个点、每个点两个有限数字
    ['俯视动物写了嘴', 'blush: [[30, -10, 2.6, 1.8], [30, 10, 2.6, 1.8]],', 'blush: [[30, -10, 2.6, 1.8], [30, 10, 2.6, 1.8]], mouth: [[0, 0], [1, 1], [2, 2], [3, 3]],'],
    ['嘴只有三个点', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6]],'],
    ['嘴有五个点', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6], [38, 3]],'],
    ['嘴的坐标是 NaN', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],', 'mouth: [[45, NaN], [43.6, 6], [40.6, 6], [39.2, 3.6]],'],
    ['嘴的坐标是无穷', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],', 'mouth: [[45, 3.4], [43.6, Infinity], [40.6, 6], [39.2, 3.6]],'],
    ['嘴不是数组', 'mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],', "mouth: 'smile',"],
    // 小圆（dots）与部件写法（有且只有 d / ellipse / dots 之一）
    ['小圆列表为空', "role: 'accent', dots: [", "role: 'accent', dots: [], unused: ["],
    ['小圆的半径为 0', '[-4.75, -6.64, 1.32]', '[-4.75, -6.64, 0]'],
    ['小圆的半径为负', '[-4.75, -6.64, 1.32]', '[-4.75, -6.64, -1.32]'],
    ['小圆的圆心是 NaN', '[-4.75, -6.64, 1.32]', '[NaN, -6.64, 1.32]'],
    ['小圆少一个数', '[-4.75, -6.64, 1.32]', '[-4.75, -6.64]'],
    ['小圆与路径同时写', "role: 'accent', dots: [", "role: 'accent', d: 'M 0 0 L 1 1 Z', dots: ["],
    ['椭圆与路径同时写', "{ role: 'shine', ellipse: [0, -5, 12, 2.4, -2] }", "{ role: 'shine', d: 'M 0 0 L 1 1 Z', ellipse: [0, -5, 12, 2.4, -2] }"],
  ];
  for (const [name, from, to, message] of cases) {
    const out = join(dir, `out-${name}.swift`);
    const result = run([`--shapes=${modified(dir, from, to)}`, `--out=${out}`]);
    assert.equal(result.status, 2, `${name}：${result.stderr}`);
    assert.match(result.stderr, /gen-species/, name);
    if (message) assert.match(result.stderr, message, `${name}：应给出具体说明`);
    assert.ok(!existsSync(out), `${name}：不得写出半成品`);
  }
}));

test('生成物的内容：每种可用动物一项、路径只含安全字符、部件顺序与来源一致', () => {
  const text = readFileSync(committed, 'utf8');
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  assert.deepEqual([...text.matchAll(/^        \.(\w+): SpeciesSource\(/gm)].map(m => m[1]), animals, '动物及顺序');
  const paths = [...text.matchAll(/path: "([^"]*)"/g)].map(m => m[1]);
  assert.equal(paths.length, animals.reduce((n, id) => n + Shapes.expand(id).parts.length, 0), '部件总数');
  for (const p of paths) assert.match(p, /^[MLCQZ0-9 .\-]+$/, '路径只含 M/L/C/Q/Z、数字、空格、点、负号');
  const expected = animals.flatMap(id => Shapes.expand(id).parts.map(part => part.d));
  assert.deepEqual(paths, expected, '路径与来源逐个相同、顺序一致');
  assert.match(text, /^\/\/ 自动生成，请勿手改/, '文件头有“请勿手改”');
});

test('生成物里的转动数据：每个部件一项（没有转动就是 nil），转轴、角度与拍翼幅度和来源逐个一致', () => {
  const text = readFileSync(committed, 'utf8');
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  const expected = animals.flatMap(id => Shapes.expand(id).parts.map(part => (part.motion
    ? `SpeciesMotionSource(pivotX: ${Shapes.num(part.motion.pivot[0])}, pivotY: ${Shapes.num(part.motion.pivot[1])}, degrees: ${Shapes.num(part.motion.deg)}, squash: ${Shapes.num(part.motion.squash)})`
    : 'nil')));
  const got = [...text.matchAll(/motion: (SpeciesMotionSource\([^)]*\)|nil)\),/g)].map(match => match[1]);
  assert.deepEqual(got, expected);
  assert.ok(got.some(row => /squash: 0\.1\)$/.test(row)), '蝠鲼的拍翼幅度写进了生成物');
  assert.ok(got.some(row => /squash: 0\)$/.test(row)), '只转动不拍翼的部件写 squash: 0');
});

test('生成物里的嘴：只有侧视动物有 mouth 一项，四个点与来源逐个一致；俯视动物的生成物没有这一项（与加入微笑之前逐字相同）', () => {
  const text = readFileSync(committed, 'utf8');
  const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
  const starts = animals.map(id => text.indexOf(`        .${id}: SpeciesSource(`));
  assert.ok(starts.every(index => index >= 0), '每种动物都有一项');
  let withMouth = 0;
  animals.forEach((id, index) => {
    const block = text.slice(starts[index], index + 1 < animals.length ? starts[index + 1] : text.length);
    const mouth = Shapes.expand(id).mouth;
    if (!mouth) { assert.ok(!block.includes('mouth:'), `${id}：没有嘴就不写这一项`); return; }
    withMouth++;
    const expected = `mouth: [${mouth.map(point => `[${point.map(Shapes.num).join(', ')}]`).join(', ')}]`;
    assert.ok(block.includes(expected), `${id}：嘴的四个点应写成 ${expected}`);
    assert.equal(block.match(/mouth:/g).length, 1, `${id}：只写一次`);
    assert.match(block, /blush: \[[^\n]*\], mouth: \[\[[^\n]*\]\]\),\n/, `${id}：mouth 紧跟在 blush 之后、作为最后一项`);
  });
  assert.ok(withMouth >= 1, '至少有一种动物带嘴（鲸鲨）');
  assert.equal([...text.matchAll(/mouth:/g)].length, withMouth, '全文的 mouth 项数与有嘴的动物数相同');
});

test('生成物里的 accent：鲸鲨是一条含 60 个子路径的路径（每个圆一个 M），海龟是一条含 22 个子路径的细带网（每块一个 M），都与来源逐个对应', () => {
  const text = readFileSync(committed, 'utf8');
  const paths = [...text.matchAll(/role: \.accent, u: [^,]+, path: "([^"]*)"/g)].map(match => match[1]);
  assert.equal(paths.length, 2, '目前只有鲸鲨（斑点）与海龟（壳纹）用 accent');
  const dots = Shapes.SHAPES.whaleshark.parts.find(part => part.role === 'accent').dots;
  const spots = dots.map(([x, y, r]) => Shapes.ellipsePath(x, y, r, r)).join(' ');
  assert.ok(paths.includes(spots), '鲸鲨：逐个圆按来源顺序连接');
  assert.equal(spots.split('M').length - 1, dots.length, '每个小圆一个子路径');
  const seams = Shapes.expand('turtle').parts.find(part => part.role === 'accent').d;
  assert.ok(paths.includes(seams), '海龟：壳纹的路径与来源一致');
  assert.equal(seams.split('M').length - 1, 22, '17 条细带加 5 个小三角，每块一个子路径');
});
