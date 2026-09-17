import test from 'node:test';import assert from 'node:assert/strict';import {check} from '../local-ai/evaluate.mjs';
test('评估不能把错误方向、空引用或请求失败判为通过',()=>{
 assert.ok(check({ok:true,intent:{delta:.1}},{negative:['intent.delta']}).length);
 assert.ok(check({ok:true,data:{citations:[]}},{nonEmpty:['data.citations']}).length);
 assert.ok(check({ok:false,error:'离线'},{equals:{'data.value':1}}).length);
});
test('拒绝场景仅接受指定错误，不能用任意异常代替',()=>{
 assert.deepEqual(check({ok:false,error:'请提供正文或字幕'},{errorIncludes:'正文或字幕'}),[]);
 assert.ok(check({ok:false,error:'网络错误'},{errorIncludes:'正文或字幕'}).length);
});
