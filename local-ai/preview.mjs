// Isolated UI fixture only. Never expose the repository or .local/token over HTTP.
import http from 'node:http';
import { readFileSync } from 'node:fs';
const files = ['test/fixtures/smart-alarm-preview.html', 'test/fixtures/smart-alarm-preview.js', 'test/fixtures/smart-alarm-preview-start.js', 'css/alarm-center.css', 'css/smart-alarm.css', 'js/alarm-core.js', 'js/alarm-intent.js', 'js/smart-alarm-ui.js', 'js/alarm-center.js'];
const entries = new Map(files.map(file => ['/' + file, new URL('../' + file, import.meta.url)]));
http.createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = entries.get(path);
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
}).listen(19842, '127.0.0.1', () => console.log('隔离 UI 预览：http://127.0.0.1:19842/test/fixtures/smart-alarm-preview.html'));
