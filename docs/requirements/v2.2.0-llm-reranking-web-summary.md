# v2.2.0 LLM 重排序 + 网页摘要抓取

> 文档创建时间：2026-03-04  
> 前置版本：v2.1.0（间隔复习 + 一键转任务）  
> 关联文档：`docs/requirements/v2.0.0-bookmark-intelligent-search.md`  
> 调研依据：LLM reranking 最佳实践（pointwise/listwise）、Readability.js、chrome.scripting API

## 1. 背景与目标

### 1.1 当前现状

v2.1.0 已实现完整的书签 RAG 搜索系统：

| 已有能力 | 状态 |
|---------|------|
| BM25 关键词搜索 | ✅ |
| 384 维向量搜索（cosine similarity） | ✅ |
| RRF 混合融合排序 | ✅ |
| Spotlight 快捷搜索（Ctrl+K） | ✅ |
| SM-2 间隔复习 | ✅ |
| 一键转任务 | ✅ |

### 1.2 痛点

| 痛点 | 描述 | 影响 |
|------|------|------|
| 排序精度有限 | RRF 融合是纯数学排序，无法理解查询意图 | 语义模糊查询（如"学习资料"）的结果不够精准 |
| Embedding 信息稀疏 | 仅基于标题 + 域名生成 embedding，语义信息不够丰富 | 标题不含关键词的书签无法被语义搜索命中 |
| 缺乏页面上下文 | 不了解书签指向的实际内容 | 搜索"前端框架"找不到标题为"Getting Started"的 React 文档 |

### 1.3 目标

在 v2.1.0 基础上增加两项核心增强：

1. **LLM 重排序**：对混合搜索 Top-K 结果做 LLM 精排，理解查询意图与结果的语义匹配度
2. **网页摘要抓取**：抓取书签页面正文内容，生成摘要 + 关键词，增强 embedding 语义密度

### 1.4 核心决策

| 讨论项 | 决策 | 理由 |
|--------|------|------|
| 重排序方式 | Listwise（非 Pointwise） | 书签场景候选量少（<30 条），一次请求更经济 |
| 重排序触发 | 默认关闭，按钮触发 | 避免每次搜索增加 1-2s 延迟 |
| 网页抓取方式 | 隐藏标签页 + scripting 注入 | 支持 JS 渲染页面，提取更完整 |
| 权限策略 | optional_host_permissions | 按需申请，不影响安装体验 |
| 摘要生成 | 复用已配置的 LLM | 无额外配置成本 |
| 抓取触发 | 手动（面板按钮 + 批量） | 用户控制，避免意外消耗 API 额度 |

---

## 2. 用户故事

- 作为用户，搜索"机器学习入门"时，我希望 AI 能把最相关的学习教程排到最前面，而不是按向量分数排列。
- 作为用户，我希望系统能抓取书签页面的实际内容，这样搜索"React hooks"时也能找到标题为"Getting Started with Modern Frontend"的页面。
- 作为用户，我希望在 Spotlight 搜索结果不理想时，点一下"AI 精排"就能获得更好的排序。
- 作为用户，我希望在书签面板看到每个书签的一句话摘要，帮我快速回忆它是关于什么的。
- 作为用户，我希望可以批量为书签抓取摘要，一键处理所有未抓取的书签。

---

## 3. 范围

### 3.1 必做（v2.2.0）

#### LLM 重排序
- Spotlight 搜索结果底部增加"AI 精排"按钮
- 点击后对 Top-K 结果调用 LLM 进行 listwise 重排序
- 重排后结果带"AI 精排"徽章，显示 LLM 评分
- 支持所有已配置的 AI Provider（DeepSeek/OpenAI/Gemini/自定义）
- 加载态 + 错误处理 + 降级提示

#### 网页摘要抓取
- `manifest.json` 新增 `scripting` 权限和 `optional_host_permissions`
- 书签面板每条书签增加"抓取摘要"按钮（漏斗图标）
- 面板顶部增加"批量抓取"按钮，处理所有未抓取书签
- 抓取流程：创建隐藏标签页 → 注入提取脚本 → 获取正文 → LLM 摘要 → 更新数据
- 抓取后书签显示一行摘要预览
- 摘要数据参与 embedding 生成，增强搜索语义
- Spotlight 搜索结果中显示摘要片段

