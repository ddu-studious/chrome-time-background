import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {advanceFishMotion,createSpecimenState,stepSpecimen,specimenCue} from '../fish-motion.mjs';
import {OceanWorld} from '../world.mjs';
import {ReefSpatial} from '../spatial.mjs';
import {assertClownMotionEnvelope,bodyEnvelope} from '../fish-envelope.mjs';

function animate(cue,seconds=2,state=createSpecimenState().reference){
 for(let i=0;i<seconds*60;i++)advanceFishMotion(state,1/60,cue);
 return state;
}

test('turning has signed body bend, while coast and hover have distinct bounded strokes',()=>{
 const right=animate({speedBL:1.2,turnRate:2}),left=animate({speedBL:1.2,turnRate:-2});
 assert.ok(right.bend>.2);assert.ok(left.bend<-.2);assert.ok(Math.abs(right.bend+left.bend)<1e-10);
 const swimming=animate({speedBL:1.2}),coast=animate({speedBL:1.2,coast:true}),hover=animate({speedBL:.1});
 assert.ok(coast.tailAmplitude<swimming.tailAmplitude*.1);assert.ok(hover.rowing>coast.rowing);assert.ok(hover.tailAmplitude<swimming.tailAmplitude*.2);
 assert.equal(coast.motionLabel,'收尾滑行');assert.equal(hover.motionLabel,'胸鳍悬停');
 const capped=animate({speedBL:Infinity,turnRate:10000,accelerationBL:10000});
 assert.ok(Number.isFinite(capped.phase));assert.ok(capped.bend<=.42);assert.ok(capped.rowing<=.8);
});

test('stroke phases remain continuous through gait transitions and presentation cannot move the animal',()=>{
 const position=new Vector3(3,4,5),velocity=new Vector3(.1,0,0),state={...createSpecimenState().reference,position,velocity};
 let phase=state.phase,pectoral=state.pectoral,tail=state.tailAmplitude;
 for(const cue of [{speedBL:.1},{speedBL:1.2},{speedBL:1.2,coast:true},{speedBL:3,behavior:'evade'},{speedBL:1.2,turnRate:-3}]){
  for(let i=0;i<90;i++){
   advanceFishMotion(state,1/60,cue);
   assert.ok(state.phase>phase&&state.phase-phase<.5);assert.ok(state.pectoral>pectoral&&state.pectoral-pectoral<.5);
   assert.ok(Math.abs(state.tailAmplitude-tail)<.012);
   phase=state.phase;pectoral=state.pectoral;tail=state.tailAmplitude;
  }
 }
 assert.equal(state.position,position);assert.equal(state.velocity,velocity);assert.deepEqual(position.toArray(),[3,4,5]);assert.deepEqual(velocity.toArray(),[.1,0,0]);
 const unchanged={...state};advanceFishMotion(state,NaN,{turnRate:2});assert.deepEqual(state,unchanged);
});

test('comparison root orientation is continuous across every automatic stage and repeated cycle',()=>{
 for(let cycle=0;cycle<3;cycle++)for(const boundary of [4,10,14,18,21,24]){
  const t=cycle*24+boundary,left=specimenCue(t-1e-6),right=specimenCue(t+1e-6);
  assert.ok(Math.abs(left.yaw-right.yaw)<1e-5,`yaw at ${t}`);
  assert.ok(Math.abs(left.turnRate-right.turnRate)<1e-4,`rate at ${t}`);
 }
 const state=createSpecimenState();let yaw=0,sawBend=false,sawCoast=false;
 for(let i=0;i<48*60;i++){
  const before=state.reference.phase;stepSpecimen(state,1/60);
  assert.ok(Math.abs(state.cue.yaw-yaw)<.035);assert.ok(state.reference.phase>before);
  assert.equal(state.legacy.bend,0);yaw=state.cue.yaw;
  if(Math.abs(state.reference.bend)>.1)sawBend=true;
  if(state.cue.mode==='coast'&&state.reference.tailAmplitude<.005)sawCoast=true;
 }
 assert.ok(sawBend);assert.ok(sawCoast);
});

test('new body animation leaves all accepted World trajectories and feeding/holding events identical',()=>{
 const modern=new OceanWorld({seed:73,spatial:new ReefSpatial()}),legacy=new OceanWorld({seed:73,spatial:new ReefSpatial()});
 modern.realisticMotion=true;legacy.realisticMotion=false;let sawBend=false;
 for(let i=0;i<720;i++){
  if(i===40){const point=new Vector3(.1,.6,.3);modern.feed(point);legacy.feed(point);}
  if(i===180){modern.setHeld('clown-1',true);legacy.setHeld('clown-1',true);}
  if(i===240){modern.setHeld('clown-1',false);legacy.setHeld('clown-1',false);}
  modern.step(1/60);legacy.step(1/60);
  assert.deepEqual(modern.snapshot(),legacy.snapshot());
  for(let k=0;k<modern.fish.length;k++){
   const a=modern.fish[k],b=legacy.fish[k];assert.deepEqual(a.velocity.toArray(),b.velocity.toArray());assert.deepEqual(a.quaternion.toArray(),b.quaternion.toArray());
   if(Math.abs(a.bend)>.05)sawBend=true;
  }
 }
 assert.ok(sawBend);assert.equal(modern.stats.feeds,1);
});

test('new body motion remains enabled in reef mode and stays inside the shared analytic envelope',()=>{
 const spatial=new ReefSpatial(),world=new OceanWorld({spatial,empty:true});world.realisticMotion=true;
 const f=world.add('clown',.074,{position:new Vector3(0,.4,.3)});f.goal.set(0,.4,-.15);f.goalAt=100;
 let sawBend=false;for(let i=0;i<60;i++){world.step(1/60);sawBend ||= Math.abs(f.bend)>.05;}assert.ok(sawBend);
 spatial.setActive(true);
 for(let i=0;i<180;i++){
  world.step(1/60);const effort=Math.max(0,Math.min(3,f.velocity.length()/f.cruise));
  assert.doesNotThrow(()=>assertClownMotionEnvelope(f));assert.ok(bodyEnvelope(f).radiusM>f.profile.radiusM);assert.equal(spatial.clearPose(f,f.position,f.quaternion),true);
 }
});
