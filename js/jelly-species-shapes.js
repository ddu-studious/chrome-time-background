(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JellySpeciesShapes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 桌面动物的形状数据（唯一来源）：每种动物由若干“部件”组成，部件是只含 M/L/C/Q/Z 绝对命令的 SVG 路径串（或椭圆，展开时转成路径）。
  //  · 原生端不另写一份几何：desktop-reminder/gen-species.mjs 读本文件生成 jelly-species-data.swift（入库，测试检查“生成物与本文件一致”），
  //    Swift 用一个只认这五种命令的小解析器还原；本文件的 parsePath / bounds 是它的 JS 参考实现，两边用同一批数据逐点对拍；
  //  · 设置页示意图（js/settings-jelly-appearance.js）用同一份数据画 SVG，所以示意图与桌面上的动物是同一个形状；
  //  · 本模块不碰 DOM、网络、权限。设计见 docs/superpowers/specs/2026-10-17-jelly-species-design.md（§3 部件接口、§5 放置）。
  //
  // 坐标：原点在身体中心，x 向右（朝向），y 向下（SVG 惯例）；单位是“缩放前”的点，scale 把它缩到桌面上的大小（与水母同一量级）。
  // 部件按数组顺序绘制（靠后的盖住靠前的）。role：body 躯干、limb 鳍/尾/肢（按位置 u 取色，0 尾端 → 1 头端）、belly 腹部浅色、
  // accent 斑点、shine 高光。mirror:true 表示沿 x 轴再画一份镜像（y 取反，紧跟在原部件之后）。
  // motion：绕 pivot 旋转，deg 是 wave=±1 时的角度（SVG 方向：顺时针为正），wave 由原生端按游动节奏给出。

  const ROLES = Object.freeze(['body', 'limb', 'belly', 'accent', 'shine']);
  const VIEWS = Object.freeze(['side', 'top']);
  const WAVES = Object.freeze([-1, -0.5, 0, 0.5, 1]);     // 并集包围盒取样的相位：放置按它们的并集算，动起来任何一帧都不会越出
  const MAX_PATH_CHARS = 16000;                            // 一个部件的路径串上限（鲸鲨的斑点是一个部件里的几十个小圆）
  const MAX_COMMANDS = 800;
  const SAMPLES = 16;                                      // 每段贝塞尔取样点数（包围盒用，原生端同一个值）
  const KAPPA = 0.5522847498307936;                        // 四段三次贝塞尔近似椭圆的控制点系数

  const SHAPES = {
    // 小锤头鲨（俯视）：锤头是最好认的特征，侧视看不出来。长度约 80 pt（缩放 0.89），与水母同一量级。
    hammer: {
      view: 'top',
      scale: 0.89,
      parts: [
        { role: 'limb', u: 0.57, mirror: true, d: 'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Z' },
        { role: 'limb', u: 0.10, d: 'M -28 -2 C -36 -5 -45 -13 -53 -17 C -50 -9 -48 -3 -44 0 C -48 3 -50 9 -52 13 C -46 10 -36 5 -28 2 Z', motion: { pivot: [-28, 0], deg: 12 } },
        { role: 'body', d: 'M 24 -8 C 10 -9 -10 -8 -30 -2 L -30 2 C -10 8 10 9 24 8 Z' },
        { role: 'body', d: 'M 22 -11 C 28 -22 36 -22 36 -14 L 36 14 C 36 22 28 22 22 11 Z' },
        { role: 'shine', ellipse: [0, -5, 12, 2.4, -2] },
      ],
      eyes: { r: 2.2, at: [[32, -17], [32, 17]] },
      blush: [[30, -10, 2.6, 1.8], [30, 10, 2.6, 1.8]],
    },
  };

  // 物种顺序与 js/jelly-appearance.js 的 SPECIES 一致；水母是过程式画法（不在这里），永远可用。
  const AVAILABLE = Object.freeze(['jelly', ...Object.keys(SHAPES)]);

  const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
  const num = value => (Math.round(value * 1000) / 1000).toString();   // 最多 3 位小数，生成物短而稳定（-0 的字符串是 "0"）
  const NUMBER = /^-?\d+(\.\d+)?$/;
  const ARITY = Object.freeze({ M: 2, L: 2, C: 6, Q: 4, Z: 0 });

  /**
   * 解析只含 M/L/C/Q/Z 绝对命令的路径串，返回 [{ cmd, pts: [[x, y], ...] }]；任何不合规的输入返回 null：
   * 不是字符串、过长、命令不在五种之内（相对命令、H/V/S/T/A、小写都不认）、数字个数不对（不支持隐式重复）、数字格式不是 -?\d+(\.\d+)?
   * （不认指数、前导 +、.5、5.）、不以 M 开头、Z 之后不是 M、命令过多。空白只认空格/制表/换行，不认逗号。
   */
  function parsePath(d) {
    if (typeof d !== 'string' || d.length === 0 || d.length > MAX_PATH_CHARS) return null;
    const tokens = d.split(/[ \t\r\n]+/).filter(Boolean);
    if (!tokens.length) return null;
    const out = [];
    let index = 0, previous = '';
    while (index < tokens.length) {
      const cmd = tokens[index++];
      if (!Object.prototype.hasOwnProperty.call(ARITY, cmd)) return null;
      if (out.length === 0 && cmd !== 'M') return null;
      if (previous === 'Z' && cmd !== 'M') return null;
      const need = ARITY[cmd];
      if (index + need > tokens.length) return null;
      const values = [];
      for (let i = 0; i < need; i++) {
        const token = tokens[index++];
        if (!NUMBER.test(token)) return null;
        const value = Number(token);
        if (!Number.isFinite(value)) return null;
        values.push(value);
      }
      const pts = [];
      for (let i = 0; i < values.length; i += 2) pts.push([values[i], values[i + 1]]);
      out.push({ cmd, pts });
      previous = cmd;
      if (out.length > MAX_COMMANDS) return null;
    }
    return out;
  }

  /** 椭圆（中心、半轴、旋转角，SVG 方向顺时针为正）→ 四段三次贝塞尔组成的闭合路径串。 */
  function ellipsePath(cx, cy, rx, ry, deg = 0) {
    const theta = deg * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta);
    const at = (dx, dy) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    const pair = point => `${num(point[0])} ${num(point[1])}`;
    const kx = rx * KAPPA, ky = ry * KAPPA;
    const segments = [
      [[rx, ky], [kx, ry], [0, ry]],
      [[-kx, ry], [-rx, ky], [-rx, 0]],
      [[-rx, -ky], [-kx, -ry], [0, -ry]],
      [[kx, -ry], [rx, -ky], [rx, 0]],
    ];
    return `M ${pair(at(rx, 0))} ` + segments.map(seg => `C ${seg.map(p => pair(at(p[0], p[1]))).join(' ')}`).join(' ') + ' Z';
  }

  /** 把路径串的 y 取反（镜像一份用），数字重新格式化；路径本身不合规返回 null。 */
  function mirrorPath(d) {
    const cmds = parsePath(d);
    if (!cmds) return null;
    return cmds.map(c => c.cmd + (c.pts.length ? ' ' + c.pts.map(p => `${num(p[0])} ${num(-p[1])}`).join(' ') : '')).join(' ');
  }

  /**
   * 展开一种动物：椭圆变路径、mirror 变成紧跟其后的镜像部件（y 取反，motion 的 pivot 取反、角度反号——镜像把转动方向也翻过来）。
   * 返回 { view, scale, parts: [{ role, u, d, motion|null }], eyes: { r, at }, blush }；未知物种、或任何部件的路径不合规时返回 null
   * （数据错误由调用方报告，这里不抛异常）。
   */
  function expand(id) {
    const shape = Object.prototype.hasOwnProperty.call(SHAPES, id) ? SHAPES[id] : null;
    if (!shape) return null;
    const parts = [];
    for (const part of shape.parts) {
      const d = part.ellipse ? ellipsePath(...part.ellipse) : part.d;
      if (!parsePath(d)) return null;
      const base = { role: part.role, u: part.u === undefined ? 0.5 : part.u, d, motion: part.motion ? { pivot: [...part.motion.pivot], deg: part.motion.deg } : null };
      parts.push(base);
      if (part.mirror) parts.push({ ...base, d: mirrorPath(d), motion: base.motion ? { pivot: [base.motion.pivot[0], -base.motion.pivot[1]], deg: -base.motion.deg } : null });
    }
    return { view: shape.view, scale: shape.scale, parts, eyes: { r: shape.eyes.r, at: shape.eyes.at.map(p => [...p]) }, blush: shape.blush.map(b => [...b]) };
  }

  /** 原生端的坐标：按 scale 缩放、y 翻成向上；转动角度换成 CoreGraphics 的方向（逆时针为正，所以取反）并换成弧度。 */
  function native(id) {
    const shape = expand(id);
    if (!shape) return null;
    const k = shape.scale;
    const parts = shape.parts.map(part => ({
      role: part.role,
      u: part.u,
      cmds: parsePath(part.d).map(c => ({ cmd: c.cmd, pts: c.pts.map(p => [p[0] * k, -p[1] * k]) })),
      motion: part.motion ? { pivot: [part.motion.pivot[0] * k, -part.motion.pivot[1] * k], maxAngle: -part.motion.deg * Math.PI / 180 } : null,
    }));
    return { view: shape.view, scale: k, parts, eyes: { r: shape.eyes.r * k, at: shape.eyes.at.map(p => [p[0] * k, -p[1] * k]) }, blush: shape.blush.map(b => [b[0] * k, -b[1] * k, b[2] * k, b[3] * k]) };
  }

  /** 取样点（包围盒用）：M/L 的端点原样；每段 C/Q 取 SAMPLES 个点（t = i/SAMPLES，i = 1…SAMPLES）。输入是 parsePath 的结果。 */
  function samplePoints(cmds) {
    const pts = [];
    let current = null;
    for (const { cmd, pts: p } of cmds) {
      if (cmd === 'M' || cmd === 'L') { pts.push(p[0]); current = p[0]; }
      else if (cmd === 'C' || cmd === 'Q') {
        for (let i = 1; i <= SAMPLES; i++) {
          const t = i / SAMPLES, s = 1 - t;
          if (cmd === 'C') pts.push([s * s * s * current[0] + 3 * s * s * t * p[0][0] + 3 * s * t * t * p[1][0] + t * t * t * p[2][0], s * s * s * current[1] + 3 * s * s * t * p[0][1] + 3 * s * t * t * p[1][1] + t * t * t * p[2][1]]);
          else pts.push([s * s * current[0] + 2 * s * t * p[0][0] + t * t * p[1][0], s * s * current[1] + 2 * s * t * p[0][1] + t * t * p[1][1]]);
        }
        current = p[p.length - 1];
      }
    }
    return pts;
  }

  function rotateAbout(point, pivot, angle) {
    const cos = Math.cos(angle), sin = Math.sin(angle), dx = point[0] - pivot[0], dy = point[1] - pivot[1];
    return [pivot[0] + dx * cos - dy * sin, pivot[1] + dx * sin + dy * cos];
  }

  /** 某个相位（wave ∈ [-1, 1]）下全部路径部件的包围盒（原生坐标：y 向上），不含描边与眼睛。 */
  function bounds(id, wave = 0) {
    const shape = native(id);
    if (!shape) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const part of shape.parts) {
      for (let point of samplePoints(part.cmds)) {
        if (part.motion) point = rotateAbout(point, part.motion.pivot, part.motion.maxAngle * wave);
        minX = Math.min(minX, point[0]); maxX = Math.max(maxX, point[0]);
        minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
      }
    }
    return { minX, minY, maxX, maxY };
  }

  /** 各相位包围盒的并集：放置按它算，动画任何一帧都在它里面。 */
  function union(id) {
    let out = null;
    for (const wave of WAVES) {
      const box = bounds(id, wave);
      if (!box) return null;
      out = out ? { minX: Math.min(out.minX, box.minX), minY: Math.min(out.minY, box.minY), maxX: Math.max(out.maxX, box.maxX), maxY: Math.max(out.maxY, box.maxY) } : box;
    }
    return out;
  }

  return { SHAPES, AVAILABLE, ROLES, VIEWS, WAVES, MAX_PATH_CHARS, MAX_COMMANDS, SAMPLES, KAPPA, parsePath, ellipsePath, mirrorPath, expand, native, sample: samplePoints, bounds, union, num };
});
