/**
 * 知识墙模块 - 瀑布流信息管理
 * 支持笔记、链接、代码片段、联系人、周记等多种卡片类型
 * v2.0: 密码保护、Markdown 渲染
 */
class KnowledgeWall {
    constructor() {
        this.cards = [];
        this.filteredCards = [];
        this.searchQuery = '';
        this.filterType = 'all';
        this.isOpen = false;
        this.editingCardId = null;
        this._unlockedCards = new Set();
        this._failedAttempts = {};
        this._lockoutUntil = {};

        this.typeConfig = {
            note:    { label: '笔记',   icon: 'fas fa-sticky-note',    color: 'rgba(255,200,80,0.8)',  bg: 'rgba(255,200,80,0.1)' },
            link:    { label: '链接',   icon: 'fas fa-link',           color: 'rgba(100,180,255,0.8)', bg: 'rgba(100,180,255,0.1)' },
            code:    { label: '代码',   icon: 'fas fa-code',           color: 'rgba(92,216,92,0.8)',   bg: 'rgba(92,216,92,0.1)' },
            contact: { label: '联系人', icon: 'fas fa-user',           color: 'rgba(255,100,150,0.8)', bg: 'rgba(255,100,150,0.1)' },
            weekly:  { label: '周记',   icon: 'fas fa-calendar-week',  color: 'rgba(180,100,255,0.8)', bg: 'rgba(180,100,255,0.1)' }
        };
    }

    async init() {
        this._configureMarked();
        await this.loadData();
        this._restoreUnlockedSession();
        this.injectDOM();
        this.bindEvents();
    }

