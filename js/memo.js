/**
 * 备忘录功能模块
 * 版本: 1.4.0
 * 功能: 提供备忘录的添加、编辑、删除和分类管理功能
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
    }

    /**
     * 初始化备忘录管理器
     */
    init() {
        console.log('开始初始化备忘录管理器...');
        
        // 加载备忘录数据
        Promise.all([
            this.loadMemos(),
            this.loadCategories(),
            this.loadTags()
        ]).then(() => {
            console.log('备忘录数据加载完成，开始创建UI');
            console.log('备忘录数量:', this.memos.length);
            console.log('分类数量:', this.categories.length);
            console.log('标签数量:', this.tags.length);
            
            try {
                // 创建备忘录UI
                this.createMemoUI();
                console.log('备忘录UI创建完成');
                
                // 初始化键盘快捷键
                this.initKeyboardShortcuts();
                console.log('键盘快捷键初始化完成');
                
                // 更新排序选项的名称
                this.updateSortOptionNames();
                console.log('排序选项名称更新完成');
                
                console.log('备忘录管理器初始化完成');
                this.initialized = true;
            } catch (error) {
                console.error('备忘录UI创建过程中发生错误:', error);
            }
        }).catch(error => {
            console.error('备忘录数据加载失败:', error);
        });
    }

    /**
     * 从Chrome存储中加载备忘录
     */
    async loadMemos() {
        try {
            // 从设置中加载备忘录
            const settings = window.settingsManager.settings;
            
            if (!settings) {
                console.warn('设置管理器未初始化或设置为空');
                this.memos = [];
                return;
            }
            
            // 检查memos是否为数组
            if (Array.isArray(settings.memos)) {
                this.memos = settings.memos;
            } else {
                console.warn('备忘录数据不是数组格式，将使用空数组');
                this.memos = [];
            }
            
            // 验证每个备忘录对象的结构
            this.memos = this.memos.map(memo => {
                // 确保每个备忘录都有必要的属性
                return {
                    id: memo.id || this.generateId(),
                    title: memo.title || '',
                    text: memo.text || '',
                    completed: !!memo.completed,
                    createdAt: memo.createdAt || Date.now(),
                    updatedAt: memo.updatedAt || Date.now(),
                    categoryId: memo.categoryId || null,
                    tags: Array.isArray(memo.tags) ? memo.tags : [],
                    priority: memo.priority || 'normal',
                    dueDate: memo.dueDate || null
                };
            });
            
            console.log('备忘录加载成功，数量:', this.memos.length);
        } catch (error) {
            console.error('加载备忘录失败', error);
            this.memos = [];
        }
    }

    /**
     * 保存备忘录到Chrome存储
     */
    async saveMemos() {
        try {
            // 保存备忘录到设置
            window.settingsManager.settings.memos = this.memos;
            await window.settingsManager.saveSettings();
            console.log('备忘录保存成功');
        } catch (error) {
            console.error('保存备忘录失败', error);
        }
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
        return true;
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
     */
    toggle() {
        try {
            console.log('切换备忘录显示状态...');
            
            // 检查是否已经初始化
            if (!this.initialized) {
                console.log('备忘录管理器尚未初始化，正在初始化...');
                this.init().then(() => {
                    this.toggle();
                });
                return;
            }
            
            // 检查是否存在碎片式备忘录
            const existingMemos = document.querySelectorAll('.memo-item');
            
            if (existingMemos.length > 0) {
                // 如果已经有碎片式备忘录，则隐藏它们
                console.log('隐藏碎片式备忘录...');
                existingMemos.forEach(memo => memo.remove());
                
                // 移除搜索和添加按钮
                const searchButton = document.querySelector('.memo-search-button');
                if (searchButton) searchButton.remove();
                
                const searchContainer = document.querySelector('.memo-search-container');
                if (searchContainer) searchContainer.remove();
                
                const addButton = document.querySelector('.memo-add-button');
                if (addButton) addButton.remove();
            } else {
                // 否则显示碎片式备忘录
                console.log('显示碎片式备忘录...');
                this.renderFloatingTaskList();
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
            
            // 创建搜索和筛选区域
            const filterContainer = document.createElement('div');
            filterContainer.className = 'filter-container';
            
            // 创建搜索输入框
            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.className = 'search-input';
            searchInput.placeholder = window.i18nManager.getText('searchTasks') || '搜索备忘录...';
            searchInput.addEventListener('input', () => this.filterTasks());
            
            // 创建状态筛选下拉菜单
            const statusFilter = document.createElement('select');
            statusFilter.className = 'status-filter';
            statusFilter.addEventListener('change', () => this.filterTasks());
            
            // 添加状态选项
            const allStatusOption = document.createElement('option');
            allStatusOption.value = 'all';
            allStatusOption.textContent = window.i18nManager.getText('allTasks') || '所有任务';
            statusFilter.appendChild(allStatusOption);
            
            const completedOption = document.createElement('option');
            completedOption.value = 'completed';
            completedOption.textContent = window.i18nManager.getText('completedTasks') || '已完成';
            statusFilter.appendChild(completedOption);
            
            const uncompletedOption = document.createElement('option');
            uncompletedOption.value = 'uncompleted';
            uncompletedOption.textContent = window.i18nManager.getText('uncompletedTasks') || '未完成';
            statusFilter.appendChild(uncompletedOption);
            
            // 添加筛选组件到筛选容器
            filterContainer.appendChild(searchInput);
            filterContainer.appendChild(statusFilter);
            
            // 创建任务列表
            const taskList = document.createElement('div');
            taskList.className = 'task-list';
            
            // 添加筛选容器和任务列表到内容容器
            container.appendChild(filterContainer);
            container.appendChild(taskList);
            
            // 渲染任务列表
            this.filterTasks();
            
            console.log('备忘录内容创建完成');
        } catch (error) {
            console.error('创建备忘录内容时发生错误:', error);
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
                { key: 'n', ctrlKey: true, action: this.showMemoForm.bind(this), description: 'shortcutAdd' },
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
