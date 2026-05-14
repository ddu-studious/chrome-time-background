# 书签智能搜索增强 — 技术调研报告

> 调研时间：2026-03-05
> 调研范围：中英文混合分词、本地 NLP、浏览器端 Embedding、竞品分析、底部导航栏优化
> 调研方法：GitHub 开源项目、Chrome Web Store 竞品、Google 搜索、技术文档

---

## 1. 问题背景

### 1.1 已知搜索缺陷

用户使用 Spotlight 搜索 "我要学习Agent"（无空格）时搜不到结果，但 "我要学习 Agent"（有空格）可以搜到 3 条匹配。

**根因**：BM25 搜索的分词策略 `query.split(/\s+/)` 仅按空格拆分。中英文混合无空格时，整个字符串作为单一 term 进行子串匹配，无法命中任何字段。

### 1.2 用户期望

用户希望用自然语言描述需求来搜索，例如："帮我找一个学习 Agent 的教程或工具"。这要求系统具备：
1. 智能分词（中英文混合、自然语言理解）
2. 语义匹配（超越字面匹配）
3. 查询意图理解（从需求描述中提取搜索关键词）

---

## 2. 中英文混合分词方案调研

### 2.1 方案对比

| 方案 | 体积 | 精度 | 复杂度 | 适用场景 |
|------|------|------|--------|---------|
| **正则分词 + N-gram** | 0KB | ⭐⭐⭐ | 低 | 中英文交界拆分、基础子词匹配 |
| **jieba-wasm** | ~5MB WASM + ~3MB 词典 | ⭐⭐⭐⭐⭐ | 中 | 精准中文分词（"自然语言处理" → "自然/语言/处理"） |
| **jieba-js** | ~3MB 词典 | ⭐⭐⭐⭐ | 中 | 纯 JS 中文分词，不依赖 WASM |
| **@echogarden/text-segmentation** | ~200KB | ⭐⭐⭐⭐ | 中 | 多语言分词，TypeScript 原生 |
| **Intl.Segmenter** (浏览器原生) | 0KB | ⭐⭐⭐ | 低 | 基于 ICU 的分词，Chrome 87+ 支持 |

### 2.2 推荐方案

**短期（v2.3.0）**：正则分词 + N-gram + `Intl.Segmenter`

```javascript
// Intl.Segmenter 是浏览器原生 API，无需引入第三方库
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const segments = segmenter.segment('我要学习Agent');
// → ["我", "要", "学习", "Agent"]
```

Chrome 87+ 原生支持 `Intl.Segmenter`，零成本分词。但分词质量不如 jieba，对于搜索场景足够用。

**中期（v2.4.0）**：jieba-wasm（需评估 Chrome 扩展体积限制）

- 项目地址：https://github.com/fengkx/jieba-wasm
- 纯前端可用，CDN 引入
- 精准中文分词，支持搜索引擎模式
- 缺点：WASM + 词典约 8MB，对扩展包体积有影响

### 2.3 Intl.Segmenter 验证

```javascript
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
const text = '我要学习Agent的最佳实践';
const words = [...segmenter.segment(text)]
    .filter(s => s.isWordLike)
    .map(s => s.segment);
// 结果: ["我", "要", "学习", "Agent", "的", "最佳", "实践"]
```

优势：
- Chrome 87+ 内置，零体积增加
- 能识别中英文边界和词语边界
- 结合停用词过滤即可覆盖 90% 搜索场景

---

## 3. 浏览器端本地 Embedding 方案

### 3.1 Transformers.js

| 项目 | 链接 |
|------|------|
| 官方仓库 | https://github.com/xenova/transformers.js |
| 在线 Demo | https://do-me.github.io/SemanticFinder/ |
| 博客参考 | https://www.allaboutken.com/posts/20260302-semantic-search-browser-embeddings/ |

**核心能力**：
- 在浏览器中运行 ONNX 模型（WebAssembly 后端）
- 推荐模型：`all-MiniLM-L6-v2`（23MB，384 维向量）
- 首次加载 2-5 秒，后续从 IndexedDB 缓存恢复
- 支持 WebGPU 加速（Chrome 120+）

**可行性评估**：

| 维度 | 评估 |
|------|------|
| 体积 | 模型 23MB，首次下载后缓存到 IndexedDB |
| 性能 | 单次 embedding ~50ms（WASM），~10ms（WebGPU） |
| 精度 | 英文优秀，中文需测试（`shibing624/text2vec-base-chinese` 中文专用 24MB） |
| 离线 | ✅ 完全离线可用 |
| 隐私 | ✅ 数据不出设备 |
| Chrome 扩展兼容 | ⚠️ WASM 在扩展 background 中有限制，需在页面上下文运行 |

