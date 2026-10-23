import * as THREE from 'three';
import {normalizeAnimalStyle} from './animal-style.mjs';
import {merge, tube} from './upstream/scenes/reefscape/src/geometry.js';

// Reference-led Aurelia sample, not a measured species reconstruction or fluid solver.
// The host owns world position, task state, frame scheduling and hit testing.
const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=x=>x*x*(3-2*x);
const supple=x=>x*x*x*(10+x*(-15+6*x));
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const finite=(x,fallback)=>Number.isFinite(x)?x:fallback;
const undersideHeightAt=r=>.245-.32*r*r-.015*Math.pow(r,8);
function pulseValue(cycle,soft){
  const contractEnd=soft?.22:.24,relaxEnd=soft?.84:.76,ease=soft?supple:smooth;
  return cycle<contractEnd?ease(cycle/contractEnd):cycle<relaxEnd?1-ease((cycle-contractEnd)/(relaxEnd-contractEnd)):0;
}
function contractionAt(time,phase,rate,soft){return pulseValue(((time*rate+phase)%1+1)%1,soft);}

/** Three phases with continuous endpoints; time is seconds, phase is a cycle offset. */
export function sampleMoonPulse(time,phase=0,activity=1,style='reference'){
  const soft=style==='soft',rate=(.58+.12*clamp(finite(activity,1),0,2))*(soft?.88:1);
  const cycle=((finite(time,0)*rate+finite(phase,0))%1+1)%1;
  const contractEnd=soft?.22:.24,relaxEnd=soft?.84:.76;
  const stage=cycle<contractEnd?'contract':cycle<relaxEnd?'relax':'coast';
  const contraction=pulseValue(cycle,soft);
  return {cycle,stage,contraction,rate};
}

// One continuous meridian turns from the exumbrella around the soft lip and
// back into the concave subumbrella. Both poles are closed: no cut sphere and
// no disconnected rim tube. Dimensions are artistic reference values.
function bellGeometry(){
  const profile=new THREE.CatmullRomCurve3([
    V(0,.42,0),V(.14,.417,0),V(.46,.386,0),V(.75,.292,0),
    V(.91,.163,0),V(.985,.042,0),V(.994,-.010,0),V(.965,-.057,0),
    V(.929,-.050,0),V(.884,.001,0),V(.77,.067,0),V(.56,.146,0),
    V(.27,.220,0),V(0,.245,0)
  ],false,'centripetal');
  const points=profile.getPoints(78).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y));
  const g=new THREE.LatheGeometry(points,96),p=g.attributes.position,col=new Float32Array(p.count*4);
  // LatheGeometry expects a bottom-to-top meridian; ours intentionally starts
  // on the outer crown and returns through the cavity, so reverse its winding.
  const indices=g.index.array;for(let i=0;i<indices.length;i+=3){const b=indices[i+1];indices[i+1]=indices[i+2];indices[i+2]=b;}
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=Math.hypot(x,z),a=Math.atan2(z,x),edge=Math.pow(clamp(r,0,1),7);
    const lobes=1-.009*Math.cos(a*8)*edge;
    p.setXYZ(i,x*lobes,y+.010*Math.cos(a*8+.2)*edge+.003*Math.sin(a*16)*edge,z*lobes);
    const inner=g.attributes.uv.getY(i)>.53;
    col.set([.94,.98,1,inner?.56:1],i*4);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,4));g.computeVertexNormals();return g;
}
function subumbrellaGeometry(){
  const rings=20,segments=64,positions=[],colors=[],indices=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=segments;i++){
    const r=.10+j/rings*.80,a=i/segments*TAU;
    positions.push(Math.cos(a)*r,undersideHeightAt(r)-.004,Math.sin(a)*r);
    colors.push(1,1,1,Math.sin(j/rings*Math.PI)*.7);
    if(j<rings&&i<segments){const k=j*(segments+1)+i;indices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,4));g.setIndex(indices);g.computeVertexNormals();return g;
}

