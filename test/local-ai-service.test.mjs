import test from 'node:test';
import assert from 'node:assert/strict';
import {renderPlist,LABEL} from '../local-ai/scripts/service.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
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
