# 网页收藏智能复习系统 — 调研报告

> 调研目标：解决"收藏过多、无法整理、无法都看到、没有结果"的痛点  
> 调研日期：2026-03-03  
> 适用项目：中国风景时钟 Chrome 扩展

---

## 一、问题定义

### 1.1 用户痛点

| 痛点 | 描述 | 严重程度 |
|------|------|---------|
| **收藏过多** | 数百甚至数千个书签，堆积成山 | ⭐⭐⭐⭐⭐ |
| **无法整理** | 分类混乱、标签缺失、文件夹层级深 | ⭐⭐⭐⭐ |
| **无法都看到** | 收藏后就忘了，大量书签从未二次访问 | ⭐⭐⭐⭐⭐ |
| **没有结果** | 没有系统化的回顾机制，知识无法内化 | ⭐⭐⭐⭐⭐ |

### 1.2 理想状态

1. 快速收藏：一键保存当前页面，自动提取关键信息
2. 智能分类：自动打标签、归类
3. 定期推送：系统按科学间隔提醒用户回顾重要书签
4. 知识内化：通过反复接触，将收藏内容转化为可用知识
5. 自动清理：长期不关注的内容自动归档或移除

---

## 二、竞品分析

### 2.1 主流书签管理工具

| 工具 | 类型 | 核心特点 | SRS 支持 | 价格 | 评价 |
|------|------|---------|---------|------|------|
| **Raindrop.io** | 云端书签管理 | 多视图、标签、全文搜索(Pro)、AI 建议(Pro) | ❌ | 免费/$3月 | 功能最全，但无回顾机制 |
| **Pocket** | 稍后阅读 | ⚠️ 2025年7月已停止服务 | ❌ | — | 已停止运营 |
| **Toby** | 标签页管理 | 拖拽集合、会话管理、协作 | ❌ | 免费/付费 | 适合标签页管理，非书签管理 |
| **OneTab** | 标签页聚合 | 一键保存所有标签页、降低内存 | ❌ | 免费 | 简单但组织能力弱 |
| **Liner** | AI 高亮笔记 | AI 推荐、知识收藏、同步 Notion | ❌ | 免费/付费 | 侧重高亮而非书签 |
| **Wakelet** | 多媒体收藏 | 可视化集合、多格式、协作 | ❌ | 免费 | 偏向展示型收藏 |

### 2.2 间隔复习型工具

| 工具 | 核心机制 | 特点 | 开源 |
|------|---------|------|------|
| **Spaced URL** | 预设间隔 (1天→1周→2周→1月→3月) | 唯一专注 SRS + 书签的工具；本地存储、隐私优先 | ❌ |
| **MicroBloom** | Anki 式闪卡 | 新标签页展示闪卡、支持 Anki 导入 | ❌ |
| **iDoRecall** | 关联式闪卡 | 闪卡关联到网页原文位置 | ❌ |
| **SmarterHumans.ai** | AI 生成闪卡 | 自动从网页/视频生成间隔复习卡片 | ❌ |

### 2.3 AI 书签管理工具

| 工具 | AI 能力 | 技术 | 开源 |
|------|---------|------|------|
| **#TagChoose** | 本地 AI 标签建议 | Gemini Nano (设备端) | ❌ |
| **TidyMark** | AI 自动分类 | OpenAI/DeepSeek API | ✅ GitHub |
| **BookmarkMind** | AI 组织 | — | ✅ MIT |
| **Hoverboard** | 可选 AI 标签 | 本地优先 | ✅ GitHub |
| **Stash** | 语义搜索 | pgvector | ✅ 自托管 |
| **Deja-vu** | AI 书签搜索 | — | ✅ MIT |

### 2.4 竞品总结

**关键发现：没有一个工具同时做到"智能收藏 + 间隔复习 + 工期化管理"。** Spaced URL 最接近但缺少 AI 分类能力；Raindrop.io 功能最全但缺少主动复习推送。这是一个值得填补的空白市场。

---

## 三、技术基础

### 3.1 Chrome Extension API

#### chrome.bookmarks

