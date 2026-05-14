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
            { id: 'agent',   name: 'Agent', icon: 'fa-robot',      color: '#7C3AED' },
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

        this._enhanceImages(container);
    }

    _enhanceImages(container) {
        container.querySelectorAll('img').forEach(img => {
            if (img.closest('.blog-img-resizable')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'blog-img-resizable';
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);

            if (img.style.width) {
                wrapper.style.width = img.style.width;
            }

            const handle = document.createElement('div');
            handle.className = 'blog-img-resize-handle';
            wrapper.appendChild(handle);

            const toolbar = document.createElement('div');
            toolbar.className = 'blog-img-toolbar';
            toolbar.innerHTML = `
                <button type="button" data-size="25">25%</button>
                <button type="button" data-size="50">50%</button>
                <button type="button" data-size="75">75%</button>
                <button type="button" data-size="100">100%</button>
                <input type="text" class="blog-img-width-input" placeholder="宽度">
                <span class="blog-img-size-label">px</span>
            `;
            wrapper.appendChild(toolbar);

            let clickTimer = null;
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
                clickTimer = setTimeout(() => {
                    clickTimer = null;
                    container.querySelectorAll('.blog-img-resizable.active').forEach(w => {
                        if (w !== wrapper) w.classList.remove('active');
                    });
                    wrapper.classList.toggle('active');
                    if (wrapper.classList.contains('active')) {
                        const input = toolbar.querySelector('.blog-img-width-input');
                        input.value = Math.round(img.offsetWidth);
                    }
                }, 250);
            });

            img.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
                this._showImageLightbox(img.src, container);
            });

            toolbar.querySelectorAll('button[data-size]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const pct = parseInt(btn.dataset.size);
                    const containerWidth = container.offsetWidth;
                    const newWidth = Math.round(containerWidth * pct / 100);
                    img.style.width = newWidth + 'px';
                    img.style.height = 'auto';
                    wrapper.style.width = newWidth + 'px';
                    toolbar.querySelector('.blog-img-width-input').value = newWidth;
                    toolbar.querySelectorAll('button[data-size]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._syncImageSizeToEditor(img);
                });
            });

            const widthInput = toolbar.querySelector('.blog-img-width-input');
            widthInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = parseInt(widthInput.value);
                    if (val > 0) {
                        img.style.width = val + 'px';
                        img.style.height = 'auto';
                        wrapper.style.width = val + 'px';
                        toolbar.querySelectorAll('button[data-size]').forEach(b => b.classList.remove('active'));
                        this._syncImageSizeToEditor(img);
                    }
                }
            });
            widthInput.addEventListener('click', (e) => e.stopPropagation());

            this._bindImageDragResize(wrapper, img, handle, toolbar, container);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.blog-img-resizable')) {
                container.querySelectorAll('.blog-img-resizable.active').forEach(w => {
                    w.classList.remove('active');
                });
            }
        }, { once: false });
    }

    _showImageLightbox(src, container) {
        const allImgs = container ? Array.from(container.querySelectorAll('img')).map(i => i.src) : [src];
        let currentIdx = allImgs.indexOf(src);
        if (currentIdx < 0) currentIdx = 0;

        const overlay = document.createElement('div');
        overlay.className = 'blog-lightbox';
        overlay.innerHTML = `
            <div class="blog-lightbox-backdrop"></div>
            <div class="blog-lightbox-content">
                <img class="blog-lightbox-img" src="${src}" alt="">
                ${allImgs.length > 1 ? `
                    <button class="blog-lightbox-nav blog-lightbox-prev" title="上一张"><i class="fas fa-chevron-left"></i></button>
                    <button class="blog-lightbox-nav blog-lightbox-next" title="下一张"><i class="fas fa-chevron-right"></i></button>
                    <div class="blog-lightbox-counter">${currentIdx + 1} / ${allImgs.length}</div>
                ` : ''}
                <div class="blog-lightbox-toolbar">
                    <button class="blog-lightbox-btn" data-act="zoom-in" title="放大"><i class="fas fa-search-plus"></i></button>
                    <button class="blog-lightbox-btn" data-act="zoom-out" title="缩小"><i class="fas fa-search-minus"></i></button>
                    <button class="blog-lightbox-btn" data-act="reset" title="重置"><i class="fas fa-expand"></i></button>
                    <button class="blog-lightbox-btn" data-act="close" title="关闭"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('blog-lightbox-visible'));

        const imgEl = overlay.querySelector('.blog-lightbox-img');
        const counter = overlay.querySelector('.blog-lightbox-counter');
        let scale = 1;

        const updateImg = () => {
            imgEl.src = allImgs[currentIdx];
            imgEl.style.transform = `scale(${scale})`;
            if (counter) counter.textContent = `${currentIdx + 1} / ${allImgs.length}`;
        };

        const close = () => {
            overlay.classList.remove('blog-lightbox-visible');
            setTimeout(() => overlay.remove(), 250);
        };

        overlay.querySelector('.blog-lightbox-backdrop').addEventListener('click', close);
        overlay.querySelector('[data-act="close"]')?.addEventListener('click', close);

        overlay.querySelector('[data-act="zoom-in"]')?.addEventListener('click', () => {
            scale = Math.min(5, scale * 1.3);
            imgEl.style.transform = `scale(${scale})`;
        });
        overlay.querySelector('[data-act="zoom-out"]')?.addEventListener('click', () => {
            scale = Math.max(0.2, scale / 1.3);
            imgEl.style.transform = `scale(${scale})`;
        });
        overlay.querySelector('[data-act="reset"]')?.addEventListener('click', () => {
            scale = 1;
            imgEl.style.transform = `scale(1)`;
        });

        overlay.querySelector('.blog-lightbox-prev')?.addEventListener('click', () => {
            currentIdx = (currentIdx - 1 + allImgs.length) % allImgs.length;
            scale = 1;
            updateImg();
        });
        overlay.querySelector('.blog-lightbox-next')?.addEventListener('click', () => {
            currentIdx = (currentIdx + 1) % allImgs.length;
            scale = 1;
            updateImg();
        });

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') { currentIdx = (currentIdx - 1 + allImgs.length) % allImgs.length; scale = 1; updateImg(); }
            if (e.key === 'ArrowRight') { currentIdx = (currentIdx + 1) % allImgs.length; scale = 1; updateImg(); }
            if (e.key === '+' || e.key === '=') { scale = Math.min(5, scale * 1.3); imgEl.style.transform = `scale(${scale})`; }
            if (e.key === '-') { scale = Math.max(0.2, scale / 1.3); imgEl.style.transform = `scale(${scale})`; }
        });
        overlay.tabIndex = 0;
        overlay.focus();

        imgEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) scale = Math.min(5, scale * 1.1);
            else scale = Math.max(0.2, scale / 1.1);
            imgEl.style.transform = `scale(${scale})`;
        });
    }

    _bindImageDragResize(wrapper, img, handle, toolbar, container) {
        let dragging = false, startX = 0, startWidth = 0;

        const onPointerDown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            startX = e.clientX;
            startWidth = img.offsetWidth;
            wrapper.classList.add('active');
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        };

        const onPointerMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const maxWidth = container.offsetWidth;
            const newWidth = Math.max(60, Math.min(maxWidth, startWidth + dx));
            img.style.width = newWidth + 'px';
            img.style.height = 'auto';
            wrapper.style.width = newWidth + 'px';
            toolbar.querySelector('.blog-img-width-input').value = Math.round(newWidth);
            toolbar.querySelectorAll('button[data-size]').forEach(b => b.classList.remove('active'));
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            this._syncImageSizeToEditor(img);
        };

        handle.addEventListener('pointerdown', onPointerDown);
    }

    _syncImageSizeToEditor(img) {
        const bodyEl = this._drawerEl?.querySelector('#blog-ed-body');
        if (!bodyEl) return;

        const src = img.getAttribute('src');
        const width = Math.round(img.offsetWidth);
        if (!src || !width) return;

        const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const htmlImgRegex = new RegExp(
            `<img\\s[^>]*src=["']${escapedSrc}["'][^>]*/?>`,
            'g'
        );
        const mdImgRegex = new RegExp(
            `!\\[([^\\]]*)\\]\\(${escapedSrc}\\)`,
            'g'
        );

        let text = bodyEl.value;
        const newTag = `<img src="${src}" alt="${img.alt || ''}" width="${width}" style="width:${width}px">`;

        if (htmlImgRegex.test(text)) {
            text = text.replace(htmlImgRegex, newTag);
        } else if (mdImgRegex.test(text)) {
            text = text.replace(mdImgRegex, newTag);
        }

        bodyEl.value = text;
        bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _renderMarkdown(text) {
        if (!text) return '';

        const jsonObj = this._tryParseJson(text);
        if (jsonObj) {
            return this._buildJsonViewer(jsonObj, text);
        }

        let processed = this._escapeBackslashesOutsideCode(text);

        let rendered = processed;
        if (window.MarkdownRenderer && typeof window.MarkdownRenderer.render === 'function') {
            rendered = window.MarkdownRenderer.render(processed);
        } else if (typeof marked !== 'undefined') {
            rendered = marked.parse(processed);
        }

        rendered = this._renderHighlightColors(rendered);

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

    /**
     * 保护代码块外的反斜杠不被 marked 当作转义符吃掉。
     * 策略：将文本按代码块（```...```）分段，仅对非代码块段中的
     * 孤立反斜杠 `\` 替换为 `\\`，让 marked 渲染后保留一个 `\`。
     */
    _escapeBackslashesOutsideCode(text) {
        if (!text || !text.includes('\\')) return text;

        const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
        return parts.map((part, i) => {
            if (i % 2 === 1) return part;
            return part.replace(/\\(?!\\)/g, '\\\\');
        }).join('');
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

    // ─── 从 Markdown 源码提取标题 ───
    _extractHeadings(markdown) {
        if (!markdown) return [];
        const lines = markdown.split('\n');
        const headings = [];
        let inCodeBlock = false;
        lines.forEach((line, idx) => {
            if (line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; return; }
            if (inCodeBlock) return;
            const match = line.match(/^(#{2,4})\s+(.+)/);
            if (match) {
                const text = match[2].replace(/[*_`~\[\]]/g, '').trim();
                headings.push({
                    level: match[1].length,
                    text,
                    id: 'toc-h-' + idx,
                });
            }
        });
        return headings;
    }

    // ─── 将 heading ID 注入渲染后的 HTML ───
    _injectHeadingIds(articleEl, headings) {
        const hEls = articleEl.querySelectorAll('h2, h3, h4');
        let hIdx = 0;
        hEls.forEach(el => {
            if (hIdx < headings.length) {
                el.id = headings[hIdx].id;
                hIdx++;
            }
        });
    }

    // ─── 构建 TOC 侧边栏 HTML ───
    _buildTocHtml(headings) {
        if (!headings.length) return '';
        const items = headings.map(h =>
            `<a class="blog-toc-item blog-toc-h${h.level}" href="#${h.id}" data-target="${h.id}">${this._esc(h.text)}</a>`
        ).join('');
        return `
            <nav class="blog-toc-sidebar">
                <div class="blog-toc-title">目录</div>
                <div class="blog-toc-list">${items}</div>
                <div class="blog-toc-progress"><div class="blog-toc-progress-bar"></div></div>
            </nav>`;
    }

    // ─── 绑定 TOC 交互：点击跳转 + 滚动高亮 ───
    _bindTocInteraction(container) {
        const tocEl = container.querySelector('.blog-toc-sidebar');
        const scrollHost = container.querySelector('.blog-detail-view');
        if (!tocEl || !scrollHost) return;

        const tocItems = tocEl.querySelectorAll('.blog-toc-item');
        const progressBar = tocEl.querySelector('.blog-toc-progress-bar');
        if (!tocItems.length) return;

        tocItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = item.dataset.target;
                const target = scrollHost.querySelector('#' + targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        const updateActiveHeading = () => {
            const scrollTop = scrollHost.scrollTop;
            const scrollHeight = scrollHost.scrollHeight - scrollHost.clientHeight;
            if (progressBar && scrollHeight > 0) {
                progressBar.style.width = Math.min(100, (scrollTop / scrollHeight) * 100) + '%';
            }

            let activeId = '';
            const headingEls = scrollHost.querySelectorAll('h2[id], h3[id], h4[id]');
            for (const el of headingEls) {
                if (el.offsetTop - scrollHost.offsetTop <= scrollTop + 60) {
                    activeId = el.id;
                } else {
                    break;
                }
            }

            tocItems.forEach(item => {
                const isActive = item.dataset.target === activeId;
                item.classList.toggle('active', isActive);
                if (isActive) item.scrollIntoView({ block: 'nearest' });
            });
        };

        scrollHost.addEventListener('scroll', updateActiveHeading, { passive: true });
        updateActiveHeading();
    }

    // ─── 详情视图 — Jiayuan 排版 ───
    _renderDetailView(container) {
        const post = this._editingPost;
        if (!post) { this._switchView('list'); return; }

        const cat = this._getCategoryById(post.category);
        const tags = (post.tags || []).map(t => `<span class="blog-detail-tag">#${t}</span>`).join('');

        const rendered = this._renderMarkdown(post.content || '');
        const headings = this._extractHeadings(post.content || '');
        const hasToc = headings.length >= 2;

        container.innerHTML = `
            <div class="blog-detail-wrapper${hasToc ? ' has-toc' : ''}">
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
                ${hasToc ? this._buildTocHtml(headings) : ''}
            </div>
        `;

        const articleBody = container.querySelector('.blog-article-body');
        this._enhanceRenderedHtml(articleBody);

        if (hasToc) {
            this._injectHeadingIds(articleBody, headings);
            this._bindTocInteraction(container);
        }

        const detailView = container.querySelector('.blog-detail-view');
        if (detailView) {
            detailView.addEventListener('dblclick', (e) => {
                if (e.target.closest('.blog-detail-actions') || e.target.closest('.blog-detail-back') || e.target.closest('a') || e.target.closest('button')) return;
                if (e.target.closest('.blog-img-resizable') || e.target.tagName === 'IMG') return;
                this._switchView('editor');
            });
            detailView.classList.add('blog-detail-dblclick-hint');
        }

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
                                  placeholder="开始写作...\n\n支持 Markdown 语法\n选中文字弹出格式菜单\n输入 / 唤起插入菜单\n支持粘贴图片自动上传">${this._esc(content)}</textarea>
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

        this._bindEditorEnhancements(container);

        setTimeout(() => {
            const titleInput = container.querySelector('#blog-ed-title');
            if (titleInput && !titleInput.value) titleInput.focus();
            else bodyEl?.focus();
        }, 100);
    }

    _saveFromEditor() {
        if (this._currentView !== 'editor') return;
        const el = this._drawerEl;
        if (!el) return;
        const bodyEl = el.querySelector('#blog-ed-body');
        if (!bodyEl) return;
        const title = el.querySelector('#blog-ed-title')?.value.trim() || '无标题';
        const content = bodyEl.value || '';
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

    // ─── 悬浮格式菜单 + / 命令菜单 ───

    _bindEditorEnhancements(container) {
        const bodyEl = container.querySelector('#blog-ed-body');
        if (!bodyEl) return;

        this._floatMenu = null;
        this._colorPicker = null;
        this._fontSizePicker = null;
        this._slashMenu = null;
        this._slashStart = -1;
        this._slashActiveIdx = 0;

        const editorLeft = bodyEl.closest('.blog-editor-left');
        const menuHost = editorLeft || container;

        this._createFloatingMenu(menuHost, bodyEl);
        this._createSlashMenu(menuHost, bodyEl);
        this._bindSelectionFloat(bodyEl);
        this._bindSlashCommand(bodyEl);
        this._bindShortcuts(bodyEl);
        this._bindImagePaste(bodyEl);
    }

    // ── 悬浮格式菜单（选中文字时出现） ──

    _createFloatingMenu(host, textarea) {
        const menu = document.createElement('div');
        menu.className = 'blog-float-menu';
        menu.innerHTML = `
            <button type="button" class="bfm-btn" data-md="bold" title="粗体"><i class="fas fa-bold"></i></button>
            <button type="button" class="bfm-btn" data-md="italic" title="斜体"><i class="fas fa-italic"></i></button>
            <button type="button" class="bfm-btn" data-md="strikethrough" title="删除线"><i class="fas fa-strikethrough"></i></button>
            <button type="button" class="bfm-btn" data-md="underline" title="下划线"><i class="fas fa-underline"></i></button>
            <span class="bfm-sep"></span>
            <button type="button" class="bfm-btn" data-md="link" title="链接"><i class="fas fa-link"></i></button>
            <button type="button" class="bfm-btn" data-md="code" title="代码"><i class="fas fa-code"></i></button>
            <button type="button" class="bfm-btn bfm-highlight-btn" data-md="highlight" title="高亮（点击展开颜色）">
                <i class="fas fa-highlighter"></i>
                <span class="bfm-highlight-dot" style="background:#FFEB3B"></span>
            </button>
            <span class="bfm-sep"></span>
            <button type="button" class="bfm-btn bfm-fontsize-btn" data-md="fontsize" title="字体大小">
                <i class="fas fa-text-height"></i>
            </button>
        `;
        host.appendChild(menu);
        this._floatMenu = menu;

        this.HIGHLIGHT_COLORS = [
            { name: '黄色', color: '#FFEB3B', mdTag: '==' },
            { name: '绿色', color: '#A5D6A7', mdTag: '=g=' },
            { name: '蓝色', color: '#90CAF9', mdTag: '=b=' },
            { name: '粉色', color: '#F48FB1', mdTag: '=p=' },
            { name: '橙色', color: '#FFCC80', mdTag: '=o=' },
            { name: '紫色', color: '#CE93D8', mdTag: '=v=' },
        ];
        this._selectedHighlightIdx = 0;

        this.FONT_SIZES = [
            { label: '小', size: 'small', css: '0.85em' },
            { label: '正常', size: 'normal', css: '1em' },
            { label: '大', size: 'large', css: '1.2em' },
            { label: '特大', size: 'xlarge', css: '1.5em' },
            { label: '超大', size: 'xxlarge', css: '2em' },
        ];

        const colorPicker = document.createElement('div');
        colorPicker.className = 'bfm-color-picker';
        colorPicker.innerHTML = this.HIGHLIGHT_COLORS.map((c, i) =>
            `<button type="button" class="bfm-color-dot ${i === 0 ? 'active' : ''}" data-cidx="${i}" style="background:${c.color}" title="${c.name}"></button>`
        ).join('');
        host.appendChild(colorPicker);
        this._colorPicker = colorPicker;

        const fontSizePicker = document.createElement('div');
        fontSizePicker.className = 'bfm-fontsize-picker';
        fontSizePicker.innerHTML = this.FONT_SIZES.map(f =>
            `<button type="button" class="bfm-fontsize-opt" data-size="${f.size}" style="font-size:${f.css}">${f.label}</button>`
        ).join('');
        host.appendChild(fontSizePicker);
        this._fontSizePicker = fontSizePicker;

        menu.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const btn = e.target.closest('.bfm-btn');
            if (!btn) return;
            const md = btn.dataset.md;

            if (md === 'highlight') {
                this._toggleColorPicker();
                return;
            }
            if (md === 'fontsize') {
                this._toggleFontSizePicker();
                return;
            }

            this._hideColorPicker();
            this._hideFontSizePicker();
            this._insertMarkdown(textarea, md);
            this._hideFloatMenu();
        });

        colorPicker.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const dot = e.target.closest('.bfm-color-dot');
            if (!dot) return;
            const idx = parseInt(dot.dataset.cidx);
            this._selectedHighlightIdx = idx;
            colorPicker.querySelectorAll('.bfm-color-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
            menu.querySelector('.bfm-highlight-dot').style.background = this.HIGHLIGHT_COLORS[idx].color;
            this._insertHighlight(textarea, idx);
            this._hideColorPicker();
            this._hideFloatMenu();
        });

        fontSizePicker.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const opt = e.target.closest('.bfm-fontsize-opt');
            if (!opt) return;
            const size = opt.dataset.size;
            this._insertFontSize(textarea, size);
            this._hideFontSizePicker();
            this._hideFloatMenu();
        });
    }

    _toggleColorPicker() {
        if (this._colorPicker.classList.contains('visible')) {
            this._hideColorPicker();
        } else {
            this._hideFontSizePicker();
            const menuRect = this._floatMenu.getBoundingClientRect();
            const highlightBtn = this._floatMenu.querySelector('.bfm-highlight-btn');
            const btnRect = highlightBtn.getBoundingClientRect();
            const parent = this._floatMenu.parentElement;
            const parentRect = parent.getBoundingClientRect();
            this._colorPicker.style.left = (btnRect.left - parentRect.left + btnRect.width / 2 - 80) + 'px';
            this._colorPicker.style.top = (menuRect.top - parentRect.top - 40) + 'px';
            this._colorPicker.classList.add('visible');
        }
    }

    _hideColorPicker() {
        this._colorPicker?.classList.remove('visible');
    }

    _toggleFontSizePicker() {
        if (this._fontSizePicker.classList.contains('visible')) {
            this._hideFontSizePicker();
        } else {
            this._hideColorPicker();
            const menuRect = this._floatMenu.getBoundingClientRect();
            const fsBtn = this._floatMenu.querySelector('.bfm-fontsize-btn');
            const btnRect = fsBtn.getBoundingClientRect();
            const parent = this._floatMenu.parentElement;
            const parentRect = parent.getBoundingClientRect();
            this._fontSizePicker.style.left = (btnRect.left - parentRect.left + btnRect.width / 2 - 60) + 'px';
            this._fontSizePicker.style.top = (menuRect.top - parentRect.top - 44) + 'px';
            this._fontSizePicker.classList.add('visible');
        }
    }

    _hideFontSizePicker() {
        this._fontSizePicker?.classList.remove('visible');
    }

    _insertHighlight(textarea, colorIdx) {
        const c = this.HIGHLIGHT_COLORS[colorIdx];
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end) || '高亮文字';
        const tag = c.mdTag;
        const newText = text.substring(0, start) + tag + selected + tag + text.substring(end);
        textarea.value = newText;
        textarea.focus();
        const selectStart = start + tag.length;
        textarea.setSelectionRange(selected === '高亮文字' ? selectStart : selectStart + selected.length, selectStart + selected.length);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _insertFontSize(textarea, size) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end) || '文字';
        const sizeMap = { small: '0.85em', normal: '1em', large: '1.2em', xlarge: '1.5em', xxlarge: '2em' };
        const cssSize = sizeMap[size] || '1em';
        if (size === 'normal') {
            const newText = text.substring(0, start) + selected + text.substring(end);
            textarea.value = newText;
            textarea.focus();
            textarea.setSelectionRange(start, start + selected.length);
        } else {
            const wrapped = `<span style="font-size:${cssSize}">${selected}</span>`;
            const newText = text.substring(0, start) + wrapped + text.substring(end);
            textarea.value = newText;
            textarea.focus();
            const cursorPos = start + wrapped.length;
            textarea.setSelectionRange(cursorPos, cursorPos);
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _bindSelectionFloat(textarea) {
        let checkTimer = null;

        const check = () => {
            const { selectionStart, selectionEnd } = textarea;
            if (selectionStart === selectionEnd || !textarea.matches(':focus')) {
                this._hideFloatMenu();
                return;
            }
            this._showFloatMenu(textarea);
        };

        textarea.addEventListener('mouseup', () => {
            clearTimeout(checkTimer);
            checkTimer = setTimeout(check, 80);
        });

        textarea.addEventListener('keyup', (e) => {
            if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End')) {
                clearTimeout(checkTimer);
                checkTimer = setTimeout(check, 80);
            }
        });

        textarea.addEventListener('blur', () => {
            setTimeout(() => {
                if (!this._floatMenu?.matches(':hover')) {
                    this._hideFloatMenu();
                }
            }, 150);
        });
    }

    _showFloatMenu(textarea) {
        if (!this._floatMenu) return;
        const pos = this._getCaretCoords(textarea);
        if (!pos) return;

        const menu = this._floatMenu;
        menu.classList.add('visible');

        requestAnimationFrame(() => {
            const mw = menu.offsetWidth;
            const mh = menu.offsetHeight;
            let left = pos.x - mw / 2;
            let top = pos.y - mh - 8;

            const parent = textarea.closest('.blog-editor-left') || textarea.parentElement;
            const parentRect = parent.getBoundingClientRect();

            left = Math.max(4, Math.min(left, parentRect.width - mw - 4));
            if (top < 0) top = pos.y + pos.lineHeight + 4;

            menu.style.left = left + 'px';
            menu.style.top = top + 'px';
        });
    }

    _hideFloatMenu() {
        this._floatMenu?.classList.remove('visible');
        this._hideColorPicker();
        this._hideFontSizePicker();
    }

    _getCaretCoords(textarea) {
        const { selectionStart, selectionEnd, value } = textarea;
        if (selectionStart === selectionEnd) return null;

        const mirror = document.createElement('div');
        const cs = getComputedStyle(textarea);
        const props = ['fontFamily','fontSize','fontWeight','letterSpacing','lineHeight',
                       'paddingTop','paddingRight','paddingBottom','paddingLeft',
                       'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
                       'whiteSpace','wordWrap','overflowWrap','tabSize','textIndent'];
        props.forEach(p => { mirror.style[p] = cs[p]; });
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.width = cs.width;
        mirror.style.overflow = 'hidden';
        document.body.appendChild(mirror);

        const textBefore = value.substring(0, selectionStart);
        const selectedText = value.substring(selectionStart, selectionEnd);

        const beforeNode = document.createTextNode(textBefore);
        const span = document.createElement('span');
        span.textContent = selectedText || '.';
        mirror.appendChild(beforeNode);
        mirror.appendChild(span);

        const taRect = textarea.getBoundingClientRect();
        const spanRect = span.getBoundingClientRect();
        const mirrorRect = mirror.getBoundingClientRect();

        const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const x = spanRect.left - mirrorRect.left + spanRect.width / 2;
        const y = spanRect.top - mirrorRect.top - textarea.scrollTop;

        document.body.removeChild(mirror);

        return { x, y, lineHeight };
    }

    // ── / 斜杠命令菜单 ──

    _createSlashMenu(host, textarea) {
        const menu = document.createElement('div');
        menu.className = 'blog-slash-menu';
        menu.innerHTML = '';
        host.appendChild(menu);
        this._slashMenu = menu;

        menu.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const item = e.target.closest('.bsm-item');
            if (!item) return;
            this._execSlashCommand(textarea, item.dataset.cmd);
        });
    }

    _getSlashCommands() {
        return [
            { section: '基础', items: [
                { cmd: 'h1',    icon: 'H1', iconClass: '', label: '一级标题' },
                { cmd: 'h2',    icon: 'H2', iconClass: '', label: '二级标题' },
                { cmd: 'h3',    icon: 'H3', iconClass: '', label: '三级标题' },
                { cmd: 'olist', icon: '', iconClass: 'fas fa-list-ol', label: '有序列表' },
                { cmd: 'list',  icon: '', iconClass: 'fas fa-list-ul', label: '无序列表' },
                { cmd: 'codeblock', icon: '{ }', iconClass: '', label: '代码块' },
                { cmd: 'quote', icon: '', iconClass: 'fas fa-quote-left', label: '引用' },
                { cmd: 'hr',    icon: '', iconClass: 'fas fa-minus', label: '分隔线' },
                { cmd: 'link',  icon: '', iconClass: 'fas fa-link', label: '链接' },
            ]},
            { section: '常用', items: [
                { cmd: 'task',  icon: '', iconClass: 'fas fa-check-square', label: '任务' },
                { cmd: 'image', icon: '', iconClass: 'fas fa-image', label: '图片（输入URL）' },
                { cmd: 'upload', icon: '', iconClass: 'fas fa-upload', label: '上传图片' },
                { cmd: 'browse-images', icon: '', iconClass: 'fas fa-folder-open', label: '从图库选图' },
                { cmd: 'table', icon: '', iconClass: 'fas fa-table', label: '表格' },
                { cmd: 'mermaid', icon: '', iconClass: 'fas fa-project-diagram', label: '流程图' },
            ]},
        ];
    }

    _bindSlashCommand(textarea) {
        textarea.addEventListener('input', () => {
            const { value, selectionStart } = textarea;
            const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
            const lineText = value.substring(lineStart, selectionStart);

            const slashMatch = lineText.match(/\/([^\s/]*)$/);
            if (slashMatch) {
                this._slashStart = selectionStart - slashMatch[0].length;
                this._showSlashMenu(textarea, slashMatch[1]);
            } else {
                this._hideSlashMenu();
            }
        });

        textarea.addEventListener('keydown', (e) => {
            if (!this._slashMenu?.classList.contains('visible')) return;
            const visibleItems = this._slashMenu.querySelectorAll('.bsm-item:not(.bsm-hidden)');
            if (!visibleItems.length) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._slashActiveIdx = Math.min(this._slashActiveIdx + 1, visibleItems.length - 1);
                this._highlightSlashItem(visibleItems);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._slashActiveIdx = Math.max(this._slashActiveIdx - 1, 0);
                this._highlightSlashItem(visibleItems);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                const active = visibleItems[this._slashActiveIdx];
                if (active) this._execSlashCommand(textarea, active.dataset.cmd);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this._hideSlashMenu();
            }
        });

        textarea.addEventListener('blur', () => {
            setTimeout(() => {
                if (!this._slashMenu?.matches(':hover')) {
                    this._hideSlashMenu();
                }
            }, 150);
        });
    }

    _showSlashMenu(textarea, filter) {
        if (!this._slashMenu) return;
        const commands = this._getSlashCommands();
        const keyword = (filter || '').toLowerCase();

        let html = '';
        let totalVisible = 0;
        commands.forEach(section => {
            const filtered = section.items.filter(it =>
                it.label.toLowerCase().includes(keyword) ||
                it.cmd.toLowerCase().includes(keyword)
            );
            if (filtered.length === 0) return;
            html += `<div class="bsm-section-label">${section.section}</div>`;
            filtered.forEach(it => {
                const iconHtml = it.iconClass
                    ? `<i class="${it.iconClass}"></i>`
                    : `<span class="bsm-icon-text">${it.icon}</span>`;
                html += `<div class="bsm-item" data-cmd="${it.cmd}">${iconHtml}<span>${it.label}</span></div>`;
                totalVisible++;
            });
        });

        if (totalVisible === 0) {
            this._hideSlashMenu();
            return;
        }

        this._slashMenu.innerHTML = html;
        this._slashActiveIdx = 0;
        this._highlightSlashItem(this._slashMenu.querySelectorAll('.bsm-item'));

        const pos = this._getSlashMenuPos(textarea);
        this._slashMenu.style.left = pos.x + 'px';
        this._slashMenu.style.top = pos.y + 'px';
        this._slashMenu.classList.add('visible');
    }

    _hideSlashMenu() {
        this._slashMenu?.classList.remove('visible');
        this._slashStart = -1;
    }

    _highlightSlashItem(items) {
        items.forEach((el, i) => {
            el.classList.toggle('active', i === this._slashActiveIdx);
            if (i === this._slashActiveIdx) el.scrollIntoView({ block: 'nearest' });
        });
    }

    _getSlashMenuPos(textarea) {
        const { value, selectionStart } = textarea;
        const mirror = document.createElement('div');
        const cs = getComputedStyle(textarea);
        ['fontFamily','fontSize','fontWeight','letterSpacing','lineHeight',
         'paddingTop','paddingRight','paddingBottom','paddingLeft',
         'borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth',
         'whiteSpace','wordWrap','overflowWrap','tabSize','textIndent',
         'width'].forEach(p => { mirror.style[p] = cs[p]; });
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.overflow = 'hidden';
        document.body.appendChild(mirror);

        const textBefore = value.substring(0, selectionStart);
        const span = document.createElement('span');
        span.textContent = '.';
        mirror.appendChild(document.createTextNode(textBefore));
        mirror.appendChild(span);

        const mirrorRect = mirror.getBoundingClientRect();
        const spanRect = span.getBoundingClientRect();
        const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const x = spanRect.left - mirrorRect.left;
        const y = spanRect.top - mirrorRect.top - textarea.scrollTop + lineHeight + 4;

        document.body.removeChild(mirror);
        return { x: Math.max(8, x), y };
    }

    _execSlashCommand(textarea, cmd) {
        const { value } = textarea;
        const end = textarea.selectionStart;
        textarea.value = value.substring(0, this._slashStart) + value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = this._slashStart;
        this._hideSlashMenu();

        if (cmd === 'upload') {
            this._triggerImageUpload(textarea);
        } else if (cmd === 'browse-images') {
            this._openImageBrowser(textarea);
        } else if (cmd === 'h1') {
            this._insertMarkdown(textarea, 'heading1');
        } else if (cmd === 'h2') {
            this._insertMarkdown(textarea, 'heading2');
        } else if (cmd === 'h3') {
            this._insertMarkdown(textarea, 'heading3');
        } else if (cmd === 'mermaid') {
            this._insertMarkdown(textarea, 'mermaid');
        } else {
            this._insertMarkdown(textarea, cmd);
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ── 键盘快捷键 ──

    _bindShortcuts(bodyEl) {
        bodyEl.addEventListener('keydown', (e) => {
            if (this._slashMenu?.classList.contains('visible')) return;
            const ctrl = e.ctrlKey || e.metaKey;
            if (!ctrl) return;
            let action = null;
            if (e.key === 'b' && !e.shiftKey) action = 'bold';
            else if (e.key === 'i' && !e.shiftKey) action = 'italic';
            else if (e.key === 'u' && !e.shiftKey) action = 'underline';
            else if (e.key === 'k' && !e.shiftKey) action = 'link';
            else if (e.key === 'e' && !e.shiftKey) action = 'code';
            else if (e.key === 'x' && e.shiftKey) action = 'strikethrough';
            else if (e.key === 'b' && e.shiftKey) action = 'quote';
            else if (e.key === 'k' && e.shiftKey) action = 'codeblock';
            if (action) {
                e.preventDefault();
                this._insertMarkdown(bodyEl, action);
            }
        });

        bodyEl.addEventListener('keydown', (e) => {
            if (this._slashMenu?.classList.contains('visible')) return;
            if (e.key === 'Tab') {
                e.preventDefault();
                this._handleTab(bodyEl, e.shiftKey);
            }
        });
    }

    _insertMarkdown(textarea, action) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);

        const insertions = {
            bold:          { before: '**', after: '**', placeholder: '粗体文字' },
            italic:        { before: '*', after: '*', placeholder: '斜体文字' },
            underline:     { before: '<u>', after: '</u>', placeholder: '下划线文字' },
            strikethrough: { before: '~~', after: '~~', placeholder: '删除线文字' },
            highlight:     { before: '==', after: '==', placeholder: '高亮文字' },
            heading:       { before: '## ', after: '', placeholder: '标题', lineStart: true },
            heading1:      { before: '# ', after: '', placeholder: '一级标题', lineStart: true },
            heading2:      { before: '## ', after: '', placeholder: '二级标题', lineStart: true },
            heading3:      { before: '### ', after: '', placeholder: '三级标题', lineStart: true },
            list:          { before: '- ', after: '', placeholder: '列表项', lineStart: true },
            olist:         { before: '1. ', after: '', placeholder: '列表项', lineStart: true },
            code:          { before: '`', after: '`', placeholder: 'code' },
            codeblock:     { before: '```\n', after: '\n```', placeholder: '// 代码块', lineStart: true },
            quote:         { before: '> ', after: '', placeholder: '引用文字', lineStart: true },
            hr:            { before: '\n---\n', after: '', placeholder: '', lineStart: true, noSelect: true },
            link:          { before: '[', after: '](url)', placeholder: '链接文字' },
            image:         { before: '![', after: '](图片地址)', placeholder: '图片描述' },
            task:          { before: '- [ ] ', after: '', placeholder: '任务项', lineStart: true },
            table:         { before: '', after: '', placeholder: '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |', lineStart: true, block: true },
            mermaid:       { before: '```mermaid\n', after: '\n```', placeholder: 'graph TD\n    A[开始] --> B{判断}\n    B -->|是| C[结果1]\n    B -->|否| D[结果2]', lineStart: true },
        };

        const ins = insertions[action];
        if (!ins) return;

        let newText, cursorPos, selectStart;

        if (ins.block) {
            const content = selected || ins.placeholder;
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            const needNewline = lineStart < start ? '\n' : '';
            newText = text.substring(0, start) + needNewline + content + text.substring(end);
            selectStart = start + needNewline.length;
            cursorPos = selectStart + content.length;
        } else if (ins.noSelect) {
            newText = text.substring(0, start) + ins.before + text.substring(end);
            cursorPos = start + ins.before.length;
            selectStart = cursorPos;
        } else if (ins.lineStart && start === end) {
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            newText = text.substring(0, lineStart) + ins.before + (selected || ins.placeholder) + ins.after + text.substring(end);
            selectStart = lineStart + ins.before.length;
            cursorPos = selectStart + (selected || ins.placeholder).length;
        } else {
            newText = text.substring(0, start) + ins.before + (selected || ins.placeholder) + ins.after + text.substring(end);
            selectStart = start + ins.before.length;
            cursorPos = selectStart + (selected || ins.placeholder).length;
        }

        textarea.value = newText;
        textarea.focus();
        textarea.setSelectionRange(selected ? cursorPos : selectStart, cursorPos);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _handleTab(textarea, isShift) {
        const { selectionStart, selectionEnd, value } = textarea;
        const firstLineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lastLineEnd = value.indexOf('\n', selectionEnd);
        const endPos = lastLineEnd === -1 ? value.length : lastLineEnd;
        const block = value.substring(firstLineStart, endPos);
        const lines = block.split('\n');

        const processed = lines.map(line => {
            if (isShift) {
                return line.startsWith('    ') ? line.substring(4) : (line.startsWith('\t') ? line.substring(1) : line);
            }
            return '    ' + line;
        });

        const newBlock = processed.join('\n');
        textarea.value = value.substring(0, firstLineStart) + newBlock + value.substring(endPos);
        const diff = newBlock.length - block.length;
        textarea.setSelectionRange(
            Math.max(firstLineStart, selectionStart + (isShift ? -Math.min(4, lines[0].match(/^( {1,4}|\t)/)?.[0].length || 0) : 4)),
            selectionEnd + diff
        );
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ─── 图片粘贴上传 ───

    _bindImagePaste(textarea) {
        textarea.addEventListener('paste', async (e) => {
            const items = Array.from(e.clipboardData?.items || []);
            const imageItem = items.find(item => item.type.startsWith('image/'));
            if (!imageItem) return;

            e.preventDefault();
            const file = imageItem.getAsFile();
            if (!file) return;

            const placeholder = `![上传中...](uploading_${Date.now()})`;
            const start = textarea.selectionStart;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + placeholder + text.substring(textarea.selectionEnd);
            textarea.dispatchEvent(new Event('input', { bubbles: true }));

            const result = await this._uploadImage(file);
            if (result) {
                const mdImg = `![${result.name}](${result.url})`;
                textarea.value = textarea.value.replace(placeholder, mdImg);
            } else {
                textarea.value = textarea.value.replace(placeholder, '![上传失败]()');
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    _triggerImageUpload(textarea) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.addEventListener('change', async () => {
            for (const file of input.files) {
                const placeholder = `![上传中...](uploading_${Date.now()})`;
                const start = textarea.selectionStart;
                const text = textarea.value;
                textarea.value = text.substring(0, start) + '\n' + placeholder + '\n' + text.substring(textarea.selectionEnd);
                textarea.selectionStart = textarea.selectionEnd = start + placeholder.length + 2;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));

                const result = await this._uploadImage(file);
                if (result) {
                    textarea.value = textarea.value.replace(placeholder, `![${result.name}](${result.url})`);
                } else {
                    textarea.value = textarea.value.replace(placeholder, '![上传失败]()');
                }
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        input.click();
    }

    async _uploadImage(file) {
        const IMGVAULT_API = 'https://www.meczyc6.info/imgvault';
        try {
            const formData = new FormData();
            formData.append('file', file);
            const resp = await fetch(`${IMGVAULT_API}/api/v1/images/upload`, {
                method: 'POST',
                body: formData
            });
            if (!resp.ok) return null;
            const result = await resp.json();
            if (result.code === 200 && result.data) {
                const imgId = result.data.id;
                return {
                    name: result.data.originalName || file.name,
                    url: `${IMGVAULT_API}/api/v1/images/${imgId}/download`
                };
            }
            return null;
        } catch (err) {
            console.error('[Blog] 图片上传失败:', err);
            return null;
        }
    }

    // ─── 图库浏览器 — 从 ImgVault 拉取已上传图片 ───

    async _openImageBrowser(textarea) {
        const IMGVAULT_API = 'https://www.meczyc6.info/imgvault';
        const overlay = document.createElement('div');
        overlay.className = 'blog-imgbrowser-overlay';
        overlay.innerHTML = `
            <div class="blog-imgbrowser-modal">
                <div class="blog-imgbrowser-header">
                    <h3><i class="fas fa-images"></i> 图库</h3>
                    <div class="blog-imgbrowser-actions">
                        <button type="button" class="blog-imgbrowser-upload-btn"><i class="fas fa-upload"></i> 上传新图</button>
                        <button type="button" class="blog-imgbrowser-close"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="blog-imgbrowser-grid" id="blog-imgbrowser-grid">
                    <div class="blog-imgbrowser-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));

        overlay.querySelector('.blog-imgbrowser-close').addEventListener('click', () => {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 250);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('visible');
                setTimeout(() => overlay.remove(), 250);
            }
        });

        overlay.querySelector('.blog-imgbrowser-upload-btn').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.addEventListener('change', async () => {
                for (const file of input.files) {
                    const result = await this._uploadImage(file);
                    if (result) {
                        this._refreshImageGrid(overlay, textarea, IMGVAULT_API);
                    }
                }
            });
            input.click();
        });

        try {
            const resp = await fetch(`${IMGVAULT_API}/api/v1/images?page=1&size=50&sortBy=createdAt&sortDirection=desc`);
            if (!resp.ok) throw new Error('Failed to load');
            const result = await resp.json();
            if (result.code === 200 && result.data?.content) {
                this._renderImageGrid(overlay, result.data.content, textarea, IMGVAULT_API);
            } else {
                throw new Error('Invalid response');
            }
        } catch (err) {
            const grid = overlay.querySelector('#blog-imgbrowser-grid');
            grid.innerHTML = `<div class="blog-imgbrowser-empty"><i class="fas fa-exclamation-circle"></i> 加载失败，请稍后重试</div>`;
        }
    }

    _renderImageGrid(overlay, images, textarea, apiBase) {
        const grid = overlay.querySelector('#blog-imgbrowser-grid');
        if (!images.length) {
            grid.innerHTML = `<div class="blog-imgbrowser-empty"><i class="fas fa-image"></i> 暂无图片，点击上方按钮上传</div>`;
            return;
        }
        grid.innerHTML = images.map(img => {
            const thumbUrl = `${apiBase}/api/v1/images/${img.id}/download`;
            const name = img.originalName || img.fileName || 'image';
            return `<div class="blog-imgbrowser-item" data-url="${thumbUrl}" data-name="${this._escHtml(name)}">
                <div class="blog-imgbrowser-thumb" style="background-image:url('${thumbUrl}')"></div>
                <div class="blog-imgbrowser-name" title="${this._escHtml(name)}">${this._esc(name)}</div>
            </div>`;
        }).join('');

        grid.querySelectorAll('.blog-imgbrowser-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.dataset.url;
                const name = item.dataset.name;
                const mdImg = `![${name}](${url})`;
                const start = textarea.selectionStart;
                const text = textarea.value;
                textarea.value = text.substring(0, start) + '\n' + mdImg + '\n' + text.substring(textarea.selectionEnd);
                textarea.selectionStart = textarea.selectionEnd = start + mdImg.length + 2;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.focus();
                overlay.classList.remove('visible');
                setTimeout(() => overlay.remove(), 250);
            });
        });
    }

    async _refreshImageGrid(overlay, textarea, apiBase) {
        try {
            const resp = await fetch(`${apiBase}/api/v1/images?page=1&size=50&sortBy=createdAt&sortDirection=desc`);
            if (!resp.ok) return;
            const result = await resp.json();
            if (result.code === 200 && result.data?.content) {
                this._renderImageGrid(overlay, result.data.content, textarea, apiBase);
            }
        } catch (_) {}
    }

    // ─── Markdown 渲染增强：多色高亮 ───

    _renderHighlightColors(html) {
        const colorMap = {
            '==':  { bg: '#FFEB3B', fg: '#333' },
            '=g=': { bg: '#A5D6A7', fg: '#1B5E20' },
            '=b=': { bg: '#90CAF9', fg: '#0D47A1' },
            '=p=': { bg: '#F48FB1', fg: '#880E4F' },
            '=o=': { bg: '#FFCC80', fg: '#E65100' },
            '=v=': { bg: '#CE93D8', fg: '#4A148C' },
        };
        let result = html;
        for (const [tag, colors] of Object.entries(colorMap)) {
            const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped + '([^=]+?)' + escaped, 'g');
            result = result.replace(regex, `<mark style="background:${colors.bg};color:${colors.fg};padding:1px 4px;border-radius:2px">$1</mark>`);
        }
        return result;
    }
}

window.blogManager = new BlogManager();
