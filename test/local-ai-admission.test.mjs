import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createAdmission} from '../local-ai/admission.mjs';import {createGateway} from '../local-ai/gateway.mjs';
const policy={dailyRequestLimit:2,failureThreshold:2,cooldownMs:1000};
test('每日预算在重启后保留，按本机日期重置',t=>{
 const dir=mkdtempSync(join(tmpdir(),'ai-usage-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'usage.json');let now=new Date(2026,8,12,10).getTime();
 const first=createAdmission({file,now:()=>now});first.start('test',policy);const restored=createAdmission({file,now:()=>now});restored.start('test',policy);assert.throws(()=>restored.start('test',policy),/预算/);
 now+=86400000;assert.doesNotThrow(()=>restored.start('test',policy));assert.equal(restored.describe().admitted,1);
});
test('连续失败进入冷却，用户取消不重置失败状态',()=>{
 let now=100000;const usage=createAdmission({now:()=>now}),p={...policy,dailyRequestLimit:20};
 usage.finish(usage.start('test',p),false,p);usage.finish(usage.start('test',p),null,p);usage.finish(usage.start('test',p),false,p);
 assert.throws(()=>usage.start('test',p),/冷却/);now+=1001;usage.finish(usage.start('test',p),true,p);assert.equal(usage.describe().scenes.test.consecutiveFailures,0);
});
test('规则不消耗预算，模型输出校验失败纳入故障计数',async()=>{
 const usage=createAdmission();const gateway=createGateway({admission:usage,provider:{async generateObject(){return {action:'execute-code'};}}});
 await gateway.run('music.intent',{text:'暂停'});assert.equal(usage.describe().admitted,0);
 await assert.rejects(gateway.run('music.intent',{text:'来点好听的'}));assert.equal(usage.describe().admitted,1);assert.equal(usage.describe().scenes['music.intent'].failures,1);
});
