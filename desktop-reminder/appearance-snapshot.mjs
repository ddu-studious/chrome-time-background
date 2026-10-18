// 外观基线：在隔离构建里让水母静止（TIMEKEEPER_REDUCE_MOTION=1）、无气泡，只截水母自己的窗口（screencapture -l），
// 用来证明“重构后默认外观与重构前逐像素一致”。不连接 Chrome，不读写任何闹钟或喝水记录，不操作键盘鼠标。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-base
//   node desktop-reminder/appearance-snapshot.mjs --compare=/tmp/tk/appearance-base,/tmp/tk/appearance-after
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-colors --all-colors   （8 个颜色位各拍一张，再用 appearance-contrast.mjs 量对比度）
//   node desktop-reminder/appearance-snapshot.mjs --app=/tmp/tk/QA.app --out=/tmp/tk/appearance-looks --all-looks   （四种花纹各拍一张 + 三个参考色位的纯色图，再用 appearance-looks.mjs 判定画对了没有）
import { spawn, execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { decodePng } from './png-decode.mjs';
import { LOOK_SPECS, REFERENCE_SLOTS } from './appearance-looks.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const EXTENSION_ID = 'a'.repeat(32);

function compareDirs(a, b) {
  const names = readdirSync(a).filter(n => n.endsWith('.png')).sort();
  if (!names.length) throw new Error(`${a} 里没有 PNG`);
  let bad = 0;
  for (const name of names) {
    const left = decodePng(resolve(a, name)), right = decodePng(resolve(b, name));
    if (left.width !== right.width || left.height !== right.height) { bad++; console.log(`✗ ${name}：尺寸不同 ${left.width}×${left.height} 对 ${right.width}×${right.height}`); continue; }
    let first = -1, maxDiff = 0, count = 0;
    for (let i = 0; i < left.pixels.length; i++) {
      const diff = Math.abs(left.pixels[i] - right.pixels[i]);
      if (diff) { count++; maxDiff = Math.max(maxDiff, diff); if (first < 0) first = i; }
    }
    if (count) { bad++; const px = Math.floor(first / 4); console.log(`✗ ${name}：${count} 个字节不同，最大差 ${maxDiff}，首个在 (${px % left.width}, ${Math.floor(px / left.width)})`); }
    else console.log(`✓ ${name}：逐像素一致`);
  }
  process.exit(bad ? 1 : 0);
}

function start(app, env) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${EXTENSION_ID}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', TIMEKEEPER_REDUCE_MOTION: '1', ...env } });
  const host = { child, pending: new Map(), seq: 0, buffer: Buffer.alloc(0) };
  child.stdout.on('data', chunk => {
    host.buffer = Buffer.concat([host.buffer, chunk]);
    while (host.buffer.length >= 4 && host.buffer.length >= host.buffer.readUInt32LE(0) + 4) {
      const size = host.buffer.readUInt32LE(0);
      const message = JSON.parse(host.buffer.subarray(4, size + 4)); host.buffer = host.buffer.subarray(size + 4);
      if (host.pending.has(message.requestId)) { host.pending.get(message.requestId)(message); host.pending.delete(message.requestId); }
    }
  });
  host.request = (command, payload = {}) => new Promise((ok, fail) => {
    const requestId = String(++host.seq);
    const timeout = setTimeout(() => { host.pending.delete(requestId); fail(new Error(`原生组件超时: ${command}`)); }, 5000);
    host.pending.set(requestId, value => { clearTimeout(timeout); ok(value); });
    const body = Buffer.from(JSON.stringify({ command, requestId, ...payload }));
    const header = Buffer.alloc(4); header.writeUInt32LE(body.length);
    child.stdin.write(Buffer.concat([header, body]));
  });
  host.stop = async () => { await host.request('jelly', { jelly: { resident: false } }).catch(() => {}); child.stdin.end(); await delay(300); child.kill(); };
  return host;
}

