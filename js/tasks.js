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
            const [memosResult, categoriesResult, tagsResult] = await Promise.all([
                new Promise(resolve => chrome.storage.local.get('memos', resolve)),
                new Promise(resolve => chrome.storage.local.get('memosCategories', resolve)),
                new Promise(resolve => chrome.storage.local.get('memosTags', resolve))
            ]);

            const memosData = Array.isArray(memosResult.memos) ? memosResult.memos : [];
            this.categories = Array.isArray(categoriesResult.memosCategories) ? categoriesResult.memosCategories : [];
            this.tags = Array.isArray(tagsResult.memosTags) ? tagsResult.memosTags : [];

            // 规范化数据
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
                dueDate: memo.dueDate || null,
                images: Array.isArray(memo.images) ? memo.images : [],
                progress: memo.progress !== undefined && memo.progress !== null ? (
                    typeof memo.progress === 'object' && memo.progress.total
                        ? Math.round((memo.progress.current / memo.progress.total) * 100)
                        : Math.max(0, Math.min(100, parseInt(memo.progress) || 0))
                ) : null
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
        document.getElementById('filter-category').addEventListener('change', (e) => {
            this.filters.category = e.target.value;
            this.currentPage = 1;
            this.applyFilters();
            this.render();
        });
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

        // 分类筛选
        if (this.filters.category !== 'all') {
            tasks = tasks.filter(t => t.categoryId === this.filters.category);
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
                    ${this.renderDueDate(task.dueDate, task.completed)}
                </td>
                <td class="col-created">
                    <span class="date-text">${this.formatDate(task.createdAt)}</span>
                </td>
                <td class="col-actions">
                    <div class="action-btns">
                        <button class="action-btn-sm" title="查看详情" onclick="event.stopPropagation(); taskManager.openDetail('${task.id}')">
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
                        ${task.images.slice(0, 4).map(img => `<img class="card-image-thumb" src="${img.thumbnail}" alt="图片">`).join('')}
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
                        ${task.dueDate ? `截止: ${task.dueDate}` : this.formatDate(task.createdAt)}
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
        panel.classList.remove('hidden');
        overlay.classList.remove('hidden');
    }

    closeDetail() {
        document.getElementById('detail-panel').classList.add('hidden');
        document.getElementById('detail-overlay').classList.add('hidden');
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
                        <span class="detail-meta-label">截止日期</span>
                        <span class="detail-meta-value">${task.dueDate || '未设置'}</span>
                    </div>
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

            <!-- 图片 -->
            ${task.images && task.images.length > 0 ? `
            <div class="detail-section">
                <div class="detail-section-title">图片附件 (${task.images.length})</div>
                <div class="detail-images">
                    ${task.images.map(img => `
                        <img class="detail-image" src="${img.thumbnail || img.fullImage}" alt="附件图片" 
                             onclick="window.open('${img.fullImage || img.thumbnail}', '_blank')">
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
        const select = document.getElementById('filter-category');
        this.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            select.appendChild(opt);
        });
    }

    getCategoryName(categoryId) {
        const cat = this.categories.find(c => c.id === categoryId);
        return cat ? cat.name : '未分类';
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
