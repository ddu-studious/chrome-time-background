# 长期任务/每日重复任务展示形式调研报告

> **调研日期**: 2026-02-07  
> **项目**: 中国风景时钟 Chrome 扩展 - 任务管理系统  
> **调研目标**: 为"长期任务/每日重复任务"功能设计最佳展示形式

---

## 一、行业调研总结

### 1.1 主流任务管理工具的处理方式

#### Todoist
- **重复任务设置**: 提供可视化界面设置重复模式（每日、每周、每月等），支持自定义间隔
- **展示方式**: 重复任务在到期日自动出现在"今日"视图，显示重复图标（🔄）
- **特点**: 新实例在完成前一个任务后自动生成，或按固定时间表生成
- **UI设计**: 简洁的重复图标标识，不占用过多视觉空间

#### TickTick
- **习惯追踪**: 专门的习惯追踪模块，支持每日打卡
- **展示方式**: 
  - 习惯任务显示在专门的"习惯"区域
  - 日历视图显示完成情况（热力图）
  - 统计面板显示连续天数、完成率
- **特点**: 习惯任务与普通任务分离，有独立的统计和可视化

#### Microsoft To Do
- **每日习惯**: 支持创建每日重复任务
- **展示方式**: 在"我的一天"视图中显示，标记为重复任务
- **特点**: 简单直接，与普通任务混排但带有重复标识

#### Things 3
- **重复模式**: 
  - 固定时间表：按固定间隔重复
  - 完成后重复：完成前一个任务后生成新实例
  - 工作日重复：仅在工作日重复
- **展示方式**: 重复任务自动出现在"今日"视图，与日历事件一起显示
- **UI设计**: 重复任务带有特殊标识，支持设置提醒和截止时间

#### Habitica
- **游戏化习惯追踪**: 将习惯任务游戏化
- **展示方式**: 
  - 习惯任务显示为可重复完成的卡片
  - 显示连续完成天数（Streak）
  - 完成时给予经验值和奖励
- **特点**: 通过游戏化机制增强用户完成习惯的动力

#### Streaks
- **核心机制**: "不要打破链条"（Don't break the chain）
- **展示方式**: 
  - 大图标 + 进度环显示
  - 日历热力图显示完成历史
  - 连续天数徽章
- **特点**: 专注于习惯追踪，视觉反馈强烈

#### Google Tasks
- **重复设置**: 支持每日、每周、每月、每年重复
- **展示方式**: 重复任务在日历视图中显示，带有重复图标
- **限制**: 共享任务和子任务不能重复

### 1.2 GitHub 开源项目实现方式

#### Habitboard
- **展示方式**: 周视图，每行代表一周，7个格子代表7天
- **数据结构**: 使用 `localStorage` 存储，支持多个看板
- **特点**: 极简设计，专注于习惯打卡，无限滚动加载历史周

#### Simple-Todo (Chrome Extension)
- **展示方式**: 简单的任务列表，支持标签分类
- **特点**: 轻量级，适合新标签页快速查看

#### todo.txt-recurring-tasks
- **实现方式**: 通过配置文件管理重复规则，使用 cron 自动生成新任务
- **特点**: 命令行工具，适合技术用户

### 1.3 Chrome 扩展案例

#### Everyday - Daily Habits & Productivity
- **功能**: 新标签页 + 习惯追踪 + 书签管理
- **展示方式**: 每日任务列表，自动打开网站统计
- **特点**: 结合新标签页场景，提供一站式生产力工具

#### New Tab Todo List
- **功能**: 功能丰富的待办列表
- **展示方式**: 支持嵌套列表、标签、实时协作
- **特点**: 功能全面，但可能过于复杂

### 1.4 核心设计模式总结

| 设计模式 | 代表产品 | 适用场景 | 优点 | 缺点 |
|---------|---------|---------|------|------|
| **混排展示** | Todoist, Microsoft To Do | 任务和习惯统一管理 | 简单统一，无需切换视图 | 习惯任务可能被普通任务淹没 |
| **独立模块** | TickTick, Habitica | 习惯追踪是核心功能 | 专注度高，统计丰富 | 需要额外的UI空间 |
| **日历热力图** | Streaks, TickTick | 长期习惯追踪 | 视觉化强，历史一目了然 | 占用空间大 |
| **周视图网格** | Habitboard | 极简习惯追踪 | 简洁直观，易于打卡 | 不适合复杂任务 |
| **游戏化** | Habitica | 需要激励的用户 | 趣味性强，提高完成率 | 可能分散注意力 |

---

## 二、Demo 方案设计

### 方案一：混排展示 + 重复标识（推荐度：⭐⭐⭐⭐）

#### 方案名称
**"统一列表 + 视觉标识"方案**

#### 设计描述
在现有侧边栏任务列表中，为重复任务添加视觉标识和特殊样式。重复任务与普通任务混排，但通过图标、颜色、徽章等方式突出显示。每日重复任务每天自动出现在列表中，长期任务始终显示在顶部或特殊区域。

#### 数据结构设计

```javascript
// 扩展现有任务数据结构
{
    id: 'task_001',
    title: '每日晨跑',
    text: '跑步30分钟',
    completed: false,
    createdAt: 1706601600000,
    updatedAt: 1706601600000,
    completedAt: null,
    categoryId: 'health',
    tagIds: [],
    priority: 'high',
    dueDate: '2026-02-07',  // 当前日期（每日更新）
    images: [],
    progress: null,
    
    // 新增：重复任务配置
    recurrence: {
        enabled: true,
        type: 'daily',  // 'daily' | 'weekly' | 'monthly' | 'custom' | 'none'
        interval: 1,     // 间隔天数（daily时固定为1）
        weekDays: null, // [1,2,3,4,5] 周一到周五（weekly时使用）
        monthDay: null, // 15 每月15号（monthly时使用）
        endDate: null,  // '2026-12-31' 结束日期，null表示无结束
        autoComplete: false  // 是否自动完成前一天的任务
    },
    
    // 新增：习惯追踪数据（仅daily类型）
    habit: {
        streak: 7,              // 当前连续天数
        bestStreak: 14,         // 最佳连续天数
        completedDates: [       // 完成日期数组
            '2026-02-01',
            '2026-02-02',
            '2026-02-03'
        ],
        totalCompletions: 45    // 总完成次数
    },
    
    // 新增：长期任务配置
    longTerm: {
        enabled: false,
        startDate: null,        // 开始日期
        targetDate: null,       // 目标日期
        milestones: []          // 里程碑数组
    }
}
```