async function capture(host, file) {
  const deadline = Date.now() + 4000;
  let reply;
  do { reply = await host.request('ping'); if (reply.jellyVisible) break; await delay(100); } while (Date.now() < deadline);
  if (!reply.jellyVisible) throw new Error('水母没有出现');
  await delay(900);
  const windowNumber = (await host.request('ping')).countdownWindowNumber;
  for (let attempt = 0; attempt < 3; attempt++) {
    rmSync(file, { force: true });
    try { execFileSync('/usr/sbin/screencapture', ['-x', '-o', `-l${windowNumber}`, file], { stdio: 'pipe' }); } catch { /* 重试 */ }
    try { if (readFileSync(file).readUInt32BE(16) > 16) return; } catch { /* 重试 */ }
    await delay(500);
  }
  throw new Error(`screencapture 没有取到窗口 ${windowNumber}`);
}

/** 8 个颜色位各拍一张白天（calm）的纯色玻璃水母，写成 color-N.png；窗口截图带 alpha，叠在什么底色上由测量脚本决定。 */
async function captureAllColors(app, out) {
  for (let slot = 0; slot < 8; slot++) {
    const host = start(app, { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '12' });
    try {
      const reply = await host.request('jelly', { jelly: { resident: true, night: false, lines: [], linesUntil: 0, appearance: { color: slot, colors: [slot], look: 'solid', material: 'glass', size: 'medium', season: null } } });
      if (reply.ok !== true) throw new Error(`jelly 被拒绝：${JSON.stringify(reply)}`);
      await capture(host, resolve(out, `color-${slot}.png`));
      console.log(`✓ color-${slot}`);
    } finally { await host.stop(); }
  }
}

/** 四种花纹各拍一张（look-*.png）与参考色位的纯色图（color-N.png），白天、浅色外观、玻璃、中号；供 appearance-looks.mjs 判定“画对了没有”。 */
async function captureAllLooks(app, out) {
  const shots = [...Object.entries(LOOK_SPECS).map(([look, colors]) => [`look-${look}`, look, colors]), ...REFERENCE_SLOTS.map(slot => [`color-${slot}`, 'solid', [slot]])];
  for (const [name, look, colors] of shots) {
    const host = start(app, { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '12' });
    try {
      const reply = await host.request('jelly', { jelly: { resident: true, night: false, lines: [], linesUntil: 0, appearance: { color: colors[0], colors, look, material: 'glass', size: 'medium', season: null } } });
      if (reply.ok !== true) throw new Error(`jelly 被拒绝：${JSON.stringify(reply)}`);
      await capture(host, resolve(out, `${name}.png`));
      console.log(`✓ ${name}`);
    } finally { await host.stop(); }
  }
}

if (arg('compare')) { const [a, b] = arg('compare').split(','); compareDirs(a, b); }
else {
  const app = arg('app'), out = arg('out');
  if (!app || !out) throw new Error('需要 --app=隔离构建 与 --out=输出目录（或 --compare=A,B）');
  mkdirSync(out, { recursive: true });
  if (process.argv.includes('--all-colors')) { await captureAllColors(app, out); process.exit(0); }
  if (process.argv.includes('--all-looks')) { await captureAllLooks(app, out); process.exit(0); }
  // --with-default-appearance：显式下发默认外观；--appearance='{"color":0,...}'：下发指定外观（目测校准调色板用）；--only=calm-light：只拍一张
  const custom = arg('appearance');
  const appearance = custom ? { appearance: JSON.parse(custom) } : process.argv.includes('--with-default-appearance') ? { appearance: { color: 5, colors: [5], look: 'solid', material: 'glass', size: 'medium', season: null } } : {};
  const only = arg('only');
  for (const [name, env, night] of [['calm-light', { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '12' }, false], ['calm-dark', { TIMEKEEPER_APPEARANCE: 'dark', TIMEKEEPER_NIGHT_HOUR: '12' }, false],
    ['night-light', { TIMEKEEPER_APPEARANCE: 'light', TIMEKEEPER_NIGHT_HOUR: '23' }, true], ['night-dark', { TIMEKEEPER_APPEARANCE: 'dark', TIMEKEEPER_NIGHT_HOUR: '23' }, true]].filter(([name]) => !only || only === name)) {
    const host = start(app, env);
    try {
      const reply = await host.request('jelly', { jelly: { resident: true, night, lines: [], linesUntil: 0, ...appearance } });
      if (reply.ok !== true) throw new Error(`jelly 被拒绝：${JSON.stringify(reply)}`);
      await capture(host, resolve(out, `${name}.png`));
      console.log(`✓ ${name}`);
    } finally { await host.stop(); }
  }
}
