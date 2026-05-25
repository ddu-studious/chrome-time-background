(function () {
  'use strict';

  const APP_REGISTRY = [
    { id: 'zen-mode', name: '极简模式', icon: 'fas fa-eye-slash', category: 'system', dockBtnId: 'zen-mode-btn', isSystem: true, defaultOrder: 0 },
    { id: 'sys-monitor', name: '扩展监控', icon: 'fas fa-heartbeat', category: 'system', dockBtnId: 'sys-monitor-toggle', isSystem: true, defaultOrder: 1 },
    { id: 'knowledge', name: '常用信息', icon: 'fas fa-brain', category: 'tools', dockBtnId: 'kw-dock-btn', isSystem: false, defaultOrder: 2 },
    { id: 'bilibili', name: '哔哩哔哩', icon: 'fab fa-bilibili', category: 'media', dockBtnId: 'bili-dock-btn', isSystem: false, defaultOrder: 3 },
    { id: 'schedule', name: '计划管理', icon: 'fas fa-calendar-check', category: 'productivity', dockBtnId: 'schedule-dock-btn', isSystem: false, defaultOrder: 4 },
    { id: 'worklog', name: '工作日志', icon: 'fas fa-clipboard-list', category: 'productivity', dockBtnId: 'worklog-dock-btn', isSystem: false, defaultOrder: 5 },
    { id: 'blog', name: '写作空间', icon: 'fas fa-pen-nib', category: 'productivity', dockBtnId: 'blog-dock-btn', isSystem: false, defaultOrder: 6 },
    { id: 'quick-nav', name: '快捷导航', icon: 'fas fa-compass', category: 'tools', dockBtnId: 'quick-nav-dock-btn', isSystem: false, defaultOrder: 6.5 },
    { id: 'snake-game', name: '贪吃蛇', icon: 'fas fa-gamepad', category: 'games', dockBtnId: 'snake-dock-btn', isSystem: false, defaultOrder: 7 },
    { id: 'tetris-game', name: '俄罗斯方块', icon: 'fas fa-th', category: 'games', dockBtnId: 'tetris-dock-btn', isSystem: false, defaultOrder: 8 },
    { id: 'tetris-3d-game', name: '立体方块', icon: 'fas fa-cube', category: 'games', dockBtnId: 'tetris-3d-dock-btn', panelId: 'tetris-3d-game-panel', isSystem: false, defaultOrder: 8.5 },
    { id: 'agent', name: 'Agent 矩阵', icon: 'fas fa-robot', category: 'tools', dockBtnId: 'agent-dock-btn', isSystem: false, defaultOrder: 9, hasIndicator: true },
    { id: 'prompt-manager', name: 'Prompt 管理', icon: 'fas fa-magic', category: 'tools', dockBtnId: 'prompt-mgr-dock-btn', isSystem: false, defaultOrder: 9.5 },
    { id: 'settings', name: '设置', icon: 'fas fa-cog', category: 'system', dockBtnId: 'settings-dock-btn', isSystem: true, defaultOrder: 10 },
    { id: 'memo', name: '任务面板', icon: 'fas fa-tasks', category: 'productivity', dockBtnId: 'memo-toggle-btn', isSystem: false, defaultOrder: 11 },
  ];

  const CATEGORIES = {
    system: { name: '系统工具', icon: 'fas fa-cog', order: 0 },
    tools: { name: '效率工具', icon: 'fas fa-wrench', order: 1 },
    productivity: { name: '生产力', icon: 'fas fa-briefcase', order: 2 },
    media: { name: '媒体', icon: 'fas fa-play-circle', order: 3 },
    games: { name: '游戏', icon: 'fas fa-gamepad', order: 4 },
  };

  const STORAGE_KEY = 'dockManagerConfig';

  class DockManager {
    constructor() {
      this.apps = new Map();
      this.config = null;
      this.dockEl = null;
      this.launchpadEl = null;
      this.dragState = null;
      this._originalButtons = new Map();
    }

    async init() {
      this.dockEl = document.getElementById('dock-bar');
      if (!this.dockEl) return;

      this._backupOriginalButtons();

      for (const app of APP_REGISTRY) {
        this.apps.set(app.id, app);
      }

      await this.loadConfig();
      this.render();
      this._createLaunchpad();
      this._bindDragEvents();
    }

    _backupOriginalButtons() {
      for (const app of APP_REGISTRY) {
        const btn = document.getElementById(app.dockBtnId);
        if (btn) {
          this._originalButtons.set(app.id, {
            el: btn,
            clickHandlers: [],
          });
        }
      }
    }

    getDefaultConfig() {
      return {
        version: 1,
        items: APP_REGISTRY.map(a => ({ type: 'app', appId: a.id })),
        hiddenApps: [],
        lastModified: Date.now(),
      };
    }

    async loadConfig() {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const data = await chrome.storage.local.get(STORAGE_KEY);
          if (data[STORAGE_KEY]) {
            this.config = data[STORAGE_KEY];
            return;
          }
        }
      } catch { /* fallback */ }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) { this.config = JSON.parse(raw); return; }
      } catch { /* fallback */ }

      this.config = this.getDefaultConfig();
    }

    async saveConfig() {
      this.config.lastModified = Date.now();
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ [STORAGE_KEY]: this.config });
        }
      } catch { /* fallback */ }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch { /* ignore */ }
    }

    render() {
      if (!this.dockEl) return;

      this.dockEl.querySelectorAll('.dock-btn, .dock-divider, .dock-group').forEach(el => {
        el.style.display = 'none';
      });

      const items = this.config?.items || [];
      const frag = document.createDocumentFragment();

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.type === 'divider') {
          const div = document.createElement('div');
          div.className = 'dock-divider dock-managed';
          div.setAttribute('aria-hidden', 'true');
          frag.appendChild(div);
          continue;
        }

        if (item.type === 'group') {
          const groupEl = this._createGroupButton(item, i);
          frag.appendChild(groupEl);
          if (i < items.length - 1) {
            const div = document.createElement('div');
            div.className = 'dock-divider dock-managed';
            div.setAttribute('aria-hidden', 'true');
            frag.appendChild(div);
          }
          continue;
        }

        if (item.type === 'app') {
          const app = this.apps.get(item.appId);
          if (!app) continue;

          const orig = this._originalButtons.get(item.appId);
          if (orig?.el) {
            orig.el.style.display = '';
            orig.el.setAttribute('draggable', 'true');
            orig.el.dataset.dockAppId = item.appId;
            orig.el.dataset.dockIndex = i;
            frag.appendChild(orig.el);
          } else {
            const btn = this._createAppButton(app, i);
            frag.appendChild(btn);
          }

          if (i < items.length - 1) {
            const div = document.createElement('div');
            div.className = 'dock-divider dock-managed';
            div.setAttribute('aria-hidden', 'true');
            frag.appendChild(div);
          }
        }
      }

      const launchpadBtn = document.createElement('button');
      launchpadBtn.className = 'dock-btn dock-managed dock-launchpad-btn';
      launchpadBtn.id = 'dock-launchpad-btn';
      launchpadBtn.title = '应用启动台';
      launchpadBtn.innerHTML = '<i class="fas fa-th-large"></i>';
      launchpadBtn.addEventListener('click', () => this.toggleLaunchpad());

      const lastDivider = document.createElement('div');
      lastDivider.className = 'dock-divider dock-managed';
      lastDivider.setAttribute('aria-hidden', 'true');
      frag.appendChild(lastDivider);
      frag.appendChild(launchpadBtn);

      this.dockEl.querySelectorAll('.dock-managed').forEach(el => el.remove());
      this.dockEl.appendChild(frag);
    }

    _createAppButton(app, index) {
      const btn = document.createElement('button');
      btn.className = 'dock-btn dock-managed';
      btn.id = app.dockBtnId;
      btn.title = app.name;
      btn.setAttribute('draggable', 'true');
      btn.dataset.dockAppId = app.id;
      btn.dataset.dockIndex = index;
      btn.innerHTML = `<i class="${app.icon}"></i>`;
      if (app.hasIndicator) {
        btn.innerHTML += '<span class="cb-dock-indicator disconnected"></span>';
      }
      return btn;
    }

    _createGroupButton(group, index) {
      const btn = document.createElement('button');
      btn.className = 'dock-btn dock-managed dock-group-btn';
      btn.title = group.name || '分组';
      btn.setAttribute('draggable', 'true');
      btn.dataset.dockGroupIndex = index;
      btn.dataset.dockIndex = index;

      const children = (group.children || []).slice(0, 4);
      let previewHtml = '<div class="dock-group-preview">';
      for (const childId of children) {
        const app = this.apps.get(childId);
        if (app) {
          previewHtml += `<i class="${app.icon} dock-group-preview-icon"></i>`;
        }
      }
      previewHtml += '</div>';
      btn.innerHTML = previewHtml;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._expandGroup(group, btn, index);
      });

      return btn;
    }

    _expandGroup(group, anchorEl, index) {
      this._closeGroupPopover();
      const children = group.children || [];
      if (!children.length) return;

      const popover = document.createElement('div');
      popover.className = 'dock-group-popover';
      popover.id = 'dock-group-popover';

      let html = `<div class="dock-group-popover-title">${group.name || '分组'}</div><div class="dock-group-popover-grid">`;
      for (const childId of children) {
        const app = this.apps.get(childId);
        if (!app) continue;
        html += `
          <button class="dock-group-popover-item" data-app-id="${app.id}" title="${app.name}">
            <i class="${app.icon}"></i>
            <span>${app.name}</span>
          </button>`;
      }
      html += '</div>';
      popover.innerHTML = html;

      popover.querySelectorAll('.dock-group-popover-item').forEach(item => {
        item.addEventListener('click', () => {
          const appId = item.dataset.appId;
          const origBtn = document.getElementById(this.apps.get(appId)?.dockBtnId);
          origBtn?.click();
          this._closeGroupPopover();
        });
      });

      document.body.appendChild(popover);

      const rect = anchorEl.getBoundingClientRect();
      popover.style.left = `${rect.left + rect.width / 2}px`;
      popover.style.bottom = `${window.innerHeight - rect.top + 8}px`;
      popover.style.transform = 'translateX(-50%)';

      requestAnimationFrame(() => popover.classList.add('open'));

      const closeHandler = (e) => {
        if (!popover.contains(e.target) && e.target !== anchorEl) {
          this._closeGroupPopover();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    _closeGroupPopover() {
      document.getElementById('dock-group-popover')?.remove();
    }

    // ─── Drag & Drop ───

    _bindDragEvents() {
      if (!this.dockEl) return;

      this.dockEl.addEventListener('dragstart', (e) => {
        const btn = e.target.closest('.dock-btn[data-dock-index]');
        if (!btn) return;
        const appId = btn.dataset.dockAppId;
        const app = this.apps.get(appId);
        this.dragState = {
          sourceIndex: parseInt(btn.dataset.dockIndex),
          sourceAppId: appId,
          el: btn,
        };
        btn.classList.add('dock-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', appId || 'group');

        if (app && !app.isSystem) {
          this._showRemoveZone();
        }
      });

      this.dockEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!this.dragState) {
          if (e.dataTransfer.types.includes('application/dock-app')) {
            e.dataTransfer.dropEffect = 'copy';
          }
          return;
        }

        const dockRect = this.dockEl.getBoundingClientRect();
        const isOutside = e.clientY < dockRect.top - 40;
        this._updateRemoveZone(isOutside);

        const btn = e.target.closest('.dock-btn[data-dock-index]');
        this.dockEl.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('dock-drop-before', 'dock-drop-after'));
        if (!isOutside && btn && btn !== this.dragState.el) {
          const rect = btn.getBoundingClientRect();
          const midX = rect.left + rect.width / 2;
          if (e.clientX < midX) {
            btn.classList.add('dock-drop-before');
          } else {
            btn.classList.add('dock-drop-after');
          }
        }
      });

      this.dockEl.addEventListener('dragleave', (e) => {
        const btn = e.target.closest?.('.dock-btn');
        btn?.classList.remove('dock-drop-before', 'dock-drop-after');
      });

      this.dockEl.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dockEl.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('dock-drop-before', 'dock-drop-after'));

        const launchpadAppId = e.dataTransfer.getData('application/dock-app');
        if (launchpadAppId && !this.dragState) {
          this.addToDock(launchpadAppId);
          return;
        }

        if (!this.dragState) return;

        const btn = e.target.closest('.dock-btn[data-dock-index]');
        if (!btn || btn === this.dragState.el) return;

        const targetIndex = parseInt(btn.dataset.dockIndex);
        const rect = btn.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertBefore = e.clientX < midX;
        let toIndex = insertBefore ? targetIndex : targetIndex + 1;
        if (this.dragState.sourceIndex < toIndex) toIndex--;

        this.reorderDock(this.dragState.sourceIndex, toIndex);
      });

      this.dockEl.addEventListener('dragend', (e) => {
        this.dockEl.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('dock-dragging', 'dock-drop-before', 'dock-drop-after'));
        this._hideRemoveZone();

        if (this.dragState) {
          const dockRect = this.dockEl.getBoundingClientRect();
          if (e.clientY < dockRect.top - 40) {
            const appId = this.dragState.sourceAppId;
            const app = this.apps.get(appId);
            if (app && !app.isSystem) {
              this.removeFromDock(appId);
              this._showRemoveToast(app.name);
            }
          }
        }
        this.dragState = null;
      });

      document.addEventListener('dragover', (e) => {
        if (!this.dragState) return;
        const dockRect = this.dockEl.getBoundingClientRect();
        const isOutside = e.clientY < dockRect.top - 40;
        this._updateRemoveZone(isOutside);
      });
    }

    _showRemoveZone() {
      let zone = document.getElementById('dock-remove-zone');
      if (!zone) {
        zone = document.createElement('div');
        zone.id = 'dock-remove-zone';
        zone.className = 'dock-remove-zone';
        zone.innerHTML = '<i class="fas fa-times-circle"></i><span>拖出移除</span>';
        document.body.appendChild(zone);
      }
      zone.classList.remove('active');
      requestAnimationFrame(() => zone.classList.add('visible'));
    }

    _updateRemoveZone(isActive) {
      const zone = document.getElementById('dock-remove-zone');
      if (!zone) return;
      if (isActive) {
        zone.classList.add('active');
      } else {
        zone.classList.remove('active');
      }
    }

    _hideRemoveZone() {
      const zone = document.getElementById('dock-remove-zone');
      if (zone) {
        zone.classList.remove('visible', 'active');
        setTimeout(() => zone.remove(), 300);
      }
    }

    _showRemoveToast(appName) {
      const toast = document.createElement('div');
      toast.className = 'dock-remove-toast';
      toast.innerHTML = `<i class="fas fa-check"></i> 已将 <strong>${appName}</strong> 从 Dock 移除`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    }

    // ─── Dock Operations ───

    addToDock(appId, position) {
      if (!this.apps.has(appId)) return;
      const existing = this.config.items.find(i => i.type === 'app' && i.appId === appId);
      if (existing) return;

      const idx = this.config.hiddenApps.indexOf(appId);
      if (idx >= 0) this.config.hiddenApps.splice(idx, 1);

      const item = { type: 'app', appId };
      if (typeof position === 'number') {
        this.config.items.splice(position, 0, item);
      } else {
        this.config.items.push(item);
      }

      this.saveConfig();
      this.render();
      this._updateLaunchpad();

      const btn = document.getElementById(this.apps.get(appId)?.dockBtnId);
      if (btn) {
        btn.classList.add('dock-add-anim');
        btn.addEventListener('animationend', () => btn.classList.remove('dock-add-anim'), { once: true });
      }
    }

    removeFromDock(appId) {
      const app = this.apps.get(appId);
      if (!app || app.isSystem) return;

      const idx = this.config.items.findIndex(i => i.type === 'app' && i.appId === appId);
      if (idx < 0) return;

      this.config.items.splice(idx, 1);
      if (!this.config.hiddenApps.includes(appId)) {
        this.config.hiddenApps.push(appId);
      }

      this.saveConfig();
      this.render();
      this._updateLaunchpad();
    }

    reorderDock(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      const items = this.config.items;
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      this.saveConfig();
      this.render();
    }

    isInDock(appId) {
      return this.config.items.some(i => i.type === 'app' && i.appId === appId);
    }

    // ─── Groups ───

    createGroup(name, appIds) {
      const valid = appIds.filter(id => this.apps.has(id));
      if (valid.length < 2) return;

      for (const id of valid) {
        const idx = this.config.items.findIndex(i => i.type === 'app' && i.appId === id);
        if (idx >= 0) this.config.items.splice(idx, 1);
      }

      const insertAt = Math.min(...valid.map(id => {
        const idx = this.config.items.findIndex(i => i.type === 'app' && i.appId === id);
        return idx >= 0 ? idx : this.config.items.length;
      }));

      this.config.items.splice(insertAt, 0, {
        type: 'group',
        name,
        children: valid,
      });

      this.saveConfig();
      this.render();
    }

    // ─── Launchpad ───

    _createLaunchpad() {
      if (this.launchpadEl) return;

      const el = document.createElement('div');
      el.className = 'dock-launchpad';
      el.id = 'dock-launchpad';
      el.innerHTML = `
        <div class="dock-launchpad-overlay"></div>
        <div class="dock-launchpad-content">
          <div class="dock-launchpad-header">
            <h2 class="dock-launchpad-title"><i class="fas fa-th-large"></i> 应用启动台</h2>
            <div class="dock-launchpad-search-wrap">
              <i class="fas fa-search"></i>
              <input type="text" class="dock-launchpad-search" placeholder="搜索应用…" id="dock-launchpad-search">
            </div>
            <button class="dock-launchpad-close" id="dock-launchpad-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="dock-launchpad-grid" id="dock-launchpad-grid"></div>
        </div>
      `;
      document.body.appendChild(el);
      this.launchpadEl = el;

      el.querySelector('.dock-launchpad-overlay').addEventListener('click', () => this.hideLaunchpad());
      el.querySelector('#dock-launchpad-close').addEventListener('click', () => this.hideLaunchpad());
      el.querySelector('#dock-launchpad-search').addEventListener('input', (e) => this._filterLaunchpad(e.target.value));

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.launchpadEl?.classList.contains('open')) {
          this.hideLaunchpad();
        }
      });

      this._updateLaunchpad();
    }

    _updateLaunchpad() {
      const grid = this.launchpadEl?.querySelector('#dock-launchpad-grid');
      if (!grid) return;

      const categories = {};
      for (const [, app] of this.apps) {
        const cat = app.category || 'other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(app);
      }

      const sortedCats = Object.entries(categories).sort(
        ([a], [b]) => (CATEGORIES[a]?.order ?? 99) - (CATEGORIES[b]?.order ?? 99)
      );

      let html = '';
      for (const [catKey, apps] of sortedCats) {
        const catInfo = CATEGORIES[catKey] || { name: catKey, icon: 'fas fa-folder' };
        html += `<div class="dock-launchpad-category" data-category="${catKey}">`;
        html += `<div class="dock-launchpad-cat-header"><i class="${catInfo.icon}"></i> ${catInfo.name}</div>`;
        html += '<div class="dock-launchpad-cat-grid">';
        for (const app of apps) {
          const inDock = this.isInDock(app.id);
          html += `
            <div class="dock-launchpad-app${inDock ? ' in-dock' : ''}" data-app-id="${app.id}" draggable="true">
              <div class="dock-launchpad-app-icon"><i class="${app.icon}"></i></div>
              <div class="dock-launchpad-app-name">${app.name}</div>
              ${inDock ? '<div class="dock-launchpad-badge"><i class="fas fa-check"></i></div>' : ''}
              <button class="dock-launchpad-toggle" data-app-id="${app.id}" title="${inDock ? '从 Dock 移除' : '添加到 Dock'}">
                <i class="fas ${inDock ? 'fa-minus-circle' : 'fa-plus-circle'}"></i>
              </button>
            </div>`;
        }
        html += '</div></div>';
      }
      grid.innerHTML = html;

      grid.querySelectorAll('.dock-launchpad-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const appId = btn.dataset.appId;
          const app = this.apps.get(appId);
          if (app?.isSystem) return;
          if (this.isInDock(appId)) {
            this.removeFromDock(appId);
          } else {
            this.addToDock(appId);
          }
        });
      });

      grid.querySelectorAll('.dock-launchpad-app').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.dock-launchpad-toggle')) return;
          const appId = card.dataset.appId;
          const app = this.apps.get(appId);
          if (app) {
            const origBtn = document.getElementById(app.dockBtnId);
            origBtn?.click();
            this.hideLaunchpad();
          }
        });

        card.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('application/dock-app', card.dataset.appId);
          e.dataTransfer.effectAllowed = 'copy';
          card.classList.add('dock-launchpad-dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dock-launchpad-dragging');
        });
      });
    }

    _filterLaunchpad(query) {
      const grid = this.launchpadEl?.querySelector('#dock-launchpad-grid');
      if (!grid) return;
      const q = query.toLowerCase().trim();

      grid.querySelectorAll('.dock-launchpad-app').forEach(card => {
        const appId = card.dataset.appId;
        const app = this.apps.get(appId);
        const match = !q || app?.name.toLowerCase().includes(q) || appId.includes(q);
        card.style.display = match ? '' : 'none';
      });

      grid.querySelectorAll('.dock-launchpad-category').forEach(cat => {
        const visibleApps = cat.querySelectorAll('.dock-launchpad-app:not([style*="display: none"])');
        cat.style.display = visibleApps.length ? '' : 'none';
      });
    }

    toggleLaunchpad() {
      if (this.launchpadEl?.classList.contains('open')) {
        this.hideLaunchpad();
      } else {
        this.showLaunchpad();
      }
    }

    showLaunchpad() {
      this._updateLaunchpad();
      this.launchpadEl?.classList.add('open');
      const search = this.launchpadEl?.querySelector('#dock-launchpad-search');
      if (search) { search.value = ''; setTimeout(() => search.focus(), 100); }
    }

    hideLaunchpad() {
      this.launchpadEl?.classList.remove('open');
    }

    resetToDefault() {
      this.config = this.getDefaultConfig();
      this.saveConfig();
      this.render();
      this._updateLaunchpad();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.dockManager = new DockManager();
      window.dockManager.init();
    });
  } else {
    window.dockManager = new DockManager();
    window.dockManager.init();
  }
})();