    _configureMarked() {
        if (typeof marked === 'undefined') return;
        try {
            const renderer = new marked.Renderer();
            renderer.link = function ({ href, title, text }) {
                const titleAttr = title ? ` title="${title}"` : '';
                return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr}>${text}</a>`;
            };
            renderer.image = function ({ href, title, text }) {
                const titleAttr = title ? ` title="${title}"` : '';
                return `<img src="${href}" alt="${text}"${titleAttr} class="kw-md-img" loading="lazy">`;
            };
            renderer.code = function ({ text, lang }) {
                if (lang === 'mermaid') {
                    const id = 'mermaid-' + Math.random().toString(36).slice(2, 10);
                    return `<div class="kw-mermaid-block" data-mermaid-id="${id}"><pre class="mermaid">${text}</pre></div>`;
                }
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    const highlighted = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
                    return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
                }
                if (typeof hljs !== 'undefined') {
                    const auto = hljs.highlightAuto(text).value;
                    return `<pre><code class="hljs">${auto}</code></pre>`;
                }
                const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<pre><code>${escaped}</code></pre>`;
            };
            marked.setOptions({
                renderer,
                breaks: true,
                gfm: true,
            });
        } catch (e) {
            console.warn('marked 配置失败:', e);
        }
    }

    // ===================== 存储 =====================

    async loadData() {
        try {
            const result = await new Promise(resolve =>
                chrome.storage.local.get('knowledgeWall', resolve)
            );
            this.cards = Array.isArray(result.knowledgeWall) ? result.knowledgeWall : [];
        } catch (e) {
            console.warn('知识墙数据加载失败:', e);
            this.cards = [];
        }
    }

    async saveData() {
        try {
            await chrome.storage.local.set({ knowledgeWall: this.cards });
        } catch (e) {
            console.error('知识墙数据保存失败:', e);
        }
    }

    // ===================== 密码安全 =====================

    async _hashPassword(password, salt) {
        const enc = new TextEncoder();
        const data = enc.encode(salt + password);
        const hashBuf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    _generateSalt() {
        return Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    _isCardUnlocked(cardId) {
        return this._unlockedCards.has(cardId);
    }

    _unlockCard(cardId) {
        this._unlockedCards.add(cardId);
        this._persistUnlockedSession();
    }

    _lockCard(cardId) {
        this._unlockedCards.delete(cardId);
        this._persistUnlockedSession();
    }

    _persistUnlockedSession() {
        try {
            sessionStorage.setItem('kw_unlocked', JSON.stringify([...this._unlockedCards]));
        } catch { /* ignore */ }
    }

    _restoreUnlockedSession() {
        try {
            const saved = sessionStorage.getItem('kw_unlocked');
            if (saved) this._unlockedCards = new Set(JSON.parse(saved));
        } catch { /* ignore */ }
    }

    // ===================== Markdown (marked.js + DOMPurify) =====================

    _renderMarkdown(text) {
        if (!text) return '';
        try {
            if (typeof marked !== 'undefined' && marked.parse) {
                const raw = marked.parse(text, { breaks: true, gfm: true });
                if (typeof DOMPurify !== 'undefined') {
                    return DOMPurify.sanitize(raw, {
                        ADD_ATTR: ['target', 'rel', 'data-mermaid-id'],
                        ADD_TAGS: ['svg', 'g', 'path', 'line', 'rect', 'circle', 'text', 'tspan', 'polygon', 'polyline', 'marker', 'defs', 'style', 'foreignObject'],
                        ALLOWED_TAGS: [
                            'h1','h2','h3','h4','h5','h6','p','br','hr',
                            'strong','em','del','s','blockquote',
                            'ul','ol','li','a','img','code','pre',
                            'table','thead','tbody','tr','th','td',
                            'input','div','span',
                        ],
                    });
                }
                return raw;
            }
        } catch (e) {
            console.warn('Markdown 渲染失败，回退纯文本:', e);
        }
        return this._escapeHtml(text).replace(/\n/g, '<br>');
    }

    _renderMermaidBlocks(containerEl) {
        if (typeof mermaid === 'undefined' || !containerEl) return;
        const blocks = containerEl.querySelectorAll('.kw-mermaid-block[data-mermaid-id]');
        if (blocks.length === 0) return;
        try {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                themeVariables: {
                    darkMode: true,
                    background: 'transparent',
                    primaryColor: '#3b82f6',
                    primaryTextColor: '#e2e8f0',
                    primaryBorderColor: '#4b5563',
                    lineColor: '#6b7280',
                    secondaryColor: '#1e3a5f',
                    tertiaryColor: '#1a1a2e',
                },
                flowchart: { htmlLabels: true, curve: 'basis' },
                sequence: { showSequenceNumbers: true },
            });
            blocks.forEach(async (block) => {
                const id = block.dataset.mermaidId;
                const preEl = block.querySelector('pre.mermaid');
                if (!preEl) return;
                const definition = preEl.textContent;
                try {
                    const { svg } = await mermaid.render(id, definition);
                    block.innerHTML = svg;
                    block.classList.add('kw-mermaid-rendered');
                } catch (err) {
                    block.innerHTML = `<pre class="kw-mermaid-error"><code>Mermaid 渲染失败: ${err.message}\n\n${definition}</code></pre>`;
                }
            });
        } catch (e) {
            console.warn('Mermaid 初始化失败:', e);
        }
    }

    _hasMarkdownSyntax(text) {
        if (!text) return false;
        return /^#{1,3} |^\d+\. |^- |\*\*|`{1,3}|^> |^---|\[.+\]\(.+\)|!\[/.test(text);
    }

    // ===================== DOM 注入 =====================

    injectDOM() {
        const trigger = document.getElementById('kw-dock-btn');

        const overlay = document.createElement('div');
        overlay.className = 'kw-overlay';
        overlay.id = 'kw-overlay';
        overlay.innerHTML = `
            <div class="kw-panel">
                <div class="kw-header">
                    <h2><i class="fas fa-brain"></i> 常用信息</h2>
                    <div class="kw-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="kw-search-input" placeholder="搜索信息..." autocomplete="off">
                    </div>
                    <div class="kw-filter-bar" id="kw-filter-bar">
                        <button class="kw-filter-btn active" data-type="all">全部</button>
                        <button class="kw-filter-btn" data-type="note">笔记</button>
                        <button class="kw-filter-btn" data-type="link">链接</button>
                        <button class="kw-filter-btn" data-type="code">代码</button>
                        <button class="kw-filter-btn" data-type="contact">联系人</button>
                        <button class="kw-filter-btn" data-type="weekly">周记</button>
                    </div>
                    <div class="kw-actions">
                        <button id="kw-add-btn" title="添加卡片"><i class="fas fa-plus"></i></button>
                        <button id="kw-export-btn" title="导出数据"><i class="fas fa-file-export"></i></button>
                        <button id="kw-import-btn" title="导入数据"><i class="fas fa-file-import"></i></button>
                        <input type="file" id="kw-import-file" accept=".json" hidden>
                    </div>
                    <button class="kw-close" id="kw-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="kw-content" id="kw-content">
                    <div class="kw-masonry" id="kw-masonry"></div>
                    <div class="kw-empty hidden" id="kw-empty">
                        <i class="fas fa-folder-open"></i>
                        <p>暂无信息卡片</p>
                        <span>点击右上角 + 添加你的第一张卡片</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    // ===================== 事件 =====================

    bindEvents() {
        const trigger = document.getElementById('kw-dock-btn');
        const overlay = document.getElementById('kw-overlay');
        const closeBtn = document.getElementById('kw-close');
        const searchInput = document.getElementById('kw-search-input');
        const addBtn = document.getElementById('kw-add-btn');
        const exportBtn = document.getElementById('kw-export-btn');
        const importBtn = document.getElementById('kw-import-btn');
        const importFile = document.getElementById('kw-import-file');
        const filterBar = document.getElementById('kw-filter-bar');

        trigger?.addEventListener('click', () => this.open());
        closeBtn.addEventListener('click', () => this.close());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.searchQuery = searchInput.value.trim().toLowerCase();
                this.applyFilter();
                this.render();
            }, 200);
        });

        filterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.kw-filter-btn');
            if (!btn) return;
            filterBar.querySelectorAll('.kw-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.filterType = btn.dataset.type;
            this.applyFilter();
            this.render();
        });

        addBtn.addEventListener('click', () => this.showEditor());
        exportBtn.addEventListener('click', () => this.exportData());
        importBtn.addEventListener('click', () => { importFile.value = ''; importFile.click(); });
        importFile.addEventListener('change', (e) => this.importData(e));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                const pwDialog = document.getElementById('kw-pw-dialog');
                if (pwDialog) { pwDialog.remove(); return; }
                const editor = document.getElementById('kw-editor-overlay');
                if (editor) { editor.remove(); this.editingCardId = null; return; }
                this.close();
            }
        });
    }

    // ===================== 开关 =====================

    open() {
        this.isOpen = true;
        this.applyFilter();
        this.render();
        const overlay = document.getElementById('kw-overlay');
        overlay.classList.add('open');
    }

    close() {
        this.isOpen = false;
        document.getElementById('kw-overlay').classList.remove('open');
    }

    // ===================== 筛选 =====================

    applyFilter() {
        let list = [...this.cards];
        if (this.filterType !== 'all') {
            list = list.filter(c => c.type === this.filterType);
        }
        if (this.searchQuery) {
            list = list.filter(c => {
                const text = `${c.title} ${c.content} ${(c.tags || []).join(' ')} ${(c.links || []).map(l => l.title + ' ' + l.url).join(' ')}`.toLowerCase();
                return text.includes(this.searchQuery);
            });
        }
        list.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
        });
        this.filteredCards = list;
    }

    // ===================== 渲染 =====================

    render() {
        const masonry = document.getElementById('kw-masonry');
        const empty = document.getElementById('kw-empty');

        if (this.filteredCards.length === 0) {
            masonry.innerHTML = '';
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        masonry.innerHTML = this.filteredCards.map(card => this.renderCard(card)).join('');
        this.bindCardEvents(masonry);
        this._renderMermaidBlocks(masonry);
    }

    renderCard(card) {
        const cfg = this.typeConfig[card.type] || this.typeConfig.note;
        const esc = (s) => this._escapeHtml(s || '');
        const timeStr = this._formatTime(card.updatedAt || card.createdAt);
        const isProtected = card.isProtected && card.passwordHash;
        const isUnlocked = isProtected && this._isCardUnlocked(card.id);
        const showContent = !isProtected || isUnlocked;

        let bodyHtml = '';
        if (showContent) {
            if (card.type === 'code' && card.content) {
                bodyHtml = `<pre class="wc-code">${esc(card.content)}</pre>`;
            } else if (card.type === 'link' && card.links && card.links.length > 0) {
                bodyHtml = `<div class="wc-links">${card.links.map(l =>
                    `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" title="${esc(l.url)}"><i class="fas fa-external-link-alt"></i> ${esc(l.title || l.url)}</a>`
                ).join('')}</div>`;
                if (card.content) {
                    if (card.useMarkdown && this._hasMarkdownSyntax(card.content)) {
                        bodyHtml += `<div class="wc-text kw-md-body">${this._renderMarkdown(card.content)}</div>`;
                    } else {
                        bodyHtml += `<div class="wc-text">${esc(card.content).replace(/\n/g, '<br>')}</div>`;
                    }
                }
            } else if (card.content) {
                if (card.useMarkdown && this._hasMarkdownSyntax(card.content)) {
                    bodyHtml = `<div class="wc-text kw-md-body">${this._renderMarkdown(card.content)}</div>`;
                } else {
                    bodyHtml = `<div class="wc-text">${esc(card.content).replace(/\n/g, '<br>')}</div>`;
                }
            }
        } else {
            bodyHtml = `
                <div class="wc-locked-mask" data-card-id="${card.id}">
                    <i class="fas fa-lock"></i>
                    <span>内容已加密，点击解锁查看</span>
                </div>`;
        }

        const tagsHtml = card.tags && card.tags.length > 0
            ? `<div class="wc-tags">${card.tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>`
            : '';

        const lockIcon = isProtected
            ? `<span class="wc-lock-badge${isUnlocked ? ' wc-lock-toggle' : ''}" data-card-id="${card.id}" title="${isUnlocked ? '点击重新锁定' : '密码保护'}"><i class="fas fa-${isUnlocked ? 'lock-open' : 'lock'}"></i></span>`
            : '';

        const mdBadge = card.useMarkdown
            ? `<span class="wc-md-badge" title="Markdown"><i class="fab fa-markdown"></i></span>`
            : '';

        return `
            <div class="wall-card${card.pinned ? ' pinned' : ''}${isProtected && !isUnlocked ? ' protected' : ''}" data-id="${card.id}">
                <div class="wc-header">
                    <div class="wc-type" style="background:${cfg.bg};color:${cfg.color};">
                        <i class="${cfg.icon}"></i> ${cfg.label}
                    </div>
                    <div class="wc-badges">${lockIcon}${mdBadge}</div>
                    <div class="wc-card-actions">
                        ${card.type === 'code' ? `<button class="wc-action-btn" data-action="copy" title="复制内容"><i class="fas fa-copy"></i></button>` : ''}
                        <button class="wc-action-btn" data-action="pin" title="${card.pinned ? '取消置顶' : '置顶'}"><i class="fas fa-thumbtack${card.pinned ? '' : ' fa-rotate-90'}"></i></button>
                        <button class="wc-action-btn" data-action="edit" title="编辑"><i class="fas fa-pen"></i></button>
                        <button class="wc-action-btn wc-danger" data-action="delete" title="删除"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
                <div class="wc-title">${esc(card.title)}</div>
                ${bodyHtml}
                ${tagsHtml}
                <div class="wc-meta">
                    <span><i class="fas fa-clock"></i> ${timeStr}</span>
                    ${card.viewCount > 0 ? `<span><i class="fas fa-eye"></i> ${card.viewCount} 次</span>` : ''}
                </div>
            </div>
        `;
    }

    bindCardEvents(container) {
        container.querySelectorAll('.wall-card').forEach(el => {
            const cardId = el.dataset.id;

            el.querySelectorAll('.wc-action-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    if (action === 'edit') this.showEditor(cardId);
                    else if (action === 'delete') this.deleteCard(cardId);
                    else if (action === 'pin') this.togglePin(cardId);
                    else if (action === 'copy') this.copyContent(cardId);
                });
            });

            el.querySelectorAll('.wc-links a').forEach(a => {
                a.addEventListener('click', (e) => e.stopPropagation());
            });

            const lockMask = el.querySelector('.wc-locked-mask');
            if (lockMask) {
                lockMask.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._showPasswordDialog(cardId);
                });
            }

            const lockToggle = el.querySelector('.wc-lock-toggle');
            if (lockToggle) {
                lockToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._lockCard(lockToggle.dataset.cardId);
                    this.render();
                });
            }
        });
    }

    // ===================== 密码对话框 =====================

    _showPasswordDialog(cardId) {
        const existing = document.getElementById('kw-pw-dialog');
        if (existing) existing.remove();

        const dialog = document.createElement('div');
        dialog.className = 'kw-pw-dialog-overlay';
        dialog.id = 'kw-pw-dialog';
        dialog.innerHTML = `
            <div class="kw-pw-dialog">
                <div class="kw-pw-header">
                    <i class="fas fa-lock"></i>
                    <span>输入密码解锁</span>
                </div>
                <div class="kw-pw-body">
                    <input type="password" id="kw-pw-input" placeholder="请输入卡片密码..." autocomplete="off">
                    <div class="kw-pw-error hidden" id="kw-pw-error">密码错误，请重试</div>
                </div>
                <div class="kw-pw-footer">
                    <button class="kw-pw-cancel" id="kw-pw-cancel">取消</button>
                    <button class="kw-pw-confirm" id="kw-pw-confirm"><i class="fas fa-unlock"></i> 解锁</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        requestAnimationFrame(() => dialog.classList.add('open'));

        const input = dialog.querySelector('#kw-pw-input');
        const errorEl = dialog.querySelector('#kw-pw-error');
        const closeDialog = () => {
            dialog.classList.remove('open');
            setTimeout(() => dialog.remove(), 250);
        };

        dialog.querySelector('#kw-pw-cancel').addEventListener('click', closeDialog);
        dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });

        const tryUnlock = async () => {
            const now = Date.now();
            const lockUntil = this._lockoutUntil[cardId] || 0;
            if (now < lockUntil) {
                const remain = Math.ceil((lockUntil - now) / 1000);
                errorEl.textContent = `操作过于频繁，请 ${remain} 秒后再试`;
                errorEl.classList.remove('hidden');
                return;
            }

            const password = input.value;
            if (!password) { input.focus(); return; }
            const card = this.cards.find(c => c.id === cardId);
            if (!card) { closeDialog(); return; }

            const hash = await this._hashPassword(password, card.passwordSalt || '');
            if (hash === card.passwordHash) {
                this._failedAttempts[cardId] = 0;
                this._unlockCard(cardId);
                card.viewCount = (card.viewCount || 0) + 1;
                await this.saveData();
                closeDialog();
                this.render();
            } else {
                this._failedAttempts[cardId] = (this._failedAttempts[cardId] || 0) + 1;
                const attempts = this._failedAttempts[cardId];
                if (attempts >= 5) {
                    this._lockoutUntil[cardId] = now + 30000;
                    this._failedAttempts[cardId] = 0;
                    errorEl.textContent = '错误次数过多，已锁定 30 秒';
                } else {
                    errorEl.textContent = `密码错误（${attempts}/5），请重试`;
                }
                errorEl.classList.remove('hidden');
                input.value = '';
                input.focus();
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 400);
            }
        };

        dialog.querySelector('#kw-pw-confirm').addEventListener('click', tryUnlock);
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
        setTimeout(() => input.focus(), 100);
    }

    // ===================== CRUD =====================

    async deleteCard(id) {
        if (!confirm('确定要删除这张卡片吗？')) return;
        this.cards = this.cards.filter(c => c.id !== id);
        this._unlockedCards.delete(id);
        await this.saveData();
        this.applyFilter();
        this.render();
    }

    async togglePin(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card) return;
        card.pinned = !card.pinned;
        card.updatedAt = Date.now();
        await this.saveData();
        this.applyFilter();
        this.render();
    }

    async copyContent(id) {
        const card = this.cards.find(c => c.id === id);
        if (!card || !card.content) return;
        if (card.isProtected && !this._isCardUnlocked(id)) {
            this._showPasswordDialog(id);
            return;
        }
        try {
            await navigator.clipboard.writeText(card.content);
            card.viewCount = (card.viewCount || 0) + 1;
            await this.saveData();
            this._showToast('已复制到剪贴板');
        } catch {
            this._showToast('复制失败');
        }
    }

    // ===================== 编辑器 =====================

    showEditor(cardId) {
        const existing = document.getElementById('kw-editor-overlay');
        if (existing) existing.remove();

        const card = cardId ? this.cards.find(c => c.id === cardId) : null;
        this.editingCardId = cardId || null;
        const isEdit = !!card;

        const overlay = document.createElement('div');
        overlay.className = 'kw-editor-overlay';
        overlay.id = 'kw-editor-overlay';
        overlay.innerHTML = `
            <div class="kw-editor kw-editor-resizable" id="kw-editor-dialog">
                <div class="kw-editor-header" id="kw-editor-drag-handle">
                    <h3>${isEdit ? '编辑卡片' : '新增卡片'}</h3>
                    <button class="kw-editor-close" id="kw-editor-close"><i class="fas fa-times"></i></button>
                </div>
                <div class="kw-editor-body">
                    <div class="kw-editor-row">
                        <label>类型</label>
                        <div class="kw-type-selector" id="kw-type-selector">
                            ${Object.entries(this.typeConfig).map(([k, v]) =>
                                `<button class="kw-type-opt${card?.type === k || (!card && k === 'note') ? ' active' : ''}" data-type="${k}" style="--tc:${v.color};--tbg:${v.bg}">
                                    <i class="${v.icon}"></i> ${v.label}
                                </button>`
                            ).join('')}
                        </div>
                    </div>
                    <div class="kw-editor-row">
                        <label>标题 <span class="required">*</span></label>
                        <input type="text" id="kw-ed-title" value="${this._escapeHtml(card?.title || '')}" placeholder="输入标题..." maxlength="200">
                    </div>
                    <div class="kw-editor-row kw-ed-content-row">
                        <div class="kw-ed-content-header">
                            <label>内容</label>
                            <div class="kw-ed-content-toolbar">
                                <label class="kw-md-toggle" title="启用 Markdown 渲染">
                                    <input type="checkbox" id="kw-ed-markdown" ${card?.useMarkdown ? 'checked' : ''}>
                                    <i class="fab fa-markdown"></i>
                                    <span>Markdown</span>
                                </label>
                                <div class="kw-md-btns ${card?.useMarkdown ? '' : 'hidden'}" id="kw-md-btns">
                                    <button type="button" class="kw-md-btn" data-md="bold" title="粗体"><i class="fas fa-bold"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="italic" title="斜体"><i class="fas fa-italic"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="heading" title="标题"><i class="fas fa-heading"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="list" title="无序列表"><i class="fas fa-list-ul"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="olist" title="有序列表"><i class="fas fa-list-ol"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="code" title="代码"><i class="fas fa-code"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="quote" title="引用"><i class="fas fa-quote-right"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="link" title="链接"><i class="fas fa-link"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="task" title="任务列表"><i class="fas fa-tasks"></i></button>
                                    <button type="button" class="kw-md-btn" data-md="mermaid" title="Mermaid 图表"><i class="fas fa-project-diagram"></i></button>
                                    <button type="button" class="kw-md-btn kw-md-preview-btn" data-md="preview" title="预览"><i class="fas fa-eye"></i></button>
                                </div>
                            </div>
                        </div>
                        <div class="kw-ed-content-area">
                            <textarea id="kw-ed-content" rows="8" placeholder="输入内容... (支持 Markdown 语法)">${this._escapeHtml(card?.content || '')}</textarea>
                            <div class="kw-md-preview hidden" id="kw-md-preview"></div>
                        </div>
                        <div class="kw-md-hint ${card?.useMarkdown ? '' : 'hidden'}" id="kw-md-hint">
                            <span>支持: **粗体** *斜体* # 标题 - 列表 \`\`\`js 代码高亮\`\`\` \`\`\`mermaid 图表\`\`\` > 引用 [链接](url) ~~删除线~~</span>
                        </div>
                    </div>
                    <div class="kw-editor-row kw-links-section${card?.type === 'link' || (!card) ? '' : ' hidden'}" id="kw-links-section">
                        <label>链接列表</label>
                        <div id="kw-ed-links">${(card?.links || []).map((l, i) => this._renderLinkRow(l, i)).join('')}</div>
                        <button class="kw-link-add-btn" id="kw-link-add"><i class="fas fa-plus"></i> 添加链接</button>
                    </div>
                    <div class="kw-editor-row">
                        <label>标签（逗号分隔）</label>
                        <input type="text" id="kw-ed-tags" value="${(card?.tags || []).join(', ')}" placeholder="如：工作, 学习, 前端">
                    </div>
                    <div class="kw-editor-row kw-pw-section">
                        <label>密码保护</label>
                        <div class="kw-pw-toggle-row">
                            <label class="kw-pw-switch">
                                <input type="checkbox" id="kw-ed-protected" ${card?.isProtected ? 'checked' : ''}>
                                <span class="kw-pw-slider"></span>
                            </label>
                            <span class="kw-pw-label">${card?.isProtected ? '已启用密码保护' : '关闭'}</span>
                        </div>
                        <div class="kw-pw-fields ${card?.isProtected ? '' : 'hidden'}" id="kw-pw-fields">
                            <input type="password" id="kw-ed-password" placeholder="${isEdit && card?.isProtected ? '留空保持原密码，输入新密码则更新' : '设置访问密码'}" autocomplete="new-password">
                            ${isEdit && card?.isProtected ? '<p class="kw-pw-note"><i class="fas fa-info-circle"></i> 留空则保持当前密码不变</p>' : ''}
                        </div>
                    </div>
                </div>
                <div class="kw-editor-footer">
                    <button class="kw-ed-cancel" id="kw-ed-cancel">取消</button>
                    <button class="kw-ed-save" id="kw-ed-save"><i class="fas fa-check"></i> 保存</button>
                </div>
                <div class="kw-editor-resize-handle" id="kw-editor-resize-handle" title="拖动调整大小"></div>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('open'));
        this._bindEditorEvents(overlay, card);
    }

    _renderLinkRow(link, index) {
        return `
            <div class="kw-link-row" data-index="${index}">
                <input type="text" class="kw-link-title" value="${this._escapeHtml(link?.title || '')}" placeholder="链接标题">
                <input type="url" class="kw-link-url" value="${this._escapeHtml(link?.url || '')}" placeholder="https://...">
                <button class="kw-link-remove" title="移除"><i class="fas fa-times"></i></button>
            </div>`;
    }

    _bindEditorEvents(overlay, card) {
        const editorDialog = overlay.querySelector('#kw-editor-dialog');
        const closeEditor = () => {
            overlay.classList.remove('open');
            setTimeout(() => overlay.remove(), 300);
            this.editingCardId = null;
        };

        overlay.querySelector('#kw-editor-close').addEventListener('click', closeEditor);
        overlay.querySelector('#kw-ed-cancel').addEventListener('click', closeEditor);

        // 拖动编辑器移动
        this._initEditorDrag(overlay, editorDialog);

        // 拖动调整大小
        this._initEditorResize(overlay, editorDialog);

        // 类型选择
        const typeSelector = overlay.querySelector('#kw-type-selector');
        const linksSection = overlay.querySelector('#kw-links-section');
        typeSelector.addEventListener('click', (e) => {
            const btn = e.target.closest('.kw-type-opt');
            if (!btn) return;
            typeSelector.querySelectorAll('.kw-type-opt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            linksSection.classList.toggle('hidden', btn.dataset.type !== 'link');
        });

        // Markdown 开关
        const mdCheckbox = overlay.querySelector('#kw-ed-markdown');
        const mdBtns = overlay.querySelector('#kw-md-btns');
        const mdHint = overlay.querySelector('#kw-md-hint');
        mdCheckbox.addEventListener('change', () => {
            mdBtns.classList.toggle('hidden', !mdCheckbox.checked);
            mdHint.classList.toggle('hidden', !mdCheckbox.checked);
        });

        // Markdown 工具栏按钮
        const textarea = overlay.querySelector('#kw-ed-content');
        const preview = overlay.querySelector('#kw-md-preview');
        overlay.querySelectorAll('.kw-md-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.md;
                if (action === 'preview') {
                    const isActive = preview.classList.toggle('hidden') === false;
                    btn.classList.toggle('active', isActive);
                    if (isActive) {
                        preview.innerHTML = this._renderMarkdown(textarea.value);
                        this._renderMermaidBlocks(preview);
                    }
                    return;
                }
                this._insertMarkdownSyntax(textarea, action);
            });
        });

        // Markdown 实时预览
        let previewTimer;
        textarea.addEventListener('input', () => {
            if (!preview.classList.contains('hidden')) {
                clearTimeout(previewTimer);
                previewTimer = setTimeout(() => {
                    preview.innerHTML = this._renderMarkdown(textarea.value);
                    this._renderMermaidBlocks(preview);
                }, 300);
            }
        });

        // 密码保护开关
        const protectedCheckbox = overlay.querySelector('#kw-ed-protected');
        const pwFields = overlay.querySelector('#kw-pw-fields');
        const pwLabel = overlay.querySelector('.kw-pw-label');
        protectedCheckbox.addEventListener('change', () => {
            pwFields.classList.toggle('hidden', !protectedCheckbox.checked);
            pwLabel.textContent = protectedCheckbox.checked ? '已启用密码保护' : '关闭';
        });

        // 添加链接
        overlay.querySelector('#kw-link-add').addEventListener('click', () => {
            const container = overlay.querySelector('#kw-ed-links');
            const idx = container.children.length;
            container.insertAdjacentHTML('beforeend', this._renderLinkRow(null, idx));
            this._bindLinkRemove(container);
        });
        this._bindLinkRemove(overlay.querySelector('#kw-ed-links'));

        // 保存
        overlay.querySelector('#kw-ed-save').addEventListener('click', async () => {
            const title = overlay.querySelector('#kw-ed-title').value.trim();
            if (!title) { overlay.querySelector('#kw-ed-title').focus(); return; }

            const type = typeSelector.querySelector('.kw-type-opt.active')?.dataset.type || 'note';
            const content = overlay.querySelector('#kw-ed-content').value.trim();
            const tagsStr = overlay.querySelector('#kw-ed-tags').value;
            const tags = tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean);
            const useMarkdown = mdCheckbox.checked;

            const links = [];
            overlay.querySelectorAll('.kw-link-row').forEach(row => {
                const url = row.querySelector('.kw-link-url')?.value.trim();
                const linkTitle = row.querySelector('.kw-link-title')?.value.trim();
                if (url) links.push({ url, title: linkTitle || url });
            });

            // 密码保护处理
            const isProtected = protectedCheckbox.checked;
            const newPassword = overlay.querySelector('#kw-ed-password')?.value || '';
            let passwordHash = null;
            let passwordSalt = null;

            if (isProtected) {
                if (newPassword) {
                    passwordSalt = this._generateSalt();
                    passwordHash = await this._hashPassword(newPassword, passwordSalt);
                } else if (this.editingCardId) {
                    const existing = this.cards.find(x => x.id === this.editingCardId);
                    if (existing) {
                        passwordHash = existing.passwordHash;
                        passwordSalt = existing.passwordSalt;
                    }
                }
                if (!passwordHash) {
                    this._showToast('请设置密码');
                    overlay.querySelector('#kw-ed-password')?.focus();
                    return;
                }
            }

            const now = Date.now();
            if (this.editingCardId) {
                const c = this.cards.find(x => x.id === this.editingCardId);
                if (c) {
                    Object.assign(c, {
                        type, title, content, links, tags, useMarkdown,
                        isProtected, passwordHash, passwordSalt,
                        updatedAt: now
                    });
                }
            } else {
                this.cards.push({
                    id: 'kw_' + now + '_' + Math.random().toString(36).substring(2, 8),
                    type, title, content, links, tags, useMarkdown,
                    isProtected, passwordHash, passwordSalt,
                    pinned: false,
                    createdAt: now,
                    updatedAt: now,
                    viewCount: 0
                });
            }

            await this.saveData();

            if (isProtected) {
                const savedId = this.editingCardId || this.cards[this.cards.length - 1]?.id;
                if (savedId) this._lockCard(savedId);
            }

            this.applyFilter();
            this.render();
            closeEditor();
        });
    }

    _insertMarkdownSyntax(textarea, action) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const selected = text.substring(start, end);

        const insertions = {
            bold:    { before: '**', after: '**', placeholder: '粗体文字' },
            italic:  { before: '*', after: '*', placeholder: '斜体文字' },
            heading: { before: '## ', after: '', placeholder: '标题', lineStart: true },
            list:    { before: '- ', after: '', placeholder: '列表项', lineStart: true },
            olist:   { before: '1. ', after: '', placeholder: '列表项', lineStart: true },
            code:    { before: '`', after: '`', placeholder: 'code' },
            quote:   { before: '> ', after: '', placeholder: '引用文字', lineStart: true },
            link:    { before: '[', after: '](url)', placeholder: '链接文字' },
            task:    { before: '- [ ] ', after: '', placeholder: '任务项', lineStart: true },
            mermaid: { before: '```mermaid\n', after: '\n```', placeholder: 'graph TD\n    A[开始] --> B{判断}\n    B -->|是| C[结果1]\n    B -->|否| D[结果2]', lineStart: true },
        };

        const ins = insertions[action];
        if (!ins) return;

        let newText;
        let cursorPos;

        if (ins.lineStart && start === end) {
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            newText = text.substring(0, lineStart) + ins.before + (selected || ins.placeholder) + ins.after + text.substring(end);
            cursorPos = lineStart + ins.before.length + (selected || ins.placeholder).length;
        } else {
            newText = text.substring(0, start) + ins.before + (selected || ins.placeholder) + ins.after + text.substring(end);
            cursorPos = start + ins.before.length + (selected || ins.placeholder).length;
        }

        textarea.value = newText;
        textarea.focus();
        textarea.setSelectionRange(
            selected ? cursorPos : start + ins.before.length,
            cursorPos
        );
    }

    _bindLinkRemove(container) {
        container.querySelectorAll('.kw-link-remove').forEach(btn => {
            btn.onclick = () => btn.closest('.kw-link-row').remove();
        });
    }

    // ===================== 编辑器拖动 + 调整大小 =====================

    _initEditorDrag(overlay, dialog) {
        const handle = overlay.querySelector('#kw-editor-drag-handle');
        if (!handle || !dialog) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;

        handle.style.cursor = 'move';

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.kw-editor-close')) return;
            isDragging = true;

            const rect = dialog.getBoundingClientRect();
            if (!dialog.style.left) {
                dialog.style.position = 'fixed';
                dialog.style.left = rect.left + 'px';
                dialog.style.top = rect.top + 'px';
                dialog.style.margin = '0';
                dialog.style.transform = 'none';
            }

            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(dialog.style.left, 10);
            startTop = parseInt(dialog.style.top, 10);
            e.preventDefault();
        });

        const onMove = (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            dialog.style.left = Math.max(0, Math.min(window.innerWidth - 100, startLeft + dx)) + 'px';
            dialog.style.top = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy)) + 'px';
        };

        const onUp = () => { isDragging = false; };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    _initEditorResize(overlay, dialog) {
        const handle = overlay.querySelector('#kw-editor-resize-handle');
        if (!handle || !dialog) return;

        let isResizing = false;
        let startX, startY, startW, startH;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            const rect = dialog.getBoundingClientRect();
            startX = e.clientX;
            startY = e.clientY;
            startW = rect.width;
            startH = rect.height;

            if (!dialog.style.left) {
                dialog.style.position = 'fixed';
                dialog.style.left = rect.left + 'px';
                dialog.style.top = rect.top + 'px';
                dialog.style.margin = '0';
                dialog.style.transform = 'none';
            }

            e.preventDefault();
            e.stopPropagation();
        });

        const onMove = (e) => {
            if (!isResizing) return;
            const newW = Math.max(360, startW + (e.clientX - startX));
            const newH = Math.max(300, startH + (e.clientY - startY));
            dialog.style.width = newW + 'px';
            dialog.style.maxWidth = 'none';
            dialog.style.height = newH + 'px';
            dialog.style.maxHeight = 'none';
        };

        const onUp = () => { isResizing = false; };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    // ===================== 导入/导出 =====================

    async exportData() {
        const data = {
            version: '2.0.0',
            type: 'knowledge_wall_backup',
            exportDate: new Date().toISOString(),
            cards: this.cards
        };
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `knowledge-wall-${dateStr}.json`;

        if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
            chrome.downloads.download({ url, filename, saveAs: true }, () => {
                URL.revokeObjectURL(url);
                this._showToast(`已导出 ${this.cards.length} 张卡片`);
            });
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            this._showToast(`已导出 ${this.cards.length} 张卡片`);
        }
    }

    async importData(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data.cards || !Array.isArray(data.cards)) {
                throw new Error('无效的知识墙备份文件');
            }

            const mode = confirm(
                `即将导入 ${data.cards.length} 张卡片。\n\n` +
                '点击"确定"：合并（保留现有 + 添加新卡片）\n' +
                '点击"取消"：放弃导入'
            );

            if (!mode) return;

            const existingIds = new Set(this.cards.map(c => c.id));
            let newCount = 0;
            let updateCount = 0;

            for (const card of data.cards) {
                const normalized = this._normalizeCard(card);
                if (existingIds.has(normalized.id)) {
                    const existing = this.cards.find(c => c.id === normalized.id);
                    if (existing && (normalized.updatedAt || 0) > (existing.updatedAt || 0)) {
                        Object.assign(existing, normalized);
                        updateCount++;
                    }
                } else {
                    this.cards.push(normalized);
                    newCount++;
                }
            }

            await this.saveData();
            this.applyFilter();
            this.render();
            this._showToast(`导入完成：新增 ${newCount}，更新 ${updateCount}`);
        } catch (e) {
            console.error('知识墙导入失败:', e);
            this._showToast('导入失败：' + e.message);
        }
    }

    _normalizeCard(card) {
        return {
            id: card.id || 'kw_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            type: card.type || 'note',
            title: card.title || '无标题',
            content: card.content || '',
            links: Array.isArray(card.links) ? card.links : [],
            tags: Array.isArray(card.tags) ? card.tags : [],
            pinned: !!card.pinned,
            createdAt: card.createdAt || Date.now(),
            updatedAt: card.updatedAt || Date.now(),
            viewCount: card.viewCount || 0,
            useMarkdown: !!card.useMarkdown,
            isProtected: !!card.isProtected,
            passwordHash: card.passwordHash || null,
            passwordSalt: card.passwordSalt || null,
        };
    }

    // ===================== 工具 =====================

    _isSafeUrl(url) {
        const u = (url || '').trim().toLowerCase();
        return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('mailto:') || u.startsWith('#');
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _formatTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    _showToast(msg) {
        if (window.memoManager?.showToast) {
            window.memoManager.showToast(msg);
            return;
        }
        const t = document.createElement('div');
        t.className = 'kw-toast';
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2500);
    }
}

// 全局实例
window.knowledgeWall = new KnowledgeWall();
