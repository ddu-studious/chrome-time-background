/**
 * ScheduleManager — 每日时间计划表（时间块日程 + 习惯追踪）
 * 独立模块，数据存储在 chrome.storage.local
 * 入口：底部 Dock 栏按钮
 */
class ScheduleManager {
    constructor() {
        this._routines = [];
        this._plans = [];
        this._habitLog = {};
        this._settings = {};
        this._panelOpen = false;
        this._viewMode = 'day'; // 'day' | 'week'
        this._currentDate = this._todayStr();
        this._weekStart = null;
        this._panelEl = null;
        this._overlayEl = null;
        this._escHandler = null;
        this._initialized = false;
        this._currentTimeTick = null;
        this._weekTooltip = null;
        this._copyDayBuffer = null;
        this._pasteMode = false;
        this._lastCreatedId = null;

        this.CATEGORIES = [
            { id: 'work', name: '工作', color: '#60a5fa', icon: '💼' },
            { id: 'study', name: '学习', color: '#34d399', icon: '📚' },
            { id: 'life', name: '生活', color: '#fbbf24', icon: '🏠' },
        ];

        this.PRESET_ROUTINES = [
            { name: '晨跑', icon: '🏃', time: '06:30', duration: 30, category: 'life' },
            { name: '英语阅读', icon: '📖', time: '07:30', duration: 45, category: 'study' },
            { name: '冥想', icon: '🧘', time: '07:00', duration: 10, category: 'life' },
            { name: '睡前总结', icon: '📝', time: '22:00', duration: 15, category: 'life' },
        ];
    }

    // ─── 初始化 ───
    async init() {
        if (this._initialized) return;
        await this._loadData();
        if (this._routines.length === 0) {
            this._routines = this.PRESET_ROUTINES.map((r, i) => ({
                ...r,
                id: this._genId('routine'),
                frequency: 'daily',
                customDays: [],
                enabled: true,
                sortOrder: i,
                createdAt: Date.now()
            }));
            await this._saveRoutines();
        }
        this._initialized = true;
        this._updateDockBadge();
        console.log('[Schedule] 初始化完成，例程数:', this._routines.length, '计划数:', this._plans.length);
    }

    // ─── 数据加载/保存 ───
    async _loadData() {
        const data = await new Promise(r =>
            chrome.storage.local.get(['scheduleRoutines', 'schedulePlans', 'scheduleHabitLog', 'scheduleSettings'], r)
        );
        this._routines = Array.isArray(data.scheduleRoutines) ? data.scheduleRoutines : [];
        this._plans = Array.isArray(data.schedulePlans) ? data.schedulePlans : [];
        this._habitLog = data.scheduleHabitLog || {};
        this._settings = data.scheduleSettings || {};
        this._cleanOldData();
    }

    async _saveRoutines() { await chrome.storage.local.set({ scheduleRoutines: this._routines }); }
    async _savePlans() { await chrome.storage.local.set({ schedulePlans: this._plans }); }
    async _saveHabitLog() { await chrome.storage.local.set({ scheduleHabitLog: this._habitLog }); }
    async _saveSettings() { await chrome.storage.local.set({ scheduleSettings: this._settings }); }

