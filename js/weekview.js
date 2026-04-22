/**
 * WeekViewManager — 课表风格周视图
 * 读取 ScheduleManager 的数据，以经典网格课表形式展示一周计划
 * 入口：日视图面板中的"周"按钮，或独立的 Dock 按钮
 */
class WeekViewManager {
    constructor() {
        this._panelOpen = false;
        this._panelEl = null;
        this._overlayEl = null;
        this._escHandler = null;
        this._weekStart = null; // Date obj, always Monday
        this._tooltip = null;
        this._nowLineTick = null;
    }

    get _sch() { return window.scheduleManager; }

    // ─── 日期工具 ───
    _todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    _dateToStr(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    _getMonday(dateStr) {
        const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }
    _getWeekDays() {
        const days = [];
        const m = new Date(this._weekStart);
        for (let i = 0; i < 7; i++) {
            days.push({
                date: new Date(m),
                dateStr: this._dateToStr(m),
                dayName: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i],
                dayNum: m.getDate(),
                isToday: this._dateToStr(m) === this._todayStr(),
                isWeekend: i >= 5,
            });
            m.setDate(m.getDate() + 1);
        }
        return days;
    }
    _weekLabel() {
        const m = new Date(this._weekStart);
        const sun = new Date(m);
        sun.setDate(sun.getDate() + 6);
        const y = m.getFullYear();
        const oneJan = new Date(y, 0, 1);
        const weekNum = Math.ceil(((m - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
        return `第${weekNum}周 · ${m.getMonth() + 1}/${m.getDate()} – ${sun.getMonth() + 1}/${sun.getDate()}`;
    }
    _escHtml(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ─── 获取一天的全部事件（例程 + 计划） ───
    _getDayEvents(dateStr) {
        if (!this._sch || !this._sch._initialized) return [];
        const events = [];
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

        // 例程（习惯）
        this._sch._routines.forEach(r => {
            if (!r.enabled) return;
            let show = false;
            if (r.frequency === 'daily') show = true;
            else if (r.frequency === 'weekdays') show = dayOfWeek >= 1 && dayOfWeek <= 5;
            else if (r.frequency === 'weekends') show = dayOfWeek === 0 || dayOfWeek === 6;
            else if (r.frequency === 'custom' && Array.isArray(r.customDays)) {
                show = r.customDays.includes(dayNames[dayOfWeek]);
            }
            if (!show) return;

            const cat = this._sch._getCategory(r.category);
            events.push({
                type: 'routine',
                id: r.id,
                name: r.name,
                icon: r.icon || cat.icon,
                startTime: r.time || '09:00',
                duration: r.duration || 30,
                category: r.category,
                catColor: cat.color,
                completed: this._sch._isRoutineChecked(r.id, dateStr),
            });
        });

        // 灵活计划
        const plans = this._sch._plans.filter(p => p.date === dateStr);
        plans.forEach(p => {
            const cat = this._sch._getCategory(p.category);
            events.push({
                type: 'plan',
                id: p.id,
                name: p.name,
                icon: p.icon || cat.icon,
                startTime: p.startTime || '09:00',
                endTime: p.endTime,
                duration: p.duration || 60,
                category: p.category,
                catColor: cat.color,
                completed: !!p.completed,
                note: p.note,
            });
        });

        return events;
    }

    // ─── 面板 toggle ───
    toggle() {
        if (this._panelOpen) this.close();
        else this.open();
    }
    open() {
        if (this._panelOpen) return;
        this._panelOpen = true;
        if (!this._weekStart) this._weekStart = this._getMonday();
        this._render();
        this._startNowLine();
    }
    close() {
        this._panelOpen = false;
        this._stopNowLine();
        this._removeTooltip();
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._overlayEl) this._overlayEl.classList.remove('wv-overlay-visible');
        if (this._panelEl) {
            this._panelEl.classList.add('wv-panel-closing');
            setTimeout(() => {
                this._panelEl?.remove();
                this._panelEl = null;
                this._overlayEl?.remove();
                this._overlayEl = null;
            }, 300);
        }
    }

    // ─── 主渲染 ───
    _render() {
        this._panelEl?.remove();
        this._overlayEl?.remove();

        const overlay = document.createElement('div');
        overlay.className = 'wv-overlay';
        overlay.addEventListener('click', () => this.close());
        document.body.appendChild(overlay);
        this._overlayEl = overlay;

        const panel = document.createElement('div');
        panel.className = 'wv-panel';
        panel.innerHTML = this._buildHTML();
        document.body.appendChild(panel);
        this._panelEl = panel;

        requestAnimationFrame(() => {
            overlay.classList.add('wv-overlay-visible');
            panel.classList.add('wv-panel-visible');
        });

        this._bindEvents();

        this._escHandler = e => { if (e.key === 'Escape') this.close(); };
        document.addEventListener('keydown', this._escHandler);
    }

    _refresh() {
        if (!this._panelEl) return;
        const body = this._panelEl.querySelector('.wv-grid-wrap');
        if (body) {
            const scrollTop = body.scrollTop;
            this._panelEl.innerHTML = this._buildHTML();
            this._bindEvents();
            const newBody = this._panelEl.querySelector('.wv-grid-wrap');
            if (newBody) newBody.scrollTop = scrollTop;
        }
    }

    // ─── 构建 HTML ───
    _buildHTML() {
        const days = this._getWeekDays();
        const HOURS = [];
        for (let h = 6; h <= 23; h++) HOURS.push(h);

        const PX_PER_HOUR = 56;
        const MIN_BLOCK_H = 28;
        const HEADER_H = 40;
        const totalBodyH = HOURS.length * PX_PER_HOUR;

        let header = `
        <div class="wv-header">
            <div class="wv-title">
                <i class="fas fa-calendar-week"></i>
                <span>周课表</span>
            </div>
            <div class="wv-week-nav">
                <button class="wv-nav-btn" data-action="prev-week"><i class="fas fa-chevron-left"></i></button>
                <span class="wv-week-label">${this._escHtml(this._weekLabel())}</span>
                <button class="wv-nav-btn" data-action="next-week"><i class="fas fa-chevron-right"></i></button>
            </div>
            <button class="wv-nav-btn wv-today-btn" data-action="go-today">本周</button>
            <div class="wv-legend">
                ${(this._sch?.CATEGORIES || []).map(c =>
                    `<span class="wv-legend-item"><span class="wv-legend-dot" style="background:${c.color}"></span>${c.name}</span>`
                ).join('')}
            </div>
            <button class="wv-close-btn" data-action="close"><i class="fas fa-times"></i></button>
        </div>`;

        // Day header row
        let dayHeaders = `<div class="wv-day-row">
            <div class="wv-corner"><i class="fas fa-clock" style="opacity:0.3"></i></div>`;
        days.forEach(d => {
            dayHeaders += `<div class="wv-day-hd${d.isToday ? ' wv-today' : ''}${d.isWeekend ? ' wv-weekend' : ''}">
                <span class="wv-day-name">${d.dayName}</span>
                <span class="wv-day-num">${d.dayNum}</span>
            </div>`;
        });
        dayHeaders += '</div>';

        // Body: time col + 7 day columns side by side
        let timeCol = '<div class="wv-time-col">';
        HOURS.forEach(hr => {
            timeCol += `<div class="wv-time-label" style="height:${PX_PER_HOUR}px">${String(hr).padStart(2, '0')}:00</div>`;
        });
        timeCol += '</div>';

        let dayCols = '';
        days.forEach(d => {
            const events = this._getDayEvents(d.dateStr);
            let hourLines = '';
            HOURS.forEach(hr => {
                hourLines += `<div class="wv-hour-line" data-date="${d.dateStr}" data-hour="${hr}"></div>`;
            });

            let eventBlocks = '';
            events.forEach(ev => {
                const [sh, sm] = ev.startTime.split(':').map(Number);
                const startMin = sh * 60 + sm;
                const gridStartMin = HOURS[0] * 60;
                const topPx = ((startMin - gridStartMin) / 60) * PX_PER_HOUR;
                const rawHeight = (ev.duration / 60) * PX_PER_HOUR;
                const blockH = Math.max(rawHeight, MIN_BLOCK_H);
                const isShort = ev.duration <= 20;
                const isMedium = ev.duration > 20 && ev.duration <= 45;

                let sizeClass = '';
                if (isShort) sizeClass = ' wv-block-xs';
                else if (isMedium) sizeClass = ' wv-block-sm';

                const endTimeStr = ev.endTime || this._addMinutes(ev.startTime, ev.duration);

                eventBlocks += `<div class="wv-block wv-cat-${ev.category}${ev.completed ? ' wv-done' : ''}${sizeClass}"
                    style="top:${topPx}px;height:${blockH}px"
                    data-id="${ev.id}" data-type="${ev.type}" data-date="${d.dateStr}"
                    data-tooltip-name="${this._escHtml(ev.name)}"
                    data-tooltip-time="${ev.startTime} – ${endTimeStr}"
                    data-tooltip-dur="${ev.duration}min"
                    data-tooltip-cat="${ev.category}">
                    <span class="wv-block-name">${ev.icon} ${this._escHtml(ev.name)}</span>
                    ${!isShort ? `<span class="wv-block-time">${ev.startTime} · ${ev.duration}min</span>` : ''}
                </div>`;
            });

            // Now line for today's column
            let nowLine = '';
            if (d.isToday) {
                const now = new Date();
                const nowMin = now.getHours() * 60 + now.getMinutes();
                const gridStartMin = HOURS[0] * 60;
                if (nowMin >= gridStartMin) {
                    const topPx = ((nowMin - gridStartMin) / 60) * PX_PER_HOUR;
                    nowLine = `<div class="wv-now-line" style="top:${topPx}px" data-now-line>
                        <div class="wv-now-dot"></div>
                    </div>`;
                }
            }

            dayCols += `<div class="wv-day-col${d.isToday ? ' wv-today-col' : ''}${d.isWeekend ? ' wv-weekend-col' : ''}" data-date="${d.dateStr}">
                ${hourLines}
                ${eventBlocks}
                ${nowLine}
            </div>`;
        });

        return `${header}
        ${dayHeaders}
        <div class="wv-grid-wrap">
            <div class="wv-body">
                ${timeCol}
                ${dayCols}
            </div>
        </div>`;
    }

    _addMinutes(timeStr, mins) {
        const [h, m] = timeStr.split(':').map(Number);
        const total = h * 60 + m + mins;
        return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    }

    // ─── 事件绑定 ───
    _bindEvents() {
        if (!this._panelEl) return;

        // Header buttons
        this._panelEl.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'close') this.close();
            else if (action === 'prev-week') {
                this._weekStart.setDate(this._weekStart.getDate() - 7);
                this._refresh();
            } else if (action === 'next-week') {
                this._weekStart.setDate(this._weekStart.getDate() + 7);
                this._refresh();
            } else if (action === 'go-today') {
                this._weekStart = this._getMonday();
                this._refresh();
            }
        });

        // Block hover tooltip
        this._panelEl.addEventListener('mouseover', e => {
            const block = e.target.closest('.wv-block');
            if (!block) return;
            this._showTooltip(block);
        });
        this._panelEl.addEventListener('mouseout', e => {
            const block = e.target.closest('.wv-block');
            if (!block) return;
            if (!block.contains(e.relatedTarget)) {
                this._removeTooltip();
            }
        });

        // Block click → toggle complete
        this._panelEl.addEventListener('click', e => {
            const block = e.target.closest('.wv-block');
            if (!block || e.target.closest('[data-action]')) return;
            const { id, type, date } = block.dataset;
            if (type === 'routine') {
                this._sch.toggleRoutineCheck(id, date).then(() => this._refresh());
            } else if (type === 'plan') {
                this._sch.togglePlanComplete(id).then(() => this._refresh());
            }
        });

        // Double-click → open day view for that date
        this._panelEl.addEventListener('dblclick', e => {
            const block = e.target.closest('.wv-block');
            const dayCol = e.target.closest('.wv-day-col');
            const dateStr = (block || dayCol)?.dataset?.date;
            if (dateStr && this._sch) {
                this.close();
                this._sch._currentDate = dateStr;
                this._sch.openPanel();
            }
        });
    }

