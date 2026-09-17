// Isolated visual fixture: no credentials, model calls or real extension storage.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createControlStore } from './control-store.mjs';
const control = createControlStore();
const view = () => {
  const state = control.snapshot();
  return { ok: true, ...state, jobs: [], scenes: [{ id: 'alarm.interpret', name: '智能闹钟' }], records: [{ startedAt: Date.now(), scene: 'alarm.interpret', status: 'ready', elapsedMs: 1200 }] };
};
const shim = `globalThis.chrome = {runtime:{sendMessage: async message => (await fetch('/fixture', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)})).json()}};`;
const files = new Map(['/ai-control.html', '/css/ai-control.css', '/js/ai-control.js'].map(path => [path, new URL('..' + path, import.meta.url)]));
http.createServer(async (req, res) => {
  if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(shim); }
  if (req.url === '/fixture' && req.method === 'POST') {
    try {
      let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 4096) throw new Error('输入过长'); }
      const body = JSON.parse(text);
      let result;
      if (body.action === 'ai_control_get') result = view();
      else if (body.action === 'local_ai_status') result = { ok: true, model: '隔离预览模型', state: 'ready' };
      else if (body.action === 'ai_control_save') { control.update(body.policy, body.expectedRevision); result = view(); }
      else if (body.action === 'ai_control_rollback') { control.rollback(body.revision, body.expectedRevision); result = view(); }
      else result = { ok: false, error: '预览不保存凭证或执行真实请求' };
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(result));
    } catch (error) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ ok: false, error: error.message })); }
  }
  const file = files.get(req.url);
  if (!file) { res.writeHead(404); return res.end(); }
  let content = readFileSync(file, 'utf8');
  if (req.url.endsWith('.html')) content = content.replace('<script src="js/ai-control.js">', '<script src="/fixture.js"></script><script src="js/ai-control.js">');
  res.setHeader('Content-Type', req.url.endsWith('.html') ? 'text/html; charset=utf-8' : req.url.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.end(content);
}).listen(19843, '127.0.0.1', () => console.log('隔离控制台预览：http://127.0.0.1:19843/ai-control.html'));
