# 书签向量化与搜索机制说明

> 最后更新: 2026-03-04
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

**分词策略**：按空格分词（`query.split(/\s+/)`），每个 term 独立匹配。中文输入不含空格时作为整体子串匹配。

```
查询 "react hooks"  → terms: ["react", "hooks"]
查询 "前端框架"     → terms: ["前端框架"]（整体匹配）
查询 "react 入门"   → terms: ["react", "入门"]（混合匹配）
```

**评分规则**：
- 命中任一字段: `matched = true`，累加对应权重
- 未命中: `score -= 5`（惩罚不相关）
- 最终过滤: `matched && score > 0`

### 3.2 向量搜索 (`vectorSearch`)

基于余弦相似度的语义搜索。

```javascript
cosineSimilarity(a, b) = dot(a, b) / (||a|| × ||b||)
```

**流程**：
1. 将查询文本转为向量（调用 Embedding API 或使用缓存）
2. 遍历所有书签向量，计算余弦相似度
3. 过滤阈值 > 0.3 的结果
4. 按相似度降序排列

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
| 向量搜索阈值 | 0.3 | 低于此相似度不返回 |
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

*文档版本: 1.0.0*
