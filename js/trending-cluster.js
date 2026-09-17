(function(){
 'use strict';window.TrendingCluster={mount(panel,getItems){
  const box=document.createElement('details');box.className='music-assistant trending-cluster';box.innerHTML='<summary>AI 主题聚合</summary><p>按当前筛选中的前20条有效标题聚合，不读取新闻正文。</p><button type="button" data-run>聚合当前标题</button><button type="button" data-cancel hidden>取消</button><p data-status role="status"></p><div data-result></div>';
  panel.querySelector('.tep-view-container').before(box);const run=box.querySelector('[data-run]'),cancel=box.querySelector('[data-cancel]'),status=box.querySelector('[data-status]'),output=box.querySelector('[data-result]');let active=null;
  const snapshot=()=>getItems().filter(item=>item.title&&/^https?:\/\//i.test(item.url||'')).slice(0,20).map(item=>({title:String(item.title).slice(0,180),source:String(item.type||'').slice(0,60),url:item.url}));
  const stop=()=>{active?.abort();active=null;run.disabled=false;cancel.hidden=true;};
  const invalidate=()=>{stop();output.replaceChildren();status.textContent='筛选已变化，请重新聚合';};
  panel.addEventListener('input',event=>{if(event.target.id==='tep-search-input')invalidate();});
  panel.querySelector('#tep-filter-bar')?.addEventListener('click',invalidate);
  cancel.addEventListener('click',()=>{stop();status.textContent='已取消聚合';});box.addEventListener('toggle',()=>{if(!box.open)stop();});
  const observer=new MutationObserver(()=>{if(!panel.classList.contains('open'))stop();});observer.observe(panel,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pagehide',()=>{stop();observer.disconnect();},{once:true});
  run.addEventListener('click',async()=>{
   stop();output.replaceChildren();const items=snapshot();if(!items.length){status.textContent='没有可聚合的标题';return;}const signature=JSON.stringify(items),controller=active=new AbortController();run.disabled=true;cancel.hidden=false;status.textContent='正在聚合标题…';
   try{
    const result=await window.SceneAI.run('trending.cluster',{items},{signal:controller.signal});if(active!==controller)return;
    if(JSON.stringify(snapshot())!==signature){status.textContent='热榜或筛选已变化，请重新聚合';return;}
    status.textContent=`处理 ${result.total} 条标题；归类不等于新闻事实核验。`;
    for(const group of result.groups){const section=document.createElement('section'),heading=document.createElement('h4'),note=document.createElement('p');heading.textContent=`${group.title} · ${group.kind==='same_event'?'可能为同一事件':group.kind==='topic'?'主题归类':'未归类'}`;note.textContent=group.reason;section.append(heading,note);for(const item of group.items){const link=document.createElement('a');link.href=item.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`${item.title}（${item.source}）`;const row=document.createElement('p');row.append(link);section.append(row);}output.append(section);}
   }catch(error){if(active===controller)status.textContent=error.message;}
   finally{if(active===controller){active=null;run.disabled=false;cancel.hidden=true;}}
  });
 }};
})();
