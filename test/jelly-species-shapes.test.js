// 桌面动物形状数据（js/jelly-species-shapes.js）：路径解析的严格性、镜像与椭圆展开、原生坐标换算、包围盒、数据合规与放置余量。
// Swift 一侧的解析器与包围盒由 companion-selftest.swift 编译运行，Node 在 test/desktop-companion-logic.test.mjs 里逐点对拍。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../js/jelly-species-shapes.js');
const A = require('../js/jelly-appearance.js');
const { VALID, BAD, CURVES } = require('./fixtures/species-path-cases.js');   // 与 Swift 解析器对照用的同一份用例（见 test/desktop-companion-logic.test.mjs）

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const cmdsOf = d => { const out = S.parsePath(d); assert.ok(out, `应能解析：${d}`); return out; };
// 临时装入一种合成形状（只在 fn 里存在）：用来检查数据表里的动物碰不到的分支（mirror 带转动、非零转轴、曲线弧顶……）
const BLANK = { view: 'side', scale: 1, eyes: { r: 1, at: [[0, 0]] }, blush: [] };
const withShape = (shape, fn) => { S.SHAPES.__synthetic = { ...BLANK, ...shape }; try { return fn('__synthetic'); } finally { delete S.SHAPES.__synthetic; } };

test('可用物种：水母永远可用，其余是有形状数据的动物；顺序与设置里的物种列表一致，且都是已知物种', () => {
  assert.equal(S.AVAILABLE[0], 'jelly');
  assert.deepEqual(S.AVAILABLE.slice(1), Object.keys(S.SHAPES));
  assert.ok(Object.isFrozen(S.AVAILABLE));
  for (const id of S.AVAILABLE) assert.ok(A.SPECIES.includes(id), `${id} 必须是设置里的物种`);
  const order = S.AVAILABLE.map(id => A.SPECIES.indexOf(id));
  assert.deepEqual(order, [...order].sort((x, y) => x - y), '可用物种按设置里的物种顺序排列');
  assert.ok(!('jelly' in S.SHAPES), '水母是过程式画法，不在形状数据里');
  assert.equal(S.expand('jelly'), null); assert.equal(S.native('jelly'), null); assert.equal(S.bounds('jelly'), null); assert.equal(S.union('jelly'), null);
  for (const bad of ['shark', '', null, undefined, 3, '__proto__', 'constructor', 'toString']) assert.equal(S.expand(bad), null, `未知物种 ${String(bad)}`);
});

test('parsePath：合规输入逐命令还原', () => {
  const cmds = cmdsOf('M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Q 1.5 2.25 3 4 Z');
  assert.deepEqual(cmds.map(c => c.cmd), ['M', 'L', 'C', 'Q', 'Z']);
  assert.deepEqual(cmds[0].pts, [[10, -7]]);
  assert.deepEqual(cmds[2].pts, [[-6, -22], [-8, -14], [-9, -6]]);
  assert.deepEqual(cmds[3].pts, [[1.5, 2.25], [3, 4]]);
  assert.deepEqual(cmds[4].pts, []);
  assert.deepEqual(cmdsOf('M 0 0 L 1 1 Z M 5 5 L 6 6 Z').map(c => c.cmd), ['M', 'L', 'Z', 'M', 'L', 'Z'], 'Z 之后可以再开子路径');
  assert.deepEqual(cmdsOf('M\t1\n2  L   3\r\n4').map(c => c.pts[0]), [[1, 2], [3, 4]], '空白只认空格、制表、换行');
  assert.deepEqual(cmdsOf('M -0 0.5')[0].pts[0], [-0, 0.5]);
});

test('parsePath：任何不合规的输入返回 null（相对命令、小写、其他命令、隐式重复、坏数字、空输入、过长、过多命令）', () => {
  for (const [name, input] of BAD) assert.equal(S.parsePath(input), null, name);
  assert.ok(S.parsePath('M 0 0 ' + 'L 1 1 '.repeat(S.MAX_COMMANDS - 1)), '命令数刚好在上限内可以解析');
  for (const input of VALID) assert.ok(S.parsePath(input), `合规用例应能解析：${input.slice(0, 40)}`);
});

