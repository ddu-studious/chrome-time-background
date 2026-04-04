/**
 * 知识墙模块 - 瀑布流信息管理
 * 支持笔记、链接、代码片段、联系人、周记等多种卡片类型
 * v2.0: 密码保护、Markdown 渲染
 * v2.1: 标签归类筛选、Markdown Tab 缩进与快捷键增强
 * v3.0: 多视图（卡片墙 / 时间线 / 仪表盘）、AI 周报摘要
 */
class KnowledgeWall {
    constructor() {
        this.cards = [];
        this.filteredCards = [];
        this.searchQuery = '';
        this.filterType = 'all';
        this.selectedTags = new Set();
        this.isOpen = false;
        this.editingCardId = null;
        this._unlockedCards = new Set();
        this._failedAttempts = {};
        this._lockoutUntil = {};

        this.currentView = 'cards';
        this._timelineWeekOffset = 0;
        this._aiSummaryLoading = false;
        this._cardDensity = 'standard';

        this.typeConfig = {
            note:    { label: '笔记',   icon: 'fas fa-sticky-note',    color: 'rgba(255,200,80,0.8)',  bg: 'rgba(255,200,80,0.1)' },
            link:    { label: '链接',   icon: 'fas fa-link',           color: 'rgba(100,180,255,0.8)', bg: 'rgba(100,180,255,0.1)' },
            code:    { label: '代码',   icon: 'fas fa-code',           color: 'rgba(92,216,92,0.8)',   bg: 'rgba(92,216,92,0.1)' },
            contact: { label: '联系人', icon: 'fas fa-user',           color: 'rgba(255,100,150,0.8)', bg: 'rgba(255,100,150,0.1)' },
            weekly:  { label: '周记',   icon: 'fas fa-calendar-week',  color: 'rgba(180,100,255,0.8)', bg: 'rgba(180,100,255,0.1)' }
        };

        this._timelineIconMap = {
            'note_create':    { icon: 'fas fa-plus-circle',   cls: 'tl-icon-note' },
            'note_update':    { icon: 'fas fa-pencil-alt',    cls: 'tl-icon-note' },
            'note_delete':    { icon: 'fas fa-trash-alt',     cls: 'tl-icon-note' },
            'weekly_create':  { icon: 'fas fa-calendar-plus', cls: 'tl-icon-weekly' },
            'weekly_update':  { icon: 'fas fa-calendar-check',cls: 'tl-icon-weekly' },
            'task_create':    { icon: 'fas fa-plus-circle',   cls: 'tl-icon-task' },
            'task_complete':  { icon: 'fas fa-check-circle',  cls: 'tl-icon-task' },
            'task_update':    { icon: 'fas fa-edit',          cls: 'tl-icon-task' },
            'task_delete':    { icon: 'fas fa-trash-alt',     cls: 'tl-icon-task' },
            'task_fail':      { icon: 'fas fa-times-circle',  cls: 'tl-icon-task' },
            'bookmark_save':  { icon: 'fas fa-bookmark',      cls: 'tl-icon-bookmark' },
            'ticker_save':    { icon: 'fas fa-fire',          cls: 'tl-icon-ticker' }
        };
    }

    async init() {
        MarkdownRenderer.configure();
        await this.loadData();
        this._restoreUnlockedSession();
        this.injectDOM();
        this.bindEvents();
    }

    _configureMarked() {
        MarkdownRenderer.configure();
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

    // ===================== Markdown (委托 MarkdownRenderer) =====================

    _renderMarkdown(text) {
        return MarkdownRenderer.render(text);
    }

    _renderMermaidBlocks(containerEl) {
        MarkdownRenderer.renderMermaid(containerEl);
    }

    _hasMarkdownSyntax(text) {
        return MarkdownRenderer.hasMarkdownSyntax(text);
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
                    <div class="kw-header-top">
                        <h2><i class="fas fa-brain"></i> 常用信息</h2>
                        <div class="kw-search">
                            <i class="fas fa-search"></i>
                            <input type="text" id="kw-search-input" placeholder="搜索信息..." autocomplete="off">
                        </div>
                        <div class="kw-actions">
                            <button id="kw-add-btn" title="添加卡片"><i class="fas fa-plus"></i></button>
                            <button id="kw-export-btn" title="导出数据"><i class="fas fa-file-export"></i></button>
                            <button id="kw-import-btn" title="导入数据"><i class="fas fa-file-import"></i></button>
                            <input type="file" id="kw-import-file" accept=".json" hidden>
                        </div>
                        <button class="kw-close" id="kw-close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="kw-view-tabs" id="kw-view-tabs">
                        <button class="kw-view-tab active" data-view="cards">
                            <i class="fas fa-th-large"></i> 卡片墙
                            <span class="kw-tab-badge" id="kw-cards-count"></span>
                        </button>
                        <button class="kw-view-tab" data-view="timeline">
                            <i class="fas fa-stream"></i> 时间线
                        </button>
                        <button class="kw-view-tab" data-view="dashboard">
                            <i class="fas fa-chart-pie"></i> 仪表盘
                        </button>
                    </div>
                    <div class="kw-filter-bar" id="kw-filter-bar">
                        <button class="kw-filter-btn active" data-type="all">全部</button>
                        <button class="kw-filter-btn" data-type="note">笔记</button>
                        <button class="kw-filter-btn" data-type="link">链接</button>
                        <button class="kw-filter-btn" data-type="code">代码</button>
                        <button class="kw-filter-btn" data-type="contact">联系人</button>
                        <button class="kw-filter-btn" data-type="weekly">周记</button>
                        <span class="kw-filter-spacer"></span>
                        <div class="kw-density-toggle" id="kw-density-toggle" title="视图密度">
                            <button class="kw-density-btn" data-density="compact" title="紧凑"><i class="fas fa-th"></i></button>
                            <button class="kw-density-btn active" data-density="standard" title="标准"><i class="fas fa-th-large"></i></button>
                            <button class="kw-density-btn" data-density="loose" title="宽松"><i class="fas fa-square"></i></button>
                        </div>
                    </div>
                </div>
                <div class="kw-tag-cloud" id="kw-tag-cloud"></div>
                <div class="kw-content" id="kw-content">
                    <!-- 卡片墙视图 -->
                    <div class="kw-view-panel active" id="kw-view-cards">
                        <div class="kw-masonry" id="kw-masonry"></div>
                        <div class="kw-empty hidden" id="kw-empty">
                            <i class="fas fa-folder-open"></i>
                            <p>暂无信息卡片</p>
                            <span>点击右上角 + 添加你的第一张卡片</span>
                        </div>
                    </div>
                    <!-- 时间线视图 -->
                    <div class="kw-view-panel" id="kw-view-timeline">
                        <div class="kw-tl-container" id="kw-tl-container"></div>
                    </div>
                    <!-- 仪表盘视图 -->
                    <div class="kw-view-panel" id="kw-view-dashboard">
                        <div class="kw-db-container" id="kw-db-container"></div>
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
        const viewTabs = document.getElementById('kw-view-tabs');

        trigger?.addEventListener('click', () => this.open());
        closeBtn.addEventListener('click', () => this.close());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });

