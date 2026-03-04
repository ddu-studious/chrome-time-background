# v2.0.0 书签收藏智能检索系统

> 文档创建时间：2026-03-04  
> 关联调研：`docs/research/bookmark-collection-review-research.md`  
> 决策依据：调研报告第十三节"建议总结"

## 1. 背景与目标

### 1.1 问题

用户长期积累了大量 Chrome 书签，面临以下痛点：

| 痛点 | 描述 |
|------|------|
| 收藏过多 | 数百甚至数千个书签，无法有效管理 |
| 找不到 | 只记得大概主题，标题关键词匹配失败率高 |
| 遗忘 | 收藏后从未二次访问，知识无法内化 |
| 无整理 | 分类混乱、缺少标签，手动整理成本高 |

### 1.2 目标

在中国风景时钟扩展中集成**书签智能检索系统**，实现：

1. **指定目录管理**：用户选择特定书签文件夹作为"知识库"
2. **语义搜索**：通过 Embedding + 混合搜索，搜索"ai"能找到 LLM/机器学习/向量数据库等相关书签
3. **间隔复习**：基于 SM-2 算法定期推送书签，促进知识内化
4. **任务联动**：搜索到的书签可一键转为任务

### 1.3 核心决策

| 讨论项 | 决策 | 理由 |
|--------|------|------|
| 书签范围 | 仅指定目录 | 处理量可控、语义噪音少、Embedding 成本低 |
| AI 服务 | 引导向导配置 | 一站式完成 Provider 选择 + Key 输入 + 验证 |
| 处理时机 | 手动触发同步处理 | 面板内提供"开始处理"按钮，处理完即可搜索 |
| 搜索入口 | 独立面板 + 快捷键 | Spotlight 式快速搜索 + 面板管理 |
| 任务联动 | 一键转任务 | 轻量联动，搜到即转任务 |
| Embedding 维度 | 384 维 | 书签标题+域名文本短，384 维够用 |
| LLM 重排序 | 默认关闭 | 作为高级选项按需使用 |

---

## 2. 用户故事（User Stories）

- 作为用户，我希望选择一个书签文件夹作为"知识库"，系统只处理该目录下的书签。
- 作为用户，我希望通过引导向导配置 AI 服务（DeepSeek/OpenAI/Gemini/自定义），完成后点击按钮开始处理书签。
- 作为用户，我希望输入"ai"时，不仅能找到标题含"ai"的书签，还能找到 LangChain、MCP、向量数据库等语义相关的结果。
- 作为用户，我希望用 `Ctrl+K` 快捷键唤出搜索框，打几个字就能看到结果，回车直接打开。
- 作为用户，我希望系统定期提醒我回顾重要书签，避免"收藏即遗忘"。
- 作为用户，我希望搜索到的好文章可以一键转为任务，安排阅读计划。

---

## 3. 范围（Scope）

### 3.1 Phase 1 必做 — 书签目录管理与本地搜索

- **权限申请**：`manifest.json` 添加 `bookmarks` 到 `optional_permissions`
- **设置入口**：侧边栏工具栏新增"书签"按钮（与日历/统计同级）
- **AI 配置向导**：首次使用弹出引导，选择 Provider → 获取 Key 教程 → 输入 Key → 验证连通性
- **书签目录选择器**：树形展示 Chrome 书签文件夹，支持选中一个或多个目录
- **书签列表面板**：展示选中目录下的所有书签，支持搜索、分类浏览
- **本地 BM25 关键词搜索**：基于 Orama 的全文搜索
- **书签变化监听**：监听 `onCreated/onRemoved/onMoved/onChanged` 事件，保持缓存同步
- **手动处理按钮**：面板内"开始处理"按钮，点击后开始批量 Embedding，显示进度条

### 3.2 Phase 2 必做 — RAG 语义搜索

