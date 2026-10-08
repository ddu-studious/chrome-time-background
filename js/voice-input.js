(function () {
  'use strict';
  const send = (action, body = {}) => new Promise(resolve => chrome.runtime.sendMessage({ action, ...body }, response => {
    const error = chrome.runtime.lastError;
    resolve(error ? { ok: false, error: '扩展后台暂不可用，请重新打开工作台' } : response || { ok: false, error: '后台未响应' });
  }));
  function wav(pcm) {
    if (!pcm.some(sample => Math.abs(sample) > 0.001)) throw new Error('没有录到声音，请检查麦克风后重试');
    const bytes = new Uint8Array(44 + pcm.length * 2), view = new DataView(bytes.buffer);
    const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset+i] = value.charCodeAt(i); };
    text(0,'RIFF'); view.setUint32(4,bytes.length-8,true); text(8,'WAVEfmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,16000,true); view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); text(36,'data'); view.setUint32(40,bytes.length-44,true);
    for(let i=0;i<pcm.length;i++) view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),true);
    let binary=''; for(let i=0;i<bytes.length;i+=8192) binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return btoa(binary);
  }
  async function encode(blob) {
    const context = new AudioContext();
    let decoded;
    try { decoded = await context.decodeAudioData(await blob.arrayBuffer()); } finally { await context.close(); }
    if (decoded.duration > 30 || decoded.duration < .1) throw new Error('请录制 0.1 至 30 秒的短句');
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
    return wav((await offline.startRendering()).getChannelData(0));
  }
  async function encodeSamples(samples, sampleRate) {
    const duration = samples.length / sampleRate;
    if (duration > 30 || duration < .1) throw new Error('请录制 0.1 至 30 秒的短句');
    const offline = new OfflineAudioContext(1, Math.ceil(duration * 16000), 16000);
    const source = offline.createBufferSource();
    source.buffer = offline.createBuffer(1, samples.length, sampleRate);
    source.buffer.copyToChannel(samples, 0);
    source.connect(offline.destination); source.start();
    return wav((await offline.startRendering()).getChannelData(0));
  }
  function failureMessage(error) {
    const name = error?.name || 'Error';
    const detail = typeof error?.message === 'string' ? error.message.trim().slice(0, 180) : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      let blockedByPage = false;
      try { blockedByPage = (document.permissionsPolicy || document.featurePolicy)?.allowsFeature('microphone') === false; } catch {}
      const reason = blockedByPage
        ? '当前页面的权限策略禁止浮层使用麦克风，请在扩展独立工作台录音'
        : '麦克风访问被拒绝，请检查 Chrome 和系统对麦克风的授权';
      return `${reason}（${name}${detail ? `：${detail}` : ''}）。也可继续输入文字。`;
    }
    if (name === 'NotFoundError') return `未找到可用麦克风（${name}），请检查设备连接。`;
    if (name === 'NotReadableError') return `麦克风无法读取（${name}${detail ? `：${detail}` : ''}），请检查设备是否被其他应用占用。`;
    return detail || `语音输入失败（${name}），请重试。`;
  }
  function waitFor(promise, timeoutMs, message, onLate) {
    let timer, expired = false;
    const observed = Promise.resolve(promise).then(value => {
      if (expired) { try { onLate?.(value); } catch {} }
      return value;
    });
    return Promise.race([observed, new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error(message)); }, timeoutMs);
    })]).finally(() => clearTimeout(timer));
  }
  window.VoiceInput = { mount({root,input,notify,onStart,onTranscript,controls=root,live=false,controlTimeoutMs=10000,captureTimeoutMs=30000}) {
    const button = document.createElement('button'), cancel = document.createElement('button');
    button.type = cancel.type = 'button'; button.textContent = '说一句话'; button.title = '本机识别，转写后可编辑'; cancel.textContent = '取消'; cancel.title = '取消本次语音输入'; cancel.hidden = true;
    (controls || root).append(button,cancel);
    let version=0, stream=null, recorder=null, liveCapture=null, jobId=null, timer=null, busy=false, disabled=false;
    const release = () => { clearTimeout(timer); stream?.getTracks().forEach(track=>track.stop()); stream=null; };
    const reset = () => { busy=false; button.disabled=disabled; button.textContent='说一句话'; cancel.hidden=true; };
    const abort = () => { version++; if(jobId) void send('ai_job_cancel',{jobId}); jobId=null; liveCapture?.cancel(); liveCapture=null; if(recorder?.state==='recording') recorder.stop(); recorder=null; release(); reset(); };
    cancel.addEventListener('click',()=>{abort();notify('已取消语音输入');});
    input.addEventListener('input',abort); root.addEventListener('submit',abort); window.addEventListener('pagehide',abort);
    const recognize = async (encoded, current, maxMs = 100000) => {
      let result=await send('speech_ai_transcribe',{audio:encoded});
      if(current!==version){if(result.jobId)void send('ai_job_cancel',{jobId:result.jobId});return null;}
      const activeJobId=result.jobId; jobId=activeJobId;
      const deadline=Date.now()+maxMs;
      try {
        while(result.ok&&result.status==='pending'){
          if(Date.now()>deadline){if(activeJobId)await send('ai_job_cancel',{jobId:activeJobId});throw new Error('语音识别超时');}
          await new Promise(resolve=>setTimeout(resolve,700));if(current!==version)return null;
          result=await send('speech_ai_result',{jobId:activeJobId});
        }
        if(current!==version)return null;
        if(!result.ok)throw new Error(result.error||'识别失败');
        if(typeof result.text!=='string'||!result.text.trim()||result.text.length>500)throw new Error('转写内容无效');
        return result.text;
      } finally { if(jobId===activeJobId)jobId=null; }
    };
    button.addEventListener('click',async()=>{
      if(recorder?.state==='recording'){recorder.stop();return;}
      if(liveCapture){liveCapture.stop();return;}
      if(busy || disabled || input.disabled)return;
      onStart?.(); const current=++version; busy=true; button.disabled=true; cancel.hidden=false; notify('正在检查语音输入…');
      let stage='control';
      try {
        const policy=await waitFor(send('ai_control_get'),controlTimeoutMs,'本机 AI 控制状态读取超时，尚未申请麦克风；请检查本机服务后重试'); if(current!==version)return;
        if(!policy.ok)throw new Error(policy.error);
        if(!policy.modelEnabled || !policy.scenes?.find(s=>s.id==='speech.transcribe')?.modelEnabled)throw new Error('语音识别未启用，请检查 AI 控制台');
        if(!policy.speech?.configured)throw new Error('本地语音模型尚未配置，可继续输入文字');
        if(!navigator.mediaDevices?.getUserMedia || (!live && !window.MediaRecorder))throw new Error('当前环境不支持录音，请使用文字输入');
        stage='capture';
        notify('正在等待麦克风授权或设备就绪；尚未开始录音','permission');
        const captured=await waitFor(navigator.mediaDevices.getUserMedia({audio:true}),captureTimeoutMs,'等待麦克风超过 30 秒，尚未开始录音；请检查 Chrome 与系统的麦克风授权后重试',late=>late?.getTracks().forEach(track=>track.stop()));
        if(current!==version){captured.getTracks().forEach(track=>track.stop());return;}
        stage='recording';
        if(live){
          if(!window.VoiceLive?.start)throw new Error('实时录音组件未加载，请重新打开工作台');
          let previewPromise=null, previewDisabled=false;
          const onPreview=(samples, sampleRate)=>{
            if(previewPromise || previewDisabled || current!==version)return;
            previewPromise=(async()=>{
              const encoded=await encodeSamples(samples,sampleRate);if(current!==version)return;
              const text=await recognize(encoded,current,15000);if(current!==version||!text)return;
              input.value=text;onTranscript?.(text);notify('正在听，文字会继续修正；停顿后自动完成');
            })().catch(error=>{
              if(current===version){previewDisabled=true;notify(`实时文字暂不可用：${failureMessage(error)}；录音继续，结束后会完整转写`);}
            }).finally(()=>{previewPromise=null;});
          };
          stream=captured;
          const capture=await waitFor(window.VoiceLive.start(stream,{onPreview}),5000,'实时录音初始化超时，请重试',late=>late?.cancel());
          if(current!==version){capture.cancel();return;}
          liveCapture=capture;button.disabled=false;button.textContent='完成语音输入';
          notify('正在录音，文字会逐步出现；说完稍停即可自动完成');
          const recorded=await capture.finished;
          if(current!==version)return;
          liveCapture=null;release();
          button.disabled=true;button.textContent='整理中…';notify('录音已结束，正在整理最终文字…');
          if(previewPromise)await previewPromise;
          if(current!==version)return;
          if(!recorded.heardSpeech||!recorded.samples?.length)throw new Error('没有录到声音，请检查麦克风后重试');
          stage='transcribe';
          const encoded=await encodeSamples(recorded.samples,recorded.sampleRate);if(current!==version)return;
          const text=await recognize(encoded,current);if(current!==version||!text)return;
          input.value=text;onTranscript?.(text);notify('已转写，请检查文字后点击执行');input.focus();
          return;
        }
        stream=captured; const chunks=[]; let size=0;
        const recording = recorder=new MediaRecorder(stream);
        recording.ondataavailable=event=>{ if(event.data.size){size+=event.data.size;chunks.push(event.data);} if(size>8000000 && recording.state==='recording')recording.stop(); };
        const audio=await new Promise((resolve,reject)=>{
          recording.onerror=()=>reject(new Error('录音失败，请重试'));
          recording.onstop=()=>resolve(new Blob(chunks,{type:recording.mimeType}));
          recorder.start(250); button.disabled=false;button.textContent='结束录音';notify('正在录音；说完后点击“结束录音”，再转写为可编辑文字');
          timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},29000);
        });
        if(current!==version)return; release();
        if(size>8000000)throw new Error('录音过大，请缩短语句');
        stage='transcribe';button.disabled=true;button.textContent='识别中…';notify('录音已结束，正在本机识别…');
        const encoded=await encode(audio); if(current!==version)return;
        const text=await recognize(encoded,current);if(current!==version||!text)return;
        input.value=text;onTranscript?.(text);notify('已转写，请检查文字后点击执行');input.focus();
      }catch(error){if(current===version){if(jobId)void send('ai_job_cancel',{jobId});notify(failureMessage(error),stage==='capture'?'microphone-error':'error');}}
      finally{if(current===version){liveCapture?.cancel();liveCapture=null;release();recorder=null;jobId=null;reset();}}
    });
    return { cancel: abort, setDisabled(value) { const next = Boolean(value); if (next && !disabled && busy) abort(); disabled=next; button.disabled=disabled || (busy && recorder?.state !== 'recording' && !liveCapture); } };
  }};
})();
