const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/site-workspace-core.js');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function storageArea(initial = {}) {
  const data = clone(initial) || {};
  return {
    data,
    async get(key) {
      if (typeof key === 'string') return { [key]: clone(data[key]) };
      return clone(data);
    },
    async set(values) {
      Object.assign(data, clone(values));
    },
  };
}

function createChromeMock(options = {}) {
  const local = storageArea(options.local);
  const session = storageArea(options.session);
  const tabs = clone(options.tabs || []);
  const groups = clone(options.groups || []);
  let nextTabId = Math.max(0, ...tabs.map(tab => tab.id)) + 1;
  let nextGroupId = Math.max(0, ...groups.map(group => group.id)) + 1;
  const calls = [];

  const api = {
    calls,
    storage: { local, session },
    windows: { async getCurrent() { return { id: 7 }; } },
    tabs: {
      async get(tabId) {
        const tab = tabs.find(item => item.id === tabId);
        if (!tab) throw new Error('tab missing');
        return clone(tab);
      },
      async query(query) {
        return clone(tabs.filter(tab => {
          if (query.windowId !== undefined && tab.windowId !== query.windowId) return false;
          if (query.active !== undefined && tab.active !== query.active) return false;
          return true;
        }));
      },
      async create(props) {
        tabs.forEach(tab => { if (props.active && tab.windowId === props.windowId) tab.active = false; });
        const tab = { id: nextTabId++, windowId: props.windowId, url: props.url, title: props.url, active: Boolean(props.active), groupId: -1 };
        tabs.push(tab);
        calls.push(['create', clone(props)]);
        return clone(tab);
      },
      async update(tabId, props) {
        const tab = tabs.find(item => item.id === tabId);
        if (!tab) throw new Error('tab missing');
        if (props.active) tabs.forEach(item => { if (item.windowId === tab.windowId) item.active = false; });
        Object.assign(tab, props);
        calls.push(['update', tabId, clone(props)]);
        return clone(tab);
      },
      async remove(tabId) {
        const index = tabs.findIndex(item => item.id === tabId);
        if (index >= 0) tabs.splice(index, 1);
        calls.push(['remove', tabId]);
      },
      async group(props) {
        let groupId = props.groupId;
        if (groupId === undefined) {
          groupId = nextGroupId++;
          groups.push({ id: groupId, windowId: props.createProperties.windowId, title: '', color: 'grey' });
        }
        for (const tabId of props.tabIds) {
          const tab = tabs.find(item => item.id === tabId);
          if (tab) tab.groupId = groupId;
        }
        calls.push(['group', clone(props)]);
        return groupId;
      },
      async ungroup(tabIds) {
        for (const tabId of tabIds) {
          const tab = tabs.find(item => item.id === tabId);
          if (tab) tab.groupId = -1;
        }
        calls.push(['ungroup', clone(tabIds)]);
      },
    },
    tabGroups: {
      async query(query) {
        return clone(groups.filter(group => query.windowId === undefined || group.windowId === query.windowId));
      },
      async update(groupId, props) {
        const group = groups.find(item => item.id === groupId);
        Object.assign(group, props);
        calls.push(['update-group', groupId, clone(props)]);
        return clone(group);
      },
    },
    sidePanel: { async open(props) { calls.push(['open-panel', clone(props)]); } },
    _tabs: tabs,
    _groups: groups,
  };
  return api;
}

test('首次初始化预置学习、未分类和马士兵，已有空库不会被重新填充', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  const seeded = await service.loadConfig();
  assert.deepEqual(seeded.groups.map(group => group.name), ['学习', '未分类']);
  assert.equal(seeded.sites.length, 1);
  assert.equal(seeded.sites[0].startUrl, Core.MASHIBING_URL);

  chrome.storage.local.data[Core.CONFIG_KEY] = {
    version: 1,
    groups: [{ id: 'custom', name: '我的网站', order: 0 }],
    sites: [],
  };
  const existing = await service.loadConfig();
  assert.equal(existing.sites.length, 0);
  assert.ok(existing.groups.some(group => group.id === 'custom'));
  assert.ok(existing.groups.some(group => group.id === Core.UNCATEGORIZED_ID));
});

test('旧结构升级、URL 归一化和精确 URL 去重保持确定', async () => {
  const chrome = createChromeMock({ local: {
    [Core.CONFIG_KEY]: {
      version: 0,
      groups: [{ id: 'work', name: '工作' }],
      sites: [{ id: 'docs', groupId: 'work', name: '文档', url: 'example.com/docs' }],
    },
  } });
  const service = new Core.WorkspaceService(chrome);
  const config = await service.loadConfig();
  assert.equal(config.version, 2);
  assert.deepEqual(config.pages, []);
  assert.equal(config.sites[0].startUrl, 'https://example.com/docs');
  await assert.rejects(() => service.addSite({ name: '重复', startUrl: 'https://example.com/docs', groupId: 'work' }), /已存在/);
  const added = await service.addSite({ name: '同域不同页', startUrl: 'https://example.com/other', groupId: 'work' });
  assert.equal(added.sites.length, 2);
});

