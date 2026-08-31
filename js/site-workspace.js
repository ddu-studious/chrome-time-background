(function () {
  'use strict';

  const Core = window.SiteWorkspaceCore;
  if (!Core) throw new Error('SiteWorkspaceCore must load before site-workspace.js');

  class SiteWorkspaceController {
    constructor() {
      this.service = new Core.WorkspaceService(chrome);
      this.snapshot = null;
      this.renderTimer = null;
      this.panelPort = null;
      this.panelHeartbeat = null;
      this.panelWindowId = null;
    }

    async init() {
      this.bindPanelLifecycle();
      this.bindStaticActions();
      this.bindChromeEvents();
      await this.render();
    }

    bindPanelLifecycle() {
      const disconnect = () => {
        clearInterval(this.panelHeartbeat);
        this.panelHeartbeat = null;
        if (this.panelPort) {
          try { this.panelPort.disconnect(); } catch { /* already disconnected */ }
          this.panelPort = null;
        }
      };
      const connect = async () => {
        disconnect();
        if (document.hidden) return;
        try {
          const contexts = await chrome.runtime.getContexts({
            contextTypes: ['SIDE_PANEL'],
            documentUrls: [location.href],
          });
          if (!contexts.length || document.hidden) return;
          const currentWindow = await chrome.windows.getCurrent();
          if (!Number.isInteger(currentWindow?.id)) return;
          this.panelWindowId = currentWindow.id;
          const port = chrome.runtime.connect({ name: 'site-workspace-visible-panel' });
          this.panelPort = port;
          const announce = () => port.postMessage({ type: 'site-workspace-panel-visible', windowId: this.panelWindowId });
          announce();
          this.panelHeartbeat = setInterval(announce, 20000);
          port.onDisconnect.addListener(() => {
            if (this.panelPort !== port) return;
            this.panelPort = null;
            clearInterval(this.panelHeartbeat);
            this.panelHeartbeat = null;
            if (!document.hidden) setTimeout(connect, 200);
          });
        } catch { /* regular-tab preview or extension reload */ }
      };
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) disconnect();
        else connect();
      });
      window.addEventListener('pagehide', disconnect);
      connect();
    }

    bindStaticActions() {
      document.getElementById('sw-refresh').addEventListener('click', () => this.render('已刷新'));
      document.getElementById('sw-add-site').addEventListener('click', () => this.openSiteDialog());
      document.getElementById('sw-add-group').addEventListener('click', () => this.openGroupDialog());
      document.getElementById('sw-adopt-tab').addEventListener('click', () => this.run(async () => {
        const groupId = document.getElementById('sw-adopt-group').value;
        await this.service.adoptCurrentTab(groupId);
        await this.render('已将当前标签加入工作区');
      }));

      document.querySelectorAll('[data-close-dialog]').forEach(button => {
        button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close());
      });
      document.getElementById('sw-site-form').addEventListener('submit', event => this.saveSite(event));
      document.getElementById('sw-group-form').addEventListener('submit', event => this.saveGroup(event));
      document.getElementById('sw-page-form').addEventListener('submit', event => this.savePageName(event));
      document.getElementById('sw-groups').addEventListener('click', event => this.handleGroupClick(event));
      document.getElementById('sw-groups').addEventListener('change', event => this.handleGroupChange(event));
    }

    bindChromeEvents() {
      const schedule = () => this.scheduleRender();
      chrome.tabs.onCreated.addListener(schedule);
      chrome.tabs.onUpdated.addListener(schedule);
      chrome.tabs.onRemoved.addListener(schedule);
      chrome.tabs.onActivated.addListener(schedule);
      chrome.tabs.onMoved.addListener(schedule);
      chrome.tabs.onAttached.addListener(schedule);
      chrome.tabs.onDetached.addListener(schedule);
      chrome.tabGroups.onUpdated.addListener(schedule);
      chrome.tabGroups.onRemoved.addListener(schedule);
      chrome.storage.onChanged.addListener((changes, area) => {
        if ((area === 'local' && changes[Core.CONFIG_KEY]) || (area === 'session' && changes[Core.BINDINGS_KEY])) schedule();
      });
    }

    scheduleRender() {
      clearTimeout(this.renderTimer);
      this.renderTimer = setTimeout(() => this.render(), 100);
    }

    async run(action) {
      try {
        this.setStatus('处理中…');
        await action();
      } catch (error) {
        this.setStatus(error?.message || '操作失败', true);
      }
    }

    setStatus(message, isError = false) {
      const status = document.getElementById('sw-status');
      status.textContent = message || '';
      status.classList.toggle('is-error', isError);
    }

    async render(message) {
      try {
        this.snapshot = await this.service.getSnapshot();
        this.renderGroupOptions();
        this.renderGroups();
        if (message) this.setStatus(message);
        else if (document.getElementById('sw-status').textContent === '处理中…') this.setStatus('');
      } catch (error) {
        this.setStatus(error?.message || '工作区加载失败', true);
      }
    }

    renderGroupOptions() {
      const groups = this.snapshot.config.groups.slice().sort((a, b) => a.order - b.order);
      const html = groups.map(group => `<option value="${this.escape(group.id)}">${this.escape(group.name)}</option>`).join('');
      const adopt = document.getElementById('sw-adopt-group');
      const current = adopt.value;
      adopt.innerHTML = html;
      if (groups.some(group => group.id === current)) adopt.value = current;
      document.getElementById('sw-site-group').innerHTML = html;
    }

    renderGroups() {
      const root = document.getElementById('sw-groups');
      const config = this.snapshot.config;
      const groups = config.groups.slice().sort((a, b) => a.order - b.order);
      root.innerHTML = groups.map((group, groupIndex) => {
        const sites = config.sites.filter(site => site.groupId === group.id).sort((a, b) => a.order - b.order);
        const tabs = this.snapshot.tabs.filter(tab => tab.workspaceGroupId === group.id);
        const pages = config.pages.filter(page => page.groupId === group.id).sort((a, b) => a.order - b.order);
        const liveByPageId = new Map(tabs.map(tab => [tab.pageId, tab]));
        const openCount = pages.filter(page => liveByPageId.has(page.id)).length;
        return `
          <article class="sw-group" data-group-id="${this.escape(group.id)}">
            <header class="sw-group-header">
              <div class="sw-group-heading">
                <strong>${this.escape(group.name)}</strong>
                <small>${sites.length} 个网站 · ${pages.length} 个页面</small>
              </div>
              <div class="sw-group-actions">
                <button class="sw-action" data-action="move-group-up" title="上移分组" ${groupIndex === 0 ? 'disabled' : ''}>↑</button>
                <button class="sw-action" data-action="move-group-down" title="下移分组" ${groupIndex === groups.length - 1 ? 'disabled' : ''}>↓</button>
                <button class="sw-action" data-action="edit-group" title="编辑分组" ${group.id === Core.UNCATEGORIZED_ID ? 'disabled' : ''}>✎</button>
                <button class="sw-action is-danger" data-action="delete-group" title="删除分组" ${group.id === Core.UNCATEGORIZED_ID ? 'disabled' : ''}>×</button>
              </div>
            </header>
            <div class="sw-section-label"><span>常用网站</span><span>${sites.length}</span></div>
            <div class="sw-list">${sites.length ? sites.map((site, index) => this.renderSite(site, index, sites.length)).join('') : '<div class="sw-empty">此分组还没有常用网站</div>'}</div>
            <div class="sw-section-label"><span>工作区页面</span><span>${openCount} 打开 · ${pages.length - openCount} 已关闭</span></div>
            <div class="sw-list">${pages.length ? pages.map(page => this.renderPage(page, liveByPageId.get(page.id), groups)).join('') : '<div class="sw-empty">暂无工作区页面</div>'}</div>
          </article>`;
      }).join('');
    }

    renderSite(site, index, count) {
      const host = this.hostname(site.startUrl);
      return `
        <div class="sw-site" data-site-id="${this.escape(site.id)}">
          <button class="sw-site-open" data-action="open-site" title="打开或切换到 ${this.escape(site.name)}">
            ${this.favicon(site.startUrl, site.name)}
            <span class="sw-copy"><strong>${this.escape(site.name)}</strong><small>${this.escape(host)}</small></span>
          </button>
          <div class="sw-row-actions">
            <button class="sw-action" data-action="new-site-tab" title="新建标签">＋</button>
            <button class="sw-action" data-action="move-site-up" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button class="sw-action" data-action="move-site-down" title="下移" ${index === count - 1 ? 'disabled' : ''}>↓</button>
            <button class="sw-action" data-action="edit-site" title="编辑">✎</button>
            <button class="sw-action is-danger" data-action="delete-site" title="删除入口">×</button>
          </div>
        </div>`;
    }

    renderPage(page, tab, groups) {
      const title = page.customTitle || tab?.title || page.title || this.hostname(page.url) || '未命名页面';
      const url = tab?.url || page.url;
      const groupOptions = groups.map(group => `<option value="${this.escape(group.id)}" ${group.id === page.groupId ? 'selected' : ''}>${this.escape(group.name)}</option>`).join('');
      return `
        <div class="sw-tab${tab?.active ? ' is-active' : ''}${tab ? '' : ' is-closed'}" data-page-id="${this.escape(page.id)}"${tab ? ` data-tab-id="${tab.id}"` : ''}>
          <button class="sw-tab-open" data-action="open-page" title="${tab ? '切换到' : '重新打开'} ${this.escape(title)}">
            ${this.favicon(url, title)}
            <span class="sw-copy"><strong>${this.escape(title)}</strong><small>${tab ? (this.escape(this.hostname(url)) + (tab.audible ? ' · 正在播放' : ' · 已打开')) : ('已关闭 · ' + this.escape(this.hostname(url)))}</small></span>
          </button>
          <div class="sw-row-actions">
            <select class="sw-tab-group-select" data-action="move-page" aria-label="移动页面分组">${groupOptions}</select>
            <button class="sw-action" data-action="edit-page" title="重命名工作区页面">✎</button>
            ${tab ? '<button class="sw-action" data-action="remove-page" title="从工作区移除并保留标签">↗</button><button class="sw-action is-danger" data-action="close-tab" title="关闭 Chrome 标签，页面仍保留">×</button>' : '<button class="sw-action" data-action="open-page" title="重新打开">↗</button><button class="sw-action is-danger" data-action="delete-page" title="从工作区删除">×</button>'}
          </div>
        </div>`;
    }

    async handleGroupClick(event) {
      const button = event.target.closest('[data-action]');
      if (!button || button.disabled) return;
      const groupEl = button.closest('[data-group-id]');
      const siteEl = button.closest('[data-site-id]');
      const tabEl = button.closest('[data-tab-id]');
      const pageEl = button.closest('[data-page-id]');
      const groupId = groupEl?.dataset.groupId;
      const siteId = siteEl?.dataset.siteId;
      const tabId = Number(tabEl?.dataset.tabId);
      const pageId = pageEl?.dataset.pageId;
      const action = button.dataset.action;

      await this.run(async () => {
        if (action === 'open-site') await this.service.openSite(siteId);
        else if (action === 'new-site-tab') await this.service.openSite(siteId, { forceNew: true });
        else if (action === 'open-page') await this.service.openSavedPage(pageId);
        else if (action === 'remove-page') await this.service.removeTab(tabId);
        else if (action === 'close-tab') await this.service.closeTab(tabId);
        else if (action === 'delete-page') await this.service.deletePage(pageId);
        else if (action === 'edit-page') { this.openPageDialog(pageId); return; }
        else if (action === 'move-site-up') await this.service.moveSite(siteId, -1);
        else if (action === 'move-site-down') await this.service.moveSite(siteId, 1);
        else if (action === 'move-group-up') await this.service.moveGroup(groupId, -1);
        else if (action === 'move-group-down') await this.service.moveGroup(groupId, 1);
        else if (action === 'edit-site') { this.openSiteDialog(siteId); return; }
        else if (action === 'edit-group') { this.openGroupDialog(groupId); return; }
        else if (action === 'delete-site') {
          const site = this.snapshot.config.sites.find(item => item.id === siteId);
          if (!confirm(`删除“${site?.name || '该网站'}”入口？已打开标签不会关闭。`)) return;
          await this.service.deleteSite(siteId);
        } else if (action === 'delete-group') {
          const group = this.snapshot.config.groups.find(item => item.id === groupId);
          if (!confirm(`删除“${group?.name || '该分组'}”？其中网站和标签将移到“未分类”。`)) return;
          await this.service.deleteGroup(groupId);
        }
        await this.render();
      });
    }

    async handleGroupChange(event) {
      const select = event.target.closest('[data-action="move-page"]');
      if (!select) return;
      const pageId = select.closest('[data-page-id]')?.dataset.pageId;
      await this.run(async () => {
        await this.service.movePageToGroup(pageId, select.value);
        await this.render('页面已移动');
      });
    }

    openSiteDialog(siteId) {
      const site = siteId ? this.snapshot.config.sites.find(item => item.id === siteId) : null;
      document.getElementById('sw-site-dialog-title').textContent = site ? '编辑网站' : '添加网站';
      document.getElementById('sw-site-id').value = site?.id || '';
      document.getElementById('sw-site-name').value = site?.name || '';
      document.getElementById('sw-site-url').value = site?.startUrl || '';
      document.getElementById('sw-site-group').value = site?.groupId || this.snapshot.config.groups[0]?.id || Core.UNCATEGORIZED_ID;
      document.getElementById('sw-site-error').textContent = '';
      document.getElementById('sw-site-dialog').showModal();
      document.getElementById('sw-site-name').focus();
    }

    async saveSite(event) {
      event.preventDefault();
      const id = document.getElementById('sw-site-id').value;
      const input = {
        name: document.getElementById('sw-site-name').value,
        startUrl: document.getElementById('sw-site-url').value,
        groupId: document.getElementById('sw-site-group').value,
      };
      try {
        if (id) await this.service.updateSite(id, input);
        else await this.service.addSite(input);
        document.getElementById('sw-site-dialog').close();
        await this.render(id ? '网站已更新' : '网站已添加');
      } catch (error) {
        document.getElementById('sw-site-error').textContent = error?.message || '保存失败';
      }
    }

    openGroupDialog(groupId) {
      const group = groupId ? this.snapshot.config.groups.find(item => item.id === groupId) : null;
      document.getElementById('sw-group-dialog-title').textContent = group ? '编辑分组' : '新建分组';
      document.getElementById('sw-group-id').value = group?.id || '';
      document.getElementById('sw-group-name').value = group?.name || '';
      document.getElementById('sw-group-error').textContent = '';
      document.getElementById('sw-group-dialog').showModal();
      document.getElementById('sw-group-name').focus();
    }

    async saveGroup(event) {
      event.preventDefault();
      const id = document.getElementById('sw-group-id').value;
      const name = document.getElementById('sw-group-name').value;
      try {
        if (id) await this.service.renameGroup(id, name);
        else await this.service.addGroup(name);
        document.getElementById('sw-group-dialog').close();
        await this.render(id ? '分组已更新' : '分组已创建');
      } catch (error) {
        document.getElementById('sw-group-error').textContent = error?.message || '保存失败';
      }
    }

    openPageDialog(pageId) {
      const page = this.snapshot.config.pages.find(item => item.id === pageId);
      if (!page) return;
      document.getElementById('sw-page-id').value = page.id;
      document.getElementById('sw-page-name').value = page.customTitle || page.title || '';
      document.getElementById('sw-page-error').textContent = '';
      document.getElementById('sw-page-dialog').showModal();
      const input = document.getElementById('sw-page-name');
      input.focus();
      input.select();
    }

    async savePageName(event) {
      event.preventDefault();
      const pageId = document.getElementById('sw-page-id').value;
      const name = document.getElementById('sw-page-name').value;
      try {
        await this.service.renamePage(pageId, name);
        document.getElementById('sw-page-dialog').close();
        await this.render('页面名称已保存');
      } catch (error) {
        document.getElementById('sw-page-error').textContent = error?.message || '保存失败';
      }
    }

    favicon(url, label) {
      const fallback = this.escape((label || '?').trim().slice(0, 1).toUpperCase());
      const src = chrome.runtime.getURL('_favicon/') + `?pageUrl=${encodeURIComponent(url || '')}&size=32`;
      return `<span class="sw-favicon"><img src="${this.escape(src)}" alt="" data-favicon onerror="this.remove()"><span>${fallback}</span></span>`;
    }

    hostname(url) {
      try { return new URL(url).hostname; } catch { return ''; }
    }

    escape(value) {
      return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
  }

  const controller = new SiteWorkspaceController();
  window.siteWorkspaceController = controller;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => controller.init());
  else controller.init();
})();
