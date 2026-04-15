# PRD：每日工作日志与时间追踪

**产品名称**: 中国风景时钟  
**功能名称**: 每日工作日志（Daily Work Log）  
**作者**: AI Agent  
**日期**: 2026-04-14  
**状态**: 待确认  
**关联调研**: `docs/research/daily-worklog-timetracking-research.md`

---

## 一、产品概述

### 1.1 背景

用户反馈现有的"任务"和"常用知识"功能不能满足**每日工作回顾**的需求。用户希望：

- 每天记录"我干了什么"
- 一个主任务下添加"今天都干了什么"（子活动）
- 记录每个活动的花费时间
- 每天提醒维护工作日志

现有任务系统偏向"待办管理"（Todo），缺少"已完成工作记录"（Work Log）的视角。

### 1.2 产品定位

> **轻量每日工作回顾助手，不做重型时间追踪工具**

- 每天打开浏览器，花 30 秒记录今天做了什么
- 主项目 + 今日活动 + 耗时，清晰回顾
- 一周结束，一键看到本周产出

### 1.3 目标用户

- 希望提升做事效率的个人用户
- 需要每日/每周工作汇报的职场人
- 自由职业者记录工时

### 1.4 成功指标


| 指标      | 目标                      |
| ------- | ----------------------- |
| 日志创建率   | 每日打开新标签页的用户中 > 40% 会写日志 |
| 平均每日条目数 | ≥ 3 条工时记录               |
| 周回顾使用率  | > 20% 用户每周查看回顾          |


---

## 二、核心概念

### 2.1 数据模型

```
项目 (Project)
  └── 工时条目 (Time Entry)
        ├── 描述：做了什么
        ├── 耗时：花了多久
        ├── 日期：哪一天
        └── 标签：分类标记
```

**关键区分**：

- **任务（Task/Memo）**：待办导向 → "我要做什么"
- **工时条目（Time Entry）**：记录导向 → "我做了什么，花了多久"

### 2.2 数据结构设计

#### 项目（Project）

```javascript
{
  id: string,            // 唯一ID，'proj_' + timestamp
  name: string,          // 项目名称，如"Chrome扩展开发"
  color: string,         // 项目颜色标识
  icon: string,          // 可选图标
  archived: boolean,     // 是否归档
  createdAt: number,     // 创建时间戳
  sortOrder: number      // 排序权重
}
```

#### 工时条目（Time Entry）

```javascript
{
  id: string,            // 唯一ID，'te_' + timestamp
  projectId: string,     // 所属项目ID
  description: string,   // 做了什么（活动描述）
  date: string,          // 日期 'YYYY-MM-DD'
  duration: number,      // 耗时（分钟）
  startTime: string,     // 开始时间 'HH:mm'（可选，手动输入或计时器产生）
  endTime: string,       // 结束时间 'HH:mm'（可选）
  tags: string[],        // 标签数组
  createdAt: number,     // 创建时间戳
  updatedAt: number      // 更新时间戳
}
```

#### 计时器状态（运行时，不持久化到 storage）

```javascript
{
  isRunning: boolean,    // 是否正在计时
  projectId: string,     // 当前计时的项目
  description: string,   // 当前活动描述
  startedAt: number,     // 计时开始时间戳（持久化到 local 防丢失）
  elapsed: number        // 已过时间（秒，实时计算）
}
```

### 2.3 存储方案


| 数据    | 存储位置                 | Key               | 说明         |
| ----- | -------------------- | ----------------- | ---------- |
| 项目列表  | chrome.storage.local | `worklogProjects` | 项目数量有限，体积小 |
| 工时条目  | chrome.storage.local | `worklogEntries`  | 主数据，可能较大   |
| 计时器状态 | chrome.storage.local | `worklogTimer`    | 防止页面刷新丢失   |
| 功能设置  | chrome.storage.sync  | `settings` 内新增字段  | 与现有设置合并    |


---

## 三、功能需求

### 3.1 Phase 1：MVP（本次实现）

#### F1：每日工作日志面板

**入口**：侧边栏工具栏新增"工作日志"按钮（图标：`fa-clipboard-list`）

**面板布局**：

```
┌─────────────────────────────────────────┐
│ 📋 工作日志          ◀ 2026-04-14 ▶  ✕ │
│─────────────────────────────────────────│
│                                         │
│ ⏱ [描述做了什么...] [项目▼] [▶ 开始]  │  ← 快速记录条
│                                         │
│─────────────────────────────────────────│
│ 今日工时：3h 25m          共 5 条记录   │  ← 今日摘要
│─────────────────────────────────────────│
│                                         │
│ 🟢 Chrome扩展开发                       │  ← 按项目分组
│   • 实现工作日志面板 UI    1h 30m  [✎✕] │
│   • 修复番茄钟 bug         45m    [✎✕] │
│                                         │
│ 🔵 学习                                │
│   • 阅读 Rust 教程         1h 10m [✎✕] │
│                                         │
│ ⚪ 未分类                               │
│   • 团队会议               30m   [✎✕]  │
│                                         │
│─────────────────────────────────────────│
│ [📊 周报] [⚙ 管理项目]                  │  ← 底部操作区
└─────────────────────────────────────────┘
```

