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
        this._returnFocus = null;
        this._backgroundInertSiblings = [];
        this._drawerEventsAbort = null;

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
            { id: 'history', name: '历史故事', icon: 'fa-landmark', color: '#B8860B' },
            { id: 'thought', name: '思想史', icon: 'fa-scroll',    color: '#8D6E63' },
            { id: 'modern',  name: '近现代史', icon: 'fa-monument', color: '#C62828' },
            { id: 'geography', name: '地理故事', icon: 'fa-globe-asia', color: '#1B5E20' },
            { id: 'draft',   name: '草稿箱',icon: 'fa-box-open',   color: '#9E9E9E' },
        ];

        this.STORAGE_KEY = 'blogPosts';
        this._drawerVh = 88;
    }

    // ─── 初始化 ───
    async init() {
        if (this._initialized) return;
        await this._loadData();
        this._initialized = true;
        this._updateDockBadge();
        console.log('[Blog] 初始化完成，文章数:', this._posts.length);
        this._syncHermesInBackground();
    }

    async _syncHermesInBackground() {
        if (!window.HermesWritingSync?.syncFromBridge) return;
        try {
            const result = await window.HermesWritingSync.syncFromBridge({ scan: true, forceScan: false });
            if (result.ok && (result.created > 0 || result.deduped > 0)) {
                console.log('[Blog] Hermes 同步:', result.created, '篇新故事',
                    result.deduped ? `去重 ${result.deduped}` : '');
                await this._loadData();
                if (this._drawerOpen && this._currentView === 'list') {
                    this._renderContent();
                }
                if (this._drawerOpen && result.deduped > 0) {
                    this._renderSidebar?.();
                    this._renderTopbarStats?.();
                }
            }
        } catch (e) {
            console.warn('[Blog] Hermes 同步跳过:', e?.message || e);
        }
    }

    _showToast(msg, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `blog-toast blog-toast-${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2800);
    }

    async syncFromHermes(showToast = true) {
        if (!window.HermesWritingSync?.syncFromBridge) {
            const result = { ok: false, error: 'Hermes 同步模块未加载' };
            if (showToast) this._showSyncError(result.error);
            return result;
        }
        let result;
        try {
            result = await window.HermesWritingSync.syncFromBridge({
                scan: true,
                forceScan: true,
                showToast,
            });
        } catch (error) {
            result = { ok: false, error: error?.message || '无法连接 Hermes Bridge' };
        }
        console.log('[Blog] Hermes 同步结果', result);
        if (result.ok) {
            await this._loadData();
            console.log('[Blog] 重新加载后文章数', this._posts.length,
                result.deduped ? `(去重 ${result.deduped})` : '');
            if (this._drawerOpen && this._currentView === 'list') {
                this._renderContent();
            }
            if (this._drawerOpen) {
                this._updateDockBadge();
                this._renderSidebar?.();
                this._renderTopbarStats?.();
            }
        } else if (showToast) {
            this._showSyncError(result.error || result.message || 'Hermes 数据源暂时不可用');
        }
        return result;
    }

    // ─── 数据加载/保存 ───
    async _loadData() {
        const data = await new Promise(r =>
            chrome.storage.local.get([this.STORAGE_KEY], r)
        );
        this._posts = Array.isArray(data[this.STORAGE_KEY])
            ? data[this.STORAGE_KEY].map(post => ({
                ...post,
                versions: Array.isArray(post.versions) ? post.versions : [],
            }))
            : [];
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

        let processed = this._preprocessParagraphs(text);
        processed = this._escapeBackslashesOutsideCode(processed);

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
     * 预处理段落：将中文写作中常见的单换行+首行缩进格式转换为 markdown 双换行，
     * 确保渲染为独立的 <p> 标签而非 <br>。
     * 规则：如果一行以全角空格、Tab或多个半角空格开头（且不在代码块中），
     * 视为新段落开头，前面插入额外空行。
     */
    _preprocessParagraphs(text) {
        if (!text) return text;
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map((part, i) => {
            if (i % 2 === 1) return part;
            return part.replace(/\n([　\t]|  +)/g, '\n\n$1');
        }).join('');
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
            id: data.id || this._genId(),
            title: data.title || '无标题',
            content: data.content || '',
            category: data.category || 'essay',
            tags: data.tags || [],
            createdAt: data.createdAt || Date.now(),
            updatedAt: data.updatedAt || Date.now(),
            wordCount: data.wordCount ?? this._wordCount(data.content),
            pinned: data.pinned ?? false,
            aiConfig: data.aiConfig || null,
            source: data.source || null,
            versions: Array.isArray(data.versions) ? data.versions : [],
        };
        this._posts.unshift(post);
        void this._savePosts();
        this._updateDockBadge();
        return post;
    }

    /** Hermes 批量入库：单次写入 storage，避免并发 createPost 竞态丢文 */
    async importHermesPostsBatch(posts) {
        if (!posts?.length) return 0;
        const existingExtIds = new Set(
            this._posts
                .map(p => p.source?.externalId)
                .filter(Boolean)
        );
        let added = 0;
        for (const post of posts) {
            const extId = post.source?.externalId;
            if (extId && existingExtIds.has(extId)) continue;
            this._posts.unshift(post);
            if (extId) existingExtIds.add(extId);
            added++;
        }
        if (added > 0) {
            await this._savePosts();
            this._updateDockBadge();
        }
        console.log('[Blog] Hermes 批量入库', { requested: posts.length, added, total: this._posts.length });
        return added;
    }

    updatePost(id, data) {
        const post = this._posts.find(p => p.id === id);
        if (!post) return null;
        const versionedFields = ['title', 'content', 'category', 'tags'];
        const hasContentChange = versionedFields.some(field => {
            if (data[field] === undefined) return false;
            if (field === 'tags') return JSON.stringify(data.tags || []) !== JSON.stringify(post.tags || []);
            return data[field] !== post[field];
        });
        if (hasContentChange) {
            post.versions = Array.isArray(post.versions) ? post.versions : [];
            post.versions.unshift({
                id: `version_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                createdAt: post.updatedAt || post.createdAt || Date.now(),
                title: post.title,
                content: post.content,
                category: post.category,
                tags: [...(post.tags || [])],
                wordCount: post.wordCount || this._wordCount(post.content),
            });
            post.versions = post.versions.slice(0, 50);
        }
        if (data.title !== undefined) post.title = data.title;
        if (data.content !== undefined) {
            post.content = data.content;
            post.wordCount = this._wordCount(data.content);
        }
        if (data.category !== undefined) post.category = data.category;
        if (data.tags !== undefined) post.tags = data.tags;
        if (data.pinned !== undefined) post.pinned = data.pinned;
        if (data.aiConfig !== undefined) post.aiConfig = data.aiConfig;
        post.updatedAt = Date.now();
        this._savePosts();
        return post;
    }

    getPostAiConfig(id) {
        const post = this._posts.find(p => p.id === id);
        return post?.aiConfig || null;
    }

    updatePostAiConfig(id, aiConfig) {
        const post = this._posts.find(p => p.id === id);
        if (!post) return null;
        post.aiConfig = aiConfig;
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
            const result = this._searchPosts(list, this._searchQuery);
            list = result.posts;
            this._lastSearchMode = result.mode;
            return list;
        }
        this._lastSearchMode = null;
        list.sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            return b.updatedAt - a.updatedAt;
        });
        return list;
    }

    _searchPosts(posts, query) {
        const q = query.toLowerCase();

        // Phase 1: exact substring match (title > tags > content)
        const exactTitle = posts.filter(p => (p.title || '').toLowerCase().includes(q));
        const exactTag = posts.filter(p =>
            !exactTitle.includes(p) &&
            (p.tags || []).some(t => t.toLowerCase().includes(q))
        );
        const exactContent = posts.filter(p =>
            !exactTitle.includes(p) && !exactTag.includes(p) &&
            (p.content || '').toLowerCase().includes(q)
        );
        const exactResults = [...exactTitle, ...exactTag, ...exactContent];

        if (exactResults.length > 0) {
            return { posts: exactResults, mode: 'exact' };
        }

        // Phase 2: Fuse.js fuzzy search fallback
        if (typeof Fuse === 'undefined') {
            return { posts: [], mode: 'none' };
        }

        if (!this._fuseIndex || this._fuseIndexVersion !== this._posts.length) {
            this._fuseIndex = new Fuse(posts, {
                keys: [
                    { name: 'title', weight: 3 },
                    { name: 'tags', weight: 2 },
                    { name: 'content', weight: 1 },
                ],
                threshold: 0.4,
                distance: 200,
                includeScore: true,
                minMatchCharLength: 2,
                ignoreLocation: true,
            });
            this._fuseIndexVersion = this._posts.length;
        } else {
            this._fuseIndex.setCollection(posts);
        }

        const fuseResults = this._fuseIndex.search(query, { limit: 50 });
        return {
            posts: fuseResults.map(r => r.item),
            mode: 'fuzzy',
        };
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
        this._returnFocus = document.activeElement;
        this._drawerOpen = true;
        this._currentView = 'list';
        this._editingPost = null;
        this._buildDrawer();
        this._setProductPage('library');
    }

    closeDrawer() {
        if (!this._drawerOpen) return;
        this._drawerOpen = false;
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
        this._drawerEventsAbort?.abort();
        this._drawerEventsAbort = null;
        document.getElementById('blog-version-overlay')?.remove();
        document.getElementById('blog-sync-error-overlay')?.remove();
        document.getElementById('knowledge-wiki-overlay')?.remove();
        document.getElementById('writing-ai-settings-panel')?.remove();
        const dockBtn = document.getElementById('blog-dock-btn');
        const visibleDockBtn = dockBtn?.getClientRects?.().length ? dockBtn : null;
        const insideLaunchpad = this._returnFocus?.closest?.('#dock-launchpad');
        const focusableReturn = this._returnFocus?.matches?.('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const returnTarget = this._returnFocus?.isConnected && focusableReturn && !insideLaunchpad
            ? this._returnFocus
            : (visibleDockBtn || document.getElementById('dock-launchpad-btn'));
        this._setBackgroundInert(false);
        window.ProductUIV5?.setShellPage?.('home');
        returnTarget?.focus?.({ preventScroll: true });
        setTimeout(() => {
            if (!this._drawerOpen) returnTarget?.focus?.({ preventScroll: true });
        }, 120);
        if (this._drawerEl) {
            this._drawerEl.inert = true;
            this._drawerEl.classList.remove('open');
            setTimeout(() => { this._drawerEl?.remove(); this._drawerEl = null; }, 400);
        }
        this._showReopenChip(false);
        if (dockBtn) dockBtn.classList.remove('active');
        this._returnFocus = null;
    }

    _setProductPage(page) {
        window.ProductUIV5?.setBusinessPage?.('writing', page);
    }

    _baseProductPage() {
        return { list: 'library', editor: 'editor', detail: 'preview' }[this._currentView] || 'library';
    }

    _restoreProductPage() {
        this._setProductPage(this._baseProductPage());
    }

    _collapseDrawer() {
        if (this._drawerEl) {
            this._drawerEl.classList.remove('open');
            this._drawerEl.inert = true;
        }
        this._showReopenChip(true);
        requestAnimationFrame(() => this._reopenChip?.focus?.({ preventScroll: true }));
    }

    _expandDrawer() {
        if (this._drawerEl) {
            this._drawerEl.inert = false;
            this._drawerEl.classList.add('open');
        }
        this._showReopenChip(false);
        const focusExpanded = () => (this._drawerEl?.querySelector('.blog-search-box input') || this._drawerEl?.querySelector('[data-action="new-post"]'))?.focus?.({ preventScroll: true });
        requestAnimationFrame(focusExpanded);
        setTimeout(() => {
            if (this._drawerOpen && !this._drawerEl?.inert) focusExpanded();
        }, 120);
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
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-labelledby', 'blog-drawer-title');
        drawer.tabIndex = -1;
        drawer.style.setProperty('--blog-drawer-h', this._drawerVh + 'vh');
        drawer.innerHTML = `
            <div class="blog-drawer-panel">
                <div class="blog-drag-zone" data-role="drag">
                    <div class="blog-drag-handle"></div>
                </div>
                <div class="blog-topbar">
                    <div class="blog-topbar-left">
                        <div class="blog-topbar-title" id="blog-drawer-title"><i class="fas fa-pen-nib" style="color:#d4a843"></i> 写作空间</div>
                        <div class="blog-topbar-stats" id="blog-topbar-stats"></div>
                    </div>
                    <div class="blog-topbar-actions">
                        <button type="button" class="blog-tb-btn" data-action="hermes-sync" title="从 Hermes 每日故事同步"><i class="fas fa-cloud-download-alt"></i> Hermes</button>
                        <button type="button" class="blog-tb-btn" data-action="hermes-manage" title="管理 Hermes 数据源"><i class="fas fa-cogs"></i></button>
                        <button type="button" class="blog-tb-btn" data-action="knowledge-wiki" title="知识图谱" style="color:#AB47BC"><i class="fas fa-project-diagram"></i> 知识库</button>
                        <button type="button" class="blog-tb-btn primary" data-action="new-post"><i class="fas fa-plus"></i> 写一篇</button>
                        <button type="button" class="blog-tb-btn" data-action="collapse" title="收起">收起 <i class="fas fa-chevron-down" style="font-size:10px"></i></button>
                        <button type="button" class="blog-tb-btn" data-action="fullscreen" title="全屏">全屏 <i class="fas fa-expand" style="font-size:10px"></i></button>
                        <button type="button" class="blog-tb-btn danger" data-action="close" title="关闭"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="blog-body">
                    <div class="blog-sidebar" id="blog-sidebar"></div>
                    <div class="blog-content" id="blog-content"></div>
                    <aside class="blog-assistant" aria-label="创作助手">
                        <div class="blog-assistant-head">
                            <span><i class="fas fa-sparkles"></i> 创作助手</span>
                            <small>本地上下文</small>
                        </div>
                        <section class="blog-assistant-card">
                            <strong>开始前</strong>
                            <span>先确定读者、核心观点和希望读者采取的行动。</span>
                            <button type="button" data-action="new-post"><i class="fas fa-plus"></i> 新建草稿</button>
                        </section>
                        <section class="blog-assistant-card">
                            <strong>AI 写作工作台</strong>
                            <span>配置文章级提示词、补全模型和历史文档联想。</span>
                            <button type="button" data-action="assistant-ai"><i class="fas fa-magic"></i> 打开 AI 助手</button>
                        </section>
                        <section class="blog-assistant-card">
                            <strong>引用与复用</strong>
                            <span>从常用信息中查找素材，保留来源再写入文章。</span>
                            <button type="button" data-action="assistant-knowledge"><i class="fas fa-brain"></i> 打开常用信息</button>
                        </section>
                        <section class="blog-assistant-card">
                            <strong>结构提示</strong>
                            <span>用角色与约束模板检查文章结构和输出格式。</span>
                            <button type="button" data-action="assistant-prompt"><i class="fas fa-magic"></i> 打开 Prompt 管理</button>
                        </section>
                    </aside>
                </div>
            </div>
        `;
        this._drawerEl = drawer;
        document.body.appendChild(drawer);
        this._setBackgroundInert(true);

        this._renderTopbarStats();
        this._renderSidebar();
        this._renderContent();
        this._bindDrawerEvents();

        requestAnimationFrame(() => requestAnimationFrame(() => {
            drawer.classList.add('open');
            (drawer.querySelector('.blog-search-box input') || drawer.querySelector('[data-action="new-post"]'))?.focus?.({ preventScroll: true });
        }));
        setTimeout(() => {
            if (this._drawerOpen && !drawer.inert) (drawer.querySelector('.blog-search-box input') || drawer.querySelector('[data-action="new-post"]'))?.focus?.({ preventScroll: true });
        }, 160);

        this._escHandler = (e) => {
            if (e.key === 'Tab') {
                this._trapFocus(this._activeFocusSurface(), e);
                return;
            }
            if (e.key === 'Escape') {
                const surface = this._activeFocusSurface();
                const dismiss = surface?.querySelector?.('[data-version-action="close"], [data-sync-action="keep-local"], [data-kw-action="close"], .writing-ai-settings-close');
                if (surface !== this._drawerEl && dismiss) {
                    dismiss.click();
                    return;
                }
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

    _setBackgroundInert(active) {
        if (active) {
            if (this._backgroundInertSiblings.length) return;
            this._backgroundInertSiblings = [...document.body.children]
                .filter(child => child !== this._drawerEl && child !== this._reopenChip && !child.inert);
            this._backgroundInertSiblings.forEach(child => { child.inert = true; });
            return;
        }
        this._backgroundInertSiblings.forEach(child => { child.inert = false; });
        this._backgroundInertSiblings = [];
    }

    _activeFocusSurface() {
        return document.getElementById('blog-version-overlay')
            || document.getElementById('blog-sync-error-overlay')
            || document.getElementById('knowledge-wiki-overlay')
            || document.getElementById('writing-ai-settings-panel')
            || this._drawerEl;
    }

    _trapFocus(container, event) {
        const focusable = [...(container?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])') || [])]
            .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length);
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

    _bindDrawerEvents() {
        const panel = this._drawerEl;
        if (!panel) return;
        this._drawerEventsAbort?.abort();
        this._drawerEventsAbort = new AbortController();
        const eventOptions = { signal: this._drawerEventsAbort.signal };

        // 顶栏按钮
        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            switch (btn.dataset.action) {
                case 'hermes-sync':
                    void this.syncFromHermes(true);
                    break;
                case 'hermes-manage':
                    this._openHermesManager();
                    break;
                case 'knowledge-wiki':
                    this._openKnowledgeWiki();
                    break;
                case 'new-post':
                    this._editingPost = null;
                    this._switchView('editor');
                    break;
                case 'assistant-knowledge':
                    this._openKnowledgeWiki();
                    break;
                case 'assistant-ai':
                    if (this._currentView !== 'editor') this._switchView('editor');
                    this._setProductPage('ai-assistant');
                    setTimeout(() => document.getElementById('writing-ai-settings-btn')?.click(), 80);
                    break;
                case 'assistant-prompt':
                    document.getElementById('prompt-mgr-dock-btn')?.click();
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
        }, eventOptions);

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
        }, eventOptions);
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
        this._restoreProductPage();
        requestAnimationFrame(() => {
            const target = view === 'list'
                ? this._drawerEl?.querySelector('.blog-search-box input')
                : view === 'detail'
                    ? this._drawerEl?.querySelector('.blog-detail-back')
                    : this._drawerEl?.querySelector('#blog-ed-title');
            target?.focus?.({ preventScroll: true });
        });
        setTimeout(() => {
            if (!this._drawerOpen || this._activeFocusSurface() !== this._drawerEl) return;
            const target = view === 'list'
                ? this._drawerEl?.querySelector('.blog-search-box input')
                : view === 'detail'
                    ? this._drawerEl?.querySelector('.blog-detail-back')
                    : this._drawerEl?.querySelector('#blog-ed-title');
            target?.focus?.({ preventScroll: true });
        }, 120);
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
                    <button type="button" class="blog-post-row" data-id="${p.id}" aria-label="打开文章：${this._esc(p.title)}">
                        ${p.pinned ? '<i class="fas fa-thumbtack blog-post-pin"></i>' : ''}
                        <span class="blog-post-date">${this._formatDate(p.updatedAt)}</span>
                        <span class="blog-post-cat-dot" style="background:${cat.color}" title="${cat.name}"></span>
                        <span class="blog-post-link">${this._esc(p.title)}</span>
                        <span class="blog-post-words">${p.wordCount || 0} 字</span>
                    </button>`;
            }).join('');
        } else {
            postsHtml = `
                <div class="blog-list-empty">
                    <i class="fas fa-feather-alt"></i>
                    <p>还没有文章，开始写点什么吧</p>
                    <button type="button" class="blog-list-empty-btn" data-action="new-post">写一篇</button>
                </div>`;
        }

        const modeHint = this._lastSearchMode === 'fuzzy'
            ? '<span class="blog-search-mode fuzzy" title="模糊匹配结果（可能包含近似结果）">模糊</span>'
            : this._lastSearchMode === 'exact'
                ? '<span class="blog-search-mode exact" title="精确匹配">精确</span>'
                : '';

        container.innerHTML = `
            <div class="blog-list-view">
                <div class="blog-list-header">
                    <h1 class="blog-list-title">${catLabel}</h1>
                    <div class="blog-search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" placeholder="搜索标题、内容、标签…" value="${this._esc(this._searchQuery)}" />
                        ${modeHint}
                    </div>
                </div>
                ${this._searchQuery && posts.length === 0 ? `
                    <div class="blog-list-empty">
                        <i class="fas fa-search"></i>
                        <p>未找到与「${this._esc(this._searchQuery)}」相关的文章</p>
                    </div>` : ''}
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
            let composing = false;
            searchInput.addEventListener('compositionstart', () => { composing = true; });
            searchInput.addEventListener('compositionend', () => {
                composing = false;
                clearTimeout(timer);
                timer = setTimeout(() => {
                    this._searchQuery = searchInput.value.trim();
                    this._renderContent();
                }, 60);
            });
            searchInput.addEventListener('input', () => {
                if (composing) return;
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

    // ─── Hermes 故事：emoji 小节 → ## 标题（写作空间目录依赖 # 标题） ───
    _isHermesStyleContent(content) {
        if (!content) return false;
        return /Hermes Cron/i.test(content)
            || /^📅\s*\*\*/m.test(content)
            || /^📖\s*\*\*/m.test(content);
    }

    _normalizeHermesSections(markdown) {
        if (!markdown) return markdown;
        const sectionRe = /^(📜|📅|📖|📚|✍️|💬|🤔|👤|⚔️|⚡|💰)\s*\*\*([^*]+)\*\*[：:]?\s*(.*)$/;
        const lines = markdown.split('\n');
        const out = [];
        let sectionCount = 0;

        for (const line of lines) {
            const m = line.match(sectionRe);
            if (!m) {
                out.push(line);
                continue;
            }
            const emoji = m[1];
            const label = m[2].trim();
            const inline = (m[3] || '').trim();

            // 篇名行 / 模板「标题」不占目录
            if (emoji === '📜') {
                out.push(line);
                continue;
            }
            if (label === '标题' || label === '简明有力' || /^标题[：:]/.test(label)) {
                out.push(line);
                continue;
            }

            sectionCount++;
            out.push(`## ${label}`);
            if (inline) out.push(inline);
        }

        return sectionCount >= 2 ? out.join('\n') : markdown;
    }

    _contentForDetailRender(post) {
        let content = post?.content || '';
        if (this._isHermesStyleContent(content)) {
            content = this._normalizeHermesSections(content);
        }
        return content;
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

        const detailContent = this._contentForDetailRender(post);
        const rendered = this._renderMarkdown(detailContent);
        const headings = this._extractHeadings(detailContent);
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
                        <button type="button" class="blog-detail-act-btn" data-action="version-history">
                            <i class="fas fa-history"></i> 版本 ${post.versions?.length || 0}
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
        container.querySelector('[data-action="version-history"]')?.addEventListener('click', () => {
            this._showVersionHistory(post);
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
                        ${post ? `<button type="button" class="blog-editor-history-btn" data-action="version-history"><i class="fas fa-history"></i> ${post.versions?.length || 0}</button>` : ''}
                    </div>
                </div>
                <div class="blog-editor-split">
                    <div class="blog-editor-left">
                        <div class="writing-ai-toolbar" id="writing-ai-toolbar">
                            <button class="writing-ai-btn writing-ai-selection-btn" data-ai-action="rewrite" title="选中文本后点击改写">
                                <i class="fas fa-sync-alt"></i> <span>改写</span>
                            </button>
                            <button class="writing-ai-btn writing-ai-selection-btn" data-ai-action="summarize" title="选中文本后点击摘要">
                                <i class="fas fa-compress-alt"></i> <span>摘要</span>
                            </button>
                            <button class="writing-ai-btn writing-ai-selection-btn" data-ai-action="expand" title="选中文本后点击扩写">
                                <i class="fas fa-expand-alt"></i> <span>扩写</span>
                            </button>
                            <span class="writing-ai-hint" id="writing-ai-selection-hint">（选中文本激活）</span>
                            <div class="writing-ai-divider"></div>
                            <button class="writing-ai-btn writing-ai-toggle" id="writing-ai-toggle" title="AI 补全开关">
                                <i class="fas fa-magic"></i> <span>AI</span>
                            </button>
                            <button class="writing-ai-btn" id="writing-ai-settings-btn" title="写作 AI 设置">
                                <i class="fas fa-cog"></i>
                            </button>
                            <span class="writing-ai-status" id="writing-ai-status"></span>
                        </div>
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
        container.querySelector('[data-action="version-history"]')?.addEventListener('click', () => this._showVersionHistory(post));

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

        setTimeout(() => container.querySelector('#blog-ed-title')?.focus({ preventScroll: true }), 100);
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
                const ghostContainer = bodyEl.parentElement?.querySelector('.writing-ghost-container');
                if (ghostContainer && ghostContainer.style.display !== 'none') return;
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

    // ─── Hermes 源管理面板 ───

    async _openHermesManager() {
        const BRIDGE = 'http://127.0.0.1:19840';
        let existing = document.getElementById('hermes-manager-overlay');
        if (existing) { existing.remove(); return; }

        const overlay = document.createElement('div');
        overlay.id = 'hermes-manager-overlay';
        overlay.className = 'hermes-mgr-overlay';
        overlay.innerHTML = `
            <div class="hermes-mgr-panel">
                <div class="hermes-mgr-header">
                    <h3><i class="fas fa-cogs"></i> Hermes 数据源管理</h3>
                    <button class="hermes-mgr-close" id="hermes-mgr-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="hermes-mgr-body" id="hermes-mgr-body">
                    <div style="text-align:center;padding:40px;color:#aaa">
                        <i class="fas fa-spinner fa-spin" style="font-size:24px"></i>
                        <div style="margin-top:12px">加载 Hermes 任务列表…</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));

        overlay.querySelector('#hermes-mgr-close').addEventListener('click', () => {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 300);
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
                setTimeout(() => overlay.remove(), 300);
            }
        });

        try {
            const [jobsResp, profilesResp] = await Promise.all([
                fetch(`${BRIDGE}/writing/hermes/cron-jobs`).then(r => r.json()),
                fetch(`${BRIDGE}/writing/hermes/profiles`).then(r => r.json()),
            ]);

            const jobs = jobsResp.jobs || [];
            const profiles = profilesResp.profiles || [];
            const profileMap = new Map(profiles.map(p => [p.jobId, p]));

            this._renderHermesManagerBody(overlay, jobs, profileMap);
        } catch (err) {
            const body = overlay.querySelector('#hermes-mgr-body');
            if (body) body.innerHTML = `
                <div style="text-align:center;padding:40px;color:#ff6b6b">
                    <i class="fas fa-exclamation-triangle" style="font-size:24px"></i>
                    <div style="margin-top:12px">无法连接 cursor-bridge (19840)</div>
                    <div style="margin-top:4px;font-size:12px;color:#999">${err.message}</div>
                </div>`;
        }
    }

    _renderHermesManagerBody(overlay, jobs, profileMap) {
        const BRIDGE = 'http://127.0.0.1:19840';
        const body = overlay.querySelector('#hermes-mgr-body');
        const categories = this.CATEGORIES.filter(c => c.id !== 'draft');

        const jobsHtml = jobs.map(job => {
            const profile = profileMap.get(job.id);
            const registered = !!profile?.enabled;
            return `
                <div class="hermes-mgr-job ${registered ? 'registered' : ''}" data-job-id="${job.id}">
                    <div class="hermes-mgr-job-info">
                        <div class="hermes-mgr-job-name">
                            <span class="hermes-mgr-status ${registered ? 'active' : 'inactive'}"></span>
                            ${this._esc(job.name)}
                        </div>
                        <div class="hermes-mgr-job-meta">
                            <span title="任务 ID"><i class="fas fa-fingerprint"></i> ${job.id}</span>
                            <span title="已有输出"><i class="fas fa-file-alt"></i> ${job.outputCount} 篇</span>
                            ${job.schedule ? `<span title="调度规则"><i class="fas fa-clock"></i> ${this._esc(job.schedule.display || job.schedule.expr || String(job.schedule))}</span>` : ''}
                        </div>
                    </div>
                    <div class="hermes-mgr-job-actions">
                        ${registered
                            ? `<span class="hermes-mgr-cat-badge" style="background:${this._getCategoryById(profile.category)?.color || '#666'}">${this._getCategoryById(profile.category)?.name || profile.category}</span>
                               <button class="hermes-mgr-btn danger" data-mgr-action="remove" data-job-id="${job.id}" title="停止同步"><i class="fas fa-unlink"></i></button>`
                            : `<select class="hermes-mgr-cat-select" data-job-id="${job.id}">
                                   ${categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                               </select>
                               <button class="hermes-mgr-btn primary" data-mgr-action="add" data-job-id="${job.id}" title="开始同步"><i class="fas fa-link"></i> 同步</button>`
                        }
                    </div>
                </div>
            `;
        }).join('');

        body.innerHTML = `
            <div class="hermes-mgr-hint">
                <i class="fas fa-info-circle"></i>
                选择需要同步到写作空间的 Hermes 定时任务，并为每个任务指定文章分类。
            </div>
            <div class="hermes-mgr-list">${jobsHtml || '<div style="padding:20px;color:#aaa;text-align:center">未发现 Hermes 定时任务</div>'}</div>
        `;

        body.querySelectorAll('[data-mgr-action]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const jobId = btn.dataset.jobId;
                const action = btn.dataset.mgrAction;
                btn.disabled = true;

                try {
                    if (action === 'add') {
                        const select = body.querySelector(`select[data-job-id="${jobId}"]`);
                        const category = select?.value || 'history';
                        const job = jobs.find(j => j.id === jobId);
                        await fetch(`${BRIDGE}/writing/hermes/profiles`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                jobId,
                                name: job?.name || 'Unknown',
                                category,
                                tags: ['hermes', category, 'cron'],
                            }),
                        });
                        this._showToast(`已添加「${job?.name || jobId}」到同步列表`, 'success');
                    } else if (action === 'remove') {
                        await fetch(`${BRIDGE}/writing/hermes/profiles/${jobId}`, { method: 'DELETE' });
                        this._showToast('已移除同步源', 'info');
                    }

                    const [jr, pr] = await Promise.all([
                        fetch(`${BRIDGE}/writing/hermes/cron-jobs`).then(r => r.json()),
                        fetch(`${BRIDGE}/writing/hermes/profiles`).then(r => r.json()),
                    ]);
                    const newMap = new Map((pr.profiles || []).map(p => [p.jobId, p]));
                    this._renderHermesManagerBody(overlay, jr.jobs || [], newMap);
                } catch (err) {
                    this._showToast('操作失败: ' + err.message, 'error');
                    btn.disabled = false;
                }
            });
        });
    }

    // ─── 版本历史 / 同步异常 ───

    _showVersionHistory(post = this._editingPost) {
        if (!post) return;
        document.getElementById('blog-version-overlay')?.remove();
        const versionReturnFocus = document.activeElement;
        const versions = Array.isArray(post.versions) ? post.versions : [];
        const current = {
            id: 'current',
            createdAt: post.updatedAt,
            title: post.title,
            content: post.content,
            category: post.category,
            tags: [...(post.tags || [])],
            wordCount: post.wordCount,
        };
        const snapshots = [current, ...versions];
        const overlay = document.createElement('div');
        overlay.id = 'blog-version-overlay';
        overlay.className = 'blog-v5-overlay blog-version-overlay';
        overlay.innerHTML = `
            <section class="blog-v5-modal blog-version-modal" role="dialog" aria-modal="true" aria-labelledby="blog-version-title">
                <header class="blog-v5-modal-head">
                    <div>
                        <span class="blog-v5-kicker">WRITING HISTORY</span>
                        <h2 id="blog-version-title">版本历史</h2>
                        <p>${this._esc(post.title)} · 共 ${versions.length} 个可恢复版本</p>
                    </div>
                    <button type="button" class="blog-v5-close" data-version-action="close" aria-label="关闭"><i class="fas fa-times"></i></button>
                </header>
                <div class="blog-version-layout">
                    <nav class="blog-version-list" aria-label="文章版本">
                        ${snapshots.map((version, index) => `
                            <button type="button" class="blog-version-item ${index === 0 ? 'active' : ''}" data-version-id="${version.id}">
                                <span class="blog-version-dot"></span>
                                <strong>${index === 0 ? '当前版本' : `历史版本 ${versions.length - index + 1}`}</strong>
                                <time>${this._formatDateTime(version.createdAt)}</time>
                                <small>${version.wordCount ?? this._wordCount(version.content)} 字</small>
                            </button>
                        `).join('')}
                    </nav>
                    <article class="blog-version-preview">
                        <div class="blog-version-preview-head">
                            <div><span id="blog-version-preview-label">当前版本</span><strong id="blog-version-preview-title">${this._esc(current.title)}</strong></div>
                            <button type="button" class="blog-v5-restore" data-version-action="restore" disabled><i class="fas fa-rotate-left"></i> 恢复此版本</button>
                        </div>
                        <div class="blog-article-body" id="blog-version-preview-body">${this._renderMarkdown(current.content)}</div>
                    </article>
                </div>
            </section>`;
        document.body.appendChild(overlay);
        this._setProductPage('version-history');
        requestAnimationFrame(() => {
            if (this._drawerEl) this._drawerEl.inert = true;
            overlay.classList.add('open');
            overlay.querySelector('[data-version-action="close"]')?.focus({ preventScroll: true });
        });

        let selected = current;
        const renderSelected = () => {
            const index = snapshots.indexOf(selected);
            overlay.querySelector('#blog-version-preview-label').textContent = index === 0 ? '当前版本' : `保存于 ${this._formatDateTime(selected.createdAt)}`;
            overlay.querySelector('#blog-version-preview-title').textContent = selected.title || '无标题';
            overlay.querySelector('#blog-version-preview-body').innerHTML = this._renderMarkdown(selected.content || '');
            overlay.querySelector('[data-version-action="restore"]').disabled = selected.id === 'current';
        };
        const close = () => {
            overlay.inert = true;
            overlay.classList.remove('open');
            if (this._drawerOpen && this._drawerEl) this._drawerEl.inert = false;
            setTimeout(() => {
                overlay.remove();
                versionReturnFocus?.focus?.({ preventScroll: true });
            }, 220);
            this._restoreProductPage();
        };
        overlay.addEventListener('click', (event) => {
            const versionButton = event.target.closest('[data-version-id]');
            if (versionButton) {
                selected = snapshots.find(item => item.id === versionButton.dataset.versionId) || current;
                overlay.querySelectorAll('[data-version-id]').forEach(item => item.classList.toggle('active', item === versionButton));
                renderSelected();
                return;
            }
            const action = event.target.closest('[data-version-action]')?.dataset.versionAction;
            if (action === 'close' || event.target === overlay) close();
            if (action === 'restore' && selected.id !== 'current') {
                this.updatePost(post.id, {
                    title: selected.title,
                    content: selected.content,
                    category: selected.category,
                    tags: [...(selected.tags || [])],
                });
                this._editingPost = this.getPost(post.id);
                close();
                this._switchView('detail', post.id);
                this._renderSidebar();
                this._renderTopbarStats();
                this._showToast('已恢复历史版本，恢复前内容已自动留档', 'success');
            }
        });
    }

    _showSyncError(message) {
        document.getElementById('blog-sync-error-overlay')?.remove();
        const syncReturnFocus = document.activeElement;
        const overlay = document.createElement('div');
        overlay.id = 'blog-sync-error-overlay';
        overlay.className = 'blog-v5-overlay blog-sync-error-overlay';
        overlay.innerHTML = `
            <section class="blog-v5-modal blog-sync-error-modal" role="alertdialog" aria-modal="true" aria-labelledby="blog-sync-error-title">
                <div class="blog-sync-error-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <span class="blog-v5-kicker">SYNC RECOVERY</span>
                <h2 id="blog-sync-error-title">Hermes 暂时无法同步</h2>
                <p>${this._esc(message || '数据源暂时不可用')}</p>
                <div class="blog-sync-status-grid">
                    <div><i class="fas fa-laptop"></i><span>本地文章</span><strong>${this._posts.length} 篇安全保留</strong></div>
                    <div class="failed"><i class="fas fa-cloud"></i><span>远端数据源</span><strong>等待重新连接</strong></div>
                </div>
                <div class="blog-sync-actions">
                    <button type="button" class="blog-v5-secondary" data-sync-action="keep-local">继续使用本地内容</button>
                    <button type="button" class="blog-v5-primary" data-sync-action="retry"><i class="fas fa-rotate"></i> 重试同步</button>
                </div>
                <small>重试不会覆盖本地文章；Hermes 条目会按 externalId 去重。</small>
            </section>`;
        document.body.appendChild(overlay);
        this._setProductPage('sync-error');
        requestAnimationFrame(() => {
            if (this._drawerEl) this._drawerEl.inert = true;
            overlay.classList.add('open');
            overlay.querySelector('[data-sync-action="keep-local"]')?.focus({ preventScroll: true });
        });
        const close = () => {
            overlay.inert = true;
            overlay.classList.remove('open');
            if (this._drawerOpen && this._drawerEl) this._drawerEl.inert = false;
            setTimeout(() => {
                overlay.remove();
                syncReturnFocus?.focus?.({ preventScroll: true });
            }, 220);
            this._restoreProductPage();
        };
        overlay.addEventListener('click', event => {
            const action = event.target.closest('[data-sync-action]')?.dataset.syncAction;
            if (action === 'keep-local' || event.target === overlay) close();
            if (action === 'retry') {
                close();
                setTimeout(() => void this.syncFromHermes(true), 240);
            }
        });
    }

    // ─── LLM-wiki 知识库面板 ───

    async _openKnowledgeWiki() {
        let overlay = document.getElementById('knowledge-wiki-overlay');
        if (overlay) { overlay.querySelector('[data-kw-action="close"]')?.click(); return; }
        const knowledgeReturnFocus = document.activeElement;

        overlay = document.createElement('div');
        overlay.id = 'knowledge-wiki-overlay';
        overlay.className = 'kw-wiki-overlay';
        overlay.innerHTML = `
            <div class="kw-panel" role="dialog" aria-modal="true" aria-labelledby="kw-panel-title">
                <div class="kw-header">
                    <div class="kw-title" id="kw-panel-title"><i class="fas fa-project-diagram"></i> 知识引用 · LLM-wiki</div>
                    <div class="kw-header-actions">
                        <button class="kw-btn" data-kw-action="index-all" title="索引全部未索引的故事"><i class="fas fa-magic"></i> 一键索引</button>
                        <button class="kw-btn" data-kw-action="close" aria-label="关闭知识引用"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="kw-tabs">
                    <button class="kw-tab active" data-kw-tab="overview">概览</button>
                    <button class="kw-tab" data-kw-tab="search">搜索</button>
                    <button class="kw-tab" data-kw-tab="browse">浏览</button>
                    <button class="kw-tab" data-kw-tab="graph">图谱</button>
                </div>
                <div class="kw-body" id="kw-body">
                    <div class="kw-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this._setProductPage('knowledge-citation');
        requestAnimationFrame(() => {
            if (this._drawerEl) this._drawerEl.inert = true;
            overlay.classList.add('open');
            overlay.querySelector('[data-kw-action="close"]')?.focus({ preventScroll: true });
        });

        const closeWiki = () => {
            overlay.inert = true;
            overlay.classList.remove('open');
            if (this._drawerOpen && this._drawerEl) this._drawerEl.inert = false;
            setTimeout(() => {
                overlay.remove();
                knowledgeReturnFocus?.focus?.({ preventScroll: true });
            }, 220);
            this._restoreProductPage();
        };
        overlay.querySelector('[data-kw-action="close"]').onclick = closeWiki;
        overlay.querySelector('[data-kw-action="index-all"]').onclick = () => this._kwIndexAll(overlay);

        overlay.querySelectorAll('.kw-tab').forEach(tab => {
            tab.onclick = () => {
                overlay.querySelectorAll('.kw-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this._kwSwitchTab(overlay, tab.dataset.kwTab);
            };
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeWiki();
        });

        await this._kwSwitchTab(overlay, 'overview');
        if (overlay.isConnected) overlay.querySelector('[data-kw-action="close"]')?.focus({ preventScroll: true });
        setTimeout(() => {
            if (overlay.isConnected) overlay.querySelector('[data-kw-action="close"]')?.focus({ preventScroll: true });
        }, 120);
    }

    async _kwSwitchTab(overlay, tab) {
        const body = overlay.querySelector('#kw-body');
        const BRIDGE = 'http://127.0.0.1:19840';
        try {
            switch (tab) {
                case 'overview': {
                    const stats = await fetch(`${BRIDGE}/writing/knowledge/stats`).then(r => r.json());
                    body.innerHTML = this._kwRenderOverview(stats);
                    break;
                }
                case 'search': {
                    body.innerHTML = this._kwRenderSearch();
                    body.querySelector('.kw-search-input').focus();
                    body.querySelector('.kw-search-input').onkeydown = (e) => {
                        if (e.key === 'Enter') this._kwDoSearch(overlay);
                    };
                    body.querySelector('.kw-search-btn').onclick = () => this._kwDoSearch(overlay);
                    break;
                }
                case 'browse': {
                    body.innerHTML = `<div class="kw-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
                    await this._kwRenderBrowse(overlay);
                    break;
                }
                case 'graph': {
                    body.innerHTML = `<div class="kw-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
                    await this._kwRenderGraph(overlay);
                    break;
                }
            }
        } catch (err) {
            body.innerHTML = `<div class="kw-empty">
                <i class="fas fa-plug"></i>
                <strong>知识服务未连接</strong>
                <span>本地文章仍可正常编辑；启动 Bridge 后即可继续检索与引用。</span>
                <button type="button" class="kw-btn" data-kw-action="retry"><i class="fas fa-redo"></i> 重新连接</button>
            </div>`;
            body.querySelector('[data-kw-action="retry"]')?.addEventListener('click', () => this._kwSwitchTab(overlay, tab));
        }
    }

    _kwRenderOverview(stats) {
        const typeLabels = {
            dynasty: '朝代', person: '人物', event: '事件',
            place: '地点', concept: '概念',
        };
        const typeCards = Object.entries(stats.byType || {})
            .map(([type, count]) => `
                <div class="kw-stat-card">
                    <div class="kw-stat-num">${count}</div>
                    <div class="kw-stat-label">${typeLabels[type] || type}</div>
                </div>
            `).join('');

        const catCards = Object.entries(stats.byCategory || {})
            .map(([cat, count]) => {
                const catObj = this.CATEGORIES.find(c => c.id === cat);
                return `<span class="kw-cat-chip" style="background:${catObj?.color || '#666'}22;color:${catObj?.color || '#666'}">${catObj?.name || cat}: ${count}</span>`;
            }).join('');

        const topList = (stats.topEntities || []).slice(0, 20)
            .map(e => `<span class="kw-entity-chip kw-type-${e.type}" data-kw-entity="${e.name}">${e.name} <small>(${e.count})</small></span>`)
            .join('');

        return `
            <div class="kw-overview">
                <div class="kw-overview-summary">
                    <div class="kw-stat-card kw-stat-hero">
                        <div class="kw-stat-num">${stats.indexedStories || 0}</div>
                        <div class="kw-stat-label">已索引故事</div>
                    </div>
                    <div class="kw-stat-card kw-stat-hero">
                        <div class="kw-stat-num">${stats.totalEntities || 0}</div>
                        <div class="kw-stat-label">知识实体</div>
                    </div>
                    <div class="kw-stat-card kw-stat-hero">
                        <div class="kw-stat-num">${stats.totalRelations || 0}</div>
                        <div class="kw-stat-label">关系连接</div>
                    </div>
                </div>
                ${stats.totalEntities > 0 ? `
                    <div class="kw-section">
                        <h4>实体类型分布</h4>
                        <div class="kw-stat-grid">${typeCards}</div>
                    </div>
                    <div class="kw-section">
                        <h4>分类来源</h4>
                        <div class="kw-cat-chips">${catCards}</div>
                    </div>
                    <div class="kw-section">
                        <h4>热门实体</h4>
                        <div class="kw-entity-chips">${topList}</div>
                    </div>
                ` : `
                    <div class="kw-empty-state">
                        <i class="fas fa-seedling" style="font-size:56px;color:#4CAF50;opacity:0.6"></i>
                        <p style="font-size:18px;font-weight:600;color:#ccc">知识库尚未索引</p>
                        <p style="color:#999;font-size:14px;max-width:400px;line-height:1.6">写作空间中的故事需要先经过 LLM 索引，才能自动提取朝代、人物、事件、地点等知识实体，构建知识图谱。</p>
                        <button class="kw-btn" onclick="this.closest('.kw-wiki-overlay')?.querySelector('[data-kw-action=\\'index-all\\']')?.click()" style="margin-top:8px;padding:10px 24px;font-size:14px;background:rgba(76,175,80,.15);border:1px solid rgba(76,175,80,.3);color:#4CAF50;cursor:pointer;border-radius:8px"><i class="fas fa-magic"></i> 开始一键索引</button>
                    </div>
                `}
            </div>
        `;
    }

    _kwRenderSearch() {
        return `
            <div class="kw-search-panel">
                <div class="kw-search-bar">
                    <input type="text" class="kw-search-input" placeholder="搜索人物、地点、事件、朝代...">
                    <select class="kw-search-type">
                        <option value="">全部类型</option>
                        <option value="dynasty">朝代</option>
                        <option value="person">人物</option>
                        <option value="event">事件</option>
                        <option value="place">地点</option>
                        <option value="concept">概念</option>
                    </select>
                    <button class="kw-search-btn"><i class="fas fa-search"></i></button>
                </div>
                <div class="kw-search-results" id="kw-search-results"></div>
            </div>
        `;
    }

    async _kwDoSearch(overlay) {
        const body = overlay.querySelector('#kw-body');
        const input = body.querySelector('.kw-search-input');
        const typeSelect = body.querySelector('.kw-search-type');
        const resultsEl = body.querySelector('#kw-search-results');
        const q = input.value.trim();
        if (!q) return;

        resultsEl.innerHTML = `<div class="kw-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
        const BRIDGE = 'http://127.0.0.1:19840';
        try {
            const params = new URLSearchParams({ q });
            if (typeSelect.value) params.set('type', typeSelect.value);
            const data = await fetch(`${BRIDGE}/writing/knowledge/search?${params}`).then(r => r.json());
            const entities = data.entities || [];
            if (!entities.length) {
                resultsEl.innerHTML = `<div class="kw-empty">没有找到「${q}」相关的知识实体</div>`;
                return;
            }

            resultsEl.innerHTML = entities.map(e => `
                <div class="kw-result-card kw-type-${e.entityType}">
                    <div class="kw-result-header">
                        <span class="kw-result-name">${e.name}</span>
                        <span class="kw-result-type">${this._kwTypeLabel(e.entityType)}</span>
                    </div>
                    ${e.description ? `<div class="kw-result-desc">${e.description}</div>` : ''}
                    ${e.timeRange ? `<div class="kw-result-meta"><i class="far fa-clock"></i> ${e.timeRange}</div>` : ''}
                    ${(e.aliases?.length) ? `<div class="kw-result-meta"><i class="fas fa-tags"></i> ${e.aliases.join(', ')}</div>` : ''}
                    ${(e.relatedEntities?.length) ? `<div class="kw-result-related">关联: ${e.relatedEntities.map(r => `<span class="kw-entity-chip-sm">${r}</span>`).join('')}</div>` : ''}
                </div>
            `).join('');
        } catch (err) {
            resultsEl.innerHTML = `<div class="kw-empty"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>`;
        }
    }

    async _kwRenderBrowse(overlay) {
        const body = overlay.querySelector('#kw-body');
        const BRIDGE = 'http://127.0.0.1:19840';
        const types = ['dynasty', 'person', 'event', 'place', 'concept'];
        const results = {};
        for (const t of types) {
            try {
                const data = await fetch(`${BRIDGE}/writing/knowledge/entities?type=${t}&limit=50`).then(r => r.json());
                results[t] = data.entities || [];
            } catch { results[t] = []; }
        }

        const tabs = types.map((t, i) => `<button class="kw-browse-tab ${i === 0 ? 'active' : ''}" data-type="${t}">${this._kwTypeLabel(t)} (${results[t].length})</button>`).join('');
        const panels = types.map((t, i) => {
            const items = results[t];
            if (!items.length) return `<div class="kw-browse-list" data-type="${t}" style="display:${i === 0 ? 'block' : 'none'}"><div class="kw-empty">暂无${this._kwTypeLabel(t)}数据</div></div>`;
            return `<div class="kw-browse-list" data-type="${t}" style="display:${i === 0 ? 'block' : 'none'}">
                ${items.map(e => `
                    <div class="kw-browse-item">
                        <span class="kw-browse-name">${e.name}</span>
                        <span class="kw-browse-count">出现 ${e.count} 次</span>
                        ${e.description ? `<span class="kw-browse-desc">${e.description}</span>` : ''}
                        ${e.timeRange ? `<span class="kw-browse-time">${e.timeRange}</span>` : ''}
                    </div>
                `).join('')}
            </div>`;
        }).join('');

        body.innerHTML = `
            <div class="kw-browse-panel">
                <div class="kw-browse-tabs">${tabs}</div>
                ${panels}
            </div>
        `;

        body.querySelectorAll('.kw-browse-tab').forEach(tab => {
            tab.onclick = () => {
                body.querySelectorAll('.kw-browse-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                body.querySelectorAll('.kw-browse-list').forEach(l => l.style.display = 'none');
                body.querySelector(`.kw-browse-list[data-type="${tab.dataset.type}"]`).style.display = 'block';
            };
        });
    }

    async _kwRenderGraph(overlay) {
        const body = overlay.querySelector('#kw-body');
        const BRIDGE = 'http://127.0.0.1:19840';
        try {
            const data = await fetch(`${BRIDGE}/writing/knowledge/graph?limit=80`).then(r => r.json());
            if (!data.nodes?.length) {
                body.innerHTML = `<div class="kw-empty-state">
                    <i class="fas fa-project-diagram" style="font-size:48px;color:#AB47BC;opacity:0.4"></i>
                    <p>还没有足够的知识实体来绘制图谱</p>
                    <p style="color:#999;font-size:13px">索引更多故事后，实体之间的关系网络将在此可视化</p>
                </div>`;
                return;
            }

            const typeColors = {
                dynasty: '#FF9800', person: '#2196F3', event: '#F44336',
                place: '#4CAF50', concept: '#9C27B0',
            };

            const width = 760, height = 500;
            const legend = Object.entries(typeColors)
                .map(([t, c]) => `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px"><span style="width:10px;height:10px;border-radius:50%;background:${c};display:inline-block"></span>${this._kwTypeLabel(t)}</span>`)
                .join('');

            body.innerHTML = `
                <div class="kw-graph-panel">
                    <div class="kw-graph-legend">${legend}</div>
                    <svg id="kw-graph-svg" width="${width}" height="${height}" style="background:#1a1a2e;border-radius:8px">
                    </svg>
                </div>
            `;

            this._kwDrawForceGraph(data.nodes, data.edges, width, height, typeColors);
        } catch (err) {
            body.innerHTML = `<div class="kw-empty"><i class="fas fa-exclamation-triangle"></i> ${err.message}</div>`;
        }
    }

    _kwDrawForceGraph(nodes, edges, width, height, typeColors) {
        const svg = document.getElementById('kw-graph-svg');
        if (!svg || !nodes.length) return;

        const nodeMap = new Map();
        nodes.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / nodes.length;
            const r = Math.min(width, height) * 0.35;
            n.x = width / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40;
            n.y = height / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40;
            n.vx = 0; n.vy = 0;
            nodeMap.set(n.id, n);
        });

        const validEdges = edges.filter(e => nodeMap.has(e.source) && nodeMap.has(e.target));

        const simulate = () => {
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i], b = nodes[j];
                    let dx = b.x - a.x, dy = b.y - a.y;
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    let force = 800 / (dist * dist);
                    a.vx -= (dx / dist) * force;
                    a.vy -= (dy / dist) * force;
                    b.vx += (dx / dist) * force;
                    b.vy += (dy / dist) * force;
                }
            }

            for (const e of validEdges) {
                const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
                let dx = b.x - a.x, dy = b.y - a.y;
                let dist = Math.sqrt(dx * dx + dy * dy) || 1;
                let force = (dist - 100) * 0.01;
                a.vx += (dx / dist) * force;
                a.vy += (dy / dist) * force;
                b.vx -= (dx / dist) * force;
                b.vy -= (dy / dist) * force;
            }

            for (const n of nodes) {
                let cx = width / 2 - n.x, cy = height / 2 - n.y;
                n.vx += cx * 0.001;
                n.vy += cy * 0.001;
                n.vx *= 0.9; n.vy *= 0.9;
                n.x += n.vx; n.y += n.vy;
                n.x = Math.max(20, Math.min(width - 20, n.x));
                n.y = Math.max(20, Math.min(height - 20, n.y));
            }
        };

        for (let step = 0; step < 120; step++) simulate();

        let svgContent = '<defs><marker id="kw-arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#555"/></marker></defs>';

        for (const e of validEdges) {
            const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
            svgContent += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#444" stroke-width="1" marker-end="url(#kw-arrow)"/>`;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            svgContent += `<text x="${mx}" y="${my - 4}" text-anchor="middle" fill="#888" font-size="9">${e.label}</text>`;
        }

        for (const n of nodes) {
            const color = typeColors[n.type] || '#999';
            const r = n.size || 6;
            svgContent += `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5" style="cursor:pointer">
                <title>${n.label} (${this._kwTypeLabel(n.type)})</title>
            </circle>`;
            svgContent += `<text x="${n.x}" y="${n.y + r + 12}" text-anchor="middle" fill="#ccc" font-size="10" font-weight="500">${n.label}</text>`;
        }

        svg.innerHTML = svgContent;
    }

    async _kwIndexAll(overlay) {
        const btn = overlay.querySelector('[data-kw-action="index-all"]');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 索引中...';

        const BRIDGE = 'http://127.0.0.1:19840';
        const stories = this._posts.filter(p => ['history', 'thought', 'modern', 'geography'].includes(p.category));

        let indexed = 0, skipped = 0, failed = 0;

        for (const story of stories) {
            try {
                const checkRes = await fetch(`${BRIDGE}/writing/knowledge/indexed?externalId=${encodeURIComponent(story.externalId || story.id)}`).then(r => r.json());
                if (checkRes.indexed) { skipped++; continue; }

                const extractText = `故事标题：${story.title}\n故事分类：${story.category}\n故事内容：\n${(story.content || '').substring(0, 6000)}`;

                const response = await fetch(`${BRIDGE}/writing/knowledge-extract`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: extractText }),
                });

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullText = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    for (const line of chunk.split('\n')) {
                        if (line.startsWith('data: ')) {
                            const d = line.slice(6);
                            if (d === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(d);
                                if (parsed.content) fullText += parsed.content;
                            } catch {}
                        }
                    }
                }

                const jsonMatch = fullText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const extracted = JSON.parse(jsonMatch[0]);
                    const entities = (extracted.entities || []).map(e => ({
                        ...e,
                        storyExternalId: story.externalId || story.id,
                        category: story.category,
                    }));
                    await fetch(`${BRIDGE}/writing/knowledge/index`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            storyExternalId: story.externalId || story.id,
                            entities,
                            relations: extracted.relations || [],
                        }),
                    });
                    indexed++;
                    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${indexed}/${stories.length}`;
                } else {
                    failed++;
                }
            } catch (err) {
                console.warn('[KW] 索引失败:', story.title, err);
                failed++;
            }
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-magic"></i> 一键索引';
        this._showToast(`索引完成: ${indexed} 篇成功, ${skipped} 篇跳过, ${failed} 篇失败`, indexed > 0 ? 'success' : 'info');

        if (indexed > 0) await this._kwSwitchTab(overlay, 'overview');
    }

    _kwTypeLabel(type) {
        return { dynasty: '朝代', person: '人物', event: '事件', place: '地点', concept: '概念' }[type] || type;
    }

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