#### UI 渲染代码

**HTML 结构**:
```html
<!-- 侧边栏任务项（扩展现有结构） -->
<div class="sidebar-task-item recurring-task daily-task" data-id="task_001">
    <!-- 重复任务标识 -->
    <div class="task-recurrence-badge">
        <i class="fas fa-redo"></i>
        <span class="recurrence-label">每日</span>
    </div>
    
    <!-- 习惯追踪徽章（仅daily类型显示） -->
    <div class="task-habit-badge">
        <span class="streak-count">🔥 7</span>
        <span class="streak-label">连续</span>
    </div>
    
    <!-- 原有任务内容 -->
    <div class="task-checkbox">
        <i class="far fa-circle"></i>
    </div>
    <div class="task-body">
        <div class="task-header">
            <span class="task-index">1</span>
            <span class="task-title">每日晨跑</span>
        </div>
        <div class="task-desc">跑步30分钟</div>
        
        <!-- 习惯统计（展开时显示） -->
        <div class="task-habit-stats">
            <div class="stat-item">
                <span class="stat-label">总完成:</span>
                <span class="stat-value">45次</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">最佳:</span>
                <span class="stat-value">14天</span>
            </div>
        </div>
    </div>
</div>
```

**CSS 样式**:
```css
/* 重复任务基础样式 */
.sidebar-task-item.recurring-task {
    position: relative;
    border-left: 3px solid #64b5f6; /* 蓝色标识 */
    background: linear-gradient(
        135deg,
        rgba(100, 181, 246, 0.08) 0%,
        rgba(255, 255, 255, 0.02) 100%
    );
}

/* 每日重复任务特殊样式 */
.sidebar-task-item.daily-task {
    border-left-color: #4caf50; /* 绿色 */
}

/* 重复任务标识 */
.task-recurrence-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: rgba(100, 181, 246, 0.2);
    border-radius: 12px;
    font-size: 11px;
    color: rgba(100, 181, 246, 0.9);
}

.task-recurrence-badge i {
    font-size: 10px;
    animation: rotate 2s linear infinite;
}

@keyframes rotate {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.recurrence-label {
    font-weight: 500;
}

/* 习惯追踪徽章 */
.task-habit-badge {
    position: absolute;
    top: 8px;
    right: 80px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 10px;
    background: linear-gradient(135deg, #ff6b6b, #ff8e53);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(255, 107, 107, 0.3);
}

.streak-count {
    font-size: 14px;
    font-weight: 700;
    color: white;
    line-height: 1;
}

.streak-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

/* 习惯统计面板 */
.task-habit-stats {
    display: flex;
    gap: 16px;
    margin-top: 8px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 6px;
    font-size: 12px;
}

.stat-item {
    display: flex;
    gap: 4px;
}

.stat-label {
    color: rgba(255, 255, 255, 0.6);
}

.stat-value {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 600;
}

/* 长期任务样式 */
.sidebar-task-item.long-term-task {
    border-left-color: #9c27b0; /* 紫色 */
    background: linear-gradient(
        135deg,
        rgba(156, 39, 176, 0.08) 0%,
        rgba(255, 255, 255, 0.02) 100%
    );
}

.long-term-task .task-title::after {
    content: '📅';
    margin-left: 6px;
    opacity: 0.7;
}
```

**JavaScript 渲染逻辑**:
```javascript
/**
 * 创建重复任务项（扩展现有 createSidebarTaskItem 方法）
 */
createRecurringTaskItem(task, index, total) {
    const item = this.createSidebarTaskItem(task, index, total);
    
    // 添加重复任务类
    if (task.recurrence && task.recurrence.enabled) {
        item.classList.add('recurring-task');
        
        // 根据重复类型添加具体类
        if (task.recurrence.type === 'daily') {
            item.classList.add('daily-task');
            this.addHabitBadge(item, task);
        } else if (task.recurrence.type === 'weekly') {
            item.classList.add('weekly-task');
        } else if (task.recurrence.type === 'monthly') {
            item.classList.add('monthly-task');
        }
        
        // 添加重复标识
        this.addRecurrenceBadge(item, task.recurrence);
    }
    
    // 长期任务标识
    if (task.longTerm && task.longTerm.enabled) {
        item.classList.add('long-term-task');
    }
    
    return item;
}

/**
 * 添加重复标识徽章
 */
addRecurrenceBadge(item, recurrence) {
    const badge = document.createElement('div');
    badge.className = 'task-recurrence-badge';
    
    const labels = {
        daily: '每日',
        weekly: '每周',
        monthly: '每月',
        custom: '自定义'
    };
    
    badge.innerHTML = `
        <i class="fas fa-redo"></i>
        <span class="recurrence-label">${labels[recurrence.type] || '重复'}</span>
    `;
    
    item.appendChild(badge);
}

/**
 * 添加习惯追踪徽章（仅daily类型）
 */
addHabitBadge(item, task) {
    if (!task.habit) return;
    
    const badge = document.createElement('div');
    badge.className = 'task-habit-badge';
    badge.innerHTML = `
        <span class="streak-count">🔥 ${task.habit.streak}</span>
        <span class="streak-label">连续</span>
    `;
    
    // 点击显示详细统计
    badge.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showHabitStats(task);
    });
    
    item.appendChild(badge);
}

/**
 * 检查并更新每日重复任务
 */
async updateDailyRecurringTasks() {
    const today = this.getTodayDate();
    
    for (const task of this.memos) {
        if (!task.recurrence || !task.recurrence.enabled) continue;
        
        if (task.recurrence.type === 'daily') {
            // 检查今天是否已完成
            const todayCompleted = task.habit?.completedDates?.includes(today);
            
            // 如果昨天未完成且设置了自动完成，标记为完成
            if (task.recurrence.autoComplete && !todayCompleted) {
                const yesterday = this.getDateString(new Date(Date.now() - 86400000));
                if (!task.habit.completedDates.includes(yesterday)) {
                    // 自动完成昨天的任务
                    await this.completeTask(task.id, yesterday);
                }
            }
            
            // 确保今天的任务存在
            if (task.dueDate !== today) {
                task.dueDate = today;
                task.completed = false;
                await this.saveTask(task);
            }
        }
    }
    
    this.renderSidebarContent();
}
```

#### 优缺点分析

**优点**:
- ✅ 与现有系统无缝集成，无需大幅改动
- ✅ 用户习惯一致，学习成本低
- ✅ 视觉标识清晰，易于识别重复任务
- ✅ 习惯追踪徽章提供即时反馈
- ✅ 实现简单，开发成本低

