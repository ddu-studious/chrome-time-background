import {writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {fixture} from './crevice-probe.mjs';
const out=new URL('../../../output/aquarium-review-20261021/reef-3d-v2/',import.meta.url);await mkdir(out,{recursive:true});
const {world,spatial,nav}=fixture(),trace=[],costs=[];let penetration=0,maxStep=0,previous=world.fish.map(f=>f.position.clone());
for(let i=0;i<1440;i++){const start=performance.now();world.step(1/60);costs.push(performance.now()-start);world.fish.forEach((f,k)=>{if(!spatial.clearPose(f,f.position,f.quaternion))penetration++;maxStep=Math.max(maxStep,f.position.distanceTo(previous[k]));previous[k].copy(f.position);});if(i%6===0)trace.push({t:world.time,fish:world.snapshot().fish});}
costs.sort((a,b)=>a-b);const report={note:'Real World + Yuka A* + visible-mesh BVH stepping. CPU-only, not a GPU or browser FPS measure.',seconds:24,dt:1/60,seed:73,penetration,maxStep,searches:nav.searches,cacheGroups:nav.cache.size,stats:world.stats,events:world.events,cpuMs:{median:costs[720],p95:costs[1368],max:costs.at(-1)}};
await writeFile(new URL('crevice-report.json',out),JSON.stringify(report,null,2)+'\n');await writeFile(new URL('crevice-trace.json',out),JSON.stringify({profiles:world.fish.map(f=>f.profile),trace}));console.log(JSON.stringify(report,null,2));
