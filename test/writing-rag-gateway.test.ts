import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
test('RAG 旧库升级、跨模型隔离及失败保留旧索引',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'rag-test-'));const oldDir=process.env.CURSOR_BRIDGE_DATA_DIR,oldToken=process.env.LOCAL_AI_TOKEN_FILE,oldFetch=globalThis.fetch;
 process.env.CURSOR_BRIDGE_DATA_DIR=directory;process.env.LOCAL_AI_TOKEN_FILE=join(directory,'token');writeFileSync(process.env.LOCAL_AI_TOKEN_FILE,'a'.repeat(64));
 const database=await import('../cursor-bridge/src/services/database.ts');
 try{
  const db=database.getDb();db.exec('CREATE TABLE writing_rag_chunks (id TEXT PRIMARY KEY, doc_id TEXT, doc_title TEXT, text TEXT, embedding TEXT, created_at INTEGER)');
  const rag=await import('../cursor-bridge/src/modules/writing/rag-service.ts');rag.initRAGTables();rag.updateRAGConfig({enabled:true});
  assert.ok((db.prepare('PRAGMA table_info(writing_rag_chunks)').all() as any[]).some(c=>c.name==='space'));
  let space='model-a:retrieval-v1:2',fail=false;
  globalThis.fetch=(async(_url:any,opts:any)=>{
    const body=JSON.parse(opts.body);assert.equal(body.scene,'writing.embed');
    if(fail)throw new Error('服务离线');
    return {ok:true,json:async()=>({ok:true,status:'ready',data:{vectors:body.input.texts.map(()=>[1,0]),space}})};
  }) as any;
  assert.ok(rag.splitTextToChunks('文'.repeat(1500)).every(chunk=>chunk.length<=200));
  await rag.indexDocument('doc','标题','原始文档');assert.equal((await rag.retrieveRelevant('查询')).length,1);
  space='model-b:retrieval-v1:2';assert.equal((await rag.retrieveRelevant('查询')).length,0);
  fail=true;await assert.rejects(rag.indexDocument('doc','新标题','更新文档'),/离线/);
  assert.equal((db.prepare('SELECT text FROM writing_rag_chunks WHERE doc_id = ?').get('doc') as any).text,'原始文档');
 }finally{database.closeDb();globalThis.fetch=oldFetch;if(oldDir===undefined)delete process.env.CURSOR_BRIDGE_DATA_DIR;else process.env.CURSOR_BRIDGE_DATA_DIR=oldDir;if(oldToken===undefined)delete process.env.LOCAL_AI_TOKEN_FILE;else process.env.LOCAL_AI_TOKEN_FILE=oldToken;rmSync(directory,{recursive:true,force:true});}
});
