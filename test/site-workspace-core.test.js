const test = require('node:test');
const assert = require('node:assert/strict');

const Core = require('../js/site-workspace-core.js');

const { createChromeMock } = require('./fixtures/site-workspace-chrome.js');

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
  assert.equal(config.version, Core.VERSION);
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

test('打开分组复用已保存页面，去重网址并报告部分失败', async () => {
  const service = new Core.WorkspaceService({});
  const config = { groups:[{id:'g'}], pages:[{id:'p1',groupId:'g',siteId:'s1',url:'https://example.com/'},{id:'p2',groupId:'g',url:'https://example.com/'}], sites:[{id:'s1',groupId:'g',startUrl:'https://example.com/'},{id:'s2',groupId:'g',startUrl:'https://other.example/'}] };
  service.getSnapshot=async()=>({config});service.loadConfig=async()=>config;const calls=[];
  service.openSavedPage=async id=>{calls.push(id);return {reused:true};};service.openSite=async id=>{calls.push(id);throw new Error('失败');};
  const result=await service.openGroup('g');assert.deepEqual(calls,['p1','s2']);assert.equal(result.opened,1);assert.equal(result.failed,1);assert.equal(result.results[0].reused,true);
});
test('分组打开过程中已移走的入口不能被打开', async () => {
  const service=new Core.WorkspaceService({});const config={groups:[{id:'g'}],pages:[{id:'p',groupId:'g',url:'https://example.com/'}],sites:[]};
  service.getSnapshot=async()=>({config});service.loadConfig=async()=>({...config,pages:[{...config.pages[0],groupId:'other'}]});service.openSavedPage=async()=>assert.fail('不能打开已移动入口');
  assert.equal((await service.openGroup('g')).failed,1);
});

function workspaceFixture() {
  const chrome = createChromeMock({ tabs: [{ id: 100, windowId: 7, url: 'https://docs.example/start', title: '文档首页', groupId: -1, active: true }] });
  return { chrome, service: new Core.WorkspaceService(chrome) };
}
function childTab(chrome, id, url, extra = {}) {
  const parent = chrome._tabs.find(tab => tab.id === 100);
  const tab = { id, windowId: 7, url, title: `页面 ${id}`, groupId: parent.groupId, openerTabId: 100, ...extra };
  chrome._tabs.push(tab);
  return tab;
}

test('升级保留全部旧页面、别名和 URL，旧记录全部固定', async () => {
  const config = { ...Core.defaultConfig(), version: 2, pages: [
    { id: 'renamed', groupId: 'learning', url: 'https://docs.example/a', title: '原标题', customTitle: '会员项目文档' },
    { id: 'untitled', groupId: 'learning', url: 'https://docs.example/b', title: '旧页面' },
  ] };
  const chrome = createChromeMock({ local: { [Core.CONFIG_KEY]: config } });
  const snapshot = await new Core.WorkspaceService(chrome).getSnapshot();
  assert.equal(snapshot.config.pages.length, 2);
  assert.ok(snapshot.config.pages.every(page => page.pinned));
  assert.equal(snapshot.config.pages[0].customTitle, '会员项目文档');
  assert.equal(snapshot.config.pages[0].url, 'https://docs.example/a');
  assert.deepEqual(snapshot.config.recentClosed, []);
});

test('新标签使用真实 opener 关联；同域无 opener 仍来源未知', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const parent = (await service.getSnapshot()).config.pages[0];
  await service.renamePage(parent.id, '会员项目文档');
  childTab(chrome, 101, 'https://docs.example/api');
  childTab(chrome, 102, 'https://docs.example/unknown', { openerTabId: undefined });
  const snapshot = await service.getSnapshot();
  const child = snapshot.config.pages.find(page => page.url.endsWith('/api'));
  assert.equal(child.pinned, false);
  assert.equal(child.sourcePageId, parent.id);
  assert.equal(child.sourceTitle, '会员项目文档');
  assert.equal(Core.fixedAncestor(snapshot.config, child).id, parent.id);
  assert.equal(snapshot.config.pages.find(page => page.url.endsWith('/unknown')).sourcePageId, null);
});

