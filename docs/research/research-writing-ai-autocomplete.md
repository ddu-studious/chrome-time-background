# 写作空间 AI 智能联想调研报告

> 调研目标：为写作空间（blog 模块）添加类似 Cursor Tab / GitHub Copilot 的内联自动补全能力，  
> 实现用户在 textarea 输入时自动联想其历史文档内容，提供灰色 ghost text 建议。  
> 调研日期：2026-05-10

---

## 一、竞品分析

### 1.1 Cursor Tab

**核心架构：**
- 自研稀疏语言模型，训练于数十亿 token，专门预测光标附近的编辑和跳转
- 使用 Speculative Decoding：将源码作为 draft tokens，让 70B 模型达到 ~1000 tokens/s（13x 加速）
- 通过在线强化学习（Online RL）每 90 分钟重训模型，基于用户 accept/reject 行为优化
- 上下文构建：对整个仓库做 AST 解析 + 嵌入式语义搜索 + 依赖解析

**性能指标（2026 Fusion 模型）：**
- 延迟：260ms（从 475ms 降低）
- 上下文窗口：13,000 tokens
- 日生成超 10 亿编辑字符
- 日处理超 4 亿请求

**对我们的启示：**
- 延迟控制是核心——建议 < 500ms
- 上下文检索质量决定建议质量
- 需要 accept/reject 反馈机制优化建议

### 1.2 GitHub Copilot

**架构特点：**
- 基于 OpenAI Codex（GPT 系列微调），云端推理
- 通过 VS Code / JetBrains 插件注入内联建议
- 使用 ghost text（灰色幽灵文字）显示在光标处
- Tab 键接受，Esc 键拒绝

**对我们的启示：**
- Ghost text 交互模式已被广泛验证
- 需要优雅的去抖动（debounce）策略

### 1.3 Notion AI

**架构特点：**
- 多模型路由：Claude Opus 4.5/4.6（写作）、GPT-5.2（分析）、Gemini 3（多模态）
- Prompt 缓存减少 85% 延迟、90% 成本
- 块结构架构提供深度结构化上下文

**对我们的启示：**
- 结构化上下文（标题、分类、标签）能提升建议质量
- Prompt 缓存策略值得借鉴

---

## 二、技术方案调研

### 2.1 LLM 选型 — 千问（Qwen）

| 模型 | 输入价格 | 输出价格 | 特点 |
|------|---------|---------|------|
| qwen-turbo | 0.3元/百万Token | 0.6~3元/百万Token | 低成本、低延迟，适合补全 |
| qwen-long | 0.5元/百万Token | 2元/百万Token | 长上下文，适合 RAG |
| qwen3-max | 2.5元/百万Token | 按模式 | 最强推理能力 |
| text-embedding-v3 | 20元/百万Token | 60元/百万Token | 嵌入向量生成 |

**推荐方案：**
- 补全推理：`qwen-turbo`（成本低、延迟小，日常写作足够）
- 嵌入生成：`text-embedding-v3` 或浏览器端 `gte-small`
- 新用户免费额度：超 7000 万 Token

### 2.2 嵌入模型方案

#### 方案 A：云端嵌入（千问 text-embedding-v3）
- 优点：质量高、维护简单
- 缺点：需网络请求、有成本
- 适用：文档量大、质量要求高

#### 方案 B：浏览器端嵌入（Transformers.js + gte-small）
- 优点：离线可用、零成本、隐私安全
- 缺点：首次加载模型 ~10MB、推理较慢
- 适用：Chrome 扩展场景，数据不出端

**推荐：方案 B（浏览器端），理由：**
- Chrome 扩展天然适合端侧计算
- 写作空间数据为个人隐私文档
- gte-small 在 MTEB 基准表现优异（avg 61.36），384 维向量足够
- Transformers.js v4 + WebGPU 已实现 4x 加速

### 2.3 向量存储方案

| 方案 | 大小 | 搜索性能 | 持久化 | 适配性 |
|------|------|---------|--------|--------|
| VecDB-WASM (Rust) | ~100KB | <2ms/10K vectors | IndexedDB | TypeScript 支持 |
| MicroVecDB | ~50KB WASM | 微秒级 | IndexedDB | 1-bit 量化，超轻量 |
| EntityDB | ~10KB | 毫秒级 | IndexedDB | 内置 Transformers.js 集成 |
| 纯 JS 余弦相似度 | 0KB | ~5ms/1K vectors | IndexedDB | 无依赖，最简单 |