test('打开网站默认复用最近标签，显式新建始终创建并归入 Chrome 标签组', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  const first = await service.openSite('mashibing');
  assert.equal(first.reused, false);
  assert.equal(chrome._tabs.length, 1);
  assert.equal(chrome._groups[0].title, '网站 · 学习');

  const reused = await service.openSite('mashibing');
  assert.equal(reused.reused, true);
  assert.equal(chrome._tabs.length, 1);

  const second = await service.openSite('mashibing', { forceNew: true });
  assert.equal(second.reused, false);
  assert.equal(chrome._tabs.length, 2);
  assert.equal(chrome._tabs[0].groupId, chrome._tabs[1].groupId);
});

test('快链临时标签进入未分类且不会写入常用网站库', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  await service.openUrl('https://example.net/path');
  const config = await service.loadConfig();
  const snapshot = await service.getSnapshot();
  assert.equal(config.sites.some(site => site.startUrl.includes('example.net')), false);
  assert.equal(snapshot.tabs[0].workspaceGroupId, Core.UNCATEGORIZED_ID);
  assert.equal(snapshot.tabs[0].siteId, null);
});

test('标签可加入、移动、移出和关闭，普通标签始终不进入快照', async () => {
  const chrome = createChromeMock({ tabs: [
    { id: 10, windowId: 7, url: 'https://example.org/', title: '普通网页', active: true, groupId: -1 },
    { id: 11, windowId: 7, url: 'chrome://settings/', title: '设置', active: false, groupId: -1 },
  ] });
  const service = new Core.WorkspaceService(chrome);
  await service.adoptCurrentTab('learning');
  let snapshot = await service.getSnapshot();
  assert.deepEqual(snapshot.tabs.map(tab => tab.id), [10]);
  assert.equal(snapshot.config.pages.length, 1);

  await service.moveTabToGroup(10, Core.UNCATEGORIZED_ID);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs[0].workspaceGroupId, Core.UNCATEGORIZED_ID);

  await service.removeTab(10);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 0);
  assert.equal(snapshot.config.pages.length, 0);
  assert.equal(chrome._tabs.some(tab => tab.id === 10), true);

  chrome._tabs.find(tab => tab.id === 10).active = true;
  await service.adoptCurrentTab('learning');
  await service.closeTab(10);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.pages.length, 1);
  assert.equal(snapshot.tabs.length, 0);
  assert.equal(chrome._tabs.some(tab => tab.id === 10), false);
  assert.equal(chrome._tabs.some(tab => tab.id === 11), true);
});

test('快速加入会自动匹配已保存网站分组，未知网站进入未分类且不会重复建标签', async () => {
  const chrome = createChromeMock({ tabs: [
    { id: 21, windowId: 7, url: Core.MASHIBING_URL, title: '马士兵课程', active: true, groupId: -1 },
    { id: 22, windowId: 7, url: 'https://example.org/page', title: '临时网页', active: false, groupId: -1 },
  ] });
  const service = new Core.WorkspaceService(chrome);
  await service.adoptTab(21);
  await service.adoptTab(21);
  await service.adoptTab(22);
  const snapshot = await service.getSnapshot();
  const mashibing = snapshot.tabs.find(tab => tab.id === 21);
  const temporary = snapshot.tabs.find(tab => tab.id === 22);
  assert.equal(mashibing.workspaceGroupId, 'learning');
  assert.equal(mashibing.siteId, 'mashibing');
  assert.equal(temporary.workspaceGroupId, Core.UNCATEGORIZED_ID);
  assert.equal(chrome._tabs.length, 2);
});

test('删除分组将网站与已开标签迁移到未分类，删除网站不关闭标签', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  await service.openSite('mashibing', { forceNew: true });
  const tabId = chrome._tabs[0].id;
  const afterGroupDelete = await service.deleteGroup('learning');
  assert.equal(afterGroupDelete.sites[0].groupId, Core.UNCATEGORIZED_ID);
  let snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs[0].workspaceGroupId, Core.UNCATEGORIZED_ID);

  await service.deleteSite('mashibing');
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.sites.length, 0);
  assert.equal(snapshot.tabs[0].siteId, null);
  assert.equal(chrome._tabs.some(tab => tab.id === tabId), true);
});

test('扩展重载时可从确定性的 Chrome 标签组恢复受管标签', async () => {
  const chrome = createChromeMock({
    local: { [Core.CONFIG_KEY]: Core.defaultConfig() },
    tabs: [{ id: 31, windowId: 7, url: Core.MASHIBING_URL, title: '课程', active: true, groupId: 9 }],
    groups: [{ id: 9, windowId: 7, title: '网站 · 学习', color: 'green' }],
  });
  const service = new Core.WorkspaceService(chrome);
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 1);
  assert.equal(snapshot.tabs[0].siteId, 'mashibing');
  assert.equal(snapshot.tabs[0].workspaceGroupId, 'learning');
  assert.equal(snapshot.config.pages.length, 1);
  assert.equal(snapshot.tabs[0].pageId, snapshot.config.pages[0].id);
});

