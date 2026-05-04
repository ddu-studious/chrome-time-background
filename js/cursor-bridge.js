/**
 * Cursor Bridge Client — Chrome 扩展与本地 cursor-bridge 服务的桥接客户端
 * 全屏接管式面板 + 命令面板(⌘L) + 标签页模型选择器 + 双模创建(表单/对话)
 */
(function () {
    'use strict';

    const BRIDGE_URL = 'http://127.0.0.1:19840';
    const HEALTH_INTERVAL = 15000;

    const AGENT_TEMPLATES = [
        { id: 'code-review', name: '代码审查', icon: 'fa-magnifying-glass-chart', color: '#f87171', description: '审查代码质量、安全漏洞、最佳实践', defaultPrompt: '请审查当前项目中最近修改的文件，关注代码质量、安全漏洞和最佳实践。', cmdHint: 'review <path>' },
        { id: 'implement', name: '功能实现', icon: 'fa-code', color: '#818cf8', description: '根据需求实现功能代码', defaultPrompt: '', cmdHint: 'implement <desc>' },
        { id: 'test', name: '测试编写', icon: 'fa-flask-vial', color: '#4ade80', description: '编写单元测试和集成测试', defaultPrompt: '请为当前项目编写测试用例，覆盖核心功能和边界情况。', cmdHint: 'test <path>' },
        { id: 'refactor', name: '重构优化', icon: 'fa-wand-magic-sparkles', color: '#fbbf24', description: '重构代码结构、提升性能', defaultPrompt: '请分析当前项目代码，找出可以重构优化的部分。', cmdHint: 'refactor <path>' },
        { id: 'docs', name: '文档生成', icon: 'fa-book', color: '#22d3ee', description: '生成 API 文档、README、注释', defaultPrompt: '请为当前项目生成完整的技术文档。', cmdHint: 'docs <path>' },
    ];

    const MODEL_FAMILIES = [
        {
            name: 'Claude', tab: 'Claude', iconClass: 'icon-claude', iconText: 'C',
            models: [
                { id: 'claude-4-opus', name: 'Claude Opus 4', desc: '最强推理能力', level: 'max', levelLabel: 'MAX' },
                { id: 'claude-4-sonnet', name: 'Claude Sonnet 4', desc: '平衡性能与速度', level: 'high', levelLabel: '高级' },
                { id: 'claude-4-haiku', name: 'Claude Haiku 4', desc: '极速响应', level: 'fast', levelLabel: '快速' },
            ]
        },
        {
            name: 'GPT', tab: 'GPT', iconClass: 'icon-gpt', iconText: 'G',
            models: [
                { id: 'gpt-5', name: 'GPT-5', desc: '最新旗舰模型', level: 'max', levelLabel: 'MAX' },
                { id: 'gpt-4.1', name: 'GPT-4.1', desc: '高级推理', level: 'high', levelLabel: '高级' },
                { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', desc: '快速响应', level: 'fast', levelLabel: '快速' },
            ]
        },
        {
            name: 'Grok', tab: 'Grok', iconClass: 'icon-grok', iconText: 'X',
            models: [
                { id: 'grok-4', name: 'Grok 4', desc: '深度思考', level: 'extra-high', levelLabel: '极高' },
                { id: 'grok-3', name: 'Grok 3', desc: '标准推理', level: 'medium', levelLabel: '标准' },
            ]
        },
        {
            name: 'Composer', tab: 'Composer', iconClass: 'icon-composer', iconText: '★',
            models: [
                { id: 'composer-2', name: 'Composer 2', desc: 'Cursor 专属多文件编辑', level: 'high', levelLabel: '高级' },
                { id: 'composer-2-fast', name: 'Composer 2 Fast', desc: '快速草稿', level: 'fast', levelLabel: '快速' },
            ]
        },
    ];

    const MODEL_OPTIONS = {
        options: {
            label: 'Options',
            items: [
                { id: 'thinking', name: 'Thinking', icon: 'fa-brain' },
                { id: 'fast', name: 'Fast', icon: 'fa-bolt' },
            ]
        },
        context: {
            label: 'Context',
            items: [
                { id: '200k', name: '200K', default: true },
                { id: '1m', name: '1M' },
            ]
        },
        effort: {
            label: 'Effort',
            items: [
                { id: 'low', name: 'Low' },
                { id: 'medium', name: 'Medium' },
                { id: 'high', name: 'High' },
                { id: 'max', name: 'Max', default: true },
            ]
        },
    };

    class CursorBridgeClient {
        constructor() {
            this.baseUrl = BRIDGE_URL;
            this.connected = false;
            this.serverInfo = null;
            this.agents = [];
            this.sseConnections = new Map();
            this.models = [];
            this._healthTimer = null;
            this._listeners = new Map();
            this._panelEl = null;
            this._cmdEl = null;
            this.isOpen = false;
            this.isCmdOpen = false;
            this._cmdFocusIdx = 0;
            this._createMode = 'form';
            this._chatStep = 0;
            this._chatConfig = {};
            this._selectedModel = 'claude-4-sonnet';
            this._modelOptions = { thinking: true, fast: false };
            this._modelContext = '200k';
            this._modelEffort = 'max';
        }

        on(event, fn) {
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(fn);
        }
        off(event, fn) { this._listeners.get(event)?.delete(fn); }
        _emit(event, data) {
            this._listeners.get(event)?.forEach(fn => {
                try { fn(data); } catch (e) { console.error('[CursorBridge] listener error:', e); }
            });
        }

        async init() {
            this._injectPanel();
            this._injectCmdPalette();
            this._bindEvents();
            await this.checkHealth();
            this._startHealthCheck();
        }

        // ─── API Layer ───

        async _api(path, opts = {}) {
            const res = await fetch(this.baseUrl + path, {
                headers: { 'Content-Type': 'application/json' },
                ...opts,
            });
            if (res.status === 204) return null;
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || `HTTP ${res.status}`);
            }
            return res.json();
        }

        async checkHealth() {
            try {
                const data = await this._api('/health');
                const wasConnected = this.connected;
                this.connected = data?.status === 'ok';
                this.serverInfo = data;
                if (!wasConnected && this.connected) {
                    this._emit('connected', data);
                    await this.refreshAgents();
                    await this._loadModels();
                }
                this._updateStatusUI();
                return data;
            } catch {
                if (this.connected) { this.connected = false; this._emit('disconnected'); }
                this._updateStatusUI();
                return null;
            }
        }

        _startHealthCheck() {
            if (this._healthTimer) clearInterval(this._healthTimer);
            this._healthTimer = setInterval(() => this.checkHealth(), HEALTH_INTERVAL);
        }

        async refreshAgents() {
            if (!this.connected) return;
            try {
                const data = await this._api('/agents');
                this.agents = data.agents || [];
                this._renderAgentCards();
                for (const a of this.agents) {
                    if (!this.sseConnections.has(a.id)) this._connectSSE(a.id);
                }
            } catch (e) { console.error('[CursorBridge] refreshAgents error:', e); }
        }

        async _loadModels() {
            try {
                const data = await this._api('/models');
                this.models = (data.models || []).filter(m => m.id !== 'default');
            } catch { /* non-critical */ }
        }

        async createAgent(opts) {
            const data = await this._api('/agents', { method: 'POST', body: JSON.stringify(opts) });
            await this.refreshAgents();
            return data;
        }

        async sendPrompt(agentId, prompt) {
            const data = await this._api(`/agents/${agentId}/send`, {
                method: 'POST', body: JSON.stringify({ prompt }),
            });
            this._clearOutput(agentId);
            this._appendOutput(agentId, 'user', `> ${prompt}`);
            const card = this._panelEl?.querySelector(`[data-agent-id="${agentId}"]`);
            if (card) card.classList.add('running');
            return data;
        }

        async cancelRun(agentId) {
            await this._api(`/agents/${agentId}/cancel`, { method: 'POST' });
            await this.refreshAgents();
        }

        async deleteAgent(agentId) {
            const es = this.sseConnections.get(agentId);
            if (es) { es.close(); this.sseConnections.delete(agentId); }
            await this._api(`/agents/${agentId}`, { method: 'DELETE' });
            await this.refreshAgents();
        }

        _connectSSE(agentId) {
            if (this.sseConnections.has(agentId)) return;
            const es = new EventSource(`${this.baseUrl}/agents/${agentId}/stream`);
            this.sseConnections.set(agentId, es);
            es.addEventListener('text', e => { const d = JSON.parse(e.data); this._appendOutput(agentId, 'text', d.content); });
            es.addEventListener('tool_call', e => { const d = JSON.parse(e.data); this._appendOutput(agentId, 'tool', `⚙ ${d.status ? `${d.tool} [${d.status}]` : d.tool}`); });
            es.addEventListener('thinking', e => { const d = JSON.parse(e.data); this._appendOutput(agentId, 'thinking', d.text); });
            es.addEventListener('status', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'status', `✓ ${d.status}${d.durationMs ? ` (${(d.durationMs / 1000).toFixed(1)}s)` : ''}`);
                this.refreshAgents();
            });
            es.addEventListener('error', e => {
                try { const d = JSON.parse(e.data); this._appendOutput(agentId, 'error', `✗ ${d.message}`); } catch {}
                this.refreshAgents();
            });
            es.addEventListener('closed', () => { es.close(); this.sseConnections.delete(agentId); });
        }

        // ═══════════ UI: 全屏接管面板 (方案 D) ═══════════

        _injectPanel() {
            if (this._panelEl) return;
            const panel = document.createElement('div');
            panel.className = 'cb-panel';
            panel.id = 'cb-panel';
            panel.innerHTML = `
                <div class="cb-panel-header">
                    <div class="cb-panel-title">
                        <i class="fas fa-robot"></i>
                        <span>Agent 矩阵</span>
                        <span class="cb-status-badge" id="cb-status-badge">
                            <span class="cb-status-dot"></span>
                            <span class="cb-status-text">检测中...</span>
                        </span>
                    </div>
                    <div class="cb-panel-actions">
                        <button class="cb-btn cb-btn-secondary" id="cb-cmd-trigger" title="命令面板 ⌘L">
                            <i class="fas fa-terminal"></i> ⌘L
                        </button>
                        <button class="cb-btn cb-btn-create" id="cb-create-btn" title="新建 Agent">
                            <i class="fas fa-plus"></i> 新建
                        </button>
                        <button class="cb-btn cb-btn-icon" id="cb-refresh-btn" title="刷新">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="cb-btn cb-btn-icon" id="cb-close-btn" title="关闭">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div class="cb-templates" id="cb-templates">
                    ${AGENT_TEMPLATES.map(t => `
                        <button class="cb-template-btn" data-template="${t.id}" title="${t.description}">
                            <i class="fas ${t.icon}" style="color: ${t.color}"></i>
                            <span>${t.name}</span>
                        </button>
                    `).join('')}
                </div>

                <div class="cb-agents-container" id="cb-agents-container">
                    <div class="cb-empty" id="cb-empty">
                        <i class="fas fa-robot"></i>
                        <p>尚无活跃 Agent</p>
                        <span>点击模板或「新建」按钮创建，或按 <kbd>⌘L</kbd> 使用命令面板</span>
                    </div>
                </div>

                <div class="cb-create-modal" id="cb-create-modal">
                    <div class="cb-modal-content">
                        <h3>创建新 Agent</h3>
                        <div class="cb-create-mode-switch">
                            <button class="cb-create-mode-btn active" data-mode="form"><i class="fas fa-list-check"></i> 表单模式</button>
                            <button class="cb-create-mode-btn" data-mode="chat"><i class="fas fa-comments"></i> 对话模式</button>
                        </div>
                        <div id="cb-create-form-view">
                            <div class="cb-form-group">
                                <label>名称 <span style="color:#ef4444">*</span></label>
                                <input id="cb-input-name" placeholder="例如: 代码审查员" />
                            </div>
                            <div class="cb-form-group">
                                <label>工作目录 <span style="color:#ef4444">*</span></label>
                                <div class="cb-cwd-input-wrap">
                                    <input id="cb-input-cwd" placeholder="/path/to/project" />
                                    <input type="file" id="cb-cwd-picker" webkitdirectory directory style="display:none" />
                                    <button class="cb-btn cb-btn-browse" id="cb-cwd-browse" title="浏览文件夹">
                                        <i class="fas fa-folder-open"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="cb-form-group">
                                <label>模型</label>
                                <div id="cb-model-selector-wrap"></div>
                            </div>
                            <div class="cb-form-group">
                                <label>描述</label>
                                <input id="cb-input-desc" placeholder="Agent 的职责（可选）" />
                            </div>
                            <div class="cb-form-group">
                                <label>初始 Prompt</label>
                                <textarea id="cb-input-prompt" rows="3" placeholder="创建后立即执行的指令（可选）"></textarea>
                            </div>
                            <div class="cb-modal-actions">
                                <button class="cb-btn cb-btn-secondary" id="cb-modal-cancel">取消</button>
                                <button class="cb-btn cb-btn-primary" id="cb-modal-confirm">创建 Agent</button>
                            </div>
                        </div>
                        <div id="cb-create-chat-view" class="cb-chat-create" style="display:none">
                            <div class="cb-chat-messages" id="cb-chat-messages"></div>
                            <div class="cb-chat-input-area">
                                <input class="cb-prompt-input" id="cb-chat-input" placeholder="输入回答..." />
                                <button class="cb-btn cb-btn-send" id="cb-chat-send"><i class="fas fa-paper-plane"></i></button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="cb-footer">
                    <span class="cb-footer-info" id="cb-footer-info">cursor-bridge</span>
                </div>
            `;
            document.body.appendChild(panel);
            this._panelEl = panel;
            this._renderModelSelector();
        }

        // ═══════════ UI: 命令面板 (方案 A - ⌘K) ═══════════

        _injectCmdPalette() {
            if (this._cmdEl) return;
            const overlay = document.createElement('div');
            overlay.className = 'cb-cmd-overlay';
            overlay.id = 'cb-cmd-overlay';
            overlay.innerHTML = `
                <div class="cb-cmd-palette">
                    <div class="cb-cmd-input-wrap">
                        <i class="fas fa-terminal"></i>
                        <input class="cb-cmd-input" id="cb-cmd-input" type="text" placeholder="输入命令或描述你想做的事…" autocomplete="off" />
                        <span class="cb-cmd-shortcut">⌘L</span>
                    </div>
                    <div class="cb-cmd-results" id="cb-cmd-results">
                        <div class="cb-cmd-section-title">内置命令</div>
                        ${AGENT_TEMPLATES.map((t, i) => `
                            <div class="cb-cmd-item${i === 0 ? ' focused' : ''}" data-cmd="${t.id}">
                                <div class="cb-cmd-icon" style="background:${this._hex2rgba(t.color, 0.12)};color:${t.color}"><i class="fas ${t.icon}"></i></div>
                                <div class="cb-cmd-text">
                                    <div class="cb-cmd-name">${t.id} <span class="cb-cmd-name-dim">— ${t.name}</span></div>
                                    <div class="cb-cmd-desc">${t.description}</div>
                                </div>
                                <div class="cb-cmd-hint">${t.cmdHint}</div>
                            </div>
                        `).join('')}
                        <div class="cb-cmd-section-title">其他操作</div>
                        <div class="cb-cmd-item" data-cmd="open-panel">
                            <div class="cb-cmd-icon" style="background:rgba(99,102,241,.12);color:#818cf8"><i class="fas fa-grip"></i></div>
                            <div class="cb-cmd-text">
                                <div class="cb-cmd-name">panel <span class="cb-cmd-name-dim">— 打开全屏面板</span></div>
                                <div class="cb-cmd-desc">查看和管理所有 Agent</div>
                            </div>
                        </div>
                        <div class="cb-cmd-item" data-cmd="new-agent">
                            <div class="cb-cmd-icon" style="background:rgba(34,197,94,.12);color:#4ade80"><i class="fas fa-plus"></i></div>
                            <div class="cb-cmd-text">
                                <div class="cb-cmd-name">new <span class="cb-cmd-name-dim">— 新建 Agent</span></div>
                                <div class="cb-cmd-desc">打开创建表单</div>
                            </div>
                        </div>
                    </div>
                    <div class="cb-cmd-footer">
                        <span><kbd>↑↓</kbd> 导航 <kbd>↩</kbd> 执行</span>
                        <span><kbd>esc</kbd> 关闭</span>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            this._cmdEl = overlay;
        }

        // ═══════════ UI: 标签页模型选择器 (方案 C) ═══════════

        _renderModelSelector() {
            const wrap = this._panelEl?.querySelector('#cb-model-selector-wrap');
            if (!wrap) return;

            const favModels = ['claude-4-sonnet', 'gpt-4.1', 'composer-2'];
            wrap.innerHTML = `
                <div class="cb-model-selector">
                    <div class="cb-model-tabs">
                        ${MODEL_FAMILIES.map((f, i) => `
                            <button class="cb-model-tab${i === 0 ? ' active' : ''}" data-tab="${f.tab}">
                                ${f.tab} <span class="cb-tab-count">${f.models.length}</span>
                            </button>
                        `).join('')}
                    </div>
                    ${MODEL_FAMILIES.map((f, i) => `
                        <div class="cb-model-tab-content${i === 0 ? ' active' : ''}" data-tab-content="${f.tab}">
                            ${f.models.map(m => `
                                <div class="cb-model-row${m.id === this._selectedModel ? ' selected' : ''}" data-model-id="${m.id}">
                                    <div class="cb-model-row-header">
                                        <div class="cb-model-icon ${f.iconClass}">${f.iconText}</div>
                                        <div class="cb-model-info">
                                            <div class="cb-model-name">${m.name}</div>
                                            <div class="cb-model-desc">${m.desc}</div>
                                        </div>
                                        <span class="cb-model-level ${m.level}">${m.levelLabel}</span>
                                        <div class="cb-model-check">${m.id === this._selectedModel ? '<i class="fas fa-check"></i>' : ''}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `).join('')}
                    <div class="cb-model-config-panel">
                        <div class="cb-model-config-group">
                            <span class="cb-model-config-label">${MODEL_OPTIONS.options.label}</span>
                            <div class="cb-model-config-items">
                                ${MODEL_OPTIONS.options.items.map(item => `
                                    <button class="cb-model-option-toggle${this._modelOptions[item.id] ? ' active' : ''}" data-option="${item.id}">
                                        <i class="fas ${item.icon}"></i> ${item.name}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="cb-model-config-group">
                            <span class="cb-model-config-label">${MODEL_OPTIONS.context.label}</span>
                            <div class="cb-model-config-items">
                                ${MODEL_OPTIONS.context.items.map(item => `
                                    <button class="cb-model-ctx-btn${this._modelContext === item.id ? ' active' : ''}" data-ctx="${item.id}">
                                        ${item.name}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="cb-model-config-group">
                            <span class="cb-model-config-label">${MODEL_OPTIONS.effort.label}</span>
                            <div class="cb-model-config-items">
                                ${MODEL_OPTIONS.effort.items.map(item => `
                                    <button class="cb-model-effort-btn${this._modelEffort === item.id ? ' active' : ''}" data-effort="${item.id}">
                                        ${item.name}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="cb-model-favs">
                        <div class="cb-model-favs-title"><i class="fas fa-bolt"></i> 快捷切换</div>
                        <div class="cb-model-fav-list">
                            ${favModels.map(id => {
                                const fm = MODEL_FAMILIES.flatMap(f => f.models.map(m => ({ ...m, family: f }))).find(m => m.id === id);
                                if (!fm) return '';
                                return `<button class="cb-model-fav-chip${id === this._selectedModel ? ' active' : ''}" data-fav-model="${id}">
                                    <span class="cb-fav-dot" style="background:${fm.family.iconClass === 'icon-claude' ? '#ef4444' : fm.family.iconClass === 'icon-gpt' ? '#10a37f' : '#fbbf24'}"></span>
                                    ${fm.name}
                                </button>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
            `;
            this._bindModelSelectorEvents();
        }

        _bindModelSelectorEvents() {
            const wrap = this._panelEl?.querySelector('#cb-model-selector-wrap');
            if (!wrap) return;

            wrap.querySelectorAll('.cb-model-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    wrap.querySelectorAll('.cb-model-tab').forEach(t => t.classList.remove('active'));
                    wrap.querySelectorAll('.cb-model-tab-content').forEach(c => c.classList.remove('active'));
                    tab.classList.add('active');
                    wrap.querySelector(`[data-tab-content="${tab.dataset.tab}"]`)?.classList.add('active');
                });
            });

            wrap.querySelectorAll('.cb-model-row').forEach(row => {
                row.addEventListener('click', () => this._selectModel(row.dataset.modelId));
            });

            wrap.querySelectorAll('.cb-model-fav-chip').forEach(chip => {
                chip.addEventListener('click', () => this._selectModel(chip.dataset.favModel));
            });

            wrap.querySelectorAll('.cb-model-option-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const opt = btn.dataset.option;
                    this._modelOptions[opt] = !this._modelOptions[opt];
                    btn.classList.toggle('active', this._modelOptions[opt]);
                });
            });

            wrap.querySelectorAll('.cb-model-ctx-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._modelContext = btn.dataset.ctx;
                    wrap.querySelectorAll('.cb-model-ctx-btn').forEach(b => b.classList.toggle('active', b.dataset.ctx === this._modelContext));
                });
            });

            wrap.querySelectorAll('.cb-model-effort-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._modelEffort = btn.dataset.effort;
                    wrap.querySelectorAll('.cb-model-effort-btn').forEach(b => b.classList.toggle('active', b.dataset.effort === this._modelEffort));
                });
            });
        }

        _selectModel(modelId) {
            this._selectedModel = modelId;
            const wrap = this._panelEl?.querySelector('#cb-model-selector-wrap');
            if (!wrap) return;
            wrap.querySelectorAll('.cb-model-row').forEach(r => {
                const sel = r.dataset.modelId === modelId;
                r.classList.toggle('selected', sel);
                const check = r.querySelector('.cb-model-check');
                if (check) check.innerHTML = sel ? '<i class="fas fa-check"></i>' : '';
            });
            wrap.querySelectorAll('.cb-model-fav-chip').forEach(c => {
                c.classList.toggle('active', c.dataset.favModel === modelId);
            });
        }

        // ═══════════ Events ═══════════

        _bindEvents() {
            const panel = this._panelEl;
            if (!panel) return;

            panel.querySelector('#cb-close-btn').addEventListener('click', () => this.togglePanel());
            panel.querySelector('#cb-refresh-btn').addEventListener('click', () => this.refreshAgents());
            panel.querySelector('#cb-create-btn').addEventListener('click', () => this._showCreateModal());
            panel.querySelector('#cb-cmd-trigger')?.addEventListener('click', () => this.toggleCmd());

            panel.querySelectorAll('.cb-template-btn').forEach(btn => {
                btn.addEventListener('click', () => this._createFromTemplate(btn.dataset.template));
            });

            panel.querySelector('#cb-modal-cancel').addEventListener('click', () => this._hideCreateModal());
            panel.querySelector('#cb-modal-confirm').addEventListener('click', () => this._confirmCreate());
            panel.querySelector('#cb-create-modal').addEventListener('click', e => {
                if (e.target.classList.contains('cb-create-modal')) this._hideCreateModal();
            });

            panel.querySelectorAll('.cb-create-mode-btn').forEach(btn => {
                btn.addEventListener('click', () => this._switchCreateMode(btn.dataset.mode));
            });

            panel.querySelector('#cb-chat-send')?.addEventListener('click', () => this._handleChatInput());
            panel.querySelector('#cb-chat-input')?.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); this._handleChatInput(); }
            });

            panel.querySelector('#cb-cwd-browse')?.addEventListener('click', () => {
                panel.querySelector('#cb-cwd-picker')?.click();
            });
            panel.querySelector('#cb-cwd-picker')?.addEventListener('change', (e) => {
                const files = e.target.files;
                if (files?.length) {
                    const path = files[0].webkitRelativePath?.split('/')[0] || files[0].name;
                    const cwdInput = panel.querySelector('#cb-input-cwd');
                    if (cwdInput) cwdInput.value = path;
                }
                e.target.value = '';
            });

            panel.querySelector('#cb-empty')?.addEventListener('click', () => this._showCreateModal());

            const cmdOverlay = this._cmdEl;
            if (cmdOverlay) {
                cmdOverlay.addEventListener('click', e => {
                    if (e.target === cmdOverlay) this.closeCmd();
                });
                const cmdInput = cmdOverlay.querySelector('#cb-cmd-input');
                cmdInput?.addEventListener('input', () => this._filterCmdResults(cmdInput.value));
                cmdInput?.addEventListener('keydown', e => this._handleCmdKeydown(e));

                cmdOverlay.querySelectorAll('.cb-cmd-item').forEach(item => {
                    item.addEventListener('click', () => this._executeCmdItem(item));
                });
            }

            document.addEventListener('keydown', e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
                    e.preventDefault();
                    this.toggleCmd();
                    return;
                }
                if (e.key === 'Escape') {
                    if (this.isCmdOpen) { this.closeCmd(); return; }
                    if (this.isOpen) {
                        const modal = panel.querySelector('#cb-create-modal');
                        if (modal?.classList.contains('open')) { this._hideCreateModal(); }
                        else { this.togglePanel(); }
                    }
                }
            });
        }

        // ─── Panel toggle ───

        togglePanel() {
            this.isOpen = !this.isOpen;
            this._panelEl?.classList.toggle('open', this.isOpen);
            const dockBtn = document.getElementById('agent-dock-btn');
            if (dockBtn) dockBtn.classList.toggle('active', this.isOpen);
            if (this.isOpen && this.connected) this.refreshAgents();
        }

        toggle() { this.togglePanel(); }

        // ─── Command Palette ───

        toggleCmd() {
            this.isCmdOpen ? this.closeCmd() : this.openCmd();
        }

        openCmd() {
            this.isCmdOpen = true;
            this._cmdEl?.classList.add('open');
            this._cmdFocusIdx = 0;
            this._updateCmdFocus();
            const input = this._cmdEl?.querySelector('#cb-cmd-input');
            if (input) { input.value = ''; input.focus(); }
            this._filterCmdResults('');
        }

        closeCmd() {
            this.isCmdOpen = false;
            this._cmdEl?.classList.remove('open');
        }

        _filterCmdResults(query) {
            const items = this._cmdEl?.querySelectorAll('.cb-cmd-item');
            if (!items) return;
            const q = query.toLowerCase().trim();
            let firstVisible = -1;
            items.forEach((item, i) => {
                const text = item.textContent.toLowerCase();
                const match = !q || text.includes(q);
                item.style.display = match ? '' : 'none';
                if (match && firstVisible < 0) firstVisible = i;
            });
            this._cmdFocusIdx = Math.max(firstVisible, 0);
            this._updateCmdFocus();
        }

        _handleCmdKeydown(e) {
            const items = [...(this._cmdEl?.querySelectorAll('.cb-cmd-item') || [])].filter(i => i.style.display !== 'none');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._cmdFocusIdx = Math.min(this._cmdFocusIdx + 1, items.length - 1);
                this._updateCmdFocus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._cmdFocusIdx = Math.max(this._cmdFocusIdx - 1, 0);
                this._updateCmdFocus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (items[this._cmdFocusIdx]) this._executeCmdItem(items[this._cmdFocusIdx]);
            }
        }

        _updateCmdFocus() {
            const items = [...(this._cmdEl?.querySelectorAll('.cb-cmd-item') || [])].filter(i => i.style.display !== 'none');
            items.forEach((item, i) => item.classList.toggle('focused', i === this._cmdFocusIdx));
            items[this._cmdFocusIdx]?.scrollIntoView({ block: 'nearest' });
        }

        _executeCmdItem(item) {
            const cmd = item.dataset.cmd;
            this.closeCmd();

            if (cmd === 'open-panel') {
                if (!this.isOpen) this.togglePanel();
                return;
            }
            if (cmd === 'new-agent') {
                if (!this.isOpen) this.togglePanel();
                setTimeout(() => this._showCreateModal(), 300);
                return;
            }
            const tpl = AGENT_TEMPLATES.find(t => t.id === cmd);
            if (tpl) {
                if (!this.isOpen) this.togglePanel();
                setTimeout(() => this._createFromTemplate(cmd), 300);
            }
        }

        // ═══════════ UI: 双模创建 (表单 + 对话) ═══════════

        _switchCreateMode(mode) {
            this._createMode = mode;
            const panel = this._panelEl;
            if (!panel) return;
            panel.querySelectorAll('.cb-create-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
            panel.querySelector('#cb-create-form-view').style.display = mode === 'form' ? '' : 'none';
            panel.querySelector('#cb-create-chat-view').style.display = mode === 'chat' ? '' : 'none';
            if (mode === 'chat' && !panel.querySelector('#cb-chat-messages').children.length) {
                this._startChat();
            }
        }

        _startChat() {
            this._chatStep = 0;
            this._chatConfig = {};
            const msgBox = this._panelEl?.querySelector('#cb-chat-messages');
            if (msgBox) msgBox.innerHTML = '';
            this._addChatMsg('ai', '你好！我来帮你创建一个新的 Agent。首先，给它取个名字吧？', [
                { label: '代码审查员', value: '代码审查员' },
                { label: '功能实现器', value: '功能实现器' },
                { label: '测试工程师', value: '测试工程师' },
            ]);
        }

        _addChatMsg(role, text, options) {
            const msgBox = this._panelEl?.querySelector('#cb-chat-messages');
            if (!msgBox) return;

            const iconClass = role === 'ai' ? 'ai' : 'user';
            const iconContent = role === 'ai' ? '<i class="fas fa-robot"></i>' : '<i class="fas fa-user"></i>';
            const bubbleClass = role === 'ai' ? 'ai-bubble' : 'user-bubble';

            let html = `<div class="cb-chat-msg">
                <div class="cb-chat-avatar ${iconClass}">${iconContent}</div>
                <div>
                    <div class="cb-chat-bubble ${bubbleClass}">${this._esc(text)}</div>`;

            if (options?.length) {
                html += `<div class="cb-chat-options">
                    ${options.map(o => `<button class="cb-chat-option-btn" data-chat-val="${this._esc(o.value)}">${this._esc(o.label)}</button>`).join('')}
                </div>`;
            }
            html += `</div></div>`;
            msgBox.insertAdjacentHTML('beforeend', html);
            msgBox.scrollTop = msgBox.scrollHeight;

            msgBox.querySelectorAll('.cb-chat-option-btn:not([data-bound])').forEach(btn => {
                btn.dataset.bound = '1';
                btn.addEventListener('click', () => {
                    btn.classList.add('selected');
                    this._processChatStep(btn.dataset.chatVal);
                });
            });
        }

        _handleChatInput() {
            const input = this._panelEl?.querySelector('#cb-chat-input');
            if (!input) return;
            const val = input.value.trim();
            if (!val) return;
            input.value = '';
            this._processChatStep(val);
        }

        _processChatStep(value) {
            this._addChatMsg('user', value);
            this._chatStep++;

            switch (this._chatStep) {
                case 1:
                    this._chatConfig.name = value;
                    setTimeout(() => this._addChatMsg('ai', `好名字！"${value}" 的工作目录是哪里？请输入项目路径。`), 400);
                    break;
                case 2:
                    this._chatConfig.cwd = value;
                    setTimeout(() => this._addChatMsg('ai', '选择一个 AI 模型：', [
                        { label: 'Claude Sonnet 4', value: 'claude-4-sonnet' },
                        { label: 'GPT-4.1', value: 'gpt-4.1' },
                        { label: 'Composer 2', value: 'composer-2' },
                        { label: 'Grok 4', value: 'grok-4' },
                    ]), 400);
                    break;
                case 3:
                    this._chatConfig.model = value;
                    setTimeout(() => this._addChatMsg('ai', '需要在创建后立即执行什么任务吗？输入 Prompt 或跳过。', [
                        { label: '跳过', value: '__skip__' },
                    ]), 400);
                    break;
                case 4: {
                    if (value !== '__skip__') this._chatConfig.prompt = value;
                    const cfg = this._chatConfig;
                    const summary = `配置确认：\n名称: ${cfg.name}\n目录: ${cfg.cwd}\n模型: ${cfg.model}${cfg.prompt ? '\nPrompt: ' + cfg.prompt : ''}`;
                    setTimeout(() => {
                        this._addChatMsg('ai', summary, [
                            { label: '确认创建', value: '__confirm__' },
                            { label: '重新开始', value: '__restart__' },
                        ]);
                    }, 400);
                    break;
                }
                case 5:
                    if (value === '__restart__') {
                        this._startChat();
                    } else {
                        this._hideCreateModal();
                        const cfg = this._chatConfig;
                        this.createAgent({
                            name: cfg.name, cwd: cfg.cwd,
                            model: cfg.model || undefined,
                            description: undefined,
                        }).then(agent => {
                            this._showToast(`Agent "${cfg.name}" 创建成功`, 'success');
                            if (cfg.prompt && agent?.id) {
                                setTimeout(() => this.sendPrompt(agent.id, cfg.prompt), 500);
                            }
                        }).catch(err => this._showToast(`创建失败: ${err.message}`, 'error'));
                    }
                    break;
            }
        }

        // ─── Create modal (form mode) ───

        _showCreateModal(template) {
            if (!this.connected) { this._showToast('cursor-bridge 服务未连接', 'error'); return; }
            const modal = this._panelEl?.querySelector('#cb-create-modal');
            if (!modal) return;
            if (template) {
                const tpl = AGENT_TEMPLATES.find(t => t.id === template);
                if (tpl) {
                    this._panelEl.querySelector('#cb-input-name').value = tpl.name;
                    this._panelEl.querySelector('#cb-input-desc').value = tpl.description;
                    this._panelEl.querySelector('#cb-input-prompt').value = tpl.defaultPrompt;
                }
            }
            this._switchCreateMode('form');
            modal.classList.add('open');
        }

        _hideCreateModal() {
            this._panelEl?.querySelector('#cb-create-modal')?.classList.remove('open');
            ['#cb-input-name', '#cb-input-cwd', '#cb-input-desc', '#cb-input-prompt'].forEach(sel => {
                const el = this._panelEl?.querySelector(sel);
                if (el) el.value = '';
            });
            this._chatStep = 0;
            this._chatConfig = {};
        }

        async _confirmCreate() {
            const name = this._panelEl.querySelector('#cb-input-name').value.trim();
            const cwd = this._panelEl.querySelector('#cb-input-cwd').value.trim();
            const model = this._selectedModel;
            const description = this._panelEl.querySelector('#cb-input-desc').value.trim();
            const prompt = this._panelEl.querySelector('#cb-input-prompt').value.trim();

            if (!name) { this._showToast('请输入 Agent 名称', 'warning'); return; }
            if (!cwd) { this._showToast('请输入工作目录', 'warning'); return; }

            this._hideCreateModal();
            try {
                const agent = await this.createAgent({
                    name, cwd,
                    model: model || undefined,
                    description: description || undefined,
                });
                this._showToast(`Agent "${name}" 创建成功`, 'success');
                if (prompt && agent?.id) {
                    setTimeout(() => this.sendPrompt(agent.id, prompt), 500);
                }
            } catch (err) { this._showToast(`创建失败: ${err.message}`, 'error'); }
        }

        _createFromTemplate(templateId) { this._showCreateModal(templateId); }

        // ─── UI: Status ───

        _updateStatusUI() {
            const badge = this._panelEl?.querySelector('#cb-status-badge');
            if (!badge) return;
            const dot = badge.querySelector('.cb-status-dot');
            const text = badge.querySelector('.cb-status-text');
            if (this.connected) {
                dot.className = 'cb-status-dot connected';
                text.textContent = `运行中 · ${this.serverInfo?.agents ?? 0} agents`;
                badge.className = 'cb-status-badge connected';
            } else {
                dot.className = 'cb-status-dot disconnected';
                text.textContent = '未连接';
                badge.className = 'cb-status-badge disconnected';
            }
            const footer = this._panelEl?.querySelector('#cb-footer-info');
            if (footer && this.serverInfo) {
                footer.textContent = `cursor-bridge v${this.serverInfo.version || '0.1.0'} · 运行 ${this._formatUptime(this.serverInfo.uptime)}`;
            }
            const dockBtn = document.getElementById('agent-dock-btn');
            if (dockBtn) {
                const indicator = dockBtn.querySelector('.cb-dock-indicator');
                if (indicator) indicator.className = `cb-dock-indicator ${this.connected ? 'connected' : 'disconnected'}`;
            }
        }

        // ─── UI: Agent Cards ───

        _renderAgentCards() {
            const container = this._panelEl?.querySelector('#cb-agents-container');
            const empty = this._panelEl?.querySelector('#cb-empty');
            if (!container) return;
            if (!this.agents.length) {
                container.querySelectorAll('.cb-agent-card').forEach(el => el.remove());
                if (empty) empty.style.display = '';
                return;
            }
            if (empty) empty.style.display = 'none';
            const currentIds = new Set(this.agents.map(a => a.id));
            container.querySelectorAll('.cb-agent-card').forEach(card => {
                if (!currentIds.has(card.dataset.agentId)) card.remove();
            });
            for (const agent of this.agents) {
                const existing = container.querySelector(`[data-agent-id="${agent.id}"]`);
                if (existing) { this._updateCard(existing, agent); }
                else {
                    container.insertAdjacentHTML('beforeend', this._renderCard(agent));
                    this._bindCardEvents(agent.id);
                    if (!this.sseConnections.has(agent.id)) this._connectSSE(agent.id);
                }
            }
        }

        _renderCard(a) {
            const statusClass = `status-${a.status}`;
            const statusLabel = { idle: '空闲', running: '运行中', error: '错误' }[a.status] || a.status;
            return `<div class="cb-agent-card ${a.status}" data-agent-id="${a.id}">
                <div class="cb-card-header">
                    <div class="cb-card-info">
                        <span class="cb-card-name">${this._esc(a.name)}</span>
                        <span class="cb-card-model">${a.model}</span>
                    </div>
                    <span class="cb-card-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="cb-card-meta">
                    <span class="cb-card-cwd" title="${this._esc(a.cwd)}"><i class="fas fa-folder"></i> ${this._shortenPath(a.cwd)}</span>
                    ${a.description ? `<span class="cb-card-desc">${this._esc(a.description)}</span>` : ''}
                </div>
                <div class="cb-card-output" id="cb-output-${a.id}"></div>
                <div class="cb-card-input">
                    <input class="cb-prompt-input" placeholder="输入指令..." data-agent="${a.id}" />
                    <button class="cb-btn cb-btn-send" data-send="${a.id}" title="发送"><i class="fas fa-paper-plane"></i></button>
                </div>
                <div class="cb-card-actions">
                    <button class="cb-btn cb-btn-sm" data-cancel="${a.id}" title="取消运行"><i class="fas fa-stop"></i> 取消</button>
                    <button class="cb-btn cb-btn-sm cb-btn-danger" data-delete="${a.id}" title="销毁 Agent"><i class="fas fa-trash"></i> 销毁</button>
                </div>
            </div>`;
        }

        _updateCard(el, agent) {
            el.className = `cb-agent-card ${agent.status}`;
            const statusEl = el.querySelector('.cb-card-status');
            if (statusEl) {
                statusEl.className = `cb-card-status status-${agent.status}`;
                statusEl.textContent = { idle: '空闲', running: '运行中', error: '错误' }[agent.status] || agent.status;
            }
        }

        _bindCardEvents(agentId) {
            const card = this._panelEl?.querySelector(`[data-agent-id="${agentId}"]`);
            if (!card) return;
            const input = card.querySelector('.cb-prompt-input');
            input?.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendFromInput(agentId); }
            });
            card.querySelector(`[data-send="${agentId}"]`)?.addEventListener('click', () => this._sendFromInput(agentId));
            card.querySelector(`[data-cancel="${agentId}"]`)?.addEventListener('click', () => this.cancelRun(agentId));
            card.querySelector(`[data-delete="${agentId}"]`)?.addEventListener('click', () => {
                if (confirm('确定要销毁此 Agent？')) this.deleteAgent(agentId);
            });
        }

        async _sendFromInput(agentId) {
            const input = this._panelEl?.querySelector(`[data-agent="${agentId}"]`);
            if (!input) return;
            const prompt = input.value.trim();
            if (!prompt) return;
            input.value = '';
            try { await this.sendPrompt(agentId, prompt); }
            catch (err) { this._appendOutput(agentId, 'error', `发送失败: ${err.message}`); }
        }

        _appendOutput(agentId, cls, text) {
            const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
            if (!el) return;
            if (cls === 'text') {
                let last = el.lastElementChild;
                if (last?.classList.contains('cb-out-text')) { last.textContent += text; }
                else { const span = document.createElement('div'); span.className = 'cb-out-text'; span.textContent = text; el.appendChild(span); }
            } else {
                const div = document.createElement('div');
                div.className = `cb-out-${cls}`;
                div.textContent = text;
                el.appendChild(div);
            }
            el.scrollTop = el.scrollHeight;
        }

        _clearOutput(agentId) {
            const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
            if (el) el.innerHTML = '';
        }

        // ─── Utilities ───

        _formatUptime(seconds) {
            if (!seconds) return '0s';
            if (seconds < 60) return `${seconds}s`;
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
            return `${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`;
        }

        _esc(s) {
            if (!s) return '';
            const d = document.createElement('div');
            d.textContent = s;
            return d.innerHTML;
        }

        _shortenPath(p) {
            if (!p) return '';
            const parts = p.split('/');
            return parts.length <= 3 ? p : `.../${parts.slice(-2).join('/')}`;
        }

        _hex2rgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16) || 0;
            const g = parseInt(hex.slice(3, 5), 16) || 0;
            const b = parseInt(hex.slice(5, 7), 16) || 0;
            return `rgba(${r},${g},${b},${alpha})`;
        }

        _showToast(msg, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `cb-toast cb-toast-${type}`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('show'));
            setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
        }

        destroy() {
            if (this._healthTimer) clearInterval(this._healthTimer);
            for (const [, es] of this.sseConnections) es.close();
            this.sseConnections.clear();
            this._panelEl?.remove();
            this._cmdEl?.remove();
            this._panelEl = null;
            this._cmdEl = null;
        }
    }

    window.CursorBridgeClient = CursorBridgeClient;
    window.AGENT_TEMPLATES = AGENT_TEMPLATES;
    window.MODEL_FAMILIES = MODEL_FAMILIES;
})();
