// 隔离验收：桌面水母（协议 v6 引入、v7 沿用；常驻与临时出现、倒计时委托、喝水/起身提醒气泡、到点响铃、右键菜单动作、夜晚荧光、减少动态效果、真实鼠标）。
// 用独立构建的原生组件（--app，独立 Bundle ID，不改写真实组件保存的位置），不连接 Chrome，不读写任何闹钟或喝水记录。
//   node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
//   node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-mouse] [--shots=/tmp/tk/shots] [--only=ring|ring-mouse|nudge-mouse]
// 右键菜单动作与响铃按钮经隔离测试钩子 menuItem / ringButton 触发（环境变量 TIMEKEEPER_TEST_HOOKS=1，只有本脚本设置；正式组件对它们恒回 ok:false）。
// 鼠标阶段用 mouse-helper.swift 合成真实事件，只点击水母自己的窗口；截图只用 `screencapture -l <窗口号>`，不截整屏或区域。
// 真实鼠标与截图需要终端的“辅助功能/屏幕录制”权限；--no-mouse 跳过鼠标阶段；--only=ring 只跑到点响铃阶段、--only=ring-mouse 只跑其中的真实鼠标场景、--only=nudge-mouse 只跑喝水提醒按钮的真实鼠标阶段（都是调试用）。
// 响铃阶段会读写独立 Bundle ID（--app 的 CFBundleIdentifier，必须不是真实组件的）下的 CompanionX，用来核对响铃不改写水母记住的位置。
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { mkdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const JellyfishCore = createRequire(import.meta.url)('../js/jellyfish-core.js');

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg('extension-id');
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = arg('app');
if (!app) throw new Error('必须用 --app 指向隔离构建，避免改写真实组件的窗口记忆');
const shots = arg('shots');
const only = arg('only');
if (only && !['ring', 'ring-mouse', 'nudge-mouse'].includes(only)) throw new Error('--only 目前只支持 ring、ring-mouse、nudge-mouse');
if ((only === 'ring-mouse' || only === 'nudge-mouse') && process.argv.includes('--no-mouse')) throw new Error(`--only=${only} 需要真实鼠标，不能带 --no-mouse`);
const withMouse = !process.argv.includes('--no-mouse');
if (shots) mkdirSync(shots, { recursive: true });
let helper = null;
if (withMouse) {
  helper = resolve('/tmp', `tk-mouse-helper-${process.pid}`);
  execFileSync('/usr/bin/xcrun', ['swiftc', resolve(root, 'desktop-reminder/mouse-helper.swift'), '-module-cache-path', resolve(root, 'local-ai/.local/swift-cache'), '-o', helper], { stdio: 'inherit' });
}

function start(env = {}) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', ...env } });
  const host = { child, events: [], pending: new Map(), seq: 0, buffer: Buffer.alloc(0) };
  child.stdout.on('data', chunk => {
    host.buffer = Buffer.concat([host.buffer, chunk]);
    while (host.buffer.length >= 4 && host.buffer.length >= host.buffer.readUInt32LE(0) + 4) {
      const size = host.buffer.readUInt32LE(0);
      const message = JSON.parse(host.buffer.subarray(4, size + 4)); host.buffer = host.buffer.subarray(size + 4);
      if (host.pending.has(message.requestId)) { host.pending.get(message.requestId)(message); host.pending.delete(message.requestId); }
      else host.events.push(message);
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
  host.waitEvent = async (type, ms = 3000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { const index = host.events.findIndex(e => e.type === type); if (index >= 0) return host.events.splice(index, 1)[0]; await delay(40); }
    // 失败时带上当时的状态与已收到的事件，下次出现间歇失败时能直接判断是点击没送到、窗口不在，还是状态不对
    const snapshot = await host.request('ping').then(r => JSON.stringify({ frame: r.countdownFrame, mouse: r.mouse, bubble: r.jellyBubble, visible: r.jellyVisible, nudgeId: r.nudgeId, nudgeBusy: r.nudgeBusy, nudgeButtons: r.nudgeButtons, ringId: r.ringId }), () => '读取失败');
    throw new Error(`没有收到 ${type}；当时的状态 ${snapshot}；已收到的其他事件 ${host.events.map(e => e.type).join(',') || '无'}`);
  };
  host.noEvent = (type, message) => assert.equal(host.events.some(e => e.type === type), false, message);
  host.stop = async () => { await host.request('countdown', { timer: null }).catch(() => {}); await host.request('jelly', { jelly: { resident: false } }).catch(() => {}); child.stdin.end(); await delay(300); };
  return host;
}
const frameOf = text => { const m = text.match(/\{\{(-?[\d.]+), (-?[\d.]+)\}, \{([\d.]+), ([\d.]+)\}\}/); return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] }; };
const center = text => { const f = frameOf(text); return { x: f.x + f.w / 2, y: f.y + f.h / 2 }; };
const mouse = (...a) => execFileSync(helper, a.map(String));
// 截图偶发失败：要么命令报错（三十多次里出现过 1 次），要么“成功”却只给一张 1×1 的图（2026-10-16 在鼠标整轮验收里出现过 1 次，原因未查明）。
// 两种情况都隔 0.5 秒重试，最多三次，仍取不到有效图像才报告（调用方把它当作“跳过”，不当作通过）。
const pngWidth = file => { try { return readFileSync(file).readUInt32BE(16); } catch { return 0; } };
function capture(file, windowNumber) {
  for (let attempt = 0; attempt < 3; attempt++) {
    rmSync(file, { force: true });            // 目标文件可能是上一轮留下的旧图，不能拿它冒充这一次的结果
    try { execFileSync('/usr/sbin/screencapture', ['-x', '-o', `-l${windowNumber}`, file], { stdio: 'pipe' }); } catch { /* 下面按图像宽度判断并重试 */ }
    if (pngWidth(file) > 16) return;
    execFileSync('/bin/sleep', ['0.5']);
  }
  throw new Error(`screencapture 没有取到窗口 ${windowNumber} 的有效图像`);
}
const shot = (name, windowNumber) => { if (!shots) return; try { capture(resolve(shots, `${name}.png`), windowNumber); } catch { console.log('截图失败（可能没有屏幕录制权限）:', name); } };
// 最小 PNG 解码（8 位 RGBA、无隔行，screencapture 的输出）：核对水母窗口四周的像素是否完全透明，并在气泡里取样看底色深浅。
function decodePng(file) {
  const data = readFileSync(file);
  let offset = 8, width = 0, height = 0, depth = 0, colorType = 0, interlace = 0; const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset), type = data.toString('latin1', offset + 4, offset + 8), body = data.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; colorType = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    offset += 12 + length;
  }
  if (depth !== 8 || colorType !== 6 || interlace !== 0) return null;
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
  return { width, height, stride, pixels };
}
// 外圈 ring 像素宽度内取最大 alpha：光晕与气泡阴影必须在窗口边缘之前就衰减完，否则就是一个方框
function borderAlpha(png) {
  const { width, height, stride, pixels } = png;
  const ring = 8; let max = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (x >= ring && x < width - ring && y >= ring && y < height - ring) continue;
    max = Math.max(max, pixels[y * stride + x * 4 + 3]);
  }
  return { width, height, maxBorderAlpha: max };
}
function pngAlphaBorder(file) {
  const png = decodePng(file);
  return png ? borderAlpha(png) : null;
}
// 在气泡本体里取样：气泡矩形上沿内侧 inset 点、水平居中（那里是上内边距，没有文字）。
// bubble 是气泡在窗口视图里的矩形（自下而上），frame 是窗口在屏幕上的矩形；像素行自上而下，缩放 = PNG 宽 / 窗口宽（2 倍屏为 2）。
function bubbleSample(png, frame, bubble, inset = 8) {
  const scale = png.width / frame.w;
  const x = Math.round((bubble.x + bubble.w / 2) * scale), y = Math.round((frame.h - (bubble.y + bubble.h - inset)) * scale);
  assert.ok(x >= 0 && x < png.width && y >= 0 && y < png.height, `取样点 (${x}, ${y}) 在 ${png.width}x${png.height} 之外`);
  const i = y * png.stride + x * 4;
  const [r, g, b, a] = [png.pixels[i], png.pixels[i + 1], png.pixels[i + 2], png.pixels[i + 3]];
  return { r, g, b, a, x, y, luminance: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
}
// 截取水母窗口并核对最外圈完全透明；没有屏幕录制权限时跳过（只报告，不当作通过）
async function checkBorder(host, label) {
  const dir = mkdtempSync(resolve(tmpdir(), 'tk-glow-'));
  try {
    const file = resolve(dir, `${label}.png`);
    capture(file, (await host.request('ping')).countdownWindowNumber);
    const edge = pngAlphaBorder(file);
    console.log(`  边缘检查 ${label}:`, edge ? `${edge.width}x${edge.height} 最大边缘 alpha ${edge.maxBorderAlpha}` : '不支持的 PNG 格式');
    if (edge) assert.ok(edge.maxBorderAlpha <= 1, `${label}：窗口外圈 8 像素出现了不透明像素（最大 alpha ${edge.maxBorderAlpha}），光晕或气泡阴影被截断成方框`);
  } catch (error) {
    if (error.name === 'AssertionError') throw error;
    console.log('跳过边缘像素检查（可能没有屏幕录制权限）：', error.message.split('\n')[0]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const T = Date.now();
const timer = (extra = {}) => ({
  id: 'smoke', title: '出发接老丈母娘（北京朝阳站）', count: 1, alarmId: 'a', revision: 3, canAct: true,
  fireAt: T + 40 * 60000,
  items: [{ id: 'smoke', alarmId: 'a', title: '出发接老丈母娘（北京朝阳站）', fireAt: T + 40 * 60000 }, { id: 'b', alarmId: 'b', title: '开会', fireAt: T + 130 * 60000 }],
  ...extra
});
const jelly = (extra = {}) => ({ resident: true, night: true, lines: ['今天喝了 3 次水', '今天起身 2 次', '下次喝水提醒 15:30'], linesUntil: Date.now() + 3600000, ...extra });
const nudge = (extra = {}) => ({
  id: 'jelly-nudge-water-1', kind: 'water', title: '水母口渴了 💧', text: '咕嘟咕嘟，喝几口水吧（今天已喝了 2 次）',
  buttons: [{ id: 'done', title: '喝了' }, { id: 'snooze', title: '10 分钟后' }], ttl: 90, ...extra
});
const BASE = /\{170, 150\}\}$/;
let host;

// ---------- 到点响铃（水母游到所在屏幕底部正中，弹出玻璃气泡报时）的验收 ----------
// 每个场景各开一个原生进程，互不影响。响铃按钮经测试钩子 ringButton 触发（走与真实点击相同的动作入口，含弹出后 0.5 秒的防误触），
// 所以逻辑场景不依赖鼠标时序；真实鼠标点击与拖动在 ringMousePhase。
const ring = (extra = {}) => ({ sessionId: 'ring-1', title: '开会；喝水', timeText: '10/16 09:30', clock: '09:30', labels: ['开会', '喝水'], more: 0, canSnooze: true, snoozeMinutes: 10, ...extra });
const until = async (host, predicate, ms = 4000, label = '条件') => {
  const end = Date.now() + ms; let reply;
  while (Date.now() < end) { reply = await host.request('ping'); if (predicate(reply)) return reply; await delay(80); }
  throw new Error(`等待超时：${label}（原生端看到的鼠标位置 ${reply?.mouse}，屏幕数 ${reply?.screenCount}，活动显示器 ${reply?.displaysActive}）\n${JSON.stringify(reply, null, 1).slice(0, 900)}`);
};
const scenario = async (name, env, body) => {
  const h = start(env);
  try { await body(h); console.log(`  ✓ 响铃：${name}`); } finally { await h.stop(); }
};
// show 之后等水母游到落点、气泡弹出
const arrive = async (h, extra = {}) => {
  const reply = await h.request('show', ring(extra));
  assert.equal(reply.ok, true, `show 被拒绝：${JSON.stringify(extra)}`);
  return until(h, r => r.ringPhase === 'shown' && r.ringId === (extra.sessionId || 'ring-1'), 3500, '水母游到落点并弹出气泡');
};
// 越过弹出后 0.5 秒的防误触窗口，再经钩子按下按钮，返回原生发出的 action 事件
const press = async (h, id) => {
  await delay(600);
  const reply = await h.request('ringButton', { id });
  assert.equal(reply.ok, true, `按下 ${id} 应发出动作`);
  return h.waitEvent('action', 2000);
};
const receipt = (h, action, extra = {}) => h.request('actionResult', { sessionId: action.sessionId, actionId: action.actionId, ok: true, ...extra });
// 独立 Bundle ID 下记住的位置：只对 --app 的隔离构建读写，绝不碰真实组件的 com.timekeeper.desktop
const bundleId = execFileSync('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', resolve(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim();
const defaultsRead = key => { try { return execFileSync('/usr/bin/defaults', ['read', bundleId, key], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
const defaultsWriteX = value => { assert.notEqual(bundleId, 'com.timekeeper.desktop', '不得改写真实组件的位置记忆'); execFileSync('/usr/bin/defaults', ['write', bundleId, 'CompanionX', '-float', String(value)]); };
// 截取水母窗口：核对最外圈完全透明，并在气泡里取样；没有屏幕录制权限时返回 null（只报告，不当作通过）
async function inspectBubble(host, label, inset = 8) {
  const dir = mkdtempSync(resolve(tmpdir(), 'tk-ring-'));
  try {
    const reply = await host.request('ping');
    const file = resolve(dir, `${label}.png`);
    capture(file, reply.countdownWindowNumber);
    const png = decodePng(file);
    if (!png) { console.log(`  ${label}：不支持的 PNG 格式`); return null; }
    const edge = borderAlpha(png), sample = reply.ringBubble ? bubbleSample(png, frameOf(reply.ringFrame), frameOf(reply.ringBubble), inset) : null;
    console.log(`  取样 ${label}: ${png.width}x${png.height} 边缘 alpha ${edge.maxBorderAlpha}${sample ? `，气泡底色 rgba(${sample.r},${sample.g},${sample.b},${sample.a}) 亮度 ${sample.luminance.toFixed(3)}` : ''}`);
    assert.ok(edge.maxBorderAlpha <= 1, `${label}：窗口外圈 8 像素出现了不透明像素（最大 alpha ${edge.maxBorderAlpha}），气泡阴影、涟漪或光晕被截断成方框`);
    return { edge, sample };
  } catch (error) {
    if (error.name === 'AssertionError') throw error;
    console.log(`跳过 ${label} 的截图检查（可能没有屏幕录制权限）：`, error.message.split('\n')[0]);
    return null;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// 进程近期 CPU 占用（top 的第二次起的采样是区间值），只作为记录，不当作性能保证
function cpuPercent(pid) {
  try {
    const out = execFileSync('/usr/bin/top', ['-pid', String(pid), '-l', '4', '-s', '1', '-stats', 'cpu'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const numbers = out.split('\n').map(line => line.trim()).filter(line => /^\d+(\.\d+)?$/.test(line)).map(Number).slice(1);
    return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
  } catch { return null; }
}

async function ringPhase() {
  // 协议校验、落点、按钮、窗口
  await scenario('协议校验、从右边出场、落点在底部正中、按钮与窗口', {}, async h => {
    for (const bad of [{ sessionId: '' }, { sessionId: 'x'.repeat(201) }, { title: undefined }, { title: 'x'.repeat(321) }, { title: 42 }]) {
      const reply = await h.request('show', ring(bad));
      assert.equal(reply.ok, false, `应拒绝：${JSON.stringify(bad).slice(0, 60)}`);
      assert.equal(reply.ringId, null); assert.equal(reply.jellyVisible, false); assert.equal(reply.visible, false);
    }
    let reply = await h.request('show', ring());
    assert.equal(reply.ok, true); assert.equal(reply.version, 7); assert.equal(reply.focusStayed, true, '响铃不抢焦点');
    assert.equal(reply.ringId, 'ring-1'); assert.equal(reply.jellyVisible, true); assert.equal(reply.visible, true); assert.equal(reply.countdownVisible, false);
    assert.equal(reply.ringClock, '09:30'); assert.deepEqual(reply.ringLines, ['开会', '喝水'], 'Chrome 发来的 clock / labels 经清洗后原样显示');
    assert.equal(reply.ringPhase, 'arriving'); assert.equal(reply.jellyBubble, 'none', '游向落点的途中没有气泡');
    const lane = frameOf(reply.ringLane), start0 = frameOf(reply.ringFrame);
    assert.match(reply.ringFrame, BASE, '出场时是基础尺寸');
    assert.ok(start0.x + start0.w / 2 >= lane.x + lane.w - 85 - 3, `原本不在屏幕上的水母从泳线最右端游进来：${start0.x + start0.w / 2} 对 ${lane.x + lane.w - 85}`);
    reply = await until(h, r => r.ringPhase === 'shown', 3500, '水母游到落点并弹出气泡');
    assert.equal(reply.jellyBubble, 'ring'); assert.deepEqual(Object.keys(reply.ringButtons).sort(), ['dismiss', 'snooze'], '两个真实按钮');
    const frame = frameOf(reply.ringFrame), bubble = frameOf(reply.ringBubble);
    assert.ok(Math.abs(frame.x + frame.w / 2 - (lane.x + lane.w / 2)) <= 2, `落点在所在屏幕可见区的横向正中：窗口中心 ${frame.x + frame.w / 2} 对 ${lane.x + lane.w / 2}`);
    assert.ok(frame.y <= lane.y && frame.y > lane.y - 40, `窗口贴着泳线（屏幕可见区底部）：${frame.y} 对 ${lane.y}`);
    assert.ok(frame.w > 170 && frame.h > 150, `窗口为气泡长大：${frame.w}×${frame.h}`);
    assert.ok(bubble.x >= 28 - 0.5 && bubble.x + bubble.w <= frame.w - 28 + 0.5, `气泡离窗口左右边缘至少 28 点（阴影空间）：${reply.ringBubble} 在 ${frame.w} 宽的窗口里`);
    assert.ok(Math.abs(frame.h - 28 - (bubble.y + bubble.h)) <= 1.5, `气泡顶部离窗口上边缘 28 点：${reply.ringBubble} 在 ${frame.h} 高的窗口里`);
    assert.equal(reply.countdownMenu.some(item => item.includes('延后') || item.includes('跳过')), false);
    const button = frameOf(reply.ringButtons.dismiss), snooze = frameOf(reply.ringButtons.snooze);
    assert.ok(button.w > 60 && button.h >= 28 && snooze.w > button.w, `按钮通栏且次按钮更宽：停止 ${button.w}×${button.h}，稍后 ${snooze.w}×${snooze.h}`);
    // 占用只记录：响铃期间每帧都在画涟漪，没有做过优化
    await delay(900);
    const cpu = cpuPercent(h.child.pid);
    console.log(`  响铃期间原生进程 CPU 占用（top 区间采样均值，仅记录）：${cpu === null ? '无法读取' : `${cpu.toFixed(1)}%`}`);
  });

  // 防误触、动作字段、回执门槛、失败重试、成功确认与收尾
  await scenario('防误触、动作字段、回执门槛、失败重试、成功确认与收尾', {}, async h => {
    let reply = await arrive(h);
    h.events.length = 0;
    reply = await h.request('ringButton', { id: 'dismiss' });
    assert.equal(reply.ok, false, '弹出 0.5 秒内忽略点击'); h.noEvent('action', '防误触窗口内不得发出 action');
    await delay(600);
    reply = await h.request('ringButton', { id: 'dismiss' });
    assert.equal(reply.ok, true);
    const first = await h.waitEvent('action', 2000);
    assert.deepEqual([first.sessionId, first.action, first.minutes], ['ring-1', 'dismiss', 10]); assert.ok(first.actionId.length > 8);
    assert.equal(reply.ringBusy, true); assert.match(reply.ringStatus, /正在同步/);
    for (const id of ['dismiss', 'snooze']) { reply = await h.request('ringButton', { id }); assert.equal(reply.ok, false, `等待回执期间 ${id} 不可再点`); }
    h.noEvent('action', '等待回执期间不能重复提交');
    assert.equal((await h.request('ringButton', { id: 'bogus' })).ok, false, '未知按钮被拒绝');
    shot('ring-busy', reply.countdownWindowNumber);
    // 不匹配的回执不能解除等待
    reply = await h.request('actionResult', { sessionId: 'ring-1', actionId: 'stale', ok: true });
    assert.equal(reply.ringBusy, true, '错误的 actionId 不能解除等待'); assert.equal(reply.ringId, 'ring-1');
    reply = await h.request('actionResult', { sessionId: 'other', actionId: first.actionId, ok: true });
    assert.equal(reply.ringBusy, true, '错误的 sessionId 不能解除等待'); assert.equal(reply.ringId, 'ring-1');
    // 失败回执：显示原因，按钮恢复，可以重试
    reply = await h.request('actionResult', { sessionId: 'ring-1', actionId: first.actionId, ok: false, error: '没有记上' });
    assert.equal(reply.ringBusy, false); assert.equal(reply.ringStatus, '没有记上'); assert.equal(reply.ringId, 'ring-1', '失败后气泡与按钮保留');
    await delay(250); shot('ring-error', reply.countdownWindowNumber);
    reply = await h.request('ringButton', { id: 'dismiss' });
    assert.equal(reply.ok, true);
    const second = await h.waitEvent('action', 2000);
    assert.notEqual(second.actionId, first.actionId, '重试使用新的 actionId'); assert.match(reply.ringStatus, /正在同步/, '重试时清掉旧的错误提示');
    // 成功回执：先显示确认语，再收尾
    reply = await receipt(h, second);
    assert.equal(reply.ringStatus, '已停止'); assert.equal(reply.ringId, 'ring-1', '确认语显示期间会话仍在');
    await delay(300); shot('ring-confirm', reply.countdownWindowNumber);
    reply = await until(h, r => r.ringId === null, 2500, '确认语约 1.4 秒后收尾');
    reply = await until(h, r => r.jellyVisible === false, 4000, '没有常驻也没有倒计时：水母游向右边并消失');
    assert.equal(reply.visible, false); h.noEvent('action', '全程只发出两次动作（一次失败重试）');
  });

  // 稍后再提醒的文案与字段；不可稍后时只有停止
  await scenario('稍后再提醒：分钟数进入动作字段与确认语', {}, async h => {
    await arrive(h, { snoozeMinutes: 7 });
    const action = await press(h, 'snooze');
    assert.deepEqual([action.action, action.minutes], ['snooze', 7]);
    const reply = await receipt(h, action);
    assert.equal(reply.ringStatus, '好的，7 分钟后再叫你');
  });
  await scenario('不可稍后：只有“停止”，snooze 被拒绝', {}, async h => {
    let reply = await arrive(h, { canSnooze: false });
    assert.deepEqual(Object.keys(reply.ringButtons), ['dismiss']);
    await delay(600);
    reply = await h.request('ringButton', { id: 'snooze' });
    assert.equal(reply.ok, false); h.noEvent('action', '不可稍后时不发 snooze');
  });

  // Chrome 的真实顺序：先 hide，后回执
  await scenario('先 hide 后回执：回执在宽限内到达，仍显示确认语', {}, async h => {
    await arrive(h);
    const action = await press(h, 'dismiss');
    let reply = await h.request('hide', { sessionId: 'ring-1' });
    assert.equal(reply.ringId, 'ring-1', 'hide 时还有等待的动作：先别收尾'); assert.equal(reply.ringBusy, true);
    await delay(300);
    reply = await receipt(h, action);
    assert.equal(reply.ringStatus, '已停止', 'hide 之后到达的回执仍显示确认语');
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
  });
  await scenario('先 hide 后回执：宽限内没有回执就收尾，不显示确认语', {}, async h => {
    await arrive(h);
    await press(h, 'dismiss');
    const t0 = Date.now();
    let reply = await h.request('hide', { sessionId: 'ring-1' });
    assert.equal(reply.ringId, 'ring-1');
    reply = await until(h, r => r.ringId === null, 2600, '宽限约 1.5 秒后收尾');
    const waited = Date.now() - t0;
    assert.ok(waited >= 1400 && waited < 2600, `约 1.5 秒后收尾：${waited} ms`);
    assert.equal(reply.ringStatus, '', '没有成功回执就不显示确认语');
  });
  await scenario('先 hide 后回执：失败回执显示原因后离开', {}, async h => {
    await arrive(h);
    const action = await press(h, 'dismiss');
    await h.request('hide', { sessionId: 'ring-1' });
    const reply = await h.request('actionResult', { sessionId: 'ring-1', actionId: action.actionId, ok: false, error: '闹钟已被别处处理' });
    assert.equal(reply.ringStatus, '闹钟已被别处处理'); assert.equal(reply.ringId, 'ring-1', '会话已被结束，显示原因后离开，不再等重试');
    await until(h, r => r.ringId === null, 2500, '显示原因约 1.4 秒后离开');
  });
  await scenario('先 hide 后回执：重复的 hide 不会重新计宽限', {}, async h => {
    await arrive(h);
    await press(h, 'dismiss');
    const t0 = Date.now();
    await h.request('hide', { sessionId: 'ring-1' });
    await delay(1000);
    let reply = await h.request('hide', { sessionId: 'ring-1' });        // Chrome 重复发 hide：宽限仍从第一次起算
    assert.equal(reply.ringId, 'ring-1', '宽限内仍在等回执');
    reply = await until(h, r => r.ringId === null, 2000, '宽限从第一次 hide 起约 1.5 秒后收尾');
    const waited = Date.now() - t0;
    assert.ok(waited < 2100, `宽限从第一次 hide 算起（约 1.5 秒），重复的 hide 不重新计时：${waited} ms`);
  });

  // hide 只结束同一个会话
  await scenario('hide 只结束同一个会话；没有等待的动作时立即收尾', {}, async h => {
    await arrive(h);
    let reply = await h.request('hide', { sessionId: 'other' });
    assert.equal(reply.ringId, 'ring-1', '别的会话的 hide 被忽略');
    reply = await h.request('hide', {});
    assert.equal(reply.ringId, 'ring-1', '没有 sessionId 的 hide 被忽略');
    reply = await h.request('hide', { sessionId: 'ring-1' });
    assert.equal(reply.ringId, null); assert.equal(reply.ringStatus, '');
    await until(h, r => r.jellyVisible === false, 4000, '游走并消失');
  });

  // Chrome 一直不回执
  await scenario('8 秒没有回执：按钮恢复并提示，可以重试，迟到的旧回执被忽略', {}, async h => {
    await arrive(h);
    const first = await press(h, 'dismiss');
    await delay(8600);
    let reply = await h.request('ping');
    assert.equal(reply.ringBusy, false); assert.match(reply.ringStatus, /尚未确认/); assert.equal(reply.ringId, 'ring-1');
    reply = await h.request('ringButton', { id: 'dismiss' });
    assert.equal(reply.ok, true);
    const second = await h.waitEvent('action', 2000);
    assert.notEqual(second.actionId, first.actionId);
    reply = await receipt(h, first);
    assert.equal(reply.ringBusy, true, '已作废的 actionId 迟到的回执被忽略');
  });

  // 同会话重发与替换
  await scenario('同会话重发只更新内容；换会话重新入场，旧会话的 hide 与回执被忽略', {}, async h => {
    await arrive(h);
    let reply = await h.request('show', ring({ labels: ['甲', '乙', '丙'], more: 2, clock: '09:31' }));
    assert.equal(reply.ringPhase, 'shown', '同会话重发不重播入场'); assert.equal(reply.ringClock, '09:31');
    assert.deepEqual(reply.ringLines, ['甲', '乙', '等共 5 个'], '总数超过 3 个只列前 2 个');
    const action = await press(h, 'dismiss');                     // 旧会话上有等待中的动作
    reply = await h.request('show', ring({ sessionId: 'ring-2', clock: '10:00', labels: ['新的'] }));
    assert.equal(reply.ringId, 'ring-2'); assert.equal(reply.ringBusy, false, '新会话不继承旧会话的等待');
    assert.equal(reply.ringClock, '10:00'); assert.deepEqual(reply.ringLines, ['新的']);
    await until(h, r => r.ringPhase === 'shown', 3500, '新会话的气泡弹出');
    reply = await h.request('hide', { sessionId: 'ring-1' });
    assert.equal(reply.ringId, 'ring-2', '旧会话的 hide 被忽略');
    reply = await receipt(h, action);
    assert.equal(reply.ringId, 'ring-2', '旧会话的回执被忽略'); assert.equal(reply.ringStatus, '');
  });

  // 对照：没有 TIMEKEEPER_TEST_HOOKS 的组件拒绝 ringButton 钩子（正式使用时不能用协议绕过点击保护去代按按钮）
  await scenario('验收钩子 ringButton 在正式使用时无效', { TIMEKEEPER_TEST_HOOKS: '0' }, async h => {
    await arrive(h);
    await delay(600);                                              // 已越过防误触窗口，唯一的拒绝理由就是钩子没开
    const reply = await h.request('ringButton', { id: 'dismiss' });
    assert.equal(reply.ok, false, '正式使用时 ringButton 钩子恒为拒绝'); assert.equal(reply.ringBusy, false);
    h.noEvent('action', '被拒绝的钩子不能发出动作');
  });

  // 与喝水/起身气泡的优先级
  await scenario('响铃期间拒绝喝水气泡，响完后恢复', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await arrive(h);
    let reply = await h.request('nudge', { nudge: nudge() });
    assert.equal(reply.ok, false, '响铃优先：气泡被拒绝，Chrome 据此退回系统通知'); assert.equal(reply.nudgeId, null);
    await h.request('hide', { sessionId: 'ring-1' });
    reply = await h.request('nudge', { nudge: nudge() });
    assert.equal(reply.ok, true, '响铃结束后喝水气泡恢复'); assert.equal(reply.nudgeId, 'jelly-nudge-water-1');
  });

  // 常驻：响完回到原来的位置
  defaultsWriteX(0);       // 响铃前水母在泳线最左端（夹进范围），离落点（正中）足够远
  await scenario('常驻：响完游回响铃前的位置，窗口回到基础尺寸', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const before = frameOf((await h.request('ping')).countdownFrame);
    let reply = await arrive(h);
    const lane = frameOf(reply.ringLane), during = frameOf(reply.ringFrame);
    assert.ok(Math.abs(before.x + before.w / 2 - (lane.x + lane.w / 2)) > 100, `响铃前不在正中：${before.x + before.w / 2} 对 ${lane.x + lane.w / 2}`);
    assert.ok(Math.abs(during.x + during.w / 2 - (lane.x + lane.w / 2)) <= 2);
    const action = await press(h, 'dismiss');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    reply = await until(h, r => BASE.test(r.countdownFrame) && Math.abs(frameOf(r.countdownFrame).x - before.x) <= 3, 4500, '游回响铃前的位置');
    assert.equal(reply.jellyVisible, true); assert.equal(reply.ringId, null); assert.equal(reply.visible, false);
  });

  // 没常驻无倒计时：离开，且不改写记住的位置
  defaultsWriteX(500);
  await scenario('没有常驻也没有倒计时：响完游走消失，不改写记住的位置', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(500);
    await h.request('jelly', { jelly: jelly({ resident: false }) });      // 取消常驻时水母把当前位置记下来
    await delay(300);
    const known = defaultsRead('CompanionX');
    assert.ok(known !== null && Number.isFinite(Number(known)), `应已记下位置：${known}`);
    await arrive(h);
    const action = await press(h, 'snooze');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    await until(h, r => r.jellyVisible === false, 4500, '游向右边并消失');
    await delay(300);
    assert.equal(defaultsRead('CompanionX'), known, '响铃的出差路线不得改写水母记住的位置');
  });

  // 响铃中换会话：回家的路线仍以最初的位置为准（不是替换时所在的落点）
  defaultsWriteX(0);
  await scenario('响铃中换会话：响完仍游回最初响铃前的位置（不是落点）', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const before = frameOf((await h.request('ping')).countdownFrame);
    await arrive(h);
    let reply = await arrive(h, { sessionId: 'ring-2', labels: ['第二个'], clock: '09:31' });      // 换会话：水母已经在落点上
    const lane = frameOf(reply.ringLane);
    assert.ok(Math.abs(before.x + before.w / 2 - (lane.x + lane.w / 2)) > 100, '响铃前不在正中，才分得出“回原位”和“留在落点”');
    const action = await press(h, 'dismiss');
    assert.equal(action.sessionId, 'ring-2');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    reply = await until(h, r => BASE.test(r.countdownFrame) && Math.abs(frameOf(r.countdownFrame).x - before.x) <= 3, 4500, '游回最初响铃前的位置');
    assert.equal(reply.jellyVisible, true);
  });

  // 回家的路上被隐藏（取消常驻）：当时的位置只是路过，不能记成“放下的位置”，也不能留下“还在回家”的残留状态
  defaultsWriteX(0);
  await scenario('回家路上取消常驻：不改写记住的位置，也不影响下一次响铃的“家”', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const known = defaultsRead('CompanionX');
    assert.equal(Number(known), 0, `记住的位置是预设的 0：${known}`);
    const first = frameOf((await h.request('ping')).countdownFrame);
    const lane = frameOf((await arrive(h)).ringLane);
    let action = await press(h, 'dismiss');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾，水母开始游回');
    await h.request('jelly', { jelly: jelly({ resident: false }) });              // 回家路上取消常驻：当场隐藏
    await until(h, r => r.jellyVisible === false, 3000, '取消常驻后隐藏');
    await delay(300);
    assert.equal(defaultsRead('CompanionX'), known, '回家路上被隐藏：路过的位置不能当作放下的位置记下来');
    // 残留检查：改记一个很远的新位置（泳线 3/4 处，上一次的家在泳线最左端）、重新常驻（水母出现在新位置），再响一次，响完应回到新位置而不是上一次的家
    defaultsWriteX(lane.x + lane.w * 0.75);
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const second = frameOf((await h.request('ping')).countdownFrame);
    assert.ok(Math.abs(second.x - first.x) > 300, `重新常驻后水母出现在新记的位置：${second.x} 对 ${first.x}`);
    await arrive(h, { sessionId: 'ring-2' });
    action = await press(h, 'dismiss');
    assert.equal(action.sessionId, 'ring-2');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '第二次响铃的确认语后收尾');
    const reply = await until(h, r => BASE.test(r.countdownFrame) && Math.abs(frameOf(r.countdownFrame).x - second.x) <= 3, 4500, '游回第二次响铃前的位置');
    assert.equal(reply.jellyVisible, true);
  });

  // 倒计时让位
  await scenario('倒计时让位给响铃，响完气泡恢复倒计时', {}, async h => {
    await h.request('countdown', { timer: timer({ fireAt: Date.now() + 40 * 60000 }) });
    let reply = await h.request('ping');
    assert.equal(reply.jellyBubble, 'clock'); assert.equal(reply.countdownVisible, true);
    reply = await h.request('show', ring());
    assert.equal(reply.countdownVisible, false, '响铃时倒计时让位');
    reply = await until(h, r => r.ringPhase === 'shown', 3500, '气泡弹出');
    assert.equal(reply.jellyBubble, 'ring'); assert.equal(reply.countdownVisible, false);
    assert.equal(reply.countdownMenu.some(item => item.includes('延后') || item.includes('跳过')), false, '响铃期间右键菜单没有倒计时项');
    await h.request('hide', { sessionId: 'ring-1' });
    reply = await until(h, r => r.ringId === null && r.countdownVisible && r.jellyBubble === 'clock', 4000, '响完气泡恢复倒计时');
    assert.equal(reply.jellyVisible, true, '仍有倒计时，水母留下');
  });

  // 减少动态效果
  await scenario('减少动态效果：不游动、不播涟漪，直接就位，整个过程窗口不上下动', { TIMEKEEPER_REDUCE_MOTION: '1' }, async h => {
    let reply = await h.request('show', ring());
    assert.equal(reply.ok, true); assert.equal(reply.countdownReduceMotion, true);
    reply = await until(h, r => r.ringPhase === 'shown', 800, '减少动态效果下 0.8 秒内就位');
    const lane = frameOf(reply.ringLane), frame = frameOf(reply.ringFrame);
    assert.ok(Math.abs(frame.x + frame.w / 2 - (lane.x + lane.w / 2)) <= 2, '直接落在正中');
    for (let i = 0; i < 10; i++) { await delay(120); const r = await h.request('ping'); assert.equal(frameOf(r.ringFrame).y, frame.y, '整个响铃过程窗口 y 不变'); }
    assert.deepEqual(Object.keys(reply.ringButtons).sort(), ['dismiss', 'snooze']);
    const action = await press(h, 'dismiss');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    await until(h, r => r.jellyVisible === false, 3000, '淡出后消失');
  });

  // 状态栏“显示当前提醒”
  await scenario('状态栏“显示当前提醒”：重新游到落点并重播气泡，不产生业务动作', {}, async h => {
    await arrive(h);
    let reply = await h.request('menuItem', { title: '显示当前提醒' });
    assert.equal(reply.ok, true); assert.equal(reply.ringPhase, 'arriving'); assert.equal(reply.jellyBubble, 'none', '重播时气泡先收起');
    reply = await until(h, r => r.ringPhase === 'shown', 3500, '重新弹出');
    assert.equal(reply.ringId, 'ring-1'); assert.equal(reply.jellyBubble, 'ring'); h.noEvent('action', '重播不产生业务动作');
  });

  // 外观：浅色与深色（含夜晚），截图取样
  for (const [mode, env, label] of [['light', {}, 'ring-light'], ['dark', {}, 'ring-dark'], ['light', { TIMEKEEPER_NIGHT_HOUR: '23' }, 'ring-light-night'], ['dark', { TIMEKEEPER_NIGHT_HOUR: '23' }, 'ring-dark-night']]) {
    await scenario(`外观 ${mode}（${label}）：随外观选配色，窗口外圈完全透明`, { TIMEKEEPER_APPEARANCE: mode, ...env }, async h => {
      let reply = await arrive(h);
      assert.equal(reply.jellyAppearance, mode);
      await delay(900);                      // 弹出（0.32 秒）与涟漪稳定
      reply = await h.request('ping');
      shot(label, reply.countdownWindowNumber);
      const seen = await inspectBubble(h, label);
      if (seen?.sample) {
        if (mode === 'light') assert.ok(seen.sample.luminance > 0.8, `${label}：浅色气泡底色应是亮的：${seen.sample.luminance.toFixed(3)}`);
        else assert.ok(seen.sample.luminance < 0.25, `${label}：深色气泡底色应是暗的：${seen.sample.luminance.toFixed(3)}`);
      }
    });
  }
  // 其他水母气泡同样随系统外观：喝水提醒（浅/深）与倒计时读数（深）
  for (const mode of ['light', 'dark']) {
    await scenario(`外观 ${mode}：喝水提醒与倒计时读数气泡也随外观`, { TIMEKEEPER_APPEARANCE: mode }, async h => {
      await h.request('jelly', { jelly: jelly() });
      await h.request('countdown', { timer: timer() });
      await delay(700);
      let reply = await h.request('ping');
      assert.equal(reply.jellyAppearance, mode); assert.equal(reply.jellyBubble, 'clock');
      shot(`clock-${mode}`, reply.countdownWindowNumber); await checkBorder(h, `clock-${mode}`);
      await h.request('countdown', { timer: null });
      reply = await h.request('nudge', { nudge: nudge() });
      assert.equal(reply.ok, true); await delay(700);
      shot(`nudge-${mode}`, (await h.request('ping')).countdownWindowNumber);
      const seen = await inspectBubble(h, `nudge-${mode}`, 3);
      if (seen?.sample) {
        if (mode === 'light') assert.ok(seen.sample.luminance > 0.7, `喝水气泡浅色底：${seen.sample.luminance.toFixed(3)}`);
        else assert.ok(seen.sample.luminance < 0.35, `喝水气泡深色底：${seen.sample.luminance.toFixed(3)}`);
      }
    });
  }
  // 独立演示模式：不连接 Chrome，水母直接报时，进程保持运行
  {
    const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), ['--demo'], { stdio: 'ignore' });
    await delay(1800);
    assert.equal(child.exitCode, null, '--demo 应保持运行直到点击按钮');
    child.kill('SIGTERM'); await delay(250);
    console.log('  ✓ 响铃：--demo 能启动并保持运行');
  }
  console.log('PASS 阶段 1c：到点响铃（协议、落点、防误触、回执门槛、真实顺序 hide→回执、宽限、重发与替换、优先级、返回原位、不改写位置、减少动态效果、外观）');
}

// 真实鼠标：点气泡空白处不发动作；点按钮发一个动作；拖开水母后响完留在放下的位置
async function ringMousePhase() {
  const realClick = async (h, point, type = 'action') => {
    mouse('click', point.x, point.y);
    try { return await h.waitEvent(type, 1500); } catch { mouse('move', point.x, point.y); await delay(300); mouse('click', point.x, point.y); return h.waitEvent(type, 2500); }
  };
  await scenario('真实鼠标：点气泡空白处不发动作，点“停止”发一个动作，点“稍后”字段正确', {}, async h => {
    let reply = await arrive(h);
    await delay(700);
    reply = await h.request('ping');
    const f = frameOf(reply.ringFrame), b = frameOf(reply.ringBubble);
    mouse('click', f.x + b.x + b.w / 2, f.y + b.y + b.h - 10); await delay(500);     // 气泡顶部的空白处
    h.noEvent('action', '点气泡空白处不发任何业务动作');
    reply = await h.request('ping');
    assert.equal(reply.ringId, 'ring-1'); assert.equal(reply.ringBusy, false); assert.equal(reply.jellyBubble, 'ring', '点气泡不会把响铃换成详情');
    const action = await realClick(h, center(reply.ringButtons.dismiss));
    assert.deepEqual([action.sessionId, action.action], ['ring-1', 'dismiss']); assert.ok(action.actionId.length > 8);
    reply = await h.request('ping'); assert.equal(reply.ringBusy, true, '等待回执期间按钮不可再点');
    mouse('click', center(reply.ringButtons.dismiss).x, center(reply.ringButtons.dismiss).y); await delay(400);
    h.noEvent('action', '等待回执期间再点不重复提交');
    reply = await receipt(h, action);
    assert.equal(reply.ringStatus, '已停止');
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
  });
  await scenario('真实鼠标：点“稍后再提醒”', {}, async h => {
    let reply = await arrive(h, { snoozeMinutes: 15 });
    await delay(700);
    reply = await h.request('ping');
    const action = await realClick(h, center(reply.ringButtons.snooze));
    assert.deepEqual([action.action, action.minutes], ['snooze', 15]);
    reply = await receipt(h, action);
    assert.equal(reply.ringStatus, '好的，15 分钟后再叫你');
  });
  await scenario('真实鼠标：响铃时拖开水母，响完留在放下的位置，不回原位', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const home = frameOf((await h.request('ping')).countdownFrame);
    let reply = await arrive(h);
    await delay(700);
    reply = await h.request('ping');
    const f = frameOf(reply.ringFrame), lane = frameOf(reply.ringLane);
    const bodyX = f.x + f.w / 2;
    const homeX = home.x + home.w / 2;
    // 放到离原位很远的另一侧，但离屏幕边缘至少一个窗口半宽加上滑行距离：响铃窗口（356 宽）贴边时会被夹进屏幕，窗口中心就不再是水母的位置
    const target = homeX < lane.x + lane.w / 2 ? lane.x + lane.w * 0.7 : lane.x + lane.w * 0.3;
    mouse('drag', bodyX, f.y + 77, target, f.y + 77, 24);
    // 快速甩过去再松手，水母带着一点速度滑行后才停下：等它停稳（相隔 0.2 秒两次读数相同），再看停在哪里
    let settled = frameOf((await h.request('ping')).ringFrame);
    for (let i = 0; i < 20; i++) {
      await delay(200);
      const next = frameOf((await h.request('ping')).ringFrame);
      const still = Math.abs(next.x - settled.x) < 0.5;
      settled = next;
      if (still && i >= 3) break;
    }
    reply = await h.request('ping');
    assert.equal(reply.ringId, 'ring-1', '拖动不会结束响铃'); assert.equal(reply.ringPhase, 'shown'); assert.equal(reply.jellyBubble, 'ring');
    h.noEvent('action', '拖动水母不会触发任何业务动作');
    const droppedX = settled.x + settled.w / 2, span = Math.abs(target - homeX);
    // 松手时的速度被夹在 260 pt/s、水平阻尼 1.2/s，所以最多再滑行约 217 pt；快甩时每次都会滑满，容差不能按“距离的四分之一”算（距离小于 870 时比滑行距离还短）
    const slide = Math.max(span * 0.25, 280);
    assert.ok(Math.abs(droppedX - target) < slide, `水母停在放下的那一侧（允许滑行）：${droppedX} 对 ${target}，原位 ${homeX}，容差 ${Math.round(slide)}`);
    assert.ok(Math.abs(droppedX - homeX) > span * 0.5, `没有留在原位：${droppedX} 对 ${homeX}`);
    await h.request('hide', { sessionId: 'ring-1' });
    await until(h, r => r.ringId === null && BASE.test(r.countdownFrame), 3000, '收尾');
    const trail = [];
    for (let i = 0; i < 10; i++) {          // 给“回家”留足时间（2.5 秒）：它不该回去；同时记下轨迹，失败时一并报告
      await delay(250);
      const here = frameOf((await h.request('ping')).countdownFrame);
      trail.push(Math.round(here.x + here.w / 2));
    }
    reply = await h.request('ping');
    const final = frameOf(reply.countdownFrame), finalX = final.x + final.w / 2;
    assert.ok(Math.abs(finalX - droppedX) < 20, `响完仍在放下的位置：${finalX} 对 ${droppedX}（响完后每 250 ms 的中心：${trail.join(', ')}）`);
    assert.ok(Math.abs(finalX - homeX) > span * 0.5, `没有回到响铃前的位置 ${homeX}：${finalX}`);
    assert.equal(reply.jellyVisible, true);
  });
  // 拖开之后又用状态栏“显示当前提醒”把水母请回落点：“用户拖动过”随之清掉，响完回到响铃前的位置
  await scenario('真实鼠标：拖开后再“显示当前提醒”，响完回到响铃前的位置（不留在落点）', {}, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const home = frameOf((await h.request('ping')).countdownFrame);
    const homeX = home.x + home.w / 2;
    let reply = await arrive(h);
    await delay(700);
    reply = await h.request('ping');
    const f = frameOf(reply.ringFrame), lane = frameOf(reply.ringLane);
    const target = homeX < lane.x + lane.w / 2 ? lane.x + lane.w * 0.7 : lane.x + lane.w * 0.3;
    mouse('drag', f.x + f.w / 2, f.y + 77, target, f.y + 77, 24);
    let settled = frameOf((await h.request('ping')).ringFrame);
    for (let i = 0; i < 20; i++) {
      await delay(200);
      const next = frameOf((await h.request('ping')).ringFrame);
      const still = Math.abs(next.x - settled.x) < 0.5; settled = next;
      if (still && i >= 3) break;
    }
    assert.ok(Math.abs(settled.x + settled.w / 2 - homeX) > Math.abs(target - homeX) * 0.5, '先确认确实被拖离了原位');
    reply = await h.request('menuItem', { title: '显示当前提醒' });
    assert.equal(reply.ok, true);
    await until(h, r => r.ringPhase === 'shown', 3500, '重播后水母回到落点并重新弹出');
    const action = await press(h, 'dismiss');
    await receipt(h, action);
    await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    reply = await until(h, r => BASE.test(r.countdownFrame) && Math.abs(frameOf(r.countdownFrame).x - home.x) <= 3, 4500, '重播清掉“拖动过”，响完回到响铃前的位置');
    assert.equal(reply.jellyVisible, true);
  });
  // 多显示器：水母在 A 屏、鼠标在 B 屏时响铃，水母改在 B 屏出现，落点是 B 屏可见区的正中（只有一块屏幕时跳过，不当作通过）
  {
    const screens = execFileSync(helper, ['screens'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
      .map(line => { const [x, y, w, h] = line.split(' ').map(Number); return { x, y, w, h }; });
    if (screens.length < 2) console.log('  跳过多显示器场景：本机只有一块屏幕');
    else {
      const [a, b] = screens;
      const middle = screen => ({ x: screen.x + screen.w / 2, y: screen.y + screen.h / 2 });
      const inside = (lane, screen) => lane.x >= screen.x - 1 && lane.x + lane.w <= screen.x + screen.w + 1;
      await scenario('真实鼠标：多显示器——水母在一块屏、鼠标在另一块屏时响铃，落点是鼠标所在屏的正中', {}, async h => {
        mouse('move', middle(a).x, middle(a).y); await delay(300);
        await h.request('jelly', { jelly: jelly() });                       // 水母出现在鼠标所在的 A 屏
        await delay(600);
        let reply = await h.request('ping');
        assert.ok(inside(frameOf(reply.ringLane), a), `水母出现在鼠标所在的 A 屏：${reply.ringLane}`);
        mouse('move', middle(b).x, middle(b).y); await delay(300);          // 鼠标换到 B 屏
        reply = await h.request('show', ring());
        assert.equal(reply.ok, true);
        const laneAtStart = frameOf(reply.ringLane), startFrame = frameOf(reply.ringFrame);
        assert.ok(inside(laneAtStart, b), `响铃出发时泳线已换到鼠标所在的 B 屏：${reply.ringLane}`);
        assert.ok(startFrame.x + startFrame.w / 2 >= laneAtStart.x + laneAtStart.w - 85 - 3, `水母从 B 屏泳线最右端游进来：${startFrame.x + startFrame.w / 2} 对 ${laneAtStart.x + laneAtStart.w - 85}`);
        reply = await until(h, r => r.ringPhase === 'shown', 4500, '水母游到 B 屏落点并弹出气泡');
        const lane = frameOf(reply.ringLane), frame = frameOf(reply.ringFrame);
        assert.ok(inside(lane, b), `落点的泳线在鼠标所在的 B 屏：${reply.ringLane}`);
        assert.ok(Math.abs(frame.x + frame.w / 2 - (lane.x + lane.w / 2)) <= 2, `落点是 B 屏可见区的正中：${frame.x + frame.w / 2} 对 ${lane.x + lane.w / 2}`);
        const action = await press(h, 'dismiss');
        await receipt(h, action);
        await until(h, r => r.ringId === null, 2500, '确认语后收尾');
        reply = await until(h, r => BASE.test(r.countdownFrame), 4500, '响完窗口回到基础尺寸');
        const end = frameOf(reply.countdownFrame), endX = end.x + end.w / 2;
        assert.ok(endX >= lane.x && endX <= lane.x + lane.w, `响完水母仍在 B 屏泳线上（回家的横坐标夹进当前屏幕）：${endX}，泳线 ${reply.ringLane}`);
        assert.equal(reply.jellyVisible, true);
      });
    }
  }
  // 游向落点的途中被抓走：放手的地方就是落点，气泡在那里弹出（不能卡在“游动中”）。
  // 先量出所在屏幕可见区的中点，再把水母的“家”预设在离落点 70 点的地方：冲刺很短，刚 show 完它几乎没动，鼠标一定抓得到。
  {
    const probe = start({});
    await probe.request('jelly', { jelly: jelly() }); await delay(500);
    const laneProbe = frameOf((await probe.request('ping')).ringLane);
    await probe.stop();
    const landing = laneProbe.x + laneProbe.w / 2;
    defaultsWriteX(landing - 70);
    await scenario('真实鼠标：游向落点的途中被抓走，放手处就是落点，气泡在那里弹出', {}, async h => {
      await h.request('jelly', { jelly: jelly() });
      await delay(600);
      const idle = frameOf((await h.request('ping')).countdownFrame), bodyX = idle.x + idle.w / 2;
      assert.ok(Math.abs(bodyX - (landing - 70)) < 3, `水母在预设的位置：${bodyX} 对 ${landing - 70}`);
      let reply = await h.request('show', ring());
      assert.equal(reply.ringPhase, 'arriving');
      const target = landing + laneProbe.w * 0.3;       // 离落点至少 0.3 个屏宽，远大于放手后的滑行
      mouse('drag', bodyX, idle.y + 77, target, idle.y + 77, 24);
      reply = await until(h, r => r.ringPhase === 'shown', 3000, '放手后气泡在放下的地方弹出');
      assert.equal(reply.ringId, 'ring-1'); assert.equal(reply.jellyBubble, 'ring');
      let settled = frameOf(reply.ringFrame);
      for (let i = 0; i < 20; i++) {
        await delay(200);
        const next = frameOf((await h.request('ping')).ringFrame);
        const still = Math.abs(next.x - settled.x) < 0.5; settled = next;
        if (still && i >= 3) break;
      }
      const droppedX = settled.x + settled.w / 2;
      assert.ok(Math.abs(droppedX - target) < Math.abs(droppedX - landing), `落点是放手的地方（允许滑行），不是屏幕正中：${droppedX}，放手 ${target}，正中 ${landing}`);
      h.noEvent('action', '抓走水母不会触发业务动作');
      const action = await press(h, 'dismiss');                  // 放下之后气泡与按钮照常可用
      await receipt(h, action);
      await until(h, r => r.ringId === null, 2500, '确认语后收尾');
    });
  }
  await scenario('深色外观：点一下水母的详情气泡截图', { TIMEKEEPER_APPEARANCE: 'dark' }, async h => {
    await h.request('jelly', { jelly: jelly() });
    await delay(600);
    const f = frameOf((await h.request('ping')).countdownFrame);
    mouse('click', f.x + f.w / 2, f.y + 77); await delay(500);
    const reply = await h.request('ping');
    assert.equal(reply.jellyBubble, 'detail'); assert.equal(reply.jellyAppearance, 'dark');
    shot('detail-dark', reply.countdownWindowNumber); await checkBorder(h, 'detail-dark');
  });
  console.log('PASS 阶段 5b：响铃的真实鼠标点击与拖动');
}

// 屏幕在休眠（没有活动显示器）时，Core Animation 的完成回调不触发：响铃退场的淡出隐藏、气泡淡入淡出等停在半途，整轮结果都不可信
// （2026-10-18 夜里实测：显示器休眠时退场场景稳定超时，亮屏后通过）。所以先看一眼，休眠就明确退出（退出码 75，稍后重试；不算验收失败）。
{
  const probe = start();
  let asleep = false;
  try { asleep = (await probe.request('ping')).displaysActive === 0; } finally { await probe.stop(); }
  if (asleep) {
    console.error('DISPLAY_ASLEEP：没有活动显示器（屏幕在休眠），动画收尾回调不会触发，本脚本的结果不可信。请先唤醒屏幕（例如另开终端运行 caffeinate -u -t 900）再重跑。这不是验收失败。');
    process.exit(75);
  }
}

if (only === 'nudge-mouse') {
  await nudgeMousePhase();
  console.log('PASS: jelly 提醒按钮的真实鼠标阶段');
  process.exit(0);
}
if (only === 'ring' || only === 'ring-mouse') {
  if (only === 'ring') await ringPhase();
  if (withMouse) await ringMousePhase();
  console.log('PASS: jelly 响铃阶段');
  process.exit(0);
}

// ---------- 阶段 1：协议、常驻与临时出现、记录文字、倒计时委托、菜单、阶段 ----------
host = start();
try {
  let reply = await host.request('jelly', { jelly: jelly() });
  assert.equal(reply.ok, true); assert.equal(reply.version, 7); assert.equal(reply.focusStayed, true, '水母出现不抢焦点');
  assert.equal(reply.jellyVisible, true); assert.equal(reply.jellyResident, true); assert.equal(reply.jellyBubble, 'none'); assert.equal(reply.countdownVisible, false);
  assert.match(reply.countdownFrame, BASE, '常驻休息时是基础尺寸 170×150');
  assert.deepEqual(reply.jellyLines, ['今天喝了 3 次水', '今天起身 2 次', '下次喝水提醒 15:30']);
  assert.deepEqual(reply.countdownMenu, ['今天喝了 3 次水', '今天起身 2 次', '下次喝水提醒 15:30', '---', '收起水母'], '没有倒计时时菜单只有记录与收起');

  // 负载校验：不是字典拒绝且原状态不变；记录最多 3 行、每行 ≤40 字、去控制字符；过期后不再显示
  reply = await host.request('jelly', { jelly: 'bad' });
  assert.equal(reply.ok, false); assert.equal(reply.jellyResident, true, '被拒绝的负载不改变状态');
  reply = await host.request('jelly', { jelly: jelly({ lines: ['甲'.repeat(60), 'b\u202eevil', 'c', 'd', 'e'] }) });
  assert.equal(reply.jellyLines.length, 3); assert.equal(reply.jellyLines[0].length, 40); assert.equal(reply.jellyLines[1], 'bevil', '方向控制符被清除');
  reply = await host.request('jelly', { jelly: jelly({ linesUntil: Date.now() + 1200 }) });
  assert.equal(reply.jellyLines.length, 3);
  await delay(1400);
  reply = await host.request('ping');
  assert.deepEqual(reply.jellyLines, [], '过期的记录不再显示'); assert.deepEqual(reply.countdownMenu, ['收起水母']);

  // 取消常驻：水母退场；没有常驻时只在倒计时期间临时出现
  reply = await host.request('jelly', { jelly: jelly({ resident: false }) });
  assert.equal(reply.jellyVisible, false); assert.equal(reply.jellyResident, false);
  reply = await host.request('countdown', { timer: timer() });
  assert.equal(reply.ok, true); assert.equal(reply.jellyVisible, true, '倒计时让水母临时出现'); assert.equal(reply.jellyResident, false);
  assert.equal(reply.countdownVisible, true); assert.equal(reply.jellyBubble, 'clock'); assert.equal(reply.countdownStage, 0, '40 分钟为平静阶段');
  assert.match(reply.countdownFrame, BASE); assert.equal(reply.focusStayed, true);
  for (const title of ['接下来', '延后 5 分钟', '跳过本次', '在 Chrome 中打开闹钟中心', '隐藏倒计时（不取消闹钟）']) {
    assert.ok(reply.countdownMenu.some(item => item.includes(title)), `菜单缺少：${title}\n${reply.countdownMenu.join('\n')}`);
  }
  assert.ok(reply.countdownMenu.some(item => item.includes('开会')), '“接下来”列出其他闹钟');
  assert.equal(reply.countdownMenu.some(item => /迷你|小巧|标准|舒展|切换为|胶囊/.test(item)), false, '胶囊已取消，没有尺寸与样式项');
  assert.equal(reply.countdownMenu.includes('收起水母'), false, '临时出现的水母没有“收起水母”');
  reply = await host.request('countdown', { timer: null });
  assert.equal(reply.jellyVisible, false, '倒计时结束后临时出现的水母退场');

  // 常驻 + 倒计时：气泡显示读数；倒计时结束水母留下
  await host.request('jelly', { jelly: jelly() });
  reply = await host.request('countdown', { timer: timer() });
  assert.equal(reply.jellyBubble, 'clock'); assert.equal(reply.countdownVisible, true);
  assert.ok(reply.countdownMenu.includes('收起水母'), '常驻水母菜单有“收起水母”');
  assert.deepEqual(reply.jellyLines, ['今天喝了 3 次水', '今天起身 2 次', '下次喝水提醒 15:30'], '倒计时不覆盖今天的记录');
  reply = await host.request('countdown', { timer: null });
  assert.equal(reply.jellyVisible, true); assert.equal(reply.jellyBubble, 'none'); assert.equal(reply.countdownVisible, false);

  // 倒计时操作的前提条件：同时多条、缺少闹钟标识、最后 10 秒都不提供延后/跳过
  reply = await host.request('countdown', { timer: timer({ canAct: false }) });
  assert.equal(reply.countdownMenu.some(item => item.includes('延后') || item.includes('跳过')), false, '同时多条时不提供延后/跳过');
  reply = await host.request('countdown', { timer: timer({ alarmId: undefined }) });
  assert.equal(reply.countdownMenu.some(item => item.includes('延后')), false, '缺少闹钟标识时不提供操作');
  reply = await host.request('countdown', { timer: timer({ fireAt: Date.now() + 8000 }) });
  assert.equal(reply.countdownMenu.some(item => item.includes('延后')), false, '最后 10 秒不提供延后/跳过');
  assert.equal(reply.countdownStage, 3, '8 秒为最后阶段');
  for (const [seconds, stage] of [[45, 2], [280, 1], [4000, 0]]) {
    reply = await host.request('countdown', { timer: timer({ fireAt: Date.now() + seconds * 1000 }) });
    assert.equal(reply.countdownStage, stage, `${seconds} 秒的阶段`);
  }
  assert.equal((await host.request('countdown', { timer: timer({ items: 'bad' }) })).ok, true, '非法的附加字段不影响基本显示');
  assert.equal((await host.request('countdown', { timer: timer({ fireAt: 'bad' }) })).ok, false, '非法的到点时间被拒绝');
  await host.request('countdown', { timer: null });

  // 隔离测试钩子只对本脚本启用：没有环境变量的组件一律拒绝（见阶段 5 末尾的对照）
  console.log('PASS 阶段 1：协议字段、常驻与临时出现、记录过期、倒计时委托、菜单、阶段');
} finally { await host.stop(); }

// ---------- 阶段 1b：夜晚荧光（假定本地时间，只看读数与截图） ----------
const expectedNight = () => { const now = new Date(); return JellyfishCore.nightAmount(now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600); };
for (const [label, hour, expected] of [['day', '12', 0], ['night', '23', 1], ['dusk', '19.5', 0.5]]) {
  host = start({ TIMEKEEPER_NIGHT_HOUR: hour });
  try {
    let reply = await host.request('jelly', { jelly: jelly() });
    assert.ok(Math.abs(reply.countdownNight - expected) < 1e-6, `${label}：夜晚程度 ${reply.countdownNight}`);
    await delay(900); shot(`resident-${label}`, (await host.request('ping')).countdownWindowNumber);
    // 光晕不能被透明窗口的边缘截断（真机反馈“像被框住了”）：窗口最外一圈像素必须完全透明
    await checkBorder(host, `resident-${label}`);
    // 气泡把窗口撑大之后同样不能出现方框
    reply = await host.request('nudge', { nudge: nudge() });
    assert.equal(reply.ok, true);
    await delay(700); shot(`nudge-${label}`, (await host.request('ping')).countdownWindowNumber);
    await checkBorder(host, `nudge-${label}`);
    reply = await host.request('jelly', { jelly: jelly({ night: false }) });
    assert.equal(reply.countdownNight, 0, `${label}：night:false 关闭夜晚荧光`); assert.equal(reply.jellyNight, false);
    reply = await host.request('jelly', { jelly: { resident: true } });
    assert.equal(reply.jellyNight, true, '缺省开启夜晚荧光'); assert.ok(Math.abs(reply.countdownNight - expected) < 1e-6);
  } finally { await host.stop(); }
}
host = start();
try {
  const reply = await host.request('jelly', { jelly: jelly() });
  assert.ok(Math.abs(reply.countdownNight - expectedNight()) < 0.02, `真实本机时间：夜晚程度 ${reply.countdownNight} 应约等于 ${expectedNight()}`);
} finally { await host.stop(); }
console.log('PASS 阶段 1b：夜晚荧光读数、开关、窗口边缘透明');

// ---------- 阶段 1c：到点响铃（水母报时；旧的深色提醒卡片已取消） ----------
await ringPhase();

// ---------- 阶段 2：喝水/起身提醒气泡（协议、校验、替换、撤销、有效期） ----------
host = start();
try {
  await host.request('jelly', { jelly: jelly() });
  const before = frameOf((await host.request('ping')).countdownFrame);
  let reply = await host.request('nudge', { nudge: nudge() });
  assert.equal(reply.ok, true, '常驻时提醒气泡出现'); assert.equal(reply.nudgeId, 'jelly-nudge-water-1'); assert.equal(reply.jellyBubble, 'nudge'); assert.equal(reply.focusStayed, true, '提醒气泡不抢焦点');
  assert.deepEqual(Object.keys(reply.nudgeButtons).sort(), ['done', 'snooze'], '两个真实按钮');
  const after = frameOf(reply.countdownFrame);
  assert.ok(after.w > before.w && after.h > before.h, `窗口为气泡长大：${before.w}×${before.h} → ${after.w}×${after.h}`);
  assert.ok(Math.abs(after.y - before.y) < 0.5, '窗口只向上长，水母本体不动');
  const body = before.x + before.w / 2;     // 水母身体中心：窗口靠屏幕边缘时会被夹回，不一定在正中，但必须仍在窗口里
  assert.ok(after.x + 12 <= body && body <= after.x + after.w - 12, `水母身体 ${body} 必须仍在长大后的窗口 ${after.x}…${after.x + after.w} 内`);
  assert.ok(reply.countdownMenu.includes('收起提醒气泡'));

  // 非法提醒一律拒绝（Chrome 据此退回系统通知），当前气泡不变
  const bad = [
    nudge({ buttons: [{ id: 'done', title: 'a' }, { id: 'snooze', title: 'b' }, { id: 'done', title: 'c' }] }),
    nudge({ buttons: [{ id: 'delete', title: '删除' }] }),
    nudge({ buttons: [] }),
    nudge({ buttons: [{ id: 'done', title: '喝了' }, { id: 'done', title: '再喝' }] }),
    nudge({ kind: 'alarm' }), nudge({ title: '  ' }), nudge({ text: 42 }), nudge({ id: 'x'.repeat(201) }), nudge({ id: '' }), 'bad', null
  ];
  for (const candidate of bad) {
    reply = await host.request('nudge', { nudge: candidate });
    assert.equal(reply.ok, false, `应拒绝：${JSON.stringify(candidate).slice(0, 80)}`); assert.equal(reply.nudgeId, 'jelly-nudge-water-1', '被拒绝的提醒不替换当前气泡');
  }
  // 迟到或不匹配的回执被忽略
  reply = await host.request('nudgeActionResult', { id: 'jelly-nudge-water-1', actionId: 'stale', ok: true, text: '不该显示' });
  assert.equal(reply.nudgeBusy, false); assert.equal(reply.nudgeId, 'jelly-nudge-water-1');
  // 替换：新的提醒替掉旧的，对旧 id 的撤销被忽略
  reply = await host.request('nudge', { nudge: nudge({ id: 'n2', kind: 'stretch', title: '起来动一动', text: '坐了好一会儿啦，站起来走两步吧', buttons: [{ id: 'done', title: '起来了' }] }) });
  assert.equal(reply.ok, true); assert.equal(reply.nudgeId, 'n2'); assert.deepEqual(Object.keys(reply.nudgeButtons), ['done'], '只有一个按钮');
  reply = await host.request('nudgeClear', { id: 'jelly-nudge-water-1' });
  assert.equal(reply.nudgeId, 'n2', '对旧提醒的撤销不影响新气泡');
  reply = await host.request('nudgeClear', { id: 'n2' });
  assert.equal(reply.nudgeId, null); assert.equal(reply.jellyBubble, 'none'); assert.equal(reply.jellyVisible, true, '常驻的水母在提醒结束后留下'); assert.match(reply.countdownFrame, BASE, '窗口缩回基础尺寸');
  host.noEvent('nudgeHidden', 'Chrome 自己撤销的提醒不需要再回报');

  // 没有常驻：提醒让水母临时出现，撤销后退场
  reply = await host.request('jelly', { jelly: jelly({ resident: false }) });
  assert.equal(reply.jellyVisible, false);
  reply = await host.request('nudge', { nudge: nudge() });
  assert.equal(reply.ok, true); assert.equal(reply.jellyVisible, true, '提醒让水母临时出现'); assert.equal(reply.jellyBubble, 'nudge');
  assert.equal(reply.countdownMenu.includes('收起水母'), false);
  reply = await host.request('nudgeClear', { id: 'jelly-nudge-water-1' });
  assert.equal(reply.jellyVisible, false, '提醒结束后临时出现的水母退场');

  // 倒计时与提醒同时存在：提醒优先显示，提醒结束后气泡回到倒计时
  await host.request('jelly', { jelly: jelly() });
  await host.request('countdown', { timer: timer({ fireAt: Date.now() + 40 * 60000 }) });
  reply = await host.request('nudge', { nudge: nudge() });
  assert.equal(reply.jellyBubble, 'nudge'); assert.match(reply.countdownText, /^(39:5\d|40:00)$/, '倒计时读数仍在后台更新');
  reply = await host.request('nudgeClear', { id: 'jelly-nudge-water-1' });
  assert.equal(reply.jellyBubble, 'clock'); await host.request('countdown', { timer: null });

  // 有效期：ttl 夹在 10–180 秒；到期原生自行收起并回报 nudgeHidden（Chrome 据此取消等待并退回通知）
  host.events.length = 0;
  reply = await host.request('nudge', { nudge: nudge({ ttl: 3 }) });
  assert.equal(reply.ok, true);
  await delay(6000);
  reply = await host.request('ping');
  assert.equal(reply.nudgeId, 'jelly-nudge-water-1', 'ttl 小于 10 秒按 10 秒处理，6 秒时仍在');
  host.noEvent('nudgeHidden', '未到期不回报');
  const hidden = await host.waitEvent('nudgeHidden', 7000);
  assert.equal(hidden.id, 'jelly-nudge-water-1');
  reply = await host.request('ping');
  assert.equal(reply.nudgeId, null); assert.equal(reply.jellyVisible, true);
  console.log('PASS 阶段 2：提醒气泡出现、校验、迟到回执忽略、替换与撤销、临时出现、与倒计时共存、有效期');
} finally { await host.stop(); }

// ---------- 阶段 3：右键菜单动作（经隔离测试钩子触发，等同用户点选） ----------
host = start();
try {
  await host.request('jelly', { jelly: jelly() });
  let reply = await host.request('countdown', { timer: timer() });
  host.events.length = 0;
  // 延后：协议字段完整，等 Chrome 回执才显示结果，反馈期间不重复提交
  reply = await host.request('menuItem', { title: '延后 5 分钟' });
  assert.equal(reply.ok, true);
  const delayEvent = await host.waitEvent('countdownAction');
  assert.deepEqual([delayEvent.action, delayEvent.minutes, delayEvent.alarmId, delayEvent.id, delayEvent.revision], ['delay', 5, 'a', 'smoke', 3]);
  assert.ok(delayEvent.actionId.length > 8);
  reply = await host.request('ping'); assert.equal(reply.jellyBubble, 'note', '等待回执时气泡显示“正在同步”');
  await host.request('menuItem', { title: '延后 5 分钟' });
  host.noEvent('countdownAction', '等待回执期间不能重复提交');
  await host.request('countdownActionResult', { id: 'smoke', actionId: 'stale', ok: false, error: '不该显示' });
  // 不匹配的回执不能解除等待：若被误采信，等待状态会清掉，这一次点选就会发出第二个动作
  await host.request('menuItem', { title: '延后 5 分钟' });
  host.noEvent('countdownAction', '不匹配的回执不能解除等待');
  await host.request('countdownActionResult', { id: 'smoke', actionId: delayEvent.actionId, ok: true, text: '已延后 5 分钟，改为 18:05' });
  reply = await host.request('ping'); assert.equal(reply.jellyBubble, 'note');
  await delay(4200);
  reply = await host.request('ping'); assert.equal(reply.jellyBubble, 'clock', '反馈消失后气泡回到倒计时');
  // 跳过：菜单里就是二次确认的子项；失败回执显示错误
  assert.equal((await host.request('menuItem', { title: '跳过本次' })).ok, false, '“跳过本次”本身只是子菜单入口，不触发动作');
  host.noEvent('countdownAction', '没有点“确认跳过”就不发送');
  reply = await host.request('menuItem', { title: '确认跳过这一次提醒' });
  assert.equal(reply.ok, true);
  const skip = await host.waitEvent('countdownAction');
  assert.equal(skip.action, 'skip'); assert.equal(skip.minutes, undefined);
  await host.request('countdownActionResult', { id: 'smoke', actionId: skip.actionId, ok: false, error: '提醒已被修改，请查看最新倒计时' });
  reply = await host.request('ping'); assert.equal(reply.jellyBubble, 'note');
  await delay(4300);
  // 打开闹钟中心
  reply = await host.request('menuItem', { title: '在 Chrome 中打开闹钟中心' });
  assert.equal(reply.ok, true);
  assert.equal((await host.waitEvent('countdownAction')).action, 'open');
  await delay(300);
  // 隐藏倒计时：只回报，不取消闹钟；常驻水母留下
  reply = await host.request('menuItem', { title: '隐藏倒计时（不取消闹钟）' });
  assert.equal(reply.ok, true); assert.equal((await host.waitEvent('countdownHidden')).id, 'smoke');
  reply = await host.request('ping'); assert.equal(reply.countdownVisible, false); assert.equal(reply.jellyVisible, true);
  // 不存在或被禁用的菜单项一律拒绝
  assert.equal((await host.request('menuItem', { title: '接下来' })).ok, false);
  assert.equal((await host.request('menuItem', { title: '不存在的菜单' })).ok, false);
  assert.equal((await host.request('menuItem', {})).ok, false);

  // 收起提醒气泡：回报 nudgeHidden
  await host.request('nudge', { nudge: nudge() });
  host.events.length = 0;
  reply = await host.request('menuItem', { title: '收起提醒气泡' });
  assert.equal(reply.ok, true); assert.equal((await host.waitEvent('nudgeHidden')).id, 'jelly-nudge-water-1');
  reply = await host.request('ping'); assert.equal(reply.nudgeId, null); assert.equal(reply.jellyVisible, true);
  // 收起水母：原生只把“不再常驻”交回 Chrome，水母要等 Chrome 推来新状态才消失
  host.events.length = 0;
  reply = await host.request('menuItem', { title: '收起水母' });
  assert.equal(reply.ok, true);
  const collapse = await host.waitEvent('jellySetting');
  assert.deepEqual([collapse.resident], [false]);
  reply = await host.request('ping'); assert.equal(reply.jellyVisible, true, '原生不替 Chrome 改设置，水母暂不消失'); assert.equal(reply.jellyResident, true);
  reply = await host.request('jelly', { jelly: jelly({ resident: false }) });
  assert.equal(reply.jellyVisible, false, 'Chrome 保存设置并推送后水母才消失');
  console.log('PASS 阶段 3：菜单动作的协议字段、回执门槛、重复提交保护、二次确认、隐藏与收起');
} finally { await host.stop(); }
// 对照：没有 TIMEKEEPER_TEST_HOOKS 的组件拒绝测试钩子
{
  const guarded = start({ TIMEKEEPER_TEST_HOOKS: '0' });
  try {
    await guarded.request('jelly', { jelly: jelly() });
    assert.equal((await guarded.request('menuItem', { title: '收起水母' })).ok, false, '正式使用时测试钩子恒为拒绝');
    guarded.noEvent('jellySetting', '被拒绝的钩子不能触发动作');
    console.log('PASS 阶段 3b：测试钩子在正式使用时无效');
  } finally { await guarded.stop(); }
}

// ---------- 阶段 4：减少动态效果 ----------
host = start({ TIMEKEEPER_REDUCE_MOTION: '1' });
try {
  let reply = await host.request('jelly', { jelly: jelly() });
  reply = await host.request('countdown', { timer: timer({ fireAt: Date.now() + 280000 }) });
  assert.equal(reply.countdownReduceMotion, true);
  const first = reply.countdownFrame;
  await delay(2600);
  reply = await host.request('ping');
  assert.equal(reply.countdownFrame, first, '减少动态效果时水母不游动');
  reply = await host.request('nudge', { nudge: nudge() });
  assert.equal(reply.ok, true); assert.equal(reply.jellyBubble, 'nudge', '减少动态效果下提醒气泡照常出现');
  console.log('PASS 阶段 4：减少动态效果下水母静止、气泡正常显示');
} finally { await host.stop(); }

async function nudgeMousePhase() {
  // ---------- 阶段 5：真实鼠标 ----------
  host = start();
  try {
    await host.request('jelly', { jelly: jelly() });
    await delay(600);
    let reply = await host.request('ping');
    let f = frameOf(reply.countdownFrame);
    // 点一下水母：看到今天的记录；提醒气泡期间不响应（免得按钮从鼠标下跑掉）
    mouse('click', f.x + f.w / 2, f.y + 77); await delay(500);
    reply = await host.request('ping');
    assert.equal(reply.jellyBubble, 'detail', '点一下水母显示详情'); assert.equal(host.events.some(e => e.type === 'countdownAction' || e.type === 'nudgeAction'), false, '点水母不会改任何东西');
    shot('detail', reply.countdownWindowNumber);
    await delay(4300);
    reply = await host.request('ping'); assert.equal(reply.jellyBubble, 'none', '详情 4 秒后自动收起');

    // 喝水提醒：点“喝了”，等 Chrome 回执才显示结果；多次点击不重复提交；迟到/不匹配的回执被忽略
    host.events.length = 0;
    reply = await host.request('nudge', { nudge: nudge() });
    await delay(500);
    reply = await host.request('ping');
    const done = center(reply.nudgeButtons.done);
    mouse('click', f.x + f.w / 2, f.y + 77); await delay(300);
    assert.equal((await host.request('ping')).jellyBubble, 'nudge', '提醒期间点水母本体不弹详情');
    mouse('click', done.x, done.y);
    let action;
    try { action = await host.waitEvent('nudgeAction', 1500); } catch { mouse('move', done.x, done.y); await delay(300); mouse('click', done.x, done.y); action = await host.waitEvent('nudgeAction'); }
    assert.deepEqual([action.id, action.action], ['jelly-nudge-water-1', 'done']); assert.ok(action.actionId.length > 8);
    reply = await host.request('ping'); assert.equal(reply.nudgeBusy, true, '等待 Chrome 回执期间按钮不可再点');
    shot('nudge-busy', reply.countdownWindowNumber);
    mouse('click', done.x, done.y); await delay(300);
    host.noEvent('nudgeAction', '等待回执期间再点不重复提交');
    await host.request('nudgeActionResult', { id: 'jelly-nudge-water-1', actionId: 'stale', ok: true, text: '不该显示' });
    await host.request('nudgeActionResult', { id: 'other', actionId: action.actionId, ok: true, text: '不该显示' });
    assert.equal((await host.request('ping')).nudgeBusy, true, '不匹配的回执被忽略');
    await host.request('nudgeActionResult', { id: 'jelly-nudge-water-1', actionId: action.actionId, ok: true, text: '已记录，今天第 3 次 ✓' });
    reply = await host.request('ping'); assert.equal(reply.nudgeBusy, false); assert.equal(reply.nudgeId, 'jelly-nudge-water-1', '成功后先显示结果再收起');
    await delay(300); shot('nudge-done', reply.countdownWindowNumber);
    await delay(2800);
    reply = await host.request('ping'); assert.equal(reply.nudgeId, null, '成功回执显示约 2.4 秒后收起'); assert.equal(reply.jellyVisible, true);
    await host.waitEvent('nudgeHidden');   // 收起时回报一次 nudgeHidden（Chrome 已知该提醒完成，应忽略）

    // 失败可重试：保留按钮，错误显示在气泡里
    host.events.length = 0;
    await host.request('nudge', { nudge: nudge({ id: 'n-retry' }) });
    await delay(500);
    reply = await host.request('ping');
    const snooze = center(reply.nudgeButtons.snooze);
    mouse('click', snooze.x, snooze.y);
    const first = await host.waitEvent('nudgeAction', 2500).catch(async () => { mouse('move', snooze.x, snooze.y); await delay(300); mouse('click', snooze.x, snooze.y); return host.waitEvent('nudgeAction'); });
    assert.equal(first.action, 'snooze');
    await host.request('nudgeActionResult', { id: 'n-retry', actionId: first.actionId, ok: false, error: '没有记上，请重试' });
    reply = await host.request('ping'); assert.equal(reply.nudgeBusy, false); assert.equal(reply.nudgeId, 'n-retry', '失败时保留气泡与按钮');
    await delay(300); shot('nudge-error', reply.countdownWindowNumber);
    mouse('click', snooze.x, snooze.y);
    const second = await host.waitEvent('nudgeAction', 2500);
    assert.equal(second.action, 'snooze'); assert.notEqual(second.actionId, first.actionId, '重试使用新的 actionId');
    await host.request('nudgeActionResult', { id: 'n-retry', actionId: second.actionId, ok: true, text: '好的，10 分钟后再提醒你' });
    await delay(3000);
    assert.equal((await host.request('ping')).nudgeId, null);

    // Chrome 一直不回执：8 秒后提示“尚未确认”，可以重试
    host.events.length = 0;
    await host.request('nudge', { nudge: nudge({ id: 'n-noack' }) });
    await delay(500);
    reply = await host.request('ping');
    const noack = center(reply.nudgeButtons.done);
    mouse('click', noack.x, noack.y);
    await host.waitEvent('nudgeAction', 2500).catch(async () => { mouse('move', noack.x, noack.y); await delay(300); mouse('click', noack.x, noack.y); return host.waitEvent('nudgeAction'); });
    await delay(8600);
    reply = await host.request('ping'); assert.equal(reply.nudgeBusy, false, '8 秒没有回执，按钮恢复可点'); assert.equal(reply.nudgeId, 'n-noack');
    shot('nudge-noack', reply.countdownWindowNumber);
    await host.request('nudgeClear', { id: 'n-noack' });

    // 拖起放手后落回游泳线
    reply = await host.request('ping'); f = frameOf(reply.countdownFrame);
    mouse('drag', f.x + f.w / 2, f.y + 77, f.x - 200, f.y + 380, 24); await delay(150);
    reply = await host.request('ping'); const released = frameOf(reply.countdownFrame);
    await delay(4000);
    reply = await host.request('ping'); const later = frameOf(reply.countdownFrame);
    assert.ok(later.y < released.y - 100, `放手后应落回游泳线：${released.y} → ${later.y}`);
    assert.equal(host.events.some(e => e.type === 'countdownAction' || e.type === 'nudgeAction'), false, '拖动水母不会触发任何业务动作');
    console.log('PASS 阶段 5：点击报时、提醒按钮（回执门槛、重复保护、失败重试、无回执恢复）、拖起放手落回');
  } finally { await host.stop(); }
}
if (withMouse) {
  await nudgeMousePhase();
  await ringMousePhase();
}

// ---------- 阶段 6：各倒计时阶段截图（仅 --shots） ----------
if (shots) {
  host = start({ TIMEKEEPER_NIGHT_HOUR: '23' });
  try {
    await host.request('jelly', { jelly: jelly() });
    for (const [name, seconds] of [['countdown-calm', 3 * 3600 + 4 * 60 + 17], ['countdown-soon', 280], ['countdown-imminent', 45], ['countdown-final', 6]]) {
      await host.request('countdown', { timer: timer({ fireAt: Date.now() + seconds * 1000 }) });
      await delay(2600);
      shot(name, (await host.request('ping')).countdownWindowNumber);
    }
    console.log('PASS 阶段 6：各阶段截图已写入', shots);
  } finally { await host.stop(); }
}
console.log('PASS: jelly（协议 v7）全部阶段');
