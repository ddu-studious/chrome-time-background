/**
 * BlogManager — 个人博客/写作空间
 * 底部抽屉 + Jiayuan Thoughts 双栏风格
 * 数据存储在 chrome.storage.local，入口：底部 Dock 栏「写作」按钮
 */
class BlogManager {
    constructor() {
        this._posts = [];
        this._initialized = false;
        this._drawerOpen = false;
        this._drawerEl = null;
        this._reopenChip = null;
        this._escHandler = null;

        this._currentView = 'list';     // list | editor | detail
        this._editingPost = null;
        this._filterCategory = 'all';
        this._filterTag = 'all';
        this._searchQuery = '';

        this.CATEGORIES = [
            { id: 'tech',    name: '技术', icon: 'fa-code',        color: '#2196F3' },
            { id: 'reading', name: '阅读', icon: 'fa-book',        color: '#4CAF50' },
            { id: 'think',   name: '思考', icon: 'fa-lightbulb',   color: '#FF9800' },
            { id: 'essay',   name: '随笔', icon: 'fa-feather-alt', color: '#9C27B0' },
            { id: 'weekly',  name: '周报', icon: 'fa-calendar-alt',color: '#00BCD4' },
            { id: 'draft',   name: '草稿箱',icon: 'fa-box-open',   color: '#9E9E9E' },
        ];

        this.STORAGE_KEY = 'blogPosts';
        this._drawerVh = 62;
    }

    // ─── 初始化 ───
    async init() {
        if (this._initialized) return;
        await this._loadData();
        this._initialized = true;
        this._updateDockBadge();
        console.log('[Blog] 初始化完成，文章数:', this._posts.length);
    }

    // ─── 数据加载/保存 ───
    async _loadData() {
        const data = await new Promise(r =>
            chrome.storage.local.get([this.STORAGE_KEY], r)
        );
        this._posts = Array.isArray(data[this.STORAGE_KEY]) ? data[this.STORAGE_KEY] : [];
    }

    async _savePosts() {
        await chrome.storage.local.set({ [this.STORAGE_KEY]: this._posts });
    }

    // ─── 工具函数 ───
    _todayStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _genId() {
        return 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    _formatDate(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _formatDateTime(ts) {
        const d = new Date(ts);
        return `${this._formatDate(ts)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    _wordCount(text) {
        if (!text) return 0;
        const clean = text.replace(/[#*>`\-\[\]()!_~]/g, '').trim();
        const cn = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
        const en = clean.replace(/[\u4e00-\u9fa5]/g, '').split(/\s+/).filter(Boolean).length;
        return cn + en;
    }

