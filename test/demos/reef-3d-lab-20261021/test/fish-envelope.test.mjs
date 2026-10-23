import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Group,Vector3} from 'three';
import {createFishSchool} from '../upstream/scenes/reefscape/src/fish-model.js';
import {applyClownAppearance} from '../clown-appearance.mjs';
import {advanceFishMotion} from '../fish-motion.mjs';
import {CLOWN_ENVELOPE,bodyEnvelope,assertClownMotionEnvelope,clownVertexInterval,verifyClownGeometryEnvelope} from '../fish-envelope.mjs';
import {inspectClownEnvelope,referenceDeformedVertex} from '../probe-fish-envelope.mjs';

const distanceToSegment=([x,y,z],half=.35)=>Math.hypot(Math.max(0,Math.abs(x)-half),y,z);

test('analytic bounds cover every emitted vertex of both pinned LODs and both appearances',()=>{
 const proof=inspectClownEnvelope();assert.equal(proof.geometries.length,4);
 assert.equal(proof.geometries.reduce((n,g)=>n+g.vertices,0),19060);
 for(const g of proof.geometries){assert.ok(g.reserveRaw>.0025);assert.ok(g.maximumRatio<.395);}
 assert.ok(proof.geometries.some(g=>g.maximumRatio>.38),'old capsule does not already prove the new motion');
 const witness=proof.geometries.find(g=>g.variant==='reference'&&g.lod==='FULL').witness;
 const q=Math.max(0,Math.min(1,(.30-witness.x)/1.14));
 const point=referenceDeformedVertex(witness.x,witness.y,witness.z,witness.part,{phase:Math.PI/2+q*3.7,tailAmplitude:.075,bend:.42,rowing:.8});
 assert.ok(distanceToSegment(point)>.38*1.25,'reachable maximal turn actually escapes the old radius');
 assert.ok(distanceToSegment(point)<.395*1.25);
});

test('convex-combination induction covers transition states as well as target extrema',()=>{
 // Analytic induction: for all k in [0,1], a nonnegative tail amplitude A and
 // signed bend B obey A'+|B'| <= (1-k)(A+|B|)+k(At+|Bt|). Both endpoints <=.495.
 // Boundary cases below exercise both signs, sign reversal and a legacy tail.
 for(const initial of [{tailAmplitude:.117,bend:0},{tailAmplitude:.075,bend:.42},{tailAmplitude:.075,bend:-.42}]){
  for(const target of [{A:.001,B:0},{A:.075,B:.42},{A:.075,B:-.42}])for(const k of [0,1e-9,.01,.2,.5,.9,1]){
   const A=initial.tailAmplitude+(target.A-initial.tailAmplitude)*k,B=initial.bend+(target.B-initial.bend)*k;
   assert.ok(A+Math.abs(B)<=(1-k)*(initial.tailAmplitude+Math.abs(initial.bend))+k*(target.A+Math.abs(target.B))+1e-12);
   assertClownMotionEnvelope({tailAmplitude:A,bend:B,rowing:.85});
  }
 }
 // Tie the derivation to the actual motion implementation rather than just the
 // reference arithmetic. Both channels must continue to use the same blend.
 const source=readFileSync(new URL('../fish-motion.mjs',import.meta.url),'utf8');
 assert.match(source,/tailAmplitude=mix\(state\.tailAmplitude\|\|0,tail,blend\)/);
 assert.match(source,/bend=mix\(state\.bend\|\|0,clamp\(turn\*\.15,-\.42,\.42\),blend\)/);
 const state={tailAmplitude:.117,bend:0,rowing:.85,phase:0,pectoral:0};
 for(let i=0;i<2400;i++){
  advanceFishMotion(state,1/60,{speedBL:i%37,turnRate:i%2?4:-4,accelerationBL:i%7-3,behavior:i%3?'evade':'wander',coast:i%11===0});
  assertClownMotionEnvelope(state);
 }
});

