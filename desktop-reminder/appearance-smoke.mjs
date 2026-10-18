// 隔离冒烟：外观下发、回执探测、阶段覆盖、读取失败时保持上一次。不连接 Chrome，不读写闹钟，不操作键鼠，只用 ping 读数。
//   node desktop-reminder/build.mjs --extension-id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa --app=/tmp/tk/QA.app
//   node desktop-reminder/appearance-smoke.mjs --app=/tmp/tk/QA.app
// ping 里的 jellyLook / jellyPaintA / jellyTint 是只作验收诊断的字段（jellyAppearance 是系统浅/深外观，别混）；
// 每次读数都核对 jellyTint === jellyPaintA（JellyPose 的约定：光晕、涟漪、睡觉标记与气泡边框用的 tint 始终等于颜料主色）。
// 大部分场景强制“减少动态效果”（颜色一步到位，读数稳定）；motion 场景不强制，核对“平静期换色立即生效”“阶段色是渐变过去的”、
// “动物自由游动时朝向/俯仰/划水跟随速度”、“没常驻时入场向左、游走向右两段冲刺的朝向”、“换物种时姿态从头来”和“响铃时鳍（翼）摆动、结束后停稳回中位”
// （最后一个对小锤头鲨、蝠鲼、海龟与鲸鲨各跑一次），系统本身开着“减少动态效果”或屏幕在休眠（ping 的 displaysActive 为 0）时这几个场景明确跳过（不算通过）。
// 物种场景（名称以“物种：”开头）覆盖协议 v7 的 appearance.species：回执只报告实际生效的物种、画不出来的退回水母、姿态读数 jellyPose、
// 窗口标题与读屏名称 jellyTitle / jellyLabel、运行中的游动调参 jellyTuning（这三项与 jellyPose 一样只作验收诊断）。
// 只跑一部分：--only=名称里的一段文字（例如 --only=物种：）。
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// 可画出来的物种：JS 形状数据与原生几何数据一致（test/desktop-companion-logic.test.mjs 对照），所以以它为准，新增动物时本脚本不用改
const SHAPES = createRequire(import.meta.url)('../js/jelly-species-shapes.js');
const SPECIES_NAMES = createRequire(import.meta.url)('../js/jelly-appearance.js').SPECIES_NAMES;   // 与原生 displayName 逐项一致（test/desktop-companion-logic.test.mjs 对照）
const ANIMALS = ['hammer', 'manta', 'turtle', 'whaleshark'];

