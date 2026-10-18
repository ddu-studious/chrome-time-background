// 8 位 RGBA、无隔行 PNG 的解码（screencapture -l 输出的就是这种）：外观快照与对比度测量共用。
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const MAX_PIXELS = 1 << 26;   // 约 6700 万像素（RGBA 256 MiB）

export function decodePng(file) {
  const data = readFileSync(file);
  let offset = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0; const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset), type = data.toString('latin1', offset + 4, offset + 8), body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colorType = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) throw new Error(`${file}：只支持 8 位 RGBA 无隔行 PNG`);
  if (!(width > 0 && height > 0 && width * height <= MAX_PIXELS)) throw new Error(`${file}：图像尺寸异常（${width}×${height}），不解码`);   // 窗口截图远小于此；损坏的头部宁可报错，也不去申请巨量内存
  const raw = inflateSync(Buffer.concat(idat)), stride = width * 4, pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0, up = y > 0 ? pixels[(y - 1) * stride + x] : 0, upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predict = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1
        : (() => { const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft); return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; })();
      pixels[y * stride + x] = (line[x] + predict) & 255;
    }
  }
  return { width, height, pixels };
}
