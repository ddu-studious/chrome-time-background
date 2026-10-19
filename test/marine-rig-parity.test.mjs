// 写实海洋动物骨架的 JS↔Swift 对拍：同一份骨架数据（js/marine-rig-data.js → 生成的 marine-rig-data.swift），
// 在同一批姿态下，JS 的 MarineRig.evaluate 与桌面端 marine-rig.swift 的 MarineRigEvaluator.evaluate 必须得到同样的绘制步骤、
// 同样的坐标（取整到 1e-4）、同样的颜料与包围盒——桌面与水族馆画的才是“同一只”动物。
// 对拍工具 desktop-reminder/marine-rig-parity.swift 只用产品的纯逻辑文件（不含 AppKit），按需编译，不创建窗口。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Rig = require('../js/marine-rig.js');
const Data = require('../js/marine-rig-data.js');
const xcrun = '/usr/bin/xcrun';
const canCompile = process.platform === 'darwin' && existsSync(xcrun);

// 桌面上的体长（点）：产品取值，与 marine-rig.swift 的 JellySpecies.rigBodyLength 一致
const BODY_LENGTH = { hammer: 70, manta: 74, turtle: 64, whaleshark: 84 };
const SOURCES = ['countdown-model', 'jelly-model', 'jelly-swim', 'jelly-palette', 'jelly-appearance', 'jelly-species', 'jelly-species-data', 'marine-rig', 'marine-rig-data'];

/** 这一批姿态：每种动物 12 个相位 × 3 个幅度 × 3 个转弯 × 2 个细节档（只比摘要），再加几个逐点比较的姿态与几个精确公式的姿态。 */
function buildCases() {
  const cases = [];
  for (const species of Data.IDS) {
    for (let i = 0; i < 12; i++) for (const amp of [0, 0.37, 1]) for (const turn of [-1, 0, 0.5]) for (const lod of [0, 2]) {
      cases.push({ species, phase: Math.PI * 2 * i / 12 + 0.1, amp, turn, lod, detail: false });
    }
    for (const [phase, amp, turn, lod] of [[0, 1, 0, 0], [1.3, 0.6, 0.4, 0], [4.9, 1, -1, 1], [2.2, 0.2, 1, 2], [6.1, 1, 0, 2]]) {
      cases.push({ species, phase, amp, turn, lod, detail: true });
    }
    for (const [phase, amp, turn, lod] of [[0.7, 1, 0, 2], [3.3, 0.5, -1, 2]]) cases.push({ species, phase, amp, turn, lod, detail: true, exact: true });
  }
  cases.push({ species: 'jelly', detail: false });
  return cases;
}

const TOLERANCE = 1.5e-4;      // 取整到 1e-4：两边的三角函数若在末位差 1 ulp，个别坐标会落在另一侧进位，所以容许一个取整步长

