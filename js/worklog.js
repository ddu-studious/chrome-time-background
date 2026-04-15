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

    // ─── 计时器 ───
    async startTimer(projectId, description, memoId) {
        if (this._timer) await this.stopTimer();
        this._timer = {
            projectId: projectId || 'proj_default',
            description: description || '',
            memoId: memoId || null,
            startedAt: Date.now()
        };
        await this._saveTimer();
        this._startTimerTick();
        this._updateTimerUI();
        this._updateDockBadge(true);
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
            endTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        });
        this._timer = null;
        this._clearTimerTick();
        await this._saveTimer();
        this._updateTimerUI();
        this._updateDockBadge(false);
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
        this._panelOpen = true;
        this._currentDate = this._todayStr();
        this._renderPanel();
        this._updateDockBadge(this.isTimerRunning());
        if (this._timer) this._startTimerTick();
    }

    closePanel() {
        this._panelOpen = false;
        this._clearTimerTick();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._overlayEl) {
            this._overlayEl.classList.remove('wl-overlay-visible');
        }
        if (this._panelEl) {
            this._panelEl.classList.add('wl-panel-closing');
            setTimeout(() => {
                this._panelEl?.remove();
                this._panelEl = null;
                this._overlayEl?.remove();
                this._overlayEl = null;
            }, 300);
        }
        const dockBtn = document.getElementById('worklog-dock-btn');
        if (dockBtn) dockBtn.classList.remove('active');
    }

    // ─── 面板渲染 ───
    _renderPanel() {
        if (this._panelEl) this._panelEl.remove();
        if (this._overlayEl) this._overlayEl.remove();

        const overlay = document.createElement('div');
        overlay.className = 'wl-overlay';
        overlay.addEventListener('click', () => this.closePanel());
        this._overlayEl = overlay;

        const panel = document.createElement('div');
        panel.className = 'wl-panel';
        this._panelEl = panel;

        panel.innerHTML = this._buildPanelHTML();
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        requestAnimationFrame(() => {
            overlay.classList.add('wl-overlay-visible');
            panel.classList.add('wl-panel-visible');
        });

        this._bindPanelEvents(overlay);
        this._renderDayView();
        this._updateTimerUI();

        const dockBtn = document.getElementById('worklog-dock-btn');
        if (dockBtn) dockBtn.classList.add('active');
    }

    _buildPanelHTML() {
        const isToday = this._currentDate === this._todayStr();
        const summary = this.getDailySummary(this._currentDate);
        const projects = this.getActiveProjects();
        const projectOptions = projects.map(p =>
            `<option value="${p.id}" style="color:${p.color}">${p.name}</option>`
        ).join('');

        return `
            <div class="wl-panel-header">
                <div class="wl-panel-title">
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
                <button class="wl-close-btn" data-action="close" title="关闭">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="wl-quick-entry">
                <input type="text" class="wl-input wl-desc-input" placeholder="做了什么..."
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

            <div class="wl-summary-bar">
                <span class="wl-summary-time">
                    <i class="fas fa-clock"></i>
                    今日工时：<strong>${this._formatDuration(summary.totalMinutes)}</strong>
                </span>
                <span class="wl-summary-count">
                    共 <strong>${summary.count}</strong> 条记录
                </span>
            </div>

            <div class="wl-entries-container" id="wl-entries-container"></div>

            <div class="wl-panel-footer">
                <button class="wl-footer-btn" data-action="week-report" title="周报回顾">
                    <i class="fas fa-calendar-week"></i> 周报
                </button>
                <button class="wl-footer-btn" data-action="manage-projects" title="管理项目">
                    <i class="fas fa-folder-open"></i> 项目
                </button>
            </div>
        `;
    }

    _escHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    _renderDayView() {
        const container = this._panelEl?.querySelector('#wl-entries-container');
        if (!container) return;

        const summary = this.getDailySummary(this._currentDate);

        if (summary.count === 0) {
            container.innerHTML = `
                <div class="wl-empty">
                    <i class="fas fa-coffee"></i>
                    <p>${this._currentDate === this._todayStr() ? '今天还没有工作记录' : '当天没有工作记录'}</p>
                    <p class="wl-empty-hint">输入描述，开始计时或手动添加</p>
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
                const memoTitle = entry.memoId ? this._getMemoTitle(entry.memoId) : null;
                html += `
                    <div class="wl-entry" data-entry-id="${entry.id}">
                        <div class="wl-entry-main">
                            <span class="wl-entry-desc">${this._escHtml(entry.description) || '<em>无描述</em>'}</span>
                            <span class="wl-entry-duration">${this._formatDuration(entry.duration)}</span>
                        </div>
                        <div class="wl-entry-meta">
                            ${entry.startTime ? `<span class="wl-entry-time">${entry.startTime}${entry.endTime ? ' → ' + entry.endTime : ''}</span>` : ''}
                            ${memoTitle ? `<span class="wl-entry-task-badge" title="关联任务: ${this._escHtml(memoTitle)}"><i class="fas fa-tasks"></i> ${this._escHtml(memoTitle)}</span>` : ''}
                        </div>
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
            });

            html += '</div></div>';
        });

        container.innerHTML = html;
    }

    _refreshPanel() {
        if (!this._panelOpen || !this._panelEl) return;
        const summary = this.getDailySummary(this._currentDate);
        const summaryTime = this._panelEl.querySelector('.wl-summary-time strong');
        const summaryCount = this._panelEl.querySelector('.wl-summary-count strong');
        if (summaryTime) summaryTime.textContent = this._formatDuration(summary.totalMinutes);
        if (summaryCount) summaryCount.textContent = summary.count;
        this._renderDayView();
    }

    // ─── 事件绑定 ───
    _bindPanelEvents(overlay) {
        const panel = this._panelEl;
        if (!panel) return;

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
                case 'week-report':
                    this._showWeekReport();
                    break;
                case 'manage-projects':
                    this._showProjectManager();
                    break;
            }
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
            });
        }

        const timerBtn = panel.querySelector('.wl-timer-btn');
        if (timerBtn) {
            timerBtn.addEventListener('click', async () => {
                if (this._timer) {
                    const descInput = panel.querySelector('.wl-desc-input');
                    if (descInput && descInput.value.trim()) {
                        this._timer.description = descInput.value.trim();
                    }
                    await this.stopTimer();
                    if (descInput) descInput.value = '';
                    const linkBtn = panel.querySelector('.wl-task-link-btn');
                    if (linkBtn) { linkBtn.dataset.memoId = ''; linkBtn.classList.remove('wl-task-linked'); linkBtn.title = '关联任务'; }
                    this._refreshPanel();
                } else {
                    const desc = panel.querySelector('.wl-desc-input')?.value?.trim() || '';
                    const projId = panel.querySelector('.wl-project-select')?.value || 'proj_default';
                    const memoId = panel.querySelector('.wl-task-link-btn')?.dataset?.memoId || null;
                    this.startTimer(projId, desc, memoId);
                }
            });
        }

        const descInput = panel.querySelector('.wl-desc-input');
        if (descInput) {
            descInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !this._timer) {
                    const desc = descInput.value.trim();
                    if (desc) {
                        const projId = panel.querySelector('.wl-project-select')?.value || 'proj_default';
                        const memoId = panel.querySelector('.wl-task-link-btn')?.dataset?.memoId || null;
                        this.startTimer(projId, desc, memoId);
                    }
                }
            });
        }

        if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
        this._escHandler = (e) => {
            if (e.key === 'Escape' && this._panelOpen) this.closePanel();
        };
        document.addEventListener('keydown', this._escHandler);
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
            <div class="wl-form">
                <div class="wl-form-title">${isEdit ? '编辑记录' : '添加工时记录'}</div>
                <div class="wl-form-group">
                    <label>做了什么</label>
                    <input type="text" class="wl-input" id="wl-form-desc" value="${this._escHtml(editEntry?.description || '')}" placeholder="活动描述..." autofocus>
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
                <div class="wl-form-actions">
                    <button class="wl-btn wl-btn-cancel" id="wl-form-cancel">取消</button>
                    <button class="wl-btn wl-btn-save" id="wl-form-save">${isEdit ? '保存' : '添加'}</button>
                </div>
            </div>
        `;

        this._panelEl.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));

        overlay.querySelector('#wl-form-cancel').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
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

            if (duration <= 0) {
                overlay.querySelector('#wl-form-hours').classList.add('wl-input-error');
                return;
            }

            if (isEdit) {
                await this.updateEntry(editEntry.id, { description: desc, projectId: projId, duration, date, memoId });
            } else {
                await this.addEntry({ description: desc, projectId: projId, duration, date, memoId });
            }

            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
            this._refreshPanel();
        });

        overlay.querySelector('#wl-form-desc').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') overlay.querySelector('#wl-form-save').click();
        });
    }

    _showEditEntryForm(entryId) {
        const entry = this._entries.find(e => e.id === entryId);
        if (entry) this._showManualEntryForm(entry);
    }

    // ─── 周报视图 ───
    _showWeekReport() {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();

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
            <div class="wl-form wl-week-report">
                <div class="wl-form-title">
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
        requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));

        overlay.querySelector('#wl-week-close').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
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

    // ─── 项目管理 ───
    _showProjectManager() {
        const existing = this._panelEl?.querySelector('.wl-form-overlay');
        if (existing) existing.remove();

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
            <div class="wl-form wl-proj-manager">
                <div class="wl-form-title"><i class="fas fa-folder-open"></i> 管理项目</div>
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
        requestAnimationFrame(() => overlay.classList.add('wl-form-visible'));

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
            setTimeout(() => overlay.remove(), 200);
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
            <div class="wl-task-picker">
                <div class="wl-tp-header">
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
            setTimeout(() => overlay.remove(), 200);
        });

        overlay.querySelector('.wl-tp-clear').addEventListener('click', () => {
            onSelect(null, null);
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
        });

        overlay.querySelector('.wl-tp-close').addEventListener('click', () => {
            overlay.classList.remove('wl-form-visible');
            setTimeout(() => overlay.remove(), 200);
        });
    }
}

window.workLogManager = new WorkLogManager();
