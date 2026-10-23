import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Vector3,ShaderLib,UniformsUtils} from 'three';
import {createFishSchool} from '../upstream/scenes/reefscape/src/fish-model.js';
import {applyClownAppearance} from '../clown-appearance.mjs';

function fixture(){
 const group=new Group(),fish={kind:'clown',size:1,position:new Vector3(),yaw:0,pitch:0,roll:0,phase:1,tailAmplitude:.04,pectoral:1,rowing:.4,bend:.1};
 const school=createFishSchool(group,{fish:[fish]});
 return {group,fish,school,clown:school.groups[0]};
}
function shader(){const source=ShaderLib.standard;return {vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,uniforms:UniformsUtils.clone(source.uniforms)};}

test('reference anatomy keeps total length and semantic attributes, with independent surface and volume changes',()=>{
 const {group,clown}=fixture();const geometry=clown.mesh.geometry;
 const positions=geometry.attributes.position.array.slice(),uv=geometry.attributes.uv.array.slice(),parts=geometry.attributes.part.array.slice();
 const result=applyClownAppearance(group);
 assert.equal(result.geometries,2);assert.equal(result.materials,1);
 for(const {before,after} of result.bounds){assert.equal(after.length,before.length);assert.equal(after.min[0],before.min[0]);assert.ok(after.width>before.width);assert.ok(after.depth<before.depth);}
 assert.deepEqual(geometry.attributes.uv.array,uv);assert.deepEqual(geometry.attributes.part.array,parts);
 let changed=0,eyes=0;
 for(let i=0;i<geometry.attributes.position.count;i++){
  const p=geometry.attributes.position,n=geometry.attributes.normal;
  for(const value of [p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)])assert.ok(Number.isFinite(value));
  assert.ok(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-5);
  if(p.getZ(i)!==positions[i*3+2])changed++;
  if(parts[i]===4&&p.getX(i)!==positions[i*3])eyes++;
 }
 assert.ok(changed>1000);assert.ok(eyes>100);
});

test('switching legacy restores exact buffers and shader identity without stacking changes',()=>{
 const {group,clown}=fixture(),geometry=clown.mesh.geometry,material=clown.material;
 const p=geometry.attributes.position.array.slice(),n=geometry.attributes.normal.array.slice(),hook=material.onBeforeCompile,key=material.customProgramCacheKey;
 applyClownAppearance(group);const once=geometry.attributes.position.array.slice(),newHook=material.onBeforeCompile;
 applyClownAppearance(group);assert.deepEqual(geometry.attributes.position.array,once);assert.equal(material.onBeforeCompile,newHook);
 applyClownAppearance(group,{variant:'legacy'});assert.deepEqual(geometry.attributes.position.array,p);assert.deepEqual(geometry.attributes.normal.array,n);assert.equal(material.onBeforeCompile,hook);assert.equal(material.customProgramCacheKey,key);
 applyClownAppearance(group);assert.deepEqual(geometry.attributes.position.array,once);
});

test('upstream motion attributes and water shader hook remain live after appearance change',()=>{
 const {group,clown,school,fish}=fixture();const attribute=clown.attribute,gait=clown.gaitAttribute;
 applyClownAppearance(group);fish.phase=4.2;fish.bend=-.19;school.update();
 assert.equal(clown.mesh.geometry.attributes.aFishTrim,attribute);assert.equal(clown.mesh.geometry.attributes.aFishGait,gait);
 assert.ok(Math.abs(attribute.getX(0)-4.2)<1e-6);assert.ok(Math.abs(gait.getZ(0)+.19)<1e-6);
 const compiled=shader();clown.material.onBeforeCompile(compiled,{});
 assert.ok(compiled.vertexShader.includes('fishFlex'));assert.ok(compiled.vertexShader.includes('transformed.z+=fishFlex'));
 assert.ok(compiled.fragmentShader.includes('reefTransmittance'));assert.ok(compiled.fragmentShader.includes('roughnessFactor+.11'));
 assert.ok(compiled.uniforms.reefTime);assert.equal(clown.material.customProgramCacheKey(),'fish-clown/clown-reference-v1');
 assert.throws(()=>clown.material.onBeforeCompile({...shader(),fragmentShader:'void main(){}'},{}),/contract changed/);
});

test('adapter leaves other species and separate groups untouched',()=>{
 const a=fixture(),b=fixture(),other=a.school.groups[1],positions=other.mesh.geometry.attributes.position.array.slice(),hook=other.material.onBeforeCompile;
 const before=b.clown.mesh.geometry.attributes.position.array.slice();
 applyClownAppearance(a.group);
 assert.deepEqual(other.mesh.geometry.attributes.position.array,positions);assert.equal(other.material.onBeforeCompile,hook);assert.deepEqual(b.clown.mesh.geometry.attributes.position.array,before);
 assert.throws(()=>applyClownAppearance(a.group,{variant:'guess'}),/Unknown/);
});
