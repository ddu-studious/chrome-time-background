(function() {
    // 背景图片数据
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
            if (task.completed) continue;
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
        
        // 统计今日任务
        const todayTasks = memos.filter(task => 
            task.dueDate === today && !task.completed
        );
        
        // 统计过期任务
        const overdueTasks = memos.filter(task => 
            task.dueDate && task.dueDate < today && !task.completed
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
            !task.overdueNotified  // 避免重复通知
        );
        
        if (overdueTasks.length === 0) {
            console.log('没有新的过期任务');
            return;
        }
        
        // 发送过期任务通知
        try {
            await chrome.notifications.create('overdue-tasks', {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('icons/icon128.png'),
                title: '⚠️ 任务过期提醒',
                message: `您有 ${overdueTasks.length} 个任务已过期，请及时处理`,
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

    // ==================== 事件监听 ====================

    // 监听扩展图标点击事件
    chrome.action.onClicked.addListener(() => {
        // 创建新标签页
        chrome.tabs.create({ url: 'index.html' });
    });

    // 监听安装/更新事件
    chrome.runtime.onInstalled.addListener(async (details) => {
        console.log('Chrome Time Extension installed/updated:', details.reason);
        
        // 设置卸载页面 URL - 提醒用户数据已丢失
        // 使用 GitHub Pages 托管卸载页面
        try {
            chrome.runtime.setUninstallURL('https://ddu-studious.github.io/chrome-time-background/uninstall.html');
            console.log('卸载页面 URL 已设置');
        } catch (error) {
            console.warn('设置卸载页面失败:', error);
        }
        
        // 初始化默认设置
        if (details.reason === 'install') {
            await chrome.storage.sync.set({
                dailyTaskSettings: {
                    enableNotifications: true,
                    defaultReminderTime: '09:00',
                    showOverdueFirst: true,
                    reminderAdvanceMinutes: 30
                }
            });
            
            // 初始化备份设置
            await chrome.storage.local.set({
                backupSettings: {
                    autoRemindBackup: true,
                    lastBackupDate: null,
                    backupReminderDays: 7  // 每7天提醒一次
                }
            });
        }
        
        // 初始化闹钟
        await initAlarms();
    });

    // 监听浏览器启动事件
    chrome.runtime.onStartup.addListener(async () => {
        console.log('浏览器启动，重新初始化闹钟...');
        await initAlarms();
    });

    // 监听闹钟事件
    chrome.alarms.onAlarm.addListener(async (alarm) => {
        console.log('闹钟触发:', alarm.name);
        
        switch (alarm.name) {
            case 'daily-summary':
                await sendDailySummary();
                break;
            case 'check-overdue':
                await checkOverdueTasks();
                break;
            case 'check-backup-reminder':
                await checkBackupReminder();
                break;
            case 'reset-daily-habits':
                await resetDailyHabits();
                break;
            default:
                // 处理单个任务提醒
                if (alarm.name.startsWith('task-reminder-')) {
                    const taskId = alarm.name.replace('task-reminder-', '');
                    await sendTaskReminder(taskId);
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
        
        // 打开新标签页
        await chrome.tabs.create({ url: 'chrome://newtab/' });
        
        // 清除通知
        await chrome.notifications.clear(notificationId);
    });

    // 监听消息事件
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'getBackgrounds') {
            (async () => {
                try {
                    const dynamic = await getDynamicBackgrounds();
                    if (dynamic && dynamic.length > 0) {
                        sendResponse({ backgrounds: dynamic, source: 'dynamic' });
                        return;
                    }
                } catch (e) {
                    // ignore and fallback
                }

                // 兜底：继续使用当前内置背景源
                sendResponse({ backgrounds: backgrounds, source: 'fallback' });
            })();
            return true; // 异步响应
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
        
        return false;
    });

    // 监听存储变化
    chrome.storage.onChanged.addListener(async (changes, area) => {
        if (area === 'sync' && changes.dailyTaskSettings) {
            console.log('任务设置已更改，重新初始化闹钟...');
            await initAlarms();
        }
        
        if (area === 'local' && changes.memos) {
            console.log('任务数据已更改，更新任务提醒...');
            await setupTaskReminders();
        }
    });
})();
