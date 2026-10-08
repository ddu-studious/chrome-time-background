import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const files = new Set([
    '/test/fixtures/youtube-home-preview.html',
    '/test/fixtures/youtube-home-preview.js',
    '/test/fixtures/youtube-home-preview-start.js',
    '/js/youtube-controller.js',
    '/css/youtube-workbench.css',
]);
createServer(async (request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method !== 'GET' || !files.has(path)) { response.writeHead(404).end(); return; }
    try {
        const body = await readFile(new URL(path.slice(1), root));
        response.writeHead(200, { 'Content-Type': path.endsWith('.html') ? 'text/html; charset=utf-8' : path.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'no-store' }).end(body);
    } catch { response.writeHead(404).end(); }
}).listen(19847, '127.0.0.1', () => console.log('Synthetic preview: http://127.0.0.1:19847/test/fixtures/youtube-home-preview.html'));
