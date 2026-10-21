import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3,Quaternion,Mesh,BoxGeometry,MeshBasicMaterial } from 'three';
import { OceanWorld } from '../world.mjs';
import { ReefSpatial } from '../spatial.mjs';
import { profile } from '../catalog.mjs';

test('six stable individual total lengths and reload reproducibility',()=>{
 const a=new OceanWorld(),b=new OceanWorld();assert.equal(a.fish.length,6);
 assert.equal(new Set(a.fish.map(f=>f.profile.totalLengthM)).size,6);
 assert.deepEqual(a.fish.map(f=>f.profile),b.fish.map(f=>f.profile));
 for(let i=0;i<500;i++)a.step(1/60);
 assert.deepEqual(a.fish.map(f=>f.profile.totalLengthM),b.fish.map(f=>f.profile.totalLengthM));
});
test('individual predator size and body depth gate eligibility; tasks are never candidates',()=>{
 const w=new OceanWorld({empty:true}),small=w.add('clown',.025),big=w.add('clown',.074),p=w.add('barramundi',.18);
 assert.equal(w.canEat(p,small),true);assert.equal(w.canEat(p,big),false);
 w.setHeld(small.id,true);assert.equal(w.canEat(p,small),false);
 assert.equal(w.canEat(p,{kind:'jelly',life:'alive'}),false);
});
test('feed is bounded and has distinct ingestion receipts',()=>{
 const w=new OceanWorld({empty:true}),f=w.add('clown',.06,{position:new Vector3(0,.4,.2)});
 assert.deepEqual(w.feed(w.mouth(f)),{ok:true,count:6});assert.equal(w.feed().ok,false);
 w.step(1/60);assert.ok(w.stats.eaten>0);
 for(let i=0;i<30;i++){w.time+=1;w.feed();}assert.ok(w.pellets.length<=24);
});
test('capture requires 3D mouth contact and happens only once; refills preserve resident traits',()=>{
 const w=new OceanWorld({empty:true}),p=w.add('barramundi',.45,{position:new Vector3(0,.4,0)}),f=w.add('clown',.04,{position:new Vector3(.2,.4,.4)});w.setPredation(true);
 assert.equal(w.capture(p,f),false);f.position.copy(w.mouth(p));assert.equal(w.capture(p,f),true);assert.equal(w.capture(p,f),false);assert.equal(w.stats.captures,1);
 const before=f.profile;w.time=f.absentUntil;w.step(1/60);assert.equal(f.life,'alive');assert.equal(f.profile,before);assert.equal(w.fish.length,2);
});
test('occluded or held prey cannot be captured; hunting eventually gives up',()=>{
 const w=new OceanWorld({empty:true}),p=w.add('barramundi',.45),f=w.add('clown',.04);w.setPredation(true);f.position.copy(w.mouth(p));
 w.spatial={clearMotion:()=>true,clearPose:()=>true,lineOfSight:()=>false,avoidance:()=>new Vector3()};assert.equal(w.capture(p,f),false);
 p.hunt={target:f.id,start:0,phase:'hunt',lastSeen:f.position.clone(),seen:0};w.time=13;w.step(1/60);assert.equal(p.hunt,null);assert.ok(w.stats.escapes>0);
});
test('BVH blocks a swept capsule through thin wall and rejects inside-solid spawns',()=>{
 const s=new ReefSpatial(),wall=new Mesh(new BoxGeometry(.05,10,10),new MeshBasicMaterial());s.setMeshes([{mesh:wall}]);s.setActive(true);
 const f={profile:profile('a','clown',.04)},q=new Quaternion();
 assert.equal(s.clearPose(f,new Vector3(0,0,0),q),false);
 assert.equal(s.clearMotion(f,new Vector3(-.04,0,0),new Vector3(.04,0,0),q,q),false);
 assert.equal(s.lineOfSight(new Vector3(-.1,0,0),new Vector3(.1,0,0)),false);
 s.setActive(false);assert.equal(s.clearMotion(f,new Vector3(-.08,0,0),new Vector3(.08,0,0),q,q),true);
});
test('same aperture admits small body and rejects larger body',()=>{
 const s=new ReefSpatial(),mat=new MeshBasicMaterial(),a=new Mesh(new BoxGeometry(.2,2,2),mat),b=new Mesh(new BoxGeometry(.2,2,2),mat);
 a.position.x=-.28;b.position.x=.28;s.setMeshes([{mesh:a},{mesh:b}]);s.setActive(true);
 const q=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2);assert.equal(s.clearPose({profile:profile('small','clown',.025)},new Vector3(0,0,0),q),true);
 assert.equal(s.clearPose({profile:profile('big','clown',.074)},new Vector3(0,0,0),q),false);
});
