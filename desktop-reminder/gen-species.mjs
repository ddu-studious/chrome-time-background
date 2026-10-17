// 生成 desktop-reminder/jelly-species-data.swift：把 js/jelly-species-shapes.js 里的动物形状（唯一来源）展开成 Swift 能直接编译的数据表。
//   node desktop-reminder/gen-species.mjs            重新生成（覆盖 jelly-species-data.swift）
//   node desktop-reminder/gen-species.mjs --check    只比较：生成物与入库文件不一致时退出码 1（test/jelly-species-gen.test.mjs 调用）
// 测试用参数：--shapes=<模块路径>（读取另一份形状数据）、--out=<输出路径>。
// 生成前先校验每个部件的路径都能被严格解析器解析、角色与视角合法；任何问题直接报错退出，不写出半成品。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const shapesPath = arg('shapes') ? (isAbsolute(arg('shapes')) ? arg('shapes') : resolve(process.cwd(), arg('shapes'))) : resolve(root, 'js/jelly-species-shapes.js');
const outPath = arg('out') ? (isAbsolute(arg('out')) ? arg('out') : resolve(process.cwd(), arg('out'))) : resolve(root, 'desktop-reminder/jelly-species-data.swift');
const check = process.argv.includes('--check');
const Shapes = createRequire(import.meta.url)(shapesPath);

const fail = message => { console.error(`gen-species: ${message}`); process.exit(2); };
const swiftNumber = value => {
  if (!Number.isFinite(value)) fail(`数字不是有限值：${value}`);
  return Shapes.num(value);
};
const swiftList = values => `[${values.map(swiftNumber).join(', ')}]`;

function sourceFor(id) {
  const raw = Shapes.SHAPES[id];
  if (!raw) fail(`${id} 没有形状数据`);
  raw.parts.forEach((part, index) => {
    if (typeof part.d === 'string' && !Shapes.parsePath(part.d)) fail(`${id} 第 ${index} 个部件的路径无法解析`);
    if (!part.d && !part.ellipse) fail(`${id} 第 ${index} 个部件既没有路径也没有椭圆`);
  });
  const shape = Shapes.expand(id);
  if (!shape) fail(`${id} 的形状数据不合规（椭圆参数或路径有问题）`);
  if (!Shapes.VIEWS.includes(shape.view)) fail(`${id} 的视角 ${shape.view} 不合法`);
  if (!(Number.isFinite(shape.scale) && shape.scale > 0)) fail(`${id} 的缩放不合法`);
  const parts = shape.parts.map((part, index) => {
    if (!Shapes.ROLES.includes(part.role)) fail(`${id} 第 ${index} 个部件的角色 ${part.role} 不合法`);
    if (!Shapes.parsePath(part.d)) fail(`${id} 第 ${index} 个部件的路径无法解析`);
    if (!/^[MLCQZ0-9 .\-]+$/.test(part.d)) fail(`${id} 第 ${index} 个部件的路径含有不该出现的字符`);
    const motion = part.motion ? `SpeciesMotionSource(pivotX: ${swiftNumber(part.motion.pivot[0])}, pivotY: ${swiftNumber(part.motion.pivot[1])}, degrees: ${swiftNumber(part.motion.deg)})` : 'nil';
    return `                SpeciesPartSource(role: .${part.role}, u: ${swiftNumber(part.u)}, path: "${part.d}", motion: ${motion}),`;
  });
  return [
    `        .${id}: SpeciesSource(`,
    `            view: .${shape.view}, scale: ${swiftNumber(shape.scale)},`,
    '            parts: [',
    ...parts,
    '            ],',
    `            eyeRadius: ${swiftNumber(shape.eyes.r)}, eyes: [${shape.eyes.at.map(swiftList).join(', ')}],`,
    `            blush: [${shape.blush.map(swiftList).join(', ')}]),`,
  ].join('\n');
}

const animals = Shapes.AVAILABLE.filter(id => id !== 'jelly');
const text = [
  '// 自动生成，请勿手改：node desktop-reminder/gen-species.mjs',
  '// 来源：js/jelly-species-shapes.js（唯一的形状来源；部件顺序即绘制顺序，mirror 与椭圆已展开成 M/L/C/Q/Z 绝对路径，未缩放、y 向下）。',
  '// 改形状只改来源文件然后重新生成；test/jelly-species-gen.test.mjs 检查本文件与来源一致，companion-selftest 对拍 Swift 解析与包围盒。',
  'enum JellySpeciesData {',
  '    static let sources: [JellySpecies: SpeciesSource] = [',
  animals.map(sourceFor).join('\n'),
  '    ]',
  '}',
  '',
].join('\n');

if (check) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  if (current === text) { console.log('gen-species: 生成物与来源一致'); process.exit(0); }
  console.error(`gen-species: ${outPath} 与 ${shapesPath} 不一致${current === null ? '（文件不存在）' : ''}，请运行 node desktop-reminder/gen-species.mjs 重新生成`);
  process.exit(1);
}
writeFileSync(outPath, text);
console.log(`gen-species: 已写入 ${outPath}（${animals.length} 种动物：${animals.join('、')}）`);
