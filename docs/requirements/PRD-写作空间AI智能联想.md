# PRD：写作空间 AI 智能联想

> 版本：v1.0  
> 日期：2026-05-10  
> 关联调研：`docs/research/writing-ai-autocomplete-research.md`

---

## 1. 产品概述

### 1.1 背景
写作空间（blog 模块）当前只有基础的 Markdown 编辑和预览功能。用户在写作时无法利用历史文档中的内容进行联想，每次都需要重新回忆和组织。

### 1.2 目标
为写作空间添加 **AI 智能联想**功能，在用户输入时基于其历史文档内容提供内联补全建议（Ghost Text），类似 Cursor Tab / GitHub Copilot 的交互体验。

### 1.3 核心价值
- **提升写作效率**：减少重复输入，快速引用历史内容
- **延续写作风格**：基于用户自己的文档训练，保持一致性
- **个人知识库联想**：将写作空间升级为有记忆的写作助手

---

## 2. 用户角色

| 角色 | 使用场景 |
|------|---------|
| 日常写作者 | 记录随笔、工作笔记，希望快速完成重复性内容 |
| 技术文档编写者 | 写 API 文档、curl 命令等，需要精确的代码片段联想 |
| 知识积累者 | 长期使用写作空间，积累大量文档，希望智能关联旧内容 |

---

## 3. 功能需求

### 3.1 内联补全建议（P0 — Phase 1）

#### 3.1.1 触发条件
- 用户在 textarea 中暂停输入 **800ms** 后自动触发
- 当前行至少输入 **5 个字符**
- 不在代码块（\`\`\`...```）内部时才触发
- 编辑器处于焦点状态

#### 3.1.2 Ghost Text 显示
- 在光标后方显示 **灰色半透明** 建议文字
- 使用 overlay div 精确定位，与 textarea 字体/行高对齐
- 建议文字最长 **2 句话**（约 50-100 字）
- 显示时带有淡入动画（200ms opacity）

#### 3.1.3 交互
| 操作 | 行为 |
|------|------|
| `Tab` 键 | 接受建议，插入到 textarea |
| `Esc` 键 | 取消当前建议 |
| 继续输入 | 自动取消旧建议，触发新一轮补全 |
| 鼠标点击别处 | 取消建议 |
| `Alt + ]` | 切换到下一个候选（Phase 4） |

#### 3.1.4 上下文提取
- 当前光标所在行的文本
- 光标前 5 行的文本
- 当前文档的标题和分类
- 检索到的历史文档片段（Top 3）

### 3.2 历史文档索引（P0 — Phase 2）

#### 3.2.1 索引时机
- 文档 **保存时** 自动触发索引
- 扩展 **安装/启动时** 对已有文档建立全量索引
- 增量更新：只重新索引修改过的文档

#### 3.2.2 索引策略
- 将每篇文档按段落分割为 chunk（每段 ~200 字）
- 使用 gte-small 模型生成 384 维嵌入向量
- 存储到 IndexedDB（表名 `blog_embeddings`）

#### 3.2.3 数据结构

```javascript
// IndexedDB: blog_embeddings store
{
    id: string,           // chunk ID = postId + '_' + chunkIndex
    postId: string,       // 所属文档 ID
    postTitle: string,    // 文档标题（展示用）
    chunkText: string,    // 原始文本片段
    embedding: Float32Array, // 384 维嵌入向量
    updatedAt: number     // 索引时间戳
}
```

### 3.3 API 集成（P0 — Phase 1）

#### 3.3.1 千问 API 配置
- API Key 存储在 `chrome.storage.local`（加密存储）
- 默认使用 `qwen-turbo` 模型
- 支持在设置中切换模型

#### 3.3.2 请求参数
```javascript
{
    model: 'qwen-turbo',
    messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contextPrompt }
    ],
    stream: true,
    max_tokens: 150,
    temperature: 0.3,  // 低温度确保一致性
    stop: ['\n\n']     // 遇到双换行停止
}
```

### 3.4 设置面板（P1 — Phase 3）

