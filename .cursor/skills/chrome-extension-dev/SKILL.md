---
name: chrome-extension-dev
description: 中国风景时钟扩展开发辅助。用于添加新功能模块、备忘录增强、定时提醒、数据存储优化等。当用户提到"添加功能"、"备忘录"、"提醒"、"调试扩展"时使用。
---

# 中国风景时钟 开发辅助

## 快速参考

### 项目结构

```
chrome-time-background/
├── manifest.json          # 扩展配置 (Manifest V3)
├── index.html             # 新标签页 HTML
├── js/
│   ├── main.js            # 主入口
│   ├── clock.js           # 时钟模块
│   ├── lunar.js           # 农历模块
│   ├── holidays.js        # 节假日模块
│   ├── weather.js         # 天气模块
│   ├── settings.js        # 设置管理
│   ├── i18n.js            # 国际化
│   ├── memo.js            # 备忘录模块（2000+ 行）
│   └── background.js      # Service Worker
└── css/style.css          # 样式（磨砂玻璃效果）
```

---

## 备忘录功能开发

### 现有数据结构

```javascript
// 备忘录对象
{
    id: string,           // 唯一ID
    title: string,        // 标题
    text: string,         // 内容
    completed: boolean,   // 完成状态
    createdAt: number,    // 创建时间戳
    updatedAt: number,    // 更新时间戳
    categoryId: string,   // 分类ID
    tagIds: string[],     // 标签ID数组
    priority: string,     // 优先级: 'high' | 'medium' | 'low' | 'none'
    dueDate: string       // 截止日期: 'YYYY-MM-DD'
}
```

### 添加每日任务功能

在 `js/memo.js` 的 `MemoManager` 类中：

```javascript
/**
 * 添加每日任务
 * @param {Object} task 任务对象
 * @returns {Object} 创建的任务
 */
async addDailyTask(task) {
    const newTask = {
        id: this.generateId(),
        title: task.title,
        text: task.text || '',
        completed: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        categoryId: task.categoryId || null,
        tagIds: task.tagIds || [],
        priority: task.priority || 'none',
        dueDate: task.dueDate || this.getTodayDate(),
        isDaily: true  // 标记为每日任务
    };
    
    this.memos.push(newTask);
    await this.saveMemos();
    
    // 设置提醒
    if (task.reminderTime) {
        await this.setTaskReminder(newTask.id, task.reminderTime);
    }
    
    return newTask;
}

/**
 * 获取今天的日期字符串
 * @returns {string} YYYY-MM-DD 格式
 */
getTodayDate() {
    return new Date().toISOString().split('T')[0];
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
```

---

## 提醒功能开发

### 在 manifest.json 添加权限

```json
{
    "permissions": [
        "storage",
        "geolocation",
        "tabs",
        "alarms",        // 添加
        "notifications"  // 添加
    ]
}
```

### 在 background.js 添加提醒逻辑

```javascript
// 初始化定期检查
chrome.runtime.onInstalled.addListener(() => {
    // 每30分钟检查一次过期任务
    chrome.alarms.create('check-due-tasks', {
        periodInMinutes: 30
    });
    
    // 每天早上8点提醒今日任务
    chrome.alarms.create('daily-reminder', {
        when: getNextReminderTime(8, 0),
        periodInMinutes: 24 * 60
    });
});

// 获取下一个提醒时间
function getNextReminderTime(hour, minute) {
    const now = new Date();
    const reminder = new Date(now);
    reminder.setHours(hour, minute, 0, 0);
    
    if (reminder <= now) {
        reminder.setDate(reminder.getDate() + 1);
    }
    
    return reminder.getTime();
}

// 监听闹钟事件
chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
        case 'check-due-tasks':
            await checkDueTasks();
            break;
        case 'daily-reminder':
            await sendDailyReminder();
            break;
        default:
            // 处理单个任务提醒
            if (alarm.name.startsWith('task-')) {
                await sendTaskReminder(alarm.name.replace('task-', ''));
            }
    }
});

// 检查过期任务
async function checkDueTasks() {
    const { memos } = await chrome.storage.local.get('memos');
    const today = new Date().toISOString().split('T')[0];
    
    const overdue = (memos || []).filter(memo => 
        memo.dueDate && 
        memo.dueDate < today && 
        !memo.completed
    );
    
    if (overdue.length > 0) {
        await chrome.notifications.create('overdue-tasks', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '任务提醒',
            message: `您有 ${overdue.length} 个任务已过期`,
            priority: 2,
            requireInteraction: true
        });
    }
}

// 发送每日提醒
async function sendDailyReminder() {
    const { memos } = await chrome.storage.local.get('memos');
    const today = new Date().toISOString().split('T')[0];
    
    const todayTasks = (memos || []).filter(memo => 
        memo.dueDate === today && !memo.completed
    );
    
    if (todayTasks.length > 0) {
        await chrome.notifications.create('daily-tasks', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '今日任务',
            message: `您今天有 ${todayTasks.length} 个任务待完成`,
            priority: 1
        });
    }
}
```

