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
            
            // 检查备份提醒
            this.checkBackupReminder();
            
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
                    // 过滤掉损坏的图片数据
                    if (!img || (!img.thumbnail && !img.fullImage)) {
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
                    <button onclick="window.memoManager.init()">重新加载</button>
                </div>
            `;
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
            <select class="sidebar-category-select" id="sidebar-category-select">
                <option value="all">全部分类</option>
                ${this.categories.map(cat => `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`).join('')}
            </select>
        `;
        
        // 创建任务列表容器
        const taskList = document.createElement('div');
        taskList.className = 'sidebar-task-list';
        taskList.id = 'sidebar-task-list';
        
        // 创建任务表单弹窗
        const formModal = document.createElement('div');
        formModal.className = 'sidebar-form-modal hidden';
        formModal.id = 'sidebar-form-modal';
        formModal.innerHTML = `
            <div class="sidebar-form-content">
                <div class="sidebar-form-header">
                    <h3 id="sidebar-form-title">新增任务</h3>
                    <button class="sidebar-form-close" id="sidebar-form-close">&times;</button>
                </div>
                <div class="sidebar-form-body">
                    <div class="form-group">
                        <label for="sidebar-task-title">标题</label>
                        <input type="text" id="sidebar-task-title" placeholder="输入任务标题..." required>
                    </div>
                    <div class="form-group">
                        <label for="sidebar-task-text">详情</label>
                        <textarea id="sidebar-task-text" placeholder="输入任务详情..." rows="3"></textarea>
                    </div>
                    <div class="form-group">
                        <label>图片附件</label>
                        <div class="image-upload-area" id="image-upload-area">
                            <input type="file" id="sidebar-task-images" accept="image/*" multiple hidden>
                            <div class="image-preview-list" id="image-preview-list"></div>
                            <button type="button" class="image-upload-btn" id="image-upload-btn">
                                <i class="fas fa-image"></i>
                                <span>添加图片</span>
                            </button>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="sidebar-task-priority">优先级</label>
                            <select id="sidebar-task-priority">
                                <option value="none">无</option>
                                <option value="low">低</option>
                                <option value="medium">中</option>
                                <option value="high">高</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="sidebar-task-due">截止日期</label>
                            <input type="date" id="sidebar-task-due">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="sidebar-task-category">分类</label>
                        <select id="sidebar-task-category">
                            <option value="">无分类</option>
                            ${this.categories.map(cat => `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`).join('')}
                        </select>
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
                <div class="sidebar-form-footer">
                    <button class="btn-cancel" id="sidebar-form-cancel">取消</button>
                    <button class="btn-save" id="sidebar-form-save">保存</button>
                </div>
            </div>
        `;
        
        // 组装内容
        sidebarContent.appendChild(toolbar);
        sidebarContent.appendChild(filterBar);
        sidebarContent.appendChild(taskList);
        sidebarContent.appendChild(formModal);
        
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
        
        // 分类筛选
        const categorySelect = document.getElementById('sidebar-category-select');
        if (categorySelect) {
            categorySelect.addEventListener('change', () => this.renderSidebarTaskList());
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
        
        // 图片上传按钮
        const imageUploadBtn = document.getElementById('image-upload-btn');
        const imageInput = document.getElementById('sidebar-task-images');
        if (imageUploadBtn && imageInput) {
            imageUploadBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', (e) => this.handleImageUpload(e));
        }
    }
    
    /**
     * 处理图片上传
     */
    async handleImageUpload(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        const previewList = document.getElementById('image-preview-list');
        if (!previewList) return;
        
        // 初始化临时图片数组
        if (!this.tempImages) this.tempImages = [];
        
        for (const file of files) {
            // 验证文件类型
            if (!file.type.startsWith('image/')) continue;
            
            // 验证文件大小（最大 5MB）
            if (file.size > 5 * 1024 * 1024) {
                console.warn('图片文件过大，已跳过:', file.name);
                continue;
            }
            
            try {
                // 生成缩略图（用于列表显示）和大图（用于灯箱查看）
                const thumbnail = await this.compressImage(file, 80, 0.6);  // 小缩略图
                const fullImage = await this.compressImage(file, 800, 0.85);  // 大图用于查看
                const imageId = this.generateId();
                
                // 存储到临时数组
                this.tempImages.push({
                    id: imageId,
                    file: file,
                    thumbnail: thumbnail,
                    fullImage: fullImage
                });
                
                // 创建预览元素
                const previewItem = document.createElement('div');
                previewItem.className = 'image-preview-item';
                previewItem.dataset.imageId = imageId;
                previewItem.innerHTML = `
                    <img src="${thumbnail}" alt="预览">
                    <button type="button" class="remove-image" title="移除">
                        <i class="fas fa-times"></i>
                    </button>
                `;
                
                // 绑定移除事件
                previewItem.querySelector('.remove-image').addEventListener('click', () => {
                    this.removePreviewImage(imageId);
                });
                
                previewList.appendChild(previewItem);
            } catch (err) {
                console.error('图片处理失败:', err);
            }
        }
        
        // 清空 input 以便再次选择同一文件
        event.target.value = '';
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
        }, 16); // 约等于一帧的时间
    }
    
    /**
     * 实际执行侧边栏任务列表渲染
     */
    _doRenderSidebarTaskList() {
        const container = document.getElementById('sidebar-task-list');
        if (!container) return;
        
        const searchInput = document.getElementById('sidebar-search');
        const filterSelect = document.getElementById('sidebar-filter-select');
        
        const categorySelect = document.getElementById('sidebar-category-select');
        
        const searchText = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filterValue = filterSelect ? filterSelect.value : 'all';
        const categoryValue = categorySelect ? categorySelect.value : 'all';
        
        // 筛选任务
        let filteredMemos = [...this.memos];
        
        // 文本搜索
        if (searchText) {
            filteredMemos = filteredMemos.filter(memo => 
                (memo.title || '').toLowerCase().includes(searchText) ||
                (memo.text || '').toLowerCase().includes(searchText)
            );
        }
        
        // 分类筛选
        if (categoryValue !== 'all') {
            filteredMemos = filteredMemos.filter(m => m.categoryId === categoryValue);
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
            });

            if (shouldCollapse) {
                lazyGroups.push({ tasks, tasksContainer, startIndex, group });
            } else {
                eagerGroups.push({ tasks, tasksContainer, startIndex });
            }
        });
        
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
        
        // 本周完成情况（迷你版）
        const weekView = this.getHabitWeekCompletion(habit);
        const weekDotsHtml = weekView.days.map(day => {
            const cls = ['hc-dot'];
            if (day.completed) cls.push('done');
            if (day.isToday) cls.push('now');
            return `<span class="${cls.join(' ')}"></span>`;
        }).join('');
        
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
            </div>
            <div class="hc-week">${weekDotsHtml}</div>
        `;
        
        // 打卡按钮
        card.querySelector('.hc-check').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleHabitCompletion(habit.id);
        });
        
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
        let progressHtml = '';
        if (task.progress !== null && task.progress !== undefined) {
            const percentage = parseInt(task.progress) || 0;
            let progressClass = 'low';
            if (percentage === 100) progressClass = 'complete';
            else if (percentage >= 60) progressClass = 'high';
            else if (percentage >= 30) progressClass = 'medium';
            
            progressHtml = `
                <div class="task-progress">
                    <div class="task-progress-bar">
                        <div class="task-progress-fill ${progressClass}" style="width: ${percentage}%"></div>
                    </div>
                    <div class="task-progress-text">
                        <span class="task-progress-percentage">${percentage}%</span>
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
                ${imagesHtml}
                <div class="task-meta">
                    ${categoryName ? `<span class="task-category-tag"><i class="fas fa-folder"></i> ${this.escapeHtml(categoryName)}</span>` : ''}
                    ${task.dueDate ? `<span class="task-due ${isOverdue ? 'overdue' : ''}"><i class="far fa-calendar"></i> ${task.dueDate}</span>` : ''}
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
        
        // 点击任务项编辑
        item.addEventListener('click', () => this.showSidebarForm(task));
        
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
                        if (imageData && imageData.thumbnail) {
                            // 使用 requestIdleCallback 在空闲时加载，避免阻塞
                            const loadImage = () => {
                                img.src = imageData.thumbnail;
                                img.classList.remove('task-image-lazy');
                            };
                            if ('requestIdleCallback' in window) {
                                requestIdleCallback(loadImage, { timeout: 500 });
                            } else {
                                setTimeout(loadImage, 50);
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
                if (imageData && imageData.thumbnail) {
                    setTimeout(() => {
                        img.src = imageData.thumbnail;
                        img.classList.remove('task-image-lazy');
                    }, 100);
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
        
        // 获取当前图片的大图（兼容旧数据）
        const getFullImage = (img) => img.fullImage || img.thumbnail;
        
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
                    version: '1.6.0 ',
                    exportDate: new Date().toISOString(),
                    type: 'completed_tasks',
                    memos: this.memos.filter(m => m.completed),
                    categories: this.categories,
                    tags: this.tags
                };
                filename = `tasks-completed-${this.formatLocalDateYMD(new Date())}.json`;
            } else {
                dataToExport = {
                    version: '1.6.0',
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
            dueDate: memo.dueDate || null,
            images: Array.isArray(memo.images) ? memo.images : [],
            progress: memo.progress !== undefined ? memo.progress : null,
            // 重复任务配置
            recurrence: memo.recurrence || null,
            // 习惯追踪数据
            habit: memo.habit || null,
            // 习惯卡片配置
            habitCard: memo.habitCard || null
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
                    this.showToast('💾 您已超过一周未备份数据，建议点击备份按钮导出数据', 6000);
                }, 3000);
            }
        }
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
        const viewMonth = this.calendarViewDate.getMonth(); // 0-11

        const taskMap = this.buildTaskMapByCreatedDate();
        const selectedKey = this.calendarSelectedDate;
        const selectedTasks = taskMap.get(selectedKey) || [];

        const monthLabel = `${viewYear}年${viewMonth + 1}月`;

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
                        ${this.renderCalendarMonthGrid(viewYear, viewMonth, taskMap)}
                    </div>
                    <div class="calendar-details">
                        <div class="calendar-details-header">
                            <div class="calendar-details-date">${selectedKey}</div>
                            <div class="calendar-details-subtitle">共 ${selectedTasks.length} 项任务</div>
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

            cells.push(`
                <div class="calendar-day ${isOutside ? 'outside' : ''} ${selected ? 'selected' : ''} ${isToday ? 'today' : ''}"
                     data-date="${key}">
                    <div class="calendar-day-number">${dayNumber}</div>
                    <div class="calendar-day-lunar ${lunarInfo.type}">${lunarInfo.text}</div>
                    ${count > 0 ? `<div class="calendar-day-badge">${count}</div>` : ''}
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
            const createdTime = task.createdAt ? this.formatLocalTimeHM(task.createdAt) : '';
            const title = this.escapeHtml(task.title || '无标题');
            const text = task.text ? this.escapeHtml(task.text.substring(0, 80)) : '';
            const categoryName = task.categoryId ? this.escapeHtml(this.getCategoryName(task.categoryId) || '') : '';
            const isCompleted = task.completed;
            
            return `
                <div class="calendar-task-item ${isCompleted ? 'completed' : ''}" data-task-id="${task.id}">
                    <div class="calendar-task-status">
                        <i class="fas ${isCompleted ? 'fa-check-circle' : 'fa-circle'}"></i>
                    </div>
                    <div class="calendar-task-main">
                        <div class="calendar-task-title">${title}</div>
                        ${text ? `<div class="calendar-task-desc">${text}${task.text && task.text.length > 80 ? '...' : ''}</div>` : ''}
                        <div class="calendar-task-meta">
                            ${createdTime ? `<span class="calendar-task-time"><i class="far fa-clock"></i> ${createdTime}</span>` : ''}
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
        // 移除已有的面板
        const existingPanel = document.getElementById('category-manager');
        if (existingPanel) existingPanel.remove();
        
        // 创建分类管理面板
        const panel = document.createElement('div');
        panel.id = 'category-manager';
        panel.className = 'category-manager';
        panel.innerHTML = `
            <div class="category-manager-overlay"></div>
            <div class="category-manager-content">
                <div class="category-manager-header">
                    <h3>分类管理</h3>
                    <button class="category-manager-close" id="category-manager-close">&times;</button>
                </div>
                <div class="category-manager-body">
                    <div class="category-add-form">
                        <input type="text" id="new-category-name" placeholder="输入分类名称..." maxlength="20">
                        <input type="color" id="new-category-color" value="#64b4ff" title="选择颜色">
                        <button id="add-category-btn" title="添加分类">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <div class="category-list" id="category-list">
                        ${this.renderCategoryManagerList()}
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // 绑定事件
        const closeBtn = panel.querySelector('#category-manager-close');
        const overlay = panel.querySelector('.category-manager-overlay');
        const addBtn = panel.querySelector('#add-category-btn');
        const nameInput = panel.querySelector('#new-category-name');
        
        const closePanel = () => panel.remove();
        closeBtn.addEventListener('click', closePanel);
        overlay.addEventListener('click', closePanel);
        
        // 添加分类
        addBtn.addEventListener('click', () => this.addNewCategory(panel));
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.addNewCategory(panel);
        });
        
        // 绑定已有分类项的事件
        this.bindCategoryItemEvents(panel);
        
        // 显示动画
        requestAnimationFrame(() => panel.classList.add('active'));
        nameInput.focus();
    }
    
    /**
     * 渲染分类管理列表（返回 HTML 字符串）
     */
    renderCategoryManagerList() {
        if (this.categories.length === 0) {
            return '<div class="category-empty">暂无分类，请添加</div>';
        }
        
        return this.categories.map(cat => `
            <div class="category-item" data-id="${cat.id}">
                <span class="category-color" style="background: ${cat.color || '#64b4ff'}"></span>
                <span class="category-name">${this.escapeHtml(cat.name)}</span>
                <div class="category-actions">
                    <button class="category-edit-btn" data-id="${cat.id}" title="编辑">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="category-delete-btn" data-id="${cat.id}" title="删除">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }
    
    /**
     * 添加新分类
     */
    async addNewCategory(panel) {
        const nameInput = panel.querySelector('#new-category-name');
        const colorInput = panel.querySelector('#new-category-color');
        const name = nameInput.value.trim();
        
        if (!name) {
            nameInput.classList.add('input-error');
            setTimeout(() => nameInput.classList.remove('input-error'), 800);
            return;
        }
        
        // 检查重复
        if (this.categories.some(c => c.name === name)) {
            nameInput.classList.add('input-error');
            nameInput.placeholder = '分类已存在';
            setTimeout(() => {
                nameInput.classList.remove('input-error');
                nameInput.placeholder = '输入分类名称...';
            }, 1500);
            return;
        }
        
        // 添加分类
        const newCategory = {
            id: this.generateId(),
            name: name,
            color: colorInput.value
        };
        this.categories.push(newCategory);
        await this.saveCategories();
        
        // 更新界面
        const listEl = panel.querySelector('#category-list');
        listEl.innerHTML = this.renderCategoryManagerList();
        this.bindCategoryItemEvents(panel);
        
        // 更新分类筛选下拉框
        this.updateCategorySelects();
        
        // 清空输入
        nameInput.value = '';
        nameInput.focus();
    }
    
    /**
     * 绑定分类项事件
     */
    bindCategoryItemEvents(panel) {
        const listEl = panel.querySelector('#category-list');
        
        // 编辑按钮
        listEl.querySelectorAll('.category-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this.editCategory(id, panel);
            });
        });
        
        // 删除按钮
        listEl.querySelectorAll('.category-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if (confirm('确定要删除这个分类吗？相关任务将变为无分类。')) {
                    await this.deleteCategoryById(id);
                    listEl.innerHTML = this.renderCategoryManagerList();
                    this.bindCategoryItemEvents(panel);
                    this.updateCategorySelects();
                    this.renderSidebarTaskList();
                }
            });
        });
    }
    
    /**
     * 编辑分类
     */
    editCategory(categoryId, panel) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;
        
        const itemEl = panel.querySelector(`.category-item[data-id="${categoryId}"]`);
        if (!itemEl) return;
        
        // 替换为编辑表单
        itemEl.innerHTML = `
            <input type="color" class="edit-category-color" value="${category.color || '#64b4ff'}">
            <input type="text" class="edit-category-name" value="${this.escapeHtml(category.name)}" maxlength="20">
            <div class="category-actions">
                <button class="category-save-btn" title="保存">
                    <i class="fas fa-check"></i>
                </button>
                <button class="category-cancel-btn" title="取消">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        const nameInput = itemEl.querySelector('.edit-category-name');
        const colorInput = itemEl.querySelector('.edit-category-color');
        const saveBtn = itemEl.querySelector('.category-save-btn');
        const cancelBtn = itemEl.querySelector('.category-cancel-btn');
        
        nameInput.focus();
        nameInput.select();
        
        // 保存
        const saveEdit = async () => {
            const newName = nameInput.value.trim();
            if (!newName) return;
            
            category.name = newName;
            category.color = colorInput.value;
            await this.saveCategories();
            
            const listEl = panel.querySelector('#category-list');
            listEl.innerHTML = this.renderCategoryManagerList();
            this.bindCategoryItemEvents(panel);
            this.updateCategorySelects();
            this.renderSidebarTaskList();
        };
        
        saveBtn.addEventListener('click', saveEdit);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') cancelEdit();
        });
        
        // 取消
        const cancelEdit = () => {
            const listEl = panel.querySelector('#category-list');
            listEl.innerHTML = this.renderCategoryManagerList();
            this.bindCategoryItemEvents(panel);
        };
        cancelBtn.addEventListener('click', cancelEdit);
    }
    
    /**
     * 删除分类
     */
    async deleteCategoryById(categoryId) {
        this.categories = this.categories.filter(c => c.id !== categoryId);
        await this.saveCategories();
        
        // 清除使用该分类的任务的分类ID
        let needSave = false;
        this.memos.forEach(memo => {
            if (memo.categoryId === categoryId) {
                memo.categoryId = null;
                needSave = true;
            }
        });
        if (needSave) {
            await this.saveMemos();
        }
    }
    
    /**
     * 更新分类选择下拉框
     */
    updateCategorySelects() {
        // 更新筛选下拉框
        const filterSelect = document.getElementById('sidebar-category-select');
        if (filterSelect) {
            const currentValue = filterSelect.value;
            filterSelect.innerHTML = `
                <option value="all">全部分类</option>
                ${this.categories.map(cat => `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`).join('')}
            `;
            filterSelect.value = currentValue;
        }
        
        // 更新任务表单分类下拉框
        const taskCategorySelect = document.getElementById('sidebar-task-category');
        if (taskCategorySelect) {
            const currentValue = taskCategorySelect.value;
            taskCategorySelect.innerHTML = `
                <option value="">无分类</option>
                ${this.categories.map(cat => `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`).join('')}
            `;
            taskCategorySelect.value = currentValue;
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
     */
    showToast(message, duration = 2000) {
        // 移除已有的 toast
        const existingToast = document.querySelector('.memo-toast');
        if (existingToast) existingToast.remove();
        
        const toast = document.createElement('div');
        toast.className = 'memo-toast';
        toast.innerHTML = `<i class="fas fa-check-circle"></i> ${this.escapeHtml(message)}`;
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
        const dueInput = document.getElementById('sidebar-task-due');
        const categorySelect = document.getElementById('sidebar-task-category');
        const previewList = document.getElementById('image-preview-list');
        
        // 进度相关元素（纯百分比模式）
        const progressEnable = document.getElementById('sidebar-task-progress-enable');
        const progressInputs = document.getElementById('progress-inputs');
        const progressSlider = document.getElementById('sidebar-task-progress-slider');
        const progressPercent = document.getElementById('sidebar-task-progress-percent');
        
        // 清空临时图片
        this.tempImages = [];
        if (previewList) previewList.innerHTML = '';
        
        // 更新分类选项
        if (categorySelect) {
            categorySelect.innerHTML = `
                <option value="">无分类</option>
                ${this.categories.map(cat => `<option value="${cat.id}">${this.escapeHtml(cat.name)}</option>`).join('')}
            `;
        }
        
        // 重复任务相关元素
        const recurrenceSelect = document.getElementById('sidebar-task-recurrence');
        const habitIconInput = document.getElementById('sidebar-task-habit-icon');
        
        if (task) {
            titleEl.textContent = task.recurrence?.enabled ? '编辑习惯' : '编辑任务';
            modal.dataset.taskId = task.id;
            titleInput.value = task.title || '';
            textInput.value = task.text || '';
            prioritySelect.value = task.priority || 'none';
            dueInput.value = task.dueDate || '';
            if (categorySelect) categorySelect.value = task.categoryId || '';
            
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
            
            // 加载已有图片
            if (task.images && task.images.length > 0 && previewList) {
                task.images.forEach(img => {
                    this.tempImages.push({
                        id: img.id,
                        thumbnail: img.thumbnail,
                        fullImage: img.fullImage || img.thumbnail,  // 兼容旧数据
                        existing: true  // 标记为已有图片
                    });
                    
                    const previewItem = document.createElement('div');
                    previewItem.className = 'image-preview-item';
                    previewItem.dataset.imageId = img.id;
                    previewItem.innerHTML = `
                        <img src="${img.thumbnail}" alt="预览">
                        <button type="button" class="remove-image" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    `;
                    
                    previewItem.querySelector('.remove-image').addEventListener('click', () => {
                        this.removePreviewImage(img.id);
                    });
                    
                    previewList.appendChild(previewItem);
                });
            }
        } else {
            titleEl.textContent = options.recurrenceType === 'daily' ? '新增习惯' : '新增任务';
            delete modal.dataset.taskId;
            titleInput.value = '';
            textInput.value = '';
            prioritySelect.value = 'none';
            dueInput.value = this.getTodayDate();
            if (categorySelect) categorySelect.value = '';
            
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
        }
        
        modal.classList.remove('hidden');
        titleInput.focus();
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
     * 隐藏侧边栏任务表单
     */
    hideSidebarForm() {
        const modal = document.getElementById('sidebar-form-modal');
        if (modal) {
            modal.classList.add('hidden');
            delete modal.dataset.taskId;
        }
        // 清空临时图片
        this.tempImages = [];
        const previewList = document.getElementById('image-preview-list');
        if (previewList) previewList.innerHTML = '';
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
        const categorySelect = document.getElementById('sidebar-task-category');
        
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
        
        // 处理图片数据（保存缩略图和大图）
        const images = this.tempImages ? this.tempImages.map(img => ({
            id: img.id,
            thumbnail: img.thumbnail,
            fullImage: img.fullImage || img.thumbnail  // 兼容旧数据
        })) : [];
        
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
        
        const taskData = {
            title: title,
            text: textInput.value.trim(),
            priority: prioritySelect.value,
            dueDate: dueInput.value || null,
            images: images,
            categoryId: categorySelect ? categorySelect.value || null : null,
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
        this.tempImages = []; // 清空临时图片
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
            // 如果是在输入框中，不处理快捷键
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                // 表单中的特殊快捷键处理
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
}

// 将备忘录管理器设置为全局变量
window.memoManager = new MemoManager();
