# 书签向量化与搜索机制说明

> 最后更新: 2026-03-05
> 适用版本: v2.2.0+
> 核心文件: `js/bookmark-rag.js`

## 1. 架构总览

```
用户输入查询
    │
    ├──────────────────────────────┐
    │                              │
    ▼                              ▼
关键词搜索 (BM25-like)      向量语义搜索 (Cosine Similarity)
    │                              │
    └──────────┬───────────────────┘
               │
               ▼
    RRF (Reciprocal Rank Fusion) 混合融合
               │
               ▼
        Top-K 候选结果
               │
               ▼ [可选, 用户触发]
        LLM 重排序 (Listwise)
               │
               ▼
          最终搜索结果
```

系统采用 **混合检索 + 可选精排** 的三层架构，兼顾速度和精度。

---

## 2. 向量化（Embedding）

### 2.1 什么是向量化

向量化是将文本转换为高维数值向量（浮点数数组）的过程。语义相近的文本在向量空间中距离更近，从而实现"意义匹配"而非"字面匹配"。

```
"React 前端框架" → [0.12, -0.34, 0.56, ..., 0.78]  (384 维)
"Vue.js 组件开发" → [0.15, -0.31, 0.52, ..., 0.75]  (384 维)
                       ↑ 这两个向量距离较近（语义相关）

"烹饪食谱大全"   → [-0.42, 0.67, -0.11, ..., 0.23]  (384 维)
                       ↑ 这个向量距离较远（语义无关）
```

### 2.2 Embedding 文本构建

每个书签被转换为一段组合文本，再调用 API 生成向量：

```javascript
_buildEmbeddingText(bm) {
    // 组合: 标题 + 域名 + 摘要 + 内容标签 + AI标签
    parts = [title, domain, summary, contentTags, aiTags]
    return parts.join(' ').trim();
}
```

| 字段 | 来源 | 示例 |
|------|------|------|
| `title` | Chrome 书签 API | "React Official Documentation" |
| `domain` | URL 解析 | "react.dev" |
| `summary` | LLM 生成（v2.2.0） | "React 官方文档，涵盖组件、Hooks..." |
| `contentTags` | LLM 提取（v2.2.0） | ["react", "hooks", "前端框架"] |
| `aiTags` | AI 标签 | ["frontend", "javascript"] |

**v2.2.0 增强**：新增 `summary` 和 `contentTags` 参与 embedding 生成，使语义信息密度大幅提升。

### 2.3 Embedding API

使用远程 Embedding API（OpenAI 兼容协议），不依赖本地模型：

```
POST {baseUrl}/embeddings
{
  "model": "deepseek-embedding",
  "input": ["React 官方文档 react.dev ..."],
  "dimensions": 384
}
```

| Provider | 模型 | 维度 | 费用（约） |
|----------|------|------|-----------|
| DeepSeek | `deepseek-embedding` | 384 | ¥0.007/万次 |
| OpenAI | `text-embedding-3-small` | 384 | $0.02/百万token |
| Gemini | `text-embedding-004` | 384 | 免费/付费 |
| 自定义 | 可配置 | 可配置 | - |

### 2.4 向量存储

| 层级 | 存储位置 | 用途 |
|------|---------|------|
| 持久化 | IndexedDB `BookmarkRAGIndex.vectors` | 重启后恢复 |
| 内存 | `_vectorMap: Map<id, Float32Array>` | 实时搜索 |
| 查询缓存 | IndexedDB `BookmarkRAGIndex.queryCache` | 相同查询复用，24h 过期 |

**IndexedDB 数据结构**：

```javascript
// vectors store
{ id: "bookmarkId", embedding: [0.12, -0.34, ...], text: "原始文本", ts: 1709538400000 }

// queryCache store
{ query: "react hooks", embedding: [0.08, -0.25, ...], ts: 1709538400000 }
```

### 2.5 批量处理流程