test('ellipsePath：四段三次贝塞尔、闭合；包围盒与解析公式相符（含旋转）', () => {
  const cmds = cmdsOf(S.ellipsePath(3, -2, 12, 4));
  assert.deepEqual(cmds.map(c => c.cmd), ['M', 'C', 'C', 'C', 'C', 'Z']);
  assert.deepEqual(cmds[0].pts[0], [15, -2], '起点在右端点');
  assert.deepEqual(cmds[4].pts[2], [15, -2], '终点回到起点（闭合）');
  // 独立取样：任意旋转下，椭圆包围盒半宽 = sqrt(rx²cos²θ + ry²sin²θ)，半高 = sqrt(rx²sin²θ + ry²cos²θ)
  for (const deg of [0, 30, -2, 90, 137]) {
    const rx = 12, ry = 2.4, theta = deg * Math.PI / 180;
    const c = cmdsOf(S.ellipsePath(0, 0, rx, ry, deg));
    let cur = c[0].pts[0], minX = cur[0], maxX = cur[0], minY = cur[1], maxY = cur[1];
    for (const seg of c.slice(1)) {
      if (seg.cmd !== 'C') continue;
      for (let i = 1; i <= 64; i++) {
        const t = i / 64, s = 1 - t, p = seg.pts;
        const x = s ** 3 * cur[0] + 3 * s * s * t * p[0][0] + 3 * s * t * t * p[1][0] + t ** 3 * p[2][0];
        const y = s ** 3 * cur[1] + 3 * s * s * t * p[0][1] + 3 * s * t * t * p[1][1] + t ** 3 * p[2][1];
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      cur = seg.pts[2];
    }
    const halfW = Math.sqrt(rx * rx * Math.cos(theta) ** 2 + ry * ry * Math.sin(theta) ** 2), halfH = Math.sqrt(rx * rx * Math.sin(theta) ** 2 + ry * ry * Math.cos(theta) ** 2);
    assert.ok(Math.abs(maxX - halfW) < 0.02 && Math.abs(minX + halfW) < 0.02, `旋转 ${deg}° 的半宽 ${halfW.toFixed(3)}，实际 [${minX.toFixed(3)}, ${maxX.toFixed(3)}]`);
    assert.ok(Math.abs(maxY - halfH) < 0.02 && Math.abs(minY + halfH) < 0.02, `旋转 ${deg}° 的半高 ${halfH.toFixed(3)}，实际 [${minY.toFixed(3)}, ${maxY.toFixed(3)}]`);
  }
});

test('mirrorPath：命令结构不变，y 全部取反，x 不变；镜像两次回到原路径', () => {
  const d = 'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Q 1.5 2.25 3 4 Z';
  const once = S.mirrorPath(d);
  const a = cmdsOf(d), b = cmdsOf(once);
  assert.deepEqual(b.map(c => c.cmd), a.map(c => c.cmd));
  a.forEach((c, i) => c.pts.forEach((p, k) => { assert.equal(b[i].pts[k][0], p[0]); assert.ok(near(b[i].pts[k][1], -p[1])); }));
  assert.deepEqual(cmdsOf(S.mirrorPath(once)).map(c => c.pts), a.map(c => c.pts), '镜像两次等于原路径');
  assert.ok(!/-0\b/.test(S.mirrorPath('M 1 0 L 2 0 Z')), 'y=0 取反不产生 -0');
});

test('expand：mirror 紧跟原部件、共享角色与取色位置；motion 的 pivot 取反、角度反号；全部路径都能被解析', () => {
  for (const id of Object.keys(S.SHAPES)) {
    const shape = S.SHAPES[id], out = S.expand(id);
    assert.equal(out.view, shape.view); assert.equal(out.scale, shape.scale);
    assert.equal(out.parts.length, shape.parts.length + shape.parts.filter(p => p.mirror).length, `${id} 部件数 = 原部件 + 镜像`);
    let cursor = 0;
    for (const part of shape.parts) {
      const base = out.parts[cursor++];
      assert.equal(base.role, part.role); assert.equal(base.u, part.u === undefined ? 0.5 : part.u);
      assert.ok(S.parsePath(base.d), `${id}/${part.role} 的路径可解析`);
      if (part.mirror) {
        const twin = out.parts[cursor++];
        assert.equal(twin.role, base.role); assert.equal(twin.u, base.u);
        const a = cmdsOf(base.d), b = cmdsOf(twin.d);
        a.forEach((c, i) => c.pts.forEach((p, k) => assert.ok(near(b[i].pts[k][1], -p[1]) && b[i].pts[k][0] === p[0], `${id} 镜像点 ${i}/${k}`)));
        if (base.motion) { assert.deepEqual(twin.motion.pivot, [base.motion.pivot[0], -base.motion.pivot[1]]); assert.equal(twin.motion.deg, -base.motion.deg); }
        else assert.equal(twin.motion, null);
      }
    }
  }
  // 展开不改源数据（不共享引用）
  const before = JSON.stringify(S.SHAPES.hammer);
  const out = S.expand('hammer'); out.parts.find(part => part.motion).motion.pivot[0] = 999; out.eyes.at[0][0] = 999; out.blush[0][0] = 999;
  assert.equal(JSON.stringify(S.SHAPES.hammer), before);
});

test('数据不合规时不抛异常：mirrorPath 与 expand 返回 null（由生成器报告具体问题）', () => {
  assert.equal(S.mirrorPath('M 1'), null);
  assert.equal(S.mirrorPath('l 1 1'), null);
  const bad = { view: 'top', scale: 1, eyes: { r: 1, at: [] }, blush: [] };
  const attempts = {
    __badPath: { ...bad, parts: [{ role: 'body', d: 'M 1', mirror: true }] },
    __badSecond: { ...bad, parts: [{ role: 'body', d: 'M 0 0 L 1 1 Z' }, { role: 'limb', d: 'M 0 0 L' }] },
    __badEllipse: { ...bad, parts: [{ role: 'body', ellipse: [0, 0, NaN, 1, 0] }] },
  };
  try {
    for (const [id, shape] of Object.entries(attempts)) { S.SHAPES[id] = shape; assert.equal(S.expand(id), null, id); assert.equal(S.native(id), null, id); assert.equal(S.bounds(id), null, id); assert.equal(S.union(id), null, id); }
  } finally { for (const id of Object.keys(attempts)) delete S.SHAPES[id]; }
  assert.deepEqual(Object.keys(S.SHAPES), S.AVAILABLE.slice(1), '测试没有留下临时数据');
});

test('形状数据合规：视角、缩放、角色、取色位置、转动、眼睛与腮红都在合理范围内', () => {
  for (const [id, shape] of Object.entries(S.SHAPES)) {
    assert.ok(S.VIEWS.includes(shape.view), `${id} 视角`);
    assert.ok(isFinite(shape.scale) && shape.scale >= 0.3 && shape.scale <= 2, `${id} 缩放`);
    assert.ok(shape.parts.length >= 2 && shape.parts.length <= 40, `${id} 部件数`);
    assert.ok(shape.parts.some(p => p.role === 'body'), `${id} 至少有一个躯干部件（渐变与光晕按它定位）`);
    for (const part of shape.parts) {
      assert.ok(S.ROLES.includes(part.role), `${id} 角色 ${part.role}`);
      assert.equal(Number(!!part.d) + Number(!!part.ellipse), 1, `${id} 每个部件有且只有 d 或 ellipse 之一`);
      if (part.ellipse) assert.ok(part.ellipse.length === 5 && part.ellipse.every(Number.isFinite) && part.ellipse[2] > 0 && part.ellipse[3] > 0, `${id} 椭圆参数`);
      if (part.u !== undefined) { assert.equal(part.role, 'limb', `${id} 只有肢体需要取色位置`); assert.ok(part.u >= 0 && part.u <= 1); }
      if (part.motion) {
        assert.equal(part.motion.pivot.length, 2); assert.ok(part.motion.pivot.every(Number.isFinite));
        assert.ok(Number.isFinite(part.motion.deg) && Math.abs(part.motion.deg) <= 45, `${id} 转动角度不超过 45°`);
      }
      if (part.mirror !== undefined) assert.equal(part.mirror, true);
    }
    assert.ok(shape.eyes.r > 0.5 && shape.eyes.r <= 4 && shape.eyes.at.length >= 1 && shape.eyes.at.length <= 2, `${id} 眼睛`);
    for (const p of shape.eyes.at) assert.ok(p.length === 2 && p.every(Number.isFinite));
    for (const b of shape.blush) assert.ok(b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0, `${id} 腮红`);
    assert.ok(shape.blush.length <= 2);
  }
});

test('native：按缩放换算并把 y 翻成向上；转动角换成 CoreGraphics 方向（逆时针为正）与弧度', () => {
  const k = S.SHAPES.hammer.scale;
  const out = S.native('hammer'), raw = S.expand('hammer');
  assert.equal(out.parts.length, raw.parts.length);
  out.parts.forEach((part, i) => {
    const cmds = cmdsOf(raw.parts[i].d);
    cmds.forEach((c, j) => c.pts.forEach((p, m) => { assert.ok(near(part.cmds[j].pts[m][0], p[0] * k) && near(part.cmds[j].pts[m][1], -p[1] * k)); }));
    if (raw.parts[i].motion) {
      assert.ok(near(part.motion.pivot[0], raw.parts[i].motion.pivot[0] * k) && near(part.motion.pivot[1], -raw.parts[i].motion.pivot[1] * k));
      assert.ok(near(part.motion.maxAngle, -raw.parts[i].motion.deg * Math.PI / 180), 'SVG 顺时针为正 → CoreGraphics 逆时针为正，角度反号');
    } else assert.equal(part.motion, null);
  });
  assert.ok(near(out.eyes.r, S.SHAPES.hammer.eyes.r * k));
  out.eyes.at.forEach((p, i) => assert.ok(near(p[0], S.SHAPES.hammer.eyes.at[i][0] * k) && near(p[1], -S.SHAPES.hammer.eyes.at[i][1] * k)));
});

test('bounds / union：有限；wave=0 与解析值一致；并集包含每个相位；转动只在有 motion 的部件上生效', () => {
  for (const id of Object.keys(S.SHAPES)) {
    const zero = S.bounds(id, 0), all = S.union(id);
    for (const box of [zero, all]) assert.ok(Object.values(box).every(Number.isFinite) && box.maxX > box.minX && box.maxY > box.minY, `${id} 包围盒有限且非空`);
    for (const wave of S.WAVES) {
      const box = S.bounds(id, wave);
      assert.ok(box.minX >= all.minX - 1e-9 && box.maxX <= all.maxX + 1e-9 && box.minY >= all.minY - 1e-9 && box.maxY <= all.maxY + 1e-9, `${id} 并集包含 wave=${wave}`);
    }
    assert.deepEqual(S.bounds(id), zero, '默认相位是 0');
  }
  // 小锤头鲨：鳍尖（y=±25）与锤头最前端（x=36）决定静止包围盒，缩放 0.89；尾鳍的转动只改变左侧
  const k = S.SHAPES.hammer.scale, still = S.bounds('hammer', 0), swing = S.bounds('hammer', 1);
  assert.ok(near(still.maxX, 36 * k, 0.05), `最前端 ${still.maxX}`);
  assert.ok(near(still.maxY, 25 * k, 0.05) && near(still.minY, -25 * k, 0.05), `鳍尖 ${still.minY}…${still.maxY}`);
  assert.equal(swing.maxX, still.maxX, '转动只影响尾鳍，前端不变');
  assert.ok(swing.minX < still.minX - 1, '尾鳍摆到极限，左侧更靠外');
  const u = S.union('hammer');
  assert.ok(u.minX <= swing.minX + 1e-9, '并集覆盖尾鳍摆动');
});

test('parsePath：长度上限按字符数卡在边界上（与命令数上限互相独立）', () => {
  const head = 'M 0 0 L 0.', tail = ' 0';
  const exact = head + '0'.repeat(S.MAX_PATH_CHARS - head.length - tail.length) + tail;
  assert.equal(exact.length, S.MAX_PATH_CHARS);
  assert.ok(S.parsePath(exact), '刚好等于上限的合规路径可以解析');
  assert.equal(S.parsePath(exact + ' '), null, '多一个字符就超限（命令数远没到上限，只能是长度在拦）');
  assert.equal(S.parsePath(head + '0'.repeat(S.MAX_PATH_CHARS) + tail), null);
});

test('expand：mirror 的部件带转动时，镜像的转轴 y 取反、角度反号，路径各点 y 取反（合成形状）', () => withShape({ parts: [{ role: 'limb', u: 0.2, mirror: true, d: 'M 0 0 L 4 1 L 4 3 Z', motion: { pivot: [2, 5], deg: 10 } }] }, id => {
  const out = S.expand(id);
  assert.equal(out.parts.length, 2);
  assert.deepEqual(out.parts[0].motion, { pivot: [2, 5], deg: 10 });
  assert.deepEqual(out.parts[1].motion, { pivot: [2, -5], deg: -10 });
  assert.equal(out.parts[1].d, 'M 0 0 L 4 -1 L 4 -3 Z');
  assert.equal(out.parts[1].role, 'limb'); assert.equal(out.parts[1].u, 0.2);
}));

test('native：转轴、眼睛、腮红都按缩放换算并把 y 翻成向上（合成形状，数值全是非零，缩放 0.5）', () => withShape({
  scale: 0.5, parts: [{ role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [4, 6], deg: 20 } }], eyes: { r: 3, at: [[10, 20], [-6, 8]] }, blush: [[2, 4, 6, 8], [-2, -4, 10, 12]],
}, id => {
  const out = S.native(id), part = out.parts[0];
  assert.deepEqual(part.motion.pivot, [2, -3]);
  assert.ok(near(part.motion.maxAngle, -20 * Math.PI / 180));
  assert.deepEqual(part.cmds.map(c => c.pts), [[[0, -0]], [[4, -0]], [[4, -2]], []]);
  assert.equal(out.eyes.r, 1.5);
  assert.deepEqual(out.eyes.at, [[5, -10], [-3, -4]]);
  assert.deepEqual(out.blush, [[1, -2, 3, 4], [-1, 2, 5, 6]]);
}));

