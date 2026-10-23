import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshBasicMaterial,Quaternion,Vector3} from 'three';
import {routeLookAhead,routeMadeProgress} from '../route-following.mjs';
import {OceanWorld} from '../world.mjs';
import {ReefSpatial} from '../spatial.mjs';
import {bodyEnvelope} from '../fish-envelope.mjs';
import {profile} from '../catalog.mjs';

const V=(x=0,y=0,z=0)=>new Vector3(x,y,z);
const Q=()=>new Quaternion();

function actor(position=V(),length=.04){
  return {kind:'clown',profile:profile('test-clown','clown',length),position,
    velocity:V(.08,0,0),direction:V(1,0,0),quaternion:Q(),cruise:.035+length*.55,
    tailAmplitude:.025,bend:0,rowing:.5,phase:0,pectoral:0};
}

function obstacleSpatial(size,position){
  // ReefSpatial consumes the renderer's decimetre coordinates.
  const mesh=new Mesh(new BoxGeometry(...size),new MeshBasicMaterial());
  mesh.position.copy(position);mesh.updateMatrixWorld(true);
  const spatial=new ReefSpatial();spatial.setMeshes([{mesh,solid:true}]);spatial.setActive(true);
  return {spatial,dispose(){spatial.dispose();mesh.geometry.dispose();mesh.material.dispose();}};
}

function corridorNavigation(spatial){
  return {clearEdge(f,a,b){return spatial.clearCorridor(a,b,bodyEnvelope(f).rotationRadiusM*1.08+.0002);}};
}

function openNavigation(spatial){
  const corridor=corridorNavigation(spatial);
  return {version:1,isFull:true,sites:{y:0},contains:()=>true,clearPoint:()=>true,
    clearEdge:corridor.clearEdge,route:(_f,_from,to)=>[to.clone()],wander:()=>null};
}

test('look-ahead shortens at a real BVH reef corner instead of cutting the blocked diagonal',()=>{
  const fixture=obstacleSpatial([2.4,8,2.4],V(-.8,4,.8));
  try{
    const f=actor(V(.03,.4,-.08));f.velocity.set(.4,0,0);
    const navigation=corridorNavigation(fixture.spatial);
    const route={start:V(-.12,.4,-.08),points:[V(.08,.4,-.08),V(.08,.4,.12)],index:0};
    assert.equal(navigation.clearEdge(f,route.start,route.points[0]),true);
    assert.equal(navigation.clearEdge(f,route.points[0],route.points[1]),true);
    const fullLook=.118;
    const diagonal=V(.08,.4,-.08+fullLook-.05);
    assert.equal(navigation.clearEdge(f,f.position,diagonal),false,'full look-ahead cuts inside the rock corner');
    const aim=routeLookAhead(f,route,navigation);
    assert.equal(aim.validated,true);
    assert.equal(navigation.clearEdge(f,f.position,aim.target),true);
    assert.ok(aim.target.z<diagonal.z,'the selected target stays on the shorter clear approach');
    assert.equal(route.index,0,'a blocked corner must not be marked passed');
  }finally{fixture.dispose();}
});

test('a fish passing beside a waypoint advances only when its connection to the next waypoint is clear',()=>{
  const f=actor(V(.011,.4,.008));
  const makeRoute=()=>({start:V(-.1,.4,0),points:[V(0,.4,0),V(.1,.4,0)],index:0});
  const clearRoute=makeRoute(),blockedRoute=makeRoute();
  assert.ok(f.position.distanceTo(clearRoute.points[0])>.006,'outside the old exact-waypoint radius');
  const aim=routeLookAhead(f,clearRoute,{clearEdge:()=>true});
  assert.equal(clearRoute.index,1);assert.equal(aim.advanced,1);
  routeLookAhead(f,blockedRoute,{clearEdge:()=>false});
  assert.equal(blockedRoute.index,0);
});

test('circling a route waypoint does not refresh the no-progress timer',()=>{
  const route={points:[V(),V(.2,0,0)],index:0,progressAt:0};
  assert.equal(routeMadeProgress(route,V(.05,0,0),0),true);
  for(let i=1;i<=40;i++){
    const angle=i*Math.PI/10;
    assert.equal(routeMadeProgress(route,V(.05*Math.cos(angle),0,.05*Math.sin(angle)),i*.1),false);
  }
  assert.equal(route.progressAt,0);
  assert.equal(routeMadeProgress(route,V(.04,0,0),5),true);
  assert.equal(route.progressAt,5);
});