**缺点**:
- ❌ 重复任务可能被普通任务淹没
- ❌ 习惯统计需要点击展开，不够直观
- ❌ 长期任务与重复任务可能混淆

---

### 方案二：独立习惯区域（推荐度：⭐⭐⭐⭐⭐）

#### 方案名称
**"习惯追踪专区"方案**

#### 设计描述
在侧边栏顶部或底部创建独立的"每日习惯"区域，专门展示每日重复任务。该区域采用卡片式布局，每个习惯显示为独立的卡片，包含完成状态、连续天数、进度环等元素。普通任务和长期任务继续在下方列表显示。

#### 数据结构设计

```javascript
// 数据结构与方案一相同，但增加分组标识
{
    // ... 同方案一
    
    // 新增：任务分组
    group: 'habit',  // 'habit' | 'task' | 'longterm'
    
    // 习惯卡片配置
    habitCard: {
        icon: '🏃',           // 习惯图标
        color: '#4caf50',     // 卡片主题色
        targetDays: null,     // 目标天数（可选）
        reminderTime: '07:00' // 提醒时间
    }
}
```

#### UI 渲染代码

**HTML 结构**:
```html
<!-- 侧边栏内容 -->
<div class="sidebar-content">
    <!-- 每日习惯区域 -->
    <div class="habits-section">
        <div class="section-header">
            <h3 class="section-title">
                <i class="fas fa-fire"></i>
                <span>每日习惯</span>
            </h3>
            <button class="section-toggle" title="折叠/展开">
                <i class="fas fa-chevron-up"></i>
            </button>
        </div>
        
        <div class="habits-grid">
            <!-- 习惯卡片 -->
            <div class="habit-card" data-id="task_001">
                <div class="habit-card-header">
                    <div class="habit-icon">🏃</div>
                    <div class="habit-info">
                        <h4 class="habit-title">每日晨跑</h4>
                        <div class="habit-streak">
                            <span class="streak-icon">🔥</span>
                            <span class="streak-number">7</span>
                            <span class="streak-text">天连续</span>
                        </div>
                    </div>
                </div>
                
                <!-- 进度环 -->
                <div class="habit-progress-ring">
                    <svg class="progress-svg" viewBox="0 0 36 36">
                        <circle class="progress-bg" cx="18" cy="18" r="16"></circle>
                        <circle class="progress-bar" cx="18" cy="18" r="16" 
                                stroke-dasharray="75 100"></circle>
                    </svg>
                    <div class="progress-text">75%</div>
                </div>
                
                <!-- 完成按钮 -->
                <button class="habit-check-btn">
                    <i class="fas fa-check"></i>
                    <span>完成</span>
                </button>
                
                <!-- 本周完成情况 -->
                <div class="habit-week-view">
                    <div class="week-day completed">一</div>
                    <div class="week-day completed">二</div>
                    <div class="week-day completed">三</div>
                    <div class="week-day completed">四</div>
                    <div class="week-day completed">五</div>
                    <div class="week-day completed">六</div>
                    <div class="week-day today">日</div>
                </div>
            </div>
            
            <!-- 添加新习惯按钮 -->
            <div class="habit-card add-habit-card">
                <button class="add-habit-btn">
                    <i class="fas fa-plus"></i>
                    <span>添加习惯</span>
                </button>
            </div>
        </div>
    </div>
    
    <!-- 分隔线 -->
    <div class="section-divider"></div>
    
    <!-- 普通任务区域 -->
    <div class="tasks-section">
        <!-- 现有任务列表 -->
    </div>
</div>
```

**CSS 样式**:
```css
/* 习惯区域 */
.habits-section {
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
}

.section-title i {
    color: #ff6b6b;
}

/* 习惯网格 */
.habits-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
}

/* 习惯卡片 */
.habit-card {
    position: relative;
    padding: 16px;
    background: linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.1) 0%,
        rgba(255, 255, 255, 0.05) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    backdrop-filter: blur(10px);
    transition: all 0.3s ease;
    cursor: pointer;
}

.habit-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border-color: rgba(255, 255, 255, 0.2);
}

.habit-card.completed {
    opacity: 0.6;
    background: linear-gradient(
        135deg,
        rgba(76, 175, 80, 0.2) 0%,
        rgba(255, 255, 255, 0.05) 100%
    );
}

.habit-card-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 12px;
}

.habit-icon {
    font-size: 24px;
    flex-shrink: 0;
}

.habit-info {
    flex: 1;
    min-width: 0;
}

.habit-title {
    margin: 0 0 6px 0;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    line-height: 1.3;
}

.habit-streak {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: rgba(255, 107, 107, 0.9);
}

.streak-icon {
    font-size: 12px;
}

.streak-number {
    font-weight: 700;
}

/* 进度环 */
.habit-progress-ring {
    position: relative;
    width: 60px;
    height: 60px;
    margin: 12px auto;
}

.progress-svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
}

.progress-bg {
    fill: none;
    stroke: rgba(255, 255, 255, 0.1);
    stroke-width: 3;
}

.progress-bar {
    fill: none;
    stroke: #4caf50;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: 0 100;
    transition: stroke-dasharray 0.5s ease;
}

.progress-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
}

/* 完成按钮 */
.habit-check-btn {
    width: 100%;
    padding: 8px;
    margin-top: 8px;
    background: linear-gradient(135deg, #4caf50, #45a049);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.2s;
}

.habit-check-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 2px 8px rgba(76, 175, 80, 0.4);
}

.habit-check-btn:active {
    transform: scale(0.98);
}

.habit-card.completed .habit-check-btn {
    background: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
}

/* 本周视图 */
.habit-week-view {
    display: flex;
    gap: 4px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.week-day {
    flex: 1;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 4px;
    transition: all 0.2s;
}

.week-day.completed {
    background: #4caf50;
    color: white;
}

.week-day.today {
    border: 2px solid #64b5f6;
    color: #64b5f6;
    font-weight: 700;
}

/* 添加习惯卡片 */
.add-habit-card {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    border-style: dashed;
    background: rgba(255, 255, 255, 0.03);
}

.add-habit-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.add-habit-btn:hover {
    color: rgba(255, 255, 255, 0.8);
    transform: scale(1.1);
}

.add-habit-btn i {
    font-size: 24px;
}

/* 分隔线 */
.section-divider {
    height: 1px;
    margin: 16px 0;
    background: linear-gradient(
        90deg,
        transparent 0%,
        rgba(255, 255, 255, 0.1) 50%,
        transparent 100%
    );
}
```

