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
        this._currentDate = this._todayStr();
        this._panelEl = null;
        this._overlayEl = null;
        this._escHandler = null;
        this._initialized = false;
        this._currentTimeTick = null;

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

    openPanel() {
        if (this._panelOpen) return;
        this._panelOpen = true;
        this._currentDate = this._todayStr();
        this._renderPanel();
        this._startCurrentTimeTick();
    }

    closePanel() {
        this._panelOpen = false;
        this._stopCurrentTimeTick();
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
        this._panelEl = panel;

        panel.innerHTML = this._buildPanelHTML();
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        requestAnimationFrame(() => {
            overlay.classList.add('sch-overlay-visible');
            panel.classList.add('sch-panel-visible');
        });

        this._bindPanelEvents();
        this._updateCurrentHighlight();

        const dockBtn = document.getElementById('schedule-dock-btn');
        if (dockBtn) dockBtn.classList.add('active');
    }

    _refreshPanel() {
        if (!this._panelEl || !this._panelOpen) return;
        const scrollTop = this._panelEl.querySelector('.sch-panel-body')?.scrollTop || 0;
        this._panelEl.innerHTML = this._buildPanelHTML();
        this._updateCurrentHighlight();
        const body = this._panelEl.querySelector('.sch-panel-body');
        if (body) body.scrollTop = scrollTop;
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
                <div class="sch-panel-title"><i class="fas fa-calendar-check"></i> 每日计划</div>
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
                    <button class="sch-add-plan-btn" data-action="add-plan"><i class="fas fa-plus"></i> 添加计划</button>
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

    // ─── 事件绑定 ───
    _bindPanelEvents() {
        const panel = this._panelEl;
        if (!panel) return;

        this._escHandler = (e) => { if (e.key === 'Escape') this.closePanel(); };
        document.addEventListener('keydown', this._escHandler);

        panel.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action]');
            const action = target?.dataset.action;

            if (action === 'close') return this.closePanel();
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
    }

    // ─── 计划创建/编辑表单 ───
    _showPlanForm(editPlan) {
        const isEdit = !!editPlan;
        const existing = this._panelEl?.querySelector('.sch-form-overlay');
        if (existing) existing.remove();

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
                    <input type="text" class="sch-input" id="sch-plan-name" placeholder="做什么..." value="${this._escHtml(editPlan?.name || '')}">
                </div>
                <div class="sch-form-row">
                    <label>图标</label>
                    <input type="text" class="sch-input sch-input-sm" id="sch-plan-icon" placeholder="emoji" value="${editPlan?.icon || '📌'}" maxlength="4">
                </div>
                <div class="sch-form-row sch-form-row-inline">
                    <div>
                        <label>开始</label>
                        <input type="time" class="sch-input" id="sch-plan-start" value="${editPlan?.startTime || this._suggestNextTime()}">
                    </div>
                    <div>
                        <label>结束</label>
                        <input type="time" class="sch-input" id="sch-plan-end" value="${editPlan?.endTime || this._suggestNextEndTime()}">
                    </div>
                </div>
                <div class="sch-form-row">
                    <label>分类</label>
                    <select class="sch-input" id="sch-plan-cat">${catOptions}</select>
                </div>
                <div class="sch-form-row">
                    <label>备注</label>
                    <input type="text" class="sch-input" id="sch-plan-note" placeholder="可选备注..." value="${this._escHtml(editPlan?.note || '')}">
                </div>
                <div class="sch-form-actions">
                    <button class="sch-btn sch-btn-cancel" id="sch-form-cancel">取消</button>
                    ${isEdit ? '<button class="sch-btn sch-btn-delete" id="sch-form-delete">删除</button>' : ''}
                    <button class="sch-btn sch-btn-primary" id="sch-form-save">${isEdit ? '保存' : '添加'}</button>
                </div>
            </div>`;

        this._panelEl.appendChild(overlay);
        overlay.querySelector('#sch-plan-name')?.focus();

        overlay.querySelector('#sch-form-cancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        if (isEdit) {
            overlay.querySelector('#sch-form-delete').onclick = async () => {
                await this.removePlan(editPlan.id);
                overlay.remove();
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
            overlay.remove();
            this._refreshPanel();
        };
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
    }
}

window.scheduleManager = new ScheduleManager();
