import test from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {proposeClownTurn,CLOWN_TURN} from '../turning.mjs';
import {OceanWorld} from '../world.mjs';
import {ReefSpatial} from '../spatial.mjs';
const Y=new Vector3(0,1,0),goal=yaw=>new Quaternion().setFromAxisAngle(Y,yaw);

test('repeated left/right and multi-axis goals respect vector angular acceleration and speed',()=>{
  let q=new Quaternion(),v=new Vector3();
  for(let i=0;i<1800;i++){
    const target=i%180<90?goal(1.4):goal(-1.4);if(i>900)target.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),.6));
    const beforeQ=q.toArray(),beforeV=v.toArray(),turn=proposeClownTurn(q,v,target,1/60);
    assert.deepEqual(q.toArray(),beforeQ);assert.deepEqual(v.toArray(),beforeV);
    assert.ok(turn.angularVelocity.clone().sub(v).length()<=CLOWN_TURN.maxAcceleration/60+1e-9);
    assert.ok(turn.angularVelocity.length()<=4+1e-9);assert.ok(q.angleTo(turn.quaternion)<=4/60+1e-7);
    q=turn.quaternion;v=turn.angularVelocity;
  }
  for(let i=0;i<300;i++){const t=proposeClownTurn(q,v,goal(.8),1/60);q=t.quaternion;v=t.angularVelocity;}
  assert.ok(q.angleTo(goal(.8))<1e-5);assert.ok(v.length()<1e-4);
});
test('antipodal quaternion representations take the same path and invalid proposals fail closed',()=>{
 const q=new Quaternion(),v=new Vector3(),g=goal(1),minus=new Quaternion(-g.x,-g.y,-g.z,-g.w);
 assert.ok(proposeClownTurn(q,v,g,1/60).quaternion.angleTo(proposeClownTurn(q,v,minus,1/60).quaternion)<1e-7);
 for(const dt of [0,NaN,.1])assert.throws(()=>proposeClownTurn(q,v,g,dt),/timestep/);
 assert.throws(()=>proposeClownTurn(q,new Vector3(NaN,0,0),g,1/60),/state/);
 assert.throws(()=>proposeClownTurn(new Quaternion(0,0,0,2),v,g,1/60),/state/);
});
test('incremental Yuka steering retains useful turn response and held or blocked fish cannot retain angular momentum',()=>{
 const s=new ReefSpatial(),w=new OceanWorld({empty:true,spatial:s}),f=w.add('clown',.074,{position:new Vector3(0,.4,.3)});
 f.goal.set(0,.4,-.15);f.goalAt=100;
 for(let i=0;i<60;i++)w.step(1/60);
 assert.ok(f.turnVelocity.length()>.3);assert.ok(Math.abs(f.bend)>.05);
 w.setHeld(f.id,true);assert.equal(f.turnVelocity.length(),0);const held=f.quaternion.toArray();w.step(1/60);assert.deepEqual(f.quaternion.toArray(),held);
 w.setHeld(f.id,false);f.turnVelocity.set(0,1,0);s.clearMotion=()=>false;const blocked=f.quaternion.toArray();w.step(1/60);
 assert.deepEqual(f.quaternion.toArray(),blocked);assert.equal(f.turnVelocity.length(),0);s.dispose();
});
test('a water-boundary turn keeps one recovery goal long enough to re-enter instead of rerolling every frame',()=>{
 const w=new OceanWorld({empty:true}),f=w.add('clown',.074,{position:new Vector3(.95-.074*.395-.0001,.4,.3)});f.goalAt=100;f.goal.set(1.5,.4,.3);
 let plans=0;w.chooseGoal=fish=>{plans++;fish.goal.set(-.5,.4,.3);fish.goalAt=w.time+4;};
 const start=f.position.clone();for(let i=0;i<240;i++)w.step(1/60);
 assert.ok(w.stats.blocked>0);assert.ok(plans>=1&&plans<=4);assert.ok(f.position.x<start.x-.05);assert.equal(w.inBounds(f,f.position),true);
});
