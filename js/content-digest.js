(function(){
 'use strict';const $=id=>document.getElementById(id);let active=null,resultText='';
 if(new URLSearchParams(location.search).get('kind')==='transcript')$('kind').value='transcript';
 const stop=()=>{active?.abort();active=null;$('generate').disabled=false;$('cancel').hidden=true;};
 $('cancel').addEventListener('click',()=>{stop();$('status').textContent='已取消生成';});window.addEventListener('pagehide',stop);
 for(const id of ['text','title','kind'])$(id).addEventListener('input',()=>{stop();$('output').hidden=true;resultText='';});
 $('digest-form').addEventListener('submit',async event=>{
  event.preventDefault();stop();const controller=active=new AbortController();$('generate').disabled=true;$('cancel').hidden=false;$('output').hidden=true;$('status').textContent='正在基于所提供片段生成…';
  try{
   const result=await window.SceneAI.run('content.digest',{kind:$('kind').value,title:$('title').value,text:$('text').value},{signal:controller.signal});if(active!==controller)return;
   $('result').replaceChildren();$('scope').textContent=`仅覆盖本次提供的 ${result.sourceCharacters} 个字符，不代表完整文章或视频。`;
   const overview=document.createElement('p');overview.textContent=result.overview;$('result').append(overview);const lines=[result.title||'片段提要',result.overview];
   for(const point of result.points){const article=document.createElement('article'),heading=document.createElement('p'),quote=document.createElement('blockquote');heading.textContent=point.text;quote.textContent=point.quote;article.append(heading,quote);$('result').append(article);lines.push('- '+point.text,'  依据：'+point.quote);}
   if(result.questions.length){const heading=document.createElement('h3');heading.textContent='复习问题';$('result').append(heading);for(const question of result.questions){const p=document.createElement('p');p.textContent=question;$('result').append(p);lines.push('问题：'+question);}}
   resultText=lines.join('\n');$('output').hidden=false;$('status').textContent='已生成，请结合引用片段核对';
  }catch(error){if(active===controller)$('status').textContent=error.message;}
  finally{if(active===controller){active=null;$('generate').disabled=false;$('cancel').hidden=true;}}
 });
 $('copy').addEventListener('click',async()=>{if(!resultText)return;try{await navigator.clipboard.writeText(resultText);$('status').textContent='已复制提要';}catch{$('status').textContent='复制失败，请手动选择文本复制';}});
})();
