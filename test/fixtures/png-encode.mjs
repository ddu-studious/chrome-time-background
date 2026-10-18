// 测试用的最小 PNG 编码器：8 位 RGBA、无隔行；按行轮换 PNG 的五种滤波器，用来检验 desktop-reminder/png-decode.mjs，
// 也让命令行测试能不依赖真实截图就造出输入。只在测试里用，不属于扩展。
import { deflateSync, crc32 } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// PNG 规范里的 Paeth 预测（与规范原文一致：并列时依次偏向 a、b、c）
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body) >>> 0, data.length + 8);
  return out;
}

/**
 * pixels 是 width×height×4 的 RGBA 字节。
 * filters：第 y 行用 filters[y % filters.length]（0 无、1 左、2 上、3 平均、4 Paeth）。
 * idatParts：把压缩数据切成几块 IDAT（真实编码器常这样做）。before：插在 IHDR 之后、IDAT 之前的其它块（如 tEXt）。
 * colorType/depth/interlace 只改文件头，用来造“不支持的格式”。
 */
export function encodePng(width, height, pixels, { filters = [0], idatParts = 1, before = [], colorType = 6, depth = 8, interlace = 0 } = {}) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const filter = filters[y % filters.length];
    raw[y * (stride + 1)] = filter;
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const left = x >= 4 ? pixels[at - 4] : 0;
      const up = y > 0 ? pixels[at - stride] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[at - stride - 4] : 0;
      const predict = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upLeft);
      raw[y * (stride + 1) + 1 + x] = (pixels[at] - predict) & 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = depth;
  header[9] = colorType;
  header[12] = interlace;
  const zipped = deflateSync(raw);
  const size = Math.ceil(zipped.length / idatParts);
  const data = [];
  for (let offset = 0; offset < zipped.length; offset += size) data.push(chunk('IDAT', zipped.subarray(offset, offset + size)));
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), ...before, ...data, chunk('IEND', Buffer.alloc(0))]);
}

/** 确定性的“毛糙”像素：各通道逐字节变化，任何一种滤波器预测错了都会解出不同的值。 */
export function noisyPixels(width, height, seed = 12345) {
  const pixels = Buffer.alloc(width * height * 4);
  let state = seed;
  for (let i = 0; i < pixels.length; i++) { state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff; pixels[i] = (state >> 8) & 255; }
  return pixels;
}
