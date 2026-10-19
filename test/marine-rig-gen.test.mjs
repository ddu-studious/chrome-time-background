// 生成器 desktop-reminder/gen-marine.mjs：入库的 marine-rig-data.swift 必须与 js/marine-rig-data.js（骨架唯一来源，水族馆画的也是它）一致；
// 骨架数据有问题（路径不合规、数值越界、引用了不存在的部件……）时生成器必须拒绝并且不写出半成品。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');
const generator = resolve(root, 'desktop-reminder/gen-marine.mjs');
const committed = resolve(root, 'desktop-reminder/marine-rig-data.swift');
const dataSource = readFileSync(resolve(root, 'js/marine-rig-data.js'), 'utf8');
const run = args => spawnSync(process.execPath, [generator, ...args], { encoding: 'utf8' });

function withTemp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-marine-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** 把来源里的一处文字替换掉，写成临时数据文件（--data= 指过去）；前提不成立就让测试失败，免得变异检查里“替换没发生”被当成通过。 */
const modified = (dir, from, to) => {
  assert.ok(dataSource.includes(from), `测试前提：骨架来源里应有 ${from}`);
  const file = join(dir, 'data.js');
  // 临时文件不在 js/ 里，相对 require 要改成绝对路径
  const requireLine = "require('./marine-rig.js')";
  assert.ok(dataSource.includes(requireLine), '测试前提：骨架来源里应有对 marine-rig.js 的相对 require');
  writeFileSync(file, dataSource.replace(requireLine, `require(${JSON.stringify(resolve(root, 'js/marine-rig.js'))})`).replace(from, to));
  return file;
};

test('入库的 marine-rig-data.swift 与骨架来源一致（--check 退出码 0）', () => {
  const result = run(['--check']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /生成物与来源一致/, '检查通过时要明说一致（而不是静默退出）');
});

test('重新生成到临时文件，与入库文件逐字节相同；检查模式不写任何文件', () => withTemp(dir => {
  const out = join(dir, 'data.swift');
  const result = run([`--out=${out}`]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /已写入/); assert.ok(result.stdout.includes(out), '成功信息要带上写到了哪里');
  assert.match(result.stdout, /4 种动物：hammer、manta、turtle、whaleshark/, '成功信息列出写入的动物');
  // 用 ok 而不是 equal：文件有近百 KB，不一致时 equal 会去算整份文本的差异，实测要几分钟，这里只需要知道“不一致”
  assert.ok(readFileSync(out, 'utf8') === readFileSync(committed, 'utf8'), '生成结果应与入库文件完全相同（不一致时运行 node desktop-reminder/gen-marine.mjs 重新生成并核对差异）');
  const absent = join(dir, 'absent.swift');
  assert.equal(run(['--check', `--out=${absent}`]).status, 1, '输出文件不存在也算不一致');
  assert.ok(!existsSync(absent), '--check 绝不写文件');
}));

test('骨架来源改了而没重新生成：--check 退出码 1，并提示怎么办', () => withTemp(dir => {
  const data = modified(dir, 'waves: 0.7, turn: 0.07', 'waves: 0.75, turn: 0.07');
  const result = run(['--check', `--data=${data}`]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /不一致/); assert.match(result.stderr, /gen-marine\.mjs/);
}));