    // ─── Tooltip（解决短任务展示问题的核心） ───
    _showTooltip(block) {
        this._removeTooltip();
        const name = block.dataset.tooltipName;
        const time = block.dataset.tooltipTime;
        const dur = block.dataset.tooltipDur;
        const cat = block.dataset.tooltipCat;
        const catObj = this._sch?._getCategory(cat);
        const catName = catObj?.name || cat;
        const catColor = catObj?.color || '#a78bfa';

        const tip = document.createElement('div');
        tip.className = 'wv-tooltip';
        tip.innerHTML = `
            <div class="wv-tip-name">${name}</div>
            <div class="wv-tip-time"><i class="fas fa-clock"></i> ${time}</div>
            <div class="wv-tip-meta">
                <span class="wv-tip-dur"><i class="fas fa-hourglass-half"></i> ${dur}</span>
                <span class="wv-tip-cat" style="color:${catColor}"><i class="fas fa-circle" style="font-size:6px"></i> ${catName}</span>
            </div>`;

        document.body.appendChild(tip);
        this._tooltip = tip;

        const rect = block.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        let left = rect.right + 8;
        let top = rect.top + (rect.height - tipRect.height) / 2;

        if (left + tipRect.width > window.innerWidth - 12) {
            left = rect.left - tipRect.width - 8;
        }
        top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));

        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        tip.classList.add('wv-tooltip-visible');
    }

    _removeTooltip() {
        if (this._tooltip) {
            this._tooltip.remove();
            this._tooltip = null;
        }
    }

    // ─── Now line 实时更新 ───
    _startNowLine() {
        this._updateNowLine();
        this._nowLineTick = setInterval(() => this._updateNowLine(), 60000);
    }
    _stopNowLine() {
        if (this._nowLineTick) {
            clearInterval(this._nowLineTick);
            this._nowLineTick = null;
        }
    }
    _updateNowLine() {
        if (!this._panelEl) return;
        const line = this._panelEl.querySelector('[data-now-line]');
        if (!line) return;
        const now = new Date();
        const nowMin = now.getHours() * 60 + now.getMinutes();
        const gridStartMin = 6 * 60; // matches HOURS[0]
        const PX_PER_HOUR = 56;
        line.style.top = ((nowMin - gridStartMin) / 60) * PX_PER_HOUR + 'px';
    }

    // ─── 导航到指定周 ───
    goToWeek(dateStr) {
        this._weekStart = this._getMonday(dateStr);
        if (this._panelOpen) this._refresh();
    }
}

window.weekViewManager = new WeekViewManager();
