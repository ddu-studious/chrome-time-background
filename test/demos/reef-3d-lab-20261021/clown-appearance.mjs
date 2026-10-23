import { Vector3 } from 'three';

// A reversible, scene-local edit of the mesh produced by the public
// createFishSchool factory. No original source or hidden material factory is copied.
// These modest proportions are visual hypotheses for the comparison sample, not
// measurements of a specimen, age morphs or permission to enter an existing BVH.
export const CLOWN_APPEARANCE = Object.freeze({
  version: 1, bodyWidthGain: .14, cheekWidthGain: .08,
  eyeScale: 1.12, pelvicTipShortening: .16,
  reference: 'https://australian.museum/learn/animals/fishes/eastern-clown-anemonefish-amphiprion-percula/',
  scope: 'obstacle-free-comparison',
});

const geometryStates = new WeakMap(), materialStates = new WeakMap();
const PROGRAM_SUFFIX = '/clown-reference-v1';
const LIGHTS = '#include <lights_physical_fragment>';
// Runs after upstream colour/normal/roughness work, before Three builds the PBR
// material. Keep the upstream eyes, stripes, fin rays, scale relief and water light.
const SURFACE = `
  // Reference sample: a softer wet-skin highlight and a thin paired-fin membrane.
  if(vPart < .5){
    roughnessFactor=clamp(roughnessFactor+.11,.34,.82);
    fishSpecular*=.78;
  }else if(vPart>1.5 && vPart<3.5){
    float freeMargin=smoothstep(.12,.95,vSkinUv.y);
    diffuseColor.a*=1.-.17*freeMargin;
    roughnessFactor=max(roughnessFactor,.54);
  }
`;

function widthGain(x){
  const u=(.54-x)/.98;
  const trunk=Math.exp(-(((u-.37)/.37)**2));
  const cheek=Math.exp(-(((u-.16)/.12)**2));
  return 1+CLOWN_APPEARANCE.bodyWidthGain*trunk+CLOWN_APPEARANCE.cheekWidthGain*cheek;
}

function measure(geometry){
  geometry.computeBoundingBox();
  const b=geometry.boundingBox;
  return {min:b.min.toArray(),max:b.max.toArray(),length:b.max.x-b.min.x,
    depth:b.max.y-b.min.y,width:b.max.z-b.min.z};
}

function smoothCoincidentNormals(geometry,originalNormals){
  // Recompute after the spatial edit, then join duplicated seam vertices only
  // within the same anatomical part. This also repairs the eye's degenerate hub
  // triangles without erasing the fin/body junction.
  geometry.computeVertexNormals();
  const p=geometry.attributes.position,n=geometry.attributes.normal,part=geometry.attributes.part;
  const clusters=new Map();
  for(let i=0;i<p.count;i++){
    const key=[part.getX(i),p.getX(i).toFixed(6),p.getY(i).toFixed(6),p.getZ(i).toFixed(6)].join(':');
    let c=clusters.get(key);if(!c){c={sum:new Vector3(),ids:[]};clusters.set(key,c);}
    c.sum.add(new Vector3(n.getX(i),n.getY(i),n.getZ(i)));c.ids.push(i);
  }
  for(const {sum,ids} of clusters.values()){
    if(sum.lengthSq()<1e-12){
      const i=ids[0];sum.set(originalNormals[i*3],originalNormals[i*3+1],originalNormals[i*3+2]);
    }
    if(sum.lengthSq()<1e-12)sum.set(0,0,1);
    sum.normalize();for(const i of ids)n.setXYZ(i,sum.x,sum.y,sum.z);
  }
  n.needsUpdate=true;
}