const app = process.argv.find(a => a.startsWith('--app='))?.slice(6);
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7);
const selected = name => !only || name.includes(only);
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
const scenario = async (name, body) => { if (!selected(name)) return; const h = start(); try { await body(h); console.log(`  ✓ ${name}`); } finally { await h.stop(); } };
// 不强制减少动态效果；系统自己开着时无法验证，如实跳过（返回 false），不当作通过。
// 屏幕在休眠（没有活动显示器）时同样跳过：Core Animation 的完成回调不触发，响铃退场的淡出隐藏会停在半途，
// 不是被测代码的问题（2026-10-18 夜里实测：显示器休眠时“响铃结束后动物游走并消失”稳定超时，亮屏后通过）。
let skipped = 0;
const skipReasons = new Set();
const motionScenario = async (name, body) => {
  if (!selected(name)) return;
  const h = start({ TIMEKEEPER_REDUCE_MOTION: '0' });
  try {
    const first = await h.request('ping');
    const reason = first.countdownReduceMotion ? '系统开着“减少动态效果”' : first.displaysActive === 0 ? '没有活动显示器，屏幕在休眠' : null;
    if (reason) { skipped++; skipReasons.add(reason); console.log(`  – 跳过（${reason}，无法验证动画）：${name}`); return; }
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
  assert.deepEqual(reply.appearance, { status: 'ok', species: 'jelly' });
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
  assert.deepEqual(reply.appearance, { status: 'ok', species: 'jelly' });
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

// ---------- 物种（动物）：回执只报告实际生效的物种；画不出来的一律退回水母；颜色花纹照常；姿态读数 ----------

const until = async (h, test, ms, what) => {
  const end = Date.now() + ms;
  let last;
  do { last = await h.request('ping'); if (test(last)) return last; await delay(100); } while (Date.now() < end);
  throw new Error(`等待超时：${what}（最后读数 ${JSON.stringify({ visible: last.jellyVisible, species: last.jellySpecies, ring: last.ringPhase, pose: last.jellyPose })}）`);
};
// calm 阶段（离响铃超过 10 分钟）水母在泳线上休息不游动；soon（1–10 分钟）起才会游，所以游动类场景用 5 分钟
const fireIn = ms => { const fireAt = Date.now() + ms; return { id: 'species', title: '物种冒烟', count: 1, alarmId: 'a', revision: 3, canAct: true, fireAt, items: [{ id: 'species', alarmId: 'a', title: '物种冒烟', fireAt }] }; };
const hammerLook = { species: 'hammer', color: 6, colors: [6, 0], look: 'duo' };
const parsePairs = text => Object.fromEntries(String(text).split(' ').map(pair => pair.split('=')).map(([key, value]) => [key, Number(value)]));
const tuningOf = ping => parsePairs(ping.jellyTuning);

await scenario('物种：逐个下发每种可用的动物，回执与读数报告实际生效的物种，颜色与花纹照常（物种不进 jellyLook）', async h => {
  const animals = SHAPES.AVAILABLE.filter(id => id !== 'jelly');
  assert.ok(animals.includes('hammer') && animals.includes('manta'), '本步骤应已提供小锤头鲨与蝠鲼');
  for (const species of animals) {
    const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ ...hammerLook, species }) }) });
    assert.equal(reply.ok, true, species); assert.deepEqual(reply.appearance, { status: 'ok', species }, species);
    const ping = await until(h, r => r.jellyVisible === true && r.jellySpecies === species, 3500, `${species} 出现`);
    assert.equal(ping.jellySpecies, species);
    assert.equal(ping.jellyLook, 'colors=6,0 look=duo material=glass size=medium season=-', `${species}：花纹照常`);
    assert.ok(near(rgb(ping.jellyPaintA), PURPLE), `${species}：主色应是紫色，实际 ${ping.jellyPaintA}`);
    assert.equal(ping.jellyTint, ping.jellyPaintA, `${species}：色调`);
  }
});

await scenario('物种：原生画不出来的物种与不认识的取值一律退回水母，回执如实报告，水母不消失', async h => {
  for (const species of [...ANIMALS.filter(id => !SHAPES.AVAILABLE.includes(id)), 'dragon', 'jelly', 5, null, '', ['hammer'], { species: 'hammer' }]) {
    const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ species }) }) });
    const label = `species=${JSON.stringify(species)}`;
    assert.equal(reply.ok, true, label); assert.deepEqual(reply.appearance, { status: 'ok', species: 'jelly' }, label);
    const ping = await until(h, r => r.jellyVisible === true, 3500, `${label} 时水母仍在`);
    assert.equal(ping.jellySpecies, 'jelly', label);
  }
  // 没有 species 字段（S1a 的 Chrome）：同样是水母
  const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance() }) });
  assert.deepEqual(reply.appearance, { status: 'ok', species: 'jelly' });
});

await scenario('物种：水母 → 动物 → 水母 → 动物，读数每次都跟随；换物种不改颜色花纹', async h => {
  const sequence = ['jelly', 'hammer', 'jelly', 'hammer'];
  for (const species of sequence) {
    const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ ...hammerLook, species }) }) });
    assert.deepEqual(reply.appearance, { status: 'ok', species });
    const ping = await pinged(h);
    assert.equal(ping.jellySpecies, species);
    assert.equal(ping.jellyLook, 'colors=6,0 look=duo material=glass size=medium season=-', `${species}：花纹不因物种改变`);
    assert.ok(near(rgb(ping.jellyPaintA), PURPLE), `${species}：主色不变`);
  }
});

await scenario('物种：后一次下发没带 appearance 时保持上一次的物种与颜色（Chrome 读取外观失败时不闪回水母）', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance(hammerLook) }) });
  const reply = await h.request('jelly', { jelly: jelly() });
  assert.equal('appearance' in reply, false, '没带 appearance 就不回报');
  const ping = await pinged(h);
  assert.equal(ping.jellySpecies, 'hammer'); assert.equal(ping.jellyLook, 'colors=6,0 look=duo material=glass size=medium season=-');
});

