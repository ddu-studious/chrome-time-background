/**
 * 学习中心控制器 v1.0.0
 * 功能：课程管理、进度追踪、学习统计、快速跳转
 * 支持 mashibing.com 等学习平台的 Content Script 进度同步
 */
class StudyCenter {
    constructor() {
        this._el = null;
        this._panelOpen = false;
        this._courses = [];
        this._stats = { todayMinutes: 0, totalMinutes: 0, streak: 0, lastDate: '' };
        this._editingId = null;
        this._trackingData = {};
    }

    async init() {
        await this._loadData();
        this._injectDOM();
        this._bindEvents();
        this._render();
        this._listenTracker();
        this._updateTodayStats();
    }

    // ===================== Data =====================

    async _loadData() {
        try {
            const result = await chrome.storage.local.get(['studyCourses', 'studyStats', 'studyTracking']);
            this._courses = result.studyCourses || [];
            this._stats = result.studyStats || { todayMinutes: 0, totalMinutes: 0, streak: 0, lastDate: '' };
            this._trackingData = result.studyTracking || {};
        } catch (e) {
            console.warn('[StudyCenter] 数据加载失败:', e);
        }
    }

    async _saveCourses() {
        try { await chrome.storage.local.set({ studyCourses: this._courses }); } catch {}
    }

    async _saveStats() {
        try { await chrome.storage.local.set({ studyStats: this._stats }); } catch {}
    }

    _updateTodayStats() {
        const today = new Date().toISOString().slice(0, 10);
        if (this._stats.lastDate !== today) {
            if (this._stats.lastDate) {
                const last = new Date(this._stats.lastDate);
                const diff = Math.floor((new Date(today) - last) / 86400000);
                if (diff === 1) this._stats.streak++;
                else if (diff > 1) this._stats.streak = 0;
            }
            this._stats.todayMinutes = 0;
            this._stats.lastDate = today;
            this._saveStats();
        }
    }

    addCourse(course) {
        const id = 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const newCourse = {
            id,
            name: course.name || '未命名课程',
            platform: course.platform || 'mashibing',
            url: course.url || '',
            icon: course.icon || '',
            progress: course.progress || 0,
            totalSections: course.totalSections || 0,
            completedSections: course.completedSections || 0,
            currentSection: course.currentSection || '',
            lastStudyTime: Date.now(),
            createdAt: Date.now(),
            pinned: false,
        };
        this._courses.unshift(newCourse);
        this._saveCourses();
        this._render();
        return newCourse;
    }

    removeCourse(id) {
        this._courses = this._courses.filter(c => c.id !== id);
        this._saveCourses();
        this._render();
    }

    updateCourse(id, updates) {
        const course = this._courses.find(c => c.id === id);
        if (!course) return;
        Object.assign(course, updates, { lastStudyTime: Date.now() });
        this._saveCourses();
        this._render();
    }

    togglePin(id) {
        const course = this._courses.find(c => c.id === id);
        if (!course) return;
        course.pinned = !course.pinned;
        this._saveCourses();
        this._render();
    }

    _getSortedCourses() {
        return [...this._courses].sort((a, b) => {
            if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
            return b.lastStudyTime - a.lastStudyTime;
        });
    }

    _listenTracker() {
        chrome.runtime.onMessage.addListener((msg) => {
            if (msg.action === 'study_progress_update') {
                this._handleTrackerUpdate(msg.data);
            }
        });
    }

    _handleTrackerUpdate(data) {
        if (!data?.url) return;
        const existing = this._courses.find(c => c.url === data.url || this._urlMatch(c.url, data.url));
        if (existing) {
            if (data.sectionName) existing.currentSection = data.sectionName;
            if (data.courseName && existing.name === '未命名课程') existing.name = data.courseName;
            if (data.progress > 0) existing.progress = data.progress;
            existing.lastStudyTime = Date.now();
            this._saveCourses();
            this._render();
        } else {
            this.addCourse({
                name: data.courseName || '自动检测课程',
                platform: data.platform || 'mashibing',
                url: data.url,
                currentSection: data.sectionName || '',
                progress: data.progress || 0,
            });
        }
        this._stats.todayMinutes += 1;
        this._stats.totalMinutes += 1;
        this._saveStats();
        this._renderStats();
    }

    _urlMatch(a, b) {
        try {
            const ua = new URL(a);
            const ub = new URL(b);
            return ua.hostname === ub.hostname && ua.pathname === ub.pathname;
        } catch { return false; }
    }

    // ===================== DOM =====================