**结论**：Transformers.js 是 v2.4.0 的理想方案。可以完全替代 Embedding API 调用，实现零成本、零延迟、完全离线的语义搜索。但需要解决 Chrome 扩展 CSP 限制。

### 3.2 Gemini Nano (Chrome 内置)

| 维度 | 评估 |
|------|------|
| 体积 | 0KB（Chrome 内置） |
| API | `window.ai` 提议 API（实验性） |
| 可用性 | Chrome 127+ Dev/Canary 频道，需启用 flag |
| 能力 | 文本生成、摘要、翻译，不直接支持 embedding |

**结论**：当前不适用（API 不稳定，不支持 embedding），但长期值得关注。

### 3.3 #TagChoose 方案（竞品参考）

Chrome Web Store 上的 #TagChoose 扩展使用 Gemini Nano 在本地做 AI 标签。但它仅用于标签生成，不做 embedding 搜索。证明了 Chrome 扩展中运行本地 AI 的可行性。

---

## 4. 查询理解与扩展方案

### 4.1 不需要单独服务

当前项目已配置 LLM API（DeepSeek/OpenAI/Gemini），可以直接复用做查询扩展。不需要构建独立的外部服务。

### 4.2 LLM 查询扩展 Prompt

```
你是一个搜索查询优化专家。用户输入了一段搜索需求，请理解用户意图，提取核心搜索关键词。

用户输入："帮我找一个学习Agent的教程或工具"

请返回 JSON：
{
    "intent": "学习AI Agent开发",
    "core_keywords": ["agent", "AI agent", "教程", "tutorial"],
    "expanded_queries": ["AI agent tutorial", "agent framework", "agent development tools"]
}
```

### 4.3 ThinkQE 论文思路

2025 年论文《ThinkQE: Query Expansion via an Evolving Thinking Process》提出了用 LLM 思维链做查询扩展的方法。对我们的启发：
- 不是简单的同义词扩展，而是理解用户意图后生成多维度搜索词
- 可以从"学习Agent"扩展出"agent教程"、"agent框架"、"langchain"等相关概念

### 4.4 推荐方案

1. **立即实施**：正则分词 + 停用词 + N-gram（零成本）
2. **v2.3.0 可选**：LLM 查询扩展按钮（复用已有 API）
3. **v2.4.0**：Transformers.js 本地 embedding + jieba-wasm 分词

---

## 5. 竞品分析

### 5.1 书签搜索类产品

| 产品 | 搜索方式 | 特色 | 价格 |
|------|---------|------|------|
| **Bookmarkjar** | 语义 + 向量搜索 + AI 聊天 | 多平台同步（Twitter/GitHub/Reddit）、自动标签、AI 摘要 | 免费/Pro $5/月 |
| **FindMark** | 模糊搜索 + 语法搜索 | `title:/` `url:/` `#tag` 语法、云备份 | 免费/Pro |
| **AI Bookmarks** | 语义搜索 | 本地向量索引、隐私优先 | 免费 |
| **#TagChoose** | Gemini Nano 本地 AI 标签 | 零云数据传输、离线可用 | 免费 |
| **Bookmark AI Search** | 多 AI Provider | 支持 ChatGPT/Gemini/Grok | 免费 |
| **TabSpark AI** | 语义搜索 | 跨设备同步、智能分类 | 免费 |
| **Raindrop.io** | 全文搜索（Pro） | 嵌套集合、标签、永久页面副本 | 免费/Pro $3/月 |

### 5.2 与我们的对比

| 维度 | 我们（v2.2.0） | Bookmarkjar | FindMark |
|------|---------------|-------------|----------|
| 关键词搜索 | ✅ BM25-like | ✅ | ✅ 模糊搜索 |
| 语义搜索 | ✅ Embedding + 余弦 | ✅ 向量搜索 | ❌ |
| 混合搜索 | ✅ RRF 融合 | ✅ | ❌ |
| LLM 精排 | ✅ Listwise Rerank | ❌ | ❌ |
| AI 聊天 | ❌ | ✅ | ❌ |
| 网页摘要 | ✅ 隐藏标签页抓取 | ✅ AI 提取 | ❌ |
| 自然语言查询 | ⚠️ 分词有缺陷 | ✅ | ❌ |
| 中文支持 | ⚠️ 需优化 | ❌ 英文为主 | ✅ |
| 离线能力 | ❌ 依赖 API | ❌ | ✅ |
| 隐私 | ✅ 数据在本地 | ⚠️ 云端 | ✅ |

### 5.3 我们的差异化优势

1. **深度集成新标签页**：不是独立应用，而是新标签页的一部分
2. **中文深度优化**：竞品大多英文优先
3. **LLM 精排**：独有的搜索结果 AI 重排序
4. **零注册**：不需要账号，即装即用
5. **完全开源/本地**：数据不上传云端

---

## 6. 底部导航栏（图 3 区域）优化调研