test('取样：贝塞尔的弧顶、末端、连续曲线按公式取到（合成形状：包围盒由曲线内部与末端决定）', () => {
  const boxOf = (d, extra = {}) => withShape({ parts: [{ role: 'body', d, ...extra }] }, id => S.bounds(id, 0));
  // 三次曲线 M 0 0 C 0 10 10 10 10 0：弧顶在 t = 0.5，SVG 的 y = 7.5；原生坐标 y 向上，所以在 -7.5
  let box = boxOf('M 0 0 C 0 10 10 10 10 0 Z');
  assert.ok(near(box.minX, 0) && near(box.maxX, 10) && near(box.minY, -7.5) && near(box.maxY, 0), `三次曲线 ${JSON.stringify(box)}`);
  // 二次曲线 M 0 0 Q 5 10 10 0：弧顶 y = 5
  box = boxOf('M 0 0 Q 5 10 10 0 Z');
  assert.ok(near(box.minX, 0) && near(box.maxX, 10) && near(box.minY, -5) && near(box.maxY, 0), `二次曲线 ${JSON.stringify(box)}`);
  // 末端（t = 1）是极值：曲线贴着 x 轴走到 (10, 5)，最后一个取样点必须取到
  box = boxOf('M 0 0 C 0 0 10 0 10 5');
  assert.ok(near(box.maxX, 10) && near(box.minY, -5), `末端取样 ${JSON.stringify(box)}`);
  box = boxOf('M 0 0 Q 10 0 10 5');
  assert.ok(near(box.maxX, 10) && near(box.minY, -5), `二次曲线末端取样 ${JSON.stringify(box)}`);
  // 连续两段曲线：第二段从第一段的终点（10, 4）出发；若起点还停在 (0, 0)，第二段的弧顶会是 7 而不是 6.5
  box = boxOf('M 0 0 C 0 10 10 10 10 4 C 10 -10 20 -10 20 4');
  assert.ok(near(box.maxY, 6.5), `连续曲线的第二段 ${box.maxY}`);
  const firstY = t => 3 * (1 - t) ** 2 * t * 10 + 3 * (1 - t) * t * t * 10 + t ** 3 * 4;   // 第一段的 y(t)，终点 y = 4 使峰值落在 t = 9/16（取样点 i = 9）而不是 0.5
  assert.ok(near(box.minY, -firstY(9 / 16)), `第一段的弧顶 ${box.minY}（解析值 ${-firstY(9 / 16)}）`);
  assert.ok(firstY(9 / 16) > firstY(8 / 16) && firstY(9 / 16) > firstY(10 / 16), '前提：t = 9/16 确实是取样点里的最高处');
  // 二次曲线后接三次曲线：起点取自二次曲线的终点（不是控制点）
  box = boxOf('M 0 0 Q 5 10 10 4 C 10 -10 20 -10 20 4');
  assert.ok(near(box.maxY, 6.5), `二次后接三次 ${box.maxY}`);
});

