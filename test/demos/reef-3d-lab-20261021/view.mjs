import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createFishSchool } from './upstream/scenes/reefscape/src/fish-model.js';
import { createTerrain } from './upstream/scenes/reefscape/src/terrain.js';
import { createCorals } from './upstream/scenes/reefscape/src/corals.js';
import { createAnemone } from './upstream/scenes/reefscape/src/anemone.js';
import { createEnvironment,createCaustics,waterTime,LAMP,LAMP_RANGE } from './upstream/scenes/reefscape/src/water.js';

function disposeGroup(group,textures=false){
  const geos=new Set(),mats=new Set(),maps=new Set();group.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])mats.add(m);});
  geos.forEach(g=>g.dispose());mats.forEach(m=>{if(textures){for(const v of Object.values(m))if(v?.isTexture)maps.add(v);for(const t of m.userData.extraTextures||[])maps.add(t);}m.dispose();});maps.forEach(t=>t.dispose());group.clear();
}
export class OceanView{
  constructor(canvas,world,spatial,report){
    this.canvas=canvas;this.world=world;this.spatial=spatial;this.report=report;this.mode='natural';this.angle=0;this.coverage=.32;this.zoom=1.6;
    this.reefVisible=false;this.reefReady=false;this.reefPromise=null;this.disposed=false;this.renderRevision=-1;this.records=[];this.frames=0;this.cpuMs=0;this.acc=0;
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
    this.renderer.setClearColor(0,0);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NeutralToneMapping;this.renderer.toneMappingExposure=1.7;
    this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(34,1,.01,120);
    this.fishGroup=new THREE.Group();this.heldGroup=new THREE.Group();this.reefGroup=new THREE.Group();this.reefGroup.visible=false;this.scene.add(this.fishGroup,this.heldGroup,this.reefGroup);
    this.testStone=new THREE.Mesh(new THREE.IcosahedronGeometry(.4,2),new THREE.MeshStandardMaterial({color:0x8b9e92,roughness:.85}));this.testStone.visible=false;this.scene.add(this.testStone);this.depthSide='front';
    this.scene.add(new THREE.HemisphereLight('#89b8dc','#a28f6d',.8));
    this.sun=new THREE.DirectionalLight('#f2f5ff',4.2);this.sun.position.set(LAMP.x,LAMP.y,LAMP.z).multiplyScalar(LAMP_RANGE);
    this.sun.shadow.mapSize.set(1024,1024);Object.assign(this.sun.shadow.camera,{left:-12,right:12,top:12,bottom:-14,near:1,far:45});this.sun.shadow.normalBias=.015;
    this.scene.add(this.sun,this.sun.target);const fill=new THREE.DirectionalLight('#b4dbed',.25);fill.position.set(3,5,9);this.scene.add(fill);
    this.environment=createEnvironment();this.scene.environment=this.environment;
    this.caustics=createCaustics();this.caustics.setQuality('eco');
    this.foodMesh=new THREE.InstancedMesh(new THREE.SphereGeometry(.02,8,6),new THREE.MeshStandardMaterial({color:0xe3ad56,roughness:.6}),24);this.foodMesh.count=0;this.scene.add(this.foodMesh);
    this.dummy=new THREE.Object3D();this.raycaster=new THREE.Raycaster();this.ruler=this.makeRuler();this.scene.add(this.ruler);
    this.shaderErrors=[];this.renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{this.shaderErrors.push((gl.getProgramInfoLog(program)||'Shader failure').slice(0,500));this.report('材质编译失败，请查看诊断。');};
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.failed=true;this.report('图形上下文丢失，请重载实验页。');});
    this.resize(innerWidth,innerHeight);
  }
  makeRuler(){const g=new THREE.Group(),pts=[];for(let i=0;i<=10;i++){const x=-.5+i*.1;pts.push(new THREE.Vector3(x,-.9,0),new THREE.Vector3(x,-.9+(i%5===0?.11:.06),0));}pts.push(new THREE.Vector3(-.5,-.9,0),new THREE.Vector3(.5,-.9,0));g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xa6ebdb})));g.visible=false;return g;}
  resize(width,height){
    this.width=width;this.height=height;const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(1700000/(width*height)));
    this.renderer.setSize(Math.max(1,Math.round(width*ratio)),Math.max(1,Math.round(height*ratio)),false);this.canvas.style.width=width+'px';this.canvas.style.height=height+'px';
    this.camera.aspect=width/height;this.configureCamera();
  }
  configureCamera(){
    this.camera.up.set(0,1,0);
    if(this.mode==='turntable'){this.camera.up.set(0,1,0);if(this.top){this.camera.position.set(0,2.5,.01);this.camera.up.set(0,0,-1);}else this.camera.position.set(0,.45,2.5);this.camera.lookAt(0,0,0);this.camera.fov=35;}
    else if(this.mode==='depth'){this.camera.up.set(0,1,0);this.camera.position.set(0,0,4);this.camera.lookAt(0,0,0);this.camera.fov=35;}
    else if(this.mode==='scale'){this.camera.position.set(0,3.5,11);this.camera.lookAt(0,3.5,0);this.camera.fov=25;}
    else{this.camera.position.set(0,4.3,this.zoom*10);this.camera.lookAt(0,3.5,0);this.camera.fov=34;}
    if(!this.top||this.mode!=='turntable')this.camera.up.set(0,1,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();this.layoutReef();
  }
  setMode(mode){this.mode=['natural','scale','turntable','depth'].includes(mode)?mode:'natural';this.renderRevision=-1;this.spatial.setActive(this.reefVisible&&this.mode==='natural');this.configureCamera();}
  setAngle(degrees){this.top=degrees==='top';this.angle=this.top?0:Number(degrees)*Math.PI/180;this.configureCamera();}
  setZoom(value){this.zoom=Math.max(1,Math.min(2.4,value));this.configureCamera();}
  setCoverage(value){this.coverage=Math.max(.2,Math.min(.42,value));this.layoutReef();this.reconcileSceneChange();}
  async setReef(on){
    this.reefVisible=on===true;
    if(this.reefVisible&&!this.reefReady&&!this.reefPromise){
      this.reefError=null;
      this.report('载入真实礁石与碰撞查询…');
      this.reefPromise=(async()=>{
        const terrain=await createTerrain(this.reefGroup);if(this.disposed){disposeGroup(this.reefGroup,true);return;}
        const terrainMeshes=this.reefGroup.children.filter(x=>x.isMesh);
        const corals=createCorals(this.reefGroup);corals.setQuality('eco');const anemone=createAnemone(this.reefGroup);anemone.setQuality('eco');
        this.reefReady=true;this.reefBoxes=this.reefGroup.children.map(child=>new THREE.Box3().setFromObject(child));this.layoutReef();
        this.spatial.setMeshes(terrainMeshes.map(mesh=>({mesh,solid:mesh===terrain.rockSurface})));this.reconcileSceneChange();
      })().catch(error=>{this.reefError=error;this.reefVisible=false;this.reefGroup.visible=false;this.spatial.setActive(false);this.report('造景未就绪：'+error.message);console.error(error);}).finally(()=>{this.reefPromise=null;});
    }
    await this.reefPromise;
    if(this.reefError)return false;
    this.reefGroup.visible=this.reefVisible&&this.reefReady&&this.mode==='natural';this.spatial.setActive(this.reefGroup.visible);this.sun.castShadow=this.reefGroup.visible;this.renderer.shadowMap.enabled=this.reefGroup.visible;
    this.renderer.shadowMap.autoUpdate=true;this.report(this.reefVisible?'固定造景已开启，鱼与礁石共享深度。':'固定造景已关闭，颜色、深度和碰撞同时撤除。');
    this.reconcileSceneChange();
  }
  layoutReef(){
    if(!this.reefReady)return;this.reefGroup.visible=this.reefVisible&&this.mode==='natural';if(this.mode!=='natural')return;
    let lo=-35,hi=5;const target=1-this.coverage;
    // Keep each object's own height/depth pair: the tall fan is not as close as the sand.
    const topAt=offset=>{let top=2;for(const b of this.reefBoxes)for(const x of [b.min.x,b.max.x])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,b.max.y+offset,z).project(this.camera);if(p.z>=-1&&p.z<=1)top=Math.min(top,(1-p.y)/2);}return top;};
    for(let i=0;i<24;i++){const mid=(lo+hi)/2;if(topAt(mid)>target)lo=mid;else hi=mid;}
    this.reefGroup.position.y=(lo+hi)/2;this.reefGroup.updateMatrixWorld(true);this.spatial.updateMatrices();this.sun.shadow.needsUpdate=true;
  }
  reconcileSceneChange(){this.spatial.setActive(this.reefVisible&&this.reefReady&&this.mode==='natural');for(const f of this.world.fish){this.world.findLegal(f);f.goalAt=0;if(f.hunt)this.world.endHunt(f,'scenery-change');}}
  rebuildFish(){
    disposeGroup(this.fishGroup);disposeGroup(this.heldGroup);const live=this.world.fish.filter(f=>f.kind==='clown'&&f.life==='alive');
    const source=['turntable','depth'].includes(this.mode)?[live.at(-1)].filter(Boolean):this.mode==='scale'?live.slice(0,6):live;
    this.records=source.map((f,i)=>({id:f.id,fish:f,kind:'clown',size:f.profile.totalLengthM/.125,position:new THREE.Vector3(),yaw:0,pitch:0,roll:0,phase:0,tailAmplitude:.02,pectoral:0,rowing:.4,bend:0,rank:i}));
    this.school=createFishSchool(this.fishGroup,{fish:this.records.filter(r=>!r.fish.held)});this.school.setQuality('balanced');
    this.heldSchool=createFishSchool(this.heldGroup,{fish:this.records.filter(r=>r.fish.held)});this.heldSchool.setQuality('balanced');
    this.heldGroup.traverse(o=>{if(o.isMesh){o.renderOrder=100;for(const m of Array.isArray(o.material)?o.material:[o.material]){m.depthTest=false;m.depthWrite=false;}}});this.renderRevision=this.world.revision;
  }
  async loadPredator(){
    if(this.predator)return; if(this.predatorPromise)return this.predatorPromise;
    this.predatorPromise=(async()=>{
      const gltf=await new GLTFLoader().loadAsync(new URL('./assets/barramundi/BarramundiFish.gltf',import.meta.url).href);gltf.scene.updateMatrixWorld(true);
      const source=[];gltf.scene.traverse(o=>{if(o.isMesh)source.push(o);});if(source.length!==1)throw new Error('Predator asset contract changed');
      const original=source[0],geometry=original.geometry.clone();geometry.applyMatrix4(original.matrixWorld);geometry.rotateY(Math.PI/2);geometry.center();geometry.computeBoundingBox();
      const length=geometry.boundingBox.max.x-geometry.boundingBox.min.x;this.predatorModelLength=length;
      const material=original.material.clone();const uniforms={phase:{value:0},amplitude:{value:0}};this.predatorUniforms=uniforms;
      material.onBeforeCompile=shader=>{
        shader.uniforms.swimPhase=uniforms.phase;shader.uniforms.swimAmplitude=uniforms.amplitude;
        shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>\nuniform float swimPhase;uniform float swimAmplitude;float bendAt(float x){float a=clamp(.5-x/${length.toFixed(7)},0.,1.);return sin(swimPhase-a*4.)*swimAmplitude*a*a;}float slopeAt(float x){return (bendAt(x+.0001)-bendAt(x-.0001))/.0002;}`)
          .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal.x-=slopeAt(position.x)*objectNormal.z;\n#ifdef USE_TANGENT\nobjectTangent.z+=slopeAt(position.x)*objectTangent.x;\n#endif')
          .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=bendAt(position.x);');
      };
      material.customProgramCacheKey=()=> 'reef-lab-barramundi-v1';
      this.predator=new THREE.Mesh(geometry,material);this.predator.receiveShadow=true;this.predator.visible=false;this.scene.add(this.predator);original.geometry.dispose();original.material.dispose();
      if(this.disposed){for(const v of Object.values(material))if(v?.isTexture)v.dispose();geometry.dispose();material.dispose();this.scene.remove(this.predator);}
    })().catch(error=>{this.predatorPromise=null;throw error;});return this.predatorPromise;
  }
  render(force=false){
    if(this.disposed||this.failed)return;const before=performance.now();if(!force&&before-(this.lastRender||0)<32)return;if(this.lastRender){this.fpsWindow=this.fpsWindow||[];this.fpsWindow.push(before-this.lastRender);if(this.fpsWindow.length>120)this.fpsWindow.shift();}this.lastRender=before;if(this.renderRevision!==this.world.revision)this.rebuildFish();
    const euler=new THREE.Euler(0,0,0,'YZX');
    this.records.forEach((r,i)=>{const f=r.fish;r.size=f.profile.totalLengthM/.125;
      if(this.mode==='natural'){r.position.copy(f.position).multiplyScalar(10);euler.setFromQuaternion(f.quaternion,'YZX');r.roll=euler.x;r.yaw=euler.y;r.pitch=euler.z;}
      else if(this.mode==='scale'){r.position.set(-2.45+i*1.1,3.5,0);r.roll=r.yaw=r.pitch=0;}
      else if(this.mode==='depth'){r.position.set(this.depthSide==='partial'?.35:0,0,this.depthSide==='front'?.75:-.75);r.roll=r.yaw=r.pitch=0;}
      else{r.position.set(0,0,0);r.roll=0;r.yaw=this.angle;r.pitch=0;}
      // Raw model x bounds are [-.71,.54]; align their centre to the physical entity.
      r.center=r.position.clone();const axis=new THREE.Vector3(1,0,0).applyEuler(new THREE.Euler(r.roll,r.yaw,r.pitch,'YZX'));r.position.addScaledVector(axis,f.profile.totalLengthM*10*.068);
      r.phase=f.phase;r.tailAmplitude=this.mode==='natural'?f.tailAmplitude:0;r.pectoral=f.pectoral;r.rowing=this.mode==='natural'?f.rowing:0;r.bend=f.bend;
    });
    this.school.update(this.camera);this.heldSchool.update(this.camera);this.testStone.visible=this.mode==='depth';
    const pred=this.world.fish.find(f=>f.kind==='barramundi');
    if(this.predator){this.predator.visible=!!pred&&this.mode==='natural'&&pred.life==='alive';if(pred){this.predator.material.depthTest=!pred.held;this.predator.material.depthWrite=!pred.held;this.predator.renderOrder=pred.held?100:0;this.predator.position.copy(pred.position).multiplyScalar(10);this.predator.quaternion.copy(pred.quaternion);this.predator.scale.setScalar(pred.profile.totalLengthM*10/this.predatorModelLength);this.predatorUniforms.phase.value=pred.phase;this.predatorUniforms.amplitude.value=this.predatorModelLength*(.008+Math.min(.025,pred.velocity.length()*.04));}}
    this.foodMesh.count=this.mode==='natural'?this.world.pellets.length:0;
    this.world.pellets.forEach((p,i)=>{this.dummy.position.copy(p.position).multiplyScalar(10);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.foodMesh.setMatrixAt(i,this.dummy.matrix);});this.foodMesh.instanceMatrix.needsUpdate=true;
    this.ruler.visible=this.mode==='scale';this.ruler.position.set(0,3.5,0);
    waterTime.value=this.world.time;if(before-(this.lastCaustics||0)>95){this.caustics.render(this.renderer);this.lastCaustics=before;}this.renderer.setRenderTarget(null);this.renderer.clear();this.renderer.render(this.scene,this.camera);
    if(this.reefGroup.visible)this.renderer.shadowMap.autoUpdate=false;
    this.frames++;this.cpuMs=performance.now()-before;
  }
  project(f){const p=(this.records.find(r=>r.id===f.id)?.center||f.position.clone().multiplyScalar(10)).clone().project(this.camera);return {x:(p.x+1)*this.width/2,y:(1-p.y)*this.height/2,visible:p.z>=-1&&p.z<=1};}
  ray(x,y){this.raycaster.setFromCamera(new THREE.Vector2(x/this.width*2-1,1-y/this.height*2),this.camera);return new THREE.Ray(this.raycaster.ray.origin.clone().multiplyScalar(.1),this.raycaster.ray.direction.clone());}
  pick(x,y){
    if(this.mode!=='natural')return null;const ray=this.ray(x,y),wall=this.spatial.firstHit(ray);let result=null;
    for(const f of this.world.fish){if(!this.world.active(f))continue;const r=f.profile.radiusM,half=Math.max(f.profile.totalLengthM*.28,f.profile.totalLengthM*.5-r),a=f.position.clone().addScaledVector(f.direction,-half),b=f.position.clone().addScaledVector(f.direction,half),onRay=new THREE.Vector3(),onBody=new THREE.Vector3();
      const d2=ray.distanceSqToSegment(a,b,onRay,onBody),depth=onRay.distanceTo(ray.origin),pad=Math.min(.008,depth*.005);
      if(d2<=(r+pad)**2&&(!wall||depth<wall.distance-.001)&&(!result||depth<result.distance))result={fish:f,distance:depth,point:onRay};
    }return result;
  }
  pointerPlane(x,y,point){const normal=this.camera.getWorldDirection(new THREE.Vector3()),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,point);return this.ray(x,y).intersectPlane(plane,new THREE.Vector3());}
  diagnostics(){return {frames:this.frames,fps:this.fpsWindow?.length?1000*this.fpsWindow.length/this.fpsWindow.reduce((a,b)=>a+b,0):0,cpuMs:this.cpuMs,mode:this.mode,reefVisible:this.reefVisible,reefReady:this.reefReady,coverage:this.coverage,three:THREE.REVISION,queries:this.spatial.queryCount,shaderErrors:this.shaderErrors.slice(),triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures};}
  dispose(){this.disposed=true;disposeGroup(this.fishGroup);disposeGroup(this.heldGroup);disposeGroup(this.reefGroup,true);if(this.predator){for(const v of Object.values(this.predator.material))if(v?.isTexture)v.dispose();this.predator.geometry.dispose();this.predator.material.dispose();}this.testStone.geometry.dispose();this.testStone.material.dispose();this.foodMesh.geometry.dispose();this.foodMesh.material.dispose();disposeGroup(this.ruler);this.caustics.dispose();this.environment.dispose();this.spatial.dispose();this.renderer.dispose();}
}