await scenario('物种：动物同样遵循阶段颜色覆盖——临近阶段整只变成阶段色，结束后回到自选色，物种始终不变', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ ...hammerLook, colors: [6], look: 'solid' }) }) });
  assert.ok(near(rgb((await pinged(h)).jellyPaintA), PURPLE));
  assert.equal((await h.request('countdown', { timer: fireIn(25000) })).ok, true);
  await delay(1800);
  const during = await pinged(h);
  assert.equal(during.countdownStage, 2, `应进入临近阶段（imminent=2），实际 ${during.countdownStage}`);
  assert.ok(!near(rgb(during.jellyPaintA), PURPLE, 0.05), `临近阶段应覆盖自选色，实际仍是 ${during.jellyPaintA}`);
  assert.equal(during.jellySpecies, 'hammer', '阶段色不改物种');
  await h.request('countdown', { timer: null });
  await delay(1800);
  const after = await pinged(h);
  assert.ok(near(rgb(after.jellyPaintA), PURPLE, 0.02), '倒计时结束后回到自选色');
  assert.equal(after.jellySpecies, 'hammer');
});

await scenario('物种：窗口标题与读屏名称跟随实际生效的物种；画不出来的物种与不认识的取值仍叫“桌面水母”', async h => {
  const expectTitle = async (species, title) => {
    const reply = await h.request('jelly', { jelly: jelly({ appearance: appearance({ species }) }) });
    assert.equal(reply.ok, true, `${species}`);
    const ping = await pinged(h);
    assert.equal(ping.jellyTitle, title, `${species}：窗口标题`);
    assert.equal(ping.jellyLabel, title, `${species}：读屏名称`);
  };
  assert.equal((await pinged(h)).jellyTitle, '桌面水母', '还没下发任何外观时是水母的名字');
  for (const species of [...SHAPES.AVAILABLE, 'jelly']) await expectTitle(species, `桌面${SPECIES_NAMES[species]}`);
  for (const species of [...ANIMALS.filter(id => !SHAPES.AVAILABLE.includes(id)), 'dragon']) await expectTitle(species, '桌面水母');
});

await scenario('物种：游动调参按实际生效的物种应用——换成动物立刻生效、之后每次刷新都不被改回，换回水母恢复', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.equal((await h.request('countdown', { timer: fireIn(5 * 60000) })).ok, true);   // 非平静阶段：调参随阶段变，所以对比要在同一阶段里
  await delay(1300);                                                                      // 至少经过一次每秒刷新
  const jellyTuning = tuningOf(await pinged(h));
  assert.ok(jellyTuning.thrustY > 0 && jellyTuning.sink > 0, `水母的调参读数不对：${JSON.stringify(jellyTuning)}`);
  await h.request('jelly', { jelly: jelly({ appearance: appearance(hammerLook) }) });
  const right = tuningOf(await pinged(h));                                                // 回执之后的第一次读数：不能等下一次每秒刷新才换
  const smaller = (a, b, field) => assert.ok(a[field] < b[field], `小锤头鲨的 ${field} 应比水母小：${a[field]} 对 ${b[field]}`);
  for (const field of ['thrustX', 'thrustY', 'sink', 'dragX']) smaller(right, jellyTuning, field);
  assert.equal(right.hover, jellyTuning.hover, '愿意停留的高度不按物种乘系数');
  await delay(2300);                                                                      // 再经过至少两次每秒刷新：刷新时也要按实际生效的物种取调参
  assert.deepEqual(tuningOf(await pinged(h)), right, '刷新之后调参不应被改回水母的');
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.deepEqual(tuningOf(await pinged(h)), jellyTuning, '换回水母后立刻恢复水母的调参');
});

