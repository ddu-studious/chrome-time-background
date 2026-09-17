(function () {
  'use strict';
  const send = (action, body = {}) => new Promise(resolve => chrome.runtime.sendMessage({ action, ...body }, response => resolve(response || { ok: false, error: '后台未响应' })));
  async function encode(blob) {
    const context = new AudioContext();
    let decoded;
    try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); } finally { await context.close(); }
    if (decoded.duration > 30 || decoded.duration < .1) throw new Error('请录制 0.1 至 30 秒的短句');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    const pcm = (await offline.startRendering()).getChannelData(0);
    const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset+i] = value.charCodeAt(i); };
    text(0,'RIFF'); view.setUint32(4,bytes.length-8,true); text(8,'WAVEfmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,bytes.length-44,true);
    for(let i=0;i<pcm.length;i++) view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);
    let binary=''; for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  window.VoiceInput = { mount({root,input,notify,onStart}) {
    const button = document.createElement('button'), cancel = document.createElement('button');
    button.type = cancel.type = 'button'; button.textContent = '说一句话'; button.title = '本机识别，转写后可编辑'; cancel.textContent = '取消录音'; cancel.hidden = true;
    root.append(button,cancel);
    let version=0, stream=null, recorder=null, jobId=null, timer=null, busy=false;
    const release = () => { clearTimeout(timer); stream?.getTracks().forEach(track=>track.stop()); stream=null; };
    const reset = () => { busy=false; button.disabled=false; button.textContent='说一句话'; cancel.hidden=true; };
    const abort = () => { version++; if(jobId) void send('ai_job_cancel',{jobId}); jobId=null; if(recorder?.state==='recording') recorder.stop(); recorder=null; release(); reset(); };
    cancel.addEventListener('click',()=>{abort();notify('已取消语音输入');});
    input.addEventListener('input',abort); root.addEventListener('submit',abort); window.addEventListener('pagehide',abort);
    button.addEventListener('click',async()=>{
      if(recorder?.state==='recording'){recorder.stop();return;}
      if(busy)return;
      onStart?.(); const current=++version; busy=true; button.disabled=true; cancel.hidden=false;
      try {
        const policy=await send('ai_control_get'); if(current!==version)return;
        if(!policy.ok)throw new Error(policy.error);
        if(!policy.modelEnabled || !policy.scenes?.find(s=>s.id==='speech.transcribe')?.modelEnabled)throw new Error('语音识别未启用，请检查 AI 控制台');
        if(!policy.speech?.configured)throw new Error('本地语音模型尚未配置，可继续输入文字');
        if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)throw new Error('当前环境不支持录音，请使用文字输入');
        const captured=await navigator.mediaDevices.getUserMedia({audio:true});
        if(current!==version){captured.getTracks().forEach(track=>track.stop());return;}
        stream=captured; const chunks=[]; let size=0;
        const recording = recorder=new MediaRecorder(stream);
        recording.ondataavailable=event=>{ if(event.data.size){size+=event.data.size;chunks.push(event.data);} if(size>8000000 && recording.state==='recording')recording.stop(); };
        const audio=await new Promise((resolve,reject)=>{
          recording.onerror=()=>reject(new Error('录音失败，请重试'));
          recording.onstop=()=>resolve(new Blob(chunks,{type:recording.mimeType}));
          recorder.start(250); button.disabled=false;button.textContent='结束录音';notify('正在录音，音频仅发送到本机识别；转写后可编辑');
          timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},29000);
        });
        if(current!==version)return; release();
        if(size>8000000)throw new Error('录音过大，请缩短语句');
        button.disabled=true;button.textContent='识别中…';notify('录音已结束，正在本机识别…');
        const encoded=await encode(audio); if(current!==version)return;
        let result=await send('speech_ai_transcribe',{audio:encoded});
        if(current!==version){if(result.jobId)void send('ai_job_cancel',{jobId:result.jobId});return;}
        jobId=result.jobId;const deadline=Date.now()+100000;
        while(result.ok&&result.status==='pending'){
          if(Date.now()>deadline)throw new Error('语音识别超时');
          await new Promise(resolve=>setTimeout(resolve,1000));if(current!==version)return;
          result=await send('speech_ai_result',{jobId});
        }
        if(current!==version)return;if(!result.ok)throw new Error(result.error||'识别失败');
        if(typeof result.text!=='string'||!result.text.trim()||result.text.length>500)throw new Error('转写内容无效');
        input.value=result.text;notify('已转写，请检查文字后点击执行');input.focus();
      }catch(error){if(current===version){if(jobId)void send('ai_job_cancel',{jobId});notify(error.name==='NotAllowedError'?'未获得麦克风权限，可继续输入文字':error.message);}}
      finally{if(current===version){release();recorder=null;jobId=null;reset();}}
    });
    return { cancel: abort };
  }};
})();