        viewTabs?.addEventListener('click', (e) => {
            const tab = e.target.closest('.kw-view-tab');
            if (!tab) return;
            viewTabs.querySelectorAll('.kw-view-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const view = tab.dataset.view;
            this.switchView(view);
        });

        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this.searchQuery = searchInput.value.trim().toLowerCase();
                this.applyFilter();
                this.render();
                if (this.searchQuery.length >= 2) {
                    this._showCrossModuleResults(this.searchQuery);
                } else {
                    this._hideCrossModuleResults();
                }
            }, 300);
        });
        searchInput.addEventListener('blur', () => {
            setTimeout(() => this._hideCrossModuleResults(), 200);
        });

        filterBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.kw-filter-btn');
            if (!btn) return;
            filterBar.querySelectorAll('.kw-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.filterType = btn.dataset.type;
            this.selectedTags.clear();
            this.applyFilter();
            this.render();
        });

        addBtn.addEventListener('click', () => this.showEditor());
        exportBtn.addEventListener('click', () => this.exportData());
        importBtn.addEventListener('click', () => { importFile.value = ''; importFile.click(); });
        importFile.addEventListener('change', (e) => this.importData(e));

        document.getElementById('kw-density-toggle')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.kw-density-btn');
            if (!btn) return;
            document.querySelectorAll('.kw-density-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this._cardDensity = btn.dataset.density;
            this._applyDensity();
        });

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
        const countBadge = document.getElementById('kw-cards-count');
        if (countBadge) countBadge.textContent = this.cards.length;
        const overlay = document.getElementById('kw-overlay');
        overlay.classList.add('open');
        if (this.currentView === 'timeline') this.renderTimeline();
        else if (this.currentView === 'dashboard') this.renderDashboard();
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
        if (this.selectedTags.size > 0) {
            list = list.filter(c => {
                const cardTags = new Set(c.tags || []);
                return [...this.selectedTags].every(t => cardTags.has(t));
            });
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

    // ===================== 标签云 =====================

    _getTagStats() {
        const sourceCards = this.filterType !== 'all'
            ? this.cards.filter(c => c.type === this.filterType)
            : this.cards;
        const stats = {};
        sourceCards.forEach(card => {
            (card.tags || []).forEach(tag => {
                stats[tag] = (stats[tag] || 0) + 1;
            });
        });
        return Object.entries(stats)
            .sort((a, b) => b[1] - a[1])
            .map(([tag, count]) => ({ tag, count }));
    }

    _renderTagCloud() {
        const container = document.getElementById('kw-tag-cloud');
        if (!container) return;

        const stats = this._getTagStats();
        if (stats.length === 0) {
            container.classList.add('hidden');
            container.innerHTML = '';
            return;
        }

        container.classList.remove('hidden');
        const chips = stats.map(({ tag, count }) => {
            const isActive = this.selectedTags.has(tag);
            return `<span class="kw-tag-chip${isActive ? ' active' : ''}" data-tag="${this._escapeHtml(tag)}">
                ${this._escapeHtml(tag)}<span class="kw-tag-count">×${count}</span>
            </span>`;
        }).join('');

        const clearBtn = this.selectedTags.size > 0
            ? `<span class="kw-tag-chip kw-tag-clear" title="清除标签筛选"><i class="fas fa-times-circle"></i> 清除</span>`
            : '';

        container.innerHTML = `<span class="kw-tag-label"><i class="fas fa-tags"></i></span>${chips}${clearBtn}`;

        container.querySelectorAll('.kw-tag-chip:not(.kw-tag-clear)').forEach(chip => {
            chip.addEventListener('click', () => {
                const tag = chip.dataset.tag;
                this._toggleTag(tag);
            });
        });

        const clearEl = container.querySelector('.kw-tag-clear');
        if (clearEl) {
            clearEl.addEventListener('click', () => {
                this.selectedTags.clear();
                this.applyFilter();
                this.render();
                this._renderTagCloud();
            });
        }
    }

    _toggleTag(tag) {
        if (this.selectedTags.has(tag)) {
            this.selectedTags.delete(tag);
        } else {
            this.selectedTags.add(tag);
        }
        this.applyFilter();
        this.render();
        this._renderTagCloud();
    }

    // ===================== 渲染 =====================

    render() {
        const masonry = document.getElementById('kw-masonry');
        const empty = document.getElementById('kw-empty');
        if (!masonry || !empty) return;

        if (this.filteredCards.length === 0) {
            masonry.innerHTML = '';
            empty.classList.remove('hidden');
            this._renderTagCloud();
            return;
        }
        empty.classList.add('hidden');

        const pinned = this.filteredCards.filter(c => c.pinned);
        const unpinned = this.filteredCards.filter(c => !c.pinned);

        let html = '';
        if (pinned.length > 0) {
            html += `<div class="kw-section-pinned">
                <div class="kw-section-label"><i class="fas fa-thumbtack"></i> 置顶 <span class="kw-section-count">${pinned.length}</span></div>
                <div class="kw-masonry-inner">${pinned.map(card => this.renderCard(card)).join('')}</div>
            </div>`;
        }
        if (unpinned.length > 0 && pinned.length > 0) {
            html += `<div class="kw-section-divider"></div>`;
        }
        if (unpinned.length > 0) {
            const sectionLabel = pinned.length > 0
                ? `<div class="kw-section-label"><i class="fas fa-clock"></i> 最近 <span class="kw-section-count">${unpinned.length}</span></div>`
                : '';
            html += `<div class="kw-section-recent">${sectionLabel}
                <div class="kw-masonry-inner">${unpinned.map(card => this.renderCard(card)).join('')}</div>
            </div>`;
        }

        masonry.innerHTML = html;
        this.bindCardEvents(masonry);
        this._bindCopyEvents(masonry);
        this._renderMermaidBlocks(masonry);
        this._renderTagCloud();
        this._applyDensity();
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
                    if (card.useMarkdown) {
                        bodyHtml += `<div class="wc-text kw-md-body">${this._renderMarkdown(card.content)}</div>`;
                    } else {
                        bodyHtml += `<div class="wc-text wc-text-plain">${esc(card.content).replace(/\n/g, '<br>')}</div>`;
                    }
                }
            } else if (card.content) {
                if (card.useMarkdown) {
                    bodyHtml = `<div class="wc-text kw-md-body">${this._renderMarkdown(card.content)}</div>`;
                } else {
                    bodyHtml = `<div class="wc-text wc-text-plain">${esc(card.content).replace(/\n/g, '<br>')}</div>`;
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
            ? `<div class="wc-tags">${card.tags.map(t => {
                const isActive = this.selectedTags.has(t);
                return `<span class="wc-tag-clickable${isActive ? ' wc-tag-active' : ''}" data-tag="${esc(t)}">${esc(t)}</span>`;
            }).join('')}</div>`
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
                        <button class="wc-action-btn" data-action="copy" title="复制内容"><i class="fas fa-copy"></i></button>
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

            el.querySelectorAll('.wc-tag-clickable').forEach(tagEl => {
                tagEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleTag(tagEl.dataset.tag);
                });
            });

            const lockToggle = el.querySelector('.wc-lock-toggle');
            if (lockToggle) {
                lockToggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._lockCard(lockToggle.dataset.cardId);
                    this.render();
                });
            }

            const header = el.querySelector('.wc-header');
            if (header) {
                header.classList.add('kw-drag-handle');
                header.addEventListener('mousedown', () => { el.setAttribute('draggable', 'true'); });
                header.addEventListener('mouseup', () => { el.removeAttribute('draggable'); });
            }
            el.addEventListener('dragstart', (e) => {
                this._dragCardId = cardId;
                el.classList.add('kw-dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', cardId);
            });
            el.addEventListener('dragend', () => {
                el.classList.remove('kw-dragging');
                el.removeAttribute('draggable');
                container.querySelectorAll('.kw-drag-over').forEach(d => d.classList.remove('kw-drag-over'));
                this._dragCardId = null;
            });
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (this._dragCardId && this._dragCardId !== cardId) {
                    el.classList.add('kw-drag-over');
                }
            });
            el.addEventListener('dragleave', () => {
                el.classList.remove('kw-drag-over');
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('kw-drag-over');
                if (!this._dragCardId || this._dragCardId === cardId) return;
                this._reorderCard(this._dragCardId, cardId);
            });
        });
    }

    _reorderCard(fromId, toId) {
        const fromIdx = this.cards.findIndex(c => c.id === fromId);
        const toIdx = this.cards.findIndex(c => c.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [card] = this.cards.splice(fromIdx, 1);
        this.cards.splice(toIdx, 0, card);
        this.saveData();
        this.applyFilter();
        this.render();
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
        const card = this.cards.find(c => c.id === id);
        this.cards = this.cards.filter(c => c.id !== id);
        this._unlockedCards.delete(id);
        await this.saveData();

        if (card && typeof activityLogger !== 'undefined') {
            activityLogger.log({
                type: ActivityLogger.TYPES.NOTE_DELETE,
                module: ActivityLogger.MODULES.KNOWLEDGE_WALL,
                title: `删除${this.typeConfig[card.type]?.label || '卡片'}「${card.title}」`,
                targetId: id,
                targetTitle: card.title
            });
        }

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
                                    <input type="checkbox" id="kw-ed-markdown" ${(card ? card.useMarkdown : true) ? 'checked' : ''}>
                                    <i class="fab fa-markdown"></i>
                                    <span>Markdown</span>
                                </label>
                                <div class="kw-md-btns ${(card ? card.useMarkdown : true) ? '' : 'hidden'}" id="kw-md-btns">
                                    <div class="kw-md-group" data-group="format">
                                        <button type="button" class="kw-md-btn" data-md="bold" title="粗体 (Ctrl+B)"><i class="fas fa-bold"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="italic" title="斜体 (Ctrl+I)"><i class="fas fa-italic"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="strikethrough" title="删除线"><i class="fas fa-strikethrough"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="highlight" title="高亮"><i class="fas fa-highlighter"></i></button>
                                    </div>
                                    <span class="kw-md-sep"></span>
                                    <div class="kw-md-group" data-group="structure">
                                        <button type="button" class="kw-md-btn" data-md="heading" title="标题"><i class="fas fa-heading"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="quote" title="引用"><i class="fas fa-quote-right"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="hr" title="水平分割线"><i class="fas fa-minus"></i></button>
                                    </div>
                                    <span class="kw-md-sep"></span>
                                    <div class="kw-md-group" data-group="list">
                                        <button type="button" class="kw-md-btn" data-md="list" title="无序列表"><i class="fas fa-list-ul"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="olist" title="有序列表"><i class="fas fa-list-ol"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="task" title="任务列表"><i class="fas fa-tasks"></i></button>
                                    </div>
                                    <span class="kw-md-sep"></span>
                                    <div class="kw-md-group" data-group="code">
                                        <button type="button" class="kw-md-btn" data-md="code" title="行内代码 (Ctrl+Shift+K)"><i class="fas fa-code"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="codeblock" title="代码块"><i class="fas fa-file-code"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="table" title="表格"><i class="fas fa-table"></i></button>
                                    </div>
                                    <span class="kw-md-sep"></span>
                                    <div class="kw-md-group" data-group="insert">
                                        <button type="button" class="kw-md-btn" data-md="link" title="链接 (Ctrl+K)"><i class="fas fa-link"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="image" title="图片"><i class="fas fa-image"></i></button>
                                        <button type="button" class="kw-md-btn" data-md="mermaid" title="Mermaid 图表"><i class="fas fa-project-diagram"></i></button>
                                    </div>
                                    <span class="kw-md-sep"></span>
                                    <div class="kw-md-group" data-group="view">
                                        <button type="button" class="kw-md-btn kw-md-preview-btn" data-md="preview" title="纯预览"><i class="fas fa-eye"></i></button>
                                        <button type="button" class="kw-md-btn kw-md-split-btn" data-md="split" title="分屏编辑 (推荐)"><i class="fas fa-columns"></i></button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="kw-ed-content-area" id="kw-ed-content-area">
                            <textarea id="kw-ed-content" rows="12" placeholder="输入内容...\n支持 Markdown 语法：**粗体** *斜体* # 标题 - 列表 \`代码\`">${this._escapeHtml(card?.content || '')}</textarea>
                            <div class="kw-md-preview hidden" id="kw-md-preview"></div>
                        </div>
                        <div class="kw-ed-statusbar" id="kw-ed-statusbar">
                            <span class="kw-ed-charcount" id="kw-ed-charcount">0 字</span>
                            <span class="kw-ed-linecount" id="kw-ed-linecount">1 行</span>
                            <span class="kw-ed-autosave" id="kw-ed-autosave"></span>
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
        mdCheckbox.addEventListener('change', () => {
            mdBtns.classList.toggle('hidden', !mdCheckbox.checked);
            if (mdCheckbox.checked) {
                _setEditorMode('split');
            } else {
                _setEditorMode('edit');
            }
        });

        // Markdown 工具栏按钮
        const textarea = overlay.querySelector('#kw-ed-content');
        const preview = overlay.querySelector('#kw-md-preview');
        const contentArea = overlay.querySelector('#kw-ed-content-area');
        const previewBtn = overlay.querySelector('.kw-md-preview-btn');
        const splitBtn = overlay.querySelector('.kw-md-split-btn');
        let editorMode = 'edit'; // 'edit' | 'preview' | 'split'

        const _updatePreviewContent = () => {
            preview.innerHTML = this._renderMarkdown(textarea.value);
            this._renderMermaidBlocks(preview);
        };

        const _setEditorMode = (mode) => {
            editorMode = mode;
            contentArea.classList.remove('kw-mode-preview', 'kw-mode-split');
            previewBtn.classList.remove('active');
            splitBtn.classList.remove('active');

            if (mode === 'edit') {
                preview.classList.add('hidden');
                textarea.style.display = '';
            } else if (mode === 'preview') {
                preview.classList.remove('hidden');
                textarea.style.display = '';
                contentArea.classList.add('kw-mode-preview');
                previewBtn.classList.add('active');
                _updatePreviewContent();
            } else if (mode === 'split') {
                preview.classList.remove('hidden');
                textarea.style.display = '';
                contentArea.classList.add('kw-mode-split');
                splitBtn.classList.add('active');
                _updatePreviewContent();
            }
        };

        overlay.querySelectorAll('.kw-md-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.md;
                if (action === 'preview') {
                    _setEditorMode(editorMode === 'preview' ? 'edit' : 'preview');
                    return;
                }
                if (action === 'split') {
                    _setEditorMode(editorMode === 'split' ? 'edit' : 'split');
                    return;
                }
                this._insertMarkdownSyntax(textarea, action);
            });
        });

        // Markdown Tab 缩进 + 快捷键
        textarea.addEventListener('keydown', (e) => {
            // Tab / Shift+Tab 缩进控制
            if (e.key === 'Tab') {
                e.preventDefault();
                const indent = '    ';
                if (e.shiftKey) {
                    this._unindentSelection(textarea, indent);
                } else {
                    if (textarea.selectionStart === textarea.selectionEnd) {
                        textarea.setRangeText(indent, textarea.selectionStart, textarea.selectionStart, 'end');
                    } else {
                        this._indentSelection(textarea, indent);
                    }
                }
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }

            // Markdown 列表自动续行
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                const { selectionStart, value } = textarea;
                const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
                const currentLine = value.substring(lineStart, selectionStart);

                const listMatch = currentLine.match(/^(\s*)([-*+]|\d+\.)\s(\[[ x]\]\s)?/);
                if (listMatch) {
                    const [fullMatch, leadingSpace, bullet, checkbox] = listMatch;
                    const contentAfterPrefix = currentLine.substring(fullMatch.length);

                    if (contentAfterPrefix.trim() === '') {
                        e.preventDefault();
                        textarea.setRangeText('\n', lineStart, selectionStart, 'end');
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }

                    e.preventDefault();
                    let nextBullet = bullet;
                    const numMatch = bullet.match(/^(\d+)\.$/);
                    if (numMatch) nextBullet = (parseInt(numMatch[1]) + 1) + '.';
                    const prefix = leadingSpace + nextBullet + ' ' + (checkbox ? '[ ] ' : '');
                    textarea.setRangeText('\n' + prefix, selectionStart, selectionStart, 'end');
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    return;
                }
            }

            // Ctrl/Cmd 快捷键
            if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const key = e.key.toLowerCase();
                if (key === 'b') { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'bold'); }
                else if (key === 'i' && !e.shiftKey) { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'italic'); }
                else if (key === 'k' && !e.shiftKey) { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'link'); }
                else if (key === 'k' && e.shiftKey) { e.preventDefault(); this._insertMarkdownSyntax(textarea, 'code'); }
            }
        });

        // 字数统计
        const charCountEl = overlay.querySelector('#kw-ed-charcount');
        const lineCountEl = overlay.querySelector('#kw-ed-linecount');
        const autosaveEl = overlay.querySelector('#kw-ed-autosave');
        const _updateStats = () => {
            const val = textarea.value;
            const chars = val.length;
            const lines = val ? val.split('\n').length : 0;
            if (charCountEl) charCountEl.textContent = `${chars} 字`;
            if (lineCountEl) lineCountEl.textContent = `${lines} 行`;
        };
        _updateStats();

        // 自动保存草稿
        const draftKey = 'kw_draft_' + (this.editingCardId || 'new');
        let draftTimer;
        const _saveDraft = () => {
            try {
                const draft = {
                    title: overlay.querySelector('#kw-ed-title')?.value || '',
                    content: textarea.value,
                    timestamp: Date.now()
                };
                sessionStorage.setItem(draftKey, JSON.stringify(draft));
                if (autosaveEl) {
                    autosaveEl.textContent = '草稿已保存';
                    setTimeout(() => { if (autosaveEl) autosaveEl.textContent = ''; }, 2000);
                }
            } catch { /* sessionStorage may fail */ }
        };

        // 恢复草稿（仅新建时）
        if (!card) {
            try {
                const saved = sessionStorage.getItem(draftKey);
                if (saved) {
                    const draft = JSON.parse(saved);
                    if (Date.now() - draft.timestamp < 30 * 60 * 1000) {
                        if (draft.content && !textarea.value) {
                            textarea.value = draft.content;
                            if (draft.title) overlay.querySelector('#kw-ed-title').value = draft.title;
                            _updateStats();
                        }
                    } else {
                        sessionStorage.removeItem(draftKey);
                    }
                }
            } catch { /* ignore */ }
        }

        // Markdown 实时预览 + 字数统计 + 草稿自动保存
        let previewTimer;
        textarea.addEventListener('input', () => {
            _updateStats();
            if (editorMode === 'preview' || editorMode === 'split') {
                clearTimeout(previewTimer);
                previewTimer = setTimeout(_updatePreviewContent, 150);
            }
            clearTimeout(draftTimer);
            draftTimer = setTimeout(_saveDraft, 3000);
        });

        // 分屏模式下同步滚动
        textarea.addEventListener('scroll', () => {
            if (editorMode === 'split' && textarea.scrollHeight > textarea.clientHeight) {
                const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight);
                preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
            }
        });

        // Markdown 默认分屏模式
        if ((card ? card.useMarkdown : true)) {
            requestAnimationFrame(() => _setEditorMode('split'));
        }

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

            const isEdit = !!this.editingCardId;
            const savedCardTitle = title;
            const savedCardType = type;

            await this.saveData();

            // 清除草稿
            try { sessionStorage.removeItem(draftKey); } catch { /* ignore */ }

            if (isProtected) {
                const savedId = this.editingCardId || this.cards[this.cards.length - 1]?.id;
                if (savedId) this._lockCard(savedId);
            }

            if (typeof activityLogger !== 'undefined') {
                const typeLabel = this.typeConfig[savedCardType]?.label || savedCardType;
                activityLogger.log({
                    type: isEdit ? ActivityLogger.TYPES.NOTE_UPDATE : ActivityLogger.TYPES.NOTE_CREATE,
                    module: ActivityLogger.MODULES.KNOWLEDGE_WALL,
                    title: `${isEdit ? '更新' : '新增'}${typeLabel}「${savedCardTitle}」`,
                    targetId: isEdit ? this.editingCardId : (this.cards[this.cards.length - 1]?.id || ''),
                    targetTitle: savedCardTitle,
                    meta: { cardType: savedCardType, tags }
                });
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
            bold:          { before: '**', after: '**', placeholder: '粗体文字' },
            italic:        { before: '*', after: '*', placeholder: '斜体文字' },
            strikethrough: { before: '~~', after: '~~', placeholder: '删除线文字' },
            highlight:     { before: '==', after: '==', placeholder: '高亮文字' },
            heading:       { before: '## ', after: '', placeholder: '标题', lineStart: true },
            list:          { before: '- ', after: '', placeholder: '列表项', lineStart: true },
            olist:         { before: '1. ', after: '', placeholder: '列表项', lineStart: true },
            code:          { before: '`', after: '`', placeholder: 'code' },
            codeblock:     { before: '```js\n', after: '\n```', placeholder: '// 代码块', lineStart: true },
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

        let newText;
        let cursorPos;
        let selectStart;

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
        textarea.setSelectionRange(
            selected ? cursorPos : selectStart,
            cursorPos
        );
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _indentSelection(textarea, indent) {
        const { selectionStart, selectionEnd, value } = textarea;
        const firstLineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lastLineEnd = selectionEnd;
        const selectedText = value.substring(firstLineStart, lastLineEnd);
        const lines = selectedText.split('\n');
        const indented = lines.map(line => indent + line).join('\n');
        const addedLength = indent.length * lines.length;

        textarea.value = value.substring(0, firstLineStart) + indented + value.substring(lastLineEnd);
        textarea.selectionStart = selectionStart + indent.length;
        textarea.selectionEnd = selectionEnd + addedLength;
        textarea.focus();
    }

    _unindentSelection(textarea, indent) {
        const { selectionStart, selectionEnd, value } = textarea;
        const firstLineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const selectedText = value.substring(firstLineStart, selectionEnd);

        let firstLineRemoved = 0;
        let totalRemoved = 0;
        const lines = selectedText.split('\n');
        const unindented = lines.map((line, i) => {
            let spaces = 0;
            if (line.startsWith('\t')) {
                spaces = 1;
            } else {
                spaces = line.match(/^ {1,4}/)?.[0]?.length || 0;
            }
            if (i === 0) firstLineRemoved = Math.min(spaces, selectionStart - firstLineStart);
            totalRemoved += spaces;
            return spaces === 1 && line[0] === '\t' ? line.substring(1) : line.substring(spaces);
        }).join('\n');

        textarea.value = value.substring(0, firstLineStart) + unindented + value.substring(selectionEnd);
        textarea.selectionStart = Math.max(firstLineStart, selectionStart - firstLineRemoved);
        textarea.selectionEnd = Math.max(textarea.selectionStart, selectionEnd - totalRemoved);
        textarea.focus();
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
        const existing = document.getElementById('kw-export-menu');
        if (existing) { existing.remove(); return; }

        const menu = document.createElement('div');
        menu.id = 'kw-export-menu';
        menu.className = 'kw-export-menu';
        menu.innerHTML = `
            <div class="kw-export-menu-title">选择导出格式</div>
            <button class="kw-export-opt" data-fmt="json"><i class="fas fa-code"></i> JSON 备份</button>
            <button class="kw-export-opt" data-fmt="markdown"><i class="fas fa-file-alt"></i> Markdown</button>
            <button class="kw-export-opt" data-fmt="csv"><i class="fas fa-file-csv"></i> CSV 表格</button>
        `;
        const btn = document.getElementById('kw-export-btn');
        if (btn) {
            btn.style.position = 'relative';
            btn.appendChild(menu);
        }

        const close = () => menu.remove();
        setTimeout(() => document.addEventListener('click', close, { once: true }), 10);

        menu.querySelectorAll('.kw-export-opt').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const fmt = opt.dataset.fmt;
                close();
                this._exportAs(fmt);
            });
        });
    }

    _exportAs(format) {
        const dateStr = new Date().toISOString().split('T')[0];
        let content, filename, mime;

        if (format === 'json') {
            content = JSON.stringify({
                version: '3.0.0', type: 'knowledge_wall_backup',
                exportDate: new Date().toISOString(), cards: this.cards
            }, null, 2);
            filename = `knowledge-wall-${dateStr}.json`;
            mime = 'application/json';
        } else if (format === 'markdown') {
            const lines = [`# 知识墙导出 (${dateStr})\n`];
            this.cards.forEach(card => {
                const cfg = this.typeConfig[card.type] || {};
                lines.push(`## ${card.title}\n`);
                lines.push(`- 类型: ${cfg.label || card.type}`);
                lines.push(`- 创建: ${new Date(card.createdAt).toLocaleString()}`);
                if (card.tags?.length) lines.push(`- 标签: ${card.tags.join(', ')}`);
                if (card.content) lines.push(`\n${card.content}\n`);
                if (card.links?.length) {
                    card.links.forEach(l => lines.push(`- [${l.title || l.url}](${l.url})`));
                }
                lines.push('---\n');
            });
            content = lines.join('\n');
            filename = `knowledge-wall-${dateStr}.md`;
            mime = 'text/markdown';
        } else if (format === 'csv') {
            const header = ['ID', '类型', '标题', '内容', '标签', '置顶', '创建时间', '更新时间'];
            const rows = this.cards.map(c => [
                c.id, c.type, `"${(c.title || '').replace(/"/g, '""')}"`,
                `"${(c.content || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                `"${(c.tags || []).join(', ')}"`, c.pinned ? '是' : '否',
                new Date(c.createdAt).toLocaleString(), new Date(c.updatedAt || c.createdAt).toLocaleString()
            ]);
            content = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
            filename = `knowledge-wall-${dateStr}.csv`;
            mime = 'text/csv';
        }

        this._downloadFile(filename, content, mime);
        this._showToast(`已导出 ${this.cards.length} 张卡片（${format.toUpperCase()}）`);
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

    // ===================== 视图切换 =====================

    switchView(view) {
        this.currentView = view;
        document.querySelectorAll('.kw-view-panel').forEach(p => p.classList.remove('active'));
        const panel = document.getElementById(`kw-view-${view}`);
        if (panel) panel.classList.add('active');

        const filterBar = document.getElementById('kw-filter-bar');
        const tagCloud = document.getElementById('kw-tag-cloud');
        if (view === 'cards') {
            filterBar?.classList.remove('hidden');
            tagCloud?.classList.remove('kw-tag-cloud-hidden');
        } else {
            filterBar?.classList.add('hidden');
            tagCloud?.classList.add('kw-tag-cloud-hidden');
        }

        if (view === 'timeline') this.renderTimeline();
        else if (view === 'dashboard') this.renderDashboard();
    }

    // ===================== 时间线视图 =====================

    async renderTimeline() {
        const container = document.getElementById('kw-tl-container');
        if (!container) return;

        if (typeof activityLogger === 'undefined') {
            container.innerHTML = `<div class="kw-tl-empty"><i class="fas fa-stream"></i><p>活动日志模块未加载</p></div>`;
            return;
        }

        container.innerHTML = `<div class="kw-tl-loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>`;

        try {
            const memos = window.memoManager?.memos || [];
            const timeline = await activityLogger.getHybridWeeklyTimeline(this._timelineWeekOffset, this.cards, memos);
            const prevTimeline = this._timelineWeekOffset < 0 ? null : await activityLogger.getHybridWeeklyTimeline(this._timelineWeekOffset - 1, this.cards, memos);

            let html = '';

            html += `<div class="kw-tl-nav">
                <button class="kw-tl-nav-btn" id="kw-tl-prev" title="上一周"><i class="fas fa-chevron-left"></i></button>
                <span class="kw-tl-nav-label">${this._timelineWeekOffset === 0 ? '本周' : this._timelineWeekOffset === -1 ? '上周' : `${Math.abs(this._timelineWeekOffset)}周前`} (${timeline.weekLabel})</span>
                <button class="kw-tl-nav-btn ${this._timelineWeekOffset >= 0 ? 'disabled' : ''}" id="kw-tl-next" title="下一周"><i class="fas fa-chevron-right"></i></button>
            </div>`;

            html += await this._renderAISummarySection(this._timelineWeekOffset, timeline);

            html += `<div class="kw-tl-week-header">
                <span class="kw-tl-week-stats">
                    <span><i class="fas fa-sticky-note"></i> ${timeline.stats.notes} 笔记</span>
                    <span><i class="fas fa-check-circle"></i> ${timeline.stats.tasks} 任务</span>
                    <span><i class="fas fa-bookmark"></i> ${timeline.stats.bookmarks} 书签</span>
                    ${timeline.stats.ticker ? `<span><i class="fas fa-fire"></i> ${timeline.stats.ticker} 热榜</span>` : ''}
                </span>
            </div>`;

            if (timeline.days.length === 0) {
                html += `<div class="kw-tl-empty"><i class="fas fa-calendar-times"></i><p>本周暂无活动记录</p><span>操作卡片、任务、书签后会自动记录</span></div>`;
            } else {
                timeline.days.forEach(day => {
                    html += `<div class="kw-tl-day-group">
                        <div class="kw-tl-day-dot"></div>
                        <div class="kw-tl-day-header">${day.dayLabel} <span class="kw-tl-day-weekday">${day.weekDay}</span></div>`;

                    day.items.forEach(item => {
                        const iconCfg = this._timelineIconMap[item.type] || { icon: 'fas fa-circle', cls: 'tl-icon-note' };
                        const time = new Date(item.ts).toTimeString().slice(0, 5);
                        const moduleLabels = { 'knowledge-wall': '', 'memo': '任务', 'bookmark': '书签', 'ticker': '热榜', 'music': '音乐' };
                        const moduleBadge = moduleLabels[item.module] && item.module !== 'knowledge-wall'
                            ? `<span class="kw-tl-module-badge"><i class="${item.module === 'memo' ? 'fas fa-tasks' : item.module === 'bookmark' ? 'fas fa-bookmark' : item.module === 'ticker' ? 'fas fa-fire' : 'fas fa-circle'}" style="font-size:9px"></i> ${moduleLabels[item.module]}</span>`
                            : '';

                        const clickable = item.targetId ? 'kw-tl-item-clickable' : '';
                        html += `<div class="kw-tl-item ${clickable}" data-target-id="${this._escapeHtml(item.targetId)}" data-module="${this._escapeHtml(item.module)}">
                            <div class="kw-tl-item-icon ${iconCfg.cls}"><i class="${iconCfg.icon}"></i></div>
                            <div class="kw-tl-item-body">
                                <div class="kw-tl-item-title">${this._escapeHtml(item.title)}</div>
                                ${item.meta?.detail ? `<div class="kw-tl-item-desc">${this._escapeHtml(item.meta.detail)}</div>` : ''}
                                <div class="kw-tl-item-meta">
                                    <span class="kw-tl-item-time">${time}</span>
                                    ${(item.meta?.tags || []).map(t => `<span class="kw-tl-item-tag">${this._escapeHtml(t)}</span>`).join('')}
                                    ${moduleBadge}
                                </div>
                            </div>
                        </div>`;
                    });

                    html += `</div>`;
                });
            }

            if (prevTimeline && prevTimeline.days.length > 0) {
                html += `<div class="kw-tl-more"><button id="kw-tl-load-prev" class="kw-tl-more-btn"><i class="fas fa-history"></i> 查看更早的活动</button></div>`;
            }

            container.innerHTML = html;

            document.getElementById('kw-tl-prev')?.addEventListener('click', () => {
                this._timelineWeekOffset--;
                this.renderTimeline();
            });
            document.getElementById('kw-tl-next')?.addEventListener('click', () => {
                if (this._timelineWeekOffset < 0) {
                    this._timelineWeekOffset++;
                    this.renderTimeline();
                }
            });
            document.getElementById('kw-tl-load-prev')?.addEventListener('click', () => {
                this._timelineWeekOffset--;
                this.renderTimeline();
            });

            this._bindAISummaryEvents();

            container.querySelectorAll('.kw-tl-item-clickable').forEach(el => {
                el.addEventListener('click', () => {
                    const targetId = el.dataset.targetId;
                    const module = el.dataset.module;
                    if (targetId) this._navigateToTarget(targetId, module);
                });
            });

        } catch (e) {
            console.error('[KnowledgeWall] Timeline render failed:', e);
            container.innerHTML = `<div class="kw-tl-empty"><i class="fas fa-exclamation-triangle"></i><p>加载失败: ${e.message}</p></div>`;
        }
    }

    _navigateToTarget(targetId, module) {
        if (module === 'knowledge-wall') {
            const card = this.cards.find(c => c.id === targetId);
            if (card) {
                this.switchView('cards');
                document.querySelectorAll('.kw-view-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('.kw-view-tab[data-view="cards"]')?.classList.add('active');
                requestAnimationFrame(() => {
                    const cardEl = document.querySelector(`.wall-card[data-id="${targetId}"]`);
                    if (cardEl) {
                        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        cardEl.classList.add('kw-highlight-card');
                        setTimeout(() => cardEl.classList.remove('kw-highlight-card'), 2000);
                    }
                });
            }
        } else if (module === 'memo') {
            this.close();
            const task = window.memoManager?.memos?.find(m => m.id === targetId);
            if (task && window.memoManager?.showTaskDetail) {
                window.memoManager.showTaskDetail(targetId);
            }
        }
    }

    // ===================== AI 周报摘要 =====================

    async _renderAISummarySection(weekOffset, timeline) {
        if (typeof activityLogger === 'undefined') return '';

        const cached = await activityLogger.getCachedWeeklySummary(weekOffset);
        const hasSummary = !!cached?.summary;

        if (hasSummary) {
            const genDate = cached.generatedAt ? new Date(cached.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `<div class="kw-ai-summary">
                <div class="kw-ai-summary-header">
                    <i class="fas fa-magic"></i>
                    <h3>AI 周报摘要</h3>
                    <span class="kw-ai-summary-period">${timeline.weekLabel}</span>
                </div>
                <div class="kw-ai-summary-body">${this._formatSummaryText(cached.summary)}</div>
                <div class="kw-ai-summary-footer">
                    <span class="kw-ai-summary-meta">${cached.model ? cached.model + ' · ' : ''}${genDate}</span>
                    <div class="kw-ai-summary-actions">
                        <button class="kw-ai-btn primary" id="kw-ai-copy"><i class="fas fa-copy"></i> 复制</button>
                        <button class="kw-ai-btn" id="kw-ai-regen"><i class="fas fa-redo"></i> 重新生成</button>
                        <button class="kw-ai-btn" id="kw-ai-export"><i class="fas fa-file-export"></i> 导出</button>
                    </div>
                </div>
            </div>`;
        }

        if (timeline.totalItems === 0) return '';

        return `<div class="kw-ai-summary kw-ai-summary-empty">
            <div class="kw-ai-summary-header">
                <i class="fas fa-magic"></i>
                <h3>AI 周报摘要</h3>
            </div>
            <div class="kw-ai-summary-body kw-ai-generate-prompt">
                <p>共 ${timeline.totalItems} 条活动记录，点击生成 AI 周报摘要</p>
                <button class="kw-ai-btn primary kw-ai-generate-btn" id="kw-ai-generate">
                    <i class="fas fa-magic"></i> 生成周报
                </button>
            </div>
        </div>`;
    }

    _formatSummaryText(text) {
        return String(text ?? '')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    _bindAISummaryEvents() {
        document.getElementById('kw-ai-generate')?.addEventListener('click', () => this._generateAISummary());
        document.getElementById('kw-ai-regen')?.addEventListener('click', () => this._generateAISummary());
        document.getElementById('kw-ai-copy')?.addEventListener('click', () => this._copyAISummary());
        document.getElementById('kw-ai-export')?.addEventListener('click', () => this._exportAISummary());
    }

    async _generateAISummary() {
        if (this._aiSummaryLoading || typeof activityLogger === 'undefined') return;
        this._aiSummaryLoading = true;

        const genBtn = document.getElementById('kw-ai-generate') || document.getElementById('kw-ai-regen');
        if (genBtn) {
            genBtn.disabled = true;
            genBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> 生成中...';
        }

        try {
            const memos = window.memoManager?.memos || [];
            const result = await activityLogger.generateWeeklySummary(this._timelineWeekOffset, {
                cards: this.cards,
                memos
            });

            if (result.ok) {
                this._showToast('AI 周报已生成');
                this.renderTimeline();
            } else {
                if (result.fallback) {
                    this._showToast(result.error || '使用本地摘要替代');
                    const body = document.querySelector('.kw-ai-summary-body');
                    if (body) {
                        body.innerHTML = `<p style="opacity:0.7;font-size:12px;margin-bottom:8px;">${result.error}</p>${this._formatSummaryText(result.fallback)}`;
                    }
                } else {
                    this._showToast(result.error || 'AI 生成失败');
                }
            }
        } catch (e) {
            this._showToast(`生成失败: ${e.message}`);
        } finally {
            this._aiSummaryLoading = false;
            if (genBtn) {
                genBtn.disabled = false;
                genBtn.innerHTML = '<i class="fas fa-redo"></i> 重新生成';
            }
        }
    }

    async _copyAISummary() {
        if (typeof activityLogger === 'undefined') return;
        const cached = await activityLogger.getCachedWeeklySummary(this._timelineWeekOffset);
        if (cached?.summary) {
            try {
                await navigator.clipboard.writeText(cached.summary);
                this._showToast('周报已复制到剪贴板');
            } catch {
                this._showToast('复制失败');
            }
        }
    }

    async _exportAISummary() {
        if (typeof activityLogger === 'undefined') return;
        const cached = await activityLogger.getCachedWeeklySummary(this._timelineWeekOffset);
        const timeline = await activityLogger.getWeeklyTimeline(this._timelineWeekOffset);
        if (!cached?.summary) return;

        const md = `# 周报 ${timeline.weekLabel}\n\n${cached.summary}\n\n---\n*由 AI 自动生成 · ${new Date(cached.generatedAt).toLocaleString('zh-CN')}*`;
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `weekly-report-${timeline.weekLabel.replace(/\s/g, '')}.md`;
        a.click();
        URL.revokeObjectURL(url);
        this._showToast('周报已导出');
    }

    // ===================== 仪表盘视图 =====================

    async renderDashboard() {
        const container = document.getElementById('kw-db-container');
        if (!container) return;

        container.innerHTML = `<div class="kw-tl-loading"><i class="fas fa-spinner fa-pulse"></i> 加载中...</div>`;

        try {
            const memos = window.memoManager?.memos || [];
            const totalTasks = memos.length;
            const completedTasks = memos.filter(m => m.completed).length;
            const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            const typeCounts = {};
            Object.keys(this.typeConfig).forEach(t => { typeCounts[t] = 0; });
            this.cards.forEach(c => { typeCounts[c.type] = (typeCounts[c.type] || 0) + 1; });

            const now = new Date();
            const weekAgo = now.getTime() - 7 * 86400000;
            const recentCards = this.cards.filter(c => (c.updatedAt || c.createdAt) >= weekAgo);
            const recentTasks = memos.filter(m => m.createdAt >= weekAgo || (m.completedAt && m.completedAt >= weekAgo));

            let heatmap = [];
            if (typeof activityLogger !== 'undefined') {
                heatmap = await activityLogger.getHybridHeatmapData(12, this.cards, memos);
            }

            let html = '';

            html += `<div class="kw-db-stats">
                <div class="kw-db-stat"><div class="kw-db-stat-icon" style="background:rgba(255,200,80,0.12);color:rgba(255,200,80,0.9);"><i class="fas fa-sticky-note"></i></div>
                    <div class="kw-db-stat-value">${this.cards.length}</div><div class="kw-db-stat-label">卡片总数</div>
                    ${recentCards.length > 0 ? `<div class="kw-db-stat-trend up"><i class="fas fa-arrow-up"></i> 本周 +${recentCards.length}</div>` : ''}
                </div>
                <div class="kw-db-stat"><div class="kw-db-stat-icon" style="background:rgba(92,216,92,0.12);color:rgba(92,216,92,0.9);"><i class="fas fa-check-double"></i></div>
                    <div class="kw-db-stat-value">${completedTasks}<span style="font-size:13px;color:rgba(255,255,255,0.35);">/${totalTasks}</span></div><div class="kw-db-stat-label">任务完成</div>
                    <div class="kw-db-stat-trend ${taskCompletionRate >= 50 ? 'up' : ''}" style="color:${taskCompletionRate >= 70 ? 'var(--accent-green)' : taskCompletionRate >= 40 ? 'rgba(255,200,80,0.9)' : 'rgba(255,255,255,0.4)'};">${taskCompletionRate}% 完成率</div>
                </div>
                <div class="kw-db-stat"><div class="kw-db-stat-icon" style="background:rgba(100,180,255,0.12);color:rgba(100,180,255,0.9);"><i class="fas fa-stream"></i></div>
                    <div class="kw-db-stat-value">${recentCards.length + recentTasks.length}</div><div class="kw-db-stat-label">本周活动</div>
                </div>
                <div class="kw-db-stat"><div class="kw-db-stat-icon" style="background:rgba(180,100,255,0.12);color:rgba(180,100,255,0.9);"><i class="fas fa-calendar-week"></i></div>
                    <div class="kw-db-stat-value">${this.cards.filter(c => c.type === 'weekly').length}</div><div class="kw-db-stat-label">周记</div>
                </div>
            </div>`;

            const typeOrder = ['note', 'link', 'code', 'contact', 'weekly'];
            const maxTypeCount = Math.max(...Object.values(typeCounts), 1);
            html += `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-chart-bar"></i> 卡片类型分布</span></div>`;
            html += `<div class="kw-db-type-dist">`;
            typeOrder.forEach(type => {
                const cfg = this.typeConfig[type];
                const count = typeCounts[type] || 0;
                const pct = Math.round((count / Math.max(this.cards.length, 1)) * 100);
                const barW = Math.max(Math.round((count / maxTypeCount) * 100), count > 0 ? 6 : 0);
                html += `<div class="kw-db-type-row">
                    <div class="kw-db-type-label"><i class="${cfg.icon}" style="color:${cfg.color};"></i> ${cfg.label}</div>
                    <div class="kw-db-type-bar-wrap"><div class="kw-db-type-bar" style="width:${barW}%;background:${cfg.color};"></div></div>
                    <div class="kw-db-type-count">${count} <span style="color:rgba(255,255,255,0.3);font-size:11px;">(${pct}%)</span></div>
                </div>`;
            });
            html += `</div></div>`;

            if (heatmap.length > 0) {
                html += `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-fire"></i> 活动热力图</span><span style="font-size:12px;color:rgba(255,255,255,0.5);">最近 12 周</span></div>`;
                html += `<div class="kw-db-heatmap">`;
                heatmap.forEach(week => {
                    html += `<div class="kw-heatmap-week">`;
                    week.forEach(day => {
                        html += `<div class="kw-heatmap-day${day.isToday ? ' today' : ''}" ${day.level > 0 ? `data-level="${day.level}"` : ''} title="${day.date} · ${day.count} 条活动"></div>`;
                    });
                    html += `</div>`;
                });
                html += `</div>`;
                html += `<div class="kw-heatmap-legend">少 <div class="kw-hl-block"></div><div class="kw-hl-block" data-level="1"></div><div class="kw-hl-block" data-level="2"></div><div class="kw-hl-block" data-level="3"></div><div class="kw-hl-block" data-level="4"></div> 多</div>`;
                html += `</div>`;
            }

            if (typeof activityLogger !== 'undefined') {
                try {
                    const trend = await activityLogger.getDailyActivityTrend(30, this.cards, memos);
                    if (trend.maxCount > 0) {
                        html += this._renderTrendChart(trend);
                    }
                } catch { /* ignore trend errors */ }
            }

            const overdueTasks = memos.filter(m => m.dueDate && !m.completed && m.dueDate < this._getTodayDateStr());
            const upcomingTasks = memos.filter(m => {
                if (!m.dueDate || m.completed) return false;
                const due = m.dueDate;
                const today = this._getTodayDateStr();
                return due >= today && due <= this._getDateStr(3);
            });
            if (overdueTasks.length > 0 || upcomingTasks.length > 0) {
                html += `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-exclamation-triangle"></i> 任务预警</span></div>`;
                html += `<div class="kw-db-warnings">`;
                overdueTasks.slice(0, 5).forEach(t => {
                    const days = Math.floor((Date.now() - new Date(t.dueDate + 'T23:59:59').getTime()) / 86400000);
                    html += `<div class="kw-db-warn-item kw-db-warn-overdue"><i class="fas fa-clock"></i><span class="kw-db-warn-text">${this._escapeHtml(t.title)}</span><span class="kw-db-warn-badge">逾期 ${days} 天</span></div>`;
                });
                upcomingTasks.slice(0, 5).forEach(t => {
                    const days = Math.ceil((new Date(t.dueDate + 'T23:59:59').getTime() - Date.now()) / 86400000);
                    const label = days === 0 ? '今天到期' : `${days} 天后`;
                    html += `<div class="kw-db-warn-item kw-db-warn-upcoming"><i class="fas fa-bell"></i><span class="kw-db-warn-text">${this._escapeHtml(t.title)}</span><span class="kw-db-warn-badge">${label}</span></div>`;
                });
                html += `</div></div>`;
            }

            html += `<div class="kw-db-two-col">`;

            html += `<div class="kw-db-list-card"><div class="kw-db-list-title"><i class="fas fa-clock"></i> 最近更新</div>`;
            const recent = [...this.cards].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)).slice(0, 6);
            recent.forEach(card => {
                const cfg = this.typeConfig[card.type] || {};
                const dateStr = this._formatDateShort(card.updatedAt || card.createdAt);
                html += `<div class="kw-db-list-item"><div class="kw-db-list-item-icon" style="background:${cfg.bg};color:${cfg.color};"><i class="${cfg.icon}"></i></div><span class="kw-db-list-item-text">${this._escapeHtml(card.title)}</span><span class="kw-db-list-item-count">${dateStr}</span></div>`;
            });
            html += `</div>`;

            html += `<div class="kw-db-list-card"><div class="kw-db-list-title"><i class="fas fa-tags"></i> 活跃标签</div><div class="kw-db-active-tags">`;
            const tagColors = ['rgba(100,180,255,0.85)', 'rgba(92,216,92,0.85)', 'rgba(255,150,50,0.85)', 'rgba(180,100,255,0.85)', 'rgba(255,100,150,0.85)', 'rgba(255,200,80,0.85)'];
            this._getTagStats().slice(0, 8).forEach((t, i) => {
                html += `<div class="kw-db-active-tag"><div class="kw-db-tag-bar" style="background:${tagColors[i % tagColors.length]};"></div>${this._escapeHtml(t.tag)} <span style="color:rgba(255,255,255,0.4);font-size:12px;">${t.count} 条</span></div>`;
            });
            html += `</div></div>`;

            html += `</div>`;

            const recommendations = this._getTagRecommendations();
            if (recommendations.length > 0) {
                html += `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-lightbulb"></i> 相关推荐</span><span style="font-size:12px;color:rgba(255,255,255,0.4);">基于标签关联</span></div>`;
                html += `<div class="kw-db-reco-list">`;
                recommendations.forEach(r => {
                    const cfg = this.typeConfig[r.card.type] || this.typeConfig.note;
                    html += `<div class="kw-db-reco-item" data-card-id="${this._escapeHtml(r.card.id)}">
                        <div class="kw-db-reco-icon" style="background:${cfg.bg};color:${cfg.color};"><i class="${cfg.icon}"></i></div>
                        <div class="kw-db-reco-body">
                            <div class="kw-db-reco-title">${this._escapeHtml(r.card.title)}</div>
                            <div class="kw-db-reco-reason">${this._escapeHtml(r.reason)}</div>
                        </div>
                    </div>`;
                });
                html += `</div></div>`;
            }

            if (typeof activityLogger !== 'undefined') {
                html += `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-file-alt"></i> 月度回顾</span></div>
                    <div class="kw-db-monthly-actions">
                        <button class="kw-db-monthly-btn" id="kw-monthly-current"><i class="fas fa-calendar-alt"></i> 本月回顾</button>
                        <button class="kw-db-monthly-btn" id="kw-monthly-prev"><i class="fas fa-history"></i> 上月回顾</button>
                    </div></div>`;
            }

            container.innerHTML = html;

            document.getElementById('kw-monthly-current')?.addEventListener('click', () => this._showMonthlyReport(0));
            document.getElementById('kw-monthly-prev')?.addEventListener('click', () => this._showMonthlyReport(-1));

            container.querySelectorAll('.kw-db-reco-item').forEach(el => {
                el.addEventListener('click', () => {
                    const cardId = el.dataset.cardId;
                    if (cardId) this._navigateToTarget(cardId, 'knowledge-wall');
                });
            });

        } catch (e) {
            console.error('[KnowledgeWall] Dashboard render failed:', e);
            container.innerHTML = `<div class="kw-tl-empty"><i class="fas fa-exclamation-triangle"></i><p>加载失败: ${e.message}</p></div>`;
        }
    }

    async _showMonthlyReport(monthOffset) {
        if (typeof activityLogger === 'undefined') return;
        const btn = monthOffset === 0 ? document.getElementById('kw-monthly-current') : document.getElementById('kw-monthly-prev');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> 生成中...'; }

        try {
            const memos = window.memoManager?.memos || [];
            const result = await activityLogger.generateMonthlyReport(monthOffset, { cards: this.cards, memos });
            if (result.ok) {
                this._downloadFile(`月度回顾-${result.review.monthLabel}.md`, result.report, 'text/markdown');
                this._showToast(`${result.review.monthLabel}回顾已导出`);
            } else {
                this._showToast(result.error || '生成失败');
            }
        } catch (e) {
            this._showToast(`生成失败: ${e.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = monthOffset === 0 ? '<i class="fas fa-calendar-alt"></i> 本月回顾' : '<i class="fas fa-history"></i> 上月回顾'; }
        }
    }

    _downloadFile(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    _formatDateShort(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        const dStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (today === dStr) return '今天';
        const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (diff === 1) return '昨天';
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    _renderTrendChart(trend) {
        const { data, maxCount } = trend;
        const W = 700, H = 120, PX = 30, PY = 10;
        const plotW = W - PX * 2, plotH = H - PY * 2;
        const step = plotW / (data.length - 1 || 1);
        const yScale = maxCount > 0 ? plotH / maxCount : 0;

        const points = data.map((d, i) => ({ x: PX + i * step, y: H - PY - d.count * yScale }));
        const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
        const area = line + ` L ${points[points.length - 1].x.toFixed(1)} ${H - PY} L ${PX} ${H - PY} Z`;

        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
            const y = H - PY - r * plotH;
            const val = Math.round(r * maxCount);
            return `<line x1="${PX}" y1="${y}" x2="${W - PX}" y2="${y}" stroke="rgba(255,255,255,0.06)" /><text x="${PX - 4}" y="${y + 3}" fill="rgba(255,255,255,0.25)" font-size="9" text-anchor="end">${val}</text>`;
        }).join('');

        const labels = data.filter((_, i) => i % 7 === 0 || i === data.length - 1).map(d => {
            const idx = data.indexOf(d);
            return `<text x="${(PX + idx * step).toFixed(1)}" y="${H - 1}" fill="rgba(255,255,255,0.3)" font-size="9" text-anchor="middle">${d.label}</text>`;
        }).join('');

        const todayDot = data.findIndex(d => d.isToday);
        const dotSvg = todayDot >= 0 ? `<circle cx="${points[todayDot].x.toFixed(1)}" cy="${points[todayDot].y.toFixed(1)}" r="3.5" fill="var(--accent-blue)" stroke="rgba(0,0,0,0.5)" stroke-width="1"/>` : '';

        return `<div class="kw-db-section"><div class="kw-db-section-header"><span class="kw-db-section-title"><i class="fas fa-chart-line"></i> 活跃趋势</span><span style="font-size:12px;color:rgba(255,255,255,0.5);">最近 30 天</span></div>
            <div class="kw-db-trend-chart">
                <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">
                    <defs><linearGradient id="kw-trend-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(100,180,255,0.3)"/><stop offset="100%" stop-color="rgba(100,180,255,0)"/></linearGradient></defs>
                    ${gridLines}
                    <path d="${area}" fill="url(#kw-trend-grad)" />
                    <path d="${line}" fill="none" stroke="var(--accent-blue)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                    ${dotSvg}
                    ${labels}
                </svg>
            </div></div>`;
    }

    _bindCopyEvents(container) {
        if (typeof MarkdownRenderer !== 'undefined') {
            MarkdownRenderer.bindCopyButtons(container);
        }
    }

    _showCrossModuleResults(query) {
        const q = query.toLowerCase();
        const results = [];

        const memos = window.memoManager?.memos || [];
        memos.forEach(m => {
            if ((m.title || '').toLowerCase().includes(q) || (m.text || '').toLowerCase().includes(q)) {
                results.push({ type: 'task', id: m.id, title: m.title, sub: m.completed ? '已完成' : (m.dueDate || ''), icon: 'fas fa-tasks', color: 'rgba(92,216,92,0.85)', module: 'memo' });
            }
        });

        if (typeof window.bookmarkRag !== 'undefined') {
            const bookmarks = window.bookmarkRag?.allBookmarks || [];
            bookmarks.filter(b => (b.title || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q))
                .slice(0, 5)
                .forEach(b => {
                    results.push({ type: 'bookmark', id: b.id, title: b.title, sub: b.url, icon: 'fas fa-bookmark', color: 'rgba(100,180,255,0.85)', module: 'bookmark' });
                });
        }

        let dropdown = document.getElementById('kw-cross-search');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'kw-cross-search';
            dropdown.className = 'kw-cross-search-dropdown';
            const searchBox = document.getElementById('kw-search-input')?.parentElement;
            if (searchBox) searchBox.style.position = 'relative';
            searchBox?.appendChild(dropdown);
        }

        if (results.length === 0) {
            dropdown.innerHTML = '';
            dropdown.classList.remove('show');
            return;
        }

        dropdown.innerHTML = `<div class="kw-cross-header">跨模块搜索 · ${results.length} 结果</div>` +
            results.slice(0, 8).map(r => `<div class="kw-cross-item" data-id="${this._escapeHtml(r.id)}" data-module="${r.module}">
                <i class="${r.icon}" style="color:${r.color};font-size:12px;flex-shrink:0;"></i>
                <div class="kw-cross-item-body">
                    <div class="kw-cross-item-title">${this._escapeHtml(r.title)}</div>
                    ${r.sub ? `<div class="kw-cross-item-sub">${this._escapeHtml(r.sub).slice(0, 50)}</div>` : ''}
                </div>
            </div>`).join('');

        dropdown.classList.add('show');

        dropdown.querySelectorAll('.kw-cross-item').forEach(el => {
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const id = el.dataset.id;
                const module = el.dataset.module;
                if (module === 'memo') {
                    this.close();
                    window.memoManager?.showTaskDetail?.(id);
                } else if (module === 'bookmark') {
                    const bm = window.bookmarkRag?.allBookmarks?.find(b => b.id === id);
                    if (bm?.url) window.open(bm.url, '_blank');
                }
                this._hideCrossModuleResults();
            });
        });
    }

    _hideCrossModuleResults() {
        const dropdown = document.getElementById('kw-cross-search');
        if (dropdown) dropdown.classList.remove('show');
    }

    _getTagRecommendations() {
        if (this.cards.length < 3) return [];
        const recent = [...this.cards]
            .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
            .slice(0, 5);
        const recentTags = new Set();
        recent.forEach(c => (c.tags || []).forEach(t => recentTags.add(t)));
        if (recentTags.size === 0) return [];

        const recentIds = new Set(recent.map(c => c.id));
        const scored = this.cards
            .filter(c => !recentIds.has(c.id) && c.tags?.length > 0)
            .map(card => {
                const shared = card.tags.filter(t => recentTags.has(t));
                return { card, score: shared.length, sharedTags: shared };
            })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 4);

        return scored.map(r => ({
            card: r.card,
            reason: `共享标签: ${r.sharedTags.join(', ')}`
        }));
    }

    _applyDensity() {
        const masonry = document.getElementById('kw-masonry');
        if (!masonry) return;
        masonry.classList.remove('kw-density-compact', 'kw-density-standard', 'kw-density-loose');
        masonry.classList.add(`kw-density-${this._cardDensity}`);
    }

    _getTodayDateStr() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    _getDateStr(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
}

// 全局实例
window.knowledgeWall = new KnowledgeWall();