**JavaScript 渲染逻辑**:
```javascript
/**
 * 渲染习惯区域
 */
renderHabitsSection() {
    const habits = this.memos.filter(task => 
        task.recurrence?.enabled && 
        task.recurrence?.type === 'daily' &&
        task.group === 'habit'
    );
    
    const section = document.createElement('div');
    section.className = 'habits-section';
    
    section.innerHTML = `
        <div class="section-header">
            <h3 class="section-title">
                <i class="fas fa-fire"></i>
                <span>每日习惯</span>
            </h3>
            <button class="section-toggle">
                <i class="fas fa-chevron-up"></i>
            </button>
        </div>
        <div class="habits-grid" id="habits-grid"></div>
    `;
    
    const grid = section.querySelector('#habits-grid');
    
    // 渲染习惯卡片
    habits.forEach(habit => {
        const card = this.createHabitCard(habit);
        grid.appendChild(card);
    });
    
    // 添加"添加习惯"按钮
    const addCard = this.createAddHabitCard();
    grid.appendChild(addCard);
    
    return section;
}

/**
 * 创建习惯卡片
 */
createHabitCard(habit) {
    const card = document.createElement('div');
    card.className = `habit-card ${habit.completed ? 'completed' : ''}`;
    card.dataset.id = habit.id;
    
    // 计算本周完成情况
    const weekData = this.getWeekCompletion(habit);
    const completionRate = Math.round((weekData.completed / 7) * 100);
    
    // 计算进度环的 stroke-dasharray
    const circumference = 2 * Math.PI * 16; // r=16
    const completedLength = (completionRate / 100) * circumference;
    
    card.innerHTML = `
        <div class="habit-card-header">
            <div class="habit-icon">${habit.habitCard?.icon || '📝'}</div>
            <div class="habit-info">
                <h4 class="habit-title">${habit.title}</h4>
                <div class="habit-streak">
                    <span class="streak-icon">🔥</span>
                    <span class="streak-number">${habit.habit?.streak || 0}</span>
                    <span class="streak-text">天连续</span>
                </div>
            </div>
        </div>
        
        <div class="habit-progress-ring">
            <svg class="progress-svg" viewBox="0 0 36 36">
                <circle class="progress-bg" cx="18" cy="18" r="16"></circle>
                <circle class="progress-bar" cx="18" cy="18" r="16" 
                        stroke-dasharray="${completedLength} ${circumference}"></circle>
            </svg>
            <div class="progress-text">${completionRate}%</div>
        </div>
        
        <button class="habit-check-btn">
            <i class="fas fa-check"></i>
            <span>${habit.completed ? '已完成' : '完成'}</span>
        </button>
        
        <div class="habit-week-view">
            ${this.renderWeekDays(weekData)}
        </div>
    `;
    
    // 绑定完成按钮事件
    const checkBtn = card.querySelector('.habit-check-btn');
    checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHabitCompletion(habit.id);
    });
    
    // 点击卡片查看详情
    card.addEventListener('click', () => {
        this.showHabitDetail(habit);
    });
    
    return card;
}

/**
 * 获取本周完成情况
 */
getWeekCompletion(habit) {
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay() + 1); // 周一
    
    const weekData = {
        completed: 0,
        days: []
    };
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = this.getDateString(date);
        
        const isCompleted = habit.habit?.completedDates?.includes(dateStr) || false;
        const isToday = dateStr === this.getTodayDate();
        
        weekData.days.push({
            date: dateStr,
            completed: isCompleted,
            isToday: isToday,
            label: ['一', '二', '三', '四', '五', '六', '日'][i]
        });
        
        if (isCompleted) weekData.completed++;
    }
    
    return weekData;
}

/**
 * 渲染周视图
 */
renderWeekDays(weekData) {
    return weekData.days.map(day => {
        const classes = ['week-day'];
        if (day.completed) classes.push('completed');
        if (day.isToday) classes.push('today');
        
        return `<div class="${classes.join(' ')}">${day.label}</div>`;
    }).join('');
}

/**
 * 切换习惯完成状态
 */
async toggleHabitCompletion(habitId) {
    const habit = this.memos.find(t => t.id === habitId);
    if (!habit) return;
    
    const today = this.getTodayDate();
    const isCompleted = habit.habit?.completedDates?.includes(today);
    
    if (isCompleted) {
        // 取消完成
        habit.completed = false;
        habit.habit.completedDates = habit.habit.completedDates.filter(d => d !== today);
        habit.habit.streak = this.calculateStreak(habit.habit.completedDates);
    } else {
        // 标记完成
        habit.completed = true;
        if (!habit.habit) {
            habit.habit = {
                streak: 0,
                bestStreak: 0,
                completedDates: [],
                totalCompletions: 0
            };
        }
        
        if (!habit.habit.completedDates.includes(today)) {
            habit.habit.completedDates.push(today);
            habit.habit.totalCompletions++;
        }
        
        habit.habit.streak = this.calculateStreak(habit.habit.completedDates);
        if (habit.habit.streak > habit.habit.bestStreak) {
            habit.habit.bestStreak = habit.habit.streak;
        }
    }
    
    await this.saveTask(habit);
    this.renderSidebarContent();
}

/**
 * 计算连续天数
 */
calculateStreak(completedDates) {
    if (!completedDates || completedDates.length === 0) return 0;
    
    const sorted = [...completedDates].sort().reverse();
    let streak = 0;
    let expectedDate = this.getTodayDate();
    
    for (const date of sorted) {
        if (date === expectedDate) {
            streak++;
            const dateObj = new Date(date);
            dateObj.setDate(dateObj.getDate() - 1);
            expectedDate = this.getDateString(dateObj);
        } else {
            break;
        }
    }
    
    return streak;
}
```

#### 优缺点分析

**优点**:
- ✅ 习惯任务与普通任务分离，视觉层次清晰
- ✅ 卡片式设计美观，符合现代UI趋势
- ✅ 进度环和周视图提供直观的完成反馈
- ✅ 连续天数徽章增强成就感
- ✅ 独立区域便于快速查看和操作

**缺点**:
- ❌ 需要额外的UI空间
- ❌ 实现复杂度较高
- ❌ 可能与其他任务产生割裂感

---

### 方案三：日历热力图（推荐度：⭐⭐⭐）

#### 方案名称
**"日历热力图 + 列表混合"方案**