### 3.2 明确不做

- 不做自动抓取（避免未授权消耗 API）
- 不引入 Readability.js（手写轻量提取函数，减少依赖）
- 不做全文索引（仅存摘要 + 关键词，控制存储量）
- 不做 Pointwise 重排序（候选量少，Listwise 更高效）

---

## 4. 交互与视觉规范

### 4.1 Spotlight 搜索 — AI 精排

```
┌───────────────────────────────────────────┐
│  🔍 搜索书签...                           │
├───────────────────────────────────────────┤
│                                           │
│  📌 关键词匹配 (2)                        │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 React Official Documentation   │    │
│  │    react.dev                      │    │
│  │    📝 React 官方文档，涵盖 Hooks… │    │
│  └───────────────────────────────────┘    │
│                                           │
│  🤖 语义推荐 (5)                          │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 Modern Frontend Dev    92%     │    │
│  │    blog.example.com               │    │
│  │    📝 深入解析 React 18 新特性…   │    │
│  └───────────────────────────────────┘    │
│                                           │
│  ┌───────────────────────────────────┐    │
│  │  ✨ AI 精排  │  对结果智能重排序   │    │
│  └───────────────────────────────────┘    │
│                                           │
└───────────────────────────────────────────┘
```

AI 精排后：

```
┌───────────────────────────────────────────┐
│  🔍 react hooks                           │
├───────────────────────────────────────────┤
│                                           │
│  ✨ AI 精排结果                            │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 React Official Documentation   │    │
│  │    react.dev          ✨ AI 精排   │    │
│  │    📝 React 官方文档，涵盖 Hooks… │    │
│  │    💡 官方权威，直接匹配 hooks 主题│    │
│  └───────────────────────────────────┘    │
│  ┌───────────────────────────────────┐    │
│  │ 🔗 Modern Frontend Dev  ✨ AI 精排│    │
│  │    blog.example.com               │    │
│  │    📝 深入解析 React 18 新特性…   │    │
│  │    💡 详细讲解自定义 hooks 实践    │    │
│  └───────────────────────────────────┘    │
│                                           │
│  ✅ AI 已重排 7 条结果（用时 1.2 秒）     │
│                                           │
└───────────────────────────────────────────┘
```

### 4.2 书签面板 — 摘要抓取

```
┌────────────────────────────────────────────────┐
│  📚 书签管理          🔄 批量抓取  ✕           │
├────────────────────────────────────────────────┤
│  🔍 搜索书签...                                │
│                                                │
│  ┌────────────────────────────────────────┐    │
│  │ 🔗 React Official Documentation       │    │
│  │    react.dev · 2天前收藏               │    │
│  │    📝 React 官方文档，涵盖组件、       │    │
│  │       Hooks、状态管理等核心概念…       │    │
│  │    ─────────────────────────────       │    │
│  │    📊 摘要已抓取 · 转任务 · 查看       │    │
│  └────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────┐    │
│  │ 🔗 Getting Started with TypeScript     │    │
│  │    typescriptlang.org · 1周前收藏      │    │
│  │    ⚡ 未抓取摘要                       │    │
│  │    ─────────────────────────────       │    │
│  │    🔍 抓取摘要 · 转任务 · 查看         │    │
│  └────────────────────────────────────────┘    │
│                                                │
│  📊 总计 45 · 已处理 38 · 已抓取 22           │
│                                                │
└────────────────────────────────────────────────┘
```

---

## 5. 数据结构

### 5.1 书签元数据扩展

```javascript
// bookmarkCache.items[] 每条书签新增字段
{
    // ...（已有字段不变）
    summary: string,            // LLM 生成的摘要（50-100 字）
    contentTags: string[],      // LLM 从正文提取的关键词标签
    contentExtractedAt: number, // 抓取时间戳
    contentLength: number,      // 原始正文字符数
    pageDescription: string     // <meta description> 内容
}
```

### 5.2 LLM 重排序缓存（内存级，不持久化）

