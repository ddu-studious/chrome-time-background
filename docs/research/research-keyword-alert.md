# 热搜关键字监控报警功能调研报告

> **调研日期**: 2026-02-08  
> **项目**: 中国风景时钟 Chrome 扩展 — 热搜关键字监控与消息提醒  
> **调研目标**: 在现有 DailyHot API 热搜数据基础上，增加关键字监控列表，当热搜命中关键字时通过 Chrome 系统通知实时提醒用户  
> **结论**: ✅ **完全可行**，且与现有架构高度契合

---

## 一、需求分析

### 1.1 核心需求

用户希望：
1. 维护一个**关键字监控列表**（如："地震"、"DeepSeek"、"AI"、"股市"等）
2. 每当 DailyHot API 返回的热搜数据（微博/B站/知乎）中**标题或描述**匹配到任一关键字时
3. 立即通过 **Chrome 系统通知** 弹窗提醒用户
4. 通知可点击跳转到对应热搜页面

### 1.2 用户场景

| 场景 | 描述 |
|------|------|
| 舆情监控 | 运营/公关人员监控品牌相关热搜 |
| 热点追踪 | 追踪特定话题（如 AI、科技、体育赛事） |
| 突发事件 | 监控"地震"、"台风"、"疫情"等关键字 |
| 个人兴趣 | 监控感兴趣的明星、游戏、技术等 |

### 1.3 设计原则

- **轻量无感**：不增加用户操作负担，后台自动扫描
- **实时但不骚扰**：同一条热搜只通知一次，设置冷却时间
- **灵活配置**：支持添加/删除关键字，支持启用/禁用
- **优雅降级**：API 不可用时静默跳过，不影响主功能

---

## 二、技术可行性分析

### 2.1 现有架构分析

项目已具备实现此功能所需的全部基础设施：

| 组件 | 现状 | 适配度 |
|------|------|--------|
| **DailyHot API** | ✅ 已部署运行（https://www.meczyc6.info/hotapi），返回微博/B站/知乎热搜 | 直接复用 |
| **Service Worker** | ✅ `background.js` 已有完整的 alarm + notification 体系 | 直接扩展 |
| **chrome.alarms** | ✅ 已声明权限，已有多个定时任务 | 新增一个 alarm |
| **chrome.notifications** | ✅ 已声明权限，已有通知创建/按钮/点击完整链路 | 直接复用 |
| **chrome.storage** | ✅ 已使用 sync + local 存储 | 存储关键字配置 |
| **Ticker 数据源** | ✅ `ticker.js` 已实现 fetchWeibo/fetchBilibili/fetchZhihu | 可共享数据 |

### 2.2 关键 API 调研

#### chrome.notifications（系统通知）

```javascript
// 已在 manifest.json 声明权限 ✅
"permissions": ["notifications"]

// 创建通知（支持 MV3 Service Worker）
await chrome.notifications.create('keyword-alert-xxx', {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: '🔔 热搜关键字命中',
    message: '【微博】"四川地震" 匹配关键字 "地震"',
    priority: 2,
    requireInteraction: true,  // 保持显示直到用户操作
    buttons: [
        { title: '🔗 查看详情' },
        { title: '🔕 不再提醒' }
    ]
});

// 通知按钮点击 - 已有监听器 ✅
chrome.notifications.onButtonClicked.addListener(...)
// 通知点击 - 已有监听器 ✅  
chrome.notifications.onClicked.addListener(...)
```

**能力确认**：
- ✅ 支持 MV3 Service Worker
- ✅ 支持 basic / list / image / progress 四种模板
- ✅ 支持最多 2 个按钮
- ✅ 支持 `requireInteraction`（保持显示）
- ✅ 支持 `priority`（-2 ~ 2）
- ✅ 支持 `silent`（静默通知）
- ⚠️ macOS 上按钮显示有限制，需要降级处理（项目已有处理模式）

#### chrome.alarms（定时任务）

```javascript
// 已在 manifest.json 声明权限 ✅
"permissions": ["alarms"]

// Chrome 120+ 支持最短 30 秒间隔
await chrome.alarms.create('keyword-scan', {
    periodInMinutes: 10  // 每 10 分钟扫描一次
});
```

