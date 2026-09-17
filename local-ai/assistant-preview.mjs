import http from 'node:http';
import { readFileSync } from 'node:fs';
const port = Number(process.env.ASSISTANT_PREVIEW_PORT) || 18765;
const files = new Set(['/js/assistant-memory.js', '/css/assistant.css', '/vendor/pinyin-match/pinyin-match.js', '/js/assistant-match.js', '/js/assistant-music.js', '/js/assistant-contract.js', '/js/assistant-engine.js', '/js/assistant-management.js', '/js/alarm-core.js', '/js/assistant-tools.js', '/js/assistant-background.js', '/js/assistant.js', '/js/music-intent.js', '/js/music-search.js', '/js/alarm-intent.js', '/test/fixtures/assistant-mvp-preview.js']);
http.createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(readFileSync(new URL('../test/fixtures/assistant-home-preview.html', import.meta.url))); return;
  }
  if (path === '/' || path === '/assistant-preview.html' || path === '/assistant.html') {
    let html = readFileSync(new URL('../assistant.html', import.meta.url), 'utf8');
    if (path !== '/assistant.html') html = html.replace('<body>', '<body><p style="font:12px system-ui;padding:6px 18px">隔离验收：真实输入条与执行器，媒体、模型和系统操作使用测试数据。</p><p id="preview-effect" role="status" style="padding:0 18px"></p>');
    html = html.replace('<script src="js/assistant.js"></script>', ['music-intent', 'music-search', 'alarm-intent', 'assistant-engine', 'assistant-music', 'alarm-core', 'assistant-management', 'assistant-tools', 'assistant-background'].map(name => `<script src="js/${name}.js"></script>`).join('\n') + '<script src="test/fixtures/assistant-mvp-preview.js"></script><script src="js/assistant.js"></script>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
  }
  if (!files.has(path) && !['/js/assistant-overlay.js', '/js/assistant-launcher.js', '/js/assistant-timeline.js'].includes(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' });
  res.end(readFileSync(new URL('..' + path, import.meta.url)));
}).listen(port, '127.0.0.1', () => console.log(`隔离预览：http://127.0.0.1:${port}/assistant-preview.html；首页浮层：http://127.0.0.1:${port}/index.html`));
