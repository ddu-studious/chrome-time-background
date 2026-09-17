(function(){
 'use strict';
 window.ScheduleDraft={mount(overlay){
  const ids=['sch-plan-name','sch-plan-note','sch-plan-date','sch-plan-start','sch-plan-end'];const fields=ids.map(id=>overlay.querySelector('#'+id));if(fields.some(field=>!field))return;
  const box=document.createElement('section');box.className='music-assistant';box.innerHTML='<label>一句话安排日程<input maxlength="1000" placeholder="明天下午三点开会一小时" aria-label="日程描述"></label><button type="button" data-generate>生成日程草稿</button><button type="button" data-cancel hidden>取消生成</button><p role="status">先预览，再填入表单，不会自动保存。</p><button type="button" data-apply hidden>填入日程表单</button>';
  fields[0].parentElement.before(box);
  const generate=box.querySelector('[data-generate]'),cancel=box.querySelector('[data-cancel]'),apply=box.querySelector('[data-apply]'),status=box.querySelector('p'),text=box.querySelector('input');
  let active=null,draft=null,baseline='';const snapshot=()=>JSON.stringify(fields.map(field=>field.value));
  const stop=()=>{active?.abort();active=null;generate.disabled=false;cancel.hidden=true;};overlay._scheduleDraftCleanup=stop;
  cancel.addEventListener('click',()=>{stop();status.textContent='已取消生成';});
  generate.addEventListener('click',async()=>{
   if(!text.value.trim())return;stop();const controller=active=new AbortController();baseline=snapshot();draft=null;apply.hidden=true;generate.disabled=true;cancel.hidden=false;status.textContent='正在理解日程…';
   try{
    const today=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const result=await window.SceneAI.run('schedule.draft',{text:text.value.trim(),today,selectedDate:fields[2].value},{signal:controller.signal});
    if(active!==controller||!overlay.isConnected)return;
    if(result.question){status.textContent=result.question;return;}
    draft=result;status.textContent=`${result.name} · ${result.date} ${result.startTime}—${result.endTime}${result.note?'\n'+result.note:''}`;apply.hidden=false;
   }catch(error){if(active===controller)status.textContent=error.message;}
   finally{if(active===controller){active=null;generate.disabled=false;cancel.hidden=true;}}
  });
  apply.addEventListener('click',()=>{
   if(!draft)return;if(snapshot()!==baseline){apply.hidden=true;status.textContent='表单已修改，请重新生成草稿';return;}
   [draft.name,draft.note,draft.date,draft.startTime,draft.endTime].forEach((value,index)=>{fields[index].value=value;fields[index].dispatchEvent(new Event('change',{bubbles:true}));});
   apply.hidden=true;status.textContent='已填入，请检查并使用原添加按钮保存';
  });
 }};
})();
