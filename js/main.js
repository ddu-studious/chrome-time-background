// ==================== Chrome 148 书签栏 Bug 修复 ====================
(function hideBookmarkBar() {
    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.inset = '0';
    const mo = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                const tag = node.tagName?.toLowerCase();
                if (tag === 'iframe' || tag === 'div') {
                    const id = (node.id || '').toLowerCase();
                    const cls = (node.className || '').toLowerCase();
                    if (id.includes('bookmark') || cls.includes('bookmark') ||
                        id.includes('ntp') || cls.includes('ntp')) {
                        node.style.cssText = 'display:none!important;height:0!important;visibility:hidden!important;';
                    }
                }
            }
        }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
})();

// ==================== 背景系统（v3.16.0 多源 + 视频 + 定时切换）====================

let backgroundImages = [];
let _bgAutoSwitchTimer = null;
let _activeBackground = null;

chrome.runtime.sendMessage({ action: 'getBackgrounds' }, function(response) {
    if (response && response.backgrounds) {
        backgroundImages = response.backgrounds;
        initBackgrounds();
        setupBackgroundAutoSwitch();
    }
});

function _getVideoElement() {
    let el = document.getElementById('background-video');
    if (!el) {
        el = document.createElement('video');
        el.id = 'background-video';
        el.autoplay = true;
        el.muted = true;
        el.loop = true;
        el.playsInline = true;
        el.preload = 'metadata';
        el.disablePictureInPicture = true;
        document.body.prepend(el);
    }
    return el;
}

