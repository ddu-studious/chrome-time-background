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
      assert.equal(Number(!!part.d) + Number(!!part.ellipse) + Number(!!part.dots), 1, `${id} 每个部件有且只有 d、ellipse、dots 之一`);
      if (part.ellipse) assert.ok(part.ellipse.length === 5 && part.ellipse.every(Number.isFinite) && part.ellipse[2] > 0 && part.ellipse[3] > 0, `${id} 椭圆参数`);
      if (part.dots) assert.ok(part.dots.length >= 1 && part.dots.every(c => c.length === 3 && c.every(Number.isFinite) && c[2] > 0 && c[2] <= 3), `${id} 小圆参数：[x, y, r]，半径为正且不超过 3`);
      if (part.u !== undefined) { assert.equal(part.role, 'limb', `${id} 只有肢体需要取色位置`); assert.ok(part.u >= 0 && part.u <= 1); }
      if (part.motion) {
        assert.equal(part.motion.pivot.length, 2); assert.ok(part.motion.pivot.every(Number.isFinite));
        assert.ok(Number.isFinite(part.motion.deg) && Math.abs(part.motion.deg) <= 45, `${id} 转动角度不超过 45°`);
        if (part.motion.squash !== undefined) assert.ok(Number.isFinite(part.motion.squash) && part.motion.squash >= 0 && part.motion.squash <= S.MAX_SQUASH, `${id} 拍翼幅度在 0…${S.MAX_SQUASH}`);
      }
      if (part.mirror !== undefined) assert.equal(part.mirror, true);
    }
    assert.ok(shape.eyes.r > 0.5 && shape.eyes.r <= 4 && shape.eyes.at.length >= 1 && shape.eyes.at.length <= 2, `${id} 眼睛`);
    for (const p of shape.eyes.at) assert.ok(p.length === 2 && p.every(Number.isFinite));
    for (const b of shape.blush) assert.ok(b.length === 4 && b.every(Number.isFinite) && b[2] > 0 && b[3] > 0, `${id} 腮红`);
    assert.ok(shape.blush.length <= 2);
    // 嘴是可选的，只有侧视动物有（俯视动物看不见嘴）：四个点，每个点两个有限数字
    if (shape.mouth !== undefined) {
      assert.equal(shape.view, 'side', `${id} 俯视动物不能有嘴`);
      assert.ok(Array.isArray(shape.mouth) && shape.mouth.length === 4 && shape.mouth.every(p => p.length === 2 && p.every(Number.isFinite)), `${id} 嘴：四个点`);
    }
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
  assert.deepEqual(out.parts[0].motion, { pivot: [2, 5], deg: 10, squash: 0 }, '没写 squash 就是 0');
  assert.deepEqual(out.parts[1].motion, { pivot: [2, -5], deg: -10, squash: 0 });
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

// ---- squash（拍翼）：motion 里除了转动，还可以带一个“垂直方向缩放”的幅度（俯视的蝠鲼：翼展随拍动一胖一瘦，整片菱形不裂缝） ----
// 语义：wave 时，部件先在自己的坐标里绕 pivot 把 y 方向缩放到 1 − squash × wave，再绕 pivot 转 maxAngle × wave（先缩后转）。

test('squash：没写就是 0；写了原样保留；镜像出来的部件沿用同一个值（缩放对 y 取反不敏感）', () => {
  withShape({ parts: [{ role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [1, 2], deg: 0, squash: 0.2 } }, { role: 'limb', mirror: true, d: 'M 0 0 L 4 1 L 4 3 Z', motion: { pivot: [2, 5], deg: 10, squash: 0.15 } }] }, id => {
    const out = S.expand(id);
    assert.deepEqual(out.parts[0].motion, { pivot: [1, 2], deg: 0, squash: 0.2 });
    assert.deepEqual(out.parts[1].motion, { pivot: [2, 5], deg: 10, squash: 0.15 });
    assert.deepEqual(out.parts[2].motion, { pivot: [2, -5], deg: -10, squash: 0.15 }, '镜像：转轴 y 取反、角度反号，squash 不变');
  });
  assert.equal(S.MAX_SQUASH, 0.3);
  // 展开不共享引用：改展开结果里的 squash 不影响源数据
  withShape({ parts: [{ role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [0, 0], deg: 0, squash: 0.2 } }] }, id => {
    const before = JSON.stringify(S.SHAPES[id]);
    S.expand(id).parts[0].motion.squash = 9;
    assert.equal(JSON.stringify(S.SHAPES[id]), before);
  });
});

test('squash：不合规的幅度（非数、负数、超过上限、非有限、不是数字类型）让整种动物不可用，而不是画出变形的身体；0 与上限本身合规', () => {
  const make = squash => ({ parts: [{ role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [0, 0], deg: 0, squash } }] });
  for (const bad of [NaN, Infinity, -Infinity, -0.01, 0.3000001, 1, '0.1', null, {}, [], true]) {
    withShape(make(bad), id => {
      assert.equal(S.expand(id), null, `squash=${String(bad)}：expand`); assert.equal(S.native(id), null, 'native'); assert.equal(S.bounds(id, 0), null, 'bounds'); assert.equal(S.union(id), null, 'union');
    });
  }
  for (const good of [0, 0.3, 0.15, undefined]) withShape(make(good), id => assert.ok(S.expand(id), `squash=${String(good)} 合规`));
});

test('native：squash 原样带出（不乘缩放，也不受 y 翻转影响）', () => withShape({
  scale: 0.5, parts: [{ role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [4, 6], deg: 20, squash: 0.2 } }, { role: 'limb', d: 'M 0 0 L 8 0 L 8 4 Z', motion: { pivot: [4, 6], deg: 20 } }, { role: 'limb', d: 'M 0 0 L 8 0 L 8 4 Z' }],
}, id => {
  const out = S.native(id);
  assert.equal(out.parts[0].motion.squash, 0.2);
  assert.equal(out.parts[1].motion.squash, 0, '没写就是 0');
  assert.equal(out.parts[2].motion, null);
}));