---

## 存储方案

### 存储限制

| 存储区域 | 容量限制 | 单项限制 | 适用场景 |
|---------|---------|---------|---------|
| `sync` | 100KB | 8KB | 用户设置 |
| `local` | 10MB | 无 | 备忘录数据 |
| `session` | 10MB | 无 | 临时缓存 |

### 推荐方案

```javascript
// 用户设置 -> sync (跨设备同步)
await chrome.storage.sync.set({
    settings: {
        theme: 'light',
        language: 'zh',
        timeFormat: '24h'
    }
});

// 备忘录数据 -> local (大容量)
await chrome.storage.local.set({
    memos: [...],
    categories: [...],
    tags: [...]
});

// 天气缓存 -> session (临时)
await chrome.storage.session.set({
    weatherCache: {
        data: {...},
        timestamp: Date.now()
    }
});
```

---

## 调试技巧

### 日志位置

| 脚本 | 日志查看方式 |
|------|-------------|
| index.html 中的脚本 | 右键新标签页 → 检查 → Console |
| background.js | chrome://extensions/ → 详情 → 检查视图: Service Worker |

### 常用调试代码

```javascript
// 在 memo.js 中
console.log('备忘录数量:', this.memos.length);
console.log('今日任务:', this.getTodayTasks());
console.log('过期任务:', this.getOverdueTasks());

// 查看存储内容
chrome.storage.local.get(null, (result) => {
    console.log('本地存储:', result);
});

// 查看当前闹钟
chrome.alarms.getAll((alarms) => {
    console.log('当前闹钟:', alarms);
});
```

### 重新加载步骤

1. 修改代码
2. 打开 chrome://extensions/
3. 点击扩展卡片的刷新按钮
4. 打开新标签页测试

---

## 代码模板

### 新增备忘录字段模板

```javascript
// 1. 在 loadMemos 中添加字段迁移
this.memos = this.memos.map(memo => ({
    id: memo.id || this.generateId(),
    title: memo.title || '',
    // ... 现有字段
    newField: memo.newField || defaultValue  // 新增字段
}));

// 2. 在表单中添加输入
const newFieldInput = document.createElement('input');
newFieldInput.type = 'text';
newFieldInput.id = 'memo-new-field';
newFieldInput.value = memo ? memo.newField : '';

// 3. 在保存时获取值
const newFieldValue = document.getElementById('memo-new-field').value;
```

### 定时任务模板

```javascript
// 创建一次性闹钟
chrome.alarms.create('task-reminder-' + taskId, {
    when: new Date(dueDate).getTime()
});

// 创建重复闹钟
chrome.alarms.create('daily-check', {
    periodInMinutes: 60  // 每小时
});

// 清除闹钟
chrome.alarms.clear('task-reminder-' + taskId);
```

### 通知模板

```javascript
await chrome.notifications.create('notification-id', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '通知标题',
    message: '通知内容',
    priority: 2,              // -2 到 2
    requireInteraction: true, // 需要用户手动关闭
    silent: false            // 是否静音
});
```

---

## 常见问题

### Storage 配额超限

```javascript
// 检查存储使用情况
chrome.storage.local.getBytesInUse(null, (bytes) => {
    console.log('已使用存储:', bytes, 'bytes');
});

// 清理旧数据
async function cleanOldData() {
    const { memos } = await chrome.storage.local.get('memos');
    const oneMonthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    const cleaned = memos.filter(memo => 
        memo.updatedAt > oneMonthAgo || !memo.completed
    );
    
    await chrome.storage.local.set({ memos: cleaned });
}
```

### 通知不显示

1. 检查 `notifications` 权限是否添加
2. 检查 Chrome 系统设置中是否允许通知
3. 检查 `iconUrl` 路径是否正确

### 闹钟不触发

1. Service Worker 可能休眠，闹钟会唤醒它
2. 最小间隔为 30 秒
3. 检查闹钟是否创建成功

```javascript
chrome.alarms.get('alarm-name', (alarm) => {
    if (alarm) {
        console.log('闹钟存在:', alarm);
    } else {
        console.log('闹钟不存在');
    }
});
```
