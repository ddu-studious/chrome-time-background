/**
 * Quick Nav - 快捷导航面板
 * 从 Dock 打开，上拉展示用户配置的快捷网页列表，支持搜索和直接跳转
 */
;(function() {
  'use strict';

  const STORAGE_KEY = 'quickNavLinks';
  const DEFAULT_LINKS = [
    { id: 'github', name: 'GitHub', url: 'https://github.com', icon: 'fab fa-github', color: '#333' },
    { id: 'google', name: 'Google', url: 'https://www.google.com', icon: 'fab fa-google', color: '#4285f4' },
    { id: 'notion', name: 'Notion', url: 'https://www.notion.so', icon: 'fas fa-book', color: '#000' },
    { id: 'feishu', name: '飞书', url: 'https://www.feishu.cn', icon: 'fas fa-feather-alt', color: '#3370ff' },
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'fas fa-comment-dots', color: '#10a37f' },
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com', icon: 'fab fa-youtube', color: '#ff0000' },
  ];

  class QuickNavManager {
    constructor() {
      this.links = [];
      this.panelEl = null;
      this.isOpen = false;
      this.editingId = null;
      this._returnFocus = null;
      this._subviewReturnFocus = null;
      this._backgroundInertSiblings = [];
      this._pendingRemoval = null;
      this._removalTimer = null;
      this._loadLinks();
      this._createPanel();
      this._bindDockButton();
    }

    _loadLinks() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : DEFAULT_LINKS;
        const source = Array.isArray(parsed) ? parsed : DEFAULT_LINKS;
        const usedIds = new Set();
        this.links = source
          .map((link, index) => this._sanitizeLink(link, `saved-${index}`))
          .filter(Boolean)
          .map((link, index) => ({
            ...link,
            id: this._claimId(link.id, `saved-${index}`, usedIds),
          }));
      } catch {
        this.links = [...DEFAULT_LINKS];
      }
    }

    _saveLinks() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.links));
      } catch { /* ignore */ }
    }

    _createPanel() {
      const el = document.createElement('div');
      el.id = 'quick-nav-panel';
      el.className = 'quick-nav-panel';
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `
        <div class="quick-nav-overlay"></div>
        <div class="quick-nav-content" role="dialog" aria-modal="true" aria-labelledby="quick-nav-dialog-title">
          <div class="quick-nav-header">
            <span class="quick-nav-title" id="quick-nav-dialog-title"><i class="fas fa-compass"></i> 快捷导航</span>
            <div class="quick-nav-header-actions">
              <button class="quick-nav-import-btn" type="button" title="导入快捷方式" aria-label="导入快捷方式" aria-controls="quick-nav-import-form" aria-expanded="false"><i class="fas fa-file-import"></i></button>
              <button class="quick-nav-add-btn" type="button" title="添加快捷方式" aria-label="添加快捷方式" aria-controls="quick-nav-add-form" aria-expanded="false"><i class="fas fa-plus"></i></button>
              <button class="quick-nav-close-btn" type="button" title="关闭" aria-label="关闭快捷导航"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <div class="quick-nav-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="quick-nav-search" placeholder="搜索或输入网址..." aria-label="搜索快捷方式或输入网址" aria-controls="quick-nav-grid">
            <span class="quick-nav-search-status" role="status" aria-live="polite" aria-atomic="true"></span>
          </div>
          <div class="quick-nav-grid" id="quick-nav-grid"></div>
          <div class="quick-nav-add-form" id="quick-nav-add-form" role="group" aria-labelledby="quick-nav-form-title" aria-hidden="true" hidden>
            <div class="quick-nav-form-title" id="quick-nav-form-title">添加快捷方式</div>
            <input type="text" class="quick-nav-input-name" placeholder="名称" aria-label="快捷方式名称">
            <input type="url" class="quick-nav-input-url" placeholder="https://..." aria-label="快捷方式网址">
            <div class="quick-nav-form-status" role="status" aria-live="polite" aria-atomic="true"></div>
            <div class="quick-nav-form-actions">
              <button class="quick-nav-form-cancel" type="button">取消</button>
              <button class="quick-nav-form-save" type="button">添加</button>
            </div>
          </div>
          <div class="quick-nav-import-form" id="quick-nav-import-form" role="group" aria-labelledby="quick-nav-import-title" aria-hidden="true" hidden>
            <div class="quick-nav-form-title" id="quick-nav-import-title">导入快捷方式</div>
            <p>粘贴 JSON 数组，每项至少包含 name 和 url。</p>
            <textarea class="quick-nav-import-json" rows="6" aria-label="快捷方式 JSON" placeholder='[{"name":"产品文档","url":"https://example.com"}]'></textarea>
            <div class="quick-nav-import-status" role="status" aria-live="polite" aria-atomic="true"></div>
            <div class="quick-nav-form-actions">
              <button class="quick-nav-import-cancel" type="button">取消</button>
              <button class="quick-nav-import-save" type="button">确认导入</button>
            </div>
          </div>
          <div class="quick-nav-toast" hidden>
            <span class="quick-nav-toast-message" role="status" aria-live="polite" aria-atomic="true"></span>
            <button class="quick-nav-toast-undo" type="button">撤销</button>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      this.panelEl = el;

      el.querySelector('.quick-nav-overlay').addEventListener('click', () => this.close());
      el.querySelector('.quick-nav-close-btn').addEventListener('click', () => this.close());
      el.querySelector('.quick-nav-add-btn').addEventListener('click', () => this._showAddForm());
      el.querySelector('.quick-nav-import-btn').addEventListener('click', () => this._showImportForm());

      const searchInput = el.querySelector('.quick-nav-search');
      searchInput.addEventListener('input', (e) => this._handleSearch(e.target.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this._handleSearchSubmit(e.target.value);
        }
      });

      const form = el.querySelector('.quick-nav-add-form');
      form.querySelector('.quick-nav-form-cancel').addEventListener('click', () => this._hideAddForm({ restoreFocus: true }));
      form.querySelector('.quick-nav-form-save').addEventListener('click', () => this._saveNewLink());
      form.querySelectorAll('input').forEach(input => input.addEventListener('input', () => {
        input.removeAttribute('aria-invalid');
        form.querySelector('.quick-nav-form-status').textContent = '';
      }));
      const importForm = el.querySelector('.quick-nav-import-form');
      importForm.querySelector('.quick-nav-import-cancel').addEventListener('click', () => this._hideImportForm({ restoreFocus: true }));
      importForm.querySelector('.quick-nav-import-save').addEventListener('click', () => this._importLinks());
      el.querySelector('.quick-nav-toast-undo').addEventListener('click', () => this._undoRemove());

      document.addEventListener('keydown', (e) => {
        if (!this.isOpen) return;
        if (e.key === 'Tab') {
          this._trapFocus(this._activeFocusSurface(), e);
          return;
        }
        if (e.key !== 'Escape') return;
        const addForm = this.panelEl.querySelector('.quick-nav-add-form');
        const importForm = this.panelEl.querySelector('.quick-nav-import-form');
        if (!addForm.hidden) {
          this._hideAddForm({ restoreFocus: true });
        } else if (!importForm.hidden) {
          this._hideImportForm({ restoreFocus: true });
        } else {
          this.close();
        }
      });

      this._renderGrid();
    }

    _bindDockButton() {
      const observer = new MutationObserver(() => {
        const btn = document.getElementById('quick-nav-dock-btn');
        if (btn && !btn._quickNavBound) {
          btn._quickNavBound = true;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
          });
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });

      const btn = document.getElementById('quick-nav-dock-btn');
      if (btn) {
        btn._quickNavBound = true;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggle();
        });
      }
    }

    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    open() {
      if (this.isOpen) return;
      this._returnFocus = document.activeElement;
      this.isOpen = true;
      this.panelEl.classList.add('open');
      this.panelEl.setAttribute('aria-hidden', 'false');
      this._setBackgroundInert(true);
      this._renderGrid();
      this._setProductPage(this.links.length ? 'default' : 'import-empty');
      setTimeout(() => {
        this.panelEl.querySelector('.quick-nav-search').focus();
      }, 200);
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.panelEl.classList.remove('open');
      this.panelEl.setAttribute('aria-hidden', 'true');
      this.panelEl.querySelector('.quick-nav-search').value = '';
      this._hideAddForm({ restorePage: false });
      this._hideImportForm({ restorePage: false });
      this._hideUndoToast({ clearPending: true });
      this._renderGrid();
      window.ProductUIV5?.setShellPage?.('home');
      this._setBackgroundInert(false);
      const trigger = document.getElementById('quick-nav-dock-btn');
      const fallback = trigger && getComputedStyle(trigger).display !== 'none'
        ? trigger
        : document.getElementById('dock-launchpad-btn');
      const returnTarget = this._isUsableFocusTarget(this._returnFocus) ? this._returnFocus : fallback;
      this._returnFocus = null;
      this._subviewReturnFocus = null;
      requestAnimationFrame(() => returnTarget?.focus?.({ preventScroll: true }));
    }

    _setProductPage(page) {
      window.ProductUIV5?.setBusinessPage?.('quick-nav', page);
    }

    _restoreProductPage() {
      const query = this.panelEl.querySelector('.quick-nav-search')?.value.trim();
      this._setProductPage(query ? 'command-search' : (this.links.length ? 'default' : 'import-empty'));
    }

    _renderGrid(filter = '') {
      const grid = this.panelEl.querySelector('.quick-nav-grid');
      const lowerFilter = filter.toLowerCase();
      const filtered = lowerFilter
        ? this.links.filter(l => l.name.toLowerCase().includes(lowerFilter) || l.url.toLowerCase().includes(lowerFilter))
        : this.links;
      const searchStatus = this.panelEl.querySelector('.quick-nav-search-status');
      if (searchStatus) searchStatus.textContent = `${filtered.length} 项`;

      if (filtered.length === 0 && filter) {
        const safeFilter = this._escapeHtml(filter);
        grid.innerHTML = `
          <div class="quick-nav-empty">
            <p>未找到匹配结果</p>
            <p class="quick-nav-empty-hint">按 Enter 打开: <strong>${safeFilter}</strong></p>
          </div>
        `;
        return;
      }

      if (filtered.length === 0) {
        grid.innerHTML = `<div class="quick-nav-empty quick-nav-empty-library"><i class="fas fa-compass"></i><p>还没有快捷方式</p><p class="quick-nav-empty-hint">添加一个常用网址，或从 JSON 批量导入。</p><button type="button" class="quick-nav-empty-add">添加第一个</button><button type="button" class="quick-nav-empty-import">导入</button></div>`;
        grid.querySelector('.quick-nav-empty-add').addEventListener('click', () => this._showAddForm());
        grid.querySelector('.quick-nav-empty-import').addEventListener('click', () => this._showImportForm());
        this._setProductPage('import-empty');
        return;
      }

      grid.innerHTML = filtered.map(link => {
        const safeId = this._escapeHtml(link.id);
        const safeName = this._escapeHtml(link.name);
        const safeUrl = this._escapeHtml(link.url);
        const safeIcon = this._escapeHtml(this._safeIcon(link.icon));
        const safeColor = this._escapeHtml(this._safeColor(link.color));
        return `
        <div class="quick-nav-item" data-id="${safeId}">
          <a class="quick-nav-item-open" href="${safeUrl}" target="_blank" rel="noopener noreferrer" title="打开 ${safeName}：${safeUrl}">
            <div class="quick-nav-item-icon" style="background:${safeColor}">
              <i class="${safeIcon}"></i>
            </div>
            <span class="quick-nav-item-name">${safeName}</span>
          </a>
          <button class="quick-nav-item-edit" type="button" data-id="${safeId}" title="编辑" aria-label="编辑 ${safeName}"><i class="fas fa-pen"></i></button>
          <button class="quick-nav-item-delete" type="button" data-id="${safeId}" title="删除" aria-label="删除 ${safeName}"><i class="fas fa-times"></i></button>
        </div>
      `;
      }).join('');

      grid.querySelectorAll('.quick-nav-item-open').forEach(link => link.addEventListener('click', () => this.close()));

      grid.querySelectorAll('.quick-nav-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.dataset.id;
          this._removeLink(id);
        });
      });
      grid.querySelectorAll('.quick-nav-item-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._showAddForm(btn.dataset.id);
        });
      });
    }

    _handleSearch(value) {
      this._renderGrid(value);
      this._setProductPage(value.trim() ? 'command-search' : (this.links.length ? 'default' : 'import-empty'));
    }

    _handleSearchSubmit(value) {
      const trimmed = value.trim();
      if (!trimmed) return;

      const matchedLink = this.links.find(l =>
        l.name.toLowerCase() === trimmed.toLowerCase() ||
        l.url.toLowerCase().includes(trimmed.toLowerCase())
      );

      if (matchedLink) {
        window.open(matchedLink.url, '_blank');
        this.close();
        return;
      }

      let url = trimmed;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        if (url.includes('.') && !url.includes(' ')) {
          url = 'https://' + url;
        } else {
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }
      window.open(url, '_blank');
      this.close();
    }

    _showAddForm(linkId = null) {
      this._hideImportForm({ restorePage: false });
      const form = this.panelEl.querySelector('.quick-nav-add-form');
      const link = linkId ? this.links.find(item => item.id === linkId) : null;
      this._subviewReturnFocus = document.activeElement;
      this.editingId = link?.id || null;
      form.hidden = false;
      form.setAttribute('aria-hidden', 'false');
      this.panelEl.querySelector('.quick-nav-content')?.classList.add('quick-nav-subview-open');
      this.panelEl.querySelector('.quick-nav-add-btn')?.setAttribute('aria-expanded', 'true');
      form.querySelector('.quick-nav-form-title').textContent = link ? '编辑快捷方式' : '添加快捷方式';
      form.querySelector('.quick-nav-form-save').textContent = link ? '保存' : '添加';
      form.querySelector('.quick-nav-input-name').value = link?.name || '';
      form.querySelector('.quick-nav-input-url').value = link?.url || '';
      form.querySelectorAll('input').forEach(input => input.removeAttribute('aria-invalid'));
      form.querySelector('.quick-nav-form-status').textContent = '';
      form.querySelector('.quick-nav-input-name').focus();
      this._setProductPage('create-edit');
    }

    _hideAddForm({ restorePage = true, restoreFocus = false } = {}) {
      const form = this.panelEl.querySelector('.quick-nav-add-form');
      form.hidden = true;
      form.setAttribute('aria-hidden', 'true');
      this.panelEl.querySelector('.quick-nav-add-btn')?.setAttribute('aria-expanded', 'false');
      this.editingId = null;
      this._syncSubviewClass();
      if (restorePage && this.isOpen) this._restoreProductPage();
      if (restoreFocus) this._restoreSubviewFocus(this.panelEl.querySelector('.quick-nav-add-btn'));
    }

    _saveNewLink() {
      const nameInput = this.panelEl.querySelector('.quick-nav-input-name');
      const urlInput = this.panelEl.querySelector('.quick-nav-input-url');
      const name = nameInput.value.trim();
      const rawUrl = urlInput.value.trim();
      const status = this.panelEl.querySelector('.quick-nav-form-status');

      if (!name) {
        this._showFormError(status, nameInput, '请输入快捷方式名称');
        return;
      }
      if (!rawUrl) {
        this._showFormError(status, urlInput, '请输入网址');
        return;
      }
      const url = this._normalizeHttpUrl(rawUrl);
      if (!url) {
        this._showFormError(status, urlInput, '请输入有效的 HTTP 或 HTTPS 网址');
        return;
      }
      const duplicate = this.links.find(link => link.id !== this.editingId && this._urlKey(link.url) === this._urlKey(url));
      if (duplicate) {
        this._showFormError(status, urlInput, `该网址已存在：${duplicate.name}`);
        return;
      }

      let savedId = this.editingId;
      if (savedId) {
        const link = this.links.find(item => item.id === savedId);
        if (link) Object.assign(link, { name, url });
      } else {
        const id = 'custom-' + Date.now();
        this.links.push({ id, name, url, icon: 'fas fa-globe', color: this._randomColor() });
        savedId = id;
      }
      this._saveLinks();
      this.panelEl.querySelector('.quick-nav-search').value = '';
      this._hideAddForm({ restorePage: false });
      this._renderGrid();
      this._setProductPage('default');
      requestAnimationFrame(() => this.panelEl.querySelector(`.quick-nav-item[data-id="${savedId}"] .quick-nav-item-open`)?.focus());
    }

    _showImportForm() {
      this._hideAddForm({ restorePage: false });
      const form = this.panelEl.querySelector('.quick-nav-import-form');
      this._subviewReturnFocus = document.activeElement;
      form.hidden = false;
      form.setAttribute('aria-hidden', 'false');
      this.panelEl.querySelector('.quick-nav-content')?.classList.add('quick-nav-subview-open');
      this.panelEl.querySelector('.quick-nav-import-btn')?.setAttribute('aria-expanded', 'true');
      form.querySelector('.quick-nav-import-json').value = '';
      form.querySelector('.quick-nav-import-status').textContent = '';
      form.querySelector('.quick-nav-import-json').focus();
      this._setProductPage('import-empty');
    }

    _hideImportForm({ restorePage = true, restoreFocus = false } = {}) {
      const form = this.panelEl?.querySelector('.quick-nav-import-form');
      if (form) {
        form.hidden = true;
        form.setAttribute('aria-hidden', 'true');
      }
      this.panelEl?.querySelector('.quick-nav-import-btn')?.setAttribute('aria-expanded', 'false');
      this._syncSubviewClass();
      if (restorePage && this.isOpen) this._restoreProductPage();
      if (restoreFocus) this._restoreSubviewFocus(this.panelEl?.querySelector('.quick-nav-import-btn'));
    }

    _syncSubviewClass() {
      const content = this.panelEl?.querySelector('.quick-nav-content');
      const hasSubview = !this.panelEl?.querySelector('.quick-nav-add-form')?.hidden
        || !this.panelEl?.querySelector('.quick-nav-import-form')?.hidden;
      content?.classList.toggle('quick-nav-subview-open', hasSubview);
    }

    _restoreSubviewFocus(fallback) {
      const target = this._isUsableFocusTarget(this._subviewReturnFocus) ? this._subviewReturnFocus : fallback;
      this._subviewReturnFocus = null;
      requestAnimationFrame(() => target?.focus?.({ preventScroll: true }));
    }

    _setBackgroundInert(active) {
      if (active) {
        if (this._backgroundInertSiblings.length) return;
        this._backgroundInertSiblings = [...document.body.children]
          .filter(child => child !== this.panelEl && !child.inert);
        this._backgroundInertSiblings.forEach(child => { child.inert = true; });
        return;
      }
      this._backgroundInertSiblings.forEach(child => { child.inert = false; });
      this._backgroundInertSiblings = [];
    }

    _activeFocusSurface() {
      const addForm = this.panelEl.querySelector('.quick-nav-add-form');
      if (!addForm.hidden) return addForm;
      const importForm = this.panelEl.querySelector('.quick-nav-import-form');
      return !importForm.hidden
        ? importForm
        : this.panelEl.querySelector('.quick-nav-content');
    }

    _trapFocus(container, event) {
      const focusable = [...(container?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])]
        .filter(element => this._isUsableFocusTarget(element));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    _isUsableFocusTarget(element) {
      return !!(element?.isConnected && !element.closest('[aria-hidden="true"]') && getComputedStyle(element).display !== 'none');
    }

    _importLinks() {
      const form = this.panelEl.querySelector('.quick-nav-import-form');
      const status = form.querySelector('.quick-nav-import-status');
      try {
        const parsed = JSON.parse(form.querySelector('.quick-nav-import-json').value.trim());
        if (!Array.isArray(parsed)) throw new Error('JSON 顶层必须是数组');
        const existing = new Set(this.links.map(link => this._urlKey(link.url)));
        const usedIds = new Set(this.links.map(link => link.id));
        const valid = parsed.filter(item => item && typeof item.name === 'string' && typeof item.url === 'string')
          .map(item => {
            const rawUrl = item.url.trim();
            const url = this._normalizeHttpUrl(rawUrl);
            const fallbackId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            return {
              id: this._claimId(item.id, fallbackId, usedIds),
              name: item.name.trim(),
              url: url || '',
              icon: this._safeIcon(item.icon),
              color: this._safeColor(item.color || this._randomColor()),
            };
          })
          .filter(item => {
            const key = this._urlKey(item.url);
            if (!item.name || !item.url || existing.has(key)) return false;
            existing.add(key);
            return true;
          });
        if (!valid.length) throw new Error('没有可导入的新快捷方式');
        this.links.push(...valid);
        this._saveLinks();
        const firstImportedId = valid[0].id;
        this._hideImportForm({ restorePage: false });
        this._renderGrid();
        this._setProductPage('default');
        requestAnimationFrame(() => this.panelEl.querySelector(`.quick-nav-item[data-id="${firstImportedId}"] .quick-nav-item-open`)?.focus());
      } catch (error) {
        status.textContent = error.message || '导入失败，请检查 JSON';
      }
    }

    _removeLink(id) {
      const index = this.links.findIndex(link => link.id === id);
      if (index < 0) return;
      if (this._removalTimer) clearTimeout(this._removalTimer);
      this._pendingRemoval = { link: this.links[index], index };
      this.links.splice(index, 1);
      this._saveLinks();
      this._renderGrid(this.panelEl.querySelector('.quick-nav-search').value);
      const toast = this.panelEl.querySelector('.quick-nav-toast');
      toast.hidden = false;
      toast.querySelector('.quick-nav-toast-message').textContent = `已移除“${this._pendingRemoval.link.name}”`;
      requestAnimationFrame(() => toast.querySelector('.quick-nav-toast-undo')?.focus());
      this._removalTimer = setTimeout(() => this._hideUndoToast({ clearPending: true }), 6000);
    }

    _undoRemove() {
      const pending = this._pendingRemoval;
      if (!pending) return;
      this.links.splice(Math.min(pending.index, this.links.length), 0, pending.link);
      this._saveLinks();
      this._hideUndoToast({ clearPending: true });
      this._renderGrid(this.panelEl.querySelector('.quick-nav-search').value);
      requestAnimationFrame(() => {
        const restored = this.panelEl.querySelector(`.quick-nav-item[data-id="${pending.link.id}"] .quick-nav-item-open`);
        (restored || this.panelEl.querySelector('.quick-nav-search'))?.focus();
      });
    }

    _hideUndoToast({ clearPending = false } = {}) {
      if (this._removalTimer) clearTimeout(this._removalTimer);
      this._removalTimer = null;
      const toast = this.panelEl?.querySelector('.quick-nav-toast');
      if (toast) {
        toast.hidden = true;
        toast.querySelector('.quick-nav-toast-message').textContent = '';
      }
      if (clearPending) this._pendingRemoval = null;
    }

    _showFormError(status, input, message) {
      status.textContent = message;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }

    _normalizeHttpUrl(rawUrl) {
      const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
      if (!trimmed) return null;
      const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      try {
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return null;
        return candidate;
      } catch {
        return null;
      }
    }

    _urlKey(url) {
      try {
        return new URL(url).href;
      } catch {
        return String(url || '');
      }
    }

    _sanitizeLink(link, fallbackId) {
      if (!link || typeof link.name !== 'string') return null;
      const url = this._normalizeHttpUrl(link.url);
      const name = link.name.trim();
      if (!name || !url) return null;
      return {
        id: this._safeId(link.id) || fallbackId,
        name,
        url,
        icon: this._safeIcon(link.icon),
        color: this._safeColor(link.color),
      };
    }

    _safeId(id) {
      const value = typeof id === 'string' ? id.trim() : '';
      return /^[a-z0-9][a-z0-9_-]{0,80}$/i.test(value) ? value : '';
    }

    _claimId(candidate, fallback, usedIds) {
      const safeCandidate = this._safeId(candidate);
      const safeFallback = this._safeId(fallback) || `link-${Date.now()}`;
      let id = safeCandidate && !usedIds.has(safeCandidate) ? safeCandidate : safeFallback;
      let suffix = 2;
      while (usedIds.has(id)) id = `${safeFallback}-${suffix++}`;
      usedIds.add(id);
      return id;
    }

    _safeIcon(icon) {
      const value = typeof icon === 'string' ? icon.trim() : '';
      return /^(?:fas|far|fab) fa-[a-z0-9-]+$/i.test(value) ? value : 'fas fa-globe';
    }

    _safeColor(color) {
      const value = typeof color === 'string' ? color.trim() : '';
      return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#6366f1';
    }

    _randomColor() {
      const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    _escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { window.quickNavManager = new QuickNavManager(); });
  } else {
    window.quickNavManager = new QuickNavManager();
  }

  window.QuickNavManager = QuickNavManager;
})();
