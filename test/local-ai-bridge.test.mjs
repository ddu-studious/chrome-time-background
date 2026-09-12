import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import intent from '../js/alarm-intent.js';
const coreContext = { self: {}, Date, Math, Set, Object, Number, String, Array };
vm.runInNewContext(readFileSync(new URL('../js/alarm-core.js', import.meta.url), 'utf8'), coreContext);

function bridge(fetchImpl = async () => { throw new TypeError('offline'); }) {
  let listener;
  const values = {};
  const chrome = { runtime: { id: 'a'.repeat(32), getURL: () => `chrome-extension://${'a'.repeat(32)}/`, onMessage: { addListener(fn) { listener = fn; } } }, storage: { local: { async get() { return values; }, async set(value) { Object.assign(values, value); } } } };
  vm.runInNewContext(readFileSync(new URL('../js/local-ai-client.js', import.meta.url), 'utf8'), { chrome, AlarmIntent: intent, fetch: fetchImpl, AbortSignal, Set, Number, String });
  return { values, call: (message, url = chrome.runtime.getURL() + 'index.html') => new Promise(resolve => listener(message, { id: chrome.runtime.id, url }, resolve)) };
}
test('扩展入口拒绝网页 content script，离线规则不需要凭证和网络', async () => {
  const b = bridge();
  const message = { action: 'smart_alarm_interpret', text: '20分钟后提醒我休息', now: Date.now(), timeZone: 'Asia/Shanghai' };
  assert.equal((await b.call(message, 'https://example.com')).ok, false);
  const result = await b.call(message);
  assert.equal(result.ok, true); assert.equal(result.source, 'rules');
});
test('连接令牌仅本地存储，正确请求固定端点，不将凭证返回给页面', async () => {
  let seen;
  const b = bridge(async (url, options) => { seen = { url, options }; return { ok: true, json: async () => ({ ok: true, state: 'ready' }) }; });
  const token = 'a'.repeat(64);
  const configured = await b.call({ action: 'local_ai_configure', token });
  assert.equal(configured.ok, true); assert.equal(configured.token, undefined);
  await b.call({ action: 'local_ai_status' });
  assert.equal(seen.url, 'http://127.0.0.1:19841/health');
  assert.equal(seen.options.headers.Authorization, `Bearer ${token}`);
});
test('异步结果轮询使用独立短 GET，网络失败明确返回未连接', async () => {
  const b = bridge();
  await b.call({ action: 'local_ai_configure', token: 'a'.repeat(64) });
  const invalid = await b.call({ action: 'smart_alarm_result', jobId: '../../health' });
  assert.equal(invalid.ok, false);
  const offline = await b.call({ action: 'smart_alarm_result', jobId: 'a'.repeat(32) });
  assert.match(offline.error, /未连接/);
});
test('修改推理等级保留连接令牌，并将已保存等级传递到解析请求', async () => {
  let body;
  const b = bridge(async (url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({ ok: true, status: 'pending' }) }; });
  await b.call({ action: 'local_ai_configure', token: 'a'.repeat(64) });
  assert.equal((await b.call({ action: 'local_ai_preferences' })).reasoning, 'off');
  await b.call({ action: 'local_ai_configure', token: '', reasoning: 'medium' });
  assert.equal(b.values.localAIConnectionV1.token, 'a'.repeat(64));
  await b.call({ action: 'smart_alarm_interpret', text: '明天提醒我开会', now: Date.now(), timeZone: 'Asia/Shanghai' });
  assert.equal(body.reasoning, 'medium');
  assert.equal((await b.call({ action: 'local_ai_preferences' })).token, undefined);
});
test('改名在已有澄清上下文中仍走本地路径，不要求模型令牌', async () => {
  const result = await bridge().call({ action: 'smart_alarm_interpret', text: '2026-09-12 16:26 的闹钟名称修改为：你好，闹钟', now: Date.now(), timeZone: 'Asia/Shanghai', turns: [{ role: 'user', content: '修改闹钟' }] });
  assert.equal(result.ok, true); assert.equal(result.intent, 'rename'); assert.equal(result.source, 'rules');
});
test('改名只更新唯一目标名称，保留已过期关闭状态，无匹配不新建，多匹配须选择', async () => {
  const source = readFileSync(new URL('../js/background.js', import.meta.url), 'utf8');
  const start = source.indexOf('    let userAlarmSaveQueue =');
  const end = source.indexOf('    async function deleteUserAlarm', start);
  let records = [{ id: 'a', label: '截止', date: '2026-09-12', time: '16:26', fireAt: 1, enabled: false, repeat: 'once', revision: 1, soundId: 'water', volume: .4 }];
  let writes = 0;
  const runtime = { pendingSnoozes: [{ alarmId: 'a' }] };
  const context = { Date, loadUserAlarmState: async () => ({ alarms: [...records], runtime }), saveUserAlarmState: async (alarms, state) => { assert.equal(state, runtime); records = alarms; writes++; } };
  vm.runInNewContext(source.slice(start, end), context);
  const input = { selector: { date: '2026-09-12', time: '16:26' }, label: '你好，闹钟' };
  const renamed = await context.renameUserAlarm(input);
  assert.equal(renamed.status, 'renamed'); assert.equal(records.length, 1);
  assert.equal(records[0].label, '你好，闹钟'); assert.equal(records[0].enabled, false);
  assert.equal(records[0].fireAt, 1); assert.equal(records[0].soundId, 'water'); assert.equal(records[0].volume, .4);
  await assert.rejects(context.renameUserAlarm({ ...input, selector: { date: '2026-09-13', time: '16:26' } }), /未找到/);
  assert.equal(writes, 1);
  records.push({ ...records[0], id: 'b', label: '另一个' });
  const choices = await context.renameUserAlarm({ ...input, label: '新名称' });
  assert.equal(choices.status, 'choose'); assert.equal(choices.candidates.length, 2); assert.equal(writes, 1);
  await assert.rejects(context.renameUserAlarm({ ...input, alarmId: 'b', expectedRevision: 1 }), /已变化/);
  await context.renameUserAlarm({ ...input, label: '选中第二个', alarmId: 'b', expectedRevision: 2 });
  assert.equal(records[0].label, '你好，闹钟'); assert.equal(records[1].label, '选中第二个');
});
test('闹钟保存串行避免并发覆盖，重复智能创建返回原记录，过期提醒拒绝', async () => {
  const source = readFileSync(new URL('../js/background.js', import.meta.url), 'utf8');
  const start = source.indexOf('    let userAlarmSaveQueue =');
  const end = source.indexOf('    async function deleteUserAlarm', start);
  let stored = [];
  const context = {
    AlarmCore: coreContext.self.AlarmCore,
    loadUserAlarmState: async () => { await new Promise(resolve => setTimeout(resolve, 2)); return { alarms: [...stored], runtime: {} }; },
    saveUserAlarmState: async alarms => { stored = alarms; },
    reconcileUserAlarmSchedule: async () => ({}), Date
  };
  vm.runInNewContext(source.slice(start, end), context);
  const alarm = { label: '开会', time: '15:00', fireAt: Date.now() + 86400000, repeat: 'once', smartInput: true };
  await Promise.all([context.saveUserAlarm({ ...alarm, id: 'a' }), context.saveUserAlarm({ ...alarm, id: 'b', label: '喝水' })]);
  assert.equal(stored.length, 2);
  const duplicate = await context.saveUserAlarm({ ...alarm, id: 'c' });
  assert.equal(duplicate.duplicate, true); assert.equal(duplicate.alarm.id, 'a');
  await assert.rejects(context.saveUserAlarm({ ...alarm, id: 'd', fireAt: Date.now() - 1000 }), /未来时间/);
});