在写作空间设置区域添加：

| 设置项 | 默认值 | 说明 |
|--------|--------|------|
| 启用 AI 联想 | 开启 | 总开关 |
| API 提供商 | 千问 | 千问 / DeepSeek / 自定义 |
| API Key | 空 | 用户自行配置 |
| 模型 | qwen-turbo | 可选列表 |
| 触发延迟 | 800ms | 输入停顿后触发 |
| 最大建议长度 | 100字 | 50/100/200 |

---

## 4. 非功能需求

### 4.1 性能
- 建议响应时间 < **1 秒**（从停止输入到显示 ghost text）
- 嵌入索引不阻塞 UI 线程
- 向量检索 < **10ms**（1000 文档 * 5 chunk 规模）

### 4.2 隐私与安全
- 文档内容和嵌入向量**不离开浏览器**（嵌入在端侧生成）
- API Key 仅存储在 `chrome.storage.local`
- 发送给 LLM 的上下文遵循最小化原则

### 4.3 兼容性
- 不影响现有写作空间功能（Markdown 编辑、预览、保存）
- 不影响其他模块（备忘录、知识墙等）
- API Key 未配置时优雅降级（不显示联想，不报错）

### 4.4 存储
- IndexedDB 向量索引空间 < **50MB**（1000 篇文档）
- 提供"清除索引"按钮

---

## 5. UI/UX 设计

### 5.1 Ghost Text 视觉规范

```css
.blog-ghost-text {
    color: rgba(255, 255, 255, 0.35);
    font-style: italic;
    pointer-events: none;
    animation: fadeIn 200ms ease;
}
```

### 5.2 状态指示
- 正在生成建议时：光标后显示 `⋯` 跳动动画
- 建议就绪：显示 ghost text + 底部提示 `Tab 接受`
- 无可用建议：不显示任何内容
- API 配置缺失：编辑器底部显示轻提示 `配置 AI Key 开启智能联想`

### 5.3 首次使用引导
- 首次打开写作空间时弹出引导提示
- 引导配置 API Key
- 展示基本交互方式（Tab 接受、Esc 取消）

---

## 6. 技术实现要点

### 6.1 文件结构（新增）

```
js/
├── blog-ai-suggest.js      # AI 联想核心逻辑
├── blog-vector-store.js     # 向量存储管理
└── blog-ghost-text.js       # Ghost Text UI 组件
```

### 6.2 关键依赖

| 依赖 | 用途 | 引入方式 |
|------|------|---------|
| Transformers.js v4 | 浏览器端嵌入生成 | CDN / 打包 |
| gte-small ONNX | 嵌入模型文件 | 首次使用时下载缓存 |

### 6.3 与现有模块的关系

- `blog.js`：在 `_bindEditorEnhancements()` 中初始化 AI 联想
- `blog.js`：在 `_saveFromEditor()` 中触发文档索引
- `markdown-renderer.js`：无需修改
- `settings.js`：新增 AI 联想设置项

---

## 7. 验收标准

### Phase 1 验收
- [ ] 用户输入暂停 800ms 后显示灰色建议文字
- [ ] Tab 键接受建议并插入 textarea
- [ ] Esc 键取消建议
- [ ] 继续输入自动取消旧建议
- [ ] API Key 未配置时不报错
- [ ] 不影响现有编辑器功能（悬浮菜单、Slash 命令等）

### Phase 2 验收
- [ ] 文档保存后自动生成嵌入索引
- [ ] 建议内容与历史文档内容相关
- [ ] 索引过程不阻塞 UI

---

## 8. 排期预估

| 阶段 | 内容 | 工时 |
|------|------|------|
| Phase 1 | Ghost Text UI + 千问 API 集成 | 3-5 天 |
| Phase 2 | 语义检索（嵌入 + 向量存储） | 3-5 天 |
| Phase 3 | 体验优化（流式、缓存、设置） | 2-3 天 |
| Phase 4 | 高级特性（多候选、本地 LLM） | 3-5 天 |
| **合计** | | **11-18 天** |