**能力确认**：
- ✅ Chrome 120+ 最短周期 30 秒
- ✅ 500 个 alarm 上限（当前使用约 5 个，完全够用）
- ✅ 设备休眠后唤醒时会补发
- ✅ Service Worker 终止后重启时 alarm 继续工作

#### DailyHot API 数据结构

实际请求 `https://www.meczyc6.info/hotapi/weibo` 返回：

```json
{
  "code": 200,
  "name": "weibo",
  "title": "微博",
  "type": "热搜榜",
  "total": 51,
  "updateTime": "2026-02-08T10:17:44.578Z",
  "data": [
    {
      "id": "#四川地震#",
      "title": "四川地震",          // ← 关键字匹配目标
      "desc": "四川地震",            // ← 关键字匹配目标
      "url": "https://s.weibo.com/weibo?q=...",
      "mobileUrl": "https://s.weibo.com/weibo?q=..."
    }
  ]
}
```

**所有三个数据源（微博/B站/知乎）返回结构一致**：都有 `title`、`desc`、`url` 字段，非常适合统一匹配。

---

## 三、技术方案

### 3.1 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│  background.js (Service Worker)                                  │
│                                                                   │
│  ┌─────────────┐    ┌──────────────────┐    ┌───────────────┐   │
│  │ chrome.alarms│───>│ 关键字扫描引擎   │───>│ chrome.notify │   │
│  │ (每10分钟)  │    │                  │    │ (系统通知)    │   │
│  └─────────────┘    │ 1. fetch API     │    └───────────────┘   │
│                      │ 2. 关键字匹配    │                        │
│                      │ 3. 去重检查      │    ┌───────────────┐   │
│                      │ 4. 生成通知      │───>│ chrome.storage│   │
│                      └──────────────────┘    │ (配置+去重)   │   │
│                                               └───────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────┐                 │
│  │ ticker.js (前端页面)                          │                 │
│  │ 匹配到的热搜条目视觉高亮 (可选增强)            │                 │
│  └─────────────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 工作流程

```
1. 用户配置关键字列表 → chrome.storage.sync
     ↓
2. chrome.alarms 每 10 分钟触发 'keyword-scan'
     ↓
3. Service Worker 并行请求 DailyHot API (weibo/bilibili/zhihu)
     ↓
4. 遍历所有热搜条目的 title + desc
     ↓
5. 正则/includes 匹配关键字列表
     ↓
6. 去重检查：同一条目 24 小时内不重复通知
     ↓
7. 发送 chrome.notifications 系统通知
     ↓
8. 用户点击通知 → 打开对应热搜 URL
```

### 3.3 关键字匹配策略

| 策略 | 说明 | 推荐 |
|------|------|------|
| **精确包含** | `title.includes(keyword)` | ✅ 默认 |
| **正则匹配** | `new RegExp(keyword, 'i').test(title)` | ✅ 高级选项 |
| **模糊匹配** | 分词后部分匹配 | ❌ 过于宽泛 |

推荐采用 **精确包含 + 忽略大小写** 作为默认策略，满足 90% 场景。

### 3.4 去重与防骚扰机制

| 机制 | 说明 |
|------|------|
| **条目去重** | 同一热搜标题 24 小时内只通知一次 |
| **频率限制** | 单次扫描最多发送 5 条通知 |
| **冷却时间** | 同一关键字匹配间隔至少 30 分钟 |
| **静默时段** | 可选设置免打扰时间段（如 23:00-07:00）|

### 3.5 数据存储方案

```javascript
// chrome.storage.sync — 跨设备同步
{
  keywordAlertSettings: {
    enabled: true,                    // 总开关
    keywords: [                       // 关键字列表
      { text: '地震', enabled: true },
      { text: 'DeepSeek', enabled: true },
      { text: 'AI', enabled: false }  // 已禁用
    ],
    scanInterval: 10,                 // 扫描间隔（分钟）
    maxNotifications: 5,              // 单次最大通知数
    quietHoursStart: '23:00',         // 免打扰开始
    quietHoursEnd: '07:00',           // 免打扰结束
    sources: ['weibo', 'bilibili', 'zhihu']  // 监控的数据源
  }
}

// chrome.storage.local — 本地去重缓存
{
  keywordAlertHistory: {
    // key: hash(title), value: timestamp
    'abc123': 1707350400000,
    'def456': 1707350400000
  }
}
```

