# PRD：常用信息 — 标签归类与 Markdown 增强

> 版本：v3.16.0  
> 日期：2026-03-29  
> 状态：Ready for Dev  
> 关联调研：`docs/research/knowledge-wall-competitive-research.md`

---

## 一、背景与目标

### 1.1 用户反馈

1. 「想通过标签来归类查找卡片」— 现有标签仅作展示，无法点击筛选
2. 「Markdown 编辑时 Tab 键跳走了」— 按 Tab 焦点离开 textarea
3. 「Markdown 编辑体验可以更友好」— 缺少标准快捷键和列表续行能力

### 1.2 目标

- **标签归类**：实现标签云 + 标签点击筛选，支持类型 × 标签交叉筛选
- **Markdown Tab 键**：textarea 拦截 Tab 键，支持缩进/取消缩进
- **Markdown 快捷键**：补全 Ctrl+B/I/K 等标准 Markdown 快捷键

---

## 二、功能需求

### 2.1 标签归类筛选（P0）

#### 2.1.1 标签云区域

**位置**：筛选栏（类型筛选按钮行）下方，搜索框右侧区域

**UI 设计**：
```
┌─────────────────────────────────────────────────────────┐
│ 🔍 搜索...              [全部][笔记][链接][代码][联系人][周记]  │
│ 标签: [全部] [工作 ×3] [学习 ×5] [前端 ×2] [生活 ×1] ...       │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │ 卡片 1    │  │ 卡片 2    │  │ 卡片 3    │               │
│  │ [工作][前端]│  │ [学习]    │  │ [工作]    │               │
│  └──────────┘  └──────────┘  └──────────┘               │
└─────────────────────────────────────────────────────────┘
```

**交互规则**：
1. 标签云自动从所有卡片中收集去重，按使用频率排序
2. 每个标签显示使用计数（如 `工作 ×3`）
3. 点击标签 → 高亮选中 → 仅显示包含该标签的卡片
4. 再次点击已选中的标签 → 取消选中 → 显示全部
5. 支持多标签选中（交集筛选：同时包含所有选中标签的卡片）
6. 与类型筛选组合：类型 × 标签交叉筛选
7. 标签云区域可折叠/展开（默认展开，点击「标签:」标签行切换）
8. 当没有任何标签时，标签云区域不显示

#### 2.1.2 卡片标签点击筛选

**交互**：
- 卡片底部的标签 span 变为可点击
- 点击卡片标签 → 等效于在标签云中选中该标签
- 鼠标悬停标签时显示 hover 效果（下划线 + 指针光标）

#### 2.1.3 数据层

```javascript
// KnowledgeWall 新增属性
this.selectedTags = new Set();  // 已选中的标签集合

// applyFilter() 增强
applyFilter() {
    let list = [...this.cards];
    
    // 类型筛选
    if (this.filterType !== 'all') {
        list = list.filter(c => c.type === this.filterType);
    }
    
    // 标签筛选（交集）
    if (this.selectedTags.size > 0) {
        list = list.filter(c => {
            const cardTags = new Set(c.tags || []);
            return [...this.selectedTags].every(t => cardTags.has(t));
        });
    }
    
    // 搜索
    if (this.searchQuery) { /* 现有逻辑 */ }
    
    // 排序
    list.sort(/* 现有逻辑 */);
    this.filteredCards = list;
}
```

#### 2.1.4 标签统计

```javascript
_getTagStats() {
    const stats = {};
    this.cards.forEach(card => {
        (card.tags || []).forEach(tag => {
            stats[tag] = (stats[tag] || 0) + 1;
        });
    });
    return Object.entries(stats)
        .sort((a, b) => b[1] - a[1])
        .map(([tag, count]) => ({ tag, count }));
}
```

---

### 2.2 Markdown 编辑器 Tab 键支持（P0）

#### 2.2.1 行为定义

| 操作 | 行为 |
|------|------|
| `Tab` | 光标处插入 4 个空格 |
| `Shift+Tab` | 删除当前行行首最多 4 个空格 |
| `Tab`（多行选中） | 所有选中行行首添加 4 个空格 |
| `Shift+Tab`（多行选中） | 所有选中行行首删除最多 4 个空格 |
| `Escape` 后 `Tab` | 恢复浏览器默认 Tab 行为（用于跳出 textarea，无障碍考量） |

#### 2.2.2 实现方案

在 `_bindEditorEvents()` 中为 `#kw-ed-content` textarea 绑定 keydown：

```javascript
textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        const indent = '    '; // 4 spaces
        const { selectionStart, selectionEnd, value } = textarea;
        
        if (e.shiftKey) {
            // Shift+Tab: 取消缩进
            this._unindentSelection(textarea, indent);
        } else {
            if (selectionStart === selectionEnd) {
                // 单光标：插入缩进
                textarea.setRangeText(indent, selectionStart, selectionStart, 'end');
            } else {
                // 多行选中：批量缩进
                this._indentSelection(textarea, indent);
            }
        }
        
        // 触发 input 事件以刷新预览
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
});
```

#### 2.2.3 缩进/取消缩进辅助方法