test('先出现的子标签、跨域后代也能归到固定祖先；父页面关闭后关系保留', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const root = (await service.getSnapshot()).config.pages[0];
  childTab(chrome, 101, 'https://docs.example/api');
  childTab(chrome, 102, 'https://other.example/details', { openerTabId: 101 });
  chrome._tabs.reverse();
  let snapshot = await service.getSnapshot();
  const descendant = snapshot.config.pages.find(page => page.url.includes('other.example'));
  assert.equal(Core.fixedAncestor(snapshot.config, descendant).id, root.id);
  await service.closeTab(101);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.pages.find(page => page.id === descendant.id).sourcePageId, root.id);
  assert.equal(snapshot.config.recentClosed.length, 1);
});

test('固定入口同标签跳转不覆盖名称/地址；重新打开会恢复原地址', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const original = (await service.getSnapshot()).config.pages[0];
  await service.renamePage(original.id, '固定入口');
  Object.assign(chrome._tabs[0], { url: 'https://docs.example/next', title: '下一页' });
  let snapshot = await service.getSnapshot();
  const fixed = snapshot.config.pages.find(page => page.id === original.id);
  assert.equal(fixed.url, original.url);
  assert.equal(fixed.customTitle, '固定入口');
  assert.equal(fixed.title, '文档首页');
  assert.equal(snapshot.tabs[0].pageId === fixed.id, false);
  assert.equal(snapshot.config.pages.find(page => !page.pinned).sourcePageId, fixed.id);
  await service.openSavedPage(fixed.id);
  assert.equal(chrome.calls.filter(call => call[0] === 'create').at(-1)[1].url, original.url);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs.length, 2);
});

test('临时页面固定或重命名后保留；未固定页面关闭进入有界最近关闭', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  childTab(chrome, 101, 'https://docs.example/pin');
  childTab(chrome, 102, 'https://docs.example/rename');
  childTab(chrome, 103, 'https://docs.example/temp');
  let snapshot = await service.getSnapshot();
  await service.pinPage(snapshot.tabs.find(tab => tab.id === 101).pageId);
  await service.renamePage(snapshot.tabs.find(tab => tab.id === 102).pageId, '重要页面');
  for (const id of [101, 102, 103]) await service.closeTab(id);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.pages.length, 3);
  assert.ok(snapshot.config.pages.every(page => page.pinned));
  assert.equal(snapshot.config.recentClosed.length, 1);
  const recent = snapshot.config.recentClosed[0];
  await service.restoreRecent(recent.id);
  snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.recentClosed.length, 0);
  assert.equal(snapshot.config.pages.find(page => page.url === recent.url).pinned, false);
  assert.equal(snapshot.config.pages.find(page => page.url === recent.url).sourcePageId, recent.sourcePageId);
});

test('最近关闭最多 30 条、7 天；删除记录后不会复活', async () => {
  const config = Core.defaultConfig();
  config.recentClosed = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, url: `https://docs.example/${i}`, title: `记录${i}`, closedAt: Date.now() - i * 1000, groupId: 'learning' }));
  config.recentClosed.push({ id: 'expired', url: 'https://docs.example/expired', closedAt: Date.now() - 8 * 86400000 });
  const chrome = createChromeMock({ local: { [Core.CONFIG_KEY]: config } });
  const service = new Core.WorkspaceService(chrome);
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.recentClosed.length, 30);
  assert.equal(snapshot.config.recentClosed.some(page => page.id === 'expired'), false);
  await service.deletePage('r0');
  assert.equal((await service.getSnapshot()).config.recentClosed.some(page => page.id === 'r0'), false);
});

test('about:blank 中间页不入库，onCreated 的来源提示在父标签关闭后仍可用', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const parent = (await service.getSnapshot()).config.pages[0];
  const child = childTab(chrome, 101, 'about:blank', { groupId: -1 });
  await service.rememberOpener(child);
  await service.closeTab(100);
  await service.getSnapshot();
  delete child.openerTabId;
  Object.assign(child, { groupId: chrome._groups[0].id, url: 'https://docs.example/delayed' });
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.config.pages.length, 2);
  assert.equal(snapshot.config.pages.find(page => !page.pinned).sourcePageId, parent.id);
  for (const url of ['about:blank', 'chrome://settings/', 'file:///tmp/a', 'javascript:alert(1)']) assert.equal(Core.normalizeHttpUrl(url), null);
});