```
processBookmarks(onProgress)
    │
    ├─ 筛选未处理书签 (embeddingDone === false)
    │
    ├─ 按批次处理 (BATCH_SIZE = 25)
    │   ├─ 构建 embedding 文本
    │   ├─ 调用 Embedding API
    │   ├─ 保存到 IndexedDB
    │   └─ 等待 300ms（避免限流）
    │
    └─ 更新 bookmarkCache
```

---

## 3. 搜索机制

### 3.1 关键词搜索 (`search`)

基于子串匹配的加权评分搜索。

**搜索范围**（v2.2.0 扩展后）：

| 字段 | 匹配权重 | 说明 |
|------|---------|------|
| `title` | +10 | 标题，权重最高 |
| `summary` | +6 | 网页摘要（v2.2.0 新增） |
| `domain` | +5 | 域名 |
| `contentTags` | +4 | 内容标签（v2.2.0 新增） |
| `aiTags` | +3 | AI 标签 |
| `pageDescription` | +2 | 页面 meta 描述（v2.2.0 新增） |

**分词策略**（v2.3.0 智能分词）：多层管道分词 `_tokenize(query)`，支持中英文混合、停用词过滤、N-gram 扩展。

```
查询 "react hooks"      → primary: ["react", "hooks"]
查询 "前端框架"         → primary: ["前端", "框架"]（Intl.Segmenter 分词）
查询 "我要学习Agent"    → primary: ["学习", "agent"]（中英文交界分词 + 停用词过滤）
查询 "react 入门"       → primary: ["react", "入门"]
查询 "帮我找个好用的AI工具" → primary: ["好用", "ai", "工具"]
```

分词管道：
1. 中英文/数字交界自动插入空格
2. 标点归一化
3. `Intl.Segmenter`（Chrome 87+ 内置）精细分词
4. 停用词过滤（中英文常见虚词 ~100 个）
5. N-gram 扩展（3 字以上中文词提取 2 字子词，权重减半）

**评分规则**：
- 主要 term 命中: `matched = true`，累加对应权重
- 主要 term 未命中: `score -= 3`（惩罚）
- N-gram 扩展词命中: `matched = true`，权重减半（title +5, summary +3...）
- 最终过滤: `matched && score > 0`

### 3.2 向量搜索 (`vectorSearch`)

基于余弦相似度的语义搜索。

```javascript
cosineSimilarity(a, b) = dot(a, b) / (||a|| × ||b||)
```

**流程**：
1. 查询预处理：`_buildSemanticQuery()` 去停用词，提取核心语义词
2. 将预处理后的文本转为向量（调用 Embedding API 或使用缓存）
3. 遍历所有书签向量，计算余弦相似度
4. 动态阈值过滤（v2.3.0）：根据查询长度自适应
5. 按相似度降序排列

**动态阈值**（v2.3.0 新增）：

| 查询长度 | 阈值 | 适用场景 |
|---------|------|---------|
| ≤5 字符 | 0.35 | 短关键词（"React"） |
| 6-15 字符 | 0.25 | 中等查询（"前端框架"） |
| 16-30 字符 | 0.20 | 长查询（"学习Agent最佳实践"） |
| >30 字符 | 0.15 | 自然语言需求描述 |

**向量搜索的优势**：
- "前端框架" 可以匹配 "Getting Started with React"（语义相关）
- "学习资料" 可以匹配 "Tutorial for Beginners"（意图一致）
- 不受语言限制，中英文可以交叉匹配

**前提条件**：
- 需要配置 AI API Key
- 书签需要完成向量化处理（`_vectorMap.size > 0`）

### 3.3 混合搜索 (`hybridSearch`)

使用 **RRF (Reciprocal Rank Fusion)** 融合两路搜索结果：

```
RRF_score(item) = Σ 1 / (k + rank_i + 1)
```

其中 `k = 60`（平滑常数），`rank_i` 是该项在第 i 路搜索中的排名。

**融合逻辑**：

