import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
const input={text:'明天下午三点开会一小时',today:'2026-12-31',selectedDate:'2026-12-31'};
test('日程相对日期和结束时间由程序计算',async()=>{
 const gateway=createGateway({provider:{async generateObject(){return {name:'开会',dayOffset:1,startTime:'15:00',durationMinutes:60};}}});
 const data=(await gateway.run('schedule.draft',input)).data;assert.equal(data.note,'');assert.equal(data.date,'2027-01-01');assert.equal(data.endTime,'16:00');
});
test('缺少时间可以追问，不猜默认时长',async()=>{
 const gateway=createGateway({provider:{async generateObject(){return {question:'会议持续多久？'};}}});const result=await gateway.run('schedule.draft',input);assert.equal(result.data.startTime,undefined);
});
test('拒绝非法时间、跨日和冲突结束字段',async()=>{
 let raw;const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 for(const patch of [{startTime:'25:00',durationMinutes:60},{startTime:'23:30',durationMinutes:60},{startTime:'15:00',durationMinutes:60,endTime:'16:00'},{startTime:'15:00',endTime:'14:00'}]){raw={name:'开会',note:'',...patch};await assert.rejects(gateway.run('schedule.draft',input));}
});

test('缺少时段或时长先本地追问，不允许模型补猜',async()=>{
 const gateway=createGateway({provider:{generateObject(){assert.fail('不应调用模型猜测');}}});
 for(const text of ['明天七点开会','明天下午三点开会']){const result=await gateway.run('schedule.draft',{...input,text});assert.equal(result.source,'rules');assert.ok(result.data.question);}
});