test('squash：包围盒按“先把 y 缩放到 1 − squash × wave、再转动”计算（合成矩形：转轴在边上与在中间、正负相位、先缩后转的顺序）', () => {
  const rect = 'M 0 0 L 10 0 L 10 2 L 0 2 Z';
  const at = (motion, wave, d = rect) => withShape({ parts: [{ role: 'body', d, motion }] }, id => S.bounds(id, wave));
  const same = (box, [minX, maxX, minY, maxY], label) => assert.ok(near(box.minX, minX, 1e-9) && near(box.maxX, maxX, 1e-9) && near(box.minY, minY, 1e-9) && near(box.maxY, maxY, 1e-9), `${label}：${JSON.stringify(box)}`);
  // 转轴在 y = 0（矩形的一条边）：原生坐标里矩形占 y ∈ [−2, 0]；wave = 1 缩到 0.8 倍、wave = −1 胀到 1.2 倍；x 不变
  const edge = { pivot: [0, 0], deg: 0, squash: 0.2 };
  same(at(edge, 0), [0, 10, -2, 0], '静止不变');
  same(at(edge, 1), [0, 10, -1.6, 0], 'wave = 1：y 方向 0.8 倍');
  same(at(edge, -1), [0, 10, -2.4, 0], 'wave = −1：y 方向 1.2 倍');
  same(at(edge, 0.5), [0, 10, -1.8, 0], 'wave = 0.5：y 方向 0.9 倍');
  // 转轴在矩形中间（SVG y = 1，原生 y = −1）：绕那条线缩放，所以向上向下各缩 0.2
  same(at({ pivot: [0, 1], deg: 0, squash: 0.2 }, 1), [0, 10, -1.8, -0.2], '转轴在中线：上下各收 0.2');
  same(at({ pivot: [0, 1], deg: 0, squash: 0.2 }, -1), [0, 10, -2.2, 0.2], '转轴在中线：上下各胀 0.2');
  // 转轴不在原点也不在边上：以 (3, −1) 为中心缩放，x 方向不受影响
  same(at({ pivot: [3, 5], deg: 0, squash: 0.3 }, 1), [0, 10, -5 + (-2 + 5) * 0.7, -5 + (0 + 5) * 0.7], '转轴 (3, 5)：y 以转轴为不动点');
  // 0 幅度等于没有：与没写 squash 的同一形状逐值相同
  for (const wave of [-1, -0.5, 0, 0.5, 1]) assert.deepEqual(at({ pivot: [0, 1], deg: 30, squash: 0 }, wave), at({ pivot: [0, 1], deg: 30 }, wave), `squash = 0 时 wave ${wave} 与不写相同`);
  // 先缩后转：矩形 4×2，转轴在原点，转 90°（SVG 顺时针，原生 −π/2），squash 0.3，wave = 1。
  // 原生点 (4, 0)(4, −2)(0, −2) → 先缩：(4, 0)(4, −1.4)(0, −1.4) → 再转 −90°：(x, y) → (y, −x)：(0, −4)(−1.4, −4)(−1.4, 0)。
  // 若顺序反了（先转后缩）会是 x ∈ [−2, 0]、y ∈ [−2.8, 0]，这里要能分辨。
  same(at({ pivot: [0, 0], deg: 90, squash: 0.3 }, 1, 'M 0 0 L 4 0 L 4 2 L 0 2 Z'), [-1.4, 0, -4, 0], '先缩后转');
});

test('squash：并集覆盖最胖的相位（wave = −1），任何一帧都不会越出放置用的并集', () => withShape({ parts: [{ role: 'body', d: 'M 0 -10 L 10 0 L 0 10 L -10 0 Z', motion: { pivot: [0, 0], deg: 0, squash: 0.25 } }] }, id => {
  const u = S.union(id), fat = S.bounds(id, -1), thin = S.bounds(id, 1), rest = S.bounds(id, 0);
  assert.ok(near(rest.maxY, 10) && near(rest.minY, -10));
  assert.ok(near(fat.maxY, 12.5) && near(fat.minY, -12.5), `最胖 ${JSON.stringify(fat)}`);
  assert.ok(near(thin.maxY, 7.5) && near(thin.minY, -7.5), `最瘦 ${JSON.stringify(thin)}`);
  assert.ok(near(u.maxY, 12.5) && near(u.minY, -12.5), `并集取最胖 ${JSON.stringify(u)}`);
  for (const wave of S.WAVES) { const box = S.bounds(id, wave); assert.ok(box.minY >= u.minY - 1e-9 && box.maxY <= u.maxY + 1e-9, `wave ${wave}`); }
}));

test('放置余量（缩放后的并集包围盒）：身体顶端在窗口底边以上 91 pt 时，宽度与高度都留得出 8 pt 的边距（170×150 的水母窗口）', () => {
  const W = 170, H = 150, TOP = 91, MARGIN = 8;
  for (const id of Object.keys(S.SHAPES)) {
    const u = S.union(id), width = u.maxX - u.minX, height = u.maxY - u.minY;
    assert.ok(width <= W - 2 * MARGIN, `${id} 宽 ${width.toFixed(1)} 超过 ${W - 2 * MARGIN}`);
    assert.ok(height <= TOP - MARGIN, `${id} 高 ${height.toFixed(1)} 超过顶端以下可用的 ${TOP - MARGIN}`);
    assert.ok(H - TOP >= MARGIN, '顶端以上的窗口空间够放气泡尾巴之外的边距');
  }
});

// ---- dots：一个部件写成一串小圆（鲸鲨的白斑）。每个圆是同一条路径里的一个子路径，所以斑点再多也只是一个 accent 部件 ----

