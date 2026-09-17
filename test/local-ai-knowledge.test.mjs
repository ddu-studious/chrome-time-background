import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
const input={question:'什么是行锁？',sources:[{id:'a',title:'数据库文档',url:'https://example.com/mysql',content:'行锁作用于记录，可减少并发事务之间的冲突。'}]};
test('知识答案只引用给定来源，URL不交给模型生成',async()=>{
 const gateway=createGateway({provider:{async generateObject({input:data}){assert.equal(data.sources[0].url,undefined);return {answer:'行锁作用于记录。',insufficient:false,citations:[{id:'a',quote:'行锁作用于记录'}]};}}});
 const result=await gateway.run('knowledge.answer',input);assert.equal(result.data.citations[0].url,input.sources[0].url);
});
test('拒绝伪造来源与非原文引用，资料不足可明确返回',async()=>{
 let raw;const gateway=createGateway({provider:{async generateObject(){return raw;}}});
 for(const citation of [{id:'missing',quote:'行锁'},{id:'a',quote:'锁住整个数据库'}]){raw={answer:'text',insufficient:false,citations:[citation]};await assert.rejects(gateway.run('knowledge.answer',input),/无法核对/);}
 raw={answer:'资料没有说明隔离级别。',insufficient:true,citations:[]};assert.equal((await gateway.run('knowledge.answer',input)).data.insufficient,true);
});
test('危险来源链接和空证据在调用前拒绝',async()=>{
 const gateway=createGateway({provider:{generateObject(){assert.fail('不能调用');}}});
 await assert.rejects(gateway.run('knowledge.answer',{...input,sources:[{...input.sources[0],url:'javascript:alert(1)'}]}),/链接无效/);
 await assert.rejects(gateway.run('knowledge.answer',{...input,sources:[]}),/输入无效/);
});
