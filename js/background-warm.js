(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.BackgroundWarm = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
    'use strict';

    // 首页壁纸“预热下一张”。
    //
    // 问题：每次打开首页都是先随机选一张远程壁纸、再从 Wikimedia 等站点下载（实测 0.3–1 MB，常要 1–3 秒），
    // 这期间 UI 已就绪、背景却是纯黑，体感就是“页面打开慢”。
    //
    // 做法：不改选图的随机性，只把“下载”挪出关键路径。当前这张下载完成后，再挑几张随机的壁纸用 Image 预先请求，
    // 让浏览器把字节放进自己的 HTTP 缓存；下次打开优先从“已预热且仍在列表里”的壁纸里随机选，命中缓存就几乎瞬间出图。
    // 选中的壁纸会从预热记录里移除并补充新的一张，所以每次打开仍是新图，下载的总量与原来相同。
    //
    // 边界：
    //   - 这里只记录“URL + 时间”，不保存图片，也不接管下载；缓存是否保留由浏览器决定（被回收就退回原来的下载）。
    //   - 只预热 https 的静态图；视频背景、本地图、data:/blob: 不处理。
    //   - 预热记录只存在 localStorage（同步、体量极小），超过 MAX_AGE_MS 不再信任（HTTP 缓存可能已被回收）。
    //   - 省流量模式、页面不可见时不预热（由调用方判断）；预热失败只会少一次加速，不影响显示。
    const STORAGE_KEY = 'bgWarmV1';
    const TARGET = 2;
    const MAX_ENTRIES = 6;
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const CLOCK_SKEW_MS = 60 * 1000;
    const WARM_TIMEOUT_MS = 45 * 1000;

    function isWarmable(item) {
        if (!item || typeof item.url !== 'string') return false;
        if (item.mediaType === 'video') return false;
        try { return new URL(item.url).protocol === 'https:'; } catch { return false; }
    }

    // 读取并校验预热记录。损坏、过期、重复、时间在未来（改过系统时间）的条目一律丢弃。
    function read(storage, now = Date.now()) {
        let raw;
        try { raw = JSON.parse(storage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
        if (!Array.isArray(raw)) return [];
        const seen = new Set();
        const entries = [];
        for (const entry of raw) {
            if (!entry || typeof entry.url !== 'string' || !Number.isFinite(entry.ts)) continue;
            if (now - entry.ts > MAX_AGE_MS || entry.ts - now > CLOCK_SKEW_MS) continue;
            if (seen.has(entry.url)) continue;
            seen.add(entry.url);
            entries.push({ url: entry.url, ts: entry.ts });
            if (entries.length >= MAX_ENTRIES) break;
        }
        return entries;
    }

    function write(storage, entries) {
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
            return true;
        } catch { return false; }
    }

    // 优先在“已预热且仍在候选列表里”的壁纸里随机选；没有就从整个列表随机，和原来的行为完全一致。
    // 预热记录里的 URL 必须能在列表里找到对应条目，否则缺少署名/许可信息，不能展示。
    function choose(list, entries, random = Math.random) {
        if (!Array.isArray(list) || list.length === 0) return null;
        const warmUrls = new Set((entries || []).map(entry => entry.url));
        const warm = list.filter(item => item && warmUrls.has(item.url) && isWarmable(item));
        const pool = warm.length > 0 ? warm : list;
        const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
        return { item: pool[index], warm: warm.length > 0 };
    }

    // 被选中展示的壁纸从预热记录中移除：每次打开都应该是新图，由后续预热补充下一张。
    function consume(storage, url, now = Date.now()) {
        const entries = read(storage, now);
        const remaining = entries.filter(entry => entry.url !== url);
        if (remaining.length !== entries.length) write(storage, remaining);
    }

    // 还需要预热哪些：列表里可预热的、不是当前这张、还没预热过的，随机取 count 张（不放回）。
    function plan(list, entries, currentUrl, random = Math.random, count = TARGET) {
        const taken = new Set((entries || []).map(entry => entry.url));
        if (currentUrl) taken.add(currentUrl);
        const pool = (Array.isArray(list) ? list : []).filter(item => isWarmable(item) && !taken.has(item.url));
        const picked = [];
        while (picked.length < count && pool.length > 0) {
            const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
            picked.push(pool.splice(index, 1)[0]);
        }
        return picked;
    }

    // 用 Image 请求一次（与 CSS 背景同为 no-cors 图片请求，共享浏览器 HTTP 缓存）。
    // 成功解析为 true；加载失败或超时解析为 false，并尽量中止仍在进行的请求。
    function warmImage(url, options = {}) {
        const createImage = options.createImage || (() => new Image());
        const timeoutMs = options.timeoutMs ?? WARM_TIMEOUT_MS;
        return new Promise(resolve => {
            let settled = false;
            let timer = null;
            let image = null;
            const finish = ok => {
                if (settled) return;
                settled = true;
                if (timer !== null) clearTimeout(timer);
                if (image) {
                    image.onload = null;
                    image.onerror = null;
                    if (!ok) { try { image.src = ''; } catch { /* 中止失败也不影响结果 */ } }
                }
                resolve(ok);
            };
            try {
                image = createImage();
                image.onload = () => finish(true);
                image.onerror = () => finish(false);
                timer = setTimeout(() => finish(false), timeoutMs);
                try { image.decoding = 'async'; } catch { /* 可选优化 */ }
                image.src = url;
            } catch {
                finish(false);
            }
        });
    }

    // 补足预热：先丢掉列表里已经没有的记录，再逐张预热到 target 张。一次只请求一张，不与页面其它加载争带宽；
    // shouldStop 由调用方给出（页面隐藏、有更新的预热任务等），每张之前检查一次。返回本次新增的张数。
    async function topUp(options) {
        const {
            list, current = '', storage, random = Math.random, target = TARGET,
            now = Date.now, warmOne = warmImage, shouldStop = () => false,
        } = options;
        const inList = new Set((Array.isArray(list) ? list : []).map(item => item?.url));
        const stored = read(storage, now());
        const entries = stored.filter(entry => inList.has(entry.url));
        if (entries.length !== stored.length) write(storage, entries);
        let added = 0;
        for (const item of plan(list, entries, current, random, target - entries.length)) {
            if (shouldStop()) break;
            if (!(await warmOne(item.url))) continue;
            // 其它首页标签可能同时在写：每次都重新读取最新值再追加，不覆盖别人的结果。
            const latest = read(storage, now()).filter(entry => entry.url !== item.url);
            latest.push({ url: item.url, ts: now() });
            write(storage, latest);
            added++;
        }
        return added;
    }

    return Object.freeze({
        STORAGE_KEY,
        TARGET,
        MAX_ENTRIES,
        MAX_AGE_MS,
        isWarmable,
        read,
        write,
        choose,
        consume,
        plan,
        warmImage,
        topUp,
    });
});
