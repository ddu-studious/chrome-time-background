# PRD：每日时间计划表（Daily Schedule Planner）

**产品名称**: 中国风景时钟  
**功能名称**: 每日时间计划表（Daily Schedule Planner）  
**版本号**: v3.18.0  
**作者**: AI Agent  
**日期**: 2026-04-15  
**状态**: 待用户确认  
**关联调研**: `docs/research/daily-schedule-planner-research.md`  
**交互 Demo**: `docs/research/schedule-demos.html`

---

## 一、产品概述

### 1.1 背景

用户现有的"任务系统"（待办导向）和"工作日志"（记录导向）缺少**规划维度**——即"我什么时候做什么"。用户希望有一个时间计划表来规划每天的工作、学习、生活安排，形成**计划→执行→记录**的完整闭环。

### 1.2 产品定位

> **轻量每日时间规划助手，融合习惯养成与灵活计划**

- 每天打开浏览器新标签页，30 秒内看到今日安排
- 固定例程（习惯）+ 灵活计划（时间块）双层结构
- 分类可视化（工作/学习/生活），确保时间平衡
- 与任务系统、工作日志无缝联动

### 1.3 目标用户

- 希望规划每日时间分配的个人用户
- 需要养成良好习惯的自律爱好者
- 希望平衡工作/学习/生活的知识工作者

### 1.4 成功指标

| 指标 | 目标 |
|------|------|
| 功能使用率 | > 30% 日活用户打开计划面板 |
| 平均每日计划数 | ≥ 4 条（例程+灵活计划） |
| 习惯连续天数 | 平均 > 7 天 |
| 与工作日志联动率 | > 20% 计划转为工时记录 |

---

## 二、推荐方案：形态 E — 时间线 + 习惯追踪

### 2.1 核心理念

```
每日计划 = 固定例程（习惯养成） + 灵活计划（时间块安排）
         ↓                      ↓
    "每天必须做的"           "今天打算做什么"
    连续天数 + 打卡           时间段 + 分类 + 预估时长
```

### 2.2 为什么选择形态 E

| 决策因素 | 说明 |
|---------|------|
| **场景匹配** | 用户需要"辅助工作、学习、生活"→ 双层结构完美覆盖习惯+计划 |
| **用户粘性** | 习惯打卡的连续天数和🔥机制，强力提升日活 |
| **开发复杂度** | 中等，约 1000~1500 行 JS，可复用现有磨砂玻璃设计语言 |
| **扩展性** | v2 可叠加周视图（形态C）、时间轮盘（形态D）等分析能力 |
| **与现有功能** | 计划→任务（已有）→工作日志（已有），形成闭环 |

---

## 三、功能设计

### 3.1 数据模型

#### 习惯/例程（Routine）

```javascript
{
    id: string,              // 'routine_' + timestamp
    name: string,            // "晨跑"
    icon: string,            // emoji: "🏃"
    time: string,            // "06:30" 建议时间
    duration: number,        // 30 (分钟)
    category: string,        // 'work' | 'study' | 'life'
    frequency: string,       // 'daily' | 'weekdays' | 'weekends' | 'custom'
    customDays: number[],    // [1,2,3,4,5] 周几执行（frequency=custom时）
    enabled: boolean,        // 是否启用
    sortOrder: number,       // 排序
    createdAt: number        // 创建时间戳
}
```

#### 灵活计划（Plan）

```javascript
{
    id: string,              // 'plan_' + timestamp
    name: string,            // "Chrome 扩展开发"
    icon: string,            // emoji: "💻"
    date: string,            // '2026-04-15'
    startTime: string,       // '09:00'
    endTime: string,         // '11:00'
    duration: number,        // 120 (分钟，自动计算)
    category: string,        // 'work' | 'study' | 'life'
    completed: boolean,      // 是否完成
    linkedTaskId: string,    // 关联任务ID（可选）
    linkedWorklogId: string, // 关联工作日志ID（可选）
    note: string,            // 备注
    createdAt: number
}
```

