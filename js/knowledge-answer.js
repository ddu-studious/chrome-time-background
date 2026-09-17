(function(){
 'use strict';
 window.KnowledgeAnswer={mount({root,searchInput,getCandidates}){
  root._knowledgeCleanup?.();root.querySelector('.knowledge-answer')?.remove();
  const box=document.createElement('section');box.className='music-assistant knowledge-answer';
  box.innerHTML='<label>向当前检索资料提问<input maxlength="500" aria-label="知识问题" placeholder="这些资料能回答什么？"></label><button type="button" data-ask>根据资料回答</button><button type="button" data-cancel hidden>取消</button><p role="status">仅使用已有摘要，不会自动抓取网页。</p><div data-answer></div>';
  const results=root.querySelector('.bm-spotlight-results');if(results)results.before(box);else root.append(box);
  const question=box.querySelector('input'),ask=box.querySelector('[data-ask]'),cancel=box.querySelector('[data-cancel]'),status=box.querySelector('p'),answer=box.querySelector('[data-answer]');let active=null;
  const stop=()=>{active?.abort();active=null;ask.disabled=false;cancel.hidden=true;};
  const changed=()=>{stop();answer.replaceChildren();status.textContent='检索或问题已改变，请重新提问';};
  searchInput.addEventListener('input',changed);question.addEventListener('input',changed);
  root._knowledgeCleanup=()=>{stop();searchInput.removeEventListener('input',changed);};
  cancel.addEventListener('click',()=>{stop();status.textContent='已取消问答';});
  ask.addEventListener('click',async()=>{
   stop();answer.replaceChildren();const text=(question.value||searchInput.value).trim();
   if(!text){status.textContent='请输入问题';return;}
   const sources=getCandidates().filter(item=>(item.summary||item.pageDescription||'').trim()).slice(0,5).map((item,index)=>({id:String(item.id||index),title:String(item.title||'').slice(0,160),url:item.url,content:String(item.summary||item.pageDescription).slice(0,600)}));
   if(!sources.length){status.textContent='当前结果没有可用摘要，请先抓取摘要或更换检索资料';return;}
   const controller=active=new AbortController();ask.disabled=true;cancel.hidden=false;status.textContent=`正在基于 ${sources.length} 条摘要回答…`;
   try{
    const result=await window.SceneAI.run('knowledge.answer',{question:text,sources},{signal:controller.signal});
    if(active!==controller||!root.isConnected)return;
    status.textContent=result.insufficient?'资料不足，以下说明仅供核对':'回答基于下列摘要，请核对来源';
    const paragraph=document.createElement('p');paragraph.textContent=result.answer;answer.append(paragraph);
    for(const citation of result.citations){const item=document.createElement('div'),link=document.createElement('a'),quote=document.createElement('blockquote');link.href=citation.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=citation.title||citation.id;quote.textContent='摘要片段：'+citation.quote;item.append(link,quote);answer.append(item);}
   }catch(error){if(active===controller)status.textContent=error.message;}
   finally{if(active===controller){active=null;ask.disabled=false;cancel.hidden=true;}}
  });
 }};
})();