### 6.1 当前状态

底部区域包含：
- 热榜文章标题（Reddit 等）滚动展示
- 书签快捷导航标签（水平滚动）

### 6.2 竞品参考

| 产品 | 底部/工具栏设计 |
|------|---------------|
| **Speed Dial 2** | 视觉网格、分组标签（Home/Work/Travel） |
| **TabMark** | 树形书签视图 + AI 搜索栏 |
| **BookmarkStart** | 极简书签列表 + 分组标签 |
| **Bonjourr** | 最小化设计，仅快捷链接 |
| **macOS Dock** | 图标 + 悬停放大效果 |

### 6.3 优化建议

#### A. 视觉与交互增强

| 优化项 | 描述 | 优先级 |
|--------|------|--------|
| **Favicon 图标增大** | 当前标签过小，增加 favicon 至 20×20px | 高 |
| **悬停预览** | hover 显示书签标题和域名的 tooltip | 高 |
| **分组标签** | 支持按文件夹/标签分组显示（如 "工作"、"学习"） | 中 |
| **拖拽排序** | 支持拖拽调整书签显示顺序 | 中 |
| **右键菜单** | 右键弹出操作（在新标签打开、编辑、移除、查看摘要） | 中 |
| **频率排序** | 按使用频率自动调整显示顺序（常用靠前） | 低 |
| **分类图标** | 不同分类用不同颜色/图标标识 | 低 |

#### B. 功能增强

| 优化项 | 描述 | 优先级 |
|--------|------|--------|
| **快速搜索入口** | 点击可直接唤起 Spotlight 并预填关键词 | 高 |
| **最近添加** | 显示最近 N 天新增的书签，带"新"标记 | 中 |
| **阅读进度** | 已复习/未复习状态标记 | 中 |
| **一键抓取** | 长按触发摘要抓取 | 低 |
| **自适应显示** | 根据屏幕宽度智能调整显示数量 | 低 |

#### C. 热榜区域优化

| 优化项 | 描述 | 优先级 |
|--------|------|--------|
| **点击详情** | 点击热榜条目展开摘要/评论预览 | 中 |
| **来源筛选** | 支持按来源（Reddit/HN/GitHub）筛选 | 中 |
| **一键收藏** | 热榜条目可直接添加到书签 | 高 |
| **自定义订阅** | 用户选择关注的热榜频道 | 低 |

---

## 7. 技术选型总结

### 7.1 v2.3.0（立即实施）

| 技术 | 选型 | 理由 |
|------|------|------|
| 中英文分词 | `Intl.Segmenter` + 正则 + N-gram | 零体积、Chrome 内置、够用 |
| 停用词 | 内置中文停用词表（~100 词） | 零依赖 |
| 语义阈值 | 动态阈值函数 | 适应不同查询长度 |
| 查询预处理 | 去虚词 → 构建核心查询 | 提升 embedding 质量 |

### 7.2 v2.4.0（规划中）

| 技术 | 选型 | 理由 |
|------|------|------|
| 本地 Embedding | Transformers.js (`all-MiniLM-L6-v2`) | 离线、免费、23MB |
| 中文 Embedding | `shibing624/text2vec-base-chinese` | 中文专用模型 |
| 精准分词 | jieba-wasm | 搜索引擎模式分词 |

### 7.3 不需要构建外部服务

**核心结论**：不需要构建单独的外部服务。

理由：
1. 分词和停用词过滤在前端即可完成（`Intl.Segmenter`）
2. Embedding 已使用配置的远程 API，未来可迁移到 Transformers.js 本地模型
3. 查询扩展可复用已有 LLM API（DeepSeek/OpenAI/Gemini）
4. 所有数据存储在本地（IndexedDB + chrome.storage）

---

## 8. 参考资料

| 资源 | 链接 |
|------|------|
| Intl.Segmenter MDN | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter |
| Transformers.js | https://github.com/xenova/transformers.js |
| SemanticFinder Demo | https://do-me.github.io/SemanticFinder/ |
| jieba-wasm | https://github.com/fengkx/jieba-wasm |
| jieba-wasm-html | https://github.com/cxumol/jieba-wasm-html |
| @echogarden/text-segmentation | https://github.com/echogarden-project/text-segmentation |
| ThinkQE 论文 | https://arxiv.org/html/2506.09260v1 |
| Bookmarkjar | https://bookmarkjar.com/ |
| FindMark | https://findmark.app/ |
| #TagChoose | https://chromewebstore.google.com/detail/tagchoose-bookmark-manage/hlfgdfpeekcelanebbfchnnneijhophh |
| AI Bookmarks | https://chromewebstore.google.com/detail/ai-bookmarks/pdhoahgbacigogodhjkondfmpofgmkfb |

---

*文档版本: 1.0.0*
*最后更新: 2026-03-05*