```
关键词搜索结果: [A(rank=0), B(rank=1), C(rank=2), ...]
向量搜索结果:   [B(rank=0), D(rank=1), A(rank=2), ...]

B 的 RRF 分 = 1/(60+1+1) + 1/(60+0+1) = 0.0161 + 0.0164 = 0.0325 (最高)
A 的 RRF 分 = 1/(60+0+1) + 1/(60+2+1) = 0.0164 + 0.0159 = 0.0323
D 的 RRF 分 = 0 + 1/(60+1+1) = 0.0161
C 的 RRF 分 = 1/(60+2+1) + 0 = 0.0159

最终排序: B > A > D > C
```

**结果标记**：

| `_matchType` | 含义 |
|-------------|------|
| `keyword` | 仅关键词匹配 |
| `semantic` | 仅语义匹配 |
| `hybrid` | 两路都匹配 |
| `reranked` | 经 LLM 精排 |

### 3.4 LLM 重排序 (`rerank`)

对混合搜索的 Top-K 结果调用 LLM 进行精排（Listwise 方式）。

**触发条件**：
- 用户手动点击"AI 精排"按钮
- 搜索结果 >= 3 条
- 已配置 AI API Key

**Prompt 策略**：
```
你是一个搜索结果排序专家。用户搜索了"${query}"。
请根据搜索意图，从以下书签中选出最相关的结果...
```

**返回格式**：
```json
{
  "results": [
    { "index": 1, "score": 95, "reason": "官方权威，直接匹配主题" },
    { "index": 3, "score": 82, "reason": "详细的实践教程" }
  ]
}
```

---

## 4. 查询向量缓存

为避免重复调用 Embedding API，搜索查询的向量会被缓存：

| 属性 | 值 |
|------|---|
| 缓存位置 | IndexedDB `queryCache` store |
| 缓存 Key | `query.trim().toLowerCase()` |
| 有效期 | 24 小时 |
| 淘汰策略 | 过期自动忽略 |

---

## 5. 性能参数

| 参数 | 值 | 说明 |
|------|---|------|
| Embedding 维度 | 384 | 平衡精度与存储 |
| 批处理大小 | 25 | 单次 API 调用的文本数 |
| 批处理间隔 | 300ms | 避免 API 限流 |
| 向量搜索阈值 | 0.15-0.35（动态） | 根据查询长度自适应（v2.3.0） |
| RRF 常数 k | 60 | 标准推荐值 |
| Spotlight 防抖 | 250ms | 输入延迟 |
| 书签面板防抖 | 300ms | 输入延迟 |
| 查询缓存 TTL | 24h | 自动过期 |
| Rerank 超时 | 15s | API 调用超时 |

---

## 6. 降级策略

| 场景 | 行为 |
|------|------|
| 未配置 API Key | 仅关键词搜索 |
| 向量未生成 | 仅关键词搜索 |
| Embedding API 失败 | 降级为关键词搜索，控制台警告 |
| 向量搜索无结果 | 直接返回关键词结果 |
| Rerank 失败/超时 | 保持原排序，UI 提示错误 |
| LLM 返回非 JSON | regex 兜底解析，失败保持原序 |

---

## 7. 数据流向图

```
Chrome 书签 API
    │
    ▼ getSubTree()
书签元数据提取
    │
    ├─ title, url, domain, dateAdded
    │
    ▼ [可选: 用户触发抓取]
网页摘要抓取 (v2.2.0)
    │
    ├─ 创建隐藏标签页
    ├─ 注入提取脚本
    ├─ 获取 title/description/headings/bodyText
    ├─ LLM 生成 summary + contentTags
    │
    ▼
Embedding 文本构建
    │  title + domain + summary + contentTags + aiTags
    │
    ▼ _callEmbeddingAPI()
384 维向量
    │
    ├─ 保存到 IndexedDB (持久化)
    └─ 加载到 _vectorMap (内存)

搜索时:
    query → [空格分词] → 关键词搜索
    query → [Embedding API] → 384维向量 → 向量搜索
    两路结果 → RRF 融合 → Top-K → [可选 LLM Rerank]
```

---

## 8. 数据流程深度解析