    _injectDOM() {
        const el = document.createElement('div');
        el.className = 'study-center';
        el.id = 'study-center';
        el.innerHTML = `
            <div class="sc-panel" id="sc-panel">
                <div class="sc-header">
                    <div class="sc-title"><i class="fas fa-graduation-cap"></i><span>学习中心</span></div>
                    <div class="sc-header-actions">
                        <button class="sc-btn sc-add-btn" id="sc-add-btn" title="添加课程"><i class="fas fa-plus"></i></button>
                        <button class="sc-btn sc-close-btn" id="sc-close-btn" title="关闭"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="sc-stats" id="sc-stats"></div>
                <div class="sc-body" id="sc-body">
                    <div class="sc-empty" id="sc-empty">
                        <i class="fas fa-book-open"></i>
                        <p>还没有添加课程</p>
                        <p class="sc-empty-hint">点击 + 添加学习平台的课程链接</p>
                    </div>
                    <div class="sc-list" id="sc-list"></div>
                </div>
                <div class="sc-form hidden" id="sc-form">
                    <div class="sc-form-title" id="sc-form-title">添加课程</div>
                    <div class="sc-form-row">
                        <label>课程名称</label>
                        <input type="text" id="sc-input-name" placeholder="例：Java 高并发编程" maxlength="100">
                    </div>
                    <div class="sc-form-row">
                        <label>课程链接</label>
                        <input type="url" id="sc-input-url" placeholder="粘贴学习平台的课程 URL" maxlength="500">
                    </div>
                    <div class="sc-form-row">
                        <label>平台</label>
                        <select id="sc-input-platform">
                            <option value="mashibing">马士兵教育</option>
                            <option value="bilibili">哔哩哔哩</option>
                            <option value="imooc">慕课网</option>
                            <option value="juejin">掘金</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div class="sc-form-row">
                        <label>总章节数（可选）</label>
                        <input type="number" id="sc-input-sections" placeholder="0" min="0" max="9999">
                    </div>
                    <div class="sc-form-actions">
                        <button class="sc-form-cancel" id="sc-form-cancel">取消</button>
                        <button class="sc-form-save" id="sc-form-save">保存</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(el);
        this._el = el;
    }

    _bindEvents() {
        const panel = this._el;

        panel.querySelector('#sc-close-btn').addEventListener('click', () => this.hide());
        panel.querySelector('#sc-add-btn').addEventListener('click', () => this._showForm());
        panel.querySelector('#sc-form-cancel').addEventListener('click', () => this._hideForm());
        panel.querySelector('#sc-form-save').addEventListener('click', () => this._submitForm());

        panel.querySelector('#sc-input-url').addEventListener('paste', () => {
            setTimeout(() => this._autofillFromUrl(), 100);
        });

        panel.querySelector('#sc-list').addEventListener('click', (e) => {
            const card = e.target.closest('.sc-card');
            if (!card) return;
            const id = card.dataset.id;

            if (e.target.closest('.sc-card-open')) {
                this._openCourse(id);
            } else if (e.target.closest('.sc-card-pin')) {
                this.togglePin(id);
            } else if (e.target.closest('.sc-card-edit')) {
                this._showForm(id);
            } else if (e.target.closest('.sc-card-delete')) {
                if (confirm('确定删除此课程？')) this.removeCourse(id);
            }
        });
    }

    // ===================== Render =====================

    _render() {
        this._renderStats();
        this._renderList();
    }

    _renderStats() {
        const el = this._el.querySelector('#sc-stats');
        const streak = this._stats.streak;
        const todayMin = this._stats.todayMinutes;
        const totalHrs = Math.floor(this._stats.totalMinutes / 60);
        const count = this._courses.length;

        el.innerHTML = `
            <div class="sc-stat-item">
                <div class="sc-stat-num">${count}</div>
                <div class="sc-stat-label">课程</div>
            </div>
            <div class="sc-stat-item">
                <div class="sc-stat-num">${todayMin}<span class="sc-stat-unit">min</span></div>
                <div class="sc-stat-label">今日学习</div>
            </div>
            <div class="sc-stat-item">
                <div class="sc-stat-num">${totalHrs}<span class="sc-stat-unit">h</span></div>
                <div class="sc-stat-label">累计</div>
            </div>
            <div class="sc-stat-item">
                <div class="sc-stat-num">${streak}<span class="sc-stat-unit">天</span></div>
                <div class="sc-stat-label">连续学习</div>
            </div>
        `;
    }

    _renderList() {
        const list = this._el.querySelector('#sc-list');
        const empty = this._el.querySelector('#sc-empty');
        const courses = this._getSortedCourses();

        if (courses.length === 0) {
            list.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        list.innerHTML = courses.map(c => {
            const platformInfo = this._getPlatformInfo(c.platform);
            const progress = c.totalSections > 0
                ? Math.round((c.completedSections / c.totalSections) * 100)
                : c.progress || 0;
            const timeAgo = this._timeAgo(c.lastStudyTime);

            return `
                <div class="sc-card${c.pinned ? ' pinned' : ''}" data-id="${c.id}">
                    <div class="sc-card-left">
                        <div class="sc-card-icon" style="background:${platformInfo.color}">
                            ${platformInfo.icon}
                        </div>
                    </div>
                    <div class="sc-card-body">
                        <div class="sc-card-name">${this._esc(c.name)}</div>
                        <div class="sc-card-section">${c.currentSection ? this._esc(c.currentSection) : '尚未开始学习'}</div>
                        <div class="sc-card-meta">
                            <span class="sc-card-platform">${platformInfo.label}</span>
                            <span class="sc-card-time"><i class="fas fa-clock"></i>${timeAgo}</span>
                        </div>
                        <div class="sc-card-progress">
                            <div class="sc-card-progress-bar">
                                <div class="sc-card-progress-fill" style="width:${progress}%"></div>
                            </div>
                            <span class="sc-card-progress-text">${progress}%</span>
                        </div>
                    </div>
                    <div class="sc-card-actions">
                        <button class="sc-card-open" title="继续学习"><i class="fas fa-play-circle"></i></button>
                        <button class="sc-card-pin" title="${c.pinned ? '取消置顶' : '置顶'}"><i class="fas fa-thumbtack${c.pinned ? '' : ' fa-rotate-90'}"></i></button>
                        <button class="sc-card-edit" title="编辑"><i class="fas fa-pen"></i></button>
                        <button class="sc-card-delete" title="删除"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            `;
        }).join('');
    }

    _getPlatformInfo(platform) {
        const map = {
            mashibing: { label: '马士兵', icon: '<i class="fas fa-chalkboard-teacher"></i>', color: 'rgba(255,87,51,0.85)' },
            bilibili:  { label: '哔哩哔哩', icon: '<i class="fab fa-bilibili"></i>', color: 'rgba(0,174,236,0.85)' },
            imooc:     { label: '慕课网', icon: '<i class="fas fa-laptop-code"></i>', color: 'rgba(76,175,80,0.85)' },
            juejin:    { label: '掘金', icon: '<i class="fas fa-gem"></i>', color: 'rgba(30,128,255,0.85)' },
            other:     { label: '其他', icon: '<i class="fas fa-globe"></i>', color: 'rgba(156,39,176,0.85)' },
        };
        return map[platform] || map.other;
    }

    _timeAgo(ts) {
        if (!ts) return '从未';
        const diff = Date.now() - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
        return new Date(ts).toLocaleDateString('zh-CN');
    }

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    // ===================== Form =====================

    _showForm(editId) {
        const form = this._el.querySelector('#sc-form');
        const body = this._el.querySelector('#sc-body');
        this._editingId = editId || null;

        if (editId) {
            const c = this._courses.find(x => x.id === editId);
            if (!c) return;
            this._el.querySelector('#sc-form-title').textContent = '编辑课程';
            this._el.querySelector('#sc-input-name').value = c.name;
            this._el.querySelector('#sc-input-url').value = c.url;
            this._el.querySelector('#sc-input-platform').value = c.platform;
            this._el.querySelector('#sc-input-sections').value = c.totalSections || '';
        } else {
            this._el.querySelector('#sc-form-title').textContent = '添加课程';
            this._el.querySelector('#sc-input-name').value = '';
            this._el.querySelector('#sc-input-url').value = '';
            this._el.querySelector('#sc-input-platform').value = 'mashibing';
            this._el.querySelector('#sc-input-sections').value = '';
        }

        body.classList.add('hidden');
        form.classList.remove('hidden');
        this._el.querySelector('#sc-input-name').focus();
    }

    _hideForm() {
        this._el.querySelector('#sc-form').classList.add('hidden');
        this._el.querySelector('#sc-body').classList.remove('hidden');
        this._editingId = null;
    }

    _submitForm() {
        const name = this._el.querySelector('#sc-input-name').value.trim();
        const url = this._el.querySelector('#sc-input-url').value.trim();
        const platform = this._el.querySelector('#sc-input-platform').value;
        const sections = parseInt(this._el.querySelector('#sc-input-sections').value) || 0;

        if (!name) {
            this._el.querySelector('#sc-input-name').focus();
            return;
        }

        if (this._editingId) {
            this.updateCourse(this._editingId, { name, url, platform, totalSections: sections });
        } else {
            this.addCourse({ name, url, platform, totalSections: sections });
        }
        this._hideForm();
    }

    _autofillFromUrl() {
        const url = this._el.querySelector('#sc-input-url').value.trim();
        if (!url) return;
        try {
            const u = new URL(url);
            const host = u.hostname;
            const platformSelect = this._el.querySelector('#sc-input-platform');
            if (host.includes('mashibing.com')) platformSelect.value = 'mashibing';
            else if (host.includes('bilibili.com')) platformSelect.value = 'bilibili';
            else if (host.includes('imooc.com')) platformSelect.value = 'imooc';
            else if (host.includes('juejin.cn')) platformSelect.value = 'juejin';
            else platformSelect.value = 'other';
        } catch {}
    }

    _openCourse(id) {
        const course = this._courses.find(c => c.id === id);
        if (!course?.url) return;
        course.lastStudyTime = Date.now();
        this._saveCourses();
        chrome.tabs.create({ url: course.url });
    }

    // ===================== Toggle =====================

    toggle() {
        if (this._panelOpen) this.hide(); else this.show();
    }

    show() {
        if (!this._el) return;
        this._el.classList.add('visible');
        this._panelOpen = true;
        this._render();
    }

    hide() {
        if (!this._el) return;
        this._el.classList.remove('visible');
        this._panelOpen = false;
        this._hideForm();
    }
}

window.studyCenter = new StudyCenter();