#### 打卡记录（HabitLog）

```javascript
// 按日期索引
{
    '2026-04-15': {
        routines: {
            'routine_xxx': { checked: true, checkedAt: timestamp },
            'routine_yyy': { checked: false }
        },
        streak: 15   // 连续规划天数
    }
}
```

### 3.2 存储设计

```javascript
chrome.storage.local: {
    scheduleRoutines: Routine[],     // 习惯列表
    schedulePlans: Plan[],           // 灵活计划（保留90天）
    scheduleHabitLog: HabitLog,      // 打卡记录（保留90天）
    scheduleSettings: {
        enabled: boolean,            // 功能开关
        defaultView: 'today',        // 默认视图
        showCompleted: boolean,      // 显示已完成项
        reminderEnabled: boolean,    // 是否启用提醒
        categories: [                // 自定义分类
            { id: 'work', name: '工作', color: '#60a5fa', icon: '💼' },
            { id: 'study', name: '学习', color: '#34d399', icon: '📚' },
            { id: 'life', name: '生活', color: '#fbbf24', icon: '🏠' }
        ]
    }
}
```

### 3.3 UI 结构

```
┌─────────────────────────────────────────┐
│  ☰ 每日计划              [📅] [📋] [⚙️] │  ← 标题栏 + 操作按钮
├─────────────────────────────────────────┤
│                                          │
│  🔄 每日例程 · 习惯打卡                   │  ← 习惯区域
│  ├ ☑ 🏃 晨跑         [🔥连续15天]        │     点击圆圈打卡
│  ├ ☑ 📖 英语阅读     [连续7天]            │     连续天数徽标
│  ├ ☐ 🧘 冥想         [连续3天]            │
│  └ ☐ 📝 睡前总结     [🔥连续22天]         │
│                                          │
│  ──────────────────────────────────────  │  ← 分隔线
│                                          │
│  ⏰ 灵活计划 · 今日安排                   │  ← 计划区域
│  ├ 08:00-10:00 💻 扩展开发    工作 2h    │     带时间段+分类
│  ├ 10:30-11:30 📋 代码Review  工作 1h  ← │     当前进行中高亮
│  ├ 13:00-14:30 📚 算法练习    学习 1.5h  │
│  ├ 14:30-16:30 📝 需求文档    工作 2h    │
│  ├ 17:00-18:00 🏋️ 健身运动   生活 1h    │
│  └ [+ 添加计划]                          │     快速添加
│                                          │
├─────────────────────────────────────────┤
│  完成 3/9 · 工作5h·学习2.75h·生活1.75h  │  ← 底部统计
│                          [🔥连续规划15天] │     连续规划徽标
└─────────────────────────────────────────┘
```

### 3.4 核心交互

| 操作 | 交互方式 | 说明 |
|------|---------|------|
| 打卡习惯 | 点击圆形 checkbox | 带弹性动画，连续天数实时更新 |
| 完成计划 | 点击计划条目 | 半透明+删除线标记完成 |
| 添加计划 | 点击 [+ 添加计划] | 弹出创建表单 |
| 编辑计划 | 长按/右键计划 | 弹出编辑表单 |
| 删除计划 | 左滑或编辑中删除 | 确认后删除 |
| 管理习惯 | 点击标题栏 📋 按钮 | 打开习惯管理面板 |
| 切换日期 | 点击标题栏 📅 按钮 | 日历选择器 |
| 查看设置 | 点击标题栏 ⚙️ 按钮 | 分类管理、提醒开关等 |

### 3.5 入口设计

1. **Dock 栏按钮**：右下角 dock-bar 新增 "📅 时间计划" 按钮
2. **面板形式**：悬浮面板（类似工作日志），从右下角弹出
3. **快捷键**：可选绑定（不占用已有快捷键）

---

## 四、功能优先级

### P0（MVP 必须）

