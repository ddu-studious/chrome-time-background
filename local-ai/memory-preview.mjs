// Isolated UI acceptance: the real HTTP memory service with an in-memory database.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createServer } from './server.mjs';
const token = 'test-memory-preview-token-'.repeat(3);
const backend = createServer({ token, provider: {} });
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${backend.address().port}`;
const assets = new Set(['/css/assistant-memory.css', '/js/assistant-memory.js', '/js/assistant-memory-page.js', '/test/fixtures/assistant-memory-preview.js']);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/fixture-memory') {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 16384) throw new Error('测试请求过长'); chunks.push(chunk); }
      const response = await fetch(base + '/v1/memory', { method: req.method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
      res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(await response.text()); return;
    }
    if (path === '/' || path === '/assistant-memory.html') {
      const html = readFileSync(new URL('../assistant-memory.html', import.meta.url), 'utf8').replace('<script src="js/assistant-memory.js">', '<script src="test/fixtures/assistant-memory-preview.js"></script><script src="js/assistant-memory.js">');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
    }
    if (!assets.has(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript' }); res.end(readFileSync(new URL('..' + path, import.meta.url)));
  } catch (error) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: error.message })); }
});
server.listen(18766, '127.0.0.1', () => console.log('隔离记忆预览：http://127.0.0.1:18766/assistant-memory.html'));
process.on('SIGINT', () => { server.close(); backend.close(); });
