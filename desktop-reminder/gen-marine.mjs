// 生成 desktop-reminder/marine-rig-data.swift：把 js/marine-rig-data.js 里四种写实海洋动物的骨架数据（唯一来源，水族馆画的也是它）
// 展开成 Swift 能直接编译的数据表。
//   node desktop-reminder/gen-marine.mjs            重新生成（覆盖 marine-rig-data.swift）
//   node desktop-reminder/gen-marine.mjs --check    只比较：生成物与入库文件不一致时退出码 1（test/marine-rig-gen.test.mjs 调用）
// 测试用参数：--data=<模块路径>（读取另一份骨架数据）、--out=<输出路径>。
// 生成的是 MarineRig.expand 的结果（校验过、镜像已展开成独立图层与部件、颜色已解析成 0…1）：Swift 只需要压平与求值，
// 不必再实现路径镜像与数据校验；每个图层的路径串都先用 MarineRig.compile 完整校验过（能压平、点数不超限），任何问题直接报错退出，不写出半成品。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const resolvePath = (value, fallback) => (value ? (isAbsolute(value) ? value : resolve(process.cwd(), value)) : fallback);
const dataPath = resolvePath(arg('data'), resolve(root, 'js/marine-rig-data.js'));
const outPath = resolvePath(arg('out'), resolve(root, 'desktop-reminder/marine-rig-data.swift'));
const check = process.argv.includes('--check');
const require_ = createRequire(import.meta.url);
const Rig = require_(resolve(root, 'js/marine-rig.js'));
const Data = require_(dataPath);

const fail = message => { console.error(`gen-marine: ${message}`); process.exit(2); };

/** 数字原样输出（JS 的最短往返表示，Swift 解析回同一个 Double）；-0 写成 0，非有限值直接报错。 */
const lit = value => {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`数字不是有限值：${value}`);
  return Object.is(value, -0) ? '0' : String(value);
};
const str = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9~]+$/.test(value)) fail(`标识符含有不该出现的字符：${value}`);
  return `"${value}"`;
};

function fillSource(fill) {
  if (!fill) return 'nil';
  if (fill.rgb) return `.flat(${lit(fill.rgb[0])}, ${lit(fill.rgb[1])}, ${lit(fill.rgb[2])})`;
  const stops = fill.stops.map(s => `[${s.map(lit).join(', ')}]`).join(', ');
  return `.gradient(ax: ${lit(fill.a[0])}, ay: ${lit(fill.a[1])}, bx: ${lit(fill.b[0])}, by: ${lit(fill.b[1])}, stops: [${stops}])`;
}

function strokeSource(stroke) {
  if (!stroke) return 'nil';
  return `MarineStrokeSource(r: ${lit(stroke.rgb[0])}, g: ${lit(stroke.rgb[1])}, b: ${lit(stroke.rgb[2])}, width: ${lit(stroke.width)}, alpha: ${lit(stroke.alpha)}, butt: ${stroke.cap === 'butt'})`;
}

function sourceFor(id) {
  const raw = Data.source(id);
  if (!raw) fail(`${id} 没有骨架数据`);
  let compiled;
  try { compiled = Rig.compile(raw); } catch (error) { fail(`${id} 的骨架数据不合规：${error.message}`); }
  const x = Rig.expand(raw);
  if (compiled.layers.length !== x.layers.length) fail(`${id} 展开与编译的图层数不一致`);
  const parts = Object.entries(x.parts).map(([name, f]) =>
    `                ${str(name)}: MarineFlapSource(pivotX: ${lit(f.pivot[0])}, pivotY: ${lit(f.pivot[1])}, deg: ${lit(f.deg)}, lag: ${lit(f.lag)}, phase: ${lit(f.phase)}, freq: ${lit(f.freq)}, squash: ${lit(f.squash)}, squashPhase: ${lit(f.squashPhase)}),`);
  const layers = x.layers.map(layer => {
    if (!/^[MLCQZ0-9 .\-]+$/.test(layer.d)) fail(`${id}/${layer.id} 的路径含有不该出现的字符`);
    const part = layer.part === undefined ? 'nil' : str(layer.part);
    return `                MarineLayerSource(id: ${str(layer.id)}, part: ${part}, d: "${layer.d}", fill: ${fillSource(layer.fill)}, stroke: ${strokeSource(layer.stroke)}, alpha: ${lit(layer.alpha)}, evenOdd: ${layer.rule === 'evenodd'}, lod: ${layer.lod}),`;
  });
  const b = x.bend;
  return [
    `        .${id}: MarineRigSource(`,
    `            view: .${x.view}, tail: ${lit(x.tail)}, snout: ${lit(x.snout)},`,
    `            bend: MarineBendSource(ampHead: ${lit(b.amp[0])}, ampTail: ${lit(b.amp[1])}, pow: ${lit(b.pow)}, waves: ${lit(b.waves)}, turn: ${lit(b.turn)}),`,
    '            parts: [',
    ...parts,
    '            ],',
    '            layers: [',
    ...layers,
    '            ]),',
  ].join('\n');
}

const ids = Data.IDS.slice();
if (!ids.length) fail('没有任何动物');
const text = [
  '// 自动生成，请勿手改：node desktop-reminder/gen-marine.mjs',
  '// 来源：js/marine-rig-data.js（唯一的骨架来源，水族馆画的也是它）经 MarineRig.expand 展开：镜像已变成独立图层与部件，颜色已解析成 0…1，',
  '// 路径是 M/L/C/Q/Z 绝对路径（y 向下，体长 100 单位）。改形状只改来源文件然后重新生成；test/marine-rig-gen.test.mjs 检查本文件与来源一致，',
  '// companion-selftest 与 marine-rig-parity 把 Swift 的压平与求值同 JS 逐点对拍。',
  'enum MarineRigData {',
  '    static let sources: [JellySpecies: MarineRigSource] = [',
  ids.map(sourceFor).join('\n'),
  '    ]',
  '}',
  '',
].join('\n');

if (check) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
  if (current === text) { console.log('gen-marine: 生成物与来源一致'); process.exit(0); }
  console.error(`gen-marine: ${outPath} 与 ${dataPath} 不一致${current === null ? '（文件不存在）' : ''}，请运行 node desktop-reminder/gen-marine.mjs 重新生成`);
  process.exit(1);
}
writeFileSync(outPath, text);
console.log(`gen-marine: 已写入 ${outPath}（${ids.length} 种动物：${ids.join('、')}）`);
