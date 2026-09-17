import test from 'node:test';import assert from 'node:assert/strict';
import {createGateway} from '../local-ai/gateway.mjs';
const candidates=[{title:'MySQL 锁',domain:'example.com',summary:'行锁介绍'}];
test('书签摘要剔除无关输入并验证输出，不通过时不返回内容',async()=>{
 let output={summary:'介绍 MySQL 行锁与事务。',tags:['mysql','事务']};
 const gateway=createGateway({provider:{async generateObject({input}){assert.equal(input.apiKey,undefined);return output;}}});
 assert.equal((await gateway.run('bookmark.summary',{title:'MySQL',content:'讨论事务锁',apiKey:'secret'})).data.tags[0],'mysql');
 output={summary:'text',tags:['ok'],url:'https://evil'};
 await assert.rejects(gateway.run('bookmark.summary',{title:'MySQL',content:'讨论事务锁'}),/格式无效/);
});
test('精排拒绝虚构或重复候选，关闭策略阻断外呼',async()=>{
 let output={results:[{index:2,score:99,reason:'不存在'}]};
 const provider={async generateObject(){return output;}};
 const input={query:'锁',candidates,limit:1};
 const gateway=createGateway({provider});await assert.rejects(gateway.run('bookmark.rerank',input),/无效/);
 output={results:[{index:1,score:80,reason:'匹配'}]};
 assert.equal((await gateway.run('bookmark.rerank',input)).data.results[0].index,1);
 const closed=createGateway({provider,disabledScenes:['bookmark.rerank']});await assert.rejects(closed.run('bookmark.rerank',input),/关闭/);
});
