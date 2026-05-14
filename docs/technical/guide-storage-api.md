# Chrome 扩展存储说明书

> 本文档详细说明「中国风景时钟」扩展的数据存储方案、限制及最佳实践。

## 一、存储概述

Chrome 扩展提供三种存储区域，本扩展根据数据特性选择合适的存储方案：

| 存储区域 | 容量限制 | 单项限制 | 同步能力 | 本扩展用途 |
|---------|---------|---------|---------|-----------|
| `chrome.storage.sync` | 100KB | 8KB/项 | ✅ 跨设备同步 | 用户设置 |
| `chrome.storage.local` | 10MB | 无限制 | ❌ 仅本地 | 备忘录数据、图片 |
| `chrome.storage.session` | 10MB | 无限制 | ❌ 会话内 | 天气缓存 |

## 二、数据结构

### 2.1 备忘录对象 (Memo)

```javascript
{
    id: string,              // 唯一标识符 (UUID)
    title: string,           // 任务标题
    text: string,            // 任务描述
    completed: boolean,      // 完成状态
    createdAt: number,       // 创建时间戳 (ms)
    updatedAt: number,       // 更新时间戳 (ms)
    completedAt: number,     // 完成时间戳 (ms) 或 null
    categoryId: string,      // 分类ID 或 null
    tagIds: string[],        // 标签ID数组
    priority: string,        // 优先级: 'high' | 'medium' | 'low' | 'none'
    startDate: string,       // 开始日期: 'YYYY-MM-DD' 或 null (v1.7.0+)
    dueDate: string,         // 截止日期: 'YYYY-MM-DD' 或 null
    images: Array<{          // 图片数组 (v1.5.0+)
        id: string,
        thumbnail: string,   // Base64 缩略图
        fullImage: string    // Base64 原图
    }>,
    progress: {              // 进度追踪 (v1.6.0+) 或 null
        current: number,     // 当前完成数
        total: number        // 总数
    }
}
```

### 2.2 分类对象 (Category)

```javascript
{
    id: string,          // 唯一标识符
    name: string,        // 分类名称
    color: string,       // 颜色代码 (如 '#6366f1')
    parentId: string     // 父分类ID 或 undefined/null (v1.6.0+)
                         // 有 parentId 为二级分类，无 parentId 为一级分类
}
```

**层级说明：**
- 支持两级分类结构（一级 / 二级）
- 一级分类：`parentId` 为空或不存在
- 二级分类：`parentId` 指向一级分类的 `id`
- 拖拽操作可改变分类层级，不影响任务的 `categoryId`
- 选择一级分类筛选时，自动包含其所有子分类下的任务

### 2.3 标签对象 (Tag)

```javascript
{
    id: string,      // 唯一标识符
    name: string,    // 标签名称
    color: string    // 颜色代码
}
```

### 2.4 用户设置 (Settings)

```javascript
{
    theme: string,           // 主题: 'auto' | 'light' | 'dark'
    language: string,        // 语言: 'zh' | 'en'
    timeFormat: string,      // 时间格式: '12h' | '24h'
    showSeconds: boolean,    // 显示秒数
    showWeather: boolean,    // 显示天气
    weatherUnit: string,     // 温度单位: 'celsius' | 'fahrenheit'
    // ... 其他设置
}
```

## 三、存储方案详解

### 3.1 备忘录存储 (chrome.storage.local)

**选择原因：**
- 备忘录可能包含图片（Base64），单项数据可能超过 8KB
- 不需要跨设备同步（避免超出 sync 配额）
- 本地存储提供 10MB 空间，足够存储大量任务

**存储键名：** `memos`

**存储示例：**
```javascript
await chrome.storage.local.set({ 
    memos: [/* 备忘录数组 */] 
});
```

### 3.2 分类和标签存储 (chrome.storage.local)

**选择原因：**
- 数据结构简单，但与备忘录关联
- 保持一致性，统一使用 local 存储

**存储键名：** `categories`、`tags`

### 3.3 用户设置存储 (chrome.storage.sync)

**选择原因：**
- 设置数据量小，适合同步存储
- 用户在不同设备使用时保持一致体验

**存储键名：** 通过 `settingsManager` 管理

### 3.4 天气缓存 (chrome.storage.session)

**选择原因：**
- 临时数据，浏览器关闭后无需保留
- 避免频繁 API 请求

## 四、存储限制与应对策略

### 4.1 配额监控

扩展内置配额检查机制：

