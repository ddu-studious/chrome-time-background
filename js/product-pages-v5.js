/**
 * Product UI v5 implementation contract.
 *
 * The generated design matrix contains 19 businesses and 121 pages.  Keeping
 * the contract in executable code prevents a polished representative screen
 * from being mistaken for a complete business page group.
 */
(function exposeProductPagesV5(global) {
  'use strict';

  const groups = [
    ['shell', '产品外壳', ['home:默认首页', 'today-overview:今日概览', 'personalize:个性化首页', 'focus:专注模式', 'offline:离线状态']],
    ['music', '网易云音乐', ['now-playing:正在播放', 'queue:播放队列', 'playlist-library:歌单库', 'playlist-detail:歌单详情', 'lyrics-immersive:沉浸歌词', 'search:音乐搜索', 'discover-fm:发现与私人FM', 'artist-album:歌手与专辑', 'connection-error:连接异常', 'more-sleep-timer:更多与睡眠定时']],
    ['knowledge', '常用信息', ['card-wall:卡片墙', 'search-filter:搜索筛选', 'detail-inspector:详情检查器', 'create-edit:新建与编辑', 'timeline:时间线', 'graph-dashboard:图谱与仪表盘']],
    ['bilibili', 'B站', ['recommend:推荐', 'player:播放器', 'course:课程', 'library:收藏库', 'history-ranking:历史与排行', 'search:搜索', 'login-error:登录异常']],
    ['youtube', 'YouTube', ['connect:连接', 'recommended:为你推荐', 'trending:兴趣趋势', 'player:播放器', 'subscriptions:订阅', 'library:资料库', 'local-queue:本地清单', 'search:搜索', 'error:异常恢复']],
    ['schedule', '计划管理', ['day-view:日视图', 'week-view:周视图', 'create-edit:新建与编辑', 'routines:例行计划', 'conflict:冲突处理', 'completed-day:完成日']],
    ['worklog', '工作日志', ['daily-list:每日列表', 'active-timer:活动计时', 'manual-entry:手动记录', 'quadrant:四象限', 'weekly-report:周报', 'projects:项目']],
    ['writing', '写作空间', ['library:文稿库', 'editor:编辑器', 'preview:预览', 'ai-assistant:AI助手', 'knowledge-citation:知识引用', 'version-history:版本历史', 'sync-error:同步异常']],
    ['tasks', '任务', ['list:列表', 'kanban:看板', 'calendar:日历', 'analytics:分析', 'detail:详情', 'create:新建', 'recurring-habits:周期习惯', 'search-empty:搜索空状态']],
    ['quick-nav', '快捷导航', ['default:默认导航', 'command-search:命令搜索', 'create-edit:新建与编辑', 'import-empty:导入与空状态']],
    ['reading', '今日阅读', ['review-queue:复习队列', 'detail:阅读详情', 'permission:权限提示', 'complete-feedback:完成反馈', 'history-stats:历史统计']],
    ['poetry', '诗词电台', ['mini-player:迷你播放器', 'full-text:全文', 'annotation:注释赏析', 'favorites:收藏', 'voice-settings:语音设置']],
    ['agent', 'Agent矩阵', ['overview:总览', 'active:运行中', 'create:创建Agent', 'flow-canvas:流程画布', 'run-logs:运行日志', 'collaboration:协作', 'connection-error:连接异常']],
    ['ai-chat', 'AI对话', ['default:默认对话', 'code-answer:代码回答', 'multi-agent:多Agent协作', 'config-drawer:配置抽屉', 'history:历史会话', 'error-recovery:错误恢复']],
    ['prompt-manager', 'Prompt管理', ['role-editor:角色编辑', 'live-preview:实时预览', 'version-diff:版本对比', 'save-version:保存版本', 'import-export:导入导出', 'offline-error:离线异常']],
    ['games', '游戏', ['launcher:游戏启动器', 'snake:贪吃蛇', 'tetris:俄罗斯方块', 'voxel:立体方块', 'pause-gameover:暂停与结束', 'settings-help:设置与帮助']],
    ['launchpad', '应用启动台', ['all-apps:全部应用', 'category:分类', 'search:搜索', 'pin-order:固定与排序', 'dock-menu:Dock菜单']],
    ['ticker', '热榜资讯', ['compact:紧凑栏', 'expanded:展开列表', 'sources:数据源', 'keywords:关键词', 'detail-favorite:详情与收藏', 'loading-error:加载异常']],
    ['settings', '设置', ['appearance:外观', 'homepage:首页', 'dock:Dock', 'data-privacy:数据与隐私', 'integrations:集成', 'shortcuts:快捷键', 'about-diagnostics:关于与诊断']],
  ].map(([id, name, entries]) => Object.freeze({
    id,
    name,
    pages: Object.freeze(entries.map((entry, index) => {
      const separator = entry.indexOf(':');
      return Object.freeze({
        id: entry.slice(0, separator),
        name: entry.slice(separator + 1),
        order: index + 1,
        key: `${id}/${entry.slice(0, separator)}`,
      });
    })),
  }));

  const pages = groups.flatMap(group => group.pages.map(page => Object.freeze({
    ...page,
    businessId: group.id,
    businessName: group.name,
  })));
  const pageMap = new Map(pages.map(page => [page.key, page]));

  global.ProductPagesV5 = Object.freeze({
    groups: Object.freeze(groups),
    pages: Object.freeze(pages),
    totalBusinesses: groups.length,
    totalPages: pages.length,
    get(key) { return pageMap.get(key) || null; },
    list(businessId) { return pages.filter(page => page.businessId === businessId); },
  });
})(window);
