# MCP 命令快捷方式

## 常用 MCP 工具

```json
{
    "cursor.commands": {
        "browser": "@cursor-ide-browser",
        "thinking": "@sequential-thinking",
        "git": "@github",
        "docs": "@Context7"
    }
}
```

## 使用示例

### 浏览器测试 (@cursor-ide-browser)

```
# 测试扩展功能
@browser 打开新标签页测试时钟显示
@browser 测试备忘录添加和编辑功能
@browser 验证天气信息是否正确显示

# 验证 UI
@browser 测试背景图片切换
@browser 验证磨砂玻璃效果
@browser 检查多语言切换

# 调试
@browser 打开开发者工具查看控制台日志
```

### 复杂问题分析 (@sequential-thinking)

```
# 功能设计
@thinking 设计每日任务管理功能的实现方案
@thinking 分析任务提醒系统的架构

# 问题排查
@thinking 分析备忘录保存失败的可能原因
@thinking 排查天气数据不更新的问题

# 方案对比
@thinking 对比 storage.sync 和 storage.local 的使用场景
@thinking 评估不同的通知策略
```

### Git 操作 (@github)

```
# 版本管理
@git 查看当前修改状态
@git 提交当前更改

# 发布相关
@git 创建新版本标签 v1.5.0
@git 查看版本提交历史
```

### Chrome API 文档 (@Context7)

```
# 查询 API
@docs 查询 chrome.storage API 的使用方法
@docs 查询 chrome.alarms API 的定时任务
@docs 查询 chrome.notifications API 的通知格式

# 最佳实践
@docs Chrome 扩展存储最佳实践
@docs Manifest V3 权限配置
```

## 中国风景时钟专用命令

### 调试命令

```bash
# 查看扩展日志
# 新标签页: 右键 -> 检查 -> Console
# Background: chrome://extensions/ -> 详情 -> 检查视图

# 重新加载扩展
# chrome://extensions/ -> 点击扩展卡片刷新按钮
```

### 常用 Chrome URLs

```
chrome://extensions/     # 扩展管理页面
chrome://newtab/         # 新标签页（被扩展覆盖）
chrome://settings/       # Chrome 设置
```

## 自动触发场景

AI 会根据上下文自动选择合适的 MCP 工具：

| 场景 | 自动使用工具 |
|------|-------------|
| 需要测试 UI 交互 | Browser |
| 复杂问题、多步骤分析 | Sequential Thinking |
| 版本管理、代码提交 | GitHub |
| 查询 Chrome API | Context7 |

## 项目特定查询示例

### 备忘录功能相关

```
@thinking 如何优化备忘录的存储结构
@thinking 分析每日任务的重复逻辑
@thinking 设计任务提醒的触发机制
```

### UI/UX 相关

```
@browser 测试备忘录面板的拖拽功能
@browser 验证任务完成动画效果
@thinking 分析磨砂玻璃效果的性能影响
```

### 性能优化

```
@thinking 分析大量任务时的渲染性能
@thinking 评估存储数据的清理策略
@thinking 优化 Service Worker 的启动时间
```

## 组合使用示例

### 新增每日任务功能

```
# 1. 查询 API
@docs chrome.alarms 定时任务使用方法

# 2. 分析实现方案
@thinking 设计每日任务的数据结构和提醒逻辑

# 3. 实现后测试
@browser 测试新功能是否正常工作

# 4. 提交代码
@git 提交新增每日任务功能
```

### 修复 Bug

```
# 1. 分析问题
@thinking 分析任务保存失败的可能原因

# 2. 查询文档
@docs chrome.storage 错误处理

# 3. 验证修复
@browser 测试修复后的保存功能

# 4. 提交修复
@git 提交 Bug 修复
```

### 版本发布

```
# 1. 功能验证
@browser 全面测试所有功能

# 2. 更新版本
# 手动更新 manifest.json、CHANGELOG.md、README.md

# 3. 提交发布
@git 创建版本标签并提交
```

## 快捷命令总结

| 命令 | 用途 | 示例 |
|------|------|------|
| `@browser` | 浏览器测试 | `@browser 测试备忘录功能` |
| `@thinking` | 复杂问题分析 | `@thinking 设计任务提醒方案` |
| `@git` | Git 操作 | `@git 提交代码` |
| `@docs` | 查询文档 | `@docs chrome.alarms API` |

---

**最后更新**: 2026-01-30
