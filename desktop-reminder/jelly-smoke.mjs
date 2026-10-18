// 隔离验收：桌面水母（协议 v6 引入、v10 沿用；含 v8 的水母差事气泡与 presence、v9 的推荐歌曲三按钮气泡与右键菜单“水母，给我…”、v10 的活动行为（白天清醒、巡游、小动作、睡觉规则，--only=patrol），可单独跑 --only=errand / --only=presence；常驻与临时出现、倒计时委托、喝水/起身提醒气泡、到点响铃、右键菜单动作、夜晚荧光、减少动态效果、真实鼠标）。
// 用独立构建的原生组件（--app，独立 Bundle ID，不改写真实组件保存的位置），不连接 Chrome，不读写任何闹钟或喝水记录。
//   node desktop-reminder/build.mjs --extension-id=<id> --app=/tmp/tk/QA.app
//   node desktop-reminder/jelly-smoke.mjs --extension-id=<id> --app=/tmp/tk/QA.app [--no-mouse] [--shots=/tmp/tk/shots] [--only=ring|ring-mouse|nudge-mouse|presence|errand|patrol [--scenario=名字里的正则]]
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
import { idleSeconds, Quiet, EXIT_USER_ACTIVE } from './user-quiet.mjs';
const JellyfishCore = createRequire(import.meta.url)('../js/jellyfish-core.js');

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const id = arg('extension-id');
if (!/^[a-p]{32}$/.test(id || '')) throw new Error('需要 --extension-id=实际扩展ID');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = arg('app');
if (!app) throw new Error('必须用 --app 指向隔离构建，避免改写真实组件的窗口记忆');
const shots = arg('shots');
const only = arg('only');
const scenarioFilter = arg('scenario') ? new RegExp(arg('scenario')) : null;      // 调试 / 变异检查用：--only=errand 时只跑名字匹配的差事场景
if (only && !['ring', 'ring-mouse', 'nudge-mouse', 'presence', 'errand', 'patrol'].includes(only)) throw new Error('--only 目前只支持 ring、ring-mouse、nudge-mouse、presence、errand、patrol');
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
// 礼让用户（user-quiet.mjs）：只有活动行为的真实鼠标场景用它（--quiet=秒，默认 20，0 关闭）；合成输入会重置系统空闲时间，所以每次都要 touch()，才分得清真实用户
const quiet = new Quiet(Number(arg('quiet') ?? 20));
const mouse = (...a) => { try { return execFileSync(helper, a.map(String)); } finally { quiet.touch(); } };
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
    assert.equal(reply.ok, true); assert.equal(reply.version, 10); assert.equal(reply.focusStayed, true, '响铃不抢焦点');
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

// ---------- 阶段 P：presence（协议 v8，系统空闲秒数 → active / away，只在变化时上报） ----------
// 空闲秒数经隔离测试钩子 TIMEKEEPER_IDLE_SECONDS 注入（需要 TIMEKEEPER_TEST_HOOKS=1，正式组件恒读系统）；不碰真实键鼠。
if (only !== 'errand' && only !== 'patrol') {
for (const [idle, expected] of [['0', 'active'], ['299', 'active'], ['300', 'away'], ['99999', 'away']]) {
  host = start({ TIMEKEEPER_IDLE_SECONDS: idle });
  try {
    host.noEvent('presence', '没有常驻前不上报');
    let reply = await host.request('jelly', { jelly: jelly() });
    assert.equal(reply.ok, true);
    const event = await host.waitEvent('presence', 2000);
    assert.equal(event.state, expected, `空闲 ${idle} 秒应为 ${expected}`);
    assert.deepEqual(Object.keys(event).sort(), ['state', 'type'], 'presence 只有 type 与 state，不带具体秒数');
    assert.equal((await host.request('ping')).presence, expected);
    // 状态没变就不重复上报：再发一次 jelly 命令（同样常驻）不会产生第二个事件
    await host.request('jelly', { jelly: jelly() });
    await delay(300);
    host.noEvent('presence', `空闲 ${idle} 秒：状态没变不应重复上报`);
    // 取消常驻即停止采样并忘掉状态；重新常驻后再报一次，Chrome 据此拿到新的初始状态
    reply = await host.request('jelly', { jelly: jelly({ resident: false }) });
    assert.equal(reply.presence, null, '不常驻就忘掉上一次的结果');
    await delay(300);
    host.noEvent('presence', '不常驻不上报');
    await host.request('jelly', { jelly: jelly() });
    assert.equal((await host.waitEvent('presence', 2000)).state, expected, '重新常驻后再报一次');
  } finally { await host.stop(); }
}
{
  // 没有常驻只靠倒计时临时出现：不采样、不上报（presence 只服务常驻的水母差事）
  host = start({ TIMEKEEPER_IDLE_SECONDS: '99999' });
  try {
    await host.request('jelly', { jelly: jelly({ resident: false }) });
    await host.request('countdown', { timer: timer() });
    await delay(500);
    host.noEvent('presence', '临时出现的水母不上报 presence');
    assert.equal((await host.request('ping')).presence, null);
  } finally { await host.stop(); }
}
{
  // 对照：没有 TIMEKEEPER_TEST_HOOKS 时 TIMEKEEPER_IDLE_SECONDS 无效，presence 只读系统（正式使用时环境变量不能谎报“离开”）。
  // 真实空闲接近阈值（用户真的离开了一阵）时系统读数本身就可能是 away，此时跳过，不把“人不在”算成失败。
  const real = idleSeconds();
  if (real < 240) {
    host = start({ TIMEKEEPER_TEST_HOOKS: '0', TIMEKEEPER_IDLE_SECONDS: '99999' });
    try {
      await host.request('jelly', { jelly: jelly() });
      const event = await host.waitEvent('presence', 2000);
      assert.equal(event.state, 'active', '没有测试钩子时环境变量不能覆盖真实空闲时间');
    } finally { await host.stop(); }
  } else console.log(`  - 跳过“钩子关闭时忽略注入的空闲秒数”：真实空闲 ${Math.round(real)} 秒，接近阈值`);
}
console.log('PASS 阶段 P：presence 上报（阈值 300 秒、只在变化时、不常驻不上报）');
}
if (only === 'presence') { console.log('PASS: jelly presence 阶段'); process.exit(0); }

