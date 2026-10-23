import {OceanNavigation} from './full-navigation.mjs';
import {createTaskJellies} from './jelly-3d.mjs';
import { Vector3 } from 'three';
import { OceanWorld } from './world.mjs';
import { ReefSpatial } from './spatial.mjs';
import { OceanView } from './view.mjs';
import PlayUI from '../../../js/aquarium-play.js';
import {enterExperience,foodDropPoint} from './experience.mjs';
import {CATALOG,profile} from './catalog.mjs';
import {EXTRA_FISH,EXTRA_KINDS,GLB_KINDS} from './community-catalog.mjs';
const phaseNames={'route-rest':'调整路线',wander:'巡游',roaming:'沿礁巡游',pursuit:'追击',seek:'追踪记忆',evade:'逃离',food:'觅食',refuge:'靠近掩体','shelter-route':'钻入礁缝',hiding:'停留警戒','search-route':'绕礁追击',searching:'搜索出口',emerging:'试探离开'};
const eventNames={capture:'捕获',escape:'结束追击',refuge:'选择掩体',hidden:'进入躲藏',emerged:'离开掩体','searched-exit':'到达搜索出口',removed:'捞出'};
export function createOcean(canvas,report){
  const spatial=new ReefSpatial(),world=new OceanWorld({spatial}),view=new OceanView(canvas,world,spatial,report);
  world.navigation=new OceanNavigation(spatial);window.JellyfishSkin=createTaskJellies(view);
  document.getElementById('resident-species').replaceChildren(...['clown',...EXTRA_KINDS].map(kind=>{const option=document.createElement('option');option.value=kind;option.textContent=CATALOG[kind].name;return option;}));
  let active=false,failed=false,held=null,acc=0,selected=null,predGeneration=0,guide=false,experienceBusy=false,feedControl;const ui=document.getElementById('fish-list'),net=document.getElementById('fish-net'),guides=document.getElementById('guides');
  const state=()=>({started:active,failed,entries:world.fish.length,fish:world.fish.filter(f=>f.life==='alive').length,grabbing:!!held});
  function list(){ui.replaceChildren(...world.fish.map(f=>{const row=document.createElement('li'),label=document.createElement('span'),button=document.createElement('button');
    label.textContent=`${CATALOG[f.kind].name} · ${(f.profile.totalLengthM*100).toFixed(1)} cm${f.life==='absent'?' · 暂时离场':''}`;
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
    else{if(!spatial.clearPose(s.fish,s.fish.position,s.fish.quaternion)||!world.inBounds(s.fish,s.fish.position)||(world.navigation.isFull&&!world.navigation.clearPoint(s.fish,s.fish.position)))s.fish.position.copy(s.origin);world.findLegal(s.fish);report(`选中 ${s.fish.id}：总长 ${(s.fish.profile.totalLengthM*100).toFixed(1)} cm，年龄未知。`);}
    return s.dragging;
  }
  function frame(options){
    if(!active||failed)return;
    try{
      if(options.width!==view.width||options.height!==view.height)view.resize(options.width,options.height);
      if(held&&options.pointer){const p=options.pointer;if(Math.hypot(p.x-held.x,p.y-held.y)>6)held.dragging=true;
        net.hidden=!held.dragging;const point=view.pointerPlane(p.x,p.y,held.plane);if(point)held.fish.position.copy(point);}
      if(view.mode==='natural'){acc+=Math.min(.1,Math.max(0,options.dt/1000));let steps=0;while(acc>=1/60&&steps<4){world.step(1/60);acc-=1/60;steps++;}if(steps===4)acc=0;}
      else if(view.mode.endsWith('-compare')){acc+=Math.min(.1,Math.max(0,options.dt/1000));let steps=0;while(acc>=1/60&&steps<4){view.specimen.step(1/60);acc-=1/60;steps++;}if(steps===4)acc=0;}
      view.render();guideFrame();
    }catch(error){failed=true;report('三维实验已停止：'+error.message);console.error(error);}
  }
  const api={
    start(){active=true;canvas.hidden=false;list();},stop(){active=false;cancel();canvas.hidden=true;},isActive:()=>active&&!failed,
    frame,hoverAt:(x,y)=>!!(active&&!held&&view.pick(x,y)),grabAt,drop,cancel,state,
    async add(kind='clown'){
      if(view.mode!=='natural'||experienceBusy||!['clown',...EXTRA_KINDS].includes(kind))return;
      experienceBusy=true;syncModeUI();try{await view.community.load(kind);if(view.disposed)return;
        const f=world.add(kind);if(f){list();report(`加入 ${CATALOG[kind].name} · ${(f.profile.totalLengthM*100).toFixed(1)} cm。`);}else report('居民已满，或当前体型没有安全位置。');
      }catch(error){report('加入未完成：'+error.message);}finally{experienceBusy=false;syncModeUI();}
    },
    async community(){
      if(experienceBusy)return;experienceBusy=true;const generation=++predGeneration;syncModeUI();window.backgroundExperience?.cancelGrab();cancel();
      try{
        report('准备八类新居民与完整浅礁…');await Promise.all([view.community.loadAll(),view.loadPredator(),view.loadFullNavigation()]);
        if(view.disposed||generation!==predGeneration)return;
        if(!await enterExperience(view,'reef',mode=>api.setMode(mode)))return;
        // Fill the existing bounded graph cache across UI turns before adding
        // the new actors, instead of making their first animation frame do it all.
        for(const kind of [...EXTRA_KINDS,'barramundi']){
          if(view.disposed||generation!==predGeneration)return;
          world.navigation.graphFor({kind,profile:profile('preview',kind,kind==='barramundi'?.25:EXTRA_FISH[kind].defaultLength)});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        const missing=[];for(const kind of ['clown',...EXTRA_KINDS,'barramundi'])if(!world.fish.some(f=>f.kind===kind)){
          const f=world.add(kind,kind==='clown'?.04:kind==='barramundi'?.25:EXTRA_FISH[kind].defaultLength);if(!f)missing.push(CATALOG[kind].name);
        }
        world.setPredation(world.fish.some(f=>f.kind==='barramundi'));document.getElementById('predation').checked=world.predation;document.getElementById('pred-size').value=String(world.fish.find(f=>f.kind==='barramundi')?.profile.totalLengthM||.25);
        document.getElementById('reef').checked=view.reefVisible;document.getElementById('habitat-scene').value=view.sceneKind;list();view.render(true);
        report(missing.length?'部分居民未加入（净空或数量限制）：'+missing.join('、'):'十类鱼已就绪，海月水母沿用当前任务；大鱼按原规则追逃。');
      }catch(error){report('多样浅礁未就绪：'+error.message);}finally{experienceBusy=false;syncModeUI();}
    },
    feed(screen=null){
      if(!active||failed||experienceBusy||view.mode!=='natural'||document.getElementById('pause').getAttribute('aria-pressed')==='true')return;
      const point=screen?foodDropPoint(view,spatial,screen):null;
      if(screen&&!point){report('这里是水域之外或被礁石遮挡，请拖到鱼附近的开阔水域。');return;}
      const r=world.feed(point);report(r.ok?`已在${point?'松手处':'上方'}投放 ${r.count} 粒饲料；实际吃到会单独计数。`:'投放过快或饲料已满。');
    },
    async experience(kind){
      if(experienceBusy)return;
      experienceBusy=true;syncModeUI();window.backgroundExperience?.cancelGrab();cancel();
      try{
        report(kind==='reef'?'正在进入完整浅礁…':'正在回到自由水域…');
        if(await enterExperience(view,kind,mode=>api.setMode(mode)))report(kind==='reef'?'完整浅礁漫游：保留现有居民与任务；造景范围可调，也可随时关闭。':'自由水域：固定造景已关闭；试着把喂食按钮拖到小鱼附近。');
      }catch(error){report('场景未切换完成：'+error.message);}
      finally{experienceBusy=false;document.getElementById('reef').checked=view.reefVisible;document.getElementById('habitat-scene').value=view.sceneKind;syncModeUI();}
    },
    async setPredator(value,length=.45){const gen=++predGeneration;
      if(!value){world.setPredation(false);for(const f of [...world.fish])if(f.kind==='barramundi')world.remove(f.id);list();return;}
      report('载入 CC0 捕食测试模型…');try{await view.loadPredator();if(gen!==predGeneration||view.disposed)return;
        for(const f of [...world.fish])if(f.kind==='barramundi')world.remove(f.id);world.add('barramundi',length);world.setPredation(true);list();report('捕食行为测试开启；这不是自然共栖物种组合。');
      }catch(error){report('捕食测试模型加载失败：'+error.message);document.getElementById('predation').checked=false;}
    },
    async setScene(kind){try{await view.setScene(kind);}finally{document.getElementById('habitat-scene').value=view.sceneKind;}},
    setAnimalStyle:value=>{view.setAnimalStyle(value);report(view.animalStyle==='soft'?'自然系轻动漫：自然结构、温柔质感与少量珠光；行为和真实比例保留。':'自然参考版：保留更接近原型的材质与动作节奏。');},
    setSpecimenGait(value){if(!['cycle','hover','swim','turn','coast','burst'].includes(value))return;if(view.specimen){view.specimen.selection=value;view.specimen.reset();view.render(true);api.updateUI();}},
    restartSpecimen(){view.specimen?.reset();view.render(true);api.updateUI();},
    async sampleExperience(kind='clown'){
      if(experienceBusy||!['clown',...EXTRA_KINDS].includes(kind))return;experienceBusy=true;syncModeUI();++predGeneration;
      try{await view.community.load(kind);if(view.disposed)return;window.backgroundExperience?.cancelGrab();cancel();await view.setReef(false);world.setPredation(false);for(const f of [...world.fish])world.remove(f.id);
        world.add(kind,kind==='clown'?.074:EXTRA_FISH[kind].defaultLength,{id:'sample-'+kind,position:new Vector3(0,.4,.4)});view.setZoom(1);document.getElementById('zoom').value='1';document.getElementById('reef').checked=document.getElementById('predation').checked=false;api.setMode('natural');list();report(CATALOG[kind].name+'近景：演示居民已重置为单鱼，任务保留；可喂食和拖拽。');
      }catch(error){report('单体观察未就绪：'+error.message);}finally{experienceBusy=false;syncModeUI();}
    },
    async drill(){const gen=++predGeneration;window.backgroundExperience?.cancelGrab();cancel();view.setMode('natural');view.sceneKind='crevice';await view.setReef(true);await view.loadPredator();if(gen!==predGeneration||view.disposed||!world.navigation.sites)return;world.startDrill(world.navigation.sites);view.renderRevision=-1;view.setMode('natural');document.getElementById('feed').disabled=document.getElementById('add-fish').disabled=false;document.body.classList.remove('inspection');window.backgroundExperience.settings.jellyfishTasks=true;for(const [id,value] of [['view-mode','natural'],['habitat-scene','crevice'],['pred-size','0.25']])document.getElementById(id).value=value;document.getElementById('reef').checked=document.getElementById('predation').checked=true;document.getElementById('angles').hidden=true;document.getElementById('depth-controls').hidden=true;list();report('已重置为两条演练鱼：小鱼选择窄缝，大鱼按身体净空绕行。');},
    async fullDrill(region,preyLength,predatorLength){
      const gen=++predGeneration;window.backgroundExperience?.cancelGrab();cancel();view.setMode('natural');view.setZoom(2.4);view.setCoverage(.42);document.getElementById('zoom').value='2.4';document.getElementById('coverage').value='42';document.getElementById('coverage-value').textContent='42%';report('读取完整浅礁的体型净空航路…');await view.setScene('full');await view.setReef(true);await view.loadPredator();
      if(gen!==predGeneration||view.disposed||!view.reefVisible||!world.navigation.isFull)return;
      const scenario=view.fullScenarios.find(s=>s.id===region);if(!scenario)throw new Error('未知演练区域');world.startFullDrill(scenario,preyLength,predatorLength);view.renderRevision=-1;
      for(const [id,value]of [['view-mode','natural'],['habitat-scene','full'],['pred-size',String(predatorLength)]])document.getElementById(id).value=value;
      document.body.classList.remove('inspection');document.getElementById('scale-labels').replaceChildren();document.getElementById('feed').disabled=document.getElementById('add-fish').disabled=false;window.backgroundExperience.settings.jellyfishTasks=true;
      document.getElementById('reef').checked=document.getElementById('predation').checked=true;document.getElementById('angles').hidden=document.getElementById('depth-controls').hidden=true;list();
      view.render(true);api.updateUI();report(`${scenario.name}：${(preyLength*100).toFixed(1)} cm / ${(predatorLength*100).toFixed(0)} cm。${world.canEat(world.fish[1],world.fish[0])?'按实际净空与可见性选路。':'该组合不符合捕食资格，保持巡游。'}`);
    },
    setReef:async on=>{try{await view.setReef(on);view.render(true);}finally{document.getElementById('reef').checked=view.reefVisible;}},setCoverage:v=>{view.setCoverage(v);view.render(true);},setZoom:v=>{view.setZoom(v);view.render(true);},
    setMode(mode){window.backgroundExperience?.cancelGrab();cancel();acc=0;view.setMode(mode);view.render(true);document.getElementById('scale-labels').replaceChildren();syncModeUI();if(window.backgroundExperience)window.backgroundExperience.settings.jellyfishTasks=mode==='natural';list();report(mode.endsWith('-compare')?'同一个体的风格对照；可切换动作、侧面、正面与俯视。':mode==='natural'?'自然游动：可喂食、抓取与捞出。开启礁景后，弯身与连续转弯使用同一净空包围。':mode==='jelly'?'海月水母：观察薄伞、马蹄形组织与短口腕。':mode==='scale'?'同深度尺标：下方横尺为 10 cm。':mode==='depth'?'共享深度检查：可切换前方、后方和局部遮挡。':'转身观察：同一条真 3D 鱼，视角改变而身体尺寸不变。');},
    setAngle:d=>{view.setAngle(d);view.render(true);},setDepth:side=>{view.depthSide=side;view.render(true);report(side==='front'?'同一条鱼位于测试石前方。':side==='back'?'同一条鱼位于测试石后方，深度测试将其遮住。':'鱼身在石后，露出的部分仍可见；没有改变透明度。');},setGuide:value=>{guide=value;guideFrame();},
    diagnostics:()=>({...view.diagnostics(),...world.snapshot(),selected,failed}),
    project:()=>world.fish.map(f=>({id:f.id,...view.project(f)})),
    dispose(){active=false;cancel();feedControl?.destroy();view.dispose();},
  };
  feedControl=PlayUI.mountFeed(document.getElementById('feed-control'),{doc:document,win:window,now:()=>performance.now(),feed:point=>api.feed(point),
    overUi:(x,y)=>{const element=document.elementFromPoint(x,y);return !element||!!element.closest('aside,nav,header,footer,button,a,input,select,summary,.task-crumple-layer');}});
  feedControl.button.id='feed';
  for(const type of ['pointerdown','pointerup'])document.addEventListener(type,e=>{if(guide)document.getElementById('interaction-log').textContent=`${type} (${Math.round(e.clientX)}, ${Math.round(e.clientY)}) · 命中 ${view.pick(e.clientX,e.clientY)?.fish.id||'空白'} · 抓取 ${held?.fish.id||'无'}`;},true);
  function syncModeUI(){
    const mode=view.mode,compare=mode.endsWith('-compare');document.getElementById('animal-style').value=view.animalStyle;document.getElementById('view-mode').value=mode;
    document.body.classList.toggle('inspection',mode!=='natural');document.body.classList.toggle('comparison',compare);
    document.getElementById('angles').hidden=!['turntable','jelly','fish-compare','jelly-compare'].includes(mode);document.getElementById('depth-controls').hidden=mode!=='depth';
    document.getElementById('specimen-controls').hidden=document.getElementById('specimen-headings').hidden=!compare;
    document.getElementById('specimen-gait').disabled=mode==='jelly-compare';
    const disabled=!active||failed||experienceBusy||mode!=='natural'||document.getElementById('pause').getAttribute('aria-pressed')==='true';
    feedControl?.setEnabled(!disabled&&world.fish.some(f=>(f.kind==='clown'||CATALOG[f.kind].feedable)&&f.life==='alive'),'请在未暂停的自然游动中投喂。');
    document.getElementById('add-fish').disabled=disabled;
    for(const button of document.querySelectorAll('[data-experience]')){
      const selected=mode==='natural'&&(button.dataset.experience==='water'?!view.reefVisible:view.reefVisible&&view.sceneKind==='full');
      button.setAttribute('aria-pressed',String(selected));button.disabled=experienceBusy;
    }
    for(const id of ['reef','habitat-scene','coverage','zoom','view-mode','crevice-drill','full-drill','sample-experience','predation','pred-size','observe-animals','community-scene','resident-species','inspect-resident'])document.getElementById(id).disabled=experienceBusy;
    document.getElementById('experience-dock').setAttribute('aria-busy',String(experienceBusy));
    document.getElementById('scene-summary').textContent=mode!=='natural'?'近景观察 · 返回水域继续交互':view.reefVisible?`${view.sceneKind==='full'?'完整浅礁':'礁缝栖息地'} · 造景 ${Math.round(view.coverage*100)}%`:'自由水域 · 固定造景已关闭';
    document.getElementById('feed-hint').textContent=mode==='natural'?'点按投食，或拖到小鱼附近松手':'左侧可切换鱼与水母的风格对照';
    document.getElementById('quiet-view').disabled=mode!=='natural';
    if(mode!=='natural'){document.body.classList.remove('immersive');document.getElementById('quiet-view').textContent='沉浸观察';document.getElementById('quiet-view').setAttribute('aria-pressed','false');}
    const link=document.getElementById('reference-link');link.href=mode==='jelly-compare'?'https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/moon-jelly':'https://australian.museum/learn/animals/fishes/eastern-clown-anemonefish-amphiprion-percula/';
  }
  let lastUI=0;
  api.updateUI=()=>{syncModeUI();if(view.specimen)document.getElementById('specimen-status').textContent=view.specimen.status||'准备观察';const d=api.diagnostics();document.getElementById('counts').textContent=`游动 ${d.fish.filter(f=>f.life==='alive').length} / 居民 ${d.fish.length} · 已吃饲料 ${d.stats.eaten} · 追逐 ${d.stats.hunts} · 捕获 ${d.stats.captures} · 放弃 ${d.stats.escapes} · 鱼种 ${new Set(d.fish.map(f=>f.kind)).size}/10`;
    document.getElementById('drill-state').textContent=d.fish.filter(f=>['shelter-fish','hunter'].includes(f.id)).map(f=>`${f.kind==='clown'?'小鱼':'大鱼'}：${phaseNames[f.behavior]||f.behavior}`).join(' · ');
    document.getElementById('navigation-info').textContent=d.navigation?.kind==='full'?`完整浅礁三维航路 · ${d.navigation.groups} 个体型图 · ${d.navigation.nodes} 个累计可行节点 · ${d.navigation.searches} 次搜索 · 最大单次规划 ${d.navigation.maxPlanMs.toFixed(1)} ms${d.navigation.lastReason?' · 最近未成路原因 '+d.navigation.lastReason:''} · 转动中移动 ${d.stats.movingTurns||0} 帧 · 重规划 ${d.stats.routeRetries||0} · 路线放弃 ${d.stats.routeAbandons||0}`:d.navigation?.kind==='off'?'造景导航已关闭':'编排礁缝航路';
    document.getElementById('diagnostics').textContent=`Three r${d.three} · 三角形 ${d.triangles} · 3D 水母 ${d.jellies} · 几何 ${d.geometries} · 纹理 ${d.textures} · 帧率 ${d.fps.toFixed(1)} · CPU 提交 ${d.cpuMs.toFixed(1)} ms（不含 GPU） · 帧 ${d.frames} · 世界 ${d.time.toFixed(1)} s · 错误 ${d.shaderErrors.length}`;
    const motion=view.mode==='fish-compare'?view.specimen.state.reference:world.fish.find(f=>f.kind==='clown');document.getElementById('motion-info').textContent=motion?`鱼体态：${view.reefVisible?'全礁参考版':'参考改进版'} · 弯身 ${(motion.bend||0).toFixed(3)} · 尾幅 ${(motion.tailAmplitude||0).toFixed(3)} · 胸鳍 ${(motion.rowing||0).toFixed(3)}`:'';
    document.getElementById('event-log').textContent=d.events.filter(e=>['capture','escape','refuge','hidden','emerged','searched-exit','removed'].includes(e.type)).map(e=>`${e.time.toFixed(1)}s ${eventNames[e.type]} ${e.prey||e.target||e.id}`).join('\n');
    if(world.revision!==lastUI){list();lastUI=world.revision;}
    const labels=document.getElementById('scale-labels');labels.replaceChildren(...(view.mode==='scale'?view.records.map(r=>{const f=r.fish,p=view.project(f),el=document.createElement('span');el.textContent=(f.profile.totalLengthM*100).toFixed(1)+' cm';el.style.left=p.x+'px';el.style.top=(p.y+45)+'px';return el;}):[]));
  };
  return api;
}
