const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const AssistantSession=require('../js/assistant-session.js'),AlarmIntent=require('../js/alarm-intent.js');
class Element {
 constructor(){this.nodes={};this.events={};this.children=[];this.value='';this.classList={toggle(){},contains(){return true;}};}
 querySelector(k){return this.nodes[k] ||= new Element();} querySelectorAll(){return [];}
 addEventListener(k,fn){this.events[k]=fn;} append(x){this.children.push(x);} replaceChildren(){this.children=[];} before(x){this.box=x;} focus(){}
}
function fixture(){
 const root=new Element(),pending=[];const center={root,refresh:async()=>{}};
 const context={window:{},AssistantSession,AlarmIntent,Intl,Date,document:{createElement:()=>new Element()},chrome:{runtime:{sendMessage(m,cb){if(m.action==='ai_history_write')cb({ok:true});else if(m.action==='local_ai_preferences')cb({ok:false});else pending.push({m,cb});}}},setTimeout};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/smart-alarm-ui.js'),'utf8'),context);context.window.mountSmartAlarm(center);
 const box=root.querySelector('.alarm-next-card').box;
 const submit=text=>{box.querySelector('#smart-alarm-text').value=text;return box.querySelector('form').events.submit({preventDefault(){}});};
 return {box,pending,submit};
}
test('闹钟连续补充保留同一会话，待确认不保存，确认只保存一次',async()=>{
 const f=fixture();
 for(const text of ['设置一个11点的闹钟，提醒我带外卖','上午','明天']){
  const run=f.submit(text),req=f.pending.at(-1);const d=AlarmIntent.parseDraft(text,req.m.draft,req.m);req.cb({ok:true,...AlarmIntent.resolveDraft(d,req.m)});await run;
 }
 assert.equal(f.pending.filter(p=>p.m.action==='user_alarm_save').length,0);
 assert.equal(new Set(f.pending.map(p=>p.m.sessionId)).size,1);assert.equal(f.pending.at(-1).m.turns.length,4);
 const run=f.box.querySelector('[data-smart-confirm]').events.click();
 await f.box.querySelector('[data-smart-confirm]').events.click();
 const req=f.pending.at(-1);assert.equal(req.m.action,'user_alarm_save');assert.equal(req.m.alarm.label,'带外卖');
 req.cb({ok:true,alarm:req.m.alarm});await run;
 assert.match(f.box.querySelector('[data-session-state]').textContent,/已设置并结束/);
 const fresh=f.submit('上午');const freshReq=f.pending.at(-1);assert.equal(freshReq.m.turns.length,0);assert.equal(freshReq.m.draft,null);freshReq.cb({ok:false,error:'请说明完整需求'});await fresh;
});
test('结束当前会话后迟到结果不能变成可保存草稿',async()=>{
 const f=fixture();const run=f.submit('明天下午三点提醒我开会'),req=f.pending[0];
 f.box.querySelector('[data-session-end]').events.click();
 req.cb({ok:true,...AlarmIntent.resolveDraft(AlarmIntent.parseDraft(req.m.text,null,req.m),req.m)});await run;
 assert.equal(f.box.querySelector('[data-smart-confirm]').hidden,true);assert.match(f.box.querySelector('[data-session-state]').textContent,/已结束/);
});
test('待确认时继续编辑立即撤下旧确认，不能误存尚未更新的草稿',async()=>{
 const f=fixture();const run=f.submit('明天下午三点提醒我开会'),req=f.pending[0];req.cb({ok:true,...AlarmIntent.resolveDraft(AlarmIntent.parseDraft(req.m.text,null,req.m),req.m)});await run;
 assert.equal(f.box.querySelector('[data-smart-confirm]').hidden,false);
 f.box.querySelector('#smart-alarm-text').value='改成下午四点';f.box.querySelector('#smart-alarm-text').events.input();
 assert.equal(f.box.querySelector('[data-smart-confirm]').hidden,true);
 await f.box.querySelector('[data-smart-confirm]').events.click();assert.equal(f.pending.length,1);
});