let output = null;
function swiftOutput() {
  if (output) return output;
  const dir = mkdtempSync(join(tmpdir(), 'marine-parity-'));
  try {
    copyFileSync(resolve(root, 'desktop-reminder/marine-rig-parity.swift'), join(dir, 'main.swift'));
    const exe = join(dir, 'parity');
    execFileSync(xcrun, ['swiftc', ...SOURCES.map(name => resolve(root, `desktop-reminder/${name}.swift`)), join(dir, 'main.swift'), '-module-cache-path', join(dir, 'cache'), '-o', exe], { stdio: 'pipe' });
    const cases = buildCases();
    const file = join(dir, 'cases.json');
    writeFileSync(file, JSON.stringify(cases));
    output = { cases, results: JSON.parse(execFileSync(exe, [file], { encoding: 'utf8', maxBuffer: 1 << 30 })) };
    return output;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function compare(js, sw, label, stats) {
  assert.equal(sw.ops.length, js.ops.length, `${label}：绘制步骤数 Swift ${sw.ops.length} 与 JS ${js.ops.length} 不一致`);
  js.ops.forEach((a, k) => {
    const b = sw.ops[k];
    assert.ok(a.k === b.k && a.id === b.id, `${label}：第 ${k} 步 JS ${a.k}/${a.id} 与 Swift ${b.k}/${b.id} 不一致`);
    if (b.polys) {
      assert.equal(b.polys.length, a.polys.length, `${label}/${a.id}：子路径数`);
      a.polys.forEach((p, pi) => {
        const q = b.polys[pi];
        assert.ok(p.closed === q.closed && p.pts.length === q.pts.length, `${label}/${a.id}[${pi}]：闭合标记与点数`);
        for (let i = 0; i < p.pts.length; i++) stats.maxPoint = Math.max(stats.maxPoint, Math.abs(p.pts[i] - q.pts[i]));
      });
      if (a.k === 'fill') {
        assert.equal(b.rule, a.rule, `${label}/${a.id}：填充规则`);
        if (a.paint.rgba) {
          assert.ok(b.paint?.rgba, `${label}/${a.id}：纯色填充两边都应是纯色`);
          for (let i = 0; i < 4; i++) stats.maxPaint = Math.max(stats.maxPaint, Math.abs(a.paint.rgba[i] - b.paint.rgba[i]));
        } else {
          assert.ok(b.paint?.grad, `${label}/${a.id}：渐变填充两边都应是渐变`);
          for (let i = 0; i < 2; i++) stats.maxPaint = Math.max(stats.maxPaint, Math.abs(a.paint.grad.a[i] - b.paint.grad.a[i]), Math.abs(a.paint.grad.b[i] - b.paint.grad.b[i]));
          assert.equal(b.paint.grad.stops.length, a.paint.grad.stops.length, `${label}/${a.id}：色标个数`);
          a.paint.grad.stops.forEach((stop, si) => stop.forEach((v, vi) => { stats.maxPaint = Math.max(stats.maxPaint, Math.abs(v - b.paint.grad.stops[si][vi])); }));
        }
      } else {
        assert.equal(b.cap, a.cap, `${label}/${a.id}：线帽`);
        stats.maxPaint = Math.max(stats.maxPaint, Math.abs(a.width - b.width), ...a.rgba.map((v, i) => Math.abs(v - b.rgba[i])));
      }
    } else {
      // 摘要：点数、闭合子路径数、坐标和（每点平均）
      const n = a.polys.reduce((s, p) => s + p.pts.length / 2, 0);
      assert.equal(b.n, n, `${label}/${a.id}：点数`);
      assert.equal(b.closed, a.polys.filter(p => p.closed).length, `${label}/${a.id}：闭合子路径数`);
      const sx = a.polys.reduce((s, p) => s + p.pts.reduce((t, v, i) => t + (i % 2 === 0 ? v : 0), 0), 0);
      const sy = a.polys.reduce((s, p) => s + p.pts.reduce((t, v, i) => t + (i % 2 === 1 ? v : 0), 0), 0);
      stats.maxSum = Math.max(stats.maxSum, Math.abs(sx - b.sx) / n, Math.abs(sy - b.sy) / n);
    }
  });
  // 精确公式的参考实现（evaluateExact）只返回绘制步骤，没有包围盒；站位表版两边都有
  if (js.bounds) {
    const jb = js.bounds, sb = sw.bounds;
    assert.ok(sb, `${label}：Swift 也应有包围盒`);
    stats.maxBounds = Math.max(stats.maxBounds, Math.abs(jb.minX - sb[0]), Math.abs(jb.minY - sb[1]), Math.abs(jb.maxX - sb[2]), Math.abs(jb.maxY - sb[3]));
    stats.boundsCompared++;
  }
}

test('Swift 与 JS 的求值逐点一致（四种动物 × 216 个姿态的摘要、5 个姿态的逐点坐标与颜料、2 个精确公式姿态）', { skip: canCompile ? false : '需要 macOS 与 Xcode 命令行工具', timeout: 180000 }, () => {
  const { cases, results } = swiftOutput();
  assert.equal(results.length, cases.length, 'Swift 应对每个用例各输出一项');
  const rigs = Object.fromEntries(Data.IDS.map(id => [id, Rig.compile(Data.source(id))]));
  const stats = { maxPoint: 0, maxPaint: 0, maxSum: 0, maxBounds: 0, boundsCompared: 0 };
  let detailed = 0, exactCases = 0, summaries = 0;
  cases.forEach((c, index) => {
    const sw = results[index];
    if (c.species === 'jelly') { assert.equal(sw.ok, false, '水母没有写实骨架'); return; }
    assert.equal(sw.ok, true, `${c.species}：Swift 应有写实骨架`);
    const pose = { phase: c.phase, amp: c.amp, turn: c.turn, lod: c.lod };
    const js = c.exact ? Rig.evaluateExact(rigs[c.species], pose) : Rig.evaluate(rigs[c.species], pose);
    compare(js, sw, `${c.species}@${index}${c.exact ? '（精确公式）' : ''}`, stats);
    if (c.detail) detailed++; else summaries++;
    if (c.exact) exactCases++;
  });
  assert.equal(summaries, Data.IDS.length * 216, '摘要姿态个数');
  assert.equal(detailed, Data.IDS.length * 7, '逐点姿态个数');
  assert.equal(exactCases, Data.IDS.length * 2, '精确公式姿态个数');
  assert.ok(stats.maxPoint <= TOLERANCE, `逐点坐标最大差 ${stats.maxPoint} 超过 ${TOLERANCE}`);
  assert.ok(stats.maxPaint <= TOLERANCE, `颜料最大差 ${stats.maxPaint} 超过 ${TOLERANCE}`);
  assert.ok(stats.maxSum <= TOLERANCE, `坐标和（每点平均）最大差 ${stats.maxSum} 超过 ${TOLERANCE}`);
  assert.ok(stats.maxBounds <= TOLERANCE, `包围盒最大差 ${stats.maxBounds} 超过 ${TOLERANCE}`);
  assert.equal(stats.boundsCompared, cases.length - 1 - exactCases, '除水母与精确公式姿态外，每个姿态都比较了包围盒');
  console.log(`# 对拍：逐点坐标最大差 ${stats.maxPoint}，颜料 ${stats.maxPaint}，坐标和 ${stats.maxSum}，包围盒 ${stats.maxBounds}（容许 ${TOLERANCE}）`);
});

test('桌面写实几何：体长换算、并集与 JS 的 unionBounds 一致，并装得进窗口', { skip: canCompile ? false : '需要 macOS 与 Xcode 命令行工具', timeout: 180000 }, () => {
  const { results } = swiftOutput();
  for (const id of Data.IDS) {
    const sw = results.find(item => item.species === id);
    assert.equal(sw.bodyLength, BODY_LENGTH[id], `${id}：桌面体长`);
    const rig = Rig.compile(Data.source(id));
    const span = rig.snout - rig.tail;
    assert.ok(Math.abs(sw.unit - BODY_LENGTH[id] / span) < 1e-12, `${id}：unit = 体长 ÷ 骨架长度`);
    // JS 的并集用同样的相位与转弯采样（12 × {-1, 0, 1}，满幅、lod 0）；骨架坐标 y 向下，桌面几何 y 向上
    const u = Rig.unionBounds(rig, 12);
    assert.ok(u, `${id}：JS 应能算出并集`);
    const expected = [u.minX * sw.unit, -u.maxY * sw.unit, (u.maxX - u.minX) * sw.unit, (u.maxY - u.minY) * sw.unit];
    sw.union.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-3, `${id}：并集第 ${i} 项 Swift ${value} 与 JS ${expected[i]}`));
    const [, , width, height] = sw.union;
    assert.ok(height <= 88 && width <= 100, `${id}：并集 ${width.toFixed(1)} × ${height.toFixed(1)} pt 装得进窗口（动物上方 91 pt 的空间，底边至少留 3 pt）`);
    assert.ok(Math.max(width, height) >= 76 && Math.max(width, height) <= 92, `${id}：最长的一边在批准的 76–92 pt 里`);
  }
});