// ---------- 阶段 E：水母差事气泡（协议 v8：类别与按钮白名单、先游到你所在的屏幕再开口；v9：歌曲三按钮气泡与右键菜单请求） ----------
// 差事复用喝水/起身提醒的气泡与 nudge 命令，只是类别与按钮不同；按钮经测试钩子 nudgeButton 触发（走真实动作入口）。
// 水母按“鼠标所在屏幕”选落点，所以运行期间不要碰鼠标（指针被外部挪到另一块屏幕会改变“是否需要游过来”）。
const errand = (extra = {}) => ({
  id: 'jelly-errand-brief-1', kind: 'brief', title: '今天的安排', text: '今天有 3 个任务，另有 1 个已过期',
  buttons: [{ id: 'open', title: '看看' }, { id: 'later', title: '知道了' }], ttl: 90, ...extra
});
// 协议 v9 的推荐歌曲气泡：三个按钮（播放 / 换一首 / 不听），是唯一允许 3 个按钮的类别
const songBubble = (extra = {}) => errand({
  id: 'jelly-errand-song-1', kind: 'song', title: '给你一首歌', text: '《夜曲》· 周杰伦',
  buttons: [{ id: 'play', title: '播放' }, { id: 'another', title: '换一首' }, { id: 'dismiss', title: '不听' }], ...extra
});
const errandScenario = async (name, env, body) => {
  if (scenarioFilter && !scenarioFilter.test(name)) return;
  const h = start(env);
  try { await body(h); console.log(`  ✓ 差事：${name}`); } finally { await h.stop(); }
};
if (!only || only === 'errand') {
  await errandScenario('协议校验：每个类别只认自己的按钮，只有歌曲能有 3 个，未知类别与错配的按钮被拒绝，被拒绝的不替换当前气泡', {}, async h => {
    for (const bad of [
      errand({ kind: 'song', buttons: [{ id: 'open', title: '看看' }] }),                                  // 歌曲不能用差事的按钮
      songBubble({ buttons: [{ id: 'play', title: 'a' }, { id: 'another', title: 'b' }, { id: 'dismiss', title: 'c' }, { id: 'play', title: 'd' }] }),   // 最多 3 个
      songBubble({ buttons: [{ id: 'play', title: 'a' }, { id: 'play', title: 'b' }] }),                   // 不能重复
      songBubble({ buttons: [{ id: 'play', title: 'a' }, { id: 'done', title: 'b' }] }),                   // 喝水的按钮
      songBubble({ buttons: [] }),
      errand({ buttons: [{ id: 'play', title: '听' }] }),                                                  // 概览不能放歌
      errand({ kind: 'tidbit', buttons: [{ id: 'another', title: '换' }, { id: 'dismiss', title: '够了' }] }),
      errand({ kind: 'concert', buttons: [{ id: 'open', title: '看看' }] }),                               // 未知类别
      errand({ buttons: [{ id: 'done', title: '喝了' }] }),                       // 差事不能用喝水的按钮
      errand({ kind: 'tidbit', buttons: [{ id: 'open', title: '看看' }] }),       // 小乐子只认 more / dismiss
      errand({ kind: 'task', buttons: [{ id: 'more', title: '再来' }] }),
      errand({ buttons: [{ id: 'open', title: 'a' }, { id: 'later', title: 'b' }, { id: 'open', title: 'c' }] }),
      errand({ buttons: [{ id: 'Open', title: '看看' }] }),
      nudge({ buttons: [{ id: 'open', title: '看看' }] }),                         // 喝水也不能用差事的按钮
      nudge({ buttons: [{ id: 'play', title: '播放' }] })
    ]) {
      const reply = await h.request('nudge', { nudge: bad });
      assert.equal(reply.ok, false, `应拒绝：${JSON.stringify(bad).slice(0, 90)}`);
      assert.equal(reply.nudgeId, null);
    }
    for (const [kind, buttons] of [['brief', ['open', 'later']], ['task', ['open', 'later']], ['worklog', ['open', 'later']], ['tidbit', ['more', 'dismiss']],
      ['song', ['play']], ['song', ['play', 'dismiss']], ['song', ['play', 'another', 'dismiss']], ['song', ['dismiss', 'another', 'play']]]) {
      const reply = await h.request('nudge', { nudge: errand({ id: `jelly-errand-${kind}-1`, kind, buttons: buttons.map(id => ({ id, title: id })) }) });
      assert.equal(reply.ok, true, `${kind} ${buttons} 应接受`);
      await h.request('nudgeClear', { id: `jelly-errand-${kind}-1` });
    }
  });

  await errandScenario('没有常驻：水母先从屏幕右边游入，到位之前没有气泡也点不了，到位后才开口', {}, async h => {
    let reply = await h.request('nudge', { nudge: errand() });
    assert.equal(reply.ok, true, '已接手：Chrome 据此不再发系统通知'); assert.equal(reply.nudgeId, 'jelly-errand-brief-1');
    assert.equal(reply.nudgeArriving, true, '刚接手时水母还在路上');
    assert.notEqual(reply.jellyBubble, 'nudge', '到位之前气泡不出现');
    assert.equal((await h.request('nudgeButton', { id: 'open' })).ok, false, '到位之前按钮不发动作');
    h.noEvent('nudgeAction', '到位之前不会有动作');
    const shown = await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 4500, '水母到位后气泡出现');
    assert.deepEqual(Object.keys(shown.nudgeButtons).sort(), ['later', 'open']);
    assert.equal(shown.focusStayed, true, '差事气泡不抢焦点');
    await delay(400); shot('errand-brief', shown.countdownWindowNumber);
  });

  await errandScenario('点“看看”：只发一个 open 动作，回执成功后收起并交还水母', {}, async h => {
    await h.request('nudge', { nudge: errand() });
    await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 4500, '到位');
    const first = await h.request('nudgeButton', { id: 'open' });
    assert.equal(first.ok, true); assert.equal(first.nudgeBusy, true, '等待回执期间按钮禁用');
    const action = await h.waitEvent('nudgeAction', 1500);
    assert.equal(action.id, 'jelly-errand-brief-1'); assert.equal(action.action, 'open'); assert.ok(action.actionId);
    assert.equal((await h.request('nudgeButton', { id: 'later' })).ok, false, '等回执时不能再发第二个动作');
    h.noEvent('nudgeAction', '只有一个动作');
    await h.request('nudgeActionResult', { id: action.id, actionId: action.actionId, ok: true, text: '已打开' });
    await until(h, r => r.nudgeId === null, 4500, '成功回执显示后气泡收起');
    const hidden = await h.waitEvent('nudgeHidden', 1500); assert.equal(hidden.id, 'jelly-errand-brief-1');
    assert.equal((await h.request('ping')).jellyVisible, false, '没有常驻：水母随气泡退场');
  });

  await errandScenario('失败回执：显示原因、按钮恢复可重试，不声称成功', {}, async h => {
    await h.request('nudge', { nudge: errand({ id: 'jelly-errand-task-1', kind: 'task', title: '任务提醒', text: '3 个任务已过期', buttons: [{ id: 'open', title: '去处理' }, { id: 'later', title: '明天再说' }] }) });
    await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 4500, '到位');
    assert.equal((await h.request('nudgeButton', { id: 'later' })).ok, true);
    const action = await h.waitEvent('nudgeAction', 1500); assert.equal(action.action, 'later');
    const reply = await h.request('nudgeActionResult', { id: action.id, actionId: action.actionId, ok: false, error: '没有成功' });
    assert.equal(reply.nudgeBusy, false, '失败后按钮恢复'); assert.equal(reply.nudgeId, 'jelly-errand-task-1', '失败不收起气泡');
    assert.equal((await h.request('nudgeButton', { id: 'later' })).ok, true, '可以重试');
  });

  await errandScenario('水母已常驻且就在你所在的屏幕上：原地开口，不游动', {}, async h => {
    let reply = await h.request('jelly', { jelly: jelly() });
    assert.equal(reply.jellyVisible, true);
    await delay(500);
    reply = await h.request('nudge', { nudge: errand() });
    assert.equal(reply.ok, true);
    assert.equal(reply.nudgeArriving, false, `已经在鼠标所在屏幕：不需要游过来（鼠标 ${reply.mouse}，屏幕数 ${reply.screenCount}）`);
    assert.equal(reply.jellyBubble, 'nudge', '立即开口');
  });

  await errandScenario('喝水提醒不变：没有“游过来”阶段，立即出现', {}, async h => {
    const reply = await h.request('nudge', { nudge: nudge() });
    assert.equal(reply.ok, true); assert.equal(reply.nudgeArriving, false); assert.equal(reply.jellyBubble, 'nudge');
    assert.deepEqual(Object.keys(reply.nudgeButtons).sort(), ['done', 'snooze']);
  });

  await errandScenario('减少动态效果：不游动，水母原位直接就位后很快开口', { TIMEKEEPER_REDUCE_MOTION: '1' }, async h => {
    const reply = await h.request('nudge', { nudge: errand() });
    assert.equal(reply.ok, true);
    await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 1500, '减少动态效果下快速开口');
  });

  await errandScenario('游过来的途中被撤回：状态干净，不会残留“还在路上”', {}, async h => {
    await h.request('nudge', { nudge: errand() });
    const reply = await h.request('nudgeClear', { id: 'jelly-errand-brief-1' });
    assert.equal(reply.nudgeId, null); assert.equal(reply.nudgeArriving, false);
    await delay(800);
    assert.equal((await h.request('ping')).jellyBubble, 'none', '到位回调作废，不会冒出已撤回的气泡');
  });

  await errandScenario('游过来的途中响铃接管：响完气泡恢复且按钮可用（到位回调不会卡住）', {}, async h => {
    await h.request('nudge', { nudge: errand() });
    let reply = await h.request('show', ring());
    assert.equal(reply.ok, true); assert.equal(reply.nudgeArriving, false, '响铃接管后不再等“到位”');
    await until(h, r => r.ringPhase === 'shown', 4500, '响铃气泡弹出');
    reply = await h.request('hide', { sessionId: 'ring-1' });
    const back = await until(h, r => r.ringId === null && r.jellyBubble === 'nudge', 5000, '响铃结束后差事气泡回来');
    assert.equal(back.nudgeArriving, false);
    assert.equal((await h.request('nudgeButton', { id: 'later' })).ok, true, '按钮可用');
  });

  await errandScenario('响铃中差事被拒绝（Chrome 据此退回系统通知）', {}, async h => {
    await h.request('show', ring());
    const reply = await h.request('nudge', { nudge: errand() });
    assert.equal(reply.ok, false); assert.equal(reply.nudgeId, null);
  });

  // ---- 协议 v9：推荐歌曲三按钮气泡 ----
  await errandScenario('歌曲气泡：播放 / 换一首 / 不听三个按钮齐全，都在窗口里且互不重叠，没抢焦点', {}, async h => {
    const sent = await h.request('nudge', { nudge: songBubble() });
    assert.equal(sent.ok, true, '协议 v9：歌曲气泡被接受'); assert.equal(sent.nudgeId, 'jelly-errand-song-1');
    const shown = await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 4500, '水母到位后歌曲气泡出现');
    assert.deepEqual(Object.keys(shown.nudgeButtons).sort(), ['another', 'dismiss', 'play']);
    assert.equal(shown.focusStayed, true, '歌曲气泡不抢焦点');
    const win = frameOf(shown.countdownFrame);
    const boxes = Object.entries(shown.nudgeButtons).map(([button, text]) => [button, frameOf(text)]);
    for (const [button, f] of boxes) {
      assert.ok(f.w > 20 && f.h > 10, `${button} 按钮有实际大小：${JSON.stringify(f)}`);
      assert.ok(f.x >= win.x - 0.5 && f.x + f.w <= win.x + win.w + 0.5 && f.y >= win.y - 0.5 && f.y + f.h <= win.y + win.h + 0.5, `${button} 按钮在窗口之内：${JSON.stringify(f)} 对 ${JSON.stringify(win)}`);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i][1], b = boxes[j][1];
      const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
      assert.equal(overlap, false, `${boxes[i][0]} 与 ${boxes[j][0]} 不重叠`);
    }
    await delay(400); shot('errand-song', shown.countdownWindowNumber);
  });

  await errandScenario('歌曲气泡的三个按钮各发自己的动作；等回执时只能有一个，成功回执后收起并交还水母', {}, async h => {
    for (const [action, text] of [['play', '已开始播放《夜曲》'], ['another', '换一首～'], ['dismiss', '好的，少说点']]) {
      const bubbleId = `jelly-errand-song-${action}`;
      assert.equal((await h.request('nudge', { nudge: songBubble({ id: bubbleId }) })).ok, true);
      await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge' && r.nudgeId === bubbleId, 4500, `${action}：到位`);
      assert.equal((await h.request('nudgeButton', { id: 'open' })).ok, false, '歌曲没有 open 按钮');
      const first = await h.request('nudgeButton', { id: action });
      assert.equal(first.ok, true, `${action} 可点`); assert.equal(first.nudgeBusy, true, '等回执期间按钮禁用');
      const event = await h.waitEvent('nudgeAction', 1500);
      assert.equal(event.id, bubbleId); assert.equal(event.action, action); assert.ok(event.actionId);
      for (const other of ['play', 'another', 'dismiss'].filter(id => id !== action)) assert.equal((await h.request('nudgeButton', { id: other })).ok, false, `${action} 等回执时不能再发 ${other}`);
      h.noEvent('nudgeAction', `${action}：只有一个动作`);
      await h.request('nudgeActionResult', { id: event.id, actionId: event.actionId, ok: true, text });
      await until(h, r => r.nudgeId === null, 4500, `${action}：成功回执显示后气泡收起`);
      assert.equal((await h.waitEvent('nudgeHidden', 1500)).id, bubbleId);
      assert.equal((await h.request('ping')).jellyVisible, false, '没有常驻：水母随气泡退场');
    }
  });

  await errandScenario('歌曲“播放”失败：显示 Chrome 给的原因，三个按钮恢复，“换一首”仍可点；不声称已播放', {}, async h => {
    await h.request('nudge', { nudge: songBubble() });
    await until(h, r => r.nudgeArriving === false && r.jellyBubble === 'nudge', 4500, '到位');
    assert.equal((await h.request('nudgeButton', { id: 'play' })).ok, true);
    const play = await h.waitEvent('nudgeAction', 1500); assert.equal(play.action, 'play');
    const failed = await h.request('nudgeActionResult', { id: play.id, actionId: play.actionId, ok: false, error: '这首歌暂不可播放，点“换一首”试试' });
    assert.equal(failed.nudgeBusy, false, '失败后按钮恢复'); assert.equal(failed.nudgeId, 'jelly-errand-song-1', '失败不收起气泡');
    assert.deepEqual(Object.keys(failed.nudgeButtons).sort(), ['another', 'dismiss', 'play']);
    assert.equal((await h.request('nudgeButton', { id: 'another' })).ok, true, '“换一首”可以点');
    assert.equal((await h.waitEvent('nudgeAction', 1500)).action, 'another');
  });

  // ---- 协议 v9：右键菜单“水母，给我…” ----
  const MENU = [['今日概览', 'brief'], ['来首歌', 'song'], ['来点乐子', 'tidbit'], ['工作日志', 'worklog']];
  await errandScenario('右键菜单“水母，给我…”：不带 errands 字段没有；带了才有；四项各发自己的 errandRequest，等回执时全部禁用', {}, async h => {
    let reply = await h.request('jelly', { jelly: jelly() });
    assert.equal(reply.errandsMenu, false, '默认没有差事菜单'); assert.equal(reply.countdownMenu.includes('水母，给我…'), false);
    for (const [title] of MENU) assert.equal((await h.request('menuItem', { title })).ok, false, `${title}：没开差事菜单时不可点`);
    reply = await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    assert.equal(reply.errandsMenu, true); assert.ok(reply.countdownMenu.includes('水母，给我…'), `菜单：${reply.countdownMenu.join(' | ')}`);
    assert.equal(reply.countdownMenu[0], '水母，给我…', '没有“问 AI…”时它排在第一段第一项');
    assert.equal(reply.countdownMenu[1], '---');
    for (const [title, kind] of MENU) {
      reply = await h.request('menuItem', { title });
      assert.equal(reply.ok, true, `${title} 可点`);
      const event = await h.waitEvent('errandRequest', 1500);
      assert.equal(event.kind, kind); assert.equal(typeof event.errandId, 'string'); assert.ok(event.errandId.length >= 8); assert.equal('requestId' in event, false, '事件不带 requestId（那是命令回执的关联键）');
      assert.deepEqual(Object.keys(event).sort(), ['errandId', 'kind', 'type'], '请求只有类别与编号，不带任何内容');
      assert.equal(reply.errandRequestBusy, true); assert.equal(reply.feedback, '稍等，水母在准备…');
      for (const [other] of MENU) assert.equal((await h.request('menuItem', { title: other })).ok, false, `${title} 等回执时 ${other} 被禁用`);
      h.noEvent('errandRequest', '等回执时不会发第二个请求');
      reply = await h.request('errandRequestResult', { errandId: event.errandId, ok: true });
      assert.equal(reply.errandRequestBusy, false, `${kind}：回执后可以再点`); assert.equal(reply.feedback, '', 'ok 没文字：气泡由 nudge 命令呈现，这里只清掉“正在准备”');
    }
    reply = await h.request('jelly', { jelly: jelly() });
    assert.equal(reply.errandsMenu, false, 'Chrome 不再带 errands（总开关关了）：菜单消失'); assert.equal(reply.countdownMenu.includes('水母，给我…'), false);
  });

  await errandScenario('菜单请求的回执：没有内容显示文字、失败显示原因；对不上或重复的回执被忽略', {}, async h => {
    await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    await h.request('menuItem', { title: '今日概览' });
    const first = await h.waitEvent('errandRequest', 1500);
    let reply = await h.request('errandRequestResult', { errandId: 'someone-else', ok: true, text: '不该显示' });
    assert.equal(reply.errandRequestBusy, true, '对不上的回执不改状态'); assert.equal(reply.feedback, '稍等，水母在准备…');
    reply = await h.request('errandRequestResult', { errandId: first.errandId, ok: true, text: '今天没有到期或已过期的任务' });
    assert.equal(reply.errandRequestBusy, false); assert.equal(reply.feedback, '今天没有到期或已过期的任务');
    reply = await h.request('errandRequestResult', { errandId: first.errandId, ok: true, text: '重复的回执' });
    assert.equal(reply.feedback, '今天没有到期或已过期的任务', '重复回执不改显示');
    await h.request('menuItem', { title: '工作日志' });
    const second = await h.waitEvent('errandRequest', 1500);
    reply = await h.request('errandRequestResult', { errandId: second.errandId, ok: false, error: '水母正忙着响铃，等一下再叫它' });
    assert.equal(reply.errandRequestBusy, false); assert.equal(reply.feedback, '水母正忙着响铃，等一下再叫它');
    await h.request('menuItem', { title: '来点乐子' });
    const third = await h.waitEvent('errandRequest', 1500);
    reply = await h.request('errandRequestResult', { errandId: third.errandId, ok: false });
    assert.equal(reply.feedback, '没能完成，请重试', '失败没给原因也要有交代，不声称成功');
  });

  await errandScenario('菜单请求 15 秒没有回执：提示 Chrome 没有回应，菜单恢复可点；迟到的旧回执不影响新请求', {}, async h => {
    await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    await h.request('menuItem', { title: '来首歌' });
    const old = await h.waitEvent('errandRequest', 1500);
    await delay(15500);
    let reply = await h.request('ping');
    assert.equal(reply.errandRequestBusy, false, '超时后不再卡住'); assert.equal(reply.feedback, 'Chrome 没有回应，请重试');
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, true, '可以重试');
    const retry = await h.waitEvent('errandRequest', 1500);
    assert.notEqual(retry.errandId, old.errandId, '重试是新的请求编号');
    reply = await h.request('errandRequestResult', { errandId: old.errandId, ok: true, text: '迟到的旧回执' });
    assert.equal(reply.errandRequestBusy, true, '迟到的旧回执不能当作新请求的回执'); assert.equal(reply.feedback, '稍等，水母在准备…');
    reply = await h.request('errandRequestResult', { errandId: retry.errandId, ok: true });
    assert.equal(reply.errandRequestBusy, false);
  });

  await errandScenario('菜单请求：前一个请求的 15 秒计时器不会清掉后一个请求（旧计时器按请求编号核对）', {}, async h => {
    await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    await h.request('menuItem', { title: '今日概览' });
    const first = await h.waitEvent('errandRequest', 1500);
    let reply = await h.request('errandRequestResult', { errandId: first.errandId, ok: true });
    assert.equal(reply.errandRequestBusy, false, '第一个请求已有回执');
    await delay(5000);
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, true);
    const second = await h.waitEvent('errandRequest', 1500);
    assert.notEqual(second.errandId, first.errandId);
    await delay(11500);      // 第一个请求的 15 秒计时器此刻已过（距第一个请求约 16.5 秒），第二个请求自己的计时器要到约 20 秒才响
    reply = await h.request('ping');
    assert.equal(reply.errandRequestBusy, true, '旧计时器不能把还在等回执的新请求清掉'); assert.equal(reply.feedback, '稍等，水母在准备…');
    reply = await h.request('errandRequestResult', { errandId: second.errandId, ok: true });
    assert.equal(reply.errandRequestBusy, false);
  });

  await errandScenario('响铃中没有“水母，给我…”、也发不出请求；响铃结束后菜单回来', {}, async h => {
    await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    let reply = await h.request('show', ring());
    assert.equal(reply.ok, true);
    assert.equal(reply.countdownMenu.includes('水母，给我…'), false, `响铃时菜单：${reply.countdownMenu.join(' | ')}`);
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, false);
    h.noEvent('errandRequest', '响铃中不发请求');
    await h.request('hide', { sessionId: 'ring-1' });
    reply = await until(h, r => r.ringId === null && r.countdownMenu.includes('水母，给我…'), 6000, '响铃结束后菜单回来');
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, true);
    assert.equal((await h.waitEvent('errandRequest', 1500)).kind, 'song');
  });

  await errandScenario('验收钩子 menuItem 在正式使用时对差事菜单同样无效', { TIMEKEEPER_TEST_HOOKS: '0' }, async h => {
    const reply = await h.request('jelly', { jelly: jelly({ errands: { enabled: true } }) });
    assert.equal(reply.errandsMenu, true);
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, false);
    h.noEvent('errandRequest', '没有测试钩子时不能凭空发出请求');
  });

  await errandScenario('验收钩子 nudgeButton 在正式使用时无效', { TIMEKEEPER_TEST_HOOKS: '0' }, async h => {
    await h.request('nudge', { nudge: errand() });
    await delay(2500);
    assert.equal((await h.request('nudgeButton', { id: 'open' })).ok, false);
  });
  console.log('PASS 阶段 E：水母差事气泡');
}
if (only === 'errand') { console.log('PASS: jelly 差事阶段'); process.exit(0); }