test('Chrome 删除整个标签组后页面和 App 分组仍保留，并可一键恢复', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  await service.openSite('mashibing', { forceNew: true });
  let snapshot = await service.getSnapshot();
  const pageId = snapshot.tabs[0].pageId;
  assert.equal(snapshot.config.pages.length, 1);

  chrome._tabs.splice(0, chrome._tabs.length);
  chrome._groups.splice(0, chrome._groups.length);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 0);
  assert.equal(snapshot.config.pages.length, 1);
  assert.equal(snapshot.config.pages[0].id, pageId);
  assert.ok(snapshot.config.groups.some(group => group.id === 'learning'));

  await service.openSavedPage(pageId);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 1);
  assert.equal(snapshot.tabs[0].pageId, pageId);
  assert.equal(chrome._groups[0].title, '网站 · 学习');
});

test('多窗口工作区不会互相清理绑定或循环新增页面', async () => {
  const config = Core.defaultConfig();
  const chrome = createChromeMock({
    local: { [Core.CONFIG_KEY]: config },
    tabs: [
      { id: 41, windowId: 7, url: Core.MASHIBING_URL, title: '窗口一课程', active: true, groupId: 11 },
      { id: 42, windowId: 8, url: 'https://example.org/course', title: '窗口二课程', active: true, groupId: 12 },
    ],
    groups: [
      { id: 11, windowId: 7, title: '网站 · 学习', color: 'green' },
      { id: 12, windowId: 8, title: '网站 · 未分类', color: 'grey' },
    ],
  });
  const service = new Core.WorkspaceService(chrome);
  let snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 2);
  assert.equal(snapshot.config.pages.length, 2);
  const firstPageIds = snapshot.config.pages.map(page => page.id).sort();

  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 2);
  assert.deepEqual(snapshot.config.pages.map(page => page.id).sort(), firstPageIds);
  const bindings = await service.loadBindings();
  assert.deepEqual(Object.keys(bindings.bindings).sort(), ['41', '42']);
});

test('历史异常产生的同分组同 URL 页面会自动合并', () => {
  const input = Core.defaultConfig();
  input.pages = [
    { id: 'p1', groupId: 'learning', url: 'https://example.com/course', title: '旧标题', lastOpenedAt: 1 },
    { id: 'p2', groupId: 'learning', url: 'https://example.com/course', title: '新标题', lastOpenedAt: 2 },
    { id: 'p3', groupId: Core.UNCATEGORIZED_ID, url: 'https://example.com/course', title: '另一分组', lastOpenedAt: 3 },
  ];
  const sanitized = Core.sanitizeConfig(input);
  assert.equal(sanitized.pages.length, 2);
  assert.equal(sanitized.pages.find(page => page.groupId === 'learning').title, '新标题');
});

test('App 分组配置被旧版本覆盖后可从仍打开的 Chrome 工作区组恢复', async () => {
  const damagedConfig = {
    version: 2,
    groups: [{ id: Core.UNCATEGORIZED_ID, name: '未分类', order: 0 }],
    sites: [],
    pages: [],
  };
  const chrome = createChromeMock({
    local: { [Core.CONFIG_KEY]: damagedConfig },
    tabs: [{ id: 51, windowId: 8, url: 'https://example.org/recovered', title: '恢复页面', active: true, groupId: 13 }],
    groups: [{ id: 13, windowId: 8, title: '网站 · 恢复分组', color: 'blue' }],
  });
  const service = new Core.WorkspaceService(chrome);
  const snapshot = await service.getSnapshot();
  const recoveredGroup = snapshot.config.groups.find(group => group.name === '恢复分组');
  assert.ok(recoveredGroup);
  assert.equal(snapshot.config.pages.length, 1);
  assert.equal(snapshot.config.pages[0].groupId, recoveredGroup.id);
  assert.equal(snapshot.tabs[0].pageId, snapshot.config.pages[0].id);
});

test('工作区页面别名独立于网站标题并在刷新后保留', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  await service.openSite('mashibing', { forceNew: true });
  let snapshot = await service.getSnapshot();
  const pageId = snapshot.tabs[0].pageId;
  await service.renamePage(pageId, '我的 AI 学习路线');
  chrome._tabs[0].title = '网站后来修改的标题';
  snapshot = await service.getSnapshot();
  const page = snapshot.config.pages.find(item => item.id === pageId);
  assert.equal(page.customTitle, '我的 AI 学习路线');
  assert.equal(page.title, '网站后来修改的标题');
});
