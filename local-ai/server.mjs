import http from 'node:http';
import { createAdmission } from './admission.mjs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { LMStudioProvider } from './provider.mjs';
import { createGateway } from './gateway.mjs';
import { WhisperProvider } from './speech-provider.mjs';
import { createControlStore } from './control-store.mjs';
import { createHistoryStore } from './history-store.mjs';
import { createMemoryStore } from './memory-store.mjs';

export function createServer({ token, provider = new LMStudioProvider(), allowedOrigins = [], modelEnabled = true, disabledScenes = [], controlFile, speechProvider = new WhisperProvider(), usageFile, historyFile, memoryFile }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('本地入口令牌至少需要 32 字符');
  const jobs = new Map();
  const admission = createAdmission({file:usageFile});
  const control = createControlStore({ file: controlFile, modelEnabled, disabledScenes });
  const history = createHistoryStore({ file: historyFile });
  let memory;
  // Memory failure must not prevent the other local AI routes from starting.
  try { memory = createMemoryStore({ file: memoryFile }); } catch { /* Surface an explicit error on memory routes. */ }
  const requireMemory = () => {
    if (!memory) throw Object.assign(new Error('记忆库无法打开，其他 AI 功能可继续使用；请检查或恢复 memory.db'), { statusCode: 503 });
    return memory;
  };
  const gateway = createGateway({ provider, control, speechProvider, admission, history });
  const describe = () => ({ ...gateway.describe(), localOnly: true, jobs: [...jobs.values()].filter(job => !job.result).map(job => ({ jobId: job.id, startedAt: job.started })) });
  const server = http.createServer(async (req, res) => {
    const send = (code, result) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(JSON.stringify(result));
    };
    const host = req.headers.host || '';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) return send(403, { error: '不允许的主机' });
    const origin = req.headers.origin;
    // Extension callers also need the token; websites are never granted wildcard CORS.
    if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin) && !allowedOrigins.includes(origin)) return send(403, { error: '不允许的来源' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204); return res.end();
    }
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(401, { error: '连接令牌不正确，请在本地 AI 设置中重新填写' });
    try {
      for (const [id, job] of jobs) if (Date.now() - job.started > 300000) { job.controller.abort(); jobs.delete(id); }
      if (req.method === 'POST' && /^\/v1\/ai\/jobs\/[a-f0-9]{32}\/cancel$/.test(req.url)) {
        const job = jobs.get(req.url.split('/')[4]);
        if (!job) return send(404, { error: '任务不存在或已过期' });
        job.controller.abort();
        job.result = { ok: false, status: 'cancelled', error: '请求已取消' };
        return send(200, { ok: true, status: 'cancelled' });
      }
      if (req.method === 'GET' && req.url === '/v1/control') return send(200, { ok: true, ...describe() });
      if (req.method === 'GET' && req.url === '/v1/history') return send(200, { ok: true, ...history.snapshot() });
      if (req.method === 'GET' && req.url === '/v1/memory') return send(200, { ok: true, ...requireMemory().snapshot() });
      if (req.method === 'GET' && /^\/v1\/(?:alarms|ai)\/jobs\/[a-f0-9]{32}$/.test(req.url)) {
        const job = jobs.get(req.url.split('/').pop());
        return job ? send(200, job.result || { ok: true, status: 'pending', jobId: job.id }) : send(404, { error: '解析结果已过期，请重新输入' });
      }
      if (req.method === 'GET' && ['/health', '/models'].includes(req.url)) {
        const models = await provider.models();
        const policy = control.snapshot().policy;
        const selectedModel = policy.model || provider.model;
        const selected = models.find(m => m.id === selectedModel);
        return send(200, { ok: true, model: selectedModel, defaultReasoning: policy.reasoning || 'off', reasoningOptions: selected?.reasoningOptions || [], state: provider.busy ? 'busy' : !selected ? 'model_missing' : selected.loaded ? 'ready' : 'not_loaded', models });
      }
      if (req.method !== 'POST' || !['/v1/alarms/interpret', '/v1/ai/interpret', '/v1/control', '/v1/control/rollback', '/v1/speech/transcribe', '/v1/history', '/v1/memory'].includes(req.url)) return send(404, { error: '接口不存在' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: '需要 JSON 请求' });
      let size = 0, chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (req.url === '/v1/speech/transcribe' ? 1300000 : ['/v1/ai/interpret', '/v1/history'].includes(req.url) ? 65536 : 16384)) { send(413, { error: '请求过长' }); req.resume(); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { error: 'JSON 格式无效' }); }
      if (req.url === '/v1/memory') return send(200, { ok: true, ...requireMemory().mutate(body) });
      if (req.url === '/v1/history') {
        if (body.operation === 'event') { history.event(body.event); return send(200, { ok: true }); }
        if (body.operation === 'configure') history.configure(body.settings, body.revision);
        else if (body.operation === 'delete') { if (body.conversationId) requireMemory().forgetSource(body.conversationId); history.remove({ requestId: body.requestId, conversationId: body.conversationId }); }
        else if (body.operation === 'clear' && body.confirm === true) { requireMemory().forgetSource(null, true); history.remove({ all: true }); }
        else return send(400, { ok: false, error: '历史操作无效' });
        return send(200, { ok: true, ...history.snapshot() });
      }
      if (req.url === '/v1/control' || req.url === '/v1/control/rollback') {
        if (req.url.endsWith('/rollback')) control.rollback(body?.revision, body?.expectedRevision);
        else control.update(body?.policy, body?.expectedRevision);
        for (const job of jobs.values()) {
          job.controller.abort();
          job.result = { ok: false, status: 'cancelled', error: '控制策略已更新，请重新提交请求' };
        }
        return send(200, { ok: true, ...describe() });
      }
      if (jobs.size >= 32) return send(429, { error: '请求过多，请稍后再试' });
      const job = { id: randomBytes(16).toString('hex'), started: Date.now(), controller: new AbortController() };
      jobs.set(job.id, job);
      // Keep each browser fetch short: MV3 workers cannot await a long cold-start HTTP response.
      const scene = req.url === '/v1/alarms/interpret' ? 'alarm.interpret' : req.url === '/v1/speech/transcribe' ? 'speech.transcribe' : body?.scene;
      const input = ['/v1/alarms/interpret', '/v1/speech/transcribe'].includes(req.url) ? body : body?.input;
      gateway.run(scene, input, { signal: job.controller.signal, trace: body?.trace, selection: body?.selection }).then(result => {
        if (job.controller.signal.aborted) return;
        job.result = { ok: true, ...result, elapsedMs: Date.now() - job.started };
      }).catch(error => { if (job.controller.signal.aborted) return; job.result = { ok: false, error: error.message, execution: error.execution }; });
      send(202, { ok: true, status: 'pending', jobId: job.id });
    } catch (error) {
      send(error.statusCode || 502, { ok: false, error: error.message });
    }
  });
  server.on('close', () => memory?.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '.local');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tokenFile = resolve(directory, 'token');
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const token = readFileSync(tokenFile, 'utf8').trim();
  const port = Number(process.env.LOCAL_AI_PORT || 19841);
  const provider = new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, reasoning: process.env.LOCAL_AI_REASONING, token: process.env.LM_STUDIO_TOKEN });
  const server = createServer({ token, provider, controlFile: resolve(directory, 'control.json'), usageFile: resolve(directory, 'usage.json'), historyFile: resolve(directory, 'history.json'), memoryFile: resolve(directory, 'memory.db'), modelEnabled: process.env.LOCAL_AI_MODEL_ENABLED !== 'false', disabledScenes: (process.env.LOCAL_AI_DISABLED_SCENES || '').split(',').map(s => s.trim()).filter(Boolean) });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(`本地 AI 服务启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`本地 AI 已启动：http://127.0.0.1:${port}\n默认模型：${provider.model}\n连接令牌文件：${tokenFile}\n在闹钟的“本地 AI”设置中粘贴令牌。按 Ctrl+C 停止。`));
}
