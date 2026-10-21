// Offline deterministic replay evidence. Executes the real World/Yuka path, no browser hooks.
import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {OceanWorld} from './world.mjs';
const out=new URL('../../../output/aquarium-review-20261021/reef-3d-lab/',import.meta.url);await mkdir(out,{recursive:true});
const reports=[];
for(const seed of [1,7,73,123]){
 const w=new OceanWorld({seed});w.add('barramundi',.45);w.setPredation(true);const trace=[],events=[];
 for(let i=0;i<7200;i++){
  const before=w.stats.captures;w.step(1/60);
  if(i%6===0)trace.push({t:Number(w.time.toFixed(3)),fish:w.fish.map(f=>({id:f.id,p:f.position.toArray().map(x=>Number(x.toFixed(5))),q:f.quaternion.toArray().map(x=>Number(x.toFixed(5))),life:f.life,behavior:f.behavior}))});
  if(w.stats.captures!==before)events.push(w.events.at(-1));
 }
 reports.push({seed,seconds:120,stats:w.stats,captures:events});
 if(seed===73)await writeFile(new URL('pursuit-seed73-trace.json',out),JSON.stringify({seed,dt:1/60,sampleEvery:6,reef:false,profiles:w.fish.map(f=>f.profile),trace}));
}
const cpu=[];
for(const count of [8,20,40]){const w=new OceanWorld();while(w.fish.length<count)w.add();for(let i=0;i<120;i++)w.step(1/60);const times=[];for(let i=0;i<3600;i++){const a=performance.now();w.step(1/60);times.push(performance.now()-a);}times.sort((a,b)=>a-b);cpu.push({fish:count,reef:false,medianMs:times[1800],p95Ms:times[3420],p99Ms:times[3564]});}
await writeFile(new URL('simulation-report.json',out),JSON.stringify({note:'CPU-only synthetic run. Not GPU or browser FPS; reef off.',reports,cpu},null,2)+'\n');console.log(JSON.stringify({reports,cpu},null,2));
