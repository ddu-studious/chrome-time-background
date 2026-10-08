/* Isolated preview only. All Chrome APIs are doubles; no real tabs or storage are used. */
(function () {
  const config = SiteWorkspaceCore.defaultConfig();
  config.groups = [{ id: 'work', name: '会员项目', order: 0 }, { id: 'learning', name: 'Java 学习', order: 1 }];
  config.sites = [];
  config.pages = [
    { id: 'docs', groupId: 'work', url: 'https://docs.example/start', title: '会员研发知识库', customTitle: '会员项目文档', pinned: true },
    { id: 'board', groupId: 'work', url: 'https://tasks.example/board', title: '迭代看板', customTitle: '本周需求看板', pinned: true },
    { id: 'java', groupId: 'learning', url: 'https://learn.example/java', title: 'Java 进阶课程', customTitle: '我的 Java 学习路线', pinned: true },
  ];
  config.recentClosed = [{ id: 'recent', groupId: 'work', url: 'https://docs.example/last', title: '上周讨论记录', closedAt: Date.now(), sourcePageId: 'docs', sourceTitle: '会员项目文档' }];
  window.chrome = WorkspaceChromeFixture.createChromeMock({ local: { [SiteWorkspaceCore.CONFIG_KEY]: config },
    tabs: [
      { id: 1, windowId: 7, groupId: 1, url: 'https://docs.example/start', title: '会员研发知识库' },
      { id: 2, windowId: 7, groupId: 1, url: 'https://docs.example/api', title: '接口说明：会员权益查询', openerTabId: 1, active: true },
      { id: 3, windowId: 7, groupId: 1, url: 'https://docs.example/requirements', title: '本周需求与验收清单', openerTabId: 1 },
      { id: 4, windowId: 7, groupId: 1, url: 'https://other.example/read', title: '临时查阅的技术文章' },
    ], groups: [{ id: 1, windowId: 7, title: '网站 · 会员项目' }] });
  const event = { addListener() {} };
  for (const name of ['onCreated', 'onUpdated', 'onRemoved', 'onActivated', 'onMoved', 'onAttached', 'onDetached']) chrome.tabs[name] = event;
  chrome.tabGroups.onUpdated = chrome.tabGroups.onRemoved = chrome.storage.onChanged = event;
  chrome.runtime = { getURL: () => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', async getContexts() { return []; } };
  window.SceneAI = { async control() { return { policy: { modelEnabled: false, disabledScenes: [] } }; }, async run() { throw new Error('预览不调用模型'); } };
})();