test('dots：每个小圆展开成一段独立的闭合子路径，与同半径的椭圆逐字相同；圆心、半径与顺序保持，包围盒覆盖每个圆的四个极点', () => {
  const dots = [[0, 0, 1], [5, 2, 1.5], [-4, 1, 0.5]];
  withShape({ parts: [{ role: 'accent', dots }] }, id => {
    const out = S.expand(id);
    assert.equal(out.parts.length, 1);
    assert.equal(out.parts[0].d, dots.map(([x, y, r]) => S.ellipsePath(x, y, r, r)).join(' '), '逐个圆按顺序连成一条路径');
    const cmds = cmdsOf(out.parts[0].d);
    assert.equal(cmds.map(c => c.cmd).join(''), 'MCCCCZ'.repeat(dots.length), '每个圆：一个 M、四段 C、一个 Z');
    dots.forEach(([x, y, r], index) => {
      assert.deepEqual(cmds[index * 6].pts[0], [x + r, y], `第 ${index} 个圆从右端点出发`);
      assert.deepEqual(cmds[index * 6 + 4].pts[2], [x + r, y], `第 ${index} 个圆回到起点`);
    });
    assert.equal(out.parts[0].motion, null);
    // svg y 的范围 −1…3.5，原生坐标翻成 −3.5…1；x 为 −4.5…6.5
    const box = S.bounds(id, 0);
    assert.ok(near(box.minX, -4.5, 1e-9) && near(box.maxX, 6.5, 1e-9) && near(box.minY, -3.5, 1e-9) && near(box.maxY, 1, 1e-9), `包围盒 ${JSON.stringify(box)}`);
    // 展开结果不共享源数据
    out.parts[0].d = 'x';
    assert.equal(S.expand(id).parts[0].d, dots.map(([x, y, r]) => S.ellipsePath(x, y, r, r)).join(' '));
  });
  // 同一部件里的圆可以重叠、可以只有一个——这里只管格式；不重叠是数据质量测试（鲸鲨）的事
  withShape({ parts: [{ role: 'accent', dots: [[1, 2, 3]] }] }, id => assert.equal(cmdsOf(S.expand(id).parts[0].d).length, 6));
});

