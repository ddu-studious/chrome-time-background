// One restrained art direction: natural structure, gentle character, a hint of pearl.
// These are presentation choices, not measured biological parameters.
export const ANIMAL_STYLE=Object.freeze({name:'自然系轻动漫',natural:.6,gentle:.3,dream:.1});
export const normalizeAnimalStyle=value=>value==='reference'?'reference':'soft';
const states=new WeakMap();
const SURFACE='#include <lights_physical_fragment>',OUTPUT='#include <opaque_fragment>';

/** Layer a fragment-only style over the public fish factory's existing material.
 * No geometry, vertex shader, transform, depth or collision settings are changed. */
export function applyAnimalStyle(group,style='soft'){
  const amount=normalizeAnimalStyle(style)==='soft'?1:0,materials=new Set();
  group.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){if(m.customProgramCacheKey?.().startsWith('fish-clown'))materials.add(m);}});
  for(const m of materials){
    let state=states.get(m);
    if(!state){
      const compile=m.onBeforeCompile,key=m.customProgramCacheKey,uniform={value:amount};state={uniform};states.set(m,state);
      m.onBeforeCompile=function(shader,renderer){
        compile.call(this,shader,renderer);
        if(shader.fragmentShader.split(SURFACE).length!==2||shader.fragmentShader.split(OUTPUT).length!==2||!shader.fragmentShader.includes('varying float vPart;'))throw new Error('Animal style fragment contract changed');
        shader.uniforms.softAnimalStyle=uniform;
        shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float softAnimalStyle;');
        shader.fragmentShader=shader.fragmentShader.replace(SURFACE,`
          if(vPart<3.5){
            float warm=smoothstep(.04,.32,diffuseColor.r-diffuseColor.b);
            float pale=smoothstep(.12,.65,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)));
            vec3 pigment=mix(diffuseColor.rgb,vec3(.96,.32,.055),warm*.22);
            pigment=mix(pigment,vec3(.94,.87,.73),pale*.24);
            diffuseColor.rgb=mix(diffuseColor.rgb,pigment,softAnimalStyle);
            roughnessFactor=mix(roughnessFactor,max(.62,roughnessFactor),softAnimalStyle*.7);
            fishSpecular*=1.-softAnimalStyle*.28;
            #ifndef FLAT_SHADED
            normal=normalize(mix(normal,normalize(vNormal)*faceDirection,softAnimalStyle*.30));
            #endif
          }
          ${SURFACE}`);
        shader.fragmentShader=shader.fragmentShader.replace(OUTPUT,`
          float gentleLight=.44+.56*smoothstep(-.45,.9,dot(normal,normalize(vec3(-.25,.65,.72))));
          if(vPart<3.5)outgoingLight=mix(outgoingLight,diffuseColor.rgb*gentleLight,softAnimalStyle*.24);
          else{
            float glint=exp(-pow(length(vSkinUv-vec2(-.23,.23))/.12,2.));
            outgoingLight+=vec3(.16,.20,.22)*glint*softAnimalStyle;
          }
          ${OUTPUT}`);
      };
      m.customProgramCacheKey=function(){return key.call(this)+'/soft-animal-v1';};m.needsUpdate=true;
    }
    state.uniform.value=amount;
  }
  return {materials:materials.size,style:normalizeAnimalStyle(style),vertexChanges:false};
}

/** Change visual cadence without moving the fish or increasing any deformation.
 * A clock follows phase increments, so toggling a style does not reset a stroke. */
export function projectFishStyle(source,clock,style='soft'){
  const soft=normalizeAnimalStyle(style)==='soft',rate=soft?.9:1;
  for(const key of ['phase','pectoral']){
    const value=source[key]||0,last=clock['last'+key];
    if(!Number.isFinite(value))throw new Error('Non-finite fish presentation phase');
    if(last===undefined||value<last)clock[key]=value;
    else clock[key]+=Math.min(value-last,2)*rate;
    clock['last'+key]=value;
  }
  return {phase:clock.phase,pectoral:clock.pectoral,tailAmplitude:source.tailAmplitude*(soft?.94:1),rowing:source.rowing,bend:source.bend};
}
