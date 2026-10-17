// 隔离冒烟：外观下发、回执探测、阶段覆盖、读取失败时保持上一次。不连接 Chrome，不读写闹钟，不操作键鼠，只用 ping 读数。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-smoke.mjs --app=/tmp/tk/QA.app
// ping 里的 jellyLook / jellyPaintA / jellyTint 是只作验收诊断的字段（jellyAppearance 是系统浅/深外观，别混）；
// 每次读数都核对 jellyTint === jellyPaintA（JellyPose 的约定：光晕、涟漪、睡觉标记与气泡边框用的 tint 始终等于颜料主色）。
// 大部分场景强制“减少动态效果”（颜色一步到位，读数稳定）；两个 motion 场景不强制，核对“平静期换色立即生效”和“阶段色是渐变过去的”，
// 系统本身开着“减少动态效果”时这两个场景明确跳过（不算通过）。
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const app = process.argv.find(a => a.startsWith('--app='))?.slice(6);
if (!app) throw new Error('需要 --app=隔离构建');
const id = 'a'.repeat(32);

function start(env = {}) {
  const child = spawn(resolve(app, 'Contents/MacOS/TimeKeeperDesktop'), [`chrome-extension://${id}/`], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, TIMEKEEPER_TEST_HOOKS: '1', TIMEKEEPER_REDUCE_MOTION: '1', TIMEKEEPER_NIGHT_HOUR: '12', ...env } });
  const host = { pending: new Map(), seq: 0, buffer: Buffer.alloc(0) };
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
  host.stop = async () => { await host.request('countdown', { timer: null }).catch(() => {}); await host.request('jelly', { jelly: { resident: false } }).catch(() => {}); child.stdin.end(); await delay(300); child.kill(); };
  return host;
}
const scenario = async (name, body) => { const h = start(); try { await body(h); console.log(`  ✓ ${name}`); } finally { await h.stop(); } };
// 不强制减少动态效果；系统自己开着时无法验证，如实跳过（返回 false），不当作通过。
let skipped = 0;
const motionScenario = async (name, body) => {
  const h = start({ TIMEKEEPER_REDUCE_MOTION: '0' });
  try {
    if ((await h.request('ping')).countdownReduceMotion) { skipped++; console.log(`  – 跳过（系统开着“减少动态效果”，无法验证动画）：${name}`); return; }
    await body(h); console.log(`  ✓ ${name}`);
  } finally { await h.stop(); }
};
// 每次读数都核对 tint 与颜料主色一致（同一格式字符串，逐字相等）
const pinged = async h => { const ping = await h.request('ping'); assert.equal(ping.jellyTint, ping.jellyPaintA, `tint 应始终等于 paint.a：tint=${ping.jellyTint} paint.a=${ping.jellyPaintA}`); return ping; };
const jelly = (extra = {}) => ({ resident: true, night: false, lines: [], linesUntil: 0, ...extra });
const appearance = (extra = {}) => ({ color: 5, colors: [5], look: 'solid', material: 'glass', size: 'medium', season: null, ...extra });
const rgb = text => text.split(',').map(Number);
const near = (a, b, eps = 0.0015) => a.every((v, i) => Math.abs(v - b[i]) <= eps);
const CALM = [0.40, 0.74, 0.90];
const PURPLE = [0.66, 0.50, 0.95];

await scenario('没有 appearance：回执不带 appearance（旧 Chrome），默认外观，协议版本仍是 7', async h => {
  const reply = await h.request('jelly', { jelly: jelly() });
  assert.equal(reply.ok, true); assert.equal('appearance' in reply, false);
  assert.equal(reply.version, 7, '协议版本不变');
  const ping = await pinged(h);
  assert.equal(ping.jellyLook, 'colors=5 look=solid material=glass size=medium season=-');
  assert.ok(near(rgb(ping.jellyPaintA), CALM), `默认应是平静色，实际 ${ping.jellyPaintA}`);
});

await scenario('带 appearance：回执 appearance.status=ok，calm 阶段颜色立即到位（不等慢速收敛）', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  assert.deepEqual(reply.appearance, { status: 'ok' });
  const ping = await pinged(h);
  assert.equal(ping.jellyLook, 'colors=6 look=solid material=glass size=medium season=-');
  assert.ok(near(rgb(ping.jellyPaintA), PURPLE), `应换成紫色，实际 ${ping.jellyPaintA}`);
});

await scenario('显式下发默认外观：与不下发完全相同（平静色）', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance() }) });
  assert.ok(near(rgb((await pinged(h)).jellyPaintA), CALM));
});

await scenario('非法 appearance：回执仍是 ok，但解析回默认，水母不消失', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ appearance: { colors: [99], look: 'x', material: 'metal', size: 'xl', season: 'easter' } }) });
  assert.equal(reply.ok, true);
  const ping = await pinged(h);
  assert.equal(ping.jellyLook, 'colors=5 look=solid material=glass size=medium season=-');
  assert.equal(ping.jellyVisible, true);
});

