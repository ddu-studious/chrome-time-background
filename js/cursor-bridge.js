/**
 * Cursor Bridge Client — Chrome 扩展与本地 cursor-bridge 服务的桥接客户端
 * 全屏接管式面板 + 命令面板(⌘L) + 标签页模型选择器 + 双模创建(表单/对话)
 */
(function () {
    'use strict';

    const BRIDGE_URL = 'http://127.0.0.1:19840';
    const HEALTH_INTERVAL = 15000;

    const AGENT_TEMPLATES = [
        {
            id: 'code-review', name: '代码审查', icon: 'fa-magnifying-glass-chart', color: '#f87171',
            description: '审查代码质量、安全漏洞、最佳实践',
            defaultPrompt: '请审查当前项目中最近修改的文件，关注代码质量、安全漏洞和最佳实践。',
            cmdHint: 'review <path>',
            skill: {
                role: '资深代码审查工程师',
                behavior: [
                    '逐文件逐函数审查，先给出总览再深入细节',
                    '对每个问题标注严重等级: Critical / Warning / Info',
                    '提供修复建议和代码示例',
                    '审查完成后输出结构化报告',
                    '务必在最后输出"结论"部分，总结审查结果和建议的行动项'
                ],
                outputFormat: '## 审查报告\n### 总览\n- 文件数/问题数/严重程度分布\n### 详细问题\n| 文件 | 行号 | 等级 | 描述 | 建议 |\n### 结论\n- 整体质量评级 (A/B/C/D)\n- 必须修复项\n- 建议改进项\n- 下一步行动',
                constraints: ['不修改代码，只提供审查意见', '不跳过任何安全相关的问题', '不输出无关的夸赞或寒暄', '必须以"## 结论"结尾，不能中途停止']
            }
        },
        {
            id: 'implement', name: '功能实现', icon: 'fa-code', color: '#818cf8',
            description: '根据需求实现功能代码',
            defaultPrompt: '',
            cmdHint: 'implement <desc>',
            skill: {
                role: '全栈开发工程师',
                behavior: [
                    '先分析需求拆解为实现步骤',
                    '每个步骤给出具体代码变更',
                    '考虑边界条件和错误处理',
                    '完成后列出测试要点',
                    '务必在最后输出"完成总结"，明确列出所有已修改的文件和功能'
                ],
                outputFormat: '## 实现计划\n1. 步骤描述\n```code\n代码变更\n```\n## 测试要点\n- ...\n## 完成总结\n- 修改文件清单\n- 新增功能列表\n- 需要手动验证的项目\n- 潜在风险提示',
                constraints: ['不引入不必要的依赖', '保持与现有代码风格一致', '不删除已有功能', '必须以"## 完成总结"结尾']
            }
        },
        {
            id: 'test', name: '测试编写', icon: 'fa-flask-vial', color: '#4ade80',
            description: '编写单元测试和集成测试',
            defaultPrompt: '请为当前项目编写测试用例，覆盖核心功能和边界情况。',
            cmdHint: 'test <path>',
            skill: {
                role: '测试工程师',
                behavior: [
                    '分析被测代码的关键路径和边界条件',
                    '按 Arrange-Act-Assert 模式组织测试',
                    '覆盖正常流程、边界值、异常场景',
                    '输出覆盖率预估',
                    '务必在最后输出"测试总结"，包含覆盖率和测试运行指令'
                ],
                outputFormat: '## 测试计划\n### 覆盖目标\n- 函数/模块列表\n### 测试用例\n```test\n测试代码\n```\n## 测试总结\n- 总用例数\n- 覆盖率预估\n- 运行命令\n- 未覆盖的已知风险',
                constraints: ['不 mock 核心业务逻辑', '不写无意义的通过性测试', '不依赖外部网络服务', '必须以"## 测试总结"结尾']
            }
        },
        {
            id: 'refactor', name: '重构优化', icon: 'fa-wand-magic-sparkles', color: '#fbbf24',
            description: '重构代码结构、提升性能',
            defaultPrompt: '请分析当前项目代码，找出可以重构优化的部分。',
            cmdHint: 'refactor <path>',
            skill: {
                role: '架构优化专家',
                behavior: [
                    '先分析现有架构的问题和技术债',
                    '按优先级排列重构项',
                    '每项给出重构前后对比',
                    '评估重构的风险和收益',
                    '务必在最后输出"重构结论"，给出优先级排序和建议时间表'
                ],
                outputFormat: '## 重构分析\n### 当前问题\n- 问题描述 + 影响范围\n### 重构方案\n| 优先级 | 项目 | 收益 | 风险 |\n### 实施计划\n## 重构结论\n- 推荐执行顺序\n- 预估工作量\n- 风险最高的变更\n- 可以安全跳过的项',
                constraints: ['不改变外部接口行为', '不一次重构过多模块', '保证每步可回滚', '必须以"## 重构结论"结尾']
            }
        },
        {
            id: 'docs', name: '文档生成', icon: 'fa-book', color: '#22d3ee',
            description: '生成 API 文档、README、注释',
            defaultPrompt: '请为当前项目生成完整的技术文档。',
            cmdHint: 'docs <path>',
            skill: {
                role: '技术文档工程师',
                behavior: [
                    '分析代码结构生成文档大纲',
                    '为每个模块/函数生成文档',
                    '包含使用示例和注意事项',
                    '生成 Markdown 格式的可发布文档',
                    '务必在最后输出"文档总结"，列出生成的文档文件和后续完善建议'
                ],
                outputFormat: '## 文档\n### 概述\n### API 参考\n#### 函数名\n- 参数 / 返回值 / 示例\n### 使用指南\n## 文档总结\n- 已生成文档清单\n- 文档覆盖率\n- 建议补充的内容\n- 发布建议',
                constraints: ['不编造不存在的 API', '不省略参数类型说明', '不使用过于口语化的表述', '必须以"## 文档总结"结尾']
            }
        },
    ];

    const MODEL_FAMILY_META = [
        { name: 'Claude', tab: 'Claude', iconClass: 'icon-claude', iconText: 'C', prefix: 'claude-', color: '#ef4444' },
        { name: 'GPT', tab: 'GPT', iconClass: 'icon-gpt', iconText: 'G', prefix: 'gpt-', color: '#10a37f' },
        { name: 'Grok', tab: 'Grok', iconClass: 'icon-grok', iconText: 'X', prefix: 'grok-', color: '#1d9bf0' },
        { name: 'Composer', tab: 'Composer', iconClass: 'icon-composer', iconText: '★', prefix: 'composer-', color: '#fbbf24' },
        { name: 'Gemini', tab: 'Gemini', iconClass: 'icon-gemini', iconText: '◆', prefix: 'gemini-', color: '#4285f4' },
        { name: 'Kimi', tab: 'Kimi', iconClass: 'icon-kimi', iconText: 'K', prefix: 'kimi-', color: '#6366f1' },
        { name: 'Other', tab: 'Other', iconClass: 'icon-other', iconText: '…', prefix: null, color: '#9ca3af' },
    ];

    function _inferModelLevel(id) {
        if (/opus|max|5\.5$/.test(id)) return { level: 'max', levelLabel: 'MAX' };
        if (/codex/.test(id)) return { level: 'high', levelLabel: '代码' };
        if (/pro|sonnet.*4-6|gpt-5\.4$|grok|composer-2\.5/.test(id)) return { level: 'high', levelLabel: '高级' };
        if (/mini|nano|haiku|flash/.test(id)) return { level: 'fast', levelLabel: '快速' };
        return { level: 'medium', levelLabel: '标准' };
    }

    function buildModelFamilies(apiModels) {
        const families = MODEL_FAMILY_META.map(meta => ({ ...meta, models: [] }));
        const otherFamily = families[families.length - 1];

        for (const m of apiModels) {
            if (m.id === 'default') continue;
            const { level, levelLabel } = _inferModelLevel(m.id);
            const entry = { id: m.id, name: m.displayName || m.id, desc: '', level, levelLabel };

            let matched = false;
            for (const fam of families) {
                if (fam.prefix && m.id.startsWith(fam.prefix)) {
                    fam.models.push(entry);
                    matched = true;
                    break;
                }
            }
            if (!matched) otherFamily.models.push(entry);
        }
        return families.filter(f => f.models.length > 0);
    }

    let MODEL_FAMILIES = MODEL_FAMILY_META
        .filter(m => m.prefix)
        .map(meta => ({ ...meta, models: [] }));

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
            this._traceLogs = [];
            this._traceMaxLogs = 500;
            this._listeners = new Map();
            this._panelEl = null;
            this._cmdEl = null;
            this.isOpen = false;
            this.isCmdOpen = false;
            this._cmdFocusIdx = 0;
            this._createMode = 'form';
            this._chatStep = 0;
            this._chatConfig = {};
            this._selectedModel = 'claude-sonnet-4-6';
            this._modelOptions = { thinking: true, fast: false };
            this._modelContext = '200k';
            this._modelEffort = 'max';
            this._historyOpen = false;
            this._agentConvMap = new Map();
            this._agentTemplateMap = new Map();
            this._agentTaskProgress = new Map();
            this._agentDeps = new Map();
            this._restoreConvMap();
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
            if (!this.connected) {
                await this._tryAutoStart();
            }
            this._startHealthCheck();
        }

        async _tryAutoStart() {
            try {
                const stored = await new Promise(r => chrome.storage?.local?.get('bridgeAutoStart', r));
                const autoStart = stored?.bridgeAutoStart !== false;
                if (!autoStart) return;

                const result = await this._nativeMessage('status');
                if (result.ok && result.data?.success && !result.data.running) {
                    this._showNativeStatus('正在自动启动服务...', 'info');
                    await this.startBridge();
                } else if (!result.ok && result.nativeNotInstalled) {
                    this._showNativeStatus('', 'info');
                }
            } catch { /* auto-start is best-effort */ }
        }

        // ─── API Layer ───

        async _api(path, opts = {}) {
            const fetchOpts = { ...opts };
            const method = (fetchOpts.method || 'GET').toUpperCase();
            if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !fetchOpts.body) {
                fetchOpts.body = '{}';
            }
            fetchOpts.headers = { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) };
            const res = await fetch(this.baseUrl + path, fetchOpts);
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
            this._healthTimer = setInterval(() => {
                this.checkHealth();
                this._checkApprovals();
            }, HEALTH_INTERVAL);
        }

        async refreshAgents() {
            if (!this.connected) return;
            try {
                const data = await this._api('/agents');
                const serverAgents = data.agents || [];
                const localStatusMap = new Map();
                for (const a of this.agents) {
                    localStatusMap.set(a.id, a.status);
                }
                for (const sa of serverAgents) {
                    const localStatus = localStatusMap.get(sa.id);
                    if (localStatus && localStatus !== 'running' && sa.status === 'running') {
                        sa.status = localStatus;
                    }
                }
                this.agents = serverAgents;
                this._renderAgentCards();
                this._updateStatsBar();
                for (const a of this.agents) {
                    if (!this.sseConnections.has(a.id)) this._connectSSE(a.id);
                }
            } catch (e) { console.error('[CursorBridge] refreshAgents error:', e); }
        }

        _debouncedRefreshAgents() {
            if (this._refreshTimer) clearTimeout(this._refreshTimer);
            this._refreshTimer = setTimeout(() => this.refreshAgents(), 800);
        }

        _updateStatsBar() {
            const total = this.agents.length;
            const running = this.agents.filter(a => a.status === 'running').length;
            const tokens = this.agents.reduce((sum, a) => sum + (a.totalTokens || 0), 0);
            const statAgents = this._panelEl?.querySelector('#cb-stat-agents');
            const statRunning = this._panelEl?.querySelector('#cb-stat-running');
            const statTokens = this._panelEl?.querySelector('#cb-stat-tokens');
            if (statAgents) statAgents.textContent = total;
            if (statRunning) statRunning.textContent = running;
            if (statTokens) statTokens.textContent = tokens > 10000 ? `${(tokens / 1000).toFixed(1)}K` : tokens;
            const runningItem = this._panelEl?.querySelector('.cb-stat-running');
            if (runningItem) runningItem.classList.toggle('active', running > 0);
            const emergencyBtn = this._panelEl?.querySelector('#cb-emergency-stop');
            if (emergencyBtn) emergencyBtn.classList.toggle('visible', running > 0);
        }

        // ─── Project Switcher ───

        _initProjectSwitcher() {
            this._currentProjectId = null;
            this._projects = [];
            const switcher = this._panelEl?.querySelector('#cb-project-switcher');
            const dropdown = this._panelEl?.querySelector('#cb-project-dropdown');
            if (!switcher || !dropdown) return;

            switcher.addEventListener('click', e => {
                if (e.target.closest('.cb-project-dropdown')) return;
                dropdown.classList.toggle('open');
                if (dropdown.classList.contains('open')) this._loadProjects();
            });

            document.addEventListener('click', e => {
                if (!switcher.contains(e.target)) dropdown.classList.remove('open');
            });

            const addBtn = this._panelEl?.querySelector('#cb-project-add');
            addBtn?.addEventListener('click', () => this._addCurrentProject());

            const search = this._panelEl?.querySelector('#cb-project-search');
            search?.addEventListener('input', e => this._filterProjects(e.target.value));
        }

        async _loadProjects() {
            try {
                const data = await this._api('/projects');
                this._projects = data?.projects || [];
                this._renderProjectList();
            } catch (err) {
                console.error('[CursorBridge] loadProjects error:', err);
            }
        }

        _renderProjectList() {
            const list = this._panelEl?.querySelector('#cb-project-list');
            if (!list) return;
            const items = [
                `<div class="cb-project-item ${!this._currentProjectId ? 'active' : ''}" data-project-id="">
                    <i class="fas fa-globe"></i> 全部项目
                </div>`
            ];
            for (const p of this._projects) {
                const active = this._currentProjectId === p.id ? 'active' : '';
                const shortPath = p.path.split('/').slice(-2).join('/');
                items.push(`<div class="cb-project-item ${active}" data-project-id="${p.id}" title="${this._esc(p.path)}">
                    <i class="fas fa-folder"></i>
                    <span class="cb-project-name">${this._esc(p.name)}</span>
                    <span class="cb-project-path">${this._esc(shortPath)}</span>
                </div>`);
            }
            list.innerHTML = items.join('');
            list.querySelectorAll('.cb-project-item').forEach(item => {
                item.addEventListener('click', e => {
                    e.stopPropagation();
                    this._selectProject(item.dataset.projectId || null);
                });
            });
        }

        _selectProject(projectId) {
            this._currentProjectId = projectId || null;
            const label = this._panelEl?.querySelector('#cb-stat-project');
            if (projectId) {
                const proj = this._projects.find(p => p.id === projectId);
                if (label) label.textContent = proj?.name || '项目';
            } else {
                if (label) label.textContent = '全部项目';
            }
            this._panelEl?.querySelector('#cb-project-dropdown')?.classList.remove('open');
            this._loadHistory();
        }

        async _addCurrentProject() {
            const name = prompt('项目名称:');
            if (!name) return;
            const path = prompt('项目路径 (绝对路径):', '/Users/');
            if (!path) return;
            try {
                await this._api('/projects', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, path })
                });
                this._showToast(`项目 "${name}" 已添加`, 'success');
                await this._loadProjects();
            } catch (err) {
                this._showToast('添加项目失败: ' + err.message, 'error');
            }
        }

        _filterProjects(query) {
            const items = this._panelEl?.querySelectorAll('.cb-project-item');
            if (!items) return;
            const q = query.toLowerCase();
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(q) ? '' : 'none';
            });
        }

        // ─── @agent-name Mention Autocomplete ───

        _handleMentionInput(input, currentAgentId) {
            const val = input.value;
            const cursorPos = input.selectionStart;
            const textBeforeCursor = val.substring(0, cursorPos);
            const atMatch = textBeforeCursor.match(/@([\w-]*)$/);

            if (!atMatch) { this._hideAgentMention(); return; }

            const query = atMatch[1].toLowerCase();
            const candidates = this.agents.filter(a =>
                a.id !== currentAgentId &&
                (a.name.toLowerCase().includes(query) || a.id.includes(query))
            );

            if (!candidates.length) { this._hideAgentMention(); return; }
            this._showAgentMention(input, candidates, atMatch.index, currentAgentId);
        }

        _showAgentMention(input, candidates, atStart, currentAgentId) {
            this._hideAgentMention();
            const menu = document.createElement('div');
            menu.className = 'cb-mention-menu';
            menu.innerHTML = candidates.slice(0, 5).map((a, i) => `
                <div class="cb-mention-item ${i === 0 ? 'active' : ''}" data-agent-name="${this._esc(a.name)}">
                    <span class="cb-mention-dot" style="background:${a.status === 'running' ? '#22c55e' : '#6b7280'}"></span>
                    <span class="cb-mention-name">${this._esc(a.name)}</span>
                    <span class="cb-mention-model">${a.model}</span>
                </div>
            `).join('');

            const rect = input.getBoundingClientRect();
            menu.style.top = `${rect.top - menu.offsetHeight - 4}px`;
            menu.style.left = `${rect.left}px`;
            menu.style.width = `${Math.min(rect.width, 260)}px`;
            document.body.appendChild(menu);
            this._mentionMenu = menu;
            this._mentionInput = input;
            this._mentionAtStart = atStart;

            menu.querySelectorAll('.cb-mention-item').forEach(item => {
                item.addEventListener('click', () => {
                    this._insertMention(input, item.dataset.agentName, atStart);
                });
            });
        }

        _insertMention(input, agentName, atStart) {
            const val = input.value;
            const cursorPos = input.selectionStart;
            const before = val.substring(0, atStart);
            const after = val.substring(cursorPos);
            input.value = `${before}@${agentName} ${after}`;
            input.selectionStart = input.selectionEnd = atStart + agentName.length + 2;
            input.focus();
            this._hideAgentMention();
        }

        _hideAgentMention() {
            if (this._mentionMenu) {
                this._mentionMenu.remove();
                this._mentionMenu = null;
            }
        }

        async _loadModels() {
            try {
                const data = await this._api('/models');
                const raw = data.models || [];
                this.models = raw.filter(m => m.id !== 'default');
                MODEL_FAMILIES = buildModelFamilies(raw);
                this._renderModelSelector();
            } catch { /* non-critical */ }
        }

        async createAgent(opts) {
            const data = await this._api('/agents', { method: 'POST', body: JSON.stringify(opts) });
            await this.refreshAgents();
            if (data?.id) {
                if (opts._templateId) {
                    const agent = this.agents.find(a => a.id === data.id);
                    if (agent) agent._templateId = opts._templateId;
                    this._agentTemplateMap.set(data.id, opts._templateId);
                }
                this._agentTaskProgress.set(data.id, { status: 'idle', percent: 0, label: '' });
                if (data.conversationId) {
                    this._agentConvMap.set(data.id, data.conversationId);
                    this._persistConvMap();
                }
            }
            return data;
        }

        async sendPrompt(agentId, prompt) {
            const resolvedPrompt = this._resolveAgentReferences(prompt);
            const skillPrompt = this._buildSkillPrompt(agentId, resolvedPrompt);
            const data = await this._api(`/agents/${agentId}/send`, {
                method: 'POST', body: JSON.stringify({ prompt: skillPrompt }),
            });
            this._clearOutput(agentId);
            this._appendOutput(agentId, 'user', `> ${prompt}`);
            const agent = this.agents.find(a => a.id === agentId);
            if (agent) {
                agent.status = 'running';
                this._updateCardStatus(agentId, agent);
            }
            this._updateStatsBar();
            this._updateTaskProgress(agentId, 'running');
            return data;
        }

        _buildSkillPrompt(agentId, prompt) {
            const agent = this.agents.find(a => a.id === agentId);
            if (!agent?._templateId) return prompt;
            const tpl = AGENT_TEMPLATES.find(t => t.id === agent._templateId);
            if (!tpl?.skill) return prompt;

            const s = tpl.skill;
            const lines = [`[角色] ${s.role}`];
            if (s.behavior?.length) lines.push(`[行为准则]\n${s.behavior.map(b => `- ${b}`).join('\n')}`);
            if (s.outputFormat) lines.push(`[输出格式]\n${s.outputFormat}`);
            if (s.constraints?.length) lines.push(`[约束]\n${s.constraints.map(c => `- ${c}`).join('\n')}`);
            lines.push(`[重要] 你必须完整执行任务并输出结论部分。不要在中途停止，不要省略结论。如果内容较多，请精简正文，但结论部分不可省略。`);
            lines.push(`\n---\n${prompt}`);
            return lines.join('\n\n');
        }

        async _ensureConversation(agentId) {
            if (this._agentConvMap.has(agentId)) return this._agentConvMap.get(agentId);
            const agent = this.agents.find(a => a.id === agentId);
            if (!agent) return null;
            try {
                const convRes = await this._api('/conversations', {
                    method: 'POST',
                    body: JSON.stringify({
                        projectId: this._currentProjectId || undefined,
                        agentName: agent.name || 'Agent',
                        model: agent.model || this._selectedModel || 'unknown',
                        cwd: agent.cwd || window.location.href || 'unknown',
                        description: agent.description || undefined,
                    }),
                });
                if (convRes?.id) {
                    this._agentConvMap.set(agentId, convRes.id);
                    this._persistConvMap();
                    return convRes.id;
                }
            } catch (e) { console.warn('[cursor-bridge] 补偿创建对话记录失败:', e); }
            return null;
        }

        async _saveMessageToHistory(agentId, role, content, runId) {
            let convId = this._agentConvMap.get(agentId);
            if (!convId) convId = await this._ensureConversation(agentId);
            if (!convId || !content) return;
            try {
                await this._api(`/conversations/${convId}/messages`, {
                    method: 'POST',
                    body: JSON.stringify({ role, content: content.substring(0, 10000), runId }),
                });
            } catch (e) { console.warn('[cursor-bridge] 保存消息失败:', e); }
        }

        async _updateConversationStatus(agentId, status) {
            let convId = this._agentConvMap.get(agentId);
            if (!convId) convId = await this._ensureConversation(agentId);
            if (!convId) return;
            try {
                await this._api(`/conversations/${convId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ status }),
                });
            } catch (e) { console.warn('[cursor-bridge] 更新对话状态失败:', e); }
        }

        _persistConvMap() {
            try {
                const obj = Object.fromEntries(this._agentConvMap);
                if (chrome?.storage?.local) {
                    chrome.storage.local.set({ cb_agent_conv_map: obj });
                }
                localStorage.setItem('cb_agent_conv_map', JSON.stringify(obj));
            } catch { /* non-critical */ }
        }

        _restoreConvMap() {
            try {
                const raw = localStorage.getItem('cb_agent_conv_map');
                if (raw) {
                    const obj = JSON.parse(raw);
                    for (const [k, v] of Object.entries(obj)) {
                        this._agentConvMap.set(k, v);
                    }
                }
            } catch { /* non-critical */ }

            if (chrome?.storage?.local) {
                chrome.storage.local.get('cb_agent_conv_map', (result) => {
                    const obj = result?.cb_agent_conv_map;
                    if (obj && typeof obj === 'object') {
                        for (const [k, v] of Object.entries(obj)) {
                            if (!this._agentConvMap.has(k)) {
                                this._agentConvMap.set(k, v);
                            }
                        }
                    }
                });
            }
        }

        _resolveAgentReferences(prompt) {
            const refPattern = /@([\w-]+)/g;
            return prompt.replace(refPattern, (match, agentName) => {
                const agent = this.agents.find(a =>
                    a.name.toLowerCase() === agentName.toLowerCase() ||
                    a.id === agentName
                );
                if (!agent) return match;
                const outputRaw = this._outputRaw?.[agent.id];
                if (!outputRaw) return `${match} [无输出]`;
                const lastOutput = outputRaw.trim().split('\n').slice(-20).join('\n');
                return `[来自 Agent "${agent.name}" 的最新输出]:\n${lastOutput}\n[/引用结束]`;
            });
        }

        async cancelRun(agentId) {
            await this._api(`/agents/${agentId}/cancel`, { method: 'POST' });
            await this.refreshAgents();
        }

        async deleteAgent(agentId) {
            const es = this.sseConnections.get(agentId);
            if (es) { es.close(); this.sseConnections.delete(agentId); }
            this._agentConvMap.delete(agentId);
            this._agentDeps.delete(agentId);
            this._persistConvMap();
            await this._api(`/agents/${agentId}`, { method: 'DELETE' });
            await this.refreshAgents();
        }

        // ─── Agent 依赖编排 ───

        setAgentDependency(fromAgentId, toAgentId, promptTemplate) {
            if (!this._agentDeps.has(fromAgentId)) {
                this._agentDeps.set(fromAgentId, []);
            }
            this._agentDeps.get(fromAgentId).push({ toAgentId, promptTemplate });
        }

        removeAgentDependency(fromAgentId, toAgentId) {
            const deps = this._agentDeps.get(fromAgentId);
            if (!deps) return;
            const filtered = deps.filter(d => d.toAgentId !== toAgentId);
            if (filtered.length) this._agentDeps.set(fromAgentId, filtered);
            else this._agentDeps.delete(fromAgentId);
        }

        async _triggerDependents(completedAgentId) {
            const deps = this._agentDeps.get(completedAgentId);
            if (!deps?.length) return;

            const srcAgent = this.agents.find(a => a.id === completedAgentId);
            const srcOutput = this._outputRaw?.[completedAgentId] || '';
            const srcSummary = srcOutput.trim().split('\n').slice(-30).join('\n');

            for (const dep of deps) {
                const targetAgent = this.agents.find(a => a.id === dep.toAgentId);
                if (!targetAgent) continue;

                let prompt = dep.promptTemplate || `基于 Agent "${srcAgent?.name || completedAgentId}" 的输出继续执行任务。`;
                prompt = prompt.replace(/\{output\}/g, srcSummary);
                prompt = prompt.replace(/\{agent_name\}/g, srcAgent?.name || completedAgentId);

                try {
                    await this._api(`/agents/${dep.toAgentId}/message`, {
                        method: 'POST',
                        body: JSON.stringify({
                            fromAgent: completedAgentId,
                            content: srcSummary,
                            type: 'trigger',
                        }),
                    });
                    this._appendOutput(dep.toAgentId, 'status', `🔗 收到来自 "${srcAgent?.name}" 的触发`);
                    await this.sendPrompt(dep.toAgentId, prompt);
                } catch (err) {
                    console.warn(`[cursor-bridge] 触发依赖 Agent ${dep.toAgentId} 失败:`, err);
                    this._appendOutput(dep.toAgentId, 'error', `依赖触发失败: ${err.message}`);
                }
            }
        }

        async sendAgentMessage(fromAgentId, toAgentId, content, type = 'reference') {
            return this._api(`/agents/${toAgentId}/message`, {
                method: 'POST',
                body: JSON.stringify({ fromAgent: fromAgentId, content, type }),
            });
        }

        async getAgentMessages(agentId, direction = 'received') {
            return this._api(`/agents/${agentId}/messages?direction=${direction}`);
        }

        _connectSSE(agentId) {
            if (this.sseConnections.has(agentId)) return;
            const es = new EventSource(`${this.baseUrl}/agents/${agentId}/stream`);
            this.sseConnections.set(agentId, es);
            if (!this._sseTextBuffer) this._sseTextBuffer = {};
            this._sseTextBuffer[agentId] = '';

            es.addEventListener('text', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'text', d.content);
                this._sseTextBuffer[agentId] += d.content;
                this._updateTaskProgress(agentId, 'streaming');
            });
            es.addEventListener('tool_call', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'tool', `⚙ ${d.status ? `${d.tool} [${d.status}]` : d.tool}`);
                this._updateTaskProgress(agentId, 'streaming', `工具调用: ${d.tool}`);
                this._addTraceLog({ agentId, type: 'tool_call', tool: d.tool, status: d.status, ts: Date.now() });
            });
            es.addEventListener('thinking', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'thinking', d.text);
                this._addTraceLog({ agentId, type: 'thinking', content: (d.text || '').substring(0, 120), ts: Date.now() });
            });
            es.addEventListener('agent_status', e => {
                const d = JSON.parse(e.data);
                const agent = this.agents.find(a => a.id === agentId);
                if (agent && d.status) {
                    agent.status = d.status;
                    this._updateCardStatus(agentId, agent);
                    this._updateStatsBar();
                }
            });
            es.addEventListener('task', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'status', `📋 任务: ${d.text || d.status}`);
                this._updateTaskProgress(agentId, 'streaming', d.text || d.status);
            });
            es.addEventListener('status', e => {
                const d = JSON.parse(e.data);
                this._appendOutput(agentId, 'status', `✓ ${d.status}${d.durationMs ? ` (${(d.durationMs / 1000).toFixed(1)}s)` : ''}`);
                const duration = d.durationMs ? `${(d.durationMs / 1000).toFixed(1)}s` : '';
                this._updateTaskProgress(agentId, 'complete', `完成${duration ? ` · ${duration}` : ''}`);
                this._addTraceLog({ agentId, type: 'status', status: d.status, durationMs: d.durationMs, inputTokens: d.inputTokens, outputTokens: d.outputTokens, ts: Date.now() });
                const agent = this.agents.find(a => a.id === agentId);
                if (agent) {
                    agent.status = d.status === 'error' ? 'error' : 'idle';
                    this._updateCardStatus(agentId, agent);
                }
                this._updateStatsBar();
                this._debouncedRefreshAgents();
                this._sseTextBuffer[agentId] = '';
                if (d.status === 'completed') this._triggerDependents(agentId);
            });
            es.addEventListener('error', e => {
                try {
                    const d = JSON.parse(e.data);
                    this._appendOutput(agentId, 'error', `✗ ${d.message}`);
                    this._addTraceLog({ agentId, type: 'error', content: d.message, ts: Date.now() });
                } catch {}
                this._updateTaskProgress(agentId, 'error', '执行出错');
                const agent = this.agents.find(a => a.id === agentId);
                if (agent) {
                    agent.status = 'error';
                    this._updateCardStatus(agentId, agent);
                }
                this._updateStatsBar();
                this._debouncedRefreshAgents();
                this._sseTextBuffer[agentId] = '';
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
                        <button class="cb-btn cb-btn-secondary" id="cb-history-btn" title="对话历史记录">
                            <i class="fas fa-clock-rotate-left"></i> 历史
                        </button>
                        <button class="cb-btn cb-btn-secondary" id="cb-workflow-btn" title="工作流模板">
                            <i class="fas fa-sitemap"></i> 工作流
                        </button>
                        <button class="cb-btn cb-btn-secondary" id="cb-cmd-trigger" title="命令面板 ⌘L">
                            <i class="fas fa-terminal"></i> ⌘L
                        </button>
                        <button class="cb-btn cb-btn-collab" id="cb-collab-btn" title="多角色协作 · 提交需求由10个企业角色协同完成">
                            <i class="fas fa-users-gear"></i> 协作
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

                <div class="cb-stats-bar" id="cb-stats-bar">
                    <div class="cb-stat-item">
                        <i class="fas fa-robot"></i>
                        <span class="cb-stat-value" id="cb-stat-agents">0</span>
                        <span class="cb-stat-label">Agents</span>
                    </div>
                    <div class="cb-stat-item cb-stat-running">
                        <i class="fas fa-play-circle"></i>
                        <span class="cb-stat-value" id="cb-stat-running">0</span>
                        <span class="cb-stat-label">运行中</span>
                    </div>
                    <div class="cb-stat-item cb-stat-tokens-btn" id="cb-stat-tokens-btn" title="点击查看 Token 用量详情">
                        <i class="fas fa-coins"></i>
                        <span class="cb-stat-value" id="cb-stat-tokens">0</span>
                        <span class="cb-stat-label">Tokens</span>
                    </div>
                    <div class="cb-stat-item cb-stat-emergency" id="cb-emergency-stop" title="紧急中断所有运行中的 Agent">
                        <i class="fas fa-stop-circle"></i>
                        <span class="cb-stat-label">紧急停止</span>
                    </div>
                    <div class="cb-stat-item cb-stat-obs-btn" id="cb-obs-toggle" title="可观测性面板 · 实时日志流">
                        <i class="fas fa-satellite-dish"></i>
                        <span class="cb-stat-label">追踪</span>
                    </div>
                    <div class="cb-stat-item cb-stat-project-switcher" id="cb-project-switcher">
                        <i class="fas fa-folder-open"></i>
                        <span class="cb-stat-value" id="cb-stat-project">全部项目</span>
                        <i class="fas fa-chevron-down cb-project-chevron"></i>
                        <div class="cb-project-dropdown" id="cb-project-dropdown">
                            <div class="cb-project-dropdown-header">
                                <input class="cb-project-search" placeholder="搜索或添加项目..." id="cb-project-search" />
                            </div>
                            <div class="cb-project-list" id="cb-project-list">
                                <div class="cb-project-item active" data-project-id="">
                                    <i class="fas fa-globe"></i> 全部项目
                                </div>
                            </div>
                            <div class="cb-project-add" id="cb-project-add">
                                <i class="fas fa-plus"></i> 添加当前目录为项目
                            </div>
                        </div>
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

                <div class="cb-history-panel" id="cb-history-panel">
                    <div class="cb-history-header">
                        <h3><i class="fas fa-clock-rotate-left"></i> 对话历史</h3>
                        <button class="cb-btn cb-btn-icon" id="cb-history-close" title="关闭历史"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="cb-history-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="cb-history-search-input" placeholder="搜索对话..." autocomplete="off">
                    </div>
                    <div class="cb-history-list" id="cb-history-list">
                        <div class="cb-history-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>
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
                                    <input id="cb-input-cwd" placeholder="输入路径，或点击右侧按钮浏览…" autocomplete="off" />
                                    <button class="cb-btn cb-btn-browse" id="cb-cwd-browse-btn" title="浏览文件夹">
                                        <i class="fas fa-folder-open"></i>
                                    </button>
                                    <button class="cb-btn cb-btn-browse" id="cb-cwd-system-dialog" title="系统文件选择器">
                                        <i class="fas fa-arrow-up-from-bracket"></i>
                                    </button>
                                    <button class="cb-btn cb-btn-browse" id="cb-cwd-history-btn" title="最近使用的目录">
                                        <i class="fas fa-clock-rotate-left"></i>
                                    </button>
                                    <button class="cb-btn cb-btn-browse" id="cb-cwd-paste" title="粘贴剪贴板路径">
                                        <i class="fas fa-paste"></i>
                                    </button>
                                </div>
                                <div class="cb-cwd-autocomplete" id="cb-cwd-autocomplete"></div>
                                <div class="cb-cwd-tree-panel" id="cb-cwd-tree-panel">
                                    <div class="cb-tree-toolbar">
                                        <button class="cb-btn cb-btn-sm" id="cb-tree-up" title="上级目录"><i class="fas fa-arrow-up"></i></button>
                                        <span class="cb-tree-path" id="cb-tree-current-path"></span>
                                        <button class="cb-btn cb-btn-sm" id="cb-tree-select" title="选择当前目录"><i class="fas fa-check"></i> 选择此目录</button>
                                    </div>
                                    <div class="cb-tree-entries" id="cb-tree-entries"></div>
                                </div>
                                <div class="cb-cwd-history-dropdown" id="cb-cwd-history-dropdown"></div>
                                <div class="cb-cwd-hint">路径输入 · 文件树浏览 · 系统对话框 · 历史记录 · 粘贴</div>
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

                <div class="cb-collab-modal" id="cb-collab-modal">
                    <div class="cb-collab-content">
                        <div class="cb-collab-header">
                            <h3><i class="fas fa-users-gear"></i> 多角色协作</h3>
                            <button class="cb-btn cb-btn-icon" id="cb-collab-close"><i class="fas fa-times"></i></button>
                        </div>
                        <div class="cb-collab-body">
                            <div class="cb-collab-step active" id="cb-collab-step-input">
                                <div class="cb-collab-step-title"><span class="cb-collab-step-num">1</span> 输入需求</div>
                                <p class="cb-collab-hint">描述你想完成的任务，系统将自动分析并分配给 10 个企业角色协同完成。</p>
                                <textarea id="cb-collab-requirement" rows="5" placeholder="例如：开发一个任务提醒功能，支持定时提醒和重复任务&#10;&#10;提示：描述越详细，分析越精准。可包含技术栈、功能点、约束条件等。"></textarea>
                                <div class="cb-collab-model-picker" id="cb-collab-model-picker">
                                    <label class="cb-collab-model-picker-label"><i class="fas fa-microchip"></i> 协作模型</label>
                                    <select id="cb-collab-global-model" class="cb-collab-global-model-select">
                                        <option value="">自动分配（推荐）</option>
                                    </select>
                                </div>
                                <div class="cb-collab-actions">
                                    <button class="cb-btn cb-btn-primary" id="cb-collab-analyze"><i class="fas fa-brain"></i> 智能分析</button>
                                </div>
                            </div>
                            <div class="cb-collab-step" id="cb-collab-step-analysis">
                                <div class="cb-collab-step-title"><span class="cb-collab-step-num">2</span> 分析结果</div>
                                <div class="cb-collab-analysis" id="cb-collab-analysis"></div>
                                <div class="cb-collab-actions">
                                    <button class="cb-btn cb-btn-secondary" id="cb-collab-back-input"><i class="fas fa-arrow-left"></i> 修改需求</button>
                                    <button class="cb-btn cb-btn-primary" id="cb-collab-approve"><i class="fas fa-check"></i> 批准执行</button>
                                </div>
                            </div>
                            <div class="cb-collab-step" id="cb-collab-step-discussion">
                                <div class="cb-collab-step-title"><span class="cb-collab-step-num">3</span> 团队讨论</div>
                                <div class="cb-disc-toolbar" id="cb-disc-toolbar">
                                    <div class="cb-disc-filters" id="cb-disc-filters"></div>
                                    <div class="cb-disc-view-switcher">
                                        <button class="cb-disc-view-btn active" data-view="timeline"><i class="fas fa-stream"></i> 时间线</button>
                                        <button class="cb-disc-view-btn" data-view="summary"><i class="fas fa-file-lines"></i> 总结</button>
                                    </div>
                                </div>
                                <div class="cb-collab-discussion cb-disc-timeline-wrap" id="cb-collab-discussion"></div>
                                <div class="cb-disc-summary-view" id="cb-disc-summary" style="display:none"></div>
                                <div class="cb-realign-input-wrap" id="cb-realign-input-wrap" style="display:none">
                                    <div class="cb-realign-label"><i class="fas fa-bullseye"></i> 对齐调整说明</div>
                                    <textarea id="cb-realign-input" rows="3" placeholder="描述需要调整的内容，例如：API 接口不要用 REST，改用 GraphQL..."></textarea>
                                </div>
                                <div class="cb-collab-actions">
                                    <button class="cb-btn cb-btn-primary" id="cb-collab-next-round"><i class="fas fa-forward"></i> 下一轮讨论</button>
                                    <button class="cb-btn cb-btn-secondary" id="cb-collab-conclude"><i class="fas fa-gavel"></i> 总结决策</button>
                                </div>
                            </div>
                            <div class="cb-collab-step" id="cb-collab-step-report">
                                <div class="cb-collab-step-title"><span class="cb-collab-step-num">4</span> 结果报告</div>
                                <div class="cb-collab-report" id="cb-collab-report"></div>
                                <div class="cb-collab-actions">
                                    <button class="cb-btn cb-btn-warning" id="cb-collab-back-discussion"><i class="fas fa-rotate-left"></i> 返回讨论 · 重新对齐</button>
                                    <button class="cb-btn cb-btn-secondary" id="cb-collab-new-task"><i class="fas fa-plus"></i> 新任务</button>
                                </div>
                            </div>
                        </div>
                        <div class="cb-collab-progress" id="cb-collab-progress">
                            <div class="cb-collab-progress-steps">
                                <span class="cb-collab-prog-dot active" data-step="input">需求</span>
                                <span class="cb-collab-prog-line"></span>
                                <span class="cb-collab-prog-dot" data-step="analysis">分析</span>
                                <span class="cb-collab-prog-line"></span>
                                <span class="cb-collab-prog-dot" data-step="discussion">讨论</span>
                                <span class="cb-collab-prog-line"></span>
                                <span class="cb-collab-prog-dot" data-step="report">报告</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="cb-footer">
                    <span class="cb-footer-info" id="cb-footer-info">cursor-bridge</span>
                    <div class="cb-footer-controls" id="cb-footer-controls">
                        <button class="cb-btn cb-btn-sm cb-btn-start" id="cb-bridge-start" title="启动 cursor-bridge 服务">
                            <i class="fas fa-play"></i> 启动服务
                        </button>
                        <button class="cb-btn cb-btn-sm cb-btn-stop" id="cb-bridge-stop" title="停止 cursor-bridge 服务" style="display:none">
                            <i class="fas fa-stop"></i> 停止
                        </button>
                        <span class="cb-native-status" id="cb-native-status"></span>
                    </div>
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

            const defaultFavs = ['claude-sonnet-4-6', 'gpt-5.4', 'composer-2.5', 'composer-2'];
            const allIds = new Set(MODEL_FAMILIES.flatMap(f => f.models.map(m => m.id)));
            const favModels = defaultFavs.filter(id => allIds.has(id)).slice(0, 3);
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
                                    <span class="cb-fav-dot" style="background:${fm.family.color || '#9ca3af'}"></span>
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
            panel.querySelector('#cb-collab-btn')?.addEventListener('click', () => this._showCollabModal());
            panel.querySelector('#cb-cmd-trigger')?.addEventListener('click', () => this.toggleCmd());
            panel.querySelector('#cb-history-btn')?.addEventListener('click', () => this._toggleHistory());
            panel.querySelector('#cb-workflow-btn')?.addEventListener('click', () => this._showWorkflowPanel());
            panel.querySelector('#cb-history-close')?.addEventListener('click', () => this._toggleHistory(false));
            panel.querySelector('#cb-history-search-input')?.addEventListener('input', e => this._filterHistory(e.target.value));

            panel.querySelector('#cb-emergency-stop')?.addEventListener('click', () => this._emergencyStop());
            panel.querySelector('#cb-stat-tokens-btn')?.addEventListener('click', () => this._showTokenUsagePanel());
            panel.querySelector('#cb-obs-toggle')?.addEventListener('click', () => this._toggleObservability());

            this._initProjectSwitcher();

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

            panel.querySelector('#cb-cwd-paste')?.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    const cwdInput = panel.querySelector('#cb-input-cwd');
                    if (cwdInput && text.trim()) {
                        cwdInput.value = text.trim();
                        cwdInput.focus();
                        this._showToast('已粘贴路径', 'success');
                    }
                } catch {
                    this._showToast('无法读取剪贴板，请手动输入路径', 'warning');
                }
            });

            panel.querySelector('#cb-cwd-history-btn')?.addEventListener('click', () => {
                this._closeCwdTree();
                this._closeCwdAutocomplete();
                this._toggleCwdHistory();
            });

            panel.querySelector('#cb-cwd-browse-btn')?.addEventListener('click', () => {
                this._closeCwdHistory();
                this._closeCwdAutocomplete();
                this._toggleCwdTree();
            });

            panel.querySelector('#cb-cwd-system-dialog')?.addEventListener('click', () => this._openSystemDialog());

            panel.querySelector('#cb-tree-up')?.addEventListener('click', () => this._treeNavigateUp());
            panel.querySelector('#cb-tree-select')?.addEventListener('click', () => this._treeSelectCurrent());

            const cwdInput = panel.querySelector('#cb-input-cwd');
            if (cwdInput) {
                let _acTimer = null;
                cwdInput.addEventListener('input', () => {
                    clearTimeout(_acTimer);
                    _acTimer = setTimeout(() => this._handleCwdAutocomplete(cwdInput.value), 200);
                });
                cwdInput.addEventListener('keydown', e => {
                    if (e.key === 'Tab' || e.key === 'ArrowDown') {
                        const ac = panel.querySelector('#cb-cwd-autocomplete');
                        if (ac?.classList.contains('open')) {
                            e.preventDefault();
                            const first = ac.querySelector('.cb-ac-item');
                            if (first) { cwdInput.value = first.dataset.path + '/'; cwdInput.dispatchEvent(new Event('input')); }
                        }
                    }
                    if (e.key === 'Escape') { this._closeCwdAutocomplete(); }
                });
                cwdInput.addEventListener('dragover', e => { e.preventDefault(); cwdInput.classList.add('drag-over'); });
                cwdInput.addEventListener('dragleave', () => cwdInput.classList.remove('drag-over'));
                cwdInput.addEventListener('drop', e => {
                    e.preventDefault();
                    cwdInput.classList.remove('drag-over');
                    const text = e.dataTransfer?.getData('text/plain') || '';
                    if (text.trim()) {
                        cwdInput.value = text.trim();
                        this._showToast('已拖入路径', 'success');
                    }
                });
            }

            document.addEventListener('click', e => {
                const dropdown = panel.querySelector('#cb-cwd-history-dropdown');
                const histBtn = panel.querySelector('#cb-cwd-history-btn');
                if (dropdown?.classList.contains('open') && !dropdown.contains(e.target) && e.target !== histBtn && !histBtn?.contains(e.target)) {
                    dropdown.classList.remove('open');
                }
                const ac = panel.querySelector('#cb-cwd-autocomplete');
                if (ac?.classList.contains('open') && !ac.contains(e.target) && e.target !== cwdInput) {
                    ac.classList.remove('open');
                }
            });

            panel.querySelector('#cb-empty')?.addEventListener('click', () => this._showCreateModal());

            panel.querySelector('#cb-bridge-start')?.addEventListener('click', () => this.startBridge());
            panel.querySelector('#cb-bridge-stop')?.addEventListener('click', () => {
                if (this.agents.length > 0) {
                    if (!confirm(`当前有 ${this.agents.length} 个活跃 Agent，停止服务会断开所有连接。确定要停止？`)) return;
                }
                this.stopBridge();
            });

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
                        { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
                        { label: 'GPT-5.4', value: 'gpt-5.4' },
                        { label: 'Composer 2', value: 'composer-2' },
                        { label: 'Grok 4.3', value: 'grok-4.3' },
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
                            this._saveCwdToHistory(cfg.cwd);
                            if (cfg.prompt && agent?.id) {
                                setTimeout(() => this.sendPrompt(agent.id, cfg.prompt), 500);
                            }
                        }).catch(err => this._showToast(`创建失败: ${err.message}`, 'error'));
                    }
                    break;
            }
        }

        // ─── History panel ───

        _toggleHistory(show) {
            const panel = this._panelEl?.querySelector('#cb-history-panel');
            if (!panel) return;
            const open = show !== undefined ? show : !this._historyOpen;
            this._historyOpen = open;
            panel.classList.toggle('open', open);
            if (open) this._loadHistory();
        }

        async _loadHistory() {
            const listEl = this._panelEl?.querySelector('#cb-history-list');
            if (!listEl) return;
            listEl.innerHTML = '<div class="cb-history-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

            if (!this.connected) {
                listEl.innerHTML = '<div class="cb-history-empty"><i class="fas fa-plug"></i><p>服务未连接</p><p style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px">请先启动 cursor-bridge 服务</p></div>';
                return;
            }

            try {
                let url = '/conversations?limit=50';
                if (this._currentProjectId) url += `&projectId=${encodeURIComponent(this._currentProjectId)}`;
                const data = await this._api(url);
                const convs = data?.conversations || [];
                if (!convs.length) {
                    listEl.innerHTML = '<div class="cb-history-empty"><i class="fas fa-inbox"></i><p>暂无历史记录</p><p style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px">创建并运行 Agent 后，对话记录将自动保存至此</p></div>';
                    return;
                }
                listEl.innerHTML = convs.map(c => {
                    const d = new Date(c.created_at || c.createdAt);
                    const timeStr = d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const statusCls = c.status === 'completed' ? 'done' : c.status === 'error' ? 'err' : 'run';
                    const msgCount = c.message_count || c.messageCount || 0;
                    return `<div class="cb-history-item" data-conv-id="${c.id}" data-search-text="${this._esc((c.agent_name || '') + ' ' + (c.model || '') + ' ' + (c.description || '')).toLowerCase()}">
                        <div class="cb-history-item-top">
                            <span class="cb-history-title">${this._esc(c.title || c.agent_name || 'Agent 对话')}</span>
                            <div class="cb-history-item-actions">
                                <span class="cb-history-status cb-hs-${statusCls}">${c.status === 'completed' ? '完成' : c.status === 'error' ? '失败' : '运行中'}</span>
                                <button class="cb-btn-icon-sm cb-history-delete" data-conv-id="${c.id}" title="删除对话"><i class="fas fa-trash-alt"></i></button>
                            </div>
                        </div>
                        <div class="cb-history-item-meta">
                            <span><i class="fas fa-clock"></i> ${timeStr}</span>
                            <span><i class="fas fa-comment"></i> ${msgCount} 条消息</span>
                            ${c.model ? `<span><i class="fas fa-robot"></i> ${c.model}</span>` : ''}
                        </div>
                    </div>`;
                }).join('');
                listEl.querySelectorAll('.cb-history-item').forEach(item => {
                    item.addEventListener('click', e => {
                        if (e.target.closest('.cb-history-delete')) return;
                        this._showHistoryDetail(item.dataset.convId);
                    });
                });
                listEl.querySelectorAll('.cb-history-delete').forEach(btn => {
                    btn.addEventListener('click', e => {
                        e.stopPropagation();
                        this._deleteConversation(btn.dataset.convId);
                    });
                });
            } catch (err) {
                const msg = err.message || '未知错误';
                const isServerErr = msg.includes('500') || msg.includes('Internal');
                listEl.innerHTML = `<div class="cb-history-empty">
                    <i class="fas fa-exclamation-triangle" style="color:rgba(245,158,11,0.7)"></i>
                    <p>${isServerErr ? '服务暂不可用' : '加载失败'}</p>
                    <p style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:6px">${isServerErr ? '历史记录服务正在初始化，请稍后重试' : this._esc(msg)}</p>
                    <button class="cb-btn cb-btn-sm cb-retry-history" style="margin-top:10px">
                        <i class="fas fa-redo"></i> 重试
                    </button>
                </div>`;
                listEl.querySelector('.cb-retry-history')?.addEventListener('click', () => this._loadHistory());
            }
        }

        _filterHistory(keyword) {
            const q = (keyword || '').toLowerCase().trim();
            const items = document.querySelectorAll('.cb-history-item');
            items.forEach(item => {
                if (!q) { item.style.display = ''; return; }
                const text = item.dataset.searchText || '';
                const title = item.querySelector('.cb-history-title')?.textContent?.toLowerCase() || '';
                item.style.display = (text.includes(q) || title.includes(q)) ? '' : 'none';
            });
        }

        async _deleteConversation(convId) {
            if (!confirm('确定删除此对话及其所有消息？')) return;
            try {
                await this._api(`/conversations/${convId}`, { method: 'DELETE' });
                for (const [agentId, cId] of this._agentConvMap) {
                    if (cId === convId) { this._agentConvMap.delete(agentId); break; }
                }
                this._persistConvMap();
                this._toggleHistory(true);
            } catch (e) {
                console.error('[cursor-bridge] 删除对话失败:', e);
                this._toast('删除失败: ' + e.message, 'error');
            }
        }

        async _showHistoryDetail(convId) {
            try {
                const [convData, msgData] = await Promise.all([
                    this._api(`/conversations/${convId}`),
                    this._api(`/conversations/${convId}/messages`),
                ]);
                const conv = convData || {};
                const msgs = msgData?.messages || [];
                if (!msgs.length) { this._showToast('该对话暂无消息', 'info'); return; }
                const html = msgs.map(m => {
                    const role = m.role === 'user' ? '用户' : 'Agent';
                    const cls = m.role === 'user' ? 'user' : 'assistant';
                    const roleColor = cls === 'user' ? '#4ade80' : '#818cf8';
                    const content = m.content || '';
                    const rendered = cls === 'assistant'
                        ? this._renderHistoryMarkdown(content)
                        : `<div class="cb-hist-text-pre">${this._esc(content)}</div>`;
                    return `<div class="cb-hist-msg cb-hist-msg-${cls}">
                        <div class="cb-hist-msg-role" style="color:${roleColor}"><strong>${role}:</strong></div>
                        <div class="cb-hist-msg-content">${rendered}</div>
                    </div>`;
                }).join('');
                const detail = document.createElement('div');
                detail.className = 'cb-history-detail-overlay';
                detail.innerHTML = `<div class="cb-history-detail">
                    <div class="cb-history-detail-header">
                        <h3>对话详情</h3>
                        <div class="cb-hist-detail-actions">
                            <button class="cb-btn cb-btn-primary cb-hist-resume-btn" title="基于此历史继续对话">
                                <i class="fas fa-play"></i> 继续对话
                            </button>
                            <button class="cb-btn cb-btn-icon cb-hist-detail-close"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                    <div class="cb-history-detail-meta">
                        <span><i class="fas fa-robot"></i> ${this._esc(conv.agent_name || 'Agent')}</span>
                        <span><i class="fas fa-microchip"></i> ${this._esc(conv.model || '')}</span>
                        <span><i class="fas fa-folder"></i> ${this._esc(conv.cwd || '')}</span>
                    </div>
                    <div class="cb-history-detail-body">${html}</div>
                </div>`;
                this._panelEl.appendChild(detail);
                detail.querySelector('.cb-hist-detail-close').addEventListener('click', () => detail.remove());
                detail.querySelector('.cb-hist-resume-btn')?.addEventListener('click', () => {
                    detail.remove();
                    this._resumeConversation(conv, msgs);
                });
                detail.addEventListener('click', e => { if (e.target === detail) detail.remove(); });
                if (typeof MarkdownRenderer !== 'undefined') {
                    MarkdownRenderer.bindCopyButtons(detail);
                }
            } catch (err) {
                this._showToast('加载对话详情失败: ' + err.message, 'error');
            }
        }

        _renderHistoryMarkdown(text) {
            if (!text) return '';
            if (typeof MarkdownRenderer !== 'undefined' && MarkdownRenderer.render) {
                try { return MarkdownRenderer.render(text); } catch {}
            }
            return this._simpleMarkdown(text);
        }

        async _resumeConversation(conv, messages) {
            if (!this.connected) { this._showToast('cursor-bridge 未连接', 'error'); return; }
            const lastUserMsgs = messages.filter(m => m.role === 'user');
            const contextSummary = messages.slice(-6).map(m => `${m.role}: ${(m.content || '').substring(0, 200)}`).join('\n');

            try {
                const data = await this._api('/agents', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: `${conv.agent_name || 'Agent'} (续)`,
                        model: conv.model || 'claude-sonnet-4-6',
                        cwd: conv.cwd || '/',
                        description: `从历史对话恢复 — 原对话 ${conv.id}`,
                    })
                });
                const agentId = data?.id;
                if (!agentId) throw new Error('创建 Agent 失败');

                await this.refreshAgents();
                this._toggleHistory(false);

                const resumePrompt = `请继续之前的对话。以下是之前的对话上下文摘要：\n\n${contextSummary}\n\n请基于以上上下文继续协助我。`;
                await this.sendPrompt(agentId, resumePrompt);
                this._showToast('已恢复对话，Agent 已创建', 'success');
            } catch (err) {
                this._showToast('恢复对话失败: ' + err.message, 'error');
            }
        }

        // ─── Create modal (form mode) ───

        _showCreateModal(template) {
            if (!this.connected) { this._showToast('cursor-bridge 服务未连接', 'error'); return; }
            const modal = this._panelEl?.querySelector('#cb-create-modal');
            if (!modal) return;
            this._renderTemplateSelector(template);
            if (template) {
                const tpl = AGENT_TEMPLATES.find(t => t.id === template);
                if (tpl) {
                    this._panelEl.querySelector('#cb-input-name').value = tpl.name;
                    this._panelEl.querySelector('#cb-input-desc').value = tpl.description;
                    this._panelEl.querySelector('#cb-input-prompt').value = this._buildFullPrompt(tpl);
                    this._updatePromptPreview(tpl);
                }
            } else {
                this._clearPromptPreview();
            }
            this._switchCreateMode('form');
            modal.classList.add('open');
        }

        _buildFullPrompt(tpl) {
            if (!tpl?.skill) return tpl?.defaultPrompt || '';
            const s = tpl.skill;
            const parts = [];
            if (s.role) parts.push(`# 角色\n你是一位${s.role}。`);
            if (s.behavior?.length) parts.push(`\n# 行为准则\n${s.behavior.map((b, i) => `${i + 1}. ${b}`).join('\n')}`);
            if (s.outputFormat) parts.push(`\n# 输出格式\n${s.outputFormat}`);
            if (s.constraints?.length) parts.push(`\n# 约束\n${s.constraints.map(c => `- ${c}`).join('\n')}`);
            if (tpl.defaultPrompt) parts.push(`\n# 任务\n${tpl.defaultPrompt}`);
            return parts.join('\n');
        }

        _renderTemplateSelector(activeId) {
            let wrap = this._panelEl?.querySelector('#cb-template-selector');
            if (!wrap) {
                const formView = this._panelEl?.querySelector('#cb-create-form-view');
                if (!formView) return;
                wrap = document.createElement('div');
                wrap.id = 'cb-template-selector';
                wrap.className = 'cb-template-selector';
                formView.insertBefore(wrap, formView.firstChild);
            }
            wrap.innerHTML = `
                <label class="cb-tpl-label">选择模板 <span style="color:rgba(255,255,255,0.3);font-weight:normal;font-size:11px">点击预览完整 Prompt</span></label>
                <div class="cb-tpl-chips">
                    ${AGENT_TEMPLATES.map(t => `
                        <button class="cb-tpl-chip ${t.id === activeId ? 'active' : ''}" data-tpl-id="${t.id}" title="${t.description}">
                            <i class="fas ${t.icon}" style="color:${t.color}"></i>
                            <span>${t.name}</span>
                        </button>
                    `).join('')}
                    <button class="cb-tpl-chip ${!activeId ? 'active' : ''}" data-tpl-id="" title="自定义空白 Agent">
                        <i class="fas fa-plus" style="color:#94a3b8"></i>
                        <span>自定义</span>
                    </button>
                </div>
            `;
            wrap.querySelectorAll('.cb-tpl-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    wrap.querySelectorAll('.cb-tpl-chip').forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');
                    const tplId = chip.dataset.tplId;
                    this._pendingTemplateId = tplId || null;
                    if (tplId) {
                        const tpl = AGENT_TEMPLATES.find(t => t.id === tplId);
                        if (tpl) {
                            this._panelEl.querySelector('#cb-input-name').value = tpl.name;
                            this._panelEl.querySelector('#cb-input-desc').value = tpl.description;
                            this._panelEl.querySelector('#cb-input-prompt').value = this._buildFullPrompt(tpl);
                            this._updatePromptPreview(tpl);
                        }
                    } else {
                        ['#cb-input-name', '#cb-input-desc', '#cb-input-prompt'].forEach(sel => {
                            const el = this._panelEl?.querySelector(sel);
                            if (el) el.value = '';
                        });
                        this._clearPromptPreview();
                    }
                });
            });
        }

        _updatePromptPreview(tpl) {
            let preview = this._panelEl?.querySelector('#cb-prompt-preview');
            if (!preview) {
                const promptGroup = this._panelEl?.querySelector('#cb-input-prompt')?.closest('.cb-form-group');
                if (!promptGroup) return;
                preview = document.createElement('div');
                preview.id = 'cb-prompt-preview';
                preview.className = 'cb-prompt-preview';
                promptGroup.after(preview);
            }
            if (!tpl?.skill) { preview.style.display = 'none'; return; }
            const s = tpl.skill;
            preview.style.display = '';
            preview.innerHTML = `
                <div class="cb-preview-header">
                    <span class="cb-preview-title"><i class="fas fa-eye"></i> Prompt 预览</span>
                    <button class="cb-btn cb-btn-sm cb-preview-toggle" title="收起/展开">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                </div>
                <div class="cb-preview-body">
                    <div class="cb-preview-section">
                        <span class="cb-preview-tag role">角色</span>
                        <span>${this._esc(s.role)}</span>
                    </div>
                    ${s.behavior?.length ? `<div class="cb-preview-section">
                        <span class="cb-preview-tag behavior">行为</span>
                        <ul>${s.behavior.map(b => `<li>${this._esc(b)}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${s.outputFormat ? `<div class="cb-preview-section">
                        <span class="cb-preview-tag output">输出格式</span>
                        <pre>${this._esc(s.outputFormat)}</pre>
                    </div>` : ''}
                    ${s.constraints?.length ? `<div class="cb-preview-section">
                        <span class="cb-preview-tag constraint">约束</span>
                        <ul>${s.constraints.map(c => `<li>${this._esc(c)}</li>`).join('')}</ul>
                    </div>` : ''}
                </div>
            `;
            const toggleBtn = preview.querySelector('.cb-preview-toggle');
            const body = preview.querySelector('.cb-preview-body');
            toggleBtn?.addEventListener('click', () => {
                body.classList.toggle('collapsed');
                toggleBtn.querySelector('i').className = body.classList.contains('collapsed') ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
            });
        }

        _clearPromptPreview() {
            const preview = this._panelEl?.querySelector('#cb-prompt-preview');
            if (preview) preview.style.display = 'none';
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

            const tplMatch = AGENT_TEMPLATES.find(t => t.name === name || t.id === this._pendingTemplateId);
            this._hideCreateModal();
            try {
                const agent = await this.createAgent({
                    name, cwd,
                    model: model || undefined,
                    description: description || undefined,
                    _templateId: tplMatch?.id || this._pendingTemplateId || undefined,
                });
                this._showToast(`Agent "${name}" 创建成功`, 'success');
                this._saveCwdToHistory(cwd);
                if (prompt && agent?.id) {
                    setTimeout(() => this.sendPrompt(agent.id, prompt), 500);
                }
            } catch (err) { this._showToast(`创建失败: ${err.message}`, 'error'); }
            this._pendingTemplateId = null;
        }

        _createFromTemplate(templateId) {
            this._pendingTemplateId = templateId;
            this._showCreateModal(templateId);
        }

        // ─── Agent 依赖链接 Modal ───

        _showLinkAgentModal(sourceAgentId) {
            const others = this.agents.filter(a => a.id !== sourceAgentId);
            if (!others.length) {
                this._showToast('需要至少 2 个 Agent 才能设置依赖', 'info');
                return;
            }
            const srcAgent = this.agents.find(a => a.id === sourceAgentId);
            const existingDeps = this._agentDeps.get(sourceAgentId) || [];
            const linkedIds = new Set(existingDeps.map(d => d.toAgentId));

            const optionsHtml = others.map(a => {
                const linked = linkedIds.has(a.id);
                return `<label class="cb-link-option ${linked ? 'linked' : ''}">
                    <input type="checkbox" value="${a.id}" ${linked ? 'checked' : ''} />
                    <span class="cb-link-name">${this._esc(a.name)}</span>
                    <span class="cb-link-model">${a.model}</span>
                    ${linked ? '<i class="fas fa-link cb-link-icon"></i>' : ''}
                </label>`;
            }).join('');

            const modalHtml = `<div class="cb-link-modal-overlay" id="cb-link-modal">
                <div class="cb-link-modal">
                    <div class="cb-link-modal-header">
                        <h3><i class="fas fa-link"></i> 设置依赖链</h3>
                        <span class="cb-link-source">当 "${this._esc(srcAgent?.name)}" 完成后触发：</span>
                    </div>
                    <div class="cb-link-modal-body">${optionsHtml}</div>
                    <div class="cb-link-modal-footer">
                        <button class="cb-btn" id="cb-link-cancel">取消</button>
                        <button class="cb-btn cb-btn-primary" id="cb-link-confirm">确认</button>
                    </div>
                </div>
            </div>`;

            const existing = this._panelEl?.querySelector('#cb-link-modal');
            if (existing) existing.remove();
            this._panelEl?.insertAdjacentHTML('beforeend', modalHtml);

            const modal = this._panelEl?.querySelector('#cb-link-modal');
            modal?.querySelector('#cb-link-cancel')?.addEventListener('click', () => modal.remove());
            modal?.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

            modal?.querySelector('#cb-link-confirm')?.addEventListener('click', () => {
                const checked = modal.querySelectorAll('input[type="checkbox"]');
                this._agentDeps.delete(sourceAgentId);

                checked.forEach(cb => {
                    if (cb.checked) {
                        this.setAgentDependency(sourceAgentId, cb.value,
                            `Agent "{agent_name}" 已完成任务。以下是其输出结果：\n\n{output}\n\n请基于以上结果继续你的任务。`
                        );
                    }
                });

                const count = (this._agentDeps.get(sourceAgentId) || []).length;
                this._showToast(count ? `已设置 ${count} 个下游依赖` : '已清除所有依赖', 'success');
                modal.remove();
            });
        }

        // ─── 工作流面板 ───

        async _showWorkflowPanel() {
            if (!this.connected) { this._showToast('cursor-bridge 服务未连接', 'error'); return; }
            try {
                const data = await this._api('/workflows');
                const workflows = data?.workflows || [];
                this._renderWorkflowModal(workflows);
            } catch (err) {
                this._showToast(`加载工作流失败: ${err.message}`, 'error');
            }
        }

        _renderWorkflowModal(workflows) {
            const cardsHtml = workflows.map(wf => {
                const stepCount = wf.steps?.length || 0;
                const isBuiltin = wf.is_builtin;
                const stepsPreview = (wf.steps || []).map((s, i) => {
                    const tpl = AGENT_TEMPLATES.find(t => t.id === s.templateId);
                    return `<span class="cb-wf-step-chip"><i class="fas ${tpl?.icon || 'fa-robot'}"></i> ${tpl?.name || s.templateId}</span>`;
                }).join('<i class="fas fa-arrow-right cb-wf-arrow"></i>');

                return `<div class="cb-wf-card" data-wf-id="${wf.id}">
                    <div class="cb-wf-card-header">
                        <span class="cb-wf-card-name">${this._esc(wf.name)}</span>
                        ${isBuiltin ? '<span class="cb-wf-badge">内置</span>' : '<span class="cb-wf-badge custom">自定义</span>'}
                    </div>
                    <div class="cb-wf-card-desc">${this._esc(wf.description || '')}</div>
                    <div class="cb-wf-steps-preview">${stepsPreview}</div>
                    <div class="cb-wf-card-meta">${stepCount} 个步骤${wf.variables?.length ? ` · ${wf.variables.length} 个参数` : ''}</div>
                    <button class="cb-btn cb-btn-primary cb-wf-run-btn" data-wf-run="${wf.id}">
                        <i class="fas fa-play"></i> 运行
                    </button>
                </div>`;
            }).join('');

            const modalHtml = `<div class="cb-wf-modal-overlay" id="cb-wf-modal">
                <div class="cb-wf-modal">
                    <div class="cb-wf-modal-header">
                        <h3><i class="fas fa-sitemap"></i> 工作流模板</h3>
                        <button class="cb-btn cb-btn-icon" id="cb-wf-close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="cb-wf-modal-body">
                        ${cardsHtml || '<div class="cb-wf-empty">暂无工作流模板</div>'}
                    </div>
                </div>
            </div>`;

            const existing = this._panelEl?.querySelector('#cb-wf-modal');
            if (existing) existing.remove();
            this._panelEl?.insertAdjacentHTML('beforeend', modalHtml);

            const modal = this._panelEl?.querySelector('#cb-wf-modal');
            modal?.querySelector('#cb-wf-close')?.addEventListener('click', () => modal.remove());
            modal?.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

            modal?.querySelectorAll('[data-wf-run]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const wfId = btn.dataset.wfRun;
                    const wf = workflows.find(w => w.id === wfId);
                    if (wf) this._runWorkflow(wf);
                    modal.remove();
                });
            });
        }

        async _runWorkflow(workflow) {
            const vars = {};
            if (workflow.variables?.length) {
                for (const v of workflow.variables) {
                    const val = prompt(`${v.description}${v.required ? ' (必填)' : ''}`, v.defaultValue || '');
                    if (v.required && !val) {
                        this._showToast(`参数 "${v.description}" 不能为空`, 'error');
                        return;
                    }
                    vars[v.name] = val || v.defaultValue || '';
                }
            }

            const steps = workflow.steps || [];
            if (!steps.length) return;

            const cwd = this.agents[0]?.cwd || '.';
            const agentIds = new Map();

            for (const step of steps) {
                const tpl = AGENT_TEMPLATES.find(t => t.id === step.templateId);
                const stepName = tpl?.name || step.templateId;
                try {
                    const agent = await this.createAgent({
                        name: `[${workflow.name}] ${stepName}`,
                        cwd,
                        description: `工作流步骤: ${stepName}`,
                        _templateId: step.templateId,
                    });
                    if (agent?.id) agentIds.set(step.id, agent.id);
                } catch (err) {
                    this._showToast(`创建 Agent "${stepName}" 失败: ${err.message}`, 'error');
                    return;
                }
            }

            for (const step of steps) {
                if (step.dependsOn?.length) {
                    for (const depStepId of step.dependsOn) {
                        const fromAgentId = agentIds.get(depStepId);
                        const toAgentId = agentIds.get(step.id);
                        if (fromAgentId && toAgentId) {
                            let promptTpl = step.prompt || '';
                            for (const [k, v] of Object.entries(vars)) {
                                promptTpl = promptTpl.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
                            }
                            this.setAgentDependency(fromAgentId, toAgentId, promptTpl);
                        }
                    }
                }
            }

            const rootSteps = steps.filter(s => !s.dependsOn?.length);
            for (const step of rootSteps) {
                const agentId = agentIds.get(step.id);
                if (!agentId) continue;
                let prompt = step.prompt || '';
                for (const [k, v] of Object.entries(vars)) {
                    prompt = prompt.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
                }
                try {
                    await this.sendPrompt(agentId, prompt);
                } catch (err) {
                    this._appendOutput(agentId, 'error', `启动失败: ${err.message}`);
                }
            }

            this._showToast(`工作流 "${workflow.name}" 已启动，${steps.length} 个步骤`, 'success');
        }

        async _loadCwdHistory() {
            try {
                const result = await new Promise(r => chrome.storage?.local?.get('bridgeCwdHistory', r));
                return (result?.bridgeCwdHistory || []).slice(0, 10);
            } catch { return []; }
        }

        async _saveCwdToHistory(cwd) {
            if (!cwd) return;
            try {
                const history = await this._loadCwdHistory();
                const filtered = history.filter(h => h !== cwd);
                filtered.unshift(cwd);
                await new Promise(r => chrome.storage?.local?.set({ bridgeCwdHistory: filtered.slice(0, 10) }, r));
            } catch { /* best-effort */ }
        }

        async _toggleCwdHistory() {
            const dropdown = this._panelEl?.querySelector('#cb-cwd-history-dropdown');
            if (!dropdown) return;

            if (dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
                return;
            }

            const history = await this._loadCwdHistory();
            if (!history.length) {
                dropdown.innerHTML = '<div class="cb-cwd-history-empty"><i class="fas fa-inbox"></i> 暂无历史记录</div>';
            } else {
                dropdown.innerHTML = history.map(path => `
                    <div class="cb-cwd-history-item" data-cwd-path="${this._esc(path)}" title="${this._esc(path)}">
                        <i class="fas fa-folder"></i>
                        <span class="cb-cwd-history-path">${this._esc(this._shortenPath(path))}</span>
                        <span class="cb-cwd-history-full">${this._esc(path)}</span>
                        <button class="cb-cwd-history-remove" data-remove-cwd="${this._esc(path)}" title="移除">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `).join('');

                dropdown.querySelectorAll('.cb-cwd-history-item').forEach(item => {
                    item.addEventListener('click', e => {
                        if (e.target.closest('.cb-cwd-history-remove')) return;
                        const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
                        if (cwdInput) cwdInput.value = item.dataset.cwdPath;
                        dropdown.classList.remove('open');
                    });
                });

                dropdown.querySelectorAll('.cb-cwd-history-remove').forEach(btn => {
                    btn.addEventListener('click', async e => {
                        e.stopPropagation();
                        const path = btn.dataset.removeCwd;
                        const history = await this._loadCwdHistory();
                        const filtered = history.filter(h => h !== path);
                        await new Promise(r => chrome.storage?.local?.set({ bridgeCwdHistory: filtered }, r));
                        btn.closest('.cb-cwd-history-item')?.remove();
                        if (!filtered.length) {
                            dropdown.innerHTML = '<div class="cb-cwd-history-empty"><i class="fas fa-inbox"></i> 暂无历史记录</div>';
                        }
                    });
                });
            }

            dropdown.classList.add('open');
        }

        // ─── 混合方案: 文件树浏览 ───

        _treePath = null;

        async _toggleCwdTree() {
            const treePanel = this._panelEl?.querySelector('#cb-cwd-tree-panel');
            if (!treePanel) return;
            if (treePanel.classList.contains('open')) {
                treePanel.classList.remove('open');
                return;
            }
            const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
            const startPath = cwdInput?.value?.trim() || null;
            await this._loadTreeDir(startPath);
            treePanel.classList.add('open');
        }

        _closeCwdTree() {
            this._panelEl?.querySelector('#cb-cwd-tree-panel')?.classList.remove('open');
        }

        _closeCwdHistory() {
            this._panelEl?.querySelector('#cb-cwd-history-dropdown')?.classList.remove('open');
        }

        _closeCwdAutocomplete() {
            this._panelEl?.querySelector('#cb-cwd-autocomplete')?.classList.remove('open');
        }

        async _loadTreeDir(dirPath) {
            try {
                const url = dirPath ? `/fs/list?path=${encodeURIComponent(dirPath)}` : '/fs/list';
                const data = await this._api(url);
                this._treePath = data.current;
                const pathEl = this._panelEl?.querySelector('#cb-tree-current-path');
                if (pathEl) pathEl.textContent = this._shortenPath(data.current, 50);
                const entriesEl = this._panelEl?.querySelector('#cb-tree-entries');
                if (!entriesEl) return;
                if (!data.entries.length) {
                    entriesEl.innerHTML = '<div class="cb-tree-empty"><i class="fas fa-folder-open"></i> 空目录</div>';
                    return;
                }
                entriesEl.innerHTML = data.entries.map(e => `
                    <div class="cb-tree-entry" data-path="${this._esc(e.path)}" title="${this._esc(e.path)}">
                        <i class="fas fa-folder" style="color: rgba(251,191,36,0.7)"></i>
                        <span>${this._esc(e.name)}</span>
                        <i class="fas fa-chevron-right cb-tree-arrow"></i>
                    </div>
                `).join('');
                entriesEl.querySelectorAll('.cb-tree-entry').forEach(entry => {
                    entry.addEventListener('click', () => this._loadTreeDir(entry.dataset.path));
                    entry.addEventListener('dblclick', () => {
                        const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
                        if (cwdInput) cwdInput.value = entry.dataset.path;
                        this._closeCwdTree();
                        this._showToast('已选择目录', 'success');
                    });
                });
            } catch (err) {
                this._showToast(`加载目录失败: ${err.message}`, 'error');
            }
        }

        _treeNavigateUp() {
            if (!this._treePath) return;
            const parent = this._treePath.split('/').slice(0, -1).join('/') || '/';
            this._loadTreeDir(parent);
        }

        _treeSelectCurrent() {
            if (!this._treePath) return;
            const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
            if (cwdInput) cwdInput.value = this._treePath;
            this._closeCwdTree();
            this._showToast('已选择目录', 'success');
        }

        // ─── 混合方案: 系统文件对话框 ───

        async _openSystemDialog() {
            try {
                this._showToast('正在打开系统文件选择器…', 'info');
                const data = await this._api('/fs/dialog', { method: 'POST' });
                if (data.path) {
                    const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
                    if (cwdInput) cwdInput.value = data.path;
                    this._showToast('已选择目录', 'success');
                } else if (data.cancelled) {
                    this._showToast('已取消选择', 'info');
                }
            } catch (err) {
                this._showToast(`选择失败: ${err.message}`, 'error');
            }
        }

        // ─── 混合方案: 路径自动补全 ───

        async _handleCwdAutocomplete(prefix) {
            const ac = this._panelEl?.querySelector('#cb-cwd-autocomplete');
            if (!ac) return;
            if (!prefix || prefix.length < 2 || !prefix.startsWith('/')) {
                ac.classList.remove('open');
                return;
            }
            try {
                const data = await this._api(`/fs/complete?prefix=${encodeURIComponent(prefix)}`);
                if (!data.results?.length) { ac.classList.remove('open'); return; }
                ac.innerHTML = data.results.map(r => `
                    <div class="cb-ac-item" data-path="${this._esc(r.path)}">
                        <i class="fas fa-folder" style="color: rgba(251,191,36,0.7)"></i>
                        <span class="cb-ac-name">${this._esc(r.name)}</span>
                        <span class="cb-ac-path">${this._esc(this._shortenPath(r.path, 40))}</span>
                    </div>
                `).join('');
                ac.classList.add('open');
                ac.querySelectorAll('.cb-ac-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const cwdInput = this._panelEl?.querySelector('#cb-input-cwd');
                        if (cwdInput) { cwdInput.value = item.dataset.path; cwdInput.focus(); }
                        ac.classList.remove('open');
                    });
                });
            } catch { ac.classList.remove('open'); }
        }

        // ─── Native Messaging ───

        async _nativeMessage(action) {
            return new Promise((resolve) => {
                if (!chrome?.runtime?.sendMessage) {
                    resolve({ ok: false, error: 'chrome.runtime not available' });
                    return;
                }
                chrome.runtime.sendMessage(
                    { action: 'bridge_native', nativeAction: action },
                    (resp) => {
                        if (chrome.runtime.lastError) {
                            resolve({ ok: false, error: chrome.runtime.lastError.message });
                        } else {
                            resolve(resp || { ok: false, error: 'No response' });
                        }
                    }
                );
            });
        }

        async startBridge() {
            this._setBridgeActionLoading(true, 'starting');
            const result = await this._nativeMessage('start');
            this._setBridgeActionLoading(false);

            if (result.ok && result.data?.success) {
                this._showNativeStatus(result.data.alreadyRunning ? '服务已在运行' : '服务已启动', 'success');
                await new Promise(r => setTimeout(r, 1500));
                await this.checkHealth();
            } else {
                const errMsg = result.data?.error || result.error || '启动失败';
                if (result.nativeNotInstalled) {
                    this._showNativeStatus('Native Host 未安装，请先运行安装脚本', 'error');
                } else {
                    this._showNativeStatus(errMsg, 'error');
                }
            }
            return result;
        }

        async stopBridge() {
            this._setBridgeActionLoading(true, 'stopping');
            const result = await this._nativeMessage('stop');
            this._setBridgeActionLoading(false);

            if (result.ok && result.data?.success) {
                this._showNativeStatus('服务已停止', 'info');
                this.connected = false;
                this.serverInfo = null;
                this._updateStatusUI();
            } else {
                this._showNativeStatus(result.data?.error || result.error || '停止失败', 'error');
            }
            return result;
        }

        async getBridgeStatus() {
            return await this._nativeMessage('status');
        }

        _setBridgeActionLoading(loading, action = '') {
            const startBtn = this._panelEl?.querySelector('#cb-bridge-start');
            const stopBtn = this._panelEl?.querySelector('#cb-bridge-stop');
            if (loading) {
                if (startBtn) { startBtn.disabled = true; startBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${action === 'starting' ? '启动中...' : '操作中...'}`; }
                if (stopBtn) { stopBtn.disabled = true; stopBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${action === 'stopping' ? '停止中...' : '操作中...'}`; }
            } else {
                if (startBtn) { startBtn.disabled = false; startBtn.innerHTML = '<i class="fas fa-play"></i> 启动服务'; }
                if (stopBtn) { stopBtn.disabled = false; stopBtn.innerHTML = '<i class="fas fa-stop"></i> 停止'; }
            }
        }

        _showNativeStatus(msg, level = 'info') {
            const el = this._panelEl?.querySelector('#cb-native-status');
            if (!el) return;
            el.textContent = msg;
            el.className = `cb-native-status ${level}`;
            clearTimeout(this._nativeStatusTimer);
            this._nativeStatusTimer = setTimeout(() => {
                el.textContent = '';
                el.className = 'cb-native-status';
            }, 5000);
        }

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
                const pid = this.serverInfo.pid ? ` · PID ${this.serverInfo.pid}` : '';
                footer.textContent = `cursor-bridge v${this.serverInfo.version || '0.3.0'} · 运行 ${this._formatUptime(this.serverInfo.uptime)}${pid}`;
            } else if (footer && !this.connected) {
                footer.textContent = 'cursor-bridge · 未连接';
            }
            const startBtn = this._panelEl?.querySelector('#cb-bridge-start');
            const stopBtn = this._panelEl?.querySelector('#cb-bridge-stop');
            if (startBtn) startBtn.style.display = this.connected ? 'none' : '';
            if (stopBtn) stopBtn.style.display = this.connected ? '' : 'none';

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
            this._restoreOutputFromSession();
        }

        _renderCard(a) {
            const statusClass = `status-${a.status}`;
            const statusLabel = { idle: '空闲', running: '运行中', error: '错误' }[a.status] || a.status;
            const tplId = this._agentTemplateMap.get(a.id);
            const tpl = tplId ? AGENT_TEMPLATES.find(t => t.id === tplId) : null;
            const skillBadge = tpl?.skill ? `<span class="cb-card-skill" title="角色: ${this._esc(tpl.skill.role)}"><i class="fas fa-user-gear"></i> ${this._esc(tpl.skill.role)}</span>` : '';
            const progress = this._agentTaskProgress.get(a.id);
            const progressHtml = progress ? `<div class="cb-card-progress" data-progress-id="${a.id}">
                <div class="cb-progress-bar"><div class="cb-progress-fill ${progress.status}" style="width:${progress.percent}%"></div></div>
                <span class="cb-progress-label">${progress.label || ''}</span>
            </div>` : '';

            return `<div class="cb-agent-card ${a.status}" data-agent-id="${a.id}">
                <div class="cb-card-header">
                    <div class="cb-card-info">
                        <span class="cb-card-name">${this._esc(a.name)}</span>
                        <span class="cb-card-model">${a.model}</span>
                        ${skillBadge}
                    </div>
                    <span class="cb-card-status ${statusClass}">${statusLabel}</span>
                </div>
                ${progressHtml}
                <div class="cb-card-meta">
                    <span class="cb-card-cwd" title="${this._esc(a.cwd)}"><i class="fas fa-folder"></i> ${this._shortenPath(a.cwd)}</span>
                    ${a.description ? `<span class="cb-card-desc">${this._esc(a.description)}</span>` : ''}
                </div>
                <div class="cb-card-output" id="cb-output-${a.id}"></div>
                <div class="cb-card-input">
                    <textarea class="cb-prompt-input" placeholder="输入指令... (Shift+Enter 换行, Enter 发送)" data-agent="${a.id}" rows="1"></textarea>
                    <button class="cb-btn cb-btn-send" data-send="${a.id}" title="发送"><i class="fas fa-paper-plane"></i></button>
                </div>
                <div class="cb-card-actions">
                    <button class="cb-btn cb-btn-sm" data-cancel="${a.id}" title="取消运行"><i class="fas fa-stop"></i><span class="cb-action-text"> 取消</span></button>
                    <button class="cb-btn cb-btn-sm" data-link-agent="${a.id}" title="设置依赖：完成后触发其他 Agent"><i class="fas fa-link"></i><span class="cb-action-text"> 链接</span></button>
                    <button class="cb-btn cb-btn-sm" data-save-memo="${a.id}" title="保存结果到备忘录"><i class="fas fa-bookmark"></i><span class="cb-action-text"> 备忘</span></button>
                    <button class="cb-btn cb-btn-sm" data-save-blog="${a.id}" title="保存结果到写作空间"><i class="fas fa-feather-alt"></i><span class="cb-action-text"> 写作</span></button>
                    <button class="cb-btn cb-btn-sm" data-copy-output="${a.id}" title="复制输出"><i class="fas fa-copy"></i><span class="cb-action-text"> 复制</span></button>
                    <button class="cb-btn cb-btn-sm" data-toggle-output="${a.id}" title="折叠/展开输出"><i class="fas fa-compress-alt"></i></button>
                    <button class="cb-btn cb-btn-sm cb-btn-danger" data-delete="${a.id}" title="销毁 Agent"><i class="fas fa-trash"></i><span class="cb-action-text"> 销毁</span></button>
                </div>
                <div class="cb-card-resize-handle" data-resize="${a.id}" title="拖拽调整大小"></div>
            </div>`;
        }

        _updateCard(el, agent) {
            el.className = `cb-agent-card ${agent.status}`;
            const statusEl = el.querySelector('.cb-card-status');
            if (statusEl) {
                statusEl.className = `cb-card-status status-${agent.status}`;
                statusEl.textContent = { idle: '空闲', running: '运行中', error: '错误', completed: '已完成' }[agent.status] || agent.status;
            }
            if (agent.status === 'idle') this._updateTaskProgress(agent.id, 'complete');
            else if (agent.status === 'error') this._updateTaskProgress(agent.id, 'error');
        }

        _updateCardStatus(agentId, agent) {
            const card = this._panelEl?.querySelector(`[data-agent-id="${agentId}"]`);
            if (!card) return;
            card.className = `cb-agent-card ${agent.status}`;
            const statusEl = card.querySelector('.cb-card-status');
            if (statusEl) {
                statusEl.className = `cb-card-status status-${agent.status}`;
                statusEl.textContent = { idle: '空闲', running: '运行中', error: '错误', completed: '已完成' }[agent.status] || agent.status;
            }
        }

        _updateTaskProgress(agentId, status, label) {
            let progress = this._agentTaskProgress.get(agentId);
            if (!progress) {
                progress = { status: 'idle', percent: 0, label: '' };
                this._agentTaskProgress.set(agentId, progress);
            }

            switch (status) {
                case 'running':
                    progress.status = 'running';
                    progress.percent = 15;
                    progress.label = label || '执行中...';
                    this._startProgressAnimation(agentId);
                    break;
                case 'streaming':
                    progress.status = 'running';
                    progress.percent = Math.min(progress.percent + 5, 90);
                    progress.label = label || '输出中...';
                    break;
                case 'complete':
                    progress.status = 'complete';
                    progress.percent = 100;
                    progress.label = label || '已完成';
                    this._stopProgressAnimation(agentId);
                    break;
                case 'error':
                    progress.status = 'error';
                    progress.label = label || '执行出错';
                    this._stopProgressAnimation(agentId);
                    break;
                case 'idle':
                    progress.status = 'idle';
                    progress.percent = 0;
                    progress.label = '';
                    this._stopProgressAnimation(agentId);
                    break;
            }

            const progressEl = this._panelEl?.querySelector(`[data-progress-id="${agentId}"]`);
            if (progressEl) {
                const fill = progressEl.querySelector('.cb-progress-fill');
                const lbl = progressEl.querySelector('.cb-progress-label');
                if (fill) {
                    fill.style.width = progress.percent + '%';
                    fill.className = `cb-progress-fill ${progress.status}`;
                }
                if (lbl) lbl.textContent = progress.label;
            }
        }

        _startProgressAnimation(agentId) {
            this._stopProgressAnimation(agentId);
            const timer = setInterval(() => {
                const p = this._agentTaskProgress.get(agentId);
                if (!p || p.status !== 'running') { clearInterval(timer); return; }
                if (p.percent < 85) {
                    p.percent += Math.random() * 3 + 1;
                    const fill = this._panelEl?.querySelector(`[data-progress-id="${agentId}"] .cb-progress-fill`);
                    if (fill) fill.style.width = p.percent + '%';
                }
            }, 2000);
            if (!this._progressTimers) this._progressTimers = new Map();
            this._progressTimers.set(agentId, timer);
        }

        _stopProgressAnimation(agentId) {
            const timer = this._progressTimers?.get(agentId);
            if (timer) {
                clearInterval(timer);
                this._progressTimers.delete(agentId);
            }
        }

        _bindCardEvents(agentId) {
            const card = this._panelEl?.querySelector(`[data-agent-id="${agentId}"]`);
            if (!card) return;
            const input = card.querySelector('.cb-prompt-input');
            input?.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._sendFromInput(agentId); }
                if (e.key === 'Escape') this._hideAgentMention();
            });
            input?.addEventListener('input', e => {
                this._handleMentionInput(e.target, agentId);
                this._autoResizeTextarea(e.target);
            });
            card.querySelector(`[data-send="${agentId}"]`)?.addEventListener('click', () => this._sendFromInput(agentId));
            card.querySelector(`[data-cancel="${agentId}"]`)?.addEventListener('click', () => this.cancelRun(agentId));
            card.querySelector(`[data-link-agent="${agentId}"]`)?.addEventListener('click', () => this._showLinkAgentModal(agentId));
            card.querySelector(`[data-save-memo="${agentId}"]`)?.addEventListener('click', () => this._saveOutputToMemo(agentId));
            card.querySelector(`[data-save-blog="${agentId}"]`)?.addEventListener('click', () => this._saveOutputToBlog(agentId));
            card.querySelector(`[data-copy-output="${agentId}"]`)?.addEventListener('click', () => this._copyOutput(agentId));
            card.querySelector(`[data-toggle-output="${agentId}"]`)?.addEventListener('click', (e) => {
                const output = this._panelEl?.querySelector(`#cb-output-${agentId}`);
                if (!output) return;
                const btn = e.currentTarget;
                const icon = btn.querySelector('i');
                const isCollapsed = output.classList.contains('collapsed');
                if (isCollapsed) {
                    output.classList.remove('collapsed');
                    if (icon) { icon.className = 'fas fa-compress-alt'; }
                    btn.title = '折叠输出';
                } else {
                    output.classList.add('collapsed');
                    if (icon) { icon.className = 'fas fa-expand-alt'; }
                    btn.title = '展开输出';
                }
            });
            card.querySelector(`[data-delete="${agentId}"]`)?.addEventListener('click', () => {
                if (confirm('确定要销毁此 Agent？')) this.deleteAgent(agentId);
            });

            const resizeHandle = card.querySelector(`[data-resize="${agentId}"]`);
            if (resizeHandle) {
                resizeHandle.addEventListener('mousedown', e => {
                    e.preventDefault();
                    const startY = e.clientY;
                    const startH = card.offsetHeight;
                    const onMove = ev => {
                        const newH = Math.max(280, startH + ev.clientY - startY);
                        card.style.height = newH + 'px';
                        const outputEl = card.querySelector('.cb-card-output');
                        if (outputEl) outputEl.style.maxHeight = Math.max(100, newH - 200) + 'px';
                    };
                    const onUp = () => {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        card.classList.remove('resizing');
                    };
                    card.classList.add('resizing');
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }
        }

        async _sendFromInput(agentId) {
            const input = this._panelEl?.querySelector(`[data-agent="${agentId}"]`);
            if (!input) return;
            const prompt = input.value.trim();
            if (!prompt) return;
            input.value = '';
            input.style.height = 'auto';
            try { await this.sendPrompt(agentId, prompt); }
            catch (err) { this._appendOutput(agentId, 'error', `发送失败: ${err.message}`); }
        }

        _autoResizeTextarea(el) {
            if (!el || el.tagName !== 'TEXTAREA') return;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
        }

        _appendOutput(agentId, cls, text) {
            const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
            if (!el) return;
            if (!this._outputRaw) this._outputRaw = {};
            if (!this._outputRaw[agentId]) this._outputRaw[agentId] = '';

            if (cls === 'text') {
                this._outputRaw[agentId] += text;
                let last = el.lastElementChild;
                if (last?.classList.contains('cb-out-text')) {
                    last.textContent += text;
                } else {
                    const span = document.createElement('div');
                    span.className = 'cb-out-text';
                    span.textContent = text;
                    el.appendChild(span);
                }
            } else if (cls === 'tool') {
                this._outputRaw[agentId] += `\n[${text}]\n`;
                const div = document.createElement('div');
                div.className = 'cb-out-tool';
                div.innerHTML = `<i class="fas fa-gear fa-spin" style="margin-right:4px"></i>${this._esc(text)}`;
                el.appendChild(div);
            } else if (cls === 'status') {
                this._outputRaw[agentId] += `\n${text}\n`;
                const div = document.createElement('div');
                div.className = 'cb-out-status';
                div.textContent = text;
                el.appendChild(div);
                this._renderMarkdownOutput(agentId);
            } else {
                this._outputRaw[agentId] += `\n${text}\n`;
                const div = document.createElement('div');
                div.className = `cb-out-${cls}`;
                div.textContent = text;
                el.appendChild(div);
            }
            el.scrollTop = el.scrollHeight;
            this._debounceSaveOutput();
        }

        _debounceSaveOutput() {
            if (this._saveOutputTimer) clearTimeout(this._saveOutputTimer);
            this._saveOutputTimer = setTimeout(() => this._saveOutputToSession(), 1000);
        }

        _renderMarkdownOutput(agentId) {
            const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
            if (!el) return;
            const textBlocks = el.querySelectorAll('.cb-out-text');
            textBlocks.forEach(block => {
                const raw = block.textContent || '';
                if (raw.includes('```') || raw.includes('**') || raw.includes('##') || raw.includes('- ')) {
                    block.innerHTML = this._simpleMarkdown(raw);
                    block.classList.add('cb-out-md');
                    block.querySelectorAll('pre code').forEach(codeEl => {
                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'cb-code-copy';
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        copyBtn.title = '复制代码';
                        copyBtn.addEventListener('click', () => {
                            navigator.clipboard.writeText(codeEl.textContent).then(() => {
                                copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                                setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i>'; }, 1500);
                            });
                        });
                        codeEl.parentElement.style.position = 'relative';
                        codeEl.parentElement.appendChild(copyBtn);
                    });
                }
            });
        }

        _simpleMarkdown(text) {
            let html = this._esc(text);
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
                return `<pre><code class="lang-${lang || 'text'}">${code.trim()}</code></pre>`;
            });
            html = html.replace(/`([^`]+)`/g, '<code class="cb-inline-code">$1</code>');
            html = html.replace(/^### (.+)$/gm, '<h4 class="cb-md-h">$1</h4>');
            html = html.replace(/^## (.+)$/gm, '<h3 class="cb-md-h">$1</h3>');
            html = html.replace(/^# (.+)$/gm, '<h2 class="cb-md-h">$1</h2>');
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
            html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
            return html;
        }

        _clearOutput(agentId) {
            const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
            if (el) el.innerHTML = '';
            if (this._outputRaw) this._outputRaw[agentId] = '';
            this._saveOutputToSession();
        }

        _saveOutputToSession() {
            try {
                if (!this._outputRaw) return;
                const data = {};
                for (const [id, raw] of Object.entries(this._outputRaw)) {
                    if (raw && raw.trim()) data[id] = raw;
                }
                sessionStorage.setItem('cb-output-cache', JSON.stringify(data));
                if (chrome?.storage?.local) {
                    chrome.storage.local.set({ cb_output_cache: data });
                }
            } catch { /* quota exceeded or unavailable */ }
        }

        _restoreOutputFromSession() {
            const doRestore = (data) => {
                if (!data || typeof data !== 'object') return;
                if (!this._outputRaw) this._outputRaw = {};
                for (const [agentId, raw] of Object.entries(data)) {
                    if (!raw) continue;
                    this._outputRaw[agentId] = raw;
                    const el = this._panelEl?.querySelector(`#cb-output-${agentId}`);
                    if (!el) continue;
                    const lines = raw.split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        if (line.startsWith('> ')) {
                            const div = document.createElement('div');
                            div.className = 'cb-out-user';
                            div.textContent = line;
                            el.appendChild(div);
                        } else if (line.startsWith('✓ ')) {
                            const div = document.createElement('div');
                            div.className = 'cb-out-status';
                            div.textContent = line;
                            el.appendChild(div);
                        } else if (line.startsWith('✗ ')) {
                            const div = document.createElement('div');
                            div.className = 'cb-out-error';
                            div.textContent = line;
                            el.appendChild(div);
                        } else if (line.startsWith('[⚙') || line.startsWith('[✓') || line.startsWith('[✗')) {
                            const div = document.createElement('div');
                            div.className = 'cb-out-tool';
                            div.textContent = line.replace(/^\[|\]$/g, '');
                            el.appendChild(div);
                        } else {
                            let last = el.lastElementChild;
                            if (last?.classList.contains('cb-out-text')) {
                                last.textContent += '\n' + line;
                            } else {
                                const div = document.createElement('div');
                                div.className = 'cb-out-text';
                                div.textContent = line;
                                el.appendChild(div);
                            }
                        }
                    }
                    el.scrollTop = el.scrollHeight;
                }
            };

            try {
                const cached = sessionStorage.getItem('cb-output-cache');
                if (cached) {
                    doRestore(JSON.parse(cached));
                    return;
                }
            } catch { /* parse error */ }

            if (chrome?.storage?.local) {
                chrome.storage.local.get('cb_output_cache', (result) => {
                    if (result?.cb_output_cache) doRestore(result.cb_output_cache);
                });
            }
        }

        // ─── 保存到备忘录 ───

        async _saveOutputToMemo(agentId) {
            const agent = this.agents.find(a => a.id === agentId);
            const convContent = await this._getConversationContent(agentId);
            const rawFallback = this._outputRaw?.[agentId]?.trim();
            const body = convContent || rawFallback;
            if (!body) {
                this._showToast('没有可保存的输出内容', 'warning');
                return;
            }
            const title = `[Agent] ${agent?.name || 'Unknown'} - ${new Date().toLocaleString('zh-CN')}`;
            const memo = {
                id: `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                title,
                text: body,
                completed: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                categoryId: 'default',
                tagIds: ['agent-output'],
                priority: 'none',
                dueDate: '',
            };
            try {
                const result = await new Promise(r => chrome.storage?.local?.get('memos', r));
                const memos = result?.memos || [];
                memos.unshift(memo);
                await new Promise(r => chrome.storage?.local?.set({ memos }, r));
                this._showToast(`已保存到备忘录: "${title.slice(0, 30)}…"`, 'success');
            } catch (err) {
                this._showToast(`保存失败: ${err.message}`, 'error');
            }
        }

        // ─── 保存到写作空间 ───

        async _getConversationContent(agentId) {
            const agent = this.agents.find(a => a.id === agentId);
            const convId = agent?.conversationId;
            if (!convId) return null;
            try {
                const msgData = await this._api(`/conversations/${convId}/messages`);
                const msgs = msgData?.messages || [];
                if (!msgs.length) return null;
                return msgs.map(m => {
                    const label = m.role === 'user' ? '**用户**' : '**Agent**';
                    return `### ${label}\n\n${m.content || ''}`;
                }).join('\n\n---\n\n');
            } catch {
                return null;
            }
        }

        async _saveOutputToBlog(agentId) {
            const agent = this.agents.find(a => a.id === agentId);
            const agentName = agent?.name || 'Agent';
            const model = agent?.model || 'unknown';
            const now = new Date();
            const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

            const convContent = await this._getConversationContent(agentId);
            const rawFallback = this._outputRaw?.[agentId]?.trim();
            const body = convContent || rawFallback;

            if (!body) {
                this._showToast('没有可保存的输出内容', 'warning');
                return;
            }

            const title = `${agentName} 结果 — ${dateStr} ${timeStr}`;
            const content = [
                `> **Agent**: ${agentName}  `,
                `> **模型**: ${model}  `,
                `> **时间**: ${dateStr} ${timeStr}  `,
                `> **项目**: ${agent?.cwd || '未知'}`,
                '',
                '---',
                '',
                body,
            ].join('\n');

            try {
                if (window.blogManager) {
                    window.blogManager.createPost({
                        title,
                        content,
                        category: 'agent',
                        tags: ['agent-result', model, agentName.toLowerCase().replace(/\s+/g, '-')],
                    });
                    this._showToast(`已保存到写作空间: "${title.slice(0, 30)}…"`, 'success');
                } else {
                    const result = await new Promise(r => chrome.storage?.local?.get('blogPosts', r));
                    const posts = result?.blogPosts || [];
                    posts.unshift({
                        id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                        title,
                        content,
                        category: 'agent',
                        tags: ['agent-result', model, agentName.toLowerCase().replace(/\s+/g, '-')],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        wordCount: content.length,
                        pinned: false,
                    });
                    await new Promise(r => chrome.storage?.local?.set({ blogPosts: posts }, r));
                    this._showToast(`已保存到写作空间: "${title.slice(0, 30)}…"`, 'success');
                }
            } catch (err) {
                this._showToast(`保存失败: ${err.message}`, 'error');
            }
        }

        async _copyOutput(agentId) {
            const raw = this._outputRaw?.[agentId];
            if (!raw?.trim()) { this._showToast('没有可复制的内容', 'warning'); return; }
            try {
                await navigator.clipboard.writeText(raw.trim());
                this._showToast('已复制到剪贴板', 'success');
            } catch { this._showToast('复制失败', 'error'); }
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

        _shortenPath(p, maxLen = 30) {
            if (!p) return '';
            if (p.length <= maxLen) return p;
            const parts = p.split('/');
            return parts.length <= 3 ? p : `.../${parts.slice(-2).join('/')}`;
        }

        _hex2rgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16) || 0;
            const g = parseInt(hex.slice(3, 5), 16) || 0;
            const b = parseInt(hex.slice(5, 7), 16) || 0;
            return `rgba(${r},${g},${b},${alpha})`;
        }

        _addTraceLog(entry) {
            this._traceLogs.unshift(entry);
            if (this._traceLogs.length > this._traceMaxLogs) this._traceLogs.length = this._traceMaxLogs;
            this._updateObservabilityPanel();
        }

        _updateObservabilityPanel() {
            const list = this._panelEl?.querySelector('.cb-obs-log-list');
            if (!list) return;
            const filterType = this._obsFilterType || 'all';
            const filterAgent = this._obsFilterAgent || 'all';
            const logs = this._traceLogs.filter(l => {
                if (filterType !== 'all' && l.type !== filterType) return false;
                if (filterAgent !== 'all' && l.agentId !== filterAgent) return false;
                return true;
            }).slice(0, 100);

            const typeIcons = { tool_call: 'fa-wrench', thinking: 'fa-brain', status: 'fa-flag', error: 'fa-exclamation-circle', task: 'fa-tasks' };
            const typeColors = { tool_call: '#a78bfa', thinking: '#60a5fa', status: '#34d399', error: '#f87171', task: '#fbbf24' };

            list.innerHTML = logs.length === 0
                ? '<div class="cb-obs-empty"><i class="fas fa-satellite-dish"></i><p>等待 Agent 活动...</p></div>'
                : logs.map(l => {
                    const time = new Date(l.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    const icon = typeIcons[l.type] || 'fa-info-circle';
                    const color = typeColors[l.type] || '#94a3b8';
                    let detail = '';
                    if (l.type === 'tool_call') detail = `${l.tool}${l.status ? ` [${l.status}]` : ''}`;
                    else if (l.type === 'status') detail = `${l.status}${l.durationMs ? ` · ${(l.durationMs / 1000).toFixed(1)}s` : ''}${l.inputTokens ? ` · ${l.inputTokens}→${l.outputTokens} tok` : ''}`;
                    else if (l.content) detail = l.content;
                    else detail = l.type;
                    const shortAgent = (l.agentId || '').split('_').pop()?.substring(0, 8) || '?';
                    return `<div class="cb-obs-log-item" style="border-left: 2px solid ${color}">
                        <span class="cb-obs-time">${time}</span>
                        <span class="cb-obs-agent-tag">${shortAgent}</span>
                        <i class="fas ${icon}" style="color:${color}; font-size:10px"></i>
                        <span class="cb-obs-detail">${detail}</span>
                    </div>`;
                }).join('');

            if (this._obsAutoScroll !== false) list.scrollTop = 0;
        }

        _toggleObservability() {
            const existing = this._panelEl?.querySelector('.cb-obs-panel');
            if (existing) { existing.remove(); return; }

            const agentOptions = this.agents.map(a => {
                const short = (a.id || '').split('_').pop()?.substring(0, 8) || a.id;
                return `<option value="${a.id}">${a.name || short}</option>`;
            }).join('');

            const obsPanel = document.createElement('div');
            obsPanel.className = 'cb-obs-panel';
            obsPanel.innerHTML = `
                <div class="cb-obs-header">
                    <h3><i class="fas fa-satellite-dish"></i> 可观测性面板</h3>
                    <div class="cb-obs-controls">
                        <select class="cb-obs-filter-type">
                            <option value="all">全部类型</option>
                            <option value="tool_call">工具调用</option>
                            <option value="thinking">思考</option>
                            <option value="status">状态</option>
                            <option value="error">错误</option>
                        </select>
                        <select class="cb-obs-filter-agent">
                            <option value="all">全部 Agent</option>
                            ${agentOptions}
                        </select>
                        <button class="cb-btn cb-btn-icon cb-obs-clear" title="清空日志"><i class="fas fa-trash-alt"></i></button>
                        <button class="cb-btn cb-btn-icon cb-obs-close" title="关闭"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div class="cb-obs-log-list"></div>
            `;
            obsPanel.querySelector('.cb-obs-close').addEventListener('click', () => obsPanel.remove());
            obsPanel.querySelector('.cb-obs-clear').addEventListener('click', () => { this._traceLogs = []; this._updateObservabilityPanel(); });
            obsPanel.querySelector('.cb-obs-filter-type').addEventListener('change', e => { this._obsFilterType = e.target.value; this._updateObservabilityPanel(); });
            obsPanel.querySelector('.cb-obs-filter-agent').addEventListener('change', e => { this._obsFilterAgent = e.target.value; this._updateObservabilityPanel(); });

            const tokenPanel = this._panelEl?.querySelector('.cb-token-panel');
            if (tokenPanel) tokenPanel.after(obsPanel);
            else this._panelEl?.querySelector('.cb-stats-bar')?.after(obsPanel);

            this._updateObservabilityPanel();
        }

        async _emergencyStop() {
            const running = this.agents.filter(a => a.status === 'running' || a.status === 'streaming');
            if (running.length === 0) {
                this._showToast('当前没有运行中的 Agent', 'info');
                return;
            }
            const btn = this._panelEl?.querySelector('#cb-emergency-stop');
            if (btn) btn.classList.add('active');
            try {
                const res = await fetch(`${this.baseUrl}/agents/emergency-stop`, { method: 'POST' });
                if (res.ok) {
                    this._showToast(`已紧急中断 ${running.length} 个 Agent`, 'warning');
                    setTimeout(() => this.refreshAgents(), 500);
                } else {
                    this._showToast('紧急中断失败', 'error');
                }
            } catch (e) {
                this._showToast('紧急中断请求失败: ' + e.message, 'error');
            } finally {
                setTimeout(() => btn?.classList.remove('active'), 1500);
            }
        }

        async _showTokenUsagePanel() {
            try {
                const [summaryRes, recentRes] = await Promise.all([
                    fetch(`${this.baseUrl}/stats/tokens`),
                    fetch(`${this.baseUrl}/stats/tokens/recent?limit=20`)
                ]);
                const summary = await summaryRes.json();
                const recent = await recentRes.json();

                const existing = this._panelEl?.querySelector('.cb-token-panel');
                if (existing) { existing.remove(); return; }

                const fmtNum = n => {
                    if (!n) return '0';
                    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
                    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
                    return String(n);
                };

                const totalIn = summary.summary?.totalInput || 0;
                const totalOut = summary.summary?.totalOutput || 0;
                const totalAll = summary.summary?.totalTokens || 0;
                const totalRuns = summary.summary?.totalRuns || 0;
                const models = summary.byModel || [];

                let modelRows = models.map(m => `
                    <tr>
                        <td><span class="cb-token-model-tag">${m.model}</span></td>
                        <td class="cb-token-num">${fmtNum(m.input_tokens)}</td>
                        <td class="cb-token-num">${fmtNum(m.output_tokens)}</td>
                        <td class="cb-token-num"><strong>${fmtNum(m.total_tokens)}</strong></td>
                        <td class="cb-token-num">${m.runs}</td>
                    </tr>
                `).join('');

                let recentRows = (recent.records || []).map(r => {
                    const time = new Date(r.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                    return `
                    <tr>
                        <td>${time}</td>
                        <td><span class="cb-token-model-tag">${r.model}</span></td>
                        <td class="cb-token-num">${fmtNum(r.input_tokens)}</td>
                        <td class="cb-token-num">${fmtNum(r.output_tokens)}</td>
                    </tr>`;
                }).join('');

                const panel = document.createElement('div');
                panel.className = 'cb-token-panel';
                panel.innerHTML = `
                    <div class="cb-token-header">
                        <h3><i class="fas fa-chart-bar"></i> Token 用量统计</h3>
                        <button class="cb-btn cb-btn-icon cb-token-close"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="cb-token-summary">
                        <div class="cb-token-card">
                            <div class="cb-token-card-value">${fmtNum(totalAll)}</div>
                            <div class="cb-token-card-label">总 Tokens</div>
                        </div>
                        <div class="cb-token-card cb-token-card-in">
                            <div class="cb-token-card-value">${fmtNum(totalIn)}</div>
                            <div class="cb-token-card-label">输入</div>
                        </div>
                        <div class="cb-token-card cb-token-card-out">
                            <div class="cb-token-card-value">${fmtNum(totalOut)}</div>
                            <div class="cb-token-card-label">输出</div>
                        </div>
                        <div class="cb-token-card">
                            <div class="cb-token-card-value">${totalRuns}</div>
                            <div class="cb-token-card-label">运行次数</div>
                        </div>
                    </div>
                    ${models.length ? `
                    <div class="cb-token-section">
                        <h4>模型分布</h4>
                        <table class="cb-token-table">
                            <thead><tr><th>模型</th><th>输入</th><th>输出</th><th>总计</th><th>次数</th></tr></thead>
                            <tbody>${modelRows}</tbody>
                        </table>
                    </div>` : ''}
                    ${recentRows ? `
                    <div class="cb-token-section">
                        <h4>最近记录</h4>
                        <table class="cb-token-table">
                            <thead><tr><th>时间</th><th>模型</th><th>输入</th><th>输出</th></tr></thead>
                            <tbody>${recentRows}</tbody>
                        </table>
                    </div>` : ''}
                `;
                panel.querySelector('.cb-token-close').addEventListener('click', () => panel.remove());
                this._panelEl?.querySelector('.cb-stats-bar')?.after(panel);
            } catch (e) {
                this._showToast('加载 Token 数据失败: ' + e.message, 'error');
            }
        }

        async _checkApprovals() {
            try {
                const res = await fetch(`${this.baseUrl}/approvals`);
                if (!res.ok) return;
                const data = await res.json();
                const pending = data.approvals || [];
                if (pending.length === 0) return;

                for (const approval of pending) {
                    if (this._shownApprovals?.has(approval.id)) continue;
                    if (!this._shownApprovals) this._shownApprovals = new Set();
                    this._shownApprovals.add(approval.id);
                    this._showApprovalModal(approval);
                }
            } catch {}
        }

        _showApprovalModal(approval) {
            const overlay = document.createElement('div');
            overlay.className = 'cb-approval-overlay';
            overlay.dataset.approvalId = approval.id;
            const typeLabels = { tool_call: '工具调用', milestone: '里程碑', dangerous_action: '危险操作' };
            overlay.innerHTML = `
                <div class="cb-approval-modal">
                    <div class="cb-approval-header">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>需要审批: ${typeLabels[approval.type] || approval.type}</span>
                    </div>
                    <div class="cb-approval-body">
                        <p>${approval.description}</p>
                        <div class="cb-approval-meta">
                            <span><i class="fas fa-robot"></i> Agent: ${approval.agentId}</span>
                            <span><i class="fas fa-clock"></i> ${new Date(approval.createdAt).toLocaleTimeString('zh-CN')}</span>
                        </div>
                    </div>
                    <div class="cb-approval-actions">
                        <button class="cb-btn cb-btn-reject"><i class="fas fa-times"></i> 拒绝</button>
                        <button class="cb-btn cb-btn-approve"><i class="fas fa-check"></i> 批准</button>
                    </div>
                </div>
            `;

            const resolve = async (approved) => {
                try {
                    await fetch(`${this.baseUrl}/agents/${approval.agentId}/approvals/${approval.id}/resolve`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ approved })
                    });
                    this._showToast(approved ? '已批准' : '已拒绝', approved ? 'success' : 'warning');
                } catch (e) {
                    this._showToast('审批操作失败', 'error');
                }
                overlay.remove();
            };

            overlay.querySelector('.cb-btn-approve').addEventListener('click', () => resolve(true));
            overlay.querySelector('.cb-btn-reject').addEventListener('click', () => resolve(false));
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('show'));
        }

        // ═══════════ 多角色协作 ═══════════

        _collabState = { taskId: null, discussionId: null, step: 'input' };
        _collabRoleMap = {};
        _collabAvailableModels = [];
        _collabRolesPromise = null;

        _loadCollabRoles() {
            if (this._collabRolesPromise) return this._collabRolesPromise;
            this._collabRolesPromise = (async () => {
                try {
                    const [rolesData, modelsData] = await Promise.all([
                        this._api('/roles'),
                        this._api('/models/available'),
                    ]);
                    if (rolesData?.roles) {
                        for (const r of rolesData.roles) {
                            this._collabRoleMap[r.id] = r;
                        }
                    }
                    if (modelsData?.models) {
                        this._collabAvailableModels = modelsData.models;
                    }
                } catch {
                    this._collabRolesPromise = null;
                }
            })();
            return this._collabRolesPromise;
        }

        _getRoleInfo(roleId) {
            if (roleId === '_user') return { id: '_user', name: '你', icon: '👤', nameEn: 'User', color: '#22c55e', modelTier: 'balanced', resolvedModel: '', modelOverride: null };
            if (roleId === '_system') return { id: '_system', name: '系统', icon: '⚙️', nameEn: 'System', color: '#6b7280', modelTier: 'balanced', resolvedModel: '', modelOverride: null };
            const role = this._collabRoleMap[roleId];
            return {
                id: roleId,
                name: role?.name || roleId,
                icon: role?.icon || '👤',
                nameEn: role?.nameEn || roleId,
                modelTier: role?.modelTier || 'balanced',
                resolvedModel: role?.resolvedModel || '',
                modelOverride: role?.modelOverride || null,
            };
        }

        _showCollabModal() {
            if (!this.connected) { this._showToast('cursor-bridge 服务未连接', 'error'); return; }
            const modal = this._panelEl?.querySelector('#cb-collab-modal');
            if (!modal) return;
            modal.classList.add('open');
            this._collabGoToStep('input');
            this._collabState = { taskId: null, discussionId: null, step: 'input' };
            this._loadCollabRoles().then(() => this._populateCollabModelPicker());
            this._bindCollabEvents();
        }

        _populateCollabModelPicker() {
            const sel = this._panelEl?.querySelector('#cb-collab-global-model');
            if (!sel) return;
            const existing = sel.querySelectorAll('option:not(:first-child)');
            existing.forEach(o => o.remove());

            const allModels = this.models?.length ? this.models : [];
            const collabModels = this._collabAvailableModels || [];
            const combined = collabModels.length ? collabModels : allModels;

            for (const m of combined) {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.label || m.name || m.id;
                sel.appendChild(opt);
            }
        }

        _hideCollabModal() {
            this._panelEl?.querySelector('#cb-collab-modal')?.classList.remove('open');
        }

        _bindCollabEvents() {
            const modal = this._panelEl?.querySelector('#cb-collab-modal');
            if (!modal || modal._collabBound) return;
            modal._collabBound = true;

            modal.addEventListener('click', e => { if (e.target.classList.contains('cb-collab-modal')) this._hideCollabModal(); });
            modal.querySelector('#cb-collab-close')?.addEventListener('click', () => this._hideCollabModal());
            modal.querySelector('#cb-collab-analyze')?.addEventListener('click', () => this._collabAnalyze());
            modal.querySelector('#cb-collab-approve')?.addEventListener('click', () => this._collabApprove());
            modal.querySelector('#cb-collab-back-input')?.addEventListener('click', () => this._collabGoToStep('input'));
            modal.querySelector('#cb-collab-next-round')?.addEventListener('click', () => this._collabNextRound());
            modal.querySelector('#cb-collab-conclude')?.addEventListener('click', () => this._collabConclude());
            modal.querySelector('#cb-collab-new-task')?.addEventListener('click', () => {
                this._panelEl.querySelector('#cb-collab-requirement').value = '';
                this._collabState = { taskId: null, discussionId: null, step: 'input' };
                this._collabGoToStep('input');
            });

            modal.querySelector('#cb-collab-back-discussion')?.addEventListener('click', () => this._collabBackToDiscussion());

            modal.querySelectorAll('.cb-collab-prog-dot').forEach(dot => {
                dot.addEventListener('click', () => {
                    const targetStep = dot.dataset.step;
                    const steps = ['input', 'analysis', 'discussion', 'report'];
                    const targetIdx = steps.indexOf(targetStep);
                    const maxReached = this._collabState._maxStepReached || 0;
                    if (targetIdx <= maxReached) {
                        this._collabGoToStep(targetStep, true);
                    }
                });
            });

            modal.querySelectorAll('.cb-disc-view-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    modal.querySelectorAll('.cb-disc-view-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this._discActiveView = btn.dataset.view;
                    const disc = modal.querySelector('#cb-collab-discussion');
                    const summ = modal.querySelector('#cb-disc-summary');
                    if (btn.dataset.view === 'summary') {
                        if (disc) disc.style.display = 'none';
                        if (summ) { summ.style.display = ''; this._renderDiscSummary(); }
                    } else {
                        if (disc) disc.style.display = '';
                        if (summ) summ.style.display = 'none';
                    }
                });
            });
        }

        _renderDiscSummary() {
            const container = this._panelEl?.querySelector('#cb-disc-summary');
            if (!container) return;
            const msgs = this._collabMessages.filter(m => !m._typing && !m._separator && !m.roleId?.startsWith('_') && m.content);
            if (!msgs.length) { container.innerHTML = '<p style="color:rgba(255,255,255,.35);font-size:12px">暂无讨论内容</p>'; return; }
            const byRole = {};
            msgs.forEach(m => {
                if (!byRole[m.roleId]) byRole[m.roleId] = [];
                byRole[m.roleId].push(m);
            });
            let html = '<h4>讨论总结</h4>';
            for (const [rid, rmsgs] of Object.entries(byRole)) {
                const info = this._getRoleInfo(rid);
                const color = info.color || '#6366f1';
                html += `<div class="cb-disc-summary-section">
                    <h5 style="color:${color}"><i class="fas fa-user" style="font-size:10px"></i> ${info.name}（${rmsgs.length} 条发言）</h5>
                    <ul>${rmsgs.map(m => `<li><strong>第${m.round}轮：</strong>${m.content.slice(0, 120)}${m.content.length > 120 ? '…' : ''}</li>`).join('')}</ul>
                </div>`;
            }
            html += `<div class="cb-disc-summary-actions">
                <button class="cb-btn cb-btn-secondary" id="cb-disc-copy-all"><i class="fas fa-copy"></i> 复制全文</button>
            </div>`;
            container.innerHTML = html;
            container.querySelector('#cb-disc-copy-all')?.addEventListener('click', () => {
                const text = msgs.map(m => `${this._getRoleInfo(m.roleId).name}(第${m.round}轮):\n${m.content}`).join('\n\n');
                navigator.clipboard.writeText(text).then(() => this._showToast('已复制到剪贴板', 'success'));
            });
        }

        _collabGoToStep(step, isBrowsing) {
            this._collabState.step = step;
            const steps = ['input', 'analysis', 'discussion', 'report'];
            const curIdx = steps.indexOf(step);

            if (!isBrowsing) {
                const prev = this._collabState._maxStepReached || 0;
                if (curIdx > prev) this._collabState._maxStepReached = curIdx;
            }
            const maxReached = this._collabState._maxStepReached || 0;

            const modal = this._panelEl?.querySelector('#cb-collab-modal');
            if (!modal) return;
            modal.querySelectorAll('.cb-collab-step').forEach(el => el.classList.remove('active'));
            modal.querySelector(`#cb-collab-step-${step}`)?.classList.add('active');
            modal.querySelectorAll('.cb-collab-prog-dot').forEach(dot => {
                const idx = steps.indexOf(dot.dataset.step);
                dot.classList.toggle('active', idx <= maxReached);
                dot.classList.toggle('current', idx === curIdx);
                dot.classList.toggle('clickable', idx <= maxReached);
            });
            modal.querySelectorAll('.cb-collab-prog-line').forEach((line, i) => {
                line.classList.toggle('active', i < maxReached);
            });
        }

        async _collabAnalyze() {
            const requirement = this._panelEl?.querySelector('#cb-collab-requirement')?.value?.trim();
            if (!requirement) { this._showToast('请输入需求描述', 'warning'); return; }

            const globalModel = this._panelEl?.querySelector('#cb-collab-global-model')?.value || '';
            this._collabState.globalModel = globalModel || null;

            const btn = this._panelEl?.querySelector('#cb-collab-analyze');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 分析中…';

            try {
                const analyzeBody = { requirement };
                if (globalModel) {
                    const overrides = {};
                    for (const r of Object.values(this._collabRoleMap)) {
                        overrides[r.id] = globalModel;
                    }
                    analyzeBody.modelOverrides = overrides;
                }
                const [data] = await Promise.all([
                    this._api('/tasks/analyze', {
                        method: 'POST',
                        body: JSON.stringify(analyzeBody),
                    }),
                    this._loadCollabRoles(),
                ]);
                if (data.error) throw new Error(data.error);
                this._collabState.taskId = data.id;
                this._renderCollabAnalysis(data);
                this._collabGoToStep('analysis');
            } catch (err) {
                this._showToast(`分析失败: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-brain"></i> 智能分析';
            }
        }

        _renderCollabAnalysis(data) {
            const container = this._panelEl?.querySelector('#cb-collab-analysis');
            if (!container) return;
            const summary = data.summary || {};
            const roles = data.recommendedRoles || [];
            const plan = data.executionPlan || {};
            const phases = plan.phases || [];

            const enrichedRoles = roles.map(r => {
                const info = this._getRoleInfo(r.roleId || r.id);
                return { ...r, ...info, reason: r.reason, priority: r.priority, phase: r.phase };
            });

            const modelOptions = this._collabAvailableModels.map(m =>
                `<option value="${m.id}">${m.label}</option>`
            ).join('');

            container.innerHTML = `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-clipboard-check"></i> 需求摘要</div>
                    <div class="cb-collab-summary-grid">
                        <div class="cb-collab-kv"><span>类型</span><strong>${summary.type || '-'}</strong></div>
                        <div class="cb-collab-kv"><span>规模</span><strong>${summary.scope || summary.scale || '-'}</strong></div>
                        <div class="cb-collab-kv"><span>复杂度</span><strong>${summary.estimatedComplexity || summary.complexity || '-'}</strong></div>
                        <div class="cb-collab-kv"><span>技术栈</span><strong>${(() => { const ts = summary.techStack || summary.tech_stack || summary.technologies || []; return (Array.isArray(ts) ? ts.join(', ') : String(ts)) || '-'; })()}</strong></div>
                    </div>
                </div>
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-user-group"></i> 推荐角色 (${enrichedRoles.length}人)</div>
                    <div class="cb-collab-roles">${enrichedRoles.map(r => `
                        <span class="cb-collab-role-chip" title="${r.reason || ''}">
                            <span class="cb-collab-role-icon">${r.icon}</span>
                            ${r.name}
                        </span>
                    `).join('')}</div>
                </div>
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-microchip"></i> 模型配置</div>
                    <div class="cb-collab-model-config">${enrichedRoles.map(r => `
                        <div class="cb-collab-model-row" data-role-id="${r.id}">
                            <span class="cb-collab-model-label">${r.icon} ${r.name}</span>
                            <select class="cb-collab-model-select" data-role-id="${r.id}">
                                <option value="">自动 (${r.modelTier})</option>
                                ${modelOptions}
                            </select>
                        </div>
                    `).join('')}</div>
                </div>
                ${phases.length ? `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-list-ol"></i> 执行计划</div>
                    <div class="cb-collab-phases">${phases.map((p, i) => `
                        <div class="cb-collab-phase">
                            <span class="cb-collab-phase-num">${i + 1}</span>
                            <div>
                                <strong>${p.name || p.phase || ''}</strong>
                                <p>${p.description || ''}</p>
                            </div>
                        </div>
                    `).join('')}</div>
                </div>
                ` : ''}
            `;

            enrichedRoles.forEach(r => {
                const sel = container.querySelector(`.cb-collab-model-select[data-role-id="${r.id}"]`);
                if (sel) {
                    const currentModel = r.modelOverride || r.resolvedModel;
                    if (currentModel) sel.value = currentModel;
                    sel.addEventListener('change', () => this._onCollabModelChange(r.id, sel.value));
                }
            });
        }

        async _onCollabModelChange(roleId, model) {
            try {
                await this._api('/models/config', {
                    method: 'PUT',
                    body: JSON.stringify({
                        roleOverrides: { [roleId]: model || null },
                    }),
                });
                if (this._collabRoleMap[roleId]) {
                    this._collabRoleMap[roleId].modelOverride = model || null;
                    this._collabRoleMap[roleId].resolvedModel = model || this._collabRoleMap[roleId].resolvedModel;
                }
            } catch (err) {
                this._showToast(`模型设置失败: ${err.message}`, 'error');
            }
        }

        async _collabApprove() {
            const taskId = this._collabState.taskId;
            if (!taskId) { this._showToast('无任务可批准', 'error'); return; }

            const btn = this._panelEl?.querySelector('#cb-collab-approve');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 审批中…';

            try {
                await this._api(`/tasks/${taskId}/approve`, { method: 'PATCH', body: '{}' });
                const taskData = await this._api(`/tasks/${taskId}`);
                this._collabState._cachedTaskData = taskData;
                const roles = (taskData?.recommendedRoles || []).map(r => r.roleId || r.id).filter(Boolean);
                const disc = await this._api(`/tasks/${taskId}/discussions`, {
                    method: 'POST',
                    body: JSON.stringify({
                        topic: taskData?.originalRequirement?.slice(0, 100) || '协作讨论',
                        phase: 'discussion',
                        roleIds: roles.length ? roles : ['product', 'architect', 'tech-lead'],
                        maxRounds: 3,
                    }),
                });
                if (disc.error) throw new Error(disc.error);
                this._collabState.discussionId = disc.id;
                this._collabState.topic = taskData?.originalRequirement?.slice(0, 100) || '协作讨论';

                this._collabMessages = [];
                this._renderCollabDiscussion([]);
                this._showToast('已批准，开始团队讨论', 'success');
                this._collabGoToStep('discussion');

                await this._collabNextRound();
            } catch (err) {
                this._showToast(`审批失败: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> 批准执行';
            }
        }

        _collabMessages = [];

        _discActiveFilter = 'all';
        _discActiveView = 'timeline';

        _renderCollabDiscussion(messages) {
            const container = this._panelEl?.querySelector('#cb-collab-discussion');
            if (!container) return;
            if (!messages.length) {
                container.innerHTML = '<div class="cb-collab-disc-empty"><i class="fas fa-comments"></i><p>讨论即将开始…</p></div>';
                return;
            }
            this._updateDiscFilters(messages);
            const filter = this._discActiveFilter;
            let lastRound = 0;
            const frags = [];
            messages.forEach((m, idx) => {
                if (m._separator) {
                    frags.push(`<div class="cb-disc-realign-div"><i class="fas fa-rotate-left"></i> ${m.content.replace(/\n/g, '<br>')}</div>`);
                    return;
                }
                if (m.round && m.round !== lastRound) {
                    frags.push(`<div class="cb-disc-round-div">第 ${m.round} 轮讨论</div>`);
                    lastRound = m.round;
                }
                const info = this._getRoleInfo(m.roleId);
                const color = info.color || '#6366f1';
                const isTyping = m._typing;
                const isStreaming = m._streaming && !m._typing;
                const streamAttr = (isStreaming || isTyping) ? ` data-stream-role="${m.roleId}-${m.round}"` : '';
                const hidden = (filter !== 'all' && m.roleId !== filter) ? ' cb-disc-hidden' : '';
                let contentHtml;
                if (isTyping) {
                    contentHtml = '<span class="cb-typing-dots"><span></span><span></span><span></span></span>';
                } else if (isStreaming && m.content) {
                    contentHtml = this._formatDiscussionContent(m.content) + '<span class="cb-stream-cursor"></span>';
                } else {
                    contentHtml = this._formatDiscussionContent(m.content || '');
                }
                const avatar = (info.icon || '🤖').replace(/<[^>]+>/g, '').trim().slice(0, 2);
                const elapsedStr = m.elapsed ? ` · ${(m.elapsed / 1000).toFixed(1)}s` : '';
                const dotActive = isTyping || isStreaming ? ' active' : '';
                frags.push(`
                <div class="cb-collab-msg${isTyping ? ' cb-collab-msg-typing' : ''}${isStreaming ? ' cb-collab-msg-streaming' : ''}${hidden}" data-role="${m.roleId}"${streamAttr} data-msg-idx="${idx}">
                    <div class="cb-disc-dot${dotActive}" style="background:${color}"></div>
                    <div class="cb-collab-msg-header">
                        <div class="cb-collab-msg-avatar" style="background:${color}">${avatar}</div>
                        <span class="cb-collab-msg-role">${info.name}</span>
                        <span class="cb-disc-tag" style="background:${color}22;color:${color}">${info.nameEn || m.roleId}</span>
                        <span class="cb-collab-msg-meta">${m.round ? `第${m.round}轮` : ''}${elapsedStr}</span>
                    </div>
                    <div class="cb-collab-msg-body">
                        <button class="cb-disc-edit-btn" data-idx="${idx}"><i class="fas fa-pen"></i></button>
                        <div class="cb-collab-msg-content">${contentHtml}</div>
                        <div class="cb-disc-edit-actions" data-idx="${idx}">
                            <button class="cb-disc-save-btn" data-idx="${idx}"><i class="fas fa-check"></i> 保存</button>
                            <button class="cb-disc-cancel-btn" data-idx="${idx}">取消</button>
                        </div>
                    </div>
                </div>`);
            });
            container.innerHTML = frags.join('');
            this._bindDiscEditEvents(container);
            container.scrollTop = container.scrollHeight;
        }

        _updateDiscFilters(messages) {
            const bar = this._panelEl?.querySelector('#cb-disc-filters');
            if (!bar) return;
            const roles = [...new Set(messages.filter(m => !m._separator && !m.roleId?.startsWith('_')).map(m => m.roleId))];
            const filter = this._discActiveFilter;
            let html = `<button class="cb-disc-filter-btn${filter === 'all' ? ' active' : ''}" data-filter="all">全部</button>`;
            roles.forEach(rid => {
                const info = this._getRoleInfo(rid);
                const c = info.color || '#6366f1';
                const av = (info.icon || '🤖').replace(/<[^>]+>/g, '').trim().slice(0, 1);
                html += `<button class="cb-disc-filter-btn${filter === rid ? ' active' : ''}" data-filter="${rid}">
                    <span class="cb-filter-av" style="background:${c}">${av}</span>${info.name}</button>`;
            });
            bar.innerHTML = html;
            bar.querySelectorAll('.cb-disc-filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this._discActiveFilter = btn.dataset.filter;
                    this._renderCollabDiscussion(this._collabMessages);
                });
            });
        }

        _bindDiscEditEvents(container) {
            container.querySelectorAll('.cb-disc-edit-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = +btn.dataset.idx;
                    const msgEl = container.querySelector(`[data-msg-idx="${idx}"]`);
                    if (!msgEl) return;
                    const contentEl = msgEl.querySelector('.cb-collab-msg-content');
                    const actionsEl = msgEl.querySelector('.cb-disc-edit-actions');
                    contentEl.contentEditable = true;
                    contentEl.focus();
                    actionsEl.classList.add('show');
                    btn.style.display = 'none';
                });
            });
            container.querySelectorAll('.cb-disc-save-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = +btn.dataset.idx;
                    const msgEl = container.querySelector(`[data-msg-idx="${idx}"]`);
                    if (!msgEl) return;
                    const contentEl = msgEl.querySelector('.cb-collab-msg-content');
                    this._collabMessages[idx].content = contentEl.innerText;
                    this._collabMessages[idx]._edited = true;
                    contentEl.contentEditable = false;
                    msgEl.querySelector('.cb-disc-edit-actions').classList.remove('show');
                    msgEl.querySelector('.cb-disc-edit-btn').style.display = '';
                });
            });
            container.querySelectorAll('.cb-disc-cancel-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = +btn.dataset.idx;
                    const msgEl = container.querySelector(`[data-msg-idx="${idx}"]`);
                    if (!msgEl) return;
                    const contentEl = msgEl.querySelector('.cb-collab-msg-content');
                    contentEl.innerHTML = this._formatDiscussionContent(this._collabMessages[idx].content || '');
                    contentEl.contentEditable = false;
                    msgEl.querySelector('.cb-disc-edit-actions').classList.remove('show');
                    msgEl.querySelector('.cb-disc-edit-btn').style.display = '';
                });
            });
        }

        _formatDiscussionContent(raw) {
            let html = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="cb-disc-code"><code>$2</code></pre>');
            html = html.replace(/`([^`]+)`/g, '<code class="cb-disc-inline-code">$1</code>');
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/^### (.+)$/gm, '<div class="cb-disc-h3">$1</div>');
            html = html.replace(/^## (.+)$/gm, '<div class="cb-disc-h2">$1</div>');
            html = html.replace(/^[-*] (.+)$/gm, '<div class="cb-disc-li">$1</div>');
            html = html.replace(/^\d+\. (.+)$/gm, '<div class="cb-disc-li cb-disc-ol">$1</div>');
            html = html.replace(/\n/g, '<br>');
            return html;
        }

        _appendTypingIndicator(roleId, roleName, round) {
            const idx = this._collabMessages.length;
            this._collabMessages.push({ roleId, round, content: '', _typing: true, _streaming: true });
            const container = this._panelEl?.querySelector('#cb-collab-discussion');
            if (!container) return;
            const emptyEl = container.querySelector('.cb-collab-disc-empty');
            if (emptyEl) emptyEl.remove();
            const info = this._getRoleInfo(roleId);
            const color = info.color || '#6366f1';
            const avatar = (info.icon || '🤖').replace(/<[^>]+>/g, '').trim().slice(0, 2);
            const roundLabel = round ? `第${round}轮` : '';
            const lastMsg = this._collabMessages[idx - 1];
            let prefix = '';
            if (!lastMsg || lastMsg.round !== round) {
                prefix = `<div class="cb-disc-round-div">第 ${round} 轮讨论</div>`;
            }
            const hidden = (this._discActiveFilter !== 'all' && roleId !== this._discActiveFilter) ? ' cb-disc-hidden' : '';
            const msgHtml = `${prefix}
                <div class="cb-collab-msg cb-collab-msg-typing cb-collab-msg-streaming${hidden}" data-role="${roleId}" data-stream-role="${roleId}-${round}" data-msg-idx="${idx}">
                    <div class="cb-disc-dot active" style="background:${color}"></div>
                    <div class="cb-collab-msg-header">
                        <div class="cb-collab-msg-avatar" style="background:${color}">${avatar}</div>
                        <span class="cb-collab-msg-role">${info.name}</span>
                        <span class="cb-disc-tag" style="background:${color}22;color:${color}">${info.nameEn || roleId}</span>
                        <span class="cb-collab-msg-meta">${roundLabel}</span>
                    </div>
                    <div class="cb-collab-msg-body">
                        <div class="cb-collab-msg-content"><span class="cb-typing-dots"><span></span><span></span><span></span></span></div>
                    </div>
                </div>`;
            container.insertAdjacentHTML('beforeend', msgHtml);
            this._updateDiscFilters(this._collabMessages);
            container.scrollTop = container.scrollHeight;
        }

        _appendStreamToken(roleId, round, token) {
            const idx = this._collabMessages.findIndex(m => m.roleId === roleId && m.round === round && m._streaming);
            if (idx < 0) return;
            this._collabMessages[idx].content += token;
            this._collabMessages[idx]._typing = false;

            const wrapper = this._panelEl?.querySelector(`[data-stream-role="${roleId}-${round}"]`);
            if (wrapper) {
                wrapper.classList.remove('cb-collab-msg-typing');
                const msgEl = wrapper.querySelector('.cb-collab-msg-content');
                if (msgEl) {
                    msgEl.innerHTML = this._formatDiscussionContent(this._collabMessages[idx].content) + '<span class="cb-stream-cursor"></span>';
                }
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }

        _replaceTypingWithContent(roleId, round, content, elapsed) {
            const idx = this._collabMessages.findIndex(m => m.roleId === roleId && m.round === round && (m._typing || m._streaming));
            if (idx >= 0) {
                this._collabMessages[idx] = { roleId, round, content, elapsed, _typing: false, _streaming: false };
            } else {
                this._collabMessages.push({ roleId, round, content, elapsed, _typing: false, _streaming: false });
            }
            const wrapper = this._panelEl?.querySelector(`[data-stream-role="${roleId}-${round}"]`);
            if (wrapper) {
                wrapper.classList.remove('cb-collab-msg-typing', 'cb-collab-msg-streaming');
                wrapper.removeAttribute('data-stream-role');
                const dot = wrapper.querySelector('.cb-disc-dot');
                if (dot) dot.classList.remove('active');
                const meta = wrapper.querySelector('.cb-collab-msg-meta');
                const roundLabel = round ? `第${round}轮` : '';
                if (meta) meta.textContent = `${roundLabel}${elapsed ? ` · ${(elapsed / 1000).toFixed(1)}s` : ''}`;
                const msgEl = wrapper.querySelector('.cb-collab-msg-content');
                if (msgEl) msgEl.innerHTML = this._formatDiscussionContent(content || '');
            } else {
                this._renderCollabDiscussion(this._collabMessages);
            }
        }

        async _collabNextRound() {
            const discId = this._collabState.discussionId;
            if (!discId) { this._showToast('无讨论 ID', 'error'); return; }

            let realignNote = '';
            if (this._collabState._isRealigning) {
                const ta = this._panelEl?.querySelector('#cb-realign-input');
                realignNote = ta?.value?.trim() || '';
                if (realignNote) {
                    const userMsg = {
                        id: `user-${Date.now()}`,
                        roleId: '_user',
                        content: `**对齐调整**: ${realignNote}`,
                        round: 0,
                    };
                    this._collabMessages.push(userMsg);
                    this._renderCollabDiscussion(this._collabMessages);
                }
                const wrapEl = this._panelEl?.querySelector('#cb-realign-input-wrap');
                if (wrapEl) wrapEl.style.display = 'none';
                this._collabState._isRealigning = false;
            }

            const btn = this._panelEl?.querySelector('#cb-collab-next-round');
            const concludeBtn = this._panelEl?.querySelector('#cb-collab-conclude');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 讨论中…'; }
            if (concludeBtn) concludeBtn.disabled = true;

            try {
                const bodyPayload = realignNote ? { context: realignNote } : {};
                const res = await fetch(`${BRIDGE_URL}/discussions/${discId}/round/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(bodyPayload),
                });

                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP ${res.status}`);
                }

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let currentEvent = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('event: ')) {
                            currentEvent = line.slice(7).trim();
                            continue;
                        }
                        if (!line.startsWith('data: ')) continue;

                        try {
                            const data = JSON.parse(line.slice(6));

                            if (currentEvent === 'error') {
                                this._showToast(`讨论错误: ${data.message}`, 'error');
                                break;
                            }

                            if (currentEvent === 'role_start') {
                                this._appendTypingIndicator(data.roleId, data.roleName, data.roundNumber);
                            }

                            if (currentEvent === 'role_token') {
                                this._appendStreamToken(data.roleId, data.roundNumber, data.content);
                            }

                            if (currentEvent === 'role_done') {
                                this._replaceTypingWithContent(data.roleId, data.roundNumber, data.content, data.elapsed);
                            }

                            if (currentEvent === 'round_done') {
                                if (data.concluded) {
                                    if (btn) btn.style.display = 'none';
                                    this._showToast('讨论轮次已完成，可点击"总结决策"', 'info');
                                }
                            }
                        } catch { /* skip malformed SSE */ }
                        currentEvent = '';
                    }
                }
            } catch (err) {
                this._showToast(`讨论轮次失败: ${err.message}`, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-forward"></i> 下一轮讨论'; }
                if (concludeBtn) concludeBtn.disabled = false;
            }
        }

        async _collabConclude() {
            const discId = this._collabState.discussionId;
            if (!discId) return;

            const btn = this._panelEl?.querySelector('#cb-collab-conclude');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 总结中…';

            try {
                const conclusion = await this._api(`/discussions/${discId}/conclude`, { method: 'POST' });
                if (conclusion.error) throw new Error(conclusion.error);

                let report = null;
                try {
                    report = await this._api(`/tasks/${this._collabState.taskId}/report/generate`, { method: 'POST' });
                } catch {}

                this._renderCollabReport(conclusion, report);
                this._collabGoToStep('report');
            } catch (err) {
                this._showToast(`总结失败: ${err.message}`, 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-gavel"></i> 总结决策';
            }
        }

        _renderCollabReport(conclusion, report) {
            const container = this._panelEl?.querySelector('#cb-collab-report');
            if (!container) return;
            const summary = conclusion?.summary || conclusion?.content || '讨论已完成';
            const actionItems = conclusion?.actionItems || [];
            const decisions = conclusion?.decisions || [];
            this._collabState.actionItems = actionItems;
            this._collabState.conclusion = conclusion;

            container.innerHTML = `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-file-lines"></i> 讨论总结</div>
                    <div class="cb-collab-report-text">${String(summary).replace(/\n/g, '<br>')}</div>
                </div>
                ${decisions.length ? `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-gavel"></i> 关键决策</div>
                    <ul class="cb-collab-decision-list">${decisions.map(d => `
                        <li>
                            <strong>${d.topic || d.title || ''}</strong>:
                            ${d.decision || d.resolution || d.content || ''}
                            ${d.reason ? `<span class="cb-collab-decision-reason">（${d.reason}）</span>` : ''}
                        </li>
                    `).join('')}</ul>
                </div>
                ` : ''}
                ${actionItems.length ? `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-list-check"></i> 行动项 (${actionItems.length})</div>
                    <ul class="cb-collab-action-list">${actionItems.map((a, i) => `
                        <li data-idx="${i}">
                            <span class="cb-collab-action-owner">${a.assignedTo || a.assignee || a.owner || 'developer'}</span>
                            ${a.description || a.title || a.content || ''}
                            ${a.priority ? `<span class="cb-collab-action-priority">${a.priority}</span>` : ''}
                            <span class="cb-collab-action-status" id="cb-action-status-${i}"></span>
                        </li>
                    `).join('')}</ul>
                </div>
                <div class="cb-collab-exec-actions">
                    <div class="cb-collab-exec-toolbar">
                        <div class="cb-collab-dir-input-wrap">
                            <i class="fas fa-folder cb-collab-dir-icon"></i>
                            <input type="text" id="cb-collab-output-dir" class="cb-collab-dir-field" placeholder="可选，如 /path/to/project">
                        </div>
                        <button class="cb-btn cb-btn-primary cb-exec-toolbar-btn" id="cb-collab-execute-all">
                            <i class="fas fa-play"></i> 执行全部行动项
                        </button>
                        <button class="cb-btn cb-btn-purple cb-exec-toolbar-btn" id="cb-collab-save-writing">
                            <i class="fas fa-feather-alt"></i> 保存到写作空间
                        </button>
                    </div>
                </div>
                ` : ''}
                ${report ? `
                <div class="cb-collab-card">
                    <div class="cb-collab-card-title"><i class="fas fa-chart-pie"></i> 项目报告</div>
                    <div class="cb-collab-report-text">${JSON.stringify(report.metrics || {}, null, 2).replace(/\n/g, '<br>')}</div>
                </div>
                ` : ''}
                <div class="cb-collab-exec-output" id="cb-collab-exec-output" style="display:none">
                    <div class="cb-collab-card">
                        <div class="cb-collab-card-title"><i class="fas fa-terminal"></i> 执行输出</div>
                        <div class="cb-collab-exec-log" id="cb-collab-exec-log"></div>
                    </div>
                </div>
            `;

            container.querySelector('#cb-collab-execute-all')?.addEventListener('click', () => this._collabExecuteAll());
            container.querySelector('#cb-collab-save-writing')?.addEventListener('click', () => this._collabSaveToWriting());
        }

        async _collabExecuteAll() {
            const taskId = this._collabState.taskId;
            const actionItems = this._collabState.actionItems || [];
            if (!taskId || !actionItems.length) { this._showToast('无可执行的行动项', 'error'); return; }

            const outputDir = this._panelEl?.querySelector('#cb-collab-output-dir')?.value?.trim() || '';
            const btn = this._panelEl?.querySelector('#cb-collab-execute-all');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 创建执行队列…'; }

            const outputArea = this._panelEl?.querySelector('#cb-collab-exec-output');
            const logEl = this._panelEl?.querySelector('#cb-collab-exec-log');
            if (outputArea) outputArea.style.display = 'block';

            const appendLog = (html) => {
                if (!logEl) return;
                logEl.innerHTML += html;
                logEl.scrollTop = logEl.scrollHeight;
            };

            try {
                const dirNote = outputDir ? `\n\n## 项目输出目录\n${outputDir}` : '';
                const tasks = actionItems.map((a, i) => ({
                    title: a.description || a.title || a.content || `任务 ${i + 1}`,
                    description: (a.description || a.content || '') + dirNote,
                    assignedTo: a.assignedTo || a.assignee || 'developer',
                    input: JSON.stringify({ ...(this._collabState.conclusion || {}), outputDir }),
                    expectedOutput: '完成的代码实现',
                    priority: a.priority || 'P1',
                    order: i,
                }));

                appendLog('<div class="cb-exec-log-line cb-exec-info">📦 创建执行队列…</div>');
                const squad = await this._api(`/tasks/${taskId}/squads`, {
                    method: 'POST',
                    body: JSON.stringify({ tasks }),
                });
                if (squad.error) throw new Error(squad.error);

                this._collabState.squadId = squad.id;
                appendLog(`<div class="cb-exec-log-line cb-exec-success">✅ 队列已创建: ${squad.tasks.length} 个任务</div>`);
                if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 执行中…';

                for (let i = 0; i < squad.tasks.length; i++) {
                    const t = squad.tasks[i];
                    const statusEl = this._panelEl?.querySelector(`#cb-action-status-${i}`);
                    if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color:#a78bfa"></i>';

                    const logId = `cb-exec-active-${Date.now()}`;
                    appendLog(`<div class="cb-exec-log-line cb-exec-running" id="${logId}"><span class="cb-exec-pulse"></span> <span class="cb-exec-step-label">[${i + 1}/${squad.tasks.length}]</span> ${t.title} <span class="cb-exec-dots"><span>.</span><span>.</span><span>.</span></span></div>`);

                    try {
                        const result = await this._api(`/squads/${squad.id}/execute/${t.id}`, { method: 'POST' });
                        if (result.error) throw new Error(result.error);

                        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#4ade80"></i>';
                        const activeLine = logEl?.querySelector(`#${logId}`);
                        if (activeLine) { activeLine.className = 'cb-exec-log-line cb-exec-success'; activeLine.innerHTML = `✅ 完成: ${t.title}`; }
                        const preview = (result.output || '').slice(0, 300).replace(/</g, '&lt;');
                        if (preview) appendLog(`<pre class="cb-exec-output-pre">${preview}${result.output?.length > 300 ? '\n...' : ''}</pre>`);
                    } catch (err) {
                        if (statusEl) statusEl.innerHTML = '<i class="fas fa-times-circle" style="color:#f87171"></i>';
                        const activeLine = logEl?.querySelector(`#${logId}`);
                        if (activeLine) { activeLine.className = 'cb-exec-log-line cb-exec-error'; activeLine.innerHTML = `❌ 失败: ${t.title} — ${err.message}`; }
                    }
                }

                appendLog('<div class="cb-exec-log-line cb-exec-success">🎉 所有任务执行完毕</div>');
            } catch (err) {
                appendLog(`<div class="cb-exec-log-line cb-exec-error">❌ 执行失败: ${err.message}</div>`);
                this._showToast(`执行失败: ${err.message}`, 'error');
            } finally {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> 执行全部行动项'; }
            }
        }

        async _collabBackToDiscussion() {
            const taskId = this._collabState.taskId;
            if (!taskId) { this._showToast('无法返回讨论：任务不存在', 'error'); return; }

            this._collabState.conclusion = null;
            this._collabState.actionItems = null;
            this._collabState.squadId = null;

            const reportEl = this._panelEl?.querySelector('#cb-collab-report');
            if (reportEl) reportEl.innerHTML = '';

            const prevMessages = (this._collabMessages || []).filter(m => !m._typing && m.content);
            const prevSummary = prevMessages.length
                ? prevMessages.map(m => {
                    const info = this._getRoleInfo(m.roleId);
                    return `[${info.name}](第${m.round}轮): ${m.content.slice(0, 200)}`;
                  }).join('\n')
                : '';

            const taskData = this._collabState._cachedTaskData;
            const roles = taskData?.rolesInvolved || taskData?.roles || [];
            const baseTopic = this._collabState.topic || '协作讨论';
            const realignRound = (this._collabState._realignCount || 0) + 1;
            this._collabState._realignCount = realignRound;

            try {
                const newTopic = prevSummary
                    ? `${baseTopic}\n\n---\n以下是前一轮讨论的要点，请在此基础上继续讨论（第 ${realignRound} 次重新对齐）：\n${prevSummary}`
                    : `${baseTopic} (第 ${realignRound} 次重新对齐)`;

                const disc = await this._api(`/tasks/${taskId}/discussions`, {
                    method: 'POST',
                    body: JSON.stringify({
                        topic: newTopic,
                        phase: 'discussion',
                        roleIds: roles.length ? roles : ['product', 'architect', 'tech-lead'],
                        maxRounds: 3,
                    }),
                });
                if (disc.error) throw new Error(disc.error);
                this._collabState.discussionId = disc.id;

                const separator = {
                    id: `sep-${Date.now()}`,
                    roleId: '_system',
                    content: `── 第 ${realignRound} 次重新对齐 ──\n前一轮讨论已保留，开始新一轮讨论。请在下方点击「下一轮讨论」输入对齐信息。`,
                    round: 0,
                    _separator: true,
                };
                this._collabMessages.push(separator);
                this._renderCollabDiscussion(this._collabMessages);

                this._collabGoToStep('discussion');

                const wrapEl = this._panelEl?.querySelector('#cb-realign-input-wrap');
                if (wrapEl) {
                    wrapEl.style.display = '';
                    const ta = wrapEl.querySelector('#cb-realign-input');
                    if (ta) { ta.value = ''; ta.focus(); }
                }
                this._collabState._isRealigning = true;

                this._showToast('已返回讨论，请输入对齐调整说明后点击「下一轮讨论」', 'success');
            } catch (err) {
                this._showToast(`返回讨论失败: ${err.message}`, 'error');
            }
        }

        async _collabSaveToWriting() {
            const state = this._collabState;
            const conclusion = state.conclusion;
            if (!conclusion) { this._showToast('无讨论结论可保存', 'warning'); return; }

            const now = new Date();
            const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
            const timeStr = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
            const topic = state.topic || '多角色协作讨论';
            const title = `${topic} — ${dateStr} ${timeStr}`;

            const sections = [];
            sections.push(`> **主题**: ${topic}`);
            sections.push(`> **时间**: ${dateStr} ${timeStr}`);
            sections.push('');

            if (conclusion.summary) {
                sections.push('## 讨论总结', '', conclusion.summary, '');
            }

            const decisions = conclusion.decisions || [];
            if (decisions.length) {
                sections.push('## 关键决策', '');
                decisions.forEach((d, i) => {
                    sections.push(`### ${i + 1}. ${d.topic || d.title || ''}`);
                    sections.push(`**决策**: ${d.decision || d.resolution || d.content || ''}`);
                    if (d.reason) sections.push(`**原因**: ${d.reason}`);
                    sections.push('');
                });
            }

            const actions = conclusion.actionItems || state.actionItems || [];
            if (actions.length) {
                sections.push('## 行动项', '');
                actions.forEach((a, i) => {
                    const owner = a.assignedTo || a.assignee || 'developer';
                    const prio = a.priority ? ` [${a.priority}]` : '';
                    sections.push(`${i + 1}. **${owner}**${prio}: ${a.description || a.title || a.content || ''}`);
                });
                sections.push('');
            }

            if (this._collabMessages.length) {
                sections.push('## 讨论记录', '');
                this._collabMessages.filter(m => !m._typing && m.content).forEach(m => {
                    const info = this._getRoleInfo(m.roleId);
                    sections.push(`### ${info.name} (第${m.round}轮)`);
                    sections.push(m.content);
                    sections.push('');
                });
            }

            const execLog = this._panelEl?.querySelector('#cb-collab-exec-log')?.textContent?.trim();
            if (execLog) {
                sections.push('## 执行输出', '', execLog, '');
            }

            const content = sections.join('\n');

            try {
                if (window.blogManager) {
                    window.blogManager.createPost({
                        title,
                        content,
                        category: 'agent',
                        tags: ['multi-role', 'collaboration', 'discussion'],
                    });
                    this._showToast(`已保存到写作空间: "${title.slice(0, 30)}…"`, 'success');
                } else {
                    const result = await new Promise(r => chrome.storage?.local?.get('blogPosts', r));
                    const posts = result?.blogPosts || [];
                    posts.unshift({
                        id: 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                        title,
                        content,
                        category: 'agent',
                        tags: ['multi-role', 'collaboration', 'discussion'],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        wordCount: content.length,
                        pinned: false,
                    });
                    await new Promise(r => chrome.storage?.local?.set({ blogPosts: posts }, r));
                    this._showToast(`已保存到写作空间: "${title.slice(0, 30)}…"`, 'success');
                }
            } catch (err) {
                this._showToast(`保存失败: ${err.message}`, 'error');
            }
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
