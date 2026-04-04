# PRD: 知识墙内容复制增强

**版本号**: v3.20.0  
**创建日期**: 2026-04-04  
**优先级**: P1（体验优化）  
**状态**: ✅ 已完成  
**调研依据**: `docs/research/markdown-content-copy-research.md`

---

## 1. 背景

用户反馈知识墙卡片内容难以复制："都是小手状态，怎么才能选中复制呢？"拖拽排序功能虽已修复为仅头部触发，但 Markdown 渲染后的代码块、普通文本等缺乏便捷的复制入口，与 GitHub / Notion 等主流产品体验存在差距。

## 2. 目标


| 指标                | 当前        | 目标           |
| ----------------- | --------- | ------------ |
| 支持复制按钮的卡片类型       | 仅 code    | 全部 5 种       |
| Markdown 代码块可一键复制 | ❌         | ✅            |
| 行内代码可点击复制         | ❌         | ✅            |
| 复制操作有视觉反馈         | Toast 仅文字 | 图标变化 + Toast |


## 3. 功能设计

### 3.1 代码块 Hover 复制按钮（P0）

**触发**: 鼠标悬浮在 Markdown 渲染出的 `<pre>` 代码块上  
**展示**: 右上角浮现半透明复制按钮，带 tooltip "复制代码"  
**点击**: 复制 `<code>` 的 `textContent`（纯文本，不含 HTML 标签）  
**反馈**: 图标从 `fa-copy` 变为 `fa-check`，1.5s 后恢复；同时 Toast "已复制"  
**位置**: Markdown 渲染器层（`markdown-renderer.js`）注入 DOM  
**适用范围**: 知识墙卡片 + 备忘录 Markdown 内容

### 3.2 全类型卡片复制按钮（P1）

**变更**: 将 `renderCard` 中复制按钮的条件从 `card.type === 'code'` 改为始终渲染  
**行为**: 复制 `card.content` 原始文本（已有 `copyContent` 方法）  
**位置**: 卡片操作栏（`wc-card-actions`）

### 3.3 行内代码点击复制（P2）

**触发**: 点击 Markdown 渲染出的行内 `<code>` 元素（非 `<pre>` 内）  
**反馈**: 短暂添加 `.copied` class 显示对勾 + tooltip "已复制"  
**体验**: 鼠标悬浮时光标变为 pointer，暗示可点击

## 4. 技术方案

### 4.1 文件变更


| 文件                        | 变更类型 | 说明                         |
| ------------------------- | ---- | -------------------------- |
| `js/markdown-renderer.js` | 修改   | `renderer.code` 包装复制按钮 DOM |
| `js/knowledge-wall.js`    | 修改   | 复制按钮全类型扩展 + 事件委托           |
| `css/style.css`           | 修改   | 代码块复制按钮样式 + 行内代码交互         |


### 4.2 DOM 结构

代码块渲染后结构：

```html
<div class="kw-code-wrapper">
    <button class="kw-code-copy-btn" aria-label="复制代码" title="复制代码">
        <i class="fas fa-copy"></i>
    </button>
    <pre><code class="hljs language-js">...</code></pre>
</div>
```

### 4.3 事件绑定

- **代码块**: 事件委托到 `.kw-md-body` 容器，匹配 `.kw-code-copy-btn`
- **行内代码**: 事件委托匹配 `code:not(pre code)`
- **卡片级**: 复用现有 `bindCardEvents` 中 `data-action="copy"` 逻辑

## 5. 验收标准

- Markdown 代码块悬浮显示复制按钮
- 点击复制按钮后 `<code>` 纯文本进入剪贴板
- 复制成功后图标变为 ✓ 并在 1.5s 恢复
- 所有类型卡片（笔记/链接/代码/联系人/周记）均有复制按钮
- 行内 `<code>` 可点击复制
- 不破坏正文的文本选中能力
- Chrome 120+ 兼容

## 6. 风险


| 风险       | 缓解                       |
| -------- | ------------------------ |
| 按钮遮挡短代码块 | 按钮小尺寸 + 半透明 + 仅 hover 显示 |
| 行内代码误触   | 较少误触场景，加 tooltip 提示      |


---

