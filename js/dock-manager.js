(function () {
  'use strict';

  const registry = window.ProductAppRegistry;
  if (!registry) throw new Error('ProductAppRegistry must load before dock-manager.js');
  const APP_REGISTRY = registry.apps;
  const CATEGORIES = registry.categories;

  const STORAGE_KEY = 'dockManagerConfig';
  const DOCK_EFFECT_KEY = 'dockEffectConfig';
  const RECENT_APPS_KEY = 'dockManagerRecentApps';
  const DOCK_SHELL_KEY = 'dockShellConfig';

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
      this._launchpadCategory = 'all';
      this._recentAppIds = null;
      this._launchpadReturnFocus = null;
      this._launchpadBackgroundInert = [];
      this._contextReturnFocus = null;
      this._shellState = { pinned: true };
      this._dockCollapsed = false;
      this._dockCollapseTimer = null;
      this._dockRevealTimer = null;
      this._dockRevealLockTimer = null;
      this._dockInteractionLockedUntil = 0;
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
      await this._loadShellState();
      this.render();
      this._createLaunchpad();
      this._bindDragEvents();
      this._bindDockEffects();
      this._bindContextMenu();
      this._bindQuickDismiss();
      this._bindDockShell();
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

    async _loadShellState() {
      let saved = null;
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          const data = await chrome.storage.local.get(DOCK_SHELL_KEY);
          saved = data[DOCK_SHELL_KEY];
        }
      } catch { /* fallback */ }
      if (!saved) {
        try { saved = JSON.parse(localStorage.getItem(DOCK_SHELL_KEY) || 'null'); } catch { /* fallback */ }
      }
      this._shellState = { pinned: saved?.pinned !== false };
      this._dockCollapsed = !this._shellState.pinned;
    }

    async _saveShellState() {
      const value = { pinned: this._shellState.pinned };
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ [DOCK_SHELL_KEY]: value });
        }
      } catch { /* fallback */ }
      try { localStorage.setItem(DOCK_SHELL_KEY, JSON.stringify(value)); } catch { /* ignore */ }
    }

    _bindDockShell() {
      if (!this.dockEl) return;
      this.dockEl.addEventListener('click', event => {
        if (event.target.closest('[data-dock-shell-action]')) return;
        if (Date.now() >= this._dockInteractionLockedUntil) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }, true);
      this.dockEl.addEventListener('click', event => {
        const action = event.target.closest('[data-dock-shell-action]')?.dataset.dockShellAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'reveal') this._setDockCollapsed(false);
        if (action === 'collapse') {
          this._shellState.pinned = false;
          void this._saveShellState();
          this._setDockCollapsed(true);
        }
        if (action === 'pin') this._setDockPinned(!this._shellState.pinned);
      });
      this.dockEl.addEventListener('pointerenter', () => {
        clearTimeout(this._dockCollapseTimer);
        clearTimeout(this._dockRevealTimer);
        if (!this._shellState.pinned && this._dockCollapsed) {
          this._dockRevealTimer = setTimeout(() => {
            if (this.dockEl?.matches(':hover')) this._setDockCollapsed(false, { fromHover: true });
          }, 90);
        }
      });
      this.dockEl.addEventListener('pointerleave', () => {
        clearTimeout(this._dockRevealTimer);
        this._scheduleDockCollapse(160, true);
      });
      this.dockEl.addEventListener('focusin', () => {
        clearTimeout(this._dockCollapseTimer);
      });
      this.dockEl.addEventListener('focusout', event => {
        if (!this.dockEl.contains(event.relatedTarget)) this._scheduleDockCollapse();
      });
      this._applyDockShellState();
    }

    _setDockPinned(pinned) {
      this._shellState.pinned = Boolean(pinned);
      void this._saveShellState();
      this._setDockCollapsed(false);
      if (!this._shellState.pinned) this._scheduleDockCollapse();
    }

    _setDockCollapsed(collapsed, { fromHover = false } = {}) {
      clearTimeout(this._dockCollapseTimer);
      this._dockCollapsed = Boolean(collapsed) && !this._shellState.pinned;
      clearTimeout(this._dockRevealLockTimer);
      if (!this._dockCollapsed && fromHover) {
        this._dockInteractionLockedUntil = Date.now() + 360;
        this.dockEl?.classList.add('dock-is-revealing');
        this._dockRevealLockTimer = setTimeout(() => {
          this.dockEl?.classList.remove('dock-is-revealing');
          this._dockInteractionLockedUntil = 0;
        }, 360);
      } else {
        this._dockInteractionLockedUntil = 0;
        this.dockEl?.classList.remove('dock-is-revealing');
      }
      this._applyDockShellState();
    }

    _scheduleDockCollapse(delay = 160, force = false) {
      clearTimeout(this._dockCollapseTimer);
      if (this._shellState.pinned) return;
      this._dockCollapseTimer = setTimeout(() => {
        if (!this.dockEl?.matches(':hover') && (force || !this.dockEl?.contains(document.activeElement))) {
          this._setDockCollapsed(true);
        }
      }, delay);
    }

    _applyDockShellState() {
      if (!this.dockEl) return;
      this.dockEl.classList.add('dock-shell-v5');
      this.dockEl.classList.toggle('dock-is-pinned', this._shellState.pinned);
      this.dockEl.classList.toggle('dock-is-collapsed', this._dockCollapsed);
      this.dockEl.setAttribute('aria-label', this._dockCollapsed ? 'Dock 已收起，鼠标靠近或点击展开' : '应用 Dock');
      const pin = this.dockEl.querySelector('[data-dock-shell-action="pin"]');
      if (pin) {
        pin.classList.toggle('active', this._shellState.pinned);
        pin.setAttribute('aria-pressed', String(this._shellState.pinned));
        pin.title = this._shellState.pinned ? '取消固定，离开后自动收起' : '固定 Dock';
      }
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
        this._showContextMenu(e.clientX, e.clientY, e.target.closest('button') || document.activeElement);
      });
    }

    _showContextMenu(x, y, returnTarget = null) {
      this._closeContextMenu(false);
      this._contextReturnFocus = returnTarget?.isConnected ? returnTarget : document.activeElement;
      window.ProductUIV5?.setBusinessPage?.('launchpad', 'dock-menu');
      const menu = document.createElement('div');
      menu.className = 'dock-context-menu';
      menu.id = 'dock-context-menu';
      menu.setAttribute('role', 'menu');
      menu.setAttribute('aria-label', 'Dock 悬浮效果与布局');
      menu.tabIndex = -1;

      let html = '<div class="dock-context-menu-title">Dock 行为</div>';
      html += `<button class="dock-context-menu-item${this._shellState.pinned ? ' active' : ''}" data-shell-action="pin" role="menuitemcheckbox" aria-checked="${this._shellState.pinned}">
        <i class="fas fa-thumbtack"></i><span>${this._shellState.pinned ? '已固定在底部' : '固定在底部'}</span>
      </button>`;
      html += '<button class="dock-context-menu-item" data-shell-action="collapse" role="menuitem"><i class="fas fa-chevron-down"></i><span>收起 Dock</span></button>';
      html += '<div class="dock-context-menu-divider"></div><div class="dock-context-menu-title">Dock 悬浮效果</div>';
      for (const [key, cfg] of Object.entries(DOCK_EFFECTS)) {
        const active = this._effectConfig.effect === key;
        html += `<button class="dock-context-menu-item${active ? ' active' : ''}" data-effect="${key}" role="menuitemradio" aria-checked="${active}">
          <i class="fas ${active ? 'fa-check-circle' : 'fa-circle'}"></i>
          <span>${cfg.name}</span>
          <small style="margin-left:auto;opacity:0.4;font-size:10px;">${cfg.desc || ''}</small>
        </button>`;
      }
      html += '<div class="dock-context-menu-divider"></div>';
      html += `<button class="dock-context-menu-item" data-action="reset" role="menuitem">
        <i class="fas fa-undo"></i><span>重置 Dock 布局</span>
      </button>`;
      menu.innerHTML = html;

      document.body.appendChild(menu);

      // The closed menu is scaled to 0.92, so getBoundingClientRect() would
      // underestimate its final open size and let the right/bottom edges clip.
      const menuWidth = menu.offsetWidth;
      const menuHeight = menu.offsetHeight;
      let left = x;
      let top = y - menuHeight;
      if (top < 8) top = y + 8;
      if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - menuHeight - 8);
      }
      if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
      }
      left = Math.max(8, left);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      requestAnimationFrame(() => {
        menu.classList.add('open');
        menu.querySelector('.dock-context-menu-item.active, .dock-context-menu-item')?.focus({ preventScroll: true });
      });

      menu.addEventListener('keydown', (event) => {
        const items = [...menu.querySelectorAll('.dock-context-menu-item')];
        const index = items.indexOf(document.activeElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this._closeContextMenu();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          const delta = event.key === 'ArrowDown' ? 1 : -1;
          items[(index + delta + items.length) % items.length]?.focus();
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          items[event.key === 'Home' ? 0 : items.length - 1]?.focus();
        }
      });

      menu.querySelectorAll('[data-effect]').forEach(btn => {
        btn.addEventListener('click', () => {
          const effect = btn.dataset.effect;
          this._effectConfig = { effect, ...DOCK_EFFECTS[effect] };
          this._saveEffectConfig();
          this._resetEffect();
          this._closeContextMenu();
        });
      });

      menu.querySelector('[data-shell-action="pin"]')?.addEventListener('click', () => {
        this._setDockPinned(!this._shellState.pinned);
        this._closeContextMenu();
      });
      menu.querySelector('[data-shell-action="collapse"]')?.addEventListener('click', () => {
        this._shellState.pinned = false;
        void this._saveShellState();
        this._setDockCollapsed(true);
        this._closeContextMenu(false);
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

    _closeContextMenu(restore = true) {
      document.getElementById('dock-context-menu')?.remove();
      if (restore) {
        if (this.launchpadEl?.classList.contains('open')) window.ProductUIV5?.setBusinessPage?.('launchpad', 'all-apps');
        else window.ProductUIV5?.setShellPage?.('home');
        const fallback = document.getElementById('dock-launchpad-btn');
        (this._contextReturnFocus?.isConnected ? this._contextReturnFocus : fallback)?.focus?.({ preventScroll: true });
      }
      this._contextReturnFocus = null;
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
        version: 4,
        items: APP_REGISTRY.filter(a => a.defaultInDock).map(a => ({ type: 'app', appId: a.id })),
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
            await this._migrateConfig();
            return;
          }
        }
      } catch { /* fallback */ }

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this.config = JSON.parse(raw);
          await this._migrateConfig();
          return;
        }
      } catch { /* fallback */ }

      this.config = this.getDefaultConfig();
    }

    async _migrateConfig() {
      if (!this.config || Number(this.config.version || 0) >= 4) return;
      this.config.items = Array.isArray(this.config.items) ? this.config.items : [];
      this.config.hiddenApps = Array.isArray(this.config.hiddenApps) ? this.config.hiddenApps : [];
      const hasApp = appId => this.config.items.some(item => item.type === 'app' && item.appId === appId)
        || this.config.items.some(item => item.type === 'group' && Array.isArray(item.children) && item.children.includes(appId));
      if (Number(this.config.version || 0) < 3 && !hasApp('site-workspace') && !this.config.hiddenApps.includes('site-workspace')) {
        const quickNavIndex = this.config.items.findIndex(item => item.type === 'app' && item.appId === 'quick-nav');
        this.config.items.splice(quickNavIndex >= 0 ? quickNavIndex + 1 : this.config.items.length, 0, { type: 'app', appId: 'site-workspace' });
      }
      if (!hasApp('alarm') && !this.config.hiddenApps.includes('alarm')) {
        const scheduleIndex = this.config.items.findIndex(item => item.type === 'app' && item.appId === 'schedule');
        this.config.items.splice(scheduleIndex >= 0 ? scheduleIndex + 1 : this.config.items.length, 0, { type: 'app', appId: 'alarm' });
      }
      this.config.version = 4;
      await this.saveConfig();
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
        el.classList.remove('dock-mobile-overflow');
      });

      const items = this.config?.items || [];
      const frag = document.createDocumentFragment();
      let dockSlotCount = 0;

      const shellControls = document.createElement('div');
      shellControls.className = 'dock-shell-controls dock-managed';
      shellControls.innerHTML = `
        <button class="dock-shell-btn dock-shell-reveal" type="button" data-dock-shell-action="reveal" title="展开 Dock" aria-label="展开 Dock"><i class="fas fa-chevron-up"></i></button>
        <button class="dock-shell-btn dock-shell-pin" type="button" data-dock-shell-action="pin" aria-label="固定 Dock" aria-pressed="${this._shellState.pinned}"><i class="fas fa-thumbtack"></i></button>
        <button class="dock-shell-btn dock-shell-collapse" type="button" data-dock-shell-action="collapse" title="收起 Dock" aria-label="收起 Dock"><i class="fas fa-chevron-down"></i></button>`;
      frag.appendChild(shellControls);

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
          if (dockSlotCount >= 6) groupEl.classList.add('dock-mobile-overflow');
          dockSlotCount += 1;
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
            if (dockSlotCount >= 6) orig.el.classList.add('dock-mobile-overflow');
            frag.appendChild(orig.el);
          } else {
            const btn = this._createAppButton(app, i);
            if (dockSlotCount >= 6) btn.classList.add('dock-mobile-overflow');
            frag.appendChild(btn);
          }
          dockSlotCount += 1;

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
      launchpadBtn.setAttribute('aria-label', '应用启动台');
      launchpadBtn.innerHTML = '<i class="fas fa-th-large"></i>';
      launchpadBtn.addEventListener('click', () => this.toggleLaunchpad());

      const lastDivider = document.createElement('div');
      lastDivider.className = 'dock-divider dock-managed';
      lastDivider.setAttribute('aria-hidden', 'true');
      frag.appendChild(lastDivider);
      frag.appendChild(launchpadBtn);

      this.dockEl.querySelectorAll('.dock-managed').forEach(el => el.remove());
      this.dockEl.appendChild(frag);
      this._applyDockShellState();
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
          this._activateApp(appId);
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
      el.setAttribute('aria-hidden', 'true');
      el.inert = true;
      el.innerHTML = `
        <div class="dock-launchpad-overlay"></div>
        <div class="dock-launchpad-content" role="dialog" aria-modal="true" aria-labelledby="dock-launchpad-title">
          <div class="dock-launchpad-header">
            <div class="dock-launchpad-heading">
              <span class="dock-launchpad-eyebrow">全部能力</span>
              <h2 class="dock-launchpad-title" id="dock-launchpad-title"><i class="fas fa-th-large"></i> 应用启动台</h2>
              <p>搜索、打开或固定功能到 Dock</p>
            </div>
            <div class="dock-launchpad-search-wrap">
              <i class="fas fa-search"></i>
              <input type="search" class="dock-launchpad-search" placeholder="搜索名称或功能…" id="dock-launchpad-search" aria-label="搜索应用">
              <kbd>⌘ K</kbd>
            </div>
            <button class="dock-launchpad-close" id="dock-launchpad-close" aria-label="关闭应用启动台"><i class="fas fa-times"></i></button>
          </div>
          <div class="dock-launchpad-body">
            <nav class="dock-launchpad-categories" id="dock-launchpad-categories" aria-label="应用分类"></nav>
            <div class="dock-launchpad-catalog">
              <section class="dock-launchpad-recent" id="dock-launchpad-recent" hidden>
                <div class="dock-launchpad-section-title"><span>最近使用</span><small>快速回到刚才的工作</small></div>
                <div class="dock-launchpad-recent-grid" id="dock-launchpad-recent-grid"></div>
              </section>
              <div class="dock-launchpad-grid" id="dock-launchpad-grid"></div>
              <div class="dock-launchpad-empty" id="dock-launchpad-empty" hidden>
                <i class="fas fa-search"></i><span>没有匹配的功能</span><small>试试更短的关键词</small>
              </div>
            </div>
          </div>
          <div class="dock-launchpad-footer">
            <span id="dock-launchpad-count"></span>
            <span><i class="fas fa-thumbtack"></i> 固定后的功能会显示在 Dock</span>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      this.launchpadEl = el;

      el.querySelector('.dock-launchpad-overlay').addEventListener('click', () => this.hideLaunchpad());
      el.querySelector('#dock-launchpad-close').addEventListener('click', () => this.hideLaunchpad());
      el.querySelector('#dock-launchpad-search').addEventListener('input', (e) => this._filterLaunchpad(e.target.value));

      document.addEventListener('keydown', (e) => this._handleLaunchpadKeydown(e));

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

      const categoryNav = this.launchpadEl.querySelector('#dock-launchpad-categories');
      categoryNav.innerHTML = `
        <button class="dock-launchpad-category-btn${this._launchpadCategory === 'all' ? ' active' : ''}" data-category="all" aria-pressed="${this._launchpadCategory === 'all'}">
          <i class="fas fa-border-all"></i><span>全部</span><small>${this.apps.size}</small>
        </button>` + sortedCats.map(([catKey, apps]) => {
          const info = CATEGORIES[catKey] || { name: catKey, icon: 'fas fa-folder' };
          return `<button class="dock-launchpad-category-btn${this._launchpadCategory === catKey ? ' active' : ''}" data-category="${catKey}" aria-pressed="${this._launchpadCategory === catKey}">
            <i class="${info.icon}"></i><span>${info.name}</span><small>${apps.length}</small>
          </button>`;
        }).join('');

      categoryNav.querySelectorAll('.dock-launchpad-category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._launchpadCategory = btn.dataset.category;
          window.ProductUIV5?.setBusinessPage?.('launchpad', this._launchpadCategory === 'all' ? 'all-apps' : 'category');
          categoryNav.querySelectorAll('.dock-launchpad-category-btn').forEach(item => {
            const active = item === btn;
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
          });
          this._filterLaunchpad(this.launchpadEl.querySelector('#dock-launchpad-search')?.value || '');
        });
      });

      const buildCard = (app, recent = false) => {
        const inDock = this.isInDock(app.id);
        return `<article class="dock-launchpad-app${inDock ? ' in-dock' : ''}${recent ? ' recent' : ''}" data-app-id="${app.id}" data-category="${app.category}" draggable="true">
          <button type="button" class="dock-launchpad-open" data-app-open="${app.id}" aria-label="打开${app.name}">
            <span class="dock-launchpad-app-icon"><i class="${app.icon}"></i></span>
            <span class="dock-launchpad-app-copy">
              <span class="dock-launchpad-app-name">${app.name}</span>
              <span class="dock-launchpad-app-summary">${app.summary || '打开应用'}</span>
            </span>
          </button>
          <span class="dock-launchpad-actions">
            ${inDock ? `<button class="dock-launchpad-move" data-app-move="-1" data-app-id="${app.id}" aria-label="将${app.name}前移"><i class="fas fa-arrow-up"></i></button><button class="dock-launchpad-move" data-app-move="1" data-app-id="${app.id}" aria-label="将${app.name}后移"><i class="fas fa-arrow-down"></i></button>` : ''}
            <button class="dock-launchpad-toggle" data-app-id="${app.id}" title="${inDock ? '从 Dock 移除' : '固定到 Dock'}" aria-label="${inDock ? `从 Dock 移除${app.name}` : `固定${app.name}到 Dock`}">
              <i class="fas fa-thumbtack"></i><span>${inDock ? '已固定' : '固定'}</span>
            </button>
          </span>
        </article>`;
      };

      const recentIds = this._getRecentAppIds();
      const recentApps = recentIds.map(id => this.apps.get(id)).filter(Boolean).slice(0, 4);
      const recentSection = this.launchpadEl.querySelector('#dock-launchpad-recent');
      const recentGrid = this.launchpadEl.querySelector('#dock-launchpad-recent-grid');
      recentSection.hidden = recentApps.length === 0;
      recentGrid.innerHTML = recentApps.map(app => buildCard(app, true)).join('');

      let html = '';
      for (const [catKey, apps] of sortedCats) {
        const catInfo = CATEGORIES[catKey] || { name: catKey, icon: 'fas fa-folder' };
        html += `<div class="dock-launchpad-category" data-category="${catKey}">`;
        html += `<div class="dock-launchpad-cat-header"><span><i class="${catInfo.icon}"></i> ${catInfo.name}</span><small>${apps.length} 个功能</small></div>`;
        html += '<div class="dock-launchpad-cat-grid">';
        for (const app of apps) {
          html += buildCard(app);
        }
        html += '</div></div>';
      }
      grid.innerHTML = html;

      this.launchpadEl.querySelectorAll('.dock-launchpad-toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.ProductUIV5?.setBusinessPage?.('launchpad', 'pin-order');
          const appId = btn.dataset.appId;
          if (this.isInDock(appId)) {
            this.removeFromDock(appId);
          } else {
            this.addToDock(appId);
          }
          requestAnimationFrame(() => {
            this._filterLaunchpad(this.launchpadEl?.querySelector('#dock-launchpad-search')?.value || '');
            this.launchpadEl?.querySelector(`.dock-launchpad-toggle[data-app-id="${appId}"]`)?.focus({ preventScroll: true });
          });
        });
      });

      this.launchpadEl.querySelectorAll('.dock-launchpad-move').forEach(btn => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          window.ProductUIV5?.setBusinessPage?.('launchpad', 'pin-order');
          const appId = btn.dataset.appId;
          const direction = Number(btn.dataset.appMove) < 0 ? -1 : 1;
          if (!this._moveDockApp(appId, direction)) return;
          this._updateLaunchpad();
          requestAnimationFrame(() => this.launchpadEl?.querySelector(`.dock-launchpad-move[data-app-id="${appId}"][data-app-move="${direction}"]`)?.focus({ preventScroll: true }));
        });
      });

      this.launchpadEl.querySelectorAll('.dock-launchpad-app').forEach(card => {
        card.querySelector('.dock-launchpad-open')?.addEventListener('click', () => {
          const appId = card.dataset.appId;
          const app = this.apps.get(appId);
          if (app) {
            this._recordRecentApp(appId);
            this._activateApp(appId);
            this.hideLaunchpad(false, false);
          }
        });

        card.addEventListener('dragstart', (e) => {
          window.ProductUIV5?.setBusinessPage?.('launchpad', 'pin-order');
          e.dataTransfer.setData('application/dock-app', card.dataset.appId);
          e.dataTransfer.effectAllowed = 'copy';
          card.classList.add('dock-launchpad-dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dock-launchpad-dragging');
        });
      });

      this._filterLaunchpad(this.launchpadEl.querySelector('#dock-launchpad-search')?.value || '');
    }

    _activateApp(appId) {
      if (appId === 'site-workspace' && window.siteWorkspaceLauncher?.openPanel) {
        window.siteWorkspaceLauncher.openPanel().catch(error => console.warn('[DockManager] 打开网站工作区失败:', error));
        return true;
      }
      if (appId === 'chatbot' && window.Chatbot?.open) {
        window.Chatbot.open();
        return true;
      }
      if (appId === 'quick-nav' && window.quickNavManager?.open) {
        window.quickNavManager.open();
        return true;
      }
      const app = this.apps.get(appId);
      const button = app ? document.getElementById(app.dockBtnId) : null;
      if (!button) return false;
      button.click();
      return true;
    }

    _moveDockApp(appId, direction) {
      const currentIndex = this.config.items.findIndex(item => item.type === 'app' && item.appId === appId);
      if (currentIndex < 0) return false;
      const appIndices = this.config.items
        .map((item, index) => item.type === 'app' ? index : -1)
        .filter(index => index >= 0);
      const position = appIndices.indexOf(currentIndex);
      const targetIndex = appIndices[position + direction];
      if (targetIndex == null) return false;
      this.reorderDock(currentIndex, targetIndex);
      return true;
    }

    _filterLaunchpad(query) {
      const grid = this.launchpadEl?.querySelector('#dock-launchpad-grid');
      if (!grid) return;
      const q = query.toLowerCase().trim();
      window.ProductUIV5?.setBusinessPage?.('launchpad', q ? 'search' : (this._launchpadCategory === 'all' ? 'all-apps' : 'category'));
      let visibleCount = 0;

      grid.querySelectorAll('.dock-launchpad-app').forEach(card => {
        const appId = card.dataset.appId;
        const app = this.apps.get(appId);
        const matchesCategory = this._launchpadCategory === 'all' || app?.category === this._launchpadCategory;
        const searchText = `${app?.name || ''} ${app?.summary || ''} ${appId}`.toLowerCase();
        const match = matchesCategory && (!q || searchText.includes(q));
        card.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
      });

      grid.querySelectorAll('.dock-launchpad-category').forEach(cat => {
        const visibleApps = cat.querySelectorAll('.dock-launchpad-app:not([style*="display: none"])');
        cat.style.display = visibleApps.length ? '' : 'none';
      });

      const recentSection = this.launchpadEl.querySelector('#dock-launchpad-recent');
      if (recentSection) recentSection.style.display = (!q && this._launchpadCategory === 'all' && !recentSection.hidden) ? '' : 'none';
      const empty = this.launchpadEl.querySelector('#dock-launchpad-empty');
      if (empty) empty.hidden = visibleCount > 0;
      const count = this.launchpadEl.querySelector('#dock-launchpad-count');
      const pinnedCount = grid.querySelectorAll('.dock-launchpad-app.in-dock').length;
      if (count) count.textContent = `${visibleCount} 个功能 · ${pinnedCount} 个已固定`;
    }

    _getRecentAppIds() {
      if (Array.isArray(this._recentAppIds)) return this._recentAppIds;
      try {
        const value = JSON.parse(localStorage.getItem(RECENT_APPS_KEY) || '[]');
        this._recentAppIds = Array.isArray(value) ? value : [];
      } catch {
        this._recentAppIds = [];
      }
      return this._recentAppIds;
    }

    _recordRecentApp(appId) {
      const ids = this._getRecentAppIds().filter(id => id !== appId);
      ids.unshift(appId);
      this._recentAppIds = ids.slice(0, 8);
      try { localStorage.setItem(RECENT_APPS_KEY, JSON.stringify(this._recentAppIds)); } catch { /* ignore */ }
    }

    toggleLaunchpad() {
      if (this.launchpadEl?.classList.contains('open')) {
        this.hideLaunchpad();
      } else {
        this.showLaunchpad();
      }
    }

    showLaunchpad() {
      if (!this.launchpadEl?.classList.contains('open')) this._launchpadReturnFocus = document.activeElement;
      window.ProductUIV5?.setBusinessPage?.('launchpad', 'all-apps');
      this._updateLaunchpad();
      this._positionLaunchpad();
      this._setLaunchpadBackgroundInert(true);
      this.launchpadEl.inert = false;
      this.launchpadEl.setAttribute('aria-hidden', 'false');
      this.launchpadEl?.classList.add('open');
      const search = this.launchpadEl?.querySelector('#dock-launchpad-search');
      if (search) {
        search.value = '';
        this._filterLaunchpad('');
        setTimeout(() => search.focus(), 100);
      }
    }

    hideLaunchpad(restoreFocus = true, restoreShell = true) {
      this.launchpadEl?.classList.remove('open');
      this.launchpadEl?.setAttribute('aria-hidden', 'true');
      if (this.launchpadEl) this.launchpadEl.inert = true;
      this._setLaunchpadBackgroundInert(false);
      if (restoreShell) window.ProductUIV5?.setShellPage?.('home');
      if (restoreFocus) {
        const fallback = document.getElementById('dock-launchpad-btn');
        (this._launchpadReturnFocus?.isConnected ? this._launchpadReturnFocus : fallback)?.focus?.({ preventScroll: true });
      }
      this._launchpadReturnFocus = null;
    }

    _setLaunchpadBackgroundInert(active) {
      if (active) {
        if (this._launchpadBackgroundInert.length) return;
        this._launchpadBackgroundInert = [...document.body.children]
          .filter(child => child !== this.launchpadEl && !child.inert);
        this._launchpadBackgroundInert.forEach(child => { child.inert = true; });
        return;
      }
      this._launchpadBackgroundInert.forEach(child => { child.inert = false; });
      this._launchpadBackgroundInert = [];
    }

    _handleLaunchpadKeydown(event) {
      if (!this.launchpadEl?.classList.contains('open') || document.getElementById('dock-context-menu')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.hideLaunchpad();
        return;
      }
      if (event.key !== 'Tab') return;
      const content = this.launchpadEl.querySelector('.dock-launchpad-content');
      const focusable = [...content.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
        .filter(element => !element.hidden && element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!content.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    _positionLaunchpad() {
      const content = this.launchpadEl?.querySelector('.dock-launchpad-content');
      if (!content || !this.dockEl) return;

      const dockRect = this.dockEl.getBoundingClientRect();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;

      content.style.position = 'fixed';
      content.style.margin = '0';

      const maxH = Math.min(vpH * 0.84, 780);
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

      const contentW = Math.min(1080, vpW - 32);
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
