// 真实 Chrome（品牌版 156，无头，隔离临时配置）里加载本扩展的公共部分。不碰用户自己的 Chrome 配置。
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
const require = createRequire('/Users/liuqingwen/.hermes/hermes-agent/node_modules/');
export const { chromium } = require('playwright-core');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const EXT = process.env.AQ_EXT || '/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launchReal({ viewport = { width: 1440, height: 900 }, dpr = 1, extraArgs = [] } = {}) {
    const userDataDir = `/tmp/aq-variety/profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    fs.mkdirSync(userDataDir, { recursive: true });
    const ctx = await chromium.launchPersistentContext(userDataDir, {
        executablePath: CHROME, headless: true, viewport, deviceScaleFactor: dpr,
        args: ['--enable-unsafe-extension-debugging', ...extraArgs], ignoreDefaultArgs: ['--disable-extensions'], timeout: 60000,
    });
    const issues = { pageerror: [], console: [], warnings: [] };
    ctx.on('weberror', we => issues.pageerror.push(String(we.error()?.stack || we.error()).slice(0, 400)));
    ctx.on('console', m => {
        const text = m.text().slice(0, 300);
        if (m.type() === 'warning') issues.warnings.push(text);
        else if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(text)) issues.console.push(text);
    });
    const cdp = await ctx.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
    let sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://'));
    for (let i = 0; i < 60 && !sw; i++) { await sleep(250); sw = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://')); }
    const close = async () => { try { await ctx.close(); } finally { fs.rmSync(userDataDir, { recursive: true, force: true }); } };
    return { ctx, id, sw, issues, close, version: ctx.browser().version(), userDataDir };
}

/** 只给本机验收用的静态文件服务（回环地址，只服务一个目录里的图片）。 */
export function serveDir(dir, port) {
    const server = http.createServer((req, res) => {
        const name = path.basename(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const file = path.join(dir, name);
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': /\.png$/.test(name) ? 'image/png' : 'image/jpeg', 'access-control-allow-origin': '*' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}
