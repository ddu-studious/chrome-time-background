import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadFullReefFixture} from './full-reef-fixture.mjs';
import {fullReefSites} from './full-navigation.mjs';
import {OceanWorld} from './world.mjs';
const {nav,spatial,roadmap}=await loadFullReefFixture();
const {scenarios}=JSON.parse(await readFile(new URL('./assets/navigation/full-reef-scenarios.json',import.meta.url),'utf8'));
const rows=[],traces={};
for(const scene of scenarios)for(const preyLength of [.025,.04,.06,.074])for(const predatorLength of [.18,.25,.45]){
 nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;
 const start=performance.now();world.startFullDrill(scene,preyLength,predatorLength);const eligible=world.canEat(world.fish[1],world.fish[0]);const last=world.fish.map(f=>f.position.clone()),trace=[];let penetrations=0,maxStep=0,vertical=0,prevRouteCount=0;
 for(let i=0;i<1440;i++){world.step(1/60);for(let k=0;k<world.fish.length;k++){const f=world.fish[k];if(f.life==='alive'){if(!spatial.clearPose(f,f.position,f.quaternion))penetrations++;maxStep=Math.max(maxStep,last[k].distanceTo(f.position));}last[k].copy(f.position);}if(i%6===0)trace.push({t:world.time,fish:world.snapshot().fish});}
 const events=world.events;const kinds=Object.fromEntries(['hidden','emerged','searched-exit','capture','escape'].map(type=>[type,events.filter(e=>e.type===type).length]));
 const firstShelter=events.find(e=>e.type==='refuge');const routeLength=kind=>{const event=events.find(e=>e.type==='route'&&e.kind===kind);if(!event)return null;let last=kind==='shelter'?scene.prey:scene.predator,sum=0;for(const p of event.points){sum+=Math.hypot(p[0]-last[0],p[1]-last[1],p[2]-last[2]);last=p;}return sum;};
 const row={shelterNode:firstShelter?.nodeId??null,shelterClearance:firstShelter?.clearance??null,preyRouteM:routeLength('shelter'),predatorRouteM:routeLength('search'),region:scene.id,preyLength,predatorLength,eligible,...kinds,penetrations,maxStep,blocked:world.stats.blocked,hunts:world.stats.hunts,searches:nav.searches,maxPlanMs:nav.maxPlanMs,cpuTotalMs:performance.now()-start};rows.push(row);
 if(preyLength===.04&&predatorLength===.25)traces[scene.id]={events,trace};
 console.log(JSON.stringify(row));
}
const out=new URL('../../../output/aquarium-review-20261021/reef-3d-v3/',import.meta.url);await mkdir(out,{recursive:true});await writeFile(new URL('size-matrix.json',out),JSON.stringify({seconds:24,dt:1/60,seed:73,nodes:roadmap.nodes.length,edges:roadmap.edges.length,rows},null,2)+'\n');await writeFile(new URL('representative-traces.json',out),JSON.stringify(traces));
