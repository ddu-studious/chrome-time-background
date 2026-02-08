# 滚动信息栏（Ticker）体验优化调研

> **调研日期**: 2026-02-08  
> **调研目标**: 优化当前单条淡入淡出轮播的体验，设计更好的信息栏交互方案  
> **当前问题**: 用户对现有的单条轮播（淡入淡出切换）不太满意

---

## 一、当前实现分析

### 1.1 现有方案

- **模式**：单条轮播，6 秒切换
- **动画**：淡入淡出（opacity + translateY）
- **交互**：悬停暂停、点击跳转、手动上/下一条、刷新、折叠
- **数据源**：GitHub + Hacker News + Reddit + DEV.to

### 1.2 存在问题

1. 信息密度低 — 一次只展示一条
2. 切换动画单调 — 仅淡入淡出
3. 无法预览后续内容
4. 缺少进度指示 — 用户不知道还有多少条

---

## 二、5 种替代方案调研

### 方案 1：纯 CSS 连续滚动 Marquee（Demo 1）

**描述**：所有信息条目在水平方向连续循环滚动，左右边缘使用渐变遮罩实现平滑淡入淡出效果。

**技术要点**：
```css
@keyframes marquee {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
}
.ticker-track {
    display: flex;
    animation: marquee 40s linear infinite;
    will-change: transform;
}
.ticker-mask {
    mask-image: linear-gradient(90deg, transparent 0%, black 8%, black 92%, transparent 100%);
}
```

**优点**：
- 零依赖，纯 CSS 动画
- GPU 加速（transform），极低 CPU 占用
- 信息密度高，一目了然
- 支持 `animation-play-state: paused` 暂停

**缺点**：
- 滚动速度不好控制
- 长标题可能被截断
- 移动端触摸体验一般

**推荐度**：⭐⭐⭐⭐⭐

---

### 方案 2：3D 卡片翻转切换（Demo 2）

**描述**：单条展示，切换时使用 3D 翻转效果（perspective + rotateX），配合底部进度点指示器。

**技术要点**：
```css
.ticker-card { perspective: 800px; transform-style: preserve-3d; }
@keyframes flipOut {
    0% { transform: rotateX(0); opacity: 1; }
    100% { transform: rotateX(90deg); opacity: 0; }
}
@keyframes flipIn {
    0% { transform: rotateX(-90deg); opacity: 0; }
    100% { transform: rotateX(0); opacity: 1; }
}
```

**优点**：
- 视觉效果惊艳
- 信息展示清晰完整
- 带底部 dots 指示器，用户知道进度
- 支持键盘左右切换

**缺点**：
- 仍是单条展示
- 翻转动画可能在低端设备卡顿

**推荐度**：⭐⭐⭐⭐

---

### 方案 3：滑动切换 + 拖拽手势（Demo 3）

**描述**：类似手机轮播图，支持鼠标拖拽滑动切换，带自动播放进度条。

**技术要点**：
```javascript
// 拖拽计算
wrapper.addEventListener('mousedown', (e) => { isDragging = true; startX = e.clientX; });
window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    slides.style.transform = `translateX(${-current * width + (e.clientX - startX)}px)`;
});
// 进度条自动计数
.tp-seg.current .tp-fill { animation: countDown 5s linear forwards; }
```

**优点**：
- 交互直观（拖拽 = 翻页）
- 进度条清晰展示自动播放进度
- 信息展示空间充足（含描述）

**缺点**：
- JavaScript 依赖较重
- 拖拽边界处理复杂
- 移动端需额外处理触摸事件

**推荐度**：⭐⭐⭐⭐

---

### 方案 4：混合双层模式（Demo 4）⭐ 推荐

**描述**：上层是主信息卡片（重点展示，淡入淡出切换），下层是迷你连续滚动栏（展示所有条目摘要）。

**技术要点**：
- 上层：卡片式布局 + 淡入淡出动画
- 下层：纯 CSS marquee 连续滚动 + 渐变遮罩
- 支持折叠下层滚动栏
- 上下层独立控制

**优点**：
- **兼顾重点与信息量** — 上层突出重点，下层展示全貌
- 层次清晰，视觉平衡
- 折叠后退化为单条模式，灵活性强
- 用户可从下层滚动栏快速了解所有内容

**缺点**：
- 占据空间稍大（但可折叠）
- 实现复杂度中等

**推荐度**：⭐⭐⭐⭐⭐

---

### 方案 5：垂直滚动模式（Demo 5）

**描述**：类似股票行情的垂直滚动，每次展示一行，自动向上滚动切换，支持展开显示多行。

**技术要点**：
```javascript
// 垂直滚动
track.style.transform = `translateY(${-current * ITEM_HEIGHT}px)`;
// 展开模式
viewport.style.height = expanded ? (ITEM_HEIGHT * 4) + 'px' : ITEM_HEIGHT + 'px';
```

**优点**：
- 紧凑高效，水平空间充分利用
- 展开模式可同时查看多条
- 滚轮支持自然
- 实时感强（Live Feed 风格）

**缺点**：
- 垂直方向会占更多高度（展开时）
- 习惯差异（多数 ticker 是水平的）

**推荐度**：⭐⭐⭐⭐

---

## 三、方案对比

| 方案 | 信息密度 | 视觉效果 | 交互体验 | 性能 | 实现难度 | 推荐度 |
|------|---------|---------|---------|------|---------|--------|
| 1. CSS Marquee | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 2. 卡片翻转 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 3. 滑动拖拽 | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 4. 混合双层 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 5. 垂直滚动 | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

## 四、核心技术总结

### CSS 关键技术

1. **GPU 加速滚动**：`transform: translateX()` + `will-change: transform`
2. **渐变遮罩**：`mask-image: linear-gradient()` 实现边缘淡化
3. **悬停暂停**：`animation-play-state: paused`
4. **3D 效果**：`perspective` + `rotateX/Y` + `backface-visibility`
5. **磨砂背景**：`backdrop-filter: blur()` 与现有 UI 统一

### JavaScript 关键技术

1. **requestAnimationFrame**：流畅动画控制
2. **拖拽手势**：mousedown/move/up 事件链
3. **进度条自动计数**：CSS animation + JS 状态同步
4. **防抖/节流**：优化频繁触发的事件

### 性能优化要点

1. 优先使用 CSS 动画（`transform` + `opacity`）
2. 合理使用 `will-change`
3. 复制内容实现无缝循环（避免 JS 实时计算）
4. 支持 `prefers-reduced-motion` 无障碍访问

---

## 五、推荐方案

### 首选：方案 4（混合双层模式）

理由：
1. 完美平衡信息密度与视觉效果
2. 上层突出重点，下层展示全貌
3. 折叠后不影响原有体验
4. 实现难度可控，纯 CSS + 少量 JS
5. 可渐进式升级（先改上层动画，再加下层）

### 备选：方案 1（CSS Marquee）

理由：
1. 最简单的实现
2. 性能最好
3. 信息密度最高
4. 作为方案 4 的下层组件直接复用

---

**文档版本**: v1.0  
**调研完成日期**: 2026-02-08  
**Demo 文件**:
- `test/ticker-demo-1-marquee.html` — 连续滚动 + 渐变遮罩
- `test/ticker-demo-2-card-flip.html` — 3D 卡片翻转
- `test/ticker-demo-3-slide-swipe.html` — 滑动拖拽 + 进度条
- `test/ticker-demo-4-hybrid.html` — 混合双层模式
- `test/ticker-demo-5-vertical.html` — 垂直滚动模式
