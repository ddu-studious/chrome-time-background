# 中国风景时钟项目上下文

## 项目信息

- **项目名称**: 中国风景时钟 (China Scenery Clock)
- **版本**: v1.5.1
- **类型**: Chrome Extension (Manifest V3)

## 技术栈

- **平台**: Chrome Extension (Manifest V3)
- **语言**: JavaScript (ES6+), HTML5, CSS3
- **Chrome APIs**: storage, geolocation, tabs, alarms, notifications
- **外部 API**: 和风天气 API

## 核心功能

1. **时间显示**: 实时时钟（12/24小时制）
2. **日期显示**: 公历、农历、节假日
3. **天气功能**: 实时天气、三天预报
4. **背景轮播**: 中国风景图片
5. **备忘录功能**: 任务管理、分类、标签、优先级、截止日期
6. **多语言支持**: 中文/英文

## 关键文件路径

### 核心文件
- 配置文件: `manifest.json`
- 新标签页: `index.html`
- Service Worker: `js/background.js`

### JavaScript 模块
- 主入口: `js/main.js`
- 时钟模块: `js/clock.js`
- 农历模块: `js/lunar.js`
- 节假日模块: `js/holidays.js`
- 天气模块: `js/weather.js`
- 设置管理: `js/settings.js`
- 国际化: `js/i18n.js`
- 备忘录: `js/memo.js`（最核心，2000+ 行）

### 样式
- 主样式: `css/style.css`（磨砂玻璃效果）

### 资源
- 图标: `icons/` (icon.svg, icon16.png, icon48.png, icon128.png)

## 常用命令

```bash
# 加载扩展到 Chrome
1. 打开 chrome://extensions/
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目目录

# 重新加载（代码修改后）
在 chrome://extensions/ 点击扩展卡片上的刷新按钮

# 调试新标签页
右键新标签页 -> 检查

# 调试 Service Worker
chrome://extensions/ -> 详情 -> 检查视图: Service Worker
```

## 备忘录数据结构

```javascript
{
    id: string,           // 唯一ID
    title: string,        // 标题
    text: string,         // 内容
    completed: boolean,   // 完成状态
    createdAt: number,    // 创建时间戳
    updatedAt: number,    // 更新时间戳
    categoryId: string,   // 分类ID
    tagIds: string[],     // 标签ID数组
    priority: string,     // 'high' | 'medium' | 'low' | 'none'
    dueDate: string       // 'YYYY-MM-DD'
}
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `按 Ctrl/⌘ + Shift + B 切换背景` | 切换背景图片 |
| `Ctrl + N` | 添加新任务 |
| `Ctrl + H` | 显示/隐藏备忘录面板 |
| `Ctrl + ?` | 显示快捷键帮助 |
| `↑/↓` | 导航任务列表 |
| `Space` | 切换任务完成状态 |
| `E` | 编辑选中任务 |
| `Delete` | 删除选中任务 |

## MCP 工具使用

- **Browser**: 测试扩展功能、验证 UI 交互
- **Sequential Thinking**: 分析复杂功能实现方案
- **GitHub**: 代码提交、版本管理
- **Context7**: 查询 Chrome API 文档

## 开发注意事项

1. **Manifest V3**: 使用 Service Worker 而非 Background Page
2. **存储选择**: 
   - `sync`: 用户设置（100KB 限制）
   - `local`: 备忘录数据（10MB 限制）
3. **权限最小化**: 只申请必要的权限
4. **磨砂玻璃效果**: 使用 `backdrop-filter: blur()`
5. **模块化**: 每个功能模块导出到 `window` 对象

## 版本发布

- 发布平台: Chrome Web Store
- 更新文档: `CHANGELOG.md`, `README.md`, `ROADMAP.md`

## 项目路线图（当前进度）

### 已完成
- [x] v1.0.0 - 基础时钟功能
- [x] v1.1.0 - 背景轮播、节假日
- [x] v1.2.0 - 天气功能
- [x] v1.3.0 - 设置面板、多语言
- [x] v1.4.0 - 备忘录功能
- [x] v1.5.0 - 每日任务管理
- [x] v1.5.1 - 任务分类筛选、计数统计、图片放大

### 规划中
- [ ] v1.6.0 - 任务提醒、重复任务、子任务
- [ ] v1.7.0 - 番茄钟、习惯追踪、标签系统
- [ ] v1.8.0 - 日历视图、数据统计
- [ ] v2.0.0 - 智能功能（建议、推荐）

---

**最后更新**: 2026-01-30