> 本节对第 7 节数据流向图中的三个核心环节展开详细说明，包含实际代码调用链、
> 数据格式和存储细节。

### 8.1 网页摘要抓取（Content Extraction + LLM Summary）

#### 8.1.1 整体流程

```
用户点击"抓取摘要"按钮
    │
    ▼ extractAndSummarize(bookmark)
前端 bookmark-rag.js
    │
    ▼ _extractWebContent(url)
    │  chrome.runtime.sendMessage({ action: 'extractWebContent', url })
    │
    ▼ Service Worker (background.js)
    │  extractWebContentInTab(url)
    │
    ├─ 1. 创建隐藏标签页
    │     chrome.tabs.create({ url, active: false })
    │
    ├─ 2. 等待页面加载完成
    │     监听 chrome.tabs.onUpdated → status === 'complete'
    │     超时限制: 20 秒
    │
    ├─ 3. 额外等待 1 秒（等待 JS 渲染）
    │
    ├─ 4. 注入提取脚本
    │     chrome.scripting.executeScript({ target: { tabId }, func: ... })
    │
    ├─ 5. 脚本在目标页面 DOM 中提取:
    │     ├─ title        ← document.title
    │     ├─ description  ← meta[name="description"] 或 meta[property="og:description"]
    │     ├─ headings     ← h1/h2/h3 前 10 个
    │     └─ bodyText     ← 正文内容（去除导航/广告/侧边栏，截取前 3000 字符）
    │
    └─ 6. 关闭隐藏标签页
          chrome.tabs.remove(tabId)
```

#### 8.1.2 隐藏标签页 + 脚本注入机制

**为什么用隐藏标签页？**

Chrome 扩展无法直接用 `fetch` 获取并解析另一个网页的 DOM（跨域限制 + 需要浏览器渲染环境）。解决方案是：

1. **创建一个 `active: false` 的标签页**：在后台悄悄打开目标网页，用户看不到
2. **等待页面完全加载**：通过 `chrome.tabs.onUpdated` 事件监听 `status === 'complete'`
3. **注入脚本提取内容**：用 `chrome.scripting.executeScript` 在目标页面的上下文中执行 JavaScript，直接操作该页面的 DOM

**权限要求**：
- `tabs` — 创建和管理标签页
- `scripting` — 注入脚本到标签页
- `<all_urls>`（可选权限）— 允许脚本注入到任意网站

#### 8.1.3 正文提取策略

注入脚本的内容提取逻辑按优先级查找主体内容区域：

```
article 标签 > main 标签 > [role="main"] > document.body (兜底)
```

找到主体后，**克隆节点**并移除噪声元素：
```
移除的元素: script, style, nav, header, footer, aside, iframe,
           [role="navigation"], [role="banner"],
           .sidebar, .nav, .menu, .ad, .advertisement,
           .social-share, .comment, .comments
```

最终取 `innerText`，合并空白字符，截取前 **3000 个字符** 作为正文内容。

#### 8.1.4 LLM 生成摘要与标签

提取到原始内容后，调用 LLM（Chat API）生成结构化的摘要：

```
输入:
  ├─ 网页标题 (title)
  ├─ 页面描述 (description)
  └─ 正文节选 (bodyText 前 2000 字符)

Prompt 要求:
  ├─ 生成 50-100 字中文摘要
  └─ 提取 5-10 个关键词标签

输出 (JSON):
  {
    "summary": "React 官方文档，涵盖组件、Hooks、状态管理...",
    "tags": ["react", "hooks", "前端框架", "组件化", "javascript"]
  }
```

**调用参数**：
- 模型：用户配置的 Chat 模型（如 deepseek-chat、gpt-4o-mini、gemini-2.0-flash）
- temperature: 0.3（低随机性，输出稳定）
- max_tokens: 500
- 超时: 15 秒
- 开启 `json_mode`（响应格式为 JSON）

**容错处理**：LLM 返回的可能不是合法 JSON，代码会用正则 `/"summary"\s*:\s*"([^"]+)"/` 兜底提取。

