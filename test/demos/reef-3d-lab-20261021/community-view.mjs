import {Group,AnimationMixer,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {EXTRA_FISH,GLB_KINDS} from './community-catalog.mjs';
import {validateCommunityGLB,swimmingClip,installSkinBounds} from './community-geometry.mjs';
import {underwater} from './upstream/scenes/reefscape/src/water.js';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function disposeAsset(asset){const gs=new Set(),ms=new Set(),skeletons=new Set();asset.scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());skeletons.forEach(s=>s.dispose());}
export class CommunityView{
 constructor(scene){this.scene=scene;this.templates=new Map();this.pending=new Map();this.actors=new Map();this.disposed=false;}
 async load(kind){
  if(!GLB_KINDS.includes(kind))return;
  if(this.templates.has(kind))return;if(this.pending.has(kind))return this.pending.get(kind);
  const task=(async()=>{const spec=EXTRA_FISH[kind],response=await fetch(new URL('./assets/community/'+kind+'.glb',import.meta.url),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('模型加载失败：'+spec.name);
   const bytes=await response.arrayBuffer();if(bytes.byteLength!==spec.shape.bytes)throw new Error('模型体积不匹配：'+spec.name);
   const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(digest!==spec.shape.sha256)throw new Error('模型指纹不匹配：'+spec.name);
   validateCommunityGLB(bytes);const asset=await new GLTFLoader().parseAsync(bytes,'');swimmingClip(asset);
   asset.scene.traverse(m=>{if(!m.isMesh)return;const old=m.geometry,g=old.clone();g.deleteAttribute('normal');m.geometry=mergeVertices(g,1e-5);m.geometry.computeVertexNormals();g.dispose();old.dispose();m.frustumCulled=false;});
   if(this.disposed){disposeAsset(asset);throw new Error('场景已关闭');}this.templates.set(kind,asset);
  })().finally(()=>this.pending.delete(kind));this.pending.set(kind,task);return task;
 }
 async loadAll(){await Promise.all(GLB_KINDS.map(k=>this.load(k)));}
 create(f){
  const spec=EXTRA_FISH[f.kind],asset=this.templates.get(f.kind);if(!asset)throw new Error('模型尚未加载：'+spec.name);
  const model=clone(asset.scene),materials=new Map();model.traverse(m=>{if(!m.isMesh)return;m.frustumCulled=false;m.receiveShadow=true;const adapt=source=>{if(!materials.has(source)){const eye=/eyes/i.test(source.name),mat=underwater(source.clone(),{key:eye?'community-eye-v1':'community-skin-v1',transmission:eye?0:.08,wrap:.5,specular:eye?.7:.25});mat.metalness=0;mat.roughness=.7;materials.set(source,mat);}return materials.get(source);};m.material=Array.isArray(m.material)?m.material.map(adapt):adapt(m.material);});
  installSkinBounds(model,spec.shape);const aligned=new Group(),root=new Group();aligned.rotation.y=Math.PI/2;aligned.position.set(...spec.shape.alignedCenter).multiplyScalar(-1);aligned.add(model);root.add(aligned);this.scene.add(root);
  const mixer=new AnimationMixer(model),clip=swimmingClip(asset),action=mixer.clipAction(clip);action.play();const actor={fish:f,root,model,mixer,action,materials:[...materials.values()],time:f.phase/(2*Math.PI)*clip.duration,lastTime:null};this.actors.set(f.id,actor);return actor;
 }
 remove(id){const a=this.actors.get(id);if(!a)return;a.mixer.stopAllAction();a.mixer.uncacheRoot(a.model);const skeletons=new Set();a.model.traverse(m=>{if(m.skeleton)skeletons.add(m.skeleton);});skeletons.forEach(s=>s.dispose());a.materials.forEach(m=>m.dispose());a.root.removeFromParent();this.actors.delete(id);}
 update(world,visible,style){
  const living=world.fish.filter(f=>GLB_KINDS.includes(f.kind)&&f.life==='alive'),ids=new Set(living.map(f=>f.id));for(const id of this.actors.keys())if(!ids.has(id))this.remove(id);
  for(const f of living){const a=this.actors.get(f.id)||this.create(f),spec=EXTRA_FISH[f.kind];a.fish=f;a.root.visible=visible;
   const dt=a.lastTime===null?0:clamp(world.time-a.lastTime,0,.1);a.lastTime=world.time;if(!visible)continue;
   a.time+=dt*(f.held?.3:clamp(f.velocity.length()/f.cruise,.5,1.8));a.mixer.setTime(a.time);
   a.root.position.copy(f.position).multiplyScalar(10);a.root.quaternion.copy(f.quaternion);a.root.scale.setScalar(f.profile.totalLengthM*10/spec.shape.length);
   for(const m of a.materials){m.depthTest=!f.held;m.depthWrite=!f.held;m.roughness=style==='soft'?.72:.5;}
   a.model.traverse(m=>{if(m.isMesh)m.renderOrder=f.held?100:0;});
  }
 }
 pick(raycaster,world){let nearest=null;for(const a of this.actors.values()){
  if(!a.root.visible||!world.active(a.fish))continue;a.root.updateMatrixWorld(true);
  const hits=raycaster.intersectObject(a.root,true);if(hits.length&&(!nearest||hits[0].distance*.1<nearest.distance))nearest={fish:a.fish,distance:hits[0].distance*.1,point:hits[0].point.clone().multiplyScalar(.1)};
 }return nearest;}
 dispose(){this.disposed=true;for(const id of [...this.actors.keys()])this.remove(id);for(const a of this.templates.values())disposeAsset(a);this.templates.clear();}
}
