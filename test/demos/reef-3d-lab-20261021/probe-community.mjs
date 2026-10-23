import {readFile,writeFile} from 'node:fs/promises';
import {OceanWorld} from './world.mjs';
import {EXTRA_FISH,EXTRA_KINDS} from './community-catalog.mjs';
import {loadFullReefFixture} from './full-reef-fixture.mjs';
import {fullReefSites} from './full-navigation.mjs';
const {nav,spatial,roadmap}=await loadFullReefFixture(),{scenarios}=JSON.parse(await readFile(new URL('./assets/navigation/full-reef-scenarios.json',import.meta.url))),dt=1/60,seconds=30,rows=[];
for(const scenario of scenarios)for(const length of [.025,.04,.06,.074]){
 nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;world.startFullDrill(scenario,length,length===.074?.45:.25);
 for(const kind of EXTRA_KINDS)if(!world.add(kind,EXTRA_FISH[kind].defaultLength))throw new Error('Mixed placement failed: '+kind);
 const previous=new Map(world.fish.map(f=>[f.id,{p:f.position.clone(),q:f.quaternion.clone(),life:f.life}]));let penetratingPoses=0,sweepViolations=0,movingTurns=0,maxPlanMs=0;const before=performance.now();
 for(let frame=0;frame<seconds/dt;frame++){
  world.step(dt);
  for(const f of world.fish){const last=previous.get(f.id);if(f.life==='alive'){
   if(!spatial.clearPose(f,f.position,f.quaternion))penetratingPoses++;
   if(last.life==='alive'&&!spatial.clearMotion(f,last.p,f.position,last.q,f.quaternion))sweepViolations++;
   if(f.kind==='clown'&&last.q.angleTo(f.quaternion)>.002&&last.p.distanceTo(f.position)>1e-5)movingTurns++;
  }last.p.copy(f.position);last.q.copy(f.quaternion);last.life=f.life;}
  maxPlanMs=Math.max(maxPlanMs,nav.maxPlanMs);
 }
 const events=world.events,row={region:scenario.id,preyLength:length,population:world.fish.length,kinds:new Set(world.fish.map(f=>f.kind)).size,penetratingPoses,sweepViolations,movingTurns,hidden:events.filter(e=>e.type==='hidden').length,searchedExit:events.filter(e=>e.type==='searched-exit').length,emerged:events.filter(e=>e.type==='emerged').length,routeRetries:world.stats.routeRetries,routeAbandons:world.stats.routeAbandons,maxPlanMs,cpuMs:performance.now()-before};rows.push(row);console.log(JSON.stringify(row));
}
const summary={cases:rows.length,allTenFishKinds:rows.every(r=>r.kinds===10),hiddenCases:rows.filter(r=>r.hidden).length,searchCases:rows.filter(r=>r.searchedExit).length,penetratingPoses:rows.reduce((n,r)=>n+r.penetratingPoses,0),sweepViolations:rows.reduce((n,r)=>n+r.sweepViolations,0),routeAbandons:rows.reduce((n,r)=>n+r.routeAbandons,0)};
await writeFile(new URL('../../../output/aquarium-review-20261023/reef-3d-v9/mixed-matrix.json',import.meta.url),JSON.stringify({dt,seconds,seed:73,summary,rows},null,2)+'\n');console.log(JSON.stringify(summary));if(summary.penetratingPoses||summary.sweepViolations||!summary.allTenFishKinds)process.exitCode=1;
