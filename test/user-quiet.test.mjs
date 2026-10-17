// 验收脚本的“礼让用户”判定（desktop-reminder/user-quiet.mjs）：它决定验收脚本会不会在用户打字时抢键盘，
// 判定写错的后果是把用户的按键送进测试面板，所以用假的空闲时间和时钟把规则逐条钉住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { Quiet, EXIT_USER_ACTIVE } from '../desktop-reminder/user-quiet.mjs';

// 假的世界：now() 是毫秒时钟，idle() 是“距最后一次任何键鼠事件”的秒数；合成输入与用户输入都会把它清零，睡眠推进时钟
function world({ idleAtStart = 100 } = {}) {
  const w = { clock: 1_000_000, lastEvent: 1_000_000 - idleAtStart * 1000, sleeps: [] };
  w.now = () => w.clock;
  w.idle = () => (w.clock - w.lastEvent) / 1000;
  w.sleep = async ms => { w.sleeps.push(ms); w.clock += ms; w.onSleep?.(w); };
  w.advance = seconds => { w.clock += seconds * 1000; };
  w.userTouches = () => { w.lastEvent = w.clock; };            // 真实用户的输入
  w.synthetic = quiet => { w.lastEvent = w.clock; quiet.touch(); };   // 验收脚本自己的合成输入（调用方必须 touch）
  w.make = seconds => new Quiet(seconds, { idle: w.idle, now: w.now, sleep: w.sleep });
  return w;
}

test('退出码 75 是 sysexits 的 EX_TEMPFAIL（暂时无法完成，稍后重试），不是验收失败的 1', () => {
  assert.equal(EXIT_USER_ACTIVE, 75);
});

test('intrusion：只有比我们最后一次合成输入更晚的真实输入才算用户', () => {
  const w = world(), quiet = w.make(20);
  assert.equal(quiet.intrusion(), null, '刚创建、用户早就没动：没有闯入');
  w.advance(5);
  assert.equal(quiet.intrusion(), null, '过了 5 秒仍然没有任何输入：没有闯入');
  w.synthetic(quiet); w.advance(3);
  assert.equal(quiet.intrusion(), null, '空闲被我们自己的合成输入清零，已 touch：不能算用户');
  w.advance(5); w.userTouches(); w.advance(1);
  const reason = quiet.intrusion();
  assert.match(reason, /检测到真实键盘或鼠标输入/);
  assert.match(reason, /空闲 1\.0 秒/);
  assert.match(reason, /距我们上一次合成输入 9\.0 秒/, '合成输入之后过了 3 + 5 + 1 秒');
});

test('intrusion：0.7 秒内的时钟抖动不误报，超过才报', () => {
  const w = world(), quiet = w.make(20);
  w.synthetic(quiet);
  w.advance(10); w.lastEvent = w.clock - 9.4 * 1000;       // 空闲 9.4 秒、距合成输入 10 秒：差 0.6 秒
  assert.equal(quiet.intrusion(), null);
  w.lastEvent = w.clock - 9.2 * 1000;                      // 差 0.8 秒
  assert.notEqual(quiet.intrusion(), null);
});

test('wait：用户一直在用就等，安静够久才放行，并只提示一次', async () => {
  const w = world({ idleAtStart: 2 }), quiet = w.make(20), lines = [];
  w.advance(1); w.userTouches();            // 创建之后用户又碰过键鼠：放行时必须把基线挪到“此刻”，否则马上就会把这次输入当成闯入
  await quiet.wait(15, line => lines.push(line));
  assert.ok(w.idle() >= 18 && w.sleeps.length >= 9, '至少等到空闲满 20 秒');
  assert.equal(lines.length, 1, '提示只出现一次');
  assert.equal(quiet.verified, true);
  assert.equal(quiet.intrusion(), null, '放行时记下了“此刻是安静的”，不会马上自己报警');
});