```javascript
{
    query: string,
    results: [{
        bookmarkId: string,
        rerankScore: number,    // LLM 评分 0-100
        reason: string          // LLM 给出的相关理由
    }],
    timestamp: number
}
```

---

## 6. 技术方案

### 6.1 LLM 重排序

#### 架构

```
hybridSearch(query, limit=30)
    │
    ▼
Top-30 候选结果
    │
    ▼ [用户点击"AI 精排"]
    │
构造 Listwise Prompt
    │
    ▼
LLM API (chat/completions)
    │
    ▼
解析重排结果 → 更新展示
```

#### Prompt 模板

```
你是一个搜索结果排序专家。用户搜索了"${query}"。

请根据搜索意图，从以下书签中选出最相关的结果，按相关度从高到低排序。

评判标准：
1. 与搜索意图的语义匹配度
2. 内容的权威性和实用性
3. 标题和摘要的信息密度

书签列表：
${candidates.map((c, i) => `${i+1}. ${c.title} (${c.domain})${c.summary ? '\n   摘要: ' + c.summary : ''}`).join('\n')}

请以 JSON 格式返回，只包含相关的书签：
{"results": [{"index": 序号, "score": 0-100, "reason": "一句话理由"}]}
```

#### 错误处理

| 场景 | 处理 |
|------|------|
| LLM 返回非 JSON | 尝试 regex 提取，失败则保持原排序 |
| LLM 超时 | 3 秒超时，提示"精排超时，已显示原始排序" |
| API 额度不足 | 提示"API 调用失败，请检查额度" |
| 结果数过少（<3） | 不展示精排按钮 |

### 6.2 网页摘要抓取

#### 抓取流程

```
用户点击"抓取摘要"
    │
    ▼
memo.js → background.js (sendMessage)
    │
    ▼
background.js:
  1. 创建隐藏标签页 (active: false)
  2. 导航到书签 URL
  3. 等待页面加载完成 (onUpdated: complete)
  4. chrome.scripting.executeScript 注入提取函数
  5. 获取提取结果 {title, description, headings, bodyText}
  6. 关闭隐藏标签页
    │
    ▼
  7. 调用 LLM 生成摘要 + 关键词
    │
    ▼
  8. 更新 bookmarkCache 数据
  9. 重新生成 embedding（使用增强文本）
  10. 回传结果给 memo.js 更新 UI
```

#### 正文提取函数（注入到目标页面）

```javascript
function extractPageContent() {
    const title = document.title || '';
    const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';

    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
        .slice(0, 10)
        .map(h => h.innerText.trim())
        .filter(Boolean);

    // 正文提取：优先 article > main > body
    const article = document.querySelector('article')
        || document.querySelector('main')
        || document.querySelector('[role="main"]')
        || document.body;

    // 移除干扰元素
    const clone = article.cloneNode(true);
    clone.querySelectorAll('script, style, nav, header, footer, aside, [role="navigation"], [role="banner"], .sidebar, .nav, .menu, .ad, .advertisement, .social-share')
        .forEach(el => el.remove());

    const bodyText = clone.innerText
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 3000);

    return {
        title,
        description: metaDesc || ogDesc,
        headings,
        bodyText,
        url: location.href
    };
}
```

#### LLM 摘要 Prompt

```
请为以下网页内容生成摘要和关键词标签。

标题：${title}
描述：${description}
正文（节选）：${bodyText.substring(0, 2000)}

要求：
1. 摘要：50-100 字中文，概括页面核心内容
2. 关键词：5-10 个，涵盖主题、技术栈、领域、用途
3. 关键词使用小写，多词用连字符

JSON 格式返回：
{"summary": "...", "tags": ["tag1", "tag2", ...]}
```

#### Embedding 增强

抓取摘要后，重新生成 embedding：

```javascript
// 原始: title + domain
// 增强: title + domain + summary + contentTags
_buildEmbeddingText(bm) {
    const parts = [bm.title || ''];
    if (bm.domain) parts.push(bm.domain);
    if (bm.summary) parts.push(bm.summary);
    if (bm.contentTags?.length) parts.push(bm.contentTags.join(' '));
    if (bm.aiTags?.length) parts.push(bm.aiTags.join(' '));
    return parts.join(' ').trim();
}
```