**推荐：纯 JS 余弦相似度 + IndexedDB（Phase 1），理由：**
- 写作空间文档量预期 < 1000 篇
- 不引入额外 WASM 依赖
- 后续量级增长再升级 VecDB-WASM

### 2.4 内联建议 UI 实现

#### Ghost Text 方案对比

| 方案 | 适用场景 | 复杂度 |
|------|---------|--------|
| Overlay div + 镜像定位 | textarea（当前编辑器） | 中等 |
| ProseMirror / CodeMirror | 富文本编辑器 | 高（需迁移） |
| 自定义 contentEditable | 完全控制渲染 | 高 |

**推荐：Overlay div + 镜像定位，理由：**
- 当前写作空间使用 `<textarea>`，无需迁移编辑器
- 创建一个与 textarea 完全对齐的透明 overlay div
- Ghost text 以灰色半透明文字显示在光标后方
- Tab 接受建议、Esc 取消、继续输入自动消失

---

## 三、整体架构设计

```
┌─────────────────────────────────────────────────┐
│                写作空间 Blog Module              │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │   textarea    │    │   Ghost Text Overlay   │  │
│  │  (用户输入)   │───▶│   (灰色建议文字)        │  │
│  └──────┬───────┘    └───────────────────────┘  │
│         │ input事件(debounce 800ms)              │
│         ▼                                        │
│  ┌──────────────────────┐                       │
│  │  Context Extractor    │                       │
│  │  提取当前行 + 上下文   │                       │
│  └──────┬───────────────┘                       │
│         │                                        │
│         ▼                                        │
│  ┌──────────────────────┐                       │
│  │  RAG Retriever        │                       │
│  │  ① 嵌入当前上下文      │                       │
│  │  ② 向量检索相似文档    │                       │
│  │  ③ 拼接 prompt        │                       │
│  └──────┬───────────────┘                       │
│         │                                        │
│         ▼                                        │
│  ┌──────────────────────┐                       │
│  │  LLM Completion       │                       │
│  │  千问 qwen-turbo API  │                       │
│  │  流式返回补全建议       │                       │
│  └──────┬───────────────┘                       │
│         │                                        │
│         ▼                                        │
│  ┌──────────────────────┐                       │
│  │  Suggestion Renderer  │                       │
│  │  Ghost Text 渲染      │                       │
│  │  Tab=接受 Esc=取消     │                       │
│  └──────────────────────┘                       │
│                                                  │
│  ┌──────────────────────┐                       │
│  │  Vector Store (IDB)   │                       │
│  │  文档嵌入索引          │                       │
│  │  写入时自动索引        │                       │
│  └──────────────────────┘                       │
└─────────────────────────────────────────────────┘
```

---

## 四、数据流

### 4.1 索引阶段（后台，文档保存时）

```
文档保存 → 分段(按段落) → 生成嵌入(gte-small) → 存入 IndexedDB
```

### 4.2 补全阶段（前台，用户输入时）

```
用户输入 → debounce(800ms) → 提取上下文(当前行+前5行) 
    → 生成查询嵌入 → 向量检索 Top-3 相似段落 
    → 构建 Prompt(上下文+检索结果+指令) 
    → 调用 qwen-turbo 流式补全 
    → 渲染 Ghost Text
```

### 4.3 Prompt 模板

```
你是一个写作助手。基于用户的历史写作风格和当前上下文，续写接下来的内容。

## 历史文档片段（供参考写作风格和主题）
{retrieved_chunks}

## 当前文档
标题：{title}
分类：{category}
已写内容（最近 500 字）：
{recent_context}

## 要求
- 续写 1-2 句话，自然衔接当前内容
- 保持与历史文档一致的写作风格
- 只输出续写内容，不要解释
```

---

## 五、分阶段实施计划

### Phase 1：基础补全（MVP）— 预计 3-5 天

**目标：** 用户输入时显示基于历史文档的补全建议

- [ ] 实现 Ghost Text overlay UI 组件
- [ ] 集成千问 qwen-turbo API（补全接口）
- [ ] 实现简单的关键词匹配检索（BM25 级别）
- [ ] Tab 接受 / Esc 取消 / 继续输入消失
- [ ] 基础的 debounce（800ms）和取消机制