function _applyBackground(background) {
    if (!background) return;
    _activeBackground = background;
    const video = _getVideoElement();
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const saveData = navigator.connection?.saveData === true;
    const useVideo = background.mediaType === 'video' && background.videoUrl && !reduceMotion && !saveData;

    const applyStaticFallback = () => {
        video.onerror = null;
        video.pause();
        video.removeAttribute('src');
        video.load?.();
        video.style.display = 'none';
        document.body.dataset.backgroundMedia = 'image';
        const staticUrl = background.url || background.thumbnailUrl || '';
        if (staticUrl) document.body.style.backgroundImage = `url(${staticUrl})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        window.bgEffectsManager?.setSuspended?.(false);
    };

    if (useVideo) {
        document.body.style.backgroundImage = 'none';
        video.onerror = () => {
            if (_activeBackground === background) applyStaticFallback();
        };
        video.src = background.videoUrl;
        video.poster = background.url || '';
        video.style.display = 'block';
        document.body.dataset.backgroundMedia = 'video';
        window.bgEffectsManager?.setSuspended?.(true);
        video.play().catch(() => {
            if (_activeBackground === background) applyStaticFallback();
        });
    } else {
        video.onerror = null;
        applyStaticFallback();
    }

    if (window.adaptiveOverlay && background.url) {
        window.adaptiveOverlay.analyzeAndApply(background.url);
    }

    const creditElement = document.getElementById('background-credit');
    if (creditElement) {
        const licenseHtml = background.licenseUrl
            ? ` · <a href="${background.licenseUrl}" target="_blank" rel="noreferrer">许可</a>`
            : '';
        const photographerText = background.photographer ? `摄影/来源：${background.photographer}` : '';
        const sourceTag = background.source && background.source !== 'fallback'
            ? `<span class="bg-source-tag">${background.source}</span> ` : '';
        creditElement.innerHTML = `
            ${sourceTag}<span class="location">${background.location || ''}</span>${background.location && background.description ? ' - ' : ''}
            <span class="description" title="${photographerText}">${background.description || ''}</span>
            ${licenseHtml}
        `;
    }
}

function initBackgrounds() {
    if (backgroundImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * backgroundImages.length);
        _applyBackground(backgroundImages[randomIndex]);
    }
}

function changeBackground() {
    if (backgroundImages.length > 0) {
        const randomIndex = Math.floor(Math.random() * backgroundImages.length);
        _applyBackground(backgroundImages[randomIndex]);
    }
}

function setupBackgroundAutoSwitch() {
    if (_bgAutoSwitchTimer) { clearInterval(_bgAutoSwitchTimer); _bgAutoSwitchTimer = null; }

    chrome.storage.sync.get('settings', ({ settings }) => {
        const minutes = Number(settings?.backgroundInterval) || 30;
        _bgAutoSwitchTimer = setInterval(() => {
            if (backgroundImages.length > 1) changeBackground();
        }, minutes * 60 * 1000);
    });
}

document.addEventListener('visibilitychange', () => {
    const video = document.getElementById('background-video');
    if (!video) return;
    if (document.hidden) { video.pause(); } else if (video.src) { video.play().catch(() => {}); }
});

window.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => {
    if (_activeBackground) _applyBackground(_activeBackground);
});

// 注意：时间显示已由 clock.js 模块处理，此处不再重复更新
// 避免多处同时更新导致的闪烁问题

// 初始化应用
async function initApp() {
    if (window.__chromeTimeAppInitialized) return;
    window.__chromeTimeAppInitialized = true;
    console.log('正在初始化应用...');

    // 关键：无论其他模块是否初始化失败，按钮/快捷键都必须可用
    try {
        setupKeyboardShortcuts();
        console.log('键盘快捷键设置完成');
    } catch (e) {
        console.error('键盘快捷键设置失败:', e);
    }

    // 各模块独立初始化，避免单点失败影响全局
    try {
        await window.settingsManager.init();
        console.log('设置管理器初始化完成');
    } catch (error) {
        console.error('设置管理器初始化失败:', error);
    }

    try {
        window.i18nManager.init();
        console.log('国际化模块初始化完成');
    } catch (error) {
        console.error('国际化模块初始化失败:', error);
    }

    try {
        clockManager.init();
        console.log('时钟模块初始化完成');
    } catch (error) {
        console.error('时钟模块初始化失败:', error);
    }

    try {
        holidayManager.init();
        console.log('节假日模块初始化完成');
    } catch (error) {
        console.error('节假日模块初始化失败:', error);
    }

    try {
        await weatherManager.init();
        console.log('天气模块初始化完成');
    } catch (error) {
        console.error('天气模块初始化失败:', error);
    }

    try {
        // 不 await：避免阻塞其它功能；内部会自处理加载与UI创建
        if (window.memoManager && typeof window.memoManager.init === 'function') {
            window.memoManager.init();
        } else {
            console.warn('备忘录模块未就绪：window.memoManager 不存在或 init 不是函数');
        }
        console.log('备忘录模块初始化完成');
    } catch (error) {
        console.error('备忘录模块初始化失败:', error);
    }

    // v3.4.0: 读取性能开关设置，按需初始化模块
    const sm = window.settingsManager;

    // 初始化知识墙
    if (sm.getSetting('enableKnowledgeWall') !== false) {
        try {
            if (window.knowledgeWall && typeof window.knowledgeWall.init === 'function') {
                window.knowledgeWall.init();
            }
            console.log('知识墙模块初始化完成');
        } catch (error) {
            console.error('知识墙模块初始化失败:', error);
        }
    } else {
        console.log('知识墙模块已禁用（性能设置）');
    }

    // 初始化滚动信息栏（延迟加载，不阻塞主功能）
    if (sm.getSetting('enableTicker') !== false) {
        try {
            if (window.techTicker && typeof window.techTicker.init === 'function') {
                window.techTicker.init();
            }
            console.log('滚动信息栏初始化完成');
        } catch (error) {
            console.error('滚动信息栏初始化失败:', error);
        }
    } else {
        console.log('热搜资讯模块已禁用（性能设置）');
        document.getElementById('tech-ticker')?.classList.add('hidden');
    }

    // 初始化任务滚动提醒条
    if (sm.getSetting('enableTaskTicker') !== false) {
        try {
            if (window.taskTicker && typeof window.taskTicker.init === 'function') {
                window.taskTicker.init();
            }
            console.log('任务提醒条初始化完成');
        } catch (error) {
            console.error('任务提醒条初始化失败:', error);
        }
    } else {
        console.log('任务提醒条已禁用（性能设置）');
        document.getElementById('task-ticker')?.classList.add('hidden');
    }

    // 初始化音乐控制器
    if (sm.getSetting('enableMusic') !== false) {
        try {
            if (window.musicController && typeof window.musicController.init === 'function') {
                window.musicController.init();
            }
            const musicDockBtn = document.getElementById('music-dock-btn');
            if (musicDockBtn) {
                musicDockBtn.addEventListener('click', () => {
                    if (window.musicController) window.musicController.toggle();
                });
            }
            console.log('音乐控制器初始化完成');
        } catch (error) {
            console.error('音乐控制器初始化失败:', error);
        }
    } else {
        console.log('音乐播放器已禁用（性能设置）');
        document.getElementById('music-dock-btn')?.classList.add('hidden');
    }


    // v3.6.0: 初始化哔哩哔哩控制器
    if (sm.getSetting('enableBilibili') !== false) {
        try {
            if (window.bilibiliController && typeof window.bilibiliController.init === 'function') {
                window.bilibiliController.init();
            }
            const biliDockBtn = document.getElementById('bili-dock-btn');
            if (biliDockBtn) {
                biliDockBtn.addEventListener('click', () => {
                    if (window.bilibiliController) window.bilibiliController.toggle();
                });
            }
            console.log('哔哩哔哩控制器初始化完成');
        } catch (error) {
            console.error('哔哩哔哩控制器初始化失败:', error);
        }
    } else {
        console.log('哔哩哔哩模块已禁用（性能设置）');
        document.getElementById('bili-dock-btn')?.classList.add('hidden');
    }

    // YouTube 官方集成：访客可粘贴链接播放；账号数据只走 OAuth/Data API
    if (sm.getSetting('enableYouTube') !== false) {
        try {
            if (window.youtubeController && typeof window.youtubeController.init === 'function') {
                await window.youtubeController.init();
            }
            const youtubeDockBtn = document.getElementById('youtube-dock-btn');
            if (youtubeDockBtn) {
                youtubeDockBtn.addEventListener('click', () => window.youtubeController?.toggle());
            }
            console.log('YouTube 工作台初始化完成');
        } catch (error) {
            console.error('YouTube 工作台初始化失败:', error);
        }
    } else {
        console.log('YouTube 模块已禁用（用户设置）');
        document.getElementById('youtube-dock-btn')?.classList.add('hidden');
    }

    // 初始化每日计划
    if (sm.getSetting('enableSchedule') !== false) {
        try {
            if (window.scheduleManager && typeof window.scheduleManager.init === 'function') {
                await window.scheduleManager.init();
            }
            const scheduleDockBtn = document.getElementById('schedule-dock-btn');
            if (scheduleDockBtn) {
                scheduleDockBtn.addEventListener('click', () => {
                    if (window.scheduleManager) {
                        window.scheduleManager.toggle();
                        scheduleDockBtn.classList.toggle('active', window.scheduleManager._panelOpen);
                    }
                });
            }
            console.log('每日计划初始化完成');
        } catch (error) {
            console.error('每日计划初始化失败:', error);
        }
    } else {
        console.log('每日计划已禁用（用户设置）');
        document.getElementById('schedule-dock-btn')?.classList.add('hidden');
    }

    // 初始化工作日志
    if (sm.getSetting('enableWorklog') !== false) {
        try {
            if (window.workLogManager && typeof window.workLogManager.init === 'function') {
                await window.workLogManager.init();
            }
            const worklogDockBtn = document.getElementById('worklog-dock-btn');
            if (worklogDockBtn) {
                worklogDockBtn.addEventListener('click', () => {
                    if (window.workLogManager) {
                        window.workLogManager.toggle();
                        worklogDockBtn.classList.toggle('active', window.workLogManager._panelOpen);
                    }
                });
            }
            console.log('工作日志初始化完成');
        } catch (error) {
            console.error('工作日志初始化失败:', error);
        }
    } else {
        console.log('工作日志已禁用（用户设置）');
        document.getElementById('worklog-dock-btn')?.classList.add('hidden');
    }

    // 初始化写作空间（博客模块）
    if (sm.getSetting('enableBlog') !== false) {
        try {
            if (window.blogManager && typeof window.blogManager.init === 'function') {
                await window.blogManager.init();
            }
            const blogDockBtn = document.getElementById('blog-dock-btn');
            if (blogDockBtn) {
                blogDockBtn.addEventListener('click', () => {
                    if (window.blogManager) {
                        window.blogManager.toggle();
                        blogDockBtn.classList.toggle('active', window.blogManager.isOpen);
                    }
                });
            }
            console.log('写作空间初始化完成');
        } catch (error) {
            console.error('写作空间初始化失败:', error);
        }
    } else {
        console.log('写作空间已禁用（用户设置）');
        document.getElementById('blog-dock-btn')?.classList.add('hidden');
    }

    // v3.16.0: 初始化 Cursor Bridge Agent 面板
    try {
        if (window.CursorBridgeClient) {
            window.cursorBridge = new window.CursorBridgeClient();
            await window.cursorBridge.init();
            const agentDockBtn = document.getElementById('agent-dock-btn');
            if (agentDockBtn) {
                agentDockBtn.addEventListener('click', () => {
                    window.cursorBridge.toggle();
                });
            }
            console.log('Cursor Bridge Agent 面板初始化完成');
        }
    } catch (error) {
        console.error('Cursor Bridge 初始化失败:', error);
    }

    // Chatbot 终端对话模块
    try {
        const chatbotDockBtn = document.getElementById('chatbot-dock-btn');
        if (chatbotDockBtn && window.Chatbot) {
            chatbotDockBtn.addEventListener('click', () => {
                window.Chatbot.toggle();
            });
            console.log('Chatbot 模块初始化完成');
        }
    } catch (error) {
        console.error('Chatbot 初始化失败:', error);
    }

    // v3.0.0: 初始化系统监控
    if (sm.getSetting('enableSystemMonitor') !== false) {
        try {
            initSystemMonitor();
            console.log('系统监控初始化完成');
        } catch (error) {
            console.error('系统监控初始化失败:', error);
        }
    } else {
        console.log('系统监控已禁用（性能设置）');
        document.getElementById('sys-monitor-toggle')?.classList.add('hidden');
    }

    // v3.0.0: 初始化诗词电台
    if (sm.getSetting('enableWarmTip') !== false) {
        try {
            initPoetryRadio();
            const poetryDockBtn = document.getElementById('poetry-dock-btn');
            if (poetryDockBtn) {
                poetryDockBtn.addEventListener('click', () => {
                    if (window.PoetryRadioV5?.toggleMini) window.PoetryRadioV5.toggleMini();
                    else {
                        const el = document.getElementById('poetry-radio');
                        if (el) el.classList.toggle('poetry-dock-open');
                    }
                });
            }
            console.log('诗词电台初始化完成');
        } catch (error) {
            console.error('诗词电台初始化失败:', error);
        }
    } else {
        console.log('温情提示已禁用（性能设置）');
        document.getElementById('poetry-dock-btn')?.classList.add('hidden');
    }

    // 初始化背景交互特效
    if (sm.getSetting('enableBgEffects') !== false) {
        try {
            if (window.bgEffectsManager && typeof window.bgEffectsManager.init === 'function') {
                await window.bgEffectsManager.init();
            }
            console.log('背景特效初始化完成');
        } catch (error) {
            console.error('背景特效初始化失败:', error);
        }
    } else {
        console.log('背景特效已禁用（性能设置）');
    }

    // 极简模式初始化
    try {
        await zenMode.init();
        console.log('极简模式初始化完成');
    } catch (error) {
        console.error('极简模式初始化失败:', error);
    }

    console.log('应用初始化完成（可能部分模块降级）');
}

// ===================== v3.0.0: 系统监控 =====================

function initSystemMonitor() {
    const toggle = document.getElementById('sys-monitor-toggle');
    const panel = document.getElementById('sys-monitor-panel');
    const close = document.getElementById('sys-monitor-close');
    if (!toggle || !panel) return;

    toggle.addEventListener('click', () => {
        panel.classList.toggle('hidden');
        if (!panel.classList.contains('hidden')) {
            refreshSystemStats();
        }
    });
    close?.addEventListener('click', () => panel.classList.add('hidden'));

    let cpuHistory = [];

    async function refreshSystemStats() {
        try {
            const resp = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'get_system_stats' }, resolve);
            });
            if (!resp?.ok || !resp.data) return;
            const { cpu, memory, storage } = resp.data;

            if (cpu) {
                const totalIdle = cpu.processors.reduce((s, p) => s + p.idle, 0);
                const totalAll = cpu.processors.reduce((s, p) => s + p.total, 0);
                let usagePercent = 0;

                if (window._lastCpuTotal && window._lastCpuIdle) {
                    const deltaTotal = totalAll - window._lastCpuTotal;
                    const deltaIdle = totalIdle - window._lastCpuIdle;
                    usagePercent = deltaTotal > 0 ? Math.round((1 - deltaIdle / deltaTotal) * 100) : 0;
                }
                window._lastCpuTotal = totalAll;
                window._lastCpuIdle = totalIdle;

                const cpuFill = document.getElementById('sys-cpu-fill');
                const cpuVal = document.getElementById('sys-cpu-value');
                if (cpuFill) {
                    cpuFill.style.width = usagePercent + '%';
                    cpuFill.dataset.level = usagePercent > 85 ? 'danger' : usagePercent > 65 ? 'warning' : '';
                }
                if (cpuVal) cpuVal.textContent = usagePercent + '%';

                cpuHistory.push(usagePercent);
                if (cpuHistory.length > 30) cpuHistory.shift();
                drawCpuChart(cpuHistory);
            }

            if (memory) {
                const memFill = document.getElementById('sys-mem-fill');
                const memVal = document.getElementById('sys-mem-value');
                const pct = memory.usagePercent;
                if (memFill) {
                    memFill.style.width = pct + '%';
                    memFill.dataset.level = pct > 85 ? 'danger' : pct > 70 ? 'warning' : '';
                }
                const usedGB = (memory.used / (1024 ** 3)).toFixed(1);
                const totalGB = (memory.total / (1024 ** 3)).toFixed(1);
                if (memVal) memVal.textContent = `${usedGB}/${totalGB}G`;
            }

            if (storage && storage.length > 0) {
                const disk = storage[0];
                const diskFill = document.getElementById('sys-disk-fill');
                const diskVal = document.getElementById('sys-disk-value');
                const totalGB = (disk.capacity / (1024 ** 3)).toFixed(0);
                if (diskFill) diskFill.style.width = '0%';
                if (diskVal) diskVal.textContent = totalGB + 'GB';
            }

            const extFill = document.getElementById('sys-ext-mem-fill');
            const extVal = document.getElementById('sys-ext-mem-value');
            let extMem = resp.data.extMemory;
            if (!extMem && performance?.memory) {
                extMem = {
                    jsHeapUsed: performance.memory.usedJSHeapSize,
                    jsHeapTotal: performance.memory.totalJSHeapSize,
                    jsHeapLimit: performance.memory.jsHeapSizeLimit,
                };
            }
            if (extMem) {
                const usedMB = (extMem.jsHeapUsed / (1024 ** 2)).toFixed(1);
                const pct = Math.round((extMem.jsHeapUsed / extMem.jsHeapLimit) * 100);
                if (extFill) {
                    extFill.style.width = pct + '%';
                    extFill.dataset.level = pct > 60 ? 'warning' : '';
                }
                if (extVal) extVal.textContent = `${usedMB}MB`;
            }
        } catch (e) {
            console.warn('系统监控刷新失败:', e);
        }
    }

    function drawCpuChart(data) {
        const canvas = document.getElementById('sys-cpu-chart');
        if (!canvas) return;
        const detail = document.getElementById('sys-cpu-detail');
        if (detail) detail.classList.remove('hidden');

        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (data.length < 2) return;

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(167, 139, 250, 0.3)');
        grad.addColorStop(1, 'rgba(167, 139, 250, 0.02)');

        ctx.beginPath();
        ctx.moveTo(0, h);
        data.forEach((val, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (val / 100) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        data.forEach((val, i) => {
            const x = (i / (data.length - 1)) * w;
            const y = h - (val / 100) * h;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    setInterval(() => {
        if (!panel.classList.contains('hidden')) {
            refreshSystemStats();
            refreshTimeline();
        }
    }, 3000);

    // v3.2.1: 扩展活动时间线（可读化事件描述）
    let _activeFilter = 'all';
    const CAT_ICONS = { music: 'fa-music', network: 'fa-globe', task: 'fa-tasks', alarm: 'fa-bell', storage: 'fa-database', system: 'fa-cog' };
    const EVT_LABELS = {
        'offscreen-play': '播放歌曲', 'track-ended': '播放结束', 'playback-error': '播放出错',
        'login-check': '登录检测', 'netease-api': '网易云接口', 'stats-sample': '资源采集',
        'reminder-fired': '任务提醒', 'daily-summary': '每日摘要', 'storage-write': '数据保存',
        'memo-write': '备忘录保存', 'keyword-scan': '关键字扫描', 'warm-tip': '温情提示',
        'tabs-detect': '标签页检测', 'offscreen-init': '播放引擎初始化',
    };

    const filterBtns = panel.querySelectorAll('.ext-filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _activeFilter = btn.dataset.cat;
            refreshTimeline();
        });
    });

    panel.querySelector('#ext-timeline-clear')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clear_ext_event_log' }, () => refreshTimeline());
    });

    function refreshTimeline() {
        chrome.runtime.sendMessage({ action: 'get_ext_event_log', category: _activeFilter }, (resp) => {
            const list = panel.querySelector('#ext-timeline-list');
            const countEl = panel.querySelector('#ext-timeline-count');
            if (!resp?.ok || !list) return;
            const events = resp.data || [];
            if (countEl) countEl.textContent = events.length + ' 条';
            if (events.length === 0) {
                list.innerHTML = '<div class="ext-timeline-empty">暂无活动记录</div>';
                return;
            }
            const rows = events.slice(-50).reverse().map(e => {
                const t = new Date(e.ts);
                const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
                const icon = CAT_ICONS[e.cat] || 'fa-circle';
                const label = EVT_LABELS[e.act] || e.act;
                let badge = '';
                if (e.err) badge = `<span class="ext-evt-badge fail" title="${escHtml(e.err)}">失败</span>`;
                else if (e.ms > 2000) badge = `<span class="ext-evt-badge slow">${(e.ms / 1000).toFixed(1)}s</span>`;
                else if (e.ms > 0) badge = `<span class="ext-evt-badge ok">${e.ms}ms</span>`;
                else badge = '';
                const ctx = e.ctx ? formatCtx(e.ctx) : '';
                return `<div class="ext-evt-row${e.err ? ' ext-evt-error' : ''}"><span class="ext-evt-time">${time}</span><span class="ext-evt-icon" data-cat="${e.cat}"><i class="fas ${icon}"></i></span><span class="ext-evt-action">${escHtml(label)}</span><span class="ext-evt-ctx">${ctx}</span>${badge}</div>`;
            }).join('');
            list.innerHTML = rows;
        });
    }

    function formatCtx(ctx) {
        const s = String(ctx);
        if (s.startsWith('/api/')) return escHtml(s.split('/').pop());
        if (s.startsWith('memo_')) return '备忘录';
        if (s.length > 20) return escHtml(s.slice(0, 18) + '…');
        return escHtml(s);
    }
    function escHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
}

// ===================== v3.0.0: 诗词电台 =====================

function initPoetryRadio() {
    const bar = document.getElementById('poetry-radio');
    if (!bar) return;

    const state = {
        poems: [],
        favorites: [],
        lineFavorites: [],
        currentIndex: 0,
        playing: false,
        mode: 'sequential',
        speed: 1,
        pitch: 1,
        voiceName: '',
        pauseStyle: 'natural',
        backgroundSound: 'none',
        sleepMinutes: 0,
        currentLineIndex: 0,
        utterance: null,
        autoPlayTimer: null,
        sleepTimer: null,
        ambientAudio: null,
    };
    let poetryWorkspacePage = 'full-text';
    let poetryWorkspaceReturnFocus = null;
    let poetryBackgroundInertSiblings = [];
    let poetryAnnotationTab = 'translation';
    let poetryFavoriteQuery = '';
    let poetryFavoriteDynasty = 'all';
    let poetrySettingsDraft = null;

    const els = {
        text: document.getElementById('pr-text'),
        author: document.getElementById('pr-author'),
        icon: document.getElementById('pr-icon'),
        playBtn: document.getElementById('pr-play'),
        prevBtn: document.getElementById('pr-prev'),
        nextBtn: document.getElementById('pr-next'),
        favBtn: document.getElementById('pr-fav'),
        speedSel: document.getElementById('pr-speed'),
        modeBtn: document.getElementById('pr-mode'),
        progressBar: document.getElementById('pr-progress-bar'),
        progressText: document.getElementById('pr-progress-text'),
        status: document.getElementById('pr-status'),
    };

    async function loadPoems() {
        try {
            const resp = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'get_poetry_list' }, resolve);
            });
            if (resp?.ok && Array.isArray(resp.data)) {
                state.poems = resp.data;
            }
        } catch { /* ignore */ }

        if (state.poems.length === 0) {
            if (els.text) els.text.textContent = '诗词加载中…';
            return;
        }

        try {
            const storage = chrome?.storage?.local;
            if (storage) {
                const r = await storage.get(['poetry_favorites', 'poetry_line_favorites', 'poetry_index', 'poetry_mode', 'poetry_speed', 'poetry_pitch', 'poetry_voice', 'poetry_pause_style', 'poetry_background_sound', 'poetry_sleep_minutes']);
                state.favorites = r.poetry_favorites || [];
                state.lineFavorites = r.poetry_line_favorites || [];
                state.currentIndex = r.poetry_index || 0;
                state.mode = r.poetry_mode || 'sequential';
                state.speed = r.poetry_speed || 1;
                state.pitch = r.poetry_pitch || 1;
                state.voiceName = r.poetry_voice || '';
                state.pauseStyle = r.poetry_pause_style || 'natural';
                state.backgroundSound = r.poetry_background_sound || 'none';
                state.sleepMinutes = Number(r.poetry_sleep_minutes) || 0;
            }
        } catch { /* ignore */ }

        if (state.currentIndex >= state.poems.length) state.currentIndex = 0;
        if (els.speedSel) els.speedSel.value = String(state.speed);
        updateModeIcon();
        renderCurrent();
    }

    function renderCurrent() {
        const poem = state.poems[state.currentIndex];
        if (!poem) return;

        const lineCount = Math.max(1, poem.lines.length);
        state.currentLineIndex = Math.min(Math.max(0, Number(state.currentLineIndex) || 0), lineCount - 1);
        const currentLine = poem.lines[state.currentLineIndex] || poem.lines[0] || '';
        if (els.text) els.text.textContent = `《${poem.title}》 · ${currentLine}`;
        if (els.author) els.author.textContent = `${poem.dynasty} · ${poem.author}`;
        if (els.icon) els.icon.textContent = '📜';
        const openButton = document.getElementById('pr-open-workspace');
        openButton?.setAttribute('aria-label', `打开《${poem.title}》全文`);
        const progress = ((state.currentLineIndex + 1) / lineCount) * 100;
        if (els.progressBar) els.progressBar.style.width = `${progress}%`;
        if (els.progressText) els.progressText.textContent = `第 ${state.currentLineIndex + 1} / ${lineCount} 句`;
        updateFavIcon();
    }

    function announcePoetry(message) {
        if (els.status) els.status.textContent = message;
    }

    function stopPoetryAmbient() {
        const ambient = state.ambientAudio;
        if (!ambient) return;
        try { ambient.source.stop(); } catch { /* already stopped */ }
        ambient.context.close?.();
        state.ambientAudio = null;
    }

    function startPoetryAmbient(kind) {
        stopPoetryAmbient();
        if (kind === 'none') return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        try {
            const context = new AudioContextClass();
            const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
            const source = context.createBufferSource();
            const filter = context.createBiquadFilter();
            const gain = context.createGain();
            source.buffer = buffer;
            source.loop = true;
            filter.type = kind === 'rain' ? 'highpass' : 'lowpass';
            filter.frequency.value = kind === 'rain' ? 900 : 520;
            gain.gain.value = kind === 'rain' ? 0.018 : 0.012;
            source.connect(filter).connect(gain).connect(context.destination);
            source.start();
            state.ambientAudio = { context, source };
        } catch { /* ambient sound is optional */ }
    }

    function schedulePoetrySleepTimer() {
        clearTimeout(state.sleepTimer);
        state.sleepTimer = null;
        if (!state.sleepMinutes) return;
        state.sleepTimer = setTimeout(() => {
            state.playing = false;
            stop();
            updatePlayIcon();
            announcePoetry(`${state.sleepMinutes} 分钟定时已结束，朗读已停止`);
            if (document.getElementById('poetry-v5-panel')?.classList.contains('visible')) renderWorkspace(poetryWorkspacePage);
        }, state.sleepMinutes * 60 * 1000);
    }

    function play(settings = null) {
        stop();
        const poem = state.poems[state.currentIndex];
        if (!poem) return;
        if (!('speechSynthesis' in window)) {
            state.playing = false;
            updatePlayIcon();
            announcePoetry('当前浏览器不支持本地语音朗读');
            return;
        }

        const lineStart = Math.min(Math.max(0, Number(state.currentLineIndex) || 0), Math.max(0, poem.lines.length - 1));
        const spokenLines = poem.lines.slice(lineStart);
        const prefix = `${poem.title}。${poem.author}。`;
        const pauseStyle = settings?.pauseStyle ?? state.pauseStyle;
        const pauseMark = { short: '，', natural: '。', long: '……' }[pauseStyle] || '。';
        const fullText = `${prefix}${spokenLines.join(pauseMark)}`;
        state.utterance = new SpeechSynthesisUtterance(fullText);
        state.utterance.lang = 'zh-CN';
        state.utterance.rate = settings?.speed ?? state.speed;
        state.utterance.pitch = settings?.pitch ?? state.pitch;

        const voices = speechSynthesis.getVoices();
        const requestedVoice = settings?.voiceName ?? state.voiceName;
        const zhVoice = voices.find(v => requestedVoice && v.name === requestedVoice)
            || voices.find(v => v.lang.startsWith('zh') && v.name.includes('female'))
            || voices.find(v => v.lang.startsWith('zh'));
        if (zhVoice) state.utterance.voice = zhVoice;

        const lineOffsets = [];
        let offset = prefix.length;
        spokenLines.forEach((line, index) => {
            lineOffsets.push({ start: offset, lineIndex: lineStart + index });
            offset += line.length + 1;
        });
        state.utterance.onboundary = event => {
            const matched = [...lineOffsets].reverse().find(item => event.charIndex >= item.start);
            if (!matched || matched.lineIndex === state.currentLineIndex) return;
            state.currentLineIndex = matched.lineIndex;
            renderCurrent();
            if (document.getElementById('poetry-v5-panel')?.classList.contains('visible')) renderWorkspace(poetryWorkspacePage);
        };

        state.utterance.onend = () => {
            if (state.playing) {
                state.autoPlayTimer = setTimeout(() => nextPoem(true), 1500);
            }
        };

        state.utterance.onerror = () => {
            state.playing = false;
            updatePlayIcon();
        };

        speechSynthesis.speak(state.utterance);
        startPoetryAmbient(settings?.backgroundSound ?? state.backgroundSound);
        state.playing = true;
        updatePlayIcon();
        announcePoetry(`正在朗读《${poem.title}》第 ${state.currentLineIndex + 1} 句`);
    }

    function stop() {
        clearTimeout(state.autoPlayTimer);
        if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.cancel();
        stopPoetryAmbient();
        state.utterance = null;
    }

    function togglePlay() {
        if (state.playing) {
            state.playing = false;
            stop();
        } else {
            play();
        }
        updatePlayIcon();
    }

    function nextPoem(autoAdvance) {
        if (state.mode === 'single' && autoAdvance) {
            renderCurrent();
            saveState();
            play();
            return;
        }
        if (state.mode === 'random') {
            state.currentIndex = Math.floor(Math.random() * state.poems.length);
        } else {
            state.currentIndex = (state.currentIndex + 1) % state.poems.length;
        }
        state.currentLineIndex = 0;
        renderCurrent();
        saveState();
        if (state.playing || autoAdvance) play();
    }

    function prevPoem() {
        if (state.mode === 'random') {
            state.currentIndex = Math.floor(Math.random() * state.poems.length);
        } else {
            state.currentIndex = (state.currentIndex - 1 + state.poems.length) % state.poems.length;
        }
        state.currentLineIndex = 0;
        renderCurrent();
        saveState();
        if (state.playing) play();
    }

    function toggleFav() {
        const poem = state.poems[state.currentIndex];
        if (!poem) return;
        const key = `${poem.title}-${poem.author}`;
        const idx = state.favorites.indexOf(key);
        if (idx >= 0) {
            state.favorites.splice(idx, 1);
        } else {
            state.favorites.push(key);
        }
        updateFavIcon();
        saveState();
    }

    function toggleMode() {
        const modes = ['sequential', 'random', 'single'];
        const i = modes.indexOf(state.mode);
        state.mode = modes[(i + 1) % modes.length];
        updateModeIcon();
        saveState();
    }

    function updatePlayIcon() {
        if (!els.playBtn) return;
        const icon = els.playBtn.querySelector('i');
        if (icon) {
            icon.className = state.playing ? 'fas fa-pause' : 'fas fa-play';
        }
        els.playBtn.classList.toggle('active', state.playing);
        els.playBtn.setAttribute('aria-pressed', String(state.playing));
        els.playBtn.setAttribute('aria-label', state.playing ? '暂停朗读' : '开始朗读');
    }

    function updateFavIcon() {
        if (!els.favBtn) return;
        const poem = state.poems[state.currentIndex];
        if (!poem) return;
        const key = `${poem.title}-${poem.author}`;
        const isFav = state.favorites.includes(key);
        const icon = els.favBtn.querySelector('i');
        if (icon) icon.className = isFav ? 'fas fa-heart' : 'far fa-heart';
        els.favBtn.classList.toggle('active', isFav);
        els.favBtn.setAttribute('aria-pressed', String(isFav));
        els.favBtn.setAttribute('aria-label', isFav ? `取消收藏《${poem.title}》` : `收藏《${poem.title}》`);
    }

    function updateModeIcon() {
        if (!els.modeBtn) return;
        const iconMap = { sequential: 'fa-list-ol', random: 'fa-random', single: 'fa-redo' };
        const titleMap = { sequential: '顺序播放', random: '随机播放', single: '单曲循环' };
        const icon = els.modeBtn.querySelector('i');
        if (icon) icon.className = `fas ${iconMap[state.mode] || 'fa-list-ol'}`;
        els.modeBtn.title = titleMap[state.mode] || '播放模式';
        els.modeBtn.setAttribute('aria-label', `播放模式：${titleMap[state.mode] || '顺序播放'}，点击切换`);
    }

    function saveState() {
        try {
            const storage = chrome?.storage?.local;
            if (storage) {
                storage.set({
                    poetry_favorites: state.favorites,
                    poetry_line_favorites: state.lineFavorites,
                    poetry_index: state.currentIndex,
                    poetry_mode: state.mode,
                    poetry_speed: state.speed,
                    poetry_pitch: state.pitch,
                    poetry_voice: state.voiceName,
                    poetry_pause_style: state.pauseStyle,
                    poetry_background_sound: state.backgroundSound,
                    poetry_sleep_minutes: state.sleepMinutes,
                });
            }
        } catch { /* ignore */ }
    }

    function esc(value) {
        const node = document.createElement('div');
        node.textContent = value == null ? '' : String(value);
        return node.innerHTML;
    }

    function currentPoem() {
        return state.poems[state.currentIndex] || null;
    }

    function favoritePoems() {
        const keys = new Set(state.favorites);
        return state.poems.filter(poem => keys.has(`${poem.title}-${poem.author}`));
    }

    function poetryLineKey(poem, index) {
        return `${poem.title}-${poem.author}-${index}`;
    }

    function ensureWorkspace() {
        let panel = document.getElementById('poetry-v5-panel');
        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'poetry-v5-panel';
            panel.className = 'poetry-v5-panel';
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'poetry-v5-title');
            panel.setAttribute('aria-hidden', 'true');
            panel.tabIndex = -1;
            document.body.appendChild(panel);
        }
        return panel;
    }

    function pageTitle(page) {
        return { 'full-text': '全文', annotation: '注释赏析', favorites: '我的收藏', 'voice-settings': '语音设置' }[page] || '诗词电台';
    }

    function setPoetryBackgroundInert(active) {
        const panel = document.getElementById('poetry-v5-panel');
        if (!panel) return;
        if (active) {
            poetryBackgroundInertSiblings = [...document.body.children]
                .filter(child => child !== panel && !child.inert);
            poetryBackgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        poetryBackgroundInertSiblings.forEach(child => { child.inert = false; });
        poetryBackgroundInertSiblings = [];
    }

    function getPoetryFocusable() {
        const panel = document.getElementById('poetry-v5-panel');
        if (!panel) return [];
        return [...panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0);
    }

    function focusPoetryPage(page) {
        const selectors = {
            'full-text': ['#poetry-full-play', '[data-poetry-page="full-text"]'],
            annotation: [`#poetry-annotation-${poetryAnnotationTab}`, '[data-poetry-page="annotation"]'],
            favorites: ['#poetry-favorites-search', '[data-poetry-page="favorites"]'],
            'voice-settings': ['#poetry-voice-select', '[data-poetry-page="voice-settings"]']
        };
        const target = (selectors[page] || selectors['full-text'])
            .map(selector => document.querySelector(`#poetry-v5-panel ${selector}`))
            .find(Boolean) || document.getElementById('poetry-v5-panel');
        target?.focus?.({ preventScroll: true });
    }

    function handlePoetryWorkspaceKeydown(event) {
        const panel = document.getElementById('poetry-v5-panel');
        if (!panel?.classList.contains('visible')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            if (poetryWorkspacePage !== 'full-text') renderWorkspace('full-text');
            else closePoetryWorkspace();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = getPoetryFocusable();
        if (!focusable.length) {
            event.preventDefault();
            panel.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function closePoetryWorkspace() {
        const panel = document.getElementById('poetry-v5-panel');
        if (!panel?.classList.contains('visible')) return;
        panel.classList.remove('visible');
        panel.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', handlePoetryWorkspaceKeydown);
        setPoetryBackgroundInert(false);
        if (bar.classList.contains('poetry-dock-open')) window.ProductUIV5?.setBusinessPage?.('poetry', 'mini-player');
        else window.ProductUIV5?.setShellPage?.('home');
        const dockButton = document.getElementById('poetry-dock-btn');
        const visibleDockButton = dockButton?.getClientRects?.().length ? dockButton : null;
        const insideLaunchpad = poetryWorkspaceReturnFocus?.closest?.('#dock-launchpad');
        const focusableReturn = poetryWorkspaceReturnFocus?.matches?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const miniEntry = bar.classList.contains('poetry-dock-open') ? document.getElementById('pr-open-workspace') : null;
        const returnTarget = poetryWorkspaceReturnFocus?.isConnected && focusableReturn && !insideLaunchpad
            ? poetryWorkspaceReturnFocus
            : (miniEntry || visibleDockButton || document.getElementById('dock-launchpad-btn'));
        poetryWorkspaceReturnFocus = null;
        requestAnimationFrame(() => returnTarget?.focus?.({ preventScroll: true }));
    }

    function modeLabel(mode) {
        return { sequential: '顺序', random: '随机', single: '单曲循环' }[mode] || '顺序';
    }

    function ensurePoetrySettingsDraft() {
        if (!poetrySettingsDraft) {
            poetrySettingsDraft = {
                speed: state.speed,
                pitch: state.pitch,
                voiceName: state.voiceName,
                mode: state.mode,
                pauseStyle: state.pauseStyle,
                backgroundSound: state.backgroundSound,
                sleepMinutes: state.sleepMinutes,
            };
        }
        return poetrySettingsDraft;
    }

    function poetrySettingsDirty() {
        const draft = ensurePoetrySettingsDraft();
        return draft.speed !== state.speed
            || draft.pitch !== state.pitch
            || draft.voiceName !== state.voiceName
            || draft.mode !== state.mode
            || draft.pauseStyle !== state.pauseStyle
            || draft.backgroundSound !== state.backgroundSound
            || draft.sleepMinutes !== state.sleepMinutes;
    }

    function refreshPoetrySettingsDraftUi() {
        const panel = document.getElementById('poetry-v5-panel');
        const draft = ensurePoetrySettingsDraft();
        const dirty = poetrySettingsDirty();
        const speedOutput = panel?.querySelector('#poetry-speed-output');
        const pitchOutput = panel?.querySelector('#poetry-pitch-output');
        const status = panel?.querySelector('#poetry-settings-status');
        if (speedOutput) speedOutput.textContent = `${draft.speed.toFixed(2)}×`;
        if (pitchOutput) pitchOutput.textContent = draft.pitch.toFixed(2);
        panel?.querySelector('#poetry-settings-reset')?.toggleAttribute('disabled', !dirty);
        panel?.querySelector('#poetry-settings-apply')?.toggleAttribute('disabled', !dirty);
        if (status) {
            status.classList.toggle('dirty', dirty);
            status.textContent = dirty ? '有未应用的朗读设置' : '当前设置已应用';
        }
    }

    function poetryQueueMarkup() {
        if (!state.poems.length) return '';
        const count = Math.min(6, state.poems.length);
        const indexes = Array.from({ length: count }, (_, offset) => (state.currentIndex + offset) % state.poems.length);
        return indexes.map((index, queueIndex) => {
            const item = state.poems[index];
            const active = index === state.currentIndex;
            return `<button id="poetry-queue-${index}" type="button" data-poetry-index="${index}" class="${active ? 'active' : ''}" ${active ? 'aria-current="true"' : ''}><b>${String(queueIndex + 1).padStart(2, '0')}</b><span><strong>${esc(item.title)}</strong><small>${esc(item.dynasty)} · ${esc(item.author)}</small></span>${active ? '<i class="fas fa-volume-up" aria-hidden="true"></i>' : '<i class="fas fa-chevron-right" aria-hidden="true"></i>'}</button>`;
        }).join('');
    }

    function renderWorkspace(page) {
        const panel = ensureWorkspace();
        const wasVisible = panel.classList.contains('visible');
        const previousPage = poetryWorkspacePage;
        const previousFocusId = panel.contains(document.activeElement) ? document.activeElement.id : '';
        if (!wasVisible) {
            poetryWorkspaceReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setPoetryBackgroundInert(true);
            document.addEventListener('keydown', handlePoetryWorkspaceKeydown);
        }
        poetryWorkspacePage = page;
        const poem = currentPoem();
        const key = poem ? `${poem.title}-${poem.author}` : '';
        const isFav = state.favorites.includes(key);
        window.ProductUIV5?.setBusinessPage?.('poetry', page);
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.dataset.page = page;
        let content = '';

        if (!poem) {
            content = '<div class="poetry-v5-empty"><i class="fas fa-feather-alt"></i><h2>诗词还未加载</h2><p>请稍后重试，已保存的播放和收藏设置不会丢失。</p></div>';
        } else if (page === 'full-text') {
            const lineCount = Math.max(1, poem.lines.length);
            const lineProgress = Math.round(((state.currentLineIndex + 1) / lineCount) * 100);
            const lines = poem.lines.map((line, index) => `<button id="poetry-line-${index}" type="button" data-poetry-line="${index}" class="${index === state.currentLineIndex ? 'active' : ''}" ${index === state.currentLineIndex ? 'aria-current="true"' : ''}><span>${esc(line)}</span><small>${index === state.currentLineIndex ? (state.playing ? '正在朗读' : '当前句') : '从此句朗读'}</small></button>`).join('');
            content = `<div class="poetry-v5-reading-layout"><section class="poetry-v5-full"><div class="poetry-v5-seal">${esc(poem.dynasty || '诗')}</div><span>${esc(poem.dynasty)} · ${esc(poem.author)}</span><h1>${esc(poem.title)}</h1><div class="poetry-v5-line-progress"><span>朗读进度 · 第 ${state.currentLineIndex + 1} / ${lineCount} 句</span><b>${lineProgress}%</b><div><i style="width:${lineProgress}%"></i></div></div><div class="poetry-v5-lines" aria-label="《${esc(poem.title)}》正文">${lines}</div><div class="poetry-v5-full-actions"><button id="poetry-full-play" type="button" class="primary" aria-pressed="${state.playing}"><i class="fas ${state.playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i> ${state.playing ? '暂停朗读' : '开始朗读'}</button><button id="poetry-full-fav" type="button" aria-pressed="${isFav}"><i class="${isFav ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i> ${isFav ? '已收藏' : '收藏全诗'}</button><button type="button" data-poetry-page="annotation"><i class="fas fa-book-open" aria-hidden="true"></i> 查看译注</button></div></section><aside class="poetry-v5-queue"><div><span class="eyebrow">播放队列</span><b>${state.poems.length} 首</b></div><div class="poetry-v5-queue-list">${poetryQueueMarkup()}</div><dl><div><dt>当前模式</dt><dd>${modeLabel(state.mode)}</dd></div><div><dt>朗读速度</dt><dd>${state.speed.toFixed(2)}×</dd></div><div><dt>本地收藏</dt><dd>${state.favorites.length} 首</dd></div></dl></aside></div>`;
        } else if (page === 'annotation') {
            const lineRows = poem.lines.map((line, index) => {
                const lineFavorite = state.lineFavorites.includes(poetryLineKey(poem, index));
                return `<article class="${index === state.currentLineIndex ? 'active' : ''}"><b>${String(index + 1).padStart(2, '0')}</b><div><p>${esc(line)}</p><span>本地诗词源暂未提供该句译文或词语注释。</span></div><button id="poetry-line-favorite-${index}" type="button" class="poetry-v5-line-favorite" data-poetry-line-favorite="${index}" aria-pressed="${lineFavorite}" aria-label="${lineFavorite ? '取消收藏' : '收藏'}诗句：${esc(line)}"><i class="${lineFavorite ? 'fas' : 'far'} fa-heart" aria-hidden="true"></i><span>${lineFavorite ? '已收藏' : '收藏诗句'}</span></button></article>`;
            }).join('');
            const annotationBody = poetryAnnotationTab === 'translation'
                ? `<span class="eyebrow">逐句阅读</span><h2>《${esc(poem.title)}》</h2>${lineRows}`
                : poetryAnnotationTab === 'appreciation'
                    ? `<span class="eyebrow">赏析</span><h2>来源尚未提供赏析</h2><div class="poetry-v5-honest-empty"><i class="fas fa-shield-alt" aria-hidden="true"></i><strong>不生成无来源解读</strong><p>当前诗词数据只包含题目、作者、朝代与正文。接入可靠来源后，这里再展示主题、意象和结构分析。</p></div>`
                    : `<span class="eyebrow">作者</span><h2>${esc(poem.author)}</h2><div class="poetry-v5-author-card"><div>${esc(poem.dynasty || '诗')}</div><strong>${esc(poem.author)}</strong><span>${esc(poem.dynasty)}代诗人</span><p>本地数据未包含作者生平与作品出处，暂不补写未经来源校验的介绍。</p></div>`;
            content = `<div class="poetry-v5-annotation"><section><div class="poetry-v5-annotation-tabs" role="tablist" aria-label="译注内容"><button id="poetry-annotation-translation" type="button" role="tab" data-poetry-annotation-tab="translation" aria-selected="${poetryAnnotationTab === 'translation'}" class="${poetryAnnotationTab === 'translation' ? 'active' : ''}">译注</button><button id="poetry-annotation-appreciation" type="button" role="tab" data-poetry-annotation-tab="appreciation" aria-selected="${poetryAnnotationTab === 'appreciation'}" class="${poetryAnnotationTab === 'appreciation' ? 'active' : ''}">赏析</button><button id="poetry-annotation-author" type="button" role="tab" data-poetry-annotation-tab="author" aria-selected="${poetryAnnotationTab === 'author'}" class="${poetryAnnotationTab === 'author' ? 'active' : ''}">作者</button></div>${annotationBody}</section><aside><h3>内容状态</h3><div class="poetry-v5-source-state"><i class="fas fa-info-circle" aria-hidden="true"></i><strong>原文可用 · 扩展内容缺失</strong><p>当前来源只支持诗名、作者、朝代与正文；译注、赏析和作者背景均显示明确空态。</p></div><button type="button" data-poetry-page="full-text">返回原文</button></aside></div>`;
        } else if (page === 'favorites') {
            const favorites = favoritePoems();
            const dynasties = [...new Set(favorites.map(fav => fav.dynasty).filter(Boolean))];
            const query = poetryFavoriteQuery.trim().toLowerCase();
            const filteredFavorites = favorites.filter(fav => (poetryFavoriteDynasty === 'all' || fav.dynasty === poetryFavoriteDynasty)
                && (!query || `${fav.title} ${fav.author} ${fav.dynasty} ${fav.lines.join(' ')}`.toLowerCase().includes(query)));
            const cards = filteredFavorites.map(fav => {
                const index = state.poems.indexOf(fav);
                return `<button id="poetry-favorite-${index}" type="button" data-poetry-key="${esc(`${fav.title}-${fav.author}`)}"><i class="fas fa-heart" aria-hidden="true"></i><strong>${esc(fav.title)}</strong><span>${esc(fav.dynasty)} · ${esc(fav.author)}</span><small>${esc(fav.lines[0] || '')}</small></button>`;
            }).join('');
            content = `<div class="poetry-v5-favorites"><div class="poetry-v5-section-head"><div><span class="eyebrow">本地收藏</span><h2>${favorites.length} 首诗词</h2></div><span>仅保存收藏标识，不上传诗词数据</span></div><div class="poetry-v5-fav-toolbar"><label><i class="fas fa-search" aria-hidden="true"></i><input id="poetry-favorites-search" type="search" value="${esc(poetryFavoriteQuery)}" aria-label="搜索收藏诗词" placeholder="搜索诗名、作者或正文"></label><div role="group" aria-label="收藏朝代筛选"><button id="poetry-dynasty-all" type="button" data-poetry-dynasty="all" aria-pressed="${poetryFavoriteDynasty === 'all'}">全部</button>${dynasties.map(dynasty => `<button id="poetry-dynasty-${esc(dynasty)}" type="button" data-poetry-dynasty="${esc(dynasty)}" aria-pressed="${poetryFavoriteDynasty === dynasty}">${esc(dynasty)}</button>`).join('')}</div><button id="poetry-play-favorites" type="button" ${filteredFavorites.length ? '' : 'disabled'}><i class="fas fa-play" aria-hidden="true"></i> 播放筛选结果</button></div><div class="poetry-v5-result-count" role="status">显示 ${filteredFavorites.length} / ${favorites.length} 首</div><div class="poetry-v5-fav-grid">${cards || `<div class="poetry-v5-empty"><i class="${favorites.length ? 'fas fa-search' : 'far fa-heart'}" aria-hidden="true"></i><h2>${favorites.length ? '没有匹配收藏' : '还没有收藏'}</h2><p>${favorites.length ? '换个关键词或朝代试试。' : '在原文页点击收藏全诗，喜欢的诗会出现在这里。'}</p></div>`}</div></div>`;
        } else {
            const voices = ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => v.lang?.startsWith('zh'));
            const draft = ensurePoetrySettingsDraft();
            const dirty = poetrySettingsDirty();
            content = `<div class="poetry-v5-settings"><section><span class="eyebrow">朗读偏好</span><h2>先试听，再显式应用</h2><p class="poetry-v5-settings-note">修改只进入本页草稿；试听不会写入设置，点击“应用设置”后才保存。</p><label>中文声音<select id="poetry-voice-select"><option value="">系统自动选择</option>${voices.map(v => `<option value="${esc(v.name)}" ${draft.voiceName === v.name ? 'selected' : ''}>${esc(v.name)} · ${esc(v.lang)}</option>`).join('')}</select></label><label>语速 <output id="poetry-speed-output">${draft.speed.toFixed(2)}×</output><input id="poetry-speed-range" type="range" min="0.6" max="1.6" step="0.05" value="${draft.speed}" aria-label="朗读语速"></label><label>音高 <output id="poetry-pitch-output">${draft.pitch.toFixed(2)}</output><input id="poetry-pitch-range" type="range" min="0.6" max="1.4" step="0.05" value="${draft.pitch}" aria-label="朗读音高"></label><div class="poetry-v5-setting-selects"><label>句间停顿<select id="poetry-pause-select"><option value="short" ${draft.pauseStyle === 'short' ? 'selected' : ''}>短 · 连贯</option><option value="natural" ${draft.pauseStyle === 'natural' ? 'selected' : ''}>自然</option><option value="long" ${draft.pauseStyle === 'long' ? 'selected' : ''}>长 · 沉浸</option></select></label><label>背景声<select id="poetry-background-select"><option value="none" ${draft.backgroundSound === 'none' ? 'selected' : ''}>关闭</option><option value="rain" ${draft.backgroundSound === 'rain' ? 'selected' : ''}>细雨</option><option value="stream" ${draft.backgroundSound === 'stream' ? 'selected' : ''}>溪流</option></select></label><label>睡眠定时<select id="poetry-sleep-select"><option value="0" ${draft.sleepMinutes === 0 ? 'selected' : ''}>关闭</option><option value="15" ${draft.sleepMinutes === 15 ? 'selected' : ''}>15 分钟</option><option value="30" ${draft.sleepMinutes === 30 ? 'selected' : ''}>30 分钟</option><option value="60" ${draft.sleepMinutes === 60 ? 'selected' : ''}>60 分钟</option></select></label></div><div class="poetry-v5-mode" role="group" aria-label="播放模式"><span>播放模式</span>${['sequential','random','single'].map(mode => `<button id="poetry-mode-${mode}" type="button" data-poetry-mode="${mode}" class="${draft.mode === mode ? 'active' : ''}" aria-pressed="${draft.mode === mode}">${modeLabel(mode)}</button>`).join('')}</div><div class="poetry-v5-settings-actions"><button id="poetry-settings-test" type="button"><i class="fas ${state.playing ? 'fa-stop' : 'fa-volume-up'}" aria-hidden="true"></i> ${state.playing ? '停止试听' : '试听草稿'}</button><button id="poetry-settings-reset" type="button" ${dirty ? '' : 'disabled'}>恢复已应用</button><button id="poetry-settings-apply" type="button" class="primary" ${dirty ? '' : 'disabled'}>应用设置</button></div><div id="poetry-settings-status" class="${dirty ? 'dirty' : ''}" role="status" aria-live="polite" tabindex="-1">${dirty ? '有未应用的朗读设置' : '当前设置已应用'}</div></section><aside><h3>当前朗读</h3><strong>《${esc(poem.title)}》</strong><span>${esc(poem.author)} · 第 ${state.currentLineIndex + 1} 句</span><dl><div><dt>已应用音色</dt><dd>${esc(state.voiceName || '系统自动')}</dd></div><div><dt>已应用速度</dt><dd>${state.speed.toFixed(2)}×</dd></div><div><dt>句间停顿</dt><dd>${{ short: '短', natural: '自然', long: '长' }[state.pauseStyle]}</dd></div><div><dt>背景声</dt><dd>${{ none: '关闭', rain: '细雨', stream: '溪流' }[state.backgroundSound]}</dd></div><div><dt>睡眠定时</dt><dd>${state.sleepMinutes ? `${state.sleepMinutes} 分钟` : '关闭'}</dd></div><div><dt>已应用模式</dt><dd>${modeLabel(state.mode)}</dd></div></dl><p>语音由浏览器本地 SpeechSynthesis 提供；背景声由本地 Web Audio 合成，不访问网络。可用中文声音由当前操作系统决定。</p></aside></div>`;
        }

        const lineCount = Math.max(1, poem?.lines?.length || 0);
        const lineProgress = poem ? Math.round(((state.currentLineIndex + 1) / lineCount) * 100) : 0;
        panel.innerHTML = `<header><div><i class="fas fa-feather-alt" aria-hidden="true"></i><strong id="poetry-v5-title">诗词电台</strong><span>${esc(pageTitle(page))}</span></div><nav aria-label="诗词页面"><button type="button" data-poetry-page="full-text" class="${page === 'full-text' ? 'active' : ''}" ${page === 'full-text' ? 'aria-current="page"' : ''}>原文</button><button type="button" data-poetry-page="annotation" class="${page === 'annotation' ? 'active' : ''}" ${page === 'annotation' ? 'aria-current="page"' : ''}>译注</button><button type="button" data-poetry-page="favorites" class="${page === 'favorites' ? 'active' : ''}" ${page === 'favorites' ? 'aria-current="page"' : ''}>收藏</button><button type="button" data-poetry-page="voice-settings" class="${page === 'voice-settings' ? 'active' : ''}" ${page === 'voice-settings' ? 'aria-current="page"' : ''}>朗读设置</button></nav><button id="poetry-v5-close" type="button" aria-label="关闭诗词工作台"><i class="fas fa-times" aria-hidden="true"></i></button></header><main>${content}</main><footer><button id="poetry-v5-prev" type="button"><i class="fas fa-chevron-left" aria-hidden="true"></i> 上一首</button><div aria-live="polite"><strong>${poem ? esc(poem.title) : '等待诗词'}</strong><span>${poem ? `${state.currentIndex + 1} / ${state.poems.length} · 第 ${state.currentLineIndex + 1} / ${lineCount} 句` : '0 / 0'}</span><div class="poetry-v5-footer-progress" aria-hidden="true"><i style="width:${lineProgress}%"></i></div></div><button id="poetry-v5-next" type="button">下一首 <i class="fas fa-chevron-right" aria-hidden="true"></i></button></footer>`;
        bindWorkspace(page);
        requestAnimationFrame(() => {
            const previousFocus = previousFocusId ? document.getElementById(previousFocusId) : null;
            if (wasVisible && previousPage === page && previousFocus) previousFocus.focus({ preventScroll: true });
            else focusPoetryPage(page);
        });
    }

    function bindWorkspace(page) {
        const panel = ensureWorkspace();
        panel.querySelectorAll('[data-poetry-page]').forEach(btn => btn.addEventListener('click', () => renderWorkspace(btn.dataset.poetryPage)));
        panel.querySelector('#poetry-v5-close')?.addEventListener('click', closePoetryWorkspace);
        panel.querySelector('#poetry-v5-prev')?.addEventListener('click', () => { prevPoem(); renderWorkspace(page); });
        panel.querySelector('#poetry-v5-next')?.addEventListener('click', () => { nextPoem(false); renderWorkspace(page); });
        panel.querySelector('#poetry-full-play')?.addEventListener('click', () => { togglePlay(); renderWorkspace('full-text'); });
        panel.querySelector('#poetry-full-fav')?.addEventListener('click', () => { toggleFav(); renderWorkspace('full-text'); });
        panel.querySelectorAll('[data-poetry-line]').forEach(btn => btn.addEventListener('click', () => {
            state.currentLineIndex = Number(btn.dataset.poetryLine) || 0;
            renderCurrent();
            if (state.playing) play();
            renderWorkspace('full-text');
        }));
        panel.querySelectorAll('[data-poetry-index]').forEach(btn => btn.addEventListener('click', () => {
            state.currentIndex = Number(btn.dataset.poetryIndex) || 0;
            state.currentLineIndex = 0;
            renderCurrent();
            saveState();
            if (state.playing) play();
            renderWorkspace('full-text');
        }));
        panel.querySelectorAll('[data-poetry-annotation-tab]').forEach(btn => btn.addEventListener('click', () => {
            poetryAnnotationTab = btn.dataset.poetryAnnotationTab;
            renderWorkspace('annotation');
        }));
        panel.querySelectorAll('[data-poetry-line-favorite]').forEach(btn => btn.addEventListener('click', () => {
            const poem = currentPoem();
            if (!poem) return;
            const lineIndex = Number(btn.dataset.poetryLineFavorite) || 0;
            const lineKey = poetryLineKey(poem, lineIndex);
            const favoriteIndex = state.lineFavorites.indexOf(lineKey);
            if (favoriteIndex >= 0) state.lineFavorites.splice(favoriteIndex, 1);
            else state.lineFavorites.push(lineKey);
            saveState();
            announcePoetry(`${favoriteIndex >= 0 ? '已取消收藏' : '已收藏'}诗句：${poem.lines[lineIndex]}`);
            renderWorkspace('annotation');
        }));
        panel.querySelectorAll('[data-poetry-key]').forEach(btn => btn.addEventListener('click', () => {
            const index = state.poems.findIndex(poem => `${poem.title}-${poem.author}` === btn.dataset.poetryKey);
            if (index >= 0) { state.currentIndex = index; state.currentLineIndex = 0; renderCurrent(); saveState(); renderWorkspace('full-text'); }
        }));
        const favoriteSearch = panel.querySelector('#poetry-favorites-search');
        favoriteSearch?.addEventListener('input', () => {
            poetryFavoriteQuery = favoriteSearch.value;
            renderWorkspace('favorites');
        });
        panel.querySelectorAll('[data-poetry-dynasty]').forEach(btn => btn.addEventListener('click', () => {
            poetryFavoriteDynasty = btn.dataset.poetryDynasty;
            renderWorkspace('favorites');
        }));
        panel.querySelector('#poetry-play-favorites')?.addEventListener('click', () => {
            const query = poetryFavoriteQuery.trim().toLowerCase();
            const first = favoritePoems().find(fav => (poetryFavoriteDynasty === 'all' || fav.dynasty === poetryFavoriteDynasty)
                && (!query || `${fav.title} ${fav.author} ${fav.dynasty} ${fav.lines.join(' ')}`.toLowerCase().includes(query)));
            const index = first ? state.poems.indexOf(first) : -1;
            if (index >= 0) {
                state.currentIndex = index;
                state.currentLineIndex = 0;
                renderCurrent();
                saveState();
                play();
                renderWorkspace('full-text');
            }
        });
        const speed = panel.querySelector('#poetry-speed-range');
        speed?.addEventListener('input', () => {
            ensurePoetrySettingsDraft().speed = Number(speed.value);
            refreshPoetrySettingsDraftUi();
        });
        const pitch = panel.querySelector('#poetry-pitch-range');
        pitch?.addEventListener('input', () => {
            ensurePoetrySettingsDraft().pitch = Number(pitch.value);
            refreshPoetrySettingsDraftUi();
        });
        panel.querySelector('#poetry-voice-select')?.addEventListener('change', e => {
            ensurePoetrySettingsDraft().voiceName = e.target.value;
            refreshPoetrySettingsDraftUi();
        });
        panel.querySelector('#poetry-pause-select')?.addEventListener('change', e => {
            ensurePoetrySettingsDraft().pauseStyle = e.target.value;
            refreshPoetrySettingsDraftUi();
        });
        panel.querySelector('#poetry-background-select')?.addEventListener('change', e => {
            ensurePoetrySettingsDraft().backgroundSound = e.target.value;
            refreshPoetrySettingsDraftUi();
        });
        panel.querySelector('#poetry-sleep-select')?.addEventListener('change', e => {
            ensurePoetrySettingsDraft().sleepMinutes = Number(e.target.value) || 0;
            refreshPoetrySettingsDraftUi();
        });
        panel.querySelectorAll('[data-poetry-mode]').forEach(btn => btn.addEventListener('click', () => {
            ensurePoetrySettingsDraft().mode = btn.dataset.poetryMode;
            renderWorkspace('voice-settings');
        }));
        panel.querySelector('#poetry-settings-test')?.addEventListener('click', () => {
            if (state.playing) {
                state.playing = false;
                stop();
                updatePlayIcon();
                announcePoetry('已停止试听');
            } else {
                play(ensurePoetrySettingsDraft());
            }
            renderWorkspace('voice-settings');
        });
        panel.querySelector('#poetry-settings-reset')?.addEventListener('click', () => {
            poetrySettingsDraft = null;
            renderWorkspace('voice-settings');
            requestAnimationFrame(() => panel.querySelector('#poetry-settings-status')?.focus({ preventScroll: true }));
        });
        panel.querySelector('#poetry-settings-apply')?.addEventListener('click', () => {
            const draft = ensurePoetrySettingsDraft();
            state.speed = draft.speed;
            state.pitch = draft.pitch;
            state.voiceName = draft.voiceName;
            state.mode = draft.mode;
            state.pauseStyle = draft.pauseStyle;
            state.backgroundSound = draft.backgroundSound;
            state.sleepMinutes = draft.sleepMinutes;
            poetrySettingsDraft = null;
            if (els.speedSel) els.speedSel.value = String(state.speed);
            updateModeIcon();
            saveState();
            schedulePoetrySleepTimer();
            announcePoetry('朗读设置已应用');
            renderWorkspace('voice-settings');
            requestAnimationFrame(() => panel.querySelector('#poetry-settings-status')?.focus({ preventScroll: true }));
        });
    }

    function toggleMini() {
        const nextOpen = !bar.classList.contains('poetry-dock-open');
        bar.classList.toggle('poetry-dock-open', nextOpen);
        if (nextOpen) window.ProductUIV5?.setBusinessPage?.('poetry', 'mini-player');
        else {
            closePoetryWorkspace();
            window.ProductUIV5?.setShellPage?.('home');
        }
    }

    bar.querySelector('.pr-display')?.addEventListener('click', () => renderWorkspace('full-text'));
    window.PoetryRadioV5 = { state, toggleMini, showPage: renderWorkspace, renderCurrent };

    els.playBtn?.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
    els.nextBtn?.addEventListener('click', (e) => { e.stopPropagation(); nextPoem(false); });
    els.prevBtn?.addEventListener('click', (e) => { e.stopPropagation(); prevPoem(); });
    els.favBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleFav(); });
    els.modeBtn?.addEventListener('click', (e) => { e.stopPropagation(); toggleMode(); });

    els.speedSel?.addEventListener('change', (e) => {
        state.speed = parseFloat(e.target.value) || 1;
        saveState();
        if (state.playing) play();
    });

    if ('speechSynthesis' in window) {
        speechSynthesis.onvoiceschanged = () => {};
    }

    loadPoems();
    setInterval(() => {
        if (!state.playing && state.poems.length > 0) {
            nextPoem(false);
        }
    }, 5 * 60 * 1000);
}

