import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
test('任务相对日期由程序计算，闰年与年末跨日正确',async()=>{
 const gateway=createGateway({provider:{async generateObject(){return {title:'写周报',description:'',priority:'high',dayOffset:1};}}});
 assert.equal((await gateway.run('task.draft',{text:'明天写周报',today:'2026-12-31'})).data.dueDate,'2027-01-01');
 assert.equal((await gateway.run('task.draft',{text:'明天写周报',today:'2028-02-28'})).data.dueDate,'2028-02-29');
});
test('拒绝日期冲突和非法结果，不返回可保存任务',async()=>{
 let raw={title:'写周报',description:'',priority:'high',dayOffset:1,dueDate:'2026-12-31'};
 const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 await assert.rejects(gateway.run('task.draft',{text:'任务',today:'2026-12-30'}),/冲突/);
 raw={title:'写周报',description:'',priority:'high',dueDate:'2026-02-30'};await assert.rejects(gateway.run('task.draft',{text:'任务',today:'2026-01-01'}),/日期无效/);
});
test('未指定日期保持空值，澄清不生成任务',async()=>{
 let raw={title:'阅读',description:'',priority:'none'};const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 assert.equal((await gateway.run('task.draft',{text:'阅读',today:'2026-09-12'})).data.dueDate,'');
 raw={question:'请使用日程表单指定时间。'};assert.equal((await gateway.run('task.draft',{text:'下午三点开会',today:'2026-09-12'})).data.title,undefined);
});