#### 设计描述
在侧边栏顶部显示一个紧凑的日历热力图，展示所有每日习惯的完成历史。每个习惯一行，显示最近30天的完成情况。点击热力图可以查看详细统计。下方继续显示任务列表。

#### 数据结构设计

```javascript
// 数据结构与方案一相同，增加热力图所需数据
{
    // ... 同方案一
    
    // 热力图数据（自动生成）
    heatmapData: {
        last30Days: [
            { date: '2026-01-08', completed: true },
            { date: '2026-01-09', completed: true },
            { date: '2026-01-10', completed: false },
            // ... 30天数据
        ],
        completionRate: 0.75  // 完成率
    }
}
```

#### UI 渲染代码

**HTML 结构**:
```html
<!-- 习惯热力图区域 -->
<div class="habits-heatmap-section">
    <div class="section-header">
        <h3 class="section-title">
            <i class="fas fa-calendar-alt"></i>
            <span>习惯追踪</span>
        </h3>
        <button class="heatmap-toggle" title="展开/收起">
            <i class="fas fa-chevron-down"></i>
        </button>
    </div>
    
    <div class="habits-heatmap-container">
        <!-- 习惯热力图项 -->
        <div class="heatmap-item" data-id="task_001">
            <div class="heatmap-header">
                <span class="heatmap-title">每日晨跑</span>
                <span class="heatmap-streak">🔥 7</span>
            </div>
            
            <div class="heatmap-grid">
                <!-- 30天热力图 -->
                <div class="heatmap-day" 
                     data-date="2026-01-08" 
                     data-completed="true"
                     title="2026-01-08 已完成"></div>
                <div class="heatmap-day" 
                     data-date="2026-01-09" 
                     data-completed="true"
                     title="2026-01-09 已完成"></div>
                <!-- ... 更多日期 -->
            </div>
            
            <div class="heatmap-stats">
                <span class="stat">完成率: 75%</span>
                <span class="stat">连续: 7天</span>
            </div>
        </div>
    </div>
</div>
```

**CSS 样式**:
```css
/* 热力图区域 */
.habits-heatmap-section {
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(0, 0, 0, 0.2);
}

.habits-heatmap-container {
    margin-top: 12px;
}

/* 热力图项 */
.heatmap-item {
    margin-bottom: 16px;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
}

.heatmap-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.heatmap-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
}

.heatmap-streak {
    font-size: 11px;
    color: #ff6b6b;
    font-weight: 600;
}

/* 热力图网格 */
.heatmap-grid {
    display: grid;
    grid-template-columns: repeat(30, 1fr);
    gap: 3px;
    margin-bottom: 8px;
}

.heatmap-day {
    aspect-ratio: 1;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.1);
    transition: all 0.2s;
    cursor: pointer;
}

.heatmap-day:hover {
    transform: scale(1.2);
    z-index: 1;
}

.heatmap-day[data-completed="true"] {
    background: #4caf50;
}

.heatmap-day[data-completed="false"] {
    background: rgba(255, 255, 255, 0.1);
}

/* 强度分级（可选） */
.heatmap-day.intensity-1 { background: rgba(76, 175, 80, 0.3); }
.heatmap-day.intensity-2 { background: rgba(76, 175, 80, 0.6); }
.heatmap-day.intensity-3 { background: rgba(76, 175, 80, 0.9); }
.heatmap-day.intensity-4 { background: #4caf50; }

/* 统计信息 */
.heatmap-stats {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.6);
}

.heatmap-stats .stat {
    display: flex;
    align-items: center;
}
```

**JavaScript 渲染逻辑**:
```javascript
/**
 * 渲染习惯热力图
 */
renderHabitsHeatmap() {
    const habits = this.memos.filter(task => 
        task.recurrence?.enabled && 
        task.recurrence?.type === 'daily'
    );
    
    const section = document.createElement('div');
    section.className = 'habits-heatmap-section';
    
    section.innerHTML = `
        <div class="section-header">
            <h3 class="section-title">
                <i class="fas fa-calendar-alt"></i>
                <span>习惯追踪</span>
            </h3>
            <button class="heatmap-toggle">
                <i class="fas fa-chevron-down"></i>
            </button>
        </div>
        <div class="habits-heatmap-container" id="habits-heatmap-container"></div>
    `;
    
    const container = section.querySelector('#habits-heatmap-container');
    
    habits.forEach(habit => {
        const heatmapItem = this.createHeatmapItem(habit);
        container.appendChild(heatmapItem);
    });
    
    return section;
}

/**
 * 创建热力图项
 */
createHeatmapItem(habit) {
    const item = document.createElement('div');
    item.className = 'heatmap-item';
    item.dataset.id = habit.id;
    
    // 生成最近30天的数据
    const last30Days = this.generateLast30Days(habit);
    const completionRate = Math.round(
        (last30Days.filter(d => d.completed).length / 30) * 100
    );
    
    const heatmapGrid = last30Days.map(day => {
        const intensity = this.calculateIntensity(day, habit);
        return `
            <div class="heatmap-day ${day.completed ? 'intensity-' + intensity : ''}" 
                 data-date="${day.date}" 
                 data-completed="${day.completed}"
                 title="${day.date} ${day.completed ? '已完成' : '未完成'}"></div>
        `;
    }).join('');
    
    item.innerHTML = `
        <div class="heatmap-header">
            <span class="heatmap-title">${habit.title}</span>
            <span class="heatmap-streak">🔥 ${habit.habit?.streak || 0}</span>
        </div>
        <div class="heatmap-grid">
            ${heatmapGrid}
        </div>
        <div class="heatmap-stats">
            <span class="stat">完成率: ${completionRate}%</span>
            <span class="stat">连续: ${habit.habit?.streak || 0}天</span>
        </div>
    `;
    
    // 点击查看详情
    item.addEventListener('click', () => {
        this.showHabitDetail(habit);
    });
    
    return item;
}

/**
 * 生成最近30天的数据
 */
generateLast30Days(habit) {
    const days = [];
    const today = new Date();
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = this.getDateString(date);
        
        days.push({
            date: dateStr,
            completed: habit.habit?.completedDates?.includes(dateStr) || false
        });
    }
    
    return days;
}

/**
 * 计算强度（用于颜色分级）
 */
calculateIntensity(day, habit) {
    if (!day.completed) return 0;
    
    // 可以根据完成质量、时长等计算强度
    // 这里简单返回固定值
    return 4;
}
```

#### 优缺点分析

**优点**:
- ✅ 历史数据一目了然，视觉冲击力强
- ✅ 类似 GitHub Contributions 的熟悉感
- ✅ 适合长期习惯追踪
- ✅ 占用空间相对紧凑