// ===================== Zen Mode — 极简模式 =====================

const zenMode = {
    _active: false,
    _dblClickTimer: null,

    async init() {
        try {
            const { zenModeActive } = await new Promise(resolve =>
                chrome.storage.local.get('zenModeActive', resolve)
            );
            if (zenModeActive) this._apply(true, false);
        } catch { /* ignore */ }

        const zenBtn = document.getElementById('zen-mode-btn');
        if (zenBtn) {
            zenBtn.addEventListener('click', () => this.toggle());
        }

        const hint = document.getElementById('zen-exit-hint');
        if (hint) {
            hint.addEventListener('click', () => {
                if (this._active) this.toggle();
            });
        }

        document.addEventListener('dblclick', (e) => {
            if (!this._active) return;
            if (isInputFocused()) return;
            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
            this.toggle();
        });
    },

    toggle() {
        this._apply(!this._active, true);
    },

    _apply(active, animate) {
        this._active = active;
        const body = document.body;
        const zenBtn = document.getElementById('zen-mode-btn');
        const hint = document.getElementById('zen-exit-hint');

        if (active) {
            body.classList.add('zen-mode');
            if (zenBtn) {
                zenBtn.classList.add('zen-active');
                const icon = zenBtn.querySelector('i');
                if (icon) { icon.className = 'fas fa-eye'; }
            }
            if (hint) {
                hint.style.animation = 'none';
                void hint.offsetWidth;
                hint.style.animation = '';
            }
        } else {
            body.classList.remove('zen-mode');
            if (zenBtn) {
                zenBtn.classList.remove('zen-active');
                const icon = zenBtn.querySelector('i');
                if (icon) { icon.className = 'fas fa-eye-slash'; }
            }
        }

        chrome.storage.local.set({ zenModeActive: active });
    }
};

