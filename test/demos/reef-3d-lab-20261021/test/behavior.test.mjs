import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Mesh,BoxGeometry,MeshBasicMaterial,BufferGeometry,BufferAttribute} from 'three';
import {readFileSync} from 'node:fs';
import {OceanWorld} from '../world.mjs';
import {ReefSpatial} from '../spatial.mjs';
import {profile} from '../catalog.mjs';

test('natural pursuit generates both captures and escapes without invoking capture directly',()=>{
 for(const seed of [1,7,73,123]){
  const w=new OceanWorld({seed});w.add('barramundi',.45);w.setPredation(true);
  for(let i=0;i<7200;i++)w.step(1/60);
  assert.ok(w.stats.captures>0,`seed ${seed}: capture`);assert.ok(w.stats.escapes>0,`seed ${seed}: escape`);
  assert.ok(w.stats.captures<=6);assert.equal(w.fish.length,7);assert.ok(w.events.length<=80);
 }
});
test('rotation sweep catches a wall even when both endpoint orientations are clear',()=>{
 const s=new ReefSpatial(),wall=new Mesh(new BoxGeometry(.03,.3,.03),new MeshBasicMaterial());wall.position.set(.165,0,.165);s.setMeshes([{mesh:wall}]);s.setActive(true);
 const f={profile:{...profile('thin','clown',.06),radiusM:.004}},a=new Quaternion(),b=new Quaternion().setFromAxisAngle(new Vector3(0,1,0),-Math.PI/2),p=new Vector3();
 assert.equal(s.clearPose(f,p,a),true);assert.equal(s.clearPose(f,p,b),true);assert.equal(s.clearMotion(f,p,p,a,b),false);
});
test('real source rock BVH rejects invalid poses and world never commits a penetrating move',()=>{
 const buffer=readFileSync(new URL('../upstream/scenes/reefscape/assets/live-rock.bin',import.meta.url));const b=buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),head=new Uint32Array(b,0,4),n=head[2],count=head[3];
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(b,16,n*3),3));geometry.setIndex(new BufferAttribute(new Uint32Array(b,Math.ceil((16+n*27)/4)*4,count),1));
 const rock=new Mesh(geometry,new MeshBasicMaterial());rock.position.y=-2;const s=new ReefSpatial();s.setMeshes([{mesh:rock}]);s.setActive(true);
 const w=new OceanWorld({spatial:s});
 for(let i=0;i<1200;i++){w.step(1/60);for(const f of w.fish){assert.equal(s.clearPose(f,f.position,f.quaternion),true);}}
 assert.ok(s.queryCount>0);assert.ok(s.blockedCount>0);
 s.setActive(false);assert.equal(s.firstHit({}),null);
});
test('local refuge requires reachable space, body clearance and loss of predator sight',()=>{
 const w=new OceanWorld({empty:true}),f=w.add('clown',.04,{position:new Vector3(0,.4,0)}),p=w.add('barramundi',.45);
 w.spatial={active:true,clearPose:()=>true,clearMotion:()=>true,lineOfSight:(a,b)=>b.z<.1};w.findRefuge(f,p);assert.ok(f.refuge?.z>=.1);
 f.refuge=null;w.time=1;w.spatial.clearMotion=()=>false;w.findRefuge(f,p);assert.equal(f.refuge,null);
});
test('held predator and removed target end active hunts; fish budget stays bounded',()=>{
 const w=new OceanWorld(),p=w.add('barramundi',.45),f=w.fish[0];w.setPredation(true);p.hunt={target:f.id,start:0};w.setHeld(p.id,true);assert.equal(p.hunt,null);
 w.setHeld(p.id,false);p.hunt={target:f.id,start:0};w.remove(f.id);assert.equal(p.hunt,null);
 for(let i=0;i<60;i++)w.add();assert.equal(w.fish.length,40);
});