test('dots：不合规（空列表、不是数组、某项不是三个有限数字、半径为 0 或负、数字写成字符串）让整种动物不可用，而不是少画几个圆', () => {
  const body = { role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z' };
  const cases = [
    ['空列表', []], ['不是数组', 'abc'], ['对象', {}], ['null', null],
    ['某项只有两个数', [[0, 0, 1], [1, 1]]], ['某项有四个数', [[0, 0, 1, 2]]], ['某项不是数组', [[0, 0, 1], 5]],
    ['半径为 0', [[0, 0, 0]]], ['半径为负', [[0, 0, -1]]], ['半径是 NaN', [[0, 0, NaN]]], ['圆心 x 是 Infinity', [[Infinity, 0, 1]]], ['圆心 y 是 NaN', [[0, NaN, 1]]],
    ['数字写成字符串', [['0', '0', '1']]], ['半径写成字符串', [[0, 0, '1']]], ['null 项', [null]],
  ];
  for (const [name, dots] of cases) {
    withShape({ parts: [body, { role: 'accent', dots }] }, id => {
      assert.equal(S.expand(id), null, `${name}：expand`); assert.equal(S.native(id), null, 'native'); assert.equal(S.bounds(id, 0), null, 'bounds'); assert.equal(S.union(id), null, 'union');
    });
  }
  withShape({ parts: [body, { role: 'accent', dots: [[0, 0, 1], [3, 0, 0.5]] }] }, id => assert.ok(S.expand(id), '两个合规的圆可用'));
});

test('部件写法有且只有一种：d、ellipse、dots 同时写了两种或一种也没写，整种动物不可用（不悄悄只认其中一种）', () => {
  const d = 'M 0 0 L 8 0 L 8 4 Z', ellipse = [0, 0, 3, 2, 0], dots = [[0, 0, 1]];
  for (const [name, part] of [['d + ellipse', { d, ellipse }], ['d + dots', { d, dots }], ['ellipse + dots', { ellipse, dots }], ['三种都写', { d, ellipse, dots }], ['一种也没写', {}]]) {
    withShape({ parts: [{ role: 'body', ...part }] }, id => assert.equal(S.expand(id), null, name));
  }
  for (const [name, part] of [['只写 d', { d }], ['只写 ellipse', { ellipse }], ['只写 dots', { dots }]]) {
    withShape({ parts: [{ role: 'body', ...part }] }, id => assert.ok(S.expand(id), name));
  }
});

test('dots：每个部件的命令数与路径长度仍在上限之内（鲸鲨的约 60 个圆是一条 360 命令、一万字符左右的路径，离上限留有余量）', () => {
  const shape = S.expand('whaleshark'), spots = shape.parts.find(part => part.role === 'accent');
  const commands = cmdsOf(spots.d).length;
  assert.ok(commands <= S.MAX_COMMANDS * 0.6, `斑点路径 ${commands} 条命令，上限 ${S.MAX_COMMANDS}`);
  assert.ok(spots.d.length <= S.MAX_PATH_CHARS * 0.75, `斑点路径 ${spots.d.length} 个字符，上限 ${S.MAX_PATH_CHARS}`);
  // 上限本身的行为：恰好在命令上限内可以，多一条就不行（一个圆 6 条命令，133 个圆 = 798 条，134 个 = 804 条；用最短的整数圆 [0, 0, 1]，字符数排在命令数之后才到上限）
  const circles = n => Array.from({ length: n }, () => [0, 0, 1]);
  const pathChars = n => circles(n).map(([x, y, r]) => S.ellipsePath(x, y, r, r)).join(' ').length;
  assert.ok(pathChars(134) < S.MAX_PATH_CHARS, `前提：134 个圆的路径 ${pathChars(134)} 个字符，仍在字符上限内，所以下面失败只能来自命令数`);
  withShape({ parts: [{ role: 'accent', dots: circles(133) }] }, id => assert.ok(S.expand(id), '798 条命令可用'));
  withShape({ parts: [{ role: 'accent', dots: circles(134) }] }, id => assert.equal(S.expand(id), null, '804 条命令超过上限'));
  // 字符数先到上限的情形：很长的小数圆（圆心位置各不相同）超过 16000 个字符
  const spread = n => Array.from({ length: n }, (_, i) => [i * 0.137 + 0.111, i * 0.071 + 0.123, 1.234]);
  const spreadChars = n => spread(n).map(([x, y, r]) => S.ellipsePath(x, y, r, r)).join(' ').length;
  let n = 1; while (spreadChars(n) <= S.MAX_PATH_CHARS && n < 133) n++;
  assert.ok(n < 133 && spreadChars(n) > S.MAX_PATH_CHARS && spreadChars(n - 1) <= S.MAX_PATH_CHARS, '前提：能找到刚好跨过字符上限的圆数');
  withShape({ parts: [{ role: 'accent', dots: spread(n - 1) }] }, id => assert.ok(S.expand(id), `${n - 1} 个圆（${spreadChars(n - 1)} 个字符）可用`));
  withShape({ parts: [{ role: 'accent', dots: spread(n) }] }, id => assert.equal(S.expand(id), null, `${n} 个圆（${spreadChars(n)} 个字符）超过字符上限`));
});

// ---- mouth（微笑）：只有侧视动物有；一段三次贝塞尔的四个点 ----

test('mouth：没写就是 null；写了按值复制（不共享引用）；原生坐标按缩放并把 y 翻成向上', () => {
  const body = { role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z' };
  withShape({ scale: 0.5, parts: [body], mouth: [[10, 2], [8, 5], [4, 5], [2, 2]] }, id => {
    const out = S.expand(id);
    assert.deepEqual(out.mouth, [[10, 2], [8, 5], [4, 5], [2, 2]]);
    out.mouth[0][0] = 99; out.mouth[3][1] = 99;
    assert.deepEqual(S.expand(id).mouth, [[10, 2], [8, 5], [4, 5], [2, 2]], '展开结果不共享源数据');
    assert.deepEqual(S.native(id).mouth, [[5, -1], [4, -2.5], [2, -2.5], [1, -1]], '原生：乘 scale、y 翻成向上');
  });
  withShape({ parts: [body] }, id => { assert.equal(S.expand(id).mouth, null); assert.equal(S.native(id).mouth, null); });
  withShape({ parts: [body], mouth: null }, id => assert.equal(S.expand(id).mouth, null, '显式写 null 等于没有嘴'));
  withShape({ parts: [body], mouth: undefined }, id => assert.equal(S.expand(id).mouth, null));
  assert.equal(S.expand('hammer').mouth, null, '俯视的小锤头鲨没有嘴'); assert.equal(S.expand('manta').mouth, null, '俯视的蝠鲼没有嘴');
  assert.ok(Array.isArray(S.expand('whaleshark').mouth) && S.expand('whaleshark').mouth.length === 4, '鲸鲨笑着');
});

test('mouth：俯视动物写了嘴、点数不是 4、某个点不是两个有限数字，整种动物不可用（和路径不合规一样）', () => {
  const body = { role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z' };
  const good = [[10, 2], [8, 5], [4, 5], [2, 2]];
  withShape({ view: 'top', parts: [body], mouth: good }, id => assert.equal(S.expand(id), null, '俯视写了嘴'));
  const cases = [
    ['三个点', good.slice(0, 3)], ['五个点', [...good, [0, 0]]], ['空数组', []], ['不是数组', 'smile'], ['对象', {}],
    ['某点只有一个数', [[10, 2], [8], [4, 5], [2, 2]]], ['某点有三个数', [[10, 2], [8, 5, 1], [4, 5], [2, 2]]], ['某点不是数组', [[10, 2], 8, [4, 5], [2, 2]]],
    ['NaN', [[10, 2], [8, NaN], [4, 5], [2, 2]]], ['Infinity', [[10, 2], [8, 5], [Infinity, 5], [2, 2]]], ['-Infinity', [[10, 2], [8, 5], [4, 5], [2, -Infinity]]],
    ['字符串数字', [['10', '2'], [8, 5], [4, 5], [2, 2]]], ['null 点', [null, [8, 5], [4, 5], [2, 2]]],
  ];
  for (const [name, mouth] of cases) withShape({ parts: [body], mouth }, id => {
    assert.equal(S.expand(id), null, `${name}：expand`); assert.equal(S.native(id), null, 'native'); assert.equal(S.bounds(id, 0), null, 'bounds'); assert.equal(S.union(id), null, 'union');
  });
  withShape({ parts: [body], mouth: good }, id => assert.ok(S.expand(id), '合规的嘴可用'));
});

test('mouth：不参与包围盒与并集（嘴画在身体上，不决定放置；放远了也不会改变放置）', () => {
  const body = { role: 'body', d: 'M 0 0 L 8 0 L 8 4 Z' };
  const plain = withShape({ parts: [body] }, id => ({ box: S.bounds(id, 0), all: S.union(id) }));
  const smiling = withShape({ parts: [body], mouth: [[100, 50], [90, 60], [80, 60], [70, 50]] }, id => ({ box: S.bounds(id, 0), all: S.union(id) }));
  assert.deepEqual(smiling, plain);
});

// ---- 鲸鲨的数据质量：约 60 个斑点都在身上、互不重叠、避开腹部/胸鳍/脸；脸（眼睛、腮红、微笑）都在身体里 ----
// 几何用独立的小函数算（射线法判断在多边形内、点到线段距离），多边形取 S.sample 对闭合路径的取样（曲线每段 16 个点，足够密）。

const polygonOf = d => S.sample(cmdsOf(d));
const insidePolygon = (p, poly) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
const segmentDistance = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
const outlineDistance = (p, poly) => { let best = Infinity; for (let i = 0; i < poly.length; i++) best = Math.min(best, segmentDistance(p, poly[i], poly[(i + 1) % poly.length])); return best; };
const whale = () => {
  const raw = S.SHAPES.whaleshark, shape = S.expand('whaleshark');
  const pick = predicate => shape.parts.find(predicate);
  return {
    raw, shape,
    dots: raw.parts.find(part => part.role === 'accent').dots,
    body: polygonOf(pick(part => part.role === 'body').d), belly: polygonOf(pick(part => part.role === 'belly').d),
    pectoral: polygonOf(pick(part => part.role === 'limb' && part.u === 0.78).d),
    eye: shape.eyes.at[0], eyeRadius: shape.eyes.r, blush: shape.blush[0], mouth: shape.mouth,
  };
};
const curvePoints = ([p0, p1, p2, p3], n = 40) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = 1 - t; return [0, 1].map(k => s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k]); });

