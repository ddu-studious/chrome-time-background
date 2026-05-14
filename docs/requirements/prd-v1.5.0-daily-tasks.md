# v1.5.0 每日任务功能需求文档

## 概述

### 功能目标
为中国风景时钟扩展添加一个强大且易用的每日任务管理功能，类似于备忘录但专注于日常任务规划和提醒。

### 版本信息
- **目标版本**: v1.5.0
- **创建日期**: 2026-01-30
- **状态**: 待开发

---

## 核心需求

### 1. 每日任务管理

#### 1.1 任务创建
- [x] 快速添加任务（标题必填）
- [x] 任务详情描述（可选）
- [x] 设置截止日期（默认为今天）
- [ ] **新增**: 设置具体时间（小时:分钟）
- [ ] **新增**: 重复任务设置
  - 每天重复
  - 每周重复（选择星期几）
  - 每月重复（选择日期）
  - 自定义重复间隔

#### 1.2 任务查看
- [x] 今日任务视图
- [x] 所有任务列表
- [ ] **新增**: 本周任务视图
- [ ] **新增**: 日历视图（可选）
- [ ] **新增**: 过期任务高亮显示

#### 1.3 任务操作
- [x] 标记完成/未完成
- [x] 编辑任务
- [x] 删除任务
- [ ] **新增**: 快速推迟（推迟到明天/下周）
- [ ] **新增**: 任务复制

---

### 2. 存储方案

#### 2.1 存储分析

| 存储类型 | 容量 | 同步 | 适用场景 |
|---------|-----|------|---------|
| `chrome.storage.sync` | 100KB (8KB/项) | ✅ | 用户设置 |
| `chrome.storage.local` | 10MB | ❌ | 任务数据 |
| `chrome.storage.session` | 10MB | ❌ | 临时缓存 |

#### 2.2 推荐方案

**任务数据存储策略**:

```javascript
// 1. 用户设置 -> sync（跨设备同步）
{
    dailyTaskSettings: {
        defaultReminderTime: '09:00',    // 默认提醒时间
        showOverdueFirst: true,           // 过期任务置顶
        enableNotifications: true,        // 启用通知
        reminderAdvanceMinutes: 30        // 提前提醒时间（分钟）
    }
}

// 2. 任务数据 -> local（大容量）
{
    dailyTasks: [
        {
            id: 'task_1706601600000',
            title: '完成项目报告',
            description: '整理Q1季度数据',
            dueDate: '2026-01-30',
            dueTime: '17:00',              // 新增：具体时间
            repeat: {                       // 新增：重复设置
                type: 'daily',              // 'none' | 'daily' | 'weekly' | 'monthly' | 'custom'
                weekDays: [1, 3, 5],        // 仅 weekly 时使用
                monthDay: 15,               // 仅 monthly 时使用
                interval: 1                 // 自定义间隔天数
            },
            completed: false,
            completedAt: null,
            createdAt: 1706601600000,
            updatedAt: 1706601600000,
            categoryId: 'work',
            priority: 'high',
            reminders: [                    // 新增：提醒设置
                {
                    id: 'reminder_1',
                    time: '2026-01-30T16:30:00',  // 提前30分钟
                    sent: false
                }
            ]
        }
    ]
}
```

#### 2.3 数据量估算

- 单个任务平均大小: ~500 bytes
- `storage.local` 容量: 10MB
- 最大存储任务数: ~20,000 个
- 推荐保留任务数: 最近 6 个月或 1000 个

#### 2.4 数据清理策略

```javascript
// 自动清理已完成超过30天的任务
async function cleanOldTasks() {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const { dailyTasks } = await chrome.storage.local.get('dailyTasks');
    
    const cleaned = dailyTasks.filter(task => 
        !task.completed || task.completedAt > thirtyDaysAgo
    );
    
    await chrome.storage.local.set({ dailyTasks: cleaned });
}
```

---

### 3. 提醒机制

#### 3.1 提醒类型

| 提醒类型 | 触发时机 | 实现方式 |
|---------|---------|---------|
| 任务到期提醒 | 任务截止时间前 | chrome.alarms + notifications |
| 每日摘要 | 每天早上（可配置） | chrome.alarms |
| 过期任务提醒 | 有过期未完成任务时 | 定期检查 |

#### 3.2 chrome.alarms 实现

```javascript
// background.js

// 初始化闹钟
chrome.runtime.onInstalled.addListener(async () => {
    // 每日摘要提醒（早上8点）
    await chrome.alarms.create('daily-summary', {
        when: getNextDailyTime(8, 0),
        periodInMinutes: 24 * 60
    });
    
    // 定期检查过期任务（每30分钟）
    await chrome.alarms.create('check-overdue', {
        periodInMinutes: 30
    });
});

// 监听闹钟
chrome.alarms.onAlarm.addListener(async (alarm) => {
    switch (alarm.name) {
        case 'daily-summary':
            await sendDailySummary();
            break;
        case 'check-overdue':
            await checkOverdueTasks();
            break;
        default:
            if (alarm.name.startsWith('task-reminder-')) {
                const taskId = alarm.name.replace('task-reminder-', '');
                await sendTaskReminder(taskId);
            }
    }
});
```

#### 3.3 chrome.notifications 实现

```javascript
// 发送任务提醒
async function sendTaskReminder(taskId) {
    const { dailyTasks } = await chrome.storage.local.get('dailyTasks');
    const task = dailyTasks.find(t => t.id === taskId);
    
    if (task && !task.completed) {
        await chrome.notifications.create(`task-${taskId}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '任务提醒',
            message: task.title,
            priority: task.priority === 'high' ? 2 : 1,
            requireInteraction: true,
            buttons: [
                { title: '完成' },
                { title: '推迟' }
            ]
        });
    }
}

