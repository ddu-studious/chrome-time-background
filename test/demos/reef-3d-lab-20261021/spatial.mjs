import { Vector3,Matrix4,Line3,Box3,Ray,DoubleSide } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const AXIS=new Vector3(1,0,0),V=()=>new Vector3();
// BVH provides geometry traversal/closest-point/ray queries. This adapter supplies a
// conservative fish capsule and bounded pose sampling; it is not a dynamics engine.
export class ReefSpatial{
  constructor(){this.entries=[];this.active=false;this.queryCount=0;this.blockedCount=0;}
  setMeshes(meshes){
    this.entries=meshes.map(({mesh,solid=true})=>{
      mesh.updateWorldMatrix(true,false);mesh.geometry.computeBoundingBox();
      return {mesh,solid,bvh:new MeshBVH(mesh.geometry,{targetLeafSize:8,indirect:true}),inverse:new Matrix4()};
    });
    this.updateMatrices();
  }
  updateMatrices(){for(const e of this.entries){e.mesh.updateWorldMatrix(true,false);e.inverse.copy(e.mesh.matrixWorld).invert();}}
  setActive(value){this.active=value===true;}
  capsule(f,position,quaternion,entry,inflation=1){
    const radius=f.profile.radiusM,inset=Math.max(f.profile.totalLengthM*.28,f.profile.totalLengthM*.5-radius),dir=AXIS.clone().applyQuaternion(quaternion);
    const a=position.clone().addScaledVector(dir,-inset).multiplyScalar(10).applyMatrix4(entry.inverse);
    const b=position.clone().addScaledVector(dir,inset).multiplyScalar(10).applyMatrix4(entry.inverse);
    const scale=new Vector3().setFromMatrixScale(entry.inverse);const r=radius*10*Math.max(scale.x,scale.y,scale.z)*inflation;
    return {segment:new Line3(a,b),radius:r,box:new Box3().setFromPoints([a,b]).expandByScalar(r)};
  }
  clearPose(f,position,quaternion,inflation=1){
    if(!this.active)return true;
    for(const e of this.entries){
      const c=this.capsule(f,position,quaternion,e,inflation);this.queryCount++;
      if(!e.mesh.geometry.boundingBox.intersectsBox(c.box))continue;
      let blocked=false;
      e.bvh.shapecast({intersectsBounds:box=>box.intersectsBox(c.box),intersectsTriangle:tri=>{
        if(tri.closestPointToSegment(c.segment,V(),V())<c.radius){blocked=true;return true;}return false;
      }});
      if(blocked){this.blockedCount++;return false;}
      // Surface proximity alone cannot reject a spawn deep inside a closed solid.
      const p=position.clone().multiplyScalar(10).applyMatrix4(e.inverse);
      if(e.solid&&e.mesh.geometry.boundingBox.containsPoint(p)){
        const hits=e.bvh.raycast(new Ray(p,new Vector3(.923,.271,.271).normalize()),DoubleSide).sort((a,b)=>a.distance-b.distance);
        let n=0,last=-Infinity;for(const hit of hits)if(hit.distance>1e-6&&hit.distance-last>1e-5){n++;last=hit.distance;}
        if(n%2){this.blockedCount++;return false;}
      }
    }
    return true;
  }
  clearMotion(f,from,to,qa,qb){
    if(!this.active)return true;
    const travel=from.distanceTo(to)+f.profile.totalLengthM*.5*qa.angleTo(qb);
    const n=Math.max(1,Math.ceil(travel/Math.max(.0005,f.profile.radiusM*.30)));
    if(n>24){this.blockedCount++;return false;}
    for(let i=1;i<=n;i++)if(!this.clearPose(f,from.clone().lerp(to,i/n),qa.clone().slerp(qb,i/n),1.06))return false;
    return true;
  }
  lineOfSight(a,b){
    if(!this.active)return true;
    const length=a.distanceTo(b);if(length<1e-8)return true;
    for(const e of this.entries){
      const start=a.clone().multiplyScalar(10).applyMatrix4(e.inverse),end=b.clone().multiplyScalar(10).applyMatrix4(e.inverse),ray=new Ray(start,end.clone().sub(start).normalize());
      const hit=e.bvh.raycastFirst(ray,DoubleSide);this.queryCount++;
      if(hit&&hit.distance<start.distanceTo(end)-1e-5)return false;
    }return true;
  }
  firstHit(rayMeters,maxDistance=Infinity){
    if(!this.active)return null;let nearest=null;
    for(const e of this.entries){const ray=new Ray(rayMeters.origin.clone().multiplyScalar(10),rayMeters.direction.clone()).applyMatrix4(e.inverse);const hit=e.bvh.raycastFirst(ray,DoubleSide);if(!hit)continue;
      const point=hit.point.clone().applyMatrix4(e.mesh.matrixWorld).multiplyScalar(.1),d=point.distanceTo(rayMeters.origin);
      if(d<maxDistance&&(!nearest||d<nearest.distance))nearest={distance:d,point};
    }return nearest;
  }
  avoidance(f){
    const force=new Vector3();if(!this.active)return force;
    for(const e of this.entries){
      const local=f.position.clone().multiplyScalar(10).applyMatrix4(e.inverse),near=f.profile.radiusM*2.2+.015;
      if(e.mesh.geometry.boundingBox.distanceToPoint(local)>near*10)continue;
      const hit=e.bvh.closestPointToPoint(local,{},0,near*10);if(!hit)continue;
      const point=hit.point.clone().applyMatrix4(e.mesh.matrixWorld).multiplyScalar(.1),delta=f.position.clone().sub(point),distance=delta.length();
      if(distance>1e-6&&distance<near)force.addScaledVector(delta,(1-distance/near)*f.cruise*5/distance);
    }return force;
  }
  dispose(){this.entries=[];this.active=false;}
}