test('鲸鲨的斑点：约 60 个（56…64），都在躯干里、离轮廓有余量（描边半宽约 0.6）、不压在腹部与胸鳍上', () => {
  const { dots, body, belly, pectoral } = whale();
  assert.ok(dots.length >= 56 && dots.length <= 64, `斑点数 ${dots.length}`);
  for (const [x, y, r] of dots) {
    const label = `斑点 (${x}, ${y}, r=${r})`;
    assert.ok(insidePolygon([x, y], body), `${label} 圆心必须在躯干里`);
    assert.ok(outlineDistance([x, y], body) - r >= 1.0, `${label} 离躯干轮廓太近：${(outlineDistance([x, y], body) - r).toFixed(2)}（描边半宽约 0.6，要求 ≥ 1.0）`);
    assert.ok(!insidePolygon([x, y], belly) && outlineDistance([x, y], belly) - r >= 0.4, `${label} 不能压在浅色腹部上（离腹部 ≥ 0.4）`);
    assert.ok(!insidePolygon([x, y], pectoral) && outlineDistance([x, y], pectoral) - r >= 1.0, `${label} 不能压在胸鳍上`);
    assert.ok(r >= 1.0 && r <= 1.5, `${label} 半径 1.0…1.5（太小在 2× 屏幕上糊成点，太大互相挤）`);
  }
});

test('鲸鲨的斑点：互不重叠（任意两个圆之间至少留 0.4 的缝），也不盖住眼睛、腮红与微笑', () => {
  const { dots, eye, eyeRadius, blush, mouth } = whale();
  let tightest = Infinity;
  for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
    const gap = Math.hypot(dots[i][0] - dots[j][0], dots[i][1] - dots[j][1]) - dots[i][2] - dots[j][2];
    tightest = Math.min(tightest, gap);
    assert.ok(gap >= 0.4, `斑点 ${i} 与 ${j} 太挤（缝 ${gap.toFixed(2)}）`);
  }
  assert.ok(tightest < 1.5, `前提：这是一排排紧凑的斑点而不是稀稀拉拉（最窄的缝 ${tightest.toFixed(2)}）`);
  const smile = curvePoints(mouth);
  for (const [x, y, r] of dots) {
    assert.ok(Math.hypot(x - eye[0], y - eye[1]) - r - eyeRadius >= 1.0, `斑点 (${x}, ${y}) 离眼睛太近`);
    const dx = (x - blush[0]) / blush[2], dy = (y - blush[1]) / blush[3], rr = Math.hypot(dx, dy) || 1;     // 沿圆心连线方向的椭圆半径
    const reach = Math.hypot(blush[2] * dx / rr, blush[3] * dy / rr);
    assert.ok(Math.hypot(x - blush[0], y - blush[1]) - reach - r >= 0.8, `斑点 (${x}, ${y}) 离腮红太近`);
    assert.ok(Math.min(...smile.map(m => Math.hypot(x - m[0], y - m[1]))) - r >= 2.0, `斑点 (${x}, ${y}) 离微笑太近`);
  }
});

test('鲸鲨的脸：眼睛在躯干里且离轮廓有余量；腮红整块在躯干里；微笑整条在躯干里、在眼睛下方、长度适中', () => {
  const { body, eye, eyeRadius, blush, mouth } = whale();
  assert.ok(insidePolygon(eye, body) && outlineDistance(eye, body) - eyeRadius >= 3, '眼睛离轮廓 ≥ 3');
  for (const p of [[blush[0] - blush[2], blush[1]], [blush[0] + blush[2], blush[1]], [blush[0], blush[1] - blush[3]], [blush[0], blush[1] + blush[3]]]) assert.ok(insidePolygon(p, body), `腮红的四个端点都在躯干里：${p}`);
  const smile = curvePoints(mouth);
  for (const p of smile) { assert.ok(insidePolygon(p, body), `微笑的每个点都在躯干里：${p}`); assert.ok(outlineDistance(p, body) >= 1.0, `微笑离轮廓 ≥ 1.0（描边宽 1.2/0.9 的一半约 0.67）：${p}`); }
  let length = 0; for (let i = 1; i < smile.length; i++) length += Math.hypot(smile[i][0] - smile[i - 1][0], smile[i][1] - smile[i - 1][1]);
  assert.ok(length >= 5 && length <= 10, `微笑长度 ${length.toFixed(2)}`);
  assert.ok(Math.min(...smile.map(m => Math.hypot(m[0] - eye[0], m[1] - eye[1]))) - eyeRadius >= 2, '微笑离眼睛 ≥ 2');
  assert.ok(smile.every(p => p[1] > eye[1]), '微笑整条在眼睛下方（svg y 更大）');
  // 弧形向下弯（两端高、中间低）才是“笑”：起点与终点的 y 都小于中间最低点
  const lowest = Math.max(...smile.map(p => p[1]));
  assert.ok(lowest > mouth[0][1] + 1 && lowest > mouth[3][1] + 1, '弧线中间比两端低至少 1，是笑而不是撇嘴');
  assert.ok(mouth[0][0] > mouth[3][0], '起点在嘴的前端（x 更大，朝向右）');
  // 笑要有宽度、两端差不多高：否则弧长够了也只是一个钩（变异检查里“终点挪到起点旁边”的变体曾因此存活）
  assert.ok(mouth[0][0] - mouth[3][0] >= 4, `两端的水平距离（弦宽）${(mouth[0][0] - mouth[3][0]).toFixed(2)} ≥ 4`);
  assert.ok(Math.abs(mouth[0][1] - mouth[3][1]) <= 1, `两端高度差 ${Math.abs(mouth[0][1] - mouth[3][1]).toFixed(2)} ≤ 1：对称的笑，不是钩`);
});

