/**
 * 备忘录功能模块
 * 版本: 1.5.0
 * 功能: 提供备忘录的添加、编辑、删除和分类管理功能
 *       支持每日任务管理、截止时间、任务提醒
 */

// 使用全局变量
// import settingsManager from './settings.js';
// import i18nManager from './i18n.js';

class MemoManager {
    constructor() {
        // 存储键
        this.STORAGE_KEY = 'memos';
        this.PANEL_CONFIG_KEY = 'memosPanelConfig';
        this.CATEGORIES_KEY = 'memosCategories';
        this.TAGS_KEY = 'memosTags';
        
        // ImgVault API 配置
        this.IMGVAULT_API = 'https://www.meczyc6.info/imgvault';
        
        // 数据
        this.memos = [];
        // 优先级定义
        this.priorities = [
            { id: "high", name: "高", color: "#ff4757" },
            { id: "medium", name: "中", color: "#ffa502" },
            { id: "low", name: "低", color: "#2ed573" }
        ];
        this.categories = [];
        this.tags = [];
        
        // 排序选项
        this.sortOptions = [
            { 
                id: 'newest', 
                name: '最新的在前', 
                sortFn: (a, b) => b.createdAt - a.createdAt 
            },
            { 
                id: 'oldest', 
                name: '最早的在前', 
                sortFn: (a, b) => a.createdAt - b.createdAt 
            },
            { 
                id: 'dueDate', 
                name: '按截止日期', 
                sortFn: (a, b) => {
                    if (!a.dueDate && !b.dueDate) return 0;
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return new Date(a.dueDate) - new Date(b.dueDate);
                } 
            },
            { 
                id: 'priority', 
                name: '按优先级', 
                sortFn: (a, b) => {
                    const priorityMap = { high: 3, medium: 2, low: 1, none: 0 };
                    return priorityMap[b.priority || 'none'] - priorityMap[a.priority || 'none'];
                }
            },
            { 
                id: 'alphabetical', 
                name: '按字母顺序', 
                sortFn: (a, b) => (a.title || '').localeCompare(b.title || '') 
            }
        ];
        this.currentSortOption = 'newest';
        
        // 面板配置
        this.panelConfig = {
            position: { x: 20, y: 20 },
            size: { width: 300, height: 400 },
            isMinimized: false
        };
        
        // 拖动和调整大小相关
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.startLeft = 0;
        this.startTop = 0;
        this.isResizing = false;
        this.startWidth = 0;
        this.isResizingHeight = false;
        this.startHeight = 0;
        
        // 绑定方法到实例
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleResizeMove = this.handleResizeMove.bind(this);
        this.handleResizeUp = this.handleResizeUp.bind(this);
        this.handleResizeHeightMove = this.handleResizeHeightMove.bind(this);
        this.handleResizeHeightUp = this.handleResizeHeightUp.bind(this);
        
        // 键盘快捷键相关
        this.shortcuts = [];
        this.selectedTaskId = null;
        
        // 初始化状态
        this.initialized = false;

        // 侧边栏折叠态交互
        this._sidebarAutoExpanded = false;
        this._sidebarAutoCollapseTimer = null;
        this._sidebarCollapseUIBound = false;
    }

    /**
     * 初始化备忘录管理器
     * @returns {Promise} 初始化完成的 Promise
     */
    async init() {
        console.log('开始初始化备忘录管理器...');
        
        // 设置全局错误处理，防止未捕获的错误导致崩溃
        this.setupGlobalErrorHandler();
        
        try {
            // 加载备忘录数据（每个加载独立 try-catch，避免单点失败）
            await this.safeLoadData();
            
            console.log('备忘录数据加载完成，开始创建UI');
            console.log('备忘录数量:', this.memos.length);
            console.log('分类数量:', this.categories.length);
            console.log('标签数量:', this.tags.length);
            
            // 检查数据健康状况
            await this.validateAndRepairData();
            
            // 更新每日重复任务状态
            try {
                await this.updateDailyRecurringTasks();
                console.log('每日重复任务状态更新完成');
            } catch (e) {
                console.warn('每日重复任务更新失败:', e);
            }
            
            // 渲染到侧边栏（新的双栏布局）
            try {
                this.renderSidebarContent();
                console.log('侧边栏内容渲染完成');
            } catch (renderError) {
                console.error('侧边栏渲染失败，尝试降级渲染:', renderError);
                this.renderFallbackUI();
            }
            
            // 恢复侧边栏折叠状态
            try {
                await this.restoreSidebarState();
            } catch (e) {
                console.warn('恢复侧边栏状态失败:', e);
            }

            // 折叠态：左侧抽出按钮 + 靠近自动展开/远离自动收起
            try {
                this.ensureSidebarCollapseUI();
            } catch (e) {
                console.warn('折叠UI初始化失败:', e);
            }
            
            // 初始化键盘快捷键
            try {
                this.initKeyboardShortcuts();
                console.log('键盘快捷键初始化完成');
            } catch (e) {
                console.warn('键盘快捷键初始化失败:', e);
            }
            
            // 更新排序选项的名称
            try {
                this.updateSortOptionNames();
                console.log('排序选项名称更新完成');
            } catch (e) {
                console.warn('排序选项名称更新失败:', e);
            }
            
            console.log('备忘录管理器初始化完成');
            this.initialized = true;
            
            // 通知其他模块（如 TaskTicker）数据已就绪
            window.dispatchEvent(new CustomEvent('memoManagerReady'));
            
            // 检查备份提醒
            this.checkBackupReminder();

            // 初始化今日推荐阅读
            try {
                this.initReadingRecommendation();
            } catch (e) {
                console.warn('今日推荐阅读初始化失败:', e);
            }
            
            return true;
        } catch (error) {
            console.error('备忘录初始化失败:', error);
            // 即使失败也标记为已初始化，避免重复初始化
            this.initialized = true;
            this.renderFallbackUI();
            return false;
        }
    }
    
    /**
     * 设置全局错误处理器
     */
    setupGlobalErrorHandler() {
        // 防止重复设置
        if (this._errorHandlerSetup) return;
        this._errorHandlerSetup = true;
        
        // 捕获未处理的 Promise 错误
        window.addEventListener('unhandledrejection', (event) => {
            console.error('未处理的 Promise 错误:', event.reason);
            // 阻止默认行为（避免控制台报错）
            event.preventDefault();
        });
        
        // 捕获全局错误
        window.addEventListener('error', (event) => {
            // 只处理来自 memo.js 的错误
            if (event.filename && event.filename.includes('memo.js')) {
                console.error('备忘录模块错误:', event.message);
                event.preventDefault();
            }
        });
    }
    
    /**
     * 安全加载数据
     */
    async safeLoadData() {
        // 使用 Promise.allSettled 替代 Promise.all，避免单个失败导致全部失败
        const results = await Promise.allSettled([
            this.loadMemos(),
            this.loadCategories(),
            this.loadTags()
        ]);
        
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const names = ['备忘录', '分类', '标签'];
                console.error(`加载${names[index]}失败:`, result.reason);
            }
        });
    }
    
    /**
     * 验证并修复数据
     */
    async validateAndRepairData() {
        let needsSave = false;
        
        // 检查并修复损坏的数据
        this.memos = this.memos.filter(memo => {
            // 过滤掉无效数据
            if (!memo || typeof memo !== 'object') {
                console.warn('发现无效备忘录数据，已过滤');
                needsSave = true;
                return false;
            }
            
            // 确保 ID 存在
            if (!memo.id) {
                memo.id = this.generateId();
                needsSave = true;
            }
            
            // 确保必要字段存在
            memo.title = memo.title || '';
            memo.text = memo.text || '';
            memo.completed = !!memo.completed;
            memo.createdAt = memo.createdAt || Date.now();
            memo.updatedAt = memo.updatedAt || Date.now();
            
            // 进度字段迁移（v1.6.0 新增）
            // progress: number (0-100 百分比) 或 null
            if (memo.progress !== undefined && memo.progress !== null) {
                // 兼容旧格式 { current, total } 转换为纯百分比
                if (typeof memo.progress === 'object' && memo.progress.total) {
                    memo.progress = Math.round((memo.progress.current / memo.progress.total) * 100);
                }
                // 确保是 0-100 的数字
                memo.progress = Math.max(0, Math.min(100, parseInt(memo.progress) || 0));
            }
            
            // 检查图片数据是否损坏
            if (memo.images && Array.isArray(memo.images)) {
                memo.images = memo.images.filter(img => {
                    // 过滤掉损坏的图片数据（兼容 ImgVault 新格式和 base64 旧格式）
                    if (!img || (!img.thumbnail && !img.fullImage && !img.imageId)) {
                        console.warn('发现损坏的图片数据，已过滤');
                        needsSave = true;
                        return false;
                    }
                    return true;
                });
            }
            
            // 习惯任务数据完整性检查
            if (memo.recurrence?.enabled && memo.recurrence?.type === 'daily') {
                if (!memo.habit) {
                    memo.habit = {
                        streak: 0,
                        bestStreak: 0,
                        completedDates: [],
                        totalCompletions: 0
                    };
                    needsSave = true;
                }
                // 确保 completedDates 是数组
                if (!Array.isArray(memo.habit.completedDates)) {
                    memo.habit.completedDates = [];
                    needsSave = true;
                }
                // 确保 habitCard 存在
                if (!memo.habitCard) {
                    memo.habitCard = { icon: '📋', color: '#4caf50' };
                    needsSave = true;
                }
            }
            
            // 兼容旧 isDaily 标记迁移
            if (memo.isDaily && !memo.recurrence) {
                memo.recurrence = {
                    enabled: true,
                    type: 'daily',
                    interval: 1,
                    weekDays: null,
                    monthDay: null,
                    endDate: null
                };
                memo.habit = memo.habit || {
                    streak: 0,
                    bestStreak: 0,
                    completedDates: [],
                    totalCompletions: 0
                };
                memo.habitCard = memo.habitCard || { icon: '📋', color: '#4caf50' };
                delete memo.isDaily;
                needsSave = true;
            }
            
            return true;
        });
        
        if (needsSave) {
            console.log('数据已修复，保存中...');
            await this.saveMemos();
        }
    }
    
    /**
     * 降级 UI 渲染
     */
    renderFallbackUI() {
        const sidebarContent = document.getElementById('sidebar-content');
        if (sidebarContent) {
            sidebarContent.innerHTML = `
                <div class="sidebar-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>任务列表加载出现问题</p>
                    <button class="fallback-reload-btn">重新加载</button>
                </div>
            `;
            const reloadBtn = sidebarContent.querySelector('.fallback-reload-btn');
            if (reloadBtn) {
                reloadBtn.addEventListener('click', () => window.memoManager.init());
            }
        }
    }
    
    /**
     * 渲染侧边栏内容（新的双栏布局）
     */
    renderSidebarContent() {
        const sidebarContent = document.getElementById('sidebar-content');
        if (!sidebarContent) {
            console.warn('未找到侧边栏容器，回退到悬浮面板模式');
            this.createMemoUI();
            return;
        }
        
        // 清空现有内容
        sidebarContent.innerHTML = '';
        
        // 创建工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'sidebar-toolbar';
        toolbar.innerHTML = `
            <input type="text" class="sidebar-search" id="sidebar-search" placeholder="搜索任务...">
            <button class="sidebar-add-btn" id="sidebar-add-btn" title="新增任务">
                <i class="fas fa-plus"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-pomodoro-btn" title="番茄钟">
                <i class="fas fa-clock"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-stats-btn" title="统计分析">
                <i class="fas fa-chart-line"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-calendar-btn" title="日历 / 回看完成">
                <i class="fas fa-calendar-days"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-weekly-btn" title="周回顾">
                <i class="fas fa-calendar-week"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-bookmark-btn" title="书签检索">
                <i class="fas fa-bookmark"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-backup-btn" title="备份与恢复">
                <i class="fas fa-cloud-download-alt"></i>
            </button>
            <button class="sidebar-tool-btn" id="sidebar-about-btn" title="关于与帮助">
                <i class="fas fa-info-circle"></i>
            </button>
            <button class="sidebar-settings-btn" id="sidebar-settings-btn" title="管理分类">
                <i class="fas fa-cog"></i>
            </button>
        `;
        
        // 创建筛选器
        const filterBar = document.createElement('div');
        filterBar.className = 'sidebar-filter';
        filterBar.innerHTML = `
            <select class="sidebar-filter-select" id="sidebar-filter-select">
                <option value="all">全部任务</option>
                <option value="uncompleted">未完成</option>
                <option value="completed">已完成</option>
                <option value="today">今日</option>
                <option value="overdue">已过期</option>
                <option value="habits">每日习惯</option>
            </select>
            <div class="sidebar-category-combobox-wrap" id="sidebar-category-combobox-wrap"></div>
            <div class="sidebar-priority-filter" id="sidebar-priority-filter" title="按优先级筛选">
                <button type="button" class="sidebar-priority-btn active" data-priority="all" title="全部">全部</button>
                <button type="button" class="sidebar-priority-btn priority-high" data-priority="high" title="高优先级"></button>
                <button type="button" class="sidebar-priority-btn priority-medium" data-priority="medium" title="中优先级"></button>
                <button type="button" class="sidebar-priority-btn priority-low" data-priority="low" title="低优先级"></button>
                <button type="button" class="sidebar-priority-btn priority-none" data-priority="none" title="无优先级"></button>
            </div>
            <button class="sidebar-expand-all-btn" id="sidebar-expand-all-btn" title="展开全部分组">
                <i class="fas fa-angles-down"></i>
            </button>
        `;
        
        // 创建任务列表容器
        const taskList = document.createElement('div');
        taskList.className = 'sidebar-task-list';
        taskList.id = 'sidebar-task-list';
        
        // 创建任务表单弹窗（标签页式布局）
        const formModal = document.createElement('div');
        formModal.className = 'sidebar-form-modal hidden';
        formModal.id = 'sidebar-form-modal';
        formModal.innerHTML = `
            <div class="sidebar-form-content">
                <div class="sidebar-form-header">
                    <h3 id="sidebar-form-title">新增任务</h3>
                    <button class="sidebar-form-close" id="sidebar-form-close">&times;</button>
                </div>
                <div class="sidebar-form-tabs" role="tablist">
                    <button class="sidebar-form-tab active" data-form-tab="basic" role="tab" aria-selected="true" aria-controls="form-tab-basic"><i class="fas fa-edit"></i> 基本信息</button>
                    <button class="sidebar-form-tab" data-form-tab="schedule" role="tab" aria-selected="false" aria-controls="form-tab-schedule"><i class="fas fa-clock"></i> 时间与进度</button>
                    <button class="sidebar-form-tab" data-form-tab="extra" role="tab" aria-selected="false" aria-controls="form-tab-extra"><i class="fas fa-paperclip"></i> 附件与子任务</button>
                </div>
                <div class="sidebar-form-body">
                    <!-- Tab 1: 基本信息 -->
                    <div class="sidebar-form-tab-panel active" id="form-tab-basic" role="tabpanel">
                        <div class="form-group">
                            <label for="sidebar-task-title">标题 <span class="required">*</span></label>
                            <input type="text" id="sidebar-task-title" placeholder="输入任务标题..." required>
                        </div>
                        <div class="form-group">
                            <label for="sidebar-task-text">详情</label>
                            <textarea id="sidebar-task-text" placeholder="输入任务详情..." rows="4"></textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label for="sidebar-task-category-wrap">分类</label>
                                <div id="sidebar-task-category-wrap" class="sidebar-task-category-wrap"></div>
                            </div>
                            <div class="form-group">
                                <label for="sidebar-task-priority">优先级</label>
                                <select id="sidebar-task-priority">
                                    <option value="none">无</option>
                                    <option value="low">低</option>
                                    <option value="medium">中</option>
                                    <option value="high">高</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 2: 时间与进度 -->
                    <div class="sidebar-form-tab-panel" id="form-tab-schedule" role="tabpanel">
                        <div class="form-row">
                            <div class="form-group">
                                <label for="sidebar-task-start">开始日期 <span style="opacity:0.5;font-size:0.75em;">可选</span></label>
                                <input type="date" id="sidebar-task-start" placeholder="默认使用创建日期">
                            </div>
                            <div class="form-group">
                                <label for="sidebar-task-due">截止日期</label>
                                <input type="date" id="sidebar-task-due">
                            </div>
                        </div>
                        <div class="form-group task-duration-hint" id="task-duration-hint" style="display:none;">
                            <span class="duration-text"></span>
                        </div>
                        <div class="form-group recurrence-group">
                            <label for="sidebar-task-recurrence">重复类型</label>
                            <div class="recurrence-row">
                                <select id="sidebar-task-recurrence">
                                    <option value="none">不重复</option>
                                    <option value="daily">每日重复</option>
                                </select>
                                <input type="text" id="sidebar-task-habit-icon" class="habit-icon-input" placeholder="📋" maxlength="2" title="习惯图标（emoji）">
                            </div>
                        </div>
                        <div class="form-group progress-group">
                            <label>
                                <input type="checkbox" id="sidebar-task-progress-enable">
                                启用进度追踪
                            </label>
                            <div class="progress-inputs hidden" id="progress-inputs">
                                <div class="progress-slider-row">
                                    <input type="range" id="sidebar-task-progress-slider" 
                                           min="0" max="100" value="0" step="1" class="progress-slider">
                                    <div class="progress-percent-input">
                                        <input type="number" id="sidebar-task-progress-percent" 
                                               min="0" max="100" value="0" class="progress-number-input">
                                        <span class="percent-sign">%</span>
                                    </div>
                                </div>
                                <div class="progress-preview">
                                    <div class="progress-preview-bar">
                                        <div class="progress-preview-fill" id="progress-preview-fill" style="width: 0%"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 3: 附件与子任务 -->
                    <div class="sidebar-form-tab-panel" id="form-tab-extra" role="tabpanel">
                        <div class="form-group">
                            <label>图片附件</label>
                            <div class="image-upload-area" id="image-upload-area">
                                <input type="file" id="sidebar-task-images" accept="image/*" multiple hidden>
                                <div class="image-upload-batch-progress hidden" id="image-upload-batch-progress">
                                    <div class="image-upload-batch-bar"><div class="image-upload-batch-fill" id="image-upload-batch-fill"></div></div>
                                    <span class="image-upload-batch-text" id="image-upload-batch-text">0 / 0</span>
                                </div>
                                <div class="image-preview-list" id="image-preview-list"></div>
                                <button type="button" class="image-upload-btn" id="image-upload-btn">
                                    <i class="fas fa-image"></i>
                                    <span>添加图片</span>
                                    <span class="image-upload-hint">支持拖拽、粘贴，可多选</span>
                                </button>
                            </div>
                        </div>
                        <div class="form-group links-group">
                            <label>相关链接</label>
                            <div class="links-list" id="sidebar-task-links-list"></div>
                            <div class="link-add-row">
                                <input type="text" id="sidebar-link-title-input" placeholder="链接标题（可选）" class="link-input-title">
                                <input type="url" id="sidebar-link-url-input" placeholder="https://..." class="link-input-url">
                                <button type="button" class="link-add-btn" id="sidebar-link-add-btn" title="添加链接">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                        <div class="form-group subtasks-group">
                            <label>子任务 <span class="subtask-count-label" id="subtask-count-label"></span></label>
                            <div class="subtasks-edit-list" id="subtasks-edit-list"></div>
                            <div class="subtask-add-row">
                                <input type="text" id="subtask-add-input" placeholder="添加子任务..." class="subtask-add-input">
                                <button type="button" class="subtask-add-btn" id="subtask-add-btn" title="添加子任务">
                                    <i class="fas fa-plus"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="sidebar-form-footer">
                    <div class="sidebar-form-status" id="sidebar-form-status"></div>
                    <div class="sidebar-form-actions">
                        <button class="btn-cancel" id="sidebar-form-cancel">取消</button>
                        <button class="btn-save" id="sidebar-form-save">保存</button>
                    </div>
                </div>
            </div>
        `;
        
        // 组装内容
        sidebarContent.appendChild(toolbar);
        sidebarContent.appendChild(filterBar);
        sidebarContent.appendChild(taskList);
        sidebarContent.appendChild(formModal);
        
        // 创建分类 Combobox（侧边栏筛选 + 表单）
        const sidebarCatWrap = document.getElementById('sidebar-category-combobox-wrap');
        if (sidebarCatWrap) {
            this._sidebarCategoryCombobox = this.createCategoryCombobox(sidebarCatWrap, {
                value: 'all',
                placeholder: '全部分类',
                allowAll: true,
                onChange: () => this.renderSidebarTaskList()
            });
        }
        const formCatWrap = document.getElementById('sidebar-task-category-wrap');
        if (formCatWrap) {
            this._formCategoryCombobox = this.createCategoryCombobox(formCatWrap, {
                value: '',
                placeholder: '无分类',
                allowAll: false,
                onChange: () => {}
            });
        }
        
        // 绑定事件
        this.bindSidebarEvents();
        
        // 渲染任务列表
        this.renderSidebarTaskList();
    }
    
    /**
     * 绑定侧边栏事件
     */
    bindSidebarEvents() {
        // 搜索
        const searchInput = document.getElementById('sidebar-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderSidebarTaskList());
        }
        
        // 筛选
        const filterSelect = document.getElementById('sidebar-filter-select');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => this.renderSidebarTaskList());
        }
        
        // 分类筛选（使用 Combobox，onChange 已在创建时绑定）
        
        // 优先级筛选
        const priorityFilter = document.getElementById('sidebar-priority-filter');
        if (priorityFilter) {
            priorityFilter.querySelectorAll('.sidebar-priority-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    priorityFilter.querySelectorAll('.sidebar-priority-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderSidebarTaskList();
                });
            });
        }
        
        // 展开全部/折叠全部按钮
        const expandAllBtn = document.getElementById('sidebar-expand-all-btn');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => this.toggleExpandAllGroups());
        }
        
        // 新增按钮
        const addBtn = document.getElementById('sidebar-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.showSidebarForm());
        }
        
        // 番茄钟按钮
        const pomodoroBtn = document.getElementById('sidebar-pomodoro-btn');
        if (pomodoroBtn) {
            pomodoroBtn.addEventListener('click', () => this.showPomodoroTimer());
        }
        
        // 统计按钮
        const statsBtn = document.getElementById('sidebar-stats-btn');
        if (statsBtn) {
            statsBtn.addEventListener('click', () => this.showTaskStatistics());
        }

        // 日历按钮
        const calendarBtn = document.getElementById('sidebar-calendar-btn');
        if (calendarBtn) {
            calendarBtn.addEventListener('click', () => this.showCalendarPanel());
        }
        
        // 周回顾按钮
        const weeklyBtn = document.getElementById('sidebar-weekly-btn');
        if (weeklyBtn) {
            weeklyBtn.addEventListener('click', () => this.showWeeklyReviewPanel());
        }
        
        // 书签检索按钮
        const bookmarkBtn = document.getElementById('sidebar-bookmark-btn');
        if (bookmarkBtn) {
            bookmarkBtn.addEventListener('click', () => this.showBookmarkPanel());
        }
        
        // 备份与恢复按钮
        const backupBtn = document.getElementById('sidebar-backup-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => this.showBackupPanel());
        }
        
        // 关于与帮助按钮
        const aboutBtn = document.getElementById('sidebar-about-btn');
        if (aboutBtn) {
            aboutBtn.addEventListener('click', () => this.showAboutPanel());
        }
        
        // 设置按钮（分类管理）
        const settingsBtn = document.getElementById('sidebar-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.showCategoryManager());
        }
        
        // 表单标签页切换
        document.querySelectorAll('.sidebar-form-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.sidebar-form-tab').forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                document.querySelectorAll('.sidebar-form-tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                const panelId = 'form-tab-' + tab.dataset.formTab;
                const panel = document.getElementById(panelId);
                if (panel) panel.classList.add('active');
            });
        });
        
        // 表单关闭
        const closeBtn = document.getElementById('sidebar-form-close');
        const cancelBtn = document.getElementById('sidebar-form-cancel');
        if (closeBtn) closeBtn.addEventListener('click', () => this.hideSidebarForm());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideSidebarForm());
        
        // 表单保存
        const saveBtn = document.getElementById('sidebar-form-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSidebarTask());
        }
        
        // 表单回车保存
        const titleInput = document.getElementById('sidebar-task-title');
        if (titleInput) {
            titleInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveSidebarTask();
                }
            });
        }
        
        // 开始/截止日期 → 自动更新工期提示
        const startDateInput = document.getElementById('sidebar-task-start');
        const dueDateInput = document.getElementById('sidebar-task-due');
        if (startDateInput) startDateInput.addEventListener('change', () => this._updateDurationHint());
        if (dueDateInput) dueDateInput.addEventListener('change', () => this._updateDurationHint());
        
        // 重复类型选择器
        const recurrenceSelect = document.getElementById('sidebar-task-recurrence');
        if (recurrenceSelect) {
            recurrenceSelect.addEventListener('change', () => {
                this.toggleHabitIconVisibility(recurrenceSelect.value);
            });
        }
        
        // 进度追踪开关
        const progressEnable = document.getElementById('sidebar-task-progress-enable');
        const progressInputs = document.getElementById('progress-inputs');
        if (progressEnable && progressInputs) {
            progressEnable.addEventListener('change', () => {
                progressInputs.classList.toggle('hidden', !progressEnable.checked);
                if (progressEnable.checked) {
                    this.updateProgressPreview();
                }
            });
        }
        
        // 进度滑块拖动
        const progressSlider = document.getElementById('sidebar-task-progress-slider');
        const progressPercent = document.getElementById('sidebar-task-progress-percent');
        if (progressSlider) {
            progressSlider.addEventListener('input', () => this.updateProgressFromSlider());
        }
        
        // 进度百分比输入
        if (progressPercent) {
            progressPercent.addEventListener('input', () => this.updateProgressFromPercent());
            // 失去焦点时确保值在有效范围内
            progressPercent.addEventListener('blur', () => {
                let value = parseInt(progressPercent.value) || 0;
                value = Math.max(0, Math.min(100, value));
                progressPercent.value = value;
                this.updateProgressFromPercent();
            });
        }
        
        // 点击遮罩关闭
        const modal = document.getElementById('sidebar-form-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideSidebarForm();
            });
        }
        
        // 侧边栏折叠按钮
        const collapseBtn = document.getElementById('sidebar-collapse-btn');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => this.toggleSidebar());
        }
        
        // 图片上传：点击、拖拽、粘贴
        const imageUploadBtn = document.getElementById('image-upload-btn');
        const imageInput = document.getElementById('sidebar-task-images');
        const imageUploadArea = document.getElementById('image-upload-area');
        if (imageUploadBtn && imageInput) {
            imageUploadBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
        if (imageUploadArea) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
                imageUploadArea.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            });
            imageUploadArea.addEventListener('dragenter', () => imageUploadArea.classList.add('image-upload-dragover'));
            imageUploadArea.addEventListener('dragover', () => imageUploadArea.classList.add('image-upload-dragover'));
            imageUploadArea.addEventListener('dragleave', (e) => {
                if (!imageUploadArea.contains(e.relatedTarget)) imageUploadArea.classList.remove('image-upload-dragover');
            });
            imageUploadArea.addEventListener('drop', (e) => {
                imageUploadArea.classList.remove('image-upload-dragover');
                const files = e.dataTransfer && e.dataTransfer.files;
                if (files && files.length) this.handleImageFiles(Array.from(files));
            });
        }
        const formModal = document.getElementById('sidebar-form-modal');
        if (formModal) {
            formModal.addEventListener('paste', (e) => {
                const items = e.clipboardData && e.clipboardData.items;
                if (!items) return;
                const files = [];
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) files.push(items[i].getAsFile());
                }
                if (files.length) {
                    e.preventDefault();
                    this.handleImageFiles(files.filter(Boolean));
                }
            });
        }
        
        // 链接添加按钮
        const linkAddBtn = document.getElementById('sidebar-link-add-btn');
        if (linkAddBtn) {
            linkAddBtn.addEventListener('click', () => this.addTempLink());
        }
        // 链接URL输入框回车添加
        const linkUrlInput = document.getElementById('sidebar-link-url-input');
        if (linkUrlInput) {
            linkUrlInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.addTempLink();
                }
            });
        }
        
        // 子任务添加按钮
        const subtaskAddBtn = document.getElementById('subtask-add-btn');
        if (subtaskAddBtn) {
            subtaskAddBtn.addEventListener('click', () => {
                const input = document.getElementById('subtask-add-input');
                if (input && input.value.trim()) {
                    this.addSubtask(input.value);
                    input.value = '';
                    input.focus();
                }
            });
        }
        // 子任务输入框回车添加
        const subtaskInput = document.getElementById('subtask-add-input');
        if (subtaskInput) {
            subtaskInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    if (subtaskInput.value.trim()) {
                        this.addSubtask(subtaskInput.value);
                        subtaskInput.value = '';
                    }
                }
            });
        }
    }
    
    /**
     * 处理图片上传 - 使用 ImgVault API 上传，仅存储 imageId/UUID；支持批量进度与失败重试
     */
    handleImageUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        this.handleImageFiles(Array.from(files));
        event.target.value = '';
    }
    
    /**
     * 处理多张图片（来自选择/拖拽/粘贴），带批量进度
     */
    async handleImageFiles(files) {
        const imageFiles = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        
        const previewList = document.getElementById('image-preview-list');
        const batchProgress = document.getElementById('image-upload-batch-progress');
        const batchFill = document.getElementById('image-upload-batch-fill');
        const batchText = document.getElementById('image-upload-batch-text');
        if (!previewList) return;
        
        if (!this.tempImages) this.tempImages = [];
        const total = imageFiles.length;
        let done = 0;
        if (total > 1 && batchProgress && batchFill && batchText) {
            batchProgress.classList.remove('hidden');
            batchFill.style.width = '0%';
            batchText.textContent = `0 / ${total}`;
        }
        
        const updateProgress = () => {
            done++;
            if (batchFill) batchFill.style.width = `${(done / total) * 100}%`;
            if (batchText) batchText.textContent = `${done} / ${total}`;
            if (done === total && batchProgress) {
                batchProgress.classList.add('hidden');
                if (batchFill) batchFill.style.width = '0%';
            }
        };
        
        for (const file of imageFiles) {
            if (file.size > 50 * 1024 * 1024) {
                console.warn('图片文件过大，已跳过:', file.name);
                updateProgress();
                continue;
            }
            const imageId = this.generateId();
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item uploading';
            previewItem.dataset.imageId = imageId;
            previewItem.innerHTML = `
                <div class="image-upload-progress">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <button type="button" class="remove-image" title="移除">
                    <i class="fas fa-times"></i>
                </button>
            `;
            previewItem.querySelector('.remove-image').addEventListener('click', () => {
                this.removePreviewImage(imageId);
            });
            previewList.appendChild(previewItem);
            
            try {
                const uploadResult = await this.uploadToImgVault(file);
                if (uploadResult) {
                    const thumbnailUrl = this.getImgVaultProcessUrl(uploadResult.id, { width: 80, height: 80, format: 'webp', quality: 60 });
                    this.tempImages.push({
                        id: imageId,
                        imageId: uploadResult.id,
                        imageUuid: uploadResult.imageUuid,
                        originalName: uploadResult.originalName || file.name,
                        thumbnailUrl: thumbnailUrl
                    });
                    previewItem.classList.remove('uploading');
                    previewItem.innerHTML = `
                        <img src="${thumbnailUrl}" alt="预览">
                        <button type="button" class="remove-image" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    this.bindImageErrorFallback(previewItem.querySelector('img'));
                    previewItem.querySelector('.remove-image').addEventListener('click', () => this.removePreviewImage(imageId));
                } else {
                    const thumbnail = await this.compressImage(file, 80, 0.6);
                    const fullImage = await this.compressImage(file, 800, 0.85);
                    this.tempImages.push({ id: imageId, thumbnail, fullImage: fullImage });
                    previewItem.classList.remove('uploading');
                    previewItem.innerHTML = `
                        <img src="${thumbnail}" alt="预览">
                        <button type="button" class="remove-image" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    previewItem.querySelector('.remove-image').addEventListener('click', () => this.removePreviewImage(imageId));
                }
            } catch (err) {
                console.error('图片处理失败:', err);
                previewItem.classList.remove('uploading');
                previewItem.classList.add('upload-failed');
                previewItem.innerHTML = `
                    <span class="upload-failed-label">上传失败</span>
                    <button type="button" class="upload-retry-btn" title="重新选择该图片">
                        <i class="fas fa-redo"></i> 重试
                    </button>
                    <button type="button" class="remove-image" title="移除">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                previewItem.querySelector('.remove-image').addEventListener('click', () => this.removePreviewImage(imageId));
                previewItem.querySelector('.upload-retry-btn').addEventListener('click', () => {
                    const input = document.getElementById('sidebar-task-images');
                    if (input) {
                        input.click();
                        previewItem.remove();
                    }
                });
            }
            updateProgress();
        }
    }
    
    /**
     * 上传图片到 ImgVault API
     * @param {File} file 图片文件
     * @returns {Object|null} 上传结果 {id, imageUuid, originalName, downloadUrl} 或 null
     */
    async uploadToImgVault(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const resp = await fetch(`${this.IMGVAULT_API}/api/v1/images/upload`, {
                method: 'POST',
                body: formData
            });
            
            if (!resp.ok) {
                console.error('ImgVault upload failed:', resp.status, resp.statusText);
                return null;
            }
            
            const result = await resp.json();
            if (result.code === 200 && result.data) {
                console.log('ImgVault 上传成功:', result.data.imageUuid);
                return result.data;
            }
            console.error('ImgVault upload response error:', result);
            return null;
        } catch (err) {
            console.error('ImgVault upload error:', err);
            return null;
        }
    }
    
    /**
     * 获取 ImgVault 图片处理 URL（缩略图/格式转换）
     * @param {number} imgId ImgVault 图片 ID
     * @param {Object} opts {width, height, format, quality, smartCrop}
     * @returns {string} 处理后的图片 URL
     */
    getImgVaultProcessUrl(imgId, opts = {}) {
        const params = new URLSearchParams();
        if (opts.width) params.set('width', opts.width);
        if (opts.height) params.set('height', opts.height);
        if (opts.format) params.set('format', opts.format);
        if (opts.quality) params.set('quality', opts.quality);
        if (opts.smartCrop) params.set('smartCrop', 'true');
        return `${this.IMGVAULT_API}/api/v1/images/${imgId}/process?${params}`;
    }
    
    /**
     * 获取 ImgVault 图片下载 URL（原图查看）
     * @param {number} imgId ImgVault 图片 ID
     * @returns {string} 下载重定向 URL
     */
    getImgVaultDownloadUrl(imgId) {
        return `${this.IMGVAULT_API}/api/v1/images/${imgId}/download`;
    }
    
    /**
     * 获取图片的缩略图 URL（兼容新旧格式）
     * @param {Object} img 图片对象
     * @returns {string} 缩略图 URL
     */
    getImageThumbnail(img) {
        // 新格式：ImgVault API
        if (img.imageId) {
            return img.thumbnailUrl || this.getImgVaultProcessUrl(img.imageId, { width: 80, height: 80, format: 'webp', quality: 60 });
        }
        // 旧格式：base64
        return img.thumbnail || '';
    }
    
    /**
     * 获取图片的原图 URL（兼容新旧格式）
     * @param {Object} img 图片对象
     * @returns {string} 原图 URL
     */
    getImageFullUrl(img) {
        // 新格式：ImgVault API
        if (img.imageId) {
            return this.getImgVaultDownloadUrl(img.imageId);
        }
        // 旧格式：base64
        return img.fullImage || img.thumbnail || '';
    }
    
    /**
     * 为 img 元素绑定 error 回退（避免内联 onerror 违反 CSP）
     * @param {HTMLImageElement} imgEl img DOM 元素
     */
    bindImageErrorFallback(imgEl) {
        if (!imgEl) return;
        imgEl.addEventListener('error', () => {
            imgEl.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect fill='%23333' width='80' height='80'/%3E%3Ctext x='40' y='44' text-anchor='middle' fill='%23999' font-size='12'%3E图片%3C/text%3E%3C/svg%3E";
        }, { once: true });
    }

    /**
     * 压缩图片
     */
    compressImage(file, maxSize, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // 计算缩放比例
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height / width) * maxSize;
                            width = maxSize;
                        } else {
                            width = (width / height) * maxSize;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    /**
     * 移除预览图片
     */
    removePreviewImage(imageId) {
        // 从临时数组移除
        if (this.tempImages) {
            this.tempImages = this.tempImages.filter(img => img.id !== imageId);
        }
        
        // 从 DOM 移除
        const previewItem = document.querySelector(`.image-preview-item[data-image-id="${imageId}"]`);
        if (previewItem) {
            previewItem.remove();
        }
    }
    
    /**
     * 渲染侧边栏任务列表（带防抖）
     */
    renderSidebarTaskList() {
        // 防抖：避免频繁渲染导致的性能问题和潜在崩溃
        if (this._renderDebounceTimer) {
            clearTimeout(this._renderDebounceTimer);
        }
        
        this._renderDebounceTimer = setTimeout(() => {
            this._doRenderSidebarTaskList();
            this._updateUrgentBubble();
        }, 16);
    }
    
    /**
     * 实际执行侧边栏任务列表渲染
     */
    _doRenderSidebarTaskList() {
        const container = document.getElementById('sidebar-task-list');
        if (!container) return;
        
        const searchInput = document.getElementById('sidebar-search');
        const filterSelect = document.getElementById('sidebar-filter-select');
        
        const priorityActive = document.querySelector('#sidebar-priority-filter .sidebar-priority-btn.active');
        const priorityValue = priorityActive ? priorityActive.dataset.priority : 'all';
        const categoryValue = this._sidebarCategoryCombobox ? this._sidebarCategoryCombobox.getValue() : 'all';
        
        const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filterValue = filterSelect ? filterSelect.value : 'all';
        
        // 筛选任务
        let filteredMemos = [...this.memos];
        
        // 文本搜索
        if (searchText) {
            filteredMemos = filteredMemos.filter(memo => 
                (memo.title || '').toLowerCase().includes(searchText) ||
                (memo.text || '').toLowerCase().includes(searchText)
            );
        }
        
        // 分类筛选（选择一级分类时包含其所有子分类）
        if (categoryValue !== 'all') {
            const matchIds = this._getCategoryAndChildIds(categoryValue);
            filteredMemos = filteredMemos.filter(m => matchIds.includes(m.categoryId));
        }
        
        // 优先级筛选
        if (priorityValue !== 'all') {
            filteredMemos = filteredMemos.filter(m => (m.priority || 'none') === priorityValue);
        }
        
        // 状态筛选
        const today = this.getTodayDate();
        switch (filterValue) {
            case 'completed':
                filteredMemos = filteredMemos.filter(m => m.completed);
                break;
            case 'uncompleted':
                filteredMemos = filteredMemos.filter(m => !m.completed);
                break;
            case 'today':
                filteredMemos = filteredMemos.filter(m => m.dueDate === today);
                break;
            case 'overdue':
                filteredMemos = filteredMemos.filter(m => m.dueDate && m.dueDate < today && !m.completed);
                break;
            case 'habits':
                filteredMemos = filteredMemos.filter(m => m.recurrence?.enabled && m.recurrence?.type === 'daily');
                break;
        }
        
        // 排序
        const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
        filteredMemos.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const pa = priorityOrder[a.priority] ?? 3;
            const pb = priorityOrder[b.priority] ?? 3;
            if (pa !== pb) return pa - pb;
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return b.createdAt - a.createdAt;
        });
        
        // 计算统计数据
        const totalTasks = this.memos.length;
        const completedTasks = this.memos.filter(m => m.completed).length;
        const filteredCount = filteredMemos.length;
        
        // 更新任务统计显示
        this.updateTaskStats(totalTasks, completedTasks, filteredCount);
        
        // 分离习惯任务和普通任务
        const habitTasks = filteredMemos.filter(m => m.recurrence?.enabled && m.recurrence?.type === 'daily');
        const regularTasks = filteredMemos.filter(m => !(m.recurrence?.enabled && m.recurrence?.type === 'daily'));
        
        // 渲染
        if (filteredMemos.length === 0) {
            // 空状态下隐藏展开按钮
            const expandBtn = document.getElementById('sidebar-expand-all-btn');
            if (expandBtn) expandBtn.style.display = 'none';
            
            // 搜索无结果时，显示快速添加按钮
            if (searchText) {
                container.innerHTML = `
                    <div class="sidebar-empty search-empty">
                        <i class="fas fa-search"></i>
                        <p>没有找到 "${this.escapeHtml(searchText)}"</p>
                        <button class="sidebar-quick-add" id="sidebar-quick-add">
                            <i class="fas fa-plus-circle"></i> 快速创建任务 "${this.escapeHtml(searchText.substring(0, 30))}${searchText.length > 30 ? '...' : ''}"
                        </button>
                    </div>
                `;
                const quickAddBtn = document.getElementById('sidebar-quick-add');
                if (quickAddBtn) {
                    quickAddBtn.addEventListener('click', () => this.quickAddTask(searchText));
                }
            } else {
                container.innerHTML = `
                    <div class="sidebar-empty">
                        <i class="fas fa-clipboard-list"></i>
                        <p>${categoryValue !== 'all' ? '该分类下暂无任务' : '暂无任务'}</p>
                        <button class="sidebar-empty-add" id="sidebar-empty-add">
                            <i class="fas fa-plus"></i> 添加第一个任务
                        </button>
                    </div>
                `;
                const emptyAddBtn = document.getElementById('sidebar-empty-add');
                if (emptyAddBtn) {
                    emptyAddBtn.addEventListener('click', () => this.showSidebarForm());
                }
            }
            return;
        }
        
        container.innerHTML = '';
        
        // 取消/替换上一次的渲染（用于搜索/筛选快速触发）
        this._sidebarRenderToken = (this._sidebarRenderToken || 0) + 1;
        const renderToken = this._sidebarRenderToken;
        
        // ========== 渲染习惯任务分组（折叠式习惯列表） ==========
        if (habitTasks.length > 0) {
            const habitsGroup = this.createHabitGroup(habitTasks, filteredCount, renderToken);
            container.appendChild(habitsGroup);
        }
        
        // ========== 渲染普通任务（按日期分组） ==========
        const tasksToGroup = regularTasks.length > 0 ? regularTasks : [];
        
        if (tasksToGroup.length === 0 && habitTasks.length > 0) {
            // 只有习惯任务，没有普通任务时不需要后续渲染
            return;
        }
        
        if (tasksToGroup.length === 0) return;
        
        // 按日期分组渲染任务
        const groupedTasks = this.groupTasksByDate(tasksToGroup);
        const recentGroups = ['today', 'yesterday', 'two-days-ago']; // 近3天不折叠
        
        // 先渲染分组壳子（标题/折叠），默认折叠的分组不渲染任务项（展开时再懒加载）
        const groupEntries = Object.entries(groupedTasks);
        const eagerGroups = []; // 需要首屏渲染任务的分组（近3天）
        const lazyGroups = [];  // 默认折叠分组：只渲染标题，任务展开时渲染
        
        // 预计算每个分组的起始 index（用于渲染序号稳定）
        let cumulative = habitTasks.length; // 序号从习惯任务之后开始
        groupEntries.forEach(([dateKey, tasks]) => {
            const startIndex = cumulative + 1;
            cumulative += tasks.length;

            // 判断是否应该默认折叠（近3天之外的都折叠）
            const shouldCollapse = !recentGroups.includes(dateKey);
            
            // 创建日期分组
            const group = document.createElement('div');
            group.className = `date-group ${shouldCollapse ? 'collapsed' : ''}`;
            group.dataset.groupKey = dateKey;
            group.dataset.taskCount = tasks.length;
            
            // 创建分组标题（可点击折叠）
            const groupHeader = this.createDateGroupHeader(dateKey, tasks, shouldCollapse);
            group.appendChild(groupHeader);
            
            // 创建任务容器
            const tasksContainer = document.createElement('div');
            tasksContainer.className = 'date-group-tasks';
            if (shouldCollapse) tasksContainer.style.display = 'none';
            
            group.appendChild(tasksContainer);
            container.appendChild(group);
            
            // 绑定折叠事件
            groupHeader.addEventListener('click', () => {
                const isCollapsed = group.classList.toggle('collapsed');
                tasksContainer.style.display = isCollapsed ? 'none' : 'block';
                const chevron = groupHeader.querySelector('.group-chevron');
                if (chevron) chevron.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0)';

                // 懒加载：首次展开时才渲染任务，避免首屏卡顿
                if (!isCollapsed && group.dataset.rendered !== 'true') {
                    group.dataset.rendered = 'true';
                    this.renderTasksIncrementally(tasksContainer, tasks, startIndex, filteredCount, renderToken);
                }
                
                // 更新展开/折叠全部按钮状态和提示
                this._updateExpandAllBtnState();
                this._updateCollapsedHint();
            });

            if (shouldCollapse) {
                lazyGroups.push({ tasks, tasksContainer, startIndex, group });
            } else {
                eagerGroups.push({ tasks, tasksContainer, startIndex });
            }
        });
        
        // 更新展开/折叠按钮状态和折叠提示
        this._updateExpandAllBtnState();
        this._updateCollapsedHint();
        
        // 仅渲染近 3 天的任务（其余分组展开时再渲染）
        const eagerTaskCount = eagerGroups.reduce((sum, g) => sum + g.tasks.length, 0);
        if (eagerTaskCount === 0) return;

        // 小数据量直接同步渲染（更快）
        if (eagerTaskCount <= 120) {
            for (const { tasks, tasksContainer, startIndex } of eagerGroups) {
                const frag = document.createDocumentFragment();
                for (let i = 0; i < tasks.length; i++) {
                    frag.appendChild(this.createSidebarTaskItem(tasks[i], startIndex + i, filteredCount));
                }
                tasksContainer.appendChild(frag);
            }
            return;
        }

        // 大数据量：增量渲染近 3 天分组
        let groupIdx = 0;
        let idxInGroup = 0;
        const CHUNK_SIZE = 20;

        const renderChunk = () => {
            if (this._sidebarRenderToken !== renderToken) return;

            const frameStart = performance.now();
            while (groupIdx < eagerGroups.length) {
                const { tasks, tasksContainer, startIndex } = eagerGroups[groupIdx];
                const frag = document.createDocumentFragment();
                let appended = 0;

                while (idxInGroup < tasks.length && appended < CHUNK_SIZE) {
                    const i = idxInGroup;
                    frag.appendChild(this.createSidebarTaskItem(tasks[i], startIndex + i, filteredCount));
                    idxInGroup++;
                    appended++;
                }

                if (appended > 0) tasksContainer.appendChild(frag);

                if (idxInGroup >= tasks.length) {
                    // 标记首屏分组已渲染
                    const groupEl = tasksContainer.closest('.date-group');
                    if (groupEl) groupEl.dataset.rendered = 'true';

                    groupIdx++;
                    idxInGroup = 0;
                }

                if (performance.now() - frameStart > 12) break;
            }

            if (groupIdx < eagerGroups.length) requestAnimationFrame(renderChunk);
        };

        requestAnimationFrame(renderChunk);
    }

    /**
     * 用于“展开分组时”的增量渲染（懒加载）
     */
    renderTasksIncrementally(tasksContainer, tasks, startIndex, totalCount, renderToken) {
        if (!tasksContainer) return;
        const CHUNK_SIZE = 20;
        let i = 0;

        const renderChunk = () => {
            if (this._sidebarRenderToken !== renderToken) return;
            const frameStart = performance.now();

            while (i < tasks.length) {
                const frag = document.createDocumentFragment();
                let appended = 0;

                while (i < tasks.length && appended < CHUNK_SIZE) {
                    frag.appendChild(this.createSidebarTaskItem(tasks[i], startIndex + i, totalCount));
                    i++;
                    appended++;
                }
                tasksContainer.appendChild(frag);

                if (performance.now() - frameStart > 12) break;
            }

            if (i < tasks.length) requestAnimationFrame(renderChunk);
        };

        requestAnimationFrame(renderChunk);
    }
    
    // ==================== 展开/折叠全部 ====================
    
    /**
     * 切换展开/折叠所有日期分组
     * 智能行为：
     * - 如果存在折叠的分组 → 展开全部
     * - 如果全部已展开 → 折叠非近期分组（恢复默认）
     */
    toggleExpandAllGroups() {
        const container = document.getElementById('sidebar-task-list');
        if (!container) return;
        
        const groups = container.querySelectorAll('.date-group');
        if (groups.length === 0) return;
        
        const collapsedGroups = container.querySelectorAll('.date-group.collapsed');
        const isExpanding = collapsedGroups.length > 0;
        
        const btn = document.getElementById('sidebar-expand-all-btn');
        
        if (isExpanding) {
            // 展开所有折叠的分组
            collapsedGroups.forEach(group => {
                group.classList.remove('collapsed');
                
                const tasksContainer = group.querySelector('.date-group-tasks');
                const chevron = group.querySelector('.group-chevron');
                
                if (tasksContainer) {
                    tasksContainer.style.display = 'block';
                }
                if (chevron) {
                    chevron.style.transform = 'rotate(0)';
                }
                
                // 触发懒加载渲染（如果尚未渲染过）
                if (group.dataset.rendered !== 'true' && tasksContainer) {
                    group.dataset.rendered = 'true';
                    const groupKey = group.dataset.groupKey;
                    this._lazyRenderGroup(group, groupKey);
                }
            });
            
            // 更新按钮状态
            if (btn) {
                btn.title = '折叠全部分组';
                btn.innerHTML = '<i class="fas fa-angles-up"></i>';
                btn.classList.add('expanded');
            }
        } else {
            // 折叠非近期分组（恢复默认：只保留近3天展开）
            const recentGroups = ['today', 'yesterday', 'two-days-ago'];
            groups.forEach(group => {
                const groupKey = group.dataset.groupKey;
                if (!recentGroups.includes(groupKey)) {
                    group.classList.add('collapsed');
                    
                    const tasksContainer = group.querySelector('.date-group-tasks');
                    const chevron = group.querySelector('.group-chevron');
                    
                    if (tasksContainer) tasksContainer.style.display = 'none';
                    if (chevron) chevron.style.transform = 'rotate(-90deg)';
                }
            });
            
            // 更新按钮状态
            if (btn) {
                btn.title = '展开全部分组';
                btn.innerHTML = '<i class="fas fa-angles-down"></i>';
                btn.classList.remove('expanded');
            }
        }
        
        // 更新折叠任务数提示
        this._updateCollapsedHint();
    }
    
    /**
     * 懒加载渲染指定分组中的任务
     */
    _lazyRenderGroup(groupEl, groupKey) {
        if (!groupEl || !groupKey) return;
        
        const tasksContainer = groupEl.querySelector('.date-group-tasks');
        if (!tasksContainer || tasksContainer.children.length > 0) return;
        
        // 从当前筛选数据中获取该分组的任务
        const filterSelect = document.getElementById('sidebar-filter-select');
        const searchInput = document.getElementById('sidebar-search');
        const categoryValue = this._sidebarCategoryCombobox ? this._sidebarCategoryCombobox.getValue() : 'all';
        
        const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filterValue = filterSelect ? filterSelect.value : 'all';
        
        let filteredMemos = [...this.memos];
        
        if (searchText) {
            filteredMemos = filteredMemos.filter(memo => 
                (memo.title || '').toLowerCase().includes(searchText) ||
                (memo.text || '').toLowerCase().includes(searchText)
            );
        }
        if (categoryValue !== 'all') {
            filteredMemos = filteredMemos.filter(m => m.categoryId === categoryValue);
        }
        
        const today = this.getTodayDate();
        switch (filterValue) {
            case 'completed': filteredMemos = filteredMemos.filter(m => m.completed); break;
            case 'uncompleted': filteredMemos = filteredMemos.filter(m => !m.completed); break;
            case 'today': filteredMemos = filteredMemos.filter(m => m.dueDate === today); break;
            case 'overdue': filteredMemos = filteredMemos.filter(m => m.dueDate && m.dueDate < today && !m.completed); break;
            case 'habits': filteredMemos = filteredMemos.filter(m => m.recurrence?.enabled && m.recurrence?.type === 'daily'); break;
        }
        
        // 过滤掉习惯任务
        const regularTasks = filteredMemos.filter(m => !(m.recurrence?.enabled && m.recurrence?.type === 'daily'));
        const groupedTasks = this.groupTasksByDate(regularTasks);
        const tasks = groupedTasks[groupKey];
        
        if (!tasks || tasks.length === 0) return;
        
        const totalCount = filteredMemos.length;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < tasks.length; i++) {
            frag.appendChild(this.createSidebarTaskItem(tasks[i], i + 1, totalCount));
        }
        tasksContainer.appendChild(frag);
    }
    
    /**
     * 更新展开/折叠全部按钮的图标状态
     */
    _updateExpandAllBtnState() {
        const container = document.getElementById('sidebar-task-list');
        const btn = document.getElementById('sidebar-expand-all-btn');
        if (!container || !btn) return;
        
        const groups = container.querySelectorAll('.date-group');
        const collapsedGroups = container.querySelectorAll('.date-group.collapsed');
        
        if (groups.length === 0) {
            btn.style.display = 'none';
            return;
        }
        
        btn.style.display = '';
        
        if (collapsedGroups.length === 0) {
            btn.title = '折叠全部分组';
            btn.innerHTML = '<i class="fas fa-angles-up"></i>';
            btn.classList.add('expanded');
        } else {
            btn.title = '展开全部分组';
            btn.innerHTML = '<i class="fas fa-angles-down"></i>';
            btn.classList.remove('expanded');
        }
    }
    
    /**
     * 更新"折叠分组中隐藏的任务数"提示
     */
    _updateCollapsedHint() {
        const container = document.getElementById('sidebar-task-list');
        if (!container) return;
        
        // 移除旧提示
        const oldHint = container.querySelector('.collapsed-tasks-hint');
        if (oldHint) oldHint.remove();
        
        // 计算折叠分组中的任务数
        const collapsedGroups = container.querySelectorAll('.date-group.collapsed');
        let hiddenCount = 0;
        collapsedGroups.forEach(group => {
            const count = parseInt(group.dataset.taskCount) || 0;
            hiddenCount += count;
        });
        
        if (hiddenCount > 0) {
            const hint = document.createElement('div');
            hint.className = 'collapsed-tasks-hint';
            hint.innerHTML = `
                <i class="fas fa-eye-slash"></i>
                <span>还有 <strong>${hiddenCount}</strong> 个任务在折叠分组中</span>
                <button class="hint-expand-btn" title="展开查看">展开查看</button>
            `;
            container.appendChild(hint);
            
            hint.querySelector('.hint-expand-btn')?.addEventListener('click', () => {
                this.toggleExpandAllGroups();
            });
        }
    }
    
    // ==================== 习惯任务渲染 ====================
    
    /**
     * 创建习惯区域（方案五：顶部卡片 + 折叠详情列表）
     * @param {Array} habits 习惯任务数组
     * @param {number} totalCount 总任务数
     * @param {number} renderToken 渲染令牌
     * @returns {HTMLElement} 习惯区域容器
     */
    createHabitGroup(habits, totalCount, renderToken) {
        const wrapper = document.createElement('div');
        wrapper.className = 'habits-section';
        
        const today = this.getTodayDate();
        
        // 计算习惯统计
        const todayCompleted = habits.filter(h => h.habit?.completedDates?.includes(today)).length;
        const maxStreak = Math.max(0, ...habits.map(h => h.habit?.streak || 0));
        const allDone = todayCompleted === habits.length && habits.length > 0;
        
        // ===== 1. 顶部标题栏 =====
        const header = document.createElement('div');
        header.className = 'habits-section-header';
        header.innerHTML = `
            <div class="habits-section-title">
                <i class="fas fa-fire habits-fire-icon"></i>
                <span>每日习惯</span>
                <span class="habits-progress-badge ${allDone ? 'all-done' : ''}">${todayCompleted}/${habits.length}</span>
            </div>
            <div class="habits-section-actions">
                ${maxStreak > 0 ? `<span class="habits-max-streak"><span class="streak-fire">🔥</span>${maxStreak}天</span>` : ''}
                <button class="habits-add-btn-mini" title="添加习惯"><i class="fas fa-plus"></i></button>
            </div>
        `;
        header.querySelector('.habits-add-btn-mini').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSidebarForm(null, { recurrenceType: 'daily' });
        });
        wrapper.appendChild(header);
        
        // ===== 2. 顶部卡片网格（快速打卡入口） =====
        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'habits-cards-grid';
        
        habits.forEach(habit => {
            const card = this.createHabitCard(habit);
            cardsGrid.appendChild(card);
        });
        
        // "添加" 卡片
        const addCard = document.createElement('div');
        addCard.className = 'habit-card habit-card-add';
        addCard.innerHTML = `<i class="fas fa-plus"></i>`;
        addCard.title = '添加新习惯';
        addCard.addEventListener('click', () => this.showSidebarForm(null, { recurrenceType: 'daily' }));
        cardsGrid.appendChild(addCard);
        
        wrapper.appendChild(cardsGrid);
        
        // ===== 3. 展开详情区域（点击标题展开/折叠） =====
        const detailToggle = document.createElement('div');
        detailToggle.className = 'habits-detail-toggle';
        detailToggle.innerHTML = `
            <span class="habits-detail-toggle-text">详情</span>
            <i class="fas fa-chevron-down habits-detail-chevron"></i>
        `;
        wrapper.appendChild(detailToggle);
        
        const detailContent = document.createElement('div');
        detailContent.className = 'habits-detail-content collapsed';
        
        habits.forEach((habit, index) => {
            const habitItem = this.createHabitTaskItem(habit, index + 1, totalCount);
            detailContent.appendChild(habitItem);
        });
        
        wrapper.appendChild(detailContent);
        
        // 折叠/展开事件
        detailToggle.addEventListener('click', () => {
            const isCollapsed = detailContent.classList.toggle('collapsed');
            const chevron = detailToggle.querySelector('.habits-detail-chevron');
            if (chevron) chevron.style.transform = isCollapsed ? '' : 'rotate(180deg)';
            const text = detailToggle.querySelector('.habits-detail-toggle-text');
            if (text) text.textContent = isCollapsed ? '详情' : '收起';
        });
        
        return wrapper;
    }
    
    /**
     * 创建习惯卡片（紧凑版，用于顶部快速打卡）
     * @param {Object} habit 习惯任务
     * @returns {HTMLElement}
     */
    createHabitCard(habit) {
        const today = this.getTodayDate();
        const isTodayCompleted = habit.habit?.completedDates?.includes(today) || false;
        const streak = habit.habit?.streak || 0;
        const icon = habit.habitCard?.icon || '📋';
        
        const card = document.createElement('div');
        card.className = `habit-card ${isTodayCompleted ? 'habit-card-done' : ''}`;
        card.dataset.id = habit.id;
        
        // 本周完成情况（带标签版）
        const weekView = this.getHabitWeekCompletion(habit);
        const weekDotsHtml = weekView.days.map(day => {
            const cls = ['hc-dot'];
            if (day.completed) cls.push('done');
            if (day.isToday) cls.push('now');
            return `<span class="${cls.join(' ')}" title="${day.date}">${day.label}</span>`;
        }).join('');
        
        // 链接指示器
        const linksCount = habit.links?.length || 0;
        const linksHtml = linksCount > 0 
            ? `<a href="${this.escapeHtml(habit.links[0].url)}" class="hc-link-badge" target="_blank" rel="noopener noreferrer" title="${linksCount > 1 ? linksCount + ' 个链接' : this.escapeHtml(habit.links[0].title || habit.links[0].url)}"><i class="fas fa-link"></i>${linksCount > 1 ? ' ' + linksCount : ''}</a>`
            : '';
        
        card.innerHTML = `
            <div class="hc-top">
                <span class="hc-icon">${icon}</span>
                <button class="hc-check" title="${isTodayCompleted ? '取消' : '打卡'}">
                    <i class="${isTodayCompleted ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
                </button>
            </div>
            <div class="hc-title">${this.escapeHtml(habit.title || '无标题')}</div>
            <div class="hc-meta">
                ${streak > 0 ? `<span class="hc-streak"><span class="streak-fire">🔥</span>${streak}</span>` : '<span class="hc-streak-empty">开始吧</span>'}
                ${linksHtml}
            </div>
            <div class="hc-week">${weekDotsHtml}</div>
        `;
        
        // 打卡按钮
        card.querySelector('.hc-check').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleHabitCompletion(habit.id);
        });
        
        // 链接点击（阻止冒泡到卡片）
        const linkBadge = card.querySelector('.hc-link-badge');
        if (linkBadge) {
            linkBadge.addEventListener('click', (e) => e.stopPropagation());
        }
        
        // 点击卡片编辑
        card.addEventListener('click', () => this.showSidebarForm(habit));
        
        return card;
    }
    
    /**
     * 创建习惯任务项
     * @param {Object} habit 习惯任务对象
     * @param {number} index 序号
     * @param {number} total 总数
     * @returns {HTMLElement} 习惯任务项
     */
    createHabitTaskItem(habit, index, total) {
        const item = document.createElement('div');
        const today = this.getTodayDate();
        const isTodayCompleted = habit.habit?.completedDates?.includes(today) || false;
        
        item.className = `sidebar-task-item habit-task-item ${isTodayCompleted ? 'habit-completed' : ''} priority-${habit.priority || 'none'}`;
        item.dataset.id = habit.id;
        
        const streak = habit.habit?.streak || 0;
        const totalCompletions = habit.habit?.totalCompletions || 0;
        const icon = habit.habitCard?.icon || '📋';
        
        // 本周完成情况
        const weekView = this.getHabitWeekCompletion(habit);
        const weekDaysHtml = weekView.days.map(day => {
            const classes = ['habit-week-dot'];
            if (day.completed) classes.push('completed');
            if (day.isToday) classes.push('today');
            return `<div class="${classes.join(' ')}" title="${day.date} ${day.completed ? '✓' : '○'}">
                <span class="dot-label">${day.label}</span>
            </div>`;
        }).join('');
        
        item.innerHTML = `
            <div class="habit-check" title="${isTodayCompleted ? '取消今日打卡' : '今日打卡'}">
                <i class="${isTodayCompleted ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
            </div>
            <div class="habit-body">
                <div class="habit-main-row">
                    <span class="habit-icon">${icon}</span>
                    <span class="habit-title">${this.escapeHtml(habit.title || '无标题')}</span>
                    ${streak > 0 ? `<span class="habit-streak-badge"><span class="streak-fire">🔥</span> ${streak}</span>` : ''}
                </div>
                <div class="habit-week-view">
                    ${weekDaysHtml}
                </div>
                ${habit.text ? `<div class="habit-desc">${this.escapeHtml(habit.text.substring(0, 40))}${habit.text.length > 40 ? '...' : ''}</div>` : ''}
                ${habit.links && habit.links.length > 0 ? `
                    <div class="habit-links">
                        ${habit.links.slice(0, 2).map(link => `<a href="${this.escapeHtml(link.shortUrl || link.url)}" class="habit-link-tag" target="_blank" rel="noopener noreferrer" title="${this.escapeHtml(link.url)}${link.shortUrl ? '\n短链: ' + this.escapeHtml(link.shortUrl) : ''}"><i class="fas fa-external-link-alt"></i> ${this.escapeHtml(link.title || this.extractDomain(link.url))}</a>`).join('')}
                        ${habit.links.length > 2 ? `<span class="habit-links-more">+${habit.links.length - 2}</span>` : ''}
                    </div>` : ''}
            </div>
            <div class="habit-actions">
                <button class="task-edit-btn" title="编辑"><i class="fas fa-pen"></i></button>
                <button class="task-delete-btn" title="删除"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        // 绑定打卡事件
        item.querySelector('.habit-check').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleHabitCompletion(habit.id);
        });
        
        // 绑定编辑事件
        item.querySelector('.task-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSidebarForm(habit);
        });
        
        // 绑定删除事件
        item.querySelector('.task-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这个习惯吗？所有打卡记录将丢失。')) {
                this.deleteSidebarTask(habit.id);
            }
        });
        
        // 点击查看详情
        item.addEventListener('click', () => this.showSidebarForm(habit));
        
        return item;
    }
    
    /**
     * 获取习惯本周完成情况
     * @param {Object} habit 习惯任务
     * @returns {Object} 本周数据
     */
    getHabitWeekCompletion(habit) {
        const today = new Date();
        const weekStart = new Date(today);
        // 调整到周一（中国习惯周一为起始）
        const day = weekStart.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        weekStart.setDate(weekStart.getDate() + diff);
        weekStart.setHours(0, 0, 0, 0);
        
        const labels = ['一', '二', '三', '四', '五', '六', '日'];
        const todayStr = this.getTodayDate();
        const weekData = { completed: 0, days: [] };
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const dateStr = this.formatLocalDateYMD(date);
            const isCompleted = habit.habit?.completedDates?.includes(dateStr) || false;
            const isToday = dateStr === todayStr;
            
            weekData.days.push({
                date: dateStr,
                completed: isCompleted,
                isToday: isToday,
                label: labels[i]
            });
            
            if (isCompleted) weekData.completed++;
        }
        
        return weekData;
    }
    
    /**
     * 切换习惯完成状态（打卡/取消打卡）
     * @param {string} habitId 习惯任务ID
     */
    async toggleHabitCompletion(habitId) {
        const habit = this.memos.find(m => m.id === habitId);
        if (!habit) return;
        
        const today = this.getTodayDate();
        
        // 确保 habit 数据结构存在
        if (!habit.habit) {
            habit.habit = {
                streak: 0,
                bestStreak: 0,
                completedDates: [],
                totalCompletions: 0
            };
        }
        
        const isCompleted = habit.habit.completedDates.includes(today);
        
        if (isCompleted) {
            // 取消打卡
            habit.habit.completedDates = habit.habit.completedDates.filter(d => d !== today);
            habit.habit.totalCompletions = Math.max(0, habit.habit.totalCompletions - 1);
            habit.completed = false;
            habit.completedAt = null;
        } else {
            // 打卡
            habit.habit.completedDates.push(today);
            habit.habit.totalCompletions++;
            habit.completed = true;
            habit.completedAt = Date.now();
        }
        
        // 重新计算连续天数
        habit.habit.streak = this.calculateHabitStreak(habit.habit.completedDates);
        if (habit.habit.streak > habit.habit.bestStreak) {
            habit.habit.bestStreak = habit.habit.streak;
        }
        
        habit.updatedAt = Date.now();
        
        await this.saveMemos();
        this.renderSidebarTaskList();
        
        // 打卡成功反馈
        if (!isCompleted) {
            this.showToast(`✅ 已打卡！连续 ${habit.habit.streak} 天`, 2000);
        }
    }
    
    /**
     * 计算连续完成天数
     * @param {Array} completedDates 完成日期数组
     * @returns {number} 连续天数
     */
    calculateHabitStreak(completedDates) {
        if (!completedDates || completedDates.length === 0) return 0;
        
        const sorted = [...completedDates].sort().reverse();
        let streak = 0;
        let expectedDate = this.getTodayDate();
        
        // 如果今天还没完成，从昨天开始算
        if (!sorted.includes(expectedDate)) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expectedDate = this.formatLocalDateYMD(yesterday);
        }
        
        for (const dateStr of sorted) {
            if (dateStr === expectedDate) {
                streak++;
                const dateObj = new Date(dateStr + 'T00:00:00');
                dateObj.setDate(dateObj.getDate() - 1);
                expectedDate = this.formatLocalDateYMD(dateObj);
            } else if (dateStr < expectedDate) {
                break;
            }
        }
        
        return streak;
    }
    
    /**
     * 每日重复任务更新（页面加载时调用）
     * 确保每日习惯任务的 dueDate 是今天，且重置 completed 状态
     */
    async updateDailyRecurringTasks() {
        const today = this.getTodayDate();
        let changed = false;
        
        for (const task of this.memos) {
            if (!task.recurrence?.enabled) continue;
            
            if (task.recurrence.type === 'daily') {
                // 确保 habit 数据结构存在
                if (!task.habit) {
                    task.habit = {
                        streak: 0,
                        bestStreak: 0,
                        completedDates: [],
                        totalCompletions: 0
                    };
                    changed = true;
                }
                
                // 更新 dueDate 为今天
                if (task.dueDate !== today) {
                    task.dueDate = today;
                    changed = true;
                }
                
                // 根据今天是否已打卡决定 completed 状态
                const isTodayDone = task.habit.completedDates.includes(today);
                if (task.completed !== isTodayDone) {
                    task.completed = isTodayDone;
                    task.completedAt = isTodayDone ? Date.now() : null;
                    changed = true;
                }
                
                // 重新计算连续天数
                const newStreak = this.calculateHabitStreak(task.habit.completedDates);
                if (task.habit.streak !== newStreak) {
                    task.habit.streak = newStreak;
                    if (newStreak > task.habit.bestStreak) {
                        task.habit.bestStreak = newStreak;
                    }
                    changed = true;
                }
            }
        }
        
        if (changed) {
            await this.saveMemos();
        }
    }
    
    /**
     * 按创建时间分组任务（支持跨周/跨月）
     * @param {Array} tasks 任务数组
     * @returns {Object} 按日期分组的任务对象
     */
    groupTasksByDate(tasks) {
        const groups = {};
        const today = new Date();
        const todayStr = this.getTodayDate();
        const yesterdayStr = this.getDateString(-1);
        const twoDaysAgoStr = this.getDateString(-2);
        
        // 获取本周一的日期
        const thisWeekStart = this.getWeekStart(today);
        const lastWeekStart = this.getWeekStart(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
        
        // 获取本月和上月
        const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        const lastMonth = today.getMonth() === 0 
            ? `${today.getFullYear() - 1}-12`
            : `${today.getFullYear()}-${String(today.getMonth()).padStart(2, '0')}`;
        
        tasks.forEach(task => {
            const dateStr = this.formatDateFromTimestamp(task.createdAt);
            if (!dateStr) {
                if (!groups['no-date']) groups['no-date'] = [];
                groups['no-date'].push(task);
                return;
            }
            
            const taskDate = new Date(dateStr + 'T00:00:00');
            const taskMonth = `${taskDate.getFullYear()}-${String(taskDate.getMonth() + 1).padStart(2, '0')}`;
            const taskWeekStart = this.getWeekStart(taskDate);
            
            let dateKey;
            
            // 近3天单独分组
            if (dateStr === todayStr) {
                dateKey = 'today';
            } else if (dateStr === yesterdayStr) {
                dateKey = 'yesterday';
            } else if (dateStr === twoDaysAgoStr) {
                dateKey = 'two-days-ago';
            }
            // 本周（除近3天外）
            else if (taskWeekStart === thisWeekStart && taskMonth === thisMonth) {
                dateKey = 'this-week';
            }
            // 上周
            else if (taskWeekStart === lastWeekStart) {
                dateKey = 'last-week';
            }
            // 本月（除本周和上周外）
            else if (taskMonth === thisMonth) {
                dateKey = 'this-month';
            }
            // 上月
            else if (taskMonth === lastMonth) {
                dateKey = 'last-month';
            }
            // 更早的按月分组
            else {
                dateKey = `month-${taskMonth}`;
            }
            
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(task);
        });
        
        // 按照时间顺序排序分组
        const sortedGroups = {};
        const order = ['today', 'yesterday', 'two-days-ago', 'this-week', 'last-week', 'this-month', 'last-month'];
        
        order.forEach(key => {
            if (groups[key]) {
                sortedGroups[key] = groups[key];
            }
        });
        
        // 添加更早的月份（按日期倒序）
        Object.keys(groups)
            .filter(key => key.startsWith('month-'))
            .sort((a, b) => b.localeCompare(a))
            .forEach(key => {
                sortedGroups[key] = groups[key];
            });
        
        // 最后添加无日期的任务
        if (groups['no-date']) {
            sortedGroups['no-date'] = groups['no-date'];
        }
        
        return sortedGroups;
    }
    
    /**
     * 获取某日期所在周的周一日期字符串
     * @param {Date} date 日期对象
     * @returns {string} 周一的 YYYY-MM-DD
     */
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整到周一
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        return this.formatLocalDateYMD(d);
    }
    
    /**
     * 获取相对日期字符串
     * @param {number} offset 偏移天数
     * @returns {string} YYYY-MM-DD 格式
     */
    getDateString(offset) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        date.setHours(0, 0, 0, 0);
        return this.formatLocalDateYMD(date);
    }
    
    /**
     * 从时间戳格式化日期
     * @param {number} timestamp 时间戳
     * @returns {string} YYYY-MM-DD 格式
     */
    formatDateFromTimestamp(timestamp) {
        if (!timestamp) return null;
        return this.formatLocalDateYMD(new Date(timestamp));
    }
    
    /**
     * 创建日期分组标题
     * @param {string} dateKey 日期键
     * @param {Array} tasks 该日期下的任务
     * @param {boolean} isCollapsed 是否默认折叠
     * @returns {HTMLElement} 分组标题元素
     */
    createDateGroupHeader(dateKey, tasks, isCollapsed = false) {
        const header = document.createElement('div');
        header.className = 'date-group-header';
        
        const completedCount = tasks.filter(t => t.completed).length;
        const totalCount = tasks.length;
        
        // 获取显示文本和图标
        let displayText, icon, extraClass = '';
        switch (dateKey) {
            case 'today':
                displayText = '今天';
                icon = 'fa-calendar-day';
                extraClass = 'today';
                break;
            case 'yesterday':
                displayText = '昨天';
                icon = 'fa-history';
                extraClass = 'yesterday';
                break;
            case 'two-days-ago':
                displayText = '前天';
                icon = 'fa-history';
                extraClass = 'older';
                break;
            case 'this-week':
                displayText = '本周';
                icon = 'fa-calendar-week';
                extraClass = 'week';
                break;
            case 'last-week':
                displayText = '上周';
                icon = 'fa-calendar-week';
                extraClass = 'week';
                break;
            case 'this-month':
                displayText = '本月';
                icon = 'fa-calendar-alt';
                extraClass = 'month';
                break;
            case 'last-month':
                displayText = '上月';
                icon = 'fa-calendar-alt';
                extraClass = 'month';
                break;
            case 'no-date':
                displayText = '未知时间';
                icon = 'fa-calendar-times';
                extraClass = 'no-date';
                break;
            default:
                // 更早的月份：month-YYYY-MM
                if (dateKey.startsWith('month-')) {
                    const monthStr = dateKey.replace('month-', '');
                    displayText = this.formatMonthDisplay(monthStr);
                    icon = 'fa-calendar';
                    extraClass = 'month';
                } else {
                    // 其他日期格式
                    displayText = this.formatDisplayDate(dateKey);
                    icon = 'fa-calendar-alt';
                    extraClass = 'older';
                }
                break;
        }
        
        header.innerHTML = `
            <div class="date-group-left">
                <i class="fas fa-chevron-down group-chevron" style="transform: ${isCollapsed ? 'rotate(-90deg)' : 'rotate(0)'}"></i>
                <div class="date-group-title ${extraClass}">
                    <i class="fas ${icon}"></i>
                    <span>${displayText}</span>
                </div>
            </div>
            <div class="date-group-stats">
                <span class="completed-count">${completedCount}</span>/<span class="total-count">${totalCount}</span>
            </div>
        `;
        
        return header;
    }
    
    /**
     * 格式化月份显示
     * @param {string} monthStr YYYY-MM 格式
     * @returns {string} 友好的月份显示
     */
    formatMonthDisplay(monthStr) {
        if (!monthStr) return '未知月份';
        const [year, month] = monthStr.split('-');
        const currentYear = new Date().getFullYear();
        if (parseInt(year) === currentYear) {
            return `${parseInt(month)}月`;
        }
        return `${year}年${parseInt(month)}月`;
    }
    
    /**
     * 格式化显示日期
     * @param {string} dateStr YYYY-MM-DD 格式
     * @returns {string} 友好的日期显示
     */
    formatDisplayDate(dateStr) {
        if (!dateStr) return '未知日期';
        const date = new Date(dateStr + 'T00:00:00');
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekday = weekdays[date.getDay()];
        return `${month}月${day}日 ${weekday}`;
    }
    
    /**
     * 更新任务统计显示
     */
    updateTaskStats(total, completed, filtered) {
        let statsEl = document.getElementById('sidebar-task-stats');
        if (!statsEl) {
            const filterBar = document.querySelector('.sidebar-filter');
            if (filterBar) {
                statsEl = document.createElement('div');
                statsEl.id = 'sidebar-task-stats';
                statsEl.className = 'sidebar-task-stats';
                filterBar.insertAdjacentElement('afterend', statsEl);
            }
        }
        
        if (statsEl) {
            const pendingTasks = total - completed;
            statsEl.innerHTML = `
                <span class="stats-total" title="总任务数">
                    <i class="fas fa-tasks"></i> ${total}
                </span>
                <span class="stats-pending" title="待完成">
                    <i class="fas fa-hourglass-half"></i> ${pendingTasks}
                </span>
                <span class="stats-completed" title="已完成">
                    <i class="fas fa-check-circle"></i> ${completed}
                </span>
                ${filtered !== total ? `<span class="stats-filtered" title="当前筛选"><i class="fas fa-filter"></i> ${filtered}</span>` : ''}
            `;
        }
    }
    
    /**
     * 创建侧边栏任务项
     * @param {Object} task 任务对象
     * @param {number} index 当前任务在列表中的序号（1起始）
     * @param {number} total 当前筛选后的任务总数
     */
    createSidebarTaskItem(task, index = 0, total = 0) {
        const item = document.createElement('div');
        item.className = `sidebar-task-item ${task.completed ? 'completed' : ''} priority-${task.priority || 'none'}`;
        item.dataset.id = task.id;
        item.dataset.index = index;
        
        const today = this.getTodayDate();
        const isOverdue = task.dueDate && task.dueDate < today && !task.completed;
        if (isOverdue) item.classList.add('overdue');
        
        const priorityColors = { high: '#ff6b6b', medium: '#ffc857', low: '#5cd85c', none: 'transparent' };
        const priorityColor = priorityColors[task.priority] || 'transparent';
        const priorityLabels = { high: '高', medium: '中', low: '低' };
        
        // 生成图片预览 HTML（使用懒加载占位符，避免 Base64 直接嵌入 DOM 导致内存问题）
        let imagesHtml = '';
        if (task.images && task.images.length > 0) {
            const displayImages = task.images.slice(0, 3);
            const moreCount = task.images.length - 3;
            imagesHtml = `
                <div class="task-images" data-task-id="${task.id}">
                    ${displayImages.map((img, idx) => `<img data-src="${img.id}" data-image-index="${idx}" class="task-image-preview task-image-lazy" alt="图片" loading="lazy">`).join('')}
                    ${moreCount > 0 ? `<span class="task-images-more">+${moreCount}</span>` : ''}
                </div>
            `;
        }
        
        // 获取分类名称
        const categoryName = task.categoryId ? this.getCategoryName(task.categoryId) : '';
        
        // 生成进度条 HTML（纯百分比模式）
        // 有子任务时自动开启进度条，由子任务完成情况驱动
        let progressHtml = '';
        const hasSubtasks = task.subtasks && task.subtasks.length > 0;
        const showProgress = (task.progress !== null && task.progress !== undefined) || hasSubtasks;
        if (showProgress) {
            // 有子任务时，进度由子任务自动计算
            let percentage;
            if (hasSubtasks) {
                const doneCount = task.subtasks.filter(st => st.completed).length;
                percentage = Math.round((doneCount / task.subtasks.length) * 100);
            } else {
                percentage = parseInt(task.progress) || 0;
            }
            let progressClass = 'low';
            if (percentage === 100) progressClass = 'complete';
            else if (percentage >= 60) progressClass = 'high';
            else if (percentage >= 30) progressClass = 'medium';
            
            // 有子任务时进度只读（由子任务驱动），无子任务时允许拖拽调整
            const draggable = !hasSubtasks && !task.completed;
            progressHtml = `
                <div class="task-progress${draggable ? ' draggable' : ''}" data-task-id="${task.id}">
                    <div class="task-progress-bar">
                        <div class="task-progress-fill ${progressClass}" style="width: ${percentage}%"></div>
                    </div>
                    <div class="task-progress-text">
                        <span class="task-progress-percentage">${percentage}%</span>
                    </div>
                </div>
            `;
        }
        
        // 生成链接 HTML
        let linksHtml = '';
        if (task.links && task.links.length > 0) {
            const displayLinks = task.links.slice(0, 3);
            const moreCount = task.links.length - 3;
            linksHtml = `
                <div class="task-links">
                    ${displayLinks.map(link => `<a href="${this.escapeHtml(link.shortUrl || link.url)}" class="task-link-item" target="_blank" rel="noopener noreferrer" title="${this.escapeHtml(link.url)}${link.shortUrl ? '\n短链: ' + this.escapeHtml(link.shortUrl) : ''}"><i class="fas fa-external-link-alt"></i> ${this.escapeHtml(link.title || this.extractDomain(link.url))}</a>`).join('')}
                    ${moreCount > 0 ? `<span class="task-links-more">+${moreCount}</span>` : ''}
                </div>
            `;
        }
        
        // 生成子任务 HTML（默认展开模式，点击子任务不再折叠）
        let subtasksHtml = '';
        if (hasSubtasks) {
            const doneCount = task.subtasks.filter(st => st.completed).length;
            const totalCount = task.subtasks.length;
            const subtaskPct = Math.round((doneCount / totalCount) * 100);
            subtasksHtml = `
                <div class="task-subtasks" data-task-id="${task.id}">
                    <div class="subtask-expand-header open">
                        <i class="fas fa-chevron-right subtask-expand-icon open"></i>
                        <span class="subtask-expand-label">子任务</span>
                        <span class="subtask-expand-count">${doneCount}/${totalCount}</span>
                        <div class="subtask-mini-bar">
                            <div class="subtask-mini-fill${subtaskPct === 100 ? ' complete' : ''}" style="width: ${subtaskPct}%"></div>
                        </div>
                    </div>
                    <div class="subtask-expand-body open">
                        <ul class="subtask-compact-list">
                            ${task.subtasks.map(st => `
                                <li class="subtask-compact-item${st.completed ? ' done' : ''}" data-subtask-id="${st.id}" draggable="true">
                                    <span class="subtask-drag-handle" title="拖拽排序"><i class="fas fa-grip-vertical"></i></span>
                                    <div class="subtask-compact-dot"><i class="fas fa-check"></i></div>
                                    <span class="subtask-compact-text">${this.escapeHtml(st.title)}</span>
                                    <div class="subtask-compact-actions">
                                        <button type="button" class="subtask-action-btn subtask-copy-btn" title="复制内容" data-subtask-id="${st.id}"><i class="fas fa-copy"></i></button>
                                        <button type="button" class="subtask-action-btn subtask-delete-btn" title="删除" data-subtask-id="${st.id}"><i class="fas fa-times"></i></button>
                                    </div>
                                </li>
                            `).join('')}
                        </ul>
                        <div class="subtask-add-inline" data-task-id="${task.id}">
                            <input type="text" class="subtask-add-inline-input" placeholder="添加子任务..." maxlength="200">
                            <button type="button" class="subtask-add-inline-btn" title="添加"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                </div>
            `;
        }
        
        item.innerHTML = `
            <div class="task-checkbox" title="${task.completed ? '标记为未完成' : '标记为已完成'}">
                <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
            </div>
            <div class="task-body">
                <div class="task-header">
                    ${index > 0 ? `<span class="task-index">#${index}</span>` : ''}
                    <div class="task-title">${this.escapeHtml(task.title || '无标题')}</div>
                </div>
                ${task.text ? `<div class="task-desc">${this.escapeHtml(task.text.substring(0, 60))}${task.text.length > 60 ? '...' : ''}</div>` : ''}
                ${progressHtml}
                ${subtasksHtml}
                ${!hasSubtasks ? `<div class="subtask-add-quick" data-task-id="${task.id}"><i class="fas fa-plus"></i> 添加子任务</div>` : ''}
                ${linksHtml}
                ${imagesHtml}
                <div class="task-meta">
                    ${categoryName ? `<span class="task-category-tag"><i class="fas fa-folder"></i> ${this.escapeHtml(categoryName)}</span>` : ''}
                    ${task.startDate && task.dueDate ? `<span class="task-due ${isOverdue ? 'overdue' : ''}"><i class="far fa-calendar"></i> ${task.startDate.substring(5)}→${task.dueDate.substring(5)}</span>` : task.dueDate ? `<span class="task-due ${isOverdue ? 'overdue' : ''}"><i class="far fa-calendar"></i> ${task.dueDate}</span>` : ''}
                    ${task.priority && task.priority !== 'none' ? `<span class="task-priority-tag" style="background:${priorityColor}">${priorityLabels[task.priority]}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-edit-btn" title="编辑"><i class="fas fa-pen"></i></button>
                <button class="task-delete-btn" title="删除"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        // 绑定事件
        item.querySelector('.task-checkbox').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSidebarTaskComplete(task.id);
        });
        
        item.querySelector('.task-edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSidebarForm(task);
        });
        
        item.querySelector('.task-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这个任务吗？')) {
                this.deleteSidebarTask(task.id);
            }
        });
        
        // 链接点击事件（阻止冒泡，避免触发编辑）
        const taskLinks = item.querySelectorAll('.task-link-item');
        taskLinks.forEach(linkEl => {
            linkEl.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
        
        // 子任务交互事件
        const subtasksEl = item.querySelector('.task-subtasks');
        if (subtasksEl) {
            // 折叠展开
            const expandHeader = subtasksEl.querySelector('.subtask-expand-header');
            const expandBody = subtasksEl.querySelector('.subtask-expand-body');
            const expandIcon = subtasksEl.querySelector('.subtask-expand-icon');
            if (expandHeader) {
                expandHeader.addEventListener('click', (e) => {
                    e.stopPropagation();
                    expandHeader.classList.toggle('open');
                    expandBody.classList.toggle('open');
                    expandIcon.classList.toggle('open');
                });
            }
            
            // 子任务：单击圆点切换完成，双击文字内联编辑，复制、删除、拖拽排序
            subtasksEl.querySelectorAll('.subtask-compact-item').forEach(stItem => {
                const dot = stItem.querySelector('.subtask-compact-dot');
                const textEl = stItem.querySelector('.subtask-compact-text');
                if (dot) {
                    dot.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.toggleSubtaskComplete(task.id, stItem.dataset.subtaskId);
                    });
                }
                if (textEl) {
                    textEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this._startSubtaskInlineEdit(task.id, stItem.dataset.subtaskId, textEl, stItem);
                    });
                }
                const copyBtn = stItem.querySelector('.subtask-copy-btn');
                if (copyBtn) {
                    copyBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const st = (task.subtasks || []).find(s => s.id === stItem.dataset.subtaskId);
                        if (st) {
                            const ok = await this.copyToClipboard(st.title || '');
                            this.showToast(ok ? '已复制子任务内容' : '复制失败');
                        }
                    });
                }
                const deleteBtn = stItem.querySelector('.subtask-delete-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.deleteSubtaskInline(task.id, stItem.dataset.subtaskId);
                    });
                }
            });
            
            this._bindSubtaskDragEvents(subtasksEl, task.id);
            // 列表内添加子任务输入
            const addInline = subtasksEl.querySelector('.subtask-add-inline');
            if (addInline) {
                addInline.addEventListener('click', (e) => e.stopPropagation());
                const input = addInline.querySelector('.subtask-add-inline-input');
                const btn = addInline.querySelector('.subtask-add-inline-btn');
                const submit = () => {
                    if (input && input.value.trim()) {
                        this.addSubtaskInline(task.id, input.value);
                        input.value = '';
                    }
                };
                if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
                if (input) {
                    input.addEventListener('click', (e) => e.stopPropagation());
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); }
                    });
                }
            }
        }
        
        // 无子任务时的快速添加按钮
        const quickAddBtn = item.querySelector('.subtask-add-quick');
        if (quickAddBtn) {
            quickAddBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const taskId = quickAddBtn.dataset.taskId;
                quickAddBtn.style.display = 'none';
                const inputWrap = document.createElement('div');
                inputWrap.className = 'subtask-add-inline';
                inputWrap.dataset.taskId = taskId;
                inputWrap.innerHTML = `
                    <input type="text" class="subtask-add-inline-input" placeholder="添加子任务..." maxlength="200" autofocus>
                    <button type="button" class="subtask-add-inline-btn" title="添加"><i class="fas fa-plus"></i></button>
                `;
                quickAddBtn.parentNode.insertBefore(inputWrap, quickAddBtn.nextSibling);
                const inp = inputWrap.querySelector('.subtask-add-inline-input');
                const addBtn = inputWrap.querySelector('.subtask-add-inline-btn');
                inp.focus();
                const doSubmit = () => {
                    if (inp.value.trim()) {
                        this.addSubtaskInline(taskId, inp.value);
                        inp.value = '';
                    }
                };
                addBtn.addEventListener('click', (ev) => { ev.stopPropagation(); doSubmit(); });
                inp.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); doSubmit(); }
                    if (ev.key === 'Escape') { inputWrap.remove(); quickAddBtn.style.display = ''; }
                });
                inp.addEventListener('click', (ev) => ev.stopPropagation());
                inputWrap.addEventListener('click', (ev) => ev.stopPropagation());
            });
        }
        
        // 进度条拖拽交互（仅无子任务且未完成时）
        const progressEl = item.querySelector('.task-progress.draggable');
        if (progressEl) {
            this._bindProgressDrag(progressEl, task);
        }
        
        // 点击任务项编辑
        item.addEventListener('click', () => this.showSidebarForm(task));
        
        // 右键菜单（复制标题/描述/子任务、编辑、删除）
        const taskBody = item.querySelector('.task-body');
        if (taskBody) {
            taskBody.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showTaskContextMenu(task, e.clientX, e.clientY);
            });
        }
        
        // 图片点击放大事件
        const taskImages = item.querySelector('.task-images');
        if (taskImages) {
            taskImages.addEventListener('click', (e) => {
                e.stopPropagation();
                const imgEl = e.target.closest('.task-image-preview');
                if (imgEl) {
                    const idx = parseInt(imgEl.dataset.imageIndex) || 0;
                    this.showImageLightbox(task.images, idx);
                }
            });
            
            // 图片懒加载：使用 IntersectionObserver 延迟加载图片，避免大量 Base64 阻塞主线程
            this.setupImageLazyLoad(item, task);
        }
        
        return item;
    }
    
    /**
     * 设置图片懒加载
     * @param {HTMLElement} item 任务项元素
     * @param {Object} task 任务对象
     */
    setupImageLazyLoad(item, task) {
        if (!task.images || task.images.length === 0) return;
        
        const lazyImages = item.querySelectorAll('.task-image-lazy');
        if (lazyImages.length === 0) return;
        
        // 使用 IntersectionObserver 实现懒加载
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        const imageId = img.dataset.src;
                        const imageData = task.images.find(i => i.id === imageId);
                        if (imageData) {
                            const thumbUrl = this.getImageThumbnail(imageData);
                            if (thumbUrl) {
                                // 使用 requestIdleCallback 在空闲时加载，避免阻塞
                                const loadImage = () => {
                                    img.src = thumbUrl;
                                    img.classList.remove('task-image-lazy');
                                };
                                if ('requestIdleCallback' in window) {
                                    requestIdleCallback(loadImage, { timeout: 500 });
                                } else {
                                    setTimeout(loadImage, 50);
                                }
                            }
                        }
                        obs.unobserve(img);
                    }
                });
            }, { rootMargin: '100px' });
            
            lazyImages.forEach(img => observer.observe(img));
        } else {
            // 降级处理：直接加载（针对不支持 IntersectionObserver 的旧浏览器）
            lazyImages.forEach(img => {
                const imageId = img.dataset.src;
                const imageData = task.images.find(i => i.id === imageId);
                if (imageData) {
                    const thumbUrl = this.getImageThumbnail(imageData);
                    if (thumbUrl) {
                        setTimeout(() => {
                            img.src = thumbUrl;
                            img.classList.remove('task-image-lazy');
                        }, 100);
                    }
                }
            });
        }
    }
    
    /**
     * 显示图片灯箱
     */
    showImageLightbox(images, startIndex = 0) {
        if (!images || images.length === 0) return;
        
        // 移除已有的灯箱
        const existingLightbox = document.getElementById('image-lightbox');
        if (existingLightbox) existingLightbox.remove();
        
        let currentIndex = startIndex;
        
        // 获取当前图片的大图（兼容 ImgVault 新格式和 base64 旧格式）
        const getFullImage = (img) => this.getImageFullUrl(img);
        
        // 创建灯箱
        const lightbox = document.createElement('div');
        lightbox.id = 'image-lightbox';
        lightbox.className = 'image-lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-overlay"></div>
            <div class="lightbox-content">
                <button class="lightbox-close" title="关闭">&times;</button>
                <button class="lightbox-prev" title="上一张" ${images.length <= 1 ? 'style="display:none"' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="lightbox-image-container">
                    <img src="${getFullImage(images[currentIndex])}" alt="图片预览" class="lightbox-image">
                </div>
                <button class="lightbox-next" title="下一张" ${images.length <= 1 ? 'style="display:none"' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
                <div class="lightbox-counter">${currentIndex + 1} / ${images.length}</div>
            </div>
        `;
        
        document.body.appendChild(lightbox);
        
        // 获取元素
        const imgEl = lightbox.querySelector('.lightbox-image');
        const counterEl = lightbox.querySelector('.lightbox-counter');
        const prevBtn = lightbox.querySelector('.lightbox-prev');
        const nextBtn = lightbox.querySelector('.lightbox-next');
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const overlay = lightbox.querySelector('.lightbox-overlay');
        
        // 更新显示（使用大图）
        const updateImage = () => {
            imgEl.src = getFullImage(images[currentIndex]);
            counterEl.textContent = `${currentIndex + 1} / ${images.length}`;
        };
        
        // 上一张
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            updateImage();
        });
        
        // 下一张
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentIndex = (currentIndex + 1) % images.length;
            updateImage();
        });
        
        // 关闭
        const closeLightbox = () => lightbox.remove();
        closeBtn.addEventListener('click', closeLightbox);
        overlay.addEventListener('click', closeLightbox);
        
        // 键盘事件
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                closeLightbox();
                document.removeEventListener('keydown', handleKeydown);
            } else if (e.key === 'ArrowLeft' && images.length > 1) {
                currentIndex = (currentIndex - 1 + images.length) % images.length;
                updateImage();
            } else if (e.key === 'ArrowRight' && images.length > 1) {
                currentIndex = (currentIndex + 1) % images.length;
                updateImage();
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        // 显示动画
        requestAnimationFrame(() => lightbox.classList.add('active'));
    }
    
    /**
     * 显示番茄钟计时器
     */
    showPomodoroTimer() {
        // 移除已有的面板
        const existingPanel = document.getElementById('pomodoro-panel');
        if (existingPanel) existingPanel.remove();
        
        const panel = document.createElement('div');
        panel.id = 'pomodoro-panel';
        panel.className = 'pomodoro-panel';
        panel.innerHTML = `
            <div class="pomodoro-overlay"></div>
            <div class="pomodoro-content">
                <div class="pomodoro-header">
                    <h3><i class="fas fa-clock"></i> 番茄钟</h3>
                    <button class="pomodoro-close" id="pomodoro-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="pomodoro-body">
                    <div class="pomodoro-mode-tabs">
                        <button class="pomodoro-tab active" data-mode="work">专注</button>
                        <button class="pomodoro-tab" data-mode="short-break">短休息</button>
                        <button class="pomodoro-tab" data-mode="long-break">长休息</button>
                    </div>
                    <div class="pomodoro-timer-display" id="pomodoro-display">25:00</div>
                    <div class="pomodoro-controls">
                        <button class="pomodoro-btn secondary" id="pomodoro-reset" title="重置">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button class="pomodoro-btn primary" id="pomodoro-toggle" title="开始">
                            <i class="fas fa-play" id="pomodoro-toggle-icon"></i>
                        </button>
                        <button class="pomodoro-btn secondary" id="pomodoro-skip" title="跳过">
                            <i class="fas fa-forward"></i>
                        </button>
                    </div>
                    <div class="pomodoro-stats">
                        <div class="pomodoro-stat">
                            <span class="pomodoro-stat-value" id="pomodoro-count">0</span>
                            <span class="pomodoro-stat-label">今日番茄</span>
                        </div>
                        <div class="pomodoro-stat">
                            <span class="pomodoro-stat-value" id="pomodoro-focus-time">0</span>
                            <span class="pomodoro-stat-label">专注分钟</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 初始化番茄钟逻辑
        this.initPomodoroTimer(panel);
        
        // 显示动画
        requestAnimationFrame(() => panel.classList.add('active'));
    }
    
    /**
     * 初始化番茄钟计时器
     */
    initPomodoroTimer(panel) {
        const modes = {
            work: { duration: 25, label: '专注时间' },
            'short-break': { duration: 5, label: '短休息' },
            'long-break': { duration: 15, label: '长休息' }
        };
        
        let currentMode = 'work';
        let timeLeft = modes.work.duration * 60;
        let isRunning = false;
        let interval = null;
        
        // 从 localStorage 加载今日统计
        const today = this.getTodayDate();
        const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
        let pomodoroCount = stats[today]?.count || 0;
        let totalFocusMinutes = stats[today]?.focusMinutes || 0;
        
        const displayEl = panel.querySelector('#pomodoro-display');
        const toggleBtn = panel.querySelector('#pomodoro-toggle');
        const toggleIcon = panel.querySelector('#pomodoro-toggle-icon');
        const resetBtn = panel.querySelector('#pomodoro-reset');
        const skipBtn = panel.querySelector('#pomodoro-skip');
        const countEl = panel.querySelector('#pomodoro-count');
        const focusTimeEl = panel.querySelector('#pomodoro-focus-time');
        const tabs = panel.querySelectorAll('.pomodoro-tab');
        
        // 更新显示
        const updateDisplay = () => {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            displayEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        };
        
        // 更新统计
        const updateStats = () => {
            countEl.textContent = pomodoroCount;
            focusTimeEl.textContent = Math.floor(totalFocusMinutes);
        };
        
        // 保存统计
        const saveStats = () => {
            const stats = JSON.parse(localStorage.getItem('pomodoroStats') || '{}');
            stats[today] = { count: pomodoroCount, focusMinutes: Math.floor(totalFocusMinutes) };
            localStorage.setItem('pomodoroStats', JSON.stringify(stats));
        };
        
        // 设置模式
        const setMode = (mode) => {
            currentMode = mode;
            timeLeft = modes[mode].duration * 60;
            isRunning = false;
            clearInterval(interval);
            
            updateDisplay();
            toggleIcon.className = 'fas fa-play';
            toggleBtn.classList.remove('running');
            
            tabs.forEach(tab => {
                tab.classList.toggle('active', tab.dataset.mode === mode);
            });
        };
        
        // 开始/暂停
        const toggle = () => {
            if (isRunning) {
                isRunning = false;
                toggleIcon.className = 'fas fa-play';
                toggleBtn.classList.remove('running');
                clearInterval(interval);
            } else {
                isRunning = true;
                toggleIcon.className = 'fas fa-pause';
                toggleBtn.classList.add('running');
                
                interval = setInterval(() => {
                    timeLeft--;
                    updateDisplay();
                    
                    if (currentMode === 'work') {
                        totalFocusMinutes += 1/60;
                        focusTimeEl.textContent = Math.floor(totalFocusMinutes);
                    }
                    
                    if (timeLeft <= 0) {
                        complete();
                    }
                }, 1000);
            }
        };
        
        // 完成
        const complete = () => {
            isRunning = false;
            clearInterval(interval);
            
            // 播放提示音
            this.playPomodoroSound();
            
            if (currentMode === 'work') {
                pomodoroCount++;
                updateStats();
                saveStats();
                this.showToast('番茄完成！休息一下吧 🍅');
                
                if (pomodoroCount % 4 === 0) {
                    setMode('long-break');
                } else {
                    setMode('short-break');
                }
            } else {
                this.showToast('休息结束！继续专注吧 💪');
                setMode('work');
            }
        };
        
        // 初始化显示
        updateDisplay();
        updateStats();
        
        // 绑定事件
        toggleBtn.addEventListener('click', toggle);
        resetBtn.addEventListener('click', () => setMode(currentMode));
        skipBtn.addEventListener('click', complete);
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => setMode(tab.dataset.mode));
        });
        
        // 关闭按钮
        panel.querySelector('#pomodoro-close').addEventListener('click', () => {
            clearInterval(interval);
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        });
        
        panel.querySelector('.pomodoro-overlay').addEventListener('click', () => {
            clearInterval(interval);
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        });
    }
    
    /**
     * 播放番茄钟提示音
     */
    playPomodoroSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.3;
            
            oscillator.start();
            setTimeout(() => oscillator.stop(), 200);
        } catch (e) {
            console.log('无法播放提示音');
        }
    }
    
    /**
     * 显示任务统计面板
     */
    showTaskStatistics() {
        // 移除已有的面板
        const existingPanel = document.getElementById('stats-panel');
        if (existingPanel) existingPanel.remove();
        
        // 默认时间范围为 30 天
        this.statsDateRange = 30;
        
        const panel = document.createElement('div');
        panel.id = 'stats-panel';
        panel.className = 'stats-panel';
        
        // 渲染面板内容
        this.renderStatsPanelContent(panel);
        
        document.body.appendChild(panel);
        
        // 绑定事件
        this.bindStatsPanelEvents(panel);
        
        // 显示动画
        requestAnimationFrame(() => panel.classList.add('active'));
    }
    
    /**
     * 渲染统计面板内容
     */
    renderStatsPanelContent(panel) {
        const stats = this.calculateTaskStats(this.statsDateRange);
        
        panel.innerHTML = `
            <div class="stats-overlay"></div>
            <div class="stats-content">
                <div class="stats-header">
                    <h3><i class="fas fa-chart-line"></i> 任务统计</h3>
                    <button class="stats-close" id="stats-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="stats-body">
                    <!-- 日期范围选择 -->
                    <div class="stats-date-range">
                        <button class="date-range-btn ${this.statsDateRange === 7 ? 'active' : ''}" data-range="7">7天</button>
                        <button class="date-range-btn ${this.statsDateRange === 30 ? 'active' : ''}" data-range="30">30天</button>
                        <button class="date-range-btn ${this.statsDateRange === 90 ? 'active' : ''}" data-range="90">90天</button>
                        <button class="date-range-btn ${this.statsDateRange === 9999 ? 'active' : ''}" data-range="9999">全部</button>
                    </div>
                    
                    <!-- 统计卡片 -->
                    <div class="stats-summary">
                        <div class="stats-card total">
                            <div class="stats-card-value">${stats.total}</div>
                            <div class="stats-card-label">总任务</div>
                        </div>
                        <div class="stats-card completed">
                            <div class="stats-card-value">${stats.completed}</div>
                            <div class="stats-card-label">已完成</div>
                        </div>
                        <div class="stats-card pending">
                            <div class="stats-card-value">${stats.pending}</div>
                            <div class="stats-card-label">待完成</div>
                        </div>
                        <div class="stats-card overdue">
                            <div class="stats-card-value">${stats.overdue}</div>
                            <div class="stats-card-label">已过期</div>
                        </div>
                    </div>
                    
                    <!-- 生产力评分 -->
                    <div class="stats-productivity">
                        <div class="stats-score">${stats.score}</div>
                        <div class="stats-score-label">生产力评分</div>
                        <div class="stats-score-desc">${stats.scoreDesc}</div>
                    </div>
                    
                    <!-- 完成趋势 -->
                    <div class="stats-section">
                        <h4><i class="fas fa-chart-bar"></i> 完成趋势</h4>
                        <div class="stats-chart">
                            ${this.renderWeeklyChart(stats.weeklyData)}
                        </div>
                    </div>
                    
                    <!-- 优先级分布 -->
                    <div class="stats-section">
                        <h4><i class="fas fa-flag"></i> 优先级分布</h4>
                        <div class="stats-priority-grid">
                            ${this.renderPriorityStats(stats.priorityData)}
                        </div>
                    </div>
                    
                    <!-- 分类分布 -->
                    <div class="stats-section">
                        <h4><i class="fas fa-folder"></i> 分类分布</h4>
                        <div class="stats-categories">
                            ${this.renderCategoryStats(stats.categoryData)}
                        </div>
                    </div>
                    
                    <!-- 最近完成 -->
                    <div class="stats-section">
                        <h4><i class="fas fa-check-circle"></i> 最近完成</h4>
                        <div class="stats-recent-list">
                            ${this.renderRecentCompleted(stats.recentCompleted)}
                        </div>
                    </div>
                    
                    <!-- 存储与管理 -->
                    <div class="stats-footer">
                        <div class="stats-storage-info">
                            <div class="stats-storage-row">
                                <span><i class="fas fa-database"></i> 存储使用</span>
                                <strong>${stats.storageSize}</strong>
                            </div>
                            <div class="stats-storage-bar">
                                <div class="stats-storage-used" style="width: ${Math.min(stats.storagePercent, 100)}%"></div>
                            </div>
                            <div class="stats-storage-detail">
                                任务数据 ${stats.storageSize} / 10 MB 配额 (${stats.storagePercent.toFixed(1)}%)
                            </div>
                        </div>
                        
                        <div class="stats-actions">
                            <button class="stats-action-btn" id="stats-clear-completed">
                                <i class="fas fa-broom"></i> 清理已完成 (${stats.completed})
                            </button>
                            <button class="stats-action-btn danger" id="stats-clear-images">
                                <i class="fas fa-image"></i> 清理图片
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    /**
     * 绑定统计面板事件
     */
    bindStatsPanelEvents(panel) {
        const closePanel = () => {
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        };
        
        panel.querySelector('#stats-close').addEventListener('click', closePanel);
        panel.querySelector('.stats-overlay').addEventListener('click', closePanel);
        
        // 日期范围切换
        panel.querySelectorAll('.date-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.statsDateRange = parseInt(btn.dataset.range);
                this.renderStatsPanelContent(panel);
                this.bindStatsPanelEvents(panel);
            });
        });
        
        // 清理已完成任务
        const clearCompletedBtn = panel.querySelector('#stats-clear-completed');
        if (clearCompletedBtn) {
            clearCompletedBtn.addEventListener('click', async () => {
                const completedCount = this.memos.filter(m => m.completed).length;
                if (completedCount === 0) {
                    this.showToast('没有已完成的任务');
                    return;
                }
                if (!confirm(`确定要永久删除 ${completedCount} 个已完成的任务吗？\n\n此操作不可撤销！`)) return;
                
                this.memos = this.memos.filter(m => !m.completed);
                await this.saveMemos();
                
                this.showToast(`已删除 ${completedCount} 个任务`);
                this.renderSidebarTaskList();
                this.renderStatsPanelContent(panel);
                this.bindStatsPanelEvents(panel);
            });
        }
        
        // 清理图片数据
        const clearImagesBtn = panel.querySelector('#stats-clear-images');
        if (clearImagesBtn) {
            clearImagesBtn.addEventListener('click', async () => {
                const tasksWithImages = this.memos.filter(m => m.images && m.images.length > 0).length;
                if (tasksWithImages === 0) {
                    this.showToast('没有图片数据');
                    return;
                }
                
                if (!confirm(`有 ${tasksWithImages} 个任务包含图片。\n\n确定删除所有图片？任务会保留。`)) return;
                
                this.memos.forEach(memo => { if (memo.images) memo.images = []; });
                await this.saveMemos();
                
                this.showToast(`已清理图片数据`);
                this.renderSidebarTaskList();
                this.renderStatsPanelContent(panel);
                this.bindStatsPanelEvents(panel);
            });
        }
    }

    // ==================== 数据备份与恢复 ====================

    /**
     * 显示备份与恢复面板
     */
    showBackupPanel() {
        const existingPanel = document.getElementById('backup-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'backup-panel';
        panel.className = 'backup-panel';

        // 计算存储使用情况
        const dataStr = JSON.stringify(this.memos);
        const sizeBytes = new Blob([dataStr]).size;
        const sizeKB = (sizeBytes / 1024).toFixed(1);
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        
        // 获取上次备份时间
        const lastBackupTime = localStorage.getItem('lastBackupTime');
        const lastBackupStr = lastBackupTime 
            ? new Date(parseInt(lastBackupTime)).toLocaleString('zh-CN')
            : '从未备份';

        panel.innerHTML = `
            <div class="backup-overlay"></div>
            <div class="backup-content">
                <div class="backup-header">
                    <h3><i class="fas fa-cloud-download-alt"></i> 数据备份与恢复</h3>
                    <button class="backup-close" id="backup-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="backup-body">
                    <div class="backup-info">
                        <div class="backup-stat">
                            <span class="stat-label">任务总数</span>
                            <span class="stat-value">${this.memos.length}</span>
                        </div>
                        <div class="backup-stat">
                            <span class="stat-label">数据大小</span>
                            <span class="stat-value">${sizeMB > 1 ? sizeMB + ' MB' : sizeKB + ' KB'}</span>
                        </div>
                        <div class="backup-stat">
                            <span class="stat-label">上次备份</span>
                            <span class="stat-value">${lastBackupStr}</span>
                        </div>
                    </div>
                    
                    <div class="backup-section">
                        <h4><i class="fas fa-download"></i> 导出数据</h4>
                        <p class="backup-desc">将所有任务数据导出为 JSON 文件，保存到本地磁盘。建议定期备份以防数据丢失。</p>
                        <div class="backup-actions">
                            <button class="backup-btn primary" id="backup-export-all">
                                <i class="fas fa-file-export"></i> 导出全部数据
                            </button>
                            <button class="backup-btn" id="backup-export-completed">
                                <i class="fas fa-check-circle"></i> 仅导出已完成
                            </button>
                        </div>
                    </div>
                    
                    <div class="backup-section">
                        <h4><i class="fas fa-upload"></i> 导入数据</h4>
                        <p class="backup-desc">从 JSON 备份文件恢复数据。可选择覆盖或合并现有数据。</p>
                        <div class="backup-actions">
                            <button class="backup-btn" id="backup-import-merge">
                                <i class="fas fa-object-group"></i> 导入并合并
                            </button>
                            <button class="backup-btn danger" id="backup-import-replace">
                                <i class="fas fa-exchange-alt"></i> 导入并覆盖
                            </button>
                        </div>
                        <input type="file" id="backup-file-input" accept=".json" hidden>
                    </div>
                    
                    <div class="backup-section">
                        <h4><i class="fas fa-cog"></i> 自动备份设置</h4>
                        <div class="backup-setting">
                            <label class="backup-checkbox">
                                <input type="checkbox" id="backup-auto-remind" ${this.getAutoBackupRemind() ? 'checked' : ''}>
                                <span>每周提醒备份</span>
                            </label>
                        </div>
                    </div>
                    
                    <div class="backup-tip">
                        <i class="fas fa-info-circle"></i>
                        <span>提示：本扩展已启用无限存储权限，数据不会因空间不足而丢失。但仍建议定期备份到本地。</span>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        this.bindBackupPanelEvents(panel);
        requestAnimationFrame(() => panel.classList.add('active'));
    }

    /**
     * 绑定备份面板事件
     */
    bindBackupPanelEvents(panel) {
        // 关闭按钮
        const closeBtn = panel.querySelector('#backup-close');
        const overlay = panel.querySelector('.backup-overlay');
        
        const closePanel = () => {
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        };
        
        closeBtn?.addEventListener('click', closePanel);
        overlay?.addEventListener('click', closePanel);
        
        // 导出全部数据
        panel.querySelector('#backup-export-all')?.addEventListener('click', () => {
            this.exportData('all');
        });
        
        // 导出已完成任务
        panel.querySelector('#backup-export-completed')?.addEventListener('click', () => {
            this.exportData('completed');
        });
        
        // 导入并合并
        panel.querySelector('#backup-import-merge')?.addEventListener('click', () => {
            this.triggerImport('merge');
        });
        
        // 导入并覆盖
        panel.querySelector('#backup-import-replace')?.addEventListener('click', () => {
            if (confirm('⚠️ 警告：这将覆盖所有现有数据！\n\n确定要继续吗？')) {
                this.triggerImport('replace');
            }
        });
        
        // 文件选择处理
        const fileInput = panel.querySelector('#backup-file-input');
        fileInput?.addEventListener('change', (e) => {
            this.handleImportFile(e, this._importMode);
        });
        
        // 自动备份提醒
        panel.querySelector('#backup-auto-remind')?.addEventListener('change', (e) => {
            this.setAutoBackupRemind(e.target.checked);
        });
    }

    /**
     * 导出数据
     * @param {string} type - 'all' 或 'completed'
     */
    async exportData(type) {
        try {
            let dataToExport;
            let filename;
            
            if (type === 'completed') {
                dataToExport = {
                    version: '1.7.0 ',
                    exportDate: new Date().toISOString(),
                    type: 'completed_tasks',
                    memos: this.memos.filter(m => m.completed),
                    categories: this.categories,
                    tags: this.tags
                };
                filename = `tasks-completed-${this.formatLocalDateYMD(new Date())}.json`;
            } else {
                dataToExport = {
                    version: '1.7.0',
                    exportDate: new Date().toISOString(),
                    type: 'full_backup',
                    memos: this.memos,
                    categories: this.categories,
                    tags: this.tags
                };
                filename = `tasks-backup-${this.formatLocalDateYMD(new Date())}.json`;
            }
            
            const jsonStr = JSON.stringify(dataToExport, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            
            // 使用 Chrome Downloads API 下载文件
            if (chrome.downloads) {
                const url = URL.createObjectURL(blob);
                await chrome.downloads.download({
                    url: url,
                    filename: filename,
                    saveAs: true
                });
                
                // 记录备份时间
                localStorage.setItem('lastBackupTime', Date.now().toString());
                
                this.showToast(`✅ 数据已导出：${filename}`, 3000);
                
                // 刷新面板显示
                setTimeout(() => {
                    const panel = document.getElementById('backup-panel');
                    if (panel) {
                        this.showBackupPanel(); // 刷新面板
                    }
                }, 500);
            } else {
                // 降级方案：使用传统下载方式
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                localStorage.setItem('lastBackupTime', Date.now().toString());
                this.showToast(`✅ 数据已导出：${filename}`, 3000);
            }
        } catch (error) {
            console.error('导出数据失败:', error);
            this.showToast('❌ 导出失败，请重试', 3000);
        }
    }

    /**
     * 触发导入
     * @param {string} mode - 'merge' 或 'replace'
     */
    triggerImport(mode) {
        this._importMode = mode;
        const fileInput = document.getElementById('backup-file-input');
        if (fileInput) {
            fileInput.value = ''; // 清空以便重新选择同一文件
            fileInput.click();
        }
    }

    /**
     * 处理导入文件
     * @param {Event} event - 文件选择事件
     * @param {string} mode - 'merge' 或 'replace'
     */
    async handleImportFile(event, mode) {
        const file = event.target.files?.[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // 验证数据格式
            if (!data.memos || !Array.isArray(data.memos)) {
                throw new Error('无效的备份文件格式');
            }
            
            if (mode === 'replace') {
                // 覆盖模式
                this.memos = data.memos.map(memo => this.normalizeMemo(memo));
                if (data.categories) this.categories = data.categories;
                if (data.tags) this.tags = data.tags;
                
                await Promise.all([
                    this.saveMemos(),
                    this.saveCategories(),
                    this.saveTags()
                ]);
                
                this.showToast(`✅ 已导入 ${this.memos.length} 个任务（覆盖模式）`, 3000);
            } else {
                // 合并模式
                const existingIds = new Set(this.memos.map(m => m.id));
                let newCount = 0;
                let updateCount = 0;
                
                for (const memo of data.memos) {
                    const normalized = this.normalizeMemo(memo);
                    if (existingIds.has(normalized.id)) {
                        // 更新已存在的任务（如果导入的更新）
                        const existing = this.memos.find(m => m.id === normalized.id);
                        if (existing && normalized.updatedAt > (existing.updatedAt || 0)) {
                            Object.assign(existing, normalized);
                            updateCount++;
                        }
                    } else {
                        // 添加新任务
                        this.memos.push(normalized);
                        newCount++;
                    }
                }
                
                // 合并分类和标签
                if (data.categories) {
                    const existingCatIds = new Set(this.categories.map(c => c.id));
                    for (const cat of data.categories) {
                        if (!existingCatIds.has(cat.id)) {
                            this.categories.push(cat);
                        }
                    }
                }
                
                if (data.tags) {
                    const existingTagIds = new Set(this.tags.map(t => t.id));
                    for (const tag of data.tags) {
                        if (!existingTagIds.has(tag.id)) {
                            this.tags.push(tag);
                        }
                    }
                }
                
                await Promise.all([
                    this.saveMemos(),
                    this.saveCategories(),
                    this.saveTags()
                ]);
                
                this.showToast(`✅ 导入完成：新增 ${newCount} 个，更新 ${updateCount} 个`, 3000);
            }
            
            // 刷新界面
            this.renderSidebarTaskList();
            
            // 关闭备份面板
            const panel = document.getElementById('backup-panel');
            if (panel) {
                panel.classList.remove('active');
                setTimeout(() => panel.remove(), 300);
            }
            
        } catch (error) {
            console.error('导入数据失败:', error);
            this.showToast(`❌ 导入失败：${error.message}`, 4000);
        }
    }

    /**
     * 规范化备忘录数据
     * @param {Object} memo - 原始备忘录对象
     * @returns {Object} 规范化后的备忘录
     */
    normalizeMemo(memo) {
        // ⚠️ 重要：添加新字段时必须在此处声明默认值，否则刷新后数据丢失！
        // 同时需要更新 js/tasks.js 中的 loadData 方法
        const normalized = {
            id: memo.id || this.generateId(),
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
            progress: memo.progress !== undefined ? memo.progress : null,
            // 重复任务配置
            recurrence: memo.recurrence || null,
            // 习惯追踪数据
            habit: memo.habit || null,
            // 习惯卡片配置
            habitCard: memo.habitCard || null,
            // 子任务列表 [{id, title, completed}]
            subtasks: Array.isArray(memo.subtasks) ? memo.subtasks : []
        };
        
        // 兼容旧数据：如果存在 isDaily 标记但没有 recurrence，自动迁移
        if (memo.isDaily && !memo.recurrence) {
            normalized.recurrence = {
                enabled: true,
                type: 'daily',
                interval: 1,
                weekDays: null,
                monthDay: null,
                endDate: null
            };
            normalized.habit = {
                streak: 0,
                bestStreak: 0,
                completedDates: [],
                totalCompletions: 0
            };
        }
        
        return normalized;
    }

    /**
     * 获取自动备份提醒设置
     */
    getAutoBackupRemind() {
        return localStorage.getItem('autoBackupRemind') !== 'false';
    }

    /**
     * 设置自动备份提醒
     */
    setAutoBackupRemind(enabled) {
        localStorage.setItem('autoBackupRemind', enabled.toString());
        if (enabled) {
            this.showToast('✅ 已开启每周备份提醒', 2000);
        } else {
            this.showToast('已关闭每周备份提醒', 2000);
        }
    }

    /**
     * 检查是否需要备份提醒
     */
    checkBackupReminder() {
        if (!this.getAutoBackupRemind()) return;
        
        const lastBackupTime = localStorage.getItem('lastBackupTime');
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        
        if (!lastBackupTime || (Date.now() - parseInt(lastBackupTime)) > oneWeek) {
            // 超过一周未备份
            if (this.memos.length > 0) {
                setTimeout(() => {
                    this.showToast('您已超过一周未备份数据，点击此处立即备份', 8000, {
                        icon: 'fas fa-database',
                        onClick: () => this.showBackupPanel()
                    });
                }, 3000);
            }
        }
    }

    // ==================== 书签智能检索面板 ====================

    /**
     * 显示书签检索面板
     */
    async showBookmarkPanel() {
        const existing = document.getElementById('bookmark-panel');
        if (existing) existing.remove();

        if (!this._bookmarkRAG) {
            this._bookmarkRAG = new BookmarkRAG();
            await this._bookmarkRAG.init();
        }

        const rag = this._bookmarkRAG;

        if (!rag.isConfigured()) {
            this.showBookmarkWizard();
            return;
        }

        await rag.syncBookmarks();
        const stats = rag.getStats();

        const panel = document.createElement('div');
        panel.className = 'about-panel active';
        panel.id = 'bookmark-panel';
        panel.innerHTML = `
            <div class="about-overlay"></div>
            <div class="about-content" style="max-width: 560px;">
                <div class="about-header">
                    <h3><i class="fas fa-bookmark" style="margin-right: 8px; opacity: 0.6;"></i>书签检索</h3>
                    <button class="about-close" id="bookmark-panel-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="about-body" style="padding: 16px;">
                    <!-- 搜索栏 -->
                    <div class="bm-search-bar">
                        <i class="fas fa-search bm-search-icon"></i>
                        <input type="text" id="bm-search-input" class="bm-search-input" placeholder="搜索书签（标题、域名、标签）..." autofocus>
                        <span class="bm-search-hint" id="bm-search-hint">${stats.total} 条书签</span>
                    </div>

                    <!-- 统计概览 -->
                    <div class="bm-stats-row">
                        <div class="bm-stat-item">
                            <span class="bm-stat-value">${stats.total}</span>
                            <span class="bm-stat-label">总书签</span>
                        </div>
                        <div class="bm-stat-item">
                            <span class="bm-stat-value">${stats.embedded}</span>
                            <span class="bm-stat-label">已处理</span>
                        </div>
                        <div class="bm-stat-item">
                            <span class="bm-stat-value">${stats.extracted || 0}</span>
                            <span class="bm-stat-label">已抓取</span>
                        </div>
                        <div class="bm-stat-item">
                            <span class="bm-stat-value">${stats.dueToday || 0}</span>
                            <span class="bm-stat-label">待复习</span>
                        </div>
                    </div>

                    <!-- 操作栏 -->
                    <div class="bm-action-bar">
                        <button class="bm-action-btn" id="bm-process-btn" title="处理书签（生成 Embedding）">
                            <i class="fas fa-magic"></i> 开始处理
                        </button>
                        <button class="bm-action-btn" id="bm-extract-btn" title="批量抓取网页摘要（增强搜索语义）">
                            <i class="fas fa-file-alt"></i> 批量抓取
                        </button>
                        <button class="bm-action-btn" id="bm-review-btn" title="启用间隔复习（SM-2 算法）">
                            <i class="fas fa-book-reader"></i> 启用复习
                        </button>
                        <button class="bm-action-btn" id="bm-sync-btn" title="重新同步书签目录">
                            <i class="fas fa-sync-alt"></i> 同步
                        </button>
                        <button class="bm-action-btn" id="bm-settings-btn" title="设置">
                            <i class="fas fa-cog"></i> 设置
                        </button>
                    </div>

                    <!-- 进度条（处理时显示） -->
                    <div class="bm-progress-bar hidden" id="bm-progress-bar">
                        <div class="bm-progress-track">
                            <div class="bm-progress-fill" id="bm-progress-fill"></div>
                        </div>
                        <span class="bm-progress-text" id="bm-progress-text">0%</span>
                    </div>

                    <!-- 书签列表 -->
                    <div class="bm-list" id="bm-list">
                        ${this._renderBookmarkList(rag.bookmarks)}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        // 事件绑定
        document.getElementById('bookmark-panel-close').addEventListener('click', () => panel.remove());
        panel.querySelector('.about-overlay').addEventListener('click', () => panel.remove());
        panel.addEventListener('click', (e) => {
            if (e.target === panel) panel.remove();
        });

        const searchInput = document.getElementById('bm-search-input');
        let searchTimeout = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                const query = searchInput.value;
                const hint = document.getElementById('bm-search-hint');
                const list = document.getElementById('bm-list');

                if (!query.trim()) {
                    list.innerHTML = this._renderBookmarkList(rag.bookmarks);
                    hint.textContent = `${rag.bookmarks.length} 条书签`;
                } else {
                    hint.textContent = '搜索中...';
                    const results = await rag.hybridSearch(query);
                    list.innerHTML = this._renderBookmarkList(results);
                    const semantic = results.filter(r => r._matchType === 'semantic' || r._matchType === 'hybrid').length;
                    hint.textContent = semantic > 0
                        ? `${results.length} 条结果（含 ${semantic} 条语义匹配）`
                        : `${results.length} 条结果`;
                }
                this._bindBookmarkListEvents(rag);
            }, 300);
        });

        document.getElementById('bm-sync-btn').addEventListener('click', async () => {
            await rag.syncBookmarks();
            const newStats = rag.getStats();
            document.getElementById('bm-list').innerHTML = this._renderBookmarkList(rag.bookmarks);
            document.getElementById('bm-search-hint').textContent = `${newStats.total} 条书签`;
            this._bindBookmarkListEvents(rag);
        });

        document.getElementById('bm-settings-btn').addEventListener('click', () => {
            panel.remove();
            this.showBookmarkWizard();
        });

        document.getElementById('bm-review-btn').addEventListener('click', async () => {
            const reviewBtn = document.getElementById('bm-review-btn');
            const template = rag.settings?.reviewTemplate || 'regular';
            const count = await rag.enableReview(template);
            if (count > 0) {
                this.showToast(`已为 ${count} 条书签启用间隔复习（${BookmarkSRS.TEMPLATES[template]?.name || '默认'}）`);
                reviewBtn.innerHTML = '<i class="fas fa-check-circle"></i> 已启用';
                setTimeout(() => {
                    reviewBtn.innerHTML = '<i class="fas fa-book-reader"></i> 启用复习';
                }, 2000);
                this.initReadingRecommendation();
            } else {
                this.showToast('所有书签已在复习计划中');
            }
        });

        document.getElementById('bm-process-btn').addEventListener('click', async () => {
            const btn = document.getElementById('bm-process-btn');
            const progressBar = document.getElementById('bm-progress-bar');
            const progressFill = document.getElementById('bm-progress-fill');
            const progressText = document.getElementById('bm-progress-text');

            if (rag.isProcessing) {
                rag.cancelProcessing();
                btn.innerHTML = '<i class="fas fa-magic"></i> 开始处理';
                progressBar.classList.add('hidden');
                return;
            }

            if (!rag.settings?.aiApiKey) {
                this.showToast('请先配置 AI 服务');
                return;
            }

            btn.innerHTML = '<i class="fas fa-stop-circle"></i> 停止';
            progressBar.classList.remove('hidden');

            const result = await rag.processBookmarks(({ processed, failed, total, percent }) => {
                progressFill.style.width = percent + '%';
                progressText.textContent = `${processed}/${total}（${percent}%）`;
            });

            btn.innerHTML = '<i class="fas fa-check-circle"></i> 已处理';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-magic"></i> 开始处理';
                progressBar.classList.add('hidden');
            }, 3000);

            const newStats = rag.getStats();
            document.getElementById('bm-list').innerHTML = this._renderBookmarkList(rag.bookmarks);
            this._bindBookmarkListEvents(rag);

            if (result.failed > 0) {
                this.showToast(`处理完成：${result.processed} 成功，${result.failed} 失败`, 4000);
            } else {
                this.showToast(`已完成 ${result.processed} 条书签的 Embedding 处理`);
            }
        });

        document.getElementById('bm-extract-btn').addEventListener('click', async () => {
            const btn = document.getElementById('bm-extract-btn');
            const progressBar = document.getElementById('bm-progress-bar');
            const progressFill = document.getElementById('bm-progress-fill');
            const progressText = document.getElementById('bm-progress-text');

            if (rag._batchExtractCancelled === false) {
                rag.cancelBatchExtract();
                btn.innerHTML = '<i class="fas fa-file-alt"></i> 批量抓取';
                progressBar.classList.add('hidden');
                return;
            }

            if (!rag.settings?.aiApiKey) {
                this.showToast('请先配置 AI 服务');
                return;
            }

            const summaryStats = rag.getSummaryStats();
            if (summaryStats.remaining === 0) {
                this.showToast('所有书签摘要已抓取完成');
                return;
            }

            const hasPermission = await this._requestHostPermission();
            if (!hasPermission) {
                this.showToast('需要网页访问权限才能抓取摘要');
                return;
            }

            btn.innerHTML = '<i class="fas fa-stop-circle"></i> 停止抓取';
            progressBar.classList.remove('hidden');

            const result = await rag.batchExtractSummaries(({ processed, failed, total, percent }) => {
                progressFill.style.width = percent + '%';
                progressText.textContent = `抓取 ${processed + failed}/${total}（${percent}%）`;
            });

            btn.innerHTML = '<i class="fas fa-check-circle"></i> 抓取完成';
            setTimeout(() => {
                btn.innerHTML = '<i class="fas fa-file-alt"></i> 批量抓取';
                progressBar.classList.add('hidden');
            }, 3000);

            document.getElementById('bm-list').innerHTML = this._renderBookmarkList(rag.bookmarks);
            this._bindBookmarkListEvents(rag);

            if (result.failed > 0) {
                this.showToast(`抓取完成：${result.processed} 成功，${result.failed} 失败`, 4000);
            } else {
                this.showToast(`已完成 ${result.processed} 条书签的摘要抓取`);
            }
        });

        this._bindBookmarkListEvents(rag);
    }

    async _requestHostPermission() {
        return new Promise(resolve => {
            if (chrome.permissions) {
                chrome.permissions.request(
                    { origins: ['<all_urls>'] },
                    (granted) => resolve(granted)
                );
            } else {
                resolve(false);
            }
        });
    }

    _renderBookmarkList(bookmarks) {
        if (!bookmarks || bookmarks.length === 0) {
            return '<div class="bm-empty"><i class="fas fa-bookmark" style="font-size:24px; opacity:0.3; margin-bottom:8px;"></i><span>暂无书签</span></div>';
        }

        return bookmarks.slice(0, 100).map(bm => {
            let badge = '';
            if (bm._matchType === 'keyword') badge = '<span class="bm-match-badge keyword">关键词</span>';
            else if (bm._matchType === 'semantic') {
                const pct = bm._vectorScore ? Math.round(bm._vectorScore * 100) : '';
                badge = `<span class="bm-match-badge semantic">AI ${pct ? pct + '%' : ''}</span>`;
            } else if (bm._matchType === 'hybrid') {
                badge = '<span class="bm-match-badge hybrid">混合</span>';
            }

            const embeddedIcon = bm.embeddingDone ? '<i class="fas fa-brain bm-embedded-icon" title="已 Embedding"></i>' : '';

            const summaryHtml = bm.summary
                ? `<div class="bm-item-summary" title="${this._escHtml(bm.summary)}"><i class="fas fa-file-alt"></i> ${this._escHtml(bm.summary.substring(0, 50))}${bm.summary.length > 50 ? '…' : ''}</div>`
                : '';

            const extractBtn = bm.contentExtractedAt
                ? ''
                : `<button class="bm-item-extract-btn" data-bm-id="${bm.id}" title="抓取摘要"><i class="fas fa-download"></i></button>`;

            return `
            <div class="bm-item" data-url="${this._escHtml(bm.url)}" data-id="${bm.id}">
                <img class="bm-item-favicon" src="https://www.google.com/s2/favicons?domain=${this._escHtml(bm.domain)}&sz=32" alt="" loading="lazy">
                <div class="bm-item-info">
                    <div class="bm-item-title">${this._escHtml(bm.title)} ${embeddedIcon}</div>
                    <div class="bm-item-url">${this._escHtml(bm.domain)}</div>
                    ${summaryHtml}
                </div>
                ${badge}
                ${extractBtn}
                <button class="bm-item-task-btn" data-bm-title="${this._escHtml(bm.title)}" data-bm-url="${this._escHtml(bm.url)}" title="转为任务">
                    <i class="fas fa-plus-circle"></i>
                </button>
            </div>`;
        }).join('');
    }

    _bindBookmarkListEvents(rag) {
        document.querySelectorAll('#bm-list .bm-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.bm-item-task-btn') || e.target.closest('.bm-item-extract-btn')) return;
                const url = item.dataset.url;
                if (url) window.open(url, '_blank');
            });
        });

        document.querySelectorAll('#bm-list .bm-item-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const title = btn.dataset.bmTitle;
                const url = btn.dataset.bmUrl;
                const panel = document.getElementById('bookmark-panel');
                if (panel) panel.remove();
                this._createTaskFromBookmark(title, url);
            });
        });

        document.querySelectorAll('#bm-list .bm-item-extract-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const bmId = btn.dataset.bmId;
                const ragInstance = rag || this._bookmarkRAG;
                if (!ragInstance) return;

                const bm = ragInstance.bookmarks.find(b => b.id === bmId);
                if (!bm) return;

                const hasPermission = await this._requestHostPermission();
                if (!hasPermission) {
                    this.showToast('需要网页访问权限才能抓取摘要');
                    return;
                }

                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                btn.disabled = true;

                try {
                    await ragInstance.extractAndSummarize(bm, (status) => {
                        if (status === 'extracting') btn.title = '正在抓取页面...';
                        else if (status === 'summarizing') btn.title = '正在生成摘要...';
                        else if (status === 're-embedding') btn.title = '正在更新向量...';
                    });

                    const itemEl = btn.closest('.bm-item');
                    const infoEl = itemEl?.querySelector('.bm-item-info');
                    if (infoEl && bm.summary) {
                        const existingSummary = infoEl.querySelector('.bm-item-summary');
                        if (existingSummary) existingSummary.remove();
                        const summaryDiv = document.createElement('div');
                        summaryDiv.className = 'bm-item-summary';
                        summaryDiv.title = bm.summary;
                        summaryDiv.innerHTML = `<i class="fas fa-file-alt"></i> ${this._escHtml(bm.summary.substring(0, 50))}${bm.summary.length > 50 ? '…' : ''}`;
                        infoEl.appendChild(summaryDiv);
                    }
                    btn.remove();
                    this.showToast('摘要抓取成功');
                } catch (err) {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    this.showToast(`抓取失败: ${err.message}`, 3000);
                }
            });
        });
    }

    _escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== Spotlight 搜索 (Ctrl+K) ==========

    toggleSpotlightSearch() {
        const existing = document.getElementById('bm-spotlight');
        if (existing) {
            this._closeSpotlight();
        } else {
            this._openSpotlight();
        }
    }

    async _openSpotlight() {
        if (document.getElementById('bm-spotlight')) return;

        if (!this._bookmarkRAG) {
            this._bookmarkRAG = new BookmarkRAG();
            await this._bookmarkRAG.init();
        }
        const rag = this._bookmarkRAG;

        if (!rag.isConfigured()) {
            this.showToast('请先配置书签检索（侧边栏 → 书签检索按钮）');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'bm-spotlight-overlay';
        overlay.id = 'bm-spotlight';
        overlay.innerHTML = `
            <div class="bm-spotlight-box">
                <div class="bm-spotlight-header">
                    <i class="fas fa-search bm-spotlight-icon"></i>
                    <input type="text" class="bm-spotlight-input" id="bm-spotlight-input"
                        placeholder="搜索书签...（支持自然语言，语义搜索已${rag._vectorMap.size > 0 ? '就绪' : '关闭'}）" autofocus>
                    <span class="bm-spotlight-hint">ESC 关闭</span>
                </div>
                <div class="bm-spotlight-results" id="bm-spotlight-results">
                    <div class="bm-spotlight-tip">输入关键词或描述需求搜索书签，支持中英文混合与语义匹配</div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = document.getElementById('bm-spotlight-input');
        const results = document.getElementById('bm-spotlight-results');
        let selectedIdx = -1;
        let currentResults = [];
        let currentQuery = '';
        let searchTimeout = null;
        let isReranking = false;

        input.focus();

        input.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const query = input.value.trim();
            currentQuery = query;
            if (!query) {
                results.innerHTML = '<div class="bm-spotlight-tip">输入关键词或描述需求搜索书签，支持中英文混合与语义匹配</div>';
                currentResults = [];
                selectedIdx = -1;
                return;
            }
            results.innerHTML = '<div class="bm-spotlight-tip"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';
            searchTimeout = setTimeout(async () => {
                currentResults = await rag.hybridSearch(query, 15);
                selectedIdx = currentResults.length > 0 ? 0 : -1;
                this._renderSpotlightResults(results, currentResults, selectedIdx, currentQuery);
            }, 250);
        });

        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                this._closeSpotlight();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    selectedIdx = (selectedIdx + 1) % currentResults.length;
                    this._renderSpotlightResults(results, currentResults, selectedIdx, currentQuery);
                }
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentResults.length > 0) {
                    selectedIdx = selectedIdx <= 0 ? currentResults.length - 1 : selectedIdx - 1;
                    this._renderSpotlightResults(results, currentResults, selectedIdx, currentQuery);
                }
            }
            if (e.key === 'Enter' && currentResults.length > 0 && selectedIdx >= 0) {
                e.preventDefault();
                const bm = currentResults[selectedIdx];
                if (bm?.url) window.open(bm.url, '_blank');
                this._closeSpotlight();
            }
        };
        input.addEventListener('keydown', handleKeydown);

        overlay.addEventListener('click', async (e) => {
            if (e.target === overlay) { this._closeSpotlight(); return; }
            const rerankBtn = e.target.closest('.bm-spotlight-rerank-btn');
            if (rerankBtn && !isReranking && currentResults.length >= 3 && currentQuery) {
                isReranking = true;
                rerankBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> AI 正在分析...';
                rerankBtn.disabled = true;

                try {
                    const expandedResults = await rag.hybridSearch(currentQuery, 30);
                    const reranked = await rag.rerank(currentQuery, expandedResults);
                    currentResults = reranked;
                    selectedIdx = currentResults.length > 0 ? 0 : -1;
                    this._renderSpotlightResults(results, currentResults, selectedIdx, currentQuery, true);
                } catch (err) {
                    rerankBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 精排失败: ${err.message.slice(0, 30)}`;
                    setTimeout(() => {
                        rerankBtn.innerHTML = '<i class="fas fa-magic"></i> AI 精排';
                        rerankBtn.disabled = false;
                    }, 3000);
                } finally {
                    isReranking = false;
                }
            }
        });
    }

    _renderSpotlightResults(container, results, selectedIdx, query, isReranked = false) {
        if (results.length === 0) {
            container.innerHTML = '<div class="bm-spotlight-tip">未找到匹配的书签</div>';
            return;
        }

        let html = '';
        let globalIdx = 0;

        if (isReranked) {
            const elapsed = results[0]?._rerankElapsed || '';
            html += `<div class="bm-spotlight-section"><span class="bm-spotlight-section-label"><i class="fas fa-magic"></i> AI 精排结果</span>
                <span class="bm-spotlight-rerank-info">✅ 已重排 ${results.length} 条${elapsed ? `（${elapsed}s）` : ''}</span></div>`;
            for (const bm of results) {
                const isSelected = globalIdx === selectedIdx;
                html += this._renderSpotlightItem(bm, globalIdx, isSelected);
                globalIdx++;
            }
        } else {
            const keywordItems = results.filter(r => r._matchType === 'keyword');
            const semanticItems = results.filter(r => r._matchType === 'semantic' || r._matchType === 'hybrid');

            if (keywordItems.length > 0) {
                html += `<div class="bm-spotlight-section"><span class="bm-spotlight-section-label"><i class="fas fa-font"></i> 关键词匹配 (${keywordItems.length})</span></div>`;
                for (const bm of keywordItems) {
                    html += this._renderSpotlightItem(bm, globalIdx, globalIdx === selectedIdx);
                    globalIdx++;
                }
            }

            if (semanticItems.length > 0) {
                html += `<div class="bm-spotlight-section"><span class="bm-spotlight-section-label"><i class="fas fa-brain"></i> 语义推荐 (${semanticItems.length})</span></div>`;
                for (const bm of semanticItems) {
                    html += this._renderSpotlightItem(bm, globalIdx, globalIdx === selectedIdx);
                    globalIdx++;
                }
            }

            if (!keywordItems.length && !semanticItems.length) {
                for (const bm of results) {
                    html += this._renderSpotlightItem(bm, globalIdx, globalIdx === selectedIdx);
                    globalIdx++;
                }
            }

            if (results.length >= 3 && query) {
                html += `<div class="bm-spotlight-rerank-bar">
                    <button class="bm-spotlight-rerank-btn"><i class="fas fa-magic"></i> AI 精排</button>
                    <span class="bm-spotlight-rerank-desc">使用 LLM 智能重排序结果</span>
                </div>`;
            }
        }

        container.innerHTML = html;

        container.querySelectorAll('.bm-spotlight-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.bm-spotlight-task-btn')) return;
                const url = item.dataset.url;
                if (url) window.open(url, '_blank');
                this._closeSpotlight();
            });
        });

        container.querySelectorAll('.bm-spotlight-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const title = btn.dataset.bmTitle;
                const url = btn.dataset.bmUrl;
                this._closeSpotlight();
                this._createTaskFromBookmark(title, url);
            });
        });

        const sel = container.querySelector('.bm-spotlight-item.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }

    _renderSpotlightItem(bm, idx, isSelected) {
        let badge = '';
        if (bm._matchType === 'reranked') {
            const score = bm._rerankScore ? `${bm._rerankScore}` : '';
            badge = `<span class="bm-spotlight-badge reranked">${score ? score + '分' : '✨'}</span>`;
        } else if (bm._matchType === 'semantic' || bm._matchType === 'hybrid') {
            const pct = bm._vectorScore ? Math.round(bm._vectorScore * 100) + '%' : '';
            badge = `<span class="bm-spotlight-badge semantic">${pct || 'AI'}</span>`;
        }

        const summaryLine = bm.summary
            ? `<div class="bm-spotlight-item-summary">${this._escHtml(bm.summary.substring(0, 60))}${bm.summary.length > 60 ? '…' : ''}</div>`
            : '';
        const reasonLine = bm._rerankReason
            ? `<div class="bm-spotlight-item-reason"><i class="fas fa-lightbulb"></i> ${this._escHtml(bm._rerankReason)}</div>`
            : '';

        return `
        <div class="bm-spotlight-item ${isSelected ? 'selected' : ''}" data-idx="${idx}" data-url="${this._escHtml(bm.url)}">
            <img class="bm-spotlight-favicon" src="https://www.google.com/s2/favicons?domain=${this._escHtml(bm.domain)}&sz=32" alt="">
            <div class="bm-spotlight-item-info">
                <div class="bm-spotlight-item-title">${this._escHtml(bm.title)}</div>
                <div class="bm-spotlight-item-url">${this._escHtml(bm.domain)}</div>
                ${summaryLine}
                ${reasonLine}
            </div>
            ${badge}
            <button class="bm-spotlight-task-btn" data-bm-title="${this._escHtml(bm.title)}" data-bm-url="${this._escHtml(bm.url)}" title="转为任务">
                <i class="fas fa-plus-circle"></i>
            </button>
        </div>`;
    }

    _closeSpotlight() {
        const el = document.getElementById('bm-spotlight');
        if (el) el.remove();
    }

    /**
     * 书签配置向导
     */
    async showBookmarkWizard() {
        const existing = document.getElementById('bookmark-wizard-panel');
        if (existing) existing.remove();

        if (!this._bookmarkRAG) {
            this._bookmarkRAG = new BookmarkRAG();
            await this._bookmarkRAG.init();
        }

        const rag = this._bookmarkRAG;
        let wizardStep = 1;

        const panel = document.createElement('div');
        panel.className = 'about-panel active';
        panel.id = 'bookmark-wizard-panel';
        panel.innerHTML = `
            <div class="about-overlay"></div>
            <div class="about-content" style="max-width: 480px;">
                <div class="about-header">
                    <h3><i class="fas fa-magic" style="margin-right: 8px; opacity: 0.6;"></i>书签检索配置</h3>
                    <button class="about-close" id="bm-wizard-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="about-body" style="padding: 20px;">
                    <!-- 步骤指示器 -->
                    <div class="bm-wizard-steps">
                        <div class="bm-wizard-step active" data-step="1">
                            <div class="bm-wizard-step-dot">1</div>
                            <span class="bm-wizard-step-label">AI 服务</span>
                        </div>
                        <div class="bm-wizard-step-line"></div>
                        <div class="bm-wizard-step" data-step="2">
                            <div class="bm-wizard-step-dot">2</div>
                            <span class="bm-wizard-step-label">API 密钥</span>
                        </div>
                        <div class="bm-wizard-step-line"></div>
                        <div class="bm-wizard-step" data-step="3">
                            <div class="bm-wizard-step-dot">3</div>
                            <span class="bm-wizard-step-label">书签目录</span>
                        </div>
                    </div>

                    <!-- Step 1: 选择 AI 服务 -->
                    <div class="bm-wizard-panel active" id="bm-wiz-step1">
                        <div class="bm-wizard-title">选择 AI 服务商</div>
                        <div class="bm-provider-grid" id="bm-provider-grid">
                            ${Object.entries(rag.AI_PROVIDERS).map(([key, p]) => `
                                <div class="bm-provider-card ${rag.settings.aiProvider === key ? 'selected' : ''}" data-provider="${key}">
                                    <div class="bm-provider-name">${p.name}</div>
                                    <div class="bm-provider-desc">${p.desc}</div>
                                    <div class="bm-provider-price">${p.pricing}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Step 2: 输入 API Key -->
                    <div class="bm-wizard-panel" id="bm-wiz-step2">
                        <div class="bm-wizard-title">配置 API 密钥</div>
                        <div class="form-group" style="margin-bottom:12px;">
                            <label style="display:block; font-size:12px; color:rgba(255,255,255,0.5); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">API Key</label>
                            <input type="password" id="bm-api-key-input" class="bm-wizard-input" placeholder="sk-..." value="${rag.settings.aiApiKey || ''}">
                        </div>
                        <div class="form-group" id="bm-custom-url-group" style="display:none; margin-bottom:12px;">
                            <label style="display:block; font-size:12px; color:rgba(255,255,255,0.5); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">API 地址</label>
                            <input type="url" id="bm-api-url-input" class="bm-wizard-input" placeholder="https://api.example.com/v1" value="${rag.settings.aiBaseUrl || ''}">
                        </div>
                        <div class="form-group" id="bm-custom-model-group" style="display:none; margin-bottom:12px;">
                            <label style="display:block; font-size:12px; color:rgba(255,255,255,0.5); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px;">模型名称</label>
                            <input type="text" id="bm-model-input" class="bm-wizard-input" placeholder="模型名称">
                        </div>
                        <div class="bm-key-actions">
                            <a href="#" id="bm-get-key-link" target="_blank" class="bm-key-link"><i class="fas fa-external-link-alt"></i> 获取 API Key</a>
                            <button class="bm-verify-btn" id="bm-verify-btn"><i class="fas fa-check-circle"></i> 验证连通性</button>
                        </div>
                        <div class="bm-verify-result hidden" id="bm-verify-result"></div>
                    </div>

                    <!-- Step 3: 选择书签目录 -->
                    <div class="bm-wizard-panel" id="bm-wiz-step3">
                        <div class="bm-wizard-title">选择书签目录</div>
                        <div class="bm-folder-list" id="bm-folder-list">
                            <div style="text-align:center; padding:20px; color:rgba(255,255,255,0.4);">
                                <i class="fas fa-spinner fa-spin"></i> 加载书签目录...
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 底部按钮 -->
                <div class="bm-wizard-footer">
                    <button class="btn-cancel" id="bm-wiz-prev" style="visibility:hidden;">
                        <i class="fas fa-arrow-left" style="margin-right:4px;"></i> 上一步
                    </button>
                    <button class="btn-save" id="bm-wiz-next">
                        下一步 <i class="fas fa-arrow-right" style="margin-left:4px;"></i>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        let selectedProvider = rag.settings.aiProvider || '';
        let selectedFolders = new Set(rag.settings.folderIds || []);

        const updateSteps = () => {
            panel.querySelectorAll('.bm-wizard-step').forEach(s => {
                const step = parseInt(s.dataset.step);
                s.classList.toggle('active', step === wizardStep);
                s.classList.toggle('done', step < wizardStep);
                if (step < wizardStep) {
                    s.querySelector('.bm-wizard-step-dot').innerHTML = '<i class="fas fa-check"></i>';
                } else {
                    s.querySelector('.bm-wizard-step-dot').textContent = step;
                }
            });
            panel.querySelectorAll('.bm-wizard-panel').forEach(p => p.classList.remove('active'));
            const activePanel = document.getElementById(`bm-wiz-step${wizardStep}`);
            if (activePanel) activePanel.classList.add('active');

            const prevBtn = document.getElementById('bm-wiz-prev');
            const nextBtn = document.getElementById('bm-wiz-next');
            prevBtn.style.visibility = wizardStep > 1 ? 'visible' : 'hidden';
            if (wizardStep === 3) {
                nextBtn.innerHTML = '<i class="fas fa-check" style="margin-right:4px;"></i> 完成';
            } else {
                nextBtn.innerHTML = '下一步 <i class="fas fa-arrow-right" style="margin-left:4px;"></i>';
            }
        };

        // Provider 选择
        panel.querySelectorAll('.bm-provider-card').forEach(card => {
            card.addEventListener('click', () => {
                panel.querySelectorAll('.bm-provider-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                selectedProvider = card.dataset.provider;

                const isCustom = selectedProvider === 'custom';
                const urlGroup = document.getElementById('bm-custom-url-group');
                const modelGroup = document.getElementById('bm-custom-model-group');
                if (urlGroup) urlGroup.style.display = isCustom ? 'block' : 'none';
                if (modelGroup) modelGroup.style.display = isCustom ? 'block' : 'none';

                const keyLink = document.getElementById('bm-get-key-link');
                const provider = rag.AI_PROVIDERS[selectedProvider];
                if (keyLink && provider?.keyUrl) {
                    keyLink.href = provider.keyUrl;
                    keyLink.style.display = '';
                } else if (keyLink) {
                    keyLink.style.display = 'none';
                }
            });
        });

        // 验证按钮
        document.getElementById('bm-verify-btn').addEventListener('click', async () => {
            const apiKey = document.getElementById('bm-api-key-input').value.trim();
            const baseUrl = document.getElementById('bm-api-url-input')?.value.trim() || '';
            const resultEl = document.getElementById('bm-verify-result');

            resultEl.classList.remove('hidden');
            resultEl.className = 'bm-verify-result verifying';
            resultEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 验证中...';

            const result = await rag.verifyApiKey(selectedProvider, apiKey, baseUrl);
            if (result.ok) {
                resultEl.className = 'bm-verify-result success';
                resultEl.innerHTML = '<i class="fas fa-check-circle"></i> 连接成功！';
            } else {
                resultEl.className = 'bm-verify-result error';
                resultEl.innerHTML = `<i class="fas fa-times-circle"></i> ${result.error}`;
            }
        });

        // 导航
        document.getElementById('bm-wiz-prev').addEventListener('click', () => {
            if (wizardStep > 1) { wizardStep--; updateSteps(); }
        });

        document.getElementById('bm-wiz-next').addEventListener('click', async () => {
            if (wizardStep === 1) {
                if (!selectedProvider) {
                    this.showToast('请选择一个 AI 服务商');
                    return;
                }
                wizardStep = 2;
                updateSteps();

                const isCustom = selectedProvider === 'custom';
                const urlGroup = document.getElementById('bm-custom-url-group');
                const modelGroup = document.getElementById('bm-custom-model-group');
                if (urlGroup) urlGroup.style.display = isCustom ? 'block' : 'none';
                if (modelGroup) modelGroup.style.display = isCustom ? 'block' : 'none';

                const keyLink = document.getElementById('bm-get-key-link');
                const provider = rag.AI_PROVIDERS[selectedProvider];
                if (keyLink && provider?.keyUrl) {
                    keyLink.href = provider.keyUrl;
                    keyLink.style.display = '';
                } else if (keyLink) {
                    keyLink.style.display = 'none';
                }
            } else if (wizardStep === 2) {
                const apiKey = document.getElementById('bm-api-key-input').value.trim();
                if (!apiKey) {
                    this.showToast('请输入 API Key');
                    return;
                }
                wizardStep = 3;
                updateSteps();

                // 请求书签权限并加载目录
                const hasPermission = await rag.hasBookmarkPermission();
                if (!hasPermission) {
                    const granted = await rag.requestBookmarkPermission();
                    if (!granted) {
                        this.showToast('需要书签权限才能使用此功能');
                        wizardStep = 2;
                        updateSteps();
                        return;
                    }
                }

                const folders = await rag.getBookmarkFolders();
                const folderList = document.getElementById('bm-folder-list');
                if (folders.length === 0) {
                    folderList.innerHTML = '<div style="text-align:center; padding:20px; color:rgba(255,255,255,0.4);">未找到书签文件夹</div>';
                } else {
                    folderList.innerHTML = folders.map(f => `
                        <div class="bm-folder-item ${selectedFolders.has(f.id) ? 'selected' : ''}" data-folder-id="${f.id}" style="padding-left: ${12 + f.depth * 16}px;">
                            <div class="bm-folder-check"><i class="fas ${selectedFolders.has(f.id) ? 'fa-check-square' : 'fa-square'}"></i></div>
                            <i class="fas fa-folder bm-folder-icon"></i>
                            <div class="bm-folder-info">
                                <span class="bm-folder-name">${this._escHtml(f.title)}</span>
                                <span class="bm-folder-count">${f.totalBookmarks} 个书签</span>
                            </div>
                        </div>
                    `).join('');

                    folderList.querySelectorAll('.bm-folder-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const fid = item.dataset.folderId;
                            if (selectedFolders.has(fid)) {
                                selectedFolders.delete(fid);
                                item.classList.remove('selected');
                                item.querySelector('.bm-folder-check i').className = 'fas fa-square';
                            } else {
                                selectedFolders.add(fid);
                                item.classList.add('selected');
                                item.querySelector('.bm-folder-check i').className = 'fas fa-check-square';
                            }
                        });
                    });
                }
            } else if (wizardStep === 3) {
                if (selectedFolders.size === 0) {
                    this.showToast('请至少选择一个书签文件夹');
                    return;
                }

                const apiKey = document.getElementById('bm-api-key-input').value.trim();
                const baseUrl = document.getElementById('bm-api-url-input')?.value.trim() || '';
                const model = document.getElementById('bm-model-input')?.value.trim() || '';
                const provider = rag.AI_PROVIDERS[selectedProvider];

                const folders = await rag.getBookmarkFolders();
                const selectedNames = folders.filter(f => selectedFolders.has(f.id)).map(f => f.title);

                await rag.saveSettings({
                    enabled: true,
                    aiProvider: selectedProvider,
                    aiApiKey: apiKey,
                    aiBaseUrl: baseUrl || provider.baseUrl,
                    aiModel: model || provider.defaultModel,
                    embeddingModel: provider.embeddingModel,
                    folderIds: Array.from(selectedFolders),
                    folderNames: selectedNames
                });

                await rag.syncBookmarks();
                rag.startWatching();

                panel.remove();
                this.showToast(`已配置 ${selectedNames.join('、')}，共 ${rag.bookmarks.length} 条书签`, 3000);
                this.showBookmarkPanel();
            }
        });

        // 关闭
        document.getElementById('bm-wizard-close').addEventListener('click', () => panel.remove());
        panel.querySelector('.about-overlay').addEventListener('click', () => panel.remove());
    }

    // ==================== 关于与帮助面板 ====================

    /**
     * 显示关于与帮助面板
     */
    async showAboutPanel() {
        const existingPanel = document.getElementById('about-panel');
        if (existingPanel) existingPanel.remove();

        // 获取存储使用情况
        const dataStr = JSON.stringify(this.memos);
        const sizeBytes = new Blob([dataStr]).size;
        const sizeKB = (sizeBytes / 1024).toFixed(1);
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
        
        // 获取扩展版本
        const manifest = chrome.runtime.getManifest();
        const version = manifest.version;
        
        // 获取任务统计
        const totalTasks = this.memos.length;
        const completedTasks = this.memos.filter(m => m.completed).length;
        const tasksWithImages = this.memos.filter(m => m.images && m.images.length > 0).length;

        const panel = document.createElement('div');
        panel.id = 'about-panel';
        panel.className = 'about-panel';

        panel.innerHTML = `
            <div class="about-overlay"></div>
            <div class="about-content">
                <div class="about-header">
                    <h3><i class="fas fa-info-circle"></i> 关于与帮助</h3>
                    <button class="about-close" id="about-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="about-body">
                    <!-- 版本信息 -->
                    <div class="about-hero">
                        <div class="about-logo">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="about-title-area">
                            <h2>中国风景时钟</h2>
                            <span class="about-version">版本 ${version}</span>
                        </div>
                    </div>
                    
                    <!-- 数据概览 -->
                    <div class="about-section">
                        <h4><i class="fas fa-database"></i> 数据概览</h4>
                        <div class="about-stats">
                            <div class="about-stat-item">
                                <span class="stat-number">${totalTasks}</span>
                                <span class="stat-label">任务总数</span>
                            </div>
                            <div class="about-stat-item">
                                <span class="stat-number">${completedTasks}</span>
                                <span class="stat-label">已完成</span>
                            </div>
                            <div class="about-stat-item">
                                <span class="stat-number">${tasksWithImages}</span>
                                <span class="stat-label">含图片</span>
                            </div>
                            <div class="about-stat-item">
                                <span class="stat-number">${sizeMB > 1 ? sizeMB + 'MB' : sizeKB + 'KB'}</span>
                                <span class="stat-label">数据大小</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 工作原理 -->
                    <div class="about-section">
                        <h4><i class="fas fa-cogs"></i> 工作原理</h4>
                        <div class="about-info-cards">
                            <div class="info-card">
                                <div class="info-card-icon"><i class="fas fa-hard-drive"></i></div>
                                <div class="info-card-content">
                                    <h5>本地存储</h5>
                                    <p>所有数据存储在 Chrome 浏览器的本地存储区域（chrome.storage.local），<strong>不会上传到任何服务器</strong>。</p>
                                </div>
                            </div>
                            <div class="info-card">
                                <div class="info-card-icon"><i class="fas fa-infinity"></i></div>
                                <div class="info-card-content">
                                    <h5>无限存储</h5>
                                    <p>已启用「无限存储」权限，数据不受 10MB 限制，可以放心添加任务和图片。</p>
                                </div>
                            </div>
                            <div class="info-card">
                                <div class="info-card-icon"><i class="fas fa-shield-halved"></i></div>
                                <div class="info-card-content">
                                    <h5>数据安全</h5>
                                    <p>清除浏览器历史记录<strong>不会</strong>删除扩展数据。但卸载扩展会删除所有数据，请提前备份。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 数据存储位置 -->
                    <div class="about-section">
                        <h4><i class="fas fa-folder-open"></i> 存储位置说明</h4>
                        <div class="storage-table">
                            <div class="storage-row header">
                                <span>数据类型</span>
                                <span>存储位置</span>
                                <span>说明</span>
                            </div>
                            <div class="storage-row">
                                <span><i class="fas fa-tasks"></i> 任务数据</span>
                                <span>chrome.storage.local</span>
                                <span>标题、内容、状态、图片等</span>
                            </div>
                            <div class="storage-row">
                                <span><i class="fas fa-folder"></i> 分类/标签</span>
                                <span>chrome.storage.sync</span>
                                <span>可跨设备同步（需登录 Chrome）</span>
                            </div>
                            <div class="storage-row">
                                <span><i class="fas fa-cog"></i> 用户设置</span>
                                <span>chrome.storage.sync</span>
                                <span>时间格式、天气设置等</span>
                            </div>
                            <div class="storage-row">
                                <span><i class="fas fa-image"></i> 背景缓存</span>
                                <span>chrome.storage.local</span>
                                <span>动态背景图片缓存</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 备份指南 -->
                    <div class="about-section">
                        <h4><i class="fas fa-life-ring"></i> 备份与恢复指南</h4>
                        <div class="backup-guide">
                            <div class="guide-step">
                                <div class="step-number">1</div>
                                <div class="step-content">
                                    <h5>定期导出备份</h5>
                                    <p>点击工具栏的 <i class="fas fa-cloud-download-alt"></i> 按钮，选择「导出全部数据」，将数据保存为 JSON 文件到本地磁盘。</p>
                                </div>
                            </div>
                            <div class="guide-step">
                                <div class="step-number">2</div>
                                <div class="step-content">
                                    <h5>安全存放备份文件</h5>
                                    <p>建议将备份文件存放在云盘（如 iCloud、Google Drive）或其他安全位置，避免单点故障。</p>
                                </div>
                            </div>
                            <div class="guide-step">
                                <div class="step-number">3</div>
                                <div class="step-content">
                                    <h5>恢复数据</h5>
                                    <p>需要恢复时，点击 <i class="fas fa-cloud-download-alt"></i> 按钮，选择「导入并合并」或「导入并覆盖」，选择之前保存的 JSON 文件即可。</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 常见问题 -->
                    <div class="about-section">
                        <h4><i class="fas fa-question-circle"></i> 常见问题</h4>
                        <div class="faq-list">
                            <details class="faq-item">
                                <summary>卸载扩展后数据会丢失吗？</summary>
                                <p>是的，卸载扩展会删除所有本地数据。请在卸载前使用备份功能导出数据。重新安装后可以导入恢复。</p>
                            </details>
                            <details class="faq-item">
                                <summary>数据会同步到其他设备吗？</summary>
                                <p>任务数据存储在本地，不会自动同步。分类和设置会通过 Chrome 同步功能同步（需登录 Chrome 账号）。如需在其他设备使用任务数据，请手动导出并导入。</p>
                            </details>
                            <details class="faq-item">
                                <summary>图片会占用很多空间吗？</summary>
                                <p>图片会自动压缩。缩略图约 5-10KB，查看原图约 50-100KB。已启用无限存储，通常不用担心空间问题。</p>
                            </details>
                            <details class="faq-item">
                                <summary>如何彻底删除所有数据？</summary>
                                <div class="faq-detailed">
                                    <p><strong>方法一：卸载扩展（推荐）</strong></p>
                                    <p>Chrome 设置 → 扩展程序 → 找到「中国风景时钟」→ 点击「移除」</p>
                                    <p class="faq-tip">这将删除所有扩展数据，包括任务、分类、设置等。</p>
                                    
                                    <p><strong>方法二：手动删除存储文件</strong></p>
                                    <p>如果需要手动清理，可以删除 Chrome 扩展数据文件夹：</p>
                                    ${this.getStoragePathHtml()}
                                    <p class="faq-warning">⚠️ 手动删除前请先关闭 Chrome 浏览器，操作需谨慎。</p>
                                </div>
                            </details>
                        </div>
                    </div>
                    
                    <!-- 快捷键 -->
                    <div class="about-section">
                        <h4><i class="fas fa-keyboard"></i> 键盘快捷键</h4>
                        <div class="shortcuts-list">
                            <div class="shortcut-item">
                                <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>
                                <span>切换背景图片</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Space</kbd>
                                <span>切换选中任务的完成状态</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>↑</kbd> <kbd>↓</kbd>
                                <span>在任务列表中移动选择</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Enter</kbd>
                                <span>编辑选中的任务</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Ctrl</kbd> + <kbd>K</kbd>
                                <span>书签智能搜索（Spotlight）</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Esc</kbd>
                                <span>关闭弹窗/取消编辑</span>
                            </div>
                        </div>
                    </div>
                    
                    <!-- 页脚 -->
                    <div class="about-footer">
                        <p>感谢使用中国风景时钟 ❤️</p>
                        <p class="about-copyright">数据安全，本地存储，隐私无忧</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        this.bindAboutPanelEvents(panel);
        requestAnimationFrame(() => panel.classList.add('active'));
    }

    /**
     * 绑定关于面板事件
     */
    bindAboutPanelEvents(panel) {
        const closeBtn = panel.querySelector('#about-close');
        const overlay = panel.querySelector('.about-overlay');
        
        const closePanel = () => {
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        };
        
        closeBtn?.addEventListener('click', closePanel);
        overlay?.addEventListener('click', closePanel);
        
        // ESC 关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                closePanel();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
        
        // 复制路径按钮
        panel.querySelectorAll('.copy-path-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const path = btn.dataset.path;
                if (path) {
                    navigator.clipboard.writeText(path).then(() => {
                        const originalText = btn.innerHTML;
                        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            btn.innerHTML = originalText;
                            btn.classList.remove('copied');
                        }, 2000);
                    }).catch(() => {
                        this.showToast('复制失败，请手动复制', 2000);
                    });
                }
            });
        });
    }

    /**
     * 获取存储路径的 HTML（区分 Windows/Mac/Linux）
     */
    getStoragePathHtml() {
        // 获取扩展 ID
        const extensionId = chrome.runtime.id || '扩展ID';
        
        // 检测操作系统
        const platform = navigator.platform.toLowerCase();
        const isMac = platform.includes('mac');
        const isWindows = platform.includes('win');
        
        // 定义各系统路径
        const macPath = `~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/${extensionId}/`;
        const winPath = `%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Local Extension Settings\\${extensionId}\\`;
        const linuxPath = `~/.config/google-chrome/Default/Local Extension Settings/${extensionId}/`;
        
        // 根据当前操作系统，优先显示对应路径，然后折叠显示其他系统
        let currentSystemHtml = '';
        let otherSystemsHtml = '';
        
        if (isMac) {
            currentSystemHtml = `
                <div class="path-box mac-path current-system">
                    <div class="path-header">
                        <i class="fab fa-apple"></i> macOS <span class="current-badge">当前系统</span>
                    </div>
                    <code>${macPath}</code>
                    <button class="copy-path-btn" data-path="${macPath}" title="复制路径">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <p class="path-tip">💡 <code>~</code> 表示用户主目录，可在访达中按 <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>G</kbd> 输入路径前往</p>
            `;
            otherSystemsHtml = `
                <details class="other-systems">
                    <summary>查看其他系统路径</summary>
                    <div class="path-box win-path">
                        <div class="path-header"><i class="fab fa-windows"></i> Windows</div>
                        <code>${winPath}</code>
                        <button class="copy-path-btn" data-path="${winPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                    <div class="path-box linux-path">
                        <div class="path-header"><i class="fab fa-linux"></i> Linux</div>
                        <code>${linuxPath}</code>
                        <button class="copy-path-btn" data-path="${linuxPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                </details>
            `;
        } else if (isWindows) {
            currentSystemHtml = `
                <div class="path-box win-path current-system">
                    <div class="path-header">
                        <i class="fab fa-windows"></i> Windows <span class="current-badge">当前系统</span>
                    </div>
                    <code>${winPath}</code>
                    <button class="copy-path-btn" data-path="${winPath}" title="复制路径">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
                <p class="path-tip">💡 可以在文件资源管理器地址栏直接粘贴路径，<code>%LOCALAPPDATA%</code> 会自动展开</p>
            `;
            otherSystemsHtml = `
                <details class="other-systems">
                    <summary>查看其他系统路径</summary>
                    <div class="path-box mac-path">
                        <div class="path-header"><i class="fab fa-apple"></i> macOS</div>
                        <code>${macPath}</code>
                        <button class="copy-path-btn" data-path="${macPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                    <div class="path-box linux-path">
                        <div class="path-header"><i class="fab fa-linux"></i> Linux</div>
                        <code>${linuxPath}</code>
                        <button class="copy-path-btn" data-path="${linuxPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                </details>
            `;
        } else {
            // Linux 或其他系统
            currentSystemHtml = `
                <div class="path-box linux-path current-system">
                    <div class="path-header">
                        <i class="fab fa-linux"></i> Linux <span class="current-badge">当前系统</span>
                    </div>
                    <code>${linuxPath}</code>
                    <button class="copy-path-btn" data-path="${linuxPath}" title="复制路径">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            `;
            otherSystemsHtml = `
                <details class="other-systems">
                    <summary>查看其他系统路径</summary>
                    <div class="path-box mac-path">
                        <div class="path-header"><i class="fab fa-apple"></i> macOS</div>
                        <code>${macPath}</code>
                        <button class="copy-path-btn" data-path="${macPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                    <div class="path-box win-path">
                        <div class="path-header"><i class="fab fa-windows"></i> Windows</div>
                        <code>${winPath}</code>
                        <button class="copy-path-btn" data-path="${winPath}" title="复制路径"><i class="fas fa-copy"></i></button>
                    </div>
                </details>
            `;
        }
        
        return currentSystemHtml + otherSystemsHtml;
    }

    /**
     * 显示日历面板（按日期回看完成任务）
     */
    showCalendarPanel() {
        const existingPanel = document.getElementById('calendar-panel');
        if (existingPanel) existingPanel.remove();

        this.calendarViewDate = this.calendarViewDate || new Date();
        // 统一将 viewDate 对齐到当月 1 号，避免跨月边界计算复杂度
        this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), this.calendarViewDate.getMonth(), 1);

        // 默认选中“今天”
        this.calendarSelectedDate = this.calendarSelectedDate || this.formatLocalDateYMD(new Date());

        const panel = document.createElement('div');
        panel.id = 'calendar-panel';
        panel.className = 'calendar-panel';

        this.renderCalendarPanelContent(panel);
        document.body.appendChild(panel);
        this.bindCalendarPanelEvents(panel);

        requestAnimationFrame(() => panel.classList.add('active'));
    }

    /**
     * 渲染日历面板内容
     * @param {HTMLElement} panel
     */
    renderCalendarPanelContent(panel) {
        const viewYear = this.calendarViewDate.getFullYear();
        const viewMonth = this.calendarViewDate.getMonth();

        const taskMapByCreated = this.buildTaskMapByCreatedDate();
        const taskMapBySpan = this.buildTaskMapByDateSpan();
        const selectedKey = this.calendarSelectedDate;
        const selectedTasks = taskMapBySpan.get(selectedKey) || taskMapByCreated.get(selectedKey) || [];

        const monthLabel = `${viewYear}年${viewMonth + 1}月`;
        const multiDayTasks = this.getMultiDayTasksForMonth(viewYear, viewMonth);

        panel.innerHTML = `
            <div class="calendar-overlay"></div>
            <div class="calendar-content">
                <div class="calendar-header">
                    <h3><i class="fas fa-calendar-days"></i> 日历回看</h3>
                    <button class="calendar-close" id="calendar-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="calendar-body">
                    <div class="calendar-left">
                        <div class="calendar-month-nav">
                            <button class="calendar-nav-btn" id="calendar-prev-month" title="上个月">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <div class="calendar-month-label">${monthLabel}</div>
                            <button class="calendar-nav-btn" id="calendar-next-month" title="下个月">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                            <button class="calendar-today-btn" id="calendar-today-btn" title="回到今天">今天</button>
                        </div>
                        ${this.renderCalendarMonthGrid(viewYear, viewMonth, taskMapBySpan)}
                        ${this.renderCalendarTrackArea(viewYear, viewMonth, multiDayTasks)}
                    </div>
                    <div class="calendar-details">
                        <div class="calendar-details-header">
                            <div class="calendar-details-date">${selectedKey}</div>
                            <div class="calendar-details-subtitle">共 ${selectedTasks.length} 项涉及任务</div>
                        </div>
                        <div class="calendar-task-list">
                            ${this.renderCalendarTaskList(selectedTasks)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染当前月网格（周一作为一周起始）
     * @param {number} year
     * @param {number} month 0-11
     * @param {Map<string, Object[]>} taskMap
     * @returns {string}
     */
    renderCalendarMonthGrid(year, month, taskMap) {
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const lastMonthDays = new Date(year, month, 0).getDate();

        // 周一为起始：JS getDay() 周日=0 → 转换为 周一=0...周日=6
        const firstWeekday = (firstDay.getDay() + 6) % 7;
        const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

        const todayKey = this.formatLocalDateYMD(new Date());
        const cells = [];

        for (let i = 0; i < totalCells; i++) {
            const dayOffset = i - firstWeekday + 1; // 1..daysInMonth
            let cellDate;
            let dayNumber;
            let isOutside = false;

            if (dayOffset < 1) {
                // 上月补位
                isOutside = true;
                dayNumber = lastMonthDays + dayOffset;
                cellDate = new Date(year, month - 1, dayNumber);
            } else if (dayOffset > daysInMonth) {
                // 下月补位
                isOutside = true;
                dayNumber = dayOffset - daysInMonth;
                cellDate = new Date(year, month + 1, dayNumber);
            } else {
                dayNumber = dayOffset;
                cellDate = new Date(year, month, dayNumber);
            }

            const key = this.formatLocalDateYMD(cellDate);
            const count = (taskMap.get(key) || []).length;
            const selected = key === this.calendarSelectedDate;
            const isToday = key === todayKey;
            
            // 获取农历信息
            const lunarInfo = this.getLunarInfoForDate(cellDate);

            // Scheme 4: 混合紧凑 — badge + 圆点(单日)/短线(多日)指示器
            let indicatorsHtml = '';
            if (count > 0 && !isOutside) {
                const dayTasks = taskMap.get(key) || [];
                const dots = dayTasks.slice(0, 4).map(t => {
                    const startKey = this.getTaskStartKey(t);
                    const isMulti = t.dueDate && t.dueDate !== startKey;
                    const color = this.getCategoryColor(t.categoryId) || '#64b4ff';
                    const actualColor = color === 'transparent' ? '#64b4ff' : color;
                    return isMulti
                        ? `<span class="cal-indicator-line" style="background:${actualColor}"></span>`
                        : `<span class="cal-indicator-dot" style="background:${actualColor}"></span>`;
                }).join('');
                indicatorsHtml = `<div class="cal-indicators">${dots}</div>`;
            }

            cells.push(`
                <div class="calendar-day ${isOutside ? 'outside' : ''} ${selected ? 'selected' : ''} ${isToday ? 'today' : ''}"
                     data-date="${key}">
                    <div class="calendar-day-number">${dayNumber}</div>
                    <div class="calendar-day-lunar ${lunarInfo.type}">${lunarInfo.text}</div>
                    ${count > 0 ? `<div class="calendar-day-badge">${count}</div>` : ''}
                    ${indicatorsHtml}
                </div>
            `);
        }

        return `
            <div class="calendar-grid">
                <div class="calendar-weekdays">
                    <div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div><div>日</div>
                </div>
                <div class="calendar-days">
                    ${cells.join('')}
                </div>
            </div>
        `;
    }
    
    /**
     * 渲染多日任务轨道区域（Scheme 5: 轨道模式）
     */
    renderCalendarTrackArea(year, month, multiDayTasks) {
        if (!multiDayTasks || multiDayTasks.length === 0) return '';
        
        const firstDay = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const lastMonthDays = new Date(year, month, 0).getDate();
        const firstWeekday = (firstDay.getDay() + 6) % 7;
        const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
        const weekCount = totalCells / 7;
        
        const cells = [];
        for (let i = 0; i < totalCells; i++) {
            const dayOffset = i - firstWeekday + 1;
            let cellDate;
            if (dayOffset < 1) cellDate = new Date(year, month - 1, lastMonthDays + dayOffset);
            else if (dayOffset > daysInMonth) cellDate = new Date(year, month + 1, dayOffset - daysInMonth);
            else cellDate = new Date(year, month, dayOffset);
            cells.push({ key: this.formatLocalDateYMD(cellDate), isOutside: dayOffset < 1 || dayOffset > daysInMonth });
        }
        
        let trackHtml = '';
        multiDayTasks.slice(0, 8).forEach(task => {
            const startKey = this.getTaskStartKey(task);
            const endKey = task.dueDate || startKey;
            const color = this.getCategoryColor(task.categoryId) || '#64b4ff';
            const actualColor = color === 'transparent' ? '#64b4ff' : color;
            const title = this.escapeHtml((task.title || '').substring(0, 16));
            
            let hasRow = false;
            for (let w = 0; w < weekCount; w++) {
                const weekCells = cells.slice(w * 7, (w + 1) * 7);
                const inWeek = weekCells.some(c => c.key >= startKey && c.key <= endKey && !c.isOutside);
                if (!inWeek) continue;
                
                if (!hasRow) {
                    trackHtml += `<div class="cal-track-label">${title}</div>`;
                    hasRow = true;
                }
                trackHtml += '<div class="cal-track-row">';
                weekCells.forEach(c => {
                    const inRange = c.key >= startKey && c.key <= endKey && !c.isOutside;
                    if (inRange) {
                        let seg = 'single';
                        if (c.key === startKey && c.key !== endKey) seg = 'start';
                        else if (c.key === endKey && c.key !== startKey) seg = 'end';
                        else if (c.key !== startKey && c.key !== endKey) seg = 'middle';
                        trackHtml += `<div class="cal-track-cell filled ${seg}" style="background:${actualColor}"></div>`;
                    } else {
                        trackHtml += '<div class="cal-track-cell"></div>';
                    }
                });
                trackHtml += '</div>';
            }
        });
        
        return `
            <div class="cal-track-container">
                <div class="cal-track-title">
                    <i class="fas fa-bars-staggered"></i> 多日任务轨道
                    <span class="cal-track-count">${multiDayTasks.length} 项</span>
                </div>
                ${trackHtml}
            </div>
        `;
    }

    /**
     * 获取指定日期的农历信息
     * @param {Date} date 
     * @returns {{text: string, type: string}} 显示文本和类型(festival/jieqi/normal)
     */
    getLunarInfoForDate(date) {
        // 检查 lunar-javascript 库是否可用
        if (typeof Solar === 'undefined') {
            return { text: '', type: '' };
        }
        
        try {
            const y = date.getFullYear();
            const m = date.getMonth() + 1;
            const d = date.getDate();
            
            const solar = Solar.fromYmd(y, m, d);
            const lunar = solar.getLunar();
            
            // 优先级：节气 > 农历节日 > 公历节日 > 农历初一(显示月份) > 农历日期
            
            // 1. 检查节气
            const jieQi = lunar.getJieQi();
            if (jieQi) {
                return { text: jieQi, type: 'jieqi' };
            }
            
            // 2. 检查农历节日
            const lunarFestivals = lunar.getFestivals();
            if (lunarFestivals && lunarFestivals.length > 0) {
                // 取第一个节日，截取前3个字符以免太长
                const festivalName = lunarFestivals[0];
                return { 
                    text: festivalName.length > 3 ? festivalName.substring(0, 3) : festivalName, 
                    type: 'festival' 
                };
            }
            
            // 3. 检查公历节日
            const solarFestivals = solar.getFestivals();
            if (solarFestivals && solarFestivals.length > 0) {
                const festivalName = solarFestivals[0];
                return { 
                    text: festivalName.length > 3 ? festivalName.substring(0, 3) : festivalName, 
                    type: 'festival' 
                };
            }
            
            // 4. 农历初一显示月份，其他显示日期
            const lunarDay = lunar.getDay();
            if (lunarDay === 1) {
                return { text: lunar.getMonthInChinese() + '月', type: '' };
            }
            
            return { text: lunar.getDayInChinese(), type: '' };
            
        } catch (e) {
            console.warn('获取农历信息失败:', e);
            return { text: '', type: '' };
        }
    }

    /**
     * 渲染选中日期的“完成任务列表”
     * @param {Object[]} tasks
     * @returns {string}
     */
    renderCalendarTaskList(tasks) {
        if (!tasks || tasks.length === 0) {
            return `
                <div class="calendar-empty">
                    <i class="fas fa-mug-hot"></i>
                    <p>当天无任务</p>
                </div>
            `;
        }

        return tasks.map(task => {
            const title = this.escapeHtml(task.title || '无标题');
            const text = task.text ? this.escapeHtml(task.text.substring(0, 80)) : '';
            const categoryName = task.categoryId ? this.escapeHtml(this.getCategoryName(task.categoryId) || '') : '';
            const isCompleted = task.completed;
            const tStart = this.getTaskStartKey(task);
            const tEnd = task.dueDate || tStart;
            const isMulti = tStart !== tEnd;
            const durationTag = isMulti ? `<span class="calendar-task-duration"><i class="fas fa-arrows-alt-h"></i> ${tStart.substring(5)} → ${tEnd.substring(5)} · ${this.calcWorkdays(tStart, tEnd)}工作日</span>` : '';
            
            return `
                <div class="calendar-task-item ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
                    <div class="calendar-task-status">
                        <i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-circle'}"></i>
                    </div>
                    <div class="calendar-task-main">
                        <div class="calendar-task-title">${title}</div>
                        ${text ? `<div class="calendar-task-desc">${text}${task.text && task.text.length > 80 ? '...' : ''}</div>` : ''}
                        <div class="calendar-task-meta">
                            ${durationTag}
                            ${categoryName ? `<span class="calendar-task-category"><i class="fas fa-folder"></i> ${categoryName}</span>` : ''}
                        </div>
                    </div>
                    <div class="calendar-task-action" title="编辑任务"><i class="fas fa-pen"></i></div>
                </div>
            `;
        }).join('');
    }

    /**
     * 绑定日历面板事件
     * @param {HTMLElement} panel
     */
    bindCalendarPanelEvents(panel) {
        const closePanel = () => {
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        };

        const closeBtn = panel.querySelector('#calendar-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        const overlay = panel.querySelector('.calendar-overlay');
        if (overlay) overlay.addEventListener('click', closePanel);

        // 月份切换
        const prevBtn = panel.querySelector('#calendar-prev-month');
        const nextBtn = panel.querySelector('#calendar-next-month');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), this.calendarViewDate.getMonth() - 1, 1);
                this.renderCalendarPanelContent(panel);
                this.bindCalendarPanelEvents(panel);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.calendarViewDate = new Date(this.calendarViewDate.getFullYear(), this.calendarViewDate.getMonth() + 1, 1);
                this.renderCalendarPanelContent(panel);
                this.bindCalendarPanelEvents(panel);
            });
        }

        // 回到今天
        const todayBtn = panel.querySelector('#calendar-today-btn');
        if (todayBtn) {
            todayBtn.addEventListener('click', () => {
                const today = new Date();
                this.calendarViewDate = new Date(today.getFullYear(), today.getMonth(), 1);
                this.calendarSelectedDate = this.formatLocalDateYMD(today);
                this.renderCalendarPanelContent(panel);
                this.bindCalendarPanelEvents(panel);
            });
        }

        // 日期点击
        panel.querySelectorAll('.calendar-day').forEach(el => {
            el.addEventListener('click', () => {
                const dateKey = el.dataset.date;
                if (!dateKey) return;
                this.calendarSelectedDate = dateKey;

                // 若点击了“本月外日期”，跟随切换月份
                const dateObj = new Date(dateKey + 'T00:00:00');
                this.calendarViewDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);

                this.renderCalendarPanelContent(panel);
                this.bindCalendarPanelEvents(panel);
            });
        });

        // 任务条目点击：先关闭日历面板，再打开编辑表单
        panel.querySelectorAll('.calendar-task-item').forEach(el => {
            el.addEventListener('click', () => {
                const taskId = el.dataset.taskId;
                if (!taskId) return;
                const task = this.memos.find(m => m.id === taskId);
                if (task) {
                    // 先关闭日历面板
                    closePanel();
                    // 延迟打开编辑表单，确保日历面板动画完成
                    setTimeout(() => {
                        this.showSidebarForm(task);
                    }, 100);
                }
            });
        });
    }

    /**
     * 将已完成任务按“完成日(YYYY-MM-DD)”聚合
     * @returns {Map<string, Object[]>}
     */
    buildTaskMapByCreatedDate() {
        const map = new Map();
        for (const memo of this.memos) {
            if (!memo || !memo.createdAt) continue;

            // 复用任务列表的日期归类逻辑（本地日期 YYYY-MM-DD）
            const key = this.formatDateFromTimestamp(memo.createdAt);
            if (!key) continue;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(memo);
        }
        // 按创建时间倒序排列
        for (const [key, arr] of map.entries()) {
            arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            map.set(key, arr);
        }
        return map;
    }
    
    /**
     * 将任务按日期跨度映射：每个任务覆盖从 startDate（或 createdAt）到 dueDate 的所有日期
     * 无 dueDate 的任务只出现在起始日当天
     * @returns {Map<string, Object[]>}
     */
    buildTaskMapByDateSpan() {
        const map = new Map();
        for (const memo of this.memos) {
            if (!memo || !memo.createdAt) continue;
            const startKey = this.getTaskStartKey(memo);
            const endKey = memo.dueDate || startKey;
            if (!startKey) continue;
            
            let cur = new Date(startKey + 'T00:00:00');
            const end = new Date(endKey + 'T00:00:00');
            const maxDays = 90;
            let count = 0;
            while (cur <= end && count < maxDays) {
                const key = this.formatLocalDateYMD(cur);
                if (!map.has(key)) map.set(key, []);
                map.get(key).push(memo);
                cur.setDate(cur.getDate() + 1);
                count++;
            }
        }
        return map;
    }
    
    /**
     * 获取月份中的多日任务列表（用于轨道渲染）
     */
    getMultiDayTasksForMonth(year, month) {
        return this.memos.filter(memo => {
            if (!memo || !memo.createdAt) return false;
            const startKey = this.getTaskStartKey(memo);
            const endKey = memo.dueDate || startKey;
            if (startKey === endKey) return false;
            
            const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
            const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${new Date(year, month + 1, 0).getDate()}`;
            return endKey >= monthStart && startKey <= monthEnd;
        });
    }

    /**
     * 格式化本地日期为 YYYY-MM-DD（避免 UTC 跨日）
     * @param {Date} date
     * @returns {string}
     */
    formatLocalDateYMD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * 格式化本地时间为 HH:MM
     * @param {number} ts
     * @returns {string}
     */
    formatLocalTimeHM(ts) {
        const date = new Date(ts);
        const hh = String(date.getHours()).padStart(2, '0');
        const mm = String(date.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    }

    /**
     * 若日历面板开启，则刷新其内容（用于完成状态变化后的即时更新）
     */
    refreshCalendarPanelIfOpen() {
        const panel = document.getElementById('calendar-panel');
        if (!panel) return;
        this.renderCalendarPanelContent(panel);
        this.bindCalendarPanelEvents(panel);
    }
    
    // ===================== 周回顾面板 =====================
    
    /**
     * 显示周回顾面板
     */
    showWeeklyReviewPanel() {
        const existing = document.getElementById('weekly-review-panel');
        if (existing) existing.remove();
        
        this._weeklyRangeDays = 14;
        this._weeklyCurrentView = 'gantt';
        this._weeklyFilterCategories = new Set();
        this._weeklyFilterMode = 'include'; // 'include' | 'exclude'
        
        const panel = document.createElement('div');
        panel.id = 'weekly-review-panel';
        panel.className = 'weekly-review-panel';
        
        this._renderWeeklyPanelContent(panel);
        document.body.appendChild(panel);
        this._bindWeeklyPanelEvents(panel);
        this._createWeeklyTooltip();
        
        requestAnimationFrame(() => panel.classList.add('active'));
    }
    
    _createWeeklyTooltip() {
        let tip = document.getElementById('wk-tooltip');
        if (!tip) {
            tip = document.createElement('div');
            tip.id = 'wk-tooltip';
            tip.className = 'wk-tooltip';
            document.body.appendChild(tip);
        }
        return tip;
    }
    
    _showWeeklyTooltip(e, task) {
        const tip = document.getElementById('wk-tooltip');
        if (!tip) return;
        const catName = this.getCategoryName(task.categoryId);
        const tStart = this.getTaskStartKey(task);
        const tEnd = task.dueDate || tStart;
        const pCfg = this.priorityConfig?.[task.priority] || { label: '', icon: '' };
        const priorityLabel = { high: '高', medium: '中', low: '低', none: '无' }[task.priority] || '';
        const statusInfo = this.getTaskStatus(task);
        const statusText = `<i class="${statusInfo.icon}" style="color:${statusInfo.color}"></i> ${statusInfo.label}`;
        const durationInfo = tStart !== tEnd ? ` (${this.calcWorkdays(tStart, tEnd)} 工作日)` : '';
        tip.innerHTML = `
            <div class="wk-tip-title">${this.escapeHtml(task.title || '')}</div>
            <div class="wk-tip-row"><i class="fas fa-folder"></i> ${this.escapeHtml(catName)}</div>
            <div class="wk-tip-row"><i class="fas fa-calendar"></i> ${tStart} → ${tEnd}${durationInfo}</div>
            ${priorityLabel ? `<div class="wk-tip-row"><i class="fas fa-flag"></i> ${priorityLabel}优先级</div>` : ''}
            <div class="wk-tip-row">${statusText}</div>
        `;
        tip.style.display = 'block';
        const rect = tip.getBoundingClientRect();
        let x = e.clientX + 12;
        let y = e.clientY + 12;
        if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - 12;
        if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - 12;
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    }
    
    _hideWeeklyTooltip() {
        const tip = document.getElementById('wk-tooltip');
        if (tip) tip.style.display = 'none';
    }
    
    _getWeeklyDates() {
        const dates = [];
        const now = new Date();
        for (let i = this._weeklyRangeDays; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            dates.push(d);
        }
        for (let i = 1; i <= this._weeklyRangeDays; i++) {
            const d = new Date(now);
            d.setDate(d.getDate() + i);
            dates.push(d);
        }
        return dates;
    }
    
    _isMonthMode() {
        return this._weeklyRangeDays >= 30;
    }
    
    _getReviewTitle() {
        return this._isMonthMode() ? '月回顾' : '周回顾';
    }
    
    _passWeeklyCategoryFilter(task) {
        if (!this._weeklyFilterCategories || this._weeklyFilterCategories.size === 0) return true;
        let allIds = new Set();
        this._weeklyFilterCategories.forEach(cid => {
            this._getCategoryAndChildIds(cid).forEach(id => allIds.add(id));
        });
        const match = allIds.has(task.categoryId);
        return this._weeklyFilterMode === 'exclude' ? !match : match;
    }
    
    _getWeeklyTasksForDate(dateKey) {
        return this.memos.filter(t => {
            const start = this.getTaskStartKey(t);
            const end = t.dueDate || start;
            return dateKey >= start && dateKey <= end && this._passWeeklyCategoryFilter(t);
        });
    }
    
    _getWeeklyTasksInRange() {
        const dates = this._getWeeklyDates();
        const startKey = this.formatLocalDateYMD(dates[0]);
        const endKey = this.formatLocalDateYMD(dates[dates.length - 1]);
        return this.memos.filter(t => {
            const tStart = this.getTaskStartKey(t);
            const tEnd = t.dueDate || tStart;
            return tEnd >= startKey && tStart <= endKey && this._passWeeklyCategoryFilter(t);
        });
    }
    
    _renderWeeklyPanelContent(panel) {
        const title = this._getReviewTitle();
        const icon = this._isMonthMode() ? 'fa-calendar-alt' : 'fa-calendar-week';
        const filterPills = this._renderWeeklyCategoryPills();
        
        panel.innerHTML = `
            <div class="weekly-overlay"></div>
            <div class="weekly-content">
                <div class="weekly-header">
                    <h3><i class="fas ${icon}"></i> ${title}</h3>
                    <div class="weekly-range-toggle">
                        <button class="weekly-range-btn ${this._weeklyRangeDays === 7 ? 'active' : ''}" data-days="7">±1 周</button>
                        <button class="weekly-range-btn ${this._weeklyRangeDays === 14 ? 'active' : ''}" data-days="14">±2 周</button>
                        <button class="weekly-range-btn ${this._weeklyRangeDays === 30 ? 'active' : ''}" data-days="30">±1 月</button>
                        <button class="weekly-range-btn ${this._weeklyRangeDays === 60 ? 'active' : ''}" data-days="60">±2 月</button>
                    </div>
                    <button class="weekly-close" id="weekly-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="weekly-tabs">
                    <button class="weekly-tab ${this._weeklyCurrentView === 'gantt' ? 'active' : ''}" data-view="gantt"><i class="fas fa-bars-staggered"></i> 甘特图</button>
                    <button class="weekly-tab ${this._weeklyCurrentView === 'timeline' ? 'active' : ''}" data-view="timeline"><i class="fas fa-timeline"></i> 时间线</button>
                    <button class="weekly-tab ${this._weeklyCurrentView === 'kanban' ? 'active' : ''}" data-view="kanban"><i class="fas fa-columns"></i> 看板</button>
                    <button class="weekly-tab ${this._weeklyCurrentView === 'heatbar' ? 'active' : ''}" data-view="heatbar"><i class="fas fa-chart-bar"></i> 热力图</button>
                </div>
                <div class="weekly-filter-bar">
                    <div class="wk-filter-left">
                        <button class="wk-filter-toggle" id="wk-filter-toggle">
                            <i class="fas fa-filter"></i> 分类筛选
                            ${this._weeklyFilterCategories.size > 0 ? `<span class="wk-filter-badge">${this._weeklyFilterCategories.size}</span>` : ''}
                        </button>
                        <div class="wk-filter-mode-switch">
                            <button class="wk-mode-btn ${this._weeklyFilterMode === 'include' ? 'active' : ''}" data-mode="include">包含</button>
                            <button class="wk-mode-btn ${this._weeklyFilterMode === 'exclude' ? 'active' : ''}" data-mode="exclude">排除</button>
                        </div>
                        ${filterPills}
                    </div>
                    <div class="wk-filter-dropdown" id="wk-filter-dropdown">
                        <input type="text" class="wk-filter-search" id="wk-filter-search" placeholder="搜索分类...">
                        <div class="wk-filter-list" id="wk-filter-list">
                            ${this._renderWeeklyCategoryList()}
                        </div>
                        <div class="wk-filter-actions">
                            <button class="wk-filter-clear" id="wk-filter-clear">清除全部</button>
                        </div>
                    </div>
                </div>
                <div class="weekly-body" id="weekly-body">
                    ${this._renderWeeklyView()}
                </div>
            </div>
        `;
    }
    
    _renderWeeklyCategoryList(filter = '') {
        const topLevel = this._getTopLevelCategories();
        const q = filter.toLowerCase();
        let html = '';
        topLevel.forEach(parent => {
            const children = this._getChildCategories(parent.id);
            const parentMatch = !q || parent.name.toLowerCase().includes(q);
            const matchChildren = children.filter(ch => !q || ch.name.toLowerCase().includes(q));
            if (!parentMatch && matchChildren.length === 0) return;
            
            const color = parent.color || '#64b4ff';
            const checked = this._weeklyFilterCategories.has(parent.id);
            html += `<div class="wk-filter-item wk-filter-parent" data-id="${parent.id}">
                <label><input type="checkbox" ${checked ? 'checked' : ''} data-cat-id="${parent.id}">
                <span class="wk-filter-dot" style="background:${color}"></span>${this.escapeHtml(parent.name)}</label>
            </div>`;
            
            const showChildren = parentMatch ? children : matchChildren;
            showChildren.forEach(ch => {
                const chColor = ch.color || color;
                const chChecked = this._weeklyFilterCategories.has(ch.id);
                html += `<div class="wk-filter-item wk-filter-child" data-id="${ch.id}">
                    <label><input type="checkbox" ${chChecked ? 'checked' : ''} data-cat-id="${ch.id}">
                    <span class="wk-filter-dot" style="background:${chColor}"></span>— ${this.escapeHtml(ch.name)}</label>
                </div>`;
            });
        });
        return html || '<div class="wk-filter-empty">无匹配分类</div>';
    }
    
    _renderWeeklyCategoryPills() {
        if (this._weeklyFilterCategories.size === 0) return '';
        let html = '<div class="wk-filter-pills">';
        this._weeklyFilterCategories.forEach(catId => {
            const cat = this.categories.find(c => c.id === catId);
            if (!cat) return;
            const color = cat.color || '#64b4ff';
            html += `<span class="wk-filter-pill" data-cat-id="${catId}" style="border-color:${color}40;background:${color}15;color:${color}">
                ${this.escapeHtml(cat.name)} <i class="fas fa-times wk-pill-remove" data-cat-id="${catId}"></i>
            </span>`;
        });
        html += '</div>';
        return html;
    }
    
    _renderWeeklyView() {
        switch (this._weeklyCurrentView) {
            case 'gantt': return this._renderWeeklyGantt();
            case 'timeline': return this._renderWeeklyTimeline();
            case 'kanban': return this._renderWeeklyKanban();
            case 'heatbar': return this._renderWeeklyHeatbar();
            default: return this._renderWeeklyGantt();
        }
    }
    
    _renderWeeklyGantt() {
        const dates = this._getWeeklyDates();
        const tasks = this._getWeeklyTasksInRange();
        const todayKey = this.formatLocalDateYMD(new Date());
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const isMonth = this._isMonthMode();
        const cellMinW = isMonth ? 14 : 28;
        
        let html = `<div class="wk-gantt ${isMonth ? 'wk-gantt-month' : ''}">`;
        html += `<div class="wk-gantt-header"><div class="wk-gantt-label-h">任务</div><div class="wk-gantt-dates" style="min-width:${dates.length * cellMinW}px">`;
        
        let prevMonth = -1;
        dates.forEach(d => {
            const key = this.formatLocalDateYMD(d);
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const mon = d.getMonth();
            const showMonthLabel = mon !== prevMonth;
            prevMonth = mon;
            if (isMonth) {
                html += `<div class="wk-gantt-date wk-gantt-date-compact ${key === todayKey ? 'today' : ''} ${isWeekend ? 'weekend' : ''}" style="min-width:${cellMinW}px">
                    ${showMonthLabel ? `<span class="wk-gantt-mon">${mon + 1}月</span>` : ''}
                    <span class="wk-gantt-dd">${d.getDate()}</span>
                </div>`;
            } else {
                html += `<div class="wk-gantt-date ${key === todayKey ? 'today' : ''} ${isWeekend ? 'weekend' : ''}">
                    <span class="wk-gantt-dn">周${dayNames[d.getDay()]}</span>
                    <span class="wk-gantt-dd">${d.getDate()}</span>
                </div>`;
            }
        });
        html += '</div></div>';
        
        tasks.forEach(task => {
            const color = this.getCategoryColor(task.categoryId) || '#64b4ff';
            const c = color === 'transparent' ? '#64b4ff' : color;
            const titleMaxLen = isMonth ? 15 : 20;
            html += `<div class="wk-gantt-row" data-task-id="${task.id}">
                <div class="wk-gantt-label" data-task-id="${task.id}"><span class="wk-gantt-dot" style="background:${c}"></span>${this.escapeHtml((task.title || '').substring(0, titleMaxLen))}</div>
                <div class="wk-gantt-cells" style="min-width:${dates.length * cellMinW}px">`;
            
            const tStart = this.getTaskStartKey(task);
            const tEnd = task.dueDate || tStart;
            const rangeStart = this.formatLocalDateYMD(dates[0]);
            const rangeEnd = this.formatLocalDateYMD(dates[dates.length - 1]);
            const barStart = tStart < rangeStart ? rangeStart : tStart;
            const barEnd = tEnd > rangeEnd ? rangeEnd : tEnd;
            
            dates.forEach(d => {
                const key = this.formatLocalDateYMD(d);
                html += `<div class="wk-gantt-cell ${key === todayKey ? 'today' : ''}" style="min-width:${cellMinW}px"></div>`;
            });
            
            const startIdx = dates.findIndex(d => this.formatLocalDateYMD(d) === barStart);
            const endIdx = dates.findIndex(d => this.formatLocalDateYMD(d) === barEnd);
            if (startIdx !== -1 && endIdx !== -1) {
                const left = `calc(${startIdx} * (100% / ${dates.length}) + 2px)`;
                const width = `calc(${endIdx - startIdx + 1} * (100% / ${dates.length}) - 4px)`;
                html += `<div class="wk-gantt-bar ${task.completed ? 'completed' : ''}" data-task-id="${task.id}" style="left:${left};width:${width};background:${c}"></div>`;
            }
            
            html += '</div></div>';
        });
        
        html += '</div>';
        return html;
    }
    
    _renderWeeklyTimeline() {
        const dates = this._getWeeklyDates().reverse();
        const todayKey = this.formatLocalDateYMD(new Date());
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        
        let html = '<div class="wk-timeline">';
        dates.forEach((d, i) => {
            const key = this.formatLocalDateYMD(d);
            const tasks = this._getWeeklyTasksForDate(key);
            const isToday = key === todayKey;
            
            html += `<div class="wk-tl-day">
                <div class="wk-tl-date ${isToday ? 'today' : ''}">
                    <span class="wk-tl-num">${d.getDate()}</span>
                    <span class="wk-tl-wk">周${dayNames[d.getDay()]}</span>
                </div>
                <div class="wk-tl-line ${isToday ? 'today' : ''}">
                    <span class="wk-tl-dot"></span>
                    ${i < dates.length - 1 ? '<span class="wk-tl-vline"></span>' : ''}
                </div>
                <div class="wk-tl-cards">`;
            
            if (tasks.length === 0) {
                html += '<div class="wk-tl-empty">无任务</div>';
            } else {
                tasks.forEach(t => {
                    const color = this.getCategoryColor(t.categoryId) || '#64b4ff';
                    const c = color === 'transparent' ? '#64b4ff' : color;
                    const tStart = this.getTaskStartKey(t);
                    const isMulti = t.dueDate && t.dueDate !== tStart;
                    const catName = this.getCategoryName(t.categoryId);
                    const workDayInfo = isMulti ? ` · ${this.calcWorkdays(tStart, t.dueDate)}工作日` : '';
                    html += `<div class="wk-tl-card ${t.completed ? 'completed' : ''}">
                        <div class="wk-tl-card-title" style="color:${c}">${t.completed ? '<i class="fas fa-check-circle" style="opacity:0.5"></i> ' : ''}${this.escapeHtml(t.title || '')}</div>
                        <div class="wk-tl-card-meta">
                            <span><i class="fas fa-folder"></i> ${this.escapeHtml(catName)}</span>
                            ${isMulti ? `<span><i class="fas fa-arrow-right-arrow-left"></i> ${tStart.substring(5)} — ${t.dueDate.substring(5)}${workDayInfo}</span>` : '<span>单日</span>'}
                        </div>
                    </div>`;
                });
            }
            html += '</div></div>';
        });
        html += '</div>';
        return html;
    }
    
    _renderWeeklyKanban() {
        const dates = this._getWeeklyDates();
        const todayKey = this.formatLocalDateYMD(new Date());
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        
        let html = '<div class="wk-kanban">';
        dates.forEach(d => {
            const key = this.formatLocalDateYMD(d);
            const tasks = this._getWeeklyTasksForDate(key);
            const isToday = key === todayKey;
            
            html += `<div class="wk-kb-col ${isToday ? 'today' : ''}">
                <div class="wk-kb-header">
                    <div class="wk-kb-day">周${dayNames[d.getDay()]}</div>
                    <div class="wk-kb-date">${d.getDate()}</div>
                    <div class="wk-kb-count">${tasks.length} 项</div>
                </div>`;
            
            if (tasks.length === 0) {
                html += '<div class="wk-kb-empty">—</div>';
            } else {
                tasks.forEach(t => {
                    const color = this.getCategoryColor(t.categoryId) || '#64b4ff';
                    const c = color === 'transparent' ? '#64b4ff' : color;
                    html += `<div class="wk-kb-card ${t.completed ? 'completed' : ''}" style="border-left-color:${c}">
                        <div class="wk-kb-card-title">${this.escapeHtml((t.title || '').substring(0, 16))}</div>
                        <div class="wk-kb-card-cat">${this.escapeHtml(this.getCategoryName(t.categoryId))}</div>
                    </div>`;
                });
            }
            html += '</div>';
        });
        html += '</div>';
        return html;
    }
    
    _renderWeeklyHeatbar() {
        const dates = this._getWeeklyDates();
        const todayKey = this.formatLocalDateYMD(new Date());
        const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
        const catColorMap = {};
        this.memos.forEach(t => {
            if (t.categoryId) {
                const color = this.getCategoryColor(t.categoryId);
                const catName = this.getCategoryName(t.categoryId);
                if (color && color !== 'transparent') catColorMap[catName] = color;
            }
        });
        
        let html = '<div class="wk-heatbar">';
        dates.forEach(d => {
            const key = this.formatLocalDateYMD(d);
            const tasks = this._getWeeklyTasksForDate(key);
            const isToday = key === todayKey;
            
            html += `<div class="wk-hb-row">
                <div class="wk-hb-date ${isToday ? 'today' : ''}">${d.getMonth() + 1}/${d.getDate()} 周${dayNames[d.getDay()]}</div>
                <div class="wk-hb-bars">`;
            
            if (tasks.length === 0) {
                html += '<span class="wk-hb-empty">— 无任务 —</span>';
            } else {
                tasks.forEach(t => {
                    const color = this.getCategoryColor(t.categoryId) || '#64b4ff';
                    const c = color === 'transparent' ? '#64b4ff' : color;
                    const widthPct = Math.max(8, 100 / tasks.length);
                    html += `<div class="wk-hb-seg ${t.completed ? 'completed' : ''}" style="background:${c};width:${widthPct}%" title="${this.escapeHtml(t.title || '')}">${this.escapeHtml((t.title || '').substring(0, 8))}</div>`;
                });
            }
            
            html += `</div><div class="wk-hb-count">${tasks.length}</div></div>`;
        });
        
        // 图例
        if (Object.keys(catColorMap).length > 0) {
            html += '<div class="wk-hb-legend">';
            Object.entries(catColorMap).forEach(([name, color]) => {
                html += `<span class="wk-hb-legend-item"><span class="wk-hb-legend-dot" style="background:${color}"></span>${this.escapeHtml(name)}</span>`;
            });
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }
    
    _bindWeeklyPanelEvents(panel) {
        const closePanel = () => {
            this._hideWeeklyTooltip();
            const tip = document.getElementById('wk-tooltip');
            if (tip) tip.remove();
            panel.classList.remove('active');
            setTimeout(() => panel.remove(), 300);
        };
        
        const closeBtn = panel.querySelector('#weekly-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        
        const overlay = panel.querySelector('.weekly-overlay');
        if (overlay) overlay.addEventListener('click', closePanel);
        
        // 范围切换
        panel.querySelectorAll('.weekly-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._weeklyRangeDays = parseInt(btn.dataset.days);
                this._renderWeeklyPanelContent(panel);
                this._bindWeeklyPanelEvents(panel);
            });
        });
        
        // 视图切换
        panel.querySelectorAll('.weekly-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this._weeklyCurrentView = tab.dataset.view;
                this._renderWeeklyPanelContent(panel);
                this._bindWeeklyPanelEvents(panel);
            });
        });
        
        // 分类过滤器切换
        const filterToggle = panel.querySelector('#wk-filter-toggle');
        const filterDropdown = panel.querySelector('#wk-filter-dropdown');
        if (filterToggle && filterDropdown) {
            filterToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                filterDropdown.classList.toggle('show');
            });
            document.addEventListener('click', (e) => {
                if (!filterDropdown.contains(e.target) && e.target !== filterToggle) {
                    filterDropdown.classList.remove('show');
                }
            }, { once: false });
        }
        
        // 分类过滤搜索
        const filterSearch = panel.querySelector('#wk-filter-search');
        if (filterSearch) {
            filterSearch.addEventListener('input', () => {
                const list = panel.querySelector('#wk-filter-list');
                if (list) list.innerHTML = this._renderWeeklyCategoryList(filterSearch.value);
                this._bindWeeklyFilterCheckboxes(panel);
            });
        }
        
        // 分类过滤checkbox
        this._bindWeeklyFilterCheckboxes(panel);
        
        // 过滤模式切换
        panel.querySelectorAll('.wk-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this._weeklyFilterMode = btn.dataset.mode;
                this._renderWeeklyPanelContent(panel);
                this._bindWeeklyPanelEvents(panel);
            });
        });
        
        // 清除全部过滤
        const clearBtn = panel.querySelector('#wk-filter-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this._weeklyFilterCategories.clear();
                this._renderWeeklyPanelContent(panel);
                this._bindWeeklyPanelEvents(panel);
            });
        }
        
        // Pill移除
        panel.querySelectorAll('.wk-pill-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._weeklyFilterCategories.delete(btn.dataset.catId);
                this._renderWeeklyPanelContent(panel);
                this._bindWeeklyPanelEvents(panel);
            });
        });
        
        // Tooltip: 甘特图行和bar
        const body = panel.querySelector('#weekly-body');
        if (body) {
            body.addEventListener('mouseover', (e) => {
                const row = e.target.closest('[data-task-id]');
                if (row) {
                    const tid = row.dataset.taskId;
                    const task = this.memos.find(t => t.id === tid);
                    if (task) this._showWeeklyTooltip(e, task);
                }
            });
            body.addEventListener('mousemove', (e) => {
                const tip = document.getElementById('wk-tooltip');
                if (tip && tip.style.display === 'block') {
                    const rect = tip.getBoundingClientRect();
                    let x = e.clientX + 12;
                    let y = e.clientY + 12;
                    if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - 12;
                    if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - 12;
                    tip.style.left = x + 'px';
                    tip.style.top = y + 'px';
                }
            });
            body.addEventListener('mouseout', (e) => {
                const row = e.target.closest('[data-task-id]');
                if (row) this._hideWeeklyTooltip();
            });
        }
    }
    
    _bindWeeklyFilterCheckboxes(panel) {
        panel.querySelectorAll('#wk-filter-list input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const catId = cb.dataset.catId;
                if (cb.checked) {
                    this._weeklyFilterCategories.add(catId);
                } else {
                    this._weeklyFilterCategories.delete(catId);
                }
                this._refreshWeeklyBody(panel);
                const pills = panel.querySelector('.wk-filter-pills');
                if (pills) pills.outerHTML = this._renderWeeklyCategoryPills();
                else {
                    const left = panel.querySelector('.wk-filter-left');
                    if (left) left.insertAdjacentHTML('beforeend', this._renderWeeklyCategoryPills());
                }
                const badge = panel.querySelector('#wk-filter-toggle .wk-filter-badge');
                const count = this._weeklyFilterCategories.size;
                if (badge) {
                    if (count > 0) badge.textContent = count;
                    else badge.remove();
                } else if (count > 0) {
                    panel.querySelector('#wk-filter-toggle').insertAdjacentHTML('beforeend', `<span class="wk-filter-badge">${count}</span>`);
                }
                // rebind pill remove events
                panel.querySelectorAll('.wk-pill-remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._weeklyFilterCategories.delete(btn.dataset.catId);
                        this._renderWeeklyPanelContent(panel);
                        this._bindWeeklyPanelEvents(panel);
                    });
                });
            });
        });
    }
    
    _refreshWeeklyBody(panel) {
        const body = panel.querySelector('#weekly-body');
        if (body) body.innerHTML = this._renderWeeklyView();
    }
    
    /**
     * 计算任务统计数据
     * @param {number} dateRange 日期范围（天数）
     */
    calculateTaskStats(dateRange = 30) {
        const today = this.getTodayDate();
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - dateRange);
        
        // 按日期范围筛选任务
        const filteredMemos = dateRange >= 9999 
            ? this.memos 
            : this.memos.filter(m => new Date(m.createdAt) >= cutoffDate);
        
        const total = filteredMemos.length;
        const completed = filteredMemos.filter(m => m.completed).length;
        const pending = total - completed;
        const overdue = filteredMemos.filter(m => !m.completed && m.dueDate && m.dueDate < today).length;
        
        // 计算生产力评分
        let score = 0;
        let scoreDesc = '暂无数据';
        if (total > 0) {
            const completionRate = completed / total;
            const overdueRate = overdue / total;
            score = Math.round((completionRate * 0.7 + (1 - overdueRate) * 0.3) * 100);
            
            if (score >= 90) scoreDesc = '太棒了！效率超高 🌟';
            else if (score >= 70) scoreDesc = '做得不错，继续保持 💪';
            else if (score >= 50) scoreDesc = '还有提升空间 🎯';
            else scoreDesc = '需要改进策略 📝';
        }
        
        // 近期数据（根据范围调整显示天数）
        const chartDays = Math.min(dateRange, 14);
        const weeklyData = [];
        for (let i = chartDays - 1; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            
            const dayCompleted = this.memos.filter(m => {
                if (!m.completed || !m.updatedAt) return false;
                const updateDate = new Date(m.updatedAt).toISOString().split('T')[0];
                return updateDate === dateStr;
            }).length;
            
            weeklyData.push({
                label: chartDays <= 7 
                    ? date.toLocaleDateString('zh-CN', { weekday: 'short' })
                    : `${date.getMonth() + 1}/${date.getDate()}`,
                value: dayCompleted
            });
        }
        
        // 优先级统计
        const priorityData = {
            high: filteredMemos.filter(m => m.priority === 'high').length,
            medium: filteredMemos.filter(m => m.priority === 'medium').length,
            low: filteredMemos.filter(m => m.priority === 'low').length,
            none: filteredMemos.filter(m => !m.priority || m.priority === 'none').length
        };
        
        // 分类统计
        const categoryData = {};
        this.categories.forEach(cat => {
            categoryData[cat.id] = { name: cat.name, count: 0, completed: 0 };
        });
        categoryData['none'] = { name: '未分类', count: 0, completed: 0 };
        
        filteredMemos.forEach(memo => {
            const catId = memo.categoryId || 'none';
            if (categoryData[catId]) {
                categoryData[catId].count++;
                if (memo.completed) categoryData[catId].completed++;
            } else {
                categoryData['none'].count++;
                if (memo.completed) categoryData['none'].completed++;
            }
        });
        
        // 最近完成的任务（最多5个）
        const recentCompleted = this.memos
            .filter(m => m.completed)
            .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
            .slice(0, 5);
        
        // 存储大小（chrome.storage.local 配额约 10MB）
        const dataStr = JSON.stringify(this.memos);
        const sizeBytes = new Blob([dataStr]).size;
        const sizeKB = (sizeBytes / 1024).toFixed(1);
        const maxSizeMB = 10;
        const storagePercent = (sizeBytes / (maxSizeMB * 1024 * 1024)) * 100;
        
        return {
            total,
            completed,
            pending,
            overdue,
            score,
            scoreDesc,
            weeklyData,
            priorityData,
            categoryData,
            recentCompleted,
            storageSize: sizeKB + ' KB',
            storagePercent
        };
    }
    
    /**
     * 渲染周统计图表
     */
    renderWeeklyChart(data) {
        const maxValue = Math.max(...data.map(d => d.value), 1);
        
        return data.map(d => {
            const height = Math.max((d.value / maxValue) * 100, 4);
            return `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar" style="height: ${height}%">
                        <span class="chart-value">${d.value}</span>
                    </div>
                    <span class="chart-label">${d.label}</span>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 渲染分类统计
     */
    renderCategoryStats(data) {
        const categories = Object.values(data).filter(c => c.count > 0);
        
        if (categories.length === 0) {
            return '<div class="stats-empty">暂无分类数据</div>';
        }
        
        return categories.map(cat => {
            const rate = cat.count > 0 ? Math.round((cat.completed / cat.count) * 100) : 0;
            return `
                <div class="stats-category-item">
                    <div class="stats-category-name">${this.escapeHtml(cat.name)}</div>
                    <div class="stats-category-progress">
                        <div class="stats-progress-bar" style="width: ${rate}%"></div>
                    </div>
                    <div class="stats-category-count">${cat.completed}/${cat.count}</div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 渲染优先级统计
     */
    renderPriorityStats(data) {
        const total = data.high + data.medium + data.low + data.none;
        if (total === 0) return '<div class="stats-empty">暂无任务数据</div>';
        
        const items = [
            { key: 'high', label: '高', color: '#ff6b6b', count: data.high },
            { key: 'medium', label: '中', color: '#ffc857', count: data.medium },
            { key: 'low', label: '低', color: '#5cd85c', count: data.low },
            { key: 'none', label: '无', color: '#888', count: data.none }
        ];
        
        return items.map(item => {
            const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return `
                <div class="priority-stat-item">
                    <div class="priority-dot" style="background: ${item.color}"></div>
                    <div class="priority-label">${item.label}</div>
                    <div class="priority-bar-wrapper">
                        <div class="priority-bar" style="width: ${percent}%; background: ${item.color}"></div>
                    </div>
                    <div class="priority-count">${item.count}</div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 渲染最近完成的任务
     */
    renderRecentCompleted(tasks) {
        if (!tasks || tasks.length === 0) {
            return '<div class="stats-empty">暂无完成的任务</div>';
        }
        
        return tasks.map(task => {
            const date = new Date(task.updatedAt || task.createdAt);
            const dateStr = this.formatRelativeTime(date);
            return `
                <div class="recent-task-item">
                    <i class="fas fa-check-circle"></i>
                    <div class="recent-task-info">
                        <div class="recent-task-title">${this.escapeHtml(task.title || '无标题')}</div>
                        <div class="recent-task-time">${dateStr}</div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * 格式化相对时间
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return `${diffMins} 分钟前`;
        if (diffHours < 24) return `${diffHours} 小时前`;
        if (diffDays < 7) return `${diffDays} 天前`;
        
        return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    }
    
    /**
     * 显示分类管理面板
     */
    showCategoryManager() {
        const existingPanel = document.getElementById('category-manager');
        if (existingPanel) existingPanel.remove();
        
        const panel = document.createElement('div');
        panel.id = 'category-manager';
        panel.className = 'category-manager';
        panel.innerHTML = `
            <div class="category-manager-overlay"></div>
            <div class="category-manager-content">
                <div class="category-manager-header">
                    <h3><i class="fas fa-layer-group"></i> 分类管理</h3>
                    <span class="category-manager-badge" id="cm-badge">${this.categories.length} 个</span>
                    <button class="category-manager-close" id="category-manager-close">&times;</button>
                </div>
                <div class="category-manager-search">
                    <i class="fas fa-search"></i>
                    <input type="text" id="category-manager-search" placeholder="搜索或创建分类..." autocomplete="off">
                </div>
                <div class="category-manager-body">
                    <div class="category-list" id="category-list">
                        ${this.renderCategoryManagerList()}
                    </div>
                    <div class="cat-drag-promote-zone">
                        <i class="fas fa-arrow-up"></i> 拖拽到此处 — 提升为一级分类
                    </div>
                </div>
                <div class="category-manager-footer">
                    <button class="category-create-btn" id="category-create-btn">
                        <i class="fas fa-plus"></i> 新建一级分类
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        const closeBtn = panel.querySelector('#category-manager-close');
        const overlay = panel.querySelector('.category-manager-overlay');
        const closePanel = () => panel.remove();
        closeBtn.addEventListener('click', closePanel);
        overlay.addEventListener('click', closePanel);
        
        const searchInput = panel.querySelector('#category-manager-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterCategoryManagerList(panel);
            });
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const q = searchInput.value.trim();
                    if (q && !this.categories.some(c => c.name === q)) {
                        this._quickCreateCategory(q, panel);
                        searchInput.value = '';
                    }
                }
            });
        }
        
        const createBtn = panel.querySelector('#category-create-btn');
        createBtn.addEventListener('click', () => this._showInlineCreate(panel));
        
        this.bindCategoryItemEvents(panel);
        requestAnimationFrame(() => panel.classList.add('active'));
        searchInput.focus();
    }
    
    async _quickCreateCategory(name, panel) {
        const presetColors = ['#64b4ff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#a3a3a3'];
        const usedColors = this.categories.map(c => c.color);
        const color = presetColors.find(c => !usedColors.includes(c)) || presetColors[Math.floor(Math.random() * presetColors.length)];
        const newCategory = { id: this.generateId(), name, color };
        this.categories.push(newCategory);
        await this.saveCategories();
        this._refreshCategoryList(panel);
        this.updateCategorySelects();
    }
    
    /**
     * 显示内联创建分类表单
     * @param {HTMLElement} panel 分类管理面板
     * @param {string|null} [parentId] 父分类 ID，不传则创建一级分类
     */
    _showInlineCreate(panel, parentId = null) {
        const listEl = panel.querySelector('#category-list');
        if (!listEl || listEl.querySelector('.category-inline-create')) return;
        
        const presetColors = ['#64b4ff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#a3a3a3'];
        const parent = parentId ? this.categories.find(c => c.id === parentId) : null;
        const defaultColor = parent ? (parent.color || '#64b4ff') : '#64b4ff';
        const placeholder = parentId ? '子分类名称...' : '分类名称...';
        
        const row = document.createElement('div');
        row.className = 'category-inline-create';
        row.innerHTML = `
            <input type="text" class="category-inline-name" placeholder="${placeholder}" maxlength="20" autofocus>
            <div class="category-color-palette">
                ${presetColors.map(c => `<span class="category-palette-dot${c === defaultColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
            </div>
            <div class="category-inline-actions">
                <button class="category-inline-save"><i class="fas fa-check"></i> 添加</button>
                <button class="category-inline-cancel"><i class="fas fa-times"></i></button>
            </div>
        `;
        
        if (parentId) {
            const group = listEl.querySelector(`.cat-accordion-group[data-id="${parentId}"]`);
            const childrenEl = group ? group.querySelector('.cat-accordion-children') : null;
            const addSubEl = group ? group.querySelector('.cat-accordion-add-sub') : null;
            if (childrenEl && addSubEl) {
                childrenEl.insertBefore(row, addSubEl);
                group.classList.add('expanded');
            } else {
                listEl.appendChild(row);
            }
        } else {
            listEl.appendChild(row);
        }
        
        const nameInput = row.querySelector('.category-inline-name');
        let selectedColor = defaultColor;
        nameInput.focus();
        
        row.querySelectorAll('.category-palette-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                row.querySelectorAll('.category-palette-dot').forEach(d => d.classList.remove('selected'));
                dot.classList.add('selected');
                selectedColor = dot.dataset.color;
            });
        });
        
        const doSave = async () => {
            const name = nameInput.value.trim();
            if (!name) { nameInput.classList.add('input-error'); setTimeout(() => nameInput.classList.remove('input-error'), 800); return; }
            if (this.categories.some(c => c.name === name)) { nameInput.classList.add('input-error'); nameInput.placeholder = '已存在'; nameInput.value = ''; setTimeout(() => { nameInput.classList.remove('input-error'); nameInput.placeholder = placeholder; }, 1200); return; }
            const newCat = { id: this.generateId(), name, color: selectedColor };
            if (parentId) newCat.parentId = parentId;
            this.categories.push(newCat);
            await this.saveCategories();
            this._refreshCategoryList(panel);
            this.updateCategorySelects();
        };
        
        row.querySelector('.category-inline-save').addEventListener('click', doSave);
        nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') row.remove(); });
        row.querySelector('.category-inline-cancel').addEventListener('click', () => row.remove());
    }
    
    _refreshCategoryList(panel) {
        const listEl = panel.querySelector('#category-list');
        if (listEl) { listEl.innerHTML = this.renderCategoryManagerList(); this.bindCategoryItemEvents(panel); }
        const badge = panel.querySelector('#cm-badge');
        if (badge) badge.textContent = this.categories.length + ' 个';
    }
    
    /**
     * 根据搜索关键词过滤分类管理列表显示（适配折叠分组卡片结构）
     */
    filterCategoryManagerList(panel) {
        const searchInput = panel.querySelector('#category-manager-search');
        const listEl = panel.querySelector('#category-list');
        if (!searchInput || !listEl) return;
        const q = (searchInput.value || '').toLowerCase().trim();
        listEl.querySelectorAll('.cat-accordion-group').forEach(group => {
            const header = group.querySelector('.cat-accordion-header');
            const nameEl = header ? header.querySelector('.cat-accordion-name') : null;
            const parentName = nameEl ? nameEl.textContent : '';
            const childEls = group.querySelectorAll('.cat-accordion-child');
            let childMatch = false;
            childEls.forEach(ch => {
                const chName = (ch.querySelector('.cat-accordion-child-name') || ch).textContent || '';
                if (q && chName.toLowerCase().includes(q)) childMatch = true;
            });
            const parentMatch = !q || parentName.toLowerCase().includes(q);
            const match = parentMatch || childMatch;
            group.style.display = match ? '' : 'none';
            if (match && childMatch) group.classList.add('expanded');
        });
    }
    
    /**
     * 获取一级分类（无 parentId 或 parentId 为空视为一级，向后兼容）
     */
    _getTopLevelCategories() {
        return (this.categories || []).filter(c => !c.parentId);
    }
    
    /**
     * 获取某分类的子分类
     */
    _getChildCategories(parentId) {
        return (this.categories || []).filter(c => c.parentId === parentId);
    }
    
    /**
     * 获取分类 ID 及其所有子分类 ID 的数组（用于层级过滤）
     */
    _getCategoryAndChildIds(categoryId) {
        const ids = [categoryId];
        const children = this._getChildCategories(categoryId);
        children.forEach(ch => ids.push(ch.id));
        return ids;
    }
    
    /**
     * 渲染分类管理列表（折叠分组卡片结构）
     */
    renderCategoryManagerList() {
        const topLevel = this._getTopLevelCategories();
        if (topLevel.length === 0) {
            return '<div class="category-empty"><i class="fas fa-folder-open"></i><p>暂无分类</p><p class="category-empty-hint">点击下方"新建一级分类"或在搜索框输入名称后回车</p></div>';
        }
        let html = '';
        topLevel.forEach((parent, idx) => {
            const children = this._getChildCategories(parent.id);
            const parentCount = this.memos.filter(m => m.categoryId === parent.id).length;
            const childrenCount = children.reduce((sum, ch) => sum + this.memos.filter(m => m.categoryId === ch.id).length, 0);
            const totalCount = parentCount + childrenCount;
            const color = parent.color || '#64b4ff';
            html += `
            <div class="cat-accordion-group${idx === 0 ? ' expanded' : ''}" data-id="${parent.id}" draggable="true">
                <div class="cat-accordion-header">
                    <span class="cat-accordion-chevron"><i class="fas fa-chevron-right"></i></span>
                    <div class="cat-accordion-color" style="background:${color}"></div>
                    <span class="cat-accordion-name">${this.escapeHtml(parent.name)}</span>
                    <div class="cat-accordion-right">
                        <div class="cat-accordion-stats">
                            <span>${totalCount} 任务</span>
                            ${children.length > 0 ? `<span class="cat-accordion-sub-count">${children.length} 子分类</span>` : ''}
                        </div>
                        <div class="cat-accordion-actions">
                            <button title="添加子分类"><i class="fas fa-plus"></i></button>
                            <button title="编辑"><i class="fas fa-pen"></i></button>
                            <button title="删除"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
                <div class="cat-accordion-children">
                    ${children.map(ch => {
                        const chCount = this.memos.filter(m => m.categoryId === ch.id).length;
                        const chColor = ch.color || parent.color || '#64b4ff';
                        return `
                        <div class="cat-accordion-child" data-id="${ch.id}" draggable="true">
                            <span class="cat-accordion-child-dot" style="background:${chColor}"></span>
                            <span class="cat-accordion-child-name">${this.escapeHtml(ch.name)}</span>
                            <div class="cat-accordion-child-right">
                                <span class="cat-accordion-child-count">${chCount}</span>
                                <div class="cat-accordion-child-actions">
                                    <button title="编辑"><i class="fas fa-pen"></i></button>
                                    <button title="删除"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                    <div class="cat-accordion-add-sub" data-parent="${parent.id}">
                        <i class="fas fa-plus"></i> 添加子分类
                    </div>
                </div>
            </div>
            `;
        });
        return html;
    }
    
    _hexToRgb(hex) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
    }
    
    /**
     * 添加新分类
     */
    async addNewCategory(panel) {
        this._showInlineCreate(panel);
    }
    
    /**
     * 绑定分类项事件（折叠分组卡片）
     */
    bindCategoryItemEvents(panel) {
        const listEl = panel.querySelector('#category-list');
        if (!listEl) return;
        
        // 一级分类折叠/展开
        listEl.querySelectorAll('.cat-accordion-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.cat-accordion-actions')) return;
                const group = header.closest('.cat-accordion-group');
                if (group) group.classList.toggle('expanded');
            });
        });
        
        // 添加子分类
        listEl.querySelectorAll('.cat-accordion-add-sub').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const parentId = el.dataset.parent;
                if (parentId) this._showInlineCreate(panel, parentId);
            });
        });
        
        // 一级分类头部的添加子分类按钮
        listEl.querySelectorAll('.cat-accordion-group').forEach(group => {
            const addBtn = group.querySelector('.cat-accordion-actions button[title="添加子分类"]');
            if (addBtn) {
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showInlineCreate(panel, group.dataset.id);
                });
            }
            const editBtn = group.querySelector('.cat-accordion-actions button[title="编辑"]');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editCategory(group.dataset.id, panel);
                });
            }
            const deleteBtn = group.querySelector('.cat-accordion-actions button[title="删除"]');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    this._confirmDeleteCategory(group.dataset.id, panel);
                });
            }
        });
        
        // 子分类的编辑、删除
        listEl.querySelectorAll('.cat-accordion-child').forEach(child => {
            child.addEventListener('dblclick', (e) => {
                if (e.target.closest('.cat-accordion-child-actions')) return;
                this.editCategory(child.dataset.id, panel);
            });
            child.querySelectorAll('.cat-accordion-child-actions button[title="编辑"]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editCategory(child.dataset.id, panel);
                });
            });
            child.querySelectorAll('.cat-accordion-child-actions button[title="删除"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    this._confirmDeleteCategory(child.dataset.id, panel);
                });
            });
        });
        
        // 跨层级拖拽：记录拖拽来源类型和 ID
        let dragType = null;  // 'group' | 'child'
        let dragId = null;

        const clearAllDragStyles = () => {
            listEl.querySelectorAll('.cat-accordion-group, .cat-accordion-child').forEach(el => {
                el.classList.remove('cat-accordion-drag-over-top', 'cat-accordion-drag-over-bottom', 'cat-accordion-drag-over-into', 'cat-accordion-dragging');
            });
            const dropRoot = panel.querySelector('.cat-drag-promote-zone');
            if (dropRoot) dropRoot.classList.remove('cat-drag-promote-active');
        };

        // 一级分类拖拽
        listEl.querySelectorAll('.cat-accordion-group').forEach(group => {
            group.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                dragType = 'group';
                dragId = group.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', dragId);
                group.classList.add('cat-accordion-dragging');
            });
            group.addEventListener('dragend', () => {
                clearAllDragStyles();
                dragType = null;
                dragId = null;
            });
            group.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!dragId || dragId === group.dataset.id) return;
                e.dataTransfer.dropEffect = 'move';
                group.classList.remove('cat-accordion-drag-over-top', 'cat-accordion-drag-over-bottom', 'cat-accordion-drag-over-into');
                if (dragType === 'child') {
                    group.classList.add('cat-accordion-drag-over-into');
                } else {
                    const rect = group.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;
                    group.classList.toggle('cat-accordion-drag-over-bottom', e.clientY > mid);
                    group.classList.toggle('cat-accordion-drag-over-top', e.clientY <= mid);
                }
            });
            group.addEventListener('dragleave', (e) => {
                if (!group.contains(e.relatedTarget)) {
                    group.classList.remove('cat-accordion-drag-over-bottom', 'cat-accordion-drag-over-top', 'cat-accordion-drag-over-into');
                }
            });
            group.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearAllDragStyles();
                const fromId = dragId;
                const toId = group.dataset.id;
                if (!fromId || fromId === toId) return;

                if (dragType === 'child') {
                    // 子分类 → 拖到一级分类上 = 切换父分类
                    await this._dragMoveChildToParent(fromId, toId, panel);
                } else if (dragType === 'group') {
                    const fromCat = this.categories.find(c => c.id === fromId);
                    const toCat = this.categories.find(c => c.id === toId);
                    if (!fromCat || !toCat) return;
                    if (toCat.parentId) return;  // 目标不是一级，不处理

                    const rect = group.getBoundingClientRect();
                    const third = rect.height / 3;
                    const relY = e.clientY - rect.top;

                    if (relY > third && relY < third * 2) {
                        // 中间区域 → 变为子分类
                        await this._dragMakeGroupChild(fromId, toId, panel);
                    } else {
                        // 上/下区域 → 排序
                        const topLevel = this._getTopLevelCategories();
                        const fromIdx = topLevel.findIndex(c => c.id === fromId);
                        const toIdx = topLevel.findIndex(c => c.id === toId);
                        if (fromIdx === -1 || toIdx === -1) return;
                        const [moved] = topLevel.splice(fromIdx, 1);
                        const insertIdx = relY >= third * 2
                            ? (fromIdx < toIdx ? toIdx : toIdx + 1)
                            : (fromIdx < toIdx ? toIdx - 1 : toIdx);
                        topLevel.splice(insertIdx, 0, moved);
                        this._reorderCategoriesByTopLevel(topLevel);
                        await this.saveCategories();
                        this._refreshCategoryList(panel);
                        this.updateCategorySelects();
                    }
                }
            });
        });

        // 子分类拖拽
        listEl.querySelectorAll('.cat-accordion-child').forEach(child => {
            child.addEventListener('dragstart', (e) => {
                e.stopPropagation();
                dragType = 'child';
                dragId = child.dataset.id;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', dragId);
                child.classList.add('cat-accordion-dragging');
            });
            child.addEventListener('dragend', () => {
                clearAllDragStyles();
                dragType = null;
                dragId = null;
            });
        });

        // 「提升为一级分类」拖拽区域
        const promoteZone = panel.querySelector('.cat-drag-promote-zone');
        if (promoteZone) {
            promoteZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (dragType === 'child' && dragId) {
                    promoteZone.classList.add('cat-drag-promote-active');
                }
            });
            promoteZone.addEventListener('dragleave', () => {
                promoteZone.classList.remove('cat-drag-promote-active');
            });
            promoteZone.addEventListener('drop', async (e) => {
                e.preventDefault();
                promoteZone.classList.remove('cat-drag-promote-active');
                if (dragType === 'child' && dragId) {
                    await this._dragPromoteToTopLevel(dragId, panel);
                }
            });
        }
    }
    
    /**
     * 拖拽：将一级分类变为另一个一级分类的子分类
     */
    async _dragMakeGroupChild(fromId, toParentId, panel) {
        const from = this.categories.find(c => c.id === fromId);
        const toParent = this.categories.find(c => c.id === toParentId);
        if (!from || !toParent || toParent.parentId) return;

        // 将其子分类一并迁移
        const children = this._getChildCategories(fromId);
        from.parentId = toParentId;
        children.forEach(ch => { ch.parentId = toParentId; });

        await this.saveCategories();
        this._refreshCategoryList(panel);
        this.updateCategorySelects();
        this.renderSidebarTaskList();
    }
    
    /**
     * 拖拽：将子分类移动到新的父分类下
     */
    async _dragMoveChildToParent(childId, newParentId, panel) {
        const child = this.categories.find(c => c.id === childId);
        const newParent = this.categories.find(c => c.id === newParentId);
        if (!child || !newParent || newParent.parentId) return;
        if (child.parentId === newParentId) return;

        child.parentId = newParentId;
        await this.saveCategories();
        this._refreshCategoryList(panel);
        this.updateCategorySelects();
        this.renderSidebarTaskList();
    }
    
    /**
     * 拖拽：将子分类提升为一级分类
     */
    async _dragPromoteToTopLevel(childId, panel) {
        const child = this.categories.find(c => c.id === childId);
        if (!child || !child.parentId) return;

        delete child.parentId;
        await this.saveCategories();
        this._refreshCategoryList(panel);
        this.updateCategorySelects();
        this.renderSidebarTaskList();
    }
    
    /**
     * 按一级分类顺序重新排列 categories 数组
     */
    _reorderCategoriesByTopLevel(topLevelOrder) {
        const result = [];
        topLevelOrder.forEach(parent => {
            result.push(parent);
            this._getChildCategories(parent.id).forEach(ch => result.push(ch));
        });
        this.categories = result;
    }
    
    /**
     * 确认删除分类
     */
    async _confirmDeleteCategory(categoryId, panel) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;
        const children = this._getChildCategories(categoryId);
        const msg = children.length > 0
            ? `确定要删除 "${category.name}" 及其 ${children.length} 个子分类吗？相关任务将变为无分类。`
            : '确定要删除这个分类吗？相关任务将变为无分类。';
        if (confirm(msg)) {
            await this.deleteCategoryById(categoryId);
            this._refreshCategoryList(panel);
            this.updateCategorySelects();
            this.renderSidebarTaskList();
        }
    }
    
    /**
     * 编辑分类（适配折叠分组卡片：一级分类编辑 header，子分类编辑 child 行）
     */
    editCategory(categoryId, panel) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;
        
        const groupEl = panel.querySelector(`.cat-accordion-group[data-id="${categoryId}"]`);
        const childEl = panel.querySelector(`.cat-accordion-child[data-id="${categoryId}"]`);
        const itemEl = groupEl ? groupEl.querySelector('.cat-accordion-header') : childEl;
        if (!itemEl) return;
        
        const presetColors = ['#64b4ff', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#a3a3a3'];
        let selectedColor = category.color || '#64b4ff';
        
        itemEl.classList.add('category-item-editing');
        itemEl.innerHTML = `
            <input type="text" class="edit-category-name" value="${this.escapeHtml(category.name)}" maxlength="20">
            <div class="category-color-palette">
                ${presetColors.map(c => `<span class="category-palette-dot${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></span>`).join('')}
            </div>
            <div class="category-edit-footer">
                <button class="category-save-btn"><i class="fas fa-check"></i> 保存</button>
                <button class="category-cancel-btn"><i class="fas fa-times"></i> 取消</button>
                <button class="category-delete-inline-btn" title="删除分类"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        const nameInput = itemEl.querySelector('.edit-category-name');
        const saveBtn = itemEl.querySelector('.category-save-btn');
        const cancelBtn = itemEl.querySelector('.category-cancel-btn');
        const deleteBtn = itemEl.querySelector('.category-delete-inline-btn');
        
        nameInput.focus();
        nameInput.select();
        
        itemEl.querySelectorAll('.category-palette-dot').forEach(dot => {
            dot.addEventListener('click', () => {
                itemEl.querySelectorAll('.category-palette-dot').forEach(d => d.classList.remove('selected'));
                dot.classList.add('selected');
                selectedColor = dot.dataset.color;
            });
        });
        
        const saveEdit = async () => {
            const newName = nameInput.value.trim();
            if (!newName) return;
            category.name = newName;
            category.color = selectedColor;
            await this.saveCategories();
            this._refreshCategoryList(panel);
            this.updateCategorySelects();
            this.renderSidebarTaskList();
        };
        
        saveBtn.addEventListener('click', saveEdit);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
        });
        
        const cancelEdit = () => this._refreshCategoryList(panel);
        cancelBtn.addEventListener('click', cancelEdit);
        
        deleteBtn.addEventListener('click', async () => {
            if (confirm('确定要删除这个分类吗？相关任务将变为无分类。')) {
                await this.deleteCategoryById(categoryId);
                this._refreshCategoryList(panel);
                this.updateCategorySelects();
                this.renderSidebarTaskList();
            }
        });
    }
    
    /**
     * 删除分类（含子分类级联删除，相关任务变为无分类）
     */
    async deleteCategoryById(categoryId) {
        const toDelete = [categoryId];
        const children = this._getChildCategories(categoryId);
        children.forEach(ch => toDelete.push(ch.id));
        this.categories = this.categories.filter(c => !toDelete.includes(c.id));
        await this.saveCategories();
        
        let needSave = false;
        this.memos.forEach(memo => {
            if (toDelete.includes(memo.categoryId)) {
                memo.categoryId = null;
                needSave = true;
            }
        });
        if (needSave) await this.saveMemos();
    }
    
    /**
     * 更新分类选择下拉框
     */
    updateCategorySelects() {
        if (this._sidebarCategoryCombobox && typeof this._sidebarCategoryCombobox.setOptions === 'function') {
            this._sidebarCategoryCombobox.setOptions();
        }
        if (this._formCategoryCombobox && typeof this._formCategoryCombobox.setOptions === 'function') {
            this._formCategoryCombobox.setOptions();
        }
    }
    
    /**
     * 快速添加任务（从搜索框直接创建）
     * @param {string} title 任务标题
     */
    async quickAddTask(title) {
        if (!title || !title.trim()) return;
        
        const newTask = {
            id: this.generateId(),
            title: title.trim(),
            text: '',
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            categoryId: null,
            tagIds: [],
            priority: 'none',
            dueDate: this.getTodayDate(),  // 默认今天
            images: []
        };
        
        this.memos.unshift(newTask);
        await this.saveMemos();
        
        // 清空搜索框
        const searchInput = document.getElementById('sidebar-search');
        if (searchInput) {
            searchInput.value = '';
        }
        
        // 重新渲染
        this.renderSidebarTaskList();
        
        // 显示成功提示
        this.showToast(`任务 "${title.substring(0, 20)}${title.length > 20 ? '...' : ''}" 已创建`);
    }
    
    /**
     * 显示轻量提示消息
     * @param {string} message 消息内容
     * @param {number} duration 显示时长（毫秒）
     * @param {Object} [options] 可选配置
     * @param {Function} [options.onClick] 点击回调（设置后 toast 可点击）
     * @param {string} [options.icon] 自定义图标 class（默认 fa-check-circle）
     */
    showToast(message, duration = 2000, options = {}) {
        // 移除已有的 toast
        const existingToast = document.querySelector('.memo-toast');
        if (existingToast) existingToast.remove();
        
        const iconClass = options.icon || 'fas fa-check-circle';
        const toast = document.createElement('div');
        toast.className = 'memo-toast';
        
        if (options.onClick) {
            toast.classList.add('clickable');
            toast.innerHTML = `<i class="${iconClass}"></i> ${this.escapeHtml(message)} <span class="toast-action-hint">点击操作</span>`;
            toast.addEventListener('click', () => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
                options.onClick();
            });
        } else {
            toast.innerHTML = `<i class="${iconClass}"></i> ${this.escapeHtml(message)}`;
        }
        
        document.body.appendChild(toast);
        
        // 显示动画
        requestAnimationFrame(() => toast.classList.add('show'));
        
        // 自动消失
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    
    /**
     * 更新进度预览（纯百分比模式）
     * @param {number} percentage - 百分比 (0-100)
     */
    updateProgressPreview(percentage = null) {
        const previewFill = document.getElementById('progress-preview-fill');
        const slider = document.getElementById('sidebar-task-progress-slider');
        const percentInput = document.getElementById('sidebar-task-progress-percent');
        
        if (percentage === null) {
            // 从滑块或输入框获取当前值
            percentage = parseInt(slider?.value) || parseInt(percentInput?.value) || 0;
        }
        
        // 确保在有效范围内
        percentage = Math.max(0, Math.min(100, percentage));
        
        // 更新预览进度条
        if (previewFill) {
            previewFill.style.width = `${percentage}%`;
            // 根据进度设置颜色
            if (percentage === 100) {
                previewFill.className = 'progress-preview-fill complete';
            } else if (percentage >= 60) {
                previewFill.className = 'progress-preview-fill high';
            } else if (percentage >= 30) {
                previewFill.className = 'progress-preview-fill medium';
            } else {
                previewFill.className = 'progress-preview-fill low';
            }
        }
    }
    
    /**
     * 从滑块更新进度
     */
    updateProgressFromSlider() {
        const slider = document.getElementById('sidebar-task-progress-slider');
        const percentInput = document.getElementById('sidebar-task-progress-percent');
        
        if (!slider) return;
        
        const percentage = parseInt(slider.value) || 0;
        
        // 同步到百分比输入框
        if (percentInput) {
            percentInput.value = percentage;
        }
        
        this.updateProgressPreview(percentage);
    }
    
    /**
     * 从百分比输入框更新进度
     */
    updateProgressFromPercent() {
        const slider = document.getElementById('sidebar-task-progress-slider');
        const percentInput = document.getElementById('sidebar-task-progress-percent');
        
        if (!percentInput) return;
        
        let percentage = parseInt(percentInput.value) || 0;
        
        // 确保在有效范围内
        percentage = Math.max(0, Math.min(100, percentage));
        
        // 同步到滑块
        if (slider) {
            slider.value = percentage;
        }
        
        this.updateProgressPreview(percentage);
    }
    
    /**
     * 显示侧边栏任务表单
     */
    showSidebarForm(task = null, options = {}) {
        const modal = document.getElementById('sidebar-form-modal');
        if (!modal) return;
        
        const titleEl = document.getElementById('sidebar-form-title');
        const titleInput = document.getElementById('sidebar-task-title');
        const textInput = document.getElementById('sidebar-task-text');
        const prioritySelect = document.getElementById('sidebar-task-priority');
        const startInput = document.getElementById('sidebar-task-start');
        const dueInput = document.getElementById('sidebar-task-due');
        const previewList = document.getElementById('image-preview-list');
        
        // 进度相关元素（纯百分比模式）
        const progressEnable = document.getElementById('sidebar-task-progress-enable');
        const progressInputs = document.getElementById('progress-inputs');
        const progressSlider = document.getElementById('sidebar-task-progress-slider');
        const progressPercent = document.getElementById('sidebar-task-progress-percent');
        
        // 清空临时图片、链接和子任务
        this.tempImages = [];
        this.tempLinks = [];
        this.tempSubtasks = [];
        if (previewList) previewList.innerHTML = '';
        const linksList = document.getElementById('sidebar-task-links-list');
        if (linksList) linksList.innerHTML = '';
        const subtasksList = document.getElementById('subtasks-edit-list');
        if (subtasksList) subtasksList.innerHTML = '';
        
        // 更新分类选项（Combobox 在创建时已用 this.categories，此处仅需 setValue）
        
        // 重复任务相关元素
        const recurrenceSelect = document.getElementById('sidebar-task-recurrence');
        const habitIconInput = document.getElementById('sidebar-task-habit-icon');
        
        if (task) {
            titleEl.textContent = task.recurrence?.enabled ? '编辑习惯' : '编辑任务';
            modal.dataset.taskId = task.id;
            titleInput.value = task.title || '';
            textInput.value = task.text || '';
            prioritySelect.value = task.priority || 'none';
            if (startInput) startInput.value = task.startDate || '';
            dueInput.value = task.dueDate || '';
            if (this._formCategoryCombobox) this._formCategoryCombobox.setValue(task.categoryId || '');
            this._updateDurationHint();
            
            // 加载重复任务配置
            if (recurrenceSelect) {
                recurrenceSelect.value = task.recurrence?.enabled ? task.recurrence.type : 'none';
            }
            if (habitIconInput) {
                habitIconInput.value = task.habitCard?.icon || '';
            }
            // 控制图标输入框可见性
            this.toggleHabitIconVisibility(recurrenceSelect?.value);
            
            // 加载进度数据（纯百分比）
            if (task.progress !== null && task.progress !== undefined && progressEnable && progressInputs) {
                const percentage = parseInt(task.progress) || 0;
                progressEnable.checked = true;
                progressInputs.classList.remove('hidden');
                if (progressSlider) progressSlider.value = percentage;
                if (progressPercent) progressPercent.value = percentage;
                this.updateProgressPreview(percentage);
            } else if (progressEnable && progressInputs) {
                progressEnable.checked = false;
                progressInputs.classList.add('hidden');
                if (progressSlider) progressSlider.value = 0;
                if (progressPercent) progressPercent.value = 0;
                this.updateProgressPreview(0);
            }
            
            // 加载已有图片（兼容 ImgVault 新格式和 base64 旧格式）
            if (task.images && task.images.length > 0 && previewList) {
                task.images.forEach(img => {
                    // 保留原始数据格式（新旧兼容）
                    const tempImg = {
                        id: img.id,
                        existing: true  // 标记为已有图片
                    };
                    if (img.imageId) {
                        // ImgVault 新格式
                        tempImg.imageId = img.imageId;
                        tempImg.imageUuid = img.imageUuid;
                        tempImg.originalName = img.originalName;
                    } else {
                        // base64 旧格式
                        tempImg.thumbnail = img.thumbnail;
                        tempImg.fullImage = img.fullImage || img.thumbnail;
                    }
                    this.tempImages.push(tempImg);
                    
                    const thumbUrl = this.getImageThumbnail(img);
                    const previewItem = document.createElement('div');
                    previewItem.className = 'image-preview-item';
                    previewItem.dataset.imageId = img.id;
                    previewItem.innerHTML = `
                        <img src="${thumbUrl}" alt="预览">
                        <button type="button" class="remove-image" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    this.bindImageErrorFallback(previewItem.querySelector('img'));
                    
                    previewItem.querySelector('.remove-image').addEventListener('click', () => {
                        this.removePreviewImage(img.id);
                    });
                    
                    previewList.appendChild(previewItem);
                });
            }
            
            // 加载已有链接
            if (task.links && task.links.length > 0) {
                this.tempLinks = [...task.links];
                this.renderLinksPreview();
            }
            
            // 加载已有子任务
            if (task.subtasks && task.subtasks.length > 0) {
                this.tempSubtasks = task.subtasks.map(st => ({ ...st }));
                this.renderSubtasksEdit();
            }
        } else {
            titleEl.textContent = options.recurrenceType === 'daily' ? '新增习惯' : '新增任务';
            delete modal.dataset.taskId;
            titleInput.value = '';
            textInput.value = '';
            prioritySelect.value = 'none';
            if (startInput) startInput.value = '';
            dueInput.value = this.getTodayDate();
            if (this._formCategoryCombobox) this._formCategoryCombobox.setValue('');
            this._updateDurationHint();
            
            // 设置重复类型（支持从习惯区域添加）
            if (recurrenceSelect) {
                recurrenceSelect.value = options.recurrenceType || 'none';
            }
            if (habitIconInput) {
                habitIconInput.value = '';
            }
            this.toggleHabitIconVisibility(options.recurrenceType || 'none');
            
            // 重置进度（纯百分比模式）
            if (progressEnable) progressEnable.checked = false;
            if (progressInputs) progressInputs.classList.add('hidden');
            if (progressSlider) progressSlider.value = 0;
            if (progressPercent) progressPercent.value = 0;
            this.updateProgressPreview(0);
            
            // 重置链接和子任务
            this.tempLinks = [];
            this.tempSubtasks = [];
        }
        
        // 重置到第一个标签页
        document.querySelectorAll('.sidebar-form-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-form-tab-panel').forEach(p => p.classList.remove('active'));
        const firstTab = document.querySelector('.sidebar-form-tab[data-form-tab="basic"]');
        const firstPanel = document.getElementById('form-tab-basic');
        if (firstTab) firstTab.classList.add('active');
        if (firstPanel) firstPanel.classList.add('active');
        
        // 更新底部状态区
        this._updateFormStatusBar(task);
        
        modal.classList.remove('hidden');
        titleInput.focus();
    }
    
    /**
     * 更新表单底部状态区（显示当前状态徽章和优先级标签）
     */
    _updateFormStatusBar(task) {
        const statusArea = document.getElementById('sidebar-form-status');
        if (!statusArea) return;
        
        if (!task) {
            statusArea.innerHTML = '';
            return;
        }
        
        let statusClass = 'not-started';
        let statusText = '未开始';
        let statusIcon = 'far fa-clock';
        
        if (task.completed) {
            statusClass = 'completed';
            statusText = '已完成';
            statusIcon = 'fas fa-check-circle';
        } else if (task.dueDate && new Date(task.dueDate) < new Date()) {
            statusClass = 'overdue';
            statusText = '已逾期';
            statusIcon = 'fas fa-exclamation-circle';
        } else if (task.progress > 0) {
            statusClass = 'in-progress';
            statusText = '进行中';
            statusIcon = 'fas fa-spinner';
        }
        
        const priorityMap = { high: '高', medium: '中', low: '低' };
        const priorityLabel = priorityMap[task.priority];
        
        statusArea.innerHTML = `
            <span class="form-status-badge ${statusClass}"><i class="${statusIcon}"></i> ${statusText}</span>
            ${priorityLabel ? `<span class="form-priority-chip"><span class="priority-dot ${task.priority}"></span> ${priorityLabel}优先级</span>` : ''}
        `;
    }
    
    /**
     * 渲染链接预览列表（含短链状态）
     */
    renderLinksPreview() {
        const linksList = document.getElementById('sidebar-task-links-list');
        if (!linksList) return;
        
        linksList.innerHTML = '';
        
        if (!this.tempLinks || this.tempLinks.length === 0) return;
        
        this.tempLinks.forEach((link, index) => {
            const linkItem = document.createElement('div');
            linkItem.className = 'link-preview-item';
            
            // 跳转使用短链（如果有）
            const href = link.shortUrl || link.url;
            const isLoading = link._loading;
            const hasShortUrl = !!link.shortUrl;
            
            // 状态图标
            let statusHtml = '';
            if (isLoading) {
                statusHtml = '<i class="fas fa-spinner fa-spin link-status-icon loading" title="正在生成短链..."></i>';
            } else if (hasShortUrl) {
                statusHtml = `<i class="fas fa-compress-alt link-status-icon success" title="短链: ${this.escapeHtml(link.shortCode)}"></i>`;
            }
            
            linkItem.innerHTML = `
                <i class="fas fa-link link-item-icon"></i>
                <a href="${this.escapeHtml(href)}" class="link-item-text" target="_blank" rel="noopener noreferrer" title="${this.escapeHtml(link.url)}${hasShortUrl ? '\n短链: ' + this.escapeHtml(link.shortUrl) : ''}">
                    ${this.escapeHtml(link.title || link.url)}
                </a>
                ${statusHtml}
                <button type="button" class="link-remove-btn" data-index="${index}" title="移除">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // 阻止链接点击冒泡到表单
            linkItem.querySelector('a').addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            linkItem.querySelector('.link-remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTempLink(index);
            });
            
            linksList.appendChild(linkItem);
        });
    }
    
    /**
     * 添加临时链接（集成 TinyURL 短链）
     */
    async addTempLink() {
        const titleInput = document.getElementById('sidebar-link-title-input');
        const urlInput = document.getElementById('sidebar-link-url-input');
        const addBtn = document.getElementById('sidebar-link-add-btn');
        
        if (!urlInput) return;
        
        let url = urlInput.value.trim();
        if (!url) {
            urlInput.focus();
            urlInput.classList.add('input-error');
            setTimeout(() => urlInput.classList.remove('input-error'), 800);
            return;
        }
        
        // 自动补全 https://
        if (!/^https?:\/\//i.test(url)) {
            url = 'https://' + url;
        }
        
        // 简单的 URL 验证
        try {
            new URL(url);
        } catch {
            urlInput.classList.add('input-error');
            setTimeout(() => urlInput.classList.remove('input-error'), 800);
            return;
        }
        
        if (!this.tempLinks) this.tempLinks = [];
        
        const title = titleInput ? titleInput.value.trim() : '';
        
        // 先添加链接（带 loading 状态），立即响应用户操作
        const linkData = { title, url, shortUrl: null, shortCode: null, _loading: true };
        this.tempLinks.push(linkData);
        
        // 清空输入框
        if (titleInput) titleInput.value = '';
        urlInput.value = '';
        urlInput.focus();
        
        this.renderLinksPreview();
        
        // 异步创建短链
        if (typeof tinyUrlService !== 'undefined') {
            try {
                // 禁用按钮防止重复操作
                if (addBtn) addBtn.disabled = true;
                
                const shortInfo = await tinyUrlService.createShortUrl(url);
                if (shortInfo) {
                    linkData.shortUrl = shortInfo.shortUrl;
                    linkData.shortCode = shortInfo.shortCode;
                }
            } catch (err) {
                console.warn('[Memo] 短链创建失败，使用原始链接:', err);
            } finally {
                linkData._loading = false;
                if (addBtn) addBtn.disabled = false;
                this.renderLinksPreview();
            }
        } else {
            linkData._loading = false;
            this.renderLinksPreview();
        }
    }
    
    /**
     * 移除临时链接
     */
    removeTempLink(index) {
        if (!this.tempLinks) return;
        this.tempLinks.splice(index, 1);
        this.renderLinksPreview();
    }
    
    // ========= 子任务管理 =========
    
    /**
     * 渲染子任务编辑列表（表单中使用）
     */
    renderSubtasksEdit() {
        const list = document.getElementById('subtasks-edit-list');
        if (!list) return;
        list.innerHTML = '';
        
        (this.tempSubtasks || []).forEach((st, idx) => {
            const item = document.createElement('div');
            item.className = `subtask-edit-item${st.completed ? ' done' : ''}`;
            item.innerHTML = `
                <div class="subtask-edit-dot${st.completed ? ' checked' : ''}" data-idx="${idx}">
                    <i class="fas fa-check"></i>
                </div>
                <input type="text" class="subtask-edit-input" value="${this.escapeHtml(st.title)}" data-idx="${idx}">
                <button type="button" class="subtask-edit-remove" data-idx="${idx}" title="删除">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            // 勾选
            item.querySelector('.subtask-edit-dot').addEventListener('click', () => {
                this.tempSubtasks[idx].completed = !this.tempSubtasks[idx].completed;
                this.renderSubtasksEdit();
            });
            
            // 编辑标题
            item.querySelector('.subtask-edit-input').addEventListener('change', (e) => {
                this.tempSubtasks[idx].title = e.target.value.trim();
            });
            
            // 删除
            item.querySelector('.subtask-edit-remove').addEventListener('click', () => {
                this.tempSubtasks.splice(idx, 1);
                this.renderSubtasksEdit();
            });
            
            list.appendChild(item);
        });
    }
    
    /**
     * 添加新子任务（表单中使用）
     */
    addSubtask(title) {
        if (!title.trim()) return;
        if (!this.tempSubtasks) this.tempSubtasks = [];
        this.tempSubtasks.push({
            id: 'st_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            title: title.trim(),
            completed: false
        });
        this.renderSubtasksEdit();
    }
    
    /**
     * 列表中子任务文字双击进入内联编辑
     */
    _startSubtaskInlineEdit(taskId, subtaskId, textEl, stItem) {
        const original = textEl.textContent || '';
        textEl.contentEditable = 'true';
        textEl.classList.add('subtask-inline-editing');
        textEl.focus();
        const range = document.createRange();
        range.selectNodeContents(textEl);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        const finish = (save) => {
            textEl.contentEditable = 'false';
            textEl.classList.remove('subtask-inline-editing');
            const newTitle = (textEl.textContent || '').trim();
            if (save && newTitle) {
                this.updateSubtaskTitle(taskId, subtaskId, newTitle);
            } else {
                textEl.textContent = original;
            }
        };
        const onBlur = () => {
            finish(true);
            textEl.removeEventListener('blur', onBlur);
            textEl.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                textEl.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                textEl.textContent = original;
                textEl.blur();
            }
        };
        textEl.addEventListener('blur', onBlur);
        textEl.addEventListener('keydown', onKey);
    }
    
    /**
     * 更新子任务标题（列表内联编辑保存）
     */
    async updateSubtaskTitle(taskId, subtaskId, newTitle) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task || !task.subtasks) return;
        const st = task.subtasks.find(s => s.id === subtaskId);
        if (!st) return;
        st.title = newTitle;
        task.updatedAt = Date.now();
        await this.saveMemos();
    }
    
    /**
     * 在列表中添加子任务（不打开编辑弹窗）
     */
    async addSubtaskInline(taskId, title) {
        if (!(title || '').trim()) return;
        const task = this.memos.find(m => m.id === taskId);
        if (!task) return;
        if (!Array.isArray(task.subtasks)) task.subtasks = [];
        const newSt = {
            id: 'st_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            title: (title || '').trim(),
            completed: false
        };
        task.subtasks.push(newSt);
        task.updatedAt = Date.now();
        const doneCount = task.subtasks.filter(st => st.completed).length;
        task.progress = Math.round((doneCount / task.subtasks.length) * 100);
        await this.saveMemos();
        this.renderSidebarTaskList();
    }
    
    async deleteSubtaskInline(taskId, subtaskId) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task || !Array.isArray(task.subtasks)) return;
        const idx = task.subtasks.findIndex(s => s.id === subtaskId);
        if (idx === -1) return;
        task.subtasks.splice(idx, 1);
        task.updatedAt = Date.now();
        if (task.subtasks.length > 0) {
            const doneCount = task.subtasks.filter(st => st.completed).length;
            task.progress = Math.round((doneCount / task.subtasks.length) * 100);
        } else {
            task.progress = null;
        }
        await this.saveMemos();
        this.renderSidebarTaskList();
    }
    
    async reorderSubtasks(taskId, fromIdx, toIdx) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task || !Array.isArray(task.subtasks)) return;
        if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0) return;
        const [moved] = task.subtasks.splice(fromIdx, 1);
        task.subtasks.splice(toIdx, 0, moved);
        task.updatedAt = Date.now();
        await this.saveMemos();
        this.renderSidebarTaskList();
    }
    
    _bindSubtaskDragEvents(subtasksEl, taskId) {
        const list = subtasksEl.querySelector('.subtask-compact-list');
        if (!list) return;
        let dragItem = null;
        
        list.querySelectorAll('.subtask-compact-item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                dragItem = item;
                item.classList.add('subtask-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', item.dataset.subtaskId);
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('subtask-dragging');
                list.querySelectorAll('.subtask-compact-item').forEach(el => {
                    el.classList.remove('subtask-drag-over');
                });
                dragItem = null;
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragItem && item !== dragItem) {
                    list.querySelectorAll('.subtask-compact-item').forEach(el => el.classList.remove('subtask-drag-over'));
                    item.classList.add('subtask-drag-over');
                }
            });
            item.addEventListener('dragleave', () => {
                item.classList.remove('subtask-drag-over');
            });
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('subtask-drag-over');
                if (!dragItem || item === dragItem) return;
                const items = [...list.querySelectorAll('.subtask-compact-item')];
                const fromIdx = items.indexOf(dragItem);
                const toIdx = items.indexOf(item);
                this.reorderSubtasks(taskId, fromIdx, toIdx);
            });
        });
    }
    
    /**
     * 切换子任务完成状态（任务列表中直接使用）
     * 使用局部更新避免重新渲染整个列表（防止子任务展开状态丢失）
     */
    async toggleSubtaskComplete(taskId, subtaskId) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task || !task.subtasks) return;
        
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (!subtask) return;
        
        subtask.completed = !subtask.completed;
        task.updatedAt = Date.now();
        
        // 有子任务时自动启用进度追踪，子任务完成驱动进度条
        if (task.subtasks.length > 0) {
            const doneCount = task.subtasks.filter(st => st.completed).length;
            task.progress = Math.round((doneCount / task.subtasks.length) * 100);
            
            // 子任务全部完成 → 自动完成父任务（非习惯任务）
            const isHabit = task.recurrence?.enabled;
            if (task.progress === 100 && !task.completed && !isHabit) {
                task.completed = true;
                task.completedAt = Date.now();
            }
            // 子任务未全部完成 → 如果之前被自动完成的，取消完成状态
            if (task.progress < 100 && task.completed && task.completedAt) {
                task.completed = false;
                task.completedAt = null;
            }
        }
        
        await this.saveMemos();
        
        // 局部更新：只更新当前任务卡片内的子任务区域，保持展开状态
        this._updateSubtaskUI(taskId, subtaskId, subtask.completed, task);
    }
    
    /**
     * 局部更新子任务 UI（不重新渲染整个列表）
     */
    _updateSubtaskUI(taskId, subtaskId, completed, task) {
        const subtasksEl = document.querySelector(`.task-subtasks[data-task-id="${taskId}"]`);
        if (!subtasksEl) return;
        
        // 1. 更新子任务项的视觉状态
        const stItem = subtasksEl.querySelector(`.subtask-compact-item[data-subtask-id="${subtaskId}"]`);
        if (stItem) {
            stItem.classList.toggle('done', completed);
        }
        
        // 2. 更新子任务计数
        const doneCount = task.subtasks.filter(st => st.completed).length;
        const totalCount = task.subtasks.length;
        const countEl = subtasksEl.querySelector('.subtask-expand-count');
        if (countEl) {
            countEl.textContent = `${doneCount}/${totalCount}`;
        }
        
        // 3. 更新子任务迷你进度条
        const subtaskPct = Math.round((doneCount / totalCount) * 100);
        const miniFill = subtasksEl.querySelector('.subtask-mini-fill');
        if (miniFill) {
            miniFill.style.width = `${subtaskPct}%`;
            miniFill.classList.toggle('complete', subtaskPct === 100);
        }
        
        // 4. 同步更新任务卡片的主进度条（如果存在）
        const taskItem = subtasksEl.closest('.sidebar-task-item');
        if (taskItem && task.progress !== null && task.progress !== undefined) {
            const progressFill = taskItem.querySelector('.task-progress-fill');
            const progressText = taskItem.querySelector('.task-progress-percentage');
            if (progressFill) {
                progressFill.style.width = `${task.progress}%`;
                // 更新进度条颜色类
                progressFill.className = 'task-progress-fill';
                if (task.progress === 100) progressFill.classList.add('complete');
                else if (task.progress >= 60) progressFill.classList.add('high');
                else if (task.progress >= 30) progressFill.classList.add('medium');
                else progressFill.classList.add('low');
            }
            if (progressText) {
                progressText.textContent = `${task.progress}%`;
            }
        }
        
        // 5. 如果任务完成状态发生变化，刷新任务列表以更新视觉
        if (taskItem) {
            const wasCompleted = taskItem.classList.contains('completed');
            if (task.completed !== wasCompleted) {
                // 完成状态变化：需要重新渲染列表（有排序和分组变动）
                this.renderSidebarTaskList();
            }
        }
    }
    
    /**
     * 给任务卡片上的进度条绑定拖拽交互
     * 允许用户直接在列表中拖拽进度条调整进度，无需打开编辑表单
     */
    _bindProgressDrag(progressEl, task) {
        const bar = progressEl.querySelector('.task-progress-bar');
        if (!bar) return;
        
        let dragging = false;
        let saveTimer = null;
        
        // 计算百分比
        const calcPercent = (e) => {
            const rect = bar.getBoundingClientRect();
            const x = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
            return Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
        };
        
        // 更新 DOM
        const updateUI = (pct) => {
            const fill = bar.querySelector('.task-progress-fill');
            const text = progressEl.querySelector('.task-progress-percentage');
            if (fill) {
                fill.style.width = `${pct}%`;
                fill.className = 'task-progress-fill';
                if (pct === 100) fill.classList.add('complete');
                else if (pct >= 60) fill.classList.add('high');
                else if (pct >= 30) fill.classList.add('medium');
                else fill.classList.add('low');
            }
            if (text) text.textContent = `${pct}%`;
        };
        
        // 保存到存储（防抖 500ms）
        const debounceSave = (pct) => {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
                task.progress = pct;
                task.updatedAt = Date.now();
                // 进度到 100% 自动完成
                if (pct === 100 && !task.completed) {
                    const isHabit = task.recurrence?.enabled;
                    if (!isHabit) {
                        task.completed = true;
                        task.completedAt = Date.now();
                    }
                }
                // 如果从 100% 拉下来，取消完成
                if (pct < 100 && task.completed && task.completedAt) {
                    task.completed = false;
                    task.completedAt = null;
                }
                await this.saveMemos();
                // 完成状态变化时刷新列表
                const item = progressEl.closest('.sidebar-task-item');
                if (item) {
                    const wasCompleted = item.classList.contains('completed');
                    if (task.completed !== wasCompleted) {
                        this.renderSidebarTaskList();
                    }
                }
            }, 500);
        };
        
        const onStart = (e) => {
            // 如果来自 touch 事件，只取第一个触点
            if (e.touches && e.touches.length > 1) return;
            e.stopPropagation();
            e.preventDefault();
            dragging = true;
            bar.classList.add('dragging');
            const pct = calcPercent(e);
            updateUI(pct);
            debounceSave(pct);
        };
        
        const onMove = (e) => {
            if (!dragging) return;
            e.preventDefault();
            const pct = calcPercent(e);
            updateUI(pct);
            debounceSave(pct);
        };
        
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            bar.classList.remove('dragging');
        };
        
        // 鼠标事件
        bar.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        
        // 触摸事件
        bar.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        
        // 单击直接跳转到对应位置
        bar.addEventListener('click', (e) => {
            e.stopPropagation();
            const pct = calcPercent(e);
            updateUI(pct);
            debounceSave(pct);
        });
    }
    
    /**
     * 控制习惯图标输入框的显示/隐藏
     */
    toggleHabitIconVisibility(recurrenceType) {
        const habitIconInput = document.getElementById('sidebar-task-habit-icon');
        if (habitIconInput) {
            habitIconInput.style.display = recurrenceType === 'daily' ? '' : 'none';
        }
    }
    
    /**
     * 获取任务的精确状态（基于完成态、开始/截止日期与当前日期的关系）
     * @param {Object} task
     * @returns {{ key: string, label: string, icon: string, color: string }}
     */
    getTaskStatus(task) {
        if (task.completed) {
            return { key: 'completed', label: '已完成', icon: 'fas fa-check-circle', color: '#2ed573' };
        }
        const today = this.getTodayDate();
        const start = task.startDate || this.formatDateFromTimestamp(task.createdAt);
        const end = task.dueDate;

        if (end && end < today) {
            return { key: 'overdue', label: '已逾期', icon: 'fas fa-exclamation-circle', color: '#ff4757' };
        }
        if (start > today) {
            return { key: 'not_started', label: '未开始', icon: 'far fa-clock', color: '#a0a0a0' };
        }
        return { key: 'in_progress', label: '进行中', icon: 'fas fa-spinner', color: '#ffa502' };
    }

    /**
     * 获取任务的有效开始日期 key（优先 startDate，否则用 createdAt）
     */
    getTaskStartKey(task) {
        return task.startDate || this.formatDateFromTimestamp(task.createdAt);
    }
    
    /**
     * 计算两个日期间的工作日数（排除周末）
     * @param {string} startStr 'YYYY-MM-DD'
     * @param {string} endStr 'YYYY-MM-DD'
     * @returns {number} 工作日天数（含首尾）
     */
    calcWorkdays(startStr, endStr) {
        if (!startStr || !endStr || startStr > endStr) return 0;
        let count = 0;
        const cur = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T00:00:00');
        while (cur <= end) {
            const dow = cur.getDay();
            if (dow !== 0 && dow !== 6) count++;
            cur.setDate(cur.getDate() + 1);
        }
        return count;
    }
    
    /**
     * 计算两个日期间的自然日数（含首尾）
     */
    calcCalendarDays(startStr, endStr) {
        if (!startStr || !endStr || startStr > endStr) return 0;
        const s = new Date(startStr + 'T00:00:00');
        const e = new Date(endStr + 'T00:00:00');
        return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
    }
    
    /**
     * 更新表单中的工期提示
     */
    _updateDurationHint() {
        const hint = document.getElementById('task-duration-hint');
        if (!hint) return;
        const startInput = document.getElementById('sidebar-task-start');
        const dueInput = document.getElementById('sidebar-task-due');
        const start = startInput?.value;
        const end = dueInput?.value;
        
        if (start && end && start <= end) {
            const calDays = this.calcCalendarDays(start, end);
            const workDays = this.calcWorkdays(start, end);
            hint.style.display = '';
            hint.querySelector('.duration-text').innerHTML = 
                `<i class="fas fa-clock"></i> 周期 ${calDays} 天（工作日 ${workDays} 天 / ${(workDays / 5).toFixed(1)} 周）`;
        } else {
            hint.style.display = 'none';
        }
    }
    
    /**
     * 隐藏侧边栏任务表单
     */
    hideSidebarForm() {
        const modal = document.getElementById('sidebar-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            delete modal.dataset.taskId;
        }
        // 重置标签页到第一页
        document.querySelectorAll('.sidebar-form-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-form-tab-panel').forEach(p => p.classList.remove('active'));
        const firstTab = document.querySelector('.sidebar-form-tab[data-form-tab="basic"]');
        const firstPanel = document.getElementById('form-tab-basic');
        if (firstTab) firstTab.classList.add('active');
        if (firstPanel) firstPanel.classList.add('active');
        // 清空底部状态
        const statusArea = document.getElementById('sidebar-form-status');
        if (statusArea) statusArea.innerHTML = '';
        // 清空临时图片
        this.tempImages = [];
        const previewList = document.getElementById('image-preview-list');
        if (previewList) previewList.innerHTML = '';
        // 清空临时链接
        this.tempLinks = [];
        const linksList = document.getElementById('sidebar-task-links-list');
        if (linksList) linksList.innerHTML = '';
        // 清空临时子任务
        this.tempSubtasks = [];
        const subtasksList = document.getElementById('subtasks-edit-list');
        if (subtasksList) subtasksList.innerHTML = '';
    }
    
    /**
     * 保存侧边栏任务
     */
    async saveSidebarTask() {
        const modal = document.getElementById('sidebar-form-modal');
        const titleInput = document.getElementById('sidebar-task-title');
        const textInput = document.getElementById('sidebar-task-text');
        const prioritySelect = document.getElementById('sidebar-task-priority');
        const dueInput = document.getElementById('sidebar-task-due');
        
        // 进度相关（纯百分比模式）
        const progressEnable = document.getElementById('sidebar-task-progress-enable');
        const progressSlider = document.getElementById('sidebar-task-progress-slider');
        const progressPercent = document.getElementById('sidebar-task-progress-percent');
        
        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            titleInput.classList.add('input-error');
            setTimeout(() => titleInput.classList.remove('input-error'), 800);
            return;
        }
        
        // 处理图片数据（ImgVault API 模式：仅存 ID/UUID；兼容旧 base64 数据）
        const images = this.tempImages ? this.tempImages.map(img => {
            if (img.imageId) {
                // 新格式：ImgVault API 上传的图片，仅存少量字符
                return {
                    id: img.id,
                    imageId: img.imageId,
                    imageUuid: img.imageUuid,
                    originalName: img.originalName || ''
                };
            }
            // 旧格式回退：base64（ImgVault 不可用时）
            return {
                id: img.id,
                thumbnail: img.thumbnail,
                fullImage: img.fullImage || img.thumbnail
            };
        }) : [];
        
        // 处理进度数据（纯百分比：0-100 的整数，或 null）
        let progress = null;
        if (progressEnable && progressEnable.checked) {
            // 优先从输入框获取，如果为空则从滑块获取
            let percentage = parseInt(progressPercent?.value);
            if (isNaN(percentage)) {
                percentage = parseInt(progressSlider?.value) || 0;
            }
            progress = Math.max(0, Math.min(100, percentage));
        }
        
        // 处理重复任务配置
        const recurrenceSelect = document.getElementById('sidebar-task-recurrence');
        const habitIconInput = document.getElementById('sidebar-task-habit-icon');
        const recurrenceType = recurrenceSelect ? recurrenceSelect.value : 'none';
        
        let recurrence = null;
        let habitCard = null;
        if (recurrenceType !== 'none') {
            recurrence = {
                enabled: true,
                type: recurrenceType,
                interval: 1,
                weekDays: null,
                monthDay: null,
                endDate: null
            };
            habitCard = {
                icon: habitIconInput?.value?.trim() || '📋',
                color: '#4caf50'
            };
        }
        
        // 处理链接数据（保存短链信息）
        const links = this.tempLinks ? this.tempLinks.map(link => {
            const linkData = { title: link.title, url: link.url };
            if (link.shortUrl) linkData.shortUrl = link.shortUrl;
            if (link.shortCode) linkData.shortCode = link.shortCode;
            return linkData;
        }) : [];
        
        // 处理子任务数据
        const subtasks = this.tempSubtasks ? this.tempSubtasks.map(st => ({
            id: st.id,
            title: st.title,
            completed: !!st.completed
        })) : [];
        
        // 有子任务时，自动开启进度追踪并由子任务驱动进度
        if (subtasks.length > 0) {
            const doneCount = subtasks.filter(st => st.completed).length;
            progress = Math.round((doneCount / subtasks.length) * 100);
        }
        
        const startInput = document.getElementById('sidebar-task-start');
        const taskData = {
            title: title,
            text: textInput.value.trim(),
            priority: prioritySelect.value,
            startDate: startInput ? (startInput.value || null) : null,
            dueDate: dueInput.value || null,
            images: images,
            links: links,
            subtasks: subtasks,
            categoryId: this._formCategoryCombobox ? (this._formCategoryCombobox.getValue() || null) : null,
            progress: progress,
            recurrence: recurrence,
            habitCard: habitCard
        };
        
        const taskId = modal.dataset.taskId;
        
        if (taskId) {
            const task = this.memos.find(m => m.id === taskId);
            if (task) {
                // 保存旧的 habit 数据，防止被覆盖
                const existingHabit = task.habit;
                
                Object.assign(task, taskData);
                task.updatedAt = Date.now();
                
                // 如果是新设为每日重复，初始化 habit
                if (recurrence?.enabled && recurrence?.type === 'daily' && !existingHabit) {
                    task.habit = {
                        streak: 0,
                        bestStreak: 0,
                        completedDates: [],
                        totalCompletions: 0
                    };
                } else if (existingHabit) {
                    // 保留已有的 habit 数据
                    task.habit = existingHabit;
                }
                
                // 如果从每日重复改为不重复，清理 habit 数据
                if (!recurrence?.enabled && existingHabit) {
                    task.habit = null;
                    task.habitCard = null;
                }
                
                // 只有进度达到 100% 才自动标记为已完成（非习惯任务）
                if (progress === 100 && !task.completed && !recurrence?.enabled) {
                    task.completed = true;
                    task.completedAt = Date.now();
                }
            }
        } else {
            const newTask = {
                id: this.generateId(),
                ...taskData,
                completed: progress === 100 && !recurrence?.enabled,
                completedAt: (progress === 100 && !recurrence?.enabled) ? Date.now() : null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                tagIds: [],
                // 每日重复任务初始化 habit 数据
                habit: recurrence?.enabled && recurrence?.type === 'daily' ? {
                    streak: 0,
                    bestStreak: 0,
                    completedDates: [],
                    totalCompletions: 0
                } : null
            };
            this.memos.unshift(newTask);
        }
        
        await this.saveMemos();
        this.tempImages = [];    // 清空临时图片
        this.tempLinks = [];     // 清空临时链接
        this.tempSubtasks = [];  // 清空临时子任务
        this.hideSidebarForm();
        this.renderSidebarTaskList();
    }
    
    /**
     * 切换侧边栏任务完成状态
     */
    async toggleSidebarTaskComplete(taskId) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task) return;
        
        task.completed = !task.completed;
        task.completedAt = task.completed ? Date.now() : null;
        task.updatedAt = Date.now();
        
        // 完成时如果有进度条，自动拉到 100%
        if (task.completed && task.progress !== null && task.progress !== undefined) {
            task.progress = 100;
        }
        
        await this.saveMemos();
        this.renderSidebarTaskList();
        this.refreshCalendarPanelIfOpen();
    }
    
    /**
     * 删除侧边栏任务
     */
    async deleteSidebarTask(taskId) {
        const index = this.memos.findIndex(m => m.id === taskId);
        if (index === -1) return;
        
        this.memos.splice(index, 1);
        await this.saveMemos();
        this.renderSidebarTaskList();
    }
    
    /**
     * 切换侧边栏显示/隐藏
     */
    toggleSidebar() {
        const sidebar = document.getElementById('task-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            
            // 更新右下角按钮图标
            const toggleBtn = document.getElementById('memo-toggle-btn');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    icon.className = isCollapsed ? 'fas fa-tasks' : 'fas fa-chevron-left';
                }
            }
            
            // 保存状态
            chrome.storage.local.set({ sidebarCollapsed: isCollapsed });

            // 同步折叠态 UI（抽出按钮/热区）
            this.updateSidebarCollapseUI();
        }
    }
    
    /**
     * 恢复侧边栏状态
     */
    async restoreSidebarState() {
        try {
            const result = await chrome.storage.local.get('sidebarCollapsed');
            if (result.sidebarCollapsed) {
                const sidebar = document.getElementById('task-sidebar');
                if (sidebar) {
                    sidebar.classList.add('collapsed');
                }
                // 更新按钮图标
                const toggleBtn = document.getElementById('memo-toggle-btn');
                if (toggleBtn) {
                    const icon = toggleBtn.querySelector('i');
                    if (icon) {
                        icon.className = 'fas fa-tasks';
                    }
                }
            }
            // 无论是否折叠，都同步一次折叠态 UI
            this.updateSidebarCollapseUI();
        } catch (e) {
            console.log('恢复侧边栏状态失败', e);
        }
    }

    /**
     * 创建/绑定：折叠态抽出按钮 + 左侧热区自动展开
     */
    ensureSidebarCollapseUI() {
        if (this._sidebarCollapseUIBound) return;
        this._sidebarCollapseUIBound = true;

        // 左侧热区（透明，用于 hover 自动展开）
        let hotzone = document.getElementById('sidebar-edge-hotzone');
        if (!hotzone) {
            hotzone = document.createElement('div');
            hotzone.id = 'sidebar-edge-hotzone';
            hotzone.className = 'sidebar-edge-hotzone';
            document.body.appendChild(hotzone);
        }

        // 左侧抽出“编辑/展开”按钮
        let expandBtn = document.getElementById('sidebar-expand-btn');
        if (!expandBtn) {
            expandBtn = document.createElement('button');
            expandBtn.id = 'sidebar-expand-btn';
            expandBtn.className = 'sidebar-expand-btn';
            expandBtn.title = '展开任务面板 / 新建任务';
            expandBtn.innerHTML = '<i class="fas fa-pen-to-square"></i>';
            document.body.appendChild(expandBtn);
        }

        const sidebar = document.getElementById('task-sidebar');

        const clearAutoCollapseTimer = () => {
            if (this._sidebarAutoCollapseTimer) {
                clearTimeout(this._sidebarAutoCollapseTimer);
                this._sidebarAutoCollapseTimer = null;
            }
        };

        const scheduleAutoCollapse = () => {
            clearAutoCollapseTimer();
            this._sidebarAutoCollapseTimer = setTimeout(() => {
                if (!this._sidebarAutoExpanded) return;
                // 仍在侧边栏附近则不收起
                const hoveringSidebar = sidebar && sidebar.matches(':hover');
                const hoveringHotzone = hotzone && hotzone.matches(':hover');
                if (hoveringSidebar || hoveringHotzone) return;

                // 自动展开的才自动收起；用户手动展开不干预
                const isCollapsed = sidebar?.classList.contains('collapsed');
                if (!isCollapsed) {
                    sidebar?.classList.add('collapsed');
                    chrome.storage.local.set({ sidebarCollapsed: true });
                    this.updateSidebarCollapseUI();
                }
                this._sidebarAutoExpanded = false;
            }, 900);
        };

        // 热区靠近自动展开（只在折叠态生效）
        hotzone.addEventListener('mouseenter', () => {
            const isCollapsed = sidebar?.classList.contains('collapsed');
            if (!isCollapsed) return;

            sidebar?.classList.remove('collapsed');
            // 这是“自动展开”，不写入永久存储；离开后会自动收起
            this._sidebarAutoExpanded = true;
            this.updateSidebarCollapseUI();
            clearAutoCollapseTimer();
        });

        hotzone.addEventListener('mouseleave', () => {
            if (!this._sidebarAutoExpanded) return;
            scheduleAutoCollapse();
        });

        // 侧边栏区域：进入取消收起、离开触发收起（仅自动展开场景）
        if (sidebar) {
            sidebar.addEventListener('mouseenter', () => {
                clearAutoCollapseTimer();
            });
            sidebar.addEventListener('mouseleave', () => {
                if (!this._sidebarAutoExpanded) return;
                scheduleAutoCollapse();
            });
        }

        // 抽出按钮：点击后“固定展开”并直接进入新建（编辑入口）
        expandBtn.addEventListener('click', () => {
            const isCollapsed = sidebar?.classList.contains('collapsed');
            if (isCollapsed) {
                sidebar?.classList.remove('collapsed');
            }
            // 用户手动展开：写入存储并关闭自动收起逻辑
            this._sidebarAutoExpanded = false;
            chrome.storage.local.set({ sidebarCollapsed: false });
            this.updateSidebarCollapseUI();

            if (typeof this.showSidebarForm === 'function') {
                this.showSidebarForm();
            }
        });

        // 兜底：全局委托，确保右上折叠按钮点击一定能触发（避免意外覆盖）
        document.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('#sidebar-collapse-btn');
            if (!btn) return;
            e.preventDefault();
            this.toggleSidebar();
        }, true);

        // 初次同步
        this.updateSidebarCollapseUI();
    }

    /**
     * 根据侧边栏状态刷新抽出按钮/热区显隐
     */
    updateSidebarCollapseUI() {
        const sidebar = document.getElementById('task-sidebar');
        const hotzone = document.getElementById('sidebar-edge-hotzone');
        const expandBtn = document.getElementById('sidebar-expand-btn');
        if (!sidebar || !hotzone || !expandBtn) return;

        const isCollapsed = sidebar.classList.contains('collapsed');
        if (isCollapsed) {
            hotzone.classList.add('active');
            expandBtn.classList.add('visible');
        } else {
            hotzone.classList.remove('active');
            expandBtn.classList.remove('visible');
        }
    }

    /**
     * 从Chrome存储中加载备忘录
     * 优先从 chrome.storage.local 加载，兼容旧的 settings 数据
     */
    async loadMemos() {
        try {
            // 优先从 local storage 加载（支持大数据量）
            const localResult = await new Promise(resolve => {
                chrome.storage.local.get('memos', result => resolve(result));
            });
            
            let memosData = [];
            
            if (Array.isArray(localResult.memos) && localResult.memos.length > 0) {
                // 使用 local storage 的数据
                memosData = localResult.memos;
                console.log('从 local storage 加载备忘录');
            } else {
                // 降级：尝试从旧的 settings 加载（兼容旧版本）
                const settings = window.settingsManager?.settings;
                if (settings && Array.isArray(settings.memos)) {
                    memosData = settings.memos;
                    console.log('从 settings 加载备忘录（旧版本兼容）');
                    // 迁移到 local storage
                    await chrome.storage.local.set({ memos: memosData });
                }
            }
            
            // 验证每个备忘录对象的结构（统一使用 normalizeMemo，确保新字段不丢失）
            this.memos = memosData.map(memo => {
                const normalized = this.normalizeMemo(memo);
                // 兼容旧版标签字段
                if (!normalized.tagIds.length && Array.isArray(memo.tags)) {
                    normalized.tagIds = memo.tags;
                }
                // v1.6.0 兼容旧版进度格式 { current, total }
                if (memo.progress !== undefined && memo.progress !== null) {
                    if (typeof memo.progress === 'object' && memo.progress.total) {
                        normalized.progress = Math.round((memo.progress.current / memo.progress.total) * 100);
                    }
                }
                return normalized;
            });
            
            console.log('备忘录加载成功，数量:', this.memos.length);
        } catch (error) {
            console.error('加载备忘录失败', error);
            this.memos = [];
        }
    }

    /**
     * 保存备忘录到Chrome存储
     * 注意：只使用 chrome.storage.local，不同步到 settings
     * 因为 storage.sync 有 8KB/item 的限制，带图片的数据会超出
     */
    async saveMemos() {
        // 防抖：避免频繁保存导致的性能问题
        if (this._saveDebounceTimer) {
            clearTimeout(this._saveDebounceTimer);
        }
        
        return new Promise((resolve, reject) => {
            this._saveDebounceTimer = setTimeout(async () => {
                try {
                    // 检查存储配额
                    const quotaCheck = await this.checkStorageQuota();
                    if (!quotaCheck.safe) {
                        console.warn('存储空间警告:', quotaCheck.message);
                        
                        // 如果超过警告阈值，尝试压缩图片数据
                        if (quotaCheck.percent >= 90) {
                            console.log('尝试压缩图片数据以释放空间...');
                            await this.compressStoredImages();
                        }
                        
                        // 如果仍然超过 95%，显示警告
                        if (quotaCheck.percent >= 95) {
                            this.showToast('存储空间即将用尽，请删除一些旧任务或图片', 5000);
                        }
                    }
                    
                    // 只保存到 local 存储（最大 10MB）
                    await chrome.storage.local.set({ memos: this.memos });
                    
                    // 通知 background.js 更新任务提醒（使用 try-catch 避免阻塞）
                    try {
                        chrome.runtime.sendMessage({ action: 'setupTaskReminder' });
                    } catch (e) {
                        // 忽略消息发送失败（background 可能未激活）
                    }
                    
                    console.log('备忘录保存成功');
                    resolve(true);
                } catch (error) {
                    console.error('保存备忘录失败', error);
                    
                    // 处理配额超限错误
                    if (error.message && error.message.includes('QUOTA_BYTES')) {
                        this.showToast('存储空间已满，请删除一些任务或图片后重试', 5000);
                        // 尝试自动清理
                        await this.emergencyCleanup();
                    }
                    
                    reject(error);
                }
            }, 100); // 100ms 防抖
        });
    }
    
    /**
     * 检查存储配额使用情况
     * @returns {Object} { safe, percent, sizeKB, message }
     */
    async checkStorageQuota() {
        try {
            const dataStr = JSON.stringify(this.memos);
            const sizeBytes = new Blob([dataStr]).size;
            const maxBytes = 10 * 1024 * 1024; // 10MB
            const percent = (sizeBytes / maxBytes) * 100;
            const sizeKB = (sizeBytes / 1024).toFixed(1);
            
            let message = '';
            let safe = true;
            
            if (percent >= 95) {
                message = `存储空间严重不足！已使用 ${percent.toFixed(1)}% (${sizeKB} KB)`;
                safe = false;
            } else if (percent >= 80) {
                message = `存储空间警告：已使用 ${percent.toFixed(1)}% (${sizeKB} KB)`;
                safe = false;
            }
            
            return { safe, percent, sizeKB, message };
        } catch (error) {
            console.error('检查存储配额失败:', error);
            return { safe: true, percent: 0, sizeKB: '0', message: '' };
        }
    }
    
    /**
     * 压缩已存储的图片数据
     * 将 fullImage 替换为 thumbnail 以节省空间
     */
    async compressStoredImages() {
        let compressed = 0;
        
        for (const memo of this.memos) {
            if (memo.images && memo.images.length > 0) {
                for (const img of memo.images) {
                    // ImgVault 格式无需压缩（已经只存 ID）
                    if (img.imageId) continue;
                    // 如果 fullImage 比 thumbnail 大很多，删除 fullImage
                    if (img.fullImage && img.thumbnail) {
                        const fullSize = img.fullImage.length;
                        const thumbSize = img.thumbnail.length;
                        if (fullSize > thumbSize * 2) {
                            img.fullImage = img.thumbnail; // 用缩略图替代
                            compressed++;
                        }
                    }
                }
            }
        }
        
        if (compressed > 0) {
            console.log(`已压缩 ${compressed} 张图片`);
        }
    }
    
    /**
     * 紧急清理：当存储空间严重不足时调用
     * 由于已添加 unlimitedStorage 权限，此方法仅作为最后手段
     * 优先提醒用户备份数据
     */
    async emergencyCleanup() {
        console.log('存储空间不足，提示用户备份...');
        
        // 优先提醒用户备份，而不是直接删除数据
        const shouldClean = confirm(
            '⚠️ 存储空间不足\n\n' +
            '建议您先导出备份数据，然后手动删除一些旧任务或图片。\n\n' +
            '点击"确定"打开备份面板\n' +
            '点击"取消"尝试自动清理旧图片'
        );
        
        if (shouldClean) {
            // 打开备份面板
            this.showBackupPanel();
            return;
        }
        
        // 用户选择自动清理
        const completedWithImages = this.memos
            .filter(m => m.completed && m.images && m.images.length > 0)
            .sort((a, b) => (a.completedAt || a.updatedAt || 0) - (b.completedAt || b.updatedAt || 0));
        
        let cleaned = 0;
        for (const memo of completedWithImages.slice(0, 5)) {
            memo.images = []; // 删除图片
            cleaned++;
        }
        
        if (cleaned > 0) {
            console.log(`紧急清理：已删除 ${cleaned} 个任务的图片`);
            this.showToast(`已自动清理 ${cleaned} 个旧任务的图片以释放空间`, 3000);
        } else {
            this.showToast('无法自动清理，请手动删除一些任务', 3000);
        }
    }

    // ==================== 每日任务功能 ====================

    /**
     * 获取今天的日期字符串 (YYYY-MM-DD)
     * @returns {string} 日期字符串
     */
    getTodayDate() {
        // 本地日期语义：避免 UTC 跨日导致“今天/昨天”判断错位
        return this.formatLocalDateYMD(new Date());
    }

    /**
     * 添加每日任务
     * @param {Object} task 任务对象
     * @returns {Object} 创建的任务
     */
    async addDailyTask(task) {
        const newTask = {
            id: this.generateId(),
            title: task.title || '',
            text: task.text || '',
            completed: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            categoryId: task.categoryId || null,
            tagIds: task.tagIds || [],
            priority: task.priority || 'none',
            dueDate: task.dueDate || this.getTodayDate(),
            dueTime: task.dueTime || null,  // 新增：具体时间
            isDaily: true  // 标记为每日任务
        };
        
        this.memos.push(newTask);
        await this.saveMemos();
        
        return newTask;
    }

    /**
     * 获取今日任务
     * @returns {Array} 今日任务列表
     */
    getTodayTasks() {
        const today = this.getTodayDate();
        return this.memos.filter(memo => 
            memo.dueDate === today && !memo.completed
        );
    }

    /**
     * 获取过期任务
     * @returns {Array} 过期任务列表
     */
    getOverdueTasks() {
        const today = this.getTodayDate();
        return this.memos.filter(memo => 
            memo.dueDate && 
            memo.dueDate < today && 
            !memo.completed
        );
    }

    /**
     * 获取本周任务
     * @returns {Array} 本周任务列表
     */
    getWeekTasks() {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);
        
        return this.memos.filter(memo => {
            if (!memo.dueDate) return false;
            const dueDate = new Date(memo.dueDate);
            return dueDate >= startOfWeek && dueDate < endOfWeek;
        });
    }

    /**
     * 推迟任务到明天
     * @param {string} taskId 任务ID
     * @returns {boolean} 是否成功
     */
    async postponeTask(taskId) {
        const task = this.memos.find(memo => memo.id === taskId);
        if (!task) return false;
        
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        task.dueDate = tomorrow.toISOString().split('T')[0];
        task.updatedAt = Date.now();
        task.overdueNotified = false;  // 重置过期通知标记
        
        await this.saveMemos();
        return true;
    }

    /**
     * 推迟任务到下周一
     * @param {string} taskId 任务ID
     * @returns {boolean} 是否成功
     */
    async postponeToNextWeek(taskId) {
        const task = this.memos.find(memo => memo.id === taskId);
        if (!task) return false;
        
        const today = new Date();
        const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
        const nextMonday = new Date(today);
        nextMonday.setDate(today.getDate() + daysUntilMonday);
        
        task.dueDate = nextMonday.toISOString().split('T')[0];
        task.updatedAt = Date.now();
        task.overdueNotified = false;
        
        await this.saveMemos();
        return true;
    }

    /**
     * 复制任务
     * @param {string} taskId 任务ID
     * @returns {Object|null} 复制的任务
     */
    async copyTask(taskId) {
        const task = this.memos.find(memo => memo.id === taskId);
        if (!task) return null;
        
        const newTask = {
            ...task,
            id: this.generateId(),
            title: task.title + ' (副本)',
            completed: false,
            completedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            overdueNotified: false
        };
        
        this.memos.push(newTask);
        await this.saveMemos();
        
        return newTask;
    }

    /**
     * 清理已完成的旧任务（超过30天）
     * @returns {number} 清理的任务数量
     */
    async cleanOldCompletedTasks() {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const originalCount = this.memos.length;
        
        this.memos = this.memos.filter(memo => 
            !memo.completed || 
            (memo.completedAt && memo.completedAt > thirtyDaysAgo)
        );
        
        const cleanedCount = originalCount - this.memos.length;
        
        if (cleanedCount > 0) {
            await this.saveMemos();
            console.log(`已清理 ${cleanedCount} 个旧任务`);
        }
        
        return cleanedCount;
    }

    /**
     * 获取任务统计
     * @returns {Object} 统计信息
     */
    getTaskStats() {
        const today = this.getTodayDate();
        
        return {
            total: this.memos.length,
            completed: this.memos.filter(m => m.completed).length,
            pending: this.memos.filter(m => !m.completed).length,
            todayTotal: this.memos.filter(m => m.dueDate === today).length,
            todayCompleted: this.memos.filter(m => m.dueDate === today && m.completed).length,
            todayPending: this.memos.filter(m => m.dueDate === today && !m.completed).length,
            overdue: this.getOverdueTasks().length,
            highPriority: this.memos.filter(m => m.priority === 'high' && !m.completed).length
        };
    }
    
    /**
     * 加载分类数据
     */
    async loadCategories() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(this.CATEGORIES_KEY, (result) => {
                this.categories = result[this.CATEGORIES_KEY] || [];
                resolve();
            });
        });
    }
    
    /**
     * 保存分类数据
     */
    saveCategories() {
        return new Promise((resolve) => {
            const data = {};
            data[this.CATEGORIES_KEY] = this.categories;
            chrome.storage.sync.set(data, resolve);
        });
    }
    
    /**
     * 加载标签数据
     */
    async loadTags() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(this.TAGS_KEY, (result) => {
                this.tags = result[this.TAGS_KEY] || [];
                resolve();
            });
        });
    }
    
    /**
     * 保存标签数据
     */
    saveTags() {
        return new Promise((resolve) => {
            const data = {};
            data[this.TAGS_KEY] = this.tags;
            chrome.storage.sync.set(data, resolve);
        });
    }
    
    /**
     * 添加分类
     * @param {Object} category 分类对象
     */
    addCategory(category) {
        // 生成唯一ID
        category.id = Date.now().toString();
        this.categories.push(category);
        this.saveCategories();
    }
    
    /**
     * 更新分类
     * @param {string} categoryId 分类ID
     * @param {Object} updatedCategory 更新后的分类对象
     */
    updateCategory(categoryId, updatedCategory) {
        const index = this.categories.findIndex(c => c.id === categoryId);
        if (index !== -1) {
            this.categories[index] = { ...this.categories[index], ...updatedCategory };
            this.saveCategories();
        }
    }
    
    /**
     * 删除分类
     * @param {string} categoryId 分类ID
     */
    deleteCategory(categoryId) {
        // 从分类列表中删除
        this.categories = this.categories.filter(c => c.id !== categoryId);
        this.saveCategories();
        
        // 更新使用此分类的任务
        this.memos.forEach(memo => {
            if (memo.categoryId === categoryId) {
                memo.categoryId = null;
            }
        });
        this.saveMemos();
    }
    
    /**
     * 添加标签
     * @param {Object} tag 标签对象
     */
    addTag(tag) {
        // 生成唯一ID
        tag.id = Date.now().toString();
        this.tags.push(tag);
        this.saveTags();
    }
    
    /**
     * 更新标签
     * @param {string} tagId 标签ID
     * @param {Object} updatedTag 更新后的标签对象
     */
    updateTag(tagId, updatedTag) {
        const index = this.tags.findIndex(t => t.id === tagId);
        if (index !== -1) {
            this.tags[index] = { ...this.tags[index], ...updatedTag };
            this.saveTags();
        }
    }
    
    /**
     * 删除标签
     * @param {string} tagId 标签ID
     */
    deleteTag(tagId) {
        // 从标签列表中删除
        this.tags = this.tags.filter(t => t.id !== tagId);
        this.saveTags();
        
        // 更新使用此标签的任务
        this.memos.forEach(memo => {
            if (memo.tagIds && memo.tagIds.includes(tagId)) {
                memo.tagIds = memo.tagIds.filter(id => id !== tagId);
            }
        });
        this.saveMemos();
    }
    
    /**
     * 获取分类名称
     * @param {string} categoryId 分类ID
     * @returns {string} 分类名称
     */
    getCategoryName(categoryId) {
        if (!categoryId) return window.i18nManager.getText('noCategory');
        const category = this.categories.find(c => c.id === categoryId);
        return category ? category.name : window.i18nManager.getText('noCategory');
    }
    
    /**
     * 获取分类颜色
     * @param {string} categoryId 分类ID
     * @returns {string} 分类颜色
     */
    getCategoryColor(categoryId) {
        if (!categoryId) return 'transparent';
        const category = this.categories.find(c => c.id === categoryId);
        return category ? category.color : 'transparent';
    }
    
    /**
     * 创建可搜索的分类 Combobox 组件
     * @param {HTMLElement} container 挂载容器
     * @param {Object} opts 配置 { value: string, placeholder: string, allowAll: boolean, onChange: function(string) }
     * @returns {{ getValue: function, setValue: function, setOptions: function, destroy: function }}
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
                    this.showCategoryManager();
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
    
    /**
     * 获取标签名称
     * @param {string} tagId 标签ID
     * @returns {string} 标签名称
     */
    getTagName(tagId) {
        const tag = this.tags.find(t => t.id === tagId);
        return tag ? tag.name : '';
    }
    
    /**
     * 获取标签颜色
     * @param {string} tagId 标签ID
     * @returns {string} 标签颜色
     */
    getTagColor(tagId) {
        const tag = this.tags.find(t => t.id === tagId);
        return tag ? tag.color : 'transparent';
    }

    /**
     * 切换备忘录完成状态
     * @param {string} id 备忘录ID
     * @returns {boolean} 操作是否成功
     */
    toggleMemoCompleted(id) {
        const memo = this.memos.find(memo => memo.id === id);
        if (!memo) return false;
        
        memo.completed = !memo.completed;
        memo.completedAt = memo.completed ? Date.now() : null;
        memo.updatedAt = Date.now();
        
        // 完成时如果有进度条，自动拉到 100%
        if (memo.completed && memo.progress !== null && memo.progress !== undefined) {
            memo.progress = 100;
        }
        
        // 找到对应的任务项元素
        const taskItem = document.querySelector(`.floating-task-item[data-id="${id}"]`);
        if (taskItem) {
            if (memo.completed) {
                // 添加完成动画
                taskItem.classList.add('task-complete-animation');
                taskItem.classList.add('completed');
                
                // 动画结束后更新UI
                setTimeout(() => {
                    taskItem.classList.remove('task-complete-animation');
                    this.renderFloatingTaskList(); // 重新渲染以应用过滤
                }, 500);
            } else {
                // 添加取消完成动画
                taskItem.classList.add('task-uncomplete-animation');
                taskItem.classList.remove('completed');
                
                // 动画结束后更新UI
                setTimeout(() => {
                    taskItem.classList.remove('task-uncomplete-animation');
                    this.renderFloatingTaskList(); // 重新渲染以应用过滤
                }, 500);
            }
        }
        
        this.saveMemos();
        this.refreshCalendarPanelIfOpen();
        return true;
    }

    /**
     * 编辑备忘录
     * @param {string} id 备忘录ID
     */
    editMemo(id) {
        const memo = this.memos.find(m => m.id === id);
        if (memo) {
            this.showMemoForm(memo);
        }
    }

    /**
     * 删除备忘录
     * @param {string} id 备忘录ID
     * @returns {boolean} 是否成功删除
     */
    async deleteMemo(id) {
        const index = this.memos.findIndex(m => m.id === id);
        if (index === -1) return false;
        
        this.memos.splice(index, 1);
        await this.saveMemos();
        
        // 重新渲染列表
        this.renderFloatingTaskList();
        
        return true;
    }

    /**
     * 隐藏备忘录表单
     */
    hideMemoForm() {
        const formContainer = document.getElementById('memo-form-container');
        if (formContainer) {
            formContainer.style.display = 'none';
            this.isFormVisible = false;
            delete formContainer.dataset.id;
        }
    }

    /**
     * 保存备忘录表单
     */
    async saveMemoForm() {
        try {
            const formContainer = document.getElementById('memo-form-container');
            const titleInput = document.getElementById('memo-title');
            const textInput = document.getElementById('memo-text');
            const categorySelect = document.getElementById('memo-category');
            const prioritySelect = document.getElementById('memo-priority');
            const dueDateInput = document.getElementById('memo-due-date');
            const dueTimeInput = document.getElementById('memo-due-time');
            
            if (!titleInput || !titleInput.value.trim()) {
                alert(window.i18nManager.getText('titleRequired') || '请输入任务标题');
                return;
            }
            
            // 获取选中的标签
            const selectedTags = [];
            const tagCheckboxes = document.querySelectorAll('#memo-tags-list .tag-checkbox:checked');
            tagCheckboxes.forEach(checkbox => {
                selectedTags.push(checkbox.value);
            });
            
            const memoData = {
                title: titleInput.value.trim(),
                text: textInput ? textInput.value.trim() : '',
                categoryId: categorySelect ? categorySelect.value : null,
                priority: prioritySelect ? prioritySelect.value : 'none',
                dueDate: dueDateInput ? dueDateInput.value : null,
                dueTime: dueTimeInput ? dueTimeInput.value : null,
                tagIds: selectedTags
            };
            
            const editId = formContainer ? formContainer.dataset.id : null;
            
            if (editId) {
                // 编辑现有备忘录
                const memo = this.memos.find(m => m.id === editId);
                if (memo) {
                    Object.assign(memo, memoData);
                    memo.updatedAt = Date.now();
                }
            } else {
                // 创建新备忘录
                const newMemo = {
                    id: this.generateId(),
                    ...memoData,
                    completed: false,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };
                this.memos.push(newMemo);
            }
            
            await this.saveMemos();
            this.hideMemoForm();
            this.renderFloatingTaskList();
            
            console.log('备忘录保存成功');
        } catch (error) {
            console.error('保存备忘录时发生错误:', error);
            alert(window.i18nManager.getText('saveFailed') || '保存失败');
        }
    }

    /**
     * 生成唯一ID
     * @returns {string} 唯一ID
     */
    generateId() {
        return 'memo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 筛选任务
     */
    filterTasks() {
        try {
            const searchInput = document.querySelector('.search-input');
            const statusFilter = document.querySelector('.status-filter');
            
            const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const statusValue = statusFilter ? statusFilter.value : 'all';
            
            let filteredMemos = [...this.memos];
            
            // 文本搜索
            if (searchText) {
                filteredMemos = filteredMemos.filter(memo => 
                    (memo.title || '').toLowerCase().includes(searchText) ||
                    (memo.text || '').toLowerCase().includes(searchText)
                );
            }
            
            // 状态筛选
            switch (statusValue) {
                case 'completed':
                    filteredMemos = filteredMemos.filter(memo => memo.completed);
                    break;
                case 'uncompleted':
                    filteredMemos = filteredMemos.filter(memo => !memo.completed);
                    break;
                case 'today':
                    const today = this.getTodayDate();
                    filteredMemos = filteredMemos.filter(memo => memo.dueDate === today);
                    break;
                case 'overdue':
                    filteredMemos = this.getOverdueTasks();
                    break;
                case 'week':
                    filteredMemos = this.getWeekTasks();
                    break;
                // 'all' 不需要额外过滤
            }
            
            // 重新渲染
            this.renderFloatingTaskList(filteredMemos);
        } catch (error) {
            console.error('筛选任务时发生错误:', error);
        }
    }

    /**
     * 显示备忘录表单
     * @param {Object} memo 要编辑的备忘录，如果是新建则为null
     */
    showMemoForm(memo = null) {
        try {
            console.log('显示备忘录表单', memo ? '编辑模式' : '新建模式');
            
            const formContainer = document.getElementById('memo-form-container');
            if (!formContainer) {
                console.error('未找到表单容器元素');
                return;
            }
            
            const titleInput = document.getElementById('memo-title');
            const textInput = document.getElementById('memo-text');
            const categorySelect = document.getElementById('memo-category');
            const prioritySelect = document.getElementById('memo-priority');
            const dueDateInput = document.getElementById('memo-due-date');
            
            if (!titleInput || !textInput || !categorySelect) {
                console.error('表单必要元素缺失', {
                    titleInput: !!titleInput,
                    textInput: !!textInput,
                    categorySelect: !!categorySelect
                });
                return;
            }
            
            // 标记表单为可见
            this.isFormVisible = true;
            
            // 清空表单
            titleInput.value = '';
            textInput.value = '';
            categorySelect.innerHTML = '';
            if (dueDateInput) dueDateInput.value = '';
            
            // 填充分类选项
            const noCategoryOption = document.createElement('option');
            noCategoryOption.value = '';
            noCategoryOption.textContent = window.i18nManager.getText('noCategory');
            categorySelect.appendChild(noCategoryOption);
            
            this.categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.id;
                option.textContent = category.name;
                option.style.color = category.color;
                categorySelect.appendChild(option);
            });
            
            // 添加管理分类和标签按钮
            let manageCategoriesBtn = document.getElementById('manage-categories-tags-btn');
            if (!manageCategoriesBtn) {
                console.log('创建分类和标签管理按钮');
                manageCategoriesBtn = document.createElement('button');
                manageCategoriesBtn.id = 'manage-categories-tags-btn';
                manageCategoriesBtn.className = 'manage-categories-tags-btn';
                manageCategoriesBtn.textContent = window.i18nManager.getText('manageCategoriesAndTags');
                manageCategoriesBtn.addEventListener('click', () => {
                    this.showCategoryTagManager();
                });
                
                // 添加到表单
                const categoryGroup = categorySelect.parentElement;
                if (categoryGroup) {
                    categoryGroup.appendChild(manageCategoriesBtn);
                } else {
                    console.warn('未找到分类选择器的父元素');
                }
            }
            
            // 创建或更新标签选择容器
            let tagsContainer = document.getElementById('memo-tags-container');
            if (!tagsContainer) {
                console.log('创建标签选择容器');
                tagsContainer = document.createElement('div');
                tagsContainer.id = 'memo-tags-container';
                tagsContainer.className = 'tags-select-container';
                
                const tagsLabel = document.createElement('label');
                tagsLabel.textContent = window.i18nManager.getText('selectTags');
                tagsContainer.appendChild(tagsLabel);
                
                const tagsList = document.createElement('div');
                tagsList.id = 'memo-tags-list';
                tagsList.className = 'tags-select-list';
                tagsContainer.appendChild(tagsList);
                
                // 添加到表单，放在优先级选择之后
                if (prioritySelect) {
                    const priorityGroup = prioritySelect.parentElement;
                    if (priorityGroup && priorityGroup.parentElement) {
                        priorityGroup.parentElement.insertBefore(tagsContainer, priorityGroup.nextSibling);
                    } else {
                        console.warn('未找到优先级选择器的父元素');
                        formContainer.appendChild(tagsContainer);
                    }
                } else {
                    const categoryGroup = categorySelect.parentElement;
                    if (categoryGroup && categoryGroup.parentElement) {
                        categoryGroup.parentElement.insertBefore(tagsContainer, categoryGroup.nextSibling);
                    } else {
                        console.warn('未找到分类选择器的父元素');
                        formContainer.appendChild(tagsContainer);
                    }
                }
            }
            
            // 填充标签选择
            const tagsList = document.getElementById('memo-tags-list');
            if (tagsList) {
                tagsList.innerHTML = '';
                
                this.tags.forEach(tag => {
                    const tagId = `tag-${tag.id}`;
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = tagId;
                    checkbox.className = 'tag-checkbox';
                    checkbox.value = tag.id;
                    
                    const label = document.createElement('label');
                    label.htmlFor = tagId;
                    label.textContent = tag.name;
                    label.style.backgroundColor = tag.color;
                    
                    tagsList.appendChild(checkbox);
                    tagsList.appendChild(label);
                });
            } else {
                console.warn('未找到标签列表元素');
            }
            
            // 填充优先级选项
            if (prioritySelect) {
                prioritySelect.innerHTML = '';
                
                const noPriorityOption = document.createElement('option');
                noPriorityOption.value = 'none';
                noPriorityOption.textContent = window.i18nManager.getText('noPriority');
                prioritySelect.appendChild(noPriorityOption);
                
                this.priorities.forEach(priority => {
                    const option = document.createElement('option');
                    option.value = priority.id;
                    option.textContent = priority.name;
                    option.style.color = priority.color;
                    prioritySelect.appendChild(option);
                });
            }
            
            // 如果是编辑模式，填充表单
            if (memo) {
                console.log('填充编辑模式表单数据', memo);
                titleInput.value = memo.title || '';
                textInput.value = memo.text || '';
                categorySelect.value = memo.categoryId || '';
                
                if (prioritySelect && memo.priority) {
                    prioritySelect.value = memo.priority;
                } else if (prioritySelect) {
                    prioritySelect.value = 'none';
                }
                
                if (dueDateInput && memo.dueDate) {
                    dueDateInput.value = memo.dueDate;
                }
                
                // 设置选中的标签
                if (memo.tagIds && memo.tagIds.length > 0) {
                    console.log('设置选中的标签', memo.tagIds);
                    memo.tagIds.forEach(tagId => {
                        const checkbox = document.querySelector(`#tag-${tagId}`);
                        if (checkbox) {
                            checkbox.checked = true;
                        } else {
                            console.warn('未找到标签复选框:', tagId);
                        }
                    });
                }
                
                // 设置表单ID，用于保存时识别
                formContainer.dataset.id = memo.id;
            } else {
                // 新建模式，清除表单ID
                delete formContainer.dataset.id;
            }
            
            // 显示表单
            formContainer.style.display = 'block';
            
            // 聚焦到标题输入框
            titleInput.focus();
            
            console.log('备忘录表单显示完成');
        } catch (error) {
            console.error('显示备忘录表单时发生错误:', error);
            alert(window.i18nManager.getText('errorOccurred'));
        }
    }

    /**
     * 渲染悬浮任务列表
     */
    renderFloatingTaskList(memos = this.memos) {
        try {
            console.log('渲染碎片式备忘录列表...');
            
            // 清除现有的备忘录卡片
            const existingMemos = document.querySelectorAll('.memo-item');
            existingMemos.forEach(memo => memo.remove());
            
            // 获取排序和过滤后的备忘录
            const sortedMemos = this.getSortedAndFilteredMemos(memos);
            console.log(`渲染 ${sortedMemos.length} 个备忘录卡片`);
            
            // 创建碎片式备忘录卡片
            sortedMemos.forEach((memo, index) => {
                // 创建备忘录卡片
                const memoCard = document.createElement('div');
                
                // 随机旋转角度 (-5度到5度)
                const rotation = Math.random() * 10 - 5;
                memoCard.style.setProperty('--rotation', `${rotation}deg`);
                
                // 随机颜色类 (1-7)
                const colorClass = `memo-color-${Math.floor(Math.random() * 7) + 1}`;
                
                // 设置类名和ID
                memoCard.className = `memo-item ${colorClass} ${memo.completed ? 'completed' : ''}`;
                memoCard.dataset.id = memo.id;
                
                // 设置初始位置 (分散在页面上)
                // 获取视口宽高
                const viewportWidth = window.innerWidth - 250; // 减去卡片宽度
                const viewportHeight = window.innerHeight - 200; // 减去卡片高度
                
                // 计算位置，确保不会超出视口
                const left = 20 + (index * 50) % (viewportWidth - 100);
                const top = 20 + (index * 70) % (viewportHeight - 100);
                
                memoCard.style.left = `${left}px`;
                memoCard.style.top = `${top}px`;
                
                // 创建卡片头部
                const cardHeader = document.createElement('div');
                cardHeader.className = 'memo-item-header';
                
                // 创建标题
                const title = document.createElement('h3');
                title.className = 'memo-item-title';
                title.textContent = memo.title || '无标题备忘录';
                cardHeader.appendChild(title);
                
                // 创建操作按钮容器
                const actions = document.createElement('div');
                actions.className = 'memo-item-actions';
                
                // 完成按钮
                const completeBtn = document.createElement('button');
                completeBtn.className = 'memo-action-btn complete-btn';
                completeBtn.innerHTML = memo.completed ? 
                    '<i class="fas fa-check-circle"></i>' : 
                    '<i class="far fa-circle"></i>';
                completeBtn.title = memo.completed ? '标记为未完成' : '标记为已完成';
                completeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleMemoCompleted(memo.id);
                });
                
                // 编辑按钮
                const editBtn = document.createElement('button');
                editBtn.className = 'memo-action-btn edit-btn';
                editBtn.innerHTML = '<i class="fas fa-edit"></i>';
                editBtn.title = '编辑';
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.editMemo(memo.id);
                });
                
                // 删除按钮
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'memo-action-btn delete-btn';
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.title = '删除';
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除这个备忘录吗？')) {
                        this.deleteMemo(memo.id);
                    }
                });
                
                // 添加按钮到操作容器
                actions.appendChild(completeBtn);
                actions.appendChild(editBtn);
                actions.appendChild(deleteBtn);
                cardHeader.appendChild(actions);
                
                // 创建内容区域
                const content = document.createElement('div');
                content.className = 'memo-item-content';
                content.textContent = memo.text || '';
                
                // 创建页脚
                const footer = document.createElement('div');
                footer.className = 'memo-item-footer';
                
                // 添加分类
                if (memo.categoryId) {
                    const category = this.categories.find(c => c.id === memo.categoryId);
                    if (category) {
                        const categorySpan = document.createElement('span');
                        categorySpan.className = 'memo-item-category';
                        categorySpan.textContent = category.name;
                        categorySpan.style.backgroundColor = category.color;
                        footer.appendChild(categorySpan);
                    }
                }
                
                // 添加创建日期
                const dateSpan = document.createElement('span');
                dateSpan.className = 'memo-item-date';
                dateSpan.textContent = new Date(memo.createdAt).toLocaleDateString();
                footer.appendChild(dateSpan);
                
                // 添加标签
                if (memo.tagIds && memo.tagIds.length > 0) {
                    const tagsContainer = document.createElement('div');
                    tagsContainer.className = 'memo-item-tags';
                    
                    memo.tagIds.forEach(tagId => {
                        const tag = this.tags.find(t => t.id === tagId);
                        if (tag) {
                            const tagSpan = document.createElement('span');
                            tagSpan.className = 'memo-item-tag';
                            tagSpan.textContent = tag.name;
                            tagSpan.style.backgroundColor = tag.color;
                            tagsContainer.appendChild(tagSpan);
                        }
                    });
                    
                    if (tagsContainer.children.length > 0) {
                        footer.appendChild(tagsContainer);
                    }
                }
                
                // 组装卡片
                memoCard.appendChild(cardHeader);
                memoCard.appendChild(content);
                memoCard.appendChild(footer);
                
                // 添加拖拽功能
                this.makeElementDraggable(memoCard);
                
                // 添加到文档
                document.body.appendChild(memoCard);
            });
            
            // 添加搜索按钮
            this.createSearchButton();
            
            // 添加新增按钮
            this.createAddButton();
            
            console.log('碎片式备忘录渲染完成');
        } catch (error) {
            console.error('渲染碎片式备忘录时发生错误:', error);
        }
    }
    
    /**
     * 使元素可拖动
     * @param {HTMLElement} element 要使可拖动的元素
     */
    makeElementDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        // 鼠标按下时的处理函数
        const dragMouseDown = (e) => {
            e.preventDefault();
            
            // 如果点击的是按钮或输入框，不进行拖动
            if (e.target.tagName === 'BUTTON' || 
                e.target.tagName === 'INPUT' || 
                e.target.tagName === 'I' ||
                e.target.closest('.memo-item-actions')) {
                return;
            }
            
            // 获取鼠标位置
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // 将当前卡片置于顶层
            const allMemos = document.querySelectorAll('.memo-item');
            allMemos.forEach(memo => {
                memo.style.zIndex = '1000';
            });
            element.style.zIndex = '1010';
            
            // 添加鼠标移动和松开事件
            document.addEventListener('mousemove', elementDrag);
            document.addEventListener('mouseup', closeDragElement);
        };
        
        // 元素拖动时的处理函数
        const elementDrag = (e) => {
            e.preventDefault();
            
            // 计算新位置
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // 设置元素的新位置
            const newTop = (element.offsetTop - pos2);
            const newLeft = (element.offsetLeft - pos1);
            
            // 确保不会拖出视口
            const maxTop = window.innerHeight - element.offsetHeight;
            const maxLeft = window.innerWidth - element.offsetWidth;
            
            element.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
            element.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
        };
        
        // 拖动结束时的处理函数
        const closeDragElement = () => {
            // 移除事件监听
            document.removeEventListener('mousemove', elementDrag);
            document.removeEventListener('mouseup', closeDragElement);
            
            // 保存位置到本地存储
            this.saveMemoPosition(element.dataset.id, {
                left: element.style.left,
                top: element.style.top
            });
        };
        
        // 为元素添加鼠标按下事件
        element.addEventListener('mousedown', dragMouseDown);
    }
    
    /**
     * 保存备忘录位置
     * @param {string} id 备忘录ID
     * @param {Object} position 位置对象 {left, top}
     */
    saveMemoPosition(id, position) {
        try {
            // 获取现有的位置数据
            chrome.storage.local.get('memoPositions', (result) => {
                const positions = result.memoPositions || {};
                
                // 更新位置
                positions[id] = position;
                
                // 保存回存储
                chrome.storage.local.set({ memoPositions: positions }, () => {
                    console.log(`备忘录 ${id} 位置已保存:`, position);
                });
            });
        } catch (error) {
            console.error('保存备忘录位置时发生错误:', error);
        }
    }
    
    /**
     * 创建搜索按钮
     */
    createSearchButton() {
        // 移除现有的搜索按钮
        const existingButton = document.querySelector('.memo-search-button');
        if (existingButton) existingButton.remove();
        
        // 移除现有的搜索容器
        const existingContainer = document.querySelector('.memo-search-container');
        if (existingContainer) existingContainer.remove();
        
        // 创建搜索按钮
        const searchButton = document.createElement('div');
        searchButton.className = 'memo-search-button';
        searchButton.innerHTML = '<i class="fas fa-search"></i>';
        searchButton.title = '搜索备忘录';
        
        // 创建搜索容器
        const searchContainer = document.createElement('div');
        searchContainer.className = 'memo-search-container';
        
        // 创建搜索输入框
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'memo-search-input';
        searchInput.placeholder = '搜索备忘录...';
        
        // 添加搜索事件
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            this.filterMemosByQuery(query);
        });
        
        // 组装搜索容器
        searchContainer.appendChild(searchInput);
        
        // 添加点击事件
        searchButton.addEventListener('click', () => {
            searchContainer.classList.toggle('visible');
            if (searchContainer.classList.contains('visible')) {
                searchInput.focus();
            }
        });
        
        // 添加到文档
        document.body.appendChild(searchButton);
        document.body.appendChild(searchContainer);
    }
    
    /**
     * 创建添加按钮
     */
    createAddButton() {
        // 移除现有的添加按钮
        const existingButton = document.querySelector('.memo-add-button');
        if (existingButton) existingButton.remove();
        
        // 创建添加按钮
        const addButton = document.createElement('div');
        addButton.className = 'memo-add-button';
        addButton.innerHTML = '<i class="fas fa-plus"></i>';
        addButton.title = '添加新备忘录';
        
        // 添加点击事件
        addButton.addEventListener('click', () => {
            this.showMemoForm();
        });
        
        // 添加到文档
        document.body.appendChild(addButton);
    }
    
    /**
     * 根据查询过滤备忘录
     * @param {string} query 查询字符串
     */
    filterMemosByQuery(query) {
        try {
            if (!query) {
                // 如果查询为空，显示所有备忘录
                const allMemos = document.querySelectorAll('.memo-item');
                allMemos.forEach(memo => {
                    memo.style.display = 'block';
                });
                return;
            }
            
            // 获取所有备忘录卡片
            const allMemos = document.querySelectorAll('.memo-item');
            
            // 遍历每个卡片，检查是否匹配查询
            allMemos.forEach(memo => {
                const memoId = memo.dataset.id;
                const memoData = this.memos.find(m => m.id === memoId);
                
                if (memoData) {
                    // 检查标题和内容是否包含查询字符串
                    const title = (memoData.title || '').toLowerCase();
                    const text = (memoData.text || '').toLowerCase();
                    
                    if (title.includes(query) || text.includes(query)) {
                        memo.style.display = 'block';
                    } else {
                        memo.style.display = 'none';
                    }
                }
            });
        } catch (error) {
            console.error('过滤备忘录时发生错误:', error);
        }
    }
    
    /**
     * 获取截止日期状态
     * @param {string} dueDateStr 截止日期字符串 (YYYY-MM-DD)
     * @returns {Object} 截止日期状态对象
     */
    getDueDateStatus(dueDateStr) {
        if (!dueDateStr) {
            return { status: 'none', daysLeft: null };
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const dueDate = new Date(dueDateStr);
        dueDate.setHours(0, 0, 0, 0);
        
        // 计算剩余天数
        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let status = 'upcoming';
        let statusText = '';
        
        if (diffDays < 0) {
            status = 'overdue';
            statusText = `${window.i18nManager.getText('overdue')} (${Math.abs(diffDays)}${window.i18nManager.getText('daysLeft')})`;
        } else if (diffDays === 0) {
            status = 'today';
            statusText = window.i18nManager.getText('dueToday');
        } else if (diffDays === 1) {
            status = 'tomorrow';
            statusText = window.i18nManager.getText('dueTomorrow');
        } else {
            statusText = `${diffDays} ${window.i18nManager.getText('daysLeft')}`;
        }
        
        return { status, daysLeft: diffDays, statusText };
    }

    /**
     * 获取排序和过滤后的备忘录列表
     * @returns {Array} 排序和过滤后的备忘录列表
     */
    getSortedAndFilteredMemos(memos = this.memos) {
        // 获取当前的排序方式
        const sortOption = this.sortOptions.find(option => option.id === this.currentSortOption);
        
        // 如果找不到排序方式，则使用默认排序（最新的在前面）
        const sortFn = sortOption ? sortOption.sortFn : (a, b) => b.createdAt - a.createdAt;
        
        // 复制一份备忘录数据进行排序
        return [...memos].sort(sortFn);
    }

    /**
     * 切换备忘录面板显示状态
     * 在双栏布局中，切换侧边栏的展开/折叠
     */
    async toggle() {
        try {
            console.log('切换备忘录显示状态...');
            
            // 检查是否已经初始化
            if (!this.initialized) {
                console.log('备忘录管理器尚未初始化，正在初始化...');
                try {
                    await this.init();
                } catch (error) {
                    console.error('备忘录初始化失败:', error);
                }
            }

            // 优先检查双栏布局的侧边栏
            const sidebar = document.getElementById('task-sidebar');
            if (sidebar) {
                this.toggleSidebar();
                console.log('切换侧边栏状态完成');
                return;
            }

            // 兜底：切换悬浮面板（旧版模式）
            let panel = document.querySelector('.floating-panel');
            if (!panel) {
                panel = this.createMemoUI();
            }

            if (panel) {
                const isHidden = panel.classList.contains('hidden');
                if (isHidden) {
                    console.log('显示悬浮面板...');
                    panel.classList.remove('hidden');
                    const searchInput = panel.querySelector('.search-input');
                    if (searchInput) {
                        setTimeout(() => searchInput.focus(), 50);
                    }
                } else {
                    console.log('隐藏悬浮面板...');
                    panel.classList.add('hidden');
                }
            }
            
            console.log('备忘录显示状态切换完成');
        } catch (error) {
            console.error('切换备忘录显示状态时发生错误:', error);
        }
    }
    
    /**
     * 切换面板最小化状态
     * @param {HTMLElement} panel - 面板元素
     */
    toggleMinimize(panel) {
        try {
            console.log('切换面板最小化状态...');
            
            // 如果没有传入面板参数，则尝试获取当前面板
            if (!panel) {
                console.log('未传入面板参数，尝试获取当前面板');
                panel = document.querySelector('.floating-panel');
                if (!panel) {
                    console.error('无法找到面板元素');
                    return;
                }
            }
            
            const content = panel.querySelector('.panel-content');
            if (!content) {
                console.error('无法找到面板内容元素');
                return;
            }
            
            // 更新配置
            this.panelConfig.minimized = !this.panelConfig.minimized;
            console.log('更新面板最小化状态为:', this.panelConfig.minimized);
            
            // 更新UI
            if (this.panelConfig.minimized) {
                console.log('最小化面板');
                content.style.display = 'none';
                panel.classList.add('minimized');
                
                // 更新最小化按钮文本
                const minimizeBtn = panel.querySelector('.minimize-btn');
                if (minimizeBtn) {
                    minimizeBtn.innerHTML = '+';
                    minimizeBtn.title = '恢复';
                }
            } else {
                console.log('恢复面板');
                content.style.display = 'block';
                panel.classList.remove('minimized');
                
                // 更新最小化按钮文本
                const minimizeBtn = panel.querySelector('.minimize-btn');
                if (minimizeBtn) {
                    minimizeBtn.innerHTML = '−';
                    minimizeBtn.title = '最小化';
                }
            }
            
            // 保存配置
            this.savePanelConfig();
            
            console.log('面板最小化状态切换完成');
        } catch (error) {
            console.error('切换面板最小化状态时发生错误:', error);
        }
    }

    /**
     * 初始化面板大小和位置
     * @param {HTMLElement} panel - 面板元素
     */
    initPanelSizeAndPosition(panel) {
        try {
            console.log('初始化面板大小和位置...');
            
            if (!panel) return;
            
            // 设置面板在最上层显示
            panel.style.zIndex = '9999';
            
            // 强制设置左上角位置
            panel.style.left = '20px';
            panel.style.top = '20px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
            
            // 设置默认大小
            panel.style.width = '300px';
            panel.style.height = '400px';
            
            // 更新配置
            this.panelConfig.position = { left: 20, top: 20 };
            this.panelConfig.size = { width: 300, height: 400 };
            
            // 保存配置
            this.savePanelConfig();
            
            console.log('面板位置已重置到左上角');
        } catch (error) {
            console.error('初始化面板大小和位置时发生错误:', error);
        }
    }

    /**
     * 创建备忘录UI
     */
    createMemoUI() {
        try {
            console.log('开始创建备忘录UI...');
            
            // 检查是否已存在面板，如果存在则先移除
            const existingPanel = document.querySelector('.floating-panel');
            if (existingPanel) {
                console.log('发现已存在的备忘录面板，正在移除...');
                existingPanel.remove();
            }
            
            // 创建悬浮面板
            const floatingPanel = document.createElement('div');
            floatingPanel.id = 'floating-task-panel';
            floatingPanel.className = 'floating-panel hidden'; // 添加hidden类，初始时隐藏面板
            
            // 设置面板在最上层显示
            floatingPanel.style.zIndex = '9999';
            
            // 设置初始位置在左上角
            floatingPanel.style.left = '20px';
            floatingPanel.style.top = '20px';
            floatingPanel.style.right = 'auto';
            floatingPanel.style.bottom = 'auto';
            
            // 设置初始大小
            floatingPanel.style.width = '300px';
            floatingPanel.style.height = '400px';
            
            // 创建面板头部
            const panelHeader = document.createElement('div');
            panelHeader.className = 'memo-panel-header';
            
            // 创建标题
            const panelTitle = document.createElement('div');
            panelTitle.className = 'panel-title';
            panelTitle.textContent = window.i18nManager.getText('memoTitle');
            
            // 创建控制按钮容器
            const panelControls = document.createElement('div');
            panelControls.className = 'panel-controls';
            
            // 添加面板头部到面板
            panelHeader.appendChild(panelTitle);
            panelHeader.appendChild(panelControls);
            floatingPanel.appendChild(panelHeader);
            
            // 创建面板内容
            const panelContent = document.createElement('div');
            panelContent.className = 'panel-content';
            floatingPanel.appendChild(panelContent);
            
            // 将面板添加到文档
            document.body.appendChild(floatingPanel);
            
            console.log('备忘录UI基本结构创建完成');
            
            // 创建备忘录内容
            this.createMemoContent(panelContent);
            
            // 创建控制按钮
            this.createPanelControls(panelControls);
            
            // 初始化拖拽功能
            this.initDragAndDrop(panelHeader);
            
            // 初始化调整大小功能
            this.initResize(floatingPanel);
            
            // 初始化面板大小和位置
            this.initPanelSizeAndPosition(floatingPanel);
            
            console.log('备忘录UI创建完成');
            return floatingPanel;
        } catch (error) {
            console.error('创建备忘录UI时发生错误:', error);
            return null;
        }
    }

    /**
     * 创建备忘录内容
     * @param {HTMLElement} container - 内容容器元素
     */
    createMemoContent(container) {
        try {
            console.log('开始创建备忘录内容...');
            
            // 创建工具栏（搜索 + 新增按钮）
            const toolbar = document.createElement('div');
            toolbar.className = 'memo-toolbar';
            
            // 创建搜索输入框
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'search-input';
            searchInput.id = 'panel-search-input';
            searchInput.placeholder = window.i18nManager?.getText('searchTasks') || '搜索任务...';
            searchInput.addEventListener('input', () => this.renderPanelTaskList());
            
            // 创建新增任务按钮
            const addBtn = document.createElement('button');
            addBtn.className = 'add-task-btn';
            addBtn.innerHTML = '<i class="fas fa-plus"></i> 新增';
            addBtn.title = '新增任务 (Ctrl+N)';
            addBtn.addEventListener('click', () => this.showTaskFormModal());
            
            toolbar.appendChild(searchInput);
            toolbar.appendChild(addBtn);
            
            // 创建状态筛选下拉菜单
            const filterContainer = document.createElement('div');
            filterContainer.className = 'filter-container';
            
            const statusFilter = document.createElement('select');
            statusFilter.className = 'status-filter';
            statusFilter.id = 'panel-status-filter';
            statusFilter.addEventListener('change', () => this.renderPanelTaskList());
            
            // 添加状态选项
            const options = [
                { value: 'all', text: '所有任务' },
                { value: 'uncompleted', text: '未完成' },
                { value: 'completed', text: '已完成' },
                { value: 'today', text: '今日任务' },
                { value: 'overdue', text: '已过期' }
            ];
            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = window.i18nManager?.getText(opt.value + 'Tasks') || opt.text;
                statusFilter.appendChild(option);
            });
            
            filterContainer.appendChild(statusFilter);
            
            // 创建任务列表容器
            const taskListContainer = document.createElement('div');
            taskListContainer.className = 'panel-task-list';
            taskListContainer.id = 'panel-task-list';
            
            // 组装内容
            container.appendChild(toolbar);
            container.appendChild(filterContainer);
            container.appendChild(taskListContainer);
            
            // 创建任务表单弹窗（隐藏状态）
            this.createTaskFormModal(container);
            
            // 渲染任务列表
            this.renderPanelTaskList();
            
            console.log('备忘录内容创建完成');
        } catch (error) {
            console.error('创建备忘录内容时发生错误:', error);
        }
    }
    
    /**
     * 创建任务表单弹窗
     * @param {HTMLElement} container - 容器元素
     */
    createTaskFormModal(container) {
        const modal = document.createElement('div');
        modal.className = 'task-form-modal hidden';
        modal.id = 'task-form-modal';
        
        modal.innerHTML = `
            <div class="task-form-content">
                <div class="task-form-header">
                    <h3 id="task-form-title">新增任务</h3>
                    <button class="task-form-close" id="task-form-close">&times;</button>
                </div>
                <div class="task-form-body">
                    <div class="form-group">
                        <label for="task-title-input">标题 *</label>
                        <input type="text" id="task-title-input" placeholder="输入任务标题..." required>
                    </div>
                    <div class="form-group">
                        <label for="task-text-input">详情</label>
                        <textarea id="task-text-input" placeholder="输入任务详情..." rows="3"></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="task-priority-select">优先级</label>
                            <select id="task-priority-select">
                                <option value="none">无</option>
                                <option value="low">低</option>
                                <option value="medium">中</option>
                                <option value="high">高</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="task-due-date-input">截止日期</label>
                            <input type="date" id="task-due-date-input">
                        </div>
                    </div>
                </div>
                <div class="task-form-footer">
                    <button class="btn-cancel" id="task-form-cancel">取消</button>
                    <button class="btn-save" id="task-form-save">保存</button>
                </div>
            </div>
        `;
        
        container.appendChild(modal);
        
        // 绑定事件
        document.getElementById('task-form-close').addEventListener('click', () => this.hideTaskFormModal());
        document.getElementById('task-form-cancel').addEventListener('click', () => this.hideTaskFormModal());
        document.getElementById('task-form-save').addEventListener('click', () => this.saveTaskFromModal());
        
        // 点击遮罩关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hideTaskFormModal();
        });
        
        // 回车保存
        document.getElementById('task-title-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.saveTaskFromModal();
            }
        });
    }
    
    /**
     * 显示任务表单弹窗
     * @param {Object} task - 要编辑的任务，null 表示新增
     */
    showTaskFormModal(task = null) {
        const modal = document.getElementById('task-form-modal');
        if (!modal) return;
        
        const titleEl = document.getElementById('task-form-title');
        const titleInput = document.getElementById('task-title-input');
        const textInput = document.getElementById('task-text-input');
        const prioritySelect = document.getElementById('task-priority-select');
        const dueDateInput = document.getElementById('task-due-date-input');
        
        if (task) {
            // 编辑模式
            titleEl.textContent = '编辑任务';
            modal.dataset.taskId = task.id;
            titleInput.value = task.title || '';
            textInput.value = task.text || '';
            prioritySelect.value = task.priority || 'none';
            dueDateInput.value = task.dueDate || '';
        } else {
            // 新增模式
            titleEl.textContent = '新增任务';
            delete modal.dataset.taskId;
            titleInput.value = '';
            textInput.value = '';
            prioritySelect.value = 'none';
            dueDateInput.value = this.getTodayDate();
        }
        
        modal.classList.remove('hidden');
        titleInput.focus();
    }
    
    /**
     * 隐藏任务表单弹窗
     */
    hideTaskFormModal() {
        const modal = document.getElementById('task-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            delete modal.dataset.taskId;
        }
    }
    
    /**
     * 从弹窗保存任务
     */
    async saveTaskFromModal() {
        const modal = document.getElementById('task-form-modal');
        const titleInput = document.getElementById('task-title-input');
        const textInput = document.getElementById('task-text-input');
        const prioritySelect = document.getElementById('task-priority-select');
        const dueDateInput = document.getElementById('task-due-date-input');
        
        const title = titleInput.value.trim();
        if (!title) {
            titleInput.focus();
            titleInput.classList.add('input-error');
            setTimeout(() => titleInput.classList.remove('input-error'), 1000);
            return;
        }
        
        const taskData = {
            title: title,
            text: textInput.value.trim(),
            priority: prioritySelect.value,
            dueDate: dueDateInput.value || null
        };
        
        const taskId = modal.dataset.taskId;
        
        if (taskId) {
            // 编辑现有任务
            const task = this.memos.find(m => m.id === taskId);
            if (task) {
                Object.assign(task, taskData);
                task.updatedAt = Date.now();
            }
        } else {
            // 新增任务
            const newTask = {
                id: this.generateId(),
                ...taskData,
                completed: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                categoryId: null,
                tagIds: []
            };
            this.memos.unshift(newTask);
        }
        
        await this.saveMemos();
        this.hideTaskFormModal();
        this.renderPanelTaskList();
        
        console.log(taskId ? '任务已更新' : '任务已新增');
    }
    
    /**
     * 渲染面板内任务列表
     */
    renderPanelTaskList() {
        const container = document.getElementById('panel-task-list');
        if (!container) return;
        
        const searchInput = document.getElementById('panel-search-input');
        const statusFilter = document.getElementById('panel-status-filter');
        
        const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const statusValue = statusFilter ? statusFilter.value : 'all';
        
        // 筛选任务
        let filteredMemos = [...this.memos];
        
        // 文本搜索
        if (searchText) {
            filteredMemos = filteredMemos.filter(memo => 
                (memo.title || '').toLowerCase().includes(searchText) ||
                (memo.text || '').toLowerCase().includes(searchText)
            );
        }
        
        // 状态筛选
        const today = this.getTodayDate();
        switch (statusValue) {
            case 'completed':
                filteredMemos = filteredMemos.filter(m => m.completed);
                break;
            case 'uncompleted':
                filteredMemos = filteredMemos.filter(m => !m.completed);
                break;
            case 'today':
                filteredMemos = filteredMemos.filter(m => m.dueDate === today);
                break;
            case 'overdue':
                filteredMemos = filteredMemos.filter(m => m.dueDate && m.dueDate < today && !m.completed);
                break;
        }
        
        // 排序：未完成在前，按优先级、截止日期排序
        const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
        filteredMemos.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            const pa = priorityOrder[a.priority] ?? 3;
            const pb = priorityOrder[b.priority] ?? 3;
            if (pa !== pb) return pa - pb;
            if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate) return -1;
            if (b.dueDate) return 1;
            return b.createdAt - a.createdAt;
        });
        
        // 渲染
        if (filteredMemos.length === 0) {
            container.innerHTML = `
                <div class="empty-task-list">
                    <i class="fas fa-tasks"></i>
                    <p>${searchText ? '没有找到匹配的任务' : '暂无任务，点击上方按钮新增'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        filteredMemos.forEach(task => {
            const item = this.createPanelTaskItem(task);
            container.appendChild(item);
        });
    }
    
    /**
     * 创建面板内的任务项
     * @param {Object} task - 任务对象
     * @returns {HTMLElement}
     */
    createPanelTaskItem(task) {
        const item = document.createElement('div');
        item.className = `panel-task-item ${task.completed ? 'completed' : ''} priority-${task.priority || 'none'}`;
        item.dataset.id = task.id;
        
        // 判断是否过期
        const today = this.getTodayDate();
        const isOverdue = task.dueDate && task.dueDate < today && !task.completed;
        if (isOverdue) item.classList.add('overdue');
        
        // 优先级颜色
        const priorityColors = { high: '#ff4757', medium: '#ffa502', low: '#2ed573', none: 'transparent' };
        const priorityColor = priorityColors[task.priority] || 'transparent';
        
        item.innerHTML = `
            <div class="task-checkbox" title="${task.completed ? '标记为未完成' : '标记为已完成'}">
                <i class="${task.completed ? 'fas fa-check-circle' : 'far fa-circle'}"></i>
            </div>
            <div class="task-info">
                <div class="task-title">${this.escapeHtml(task.title || '无标题')}</div>
                ${task.text ? `<div class="task-desc">${this.escapeHtml(task.text.substring(0, 50))}${task.text.length > 50 ? '...' : ''}</div>` : ''}
                <div class="task-meta">
                    ${task.dueDate ? `<span class="task-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '已过期: ' : ''}${task.dueDate}</span>` : ''}
                    ${task.priority && task.priority !== 'none' ? `<span class="task-priority" style="background:${priorityColor}">${task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <button class="task-action-btn edit-btn" title="编辑"><i class="fas fa-edit"></i></button>
                <button class="task-action-btn delete-btn" title="删除"><i class="fas fa-trash"></i></button>
            </div>
        `;
        
        // 绑定事件
        item.querySelector('.task-checkbox').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleTaskComplete(task.id);
        });
        
        item.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.showTaskFormModal(task);
        });
        
        item.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('确定要删除这个任务吗？')) {
                this.deleteTask(task.id);
            }
        });
        
        // 点击任务项也可以编辑
        item.addEventListener('click', () => this.showTaskFormModal(task));
        
        return item;
    }
    
    /**
     * 切换任务完成状态
     * @param {string} taskId - 任务ID
     */
    async toggleTaskComplete(taskId) {
        const task = this.memos.find(m => m.id === taskId);
        if (!task) return;
        
        task.completed = !task.completed;
        task.completedAt = task.completed ? Date.now() : null;
        task.updatedAt = Date.now();
        
        await this.saveMemos();
        this.renderPanelTaskList();
        this.refreshCalendarPanelIfOpen();
    }
    
    /**
     * 删除任务
     * @param {string} taskId - 任务ID
     */
    async deleteTask(taskId) {
        const index = this.memos.findIndex(m => m.id === taskId);
        if (index === -1) return;
        
        this.memos.splice(index, 1);
        await this.saveMemos();
        this.renderPanelTaskList();
    }
    
    /**
     * HTML 转义
     * @param {string} str - 原始字符串
     * @returns {string}
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * 复制文本到剪贴板
     * @param {string} text 要复制的文本
     * @returns {Promise<boolean>}
     */
    async copyToClipboard(text) {
        if (!text) return false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;opacity:0;left:-9999px;';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return !!ok;
        } catch (e) {
            return false;
        }
    }

    /**
     * 显示短暂提示
     * @param {string} message 提示文案
     */
    showToast(message) {
        let el = document.getElementById('memo-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'memo-toast';
            el.className = 'memo-toast';
            document.body.appendChild(el);
        }
        el.textContent = message;
        el.classList.add('memo-toast-visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.classList.remove('memo-toast-visible');
        }, 1800);
    }

    /**
     * 显示任务项右键菜单（复制标题/描述/子任务、编辑、删除）
     * @param {Object} task 任务对象
     * @param {number} x 客户端 X
     * @param {number} y 客户端 Y
     */
    showTaskContextMenu(task, x, y) {
        const existing = document.getElementById('task-context-menu');
        if (existing) existing.remove();
        const menu = document.createElement('div');
        menu.id = 'task-context-menu';
        menu.className = 'task-context-menu';
        const subtasksText = (task.subtasks && task.subtasks.length > 0)
            ? task.subtasks.map(st => (st.completed ? '[x] ' : '[ ] ') + (st.title || '')).join('\n')
            : '';
        menu.innerHTML = `
            <button type="button" data-action="copy-title"><i class="fas fa-heading"></i> 复制标题</button>
            <button type="button" data-action="copy-desc"><i class="fas fa-align-left"></i> 复制描述</button>
            ${subtasksText ? '<button type="button" data-action="copy-subtasks"><i class="fas fa-list-check"></i> 复制子任务列表</button>' : ''}
            <hr>
            <button type="button" data-action="edit"><i class="fas fa-pen"></i> 编辑</button>
            <button type="button" data-action="delete"><i class="fas fa-trash"></i> 删除</button>
        `;
        document.body.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;
        menu.style.left = Math.min(x, maxX) + 'px';
        menu.style.top = Math.min(y, maxY) + 'px';
        const close = () => menu.remove();
        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'copy-title') {
                    const ok = await this.copyToClipboard(task.title || '');
                    this.showToast(ok ? '已复制标题' : '复制失败');
                } else if (action === 'copy-desc') {
                    const ok = await this.copyToClipboard(task.text || '');
                    this.showToast(ok ? '已复制描述' : '复制失败');
                } else if (action === 'copy-subtasks') {
                    const text = (task.subtasks || []).map(st => (st.completed ? '[x] ' : '[ ] ') + (st.title || '')).join('\n');
                    const ok = await this.copyToClipboard(text);
                    this.showToast(ok ? '已复制子任务列表' : '复制失败');
                } else if (action === 'edit') {
                    this.showSidebarForm(task);
                } else if (action === 'delete') {
                    if (confirm('确定要删除这个任务吗？')) this.deleteSidebarTask(task.id);
                }
                close();
            });
        });
        const onOutside = (e) => {
            if (!menu.contains(e.target)) {
                close();
                document.removeEventListener('click', onOutside);
                document.removeEventListener('contextmenu', onOutside);
            }
        };
        requestAnimationFrame(() => {
            document.addEventListener('click', onOutside);
            document.addEventListener('contextmenu', onOutside);
        });
    }

    /**
     * 从 URL 中提取域名作为显示名
     * @param {string} url URL 字符串
     * @returns {string} 域名或简短 URL
     */
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return url.length > 30 ? url.substring(0, 30) + '...' : url;
        }
    }
    
    /**
     * 创建面板控制按钮
     * @param {HTMLElement} container - 控制按钮容器元素
     */
    createPanelControls(container) {
        try {
            console.log('开始创建面板控制按钮...');
            
            // 创建最小化按钮
            const minimizeBtn = document.createElement('button');
            minimizeBtn.className = 'panel-control-btn minimize-btn';
            minimizeBtn.innerHTML = '−';
            minimizeBtn.title = '最小化';
            minimizeBtn.addEventListener('click', () => this.toggleMinimize());
            
            // 创建关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.className = 'panel-control-btn close-btn';
            closeBtn.innerHTML = '×';
            closeBtn.title = '关闭';
            closeBtn.addEventListener('click', () => this.toggle());
            
            // 添加按钮到容器
            container.appendChild(minimizeBtn);
            container.appendChild(closeBtn);
            
            console.log('面板控制按钮创建完成');
        } catch (error) {
            console.error('创建面板控制按钮时发生错误:', error);
        }
    }
    
    /**
     * 初始化拖拽功能
     * @param {HTMLElement} handle - 拖动句柄元素
     */
    initDragAndDrop(handle) {
        try {
            console.log('初始化拖拽功能...');
            
            const panel = document.querySelector('.floating-panel');
            if (!panel || !handle) return;
            
            let isDragging = false;
            let offsetX, offsetY;
            
            handle.addEventListener('mousedown', (e) => {
                // 只有在非按钮区域才允许拖动
                if (e.target.tagName === 'BUTTON') return;
                
                isDragging = true;
                offsetX = e.clientX - panel.getBoundingClientRect().left;
                offsetY = e.clientY - panel.getBoundingClientRect().top;
                
                document.addEventListener('mousemove', this.handleMouseMove);
                document.addEventListener('mouseup', this.handleMouseUp);
            });
            
            this.handleMouseMove = (e) => {
                if (!isDragging) return;
                
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;
                
                const maxX = window.innerWidth - panel.offsetWidth;
                const maxY = window.innerHeight - panel.offsetHeight;
                
                panel.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
                panel.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
                
                this.panelConfig.position = {
                    x: parseInt(panel.style.left),
                    y: parseInt(panel.style.top)
                };
                this.savePanelConfig();
            };
            
            this.handleMouseUp = () => {
                isDragging = false;
                
                document.removeEventListener('mousemove', this.handleMouseMove);
                document.removeEventListener('mouseup', this.handleMouseUp);
            };
            
            console.log('拖拽功能初始化完成');
        } catch (error) {
            console.error('初始化拖拽功能时发生错误:', error);
        }
    }
    
    /**
     * 初始化键盘快捷键
     */
    initKeyboardShortcuts() {
        try {
            console.log('初始化键盘快捷键...');
            
            // 定义快捷键映射
            this.shortcuts = [
                { key: 'n', ctrlKey: true, action: this.showTaskFormModal.bind(this), description: 'shortcutAdd' },
                { key: 'h', ctrlKey: true, action: this.toggleMinimize.bind(this), description: 'shortcutTogglePanel' },
                { key: 'k', ctrlKey: true, action: this.toggleSpotlightSearch.bind(this), description: 'shortcutBookmarkSearch' },
                { key: '?', ctrlKey: true, action: this.showShortcutsHelp.bind(this), description: 'shortcutHelp' }
            ];
            
            // 添加全局快捷键监听
            document.addEventListener('keydown', this.handleKeyDown.bind(this));
            
            console.log('键盘快捷键初始化完成');
        } catch (error) {
            console.error('初始化键盘快捷键时发生错误:', error);
        }
    }
    
    /**
     * 处理键盘按键事件
     * @param {KeyboardEvent} event 键盘事件
     */
    handleKeyDown(event) {
        try {
            // Ctrl+K 全局书签搜索，即使在输入框中也能触发
            if (event.key === 'k' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.toggleSpotlightSearch();
                return;
            }

            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                if (this.isFormVisible) {
                    if (event.key === 'Escape') {
                        console.log('表单中按下ESC键，关闭表单');
                        event.preventDefault();
                        this.hideMemoForm();
                    } else if (event.key === 'Enter' && event.ctrlKey) {
                        console.log('表单中按下Ctrl+Enter，保存表单');
                        event.preventDefault();
                        this.saveMemoForm();
                    }
                }
                return;
            }
            
            // 处理任务项的快捷键
            if (this.selectedTaskId) {
                console.log('处理选中任务的快捷键，任务ID:', this.selectedTaskId);
                
                if (event.key === 'Space') {
                    console.log('按下空格键，切换任务完成状态');
                    event.preventDefault();
                    this.toggleMemoCompleted(this.selectedTaskId);
                    return;
                } else if (event.key === 'e') {
                    console.log('按下e键，编辑任务');
                    event.preventDefault();
                    this.editMemo(this.selectedTaskId);
                    return;
                } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    console.log('按下Delete/Backspace键，删除任务');
                    event.preventDefault();
                    if (confirm(window.i18nManager.getText('confirmDelete'))) {
                        this.deleteMemo(this.selectedTaskId);
                    }
                    return;
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    console.log('按下方向键，导航任务列表');
                    event.preventDefault();
                    this.navigateTaskList(event.key === 'ArrowUp' ? -1 : 1);
                    return;
                }
            }
            
            // 处理全局快捷键
            for (const shortcut of this.shortcuts) {
                if (event.key.toLowerCase() === shortcut.key.toLowerCase() && 
                    (!shortcut.ctrlKey || (shortcut.ctrlKey && (event.ctrlKey || event.metaKey)))) {
                    console.log('触发全局快捷键:', shortcut.description);
                    event.preventDefault();
                    shortcut.action();
                    return;
                }
            }
        } catch (error) {
            console.error('处理键盘事件时发生错误:', error);
        }
    }
    
    /**
     * 显示快捷键帮助
     */
    showShortcutsHelp() {
        // 创建帮助对话框
        const helpDialog = document.createElement('div');
        helpDialog.className = 'shortcuts-help-dialog';
        
        // 创建对话框标题
        const dialogTitle = document.createElement('h3');
        dialogTitle.textContent = window.i18nManager.getText('shortcuts');
        
        // 创建快捷键列表
        const shortcutsList = document.createElement('ul');
        shortcutsList.className = 'shortcuts-list';
        
        // 添加全局快捷键
        this.shortcuts.forEach(shortcut => {
            const shortcutItem = document.createElement('li');
            const keyCombo = document.createElement('span');
            keyCombo.className = 'key-combo';
            keyCombo.textContent = `${shortcut.ctrlKey ? 'Ctrl+' : ''}${shortcut.key.toUpperCase()}`;
            
            const description = document.createElement('span');
            description.textContent = window.i18nManager.getText(shortcut.description);
            
            shortcutItem.appendChild(keyCombo);
            shortcutItem.appendChild(description);
            shortcutsList.appendChild(shortcutItem);
        });
        
        // 添加任务项快捷键
        const taskShortcuts = [
            { key: 'Space', description: 'shortcutComplete' },
            { key: 'E', description: 'shortcutEdit' },
            { key: 'Delete', description: 'shortcutDelete' },
            { key: '↑/↓', description: 'Navigate between tasks' },
            { key: 'Esc', description: 'shortcutCancel' },
            { key: 'Ctrl+Enter', description: 'shortcutSave' }
        ];
        
        taskShortcuts.forEach(shortcut => {
            const shortcutItem = document.createElement('li');
            const keyCombo = document.createElement('span');
            keyCombo.className = 'key-combo';
            keyCombo.textContent = shortcut.key;
            
            const description = document.createElement('span');
            description.textContent = window.i18nManager.getText(shortcut.description) || shortcut.description;
            
            shortcutItem.appendChild(keyCombo);
            shortcutItem.appendChild(description);
            shortcutsList.appendChild(shortcutItem);
        });
        
        // 创建关闭按钮
        const closeButton = document.createElement('button');
        closeButton.className = 'close-dialog-btn';
        closeButton.textContent = 'OK';
        closeButton.addEventListener('click', () => {
            document.body.removeChild(helpDialog);
        });
        
        // 组装对话框
        helpDialog.appendChild(dialogTitle);
        helpDialog.appendChild(shortcutsList);
        helpDialog.appendChild(closeButton);
        
        // 添加到页面
        document.body.appendChild(helpDialog);
        
        // 点击对话框外部关闭
        helpDialog.addEventListener('click', (e) => {
            if (e.target === helpDialog) {
                document.body.removeChild(helpDialog);
            }
        });
        
        // ESC键关闭
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(helpDialog);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }
    
    /**
     * 设置选中的任务
     * @param {string} taskId 任务ID
     */
    setSelectedTask(taskId) {
        try {
            console.log('设置选中任务，ID:', taskId);
            
            // 清除之前的选中状态
            if (this.selectedTaskId) {
                console.log('清除之前选中的任务，ID:', this.selectedTaskId);
                const prevSelectedTask = this.panel.querySelector(`.memo-item[data-id="${this.selectedTaskId}"]`);
                if (prevSelectedTask) {
                    prevSelectedTask.classList.remove('selected');
                } else {
                    console.warn('未找到之前选中的任务元素:', this.selectedTaskId);
                }
            }
            
            // 设置新的选中状态
            this.selectedTaskId = taskId;
            
            if (taskId) {
                const selectedTask = this.panel.querySelector(`.memo-item[data-id="${taskId}"]`);
                if (selectedTask) {
                    console.log('设置新选中的任务元素:', taskId);
                    selectedTask.classList.add('selected');
                    // 确保选中的任务可见
                    selectedTask.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else {
                    console.warn('未找到要选中的任务元素:', taskId);
                }
            }
        } catch (error) {
            console.error('设置选中任务时发生错误:', error);
        }
    }
    
    /**
     * 导航任务列表
     * @param {number} direction 导航方向，1表示向下，-1表示向上
     */
    navigateTaskList(direction) {
        try {
            console.log('导航任务列表，方向:', direction);
            
            const taskItems = this.panel.querySelectorAll('.memo-item');
            if (!taskItems.length) {
                console.log('任务列表为空，无法导航');
                return;
            }
            
            let currentIndex = -1;
            for (let i = 0; i < taskItems.length; i++) {
                if (taskItems[i].dataset.id === this.selectedTaskId) {
                    currentIndex = i;
                    break;
                }
            }
            
            let newIndex = currentIndex + direction;
            // 循环导航
            if (newIndex < 0) {
                newIndex = taskItems.length - 1;
            } else if (newIndex >= taskItems.length) {
                newIndex = 0;
            }
            
            console.log('导航从索引', currentIndex, '到', newIndex);
            
            if (newIndex >= 0 && newIndex < taskItems.length) {
                const newTaskId = taskItems[newIndex].dataset.id;
                this.setSelectedTask(newTaskId);
            } else {
                console.warn('导航索引超出范围:', newIndex, '任务总数:', taskItems.length);
            }
        } catch (error) {
            console.error('导航任务列表时发生错误:', error);
        }
    }

    /**
     * 显示分类和标签管理对话框
     */
    showCategoryTagManager() {
        // 检查是否已存在对话框
        let dialog = document.getElementById('category-tag-dialog');
        if (dialog) {
            dialog.style.display = 'flex';
            return;
        }
        
        // 创建对话框
        dialog = document.createElement('div');
        dialog.id = 'category-tag-dialog';
        dialog.className = 'category-tag-dialog';
        
        const dialogContent = document.createElement('div');
        dialogContent.className = 'category-tag-dialog-content';
        
        // 标题
        const title = document.createElement('h3');
        title.textContent = window.i18nManager.getText('manageCategoriesAndTags');
        dialogContent.appendChild(title);
        
        // 创建标签页
        const tabs = document.createElement('div');
        tabs.className = 'category-tag-tabs';
        
        const categoryTab = document.createElement('div');
        categoryTab.className = 'category-tag-tab active';
        categoryTab.textContent = window.i18nManager.getText('categories');
        categoryTab.dataset.tab = 'categories';
        
        const tagTab = document.createElement('div');
        tagTab.className = 'category-tag-tab';
        tagTab.textContent = window.i18nManager.getText('tags');
        tagTab.dataset.tab = 'tags';
        
        tabs.appendChild(categoryTab);
        tabs.appendChild(tagTab);
        dialogContent.appendChild(tabs);
        
        // 创建内容面板
        const categoryPanel = document.createElement('div');
        categoryPanel.className = 'category-tag-panel active';
        categoryPanel.id = 'categories-panel';
        
        const tagPanel = document.createElement('div');
        tagPanel.className = 'category-tag-panel';
        tagPanel.id = 'tags-panel';
        
        // 渲染分类列表
        this.renderCategoryList(categoryPanel);
        
        // 渲染标签列表
        this.renderTagList(tagPanel);
        
        dialogContent.appendChild(categoryPanel);
        dialogContent.appendChild(tagPanel);
        
        // 添加底部按钮
        const footer = document.createElement('div');
        footer.className = 'dialog-footer';
        
        const closeButton = document.createElement('button');
        closeButton.textContent = window.i18nManager.getText('close');
        closeButton.addEventListener('click', () => {
            dialog.style.display = 'none';
        });
        
        footer.appendChild(closeButton);
        dialogContent.appendChild(footer);
        
        // 添加标签页切换事件
        tabs.addEventListener('click', (e) => {
            if (e.target.classList.contains('category-tag-tab')) {
                // 移除所有活动状态
                document.querySelectorAll('.category-tag-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelectorAll('.category-tag-panel').forEach(panel => {
                    panel.classList.remove('active');
                });
                
                // 设置当前标签页为活动状态
                e.target.classList.add('active');
                const tabName = e.target.dataset.tab;
                document.getElementById(`${tabName}-panel`).classList.add('active');
            }
        });
        
        dialog.appendChild(dialogContent);
        document.body.appendChild(dialog);
        
        // 添加ESC键关闭
        document.addEventListener('keydown', this.escHandler);
    }
    
    /**
     * 渲染分类列表
     * @param {HTMLElement} container 容器元素
     */
    renderCategoryList(container) {
        container.innerHTML = '';
        
        // 创建分类列表
        const categoryList = document.createElement('div');
        categoryList.className = 'category-tag-list';
        
        if (this.categories.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = window.i18nManager.getText('noCategories');
            categoryList.appendChild(emptyMessage);
        } else {
            // 添加分类项
            this.categories.forEach(category => {
                const categoryItem = document.createElement('div');
                categoryItem.className = 'category-tag-item';
                
                const categoryName = document.createElement('div');
                categoryName.className = 'category-tag-item-name';
                
                const colorIndicator = document.createElement('div');
                colorIndicator.className = 'category-tag-color';
                colorIndicator.style.backgroundColor = category.color;
                
                const nameText = document.createElement('span');
                nameText.textContent = category.name;
                
                categoryName.appendChild(colorIndicator);
                categoryName.appendChild(nameText);
                
                const actions = document.createElement('div');
                actions.className = 'category-tag-actions';
                
                const editButton = document.createElement('button');
                editButton.innerHTML = '<i class="fas fa-edit"></i>';
                editButton.title = window.i18nManager.getText('edit');
                editButton.addEventListener('click', () => {
                    this.showCategoryForm(category);
                });
                
                const deleteButton = document.createElement('button');
                deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                deleteButton.title = window.i18nManager.getText('delete');
                deleteButton.addEventListener('click', () => {
                    if (confirm(window.i18nManager.getText('confirmDeleteCategory'))) {
                        this.deleteCategory(category.id);
                        this.renderCategoryList(container);
                    }
                });
                
                actions.appendChild(editButton);
                actions.appendChild(deleteButton);
                
                categoryItem.appendChild(categoryName);
                categoryItem.appendChild(actions);
                
                categoryList.appendChild(categoryItem);
            });
        }
        
        container.appendChild(categoryList);
        
        // 添加按钮
        const addButton = document.createElement('button');
        addButton.className = 'manage-categories-tags-btn';
        addButton.textContent = window.i18nManager.getText('addCategory');
        addButton.addEventListener('click', () => {
            this.showCategoryForm();
        });
        
        container.appendChild(addButton);
    }
    
    /**
     * 渲染标签列表
     * @param {HTMLElement} container 容器元素
     */
    renderTagList(container) {
        container.innerHTML = '';
        
        // 创建标签列表
        const tagList = document.createElement('div');
        tagList.className = 'category-tag-list';
        
        if (this.tags.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'empty-message';
            emptyMessage.textContent = window.i18nManager.getText('noTags');
            tagList.appendChild(emptyMessage);
        } else {
            // 添加标签项
            this.tags.forEach(tag => {
                const tagItem = document.createElement('div');
                tagItem.className = 'category-tag-item';
                
                const tagName = document.createElement('div');
                tagName.className = 'category-tag-item-name';
                
                const colorIndicator = document.createElement('div');
                colorIndicator.className = 'category-tag-color';
                colorIndicator.style.backgroundColor = tag.color;
                
                const nameText = document.createElement('span');
                nameText.textContent = tag.name;
                
                tagName.appendChild(colorIndicator);
                tagName.appendChild(nameText);
                
                const actions = document.createElement('div');
                actions.className = 'category-tag-actions';
                
                const editButton = document.createElement('button');
                editButton.innerHTML = '<i class="fas fa-edit"></i>';
                editButton.title = window.i18nManager.getText('edit');
                editButton.addEventListener('click', () => {
                    this.showTagForm(tag);
                });
                
                const deleteButton = document.createElement('button');
                deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
                deleteButton.title = window.i18nManager.getText('delete');
                deleteButton.addEventListener('click', () => {
                    if (confirm(window.i18nManager.getText('confirmDeleteTag'))) {
                        this.deleteTag(tag.id);
                        this.renderTagList(container);
                    }
                });
                
                actions.appendChild(editButton);
                actions.appendChild(deleteButton);
                
                tagItem.appendChild(tagName);
                tagItem.appendChild(actions);
                
                tagList.appendChild(tagItem);
            });
        }
        
        container.appendChild(tagList);
        
        // 添加按钮
        const addButton = document.createElement('button');
        addButton.className = 'manage-categories-tags-btn';
        addButton.textContent = window.i18nManager.getText('addTag');
        addButton.addEventListener('click', () => {
            this.showTagForm();
        });
        
        container.appendChild(addButton);
    }
    
    /**
     * 显示分类表单
     * @param {Object} category 要编辑的分类，如果是新建则为null
     */
    showCategoryForm(category = null) {
        // 检查是否已存在表单
        let form = document.getElementById('category-form');
        if (form) {
            form.remove();
        }
        
        // 获取分类面板
        const panel = document.getElementById('categories-panel');
        
        // 创建表单
        form = document.createElement('div');
        form.id = 'category-form';
        form.className = 'category-tag-form';
        
        // 表单标题
        const formTitle = document.createElement('h4');
        formTitle.textContent = category ? window.i18nManager.getText('editCategory') : window.i18nManager.getText('addCategory');
        form.appendChild(formTitle);
        
        // 名称输入
        const nameGroup = document.createElement('div');
        nameGroup.className = 'category-tag-form-group';
        
        const nameLabel = document.createElement('label');
        nameLabel.textContent = window.i18nManager.getText('categoryName');
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'category-name-input';
        nameInput.value = category ? category.name : '';
        
        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        form.appendChild(nameGroup);
        
        // 颜色选择
        const colorGroup = document.createElement('div');
        colorGroup.className = 'category-tag-form-group';
        
        const colorLabel = document.createElement('label');
        colorLabel.textContent = window.i18nManager.getText('color');
        
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.id = 'category-color-input';
        colorInput.value = category ? category.color : '#1890ff';
        
        colorGroup.appendChild(colorLabel);
        colorGroup.appendChild(colorInput);
        form.appendChild(colorGroup);
        
        // 按钮组
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'category-tag-form-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'cancel-btn';
        cancelButton.textContent = window.i18nManager.getText('cancel');
        cancelButton.addEventListener('click', () => {
            form.remove();
        });
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-btn';
        saveButton.textContent = window.i18nManager.getText('save');
        saveButton.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const color = colorInput.value;
            
            if (!name) {
                alert(window.i18nManager.getText('categoryNameRequired'));
                return;
            }
            
            if (category) {
                // 更新分类
                this.updateCategory(category.id, { name, color });
            } else {
                // 添加新分类
                this.addCategory({ name, color });
            }
            
            // 重新渲染分类列表
            this.renderCategoryList(panel);
            form.remove();
        });
        
        buttonGroup.appendChild(cancelButton);
        buttonGroup.appendChild(saveButton);
        form.appendChild(buttonGroup);
        
        panel.appendChild(form);
        
        // 聚焦到名称输入框
        nameInput.focus();
    }
    
    /**
     * 显示标签表单
     * @param {Object} tag 要编辑的标签，如果是新建则为null
     */
    showTagForm(tag = null) {
        // 检查是否已存在表单
        let form = document.getElementById('tag-form');
        if (form) {
            form.remove();
        }
        
        // 获取标签面板
        const panel = document.getElementById('tags-panel');
        
        // 创建表单
        form = document.createElement('div');
        form.id = 'tag-form';
        form.className = 'category-tag-form';
        
        // 表单标题
        const formTitle = document.createElement('h4');
        formTitle.textContent = tag ? window.i18nManager.getText('editTag') : window.i18nManager.getText('addTag');
        form.appendChild(formTitle);
        
        // 名称输入
        const nameGroup = document.createElement('div');
        nameGroup.className = 'category-tag-form-group';
        
        const nameLabel = document.createElement('label');
        nameLabel.textContent = window.i18nManager.getText('tagName');
        
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.id = 'tag-name-input';
        nameInput.value = tag ? tag.name : '';
        
        nameGroup.appendChild(nameLabel);
        nameGroup.appendChild(nameInput);
        form.appendChild(nameGroup);
        
        // 颜色选择
        const colorGroup = document.createElement('div');
        colorGroup.className = 'category-tag-form-group';
        
        const colorLabel = document.createElement('label');
        colorLabel.textContent = window.i18nManager.getText('color');
        
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.id = 'tag-color-input';
        colorInput.value = tag ? tag.color : '#52c41a';
        
        colorGroup.appendChild(colorLabel);
        colorGroup.appendChild(colorInput);
        form.appendChild(colorGroup);
        
        // 按钮组
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'category-tag-form-buttons';
        
        const cancelButton = document.createElement('button');
        cancelButton.className = 'cancel-btn';
        cancelButton.textContent = window.i18nManager.getText('cancel');
        cancelButton.addEventListener('click', () => {
            form.remove();
        });
        
        const saveButton = document.createElement('button');
        saveButton.className = 'save-btn';
        saveButton.textContent = window.i18nManager.getText('save');
        saveButton.addEventListener('click', () => {
            const name = nameInput.value.trim();
            const color = colorInput.value;
            
            if (!name) {
                alert(window.i18nManager.getText('tagNameRequired'));
                return;
            }
            
            if (tag) {
                // 更新标签
                this.updateTag(tag.id, { name, color });
            } else {
                // 添加新标签
                this.addTag({ name, color });
            }
            
            // 重新渲染标签列表
            this.renderTagList(panel);
            form.remove();
        });
        
        buttonGroup.appendChild(cancelButton);
        buttonGroup.appendChild(saveButton);
        form.appendChild(buttonGroup);
        
        panel.appendChild(form);
        
        // 聚焦到名称输入框
        nameInput.focus();
    }

    /**
     * 更新排序选项的名称，使用 i18n 翻译
     */
    updateSortOptionNames() {
        if (window.i18nManager) {
            this.sortOptions.forEach(option => {
                switch (option.id) {
                    case 'newest':
                        option.name = window.i18nManager.getText('newest') || '最新的在前';
                        break;
                    case 'oldest':
                        option.name = window.i18nManager.getText('oldest') || '最早的在前';
                        break;
                    case 'dueDate':
                        option.name = window.i18nManager.getText('dueDate') || '按截止日期';
                        break;
                    case 'priority':
                        option.name = window.i18nManager.getText('priority') || '按优先级';
                        break;
                    case 'alphabetical':
                        option.name = window.i18nManager.getText('alphabetical') || '按字母顺序';
                        break;
                }
            });
        }
    }
    
    /**
     * 处理鼠标移动事件
     * @param {MouseEvent} e 鼠标事件
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;
        
        const panel = document.querySelector('.floating-panel');
        if (!panel) return;
        
        const newLeft = this.startLeft + (e.clientX - this.startX);
        const newTop = this.startTop + (e.clientY - this.startY);
        
        // 确保面板不会被拖出视口
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        
        panel.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
        panel.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
        
        // 保存面板位置
        this.panelConfig.position = {
            x: parseInt(panel.style.left),
            y: parseInt(panel.style.top)
        };
        this.savePanelConfig();
    }
    
    /**
     * 处理鼠标释放事件
     */
    handleMouseUp() {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }
    
    /**
     * 处理调整大小时的鼠标移动事件
     * @param {MouseEvent} e 鼠标事件
     */
    handleResizeMove(e) {
        if (!this.isResizing) return;
        
        const panel = document.querySelector('.floating-panel');
        if (!panel) return;
        
        const newWidth = this.startWidth + (e.clientX - this.startX);
        
        // 设置最小宽度
        panel.style.width = Math.max(200, newWidth) + 'px';
        
        // 保存面板配置
        this.panelConfig.size.width = parseInt(panel.style.width);
        this.savePanelConfig();
    }
    
    /**
     * 处理调整大小结束时的鼠标释放事件
     */
    handleResizeUp() {
        this.isResizing = false;
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeUp);
    }
    
    /**
     * 处理调整高度时的鼠标移动事件
     * @param {MouseEvent} e 鼠标事件
     */
    handleResizeHeightMove(e) {
        if (!this.isResizingHeight) return;
        
        const panel = document.querySelector('.floating-panel');
        if (!panel) return;
        
        const newHeight = this.startHeight + (e.clientY - this.startY);
        
        // 设置最小高度
        panel.style.height = Math.max(150, newHeight) + 'px';
        
        // 保存面板配置
        this.panelConfig.size.height = parseInt(panel.style.height);
        this.savePanelConfig();
    }
    
    /**
     * 处理调整高度结束时的鼠标释放事件
     */
    handleResizeHeightUp() {
        this.isResizingHeight = false;
        document.removeEventListener('mousemove', this.handleResizeHeightMove);
        document.removeEventListener('mouseup', this.handleResizeHeightUp);
    }
    
    /**
     * 保存面板配置
     */
    savePanelConfig() {
        chrome.storage.local.set({ [this.PANEL_CONFIG_KEY]: this.panelConfig });
    }
    
    /**
     * 初始化调整大小功能
     * @param {HTMLElement} panel - 面板元素
     */
    initResize(panel) {
        try {
            console.log('初始化调整大小功能...');
            
            if (!panel) return;
            
            // 创建调整大小的手柄
            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'resize-handle';
            panel.appendChild(resizeHandle);
            
            let isResizing = false;
            let startWidth, startX;
            
            resizeHandle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                isResizing = true;
                startWidth = parseInt(panel.style.width) || panel.offsetWidth;
                startX = e.clientX;
                
                document.addEventListener('mousemove', handleResizeMove);
                document.addEventListener('mouseup', handleResizeUp);
            });
            
            const handleResizeMove = (e) => {
                if (!isResizing) return;
                
                const newWidth = startWidth + (e.clientX - startX);
                
                // 设置最小宽度
                panel.style.width = Math.max(200, newWidth) + 'px';
                
                // 保存面板配置
                this.panelConfig.size.width = parseInt(panel.style.width);
                this.savePanelConfig();
            };
            
            const handleResizeUp = () => {
                isResizing = false;
                
                document.removeEventListener('mousemove', handleResizeMove);
                document.removeEventListener('mouseup', handleResizeUp);
            };
            
            console.log('调整大小功能初始化完成');
        } catch (error) {
            console.error('初始化调整大小功能时发生错误:', error);
        }
    }

    // ===================== 紧急任务浮动气泡 =====================

    _getUrgencyLevel(task) {
        if (!task.dueDate || task.completed) return null;
        const today = this.getTodayDate();
        const d = new Date();
        const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString().split('T')[0];
        const in3 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3).toISOString().split('T')[0];

        if (task.dueDate < today) return 'overdue';
        if (task.dueDate === today) return 'today';
        if (task.dueDate === tomorrow) return 'tomorrow';
        if (task.dueDate <= in3) return 'soon';
        return null;
    }

    _urgencyLabel(level, dueDate) {
        const today = this.getTodayDate();
        if (level === 'overdue') {
            const diff = Math.floor((new Date(today) - new Date(dueDate)) / 86400000);
            return `逾期${diff}天`;
        }
        if (level === 'today') return '今天到期';
        if (level === 'tomorrow') return '明天到期';
        if (level === 'soon') {
            const diff = Math.floor((new Date(dueDate) - new Date(today)) / 86400000);
            return `还剩${diff}天`;
        }
        return '';
    }

    _updateUrgentBubble() {
        const bubble = document.getElementById('urgent-bubble');
        if (!bubble) return;

        const urgentTasks = this.memos
            .map(t => ({ ...t, _urgency: this._getUrgencyLevel(t) }))
            .filter(t => t._urgency)
            .sort((a, b) => {
                const order = { overdue: 0, today: 1, tomorrow: 2, soon: 3 };
                return (order[a._urgency] ?? 9) - (order[b._urgency] ?? 9);
            });

        if (urgentTasks.length === 0) {
            bubble.style.display = 'none';
            this._clearUrgentMiniBarTimer();
            return;
        }

        bubble.style.display = '';
        const numEl = document.getElementById('urgent-bubble-num');
        const titleEl = document.getElementById('urgent-panel-title');
        const bodyEl = document.getElementById('urgent-panel-body');
        const dotEl = document.getElementById('urgent-bubble-dot');
        const miniBar = document.getElementById('urgent-mini-bar');

        if (numEl) numEl.textContent = urgentTasks.length;
        if (titleEl) titleEl.textContent = `${urgentTasks.length}个任务需要关注`;

        // 根据是否有 overdue 设置气泡颜色
        const hasOverdue = urgentTasks.some(t => t._urgency === 'overdue');
        if (dotEl) {
            dotEl.classList.toggle('has-overdue', hasOverdue);
        }

        if (bodyEl) {
            bodyEl.innerHTML = urgentTasks.map(t => {
                const cat = t.categoryId ? this.getCategoryName(t.categoryId) : '';
                const label = this._urgencyLabel(t._urgency, t.dueDate);
                return `
                    <div class="urgent-task-item urgent-level-${t._urgency}" data-id="${t.id}">
                        <div class="urgent-task-bar"></div>
                        <div class="urgent-task-info">
                            <div class="urgent-task-name">${this.escapeHtml(t.title || '无标题')}</div>
                            <div class="urgent-task-meta">${cat ? cat + ' · ' : ''}${t.dueDate}</div>
                        </div>
                        <span class="urgent-task-badge">${label}</span>
                    </div>
                `;
            }).join('');

            bodyEl.querySelectorAll('.urgent-task-item').forEach(item => {
                item.addEventListener('click', () => {
                    const task = this.memos.find(m => m.id === item.dataset.id);
                    if (task) this.showSidebarForm(task);
                    bubble.classList.remove('expanded');
                });
            });
        }

        // 更新简易摘要条
        this._clearUrgentMiniBarTimer();
        bubble._urgentTasks = urgentTasks;
        this._updateUrgentMiniBar(bubble);

        // 多条任务时启动轮播
        if (urgentTasks.length > 1) {
            bubble._miniBarTimer = setInterval(() => {
                if (bubble._miniBarPaused) return;
                this._rotateUrgentMiniBar(bubble);
            }, 5000);
        }

        if (!bubble._eventsBound) {
            bubble._eventsBound = true;
            const dot = document.getElementById('urgent-bubble-dot');
            const closeBtn = document.getElementById('urgent-panel-close');
            if (dot) dot.addEventListener('click', () => bubble.classList.add('expanded'));
            if (closeBtn) closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                bubble.classList.remove('expanded');
            });
            // 摘要条点击展开面板；悬停暂停轮播
            if (miniBar) {
                miniBar.addEventListener('click', () => bubble.classList.add('expanded'));
                miniBar.addEventListener('mouseenter', () => { bubble._miniBarPaused = true; });
                miniBar.addEventListener('mouseleave', () => { bubble._miniBarPaused = false; });
            }
        }
    }

    _clearUrgentMiniBarTimer() {
        const bubble = document.getElementById('urgent-bubble');
        if (bubble && bubble._miniBarTimer) {
            clearInterval(bubble._miniBarTimer);
            bubble._miniBarTimer = null;
        }
    }

    _updateUrgentMiniBar(bubble) {
        const tasks = bubble._urgentTasks;
        if (!tasks || tasks.length === 0) return;
        const miniBar = document.getElementById('urgent-mini-bar');
        const miniText = document.getElementById('urgent-mini-text');
        if (!miniBar || !miniText) return;

        const idx = (bubble._miniBarIndex ?? 0) % tasks.length;
        const t = tasks[idx];
        const label = this._urgencyLabel(t._urgency, t.dueDate);
        const title = (t.title || '无标题').replace(/\s+/g, ' ').trim();
        const shortTitle = title.length > 16 ? title.slice(0, 16) + '…' : title;

        miniText.textContent = `⚠ ${label} ${shortTitle}`;
        miniBar.className = 'urgent-mini-bar urgent-level-' + t._urgency;
    }

    _rotateUrgentMiniBar(bubble) {
        const tasks = bubble._urgentTasks;
        if (!tasks || tasks.length <= 1) return;
        const miniBar = document.getElementById('urgent-mini-bar');
        if (miniBar) miniBar.classList.add('urgent-mini-rotating');
        bubble._miniBarIndex = (bubble._miniBarIndex ?? 0) + 1;
        this._updateUrgentMiniBar(bubble);
        setTimeout(() => {
            if (miniBar) miniBar.classList.remove('urgent-mini-rotating');
        }, 400);
    }

    // ==================== 今日推荐阅读 ====================

    async initReadingRecommendation() {
        const wrapper = document.getElementById('reading-reco-wrapper');
        if (!wrapper) return;

        if (!this._bookmarkRAG) {
            this._bookmarkRAG = new BookmarkRAG();
            await this._bookmarkRAG.init();
        }

        const rag = this._bookmarkRAG;
        if (!rag.isConfigured()) return;

        const reviewQueue = rag.getTodayReview();
        const unreviewed = rag.getUnreviewed(5);

        const hasReviewItems = reviewQueue.length > 0 || unreviewed.length > 0;
        if (!hasReviewItems) return;

        wrapper.style.display = '';
        this._renderReadingRecommendation(reviewQueue, unreviewed);
        this._bindReadingRecoEvents();
    }

    _renderReadingRecommendation(reviewQueue, unreviewed) {
        const body = document.getElementById('reading-reco-body');
        const countEl = document.getElementById('reading-reco-count');
        if (!body) return;

        const totalDue = reviewQueue.length;
        if (countEl) {
            countEl.textContent = totalDue > 0 ? `${totalDue} 条待复习` : `${unreviewed.length} 条新书签`;
        }

        if (reviewQueue.length === 0 && unreviewed.length === 0) {
            body.innerHTML = `<div class="reco-empty"><i class="fas fa-check-circle"></i><span>今日复习已完成</span></div>`;
            return;
        }

        let html = '';

        if (reviewQueue.length > 0) {
            for (const bm of reviewQueue) {
                html += this._renderRecoCard(bm, true);
            }
        }

        if (unreviewed.length > 0 && reviewQueue.length === 0) {
            html += `<div style="padding: 6px 12px; font-size: 11px; color: rgba(255,255,255,0.35);">
                <i class="fas fa-lightbulb" style="margin-right: 4px;"></i>以下书签尚未加入复习计划
            </div>`;
            for (const bm of unreviewed) {
                html += this._renderRecoCard(bm, false);
            }
            html += `<div style="text-align: center; padding: 8px;">
                <button class="reco-enable-btn" id="reco-enable-review-btn">
                    <i class="fas fa-play-circle" style="margin-right: 4px;"></i>启用间隔复习
                </button>
            </div>`;
        }

        body.innerHTML = html;
    }

    _renderRecoCard(bm, isReview) {
        const templateName = bm.srs?.template
            ? (BookmarkSRS.TEMPLATES[bm.srs.template]?.name || '默认')
            : '';
        const nextReview = bm.srs ? BookmarkSRS.formatNextReview(bm.srs.nextReview) : '';
        const lastReview = bm.srs ? BookmarkSRS.formatLastReview(bm.srs.lastReview) : '';

        const feedbackBtns = isReview ? `
            <div class="reco-card-actions">
                <button class="reco-feedback-btn fb-archive" data-quality="0" data-bm-id="${bm.id}" title="归档"><i class="fas fa-box-archive"></i></button>
                <button class="reco-feedback-btn fb-again" data-quality="1" data-bm-id="${bm.id}" title="不熟"><i class="fas fa-rotate-left"></i></button>
                <button class="reco-feedback-btn fb-later" data-quality="2" data-bm-id="${bm.id}" title="稍后"><i class="fas fa-clock"></i></button>
                <button class="reco-feedback-btn fb-good" data-quality="3" data-bm-id="${bm.id}" title="已读"><i class="fas fa-check"></i></button>
                <button class="reco-card-task-btn" data-bm-title="${this._escHtml(bm.title)}" data-bm-url="${this._escHtml(bm.url)}" title="转为任务"><i class="fas fa-plus-circle"></i></button>
            </div>
        ` : `
            <div class="reco-card-actions">
                <button class="reco-card-task-btn" data-bm-title="${this._escHtml(bm.title)}" data-bm-url="${this._escHtml(bm.url)}" title="转为任务"><i class="fas fa-plus-circle"></i></button>
            </div>
        `;

        const metaInfo = isReview
            ? `<span>${lastReview !== '从未' ? '上次: ' + lastReview : '首次复习'}</span>`
            : `<span>${this._escHtml(bm.domain)}</span>`;

        return `
        <div class="reco-card" data-bm-id="${bm.id}" data-url="${this._escHtml(bm.url)}">
            <img class="reco-card-favicon" src="https://www.google.com/s2/favicons?domain=${this._escHtml(bm.domain)}&sz=32" alt="" loading="lazy">
            <div class="reco-card-info">
                <div class="reco-card-title">${this._escHtml(bm.title)}</div>
                <div class="reco-card-meta">
                    ${metaInfo}
                    ${templateName ? `<span class="reco-card-template">${templateName}</span>` : ''}
                </div>
            </div>
            ${feedbackBtns}
        </div>`;
    }

    _bindReadingRecoEvents() {
        const toggle = document.getElementById('reading-reco-toggle');
        const body = document.getElementById('reading-reco-body');
        if (toggle && body) {
            toggle.addEventListener('click', () => {
                body.classList.toggle('collapsed');
                const icon = toggle.querySelector('i');
                if (icon) {
                    icon.className = body.classList.contains('collapsed')
                        ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
                }
            });
        }

        this._bindRecoCardEvents();

        const enableBtn = document.getElementById('reco-enable-review-btn');
        if (enableBtn) {
            enableBtn.addEventListener('click', async () => {
                const rag = this._bookmarkRAG;
                if (!rag) return;
                const count = await rag.enableReview('regular');
                this.showToast(`已为 ${count} 条书签启用间隔复习`);
                const queue = rag.getTodayReview();
                const unreviewed = rag.getUnreviewed(5);
                this._renderReadingRecommendation(queue, unreviewed);
                this._bindRecoCardEvents();
            });
        }
    }

    _bindRecoCardEvents() {
        const body = document.getElementById('reading-reco-body');
        if (!body) return;

        body.querySelectorAll('.reco-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.reco-feedback-btn') || e.target.closest('.reco-card-task-btn')) return;
                const url = card.dataset.url;
                if (url) window.open(url, '_blank');
            });
        });

        body.querySelectorAll('.reco-feedback-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const bmId = btn.dataset.bmId;
                const quality = parseInt(btn.dataset.quality, 10);
                await this._handleReviewFeedback(bmId, quality, btn.closest('.reco-card'));
            });
        });

        body.querySelectorAll('.reco-card-task-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._createTaskFromBookmark(btn.dataset.bmTitle, btn.dataset.bmUrl);
            });
        });
    }

    async _handleReviewFeedback(bookmarkId, quality, cardEl) {
        const rag = this._bookmarkRAG;
        if (!rag) return;

        const result = await rag.reviewBookmark(bookmarkId, quality);
        if (!result) return;

        const meta = BookmarkSRS.QUALITY_META[quality];
        if (meta) {
            this.showToast(`${meta.label}：${BookmarkSRS.formatNextReview(result.srs?.nextReview)}`);
        }

        if (cardEl) {
            cardEl.classList.add('dismissing');
            cardEl.addEventListener('animationend', () => {
                cardEl.remove();
                this._updateRecoCount();
            }, { once: true });
        }
    }

    _updateRecoCount() {
        const body = document.getElementById('reading-reco-body');
        const countEl = document.getElementById('reading-reco-count');
        if (!body || !countEl) return;

        const remaining = body.querySelectorAll('.reco-card:not(.dismissing)').length;
        if (remaining === 0) {
            body.innerHTML = `<div class="reco-empty"><i class="fas fa-check-circle"></i><span>今日复习已完成</span></div>`;
            countEl.textContent = '已完成';
        } else {
            countEl.textContent = `${remaining} 条待复习`;
        }
    }

    _createTaskFromBookmark(title, url) {
        this.showSidebarForm(null, {});
        setTimeout(() => {
            const titleInput = document.getElementById('sidebar-task-title');
            if (titleInput) titleInput.value = `阅读: ${title || ''}`;
            const textInput = document.getElementById('sidebar-task-text');
            if (textInput) textInput.value = url || '';
        }, 100);
        this.showToast('已填入书签信息，请确认保存');
    }
}

// 将备忘录管理器设置为全局变量
window.memoManager = new MemoManager();
