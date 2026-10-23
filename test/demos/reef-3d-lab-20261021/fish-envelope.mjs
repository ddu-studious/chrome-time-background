import {EXTRA_FISH} from './community-catalog.mjs';
// Geometry contract for the pinned Deskworlds clown factory + reference appearance.
// Values are ratios of declared total length (TL), not new biological dimensions.
export const CLOWN_ENVELOPE = Object.freeze({
  version:'clown-analytic-v1',modelTL:1.25,modelCenterOffset:.085,
  upstreamSha256:'a41e43340f06c51622ca8312c1e97dd6f8ad4c9b7d34d8823e0b95a9c4a75cc4',
  appearanceSha256:'6c9cd1246352a7e0106fd4c70e26f11fd54300ce5e8143739bedf8dd71acc63d',
  motionSha256:'c72a433b7a3bfd90b91067dc2ef412bc23d4098d75e7a41a19a84da1bbb27f21',
  radiusRatio:.395,halfLengthRatio:.28,
  tailMaximum:.117,bendMaximum:.42,rowingMaximum:.85,combinedFlexMaximum:.495,
  // Shader displacement uses rest-position x, before the paired-fin translation.
  flexStart:.30,flexLength:1.14,rowHingeGain:3.4,rowAxial:.034,rowLateral:.050,
});
const EPS=1e-9;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/** Fail closed, never silently clip a rendered state to fit its collision proxy.
 * Legacy states have A<=.117, bend=0, row<=.85. Reference targets have A<=.075,
 * |bend|<=.42, row<=.8. Both A and bend use the same interpolation coefficient:
 * A'+|b'| <= (1-k)(A+|b|)+k(At+|bt|) <= .495. Initialization and transitions from
 * legacy satisfy this invariant. Arbitrary states violating it are rejected. */
export function assertClownMotionEnvelope(f){
  const A=f.tailAmplitude??0,B=f.bend??0,R=f.rowing??0;
  if(!Number.isFinite(A)||!Number.isFinite(B)||!Number.isFinite(R)||
    A<-EPS||R<-EPS||A>CLOWN_ENVELOPE.tailMaximum+EPS||
    Math.abs(B)>CLOWN_ENVELOPE.bendMaximum+EPS||R>CLOWN_ENVELOPE.rowingMaximum+EPS||
    Math.abs(A)+Math.abs(B)>CLOWN_ENVELOPE.combinedFlexMaximum+EPS)
    throw new RangeError('Clown animation exceeds the proven body envelope');
  for(const name of ['phase','pectoral'])if(f[name]!==undefined&&!Number.isFinite(f[name]))
    throw new RangeError('Clown animation phase is not finite');
}

/** One capsule in the physical entity frame. Its segment is [-half,+half] on X.
 * The rotation sphere encloses the whole capsule. Kind-less TL=0 objects are the
 * navigation's existing spherical query proxies and retain their exact radius. */
export function bodyEnvelope(f){
  const p=f?.profile,L=p?.totalLengthM,kind=f?.kind??p?.kind;
  if(!p||!Number.isFinite(L)||L<0)throw new TypeError('Invalid body envelope profile');
  if(L===0&&kind===undefined){
    if(!Number.isFinite(p.radiusM)||p.radiusM<0)throw new TypeError('Invalid sphere query proxy');
    return {radiusM:p.radiusM,halfLengthM:0,rotationRadiusM:p.radiusM,version:'sphere-proxy-v1'};
  }
  if(kind==='clown'){
    if(L<=0)throw new TypeError('Clown total length must be positive');
    assertClownMotionEnvelope(f);
    const radiusM=L*CLOWN_ENVELOPE.radiusRatio,halfLengthM=L*CLOWN_ENVELOPE.halfLengthRatio;
    return {radiusM,halfLengthM,rotationRadiusM:radiusM+halfLengthM,version:CLOWN_ENVELOPE.version};
  }
  if(Object.hasOwn(EXTRA_FISH,kind)){
    if(L<=0)throw new TypeError('Invalid fish length');
    const shape=EXTRA_FISH[kind].shape,radiusM=L*shape.radiusRatio;
    return {radiusM,halfLengthM:0,rotationRadiusM:radiusM,version:shape.proof};
  }
  if((kind!==undefined&&kind!=='barramundi')||L<=0||!Number.isFinite(p.radiusM)||p.radiusM<0)throw new TypeError('Unknown body envelope kind');
  // Existing predator or explicit kind-less shape query; neither is promoted to
  // an asset proof. A known clown can never bypass its bounds by shrinking radiusM.
  const radiusM=p.radiusM,halfLengthM=Math.max(L*.28,L*.5-radiusM);
  return {radiusM,halfLengthM,rotationRadiusM:radiusM+halfLengthM,version:kind===undefined?'generic-capsule-v1':'predator-legacy-proxy-v1'};
}

/** Continuous analytic interval, in raw model units, for a single actual vertex.
 * sin is bounded for every real phase; correlation is discarded conservatively.
 * The GPU emits deformed triangle vertices and linearly rasterizes their interior.
 * A capsule is convex, so covering every emitted vertex also covers every triangle.
 * This is not a temporal sampling proof or a copy of the rendering shader. */
export function clownVertexInterval(x,y,z,part){
  if(![x,y,z,part].every(Number.isFinite))throw new TypeError('Non-finite clown vertex');
  const c=CLOWN_ENVELOPE,q=clamp((c.flexStart-x)/c.flexLength,0,1),h=clamp((c.flexStart-x)*c.rowHingeGain,0,1);
  const paired=part>1.5&&part<3.5;
  const axial=paired?c.rowingMaximum*h*h*c.rowAxial:0;
  const lateral=c.combinedFlexMaximum*q*q+(paired?c.rowingMaximum*h*c.rowLateral:0);
  const center=x+c.modelCenterOffset,half=c.halfLengthRatio*c.modelTL;
  const xBeyondSegment=Math.max(0,Math.abs(center)+axial-half);
  const zMaximum=Math.abs(z)+lateral;
  return {xMin:center-axial,xMax:center+axial,y,zMin:z-lateral,zMax:z+lateral,
    distanceBound:Math.hypot(xBeyondSegment,y,zMaximum)};
}

/** Validate a complete generated FULL/FAR geometry, not a hand-selected mesh subset.
 * The small positive reserve covers floating point evaluation; fail if an asset edit
 * consumes it. This utility is for build/tests/probes, not the per-frame hot path. */
export function verifyClownGeometryEnvelope(geometry){
  const p=geometry?.attributes?.position,a=geometry?.attributes?.part;
  if(!p||!a||p.count!==a.count||p.count<1||p.count>100000)throw new TypeError('Invalid clown geometry for envelope validation');
  let maximum=0,witness=null;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),part=a.getX(i),range=clownVertexInterval(x,y,z,part);
    if(range.distanceBound>maximum){maximum=range.distanceBound;witness={index:i,x,y,z,part,...range};}
  }
  const radius=CLOWN_ENVELOPE.radiusRatio*CLOWN_ENVELOPE.modelTL,reserve=radius-maximum;
  if(reserve<.0025)throw new RangeError('Clown geometry exceeds its proven envelope or numeric reserve');
  return {version:CLOWN_ENVELOPE.version,vertices:p.count,maximumRaw:maximum,radiusRaw:radius,
    halfLengthRaw:CLOWN_ENVELOPE.halfLengthRatio*CLOWN_ENVELOPE.modelTL,reserveRaw:reserve,
    maximumRatio:maximum/CLOWN_ENVELOPE.modelTL,reserveRatio:reserve/CLOWN_ENVELOPE.modelTL,witness};
}