test('鲸鲨的整体：侧视、有眼睛腮红微笑；长度 85…95、高度 30…38（含摆动的尾与鳍）；斑点与腹部是各自一个部件', () => {
  const { shape } = whale();
  assert.equal(shape.view, 'side');
  const u = S.union('whaleshark'), width = u.maxX - u.minX, height = u.maxY - u.minY;
  assert.ok(width >= 85 && width <= 95, `长度 ${width.toFixed(2)}`); assert.ok(height >= 30 && height <= 38, `高度 ${height.toFixed(2)}`);
  assert.equal(shape.parts.filter(part => part.role === 'accent').length, 1, '斑点只有一个部件（一条路径里的 60 个子路径）');
  assert.equal(shape.parts.filter(part => part.role === 'belly').length, 1);
  assert.equal(shape.parts.filter(part => part.role === 'body').length, 1);
  assert.equal(shape.eyes.at.length, 1, '侧视只看得见一只眼睛'); assert.equal(shape.blush.length, 1);
  // 部件顺序：鳍与尾在躯干之前（躯干盖住它们的根部）；腹部在躯干之后；胸鳍在腹部之后（盖在腹部上）；斑点在胸鳍之后；高光最后
  const order = shape.parts.map(part => part.role + (part.role === 'limb' ? `@${part.u}` : ''));
  assert.deepEqual(order, ['limb@0.05', 'limb@0.22', 'limb@0.55', 'body', 'belly', 'limb@0.78', 'accent', 'shine']);
  // 尾鳍、胸鳍有拍动（motion），背鳍与腹部没有
  const moves = shape.parts.map(part => !!part.motion);
  assert.deepEqual(moves, [true, false, false, false, false, true, false, false]);
});

// ---- 海龟的数据质量：壳纹是一张互不重叠的细带网，整张网在龟壳里、不碰高光；脸在头上；腹甲一圈、各部件的叠放次序与鳍的反相摆动 ----

const subpathsOf = d => {
  const out = []; let current = null;
  for (const { cmd, pts } of cmdsOf(d)) {
    if (cmd === 'M') current = [pts[0]]; else if (cmd === 'L') current.push(pts[0]);
    else if (cmd === 'Z') { out.push(current); current = null; }
    else assert.fail(`壳纹只能是直线段（${cmd}）：曲线的细带在 2× 屏幕上宽窄不匀，也没法保证不重叠`);
  }
  assert.equal(current, null, '每个子路径都要闭合');
  return out;
};
const polygonArea = polygon => Math.abs(polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const turtle = () => {
  const raw = S.SHAPES.turtle, shape = S.expand('turtle');
  const pick = predicate => shape.parts.find(predicate);
  return {
    raw, shape,
    shell: polygonOf(pick(part => part.role === 'body').d), head: polygonOf(pick(part => part.role === 'limb' && part.u === 0.95).d),
    plastron: polygonOf(pick(part => part.role === 'limb' && part.u === 0.55).d), belly: polygonOf(pick(part => part.role === 'belly').d),
    shine: polygonOf(pick(part => part.role === 'shine').d), seams: subpathsOf(pick(part => part.role === 'accent').d),
    eye: shape.eyes.at[0], eyeRadius: shape.eyes.r, blush: shape.blush[0], mouth: shape.mouth,
  };
};

test('海龟的整体：侧视、长度 74…80、高度 36…41（含摆动的鳍与尾）；有眼睛腮红微笑；壳、腹甲的浅色面、壳纹、高光各一个部件；叠放次序固定', () => {
  const { shape } = turtle();
  assert.equal(shape.view, 'side');
  const u = S.union('turtle'), width = u.maxX - u.minX, height = u.maxY - u.minY;
  assert.ok(width >= 74 && width <= 80, `长度 ${width.toFixed(2)}`); assert.ok(height >= 36 && height <= 41, `高度 ${height.toFixed(2)}`);
  for (const role of ['body', 'belly', 'accent', 'shine']) assert.equal(shape.parts.filter(part => part.role === role).length, 1, `${role} 只有一个部件`);
  assert.equal(shape.eyes.at.length, 1, '侧视只看得见一只眼睛'); assert.equal(shape.blush.length, 1);
  assert.ok(Array.isArray(shape.mouth) && shape.mouth.length === 4, '海龟笑着');
  // 次序：远侧前鳍、远侧后鳍、尾、头在最底下；腹甲（肢体色一圈）与腹部浅色面在壳之下，壳盖住它们的根部；壳纹与高光在壳上；近侧后鳍与前鳍最后画，盖在壳与腹甲的边缘上
  const order = shape.parts.map(part => part.role + (part.role === 'limb' ? `@${part.u}` : ''));
  assert.deepEqual(order, ['limb@0.72', 'limb@0.25', 'limb@0.05', 'limb@0.95', 'limb@0.55', 'belly', 'body', 'accent', 'shine', 'limb@0.25', 'limb@0.72']);
});

test('海龟的鳍与尾：五个会动的部件只转动不压扁；近侧与远侧的鳍反相摆动（一前一后，划起来是交替的）；前鳍摆得比后鳍大、尾最小', () => {
  const { raw } = turtle();
  const moving = raw.parts.map(part => part.motion || null);
  assert.deepEqual(moving.map(motion => motion !== null), [true, true, true, false, false, false, false, false, false, true, true], '远侧前鳍、远侧后鳍、尾，近侧后鳍、近侧前鳍；头、腹甲、腹部、壳、壳纹、高光不动');
  for (const motion of moving.filter(Boolean)) assert.ok(!motion.squash, '海龟的鳍不压扁（只有蝠鲼拍翼才压扁）');
  const [farFront, farRear, tail, , , , , , , nearRear, nearFront] = moving.map(motion => motion && motion.deg);
  assert.ok(Math.sign(farFront) === -Math.sign(nearFront) && Math.sign(farRear) === -Math.sign(nearRear), `远侧与近侧反相：前鳍 ${farFront}/${nearFront}，后鳍 ${farRear}/${nearRear}`);
  assert.ok(Math.abs(nearFront) > Math.abs(nearRear) && Math.abs(farFront) > Math.abs(farRear), '前鳍是主要的划水器官，摆得比后鳍大');
  assert.ok(Math.abs(tail) < Math.abs(nearRear) && Math.abs(tail) < Math.abs(farRear), '尾摆得最小');
  // 转轴要落在各自的根部：在自己的路径包围盒里（不然转起来整片鳍会甩出去）
  raw.parts.forEach((part, index) => {
    if (!part.motion) return;
    const box = polygonOf(S.expand('turtle').parts[index].d), xs = box.map(p => p[0]), ys = box.map(p => p[1]);
    assert.ok(part.motion.pivot[0] >= Math.min(...xs) - 1 && part.motion.pivot[0] <= Math.max(...xs) + 1 && part.motion.pivot[1] >= Math.min(...ys) - 1 && part.motion.pivot[1] <= Math.max(...ys) + 1, `部件 #${index} 的转轴 ${part.motion.pivot} 离自己的路径太远`);
  });
});

test('海龟的壳纹：22 个互不重叠的多边形（17 条细带加 5 个三岔口的小三角），全是直线段，整张网在龟壳里、离轮廓 ≥ 0.7、不碰高光', () => {
  const { seams, shell, shine } = turtle();
  assert.equal(seams.length, 22);
  assert.deepEqual([seams.filter(polygon => polygon.length === 4).length, seams.filter(polygon => polygon.length === 3).length], [17, 5], '17 个四边形的细带与 5 个三角形');
  for (const polygon of seams) for (const vertex of polygon) {
    assert.ok(insidePolygon(vertex, shell), `壳纹顶点 (${vertex.map(n => n.toFixed(2))}) 要在龟壳里`);
    assert.ok(outlineDistance(vertex, shell) >= 0.7, `壳纹顶点 (${vertex.map(n => n.toFixed(2))}) 离壳的轮廓 ${outlineDistance(vertex, shell).toFixed(2)}（描边半宽 0.55，要 ≥ 0.7，不然壳纹会糊进描边）`);
  }
  // 高光（白色半透明）压在壳纹上会变成一团白：整张网离高光至少 1 pt
  let nearest = Infinity;
  for (const polygon of seams) for (let i = 0; i < polygon.length; i++) for (let k = 0; k <= 10; k++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], p = [a[0] + (b[0] - a[0]) * k / 10, a[1] + (b[1] - a[1]) * k / 10];
    nearest = Math.min(nearest, (insidePolygon(p, shine) ? -1 : 1) * outlineDistance(p, shine));
  }
  assert.ok(nearest >= 1.0, `壳纹离高光 ${nearest.toFixed(2)} pt（要 ≥ 1.0）`);
});

