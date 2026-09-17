const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function fixture(policy,capture,extras={}){
  const element=()=>({events:{},addEventListener(k,fn){this.events[k]=fn;},append(...nodes){this.children=nodes;}});
  const root=element(),input=element(),messages=[];
  const context={window:{addEventListener(){},MediaRecorder:function(){}},document:{createElement:element},navigator:{mediaDevices:{getUserMedia:capture}},chrome:{runtime:{sendMessage(_,callback){callback(policy);}}},clearTimeout,setTimeout,...extras};
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/voice-input.js'),'utf8'),context);
  context.window.VoiceInput.mount({root,input,notify:text=>messages.push(text)});return {root,input,messages};
}
test('控制面关闭或模型未配置时不申请麦克风',async()=>{
  for(const policy of [{ok:true,modelEnabled:false},{ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:false}}]){
    const f=fixture(policy,()=>assert.fail('不应申请麦克风'));await f.root.children[0].events.click();assert.ok(f.messages.length);assert.equal(f.root.children[0].disabled,false);
  }
});
test('麦克风拒绝时保留文字入口并恢复按钮',async()=>{
  const f=fixture({ok:true,modelEnabled:true,scenes:[{id:'speech.transcribe',modelEnabled:true}],speech:{configured:true}},async()=>{throw Object.assign(new Error('denied'),{name:'NotAllowedError'});});
  await f.root.children[0].events.click();assert.match(f.messages[0],/可继续输入文字/);assert.equal(f.root.children[0].disabled,false);
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
