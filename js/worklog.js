/**
 * WorkLogManager — 每日工作日志与时间追踪
 * 独立模块，数据存储在 chrome.storage.local
 * 入口：底部 Dock 栏按钮
 */
class WorkLogManager {
    constructor() {
        this._projects = [];
        this._entries = [];
        this._timer = null;       // { projectId, description, startedAt }
        this._timerInterval = null;
        this._panelOpen = false;
        this._currentDate = this._todayStr();
        this._panelEl = null;
        this._overlayEl = null;
        this._escHandler = null;
        this._initialized = false;
        this._viewMode = 'list'; // 'list' | 'quadrant'
        this._returnFocus = null;
        this._backgroundInertSiblings = [];
        this._panelEventsAbort = null;

        this.QUADRANTS = [
            { key: 'q1', label: '紧急且重要', hint: '立即做', icon: '🔴', urgency: true, importance: true },
            { key: 'q2', label: '重要不紧急', hint: '计划做', icon: '🟡', urgency: false, importance: true },
            { key: 'q3', label: '紧急不重要', hint: '快速处理', icon: '🔵', urgency: true, importance: false },
            { key: 'q4', label: '不紧急不重要', hint: '可推后', icon: '⚪', urgency: false, importance: false },
        ];

        this.QUICK_DURATIONS = [
            { label: '5m', minutes: 5 },
            { label: '10m', minutes: 10 },
            { label: '15m', minutes: 15 },
            { label: '30m', minutes: 30 },
            { label: '1h', minutes: 60 },
            { label: '2h', minutes: 120 },
        ];

        this.PROJECT_COLORS = [
            { name: '绿色', hex: '#4CAF50' },
            { name: '蓝色', hex: '#2196F3' },
            { name: '紫色', hex: '#9C27B0' },
            { name: '橙色', hex: '#FF9800' },
            { name: '红色', hex: '#F44336' },
            { name: '青色', hex: '#00BCD4' },
            { name: '粉色', hex: '#E91E63' },
            { name: '灰色', hex: '#9E9E9E' },
        ];

        this.DEFAULT_PROJECT = {
            id: 'proj_default',
            name: '未分类',
            color: '#9E9E9E',
            icon: '',
            archived: false,
            createdAt: Date.now(),
            sortOrder: 999
        };
    }

    // ─── 初始化 ───
    async init() {
        if (this._initialized) return;
        await this._loadData();
        this._initialized = true;
        if (this._timer) this._updateDockBadge(true);
        console.log('[WorkLog] 初始化完成，项目数:', this._projects.length, '条目数:', this._entries.length);
    }

    // ─── 数据加载/保存 ───
    async _loadData() {
        const data = await new Promise(r =>
            chrome.storage.local.get(['worklogProjects', 'worklogEntries', 'worklogTimer'], r)
        );
        this._projects = Array.isArray(data.worklogProjects) ? data.worklogProjects : [{ ...this.DEFAULT_PROJECT }];
        this._entries = Array.isArray(data.worklogEntries) ? data.worklogEntries : [];
        if (data.worklogTimer && data.worklogTimer.startedAt) {
            this._timer = data.worklogTimer;
        }
        if (!this._projects.find(p => p.id === 'proj_default')) {
            this._projects.push({ ...this.DEFAULT_PROJECT });
        }
    }

    async _saveProjects() {
        await chrome.storage.local.set({ worklogProjects: this._projects });
    }

    async _saveEntries() {
        await chrome.storage.local.set({ worklogEntries: this._entries });
    }

    async _saveTimer() {
        await chrome.storage.local.set({ worklogTimer: this._timer || null });
    }