- **批量 Embedding 生成**：调用配置的 AI 服务为书签生成 384 维向量
- **Orama 向量索引**：构建混合索引（BM25 关键词 + 向量余弦相似度 + RRF 融合排序）
- **IndexedDB 持久化**：向量和索引持久化到 IndexedDB，Service Worker 重启后恢复
- **Spotlight 快捷搜索**：`Ctrl+K` 唤出居中浮层搜索框，实时展示搜索结果
- **搜索结果展示**：区分"关键词匹配"和"语义推荐"，显示相关度
- **增量 Embedding**：书签变化时增量更新向量
- **Query 向量缓存**：相同搜索词复用已有向量

### 3.3 Phase 3 可选 — 间隔复习

- **SM-2 算法**：改良的间隔复习算法，适配书签场景
- **频率模板**：预设 4 种模板（频繁阅读/定期关注/偶尔翻阅/长期存档）
- **今日推荐阅读**：新标签页展示今日到期的复习书签
- **复习反馈**：4 档操作（归档/已读/稍后/移除）
- **一键转任务**：搜索结果和复习卡片右侧的"转为任务"按钮

### 3.4 明确不做（Non-goals）

- 不做全量书签处理（仅处理指定目录）
- 不做本地 Embedding 模型（23-30MB 过大，留作未来可选）
- 不引入 LangChain.js（场景简单，直接用 Orama + fetch 更轻量）
- 不做复杂的 Agent/多轮对话（纯检索即可）
- 不做网页内容抓取增强（Phase 4+ 未来迭代）

---

## 4. 交互与视觉规范

### 4.1 入口

| 入口 | 位置 | 触发 |
|------|------|------|
| 工具栏按钮 | `.sidebar-toolbar` | 点击打开书签管理面板 |
| 快捷键 | 全局 | `Ctrl+K` 唤出 Spotlight 搜索框 |

- 按钮形态：沿用 `.sidebar-tool-btn`
- 图标：`fa-bookmark`
- title：`书签检索`

### 4.2 Spotlight 搜索框

```
┌───────────────────────────────────────────┐
│  🔍 搜索书签...                [AI 精排]  │
├───────────────────────────────────────────┤
│                                           │
│  📌 关键词匹配 (3)                        │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 AI Prompt Engineering Guide    │    │
│  │    promptguide.dev                │    │
│  └───────────────────────────────────┘    │
│                                           │
│  🤖 语义推荐 (5)                          │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 LangChain Docs       95% 相关  │    │
│  │    docs.langchain.com             │    │
│  │    💡 LLM 应用框架                 │    │
│  └───────────────────────────────────┘    │
│                                           │
└───────────────────────────────────────────┘
```

- 居中浮层，宽度 520px
- 磨砂玻璃背景（复用项目 `--glass-*` 变量）
- 输入框自动聚焦
- 上下箭头键导航结果列表
- 回车打开选中书签
- Esc 关闭

### 4.3 书签管理面板

- 布局：模态面板（对齐 `stats-panel` 风格）
- 顶部：标题 + 搜索框 + 关闭按钮
- 主体：书签列表（标题、域名、标签、复习状态）
- 底部：统计信息（总数、已处理、待复习）

### 4.4 AI 配置向导

分 3 步引导：

1. **选择 AI 服务商**：卡片式选择（DeepSeek/OpenAI/Gemini/自定义）
2. **配置 API Key**：输入框 + 获取教程链接 + 验证按钮
3. **选择书签目录**：树形文件夹选择器

---

## 5. 数据结构

### 5.1 书签元数据（`chrome.storage.local`）

```javascript
{
    bookmarkCache: {
        version: number,
        lastSyncTime: number,
        items: [{
            id: string,             // Chrome 书签 ID
            title: string,
            url: string,
            domain: string,         // 域名（搜索用）
            dateAdded: number,
            parentId: string,
            aiTags: string[],       // AI 生成的标签
            embeddingDone: boolean, // 是否已完成 Embedding
            srs: {                  // 间隔复习数据（Phase 3）
                ef: number,
                interval: number,
                repetition: number,
                nextReview: number,
                lastReview: number,
                quality: number,
                template: string
            },
            status: string          // 'active' | 'archived' | 'removed'
        }]
    }
}
```

