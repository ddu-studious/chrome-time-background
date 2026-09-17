import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
test('HTTP SSE 断开传播为网关任务取消',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'writing-http-cancel-'));const oldDir=process.env.CURSOR_BRIDGE_DATA_DIR,oldToken=process.env.LOCAL_AI_TOKEN_FILE,originalFetch=globalThis.fetch;
 process.env.CURSOR_BRIDGE_DATA_DIR=directory;process.env.LOCAL_AI_TOKEN_FILE=join(directory,'token');writeFileSync(process.env.LOCAL_AI_TOKEN_FILE,'a'.repeat(64));
 const {default:Fastify}=await import('../cursor-bridge/node_modules/fastify/fastify.js');
 const {writingRoutes,initWritingTables,initRAGTables,initHermesImportTables}=await import('../cursor-bridge/src/modules/writing/index.ts');
 const {closeDb}=await import('../cursor-bridge/src/services/database.ts');
 const app=Fastify({logger:false});let cancelled=false,submitted=false;
 globalThis.fetch=(async(url:any,opts:any)=>{
  if(!String(url).startsWith('http://127.0.0.1:19841'))return originalFetch(url,opts);
  if(String(url).endsWith('/cancel'))cancelled=true;else submitted=true;
  return {ok:true,json:async()=>({ok:true,status:'pending',jobId:'d'.repeat(32)})};
 }) as any;
 try{
  initWritingTables();initRAGTables();initHermesImportTables();await app.register(writingRoutes);await app.listen({port:0,host:'127.0.0.1'});
  const address=app.server.address() as any;const controller=new AbortController();
  const response=await originalFetch(`http://127.0.0.1:${address.port}/writing/rewrite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'固定测试文本'}),signal:controller.signal});
  await response.body!.getReader().read();controller.abort();
  const deadline=Date.now()+3000;while(!cancelled&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
  assert.equal(submitted,true);assert.equal(cancelled,true);
 }finally{await app.close();closeDb();globalThis.fetch=originalFetch;if(oldDir===undefined)delete process.env.CURSOR_BRIDGE_DATA_DIR;else process.env.CURSOR_BRIDGE_DATA_DIR=oldDir;if(oldToken===undefined)delete process.env.LOCAL_AI_TOKEN_FILE;else process.env.LOCAL_AI_TOKEN_FILE=oldToken;rmSync(directory,{recursive:true,force:true});}
});
