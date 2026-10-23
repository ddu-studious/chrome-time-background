// Find representative starts on the unmodified visible mesh; no simulated outcomes are used.
import {Vector3} from 'three';
import {writeFile} from 'node:fs/promises';
import {loadFullReefFixture} from './full-reef-fixture.mjs';
import {profile} from './catalog.mjs';
const {nav,spatial}=await loadFullReefFixture();
const fish={profile:profile('small','clown',.04),position:new Vector3(),direction:new Vector3(1,0,0)},pred={profile:profile('pred','barramundi',.25),position:new Vector3(),direction:new Vector3(1,0,0)};
const small=nav.graphFor(fish),large=nav.graphFor({profile:profile('largest','barramundi',.45)}),regions=[['arch','中部石拱',-.27,.28],['left','左礁侧缝',-.82,-.30],['right','右礁缝隙',.3,.82]],result=[];
for(const [id,name,minX,maxX] of regions){
 const possible=small.points.map((p,i)=>({p,i})).filter(v=>v.p.x>=minX&&v.p.x<=maxX&&v.p.y<.38&&small.clearances[v.i]>.035&&small.clearances[v.i]<.075);
 let found=null;
 for(const {p:cover,i} of possible){
  const near=small.points.filter(p=>p.distanceTo(cover)>.13&&p.distanceTo(cover)<.25&&nav.clearPoint(pred,p));
  for(const start of near.slice(0,20)){
   fish.position.copy(start);
   const threats=large.points.filter(p=>p.distanceTo(start)>.32&&p.distanceTo(start)<.95&&p.y<1.1&&spatial.lineOfSight(p,start)&&!spatial.lineOfSight(p,cover)).sort((a,b)=>a.distanceTo(start)-b.distanceTo(start));
   for(const at of threats.slice(0,8)){pred.position.copy(at);pred.direction.copy(start).sub(at).normalize();const refuge=nav.refuge(fish,pred),detour=nav.searchExit(pred,start);if(!refuge||refuge.point.x<minX||refuge.point.x>maxX||refuge.clearance>.075||!detour||detour.path.length<2)continue;found={id,name,prey:start.toArray(),predator:at.toArray(),referenceCover:refuge.point.toArray(),clearance:refuge.clearance,sourceNode:refuge.nodeId};break;}
   if(found)break;
  }
  if(found)break;
 }
 console.log(id,found);if(found)result.push(found);
}
await writeFile(new URL('./assets/navigation/full-reef-scenarios.json',import.meta.url),JSON.stringify({version:1,note:'Representative spawn pairs selected for visible threat + reachable cover + non-direct predator route; no outcome filtering.',scenarios:result},null,2)+'\n');
