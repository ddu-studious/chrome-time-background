/**
 * 测试任务搜索和筛选功能
 */

// 模拟任务数据
const mockTasks = [
    {
        id: '1',
        title: '工作任务1',
        text: '完成项目报告',
        completed: false,
        created: Date.now() - 86400000 * 3, // 3天前
        categoryId: 'work',
        tagIds: ['important', 'project']
    },
    {
        id: '2',
        title: '生活任务1',
        text: '购买日用品',
        completed: true,
        created: Date.now() - 86400000 * 2, // 2天前
        categoryId: 'life',
        tagIds: ['shopping']
    },
    {
        id: '3',
        title: '学习任务1',
        text: '学习JavaScript高级特性',
        completed: false,
        created: Date.now() - 86400000, // 1天前
        categoryId: 'study',
        tagIds: ['important', 'javascript']
    },
    {
        id: '4',
        title: '其他任务',
        text: '整理文件夹',
        completed: false,
        created: Date.now(),
        categoryId: 'other',
        tagIds: []
    },
    {
        id: '5',
        title: '无分类任务',
        text: '临时记录',
        completed: true,
        created: Date.now(),
        categoryId: null,
        tagIds: []
    }
];

// 模拟分类数据
const mockCategories = [
    { id: 'work', name: '工作', color: '#4285f4' },
    { id: 'life', name: '生活', color: '#34a853' },
    { id: 'study', name: '学习', color: '#fbbc05' },
    { id: 'other', name: '其他', color: '#ea4335' }
];

// 模拟标签数据
const mockTags = [
    { id: 'important', name: '重要', color: '#ff5252' },
    { id: 'project', name: '项目', color: '#7c4dff' },
    { id: 'shopping', name: '购物', color: '#00bcd4' },
    { id: 'javascript', name: 'JavaScript', color: '#ffc107' }
];

// 模拟Chrome存储API
const mockChromeStorage = {
    data: {
        memos: mockTasks,
        categories: mockCategories,
        tags: mockTags
    },
    get: function(keys, callback) {
        const result = {};
        if (typeof keys === 'string') {
            result[keys] = this.data[keys];
        } else if (Array.isArray(keys)) {
            keys.forEach(key => {
                result[key] = this.data[key];
            });
        } else {
            Object.assign(result, this.data);
        }
        callback(result);
    },
    set: function(items, callback) {
        Object.assign(this.data, items);
        if (callback) callback();
    }
};

// 模拟chrome.storage.local
window.chrome = {
    storage: {
        local: mockChromeStorage
    }
};

// 测试函数
function runTests() {
    console.log('开始测试任务搜索和筛选功能...');
    
    // 创建测试容器
    const testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);
    
    // 创建测试UI
    createTestUI(testContainer);
    
    // 加载任务数据
    loadTaskData();
}

// 创建测试UI
function createTestUI(container) {
    container.innerHTML = `
        <div class="test-panel">
            <h2>任务搜索和筛选测试</h2>
            
            <div class="filter-container">
                <input type="text" class="search-input" placeholder="搜索任务...">
                
                <select class="status-filter">
                    <option value="all">所有任务</option>
                    <option value="completed">已完成任务</option>
                    <option value="uncompleted">未完成任务</option>
                </select>
                
                <select class="category-filter">
                    <option value="all">所有分类</option>
                    <option value="none">无分类</option>
                    <!-- 分类选项将通过JavaScript动态添加 -->
                </select>
                
                <select class="tag-filter">
                    <option value="all">所有标签</option>
                    <option value="none">无标签</option>
                    <!-- 标签选项将通过JavaScript动态添加 -->
                </select>
                
                <button id="filter-btn">筛选</button>
                <button id="reset-btn">重置</button>
            </div>
            
            <div class="task-list-container">
                <!-- 任务列表将通过JavaScript动态添加 -->
            </div>
            
            <div class="test-results">
                <h3>测试结果 <span class="task-count">(0)</span></h3>
                <pre id="test-output"></pre>
            </div>
        </div>
    `;
    
    // 添加事件监听器
    document.getElementById('filter-btn').addEventListener('click', filterTasks);
    document.getElementById('reset-btn').addEventListener('click', resetFilters);
    
    // 添加实时筛选
    document.querySelector('.search-input').addEventListener('input', filterTasks);
    document.querySelector('.status-filter').addEventListener('change', filterTasks);
    document.querySelector('.category-filter').addEventListener('change', filterTasks);
    document.querySelector('.tag-filter').addEventListener('change', filterTasks);
}

// 加载任务数据
function loadTaskData() {
    chrome.storage.local.get(['memos', 'categories', 'tags'], function(result) {
        const { memos, categories, tags } = result;
        
        // 填充分类选项
        const categoryFilter = document.querySelector('.category-filter');
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id;
            option.textContent = category.name;
            categoryFilter.appendChild(option);
        });
        
        // 填充标签选项
        const tagFilter = document.querySelector('.tag-filter');
        tags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.id;
            option.textContent = tag.name;
            tagFilter.appendChild(option);
        });
        
        // 渲染任务列表
        renderTaskList(memos);
        
        // 更新任务计数
        updateTaskCount(memos.length);
        
        // 输出测试信息
        logTestInfo('数据加载完成，共加载 ' + memos.length + ' 个任务');
    });
}

