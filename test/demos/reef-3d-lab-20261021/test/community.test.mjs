import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Vector3,AnimationMixer,Group,Raycaster,DataTexture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {EXTRA_FISH,EXTRA_KINDS,GLB_KINDS} from '../community-catalog.mjs';
import {validateCommunityGLB,swimmingClip,certifyCommunityModel} from '../community-geometry.mjs';
import {CATALOG,profile} from '../catalog.mjs';
import {bodyEnvelope} from '../fish-envelope.mjs';
import {CommunityView} from '../community-view.mjs';
import {OceanWorld} from '../world.mjs';
async function asset(kind){const b=await readFile(new URL('../assets/community/'+kind+'.glb',import.meta.url));return {b,gltf:await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.length),'')};}

test('inventory is ten distinct fish types plus the existing task moon jelly, with finite metre profiles',()=>{
 assert.equal(Object.keys(CATALOG).length,10);assert.equal(EXTRA_KINDS.length,8);assert.equal(GLB_KINDS.length,6);
 for(const kind of EXTRA_KINDS){const s=EXTRA_FISH[kind];for(const L of [s.min,s.defaultLength,s.max]){
  const p=profile('sample',kind,L),e=bodyEnvelope({kind,profile:p});assert.equal(p.totalLengthM,L);assert.equal(p.ageDays,null);assert.equal(p.lifeStage,null);assert.ok(e.radiusM>0&&e.halfLengthM===0);assert.ok(e.rotationRadiusM<.3);
 }}
 assert.throws(()=>profile('x','__proto__',.1));assert.throws(()=>profile('x','unknown',.1));
});
for(const kind of GLB_KINDS)test(`${kind}: frozen GLB, real swim clip, and every skinned vertex stays inside the all-rotation envelope`,async()=>{
 const {b,gltf}=await asset(kind),s=EXTRA_FISH[kind],buffer=b.buffer.slice(b.byteOffset,b.byteOffset+b.length);validateCommunityGLB(buffer);
 assert.equal(createHash('sha256').update(b).digest('hex'),s.shape.sha256);assert.deepEqual(certifyCommunityModel(gltf),Object.fromEntries(Object.keys(certifyCommunityModel(gltf)).map(k=>[k,s.shape[k]])));
 const mixer=new AnimationMixer(gltf.scene),clip=swimmingClip(gltf);mixer.clipAction(clip).play();let changed=false,previous=null;
 for(let i=0;i<=36;i++){
  mixer.setTime(clip.duration*i/36);gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse(m=>{if(!m.isMesh)return;for(let j=0;j<m.geometry.attributes.position.count;j++){
   const p=m.getVertexPosition(j,new Vector3()).applyMatrix4(m.matrixWorld);assert.ok(Number.isFinite(p.length()));assert.ok(p.distanceTo(new Vector3(...s.shape.center))<=s.shape.radiusRatio*s.shape.length);
   if(j===0){if(previous&&p.distanceTo(previous)>.00001)changed=true;previous=p.clone();}
  }});
 }
 assert.ok(changed);mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);
});
test('new residents can feed and be held, and impossible placement is rejected before population mutation',()=>{
 for(const kind of EXTRA_KINDS){const w=new OceanWorld({empty:true}),f=w.add(kind,EXTRA_FISH[kind].defaultLength,{position:new Vector3(0,.4,.3)});assert.ok(f);assert.equal(w.feed(w.mouth(f)).ok,true);for(let i=0;i<180;i++)w.step(1/60);assert.ok(w.stats.eaten>0,kind);
  const pos=f.position.clone();w.setHeld(f.id,true);for(let i=0;i<60;i++)w.step(1/60);assert.deepEqual(f.position.toArray(),pos.toArray());assert.equal(w.remove(f.id),true);
 }
 const blocked=new OceanWorld({empty:true,spatial:{clearPose:()=>false}});assert.equal(blocked.add('tang',.1),null);assert.equal(blocked.fish.length,0);
});
test('cloned skeletons, per-resident materials and precise picking do not share drag depth or animation state',async()=>{
 const {gltf}=await asset('tang'),scene=new Group(),layer=new CommunityView(scene);layer.templates.set('tang',gltf);
 const w=new OceanWorld({empty:true});const a=w.add('tang',.1,{position:new Vector3(-.3,.4,.3)}),b=w.add('tang',.1,{position:new Vector3(.3,.4,.3)});
 layer.update(w,true,'soft');const aa=layer.actors.get(a.id),bb=layer.actors.get(b.id);assert.notEqual(aa.model,bb.model);assert.notEqual(aa.materials[0],bb.materials[0]);
 a.held=true;w.time=.1;layer.update(w,true,'soft');assert.ok(aa.materials.every(m=>!m.depthTest));assert.ok(bb.materials.every(m=>m.depthTest));assert.equal(layer.actors.size,2);
 a.held=false;layer.update(w,true,'soft');scene.updateMatrixWorld(true);const ray=new Raycaster(new Vector3(-3,4,20),new Vector3(0,0,-1));assert.equal(layer.pick(ray,w)?.fish.id,a.id);
 const skeletons=new Set();for(const actor of layer.actors.values())actor.model.traverse(m=>{if(m.skeleton)skeletons.add(m.skeleton);});let disposed=0;
 skeletons.forEach(s=>{s.boneTexture=new DataTexture(new Float32Array(16),1,4);s.boneTexture.addEventListener('dispose',()=>disposed++);});
 layer.dispose();layer.dispose();assert.equal(disposed,skeletons.size);assert.equal(layer.actors.size,0);assert.equal(layer.templates.size,0);
});
