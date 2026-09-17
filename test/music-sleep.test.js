const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../js/music-sleep.js');
function fixture() {
  let time = 100000, pauses = 0;
  const values = {}, scheduled = new Map();
  const deps = { now: () => time, storage: { get: async () => values, set: async patch => Object.assign(values, patch), remove: async key => { delete values[key]; } },
    alarms: { create: async (name, options) => scheduled.set(name, options), clear: async name => scheduled.delete(name) }, pause: async () => { pauses++; return { ok: true }; } };
  return { deps, scheduled, advance: ms => { time += ms; }, pauses: () => pauses };
}
test('页面退出后后台到期暂停，重复回调不重复执行', async () => {
  const f = fixture(), timer = create(f.deps);
  await timer.set(30); f.advance(30 * 60000);
  await timer.fire('music-sleep-stop'); await timer.fire('music-sleep-stop');
  assert.equal(f.pauses(), 1); assert.equal((await timer.get()).status, 'stopped');
});
test('重启恢复原始截止时间，取消后迟到回调不停止音乐', async () => {
  const f = fixture(); await create(f.deps).set(30); f.advance(10000);
  const restored = create(f.deps); await restored.restore();
  assert.equal(f.scheduled.get('music-sleep-stop').when, 1900000);
  await restored.set(0); f.advance(2000000); await restored.fire('music-sleep-stop');
  assert.equal(f.pauses(), 0); assert.equal(await restored.get(), null);
});
test('新定时覆盖旧定时，旧回调提前到达不触发；失败可见', async () => {
  const f = fixture(), timer = create(f.deps);
  await timer.set(1); await timer.set(30); f.advance(60000); await timer.fire('music-sleep-stop');
  assert.equal(f.pauses(), 0);
  const failed = create({ ...f.deps, pause: async () => ({ ok: false }) });
  f.advance(1800000); await failed.restore(); assert.equal((await failed.get()).status, 'failed');
});
test('非法时长不写入', async () => {
  const f = fixture(), timer = create(f.deps);
  await assert.rejects(timer.set(300)); await assert.rejects(timer.set(-1));
  assert.equal(await timer.get(), null);
});

test('旧页面到期不能取消或停止另一个页面设置的新定时', async () => {
  const f = fixture(), timer = create(f.deps);
  const old = await timer.set(1); const current = await timer.set(30);
  f.advance(60000);
  assert.equal((await timer.finish(old.timer.fireAt)).ok, false);
  assert.equal(f.pauses(), 0); assert.equal((await timer.get()).fireAt, current.timer.fireAt);
  f.advance(1800000);
  assert.equal((await timer.finish(current.timer.fireAt)).ok, true);
  assert.equal(f.pauses(), 1);
});
