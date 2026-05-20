# Dock 管理系统设计文档 v1

## 1. 背景与动机

当前 Dock 采用硬编码方式在 `index.html` 中排列所有应用按钮，随着功能模块增多（极简模式、扩展监控、常用信息、哔哩哔哩、计划管理、工作日志、写作空间、贪吃蛇、俄罗斯方块、Agent 矩阵、设置、任务面板），Dock 变得拥挤且不可定制。

需要一个类似 macOS Dock 的管理系统，让用户能够：
- 自由选择哪些应用显示在 Dock 上
- 通过拖拽调整 Dock 中应用的顺序
- 将应用从 Dock 移除或添加回来
- 创建分组文件夹，将多个应用归类
- 通过 Launchpad 查看所有可用应用

## 2. 竞品调研

### 2.1 macOS Dock
- **核心特性**：拖拽排序、移入/移出动画（弹出+消失烟雾效果）、Stacks（文件夹堆叠）、Launchpad（全屏应用网格）、分隔线区分固定区/最近使用区
- **交互模式**：长按触发编辑模式、拖拽到 Dock 外触发移除、拖拽一个图标到另一个上创建文件夹
- **持久化**：配置存储在 `com.apple.dock.plist`

### 2.2 iOS SpringBoard
- **核心特性**：Dock 固定 4 个图标、抖动编辑模式、文件夹 3x3 网格预览、拖拽合并创建文件夹
- **交互模式**：长按进入编辑、拖拽排序、叠放创建文件夹

### 2.3 Web 实现参考
- **Dockbar (CatsJuice/dockbar)**：Web Component 实现，支持放大效果、方向配置
- **React OSX Dock (lukehorvat/react-osx-dock)**：CSS Grid + Flexbox，GPU 加速动画
- **Dockish**：macOS 原生增强，支持拖拽排序、iPhone 风格文件夹

### 2.4 设计决策
采用 macOS Dock + iOS SpringBoard 混合模式：
- Dock 底部固定，支持拖拽排序
- Launchpad 弹出层显示所有应用
- 拖拽合并创建分组
- Chrome Storage API 持久化配置

## 3. 功能设计

### 3.1 应用注册表（App Registry）

所有可用应用统一注册，每个应用定义如下：

```javascript
{
  id: 'snake-game',        // 唯一标识
  name: '贪吃蛇',          // 显示名称
  icon: 'fas fa-gamepad',  // FontAwesome 图标类
  category: 'games',       // 分类: tools | media | productivity | games | system
  dockBtnId: 'snake-dock-btn',  // 对应 DOM 按钮 ID
  panelId: 'snake-game-panel',  // 对应面板 ID（可选）
  defaultInDock: true,      // 默认是否在 Dock 中
  defaultOrder: 7,          // 默认排序位置
  isSystem: false,          // 系统级应用不可移除
}
```

### 3.2 完整应用列表

| ID | 名称 | 图标 | 分类 | 系统级 | 默认在 Dock |
|---|---|---|---|---|---|
| zen-mode | 极简模式 | fa-eye-slash | system | 是 | 是 |
| sys-monitor | 扩展监控 | fa-heartbeat | system | 是 | 是 |
| knowledge | 常用信息 | fa-brain | tools | 否 | 是 |
| bilibili | 哔哩哔哩 | fa-bilibili | media | 否 | 是 |
| schedule | 计划管理 | fa-calendar-check | productivity | 否 | 是 |
| worklog | 工作日志 | fa-clipboard-list | productivity | 否 | 是 |
| blog | 写作空间 | fa-pen-nib | productivity | 否 | 是 |
| snake-game | 贪吃蛇 | fa-gamepad | games | 否 | 是 |
| tetris-game | 俄罗斯方块 | fa-th | games | 否 | 是 |
| agent | Agent 矩阵 | fa-robot | tools | 否 | 是 |
| settings | 设置 | fa-cog | system | 是 | 是 |
| memo | 任务面板 | fa-tasks | productivity | 否 | 是 |

### 3.3 Dock 行为

#### 3.3.1 拖拽排序
- Dock 中的应用图标支持拖拽重新排列
- 拖拽时显示半透明预览，插入位置显示蓝色指示线
- 使用 HTML5 Drag & Drop API
- 拖拽结束自动保存顺序

#### 3.3.2 移入/移出
- 从 Launchpad 拖拽应用到 Dock 区域 → 添加到 Dock
- 从 Dock 向上拖出 → 移除出 Dock（带 poof 消失动画）
- 系统级应用（`isSystem: true`）不可移除

#### 3.3.3 分组文件夹
- 将一个 Dock 图标拖到另一个上方并停留 500ms → 创建分组
- 分组图标显示 2x2 缩略网格预览
- 点击分组弹出扇形或网格展开视图
- 分组内可拖拽排序、拖出解散
- 分组可自定义名称

