/** Real local-model smoke test with temporary SQLite data and an ephemeral HTTP port. */
import {mkdtempSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
const directory=mkdtempSync(join(tmpdir(),'writing-http-smoke-'));
process.env.CURSOR_BRIDGE_DATA_DIR=directory;
const {default:Fastify}=await import('fastify');
const {closeDb}=await import('../src/services/database.js');
const {writingRoutes,initWritingTables,initRAGTables,initHermesImportTables}=await import('../src/modules/writing/index.js');
const {updateWritingConfig}=await import('../src/modules/writing/service.js');
const app=Fastify({logger:false});
try{
 initWritingTables();initRAGTables();initHermesImportTables();updateWritingConfig({enabled:true,cacheEnabled:false,searchEnhanced:false});
 await app.register(writingRoutes);await app.listen({port:0,host:'127.0.0.1'});
 const address=app.server.address();if(!address||typeof address==='string')throw new Error('HTTP address unavailable');
 const start=Date.now();const response=await fetch(`http://127.0.0.1:${address.port}/writing/rewrite`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'今天我阅读了数据库事务文档。'}),signal:AbortSignal.timeout(110000)});
 const body=await response.text();
 const events=[...body.matchAll(/^event: (.+)$/gm)].map(match=>match[1]);
 if(!response.ok||events.includes('error')||!events.includes('token')||!events.includes('done'))throw new Error('Writing SSE smoke failed: '+body.slice(0,500));
 console.log(JSON.stringify({status:response.status,events,elapsedMs:Date.now()-start,isolatedDatabase:true}));
}finally{await app.close();closeDb();rmSync(directory,{recursive:true,force:true});}
