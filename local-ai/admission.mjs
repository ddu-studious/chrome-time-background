import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';import {dirname} from 'node:path';
const fail=message=>Object.assign(new Error(message),{statusCode:429});
export function createAdmission({file,now=Date.now}={}){
 const day=()=>{const d=new Date(now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 let state={day:day(),admitted:0,scenes:{}};
 if(file&&existsSync(file)){
  const saved=JSON.parse(readFileSync(file,'utf8'));
  const integer=value=>Number.isSafeInteger(value)&&value>=0;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(saved.day)||!integer(saved.admitted)||!saved.scenes||typeof saved.scenes!=='object'||Array.isArray(saved.scenes))throw new Error('AI 使用计数文件无效');
  let total=0;
  for(const [scene,row] of Object.entries(saved.scenes)){
   if(!/^[a-zA-Z0-9._-]{1,100}$/.test(scene)||['__proto__','constructor','prototype'].includes(scene)||!row||!integer(row.calls)||!integer(row.failures)||!integer(row.consecutiveFailures)||row.failures>row.calls||row.consecutiveFailures>row.failures||!integer(row.blockedUntil)||!integer(row.totalElapsedMs))throw new Error('AI 场景统计文件无效');
   if(row.latencies!==undefined&&(!Array.isArray(row.latencies)||row.latencies.length>100||row.latencies.some(value=>!integer(value))))throw new Error('AI 延迟统计文件无效');
   total+=row.calls;
  }
  if(total!==saved.admitted)throw new Error('AI 请求计数不一致');
  state=saved;
 }
 const save=next=>{if(file){mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});renameSync(file+'.tmp',file);}state=next;};
 const roll=()=>{if(state.day!==day())save({day:day(),admitted:0,scenes:{}});};
 return {
  describe(){
   roll();const snapshot=structuredClone(state);
   for(const row of Object.values(snapshot.scenes)){
    const sorted=[...(row.latencies||[])].sort((a,b)=>a-b);
    row.latency={sampleCount:sorted.length,p50:sorted.length?sorted[Math.ceil(sorted.length*.5)-1]:null,p95:sorted.length?sorted[Math.ceil(sorted.length*.95)-1]:null};
    delete row.latencies;
   }
   return snapshot;
  },
  start(scene,policy){
   roll();const previous=(Object.hasOwn(state.scenes,scene)?state.scenes[scene]:null)||{calls:0,failures:0,consecutiveFailures:0,blockedUntil:0,totalElapsedMs:0};
   if(state.admitted>=policy.dailyRequestLimit)throw fail('已达到今日 AI 请求预算，请在控制台调整或明天重试');
   if(previous.blockedUntil>now())throw fail('此 AI 场景连续失败，正在冷却，请稍后重试');
   const next=structuredClone(state);next.admitted++;next.scenes[scene]={...previous,calls:previous.calls+1};save(next);
   return {scene,day:state.day,started:now(),finished:false};
  },
  finish(ticket,ok,policy){
   if(ticket.finished)return;ticket.finished=true;roll();if(ticket.day!==state.day)return;
   const next=structuredClone(state),row=next.scenes[ticket.scene];if(!row)return;
   const elapsed=Math.max(0,now()-ticket.started);
   row.totalElapsedMs+=elapsed;row.latencies=[...(row.latencies||[]),elapsed].slice(-100);
   if(ok===true){row.consecutiveFailures=0;row.blockedUntil=0;}else if(ok===false){row.failures++;row.consecutiveFailures++;if(row.consecutiveFailures>=policy.failureThreshold)row.blockedUntil=now()+policy.cooldownMs;}
   save(next);
  }
 };
}