### Phase 2：语义检索 — 预计 3-5 天

**目标：** 使用向量嵌入提升检索质量

- [ ] 集成 Transformers.js + gte-small 模型
- [ ] 文档保存时自动生成嵌入向量
- [ ] IndexedDB 向量存储与余弦相似度搜索
- [ ] 增量索引（新增/修改文档时更新）

### Phase 3：体验优化 — 预计 2-3 天

**目标：** 接近 Cursor Tab 的流畅体验

- [ ] 流式渲染（逐字显示 ghost text）
- [ ] 智能触发（识别合适的补全时机，如句末、段末）
- [ ] 缓存策略（相似输入复用建议）
- [ ] accept/reject 统计反馈
- [ ] 设置面板：开关、API Key 配置、延迟调整

### Phase 4：高级特性（可选）— 预计 3-5 天

- [ ] 多候选建议（上下箭头切换）
- [ ] 基于分类/标签的上下文增强
- [ ] Slash 命令集成（`/ai` 触发全文生成）
- [ ] 本地 LLM 支持（WebLLM / Ollama）

---

## 六、风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| API 延迟过高 | 建议显示慢，影响写作节奏 | 使用流式返回 + debounce；缓存高频建议 |
| 嵌入模型加载慢 | 首次使用体验差 | Service Worker 预加载；显示加载进度 |
| API Key 泄露 | 安全风险 | Key 存在 chrome.storage.local，不上传 |
| 建议质量低 | 干扰写作 | 置信度阈值过滤；用户反馈机制优化 |
| 存储空间 | IndexedDB 配额 | 向量压缩（float16）；LRU 淘汰旧索引 |

---

## 七、成本估算

### 假设场景
- 每天写作 30 分钟
- 平均每分钟触发 3 次补全
- 每次补全消耗 ~500 token（上下文 400 + 输出 100）

### 月度成本
- 日补全次数：90 次
- 日 Token 消耗：45,000 tokens
- 月 Token 消耗：~135 万 tokens

| 组件 | 月成本 |
|------|--------|
| qwen-turbo 补全 | ~0.4 + 0.8 = 1.2 元 |
| 嵌入（浏览器端 gte-small） | 0 元 |
| **合计** | **~1.2 元/月** |

> 新用户免费额度 7000 万 Token 可使用约 4 年

---

## 八、外部 Web 服务 + Qwen API 方案（最终推荐路线）

> 2026-05-17 更新：放弃纯浏览器嵌入方案和 Cursor SDK 方案。
> 采用 cursor-bridge 架构模式，外挂独立 HTTP 服务 + 千问 Qwen API。

### 8.1 三种方案对比

| 维度 | 纯浏览器方案 | Cursor SDK Agent 方案 | **Qwen API 外部服务方案** |
|------|------------|----------------------|--------------------------|
| 模型后端 | 千问 API 直调 | Cursor SDK → Claude/GPT | **千问 OpenAI 兼容 API** |
| 运行时 | Service Worker | Cursor SDK 进程 | **独立 Node.js HTTP 服务** |
| 网络 | 浏览器直连阿里云 | 本地 SDK 进程 | **本地 HTTP → 阿里云** |
| 限制 | CSP/CORS/SW 生命周期 | 依赖 Cursor 订阅 | **无浏览器限制** |
| 成本 | ~1.2 元/月 | Cursor 月费 $20+ | **~1.2 元/月** |
| 模型选择 | 固定千问 | Cursor 可用模型 | **自由切换千问全系列** |
| 流式输出 | fetch + ReadableStream | SDK SSE | **原生 SSE 转发** |
| 离线能力 | 嵌入可离线，补全不行 | 不行 | **不行** |
| 扩展性 | 受 SW 限制 | 受 SDK 限制 | **完全自主，无限扩展** |

### 8.2 为什么选择外部 Web 服务

**放弃纯浏览器方案的理由：**
1. **Service Worker 生命周期不可控** — Chrome 会在 5 分钟无活动后终止 SW，长连接易断
2. **CSP/CORS 限制** — Chrome 扩展的 Content Security Policy 限制了 WebSocket/SSE 的可用性
3. **内存限制** — 嵌入模型 + 向量库 + API 客户端全部在浏览器内存中
4. **调试困难** — SW 内的网络请求不易追踪和调试

