import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Group,Vector3,Box3} from 'three';
import {createFishSchool} from './upstream/scenes/reefscape/src/fish-model.js';
import {validateCommunityGLB,certifyCommunityModel} from './community-geometry.mjs';
const root=new URL('./',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const lock=JSON.parse(await readFile(new URL('assets/community/source-lock.json',root),'utf8')),models={};
for(const row of lock.sources){const bytes=await readFile(new URL('assets/community/'+row.kind+'.glb',root));if(hash(bytes)!==row.sha256)throw new Error('Asset hash mismatch');const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length);validateCommunityGLB(buffer);const gltf=await new GLTFLoader().parseAsync(buffer,'');models[row.kind]={...row,...certifyCommunityModel(gltf)};}
// Public Deskworlds school factory, including both LODs and every vertex. The
// sphere covers <=.495 flex, <=.85 fin rowing and all male fin extensions.
for(const kind of ['chromis','anthias']){
 const group=new Group(),school=createFishSchool(group,{fish:[{kind,size:1,position:new Vector3(),rank:1}]}),actual=school.groups.find(g=>g.fish.length),box=new Box3().setFromBufferAttribute(actual.lods[0].mesh.geometry.attributes.position),center=box.getCenter(new Vector3()),length=box.max.x-box.min.x;let max=0,vertices=0;
 for(const lod of actual.lods){const p=lod.mesh.geometry.attributes.position,part=lod.mesh.geometry.attributes.part;vertices+=p.count;for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),paired=part.getX(i)>1.5&&part.getX(i)<3.5,q=Math.max(0,Math.min(1,(.30-x)/1.14)),h=Math.max(0,Math.min(1,(.30-x)*3.4));
  max=Math.max(max,Math.hypot(Math.abs(x-center.x)+(paired?.85*h*h*.034:0)+(kind==='anthias'?.17:0),Math.abs(y-center.y)+(kind==='anthias'?.19:0),Math.abs(z-center.z)+.495*q*q+(paired?.85*h*.05:0)));
 }}
 models[kind]={length,center:center.toArray(),radiusRatio:Math.ceil((max/length+.005)*1000)/1000,depthRatio:(box.max.y-box.min.y)/length,widthRatio:(box.max.z-box.min.z)/length,vertices,proof:'deskworlds-full-far-interval-sphere-v1'};
 const geos=new Set(),mats=new Set();group.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
}
const sources={};for(const path of ['certify-community.mjs','community-geometry.mjs','upstream/scenes/reefscape/src/fish-model.js'])sources[path]=hash(await readFile(new URL(path,root)));
await writeFile(new URL('assets/community/certificates.json',root),JSON.stringify({version:1,sources,models},null,2)+'\n');console.log(JSON.stringify(models,null,2));
