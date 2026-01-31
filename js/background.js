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
    function getTodayDate() {
        return new Date().toISOString().split('T')[0];
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
        
        // 设置单个任务的提醒
        await setupTaskReminders();
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
                iconUrl: 'icons/icon128.png',
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
                iconUrl: 'icons/icon128.png',
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
            await chrome.notifications.create(`task-${taskId}`, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: '⏰ 任务提醒',
                message: `${priorityIcon}${task.title}\n截止: ${task.dueDate} ${task.dueTime || ''}`,
                priority: task.priority === 'high' ? 2 : 1,
                requireInteraction: true,
                buttons: [
                    { title: '✅ 完成' },
                    { title: '⏰ 推迟' }
                ]
            });
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
            task.dueDate = tomorrow.toISOString().split('T')[0];
            task.updatedAt = Date.now();
            task.overdueNotified = false;  // 重置过期通知标记
            await chrome.storage.local.set({ memos });
            console.log(`任务已推迟到明天: ${task.title}`);
            
            // 重新设置提醒
            await setupTaskReminders();
        }
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
