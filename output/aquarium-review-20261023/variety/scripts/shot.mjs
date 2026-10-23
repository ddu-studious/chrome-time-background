// 水族馆整页真实 Chrome 156（无头、隔离配置）截图。
//   环境变量：FISH(逗号分隔物种) SIZES(on|off|空=不写) HOUR WALL VIEW(宽x高) TRAY(1=展开托盘) SECS TAG OUT SCHEMA(存储版本，默认 1) HIDE(1=隐藏页面其余部分)
import fs from 'node:fs';
import { launchReal, serveDir, sleep } from './lib.mjs';

const WALL = process.env.WALL || 'DolbadarnWales';
const HOUR = Number(process.env.HOUR || 14);
const SECS = Number(process.env.SECS || 6);
const TAG = process.env.TAG || 'shot';
const SIZES = process.env.SIZES || '';
const TRAY = process.env.TRAY === '1';
const SCHEMA = Number(process.env.SCHEMA || 1);
const FISH = (process.env.FISH || 'neon,tang,clown,puffer,angel,hammer,turtle,manta').split(',');
const [VW, VH] = (process.env.VIEW || '1440x900').split('x').map(Number);
const OUT = process.env.OUT || '/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/output/aquarium-review-20261023/variety';
const PORT = 8898;
fs.mkdirSync(OUT, { recursive: true });

const server = await serveDir('/tmp/aq-variety/wall', PORT);
const DPR = Number(process.env.DPR || 1);
const h = await launchReal({ viewport: { width: VW, height: VH }, dpr: DPR });
const U = p => `chrome-extension://${h.id}/${p}`;
try {
    const settings = await h.ctx.newPage();
    await settings.goto(U('settings.html#background'), { waitUntil: 'load' });
    await settings.locator('a.sp-nav-item[data-page="background"]').click().catch(() => {});
    await sleep(800);
    await settings.selectOption('#set-bgVisualEffect', 'jellyfish');
    await sleep(600);
    await settings.evaluate(async ({ sizes, fish, schema }) => {
        const cur = (await chrome.storage.sync.get('backgroundExperienceSettings')).backgroundExperienceSettings || {};
        const next = { ...cur };
        if (sizes === 'on') next.aquariumSizes = true; else if (sizes === 'off') next.aquariumSizes = false;
        await chrome.storage.sync.set({ backgroundExperienceSettings: next });
        await chrome.storage.local.set({ aquariumV1: { v: schema, fish: fish.map((species, i) => ({ id: `${species}-lab${i}`, species, addedAt: 1000 + i })) } });
    }, { sizes: SIZES, fish: FISH, schema: SCHEMA });
    await sleep(500);
    await settings.close();

    const page = await h.ctx.newPage();
    await page.addInitScript(hour => { Date.prototype.getHours = function () { return hour; }; }, HOUR);
    await page.goto(U('index.html'), { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 80; i++) {
        const s = await page.evaluate(() => window.Aquarium && window.Aquarium.state());
        if (s && s.started && s.loaded && s.fish > 0) break;
        await sleep(250);
    }
    await page.evaluate(url => new Promise((res, rej) => { const i = new Image(); i.onload = () => (i.decode ? i.decode().then(res, res) : res()); i.onerror = () => rej(new Error('wallpaper load failed')); i.src = url; }), `http://127.0.0.1:${PORT}/${WALL}.jpg`);
    await page.evaluate(({ url, hide }) => {
        document.body.style.backgroundImage = `url(${url})`; document.body.style.backgroundSize = 'cover'; document.body.style.backgroundPosition = 'center';
        if (hide) {
            const st = document.createElement('style');
            st.textContent = 'body > *:not(.aq-water):not(.bgx-root):not(#background-video):not(.wallpaper-weave-canvas):not(.aq-ui):not(.aq-net){visibility:hidden !important}';
            document.head.appendChild(st);
        }
    }, { url: `http://127.0.0.1:${PORT}/${WALL}.jpg`, hide: process.env.HIDE !== '0' });
    if (TRAY) { await page.locator('.aq-toggle').click(); await sleep(300); }
    await sleep(SECS * 1000);
    const info = await page.evaluate(() => {
        const aq = window.Aquarium;
        const w = aq && aq._world && aq._world();
        const panel = document.querySelector('.aq-panel');
        const rect = panel && !panel.hidden ? panel.getBoundingClientRect() : null;
        return {
            state: aq && aq.state(), sizes: w ? w.sizes : null,
            fish: w ? w.fish.map(f => ({ species: f.species, entry: f.entry, size: f.size === undefined ? null : Number(f.size.toFixed(3)), len: Number(f.len.toFixed(1)), x: Number(f.x.toFixed(1)), y: Number(f.y.toFixed(1)), z: Number(f.z.toFixed(2)), ang: Number(f.ang.toFixed(2)) })) : [],
            buttons: [...document.querySelectorAll('.aq-species')].map(b => b.textContent),
            panel: rect ? { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height), vh: innerHeight, scrollH: panel.scrollHeight, clientH: panel.clientHeight, rows: new Set([...document.querySelectorAll('.aq-species')].map(b => b.offsetTop)).size, overflowY: getComputedStyle(panel).overflowY, maxH: getComputedStyle(panel).maxHeight, listItems: document.querySelectorAll('.aq-item').length } : null,
        };
    });
    const file = `${OUT}/${TAG}.png`;
    await page.screenshot({ path: file });
    fs.writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ file, dpr: DPR, version: h.version, info, issues: h.issues }, null, 1));
    console.log(JSON.stringify({ file, chrome: h.version, state: info.state, sizes: info.sizes, fishCount: info.fish.length, buttons: info.buttons.length, panel: info.panel, issues: h.issues }, null, 1).slice(0, 1500));
} finally { await h.close(); server.close(); }