// ---------- 阶段 A：活动行为（协议 v10：jelly 命令 errands:{enabled:true, patrol:true} 时水母白天清醒、偶尔巡游、清醒静止时做小动作；
// 只在夜里、你离开电脑太久、或活动行为关闭时才睡） ----------
// 睡与不睡、什么时候游都是水母自己的动作，不产生业务数据、不向 Chrome 回报——所以这里只通过 ping 回执的诊断字段与窗口位置核对。
// 计时经 TIMEKEEPER_PATROL_SECONDS="出发,时长,小动作"（秒；仅 TIMEKEEPER_TEST_HOOKS=1 时生效）缩短，本地小时经 TIMEKEEPER_NIGHT_HOUR 固定（真实时间可能在夜里），
// 空闲秒数经 TIMEKEEPER_IDLE_SECONDS 注入。运行期间不要碰鼠标：鼠标停在水母身上本来就会让它不动（那是被验证的行为，但会让别的场景误判）。
const lively = (extra = {}) => jelly({ errands: { enabled: true, patrol: true }, ...extra });
const DAY = { TIMEKEEPER_NIGHT_HOUR: '11', TIMEKEEPER_IDLE_SECONDS: '5' };
const patrolScenario = async (name, env, body) => {
  if (scenarioFilter && !scenarioFilter.test(name)) return;
  const h = start({ ...DAY, ...env });
  try { await body(h); console.log(`  ✓ 活动：${name}`); } finally { await h.stop(); }
};
// 巡游中持续采样窗口位置直到结束；返回 { xs, ys, ms, last }，超过 limit 毫秒仍没结束就报错
const sampleUntilPatrolEnds = async (h, limit = 12000) => {
  const xs = [], ys = [], started = Date.now(); let last;
  for (;;) {
    last = await h.request('ping');
    if (!last.patrolling) return { xs, ys, ms: Date.now() - started, last };
    const f = frameOf(last.countdownFrame); xs.push(f.x); ys.push(f.y);
    if (Date.now() - started > limit) throw new Error(`巡游超过 ${limit} ms 还没结束`);
    await delay(80);
  }
};
if (!only || only === 'patrol') {
  for (const [label, errands] of [['没带 errands', undefined], ['只开差事、没带 patrol（v9 的写法）', { enabled: true }], ['patrol 为 false', { enabled: true, patrol: false }], ['patrol 不是布尔', { enabled: true, patrol: 'true' }], ['差事没开却带了 patrol', { enabled: false, patrol: true }]]) {
    await patrolScenario(`老样子：${label} → 休息就睡、不巡游、没有小动作`, { TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
      let reply = await h.request('jelly', { jelly: jelly(errands ? { errands } : {}) });
      assert.equal(reply.ok, true); assert.equal(reply.jellyLively, false);
      await delay(2500);
      reply = await h.request('ping');
      assert.equal(reply.jellyAsleep, true, '活动行为关闭：休息就睡（老样子）');
      assert.equal(reply.patrolling, false); assert.equal(reply.patrolCount, 0); assert.equal(reply.fidgetCount, 0);
    });
  }

  await patrolScenario('活动行为开：白天清醒；等一段后出发，窗口真的在横向游动；结束后沉回泳线并静止（不游回原位）；再隔一段等待才第二次出发', { TIMEKEEPER_PATROL_SECONDS: '4,5.5,600' }, async h => {
    let reply = await h.request('jelly', { jelly: lively() });
    assert.equal(reply.ok, true); assert.equal(reply.jellyLively, true);
    assert.equal(reply.jellyAsleep, false, '活动行为开：白天清醒（睁着眼）');
    assert.equal(reply.patrolling, false, '刚出现时不立刻出发，先等一段');
    const home = frameOf((await h.request('ping')).countdownFrame);
    reply = await until(h, r => r.patrolling === true, 6000, '等待约 4 秒后出发巡游');
    assert.equal(reply.patrolCount, 1); assert.equal(reply.jellyAsleep, false); assert.equal(reply.personality, 'steady', '11 点是“专注”');
    assert.ok(Math.abs(reply.swimPeriod - 1.4) < 0.01, `巡游用巡游的游法（11 点游速 1.0 → 周期 1.4，实际 ${reply.swimPeriod}）`);
    const run = await sampleUntilPatrolEnds(h);
    // 巡游时长故意取 5.5 秒：巡游期间每秒一次的刷新落在整数秒上，时长若也是整数秒，结束与那一拍会撞在一起，
    // “结束时有没有刷新”就看不出来；半秒错开后，漏掉刷新会让游法在最多半秒内仍是巡游的那份，第一次读到“已结束”时就能看出。
    assert.ok(Math.abs(run.last.swimPeriod - 2.4) < 0.01, `巡游一结束就换回平静阶段的游法（周期应为 2.4，实际 ${run.last.swimPeriod}）`);
    const spread = Math.max(...run.xs) - Math.min(...run.xs);
    assert.ok(spread >= 60, `巡游时水母应在横向游动（范围 ${spread.toFixed(0)} 点）`);
    assert.ok(run.ms > 4000 && run.ms < 8000, `巡游约 5.5 秒（实际 ${run.ms} ms）`);
    const endedAt = Date.now();
    const lastX = run.xs[run.xs.length - 1];
    await until(h, r => Math.abs(frameOf(r.countdownFrame).y - home.y) < 0.6, 6000, '结束后沉回泳线');
    const restFrame = (await h.request('ping')).countdownFrame; await delay(700);
    const stillFrame = (await h.request('ping')).countdownFrame;
    assert.equal(stillFrame, restFrame, '回到泳线后静止（窗口不再移动）');
    assert.ok(Math.abs(frameOf(stillFrame).x - lastX) < 90, `结束只是沉回泳线、不游回原位（结束时 x=${lastX.toFixed(0)}，静止后 x=${frameOf(stillFrame).x.toFixed(0)}，原位 x=${home.x.toFixed(0)}）`);
    reply = await until(h, r => r.patrolling === true, 7000, '隔一段等待后第二次出发');
    assert.equal(reply.patrolCount, 2);
    assert.ok(Date.now() - endedAt >= 3000, `两次巡游之间要重新等一段完整的时间（实际 ${Date.now() - endedAt} ms）`);
    assert.equal(reply.jellyAsleep, false);
  });

  // 巡游 × 物种（并入外观分支时加入）：巡游调校是按水母标定的，动物巡游时必须乘上自己的物种系数（Swift 的 JellyTuning.current），
  // 否则侧视动物会按水母的幅度上下摆动。读数是水母窗口此刻实际在用的游动调参（ping.jellyTuning）：巡游时 = 巡游调校 × 系数，
  // 巡游一结束换回的也是乘过系数的那份平静调参；愿意停留的高度（hover）不乘系数。11 点是“专注”（游速 1.0），所以巡游基准周期 1.4。
  // 系数表在 Swift 的 SwimProfile 里，appearance-smoke 的各物种场景核对的是同一套数字；基准值见 JellyTuning.patrol(pace: 1) 与 forStage(.calm)。
  const PATROL_BASE = { period: 1.4, thrustX: 62, thrustY: 41.06, sink: 18, dragX: 1.2, dragY: 1.4, hover: 16 };
  const CALM_BASE = { period: 2.4, thrustX: 40, thrustY: 62, sink: 18, dragX: 1.2, dragY: 1.4, hover: 12 };
  const tuningPairs = text => Object.fromEntries(String(text).split(' ').map(pair => pair.split('=')).map(([key, value]) => [key, Number(value)]));
  const expectTuning = (reading, base, k, label) => {
    const got = tuningPairs(reading);
    for (const field of ['period', 'thrustX', 'thrustY', 'sink', 'dragX', 'dragY']) {
      const want = base[field] * k[field];
      assert.ok(Math.abs(got[field] - want) <= 0.02 * Math.max(1, want), `${label}：${field} 应是 ${want.toFixed(3)}（基准 ${base[field]} × 系数 ${k[field]}），实际 ${got[field]}（读数 ${reading}）`);
    }
    assert.equal(got.hover, base.hover, `${label}：愿意停留的高度不乘系数（读数 ${reading}）`);
  };
  const animalLook = species => ({ color: 5, colors: [5], look: 'solid', material: 'glass', size: 'medium', season: null, species });
  for (const [species, k] of [
    ['hammer', { period: 1, thrustX: 0.8, thrustY: 0.55, sink: 0.6, dragX: 0.7, dragY: 1 }],
    ['manta', { period: 1.35, thrustX: 0.6, thrustY: 0.5, sink: 0.5, dragX: 0.5, dragY: 1 }],
    ['whaleshark', { period: 1, thrustX: 0.6, thrustY: 0.3, sink: 0.4, dragX: 0.65, dragY: 1 }],
    ['turtle', { period: 1.25, thrustX: 0.7, thrustY: 0.4, sink: 0.4, dragX: 0.7, dragY: 1 }],
  ]) {
    await patrolScenario(`巡游 × 物种：${species} 巡游时的游法是巡游调校乘它自己的系数，巡游结束换回的也是它自己的平静调参`, { TIMEKEEPER_PATROL_SECONDS: '1,5.5,600' }, async h => {
      let reply = await h.request('jelly', { jelly: lively({ appearance: animalLook(species) }) });
      assert.equal(reply.ok, true); assert.equal(reply.jellyLively, true);
      assert.equal(reply.appearance?.species, species, `组件确认画的是 ${species}`);
      reply = await h.request('ping');
      assert.equal(reply.jellySpecies, species);
      expectTuning(reply.jellyTuning, CALM_BASE, k, `${species}：出发前的平静调参`);
      reply = await until(h, r => r.patrolling === true, 6000, '约 1 秒后出发巡游');
      assert.equal(reply.jellySpecies, species, '巡游时仍是这只动物'); assert.equal(reply.personality, 'steady', '11 点是“专注”');
      expectTuning(reply.jellyTuning, PATROL_BASE, k, `${species}：巡游中的调参`);
      assert.ok(Math.abs(reply.swimPeriod - 1.4 * k.period) < 0.01, `${species}：巡游的脉动周期是 1.4 × ${k.period}（实际 ${reply.swimPeriod}）`);
      const run = await sampleUntilPatrolEnds(h);
      assert.equal(run.last.jellySpecies, species);
      expectTuning(run.last.jellyTuning, CALM_BASE, k, `${species}：巡游结束后换回的平静调参`);
      assert.ok(Math.max(...run.xs) - Math.min(...run.xs) >= 60, `${species}：巡游时窗口在横向游动`);
    });
  }
  await patrolScenario('巡游 × 物种：巡游中换物种，游动调参立刻换成新物种的巡游调参（不丢巡游、不留旧系数），换回水母恢复水母的巡游调参', { TIMEKEEPER_PATROL_SECONDS: '1,9,600' }, async h => {
    await h.request('jelly', { jelly: lively({ appearance: animalLook('turtle') }) });
    let reply = await until(h, r => r.patrolling === true, 6000, '约 1 秒后出发巡游');
    expectTuning(reply.jellyTuning, PATROL_BASE, { period: 1.25, thrustX: 0.7, thrustY: 0.4, sink: 0.4, dragX: 0.7, dragY: 1 }, '海龟巡游中');
    reply = await h.request('jelly', { jelly: lively({ appearance: animalLook('manta') }) });
    assert.equal(reply.appearance?.species, 'manta');
    reply = await h.request('ping');
    assert.equal(reply.patrolling, true, '换物种不打断巡游');
    expectTuning(reply.jellyTuning, PATROL_BASE, { period: 1.35, thrustX: 0.6, thrustY: 0.5, sink: 0.5, dragX: 0.5, dragY: 1 }, '巡游中换成蝠鲼');
    reply = await h.request('jelly', { jelly: lively({ appearance: animalLook('jelly') }) });
    reply = await h.request('ping');
    assert.equal(reply.patrolling, true, '换回水母也不打断巡游');
    expectTuning(reply.jellyTuning, PATROL_BASE, { period: 1, thrustX: 1, thrustY: 1, sink: 1, dragX: 1, dragY: 1 }, '巡游中换回水母');
  });

  // 时段性格：本地小时 → 性格与游速倍率。出发、时长、小动作的秒数被覆盖缩短了（真实取值路径由纯逻辑自测守住），这里核对控制器按“当地小时”选对了哪一档、
  // 并把这一档的游速交给水母（patrolPace 是最近一次巡游用的倍率，swimPeriod 是水母此刻实际在用的脉动周期，巡游时应为 1.4 / 游速）。
  for (const [hour, id, pace] of [['7', 'lively', 1.15], ['10', 'steady', 1.0], ['13', 'drowsy', 0.75], ['16', 'busy', 1.05], ['19', 'mellow', 0.85]]) {
    await patrolScenario(`时段性格：${hour} 点 → ${id}（游速 ${pace}）`, { TIMEKEEPER_NIGHT_HOUR: hour, TIMEKEEPER_PATROL_SECONDS: '0.5,3,600' }, async h => {
      assert.equal((await h.request('ping')).patrolPace, 0, '还没巡游过时游速为 0');
      await h.request('jelly', { jelly: lively() });
      const reply = await until(h, r => r.patrolling === true, 5000, '约 0.5 秒后出发');
      assert.equal(reply.personality, id, `${hour} 点的性格`);
      assert.equal(reply.patrolPace, pace, `${hour} 点（${id}）的游速倍率`);
      assert.ok(Math.abs(reply.swimPeriod - 1.4 / pace) < 0.005, `${hour} 点（${id}）：交到水母手里的游法周期应为 1.4 / ${pace}（实际 ${reply.swimPeriod}）`);
    });
  }

  // 睡觉规则：夜晚曲线 ≥ 0.5 睡（19:30–06:30），按小时对；荧光开关关闭也一样睡（睡觉是行为，不是视觉效果）
  for (const [hour, asleepExpected, label] of [['23', true, '23 点'], ['3', true, '凌晨 3 点'], ['6.4', true, '06:24（曲线仍大于 0.5）'], ['6.6', false, '06:36（已起床）'], ['19.4', false, '19:24（还没睡）'], ['19.6', true, '19:36（已睡下）'], ['12', false, '中午']]) {
    await patrolScenario(`睡觉规则：${label} → ${asleepExpected ? '睡着、不巡游、没有小动作' : '清醒、会巡游'}`, { TIMEKEEPER_NIGHT_HOUR: hour, TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
      await h.request('jelly', { jelly: lively() });
      await delay(2800);
      const reply = await h.request('ping');
      assert.equal(reply.jellyAsleep, asleepExpected, `${label}：asleep 应为 ${asleepExpected}`);
      if (asleepExpected) { assert.equal(reply.patrolCount, 0); assert.equal(reply.fidgetCount, 0); }
      else assert.ok(reply.patrolCount >= 1, `${label}：清醒的水母应该出发过（巡游 ${reply.patrolCount} 次）`);
    });
  }
  await patrolScenario('关掉“夜晚荧光”不影响夜里睡觉（睡觉是行为，荧光是视觉效果）', { TIMEKEEPER_NIGHT_HOUR: '23' }, async h => {
    await h.request('jelly', { jelly: lively({ night: false }) });
    await delay(600);
    const reply = await h.request('ping');
    assert.equal(reply.jellyAsleep, true); assert.equal(reply.countdownNight, 0, '荧光确实关了'); assert.equal(reply.jellyNight, false);
  });

  // 空闲：presence 在 300 秒起为 away（不巡游、仍清醒），睡觉要 600 秒
  for (const [idle, asleepExpected, patrolExpected] of [['5', false, true], ['299.9', false, true], ['300', false, false], ['400', false, false], ['599.9', false, false], ['600', true, false], ['700', true, false]]) {
    await patrolScenario(`空闲 ${idle} 秒 → ${asleepExpected ? '睡着' : '清醒'}、${patrolExpected ? '会巡游' : '不巡游也没有小动作'}`, { TIMEKEEPER_IDLE_SECONDS: idle, TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
      await h.request('jelly', { jelly: lively() });
      await delay(2800);
      const reply = await h.request('ping');
      assert.equal(reply.jellyAsleep, asleepExpected, `空闲 ${idle} 秒：asleep 应为 ${asleepExpected}`);
      if (patrolExpected) assert.ok(reply.patrolCount >= 1, `空闲 ${idle} 秒应巡游过（${reply.patrolCount} 次）`);
      else { assert.equal(reply.patrolCount, 0); assert.equal(reply.fidgetCount, 0); assert.equal(reply.patrolling, false); }
    });
  }

  await patrolScenario('减少动态效果：清醒，但不巡游也没有小动作', { TIMEKEEPER_REDUCE_MOTION: '1', TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
    await h.request('jelly', { jelly: lively() });
    await delay(2800);
    const reply = await h.request('ping');
    assert.equal(reply.countdownReduceMotion, true);
    assert.equal(reply.jellyAsleep, false, '清醒不是“动”，减少动态效果不让水母睡着'); assert.equal(reply.patrolCount, 0); assert.equal(reply.fidgetCount, 0);
  });

  await patrolScenario('只在常驻时有活动行为：不常驻只靠倒计时临时出现时仍是老样子', { TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
    await h.request('jelly', { jelly: lively({ resident: false }) });
    const reply = await h.request('countdown', { timer: timer() });
    assert.equal(reply.jellyVisible, true);
    await delay(2500);
    const after = await h.request('ping');
    assert.equal(after.jellyAsleep, true, '临时出现的水母休息就睡'); assert.equal(after.patrolCount, 0); assert.equal(after.fidgetCount, 0);
  });

  await patrolScenario('巡游中来差事气泡：立刻结束巡游；气泡收起后重新等一段再出发', { TIMEKEEPER_PATROL_SECONDS: '1,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    await until(h, r => r.patrolling === true, 4000, '出发');
    let reply = await h.request('nudge', { nudge: errand() });
    assert.equal(reply.ok, true);
    assert.equal(reply.patrolling, false, '差事气泡一到，巡游立刻结束');
    await delay(2500);
    reply = await h.request('ping');
    assert.equal(reply.patrolling, false, '气泡显示期间不出发'); assert.equal(reply.patrolCount, 1);
    await h.request('nudgeClear', { id: 'jelly-errand-brief-1' });
    reply = await until(h, r => r.patrolling === true && r.patrolCount === 2, 6000, '气泡收起后重新等待并再次巡游');
    assert.equal(reply.jellyBubble, 'none');
  });

  // 出发前被打断：旧的出发计时器要作废，条件恢复后重新等一段完整的时间（“回到电脑前不会立刻被拉去游”）。
  // 时间线（出发等待 6 秒）：0 秒装上计时器 → 约 1 秒气泡到（没有资格，计时器应被取消）→ 约 4 秒气泡收起（重新装 6 秒的计时器，约 10 秒到点）；
  // 旧计时器若没被取消，会在约 6 秒（气泡收起后 2 秒）到点并出发；所以在“收起后 4 秒”必须还没出发，随后才在满 6 秒时出发。
  await patrolScenario('出发前被打断：旧的出发计时器作废，气泡收起后重新等一段完整的时间才出发', { TIMEKEEPER_PATROL_SECONDS: '6,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    await delay(1000);
    assert.equal((await h.request('nudge', { nudge: errand() })).ok, true);
    await delay(3000);
    let reply = await h.request('ping');
    assert.equal(reply.patrolCount, 0, '气泡显示期间不出发');
    const clearedAt = Date.now();
    await h.request('nudgeClear', { id: 'jelly-errand-brief-1' });
    await delay(4000);
    reply = await h.request('ping');
    assert.equal(reply.patrolCount, 0, `旧的出发计时器应已作废：气泡收起后 ${Date.now() - clearedAt} ms 还不该出发`);
    reply = await until(h, r => r.patrolling === true, 5000, '气泡收起满一个完整的等待（6 秒）后出发');
    assert.ok(Date.now() - clearedAt >= 5400, `要重新等满 6 秒才出发（实际 ${Date.now() - clearedAt} ms）`);
  });

  await patrolScenario('巡游中响铃：立刻结束巡游，响铃期间不出发', { TIMEKEEPER_PATROL_SECONDS: '1,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    await until(h, r => r.patrolling === true, 4000, '出发');
    let reply = await h.request('show', ring());
    assert.equal(reply.ok, true);
    assert.equal(reply.patrolling, false, '响铃一到，巡游立刻结束');
    await until(h, r => r.ringPhase === 'shown', 4000, '水母游到落点并弹出气泡');
    await delay(2500);
    reply = await h.request('ping');
    assert.equal(reply.patrolling, false); assert.equal(reply.patrolCount, 1, '响铃期间不出发');
    await h.request('hide', { sessionId: 'ring-1' });
    await until(h, r => r.ringId === null && r.patrolling === true && r.patrolCount === 2, 9000, '响铃收尾后重新等待并再次巡游');
  });

  await patrolScenario('倒计时进入临近阶段（≤10 分钟）不巡游；平静阶段（时钟读数气泡在）照常巡游', { TIMEKEEPER_PATROL_SECONDS: '0.5,3,600' }, async h => {
    await h.request('countdown', { timer: timer({ fireAt: Date.now() + 5 * 60000 }) });
    await h.request('jelly', { jelly: lively() });
    await delay(2500);
    let reply = await h.request('ping');
    assert.equal(reply.countdownStage, 1, '5 分钟是“临近”阶段'); assert.equal(reply.patrolCount, 0, '临近阶段水母自己在游，不另外巡游');
    await h.request('countdown', { timer: timer({ fireAt: Date.now() + 40 * 60000 }) });
    reply = await until(h, r => r.patrolling === true, 4000, '回到平静阶段后出发');
    assert.equal(reply.jellyBubble, 'clock', '时钟读数气泡不算“忙”，巡游时它跟着水母');
  });

  await patrolScenario('右键菜单打开期间不出发、巡游中打开立刻结束；菜单关闭后重新等待再出发', { TIMEKEEPER_PATROL_SECONDS: '1,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    assert.equal((await h.request('menuTracking', { open: true })).ok, true);
    await delay(2500);
    let reply = await h.request('ping');
    assert.equal(reply.patrolCount, 0, '菜单开着：不出发');
    await h.request('menuTracking', { open: false });
    await until(h, r => r.patrolling === true, 4000, '菜单关闭后出发');
    reply = await h.request('menuTracking', { open: true });
    assert.equal(reply.patrolling, false, '巡游中打开菜单：立刻结束');
    await delay(2200);
    assert.equal((await h.request('ping')).patrolCount, 1);
    await h.request('menuTracking', { open: false });
    await until(h, r => r.patrolling === true && r.patrolCount === 2, 4000, '菜单关闭后重新等待并再次出发');
  });

  await patrolScenario('差事菜单请求在等回执（反馈气泡）时不出发；回执失败显示完、气泡收起后才重新等待再出发', { TIMEKEEPER_PATROL_SECONDS: '1,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    assert.equal((await h.request('menuItem', { title: '来首歌' })).ok, true, '菜单项点中了');
    const asked = await h.waitEvent('errandRequest', 1500);
    await delay(2500);                  // 越过 1 秒的出发时间：这时“正在准备”的反馈气泡还在等 Chrome 的回执
    let reply = await h.request('ping');
    assert.equal(reply.errandRequestBusy, true, '请求还在等回执');
    assert.equal(reply.feedback, '稍等，水母在准备…');
    assert.equal(reply.patrolCount, 0, '反馈气泡在：不出发');
    reply = await h.request('errandRequestResult', { errandId: asked.errandId, ok: false, error: '水母差事没有开启' });
    reply = await until(h, r => r.errandRequestBusy === false && r.feedback === '水母差事没有开启', 3000, '回执失败：原生显示原因');
    assert.equal(reply.patrolCount, 0, '原因气泡显示期间仍不出发');
    await until(h, r => r.feedback === '' && r.jellyBubble !== 'note', 8000, '失败原因的气泡 5 秒后消失');
    await until(h, r => r.patrolling === true, 5000, '气泡消失后重新等待并出发');
  });

  await patrolScenario('巡游中关掉活动行为 / 取消常驻：立刻结束，之后不再出发；重新打开后重新计时', { TIMEKEEPER_PATROL_SECONDS: '1,30,600' }, async h => {
    await h.request('jelly', { jelly: lively() });
    await until(h, r => r.patrolling === true, 4000, '出发');
    let reply = await h.request('jelly', { jelly: jelly({ errands: { enabled: true, patrol: false } }) });
    assert.equal(reply.patrolling, false); assert.equal(reply.jellyLively, false);
    await delay(2500);
    reply = await h.request('ping');
    assert.equal(reply.patrolCount, 1, '关掉后不再出发'); assert.equal(reply.jellyAsleep, true, '关掉活动行为：休息就睡');
    await h.request('jelly', { jelly: lively() });
    reply = await h.request('ping');
    assert.equal(reply.patrolling, false, '重新打开不立刻出发，先等一段');
    reply = await until(h, r => r.patrolling === true && r.patrolCount === 2, 4000, '重新打开后出发');
    reply = await h.request('jelly', { jelly: lively({ resident: false }) });
    assert.equal(reply.patrolling, false); assert.equal(reply.jellyVisible, false, '取消常驻：水母退场');
    await delay(2200);
    assert.equal((await h.request('ping')).patrolCount, 2, '退场后没有遗留的计时器');
  });

  // 一次小跳从起跳到落回约 2.4 秒（初速 70、休息时的下沉 40、阻尼 1.4；selftest 另有“落回泳线”的物理断言），所以间隔取 3.5 秒；
  // 间隔短于落地时间就会在空中被接连戳起，永远落不回泳线——那是测试参数不合理，不是产品行为（真实间隔 ≥ 15 秒）
  await patrolScenario('小动作：清醒静止时隔一阵原地小跳一下（窗口纵向起伏、回落后静止）；有气泡时没有', { TIMEKEEPER_PATROL_SECONDS: '600,30,3.5' }, async h => {
    await h.request('jelly', { jelly: lively() });
    const base = frameOf((await h.request('ping')).countdownFrame).y;
    let peak = 0, reply; const started = Date.now();
    while (Date.now() - started < 6000 && !(peak > 5)) { reply = await h.request('ping'); peak = Math.max(peak, frameOf(reply.countdownFrame).y - base); await delay(40); }
    assert.ok(reply.fidgetCount >= 1, `应做过小动作（${reply.fidgetCount} 次）`);
    assert.ok(peak > 5, `小动作的起伏要看得出来（最高 ${peak.toFixed(1)} 点）`);
    assert.equal(reply.patrolCount, 0);
    await until(h, r => Math.abs(frameOf(r.countdownFrame).y - base) < 0.6, 3300, '回落到泳线（下一次小跳要再过约 2 秒才来）');
    // 有差事气泡时没有小动作
    await h.request('nudge', { nudge: errand() });
    await delay(1200);
    const before = (await h.request('ping')).fidgetCount;
    await delay(3500);
    assert.equal((await h.request('ping')).fidgetCount, before, '气泡显示期间没有小动作');
  });

  await patrolScenario('钩子关闭（没有 TIMEKEEPER_TEST_HOOKS）时计时覆盖与菜单钩子无效', { TIMEKEEPER_TEST_HOOKS: '0', TIMEKEEPER_PATROL_SECONDS: '0.5,3,0.5' }, async h => {
    let reply = await h.request('jelly', { jelly: lively() });
    assert.equal(reply.jellyLively, true, '活动行为本身不依赖测试钩子');
    await delay(9000);          // 比“分钟当成秒”的错误（3–8 秒）更长，那种错误才抓得住
    reply = await h.request('ping');
    assert.equal(reply.patrolCount, 0, '真实的出发间隔是 3–8 分钟，注入的 0.5 秒无效'); assert.equal(reply.fidgetCount, 0, '真实的小动作间隔至少 15 秒');
    assert.equal((await h.request('menuTracking', { open: true })).ok, false, '菜单钩子在正式使用时无效');
  });

  // 真实鼠标场景的外壳：要移动真实鼠标，先等用户安静；失败时若发现真实用户输入（比我们最后一次合成输入更晚），多半是被打断而不是真失败：
  // 礼让后重跑，多次被打断以 75 结束（外层稍后重试）。每次结束（无论成败）把指针停到离水母很远的地方：残留的指针位置压在下一个场景的水母身上，
  // 会让“等巡游 / 小动作出发”的场景超时（变异检查里出现过一批这样的假“抓到”）。
  const parkPointer = () => {
    try {
      const [x, y, w, hgt] = execFileSync(helper, ['screens'], { encoding: 'utf8' }).trim().split('\n')[0].split(' ').map(Number);
      mouse('move', x + w * 0.3, y + hgt * 0.6);
    } catch { /* 停不到也不影响结果判定 */ }
  };
  const mouseScenario = async (name, env, body) => {
    for (let attempt = 1; !scenarioFilter || scenarioFilter.test(name); attempt++) {
      await quiet.waitIfActive();
      try {
        await patrolScenario(name, env, body);
        break;
      } catch (error) {
        const reason = quiet.intrusion();
        if (!reason) throw error;
        console.log(`  （${reason}；本场景重跑，第 ${attempt} 次）`);
        if (attempt >= 3) { console.log('多次被用户的真实输入打断，不当作验收失败，稍后重试'); process.exit(EXIT_USER_ACTIVE); }
      } finally { parkPointer(); }
    }
  };
  if (withMouse) {
    // 首次出发定在 5 秒后：水母刚出现时窗口还在入场（第一次读到的窗口位置不是站定后的位置，按它放鼠标会放偏），要等它站稳再放鼠标
    await mouseScenario('真实鼠标：停在水母身上时不出发，移开后才出发；巡游中鼠标停到身上（靠每秒刷新）或被抓住都立刻结束、放手后重新等待再出发', { TIMEKEEPER_PATROL_SECONDS: '5,30,600' }, async h => {
      await h.request('jelly', { jelly: lively() });
      let f = frameOf((await h.request('ping')).countdownFrame);
      for (let i = 0, stable = 0; i < 16 && stable < 3; i++) {
        await delay(250);
        const g = frameOf((await h.request('ping')).countdownFrame);
        stable = Math.abs(g.x - f.x) < 0.5 && Math.abs(g.y - f.y) < 0.5 ? stable + 1 : 0;
        f = g;
      }
      let reply = await h.request('ping');
      assert.equal(reply.patrolCount, 0, '站稳时还没到出发时间');
      mouse('move', f.x + f.w / 2, f.y + 77); await delay(400);
      await delay(5200);                  // 越过 5 秒的出发时间：那一刻鼠标停在水母身上，出发被挡住
      reply = await h.request('ping');
      assert.equal(reply.patrolCount, 0, `鼠标停在水母身上：不出发（原生看到的鼠标 ${reply.mouse}，窗口 ${reply.countdownFrame}）`);
      mouse('move', f.x + f.w / 2, f.y + 600); await delay(300);
      // 鼠标移开没有事件：最多 3 秒后的再核对才发现可以出发，再重新等一段完整的 5 秒（实测约 9 秒），所以窗口给 12 秒
      reply = await until(h, r => r.patrolling === true, 12000, '鼠标移开后出发（最多 3 秒再核对 + 重新等 5 秒）');
      assert.equal(reply.patrolCount, 1);
      // 巡游中把鼠标放到水母身上（不按键）：没有任何事件通知“鼠标来了”，只有巡游期间每秒一次的刷新会发现并结束巡游。
      // 水母在游，窗口可能漂出“身体”范围，所以最多重新瞄准 4 次（每次等 1.7 秒，够一次每秒刷新）。
      for (let aim = 0; aim < 4 && reply.patrolling; aim++) {
        const swimming = frameOf(reply.countdownFrame);
        mouse('move', swimming.x + swimming.w / 2, swimming.y + 77);
        await delay(1700);
        reply = await h.request('ping');
      }
      assert.equal(reply.patrolling, false, `巡游中鼠标停到水母身上：下一次每秒刷新就结束巡游（原生看到的鼠标 ${reply.mouse}，窗口 ${reply.countdownFrame}）`);
      assert.equal(reply.patrolCount, 1);
      mouse('move', f.x + f.w / 2, f.y + 600); await delay(300);
      reply = await until(h, r => r.patrolling === true && r.patrolCount === 2, 14000, '鼠标移开后再次出发（最多 3 秒再核对 + 重新等 5 秒）');
      // 巡游中抓住它：从窗口身体位置拖一小段
      const now = frameOf(reply.countdownFrame);
      mouse('drag', now.x + now.w / 2, now.y + 77, now.x + now.w / 2 - 70, now.y + 140, 16);
      reply = await h.request('ping');
      assert.equal(reply.patrolling, false, '被抓住：巡游立刻结束');
      mouse('move', f.x + f.w / 2, f.y + 700); await delay(300);
      reply = await until(h, r => r.patrolling === true && r.patrolCount === 3, 14000, '放手并移开鼠标后重新等待再出发');
    });

    // 小动作与巡游一样要看鼠标：鼠标停到水母身上没有任何事件通知，旧的小动作计时器还在，到点时必须再核对资格，否则水母会在鼠标底下突然跳走。
    // 小动作间隔 6 秒（比站稳需要的时间长，鼠标一定先到）；跳一次约 2.4 秒。
    await mouseScenario('真实鼠标：停在水母身上时没有小动作，移开后才继续', { TIMEKEEPER_PATROL_SECONDS: '600,30,6' }, async h => {
      await h.request('jelly', { jelly: lively() });
      let f = frameOf((await h.request('ping')).countdownFrame);
      for (let i = 0, stable = 0; i < 16 && stable < 3; i++) {
        await delay(250);
        const g = frameOf((await h.request('ping')).countdownFrame);
        stable = Math.abs(g.x - f.x) < 0.5 && Math.abs(g.y - f.y) < 0.5 ? stable + 1 : 0;
        f = g;
      }
      assert.equal((await h.request('ping')).fidgetCount, 0, '站稳时还没到小动作的时间');
      mouse('move', f.x + f.w / 2, f.y + 77); await delay(400);
      await delay(9000);                  // 越过 6 秒的到点时刻：那一刻鼠标停在水母身上，小动作被挡住
      let reply = await h.request('ping');
      assert.equal(reply.fidgetCount, 0, `鼠标停在水母身上：没有小动作（原生看到的鼠标 ${reply.mouse}，窗口 ${reply.countdownFrame}）`);
      mouse('move', f.x + f.w / 2, f.y + 600); await delay(300);
      reply = await until(h, r => r.fidgetCount >= 1, 14000, '鼠标移开后继续小动作（最多 3 秒再核对 + 重新等 6 秒）');
    });
  } else console.log('  - 跳过真实鼠标场景（--no-mouse）');

  // 隔离环境下的 CPU 实测（只是记录，不是性能保证）：睡着 / 清醒静止 / 巡游中，各取 top 的区间平均
  {
    const rows = [];
    for (const [label, env, setup] of [
      ['睡着（夜里）', { TIMEKEEPER_NIGHT_HOUR: '23', TIMEKEEPER_PATROL_SECONDS: '600,30,600' }, null],
      ['清醒静止（白天，没有巡游与小动作）', { TIMEKEEPER_PATROL_SECONDS: '600,30,600' }, null],
      ['巡游中', { TIMEKEEPER_PATROL_SECONDS: '1,60,600' }, r => r.patrolling === true],
      ['小动作（每 3.5 秒跳一次，比真实的 15–90 秒频繁得多，只是上限估计）', { TIMEKEEPER_PATROL_SECONDS: '600,30,3.5' }, r => r.fidgetCount >= 2],
    ]) {
      if (scenarioFilter && !scenarioFilter.test('CPU')) break;
      const h = start({ ...DAY, ...env });
      try {
        await h.request('jelly', { jelly: lively() });
        if (setup) await until(h, setup, 12000, label);
        await delay(800);
        const cpu = cpuPercent(h.child.pid);
        const reply = await h.request('ping');
        rows.push({ label, cpu, asleep: reply.jellyAsleep, patrolling: reply.patrolling, animating: reply.patrolling || reply.fidgetCount > 0 });
        console.log(`  CPU ${label}：${cpu === null ? '读取失败' : cpu.toFixed(1) + '%'}（asleep=${reply.jellyAsleep}, patrolling=${reply.patrolling}）`);
      } finally { await h.stop(); }
    }
    for (const row of rows) if (row.cpu !== null) {
      const limit = row.animating ? 30 : 3;
      assert.ok(row.cpu < limit, `${row.label}：CPU ${row.cpu.toFixed(1)}% 超过记录上限 ${limit}%（这是异常，不是性能保证）`);
    }
  }
  console.log('PASS 阶段 A：活动行为（睡觉规则、巡游、小动作、让路与打断）');
}
if (only === 'patrol') { console.log('PASS: jelly 活动行为阶段'); process.exit(0); }

// ---------- 阶段 1：协议、常驻与临时出现、记录文字、倒计时委托、菜单、阶段 ----------
host = start();
try {
  let reply = await host.request('jelly', { jelly: jelly() });
  assert.equal(reply.ok, true); assert.equal(reply.version, 10); assert.equal(reply.focusStayed, true, '水母出现不抢焦点');
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
console.log('PASS: jelly（协议 v10）全部阶段');