window.zenMode = zenMode;

// 设置键盘快捷键
async function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        // Ctrl/⌘ + Shift + B 切换背景
        const isSwitchBackground =
            !isInputFocused() &&
            event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
            event.code === 'KeyB';

        if (isSwitchBackground) {
            event.preventDefault();
            changeBackground();
            return;
        }

        // Ctrl/⌘ + Shift + . 切换极简模式
        const isToggleZen =
            !isInputFocused() &&
            event.shiftKey &&
            (event.ctrlKey || event.metaKey) &&
            event.code === 'Period';

        if (isToggleZen) {
            event.preventDefault();
            zenMode.toggle();
            return;
        }

        // Esc 退出极简模式
        if (event.code === 'Escape' && zenMode._active) {
            event.preventDefault();
            zenMode.toggle();
        }
    });
    
    // 右下角按钮点击事件 - 切换侧边栏
    const memoToggleBtn = document.getElementById('memo-toggle-btn');
    if (memoToggleBtn) {
        memoToggleBtn.addEventListener('click', () => {
            if (window.memoManager && typeof window.memoManager.toggle === 'function') {
                window.memoManager.toggle();
            }
        });
    }

    // 从独立任务工作台返回时，直接打开新建任务表单。
    if (new URLSearchParams(window.location.search).get('taskAction') === 'new') {
        setTimeout(() => {
            if (!window.memoManager) return;
            const sidebar = document.getElementById('task-sidebar');
            if (!sidebar?.classList.contains('open') && typeof window.memoManager.toggle === 'function') {
                window.memoManager.toggle();
            }
            setTimeout(() => window.memoManager?.showSidebarForm?.(), 120);
            history.replaceState({}, '', window.location.pathname);
        }, 300);
    }

    // 阅读 dock 按钮
    const readingDockBtn = document.getElementById('reading-dock-btn');
    if (readingDockBtn) {
        readingDockBtn.addEventListener('click', () => {
            if (window.memoManager && typeof window.memoManager.toggleReading === 'function') {
                window.memoManager.toggleReading();
            }
        });
    }

    // v3.3.0: dock-bar 中知识墙按钮由 knowledge-wall.js 自行绑定
    

    // 处理来自 background 的 pendingAction
    try {
        const { pendingAction } = await new Promise(r => chrome.storage.local.get('pendingAction', r));
        if (pendingAction) {
            await chrome.storage.local.remove('pendingAction');
            if (pendingAction === 'openWorklogPanel' && window.workLogManager) {
                setTimeout(() => window.workLogManager.openPanel(), 500);
            }
            if (pendingAction === 'openBackupPanel' && window.memoManager) {
                setTimeout(() => {
                    const backupBtn = document.getElementById('sidebar-backup-btn');
                    if (backupBtn) backupBtn.click();
                }, 500);
            }
        }
    } catch { /* ignore */ }
}

// 检查是否有输入框聚焦
function isInputFocused() {
    const activeEl = document.activeElement;
    return activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.isContentEditable
    );
}

// 启动应用：兼容脚本在 DOMContentLoaded 之后被动态注入/恢复的场景。
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
    void initApp();
}
