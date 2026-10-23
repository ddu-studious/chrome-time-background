import { chromium, sleep } from './lib.mjs';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:8911/test/demos/aquarium-variety-preview.html?only=near', { waitUntil: 'load' });
for (let i = 0; i < 40; i++) { if (await page.evaluate(() => window.__atlasReady || window.__atlasError)) break; await sleep(100); }
const out = await page.evaluate(() => ({ ready: !!window.__atlasReady, error: window.__atlasError || null, info: document.getElementById('info').textContent, rows: document.querySelectorAll('.row').length, names: [...document.querySelectorAll('.name')].map(n => n.firstChild.textContent) }));
console.log(JSON.stringify({ ...out, errors }));
await browser.close();
