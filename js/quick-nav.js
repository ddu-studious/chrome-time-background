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
      this._loadLinks();
      this._createPanel();
      this._bindDockButton();
    }

    _loadLinks() {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        this.links = stored ? JSON.parse(stored) : [...DEFAULT_LINKS];
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
      el.innerHTML = `
        <div class="quick-nav-overlay"></div>
        <div class="quick-nav-content">
          <div class="quick-nav-header">
            <span class="quick-nav-title"><i class="fas fa-compass"></i> 快捷导航</span>
            <div class="quick-nav-header-actions">
              <button class="quick-nav-add-btn" title="添加快捷方式"><i class="fas fa-plus"></i></button>
              <button class="quick-nav-close-btn" title="关闭"><i class="fas fa-times"></i></button>
            </div>
          </div>
          <div class="quick-nav-search-wrap">
            <i class="fas fa-search"></i>
            <input type="text" class="quick-nav-search" placeholder="搜索或输入网址...">
          </div>
          <div class="quick-nav-grid"></div>
          <div class="quick-nav-add-form" style="display:none">
            <input type="text" class="quick-nav-input-name" placeholder="名称">
            <input type="url" class="quick-nav-input-url" placeholder="https://...">
            <div class="quick-nav-form-actions">
              <button class="quick-nav-form-cancel">取消</button>
              <button class="quick-nav-form-save">添加</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(el);
      this.panelEl = el;

      el.querySelector('.quick-nav-overlay').addEventListener('click', () => this.close());
      el.querySelector('.quick-nav-close-btn').addEventListener('click', () => this.close());
      el.querySelector('.quick-nav-add-btn').addEventListener('click', () => this._showAddForm());

      const searchInput = el.querySelector('.quick-nav-search');
      searchInput.addEventListener('input', (e) => this._handleSearch(e.target.value));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this._handleSearchSubmit(e.target.value);
        }
      });

      const form = el.querySelector('.quick-nav-add-form');
      form.querySelector('.quick-nav-form-cancel').addEventListener('click', () => this._hideAddForm());
      form.querySelector('.quick-nav-form-save').addEventListener('click', () => this._saveNewLink());

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen) {
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
      this.isOpen = true;
      this.panelEl.classList.add('open');
      this._renderGrid();
      setTimeout(() => {
        this.panelEl.querySelector('.quick-nav-search').focus();
      }, 200);
    }

    close() {
      this.isOpen = false;
      this.panelEl.classList.remove('open');
      this.panelEl.querySelector('.quick-nav-search').value = '';
      this._hideAddForm();
      this._renderGrid();
    }

    _renderGrid(filter = '') {
      const grid = this.panelEl.querySelector('.quick-nav-grid');
      const lowerFilter = filter.toLowerCase();
      const filtered = lowerFilter
        ? this.links.filter(l => l.name.toLowerCase().includes(lowerFilter) || l.url.toLowerCase().includes(lowerFilter))
        : this.links;

      if (filtered.length === 0 && filter) {
        grid.innerHTML = `
          <div class="quick-nav-empty">
            <p>未找到匹配结果</p>
            <p class="quick-nav-empty-hint">按 Enter 打开: <strong>${filter}</strong></p>
          </div>
        `;
        return;
      }

      grid.innerHTML = filtered.map(link => `
        <a class="quick-nav-item" href="${this._escapeHtml(link.url)}" target="_blank" data-id="${link.id}" title="${this._escapeHtml(link.url)}">
          <div class="quick-nav-item-icon" style="background:${link.color || '#6366f1'}">
            <i class="${link.icon || 'fas fa-globe'}"></i>
          </div>
          <span class="quick-nav-item-name">${this._escapeHtml(link.name)}</span>
          <button class="quick-nav-item-delete" data-id="${link.id}" title="删除"><i class="fas fa-times"></i></button>
        </a>
      `).join('');

      grid.querySelectorAll('.quick-nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.quick-nav-item-delete')) return;
          this.close();
        });
      });

      grid.querySelectorAll('.quick-nav-item-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.dataset.id;
          this._removeLink(id);
        });
      });
    }

    _handleSearch(value) {
      this._renderGrid(value);
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

    _showAddForm() {
      const form = this.panelEl.querySelector('.quick-nav-add-form');
      form.style.display = 'block';
      form.querySelector('.quick-nav-input-name').value = '';
      form.querySelector('.quick-nav-input-url').value = '';
      form.querySelector('.quick-nav-input-name').focus();
    }

    _hideAddForm() {
      this.panelEl.querySelector('.quick-nav-add-form').style.display = 'none';
    }

    _saveNewLink() {
      const nameInput = this.panelEl.querySelector('.quick-nav-input-name');
      const urlInput = this.panelEl.querySelector('.quick-nav-input-url');
      const name = nameInput.value.trim();
      let url = urlInput.value.trim();

      if (!name || !url) return;

      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      const id = 'custom-' + Date.now();
      this.links.push({
        id,
        name,
        url,
        icon: 'fas fa-globe',
        color: this._randomColor(),
      });
      this._saveLinks();
      this._hideAddForm();
      this._renderGrid();
    }

    _removeLink(id) {
      this.links = this.links.filter(l => l.id !== id);
      this._saveLinks();
      this._renderGrid(this.panelEl.querySelector('.quick-nav-search').value);
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
    document.addEventListener('DOMContentLoaded', () => new QuickNavManager());
  } else {
    new QuickNavManager();
  }

  window.QuickNavManager = QuickNavManager;
})();
