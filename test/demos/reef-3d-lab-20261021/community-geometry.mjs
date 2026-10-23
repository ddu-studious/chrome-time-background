import {Box3,Vector3,Matrix4,Sphere,InterpolateLinear,InterpolateDiscrete} from 'three';

export function validateCommunityGLB(buffer){
 const v=new DataView(buffer);if(buffer.byteLength>8000000||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==buffer.byteLength||v.getUint32(16,true)!==0x4e4f534a)throw new Error('Invalid local GLB');
 const length=v.getUint32(12,true);if(length>1000000||20+length>buffer.byteLength)throw new Error('Invalid GLB JSON size');
 const data=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)));
 if(data.images?.length||data.buffers?.some(b=>b.uri)||data.extensionsRequired?.length||data.nodes?.length>128||data.meshes?.length>20||data.animations?.length>20)throw new Error('Unsupported external resource or model budget');
 return data;
}
export function swimmingClip(gltf){const clip=gltf.animations.find(c=>/Swimming_Normal$/.test(c.name));if(!clip||clip.duration<=0||clip.duration>20||clip.tracks.some(t=>!t.name.endsWith('.quaternion')||![InterpolateLinear,InterpolateDiscrete].includes(t.getInterpolation())))throw new Error('Unsupported swim animation contract');return clip;}
const maxScale=o=>Math.max(Math.abs(o.scale.x),Math.abs(o.scale.y),Math.abs(o.scale.z));
// A rotation-independent bound, not a frame sample: each bone chain is bounded
// by the triangle inequality and maximum scale. Positive skin weights combine
// those balls. This deliberately allows more clearance than the visible body.
export function certifyCommunityModel(gltf){
 swimmingClip(gltf);const root=gltf.scene;root.updateMatrixWorld(true);
 const box=new Box3().setFromObject(root,true),center=box.getCenter(new Vector3()),size=box.getSize(new Vector3()),length=size.z;
 if(!Number.isFinite(length)||length<=0)throw new Error('Empty model');
 let radius=0,vertices=0,triangles=0,meshes=0;
 root.traverse(mesh=>{if(!mesh.isMesh)return;meshes++;const g=mesh.geometry,p=g.attributes.position;vertices+=p.count;triangles+=(g.index?.count||p.count)/3;
  if(g.morphAttributes.position?.length)throw new Error('Morph model not covered');
  for(let i=0;i<p.count;i++){
   const raw=new Vector3().fromBufferAttribute(p,i);
   if(!mesh.isSkinnedMesh){radius=Math.max(radius,raw.applyMatrix4(mesh.matrixWorld).distanceTo(center));continue;}
   const si=g.attributes.skinIndex,sw=g.attributes.skinWeight;let r=0,sum=0;
   for(let k=0;k<4;k++){
    const weight=sw.getComponent(i,k),index=si.getComponent(i,k);if(weight<0||!Number.isFinite(weight))throw new Error('Invalid skin weight');if(!weight)continue;sum+=weight;
    const bone=mesh.skeleton.bones[index];if(!bone)throw new Error('Invalid bone');
    const point=raw.clone().applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[index]);let distance=point.length(),node=bone;
    while(node){distance=distance*maxScale(node)+node.position.length();node=node.parent;}
    r+=weight*distance;
   }
   if(Math.abs(sum-1)>.001)throw new Error('Unnormalized skin');
   radius=Math.max(radius,r+center.length());
  }
 });
 if(vertices>30000||meshes>20)throw new Error('Model exceeds geometry budget');
 // Orientation +Z -> +X, translation centres the rest-pose animal.
 const alignedCenter=center.clone().applyMatrix4(new Matrix4().makeRotationY(Math.PI/2));
 return {length,center:center.toArray(),alignedCenter:alignedCenter.toArray(),radiusRatio:Math.ceil((radius/length+.005)*1000)/1000,depthRatio:size.y/length,widthRatio:size.x/length,vertices,triangles,meshes,clip:swimmingClip(gltf).name,proof:'all-rotation-skin-chain-sphere-v1'};
}
export function installSkinBounds(root,certificate){
 root.updateMatrixWorld(true);const center=new Vector3(...certificate.center),radius=certificate.radiusRatio*certificate.length;
 root.traverse(m=>{if(m.isSkinnedMesh){const inverse=m.matrixWorld.clone().invert(),scale=new Vector3().setFromMatrixScale(inverse);m.boundingSphere=new Sphere(center.clone().applyMatrix4(inverse),radius*Math.max(scale.x,scale.y,scale.z));m.boundingBox=null;}});
}
