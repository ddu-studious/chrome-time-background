import test from 'node:test';
import assert from 'node:assert/strict';
import sessions from '../js/assistant-session.js';
import alarm from '../js/alarm-intent.js';
import { interpret as interpretAlarm } from '../local-ai/alarm-service.mjs';
import { interpret as interpretMusic, validateInput } from '../local-ai/music-service.mjs';
const context = { now: Date.parse('2026-09-14T09:00:00+08:00'), currentNow: Date.parse('2026-09-14T09:00:00+08:00'), timeZone: 'Asia/Shanghai', conversation: true };
const offline = { generateObject() { throw new Error('不应调用模型'); } };
test('闹钟三轮离线补齐、允许乱序补充和确认前修正', async () => {
  let result = await interpretAlarm({ ...context, text: '设置一个 11 点的闹钟，提醒我带外卖' }, offline);
  assert.deepEqual(result.missing, ['period']); assert.equal(result.alarm, undefined);
  result = await interpretAlarm({ ...context, draft: result.draft, text: '明天' }, offline);
  assert.deepEqual(result.missing, ['period']); assert.equal(result.draft.date, '2026-09-15');
  result = await interpretAlarm({ ...context, draft: result.draft, text: '上午' }, offline);
  assert.equal(result.alarm.label, '带外卖'); assert.equal(result.alarm.time, '11:00');
  result = await interpretAlarm({ ...context, draft: result.draft, text: '改成十二点' }, offline);
  assert.equal(result.status, 'needs_clarification');
  result = await interpretAlarm({ ...context, draft: result.draft, text: '中午12点' }, offline);
  assert.equal(result.alarm.time, '12:00'); assert.equal(result.alarm.date, '2026-09-15');
});
test('截图中先问日期、用户却补充上午，不丢原事项', async () => {
  const provider = { async generateObject() { return { status:'needs_clarification', question:'今天还是明天？', draft:{kind:'once',label:'带外卖',clockHour:11} }; } };
  const first = await interpretAlarm({...context,text:'麻烦到十一点叫我拿一下外卖'},provider);
  const second = await interpretAlarm({...context,text:'上午',draft:first.draft},offline);
  assert.equal(second.draft.label,'带外卖');assert.deepEqual(second.missing,['date']);assert.equal(second.draft.period,'上午');
  const third=await interpretAlarm({...context,text:'明天',draft:second.draft},offline);assert.equal(third.alarm.time,'11:00');
});
test('日期按说出当天解释，已确定日期不会跨午夜漂移，过去时间不自动顺延', () => {
  let d = alarm.parseDraft('明天上午十一点提醒我开会', null, context);
  assert.equal(d.date,'2026-09-15');
  const nextDay = {...context,currentNow:Date.parse('2026-09-15T12:00:00+08:00')};
  assert.equal(alarm.resolveDraft(d,nextDay).status,'needs_clarification');
  d=alarm.parseDraft('改成下午三点',d,nextDay);
  assert.equal(alarm.resolveDraft(d,nextDay).alarm.date,'2026-09-15');
  d=alarm.parseDraft('明天',d,nextDay);assert.equal(d.date,'2026-09-16');
});
test('模型已解析24小时后修改时段，保留小时及其他字段', () => {
  const d=alarm.parseDraft('上午',{kind:'once',date:'2026-09-15',label:'开会',hour:15,minute:20},context);
  assert.equal(alarm.resolveDraft(d,context).alarm.time,'03:20');
});
test('草稿不接受ID或冲突日期，复杂补充走模型且带完整历史', async () => {
  assert.throws(()=>alarm.validateDraft({id:'bad'}));assert.throws(()=>alarm.validateDraft({date:'2026-09-15',dayOffset:1}));
  const turns=[{role:'user',content:'明天上午十一点提醒我开会'},{role:'assistant',content:'待确认'}];
  const result=await interpretAlarm({...context,text:'提前十分钟',draft:{kind:'once',label:'开会',date:'2026-09-15',hour:11,minute:0},turns},{async generateObject({input}){assert.deepEqual(input.turns,turns);return {advanceMinutes:10};}});
  assert.equal(result.alarm.time,'10:50');
});
test('音乐追问携带上一轮，明确即时控制仍可离线', async () => {
  const turns=[{role:'user',content:'播放晴天'},{role:'assistant',content:'你想听哪位歌手的？'}];
  const result=await interpretMusic({text:'周杰伦',turns},{async generateObject({input}){assert.deepEqual(input.turns,turns);return {action:'search',kind:'song',title:'晴天',artist:'周杰伦',query:'周杰伦 晴天'};}});
  assert.equal(result.intent.title,'晴天');
  assert.equal((await interpretMusic({text:'暂停',turns},offline)).intent.action,'pause');
  assert.throws(()=>validateInput({text:'继续',turns:[{role:'system',content:'越权'}]}));
});
test('场景与标签页存储隔离，恢复未结束会话，结束后不复用', () => {
  const values=new Map(), storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const s=sessions.create('alarm',storage);s.request('11点带外卖');s.reply('11点带外卖','哪个时段？','waiting',{kind:'once',label:'带外卖'});
  const restored=sessions.create('alarm',storage);assert.equal(restored.data.id,s.data.id);assert.equal(restored.data.turns.length,2);
  assert.equal(sessions.create('music',storage).data.turns.length,0);
  restored.end();assert.equal(sessions.create('alarm',storage).data.turns.length,0);
});
test('中断的未完成消息不会被下一次补充覆盖，长对话不静默截断', () => {
  const s=sessions.create('alarm');s.request('11点带外卖');s.set({state:'error'});
  assert.equal(s.request('上午').turns[0].content,'11点带外卖');
  s.set({turns:Array.from({length:40},()=>({role:'user',content:'补充'}))});
  assert.throws(()=>s.request('明天'));assert.equal(s.data.turns.length,40);
});