```javascript
async checkStorageQuota() {
    const quota = await navigator.storage.estimate();
    const used = quota.usage || 0;
    const total = quota.quota || 10 * 1024 * 1024; // 10MB
    const percent = Math.round((used / total) * 100);
    
    return {
        used,
        total,
        percent,
        safe: percent < 80,
        message: `已使用 ${percent}% 存储空间`
    };
}
```

### 4.2 自动压缩机制

当存储空间超过 90% 时，扩展会自动：
1. 压缩图片质量
2. 删除超过 30 天的已完成任务

### 4.3 紧急清理

当存储空间超过 95% 时：
1. 显示警告提示
2. 建议用户手动删除旧任务或图片

## 五、数据迁移

### 5.1 版本兼容

新版本启动时自动检测并迁移旧数据格式：

```javascript
// 字段迁移示例（v1.6.0 新增 progress 字段）
this.memos = memosData.map(memo => ({
    ...memo,
    progress: memo.progress && typeof memo.progress === 'object' ? {
        current: Math.max(0, parseInt(memo.progress.current) || 0),
        total: Math.max(1, parseInt(memo.progress.total) || 1)
    } : null
}));
```

### 5.2 数据导出/导入

支持 JSON 格式的数据导出和导入，便于备份和迁移。

## 六、调试指南

### 6.1 查看存储内容

在扩展页面的控制台中执行：

```javascript
// 查看本地存储
chrome.storage.local.get(null, (result) => {
    console.log('Local Storage:', result);
});

// 查看同步存储
chrome.storage.sync.get(null, (result) => {
    console.log('Sync Storage:', result);
});

// 查看存储使用情况
chrome.storage.local.getBytesInUse(null, (bytes) => {
    console.log('已使用存储:', bytes, 'bytes');
    console.log('使用百分比:', ((bytes / (10 * 1024 * 1024)) * 100).toFixed(2) + '%');
});
```

### 6.2 清理存储（谨慎使用）

```javascript
// 清除所有本地存储
chrome.storage.local.clear();

// 清除特定数据
chrome.storage.local.remove(['memos']);
```

## 七、最佳实践

### 7.1 防抖保存

避免频繁写入，使用防抖机制：

```javascript
async saveMemos() {
    if (this._saveDebounceTimer) {
        clearTimeout(this._saveDebounceTimer);
    }
    
    this._saveDebounceTimer = setTimeout(async () => {
        await chrome.storage.local.set({ memos: this.memos });
    }, 300); // 300ms 防抖
}
```

### 7.2 图片优化

- 缩略图：最大 200x200 像素，JPEG 质量 0.7
- 原图：最大 1200x1200 像素，JPEG 质量 0.8

### 7.3 定期清理

建议用户定期清理已完成的旧任务，保持存储健康。

## 八、日历与周回顾的数据使用

### 8.1 任务日期跨度 (v1.7.0+ 更新)

任务的时间跨度由 **有效开始日期** 和 `dueDate`（截止日期）决定：

**有效开始日期规则：**
- 优先使用 `startDate`（用户手动设置的计划开始日期）
- 若未设置 `startDate`，则回退到 `createdAt`（创建日期）
- 代码实现：`getTaskStartKey(task)` → `task.startDate || formatDateFromTimestamp(task.createdAt)`

**任务分类：**
- **单日任务**: 无 `dueDate` 或 `dueDate` 等于有效开始日期
- **多日任务**: `dueDate` 晚于有效开始日期，任务覆盖其间所有日期

### 8.2 工期计算能力 (v1.7.0+)

支持两种工期计算方式：

| 计算方式 | 方法 | 说明 |
|---------|------|------|
| 自然日 | `calcCalendarDays(start, end)` | 含首尾的日历天数 |
| 工作日 | `calcWorkdays(start, end)` | 排除周末（周六、周日） |

**工期展示位置：**
- 任务编辑表单：自动显示周期提示（自然日 + 工作日 + 换算周数）
- 日历面板：多日任务显示日期范围和工作日天数
- 周回顾：甘特图 tooltip、时间线卡片显示工作日信息
- 任务管理页详情面板：显示工期统计

### 8.3 日历面板数据聚合

- `buildTaskMapByDateSpan()`: 按日期跨度映射，基于有效开始日期
- `getMultiDayTasksForMonth()`: 获取当月涉及的多日任务，用于轨道渲染

### 8.4 周回顾面板

- 时间范围：当前日期的前后 ±1 周 / ±2 周 / ±1 月 / ±2 月
- 数据来源：复用 `getTaskStartKey()` 和 `dueDate` 计算跨度
- 4 种视图模式：甘特图、时间线、看板列、热力条形图
- 分类筛选：支持包含/排除模式

---

*文档版本: 1.2.0*  
*最后更新: 2026-03-03*