---

## 四、UI 方案

### 4.1 关键字管理入口

在前端页面（ticker 区域或设置面板）提供关键字管理入口：

```
┌─────────────────────────────────────────────────────┐
│ 🔔 热搜关键字监控                           [开/关] │
├─────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌──────┐                  │
│ │ 输入关键字...         │  │ 添加 │                  │
│ └──────────────────────┘  └──────┘                  │
│                                                      │
│ 🏷️ 地震    [✓]  [✕]                                │
│ 🏷️ DeepSeek [✓]  [✕]                              │
│ 🏷️ AI      [✓]  [✕]                                │
│ 🏷️ 股市    [ ]  [✕]  ← 已禁用                     │
│                                                      │
│ 扫描间隔: [10] 分钟    免打扰: 23:00 - 07:00       │
│ 数据源: [✓微博] [✓B站] [✓知乎]                     │
└─────────────────────────────────────────────────────┘
```

### 4.2 通知效果

```
┌─────────────────────────────────────────┐
│ 🔔 热搜关键字命中                        │
│                                          │
│ 【微博热搜】四川地震                      │
│ 匹配关键字: "地震"                        │
│                                          │
│  [🔗 查看详情]  [🔕 不再提醒此条]        │
└─────────────────────────────────────────┘
```

### 4.3 页面内高亮（可选增强）

在 Ticker 滚动条中，对匹配关键字的热搜条目添加视觉高亮：
- 标题文字颜色变为警示色（如橙色/红色）
- 添加闪烁动画吸引注意
- 显示 "🔔" 图标标识

---

## 五、实现方案

### 5.1 修改文件清单

| 文件 | 修改内容 | 复杂度 |
|------|---------|--------|
| `js/background.js` | 新增关键字扫描引擎、alarm、通知逻辑 | ⭐⭐⭐ 中 |
| `js/ticker.js` | 新增关键字匹配高亮 + 管理面板入口 | ⭐⭐ 低 |
| `css/style.css` | 关键字管理面板样式 + 高亮样式 | ⭐ 低 |
| `index.html` | 关键字管理面板 DOM（可选，可动态生成） | ⭐ 低 |
| `manifest.json` | 无需修改（权限已具备） | — |

### 5.2 核心代码设计

#### Service Worker 关键字扫描（background.js）

```javascript
// 关键字扫描闹钟
await chrome.alarms.create('keyword-scan', {
    periodInMinutes: 10
});

// 闹钟触发时执行扫描
case 'keyword-scan':
    await scanKeywordAlerts();
    break;

async function scanKeywordAlerts() {
    const { keywordAlertSettings } = await chrome.storage.sync.get('keywordAlertSettings');
    if (!keywordAlertSettings?.enabled) return;
    
    const keywords = (keywordAlertSettings.keywords || [])
        .filter(k => k.enabled)
        .map(k => k.text);
    if (keywords.length === 0) return;
    
    // 检查免打扰时段
    if (isQuietHours(keywordAlertSettings)) return;
    
    // 并行请求所有数据源
    const sources = keywordAlertSettings.sources || ['weibo', 'bilibili', 'zhihu'];
    const API_BASE = 'https://www.meczyc6.info/hotapi';
    
    const results = await Promise.allSettled(
        sources.map(s => fetch(`${API_BASE}/${s}`).then(r => r.json()))
    );
    
    // 匹配关键字
    const matches = [];
    for (const result of results) {
        if (result.status !== 'fulfilled' || result.value.code !== 200) continue;
        const { name, data } = result.value;
        
        for (const item of (data || [])) {
            for (const keyword of keywords) {
                if (item.title?.includes(keyword) || item.desc?.includes(keyword)) {
                    matches.push({ ...item, source: name, keyword });
                }
            }
        }
    }
    
    // 去重 + 发送通知
    const history = await getAlertHistory();
    let notifyCount = 0;
    
    for (const match of matches) {
        if (notifyCount >= (keywordAlertSettings.maxNotifications || 5)) break;
        
        const key = hashTitle(match.title + match.source);
        if (history[key] && Date.now() - history[key] < 24 * 60 * 60 * 1000) continue;
        
        await sendKeywordAlert(match);
        history[key] = Date.now();
        notifyCount++;
    }
    
    await saveAlertHistory(history);
}
```