    _cleanOldData() {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);
        const cutoffStr = this._dateToStr(cutoff);
        this._plans = this._plans.filter(p => p.date >= cutoffStr);
        Object.keys(this._habitLog).forEach(k => {
            if (k < cutoffStr) delete this._habitLog[k];
        });
    }

    // ─── 工具函数 ───
    _todayStr() {
        return this._dateToStr(new Date());
    }
    _dateToStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    _formatDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
        return `${d.getMonth() + 1}月${d.getDate()}日 周${weekDays[d.getDay()]}`;
    }
    _genId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    _escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }
    _shiftDate(dateStr, delta) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + delta);
        return this._dateToStr(d);
    }
    _getCategory(id) {
        const cats = this._settings.categories || this.CATEGORIES;
        return cats.find(c => c.id === id) || this.CATEGORIES[0];
    }
    _nowTimeStr() {
        const n = new Date();
        return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
    }
    _getMonday(dateStr) {
        const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
        const day = d.getDay();
        d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
        d.setHours(0, 0, 0, 0);
        return d;
    }
    _getWeekDays() {
        const days = [];
        const m = new Date(this._weekStart);
        const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        for (let i = 0; i < 7; i++) {
            days.push({ dateStr: this._dateToStr(m), dayName: names[i], dayNum: m.getDate(), isToday: this._dateToStr(m) === this._todayStr(), isWeekend: i >= 5 });
            m.setDate(m.getDate() + 1);
        }
        return days;
    }
    _weekLabel() {
        const m = new Date(this._weekStart);
        const sun = new Date(m); sun.setDate(sun.getDate() + 6);
        const y = m.getFullYear();
        const oneJan = new Date(y, 0, 1);
        const wn = Math.ceil(((m - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        return `第${wn}周 · ${m.getMonth() + 1}/${m.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}`;
    }
    _addMinutes(t, mins) {
        const [h, m] = t.split(':').map(Number);
        const total = h * 60 + m + mins;
        return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }
    _getDayEvents(dateStr) {
        const events = [];
        const dow = new Date(dateStr + 'T00:00:00').getDay();
        const dn = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        this._routines.forEach(r => {
            if (!r.enabled) return;
            let show = false;
            if (r.frequency === 'daily') show = true;
            else if (r.frequency === 'weekdays') show = dow >= 1 && dow <= 5;
            else if (r.frequency === 'weekends') show = dow === 0 || dow === 6;
            else if (r.frequency === 'custom' && Array.isArray(r.customDays)) show = r.customDays.includes(dn[dow]);
            if (!show) return;
            const cat = this._getCategory(r.category);
            events.push({ type: 'routine', id: r.id, name: r.name, icon: r.icon || cat.icon, startTime: r.time || '09:00', duration: r.duration || 30, category: r.category, catColor: cat.color, completed: this._isRoutineChecked(r.id, dateStr) });
        });
        this._plans.filter(p => p.date === dateStr).forEach(p => {
            const cat = this._getCategory(p.category);
            events.push({ type: 'plan', id: p.id, name: p.name, icon: p.icon || cat.icon, startTime: p.startTime || '09:00', endTime: p.endTime, duration: p.duration || 60, category: p.category, catColor: cat.color, completed: !!p.completed, note: p.note });
        });
        return events;
    }
    _removeWeekTooltip() {
        if (this._weekTooltip) { this._weekTooltip.remove(); this._weekTooltip = null; }
    }
    _showWeekTooltip(block) {
        this._removeWeekTooltip();
        const catObj = this._getCategory(block.dataset.tooltipCat);
        const tip = document.createElement('div');
        tip.className = 'wv-tooltip';
        tip.innerHTML = `<div class="wv-tip-name">${block.dataset.tooltipName}</div><div class="wv-tip-time"><i class="fas fa-clock"></i> ${block.dataset.tooltipTime}</div><div class="wv-tip-meta"><span class="wv-tip-dur"><i class="fas fa-hourglass-half"></i> ${block.dataset.tooltipDur}</span><span class="wv-tip-cat" style="color:${catObj.color}"><i class="fas fa-circle" style="font-size:6px"></i> ${catObj.name}</span></div>`;
        document.body.appendChild(tip);
        this._weekTooltip = tip;
        const rect = block.getBoundingClientRect();
        const tr = tip.getBoundingClientRect();
        let left = rect.right + 8, top = rect.top + (rect.height - tr.height) / 2;
        if (left + tr.width > window.innerWidth - 12) left = rect.left - tr.width - 8;
        top = Math.max(8, Math.min(top, window.innerHeight - tr.height - 8));
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        tip.classList.add('wv-tooltip-visible');
    }

    // ─── 习惯/例程 CRUD ───
    async addRoutine(data) {
        const routine = {
            id: this._genId('routine'),
            name: (data.name || '').trim(),
            icon: data.icon || '📌',
            time: data.time || '08:00',
            duration: Math.max(1, parseInt(data.duration) || 30),
            category: data.category || 'life',
            frequency: data.frequency || 'daily',
            customDays: data.customDays || [],
            enabled: true,
            sortOrder: this._routines.length,
            createdAt: Date.now()
        };
        this._routines.push(routine);
        await this._saveRoutines();
        return routine;
    }

    async updateRoutine(id, updates) {
        const idx = this._routines.findIndex(r => r.id === id);
        if (idx === -1) return null;
        Object.assign(this._routines[idx], updates);
        await this._saveRoutines();
        return this._routines[idx];
    }

    async removeRoutine(id) {
        this._routines = this._routines.filter(r => r.id !== id);
        await this._saveRoutines();
    }

    _getActiveRoutines(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const dow = d.getDay(); // 0=Sun
        return this._routines.filter(r => {
            if (!r.enabled) return false;
            if (r.frequency === 'daily') return true;
            if (r.frequency === 'weekdays') return dow >= 1 && dow <= 5;
            if (r.frequency === 'weekends') return dow === 0 || dow === 6;
            if (r.frequency === 'custom') return (r.customDays || []).includes(dow);
            return true;
        });
    }

    async toggleRoutineCheck(routineId, dateStr) {
        const dateKey = dateStr || this._currentDate;
        if (!this._habitLog[dateKey]) {
            this._habitLog[dateKey] = { routines: {}, streak: 0 };
        }
        const prev = this._habitLog[dateKey].routines[routineId];
        if (prev && prev.checked) {
            this._habitLog[dateKey].routines[routineId] = { checked: false };
        } else {
            this._habitLog[dateKey].routines[routineId] = { checked: true, checkedAt: Date.now() };
        }
        this._habitLog[dateKey].streak = this._calcPlanStreak(dateKey);
        await this._saveHabitLog();
        this._updateDockBadge();
        return this._habitLog[dateKey].routines[routineId].checked;
    }

    _isRoutineChecked(routineId, dateStr) {
        return !!(this._habitLog[dateStr]?.routines?.[routineId]?.checked);
    }

    getStreak(routineId) {
        let streak = 0;
        let d = new Date();
        const todayStr = this._dateToStr(d);
        const checkedToday = this._isRoutineChecked(routineId, todayStr);

        if (checkedToday) {
            streak = 1;
            d.setDate(d.getDate() - 1);
        } else {
            d.setDate(d.getDate() - 1);
        }

        for (let i = 0; i < 365; i++) {
            const ds = this._dateToStr(d);
            if (this._isRoutineChecked(routineId, ds)) {
                streak++;
            } else {
                break;
            }
            d.setDate(d.getDate() - 1);
        }
        return streak;
    }

    _calcPlanStreak(dateStr) {
        let streak = 0;
        let d = new Date(dateStr + 'T00:00:00');
        for (let i = 0; i < 365; i++) {
            const ds = this._dateToStr(d);
            const log = this._habitLog[ds];
            const plans = this._plans.filter(p => p.date === ds);
            const hasActivity = (log && Object.values(log.routines || {}).some(r => r.checked)) || plans.length > 0;
            if (hasActivity) {
                streak++;
            } else if (i > 0) {
                break;
            }
            d.setDate(d.getDate() - 1);
        }
        return streak;
    }

    // ─── 灵活计划 CRUD ───
    async addPlan(data) {
        const plan = {
            id: this._genId('plan'),
            name: (data.name || '').trim(),
            icon: data.icon || '📌',
            date: data.date || this._currentDate,
            startTime: data.startTime || '09:00',
            endTime: data.endTime || '10:00',
            duration: 0,
            category: data.category || 'work',
            completed: false,
            note: data.note || '',
            createdAt: Date.now()
        };
        plan.duration = this._calcDuration(plan.startTime, plan.endTime);
        this._plans.push(plan);
        await this._savePlans();
        return plan;
    }

    async updatePlan(id, updates) {
        const idx = this._plans.findIndex(p => p.id === id);
        if (idx === -1) return null;
        Object.assign(this._plans[idx], updates);
        if (updates.startTime || updates.endTime) {
            this._plans[idx].duration = this._calcDuration(this._plans[idx].startTime, this._plans[idx].endTime);
        }
        await this._savePlans();
        return this._plans[idx];
    }

    async removePlan(id) {
        this._plans = this._plans.filter(p => p.id !== id);
        await this._savePlans();
    }

    async togglePlanComplete(id) {
        const plan = this._plans.find(p => p.id === id);
        if (!plan) return;
        plan.completed = !plan.completed;
        await this._savePlans();
        return plan.completed;
    }

    getPlansForDate(dateStr) {
        return this._plans.filter(p => p.date === dateStr).sort((a, b) => {
            if (a.startTime < b.startTime) return -1;
            if (a.startTime > b.startTime) return 1;
            return 0;
        });
    }

    _calcDuration(start, end) {
        if (!start || !end) return 0;
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
    }

    _formatDuration(minutes) {
        if (!minutes || minutes <= 0) return '0m';
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        if (h === 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h${m}m`;
    }

    // ─── 统计 ───
    getDaySummary(dateStr) {
        const routines = this._getActiveRoutines(dateStr);
        const plans = this.getPlansForDate(dateStr);
        let checkedRoutines = 0;
        routines.forEach(r => { if (this._isRoutineChecked(r.id, dateStr)) checkedRoutines++; });
        const completedPlans = plans.filter(p => p.completed).length;
        const totalItems = routines.length + plans.length;
        const completedItems = checkedRoutines + completedPlans;

        const catTime = {};
        this.CATEGORIES.forEach(c => { catTime[c.id] = 0; });
        routines.forEach(r => { catTime[r.category] = (catTime[r.category] || 0) + (r.duration || 0); });
        plans.forEach(p => { catTime[p.category] = (catTime[p.category] || 0) + (p.duration || 0); });

        return {
            routines: routines.length,
            checkedRoutines,
            plans: plans.length,
            completedPlans,
            totalItems,
            completedItems,
            catTime,
            streak: this._calcPlanStreak(dateStr)
        };
    }

    // ─── Dock 徽标 ───
    _updateDockBadge() {
        const btn = document.getElementById('schedule-dock-btn');
        if (!btn) return;
        const today = this._todayStr();
        const summary = this.getDaySummary(today);
        const badge = btn.querySelector('.dock-badge');
        if (summary.totalItems > 0 && summary.completedItems < summary.totalItems) {
            const remaining = summary.totalItems - summary.completedItems;
            if (badge) {
                badge.textContent = remaining;
                badge.style.display = '';
            } else {
                const b = document.createElement('span');
                b.className = 'dock-badge';
                b.textContent = remaining;
                btn.appendChild(b);
            }
        } else if (badge) {
            badge.style.display = 'none';
        }
    }

    // ─── 面板 toggle ───
    toggle() {
        if (this._panelOpen) this.closePanel(); else this.openPanel();
    }

    openPanel(mode) {
        if (this._panelOpen) return;
        this._panelOpen = true;
        this._viewMode = mode || 'day';
        this._currentDate = this._todayStr();
        if (!this._weekStart) this._weekStart = this._getMonday();
        this._renderPanel();
        this._startCurrentTimeTick();
    }

    closePanel() {
        this._panelOpen = false;
        this._stopCurrentTimeTick();
        this._removeWeekTooltip();
        this._exitPasteMode();
        document.querySelectorAll('.sch-form-overlay-fixed').forEach(el => el.remove());
        document.querySelectorAll('.sch-ctx-fixed').forEach(el => el.remove());
        if (this._weekNowTick) { clearInterval(this._weekNowTick); this._weekNowTick = null; }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._overlayEl) this._overlayEl.classList.remove('sch-overlay-visible');
        if (this._panelEl) {
            this._panelEl.classList.add('sch-panel-closing');
            setTimeout(() => {
                this._panelEl?.remove();
                this._panelEl = null;
                this._overlayEl?.remove();
                this._overlayEl = null;
            }, 300);
        }
        const dockBtn = document.getElementById('schedule-dock-btn');
        if (dockBtn) dockBtn.classList.remove('active');
    }

    _switchView(mode) {
        if (mode === this._viewMode) return;
        this._viewMode = mode;
        if (mode === 'week' && !this._weekStart) {
            this._weekStart = this._getMonday();
        }
        this._refreshPanel();
        if (this._panelEl) {
            this._panelEl.classList.toggle('sch-panel-wide', mode === 'week');
        }
    }

    _startCurrentTimeTick() {
        this._stopCurrentTimeTick();
        this._currentTimeTick = setInterval(() => this._updateCurrentHighlight(), 60000);
    }
    _stopCurrentTimeTick() {
        if (this._currentTimeTick) { clearInterval(this._currentTimeTick); this._currentTimeTick = null; }
    }

    _updateCurrentHighlight() {
        if (!this._panelEl) return;
        const now = this._nowTimeStr();
        this._panelEl.querySelectorAll('.sch-plan-item').forEach(el => {
            const start = el.dataset.start;
            const end = el.dataset.end;
            el.classList.toggle('sch-plan-active', !!(start && end && start <= now && now < end));
        });
    }

    // ─── 面板渲染 ───
    _renderPanel() {
        if (this._panelEl) this._panelEl.remove();
        if (this._overlayEl) this._overlayEl.remove();

        const overlay = document.createElement('div');
        overlay.className = 'sch-overlay';
        overlay.addEventListener('click', () => this.closePanel());
        this._overlayEl = overlay;

        const panel = document.createElement('div');
        panel.className = 'sch-panel';
        if (this._viewMode === 'week') panel.classList.add('sch-panel-wide');
        this._panelEl = panel;

        panel.innerHTML = this._viewMode === 'week' ? this._buildWeekHTML() : this._buildPanelHTML();
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        requestAnimationFrame(() => {
            overlay.classList.add('sch-overlay-visible');
            panel.classList.add('sch-panel-visible');
        });

        this._bindPanelEvents();
        if (this._viewMode === 'day') this._updateCurrentHighlight();

        const dockBtn = document.getElementById('schedule-dock-btn');
        if (dockBtn) dockBtn.classList.add('active');
    }

    _refreshPanel() {
        if (!this._panelEl || !this._panelOpen) return;
        const scrollEl = this._panelEl.querySelector(this._viewMode === 'week' ? '.wv-grid-wrap' : '.sch-panel-body');
        const scrollTop = scrollEl?.scrollTop || 0;
        this._panelEl.innerHTML = this._viewMode === 'week' ? this._buildWeekHTML() : this._buildPanelHTML();
        this._bindPanelEvents();
        if (this._viewMode === 'day') this._updateCurrentHighlight();
        const newScrollEl = this._panelEl.querySelector(this._viewMode === 'week' ? '.wv-grid-wrap' : '.sch-panel-body');
        if (newScrollEl) newScrollEl.scrollTop = scrollTop;
    }

    _buildPanelHTML() {
        const isToday = this._currentDate === this._todayStr();
        const routines = this._getActiveRoutines(this._currentDate);
        const plans = this.getPlansForDate(this._currentDate);
        const summary = this.getDaySummary(this._currentDate);

        const routineItems = routines.map(r => {
            const checked = this._isRoutineChecked(r.id, this._currentDate);
            const streak = this.getStreak(r.id);
            const cat = this._getCategory(r.category);
            const streakClass = streak >= 7 ? 'sch-streak-hot' : '';
            const streakText = streak > 0 ? (streak >= 7 ? `🔥 连续${streak}天` : `连续${streak}天`) : '';
            return `
                <div class="sch-routine-item${checked ? ' sch-checked' : ''}" data-id="${r.id}">
                    <div class="sch-routine-cat-dot" style="background:${cat.color}"></div>
                    <div class="sch-routine-check"><i class="fas fa-check"></i></div>
                    <div class="sch-routine-info">
                        <div class="sch-routine-name">${r.icon} ${this._escHtml(r.name)}</div>
                        <div class="sch-routine-meta">${r.time} · ${this._formatDuration(r.duration)}</div>
                    </div>
                    ${streakText ? `<span class="sch-streak ${streakClass}">${streakText}</span>` : ''}
                    <button class="sch-item-menu-btn" data-action="routine-menu" data-id="${r.id}" title="更多"><i class="fas fa-ellipsis-v"></i></button>
                </div>`;
        }).join('');

        const now = this._nowTimeStr();
        const planItems = plans.map(p => {
            const cat = this._getCategory(p.category);
            const isActive = isToday && !p.completed && p.startTime <= now && now < p.endTime;
            const classes = [
                'sch-plan-item',
                `sch-plan-cat-${p.category}`,
                p.completed ? 'sch-plan-completed' : '',
                isActive ? 'sch-plan-active' : ''
            ].filter(Boolean).join(' ');
            return `
                <div class="${classes}" data-id="${p.id}" data-start="${p.startTime}" data-end="${p.endTime}">
                    <span class="sch-plan-time">${p.startTime} - ${p.endTime}</span>
                    <span class="sch-plan-name">${p.icon} ${this._escHtml(p.name)}</span>
                    <span class="sch-cat-tag" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span>
                    <span class="sch-plan-dur">${this._formatDuration(p.duration)}</span>
                    <button class="sch-item-menu-btn" data-action="plan-menu" data-id="${p.id}" title="更多"><i class="fas fa-ellipsis-v"></i></button>
                </div>`;
        }).join('');

        const catStats = this.CATEGORIES.map(c => {
            const min = summary.catTime[c.id] || 0;
            return min > 0 ? `<span class="sch-stat-cat"><span class="sch-stat-dot" style="background:${c.color}"></span>${c.name}${this._formatDuration(min)}</span>` : '';
        }).filter(Boolean).join('');

        return `
            <div class="sch-panel-header">
                <div class="sch-panel-title"><i class="fas fa-calendar-check"></i> 计划</div>
                <div class="sch-view-tabs">
                    <button class="sch-view-tab sch-view-tab-active" data-action="switch-day"><i class="fas fa-calendar-day"></i> 日</button>
                    <button class="sch-view-tab" data-action="switch-week"><i class="fas fa-calendar-week"></i> 周</button>
                </div>
                <div class="sch-date-nav">
                    <button class="sch-nav-btn" data-action="prev-day" title="前一天"><i class="fas fa-chevron-left"></i></button>
                    <span class="sch-date-label${isToday ? ' sch-today' : ''}" data-action="goto-today" title="回到今天">
                        ${this._formatDate(this._currentDate)}
                        ${isToday ? ' <span class="sch-today-badge">今天</span>' : ''}
                    </span>
                    <button class="sch-nav-btn" data-action="next-day" title="后一天"><i class="fas fa-chevron-right"></i></button>
                </div>
                <div class="sch-header-actions">
                    <button class="sch-header-btn" data-action="manage-routines" title="管理习惯"><i class="fas fa-redo"></i></button>
                    <button class="sch-header-btn" data-action="close" title="关闭"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="sch-panel-body">
                <div class="sch-section">
                    <div class="sch-section-label"><i class="fas fa-redo"></i> 每日例程 · 习惯打卡</div>
                    ${routineItems || '<div class="sch-empty">暂无习惯，点击右上角 <i class="fas fa-redo"></i> 添加</div>'}
                </div>
                <div class="sch-divider"></div>
                <div class="sch-section">
                    <div class="sch-section-label"><i class="fas fa-clock"></i> 灵活计划 · 今日安排</div>
                    ${planItems}
                    <div class="sch-plan-actions">
                        <button class="sch-add-plan-btn" data-action="add-plan"><i class="fas fa-plus"></i> 添加计划</button>
                        ${this._hasPrevDayPlans() ? `<button class="sch-copy-prev-btn" data-action="copy-prev-day"><i class="fas fa-copy"></i> 复制${this._prevDayLabel()}日程</button>` : ''}
                    </div>
                </div>
            </div>
            <div class="sch-panel-footer">
                <span class="sch-footer-stats">完成 ${summary.completedItems}/${summary.totalItems} ${catStats}</span>
                ${summary.streak > 0 ? `<span class="sch-footer-streak"><i class="fas fa-fire"></i> 连续${summary.streak}天</span>` : ''}
                <div class="sch-footer-progress">
                    <div class="sch-progress-bar">
                        <div class="sch-progress-fill" style="width:${summary.totalItems > 0 ? Math.round(summary.completedItems / summary.totalItems * 100) : 0}%"></div>
                    </div>
                </div>
            </div>`;
    }

    // ─── 周视图 HTML ───
    _buildWeekHTML() {
        const days = this._getWeekDays();
        const HOURS = [];
        for (let h = 6; h <= 23; h++) HOURS.push(h);
        const PX = 72, MIN_H = 22;

        const tabDay = `<button class="sch-view-tab" data-action="switch-day"><i class="fas fa-calendar-day"></i> 日</button>`;
        const tabWeek = `<button class="sch-view-tab sch-view-tab-active" data-action="switch-week"><i class="fas fa-calendar-week"></i> 周</button>`;
        const legend = this.CATEGORIES.map(c => `<span class="wv-legend-item"><span class="wv-legend-dot" style="background:${c.color}"></span>${c.name}</span>`).join('');

        const pasteHint = this._pasteMode ? `<span class="wv-paste-hint"><i class="fas fa-paste"></i> 右键目标日期列头粘贴 · <button class="wv-paste-cancel" data-action="cancel-paste">取消</button></span>` : '';

        let header = `<div class="sch-panel-header">
            <div class="sch-panel-title"><i class="fas fa-calendar-check"></i> 计划</div>
            <div class="sch-view-tabs">${tabDay}${tabWeek}</div>
            <div class="wv-week-nav">
                <button class="sch-nav-btn" data-action="prev-week"><i class="fas fa-chevron-left"></i></button>
                <span class="wv-week-label">${this._escHtml(this._weekLabel())}</span>
                <button class="sch-nav-btn" data-action="next-week"><i class="fas fa-chevron-right"></i></button>
            </div>
            <button class="sch-nav-btn" data-action="go-today-week" style="padding:0 10px;font-size:11px;font-weight:600;color:#a78bfa">本周</button>
            <div class="wv-legend">${legend}</div>
            <div class="sch-header-actions">
                <button class="sch-header-btn" data-action="close" title="关闭"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <div class="wv-quick-bar">
            <div class="wv-quick-input-wrap">
                <i class="fas fa-bolt wv-quick-icon"></i>
                <input type="text" class="wv-quick-input" id="wv-quick-input" placeholder="快捷添加：21 9:00 开会 / 周三 14:00-16:00 评审 / 9:00 晨会" autocomplete="off">
            </div>
            ${pasteHint}
        </div>`;

        let dayRow = '<div class="wv-day-row"><div class="wv-corner"><i class="fas fa-clock" style="opacity:0.3"></i></div>';
        days.forEach(d => {
            const isCopySrc = this._pasteMode && this._copyDayBuffer === d.dateStr;
            const isPasteTarget = this._pasteMode && this._copyDayBuffer !== d.dateStr;
            const hdCls = [
                'wv-day-hd',
                d.isToday ? 'wv-today' : '',
                d.isWeekend ? 'wv-weekend' : '',
                isCopySrc ? 'wv-copy-src' : '',
                isPasteTarget ? 'wv-paste-target' : ''
            ].filter(Boolean).join(' ');
            dayRow += `<div class="${hdCls}" data-date="${d.dateStr}"><span class="wv-day-name">${d.dayName}</span><span class="wv-day-num">${d.dayNum}</span></div>`;
        });
        dayRow += '</div>';

        let timeCol = '<div class="wv-time-col">';
        HOURS.forEach(hr => { timeCol += `<div class="wv-time-label">${String(hr).padStart(2, '0')}:00</div>`; });
        timeCol += '</div>';

        let dayCols = '';
        days.forEach(d => {
            const evts = this._getDayEvents(d.dateStr);
            let lines = '';
            HOURS.forEach(hr => { lines += `<div class="wv-hour-line" data-date="${d.dateStr}" data-hour="${hr}"></div>`; });
            let blocks = '';
            evts.forEach(ev => {
                const [sh, sm] = ev.startTime.split(':').map(Number);
                const top = ((sh * 60 + sm) - HOURS[0] * 60) / 60 * PX;
                const h = Math.max((ev.duration / 60) * PX, MIN_H);
                const xs = ev.duration <= 15, med = ev.duration > 15 && ev.duration <= 40;
                const sc = xs ? ' wv-block-xs' : (med ? ' wv-block-sm' : '');
                const et = ev.endTime || this._addMinutes(ev.startTime, ev.duration);
                const timeStr = `${ev.startTime} · ${ev.duration}m`;
                const isNew = this._lastCreatedId === ev.id;
                blocks += `<div class="wv-block wv-cat-${ev.category}${ev.completed ? ' wv-done' : ''}${sc}${isNew ? ' wv-block-new' : ''}" style="top:${top}px;height:${h}px" data-id="${ev.id}" data-type="${ev.type}" data-date="${d.dateStr}" data-tooltip-name="${this._escHtml(ev.name)}" data-tooltip-time="${ev.startTime} – ${et}" data-tooltip-dur="${ev.duration}min" data-tooltip-cat="${ev.category}"><span class="wv-block-name">${ev.icon} ${this._escHtml(ev.name)}</span><span class="wv-block-time">${timeStr}</span></div>`;
            });
            let nowLine = '';
            if (d.isToday) {
                const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), gs = HOURS[0] * 60;
                if (nm >= gs) nowLine = `<div class="wv-now-line" style="top:${((nm - gs) / 60) * PX}px" data-now-line><div class="wv-now-dot"></div></div>`;
            }
            dayCols += `<div class="wv-day-col${d.isToday ? ' wv-today-col' : ''}${d.isWeekend ? ' wv-weekend-col' : ''}" data-date="${d.dateStr}">${lines}${blocks}${nowLine}</div>`;
        });

        return `${header}${dayRow}<div class="wv-grid-wrap"><div class="wv-body">${timeCol}${dayCols}</div></div>`;
    }

    // ─── 事件绑定 ───
    _bindPanelEvents() {
        const panel = this._panelEl;
        if (!panel) return;

        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                if (this._pasteMode) { this._exitPasteMode(); this._refreshPanel(); return; }
                this.closePanel();
            }
        };
        document.addEventListener('keydown', this._escHandler);

        panel.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action]');
            const action = target?.dataset.action;

            if (action === 'close') return this.closePanel();
            // Tab switching
            if (action === 'switch-day') return this._switchView('day');
            if (action === 'switch-week') return this._switchView('week');
            // Week view nav
            if (action === 'prev-week') {
                this._weekStart.setDate(this._weekStart.getDate() - 7);
                return this._refreshPanel();
            }
            if (action === 'next-week') {
                this._weekStart.setDate(this._weekStart.getDate() + 7);
                return this._refreshPanel();
            }
            if (action === 'go-today-week') {
                this._weekStart = this._getMonday();
                return this._refreshPanel();
            }
            if (action === 'cancel-paste') {
                this._exitPasteMode();
                return this._refreshPanel();
            }
            // Week view block click → edit (plan) / toggle (routine)
            const wvBlock = e.target.closest('.wv-block');
            if (wvBlock && this._viewMode === 'week' && !e.target.closest('[data-action]')) {
                const { id, type, date } = wvBlock.dataset;
                if (type === 'routine') {
                    await this.toggleRoutineCheck(id, date);
                    return this._refreshPanel();
                } else if (type === 'plan') {
                    const plan = this._plans.find(p => p.id === id);
                    if (plan) {
                        this._currentDate = date;
                        this._showPlanForm(plan);
                    }
                    return;
                }
            }
            // Week view: click empty grid cell → create new plan
            if (this._viewMode === 'week') {
                const hourLine = e.target.closest('.wv-hour-line');
                if (hourLine && !e.target.closest('.wv-block')) {
                    const date = hourLine.dataset.date;
                    const hour = parseInt(hourLine.dataset.hour);
                    if (date && !isNaN(hour)) {
                        this._currentDate = date;
                        const startTime = `${String(hour).padStart(2, '0')}:00`;
                        const endTime = `${String(Math.min(hour + 1, 23)).padStart(2, '0')}:00`;
                        this._showPlanForm({ _preset: true, date, startTime, endTime });
                    }
                    return;
                }
            }
            // Day view actions
            if (action === 'prev-day') {
                this._currentDate = this._shiftDate(this._currentDate, -1);
                return this._refreshPanel();
            }
            if (action === 'next-day') {
                this._currentDate = this._shiftDate(this._currentDate, 1);
                return this._refreshPanel();
            }
            if (action === 'goto-today') {
                this._currentDate = this._todayStr();
                return this._refreshPanel();
            }
            if (action === 'add-plan') return this._showPlanForm();
            if (action === 'copy-prev-day') {
                const prevDate = this._shiftDate(this._currentDate, -1);
                await this._copyDayPlans(prevDate, this._currentDate);
                return this._refreshPanel();
            }
            if (action === 'manage-routines') return this._showRoutineManager();

            if (action === 'routine-menu') {
                e.stopPropagation();
                return this._showRoutineContextMenu(target.dataset.id, target);
            }
            if (action === 'plan-menu') {
                e.stopPropagation();
                return this._showPlanContextMenu(target.dataset.id, target);
            }

            const routineItem = e.target.closest('.sch-routine-item');
            if (routineItem && !e.target.closest('.sch-item-menu-btn')) {
                const rid = routineItem.dataset.id;
                await this.toggleRoutineCheck(rid);
                this._refreshPanel();
                return;
            }

            const planItem = e.target.closest('.sch-plan-item');
            if (planItem && !e.target.closest('.sch-item-menu-btn')) {
                const pid = planItem.dataset.id;
                await this.togglePlanComplete(pid);
                this._refreshPanel();
                return;
            }
        });

        // Week view: tooltip, dblclick, contextmenu, paste-mode click
        if (this._viewMode === 'week') {
            panel.addEventListener('mouseover', e => {
                const b = e.target.closest('.wv-block');
                if (b) this._showWeekTooltip(b);
            });
            panel.addEventListener('mouseout', e => {
                const b = e.target.closest('.wv-block');
                if (b && !b.contains(e.relatedTarget)) this._removeWeekTooltip();
            });
            panel.addEventListener('dblclick', e => {
                const b = e.target.closest('.wv-block') || e.target.closest('.wv-day-col');
                const dateStr = b?.dataset?.date;
                if (dateStr) {
                    this._currentDate = dateStr;
                    this._switchView('day');
                }
            });
            // Right-click context menu on event blocks and day headers
            panel.addEventListener('contextmenu', e => {
                const block = e.target.closest('.wv-block');
                if (block) {
                    e.preventDefault();
                    this._showWeekBlockMenu(block, e);
                    return;
                }
                const dayHd = e.target.closest('.wv-day-hd');
                if (dayHd && dayHd.dataset.date) {
                    e.preventDefault();
                    this._showWeekDayMenu(dayHd.dataset.date, e);
                }
            });
            // Quick input handler
            const quickInput = panel.querySelector('#wv-quick-input');
            if (quickInput) {
                quickInput.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        const text = quickInput.value.trim();
                        if (!text) return;
                        const ok = await this._handleQuickInput(text);
                        if (ok) {
                            quickInput.value = '';
                            setTimeout(() => { this._lastCreatedId = null; }, 2000);
                        } else {
                            quickInput.classList.add('wv-quick-error');
                            setTimeout(() => quickInput.classList.remove('wv-quick-error'), 600);
                        }
                    }
                    if (e.key === 'Escape') {
                        e.stopPropagation();
                        quickInput.value = '';
                        quickInput.blur();
                    }
                });
            }
        }
    }

    // ─── 计划创建/编辑表单 ───
    _showPlanForm(editPlan) {
        const isPreset = editPlan && editPlan._preset;
        const isEdit = !!editPlan && !isPreset;
        this._panelEl?.querySelectorAll('.sch-form-overlay').forEach(el => el.remove());
        document.querySelectorAll('.sch-form-overlay-fixed').forEach(el => el.remove());

        const presetStart = isPreset ? editPlan.startTime : null;
        const presetEnd = isPreset ? editPlan.endTime : null;

        const catOptions = this.CATEGORIES.map(c =>
            `<option value="${c.id}"${(editPlan?.category || 'work') === c.id ? ' selected' : ''}>${c.icon} ${c.name}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'sch-form-overlay';
        overlay.innerHTML = `
            <div class="sch-form">
                <div class="sch-form-title">${isEdit ? '编辑计划' : '添加计划'}</div>
                <div class="sch-form-row">
                    <label>名称</label>
                    <input type="text" class="sch-input" id="sch-plan-name" placeholder="做什么..." value="${this._escHtml(isEdit ? editPlan.name : '')}">
                </div>
                <div class="sch-form-row">
                    <label>图标</label>
                    <input type="text" class="sch-input sch-input-sm" id="sch-plan-icon" placeholder="emoji" value="${isEdit ? (editPlan.icon || '📌') : '📌'}" maxlength="4">
                </div>
                <div class="sch-form-row sch-form-row-inline">
                    <div>
                        <label>开始</label>
                        <input type="time" class="sch-input" id="sch-plan-start" value="${isEdit ? editPlan.startTime : (presetStart || this._suggestNextTime())}">
                    </div>
                    <div>
                        <label>结束</label>
                        <input type="time" class="sch-input" id="sch-plan-end" value="${isEdit ? editPlan.endTime : (presetEnd || this._suggestNextEndTime())}">
                    </div>
                </div>
                <div class="sch-form-row">
                    <label>分类</label>
                    <select class="sch-input" id="sch-plan-cat">${catOptions}</select>
                </div>
                <div class="sch-form-row">
                    <label>备注</label>
                    <input type="text" class="sch-input" id="sch-plan-note" placeholder="可选备注..." value="${this._escHtml(isEdit ? (editPlan.note || '') : '')}">
                </div>
                <div class="sch-form-actions">
                    <button class="sch-btn sch-btn-cancel" id="sch-form-cancel">取消</button>
                    ${isEdit ? '<button class="sch-btn sch-btn-delete" id="sch-form-delete">删除</button>' : ''}
                    <button class="sch-btn sch-btn-primary" id="sch-form-save">${isEdit ? '保存' : '添加'}</button>
                </div>
            </div>`;

        if (this._viewMode === 'week') {
            overlay.classList.add('sch-form-overlay-fixed');
            document.body.appendChild(overlay);
        } else {
            this._panelEl.appendChild(overlay);
        }
        overlay.querySelector('#sch-plan-name')?.focus();

        const removeForm = () => { overlay.remove(); };
        overlay.querySelector('#sch-form-cancel').onclick = removeForm;
        overlay.addEventListener('click', (e) => { if (e.target === overlay) removeForm(); });

        if (isEdit) {
            overlay.querySelector('#sch-form-delete').onclick = async () => {
                await this.removePlan(editPlan.id);
                removeForm();
                this._refreshPanel();
            };
        }

        overlay.querySelector('#sch-form-save').onclick = async () => {
            const name = overlay.querySelector('#sch-plan-name').value.trim();
            if (!name) { overlay.querySelector('#sch-plan-name').focus(); return; }
            const data = {
                name,
                icon: overlay.querySelector('#sch-plan-icon').value || '📌',
                startTime: overlay.querySelector('#sch-plan-start').value,
                endTime: overlay.querySelector('#sch-plan-end').value,
                category: overlay.querySelector('#sch-plan-cat').value,
                note: overlay.querySelector('#sch-plan-note').value.trim(),
                date: this._currentDate
            };
            if (isEdit) {
                await this.updatePlan(editPlan.id, data);
            } else {
                await this.addPlan(data);
            }
            removeForm();
            this._refreshPanel();
        };
    }

    _hasPrevDayPlans() {
        const prevDate = this._shiftDate(this._currentDate, -1);
        return this._plans.some(p => p.date === prevDate);
    }

    _prevDayLabel() {
        const prevDate = this._shiftDate(this._currentDate, -1);
        if (prevDate === this._todayStr()) return '今天';
        const d = new Date(prevDate + 'T00:00:00');
        const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const yesterday = this._shiftDate(this._todayStr(), -1);
        if (prevDate === yesterday) return '昨天';
        return `${d.getMonth() + 1}/${d.getDate()}(${weekDays[d.getDay()]})`;
    }

    _suggestNextTime() {
        const plans = this.getPlansForDate(this._currentDate);
        if (plans.length > 0) {
            const last = plans[plans.length - 1];
            return last.endTime || '09:00';
        }
        const now = new Date();
        const h = now.getHours();
        return `${String(Math.max(h, 8)).padStart(2, '0')}:00`;
    }

    _suggestNextEndTime() {
        const start = this._suggestNextTime();
        const [h, m] = start.split(':').map(Number);
        const endH = Math.min(h + 1, 23);
        return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // ─── 习惯管理面板 ───
    _showRoutineManager() {
        const existing = this._panelEl?.querySelector('.sch-form-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'sch-form-overlay';

        const renderList = () => {
            const items = this._routines.map(r => {
                const cat = this._getCategory(r.category);
                const freqText = { daily: '每天', weekdays: '工作日', weekends: '周末', custom: '自定义' }[r.frequency] || '每天';
                return `
                    <div class="sch-mgr-item" data-id="${r.id}">
                        <span class="sch-mgr-icon">${r.icon}</span>
                        <div class="sch-mgr-info">
                            <div class="sch-mgr-name">${this._escHtml(r.name)}</div>
                            <div class="sch-mgr-meta">${r.time} · ${this._formatDuration(r.duration)} · ${freqText}</div>
                        </div>
                        <span class="sch-cat-tag" style="background:${cat.color}22;color:${cat.color}">${cat.name}</span>
                        <button class="sch-mgr-edit" data-action="edit-routine" data-id="${r.id}"><i class="fas fa-pen"></i></button>
                        <button class="sch-mgr-del" data-action="del-routine" data-id="${r.id}"><i class="fas fa-trash-alt"></i></button>
                    </div>`;
            }).join('');

            return `
                <div class="sch-form sch-form-wide">
                    <div class="sch-form-title">管理每日习惯</div>
                    <div class="sch-mgr-list">${items || '<div class="sch-empty">暂无习惯</div>'}</div>
                    <button class="sch-btn sch-btn-primary sch-btn-block" id="sch-mgr-add"><i class="fas fa-plus"></i> 添加习惯</button>
                    <button class="sch-btn sch-btn-cancel sch-btn-block" id="sch-mgr-close" style="margin-top:6px;">关闭</button>
                </div>`;
        };

        overlay.innerHTML = renderList();
        this._panelEl.appendChild(overlay);

        const bindMgrEvents = () => {
            overlay.querySelector('#sch-mgr-close').onclick = () => { overlay.remove(); this._refreshPanel(); };
            overlay.querySelector('#sch-mgr-add').onclick = () => this._showRoutineForm(overlay, null, () => {
                overlay.querySelector('.sch-form').innerHTML = renderList().replace(/<div class="sch-form sch-form-wide">|<\/div>$/g, '');
                // Re-render the manager
                overlay.innerHTML = renderList();
                bindMgrEvents();
            });
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); this._refreshPanel(); }
                const editBtn = e.target.closest('[data-action="edit-routine"]');
                if (editBtn) {
                    const r = this._routines.find(r => r.id === editBtn.dataset.id);
                    if (r) this._showRoutineForm(overlay, r, () => {
                        overlay.innerHTML = renderList();
                        bindMgrEvents();
                    });
                }
                const delBtn = e.target.closest('[data-action="del-routine"]');
                if (delBtn) {
                    this.removeRoutine(delBtn.dataset.id).then(() => {
                        overlay.innerHTML = renderList();
                        bindMgrEvents();
                    });
                }
            });
        };
        bindMgrEvents();
    }

    _showRoutineForm(parentOverlay, editRoutine, onDone) {
        const isEdit = !!editRoutine;
        const catOptions = this.CATEGORIES.map(c =>
            `<option value="${c.id}"${(editRoutine?.category || 'life') === c.id ? ' selected' : ''}>${c.icon} ${c.name}</option>`
        ).join('');
        const freqOptions = [
            ['daily', '每天'], ['weekdays', '工作日'], ['weekends', '周末']
        ].map(([v, l]) =>
            `<option value="${v}"${(editRoutine?.frequency || 'daily') === v ? ' selected' : ''}>${l}</option>`
        ).join('');

        const form = document.createElement('div');
        form.className = 'sch-form-overlay';
        form.innerHTML = `
            <div class="sch-form">
                <div class="sch-form-title">${isEdit ? '编辑习惯' : '添加习惯'}</div>
                <div class="sch-form-row">
                    <label>名称</label>
                    <input type="text" class="sch-input" id="sch-rt-name" value="${this._escHtml(editRoutine?.name || '')}" placeholder="习惯名称">
                </div>
                <div class="sch-form-row">
                    <label>图标</label>
                    <input type="text" class="sch-input sch-input-sm" id="sch-rt-icon" value="${editRoutine?.icon || '📌'}" maxlength="4">
                </div>
                <div class="sch-form-row sch-form-row-inline">
                    <div><label>时间</label><input type="time" class="sch-input" id="sch-rt-time" value="${editRoutine?.time || '08:00'}"></div>
                    <div><label>时长(分)</label><input type="number" class="sch-input" id="sch-rt-dur" value="${editRoutine?.duration || 30}" min="1" max="480"></div>
                </div>
                <div class="sch-form-row sch-form-row-inline">
                    <div><label>分类</label><select class="sch-input" id="sch-rt-cat">${catOptions}</select></div>
                    <div><label>频率</label><select class="sch-input" id="sch-rt-freq">${freqOptions}</select></div>
                </div>
                <div class="sch-form-actions">
                    <button class="sch-btn sch-btn-cancel" id="sch-rtf-cancel">取消</button>
                    <button class="sch-btn sch-btn-primary" id="sch-rtf-save">${isEdit ? '保存' : '添加'}</button>
                </div>
            </div>`;

        (parentOverlay || this._panelEl).appendChild(form);
        form.querySelector('#sch-rt-name')?.focus();

        form.querySelector('#sch-rtf-cancel').onclick = () => form.remove();
        form.addEventListener('click', (e) => { if (e.target === form) form.remove(); });

        form.querySelector('#sch-rtf-save').onclick = async () => {
            const name = form.querySelector('#sch-rt-name').value.trim();
            if (!name) { form.querySelector('#sch-rt-name').focus(); return; }
            const data = {
                name,
                icon: form.querySelector('#sch-rt-icon').value || '📌',
                time: form.querySelector('#sch-rt-time').value,
                duration: parseInt(form.querySelector('#sch-rt-dur').value) || 30,
                category: form.querySelector('#sch-rt-cat').value,
                frequency: form.querySelector('#sch-rt-freq').value
            };
            if (isEdit) {
                await this.updateRoutine(editRoutine.id, data);
            } else {
                await this.addRoutine(data);
            }
            form.remove();
            if (onDone) onDone();
        };
    }

    // ─── 上下文菜单 ───
    _showPlanContextMenu(planId, anchor) {
        this._closeContextMenus();
        const plan = this._plans.find(p => p.id === planId);
        if (!plan) return;

        const menu = document.createElement('div');
        menu.className = 'sch-ctx-menu';
        menu.innerHTML = `
            <div class="sch-ctx-item" data-ctx="edit"><i class="fas fa-pen"></i> 编辑</div>
            <div class="sch-ctx-item" data-ctx="toggle"><i class="fas fa-${plan.completed ? 'undo' : 'check'}"></i> ${plan.completed ? '取消完成' : '标记完成'}</div>
            <div class="sch-ctx-item sch-ctx-danger" data-ctx="delete"><i class="fas fa-trash-alt"></i> 删除</div>`;

        this._panelEl.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const panelRect = this._panelEl.getBoundingClientRect();
        menu.style.top = (rect.bottom - panelRect.top + 4) + 'px';
        menu.style.right = (panelRect.right - rect.right) + 'px';

        const close = () => menu.remove();
        setTimeout(() => document.addEventListener('click', close, { once: true }), 10);

        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-ctx]')?.dataset.ctx;
            if (action === 'edit') this._showPlanForm(plan);
            if (action === 'toggle') { await this.togglePlanComplete(planId); this._refreshPanel(); }
            if (action === 'delete') { await this.removePlan(planId); this._refreshPanel(); }
            close();
        });
    }

    _showRoutineContextMenu(routineId, anchor) {
        this._closeContextMenus();
        const menu = document.createElement('div');
        menu.className = 'sch-ctx-menu';
        menu.innerHTML = `
            <div class="sch-ctx-item" data-ctx="manage"><i class="fas fa-cog"></i> 管理习惯</div>
            <div class="sch-ctx-item sch-ctx-danger" data-ctx="delete"><i class="fas fa-trash-alt"></i> 删除此习惯</div>`;

        this._panelEl.appendChild(menu);
        const rect = anchor.getBoundingClientRect();
        const panelRect = this._panelEl.getBoundingClientRect();
        menu.style.top = (rect.bottom - panelRect.top + 4) + 'px';
        menu.style.right = (panelRect.right - rect.right) + 'px';

        const close = () => menu.remove();
        setTimeout(() => document.addEventListener('click', close, { once: true }), 10);

        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-ctx]')?.dataset.ctx;
            if (action === 'manage') this._showRoutineManager();
            if (action === 'delete') { await this.removeRoutine(routineId); this._refreshPanel(); }
            close();
        });
    }

    _closeContextMenus() {
        this._panelEl?.querySelectorAll('.sch-ctx-menu').forEach(m => m.remove());
        document.querySelectorAll('.sch-ctx-fixed').forEach(m => m.remove());
    }

    // ─── 周视图：事件块右键菜单 ───
    _showWeekBlockMenu(block, ev) {
        this._closeContextMenus();
        this._removeWeekTooltip();
        const { id, type, date } = block.dataset;

        if (type === 'routine') {
            const menu = this._createFixedMenu(ev, `
                <div class="sch-ctx-item" data-ctx="toggle"><i class="fas fa-check-circle"></i> 打卡</div>`);
            menu.addEventListener('click', async (e) => {
                if (e.target.closest('[data-ctx="toggle"]')) {
                    await this.toggleRoutineCheck(id, date);
                    this._refreshPanel();
                }
                menu.remove();
            });
            return;
        }

        const plan = this._plans.find(p => p.id === id);
        if (!plan) return;
        const menu = this._createFixedMenu(ev, `
            <div class="sch-ctx-item" data-ctx="edit"><i class="fas fa-pen"></i> 编辑</div>
            <div class="sch-ctx-item" data-ctx="toggle"><i class="fas fa-${plan.completed ? 'undo' : 'check'}"></i> ${plan.completed ? '取消完成' : '标记完成'}</div>
            <div class="sch-ctx-item sch-ctx-danger" data-ctx="delete"><i class="fas fa-trash-alt"></i> 删除</div>`);
        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-ctx]')?.dataset.ctx;
            if (action === 'edit') { this._currentDate = date; this._showPlanForm(plan); }
            if (action === 'toggle') { await this.togglePlanComplete(id); this._refreshPanel(); }
            if (action === 'delete') { await this.removePlan(id); this._refreshPanel(); }
            menu.remove();
        });
    }

    // ─── 周视图：日列头右键菜单 ───
    _showWeekDayMenu(dateStr, ev) {
        this._closeContextMenus();
        const plans = this.getPlansForDate(dateStr);
        const d = new Date(dateStr + 'T00:00:00');
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        const hasCopy = !!this._copyDayBuffer;

        let items = `<div class="sch-ctx-item" data-ctx="add"><i class="fas fa-plus"></i> 新建计划</div>`;
        if (plans.length > 0) {
            items += `<div class="sch-ctx-item" data-ctx="copy"><i class="fas fa-copy"></i> 复制 ${label} 的日程</div>`;
        }
        if (hasCopy) {
            const srcD = new Date(this._copyDayBuffer + 'T00:00:00');
            const srcLabel = `${srcD.getMonth() + 1}/${srcD.getDate()}`;
            items += `<div class="sch-ctx-item" data-ctx="paste"><i class="fas fa-paste"></i> 粘贴 ${srcLabel} → ${label}</div>`;
        }
        if (plans.length > 0) {
            items += `<div class="sch-ctx-item sch-ctx-danger" data-ctx="clear"><i class="fas fa-eraser"></i> 清空 ${label} 日程</div>`;
        }

        const menu = this._createFixedMenu(ev, items);
        menu.addEventListener('click', async (e) => {
            const action = e.target.closest('[data-ctx]')?.dataset.ctx;
            if (action === 'add') { this._currentDate = dateStr; this._showPlanForm(); }
            if (action === 'copy') { this._copyDayBuffer = dateStr; this._enterPasteMode(); }
            if (action === 'paste') { await this._copyDayPlans(this._copyDayBuffer, dateStr); this._exitPasteMode(); this._refreshPanel(); }
            if (action === 'clear') { await this._clearDayPlans(dateStr); this._refreshPanel(); }
            menu.remove();
        });
    }

    _createFixedMenu(ev, innerHtml) {
        const menu = document.createElement('div');
        menu.className = 'sch-ctx-menu sch-ctx-fixed';
        menu.innerHTML = innerHtml;
        document.body.appendChild(menu);

        const mw = 180, mh = 200;
        let left = ev.clientX, top = ev.clientY;
        if (left + mw > window.innerWidth) left = window.innerWidth - mw - 8;
        if (top + mh > window.innerHeight) top = window.innerHeight - mh - 8;
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        const close = (e) => { if (!menu.contains(e.target)) menu.remove(); };
        setTimeout(() => document.addEventListener('click', close, { once: true }), 10);
        return menu;
    }

    // ─── 复制日程 ───
    async _copyDayPlans(sourceDate, targetDate) {
        if (!sourceDate || !targetDate || sourceDate === targetDate) return;
        const srcPlans = this._plans.filter(p => p.date === sourceDate);
        if (srcPlans.length === 0) return;

        for (const src of srcPlans) {
            const copy = {
                ...src,
                id: this._genId('plan'),
                date: targetDate,
                completed: false,
                createdAt: Date.now()
            };
            this._plans.push(copy);
        }
        await this._savePlans();
    }

    async _clearDayPlans(dateStr) {
        this._plans = this._plans.filter(p => p.date !== dateStr);
        await this._savePlans();
    }

    _enterPasteMode() {
        this._pasteMode = true;
        this._refreshPanel();
    }

    _exitPasteMode() {
        this._pasteMode = false;
        this._copyDayBuffer = null;
    }

    // ─── 快捷输入解析 ───
    _parseQuickInput(text) {
        if (!text || !text.trim()) return null;
        text = text.trim();

        const weekMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

        // Pattern: [日期] [周X] 时间[-时间] 名称
        const m = text.match(/^(?:(\d{1,2})\s+)?(?:周([一二三四五六日天])\s+)?(\d{1,2}):(\d{2})(?:\s*[-–]\s*(\d{1,2}):(\d{2}))?\s+(.+)$/);
        if (!m) return null;

        const [, dayStr, weekDay, sh, sm, eh, em, name] = m;
        let date;
        const now = new Date();

        if (dayStr) {
            const day = parseInt(dayStr);
            const d = new Date(now.getFullYear(), now.getMonth(), day);
            if (d.getDate() !== day) return null;
            date = this._dateToStr(d);
        } else if (weekDay) {
            const target = weekMap[weekDay];
            if (target === undefined) return null;
            const curr = now.getDay();
            let diff = target - curr;
            if (diff < 0) diff += 7;
            const d = new Date(now);
            d.setDate(d.getDate() + diff);
            date = this._dateToStr(d);
        } else {
            date = this._currentDate || this._todayStr();
        }

        const startTime = `${String(parseInt(sh)).padStart(2, '0')}:${sm}`;
        let endTime;
        if (eh && em) {
            endTime = `${String(parseInt(eh)).padStart(2, '0')}:${em}`;
        } else {
            const startH = parseInt(sh);
            endTime = `${String(Math.min(startH + 1, 23)).padStart(2, '0')}:${sm}`;
        }

        return { date, startTime, endTime, name: name.trim() };
    }

    async _handleQuickInput(text) {
        const parsed = this._parseQuickInput(text);
        if (!parsed) return false;

        const plan = await this.addPlan({
            name: parsed.name,
            date: parsed.date,
            startTime: parsed.startTime,
            endTime: parsed.endTime,
            category: 'work'
        });

        if (plan) {
            this._lastCreatedId = plan.id;
            const targetMonday = this._getMonday(parsed.date);
            if (targetMonday.getTime() !== this._weekStart.getTime()) {
                this._weekStart = targetMonday;
            }
            this._refreshPanel();
            return true;
        }
        return false;
    }
}

window.scheduleManager = new ScheduleManager();
