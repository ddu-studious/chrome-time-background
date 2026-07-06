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
    { id: 'music', name: '音乐播放器', icon: 'fas fa-music', category: 'media', dockBtnId: 'music-dock-btn', isSystem: false, defaultOrder: 8.6 },
    { id: 'reading', name: '今日阅读', icon: 'fas fa-book-reader', category: 'media', dockBtnId: 'reading-dock-btn', isSystem: false, defaultOrder: 8.7 },
    { id: 'poetry', name: '诗词电台', icon: 'fas fa-feather-alt', category: 'media', dockBtnId: 'poetry-dock-btn', isSystem: false, defaultOrder: 8.8 },
    { id: 'agent', name: 'Agent 矩阵', icon: 'fas fa-robot', category: 'tools', dockBtnId: 'agent-dock-btn', isSystem: false, defaultOrder: 9, hasIndicator: true },
    { id: 'chatbot', name: 'AI 对话', icon: 'fas fa-terminal', category: 'tools', dockBtnId: 'chatbot-dock-btn', isSystem: false, defaultOrder: 9.2 },
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
  const DOCK_EFFECT_KEY = 'dockEffectConfig';

  const DOCK_EFFECTS = {
    magnify: { name: '经典放大', desc: 'macOS 风格图标放大', maxScale: 1.5, range: 100 },
    tilt: { name: '3D 倾斜', desc: '视差透视效果', maxTilt: 15, range: 80 },
    glow: { name: '光晕效果', desc: '霓虹光环跟随', glowSize: 12, range: 60 },
    bounce: { name: '弹跳', desc: 'iOS 通知弹跳', bounceHeight: 8, range: 80 },
    wave: { name: '波浪', desc: '海浪连锁动画', amplitude: 6, frequency: 0.15, range: 120 },
    spotlight: { name: '聚光灯', desc: '高亮当前，暗化周围', dimOpacity: 0.35, range: 100 },
    jelly: { name: '果冻', desc: 'Q弹形变效果', squashX: 1.15, squashY: 0.88, range: 70 },
    none: { name: '无效果', desc: '关闭所有 hover 效果' },
  };

  class DockManager {
    constructor() {
      this.apps = new Map();
      this.config = null;
      this.dockEl = null;
      this.launchpadEl = null;
      this.dragState = null;
      this._originalButtons = new Map();
      this._effectConfig = { effect: 'magnify', ...DOCK_EFFECTS.magnify };
      this._magnifyRAF = null;
    }

    async init() {
      this.dockEl = document.getElementById('dock-bar');
      if (!this.dockEl) return;

      this._backupOriginalButtons();

      for (const app of APP_REGISTRY) {
        this.apps.set(app.id, app);
      }

      await this.loadConfig();
      await this._loadEffectConfig();
      this.render();
      this._createLaunchpad();
      this._bindDragEvents();
      this._bindDockEffects();
      this._bindContextMenu();
      this._bindQuickDismiss();
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

    async _loadEffectConfig() {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const data = await chrome.storage.local.get(DOCK_EFFECT_KEY);
          if (data[DOCK_EFFECT_KEY]) {
            this._effectConfig = data[DOCK_EFFECT_KEY];
            return;
          }
        }
      } catch { /* fallback */ }
      try {
        const raw = localStorage.getItem(DOCK_EFFECT_KEY);
        if (raw) { this._effectConfig = JSON.parse(raw); return; }
      } catch { /* fallback */ }
      this._effectConfig = { effect: 'magnify', ...DOCK_EFFECTS.magnify };
    }

    async _saveEffectConfig() {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ [DOCK_EFFECT_KEY]: this._effectConfig });
        }
      } catch { /* fallback */ }
      try {
        localStorage.setItem(DOCK_EFFECT_KEY, JSON.stringify(this._effectConfig));
      } catch { /* ignore */ }
    }

    // ─── Dock Hover Effects (Apple-style magnification) ───

    _bindDockEffects() {
      if (!this.dockEl) return;
      this._lastMouseX = 0;
      this._lastMouseY = 0;
      this._isHovering = false;

      this.dockEl.addEventListener('mousemove', (e) => {
        if (this.dragState) return;
        this._lastMouseX = e.clientX;
        this._lastMouseY = e.clientY;
        this._isHovering = true;
        if (this._magnifyRAF) cancelAnimationFrame(this._magnifyRAF);
        this._magnifyRAF = requestAnimationFrame(() => {
          this._applyEffect(e.clientX, e.clientY);
        });
        if (this._effectConfig.effect === 'wave' && !this._waveLoop) {
          this._startWaveLoop();
        }
      });

      this.dockEl.addEventListener('mouseleave', () => {
        this._isHovering = false;
        if (this._magnifyRAF) cancelAnimationFrame(this._magnifyRAF);
        if (this._waveLoop) { cancelAnimationFrame(this._waveLoop); this._waveLoop = null; }
        this._resetEffect();
      });
    }

    _startWaveLoop() {
      const loop = () => {
        if (!this._isHovering || this._effectConfig.effect !== 'wave') {
          this._waveLoop = null;
          return;
        }
        this._applyEffect(this._lastMouseX, this._lastMouseY);
        this._waveLoop = requestAnimationFrame(loop);
      };
      this._waveLoop = requestAnimationFrame(loop);
    }

    _applyEffect(mouseX, mouseY) {
      const effect = this._effectConfig.effect || 'magnify';
      if (effect === 'none') return;

      const btns = this.dockEl.querySelectorAll('.dock-btn');
      btns.forEach((btn, index) => {
        const rect = btn.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(mouseX - centerX);

        switch (effect) {
          case 'magnify':
            this._applyMagnify(btn, distance);
            break;
          case 'tilt':
            this._applyTilt(btn, mouseX, mouseY, rect);
            break;
          case 'glow':
            this._applyGlow(btn, distance);
            break;
          case 'bounce':
            this._applyBounce(btn, distance);
            break;
          case 'wave':
            this._applyWave(btn, distance, index);
            break;
          case 'spotlight':
            this._applySpotlight(btn, distance);
            break;
          case 'jelly':
            this._applyJelly(btn, distance);
            break;
        }
      });
    }

    _applyMagnify(btn, distance) {
      const { maxScale = 1.5, range = 100 } = this._effectConfig;
      let scale = 1;
      if (distance < range) {
        scale = 1 + (maxScale - 1) * Math.cos((distance / range) * Math.PI / 2);
      }
      btn.style.transform = `translateY(${-(scale - 1) * 20}px) scale(${scale})`;
      btn.style.zIndex = scale > 1.05 ? '10' : '';
    }

    _applyTilt(btn, mouseX, mouseY, rect) {
      const { maxTilt = 15, range = 80 } = this._effectConfig;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distX = mouseX - centerX;
      const distY = mouseY - centerY;
      const distance = Math.sqrt(distX * distX + distY * distY);

      if (distance < range) {
        const intensity = 1 - distance / range;
        const rotateY = (distX / range) * maxTilt * intensity;
        const rotateX = -(distY / range) * maxTilt * intensity;
        const scale = 1 + 0.15 * intensity;
        btn.style.transform = `perspective(200px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`;
        btn.style.zIndex = intensity > 0.3 ? '10' : '';
      } else {
        btn.style.transform = '';
        btn.style.zIndex = '';
      }
    }

    _applyGlow(btn, distance) {
      const { glowSize = 12, range = 60 } = this._effectConfig;
      if (distance < range) {
        const intensity = 1 - distance / range;
        const size = glowSize * intensity;
        const scale = 1 + 0.1 * intensity;
        btn.style.transform = `translateY(${-intensity * 6}px) scale(${scale})`;
        btn.style.boxShadow = `0 0 ${size}px ${size / 2}px rgba(167, 139, 250, ${0.6 * intensity}), inset 0 0 ${size / 2}px rgba(167, 139, 250, ${0.3 * intensity})`;
        btn.style.zIndex = intensity > 0.3 ? '10' : '';
      } else {
        btn.style.transform = '';
        btn.style.boxShadow = '';
        btn.style.zIndex = '';
      }
    }

    _applyBounce(btn, distance) {
      const { bounceHeight = 8, range = 80 } = this._effectConfig;
      if (distance < range) {
        const intensity = 1 - distance / range;
        const y = -bounceHeight * Math.pow(intensity, 1.5);
        const scale = 1 + 0.08 * intensity;
        btn.style.transform = `translateY(${y}px) scale(${scale})`;
        btn.style.zIndex = intensity > 0.3 ? '10' : '';
      } else {
        btn.style.transform = '';
        btn.style.zIndex = '';
      }
    }

    _applyWave(btn, distance, index) {
      const { amplitude = 6, frequency = 0.15, range = 120 } = this._effectConfig;
      if (distance < range) {
        const intensity = 1 - distance / range;
        const phase = index * frequency * Math.PI * 2;
        const time = Date.now() * 0.005;
        const y = -amplitude * intensity * Math.sin(time + phase);
        const scale = 1 + 0.05 * intensity;
        btn.style.transform = `translateY(${y}px) scale(${scale})`;
        btn.style.zIndex = intensity > 0.3 ? '10' : '';
      } else {
        btn.style.transform = '';
        btn.style.zIndex = '';
      }
    }

    _applySpotlight(btn, distance) {
      const { dimOpacity = 0.35, range = 100 } = this._effectConfig;
      if (distance < range * 0.4) {
        btn.style.transform = 'scale(1.12) translateY(-3px)';
        btn.style.opacity = '1';
        btn.style.filter = 'brightness(1.2)';
        btn.style.zIndex = '10';
      } else if (distance < range) {
        const fade = (distance - range * 0.4) / (range * 0.6);
        const opacity = 1 - (1 - dimOpacity) * fade;
        btn.style.transform = '';
        btn.style.opacity = `${opacity}`;
        btn.style.filter = `brightness(${0.5 + 0.5 * (1 - fade)})`;
        btn.style.zIndex = '';
      } else {
        btn.style.transform = '';
        btn.style.opacity = `${dimOpacity}`;
        btn.style.filter = 'brightness(0.5)';
        btn.style.zIndex = '';
      }
    }

    _applyJelly(btn, distance) {
      const { squashX = 1.15, squashY = 0.88, range = 70 } = this._effectConfig;
      if (distance < range) {
        const intensity = 1 - distance / range;
        const sx = 1 + (squashX - 1) * intensity;
        const sy = 1 - (1 - squashY) * intensity;
        const y = -4 * intensity;
        btn.style.transform = `translateY(${y}px) scale(${sx}, ${sy})`;
        btn.style.zIndex = intensity > 0.3 ? '10' : '';
      } else {
        btn.style.transform = '';
        btn.style.zIndex = '';
      }
    }

    _resetEffect() {
      const btns = this.dockEl.querySelectorAll('.dock-btn');
      btns.forEach(btn => {
        btn.style.transform = '';
        btn.style.boxShadow = '';
        btn.style.zIndex = '';
        btn.style.opacity = '';
        btn.style.filter = '';
      });
    }

    // ─── Dock Context Menu ───

    _bindContextMenu() {
      if (!this.dockEl) return;
      this.dockEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this._showContextMenu(e.clientX, e.clientY);
      });
    }

    _showContextMenu(x, y) {
      this._closeContextMenu();
      const menu = document.createElement('div');
      menu.className = 'dock-context-menu';
      menu.id = 'dock-context-menu';

      let html = '<div class="dock-context-menu-title">Dock 悬浮效果</div>';
      for (const [key, cfg] of Object.entries(DOCK_EFFECTS)) {
        const active = this._effectConfig.effect === key;
        html += `<button class="dock-context-menu-item${active ? ' active' : ''}" data-effect="${key}">
          <i class="fas ${active ? 'fa-check-circle' : 'fa-circle'}"></i>
          <span>${cfg.name}</span>
          <small style="margin-left:auto;opacity:0.4;font-size:10px;">${cfg.desc || ''}</small>
        </button>`;
      }
      html += '<div class="dock-context-menu-divider"></div>';
      html += `<button class="dock-context-menu-item" data-action="reset">
        <i class="fas fa-undo"></i><span>重置 Dock 布局</span>
      </button>`;
      menu.innerHTML = html;

      document.body.appendChild(menu);

      const menuRect = menu.getBoundingClientRect();
      let left = x;
      let top = y - menuRect.height;
      if (top < 8) top = y + 8;
      if (left + menuRect.width > window.innerWidth - 8) {
        left = window.innerWidth - menuRect.width - 8;
      }
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      requestAnimationFrame(() => menu.classList.add('open'));

      menu.querySelectorAll('[data-effect]').forEach(btn => {
        btn.addEventListener('click', () => {
          const effect = btn.dataset.effect;
          this._effectConfig = { effect, ...DOCK_EFFECTS[effect] };
          this._saveEffectConfig();
          this._resetEffect();
          this._closeContextMenu();
        });
      });

      menu.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
        this.resetToDefault();
        this._closeContextMenu();
      });

      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          this._closeContextMenu();
          document.removeEventListener('click', closeHandler);
        }
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }

    _closeContextMenu() {
      document.getElementById('dock-context-menu')?.remove();
    }

    // ─── Quick Dismiss (快速收起面板) ───

    _bindQuickDismiss() {
      if (!this.dockEl) return;

      // 1. 双击 dock-bar 空白区域 → 关闭所有面板
      this.dockEl.addEventListener('dblclick', (e) => {
        if (e.target === this.dockEl || e.target.classList.contains('dock-divider')) {
          this._dismissAllPanels();
        }
      });

      // 2. 向下滑动手势 → 收起面板 (移动端/触控板友好)
      let touchStartY = 0;
      let touchStartTime = 0;
      this.dockEl.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }, { passive: true });

      this.dockEl.addEventListener('touchend', (e) => {
        const deltaY = e.changedTouches[0].clientY - touchStartY;
        const deltaTime = Date.now() - touchStartTime;
        if (deltaY > 30 && deltaTime < 300) {
          this._dismissAllPanels();
        }
      }, { passive: true });

      // 3. 全局 ESC 统一关闭最顶层面板
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this._dismissTopPanel();
        }
      });

      // 4. 点击页面背景空白区域关闭面板 (不在 dock 和面板内)
      document.addEventListener('mousedown', (e) => {
        const target = e.target;
        if (this.dockEl.contains(target)) return;
        const isInPanel = target.closest('.cb-panel.open, [class*="-overlay"], [class*="-panel"], .dock-launchpad.open, .dock-context-menu, .dock-group-popover');
        if (isInPanel) return;
        // 不处理面板内部的点击
        if (target.closest('[class*="memo"], [class*="worklog"], [class*="bilibili"], [class*="schedule"]')) return;
        this._dismissAllPanels();
      });
    }

    _dismissAllPanels() {
      // Agent 面板
      const bridge = window.cursorBridge || window.CursorBridge;
      if (bridge?.isOpen) bridge.togglePanel();

      // Launchpad
      this.hideLaunchpad();

      // 通用浮层面板 (overlay 类)
      document.querySelectorAll('.cb-dashboard-overlay, .dock-group-popover, .dock-context-menu').forEach(el => el.remove());

      // 其他已打开的通过 dock 触发的模块 — 通过自定义事件通知
      document.dispatchEvent(new CustomEvent('dock:dismiss-all'));
    }

    _dismissTopPanel() {
      // 优先关闭最顶层的浮层
      const topOverlay = document.querySelector('.cb-dashboard-overlay, .dock-group-popover.open, .dock-context-menu');
      if (topOverlay) { topOverlay.remove(); return; }
      if (this.launchpadEl?.classList.contains('open')) { this.hideLaunchpad(); return; }
      // 其余交给各模块的 ESC 处理
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
      this._positionLaunchpad();
      this.launchpadEl?.classList.add('open');
      const search = this.launchpadEl?.querySelector('#dock-launchpad-search');
      if (search) { search.value = ''; setTimeout(() => search.focus(), 100); }
    }

    hideLaunchpad() {
      this.launchpadEl?.classList.remove('open');
    }

    _positionLaunchpad() {
      const content = this.launchpadEl?.querySelector('.dock-launchpad-content');
      if (!content || !this.dockEl) return;

      const dockRect = this.dockEl.getBoundingClientRect();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;

      content.style.position = 'fixed';
      content.style.margin = '0';

      const maxH = Math.min(vpH * 0.7, 520);
      content.style.maxHeight = `${maxH}px`;

      const bottomGap = vpH - dockRect.top + 12;
      const spaceAbove = dockRect.top - 12;

      if (spaceAbove >= 280) {
        content.style.bottom = `${bottomGap}px`;
        content.style.top = 'auto';
      } else {
        content.style.top = '60px';
        content.style.bottom = 'auto';
      }

      const contentW = Math.min(620, vpW - 32);
      content.style.width = `${contentW}px`;

      let left = dockRect.left + dockRect.width / 2 - contentW / 2;
      if (left < 16) left = 16;
      if (left + contentW > vpW - 16) left = vpW - contentW - 16;
      content.style.left = `${left}px`;
      content.style.right = 'auto';
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
