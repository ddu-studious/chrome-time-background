import { Vector3 } from 'three';
import { OceanWorld } from './world.mjs';
import { ReefSpatial } from './spatial.mjs';
import { OceanView } from './view.mjs';
export function createOcean(canvas,report){
  const spatial=new ReefSpatial(),world=new OceanWorld({spatial}),view=new OceanView(canvas,world,spatial,report);
  let active=false,failed=false,held=null,acc=0,selected=null,predGeneration=0,guide=false;const ui=document.getElementById('fish-list'),net=document.getElementById('fish-net'),guides=document.getElementById('guides');
  const state=()=>({started:active,failed,entries:world.fish.length,fish:world.fish.filter(f=>f.life==='alive').length,grabbing:!!held});
  function list(){ui.replaceChildren(...world.fish.map(f=>{const row=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
    label.textContent=`${f.kind==='clown'?'小丑鱼':'尖吻鲈'} · ${(f.profile.totalLengthM*100).toFixed(1)} cm${f.life==='absent'?' · 暂时离场':''}`;
    button.type='button';button.textContent='捞出';button.setAttribute('aria-label',`捞出 ${f.id}`);button.disabled=view.mode!=='natural';button.addEventListener('click',()=>{world.remove(f.id);list();report('已从演示居民中捞出。');});row.append(label,button);return row;}));}
  let lastGuide=0;
  function guideFrame(){
    if(guide&&performance.now()-lastGuide<100)return;lastGuide=performance.now();
    if(!guide){guides.replaceChildren();return;}const nodes=[];
    for(const f of world.fish){if(f.life!=='alive'||view.mode!=='natural')continue;const p=view.project(f);if(!p.visible)continue;const mark=document.createElement('div');mark.className='marker';mark.dataset.kind='fish';mark.dataset.id=f.id;mark.textContent=`${(f.profile.totalLengthM*100).toFixed(1)} cm`;mark.style.left=p.x+'px';mark.style.top=p.y+'px';nodes.push(mark);}
    for(const j of window.JellyfishSkin?._world()?.jellies||[]){if(view.mode!=='natural'||j.taskId==null)continue;const mark=document.createElement('div');mark.className='marker jelly-marker';mark.dataset.kind='jelly';mark.style.left=j.x+'px';mark.style.top=j.y+'px';mark.textContent='任务水母';nodes.push(mark);}
    const bin=window.TaskCrumpleCore?.binPlacement(null,{width:innerWidth,height:innerHeight},0);
    if(bin){const mark=document.createElement('div');mark.className='drop-guide';mark.dataset.kind='task-bin';mark.style.left=bin.left+'px';mark.style.top=bin.top+'px';mark.style.width=bin.width+'px';mark.style.height=bin.height+'px';mark.textContent='任务纸篓';nodes.push(mark);}
    guides.replaceChildren(...nodes);
  }
  function cancel(){if(!held)return false;const f=held.fish;f.position.copy(held.origin);world.setHeld(f.id,false);world.findLegal(f);held=null;net.hidden=true;return true;}
  function grabAt(x,y){if(!active||failed||held||view.mode!=='natural')return false;const hit=view.pick(x,y);if(!hit)return false;
    selected=hit.fish.id;report('已抓住 '+selected+'，拖到底部网兜可捞出。');world.setHeld(selected,true);held={fish:hit.fish,origin:hit.fish.position.clone(),plane:hit.fish.position.clone(),x,y,dragging:false};return true;}
  function drop(x,y){
    if(!held)return false;const s=held,rect=net.getBoundingClientRect(),inside=s.dragging&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
    world.setHeld(s.fish.id,false);held=null;net.hidden=true;
    if(inside){world.remove(s.fish.id);list();report('已拖入网兜并捞出。');}
    else{if(!spatial.clearPose(s.fish,s.fish.position,s.fish.quaternion)||!world.inBounds(s.fish,s.fish.position))s.fish.position.copy(s.origin);world.findLegal(s.fish);report(`选中 ${s.fish.id}：总长 ${(s.fish.profile.totalLengthM*100).toFixed(1)} cm，年龄未知。`);}
    return s.dragging;
  }
  function frame(options){
    if(!active||failed)return;
    try{
      if(options.width!==view.width||options.height!==view.height)view.resize(options.width,options.height);
      if(held&&options.pointer){const p=options.pointer;if(Math.hypot(p.x-held.x,p.y-held.y)>6)held.dragging=true;
        net.hidden=!held.dragging;const point=view.pointerPlane(p.x,p.y,held.plane);if(point)held.fish.position.copy(point);}
      if(view.mode==='natural'){acc+=Math.min(.1,Math.max(0,options.dt/1000));let steps=0;while(acc>=1/60&&steps<4){world.step(1/60);acc-=1/60;steps++;}if(steps===4)acc=0;}
      view.render();guideFrame();
    }catch(error){failed=true;report('三维实验已停止：'+error.message);console.error(error);}
  }
  const api={
    start(){active=true;canvas.hidden=false;list();},stop(){active=false;cancel();canvas.hidden=true;},isActive:()=>active&&!failed,
    frame,hoverAt:(x,y)=>!!(active&&!held&&view.pick(x,y)),grabAt,drop,cancel,state,
    add(){if(view.mode!=='natural')return;const f=world.add();if(f){list();report(`加入 ${(f.profile.totalLengthM*100).toFixed(1)} cm 的小丑鱼。`);}else report('演示居民已达上限。');},
    feed(){if(view.mode!=='natural')return;const r=world.feed();report(r.ok?`已投放 ${r.count} 粒饲料；实际吃到会单独计数。`:'投放过快或饲料已满。');},
    async setPredator(value,length=.45){const gen=++predGeneration;
      if(!value){world.setPredation(false);for(const f of [...world.fish])if(f.kind==='barramundi')world.remove(f.id);list();return;}
      report('载入 CC0 捕食测试模型…');try{await view.loadPredator();if(gen!==predGeneration||view.disposed)return;
        for(const f of [...world.fish])if(f.kind==='barramundi')world.remove(f.id);world.add('barramundi',length);world.setPredation(true);list();report('捕食行为测试开启；这不是自然共栖物种组合。');
      }catch(error){report('捕食测试模型加载失败：'+error.message);document.getElementById('predation').checked=false;}
    },
    setReef:async on=>{const result=await view.setReef(on);if(result===false)document.getElementById('reef').checked=false;view.render(true);},setCoverage:v=>{view.setCoverage(v);view.render(true);},setZoom:v=>{view.setZoom(v);view.render(true);},
    setMode(mode){window.backgroundExperience?.cancelGrab();cancel();view.setMode(mode);view.render(true);document.getElementById('scale-labels').replaceChildren();document.body.classList.toggle('inspection',mode!=='natural');if(window.backgroundExperience)window.backgroundExperience.settings.jellyfishTasks=mode==='natural';list();report(mode==='natural'?'自然游动：可喂食、抓取与捞出。':mode==='scale'?'同深度尺标：前六位居民，下方横尺为 10 cm；身体没有单独放大。':mode==='depth'?'共享深度检查：测试石与同一条鱼，可切换前方、后方和局部遮挡。':'转身观察：同一条真 3D 鱼，视角改变而身体尺寸不变。');},
    setAngle:d=>{view.setAngle(d);view.render(true);},setDepth:side=>{view.depthSide=side;view.render(true);report(side==='front'?'同一条鱼位于测试石前方。':side==='back'?'同一条鱼位于测试石后方，深度测试将其遮住。':'鱼身在石后，露出的部分仍可见；没有改变透明度。');},setGuide:value=>{guide=value;guideFrame();},
    diagnostics:()=>({...view.diagnostics(),...world.snapshot(),selected,failed}),
    project:()=>world.fish.map(f=>({id:f.id,...view.project(f)})),
    dispose(){active=false;cancel();view.dispose();},
  };
  for(const type of ['pointerdown','pointerup'])document.addEventListener(type,e=>{if(guide)document.getElementById('interaction-log').textContent=`${type} (${Math.round(e.clientX)}, ${Math.round(e.clientY)}) · 命中 ${view.pick(e.clientX,e.clientY)?.fish.id||'空白'} · 抓取 ${held?.fish.id||'无'}`;},true);
  let lastUI=0;
  api.updateUI=()=>{const d=api.diagnostics();document.getElementById('counts').textContent=`游动 ${d.fish.filter(f=>f.life==='alive').length} / 居民 ${d.fish.length} · 已吃饲料 ${d.stats.eaten} · 追逐 ${d.stats.hunts} · 捕获 ${d.stats.captures} · 放弃 ${d.stats.escapes}`;
    document.getElementById('diagnostics').textContent=`Three r${d.three} · 三角形 ${d.triangles} · 几何 ${d.geometries} · 纹理 ${d.textures} · 帧率 ${d.fps.toFixed(1)} · CPU 提交 ${d.cpuMs.toFixed(1)} ms（不含 GPU） · 帧 ${d.frames} · 世界 ${d.time.toFixed(1)} s · 错误 ${d.shaderErrors.length}`;
    document.getElementById('event-log').textContent=d.events.filter(e=>['capture','escape','refuge','removed'].includes(e.type)).map(e=>`${e.time.toFixed(1)}s ${e.type} ${e.prey||e.target||e.id} ${e.reason||''}`).join('\n');
    if(world.revision!==lastUI){list();lastUI=world.revision;}
    const labels=document.getElementById('scale-labels');labels.replaceChildren(...(view.mode==='scale'?view.records.map(r=>{const f=r.fish,p=view.project(f),el=document.createElement('span');el.textContent=(f.profile.totalLengthM*100).toFixed(1)+' cm';el.style.left=p.x+'px';el.style.top=(p.y+45)+'px';return el;}):[]));
  };
  return api;
}