**交互细节**：

- 打开面板默认显示**今天**的记录
- 日期导航：左右箭头切换日期，点击日期可弹出日期选择器
- 快速记录条：输入描述 + 选择项目 + 点击"开始计时"或"直接记录"
- 按项目分组展示，组内按时间倒序
- 每条记录可编辑、删除

#### F2：快速记录工时

两种录入方式：

**方式A：计时器模式**

1. 输入描述 + 选项目 → 点击"▶ 开始"
2. 计时器开始运行，按钮变为"⏸ 停止"
3. 点击停止 → 自动计算耗时 → 保存为工时条目
4. 计时状态在顶部或侧边栏有微型指示器（如 `⏱ 45:23`）

**方式B：手动录入**

1. 点击"+"或回车 → 弹出简单表单
2. 填写：描述、项目、耗时（小时:分钟）
3. 保存

#### F3：项目管理

- 创建/编辑/删除/归档项目
- 每个项目有名称和颜色
- 快速记录条的项目选择器支持新建
- 默认提供"未分类"项目

#### F4：每日提醒

- 在设置中可开启"每日日志提醒"
- 可配置提醒时间（默认 18:00，下班前）
- 使用 `chrome.alarms` + `chrome.notifications` 推送
- 通知内容："今天做了什么？点击记录工作日志"
- 点击通知打开新标签页并展开工作日志面板

#### F5：日/周回顾

**日视图**（默认）：

- 按日期查看工时条目
- 显示当日总耗时

**周视图**：

- 点击"周报"按钮打开
- 显示本周每天的工时汇总（柱状图或列表）
- 按项目汇总本周总耗时
- 一键复制为文本（可粘贴到日报/周报）

```
本周工作回顾（2026-04-08 ~ 2026-04-14）
总耗时：32h 15m

📌 Chrome扩展开发 — 18h 30m
  • 周一：实现工作日志面板 UI (3h)
  • 周二：修复番茄钟 bug (2h)
  • ...

📌 学习 — 8h 45m
  • 周一：Rust 教程第3章 (1h 30m)
  • ...
```

---

### 3.2 Phase 2：增强（后续迭代）


| 功能          | 说明                   | 优先级 |
| ----------- | -------------------- | --- |
| 时间热力图       | GitHub 风格的每日工时热力图    | 中   |
| 效率分析        | 高峰时段、分类分布饼图          | 中   |
| 与任务联动       | 工时条目可关联已有任务          | 中   |
| 导出 Markdown | 周报/月报导出为 Markdown 文件 | 低   |
| 目标工时        | 设置每日目标工时，显示进度        | 低   |
| 日历集成        | 与 v1.7.0 日历面板联动      | 低   |


---

## 四、交互与视觉规范

### 4.1 入口

- **位置**：`renderSidebarContent()` 生成的 `.sidebar-toolbar`
- **按钮**：沿用 `.sidebar-tool-btn`
- **图标**：`fa-clipboard-list`
- **title**：`工作日志`

### 4.2 面板风格

- 模态面板，对齐 `stats-panel` 的视觉语言
- 磨砂玻璃背景（复用 `--glass-blur`、`--panel-bg`）
- 圆角、阴影沿用 `--radius-`*、`--shadow-*`

### 4.3 颜色系统

项目颜色预设（用户可自选）：


| 颜色  | Hex     | 用途示例  |
| --- | ------- | ----- |
| 绿色  | #4CAF50 | 工作/开发 |
| 蓝色  | #2196F3 | 学习/研究 |
| 紫色  | #9C27B0 | 创意/设计 |
| 橙色  | #FF9800 | 会议/沟通 |
| 红色  | #F44336 | 紧急/重要 |
| 灰色  | #9E9E9E | 未分类   |


### 4.4 计时器微型指示器

计时进行中时，在侧边栏工具栏按钮上显示脉冲动画点，表示正在计时。

### 4.5 空状态

- 今天无记录："今天还没有工作记录，开始记录第一条吧！"
- 无项目："创建你的第一个项目，开始追踪工时"

---

## 五、技术方案

### 5.1 代码结构

