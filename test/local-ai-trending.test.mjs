import test from 'node:test';import assert from 'node:assert/strict';import {createGateway} from '../local-ai/gateway.mjs';
const items=[{title:'产品发布新版本',source:'a',url:'https://example.com/a'},{title:'项目发布更新',source:'b',url:'https://example.com/b'},{title:'另外一则消息',source:'c',url:'https://example.com/c'}];
test('聚合保持原链接并保留模型未归类条目',async()=>{
 const gateway=createGateway({provider:{async generateObject({input}){assert.equal(input.items[0].url,undefined);return {groups:[{title:'软件更新',kind:'topic',indices:[1,2],reason:'标题涉及版本更新'}]};}}});
 const result=await gateway.run('trending.cluster',{items});assert.equal(result.data.groups[0].items[0].url,items[0].url);assert.equal(result.data.unassigned,1);assert.equal(result.data.groups[1].items[0].index,3);
});
test('重复归组或虚构序号被拒绝',async()=>{
 let indices=[1,1];const gateway=createGateway({provider:{async generateObject(){return {groups:[{title:'主题',kind:'topic',indices,reason:'归类'}]};}}});
 await assert.rejects(gateway.run('trending.cluster',{items}),/重复或虚构/);indices=[99];await assert.rejects(gateway.run('trending.cluster',{items}),/重复或虚构/);
});
test('完全相同标题用规则合并，不消耗模型调用',async()=>{
 const gateway=createGateway({modelEnabled:false,provider:{generateObject(){assert.fail('不应调用模型');}}});
 const result=await gateway.run('trending.cluster',{items:[items[0],{...items[1],title:items[0].title}]});assert.equal(result.source,'rules');assert.equal(result.data.groups[0].items.length,2);
});
