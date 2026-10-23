import {Group,Vector3,ShaderLib,UniformsUtils} from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createFishSchool} from './upstream/scenes/reefscape/src/fish-model.js';
import {applyClownAppearance} from './clown-appearance.mjs';
import {CLOWN_ENVELOPE,bodyEnvelope,verifyClownGeometryEnvelope} from './fish-envelope.mjs';

const sha=file=>createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex');
const shader=()=>({vertexShader:ShaderLib.standard.vertexShader,fragmentShader:ShaderLib.standard.fragmentShader,uniforms:UniformsUtils.clone(ShaderLib.standard.uniforms)});

/** Independent validation reference for emitted vertices, not a runtime renderer. */
export function referenceDeformedVertex(x,y,z,part,{phase=0,pectoral=0,tailAmplitude=0,bend=0,rowing=0}={}){
  const q=Math.max(0,Math.min(1,(.30-x)/1.14)),h=Math.max(0,Math.min(1,(.30-x)*3.4));
  let px=x,pz=z+(Math.sin(phase-q*3.7)*tailAmplitude+bend)*q*q;
  if(part>1.5&&part<3.5){const row=Math.sin(pectoral)*rowing;px-=row*h*h*.034;pz+=Math.sign(z)*row*h*.050;}
  return [px+.085,y,pz];
}

export function inspectClownEnvelope(){
  const sourceFiles=['upstream/scenes/reefscape/src/fish-model.js','clown-appearance.mjs','fish-motion.mjs','fish-envelope.mjs'];
  const sources=Object.fromEntries(sourceFiles.map(file=>[file,sha(file)]));
  if(sources[sourceFiles[0]]!==CLOWN_ENVELOPE.upstreamSha256)throw new Error('Pinned fish deformation source changed; rederive its envelope');
  if(sources[sourceFiles[1]]!==CLOWN_ENVELOPE.appearanceSha256)throw new Error('Clown appearance source changed; revalidate geometry and shader envelope');
  if(sources[sourceFiles[2]]!==CLOWN_ENVELOPE.motionSha256)throw new Error('Clown motion source changed; reprove the joint interpolation invariant');
  const root=new Group(),school=createFishSchool(root,{fish:[{kind:'clown',size:1,position:new Vector3()}]});
  const originalShader=shader();school.groups[0].material.onBeforeCompile(originalShader,{});
  const geometries=[];
  try{
    for(const variant of ['legacy','reference']){
      applyClownAppearance(root,{variant});
      const compiled=shader();school.groups[0].material.onBeforeCompile(compiled,{});
      if(compiled.vertexShader!==originalShader.vertexShader)throw new Error('Appearance adapter added vertex displacement outside the proven shader');
      for(const [index,{mesh}] of school.groups[0].lods.entries())geometries.push({variant,lod:index===0?'FULL':'FAR',...verifyClownGeometryEnvelope(mesh.geometry)});
    }
  }finally{
    const g=new Set(),m=new Set();root.traverse(o=>{if(o.geometry)g.add(o.geometry);if(o.material)m.add(o.material);});g.forEach(o=>o.dispose());m.forEach(o=>o.dispose());root.clear();
  }
  const minimumReserveRatio=Math.min(...geometries.map(g=>g.reserveRatio));
  const sizes=[.025,.04,.06,.074].map(totalLengthM=>{
    const envelope=bodyEnvelope({profile:{kind:'clown',totalLengthM}}),oldRadius=totalLengthM*.38,oldHalf=totalLengthM*.28;
    return {totalLengthM,...envelope,minimumAnalyticReserveM:minimumReserveRatio*totalLengthM,
      previous:{radiusM:oldRadius,halfLengthM:oldHalf,rotationRadiusM:oldRadius+oldHalf},
      radiusIncreaseM:envelope.radiusM-oldRadius,rotationIncreaseM:envelope.rotationRadiusM-oldRadius-oldHalf};
  });
  return {version:CLOWN_ENVELOPE.version,sources,contract:CLOWN_ENVELOPE,geometries,sizes,
    proof:[
      'Legacy states: tail<=.117, bend=0, row<=.85. Reference targets: tail<=.075, |bend|<=.42, row<=.8.',
      'Same blend coefficient for tail and bend preserves tail+|bend|<=.495 by convexity. Runtime rejects violations without clipping.',
      'For every vertex and every real phase, abs(flex)<=.495*q^2, abs(finX)<=.85*h^2*.034, abs(finZ)<=.85*h*.05.',
      'Raw vertex X is shifted by +.085 before metre conversion TL/1.25. Interval maximum distance to [-.35,.35] is checked for every FULL/FAR vertex.',
      'Each capsule is convex. Every GPU triangle lies in the convex hull of its deformed vertices, so complete vertex coverage covers its surface.',
      'This proves bounded shape containment at any pose; swept translation/rotation and terrain collision remain separate runtime checks.',
    ]};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(inspectClownEnvelope(),null,2));