test('海龟的壳纹：任意两块之间没有重叠（偶奇规则下重叠会被挖成洞；非零规则下会叠出更白的一块）；细带宽度一致（不太窄也不太粗）、总面积适中', () => {
  const { seams } = turtle();
  let overlapping = 0, samples = 0;
  seams.forEach((polygon, i) => {
    const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.1) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.1) {
      if (!insidePolygon([x, y], polygon)) continue;
      samples++;
      if (seams.some((other, j) => j !== i && insidePolygon([x, y], other))) overlapping++;
    }
  });
  assert.ok(samples > 5000, `前提：取样够密（${samples} 个内部点）`);
  assert.equal(overlapping, 0, `${overlapping} 个内部取样点同时落在两块壳纹里`);
  // 细带的“半宽”（多边形里最大的内切距离）：四边形 ≥ 0.55（宽 ≥ 1.1 pt，在 2× 屏幕上至少 2 个像素宽，渲染检查才取得到内部像素）；小三角 ≥ 0.25
  seams.forEach((polygon, index) => {
    const xs = polygon.map(p => p[0]), ys = polygon.map(p => p[1]);
    let inradius = 0;
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.05) for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.05) if (insidePolygon([x, y], polygon)) inradius = Math.max(inradius, outlineDistance([x, y], polygon));
    // 上限同样要守：整张网是同一种宽度的接缝（设计宽 1.3 pt，四边形半宽 0.65，三角 0.36–0.38），单条变粗会像多出来的一道白杠（变异检查里“一条变粗”曾经存活，见技术文档）
    assert.ok(inradius >= (polygon.length === 4 ? 0.55 : 0.25) && inradius <= (polygon.length === 4 ? 0.8 : 0.5), `壳纹 #${index} 半宽 ${inradius.toFixed(2)}（四边形 0.55…0.8，三角 0.25…0.5）`);
  });
  const total = seams.reduce((sum, polygon) => sum + polygonArea(polygon), 0), shellArea = polygonArea(turtle().shell);
  assert.ok(total / shellArea >= 0.10 && total / shellArea <= 0.22, `壳纹占龟壳面积的 ${(100 * total / shellArea).toFixed(1)}%（10%…22%：太少看不出壳纹，太多像一块白板）`);
});

