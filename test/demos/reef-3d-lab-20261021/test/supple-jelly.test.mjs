import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {createMoonJellyModel,sampleMoonPulse} from '../moon-jelly.mjs';

test('soft pulse has zero endpoint velocity and acceleration at contraction/relaxation/coast boundaries',()=>{
 const rate=sampleMoonPulse(0,0,1,'soft').rate,h=1e-4;
 for(const cycle of [0,.22,.84,1]){
  const at=t=>sampleMoonPulse(t/rate,0,1,'soft').contraction;
  const velocity=(at(cycle+h)-at(cycle-h))/(2*h),acceleration=(at(cycle+h)-2*at(cycle)+at(cycle-h))/(h*h);
  assert.ok(Math.abs(velocity)<1e-4);assert.ok(Math.abs(acceleration)<.12);
 }
});
test('oral-arm flow trails the host, grows toward the tip, and leaves the root/task transform untouched',()=>{
 const m=createMoonJellyModel(0xa1bed2,'soft');m.group.position.set(1,2,3);m.group.rotation.set(.3,.2,.1);m.group.scale.setScalar(.04);
 const transform=[...m.group.position.toArray(),...m.group.quaternion.toArray(),...m.group.scale.toArray()];
 m.update(.7,{flow:{x:0,y:0,z:0}});const arm=m.group.getObjectByName('four-frilled-oral-arms').geometry.attributes.position,before=arm.array.slice();
 m.update(.7,{flow:{x:1,y:.5,z:-1}});let tipShift=0,rootShift=0,tipCount=0,rootCount=0;
 for(let i=0;i<arm.count;i++){
  const dx=arm.getX(i)-before[i*3];assert.ok(dx<=1e-7,'positive flow trails the tissue in negative X');
  if(before[i*3+1]<-.4){tipShift+=Math.abs(dx);tipCount++;}
  if(before[i*3+1]>.19){rootShift+=Math.abs(dx);rootCount++;}
 }
 assert.ok(tipShift/tipCount>.06);assert.ok(rootShift/rootCount<.001);
 assert.deepEqual([...m.group.position.toArray(),...m.group.quaternion.toArray(),...m.group.scale.toArray()],transform);
 const first=arm.array.slice();m.update(5);m.update(.7,{flow:{x:1,y:.5,z:-1}});assert.deepEqual(arm.array,first);m.dispose();
});
test('maximum local flow and pulse combinations remain finite and within every original culling sphere',()=>{
 const m=createMoonJellyModel(0xa1bed2,'soft');
 for(const activity of [0,1,2])for(const flow of [{x:1,y:1,z:1},{x:-1,y:-1,z:-1},{x:Infinity,y:NaN,z:0}])for(let i=0;i<12;i++){
  m.update(i*.19,{activity,phase:.17,flow});
  for(const mesh of m.meshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,s=mesh.geometry.boundingSphere;
   for(let k=0;k<p.count;k++){assert.ok(Number.isFinite(p.getX(k)+p.getY(k)+p.getZ(k)+n.getX(k)+n.getY(k)+n.getZ(k)));assert.ok(new Vector3().fromBufferAttribute(p,k).distanceTo(s.center)<s.radius);}
  }
 }
 m.dispose();
});
