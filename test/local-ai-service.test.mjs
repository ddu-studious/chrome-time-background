import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlist,LABEL,memoryHealth} from '../local-ai/scripts/service.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script = fileURLToPath(new URL('../local-ai/service.sh', import.meta.url));
test('统一脚本从任意目录提供帮助和参数校验，不执行服务操作', () => {
 for (const flag of ['help', '-h', '--help']) {
  const result=spawnSync('/bin/bash',[script,flag],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  for(const command of ['start','restart','stop','shutdown','status','uninstall']) assert.ok(result.stdout.includes(command));
  assert.match(result.stdout,/下次登录仍自动启动/);
 }
 for(const args of [['typo'],['restart','unexpected']]) {
  const result=spawnSync('/bin/bash',[script,...args],{cwd:tmpdir(),encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/help/);
 }
});
test('记忆状态检查区分旧服务、损坏数据库和可用接口', async () => {
 for(const [status,data,ok,pattern] of [
  [404,{error:'接口不存在'},false,/restart/],
  [503,{error:'记忆库无法打开'},false,/记忆库无法打开/],
  [200,{ok:true,revision:0},true,/已就绪/],
  [200,{ok:true},false,/异常/]
 ]) {
  const result=await memoryHealth(async (url,options)=>{
   assert.equal(new URL(url).pathname,'/v1/memory');assert.equal(options.headers.Authorization,'Bearer fixture');
   return {status,ok:status===200,json:async()=>data};
  },'fixture');
  assert.equal(result.ok,ok);assert.match(result.message,pattern);
 }
 const failed=await memoryHealth(async()=>{throw new Error('offline');},'fixture');
 assert.equal(failed.ok,false);assert.match(failed.message,/无法读取/);
});
test('用户守护配置可解析，特殊路径不执行shell，环境变量仅允许业务配置',{skip:process.platform!=='darwin'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'ai-service-test-'));
 try {
  const file=join(dir,'test.plist');writeFileSync(file,renderPlist({node:'/path with space/node',root:'/tmp/a&b/<project>',environment:{LM_STUDIO_TOKEN:'a<&"',LOCAL_AI_SPEECH_MODEL:'/tmp/voice model.bin',HOME:'/invalid',LOCAL_AI_PORT:'9999'}}));
  const result=spawnSync('/usr/bin/plutil',['-convert','json','-o','-',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  const value=JSON.parse(result.stdout);assert.equal(value.Label,LABEL);assert.deepEqual(value.ProgramArguments,['/path with space/node','/tmp/a&b/<project>/server.mjs']);
  assert.equal(value.KeepAlive,true);assert.equal(value.RunAtLoad,true);assert.equal(value.ThrottleInterval,10);
  assert.deepEqual(value.EnvironmentVariables,{LM_STUDIO_TOKEN:'a<&"',LOCAL_AI_SPEECH_MODEL:'/tmp/voice model.bin'});
 } finally {rmSync(dir,{recursive:true,force:true});}
});