```javascript
// 权限声明
{ "permissions": ["bookmarks"] }

// 核心操作
chrome.bookmarks.getTree()          // 获取完整书签树
chrome.bookmarks.search({query})    // 搜索书签
chrome.bookmarks.create({title, url, parentId})  // 创建书签
chrome.bookmarks.update(id, {title, url})        // 更新
chrome.bookmarks.move(id, {parentId, index})     // 移动
chrome.bookmarks.remove(id)                       // 删除

// BookmarkTreeNode 属性
{
    id: string,
    parentId: string,
    index: number,
    url: string,           // 文件夹无此属性
    title: string,
    dateAdded: number,
    dateLastUsed: number,   // Chrome 114+ 支持
    folderType: string,     // Chrome 134+ 新增
    syncing: boolean        // Chrome 134+ 新增
}

// 事件监听
chrome.bookmarks.onCreated.addListener()
chrome.bookmarks.onChanged.addListener()
chrome.bookmarks.onRemoved.addListener()
chrome.bookmarks.onMoved.addListener()
```

#### chrome.history

```javascript
// 权限声明
{ "permissions": ["history"] }

// 查询访问记录
chrome.history.search({
    text: '',           // 搜索文本
    maxResults: 100,
    startTime: Date.now() - 30 * 24 * 60 * 60 * 1000  // 30天内
})

// HistoryItem 属性
{
    url: string,
    title: string,
    visitCount: number,     // 总访问次数
    lastVisitTime: number,  // 最后访问时间
    typedCount: number      // 地址栏输入次数
}
```

#### 2026 年注意事项：书签同步变更

Chrome 正在分离同步与非同步书签到不同子树：
- 新增 `folderType` 属性识别特殊文件夹
- 新增 `syncing` 属性区分同步/本地书签
- 可能出现重复的"书签栏"和"其他书签"文件夹

### 3.2 存储方案

| 数据类型 | 存储位置 | 理由 |
|---------|---------|------|
| 收藏元数据(标签、复习状态) | `chrome.storage.local` | 数据量可能较大 |
| 用户偏好设置 | `chrome.storage.sync` | 跨设备同步 |
| 复习调度缓存 | `chrome.storage.session` | 临时计算数据 |

---

## 四、间隔复习算法设计

### 4.1 SM-2 算法核心原理

SM-2（SuperMemo 2.0，1987）是最经典的间隔复习算法：

```
I(1) = 1 天
I(2) = 6 天
I(n) = I(n-1) × EF    (n > 2)

EF' = EF + (0.1 - (5 - q) × (0.08 + (5 - q) × 0.02))

其中:
- I(n) = 第 n 次复习的间隔天数
- EF = 简易系数，初始值 2.5，最小值 1.3
- q = 回忆质量评分 (0-5)
```

### 4.2 书签场景适配

传统 SM-2 用于记忆卡片，需要为书签复习场景做适配：

#### 评分标准重新定义

| 评分 | 含义（卡片） | 适配为（书签） | 用户操作 |
|------|------------|--------------|---------|
| 5 | 完美回忆 | 深度阅读，已掌握 | "已读，归档" |
| 4 | 正确但犹豫 | 快速浏览，大致了解 | "已读" |
| 3 | 困难但正确 | 扫了一眼，还想看 | "稍后再看" |
| 2 | 严重困难 | 没看完，很想看 | "推迟" |
| 1 | 只记得一点 | 标题感兴趣但没看 | "跳过" |
| 0 | 完全忘记 | 不感兴趣了 | "移除" |

#### 简化为 4 档操作

为降低用户认知负担，推荐简化为 4 个按钮：

```
🗂 归档 (q=5)  →  已完全掌握，进入长间隔
✅ 已读 (q=4)  →  看过了，正常间隔
⏰ 稍后 (q=2)  →  还想看，缩短间隔
❌ 移除 (q=0)  →  不再关注，移出复习队列
```

### 4.3 推荐的改良算法

基于 SM-2 做书签场景优化：