// 独立实现：De Casteljau 算法（不是 sample 里的多项式展开），用来对拍取样点
const deCasteljau = (points, t) => {
  let level = points.map(p => [...p]);
  while (level.length > 1) level = level.slice(1).map((p, i) => [level[i][0] * (1 - t) + p[0] * t, level[i][1] * (1 - t) + p[1] * t]);
  return level[0];
};

test('sample：端点原样，每段贝塞尔取 SAMPLES 个点，与独立的 De Casteljau 算法逐点一致', () => {
  assert.equal(S.SAMPLES, 16);
  for (const d of CURVES) {
    const cmds = cmdsOf(d), got = S.sample(cmds), expected = [];
    let current = null;
    for (const { cmd, pts } of cmds) {
      if (cmd === 'M' || cmd === 'L') { expected.push(pts[0]); current = pts[0]; }
      else if (cmd === 'C' || cmd === 'Q') { for (let i = 1; i <= S.SAMPLES; i++) expected.push(deCasteljau([current, ...pts], i / S.SAMPLES)); current = pts[pts.length - 1]; }
    }
    assert.equal(got.length, expected.length, `${d}：点数`);
    got.forEach((p, i) => assert.ok(near(p[0], expected[i][0], 1e-9) && near(p[1], expected[i][1], 1e-9), `${d}：第 ${i} 个取样点 ${p} 与 De Casteljau ${expected[i]} 不一致`));
  }
  assert.deepEqual(S.sample(cmdsOf('M 1 2 L 3 4 Z')), [[1, 2], [3, 4]], 'Z 不产生点');
});