function reshape(geometry,variant){
  const p=geometry.attributes.position,n=geometry.attributes.normal,part=geometry.attributes.part,uv=geometry.attributes.uv;
  if(!p||!n||!part||!uv)throw new Error('Clown appearance requires public anatomical geometry attributes');
  let state=geometryStates.get(geometry);
  if(!state){state={positions:p.array.slice(),normals:n.array.slice(),variant:'legacy',before:measure(geometry)};geometryStates.set(geometry,state);}
  if(state.variant===variant)return {before:state.before,after:measure(geometry)};
  p.array.set(state.positions);n.array.set(state.normals);
  if(variant==='reference'){
    // Locate each eye from its actual public vertices, not a copied private
    // species definition. The center hub has uv=(0,0), repeated around the fan.
    const eyes=new Map();
    for(let i=0;i<p.count;i++)if(part.getX(i)===4&&Math.hypot(uv.getX(i),uv.getY(i))<1e-6){
      const side=Math.sign(p.getZ(i));if(!eyes.has(side))eyes.set(side,new Vector3(p.getX(i),p.getY(i),p.getZ(i)));
    }
    if(eyes.size!==2)throw new Error('Clown appearance requires two eye center anchors');
    for(let i=0;i<p.count;i++){
      const organ=part.getX(i);let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(organ===4){const center=eyes.get(Math.sign(z));x=center.x+(x-center.x)*CLOWN_APPEARANCE.eyeScale;y=center.y+(y-center.y)*CLOWN_APPEARANCE.eyeScale;z=center.z+(z-center.z)*CLOWN_APPEARANCE.eyeScale;}
      if(organ===3){
        // Shorten only the free pelvic margin. uv.y=0 is the unchanged insertion
        // into the body; x (including the nose/tail extrema) stays unchanged.
        const free=Math.max(0,Math.min(1,uv.getY(i)));
        y*=1-CLOWN_APPEARANCE.pelvicTipShortening*free*free;
      }
      z*=widthGain(x);
      p.setXYZ(i,x,y,z);
    }
    smoothCoincidentNormals(geometry,state.normals);
  }
  p.needsUpdate=true;n.needsUpdate=true;geometry.computeBoundingSphere();
  state.variant=variant;
  const after=measure(geometry);
  if(Math.abs(after.length-state.before.length)>1e-6||Math.abs(after.min[0]-state.before.min[0])>1e-6)throw new Error('Clown appearance changed the total-length anchors');
  return {before:state.before,after};
}

function shade(material,variant){
  let state=materialStates.get(material);
  if(!state){state={compile:material.onBeforeCompile,key:material.customProgramCacheKey,variant:'legacy'};materialStates.set(material,state);}
  if(state.variant===variant)return;
  if(variant==='reference'){
    material.onBeforeCompile=function(shader,renderer){
      state.compile.call(this,shader,renderer);
      if(!shader.fragmentShader.includes('varying float vPart;')||shader.fragmentShader.split(LIGHTS).length!==2)throw new Error('Clown appearance shader contract changed');
      shader.fragmentShader=shader.fragmentShader.replace(LIGHTS,SURFACE+'\n'+LIGHTS);
    };
    material.customProgramCacheKey=function(){return state.key.call(this)+PROGRAM_SUFFIX;};
  }else{
    material.onBeforeCompile=state.compile;material.customProgramCacheKey=state.key;
  }
  state.variant=variant;material.needsUpdate=true;
}

/** Apply to a scene-local Three.Group filled by createFishSchool. Calling legacy
 * restores exact original position/normal buffers and shader hooks. The returned
 * envelope is static model-local evidence, not an animated collision proxy. */
export function applyClownAppearance(group,{variant='reference'}={}){
  if(!['reference','legacy'].includes(variant))throw new TypeError('Unknown clown appearance variant');
  const geometries=new Set(),materials=new Set(),bounds=[];
  group.traverse(object=>{
    if(!object.isMesh||!object.geometry)return;
    const list=Array.isArray(object.material)?object.material:[object.material];
    const clown=list.filter(m=>m?.customProgramCacheKey?.().split(PROGRAM_SUFFIX)[0]==='fish-clown');
    if(!clown.length)return;
    geometries.add(object.geometry);clown.forEach(m=>materials.add(m));
  });
  for(const geometry of geometries)bounds.push(reshape(geometry,variant));
  for(const material of materials)shade(material,variant);
  return {variant,geometries:geometries.size,materials:materials.size,bounds,scope:CLOWN_APPEARANCE.scope};
}