**缺点**:
- ❌ 实现复杂度较高
- ❌ 在小屏幕上可能显示不佳
- ❌ 需要计算和存储大量历史数据
- ❌ 对短期用户价值有限

---

### 方案四：折叠式习惯列表（推荐度：⭐⭐⭐⭐）

#### 方案名称
**"可折叠习惯组"方案**

#### 设计描述
在任务列表顶部添加一个可折叠的"每日习惯"分组。该分组默认展开，显示所有每日重复任务。每个习惯显示为精简的任务项，包含标题、连续天数、今日完成状态。点击分组标题可以折叠/展开。长期任务可以放在另一个分组中。

#### 数据结构设计

```javascript
// 数据结构与方案一相同，增加分组信息
{
    // ... 同方案一
    
    // 任务分组（自动计算）
    displayGroup: 'habits',  // 'habits' | 'tasks' | 'longterm'
}
```

#### UI 渲染代码

**HTML 结构**:
```html
<!-- 侧边栏内容 -->
<div class="sidebar-content">
    <!-- 每日习惯分组 -->
    <div class="task-group habits-group" data-group="habits">
        <div class="group-header" data-toggle="habits">
            <div class="group-title">
                <i class="fas fa-fire group-icon"></i>
                <span>每日习惯</span>
                <span class="group-count">(3)</span>
            </div>
            <div class="group-actions">
                <span class="group-stats">🔥 最长7天</span>
                <i class="fas fa-chevron-down group-toggle"></i>
            </div>
        </div>
        
        <div class="group-content" id="habits-content">
            <!-- 习惯任务项 -->
            <div class="sidebar-task-item recurring-task daily-task" data-id="task_001">
                <div class="task-checkbox">
                    <i class="far fa-circle"></i>
                </div>
                <div class="task-body">
                    <div class="task-header">
                        <span class="task-title">每日晨跑</span>
                        <div class="task-habit-indicator">
                            <span class="habit-streak-badge">🔥 7</span>
                        </div>
                    </div>
                </div>
            </div>
            <!-- 更多习惯... -->
        </div>
    </div>
    
    <!-- 普通任务分组 -->
    <div class="task-group tasks-group" data-group="tasks">
        <div class="group-header" data-toggle="tasks">
            <div class="group-title">
                <i class="fas fa-tasks group-icon"></i>
                <span>任务</span>
                <span class="group-count">(5)</span>
            </div>
            <i class="fas fa-chevron-down group-toggle"></i>
        </div>
        <div class="group-content" id="tasks-content">
            <!-- 普通任务项 -->
        </div>
    </div>
</div>
```

**CSS 样式**:
```css
/* 任务分组 */
.task-group {
    margin-bottom: 8px;
}

.group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    transition: all 0.2s;
}

.group-header:hover {
    background: rgba(255, 255, 255, 0.08);
}

.group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
}

.group-icon {
    color: #ff6b6b;
    font-size: 12px;
}

.group-count {
    color: rgba(255, 255, 255, 0.5);
    font-weight: 400;
}

.group-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.group-stats {
    font-size: 11px;
    color: rgba(255, 107, 107, 0.8);
}

.group-toggle {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.5);
    transition: transform 0.2s;
}

.task-group.collapsed .group-toggle {
    transform: rotate(-90deg);
}

/* 分组内容 */
.group-content {
    padding: 8px 0;
    max-height: 1000px;
    overflow: hidden;
    transition: max-height 0.3s ease, opacity 0.3s ease;
}

.task-group.collapsed .group-content {
    max-height: 0;
    opacity: 0;
    padding: 0;
}

/* 习惯分组特殊样式 */
.habits-group .group-header {
    background: linear-gradient(
        135deg,
        rgba(255, 107, 107, 0.15) 0%,
        rgba(255, 255, 255, 0.05) 100%
    );
    border-left: 3px solid #ff6b6b;
}

.habits-group .group-content .sidebar-task-item {
    margin-left: 12px;
    border-left: 2px solid rgba(255, 107, 107, 0.3);
}

/* 习惯指示器 */
.task-habit-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
}

.habit-streak-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    background: rgba(255, 107, 107, 0.2);
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: #ff6b6b;
}

/* 长期任务分组 */
.longterm-group .group-header {
    background: linear-gradient(
        135deg,
        rgba(156, 39, 176, 0.15) 0%,
        rgba(255, 255, 255, 0.05) 100%
    );
    border-left: 3px solid #9c27b0;
}

.longterm-group .group-icon {
    color: #9c27b0;
}
```

**JavaScript 渲染逻辑**:
```javascript
/**
 * 渲染分组任务列表
 */
renderGroupedTasks() {
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    // 分组任务
    const habits = this.memos.filter(t => 
        t.recurrence?.enabled && t.recurrence?.type === 'daily'
    );
    const longTerm = this.memos.filter(t => 
        t.longTerm?.enabled
    );
    const regularTasks = this.memos.filter(t => 
        !t.recurrence?.enabled && !t.longTerm?.enabled
    );
    
    // 渲染习惯分组
    if (habits.length > 0) {
        const habitsGroup = this.createTaskGroup('habits', '每日习惯', habits, {
            icon: 'fa-fire',
            stats: `🔥 最长${Math.max(...habits.map(h => h.habit?.streak || 0))}天`
        });
        container.appendChild(habitsGroup);
    }
    
    // 渲染长期任务分组
    if (longTerm.length > 0) {
        const longTermGroup = this.createTaskGroup('longterm', '长期任务', longTerm, {
            icon: 'fa-calendar-alt'
        });
        container.appendChild(longTermGroup);
    }
    
    // 渲染普通任务分组
    if (regularTasks.length > 0) {
        const tasksGroup = this.createTaskGroup('tasks', '任务', regularTasks, {
            icon: 'fa-tasks'
        });
        container.appendChild(tasksGroup);
    }
}

/**
 * 创建任务分组
 */
createTaskGroup(groupId, title, tasks, options = {}) {
    const group = document.createElement('div');
    group.className = `task-group ${groupId}-group`;
    group.dataset.group = groupId;
    
    const header = document.createElement('div');
    header.className = 'group-header';
    header.dataset.toggle = groupId;
    
    header.innerHTML = `
        <div class="group-title">
            <i class="fas ${options.icon || 'fa-tasks'} group-icon"></i>
            <span>${title}</span>
            <span class="group-count">(${tasks.length})</span>
        </div>
        <div class="group-actions">
            ${options.stats ? `<span class="group-stats">${options.stats}</span>` : ''}
            <i class="fas fa-chevron-down group-toggle"></i>
        </div>
    `;
    
    const content = document.createElement('div');
    content.className = 'group-content';
    content.id = `${groupId}-content`;
    
    // 渲染任务项
    tasks.forEach((task, index) => {
        const taskItem = this.createSidebarTaskItem(task, index + 1, tasks.length);
        content.appendChild(taskItem);
    });
    
    group.appendChild(header);
    group.appendChild(content);
    
    // 绑定折叠/展开事件
    header.addEventListener('click', () => {
        group.classList.toggle('collapsed');
    });
    
    return group;
}
```

