(function () {
  'use strict';
  const send=(action,body={})=>new Promise(resolve=>chrome.runtime.sendMessage({action,...body},response=>resolve(response||{ok:false,error:'AI 后台未响应'})));
  window.SceneAI={async control(){const result=await send('ai_control_get');if(!result.ok)throw new Error(result.error);return result;},async run(scene,input,{signal}={}){
    let jobId;
    const cancel=()=>{if(jobId)void send('ai_job_cancel',{jobId});};
    signal?.throwIfAborted();signal?.addEventListener('abort',cancel,{once:true});
    try{
      let result=await send('ai_scene_submit',{scene,input});jobId=result.jobId;
      if(signal?.aborted){cancel();signal.throwIfAborted();}
      const deadline=Date.now()+100000;
      while(result.ok&&result.status==='pending'){
        if(Date.now()>deadline)throw new Error('AI 处理超时，请重试');
        await new Promise(resolve=>setTimeout(resolve,1000));signal?.throwIfAborted();
        result=await send('ai_scene_result',{jobId});
      }
      signal?.throwIfAborted();if(!result.ok)throw new Error(result.error||'AI 处理失败');
      return result.data;
    }catch(error){cancel();throw error;}
    finally{signal?.removeEventListener('abort',cancel);}
  }};
})();
