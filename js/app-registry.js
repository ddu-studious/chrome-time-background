(function () {
  'use strict';

  const apps = [
    { id: 'zen-mode', name: '极简模式', summary: '隐藏干扰，只保留时间与背景', icon: 'fas fa-eye-slash', category: 'system', dockBtnId: 'zen-mode-btn', isSystem: true, defaultOrder: 0 },
    { id: 'sys-monitor', name: '扩展监控', summary: '查看扩展运行状态与异常', icon: 'fas fa-heartbeat', category: 'system', dockBtnId: 'sys-monitor-toggle', isSystem: true, defaultOrder: 1 },
    { id: 'knowledge', name: '常用信息', summary: '收藏、检索和复习常用知识', icon: 'fas fa-brain', category: 'tools', dockBtnId: 'kw-dock-btn', defaultOrder: 2, defaultInDock: true },
    { id: 'bilibili', name: '哔哩哔哩', summary: '视频、音频与稍后观看工作区', icon: 'fab fa-bilibili', category: 'media', dockBtnId: 'bili-dock-btn', defaultOrder: 3 },
    { id: 'youtube', name: 'YouTube', summary: '订阅推荐、跨圈层兴趣趋势与本地学习清单', icon: 'fab fa-youtube', category: 'media', dockBtnId: 'youtube-dock-btn', defaultOrder: 3.2 },
    { id: 'schedule', name: '计划管理', summary: '安排日程、课程和专注时间', icon: 'fas fa-calendar-check', category: 'productivity', dockBtnId: 'schedule-dock-btn', defaultOrder: 4, defaultInDock: true },
    { id: 'worklog', name: '工作日志', summary: '记录进展并生成工作复盘', icon: 'fas fa-clipboard-list', category: 'productivity', dockBtnId: 'worklog-dock-btn', defaultOrder: 5, defaultInDock: true },
    { id: 'blog', name: '写作空间', summary: '沉浸写作、整理和发布内容', icon: 'fas fa-pen-nib', category: 'productivity', dockBtnId: 'blog-dock-btn', defaultOrder: 6 },
    { id: 'quick-nav', name: '快捷导航', summary: '集中访问常用网站与工具', icon: 'fas fa-compass', category: 'tools', dockBtnId: 'quick-nav-dock-btn', defaultOrder: 6.5, defaultInDock: true },
    { id: 'site-workspace', name: '网站工作区', summary: '分组管理常用网站与真实 Chrome 标签', icon: 'fas fa-layer-group', category: 'tools', dockBtnId: 'site-workspace-dock-btn', defaultOrder: 6.6, defaultInDock: true },
    { id: 'games-hub', name: '休闲游戏', summary: '统一进入贪吃蛇、俄罗斯方块与立体方块', icon: 'fas fa-gamepad', category: 'games', dockBtnId: 'games-hub-dock-btn', defaultOrder: 6.8 },
    { id: 'snake-game', name: '贪吃蛇', summary: '轻量键盘休闲游戏', icon: 'fas fa-gamepad', category: 'games', dockBtnId: 'snake-dock-btn', defaultOrder: 7 },
    { id: 'tetris-game', name: '俄罗斯方块', summary: '经典方块消除与得分挑战', icon: 'fas fa-th', category: 'games', dockBtnId: 'tetris-dock-btn', defaultOrder: 8 },
    { id: 'tetris-3d-game', name: '立体方块', summary: '带空间效果的方块挑战', icon: 'fas fa-cube', category: 'games', dockBtnId: 'tetris-3d-dock-btn', panelId: 'tetris-3d-game-panel', defaultOrder: 8.5 },
    { id: 'music', name: '网易云音乐', summary: '播放队列、歌单、歌词与私人 FM', icon: 'fas fa-music', category: 'media', dockBtnId: 'music-dock-btn', defaultOrder: 8.6, defaultInDock: true },
    { id: 'reading', name: '今日阅读', summary: '阅读收藏内容并记录进度', icon: 'fas fa-book-reader', category: 'media', dockBtnId: 'reading-dock-btn', defaultOrder: 8.7 },
    { id: 'poetry', name: '诗词电台', summary: '每日诗词与沉浸朗读', icon: 'fas fa-feather-alt', category: 'media', dockBtnId: 'poetry-dock-btn', defaultOrder: 8.8 },
    { id: 'agent', name: 'Agent 矩阵', summary: '连接并管理桌面智能体', icon: 'fas fa-robot', category: 'ai', dockBtnId: 'agent-dock-btn', defaultOrder: 9, hasIndicator: true, defaultInDock: true },
    { id: 'chatbot', name: 'AI 对话', summary: '多模型对话与上下文协作', icon: 'fas fa-terminal', category: 'ai', dockBtnId: 'chatbot-dock-btn', defaultOrder: 9.2 },
    { id: 'prompt-manager', name: 'Prompt 管理', summary: '管理模板、变量与常用提示词', icon: 'fas fa-magic', category: 'ai', dockBtnId: 'prompt-mgr-dock-btn', defaultOrder: 9.5 },
    { id: 'settings', name: '设置', summary: '外观、首页、数据和集成设置', icon: 'fas fa-cog', category: 'system', dockBtnId: 'settings-dock-btn', isSystem: true, defaultOrder: 10 },
    { id: 'memo', name: '任务面板', summary: '任务、看板、日历与统计', icon: 'fas fa-tasks', category: 'productivity', dockBtnId: 'memo-toggle-btn', defaultOrder: 11, defaultInDock: true },
  ];

  const categories = {
    productivity: { name: '今日与创作', icon: 'fas fa-briefcase', order: 0 },
    ai: { name: 'AI', icon: 'fas fa-sparkles', order: 1 },
    tools: { name: '效率工具', icon: 'fas fa-wrench', order: 2 },
    media: { name: '媒体', icon: 'fas fa-play-circle', order: 3 },
    games: { name: '休闲', icon: 'fas fa-gamepad', order: 4 },
    system: { name: '系统', icon: 'fas fa-cog', order: 5 },
  };

  window.ProductAppRegistry = Object.freeze({
    apps: Object.freeze(apps.map(app => Object.freeze(app))),
    categories: Object.freeze(categories),
  });
})();