- [ ] 习惯列表展示和打卡
- [ ] 灵活计划的增删改查
- [ ] 分类标签和颜色编码
- [ ] 今日统计底栏
- [ ] Dock 栏入口按钮
- [ ] 数据持久化（chrome.storage.local）
- [ ] 设置面板开关

### P1（体验提升）

- [ ] 连续天数和🔥徽标
- [ ] 当前进行中计划高亮
- [ ] 计划创建/编辑表单
- [ ] 习惯管理面板（增删改）
- [ ] 按日期切换查看历史

### P2（进阶迭代）

- [ ] 计划模板（工作日/周末/自定义）
- [ ] 从任务系统导入计划
- [ ] 计划完成后自动生成工作日志条目
- [ ] 周视图统计
- [ ] 时间轮盘分析图表
- [ ] 数据导出

---

## 五、与现有功能联动

### 5.1 任务系统 → 计划

```
任务列表中的任务 → [安排到计划] → 自动填充到灵活计划
```

### 5.2 计划 → 工作日志

```
灵活计划完成 → [记录到日志] → 自动创建工时条目（项目+描述+耗时）
```

### 5.3 数据流

```
  任务(memo.js)  ←───→  计划(schedule.js)  ←───→  日志(worklog.js)
  "我要做什么"          "我何时做什么"             "我做了什么"
  (待办)               (规划)                    (记录)
```

---

## 六、技术实现

### 6.1 文件结构

```
js/schedule.js        — ScheduleManager 核心类（~1200行）
css/schedule.css      — 样式（~400行）
index.html            — dock-bar 入口按钮
js/settings.js        — 新增 enableSchedule 设置项
settings.html         — 设置面板新增计划开关
```

### 6.2 模块接口

```javascript
class ScheduleManager {
    // 初始化
    async init()
    
    // 面板控制
    toggle()
    openPanel()
    closePanel()
    
    // 习惯管理
    addRoutine(routine)
    updateRoutine(id, updates)
    removeRoutine(id)
    toggleRoutineCheck(routineId, date)
    getStreak(routineId)
    
    // 灵活计划
    addPlan(plan)
    updatePlan(id, updates)
    removePlan(id)
    completePlan(id)
    getPlansForDate(date)
    
    // 统计
    getDaySummary(date)
    getWeekSummary(weekStart)
}

window.scheduleManager = new ScheduleManager();
```

### 6.3 性能策略

- **延迟初始化**：通过 `enableSchedule` 设置控制
- **按需渲染**：仅渲染当天数据，历史通过日期选择器按需加载
- **存储清理**：自动归档 90 天前的计划和打卡记录
- **DOM 最小化**：面板关闭时移除内部 DOM

---

## 七、设计规范

### 7.1 视觉风格

- 复用项目磨砂玻璃设计语言（`backdrop-filter: blur(16px)`）
- 深色主题，与主页面一致
- Font Awesome 6 图标
- 分类颜色：工作=#60a5fa、学习=#34d399、生活=#fbbf24

### 7.2 动画

- 打卡动画：弹性缩放 `checkPop`
- 面板弹出：`fadeIn` + `translateY`
- 完成状态：平滑过渡到半透明

---

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| 功能与任务系统重叠 | 明确定位差异：任务=待办，计划=时间安排 |
| 用户不愿每天维护 | 习惯打卡的连续天数激励 + 计划模板减少录入 |
| 存储空间 | 90天自动归档 + 数据压缩 |
| 面板过多导致拥挤 | 复用悬浮面板模式，同时只显示一个面板 |

---

## 九、待用户确认

1. **方案选择**：推荐形态 E（时间线+习惯追踪），是否认可？或倾向其他形态？
2. **功能范围**：MVP 先做 P0，还是一步到位含 P1？
3. **入口位置**：dock-bar 按钮 or 侧边栏标签页？
4. **习惯预设**：是否需要预设一些常见习惯模板？
5. **联动需求**：是否需要与任务系统/工作日志的联动（P2 级别）？
