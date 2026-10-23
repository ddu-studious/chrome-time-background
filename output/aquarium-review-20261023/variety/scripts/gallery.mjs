// 物种图集截图：本地回环静态服务（只放行 /js/、预览页与 /wall/ 里的图片），真实品牌版 Chrome 156 无头渲染。
//   环境变量：SPECIES ZOOM ONLY REAL AMOUNT TAG OUT WALLNAME VIEW(宽x高)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/Users/liuqingwen/.hermes/hermes-agent/node_modules/');
const { chromium } = require('playwright-core');
const ROOT = process.env.AQ_EXT || '/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background';
const OUT = process.env.OUT || `${ROOT}/output/aquarium-review-20261023/variety`;
const TAG = process.env.TAG || 'gallery';
const [VW, VH] = (process.env.VIEW || '1280x900').split('x').map(Number);
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    let file = null;
    if (/^\/js\/[\w.-]+\.js$/.test(p)) file = path.join(ROOT, p);
    else if (p === '/test/demos/aquarium-variety-preview.html') file = path.join(ROOT, p);
    else if (/^\/wall\/[\w.-]+\.jpg$/.test(p)) file = path.join('/tmp/aq-variety', p);
    if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(8899, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    const params = new URLSearchParams();
    for (const [env, key] of [['SPECIES', 'species'], ['ZOOM', 'zoom'], ['ONLY', 'only'], ['REAL', 'real'], ['AMOUNT', 'amount'], ['OVR', 'ovr']]) if (process.env[env]) params.set(key, process.env[env]);
    if (process.env.WALLNAME) params.set('wall', `/wall/${process.env.WALLNAME}.jpg`);
    await page.goto(`http://127.0.0.1:8899/test/demos/aquarium-variety-preview.html?${params}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__atlasReady || window.__atlasError, null, { timeout: 20000 });
    const err = await page.evaluate(() => window.__atlasError || null);
    if (err) throw new Error(err);
    await page.screenshot({ path: `${OUT}/${TAG}.png`, fullPage: process.env.FULL !== '0' });
    console.log(JSON.stringify({ file: `${OUT}/${TAG}.png`, info: await page.textContent('#info'), errors }));
} finally { await browser.close(); server.close(); }