await scenario('物种：蝠鲼的游动调参按实际生效的物种应用——周期更长、冲量与下沉更小、横向阻力更小，系数与原生里标定的一致，比小锤头鲨拍得慢、滑得远', async h => {
  const apply = async look => { await h.request('jelly', { jelly: jelly({ appearance: appearance(look) }) }); return tuningOf(await pinged(h)); };
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.equal((await h.request('countdown', { timer: fireIn(5 * 60000) })).ok, true);   // 非平静阶段：同一阶段里对比
  await delay(1300);
  const jellyTuning = tuningOf(await pinged(h));
  const hammer = await apply(hammerLook);
  const manta = await apply({ ...hammerLook, species: 'manta' });                          // 回执之后的第一次读数就要是蝠鲼的
  for (const [field, expected] of [['period', 1.35], ['thrustX', 0.6], ['thrustY', 0.5], ['sink', 0.5], ['dragX', 0.5], ['dragY', 1]]) {
    const ratio = manta[field] / jellyTuning[field];
    assert.ok(Math.abs(ratio - expected) < 0.02, `蝠鲼的 ${field} 应是水母的 ${expected} 倍，实际 ${manta[field]} 对 ${jellyTuning[field]}（${ratio.toFixed(3)} 倍）`);
  }
  assert.ok(manta.period > hammer.period && manta.period > jellyTuning.period, `蝠鲼拍得最慢：周期 ${manta.period} 对小锤头鲨 ${hammer.period}、水母 ${jellyTuning.period}`);
  assert.ok(manta.dragX < hammer.dragX && manta.thrustX < hammer.thrustX, `蝠鲼冲量更小、阻力更小（滑得更远）：${manta.thrustX}/${manta.dragX} 对小锤头鲨 ${hammer.thrustX}/${hammer.dragX}`);
  assert.equal(manta.hover, jellyTuning.hover, '愿意停留的高度不按物种乘系数');
  await delay(2300);                                                                      // 再经过至少两次每秒刷新：刷新时也要按实际生效的物种取调参
  assert.deepEqual(tuningOf(await pinged(h)), manta, '刷新之后调参不应被改回');
  assert.deepEqual(await apply({ ...hammerLook, species: 'hammer' }), hammer, '换回小锤头鲨立刻恢复它的调参（不残留蝠鲼的）');
});

await scenario('物种：鲸鲨的游动调参按实际生效的物种应用——周期与水母相同、纵向冲量与下沉在三种动物里最小、横向冲量与蝠鲼相同、横向阻力介于蝠鲼与小锤头鲨之间，系数与原生里标定的一致', async h => {
  const apply = async look => { await h.request('jelly', { jelly: jelly({ appearance: appearance(look) }) }); return tuningOf(await pinged(h)); };
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.equal((await h.request('countdown', { timer: fireIn(5 * 60000) })).ok, true);   // 非平静阶段：同一阶段里对比
  await delay(1300);
  const jellyTuning = tuningOf(await pinged(h));
  const hammer = await apply(hammerLook);
  const manta = await apply({ ...hammerLook, species: 'manta' });
  const whale = await apply({ ...hammerLook, species: 'whaleshark' });                    // 回执之后的第一次读数就要是鲸鲨的
  for (const [field, expected] of [['period', 1], ['thrustX', 0.6], ['thrustY', 0.3], ['sink', 0.4], ['dragX', 0.65], ['dragY', 1]]) {
    const ratio = whale[field] / jellyTuning[field];
    assert.ok(Math.abs(ratio - expected) < 0.02, `鲸鲨的 ${field} 应是水母的 ${expected} 倍，实际 ${whale[field]} 对 ${jellyTuning[field]}（${ratio.toFixed(3)} 倍）`);
  }
  assert.ok(whale.thrustY < manta.thrustY && whale.thrustY < hammer.thrustY, `鲸鲨纵向冲量最小（巡航者，在窗口标准高度附近平稳滑行）：${whale.thrustY} 对蝠鲼 ${manta.thrustY}、小锤头鲨 ${hammer.thrustY}`);
  assert.ok(whale.sink < manta.sink && whale.sink < hammer.sink, `鲸鲨下沉最小：${whale.sink} 对蝠鲼 ${manta.sink}、小锤头鲨 ${hammer.sink}`);
  assert.equal(whale.thrustX, manta.thrustX, '横向冲量与蝠鲼相同');
  assert.ok(manta.dragX < whale.dragX && whale.dragX < hammer.dragX, `鲸鲨横向阻力介于蝠鲼与小锤头鲨之间：${manta.dragX} < ${whale.dragX} < ${hammer.dragX}`);
  assert.equal(whale.period, jellyTuning.period, '收缩周期与水母相同（鲸鲨的游动靠摆尾而不是拍翼，不加长周期）');
  assert.equal(whale.hover, jellyTuning.hover, '愿意停留的高度不按物种乘系数');
  await delay(2300);                                                                      // 再经过至少两次每秒刷新：刷新时也要按实际生效的物种取调参
  assert.deepEqual(tuningOf(await pinged(h)), whale, '刷新之后调参不应被改回');
  assert.deepEqual(await apply({ ...hammerLook, species: 'manta' }), manta, '换成蝠鲼立刻是蝠鲼的调参（不残留鲸鲨的）');
  assert.deepEqual(await apply({ ...hammerLook, species: 'whaleshark' }), whale, '换回鲸鲨立刻恢复它的调参');
});

