/**
 * background-provider.js — 多源背景 Provider 模块
 * 支持 8 种数据源：Wikimedia Commons / Unsplash / Pexels / Pixabay / Bing / Wallhaven / Coverr / NASA APOD
 * 在 Service Worker (background.js) 中通过 importScripts 加载
 */
(function () {
    'use strict';

    // ======================== 工具函数 ========================

    function stripHtml(html) {
        if (!html) return '';
        return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function makeItem(fields) {
        return {
            url: fields.url || '',
            thumbnailUrl: fields.thumbnailUrl || '',
            location: fields.location || '',
            description: (fields.description || '').slice(0, 80),
            photographer: (fields.photographer || '').slice(0, 60),
            source: fields.source || '',
            license: fields.license || '',
            licenseUrl: fields.licenseUrl || '',
            width: Number(fields.width) || 0,
            height: Number(fields.height) || 0,
            mime: fields.mime || '',
            mediaType: fields.mediaType || 'image',
            videoUrl: fields.videoUrl || '',
        };
    }

    // ======================== 缓存层 ========================

    const CACHE_PREFIX = 'bgProvider_';

    async function getCache(providerName, ttlMs) {
        try {
            const key = CACHE_PREFIX + providerName;
            const { [key]: cache } = await chrome.storage.local.get(key);
            if (!cache?.ts || !Array.isArray(cache.items) || cache.items.length === 0) return null;
            if (Date.now() - cache.ts > ttlMs) return null;
            return cache.items;
        } catch { return null; }
    }

    async function setCache(providerName, items) {
        try {
            const key = CACHE_PREFIX + providerName;
            await chrome.storage.local.set({ [key]: { ts: Date.now(), items } });
        } catch { /* ignore */ }
    }

    // ======================== 设置读取 ========================

    const DEFAULT_PROVIDER_SETTINGS = Object.freeze({
        enabledSources: ['wikimedia', 'bing'],
        apiKeys: { unsplash: '', pexels: '', pixabay: '', wallhaven: '', coverr: '', nasa: '' },
        enableVideoBackground: false,
        settingsPageBackground: false,
    });

    async function getProviderSettings() {
        try {
            const { backgroundProviderSettings } = await chrome.storage.sync.get('backgroundProviderSettings');
            const merged = { ...DEFAULT_PROVIDER_SETTINGS, ...(backgroundProviderSettings || {}) };
            merged.apiKeys = { ...DEFAULT_PROVIDER_SETTINGS.apiKeys, ...(merged.apiKeys || {}) };
            return merged;
        } catch {
            return { ...DEFAULT_PROVIDER_SETTINGS, apiKeys: { ...DEFAULT_PROVIDER_SETTINGS.apiKeys } };
        }
    }

    // ======================== Provider: Wikimedia Commons ========================

    const COMMONS_CATEGORIES = Object.freeze([
        { title: 'Category:Featured_pictures_of_landscapes', label: 'Landscapes' },
        { title: 'Category:Landscape_photographs', label: 'Landscapes' },
        { title: 'Category:Images_of_landscapes', label: 'Landscapes' },
        { title: 'Category:Featured_pictures_of_mountains', label: 'Mountains' },
        { title: 'Category:Featured_pictures_of_lakes', label: 'Lakes' },
        { title: 'Category:Featured_pictures_of_oceans_and_seas', label: 'Oceans' },
        { title: 'Category:Featured_pictures_of_sunsets', label: 'Sunsets' },
        { title: 'Category:Featured_pictures_of_China', label: 'China' },
        { title: 'Category:Featured_pictures_of_Norway', label: 'Norway' },
        { title: 'Category:Featured_pictures_of_Iceland', label: 'Iceland' },
        { title: 'Category:Featured_pictures_of_Switzerland', label: 'Switzerland' },
        { title: 'Category:Featured_pictures_of_New_Zealand', label: 'New Zealand' },
        { title: 'Category:Featured_pictures_of_Japan', label: 'Japan' },
        { title: 'Category:National_parks', label: 'National Parks' },
    ]);

    const COMMONS_CURSOR_KEY = 'dynamicBackgroundsCursorV1';
    const COMMONS_ALLOWED_LICENSES = ['cc-by', 'cc-by-sa', 'cc0', 'public-domain'];

    function isAllowedLicense(licUrl, licShort) {
        const combined = `${(licUrl || '').toLowerCase()} ${(licShort || '').toLowerCase()}`;
        if (combined.includes('/by-nc') || combined.includes('nc') || combined.includes('noncommercial')) return false;
        if (combined.includes('creativecommons.org/licenses/by-sa') || combined.includes('by-sa')) return true;
        if (combined.includes('creativecommons.org/licenses/by/') || combined.includes('cc by')) return true;
        if (combined.includes('creativecommons.org/publicdomain/zero') || combined.includes('cc0')) return true;
        if (combined.includes('public domain') || combined.includes('pd')) return true;
        return false;
    }

    async function fetchWikimediaCommons() {
        const cached = await getCache('wikimedia', 12 * 3600_000);
        if (cached) return cached;

        let cursor;
        try {
            const { [COMMONS_CURSOR_KEY]: c } = await chrome.storage.local.get(COMMONS_CURSOR_KEY);
            cursor = c && typeof c === 'object' ? c : {};
        } catch { cursor = {}; }

        const pool = COMMONS_CATEGORIES;
        const allItems = [];

        const rotateKey = 'rotateIndex';
        const startIdx = (Number(cursor[rotateKey] || 0)) % pool.length;
        const picked = [];
        for (let i = 0; i < Math.min(3, pool.length); i++) {
            picked.push(pool[(startIdx + i) % pool.length]);
        }
        cursor[rotateKey] = (startIdx + picked.length) % pool.length;

        for (const cat of picked) {
            try {
                const cursorKey = `gcmcontinue:${cat.title}`;
                const continueToken = cursor[cursorKey] || '';
                const url =
                    'https://commons.wikimedia.org/w/api.php?action=query' +
                    '&generator=categorymembers' +
                    `&gcmtitle=${encodeURIComponent(cat.title)}` +
                    '&gcmtype=file&gcmlimit=50' +
                    (continueToken ? `&gcmcontinue=${encodeURIComponent(continueToken)}&continue=` : '') +
                    '&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1920&format=json&origin=*';

                const res = await fetch(url, { cache: 'no-store' });
                if (!res.ok) continue;
                const data = await res.json();

                if (data?.continue?.gcmcontinue) cursor[cursorKey] = data.continue.gcmcontinue;

                const pages = data?.query?.pages;
                if (!pages) continue;

                for (const pageId of Object.keys(pages)) {
                    const info = pages[pageId]?.imageinfo?.[0];
                    if (!info) continue;
                    const imgUrl = info.thumburl || info.url;
                    if (!imgUrl || !(/\.(jpg|jpeg|png|webp)(\?|$)/i.test(imgUrl))) continue;

                    const meta = info.extmetadata || {};
                    const licShort = stripHtml(meta.LicenseShortName?.value);
                    const licUrl = stripHtml(meta.LicenseUrl?.value);
                    if (!isAllowedLicense(licUrl, licShort)) continue;

                    const w = Number(info.width) || 0;
                    const h = Number(info.height) || 0;
                    if (w && w < 1920) continue;
                    if (h && h < 800) continue;
                    if (w && h) { const a = w / h; if (a < 1.15 || a > 4.0) continue; }

                    allItems.push(makeItem({
                        url: imgUrl,
                        location: cat.label,
                        description: stripHtml(meta.ImageDescription?.value) || stripHtml(pages[pageId].title),
                        photographer: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
                        source: 'wikimedia',
                        license: licShort,
                        licenseUrl: licUrl,
                        width: w, height: h,
                        mime: String(info.mime || '').toLowerCase(),
                    }));
                }
            } catch (e) {
                console.warn('[Provider:wikimedia] 分类拉取失败:', cat.title, e?.message);
            }
        }

        try { await chrome.storage.local.set({ [COMMONS_CURSOR_KEY]: cursor }); } catch { }

        const deduped = [...new Map(allItems.map(it => [it.url, it])).values()];
        if (deduped.length > 0) await setCache('wikimedia', deduped);
        return deduped;
    }

    // ======================== Provider: Unsplash ========================

    async function fetchUnsplash(apiKey) {
        if (!apiKey) return [];
        const cached = await getCache('unsplash', 6 * 3600_000);
        if (cached) return cached;

        const query = 'landscape+nature+scenery';
        const url = `https://api.unsplash.com/photos/random?query=${query}&orientation=landscape&count=30`;

        try {
            const res = await fetch(url, {
                headers: { Authorization: `Client-ID ${apiKey}` },
            });
            if (!res.ok) { console.warn(`[Provider:unsplash] HTTP ${res.status}`); return []; }
            const data = await res.json();
            const items = (Array.isArray(data) ? data : [data]).map(photo => makeItem({
                url: photo.urls?.full || photo.urls?.regular || '',
                thumbnailUrl: photo.urls?.small || '',
                location: photo.location?.name || photo.location?.city || '',
                description: photo.alt_description || photo.description || 'Unsplash',
                photographer: photo.user?.name || 'Unsplash',
                source: 'unsplash',
                license: 'Unsplash License',
                licenseUrl: photo.links?.html || '',
                width: photo.width || 0,
                height: photo.height || 0,
            })).filter(it => it.url);

            if (items.length) await setCache('unsplash', items);
            return items;
        } catch (e) {
            console.warn('[Provider:unsplash] 拉取失败:', e?.message);
            return [];
        }
    }

    // ======================== Provider: Pexels ========================

    async function fetchPexels(apiKey, includeVideo) {
        if (!apiKey) return [];
        const cached = await getCache('pexels', 6 * 3600_000);
        if (cached) return cached;

        const query = 'landscape nature scenery';
        const items = [];

        try {
            const res = await fetch(
                `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&orientation=landscape&per_page=30`,
                { headers: { Authorization: apiKey } }
            );
            if (res.ok) {
                const data = await res.json();
                for (const photo of (data.photos || [])) {
                    items.push(makeItem({
                        url: photo.src?.large2x || photo.src?.original || '',
                        thumbnailUrl: photo.src?.medium || '',
                        description: photo.alt || 'Pexels',
                        photographer: photo.photographer || 'Pexels',
                        source: 'pexels',
                        license: 'Pexels License',
                        licenseUrl: photo.url || '',
                        width: photo.width || 0,
                        height: photo.height || 0,
                    }));
                }
            }
        } catch (e) { console.warn('[Provider:pexels] 图片拉取失败:', e?.message); }

        if (includeVideo) {
            try {
                const vQuery = 'nature landscape scenery';
                const res = await fetch(
                    `https://api.pexels.com/videos/search?query=${encodeURIComponent(vQuery)}&orientation=landscape&per_page=10`,
                    { headers: { Authorization: apiKey } }
                );
                if (res.ok) {
                    const data = await res.json();
                    for (const video of (data.videos || [])) {
                        const hd = (video.video_files || [])
                            .filter(f => f.quality === 'hd' || f.quality === 'sd')
                            .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
                        if (!hd?.link) continue;
                        items.push(makeItem({
                            url: video.image || '',
                            videoUrl: hd.link,
                            description: `Pexels Video #${video.id}`,
                            photographer: video.user?.name || 'Pexels',
                            source: 'pexels',
                            license: 'Pexels License',
                            licenseUrl: video.url || '',
                            width: hd.width || 0,
                            height: hd.height || 0,
                            mediaType: 'video',
                        }));
                    }
                }
            } catch (e) { console.warn('[Provider:pexels] 视频拉取失败:', e?.message); }
        }

        const valid = items.filter(it => it.url || it.videoUrl);
        if (valid.length) await setCache('pexels', valid);
        return valid;
    }

    // ======================== Provider: Pixabay ========================

    async function fetchPixabay(apiKey, includeVideo) {
        if (!apiKey) return [];
        const cached = await getCache('pixabay', 24 * 3600_000);
        if (cached) return cached;

        const query = 'landscape+nature+scenery';
        const items = [];

        try {
            const res = await fetch(
                `https://pixabay.com/api/?key=${apiKey}&q=${query}&image_type=photo&orientation=horizontal&min_width=1920&per_page=30`
            );
            if (res.ok) {
                const data = await res.json();
                for (const hit of (data.hits || [])) {
                    items.push(makeItem({
                        url: hit.largeImageURL || hit.webformatURL || '',
                        thumbnailUrl: hit.webformatURL || '',
                        description: hit.tags || 'Pixabay',
                        photographer: hit.user || 'Pixabay',
                        source: 'pixabay',
                        license: 'Pixabay License',
                        licenseUrl: hit.pageURL || '',
                        width: hit.imageWidth || 0,
                        height: hit.imageHeight || 0,
                    }));
                }
            }
        } catch (e) { console.warn('[Provider:pixabay] 图片拉取失败:', e?.message); }

        if (includeVideo) {
            try {
                const res = await fetch(
                    `https://pixabay.com/api/videos/?key=${apiKey}&q=${query}&per_page=10`
                );
                if (res.ok) {
                    const data = await res.json();
                    for (const hit of (data.hits || [])) {
                        const best = hit.videos?.large || hit.videos?.medium;
                        if (!best?.url) continue;
                        items.push(makeItem({
                            url: `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`,
                            videoUrl: best.url,
                            description: hit.tags || 'Pixabay Video',
                            photographer: hit.user || 'Pixabay',
                            source: 'pixabay',
                            license: 'Pixabay License',
                            licenseUrl: hit.pageURL || '',
                            width: best.width || 0,
                            height: best.height || 0,
                            mediaType: 'video',
                        }));
                    }
                }
            } catch (e) { console.warn('[Provider:pixabay] 视频拉取失败:', e?.message); }
        }

        const valid = items.filter(it => it.url || it.videoUrl);
        if (valid.length) await setCache('pixabay', valid);
        return valid;
    }

    // ======================== Provider: Bing Daily Wallpaper ========================

    function parseBingArchivePayload(text) {
        const body = (text || '').trim();
        if (!body) return null;

        if (body.startsWith('<')) {
            const images = [];
            const blocks = body.match(/<image>[\s\S]*?<\/image>/gi) || [];
            for (const block of blocks) {
                const pick = (tag) => block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))?.[1]?.trim();
                const url = pick('url');
                if (!url) continue;
                images.push({
                    url,
                    title: pick('title') || '',
                    copyright: pick('copyright') || '',
                    copyrightlink: pick('copyrightlink') || '',
                });
            }
            return images.length ? { images } : null;
        }

        const jsonText = body.startsWith('(')
            ? body.replace(/^\(/, '').replace(/\);?\s*$/, '')
            : body;
        return JSON.parse(jsonText);
    }

    function mapBingImages(data) {
        return (data?.images || []).map(img => {
                const uhd = `https://www.bing.com${img.url}`.replace('1920x1080', 'UHD');
                const copyright = img.copyright || '';
                const match = copyright.match(/^(.+?)\s*[\(（]/);
                return makeItem({
                    url: uhd,
                    thumbnailUrl: `https://www.bing.com${img.url}`,
                    location: match ? match[1].trim() : '',
                    description: img.title || copyright.split('(')[0]?.trim() || 'Bing',
                    photographer: copyright.includes('©') ? copyright.split('©').pop()?.trim() : 'Bing',
                    source: 'bing',
                    license: 'Bing Wallpaper',
                    licenseUrl: img.copyrightlink || '',
                });
            }).filter(it => it.url);
    }

    async function fetchBingDaily() {
        const cached = await getCache('bing', 12 * 3600_000);
        if (cached) return cached;

        const endpoints = [
            'https://www.bing.com/HPImageArchive.aspx?format=json&idx=0&n=8&mkt=zh-CN',
            'https://cn.bing.com/HPImageArchive.aspx?format=json&idx=0&n=8&mkt=zh-CN',
        ];
        const fetchOpts = {
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/javascript, */*;q=0.1',
                'User-Agent': 'Mozilla/5.0 (compatible; ChromeTimeBackground/1.0)',
            },
        };

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, fetchOpts);
                if (!res.ok) {
                    console.warn(`[Provider:bing] HTTP ${res.status} @ ${endpoint}`);
                    continue;
                }
                const text = await res.text();
                const data = parseBingArchivePayload(text);
                const items = mapBingImages(data);
                if (items.length) {
                    await setCache('bing', items);
                    return items;
                }
            } catch (e) {
                console.warn(`[Provider:bing] ${endpoint} 失败:`, e?.message);
            }
        }

        console.warn('[Provider:bing] 所有端点均未返回可用壁纸');
        return [];
    }

    // ======================== Provider: Wallhaven ========================

    async function fetchWallhaven(apiKey) {
        const cached = await getCache('wallhaven', 6 * 3600_000);
        if (cached) return cached;

        const query = 'landscape nature scenery';
        let url = `https://wallhaven.cc/api/v1/search?q=${encodeURIComponent(query)}&categories=100&purity=100&atleast=1920x1080&sorting=random`;
        if (apiKey) url += `&apikey=${apiKey}`;

        try {
            const res = await fetch(url);
            if (!res.ok) { console.warn(`[Provider:wallhaven] HTTP ${res.status}`); return []; }
            const data = await res.json();

            const items = (data.data || []).map(w => makeItem({
                url: w.path || '',
                thumbnailUrl: w.thumbs?.large || w.thumbs?.original || '',
                description: w.id ? `Wallhaven #${w.id}` : 'Wallhaven',
                photographer: w.uploader?.username || 'Wallhaven',
                source: 'wallhaven',
                license: 'Wallhaven',
                licenseUrl: w.url || '',
                width: Number(w.dimension_x) || 0,
                height: Number(w.dimension_y) || 0,
            })).filter(it => it.url);

            if (items.length) await setCache('wallhaven', items);
            return items;
        } catch (e) {
            console.warn('[Provider:wallhaven] 拉取失败:', e?.message);
            return [];
        }
    }

    // ======================== Provider: Coverr (Video) ========================

    async function fetchCoverr(apiKey, includeVideo) {
        if (!apiKey || !includeVideo) return [];
        const cached = await getCache('coverr', 12 * 3600_000);
        if (cached) return cached;

        try {
            const res = await fetch(
                'https://api.coverr.co/videos?query=nature+landscape&page_size=15',
                { headers: { Authorization: `Bearer ${apiKey}` } }
            );
            if (!res.ok) { console.warn(`[Provider:coverr] HTTP ${res.status}`); return []; }
            const data = await res.json();

            const items = (data.hits || data.videos || []).map(v => {
                const mp4 = v.urls?.mp4?.hd || v.urls?.mp4?.sd || v.video_url || '';
                const poster = v.urls?.poster || v.thumbnail || '';
                if (!mp4) return null;
                return makeItem({
                    url: poster,
                    videoUrl: mp4,
                    description: v.title || 'Coverr Video',
                    photographer: v.creator?.name || 'Coverr',
                    source: 'coverr',
                    license: 'Coverr License',
                    licenseUrl: v.url || '',
                    mediaType: 'video',
                });
            }).filter(Boolean);

            if (items.length) await setCache('coverr', items);
            return items;
        } catch (e) {
            console.warn('[Provider:coverr] 拉取失败:', e?.message);
            return [];
        }
    }

    // ======================== Provider: NASA APOD ========================

    async function fetchNasaApod(apiKey) {
        if (!apiKey) return [];
        const cached = await getCache('nasa', 24 * 3600_000);
        if (cached) return cached;

        try {
            const res = await fetch(
                `https://api.nasa.gov/planetary/apod?api_key=${apiKey}&count=10&thumbs=true`
            );
            if (!res.ok) { console.warn(`[Provider:nasa] HTTP ${res.status}`); return []; }
            const data = await res.json();

            const items = (Array.isArray(data) ? data : [data])
                .filter(a => a.media_type === 'image')
                .map(a => makeItem({
                    url: a.hdurl || a.url || '',
                    thumbnailUrl: a.url || '',
                    location: 'NASA',
                    description: a.title || 'NASA APOD',
                    photographer: a.copyright || 'NASA',
                    source: 'nasa',
                    license: 'NASA Public Domain',
                    licenseUrl: `https://apod.nasa.gov/apod/ap${a.date?.replace(/-/g, '').slice(2)}.html`,
                }))
                .filter(it => it.url);

            if (items.length) await setCache('nasa', items);
            return items;
        } catch (e) {
            console.warn('[Provider:nasa] 拉取失败:', e?.message);
            return [];
        }
    }

    // ======================== 内置兜底图片 ========================

    const FALLBACK_BACKGROUNDS = [
        { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1920&q=80', location: 'Swiss Alps', description: 'Mountain sunrise', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80', location: 'Green Valley', description: 'Foggy forest valley', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=1920&q=80', location: 'Great Wall', description: 'Great Wall of China', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=80', location: 'Lake', description: 'Mountain lake reflection', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80', location: 'Yosemite', description: 'Sunlit valley', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?auto=format&fit=crop&w=1920&q=80', location: 'Waterfall', description: 'Tropical waterfall', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1520252729650-ddced2015543?auto=format&fit=crop&w=1920&q=80', location: 'West Lake', description: 'West Lake, Hangzhou', photographer: 'Unsplash', source: 'fallback' },
        { url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80', location: 'Beach', description: 'Tropical beach', photographer: 'Unsplash', source: 'fallback' },
    ].map(f => makeItem(f));

    // ======================== Provider Manager ========================

    const PROVIDER_META = Object.freeze({
        wikimedia:  { label: 'Wikimedia Commons', needsKey: false, supportsVideo: false },
        unsplash:   { label: 'Unsplash',          needsKey: true,  supportsVideo: false },
        pexels:     { label: 'Pexels',             needsKey: true,  supportsVideo: true  },
        pixabay:    { label: 'Pixabay',            needsKey: true,  supportsVideo: true  },
        bing:       { label: 'Bing 每日壁纸',      needsKey: false, supportsVideo: false },
        wallhaven:  { label: 'Wallhaven',          needsKey: false, supportsVideo: false },
        coverr:     { label: 'Coverr',             needsKey: true,  supportsVideo: true  },
        nasa:       { label: 'NASA APOD',          needsKey: true,  supportsVideo: false },
    });

    /**
     * 核心入口：从所有启用的源获取背景列表
     * 策略：每次选一个随机源拉取，失败则尝试下一个，最后兜底
     */
    async function getBackgrounds() {
        const settings = await getProviderSettings();
        const enabled = (settings.enabledSources || []).filter(s => PROVIDER_META[s]);
        const keys = settings.apiKeys || {};
        const includeVideo = !!settings.enableVideoBackground;

        if (enabled.length === 0) {
            return { backgrounds: FALLBACK_BACKGROUNDS, source: 'fallback' };
        }

        const mergedItems = [];
        const shuffled = [...enabled].sort(() => Math.random() - 0.5);
        const maxProviders = Math.min(3, shuffled.length);

        for (let i = 0; i < maxProviders; i++) {
            const name = shuffled[i];
            try {
                let items = [];
                switch (name) {
                    case 'wikimedia':
                        items = await fetchWikimediaCommons();
                        break;
                    case 'unsplash':
                        items = await fetchUnsplash(keys.unsplash);
                        break;
                    case 'pexels':
                        items = await fetchPexels(keys.pexels, includeVideo);
                        break;
                    case 'pixabay':
                        items = await fetchPixabay(keys.pixabay, includeVideo);
                        break;
                    case 'bing':
                        items = await fetchBingDaily();
                        break;
                    case 'wallhaven':
                        items = await fetchWallhaven(keys.wallhaven);
                        break;
                    case 'coverr':
                        items = await fetchCoverr(keys.coverr, includeVideo);
                        break;
                    case 'nasa':
                        items = await fetchNasaApod(keys.nasa);
                        break;
                }
                if (items.length > 0) {
                    mergedItems.push(...items);
                }
            } catch (e) {
                console.warn(`[ProviderManager] ${name} 拉取失败:`, e?.message);
            }
        }

        // 尝试补充其他启用源的缓存
        for (const name of enabled) {
            if (shuffled.slice(0, maxProviders).includes(name)) continue;
            const meta = PROVIDER_META[name];
            if (!meta) continue;
            const ttl = name === 'pixabay' || name === 'nasa' || name === 'bing' ? 24 * 3600_000 : 12 * 3600_000;
            const cached = await getCache(name, ttl);
            if (cached?.length) mergedItems.push(...cached);
        }

        if (mergedItems.length > 0) {
            const deduped = [...new Map(mergedItems.map(it => [it.url || it.videoUrl, it])).values()];
            return { backgrounds: deduped, source: 'multi' };
        }

        return { backgrounds: FALLBACK_BACKGROUNDS, source: 'fallback' };
    }

    // 导出到 Service Worker 全局作用域
    self.BackgroundProviderManager = {
        getBackgrounds,
        getProviderSettings,
        PROVIDER_META,
        FALLBACK_BACKGROUNDS,
        DEFAULT_PROVIDER_SETTINGS,
    };
})();
