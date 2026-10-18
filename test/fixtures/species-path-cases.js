// 动物路径解析的对照用例：JS 的 parsePath（test/jelly-species-shapes.test.js）与 Swift 的 SpeciesPath.parse
// （test/desktop-companion-logic.test.mjs 把这批用例交给 companion-selftest 回显）共用同一份，两边对同一输入必须同样接受或拒绝。
const S = require('../../js/jelly-species-shapes.js');

// 取样对照用的曲线（控制点坐标两两不同、非对称，使每一项系数都影响取样点）：JS 的 sample、Swift 的 SpeciesPath.sample 与测试里
// 独立的 De Casteljau 算法逐点对拍。
const CURVES = [
  'M 3 -2 C 11 17 -7 5 13 -19',
  'M -4 6 Q 15 -9 7 12',
  'M 1 2 C 4 9 -6 13 8 -3 Q 12 5 -2 -7 L 9 4 C 0 -5 6 7 -8 2 Z',
  // 二次贝塞尔之后接曲线：后一段必须以它的终点为起点（取样用的“当前点”要跟着更新）
  'M 0 0 Q 10 10 20 0 C 30 0 40 10 50 10',
  'M 0 0 Q 4 8 8 0 Q 12 -8 16 0 L 20 5',
];

// 合规：命令全集、多个子路径、空白种类、负零、命令数刚好在上限内、取样对照用的曲线，以及数据表里每种动物的每个部件。
const VALID = [
  'M 10 -7 L -2 -25 C -6 -22 -8 -14 -9 -6 Q 1.5 2.25 3 4 Z',
  'M 0 0 L 1 1 Z M 5 5 L 6 6 Z',
  'M\t1\n2  L   3\r\n4',
  'M -0 0.5',
  'M 0 0 ' + 'L 1 1 '.repeat(S.MAX_COMMANDS - 1),
  // 长度刚好等于上限（UTF-16 单位）：靠一个很长的小数凑出整数长度，命令数只有两条
  'M 0 0 L 1.' + '0'.repeat(S.MAX_PATH_CHARS - 12) + ' 1',
  ...CURVES,
  ...S.AVAILABLE.filter(id => id !== 'jelly').flatMap(id => S.expand(id).parts.map(part => part.d)),
];

// 不合规：每项 [名称, 输入]；Swift 只能接收字符串，非字符串输入在 Swift 一侧按“不是字符串”处理，结果同样是拒绝。
const BAD = [
  ['不是字符串', null], ['undefined', undefined], ['数字', 3], ['对象', {}], ['数组', ['M 0 0']],
  ['空串', ''], ['只有空白', '   \n'],
  ['不以 M 开头', 'L 1 1'], ['Z 开头', 'Z'],
  ['小写命令', 'm 0 0 l 1 1'], ['相对命令', 'M 0 0 l 1 1'], ['H', 'M 0 0 H 5'], ['V', 'M 0 0 V 5'], ['S', 'M 0 0 S 1 1 2 2'], ['T', 'M 0 0 T 1 1'], ['A', 'M 0 0 A 1 1 0 0 0 5 5'],
  ['未知字母', 'M 0 0 X 1 1'],
  ['命令与数字粘在一起', 'M0 0 L 1 1'], ['数字粘着命令', 'M 0 0L 1 1'],
  ['缺数字（M）', 'M 1'], ['缺数字（L）', 'M 0 0 L 1'], ['缺数字（C）', 'M 0 0 C 1 1 2 2 3'], ['缺数字（Q）', 'M 0 0 Q 1 1 2'],
  ['多余数字（隐式重复 L）', 'M 0 0 L 1 1 2 2'], ['多余数字（M 后三个）', 'M 0 0 5'], ['Z 后跟数字', 'M 0 0 L 1 1 Z 5'],
  ['Z 之后不是 M', 'M 0 0 L 1 1 Z L 2 2'],
  ['逗号分隔', 'M 0,0 L 1,1'],
  ['指数', 'M 1e3 0'], ['前导加号', 'M +1 0'], ['省略整数部分', 'M .5 0'], ['省略小数部分', 'M 5. 0'], ['十六进制', 'M 0x10 0'], ['无穷', 'M Infinity 0'], ['NaN', 'M NaN 0'], ['两个负号', 'M --1 0'], ['数字里有字母', 'M 1a 0'],
  ['全角数字', 'M １ ０'], ['不间断空格', 'M\u00A00 0'],
  ['数字太大（溢出成无穷）', 'M ' + '9'.repeat(400) + ' 0'],
  ['过长', 'M 0 0 ' + 'L 1 1 '.repeat(S.MAX_PATH_CHARS)],
  ['命令过多', 'M 0 0 ' + 'L 1 1 '.repeat(S.MAX_COMMANDS + 1)],
  ['长度超出上限一个字符', 'M 0 0 L 1.' + '0'.repeat(S.MAX_PATH_CHARS - 11) + ' 1'],
  ['命令数超出上限一条', 'M 0 0 ' + 'L 1 1 '.repeat(S.MAX_COMMANDS)],
];

module.exports = { VALID, BAD, CURVES };