await scenario('物种：海龟的游动调参按实际生效的物种应用——拍鳍周期 1.25 倍（比水母慢、比蝠鲼的 1.35 短）、水平冲量与横向阻力同为 0.7、纵向冲量与下沉同为 0.4，系数与原生里标定的一致', async h => {
  const apply = async look => { await h.request('jelly', { jelly: jelly({ appearance: appearance(look) }) }); return tuningOf(await pinged(h)); };
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.equal((await h.request('countdown', { timer: fireIn(5 * 60000) })).ok, true);   // 非平静阶段：同一阶段里对比
  await delay(1300);
  const jellyTuning = tuningOf(await pinged(h));
  const hammer = await apply(hammerLook);
  const manta = await apply({ ...hammerLook, species: 'manta' });
  const whale = await apply({ ...hammerLook, species: 'whaleshark' });
  const turtle = await apply({ ...hammerLook, species: 'turtle' });                       // 回执之后的第一次读数就要是海龟的
  for (const [field, expected] of [['period', 1.25], ['thrustX', 0.7], ['thrustY', 0.4], ['sink', 0.4], ['dragX', 0.7], ['dragY', 1]]) {
    const ratio = turtle[field] / jellyTuning[field];
    assert.ok(Math.abs(ratio - expected) < 0.02, `海龟的 ${field} 应是水母的 ${expected} 倍，实际 ${turtle[field]} 对 ${jellyTuning[field]}（${ratio.toFixed(3)} 倍）`);
  }
  assert.ok(turtle.period > jellyTuning.period && turtle.period < manta.period, `海龟拍鳍比水母慢、但没有蝠鲼拍翼那么慢：周期 ${turtle.period} 在水母 ${jellyTuning.period} 与蝠鲼 ${manta.period} 之间`);
  assert.ok(turtle.thrustY > whale.thrustY && turtle.thrustY < manta.thrustY && turtle.sink >= whale.sink && turtle.sink < manta.sink, `海龟的纵向冲量与下沉介于鲸鲨与蝠鲼之间（比鲸鲨多一点浮动、比蝠鲼稳）：${turtle.thrustY}/${turtle.sink} 对鲸鲨 ${whale.thrustY}/${whale.sink}、蝠鲼 ${manta.thrustY}/${manta.sink}`);
  assert.ok(turtle.thrustX > manta.thrustX && turtle.thrustX < hammer.thrustX, `海龟水平冲量介于蝠鲼与小锤头鲨之间：${manta.thrustX} < ${turtle.thrustX} < ${hammer.thrustX}`);
  assert.ok(turtle.dragX > whale.dragX && turtle.dragX <= hammer.dragX, `海龟横向阻力比鲸鲨大、不超过小锤头鲨（冲量与阻力同比，平均速度是五种里最慢）：${whale.dragX} < ${turtle.dragX} <= ${hammer.dragX}`);
  assert.equal(turtle.hover, jellyTuning.hover, '愿意停留的高度不按物种乘系数');
  await delay(2300);                                                                      // 再经过至少两次每秒刷新：刷新时也要按实际生效的物种取调参
  assert.deepEqual(tuningOf(await pinged(h)), turtle, '刷新之后调参不应被改回');
  assert.deepEqual(await apply({ ...hammerLook, species: 'whaleshark' }), whale, '换成鲸鲨立刻是鲸鲨的调参（不残留海龟的）');
  assert.deepEqual(await apply({ ...hammerLook, species: 'turtle' }), turtle, '换回海龟立刻恢复它的调参');
});

await scenario('物种：减少动态效果时动物静止——朝右、不俯仰、不划水，读数 jellyPose 与水母的约定一致', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance(hammerLook) }) });
  await h.request('countdown', { timer: fireIn(5 * 60000) });
  await delay(1500);
  const ping = await pinged(h);
  assert.match(ping.jellyPose, /^facing=1\.000 pitch=0\.000 wave=0\.000 vx=0\.0 vy=0\.0$/, `静止姿态，实际 ${ping.jellyPose}`);
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ species: 'jelly' }) }) });
  assert.match((await pinged(h)).jellyPose, /^facing=1\.000 pitch=0\.000 wave=0\.000 /, '水母的姿态读数恒为朝右/不俯仰/不划水');
});