### 5.2 配置数据（`chrome.storage.sync`）

```javascript
{
    bookmarkSettings: {
        enabled: boolean,
        folderIds: string[],
        folderNames: string[],
        dailyReviewLimit: number,   // 默认 5
        aiProvider: string,         // 'deepseek' | 'openai' | 'gemini' | 'custom'
        aiApiKey: string,           // 加密存储
        aiBaseUrl: string,
        aiModel: string,
        embeddingModel: string,
        reviewTemplate: string,
        lastProcessTime: number
    }
}
```

### 5.3 向量索引（IndexedDB）

- 库名：`BookmarkRAGIndex`
- 存储 Orama 序列化后的索引数据
- Service Worker 重启后从 IndexedDB 恢复

---

## 6. 技术方案

### 6.1 技术栈

| 组件 | 选型 | 说明 |
|------|------|------|
| 搜索引擎 | Orama (<2KB) | 混合搜索内置：BM25 + 向量 + RRF |
| Embedding | DeepSeek/OpenAI/Gemini API | 384 维远程 Embedding |
| 持久化 | IndexedDB + chrome.storage | 向量存 IndexedDB，配置存 storage |
| 间隔复习 | SM-2 改良算法 | 书签场景适配 |

### 6.2 搜索架构

```
用户输入 query
    │
    ├──→ Embedding API → query 向量（带缓存）
    │
    └──→ Orama hybrid search
         ├ BM25(title, domain, aiTags, query)
         ├ cosine(query向量, 书签向量)
         └ RRF 融合排序
              │
              ▼
         Top-K 结果
              │
         [可选] LLM 精排按钮
              │
              ▼
         最终展示
```

### 6.3 代码落点

| 文件 | 职责 |
|------|------|
| `js/bookmark-rag.js` | RAG 核心：Embedding、向量搜索、混合搜索、SRS 集成 |
| `js/bookmark-srs.js` | SM-2 间隔复习算法、频率模板、复习队列、调度 |
| `js/memo.js` | 集成入口：面板创建、Spotlight 搜索、一键转任务 |
| `js/background.js` | 书签变化监听、定时同步检查 |
| `css/style.css` | 新增搜索框、面板、向导样式 |
| `manifest.json` | `optional_permissions: ["bookmarks"]` |

### 6.4 AI 服务 Provider

```javascript
const AI_PROVIDERS = {
    deepseek: {
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        defaultModel: 'deepseek-chat',
        embeddingModel: 'deepseek-embedding',
        dimension: 384,
        pricing: '约 ¥0.007/万次 Embedding'
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        embeddingModel: 'text-embedding-3-small',
        dimension: 384,
        pricing: '约 ¥0.015/万次 Embedding'
    },
    gemini: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: 'gemini-2.0-flash',
        embeddingModel: 'text-embedding-004',
        dimension: 384,
        pricing: '免费额度充足'
    },
    custom: {
        name: '自定义（OpenAI 兼容）',
        baseUrl: '',
        defaultModel: '',
        embeddingModel: '',
        dimension: 384,
        pricing: '-'
    }
};
```

---

## 7. 验收标准（Acceptance Criteria）

### Phase 1 ✅ (已完成 - v1.7.0)

- [x] 侧边栏工具栏出现"书签"按钮
- [x] 点击按钮首次打开时弹出 AI 配置向导
- [x] 向导可正确配置 AI Provider 和 API Key
- [x] 书签文件夹树形选择器可展示所有 Chrome 书签文件夹
- [x] 选择目录后，面板展示该目录下所有书签
- [x] "开始处理"按钮点击后显示进度条，完成后按钮变为"已处理"
- [x] 输入关键词可搜索书签标题（BM25）
- [x] 新增/删除/移动书签时自动同步缓存

### Phase 2 ✅ (已完成 - v2.0.0)