test('海龟的脸：眼睛在头里（不在壳下）且离头轮廓有余量；腮红整块在头里；微笑整条在头里、在眼睛下方、长度适中、两端差不多高', () => {
  const { head, shell, eye, eyeRadius, blush, mouth } = turtle();
  assert.ok(insidePolygon(eye, head) && outlineDistance(eye, head) - eyeRadius >= 2.5, `眼睛离头轮廓 ${(outlineDistance(eye, head) - eyeRadius).toFixed(2)}（≥ 2.5）`);
  assert.ok(!insidePolygon(eye, shell), '眼睛不在龟壳下面');
  for (const p of [[blush[0] - blush[2], blush[1]], [blush[0] + blush[2], blush[1]], [blush[0], blush[1] - blush[3]], [blush[0], blush[1] + blush[3]]]) assert.ok(insidePolygon(p, head) && outlineDistance(p, head) >= 3, `腮红的四个端点都在头里且离轮廓 ≥ 3：${p}`);
  const smile = curvePoints(mouth);
  for (const p of smile) { assert.ok(insidePolygon(p, head), `微笑的每个点都在头里：${p}`); assert.ok(outlineDistance(p, head) >= 1.5, `微笑离头轮廓 ≥ 1.5（线宽 1.2 的一半约 0.67）：${p}`); }
  let length = 0; for (let i = 1; i < smile.length; i++) length += Math.hypot(smile[i][0] - smile[i - 1][0], smile[i][1] - smile[i - 1][1]);
  assert.ok(length >= 5 && length <= 9, `微笑长度 ${length.toFixed(2)}`);
  assert.ok(Math.min(...smile.map(m => Math.hypot(m[0] - eye[0], m[1] - eye[1]))) - eyeRadius >= 2, '微笑离眼睛 ≥ 2');
  assert.ok(smile.every(p => p[1] > eye[1]), '微笑整条在眼睛下方（svg y 更大）');
  const lowest = Math.max(...smile.map(p => p[1]));
  assert.ok(lowest > mouth[0][1] + 1 && lowest > mouth[3][1] + 1, '弧线中间比两端低至少 1，是笑而不是撇嘴');
  assert.ok(mouth[0][0] > mouth[3][0], '起点在嘴的前端（x 更大，朝向右）');
  assert.ok(mouth[0][0] - mouth[3][0] >= 4, `两端的水平距离（弦宽）${(mouth[0][0] - mouth[3][0]).toFixed(2)} ≥ 4`);
  assert.ok(Math.abs(mouth[0][1] - mouth[3][1]) <= 1, `两端高度差 ${Math.abs(mouth[0][1] - mouth[3][1]).toFixed(2)} ≤ 1：对称的笑，不是钩`);
});

test('海龟的腹甲：浅色的腹部整块在肢体色的腹甲里，四周留一圈（≥ 0.9，下沿最宽处 ≥ 2.8，渲染检查才取得到腹甲的取样点）；头与壳只在根部交叠', () => {
  const { belly, plastron, head, shell } = turtle();
  let margin = Infinity, widest = 0;
  for (const p of belly) {
    margin = Math.min(margin, (insidePolygon(p, plastron) ? 1 : -1) * outlineDistance(p, plastron));
    if (p[1] > 8) widest = Math.max(widest, outlineDistance(p, plastron));
  }
  assert.ok(margin >= 0.9, `腹部离腹甲轮廓的最小余量 ${margin.toFixed(2)}（≥ 0.9）`);
  assert.ok(widest >= 2.8, `下沿一圈最宽 ${widest.toFixed(2)}（≥ 2.8）`);
  const hidden = head.filter(p => insidePolygon(p, shell)).length;
  assert.ok(hidden <= head.length * 0.15, `头的轮廓只有根部（≤ 15%）压在壳下：${hidden}/${head.length}`);
});

test('并集取样的相位表：恰为 −1、−0.5、0、0.5、1（Swift 的 waves 与它逐项对照；少一个相位，并集就盖不住那一帧）', () => {
  assert.deepEqual([...S.WAVES], [-1, -0.5, 0, 0.5, 1]);
  assert.ok(Object.isFrozen(S.WAVES));
});

test('高光整条落在躯干里：每种动物的高光多边形都不越出躯干轮廓（越出的部分会白白盖在描边外沿，像一道毛边）', () => {
  // 全量变异检查之后的几何排查发现：鲸鲨的高光椭圆在尾侧越出背线约 0.34 pt（仍在 0.55 pt 的描边半宽之内，所以渲染检查与肉眼都看不出），
  // 小锤头鲨与蝠鲼本来就在里面（余量分别约 0.14 与 7.6 pt）。这里把“不越出躯干”钉成所有动物共同的规则（海龟加入时自动纳入）。
  let checked = 0;
  for (const id of S.AVAILABLE.filter(name => name !== 'jelly')) {
    const shape = S.expand(id);
    const bodies = shape.parts.filter(part => part.role === 'body').map(part => polygonOf(part.d));
    assert.ok(bodies.length >= 1, `${id} 要有躯干`);
    for (const part of shape.parts.filter(item => item.role === 'shine')) {
      for (const point of polygonOf(part.d)) {
        const margin = Math.max(...bodies.map(body => (insidePolygon(point, body) ? 1 : -1) * outlineDistance(point, body)));
        assert.ok(margin >= 0, `${id} 的高光有一点越出躯干 ${(-margin).toFixed(2)} pt：(${point.map(n => n.toFixed(2)).join(', ')})`);
      }
      checked++;
    }
  }
  assert.ok(checked >= 3, `前提：至少三种动物各有一个高光（实际检查了 ${checked} 个）`);
  // 高光要看得见：鲸鲨的高光至少 24 pt 长、2 pt 厚（没有这一条，把高光缩成一个点也能“不越出”）
  const poly = polygonOf(S.expand('whaleshark').parts.find(part => part.role === 'shine').d);
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  assert.ok(width >= 24 && height >= 2, `鲸鲨高光 ${width.toFixed(2)} × ${height.toFixed(2)}（≥ 24 × 2）`);
});

test('源码绊线：形状模块无 DOM、网络、存储、动态执行；数据只用相对安全的原语', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/jelly-species-shapes.js'), 'utf8');
  for (const pattern of [/\bdocument\b/, /\bwindow\b/, /\bfetch\b/, /XMLHttpRequest/, /\bchrome\./, /localStorage/, /\beval\b/, /new Function/, /innerHTML/, /setTimeout|setInterval|requestAnimationFrame/, /\bimportScripts\b/]) assert.doesNotMatch(source, pattern, `形状模块不应出现 ${pattern}`);
});