for(const [label,end] of [['left',V(0,.35,.15)],['right',V(0,.35,-.15)],['vertical',V(0,.55,0)]]){
  test(`${label} route turn keeps moving, reaches the destination, and respects the rotation limit`,()=>{
    const spatial=new ReefSpatial();spatial.setActive(true);
    const world=new OceanWorld({empty:true,spatial});world.navigation=openNavigation(spatial);
    const f=world.add('clown',.04,{position:V(-.3,.35,0)});f.goalAt=100;
    world.setRoute(f,[V(0,.35,0),end],'shelter');
    let movingTurns=0,turnFrames=0,maxTurn=0,arrived=false;
    for(let i=0;i<600&&!arrived;i++){
      const oldPosition=f.position.clone(),oldDirection=f.direction.clone();
      world.step(1/60);
      const turn=oldDirection.angleTo(f.direction),distance=oldPosition.distanceTo(f.position);
      maxTurn=Math.max(maxTurn,turn);
      if(turn>.002){turnFrames++;if(distance>1e-5)movingTurns++;}
      assert.equal(spatial.clearPose(f,f.position,f.quaternion),true);
      arrived=world.events.some(e=>e.type==='hidden');
    }
    assert.equal(arrived,true,'the follower must not circle the intermediate waypoint');
    assert.ok(f.position.distanceTo(end)<.01);
    assert.ok(movingTurns>=8,'ordinary cornering must include simultaneous translation and rotation');
    assert.ok(movingTurns/turnFrames>.8,'ordinary turns should not mostly pivot in place');
    assert.ok(maxTurn<=4/60+1e-7);
    assert.equal(world.stats.routeAbandons,0);
  });
}

test('a blocked unseen-target search retries twice, preserves hunt memory, and abandons without stale seek state',()=>{
  const spatial={active:true,clearPose:()=>true,clearMotion:(_f,a,b)=>a.distanceToSquared(b)<1e-20,
    lineOfSight:()=>false,avoidance:()=>V()};
  const world=new OceanWorld({empty:true,spatial});let plans=0;
  world.navigation={version:1,isFull:true,sites:{y:0},contains:()=>true,clearPoint:()=>true,
    clearEdge:()=>false,route:(_f,_from,to)=>{plans++;return [to.clone()];},wander:()=>null,searchExit:()=>null};
  const prey=world.add('clown',.04,{position:V(.3,.4,0)}),pred=world.add('barramundi',.25,{position:V(-.4,.4,0)});
  prey.goalAt=pred.goalAt=100;world.setPredation(true);
  const hunt={target:prey.id,start:0,phase:'hunt',visible:false,seen:0,lastSeen:V(.1,.4,.1)};
  pred.hunt=hunt;world.setRoute(pred,[V(.3,.4,.1)],'search');
  const memory=hunt.lastSeen.clone();let observedRetries=0;
  assert.doesNotThrow(()=>{
    for(let i=0;i<600;i++){
      world.step(1/60);
      if(pred.hunt){
        assert.equal(pred.hunt,hunt);assert.equal(hunt.start,0);assert.equal(hunt.seen,0);
        assert.deepEqual(hunt.lastSeen.toArray(),memory.toArray());
        observedRetries=Math.max(observedRetries,pred.route?.retries||0);
      }
    }
  });
  assert.equal(observedRetries,2);assert.equal(plans,2);assert.equal(world.stats.routeRetries,2);
  assert.equal(world.stats.routeAbandons,1);assert.equal(pred.hunt,null);assert.equal(pred.route,null);
  assert.ok(world.events.some(e=>e.type==='escape'&&e.reason==='route-stalled'));
  assert.equal(world.events.filter(e=>e.type==='route-abandoned').length,1);
  assert.ok(world.events.length<=80);
});

test('clownfish rotation sweep rejects an intermediate reef collision despite legal endpoint poses',()=>{
  const fixture=obstacleSpatial([.005,.3,.005],V(.268,0,.268));
  try{
    const f=actor(V(),.06),qa=Q(),qb=new Quaternion().setFromAxisAngle(V(0,1,0),-Math.PI/2);
    const midpoint=qa.clone().slerp(qb,.5);
    assert.equal(fixture.spatial.clearPose(f,f.position,qa),true);
    assert.equal(fixture.spatial.clearPose(f,f.position,qb),true);
    assert.equal(fixture.spatial.clearPose(f,f.position,midpoint),false,'the real body overlaps the rock while turning');
    const queries=fixture.spatial.queryCount;
    assert.equal(fixture.spatial.clearMotion(f,f.position,f.position,qa,qb),false);
    assert.ok(fixture.spatial.queryCount>queries,'rejection must use geometry, not only the bounded sample-count guard');
    fixture.spatial.entries[0].mesh.position.z=1;fixture.spatial.updateMatrices();
    assert.equal(fixture.spatial.clearMotion(f,f.position,f.position,qa,qb),true,'the same turn is valid in clear water');
  }finally{fixture.dispose();}
});