```
js/worklog.js          — WorkLogManager 类（核心逻辑 + UI）
css/style.css          — 新增 .worklog-* 相关样式
index.html             — 引入 worklog.js（在 memo.js 之后）
js/background.js       — 新增日志提醒 alarm
js/settings-page.js    — 新增"工作日志"设置区块
settings.html          — 新增设置页面区块
```

### 5.2 模块接口

```javascript
class WorkLogManager {
  // 初始化
  async init()
  
  // 项目 CRUD
  async getProjects()
  async saveProject(project)
  async deleteProject(projectId)
  
  // 工时条目 CRUD
  async getEntries(date)          // 获取某日条目
  async getEntriesByRange(start, end) // 获取日期范围条目
  async saveEntry(entry)
  async deleteEntry(entryId)
  
  // 计时器
  startTimer(projectId, description)
  stopTimer()                     // → 自动生成工时条目
  getTimerState()
  
  // 统计
  getDailySummary(date)           // 某日总耗时、条目数
  getWeeklySummary(weekStart)     // 周汇总
  generateWeeklyReport(weekStart) // 生成文本周报
  
  // UI
  renderWorklogPanel()
  renderQuickEntry()
  renderDayView(date)
  renderWeekView(weekStart)
}

window.workLogManager = new WorkLogManager();
```

### 5.3 与 main.js 集成

```javascript
// main.js initApp() 中新增
if (settings.enableWorklog !== false) {
  await window.workLogManager.init();
}
```

### 5.4 Background 提醒

```javascript
// background.js 新增
chrome.alarms.create('worklog_reminder', {
  when: getNextReminderTime(),  // 根据用户设置的时间
  periodInMinutes: 24 * 60     // 每24小时
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'worklog_reminder') {
    chrome.notifications.create('worklog_reminder', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '📋 工作日志提醒',
      message: '今天做了什么？花 30 秒记录一下吧！',
      priority: 1
    });
  }
});
```

### 5.5 设置项


| 设置     | Key                    | 类型      | 默认值     | 说明       |
| ------ | ---------------------- | ------- | ------- | -------- |
| 启用工作日志 | enableWorklog          | boolean | true    | 总开关      |
| 日志提醒   | worklogReminderEnabled | boolean | true    | 每日提醒开关   |
| 提醒时间   | worklogReminderTime    | string  | "18:00" | 每日提醒时间   |
| 默认视图   | worklogDefaultView     | string  | "day"   | day/week |


---

## 六、与现有功能的关系

### 6.1 与任务（Memo）的关系


| 维度  | 任务（Memo）    | 工作日志（WorkLog） |
| --- | ----------- | ------------- |
| 导向  | 待办 → "要做什么" | 记录 → "做了什么"   |
| 时间  | 截止日期        | 实际花费时间        |
| 状态  | 未完成/已完成     | 无状态，已发生的事实    |
| 结构  | 独立任务 + 子任务  | 项目 → 工时条目     |


两者**独立但可协作**：

- 工时条目可选关联一个已有任务（Phase 2）
- 任务完成时可提示"记录工时"（Phase 2）

### 6.2 与番茄钟的关系

- 番茄钟专注于"25分钟专注"的节奏管理
- 工作日志计时器专注于"这件事花了多久"的工时记录
- 两者可并行，不冲突

### 6.3 与日历面板的关系

- 日历面板（v1.7.0 规划）展示"按日完成的任务"
- 工作日志可以为日历面板提供更丰富的"当日产出"数据
- Phase 2 可在日历面板中展示工时数据

---

## 七、验收标准

### Phase 1 验收

- 侧边栏工具栏显示"工作日志"按钮，点击打开面板
- 面板正确显示今日工时条目，按项目分组
- 可通过计时器模式记录工时（开始/停止）
- 可通过手动模式记录工时（填写描述+耗时）
- 可创建/编辑/删除项目
- 可编辑/删除工时条目
- 日期导航正常（前一天/后一天）
- 今日总耗时统计正确
- 周报视图可查看本周汇总
- 一键复制周报文本
- 设置页可配置提醒时间
- 每日提醒通知正常发出
- 点击通知可打开新标签页
- 计时器状态在页面刷新后不丢失
- 不影响现有任务/番茄钟/统计等功能
- UI 风格与现有磨砂玻璃风格一致

---

## 八、风险与应对


| 风险           | 影响         | 应对                |
| ------------ | ---------- | ----------------- |
| 数据量增长过快      | storage 超限 | 按月归档旧数据，提供清理功能    |
| 与 memo.js 冲突 | 功能干扰       | 独立模块，独立存储 key     |
| 用户不愿手动记录     | 功能无人用      | 极简交互、每日提醒、计时器降低门槛 |
| 计时器页面关闭丢失    | 数据丢失       | 计时状态持久化到 storage  |


---

*文档版本: v1.0 | 最后更新: 2026-04-14*