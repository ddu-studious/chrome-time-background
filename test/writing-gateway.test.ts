import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {QwenClient} from '../cursor-bridge/src/services/qwen-client.ts';
test('写作 Bridge 固定走本机场景，忽略旧供应商参数，保持 token/done 协议',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'writing-gateway-'));const file=join(dir,'token');writeFileSync(file,'a'.repeat(64));
 const oldToken=process.env.LOCAL_AI_TOKEN_FILE,oldFetch=globalThis.fetch;process.env.LOCAL_AI_TOKEN_FILE=file;
 const calls:any[]=[];
 globalThis.fetch=(async(url:any,opts:any)=>{calls.push({url,body:opts.body&&JSON.parse(opts.body)});return {ok:true,json:async()=>({ok:true,status:'ready',data:{content:'改写结果'}})};}) as any;
 try{
  const client=new QwenClient('legacy',{baseURL:'https://invalid.example'});const chunks=[];
  for await(const chunk of client.streamComplete('润色','测试文本',{model:'legacy-model'}))chunks.push(chunk);
  assert.equal(calls[0].url,'http://127.0.0.1:19841/v1/ai/interpret');assert.deepEqual(calls[0].body,{scene:'writing.assist',input:{context:'测试文本',guidance:'润色'}});
  assert.deepEqual(chunks.map(c=>c.type),['token','done']);assert.equal(chunks[0].content,'改写结果');
 }finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.LOCAL_AI_TOKEN_FILE;else process.env.LOCAL_AI_TOKEN_FILE=oldToken;rmSync(dir,{recursive:true,force:true});}
});

test('写作请求取消后撤销已提交的网关任务',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'writing-cancel-'));const file=join(dir,'token');writeFileSync(file,'b'.repeat(64));
 const oldToken=process.env.LOCAL_AI_TOKEN_FILE,oldFetch=globalThis.fetch;process.env.LOCAL_AI_TOKEN_FILE=file;
 const controller=new AbortController(),calls:string[]=[];
 globalThis.fetch=(async(url:any)=>{calls.push(String(url));if(calls.length===1){controller.abort();return {ok:true,json:async()=>({ok:true,status:'pending',jobId:'c'.repeat(32)})};}return {ok:true,json:async()=>({ok:true,status:'cancelled'})};}) as any;
 try{await assert.rejects(new QwenClient().complete('润色','内容',{signal:controller.signal}));assert.ok(calls[1].endsWith('/'+'c'.repeat(32)+'/cancel'));}
 finally{globalThis.fetch=oldFetch;if(oldToken===undefined)delete process.env.LOCAL_AI_TOKEN_FILE;else process.env.LOCAL_AI_TOKEN_FILE=oldToken;rmSync(dir,{recursive:true,force:true});}
});
