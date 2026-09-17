import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
const input={kind:'transcript',title:'测试视频',text:'00:01 事务用于保证一组操作的一致性。00:10 行锁作用于记录。'};
test('正文提要包含可核对片段，不能只凭标题生成',async()=>{
 let calls=0;const gateway=createGateway({provider:{async generateObject(){calls++;return {overview:'介绍事务和行锁。',points:[{text:'行锁作用于记录',quote:'行锁作用于记录'}],questions:['事务用于什么？']};}}});
 const result=await gateway.run('content.digest',input);assert.equal(result.data.sourceCharacters,input.text.length);
 await assert.rejects(gateway.run('content.digest',{...input,text:''}),/正文或字幕/);assert.equal(calls,1);
});
test('非输入片段引用被拒绝',async()=>{
 const gateway=createGateway({provider:{async generateObject(){return {overview:'摘要',points:[{text:'编造',quote:'不存在的台词'}],questions:[]};}}});
 await assert.rejects(gateway.run('content.digest',input),/无法核对/);
});