test('骨架数据有问题：生成器拒绝（退出码 2）且不写出半成品', () => withTemp(dir => {
  const cases = [
    ['脊柱振幅越界', 'amp: [0.006, 0.07]', 'amp: [0.006, 0.5]', /bend\.amp 必须是两个 0…0\.2 的数/],
    ['脊柱振幅是 NaN', 'amp: [0.006, 0.07]', 'amp: [0.006, NaN]', /bend\.amp 必须是两个 0…0\.2 的数/],
    ['脊柱波数越界', 'waves: 0.7, turn: 0.07', 'waves: 9, turn: 0.07', /bend 的 pow\/waves\/turn 不合规/],
    ['图层路径不合规（未知命令）', "d: 'M -15 -5.4 C -17 -8.2,", "d: 'X -15 -5.4 C -17 -8.2,", /layer dorsal2：路径不合规/],
    ['图层路径含相对命令', "d: 'M -15 -5.4 C -17 -8.2,", "d: 'm -15 -5.4 C -17 -8.2,", /layer dorsal2：路径不合规/],
    ['图层路径含指数写法', '-19.6 -10.4, -22.6 -11.4', '-1.96e1 -10.4, -22.6 -11.4', /layer dorsal2：路径不合规/],
    ['图层颜色不是合法写法', "fill: '#2c4558'", "fill: 'red'", /layer dorsal2\.fill：颜色不合规 red/],
    ['引用没有登记的部件', "part: 'pelvic'", "part: 'ghost'", /part ghost 没有登记/],
    ['部件转动幅度越界', '{ pivot: [24, 5], deg: 6,', '{ pivot: [24, 5], deg: 120,', /转动幅度 deg 必须是 ±90 以内的有限数/],
  ];
  for (const [name, from, to, message] of cases) {
    const out = join(dir, `out-${name}.swift`);
    const result = run([`--data=${modified(dir, from, to)}`, `--out=${out}`]);
    assert.equal(result.status, 2, `${name}：${result.stderr}`);
    assert.match(result.stderr, /gen-marine/, name);
    assert.match(result.stderr, message, `${name}：应给出具体说明`);
    assert.ok(!existsSync(out), `${name}：不得写出半成品`);
  }
}));

test('生成物的内容：四种动物各一项、图层与部件顺序和展开结果一致、路径只含安全字符', () => {
  const text = readFileSync(committed, 'utf8');
  assert.match(text, /^\/\/ 自动生成，请勿手改/, '文件头有“请勿手改”');
  assert.deepEqual([...text.matchAll(/^        \.(\w+): MarineRigSource\(/gm)].map(m => m[1]), [...Data.IDS], '动物及顺序');
  const expanded = Data.IDS.map(id => Rig.expand(Data.source(id)));
  const ids = [...text.matchAll(/MarineLayerSource\(id: "([A-Za-z0-9~]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, expanded.flatMap(x => x.layers.map(layer => layer.id)), '图层 id 与展开结果逐个相同、顺序一致（顺序就是绘制顺序）');
  const paths = [...text.matchAll(/ d: "([^"]*)"/g)].map(m => m[1]);
  assert.equal(paths.length, ids.length, '每个图层一条路径');
  for (const d of paths) assert.match(d, /^[MLCQZ0-9 .\-]+$/, '路径只含 M/L/C/Q/Z、数字、空格、点、负号');
  assert.deepEqual(paths, expanded.flatMap(x => x.layers.map(layer => layer.d)), '路径与展开结果逐个相同');
  // 部件：每个动物登记的部件名（含镜像出来的 name~）逐个一致
  const partsPerAnimal = Data.IDS.map(id => Object.keys(Rig.expand(Data.source(id)).parts));
  const generatedParts = [...text.matchAll(/^                "([A-Za-z0-9~]+)": MarineFlapSource\(/gm)].map(m => m[1]);
  assert.deepEqual(generatedParts, partsPerAnimal.flat(), '部件名与展开结果逐个相同');
  // 镜像出来的图层必须真的存在（俯视动物的左右对称靠它；少了就是半只动物）
  assert.ok(ids.some(id => id.endsWith('~')), '展开后应有镜像图层（id 以 ~ 结尾）');
  assert.ok(generatedParts.some(name => name.endsWith('~')), '展开后应有镜像部件（名字以 ~ 结尾）');
});

test('生成物没有非有限数、没有科学计数法之外的怪写法：能被 Swift 直接解析成 Double 字面量', () => {
  const text = readFileSync(committed, 'utf8');
  assert.doesNotMatch(text, /NaN|Infinity|undefined|null/, '生成物里不能出现 NaN / Infinity / undefined / null');
  for (const m of text.matchAll(/(?:pivotX|pivotY|deg|lag|phase|freq|squash|squashPhase|ampHead|ampTail|pow|waves|turn|tail|snout|width|alpha|alpha): (-?[0-9.e+\-]+)/g)) {
    assert.ok(Number.isFinite(Number(m[1])), `数字 ${m[1]} 必须是有限值`);
  }
});