**放弃 Cursor SDK 方案的理由：**
1. **强绑定 Cursor 订阅** — 必须有 Cursor Pro 订阅才能使用 SDK
2. **模型选择受限** — 只能用 Cursor 平台上的模型
3. **写作补全不需要工具调用** — Cursor SDK 的 Agent 工具调用能力对纯文本补全过重
4. **延迟偏高** — SDK Agent 冷启动 + 推理延迟在 500-2000ms，不适合实时补全

**外部 Web 服务方案的优势：**
1. **千问 OpenAI 兼容接口** — 直接用 `openai` npm 包调用，零学习成本
2. **成本极低** — qwen-flash 输入 ¥0.029/百万 tokens，写作场景几乎免费
3. **延迟可控** — 千问 API TTFT(首 token 延迟) 约 200-400ms，配合流式输出体验优秀
4. **架构复用** — 复用 cursor-bridge 的 Fastify 框架、SQLite、SSE 基础设施
5. **完全自主** — 不依赖任何第三方 SDK 订阅

### 8.3 千问 Qwen API 最新能力盘点（2026.05）

#### 模型推荐

| 模型 | 输入价格 | 输出价格 | 特点 | 适用场景 |
|------|---------|---------|------|---------|
| **qwen3.5-flash** | ¥0.029/百万 | ¥0.287/百万 | 极低成本、低延迟 | **实时补全（推荐）** |
| qwen-plus | ¥0.80/百万 | ¥2.00/百万 | 效果+速度均衡 | 改写润色 |
| qwen3-max | ¥8.81/百万 | ¥35.24/百万 | 最强推理 | 长文生成、深度改写 |

> 注意：`qwen-turbo` 已弃用，应使用 `qwen3.5-flash` 替代。

#### OpenAI 兼容接口

```
Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1
Auth: Authorization: Bearer {DASHSCOPE_API_KEY}
Endpoint: POST /chat/completions
Stream: stream=true (SSE 协议)
```

#### 关键特性
- **流式输出**：原生 SSE，`stream_options.include_usage=true` 获取 token 统计
- **1M 上下文窗口**：qwen-plus 支持最高 100 万 token 上下文
- **系统消息**：支持 system role 定制写作助手行为
- **温度控制**：`temperature` 参数控制创造性（补全建议 0.3-0.5，创作建议 0.7-0.9）