function radialPoint(radial,tangent,a,y){return V(Math.cos(a)*radial-Math.sin(a)*tangent,y,Math.sin(a)*radial+Math.cos(a)*tangent);}
function makeGonads(){
  const parts=[];
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2+Math.PI/4,points=[],radii=[];
    for(let k=0;k<=36;k++){
      const theta=-Math.PI*.78+k/36*Math.PI*1.56;
      const radial=.33+.157*Math.cos(theta),tangent=.181*Math.sin(theta),r=Math.hypot(radial,tangent);
      points.push(radialPoint(radial,tangent,a,undersideHeightAt(r)+.032));
      radii.push(.021+.006*Math.sin(k/36*Math.PI));
    }
    const band=tube(points,radii,7),bp=band.attributes.position;
    for(let j=0;j<bp.count;j++){const r=Math.hypot(bp.getX(j),bp.getZ(j)),mid=undersideHeightAt(r)+.032;bp.setY(j,mid+(bp.getY(j)-mid)*.45);}
    band.computeVertexNormals();parts.push(band);
  }
  return merge(parts);
}
function makeCanals(){
  const parts=[];
  for(let i=0;i<16;i++){
    const a=i/16*TAU,points=[],radii=[];
    for(let k=0;k<=20;k++){
      const r=.16+k/20*.81,angle=a+.026*Math.sin(k/20*Math.PI*2+i);
      points.push(V(Math.cos(angle)*r,undersideHeightAt(r)+.016,Math.sin(angle)*r));radii.push(.0028);
    }
    parts.push(tube(points,radii,4));
    if(i%2===0)for(const side of [-1,1]){
      const branch=[],rr=[];for(let k=0;k<=10;k++){const r=.56+k/10*.41,angle=a+side*.14*k/10;
        branch.push(V(Math.cos(angle)*r,undersideHeightAt(r)+.016,Math.sin(angle)*r));rr.push(.0019);}
      parts.push(tube(branch,rr,4));
    }
  }
  return merge(parts);
}
function makeMouth(){
  const parts=[];
  for(let k=0;k<4;k++){
    const a=k*Math.PI/2,points=[],radii=[];
    for(let i=0;i<=12;i++){const u=i/12;points.push(radialPoint(.025+.075*u,.014*Math.sin(u*Math.PI),a,.215-.14*u));radii.push(.024*(1-.45*u));}
    parts.push(tube(points,radii,6));
  }
  return merge(parts);
}

