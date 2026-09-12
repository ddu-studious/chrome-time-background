import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { LMStudioProvider } from './provider.mjs';
import { interpret } from './alarm-service.mjs';

export function createServer({ token, provider = new LMStudioProvider(), allowedOrigins = [] }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('本地入口令牌至少需要 32 字符');
  const jobs = new Map();
  return http.createServer(async (req, res) => {
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
      for (const [id, job] of jobs) if (Date.now() - job.started > 300000) jobs.delete(id);
      if (req.method === 'GET' && /^\/v1\/alarms\/jobs\/[a-f0-9]{32}$/.test(req.url)) {
        const job = jobs.get(req.url.split('/').pop());
        return job ? send(200, job.result || { ok: true, status: 'pending', jobId: job.id }) : send(404, { error: '解析结果已过期，请重新输入' });
      }
      if (req.method === 'GET' && ['/health', '/models'].includes(req.url)) {
        const models = await provider.models();
        const selected = models.find(m => m.id === provider.model);
        return send(200, { ok: true, model: provider.model, defaultReasoning: provider.reasoning || 'off', reasoningOptions: selected?.reasoningOptions || [], state: provider.busy ? 'busy' : !selected ? 'model_missing' : selected.loaded ? 'ready' : 'not_loaded', models });
      }
      if (req.method !== 'POST' || req.url !== '/v1/alarms/interpret') return send(404, { error: '接口不存在' });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: '需要 JSON 请求' });
      let size = 0, chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { send(413, { error: '请求过长' }); req.resume(); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { return send(400, { error: 'JSON 格式无效' }); }
      if (jobs.size >= 32) return send(429, { error: '请求过多，请稍后再试' });
      const job = { id: randomBytes(16).toString('hex'), started: Date.now() };
      jobs.set(job.id, job);
      // Keep each browser fetch short: MV3 workers cannot await a long cold-start HTTP response.
      interpret(body, provider).then(result => {
        job.result = { ok: true, ...result, elapsedMs: Date.now() - job.started };
      }).catch(error => { job.result = { ok: false, error: error.message }; });
      send(202, { ok: true, status: 'pending', jobId: job.id });
    } catch (error) {
      send(error.statusCode || 502, { ok: false, error: error.message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(dirname(fileURLToPath(import.meta.url)), '.local');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const tokenFile = resolve(directory, 'token');
  if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  const token = readFileSync(tokenFile, 'utf8').trim();
  const port = Number(process.env.LOCAL_AI_PORT || 19841);
  const provider = new LMStudioProvider({ baseUrl: process.env.LM_STUDIO_URL, model: process.env.LOCAL_AI_MODEL, reasoning: process.env.LOCAL_AI_REASONING, token: process.env.LM_STUDIO_TOKEN });
  const server = createServer({ token, provider });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('error', error => { console.error(`本地 AI 服务启动失败：${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`本地 AI 已启动：http://127.0.0.1:${port}\n默认模型：${provider.model}\n连接令牌文件：${tokenFile}\n在闹钟的“本地 AI”设置中粘贴令牌。按 Ctrl+C 停止。`));
}