#### 优缺点分析

**优点**:
- ✅ 与现有系统完美融合
- ✅ 节省空间，可按需展开/折叠
- ✅ 实现简单，改动最小
- ✅ 分组清晰，易于管理
- ✅ 支持多个分组（习惯、长期、普通）

**缺点**:
- ❌ 视觉冲击力不如卡片式
- ❌ 习惯统计信息展示有限
- ❌ 需要点击展开才能看到所有习惯

---

### 方案五：混合展示（推荐度：⭐⭐⭐⭐⭐）

#### 方案名称
**"卡片 + 列表混合"方案**

#### 设计描述
结合方案二和方案四的优点：在侧边栏顶部显示一个紧凑的习惯卡片区域（显示2-3个最重要的习惯），下方是可折叠的习惯列表（显示所有习惯），再下方是普通任务列表。这样既保证了重要习惯的突出显示，又不会占用过多空间。

#### 数据结构设计

```javascript
// 数据结构与方案一相同，增加优先级标识
{
    // ... 同方案一
    
    // 习惯显示优先级（用于决定是否在顶部卡片显示）
    habitPriority: 'high',  // 'high' | 'normal'
}
```

#### UI 渲染代码

**HTML 结构**:
```html
<!-- 侧边栏内容 -->
<div class="sidebar-content">
    <!-- 顶部重要习惯卡片（最多3个） -->
    <div class="top-habits-section">
        <div class="section-header">
            <h3 class="section-title">
                <i class="fas fa-star"></i>
                <span>重点习惯</span>
            </h3>
        </div>
        <div class="top-habits-grid">
            <!-- 重要习惯卡片（简化版） -->
            <div class="top-habit-card" data-id="task_001">
                <div class="top-habit-icon">🏃</div>
                <div class="top-habit-info">
                    <div class="top-habit-title">每日晨跑</div>
                    <div class="top-habit-streak">🔥 7</div>
                </div>
                <button class="top-habit-check">
                    <i class="fas fa-check"></i>
                </button>
            </div>
        </div>
    </div>
    
    <!-- 所有习惯分组（可折叠） -->
    <div class="task-group habits-group collapsed" data-group="habits">
        <!-- 同方案四 -->
    </div>
    
    <!-- 普通任务分组 -->
    <div class="task-group tasks-group" data-group="tasks">
        <!-- 同方案四 -->
    </div>
</div>
```

**CSS 样式**:
```css
/* 顶部重要习惯区域 */
.top-habits-section {
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: linear-gradient(
        180deg,
        rgba(255, 107, 107, 0.1) 0%,
        transparent 100%
    );
}

.top-habits-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-top: 8px;
}

/* 顶部习惯卡片（紧凑版） */
.top-habit-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    transition: all 0.2s;
    cursor: pointer;
}

.top-habit-card:hover {
    background: rgba(255, 255, 255, 0.12);
    transform: translateY(-1px);
}

.top-habit-card.completed {
    opacity: 0.6;
    border-color: rgba(76, 175, 80, 0.5);
}

.top-habit-icon {
    font-size: 20px;
    flex-shrink: 0;
}

.top-habit-info {
    flex: 1;
    min-width: 0;
}

.top-habit-title {
    font-size: 12px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.top-habit-streak {
    font-size: 10px;
    color: #ff6b6b;
    font-weight: 600;
}

.top-habit-check {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(76, 175, 80, 0.2);
    border: 1px solid rgba(76, 175, 80, 0.4);
    border-radius: 6px;
    color: #4caf50;
    cursor: pointer;
    transition: all 0.2s;
}

.top-habit-check:hover {
    background: rgba(76, 175, 80, 0.3);
    transform: scale(1.1);
}

.top-habit-card.completed .top-habit-check {
    background: #4caf50;
    color: white;
}
```

**JavaScript 渲染逻辑**:
```javascript
/**
 * 渲染混合布局
 */
renderHybridLayout() {
    const container = document.getElementById('sidebar-content');
    container.innerHTML = '';
    
    const habits = this.memos.filter(t => 
        t.recurrence?.enabled && t.recurrence?.type === 'daily'
    );
    
    // 获取重要习惯（优先级高的，最多3个）
    const topHabits = habits
        .filter(h => h.habitPriority === 'high')
        .slice(0, 3);
    
    // 渲染顶部重要习惯
    if (topHabits.length > 0) {
        const topSection = this.createTopHabitsSection(topHabits);
        container.appendChild(topSection);
    }
    
    // 渲染所有习惯分组（默认折叠）
    if (habits.length > 0) {
        const habitsGroup = this.createTaskGroup('habits', '所有习惯', habits, {
            icon: 'fa-fire',
            collapsed: true  // 默认折叠
        });
        container.appendChild(habitsGroup);
    }
    
    // 渲染普通任务
    const regularTasks = this.memos.filter(t => 
        !t.recurrence?.enabled && !t.longTerm?.enabled
    );
    if (regularTasks.length > 0) {
        const tasksGroup = this.createTaskGroup('tasks', '任务', regularTasks);
        container.appendChild(tasksGroup);
    }
}

/**
 * 创建顶部重要习惯区域
 */
createTopHabitsSection(habits) {
    const section = document.createElement('div');
    section.className = 'top-habits-section';
    
    section.innerHTML = `
        <div class="section-header">
            <h3 class="section-title">
                <i class="fas fa-star"></i>
                <span>重点习惯</span>
            </h3>
        </div>
        <div class="top-habits-grid" id="top-habits-grid"></div>
    `;
    
    const grid = section.querySelector('#top-habits-grid');
    
    habits.forEach(habit => {
        const card = this.createTopHabitCard(habit);
        grid.appendChild(card);
    });
    
    return section;
}

/**
 * 创建顶部习惯卡片
 */
createTopHabitCard(habit) {
    const card = document.createElement('div');
    card.className = `top-habit-card ${habit.completed ? 'completed' : ''}`;
    card.dataset.id = habit.id;
    
    const today = this.getTodayDate();
    const isCompleted = habit.habit?.completedDates?.includes(today);
    
    card.innerHTML = `
        <div class="top-habit-icon">${habit.habitCard?.icon || '📝'}</div>
        <div class="top-habit-info">
            <div class="top-habit-title">${habit.title}</div>
            <div class="top-habit-streak">🔥 ${habit.habit?.streak || 0}</div>
        </div>
        <button class="top-habit-check">
            <i class="fas fa-check"></i>
        </button>
    `;
    
    const checkBtn = card.querySelector('.top-habit-check');
    checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHabitCompletion(habit.id);
    });
    
    card.addEventListener('click', () => {
        this.showTaskDetail(habit.id);
    });
    
    return card;
}
```