#### 8.1.5 抓取结果存入书签

抓取完成后，以下字段会更新到书签对象并持久化到 `chrome.storage.local`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `summary` | string | LLM 生成的中文摘要 |
| `contentTags` | string[] | LLM 提取的关键词标签 |
| `contentExtractedAt` | number | 抓取时间戳 |
| `contentLength` | number | 原始正文长度 |
| `pageDescription` | string | 页面 meta description |

如果该书签已有向量（`embeddingDone === true`），会自动触发 **re-embedding**，用新的摘要信息重新生成向量。

---

### 8.2 Embedding 向量化（调用外部 API）

#### 8.2.1 文本构建

每个书签在向量化前，会先构建一段组合文本作为 Embedding 的输入：

```
构建规则 (_buildEmbeddingText):
    title + domain + summary + contentTags + aiTags
    各部分用空格拼接

示例:
    输入书签: { title: "React 官方文档", domain: "react.dev",
               summary: "React 是 Facebook 开发的前端框架...",
               contentTags: ["react", "hooks"], aiTags: ["frontend"] }

    生成文本: "React 官方文档 react.dev React 是 Facebook 开发的前端框架... react hooks frontend"
```

**设计意图**：将书签的多维信息（标题、域名、摘要、标签）融合为一段密集文本，让 Embedding 模型能捕捉到完整的语义信息。

#### 8.2.2 API 调用细节

使用 **OpenAI 兼容协议** 调用 Embedding API，这意味着 DeepSeek、OpenAI、Gemini 和自定义端点使用统一的请求格式：

```
请求:
    POST {baseUrl}/embeddings
    Headers:
      Content-Type: application/json
      Authorization: Bearer {apiKey}
    Body:
      {
        "model": "deepseek-embedding",     // 因 provider 而异
        "input": ["文本1", "文本2", ...],   // 批量输入（最多 25 条）
        "dimensions": 384                   // DeepSeek 不发此参数
      }

响应:
    {
      "data": [
        { "embedding": [0.12, -0.34, 0.56, ..., 0.78], "index": 0 },
        { "embedding": [0.15, -0.31, 0.52, ..., 0.75], "index": 1 },
        ...
      ]
    }
```

**后处理**：
- 如果返回的向量维度超过 384，截取前 384 维
- 将 JavaScript 普通数组转为 `Float32Array`（节省内存，加速计算）

**各 Provider 差异**：

| Provider | 模型 | 特殊处理 |
|----------|------|---------|
| DeepSeek | deepseek-embedding | 不发 `dimensions` 参数（API 不支持） |
| OpenAI | text-embedding-3-small | 发 `dimensions: 384` |
| Gemini | text-embedding-004 | 发 `dimensions: 384` |
| 自定义 | 用户配置 | 发 `dimensions`（如支持） |

#### 8.2.3 批量处理流程

处理大量书签时（如首次启用），采用分批策略避免 API 限流：

```
processBookmarks(onProgress)
    │
    ├─ 筛选: status === 'active' && embeddingDone === false
    │
    └─ 循环 (每批 25 条):
        │
        ├─ 为每条书签构建 embedding text
        │
        ├─ 一次 API 调用传入 25 条文本
        │     POST /embeddings { input: [text1, text2, ..., text25] }
        │
        ├─ 收到 25 个 384 维向量
        │
        ├─ 写入 IndexedDB (持久化)
        ├─ 写入 _vectorMap (内存)
        ├─ 标记 embeddingDone = true
        │
        ├─ 回调 onProgress({ processed, failed, total, percent })
        │
        └─ 等待 300ms → 处理下一批
```

**关键参数**：
- `BATCH_SIZE = 25`：单次 API 调用的文本数
- `BATCH_DELAY_MS = 300`：批次间等待时间（防止触发 API 速率限制）
- 支持中途取消：`cancelProcessing()` 设置 `isProcessing = false`

#### 8.2.4 增量处理

