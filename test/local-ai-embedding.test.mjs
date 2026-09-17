import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {LMStudioProvider} from '../local-ai/provider.mjs';import {createGateway} from '../local-ai/gateway.mjs';
test('Nomic 查询和文档使用不同前缀，校验向量排序与维度',async()=>{
 const p=new LMStudioProvider();let sent;
 p.request=async(path,body)=>{sent={path,body};return {data:[{index:1,embedding:[0,1]},{index:0,embedding:[1,0]}]};};
 const result=await p.embed({texts:['锁','事务'],purpose:'query',model:'text-embedding-nomic-embed-text-v1.5'});
 assert.equal(sent.path,'/v1/embeddings');assert.equal(sent.body.input[0],'search_query: 锁');assert.deepEqual(result.vectors,[[1,0],[0,1]]);
 await p.embed({texts:['锁','事务'],purpose:'document',model:'text-embedding-nomic-embed-text-v1.5'});assert.equal(sent.body.input[0],'search_document: 锁');
 p.request=async()=>({data:[{index:0,embedding:[NaN]}]});await assert.rejects(p.embed({texts:['x'],purpose:'query',model:'m'}),/格式/);assert.equal(p.busy,false);
});
test('向量场景遵守开关并拒绝过长输入',async()=>{
 const gateway=createGateway({provider:{embed(){assert.fail('不能外呼');}},disabledScenes:['bookmark.embed']});
 await assert.rejects(gateway.run('bookmark.embed',{texts:['x'],purpose:'query'}),/关闭/);
 await assert.rejects(gateway.run('bookmark.embed',{texts:['x'.repeat(3000)],purpose:'document'}),/过长/);
});
test('同维度不同模型向量不能混用，旧无标识向量也不能参与排序',()=>{
 const context=vm.createContext({console,Map,Float32Array,window:{}});vm.runInContext(readFileSync(new URL('../js/bookmark-rag.js',import.meta.url),'utf8'),context);
 const rag=vm.runInContext('new BookmarkRAG()',context);rag.settings={enabled:true,folderIds:['folder']};assert.equal(rag.isConfigured(),true);rag.bookmarks=[{id:'1',status:'active'},{id:'2',status:'active'},{id:'3',status:'active'}];
 const vector=space=>Object.assign(new Float32Array([1,0]),space?{space}:{});
 rag._vectorMap.set('1',vector('model-a:retrieval-v1:2'));rag._vectorMap.set('2',vector('model-b:retrieval-v1:2'));rag._vectorMap.set('3',vector());
 assert.deepEqual(Array.from(rag.vectorSearch(vector('model-a:retrieval-v1:2')),row=>row.id),['1']);
});