test('out-of-contract motion fails closed without changing the passed object',()=>{
 for(const change of [{tailAmplitude:.118},{bend:.421},{rowing:.851},{tailAmplitude:.117,bend:.42},{bend:NaN},{phase:Infinity},{tailAmplitude:-.01}]){
  const f={kind:'clown',profile:{totalLengthM:.074},tailAmplitude:.075,bend:0,rowing:.8,...change},before={...f};
  assert.throws(()=>bodyEnvelope(f),/envelope|finite/);assert.deepEqual(f,before);
 }
 assert.throws(()=>bodyEnvelope({profile:{totalLengthM:NaN}}),/profile/);
});

test('metre mapping retains real TL and proxies, with a conservative rotation sphere',()=>{
 for(const totalLengthM of [.025,.04,.06,.074]){
  const p=Object.freeze({kind:'clown',totalLengthM,radiusM:totalLengthM*.38,lifeStage:null,ageDays:null});
  const e=bodyEnvelope({profile:p});assert.equal(e.radiusM,totalLengthM*.395);assert.equal(e.halfLengthM,totalLengthM*.28);assert.equal(e.rotationRadiusM,e.radiusM+e.halfLengthM);
  assert.ok(e.radiusM>p.radiusM);assert.equal(p.totalLengthM,totalLengthM);assert.equal(p.lifeStage,null);assert.equal(p.ageDays,null);
 }
 const proxy={profile:{radiusM:.045,totalLengthM:0}};
 assert.deepEqual(bodyEnvelope(proxy),{radiusM:.045,halfLengthM:0,rotationRadiusM:.045,version:'sphere-proxy-v1'});
 const predator={kind:'barramundi',profile:{totalLengthM:.25,radiusM:.08}};
 const pred=bodyEnvelope(predator);assert.equal(pred.radiusM,.08);assert.equal(pred.halfLengthM,.07);assert.ok(Math.abs(pred.rotationRadiusM-.15)<1e-12);assert.equal(pred.version,'predator-legacy-proxy-v1');
 const shape={profile:{totalLengthM:.04,radiusM:.004}},generic=bodyEnvelope(shape);
 assert.equal(generic.radiusM,.004);assert.equal(generic.halfLengthM,.016);assert.equal(generic.version,'generic-capsule-v1');
 assert.equal(bodyEnvelope({kind:'clown',profile:shape.profile}).radiusM,.04*.395,'identified animals cannot shrink the capsule by changing a query radius');
 assert.throws(()=>bodyEnvelope({kind:'not-a-known-species',profile:shape.profile}),/Unknown/);
});

test('phase-grid sanity checks stay inside the continuous interval proof, including paired fin translation',()=>{
 const root=new Group(),school=createFishSchool(root,{fish:[{kind:'clown',size:1,position:new Vector3()}]});applyClownAppearance(root);
 let samples=0;
 for(const {mesh} of school.groups[0].lods){
  verifyClownGeometryEnvelope(mesh.geometry);const p=mesh.geometry.attributes.position,a=mesh.geometry.attributes.part;
  for(let i=0;i<p.count;i+=17)for(const phase of [0,.7,Math.PI/2,Math.PI,4.1])for(const pectoral of [-Math.PI/2,0,Math.PI/2])for(const bend of [-.42,.42]){
   const args=[p.getX(i),p.getY(i),p.getZ(i),a.getX(i)],range=clownVertexInterval(...args),point=referenceDeformedVertex(...args,{phase,pectoral,tailAmplitude:.075,bend,rowing:.85});
   assert.ok(point[0]>=range.xMin-1e-9&&point[0]<=range.xMax+1e-9);assert.ok(point[2]>=range.zMin-1e-9&&point[2]<=range.zMax+1e-9);
   assert.ok(distanceToSegment(point)<=range.distanceBound+1e-9);samples++;
  }
 }
 assert.ok(samples>10000);
 const geometries=new Set(),materials=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});