当用户新增书签或书签标题/URL 发生变化时，不需要重新处理所有书签，而是单独处理变化的那一条：

```
processNewBookmark(bookmark)
    │
    ├─ 构建 embedding text
    ├─ 调用 API 获取 1 个向量
    ├─ 保存到 IndexedDB + _vectorMap
    └─ 标记 embeddingDone = true
```

**变化监听**：通过 `chrome.bookmarks.onCreated / onChanged / onRemoved / onMoved` 事件实时响应。

---

### 8.3 数据存储机制（IndexedDB + 内存双层架构）

#### 8.3.1 存储架构总览

```
┌─────────────────────────────────────────────────────┐
│                     内存层 (运行时)                    │
│                                                      │
│  _vectorMap: Map<bookmarkId, Float32Array(384)>      │
│  ├─ 用于实时向量搜索                                  │
│  └─ 页面加载时从 IndexedDB 恢复                       │
│                                                      │
├──────────────────────────────────────────────────────┤
│                   持久化层 (IndexedDB)                 │
│                                                      │
│  数据库: BookmarkRAGIndex (version: 1)                │
│                                                      │
│  ├─ Object Store: vectors                            │
│  │   keyPath: 'id'                                   │
│  │   结构: { id, embedding[], text, ts }             │
│  │                                                   │
│  └─ Object Store: queryCache                         │
│      keyPath: 'query'                                │
│      结构: { query, embedding[], ts }                │
│                                                      │
├──────────────────────────────────────────────────────┤
│                   元数据层 (chrome.storage.local)      │
│                                                      │
│  bookmarkCache: {                                    │
│    version: 1,                                       │
│    lastSyncTime: timestamp,                          │
│    items: [{                                         │
│      id, title, url, domain, dateAdded, parentId,    │
│      aiTags, embeddingDone, srs, status,             │
│      summary, contentTags, contentExtractedAt,       │
│      contentLength, pageDescription                  │
│    }, ...]                                           │
│  }                                                   │
└──────────────────────────────────────────────────────┘
```

#### 8.3.2 为什么用 IndexedDB 而不是 chrome.storage？

| 维度 | chrome.storage.local | IndexedDB |
|------|---------------------|-----------|
| 容量 | 10MB（QUOTA_BYTES） | 理论无上限（浏览器管理） |
| 数据类型 | JSON 序列化 | 支持 ArrayBuffer、Blob 等二进制 |
| 查询能力 | 仅 key-value get/set | 支持 index、range、cursor |
| 适合场景 | 小量配置、书签元数据 | 大量向量数据（每条 384×4=1.5KB） |
| 并发访问 | 无事务控制 | 完整事务支持 |

**结论**：书签元数据（标题、URL、标签等）存 `chrome.storage.local`；大量向量数据存 `IndexedDB`。1000 条书签的向量约占 1.5MB，chrome.storage 可能吃紧，IndexedDB 则毫无压力。

#### 8.3.3 IndexedDB 数据库操作详解

**打开/创建数据库** (`_openDB`)：

```
indexedDB.open('BookmarkRAGIndex', 1)
    │
    ├─ onupgradeneeded (首次或版本升级):
    │   ├─ 创建 'vectors' store (keyPath: 'id')
    │   └─ 创建 'queryCache' store (keyPath: 'query')
    │
    └─ onsuccess: 缓存 db 实例到 this._db
```

**保存向量** (`_saveVectorsToDB`)：

```
输入: [{ id: "123", embedding: Float32Array(384), text: "原始文本" }]

步骤:
1. 开启读写事务: db.transaction('vectors', 'readwrite')
2. 遍历每条向量:
   ├─ Float32Array → 普通数组 (Array.from) 以便 IndexedDB 序列化
   ├─ store.put({ id, embedding: [...], text, ts: Date.now() })
   └─ 同步写入内存 _vectorMap.set(id, Float32Array)
3. 等待事务完成: tx.oncomplete
```

**加载向量到内存** (`_loadVectorsFromDB`)：

