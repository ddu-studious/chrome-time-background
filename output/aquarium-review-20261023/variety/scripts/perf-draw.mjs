// 单条鱼的绘制耗时（真实品牌版 Chrome 156，无头软件渲染，只是相对成本的代理，不是用户机器上的帧耗时）：
// 与图集页同样的加载方式取产品里的 drawFish，对每种鱼（14 种卡通画法）在“近（z=1）白天 / 近夜晚 / 远（z=0.35）”各画若干次，报告每次的平均微秒，并数每次调用的 Canvas 方法数。
import fs from 'node:fs';
import { chromium, sleep } from './lib.mjs';
const OUT = '/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/output/aquarium-review-20261023/variety';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await page.goto('http://127.0.0.1:8912/test/demos/aquarium-variety-preview.html?only=none', { waitUntil: 'load' });
for (let i = 0; i < 60; i++) { if (await page.evaluate(() => window.__atlasReady || window.__atlasError)) break; await sleep(100); }
const result = await page.evaluate(async () => {
    const src = await (await fetch('../../js/aquarium.js')).text();
    const mod = { exports: {} };
    const deps = { './aquarium-core.js': window.AquariumCore, './aquarium-play-core.js': window.AquariumPlayCore, './aquarium-play.js': window.AquariumPlay, './aquarium-real.js': window.AquariumReal, './aquarium-predation-core.js': window.AquariumPredationCore, './aquarium-flow-core.js': window.AquariumFlowCore, './aquarium-light-core.js': window.AquariumLightCore, './aquarium-ambient.js': window.AquariumAmbient };
    new Function('module', 'exports', 'require', src)(mod, mod.exports, name => deps[name]);
    const A = mod.exports; const Core = window.AquariumCore;
    const PALETTE = [[255, 100, 92], [255, 150, 56], [240, 222, 70], [88, 228, 100], [79, 239, 194], [112, 205, 255], [170, 111, 255], [245, 105, 225]];
    const canvas = document.createElement('canvas'); canvas.width = 400; canvas.height = 300;
    const real = canvas.getContext('2d');
    const rows = [];
    const farFactor = z => 1 - Core.PARAMS.Z_SIZE + Core.PARAMS.Z_SIZE * z;
    for (const spec of Core.SPECIES.filter(s => A.SHAPES[s.id])) {
        const row = { id: spec.id, name: spec.name };
        for (const [label, z, night] of [['near', 1, 0], ['night', 1, 1], ['far', 0.35, 0]]) {
            const len = spec.len * farFactor(z);
            const fish = { species: spec.id, x: 200, y: 150, ang: 0, z, len, alpha: 1, phase: 0.6, turn: 0, flip: 1, xs: 1 };
            const view = { amount: 0.8, night, lowPower: false, scale: 1, real: false };
            // 方法调用数：用 Proxy 包住画布上下文
            let calls = 0;
            const counted = new Proxy(real, { get(t, k) { const v = t[k]; if (typeof v === 'function') return (...args) => { calls++; return v.apply(t, args); }; return v; }, set(t, k, v) { t[k] = v; return true; } });
            real.setTransform(1, 0, 0, 1, 0, 0); real.globalCompositeOperation = 'screen';
            A.drawFish(counted, fish, PALETTE, view, undefined);
            const callsPerDraw = calls;
            for (let i = 0; i < 300; i++) { real.clearRect(0, 0, 400, 300); A.drawFish(real, fish, PALETTE, view, undefined); }   // 预热
            const N = 3000;
            const t0 = performance.now();
            for (let i = 0; i < N; i++) { real.clearRect(0, 0, 400, 300); fish.phase = i * 0.05; A.drawFish(real, fish, PALETTE, view, undefined); }
            real.getImageData(0, 0, 1, 1);          // 强制把绘制排空
            const us = (performance.now() - t0) * 1000 / N;
            row[label] = { calls: callsPerDraw, us: Number(us.toFixed(1)) };
        }
        rows.push(row);
    }
    return rows;
});
fs.writeFileSync(`${OUT}/perf-draw.json`, JSON.stringify({ chrome: browser.version(), note: '无头软件渲染下单条鱼每次 drawFish 的平均微秒（含 clearRect，N=3000，预热 300）；calls 是一次 drawFish 的 Canvas 方法调用数。只是相对成本的代理。', rows: result }, null, 1));
console.log('chrome', browser.version());
for (const r of result) console.log(r.id.padEnd(10), 'near', String(r.near.us).padStart(6), 'µs/', String(r.near.calls).padStart(3), 'calls | night', String(r.night.us).padStart(6), 'µs/', String(r.night.calls).padStart(3), '| far', String(r.far.us).padStart(6), 'µs/', String(r.far.calls).padStart(3));
await browser.close();