### 8.4 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Chrome 扩展（前端 UI 层）                          │
│                                                                      │
│  ┌──────────────┐    ┌────────────────────┐                         │
│  │   textarea    │───▶│  Ghost Text Overlay │                         │
│  │  (用户输入)   │    │  (灰色建议文字)      │                         │
│  └──────┬───────┘    └────────────────────┘                         │
│         │ input事件 (debounce 500ms)                                 │
│         ▼                                                            │
│  ┌──────────────────────────┐                                       │
│  │  WritingAssistantClient   │                                       │
│  │  ① 提取上下文              │                                       │
│  │  ② HTTP POST → bridge     │                                       │
│  │  ③ 接收 SSE 流式回复       │                                       │
│  │  ④ 渲染 Ghost Text        │                                       │
│  └──────┬───────────────────┘                                       │
│         │                                                            │
└─────────┼────────────────────────────────────────────────────────────┘
          │ HTTP/SSE (127.0.0.1:19840)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│         cursor-bridge (http://127.0.0.1:19840)                       │
│                                                                      │
│  ┌──────────────────────────┐                                       │
│  │  新增路由: /writing/*      │                                       │
│  │                           │                                       │
│  │  POST /writing/complete   │ ← 补全请求（SSE 流式返回）             │
│  │  POST /writing/suggest    │ ← 主题/标题建议                       │
│  │  POST /writing/rewrite    │ ← 改写润色                            │
│  │  POST /writing/summarize  │ ← 文档摘要生成                        │
│  │  GET  /writing/config     │ ← 获取配置（模型/温度/开关）           │
│  │  PUT  /writing/config     │ ← 更新配置                            │
│  └──────┬───────────────────┘                                       │
│         │                                                            │
│         ▼                                                            │
│  ┌──────────────────────────┐    ┌────────────────────┐             │
│  │  WritingService           │    │  QwenClient          │             │
│  │  • prompt 模板管理         │───▶│  • OpenAI 兼容 SDK   │             │
│  │  • 上下文构建(标题/分类)   │    │  • 流式 SSE 转发     │             │
│  │  • 历史文档检索            │    │  • 请求取消/去重     │             │
│  │  • 风格摘要缓存            │    │  • Token 统计        │             │
│  └──────────────────────────┘    └──────┬─────────────┘             │
│                                          │ HTTPS                     │
│  ┌──────────────────────────┐            ▼                           │
│  │  SQLite — 写作记忆         │    ┌────────────────────┐             │
│  │  • 历史文档嵌入索引        │    │  阿里云 DashScope    │             │
│  │  • 用户写作风格摘要        │    │  qwen3.5-flash 补全  │             │
│  │  • 补全 accept/reject 统计│    │  qwen-plus 改写      │             │
│  │  • 补全缓存(相似输入复用)  │    │  qwen3-max 深度生成  │             │
│  └──────────────────────────┘    └────────────────────┘             │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.5 QwenClient 核心实现

cursor-bridge 中新增 `QwenClient` 服务，使用 `openai` npm 包直连千问：

```typescript
import OpenAI from 'openai';

class QwenClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
  }

  async *streamComplete(
    systemPrompt: string,
    userPrompt: string,
    opts: { model?: string; temperature?: number; maxTokens?: number } = {},
  ): AsyncGenerator<{ type: 'token' | 'done'; content: string; usage?: any }> {
    const stream = await this.client.chat.completions.create({
      model: opts.model || 'qwen3.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: opts.temperature ?? 0.4,
      max_tokens: opts.maxTokens ?? 150,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        yield { type: 'token', content };
      }
      if (chunk.usage) {
        yield { type: 'done', content: '', usage: chunk.usage };
      }
    }
  }
}
```

### 8.6 延迟控制对比

| 环节 | 纯浏览器方案 | Cursor SDK 方案 | **Qwen 外部服务方案** |
|------|------------|----------------|---------------------|
| 前端 → 服务 | N/A | 本地 ~1ms | **本地 ~1ms** |
| 服务 → API | 浏览器 → 阿里云 ~200ms | SDK → Cursor ~300ms | **Node → 阿里云 ~150ms** |
| API 推理 TTFT | qwen-turbo ~300ms | Claude ~500ms | **qwen3.5-flash ~200ms** |
| 总首 token | ~500ms | ~800ms+ | **~350ms** |
| 流式后续 | 逐 token ~30ms/token | ~50ms/token | **逐 token ~20ms/token** |

**Qwen 外部服务方案延迟最优**，因为：
1. Node.js HTTP 客户端比浏览器 fetch 更稳定（无 CORS 预检请求）
2. qwen3.5-flash 推理速度快于 Claude Sonnet
3. 可以在 Node.js 层做连接池复用，减少 TLS 握手开销

### 8.7 上下文构建策略

补全场景不需要复杂的 RAG 流程，直接用结构化上下文即可：

```
用户当前输入: "今天阳光明媚，我决定..."

服务端构建的 prompt:
├── system prompt: "你是一个写作助手。续写 1-2 句话，自然衔接当前内容。"
├── 文档元数据: { title: "周末日记", category: "日记" }
├── 光标前 300 字: "..."
├── (可选) 历史风格摘要: "偏口语化，喜欢短句..."
└── (可选) 相似历史片段 Top-3: [...]

Qwen 回复: "出门走走，顺路去了那家..."
```

后期可在 Node.js 层添加轻量 RAG：
- 用千问 `text-embedding-v3` 生成文档嵌入
- SQLite FTS5 全文搜索 + 余弦相似度
- 比浏览器端方案更稳定可靠

### 8.8 前端对接（最小改动）

前端只需新增一个轻量 `WritingAssistantClient` 类：

```javascript
class WritingAssistantClient {
  async streamComplete(context, onToken, onDone) {
    const res = await fetch('http://127.0.0.1:19840/writing/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'token') onToken(data.content);
          if (data.type === 'done') onDone(data);
        }
      }
    }
  }
}
```

Ghost Text UI 组件不变，仍然是 overlay div + 镜像定位方案。

### 8.9 与多角色协作引擎的协同

cursor-bridge 的多角色引擎继续用 Cursor SDK 驱动（复杂任务），
写作补全独立用 Qwen API 驱动（轻量高速），两者共存不冲突：

| 场景 | 后端 | 模型 | 延迟目标 |
|------|------|------|---------|
| **实时补全** | Qwen API | qwen3.5-flash | < 400ms TTFT |
| **改写润色** | Qwen API | qwen-plus | < 1s |
| **长文生成** | Cursor SDK | claude-sonnet | 无硬性要求 |
| **多角色协作** | Cursor SDK | claude-sonnet | 无硬性要求 |

### 8.10 实施计划（最终版）

#### Phase 1：基础补全 MVP — 预计 2-3 天

- [ ] cursor-bridge 安装 `openai` npm 包
- [ ] 新增 `QwenClient` 服务（OpenAI 兼容接口封装）
- [ ] 新增 `/writing/complete` 路由（SSE 流式返回）
- [ ] `.env` 增加 `DASHSCOPE_API_KEY` 配置
- [ ] 前端 `WritingAssistantClient` 对接
- [ ] Ghost Text overlay UI 组件（Tab/Esc 交互）
- [ ] 基础 debounce (500ms) + 请求取消机制

#### Phase 2：流式体验优化 — 预计 2-3 天

- [ ] SSE 逐 token 流式推送 Ghost Text
- [ ] 请求去重（相同上下文不重复请求）
- [ ] 补全缓存（相似输入复用建议）
- [ ] accept/reject 反馈统计
- [ ] Token 用量追踪（写入 SQLite）

#### Phase 3：智能上下文 — 预计 3-5 天

- [ ] 历史文档自动摘要生成（写入时用 qwen-plus 生成）
- [ ] 基于标题/分类的上下文增强
- [ ] 写作风格学习（从 accept 数据中提取偏好）
- [ ] 智能触发时机（句末、段末、停顿检测）
- [ ] SQLite FTS5 全文搜索检索相关历史文档

#### Phase 4：高级写作能力 — 预计 3-5 天

- [ ] `/writing/rewrite` 改写润色接口
- [ ] `/writing/summarize` 文档摘要接口
- [ ] Slash 命令集成（`/ai rewrite`、`/ai expand`）
- [ ] 设置面板：模型选择、温度调节、API Key 配置
- [ ] 多角色写作工作流（writer + editor，复用 Cursor SDK）

### 8.11 成本估算

#### 假设场景
- 每天写作 30 分钟，平均每分钟触发 3 次补全
- 每次补全：~400 token 输入（上下文 300 + prompt 100）+ ~80 token 输出

#### 月度成本（使用 qwen3.5-flash）

| 组件 | 日消耗 | 月消耗 | 月成本 |
|------|--------|--------|--------|
| 输入 tokens | 36,000 | ~108 万 | ¥0.03 |
| 输出 tokens | 7,200 | ~21.6 万 | ¥0.06 |
| **合计** | | | **¥0.09/月** |

> 千问新用户免费额度 7000 万 Token，可使用约 **5 年**。

### 8.12 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 千问 API 延迟波动 | 偶尔补全慢 | 设置 3s 超时 + 超时静默取消 |
| bridge 未启动 | 写作功能不可用 | 前端优雅降级提示；自动检测 bridge 状态 |
| API Key 泄露 | 安全风险 | Key 仅存 .env 文件，不进 git |
| 模型幻觉 | 补全内容偏离上下文 | 限制 max_tokens=150 + 低温度 0.3-0.5 |
| 阿里云限流 | 请求被拒 | 指数退避重试 + 补全缓存减少请求量 |

---

## 九、结论与建议

1. **最终推荐：Qwen API 外部 Web 服务方案**
   - 复用 cursor-bridge 架构（Fastify + SQLite + SSE）
   - 千问 qwen3.5-flash 作为补全后端，成本 ¥0.09/月
   - 完全自主可控，不依赖 Cursor SDK 订阅
2. **延迟最优**：TTFT ~350ms，优于纯浏览器方案和 Cursor SDK 方案
3. **MVP 可在 2-3 天内完成**：安装 openai 包 + 新增 1 个路由 + 前端客户端
4. **渐进增强**：Phase 1 补全 → Phase 2 流式 → Phase 3 RAG → Phase 4 多角色
5. **双引擎共存**：写作补全用 Qwen API（高速低成本），多角色协作用 Cursor SDK（强推理）