for (const species of ['hammer', 'turtle', 'whaleshark']) await motionScenario(`开着动态效果：${SPECIES_NAMES[species]}自由游动时，出现稳定的同向游动就朝向跟上；俯仰与划水相位在界限内，且确实划水了`, async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ ...hammerLook, species }) }) });
  await h.request('countdown', { timer: fireIn(5 * 60000) });
  await delay(1200);
  const poses = [];
  let maxWave = 0, maxSpeed = 0, maxPitch = 0, strong = 0;
  const seen = { '-1': 0, '1': 0 };       // 稳定同向段的方向分布（只作信息：自由游动朝哪边、游多快都是随机的，不能据此要求两个方向都出现）
  // 至少采 44 次（约 10 秒）；之后若还没出现过任何一段稳定的同向游动（脉动之间速度会衰减到 20 以下，所以并不是时时都有），继续采到最多 60 秒。
  // 两个方向的朝向由下一个场景用确定方向的冲刺各核对一次。
  const deadline = Date.now() + 60000;
  for (let i = 0; i < 44 || (!strong && Date.now() < deadline); i++) {
    poses.push(parsePairs((await h.request('ping')).jellyPose)); await delay(220);
    const pose = poses[i];
    assert.ok(Math.abs(pose.facing) <= 1 + 1e-9, `facing 越界 ${pose.facing}`);
    assert.ok(Math.abs(pose.pitch) <= 0.35 + 1e-3, `pitch 越界 ${pose.pitch}`);
    assert.ok(Math.abs(pose.wave) <= 1 + 1e-9, `wave 越界 ${pose.wave}`);
    maxWave = Math.max(maxWave, Math.abs(pose.wave)); maxSpeed = Math.max(maxSpeed, Math.abs(pose.vx)); maxPitch = Math.max(maxPitch, Math.abs(pose.pitch));
    // 连续 4 次读数（约 0.9 秒）水平速度同向且 > 20：朝向必须已经转到那个方向（转身只要 0.3 秒）
    const window = poses.slice(Math.max(0, i - 3), i + 1);
    if (window.length === 4 && window.every(p => Math.abs(p.vx) > 20 && Math.sign(p.vx) === Math.sign(window[0].vx))) {
      strong++; seen[String(Math.sign(pose.vx))]++;
      assert.ok(Math.sign(pose.facing) === Math.sign(pose.vx) && Math.abs(pose.facing) >= 0.99, `连续同向游动（vx=${pose.vx}）时朝向应已转过去，实际 facing=${pose.facing}`);
    }
  }
  assert.ok(strong > 0, `${poses.length} 次读数里没有出现过稳定的同向游动（最大 |vx|=${maxSpeed}），无法核对朝向`);
  assert.ok(maxSpeed > 20, `应有明显的水平游动，最大 |vx|=${maxSpeed}`);
  assert.ok(maxWave > 0.2, `游动时应划水，最大 |wave|=${maxWave}`);
  assert.ok(maxPitch > 0.1, `游动时身体应随纵向速度俯仰（实测 4 次最大 |pitch| 0.31–0.32，上限 0.35），最大 |pitch|=${maxPitch}`);
  console.log(`      （${poses.length} 次读数：最大 |vx|=${maxSpeed.toFixed(1)}，最大 |wave|=${maxWave.toFixed(2)}，最大 |pitch|=${maxPitch.toFixed(3)}，稳定同向段 ${strong} 个，朝向都跟上了：向左 ${seen['-1']}、向右 ${seen['1']}）`);
});