```javascript
class BookmarkSRS {
    schedule(bookmark, quality) {
        let { ef, interval, repetition } = bookmark.srs || { ef: 2.5, interval: 0, repetition: 0 };
        
        if (quality < 3) {
            // 评分不佳，重置间隔
            repetition = 0;
            interval = 1;
        } else {
            if (repetition === 0) interval = 1;
            else if (repetition === 1) interval = 3;     // 书签场景缩短初始间隔
            else interval = Math.round(interval * ef);
            repetition++;
        }
        
        // 更新 EF
        ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
        
        // 书签特有：设置上限（避免间隔过长导致遗忘）
        interval = Math.min(interval, 180);  // 最长 6 个月
        
        return {
            ef,
            interval,
            repetition,
            nextReview: Date.now() + interval * 24 * 60 * 60 * 1000,
            lastReview: Date.now()
        };
    }
    
    getDueBookmarks(bookmarks) {
        return bookmarks
            .filter(b => b.srs && b.srs.nextReview <= Date.now())
            .sort((a, b) => a.srs.nextReview - b.srs.nextReview);
    }
}
```

### 4.4 预设复习频率模板

参考 Spaced URL，提供预设模板降低配置门槛：

| 模板 | 间隔序列 | 适用场景 |
|------|---------|---------|
| 📖 频繁阅读 | 1天→3天→1周→2周→1月 | 学习资料、技术文档 |
| 📰 定期关注 | 1周→2周→1月→3月 | 行业动态、博客 |
| 📚 偶尔翻阅 | 1月→3月→6月 | 参考资料、工具 |
| 🗃 长期存档 | 3月→6月→1年 | 历史文章、经典内容 |

---

## 五、功能架构设计

### 5.1 核心模块

```
┌─────────────────────────────────────────┐
│              收藏智能复习系统              │
├──────────┬──────────┬──────────┬────────┤
│ 收藏管理  │ 智能分类  │ 间隔复习  │ 数据展示│
├──────────┼──────────┼──────────┼────────┤
│ 一键收藏  │ AI 标签   │ SM-2 调度│ 复习看板│
│ 批量导入  │ 自动归类  │ 到期提醒  │ 统计面板│
│ 快速搜索  │ 主题检测  │ 回忆评估  │ 进度追踪│
│ 标签管理  │ 相似推荐  │ 频率模板  │ 热力图  │
└──────────┴──────────┴──────────┴────────┘
```

### 5.2 数据结构设计

```javascript
// 收藏条目
{
    id: string,               // 唯一标识
    url: string,              // 网页 URL
    title: string,            // 页面标题
    description: string,      // 页面描述/摘要
    favicon: string,          // 网站图标 URL
    tags: string[],           // 标签数组
    categoryId: string,       // 分类ID
    
    // SRS 复习数据
    srs: {
        ef: number,           // 简易系数 (1.3-2.5)
        interval: number,     // 当前间隔天数
        repetition: number,   // 复习次数
        nextReview: number,   // 下次复习时间戳
        lastReview: number,   // 上次复习时间戳
        quality: number,      // 上次评分 (0-5)
        template: string      // 频率模板: 'frequent'|'regular'|'occasional'|'archive'
    },
    
    // 元数据
    addedAt: number,          // 收藏时间戳
    lastVisit: number,        // 最后访问时间
    visitCount: number,       // 访问次数
    status: string,           // 'active'|'archived'|'removed'
    
    // 来源追踪
    source: string,           // 'manual'|'import'|'auto'
    chromeBookmarkId: string  // 对应的 Chrome 书签 ID（如有）
}

// 收藏分类
{
    id: string,
    name: string,
    color: string,
    icon: string              // emoji 或 icon class
}
```

### 5.3 与现有项目的集成方案

本功能可作为备忘录系统的扩展模块整合，有两种路径：

**方案 A：独立面板（推荐）**
- 新增 "收藏" 工具栏按钮（类似日历、周回顾）
- 点击弹出收藏管理面板
- 数据存储在 `chrome.storage.local` 的 `bookmarks` 键下
- 与任务系统共享分类和标签

**方案 B：融入任务系统**
- 收藏条目作为特殊类型的任务（`type: 'bookmark'`）
- 复用现有的分类、标签、优先级系统
- SRS 复习作为任务的特殊属性

**集成点：**
- 复用磨砂玻璃 UI 风格
- 共享分类/标签体系
- 新标签页展示"今日推荐阅读"
- 复习提醒融入现有通知系统

### 5.4 交互流程

