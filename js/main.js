// ==================== 背景系统（v3.16.0 多源 + 视频 + 定时切换）====================

let backgroundImages = [];
let _bgAutoSwitchTimer = null;

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
        document.body.prepend(el);
    }
    return el;
}

function _applyBackground(background) {
    if (!background) return;
    const video = _getVideoElement();

    if (background.mediaType === 'video' && background.videoUrl) {
        document.body.style.backgroundImage = 'none';
        video.src = background.videoUrl;
        video.poster = background.url || '';
        video.style.display = 'block';
        video.play().catch(() => {});
    } else {
        video.pause();
        video.removeAttribute('src');
        video.style.display = 'none';
        document.body.style.backgroundImage = `url(${background.url})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
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

// 注意：时间显示已由 clock.js 模块处理，此处不再重复更新
// 避免多处同时更新导致的闪烁问题

// 初始化应用
async function initApp() {
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
            console.log('音乐控制器初始化完成');
        } catch (error) {
            console.error('音乐控制器初始化失败:', error);
        }
    } else {
        console.log('音乐播放器已禁用（性能设置）');
    }

    // 初始化学习中心
    if (sm.getSetting('enableStudyCenter') !== false) {
        try {
            if (window.studyCenter && typeof window.studyCenter.init === 'function') {
                window.studyCenter.init();
            }
            const studyDockBtn = document.getElementById('study-dock-btn');
            if (studyDockBtn) {
                studyDockBtn.addEventListener('click', () => {
                    if (window.studyCenter) {
                        window.studyCenter.toggle();
                        studyDockBtn.classList.toggle('sc-active', window.studyCenter._panelOpen);
                    }
                });
            }
            console.log('学习中心初始化完成');
        } catch (error) {
            console.error('学习中心初始化失败:', error);
        }
    } else {
        console.log('学习中心已禁用（性能设置）');
        document.getElementById('study-dock-btn')?.classList.add('hidden');
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

    // v3.0.0: 初始化温情提示
    if (sm.getSetting('enableWarmTip') !== false) {
        try {
            initWarmTip();
            console.log('温情提示初始化完成');
        } catch (error) {
            console.error('温情提示初始化失败:', error);
        }
    } else {
        console.log('温情提示已禁用（性能设置）');
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

// ===================== v3.0.0: 温情提示 =====================

function initWarmTip() {
    const bar = document.getElementById('warm-tip-bar');
    const text = document.getElementById('warm-tip-text');
    const refresh = document.getElementById('warm-tip-refresh');
    if (!bar || !text) return;

    async function loadTip() {
        try {
            const resp = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'get_warm_tip' }, resolve);
            });
            if (resp?.ok && resp.data) {
                text.textContent = resp.data;
                const icons = { quote: '💡', method: '📐', joke: '😄', fable: '📖', health: '💚' };
                const icon = bar.querySelector('.warm-tip-icon');
                if (icon && resp.raw?.type) icon.textContent = icons[resp.raw.type] || '💡';
                bar.style.display = 'flex';
            }
        } catch { /* ignore */ }
    }

    refresh?.addEventListener('click', (e) => {
        e.stopPropagation();
        refresh.style.transform = 'rotate(360deg)';
        setTimeout(() => { refresh.style.transform = ''; }, 500);
        loadTip();
    });

    loadTip();
    setInterval(loadTip, 5 * 60 * 1000);
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

    // v3.3.0: dock-bar 中知识墙按钮由 knowledge-wall.js 自行绑定
    
    // 侧边栏折叠按钮
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            if (window.memoManager && typeof window.memoManager.toggleSidebar === 'function') {
                window.memoManager.toggleSidebar();
            }
        });
    }

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

// 启动应用
document.addEventListener('DOMContentLoaded', initApp);