```javascript
_indentSelection(textarea, indent) {
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const selectedText = value.substring(lineStart, selectionEnd);
    const indented = selectedText.split('\n').map(line => indent + line).join('\n');
    
    textarea.setRangeText(indented, lineStart, selectionEnd, 'select');
    textarea.selectionStart = selectionStart + indent.length;
    textarea.selectionEnd = selectionEnd + indent.length * selectedText.split('\n').length;
}

_unindentSelection(textarea, indent) {
    const { selectionStart, selectionEnd, value } = textarea;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const selectedText = value.substring(lineStart, selectionEnd);
    
    let removedBefore = 0;
    let totalRemoved = 0;
    const unindented = selectedText.split('\n').map((line, i) => {
        const spaces = line.match(/^ {1,4}/)?.[0]?.length || 0;
        if (i === 0) removedBefore = spaces;
        totalRemoved += spaces;
        return line.substring(spaces);
    }).join('\n');
    
    textarea.setRangeText(unindented, lineStart, selectionEnd, 'select');
    textarea.selectionStart = Math.max(lineStart, selectionStart - removedBefore);
    textarea.selectionEnd = selectionEnd - totalRemoved;
}
```

---

### 2.3 Markdown 快捷键增强（P0）

#### 2.3.1 快捷键定义

在 textarea keydown 事件中增加：

| 快捷键 | 动作 | 备注 |
|--------|------|------|
| `Ctrl/Cmd + B` | 插入/切换粗体 `**text**` | 选中文字则包裹，无选中则插入占位 |
| `Ctrl/Cmd + I` | 插入/切换斜体 `*text*` | 同上 |
| `Ctrl/Cmd + K` | 插入链接 `[text](url)` | 选中文字作为链接文本 |
| `Ctrl/Cmd + Shift + K` | 插入代码块 `` `code` `` | 选中文字包裹 |
| `Ctrl/Cmd + Shift + .` | 插入引用 `> text` | 行首插入 |
| `Ctrl/Cmd + Shift + 8` | 插入无序列表 `- item` | 行首插入 |
| `Ctrl/Cmd + Shift + 7` | 插入有序列表 `1. item` | 行首插入 |

#### 2.3.2 实现

复用已有 `_insertMarkdownSyntax()` 方法：

```javascript
textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'bold'); }
        else if (key === 'i') { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'italic'); }
        else if (key === 'k' && !e.shiftKey) { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'link'); }
        else if (key === 'k' && e.shiftKey) { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'code'); }
    }
});
```

---

### 2.4 Markdown 列表自动续行（P1）

#### 行为定义

| 场景 | 当前行内容 | Enter 后行为 |
|------|-----------|-------------|
| 无序列表 | `- 已有内容` | 下一行自动插入 `- ` |
| 有序列表 | `1. 已有内容` | 下一行自动插入 `2. ` |
| 任务列表 | `- [ ] 已有内容` | 下一行自动插入 `- [ ] ` |
| 空列表项 | `- ` | 删除当前行前缀（退出列表模式） |
| 缩进列表 | `    - 已有内容` | 下一行保持相同缩进 `    - ` |

---

## 三、UI 样式规范

### 3.1 标签云样式

```css
.kw-tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
}

.kw-tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 10px;
    border-radius: 12px;
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.7);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
}

.kw-tag-chip:hover {
    background: rgba(255,255,255,0.12);
    color: #fff;
}

.kw-tag-chip.active {
    background: rgba(59,130,246,0.3);
    color: #60a5fa;
    border: 1px solid rgba(59,130,246,0.4);
}

.kw-tag-chip .kw-tag-count {
    font-size: 10px;
    opacity: 0.6;
}
```

### 3.2 卡片标签可点击样式

```css
.wc-tags span {
    cursor: pointer;
    transition: all 0.15s;
}

.wc-tags span:hover {
    text-decoration: underline;
    opacity: 1;
}
```

---

## 四、验收标准

### 4.1 标签归类

- [ ] 标签云区域正确展示所有已使用标签及其计数
- [ ] 点击标签云标签，卡片列表正确筛选
- [ ] 多标签选中时，显示交集结果
- [ ] 类型筛选 + 标签筛选可组合使用
- [ ] 点击卡片上的标签，等效于标签云选中
- [ ] 标签云在无标签时不显示
- [ ] 搜索框清空后标签筛选仍有效

### 4.2 Markdown Tab 键

- [ ] Tab 在 textarea 中插入 4 空格（不跳出焦点）
- [ ] Shift+Tab 删除行首最多 4 空格
- [ ] 多行选中 Tab/Shift+Tab 批量缩进/取消缩进
- [ ] Tab 操作后 Markdown 预览正确刷新

### 4.3 Markdown 快捷键

- [ ] Ctrl/Cmd+B 插入/切换粗体
- [ ] Ctrl/Cmd+I 插入/切换斜体
- [ ] Ctrl/Cmd+K 插入链接
- [ ] 快捷键操作后光标位置正确
- [ ] 与浏览器/系统快捷键不冲突

---

## 五、技术实现要点

### 影响文件

| 文件 | 变更 |
|------|------|
| `js/knowledge-wall.js` | 核心逻辑：标签筛选、Tab 拦截、快捷键 |
| `css/style.css` | 标签云样式、卡片标签 hover 样式 |

### 不涉及的文件

- `manifest.json` — 无新权限
- `background.js` — 无后台逻辑
- `index.html` — 无 DOM 变更（标签云由 JS 动态注入）