await scenario('appearance 不是字典：同样回默认，水母不消失', async h => {
  for (const bad of ['x', 7, null, [1, 2], true]) {
    const reply = await h.request('jelly', { jelly: jelly({ appearance: bad }) });
    assert.equal(reply.ok, true, JSON.stringify(bad));
    assert.equal((await pinged(h)).jellyLook, 'colors=5 look=solid material=glass size=medium season=-', JSON.stringify(bad));
  }
  assert.equal((await pinged(h)).jellyVisible, true);
});

await scenario('后一次下发没带 appearance：保持上一次（Chrome 读取外观失败时不闪回默认）', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  const reply = await h.request('jelly', { jelly: jelly() });
  assert.equal('appearance' in reply, false);
  const ping = await pinged(h);
  assert.equal(ping.jellyLook, 'colors=6 look=solid material=glass size=medium season=-');
  assert.ok(near(rgb(ping.jellyPaintA), PURPLE));
});

await scenario('多色花纹：三个色位都被接受并回显', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 1, colors: [1, 3, 5], look: 'rainbow' }) }) });
  assert.equal((await pinged(h)).jellyLook, 'colors=1,3,5 look=rainbow material=glass size=medium season=-');
});

await scenario('阶段覆盖：倒计时进入临近阶段后整只变成阶段色，结束后回到自选色', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  assert.ok(near(rgb((await pinged(h)).jellyPaintA), PURPLE));
  const fireAt = Date.now() + 25000;
  const reply = await h.request('countdown', { timer: { id: 'smoke', title: '外观冒烟', count: 1, alarmId: 'a', revision: 3, canAct: true, fireAt, items: [{ id: 'smoke', alarmId: 'a', title: '外观冒烟', fireAt }] } });
  assert.equal(reply.ok, true);
  await delay(1800);
  const during = await pinged(h);
  assert.equal(during.countdownStage, 2, `应进入临近阶段（imminent=2），实际 ${during.countdownStage}`);
  assert.ok(!near(rgb(during.jellyPaintA), PURPLE, 0.05), `临近阶段应覆盖自选色，实际仍是 ${during.jellyPaintA}`);
  assert.equal(during.jellyLook, 'colors=6 look=solid material=glass size=medium season=-', '外观本身没丢，只是颜色被阶段覆盖');
  await h.request('countdown', { timer: null });
  await delay(1800);
  assert.ok(near(rgb((await pinged(h)).jellyPaintA), PURPLE, 0.02), '倒计时结束后回到自选色');
});

await scenario('阶段内换色：外观记下来，回到 calm 时生效，不闪', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  const fireAt = Date.now() + 25000;
  await h.request('countdown', { timer: { id: 'smoke', title: '外观冒烟', count: 1, alarmId: 'a', revision: 3, canAct: true, fireAt, items: [{ id: 'smoke', alarmId: 'a', title: '外观冒烟', fireAt }] } });
  await delay(1800);
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 3, colors: [3] }) }) });
  const during = await pinged(h);
  assert.equal(during.jellyLook, 'colors=3 look=solid material=glass size=medium season=-');
  assert.ok(!near(rgb(during.jellyPaintA), [0.42, 0.82, 0.48], 0.05), '阶段内换色不应立刻变成新颜色（仍由阶段覆盖）');
  await h.request('countdown', { timer: null });
  await delay(1800);
  assert.ok(near(rgb((await pinged(h)).jellyPaintA), [0.42, 0.82, 0.48], 0.02), '回到 calm 后是新选的绿色');
});

await motionScenario('开着动态效果：平静期换色立即到位（回执后的第一次读数就是新颜色，不是慢慢变过去）', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  assert.deepEqual(reply.appearance, { status: 'ok' });
  const ping = await pinged(h);
  assert.ok(near(rgb(ping.jellyPaintA), PURPLE), `平静期换色应立即到位，实际 ${ping.jellyPaintA}`);
});

await motionScenario('开着动态效果：阶段色是渐变过去的（刚进入临近阶段的读数还没到阶段色），之后收敛', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ color: 6, colors: [6] }) }) });
  const fireAt = Date.now() + 25000;
  await h.request('countdown', { timer: { id: 'smoke', title: '外观冒烟', count: 1, alarmId: 'a', revision: 3, canAct: true, fireAt, items: [{ id: 'smoke', alarmId: 'a', title: '外观冒烟', fireAt }] } });
  const first = rgb((await pinged(h)).jellyPaintA);
  await delay(3500);
  const settled = await pinged(h);
  assert.equal(settled.countdownStage, 2, `应进入临近阶段（imminent=2），实际 ${settled.countdownStage}`);
  const target = rgb(settled.jellyPaintA);
  assert.ok(!near(target, PURPLE, 0.05), `阶段色应不同于自选色，实际 ${settled.jellyPaintA}`);
  // 极小的容差：读数晚到一点也不会误判（每步走 12%，约 1 秒内都离阶段色大于 0.004）；一步到位的实现读数恰等于阶段色
  assert.ok(!near(first, target, 0.004), `阶段色应渐变过去，刚进入时的读数 ${first} 已经等于阶段色 ${target}`);
});

if (skipped) console.log(`外观冒烟通过（${skipped} 个动画场景因系统“减少动态效果”跳过，未验证）`);
else console.log('外观冒烟全部通过');
