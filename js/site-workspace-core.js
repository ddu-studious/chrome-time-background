(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteWorkspaceCore = api;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : null), function () {
  'use strict';

  const CONFIG_KEY = 'siteWorkspaceV1';
  const BINDINGS_KEY = 'siteWorkspaceTabBindingsV1';
  const VERSION = 2;
  const GROUP_TITLE_PREFIX = '网站 · ';
  const UNCATEGORIZED_ID = 'uncategorized';
  const MASHIBING_URL = 'https://www.mashibing.com/study?courseNo=2699&sectionNo=107317&systemId=167&courseVersionId=3600';
  const GROUP_COLORS = ['green', 'blue', 'purple', 'cyan', 'yellow', 'orange', 'pink', 'red', 'grey'];

  function now() {
    return Date.now();
  }

  function makeId(prefix) {
    return `${prefix}-${now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function safeId(value, fallback) {
    const id = typeof value === 'string' ? value.trim() : '';
    return /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(id) ? id : fallback;
  }

  function normalizeHttpUrl(rawUrl) {
    const raw = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!raw) return null;
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
      url.hash = '';
      return url.href;
    } catch {
      return null;
    }
  }

  function isManageableUrl(rawUrl) {
    return Boolean(normalizeHttpUrl(rawUrl));
  }

  function defaultConfig() {
    return {
      version: VERSION,
      groups: [
        { id: 'learning', name: '学习', order: 0 },
        { id: UNCATEGORIZED_ID, name: '未分类', order: 1 },
      ],
      sites: [
        {
          id: 'mashibing',
          groupId: 'learning',
          name: '马士兵课堂',
          startUrl: MASHIBING_URL,
          order: 0,
          createdAt: now(),
        },
      ],
      pages: [],
      updatedAt: now(),
    };
  }

  function sanitizeConfig(input) {
    const fallback = defaultConfig();
    if (!input || typeof input !== 'object') return fallback;

    const groups = [];
    const groupIds = new Set();
    const groupNames = new Set();
    const sourceGroups = Array.isArray(input.groups) ? input.groups : [];
    sourceGroups.forEach((item, index) => {
      const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 40) : '';
      if (!name) return;
      const nameKey = name.toLocaleLowerCase();
      if (groupNames.has(nameKey)) return;
      let id = safeId(item.id, `group-${index + 1}`);
      let suffix = 2;
      while (groupIds.has(id)) id = `group-${index + 1}-${suffix++}`;
      groupIds.add(id);
      groupNames.add(nameKey);
      groups.push({ id, name, order: Number.isFinite(item.order) ? item.order : index });
    });

    if (!groupIds.has(UNCATEGORIZED_ID)) {
      groups.push({ id: UNCATEGORIZED_ID, name: '未分类', order: groups.length });
      groupIds.add(UNCATEGORIZED_ID);
    }
    groups.sort((a, b) => a.order - b.order).forEach((group, index) => { group.order = index; });

    const sites = [];
    const siteIds = new Set();
    const urls = new Set();
    const sourceSites = Array.isArray(input.sites) ? input.sites : [];
    sourceSites.forEach((item, index) => {
      const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
      const startUrl = normalizeHttpUrl(item?.startUrl || item?.url);
      if (!name || !startUrl || urls.has(startUrl)) return;
      let id = safeId(item.id, `site-${index + 1}`);
      let suffix = 2;
      while (siteIds.has(id)) id = `site-${index + 1}-${suffix++}`;
      siteIds.add(id);
      urls.add(startUrl);
      sites.push({
        id,
        groupId: groupIds.has(item.groupId) ? item.groupId : UNCATEGORIZED_ID,
        name,
        startUrl,
        order: Number.isFinite(item.order) ? item.order : index,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now(),
      });
    });

    for (const group of groups) {
      sites.filter(site => site.groupId === group.id)
        .sort((a, b) => a.order - b.order)
        .forEach((site, index) => { site.order = index; });
    }

    const pages = [];
    const pageIds = new Set();
    const pageByKey = new Map();
    const sourcePages = Array.isArray(input.pages) ? input.pages : [];
    sourcePages.forEach((item, index) => {
      const url = normalizeHttpUrl(item?.url);
      if (!url) return;
      let id = safeId(item.id, `page-${index + 1}`);
      let suffix = 2;
      while (pageIds.has(id)) id = `page-${index + 1}-${suffix++}`;
      pageIds.add(id);
      const title = typeof item?.title === 'string' && item.title.trim()
        ? item.title.trim().slice(0, 200)
        : new URL(url).hostname;
      const groupId = groupIds.has(item.groupId) ? item.groupId : UNCATEGORIZED_ID;
      const siteId = siteIds.has(item.siteId) ? item.siteId : null;
      const pageKey = `${groupId}\n${url}`;
      const duplicate = pageByKey.get(pageKey);
      if (duplicate) {
        const candidateLastOpenedAt = Number.isFinite(item.lastOpenedAt) ? item.lastOpenedAt : 0;
        if (candidateLastOpenedAt >= duplicate.lastOpenedAt) {
          duplicate.title = title;
          if (typeof item.customTitle === 'string' && item.customTitle.trim()) {
            duplicate.customTitle = item.customTitle.trim().slice(0, 200);
          }
          duplicate.siteId = siteId || duplicate.siteId;
          duplicate.lastOpenedAt = candidateLastOpenedAt;
        }
        return;
      }
      const page = {
        id,
        groupId,
        siteId,
        url,
        title,
        customTitle: typeof item?.customTitle === 'string' && item.customTitle.trim()
          ? item.customTitle.trim().slice(0, 200)
          : '',
        order: Number.isFinite(item.order) ? item.order : index,
        createdAt: Number.isFinite(item.createdAt) ? item.createdAt : now(),
        lastOpenedAt: Number.isFinite(item.lastOpenedAt) ? item.lastOpenedAt : 0,
      };
      pages.push(page);
      pageByKey.set(pageKey, page);
    });

    for (const group of groups) {
      pages.filter(page => page.groupId === group.id)
        .sort((a, b) => a.order - b.order)
        .forEach((page, index) => { page.order = index; });
    }

    return {
      version: VERSION,
      groups,
      sites,
      pages,
      updatedAt: Number.isFinite(input.updatedAt) ? input.updatedAt : now(),
    };
  }

  function groupTitle(name) {
    return `${GROUP_TITLE_PREFIX}${String(name || '').trim()}`;
  }

  function groupNameFromTitle(title) {
    return typeof title === 'string' && title.startsWith(GROUP_TITLE_PREFIX)
      ? title.slice(GROUP_TITLE_PREFIX.length).trim()
      : null;
  }

  function groupColor(groupId) {
    let hash = 0;
    for (const char of String(groupId || '')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
  }

  function findSiteForUrl(config, rawUrl) {
    const normalized = normalizeHttpUrl(rawUrl);
    if (!normalized) return null;
    const exact = config.sites.find(site => site.startUrl === normalized);
    if (exact) return exact;
    const target = new URL(normalized);
    const candidates = config.sites.filter(site => {
      try { return new URL(site.startUrl).origin === target.origin; } catch { return false; }
    });
    candidates.sort((a, b) => b.startUrl.length - a.startUrl.length);
    return candidates[0] || null;
  }

  class WorkspaceService {
    constructor(chromeApi) {
      this.chrome = chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
      if (!this.chrome) throw new Error('Chrome API 不可用');
    }

    async loadConfig() {
      const stored = await this.chrome.storage.local.get(CONFIG_KEY);
      const existing = stored?.[CONFIG_KEY];
      const config = sanitizeConfig(existing);
      if (!existing || existing.version !== VERSION || JSON.stringify(existing) !== JSON.stringify(config)) {
        await this.chrome.storage.local.set({ [CONFIG_KEY]: config });
      }
      return config;
    }

    async saveConfig(config) {
      const saved = sanitizeConfig({ ...config, version: VERSION, updatedAt: now() });
      saved.updatedAt = now();
      await this.chrome.storage.local.set({ [CONFIG_KEY]: saved });
      return saved;
    }

    createPage(config, input) {
      const url = normalizeHttpUrl(input?.url);
      if (!url) throw new Error('页面网址无效');
      const groupId = config.groups.some(group => group.id === input?.groupId)
        ? input.groupId
        : UNCATEGORIZED_ID;
      const page = {
        id: makeId('page'),
        groupId,
        siteId: config.sites.some(site => site.id === input?.siteId) ? input.siteId : null,
        url,
        title: String(input?.title || new URL(url).hostname).trim().slice(0, 200),
        customTitle: '',
        order: config.pages.filter(item => item.groupId === groupId).length,
        createdAt: now(),
        lastOpenedAt: Number.isFinite(input?.lastOpenedAt) ? input.lastOpenedAt : now(),
      };
      config.pages.push(page);
      return page;
    }

    findReusablePage(config, input) {
      if (input?.pageId) {
        const byId = config.pages.find(page => page.id === input.pageId);
        if (byId) return byId;
      }
      const url = normalizeHttpUrl(input?.url);
      if (!url) return null;
      const candidates = config.pages.filter(page => page.groupId === input.groupId && page.url === url);
      candidates.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
      return candidates[0] || null;
    }

    async loadBindings() {
      const area = this.chrome.storage.session || this.chrome.storage.local;
      const stored = await area.get(BINDINGS_KEY);
      const value = stored?.[BINDINGS_KEY];
      return value && typeof value === 'object' && value.bindings && typeof value.bindings === 'object'
        ? { version: VERSION, bindings: { ...value.bindings } }
        : { version: VERSION, bindings: {} };
    }

    async saveBindings(value) {
      const area = this.chrome.storage.session || this.chrome.storage.local;
      const saved = { version: VERSION, bindings: { ...(value?.bindings || {}) } };
      await area.set({ [BINDINGS_KEY]: saved });
      return saved;
    }

    async addGroup(name) {
      const config = await this.loadConfig();
      const normalizedName = String(name || '').trim().slice(0, 40);
      if (!normalizedName) throw new Error('请输入分组名称');
      if (config.groups.some(group => group.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
        throw new Error('分组名称已存在');
      }
      config.groups.push({ id: makeId('group'), name: normalizedName, order: config.groups.length });
      return this.saveConfig(config);
    }

    async renameGroup(groupId, name) {
      const config = await this.loadConfig();
      const group = config.groups.find(item => item.id === groupId);
      if (!group) throw new Error('分组不存在');
      if (groupId === UNCATEGORIZED_ID) throw new Error('“未分类”分组不能重命名');
      const normalizedName = String(name || '').trim().slice(0, 40);
      if (!normalizedName) throw new Error('请输入分组名称');
      if (config.groups.some(item => item.id !== groupId && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
        throw new Error('分组名称已存在');
      }
      const oldTitle = groupTitle(group.name);
      group.name = normalizedName;
      const saved = await this.saveConfig(config);
      const chromeGroups = await this.chrome.tabGroups.query({});
      await Promise.all(chromeGroups.filter(item => item.title === oldTitle).map(item => this.chrome.tabGroups.update(item.id, {
        title: groupTitle(normalizedName),
        color: groupColor(groupId),
      })));
      return saved;
    }

    async moveGroup(groupId, direction) {
      const config = await this.loadConfig();
      const groups = config.groups.slice().sort((a, b) => a.order - b.order);
      const index = groups.findIndex(group => group.id === groupId);
      const target = index + (direction < 0 ? -1 : 1);
      if (index < 0 || target < 0 || target >= groups.length) return config;
      [groups[index], groups[target]] = [groups[target], groups[index]];
      groups.forEach((group, order) => { group.order = order; });
      config.groups = groups;
      return this.saveConfig(config);
    }

    async deleteGroup(groupId) {
      if (groupId === UNCATEGORIZED_ID) throw new Error('“未分类”分组不能删除');
      const snapshot = await this.getSnapshot();
      const config = snapshot.config;
      const group = config.groups.find(item => item.id === groupId);
      const fallback = config.groups.find(item => item.id === UNCATEGORIZED_ID);
      if (!group || !fallback) throw new Error('分组不存在');
      const tabs = snapshot.tabs.filter(tab => tab.workspaceGroupId === groupId);
      config.sites.forEach(site => { if (site.groupId === groupId) site.groupId = UNCATEGORIZED_ID; });
      config.pages.forEach(page => { if (page.groupId === groupId) page.groupId = UNCATEGORIZED_ID; });
      config.groups = config.groups.filter(item => item.id !== groupId);
      const saved = await this.saveConfig(config);
      for (const tab of tabs) await this.moveTabToGroup(tab.id, UNCATEGORIZED_ID, saved);
      return saved;
    }

    async addSite(input) {
      const config = await this.loadConfig();
      const name = String(input?.name || '').trim().slice(0, 80);
      const startUrl = normalizeHttpUrl(input?.startUrl);
      if (!name) throw new Error('请输入网站名称');
      if (!startUrl) throw new Error('请输入有效的 HTTP 或 HTTPS 网址');
      if (config.sites.some(site => site.startUrl === startUrl)) throw new Error('该网址已存在');
      const groupId = config.groups.some(group => group.id === input?.groupId) ? input.groupId : UNCATEGORIZED_ID;
      config.sites.push({
        id: makeId('site'), groupId, name, startUrl,
        order: config.sites.filter(site => site.groupId === groupId).length,
        createdAt: now(),
      });
      return this.saveConfig(config);
    }

    async updateSite(siteId, input) {
      const config = await this.loadConfig();
      const site = config.sites.find(item => item.id === siteId);
      if (!site) throw new Error('网站不存在');
      const name = String(input?.name || '').trim().slice(0, 80);
      const startUrl = normalizeHttpUrl(input?.startUrl);
      if (!name) throw new Error('请输入网站名称');
      if (!startUrl) throw new Error('请输入有效的 HTTP 或 HTTPS 网址');
      if (config.sites.some(item => item.id !== siteId && item.startUrl === startUrl)) throw new Error('该网址已存在');
      const groupId = config.groups.some(group => group.id === input?.groupId) ? input.groupId : UNCATEGORIZED_ID;
      Object.assign(site, { name, startUrl, groupId });
      return this.saveConfig(config);
    }

    async deleteSite(siteId) {
      const config = await this.loadConfig();
      config.sites = config.sites.filter(site => site.id !== siteId);
      config.pages.forEach(page => { if (page.siteId === siteId) page.siteId = null; });
      const saved = await this.saveConfig(config);
      const bindings = await this.loadBindings();
      Object.values(bindings.bindings).forEach(binding => {
        if (binding.siteId === siteId) binding.siteId = null;
      });
      await this.saveBindings(bindings);
      return saved;
    }

    async deletePage(pageId) {
      const config = await this.loadConfig();
      config.pages = config.pages.filter(page => page.id !== pageId);
      const saved = await this.saveConfig(config);
      const bindings = await this.loadBindings();
      Object.keys(bindings.bindings).forEach(tabId => {
        if (bindings.bindings[tabId].pageId === pageId) delete bindings.bindings[tabId];
      });
      await this.saveBindings(bindings);
      return saved;
    }

    async renamePage(pageId, customTitle) {
      const config = await this.loadConfig();
      const page = config.pages.find(item => item.id === pageId);
      if (!page) throw new Error('工作区页面不存在');
      const name = String(customTitle || '').trim().slice(0, 200);
      if (!name) throw new Error('请输入页面名称');
      page.customTitle = name;
      return this.saveConfig(config);
    }

    async movePageToGroup(pageId, groupId) {
      const config = await this.loadConfig();
      const page = config.pages.find(item => item.id === pageId);
      const group = config.groups.find(item => item.id === groupId)
        || config.groups.find(item => item.id === UNCATEGORIZED_ID);
      if (!page || !group) throw new Error('页面或分组不存在');
      page.groupId = group.id;
      const saved = await this.saveConfig(config);
      const bindings = await this.loadBindings();
      const liveEntry = Object.entries(bindings.bindings).find(([, binding]) => binding.pageId === pageId);
      if (liveEntry) {
        const tabId = Number(liveEntry[0]);
        await this.moveTabToGroup(tabId, group.id, saved, pageId).catch(() => {});
      }
      return saved;
    }

    async moveSite(siteId, direction) {
      const config = await this.loadConfig();
      const site = config.sites.find(item => item.id === siteId);
      if (!site) return config;
      const sites = config.sites.filter(item => item.groupId === site.groupId).sort((a, b) => a.order - b.order);
      const index = sites.findIndex(item => item.id === siteId);
      const target = index + (direction < 0 ? -1 : 1);
      if (target < 0 || target >= sites.length) return config;
      [sites[index], sites[target]] = [sites[target], sites[index]];
      sites.forEach((item, order) => { item.order = order; });
      return this.saveConfig(config);
    }

    async getCurrentWindowId() {
      const windowInfo = await this.chrome.windows.getCurrent();
      if (!Number.isInteger(windowInfo?.id)) throw new Error('无法确定当前窗口');
      return windowInfo.id;
    }

    async listWorkspaceChromeGroups(windowId) {
      const groups = await this.chrome.tabGroups.query(Number.isInteger(windowId) ? { windowId } : {});
      return groups.filter(group => groupNameFromTitle(group.title));
    }

    async ensureChromeGroup(tabId, workspaceGroup, windowId) {
      const title = groupTitle(workspaceGroup.name);
      const groups = await this.chrome.tabGroups.query({ windowId });
      const existing = groups.find(group => group.title === title);
      const chromeGroupId = existing
        ? await this.chrome.tabs.group({ groupId: existing.id, tabIds: [tabId] })
        : await this.chrome.tabs.group({ createProperties: { windowId }, tabIds: [tabId] });
      await this.chrome.tabGroups.update(chromeGroupId, {
        title,
        color: groupColor(workspaceGroup.id),
        collapsed: false,
      });
      return chromeGroupId;
    }

    async getSnapshot() {
      let config = await this.loadConfig();
      const windowId = await this.getCurrentWindowId();
      const [tabs, chromeGroups, bindingState] = await Promise.all([
        this.chrome.tabs.query({}),
        this.listWorkspaceChromeGroups(),
        this.loadBindings(),
      ]);
      const groupByChromeId = new Map();
      let configChanged = false;
      for (const chromeGroup of chromeGroups) {
        const name = groupNameFromTitle(chromeGroup.title);
        let workspaceGroup = config.groups.find(group => group.name === name);
        if (!workspaceGroup && name) {
          workspaceGroup = { id: makeId('group'), name: name.slice(0, 40), order: config.groups.length };
          config.groups.push(workspaceGroup);
          configChanged = true;
        }
        if (workspaceGroup) groupByChromeId.set(chromeGroup.id, workspaceGroup);
      }

      const liveTabIds = new Set(tabs.map(tab => String(tab.id)));
      Object.keys(bindingState.bindings).forEach(tabId => {
        if (!liveTabIds.has(tabId)) delete bindingState.bindings[tabId];
      });

      const managedTabs = [];
      for (const tab of tabs) {
        const workspaceGroup = groupByChromeId.get(tab.groupId);
        if (!workspaceGroup) {
          delete bindingState.bindings[String(tab.id)];
          continue;
        }
        const key = String(tab.id);
        const current = bindingState.bindings[key] || {};
        const matchedSite = current.siteId
          ? config.sites.find(site => site.id === current.siteId)
          : findSiteForUrl(config, tab.url);
        let page = current.pageId ? config.pages.find(item => item.id === current.pageId) : null;
        if (!page) page = this.findReusablePage(config, { groupId: workspaceGroup.id, url: tab.url });
        if (!page) {
          page = this.createPage(config, {
            groupId: workspaceGroup.id,
            siteId: matchedSite?.id || null,
            url: tab.url,
            title: tab.title,
            lastOpenedAt: Number.isFinite(current.lastActivatedAt) ? current.lastActivatedAt : now(),
          });
          configChanged = true;
        } else {
          const normalizedUrl = normalizeHttpUrl(tab.url);
          const title = String(tab.title || page.title).trim().slice(0, 200);
          const siteId = matchedSite?.id || page.siteId || null;
          if (page.groupId !== workspaceGroup.id || page.url !== normalizedUrl || page.title !== title || page.siteId !== siteId) {
            Object.assign(page, { groupId: workspaceGroup.id, url: normalizedUrl, title, siteId });
            configChanged = true;
          }
        }
        const binding = {
          pageId: page.id,
          siteId: matchedSite?.id || null,
          groupId: workspaceGroup.id,
          windowId,
          lastActivatedAt: Number.isFinite(current.lastActivatedAt) ? current.lastActivatedAt : 0,
        };
        bindingState.bindings[key] = binding;
        managedTabs.push({
          ...tab,
          workspaceGroupId: workspaceGroup.id,
          pageId: page.id,
          siteId: binding.siteId,
          lastActivatedAt: binding.lastActivatedAt,
        });
      }
      await this.saveBindings(bindingState);
      if (configChanged) config = await this.saveConfig(config);
      return { config, windowId, tabs: managedTabs, chromeGroups };
    }

    async openSite(siteId, options = {}) {
      const config = await this.loadConfig();
      const site = config.sites.find(item => item.id === siteId);
      if (!site) throw new Error('网站不存在');
      return this.openUrl(site.startUrl, { ...options, siteId: site.id, groupId: site.groupId });
    }

    async openUrl(rawUrl, options = {}) {
      const url = normalizeHttpUrl(rawUrl);
      if (!url) throw new Error('网址无效');
      const snapshot = await this.getSnapshot();
      const matchedSite = options.siteId
        ? snapshot.config.sites.find(site => site.id === options.siteId)
        : snapshot.config.sites.find(site => site.startUrl === url);
      const siteId = matchedSite?.id || null;
      const groupId = options.groupId || matchedSite?.groupId || UNCATEGORIZED_ID;
      const workspaceGroup = snapshot.config.groups.find(group => group.id === groupId)
        || snapshot.config.groups.find(group => group.id === UNCATEGORIZED_ID);

      if (!options.forceNew && siteId) {
        const candidates = snapshot.tabs.filter(tab => tab.siteId === siteId);
        candidates.sort((a, b) => b.lastActivatedAt - a.lastActivatedAt);
        if (candidates[0]) {
          await this.activateTab(candidates[0].id);
          return { tab: candidates[0], reused: true };
        }
      }

      const tab = await this.chrome.tabs.create({ url, active: true, windowId: snapshot.windowId });
      await this.ensureChromeGroup(tab.id, workspaceGroup, snapshot.windowId);
      const config = await this.loadConfig();
      let page = options.pageId ? config.pages.find(item => item.id === options.pageId) : null;
      if (page) {
        Object.assign(page, { groupId: workspaceGroup.id, siteId, url, lastOpenedAt: now() });
      } else {
        page = this.createPage(config, {
          groupId: workspaceGroup.id,
          siteId,
          url,
          title: matchedSite?.name || tab.title,
          lastOpenedAt: now(),
        });
      }
      await this.saveConfig(config);
      const bindings = await this.loadBindings();
      bindings.bindings[String(tab.id)] = {
        pageId: page.id,
        siteId,
        groupId: workspaceGroup.id,
        windowId: snapshot.windowId,
        lastActivatedAt: now(),
      };
      await this.saveBindings(bindings);
      return { tab, page, reused: false };
    }

    async openSavedPage(pageId) {
      const snapshot = await this.getSnapshot();
      const liveTab = snapshot.tabs.find(tab => tab.pageId === pageId);
      if (liveTab) {
        await this.activateTab(liveTab.id);
        return { tab: liveTab, page: snapshot.config.pages.find(page => page.id === pageId), reused: true };
      }
      const page = snapshot.config.pages.find(item => item.id === pageId);
      if (!page) throw new Error('工作区页面不存在');
      return this.openUrl(page.url, {
        pageId: page.id,
        siteId: page.siteId,
        groupId: page.groupId,
        forceNew: true,
      });
    }

    async activateTab(tabId) {
      const tab = await this.chrome.tabs.update(tabId, { active: true });
      const bindings = await this.loadBindings();
      const binding = bindings.bindings[String(tabId)];
      if (binding) {
        binding.lastActivatedAt = now();
        await this.saveBindings(bindings);
      }
      return tab;
    }

    async adoptCurrentTab(groupId) {
      const windowId = await this.getCurrentWindowId();
      const [tab] = await this.chrome.tabs.query({ active: true, windowId });
      if (!tab) throw new Error('没有可加入的当前标签');
      return this.adoptTab(tab.id, groupId);
    }

    async adoptTab(tabId, groupId) {
      const config = await this.loadConfig();
      const tab = await this.chrome.tabs.get(tabId);
      if (!tab || !isManageableUrl(tab.url)) throw new Error('当前标签不是可加入的 HTTP 或 HTTPS 页面');
      const matchedSite = findSiteForUrl(config, tab.url);
      const resolvedGroupId = groupId || matchedSite?.groupId || UNCATEGORIZED_ID;
      const group = config.groups.find(item => item.id === resolvedGroupId)
        || config.groups.find(item => item.id === UNCATEGORIZED_ID);
      const windowId = tab.windowId;
      await this.ensureChromeGroup(tab.id, group, windowId);
      const bindings = await this.loadBindings();
      const current = bindings.bindings[String(tab.id)] || {};
      let page = current.pageId ? config.pages.find(item => item.id === current.pageId) : null;
      if (!page) page = this.findReusablePage(config, { groupId: group.id, url: tab.url });
      if (!page) {
        page = this.createPage(config, {
          groupId: group.id,
          siteId: matchedSite?.id || null,
          url: tab.url,
          title: tab.title,
          lastOpenedAt: now(),
        });
      } else {
        Object.assign(page, {
          groupId: group.id,
          siteId: matchedSite?.id || page.siteId || null,
          url: normalizeHttpUrl(tab.url),
          title: String(tab.title || page.title).trim().slice(0, 200),
          lastOpenedAt: now(),
        });
      }
      await this.saveConfig(config);
      bindings.bindings[String(tab.id)] = {
        pageId: page.id,
        siteId: matchedSite?.id || null,
        groupId: group.id,
        windowId,
        lastActivatedAt: now(),
      };
      await this.saveBindings(bindings);
      return tab;
    }

    async moveTabToGroup(tabId, groupId, suppliedConfig, suppliedPageId) {
      const config = suppliedConfig || await this.loadConfig();
      const group = config.groups.find(item => item.id === groupId)
        || config.groups.find(item => item.id === UNCATEGORIZED_ID);
      const tab = await this.chrome.tabs.get(tabId);
      const windowId = tab.windowId;
      await this.ensureChromeGroup(tabId, group, windowId);
      const bindings = await this.loadBindings();
      const binding = bindings.bindings[String(tabId)] || { pageId: suppliedPageId || null, siteId: null, windowId, lastActivatedAt: now() };
      binding.groupId = group.id;
      bindings.bindings[String(tabId)] = binding;
      await this.saveBindings(bindings);
      const pageId = suppliedPageId || binding.pageId;
      const page = pageId ? config.pages.find(item => item.id === pageId) : null;
      if (page && page.groupId !== group.id) {
        page.groupId = group.id;
        await this.saveConfig(config);
      }
    }

    async removeTab(tabId) {
      const bindings = await this.loadBindings();
      const pageId = bindings.bindings[String(tabId)]?.pageId;
      await this.chrome.tabs.ungroup([tabId]);
      delete bindings.bindings[String(tabId)];
      await this.saveBindings(bindings);
      if (pageId) {
        const config = await this.loadConfig();
        config.pages = config.pages.filter(page => page.id !== pageId);
        await this.saveConfig(config);
      }
    }

    async closeTab(tabId) {
      const bindings = await this.loadBindings();
      await this.chrome.tabs.remove(tabId);
      delete bindings.bindings[String(tabId)];
      await this.saveBindings(bindings);
    }

    async openPanel() {
      const windowId = await this.getCurrentWindowId();
      await this.chrome.sidePanel.open({ windowId });
    }
  }

  return {
    WorkspaceService,
    CONFIG_KEY,
    BINDINGS_KEY,
    VERSION,
    GROUP_TITLE_PREFIX,
    UNCATEGORIZED_ID,
    MASHIBING_URL,
    defaultConfig,
    sanitizeConfig,
    normalizeHttpUrl,
    isManageableUrl,
    groupTitle,
    groupNameFromTitle,
    findSiteForUrl,
  };
});