```
收藏阶段:
用户浏览网页 → 点击扩展图标/快捷键 → 自动提取标题+描述+favicon
→ 选择标签/分类(可跳过) → 选择复习频率模板 → 保存

复习阶段:
打开新标签页 → 显示"今日推荐阅读" 列表 → 用户点击链接阅读
→ 阅读后给出反馈(已读/稍后/归档/移除) → 更新 SRS 调度

管理阶段:
打开收藏面板 → 搜索/筛选/分类浏览 → 批量操作(归档/删除/重新分类)
→ 查看统计数据(复习进度、热力图、分类分布)
```

---

## 六、实现路线图

### Phase 1：基础收藏 (v1.8.0)
- [ ] 收藏数据结构和存储
- [ ] 一键收藏当前页面（弹窗确认）
- [ ] 收藏列表面板（搜索、分类浏览）
- [ ] 导入 Chrome 书签
- [ ] 手动标签和分类

### Phase 2：间隔复习 (v1.9.0)
- [ ] SM-2 算法实现
- [ ] 频率模板选择
- [ ] 新标签页"今日推荐阅读"卡片
- [ ] 复习反馈界面（已读/稍后/归档/移除）
- [ ] 复习进度统计

### Phase 3：智能增强 (v2.0.0)
- [ ] 基于标签/分类的相似推荐
- [ ] 访问频率分析（结合 chrome.history）
- [ ] 自动归档长期不阅读的书签
- [ ] 复习热力图
- [ ] 导出/备份功能

### Phase 4：AI 能力（可选，v2.1.0+）
- [ ] AI 自动标签建议（可选接入 Gemini Nano 或外部 API）
- [ ] 内容摘要自动生成
- [ ] 主题检测和聚类
- [ ] 智能推荐排序

---

## 七、技术风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 存储空间不足 | 大量书签元数据可能超出 10MB | 定期清理已归档/已移除的数据；摘要长度限制 |
| 算法冷启动 | 新用户无复习历史 | 提供频率模板快速配置；根据收藏时间推算初始间隔 |
| 用户疲劳 | 复习队列过长 | 每日推荐上限（如 5-10 条）；"跳过今天"选项 |
| Chrome API 变更 | 书签同步策略调整 | 使用 `folderType` 和 `syncing` 新属性适配 |
| 权限敏感 | 新增 `bookmarks` 和 `history` 权限 | 可选权限 (`optional_permissions`)，按需申请 |

---

## 八、开源参考项目

| 项目 | 地址 | 核心能力 | 许可 |
|------|------|---------|------|
| open-spaced-repetition/sm-2-ts | GitHub | TypeScript SM-2 实现 | MIT |
| cnnrhill/sm-2 | GitHub | ES6 SM-2 实现 | — |
| sunyata2022/spaced-repetition.js | GitHub | JS 间隔复习工具包 | — |
| PanHywel/TidyMark | GitHub | AI 自动分类书签 | — |
| Chirag127/BookmarkMind | GitHub | AI 书签组织 | MIT |
| ooye-sanket/deja-vu | GitHub | AI 书签搜索 | MIT |

---

## 九、结论与建议

### 核心结论

1. **市场空白**：目前没有工具同时提供"智能分类 + 间隔复习 + 与任务管理集成"的能力
2. **技术可行**：Chrome Extension API 完全支持书签管理和访问历史分析
3. **算法成熟**：SM-2 算法简单可靠，适配书签场景后可快速实现
4. **差异化优势**：集成到现有时钟扩展中，用户每次打开新标签页就能看到推荐阅读

### 推荐方案

采用"独立面板 + 新标签页推荐卡片"的混合方案：
- 收藏管理在独立面板中操作（类似日历/周回顾面板）
- 新标签页主界面展示 1-3 条"今日推荐阅读"
- 使用改良版 SM-2 算法调度复习
- 分阶段实施，先做基础收藏和复习，再加 AI 能力

### 预期效果

- 收藏内容复习率从 ~5% 提升到 60%+
- 知识内化效率显著提高
- 书签数量可控（自动归档机制）

---

*文档版本: 1.0.0*  
*调研人: AI Assistant*  
*最后更新: 2026-03-03*