test('wait：用户中途又回来就继续等，空闲重新计数', async () => {
  const w = world({ idleAtStart: 15 }), quiet = w.make(20);
  let slept = 0;
  w.onSleep = () => { slept++; if (slept === 1) w.userTouches(); };       // 第一次睡眠后用户碰了一下键盘
  await quiet.wait();
  assert.ok(w.sleeps.length >= 10, `空闲被清零后要从头再等 20 秒（实际睡眠 ${w.sleeps.length} 次）`);
});

test('wait：等超过上限就放弃，不无限占着', async () => {
  const w = world({ idleAtStart: 0 }), quiet = w.make(20);
  w.onSleep = () => w.userTouches();                                          // 用户一直在用
  await assert.rejects(quiet.wait(1), /等了 1 分钟用户仍在使用电脑/);
  assert.ok(w.sleeps.length >= 30 && w.sleeps.length <= 32, `约 60 秒 / 2 秒 = 30 次睡眠（实际 ${w.sleeps.length}）`);
  assert.equal(quiet.verified, false, '放弃时不能标成已确认安静');
});

test('waitIfActive：第一次必须等，之后没有真实输入就直接继续（合成输入已扣除）', async () => {
  const w = world({ idleAtStart: 2 }), quiet = w.make(20);
  await quiet.waitIfActive();
  const firstWait = w.sleeps.length;
  assert.ok(firstWait > 0, '第一次要等用户安静');
  w.synthetic(quiet); w.advance(1.2);       // 一个场景里合成了键鼠输入，系统空闲被我们清零
  await quiet.waitIfActive();
  assert.equal(w.sleeps.length, firstWait, '没有真实输入：不再各等一遍 20 秒');
  w.synthetic(quiet); w.advance(7);
  await quiet.waitIfActive();
  assert.equal(w.sleeps.length, firstWait, '多个场景连续运行也一样');
});

test('waitIfActive：场景之间用户回来了就重新等到安静', async () => {
  const w = world({ idleAtStart: 100 }), quiet = w.make(20);
  await quiet.waitIfActive();
  assert.equal(w.sleeps.length, 0, '用户本来就很久没动：不用等');
  w.synthetic(quiet); w.advance(4); w.userTouches(); w.advance(2);      // 我们合成之后用户碰了键盘
  const before = w.sleeps.length;
  await quiet.waitIfActive();
  assert.ok(w.sleeps.length - before >= 9, `用户回来了要重新等到安静（新增睡眠 ${w.sleeps.length - before} 次）`);
});

test('watch：用户回来时只通知一次，停止函数生效', async () => {
  const w = world(), quiet = w.make(20), reasons = [];
  const stop = quiet.watch(reason => reasons.push(reason));
  await new Promise(done => setTimeout(done, 520));
  assert.equal(reasons.length, 0, '没有真实输入：不通知');
  w.advance(5); w.userTouches(); w.advance(1);
  await new Promise(done => setTimeout(done, 900));
  assert.equal(reasons.length, 1, '只通知一次');
  assert.match(reasons[0], /检测到真实键盘或鼠标输入/);
  stop();
  const stopped = world(), quiet2 = stopped.make(20), seen = [];
  const stop2 = quiet2.watch(reason => seen.push(reason));
  stop2();
  stopped.advance(5); stopped.userTouches(); stopped.advance(1);
  await new Promise(done => setTimeout(done, 900));
  assert.equal(seen.length, 0, '停止后不再通知');
});

test('seconds=0 关闭礼让：不等、不盯、不报闯入（只在无人值守时用）', async () => {
  const w = world({ idleAtStart: 0 }), quiet = w.make(0);
  await quiet.wait(); await quiet.waitIfActive();
  assert.equal(w.sleeps.length, 0);
  const stop = quiet.watch(() => assert.fail('关闭后不应通知'));
  w.advance(5); w.userTouches(); w.advance(1);
  await new Promise(done => setTimeout(done, 520));
  stop();
});