test('转动：包围盒按绕转轴旋转后的点计算（合成矩形：转轴在原点与转轴不在原点，各相位的解析值）', () => {
  const rect = 'M 0 0 L 10 0 L 10 2 L 0 2 Z';
  const at = (pivot, wave) => withShape({ parts: [{ role: 'limb', d: rect, motion: { pivot, deg: 90 } }] }, id => S.bounds(id, wave));
  const same = (box, [minX, maxX, minY, maxY], label) => assert.ok(near(box.minX, minX, 1e-9) && near(box.maxX, maxX, 1e-9) && near(box.minY, minY, 1e-9) && near(box.maxY, maxY, 1e-9), `${label}：${JSON.stringify(box)}`);
  // SVG 顺时针 90°：向右伸出的矩形转到向下（原生坐标里就是 y 为负）
  same(at([0, 0], 0), [0, 10, -2, 0], '转轴在原点，静止');
  same(at([0, 0], 1), [-2, 0, -10, 0], '转轴在原点，wave = 1（顺时针 90°）');
  same(at([0, 0], -1), [0, 2, 0, 10], '转轴在原点，wave = -1（逆时针 90°）');
  same(at([0, 0], 0.5), [-2 * Math.SQRT1_2, 10 * Math.SQRT1_2, -6 * Math.SQRT2, 0], '转轴在原点，wave = 0.5（45°）');
  same(at([10, 0], 1), [8, 10, 0, 10], '转轴在 (10, 0)，wave = 1：绕右边缘转，矩形转到转轴上方');
  same(at([10, 0], 0), [0, 10, -2, 0], '转轴不在原点，静止时位置不变');
  same(at([10, 1], 1), [9, 11, -1, 9], '转轴在 (10, 1)（x、y 都不为 0），wave = 1');
  same(at([10, 1], -1), [9, 11, -11, -1], '转轴在 (10, 1)，wave = -1（逆时针 90°）：矩形转到转轴下方');
});

