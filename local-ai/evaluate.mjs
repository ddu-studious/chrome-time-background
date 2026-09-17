import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {resolve,dirname} from 'node:path';
export function check(result,scenario){
 const issues=[];const get=path=>path.split('.').reduce((value,key)=>value?.[key],result);
 if(scenario.errorIncludes){if(result.ok!==false||!String(result.error).includes(scenario.errorIncludes))issues.push('未返回预期拒绝');return issues;}
 if(result.ok!==true)issues.push(result.error||'请求失败');
 for(const [path,value] of Object.entries(scenario.equals||{}))if(JSON.stringify(get(path))!==JSON.stringify(value))issues.push(path+' 不符合预期');
 for(const path of scenario.nonEmpty||[]){const value=get(path);if(!(typeof value==='string'?value.trim().length:Array.isArray(value)?value.length:0))issues.push(path+' 为空');}
 for(const path of scenario.negative||[])if(!(typeof get(path)==='number'&&get(path)<0))issues.push(path+' 应为负数');
 return issues;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=dirname(fileURLToPath(import.meta.url));const corpus=JSON.parse(readFileSync(resolve(directory,'evals/core.json'),'utf8'));
 if(!process.argv.includes('--live')){console.log(`包含 ${corpus.cases.length} 个固定场景。使用 --live 调用本机控制面；不会创建业务数据或调用远端服务。`);}
 else{
  const token=readFileSync(resolve(directory,'.local/token'),'utf8').trim();const base='http://127.0.0.1:19841',headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
  const request=async(path,body)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers,signal:AbortSignal.timeout(7000),...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);return data;};
  const control=await request('/v1/control');const health=await request('/health');const report={at:new Date().toISOString(),version:corpus.version,model:health.model,reasoning:control.policy.reasoning,policyRevision:control.revision,results:[]};
  for(const scenario of corpus.cases){if((await request('/v1/control')).revision!==control.revision){report.invalid='评估期间控制策略变化';break;}const started=Date.now();let result,jobId;
   try{result=await request('/v1/ai/interpret',{scene:scenario.scene,input:scenario.input});jobId=result.jobId;while(result.ok&&result.status==='pending'){if(Date.now()-started>100000)throw new Error('评估超时');await new Promise(resolve=>setTimeout(resolve,500));result=await request('/v1/ai/jobs/'+jobId);}}
   catch(error){if(jobId)await request('/v1/ai/jobs/'+jobId+'/cancel',{}).catch(()=>{});result={ok:false,error:error.message};}
   const issues=check(result,scenario);report.results.push({id:scenario.id,passed:!issues.length,issues,elapsedMs:Date.now()-started,result});console.log(`${issues.length?'FAIL':'PASS'} ${scenario.id}${issues.length?'：'+issues.join('；'):''}`);
  }
  const output=resolve(directory,'.local/evaluations');mkdirSync(output,{recursive:true,mode:0o700});writeFileSync(resolve(output,'latest.json'),JSON.stringify(report,null,2),{mode:0o600});writeFileSync(resolve(output,'run-'+report.at.replace(/[:.]/g,'-')+'.json'),JSON.stringify(report,null,2),{mode:0o600,flag:'wx'});
  const passed=report.results.filter(result=>result.passed).length;console.log(`${passed}/${report.results.length} 通过，结果：${output}/latest.json`);if(report.invalid||report.results.length!==corpus.cases.length||passed!==report.results.length)process.exitCode=1;
 }
}
