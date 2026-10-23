import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Ray,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
import {ReefSpatial} from '../spatial.mjs';
import {OceanWorld} from '../world.mjs';
import {enterExperience,foodDropPoint} from '../experience.mjs';

const screen={x:400,y:300};
function feedView(point=new Vector3(0,.4,.3)){
  return {width:800,height:600,pointerPlane:()=>point.clone(),ray:()=>new Ray(new Vector3(0,.4,2),point.clone().sub(new Vector3(0,.4,2)).normalize())};
}
function space(){
  const s=new ReefSpatial(),mesh=new Mesh(new BoxGeometry(1,1,1),new MeshBasicMaterial());
  // Render geometry uses decimetres; the cube spans 0.10 m.
  mesh.position.set(0,4,3);s.setMeshes([{mesh}]);s.setActive(true);
  return {s,dispose(){s.dispose();mesh.geometry.dispose();mesh.material.dispose();}};
}
test('drag feed rejects out-of-water and nonfinite screen positions without producing food',()=>{
  const spatial=new ReefSpatial(),v=feedView();
  for(const point of [{x:NaN,y:2},{x:-1,y:3},{x:801,y:20},null])assert.equal(foodDropPoint(v,spatial,point),null);
  for(const point of [new Vector3(1,.4,.3),new Vector3(0,.9,.3),new Vector3(0,.4,Infinity)])assert.equal(foodDropPoint(feedView(point),spatial,screen),null);
  spatial.dispose();
});
test('BVH blocks feeding inside/behind a reef and checks the whole scatter footprint',()=>{
  const {s,dispose}=space();
  assert.equal(foodDropPoint(feedView(),s,screen),null);
  assert.equal(foodDropPoint(feedView(new Vector3(0,.4,.1)),s,screen),null);
  // Clear centre ray, but 3.8 cm pellet-scatter clearance still overlaps the cube.
  assert.equal(foodDropPoint(feedView(new Vector3(.075,.4,.3)),s,screen),null);
  const legal=foodDropPoint(feedView(new Vector3(.12,.4,.3)),s,screen);assert.ok(legal);
  s.setActive(false);assert.ok(foodDropPoint(feedView(),s,screen));dispose();
});
test('accepted projected feed uses existing World limits, cooldown and actual eating receipts',()=>{
  const world=new OceanWorld({empty:true}),spatial=new ReefSpatial();
  const f=world.add('clown',.074,{position:new Vector3(0,.4,.3)}),p=foodDropPoint(feedView(world.mouth(f)),spatial,screen);
  const result=world.feed(p);assert.equal(result.ok,true);assert.ok(world.pellets.every(pellet=>pellet.position.distanceTo(p)<.036));
  assert.equal(world.stats.eaten,0);assert.equal(world.feed(p).ok,false);
  for(let i=0;i<120;i++)world.step(1/60);
  assert.ok(world.stats.eaten>0);assert.ok(world.pellets.length<=24);spatial.dispose();
});
test('habitat shortcuts preserve resident identities, physical sizes, food, clock and style',async()=>{
  const world=new OceanWorld();world.feed();world.step(1/60);
  const residents=world.fish.slice(),sizes=residents.map(f=>f.profile),food=world.pellets,time=world.time;
  const view={world,animalStyle:'soft',sceneKind:'crevice',reefVisible:false,async setScene(kind){this.sceneKind=kind;},async setReef(on){this.reefVisible=on;},render(){}};
  for(const kind of ['reef','water','reef']){
    assert.equal(await enterExperience(view,kind,mode=>{view.mode=mode;}),true);
    assert.equal(view.mode,'natural');assert.equal(view.reefVisible,kind==='reef');assert.equal(view.animalStyle,'soft');
    assert.equal(world.time,time);assert.equal(world.pellets,food);world.fish.forEach((f,i)=>{assert.equal(f,residents[i]);assert.equal(f.profile,sizes[i]);});
  }
});
test('failed or disposed habitat loads never claim a successful shortcut',async()=>{
  let committed=0;const view={async setScene(){throw new Error('fixture: missing roadmap');},setReef(){committed++;},render(){}};
  await assert.rejects(enterExperience(view,'reef',()=>{committed++;}),/missing roadmap/);assert.equal(committed,0);
  view.setScene=async()=>{};view.disposed=true;assert.equal(await enterExperience(view,'reef',()=>{committed++;}),false);assert.equal(committed,0);
  view.disposed=false;view.setReef=async()=>false;await assert.rejects(enterExperience(view,'reef',()=>{}),/造景加载/);
});