// 冲刺的方向是确定的：没有常驻、没有倒计时时，响铃让水母从屏幕右边游入（向左）到落点，响铃结束后向右游走再淡出。
// 自由游动朝哪边是随机的，上一个场景只核对碰巧出现的方向，所以两个方向的朝向都用这两段冲刺确定性地各核对一次（冲刺有三次缓动，路程至少是半个泳线）。
const ringPayload = sessionId => ({ sessionId, title: '开会；喝水', timeText: '10/16 09:30', clock: '09:30', labels: ['开会', '喝水'], more: 0, canSnooze: true, snoozeMinutes: 10 });
const dashSamples = async (h, done, limitMs, what) => {
  const samples = [];
  for (const end = Date.now() + limitMs; Date.now() < end;) {
    const ping = await h.request('ping');
    samples.push({ t: Date.now(), ping, pose: parsePairs(ping.jellyPose) });
    if (done(ping)) return samples;
    await delay(30);
  }
  const last = samples.at(-1);
  throw new Error(`等待超时：${what}（最后读数 ${JSON.stringify({ visible: last?.ping.jellyVisible, ring: last?.ping.ringPhase, pose: last?.ping.jellyPose })}）`);
};
// 连续读数里 vx 与 dir 同号且 |vx| > 20 的最长一段（from/to 是读数下标，ms 是这一段首尾读数的时间差）
const longestDash = (samples, dir) => {
  let best = null, from = -1;
  for (let i = 0; i <= samples.length; i++) {
    const fast = i < samples.length && Math.sign(samples[i].pose.vx) === dir && Math.abs(samples[i].pose.vx) > 20;
    if (fast && from < 0) from = i;
    if (!fast && from >= 0) {
      const run = { from, to: i - 1, ms: samples[i - 1].t - samples[from].t };
      if (!best || run.ms > best.ms) best = run;
      from = -1;
    }
  }
  return best;
};
// 冲刺进行到 0.45 秒以后（转身只要 0.3 秒），朝向必须已经转到冲刺的方向
const assertTurned = (samples, dir, label) => {
  const run = longestDash(samples, dir);
  const side = dir < 0 ? '向左' : '向右';
  assert.ok(run && run.ms >= 450, `${label}：应采到一段至少 0.45 秒的${side}冲刺，实际最长 ${run?.ms ?? 0} 毫秒（共 ${samples.length} 次读数）`);
  const late = samples.slice(run.from, run.to + 1).filter(s => s.t - samples[run.from].t >= 450);
  assert.ok(late.length > 0, `${label}：冲刺 0.45 秒以后应至少有一次读数`);
  for (const s of late) assert.ok(s.pose.facing * dir >= 0.99, `${label}：${side}冲刺进行了 0.45 秒以后朝向应已转过去（facing=${dir}），实际 facing=${s.pose.facing}（vx=${s.pose.vx}）`);
  return run;
};

await motionScenario('开着动态效果：没常驻时动物从右边游入（向左）、响铃结束后向右游走——两段冲刺的朝向都跟上了（确定性地核对两个方向）', async h => {
  const reply = await h.request('jelly', { jelly: jelly({ resident: false, appearance: appearance(hammerLook) }) });
  assert.equal(reply.ok, true);
  const before = await pinged(h);
  assert.equal(before.jellyVisible, false, '没有常驻也没有倒计时，水母不在屏幕上');
  assert.equal(before.jellySpecies, 'hammer');
  const shown = await h.request('show', ringPayload('ring-3'));
  assert.equal(shown.ok, true);
  const arrival = await dashSamples(h, ping => ping.ringPhase === 'shown' && ping.ringId === 'ring-3', 8000, '动物从右边游到落点');
  const inbound = assertTurned(arrival, -1, '入场');
  await delay(300);
  await h.request('hide', { sessionId: 'ring-3' });
  const exit = await dashSamples(h, ping => ping.jellyVisible === false, 8000, '响铃结束后动物游走并消失');
  const outbound = assertTurned(exit, 1, '游走');
  console.log(`      （入场向左 ${inbound.ms} 毫秒、游走向右 ${outbound.ms} 毫秒的快速冲刺，朝向都已转过去）`);
});

await motionScenario('开着动态效果：换物种时姿态从头来——刚向左冲刺完的动物换成水母再换回，朝向回到默认的朝右，不继承上一只的姿态', async h => {
  const look = species => jelly({ resident: false, appearance: appearance({ ...hammerLook, species }) });
  await h.request('jelly', { jelly: look('hammer') });
  assert.equal((await h.request('show', ringPayload('ring-4'))).ok, true);
  const arrival = await dashSamples(h, ping => ping.ringPhase === 'shown' && ping.ringId === 'ring-4', 8000, '动物从右边游到落点');
  assertTurned(arrival, -1, '入场');
  await delay(300);
  assert.equal(parsePairs((await h.request('ping')).jellyPose).facing, -1, '换物种之前，刚向左冲刺完的动物应朝左');
  await h.request('jelly', { jelly: look('jelly') });
  const asJelly = await h.request('ping');
  assert.equal(asJelly.jellySpecies, 'jelly');
  assert.match(asJelly.jellyPose, /^facing=1\.000 pitch=0\.000 wave=0\.000 /, '水母的姿态读数恒为朝右/不俯仰/不划水');
  await h.request('jelly', { jelly: look('hammer') });
  const back = await h.request('ping');
  assert.equal(back.jellySpecies, 'hammer');
  // 动物站在落点上（vx 恒为 0），朝向不会被速度改回来：这一次读数只可能是“从头来”的结果，不是游动的结果
  assert.equal(parsePairs(back.jellyPose).facing, 1, `换回动物后姿态应从头来（朝右），实际 ${back.jellyPose}`);
  await h.request('hide', { sessionId: 'ring-4' });
});

