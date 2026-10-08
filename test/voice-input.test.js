const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function fixture(policy,capture,extras={}){
  const element=()=>({events:{},addEventListener(k,fn){this.events[k]=fn;},append(...nodes){this.children=nodes;},focus(){}});
  const root=element(),input=element(),messages=[],states=[];
  const context={window:{addEventListener(){},MediaRecorder:function(){}},document:{createElement:element,...(extras.policyAllowsMicrophone===false?{permissionsPolicy:{allowsFeature:()=>false}}:{})},navigator:{mediaDevices:{getUserMedia:capture}},chrome:{runtime:{sendMessage(_,callback){callback(policy);}}},clearTimeout,setTimeout,...extras};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/voice-input.js'),'utf8'),context);
  const api=context.window.VoiceInput.mount({root,input,notify:(text,state)=>{messages.push(text);states.push(state);},...extras.mountOptions});return {root,input,messages,states,api};
}
test('控制面关闭或模型未配置时不申请麦克风',async()=>{
  for(const policy of [{ok:true,modelEnabled:false},{ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:false}}]){
    const f=fixture(policy,()=>assert.fail('不应申请麦克风'));await f.root.children[0].events.click();assert.ok(f.messages.length);assert.equal(f.root.children[0].disabled,false);
  }
});
test('麦克风拒绝时保留文字入口并恢复按钮',async()=>{
  const f=fixture({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}},async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});});
  await f.root.children[0].events.click();assert.match(f.messages.at(-1),/NotAllowedError：denied/);assert.match(f.messages.at(-1),/可继续输入文字/);assert.equal(f.states.at(-1),'microphone-error');assert.equal(f.root.children[0].disabled,false);
});
test('宿主页面权限策略拒绝时指出浮层原因，不误导为设备故障',async()=>{
  const f=fixture({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}},async()=>{throw Object.assign(new Error('Permission denied'),{name:'NotAllowedError'});},{policyAllowsMicrophone:false});
  await f.root.children[0].events.click();assert.match(f.messages.at(-1),/权限策略禁止浮层使用麦克风/);assert.equal(f.states.at(-1),'microphone-error');
});
test('控制状态无回执时限时失败，尚未申请麦克风',async()=>{
  let reply;let captures=0;
  const f=fixture(null,()=>{captures++;throw Error('不应申请麦克风');},{
    chrome:{runtime:{sendMessage(_message,callback){reply=callback;}}},
    mountOptions:{controlTimeoutMs:15}
  });
  await f.root.children[0].events.click();
  assert.equal(captures,0);assert.match(f.messages.at(-1),/控制状态读取超时/);assert.equal(f.states.at(-1),'error');assert.equal(f.root.children[0].disabled,false);
  reply({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}});
  await new Promise(setImmediate);assert.equal(captures,0);
});
test('麦克风授权长期挂起时限时恢复，迟到的媒体流立即停止',async()=>{
  let resolveCapture,stopped=0;
  const policy={ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}};
  const f=fixture(policy,()=>new Promise(resolve=>{resolveCapture=resolve;}),{mountOptions:{captureTimeoutMs:15}});
  const waiting=f.root.children[0].events.click();await new Promise(setImmediate);
  assert.equal(f.root.children[1].textContent,'取消');
  await waiting;
  assert.ok(f.messages.some(message=>message.includes('等待麦克风授权或设备就绪')));
  assert.ok(f.states.includes('permission'));
  assert.match(f.messages.at(-1),/尚未开始录音/);assert.equal(f.states.at(-1),'microphone-error');assert.equal(f.root.children[0].disabled,false);
  resolveCapture({getTracks:()=>[{stop(){stopped++;}}]});
  await new Promise(setImmediate);assert.equal(stopped,1);
});
test('等待权限时取消，迟到的媒体流立即释放',async()=>{
  let resolve,stopped=0;
  const f=fixture({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}},()=>new Promise(r=>{resolve=r;}));
  const running=f.root.children[0].events.click();await new Promise(setImmediate);
  f.root.children[1].events.click();resolve({getTracks:()=>[{stop(){stopped++;}}]});await running;assert.equal(stopped,1);
});

