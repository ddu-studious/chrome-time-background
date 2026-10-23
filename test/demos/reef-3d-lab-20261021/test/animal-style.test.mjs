import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,ShaderLib} from 'three';
import {createFishSchool} from '../upstream/scenes/reefscape/src/fish-model.js';
import {applyClownAppearance} from '../clown-appearance.mjs';
import {applyAnimalStyle,projectFishStyle} from '../animal-style.mjs';
import {assertClownMotionEnvelope} from '../fish-envelope.mjs';
import {createMoonJellyModel,sampleMoonPulse} from '../moon-jelly.mjs';
const shader=()=>({uniforms:{},vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader});

test('soft fish rendering only edits fragment shading, preserving vertices, transforms and depth',()=>{
 const root=new Group(),school=createFishSchool(root,{fish:[{kind:'clown',size:1,position:new Vector3()}]});applyClownAppearance(root,{variant:'reference'});
 root.position.set(1,2,3);const positions=root.children.map(m=>m.geometry.attributes.position.array.slice()),m=school.groups[0].material,before=shader();m.onBeforeCompile(before,{});
 const depth=[m.depthTest,m.depthWrite],result=applyAnimalStyle(root,'soft'),after=shader();m.onBeforeCompile(after,{});
 assert.equal(result.vertexChanges,false);assert.equal(after.vertexShader,before.vertexShader);assert.ok(after.fragmentShader.includes('softAnimalStyle'));assert.equal(after.uniforms.softAnimalStyle.value,1);
 root.children.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.attributes.position.array,positions[i]));assert.deepEqual(root.position.toArray(),[1,2,3]);assert.deepEqual([m.depthTest,m.depthWrite],depth);
 const cache=m.customProgramCacheKey(),version=m.version;
 for(let i=0;i<100;i++)applyAnimalStyle(root,i%2?'reference':'soft');
 assert.equal(m.customProgramCacheKey(),cache);assert.equal(m.version,version);assert.equal(after.uniforms.softAnimalStyle.value,0);
 const bad=shader();bad.fragmentShader=bad.fragmentShader.replace('#include <opaque_fragment>','');assert.throws(()=>m.onBeforeCompile(bad,{}),/contract/);
 const geos=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
});

test('style cadence is continuous, cannot increase flex, and never writes the World source',()=>{
 const clock={},source={phase:1,pectoral:2,tailAmplitude:.075,bend:.42,rowing:.8,position:[1,2,3]};
 let previous=projectFishStyle(source,clock,'reference');
 for(let i=0;i<240;i++){
  source.phase+=.14;source.pectoral+=.3;const copy=structuredClone(source),next=projectFishStyle(source,clock,i<120?'soft':'reference');
  assert.deepEqual(source,copy);assert.ok(next.phase>previous.phase&&next.phase-previous.phase<=.141);assert.ok(next.tailAmplitude<=source.tailAmplitude);assert.equal(next.bend,source.bend);
  assert.doesNotThrow(()=>assertClownMotionEnvelope(next));previous=next;
 }
});

test('moon style preserves root ownership, reduces canal contrast and can restore reference materials',()=>{
 const m=createMoonJellyModel(),initial=m.materials.map(v=>({color:v.color.toArray(),opacity:v.opacity,roughness:v.roughness}));m.group.position.set(1,2,3);m.group.scale.setScalar(.2);
 m.update(2,{style:'soft',alpha:.5,held:true});assert.equal(m.style,'soft');
 assert.ok(m.group.getObjectByName('radial-canals').material.opacity<initial[3].opacity*.5);
 assert.equal(m.group.getObjectByName('outer-umbrella').material.iridescence,.08);
 assert.ok(m.materials.every(v=>v.depthTest===false&&v.depthWrite===false&&v.metalness===0));assert.deepEqual(m.group.position.toArray(),[1,2,3]);assert.equal(m.group.scale.x,.2);
 m.update(2,{style:'reference'});m.materials.forEach((v,i)=>{assert.deepEqual(v.color.toArray(),initial[i].color);assert.equal(v.opacity,initial[i].opacity);assert.equal(v.roughness,initial[i].roughness);});m.dispose();
});

test('soft moon timing is slower with a longer relaxation share, without phase-boundary discontinuities',()=>{
 const a=sampleMoonPulse(0),b=sampleMoonPulse(0,0,1,'soft');assert.ok(b.rate<a.rate);
 for(const phase of [0,.22,.84,1])assert.ok(Math.abs(sampleMoonPulse((phase-1e-6)/b.rate,0,1,'soft').contraction-sampleMoonPulse((phase+1e-6)/b.rate,0,1,'soft').contraction)<1e-5);
 assert.equal(sampleMoonPulse(.8/b.rate,0,1,'soft').stage,'relax');assert.equal(sampleMoonPulse(.9/b.rate,0,1,'soft').stage,'coast');
});

test('soft moon remains seekable, finite and inside its unchanged culling sphere',()=>{
 const m=createMoonJellyModel(0xa1bed2,'soft');m.update(2.4);const pose=m.meshes.map(mesh=>mesh.geometry.attributes.position.array.slice());m.update(12);m.update(2.4);
 m.meshes.forEach((mesh,i)=>assert.deepEqual(mesh.geometry.attributes.position.array,pose[i]));
 for(let frame=0;frame<30;frame++){
  m.update(frame*.19,{style:'soft',phase:.17});
  for(const mesh of m.meshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,s=mesh.geometry.boundingSphere;for(let i=0;i<p.count;i++){assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+n.getX(i)+n.getY(i)+n.getZ(i)));assert.ok(new Vector3().fromBufferAttribute(p,i).distanceTo(s.center)<s.radius);}}
 }
 m.dispose();
});