// 发送每日摘要
async function sendDailySummary() {
    const { dailyTasks } = await chrome.storage.local.get('dailyTasks');
    const today = new Date().toISOString().split('T')[0];
    
    const todayTasks = dailyTasks.filter(t => 
        t.dueDate === today && !t.completed
    );
    const overdueTasks = dailyTasks.filter(t => 
        t.dueDate < today && !t.completed
    );
    
    let message = `今日任务: ${todayTasks.length} 个`;
    if (overdueTasks.length > 0) {
        message += `\n过期任务: ${overdueTasks.length} 个`;
    }
    
    await chrome.notifications.create('daily-summary', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '每日任务摘要',
        message: message,
        priority: overdueTasks.length > 0 ? 2 : 1
    });
}
```

#### 3.4 通知交互

```javascript
// 监听通知按钮点击
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    if (notificationId.startsWith('task-')) {
        const taskId = notificationId.replace('task-', '');
        
        if (buttonIndex === 0) {
            // 完成任务
            await markTaskCompleted(taskId);
        } else if (buttonIndex === 1) {
            // 推迟到明天
            await postponeTask(taskId);
        }
        
        chrome.notifications.clear(notificationId);
    }
});

// 监听通知点击
chrome.notifications.onClicked.addListener(async (notificationId) => {
    // 打开新标签页（任务面板）
    await chrome.tabs.create({ url: 'chrome://newtab/' });
    chrome.notifications.clear(notificationId);
});
```

---

### 4. manifest.json 更新

```json
{
    "manifest_version": 3,
    "name": "中国风景时钟",
    "version": "1.5.0",
    "permissions": [
        "storage",
        "geolocation",
        "tabs",
        "alarms",        // 新增
        "notifications"  // 新增
    ],
    "host_permissions": [
        "https://*.unsplash.com/*",
        "https://devapi.qweather.com/*"
    ]
}
```

---

### 5. UI 设计

#### 5.1 每日任务面板

```
┌─────────────────────────────────────┐
│  📋 今日任务 (3)         [+] [⚙️]  │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │ ○ 完成项目报告          🔴高 │  │
│  │   截止: 17:00                 │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ ○ 回复邮件              🟡中 │  │
│  │   截止: 12:00                 │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │ ✓ 晨会                  🟢低 │  │
│  │   已完成 09:30               │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  ⚠️ 过期任务 (1)                   │
│  ┌───────────────────────────────┐  │
│  │ ○ 提交周报              🔴   │  │
│  │   过期 1 天                   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

#### 5.2 任务创建表单

```
┌─────────────────────────────────────┐
│  新建任务                      [×] │
├─────────────────────────────────────┤
│  标题 *                            │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  描述                               │
│  ┌───────────────────────────────┐  │
│  │                               │  │
│  └───────────────────────────────┘  │
│                                     │
│  截止日期          截止时间         │
│  ┌───────────┐    ┌───────────┐    │
│  │ 2026-01-30│    │ 17:00     │    │
│  └───────────┘    └───────────┘    │
│                                     │
│  优先级                             │
│  ○ 高  ○ 中  ○ 低  ● 无            │
│                                     │
│  重复                               │
│  ┌───────────────────────────────┐  │
│  │ 不重复                      ▼│  │
│  └───────────────────────────────┘  │
│                                     │
│  提醒                               │
│  ☑ 提前 [30] 分钟提醒              │
│                                     │
│         [取消]        [保存]        │
└─────────────────────────────────────┘
```

---

### 6. 实现计划

#### Phase 1: 基础每日任务
- [ ] 任务数据结构设计
- [ ] 任务 CRUD 操作
- [ ] 今日任务视图
- [ ] 截止时间设置

#### Phase 2: 提醒功能
- [ ] 添加 alarms 和 notifications 权限
- [ ] Service Worker 提醒逻辑
- [ ] 每日摘要通知
- [ ] 任务到期提醒

#### Phase 3: 高级功能
- [ ] 重复任务
- [ ] 快速推迟
- [ ] 本周视图
- [ ] 数据清理策略

#### Phase 4: 优化和测试
- [ ] 性能优化
- [ ] 存储空间监控
- [ ] 多语言支持
- [ ] 全面测试

---

### 7. 技术要点

#### 7.1 Service Worker 注意事项

- Service Worker 可能在空闲时休眠
- 使用 `chrome.alarms` 确保定时任务可靠执行
- 闹钟最小间隔为 30 秒

#### 7.2 通知权限

- 用户可能禁用通知
- 需要检查 `chrome.notifications.getPermissionLevel()`
- 提供设置选项让用户控制通知

#### 7.3 存储同步

- 任务数据使用 `storage.local`，不跨设备同步
- 如需同步，考虑云端存储方案
- 设置使用 `storage.sync`，可跨设备同步

---

### 8. 测试用例

#### 8.1 任务创建
- [ ] 创建简单任务（仅标题）
- [ ] 创建完整任务（所有字段）
- [ ] 创建重复任务
- [ ] 验证必填字段

#### 8.2 任务提醒
- [ ] 任务到期提醒触发
- [ ] 每日摘要通知
- [ ] 通知按钮交互
- [ ] 禁用通知后的行为

#### 8.3 数据存储
- [ ] 大量任务（1000+）性能
- [ ] 数据清理功能
- [ ] 存储空间监控

---

## 参考资料

- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Chrome Alarms API](https://developer.chrome.com/docs/extensions/reference/api/alarms)
- [Chrome Notifications API](https://developer.chrome.com/docs/extensions/reference/api/notifications)
- [Manifest V3 迁移指南](https://developer.chrome.com/docs/extensions/develop/migrate)

---

**最后更新**: 2026-01-30