function makeFringe(){
  const parts=[];
  for(let i=0;i<72;i++){
    const a=i/72*TAU,length=.14+.07*(.5+.5*Math.sin(i*2.4)),points=[],radii=[];
    for(let j=0;j<=7;j++){
      const u=j/7,r=.954-.008*Math.cos(a*8)+.045*Math.sin(u*Math.PI*.8);
      points.push(radialPoint(r,.018*Math.sin(u*3+i)*u,a,-.048-length*u));radii.push(.004*(1-u*.78));
    }
    parts.push(tube(points,radii,4));
  }
  return merge(parts);
}
function makeOralArms(){
  const parts=[];
  for(let arm=0;arm<4;arm++){
    const rows=48,cols=16,positions=[],uv=[],indices=[],a=arm*Math.PI/2;
    for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
      const u=j/rows,v=i/cols*2-1,tip=Math.sin(Math.PI*(.10+.88*u));
      // Broad gauzy folds, with a few unequal undulations. A high-frequency
      // helix made the former arms read as hard metallic drill bits.
      const width=.030+.123*tip;
      const fold=.018*Math.sin(u*Math.PI*3.6+.65*Math.sin(u*4.8+arm*.8)+v*.9)*Math.pow(Math.abs(v),2)*tip;
      const radial=.075+.22*u-.035*u*u+fold;
      const tangent=v*width+.018*Math.sin(u*4.3+arm*.7)*u;
      const p=radialPoint(radial,tangent,a,.205-.75*u+.012*Math.sin(u*9.2+arm*.8)*v*v*tip);
      positions.push(p.x,p.y,p.z);uv.push(i/cols,u);
      if(j<rows&&i<cols){const k=j*(cols+1)+i;indices.push(k,k+1,k+cols+1,k+1,k+cols+2,k+cols+1);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();parts.push(g);
  }
  return merge(parts);
}

/** A normalized bell of radius 1; positive Y is the top of the umbrella. */
export function createMoonJellyModel(color=0x9bdbff,style='reference'){
  const group=new THREE.Group(),bellGroup=new THREE.Group();group.name='aurelia-sample';bellGroup.name='aurelia-bell';group.add(bellGroup);
  const tint=new THREE.Color(color),white=new THREE.Color('#e5f0ef').lerp(tint,.10),rose=new THREE.Color('#e8c8cc').lerp(tint,.15);
  const materials=[],meshes=[],deformers=[];
  const material=(c,opacity,roughness=.48)=>{
    const m=new THREE.MeshPhysicalMaterial({color:c,roughness,metalness:0,clearcoat:0,specularIntensity:.16,ior:1.33,envMapIntensity:.35,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false});
    m.userData.baseOpacity=opacity;m.userData.reference={opacity,color:m.color.clone(),roughness};materials.push(m);return m;
  };
  const add=(name,geometry,mat,kind,parent=bellGroup)=>{
    const mesh=new THREE.Mesh(geometry,mat);mesh.name=name;mesh.renderOrder=2;parent.add(mesh);meshes.push(mesh);
    // The maximum deformation is bounded independently of time, so culling stays correct.
    geometry.boundingSphere=new THREE.Sphere(V(0,-.15,0),1.5);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const rest=geometry.attributes.position.array.slice(),weights=new Float32Array(rest.length/3*5);
    for(let i=0;i<rest.length;i+=3){const x=rest[i],y=rest[i+1],z=rest[i+2],angle=Math.atan2(z,x),k=i/3*5;
      weights.set([smooth(clamp((Math.hypot(x,z)-.30)/.70,0,1)),angle,Math.cos(angle),Math.sin(angle),kind==='arms'?clamp((.205-y)/.75,0,1):clamp((-y-.048)/.22,0,1)],k);
    }
    deformers.push({mesh,kind,rest,weights});return mesh;
  };
  const shell=material(white,.32,.62);shell.vertexColors=true;shell.side=THREE.FrontSide;
  add('outer-umbrella',bellGeometry(),shell,'bell');
  const lining=material(white,.12,.82);lining.vertexColors=true;
  add('subumbrella',subumbrellaGeometry(),lining,'bell');
  add('four-horseshoe-gonads',makeGonads(),material(rose,.42,.85),'bell');
  add('radial-canals',makeCanals(),material(white,.14,.6),'bell');
  add('central-manubrium',makeMouth(),material(white,.28,.88),'arms',group);
  add('short-marginal-tentacles',makeFringe(),material(white,.45,.86),'fringe');
  add('four-frilled-oral-arms',makeOralArms(),material(white,.34,.88),'arms',group);
  group.userData.anatomy={reference:'Aurelia spp.',gonads:4,oralArms:4,marginalTentacles:72,normalizedBellRadius:1,continuousMesoglea:true,measuredSpecimen:false};
  let disposed=false,lastKey='';
  const model={group,bellGroup,materials,meshes,pulse:sampleMoonPulse(0),style:'reference',
    setStyle(value){
      const next=normalizeAnimalStyle(value);if(disposed||next===this.style)return;this.style=next;lastKey='';
      const soft=next==='soft',opacities=[.46,.10,.30,.045,.32,.33,.42],softColors=['#d6cef1','#cbe3ef','#efbfd6','#cfdbea','#dfd6f1','#dce6f4','#e7d7ef'];
      meshes.forEach((mesh,i)=>{const mat=mesh.material,ref=mat.userData.reference;
        mat.color.copy(ref.color);mat.roughness=ref.roughness;mat.userData.baseOpacity=ref.opacity;
        if(soft){mat.color.copy(new THREE.Color(softColors[i]).lerp(tint,i===2?.18:.16));mat.roughness=i===0?.68:.86;mat.userData.baseOpacity=opacities[i];}
        mat.opacity=mat.userData.baseOpacity;mat.iridescence=soft&&i===0?.08:0;mat.iridescenceIOR=1.25;mat.iridescenceThicknessRange=[120,260];
        mat.specularIntensity=soft?.11:.16;mat.emissive.copy(mat.color);mat.emissiveIntensity=soft?(i===0?.055:.01):0;mat.sheen=soft&&i===0?.16:0;mat.sheenRoughness=1;mat.sheenColor.set('#f1d9ee');mat.needsUpdate=true;
      });
    },
    update(time,{phase=0,alpha=1,held=false,activity=1,style,flow}={}){
      if(disposed)return;if(style!==undefined)this.setStyle(style);
      const t=finite(time,0),offset=finite(phase,0),energy=clamp(finite(activity,1),0,2),opacity=clamp(finite(alpha,1),0,1);
      const soft=this.style==='soft'?1:0,pulse=sampleMoonPulse(t,offset,energy,this.style),c=pulse.contraction;
      // Bounded local flow comes from the host's velocity, not an independent
      // simulation. It only trails tissue; the root and task hit region stay owned.
      const flowX=soft?clamp(finite(flow?.x,0),-1,1):0,flowY=soft?clamp(finite(flow?.y,0),-1,1):0,flowZ=soft?clamp(finite(flow?.z,0),-1,1):0;
      this.pulse=pulse;
      for(const mat of materials){mat.opacity=mat.userData.baseOpacity*opacity;mat.depthTest=!held;}
      for(const mesh of meshes)mesh.renderOrder=held?90:2;
      const key=[t,offset,energy,this.style,flowX,flowY,flowZ].join(':');if(key===lastKey)return;lastKey=key;
      const delayed=contractionAt(t-.16-.08*soft,offset,pulse.rate,soft);
      for(const {mesh,kind,rest,weights} of deformers){
        const attr=mesh.geometry.attributes.position,out=attr.array;
        for(let i=0;i<rest.length;i+=3){
          const x=rest[i],y=rest[i+1],z=rest[i+2],k=i/3*5,edge=weights[k],angle=weights[k+1],cosA=weights[k+2],sinA=weights[k+3],u=weights[k+4];
          if(kind==='arms'){
            const follow=soft?contractionAt(t-.12-.32*u,offset,pulse.rate,soft):delayed;
            const sway=.045*Math.sin(t*(1.35-.2*soft)+offset*TAU-u*3.1)*u*u,fold=soft*.020*Math.sin(t*.95-u*4.2+angle*2)*u*u;
            const scale=1-.08*follow*u;
            out[i]=x*scale+sway+cosA*fold-flowX*.085*u*u;
            out[i+1]=y+.065*follow*u-flowY*.060*u*u;
            out[i+2]=z*scale+.032*Math.cos(t*1.12+offset*TAU-u*2.8)*u*u+sinA*fold-flowZ*.085*u*u;
          }else{
            const localC=soft?contractionAt(t-edge*(.11+.13*edge+.025*Math.sin(angle*2+offset*TAU)),offset,pulse.rate,soft):c;
            const squeeze=1-(.17-.025*soft)*localC*edge;
            // Contraction narrows the opening and deepens the cavity; it must not
            // lift the entire lip into a flat saucer or invert the umbrella.
            out[i]=x*squeeze;out[i+1]=y+.035*c*(1-edge)-(.060+.012*soft)*localC*edge+.035*soft*Math.sin(angle*2+t*.8+offset*TAU)*edge*c*(1-c);out[i+2]=z*squeeze;
            if(kind==='fringe'){
              const lag=contractionAt(t-.075-u*.1,offset,pulse.rate,soft);
              const sweep=.055*(lag-c)*u;
              out[i]+=cosA*sweep+.013*Math.sin(t*1.7+angle*3-u*2)*u-flowX*.035*u*u;
              out[i+1]+=.016*Math.sin(t*1.4+angle*2-u)*u-flowY*.025*u*u;
              out[i+2]+=sinA*sweep+.013*Math.cos(t*1.5+angle*3-u*2)*u-flowZ*.035*u*u;
            }
          }
        }
        attr.needsUpdate=true;mesh.geometry.computeVertexNormals();
      }
    },
    dispose(){
      if(disposed)return;disposed=true;
      for(const mesh of meshes)mesh.geometry.dispose();for(const m of materials)m.dispose();group.removeFromParent();
    }
  };
  model.setStyle(style);model.update(0);return model;
}