```
页面加载时调用:
1. 开启只读事务
2. store.getAll() 获取所有向量记录
3. 遍历结果:
   普通数组 → new Float32Array(embedding) → _vectorMap.set(id, ...)
4. 日志: "Loaded N vectors from IndexedDB"
```

**查询向量缓存** (`_getCachedQueryVector / _cacheQueryVector`)：

```
搜索时:
1. 标准化查询: query.trim().toLowerCase()
2. 查找缓存: store.get(normalizedQuery)
3. 检查过期: Date.now() - result.ts < 24h?
   ├─ 未过期: 返回缓存的 Float32Array（省一次 API 调用）
   └─ 已过期或不存在: 调用 Embedding API → 缓存结果
```

#### 8.3.4 数据生命周期

```
书签收藏
    │
    ▼ Chrome Bookmarks API 事件
syncBookmarks() → bookmarkCache (chrome.storage.local)
    │
    ▼ [用户触发]
extractAndSummarize() → 更新 summary/contentTags → bookmarkCache
    │
    ▼ [用户触发 / 自动]
processBookmarks() → _callEmbeddingAPI()
    │
    ├─ vectors → IndexedDB (BookmarkRAGIndex.vectors)
    └─ Float32Array → _vectorMap (内存)

搜索时:
    query → _callEmbeddingAPI() / 查缓存
                                    │
                                    ├─ 缓存命中 → 直接用
                                    └─ 缓存未命中 → API → 存入 queryCache

书签删除:
    │
    ├─ bookmarkCache 移除条目
    ├─ IndexedDB 删除向量 (_deleteVectorFromDB)
    └─ _vectorMap 删除条目
```

#### 8.3.5 数据量估算

| 1000 条书签 | 大小估算 |
|------------|---------|
| bookmarkCache (chrome.storage.local) | ~500KB（含摘要和标签） |
| vectors (IndexedDB) | ~1.5MB（384 维 × 4 bytes × 1000） |
| _vectorMap (内存) | ~1.5MB（Float32Array） |
| queryCache (IndexedDB) | 极小（几十条缓存查询） |

---

## 9. 操作示例：一条书签的完整处理链路

以收藏 `https://react.dev` 为例，展示从收藏到可被语义搜索命中的全过程：

```
Step 1: 用户收藏网页
    → chrome.bookmarks.onCreated 触发
    → syncBookmarks() 生成初始记录:
      { id: "789", title: "React", url: "https://react.dev",
        domain: "react.dev", aiTags: [], embeddingDone: false,
        summary: "", contentTags: [] }

Step 2: 用户点击"抓取摘要"
    → extractAndSummarize(bookmark)
    → background.js 创建隐藏标签页打开 react.dev
    → 注入脚本提取: title/description/headings/bodyText
    → LLM 生成: summary="React 是 Facebook 开源的前端 UI 框架..."
                tags=["react", "hooks", "前端框架", "facebook", "javascript"]
    → 更新 bookmarkCache

Step 3: 用户点击"向量化处理"
    → processBookmarks()
    → 构建文本: "React react.dev React 是 Facebook 开源的前端 UI 框架... react hooks 前端框架 facebook javascript"
    → POST https://api.deepseek.com/v1/embeddings
      { model: "deepseek-embedding", input: ["React react.dev..."] }
    → 获得 384 维向量: [0.12, -0.34, 0.56, ...]
    → IndexedDB.put({ id: "789", embedding: [...], text: "...", ts: ... })
    → _vectorMap.set("789", Float32Array([0.12, -0.34, ...]))

Step 4: 用户搜索"前端框架教程"
    → hybridSearch("前端框架教程")
    → 关键词路径: "前端框架" 命中 contentTags → score +4
    → 向量路径: query → Embedding API → 384 维查询向量
      → cosine("前端框架教程"向量, React 书签向量) = 0.82 (高相关!)
    → RRF 融合: 两路都命中 → _matchType: "hybrid"
    → React 书签排名靠前，展示给用户
```

---

*文档版本: 1.2.0*
