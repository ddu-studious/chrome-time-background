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
});

test('重新生成到临时文件，与入库文件逐字节相同；检查模式不写任何文件', () => withTemp(dir => {
  const out = join(dir, 'data.swift');
  const result = run([`--out=${out}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(out, 'utf8'), readFileSync(committed, 'utf8'), '生成结果应与入库文件完全相同');
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
    ['路径解析不了（缺数字）', "'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z'", "'M 10 -7 L -2'"],
    ['路径含相对命令', "'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z'", "'M 10 -7 l -2 -25 Z'"],
    ['角色不合法', "role: 'body', d: 'M 24 -8", "role: 'torso', d: 'M 24 -8"],
    ['视角不合法', "view: 'top'", "view: 'front'"],
    ['缩放不合法', 'scale: 0.89', 'scale: 0'],
    // 数字不是有限值：写进 Swift 会变成编译不过的 NaN/Infinity（或者悄悄画出怪东西），必须在生成时拒绝
    ['眼睛半径是 NaN', 'eyes: { r: 2.2', 'eyes: { r: NaN'],
    ['腮红位置是 NaN', 'blush: [[30, -10, 2.6, 1.8]', 'blush: [[30, NaN, 2.6, 1.8]'],
    ['摆动角度是 NaN', 'deg: 12', 'deg: NaN'],
    ['转动支点是无穷', 'pivot: [-28, 0]', 'pivot: [-28, Infinity]'],
    ['部件的取色位置 u 是 NaN', 'u: 0.57', 'u: NaN'],
    // 椭圆参数缺失会得到无法解析的路径；这条要由“展开失败”的防线拦住（不能让它崩在后面，退出码不是 2）
    ['椭圆缺少纵向半径', 'ellipse: [0, -5, 12, 2.4, -2]', 'ellipse: [0, -5, 12]'],
    ['部件既没有路径也没有椭圆', "{ role: 'shine', ellipse: [0, -5, 12, 2.4, -2] }", "{ role: 'shine' }"],
    ['路径用了指数写法', "'M 24 -8 C 10 -9", "'M 24 -8 C 1e1 -9"],
  ];
  for (const [name, from, to] of cases) {
    const out = join(dir, `out-${name}.swift`);
    const result = run([`--shapes=${modified(dir, from, to)}`, `--out=${out}`]);
    assert.equal(result.status, 2, `${name}：${result.stderr}`);
    assert.match(result.stderr, /gen-species/, name);
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
