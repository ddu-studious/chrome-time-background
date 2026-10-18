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
  // 部件的形状有三种写法（有且只有一种）：d 路径串、ellipse [cx, cy, rx, ry, 旋转角]、dots 一串小圆 [[x, y, r], …]（每个圆是同一条路径里的一个子路径）。
  // motion：绕 pivot 旋转，deg 是 wave=±1 时的角度（SVG 方向：顺时针为正），wave 由原生端按游动节奏给出。
  //   可选 squash（0…MAX_SQUASH，默认 0）：同一个 pivot 上把 y 方向缩放到 1 − squash × wave（俯视蝠鲼的拍翼：整片翼一胖一瘦，不像分块转动那样在接缝处裂开），
  //   先缩放后转动；wave = 0（静止、减少动态效果）时两者都不起作用，所以静态画面就是这里写的形状。
  // eyes：眼睛半径与位置（侧视动物只看得见一只眼睛）；blush：腮红椭圆 [x, y, rx, ry]。
  // mouth（可选，只有侧视动物有）：微笑，一段三次贝塞尔的四个点——起点、两个控制点、终点，坐标同上；俯视动物看不见嘴（设计稿 §6），
  //   俯视写了嘴、或四个点不全是有限数字，整种动物不可用（和路径不合规一样，由生成器报告）。睡着时不画，被抓时即使睡着也画。

  const ROLES = Object.freeze(['body', 'limb', 'belly', 'accent', 'shine']);
  const VIEWS = Object.freeze(['side', 'top']);
  const WAVES = Object.freeze([-1, -0.5, 0, 0.5, 1]);     // 并集包围盒取样的相位：放置按它们的并集算，动起来任何一帧都不会越出
  const MAX_PATH_CHARS = 16000;                            // 一个部件的路径串上限（鲸鲨的斑点是一个部件里的几十个小圆）
  const MAX_COMMANDS = 800;
  const SAMPLES = 16;                                      // 每段贝塞尔取样点数（包围盒用，原生端同一个值）
  const KAPPA = 0.5522847498307936;                        // 四段三次贝塞尔近似椭圆的控制点系数
  const MAX_SQUASH = 0.3;                                  // 拍翼幅度上限：wave = ±1 时 y 方向缩放到 1 ∓ squash（0.7…1.3 倍）；Swift 的 SpeciesMotion.maxSquash 取同一个值

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
    // 蝠鲼（俯视）：整片菱形的翼是躯干（拍翼 = 垂直方向一胖一瘦，不分块转动，所以接缝不会裂开），中央一条浅色的身体带着眼睛，
    // 前端两只头鳍，后面一根长尾（轻轻左右摆）。长度约 86 pt、翼展约 58 pt（缩放 0.85）；游得最慢、滑行最远（调参见 JellySpecies.swimProfile）。
    manta: {
      view: 'top',
      scale: 0.85,
      parts: [
        { role: 'limb', u: 0.05, d: 'M -24 -2.2 C -36 -1.6 -50 -0.8 -61 -0.4 L -61 0.4 C -50 0.8 -36 1.6 -24 2.2 Z', motion: { pivot: [-24, 0], deg: 8 } },
        { role: 'body', d: 'M 26 -5 C 19 -13 10 -23 -5 -31 C -8 -25 -17 -12 -27 -3 L -27 3 C -17 12 -8 25 -5 31 C 10 23 19 13 26 5 C 29 2 29 -2 26 -5 Z', motion: { pivot: [0, 0], deg: 0, squash: 0.1 } },
        { role: 'shine', ellipse: [6, -12, 10, 1.8, 40] },
        { role: 'limb', u: 0.55, ellipse: [6, 0, 20.5, 7.6, 0] },
        { role: 'limb', u: 0.95, mirror: true, d: 'M 24 -3.2 C 30 -4.5 36 -7 40 -6.5 C 38 -3.8 32 -1.6 26 -0.6 Z' },
      ],
      eyes: { r: 2, at: [[18, -3.6], [18, 3.6]] },
      blush: [[13.5, -5.2, 2.4, 1.5], [13.5, 5.2, 2.4, 1.5]],
    },
    // 海龟（侧视）：龟壳穹顶 + 鳍状肢最像，侧视才认得出来（俯视像一只盘子）；慢而稳（调参见 JellySpecies.swimProfile）。长度约 78 pt、高约 38 pt（含摆动的鳍与尾），缩放 1（坐标就是桌面上的点）。
    // 龟壳是躯干（穹顶，下沿一道浅色的腹甲），头是肢体（和鳍、尾同一个肤色），脸画在头上；壳纹是一个 accent 部件里的 22 个互不重叠的多边形：
    // 六边形接缝（宽 1.3 pt，白色半透明）被切成 17 条条带，五处三岔口各补一个小三角，所以相邻的两块之间没有重叠也没有缝（重叠的子路径在偶奇规则下会被挖成洞），
    // 条带的末端停在离轮廓 0.75 pt 的地方（刚好接到描边的内沿），短于 5 pt 的碎段不要（会像散落的小刺）。接缝网络由 6 边形格子（外接圆半径 8、中心 (0, -9)）算出后固定在这里，
    // 不在运行时生成；形状、不重叠、不出壳与不碰高光由 test/jelly-species-shapes.test.js 的海龟用例守住。画的次序：远侧的鳍与尾与头在最底下，腹甲（肢体色的一圈 + 浅色的 belly）在壳之下，
    // 壳盖住它们的根部；壳纹与高光在壳之上；近侧的后鳍与前鳍最后画，盖在壳与腹甲的边缘上。远侧的前鳍与近侧的反相摆动（一前一后），所以划起来是交替的。
    turtle: {
      view: 'side',
      scale: 1,
      parts: [
        { role: 'limb', u: 0.72, d: 'M 22 1 C 26 4 31 9 33 15 C 31 17.5 27.5 17 25.5 13.5 C 23.5 10 21 6 19.5 3 Z', motion: { pivot: [20, 2], deg: -18 } },
        { role: 'limb', u: 0.25, d: 'M -9 5 C -11 10 -14 14 -17.5 16.5 C -12.5 17 -7.5 14.5 -4.5 9 Z', motion: { pivot: [-8, 5], deg: -10 } },
        { role: 'limb', u: 0.05, d: 'M -24 -1.5 C -29 -1.5 -33 0.5 -35.5 3.8 C -31 5 -27.5 5 -24 3.5 Z', motion: { pivot: [-24, 1], deg: 8 } },
        { role: 'limb', u: 0.95, d: 'M 21 -8 C 26 -12.5 36 -12.5 40.5 -6 C 43 -2 42.5 5 37.5 8.5 C 32 12 25 11 21 8 Z' },
        { role: 'limb', u: 0.55, d: 'M -26 3 C -22 11.5 -8 14.5 2 14.5 C 12 14.5 22 11.5 25.5 3 Z' },
        { role: 'belly', d: 'M -23 4 C -19 8.8 -7 11.4 2 11.4 C 11 11.4 20 8.8 23 4 Z' },
        { role: 'body', d: 'M -27 4 C -28 -9 -18 -19 -2 -19 C 13 -19 25 -10 26 4 C 15 8.5 -14 8.5 -27 4 Z' },
        { role: 'accent', d: [
          'M -15.625 -8.35 L -19.249 -2.072 L -20.375 -2.722 L -16.375 -9.65 Z',
          'M -20.375 -1.422 L -25.16 -1.422 L -25.16 -2.722 L -20.375 -2.722 Z',
          'M -16.375 5.506 L -20.375 -1.422 L -19.249 -2.072 L -15.625 4.206 Z',
          'M -3.625 -15.278 L -7.249 -9 L -8.375 -9.65 L -4.375 -16.578 Z',
          'M -16.375 -9.65 L -8.375 -9.65 L -8.375 -8.35 L -15.625 -8.35 Z',
          'M -3.625 -1.422 L -7.625 5.506 L -8.375 4.206 L -4.751 -2.072 Z',
          'M -15.625 4.206 L -8.375 4.206 L -7.625 5.506 L -16.375 5.506 Z',
          'M -4.751 -2.072 L -8.375 -8.35 L -7.249 -9 L -3.625 -2.722 Z',
          'M -4.375 -16.578 L 4.375 -16.578 L 3.625 -15.278 L -3.625 -15.278 Z',
          'M 3.625 -2.722 L 7.249 -9 L 8.375 -8.35 L 4.751 -2.072 Z',
          'M -3.625 -2.722 L 3.625 -2.722 L 3.625 -1.422 L -3.625 -1.422 Z',
          'M 4.375 -16.578 L 8.375 -9.65 L 7.249 -9 L 3.625 -15.278 Z',
          'M 4.751 -2.072 L 8.375 4.206 L 7.625 5.506 L 3.625 -1.422 Z',
          'M 15.625 -8.35 L 8.375 -8.35 L 8.375 -9.65 L 16.375 -9.65 Z',
          'M 15.625 4.206 L 19.249 -2.072 L 20.751 -2.072 L 16.375 5.506 Z',
          'M 16.375 5.506 L 7.625 5.506 L 8.375 4.206 L 15.625 4.206 Z',
          'M 16.375 -9.65 L 20.751 -2.072 L 19.249 -2.072 L 15.625 -8.35 Z',
          'M -19.249 -2.072 L -20.375 -1.422 L -20.375 -2.722 Z',
          'M -8.375 -9.65 L -7.249 -9 L -8.375 -8.35 Z',
          'M -3.625 -2.722 L -3.625 -1.422 L -4.751 -2.072 Z',
          'M 4.751 -2.072 L 3.625 -1.422 L 3.625 -2.722 Z',
          'M 8.375 -9.65 L 8.375 -8.35 L 7.249 -9 Z',
        ].join(' ') },
        { role: 'shine', ellipse: [-13.5, -13.5, 8, 1.1, -25] },
        { role: 'limb', u: 0.25, d: 'M -14 3 C -19 4 -25 8.5 -29 13.5 C -24 14.5 -19 13.5 -15 9.5 C -13 7.5 -12 5 -14 3 Z', motion: { pivot: [-14, 4], deg: 12 } },
        { role: 'limb', u: 0.72, d: 'M 19 0.5 C 24 3 23.5 9 17 13.5 C 12 17 5 17.5 2 15.5 C 0.5 14 4.5 10 8 6.5 C 11 3.5 14 1.5 19 0.5 Z', motion: { pivot: [15, 3.5], deg: 20 } },
      ],
      eyes: { r: 2.2, at: [[35.2, -3.6]] },
      blush: [[33, 2.6, 2.6, 1.6]],
      mouth: [[39.4, 2.4], [38.5, 5.2], [35.6, 5.4], [34.2, 3.2]],
    },
    // 鲸鲨（侧视）：长身、宽扁的头、背上一排排白斑是最好认的特征，侧视最清楚；游得最平稳（纵向起伏最小，横向比小锤头鲨慢、与蝠鲼相当）。长度约 90 pt、高约 34 pt（含摆动的尾与鳍）。
    // 斑点是一个 accent 部件里的 60 个小圆（六角晶格排布，避开眼睛、腮红、嘴与腹部）；腹部是浅色的 belly；眼睛只看得见一只，笑着，脸红红的。
    // 背上的高光整条落在躯干里（背线向尾部是降下去的，所以高光偏向头一侧；曾经中心在 8、ry 1.3，左端越出背线约 0.34 pt，由“高光不越出躯干”的测试守住）。
    whaleshark: {
      view: 'side',
      scale: 0.9,
      parts: [
        { role: 'limb', u: 0.05, d: 'M -31 -2.8 C -37 -3.4 -44 -7.6 -50 -14.5 C -49.8 -9.2 -47.5 -4.2 -44 -0.5 C -46.5 2.4 -48 7.2 -48.5 11.5 C -42.5 8.8 -36.5 5.2 -31 2.8 Z', motion: { pivot: [-31, 0], deg: 12 } },
        { role: 'limb', u: 0.22, d: 'M -17 -6.2 C -20 -9.6 -23.5 -11.4 -27.5 -12 C -27.5 -9 -28.5 -6 -30.5 -2.9 Z' },
        { role: 'limb', u: 0.55, d: 'M 16 -10.8 C 13 -15.6 9 -18.6 3.5 -19.6 C 3 -15.5 0.5 -11.8 -4.5 -9 Z' },
        { role: 'body', d: 'M 47.2 -3.2 C 47.2 -8.2 42.5 -10.8 35 -11.2 C 24 -11.8 8 -11.4 -6 -9.2 C -17 -7.4 -27 -5 -34 -2.6 C -35.6 -1.8 -36.2 -0.8 -36.2 0 C -36.2 0.8 -35.6 1.8 -34 2.6 C -26 5.2 -14 9.4 0 11 C 12 12.2 28 12.6 38 10 C 44.5 8.4 47.2 5.8 47.2 1.6 Z' },
        { role: 'belly', d: 'M 46.6 1.2 C 40 2.6 32 4.6 22 5.4 C 8 6.2 -8 3.6 -22 1.4 C -26 0.8 -30 0.6 -33.6 0.8 L -33.9 1.6 C -27 4.2 -14 8.5 0 10.2 C 12 11.4 28 11.8 38 9.2 C 43.5 7.8 46.4 5.2 46.6 1.2 Z' },
        { role: 'limb', u: 0.78, d: 'M 25.5 5.2 C 25 9.6 17.5 14.4 6.2 15.8 C 8 11.8 11.4 7.4 16.5 5.4 C 19.5 4.4 23.2 4.2 25.5 5.2 Z', motion: { pivot: [21, 5.4], deg: 8 } },
        { role: 'accent', dots: [
        [-4.75, -6.64, 1.32], [-1.45, -6.64, 1.34], [1.85, -6.64, 1.34], [5.15, -6.64, 1.32], [8.45, -6.64, 1.3], [11.75, -6.64, 1.28],
        [15.05, -6.64, 1.26], [18.35, -6.64, 1.24], [21.65, -6.64, 1.22], [24.95, -6.64, 1.2], [28.25, -6.64, 1.18], [31.55, -6.64, 1.16],
        [41.45, -6.64, 1.1], [-19.6, -3.78, 1.23], [-16.3, -3.78, 1.25], [-13, -3.78, 1.27], [-9.7, -3.78, 1.29], [-6.4, -3.78, 1.31],
        [-3.1, -3.78, 1.33], [0.2, -3.78, 1.35], [3.5, -3.78, 1.33], [6.8, -3.78, 1.31], [10.1, -3.78, 1.29], [13.4, -3.78, 1.27],
        [16.7, -3.78, 1.25], [20, -3.78, 1.23], [23.3, -3.78, 1.21], [26.6, -3.78, 1.19], [29.9, -3.78, 1.17], [43.1, -3.78, 1.09],
        [-27.85, -0.92, 1.18], [-24.55, -0.92, 1.2], [-21.25, -0.92, 1.22], [-17.95, -0.92, 1.24], [-14.65, -0.92, 1.26], [-11.35, -0.92, 1.28],
        [-8.05, -0.92, 1.3], [-4.75, -0.92, 1.32], [-1.45, -0.92, 1.34], [1.85, -0.92, 1.34], [5.15, -0.92, 1.32], [8.45, -0.92, 1.3],
        [11.75, -0.92, 1.28], [15.05, -0.92, 1.26], [18.35, -0.92, 1.24], [21.65, -0.92, 1.22], [24.95, -0.92, 1.2], [28.25, -0.92, 1.18],
        [31.55, -0.92, 1.16], [41.45, -0.92, 1.1], [-3.1, 1.94, 1.33], [0.2, 1.94, 1.35], [3.5, 1.94, 1.33], [6.8, 1.94, 1.31],
        [10.1, 1.94, 1.29], [13.4, 1.94, 1.27], [16.7, 1.94, 1.25], [20, 1.94, 1.23], [23.3, 1.94, 1.21], [26.6, 1.94, 1.19],
        ] },
        { role: 'shine', ellipse: [11.5, -9.6, 16, 1.2, -3] },
      ],
      eyes: { r: 2.2, at: [[37, -3]] },
      blush: [[33.6, 2.9, 2.8, 1.8]],
      mouth: [[45, 3.4], [43.6, 6], [40.6, 6], [39.2, 3.6]],
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
   * 返回 { view, scale, parts: [{ role, u, d, motion|null }], eyes: { r, at }, blush, mouth|null }；未知物种、任何部件的写法不是有且只有一种
   * （d / ellipse / dots）、路径或小圆不合规、转动幅度不合规、或嘴不合规（俯视动物写了嘴、不是四个有限数字的点）时返回 null
   * （数据错误由调用方报告，这里不抛异常）。
   */
  function expand(id) {
    const shape = Object.prototype.hasOwnProperty.call(SHAPES, id) ? SHAPES[id] : null;
    if (!shape) return null;
    let mouth = null;
    if (shape.mouth !== undefined && shape.mouth !== null) {
      const valid = Array.isArray(shape.mouth) && shape.mouth.length === 4 && shape.mouth.every(p => Array.isArray(p) && p.length === 2 && p.every(isFiniteNumber));
      if (shape.view !== 'side' || !valid) return null;
      mouth = shape.mouth.map(p => [...p]);
    }
    const parts = [];
    for (const part of shape.parts) {
      // 写法有且只有一种（d、ellipse、dots）：同时写了两种会悄悄只认其中一种，宁可整种动物不可用，由生成器报告
      if ([part.d, part.ellipse, part.dots].filter(value => value !== undefined).length !== 1) return null;
      let d;
      if (part.dots !== undefined) {
        // 一串小圆（鲸鲨的斑点）：[x, y, r] 的列表，半径必须是正的有限数；每个圆是路径里的一个子路径
        const valid = Array.isArray(part.dots) && part.dots.length > 0 && part.dots.every(c => Array.isArray(c) && c.length === 3 && c.every(isFiniteNumber) && c[2] > 0);
        if (!valid) return null;
        d = part.dots.map(([x, y, r]) => ellipsePath(x, y, r, r)).join(' ');
      } else d = part.ellipse !== undefined ? ellipsePath(...part.ellipse) : part.d;
      if (!parsePath(d)) return null;
      let motion = null;
      if (part.motion) {
        const squash = part.motion.squash === undefined ? 0 : part.motion.squash;
        if (!(typeof squash === 'number' && Number.isFinite(squash) && squash >= 0 && squash <= MAX_SQUASH)) return null;
        motion = { pivot: [...part.motion.pivot], deg: part.motion.deg, squash };
      }
      const base = { role: part.role, u: part.u === undefined ? 0.5 : part.u, d, motion };
      parts.push(base);
      if (part.mirror) parts.push({ ...base, d: mirrorPath(d), motion: base.motion ? { pivot: [base.motion.pivot[0], -base.motion.pivot[1]], deg: -base.motion.deg, squash: base.motion.squash } : null });
    }
    return { view: shape.view, scale: shape.scale, parts, eyes: { r: shape.eyes.r, at: shape.eyes.at.map(p => [...p]) }, blush: shape.blush.map(b => [...b]), mouth };
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
      motion: part.motion ? { pivot: [part.motion.pivot[0] * k, -part.motion.pivot[1] * k], maxAngle: -part.motion.deg * Math.PI / 180, squash: part.motion.squash } : null,
    }));
    return { view: shape.view, scale: k, parts, eyes: { r: shape.eyes.r * k, at: shape.eyes.at.map(p => [p[0] * k, -p[1] * k]) }, blush: shape.blush.map(b => [b[0] * k, -b[1] * k, b[2] * k, b[3] * k]), mouth: shape.mouth ? shape.mouth.map(p => [p[0] * k, -p[1] * k]) : null };
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

  /** 部件在 wave 相位的位置（原生坐标）：先绕 pivot 把 y 方向缩放到 1 − squash × wave（拍翼：wave = 1 最瘦、−1 最胖），再绕 pivot 转 maxAngle × wave。 */
  function movePoint(point, motion, wave) {
    let moved = point;
    if (motion.squash) moved = [moved[0], motion.pivot[1] + (moved[1] - motion.pivot[1]) * (1 - motion.squash * wave)];
    return rotateAbout(moved, motion.pivot, motion.maxAngle * wave);
  }

  /** 某个相位（wave ∈ [-1, 1]）下全部路径部件的包围盒（原生坐标：y 向上），不含描边与眼睛。 */
  function bounds(id, wave = 0) {
    const shape = native(id);
    if (!shape) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const part of shape.parts) {
      for (let point of samplePoints(part.cmds)) {
        if (part.motion) point = movePoint(point, part.motion, wave);
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

  return { SHAPES, AVAILABLE, ROLES, VIEWS, WAVES, MAX_PATH_CHARS, MAX_COMMANDS, SAMPLES, KAPPA, MAX_SQUASH, parsePath, ellipsePath, mirrorPath, expand, native, sample: samplePoints, bounds, union, num };
});