await scenario('物种：响铃时动物同样游到落点并弹出气泡（窗口放大、气泡就位），读数仍报告所选物种', async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance(hammerLook) }) });
  const shown = await h.request('show', ringPayload('ring-1'));
  assert.equal(shown.ok, true);
  const ping = await until(h, r => r.ringPhase === 'shown' && r.ringId === 'ring-1', 4500, '动物游到落点并弹出气泡');
  assert.equal(ping.jellySpecies, 'hammer'); assert.equal(ping.jellyVisible, true);
  assert.notEqual(ping.ringBubble, undefined); assert.equal(ping.ringClock, '09:30');
  await h.request('hide', { sessionId: 'ring-1' });
});

const FIN_NAMES = { hammer: '小锤头鲨的鳍', manta: '蝠鲼的翼', turtle: '海龟的鳍状肢与尾', whaleshark: '鲸鲨的尾鳍与胸鳍' };
for (const species of ['hammer', 'manta', 'turtle', 'whaleshark']) await motionScenario(`开着动态效果：响铃时${FIN_NAMES[species]}随节奏摆动；响铃结束、游回原位停稳后，鳍（翼）与身体回到中位（不停在半途）`, async h => {
  await h.request('jelly', { jelly: jelly({ appearance: appearance({ ...hammerLook, species }) }) });
  const ringId = `ring-2-${species}`;
  const shown = await h.request('show', ringPayload(ringId));
  assert.equal(shown.ok, true);
  await until(h, r => r.ringPhase === 'shown' && r.ringId === ringId, 8000, '动物游到落点并弹出气泡');
  let maxWave = 0;
  for (let i = 0; i < 10; i++) { maxWave = Math.max(maxWave, Math.abs(parsePairs((await h.request('ping')).jellyPose).wave)); await delay(150); }
  assert.ok(maxWave > 0.2, `响铃时鳍应随收缩节奏摆动，最大 |wave|=${maxWave}`);
  await h.request('hide', { sessionId: ringId });
  // 响铃收尾后动物游回原位：等到响铃状态清空且速度读数连续两次为 0（停下）
  let still = 0, last;
  for (const end = Date.now() + 30000; Date.now() < end && still < 2;) {
    await delay(400);
    last = await h.request('ping');
    const pose = parsePairs(last.jellyPose);
    still = last.ringPhase === 'none' && pose.vx === 0 && pose.vy === 0 ? still + 1 : 0;
  }
  assert.ok(still >= 2, `响铃结束后动物应游回原位并停下；最后读数 ringPhase=${last?.ringPhase} pose=${last?.jellyPose}`);
  assert.equal(last.jellyVisible, true, '停下后动物仍在屏幕上');
  await delay(1500);      // 包络以 5/秒 的速率落回 0，不到 1 秒；留足余量
  const settled = parsePairs((await h.request('ping')).jellyPose);
  assert.ok(Math.abs(settled.wave) < 0.011 && Math.abs(settled.pitch) < 0.0035, `停稳后鳍与身体应回到中位（|wave|<0.011、|pitch|<0.0035），实际 wave=${settled.wave} pitch=${settled.pitch}`);
  await delay(600);
  const later = parsePairs((await h.request('ping')).jellyPose);
  assert.deepEqual([later.wave, later.pitch, later.facing], [settled.wave, settled.pitch, settled.facing], '停稳后姿态不再变化（动画帧已停）');
});

if (skipped) console.log(`外观冒烟通过（${skipped} 个动画场景因${[...skipReasons].join('、')}跳过，未验证）`);
else console.log('外观冒烟全部通过');