    _esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
    }

    _escHtml(s) {
        return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    _syntaxHighlightJson(json, indent = 2) {
        const str = typeof json === 'string' ? json : JSON.stringify(json, null, indent);
        return this._escHtml(str).replace(
            /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?|\bnull\b)/g,
            (match) => {
                if (/^"/.test(match)) {
                    if (/:$/.test(match)) {
                        return `<span class="jk">${match}</span>`;
                    }
                    return `<span class="js">${match}</span>`;
                }
                if (/true|false/.test(match)) return `<span class="jb">${match}</span>`;
                if (/null/.test(match)) return `<span class="jnull">${match}</span>`;
                return `<span class="jn">${match}</span>`;
            }
        );
    }

    _tryParseJson(text) {
        if (!text || typeof text !== 'string') return null;
        const t = text.trim();
        if (!(t.startsWith('{') || t.startsWith('['))) return null;
        try {
            return JSON.parse(t);
        } catch (_) {
            return null;
        }
    }

    _buildJsonViewer(jsonObj, rawText) {
        const formatted = JSON.stringify(jsonObj, null, 2);
        const highlighted = this._syntaxHighlightJson(jsonObj);
        const lines = formatted.split('\n').length;
        const collapsed = lines > 15;
        const uid = 'jv_' + Math.random().toString(36).slice(2, 6);
        return `<div class="blog-json-viewer" id="${uid}">
            <div class="blog-json-header">
                <div class="blog-json-header-left">
                    <span class="blog-json-badge">JSON</span>
                    <span>${lines} 行</span>
                </div>
                <div class="blog-json-actions">
                    ${collapsed ? `<button type="button" class="blog-json-act-btn" data-jact="toggle" data-target="${uid}"><i class="fas fa-expand-alt"></i> 展开</button>` : ''}
                    <button type="button" class="blog-json-act-btn" data-jact="copy" data-raw="${this._escHtml(formatted)}"><i class="fas fa-copy"></i> 复制</button>
                </div>
            </div>
            <pre class="blog-json-body ${collapsed ? 'collapsed' : ''}" data-body="${uid}">${highlighted}</pre>
        </div>`;
    }

    _enhanceRenderedHtml(container) {
        container.querySelectorAll('pre').forEach(pre => {
            if (pre.closest('.blog-json-viewer')) return;

            if (!pre.querySelector('.blog-code-copy')) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'blog-code-copy';
                btn.innerHTML = '<i class="fas fa-copy"></i> 复制';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const code = pre.querySelector('code')?.textContent || pre.textContent;
                    navigator.clipboard.writeText(code).then(() => {
                        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            btn.innerHTML = '<i class="fas fa-copy"></i> 复制';
                            btn.classList.remove('copied');
                        }, 1800);
                    });
                });
                pre.appendChild(btn);
            }
        });

        container.querySelectorAll('[data-jact]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.jact;
                if (action === 'copy') {
                    const raw = btn.dataset.raw;
                    navigator.clipboard.writeText(raw).then(() => {
                        const orig = btn.innerHTML;
                        btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                        btn.classList.add('copied');
                        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1800);
                    });
                }
                if (action === 'toggle') {
                    const target = btn.dataset.target;
                    const body = document.querySelector(`[data-body="${target}"]`);
                    if (body) {
                        const isCollapsed = body.classList.toggle('collapsed');
                        btn.innerHTML = isCollapsed
                            ? '<i class="fas fa-expand-alt"></i> 展开'
                            : '<i class="fas fa-compress-alt"></i> 收起';
                    }
                }
            });
        });
    }

    _renderMarkdown(text) {
        if (!text) return '';

        const jsonObj = this._tryParseJson(text);
        if (jsonObj) {
            return this._buildJsonViewer(jsonObj, text);
        }

        let rendered = text;
        if (window.MarkdownRenderer && typeof window.MarkdownRenderer.render === 'function') {
            rendered = window.MarkdownRenderer.render(text);
        } else if (typeof marked !== 'undefined') {
            rendered = marked.parse(text);
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rendered;

        tempDiv.querySelectorAll('pre code').forEach(code => {
            const raw = code.textContent;
            const parsed = this._tryParseJson(raw);
            if (parsed) {
                const viewer = document.createElement('div');
                viewer.innerHTML = this._buildJsonViewer(parsed, raw);
                code.closest('pre').replaceWith(viewer.firstElementChild);
            }
        });

        return tempDiv.innerHTML;
    }

    _getCategoryById(id) {
        return this.CATEGORIES.find(c => c.id === id) || this.CATEGORIES[5];
    }

    _getAllTags() {
        const tagMap = {};
        this._posts.forEach(p => {
            (p.tags || []).forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
        });
        return Object.entries(tagMap).sort((a, b) => b[1] - a[1]);
    }

    // ─── CRUD ───
    createPost(data) {
        const post = {
            id: this._genId(),
            title: data.title || '无标题',
            content: data.content || '',
            category: data.category || 'essay',
            tags: data.tags || [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            wordCount: this._wordCount(data.content),
            pinned: false,
        };
        this._posts.unshift(post);
        this._savePosts();
        this._updateDockBadge();
        return post;
    }

    updatePost(id, data) {
        const post = this._posts.find(p => p.id === id);
        if (!post) return null;
        if (data.title !== undefined) post.title = data.title;
        if (data.content !== undefined) {
            post.content = data.content;
            post.wordCount = this._wordCount(data.content);
        }
        if (data.category !== undefined) post.category = data.category;
        if (data.tags !== undefined) post.tags = data.tags;
        if (data.pinned !== undefined) post.pinned = data.pinned;
        post.updatedAt = Date.now();
        this._savePosts();
        return post;
    }

    deletePost(id) {
        this._posts = this._posts.filter(p => p.id !== id);
        this._savePosts();
        this._updateDockBadge();
    }

    getPost(id) {
        return this._posts.find(p => p.id === id) || null;
    }

    // ─── 统计 ───
    getStats() {
        const total = this._posts.length;
        const byCategory = {};
        this.CATEGORIES.forEach(c => { byCategory[c.id] = 0; });
        let totalWords = 0;
        this._posts.forEach(p => {
            if (byCategory[p.category] !== undefined) byCategory[p.category]++;
            totalWords += (p.wordCount || 0);
        });
        const streak = this._calcStreak();
        return { total, byCategory, totalWords, streak };
    }

    _calcStreak() {
        const dates = new Set(this._posts.map(p => this._formatDate(p.createdAt)));
        let streak = 0;
        const d = new Date();
        for (let i = 0; i < 365; i++) {
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (dates.has(ds)) { streak++; } else { break; }
            d.setDate(d.getDate() - 1);
        }
        return streak;
    }

    _getStreakDots(count) {
        const today = new Date();
        const dates = new Set(this._posts.map(p => this._formatDate(p.createdAt)));
        let html = '';
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const on = dates.has(ds) ? ' on' : '';
            const td = i === 0 ? ' today' : '';
            html += `<span class="${on}${td}" title="${ds}"></span>`;
        }
        return html;
    }

    // ─── 筛选 ───
    _getFilteredPosts() {
        let list = [...this._posts];
        if (this._filterCategory !== 'all') {
            list = list.filter(p => p.category === this._filterCategory);
        }
        if (this._filterTag !== 'all') {
            list = list.filter(p => (p.tags || []).includes(this._filterTag));
        }
        if (this._searchQuery) {
            const q = this._searchQuery.toLowerCase();
            list = list.filter(p =>
                (p.title || '').toLowerCase().includes(q) ||
                (p.content || '').toLowerCase().includes(q) ||
                (p.tags || []).some(t => t.toLowerCase().includes(q))
            );
        }
        list.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updatedAt - a.updatedAt;
        });
        return list;
    }

    // ─── Dock 徽标 ───
    _updateDockBadge() {
        const btn = document.getElementById('blog-dock-btn');
        if (!btn) return;
        const stats = this.getStats();
        let badge = btn.querySelector('.blog-dock-badge');
        if (stats.streak > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'blog-dock-badge';
                btn.appendChild(badge);
            }
            badge.textContent = `${stats.streak}🔥`;
            badge.title = `连续写作 ${stats.streak} 天`;
        } else if (badge) {
            badge.remove();
        }
    }

    // ═══════════════════════════════════════════
    //  底部抽屉 — 打开 / 关闭 / 切换
    // ═══════════════════════════════════════════
    toggle() {
        if (this._drawerOpen) this.closeDrawer(); else this.openDrawer();
    }

    get isOpen() { return this._drawerOpen; }

    openDrawer() {
        if (this._drawerOpen) return;
        this._drawerOpen = true;
        this._currentView = 'list';
        this._editingPost = null;
        this._buildDrawer();
    }

    closeDrawer() {
        if (!this._drawerOpen) return;
        this._drawerOpen = false;
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        if (this._drawerEl) {
            this._drawerEl.classList.remove('open');
            setTimeout(() => { this._drawerEl?.remove(); this._drawerEl = null; }, 400);
        }
        this._showReopenChip(false);
        const btn = document.getElementById('blog-dock-btn');
        if (btn) btn.classList.remove('active');
    }

    _collapseDrawer() {
        if (this._drawerEl) this._drawerEl.classList.remove('open');
        this._showReopenChip(true);
    }

    _expandDrawer() {
        if (this._drawerEl) this._drawerEl.classList.add('open');
        this._showReopenChip(false);
    }

    _showReopenChip(show) {
        if (!this._reopenChip) {
            this._reopenChip = document.createElement('button');
            this._reopenChip.type = 'button';
            this._reopenChip.className = 'blog-reopen-chip';
            this._reopenChip.innerHTML = '<i class="fas fa-pen-nib"></i> 打开写作空间';
            this._reopenChip.addEventListener('click', () => this._expandDrawer());
            document.body.appendChild(this._reopenChip);
        }
        if (show) {
            requestAnimationFrame(() => this._reopenChip.classList.add('visible'));
        } else {
            this._reopenChip.classList.remove('visible');
        }
    }

    // ─── 构建抽屉 DOM ───
    _buildDrawer() {
        if (this._drawerEl) this._drawerEl.remove();

        const drawer = document.createElement('div');
        drawer.className = 'blog-drawer';
        drawer.style.setProperty('--blog-drawer-h', this._drawerVh + 'vh');
        drawer.innerHTML = `
            <div class="blog-drawer-panel">
                <div class="blog-drag-zone" data-role="drag">
                    <div class="blog-drag-handle"></div>
                </div>
                <div class="blog-topbar">
                    <div class="blog-topbar-left">
                        <div class="blog-topbar-title"><i class="fas fa-pen-nib" style="color:#d4a843"></i> 写作空间</div>
                        <div class="blog-topbar-stats" id="blog-topbar-stats"></div>
                    </div>
                    <div class="blog-topbar-actions">
                        <button type="button" class="blog-tb-btn primary" data-action="new-post"><i class="fas fa-plus"></i> 写一篇</button>
                        <button type="button" class="blog-tb-btn" data-action="collapse" title="收起">收起 <i class="fas fa-chevron-down" style="font-size:10px"></i></button>
                        <button type="button" class="blog-tb-btn" data-action="fullscreen" title="全屏">全屏 <i class="fas fa-expand" style="font-size:10px"></i></button>
                        <button type="button" class="blog-tb-btn danger" data-action="close" title="关闭"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="blog-body">
                    <div class="blog-sidebar" id="blog-sidebar"></div>
                    <div class="blog-content" id="blog-content"></div>
                </div>
            </div>
        `;
        this._drawerEl = drawer;
        document.body.appendChild(drawer);

        this._renderTopbarStats();
        this._renderSidebar();
        this._renderContent();
        this._bindDrawerEvents();

        requestAnimationFrame(() => requestAnimationFrame(() => drawer.classList.add('open')));

        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                if (this._currentView !== 'list') {
                    this._switchView('list');
                } else {
                    this.closeDrawer();
                }
            }
        };
        document.addEventListener('keydown', this._escHandler);

        const btn = document.getElementById('blog-dock-btn');
        if (btn) btn.classList.add('active');
        this._showReopenChip(false);
    }

    _bindDrawerEvents() {
        const panel = this._drawerEl;
        if (!panel) return;

        // 顶栏按钮
        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            switch (btn.dataset.action) {
                case 'new-post':
                    this._editingPost = null;
                    this._switchView('editor');
                    break;
                case 'collapse':
                    this._collapseDrawer();
                    break;
                case 'fullscreen':
                    this._drawerVh = 92;
                    panel.style.setProperty('--blog-drawer-h', '92vh');
                    break;
                case 'close':
                    this.closeDrawer();
                    break;
            }
        });

        // 拖拽调高
        const dragZone = panel.querySelector('[data-role="drag"]');
        let dragging = false, startY = 0, startVh = 0;

        const onMove = (e) => {
            if (!dragging) return;
            const dy = e.clientY - startY;
            const deltaVh = -(dy / window.innerHeight) * 100;
            this._drawerVh = Math.max(36, Math.min(92, startVh + deltaVh));
            panel.style.setProperty('--blog-drawer-h', this._drawerVh + 'vh');
        };
        const onUp = (e) => {
            dragging = false;
            try { if (e?.pointerId != null) dragZone.releasePointerCapture(e.pointerId); } catch (_) {}
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        dragZone.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            dragging = true;
            startY = e.clientY;
            startVh = this._drawerVh;
            try { dragZone.setPointerCapture(e.pointerId); } catch (_) {}
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            e.preventDefault();
        });
    }

    // ─── 顶栏统计 ───
    _renderTopbarStats() {
        const el = this._drawerEl?.querySelector('#blog-topbar-stats');
        if (!el) return;
        const stats = this.getStats();
        const dots = this._getStreakDots(7);
        el.innerHTML = `
            <div class="blog-streak-mini">${dots}</div>
            ${stats.streak > 0 ? `<span class="streak-fire">🔥 ${stats.streak} 天</span>` : ''}
            <span>${stats.total} 篇 · ${stats.totalWords.toLocaleString()} 字</span>
        `;
    }

    // ═══════════════════════════════════════════
    //  左侧边栏 — Jiayuan 风格导航
    // ═══════════════════════════════════════════
    _renderSidebar() {
        const el = this._drawerEl?.querySelector('#blog-sidebar');
        if (!el) return;
        const stats = this.getStats();
        const allTags = this._getAllTags();

        const navItems = [
            { id: 'all', name: '全部文章', icon: 'fa-list', count: stats.total },
            ...this.CATEGORIES.map(c => ({
                id: c.id, name: c.name, icon: c.icon, count: stats.byCategory[c.id] || 0
            }))
        ];

        const navHtml = navItems.map(n =>
            `<button type="button" class="blog-nav-item ${this._filterCategory === n.id ? 'active' : ''}" data-nav="${n.id}">
                <i class="fas ${n.icon}"></i> ${n.name}
                <span class="blog-nav-count">${n.count}</span>
            </button>`
        ).join('');

        const tagsHtml = allTags.slice(0, 20).map(([tag, count]) =>
            `<button type="button" class="blog-sidebar-tag ${this._filterTag === tag ? 'active' : ''}" data-tag="${tag}">#${tag}</button>`
        ).join('');

        el.innerHTML = `
            <div class="blog-sidebar-header">
                <div class="blog-sidebar-brand"><em>Thoughts</em></div>
                <div class="blog-sidebar-tagline">Read, Write, Think.</div>
            </div>
            <nav class="blog-sidebar-nav">${navHtml}</nav>
            ${tagsHtml ? `
                <div class="blog-sidebar-tags">
                    <div class="blog-sidebar-tags-title">Tags</div>
                    <div class="blog-sidebar-tag-list">
                        <button type="button" class="blog-sidebar-tag ${this._filterTag === 'all' ? 'active' : ''}" data-tag="all">全部</button>
                        ${tagsHtml}
                    </div>
                </div>
            ` : ''}
            <div class="blog-sidebar-footer">&copy; ${new Date().getFullYear()} 写作空间</div>
        `;

        // 绑定事件
        el.querySelectorAll('[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._filterCategory = btn.dataset.nav;
                this._currentView = 'list';
                this._renderSidebar();
                this._renderContent();
            });
        });
        el.querySelectorAll('[data-tag]').forEach(btn => {
            btn.addEventListener('click', () => {
                this._filterTag = btn.dataset.tag;
                this._currentView = 'list';
                this._renderSidebar();
                this._renderContent();
            });
        });
    }

    // ═══════════════════════════════════════════
    //  右侧内容区 — 列表/详情/编辑器
    // ═══════════════════════════════════════════
    _renderContent() {
        const el = this._drawerEl?.querySelector('#blog-content');
        if (!el) return;
        switch (this._currentView) {
            case 'list':    this._renderListView(el); break;
            case 'detail':  this._renderDetailView(el); break;
            case 'editor':  this._renderEditorView(el); break;
        }
    }

    _switchView(view, postId) {
        this._currentView = view;
        if (postId) this._editingPost = this.getPost(postId);
        this._renderContent();
    }

    // ─── 列表视图 — Jiayuan 风格 ───
    _renderListView(container) {
        const posts = this._getFilteredPosts();
        const catLabel = this._filterCategory === 'all'
            ? 'Posts'
            : this._getCategoryById(this._filterCategory).name;

        let postsHtml;
        if (posts.length > 0) {
            postsHtml = posts.map(p => {
                const cat = this._getCategoryById(p.category);
                return `
                    <div class="blog-post-row" data-id="${p.id}">
                        ${p.pinned ? '<i class="fas fa-thumbtack blog-post-pin"></i>' : ''}
                        <span class="blog-post-date">${this._formatDate(p.updatedAt)}</span>
                        <span class="blog-post-cat-dot" style="background:${cat.color}" title="${cat.name}"></span>
                        <span class="blog-post-link">${this._esc(p.title)}</span>
                        <span class="blog-post-words">${p.wordCount || 0} 字</span>
                    </div>`;
            }).join('');
        } else {
            postsHtml = `
                <div class="blog-list-empty">
                    <i class="fas fa-feather-alt"></i>
                    <p>还没有文章，开始写点什么吧</p>
                    <button type="button" class="blog-list-empty-btn" data-action="new-post">写一篇</button>
                </div>`;
        }

        container.innerHTML = `
            <div class="blog-list-view">
                <div class="blog-list-header">
                    <h1 class="blog-list-title">${catLabel}</h1>
                    <div class="blog-search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="搜索文章..." value="${this._esc(this._searchQuery)}" />
                    </div>
                </div>
                ${postsHtml}
            </div>
        `;

        // 事件绑定
        container.querySelectorAll('.blog-post-row').forEach(row => {
            row.addEventListener('click', () => this._switchView('detail', row.dataset.id));
        });

        const newPostBtn = container.querySelector('[data-action="new-post"]');
        if (newPostBtn) {
            newPostBtn.addEventListener('click', () => {
                this._editingPost = null;
                this._switchView('editor');
            });
        }

        const searchInput = container.querySelector('.blog-search-box input');
        if (searchInput) {
            let timer;
            searchInput.addEventListener('input', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    this._searchQuery = searchInput.value.trim();
                    this._renderContent();
                }, 200);
            });
            if (this._searchQuery) {
                setTimeout(() => {
                    searchInput.focus();
                    searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
                }, 50);
            }
        }
    }

    // ─── 详情视图 — Jiayuan 排版 ───
    _renderDetailView(container) {
        const post = this._editingPost;
        if (!post) { this._switchView('list'); return; }

        const cat = this._getCategoryById(post.category);
        const tags = (post.tags || []).map(t => `<span class="blog-detail-tag">#${t}</span>`).join('');

        const rendered = this._renderMarkdown(post.content || '');

        container.innerHTML = `
            <div class="blog-detail-view">
                <button type="button" class="blog-detail-back" data-action="back">
                    <i class="fas fa-arrow-left"></i> 返回列表
                </button>
                <h1 class="blog-detail-h1">${this._esc(post.title)}</h1>
                <div class="blog-detail-meta">
                    <span class="blog-detail-meta-cat" style="color:${cat.color}">
                        <i class="fas ${cat.icon}"></i> ${cat.name}
                    </span>
                    <span>·</span>
                    <time>${this._formatDateTime(post.createdAt)}</time>
                    ${post.updatedAt !== post.createdAt ? `<span>· 更新于 ${this._formatDateTime(post.updatedAt)}</span>` : ''}
                    <span>· ${post.wordCount || 0} 字</span>
                </div>
                ${tags ? `<div class="blog-detail-tags">${tags}</div>` : ''}
                <div class="blog-detail-actions">
                    <button type="button" class="blog-detail-act-btn" data-action="edit">
                        <i class="fas fa-edit"></i> 编辑
                    </button>
                    <button type="button" class="blog-detail-act-btn" data-action="copy-all">
                        <i class="fas fa-copy"></i> 复制全文
                    </button>
                    <button type="button" class="blog-detail-act-btn" data-action="pin">
                        <i class="fas fa-thumbtack"></i> ${post.pinned ? '取消置顶' : '置顶'}
                    </button>
                    <button type="button" class="blog-detail-act-btn danger" data-action="delete">
                        <i class="fas fa-trash-alt"></i> 删除
                    </button>
                </div>
                <div class="blog-article-body">${rendered}</div>
            </div>
        `;

        this._enhanceRenderedHtml(container.querySelector('.blog-article-body'));

        container.querySelector('[data-action="back"]')?.addEventListener('click', () => this._switchView('list'));
        container.querySelector('[data-action="edit"]')?.addEventListener('click', () => this._switchView('editor'));
        container.querySelector('[data-action="copy-all"]')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            navigator.clipboard.writeText(post.content || '').then(() => {
                const orig = btn.innerHTML;
                btn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                setTimeout(() => { btn.innerHTML = orig; }, 1800);
            });
        });
        container.querySelector('[data-action="pin"]')?.addEventListener('click', () => {
            this.updatePost(post.id, { pinned: !post.pinned });
            this._editingPost = this.getPost(post.id);
            this._renderContent();
            this._renderSidebar();
        });
        container.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
            if (confirm('确认删除这篇文章？')) {
                this.deletePost(post.id);
                this._editingPost = null;
                this._switchView('list');
                this._renderSidebar();
                this._renderTopbarStats();
            }
        });
    }

    // ─── 编辑器视图 — 左编辑/右预览 ───
    _renderEditorView(container) {
        const post = this._editingPost;
        const title = post?.title || '';
        const content = post?.content || '';
        const category = post?.category || 'essay';
        const tags = (post?.tags || []).join(', ');

        const catOptions = this.CATEGORIES.map(c =>
            `<option value="${c.id}" ${category === c.id ? 'selected' : ''}>${c.name}</option>`
        ).join('');

        const previewHtml = this._renderMarkdown(content);

        container.innerHTML = `
            <div class="blog-editor-view">
                <div class="blog-editor-head">
                    <button type="button" class="blog-editor-back" data-action="back">
                        <i class="fas fa-arrow-left"></i> 返回
                    </button>
                    <input type="text" class="blog-editor-title-input" id="blog-ed-title"
                           placeholder="标题" value="${this._esc(title)}" />
                    <div class="blog-editor-meta-row">
                        <select class="blog-editor-select" id="blog-ed-cat">${catOptions}</select>
                        <input type="text" class="blog-editor-tag-input" id="blog-ed-tags"
                               placeholder="标签（逗号分隔）" value="${this._esc(tags)}" />
                        <span class="blog-editor-wc" id="blog-ed-wc">${this._wordCount(content)} 字</span>
                    </div>
                </div>
                <div class="blog-editor-split">
                    <div class="blog-editor-left">
                        <textarea class="blog-editor-textarea" id="blog-ed-body"
                                  placeholder="开始写作...\n\n支持 Markdown 语法">${this._esc(content)}</textarea>
                    </div>
                    <div class="blog-editor-right">
                        <div class="blog-article-body" id="blog-ed-preview">${previewHtml || '<p style="color:#bbb">预览区</p>'}</div>
                    </div>
                </div>
                <div class="blog-editor-foot">
                    <button type="button" class="blog-save-btn" data-action="save">
                        <i class="fas fa-check"></i> 保存
                    </button>
                </div>
            </div>
        `;

        const edPreview = container.querySelector('#blog-ed-preview');
        if (edPreview) this._enhanceRenderedHtml(edPreview);

        // 事件绑定
        container.querySelector('[data-action="back"]')?.addEventListener('click', () => {
            if (post) { this._switchView('detail', post.id); }
            else { this._switchView('list'); }
        });

        container.querySelector('[data-action="save"]')?.addEventListener('click', () => this._saveFromEditor());

        const bodyEl = container.querySelector('#blog-ed-body');
        const wcEl = container.querySelector('#blog-ed-wc');
        const previewEl = container.querySelector('#blog-ed-preview');

        if (bodyEl) {
            let debounce;
            bodyEl.addEventListener('input', () => {
                if (wcEl) wcEl.textContent = this._wordCount(bodyEl.value) + ' 字';
                clearTimeout(debounce);
                debounce = setTimeout(() => {
                    if (!previewEl) return;
                    previewEl.innerHTML = this._renderMarkdown(bodyEl.value) || '<p style="color:#bbb">预览区</p>';
                    this._enhanceRenderedHtml(previewEl);
                }, 300);
            });
        }

        // Ctrl+S
        container.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this._saveFromEditor();
            }
        });

        setTimeout(() => {
            const titleInput = container.querySelector('#blog-ed-title');
            if (titleInput && !titleInput.value) titleInput.focus();
            else bodyEl?.focus();
        }, 100);
    }

    _saveFromEditor() {
        const el = this._drawerEl;
        if (!el) return;
        const title = el.querySelector('#blog-ed-title')?.value.trim() || '无标题';
        const content = el.querySelector('#blog-ed-body')?.value || '';
        const category = el.querySelector('#blog-ed-cat')?.value || 'essay';
        const tagsStr = el.querySelector('#blog-ed-tags')?.value || '';
        const tags = tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean);

        if (this._editingPost) {
            this.updatePost(this._editingPost.id, { title, content, category, tags });
        } else {
            this._editingPost = this.createPost({ title, content, category, tags });
        }

        this._switchView('detail', this._editingPost.id);
        this._renderSidebar();
        this._renderTopbarStats();
    }
}

window.blogManager = new BlogManager();