#### 优缺点分析

**优点**:
- ✅ 兼顾重要习惯的突出显示和空间效率
- ✅ 顶部卡片提供快速操作入口
- ✅ 下方列表提供完整视图
- ✅ 灵活可配置（哪些习惯显示在顶部）
- ✅ 平衡了视觉冲击力和实用性

**缺点**:
- ❌ 实现复杂度中等
- ❌ 需要维护两套渲染逻辑
- ❌ 可能让用户困惑（为什么有些习惯在上面）

---

## 三、推荐方案

### 3.1 综合评估

| 方案 | 视觉冲击 | 空间效率 | 实现难度 | 用户体验 | 综合评分 |
|-----|---------|---------|---------|---------|---------|
| 方案一：混排展示 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 4.0 |
| 方案二：独立习惯区域 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 4.5 |
| 方案三：日历热力图 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | 3.5 |
| 方案四：折叠式习惯列表 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 4.0 |
| 方案五：混合展示 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 4.5 |

### 3.2 推荐方案：方案五（混合展示）

#### 推荐理由

1. **平衡性最佳**: 既保证了重要习惯的突出显示，又不会占用过多空间
2. **用户体验优秀**: 
   - 顶部卡片提供快速操作入口，符合"重要信息优先"原则
   - 下方列表提供完整视图，满足查看所有习惯的需求
   - 可折叠设计，用户可按需展开/收起
3. **实现可行性高**: 结合现有系统，改动相对较小
4. **扩展性强**: 可以灵活配置哪些习惯显示在顶部，支持未来功能扩展
5. **符合用户习惯**: 类似主流应用的"置顶 + 列表"模式

#### 实施建议

**第一阶段（MVP）**:
1. 实现方案四（折叠式习惯列表）作为基础
2. 添加重复任务数据结构和基本渲染
3. 实现习惯完成状态追踪和连续天数计算

**第二阶段（增强）**:
1. 在方案四基础上添加顶部重要习惯卡片（方案五）
2. 添加习惯优先级设置
3. 优化卡片交互和动画效果

**第三阶段（高级功能）**:
1. 添加习惯统计面板（点击查看详情）
2. 添加周视图/月视图切换
3. 添加习惯提醒功能

### 3.3 备选方案：方案二（独立习惯区域）

如果用户更注重习惯追踪的视觉体验，可以考虑方案二。适合以下场景：
- 习惯追踪是核心功能
- 用户习惯数量较多（5+）
- 希望提供丰富的统计和可视化

---

## 四、技术实现要点

### 4.1 数据存储

```javascript
// 存储结构（扩展现有 memos）
{
    memos: [
        {
            // ... 现有字段
            recurrence: {
                enabled: true,
                type: 'daily',
                // ...
            },
            habit: {
                streak: 7,
                bestStreak: 14,
                completedDates: [],
                totalCompletions: 45
            },
            habitPriority: 'high'  // 用于决定是否显示在顶部
        }
    ]
}
```

### 4.2 每日任务更新逻辑

```javascript
/**
 * 每日凌晨更新重复任务
 */
async function updateDailyRecurringTasks() {
    const today = this.getTodayDate();
    
    for (const task of this.memos) {
        if (!task.recurrence?.enabled) continue;
        
        if (task.recurrence.type === 'daily') {
            // 更新截止日期为今天
            task.dueDate = today;
            task.completed = false;
            
            // 检查昨天是否完成，更新连续天数
            const yesterday = this.getDateString(new Date(Date.now() - 86400000));
            if (!task.habit.completedDates.includes(yesterday)) {
                // 连续天数重置
                task.habit.streak = 0;
            }
            
            await this.saveTask(task);
        }
    }
}

// 使用 chrome.alarms 在每天00:00触发
chrome.alarms.create('updateDailyTasks', {
    when: getNextMidnight(),
    periodInMinutes: 24 * 60
});
```

### 4.3 连续天数计算

```javascript
/**
 * 计算连续完成天数
 */
calculateStreak(completedDates) {
    if (!completedDates || completedDates.length === 0) return 0;
    
    // 按日期排序（降序）
    const sorted = [...completedDates]
        .map(d => new Date(d))
        .sort((a, b) => b - a);
    
    let streak = 0;
    let expectedDate = new Date();
    expectedDate.setHours(0, 0, 0, 0);
    
    for (const completedDate of sorted) {
        completedDate.setHours(0, 0, 0, 0);
        
        if (completedDate.getTime() === expectedDate.getTime()) {
            streak++;
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    return streak;
}
```

### 4.4 性能优化

1. **懒加载**: 习惯统计面板按需加载
2. **缓存**: 缓存计算结果（连续天数、完成率等）
3. **防抖**: 完成操作使用防抖，避免频繁保存
4. **虚拟滚动**: 如果习惯数量很多，使用虚拟滚动

---

## 五、总结

本次调研通过分析主流任务管理工具、GitHub开源项目和Chrome扩展案例，总结出5种可行的展示方案。**推荐采用方案五（混合展示）**，它平衡了视觉冲击力、空间效率和实现难度，最适合当前项目的需求。

关键设计原则：
1. **渐进式展示**: 重要信息优先，详细信息按需展开
2. **视觉反馈**: 通过颜色、图标、进度等提供即时反馈
3. **操作便捷**: 减少操作步骤，提高完成效率
4. **数据驱动**: 通过统计数据增强用户成就感

下一步建议：
1. 先实现方案四作为MVP
2. 收集用户反馈
3. 根据反馈决定是否升级到方案五或方案二

---

**调研完成日期**: 2026-02-07  
**文档版本**: v1.0  
**维护者**: AI Assistant