### 6.3 权限变更

| 文件 | 变更 |
|------|------|
| `manifest.json` | `permissions` 新增 `"scripting"` |
| `manifest.json` | 新增 `"optional_host_permissions": ["<all_urls>"]` |

### 6.4 代码落点

| 文件 | 变更内容 |
|------|---------|
| `js/bookmark-rag.js` | 新增 `rerank()` 方法、`_callChatAPI()` 方法、`extractPageContent()` 方法、`generateSummary()` 方法、增强 `_buildEmbeddingText()` |
| `js/memo.js` | Spotlight "AI 精排"按钮和交互、书签面板"抓取摘要"按钮和交互、批量抓取 UI |
| `js/background.js` | 新增 `extractWebContent` 消息处理、隐藏标签页管理 |
| `css/style.css` | AI 精排按钮/徽章/加载态样式、摘要预览样式 |
| `manifest.json` | 权限变更 |

---

## 7. 验收标准

### LLM 重排序
- [ ] Spotlight 搜索结果 ≥3 条时，底部显示"AI 精排"按钮
- [ ] 点击按钮后显示加载态（spinner + "AI 正在分析..."）
- [ ] 重排完成后结果更新，带"AI 精排"徽章和相关度理由
- [ ] 重排耗时显示（"AI 已重排 N 条结果（用时 X 秒）"）
- [ ] LLM 超时（3 秒）或失败时友好降级提示
- [ ] 支持所有已配置的 AI Provider

### 网页摘要抓取
- [ ] 书签面板每条未抓取书签显示"抓取摘要"按钮
- [ ] 点击后显示抓取进度（loading 状态）
- [ ] 抓取成功后显示摘要预览（一行，可悬停查看全文）
- [ ] 面板顶部"批量抓取"按钮，带进度提示（"正在抓取 3/15..."）
- [ ] 抓取后自动重新生成 embedding
- [ ] Spotlight 搜索结果中展示摘要片段
- [ ] 首次使用抓取功能时，请求 host_permissions

---

## 8. 成本估算

### LLM 重排序

以 DeepSeek-chat 为例（$0.25/M input, $1.25/M output）：

| 候选数 | Input tokens | Output tokens | 单次费用 | 每日 5 次精排 |
|--------|-------------|--------------|---------|-------------|
| 10 | ~800 | ~200 | ¥0.005 | ¥0.025 |
| 20 | ~1500 | ~400 | ¥0.01 | ¥0.05 |
| 30 | ~2200 | ~600 | ¥0.015 | ¥0.075 |

### 网页摘要抓取

| 操作 | Token 消耗 | 费用（DeepSeek） |
|------|-----------|----------------|
| 单条摘要生成 | ~2500 input + ~200 output | ¥0.005 |
| 100 条批量 | ~250K input + ~20K output | ¥0.5 |
| 500 条批量 | ~1.25M input + ~100K output | ¥2.5 |

抓取后重新 embedding 的费用可忽略（embedding API 费用极低）。

---

## 9. 技术风险与对策

| 风险 | 对策 |
|------|------|
| 隐藏标签页抓取被网站阻止 | 降级提示"无法抓取此页面"，跳过继续 |
| LLM 返回格式不合规 | 多层 JSON 解析 + regex 兜底 |
| 批量抓取消耗大量 API | 进度提示 + 暂停/取消按钮 |
| host_permissions 用户拒绝 | 友好提示"需要权限才能抓取"，功能降级 |
| 某些页面无正文（视频、图片站） | 检测正文长度，<50 字标记为"无法提取" |
| Service Worker 在抓取中被终止 | 单次抓取控制在 30s 内，批量分段处理 |

---

## 10. 后续演进

- **v2.3.0**：可选本地 Embedding 模型（Transformers.js）
- **v2.4.0**：复习热力图、统计仪表盘、跨目录相似书签
- **v3.0.0**：Ollama 本地 LLM、多轮对话书签问答

---

*文档版本: 1.0.0*  
*作者: AI Assistant*  
*最后更新: 2026-03-04*
