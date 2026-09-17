window.chrome={runtime:{sendMessage(message,callback){fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)}).then(r=>r.json()).then(callback).catch(error=>callback({ok:false,error:error.message}));}}};
// Exercise real MediaRecorder and Web Audio, with generated audio in place of hardware.
Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
  const context=new AudioContext();await context.resume();
  const decoded=await context.decodeAudioData(await(await fetch('/audio.wav')).arrayBuffer());
  const source=context.createBufferSource();source.buffer=decoded;
  const output=context.createMediaStreamDestination();source.connect(output);source.start();
  for(const track of output.stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{stop();void context.close();};}
  return output.stream;
}});
VoiceInput.mount({root:document.querySelector('form'),input:document.querySelector('input'),notify:text=>{document.querySelector('#status').textContent=text;}});
document.querySelector('form').addEventListener('submit',event=>event.preventDefault());