    // ─── 工具函数 ───
    _todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${weekDays[d.getDay()]}`;
    }

    _formatDuration(minutes) {
        if (!minutes || minutes <= 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    }

    _formatTimerElapsed(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        const pad = n => String(n).padStart(2, '0');
        return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    _genId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    _setProductPage(page) {
        window.ProductUIV5?.setBusinessPage?.('worklog', page);
    }

    _baseProductPage() {
        if (this._timer) return 'active-timer';
        return this._viewMode === 'quadrant' ? 'quadrant' : 'daily-list';
    }

    _restoreProductPage() {
        this._setProductPage(this._baseProductPage());
    }

    _getProject(projectId) {
        return this._projects.find(p => p.id === projectId) || this.DEFAULT_PROJECT;
    }

    _getMemoTitle(memoId) {
        if (!memoId || !window.memoManager) return null;
        const task = window.memoManager.getTaskById(memoId);
        return task ? task.title : null;
    }

    _getTasksForPicker(query) {
        if (!window.memoManager || typeof window.memoManager.getTasksForWorklog !== 'function') return [];
        return window.memoManager.getTasksForWorklog(query);
    }

    _getEntriesForDate(dateStr) {
        return this._entries.filter(e => e.date === dateStr);
    }

    _getWeekRange(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const monday = new Date(d);
        monday.setDate(d.getDate() - diff);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        return { start: fmt(monday), end: fmt(sunday) };
    }

    _shiftDate(dateStr, delta) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ─── 项目 CRUD ───
    async addProject(name, color) {
        if (!name || !name.trim()) return null;
        const project = {
            id: this._genId('proj'),
            name: name.trim(),
            color: color || this.PROJECT_COLORS[this._projects.length % this.PROJECT_COLORS.length].hex,
            icon: '',
            archived: false,
            createdAt: Date.now(),
            sortOrder: this._projects.length
        };
        this._projects.push(project);
        await this._saveProjects();
        return project;
    }

    async updateProject(id, updates) {
        const idx = this._projects.findIndex(p => p.id === id);
        if (idx === -1) return null;
        Object.assign(this._projects[idx], updates);
        await this._saveProjects();
        return this._projects[idx];
    }

    async deleteProject(id) {
        if (id === 'proj_default') return;
        this._entries.forEach(e => { if (e.projectId === id) e.projectId = 'proj_default'; });
        this._projects = this._projects.filter(p => p.id !== id);
        await this._saveProjects();
        await this._saveEntries();
    }

    getActiveProjects() {
        return this._projects.filter(p => !p.archived);
    }

    // ─── 工时条目 CRUD ───
    async addEntry(data) {
        const entry = {
            id: this._genId('te'),
            projectId: data.projectId || 'proj_default',
            description: (data.description || '').trim(),
            date: data.date || this._todayStr(),
            duration: Math.max(0, Math.round(data.duration || 0)),
            startTime: data.startTime || '',
            endTime: data.endTime || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
            memoId: data.memoId || null,
            urgency: !!data.urgency,
            importance: !!data.importance,
            subItems: Array.isArray(data.subItems) ? data.subItems : [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        this._entries.push(entry);
        await this._saveEntries();
        return entry;
    }

    async updateEntry(id, updates) {
        const idx = this._entries.findIndex(e => e.id === id);
        if (idx === -1) return null;
        Object.assign(this._entries[idx], updates, { updatedAt: Date.now() });
        await this._saveEntries();
        return this._entries[idx];
    }

    async deleteEntry(id) {
        this._entries = this._entries.filter(e => e.id !== id);
        await this._saveEntries();
    }

    /**
     * 批量复制源日期的工时条目到目标日期。
     * - 默认跳过 (description + projectId) 已在目标日期存在的条目，避免重复
     * - startTime/endTime 不复制（避免时间误导），duration/优先级/子条目/任务关联全部保留
     * @param {string} fromDate  源日期 YYYY-MM-DD
     * @param {string} toDate    目标日期 YYYY-MM-DD
     * @param {Object} [options]
     * @param {boolean} [options.skipDuplicates=true]  跳过描述+项目相同的条目
     * @param {boolean} [options.copySubItems=true]    是否复制子条目
     * @returns {Promise<{copied:number, skipped:number, total:number, entries:Array}>}
     */
    async copyEntriesFromDate(fromDate, toDate, options = {}) {
        const { skipDuplicates = true, copySubItems = true } = options;
        const sourceEntries = this._getEntriesForDate(fromDate);
        if (sourceEntries.length === 0) {
            return { copied: 0, skipped: 0, total: 0, entries: [] };
        }

        const existingKeys = new Set(
            this._getEntriesForDate(toDate).map(e => `${e.projectId}::${(e.description || '').trim()}`)
        );

        const now = Date.now();
        const created = [];
        let skipped = 0;

        sourceEntries
            .sort((a, b) => a.createdAt - b.createdAt)
            .forEach((src, idx) => {
                const key = `${src.projectId}::${(src.description || '').trim()}`;
                if (skipDuplicates && existingKeys.has(key)) {
                    skipped++;
                    return;
                }
                existingKeys.add(key);

                const subItems = copySubItems && Array.isArray(src.subItems)
                    ? src.subItems.map((si, i) => ({
                        id: this._genId('si'),
                        text: si.text || '',
                        createdAt: now + i
                    }))
                    : [];

                created.push({
                    id: this._genId('te'),
                    projectId: src.projectId || 'proj_default',
                    description: src.description || '',
                    date: toDate,
                    duration: Math.max(0, Math.round(src.duration || 0)),
                    startTime: '',
                    endTime: '',
                    tags: Array.isArray(src.tags) ? [...src.tags] : [],
                    memoId: src.memoId || null,
                    urgency: !!src.urgency,
                    importance: !!src.importance,
                    subItems,
                    createdAt: now + idx,
                    updatedAt: now + idx
                });
            });

        if (created.length > 0) {
            this._entries.push(...created);
            await this._saveEntries();
        }

        return {
            copied: created.length,
            skipped,
            total: sourceEntries.length,
            entries: created
        };
    }

    /**
     * 找到 dateStr 之前最近一天「有工时记录」的日期。
     * @param {string} dateStr
     * @param {number} [maxLookback=30]  最多回看天数，默认 30 天
     * @returns {string|null}
     */
    findPreviousEntryDate(dateStr, maxLookback = 30) {
        let cursor = this._shiftDate(dateStr, -1);
        for (let i = 0; i < maxLookback; i++) {
            if (this._getEntriesForDate(cursor).length > 0) {
                return cursor;
            }
            cursor = this._shiftDate(cursor, -1);
        }
        return null;
    }

    // ─── 计时器 ───
    async startTimer(projectId, description, memoId, urgency, importance) {
        if (this._timer) await this.stopTimer();
        this._timer = {
            projectId: projectId || 'proj_default',
            description: description || '',
            memoId: memoId || null,
            urgency: !!urgency,
            importance: !!importance,
            startedAt: Date.now()
        };
        await this._saveTimer();
        this._startTimerTick();
        this._updateTimerUI();
        this._updateDockBadge(true);
        this._setProductPage('active-timer');
    }

    async stopTimer() {
        if (!this._timer) return null;
        const elapsed = Math.round((Date.now() - this._timer.startedAt) / 60000);
        const now = new Date();
        const startDate = new Date(this._timer.startedAt);
        const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
        const entry = await this.addEntry({
            projectId: this._timer.projectId,
            description: this._timer.description,
            memoId: this._timer.memoId,
            date: startDateStr,
            duration: Math.max(1, elapsed),
            startTime: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
            endTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
            urgency: this._timer.urgency || false,
            importance: this._timer.importance || false,
        });
        this._timer = null;
        this._clearTimerTick();
        await this._saveTimer();
        this._updateTimerUI();
        this._updateDockBadge(false);
        this._restoreProductPage();
        return entry;
    }

    getTimerElapsed() {
        if (!this._timer) return 0;
        return Math.round((Date.now() - this._timer.startedAt) / 1000);
    }

    isTimerRunning() {
        return !!this._timer;
    }

    _startTimerTick() {
        this._clearTimerTick();
        this._timerInterval = setInterval(() => this._updateTimerUI(), 1000);
    }

    _clearTimerTick() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    _updateTimerUI() {
        const timerEl = this._panelEl?.querySelector('.wl-timer-display');
        if (!timerEl) return;
        if (this._timer) {
            timerEl.textContent = this._formatTimerElapsed(this.getTimerElapsed());
            timerEl.classList.add('wl-timer-running');
        } else {
            timerEl.textContent = '00:00';
            timerEl.classList.remove('wl-timer-running');
        }
        const startBtn = this._panelEl?.querySelector('.wl-timer-btn');
        if (startBtn) {
            startBtn.innerHTML = this._timer
                ? '<i class="fas fa-stop"></i>'
                : '<i class="fas fa-play"></i>';
            startBtn.title = this._timer ? '停止计时' : '开始计时';
            startBtn.classList.toggle('wl-timer-active', !!this._timer);
        }
    }

    _updateDockBadge(running) {
        const dockBtn = document.getElementById('worklog-dock-btn');
        if (dockBtn) {
            dockBtn.classList.toggle('wl-timing', running);
        }
    }

    // ─── 子条目管理 ───
    async addSubItem(entryId, text) {
        const entry = this._entries.find(e => e.id === entryId);
        if (!entry) return null;
        if (!Array.isArray(entry.subItems)) entry.subItems = [];
        const item = { id: this._genId('si'), text: (text || '').trim(), createdAt: Date.now() };
        entry.subItems.push(item);
        entry.updatedAt = Date.now();
        await this._saveEntries();
        return item;
    }

    async removeSubItem(entryId, subItemId) {
        const entry = this._entries.find(e => e.id === entryId);
        if (!entry || !Array.isArray(entry.subItems)) return;
        entry.subItems = entry.subItems.filter(si => si.id !== subItemId);
        entry.updatedAt = Date.now();
        await this._saveEntries();
    }

    async updateSubItem(entryId, subItemId, newText) {
        const entry = this._entries.find(e => e.id === entryId);
        if (!entry || !Array.isArray(entry.subItems)) return;
        const si = entry.subItems.find(s => s.id === subItemId);
        if (!si) return;
        si.text = (newText || '').trim();
        entry.updatedAt = Date.now();
        await this._saveEntries();
    }

    // ─── 四象限 ───
    _getQuadrant(entry) {
        if (entry.urgency && entry.importance) return 'q1';
        if (!entry.urgency && entry.importance) return 'q2';
        if (entry.urgency && !entry.importance) return 'q3';
        return 'q4';
    }

    getQuadrantEntries(dateStr) {
        const entries = this._getEntriesForDate(dateStr);
        const result = { q1: [], q2: [], q3: [], q4: [] };
        entries.forEach(e => {
            result[this._getQuadrant(e)].push(e);
        });
        Object.values(result).forEach(arr => arr.sort((a, b) => b.createdAt - a.createdAt));
        return result;
    }

    _getQuadrantRecommendation(dateStr) {
        const qe = this.getQuadrantEntries(dateStr);
        const incomplete = (arr) => arr.filter(e => e.duration <= 0 || !e.description);
        if (qe.q1.length > 0) return { quadrant: 'q1', message: `有 ${qe.q1.length} 项紧急且重要的工作，优先处理` };
        if (qe.q2.length > 0) return { quadrant: 'q2', message: `${qe.q2.length} 项重要工作等待你安排时间` };
        if (qe.q3.length > 0) return { quadrant: 'q3', message: `${qe.q3.length} 项紧急事务，快速处理` };
        return null;
    }

    // ─── 工时目标检查（供 background.js 调用） ───
    getTodayProgress() {
        const summary = this.getDailySummary(this._todayStr());
        const targetMinutes = 8 * 60;
        return {
            logged: summary.totalMinutes,
            target: targetMinutes,
            remaining: Math.max(0, targetMinutes - summary.totalMinutes),
            percentage: Math.min(100, Math.round((summary.totalMinutes / targetMinutes) * 100)),
            count: summary.count
        };
    }

    // ─── 统计 ───
    getDailySummary(dateStr) {
        const entries = this._getEntriesForDate(dateStr);
        const totalMinutes = entries.reduce((sum, e) => sum + (e.duration || 0), 0);
        const byProject = {};
        entries.forEach(e => {
            if (!byProject[e.projectId]) byProject[e.projectId] = { entries: [], total: 0 };
            byProject[e.projectId].entries.push(e);
            byProject[e.projectId].total += e.duration || 0;
        });
        return { date: dateStr, entries, totalMinutes, count: entries.length, byProject };
    }

    getWeeklySummary(dateStr) {
        const { start, end } = this._getWeekRange(dateStr || this._todayStr());
        const days = [];
        let cursor = start;
        while (cursor <= end) {
            days.push(this.getDailySummary(cursor));
            cursor = this._shiftDate(cursor, 1);
        }
        const totalMinutes = days.reduce((s, d) => s + d.totalMinutes, 0);
        const totalCount = days.reduce((s, d) => s + d.count, 0);
        const byProject = {};
        days.forEach(day => {
            Object.entries(day.byProject).forEach(([pid, data]) => {
                if (!byProject[pid]) byProject[pid] = { total: 0, entries: [] };
                byProject[pid].total += data.total;
                byProject[pid].entries.push(...data.entries);
            });
        });
        return { start, end, days, totalMinutes, totalCount, byProject };
    }

    generateWeeklyReportText(dateStr) {
        const summary = this.getWeeklySummary(dateStr);
        const lines = [];
        lines.push(`本周工作回顾（${summary.start} ~ ${summary.end}）`);
        lines.push(`总耗时：${this._formatDuration(summary.totalMinutes)}  共 ${summary.totalCount} 条记录`);
        lines.push('');
        const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        Object.entries(summary.byProject).forEach(([pid, data]) => {
            const proj = this._getProject(pid);
            lines.push(`📌 ${proj.name} — ${this._formatDuration(data.total)}`);
            const byDay = {};
            data.entries.forEach(e => {
                if (!byDay[e.date]) byDay[e.date] = [];
                byDay[e.date].push(e);
            });
            summary.days.forEach((day, idx) => {
                const dayEntries = byDay[day.date];
                if (dayEntries && dayEntries.length > 0) {
                    dayEntries.forEach(e => {
                        lines.push(`  • ${weekDays[idx]}：${e.description || '(无描述)'} (${this._formatDuration(e.duration)})`);
                    });
                }
            });
            lines.push('');
        });
        return lines.join('\n');
    }

    // ─── 面板 toggle ───
    toggle() {
        if (this._panelOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    openPanel() {
        if (this._panelOpen) return;
        this._returnFocus = document.activeElement;
        this._panelOpen = true;
        this._currentDate = this._todayStr();
        this._renderPanel();
        this._updateDockBadge(this.isTimerRunning());
        if (this._timer) this._startTimerTick();
        this._restoreProductPage();
    }

    closePanel() {
        this._panelOpen = false;
        this._clearTimerTick();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this._panelEventsAbort?.abort();
        this._panelEventsAbort = null;
        const dockBtn = document.getElementById('worklog-dock-btn');
        const visibleDockBtn = dockBtn?.getClientRects?.().length ? dockBtn : null;
        const insideLaunchpad = this._returnFocus?.closest?.('#dock-launchpad');
        const focusableReturn = this._returnFocus?.matches?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const returnTarget = this._returnFocus?.isConnected && focusableReturn && !insideLaunchpad
            ? this._returnFocus
            : (visibleDockBtn || document.getElementById('dock-launchpad-btn'));
        this._setBackgroundInert(false);
        window.ProductUIV5?.setShellPage?.('home');
        returnTarget?.focus?.({ preventScroll: true });
        setTimeout(() => {
            if (!this._panelOpen) returnTarget?.focus?.({ preventScroll: true });
        }, 120);
        if (this._overlayEl) {
            this._overlayEl.classList.remove('wl-overlay-visible');
        }
        if (this._panelEl) {
            this._panelEl.inert = true;
            this._panelEl.classList.add('wl-panel-closing');
            setTimeout(() => {
                this._panelEl?.remove();
                this._panelEl = null;
                this._overlayEl?.remove();
                this._overlayEl = null;
            }, 300);
        }
        if (dockBtn) dockBtn.classList.remove('active');
        this._returnFocus = null;
    }

    // ─── 面板渲染 ───
    _renderPanel() {
        if (this._panelEl) this._panelEl.remove();
        if (this._overlayEl) this._overlayEl.remove();

        const overlay = document.createElement('div');
        overlay.className = 'wl-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('click', () => this.closePanel());
        this._overlayEl = overlay;

        const panel = document.createElement('div');
        panel.className = 'wl-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'worklog-panel-title');
        panel.tabIndex = -1;
        this._panelEl = panel;

        panel.innerHTML = this._buildPanelHTML();
        document.body.appendChild(overlay);
        document.body.appendChild(panel);
        this._setBackgroundInert(true);

        requestAnimationFrame(() => {
            overlay.classList.add('wl-overlay-visible');
            panel.classList.add('wl-panel-visible');
        });

        this._bindPanelEvents(overlay);
        this._renderDayView();
        this._updateTimerUI();

        const dockBtn = document.getElementById('worklog-dock-btn');
        if (dockBtn) dockBtn.classList.add('active');
        requestAnimationFrame(() => {
            const initial = this._timer
                ? this._panelEl?.querySelector('.wl-timer-btn')
                : this._panelEl?.querySelector('.wl-desc-input');
            initial?.focus?.({ preventScroll: true });
        });
    }

    _setBackgroundInert(active) {
        if (active) {
            if (this._backgroundInertSiblings.length) return;
            this._backgroundInertSiblings = [...document.body.children]
                .filter(child => child !== this._panelEl && child !== this._overlayEl && !child.inert);
            this._backgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        this._backgroundInertSiblings.forEach(child => { child.inert = false; });
        this._backgroundInertSiblings = [];
    }

    _activeFocusSurface() {
        return this._panelEl?.querySelector('.wl-task-picker-overlay')
            || [...(this._panelEl?.querySelectorAll('.wl-form-overlay') || [])].pop()
            || this._panelEl;
    }

    _trapFocus(container, event) {
        const focusable = [...(container?.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
            .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
        if (!focusable.length) return;
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

    _buildPanelHTML() {
        const isToday = this._currentDate === this._todayStr();
        const summary = this.getDailySummary(this._currentDate);
        const progress = this.getTodayProgress();
        const projects = this.getActiveProjects();
        const timerProjId = this._timer?.projectId || '';
        const projectOptions = projects.map(p =>
            `<option value="${p.id}" ${p.id === timerProjId ? 'selected' : ''} style="color:${p.color}">${p.name}</option>`
        ).join('');
        const projectDigest = this._buildProjectDigest(summary);

        const quickDurBtns = this.QUICK_DURATIONS.map(d =>
            `<button class="wl-quick-dur-btn" data-minutes="${d.minutes}" title="快速添加 ${d.label}">${d.label}</button>`
        ).join('');

        return `
            <div class="wl-panel-header">
                <div class="wl-panel-title" id="worklog-panel-title">
                    <i class="fas fa-clipboard-list"></i> 工作日志
                </div>
                <div class="wl-date-nav">
                    <button class="wl-nav-btn" data-action="prev-day" title="前一天">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span class="wl-date-label${isToday ? ' wl-today' : ''}" data-action="goto-today" title="回到今天">
                        ${this._formatDate(this._currentDate)}
                        ${isToday ? ' <span class="wl-today-badge">今天</span>' : ''}
                    </span>
                    <button class="wl-nav-btn" data-action="next-day" title="后一天">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <button class="wl-close-btn" data-action="close" title="关闭" aria-label="关闭工作日志">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="wl-workbench-grid">
            <aside class="wl-capture-pane">
            <div class="wl-pane-heading"><span>快速记录</span><small>计时或补录</small></div>
            <div class="wl-quick-entry">
                <div class="wl-quick-row-top">
                    <input type="text" class="wl-input wl-desc-input" placeholder="今天要做什么..."
                           value="${this._timer ? this._escHtml(this._timer.description) : ''}">
                    <select class="wl-input wl-project-select">
                        ${projectOptions}
                    </select>
                    <button class="wl-task-link-btn${this._timer?.memoId ? ' wl-task-linked' : ''}" title="关联任务" data-memo-id="${this._timer?.memoId || ''}">
                        <i class="fas fa-link"></i>
                    </button>
                    <div class="wl-timer-display">00:00</div>
                    <button class="wl-timer-btn" title="开始计时">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="wl-manual-btn" title="手动录入" data-action="manual-entry">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="wl-quick-row-bottom">
                    <div class="wl-priority-toggles">
                        <button class="wl-pri-toggle wl-pri-urgent${this._timer?.urgency ? ' wl-pri-active' : ''}" data-pri="urgency" title="紧急" aria-pressed="${!!this._timer?.urgency}">
                            <i class="fas fa-bolt"></i> 紧急
                        </button>
                        <button class="wl-pri-toggle wl-pri-important${this._timer?.importance ? ' wl-pri-active' : ''}" data-pri="importance" title="重要" aria-pressed="${!!this._timer?.importance}">
                            <i class="fas fa-star"></i> 重要
                        </button>
                    </div>
                    <div class="wl-quick-durations">
                        ${quickDurBtns}
                    </div>
                </div>
            </div>

