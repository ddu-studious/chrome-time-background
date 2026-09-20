// Isolated UI acceptance: the real HTTP memory service with an in-memory database.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createServer } from './server.mjs';
const token = 'test-memory-preview-token-'.repeat(3);
const backend = createServer({ token, provider: {} });
await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${backend.address().port}`;
// Optional deterministic fixtures exercise the production history-to-memory path.
if (process.env.MEMORY_PREVIEW_SEED === '1') {
  const request = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  await request('/v1/history', { operation: 'configure', revision: 1, settings: { captureContent: true, retentionDays: 7 } });
  let state = await request('/v1/memory', { operation: 'note', value: '我喜欢爵士乐', app: 'music', source: '记住：我喜欢爵士乐', expectedRevision: 1 });
  await request('/v1/memory', { operation: 'configure', enabled: true, rememberArtists: true, rememberExperiences: false, expectedRevision: state.revision });
  for (const [index, name] of ['林俊杰', '法老', '杨和苏KeyNG'].entries()) {
    const at = Date.now() - 10000 + index;
    const event = { id: `preview:${index}`, conversationId: 'preview-chat', turnId: 'preview-turn', role: 'tool', kind: 'tool', tool: 'music.search', title: '搜索歌手', startedAt: at, phase: 'start', input: { kind: 'artist', query: name } };
    await request('/v1/history', { operation: 'event', event });
    await request('/v1/history', { operation: 'event', event: { ...event, phase: 'end', endedAt: at + 1, status: 'waiting', output: { status: 'waiting', message: '搜索完成，等待选择歌手', musicView: { kind: 'search', title: name } } } });
  }
}
const assets = new Set(['/css/assistant-memory.css', '/js/assistant-memory.js', '/js/assistant-memory-page.js', '/test/fixtures/assistant-memory-preview.js']);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
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
const port = Number(process.env.MEMORY_PREVIEW_PORT || 18766);
server.listen(port, '127.0.0.1', () => console.log(`隔离记忆预览：http://127.0.0.1:${port}/assistant-memory.html`));
process.on('SIGINT', () => { server.close(); backend.close(); });