test('swept validation checks the starting pose rather than allowing an intersecting fish to move out',()=>{
  const fixture=obstacleSpatial([.005,.3,.005],V(.268,0,.268));
  try{
    const f=actor(V(),.06),start=new Quaternion().setFromAxisAngle(V(0,1,0),-Math.PI/4),end=Q();
    assert.equal(fixture.spatial.clearPose(f,f.position,start),false);
    assert.equal(fixture.spatial.clearPose(f,f.position,end),true);
    assert.equal(fixture.spatial.clearMotion(f,f.position,f.position,start,end),false);
  }finally{fixture.dispose();}
});

test('a newly planned roaming route follows its first clear segment on the very first step',()=>{
  const spatial=new ReefSpatial();spatial.setActive(true);
  const world=new OceanWorld({empty:true,spatial}),nav=openNavigation(spatial);world.navigation=nav;
  const f=world.add('clown',.04,{position:V(-.3,.4,0)});f.goalAt=0;
  nav.wander=()=>({target:V(0,.4,.3),path:[V(.15,.4,0),V(0,.4,.3)]});
  let centerChecks=0;nav.clearPoint=()=>{centerChecks++;return true;};
  world.step(1/60);
  assert.ok(f.route);assert.ok(centerChecks>0);assert.ok(f.position.x>-.3);
  assert.ok(Math.abs(f.position.z)<1e-10,'must not initially steer toward the obstructed final destination');
  assert.ok(f.quaternion.angleTo(Q())<1e-7);
});

test('an expired wander timer cannot install a roaming route while a fish is hiding',()=>{
  const spatial=new ReefSpatial();spatial.setActive(true);
  const world=new OceanWorld({empty:true,spatial}),nav=openNavigation(spatial);world.navigation=nav;
  const f=world.add('clown',.04,{position:V(0,.4,0)});f.goalAt=0;f.hideUntil=4;f.refuge=V(0,.4,0);f.refugeExit=V(.2,.4,0);
  let wanderCalls=0;nav.wander=()=>{wanderCalls++;return {target:V(.4,.4,0),path:[V(.4,.4,0)]};};
  for(let i=0;i<120;i++)world.step(1/60);
  assert.equal(wanderCalls,0);assert.equal(f.route,null);assert.equal(f.behavior,'hiding');
  for(let i=0;i<130;i++)world.step(1/60);
  assert.equal(f.route?.kind,'emerge');
});

test('acquiring visible prey replaces an old roaming route instead of following it during the hunt',()=>{
 const spatial=new ReefSpatial(),world=new OceanWorld({empty:true,spatial});world.navigation=openNavigation(spatial);
 const prey=world.add('clown',.04,{position:V(.2,.4,0)}),pred=world.add('barramundi',.25,{position:V(-.2,.4,0)});
 world.setRoute(pred,[V(-.4,.4,.2)],'roam');pred.nextHunt=0;world.setPredation(true);world.updateHunt(pred,1/60);
 assert.equal(pred.hunt?.target,prey.id);assert.equal(pred.route,null);assert.equal(pred.routeAim,null);
});
test('unreachable roaming remains throttled even when every attempted motion is blocked',()=>{
 const spatial={active:true,clearPose:()=>true,clearMotion:()=>false,lineOfSight:()=>true,avoidance:()=>V()};
 const world=new OceanWorld({empty:true,spatial}),nav=openNavigation(spatial);world.navigation=nav;
 let plans=0;nav.wander=()=>{plans++;return null;};
 const f=world.add('clown',.04,{position:V(0,.4,0)});f.goalAt=0;
 for(let i=0;i<600;i++)world.step(1/60);
 assert.ok(plans>=2&&plans<=4,'planning failures must not reset the cooldown on every blocked frame');
 assert.ok(world.stats.blocked>0);assert.equal(f.route,null);
});