// 渲染任务列表
function renderTaskList(tasks) {
    const taskListContainer = document.querySelector('.task-list-container');
    taskListContainer.innerHTML = '';
    
    if (tasks.length === 0) {
        const noTasksMessage = document.createElement('div');
        noTasksMessage.className = 'no-tasks-message';
        noTasksMessage.textContent = '暂无任务';
        taskListContainer.appendChild(noTasksMessage);
        return;
    }
    
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        taskItem.dataset.id = task.id;
        
        if (task.completed) {
            taskItem.classList.add('completed');
        }
        
        // 获取分类信息
        let categoryName = '无分类';
        let categoryColor = '#999';
        
        if (task.categoryId) {
            chrome.storage.local.get('categories', function(result) {
                const category = result.categories.find(c => c.id === task.categoryId);
                if (category) {
                    categoryName = category.name;
                    categoryColor = category.color;
                    
                    const categoryBadge = taskItem.querySelector('.category-badge');
                    if (categoryBadge) {
                        categoryBadge.textContent = categoryName;
                        categoryBadge.style.backgroundColor = categoryColor;
                    }
                }
            });
        }
        
        // 获取标签信息
        let tagHtml = '';
        if (task.tagIds && task.tagIds.length > 0) {
            chrome.storage.local.get('tags', function(result) {
                const taskTags = result.tags.filter(tag => task.tagIds.includes(tag.id));
                
                const tagContainer = taskItem.querySelector('.tag-container');
                if (tagContainer && taskTags.length > 0) {
                    tagContainer.innerHTML = '';
                    
                    taskTags.forEach(tag => {
                        const tagBadge = document.createElement('span');
                        tagBadge.className = 'tag-badge';
                        tagBadge.textContent = tag.name;
                        tagBadge.style.backgroundColor = tag.color;
                        tagContainer.appendChild(tagBadge);
                    });
                }
            });
        }
        
        taskItem.innerHTML = `
            <div class="task-header">
                <div class="task-title">${task.title}</div>
                <span class="category-badge" style="background-color: ${categoryColor}">${categoryName}</span>
            </div>
            <div class="task-content">${task.text}</div>
            <div class="tag-container">${tagHtml}</div>
            <div class="task-footer">
                <span class="task-status">${task.completed ? '已完成' : '未完成'}</span>
                <span class="task-date">${new Date(task.created).toLocaleString()}</span>
            </div>
        `;
        
        taskList.appendChild(taskItem);
    });
    
    taskListContainer.appendChild(taskList);
}

// 筛选任务
function filterTasks() {
    // 获取筛选条件
    const searchText = document.querySelector('.search-input').value.toLowerCase().trim();
    const statusFilter = document.querySelector('.status-filter').value;
    const categoryFilter = document.querySelector('.category-filter').value;
    const tagFilter = document.querySelector('.tag-filter').value;
    
    // 记录筛选条件
    logTestInfo(`应用筛选条件：
    - 搜索文本: "${searchText}"
    - 状态筛选: ${statusFilter}
    - 分类筛选: ${categoryFilter}
    - 标签筛选: ${tagFilter}`);
    
    // 从存储中获取任务
    chrome.storage.local.get('memos', function(result) {
        const tasks = result.memos;
        
        // 筛选任务
        const filteredTasks = tasks.filter(task => {
            // 搜索文本筛选
            const matchesSearch = searchText === '' || 
                task.title.toLowerCase().includes(searchText) || 
                task.text.toLowerCase().includes(searchText);
            
            // 完成状态筛选
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'completed' && task.completed) || 
                (statusFilter === 'uncompleted' && !task.completed);
            
            // 分类筛选
            const matchesCategory = categoryFilter === 'all' || 
                (categoryFilter === 'none' && !task.categoryId) || 
                task.categoryId === categoryFilter;
            
            // 标签筛选
            const matchesTag = tagFilter === 'all' || 
                (tagFilter === 'none' && (!task.tagIds || task.tagIds.length === 0)) || 
                (task.tagIds && task.tagIds.includes(tagFilter));
            
            return matchesSearch && matchesStatus && matchesCategory && matchesTag;
        });
        
        // 渲染筛选后的任务列表
        renderTaskList(filteredTasks);
        
        // 更新任务计数
        updateTaskCount(filteredTasks.length);
        
        // 记录筛选结果
        logTestInfo(`筛选结果: 找到 ${filteredTasks.length} 个匹配任务`);
    });
}

// 重置筛选条件
function resetFilters() {
    document.querySelector('.search-input').value = '';
    document.querySelector('.status-filter').value = 'all';
    document.querySelector('.category-filter').value = 'all';
    document.querySelector('.tag-filter').value = 'all';
    
    // 重新加载所有任务
    chrome.storage.local.get('memos', function(result) {
        renderTaskList(result.memos);
        updateTaskCount(result.memos.length);
        logTestInfo('已重置筛选条件，显示所有任务');
    });
}

// 更新任务计数
function updateTaskCount(count) {
    const taskCountElement = document.querySelector('.task-count');
    if (taskCountElement) {
        taskCountElement.textContent = `(${count})`;
    }
}

// 记录测试信息
function logTestInfo(message) {
    const testOutput = document.getElementById('test-output');
    const timestamp = new Date().toLocaleTimeString();
    testOutput.textContent += `[${timestamp}] ${message}\n`;
    testOutput.scrollTop = testOutput.scrollHeight;
}

// 页面加载完成后运行测试
document.addEventListener('DOMContentLoaded', runTests);
