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
        this.currentView = 'table'; // 'table' | 'card'

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
        this.render();
    }

    // ===================== 数据加载 =====================

    async loadData() {
        try {
            // 注意：memos 存储在 local，而 categories/tags 存储在 sync（与 memo.js 保持一致）
            const [memosResult, categoriesResult, tagsResult] = await Promise.all([
                new Promise(resolve => chrome.storage.local.get('memos', resolve)),
                new Promise(resolve => chrome.storage.sync.get('memosCategories', resolve)),
                new Promise(resolve => chrome.storage.sync.get('memosTags', resolve))
            ]);

            const memosData = Array.isArray(memosResult.memos) ? memosResult.memos : [];
            this.categories = Array.isArray(categoriesResult.memosCategories) ? categoriesResult.memosCategories : [];
            this.tags = Array.isArray(tagsResult.memosTags) ? tagsResult.memosTags : [];

            // 规范化数据
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
                subtasks: Array.isArray(memo.subtasks) ? memo.subtasks : []
            }));

            console.log(`加载了 ${this.memos.length} 个任务`);
        } catch (error) {
            console.error('加载数据失败:', error);
            this.memos = [];
        }
    }

    // ===================== 事件绑定 =====================

    bindEvents() {
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

        // 视图切换
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                if (view !== this.currentView) {
                    this.currentView = view;
                    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.render();
                }
            });
        });

        // 全选
        document.getElementById('select-all').addEventListener('change', (e) => {
            this.toggleSelectAll(e.target.checked);
        });

        // 批量操作
        document.getElementById('batch-complete').addEventListener('click', () => this.batchComplete());
        document.getElementById('batch-uncomplete').addEventListener('click', () => this.batchUncomplete());
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

        // ESC 键关闭详情面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDetail();
            }
        });
    }

    // ===================== 筛选和排序 =====================

    applyFilters() {
        const today = new Date().toISOString().split('T')[0];
        let tasks = [...this.memos];

        // 搜索
        if (this.filters.search) {
            const query = this.filters.search.toLowerCase();
            tasks = tasks.filter(t =>
                (t.title && t.title.toLowerCase().includes(query)) ||
                (t.text && t.text.toLowerCase().includes(query))
            );
        }

        // 状态筛选
        switch (this.filters.status) {
            case 'active':
                tasks = tasks.filter(t => !t.completed);
                break;
            case 'completed':
                tasks = tasks.filter(t => t.completed);
                break;
            case 'overdue':
                tasks = tasks.filter(t => t.dueDate && t.dueDate < today && !t.completed);
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
        const today = new Date().toISOString().split('T')[0];
        const all = this.memos;
        const active = all.filter(t => !t.completed);
        const done = all.filter(t => t.completed);
        const overdue = all.filter(t => t.dueDate && t.dueDate < today && !t.completed);

        document.getElementById('stat-total').textContent = all.length;
        document.getElementById('stat-active').textContent = active.length;
        document.getElementById('stat-done').textContent = done.length;
        document.getElementById('stat-overdue').textContent = overdue.length;
    }

    // ===================== 渲染 =====================

    render() {
        const tableView = document.getElementById('table-view');
        const cardView = document.getElementById('card-view');
        const emptyState = document.getElementById('empty-state');

        // 分页
        const totalPages = Math.max(1, Math.ceil(this.filteredTasks.length / this.pageSize));
        if (this.currentPage > totalPages) this.currentPage = totalPages;
        const start = (this.currentPage - 1) * this.pageSize;
        const pageData = this.filteredTasks.slice(start, start + this.pageSize);

        if (this.currentView === 'table') {
            tableView.classList.remove('hidden');
            cardView.classList.add('hidden');
            this.renderTable(pageData);
        } else {
            tableView.classList.add('hidden');
            cardView.classList.remove('hidden');
            this.renderCards(pageData);
        }

        // 空状态
        if (this.filteredTasks.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }

        // 分页
        this.renderPagination(totalPages);

        // 批量操作栏
        this.updateBatchBar();
    }

    renderTable(tasks) {
        const tbody = document.getElementById('task-table-body');
        tbody.innerHTML = tasks.map(task => this.createTableRow(task)).join('');

        // 绑定行事件
        tbody.querySelectorAll('tr').forEach(row => {
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

            // 状态切换
            const statusIcon = row.querySelector('.status-icon');
            if (statusIcon) {
                statusIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleTaskStatus(taskId);
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
        const completedClass = task.completed ? 'completed-row' : '';
        const selectedClass = isSelected ? 'selected' : '';

        return `
            <tr data-task-id="${task.id}" class="${completedClass} ${selectedClass}">
                <td class="col-checkbox">
                    <input type="checkbox" class="row-checkbox" ${isSelected ? 'checked' : ''}>
                </td>
                <td class="col-status">
                    <span class="status-icon ${task.completed ? 'completed' : 'active'}" title="${task.completed ? '标记为未完成' : '标记为已完成'}">
                        <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
                    </span>
                </td>
                <td class="col-priority">
                    ${this.renderPriorityBadge(task.priority)}
                </td>
                <td class="col-title">
                    <div class="title-cell">
                        <span class="task-title-text">${this.escapeHtml(task.title || '无标题')}</span>
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
                        <button class="action-btn-sm btn-detail" title="查看详情">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="action-btn-sm danger btn-delete" title="删除">
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
        return `
            <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
                <div class="card-top">
                    <div class="card-title">${this.escapeHtml(task.title || '无标题')}</div>
                    ${this.renderPriorityBadge(task.priority)}
                </div>
                ${task.text ? `<div class="card-desc">${this.escapeHtml(task.text)}</div>` : ''}
                ${task.progress !== null ? `<div class="card-progress">${this.renderProgressBar(task.progress)}</div>` : ''}
                ${task.images && task.images.length > 0 ? `
                    <div class="card-images">
                        ${task.images.slice(0, 4).map(img => `<img class="card-image-thumb" src="${this.getImageThumbnail(img)}" alt="图片">`).join('')}
                        ${task.images.length > 4 ? `<span class="category-tag">+${task.images.length - 4}</span>` : ''}
                    </div>
                ` : ''}
                <div class="card-meta">
                    <div class="card-tags">
                        ${task.categoryId ? `<span class="category-tag"><i class="fas fa-folder"></i> ${this.escapeHtml(this.getCategoryName(task.categoryId))}</span>` : ''}
                        <span class="category-tag">
                            <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-clock'}"></i>
                            ${task.completed ? '已完成' : '进行中'}
                        </span>
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

        const panel = document.getElementById('detail-panel');
        const overlay = document.getElementById('detail-overlay');
        const body = document.getElementById('detail-body');

        body.innerHTML = this.createDetailContent(task);
        
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
        
        panel.classList.remove('hidden');
        overlay.classList.remove('hidden');
    }

    closeDetail() {
        document.getElementById('detail-panel').classList.add('hidden');
        document.getElementById('detail-overlay').classList.add('hidden');
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

        return `
            <!-- 标题 -->
            <div class="detail-section">
                <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                    <span class="status-icon ${task.completed ? 'completed' : 'active'}" style="font-size: 1.5rem;">
                        <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
                    </span>
                    <div class="detail-title">${this.escapeHtml(task.title || '无标题')}</div>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                    ${this.renderPriorityBadge(task.priority)}
                    <span class="category-tag">${task.completed ? '<i class="fas fa-check"></i> 已完成' : '<i class="far fa-clock"></i> 进行中'}</span>
                    <span class="category-tag"><i class="fas fa-calendar-alt"></i> ${ageText}</span>
                </div>
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
                <div class="detail-section-title">内容</div>
                <div class="detail-text">${this.escapeHtml(task.text)}</div>
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

    async toggleTaskStatus(taskId) {
        const task = this.memos.find(t => t.id === taskId);
        if (!task) return;

        task.completed = !task.completed;
        task.completedAt = task.completed ? Date.now() : null;
        task.updatedAt = Date.now();
        
        // 完成时如果有进度条，自动拉到 100%
        if (task.completed && task.progress !== null && task.progress !== undefined) {
            task.progress = 100;
        }

        await this.saveData();
        this.applyFilters();
        this.render();
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
        this.memos.forEach(t => {
            if (this.selectedIds.has(t.id) && !t.completed) {
                t.completed = true;
                t.completedAt = Date.now();
                t.updatedAt = Date.now();
                // 完成时如果有进度条，自动拉到 100%
                if (t.progress !== null && t.progress !== undefined) {
                    t.progress = 100;
                }
            }
        });
        await this.saveData();
        this.clearSelection();
        this.applyFilters();
        this.render();
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

        container.classList.add('category-combobox');
        container.innerHTML = `
            <div class="category-combobox-input-wrap">
                <span class="category-combobox-color" id="combobox-color-dot"></span>
                <input type="text" class="category-combobox-input" autocomplete="off" placeholder="${this.escapeHtml(placeholder)}" role="combobox" aria-expanded="false" aria-haspopup="listbox">
                <i class="fas fa-chevron-down category-combobox-arrow"></i>
            </div>
        `;

        const listbox = document.createElement('ul');
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
            listbox.innerHTML = filtered.map((opt, i) => `
                <li class="category-combobox-option" role="option" data-value="${this.escapeHtml(opt.id)}" data-index="${i}" aria-selected="false">
                    <span class="category-combobox-option-color" style="background:${opt.color || 'transparent'}"></span>
                    <span class="category-combobox-option-name">${this.escapeHtml(opt.name)}</span>
                </li>
            `).join('');
            if (opts.showManageEntry !== false) {
                listbox.innerHTML += `<li class="category-combobox-manage" role="option" data-action="manage"><i class="fas fa-cog"></i> 管理分类</li>`;
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
        };

        const selectValue = (id) => {
            value = id;
            input.value = getDisplayName(id);
            colorDot.style.background = getDisplayColor(id);
            listbox.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            onChange(value);
        };

        const openList = () => {
            input.setAttribute('aria-expanded', 'true');
            positionListbox();
            listbox.classList.remove('hidden');
            renderList(input.value);
        };

        const closeList = () => {
            listbox.classList.add('hidden');
            input.setAttribute('aria-expanded', 'false');
            input.value = getDisplayName(value);
            colorDot.style.background = getDisplayColor(value);
        };

        input.addEventListener('focus', () => openList());
        input.addEventListener('input', () => { openList(); renderList(input.value); });
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
            }
        });

        inputWrap.addEventListener('click', (e) => {
            if (e.target === input || e.target.closest('.category-combobox-arrow')) {
                if (listbox.classList.contains('hidden')) openList();
                else closeList();
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
        let popup = document.getElementById('task-category-manager');
        if (popup) popup.remove();
        
        popup = document.createElement('div');
        popup.id = 'task-category-manager';
        popup.className = 'task-catmgr-overlay';
        popup.innerHTML = `
            <div class="task-catmgr-panel">
                <div class="task-catmgr-header">
                    <h3><i class="fas fa-folder-tree"></i> 分类管理</h3>
                    <button class="task-catmgr-close" id="task-catmgr-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="task-catmgr-body">
                    <div class="task-catmgr-search-row">
                        <input type="text" class="task-catmgr-search" id="task-catmgr-search" placeholder="搜索或新建分类名称...">
                        <button class="task-catmgr-add-btn" id="task-catmgr-add" title="新建一级分类"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="task-catmgr-list" id="task-catmgr-list">
                        ${this._renderCategoryManagerList()}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(popup);
        requestAnimationFrame(() => popup.classList.add('active'));
        this._bindCategoryManagerEvents(popup);
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
                        <button class="task-catmgr-action" data-action="add-child" data-id="${parent.id}" title="添加子分类"><i class="fas fa-plus"></i></button>
                        <button class="task-catmgr-action" data-action="edit" data-id="${parent.id}" title="编辑"><i class="fas fa-pen"></i></button>
                        <button class="task-catmgr-action task-catmgr-danger" data-action="delete" data-id="${parent.id}" title="删除"><i class="fas fa-trash"></i></button>
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
                        <button class="task-catmgr-action" data-action="edit" data-id="${ch.id}" title="编辑"><i class="fas fa-pen"></i></button>
                        <button class="task-catmgr-action task-catmgr-danger" data-action="delete" data-id="${ch.id}" title="删除"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            });
            html += '</div>';
        });
        return html || '<div class="task-catmgr-empty">无匹配分类</div>';
    }
    
    _bindCategoryManagerEvents(popup) {
        const closeBtn = popup.querySelector('#task-catmgr-close');
        const closePopup = () => {
            popup.classList.remove('active');
            setTimeout(() => popup.remove(), 300);
            if (this._categoryCombobox) this._categoryCombobox.setOptions();
        };
        closeBtn.addEventListener('click', closePopup);
        popup.addEventListener('click', (e) => { if (e.target === popup) closePopup(); });
        
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
}

// 全局实例
const taskManager = new TaskManager();
document.addEventListener('DOMContentLoaded', () => taskManager.init());
