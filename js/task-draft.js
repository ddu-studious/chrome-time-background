(function(){
 'use strict';
 window.TaskDraft={mount(modal,editing){
  modal._taskDraftCleanup?.();modal.querySelector('.task-ai-draft')?.remove();if(editing)return;
  const fields=['sidebar-task-title','sidebar-task-text','sidebar-task-priority','sidebar-task-due'].map(id=>modal.querySelector('#'+id));
  if(fields.some(field=>!field))return;
  const box=document.createElement('section');box.className='music-assistant task-ai-draft';
  box.innerHTML='<label>一句话填写任务<input maxlength="1000" placeholder="明天完成周报，优先级高" aria-label="任务描述"></label><button type="button" data-generate>生成草稿</button><button type="button" data-cancel hidden>取消</button><p role="status">先生成草稿，再填入表单；不会自动保存任务。</p><button type="button" data-apply hidden>填入表单</button>';
  fields[0].parentElement.before(box);
  const text=box.querySelector('input'),generate=box.querySelector('[data-generate]'),cancel=box.querySelector('[data-cancel]'),apply=box.querySelector('[data-apply]'),status=box.querySelector('p');
  let active=null,draft=null,baseline='';const values=()=>JSON.stringify(fields.map(field=>field.value));
  const stop=()=>{active?.abort();active=null;generate.disabled=false;cancel.hidden=true;};
  const observer=new MutationObserver(()=>{if(modal.classList.contains('hidden'))stop();});observer.observe(modal,{attributes:true,attributeFilter:['class']});
  modal._taskDraftCleanup=()=>{stop();observer.disconnect();};
  cancel.addEventListener('click',()=>{stop();status.textContent='已取消草稿生成';});
  generate.addEventListener('click',async()=>{
   if(!text.value.trim())return;stop();const controller=active=new AbortController();baseline=values();draft=null;apply.hidden=true;generate.disabled=true;cancel.hidden=false;status.textContent='正在理解任务…';
   try{
    const today=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const result=await window.SceneAI.run('task.draft',{text:text.value.trim(),today},{signal:controller.signal});
    if(active!==controller||modal.classList.contains('hidden'))return;
    if(result.question){status.textContent=result.question;return;}
    draft=result;status.textContent=`${result.title} · 截止：${result.dueDate||'未指定'} · 优先级：${({none:'无',low:'低',medium:'中',high:'高'})[result.priority]}${result.description?'\n'+result.description:''}`;apply.hidden=false;
   }catch(error){if(active===controller)status.textContent=error.message;}
   finally{if(active===controller){active=null;generate.disabled=false;cancel.hidden=true;}}
  });
  apply.addEventListener('click',()=>{
   if(!draft)return;if(values()!==baseline){status.textContent='表单已被修改，请重新生成草稿后再填入';apply.hidden=true;return;}
   [draft.title,draft.description,draft.priority,draft.dueDate].forEach((value,i)=>{fields[i].value=value;fields[i].dispatchEvent(new Event('input',{bubbles:true}));fields[i].dispatchEvent(new Event('change',{bubbles:true}));});
   apply.hidden=true;status.textContent='已填入表单，请检查后使用原保存按钮保存任务';
  });
 }};
})();