            <div class="wl-summary-bar">
                <div class="wl-summary-left">
                    <span class="wl-summary-time">
                        <i class="fas fa-clock"></i>
                        今日工时：<strong>${this._formatDuration(summary.totalMinutes)}</strong>
                    </span>
                    <div class="wl-progress-bar">
                        <div class="wl-progress-fill${progress.percentage >= 100 ? ' wl-progress-done' : ''}" style="width:${progress.percentage}%"></div>
                    </div>
                    <span class="wl-progress-text">${progress.percentage}%</span>
                </div>
                <div class="wl-summary-right">
                    <span class="wl-summary-count">共 <strong>${summary.count}</strong> 条</span>
                    <div class="wl-view-toggle">
                        <button class="wl-view-btn${this._viewMode === 'list' ? ' wl-view-active' : ''}" data-view="list" title="列表视图" aria-label="列表视图" aria-pressed="${this._viewMode === 'list'}">
                            <i class="fas fa-list"></i>
                        </button>
                        <button class="wl-view-btn${this._viewMode === 'quadrant' ? ' wl-view-active' : ''}" data-view="quadrant" title="四象限视图" aria-label="四象限视图" aria-pressed="${this._viewMode === 'quadrant'}">
                            <i class="fas fa-th-large"></i>
                        </button>
                    </div>
                </div>
            </div>
            </aside>

            <main class="wl-log-pane">
                <div class="wl-pane-heading"><span>当天记录</span><small>${summary.count} 条</small></div>
            <div class="wl-entries-container" id="wl-entries-container"></div>
            </main>

            <aside class="wl-insight-pane">
                <div class="wl-pane-heading"><span>今日概览</span><small>8 小时目标</small></div>
                <div class="wl-insight-metrics">
                    <div><strong>${this._formatDuration(summary.totalMinutes)}</strong><span>累计工时</span></div>
                    <div><strong>${progress.percentage}%</strong><span>目标进度</span></div>
                    <div><strong>${Object.keys(summary.byProject).length}</strong><span>活跃项目</span></div>
                </div>
                <div class="wl-insight-section">
                    <span class="wl-insight-label">项目分布</span>
                    <div class="wl-insight-project-list">${projectDigest || '<div class="wl-insight-empty">记录后将在这里显示投入分布</div>'}</div>
                </div>
                <button class="wl-insight-report" data-action="week-report"><i class="fas fa-chart-line"></i> 查看本周回顾</button>
            </aside>
            </div>

