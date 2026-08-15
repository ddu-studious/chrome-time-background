/**
 * 任务管理页面
 * 独立页面，用于查看和管理所有任务的详细信息
 */

class TaskManager {
    constructor() {
        // 数据
        this.memos = [];
        this.categories = [];
        this.tags = [];
        this.filteredTasks = [];
        this.selectedIds = new Set();

        // 分页
        this.currentPage = 1;
        this.pageSize = 20;

        // 当前视图
        this.currentView = 'list';
        this.pageBeforeOverlay = 'list';
        this.calendarDate = new Date();
        this._detailReturnFocus = null;
        this._createReturnFocus = null;
        this._categoryManagerReturnFocus = null;
        this._backgroundInertSiblings = [];
        this._editingTaskId = null;
        this._recentlyCompletedIds = new Set();
        this._undoTimer = null;

        // 筛选条件
        this.filters = {
            search: '',
            status: 'all',
            priority: 'all',
            category: 'all',
            sort: 'newest'
        };

        // 优先级配置
        this.priorityConfig = {
            high: { name: '高', color: '#ff4757', icon: 'fas fa-arrow-up' },
            medium: { name: '中', color: '#ffa502', icon: 'fas fa-minus' },
            low: { name: '低', color: '#2ed573', icon: 'fas fa-arrow-down' },
            none: { name: '无', color: '#999', icon: '' }
        };
    }

    async init() {
        await this.loadData();
        this.bindEvents();
        this.populateCategoryFilter();
        this.applyFilters();
        this._setProductPage('list');
        this.render();
    }

    // ===================== 数据加载 =====================

    async loadData() {
        try {
            const [memosResult, categoriesResult, tagsResult] = await Promise.all([
                new Promise((resolve, reject) => chrome.storage.local.get('memos', r => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    resolve(r);
                })),
                new Promise((resolve, reject) => chrome.storage.sync.get('memosCategories', r => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    resolve(r);
                })),
                new Promise((resolve, reject) => chrome.storage.sync.get('memosTags', r => {
                    if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
                    resolve(r);
                }))
            ]);

            const memosData = Array.isArray(memosResult.memos) ? memosResult.memos : [];
            this.categories = Array.isArray(categoriesResult.memosCategories) ? categoriesResult.memosCategories : [];
            this.tags = Array.isArray(tagsResult.memosTags) ? tagsResult.memosTags : [];

            // ⚠️ 重要：添加新字段时必须在此处声明默认值，否则任务管理页数据丢失！
            // 同时需要更新 js/memo.js 中的 normalizeMemo 方法
            this.memos = memosData.map(memo => ({
                id: memo.id || '',
                title: memo.title || '',
                text: memo.text || '',
                completed: !!memo.completed,
                createdAt: memo.createdAt || Date.now(),
                updatedAt: memo.updatedAt || Date.now(),
                completedAt: memo.completedAt || null,
                categoryId: memo.categoryId || null,
                tagIds: Array.isArray(memo.tagIds) ? memo.tagIds : [],
                priority: memo.priority || 'none',
                startDate: memo.startDate || null,
                dueDate: memo.dueDate || null,
                images: Array.isArray(memo.images) ? memo.images : [],
                links: Array.isArray(memo.links) ? memo.links : [],
                progress: memo.progress !== undefined && memo.progress !== null ? (
                    typeof memo.progress === 'object' && memo.progress.total
                        ? Math.round((memo.progress.current / memo.progress.total) * 100)
                        : Math.max(0, Math.min(100, parseInt(memo.progress) || 0))
                ) : null,
                recurrence: memo.recurrence || null,
                habit: memo.habit || null,
                habitCard: memo.habitCard || null,
                subtasks: Array.isArray(memo.subtasks) ? memo.subtasks : [],
                status: memo.status || null,
                failedAt: memo.failedAt || null,
                archived: !!memo.archived,
                archivedAt: memo.archivedAt || null,
                recurrencePaused: !!memo.recurrencePaused,
                lastSkippedAt: memo.lastSkippedAt || null,
                assignee: memo.assignee || '我',
            }));

