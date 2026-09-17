// Synthetic microphone fixture. No real microphone, credentials or business writes.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from './server.mjs';
import { WhisperProvider } from './speech-provider.mjs';
const token = randomBytes(32).toString('hex');
const backend = createServer({ token, provider: {}, speechProvider: new WhisperProvider() });
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const port = Number(process.env.SPEECH_PREVIEW_PORT || 19845), origin = `http://127.0.0.1:${port}`;
const routes = { ai_control_get: '/v1/control', speech_ai_transcribe: '/v1/speech/transcribe' };
const server = http.createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type','text/html; charset=utf-8'); return res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>语音链路隔离验收</title><link rel="stylesheet" href="/style.css"><h1>语音链路隔离验收</h1><p>使用生成测试音频，不申请麦克风，不播放音乐</p><section class="music-assistant"><form><label>转写文字<input maxlength="500" aria-label="转写文字"></label></form><p id="status" role="status">准备就绪</p></section><script src="/voice.js"></script><script src="/fixture.js"></script></html>'); }
  const files = { '/voice.js':'js/voice-input.js','/style.css':'css/music-assistant.css','/fixture.js':'test/fixtures/speech-preview.js' };
  if (files[req.url]) { res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript'); return res.end(readFileSync(new URL('../'+files[req.url],import.meta.url))); }
  if (req.url === '/audio.wav') { res.setHeader('Content-Type','audio/wav'); return res.end(readFileSync(process.env.SPEECH_PREVIEW_AUDIO)); }
  if (req.url === '/rpc' && req.method === 'POST') {
    if (req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) { res.writeHead(403); return res.end(); }
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>1300000)throw new Error('请求过长');}
      const message=JSON.parse(body);let path=routes[message.action];
      if (['speech_ai_result','ai_job_cancel'].includes(message.action) && /^[a-f0-9]{32}$/.test(message.jobId)) path='/v1/ai/jobs/'+message.jobId+(message.action==='ai_job_cancel'?'/cancel':'');
      if(!path)throw new Error('夹具不允许此动作');
      const get=message.action==='ai_control_get'||message.action==='speech_ai_result';
      const result=await fetch(`http://127.0.0.1:${backend.address().port}`+path,{method:get?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(get?{}:{body:JSON.stringify({audio:message.audio})})});
      res.setHeader('Content-Type','application/json');return res.end(await result.text());
    }catch(error){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({ok:false,error:error.message}));}
  }
  res.writeHead(404);res.end();
});
server.listen(port,'127.0.0.1',()=>console.log(origin));