test('放置余量（缩放后的并集包围盒）：身体顶端在窗口底边以上 91 pt 时，宽度与高度都留得出 8 pt 的边距（170×150 的水母窗口）', () => {
  const W = 170, H = 150, TOP = 91, MARGIN = 8;
  for (const id of Object.keys(S.SHAPES)) {
    const u = S.union(id), width = u.maxX - u.minX, height = u.maxY - u.minY;
    assert.ok(width <= W - 2 * MARGIN, `${id} 宽 ${width.toFixed(1)} 超过 ${W - 2 * MARGIN}`);
    assert.ok(height <= TOP - MARGIN, `${id} 高 ${height.toFixed(1)} 超过顶端以下可用的 ${TOP - MARGIN}`);
    assert.ok(H - TOP >= MARGIN, '顶端以上的窗口空间够放气泡尾巴之外的边距');
  }
});

test('源码绊线：形状模块无 DOM、网络、存储、动态执行；数据只用相对安全的原语', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/jelly-species-shapes.js'), 'utf8');
  for (const pattern of [/\bdocument\b/, /\bwindow\b/, /\bfetch\b/, /XMLHttpRequest/, /\bchrome\./, /localStorage/, /\beval\b/, /new Function/, /innerHTML/, /setTimeout|setInterval|requestAnimationFrame/, /\bimportScripts\b/]) assert.doesNotMatch(source, pattern, `形状模块不应出现 ${pattern}`);
});