            console.log(`加载了 ${this.memos.length} 个任务`);
        } catch (error) {
            console.error('加载数据失败:', error);
            if (!this.memos || this.memos.length === 0) {
                this.memos = [];
            }
        }
    }

    // ===================== 事件绑定 =====================

    bindEvents() {
        document.getElementById('task-create-btn')?.addEventListener('click', () => this.openCreateTask());
        document.getElementById('task-empty-create')?.addEventListener('click', () => this.openCreateTask());
        document.getElementById('task-empty-clear')?.addEventListener('click', () => this.clearAllFilters());
        document.getElementById('task-empty-archived')?.addEventListener('click', () => {
            this.filters.status = 'archived';
            document.getElementById('filter-status').value = 'archived';
            this.applyFilters();
            this.render();
        });

        // 搜索
        const searchInput = document.getElementById('search-input');
        const searchClear = document.getElementById('search-clear');
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.filters.search = searchInput.value.trim();
                searchClear.classList.toggle('visible', this.filters.search.length > 0);
                this.currentPage = 1;
                this.applyFilters();
                this.render();
            }, 300);
        });
        searchClear.addEventListener('click', () => {
            searchInput.value = '';
            this.filters.search = '';
            searchClear.classList.remove('visible');
            this.currentPage = 1;
            this.applyFilters();
            this.render();
        });

        // 筛选器
        document.getElementById('filter-status').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
            this.render();
        });
        document.getElementById('filter-priority').addEventListener('change', (e) => {
            this.filters.priority = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
            this.render();
        });
        // 分类筛选由 Combobox onChange 处理，无需单独监听
        document.getElementById('sort-select').addEventListener('change', (e) => {
            this.filters.sort = e.target.value;
            this.applyFilters();
            this.render();
        });

        // 业务视图切换
        document.querySelectorAll('.task-page-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchView(btn.dataset.taskView);
            });
        });

        document.getElementById('calendar-prev')?.addEventListener('click', () => {
            this.calendarDate.setMonth(this.calendarDate.getMonth() - 1);
            this.renderCalendar();
        });
        document.getElementById('calendar-next')?.addEventListener('click', () => {
            this.calendarDate.setMonth(this.calendarDate.getMonth() + 1);
            this.renderCalendar();
        });

        document.getElementById('task-create-close')?.addEventListener('click', () => this.closeCreateTask());
        document.getElementById('task-create-cancel')?.addEventListener('click', () => this.closeCreateTask());
        document.getElementById('task-create-overlay')?.addEventListener('click', () => this.closeCreateTask());
        document.getElementById('task-create-form')?.addEventListener('submit', (event) => this.createTask(event));

        // 全选
        document.getElementById('select-all').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // 批量操作
        document.getElementById('batch-complete').addEventListener('click', () => this.batchComplete());
        document.getElementById('batch-uncomplete').addEventListener('click', () => this.batchUncomplete());
        document.getElementById('batch-archive').addEventListener('click', () => this.batchArchive());
        document.getElementById('batch-delete').addEventListener('click', () => this.batchDelete());
        document.getElementById('batch-cancel').addEventListener('click', () => this.clearSelection());

        // 分页
        document.getElementById('page-prev').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render();
            }
        });
        document.getElementById('page-next').addEventListener('click', () => {
            const totalPages = Math.ceil(this.filteredTasks.length / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render();
            }
        });
        document.getElementById('page-size').addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1;
            this.render();
        });

        // 详情面板关闭
        document.getElementById('detail-close').addEventListener('click', () => this.closeDetail());
        document.getElementById('detail-overlay').addEventListener('click', () => this.closeDetail());

        // 模态弹层键盘闭环
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const surface = this._activeFocusSurface();
                if (surface) this._trapFocus(surface, e);
                return;
            }
            if (e.key === 'Escape') {
                const categoryManager = document.getElementById('task-category-manager');
                if (categoryManager?.classList.contains('active')) {
                    this._closeCategoryManager();
                    return;
                }
                const createSheet = document.getElementById('task-create-sheet');
                if (createSheet && !createSheet.classList.contains('hidden')) {
                    this.closeCreateTask();
                    return;
                }
                this.closeDetail();
            }
        });
    }

    // ===================== 筛选和排序 =====================

    applyFilters() {
        const today = new Date().toISOString().split('T')[0];
        let tasks = [...this.memos];
        if (this.filters.status !== 'archived') tasks = tasks.filter(task => !task.archived);

        // 高级搜索：多关键字 AND + 排除关键字
        if (this.filters.search) {
            const { includeTerms, excludeTerms } = this._parseSearchQuery(this.filters.search);
            tasks = tasks.filter(t => {
                const combined = ((t.title || '') + ' ' + (t.text || '')).toLowerCase();
                if (includeTerms.length > 0 && !includeTerms.every(term => combined.includes(term))) return false;
                if (excludeTerms.length > 0 && excludeTerms.some(term => combined.includes(term))) return false;
                return true;
            });
        }

        // 状态筛选
        switch (this.filters.status) {
            case 'active':
                tasks = tasks.filter(t => (!t.completed && t.status !== 'failed') || this._recentlyCompletedIds.has(t.id));
                break;
            case 'completed':
                tasks = tasks.filter(t => t.completed);
                break;
            case 'failed':
                tasks = tasks.filter(t => t.status === 'failed');
                break;
            case 'overdue':
                tasks = tasks.filter(t => this.getTaskStatus(t).key === 'overdue');
                break;
            case 'in_progress':
                tasks = tasks.filter(t => this.getTaskStatus(t).key === 'in_progress');
                break;
            case 'not_started':
                tasks = tasks.filter(t => this.getTaskStatus(t).key === 'not_started');
                break;
            case 'waiting':
                tasks = tasks.filter(t => this.getTaskStatus(t).key === 'waiting');
                break;
            case 'archived':
                tasks = tasks.filter(t => t.archived);
                break;
            case 'today':
                tasks = tasks.filter(t => t.dueDate === today);
                break;
        }

        // 优先级筛选
        if (this.filters.priority !== 'all') {
            tasks = tasks.filter(t => t.priority === this.filters.priority);
        }

        // 分类筛选（选择一级分类时包含其所有子分类）
        if (this.filters.category !== 'all') {
            const matchIds = this.getCategoryAndChildIds(this.filters.category);
            tasks = tasks.filter(t => matchIds.includes(t.categoryId));
        }

        this._recentlyCompletedIds.forEach(id => {
            const recent = this.memos.find(task => task.id === id && !task.archived);
            if (recent && !tasks.some(task => task.id === id)) tasks.push(recent);
        });

        // 排序
        tasks = this.sortTasks(tasks);

        this.filteredTasks = tasks;
        this.updateStats();
    }

    sortTasks(tasks) {
        const sortFns = {
            newest: (a, b) => b.createdAt - a.createdAt,
            oldest: (a, b) => a.createdAt - b.createdAt,
            dueDate: (a, b) => {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            },
            priority: (a, b) => {
                const order = { high: 0, medium: 1, low: 2, none: 3 };
                return (order[a.priority] || 3) - (order[b.priority] || 3);
            },
            progress: (a, b) => {
                const pa = a.progress !== null ? a.progress : -1;
                const pb = b.progress !== null ? b.progress : -1;
                return pb - pa;
            }
        };
        return tasks.sort(sortFns[this.filters.sort] || sortFns.newest);
    }

    // ===================== 统计更新 =====================

    updateStats() {
        const all = this.memos.filter(task => !task.archived);
        const inProgress = all.filter(t => this.getTaskStatus(t).key === 'in_progress');
        const done = all.filter(t => t.completed);
        const overdue = all.filter(t => this.getTaskStatus(t).key === 'overdue');
        const failed = all.filter(t => t.status === 'failed');

        document.getElementById('stat-total').textContent = all.length;
        document.getElementById('stat-active').textContent = inProgress.length;
        document.getElementById('stat-done').textContent = done.length;
        document.getElementById('stat-overdue').textContent = overdue.length;
        const failedEl = document.getElementById('stat-failed');
        if (failedEl) failedEl.textContent = failed.length;
    }

    // ===================== 渲染 =====================

    _setProductPage(page) {
        window.ProductUIV5?.setBusinessPage?.('tasks', page);
    }

    switchView(view) {
        const allowed = ['list', 'kanban', 'calendar', 'analytics', 'recurring-habits'];
        if (!allowed.includes(view)) return;
        this.currentView = view;
        this.currentPage = 1;
        document.querySelectorAll('.task-page-tab').forEach(button => {
            const active = button.dataset.taskView === view;
            button.classList.toggle('active', active);
            button.setAttribute('aria-current', active ? 'page' : 'false');
        });
        this._setProductPage(view);
        this.render();
    }

    render() {
        const tableView = document.getElementById('table-view');
        const emptyState = document.getElementById('empty-state');
        const panels = document.querySelectorAll('.task-view-panel');

        // 分页
        const totalPages = Math.max(1, Math.ceil(this.filteredTasks.length / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        const start = (this.currentPage - 1) * this.pageSize;
        const pageData = this.filteredTasks.slice(start, start + this.pageSize);

        panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.taskPanel !== this.currentView));
        if (this.currentView === 'list') {
            tableView?.classList.remove('hidden');
            this.renderTable(pageData);
        } else if (this.currentView === 'kanban') {
            this.renderKanban();
        } else if (this.currentView === 'calendar') {
            this.renderCalendar();
        } else if (this.currentView === 'analytics') {
            this.renderAnalytics();
        } else if (this.currentView === 'recurring-habits') {
            this.renderRecurring();
        }

        // 空状态
        if (this.filteredTasks.length === 0) {
            const searching = !!this.filters.search;
            emptyState.classList.toggle('hidden', !searching && this.currentView !== 'list');
            document.getElementById('empty-state-title').textContent = searching ? '没有找到匹配任务' : '暂无任务';
            document.getElementById('empty-state-copy').textContent = searching
                ? `没有与“${this.filters.search}”匹配的结果，试试减少关键词或清除筛选。`
                : '创建你的第一个任务，开始高效推进工作';
            document.getElementById('empty-state-icon').className = searching ? 'fas fa-search' : 'fas fa-clipboard-list';
            if (searching) {
                panels.forEach(panel => panel.classList.add('hidden'));
                this._setProductPage('search-empty');
            }
        } else {
            emptyState.classList.add('hidden');
            this._setProductPage(this.currentView);
        }
        this.renderEmptyStateContext();

        // 分页
        this.renderPagination(totalPages);
        document.getElementById('pagination')?.classList.toggle('hidden', this.currentView !== 'list' || this.filteredTasks.length === 0);

        // 批量操作栏
        this.updateBatchBar();
    }

    renderKanban() {
        const root = document.getElementById('task-kanban');
        if (!root) return;
        const columns = [
            { key: 'not_started', title: '待处理', icon: 'far fa-circle', color: '#94a3b8', limit: 8 },
            { key: 'in_progress', title: '进行中', icon: 'fas fa-circle-notch', color: '#a78bfa', limit: 3 },
            { key: 'waiting', title: '等待', icon: 'fas fa-pause-circle', color: '#fbbf24', limit: 5 },
            { key: 'done', title: '已完成', icon: 'fas fa-check-circle', color: '#34d399', limit: null },
        ];
        const grouped = Object.fromEntries(columns.map(column => [column.key, []]));
        this.filteredTasks.forEach(task => {
            const statusKey = this.getTaskStatus(task).key;
            const key = task.completed ? 'done' : (statusKey === 'waiting' ? 'waiting' : (statusKey === 'in_progress' ? 'in_progress' : 'not_started'));
            (grouped[key] || grouped.not_started).push(task);
        });
        root.innerHTML = columns.map(column => `
            <section class="kanban-column${column.limit && grouped[column.key].length > column.limit ? ' over-limit' : ''}" data-status="${column.key}" aria-label="${column.title}，${grouped[column.key].length} 项${column.limit ? `，上限 ${column.limit} 项` : ''}">
                <header><span><i class="${column.icon}" style="color:${column.color}"></i>${column.title}</span><strong title="${column.limit ? `工作项上限 ${column.limit}` : '不限数量'}">${grouped[column.key].length}${column.limit ? `/${column.limit}` : ''}</strong></header>
                <div class="kanban-stack">
                    ${grouped[column.key].map(task => this.createKanbanCard(task)).join('') || '<div class="kanban-empty">暂无任务</div>'}
                </div>
            </section>
        `).join('');
        root.querySelectorAll('[data-kanban-detail]').forEach(button => {
            button.addEventListener('click', () => this.openDetail(button.dataset.kanbanDetail));
        });
        root.querySelectorAll('[data-kanban-move]').forEach(select => select.addEventListener('change', () => this.moveTaskToStatus(select.dataset.kanbanMove, select.value)));
        root.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('dragstart', event => event.dataTransfer?.setData('text/task-id', card.dataset.taskId));
        });
        root.querySelectorAll('.kanban-stack').forEach(stack => {
            stack.addEventListener('dragover', event => event.preventDefault());
            stack.addEventListener('drop', event => {
                event.preventDefault();
                const taskId = event.dataTransfer?.getData('text/task-id');
                if (taskId) this.moveTaskToStatus(taskId, stack.closest('.kanban-column')?.dataset.status);
            });
        });
    }

    createKanbanCard(task) {
        const progress = task.progress == null ? (task.completed ? 100 : 0) : task.progress;
        const status = task.completed ? 'done' : (this.getTaskStatus(task).key === 'waiting' ? 'waiting' : (this.getTaskStatus(task).key === 'in_progress' ? 'in_progress' : 'not_started'));
        return `<article class="kanban-card${task.completed ? ' is-done' : ''}" data-task-id="${task.id}" draggable="true">
            <div class="kanban-card-top">${this.renderPriorityBadge(task.priority)}<span>${task.dueDate ? this.escapeHtml(task.dueDate.slice(5)) : '无期限'}</span></div>
            <button type="button" class="kanban-card-title" data-kanban-detail="${task.id}" aria-label="查看任务详情：${this.escapeHtml(task.title || '无标题')}"><h3>${this.escapeHtml(task.title || '无标题')}</h3></button>
            ${task.text ? `<p>${this.escapeHtml(task.text.slice(0, 88))}</p>` : ''}
            <div class="kanban-progress"><span style="width:${Math.max(0, Math.min(100, progress))}%"></span></div>
            <footer><span>${this.escapeHtml(task.categoryId ? this.getCategoryName(task.categoryId) : '未分类')}</span><strong>${progress}%</strong></footer>
            <label class="kanban-move"><span>移动到</span><select data-kanban-move="${task.id}" aria-label="移动任务：${this.escapeHtml(task.title || '无标题')}">${[['not_started','待处理'],['in_progress','进行中'],['waiting','等待'],['done','已完成']].map(([key,label]) => `<option value="${key}" ${status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        </article>`;
    }

    renderCalendar() {
        const root = document.getElementById('task-calendar');
        if (!root) return;
        const unscheduled = this.filteredTasks.filter(task => !task.dueDate);
        const unscheduledRoot = document.getElementById('calendar-unscheduled');
        if (unscheduledRoot) {
            unscheduledRoot.innerHTML = `<span><i class="far fa-calendar-xmark"></i> 未安排日期</span><div>${unscheduled.slice(0, 6).map(task => `<button type="button" data-task-id="${task.id}">${this.escapeHtml(task.title || '无标题')}</button>`).join('') || '<small>当前没有无日期任务</small>'}${unscheduled.length > 6 ? `<small>+${unscheduled.length - 6} 项</small>` : ''}</div><button type="button" id="calendar-schedule-first" ${unscheduled.length ? '' : 'disabled'}>安排日期</button>`;
            unscheduledRoot.querySelectorAll('[data-task-id]').forEach(button => button.addEventListener('click', () => this.openDetail(button.dataset.taskId)));
            unscheduledRoot.querySelector('#calendar-schedule-first')?.addEventListener('click', () => this.openEditTask(unscheduled[0]?.id));
        }
        const year = this.calendarDate.getFullYear();
        const month = this.calendarDate.getMonth();
        const monthStart = new Date(year, month, 1);
        const mondayOffset = (monthStart.getDay() + 6) % 7;
        const gridStart = new Date(year, month, 1 - mondayOffset);
        const todayKey = this._dateKey(new Date());
        document.getElementById('calendar-title').textContent = `${year}年 ${month + 1}月`;
        const names = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        let html = names.map(name => `<div class="calendar-weekday">${name}</div>`).join('');
        for (let index = 0; index < 42; index++) {
            const date = new Date(gridStart);
            date.setDate(gridStart.getDate() + index);
            const key = this._dateKey(date);
            const tasks = this.filteredTasks.filter(task => task.dueDate === key);
            const load = tasks.length >= 4 ? 'high' : (tasks.length >= 2 ? 'medium' : (tasks.length ? 'low' : 'empty'));
            html += `<div class="calendar-day load-${load}${date.getMonth() !== month ? ' outside' : ''}${key === todayKey ? ' today' : ''}" aria-label="${key}，${tasks.length} 项任务，负载${load === 'high' ? '高' : (load === 'medium' ? '中' : (load === 'low' ? '低' : '空'))}">
                <span class="calendar-day-number">${date.getDate()}</span>
                <div class="calendar-day-tasks">${tasks.slice(0, 3).map(task => `<button type="button" data-task-id="${task.id}" class="calendar-task${task.completed ? ' done' : ''}">${this.escapeHtml(task.title || '无标题')}</button>`).join('')}${tasks.length > 3 ? `<small>+${tasks.length - 3} 项</small>` : ''}</div>
            </div>`;
        }
        root.innerHTML = html;
        root.querySelectorAll('[data-task-id]').forEach(button => button.addEventListener('click', () => this.openDetail(button.dataset.taskId)));
    }

    renderAnalytics() {
        const root = document.getElementById('task-analytics');
        if (!root) return;
        const analyticsTasks = this.memos.filter(task => !task.archived);
        const total = analyticsTasks.length;
        const done = analyticsTasks.filter(task => task.completed).length;
        const active = analyticsTasks.filter(task => !task.completed && this.getTaskStatus(task).key === 'in_progress').length;
        const overdue = analyticsTasks.filter(task => !task.completed && this.getTaskStatus(task).key === 'overdue').length;
        const completion = total ? Math.round(done / total * 100) : 0;
        const completedWithDue = analyticsTasks.filter(task => task.completed && task.dueDate && task.completedAt);
        const onTime = completedWithDue.filter(task => this._dateKey(new Date(task.completedAt)) <= task.dueDate).length;
        const onTimeRate = completedWithDue.length ? Math.round(onTime / completedWithDue.length * 100) : 0;
        const priorities = ['high', 'medium', 'low', 'none'].map(key => ({ key, count: analyticsTasks.filter(task => task.priority === key).length }));
        const maxPriority = Math.max(1, ...priorities.map(item => item.count));
        const recentDays = Array.from({ length: 7 }, (_, reverseIndex) => {
            const date = new Date();
            date.setDate(date.getDate() - (6 - reverseIndex));
            const key = this._dateKey(date);
            return {
                label: `${date.getMonth() + 1}/${date.getDate()}`,
                count: analyticsTasks.filter(task => task.completedAt && this._dateKey(new Date(task.completedAt)) === key).length,
            };
        });
        const maxDaily = Math.max(1, ...recentDays.map(item => item.count));
        const categoryEffort = this.categories.map(category => ({
            name: category.name,
            count: analyticsTasks.filter(task => task.categoryId === category.id).length,
        })).filter(item => item.count).sort((a, b) => b.count - a.count).slice(0, 5);
        const overdueReasons = [
            { label: '等待外部输入', count: analyticsTasks.filter(task => this.getTaskStatus(task).key === 'waiting').length },
            { label: '截止日已过', count: overdue },
            { label: '没有拆分子任务', count: analyticsTasks.filter(task => !task.completed && !(task.subtasks || []).length).length },
        ];
        root.innerHTML = `<div class="analytics-summary">
            <article><span>全部任务</span><strong>${total}</strong><small>当前工作区</small></article>
            <article><span>完成率</span><strong>${completion}%</strong><small>${done} 项已完成</small></article>
            <article><span>进行中</span><strong>${active}</strong><small>正在推进</small></article>
            <article><span>已逾期</span><strong>${overdue}</strong><small>需要重新规划</small></article>
            <article><span>准时率</span><strong>${onTimeRate}%</strong><small>${onTime}/${completedWithDue.length} 项按时完成</small></article>
        </div>
        <div class="analytics-grid">
            <section class="analytics-card"><header><div><span>最近 7 天</span><h2>完成趋势</h2></div><strong>${recentDays.reduce((sum, item) => sum + item.count, 0)} 项</strong></header>
                <div class="analytics-bars">${recentDays.map(item => `<div><span style="height:${item.count ? Math.max(8, item.count / maxDaily * 100) : 0}%"></span><small>${item.label}</small></div>`).join('')}</div>
            </section>
            <section class="analytics-card"><header><div><span>任务结构</span><h2>优先级分布</h2></div></header>
                <div class="priority-distribution">${priorities.map(item => `<div><span>${this.priorityConfig[item.key].name}</span><div><i class="${item.key}" style="width:${item.count / maxPriority * 100}%"></i></div><strong>${item.count}</strong></div>`).join('')}</div>
            </section>
            <section class="analytics-card analytics-compact"><header><div><span>项目投入</span><h2>分类任务量</h2></div></header><div class="analytics-ranked">${categoryEffort.map((item,index) => `<div><b>${index + 1}</b><span>${this.escapeHtml(item.name)}</span><strong>${item.count} 项</strong></div>`).join('') || '<p>还没有分类投入数据</p>'}</div></section>
            <section class="analytics-card analytics-compact"><header><div><span>复盘提示</span><h2>逾期与阻塞原因</h2></div><button type="button" id="analytics-review">查看复盘</button></header><div class="analytics-ranked">${overdueReasons.map((item,index) => `<div><b>${index + 1}</b><span>${item.label}</span><strong>${item.count} 项</strong></div>`).join('')}</div></section>
        </div>`;
        root.querySelector('#analytics-review')?.addEventListener('click', () => {
            this.filters.status = overdue ? 'overdue' : 'waiting';
            document.getElementById('filter-status').value = this.filters.status;
            this.applyFilters();
            this.switchView('list');
        });
    }

    renderRecurring() {
        const root = document.getElementById('task-recurring');
        if (!root) return;
        const recurring = this.filteredTasks.filter(task => task.recurrence || task.habit || task.habitCard);
        const done = recurring.filter(task => task.completed).length;
        root.innerHTML = `<div class="recurring-hero"><div><span>ROUTINES</span><h2>周期任务与习惯</h2><p>让重复行动拥有清晰节奏，也保留每次完成的反馈。</p></div><div class="recurring-ring" style="--rate:${recurring.length ? Math.round(done / recurring.length * 100) : 0}"><strong>${done}/${recurring.length}</strong><span>本轮完成</span></div></div>
        <div class="recurring-list">${recurring.map(task => `<article class="recurring-card${task.recurrencePaused ? ' paused' : ''}" data-task-id="${task.id}">
            <button type="button" class="recurring-check${task.completed ? ' checked' : ''}" data-toggle-id="${task.id}" aria-label="${task.completed ? '取消完成' : '标记完成'}"><i class="fas fa-check"></i></button>
            <button type="button" class="recurring-main" data-recurring-detail="${task.id}" aria-label="查看周期任务：${this.escapeHtml(task.title || '无标题')}"><span>${this.escapeHtml(this._recurrenceLabel(task.recurrence || task.habit || task.habitCard))} · 连续 ${Number(task.habit?.streak) || 0} 次</span><h3>${this.escapeHtml(task.title || '无标题')}</h3><p>${task.text ? this.escapeHtml(task.text.slice(0, 100)) : '持续记录，建立稳定节奏'}</p><small>下次实例：${task.recurrencePaused ? '已暂停' : this._nextRecurrenceText(task)}</small></button>
            <aside><strong>${task.progress == null ? (task.completed ? 100 : 0) : task.progress}%</strong><span>当前进度</span><div><button type="button" data-recurring-pause="${task.id}">${task.recurrencePaused ? '继续' : '暂停'}</button><button type="button" data-recurring-skip="${task.id}">跳过本次</button></div></aside>
        </article>`).join('') || '<div class="recurring-empty"><i class="fas fa-repeat"></i><h3>还没有周期任务</h3><p>新建任务时选择“每天、工作日、每周或每月”。</p><button type="button" id="recurring-create">创建第一个周期任务</button></div>'}</div>`;
        root.querySelectorAll('[data-recurring-detail]').forEach(button => button.addEventListener('click', () => this.openDetail(button.dataset.recurringDetail)));
        root.querySelectorAll('[data-toggle-id]').forEach(button => button.addEventListener('click', event => {
            event.stopPropagation();
            this.toggleTaskStatus(button.dataset.toggleId);
        }));
        root.querySelectorAll('[data-recurring-pause]').forEach(button => button.addEventListener('click', () => this.toggleRecurringPause(button.dataset.recurringPause)));
        root.querySelectorAll('[data-recurring-skip]').forEach(button => button.addEventListener('click', () => this.skipRecurringOccurrence(button.dataset.recurringSkip)));
        root.querySelector('#recurring-create')?.addEventListener('click', () => this.openCreateTask(true));
    }

    _dateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    _recurrenceLabel(value) {
        const raw = typeof value === 'string' ? value : (value?.type || value?.frequency || 'habit');
        return ({ daily: '每天', weekdays: '工作日', weekly: '每周', monthly: '每月', habit: '习惯' })[raw] || '自定义周期';
    }

    _nextRecurrenceText(task) {
        const next = new Date();
        const raw = typeof task.recurrence === 'string' ? task.recurrence : task.recurrence?.type;
        if (raw === 'monthly') next.setMonth(next.getMonth() + 1);
        else if (raw === 'weekly') next.setDate(next.getDate() + 7);
        else next.setDate(next.getDate() + 1);
        return `${next.getMonth() + 1}月${next.getDate()}日`;
    }

    renderTable(tasks) {
        const tbody = document.getElementById('task-table-body');
        const today = this._dateKey(new Date());
        const soonDate = new Date();
        soonDate.setDate(soonDate.getDate() + 7);
        const soon = this._dateKey(soonDate);
        const groups = [
            { label: '今天', test: task => !task.completed && task.dueDate === today },
            { label: '已逾期', test: task => !task.completed && task.dueDate && task.dueDate < today },
            { label: '即将到期', test: task => !task.completed && task.dueDate && task.dueDate > today && task.dueDate <= soon },
            { label: '以后与无日期', test: task => !task.completed && (!task.dueDate || task.dueDate > soon) },
            { label: '已完成', test: task => task.completed },
        ];
        const renderedIds = new Set();
        tbody.innerHTML = groups.map(group => {
            const items = tasks.filter(task => !renderedIds.has(task.id) && group.test(task));
            items.forEach(task => renderedIds.add(task.id));
            return items.length ? `<tr class="task-group-row"><td colspan="9"><span>${group.label}</span><strong>${items.length}</strong></td></tr>${items.map(task => this.createTableRow(task)).join('')}` : '';
        }).join('');

        // 绑定行事件
        tbody.querySelectorAll('tr[data-task-id]').forEach(row => {
            const taskId = row.dataset.taskId;

            // 复选框
            const checkbox = row.querySelector('.row-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    e.stopPropagation();
                    this.toggleSelect(taskId, checkbox.checked);
                    row.classList.toggle('selected', checkbox.checked);
                });
            }

            // 状态切换（失败状态下点击 status-icon 为重新激活）
            const statusIcon = row.querySelector('.status-icon');
            if (statusIcon) {
                statusIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (statusIcon.classList.contains('failed')) {
                        this.reactivateTask(taskId);
                    } else {
                        this.toggleTaskStatus(taskId);
                    }
                });
            }

            // 标记为失败
            const failBtn = row.querySelector('.btn-fail');
            if (failBtn) {
                failBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.markTaskFailed(taskId);
                });
            }

            // 重新激活
            const reactivateBtn = row.querySelector('.btn-reactivate');
            if (reactivateBtn) {
                reactivateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.reactivateTask(taskId);
                });
            }

            // 点击行查看详情
            row.addEventListener('click', (e) => {
                if (e.target.closest('.row-checkbox') || e.target.closest('.status-icon') || e.target.closest('.action-btn-sm')) return;
                this.openDetail(taskId);
            });

            // 查看详情按钮
            const detailBtn = row.querySelector('.btn-detail');
            if (detailBtn) {
                detailBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openDetail(taskId);
                });
            }

            // 删除按钮
            const archiveBtn = row.querySelector('.btn-archive');
            if (archiveBtn) {
                archiveBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.archiveTask(taskId);
                });
            }
            const deleteBtn = row.querySelector('.btn-delete');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteTask(taskId);
                });
            }
        });
    }

    createTableRow(task) {
        const isSelected = this.selectedIds.has(task.id);
        const isFailed = task.status === 'failed';
        const completedClass = task.completed ? 'completed-row' : '';
        const failedClass = isFailed ? 'failed-row' : '';
        const selectedClass = isSelected ? 'selected' : '';

        return `
            <tr data-task-id="${task.id}" class="${completedClass} ${failedClass} ${selectedClass}">
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="col-status">
                    ${isFailed
                        ? `<button type="button" class="status-icon failed" title="已失败 — 点击重新激活" aria-label="重新激活任务：${this.escapeHtml(task.title || '无标题')}"><i class="fas fa-times-circle"></i></button>`
                        : `<button type="button" class="status-icon ${task.completed ? 'completed' : 'active'}" title="${task.completed ? '标记为未完成' : '标记为已完成'}" aria-label="${task.completed ? '标记为未完成' : '标记为已完成'}：${this.escapeHtml(task.title || '无标题')}">
                            <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
                        </button>`
                    }
                </td>
                <td class="col-priority">
                    ${this.renderPriorityBadge(task.priority)}
                </td>
                <td class="col-title">
                    <div class="title-cell">
                        <span class="task-title-text">${this.escapeHtml(task.title || '无标题')}</span>
                        <span class="task-assignee"><i class="far fa-user"></i> ${this.escapeHtml(task.assignee || '我')}</span>
                        ${task.text ? `<span class="task-desc-preview">${this.escapeHtml(task.text.substring(0, 80))}</span>` : ''}
                    </div>
                </td>
                <td class="col-category">
                    ${task.categoryId ? `<span class="category-tag"><i class="fas fa-folder"></i> ${this.escapeHtml(this.getCategoryName(task.categoryId))}</span>` : '<span class="text-muted">—</span>'}
                </td>
                <td class="col-progress">
                    ${this.renderProgressBar(task.progress)}
                </td>
                <td class="col-due">
                    ${this.renderDateRange(task)}
                </td>
                <td class="col-created">
                    <span class="date-text">${this.formatDate(task.createdAt)}</span>
                </td>
                <td class="col-actions">
                    <div class="action-btns">
                        ${isFailed
                            ? `<button type="button" class="action-btn-sm btn-reactivate" title="重新激活" aria-label="重新激活任务：${this.escapeHtml(task.title || '无标题')}"><i class="fas fa-redo"></i></button>`
                            : `<button type="button" class="action-btn-sm btn-fail" title="标记为失败" aria-label="标记任务为失败：${this.escapeHtml(task.title || '无标题')}"><i class="fas fa-times-circle"></i></button>`
                        }
                        <button type="button" class="action-btn-sm btn-detail" title="查看详情" aria-label="查看任务详情：${this.escapeHtml(task.title || '无标题')}">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button type="button" class="action-btn-sm btn-archive" title="${task.archived ? '取消归档' : '归档'}" aria-label="${task.archived ? '取消归档' : '归档'}任务：${this.escapeHtml(task.title || '无标题')}">
                            <i class="fas ${task.archived ? 'fa-box-open' : 'fa-box-archive'}"></i>
                        </button>
                        <button type="button" class="action-btn-sm danger btn-delete" title="删除" aria-label="删除任务：${this.escapeHtml(task.title || '无标题')}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    renderCards(tasks) {
        const grid = document.getElementById('card-grid');
        grid.innerHTML = tasks.map(task => this.createCard(task)).join('');

        // 绑定卡片事件
        grid.querySelectorAll('.task-card').forEach(card => {
            const taskId = card.dataset.taskId;
            card.addEventListener('click', () => this.openDetail(taskId));
            
            // 绑定图片 error 回退（避免 CSP 限制内联 onerror）
            card.querySelectorAll('.card-image-thumb').forEach(img => {
                img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
            });
        });
    }

    createCard(task) {
        const isFailed = task.status === 'failed';
        return `
            <div class="task-card ${task.completed ? 'completed' : ''} ${isFailed ? 'failed' : ''}" data-task-id="${task.id}">
                <div class="card-top">
                    <div class="card-title">${this.escapeHtml(task.title || '无标题')}</div>
                    ${this.renderPriorityBadge(task.priority)}
                </div>
                ${task.text ? `<div class="card-desc">${this.escapeHtml(task.text)}</div>` : ''}
                ${task.progress !== null ? `<div class="card-progress">${this.renderProgressBar(task.progress)}</div>` : ''}
                ${task.images && task.images.length > 0 ? `
                    <div class="card-images">
                        ${task.images.slice(0, 15).map(img => `<img class="card-image-thumb" src="${this.getImageThumbnail(img)}" alt="图片">`).join('')}
                        ${task.images.length > 15 ? `<span class="category-tag">+${task.images.length - 15}</span>` : ''}
                    </div>
                ` : ''}
                <div class="card-meta">
                    <div class="card-tags">
                        ${task.categoryId ? `<span class="category-tag"><i class="fas fa-folder"></i> ${this.escapeHtml(this.getCategoryName(task.categoryId))}</span>` : ''}
                        ${(() => { const s = this.getTaskStatus(task); return `<span class="category-tag" style="color:${s.color}"><i class="${s.icon}"></i> ${s.label}</span>`; })()}
                    </div>
                    <span class="card-date">
                        ${task.startDate && task.dueDate ? `${task.startDate.substring(5)} → ${task.dueDate.substring(5)}` : task.dueDate ? `截止: ${task.dueDate}` : this.formatDate(task.createdAt)}
                    </span>
                </div>
            </div>
        `;
    }

    // ===================== 渲染辅助 =====================

    renderPriorityBadge(priority) {
        const config = this.priorityConfig[priority] || this.priorityConfig.none;
        if (priority === 'none') return '<span class="priority-badge none">—</span>';
        return `<span class="priority-badge ${priority}">${config.icon ? `<i class="${config.icon}"></i>` : ''} ${config.name}</span>`;
    }

    renderProgressBar(progress) {
        if (progress === null || progress === undefined) {
            return '<span class="date-text" style="color: var(--text-muted);">—</span>';
        }
        const percentage = parseInt(progress) || 0;
        let cls = 'low';
        if (percentage === 100) cls = 'complete';
        else if (percentage >= 60) cls = 'high';
        else if (percentage >= 30) cls = 'medium';

        return `
            <div class="progress-cell">
                <div class="progress-bar">
                    <div class="progress-fill ${cls}" style="width: ${percentage}%"></div>
                </div>
                <span class="progress-text">${percentage}%</span>
            </div>
        `;
    }

    renderDateRange(task) {
        if (!task.startDate && !task.dueDate) return '<span class="date-text" style="color: var(--text-muted);">—</span>';
        const today = new Date().toISOString().split('T')[0];
        let html = '';
        if (task.startDate && task.dueDate) {
            const overdue = !task.completed && task.dueDate < today;
            html = `<span class="date-text ${overdue ? 'overdue' : ''}">${task.startDate.substring(5)} → ${task.dueDate.substring(5)}${overdue ? ' ⚠' : ''}</span>`;
        } else if (task.dueDate) {
            html = this.renderDueDate(task.dueDate, task.completed);
        } else {
            html = `<span class="date-text" style="color:var(--text-secondary);">起 ${task.startDate.substring(5)}</span>`;
        }
        return html;
    }

    renderDueDate(dueDate, completed) {
        if (!dueDate) return '<span class="date-text" style="color: var(--text-muted);">—</span>';
        const today = new Date().toISOString().split('T')[0];
        let cls = '';
        let suffix = '';
        if (!completed && dueDate < today) {
            cls = 'overdue';
            suffix = ' ⚠';
        } else if (dueDate === today) {
            cls = 'today';
            suffix = ' 今天';
        }
        return `<span class="date-text ${cls}">${dueDate}${suffix}</span>`;
    }

    renderPagination(totalPages) {
        document.getElementById('page-info').textContent = `第 ${this.currentPage} 页 / 共 ${totalPages} 页 (${this.filteredTasks.length} 条)`;
        document.getElementById('page-prev').disabled = this.currentPage <= 1;
        document.getElementById('page-next').disabled = this.currentPage >= totalPages;
    }

    // ===================== 详情面板 =====================

    openDetail(taskId) {
        const task = this.memos.find(t => t.id === taskId);
        if (!task) return;

        this.pageBeforeOverlay = this.currentView;
        this._setProductPage('detail');

        const panel = document.getElementById('detail-panel');
        const overlay = document.getElementById('detail-overlay');
        const body = document.getElementById('detail-body');
        if (panel.classList.contains('hidden')) this._detailReturnFocus = document.activeElement;

        body.innerHTML = this.createDetailContent(task);
        
        this.renderMermaid(body.querySelector('.detail-text'));
        
        // 绑定详情面板内的事件（避免内联事件违反 CSP）
        body.querySelectorAll('.detail-image').forEach(img => {
            const fullUrl = img.dataset.fullUrl;
            if (fullUrl) {
                img.style.cursor = 'pointer';
                img.addEventListener('click', () => window.open(fullUrl, '_blank'));
            }
            img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
        });
        
        this.bindDetailSubtaskEvents(body, task);

        const reactivateBtn = body.querySelector('.detail-reactivate-btn');
        if (reactivateBtn) {
            reactivateBtn.addEventListener('click', () => this.reactivateTask(taskId));
        }
        body.querySelector('[data-detail-edit]')?.addEventListener('click', () => this.openEditTask(taskId));
        body.querySelector('[data-detail-archive]')?.addEventListener('click', () => this.archiveTask(taskId));
        body.querySelector('[data-detail-delete]')?.addEventListener('click', () => this.deleteTask(taskId));
        
        panel.classList.remove('hidden');
        panel.setAttribute('aria-hidden', 'false');
        overlay.classList.remove('hidden');
        document.body.classList.add('task-modal-open');
        this._setBackgroundInert(true, [panel, overlay]);
        requestAnimationFrame(() => document.getElementById('detail-close')?.focus({ preventScroll: true }));
    }

    closeDetail({ restoreFocus = true } = {}) {
        const panel = document.getElementById('detail-panel');
        if (!panel || panel.classList.contains('hidden')) return;
        panel.classList.add('hidden');
        panel.setAttribute('aria-hidden', 'true');
        document.getElementById('detail-overlay').classList.add('hidden');
        document.body.classList.remove('task-modal-open');
        this._setBackgroundInert(false);
        this._setProductPage(this.filters.search && this.filteredTasks.length === 0 ? 'search-empty' : this.pageBeforeOverlay);
        const returnTarget = this._detailReturnFocus;
        this._detailReturnFocus = null;
        if (restoreFocus) requestAnimationFrame(() => {
            if (this._isUsableFocusTarget(returnTarget)) returnTarget.focus({ preventScroll: true });
            else document.querySelector(`.task-page-tab[data-task-view="${this.currentView}"]`)?.focus({ preventScroll: true });
        });
    }

    openCreateTask(recurring = false) {
        const returnTarget = document.activeElement;
        this.closeDetail({ restoreFocus: false });
        this._createReturnFocus = returnTarget;
        this.pageBeforeOverlay = this.currentView;
        const sheet = document.getElementById('task-create-sheet');
        const overlay = document.getElementById('task-create-overlay');
        const form = document.getElementById('task-create-form');
        this._editingTaskId = null;
        form?.reset();
        document.getElementById('task-create-title').textContent = '新建任务';
        document.getElementById('task-create-submit').innerHTML = '<i class="fas fa-plus"></i> 创建任务';
        const today = this._dateKey(new Date());
        const due = new Date();
        due.setDate(due.getDate() + 1);
        document.getElementById('task-create-start').value = today;
        document.getElementById('task-create-due').value = this._dateKey(due);
        document.getElementById('task-create-priority').value = 'medium';
        document.getElementById('task-create-recurrence').value = recurring ? 'daily' : '';
        document.getElementById('task-create-assignee').value = '我';
        document.getElementById('task-create-error')?.classList.add('hidden');
        sheet?.classList.remove('hidden');
        sheet?.setAttribute('aria-hidden', 'false');
        overlay?.classList.remove('hidden');
        document.body.classList.add('task-modal-open');
        this._setBackgroundInert(true, [sheet, overlay]);
        this._setProductPage('create');
        setTimeout(() => document.getElementById('task-create-name')?.focus(), 40);
    }

    openEditTask(taskId) {
        const task = this.memos.find(item => item.id === taskId);
        if (!task) return;
        const returnTarget = document.activeElement;
        this.closeDetail({ restoreFocus: false });
        this._createReturnFocus = returnTarget;
        this.pageBeforeOverlay = this.currentView;
        this._editingTaskId = taskId;
        document.getElementById('task-create-form')?.reset();
        document.getElementById('task-create-title').textContent = '编辑任务';
        document.getElementById('task-create-submit').innerHTML = '<i class="fas fa-save"></i> 保存修改';
        document.getElementById('task-create-name').value = task.title || '';
        document.getElementById('task-create-description').value = task.text || '';
        document.getElementById('task-create-start').value = task.startDate || '';
        document.getElementById('task-create-due').value = task.dueDate || '';
        document.getElementById('task-create-priority').value = task.priority || 'medium';
        document.getElementById('task-create-recurrence').value = task.recurrence || '';
        document.getElementById('task-create-assignee').value = task.assignee || '我';
        document.getElementById('task-create-progress').value = task.progress ?? 0;
        document.getElementById('task-create-subtask').value = '';
        const sheet = document.getElementById('task-create-sheet');
        const overlay = document.getElementById('task-create-overlay');
        sheet.classList.remove('hidden');
        sheet.setAttribute('aria-hidden', 'false');
        overlay.classList.remove('hidden');
        document.body.classList.add('task-modal-open');
        this._setBackgroundInert(true, [sheet, overlay]);
        this._setProductPage('create');
        requestAnimationFrame(() => document.getElementById('task-create-name')?.focus({ preventScroll: true }));
    }

    closeCreateTask() {
        const sheet = document.getElementById('task-create-sheet');
        if (!sheet || sheet.classList.contains('hidden')) return;
        sheet.classList.add('hidden');
        sheet.setAttribute('aria-hidden', 'true');
        document.getElementById('task-create-overlay')?.classList.add('hidden');
        document.body.classList.remove('task-modal-open');
        this._setBackgroundInert(false);
        this._setProductPage(this.filters.search && this.filteredTasks.length === 0 ? 'search-empty' : this.pageBeforeOverlay);
        const returnTarget = this._createReturnFocus;
        this._createReturnFocus = null;
        requestAnimationFrame(() => {
            if (this._isUsableFocusTarget(returnTarget)) returnTarget.focus({ preventScroll: true });
            else document.getElementById('task-create-btn')?.focus({ preventScroll: true });
        });
    }

    _setBackgroundInert(active, allowed = []) {
        if (active) {
            if (this._backgroundInertSiblings.length) return;
            const allowedElements = new Set(allowed.filter(Boolean));
            this._backgroundInertSiblings = [...document.body.children]
                .filter(child => !allowedElements.has(child) && !child.inert);
            this._backgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        this._backgroundInertSiblings.forEach(child => { child.inert = false; });
        this._backgroundInertSiblings = [];
    }

    _activeFocusSurface() {
        const categoryManager = document.getElementById('task-category-manager');
        if (categoryManager?.classList.contains('active')) return categoryManager.querySelector('.task-catmgr-panel');
        const createSheet = document.getElementById('task-create-sheet');
        if (createSheet && !createSheet.classList.contains('hidden')) return createSheet;
        const detailPanel = document.getElementById('detail-panel');
        return detailPanel && !detailPanel.classList.contains('hidden') ? detailPanel : null;
    }

    _trapFocus(container, event) {
        const focusable = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            .filter(element => this._isUsableFocusTarget(element));
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

    _isUsableFocusTarget(element) {
        return !!(element?.isConnected && !element.closest('.hidden') && element.getAttribute('aria-hidden') !== 'true');
    }

    async createTask(event) {
        event.preventDefault();
        const title = document.getElementById('task-create-name')?.value.trim();
        if (!title) return;
        const startDate = document.getElementById('task-create-start')?.value || null;
        const dueDate = document.getElementById('task-create-due')?.value || null;
        const recurrence = document.getElementById('task-create-recurrence')?.value || null;
        const progress = Math.max(0, Math.min(100, Number(document.getElementById('task-create-progress')?.value) || 0));
        const firstSubtask = document.getElementById('task-create-subtask')?.value.trim() || '';
        const assignee = document.getElementById('task-create-assignee')?.value.trim() || '我';
        const error = document.getElementById('task-create-error');
        if (startDate && dueDate && startDate > dueDate) {
            error.textContent = '截止日期不能早于开始日期。';
            error.classList.remove('hidden');
            document.getElementById('task-create-due')?.focus();
            return;
        }
        const imageFiles = [...(document.getElementById('task-create-images')?.files || [])];
        if (imageFiles.length > 3 || imageFiles.some(file => file.size > 1024 * 1024)) {
            error.textContent = '附件最多 3 张，且每张不能超过 1MB。';
            error.classList.remove('hidden');
            document.getElementById('task-create-images')?.focus();
            return;
        }
        const newImages = await Promise.all(imageFiles.map(file => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ thumbnail: reader.result, fullImage: reader.result, name: file.name });
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        })));
        const now = Date.now();
        if (this._editingTaskId) {
            const task = this.memos.find(item => item.id === this._editingTaskId);
            if (!task) return;
            Object.assign(task, {
                title,
                text: document.getElementById('task-create-description')?.value.trim() || '',
                updatedAt: now,
                priority: document.getElementById('task-create-priority')?.value || 'medium',
                startDate,
                dueDate,
                progress,
                recurrence,
                habit: recurrence ? { ...(task.habit || {}), type: recurrence, streak: Number(task.habit?.streak) || 0 } : null,
                assignee,
                images: [...(task.images || []), ...newImages],
            });
            if (firstSubtask) task.subtasks.push({ id: `st_${now}`, title: firstSubtask, completed: false });
            const editedId = task.id;
            this._editingTaskId = null;
            await this.saveData();
            this.applyFilters();
            this.closeCreateTask();
            this.render();
            this.openDetail(editedId);
            return;
        }
        const task = {
            id: `memo_${now}_${Math.random().toString(36).slice(2, 8)}`,
            title,
            text: document.getElementById('task-create-description')?.value.trim() || '',
            completed: false,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
            categoryId: null,
            tagIds: [],
            priority: document.getElementById('task-create-priority')?.value || 'medium',
            startDate,
            dueDate,
            images: newImages,
            links: [],
            progress,
            recurrence,
            habit: recurrence ? { type: recurrence, streak: 0 } : null,
            habitCard: null,
            subtasks: firstSubtask ? [{ id: `st_${now}`, title: firstSubtask, completed: false }] : [],
            status: null,
            failedAt: null,
            archived: false,
            archivedAt: null,
            recurrencePaused: false,
            lastSkippedAt: null,
            assignee,
        };
        this.memos.unshift(task);
        await this.saveData();
        this.filters.search = '';
        const search = document.getElementById('search-input');
        if (search) search.value = '';
        document.getElementById('search-clear')?.classList.remove('visible');
        this.applyFilters();
        this.closeCreateTask();
        this.render();
        this.openDetail(task.id);
    }

    bindDetailSubtaskEvents(body, task) {
        const subtasksEl = body.querySelector('.detail-subtasks');
        if (!subtasksEl) return;
        const taskId = task.id;

        subtasksEl.querySelectorAll('.detail-subtask-dot').forEach(dot => {
            dot.addEventListener('click', async () => {
                const sid = dot.dataset.sid;
                const st = (task.subtasks || []).find(s => s.id === sid);
                if (!st) return;
                st.completed = !st.completed;
                task.updatedAt = Date.now();
                if (task.subtasks.length > 0) {
                    task.progress = Math.round(task.subtasks.filter(s => s.completed).length / task.subtasks.length * 100);
                }
                await this.saveData();
                this.openDetail(taskId);
                this.render();
            });
        });

        subtasksEl.querySelectorAll('.detail-subtask-text').forEach(textEl => {
            textEl.addEventListener('click', (e) => {
                e.preventDefault();
                const sid = textEl.dataset.sid;
                const st = (task.subtasks || []).find(s => s.id === sid);
                if (!st) return;
                const original = textEl.textContent;
                textEl.contentEditable = 'true';
                textEl.classList.add('editing');
                textEl.focus();
                const range = document.createRange();
                range.selectNodeContents(textEl);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                const finish = async (save) => {
                    textEl.contentEditable = 'false';
                    textEl.classList.remove('editing');
                    const newTitle = (textEl.textContent || '').trim();
                    if (save && newTitle && newTitle !== original) {
                        st.title = newTitle;
                        task.updatedAt = Date.now();
                        await this.saveData();
                        this.render();
                    } else {
                        textEl.textContent = original;
                    }
                };
                textEl.addEventListener('blur', () => finish(true), { once: true });
                textEl.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Enter') { ke.preventDefault(); textEl.blur(); }
                    else if (ke.key === 'Escape') { ke.preventDefault(); textEl.textContent = original; textEl.blur(); }
                });
            });
        });

        subtasksEl.querySelectorAll('.detail-subtask-copy').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sid = btn.dataset.sid;
                const st = (task.subtasks || []).find(s => s.id === sid);
                if (st) {
                    try { await navigator.clipboard.writeText(st.title || ''); } catch {}
                }
            });
        });

        subtasksEl.querySelectorAll('.detail-subtask-del').forEach(btn => {
            btn.addEventListener('click', async () => {
                const sid = btn.dataset.sid;
                task.subtasks = (task.subtasks || []).filter(s => s.id !== sid);
                task.updatedAt = Date.now();
                task.progress = task.subtasks.length > 0
                    ? Math.round(task.subtasks.filter(s => s.completed).length / task.subtasks.length * 100)
                    : null;
                await this.saveData();
                this.openDetail(taskId);
                this.render();
            });
        });

        const addInput = subtasksEl.querySelector('.detail-subtask-add-input');
        const addBtn = subtasksEl.querySelector('.detail-subtask-add-btn');
        const doAdd = async () => {
            const title = (addInput?.value || '').trim();
            if (!title) return;
            if (!Array.isArray(task.subtasks)) task.subtasks = [];
            task.subtasks.push({
                id: 'st_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                title, completed: false
            });
            task.updatedAt = Date.now();
            task.progress = Math.round(task.subtasks.filter(s => s.completed).length / task.subtasks.length * 100);
            await this.saveData();
            this.openDetail(taskId);
            this.render();
        };
        if (addBtn) addBtn.addEventListener('click', doAdd);
        if (addInput) addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
    }

    createDetailContent(task) {
        const createdDate = new Date(task.createdAt).toLocaleString('zh-CN');
        const updatedDate = new Date(task.updatedAt).toLocaleString('zh-CN');
        const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN') : '—';
        const categoryName = task.categoryId ? this.getCategoryName(task.categoryId) : '无分类';
        const priorityConfig = this.priorityConfig[task.priority] || this.priorityConfig.none;

        // 计算任务存在时长
        const ageMs = Date.now() - task.createdAt;
        const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        const ageText = ageDays === 0 ? '今天创建' : `已创建 ${ageDays} 天`;

        const isFailed = task.status === 'failed';
        const statusIconClass = isFailed ? 'failed' : (task.completed ? 'completed' : 'active');
        const statusIconI = isFailed ? 'fas fa-times-circle' : (task.completed ? 'fas fa-check-circle' : 'far fa-circle');

        return `
            <!-- 标题 -->
            <div class="detail-section">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <span class="status-icon ${statusIconClass}" style="font-size: 1.5rem;">
                        <i class="${statusIconI}"></i>
                    </span>
                    <div class="detail-title">${this.escapeHtml(task.title || '无标题')}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    ${this.renderPriorityBadge(task.priority)}
                    ${(() => { const s = this.getTaskStatus(task); return `<span class="category-tag" style="color:${s.color}"><i class="${s.icon}"></i> ${s.label}</span>`; })()}
                    <span class="category-tag"><i class="fas fa-calendar-alt"></i> ${ageText}</span>
                    ${isFailed ? `<button class="detail-reactivate-btn" data-task-id="${task.id}"><i class="fas fa-redo"></i> 重新激活</button>` : ''}
                </div>
                <div class="detail-primary-actions"><button type="button" class="primary" data-detail-edit="${task.id}"><i class="fas fa-pen"></i> 编辑任务</button><button type="button" data-detail-archive="${task.id}"><i class="fas ${task.archived ? 'fa-box-open' : 'fa-box-archive'}"></i> ${task.archived ? '取消归档' : '归档'}</button><button type="button" class="danger" data-detail-delete="${task.id}"><i class="fas fa-trash"></i> 删除</button></div>
            </div>

            <!-- 进度 -->
            ${task.progress !== null ? `
            <div class="detail-section">
                <div class="detail-section-title">进度</div>
                <div class="detail-progress">
                    <div class="progress-bar">
                        <div class="progress-fill ${this.getProgressClass(task.progress)}" style="width: ${task.progress}%"></div>
                    </div>
                    <div class="progress-label">${task.progress}% 完成</div>
                </div>
            </div>
            ` : ''}

            <!-- 子任务 -->
            <div class="detail-section">
                <div class="detail-section-title">子任务${task.subtasks && task.subtasks.length > 0 ? ` (${task.subtasks.filter(s => s.completed).length}/${task.subtasks.length})` : ''}</div>
                <div class="detail-subtasks" data-task-id="${task.id}">
                    ${task.subtasks && task.subtasks.length > 0 ? `
                    <ul class="detail-subtask-list">
                        ${task.subtasks.map(st => `
                            <li class="detail-subtask-item${st.completed ? ' done' : ''}" data-subtask-id="${st.id}">
                                <div class="detail-subtask-dot" data-sid="${st.id}"><i class="fas fa-check"></i></div>
                                <span class="detail-subtask-text" data-sid="${st.id}">${this.escapeHtml(st.title)}</span>
                                <div class="detail-subtask-actions">
                                    <button type="button" class="detail-subtask-copy" data-sid="${st.id}" title="复制"><i class="fas fa-copy"></i></button>
                                    <button type="button" class="detail-subtask-del" data-sid="${st.id}" title="删除"><i class="fas fa-times"></i></button>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                    ` : ''}
                    <div class="detail-subtask-add">
                        <input type="text" class="detail-subtask-add-input" placeholder="添加子任务..." maxlength="200">
                        <button type="button" class="detail-subtask-add-btn"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
            </div>

            <!-- 内容 -->
            ${task.text ? `
            <div class="detail-section">
                <div class="detail-section-title">内容${this.hasMarkdownSyntax(task.text) ? ' <span style="font-size:11px;color:rgba(100,180,255,0.5);margin-left:4px;"><i class="fab fa-markdown"></i></span>' : ''}</div>
                <div class="detail-text${this.hasMarkdownSyntax(task.text) ? ' memo-md-body' : ''}">${this.hasMarkdownSyntax(task.text) ? this.renderMarkdown(task.text) : this.escapeHtml(task.text)}</div>
            </div>
            ` : ''}

            <!-- 属性信息 -->
            <div class="detail-section">
                <div class="detail-section-title">详细信息</div>
                <div class="detail-meta-grid">
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">分类</span>
                        <span class="detail-meta-value"><i class="fas fa-folder" style="opacity: 0.5;"></i> ${this.escapeHtml(categoryName)}</span>
                    </div>
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">优先级</span>
                        <span class="detail-meta-value" style="color: ${priorityConfig.color};">${priorityConfig.icon ? `<i class="${priorityConfig.icon}"></i> ` : ''}${priorityConfig.name}</span>
                    </div>
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">开始日期</span>
                        <span class="detail-meta-value">${task.startDate || '未设置'}</span>
                    </div>
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">截止日期</span>
                        <span class="detail-meta-value">${task.dueDate || '未设置'}</span>
                    </div>
                    ${task.startDate && task.dueDate && task.startDate <= task.dueDate ? `
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">工期</span>
                        <span class="detail-meta-value">${this.calcDuration(task.startDate, task.dueDate)}</span>
                    </div>` : ''}
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">创建时间</span>
                        <span class="detail-meta-value">${createdDate}</span>
                    </div>
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">更新时间</span>
                        <span class="detail-meta-value">${updatedDate}</span>
                    </div>
                    <div class="detail-meta-item">
                        <span class="detail-meta-label">完成时间</span>
                        <span class="detail-meta-value">${completedDate}</span>
                    </div>
                </div>
            </div>

            <!-- 链接 -->
            ${task.links && task.links.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">相关链接 (${task.links.length})</div>
                <div style="display: flex; flex-direction: column; gap: 6px;">
                    ${task.links.map(link => `
                        <a href="${this.escapeHtml(link.shortUrl || link.url)}" target="_blank" rel="noopener noreferrer" class="detail-link-item" title="${this.escapeHtml(link.url)}${link.shortUrl ? '\n短链: ' + this.escapeHtml(link.shortUrl) : ''}">
                            <i class="fas fa-external-link-alt" style="font-size: 0.7rem; opacity: 0.7;"></i>
                            <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(link.title || link.url)}</span>
                            ${link.shortCode ? `<span style="font-size: 0.65rem; color: #4caf50; opacity: 0.8; margin-left: 4px;" title="TinyURL 短链"><i class="fas fa-compress-alt"></i></span>` : ''}
                        </a>
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- 图片 -->
            ${task.images && task.images.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">图片附件 (${task.images.length})</div>
                <div class="detail-images">
                    ${task.images.map(img => `
                        <img class="detail-image" src="${this.getImageThumbnail(img)}" alt="附件图片" 
                             data-full-url="${this.getImageFullUrl(img)}">
                    `).join('')}
                </div>
            </div>
            ` : ''}

            <!-- 标签 -->
            ${task.tagIds && task.tagIds.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">标签</div>
                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
                    ${task.tagIds.map(tagId => {
                        const tag = this.tags.find(t => t.id === tagId);
                        return tag ? `<span class="category-tag" style="background: ${tag.color}20; color: ${tag.color};">${this.escapeHtml(tag.name)}</span>` : '';
                    }).join('')}
                </div>
            </div>
            ` : ''}

            <div class="detail-section detail-related"><div class="detail-section-title">关联与活动</div><div class="detail-related-grid"><article><i class="far fa-calendar-check"></i><strong>关联计划</strong><span>${task.startDate || task.dueDate ? `${task.startDate || '未设置'} → ${task.dueDate || '未设置'}` : '尚未关联计划'}</span></article><article><i class="fas fa-stopwatch"></i><strong>工作日志</strong><span>通过工作日志任务选择器记录投入</span></article><article><i class="far fa-comments"></i><strong>评论</strong><span>当前没有评论</span></article><article><i class="fas fa-history"></i><strong>最近活动</strong><span>${this.formatDate(task.updatedAt)} 更新</span></article></div></div>

            <!-- 操作 ID -->
            <div class="detail-section" style="opacity: 0.4;">
                <div class="detail-section-title">任务 ID</div>
                <div style="font-size: 0.75rem; font-family: monospace; word-break: break-all;">${task.id}</div>
            </div>
        `;
    }

    getProgressClass(progress) {
        if (progress === 100) return 'complete';
        if (progress >= 60) return 'high';
        if (progress >= 30) return 'medium';
        return 'low';
    }

    // ===================== 选择操作 =====================

    toggleSelect(taskId, selected) {
        if (selected) {
            this.selectedIds.add(taskId);
        } else {
            this.selectedIds.delete(taskId);
        }
        this.updateBatchBar();
        this.updateSelectAll();
    }

    toggleSelectAll(checked) {
        const start = (this.currentPage - 1) * this.pageSize;
        const pageData = this.filteredTasks.slice(start, start + this.pageSize);

        if (checked) {
            pageData.forEach(t => this.selectedIds.add(t.id));
        } else {
            pageData.forEach(t => this.selectedIds.delete(t.id));
        }

        // 更新行样式
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.checked = checked;
            cb.closest('tr')?.classList.toggle('selected', checked);
        });

        this.updateBatchBar();
    }

    updateSelectAll() {
        const selectAll = document.getElementById('select-all');
        const checkboxes = document.querySelectorAll('.row-checkbox');
        if (checkboxes.length === 0) {
            selectAll.checked = false;
            return;
        }
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        selectAll.checked = allChecked;
    }

    clearSelection() {
        this.selectedIds.clear();
        document.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('tr')?.classList.remove('selected');
        });
        document.getElementById('select-all').checked = false;
        this.updateBatchBar();
    }

    updateBatchBar() {
        const bar = document.getElementById('batch-bar');
        const count = document.getElementById('batch-count');
        if (this.selectedIds.size > 0) {
            bar.classList.remove('hidden');
            count.textContent = this.selectedIds.size;
        } else {
            bar.classList.add('hidden');
        }
    }

    // ===================== 任务操作 =====================

    clearAllFilters() {
        this.filters = { search: '', status: 'all', priority: 'all', category: 'all', sort: this.filters.sort || 'newest' };
        const search = document.getElementById('search-input');
        if (search) search.value = '';
        document.getElementById('search-clear')?.classList.remove('visible');
        document.getElementById('filter-status').value = 'all';
        document.getElementById('filter-priority').value = 'all';
        this._categoryCombobox?.setValue?.('all');
        this.applyFilters();
        this.render();
        requestAnimationFrame(() => search?.focus({ preventScroll: true }));
    }

    renderEmptyStateContext() {
        const searching = this.filteredTasks.length === 0 && (!!this.filters.search || this.filters.status !== 'all' || this.filters.priority !== 'all' || this.filters.category !== 'all');
        const context = document.getElementById('task-empty-context');
        const create = document.getElementById('task-empty-create');
        const clear = document.getElementById('task-empty-clear');
        const archived = document.getElementById('task-empty-archived');
        if (!context || !create || !clear || !archived) return;
        context.classList.toggle('hidden', !searching);
        clear.classList.toggle('hidden', !searching);
        archived.classList.toggle('hidden', !searching || this.filters.status === 'archived');
        create.classList.toggle('hidden', searching);
        if (searching) {
            const chips = [];
            if (this.filters.search) chips.push(`查询“${this.escapeHtml(this.filters.search)}”`);
            if (this.filters.status !== 'all') chips.push(`状态：${document.getElementById('filter-status')?.selectedOptions?.[0]?.textContent || this.filters.status}`);
            if (this.filters.priority !== 'all') chips.push(`优先级：${document.getElementById('filter-priority')?.selectedOptions?.[0]?.textContent || this.filters.priority}`);
            if (this.filters.category !== 'all') chips.push(`分类：${this.escapeHtml(this.getCategoryName(this.filters.category))}`);
            context.innerHTML = `<strong>已用条件</strong><div>${chips.map(chip => `<span>${chip}</span>`).join('')}</div><small>检查拼写，或先清除一个条件扩大结果范围。</small>`;
        }
    }

    showUndo(message, undo) {
        clearTimeout(this._undoTimer);
        const toast = document.getElementById('task-action-toast');
        const label = document.getElementById('task-action-message');
        const button = document.getElementById('task-action-undo');
        if (!toast || !label || !button) return;
        label.textContent = message;
        toast.classList.remove('hidden');
        button.onclick = async () => {
            clearTimeout(this._undoTimer);
            await undo();
            toast.classList.add('hidden');
        };
        this._undoTimer = setTimeout(() => toast.classList.add('hidden'), 6500);
    }

    async toggleTaskStatus(taskId) {
        const task = this.memos.find(t => t.id === taskId);
        if (!task) return;

        const wasCompleted = task.completed;
        const previousProgress = task.progress;
        task.completed = !task.completed;
        task.completedAt = task.completed ? Date.now() : null;
        task.updatedAt = Date.now();
        
        // 完成时如果有进度条，自动拉到 100%
        if (task.completed && task.progress !== null && task.progress !== undefined) {
            task.progress = 100;
        }

        await this.saveData();
        if (!wasCompleted && task.completed) {
            this._recentlyCompletedIds.add(taskId);
            this.showUndo(`已完成“${task.title || '无标题'}”`, async () => {
                task.completed = false;
                task.completedAt = null;
                task.progress = previousProgress;
                task.updatedAt = Date.now();
                this._recentlyCompletedIds.delete(taskId);
                await this.saveData();
                this.applyFilters();
                this.render();
            });
            setTimeout(() => {
                this._recentlyCompletedIds.delete(taskId);
                this.applyFilters();
                this.render();
            }, 6500);
        }
        this.applyFilters();
        this.render();
    }

    async archiveTask(taskId) {
        const task = this.memos.find(item => item.id === taskId);
        if (!task) return;
        const wasArchived = task.archived;
        task.archived = !task.archived;
        task.archivedAt = task.archived ? Date.now() : null;
        task.updatedAt = Date.now();
        await this.saveData();
        this.applyFilters();
        this.render();
        this.closeDetail();
        this.showUndo(`${task.archived ? '已归档' : '已取消归档'}“${task.title || '无标题'}”`, async () => {
            task.archived = wasArchived;
            task.archivedAt = wasArchived ? Date.now() : null;
            task.updatedAt = Date.now();
            await this.saveData();
            this.applyFilters();
            this.render();
        });
    }

    async batchArchive() {
        if (!this.selectedIds.size) return;
        const ids = [...this.selectedIds];
        this.memos.forEach(task => {
            if (ids.includes(task.id)) { task.archived = true; task.archivedAt = Date.now(); task.updatedAt = Date.now(); }
        });
        await this.saveData();
        this.clearSelection();
        this.applyFilters();
        this.render();
        this.showUndo(`已归档 ${ids.length} 个任务`, async () => {
            this.memos.forEach(task => { if (ids.includes(task.id)) { task.archived = false; task.archivedAt = null; } });
            await this.saveData();
            this.applyFilters();
            this.render();
        });
    }

    async moveTaskToStatus(taskId, status) {
        const task = this.memos.find(item => item.id === taskId);
        if (!task || !status) return;
        const previous = {
            completed: task.completed,
            completedAt: task.completedAt,
            status: task.status,
            progress: task.progress,
            startDate: task.startDate,
            dueDate: task.dueDate,
        };
        const newlyCompleted = status === 'done' && !task.completed;
        if (status === 'done') {
            task.completed = true;
            task.completedAt = Date.now();
            task.status = null;
            if (task.progress != null) task.progress = 100;
        } else {
            task.completed = false;
            task.completedAt = null;
            task.status = status === 'waiting' ? 'waiting' : null;
            if (status === 'not_started') {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                task.startDate = this._dateKey(tomorrow);
                if (task.dueDate && task.dueDate < task.startDate) task.dueDate = task.startDate;
            } else if (status === 'in_progress') {
                task.startDate = this._dateKey(new Date());
                if (task.dueDate && task.dueDate < task.startDate) task.dueDate = task.startDate;
            }
        }
        task.updatedAt = Date.now();
        if (newlyCompleted) this._recentlyCompletedIds.add(taskId);
        await this.saveData();
        this.applyFilters();
        this.render();
        if (newlyCompleted) {
            this.showUndo(`已完成“${task.title || '无标题'}”`, async () => {
                Object.assign(task, previous, { updatedAt: Date.now() });
                this._recentlyCompletedIds.delete(taskId);
                await this.saveData();
                this.applyFilters();
                this.render();
            });
            setTimeout(() => {
                this._recentlyCompletedIds.delete(taskId);
                this.applyFilters();
                this.render();
            }, 6500);
        }
    }

    async toggleRecurringPause(taskId) {
        const task = this.memos.find(item => item.id === taskId);
        if (!task) return;
        task.recurrencePaused = !task.recurrencePaused;
        task.updatedAt = Date.now();
        await this.saveData();
        this.renderRecurring();
    }

    async skipRecurringOccurrence(taskId) {
        const task = this.memos.find(item => item.id === taskId);
        if (!task) return;
        task.lastSkippedAt = Date.now();
        task.completed = false;
        task.completedAt = null;
        task.updatedAt = Date.now();
        await this.saveData();
        this.renderRecurring();
        this.showUndo(`已跳过“${task.title || '无标题'}”本次实例`, async () => {
            task.lastSkippedAt = null;
            await this.saveData();
            this.renderRecurring();
        });
    }

    async deleteTask(taskId) {
        if (!confirm('确定要删除这个任务吗？此操作不可撤销。')) return;
        this.memos = this.memos.filter(t => t.id !== taskId);
        this.selectedIds.delete(taskId);
        await this.saveData();
        this.applyFilters();
        this.render();
        this.closeDetail();
    }

    async batchComplete() {
        if (this.selectedIds.size === 0) return;
        const snapshots = [];
        this.memos.forEach(t => {
            if (this.selectedIds.has(t.id) && !t.completed) {
                snapshots.push({ id: t.id, completed: t.completed, completedAt: t.completedAt, progress: t.progress, updatedAt: t.updatedAt });
                t.completed = true;
                t.completedAt = Date.now();
                t.updatedAt = Date.now();
                // 完成时如果有进度条，自动拉到 100%
                if (t.progress !== null && t.progress !== undefined) {
                    t.progress = 100;
                }
            }
        });
        snapshots.forEach(snapshot => this._recentlyCompletedIds.add(snapshot.id));
        await this.saveData();
        this.clearSelection();
        this.applyFilters();
        this.render();
        if (snapshots.length) {
            this.showUndo(`已完成 ${snapshots.length} 个任务`, async () => {
                snapshots.forEach(snapshot => {
                    const task = this.memos.find(item => item.id === snapshot.id);
                    if (task) Object.assign(task, snapshot, { updatedAt: Date.now() });
                    this._recentlyCompletedIds.delete(snapshot.id);
                });
                await this.saveData();
                this.applyFilters();
                this.render();
            });
            setTimeout(() => {
                snapshots.forEach(snapshot => this._recentlyCompletedIds.delete(snapshot.id));
                this.applyFilters();
                this.render();
            }, 6500);
        }
    }

    async batchUncomplete() {
        if (this.selectedIds.size === 0) return;
        this.memos.forEach(t => {
            if (this.selectedIds.has(t.id) && t.completed) {
                t.completed = false;
                t.completedAt = null;
                t.updatedAt = Date.now();
            }
        });
        await this.saveData();
        this.clearSelection();
        this.applyFilters();
        this.render();
    }

    async markTaskFailed(taskId) {
        const task = this.memos.find(t => t.id === taskId);
        if (!task) return;
        task.status = 'failed';
        task.failedAt = Date.now();
        task.updatedAt = Date.now();
        await this.saveData();
        this.applyFilters();
        this.render();
        this.closeDetail();
    }

    async reactivateTask(taskId) {
        const task = this.memos.find(t => t.id === taskId);
        if (!task) return;
        task.status = null;
        task.failedAt = null;
        task.completed = false;
        task.completedAt = null;
        task.updatedAt = Date.now();
        await this.saveData();
        this.applyFilters();
        this.render();
        this.closeDetail();
    }

    async batchDelete() {
        if (this.selectedIds.size === 0) return;
        if (!confirm(`确定要删除选中的 ${this.selectedIds.size} 个任务吗？此操作不可撤销。`)) return;
        this.memos = this.memos.filter(t => !this.selectedIds.has(t.id));
        this.selectedIds.clear();
        await this.saveData();
        this.applyFilters();
        this.render();
    }

    async saveData() {
        try {
            await chrome.storage.local.set({ memos: this.memos });
            console.log('数据已保存');
        } catch (error) {
            console.error('保存失败:', error);
        }
    }

    // ===================== 工具方法 =====================

    populateCategoryFilter() {
        const wrap = document.getElementById('filter-category-wrap');
        if (!wrap) return;
        this._categoryCombobox = this.createCategoryCombobox(wrap, {
            value: 'all',
            placeholder: '全部分类',
            allowAll: true,
            onChange: (value) => {
                this.filters.category = value;
                this.currentPage = 1;
                this.applyFilters();
                this.render();
            }
        });
    }

    /**
     * 创建可搜索的分类 Combobox（与 memo.js 侧边栏一致）
     */
    createCategoryCombobox(container, opts = {}) {
        const allowAll = opts.allowAll !== false;
        let value = opts.value || (allowAll ? 'all' : '');
        const placeholder = opts.placeholder || (allowAll ? '全部分类' : '无分类');
        const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};

        const getOptionsList = () => {
            const list = allowAll
                ? [{ id: 'all', name: '全部分类', color: null }]
                : [{ id: '', name: '无分类', color: null }];
            const topLevel = (this.categories || []).filter(c => !c.parentId);
            topLevel.forEach(parent => {
                list.push({ id: parent.id, name: parent.name, color: parent.color || '#64b4ff' });
                (this.categories || []).filter(c => c.parentId === parent.id).forEach(child => {
                    list.push({ id: child.id, name: '— ' + child.name, color: child.color || parent.color || '#64b4ff' });
                });
            });
            return list;
        };

        let suppressNextFocusOpen = false;
        container.classList.add('category-combobox');
        container.innerHTML = `
            <div class="category-combobox-input-wrap">
                <span class="category-combobox-color" id="combobox-color-dot"></span>
                <input type="text" class="category-combobox-input" autocomplete="off" placeholder="${this.escapeHtml(placeholder)}" role="combobox" aria-label="按分类筛选" aria-expanded="false" aria-haspopup="listbox" aria-controls="task-category-filter-listbox">
                <i class="fas fa-chevron-down category-combobox-arrow"></i>
            </div>
        `;

        const listbox = document.createElement('ul');
        listbox.id = 'task-category-filter-listbox';
        listbox.className = 'category-combobox-list category-combobox-portal hidden';
        listbox.setAttribute('role', 'listbox');
        document.body.appendChild(listbox);

        const input = container.querySelector('.category-combobox-input');
        const colorDot = container.querySelector('.category-combobox-color');
        const inputWrap = container.querySelector('.category-combobox-input-wrap');

        let options = getOptionsList();
        let highlightedIndex = -1;

        const getDisplayName = (id) => {
            if (allowAll && id === 'all') return '全部分类';
            if (!allowAll && id === '') return '无分类';
            const c = options.find(o => o.id === id);
            return c ? c.name : placeholder;
        };
        const getDisplayColor = (id) => {
            if ((allowAll && id === 'all') || (!allowAll && id === '')) return 'transparent';
            const c = options.find(o => o.id === id);
            return c && c.color ? c.color : 'transparent';
        };

        const positionListbox = () => {
            const rect = inputWrap.getBoundingClientRect();
            listbox.style.position = 'fixed';
            listbox.style.left = rect.left + 'px';
            listbox.style.top = (rect.bottom + 4) + 'px';
            listbox.style.minWidth = rect.width + 'px';
        };

        const renderList = (filterText = '') => {
            const q = (filterText || '').toLowerCase().trim();
            const filtered = q ? options.filter(o => (o.name || '').toLowerCase().includes(q)) : options;
            listbox.innerHTML = filtered.map((opt, i) => {
                const isSelected = opt.id === value;
                return `
                <li class="category-combobox-option${isSelected ? ' selected' : ''}" role="option" data-value="${this.escapeHtml(opt.id)}" data-index="${i}" aria-selected="false">
                    <span class="category-combobox-option-color" style="background:${opt.color || 'transparent'}"></span>
                    <span class="category-combobox-option-name">${this.escapeHtml(opt.name)}</span>
                    ${isSelected ? '<i class="fas fa-check category-combobox-check"></i>' : ''}
                </li>`;
            }).join('');
            if (opts.showManageEntry !== false) {
                listbox.innerHTML += `<li role="none"><button type="button" class="category-combobox-manage" data-action="manage"><i class="fas fa-cog"></i> 管理分类</button></li>`;
            }
            highlightedIndex = filtered.length > 0 ? 0 : -1;
            listbox.querySelectorAll('.category-combobox-option').forEach((el, i) => {
                el.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
                el.addEventListener('click', (e) => { e.stopPropagation(); selectValue(el.dataset.value); });
            });
            const manageBtn = listbox.querySelector('.category-combobox-manage');
            if (manageBtn) {
                manageBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeList();
                    this.openCategoryManagerPopup();
                });
            }
            if (!q) {
                const selectedEl = listbox.querySelector('.category-combobox-option.selected');
                if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
            }
        };

        const selectValue = (id) => {
            value = id;
            input.value = getDisplayName(id);
            colorDot.style.background = getDisplayColor(id);
            listbox.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            input.placeholder = placeholder;
            onChange(value);
        };

        const openList = () => {
            input.setAttribute('aria-expanded', 'true');
            input.value = '';
            input.placeholder = '搜索分类...';
            positionListbox();
            listbox.classList.remove('hidden');
            renderList('');
        };

        const closeList = () => {
            listbox.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            input.value = getDisplayName(value);
            input.placeholder = placeholder;
            colorDot.style.background = getDisplayColor(value);
        };

        input.addEventListener('focus', () => {
            if (suppressNextFocusOpen) {
                suppressNextFocusOpen = false;
                return;
            }
            if (listbox.classList.contains('hidden')) openList();
        });
        input.addEventListener('input', () => {
            if (listbox.classList.contains('hidden')) {
                input.setAttribute('aria-expanded', 'true');
                positionListbox();
                listbox.classList.remove('hidden');
            }
            renderList(input.value);
        });
        input.addEventListener('keydown', (e) => {
            const optsEl = listbox.querySelectorAll('.category-combobox-option');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightedIndex = Math.min(highlightedIndex + 1, optsEl.length - 1);
                optsEl.forEach((o, i) => o.setAttribute('aria-selected', i === highlightedIndex ? 'true' : 'false'));
                if (optsEl[highlightedIndex]) optsEl[highlightedIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightedIndex = Math.max(highlightedIndex - 1, 0);
                optsEl.forEach((o, i) => o.setAttribute('aria-selected', i === highlightedIndex ? 'true' : 'false'));
                if (optsEl[highlightedIndex]) optsEl[highlightedIndex].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter' && optsEl[highlightedIndex]) {
                e.preventDefault();
                selectValue(optsEl[highlightedIndex].dataset.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeList();
                input.blur();
            }
        });

        inputWrap.addEventListener('click', (e) => {
            if (e.target.closest('.category-combobox-arrow')) {
                if (listbox.classList.contains('hidden')) {
                    input.focus();
                } else {
                    closeList();
                    input.blur();
                }
                e.preventDefault();
            }
        });

        const outsideClickHandler = (e) => {
            if (!container.contains(e.target) && !listbox.contains(e.target)) closeList();
        };
        document.addEventListener('click', outsideClickHandler);

        const setOptions = () => {
            options = getOptionsList();
            input.value = getDisplayName(value);
            colorDot.style.background = getDisplayColor(value);
        };

        const setValue = (id) => {
            value = id || (allowAll ? 'all' : '');
            input.value = getDisplayName(value);
            colorDot.style.background = getDisplayColor(value);
        };

        setValue(value);

        return {
            getValue: () => value,
            setValue,
            setOptions,
            focusWithoutOpening: () => {
                closeList();
                suppressNextFocusOpen = true;
                input.focus({ preventScroll: true });
            },
            destroy: () => {
                document.removeEventListener('click', outsideClickHandler);
                if (listbox.parentNode) listbox.parentNode.removeChild(listbox);
                container.innerHTML = '';
            }
        };
    }

    getCategoryName(categoryId) {
        const cat = this.categories.find(c => c.id === categoryId);
        return cat ? cat.name : '未分类';
    }

    getCategoryAndChildIds(categoryId) {
        const ids = [categoryId];
        const children = this.categories.filter(c => c.parentId === categoryId);
        children.forEach(ch => ids.push(ch.id));
        return ids;
    }

    openCategoryManagerPopup() {
        const existing = document.getElementById('task-category-manager');
        if (existing) {
            existing.querySelector('#task-catmgr-search')?.focus({ preventScroll: true });
            return;
        }

        this._categoryManagerReturnFocus = document.activeElement;
        const popup = document.createElement('div');
        popup.id = 'task-category-manager';
        popup.className = 'task-catmgr-overlay';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-modal', 'true');
        popup.setAttribute('aria-labelledby', 'task-catmgr-title');
        popup.setAttribute('aria-describedby', 'task-catmgr-description');
        popup.setAttribute('aria-hidden', 'false');
        popup.innerHTML = `
            <div class="task-catmgr-panel">
                <div class="task-catmgr-header">
                    <div>
                        <span class="task-catmgr-kicker">TASK ORGANIZATION</span>
                        <h3 id="task-catmgr-title"><i class="fas fa-folder-tree"></i> 分类管理</h3>
                        <p id="task-catmgr-description">整理任务分类；已有任务不会因重命名而丢失。</p>
                    </div>
                    <button type="button" class="task-catmgr-close" id="task-catmgr-close" aria-label="关闭分类管理"><i class="fas fa-times"></i></button>
                </div>
                <div class="task-catmgr-body">
                    <div class="task-catmgr-search-row">
                        <label for="task-catmgr-search">搜索或新建分类</label>
                        <div>
                            <input type="text" class="task-catmgr-search" id="task-catmgr-search" placeholder="输入分类名称" autocomplete="off">
                            <button type="button" class="task-catmgr-add-btn" id="task-catmgr-add" aria-label="创建一级分类"><i class="fas fa-plus"></i><span>新建</span></button>
                        </div>
                    </div>
                    <div class="task-catmgr-list" id="task-catmgr-list" aria-live="polite">
                        ${this._renderCategoryManagerList()}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        document.body.classList.add('task-modal-open');
        this._setBackgroundInert(true, [popup]);
        requestAnimationFrame(() => {
            popup.classList.add('active');
            popup.querySelector('#task-catmgr-search')?.focus({ preventScroll: true });
        });
        this._bindCategoryManagerEvents(popup);
    }

    _closeCategoryManager({ restoreFocus = true } = {}) {
        const popup = document.getElementById('task-category-manager');
        if (!popup) return;
        popup.classList.remove('active');
        popup.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('task-modal-open');
        this._setBackgroundInert(false);
        const returnTarget = this._categoryManagerReturnFocus;
        this._categoryManagerReturnFocus = null;
        if (this._categoryCombobox) this._categoryCombobox.setOptions();
        setTimeout(() => popup.remove(), 180);
        if (restoreFocus) requestAnimationFrame(() => {
            if (returnTarget?.matches?.('.category-combobox-input')) this._categoryCombobox?.focusWithoutOpening();
            else if (this._isUsableFocusTarget(returnTarget)) returnTarget.focus({ preventScroll: true });
            else this._categoryCombobox?.focusWithoutOpening();
        });
    }
    
    _renderCategoryManagerList(filter = '') {
        const topLevel = (this.categories || []).filter(c => !c.parentId);
        const q = filter.toLowerCase();
        if (topLevel.length === 0 && !q) {
            return '<div class="task-catmgr-empty"><i class="fas fa-folder-open"></i> 暂无分类，输入名称后点击 + 创建</div>';
        }
        let html = '';
        topLevel.forEach(parent => {
            const children = (this.categories || []).filter(c => c.parentId === parent.id);
            const parentMatch = !q || parent.name.toLowerCase().includes(q);
            const matchChildren = children.filter(ch => !q || ch.name.toLowerCase().includes(q));
            if (!parentMatch && matchChildren.length === 0) return;
            
            const color = parent.color || '#64b4ff';
            const taskCount = this.memos.filter(m => m.categoryId === parent.id).length;
            const childCount = children.reduce((s, ch) => s + this.memos.filter(m => m.categoryId === ch.id).length, 0);
            
            html += `<div class="task-catmgr-group">
                <div class="task-catmgr-item task-catmgr-parent" data-id="${parent.id}">
                    <span class="task-catmgr-dot" style="background:${color}"></span>
                    <span class="task-catmgr-name">${this.escapeHtml(parent.name)}</span>
                    <span class="task-catmgr-count">${taskCount + childCount}</span>
                    <div class="task-catmgr-actions">
                        <button type="button" class="task-catmgr-action" data-action="add-child" data-id="${parent.id}" aria-label="为${this.escapeHtml(parent.name)}添加子分类"><i class="fas fa-plus"></i></button>
                        <button type="button" class="task-catmgr-action" data-action="edit" data-id="${parent.id}" aria-label="重命名分类：${this.escapeHtml(parent.name)}"><i class="fas fa-pen"></i></button>
                        <button type="button" class="task-catmgr-action task-catmgr-danger" data-action="delete" data-id="${parent.id}" aria-label="删除分类：${this.escapeHtml(parent.name)}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            
            const showChildren = parentMatch ? children : matchChildren;
            showChildren.forEach(ch => {
                const chColor = ch.color || color;
                const chCount = this.memos.filter(m => m.categoryId === ch.id).length;
                html += `<div class="task-catmgr-item task-catmgr-child" data-id="${ch.id}">
                    <span class="task-catmgr-dot" style="background:${chColor}"></span>
                    <span class="task-catmgr-name">— ${this.escapeHtml(ch.name)}</span>
                    <span class="task-catmgr-count">${chCount}</span>
                    <div class="task-catmgr-actions">
                        <button type="button" class="task-catmgr-action" data-action="edit" data-id="${ch.id}" aria-label="重命名子分类：${this.escapeHtml(ch.name)}"><i class="fas fa-pen"></i></button>
                        <button type="button" class="task-catmgr-action task-catmgr-danger" data-action="delete" data-id="${ch.id}" aria-label="删除子分类：${this.escapeHtml(ch.name)}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            });
            html += '</div>';
        });
        return html || '<div class="task-catmgr-empty">无匹配分类</div>';
    }
    
    _bindCategoryManagerEvents(popup) {
        const closeBtn = popup.querySelector('#task-catmgr-close');
        closeBtn.addEventListener('click', () => this._closeCategoryManager());
        popup.addEventListener('click', (e) => { if (e.target === popup) this._closeCategoryManager(); });
        
        const search = popup.querySelector('#task-catmgr-search');
        search.addEventListener('input', () => {
            popup.querySelector('#task-catmgr-list').innerHTML = this._renderCategoryManagerList(search.value);
            this._bindCategoryListActions(popup);
        });
        
        const addBtn = popup.querySelector('#task-catmgr-add');
        addBtn.addEventListener('click', () => {
            const name = search.value.trim();
            if (!name) { search.focus(); return; }
            this._addCategory(name, null, popup);
            search.value = '';
        });
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && search.value.trim()) {
                e.preventDefault();
                this._addCategory(search.value.trim(), null, popup);
                search.value = '';
            }
        });
        
        this._bindCategoryListActions(popup);
    }
    
    _bindCategoryListActions(popup) {
        popup.querySelectorAll('.task-catmgr-action').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                
                if (action === 'add-child') {
                    const name = prompt('输入子分类名称:');
                    if (name && name.trim()) await this._addCategory(name.trim(), id, popup);
                } else if (action === 'edit') {
                    const cat = this.categories.find(c => c.id === id);
                    if (!cat) return;
                    const name = prompt('修改分类名称:', cat.name);
                    if (name && name.trim() && name.trim() !== cat.name) {
                        cat.name = name.trim();
                        await this._saveCategories();
                        this._refreshCategoryList(popup);
                    }
                } else if (action === 'delete') {
                    const cat = this.categories.find(c => c.id === id);
                    if (!cat) return;
                    const children = this.categories.filter(c => c.parentId === id);
                    const msg = children.length > 0
                        ? `确定要删除 "${cat.name}" 及其 ${children.length} 个子分类吗？相关任务将变为无分类。`
                        : `确定要删除 "${cat.name}" 吗？相关任务将变为无分类。`;
                    if (confirm(msg)) {
                        const toDelete = [id, ...children.map(c => c.id)];
                        this.categories = this.categories.filter(c => !toDelete.includes(c.id));
                        this.memos.forEach(m => { if (toDelete.includes(m.categoryId)) m.categoryId = null; });
                        await this._saveCategories();
                        await this._saveMemos();
                        this._refreshCategoryList(popup);
                        this.applyFilters();
                        this.render();
                    }
                }
            });
        });
    }
    
    async _addCategory(name, parentId, popup) {
        const newCat = {
            id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            name: name,
            color: this._randomCategoryColor(),
            parentId: parentId || undefined
        };
        this.categories.push(newCat);
        await this._saveCategories();
        this._refreshCategoryList(popup);
    }
    
    _randomCategoryColor() {
        const colors = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#14b8a6', '#f97316', '#ec4899', '#06b6d4'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
    
    _refreshCategoryList(popup) {
        const search = popup.querySelector('#task-catmgr-search');
        const list = popup.querySelector('#task-catmgr-list');
        if (list) {
            list.innerHTML = this._renderCategoryManagerList(search ? search.value : '');
            this._bindCategoryListActions(popup);
        }
    }
    
    async _saveCategories() {
        await new Promise(resolve => chrome.storage.sync.set({ memosCategories: this.categories }, resolve));
    }
    
    async _saveMemos() {
        await new Promise(resolve => chrome.storage.local.set({ memos: this.memos }, resolve));
    }

    /**
     * 获取图片缩略图 URL（兼容 ImgVault 新格式和 base64 旧格式）
     */
    getImageThumbnail(img) {
        if (img.imageId) {
            const params = new URLSearchParams({ width: '80', height: '80', format: 'webp', quality: '60' });
            return `https://www.meczyc6.info/imgvault/api/v1/images/${img.imageId}/process?${params}`;
        }
        return img.thumbnail || '';
    }

    /**
     * 获取图片原图 URL（兼容 ImgVault 新格式和 base64 旧格式）
     */
    getImageFullUrl(img) {
        if (img.imageId) {
            return `https://www.meczyc6.info/imgvault/api/v1/images/${img.imageId}/download`;
        }
        return img.fullImage || img.thumbnail || '';
    }

    getTaskStatus(task) {
        if (task.archived) {
            return { key: 'archived', label: '已归档', icon: 'fas fa-box-archive', color: '#94a3b8' };
        }
        if (task.status === 'failed') {
            return { key: 'failed', label: '已失败', icon: 'fas fa-times-circle', color: '#747d8c' };
        }
        if (task.completed) {
            return { key: 'completed', label: '已完成', icon: 'fas fa-check-circle', color: '#2ed573' };
        }
        if (task.status === 'waiting') {
            return { key: 'waiting', label: '等待', icon: 'fas fa-pause-circle', color: '#fbbf24' };
        }
        const today = new Date().toISOString().split('T')[0];
        const start = task.startDate || new Date(task.createdAt).toISOString().split('T')[0];
        const end = task.dueDate;

        if (end && end < today) {
            return { key: 'overdue', label: '已逾期', icon: 'fas fa-exclamation-circle', color: '#ff4757' };
        }
        if (start > today) {
            return { key: 'not_started', label: '待处理', icon: 'far fa-clock', color: '#a0a0a0' };
        }
        return { key: 'in_progress', label: '进行中', icon: 'fas fa-spinner', color: '#ffa502' };
    }

    calcDuration(startStr, endStr) {
        if (!startStr || !endStr || startStr > endStr) return '—';
        const s = new Date(startStr + 'T00:00:00');
        const e = new Date(endStr + 'T00:00:00');
        const calDays = Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
        let workDays = 0;
        const cur = new Date(s);
        while (cur <= e) {
            const dow = cur.getDay();
            if (dow !== 0 && dow !== 6) workDays++;
            cur.setDate(cur.getDate() + 1);
        }
        return `${calDays} 天（${workDays} 工作日）`;
    }

    formatDate(timestamp) {
        if (!timestamp) return '—';
        const d = new Date(timestamp);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hour}:${min}`;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _initMarked() {
        MarkdownRenderer.configure();
    }

    renderMarkdown(text) {
        return MarkdownRenderer.render(text);
    }

    renderMermaid(container) {
        MarkdownRenderer.renderMermaid(container);
    }

    hasMarkdownSyntax(text) {
        return MarkdownRenderer.hasMarkdownSyntax(text);
    }

    _parseSearchQuery(query) {
        const includeTerms = [];
        const excludeTerms = [];
        const tokens = query.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
            if (token.startsWith('-') && token.length > 1) {
                const parts = token.substring(1).split(/[,，]/).filter(Boolean);
                for (const part of parts) {
                    const trimmed = part.trim().toLowerCase();
                    if (trimmed) excludeTerms.push(trimmed);
                }
            } else {
                const trimmed = token.toLowerCase();
                if (trimmed) includeTerms.push(trimmed);
            }
        }
        return { includeTerms, excludeTerms };
    }
}

// 全局实例
const taskManager = new TaskManager();
document.addEventListener('DOMContentLoaded', () => taskManager.init());