test('临时页面跨窗口恢复、移除不关闭标签且不写入最近关闭', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  childTab(chrome, 101, 'https://docs.example/temporary', { windowId: 8 });
  await service.getSnapshot();
  const second = new Core.WorkspaceService(chrome);
  let snapshot = await second.getSnapshot();
  assert.equal(snapshot.config.pages.filter(page => !page.pinned).length, 1);
  assert.equal((await second.loadBindings()).bindings['101'].windowId, 8);
  await second.removeTab(101);
  snapshot = await second.getSnapshot();
  assert.equal(snapshot.config.recentClosed.length, 0);
  assert.equal(chrome._tabs.some(tab => tab.id === 101), true);
});

test('并发快照、重命名和固定不丢失修改；稳定快照不重复写 session', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const pageId = (await service.getSnapshot()).config.pages[0].id;
  const second = new Core.WorkspaceService(chrome);
  await Promise.all([service.getSnapshot(), second.renamePage(pageId, '并发保存'), service.pinPage(pageId), second.getSnapshot()]);
  assert.equal((await service.getSnapshot()).config.pages[0].customTitle, '并发保存');
  let writes = 0;
  const set = chrome.storage.session.set;
  chrome.storage.session.set = async values => { writes++; await set(values); };
  await service.getSnapshot(); await second.getSnapshot();
  assert.equal(writes, 0);
});

test('批量打开分组仅恢复固定入口，不重开临时或最近关闭', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  childTab(chrome, 101, 'https://docs.example/temporary');
  childTab(chrome, 102, 'https://docs.example/closed');
  await service.getSnapshot(); await service.closeTab(102); await service.getSnapshot();
  const result = await service.openGroup('learning');
  assert.equal(result.opened, 2); // One fixed document and the preset site.
  assert.equal(chrome.calls.some(call => call[0] === 'create' && /temporary|closed/.test(call[1].url)), false);
});

test('同页多标签中一个临时标签跳转，不会改写另一个标签的记录', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  childTab(chrome, 101, 'https://docs.example/shared');
  childTab(chrome, 102, 'https://docs.example/shared');
  await service.getSnapshot();
  chrome._tabs.find(tab => tab.id === 101).url = 'https://docs.example/next';
  const snapshot = await service.getSnapshot();
  const a = snapshot.tabs.find(tab => tab.id === 101), b = snapshot.tabs.find(tab => tab.id === 102);
  assert.notEqual(a.pageId, b.pageId);
  assert.equal(snapshot.config.pages.find(page => page.id === b.pageId).url, 'https://docs.example/shared');
  assert.equal((await service.getSnapshot()).config.pages.length, 3);
});

test('最近关闭恢复精确 URL，不会误复用同网站其他路径', async () => {
  const chrome = createChromeMock();
  const service = new Core.WorkspaceService(chrome);
  await service.openSite('mashibing');
  chrome._tabs[0].url = 'https://www.mashibing.com/other';
  let snapshot = await service.getSnapshot();
  const config = snapshot.config;
  config.recentClosed.push({ id: 'restore-home', groupId: 'learning', url: Core.MASHIBING_URL, title: '课程首页', closedAt: Date.now() });
  await service.saveConfig(config);
  await service.restoreRecent('restore-home');
  assert.equal(chrome._tabs.length, 2);
  assert.equal(chrome._tabs.at(-1).url, Core.MASHIBING_URL);
  snapshot = await service.getSnapshot();
  const config2 = snapshot.config;
  config2.recentClosed.push({ id: 'same-url', groupId: 'learning', url: Core.MASHIBING_URL, title: '同地址', closedAt: Date.now() });
  await service.saveConfig(config2);
  const result = await service.restoreRecent('same-url');
  assert.equal(result.reused, true);
  assert.equal(chrome._tabs.length, 2);
});

test('临时页面跳回已有固定地址，保留原来的别名和身份', async () => {
  const { chrome, service } = workspaceFixture();
  await service.adoptTab(100, 'learning');
  const original = (await service.getSnapshot()).config.pages[0];
  await service.renamePage(original.id, '固定入口');
  chrome._tabs[0].url = 'https://docs.example/next';
  await service.getSnapshot();
  chrome._tabs[0].url = original.url;
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.tabs[0].pageId, original.id);
  assert.equal(snapshot.config.pages[0].customTitle, '固定入口');
  assert.equal(snapshot.config.pages.length, 1);
});
