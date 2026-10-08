(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkspaceChromeFixture = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
'use strict';
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

return { createChromeMock };
});