test('旧录音的迟到结束事件不能释放新录音流',async()=>{
  const recordings=[],stops=[0,0];let captureIndex=0;
  class Recorder {constructor(){this.state='inactive';this.mimeType='audio/webm';recordings.push(this);}start(){this.state='recording';}stop(){this.state='inactive';}}
  const f=fixture({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}},async()=>{const id=captureIndex++;return {getTracks:()=>[{stop(){stops[id]++;}}]};},{MediaRecorder:Recorder,Blob});
  const first=f.root.children[0].events.click();await new Promise(setImmediate);f.root.children[1].events.click();
  const second=f.root.children[0].events.click();await new Promise(setImmediate);
  recordings[0].onstop();await first;assert.deepEqual(stops,[1,0]);
  f.root.children[1].events.click();recordings[1].onstop();await second;assert.deepEqual(stops,[1,1]);
});

test('完整录音只转写至可编辑输入并通知草稿更新，不自动提交任务', async () => {
  let stopped=0,updated=0,submitted=0; const calls=[];
  const policy={ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}};
  class Recorder {
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['audio'])});this.onstop();}
  }
  class Decoder {async decodeAudioData(){return {duration:.2};}async close(){}}
  class Offline {createBufferSource(){return {connect(){},start(){}};}async startRendering(){return {getChannelData:()=>new Float32Array([0,.1,0])};}}
  const f=fixture(policy,async()=>({getTracks:()=>[{stop(){stopped++;}}]}),{
    Blob,MediaRecorder:Recorder,AudioContext:Decoder,OfflineAudioContext:Offline,btoa:text=>Buffer.from(text,'binary').toString('base64'),
    chrome:{runtime:{sendMessage(message,callback){calls.push(message);callback(message.action==='ai_control_get'?policy:{ok:true,status:'ready',text:'三十分钟后提醒我休息'});}}},
    mountOptions:{onTranscript(){updated++;}}
  });
  f.root.requestSubmit=()=>submitted++;
  const recording=f.root.children[0].events.click();await new Promise(setImmediate);
  assert.equal(f.root.children[0].textContent,'结束录音');assert.equal(f.root.children[1].textContent,'取消');
  await f.root.children[0].events.click();await recording;
  assert.equal(f.input.value,'三十分钟后提醒我休息');assert.equal(updated,1);assert.equal(submitted,0);assert.equal(stopped,1);
  assert.deepEqual(calls.map(call=>call.action),['ai_control_get','speech_ai_transcribe']);
  assert.match(f.messages.at(-1),/请检查文字后点击执行/);
  f.input.value='四十分钟后提醒我休息';f.input.events.input();assert.equal(f.input.value,'四十分钟后提醒我休息');
});

test('录到数字静音立即提示麦克风问题，不启动 90 秒模型识别', async () => {
  const calls=[];
  const policy={ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}};
  class Recorder {
    constructor(){this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){this.state='inactive';this.ondataavailable({data:new Blob(['silent'])});this.onstop();}
  }
  class Decoder {async decodeAudioData(){return {duration:.2};}async close(){}}
  class Offline {createBufferSource(){return {connect(){},start(){}};}async startRendering(){return {getChannelData:()=>new Float32Array(3200)};}}
  const f=fixture(policy,async()=>({getTracks:()=>[{stop(){}}]}),{
    Blob,MediaRecorder:Recorder,AudioContext:Decoder,OfflineAudioContext:Offline,
    chrome:{runtime:{sendMessage(message,callback){calls.push(message.action);callback(policy);}}}
  });
  const recording=f.root.children[0].events.click();await new Promise(setImmediate);
  await f.root.children[0].events.click();await recording;
  assert.deepEqual(calls,['ai_control_get']);
  assert.match(f.messages.at(-1),/没有录到声音/);
  assert.equal(f.root.children[0].disabled,false);
});

test('工作台忙碌禁用语音输入，解除禁用后继续使用原入口', async () => {
  const f=fixture({ok:true,modelEnabled:false},()=>assert.fail('不应申请麦克风'));
  f.api.setDisabled(true);await f.root.children[0].events.click();assert.equal(f.messages.length,0);assert.equal(f.root.children[0].disabled,true);
  f.api.setDisabled(false);await f.root.children[0].events.click();assert.match(f.messages.at(-1),/未启用/);assert.equal(f.root.children[0].disabled,false);
});

