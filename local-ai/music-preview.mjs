// Isolated music-input fixture: no real account, model, storage or audio.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const files = new Set(['js/music-controller.js', 'js/music-search.js', 'js/voice-input.js', 'js/assistant-session.js', 'js/music-intent.js', 'js/music-assistant.js', 'css/music-assistant.css', 'test/fixtures/music-assistant-preview.js']);
http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><title>音乐助手隔离预览</title><link rel="stylesheet" href="/css/music-assistant.css"><body style="margin:0;padding:28px;background:#071224;color:#e8e9f2;font-family:system-ui,sans-serif"><h1>音乐助手</h1><p>隔离交互预览，不播放真实音频</p><main id="player"><div id="mc-pane-search"></div></main><script src="/js/assistant-session.js"></script><script src="/js/music-search.js"></script><script src="/js/music-intent.js"></script><script src="/js/voice-input.js"></script><script src="/js/music-controller.js"></script><script src="/js/music-assistant.js"></script><script src="/test/fixtures/music-assistant-preview.js"></script></body></html>'); }
  const file = req.url.slice(1);
  if (!files.has(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.end(readFileSync(new URL('../' + file, import.meta.url)));
}).listen(19844, '127.0.0.1', () => console.log('http://127.0.0.1:19844'));