- [x] `Ctrl+K` 快捷键可唤出 Spotlight 搜索框
- [x] 搜索结果分"关键词匹配"和"语义推荐"两区展示
- [x] 搜索"ai"时能找到 LLM/机器学习/向量数据库等语义相关书签
- [x] 搜索延迟 < 500ms（向量搜索 + query embedding）
- [x] 关闭/重启浏览器后索引从 IndexedDB 恢复，无需重新 Embedding
- [x] 新书签加入目录后自动增量 Embedding
- [x] Query 向量缓存（24 小时有效期）
- [x] "开始处理"按钮连接真实 Embedding 流程，支持批量/取消

### Phase 3 ✅ (已完成 - v2.1.0)

- [x] 新标签页展示"今日推荐阅读"卡片
- [x] 复习反馈 4 档操作正常更新 SRS 调度
- [x] 搜索结果右侧"转为任务"按钮可正确创建任务（Spotlight + 面板 + 推荐卡片）
- [x] 频率模板可切换（4 种：频繁阅读/定期关注/偶尔翻阅/长期存档）
- [x] SM-2 改良算法适配书签场景
- [x] 书签面板新增"启用复习"按钮 + 待复习统计

---

## 8. 实施计划

| 阶段 | 版本 | 内容 | 状态 |
|------|------|------|------|
| Phase 1 | v1.7.0 | 书签目录管理 + BM25 搜索 + AI 配置向导 | ✅ 已完成 |
| Phase 2 | v2.0.0 | RAG 语义搜索 + Spotlight + 混合搜索 + IndexedDB 持久化 | ✅ 已完成 |
| Phase 3 | v2.1.0 | 间隔复习 + 一键转任务 + SM-2 算法 + 频率模板 | ✅ 已完成 |

### 依赖项

- Orama npm 包（<2KB，零依赖）
- AI Provider API Key（用户自备）
- `chrome.bookmarks` API 权限

---

## 9. 成本估算

以 DeepSeek Embedding API 为例：

| 书签数 | 一次性 Embedding 成本 | 每日搜索 10 次 |
|-------|---------------------|---------------|
| 100 | < ¥0.01 | ¥0 (纯本地) |
| 500 | ~¥0.04 | ¥0 (纯本地) |
| 2000 | ~¥0.15 | ¥0 (纯本地) |

Embedding 完成后搜索完全在本地进行，零运行成本。仅新增书签时需调用 API 做增量 Embedding。

---

## 10. 技术风险与对策

| 风险 | 对策 |
|------|------|
| Service Worker 重启丢失内存索引 | IndexedDB 持久化，启动时恢复 |
| API Key 安全 | 加密存储，仅在 background.js 中使用 |
| AI API 不可用 | 降级到纯 BM25 关键词搜索 |
| 书签量过大 (>5000) | 分批 Embedding，进度提示 |
| MV3 CSP 限制 | Orama 纯 JS 无 eval，无影响 |
| 权限敏感 | `optional_permissions` 按需申请 |

---

## 11. 后续演进

- **v2.2.0** ✅：LLM 重排序（对 Top-K 精排）、网页内容抓取增强 → [PRD](v2.2.0-llm-reranking-web-summary.md)
- **v2.3.0**：可选本地 Embedding 模型（Transformers.js）
- **v2.4.0**：复习热力图和统计仪表盘、跨目录相似书签发现
- **v3.0.0**：支持 Ollama 等本地 LLM、多轮对话式书签问答

---

*文档版本: 2.1.0*  
*作者: AI Assistant*  
*最后更新: 2026-03-04*  
*Phase 2 实现备注: 未使用 Orama 库，改用原生 IndexedDB + 手写向量搜索（cosine similarity + RRF 融合），避免第三方依赖。*  
*Phase 3 实现备注: SM-2 改良算法适配书签场景，支持 4 种频率模板；新标签页"今日推荐阅读"卡片含 4 档反馈操作；Spotlight 搜索结果和书签面板均支持一键转任务。*
