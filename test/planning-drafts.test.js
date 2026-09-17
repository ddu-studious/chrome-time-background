const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element{constructor(){this.value='';this.hidden=false;this.events={};this.nodes={};}querySelector(key){return this.nodes[key] ||= new Element();}addEventListener(key,fn){this.events[key]=fn;}dispatchEvent(){}remove(){}}
function load(kind,data){
 const task=kind==='task',ids=task?['sidebar-task-title','sidebar-task-text','sidebar-task-priority','sidebar-task-due']:['sch-plan-name','sch-plan-note','sch-plan-date','sch-plan-start','sch-plan-end'];
 const nodes=Object.fromEntries(ids.map(id=>['#'+id,new Element()]));let box;
 nodes['#'+ids[0]].parentElement={before(value){box=value;}};
 const root={querySelector:key=>nodes[key]||null,isConnected:true,classList:{contains:()=>false}};
 const context={window:{SceneAI:{run:async()=>data}},document:{createElement:()=>new Element()},AbortController,Intl,Date,JSON,Event,MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/'+(task?'task-draft':'schedule-draft')+'.js'),'utf8'),context);
 context.window[task?'TaskDraft':'ScheduleDraft'].mount(root,false);return {nodes,box,root};
}
test('任务草稿只填表，不保存，手动修改后拒绝旧草稿覆盖',async()=>{
 const f=load('task',{title:'周报',description:'整理进展',priority:'high',dueDate:'2027-01-01'});f.box.querySelector('input').value='明天写周报';
 await f.box.querySelector('[data-generate]').events.click();assert.equal(f.nodes['#sidebar-task-title'].value,'');
 f.nodes['#sidebar-task-title'].value='手动标题';f.box.querySelector('[data-apply]').events.click();assert.equal(f.nodes['#sidebar-task-title'].value,'手动标题');assert.match(f.box.querySelector('p').textContent,/修改/);
});
test('日程草稿填入日期和时段，保留原保存动作',async()=>{
 const f=load('schedule',{name:'开会',note:'准备资料',date:'2027-01-01',startTime:'15:00',endTime:'16:00'});f.box.querySelector('input').value='明天下午三点开会一小时';
 await f.box.querySelector('[data-generate]').events.click();assert.equal(f.nodes['#sch-plan-name'].value,'');
 f.box.querySelector('[data-apply]').events.click();assert.equal(f.nodes['#sch-plan-name'].value,'开会');assert.equal(f.nodes['#sch-plan-date'].value,'2027-01-01');assert.equal(f.nodes['#sch-plan-end'].value,'16:00');
});