            <div class="wl-panel-footer">
                <button class="wl-footer-btn" data-action="copy-prev-day" title="复制前一天的任务到当前日期">
                    <i class="fas fa-copy"></i> 复制前日
                </button>
                <button class="wl-footer-btn" data-action="week-report" title="周报回顾">
                    <i class="fas fa-calendar-week"></i> 周报
                </button>
                <button class="wl-footer-btn" data-action="manage-projects" title="管理项目">
                    <i class="fas fa-folder-open"></i> 项目
                </button>
            </div>
        `;
    }

    _buildProjectDigest(summary) {
        return Object.entries(summary.byProject)
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 5)
            .map(([projectId, data]) => {
                const project = this._getProject(projectId);
                return `<div class="wl-insight-project">
                    <span class="wl-project-dot" style="background:${project.color}"></span>
                    <span>${this._escHtml(project.name)}</span>
                    <strong>${this._formatDuration(data.total)}</strong>
                </div>`;
            }).join('');
    }

    _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    _renderDayView() {
        const container = this._panelEl?.querySelector('#wl-entries-container');
        if (!container) return;

        if (this._viewMode === 'quadrant') {
            this._renderQuadrantView(container);
            return;
        }

        const summary = this.getDailySummary(this._currentDate);

        if (summary.count === 0) {
            const prevDate = this.findPreviousEntryDate(this._currentDate);
            const prevCount = prevDate ? this._getEntriesForDate(prevDate).length : 0;
            container.innerHTML = `
                <div class="wl-empty">
                    <i class="fas fa-coffee"></i>
                    <p>${this._currentDate === this._todayStr() ? '今天还没有记录工作日志' : '当天没有工作记录'}</p>
                    <p class="wl-empty-hint">记录今天的工作优先级，输入描述后开始计时或选择快捷时长</p>
                    ${prevDate ? `
                        <button class="wl-empty-action" data-action="copy-prev-day">
                            <i class="fas fa-copy"></i>
                            一键复制 ${this._formatDate(prevDate)} 的 ${prevCount} 条任务
                        </button>
                    ` : ''}
                </div>
            `;
            return;
        }

        const projectOrder = Object.keys(summary.byProject).sort((a, b) => {
            if (a === 'proj_default') return 1;
            if (b === 'proj_default') return -1;
            return summary.byProject[b].total - summary.byProject[a].total;
        });

        let html = '';
        projectOrder.forEach(pid => {
            const proj = this._getProject(pid);
            const data = summary.byProject[pid];
            const entries = [...data.entries].sort((a, b) => b.createdAt - a.createdAt);

            html += `
                <div class="wl-project-group">
                    <div class="wl-project-header">
                        <span class="wl-project-dot" style="background:${proj.color}"></span>
                        <span class="wl-project-name">${this._escHtml(proj.name)}</span>
                        <span class="wl-project-total">${this._formatDuration(data.total)}</span>
                    </div>
                    <div class="wl-entries-list">
            `;

            entries.forEach(entry => {
                html += this._renderEntryHTML(entry);
            });

            html += '</div></div>';
        });

        container.innerHTML = html;
        this._bindEntrySubItemEvents(container);
    }

    _renderEntryHTML(entry) {
        const memoTitle = entry.memoId ? this._getMemoTitle(entry.memoId) : null;
        const quadrant = this._getQuadrant(entry);
        const qDef = this.QUADRANTS.find(q => q.key === quadrant);
        const hasPriority = entry.urgency || entry.importance;
        const subItems = Array.isArray(entry.subItems) ? entry.subItems : [];

        const subItemsHtml = `
            <div class="wl-sub-items" data-entry-id="${entry.id}">
                ${subItems.map(si => `
                    <div class="wl-sub-item" data-si-id="${si.id}">
                        <span class="wl-si-bullet">→</span>
                        <span class="wl-si-text" data-action="edit-sub-item" data-entry-id="${entry.id}" data-si-id="${si.id}">${this._escHtml(si.text)}</span>
                        <input type="text" class="wl-si-edit-input" data-entry-id="${entry.id}" data-si-id="${si.id}" value="${this._escHtml(si.text)}">
                        <button class="wl-si-del" data-action="del-sub-item" data-entry-id="${entry.id}" data-si-id="${si.id}" title="删除">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('')}
                <div class="wl-si-add-row">
                    <input type="text" class="wl-si-input" data-entry-id="${entry.id}" placeholder="+ 添加详情..." >
                </div>
            </div>
        `;

        return `
            <div class="wl-entry wl-entry-${quadrant}" data-entry-id="${entry.id}">
                <div class="wl-entry-main">
                    <div class="wl-entry-left">
                        <button class="wl-epri-btn wl-epri-urgent${entry.urgency ? ' wl-epri-on' : ''}" data-action="toggle-urgency" data-id="${entry.id}" title="${entry.urgency ? '取消紧急' : '标记紧急'}">
                            <i class="fas fa-bolt"></i>
                        </button>
                        <button class="wl-epri-btn wl-epri-important${entry.importance ? ' wl-epri-on' : ''}" data-action="toggle-importance" data-id="${entry.id}" title="${entry.importance ? '取消重要' : '标记重要'}">
                            <i class="fas fa-star"></i>
                        </button>
                        <span class="wl-entry-desc">${this._escHtml(entry.description) || '<em>无描述</em>'}</span>
                    </div>
                    <span class="wl-entry-duration wl-dur-editable" data-action="edit-duration" data-id="${entry.id}" title="点击修改时长">${this._formatDuration(entry.duration)}</span>
                </div>
                <div class="wl-entry-meta">
                    ${entry.startTime ? `<span class="wl-entry-time">${entry.startTime}${entry.endTime ? ' → ' + entry.endTime : ''}</span>` : ''}
                    ${memoTitle ? `<span class="wl-entry-task-badge" title="关联任务: ${this._escHtml(memoTitle)}"><i class="fas fa-tasks"></i> ${this._escHtml(memoTitle)}</span>` : ''}
                    ${hasPriority ? `<span class="wl-entry-quadrant-badge wl-qb-${quadrant}">${qDef.icon} ${qDef.hint}</span>` : ''}
                </div>
                ${subItemsHtml}
                <div class="wl-entry-actions">
                    <button class="wl-entry-btn" data-action="edit-entry" data-id="${entry.id}" title="编辑">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="wl-entry-btn wl-entry-del" data-action="delete-entry" data-id="${entry.id}" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    _renderQuadrantView(container) {
        const qEntries = this.getQuadrantEntries(this._currentDate);
        const totalCount = Object.values(qEntries).reduce((s, arr) => s + arr.length, 0);

        if (totalCount === 0) {
            container.innerHTML = `
                <div class="wl-empty">
                    <i class="fas fa-th-large"></i>
                    <p>还没有设置工作优先级</p>
                    <p class="wl-empty-hint">添加工作日志时，标记「紧急」和「重要」来规划四象限</p>
                </div>
            `;
            return;
        }

        const recommendation = this._getQuadrantRecommendation(this._currentDate);

        let html = '';
        if (recommendation) {
            html += `<div class="wl-q-recommend"><i class="fas fa-lightbulb"></i> ${recommendation.message}</div>`;
        }

        html += '<div class="wl-quadrant-grid">';
        this.QUADRANTS.forEach(q => {
            const entries = qEntries[q.key];
            const totalMin = entries.reduce((s, e) => s + (e.duration || 0), 0);
            html += `
                <div class="wl-q-cell wl-q-${q.key}">
                    <div class="wl-q-header">
                        <span class="wl-q-icon">${q.icon}</span>
                        <span class="wl-q-label">${q.label}</span>
                        <span class="wl-q-hint">${q.hint}</span>
                        ${totalMin > 0 ? `<span class="wl-q-total">${this._formatDuration(totalMin)}</span>` : ''}
                    </div>
                    <div class="wl-q-entries">
                        ${entries.length === 0 ? '<div class="wl-q-empty">—</div>' : entries.map(entry => `
                            <div class="wl-q-entry" data-entry-id="${entry.id}">
                                <span class="wl-q-entry-desc">${this._escHtml(entry.description) || '<em>无描述</em>'}</span>
                                <span class="wl-q-entry-dur">${this._formatDuration(entry.duration)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;
    }

    _bindEntrySubItemEvents(container) {
        container.querySelectorAll('.wl-si-input').forEach(input => {
            input.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && input.value.trim()) {
                    const entryId = input.dataset.entryId;
                    await this.addSubItem(entryId, input.value.trim());
                    input.value = '';
                    this._refreshPanel();
                }
            });
        });

        container.querySelectorAll('[data-action="del-sub-item"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.removeSubItem(btn.dataset.entryId, btn.dataset.siId);
                this._refreshPanel();
            });
        });

        container.querySelectorAll('[data-action="edit-sub-item"]').forEach(span => {
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                const row = span.closest('.wl-sub-item');
                if (row.classList.contains('wl-si-editing')) return;
                row.classList.add('wl-si-editing');
                const input = row.querySelector('.wl-si-edit-input');
                if (input) {
                    input.value = span.textContent;
                    input.focus();
                    input.select();
                }
            });
        });

        container.querySelectorAll('.wl-si-edit-input').forEach(input => {
            const commitEdit = async () => {
                const row = input.closest('.wl-sub-item');
                if (!row.classList.contains('wl-si-editing')) return;
                const newText = input.value.trim();
                const entryId = input.dataset.entryId;
                const siId = input.dataset.siId;
                if (newText) {
                    await this.updateSubItem(entryId, siId, newText);
                } else {
                    await this.removeSubItem(entryId, siId);
                }
                this._refreshPanel();
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
                if (e.key === 'Escape') {
                    const row = input.closest('.wl-sub-item');
                    row.classList.remove('wl-si-editing');
                }
            });
            input.addEventListener('blur', () => commitEdit());
        });
    }

    _refreshPanel() {
        if (!this._panelOpen || !this._panelEl) return;
        const summary = this.getDailySummary(this._currentDate);
        const progress = this.getTodayProgress();
        const summaryTime = this._panelEl.querySelector('.wl-summary-time strong');
        const summaryCount = this._panelEl.querySelector('.wl-summary-count strong');
        if (summaryTime) summaryTime.textContent = this._formatDuration(summary.totalMinutes);
        if (summaryCount) summaryCount.textContent = summary.count;
        const progressFill = this._panelEl.querySelector('.wl-progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progress.percentage}%`;
            progressFill.classList.toggle('wl-progress-done', progress.percentage >= 100);
        }
        const progressText = this._panelEl.querySelector('.wl-progress-text');
        if (progressText) progressText.textContent = `${progress.percentage}%`;
        const insightValues = this._panelEl.querySelectorAll('.wl-insight-metrics strong');
        if (insightValues[0]) insightValues[0].textContent = this._formatDuration(summary.totalMinutes);
        if (insightValues[1]) insightValues[1].textContent = `${progress.percentage}%`;
        if (insightValues[2]) insightValues[2].textContent = Object.keys(summary.byProject).length;
        const insightProjects = this._panelEl.querySelector('.wl-insight-project-list');
        if (insightProjects) {
            insightProjects.innerHTML = this._buildProjectDigest(summary)
                || '<div class="wl-insight-empty">记录后将在这里显示投入分布</div>';
        }
        this._renderDayView();
    }

    // ─── 事件绑定 ───
    _bindPanelEvents(overlay) {
        const panel = this._panelEl;
        if (!panel) return;
        this._panelEventsAbort?.abort();
        this._panelEventsAbort = new AbortController();
        const eventOptions = { signal: this._panelEventsAbort.signal };

        panel.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;

            switch (action) {
                case 'close':
                    this.closePanel();
                    break;
                case 'prev-day':
                    this._currentDate = this._shiftDate(this._currentDate, -1);
                    this._updateDateNav();
                    this._refreshPanel();
                    break;
                case 'next-day':
                    this._currentDate = this._shiftDate(this._currentDate, 1);
                    this._updateDateNav();
                    this._refreshPanel();
                    break;
                case 'goto-today':
                    this._currentDate = this._todayStr();
                    this._updateDateNav();
                    this._refreshPanel();
                    break;
                case 'manual-entry':
                    this._showManualEntryForm();
                    break;
                case 'edit-entry':
                    this._showEditEntryForm(btn.dataset.id);
                    break;
                case 'delete-entry':
                    if (confirm('确定删除这条记录？')) {
                        await this.deleteEntry(btn.dataset.id);
                        this._refreshPanel();
                    }
                    break;
                case 'toggle-urgency': {
                    const entry = this._entries.find(en => en.id === btn.dataset.id);
                    if (entry) {
                        await this.updateEntry(btn.dataset.id, { urgency: !entry.urgency });
                        this._refreshPanel();
                    }
                    break;
                }
                case 'toggle-importance': {
                    const entry = this._entries.find(en => en.id === btn.dataset.id);
                    if (entry) {
                        await this.updateEntry(btn.dataset.id, { importance: !entry.importance });
                        this._refreshPanel();
                    }
                    break;
                }
                case 'edit-duration':
                    this._showDurationPopover(btn, btn.dataset.id);
                    break;
                case 'week-report':
                    this._showWeekReport();
                    break;
                case 'manage-projects':
                    this._showProjectManager();
                    break;
                case 'copy-prev-day':
                    this._showCopyPrevDayDialog();
                    break;
            }
        }, eventOptions);

        // 优先级切换按钮（计时中实时同步到 timer 持久化）
        panel.querySelectorAll('.wl-pri-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('wl-pri-active');
                btn.setAttribute('aria-pressed', String(btn.classList.contains('wl-pri-active')));
                if (this._timer) {
                    this._timer.urgency = panel.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false;
                    this._timer.importance = panel.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false;
                    this._saveTimer();
                }
            }, eventOptions);
        });

        // 快捷时长按钮
        panel.querySelectorAll('.wl-quick-dur-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const desc = panel.querySelector('.wl-desc-input')?.value?.trim() || '';
                const projId = panel.querySelector('.wl-project-select')?.value || 'proj_default';
                const memoId = panel.querySelector('.wl-task-link-btn')?.dataset?.memoId || null;
                const urgency = panel.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false;
                const importance = panel.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false;
                const minutes = parseInt(btn.dataset.minutes);
                if (minutes > 0) {
                    await this.addEntry({
                        description: desc,
                        projectId: projId,
                        memoId,
                        duration: minutes,
                        date: this._currentDate,
                        urgency,
                        importance
                    });
                    const descInput = panel.querySelector('.wl-desc-input');
                    if (descInput) descInput.value = '';
                    this._resetPriorityToggles();
                    this._refreshPanel();
                }
            }, eventOptions);
        });

        // 视图切换
        panel.querySelectorAll('.wl-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view === this._viewMode) return;
                this._viewMode = view;
                panel.querySelectorAll('.wl-view-btn').forEach(b => b.classList.remove('wl-view-active'));
                panel.querySelectorAll('.wl-view-btn').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
                btn.classList.add('wl-view-active');
                this._renderDayView();
                this._restoreProductPage();
            }, eventOptions);
        });

        const taskLinkBtn = panel.querySelector('.wl-task-link-btn');
        if (taskLinkBtn) {
            taskLinkBtn.addEventListener('click', () => {
                this._showTaskPicker((memoId, memoTitle) => {
                    taskLinkBtn.dataset.memoId = memoId || '';
                    taskLinkBtn.classList.toggle('wl-task-linked', !!memoId);
                    taskLinkBtn.title = memoId ? `已关联: ${memoTitle}` : '关联任务';
                    if (this._timer && memoId) {
                        this._timer.memoId = memoId;
                        this._saveTimer();
                    }
                }, taskLinkBtn.dataset.memoId || null);
            }, eventOptions);
        }

        const timerBtn = panel.querySelector('.wl-timer-btn');
        if (timerBtn) {
            timerBtn.addEventListener('click', async () => {
                if (this._timer) {
                    const descInput = panel.querySelector('.wl-desc-input');
                    if (descInput && descInput.value.trim()) {
                        this._timer.description = descInput.value.trim();
                    }
                    this._timer.urgency = panel.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false;
                    this._timer.importance = panel.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false;
                    await this.stopTimer();
                    if (descInput) descInput.value = '';
                    const linkBtn = panel.querySelector('.wl-task-link-btn');
                    if (linkBtn) { linkBtn.dataset.memoId = ''; linkBtn.classList.remove('wl-task-linked'); linkBtn.title = '关联任务'; }
                    this._resetPriorityToggles();
                    this._refreshPanel();
                } else {
                    const desc = panel.querySelector('.wl-desc-input')?.value?.trim() || '';
                    const projId = panel.querySelector('.wl-project-select')?.value || 'proj_default';
                    const memoId = panel.querySelector('.wl-task-link-btn')?.dataset?.memoId || null;
                    const urgency = panel.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false;
                    const importance = panel.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false;
                    this.startTimer(projId, desc, memoId, urgency, importance);
                }
            }, eventOptions);
        }

        const descInput = panel.querySelector('.wl-desc-input');
        if (descInput) {
            descInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this._timer) {
                    const desc = descInput.value.trim();
                    if (desc) {
                        const projId = panel.querySelector('.wl-project-select')?.value || 'proj_default';
                        const memoId = panel.querySelector('.wl-task-link-btn')?.dataset?.memoId || null;
                        const urgency = panel.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false;
                        const importance = panel.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false;
                        this.startTimer(projId, desc, memoId, urgency, importance);
                    }
                }
            }, eventOptions);
        }

        if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
        this._escHandler = (e) => {
            if (e.key === 'Tab') {
                this._trapFocus(this._activeFocusSurface(), e);
                return;
            }
            if (e.key === 'Escape' && this._panelOpen) {
                const surface = this._activeFocusSurface();
                const dismiss = surface?.querySelector('.wl-tp-close, #wl-form-cancel, #wl-week-close, #wl-proj-close, [data-copy-action="close"]');
                if (dismiss) { dismiss.click(); return; }
                this.closePanel();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    _showDurationPopover(anchor, entryId) {
        const existing = this._panelEl?.querySelector('.wl-dur-popover');
        if (existing) existing.remove();

        const entry = this._entries.find(e => e.id === entryId);
        if (!entry) return;

        const h = Math.floor(entry.duration / 60);
        const m = entry.duration % 60;

        const pop = document.createElement('div');
        pop.className = 'wl-dur-popover';
        pop.innerHTML = `
            <div class="wl-durp-title">修改时长</div>
            <div class="wl-durp-inputs">
                <input type="number" class="wl-input wl-durp-h" min="0" max="23" value="${h}" placeholder="时">
                <span>h</span>
                <input type="number" class="wl-input wl-durp-m" min="0" max="59" value="${m}" placeholder="分">
                <span>m</span>
            </div>
            <div class="wl-durp-quick">
                ${this.QUICK_DURATIONS.map(d =>
                    `<button class="wl-durp-qbtn${entry.duration === d.minutes ? ' wl-durp-cur' : ''}" data-min="${d.minutes}">${d.label}</button>`
                ).join('')}
            </div>
            <div class="wl-durp-actions">
                <button class="wl-btn wl-btn-cancel wl-durp-close">取消</button>
                <button class="wl-btn wl-btn-save wl-durp-save">确定</button>
            </div>
        `;

        const rect = anchor.getBoundingClientRect();
        const panelRect = this._panelEl.getBoundingClientRect();
        pop.style.position = 'absolute';
        pop.style.top = `${rect.bottom - panelRect.top + 4}px`;
        pop.style.right = `${panelRect.right - rect.right}px`;

        this._panelEl.appendChild(pop);
        requestAnimationFrame(() => pop.classList.add('wl-durp-visible'));

        pop.querySelectorAll('.wl-durp-qbtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const dur = parseInt(btn.dataset.min);
                await this.updateEntry(entryId, { duration: dur });
                pop.remove();
                this._refreshPanel();
            });
        });

        pop.querySelector('.wl-durp-save').addEventListener('click', async () => {
            const hours = parseInt(pop.querySelector('.wl-durp-h').value) || 0;
            const mins = parseInt(pop.querySelector('.wl-durp-m').value) || 0;
            const dur = hours * 60 + mins;
            if (dur > 0) {
                await this.updateEntry(entryId, { duration: dur });
            }
            pop.remove();
            this._refreshPanel();
        });

        pop.querySelector('.wl-durp-close').addEventListener('click', () => pop.remove());

        const dismiss = (e) => {
            if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
                pop.remove();
                document.removeEventListener('mousedown', dismiss);
            }
        };
        setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
    }

    _resetPriorityToggles() {
        this._panelEl?.querySelectorAll('.wl-pri-toggle').forEach(btn => {
            btn.classList.remove('wl-pri-active');
            btn.setAttribute('aria-pressed', 'false');
        });
    }

    _getQuickEntryPriority() {
        return {
            urgency: this._panelEl?.querySelector('.wl-pri-toggle[data-pri="urgency"]')?.classList.contains('wl-pri-active') || false,
            importance: this._panelEl?.querySelector('.wl-pri-toggle[data-pri="importance"]')?.classList.contains('wl-pri-active') || false,
        };
    }

    _updateDateNav() {
        const label = this._panelEl?.querySelector('.wl-date-label');
        if (!label) return;
        const isToday = this._currentDate === this._todayStr();
        label.innerHTML = `${this._formatDate(this._currentDate)}${isToday ? ' <span class="wl-today-badge">今天</span>' : ''}`;
        label.classList.toggle('wl-today', isToday);
    }

    // ─── 手动录入表单 ───
    _showManualEntryForm(editEntry = null) {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();
        const formReturnFocus = document.activeElement;
        this._setProductPage('manual-entry');

        const projects = this.getActiveProjects();
        const projectOptions = projects.map(p =>
            `<option value="${p.id}" ${editEntry && editEntry.projectId === p.id ? 'selected' : ''}>${p.name}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'wl-form-overlay';

        const isEdit = !!editEntry;
        const durH = editEntry ? Math.floor(editEntry.duration / 60) : 0;
        const durM = editEntry ? editEntry.duration % 60 : 0;

        const linkedMemo = editEntry?.memoId ? this._getMemoTitle(editEntry.memoId) : null;

        overlay.innerHTML = `
            <div class="wl-form" role="dialog" aria-modal="true" aria-labelledby="wl-manual-title">
                <div class="wl-form-title" id="wl-manual-title">${isEdit ? '编辑记录' : '添加工时记录'}</div>
                <div class="wl-form-group">
                    <label>做了什么</label>
                    <input type="text" class="wl-input" id="wl-form-desc" value="${this._escHtml(editEntry?.description || '')}" placeholder="工作内容描述..." autofocus>
                </div>
                <div class="wl-form-row">
                    <div class="wl-form-group" style="flex:1">
                        <label>项目</label>
                        <select class="wl-input" id="wl-form-project">${projectOptions}</select>
                    </div>
                    <div class="wl-form-group" style="flex:1">
                        <label>关联任务</label>
                        <div class="wl-task-picker-wrap">
                            <input type="hidden" id="wl-form-memo-id" value="${editEntry?.memoId || ''}">
                            <button type="button" class="wl-input wl-task-picker-btn" id="wl-form-task-btn">
                                ${linkedMemo
                                    ? `<span class="wl-task-pick-name">${this._escHtml(linkedMemo)}</span><span class="wl-task-pick-clear" title="取消关联">&times;</span>`
                                    : '<span class="wl-task-pick-placeholder">选择任务（可选）</span>'}
                            </button>
                        </div>
                    </div>
                </div>
                <div class="wl-form-row">
                    <div class="wl-form-group">
                        <label>耗时</label>
                        <div class="wl-duration-input">
                            <input type="number" class="wl-input wl-dur-h" id="wl-form-hours" min="0" max="23" value="${durH}" placeholder="时">
                            <span>h</span>
                            <input type="number" class="wl-input wl-dur-m" id="wl-form-minutes" min="0" max="59" value="${durM}" placeholder="分">
                            <span>m</span>
                        </div>
                    </div>
                    <div class="wl-form-group">
                        <label>日期</label>
                        <input type="date" class="wl-input" id="wl-form-date" value="${editEntry?.date || this._currentDate}">
                    </div>
                </div>
                <div class="wl-form-group">
                    <label>优先级</label>
                    <div class="wl-form-priority">
                        <button type="button" class="wl-fpri-btn wl-fpri-urgent${editEntry?.urgency ? ' wl-fpri-active' : ''}" id="wl-form-urgent">
                            <i class="fas fa-bolt"></i> 紧急
                        </button>
                        <button type="button" class="wl-fpri-btn wl-fpri-important${editEntry?.importance ? ' wl-fpri-active' : ''}" id="wl-form-important">
                            <i class="fas fa-star"></i> 重要
                        </button>
                        <span class="wl-fpri-hint" id="wl-form-pri-hint">${this._getPriorityHint(editEntry?.urgency, editEntry?.importance)}</span>
                    </div>
                </div>
                <div class="wl-form-actions">
                    <button class="wl-btn wl-btn-cancel" id="wl-form-cancel">取消</button>
                    <button class="wl-btn wl-btn-save" id="wl-form-save">${isEdit ? '保存' : '添加'}</button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('wl-form-visible');
            overlay.querySelector('#wl-form-desc')?.focus({ preventScroll: true });
        });

        overlay.querySelector('#wl-form-cancel').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => {
                overlay.remove();
                const target = formReturnFocus?.isConnected ? formReturnFocus : this._panelEl?.querySelector('[data-action="manual-entry"]');
                target?.focus?.({ preventScroll: true });
            }, 200);
            this._restoreProductPage();
        });

        const updatePriHint = () => {
            const u = overlay.querySelector('#wl-form-urgent').classList.contains('wl-fpri-active');
            const i = overlay.querySelector('#wl-form-important').classList.contains('wl-fpri-active');
            const hint = overlay.querySelector('#wl-form-pri-hint');
            if (hint) hint.textContent = this._getPriorityHint(u, i);
        };

        overlay.querySelector('#wl-form-urgent').addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('wl-fpri-active');
            updatePriHint();
        });
        overlay.querySelector('#wl-form-important').addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('wl-fpri-active');
            updatePriHint();
        });

        const taskBtn = overlay.querySelector('#wl-form-task-btn');
        if (taskBtn) {
            taskBtn.addEventListener('click', (e) => {
                if (e.target.closest('.wl-task-pick-clear')) {
                    overlay.querySelector('#wl-form-memo-id').value = '';
                    taskBtn.innerHTML = '<span class="wl-task-pick-placeholder">选择任务（可选）</span>';
                    return;
                }
                this._showTaskPicker((memoId, memoTitle) => {
                    overlay.querySelector('#wl-form-memo-id').value = memoId || '';
                    taskBtn.innerHTML = memoId
                        ? `<span class="wl-task-pick-name">${this._escHtml(memoTitle)}</span><span class="wl-task-pick-clear" title="取消关联">&times;</span>`
                        : '<span class="wl-task-pick-placeholder">选择任务（可选）</span>';
                }, overlay.querySelector('#wl-form-memo-id').value || null);
            });
        }

        overlay.querySelector('#wl-form-save').addEventListener('click', async () => {
            const desc = overlay.querySelector('#wl-form-desc').value.trim();
            const projId = overlay.querySelector('#wl-form-project').value;
            const hours = parseInt(overlay.querySelector('#wl-form-hours').value) || 0;
            const minutes = parseInt(overlay.querySelector('#wl-form-minutes').value) || 0;
            const date = overlay.querySelector('#wl-form-date').value;
            const duration = hours * 60 + minutes;
            const memoId = overlay.querySelector('#wl-form-memo-id')?.value || null;
            const urgency = overlay.querySelector('#wl-form-urgent').classList.contains('wl-fpri-active');
            const importance = overlay.querySelector('#wl-form-important').classList.contains('wl-fpri-active');

            if (duration <= 0) {
                overlay.querySelector('#wl-form-hours').classList.add('wl-input-error');
                return;
            }

            if (isEdit) {
                await this.updateEntry(editEntry.id, { description: desc, projectId: projId, duration, date, memoId, urgency, importance });
            } else {
                await this.addEntry({ description: desc, projectId: projId, duration, date, memoId, urgency, importance });
            }

            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
            this._refreshPanel();
            this._restoreProductPage();
        });

        overlay.querySelector('#wl-form-desc').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('#wl-form-save').click();
        });
    }

    _getPriorityHint(urgency, importance) {
        if (urgency && importance) return '🔴 紧急且重要 — 立即做';
        if (importance) return '🟡 重要不紧急 — 计划做';
        if (urgency) return '🔵 紧急不重要 — 快速处理';
        return '';
    }

    _showEditEntryForm(entryId) {
        const entry = this._entries.find(e => e.id === entryId);
        if (entry) this._showManualEntryForm(entry);
    }

    // ─── 周报视图 ───
    _showWeekReport() {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();
        const reportReturnFocus = document.activeElement;
        this._setProductPage('weekly-report');

        const summary = this.getWeeklySummary(this._currentDate);
        const reportText = this.generateWeeklyReportText(this._currentDate);
        const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        const maxMinutes = Math.max(...summary.days.map(d => d.totalMinutes), 1);

        let barChartHtml = summary.days.map((day, idx) => {
            const pct = Math.round((day.totalMinutes / maxMinutes) * 100);
            const isToday = day.date === this._todayStr();
            return `
                <div class="wl-bar-item${isToday ? ' wl-bar-today' : ''}">
                    <div class="wl-bar-label">${weekDays[idx]}</div>
                    <div class="wl-bar-track">
                        <div class="wl-bar-fill" style="width:${pct}%"></div>
                    </div>
                    <div class="wl-bar-value">${this._formatDuration(day.totalMinutes)}</div>
                </div>
            `;
        }).join('');

        const overlay = document.createElement('div');
        overlay.className = 'wl-form-overlay';
        overlay.innerHTML = `
            <div class="wl-form wl-week-report" role="dialog" aria-modal="true" aria-labelledby="wl-week-title">
                <div class="wl-form-title" id="wl-week-title">
                    <i class="fas fa-calendar-week"></i>
                    周报回顾（${summary.start} ~ ${summary.end}）
                </div>
                <div class="wl-week-summary">
                    <div class="wl-week-stat">
                        <div class="wl-week-stat-value">${this._formatDuration(summary.totalMinutes)}</div>
                        <div class="wl-week-stat-label">总工时</div>
                    </div>
                    <div class="wl-week-stat">
                        <div class="wl-week-stat-value">${summary.totalCount}</div>
                        <div class="wl-week-stat-label">条记录</div>
                    </div>
                    <div class="wl-week-stat">
                        <div class="wl-week-stat-value">${Object.keys(summary.byProject).length}</div>
                        <div class="wl-week-stat-label">个项目</div>
                    </div>
                </div>
                <div class="wl-bar-chart">${barChartHtml}</div>
                <div class="wl-form-actions">
                    <button class="wl-btn wl-btn-cancel" id="wl-week-close">关闭</button>
                    <button class="wl-btn wl-btn-save" id="wl-week-copy">
                        <i class="fas fa-copy"></i> 复制周报
                    </button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('wl-form-visible');
            overlay.querySelector('#wl-week-close')?.focus({ preventScroll: true });
        });

        overlay.querySelector('#wl-week-close').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => {
                overlay.remove();
                const target = reportReturnFocus?.isConnected ? reportReturnFocus : this._panelEl?.querySelector('[data-action="week-report"]');
                target?.focus?.({ preventScroll: true });
            }, 200);
            this._restoreProductPage();
        });

        overlay.querySelector('#wl-week-copy').addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(reportText);
                const btn = overlay.querySelector('#wl-week-copy');
                btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> 复制周报'; }, 2000);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = reportText;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
        });
    }

    // ─── 复制前一天任务 ───
    _showCopyPrevDayDialog(sourceDateOverride) {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();

        const targetDate = this._currentDate;
        const sourceDate = sourceDateOverride || this.findPreviousEntryDate(targetDate);

        const overlay = document.createElement('div');
        overlay.className = 'wl-form-overlay';

        if (!sourceDate) {
            overlay.innerHTML = `
                <div class="wl-form wl-copy-dialog">
                    <div class="wl-form-title">
                        <i class="fas fa-copy"></i> 复制前一天任务
                    </div>
                    <div class="wl-copy-empty">
                        <i class="fas fa-inbox"></i>
                        <p>最近 30 天内没有可复制的工作记录</p>
                    </div>
                    <div class="wl-form-actions">
                        <button class="wl-btn wl-btn-cancel" data-copy-action="close">关闭</button>
                    </div>
                </div>
            `;
            this._panelEl.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));
            overlay.querySelector('[data-copy-action="close"]').addEventListener('click', () => {
                overlay.classList.remove('wl-form-visible');
                setTimeout(() => overlay.remove(), 200);
            });
            return;
        }

        const sourceEntries = this._getEntriesForDate(sourceDate)
            .slice()
            .sort((a, b) => a.createdAt - b.createdAt);
        const targetEntries = this._getEntriesForDate(targetDate);
        const targetKeys = new Set(
            targetEntries.map(e => `${e.projectId}::${(e.description || '').trim()}`)
        );

        const sourceLabel = this._formatDate(sourceDate);
        const targetLabel = this._formatDate(targetDate);

        const itemsHtml = sourceEntries.map(entry => {
            const proj = this._getProject(entry.projectId);
            const key = `${entry.projectId}::${(entry.description || '').trim()}`;
            const dup = targetKeys.has(key);
            const quadrant = this._getQuadrant(entry);
            const qDef = this.QUADRANTS.find(q => q.key === quadrant);
            const hasPriority = entry.urgency || entry.importance;
            return `
                <label class="wl-copy-item${dup ? ' wl-copy-item-dup' : ''}" data-entry-id="${entry.id}">
                    <input type="checkbox" class="wl-copy-check" data-entry-id="${entry.id}" ${dup ? '' : 'checked'}>
                    <span class="wl-copy-dot" style="background:${proj.color}"></span>
                    <span class="wl-copy-desc">
                        <span class="wl-copy-text">${this._escHtml(entry.description) || '<em>无描述</em>'}</span>
                        <span class="wl-copy-meta">
                            <span class="wl-copy-proj">${this._escHtml(proj.name)}</span>
                            <span class="wl-copy-dur">${this._formatDuration(entry.duration)}</span>
                            ${hasPriority ? `<span class="wl-copy-quad">${qDef.icon} ${qDef.hint}</span>` : ''}
                            ${dup ? '<span class="wl-copy-dup-tag">已存在</span>' : ''}
                        </span>
                    </span>
                </label>
            `;
        }).join('');

        const dupCount = sourceEntries.filter(e =>
            targetKeys.has(`${e.projectId}::${(e.description || '').trim()}`)
        ).length;

        overlay.innerHTML = `
            <div class="wl-form wl-copy-dialog">
                <div class="wl-form-title">
                    <i class="fas fa-copy"></i> 复制任务到 ${targetLabel}
                </div>
                <div class="wl-copy-summary">
                    <div class="wl-copy-route">
                        <span class="wl-copy-from">${sourceLabel}</span>
                        <i class="fas fa-arrow-right"></i>
                        <span class="wl-copy-to">${targetLabel}</span>
                    </div>
                    <div class="wl-copy-hint">
                        共 ${sourceEntries.length} 条记录${dupCount > 0 ? `，其中 ${dupCount} 条已存在（默认跳过）` : ''}
                    </div>
                </div>
                <div class="wl-copy-toolbar">
                    <button type="button" class="wl-copy-toolbtn" data-copy-action="select-all">全选</button>
                    <button type="button" class="wl-copy-toolbtn" data-copy-action="select-none">全不选</button>
                    <button type="button" class="wl-copy-toolbtn" data-copy-action="select-new">仅选新增</button>
                    <label class="wl-copy-subitems-toggle">
                        <input type="checkbox" id="wl-copy-subitems" checked>
                        <span>包含子条目</span>
                    </label>
                </div>
                <div class="wl-copy-list">${itemsHtml}</div>
                <div class="wl-form-actions">
                    <button class="wl-btn wl-btn-cancel" data-copy-action="close">取消</button>
                    <button class="wl-btn wl-btn-save" data-copy-action="confirm">
                        <i class="fas fa-copy"></i> 复制选中项
                    </button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));

        const close = () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
        };

        overlay.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-copy-action]');
            if (!target) return;
            const action = target.dataset.copyAction;

            if (action === 'close') {
                close();
                return;
            }

            if (action === 'select-all') {
                overlay.querySelectorAll('.wl-copy-check').forEach(cb => { cb.checked = true; });
                return;
            }

            if (action === 'select-none') {
                overlay.querySelectorAll('.wl-copy-check').forEach(cb => { cb.checked = false; });
                return;
            }

            if (action === 'select-new') {
                overlay.querySelectorAll('.wl-copy-item').forEach(item => {
                    const cb = item.querySelector('.wl-copy-check');
                    if (cb) cb.checked = !item.classList.contains('wl-copy-item-dup');
                });
                return;
            }

            if (action === 'confirm') {
                const checkedIds = Array.from(overlay.querySelectorAll('.wl-copy-check'))
                    .filter(cb => cb.checked)
                    .map(cb => cb.dataset.entryId);
                if (checkedIds.length === 0) {
                    close();
                    return;
                }
                const copySubItems = overlay.querySelector('#wl-copy-subitems')?.checked !== false;
                target.disabled = true;
                target.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 复制中...';

                const selectedSet = new Set(checkedIds);
                const result = await this._copySelectedEntries(
                    sourceDate,
                    targetDate,
                    selectedSet,
                    { copySubItems }
                );

                close();
                this._refreshPanel();
                this._toast(`已复制 ${result.copied} 条任务到 ${targetLabel}${result.skipped > 0 ? `（跳过 ${result.skipped} 条重复项）` : ''}`);
            }
        });
    }

    /**
     * 内部方法：复制源日期中选中 ID 集合的条目到目标日期。
     */
    async _copySelectedEntries(fromDate, toDate, selectedIdSet, options = {}) {
        const { copySubItems = true } = options;
        const sourceEntries = this._getEntriesForDate(fromDate)
            .filter(e => selectedIdSet.has(e.id))
            .sort((a, b) => a.createdAt - b.createdAt);

        if (sourceEntries.length === 0) return { copied: 0, skipped: 0 };

        const existingKeys = new Set(
            this._getEntriesForDate(toDate).map(e => `${e.projectId}::${(e.description || '').trim()}`)
        );

        const now = Date.now();
        const created = [];
        let skipped = 0;

        sourceEntries.forEach((src, idx) => {
            const key = `${src.projectId}::${(src.description || '').trim()}`;
            if (existingKeys.has(key)) {
                skipped++;
                return;
            }
            existingKeys.add(key);

            const subItems = copySubItems && Array.isArray(src.subItems)
                ? src.subItems.map((si, i) => ({
                    id: this._genId('si'),
                    text: si.text || '',
                    createdAt: now + i
                }))
                : [];

            created.push({
                id: this._genId('te'),
                projectId: src.projectId || 'proj_default',
                description: src.description || '',
                date: toDate,
                duration: Math.max(0, Math.round(src.duration || 0)),
                startTime: '',
                endTime: '',
                tags: Array.isArray(src.tags) ? [...src.tags] : [],
                memoId: src.memoId || null,
                urgency: !!src.urgency,
                importance: !!src.importance,
                subItems,
                createdAt: now + idx,
                updatedAt: now + idx
            });
        });

        if (created.length > 0) {
            this._entries.push(...created);
            await this._saveEntries();
        }

        return { copied: created.length, skipped };
    }

    _toast(message) {
        const existing = this._panelEl?.querySelector('.wl-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'wl-toast';
        toast.textContent = message;
        this._panelEl?.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('wl-toast-visible'));
        setTimeout(() => {
            toast.classList.remove('wl-toast-visible');
            setTimeout(() => toast.remove(), 300);
        }, 2400);
    }

    // ─── 项目管理 ───
    _showProjectManager() {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();
        const projectReturnFocus = document.activeElement;
        this._setProductPage('projects');

        const overlay = document.createElement('div');
        overlay.className = 'wl-form-overlay';

        const renderProjectList = () => {
            const projects = this.getActiveProjects();
            return projects.map(p => `
                <div class="wl-proj-item" data-proj-id="${p.id}">
                    <span class="wl-project-dot" style="background:${p.color}"></span>
                    <span class="wl-proj-name">${this._escHtml(p.name)}</span>
                    ${p.id !== 'proj_default' ? `
                        <button class="wl-entry-btn" data-proj-action="edit" data-proj-id="${p.id}" title="编辑">
                            <i class="fas fa-pen"></i>
                        </button>
                        <button class="wl-entry-btn wl-entry-del" data-proj-action="delete" data-proj-id="${p.id}" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');
        };

        overlay.innerHTML = `
            <div class="wl-form wl-proj-manager" role="dialog" aria-modal="true" aria-labelledby="wl-project-title">
                <div class="wl-form-title" id="wl-project-title"><i class="fas fa-folder-open"></i> 管理项目</div>
                <div class="wl-proj-list">${renderProjectList()}</div>
                <div class="wl-proj-add">
                    <input type="text" class="wl-input" id="wl-proj-name" placeholder="新项目名称...">
                    <div class="wl-color-picker" id="wl-color-picker">
                        ${this.PROJECT_COLORS.map(c =>
                            `<span class="wl-color-opt" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></span>`
                        ).join('')}
                    </div>
                    <button class="wl-btn wl-btn-save" id="wl-proj-add-btn">添加项目</button>
                </div>
                <div class="wl-form-actions">
                    <button class="wl-btn wl-btn-cancel" id="wl-proj-close">关闭</button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('wl-form-visible');
            overlay.querySelector('#wl-proj-name')?.focus({ preventScroll: true });
        });

        let selectedColor = this.PROJECT_COLORS[0].hex;
        overlay.querySelector(`[data-color="${selectedColor}"]`)?.classList.add('wl-color-selected');

        overlay.querySelector('#wl-color-picker').addEventListener('click', (e) => {
            const opt = e.target.closest('.wl-color-opt');
            if (!opt) return;
            overlay.querySelectorAll('.wl-color-opt').forEach(el => el.classList.remove('wl-color-selected'));
            opt.classList.add('wl-color-selected');
            selectedColor = opt.dataset.color;
        });

        overlay.querySelector('#wl-proj-add-btn').addEventListener('click', async () => {
            const name = overlay.querySelector('#wl-proj-name').value.trim();
            if (!name) return;
            await this.addProject(name, selectedColor);
            overlay.querySelector('.wl-proj-list').innerHTML = renderProjectList();
            overlay.querySelector('#wl-proj-name').value = '';
            this._updateProjectSelect();
        });

        overlay.querySelector('#wl-proj-name').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('#wl-proj-add-btn').click();
        });

        overlay.querySelector('.wl-proj-list').addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-proj-action]');
            if (!btn) return;
            const action = btn.dataset.projAction;
            const pid = btn.dataset.projId;

            if (action === 'delete') {
                if (confirm('删除项目后，相关记录会归到"未分类"。确定删除？')) {
                    await this.deleteProject(pid);
                    overlay.querySelector('.wl-proj-list').innerHTML = renderProjectList();
                    this._updateProjectSelect();
                    this._refreshPanel();
                }
            } else if (action === 'edit') {
                const proj = this._projects.find(p => p.id === pid);
                if (!proj) return;
                const newName = prompt('修改项目名称：', proj.name);
                if (newName && newName.trim()) {
                    await this.updateProject(pid, { name: newName.trim() });
                    overlay.querySelector('.wl-proj-list').innerHTML = renderProjectList();
                    this._updateProjectSelect();
                    this._refreshPanel();
                }
            }
        });

        overlay.querySelector('#wl-proj-close').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => {
                overlay.remove();
                const target = projectReturnFocus?.isConnected ? projectReturnFocus : this._panelEl?.querySelector('[data-action="manage-projects"]');
                target?.focus?.({ preventScroll: true });
            }, 200);
            this._restoreProductPage();
        });
    }

    _updateProjectSelect() {
        const select = this._panelEl?.querySelector('.wl-project-select');
        if (!select) return;
        const current = select.value;
        const projects = this.getActiveProjects();
        select.innerHTML = projects.map(p =>
            `<option value="${p.id}" ${p.id === current ? 'selected' : ''}>${p.name}</option>`
        ).join('');
    }

    // ─── 任务选择器弹窗 ───
    _showTaskPicker(onSelect, currentMemoId) {
        const existing = this._panelEl?.querySelector('.wl-task-picker-overlay');
        if (existing) existing.remove();
        const pickerReturnFocus = document.activeElement;

        const tasks = this._getTasksForPicker('');
        const overlay = document.createElement('div');
        overlay.className = 'wl-task-picker-overlay';

        const renderList = (items, selectedId) => {
            if (!items.length) return '<div class="wl-tp-empty">没有找到匹配的任务</div>';
            return items.map(t => `
                <div class="wl-tp-item${t.id === selectedId ? ' wl-tp-selected' : ''}${t.completed ? ' wl-tp-done' : ''}" data-task-id="${t.id}" data-task-title="${this._escHtml(t.title)}">
                    <span class="wl-tp-status">${t.completed ? '<i class="fas fa-check-circle"></i>' : '<i class="far fa-circle"></i>'}</span>
                    <span class="wl-tp-title">${this._escHtml(t.title)}</span>
                    ${t.priority && t.priority !== 'none' ? `<span class="wl-tp-pri wl-tp-pri-${t.priority}"></span>` : ''}
                </div>
            `).join('');
        };

        overlay.innerHTML = `
            <div class="wl-task-picker" role="dialog" aria-modal="true" aria-labelledby="wl-task-picker-title">
                <div class="wl-tp-header" id="wl-task-picker-title">
                    <i class="fas fa-tasks"></i> 选择关联任务
                </div>
                <div class="wl-tp-search-wrap">
                    <i class="fas fa-search wl-tp-search-icon"></i>
                    <input type="text" class="wl-input wl-tp-search" placeholder="搜索任务名称...">
                </div>
                <div class="wl-tp-list">${renderList(tasks, currentMemoId)}</div>
                <div class="wl-tp-actions">
                    <button class="wl-btn wl-btn-cancel wl-tp-clear">取消关联</button>
                    <button class="wl-btn wl-btn-cancel wl-tp-close">关闭</button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));

        const searchInput = overlay.querySelector('.wl-tp-search');
        const listEl = overlay.querySelector('.wl-tp-list');
        let debounceTimer = null;

        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const filtered = this._getTasksForPicker(searchInput.value);
                listEl.innerHTML = renderList(filtered, currentMemoId);
            }, 150);
        });
        searchInput.focus();

        listEl.addEventListener('click', (e) => {
            const item = e.target.closest('.wl-tp-item');
            if (!item) return;
            const taskId = item.dataset.taskId;
            const taskTitle = item.dataset.taskTitle;
            onSelect(taskId, taskTitle);
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => { overlay.remove(); pickerReturnFocus?.focus?.({ preventScroll: true }); }, 200);
        });

        overlay.querySelector('.wl-tp-clear').addEventListener('click', () => {
            onSelect(null, null);
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => { overlay.remove(); pickerReturnFocus?.focus?.({ preventScroll: true }); }, 200);
        });

        overlay.querySelector('.wl-tp-close').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => { overlay.remove(); pickerReturnFocus?.focus?.({ preventScroll: true }); }, 200);
        });
    }
}

window.workLogManager = new WorkLogManager();
