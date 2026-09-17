import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {createGateway} from '../local-ai/gateway.mjs';
const input={period:'week',label:'本周',overview:'共1条活动',items:[{id:'1',day:'星期一',title:'读文档',detail:'MySQL'}]};
test('活动摘要仅接受输入来源，不能伪造证据',async()=>{
 let raw={summary:'本周阅读 MySQL 文档。',evidenceIds:['1']};
 const gateway=createGateway({provider:{model:'fixture',async generateObject({input: sent}){assert.equal(sent.cookie,undefined);return raw;}}});
 const result=await gateway.run('activity.summary',{...input,cookie:'private'});
 assert.equal(result.data.sources[0].detail,'MySQL');
 raw={summary:'text',evidenceIds:['missing']};await assert.rejects(gateway.run('activity.summary',input),/来源无效/);
});
test('活动周报模型不可用时返回本地摘要，成功时标明抽样范围',async()=>{
 let fail=true,received;
 const context=vm.createContext({window:{SceneAI:{async run(scene,body){received={scene,body};if(fail)throw new Error('已关闭');return {summary:'本周记录了学习活动。',sources:body.items.slice(0,1),model:'local'};}}},console,Date});
 vm.runInContext(readFileSync(new URL('../js/activity-logger.js',import.meta.url),'utf8'),context);
 const logger=vm.runInContext('activityLogger',context);
 logger.getHybridWeeklyTimeline=async()=>({totalItems:25,weekLabel:'本周',stats:{notes:25},days:[{dayLabel:'周一',weekDay:'一',items:Array.from({length:25},(_,i)=>({title:'阅读'+i,targetTitle:'文档'}))}]});
 logger._cacheWeeklySummary=async()=>{};
 const fallback=await logger.generateWeeklySummary();assert.equal(fallback.ok,false);assert.match(fallback.fallback,/25/);
 fail=false;const success=await logger.generateWeeklySummary();assert.equal(success.ok,true);assert.equal(received.scene,'activity.summary');assert.equal(received.body.items.length,20);assert.match(success.summary,/前 20 条/);
});
