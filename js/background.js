importScripts('background-provider.js');

(function() {
    // v3.16.0: 背景图片数据已迁移至 background-provider.js（多源 Provider 模块）
    const backgrounds = [
        {
            url: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=1920&q=80',
            location: '长城',
            description: '慕田峪长城',
            photographer: 'Unsplash',
            season: 'autumn'
        },
        {
            url: 'https://images.unsplash.com/photo-1548919973-5cef591cdbc9?auto=format&fit=crop&w=1920&q=80',
            location: '张家界',
            description: '武陵源风景区',
            photographer: 'Unsplash',
            season: 'summer'
        },
        {
            url: 'https://images.unsplash.com/photo-1632891051939-01a4b8b8f4b7?auto=format&fit=crop&w=1920&q=80',
            location: '黄山',
            description: '云海日出',
            photographer: 'Unsplash',
            season: 'spring'
        },
        {
            url: 'https://images.unsplash.com/photo-1537531383496-f4749b8032cf?auto=format&fit=crop&w=1920&q=80',
            location: '桂林',
            description: '漓江山水',
            photographer: 'Unsplash',
            season: 'summer'
        },
        {
            url: 'https://images.unsplash.com/photo-1520252729650-ddced2015543?auto=format&fit=crop&w=1920&q=80',
            location: '西湖',
            description: '杭州西湖',
            photographer: 'Unsplash',
            season: 'spring'
        },
        {
            url: 'https://images.unsplash.com/photo-1527909249915-9fe4a354c35c?auto=format&fit=crop&w=1920&q=80',
            location: '九寨沟',
            description: '五彩池',
            photographer: 'Unsplash',
            season: 'autumn'
        },
        {
            url: 'https://images.unsplash.com/photo-1535530992830-e25d07cfa780?auto=format&fit=crop&w=1920&q=80',
            location: '泰山',
            description: '日出云海',
            photographer: 'Unsplash',
            season: 'winter'
        },
        {
            url: 'https://images.unsplash.com/photo-1528164344705-47542687000d?auto=format&fit=crop&w=1920&q=80',
            location: '丽江',
            description: '古城风光',
            photographer: 'Unsplash',
            season: 'spring'
        }
    ];

    // ==================== 动态背景源（Wikimedia Commons）====================

    const DYNAMIC_BG_CACHE_KEY = 'dynamicBackgroundsCache';
    const DYNAMIC_BG_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12小时
    const DYNAMIC_BG_CURSOR_KEY = 'dynamicBackgroundsCursorV1';

    /**
     * 动态背景设置（可后续接入 settings UI；现在先给“优雅默认值”）
     * - chinaFirst: 优先展示中国风景
     * - maxCategoriesPerRefresh: 每次刷新最多请求多少个分类（控制请求量）
     * - minWidth/minHeight: 过滤过小图片
     * - minAspect/maxAspect: 过滤过窄/过高的图（更适合做背景）
     * - allowLicenses: 默认过滤掉 NC（非商业）等不适合“可复用资源库”的授权
     */
    const DEFAULT_COMMONS_SETTINGS = Object.freeze({
        chinaFirst: true,
        maxCategoriesPerRefresh: 2,
        minWidth: 1920,
        minHeight: 800,
        minAspect: 1.15,
        maxAspect: 4.0,
        allowLicenses: [
            'cc-by',
            'cc-by-sa',
            'cc0',
            'public-domain'
        ]
    });

    // 你想“更多展示中国风景”，最稳妥的方式是：用 Commons 现成的中国相关分类池作为来源
    // 同时保留全球兜底分类池，避免某些时候分类返回为空/失败。
    const COMMONS_CATEGORY_PROFILES = Object.freeze({
        china: [
            { title: 'Category:Featured_pictures_of_China', label: '中国·精选' },
            { title: 'Category:Landscapes_of_China', label: '中国·风景' },
            { title: 'Category:Mountains_of_China', label: '中国·山川' },
            { title: 'Category:Lakes_of_China', label: '中国·湖泊' },
            { title: 'Category:Rivers_of_China', label: '中国·江河' },
            { title: 'Category:National_parks_of_China', label: '中国·国家公园' },
            { title: 'Category:UNESCO_World_Heritage_Sites_in_China', label: '中国·世界遗产' }
        ],
        global: [
            { title: 'Category:Landscape_photographs', label: 'Wikimedia Commons' },
            { title: 'Category:Images_of_landscapes', label: 'Wikimedia Commons' },
            { title: 'Category:Landscapes', label: 'Wikimedia Commons' }
        ]
    });

    function stripHtml(html) {
        if (!html) return '';
        return String(html)
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizeCommonsBackgrounds(pages, opts) {
        const items = [];
        for (const pageId of Object.keys(pages || {})) {
            const page = pages[pageId];
            const info = page?.imageinfo?.[0];
            if (!info) continue;

            // 优先用缩放后的 URL（节省带宽，适合新标签页背景）
            const url = info.thumburl || info.url;
            if (!url) continue;

            const meta = info.extmetadata || {};
            const desc = stripHtml(meta.ImageDescription?.value) || stripHtml(page.title) || 'Wikimedia Commons';
            const artist = stripHtml(meta.Artist?.value) || 'Wikimedia Commons';

            // 尽量过滤掉明显不是图片的资源
            const lower = url.toLowerCase();
            if (!(/\.(jpg|jpeg|png|webp)(\?|$)/.test(lower))) continue;

            items.push({
                url,
                location: opts?.locationLabel || 'Wikimedia Commons',
                description: desc.slice(0, 60),
                photographer: artist.slice(0, 60),
                source: 'wikimedia-commons',
                license: stripHtml(meta.LicenseShortName?.value) || '',
                licenseUrl: stripHtml(meta.LicenseUrl?.value) || '',
                width: Number(info.width) || 0,
                height: Number(info.height) || 0,
                mime: String(info.mime || '').toLowerCase()
            });
        }

        // 去重
        const seen = new Set();
        return items.filter(it => {
            if (seen.has(it.url)) return false;
            seen.add(it.url);
            return true;
        });
    }

    function computeSettingsHash(settings) {
        // 足够用于缓存失效判断；无需加密/长 hash
        return JSON.stringify(settings);
    }

    async function getCommonsSettings() {
        try {
            const { commonsBackgroundSettings } = await chrome.storage.sync.get('commonsBackgroundSettings');
            return { ...DEFAULT_COMMONS_SETTINGS, ...(commonsBackgroundSettings || {}) };
        } catch (e) {
            return { ...DEFAULT_COMMONS_SETTINGS };
        }
    }

    async function getCachedDynamicBackgrounds() {
        try {
            const { [DYNAMIC_BG_CACHE_KEY]: cache } = await chrome.storage.local.get(DYNAMIC_BG_CACHE_KEY);
            if (!cache?.ts || !Array.isArray(cache.items)) return null;
            if (Date.now() - cache.ts > DYNAMIC_BG_CACHE_TTL_MS) return null;
            if (cache.items.length === 0) return null;
            return cache.items;
        } catch (e) {
            return null;
        }
    }

    async function setCachedDynamicBackgrounds(items, settingsHash) {
        try {
            await chrome.storage.local.set({
                [DYNAMIC_BG_CACHE_KEY]: {
                    ts: Date.now(),
                    items,
                    settingsHash: settingsHash || ''
                }
            });
        } catch (e) {
            // ignore
        }
    }

    async function getCommonsCursor() {
        try {
            const { [DYNAMIC_BG_CURSOR_KEY]: cursor } = await chrome.storage.local.get(DYNAMIC_BG_CURSOR_KEY);
            return cursor && typeof cursor === 'object' ? cursor : {};
        } catch (e) {
            return {};
        }
    }

    async function setCommonsCursor(cursor) {
        try {
            await chrome.storage.local.set({ [DYNAMIC_BG_CURSOR_KEY]: cursor });
        } catch (e) {
            // ignore
        }
    }

    function isAllowedCommonsLicense(item, settings) {
        const licUrl = String(item.licenseUrl || '').toLowerCase();
        const licShort = String(item.license || '').toLowerCase();
        const combined = `${licUrl} ${licShort}`;

        // 默认：过滤掉 NC（非商业）授权，避免落入“不可复用资源库”的坑
        if (licUrl.includes('/by-nc') || licShort.includes('nc') || combined.includes('noncommercial')) {
            return false;
        }

        const allow = Array.isArray(settings?.allowLicenses) ? settings.allowLicenses : DEFAULT_COMMONS_SETTINGS.allowLicenses;
        const allowSet = new Set(allow.map(s => String(s).toLowerCase()));

        // 归一化：粗粒度足够用了
        if (combined.includes('creativecommons.org/licenses/by-sa') || licShort.includes('by-sa')) return allowSet.has('cc-by-sa');
        if (combined.includes('creativecommons.org/licenses/by/') || licShort.includes('cc by')) return allowSet.has('cc-by');
        if (combined.includes('creativecommons.org/publicdomain/zero') || licShort.includes('cc0')) return allowSet.has('cc0');
        if (licShort.includes('public domain') || licShort === 'pd' || combined.includes('public domain')) return allowSet.has('public-domain');

        // 其它（GFDL、FAL、各种自定义）默认不放行，避免授权合规风险
        return false;
    }

    function isGoodBackgroundCandidate(item, settings) {
        if (!item?.url) return false;
        if (!isAllowedCommonsLicense(item, settings)) return false;

        const w = Number(item.width) || 0;
        const h = Number(item.height) || 0;
        const minW = Number(settings?.minWidth) || DEFAULT_COMMONS_SETTINGS.minWidth;
        const minH = Number(settings?.minHeight) || DEFAULT_COMMONS_SETTINGS.minHeight;

        // 有些条目可能缺失尺寸；缺失则放行（但实际常见都会有）
        if (w && w < minW) return false;
        if (h && h < minH) return false;

        if (w && h) {
            const aspect = w / h;
            const minA = Number(settings?.minAspect) || DEFAULT_COMMONS_SETTINGS.minAspect;
            const maxA = Number(settings?.maxAspect) || DEFAULT_COMMONS_SETTINGS.maxAspect;
            if (aspect < minA || aspect > maxA) return false;
        }

        // mime 不强制，但如果给了就尽量限制在常见静态图
        const mime = String(item.mime || '');
        if (mime && !['image/jpeg', 'image/png', 'image/webp'].includes(mime)) return false;

        return true;
    }

    async function fetchCommonsByCategory(categoryTitle, opts) {
        const limit = Math.max(10, Math.min(50, Number(opts?.limit) || 50));
        const continueToken = opts?.continueToken ? String(opts.continueToken) : '';

        const url =
            'https://commons.wikimedia.org/w/api.php' +
            '?action=query' +
            '&generator=categorymembers' +
            `&gcmtitle=${encodeURIComponent(categoryTitle)}` +
            '&gcmtype=file' +
            `&gcmlimit=${limit}` +
            (continueToken ? `&gcmcontinue=${encodeURIComponent(continueToken)}&continue=` : '') +
            '&prop=imageinfo' +
            '&iiprop=url|size|mime|extmetadata' +
            '&iiurlwidth=1920' +
            '&format=json' +
            '&origin=*';

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
        const data = await res.json();
        const pages = data?.query?.pages;
        const nextContinue = data?.continue?.gcmcontinue ? String(data.continue.gcmcontinue) : '';
        if (!pages) return { items: [], nextContinue };
        return {
            items: normalizeCommonsBackgrounds(pages, { locationLabel: opts?.locationLabel }),
            nextContinue
        };
    }

    async function getDynamicBackgrounds() {
        const settings = await getCommonsSettings();
        const settingsHash = computeSettingsHash(settings);

        // 缓存命中：如果设置没变且 TTL 没过，直接返回
        try {
            const { [DYNAMIC_BG_CACHE_KEY]: cache } = await chrome.storage.local.get(DYNAMIC_BG_CACHE_KEY);
            const ok =
                cache?.ts &&
                Array.isArray(cache.items) &&
                cache.items.length > 0 &&
                (Date.now() - cache.ts <= DYNAMIC_BG_CACHE_TTL_MS) &&
                (cache.settingsHash === settingsHash);
            if (ok) return cache.items;
        } catch (e) {
            // ignore -> 走网络拉取
        }

        const cursor = await getCommonsCursor();
        const maxCats = Math.max(1, Math.min(4, Number(settings.maxCategoriesPerRefresh) || 2));

        const profiles = [];
        if (settings.chinaFirst) profiles.push('china');
        profiles.push('global');

        for (const profileName of profiles) {
            const pool = COMMONS_CATEGORY_PROFILES[profileName] || [];
            if (pool.length === 0) continue;

            // 轮询分类池：避免每次都打同一个分类导致重复
            const rotateKey = `rotateIndex:${profileName}`;
            const startIndex = Number(cursor[rotateKey] || 0) % pool.length;
            const picked = [];
            for (let i = 0; i < Math.min(maxCats, pool.length); i++) {
                picked.push(pool[(startIndex + i) % pool.length]);
            }
            cursor[rotateKey] = (startIndex + picked.length) % pool.length;

            const merged = [];
            for (const cat of picked) {
                try {
                    const catCursorKey = `gcmcontinue:${cat.title}`;
                    const { items, nextContinue } = await fetchCommonsByCategory(cat.title, {
                        limit: 50,
                        continueToken: cursor[catCursorKey],
                        locationLabel: cat.label
                    });
                    if (nextContinue) cursor[catCursorKey] = nextContinue;
                    merged.push(...items);
                } catch (e) {
                    console.warn('动态背景拉取失败（分类）:', cat.title, e?.message || e);
                }
            }

            const filtered = merged.filter(it => isGoodBackgroundCandidate(it, settings));
            if (filtered.length > 0) {
                await setCommonsCursor(cursor);
                await setCachedDynamicBackgrounds(filtered, settingsHash);
                return filtered;
            }
        }

        // 网络不可用/分类为空：让调用方兜底
        await setCommonsCursor(cursor);
        return null;
    }

    // ==================== Offscreen Document 管理（v3.0.0）====================

    let _offscreenCreating = null;

    async function ensureOffscreen() {
        if (await chrome.offscreen.hasDocument?.()) return;
        if (_offscreenCreating) { await _offscreenCreating; return; }
        _offscreenCreating = chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Playing music via NetEase Cloud Music API with cookie auth'
        });
        try { await _offscreenCreating; } finally { _offscreenCreating = null; }
    }

    async function sendToOffscreen(msg) {
        await ensureOffscreen();
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ ...msg, target: 'offscreen' }, (resp) => {
                resolve(resp || { ok: false });
            });
        });
    }

    // ==================== 温情提示内置数据库（v3.0.0）====================

    const WARM_QUOTES = [
        { type: 'quote', text: '千里之行，始于足下。', author: '老子' },
        { type: 'quote', text: '学而不思则罔，思而不学则殆。', author: '孔子' },
        { type: 'quote', text: '不积跬步，无以至千里。', author: '荀子' },
        { type: 'quote', text: '天行健，君子以自强不息。', author: '《周易》' },
        { type: 'quote', text: '生活不是等待暴风雨过去，而是学会在雨中跳舞。', author: '维维安·格林' },
        { type: 'quote', text: '世上无难事，只怕有心人。', author: '谚语' },
        { type: 'quote', text: '己所不欲，勿施于人。', author: '孔子' },
        { type: 'quote', text: '知之为知之，不知为不知，是知也。', author: '孔子' },
        { type: 'quote', text: '路漫漫其修远兮，吾将上下而求索。', author: '屈原' },
        { type: 'quote', text: '书山有路勤为径，学海无涯苦作舟。', author: '韩愈' },
        { type: 'quote', text: '温故而知新，可以为师矣。', author: '孔子' },
        { type: 'quote', text: '三人行，必有我师焉。', author: '孔子' },
        { type: 'quote', text: '宝剑锋从磨砺出，梅花香自苦寒来。', author: '古训' },
        { type: 'quote', text: '业精于勤荒于嬉，行成于思毁于随。', author: '韩愈' },
        { type: 'quote', text: '人生自古谁无死，留取丹心照汗青。', author: '文天祥' },
        { type: 'quote', text: '莫等闲，白了少年头，空悲切。', author: '岳飞' },
        { type: 'quote', text: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
        { type: 'quote', text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
        { type: 'quote', text: '不要因为走得太远，而忘记为什么出发。', author: '纪伯伦' },
        { type: 'quote', text: '种一棵树最好的时间是十年前，其次是现在。', author: '谚语' },
        { type: 'method', text: '🍅 番茄工作法：专注25分钟 → 休息5分钟 → 重复4次后长休息15分钟' },
        { type: 'method', text: '📋 二分钟法则：如果一件事两分钟内能做完，马上就做' },
        { type: 'method', text: '🎯 三只青蛙法：每天早上先做三件最重要的事' },
        { type: 'method', text: '📦 四象限法：按紧急/重要分类，优先做"重要不紧急"的事' },
        { type: 'method', text: '🧊 冰山模型：看到的问题只是冰山一角，深入思考根本原因' },
        { type: 'method', text: '🔄 PDCA循环：计划→执行→检查→改进，持续迭代' },
        { type: 'method', text: '✂️ 奥卡姆剃刀：如无必要，勿增实体——保持简单' },
        { type: 'method', text: '🎪 帕累托法则：80%的成果来自20%的努力，找到关键的20%' },
        { type: 'method', text: '🧘 正念工作：专注当下任务，一次只做一件事' },
        { type: 'method', text: '📝 每日回顾：睡前花5分钟回顾今天的收获和明天的计划' },
        { type: 'joke', text: '程序员的一天：开机 → 打开IDE → 关闭IDE → 打开Stack Overflow → 复制粘贴 → 下班 😄' },
        { type: 'joke', text: '为什么程序员总是搞混万圣节和圣诞节？因为 Oct 31 == Dec 25 🎃' },
        { type: 'joke', text: '老板：你怎么总是迟到？程序员：因为我家的路由器每天都要重启一次 🔌' },
        { type: 'joke', text: 'A SQL query walks into a bar, walks up to two tables and asks, "Can I join you?" 🍺' },
        { type: 'joke', text: '世界上最远的距离不是生与死，而是你写的代码我无法debug 💻' },
        { type: 'joke', text: '人生如代码，有时候需要delete重写，而不是一直fix bug 🐛' },
        { type: 'joke', text: '今天也是元气满满的一天呢！虽然我不知道元气是什么...大概是一种充电方式？🔋' },
        { type: 'joke', text: '有人问我："你的梦想是什么？" 我说："不上班还有钱花。" 然后我醒了 💤' },
        { type: 'fable', text: '🐢 龟兔赛跑告诉我们：持续稳定的努力，胜过短暂的冲刺。坚持就是力量。' },
        { type: 'fable', text: '🪨 愚公移山的故事：再大的困难，只要持之以恒，终将克服。' },
        { type: 'fable', text: '🦁 狮子与老鼠：不要小看任何人，每个人都有独特的价值。' },
        { type: 'fable', text: '🌱 竹子的故事：前四年只长了3厘米，第五年以每天30厘米的速度疯长。所有的努力都不会白费。' },
        { type: 'fable', text: '🦅 鹰的重生：鹰到40岁时会拔掉旧喙和爪，等待新生。有时候，放下才是新的开始。' },
        { type: 'fable', text: '🐸 温水青蛙：安逸是最大的陷阱，保持危机意识，才能不断进步。' },
        { type: 'fable', text: '🌊 滴水穿石：没有一滴水觉得自己能穿石，但坚持的力量超乎想象。' },
        { type: 'health', text: '💧 该喝水了！保持水分充足有助于集中注意力。建议每小时喝一杯水。' },
        { type: 'health', text: '🧘 站起来活动一下吧！久坐30分钟后起身伸展5分钟，对身体很有好处。' },
        { type: 'health', text: '👀 20-20-20法则：每20分钟看20英尺外的东西20秒，保护你的眼睛。' },
        { type: 'health', text: '🌿 深呼吸放松：吸气4秒 → 屏气7秒 → 呼气8秒，这是最有效的放松技巧之一。' },
        { type: 'health', text: '🎵 听一首喜欢的歌吧！音乐能有效缓解压力，提升创造力。' },
    ];

    function getRandomWarmTip(type) {
        const pool = type ? WARM_QUOTES.filter(q => q.type === type) : WARM_QUOTES;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    function formatWarmTip(tip) {
        if (!tip) return '';
        if (tip.author) return `「${tip.text}」—— ${tip.author}`;
        return tip.text;
    }

    // ==================== v3.1.0: 扩展活动事件日志 ====================

    const EXT_EVENT_MAX = 200;
    const EXT_EVENT_CATEGORIES = ['music', 'task', 'storage', 'network', 'system', 'alarm'];

    async function logExtEvent(category, action, detail = {}) {
        try {
            const { extEventLog } = await chrome.storage.local.get('extEventLog');
            const log = Array.isArray(extEventLog) ? extEventLog : [];
            log.push({
                ts: Date.now(),
                cat: category,
                act: action,
                ok: detail.ok !== false,
                ms: detail.durationMs || 0,
                ctx: detail.context || '',
                err: detail.error || '',
            });
            while (log.length > EXT_EVENT_MAX) log.shift();
            await chrome.storage.local.set({ extEventLog: log });
        } catch { /* storage full or unavailable */ }
    }

    // ==================== 系统资源监控（v3.0.0）====================

    async function getSystemStats() {
        const stats = {};
        try {
            const cpuInfo = await chrome.system.cpu.getInfo();
            stats.cpu = {
                model: cpuInfo.modelName,
                arch: cpuInfo.archName,
                numProcessors: cpuInfo.numOfProcessors,
                processors: cpuInfo.processors.map(p => ({
                    user: p.usage.user,
                    kernel: p.usage.kernel,
                    idle: p.usage.idle,
                    total: p.usage.total,
                })),
            };
        } catch { stats.cpu = null; }

        try {
            const memInfo = await chrome.system.memory.getInfo();
            stats.memory = {
                total: memInfo.capacity,
                available: memInfo.availableCapacity,
                used: memInfo.capacity - memInfo.availableCapacity,
                usagePercent: Math.round((1 - memInfo.availableCapacity / memInfo.capacity) * 100),
            };
        } catch { stats.memory = null; }

        try {
            const storageInfo = await chrome.system.storage.getInfo();
            stats.storage = storageInfo
                .filter(u => u.type === 'fixed')
                .map(u => ({
                    id: u.id,
                    name: u.name,
                    capacity: u.capacity,
                    type: u.type,
                }));
        } catch { stats.storage = null; }

        try {
            if (performance?.memory) {
                stats.extMemory = {
                    jsHeapUsed: performance.memory.usedJSHeapSize,
                    jsHeapTotal: performance.memory.totalJSHeapSize,
                    jsHeapLimit: performance.memory.jsHeapSizeLimit,
                };
            }
        } catch { /* not available */ }

        return stats;
    }

    // ==================== 任务提醒功能 ====================

    /**
     * 获取下一个指定时间的时间戳
     * @param {number} hour 小时（0-23）
     * @param {number} minute 分钟（0-59）
     * @returns {number} 时间戳（毫秒）
     */
    function getNextDailyTime(hour, minute) {
        const now = new Date();
        const reminder = new Date(now);
        reminder.setHours(hour, minute, 0, 0);
        
        // 如果今天的时间已经过了，则设置为明天
        if (reminder <= now) {
            reminder.setDate(reminder.getDate() + 1);
        }
        
        return reminder.getTime();
    }

    /**
     * 获取今天的日期字符串 (YYYY-MM-DD)
     * @returns {string} 日期字符串
     */
    function formatLocalDateYMD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function getTodayDate() {
        // 本地日期语义：dueDate 是 YYYY-MM-DD（本地），这里也应按本地计算
        return formatLocalDateYMD(new Date());
    }

    /**
     * 初始化定时任务
     */
    async function initAlarms() {
        console.log('初始化任务提醒闹钟...');
        
        // 获取任务提醒设置
        const { dailyTaskSettings } = await chrome.storage.sync.get('dailyTaskSettings');
        const settings = dailyTaskSettings || {
            enableNotifications: true,
            defaultReminderTime: '09:00',
            showOverdueFirst: true
        };
        
        if (!settings.enableNotifications) {
            console.log('通知已禁用，跳过闹钟初始化');
            return;
        }
        
        // 清除旧闹钟
        await chrome.alarms.clearAll();
        
        // 解析默认提醒时间
        const [hour, minute] = (settings.defaultReminderTime || '09:00').split(':').map(Number);
        
        // 每日摘要提醒
        await chrome.alarms.create('daily-summary', {
            when: getNextDailyTime(hour, minute),
            periodInMinutes: 24 * 60  // 每天重复
        });
        console.log(`已设置每日摘要提醒: ${hour}:${minute}`);
        
        // 定期检查过期任务（每30分钟）
        await chrome.alarms.create('check-overdue', {
            periodInMinutes: 30
        });
        console.log('已设置过期任务检查: 每30分钟');
        
        // 每日检查备份提醒（每天检查一次）
        await chrome.alarms.create('check-backup-reminder', {
            when: getNextDailyTime(10, 0),  // 每天上午10点检查
            periodInMinutes: 24 * 60
        });
        console.log('已设置备份提醒检查: 每天上午10点');
        
        // 每日凌晨重置习惯任务状态（00:05 触发，避免恰好卡零点）
        await chrome.alarms.create('reset-daily-habits', {
            when: getNextDailyTime(0, 5),
            periodInMinutes: 24 * 60
        });
        console.log('已设置每日习惯重置: 每天 00:05');
        
        // 设置单个任务的提醒
        await setupTaskReminders();

        // v3.4.0: 读取用户性能设置，按开关创建后台 alarm
        const { settings: perfSettings } = await chrome.storage.sync.get('settings');

        // v3.0.0: 温情提示（每2小时推送一次）
        if (perfSettings?.enableWarmTip !== false) {
            await chrome.alarms.create('warm-tip', {
                periodInMinutes: 120
            });
            console.log('已设置温情提示: 每2小时');
        } else {
            console.log('温情提示已禁用（用户设置）');
        }

        // v3.0.0 → v3.4.0: 系统资源监控（默认5分钟，用户可调）
        if (perfSettings?.enableSystemMonitor !== false) {
            const monitorInterval = Math.max(1, Math.min(30, perfSettings?.systemMonitorInterval || 5));
            await chrome.alarms.create('system-monitor', {
                periodInMinutes: monitorInterval
            });
            console.log(`已设置系统资源监控: 每${monitorInterval}分钟`);
        } else {
            console.log('系统资源监控已禁用（用户设置）');
        }

        // 热搜关键字监控（按用户设置的间隔，默认 10 分钟）
        if (perfSettings?.enableKeywordScan !== false) {
            const kwSettings = await getKeywordSettings();
            if (kwSettings.enabled) {
                const interval = Math.max(1, kwSettings.scanInterval || 10);
                await chrome.alarms.create('keyword-scan', {
                    periodInMinutes: interval
                });
                console.log(`已设置关键字扫描: 每${interval}分钟`);
            }
        } else {
            console.log('关键字扫描已禁用（用户设置）');
        }
    }
    
    /**
     * 检查是否需要提醒用户备份数据
     */
    async function checkBackupReminder() {
        console.log('检查备份提醒...');
        
        try {
            const { backupSettings, memos } = await chrome.storage.local.get(['backupSettings', 'memos']);
            
            // 如果没有任务数据，不需要提醒
            if (!memos || !Array.isArray(memos) || memos.length === 0) {
                console.log('没有任务数据，跳过备份提醒');
                return;
            }
            
            const settings = backupSettings || {
                autoRemindBackup: true,
                lastBackupDate: null,
                backupReminderDays: 7
            };
            
            // 如果关闭了自动提醒，跳过
            if (!settings.autoRemindBackup) {
                console.log('备份提醒已关闭');
                return;
            }
            
            const now = Date.now();
            const reminderDays = settings.backupReminderDays || 7;
            const reminderInterval = reminderDays * 24 * 60 * 60 * 1000;
            
            // 如果从未备份过，或者距离上次备份已超过提醒间隔
            if (!settings.lastBackupDate || (now - settings.lastBackupDate > reminderInterval)) {
                // 检查距离上次提醒是否超过1天（避免频繁打扰）
                const lastReminderKey = 'lastBackupReminderTime';
                const { [lastReminderKey]: lastReminder } = await chrome.storage.local.get(lastReminderKey);
                
                if (lastReminder && (now - lastReminder < 24 * 60 * 60 * 1000)) {
                    console.log('今天已经提醒过了');
                    return;
                }
                
                // 发送备份提醒通知
                const taskCount = memos.length;
                const daysSinceBackup = settings.lastBackupDate 
                    ? Math.floor((now - settings.lastBackupDate) / (24 * 60 * 60 * 1000))
                    : null;
                
                let message = `您有 ${taskCount} 个任务数据`;
                if (daysSinceBackup !== null) {
                    message += `，已 ${daysSinceBackup} 天未备份`;
                } else {
                    message += '，建议定期备份以防数据丢失';
                }
                
                // macOS 原生通知不完全支持 buttons，先尝试带按钮，失败则降级
                try {
                    await chrome.notifications.create('backup-reminder', {
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                        title: '💾 数据备份提醒',
                        message: message,
                        priority: 1,
                        buttons: [
                            { title: '📤 立即备份' },
                            { title: '⏰ 稍后提醒' }
                        ]
                    });
                } catch (btnErr) {
                    // 降级：不带按钮的基础通知
                    await chrome.notifications.create('backup-reminder', {
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                        title: '💾 数据备份提醒',
                        message: message,
                        priority: 1
                    });
                }
                
                // 记录提醒时间
                await chrome.storage.local.set({ [lastReminderKey]: now });
                console.log('备份提醒通知已发送');
            }
        } catch (error) {
            console.error('检查备份提醒失败:', error);
        }
    }

    /**
     * 为所有任务设置提醒
     */
    async function setupTaskReminders() {
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) return;
        
        const now = Date.now();
        
        for (const task of memos) {
            if (task.completed || task.status === 'failed') continue;
            if (!task.dueDate) continue;
            
            // 计算提醒时间
            const dueTime = task.dueTime || '09:00';
            const dueDateTime = new Date(`${task.dueDate}T${dueTime}`);
            
            // 提前30分钟提醒
            const reminderTime = dueDateTime.getTime() - 30 * 60 * 1000;
            
            // 只设置未来的提醒
            if (reminderTime > now) {
                await chrome.alarms.create(`task-reminder-${task.id}`, {
                    when: reminderTime
                });
                console.log(`已设置任务提醒: ${task.title} - ${new Date(reminderTime).toLocaleString()}`);
            }
        }
    }

    /**
     * 发送每日摘要通知
     */
    async function sendDailySummary() {
        console.log('发送每日任务摘要...');
        
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) {
            console.log('没有任务数据');
            return;
        }
        
        const today = getTodayDate();
        
        // 统计今日任务（排除失败任务）
        const todayTasks = memos.filter(task => 
            task.dueDate === today && !task.completed && task.status !== 'failed'
        );
        
        // 统计过期任务（排除失败任务）
        const overdueTasks = memos.filter(task => 
            task.dueDate && task.dueDate < today && !task.completed && task.status !== 'failed'
        );
        
        // 如果没有任务，不发送通知
        if (todayTasks.length === 0 && overdueTasks.length === 0) {
            console.log('没有待处理的任务');
            return;
        }
        
        // 构建通知消息
        let message = '';
        if (todayTasks.length > 0) {
            message += `今日任务: ${todayTasks.length} 个`;
        }
        if (overdueTasks.length > 0) {
            if (message) message += '\n';
            message += `过期任务: ${overdueTasks.length} 个`;
        }
        
        // v3.0.0: 附加温情提示
        const tip = getRandomWarmTip('quote');
        if (tip) {
            message += '\n\n💡 ' + formatWarmTip(tip);
        }
        
        // 发送通知
        try {
            await chrome.notifications.create('daily-summary', {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: '📋 每日任务摘要',
                message: message,
                priority: overdueTasks.length > 0 ? 2 : 1,
                requireInteraction: overdueTasks.length > 0
            });
            console.log('每日摘要通知已发送');
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    /**
     * 检查并提醒过期任务
     */
    async function checkOverdueTasks() {
        console.log('检查过期任务...');
        
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) return;
        
        const today = getTodayDate();
        
        const overdueTasks = memos.filter(task => 
            task.dueDate && 
            task.dueDate < today && 
            !task.completed &&
            task.status !== 'failed' &&
            !task.overdueNotified
        );
        
        if (overdueTasks.length === 0) {
            console.log('没有新的过期任务');
            return;
        }
        
        // v3.0.0: 附加鼓励方法论
        const methodTip = getRandomWarmTip('method');
        const overdueMsg = `您有 ${overdueTasks.length} 个任务已过期，请及时处理`
            + (methodTip ? `\n\n💪 ${methodTip.text}` : '');

        // 发送过期任务通知
        try {
            await chrome.notifications.create('overdue-tasks', {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: '⚠️ 任务过期提醒',
                message: overdueMsg,
                priority: 2,
                requireInteraction: true
            });
            
            // 标记已通知
            for (const task of overdueTasks) {
                task.overdueNotified = true;
            }
            await chrome.storage.local.set({ memos });
            
            console.log('过期任务通知已发送');
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    /**
     * v3.0.0: 温情提示推送
     */
    async function sendWarmTipNotification() {
        const { warmTipEnabled } = await chrome.storage.sync.get('warmTipEnabled');
        if (warmTipEnabled === false) return;

        const types = ['quote', 'method', 'joke', 'fable', 'health'];
        const tip = getRandomWarmTip(types[Math.floor(Math.random() * types.length)]);
        if (!tip) return;

        const icons = { quote: '💡', method: '📐', joke: '😄', fable: '📖', health: '💚' };
        const titles = { quote: '名人名言', method: '效率方法论', joke: '轻松一刻', fable: '小故事大道理', health: '健康小贴士' };

        try {
            await chrome.notifications.create(`warm-tip-${Date.now()}`, {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: `${icons[tip.type] || '💡'} ${titles[tip.type] || '温馨提示'}`,
                message: formatWarmTip(tip),
                priority: 0,
            });
        } catch (e) {
            console.warn('温情提示通知失败:', e);
        }
    }

    /**
     * v3.0.0: 系统资源监控数据采集
     */
    async function collectSystemStats() {
        try {
            const stats = await getSystemStats();
            const { sysMonitorHistory } = await chrome.storage.local.get('sysMonitorHistory');
            const history = Array.isArray(sysMonitorHistory) ? sysMonitorHistory : [];

            history.push({ ts: Date.now(), ...stats });
            // 保留最近 60 个采样点（约1小时）
            while (history.length > 60) history.shift();
            await chrome.storage.local.set({ sysMonitorHistory: history });
        } catch (e) {
            console.warn('系统监控采集失败:', e);
        }
    }

    /**
     * 发送单个任务提醒
     * @param {string} taskId 任务ID
     */
    async function sendTaskReminder(taskId) {
        console.log(`发送任务提醒: ${taskId}`);
        
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) return;
        
        const task = memos.find(t => t.id === taskId);
        if (!task || task.completed) {
            console.log('任务不存在或已完成');
            return;
        }
        
        // 构建优先级提示
        let priorityIcon = '';
        switch (task.priority) {
            case 'high': priorityIcon = '🔴 '; break;
            case 'medium': priorityIcon = '🟡 '; break;
            case 'low': priorityIcon = '🟢 '; break;
        }
        
        try {
            // macOS 原生通知不完全支持 buttons，先尝试带按钮，失败则降级
            try {
                await chrome.notifications.create(`task-${taskId}`, {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                    title: '⏰ 任务提醒',
                    message: `${priorityIcon}${task.title}\n截止: ${task.dueDate} ${task.dueTime || ''}`,
                    priority: task.priority === 'high' ? 2 : 1,
                    requireInteraction: true,
                    buttons: [
                        { title: '✅ 完成' },
                        { title: '⏰ 推迟' }
                    ]
                });
            } catch (btnErr) {
                // 降级：不带按钮的基础通知
                await chrome.notifications.create(`task-${taskId}`, {
                    type: 'basic',
                    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                    title: '⏰ 任务提醒',
                    message: `${priorityIcon}${task.title}\n截止: ${task.dueDate} ${task.dueTime || ''}`,
                    priority: task.priority === 'high' ? 2 : 1,
                    requireInteraction: true
                });
            }
            console.log('任务提醒通知已发送');
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    /**
     * 标记任务为已完成
     * @param {string} taskId 任务ID
     */
    async function markTaskCompleted(taskId) {
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) return;
        
        const task = memos.find(t => t.id === taskId);
        if (task) {
            task.completed = true;
            task.completedAt = Date.now();
            task.updatedAt = Date.now();
            await chrome.storage.local.set({ memos });
            console.log(`任务已完成: ${task.title}`);
            
            // 清除该任务的提醒闹钟
            await chrome.alarms.clear(`task-reminder-${taskId}`);
        }
    }

    /**
     * 推迟任务到明天
     * @param {string} taskId 任务ID
     */
    async function postponeTask(taskId) {
        const { memos } = await chrome.storage.local.get('memos');
        if (!memos || !Array.isArray(memos)) return;
        
        const task = memos.find(t => t.id === taskId);
        if (task) {
            // 推迟到明天
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            task.dueDate = formatLocalDateYMD(tomorrow);
            task.updatedAt = Date.now();
            task.overdueNotified = false;  // 重置过期通知标记
            await chrome.storage.local.set({ memos });
            console.log(`任务已推迟到明天: ${task.title}`);
            
            // 重新设置提醒
            await setupTaskReminders();
        }
    }

    /**
     * 每日重置习惯任务状态
     * 在凌晨执行：将所有每日习惯任务的 completed 重置为 false，
     * 更新 dueDate 为今天，重新计算连续天数
     */
    async function resetDailyHabits() {
        console.log('执行每日习惯任务重置...');
        
        try {
            const { memos } = await chrome.storage.local.get('memos');
            if (!memos || !Array.isArray(memos)) return;
            
            const today = getTodayDate();
            let changed = false;
            
            for (const task of memos) {
                if (!task.recurrence?.enabled || task.recurrence?.type !== 'daily') continue;
                
                // 确保 habit 数据结构存在
                if (!task.habit) {
                    task.habit = {
                        streak: 0,
                        bestStreak: 0,
                        completedDates: [],
                        totalCompletions: 0
                    };
                    changed = true;
                }
                
                // 更新 dueDate 为今天
                if (task.dueDate !== today) {
                    task.dueDate = today;
                    changed = true;
                }
                
                // 重置今日完成状态
                const isTodayDone = task.habit.completedDates.includes(today);
                if (task.completed !== isTodayDone) {
                    task.completed = isTodayDone;
                    task.completedAt = isTodayDone ? Date.now() : null;
                    changed = true;
                }
                
                // 重新计算连续天数
                const newStreak = calculateStreak(task.habit.completedDates, today);
                if (task.habit.streak !== newStreak) {
                    task.habit.streak = newStreak;
                    if (newStreak > task.habit.bestStreak) {
                        task.habit.bestStreak = newStreak;
                    }
                    changed = true;
                }
            }
            
            if (changed) {
                await chrome.storage.local.set({ memos });
                console.log('每日习惯任务状态已重置');
            }
        } catch (error) {
            console.error('重置每日习惯任务失败:', error);
        }
    }
    
    /**
     * 计算习惯连续天数（后台版本）
     */
    function calculateStreak(completedDates, today) {
        if (!completedDates || completedDates.length === 0) return 0;
        
        const sorted = [...completedDates].sort().reverse();
        let streak = 0;
        let expectedDate = today;
        
        // 如果今天还没完成，从昨天开始算
        if (!sorted.includes(expectedDate)) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expectedDate = formatLocalDateYMD(yesterday);
        }
        
        for (const dateStr of sorted) {
            if (dateStr === expectedDate) {
                streak++;
                const dateObj = new Date(dateStr + 'T00:00:00');
                dateObj.setDate(dateObj.getDate() - 1);
                expectedDate = formatLocalDateYMD(dateObj);
            } else if (dateStr < expectedDate) {
                break;
            }
        }
        
        return streak;
    }

    // ==================== 热搜关键字监控引擎 ====================

    const KEYWORD_ALERT_DEFAULTS = Object.freeze({
        enabled: false,
        keywords: [],          // [{ text: string, enabled: boolean }]
        scanInterval: 10,      // 分钟
        maxNotifications: 5,   // 单次最大通知数
        quietHoursStart: '',   // 免打扰开始（空=不启用）
        quietHoursEnd: '',     // 免打扰结束
        sources: ['weibo', 'bilibili', 'zhihu']
    });

    const KEYWORD_HISTORY_KEY = 'keywordAlertHistory';
    const KEYWORD_HISTORY_TTL = 24 * 60 * 60 * 1000; // 24 小时去重
    const DAILYHOT_API_BASE = 'https://www.meczyc6.info/hotapi/';

    /**
     * 获取关键字监控设置
     */
    async function getKeywordSettings() {
        try {
            const { keywordAlertSettings } = await chrome.storage.sync.get('keywordAlertSettings');
            return { ...KEYWORD_ALERT_DEFAULTS, ...(keywordAlertSettings || {}) };
        } catch {
            return { ...KEYWORD_ALERT_DEFAULTS };
        }
    }

    /**
     * 获取通知去重历史
     */
    async function getAlertHistory() {
        try {
            const { [KEYWORD_HISTORY_KEY]: history } = await chrome.storage.local.get(KEYWORD_HISTORY_KEY);
            return history && typeof history === 'object' ? history : {};
        } catch {
            return {};
        }
    }

    /**
     * 保存通知去重历史（自动清理过期条目）
     */
    async function saveAlertHistory(history) {
        const now = Date.now();
        const cleaned = {};
        for (const [key, ts] of Object.entries(history)) {
            if (now - ts < KEYWORD_HISTORY_TTL) {
                cleaned[key] = ts;
            }
        }
        try {
            await chrome.storage.local.set({ [KEYWORD_HISTORY_KEY]: cleaned });
        } catch { /* ignore */ }
    }

    /**
     * 简易哈希：生成去重键
     */
    function hashAlertKey(source, title) {
        const str = `${source}:${title}`;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return 'ka_' + Math.abs(hash).toString(36);
    }

    /**
     * 检查是否在免打扰时段
     */
    function isQuietHours(settings) {
        if (!settings.quietHoursStart || !settings.quietHoursEnd) return false;
        const now = new Date();
        const hhmm = now.getHours() * 100 + now.getMinutes();
        const [sh, sm] = settings.quietHoursStart.split(':').map(Number);
        const [eh, em] = settings.quietHoursEnd.split(':').map(Number);
        const start = sh * 100 + sm;
        const end = eh * 100 + em;

        if (start <= end) {
            return hhmm >= start && hhmm < end;
        }
        // 跨午夜（如 23:00 - 07:00）
        return hhmm >= start || hhmm < end;
    }

    /**
     * 平台名称映射
     */
    const SOURCE_NAMES = {
        weibo: '微博热搜',
        bilibili: 'B站热榜',
        zhihu: '知乎热榜'
    };
    const SOURCE_ICONS = {
        weibo: '🔥',
        bilibili: '📺',
        zhihu: '💭'
    };

    /**
     * 核心：扫描热搜关键字
     */
    async function scanKeywordAlerts() {
        console.log('[KeywordAlert] 开始关键字扫描...');

        const settings = await getKeywordSettings();
        if (!settings.enabled) {
            console.log('[KeywordAlert] 功能已禁用');
            return;
        }

        const activeKeywords = (settings.keywords || [])
            .filter(k => k.enabled && k.text?.trim())
            .map(k => k.text.trim());

        if (activeKeywords.length === 0) {
            console.log('[KeywordAlert] 无激活的关键字');
            return;
        }

        // 检查免打扰时段
        if (isQuietHours(settings)) {
            console.log('[KeywordAlert] 当前处于免打扰时段');
            return;
        }

        // 并行请求所有数据源
        const sources = settings.sources || ['weibo', 'bilibili', 'zhihu'];
        const results = await Promise.allSettled(
            sources.map(async (src) => {
                const resp = await fetch(`${DAILYHOT_API_BASE}/${src}`, { cache: 'no-store' });
                if (!resp.ok) throw new Error(`${src} HTTP ${resp.status}`);
                const json = await resp.json();
                if (json.code !== 200) throw new Error(`${src} code ${json.code}`);
                return { source: src, data: json.data || [] };
            })
        );

        // 收集匹配结果
        const matches = [];
        for (const result of results) {
            if (result.status !== 'fulfilled') continue;
            const { source, data } = result.value;

            for (const item of data) {
                const text = `${item.title || ''} ${item.desc || ''}`;
                for (const keyword of activeKeywords) {
                    if (text.toLowerCase().includes(keyword.toLowerCase())) {
                        matches.push({
                            source,
                            title: item.title,
                            desc: item.desc || '',
                            url: item.url || item.mobileUrl || '',
                            keyword
                        });
                        break; // 一条热搜只匹配第一个关键字
                    }
                }
            }
        }

        if (matches.length === 0) {
            console.log('[KeywordAlert] 本次扫描无匹配');
            return;
        }

        console.log(`[KeywordAlert] 发现 ${matches.length} 条匹配`);

        // 去重 + 发送通知
        const history = await getAlertHistory();
        let notifyCount = 0;
        const maxN = settings.maxNotifications || 5;

        for (const match of matches) {
            if (notifyCount >= maxN) break;

            const key = hashAlertKey(match.source, match.title);
            if (history[key]) continue; // 已通知过

            // 发送系统通知
            const sourceName = SOURCE_NAMES[match.source] || match.source;
            const sourceIcon = SOURCE_ICONS[match.source] || '📢';
            const notifId = `keyword-alert-${key}-${Date.now()}`;

            try {
                try {
                    await chrome.notifications.create(notifId, {
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                        title: `${sourceIcon} 热搜关键字命中`,
                        message: `【${sourceName}】${match.title}\n匹配关键字: "${match.keyword}"`,
                        priority: 2,
                        requireInteraction: true,
                        buttons: [
                            { title: '🔗 查看详情' },
                            { title: '🔕 知道了' }
                        ]
                    });
                } catch {
                    // macOS 按钮降级
                    await chrome.notifications.create(notifId, {
                        type: 'basic',
                        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                        title: `${sourceIcon} 热搜关键字命中`,
                        message: `【${sourceName}】${match.title}\n匹配关键字: "${match.keyword}"`,
                        priority: 2,
                        requireInteraction: true
                    });
                }

                // 记录到去重历史
                history[key] = Date.now();
                notifyCount++;

                // 同时存储通知详情供点击跳转使用
                await chrome.storage.local.set({
                    [`ka_notif_${notifId}`]: {
                        url: match.url,
                        source: match.source,
                        title: match.title,
                        keyword: match.keyword,
                        ts: Date.now()
                    }
                });

                console.log(`[KeywordAlert] 通知已发送: ${match.title} (${match.keyword})`);
            } catch (err) {
                console.error('[KeywordAlert] 发送通知失败:', err);
            }
        }

        await saveAlertHistory(history);

        // 通知前端页面更新匹配高亮
        if (notifyCount > 0) {
            try {
                const tabs = await chrome.tabs.query({});
                for (const tab of tabs) {
                    try {
                        await chrome.tabs.sendMessage(tab.id, {
                            action: 'keywordMatchesUpdated',
                            matches: matches.map(m => ({ source: m.source, title: m.title, keyword: m.keyword }))
                        });
                    } catch { /* tab may not have content script */ }
                }
            } catch { /* ignore */ }
        }
    }

    // ==================== 事件监听 ====================

    // 监听扩展图标点击事件
    chrome.action.onClicked.addListener(() => {
        // 创建新标签页
        chrome.tabs.create({ url: 'index.html' });
    });

    chrome.contextMenus.onClicked.addListener((info) => {
        if (info.menuItemId === "settings") {
            chrome.tabs.create({ url: 'settings.html' });
        }
    });

    // 监听安装/更新事件
    chrome.runtime.onInstalled.addListener(async (details) => {
        console.log('Chrome Time Extension installed/updated:', details.reason);
        
        chrome.contextMenus.create({
            id: 'settings',
            title: '设置',
            contexts: ['all'] // 建议设为 all 方便测试
        });

        try {
            chrome.runtime.setUninstallURL('https://ddu-studious.github.io/chrome-time-background/uninstall.html');
            console.log('卸载页面 URL 已设置');
        } catch (error) {
            console.warn('设置卸载页面失败:', error);
        }
        
        if (details.reason === 'install') {
            await chrome.storage.sync.set({
                dailyTaskSettings: {
                    enableNotifications: true,
                    defaultReminderTime: '09:00',
                    showOverdueFirst: true,
                    reminderAdvanceMinutes: 30
                }
            });
            
            await chrome.storage.local.set({
                backupSettings: {
                    autoRemindBackup: true,
                    lastBackupDate: null,
                    backupReminderDays: 7
                }
            });
        }
        
        await initAlarms();

        try {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: [9001, 9002, 9003, 9004, 9010]
            });
        } catch (_) {}

    });



    // 监听浏览器启动事件
    chrome.runtime.onStartup.addListener(async () => {
        console.log('浏览器启动，重新初始化闹钟...');
        await initAlarms();
    });

    // 监听闹钟事件
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        console.log('闹钟触发:', alarm.name);
        const _alarmStart = Date.now();
        
        switch (alarm.name) {
            case 'daily-summary':
                await sendDailySummary();
                logExtEvent('alarm', 'daily-summary', { durationMs: Date.now() - _alarmStart });
                break;
            case 'check-overdue':
                await checkOverdueTasks();
                logExtEvent('alarm', 'check-overdue', { durationMs: Date.now() - _alarmStart });
                break;
            case 'check-backup-reminder':
                await checkBackupReminder();
                logExtEvent('alarm', 'check-backup-reminder', { durationMs: Date.now() - _alarmStart });
                break;
            case 'reset-daily-habits':
                await resetDailyHabits();
                logExtEvent('alarm', 'reset-daily-habits', { durationMs: Date.now() - _alarmStart });
                break;
            case 'keyword-scan':
                await scanKeywordAlerts();
                logExtEvent('alarm', 'keyword-scan', { durationMs: Date.now() - _alarmStart });
                break;
            case 'warm-tip':
                await sendWarmTipNotification();
                logExtEvent('alarm', 'warm-tip', { durationMs: Date.now() - _alarmStart });
                break;
            case 'system-monitor':
                await collectSystemStats();
                logExtEvent('system', 'stats-sample', { durationMs: Date.now() - _alarmStart });
                break;
            default:
                if (alarm.name.startsWith('task-reminder-')) {
                    const taskId = alarm.name.replace('task-reminder-', '');
                    await sendTaskReminder(taskId);
                    logExtEvent('task', 'reminder-fired', { durationMs: Date.now() - _alarmStart, context: taskId });
                }
        }
    });

    // 监听通知按钮点击
    chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
        console.log('通知按钮点击:', notificationId, buttonIndex);
        
        if (notificationId.startsWith('task-')) {
            const taskId = notificationId.replace('task-', '');
            
            if (buttonIndex === 0) {
                // 完成任务
                await markTaskCompleted(taskId);
            } else if (buttonIndex === 1) {
                // 推迟任务
                await postponeTask(taskId);
            }
            
            // 清除通知
            await chrome.notifications.clear(notificationId);
        }
        
        // 处理关键字监控通知
        if (notificationId.startsWith('keyword-alert-')) {
            const detailKey = `ka_notif_${notificationId}`;
            const { [detailKey]: detail } = await chrome.storage.local.get(detailKey);
            
            if (buttonIndex === 0 && detail?.url) {
                // 查看详情 - 打开热搜链接
                await chrome.tabs.create({ url: detail.url });
            }
            // buttonIndex === 1: 知道了 - 仅关闭通知
            
            // 清理存储的通知详情
            await chrome.storage.local.remove(detailKey);
            await chrome.notifications.clear(notificationId);
            return;
        }
        
        // 处理备份提醒通知
        if (notificationId === 'backup-reminder') {
            if (buttonIndex === 0) {
                // 立即备份 - 打开新标签页并触发备份
                await chrome.tabs.create({ url: 'chrome://newtab/' });
                // 发送消息给前端触发备份面板
                // 由于新标签页可能还没加载完，使用 storage 来传递意图
                await chrome.storage.local.set({ pendingAction: 'openBackupPanel' });
            }
            // 稍后提醒 - 什么都不做，下次检查时会再提醒
            
            await chrome.notifications.clear(notificationId);
        }
    });

    // 监听通知点击
    chrome.notifications.onClicked.addListener(async (notificationId) => {
        console.log('通知点击:', notificationId);
        
        // 关键字监控通知 - 跳转到热搜链接
        if (notificationId.startsWith('keyword-alert-')) {
            const detailKey = `ka_notif_${notificationId}`;
            const { [detailKey]: detail } = await chrome.storage.local.get(detailKey);
            
            if (detail?.url) {
                await chrome.tabs.create({ url: detail.url });
            } else {
                await chrome.tabs.create({ url: 'chrome://newtab/' });
            }
            
            await chrome.storage.local.remove(detailKey);
            await chrome.notifications.clear(notificationId);
            return;
        }
        
        // 打开新标签页
        await chrome.tabs.create({ url: 'chrome://newtab/' });
        
        // 清除通知
        await chrome.notifications.clear(notificationId);
    });

    // ==================== 网页内容提取 (v2.2.0) ====================

    async function extractWebContentInTab(url) {
        let tabId = null;
        try {
            const tab = await chrome.tabs.create({ url, active: false });
            tabId = tab.id;

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.tabs.onUpdated.removeListener(listener);
                    reject(new Error('页面加载超时'));
                }, 20000);

                const listener = (updatedTabId, changeInfo) => {
                    if (updatedTabId === tabId && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        clearTimeout(timeout);
                        resolve();
                    }
                };
                chrome.tabs.onUpdated.addListener(listener);
            });

            await new Promise(r => setTimeout(r, 1000));

            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    const title = document.title || '';
                    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
                    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';

                    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
                        .slice(0, 10)
                        .map(h => h.innerText.trim())
                        .filter(Boolean);

                    const article = document.querySelector('article')
                        || document.querySelector('main')
                        || document.querySelector('[role="main"]')
                        || document.body;

                    const clone = article.cloneNode(true);
                    clone.querySelectorAll(
                        'script, style, nav, header, footer, aside, iframe, ' +
                        '[role="navigation"], [role="banner"], ' +
                        '.sidebar, .nav, .menu, .ad, .advertisement, .social-share, .comment, .comments'
                    ).forEach(el => el.remove());

                    const bodyText = clone.innerText
                        .replace(/\s+/g, ' ')
                        .trim()
                        .substring(0, 3000);

                    return {
                        title,
                        description: metaDesc || ogDesc,
                        headings,
                        bodyText,
                        url: location.href
                    };
                }
            });

            return result.result;
        } finally {
            if (tabId) {
                try { await chrome.tabs.remove(tabId); } catch { /* tab may already be closed */ }
            }
        }
    }

    // ==================== 网易云音乐 API 直连 ====================

    async function getNeteaseCookies() {
        try {
            const cookies = await chrome.cookies.getAll({ domain: '.music.163.com' });
            return cookies.map(c => `${c.name}=${c.value}`).join('; ');
        } catch (e) {
            console.warn('[NeteaseAPI] 获取 Cookie 失败:', e);
            return '';
        }
    }

    async function neteaseApiCall(endpoint, params = {}, method = 'GET') {
        const _apiStart = Date.now();
        const cookieStr = await getNeteaseCookies();
        if (!cookieStr) {
            logExtEvent('network', 'netease-api', { ok: false, context: endpoint, error: 'no-cookie' });
            throw new Error('未登录网易云音乐，请先在浏览器中登录 music.163.com');
        }

        const csrfMatch = cookieStr.match(/__csrf=([^;]+)/);
        const csrf = csrfMatch ? csrfMatch[1] : '';
        const baseHeaders = {
            'Cookie': cookieStr,
            'Referer': 'https://music.163.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        };

        let fetchUrl, fetchOpts;
        if (method === 'POST') {
            fetchUrl = new URL(endpoint, 'https://music.163.com').toString();
            const body = new URLSearchParams(params);
            if (csrf) body.set('csrf_token', csrf);
            fetchOpts = {
                method: 'POST',
                headers: { ...baseHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body.toString(),
                credentials: 'include',
            };
        } else {
            const url = new URL(endpoint, 'https://music.163.com');
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) url.searchParams.set(k, v);
            });
            if (csrf) url.searchParams.set('csrf_token', csrf);
            fetchUrl = url.toString();
            fetchOpts = { method: 'GET', headers: baseHeaders, credentials: 'include' };
        }

        try {
            const resp = await fetch(fetchUrl, fetchOpts);
            if (!resp.ok) {
                logExtEvent('network', 'netease-api', { ok: false, durationMs: Date.now() - _apiStart, context: endpoint, error: `http-${resp.status}` });
                throw new Error(`API 请求失败: ${resp.status}`);
            }
            const data = await resp.json();
            logExtEvent('network', 'netease-api', { durationMs: Date.now() - _apiStart, context: endpoint });
            return data;
        } catch (e) {
            if (!e.message?.startsWith('API 请求失败')) {
                logExtEvent('network', 'netease-api', { ok: false, durationMs: Date.now() - _apiStart, context: endpoint, error: e.message });
            }
            throw e;
        }
    }

    // ==================== v3.8.0: 哔哩哔哩 API 直连（GET + POST） ====================

    const BILI_API_WHITELIST = [
        '/x/web-interface/popular',
        '/x/web-interface/wbi/index/top/feed/rcmd',
        '/x/web-interface/nav',
        '/x/web-interface/history/cursor',
        '/x/v2/history/toview',
        '/x/v3/fav/folder/created/list-all',
        '/x/v3/fav/resource/list',
        '/x/v3/fav/resource/deal',
        '/x/web-interface/ranking/v2',
        '/x/web-interface/wbi/search/all/v2',
        '/pugv/view/web/season',
        '/pugv/view/web/ep/list',
        '/x/web-interface/wbi/search/type',
        '/x/relation/followings',
        '/x/relation/tags',
        '/x/relation/tag',
        '/x/polymer/web-dynamic/v1/feed/all',
        '/x/space/wbi/arc/search',
        '/x/v2/history/toview/add',
        '/x/v2/history/toview/del',
        '/x/web-interface/archive/like',
        '/x/v2/reply',
        '/x/v2/reply/reply',
        '/x/web-interface/view',
    ];

    async function getBilibiliCookies() {
        try {
            const cookies = await chrome.cookies.getAll({ domain: '.bilibili.com' });
            return cookies.map(c => `${c.name}=${c.value}`).join('; ');
        } catch (e) {
            console.warn('[BilibiliAPI] 获取 Cookie 失败:', e);
            return '';
        }
    }

    async function getBiliCsrf() {
        try {
            const c = await chrome.cookies.get({ url: 'https://www.bilibili.com', name: 'bili_jct' });
            return c?.value || '';
        } catch { return ''; }
    }

    const BILI_API_DNR_RULE_ID = 9010;
    let _biliApiDnrActive = false;

    async function ensureBiliApiDnr() {
        if (_biliApiDnrActive) return;
        try {
            const cookieStr = await getBilibiliCookies();
            const ruleHeaders = [
                { header: 'Origin', operation: 'set', value: 'https://www.bilibili.com' },
                { header: 'Referer', operation: 'set', value: 'https://www.bilibili.com/' },
            ];
            if (cookieStr) {
                ruleHeaders.push({ header: 'Cookie', operation: 'set', value: cookieStr });
            }
            await chrome.declarativeNetRequest.updateSessionRules({
                removeRuleIds: [BILI_API_DNR_RULE_ID],
                addRules: [{
                    id: BILI_API_DNR_RULE_ID,
                    priority: 2,
                    action: { type: 'modifyHeaders', requestHeaders: ruleHeaders },
                    condition: {
                        urlFilter: '||api.bilibili.com/',
                        resourceTypes: ['xmlhttprequest'],
                        tabIds: [-1],
                    }
                }]
            });
            _biliApiDnrActive = true;
        } catch (e) {
            console.warn('[BilibiliAPI] DNR 规则设置失败:', e.message);
        }
    }

    async function refreshBiliApiDnr() {
        _biliApiDnrActive = false;
        await ensureBiliApiDnr();
    }

    async function bilibiliApiCall(endpoint, params = {}, method = 'GET') {
        if (!BILI_API_WHITELIST.some(p => endpoint.startsWith(p))) {
            throw new Error(`不允许的 API 端点: ${endpoint}`);
        }

        const _apiStart = Date.now();
        await ensureBiliApiDnr();

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        };

        let fetchOpts = { method, headers };
        const url = new URL(endpoint, 'https://api.bilibili.com');

        if (method === 'POST') {
            const csrf = await getBiliCsrf();
            if (csrf) params.csrf = csrf;
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            fetchOpts.body = new URLSearchParams(params).toString();
        } else {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
            });
        }

        try {
            const resp = await fetch(url.toString(), fetchOpts);
            if (!resp.ok) {
                if (resp.status === 412) {
                    await refreshBiliApiDnr();
                }
                logExtEvent('network', 'bilibili-api', { ok: false, durationMs: Date.now() - _apiStart, context: endpoint, error: `http-${resp.status}` });
                throw new Error(`B站 API 请求失败: ${resp.status}`);
            }
            const data = await resp.json();
            logExtEvent('network', 'bilibili-api', { durationMs: Date.now() - _apiStart, context: endpoint });
            return data;
        } catch (e) {
            if (!e.message?.startsWith('B站 API')) {
                logExtEvent('network', 'bilibili-api', { ok: false, durationMs: Date.now() - _apiStart, context: endpoint, error: e.message });
            }
            throw e;
        }
    }

    // 监听消息事件
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getBackgrounds') {
            (async () => {
                try {
                    const result = await self.BackgroundProviderManager.getBackgrounds();
                    sendResponse(result);
                } catch (e) {
                    console.warn('[getBackgrounds] Provider 异常，使用兜底:', e?.message);
                    sendResponse({
                        backgrounds: self.BackgroundProviderManager.FALLBACK_BACKGROUNDS,
                        source: 'fallback'
                    });
                }
            })();
            return true;
        }

        if (message.action === 'getProviderMeta') {
            sendResponse({
                ok: true,
                meta: self.BackgroundProviderManager.PROVIDER_META,
                defaults: self.BackgroundProviderManager.DEFAULT_PROVIDER_SETTINGS,
            });
            return false;
        }
        
        if (message.action === 'extractWebContent') {
            (async () => {
                try {
                    const data = await extractWebContentInTab(message.url);
                    sendResponse({ data });
                } catch (e) {
                    sendResponse({ error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'setupTaskReminder') {
            // 设置单个任务的提醒
            setupTaskReminders().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                console.error('设置任务提醒失败:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }
        
        if (message.action === 'updateKeywordAlertSettings') {
            // 前端更新了关键字设置，重新初始化扫描闹钟
            (async () => {
                try {
                    const kwSettings = await getKeywordSettings();
                    // 清除旧的关键字扫描闹钟
                    await chrome.alarms.clear('keyword-scan');
                    
                    if (kwSettings.enabled) {
                        const interval = Math.max(1, kwSettings.scanInterval || 10);
                        await chrome.alarms.create('keyword-scan', {
                            periodInMinutes: interval
                        });
                        console.log(`[KeywordAlert] 闹钟已更新: 每${interval}分钟`);
                        
                        // 立即执行一次扫描
                        await scanKeywordAlerts();
                    }
                    
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('[KeywordAlert] 更新设置失败:', error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;
        }
        
        if (message.action === 'triggerKeywordScan') {
            // 手动触发一次扫描
            scanKeywordAlerts().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }
        
        if (message.action === 'refreshAlarms') {
            // 刷新所有闹钟
            initAlarms().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                console.error('刷新闹钟失败:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true;
        }

        // ========== 音乐控制器消息处理 ==========

        if (message.action === 'netease_api') {
            (async () => {
                try {
                    const result = await neteaseApiCall(message.endpoint, message.params, message.method || 'GET');
                    sendResponse({ ok: true, data: result });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        // ========== v3.6.0: 哔哩哔哩 API 代理 ==========

        if (message.action === 'bilibili_api') {
            (async () => {
                try {
                    const result = await bilibiliApiCall(message.endpoint, message.params || {}, message.method || 'GET');
                    sendResponse({ ok: true, data: result });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        // ========== v3.15.0: B站嵌入播放器 Cookie 注入（declarativeNetRequest）==========

        if (message.action === 'bilibili_inject_cookies') {
            (async () => {
                try {
                    const cookieStr = await getBilibiliCookies();
                    if (!cookieStr || !cookieStr.includes('SESSDATA')) {
                        sendResponse({ ok: false, error: 'no-login-cookie' });
                        return;
                    }

                    const senderTabId = sender?.tab?.id;
                    if (!senderTabId || senderTabId < 0) {
                        console.warn('[Bilibili] 无法获取发送者标签页 ID，跳过 Cookie 注入');
                        sendResponse({ ok: false, error: 'no-tab-id' });
                        return;
                    }

                    const BILI_DNR_RULE_IDS = [9001, 9002, 9003, 9004];

                    await chrome.declarativeNetRequest.updateSessionRules({
                        removeRuleIds: BILI_DNR_RULE_IDS,
                        addRules: [
                            {
                                id: 9001,
                                priority: 1,
                                action: {
                                    type: 'modifyHeaders',
                                    requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
                                },
                                condition: {
                                    urlFilter: '||www.bilibili.com/video/',
                                    resourceTypes: ['sub_frame'],
                                    tabIds: [senderTabId],
                                }
                            },
                            {
                                id: 9002,
                                priority: 1,
                                action: {
                                    type: 'modifyHeaders',
                                    requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
                                },
                                condition: {
                                    urlFilter: '||api.bilibili.com/',
                                    resourceTypes: ['xmlhttprequest'],
                                    tabIds: [senderTabId],
                                }
                            },
                            {
                                id: 9003,
                                priority: 1,
                                action: {
                                    type: 'modifyHeaders',
                                    requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
                                },
                                condition: {
                                    urlFilter: '||player.bilibili.com/',
                                    resourceTypes: ['sub_frame', 'xmlhttprequest', 'script'],
                                    tabIds: [senderTabId],
                                }
                            },
                            {
                                id: 9004,
                                priority: 1,
                                action: {
                                    type: 'modifyHeaders',
                                    requestHeaders: [{ header: 'Cookie', operation: 'set', value: cookieStr }]
                                },
                                condition: {
                                    urlFilter: '||www.bilibili.com/bangumi/',
                                    resourceTypes: ['sub_frame'],
                                    tabIds: [senderTabId],
                                }
                            }
                        ]
                    });

                    logExtEvent('bilibili', 'dnr-cookie-inject', { ok: true, tabId: senderTabId });
                    sendResponse({ ok: true });
                } catch (e) {
                    console.warn('[Bilibili] DNR Cookie 注入失败:', e.message);
                    logExtEvent('bilibili', 'dnr-cookie-inject', { ok: false, error: e.message });
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'bilibili_clear_cookie_rules') {
            (async () => {
                try {
                    await chrome.declarativeNetRequest.updateSessionRules({
                        removeRuleIds: [9001, 9002, 9003, 9004]
                    });
                    sendResponse({ ok: true });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        // ========== v3.0.0: Offscreen 播放器消息 ==========

        if (message.action === 'offscreen_play') {
            (async () => {
                const _t = Date.now();
                try {
                    const resp = await sendToOffscreen({
                        command: 'play',
                        url: message.url,
                        songId: message.songId,
                        title: message.title,
                        artist: message.artist,
                        cover: message.cover,
                    });
                    logExtEvent('music', 'offscreen-play', { durationMs: Date.now() - _t, context: message.title || message.songId });
                    sendResponse(resp);
                } catch (e) {
                    logExtEvent('music', 'offscreen-play', { ok: false, durationMs: Date.now() - _t, error: e.message });
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'offscreen_command') {
            (async () => {
                try {
                    const { action: _, ...payload } = message;
                    const resp = await sendToOffscreen(payload);
                    sendResponse(resp);
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'offscreen_state_update') {
            chrome.runtime.sendMessage({
                action: 'music_state_from_offscreen',
                data: message.data
            }).catch(() => {});
            return false;
        }

        if (message.action === 'offscreen_error') {
            logExtEvent('music', 'playback-error', { ok: false, error: message.error, context: `code=${message.code}` });
            chrome.runtime.sendMessage({
                action: 'music_playback_error',
                error: message.error,
                code: message.code,
            }).catch(() => {});
            return false;
        }

        if (message.action === 'offscreen_track_ended') {
            logExtEvent('music', 'track-ended');
            chrome.runtime.sendMessage({ action: 'music_track_ended' }).catch(() => {});
            return false;
        }

        if (message.action === 'offscreen_media_action') {
            chrome.runtime.sendMessage({
                action: 'music_media_action',
                command: message.command
            }).catch(() => {});
            return false;
        }

        // ========== v3.0.0: 系统资源监控消息 ==========

        if (message.action === 'get_system_stats') {
            (async () => {
                try {
                    const stats = await getSystemStats();
                    sendResponse({ ok: true, data: stats });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'get_system_history') {
            (async () => {
                try {
                    const { sysMonitorHistory } = await chrome.storage.local.get('sysMonitorHistory');
                    sendResponse({ ok: true, data: sysMonitorHistory || [] });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        // ========== v3.1.0: 扩展事件日志查询 ==========

        if (message.action === 'get_ext_event_log') {
            (async () => {
                try {
                    const { extEventLog } = await chrome.storage.local.get('extEventLog');
                    const log = Array.isArray(extEventLog) ? extEventLog : [];
                    const cat = message.category;
                    const filtered = cat && cat !== 'all' ? log.filter(e => e.cat === cat) : log;
                    sendResponse({ ok: true, data: filtered });
                } catch (e) {
                    sendResponse({ ok: false, error: e.message });
                }
            })();
            return true;
        }

        if (message.action === 'clear_ext_event_log') {
            chrome.storage.local.set({ extEventLog: [] }).then(() => {
                sendResponse({ ok: true });
            }).catch(e => sendResponse({ ok: false, error: e.message }));
            return true;
        }

        // ========== v3.0.0: 温情提示消息 ==========

        if (message.action === 'get_warm_tip') {
            const tip = getRandomWarmTip(message.type || null);
            sendResponse({ ok: true, data: tip ? formatWarmTip(tip) : '', raw: tip });
            return false;
        }

        // ========== v3.0.0: 登录状态检查 ==========

        if (message.action === 'check_netease_login') {
            (async () => {
                try {
                    const cookieStr = await getNeteaseCookies();
                    if (!cookieStr || !cookieStr.includes('MUSIC_U')) {
                        logExtEvent('music', 'login-check', { ok: false, context: 'no-cookie' });
                        sendResponse({ ok: true, loggedIn: false, reason: 'no-cookie' });
                        return;
                    }
                    const profile = await neteaseApiCall('/api/nuser/account/get');
                    const loggedIn = !!profile?.account?.id;
                    logExtEvent('music', 'login-check', { context: loggedIn ? 'ok' : 'no-account' });
                    sendResponse({
                        ok: true,
                        loggedIn,
                        profile: profile?.profile || null,
                    });
                } catch (e) {
                    logExtEvent('music', 'login-check', { ok: false, error: e.message });
                    sendResponse({ ok: true, loggedIn: false, error: e.message, reason: 'api-error' });
                }
            })();
            return true;
        }

        if (message.action === 'study_progress_update') {
            chrome.tabs.query({ url: 'chrome://newtab/*' }, (tabs) => {
                for (const tab of tabs || []) {
                    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
                }
            });
            sendResponse({ ok: true });
            return false;
        }

        return false;
    });

    // ========== v3.15.0: B站跳转不再拦截，允许用户跳转到 B 站站内 ==========

    // 监听存储变化
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'sync' && changes.dailyTaskSettings) {
            console.log('任务设置已更改，重新初始化闹钟...');
            await initAlarms();
        }
        
        if (area === 'sync' && changes.keywordAlertSettings) {
            console.log('[KeywordAlert] 设置已更改，更新扫描闹钟...');
            const kwSettings = await getKeywordSettings();
            await chrome.alarms.clear('keyword-scan');
            if (kwSettings.enabled) {
                const interval = Math.max(1, kwSettings.scanInterval || 10);
                await chrome.alarms.create('keyword-scan', {
                    periodInMinutes: interval
                });
            }
        }
        
        if (area === 'local' && changes.memos) {
            console.log('任务数据已更改，更新任务提醒...');
            await setupTaskReminders();
            const oldLen = changes.memos.oldValue?.length || 0;
            const newLen = changes.memos.newValue?.length || 0;
            logExtEvent('storage', 'memos-write', { context: `${oldLen}→${newLen}` });
        }

        const ignoredKeys = new Set(['extEventLog', 'sysMonitorHistory', 'lastMusicState']);
        for (const key of Object.keys(changes)) {
            if (!ignoredKeys.has(key) && area === 'local' && key !== 'memos') {
                logExtEvent('storage', 'local-write', { context: key });
            }
        }
    });
})();
