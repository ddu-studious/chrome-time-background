(function(){
 'use strict';
 window.WorkspaceMatcher={mount(controller){
  const anchor=document.getElementById('sw-groups');if(!anchor)return;
  const box=document.createElement('section');box.className='music-assistant';box.innerHTML='<label>一句话打开工作区<input maxlength="500" aria-label="工作区需求" placeholder="打开我写 Java 时用的工作区"></label><button type="button" data-match>匹配工作区</button><button type="button" data-cancel hidden>取消</button><p role="status">仅匹配已有分组；确认后复用已有标签页。</p><button type="button" data-open hidden></button>';
  anchor.before(box);
  const input=box.querySelector('input'),match=box.querySelector('[data-match]'),cancel=box.querySelector('[data-cancel]'),open=box.querySelector('[data-open]'),status=box.querySelector('p');let active=null,selection=null,opening=false;
  const signature=(config,id)=>JSON.stringify({group:config.groups.find(g=>g.id===id),sites:config.sites.filter(s=>s.groupId===id).map(s=>[s.id,s.name,s.startUrl]),pages:config.pages.filter(p=>p.groupId===id).map(p=>[p.id,p.title,p.url])});
  const stop=()=>{active?.abort();active=null;cancel.hidden=true;match.disabled=false;};
  cancel.addEventListener('click',()=>{stop();status.textContent='已取消匹配';});input.addEventListener('input',()=>{stop();selection=null;open.hidden=true;});window.addEventListener('pagehide',stop);
  match.addEventListener('click',async()=>{
   if(!input.value.trim()||opening)return;stop();selection=null;open.hidden=true;const pending=active=new AbortController();match.disabled=true;cancel.hidden=false;status.textContent='正在匹配已有工作区…';
   try{
    const snapshot=await controller.service.getSnapshot();if(active!==pending)return;
    const query=input.value.trim(),normalized=query.toLowerCase();
    const exact=snapshot.config.groups.filter(group=>[group.name,`打开${group.name}`,`打开${group.name}工作区`].some(value=>value.toLowerCase()===normalized));
    let result;
    if(exact.length===1)result={groupId:exact[0].id,reason:'分组名称精确匹配'};
    else {
     if(snapshot.config.groups.length>30)throw new Error('分组超过30个，请直接输入完整分组名');
     const groups=snapshot.config.groups.map(group=>({id:group.id,name:group.name.slice(0,60),entries:[...snapshot.config.sites.filter(s=>s.groupId===group.id).map(s=>s.name),...snapshot.config.pages.filter(p=>p.groupId===group.id).map(p=>p.title)].join('、').slice(0,120)}));
     if(!groups.length)throw new Error('还没有工作区分组');
     result=await window.SceneAI.run('workspace.match',{query,groups},{signal:pending.signal});
    }
    if(active!==pending)return;if(result.question){status.textContent=result.question;return;}
    const group=snapshot.config.groups.find(group=>group.id===result.groupId);if(!group)throw new Error('匹配分组不存在');
    selection={id:group.id,signature:signature(snapshot.config,group.id)};const pageCount=snapshot.config.pages.filter(p=>p.groupId===group.id).length,siteCount=snapshot.config.sites.filter(s=>s.groupId===group.id).length;status.textContent=`${group.name}：${result.reason}。分组有 ${pageCount} 个保存页面、${siteCount} 个网站入口，打开时去重并复用。`;
    open.textContent=`打开“${group.name}”分组`;open.hidden=false;
   }catch(error){if(active===pending)status.textContent=error.message;}
   finally{if(active===pending){active=null;match.disabled=false;cancel.hidden=true;}}
  });
  open.addEventListener('click',async()=>{
   if(!selection||opening)return;const chosen=selection;opening=true;open.disabled=true;
   try{
    const fresh=await controller.service.getSnapshot();if(signature(fresh.config,chosen.id)!==chosen.signature)throw new Error('工作区内容已变化，请重新匹配');
    const result=await controller.service.openGroup(chosen.id);status.textContent=`已打开或复用 ${result.opened} 个入口，失败 ${result.failed} 个`;await controller.render();
   }catch(error){status.textContent=error.message;}
   finally{opening=false;open.disabled=false;selection=null;open.hidden=true;}
  });
 }};
})();