### 3.4 Launchpad（应用启动台）

#### 3.4.1 入口
- Dock 最右侧增加一个 Launchpad 按钮（网格图标）
- 快捷键 `Ctrl/⌘ + L` 打开

#### 3.4.2 布局
- 全屏半透明毛玻璃遮罩
- 应用按分类展示，每行 4-6 个图标
- 分类标题：系统工具 / 生产力 / 媒体 / 游戏
- 已在 Dock 中的应用带角标标识
- 未在 Dock 中的应用可点击直接启动，或拖到底部 Dock 区域添加

#### 3.4.3 搜索
- 顶部搜索框，支持按名称模糊搜索应用

### 3.5 持久化

使用 `chrome.storage.local` 存储配置：

```javascript
{
  dockConfig: {
    version: 1,
    items: [
      { type: 'app', appId: 'zen-mode' },
      { type: 'app', appId: 'sys-monitor' },
      { type: 'divider' },
      { type: 'group', name: '游戏', children: ['snake-game', 'tetris-game'] },
      { type: 'app', appId: 'agent' },
      { type: 'app', appId: 'settings' },
      { type: 'app', appId: 'memo' },
    ],
    hiddenApps: [],
    lastModified: 1716100000000
  }
}
```

## 4. 技术方案

### 4.1 架构

```
DockManager (核心控制器)
├── AppRegistry          - 应用注册表，管理所有可用应用的元数据
├── DockRenderer         - Dock 渲染引擎，根据 dockConfig 生成 DOM
├── DragController       - 拖拽控制器，处理排序/移入/移出/分组创建
├── LaunchpadUI          - Launchpad 弹出层 UI
├── GroupManager         - 分组管理，创建/展开/解散/重命名
└── StorageAdapter       - 持久化适配器 (chrome.storage.local)
```

### 4.2 关键 API

```javascript
class DockManager {
  constructor(containerEl)

  // 初始化：注册应用 → 加载配置 → 渲染
  async init()

  // 应用注册
  registerApp(appDef)
  getApp(appId)
  getAllApps()

  // Dock 操作
  addToDock(appId, position?)
  removeFromDock(appId)
  reorderDock(fromIndex, toIndex)
  getDockItems()

  // 分组
  createGroup(name, appIds)
  addToGroup(groupId, appId)
  removeFromGroup(groupId, appId)
  renameGroup(groupId, newName)
  dissolveGroup(groupId)

  // Launchpad
  showLaunchpad()
  hideLaunchpad()

  // 持久化
  async saveConfig()
  async loadConfig()
  resetToDefault()
}
```

### 4.3 拖拽实现

使用原生 HTML5 Drag & Drop：
- `dragstart`: 记录拖拽源、添加视觉反馈
- `dragover`: 计算插入位置、显示指示线
- `drop`: 执行排序/添加/分组逻辑
- `dragend`: 清理状态

分组创建判定：
- `dragover` 时检测是否悬停在另一个 Dock 按钮上超过 500ms
- 是 → 高亮目标按钮，`drop` 时创建分组
- 否 → 正常排序

### 4.4 动画

- 添加到 Dock: `scale(0) → scale(1.2) → scale(1)` + `opacity` 过渡
- 移出 Dock: `scale(1) → scale(0.5)` + `opacity(0)` + 上移 poof 效果
- 分组展开: CSS Grid + `transform` 扇形展开
- Launchpad 进入: `backdrop-filter: blur(20px)` + 网格淡入缩放

### 4.5 兼容性

- 保持与现有 Dock 按钮 ID 的完全向后兼容
- 现有功能模块（贪吃蛇、俄罗斯方块等）通过 `dockBtnId` 映射到新系统
- 无配置时使用默认布局（等同于当前硬编码顺序）

## 5. 文件结构

```
js/dock-manager.js     - DockManager 核心逻辑
css/dock-manager.css   - Dock 管理系统样式
```

## 6. 实现优先级

### P0 - MVP（本次实现）
- [x] AppRegistry 应用注册表
- [x] 配置持久化（chrome.storage.local）
- [x] Dock 动态渲染（根据配置生成）
- [x] 拖拽排序
- [x] Launchpad 弹出层（查看所有应用）
- [x] 从 Launchpad 添加/移除 Dock 应用

### P1 - 增强
- [ ] 分组文件夹功能
- [ ] 分组拖拽合并创建
- [ ] 分组展开动画
- [ ] macOS 风格放大效果

### P2 - 优化
- [ ] Dock 移出 poof 动画
- [ ] 应用搜索
- [ ] 快捷键支持
- [ ] 右键上下文菜单
