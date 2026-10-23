import {Group,Mesh,MeshStandardMaterial,Float32BufferAttribute,Vector3,Box3} from 'three';
import {ellipsoid} from './upstream/scenes/reefscape/src/geometry.js';
// Authored, measurable affordance. These are real meshes, not invisible collision walls.
export function createCreviceHabitat(material=null){
 const group=new Group(),meshes=[];
 const mat=material||new MeshStandardMaterial({color:0x788579,roughness:.92});
 for(const [x,seed] of [[-2.4,71],[2.4,91]]){
  const g=ellipsoid([x,0,3.1],[1.8,1.3,1.8],seed,28),surface=new Float32Array(g.attributes.position.count*3);
  for(let i=0;i<surface.length;i+=3)surface.set([.85,.58,.36],i);g.setAttribute('surface',new Float32BufferAttribute(surface,3));
  const mesh=new Mesh(g,mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);meshes.push(mesh);
 }
 const box=new Box3().setFromObject(group);
 return {group,meshes,box,sites(){const y=group.position.y*.1;return {y,entry:new Vector3(0,y,.56),exit:new Vector3(0,y,-.14),cover:[new Vector3(.015,y,.24),new Vector3(-.015,y,.36)],minX:-.8,maxX:.8,minZ:-.16,maxZ:.58};}};
}
