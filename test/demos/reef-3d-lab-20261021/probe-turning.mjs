// Node-only comparison against this round's frozen, SHA-verified V7 World.
// This fixture is never included in the browser bundle or served by the demo.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vector3} from 'three';
import {OceanWorld} from './world.mjs';
import {ReefSpatial} from './spatial.mjs';
const out=new URL('../../../output/aquarium-review-20261023/reef-3d-v8/',import.meta.url),root=new URL('./',import.meta.url);
const baseline=JSON.parse(await readFile(new URL('baseline-build-info.json',out),'utf8'));
const sha=source=>createHash('sha256').update(source).digest('hex');
const source=await readFile(new URL('before-world-mjs.txt',out),'utf8');
if(sha(source)!==baseline.sources['world.mjs'])throw new Error('Unverified baseline source');
for(const file of ['fish-motion.mjs','route-following.mjs','fish-envelope.mjs'])if(sha(await readFile(new URL(file,root)))!==baseline.sources[file])throw new Error('Shared baseline dependency changed: '+file);
let imports=0;
const moduleSource=source.replace(/from '([^']+)'/g,(_,path)=>{imports++;return `from '${path.startsWith('.')?new URL(path,root).href:import.meta.resolve(path)}'`;});
if(imports!==8)throw new Error('Baseline import contract changed');
const {OceanWorld:PreviousWorld}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
function run(World){
 const spatial=new ReefSpatial(),world=new World({empty:true,spatial}),dt=1/60;
 world.navigation={version:1,isFull:true,sites:{y:0},contains:()=>true,clearPoint:()=>true,clearEdge:()=>true,wander:()=>null};
 const fish=world.add('clown',.074,{position:new Vector3(-.38,.4,0)});fish.goalAt=1000;
 world.setRoute(fish,[[-.15,.4,0],[-.15,.4,.22],[.08,.4,.22],[.08,.4,-.22],[.3,.4,-.22],[.3,.4,0]].map(p=>new Vector3(...p)),'shelter');
 const previousVelocity=new Vector3(),trace=[];let maxAcceleration=0,maxRate=0,movingTurns=0,arrived=false;
 for(let i=0;i<1800&&!arrived;i++){
  const before=fish.quaternion.clone(),position=fish.position.clone();world.step(dt);
  const delta=fish.quaternion.clone().multiply(before.invert());if(delta.w<0)delta.set(-delta.x,-delta.y,-delta.z,-delta.w);
  const vector=new Vector3(delta.x,delta.y,delta.z),sine=vector.length(),angle=2*Math.atan2(sine,Math.max(0,delta.w));
  const velocity=sine>1e-10?vector.multiplyScalar(angle/(sine*dt)):vector.set(0,0,0);
  maxAcceleration=Math.max(maxAcceleration,velocity.clone().sub(previousVelocity).length()/dt);maxRate=Math.max(maxRate,velocity.length());
  if(velocity.length()>.1&&position.distanceTo(fish.position)>1e-5)movingTurns++;
  previousVelocity.copy(velocity);arrived=world.events.some(e=>e.type==='hidden');
  if(i%6===0)trace.push({time:world.time,position:fish.position.toArray(),turnVelocity:velocity.toArray(),bend:fish.bend});
 }
 spatial.dispose();return {arrived,seconds:world.time,maxRate,maxAcceleration,movingTurns,trace};
}
const before=run(PreviousWorld),after=run(OceanWorld),result={fixture:'open-water authored S route; 7.4 cm; 1/60 s; seed 73',beforeSha256:baseline.sources['world.mjs'],before,after};
await writeFile(new URL('turning-comparison.json',out),JSON.stringify(result,null,2)+'\n');
const ecology=World=>[1,7,73,123].map(seed=>{const world=new World({seed});world.add('barramundi',.45);world.setPredation(true);for(let i=0;i<7200;i++)world.step(1/60);return {seed,seconds:120,...world.stats};});
await writeFile(new URL('predation-comparison.json',out),JSON.stringify({before:ecology(PreviousWorld),after:ecology(OceanWorld)},null,2)+'\n');
console.log(JSON.stringify({before:{...before,trace:undefined},after:{...after,trace:undefined}},null,2));
if(!before.arrived||!after.arrived||after.maxAcceleration>18.00001||after.maxRate>4.00001)process.exitCode=1;