#### 前端关键字匹配高亮（ticker.js）

```javascript
// 在 renderCurrent() 中检查关键字匹配
renderCurrent() {
    const item = this.tickerItems[this.currentIndex];
    // ... 现有渲染逻辑 ...
    
    // 关键字高亮
    if (this.matchedKeywords?.has(item.title)) {
        titleEl.classList.add('keyword-matched');
    }
}
```

### 5.3 性能影响评估

| 指标 | 影响 | 说明 |
|------|------|------|
| API 请求量 | +3 次 / 10 分钟 | 仅在 Service Worker 中请求，不影响页面 |
| 内存占用 | +50KB | 去重历史缓存 |
| CPU 占用 | 极低 | 字符串 includes 匹配，<1ms |
| 电池影响 | 可忽略 | alarm 触发频率很低 |
| 网络流量 | ~30KB / 次 | 3 个 API 响应 |

---

## 六、风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| API 不稳定 | 🟡 中 | try-catch + 静默降级，不影响主功能 |
| 通知骚扰 | 🟡 中 | 去重 + 频率限制 + 免打扰时段 |
| 关键字过于宽泛 | 🟢 低 | 匹配结果计数提示，建议精确关键字 |
| 存储空间 | 🟢 低 | 去重历史定期清理（>24h 自动删除）|
| Service Worker 超时 | 🟢 低 | API 请求 <5s，远低于 30s 限制 |

---

## 七、方案对比

### 方案 A：Service Worker 定时扫描（推荐 ✅）

- **位置**：`background.js` Service Worker
- **触发**：`chrome.alarms` 定时（每 10 分钟）
- **优点**：即使没有打开新标签页也能监控；不影响页面性能
- **缺点**：有 10 分钟延迟（但热搜本身就有延迟）

### 方案 B：前端页面实时匹配

- **位置**：`ticker.js` 前端页面
- **触发**：每次 Ticker 数据刷新时（20 分钟缓存）
- **优点**：实现简单，与现有数据流集成
- **缺点**：只有打开新标签页时才能触发

### 推荐：A + B 混合方案

- **后台 Service Worker**（A）：负责定时扫描 + 发送系统通知
- **前端 Ticker**（B）：负责页面内关键字高亮展示

两者互补，提供最佳体验。

---

## 八、实施计划

### Phase 1：核心功能（本次实现）

| 步骤 | 内容 | 优先级 |
|------|------|--------|
| 1 | `background.js` 新增关键字扫描引擎 | P0 |
| 2 | `background.js` 新增 alarm + 通知发送 | P0 |
| 3 | `ticker.js` 新增关键字管理面板（添加/删除/启用/禁用） | P0 |
| 4 | `ticker.js` 新增匹配高亮（可选） | P1 |
| 5 | `css/style.css` 管理面板样式 | P1 |

### Phase 2：增强功能（后续）

| 内容 |
|------|
| 通知历史记录查看面板 |
| 关键字分组/标签管理 |
| 自定义通知声音 |
| 导入/导出关键字列表 |
| 关键字推荐（基于热搜词频分析） |

---

## 九、结论

### ✅ 完全可行

1. **零改造成本**：现有架构（Service Worker + alarms + notifications + DailyHot API）完美匹配需求
2. **零权限新增**：所有所需权限（notifications / alarms / storage）均已声明
3. **零 UI 重构**：关键字管理面板可融入现有 Ticker 区域
4. **高可靠性**：Service Worker 后台运行，不依赖页面打开
5. **低侵入性**：新增功能与现有代码解耦，开关可控

---

**文档版本**: v1.0  
**调研完成日期**: 2026-02-08  
**维护者**: AI Assistant
