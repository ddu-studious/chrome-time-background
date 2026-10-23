import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Quaternion,Vector3} from 'three';
import {loadFullReefFixture} from '../full-reef-fixture.mjs';
import {fullReefSites,validateRoadmap} from '../full-navigation.mjs';
import {OceanWorld} from '../world.mjs';
import {profile} from '../catalog.mjs';
const fixture=await loadFullReefFixture(),{scenarios}=JSON.parse(await readFile(new URL('../assets/navigation/full-reef-scenarios.json',import.meta.url),'utf8'));
test('full reef roadmap is bounded and attested to exact source geometry and baker',async()=>{
 const data=fixture.roadmap;assert.equal(data.nodes.length,6636);assert.equal(data.upstreamNodes,154);assert.ok(data.edges.length<40000);
 for(const [file,hash] of Object.entries(data.sources))assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),hash,file);
 assert.throws(()=>validateRoadmap({...data,version:99}));assert.throws(()=>validateRoadmap({...data,nodes:[[NaN,0,0,.1]]}));assert.throws(()=>validateRoadmap({...data,edges:[[0,99999,.1,.1]]}));
});
test('size masks are nested and cached clearances agree with live BVH queries',()=>{
 const {nav,roadmap,spatial}=fixture;nav.configure(fullReefSites(roadmap,0));const small={profile:profile('s','clown',.025)},big={profile:profile('b','clown',.074)},pred={profile:profile('p','barramundi',.45)},a=nav.graphFor(small),b=nav.graphFor(big),c=nav.graphFor(pred);
 assert.ok(a.points.length>b.points.length&&b.points.length>c.points.length);const ids=new Set(a.sourceIds);for(const id of c.sourceIds)assert.ok(ids.has(id));
 for(let i=0;i<b.points.length;i+=71)assert.equal(spatial.clearPose(nav.proxy(big),b.points[i],new Quaternion(),1.08),true);
 for(let i=0;i<b.points.length-1;i+=89){const p=b.points[i],q=b.points[i+1];if(!nav.clearEdge(big,p,q))continue;for(let k=0;k<=10;k++)assert.equal(spatial.clearPose(nav.proxy(big),p.clone().lerp(q,k/10),new Quaternion(),1.08),true);}
});
for(const scenario of scenarios)for(const [small,big] of [[.025,.18],[.04,.25],[.074,.45]])test(`${scenario.id}: real 3D reef stepping ${small}/${big} has shelter, search and no penetration`,()=>{
 const {nav,spatial,roadmap}=fixture;nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;world.startFullDrill(scenario,small,big);let maxStep=0;const previous=world.fish.map(f=>f.position.clone());
 for(let i=0;i<1440;i++){world.step(1/60);world.fish.forEach((f,k)=>{assert.equal(spatial.clearPose(f,f.position,f.quaternion),true);maxStep=Math.max(maxStep,previous[k].distanceTo(f.position));previous[k].copy(f.position);});}
 assert.ok(world.events.some(e=>e.type==='hidden'));assert.ok(world.events.some(e=>e.type==='searched-exit'));assert.ok(maxStep<.01);assert.ok(world.events.length<=80);assert.ok(nav.cache.size<=12);
});
test('full reef food eligibility excludes large prey for small predators',()=>{
 const {nav,spatial,roadmap}=fixture;nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;world.startFullDrill(scenarios[0],.074,.18);for(let i=0;i<600;i++)world.step(1/60);assert.equal(world.stats.hunts,0);assert.equal(world.stats.captures,0);
});
test('large predator pursuit remains inside the turn-clearance domain before attaching a detour',()=>{
 const {nav,spatial,roadmap}=fixture;nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;world.startFullDrill(scenarios[0],.074,.45);
 for(let i=0;i<720;i++){world.step(1/60);for(const f of world.fish)assert.equal(nav.clearPoint(f,f.position),true,'pursuit may not strand an actor outside the route attachment domain');}
 assert.ok(world.events.some(e=>e.type==='searched-exit'));
});
test('live point clearance includes the same numeric reserve as an edge at a large-body boundary',()=>{
 const {nav,spatial,roadmap}=fixture;nav.configure(fullReefSites(roadmap,0));const f={kind:'barramundi',profile:profile('boundary','barramundi',.45)};
 const p=new Vector3(-.02085853394497155,.43179904761281923,.24792453487055643);
 assert.ok(spatial.distanceToSurface(p,.5)>.27*1.08);
 assert.ok(spatial.distanceToSurface(p,.5)<.27*1.08+.0002);
 assert.equal(nav.clearPoint(f,p),false);assert.equal(nav.clearEdge(f,p,p),false);
});
test('layout translation invalidates navigation and disabling scenery clears paths',()=>{
 const {nav,spatial,roadmap,habitat}=fixture;nav.configure(fullReefSites(roadmap,0));const world=new OceanWorld({empty:true,spatial});world.navigation=nav;world.startFullDrill(scenarios[0],.04,.25);for(let i=0;i<180;i++)world.step(1/60);const before=nav.version;
 habitat.group.position.y=-4;spatial.updateMatrices();nav.configure(fullReefSites(roadmap,-.4));assert.ok(nav.version>before);assert.equal(nav.cache.size,0);world.startFullDrill(scenarios[0],.04,.25);
 for(let i=0;i<720;i++){world.step(1/60);for(const f of world.fish)assert.equal(spatial.clearPose(f,f.position,f.quaternion),true);}assert.ok(world.events.some(e=>e.type==='hidden'));
 nav.configure(null);spatial.setActive(false);world.clearRoutes();assert.equal(nav.cache.size,0);assert.equal(nav.route(world.fish[0],new Vector3(),new Vector3(1,1,1)),null);assert.ok(world.fish.every(f=>!f.route&&f.hideUntil===0));
 habitat.group.position.y=0;spatial.updateMatrices();spatial.setActive(true);
});
