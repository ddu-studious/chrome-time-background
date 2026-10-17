// PNG 解码（desktop-reminder/png-decode.mjs）：外观快照与对比度测量共用，输入是 screencapture -l 的 8 位 RGBA 无隔行 PNG。
// 用 test/fixtures/png-encode.mjs 造出五种滤波器各自的文件，往返后必须逐字节一致。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../desktop-reminder/png-decode.mjs';
import { encodePng, chunk, noisyPixels } from './fixtures/png-encode.mjs';

function roundTrip(width, height, options, pixels = noisyPixels(width, height)) {
  const dir = mkdtempSync(join(tmpdir(), 'png-decode-'));
  try {
    const file = join(dir, 'x.png');
    writeFileSync(file, encodePng(width, height, pixels, options));
    return { decoded: decodePng(file), pixels, file };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const FILTER_NAMES = ['无', '左', '上', '平均', 'Paeth'];

for (let filter = 0; filter < 5; filter++) {
  test(`decodePng：滤波器 ${filter}（${FILTER_NAMES[filter]}）整张图往返逐字节一致`, () => {
    const { decoded, pixels } = roundTrip(7, 6, { filters: [filter] });
    assert.equal(decoded.width, 7);
    assert.equal(decoded.height, 6);
    assert.equal(decoded.pixels.length, 7 * 6 * 4);
    assert.equal(Buffer.compare(decoded.pixels, pixels), 0);
  });
}

test('decodePng：每行换一种滤波器、IDAT 切成多块、夹着别的块，仍逐字节一致', () => {
  const extra = chunk('tEXt', Buffer.from('Comment\0hello', 'latin1'));
  const { decoded, pixels } = roundTrip(16, 15, { filters: [0, 1, 2, 3, 4], idatParts: 4, before: [extra] });
  assert.equal(decoded.width, 16);
  assert.equal(decoded.height, 15);
  assert.equal(Buffer.compare(decoded.pixels, pixels), 0);
});

test('decodePng：宽高不同、单像素、反向滤波器顺序都能解', () => {
  for (const [w, h, filters] of [[1, 1, [4]], [1, 9, [4, 3, 2, 1, 0]], [9, 1, [3]], [5, 3, [4, 2, 4]]]) {
    const { decoded, pixels } = roundTrip(w, h, { filters });
    assert.equal(decoded.width, w);
    assert.equal(decoded.height, h);
    assert.equal(Buffer.compare(decoded.pixels, pixels), 0, `${w}×${h} ${filters}`);
  }
});

// 低熵像素：字节只取 {0,1,2,3,254,255}，于是 Paeth 的并列（pa==pb、pb==pc）与各个“边缘默认值”（第一列的左/左上、第一行的上/左上）
// 都会频繁出现；随机字节几乎碰不到这些边界（字节恰好是 1 的概率只有 1/256）。
function lowEntropyPixels(width, height, seed) {
  const choices = [0, 1, 2, 3, 254, 255], pixels = Buffer.alloc(width * height * 4);
  let state = seed * 7919;
  for (let i = 0; i < pixels.length; i++) { state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff; pixels[i] = choices[(state >> 10) % choices.length]; }
  return pixels;
}

test('decodePng：低熵图像下五种滤波器仍逐字节一致（Paeth 的并列取舍与边缘默认值）', () => {
  for (let seed = 1; seed <= 14; seed++) {
    for (let filter = 0; filter < 5; filter++) {
      const w = 4 + (seed % 4), h = 3 + (seed % 5);
      const { decoded, pixels } = roundTrip(w, h, { filters: [filter] }, lowEntropyPixels(w, h, seed));
      assert.equal(Buffer.compare(decoded.pixels, pixels), 0, `种子 ${seed}，滤波器 ${filter}，${w}×${h}`);
    }
  }
});

test('decodePng：只认 8 位 RGBA 无隔行，其它格式明确报错并带文件名', () => {
  for (const options of [{ depth: 16 }, { colorType: 2 }, { colorType: 3 }, { interlace: 1 }]) {
    const dir = mkdtempSync(join(tmpdir(), 'png-decode-'));
    try {
      const file = join(dir, 'bad.png');
      writeFileSync(file, encodePng(3, 3, noisyPixels(3, 3), options));
      assert.throws(() => decodePng(file), error => /只支持 8 位 RGBA 无隔行 PNG/.test(error.message) && error.message.includes('bad.png'), JSON.stringify(options));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

// 损坏或恶意的头部：宽高乘积巨大而数据极少。必须在申请缓冲区之前报错，否则会去申请几个 GB（曾有变异体把高度读成 1.3 亿行，整套测试卡住）。
test('decodePng：头部给出异常尺寸时在分配内存之前报错并带文件名', () => {
  const dir = mkdtempSync(join(tmpdir(), 'png-decode-'));
  try {
    // 8192×8192 = 1 << 26 正是上限；刚超出一点点（多一行/多一列）也必须被拒绝，所以上限被抬高的变体会被发现。
    // 恰好等于上限与略低于上限的一侧要真去解码 256 MiB 的像素缓冲，单元测试里不做（已记入技术文档“未覆盖的边界”）。
    for (const [width, height] of [[100000, 100000], [8, 134217728], [0, 8], [8, 0], [8192, 8193], [8193, 8192]]) {
      const ihdr = Buffer.alloc(13);
      ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
      const file = join(dir, `huge-${width}x${height}.png`);
      writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(16))), chunk('IEND', Buffer.alloc(0))]));
      assert.throws(() => decodePng(file), error => /图像尺寸异常/.test(error.message) && error.message.includes(`huge-${width}x${height}.png`), `${width}×${height}`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('decodePng：文件不存在时把系统错误抛出来，不返回空图', () => {
  assert.throws(() => decodePng(join(tmpdir(), 'not-there-png-decode.png')), /ENOENT/);
});
