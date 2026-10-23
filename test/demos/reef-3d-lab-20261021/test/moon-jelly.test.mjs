import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Box3} from 'three';
import {createMoonJellyModel,sampleMoonPulse} from '../moon-jelly.mjs';

test('Aurelia sample separates a shallow umbrella, four oral arms and a dense short fringe',()=>{
  const model=createMoonJellyModel(),byName=name=>model.group.getObjectByName(name),sizeOf=name=>new Box3().setFromObject(byName(name)).getSize(new Vector3());
  const bell=sizeOf('outer-umbrella'),fringe=sizeOf('short-marginal-tentacles'),arms=sizeOf('four-frilled-oral-arms');
  assert.ok(bell.x>1.9&&bell.z>1.9&&bell.y>.44&&bell.y<.55);
  assert.ok(fringe.y<.3,'margin carries short tentacles rather than the old long tubes');
  assert.ok(arms.y>.7&&arms.y<1&&arms.x>.3&&arms.z>.3);
  assert.equal(model.group.userData.anatomy.gonads,4);assert.equal(model.group.userData.anatomy.oralArms,4);
  assert.equal(model.meshes.length,7);assert.ok(model.materials.every(m=>m.depthWrite===false&&m.metalness===0));
  model.dispose();
});

test('bell has a closed soft lip, a recessed inner cavity, and outward surface normals',()=>{
  const m=createMoonJellyModel(),g=m.group.getObjectByName('outer-umbrella').geometry,p=g.attributes.position,n=g.attributes.normal;
  assert.equal(m.group.getObjectByName('flexible-bell-margin'),undefined,'there is no separately glowing rim tube');
  const edges=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e5)).join(',');
  for(let j=0;j<g.index.count;j+=3){
    const ids=[0,1,2].map(k=>key(g.index.array[j+k]));if(new Set(ids).size<3)continue;
    for(let k=0;k<3;k++){const edge=[ids[k],ids[(k+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
  }
  assert.ok([...edges.values()].every(n=>n===2),'welded shell has no open cut edge');
  const centers=[],lips=[];let outward=false;
  for(let i=0;i<p.count;i++){
    const r=Math.hypot(p.getX(i),p.getZ(i));if(r<1e-5)centers.push(p.getY(i));if(r>.93)lips.push(p.getY(i));
    if(r>.3&&r<.6&&p.getY(i)>.35&&n.getY(i)>.8)outward=true;
  }
  assert.ok(Math.max(...centers)-Math.min(...centers)>.15,'central mesoglea has visible thickness');
  assert.ok(Math.min(...centers)-Math.min(...lips)>.25,'inner crown rises above the opening instead of a flat cap');
  assert.ok(outward);m.dispose();
});

test('pulse has continuous contraction, longer relaxation and an actual coasting interval',()=>{
  const rate=sampleMoonPulse(0).rate;
  assert.equal(sampleMoonPulse(.1/rate).stage,'contract');assert.equal(sampleMoonPulse(.5/rate).stage,'relax');assert.equal(sampleMoonPulse(.9/rate).stage,'coast');
  assert.equal(sampleMoonPulse(.9/rate).contraction,0);
  for(const phase of [0,.24,.76,1])assert.ok(Math.abs(sampleMoonPulse((phase-1e-6)/rate).contraction-sampleMoonPulse((phase+1e-6)/rate).contraction)<1e-5);
});

test('animation bends the margin locally, remains finite and inside its culling bounds',()=>{
  const model=createMoonJellyModel(),shell=model.group.getObjectByName('outer-umbrella').geometry;
  model.update(0);const relaxed=shell.attributes.position.array.slice();model.update(.24/sampleMoonPulse(0).rate);
  const contracted=shell.attributes.position.array;
  const extent=a=>{let radius=0,top=-Infinity,bottom=Infinity;for(let i=0;i<a.length;i+=3){radius=Math.max(radius,Math.hypot(a[i],a[i+2]));top=Math.max(top,a[i+1]);bottom=Math.min(bottom,a[i+1]);}return {radius,top,bottom};};
  const before=extent(relaxed),after=extent(contracted);
  assert.ok(after.radius<before.radius*.9);
  assert.ok(after.bottom<before.bottom-.035&&after.top>before.top,'contraction deepens the umbrella instead of flattening or inverting it');
  assert.ok(after.top-before.top<.05,'central tissue remains stable while the margin curls');
  for(let i=0;i<72;i++){
    model.update(i*.125,{phase:.17,activity:1.4});
    for(const mesh of model.meshes){
      const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,s=mesh.geometry.boundingSphere;
      for(let k=0;k<p.count;k++){
        assert.ok(Number.isFinite(p.getX(k)+p.getY(k)+p.getZ(k)+n.getX(k)+n.getY(k)+n.getZ(k)));
        assert.ok(new Vector3().fromBufferAttribute(p,k).distanceTo(s.center)<=s.radius);
      }
    }
  }
  model.dispose();
});

test('render updates are seekable and do not take ownership of the host transform',()=>{
  const model=createMoonJellyModel();model.group.position.set(3,4,5);model.group.rotation.set(.2,.3,.4);model.group.scale.setScalar(.07);
  const transform={position:model.group.position.toArray(),quaternion:model.group.quaternion.toArray(),scale:model.group.scale.toArray()};
  model.update(5,{phase:.3});const first=model.meshes.map(m=>m.geometry.attributes.position.array.slice());
  model.update(100);model.update(5,{phase:.3});model.meshes.forEach((m,i)=>assert.deepEqual(m.geometry.attributes.position.array,first[i]));
  assert.deepEqual(model.group.position.toArray(),transform.position);assert.deepEqual(model.group.quaternion.toArray(),transform.quaternion);assert.deepEqual(model.group.scale.toArray(),transform.scale);
  model.update(5,{alpha:.2,held:true,phase:.3});assert.ok(model.materials.every(m=>m.depthTest===false&&Math.abs(m.opacity-m.userData.baseOpacity*.2)<1e-12));
  model.update(5,{alpha:1,held:false,phase:.3});assert.ok(model.materials.every(m=>m.depthTest===true));model.dispose();
});

test('all resources are released once and late updates are harmless',()=>{
  const model=createMoonJellyModel();let geometries=0,materials=0;
  model.meshes.forEach(m=>m.geometry.addEventListener('dispose',()=>geometries++));model.materials.forEach(m=>m.addEventListener('dispose',()=>materials++));
  model.dispose();model.dispose();model.update(3);assert.equal(geometries,7);assert.equal(materials,7);
});