test('实时录音逐步回填文字，停顿后最终修正且不自动提交', async () => {
  const policy={ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}};
  let onPreview,finish,stopped=0,submitted=0,transcripts=0,recognitions=0;const calls=[];
  const capture={finished:new Promise(resolve=>{finish=resolve;}),stop(){},cancel(){finish({reason:'cancel',samples:null});}};
  class Offline {
    constructor(_channels,length){this.length=length;}
    createBuffer(_channels,length){const data=new Float32Array(length);return {copyToChannel(samples){data.set(samples);},getChannelData(){return data;}};}
    createBufferSource(){const source={connect(){},start(){}};this.source=source;return source;}
    async startRendering(){return {getChannelData:()=>this.source.buffer.getChannelData(0)};}
  }
  const f=fixture(policy,async()=>({getTracks:()=>[{stop(){stopped++;}}]}),{
    window:{addEventListener(){},VoiceLive:{async start(_stream,options){onPreview=options.onPreview;return capture;}}},
    OfflineAudioContext:Offline,btoa:text=>Buffer.from(text,'binary').toString('base64'),
    chrome:{runtime:{sendMessage(message,callback){calls.push(message.action);if(message.action==='ai_control_get')callback(policy);else if(message.action==='speech_ai_transcribe')callback({ok:true,status:'ready',text:++recognitions===1?'逐步文字':'最终文字'});else callback({ok:true});}}},
    mountOptions:{live:true,onTranscript(){transcripts++;}}
  });
  f.root.requestSubmit=()=>submitted++;
  const running=f.root.children[0].events.click();await new Promise(setImmediate);
  assert.equal(f.root.children[0].textContent,'完成语音输入');
  onPreview(new Float32Array(3*16000).fill(.1),16000);await new Promise(setImmediate);
  assert.equal(f.input.value,'逐步文字');assert.equal(transcripts,1);
  finish({reason:'silence',heardSpeech:true,samples:new Float32Array(4*16000).fill(.1),sampleRate:16000});
  await running;
  assert.equal(f.input.value,'最终文字');assert.equal(transcripts,2);assert.equal(submitted,0);assert.equal(stopped,1);
  assert.deepEqual(calls,['ai_control_get','speech_ai_transcribe','speech_ai_transcribe']);
});

test('取消实时录音后释放迟到的识别任务，不覆盖输入或提交助手', async () => {
  const policy={ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}};
  let onPreview,finish,replyPreview;const calls=[];
  const capture={finished:new Promise(resolve=>{finish=resolve;}),stop(){},cancel(){finish({reason:'cancel',samples:null});}};
  class Offline {
    createBuffer(_channels,length){const data=new Float32Array(length);return {copyToChannel(samples){data.set(samples);},getChannelData(){return data;}};}
    createBufferSource(){const source={connect(){},start(){}};this.source=source;return source;}
    async startRendering(){return {getChannelData:()=>this.source.buffer.getChannelData(0)};}
  }
  const f=fixture(policy,async()=>({getTracks:()=>[{stop(){}}]}),{
    window:{addEventListener(){},VoiceLive:{async start(_stream,options){onPreview=options.onPreview;return capture;}}},
    OfflineAudioContext:Offline,btoa:text=>Buffer.from(text,'binary').toString('base64'),
    chrome:{runtime:{sendMessage(message,callback){calls.push(message.action);if(message.action==='ai_control_get')callback(policy);else if(message.action==='speech_ai_transcribe')replyPreview=callback;else callback({ok:true});}}},
    mountOptions:{live:true}
  });
  f.input.value='原有输入';
  const running=f.root.children[0].events.click();await new Promise(setImmediate);
  onPreview(new Float32Array(3*16000).fill(.1),16000);await new Promise(setImmediate);
  f.api.cancel();await running;
  replyPreview({ok:true,status:'pending',jobId:'a'.repeat(32)});await new Promise(setImmediate);
  assert.equal(f.input.value,'原有输入');
  assert.deepEqual(calls,['ai_control_get','speech_ai_transcribe','ai_job_cancel']);
});
